"""
tools/bansung/night_art/pixel.py

Thư viện vẽ pixel art tối giản (Pillow) cho pipeline "Đêm Zombie" (spec 007).
Chuẩn Gen 3 (theo .agents/skills/expedition-sprite-generator):
- Alpha nhị phân 0/255, viền 1 px màu #1b1726 tự động bao ngoài.
- Ánh sáng chính từ trên-trái: highlight trên/trái, shadow dưới/phải.
- Không làm mờ, không anti-alias, mọi toạ độ là số nguyên.
"""
from __future__ import annotations

import math
from PIL import Image

OUTLINE = (27, 23, 38, 255)  # #1b1726
CLEAR = (0, 0, 0, 0)


def hexc(h: str, a: int = 255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def mix(c1, c2, t: float):
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(3)) + (255,)


def ramp(base_hex: str):
    """Tạo ramp 4 tông (shadow2, shadow, mid, light) từ 1 màu gốc, hue-shift nhẹ kiểu 16-bit."""
    b = hexc(base_hex)
    dark = mix(b, (24, 18, 48), 0.55)
    shadow = mix(b, (40, 30, 70), 0.30)
    light = mix(b, (255, 246, 214), 0.28)
    return (dark, shadow, b, light)


class Canvas:
    def __init__(self, w: int, h: int):
        self.w = w
        self.h = h
        self.img = Image.new('RGBA', (w, h), CLEAR)
        self.px = self.img.load()

    # --- primitive -------------------------------------------------------
    def set(self, x, y, c):
        x = int(round(x))
        y = int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h and c is not None:
            self.px[x, y] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[x, y]
        return CLEAR

    def rect(self, x0, y0, x1, y1, c):
        x0, x1 = sorted((int(round(x0)), int(round(x1))))
        y0, y1 = sorted((int(round(y0)), int(round(y1))))
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)

    def ellipse(self, cx, cy, rx, ry, c):
        rx = max(0.5, rx)
        ry = max(0.5, ry)
        for y in range(int(math.floor(cy - ry)), int(math.ceil(cy + ry)) + 1):
            for x in range(int(math.floor(cx - rx)), int(math.ceil(cx + rx)) + 1):
                dx = (x - cx) / rx
                dy = (y - cy) / ry
                if dx * dx + dy * dy <= 1.0:
                    self.set(x, y, c)

    def line(self, x0, y0, x1, y1, c, width: int = 1):
        x0, y0, x1, y1 = (int(round(v)) for v in (x0, y0, x1, y1))
        dx = abs(x1 - x0)
        dy = -abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx + dy
        r = (width - 1) / 2.0
        while True:
            if width <= 1:
                self.set(x0, y0, c)
            else:
                self.ellipse(x0, y0, r + 0.25, r + 0.25, c)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def poly(self, pts, c):
        """Tô đa giác lồi/lõm đơn giản bằng scanline even-odd."""
        ys = [p[1] for p in pts]
        for y in range(int(math.floor(min(ys))), int(math.ceil(max(ys))) + 1):
            xs = []
            n = len(pts)
            for i in range(n):
                x0, y0 = pts[i]
                x1, y1 = pts[(i + 1) % n]
                if (y0 <= y < y1) or (y1 <= y < y0):
                    xs.append(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                for x in range(int(math.ceil(xs[i])), int(math.floor(xs[i + 1])) + 1):
                    self.set(x, y, c)

    # --- shading ---------------------------------------------------------
    def shaded_rect(self, x0, y0, x1, y1, rp, light_top=True):
        dark, shadow, mid, light = rp
        self.rect(x0, y0, x1, y1, mid)
        x0, x1 = sorted((int(round(x0)), int(round(x1))))
        y0, y1 = sorted((int(round(y0)), int(round(y1))))
        if x1 - x0 >= 2:
            self.rect(x1, y0, x1, y1, shadow)
        if y1 - y0 >= 2:
            self.rect(x0, y1, x1, y1, dark)
        if light_top and x1 - x0 >= 2:
            self.rect(x0, y0, x1 - 1, y0, light)
        if y1 - y0 >= 3:
            self.rect(x0, y0, x0, y1 - 1, light)

    def shaded_ellipse(self, cx, cy, rx, ry, rp):
        dark, shadow, mid, light = rp
        self.ellipse(cx, cy, rx, ry, mid)
        # bóng phía dưới-phải
        for y in range(int(cy - ry), int(cy + ry) + 1):
            for x in range(int(cx - rx), int(cx + rx) + 1):
                if self.get(x, y) != mid:
                    continue
                dx = (x - cx) / max(0.5, rx)
                dy = (y - cy) / max(0.5, ry)
                if dx * 0.6 + dy * 0.8 > 0.55:
                    self.set(x, y, shadow)
                elif dx * 0.6 + dy * 0.8 < -0.55:
                    self.set(x, y, light)

    # --- post ------------------------------------------------------------
    def outline(self, color=OUTLINE):
        src = self.img.copy()
        sp = src.load()
        for y in range(self.h):
            for x in range(self.w):
                if sp[x, y][3] != 0:
                    continue
                for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + ox, y + oy
                    if 0 <= nx < self.w and 0 <= ny < self.h and sp[nx, ny][3] != 0 and sp[nx, ny] != color:
                        self.px[x, y] = color
                        break
        return self

    def binarize(self):
        for y in range(self.h):
            for x in range(self.w):
                p = self.px[x, y]
                self.px[x, y] = (p[0], p[1], p[2], 255) if p[3] >= 128 else CLEAR
        return self


def flip_h(img: Image.Image) -> Image.Image:
    return img.transpose(Image.FLIP_LEFT_RIGHT)


def rotate_about(img: Image.Image, deg: float, cx: int, cy: int) -> Image.Image:
    return img.rotate(deg, resample=Image.NEAREST, center=(cx, cy))


def strip(frames, cell_w, cell_h) -> Image.Image:
    out = Image.new('RGBA', (cell_w * len(frames), cell_h), CLEAR)
    for i, f in enumerate(frames):
        out.alpha_composite(f, (i * cell_w, 0))
    return out


def grid(rows, cell_w, cell_h) -> Image.Image:
    cols = max(len(r) for r in rows)
    out = Image.new('RGBA', (cell_w * cols, cell_h * len(rows)), CLEAR)
    for ry, r in enumerate(rows):
        for cx, f in enumerate(r):
            out.alpha_composite(f, (cx * cell_w, ry * cell_h))
    return out
