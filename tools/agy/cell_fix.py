#!/usr/bin/env python3
"""
Fix only what is wrong in a sheet: a whole ROW (one animation, 6 frames) or single CELLS (frames), instead of
redrawing a whole image. Pillow only (agy's Python works).

  extract  cut the part to fix into a small image for the image model (magenta background):
             row  -> its 6 frames as a 3 x 2 grid (ratio 3:2: frames 1-3 top, 4-6 bottom)
             cell -> that one frame, alone in a square
  put      put the edited image back: cut its grid, scale every frame like the rest of the sheet, stand it on the
           sheet's baseline, keep each frame's sideways offset, paste it into its cell; other cells are untouched

battle sheet (<slug>-battle.png): --view front|back --row attack|hurt|dodge|faint [--frame 1-6]
movement sheet (<slug>-movement.png): --loop idle|walk|run|fly --dir down|left|right|up [--frame 1-6]

usage:
  python3 tools/agy/cell_fix.py extract <slug> --view back --row dodge                 -> tmp/fix/<slug>-back-dodge.png
  python3 tools/agy/cell_fix.py extract <slug> --view back --row hurt --frame 3        -> tmp/fix/<slug>-back-hurt-f3.png
  python3 tools/agy/cell_fix.py put <slug> --view back --row dodge --input /tmp/mons-refs/<slug>-fix-back-dodge.png
  python3 tools/agy/cell_fix.py extract <slug> --loop walk --dir left                  (movement sheets)
Then check again: check_battle.py <slug> (battle) / loop_check.py --sheet ... (movement).
"""
import argparse
import glob
import json
import os
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
sys.path.insert(0, os.path.join(REPO, "tools/skills"))
from vfx import Image  # noqa: E402
from PIL import PngImagePlugin  # noqa: E402

C, N = 192, 6
MAG = (255, 0, 255)
BROWS = ["attack", "hurt", "dodge", "faint"]
DIRS = ["down", "left", "right", "up"]


def is_mag(p):
    return p[0] - p[1] > 70 and p[2] - p[1] > 70 and p[0] > 120 and p[2] > 120


def drawing(cell):
    """(RGBA of the drawing only, bbox in the cell) or (None, None)"""
    im = cell.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if is_mag(px[x, y]):
                px[x, y] = (0, 0, 0, 0)
    bb = im.getbbox()
    return (im.crop(bb), bb) if bb else (None, None)


def sheet_path(slug, kind):
    hits = glob.glob(os.path.join(REPO, "assets", "units", "Gen*", "[0-9]*-*", f"{slug}-{kind}.png"))
    if not hits:
        sys.exit(f"no {slug}-{kind}.png")
    return hits[0]


def target_cells(a, sheet):
    """[(col, row)] of the cells to fix, the column range of their row group"""
    if a.view:
        r = BROWS.index(a.row)
        c0 = 0 if a.view == "front" else N
        cols = [c0 + a.frame - 1] if a.frame else list(range(c0, c0 + N))
        return [(c, r) for c in cols], (c0, r)
    loops = json.loads(sheet.text.get("mons-loops", "[]") or "[]")
    x = 0
    for l in loops:
        if l["mode"] == a.loop:
            r = DIRS.index(a.dir)
            n = l["frames"]
            cols = [x + a.frame - 1] if a.frame else list(range(x, x + n))
            return [(c, r) for c in cols], (x, r)
        x += l["frames"]
    sys.exit(f"the movement sheet has no '{a.loop}' loop")


def name_of(a, slug):
    part = f"{a.view}-{a.row}" if a.view else f"{a.loop}-{a.dir}"
    return f"{slug}-{part}" + (f"-f{a.frame}" if a.frame else "")


