#!/usr/bin/env python3
"""Party / box icons: 32x32, two frames stacked (32x64), from each species' movement sheet.

Frame 1 = the down-facing idle frame (row 0, column 0), fitted into 28x28; frame 2 = frame 1 one
pixel higher (the Gen 3 party-icon hop; sheet layouts vary, so no second drawing is borrowed); colours cut to 14 + a dark
outline (<= 15, one 4bpp palette, Gen 3 icon rule), feet on row 30.
Usage: mon_icons.py [--out-root assets/ui]  -> assets/ui/MonIcons/<NNN>-<Name>.png + assets/ui/MonIcons/icons.json
"""
import argparse
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import uikit as U  # noqa: E402
import gen3  # noqa: E402
from PIL import Image  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
FIT = 28


def key(im):
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if (r - g) > 80 and (b - g) > 80 and r > 120 and b > 120:
                px[x, y] = (0, 0, 0, 0)
    return im


def frame(sheet, row, scale):
    c = key(sheet.crop((0, row * 192, 192, row * 192 + 192)))
    bb = c.getbbox()
    return c, bb


def outline(im):
    """A 1 px dark outline around the silhouette, in a darkened tone of the body."""
    px = im.load()
    cols = [px[x, y][:3] for y in range(im.height) for x in range(im.width) if px[x, y][3]]
    if not cols:
        return im
    avg = tuple(sum(c[i] for c in cols) // len(cols) for i in range(3))
    ink = tuple(int(v * 0.28) for v in avg)
    out = im.copy()
    op = out.load()
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3]:
                continue
            if any(0 <= x + dx < im.width and 0 <= y + dy < im.height and px[x + dx, y + dy][3]
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                op[x, y] = ink + (255,)
    return out


def icon(sheet_path):
    sh = Image.open(sheet_path)
    c, box = frame(sh, 0, 1)
    s = FIT / max(box[2] - box[0], box[3] - box[1])
    c = c.crop(box)
    c = c.resize((max(1, round(c.width * s)), max(1, round(c.height * s))), Image.LANCZOS)
    c.putalpha(c.split()[3].point(lambda v: 255 if v >= 140 else 0))
    cell = U.canvas(32, 32)
    cell.alpha_composite(c, ((32 - c.width) // 2, 30 - c.height))
    cell = outline(gen3.to_gen3(cell, max_colours=14))
    out = U.canvas(32, 64)
    out.alpha_composite(cell, (0, 0))
    out.alpha_composite(cell, (0, 31))
    return gen3.to_gen3(out, max_colours=15)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-root", default=os.path.join(REPO, "assets", "ui"))
    a = ap.parse_args()
    out = os.path.join(a.out_root, "MonIcons")
    os.makedirs(out, exist_ok=True)
    index = {}
    for p in sorted(glob.glob(os.path.join(REPO, "assets", "units", "Gen*", "*", "*-movement.png"))):
        folder = os.path.basename(os.path.dirname(p))
        m = re.match(r"(\d+)-(.+)", folder)
        if not m:
            continue
        name = f"{int(m.group(1)):03d}-{m.group(2)}"
        icon(p).save(os.path.join(out, name + ".png"))
        index[m.group(2)] = {"file": name + ".png", "dex": int(m.group(1))}
    with open(os.path.join(out, "icons.json"), "w") as f:
        json.dump({"size": [32, 32], "frames": 2, "layout": "frames stacked vertically",
                   "anim": {"ticks": [10, 10], "fps": 60}, "species": index}, f, indent=1)
    print(len(index), "icons")


if __name__ == "__main__":
    main()
