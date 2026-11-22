#!/usr/bin/env python3
"""
Check that a normalized movement loop really moves: the frames of each row must differ enough (a walk whose 6 frames
are the same standing pose is redrawn). Pillow only.

usage:
  python3 tools/units/loop_check.py --loop walk /tmp/mons-refs/<slug>-walk.png
  python3 tools/units/loop_check.py --sheet assets/pokemon/<Gen>/<NNN-Name>/<slug>-movement.png
prints, per row (down, left, right, up), the average silhouette change between consecutive frames, the pairs of
consecutive frames that are (almost) the same, and OK / REDO.
Thresholds (silhouette change, % of the body): walk / run / fly side rows (left, right) >= 6, front / back rows >= 2.5;
idle: every row >= 1 (breathing must show, but idle stays subtle).
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
try:
    from PIL import Image
except ImportError:
    sys.path.insert(0, os.path.join(HERE, ".pydeps"))
    from PIL import Image

C = 192
ROWS = ["down", "left", "right", "up"]
MIN = {"idle": (1.0, 1.0), "walk": (2.5, 6.0), "run": (2.5, 6.0), "fly": (2.5, 5.0)}   # (front/back rows, side rows)


def mask(cell):
    c = cell.convert("RGB").resize((64, 64), Image.NEAREST)
    b = c.tobytes()
    return [0 if (b[i] - b[i + 1] > 70 and b[i + 2] - b[i + 1] > 70 and b[i] > 120 and b[i + 2] > 120) else 1
            for i in range(0, len(b), 3)]


def pair_changes(im, row, c0, n):
    """silhouette change (%) between each frame and the next one (the last one against the first: the loop seam)"""
    ms = [mask(im.crop(((c0 + i) * C, row * C, (c0 + i + 1) * C, (row + 1) * C))) for i in range(n)]
    return [100 * sum(a != b for a, b in zip(ms[i], ms[(i + 1) % n])) / max(1, sum(ms[i])) for i in range(n)]


def check(im, loop, c0, n):
    """a row passes when its average change reaches the threshold AND every consecutive pair of frames differs
    (a pair under 40% of the threshold = two frames drawn the same)"""
    lo_fb, lo_side = MIN.get(loop, MIN["walk"])
    res, ok = [], True
    for r, name in enumerate(ROWS):
        d = pair_changes(im, r, c0, n)
        need = lo_side if name in ("left", "right") else lo_fb
        avg = sum(d) / n
        same = [f"{i + 1}={(i + 1) % n + 1}" for i, v in enumerate(d) if v < 0.4 * need]
        good = avg >= need and not same
        ok &= good
        why = []
        if avg < need:
            why.append(f"avg < {need}")
        if same:
            why.append("same frames " + ",".join(same))
        res.append(f"{name} {avg:.1f}%" + (f" ({'; '.join(why)})" if why else ""))
    return ok, res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", help="loop name of a single normalized loop image (idle / walk / run / fly)")
    ap.add_argument("--sheet", help="an assembled v3 <slug>-movement.png (checks every loop in it)")
    ap.add_argument("image", nargs="?")
    a = ap.parse_args()
    bad = False
    if a.sheet:
        im = Image.open(a.sheet)
        loops = json.loads(im.text.get("mons-loops", "[]"))
        im = im.convert("RGB")
        c0 = 0
        for l in loops:
            ok, res = check(im, l["mode"], c0, l["frames"])
            print(f"{'OK  ' if ok else 'REDO'} {l['mode']:5s} " + " | ".join(res))
            bad |= not ok
            c0 += l["frames"]
    else:
        im = Image.open(a.image).convert("RGB")
        ok, res = check(im, a.loop or "walk", 0, im.width // C)
        print(f"{'OK  ' if ok else 'REDO'} {a.loop or 'walk':5s} " + " | ".join(res))
        bad = not ok
    if bad:
        print("REDO = the frames of a row barely change: redraw that loop (its poses must follow the THIRD image, "
              "different in every frame; the FOURTH image is only the design, not the pose).")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
