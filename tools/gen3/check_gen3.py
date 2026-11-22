#!/usr/bin/env python3
"""
Check structure PNGs against the Gen 3 hardware rules (gen3.py). Exit code 1 if any file fails.

Usage:
  python3 check_gen3.py assets/structures/Battle/gym-fire/*.png
  python3 check_gen3.py --max-palettes 6 --max-footprint 8x8 assets/structures/Battle/gym-fire/gym-fire-structure.png
  python3 check_gen3.py --grid 8 --max-palettes 1 assets/characters   # OBJ sprites: one 16-colour palette each
  python3 check_gen3.py --fix FILE...      # rewrite files in place through gen3.to_gen3 (keeps the x2 scale)

Files whose name contains '-route' or '-preview' or 'overview' are designer sheets and are skipped.
Per file it prints: native size, footprint in 16 px metatiles, colours, worst 8x8 tile, palette estimate.
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PYDEPS = os.path.join(HERE, ".pydeps")
if os.path.isdir(PYDEPS) and PYDEPS not in sys.path:
    sys.path.insert(0, PYDEPS)
sys.path.insert(0, HERE)

from PIL import Image  # noqa: E402

import gen3  # noqa: E402

SKIP = ("-route", "-preview", "overview", "-floors")
SKIP_DIRS = ("_preview", "drafts")


def expand(paths):
    """Files as given; directories are walked for *.png (skipping _preview/ and drafts/)."""
    for p in paths:
        if os.path.isdir(p):
            for root, dirs, files in os.walk(p):
                dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
                for f in sorted(files):
                    if f.lower().endswith(".png"):
                        yield os.path.join(root, f)
        else:
            yield p


OUTLINE = gen3.snap((27, 23, 38))   # boxkit silhouette outline


def clipped(img):
    """Opaque non-outline pixels on the left/right/top edge of each square cell = art cut off by the canvas."""
    k = gen3.native_scale(img)
    im = img.convert("RGBA").resize((img.width // k, img.height // k), Image.NEAREST)
    w, h = im.size
    px = im.load()
    n = 0
    for c0 in range(0, w - h + 1, h):
        pts = [(c0, y) for y in range(h)] + [(c0 + h - 1, y) for y in range(h)] + [(c0 + x, 0) for x in range(h)]
        for x, y in pts:
            p = px[x, y]
            if p[3] == 255 and p[:3] not in (gen3.MAGENTA, OUTLINE):
                n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+", help="PNG files and/or directories (walked recursively)")
    ap.add_argument("--quiet", action="store_true", help="print only failures and a summary")
    ap.add_argument("--max-palettes", type=int, default=gen3.MAX_PALETTES,
                    help="palette budget per image (13 = whole tileset; an Emerald building uses 3-6)")
    ap.add_argument("--max-footprint", default=None, help="WxH in metatiles, e.g. 8x8")
    ap.add_argument("--fix", action="store_true", help="rewrite each file through gen3.to_gen3")
    ap.add_argument("--grid", type=int, default=16,
                    help="canvas multiple in native px (16 = metatile; 8 for OBJ sprites such as the 16x8 shadow)")
    a = ap.parse_args()
    maxfp = tuple(int(v) for v in a.max_footprint.split("x")) if a.max_footprint else None
    bad = n = 0
    for f in expand(a.files):
        if any(s in os.path.basename(f) for s in SKIP) or not f.lower().endswith(".png"):
            continue
        img = Image.open(f)
        if a.fix:
            k = gen3.native_scale(img)
            nat = img.convert("RGBA").resize((img.width // k, img.height // k), Image.NEAREST)
            fixed = gen3.to_gen3(nat)
            fixed = fixed.resize((fixed.width * k, fixed.height * k), Image.NEAREST)
            (fixed if img.mode == "RGBA" else fixed.convert("RGB")).save(f)
            img = Image.open(f)
        r = gen3.report(img, grid=a.grid)
        if "-structure" in os.path.basename(f):
            # Day | Night cells are alternative palette sets: the budget applies per cell
            k = r["scale"]
            nat = img.convert("RGBA").resize((img.width // k, img.height // k), Image.NEAREST)
            h = nat.height
            r["palettes_est"] = max(gen3.palette_count(nat.crop((c, 0, c + h, h)))
                                    for c in range(0, nat.width - h + 1, h))
        fails = gen3.failures(r, a.max_palettes)
        fp = r["footprint_tiles"]
        if maxfp and fp and (fp[0] > maxfp[0] or fp[1] > maxfp[1]):
            fails.append(f"footprint {fp[0]}x{fp[1]} > {maxfp[0]}x{maxfp[1]} metatiles")
        if "-structure" in os.path.basename(f):
            edge_px = clipped(img)
            if edge_px:
                fails.append(f"{edge_px} px touch the cell's left/right/top edge (clipped: move props inward)")
        bad += bool(fails)
        n += 1
        if a.quiet and not fails:
            continue
        fps = f"{fp[0]}x{fp[1]}" if fp else "-"
        print(f"{'FAIL' if fails else 'ok  '} {os.path.basename(f):42s} native {r['native'][0]}x{r['native'][1]}"
              f" x{r['scale']}  footprint {fps:5s} colours {r['colours']:3d}  tile max {r['tile_colours_max']:2d}"
              f"  palettes ~{r['palettes_est']}" + ("  <- " + "; ".join(fails) if fails else ""))
    if a.quiet:
        print(f"checked {n} file(s), {bad} failed")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
