#!/usr/bin/env python3
"""REFERENCE LOOK (agreed prototype), not the generator: shows the target style for the piece painters.
Usage: python3 prototype_route1.py <out_dir>"""
import math
import sys

from PIL import Image, ImageDraw

T = 16
OUT = sys.argv[1]
IO = (40, 48, 40)

ROUTE1 = [
    "TTTTTTTT==TTTTTTTTTT",  # 0  north exit -> Town B
    "TTTTTTTT==TTTTTTTTTT",
    "TT,,,,..==..,,,,,,TT",
    "TT,,,,..==..,,,,,,TT",
    "TT,,,,..==..,,,,,,TT",
    "TT......==....S...TT",
    "TT______==______..TT",  # ledges (hop south)
    "TT......==..R.....TT",
    "TTff....==......ffTT",
    "TTff....====....ffTT",
    "TT..TT....==..TT..TT",
    "TT..TT.oo.==..TT..TT",
    "TT,,,,,,,.==,,,,,.TT",
    "TT,,,,,,,.==,,,,,.TT",
    "TT,,,,,,,.==R,,,,.TT",
    "TT.....=====......TT",
    "TT~~~~.==.........TT",
    "TT~~~~.==....ff...TT",
    "TT~~~~.==.TT...FFFTT",
    "TT....R==.TT......TT",
    "TT_____==_______..TT",
    "TT.....==......,,,TT",
    "TT,,,..==......,,,TT",
    "TT,,,..==..S...,,,TT",
    "TT,,,..=======....TT",
    "TTff........==....TT",
    "TT..TT..oo..==....TT",
    "TT..TT......==....TT",
    "TTTTTTTTTTTT==TTTTTT",  # 28 south exit -> Town A
    "TTTTTTTTTTTT==TTTTTT",
]
W, H = len(ROUTE1[0]), len(ROUTE1)
assert all(len(r) == W for r in ROUTE1)

GRASS = [(168, 224, 120), (144, 208, 104), (120, 184, 88), (88, 152, 72), (64, 112, 64)]
TALL = [(120, 200, 96), (88, 168, 80), (64, 136, 72), (40, 96, 56)]
DIRT = [(240, 216, 160), (224, 196, 140), (200, 168, 116), (160, 128, 92)]
WATER = [(200, 240, 255), (120, 192, 248), (88, 160, 232), (64, 128, 208), (48, 96, 176)]
SAND = [(248, 232, 184), (232, 208, 152)]
TREE = [(120, 200, 96), (80, 168, 80), (56, 128, 72), (40, 96, 64), (28, 68, 52)]
BARK = [(168, 112, 72), (128, 80, 56), (88, 56, 48)]
ROCK = [(216, 208, 200), (176, 168, 168), (136, 128, 136), (96, 88, 104)]
WOOD = [(232, 184, 120), (200, 144, 88), (152, 104, 64), (104, 72, 56)]
FLOW = [(248, 96, 96), (255, 224, 96), (255, 255, 255)]


def g(c, r):
    if 0 <= r < H and 0 <= c < W:
        return ROUTE1[r][c]
    return "T"


def grass_px(x, y):
    # exact-repeat 16x16 tile with a few fixed tufts
    if (x, y) in ((3, 4), (5, 4), (4, 3), (11, 11), (13, 11), (12, 10)):
        return GRASS[2]
    if (x, y) in ((4, 4), (12, 11)):
        return GRASS[3]
    if (x, y) in ((8, 13), (1, 9)):
        return GRASS[0]
    return GRASS[1]


def tall_px(x, y):
    # two rows of chevron blades per tile
    yy = y % 8
    xx = x % 8
    if yy == 7:
        return TALL[3]
    blade = abs(xx - 3.5) * 1.1 + 1 >= 7 - yy if yy >= 2 else False
    if yy >= 2 and (abs(xx - 3.5) <= (yy - 1) * 0.6):
        return TALL[0] if xx < 4 and yy < 5 else TALL[1]
    return TALL[2] if yy > 3 else TALL[1]


def dirt_px(x, y):
    if (x, y) in ((4, 6), (11, 12), (9, 2)):
        return DIRT[2]
    if (x, y) in ((5, 6), (12, 12)):
        return DIRT[0]
    return DIRT[1]


def water_px(x, y, f=0):
    a = 2 * math.pi / 16
    v = math.sin(a * (x + f * 4) + 1.2 * math.sin(a * y * 2))
    if v > 0.85 and y % 8 in (2, 3):
        return WATER[0]
    return WATER[2] if v > -0.3 else WATER[3]


