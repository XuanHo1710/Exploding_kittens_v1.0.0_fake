#!/usr/bin/env python3
"""
Structure Sheet Post-Processor for Mons (Gen 3 rules, < 10 seconds).

Turns a raw AI-generated building sheet (.jpg/.png on magenta) into a Gen 3-clean PNG:

  - N cols x M rows of square cells; a cell is a whole number of 16 px metatiles at native scale
    (final cell = 192 / 256 / 320 / 384 px = 6 / 8 / 10 / 12 metatiles, drawn x2)
  - Gen 3 scale: ONE NEAREST scale for all cells so the building body (largest piece) is
    --body-tiles metatiles wide (default cell-2: S 4 = Center/Mart, M 6 = Gym), capped by the canvas;
    the body's base sits on row native-17 (same ground line as gymkit, G = 111 in a 128 canvas),
    the bottom metatile row holds steps / front props, so states swap in place
  - one shared gen3.to_gen3 pass over all cells: BGR555 colours, alpha 0/255, <= 15 colours per
    8x8 tile, <= --palettes palettes; then x2 NEAREST on pure #FF00FF
  - --door-strip: the sheet is the 4 door frames (closed -> open); the output becomes only the
    region that changes between frames, widened to whole metatiles (the pret field_door.c strip),
    plus <output>.json with its position on the structure sheet

Usage:
  python3 normalize_structure.py --input drafts/raw.png  --output <slug>-structure.png --cell-size 256
  python3 normalize_structure.py --input drafts/raw.png  --output <slug>-structure.png --cell-size 256 --cols 2   # Day | Night
  python3 normalize_structure.py --input drafts/door.png --output <slug>-door.png --cell-size 256 --cols 4 --door-strip
--cell-order maps output cell N (row-major) to a source cell; a negative value flips that cell.
"""
import argparse
import json
import os
import sys
from collections import deque

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PYDEPS = os.path.join(SCRIPT_DIR, ".pydeps")
if os.path.isdir(PYDEPS) and PYDEPS not in sys.path:
    sys.path.insert(0, PYDEPS)
sys.path.insert(0, SCRIPT_DIR)
sys.path.insert(0, os.path.join(SCRIPT_DIR, "..", "gen3"))  # tools/gen3: shared Gen 3 pass

from PIL import Image  # noqa: E402

import gen3  # noqa: E402

COLS, ROWS = 1, 1
MIN_PIECE_AREA = 12  # drop JPEG speckles smaller than this
MAGENTA = (255, 0, 255)
T = 16


def is_magenta_bg(r, g, b):
    return g < 75 and r > 185 and b > 185 and (r - g) > 125 and (b - g) > 125


def is_magenta_fringe(r, g, b):
    return r > 120 and b > 120 and g < 85 and (r + b - 2 * g) > 180


