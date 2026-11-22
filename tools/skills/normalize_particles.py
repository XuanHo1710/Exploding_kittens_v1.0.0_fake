#!/usr/bin/env python3
"""
Turn an AI-drawn particle sheet (frames side by side, or a grid, on #FF00FF magenta) into the particle strip the
battle renderer uses: assets/skills/vfx/particles/<type>.png = N frames of CELL x CELL px in one row, transparent background,
one shared scale (the biggest frame fills ~88% of the cell), each frame centred.

usage:
  python3 normalize_particles.py --type fire --input /tmp/mons-refs/move-fire-raw.png [--cols 4 --rows 1] [--cell 32]
  (a 2 x 2 grid: --cols 2 --rows 2; frames are read left->right, top->bottom)
"""
import argparse
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
try:
    from PIL import Image
except ImportError:
    sys.path.insert(0, os.path.join(SCRIPT_DIR, "../pokemon/.pydeps"))
    from PIL import Image

REPO = os.path.abspath(os.path.join(SCRIPT_DIR, "../.."))


def key(im):
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if r - g > 70 and b - g > 70 and r > 120 and b > 120:
                px[x, y] = (0, 0, 0, 0)
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--type", required=True); ap.add_argument("--input", required=True)
    ap.add_argument("--cols", type=int, default=4); ap.add_argument("--rows", type=int, default=1)
    ap.add_argument("--cell", type=int, default=32)
    ap.add_argument("--out", default="")
    a = ap.parse_args()
    src = key(Image.open(a.input))
    cw, ch = src.width / a.cols, src.height / a.rows
    frames = []
    for r in range(a.rows):
        for c in range(a.cols):
            cell = src.crop((int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)))
            bb = cell.getbbox()
            if bb:
                frames.append(cell.crop(bb))
    if not frames:
        sys.exit("no particles found (is the background pure magenta #FF00FF?)")
    k = (a.cell * 0.88) / max(max(f.width, f.height) for f in frames)
    out = Image.new("RGBA", (a.cell * len(frames), a.cell), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        f = f.resize((max(1, round(f.width * k)), max(1, round(f.height * k))), Image.NEAREST)
        out.alpha_composite(f, (i * a.cell + (a.cell - f.width) // 2, (a.cell - f.height) // 2))
    dst = a.out or os.path.join(REPO, "assets", "skills", "vfx", "particles", f"{a.type}.png")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    out.save(dst)
    print(f"OK: {dst} ({len(frames)} frames of {a.cell}px)")


if __name__ == "__main__":
    main()
