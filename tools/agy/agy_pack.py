"""Write a ready-to-send agy prompt pack (movement v3) that uses a 3D model's motion.

For every loop (or only the ones passed with --only) it prepares, inside the repo (agy's snap cannot see the host /tmp):
  tmp/prompts/<name>-style-<loop>.png       SECOND image: the same loop of the example sheet (Jumpluff / Marill)
  tmp/prompts/<slug3d>-pose-<loop>.png      THIRD image: pose guide from the 3D sheets (<slug3d>), poses only
  FOURTH image (2nd loop on): the species' first loop already drawn (kept or just drawn) = design lock
  tmp/prompts/<name>-keep-<loop>.png        loops NOT redrawn, cut from the current movement sheet (with --only)
  tmp/prompts/<name>-movement-<tag>.md      the pack: attachments, full prompt per loop, normalize + assemble commands
Extra per-loop prompt lines (e.g. how the run must differ from the walk) come from --note LOOP="text".

usage (repo root, a Python with Pillow + the snap python for the skill scripts):
  python tools/agy/agy_pack.py --name Charizard --slug3d charizard --locomotion walk_fly \
      --species Gen1-Kanto/006-Charizard [--only run] [--note run="..."] [--frames 6]
"""
import argparse, importlib, json, os, re, subprocess, sys
try:
    import PIL  # noqa: F401
except ImportError:  # agy's Python: use the Pillow build shipped with the sprite skill
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "../pokemon/.pydeps"))

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "../.."))
S = "tools/units"
SKILL_PY = os.environ.get("MONS_AGY_PY") or ("/snap/antigravity-cli/24/usr/bin/python3.14" if os.path.exists("/snap/antigravity-cli/24/usr/bin/python3.14") else sys.executable)   # $MONS_AGY_PY: agy's Python
sys.path.insert(0, HERE)


def run(*cmd):
    r = subprocess.run(list(cmd), cwd=REPO, capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr.strip() or r.stdout.strip())
    return r.stdout.strip()


def loop_block(block, loop, n):
    """the LOOP block for one loop: keep only that loop's "<LOOP> = <name>:" paragraph"""
    out, keep = [], True
    for line in block.splitlines():
        if line.startswith("<LOOP> = "):
            keep = line.startswith(f"<LOOP> = {loop}:")
            if keep:
                line = f"This is the {loop.upper()} loop:" + line.split(":", 1)[1]
        if keep:
            out.append(line)
    return "\n".join(out).replace("<LOOP>", loop).replace("<N>", str(n)).strip()