def paint(img, f=0):
    p = img.load()
    d = ImageDraw.Draw(img)
    # base layer
    for r in range(H):
        for c in range(W):
            ch = g(c, r)
            X, Y = c * T, r * T
            for y in range(T):
                for x in range(T):
                    if ch == ",":
                        col = tall_px(x, y)
                    elif ch == "=":
                        col = dirt_px(x, y)
                    elif ch == "~":
                        col = water_px(x, y, f)
                    else:
                        col = grass_px(x, y)
                    p[X + x, Y + y] = col
    # path autotile edges: soften toward grass, rounded outside corners
    for r in range(H):
        for c in range(W):
            if g(c, r) != "=":
                continue
            X, Y = c * T, r * T
            n, s, w_, e = g(c, r - 1) != "=", g(c, r + 1) != "=", g(c - 1, r) != "=", g(c + 1, r) != "="
            for i in range(T):
                if n:
                    p[X + i, Y] = GRASS[2]
                    p[X + i, Y + 1] = DIRT[0]
                if s:
                    p[X + i, Y + T - 1] = DIRT[3]
                if w_:
                    p[X, Y + i] = GRASS[2]
                    p[X + 1, Y + i] = DIRT[0]
                if e:
                    p[X + T - 1, Y + i] = DIRT[3]
            for (cn, cx, cy) in ((n and w_, 0, 0), (n and e, T - 2, 0), (s and w_, 0, T - 2), (s and e, T - 2, T - 2)):
                if cn:
                    for yy in range(2):
                        for xx in range(2):
                            p[X + cx + xx, Y + cy + yy] = GRASS[1]
    # water autotile: sandy bank + foam where water meets land
    for r in range(H):
        for c in range(W):
            if g(c, r) != "~":
                continue
            X, Y = c * T, r * T
            n, s, w_, e = g(c, r - 1) != "~", g(c, r + 1) != "~", g(c - 1, r) != "~", g(c + 1, r) != "~"
            if n:
                for i in range(T):
                    for yy, col in ((0, SAND[0]), (1, SAND[1]), (2, SAND[1]), (3, IO), (4, WATER[0]), (5, WATER[1])):
                        p[X + i, Y + yy] = col
            if s:
                for i in range(T):
                    p[X + i, Y + T - 1] = IO
                    p[X + i, Y + T - 2] = WATER[1]
            if w_:
                for i in range(T):
                    p[X, Y + i] = IO
                    if i > (5 if n else 0):
                        p[X + 1, Y + i] = WATER[1]
            if e:
                for i in range(T):
                    p[X + T - 1, Y + i] = IO
                    if i > (5 if n else 0):
                        p[X + T - 2, Y + i] = WATER[1]
    # ledges: grass top + short brown lip facing south (hop down)
    for r in range(H):
        for c in range(W):
            if g(c, r) != "_":
                continue
            X, Y = c * T, r * T
            for x in range(T):
                for y in range(8, T):
                    p[X + x, Y + y] = (IO if y == T - 1 else GRASS[3] if y == 8 else GRASS[4] if y == 9 else
                                       (184, 144, 100) if y < 12 else (144, 104, 76) if y < 14 else (112, 80, 64))
                if x % 5 == 2:
                    p[X + x, Y + 10] = GRASS[3]
            if g(c - 1, r) != "_":
                for y in range(8, T):
                    p[X, Y + y] = IO
            if g(c + 1, r) != "_":
                for y in range(8, T):
                    p[X + T - 1, Y + y] = IO
    # flowers (2-frame sway)
    for r in range(H):
        for c in range(W):
            if g(c, r) != "f":
                continue
            X, Y = c * T, r * T
            for i, (fx, fy) in enumerate(((3, 3), (11, 4), (6, 10), (13, 12))):
                fx += (f % 2) * (1 if i % 2 else -1)
                col = FLOW[i % 2]
                for dx, dy in ((0, -1), (-1, 0), (1, 0), (0, 1)):
                    p[X + fx + dx, Y + fy + dy] = col
                p[X + fx, Y + fy] = FLOW[2] if i % 2 else (255, 200, 64)
                p[X + fx, Y + fy + 2] = GRASS[3]
    # objects in painter's order (row by row): rocks, fences, signs, trees
    for r in range(H):
        for c in range(W):
            ch = g(c, r)
            X, Y = c * T, r * T
            if ch == "o":
                d.ellipse([X + 1, Y + 9, X + 15, Y + 15], fill=GRASS[3])
                d.ellipse([X + 1, Y + 2, X + 14, Y + 14], fill=ROCK[1], outline=(72, 64, 80))
                d.ellipse([X + 3, Y + 4, X + 9, Y + 9], fill=ROCK[0])
                d.line([X + 9, Y + 12, X + 12, Y + 9], fill=ROCK[3])
            elif ch == "F":
                d.rectangle([X, Y + 6, X + 15, Y + 8], fill=WOOD[1], outline=WOOD[3])
                d.rectangle([X, Y + 10, X + 15, Y + 11], fill=WOOD[2])
                for px in (2, 10):
                    d.rectangle([X + px, Y + 3, X + px + 3, Y + 14], fill=WOOD[0], outline=WOOD[3])
                d.line([X, Y + 15, X + 15, Y + 15], fill=GRASS[3])
            elif ch == "S":
                d.rectangle([X + 7, Y + 9, X + 8, Y + 15], fill=WOOD[3])
                d.rectangle([X + 1, Y + 1, X + 14, Y + 10], fill=WOOD[1], outline=WOOD[3])
                d.rectangle([X + 3, Y + 3, X + 12, Y + 8], fill=WOOD[0])
                d.line([X + 4, Y + 15, X + 11, Y + 15], fill=GRASS[3])
    # trees: one round tree per aligned 2x2 block, drawn bottom rows last so canopies overlap
    for r in range(0, H, 2):
        for c in range(0, W, 2):
            if all(g(c + dx, r + dy) == "T" for dx in (0, 1) for dy in (0, 1)):
                tree(p, d, c * T, r * T)