def clean_sheet_mask(im):
    """Magenta background (and its anti-aliased fringe) -> transparent."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    bg = [[is_magenta_bg(*px[x, y]) for x in range(w)] for y in range(h)]
    fringe = []
    for y in range(h):
        for x in range(w):
            if not bg[y][x] and is_magenta_fringe(*px[x, y]):
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and bg[ny][nx]:
                        fringe.append((x, y))
                        break
    for x, y in fringe:
        bg[y][x] = True
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    opx = out.load()
    for y in range(h):
        for x in range(w):
            if not bg[y][x]:
                r, g, b = px[x, y]
                opx[x, y] = (r, g, b, 255)
    return out


def find_cuts(counts, parts):
    """Pick cut lines at the emptiest position near each expected grid line."""
    n = len(counts)
    step = n / parts
    cuts = [0]
    for i in range(1, parts):
        expected = i * step
        lo = max(1, int(expected - step * 0.35))
        hi = min(n - 1, int(expected + step * 0.35))
        cuts.append(min(range(lo, hi + 1), key=lambda k: (counts[k], abs(k - expected))))
    cuts.append(n)
    return cuts


def find_components(rgba):
    w, h = rgba.size
    px = rgba.load()
    seen = [[False] * w for _ in range(h)]
    comps = []
    for y in range(h):
        for x in range(w):
            if seen[y][x] or px[x, y][3] == 0:
                continue
            q = deque([(x, y)])
            seen[y][x] = True
            pts = []
            minx = maxx = x
            miny = maxy = y
            while q:
                cx, cy = q.popleft()
                pts.append((cx, cy))
                minx, maxx = min(minx, cx), max(maxx, cx)
                miny, maxy = min(miny, cy), max(maxy, cy)
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][3] > 0:
                            seen[ny][nx] = True
                            q.append((nx, ny))
            comps.append({
                "pts": pts,
                "bbox": (minx, miny, maxx + 1, maxy + 1),
                "cx": (minx + maxx) / 2.0,
                "cy": (miny + maxy) / 2.0,
                "area": len(pts),
            })
    return comps


def extract_cell(rgba, comps, x0, x1, y0, y1):
    """Return (sprite, anchor_x, anchor_bottom) for every piece centred in the cell.

    The anchor is the bottom-centre of the largest piece (the building body), so
    smoke or flags drifting sideways do not shift the building between states.
    """
    pieces = [c for c in comps
              if c["area"] >= MIN_PIECE_AREA and x0 <= c["cx"] < x1 and y0 <= c["cy"] < y1]
    if not pieces:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0)), 0.5, 1, 1
    main = max(pieces, key=lambda c: c["area"])
    bx0 = min(c["bbox"][0] for c in pieces)
    by0 = min(c["bbox"][1] for c in pieces)
    bx1 = max(c["bbox"][2] for c in pieces)
    by1 = max(c["bbox"][3] for c in pieces)
    px = rgba.load()
    crop = Image.new("RGBA", (bx1 - bx0, by1 - by0), (0, 0, 0, 0))
    cpx = crop.load()
    for c in pieces:
        for x, y in c["pts"]:
            cpx[x - bx0, y - by0] = px[x, y]
    mx0, _, mx1, my1 = main["bbox"]
    return crop, (mx0 + mx1) / 2.0 - bx0, my1 - by0, mx1 - mx0


def parse_order(s):
    order = [int(v.strip()) for v in s.split(",")]
    if len(order) != COLS * ROWS or any(not 1 <= abs(v) <= COLS * ROWS for v in order):
        raise SystemExit(f"--cell-order needs {COLS * ROWS} comma-separated values in 1..{COLS * ROWS} (negative = flip)")
    return order


def door_strip(cells, n):
    """Bounding box of pixels that differ between door frames, widened to whole metatiles."""
    w, h = cells[0].size
    pxs = [c.load() for c in cells]
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            if any(p[x, y] != pxs[0][x, y] for p in pxs[1:]):
                xs.append(x)
                ys.append(y)
    if not xs:
        raise SystemExit("--door-strip: the frames are identical, no door motion found")
    x0, x1 = (min(xs) // T) * T, min(w, -(-(max(xs) + 1) // T) * T)
    y0, y1 = (min(ys) // T) * T, min(h, -(-(max(ys) + 1) // T) * T)
    return x0, y0, x1 - x0, y1 - y0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="Raw generated sheet (.jpg or .png)")
    ap.add_argument("--output", required=True, help="Target clean .png path")
    ap.add_argument("--cell-size", type=int, default=256, help="192 (S), 256 (M), 320 (L) or 384 (XL): final px, x2 of native")
    ap.add_argument("--scale-factor", type=float, default=1.0, help="Shrink everything, e.g. 0.85")
    ap.add_argument("--cell-order", default=None, help="Output->source cell map (default 1..N); negative flips")
    ap.add_argument("--cols", type=int, default=1, help="1 = Day only (Gen 3), 2 = Day|Night, 4 = door frames")
    ap.add_argument("--rows", type=int, default=1, help="2 for a door sheet with a night row")
    ap.add_argument("--body-tiles", type=int, default=None,
                    help="building body width in metatiles (default cell-2: S 4 = Center/Mart, M 6 = Gym, L 8, XL 10)")
    ap.add_argument("--palettes", type=int, default=6, help="palette budget for the whole sheet (Emerald buildings: 3-6)")
    ap.add_argument("--door-strip", action="store_true", help="output only the changing door region (+ .json)")
    args = ap.parse_args()
    global COLS, ROWS
    COLS, ROWS = args.cols, args.rows
    if args.cell_order is None:
        args.cell_order = ",".join(str(i + 1) for i in range(COLS * ROWS))
    if args.cell_size % (2 * T):
        raise SystemExit("--cell-size must be a multiple of 32 (whole 16 px metatiles at x2)")

    native = args.cell_size // 2
    order = parse_order(args.cell_order)

    rgba = clean_sheet_mask(Image.open(args.input))
    w, h = rgba.size
    apx = rgba.load()
    col_counts = [sum(1 for y in range(h) if apx[x, y][3]) for x in range(w)]
    row_counts = [sum(1 for x in range(w) if apx[x, y][3]) for y in range(h)]
    xcuts, ycuts = find_cuts(col_counts, COLS), find_cuts(row_counts, ROWS)
    comps = find_components(rgba)

    sources = []
    for r in range(ROWS):
        for c in range(COLS):
            sources.append(extract_cell(rgba, comps, xcuts[c], xcuts[c + 1], ycuts[r], ycuts[r + 1]))

    cells = []
    for v in order:
        sprite, ax, ab, mw = sources[abs(v) - 1]
        if v < 0:
            sprite = sprite.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            ax = sprite.width - ax
        cells.append((sprite, ax, ab, mw))

    # Gen 3 scale: the building body (largest piece) is --body-tiles metatiles wide; never exceed the canvas
    body = args.body_tiles or max(2, native // T - 2)
    main_w = max(mw for _, _, _, mw in cells)
    fit = min(min(native / s.width, (native - T) / max(1, ab)) for s, _, ab, _ in cells)
    scale = min(body * T / main_w, fit) * args.scale_factor

    # native-scale stitched sheet -> one Gen 3 pass -> x2
    sheet = Image.new("RGBA", (COLS * native, ROWS * native), (0, 0, 0, 0))
    sizes = []
    for i, (sprite, ax, ab, _) in enumerate(cells):
        nw = max(1, round(sprite.width * scale))
        nh = max(1, round(sprite.height * scale))
        ss = sprite.resize((nw, nh), Image.Resampling.NEAREST)
        sizes.append(f"{nw}x{nh}")
        cx, cy = (i % COLS) * native, (i // COLS) * native
        x = cx + round(native / 2 - ax * scale)
        y = cy + round(native - T - ab * scale)   # body base on row native-17 (= gymkit G), props below
        x = max(cx, min(x, cx + native - nw))
        y = max(cy, min(y, cy + native - nh))
        sheet.paste(ss, (x, y), ss)
    sheet = gen3.to_gen3(sheet, max_palettes=args.palettes,
                         regions=[((i % COLS) * native, (i // COLS) * native, (i % COLS + 1) * native,
                                   (i // COLS + 1) * native) for i in range(COLS * ROWS)])

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    if args.door_strip:
        frames = [sheet.crop(((i % COLS) * native, (i // COLS) * native,
                              (i % COLS + 1) * native, (i // COLS + 1) * native)) for i in range(COLS * ROWS)]
        x0, y0, dw, dh = door_strip(frames[:COLS], COLS)
        strip = Image.new("RGBA", (dw * COLS, dh * ROWS), (0, 0, 0, 0))
        for i, f in enumerate(frames):
            strip.paste(f.crop((x0, y0, x0 + dw, y0 + dh)), ((i % COLS) * dw, (i // COLS) * dh))
        sheet = strip
        with open(os.path.splitext(args.output)[0] + ".json", "w") as fh:
            json.dump({"scale": 2, "x": x0 * 2, "y": y0 * 2, "w": dw * 2, "h": dh * 2,
                       "frames": ["closed", "open1", "open2", "open3"][:COLS],
                       "rows": ["day", "night"][:ROWS], "ticks_per_frame": 4, "frame_ms": 83,
                       "open": list(range(COLS)), "close": list(range(COLS))[::-1]}, fh, indent=1)
    out = Image.new("RGB", sheet.size, MAGENTA)
    out.paste(sheet, (0, 0), sheet)
    out = out.resize((out.width * 2, out.height * 2), Image.NEAREST)
    out.save(args.output, "PNG")
    r = gen3.report(out)
    print(f"OK: {args.output} ({out.width}x{out.height}, native cell={native}, scale={scale:.3f}, "
          f"states={' '.join(sizes)}, colours={r['colours']}, palettes~{r['palettes_est']}"
          + (f", door strip {dw}x{dh} at ({x0},{y0}) native" if args.door_strip else "") + ")")


if __name__ == "__main__":
    main()