def species_notes(slug, kind):
    """drawing notes of a species from data/pokemon/pokemon-notes.json (kind: movement / battle)"""
    import json as _json
    p = os.path.join(REPO, "data", "units", "pokemon-notes.json")
    if not os.path.isfile(p):
        return ""
    v = _json.load(open(p, encoding="utf-8")).get(slug.lower())
    if not v:
        return ""
    if isinstance(v, str):
        return v
    return " ".join(x for x in (v.get("auto", ""), v.get("all", ""), v.get(kind, "")) if x)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True); ap.add_argument("--slug3d", required=True)
    ap.add_argument("--locomotion", required=True, choices=["walk", "walk_fly", "fly"])
    ap.add_argument("--species", required=True, help="Pokemon sub-path, e.g. Gen1-Kanto/006-Charizard")
    ap.add_argument("--only", default="", help="comma list of loops to redraw; the others are kept from the current sheet")
    ap.add_argument("--note", action="append", default=[], help='LOOP="extra prompt text"')
    ap.add_argument("--frames", type=int, default=6)
    ap.add_argument("--with-run", action="store_true", help="also draw the optional run loop")
    a = ap.parse_args()
    name = a.name.lower()
    os.makedirs(os.path.join(REPO, "tmp/prompts"), exist_ok=True)
    loops = run(SKILL_PY, f"{S}/pose_guide.py", "--slug", a.slug3d, "--locomotion", a.locomotion, "--plan",
                *(["--with-run"] if a.with_run else [])).split()
    redo = [l for l in loops if not a.only or l in a.only.split(",")]
    keep = [l for l in loops if l not in redo]
    notes = {}
    for n in a.note:
        k, v = n.split("=", 1); notes[k] = v
    sp_note = species_notes(name, "movement")         # data/pokemon/pokemon-notes.json: added to every loop
    if sp_note:
        for l in loops:
            notes[l] = (sp_note + " " + notes.get(l, "")).strip()
    sheet = os.path.join(REPO, "assets", "units", a.species, f"{name}-movement.png")
    if keep:  # cut the kept loops out of the current v3 sheet
        from PIL import Image
        src = Image.open(sheet)
        meta = json.loads(src.text.get("mons-loops", "[]"))
        x = 0
        cut = {}
        for l in meta:
            cut[l["mode"]] = (x, l["frames"]); x += l["frames"]
        src = src.convert("RGB")
        for l in keep:
            if l not in cut:
                sys.exit(f"--only: the current sheet has no '{l}' loop to keep ({sheet}); redraw it too")
            x0, n = cut[l]
            src.crop((x0 * 192, 0, (x0 + n) * 192, 768)).save(os.path.join(REPO, f"tmp/prompts/{name}-keep-{l}.png"))
    for l in redo:
        run(SKILL_PY, f"{S}/style_example.py", "--locomotion", a.locomotion, "--loop", l, "--out", f"tmp/prompts/{name}-style-{l}.png")
        run(SKILL_PY, f"{S}/pose_guide.py", "--slug", a.slug3d, "--locomotion", a.locomotion, "--mode", l,
            "--frames", str(a.frames), "--out", f"tmp/prompts/{a.slug3d}-pose-{l}.png")
    txt = open(os.path.join(REPO, "prompts/movement/README.md"), encoding="utf-8").read()
    blocks = re.findall(r"```[a-z]*\n(.*?)\n```", txt, re.S)
    loopb = [b for b in blocks if b.startswith("LAYOUT: <N> columns")][0]
    common = [b for b in blocks if b.startswith("Pixel art sprite sheet")][0].strip()
    ratio = "3:2" if a.frames == 6 else "16:9"
    tag = "redo-" + "-".join(redo) if keep else "v3-3d"
    md = [f"# {a.name} — movement v3 theo model 3D `{a.slug3d}` — vẽ: {', '.join(redo)}"
          + (f" · giữ nguyên: {', '.join(keep)}" if keep else "") + "\n\n",
          f"Mỗi vòng: 1 lần `generate_image`, tỉ lệ **{ratio}**, {a.frames} khung × 4 hướng.\n\n",
          f"Bước 0: `bash {S}/fetch_reference.sh \"{a.name}\"`\n"]
    # design lock: every loop after the first gets the first loop (kept, or drawn earlier in this pack) as FOURTH image
    first = loops[0]
    lock = (f"tmp/prompts/{name}-keep-{first}.png" if first in keep else f"/tmp/mons-refs/{name}-{first}.png")
    for l in redo:
        lb = loop_block(loopb, l, a.frames)
        fourth = (f"4. FOURTH `{lock}`  (CÙNG con này đã vẽ ở vòng `{first}`: chép THIẾT KẾ, KHÔNG chép dáng — dáng lấy từ THIRD, mỗi khung khác nhau)\n"
                  if l != first else "")
        extra = ("\n" + notes[l].strip()) if l in notes else ""
        md.append(f"""
## Vòng `{l}`

Đính kèm đúng thứ tự:
1. FIRST  `/tmp/mons-refs/{name}-reference.jpg`
2. SECOND `tmp/prompts/{name}-style-{l}.png`  (sheet mẫu, chỉ lấy bố cục + nét vẽ)
3. THIRD  `tmp/prompts/{a.slug3d}-pose-{l}.png`  (mẫu dáng 3D: CHỈ lấy dáng, không lấy hình khối / màu)
{fourth}
Prompt:
```
{common}

{lb}{extra}
```

Sau khi có ảnh: lưu `/tmp/mons-refs/{name}-raw-{l}.jpg` VÀ một bản trong repo `tmp/raw/{name}-raw-{l}.jpg` (để review), rồi
`python3 {S}/normalize_sheet.py --mode move4 --layout loop --frames {a.frames}{' --air' if l == 'fly' or (l == 'idle' and a.locomotion == 'fly') else ''} --input /tmp/mons-refs/{name}-raw-{l}.jpg --output /tmp/mons-refs/{name}-{l}.png`
Kiểm tra chuyển động (bắt buộc): `python3 {S}/loop_check.py --loop {l} /tmp/mons-refs/{name}-{l}.png` → `REDO` (các khung gần như giống nhau / có cặp khung trùng) thì vẽ lại vòng này trước khi làm vòng tiếp theo.
Kiểm tra: hàng 2 quay TRÁI, hàng 3 quay PHẢI (ngược: thêm `--row-order 1,3,2,4`).
""")
    parts = " ".join(f"{l}=" + (f"tmp/prompts/{name}-keep-{l}.png" if l in keep else f"/tmp/mons-refs/{name}-{l}.png") for l in loops)
    md.append(f"""
## Ghép các vòng (nhịp theo model 3D)
```bash
python3 {S}/assemble_loops.py --slug {a.slug3d} --out assets/pokemon/{a.species}/{name}-movement.png {parts}
```
""")
    out = os.path.join(REPO, f"tmp/prompts/{name}-movement-{tag}.md")
    open(out, "w", encoding="utf-8").write("".join(md))
    print(os.path.relpath(out, REPO), "| redraw:", redo, "| keep:", keep)


if __name__ == "__main__":
    main()