def extract(a, slug, path):
    sheet = Image.open(path)
    rgb = sheet.convert("RGB")
    cells, _ = target_cells(a, sheet)
    os.makedirs(os.path.join(REPO, "tmp", "fix"), exist_ok=True)
    out = os.path.join(REPO, "tmp", "fix", name_of(a, slug) + ".png")
    S = 2 * C                                            # bigger cells: easier for the image model to see
    if len(cells) == 1:
        c, r = cells[0]
        img = rgb.crop((c * C, r * C, (c + 1) * C, (r + 1) * C)).resize((S, S), Image.NEAREST)
    else:
        img = Image.new("RGB", (3 * S, 2 * S), MAG)
        for i, (c, r) in enumerate(cells):
            img.paste(rgb.crop((c * C, r * C, (c + 1) * C, (r + 1) * C)).resize((S, S), Image.NEAREST), ((i % 3) * S, (i // 3) * S))
    img.save(out)
    print(f"OK {os.path.relpath(out, REPO)}  ({'1 frame, square' if len(cells) == 1 else '6 frames as a 3 x 2 grid, ratio 3:2'})")


def backup(path):
    """keep the sheet that is about to be replaced: tmp/history/<name>-<time>.png (never cleaned automatically)"""
    import shutil, time
    if os.path.isfile(path):
        d = os.path.join(REPO, "tmp", "history"); os.makedirs(d, exist_ok=True)
        shutil.copyfile(path, os.path.join(d, os.path.basename(path)[:-4] + time.strftime("-%m%d-%H%M%S.png")))


def put(a, slug, path):
    sheet = Image.open(path)
    meta = {k: v for k, v in sheet.text.items()}
    rgb = sheet.convert("RGB")
    cells, (g0, gr) = target_cells(a, sheet)
    src = Image.open(a.input).convert("RGB")
    n = len(cells)
    cols, rows = (1, 1) if n == 1 else (3, 2)
    sw, sh = src.width / cols, src.height / rows
    new = []
    for i in range(n):
        slot = src.crop((int((i % cols) * sw), int((i // cols) * sh), int((i % cols + 1) * sw), int((i // cols + 1) * sh)))
        d, bb = drawing(slot)
        if d is None:
            sys.exit(f"edited image: slot {i + 1} is empty")
        dx = (bb[0] + bb[2]) / 2 - slot.width / 2        # sideways offset inside its slot
        new.append((d, dx))
    # scale like the sheet: the same height as the untouched frames of this view / loop (the standing frame)
    ref_cells = [(c, gr) for c in range(g0, g0 + N) if (c, gr) not in cells]
    if not ref_cells:   # the whole row is new: same row (view / direction) in the other loops, else the first frame
        ref_cells = [(c, gr) for c in range(rgb.width // C) if c < g0 or c >= g0 + N] or [(g0, 0)]
    heights = sorted(drawing(rgb.crop((c * C, r * C, (c + 1) * C, (r + 1) * C)))[0].height
                     for c, r in ref_cells if drawing(rgb.crop((c * C, r * C, (c + 1) * C, (r + 1) * C)))[0])
    if not heights:
        stand, _ = drawing(rgb.crop((g0 * C, 0, (g0 + 1) * C, C)))
        heights = [stand.height] if stand else [int(C * 0.8)]
    ref_h = heights[len(heights) // 2]
    new_h = sorted(d.height for d, _ in new)[len(new) // 2]
    k = ref_h / max(1, new_h)
    # baseline: the lowest drawn row of the untouched frames (feet on the ground)
    bases = []
    for c, r in ref_cells:
        d, bb = drawing(rgb.crop((c * C, r * C, (c + 1) * C, (r + 1) * C)))
        if bb:
            bases.append(bb[3])
    base = sorted(bases)[len(bases) // 2] if bases else int(C * 0.92)
    for (c, r), (d, dx) in zip(cells, new):
        d = d.resize((max(1, round(d.width * k)), max(1, round(d.height * k))), Image.NEAREST)
        if d.width > C - 8 or d.height > C - 8:          # never spill out of the cell
            f = min((C - 8) / d.width, (C - 8) / d.height)
            d = d.resize((max(1, int(d.width * f)), max(1, int(d.height * f))), Image.NEAREST)
        cell = Image.new("RGB", (C, C), MAG)
        x = int(round(C / 2 - d.width / 2 + dx * k * (C / sw if n > 1 else C / src.width)))
        x = max(4, min(C - 4 - d.width, x))
        y = max(4, min(C - 4 - d.height, base - d.height))
        cell.paste(d.convert("RGB"), (x, y), d)
        rgb.paste(cell, (c * C, r * C))
    info = PngImagePlugin.PngInfo()
    for k_, v in meta.items():
        info.add_text(k_, v)
    backup(path)
    rgb.save(path, pnginfo=info)
    print(f"OK {os.path.relpath(path, REPO)}: replaced {len(cells)} cell(s) of {name_of(a, slug)} (scale x{k:.2f}, baseline {base}px)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["extract", "put"]); ap.add_argument("slug")
    ap.add_argument("--view", choices=["front", "back"]); ap.add_argument("--row", choices=BROWS)
    ap.add_argument("--loop", choices=["idle", "walk", "run", "fly"]); ap.add_argument("--dir", choices=DIRS)
    ap.add_argument("--frame", type=int, choices=range(1, 7)); ap.add_argument("--input")
    a = ap.parse_args()
    if bool(a.view) == bool(a.loop) or (a.view and not a.row) or (a.loop and not a.dir):
        ap.error("battle: --view + --row; movement: --loop + --dir")
    path = sheet_path(a.slug, "battle" if a.view else "movement")
    if a.action == "extract":
        extract(a, a.slug, path)
    else:
        if not a.input:
            ap.error("put needs --input")
        put(a, a.slug, path)


if __name__ == "__main__":
    main()
