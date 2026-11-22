#!/usr/bin/env python3
"""
Normalize one of the 2 images of a move, drawn by agy on #FF00FF as a 4 x 2 grid (8 frames):
  --kind cast   -> assets/skills/<GenX-Region>/<English move name>/<identifier>-cast.png    (8 frames x 96 px, one row, transparent)
  --kind effect -> assets/skills/<GenX-Region>/<English move name>/<identifier>-effect.png  (8 frames x 96 px)
One shared scale for all frames (the biggest fills ~92% of the cell) so the animation does not pulse; each frame keeps
its position inside its slot (centre of the slot -> centre of the cell), so a drawing that grows / moves stays that way.
Beam travel frames (1-4) are stretched to touch both side edges so copies join (never fall: rocks would deform).
Never cut (decisions.md §12, 2026-11-19): every drawing stays whole inside its cell with >= 2 px to spare. A piece that
runs over its slot line stays with the frame that holds most of it; the strip shrinks a little for it (to 75% at most)
and otherwise gets a bigger cell (vfx.py reads the cell from the image height and sizes by the drawing). A drawing cut
by the edge of the draft itself cannot be repaired: the script prints a WARNING -> redraw that image.

usage:
  python3 normalize_move.py --move thunderbolt --kind effect --input /tmp/mons-refs/move-thunderbolt-effect-raw.png [--cols 4 --rows 2]
"""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vfx  # noqa: E402
import clip_check  # noqa: E402
from vfx import Image  # noqa: E402


def key(im):
    im = im.convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if r - g > 70 and b - g > 70 and r > 120 and b > 120:
                px[x, y] = (0, 0, 0, 0)
    return im


def drop_lines(cell):
    """remove leftover grid / border lines: straight runs >= 40% of the cell, at most 3 px thick, empty beside"""
    W_, H_ = cell.size
    px = cell.load()
    on = lambda x, y: 0 <= x < W_ and 0 <= y < H_ and px[x, y][3] > 0
    for vertical in (True, False):
        L, N = (H_, W_) if vertical else (W_, H_)
        get = (lambda i, j: on(i, j)) if vertical else (lambda i, j: on(j, i))
        for i in range(N):
            j = 0
            while j < L:
                if not get(i, j):
                    j += 1
                    continue
                k = j
                while k < L and get(i, k):
                    k += 1
                if k - j >= 0.4 * L:   # long straight run: a line if the pixels 3 px to both sides are mostly empty
                    side = sum(1 for t in range(j, k) if get(i - 3, t) or get(i + 3, t))
                    if side <= 0.1 * (k - j):
                        for d in (-2, -1, 0, 1, 2):
                            for t in range(j, k):
                                x, y = (i + d, t) if vertical else (t, i + d)
                                if 0 <= x < W_ and 0 <= y < H_:
                                    px[x, y] = (0, 0, 0, 0)
                j = k
    return cell


def pieces(im):
    """8-connected opaque pieces of an RGBA image: [(pixels, bbox)] (pure Python, a 4 x 2 draft takes ~1-2 s)"""
    W_, H_ = im.size
    a = im.getchannel("A").load()
    seen, out = bytearray(W_ * H_), []
    for y in range(H_):
        for x in range(W_):
            if not a[x, y] or seen[y * W_ + x]:
                continue
            seen[y * W_ + x] = 1
            todo, pix = [(x, y)], []
            while todo:
                cx, cy = todo.pop()
                pix.append((cx, cy))
                for nx in (cx - 1, cx, cx + 1):
                    for ny in (cy - 1, cy, cy + 1):
                        if 0 <= nx < W_ and 0 <= ny < H_ and not seen[ny * W_ + nx] and a[nx, ny]:
                            seen[ny * W_ + nx] = 1
                            todo.append((nx, ny))
            xs, ys = [q[0] for q in pix], [q[1] for q in pix]
            out.append((pix, (min(xs), min(ys), max(xs) + 1, max(ys) + 1)))
    return out


