"""
Gym badges for the HUY HIỆU screen (decisions.md §10): one pin per Mons gym, drawn from shapes in code.

The look follows the user's reference panel (tmp/mons-refs/badges-reference.png, 2026-11-20): the classic
first-region badge shapes, one per gym by the gym it stands in for (data/battle/trainers.json): grass = rainbow
diamond, psychic = gold disc, electric = sun, water = drop, rock = grey gem, ground = leaf on a stem, poison = heart,
fire = flame. Every badge is redrawn here from polygons and ellipses (no pixel is taken from another file): coloured
layers, each lit from the top left (light / mid / dark), a dark outline around the whole and a white glint.

Writes assets/ui/Badges/:
  <gym>-badge.png          32x32, the earned badge (badge case)
  <gym>-badge-small.png    16x16, the same shapes at half size (trainer cards)
  <gym>-badge-locked.png   32x32, the dark silhouette of a badge not earned yet

Gen 3 rules: BGR555 colours, alpha 0 / 255, at most 15 colours per badge (one 4bpp palette).

    python3 tools/ui/badges.py
    python3 tools/ui/badges.py --sheet tmp/report/badges/badges-sheet.png
    python3 tools/gen3/check_gen3.py --quiet --grid 1 --max-palettes 99 assets/ui/Badges
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from PIL import Image, ImageDraw  # noqa: E402

import uikit as U  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(REPO, "assets", "ui", "Badges")
SS = 4                        # supersampling of the shape masks
LINE = (32, 32, 44)           # outline
LOCKED = (58, 62, 104)        # silhouette body (the UI kit's INK2)
ORDER = ["grass", "psychic", "electric", "water", "rock", "ground", "poison", "fire"]


# ---------------------------------------------------------------- shapes (32-unit space)
def P(*pts):
    return ("poly", pts)


def E(x0, y0, x1, y1):
    return ("ellipse", (x0, y0, x1, y1))


def L(w, *pts):
    return ("line", (w, pts))


def ramp(light, mid, dark):
    return [light, mid, dark]


def flat(c):
    return [c, c, c]


GREY = ramp((244, 244, 248), (196, 198, 206), (124, 126, 140))
BLUE = ramp((128, 204, 255), (48, 136, 232), (24, 72, 168))
YELLOW = ramp((255, 244, 128), (248, 200, 40), (184, 124, 24))
ORANGE = ramp((255, 176, 96), (240, 96, 40), (168, 36, 32))
PINK = ramp((255, 222, 240), (248, 168, 208), (200, 100, 152))
GOLD = ramp((255, 248, 168), (240, 208, 48), (176, 132, 24))
RED = ramp((255, 120, 104), (224, 40, 44), (140, 16, 36))
GREEN = ramp((128, 208, 104), (56, 148, 68), (24, 88, 52))
STEM = ramp((248, 252, 248), (208, 220, 212), (136, 152, 144))

C = (16, 16)
DIAMOND = [(16, 1.5), (23.25, 8.75), (30.5, 16), (23.25, 23.25), (16, 30.5), (8.75, 23.25), (1.5, 16), (8.75, 8.75)]
RAINBOW = [(232, 56, 56), (248, 144, 40), (248, 216, 56), (96, 192, 72), (40, 168, 152), (56, 112, 224), (96, 72, 200),
           (176, 72, 192)]


def star(cx, cy, r_out, r_in, n, turn=0.0):
    import math
    pts = []
    for k in range(2 * n):
        a = math.pi * k / n + turn - math.pi / 2
        r = r_out if k % 2 == 0 else r_in
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return P(*pts)


# gym -> layers drawn in order: (shapes, ramp, bevel); glint points (32 units)
BADGES = {
    "rock": ([([P((9, 5), (23, 5), (29.5, 12), (29.5, 20), (23, 27), (9, 27), (2.5, 20), (2.5, 12))], GREY, True),
              ([P((10.5, 7.5), (21.5, 7.5), (25, 12), (7, 12))], flat((236, 236, 242)), False),
              ([P((25, 12), (27.5, 13), (27.5, 19), (25, 20))], flat((164, 166, 178)), False),
              ([P((7, 20), (25, 20), (21.5, 24.5), (10.5, 24.5))], flat((150, 152, 166)), False)],
             [(10, 9), (11, 9), (12, 9)]),
    "water": ([([E(7, 11, 25, 29.5), P((16, 1.5), (24.2, 16.5), (7.8, 16.5))], BLUE, True),
               ([E(10, 17, 14, 24)], flat((168, 220, 255)), False)],
              [(11, 18), (11, 19), (14, 9)]),
    "electric": ([([star(16, 16, 15, 11, 8, 0.39)], YELLOW, True),
                  ([E(7, 7, 25, 25)], ORANGE, True),
                  ([E(10, 10, 15, 15)], flat((255, 200, 120)), False)],
                 [(11, 11), (12, 11), (11, 12)]),
    "grass": ([([P(C, DIAMOND[k], DIAMOND[(k + 1) % 8])], flat(RAINBOW[k]), False) for k in range(8)]
              + [([P((16, 7), (25, 16), (16, 25), (7, 16))], flat(LINE), False),
                 ([P((16, 9), (23, 16), (16, 23), (9, 16))], ramp((255, 255, 255), (228, 228, 236), (168, 168, 184)), True),
                 ([P((16, 13), (19, 16), (16, 19), (13, 16))], flat((188, 188, 204)), False)],
              [(13, 11)]),
    "poison": ([([E(3, 5, 17.5, 19.5), E(14.5, 5, 29, 19.5), P((3.8, 15), (28.2, 15), (16, 29.5))], PINK, True),
                ([E(7, 8, 11.5, 12.5)], flat((255, 238, 248)), False)],
               [(8, 9), (9, 9)]),
    "psychic": ([([E(2, 2, 30, 30)], GOLD, True),
                 ([E(7.5, 7.5, 24.5, 24.5)], ramp((180, 140, 28), (252, 228, 96), (255, 250, 196)), True)],
                [(7, 6), (8, 6), (6, 7)]),
    "fire": ([([E(5, 10, 27, 30), P((6.5, 19), (3.5, 6), (12, 13)), P((10.5, 14), (16, 1.5), (21.5, 14)),
                P((20, 13), (28.5, 6), (25.5, 19))], RED, True),
              ([P((12, 21), (16, 13.5), (20, 21), (18.5, 26), (13.5, 26))], flat((176, 22, 40)), False)],
             [(9, 15), (9, 16), (10, 14)]),
    "ground": ([([L(2.6, (18, 18), (29, 29))], STEM, True),
                ([P((2.5, 2.5), (10, 3.5), (13, 5.5), (17.5, 7), (20.5, 11), (21.5, 16), (19.5, 20), (16, 21.5), (11, 20.5),
                    (7, 17.5), (5.5, 13), (3.5, 9))], GREEN, True),
                ([L(1.3, (5, 5), (18.5, 18.5)), L(1.1, (9, 9), (14.5, 7.5)), L(1.1, (12.5, 12.5), (18.5, 11.5)),
                  L(1.1, (9, 9), (7.5, 14.5)), L(1.1, (12.5, 12.5), (11, 18.5))], flat((30, 100, 56)), False)],
               [(5, 4), (6, 4)]),
}


def mask(shapes, size):
    """Shapes in 32-unit space -> an L mask of `size` px (supersampled, then cut at half cover)."""
    k = size / 32 * SS
    m = Image.new("L", (size * SS, size * SS), 0)
    d = ImageDraw.Draw(m)
    for kind, args in shapes:
        if kind == "poly":
            d.polygon([(x * k, y * k) for x, y in args], fill=255)
        elif kind == "ellipse":
            d.ellipse([v * k for v in args], fill=255)
        elif kind == "line":
            w, pts = args
            d.line([(x * k, y * k) for x, y in pts], fill=255, width=max(1, round(w * k)))
            for x, y in (pts[0], pts[-1]):            # round caps
                r = w * k / 2
                d.ellipse([x * k - r, y * k - r, x * k + r, y * k + r], fill=255)
    return m.resize((size, size), Image.BOX).point(lambda v: 255 if v >= 128 else 0)


def draw(gym, size, locked=False):
    layers, glints = BADGES[gym]
    img = U.canvas(size, size)
    union = Image.new("L", (size, size), 0)
    depth = 2 if size >= 32 else 1
    for shapes, rmp, bevel in layers:
        m = mask(shapes, size)
        union.paste(255, (0, 0), m)
        mp = m.load()

        def inside(x, y):
            return 0 <= x < size and 0 <= y < size and mp[x, y]
        for y in range(size):
            for x in range(size):
                if not mp[x, y]:
                    continue
                c = rmp[1]
                if bevel:
                    if any(not inside(x - j, y - j) for j in range(1, depth + 1)):
                        c = rmp[0]
                    elif any(not inside(x + j, y + j) for j in range(1, depth + 1)):
                        c = rmp[2]
                img.putpixel((x, y), (LOCKED if locked else c) + (255,))
    up = union.load()

    def solid(x, y):
        return 0 <= x < size and 0 <= y < size and up[x, y]
    for y in range(size):                       # the outline: edge pixels of the whole badge
        for x in range(size):
            if up[x, y] and any(not solid(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                img.putpixel((x, y), (U.INK if locked else LINE) + (255,))
    if not locked:
        pts = glints if size >= 32 else glints[:1]
        for gx, gy in pts:
            p = (int(gx * size / 32), int(gy * size / 32))
            if up[p]:
                img.putpixel(p, U.WHITE + (255,))
    return U.finish(img)


def export(out=OUT):
    os.makedirs(out, exist_ok=True)
    made = []
    for gym in ORDER:
        for name, img in ((f"{gym}-badge.png", draw(gym, 32)), (f"{gym}-badge-small.png", draw(gym, 16)),
                          (f"{gym}-badge-locked.png", draw(gym, 32, locked=True))):
            img.save(os.path.join(out, name))
            made.append(name)
    return made


def sheet(path):
    """Review sheet: every badge at x4 on cream, earned / small / locked (for tmp/ only)."""
    W = len(ORDER) * 36 + 4
    img = Image.new("RGBA", (W, 36 + 20 + 36 + 4), U.CREAM + (255,))
    for i, gym in enumerate(ORDER):
        img.alpha_composite(draw(gym, 32), (4 + i * 36, 2))
        img.alpha_composite(draw(gym, 16), (12 + i * 36, 38))
        img.alpha_composite(draw(gym, 32, locked=True), (4 + i * 36, 56))
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    img.resize((img.width * 4, img.height * 4), Image.NEAREST).save(path)


def main():
    ap = argparse.ArgumentParser(description="Draw the 8 gym badges into assets/ui/Badges/.")
    ap.add_argument("--sheet", help="write only a x4 review sheet to this path (tmp/)")
    a = ap.parse_args()
    if a.sheet:
        sheet(a.sheet)
    else:
        print(len(export()), "badge files in", os.path.relpath(OUT, REPO))


if __name__ == "__main__":
    main()