def tree(p, d, X, Y):
    # trunk
    d.rectangle([X + 13, Y + 22, X + 18, Y + 31], fill=BARK[1], outline=BARK[2])
    d.line([X + 14, Y + 23, X + 14, Y + 30], fill=BARK[0])
    d.ellipse([X + 6, Y + 27, X + 26, Y + 32], fill=GRASS[3])
    # canopy: three stacked lobes, lit from the top-left, outline in deep green
    blobs = [(16, 12, 17, 12), (6, 18, 9, 8), (26, 18, 9, 8), (16, 4, 11, 8), (9, 9, 8, 7), (23, 9, 8, 7)]
    pts = {}
    for (cx, cy, rx, ry) in blobs:
        for y in range(int(cy - ry), int(cy + ry) + 1):
            for x in range(int(cx - rx), int(cx + rx) + 1):
                q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
                if q < 1 and -3 <= x < 35 and -6 <= y < 27:
                    nx, ny = (x - cx) / rx, (y - cy) / ry
                    l = -(nx * 0.6 + ny * 0.8)
                    k = 0 if l > 0.55 else 1 if l > 0.05 else 2 if l > -0.45 else 3
                    if (x, y) not in pts or k < pts[(x, y)]:
                        pts[(x, y)] = k
    for (x, y), k in pts.items():
        edge = any((x + dx, y + dy) not in pts for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        col = TREE[4] if edge else TREE[k]
        if not edge and k == 1 and (x * 7 + y * 3) % 11 == 0:
            col = TREE[0]
        if 0 <= X + x < p_size[0] and 0 <= Y + y < p_size[1]:
            p[X + x, Y + y] = col


def night(img):
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, gg, b = px[x, y][:3]
            px[x, y] = (int(r * .46), int(gg * .5 + 4), min(255, int(b * .7 + 40)))
    return img


def overlay(img):
    ov = Image.blend(img, Image.new("RGB", img.size, (0, 0, 0)), 0.3)
    d = ImageDraw.Draw(ov, "RGBA")
    for r in range(H):
        for c in range(W):
            ch = g(c, r)
            X, Y = c * T, r * T
            if ch == ",":
                d.rectangle([X, Y, X + T - 1, Y + T - 1], fill=(255, 220, 60, 70))
            elif ch in "T~oFS":
                d.rectangle([X + 2, Y + 2, X + T - 3, Y + T - 3], outline=(255, 60, 60, 160))
            elif ch == "_":
                d.polygon([(X + 8, Y + 14), (X + 4, Y + 8), (X + 12, Y + 8)], fill=(120, 255, 160, 220))
            elif ch == "R":
                d.ellipse([X + 3, Y + 3, X + 12, Y + 12], fill=(90, 220, 255, 255), outline=IO)
    for (c, r) in ((8, 0), (9, 0), (12, H - 1), (13, H - 1)):
        d.rectangle([c * T, r * T, c * T + T - 1, r * T + T - 1], fill=(120, 120, 255, 140))
    return ov


p_size = (W * T, H * T)
day = Image.new("RGB", p_size)
paint(day)
up = lambda im: im.resize((im.width * 2, im.height * 2), Image.NEAREST)
frames = []
for f in range(4):
    im = Image.new("RGB", p_size)
    paint(im, f)
    frames.append(up(im))
nite = night(day.copy())
ov = overlay(day)
sheet = Image.new("RGB", (p_size[0] * 3 + 16, p_size[1]), (24, 20, 30))
sheet.paste(day, (0, 0))
sheet.paste(nite, (p_size[0] + 8, 0))
sheet.paste(ov, (p_size[0] * 2 + 16, 0))
up(sheet).save(OUT + "/proto-route1-sheet.png")
up(day).save(OUT + "/proto-route1-day.png")
frames[0].save(OUT + "/proto-route1-anim.gif", save_all=True, append_images=frames[1:], duration=250, loop=0)
print("ok", p_size)