MARGIN = 2          # transparent px kept around the drawing inside its cell (never cut: decisions.md §12)
S_MIN = 0.75        # a drawing that spills over its slot may shrink the strip to 75%; beyond that the cell grows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--move", required=True); ap.add_argument("--kind", choices=("cast", "effect"), required=True)
    ap.add_argument("--input", required=True)
    ap.add_argument("--cols", type=int, default=4); ap.add_argument("--rows", type=int, default=2)
    ap.add_argument("--out", default="")
    a = ap.parse_args()
    ms = {m["identifier"]: m for m in json.load(open(os.path.join(vfx.REPO, "data", "battle", "moves.json"), encoding="utf-8"))["moves"]}
    m = ms.get(a.move.lower().replace(" ", "-")) or sys.exit(f"move {a.move} not found")
    C = vfx.CAST_CELL if a.kind == "cast" else vfx.EFFECT_CELL
    src = key(Image.open(a.input))
    cw, ch = src.width / a.cols, src.height / a.rows
    rects = [(int(c * cw), int(r * ch), int((c + 1) * cw), int((r + 1) * ch)) for r in range(a.rows) for c in range(a.cols)]
    for r in rects:                                     # grid / border lines, slot by slot
        src.paste(drop_lines(src.crop(r)), r[:2])
    # never cut (decisions.md §12, 2026-11-19): a drawing that runs over its slot line stays WHOLE with the frame that
    # holds most of it (instead of being cut in two by the grid)
    n = len(rects)
    layers = [Image.new("RGBA", src.size, (0, 0, 0, 0)) for _ in rects]
    spx, warn_edge, spill = src.load(), set(), set()
    for pix, (x0, y0, x1, y1) in pieces(src):
        votes = [0] * n
        for x, y in pix:
            votes[min(a.rows - 1, int(y / ch)) * a.cols + min(a.cols - 1, int(x / cw))] += 1
        i = max(range(n), key=lambda j: votes[j])
        if sum(1 for v in votes if v) > 1 and len(pix) >= 12:
            spill.add(i)
        if (x0 == 0 or y0 == 0 or x1 == src.width or y1 == src.height) and len(pix) >= 12:
            warn_edge.add(i)                            # cut by the edge of the draft itself: cannot be repaired
        lp = layers[i].load()
        for q in pix:
            lp[q] = spx[q]
    # one shared scale: the largest extent from each slot centre (the slot's own part / with the spilled pieces)
    ext_in, ext_all = 1, 1
    for i, ((rx0, ry0, rx1, ry1), L) in enumerate(zip(rects, layers)):
        cx, cy = (rx0 + rx1) / 2, (ry0 + ry1) / 2
        b = L.getbbox()
        if not b:
            continue
        e = max(b[2] - cx, cx - b[0], b[3] - cy, cy - b[1])
        ext_all = max(ext_all, e)
        bi = L.crop(rects[i]).getbbox()
        if bi:
            ext_in = max(ext_in, max(bi[2] - (rx1 - rx0) / 2, (rx1 - rx0) / 2 - bi[0], bi[3] - (ry1 - ry0) / 2, (ry1 - ry0) / 2 - bi[1]))
    if not any(L.getbbox() for L in layers):
        sys.exit("empty image (is the background pure magenta #FF00FF?)")
    k_in = (C * 0.46) / ext_in                          # as before: the biggest frame fills ~92% of the 96 px cell
    k = max((C * 0.46) / ext_all, S_MIN * k_in)         # spilled pieces: shrink a little, else grow the cell
    N = max(C, 4 * math.ceil((ext_all * k + MARGIN + 1) / 2))
    arch = m["vfx"]["archetype"]
    strip = Image.new("RGBA", (N * n, N), (0, 0, 0, 0))
    for i, ((rx0, ry0, rx1, ry1), L) in enumerate(zip(rects, layers)):
        b = L.getbbox()
        if not b:
            continue
        if a.kind == "effect" and i < 4 and arch == "beam":   # beam segments: stretched edge to edge (copies join)
            part = L.crop(b)
            part = part.resize((N, max(1, round(part.height * k))), Image.NEAREST)
            strip.alpha_composite(part, (i * N, (N - part.height) // 2))
            continue
        cx, cy = (rx0 + rx1) / 2, (ry0 + ry1) / 2         # slot centre -> cell centre, the drawing keeps its offset
        part = L.crop(b)
        part = part.resize((max(1, round(part.width * k)), max(1, round(part.height * k))), Image.NEAREST)
        px, py = round(N / 2 + (b[0] - cx) * k), round(N / 2 + (b[1] - cy) * k)
        cell = Image.new("RGBA", (N, N), (0, 0, 0, 0))
        cell.alpha_composite(part, (max(0, min(N - part.width, px)), max(0, min(N - part.height, py))))
        strip.alpha_composite(cell, (i * N, 0))
    d = vfx.move_dir(m)
    dst = a.out or os.path.join(d, f"{m['identifier']}-{a.kind}.png")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    strip.save(dst)
    print(f"OK: {os.path.relpath(dst, vfx.REPO)} ({n} frames of {N}px{', cell grown so nothing is cut' if N > C else ''})")
    if spill:
        print(f"  note: frame(s) {', '.join(str(i + 1) for i in sorted(spill))} ran over their slot line: kept whole")
    cuts = clip_check.strip_cuts(vfx.load_strip(dst), arch, a.kind)
    if warn_edge or cuts:
        print("  WARNING: cut drawing (agy drew past the edge of the image) -> redraw this image:",
              ", ".join(f"frame {i + 1}" for i in sorted(warn_edge)), clip_check.describe(cuts))


def clean(path):
    """remove grid lines from an already normalized strip (in place)"""
    im = Image.open(path).convert("RGBA")
    C = im.height
    for i in range(im.width // C):
        im.paste(drop_lines(im.crop((i * C, 0, (i + 1) * C, C))), (i * C, 0))
    im.save(path)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--clean":
        clean(sys.argv[2]); print("cleaned", sys.argv[2])
    else:
        main()
