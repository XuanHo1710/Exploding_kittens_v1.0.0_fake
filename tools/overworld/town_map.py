#!/usr/bin/env python3
"""
Mons Town showcase (review only, never an asset): one Hoenn-style town that uses every gym and the
base overworld pieces, laid out the way Emerald towns read:

  * a tree wall of whole 2x2 Emerald trees (4 cells thick, even-aligned) with three route exits
    (north, west, east), tall grass and a route sign just inside each exit;
  * a compact paved town square in the middle (fountain, flower beds, lamps) and a narrow 2-cell
    paved main street; everything else is soft dirt lanes, so the town feels walked-in, not gridded;
  * eight gyms in two rows of four around the square, each on its own themed ground that melts into
    the lawn, with a forecourt + lane of its own paving down to the street / promenade;
  * green pockets between the gyms (copses, pond, hedged flower garden), street trees alternating
    with lamps, and a beach with a paved promenade and the sea along the south edge.

  python3 town_map.py [--night]   ->  assets/overworld/_preview/town-map.png (+ town-map-night.png)
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "pieces"))

import city_map as CM  # noqa: E402
import gen_overworld as GO  # noqa: E402
import overworld_kit as K  # noqa: E402

W, H = 88, 68
CM.W, CM.H = W, H                      # City / render read the module-level size
ST_Y = (30, 31)                        # main street (2 rows)
ST_X = (43, 44)                        # north-south street (2 cols)
PROM_Y = (56, 57)                      # beach promenade
SQUARE = (37, 25, 50, 36)              # town square x0, y0, x1, y1
NORTH = {"grass": (5, 6), "psychic": (22, 6), "fire": (51, 6), "ground": (68, 6)}
SOUTH = {"rock": (5, 36), "poison": (22, 36), "electric": (51, 36), "water": (68, 36)}


def build():
    c = CM.City()
    # ---------------- tree wall (4 thick, even-aligned so it renders as whole 2x2 trees) + exits
    c.rect("forest", 0, 0, W - 1, H - 1)
    c.rect(None, 4, 4, W - 5, PROM_Y[1])
    c.rect(None, ST_X[0] - 1, 0, ST_X[1] + 1, 3)          # north exit
    c.rect(None, 0, ST_Y[0] - 1, 3, ST_Y[1] + 1)          # west exit
    c.rect(None, W - 4, ST_Y[0] - 1, W - 1, ST_Y[1] + 1)  # east exit
    for (x0, y0, x1, y1) in ((4, 4, 7, 5), (W - 8, 4, W - 5, 5), (4, 52, 5, 55), (W - 6, 52, W - 5, 55)):
        c.rect("forest", x0, y0, x1, y1)                  # softened inner corners of the wall
    # ---------------- beach + sea
    for x in range(W):
        for y in range(PROM_Y[1] + 1, H):
            c.slug[y][x] = "sand" if y < PROM_Y[1] + 5 else "shore"
    # ---------------- streets and square
    c.rect("paved-path", 0, ST_Y[0], W - 1, ST_Y[1])
    c.rect("paved-path", ST_X[0], 0, ST_X[1], PROM_Y[1])
    x0, y0, x1, y1 = SQUARE
    c.rect("paved-path", x0, y0, x1, y1)
    c.rect("paved-path", 4, PROM_Y[0], W - 5, PROM_Y[1])
    # ---------------- gyms
    for t, (sx, sy) in list(NORTH.items()) + list(SOUTH.items()):
        kit = CM.gym_kit(t)
        if kit["ground"]:
            c.quarters.append((kit["ground"], sx - 1, sy, sx + 12, sy + 14))
        c.gyms.append((t, sx + CM.STRUCT_OFF[0], sy + CM.STRUCT_OFF[1]))
        for y in range(sy + 1, sy + 11):
            for x in range(sx + 1, sx + 11):
                c.busy.add((x, y))
        fy = sy + 11
        c.rect(kit["floor"], sx + 3, fy, sx + 8, fy + 1)                    # forecourt
        target = ST_Y[0] if sy < ST_Y[0] else PROM_Y[0]
        c.rect(kit["floor"], sx + 5, fy, sx + 6, target - 1)               # lane to street / promenade
        if kit["others"]:                                                  # the gym's own features
            c.rect(kit["others"][0], sx - 1, sy + 5, sx, sy + 7, force=False)
            c.rect(kit["others"][-1], sx + 11, sy + 5, sx + 12, sy + 7, force=False)
        for i, lamp in enumerate(kit["lamps"][:1] * 2):
            c.prop(lamp, sx + (2 if i == 0 else 9), fy + 1)
        slots = [(sx - 1, sy + 3), (sx + 11, sy + 3), (sx - 1, sy + 10), (sx + 11, sy + 10),
                 (sx + 1, sy + 13), (sx + 9, sy + 13)]
        for (x, y), slug in zip(slots, kit["big"] + kit["small"] + kit["small"]):
            c.prop(slug, x, y)
        c.prop("sign", sx + 7, target - 1)
        # low wooden fence across the front of the gym ground, open at the lane, flowers behind it
        fy2 = sy + 14
        for x in list(range(sx, sx + 4)) + list(range(sx + 8, sx + 12)):
            if 0 <= fy2 < H and c.slug[fy2][x] is None and (x, fy2) not in c.busy:
                c.fences.append(("fence", x, fy2))
                c.busy.add((x, fy2))
        for x in (sx + 1, sx + 2, sx + 9, sx + 10):
            c.prop("flowers", x, fy2 - 1)
    # ---------------- town square: a roundabout pond with the fountain, streets run around it
    c.rect("water", 41, 27, 46, 34)
    c.under = {(x, y): "paved-path" for x in range(41, 47) for y in range(27, 35)}   # pond sits IN the plaza
    fountain = "water-fountain" if "water-fountain" in GO.PROPS else "rock-big"
    c.props.append((fountain, 43, 31))
    # square dressing stands on the paving itself (City.prop only allows lawn), so place it directly
    for (x, y) in ((x0 + 1, y0 + 1), (x1 - 1, y0 + 1), (x0 + 1, y1), (x1 - 1, y1)):
        c.props.append(("street-lamp", x, y))
    for (x, y) in ((x0 + 1, y0 + 3), (x0 + 2, y0 + 3), (x1 - 2, y0 + 3), (x1 - 1, y0 + 3),
                   (x0 + 1, y1 - 3), (x0 + 2, y1 - 3), (x1 - 2, y1 - 3), (x1 - 1, y1 - 3),
                   (x0 + 3, y0 + 1), (x1 - 3, y0 + 1), (x0 + 3, y1), (x1 - 3, y1)):
        c.props.append(("flowers", x, y))
    # ---------------- tree rows between the gyms (whole 2x2 trees, even-aligned)
    for gx in (18, 64):
        c.rect("forest", gx, 8, gx + 1, 19, force=False)
        c.rect("forest", gx, 38, gx + 1, 49, force=False)
    # ---------------- lawn dressing: groves and flower beds between the gyms and the street
    for (s, x, y) in (("tree", 16, 26), ("tree", 19, 26), ("tree", 33, 26), ("tree", 64, 26),
                      ("tree", 67, 26), ("tree", 52, 26), ("tree", 16, 54), ("tree", 19, 54),
                      ("tree", 64, 54), ("tree", 67, 54), ("tree", 33, 54), ("tree", 52, 54)):
        c.prop(s, x, y)
    for (x0b, x1b, y) in ((13, 15, 24), (22, 25, 24), (59, 62, 24), (76, 78, 24),
                          (13, 15, 53), (22, 25, 53), (59, 62, 53), (76, 78, 53)):
        for x in range(x0b, x1b + 1):
            c.prop("flowers", x, y)
    # ---------------- green pockets between the gyms
    for (gx0, gy0, gx1, gy1) in ((38, 6, 41, 9), (46, 6, 49, 9)):          # copses either side of N street
        c.rect("forest", gx0, gy0, gx1, gy1, force=False)
    c.rect("tall-grass", 37, 10, 41, 13, force=False)                    # just inside the north exit
    c.rect("tall-grass", 46, 10, 50, 13, force=False)
    c.rect("water", 38, 40, 41, 44, force=False)                          # park pond SW of the square
    c.rect("hedge", 46, 39, 50, 39, force=False)                          # hedged flower garden SE
    c.rect("hedge", 46, 39, 46, 44, force=False)
    c.rect("hedge", 50, 39, 50, 44, force=False)
    for x in (47, 48, 49):
        for y in (41, 43):
            c.prop("flowers", x, y)
    c.rect("tall-grass", 4, 26, 8, 28, force=False)                       # west exit grass
    c.rect("tall-grass", W - 9, 26, W - 5, 28, force=False)              # east exit grass
    c.rect("ledge", 37, 47, 41, 47, force=False)
    for (s, x, y) in (("tree", 38, 53), ("tree", 48, 53), ("bush", 41, 47), ("rock", 49, 47),
                      ("item-ball", 39, 12), ("sign", ST_X[0] - 1, 4), ("sign", 4, ST_Y[0] - 1),
                      ("sign", W - 5, ST_Y[0] - 1), ("rock-big", 79, 64), ("rock", 12, 61),
                      ("item-ball", 72, 60), ("mailbox", ST_X[0] - 2, 24), ("bush", 38, 46),
                      ("cut-tree", ST_X[1] + 2, 4), ("smash-rock", ST_X[0] - 3, 4)):
        c.prop(s, x, y)
    # ---------------- street dressing: trees alternate with lamps, skipping lanes and the square
    lanes = {sx + 5 for sx, _ in NORTH.values()} | {sx + 6 for sx, _ in NORTH.values()}
    for x in range(6, W - 6, 4):
        if x0 - 2 <= x <= x1 + 2 or any(abs(x - l) <= 2 for l in lanes):
            continue
        c.prop("street-lamp" if (x // 4) % 2 else "bush", x, ST_Y[0] - 1)
        c.prop("bush" if (x // 4) % 2 else "street-lamp", x, ST_Y[1] + 2)
    for x in range(8, W - 8, 6):                                          # promenade lamps
        c.prop("street-lamp", x, PROM_Y[0] - 1)
    return c


def main():
    GO.NIGHT = "--night" in sys.argv
    os.makedirs(GO.PREVIEW, exist_ok=True)
    c = build()
    for night, name in ((False, "town-map.png"), (True, "town-map-night.png"))[:2 if GO.NIGHT else 1]:
        K.up(CM.render(c, night)).save(os.path.join(GO.PREVIEW, name))
    print("wrote", os.path.join(GO.PREVIEW, "town-map.png"), f"{W}x{H} cells")


if __name__ == "__main__":
    main()
