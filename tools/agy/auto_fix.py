#!/usr/bin/env python3
"""
Review a new / updated sheet and, when something required is missing or wrong, ask agy to fix it (non-interactive
`agy -p`, in the background). At most MAX_TRIES automatic requests per sheet, logged in tmp/agy-requests/.

  battle sheet   -> tools/units/check_battle.py: both views (front = opponent
                    top-right facing lower-left, back = player bottom-left facing upper-right), attack toward the foe,
                    hurt, dodge sideways, faint lying; FAIL -> redraw only the failing image(s)
  movement sheet -> loop_check.py (every loop really moves, no duplicated frames); REDO -> redraw those loops

usage: python3 tools/agy/auto_fix.py <path to <slug>-battle.png | <slug>-movement.png> [--dry-run]
prints one summary line: OK / SENT (+ log path) / GAVE UP / DRY-RUN
"""
import json
import os
import re
import subprocess
import sys
import time

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
AGY_PY = os.environ.get("MONS_AGY_PY") or "/snap/antigravity-cli/24/usr/bin/python3.14"     # $MONS_AGY_PY: agy's Python
PY = AGY_PY if os.path.exists(AGY_PY) else sys.executable
LOG_DIR = os.path.join(REPO, "tmp", "agy-requests")
MAX_TRIES = 2


def run(*cmd):
    p = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True)
    return p.returncode, (p.stdout + p.stderr).strip()


def species_of(path):
    folder = os.path.dirname(os.path.abspath(path))
    gen, base = os.path.basename(os.path.dirname(folder)), os.path.basename(folder)
    name = base.split("-", 1)[1]
    return name, f"{gen}/{base}"


def locomotion(name):
    d = json.load(open(os.path.join(REPO, "data", "units", "pokemon-locomotion.json")))["units"]
    n = name.replace("-", " ").lower()
    for p in d:
        if p["name"].lower().replace("-", " ") == n:
            return p["locomotion"]
    return "walk"


ROW_HINT = {
    "attack": "hàng ATTACK: lấy đà rồi vươn / lao hẳn về phía đối thủ, khung 4 là đòn đánh to nhất",
    "hurt": "hàng HURT: giật mình, bị đẩy lùi ra xa đối thủ, nhăn mặt, rồi hồi lại",
    "dodge": "hàng DODGE: cả thân DỊCH HẲN sang một bên khoảng 1/4 ô ở khung 3-4 rồi quay về",
    "faint": "hàng FAINT: loạng choạng, khuỵu, ngã, khung 5-6 NẰM hẳn trên đất",
}


def plan_units(out):
    """check_battle output -> the smallest parts to redraw: [{what: view|row|cell, view, row, frame, why}]"""
    units, whole = [], set()
    for line in out.splitlines():
        m = re.match(r"\s*\[(front|back)\] (.*)", line)
        if not m:
            continue
        v, msg = m.group(1), m.group(2)
        low = msg.lower()
        cell_msg = low.startswith(("broken frames", "frames turned"))
        if not cell_msg and any(k in low for k in ("tiny", "much smaller", "view missing", "wrong sheet size", "stance")):
            whole.add(v); units.append({"what": "view", "view": v, "why": msg[:90]}); continue
        cells = re.findall(r"(attack|hurt|dodge|faint) (\d)", low) if ("broken frames" in low or "wrong side" in low) else []
        for row, fr in cells:
            units.append({"what": "cell", "view": v, "row": row, "frame": int(fr), "why": msg.split(":")[0][:60]})
        for row in ("attack", "hurt", "dodge", "faint"):
            if low.startswith(row) or f"{row}:" in low.split(" ")[0]:
                units.append({"what": "row", "view": v, "row": row, "why": msg[:90]})
    # merge: whole view wins; 3+ cells of a row -> the row; 3+ rows of a view -> the whole view
    out_units = [u for u in units if u["what"] == "view"]
    for v in ("front", "back"):
        if v in whole:
            continue
        rows = {}
        for u in units:
            if u["view"] == v and u["what"] in ("row", "cell"):
                rows.setdefault(u["row"], []).append(u)
        row_level = [r for r, us in rows.items() if any(u["what"] == "row" for u in us) or len({u["frame"] for u in us}) >= 3]
        if len(row_level) >= 3:                       # single wrong cells are cheap edits: only whole rows count here
            out_units.append({"what": "view", "view": v, "why": f"{len(row_level)} rows wrong"}); continue
        for row, us in rows.items():
            if any(u["what"] == "row" for u in us) or len({u["frame"] for u in us}) >= 3:
                out_units.append({"what": "row", "view": v, "row": row, "why": "; ".join(sorted({u["why"] for u in us}))[:90]})
            else:
                for fr in sorted({u["frame"] for u in us}):
                    out_units.append({"what": "cell", "view": v, "row": row, "frame": fr, "why": us[0]["why"]})
    return out_units


