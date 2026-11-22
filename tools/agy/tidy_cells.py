#!/usr/bin/env python3
"""
Cheap code fixes for single cells of a battle / movement sheet (no image generation):

  mirror   flip the drawing left-right IN PLACE (same box in the cell, so a dodge keeps its sideways offset):
           frames drawn facing the wrong way (e.g. a FRONT frame whose face turned to the right)
  recolor  scale the cell's colours to the mean of the other frames of its row: a frame lighter / darker than
           its neighbours (a separately edited cell)
  copy     replace a cell with another cell of the sheet: e.g. use the best-angled frame as the stance

battle sheet: --view front|back --row attack|hurt|dodge|faint --frames 3,4
movement sheet: --loop idle|walk|run|fly --dir down|left|right|up --frames 3,4
copy: --from <col>,<row> (0-based sheet cell) onto the selected frames

usage:
  python3 tools/agy/tidy_cells.py mirror charmander --view front --row dodge --frames 3,4,5
  python3 tools/agy/tidy_cells.py recolor bulbasaur --view back --row dodge --frames 3,4
  python3 tools/agy/tidy_cells.py copy ho-oh --view back --row attack --frames 1,6 --from 7,1
The sheet is backed up to tmp/history/ first. Check again afterwards (check_battle.py / loop_check.py).
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cell_fix import BROWS, C, DIRS, MAG, N, Image, PngImagePlugin, backup, is_mag, sheet_path, target_cells  # noqa: E402
from PIL import ImageOps  # noqa: E402


def cell(rgb, c, r):
    return rgb.crop((c * C, r * C, (c + 1) * C, (r + 1) * C))


def mean_colour(im):
    b = im.convert("RGB").tobytes()
    px = [b[i:i + 3] for i in range(0, len(b), 3) if not is_mag(b[i:i + 3])]
    return [sum(p[k] for p in px) / max(1, len(px)) for k in range(3)] if px else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["mirror", "recolor", "copy"]); ap.add_argument("slug")
    ap.add_argument("--view", choices=["front", "back"]); ap.add_argument("--row", choices=BROWS)
    ap.add_argument("--loop", choices=["idle", "walk", "run", "fly"]); ap.add_argument("--dir", choices=DIRS)
    ap.add_argument("--frames", required=True, help="comma list, 1-based"); ap.add_argument("--from", dest="src")
    a = ap.parse_args()
    if bool(a.view) == bool(a.loop) or (a.view and not a.row) or (a.loop and not a.dir):
        ap.error("battle: --view + --row; movement: --loop + --dir")
    frames = [int(f) for f in a.frames.split(",")]
    path = sheet_path(a.slug, "battle" if a.view else "movement")
    sheet = Image.open(path)
    meta = dict(sheet.text)
    rgb = sheet.convert("RGB")
    a.frame = None
    row_cells, _ = target_cells(a, sheet)                 # every cell of the row
    picked = [row_cells[f - 1] for f in frames]
    backup(path)
    if a.action == "mirror":
        for c, r in picked:
            im = cell(rgb, c, r).convert("RGBA")
            px = im.load()
            for y in range(C):
                for x in range(C):
                    if is_mag(px[x, y]):
                        px[x, y] = (0, 0, 0, 0)
            bb = im.getbbox()
            if not bb:
                continue
            d = ImageOps.mirror(im.crop(bb))
            out = Image.new("RGB", (C, C), MAG)
            out.paste(d.convert("RGB"), (bb[0], bb[1]), d)
            rgb.paste(out, (c * C, r * C))
    elif a.action == "recolor":
        others = [mean_colour(cell(rgb, c, r)) for c, r in row_cells if (c, r) not in picked]
        others = [o for o in others if o]
        ref = [sum(o[k] for o in others) / len(others) for k in range(3)]
        for c, r in picked:
            im = cell(rgb, c, r)
            cur = mean_colour(im)
            if not cur:
                continue
            k = [ref[i] / max(1, cur[i]) for i in range(3)]
            px = im.load()
            for y in range(C):
                for x in range(C):
                    p = px[x, y]
                    if not is_mag(p):
                        px[x, y] = tuple(min(255, int(p[i] * k[i])) for i in range(3))
            rgb.paste(im, (c * C, r * C))
    else:
        if not a.src:
            ap.error("copy needs --from <col>,<row>")
        sc, sr = (int(v) for v in a.src.split(","))
        src = cell(rgb, sc, sr)
        for c, r in picked:
            rgb.paste(src, (c * C, r * C))
    info = PngImagePlugin.PngInfo()
    for k_, v in meta.items():
        info.add_text(k_, v)
    rgb.save(path, pnginfo=info)
    print(f"OK {a.action} {a.slug} {a.view or a.loop} {a.row or a.dir} frames {frames}")


if __name__ == "__main__":
    main()
