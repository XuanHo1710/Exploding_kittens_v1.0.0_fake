"""Vẽ bộ sân khấu 3D cho trận đấu Astral Expedition: texture mặt đất lát liền mạch, miếng nền sân đấu, panorama 360°
nối liền hai đầu và tấm đạo cụ (cột đá, vòm vỡ, đá, bụi cây, cỏ cao) dựng quanh sân.

Mỗi vùng có một "biome" (bảng màu + họa tiết); hiện có vùng 01-dawn-meadow. Kết quả tất định (seed cố định).

    py tools/battle-scenes/arena3d.py 01-dawn-meadow [--preview tmp/arena-review]

Ghi vào database-astral-expedition/battle-scenes/<map>/arena/: ground.png (256×256, lát 2 chiều), floor.png
(512×512, nền giữa sân, có alpha), panorama.png (2048×512, lát ngang), props.png + props.json (khung từng đạo cụ).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
for _p in (os.path.join(REPO, "tools", "units", ".pydeps"), os.path.join(REPO, "tools", "gen3")):
    if os.path.isdir(_p) and _p not in sys.path:
        sys.path.insert(0, _p)

from PIL import Image, ImageDraw  # noqa: E402

import gen3  # noqa: E402

OUT_ROOT = os.path.join(REPO, "database-astral-expedition", "battle-scenes")
OUTLINE = (27, 23, 38)
BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]

# ------------------------------------------------------------------ biome palettes (màu lấy từ backdrop từng vùng)

BIOMES = {
    "01-dawn-meadow": {
        "grass": [(16, 32, 24), (32, 41, 32), (32, 57, 41), (57, 74, 41), (74, 90, 41), (82, 106, 49), (106, 123, 57), (139, 150, 74)],
        "dirt": [(57, 57, 49), (74, 74, 57), (98, 90, 65), (115, 106, 74), (131, 123, 82)],
        "stone": [(41, 45, 41), (57, 57, 49), (74, 74, 57), (98, 98, 74), (131, 123, 82), (148, 148, 98), (172, 172, 123)],
        "moss": [(41, 66, 41), (66, 98, 49), (98, 131, 57)],
        "flowers": [(230, 222, 172), (222, 184, 90), (190, 156, 206)],
        "sky": [(54, 86, 110), (82, 118, 132), (128, 156, 150), (186, 186, 150), (232, 206, 150)],
        "cloud": [(150, 160, 156), (198, 196, 172), (238, 228, 196)],
        "far": [(70, 96, 108), (88, 114, 120), (112, 136, 132)],
        "hills": [(46, 72, 58), (58, 88, 62), (78, 104, 66)],
        "leaf": [(16, 32, 24), (32, 50, 34), (46, 72, 40), (66, 96, 46), (98, 124, 58)],
        "bark": [(41, 33, 30), (66, 52, 41), (90, 72, 54)],
        "water": [(16, 41, 49), (24, 57, 66), (49, 90, 98), (98, 140, 140)],
    },
}


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def ramp(colors, v):
    """Chọn màu theo v ∈ [0, 1] trên dãy màu."""
    v = max(0.0, min(0.999, v))
    return colors[int(v * len(colors))]


def dither_ramp(colors, v, x, y):
    """Như ramp nhưng chuyển tông bằng ma trận Bayer 4×4 (kiểu pixel art cổ điển)."""
    v = max(0.0, min(0.999, v)) * (len(colors) - 1)
    i = int(v)
    frac = v - i
    j = min(len(colors) - 1, i + (1 if frac * 16 > BAYER4[y % 4][x % 4] + 0.5 else 0))
    return colors[j]


class TileNoise:
    """Nhiễu giá trị tuần hoàn (lát liền mạch) theo chu kỳ px × py."""

    def __init__(self, seed, cells_x, cells_y):
        rnd = random.Random(seed)
        self.cx, self.cy = cells_x, cells_y
        self.g = [[rnd.random() for _ in range(cells_x)] for _ in range(cells_y)]

    def at(self, u, v):
        # u, v ∈ [0, 1) tuần hoàn
        x = (u % 1.0) * self.cx
        y = (v % 1.0) * self.cy
        x0, y0 = int(x), int(y)
        fx, fy = x - x0, y - y0
        fx = fx * fx * (3 - 2 * fx)
        fy = fy * fy * (3 - 2 * fy)
        g = self.g
        a = g[y0 % self.cy][x0 % self.cx]
        b = g[y0 % self.cy][(x0 + 1) % self.cx]
        c = g[(y0 + 1) % self.cy][x0 % self.cx]
        d = g[(y0 + 1) % self.cy][(x0 + 1) % self.cx]
        return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy


def fbm(noises, u, v):
    total = 0.0
    weight = 0.0
    amp = 1.0
    for n in noises:
        total += n.at(u, v) * amp
        weight += amp
        amp *= 0.5
    return total / weight


def wrap_put(px, w, h, x, y, c):
    px[x % w, y % h] = c


# ------------------------------------------------------------------ ground tile (256×256, lát 2 chiều)

def draw_ground(b, seed=11, size=256):
    rnd = random.Random(seed)
    im = Image.new("RGB", (size, size))
    px = im.load()
    noises = [TileNoise(seed + i, 4 * 2 ** i, 4 * 2 ** i) for i in range(4)]
    dirt_noise = [TileNoise(seed + 40 + i, 6 * 2 ** i, 6 * 2 ** i) for i in range(3)]
    grass = b["grass"][2:7]
    for y in range(size):
        for x in range(size):
            n = fbm(noises, x / size, y / size)
            d = fbm(dirt_noise, x / size, y / size)
            if d > 0.72:
                px[x, y] = dither_ramp(b["dirt"][1:5], (d - 0.72) / 0.25 * 0.6 + n * 0.4, x, y)
            elif d > 0.66:
                px[x, y] = dither_ramp([b["grass"][3], b["dirt"][2], b["grass"][4]], n, x, y)
            else:
                px[x, y] = dither_ramp(grass, n * 1.1 - 0.05, x, y)
    # ngọn cỏ: nét dọc ngắn sáng / tối
    for _ in range(2600):
        x, y = rnd.randrange(size), rnd.randrange(size)
        if px[x % size, y % size] in b["dirt"]:
            continue
        hgt = rnd.choice((2, 3, 3, 4))
        light = rnd.random() < 0.6
        col = b["grass"][6] if light else b["grass"][1]
        for k in range(hgt):
            wrap_put(px, size, size, x + (1 if k == hgt - 1 and rnd.random() < 0.4 else 0), y - k, col)
        if light:
            wrap_put(px, size, size, x, y - hgt, b["grass"][7])
    # cụm cỏ ba lá
    for _ in range(70):
        x, y = rnd.randrange(size), rnd.randrange(size)
        for dx, dy in ((0, 0), (1, 0), (0, 1), (-1, 0), (0, -1), (2, -1), (-2, 1)):
            wrap_put(px, size, size, x + dx, y + dy, b["grass"][5] if (dx + dy) % 2 else b["grass"][6])
        wrap_put(px, size, size, x, y, b["grass"][7])
    # hoa nhỏ
    for _ in range(46):
        x, y = rnd.randrange(size), rnd.randrange(size)
        c = rnd.choice(b["flowers"])
        for dx, dy in ((0, -1), (-1, 0), (1, 0), (0, 1)):
            wrap_put(px, size, size, x + dx, y + dy, c)
        wrap_put(px, size, size, x, y, b["flowers"][1])
        wrap_put(px, size, size, x + 1, y + 2, b["grass"][1])
    # sỏi
    for _ in range(40):
        x, y = rnd.randrange(size), rnd.randrange(size)
        w = rnd.choice((2, 3, 4))
        for dx in range(w):
            wrap_put(px, size, size, x + dx, y, b["stone"][4])
            wrap_put(px, size, size, x + dx, y + 1, b["stone"][2])
        wrap_put(px, size, size, x, y, b["stone"][5])
        for dx in range(w):
            wrap_put(px, size, size, x + dx, y + 2, b["grass"][1])
    return im


# ------------------------------------------------------------------ arena floor (512×512, nền giữa sân, alpha)

def draw_floor(b, seed=23, size=512):
    rnd = random.Random(seed)
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = im.load()
    noises = [TileNoise(seed + i, 5 * 2 ** i, 5 * 2 ** i) for i in range(4)]
    c = size / 2
    for y in range(size):
        for x in range(size):
            dx, dy = (x - c) / c, (y - c) / c
            r = math.hypot(dx, dy * 1.12)
            n = fbm(noises, x / size, y / size)
            edge = 1.0 - r + (n - 0.5) * 0.5
            if edge <= 0.06 or edge * 16 < BAYER4[y % 4][x % 4] * 0.12:
                continue
            # đất giẫm mòn ở giữa, cỏ thưa ở rìa
            wear = max(0.0, min(1.0, (edge - 0.1) * 1.6 + (n - 0.5) * 0.8))
            if wear > 0.55:
                px[x, y] = dither_ramp(b["dirt"], 0.25 + n * 0.6, x, y) + (255,)
            elif wear > 0.32:
                px[x, y] = dither_ramp([b["grass"][3], b["dirt"][2], b["grass"][4], b["dirt"][3]], n, x, y) + (255,)
            else:
                px[x, y] = dither_ramp(b["grass"][3:7], n, x, y) + (255,)
    # vết bánh / dấu chân tối và đá vụn
    draw = ImageDraw.Draw(im)
    for _ in range(26):
        a = rnd.random() * math.tau
        rr = rnd.uniform(0.1, 0.62) * c
        x, y = c + math.cos(a) * rr, c + math.sin(a) * rr * 0.9
        if px[int(x), int(y)][3] == 0:
            continue
        w = rnd.randint(2, 4)
        draw.ellipse((x - w, y - w * 0.6, x + w, y + w * 0.6), fill=b["dirt"][1] + (255,))
        draw.point((x - w + 1, y - 1), fill=b["dirt"][4] + (255,))
    for _ in range(90):
        x, y = rnd.uniform(c * 0.4, c * 1.6), rnd.uniform(c * 0.4, c * 1.6)
        if px[int(x), int(y)][3] == 0:
            continue
        draw.rectangle((x, y, x + 1, y), fill=b["stone"][5] + (255,))
        draw.point((x, y + 1), fill=b["stone"][1] + (255,))
    return im


# ------------------------------------------------------------------ panorama (2048×512, lát ngang)

def ridge(seed, x, w, octaves):
    """Đường sống núi tuần hoàn theo x (tổng sin tần số nguyên để nối liền hai đầu)."""
    rnd = random.Random(seed)
    v = 0.0
    amp = 1.0
    total = 0.0
    for i in range(octaves):
        f = rnd.randint(2 + i * 2, 4 + i * 4)
        ph = rnd.random() * math.tau
        v += math.sin(x / w * math.tau * f + ph) * amp
        total += amp
        amp *= 0.55
    return v / total


def crown(draw, x, y, r, leaf, rnd, w):
    """Tán cây tròn: thân tối, mảng sáng trên-trái, viền tối; vẽ thêm bản sao ở hai mép để lát ngang."""
    for ox in (0, -w, w):
        cx = x + ox
        if cx + r < 0 or cx - r > w:
            continue
        draw.ellipse((cx - r, y - r, cx + r, y + r * 0.9), fill=leaf[1])
        draw.ellipse((cx - r * 0.78, y - r * 0.92, cx + r * 0.5, y + r * 0.35), fill=leaf[2])
        draw.ellipse((cx - r * 0.55, y - r * 0.86, cx + r * 0.1, y - r * 0.1), fill=leaf[3])
        for _ in range(int(r * 0.9)):
            a = rnd.random() * math.tau
            rr = rnd.random() * r * 0.75
            px, py = cx + math.cos(a) * rr - r * 0.2, y + math.sin(a) * rr * 0.8 - r * 0.25
            draw.rectangle((px, py, px + 1, py), fill=leaf[4] if rnd.random() < 0.4 else leaf[3])


def stone_block(draw, x0, y0, x1, y1, st, moss, rnd):
    draw.rectangle((x0, y0, x1, y1), fill=st[3], outline=OUTLINE)
    draw.rectangle((x0 + 1, y0 + 1, x1 - 1, y0 + 2), fill=st[5])
    draw.rectangle((x1 - 2, y0 + 1, x1 - 1, y1 - 1), fill=st[2])
    for _ in range(max(1, (x1 - x0) // 10)):
        cx = rnd.randint(x0 + 2, max(x0 + 2, x1 - 3))
        draw.line((cx, y0 + 3, cx + rnd.randint(-2, 2), y1 - 2), fill=st[1])
    for x in range(x0 + 1, x1):
        if rnd.random() < 0.55:
            draw.line((x, y0, x, y0 + rnd.randint(0, 3)), fill=moss[rnd.randint(0, 2)])


def draw_ruin(draw, x, base, kind, b, rnd):
    st, moss = b["stone"], b["moss"]
    if kind == "arch":
        w, h = 120, 150
        for side in (0, 1):
            px0 = x + (0 if side == 0 else w - 26)
            for k in range(6):
                y1 = base - k * 22
                stone_block(draw, px0, y1 - 22, px0 + 26, y1, st, moss, rnd)
        draw.arc((x + 6, base - h - 40, x + w - 6, base - h + 60), 180, 360, fill=OUTLINE, width=24)
        draw.arc((x + 8, base - h - 38, x + w - 8, base - h + 58), 185, 355, fill=st[3], width=20)
        draw.arc((x + 10, base - h - 36, x + w - 10, base - h + 56), 200, 340, fill=st[5], width=3)
    else:
        hgt = rnd.randint(3, 6)
        for k in range(hgt):
            y1 = base - k * 22
            stone_block(draw, x, y1 - 22, x + 28, y1, st, moss, rnd)
        draw.polygon([(x - 2, base - hgt * 22), (x + 30, base - hgt * 22), (x + 22, base - hgt * 22 - 8), (x + 6, base - hgt * 22 - 12)], fill=st[4], outline=OUTLINE)


def draw_panorama(b, seed=37, w=2048, h=512):
    rnd = random.Random(seed)
    im = Image.new("RGB", (w, h))
    px = im.load()
    horizon = 300
    # trời: dải màu bình minh, chuyển tông bằng Bayer
    for y in range(h):
        t = y / horizon
        for x in range(w):
            px[x, y] = dither_ramp(b["sky"], t, x, y) if y < horizon else b["sky"][-1]
    draw = ImageDraw.Draw(im)
    # mây
    for _ in range(14):
        cx, cy = rnd.randrange(w), rnd.randint(40, 190)
        lw = rnd.randint(70, 180)
        for k in range(7):
            ox = rnd.randint(-lw // 2, lw // 2)
            rr = rnd.randint(12, 26)
            for dup in (0, -w, w):
                draw.ellipse((cx + ox + dup - rr * 1.6, cy - rr, cx + ox + dup + rr * 1.6, cy + rr * 0.7), fill=b["cloud"][1])
                draw.ellipse((cx + ox + dup - rr * 1.3, cy - rr, cx + ox + dup + rr * 1.2, cy), fill=b["cloud"][2])
        for dup in (0, -w, w):
            draw.rectangle((cx - lw // 2 + dup, cy + 8, cx + lw // 2 + dup, cy + 11), fill=b["cloud"][0])
    # núi xa → đồi → rừng
    layers = [
        (b["far"], 230, 46, 3, 101),
        (b["hills"], 278, 30, 4, 202),
    ]
    for cols, base, amp, octv, sd in layers:
        for x in range(w):
            top = int(base + ridge(sd, x, w, octv) * amp)
            for y in range(top, h):
                shade = min(1.0, (y - top) / 60)
                px[x, y] = dither_ramp(cols, 0.95 - shade * 0.7, x, y)
            px[x, top] = cols[-1]
    # rừng xa: tán nhỏ, ám màu không khí (tạo chiều sâu)
    mist = [lerp(c, b["far"][1], 0.55) for c in b["leaf"]]
    for i in range(260):
        x = rnd.randrange(w)
        r = rnd.randint(10, 20)
        crown(draw, x, 318 + rnd.randint(-14, 8), r, mist, rnd, w)
    for y in range(326, 360):
        for x in range(w):
            if (x + y) % 3 == 0:
                px[x, y] = mist[2]
    # rừng gần: tán to nhỏ khác nhau, thân thấp
    trunk_y = 430
    for i in range(150):
        x = rnd.randrange(w)
        r = rnd.choice((18, 24, 30, 36, 44, 52))
        y = trunk_y - r - rnd.randint(0, 46)
        for dup in (0, -w, w):
            draw.rectangle((x + dup - 2, y + r * 0.6, x + dup + 2, trunk_y), fill=b["bark"][0])
        crown(draw, x, y, r, b["leaf"], rnd, w)
    # bụi cây sát mặt đất, rồi dải cỏ trùng màu mặt đất
    for i in range(260):
        x = rnd.randrange(w)
        r = rnd.randint(10, 22)
        crown(draw, x, 440 + rnd.randint(-6, 10), r, [b["grass"][1], b["grass"][2], b["grass"][3], b["grass"][5], b["grass"][6]], rnd, w)
    for y in range(458, h):
        t = (y - 458) / (h - 458)
        for x in range(w):
            px[x, y] = dither_ramp(b["grass"][2:6], 0.75 - t * 0.5, x, y)
    for _ in range(3000):
        x, y = rnd.randrange(w), rnd.randint(452, h - 2)
        px[x, y] = b["grass"][6] if rnd.random() < 0.6 else b["grass"][1]
    return im


# ------------------------------------------------------------------ props (đạo cụ dựng quanh sân)

def prop_canvas(w, h):
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def prop_pillar(b, rnd, broken=False):
    w, h = 44, 170
    im = prop_canvas(w, h)
    d = ImageDraw.Draw(im)
    blocks = rnd.randint(3, 4) if broken else 6
    y = h - 2
    for k in range(blocks):
        stone_block(d, 6, y - 26, 37, y, b["stone"], b["moss"], rnd)
        y -= 26
    if not broken:
        d.rectangle((2, y - 10, 41, y), fill=b["stone"][4], outline=OUTLINE)
        d.rectangle((3, y - 9, 40, y - 8), fill=b["stone"][6])
    else:
        d.polygon([(6, y), (37, y), (30, y - 9), (14, y - 4)], fill=b["stone"][3], outline=OUTLINE)
    # dây leo
    for _ in range(3):
        x = rnd.randint(8, 34)
        yy = rnd.randint(y, h - 40)
        for k in range(rnd.randint(14, 40)):
            d.point((x + int(math.sin(k / 4) * 2), yy + k), fill=b["moss"][k % 3])
    return im


def prop_arch(b, rnd):
    w, h = 190, 190
    im = prop_canvas(w, h)
    d = ImageDraw.Draw(im)
    for side in (0, 1):
        x0 = 4 if side == 0 else w - 38
        y = h - 2
        for k in range(5):
            stone_block(d, x0, y - 24, x0 + 34, y, b["stone"], b["moss"], rnd)
            y -= 24
    d.arc((4, 6, w - 4, 150), 180, 360, fill=OUTLINE, width=30)
    d.arc((6, 8, w - 6, 148), 182, 358, fill=b["stone"][3], width=26)
    d.arc((8, 10, w - 8, 146), 195, 345, fill=b["stone"][5], width=4)
    for x in range(10, w - 10, 3):
        if rnd.random() < 0.6:
            d.line((x, 12 + abs(x - w / 2) * 0.3, x, 18 + abs(x - w / 2) * 0.3 + rnd.randint(0, 6)), fill=b["moss"][rnd.randint(0, 2)])
    return im


def prop_rocks(b, rnd):
    w, h = 120, 70
    im = prop_canvas(w, h)
    d = ImageDraw.Draw(im)
    for k in range(4):
        rx = rnd.randint(10, 26)
        cx = 18 + k * 26 + rnd.randint(-4, 4)
        cy = h - rx // 2 - 3
        d.ellipse((cx - rx, cy - rx * 0.8, cx + rx, cy + rx * 0.55), fill=b["stone"][3], outline=OUTLINE)
        d.ellipse((cx - rx * 0.7, cy - rx * 0.75, cx + rx * 0.2, cy - rx * 0.1), fill=b["stone"][5])
        d.ellipse((cx - rx * 0.6, cy - rx * 0.85, cx + rx * 0.3, cy - rx * 0.45), fill=b["moss"][1])
    return im


def prop_bush(b, rnd):
    w, h = 110, 70
    im = prop_canvas(w, h)
    d = ImageDraw.Draw(im)
    leaf = [b["grass"][1], b["grass"][2], b["grass"][4], b["grass"][5], b["grass"][6]]
    for k in range(6):
        r = rnd.randint(14, 22)
        x = 16 + k * 16 + rnd.randint(-3, 3)
        y = h - r + rnd.randint(-6, 2)
        d.ellipse((x - r - 1, y - r - 1, x + r + 1, y + r * 0.9 + 1), fill=OUTLINE)
    for k in range(6):
        r = rnd.randint(13, 21)
        x = 16 + k * 16 + rnd.randint(-3, 3)
        y = h - r + rnd.randint(-6, 2)
        d.ellipse((x - r, y - r, x + r, y + r * 0.9), fill=leaf[1])
        d.ellipse((x - r * 0.7, y - r * 0.9, x + r * 0.4, y + r * 0.2), fill=leaf[2])
        d.ellipse((x - r * 0.5, y - r * 0.8, x, y - r * 0.2), fill=leaf[3])
    for _ in range(18):
        x, y = rnd.randint(8, w - 8), rnd.randint(10, h - 12)
        if im.getpixel((x, y))[3]:
            d.point((x, y), fill=rnd.choice(b["flowers"]))
    return im


def prop_tallgrass(b, rnd):
    w, h = 64, 48
    im = prop_canvas(w, h)
    d = ImageDraw.Draw(im)
    for _ in range(26):
        x = rnd.randint(4, w - 4)
        hh = rnd.randint(16, 44)
        bend = rnd.randint(-6, 6)
        col = b["grass"][rnd.randint(4, 7)]
        d.line((x, h - 1, x + bend, h - hh), fill=col, width=2)
        d.line((x + 1, h - 1, x + bend + 1, h - hh + 2), fill=b["grass"][2])
    return im


PROP_MAKERS = [
    ("pillar", lambda b, r: prop_pillar(b, r), 5.2),
    ("pillar_broken", lambda b, r: prop_pillar(b, r, True), 3.6),
    ("arch", prop_arch, 6.8),
    ("rocks", prop_rocks, 1.7),
    ("bush", prop_bush, 1.9),
    ("tallgrass", prop_tallgrass, 1.1),
]


def build_props(b, seed=59):
    rnd = random.Random(seed)
    parts = [(name, maker(b, rnd), world_h) for name, maker, world_h in PROP_MAKERS]
    width = sum(im.width for _, im, _ in parts) + 2 * len(parts)
    height = max(im.height for _, im, _ in parts)
    atlas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    frames = []
    x = 0
    for name, im, world_h in parts:
        atlas.alpha_composite(im, (x, height - im.height))
        frames.append({"name": name, "x": x, "y": height - im.height, "w": im.width, "h": im.height, "worldH": world_h})
        x += im.width + 2
    return atlas, {"width": width, "height": height, "frames": frames}


# ------------------------------------------------------------------ main


def gen3_pass(im):
    """BGR555 + alpha 0/255 (quy ước Gen 3 của dự án)."""
    return gen3.to_gen3(im)


def build(map_id, preview=None):
    b = BIOMES[map_id]
    out = os.path.join(OUT_ROOT, map_id, "arena")
    os.makedirs(out, exist_ok=True)
    ground = gen3_pass(draw_ground(b))
    floor = gen3_pass(draw_floor(b))
    pano = gen3_pass(draw_panorama(b))
    props, meta = build_props(b)
    props = gen3_pass(props)
    ground.save(os.path.join(out, "ground.png"))
    floor.save(os.path.join(out, "floor.png"))
    pano.save(os.path.join(out, "panorama.png"))
    props.save(os.path.join(out, "props.png"))
    with open(os.path.join(out, "props.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1)
    if preview:
        os.makedirs(preview, exist_ok=True)
        tiled = Image.new("RGB", (512, 512))
        for ox in (0, 256):
            for oy in (0, 256):
                tiled.paste(ground.convert("RGB"), (ox, oy))
        tiled.resize((1024, 1024), Image.NEAREST).save(os.path.join(preview, f"{map_id}-ground-2x2.png"))
        wrapped = Image.new("RGB", (pano.width + 512, pano.height))
        wrapped.paste(pano.convert("RGB"), (0, 0))
        wrapped.paste(pano.convert("RGB").crop((0, 0, 512, pano.height)), (pano.width, 0))
        wrapped.save(os.path.join(preview, f"{map_id}-panorama-wrap.png"))
        bg = Image.new("RGBA", props.size, (40, 40, 48, 255))
        bg.alpha_composite(props)
        bg.resize((props.width * 2, props.height * 2), Image.NEAREST).save(os.path.join(preview, f"{map_id}-props.png"))
        fl = Image.new("RGBA", floor.size, (20, 20, 24, 255))
        fl.alpha_composite(floor)
        fl.save(os.path.join(preview, f"{map_id}-floor.png"))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("maps", nargs="*", default=["01-dawn-meadow"], help="mã vùng (mặc định 01-dawn-meadow)")
    ap.add_argument("--preview", help="thư mục ghi ảnh duyệt (lát 2×2, panorama nối đầu-cuối, đạo cụ)")
    args = ap.parse_args()
    for map_id in args.maps:
        if map_id not in BIOMES:
            raise SystemExit(f"Chưa có biome cho {map_id}. Hiện có: {', '.join(BIOMES)}")
        print(build(map_id, args.preview))


if __name__ == "__main__":
    main()