def agy_busy(name):
    """an agy run (headless request or any agy process whose command line names the species) is still working: agy
    checks and fixes its own drawings before it stops, so a sheet written mid-run is not the final result"""
    try:
        out = subprocess.run(["pgrep", "-af", "agy"], capture_output=True, text=True).stdout
    except OSError:
        return False
    return any(("agy -p" in l or "agy_pack" in l or "battle_pack" in l) and name.lower() in l.lower()
               for l in out.splitlines() if "pgrep" not in l)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    path = os.path.abspath(args[0])
    dry = "--dry-run" in sys.argv
    rel = os.path.relpath(path, REPO)
    name, species = species_of(path)
    if agy_busy(name) and "--force" not in sys.argv:
        print(f"WAIT {rel}: agy is still working on {name} (it checks and fixes its own result); reviewing when it stops")
        return
    slug = os.path.basename(path).rsplit("-", 1)[0]
    kind = "battle" if path.endswith("-battle.png") else "movement"
    if kind == "battle":
        code, out = run(PY, "tools/units/check_battle.py", path)
        if code == 0:
            print(f"OK {rel}: {out.split(': ', 1)[-1]}")
            return
        problems = "\n".join(l.strip() for l in out.splitlines()[1:] if l.strip().startswith("["))
        units = plan_units(out)                        # what to redraw: cells, rows or whole images
        angle = ("FRONT = đối thủ ở góc trên phải, xoay 3/4 về DƯỚI TRÁI (không bao giờ quay lưng lại); BACK = phe ta ở góc dưới "
                 "trái nhìn về TRÊN PHẢI, cùng đường chéo nhưng ngược chiều với đối thủ: thấy LƯNG + sườn phải + MẶT NGHIÊNG (như "
                 "prompts/battle/orientation-<view>.png; Gen 3: đối thủ như Latios, phe ta như Scizor). Mọi khung là DÁNG CHIẾN ĐẤU "
                 "(căng, chồm về phía đối thủ, móng / cánh giơ lên), không phải dáng idle. Tỉ lệ và màu đúng như "
                 f"`{os.path.relpath(os.path.join(os.path.dirname(path), slug + '-reference.jpg'), REPO)}`.")
        steps = []
        for u in units:
            if u["what"] == "view":
                steps.append(f"- Vẽ lại CẢ ảnh {u['view'].upper()} ({u['why']}): `python3 tools/agy/battle_pack.py --name {name} "
                             f"--species {species} --views {u['view']}`, generate_image theo gói, normalize với --keep-x, "
                             f"`python3 tools/agy/assemble_battle.py --species {species} --{u['view']} /tmp/mons-refs/{slug}-battle-{u['view']}.png`.")
            else:
                sel = f"--view {u['view']} --row {u['row']}" + (f" --frame {u['frame']}" if u.get("frame") else "")
                part = f"{u['view']}-{u['row']}" + (f"-f{u['frame']}" if u.get("frame") else "")
                what = (f"ô {u['row'].upper()} khung {u['frame']}" if u.get("frame") else f"hàng {u['row'].upper()} (6 khung)")
                steps.append(f"- Sửa {what} của ảnh {u['view'].upper()} ({u['why']}): `python3 tools/agy/cell_fix.py extract {slug} {sel}` "
                             f"→ `tmp/fix/{slug}-{part}.png`; ONE generate_image SỬA ảnh đó (đính kèm nó + reference + "
                             f"prompts/battle/orientation-{u['view']}.png; giữ nguyên bố cục {'lưới 3x2, 6 khung' if not u.get('frame') else '1 khung'}, "
                             f"nền #FF00FF; {ROW_HINT.get(u['row'], '')}), lưu `/tmp/mons-refs/{slug}-fix-{part}.png`, rồi "
                             f"`python3 tools/agy/cell_fix.py put {slug} {sel} --input /tmp/mons-refs/{slug}-fix-{part}.png`.")
        request = (
            f"Dùng skill expedition-battle-poses cho {name} (--species {species}). Sheet `{rel}` chưa đạt kiểm tra tự động:\n"
            f"{problems}\n"
            f"Chỉ sửa đúng phần lỗi (ô sai thì sửa ô, hàng sai thì sửa hàng, cả ảnh sai mới vẽ lại cả ảnh):\n" + "\n".join(steps) +
            f"\nBắt buộc: {angle}\nCuối cùng `python3 tools/units/check_battle.py {slug}` phải ra PASS, "
            f"`python3 tools/agy/compare_reference.py {slug}` và tự so với artwork. Lưu ảnh gốc vào tmp/raw/.")
    else:
        code, out = run(PY, "tools/units/loop_check.py", "--sheet", path)
        if code == 0:
            print(f"OK {rel}: " + " / ".join(l.split()[1] + " ok" for l in out.splitlines() if l.startswith("OK")))
            return
        bad = [l for l in out.splitlines() if re.match(r"^REDO (idle|walk|run|fly)\b", l)]
        loops = [l.split()[1] for l in bad]
        problems = "\n".join(bad)
        request = (
            f"Dùng skill expedition-sprite-generator cho {name} (--species {species}). Sheet `{rel}` có vòng gần như đứng yên / khung trùng:\n"
            f"{problems}\n"
            f"Chỉ vẽ lại các vòng: {', '.join(loops)} (giữ các vòng khác): `python3 tools/agy/agy_pack.py --name {name} --slug3d {slug} "
            f"--locomotion {locomotion(name)} --species {species} --only {','.join(loops)}`, làm theo gói (dáng lấy từ ảnh 3D, mỗi khung "
            f"khác nhau; ảnh FOURTH chỉ để giữ thiết kế), chạy loop_check.py cho từng vòng phải ra OK, rồi ghép lại.")
    os.makedirs(LOG_DIR, exist_ok=True)
    tries_f = os.path.join(LOG_DIR, "attempts.json")
    tries = json.load(open(tries_f)) if os.path.isfile(tries_f) else {}
    n = tries.get(rel, 0)
    if n >= MAX_TRIES:
        print(f"GAVE UP {rel}: still failing after {n} automatic requests — needs a person:\n{problems}")
        return
    if dry:
        print(f"DRY-RUN {rel}: would send request #{n + 1}:\n{request}")
        return
    tries[rel] = n + 1
    json.dump(tries, open(tries_f, "w"), indent=1)
    # one agy session at a time through the queue (it also waits out image-model rate limits)
    r = subprocess.run([sys.executable, os.path.join(REPO, "tools", "agy", "agy_queue.py"), "add", f"{slug}-{kind}-fix{n + 1}", request],
                       capture_output=True, text=True)
    log = os.path.join(LOG_DIR, "queue.json")
    print(f"QUEUED {rel} (request #{n + 1}/{MAX_TRIES}) -> {r.stdout.strip()}\n{problems}")


if __name__ == "__main__":
    main()
