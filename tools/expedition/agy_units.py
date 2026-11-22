r"""Gửi từng unit sang agy (Antigravity CLI) để vẽ tay theo prompts/units/, rồi chuẩn hóa và xuất 1-1.

Mỗi yêu cầu là một phiên `agy -p` mới. Chọn số phiên song song bằng --jobs. Khi AGY hết hạn mức, mặc định
dừng sau đợt đang chạy. Ảnh thô (database-astral-expedition/art-source/agy-units/) được cắt lưới, tách nền magenta, co cả sheet theo
một tỉ lệ chung giữ nguyên vị trí chân, ghi vào art-source/units/...-source.png rồi xuất sang units/.
Trạng thái lưu ở tmp/agy-units/state.json nên chạy lại sẽ tiếp tục từ chỗ dừng.

  py tools/expedition/agy_units.py run --jobs 3              # bosses -> heroes -> gatekeepers -> monsters -> animals
  py tools/expedition/agy_units.py run --only vulcan_titan --sheets battle
  py tools/expedition/agy_units.py status
  py tools/expedition/agy_units.py normalize vulcan_titan battle   # chỉ chuẩn hóa lại ảnh thô đã có
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
for _p in (os.path.join(HERE, "..", "units", ".pydeps"), os.path.join(HERE, "..", "units"), os.path.join(HERE, "..", "gen3"), HERE):
    _p = os.path.abspath(_p)
    if os.path.isdir(_p) and _p not in sys.path:
        sys.path.insert(0, _p)

from PIL import Image  # noqa: E402

from art_source import export_one, save_source, update_manifest  # noqa: E402
from normalize_sheet import find_components  # noqa: E402
from roster import ALL_UNITS, UNITS_BY_ID  # noqa: E402

WORK = os.path.join(REPO, "tmp", "agy-units")
RAW = os.path.join(REPO, "database-astral-expedition", "art-source", "agy-units")
LOGS = os.path.join(WORK, "logs")
STATE = os.path.join(WORK, "state.json")
AGY = os.environ.get("ASTRAL_AGY_BIN", "agy")
ORDER = ("bosses", "heroes", "gatekeepers", "monsters", "animals")
LIMIT = re.compile(r"429|RESOURCE_EXHAUSTED|quota|rate.?limit|try again (after|later)|UNAVAILABLE|No capacity available|code 503", re.I)
CMDS = ("python", "py", "python3", "powershell", "pwsh", "cmd", "copy", "cp", "move", "mv", "mkdir", "dir", "ls",
        "Copy-Item", "Move-Item", "New-Item", "Get-ChildItem", "Test-Path")
HOME_AGY = os.path.join(os.path.expanduser("~"), ".gemini")


def settings():
    dirs = (REPO, HOME_AGY, os.environ.get("TEMP", ""))
    allow = [f"command({c})" for c in CMDS]
    allow += [f"{t}({d})" for t in ("read_file", "write_file") for d in dirs if d]
    return json.dumps({"permissions": {"allow": allow}})


def layout(u, sheet):
    cat = u["category"]
    if sheet == "battle":
        cell = 256 if cat == "bosses" else 192
        rows = 6 if cat in ("heroes", "bosses") else 4
    else:
        cell, rows = 64, (8 if cat == "heroes" else 4)
    return cell, 6, rows


def request_text(u, sheet, raw):
    cat, uid = u["category"], u["id"]
    with open(os.path.join(REPO, "prompts", "units", cat, f"{uid}.md"), encoding="utf-8") as f:
        pack = f.read()
    cell, cols, rows = layout(u, sheet)
    def ref(prefix):
        return [os.path.join(REPO, "database-astral-expedition", *line.split("`")[1].split("/")[1:])
                for line in pack.splitlines() if line.startswith(prefix) and "`" in line]
    refs = ref(("1. FIRST", "2. SECOND"))
    extra = ref("4. FOURTH")
    orient = os.path.join(REPO, "prompts", "battle", "orientation-back.png" if cat == "heroes" else "orientation-front.png")
    if sheet == "movement":
        refs = [os.path.join(REPO, "database-astral-expedition", "art-source", "motion", "gustave-movement-source.png"),
                os.path.join(REPO, "database-astral-expedition", "art-source", "units", cat, f"{uid}-movement-source.png")]
    else:
        refs += [orient] + extra       # keep FIRST, SECOND, THIRD (orientation), FOURTH as numbered in the prompt
    section = "## Prompt · battle" if sheet == "battle" else "## Prompt · movement"
    block = pack.split(section, 1)[1].split("```text", 1)[1].split("```", 1)[0].strip()
    return (
        "Bạn là họa sĩ pixel art. Nhiệm vụ: vẽ ĐÚNG MỘT ảnh sprite sheet bằng công cụ tạo ảnh (image generation) của bạn.\n"
        f"Ảnh tham chiếu (đính kèm theo đúng thứ tự, đọc file trực tiếp):\n" +
        "".join(f"{i + 1}. {p}\n" for i, p in enumerate(refs) if os.path.isfile(p)) +
        f"\nYêu cầu bố cục: {cols} cột × {rows} hàng ô vuông bằng nhau, nền phẳng #FF00FF.\n"
        f"PROMPT:\n{block}\n\n"
        f"Lưu ảnh kết quả dạng PNG vào đúng đường dẫn: {raw}\n"
        "Không sửa, không xóa bất kỳ file nào khác trong repo. Không chạy lệnh nào ngoài việc lưu / sao chép ảnh đó. "
        "Khi file đã được lưu, trả lời đúng một dòng: DONE <đường dẫn>. Nếu công cụ tạo ảnh báo hết hạn mức, trả lời: LIMIT <thông báo>."
    )


# ---------------------------------------------------------------- normalize a raw drawing onto the game grid


def _key(p):
    r, g, b = p[:3]
    return (r > 170 and b > 170 and g < 120) or (r > 200 and b > 200 and g < 160 and abs(r - b) < 60)


def movement_cells(keyed, cols, rows):
    """Find the main body in each slot even when the draft has unequal row spacing."""
    components = sorted(find_components(keyed), key=lambda part: part["area"], reverse=True)
    count = cols * rows
    if len(components) < count:
        raise ValueError(f"expected {count} separate movement poses, found {len(components)}")
    by_height = sorted(components[:count], key=lambda part: part["cy"])
    cw = keyed.width / cols
    ch = keyed.height / rows
    boxes = {}
    for row in range(rows):
        band = sorted(by_height[row*cols:(row+1)*cols], key=lambda part: part["cx"])
        if max(p["cy"] for p in band) - min(p["cy"] for p in band) > ch * .45:
            raise ValueError(f"ambiguous movement row {row+1}")
        for col, part in enumerate(band):
            if abs(part["cx"] - (col+.5)*cw) > cw*.48:
                raise ValueError(f"ambiguous movement pose {row+1},{col+1}")
            x0,y0,x1,y1 = part["bbox"]
            sub = Image.new("RGBA",(x1-x0,y1-y0))
            for x,y in part["pts"]:
                sub.putpixel((x-x0,y-y0),keyed.getpixel((x,y)))
            # Local bbox puts each pose on a shared baseline after resize.
            boxes[(row, col)] = (sub, sub.getbbox())
    return boxes


def normalize_raw(raw_path, cell, cols, rows, *, align_rows=False, clean_fragments=False):
    """Cut the raw sheet into cols x rows, key the magenta background, scale every cell by ONE factor so the tallest
    / widest pose fits 90 % of the target cell, keep each pose's offset from the idle baseline, binary alpha."""
    src = Image.open(raw_path).convert("RGBA")
    if src.width > cols * cell * 2:   # ImageGen sheets are ~2-4x the target: work at 2x (4x faster keying)
        k = cols * cell * 2 / src.width
        src = src.resize((cols * cell * 2, max(rows, round(src.height * k))), Image.NEAREST)
    W, H = src.size
    cw, ch = W / cols, H / rows
    # background = dominant colour on the image border (#FF00FF, or #00FF00 for purple characters)
    px = src.load()
    border = {}
    for x in range(0, W, 3):
        for y in (0, 1, H - 2, H - 1):
            k = tuple(v // 16 for v in px[x, y][:3])
            border[k] = border.get(k, 0) + 1
    bk = max(border, key=border.get)
    bg = tuple(v * 16 + 8 for v in bk)

    def is_bg(p):
        if p[3] < 128 or _key(p):
            return True
        return sum((a - b) ** 2 for a, b in zip(p[:3], bg)) < 90 ** 2 and max(p[:3]) - min(p[:3]) > 120

    keyed = Image.new("RGBA", src.size)
    keyed.putdata([(0, 0, 0, 0) if is_bg(p) else p for p in src.getdata()])
    # despill: edge pixels still tinted toward the key colour are dropped (two passes)
    kp = keyed.load()
    for _ in range(2):
        drop = []
        for y in range(1, H - 1):
            for x in range(1, W - 1):
                p = kp[x, y]
                if p[3] and (kp[x - 1, y][3] == 0 or kp[x + 1, y][3] == 0 or kp[x, y - 1][3] == 0 or kp[x, y + 1][3] == 0):
                    r_, g_, b_ = p[:3]
                    tinted = (bg[0] > 128 and bg[2] > 128 and bg[1] < 128 and r_ > g_ + 35 and b_ > g_ + 35 and abs(r_ - b_) < 70) or \
                             (bg[1] > 128 and bg[0] < 128 and g_ > r_ + 35 and g_ > b_ + 35)
                    if tinted or sum((a - b) ** 2 for a, b in zip(p[:3], bg)) < 150 ** 2:
                        drop.append((x, y))
        for x, y in drop:
            kp[x, y] = (0, 0, 0, 0)
    boxes = {}
    if align_rows:
        boxes = movement_cells(keyed, cols, rows)
    for r in range(0 if align_rows else rows):
        for c in range(cols):
            box = (round(c*cw), round(r*ch), round((c+1)*cw), round((r+1)*ch))
            sub = keyed.crop(box)
            if clean_fragments:
                components = find_components(sub)
                if components:
                    largest = max(components, key=lambda component: component["area"])
                    x0, y0, x1, y1 = largest["bbox"]
                    area_threshold = max(5, round(largest["area"] * .007))
                    clean = Image.new("RGBA", sub.size)
                    for component in components:
                        a,b,d,e = component["bbox"]
                        gap = max(a-x1, x0-d, b-y1, y0-e, 0)
                        if component["area"] >= area_threshold and gap <= 5:
                            for x,y in component["pts"]:
                                clean.putpixel((x,y),sub.getpixel((x,y)))
                    sub = clean
            bb = sub.getbbox()
            boxes[(r, c)] = (sub, bb)
    valid = [bb for _, bb in boxes.values() if bb]
    if not valid:
        raise ValueError("empty drawing")
    max_h = max(b[3] - b[1] for b in valid)
    max_w = max(b[2] - b[0] for b in valid)
    s = min(0.90 * cell / max_h, 0.94 * cell / max_w)
    idle = [bb for (r, _), (_, bb) in boxes.items() if r == 0 and bb] or valid
    base_raw = sorted(b[3] for b in idle)[len(idle) // 2]          # median idle foot line
    base_t = round(cell * 0.86) if cell > 64 else 58
    out = Image.new("RGBA", (cell * cols, cell * rows), (0, 0, 0, 0))
    for (r, c), (sub, bb) in boxes.items():
        if not bb:
            continue
        piece = sub.crop(bb)
        nw, nh = max(1, round(piece.width * s)), max(1, round(piece.height * s))
        piece = piece.resize((nw, nh), Image.LANCZOS)
        piece.putdata([(p[0], p[1], p[2], 255) if p[3] >= 128 else (0, 0, 0, 0) for p in piece.getdata()])
        cx_raw = 0 if align_rows else (bb[0] + bb[2]) / 2 - cw / 2
        x = round(c * cell + cell / 2 + cx_raw * s - nw / 2)
        y = round(r * cell + base_t - (0 if align_rows else (base_raw - bb[3])*s) - nh)
        x = max(c * cell + 1, min(x, (c + 1) * cell - nw - 1))
        y = max(r * cell + 1, min(y, (r + 1) * cell - nh - 1))
        out.alpha_composite(piece, (x, y))
    return out


def publish(uid, sheet, raw=None):
    u = UNITS_BY_ID[uid]
    cell, cols, rows = layout(u, sheet)
    if raw is None:
        candidates = [
            os.path.join(RAW, name) for name in os.listdir(RAW)
            if name.startswith(f"{uid}-{sheet}-") and name.endswith(".png")
        ] if os.path.isdir(RAW) else []
        raw = max(candidates, key=os.path.getmtime) if candidates else os.path.join(WORK, "raw", f"{uid}-{sheet}.png")
    img = normalize_raw(raw, cell, cols, rows)
    for row in range(rows):
        for col in range(cols):
            box = (col * cell, row * cell, (col + 1) * cell, (row + 1) * cell)
            if not img.crop(box).getbbox():
                raise ValueError(f"empty frame row {row + 1}, column {col + 1}")
    rel = f"units/{u['category']}/{uid}-{sheet}.png"
    save_source(rel, img)
    export_one(rel, img.size)
    update_manifest([rel])
    return rel


# ---------------------------------------------------------------- queue


def load_state():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(st):
    os.makedirs(WORK, exist_ok=True)
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, indent=1)


def jobs(only, sheets, categories=ORDER):
    units = sorted((u for u in ALL_UNITS if u["category"] in categories), key=lambda u: list(categories).index(u["category"]))
    for u in units:
        if only and u["id"] not in only:
            continue
        if u.get("art") and not only:
            continue        # already hand-drawn in art-source/motion
        for sh in sheets:
            if sh == "movement" and u["category"] == "bosses":
                continue
            yield u, sh


def run_one(u, sheet, timeout_min):
    key = f"{u['id']}-{sheet}"
    os.makedirs(RAW, exist_ok=True)
    os.makedirs(LOGS, exist_ok=True)
    run_id = str(time.time_ns())
    raw = os.path.join(RAW, f"{key}-{run_id}.png")
    log = os.path.join(LOGS, f"{key}-{run_id}.log")
    text = request_text(u, sheet, raw)
    with open(log, "w", encoding="utf-8") as lf:
        lf.write(text + "\n\n---- agy ----\n")
        lf.flush()
        try:
            subprocess.run([AGY, "--sandbox", "-p", text, "--settings", settings(), "--print-timeout", f"{timeout_min * 60}s"],
                           cwd=REPO, stdout=lf, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, timeout=timeout_min * 60 + 120)
        except subprocess.TimeoutExpired:
            lf.write("\n[runner] timeout\n")
    with open(log, encoding="utf-8", errors="replace") as lf:
        out = lf.read().split("---- agy ----", 1)[-1]
    if os.path.isfile(raw):
        return "drawn", log, raw
    if LIMIT.search(out):
        return "limit", log, None
    return "failed", log, None


def cmd_run(args):
    st = load_state()
    only = set(args.only.split(",")) if args.only else set()
    sheets = args.sheets.split(",")
    cats = tuple(args.categories.split(","))
    todo = [(u, sh) for u, sh in jobs(only, sheets, cats) if st.get(f"{u['id']}-{sh}", {}).get("status") != "done" or only]
    print(f"{len(todo)} request(s) queued", flush=True)
    if args.jobs < 1:
        raise ValueError("--jobs must be at least 1")
    with ThreadPoolExecutor(max_workers=args.jobs) as executor:
        for offset in range(0, len(todo), args.jobs):
            pending = todo[offset:offset + args.jobs]
            for attempt in range(1, args.retries + 1):
                retry = []
                quota_hit = False
                futures = [(u, sh, executor.submit(run_one, u, sh, args.timeout)) for u, sh in pending]
                for u, sh, future in futures:
                    key = f"{u['id']}-{sh}"
                    try:
                        status, log, raw = future.result()
                    except (OSError, ValueError, IndexError) as error:
                        st[key] = {"status": "failed", "error": str(error)}
                        print(f"{key}: {error}", flush=True)
                        continue
                    st[key] = {"status": status, "log": log}
                    print(f"{key} attempt {attempt}: {status} ({os.path.relpath(log, REPO)})", flush=True)
                    if status == "drawn":
                        try:
                            rel = publish(u["id"], sh, raw)
                            st[key].update(status="done", target=rel, raw=raw)
                        except (OSError, ValueError) as error:
                            st[key].update(status="normalize-failed", error=str(error), raw=raw)
                            print(f"           normalize failed: {error}", flush=True)
                    else:
                        quota_hit |= status == "limit"
                        retry.append((u, sh))
                    save_state(st)
                if not retry:
                    break
                if quota_hit:
                    if not args.wait or attempt == args.retries:
                        print("Stopped due to AGY quota. Remaining sheets can resume on the next run.", flush=True)
                        return 1
                    print(f"Waiting {args.wait} min after AGY quota response.", flush=True)
                    time.sleep(args.wait * 60)
                pending = retry
            save_state(st)
    done = sum(1 for v in st.values() if v.get("status") == "done")
    print(f"finished: {done} sheet(s) done in total", flush=True)
    return int(any(st.get(f"{u['id']}-{sheet}", {}).get("status") != "done" for u, sheet in todo))


def cmd_status(_args):
    st = load_state()
    for k, v in sorted(st.items()):
        print(f"{k:40s} {v['status']}")
    print(f"{sum(1 for v in st.values() if v['status'] == 'done')} done / {len(st)} tried")


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    r = sp.add_parser("run")
    r.add_argument("--only", default="")
    r.add_argument("--sheets", default="battle,movement")
    r.add_argument("--categories", default=",".join(ORDER), help="draw order, e.g. bosses,monsters,animals")
    r.add_argument("--timeout", type=int, default=25, help="minutes per agy request")
    r.add_argument("--retries", type=int, default=3)
    r.add_argument("--jobs", type=int, default=1, help="parallel AGY drawings with serial publication")
    r.add_argument("--wait", type=int, default=0, help="minutes to wait after quota or rate limiting, 0 stops")
    sp.add_parser("status")
    n = sp.add_parser("normalize")
    n.add_argument("unit")
    n.add_argument("sheet", choices=("battle", "movement"))
    args = ap.parse_args()
    if args.cmd == "run":
        return cmd_run(args)
    elif args.cmd == "status":
        cmd_status(args)
    else:
        print(publish(args.unit, args.sheet))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
