"""Vẽ bộ icon kỹ năng (96 kỹ năng của 12 anh hùng) cùng phong cách icon Bùa: ô 64×64 pixel, nền trong,
viền tối, mặt sáng trên-trái / bóng dưới-phải, quầng sáng theo nguyên tố. Mỗi kỹ năng ghép hình riêng
theo vũ khí và tên chiêu. Ghi `ui/skill-icons.png` + `ui/skill-icons.json` (vị trí ô theo skillId) và cập nhật manifest.

Chạy từ thư mục gốc repo:  .venv/Scripts/python.exe tools/expedition/export_skill_icons.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "database-astral-expedition"
CELL = 64
COLS = 10

ELEM = {
    "Verdant": [(26, 96, 52), (64, 176, 92), (168, 248, 168), (120, 255, 160)],
    "Solar": [(160, 92, 18), (246, 186, 58), (255, 240, 162), (255, 210, 90)],
    "Pyre": [(140, 36, 20), (236, 96, 40), (255, 204, 96), (255, 120, 50)],
    "Frost": [(36, 92, 164), (108, 186, 240), (222, 246, 255), (140, 220, 255)],
    "Tide": [(18, 64, 136), (48, 136, 216), (164, 222, 255), (80, 180, 255)],
    "Astral": [(64, 36, 124), (146, 98, 228), (226, 202, 255), (190, 140, 255)],
}
METAL = [(84, 90, 106), (168, 176, 190), (238, 242, 250)]
GOLD = [(140, 92, 26), (226, 176, 58), (255, 236, 150)]
WOOD = [(84, 56, 34), (138, 94, 54), (180, 130, 80)]
HERO_ELEM = {
    "gus": "Verdant", "gustave_blade": "Verdant", "cel": "Solar", "celine_prism": "Solar", "bas": "Pyre", "bastian_aegis": "Pyre",
    "lyr": "Frost", "lyra_frostbow": "Frost", "kes": "Solar", "kestrel_dune": "Solar", "ner": "Tide", "nereus_tide": "Tide",
    "cor": "Astral", "corvus_night": "Astral", "ign": "Pyre", "ignis_valkyrie": "Pyre", "mar": "Tide", "marina_abyss": "Tide",
    "aur": "Solar", "aurelia_eclipse": "Solar", "ser": "Frost", "seraph_glacier": "Frost", "lum": "Astral", "lumina_chrono": "Astral",
}


class Icon:
    def __init__(self, pal):
        self.img = Image.new("RGBA", (CELL, CELL))
        self.d = ImageDraw.Draw(self.img)
        self.p = [c + (255,) for c in pal]
        self.glow = pal[3]

    # ------------------------------------------------ hình cơ bản
    def poly(self, pts, col):
        self.d.polygon([(round(x), round(y)) for x, y in pts], fill=col if len(col) == 4 else col + (255,))

    def circle(self, cx, cy, r, col):
        self.d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col if len(col) == 4 else col + (255,))

    def ring(self, cx, cy, r, w, col):
        self.d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col if len(col) == 4 else col + (255,), width=w)

    def line(self, pts, col, w):
        self.d.line([(round(x), round(y)) for x, y in pts], fill=col if len(col) == 4 else col + (255,), width=w)

    def blade(self, x1, y1, x2, y2, w=8, pal=METAL, guard=True):
        dx, dy = x2 - x1, y2 - y1
        n = math.hypot(dx, dy)
        ux, uy = dx / n, dy / n
        px, py = -uy, ux
        a, b = (x1 + px * w / 2, y1 + py * w / 2), (x1 - px * w / 2, y1 - py * w / 2)
        tip = (x2, y2)
        self.poly([a, b, tip], pal[1])
        self.poly([a, (x1, y1), tip], pal[2])  # nửa sáng
        if guard:
            g = w * 1.2
            self.line([(x1 + px * g, y1 + py * g), (x1 - px * g, y1 - py * g)], GOLD[1], 4)
            self.line([(x1, y1), (x1 - ux * 9, y1 - uy * 9)], WOOD[1], 4)
            self.circle(x1 - ux * 11, y1 - uy * 11, 3, GOLD[2])

    def arc(self, cx, cy, r, a0, a1, w, col, inner=None):
        pts_out, pts_in = [], []
        for i in range(25):
            t = i / 24
            a = math.radians(a0 + (a1 - a0) * t)
            th = w * math.sin(math.pi * t)
            pts_out.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
            pts_in.append((cx + math.cos(a) * (r - th), cy + math.sin(a) * (r - th)))
        self.poly(pts_out + pts_in[::-1], col)
        if inner:
            self.arc(cx, cy, r - 1, a0 + 8, a1 - 8, max(2, w * 0.4), inner)

    def arrow(self, x1, y1, x2, y2, head, shaft=WOOD[1], fletch=(240, 240, 240)):
        n = math.hypot(x2 - x1, y2 - y1)
        ux, uy = (x2 - x1) / n, (y2 - y1) / n
        px, py = -uy, ux
        self.line([(x1, y1), (x2 - ux * 6, y2 - uy * 6)], shaft, 3)
        self.poly([(x2, y2), (x2 - ux * 11 + px * 6, y2 - uy * 11 + py * 6), (x2 - ux * 11 - px * 6, y2 - uy * 11 - py * 6)], head)
        for s in (1, -1):
            self.poly([(x1, y1), (x1 + ux * 7, y1 + uy * 7), (x1 - ux * 2 + px * 5 * s, y1 - uy * 2 + py * 5 * s)], fletch)

    def star(self, cx, cy, r, inner, n, col, rot=-90):
        pts = []
        for i in range(n * 2):
            rr = r if i % 2 == 0 else inner
            a = math.radians(rot + i * 180 / n)
            pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
        self.poly(pts, col)

    def rays(self, cx, cy, r1, r2, n, col, w=3, rot=0):
        for i in range(n):
            a = math.radians(rot + i * 360 / n)
            self.line([(cx + math.cos(a) * r1, cy + math.sin(a) * r1), (cx + math.cos(a) * r2, cy + math.sin(a) * r2)], col, w)

    def flame(self, cx, cy, h, w):
        for k, (sc, col) in enumerate(((1, self.p[0]), (0.75, self.p[1]), (0.45, self.p[2]))):
            hh, ww = h * sc, w * sc
            pts = [(cx, cy - hh)]
            for i in range(13):
                a = math.pi * i / 12
                pts.append((cx + math.cos(a) * ww / 2 * (1 if i % 3 else 1.15), cy + math.sin(a) * ww / 2 * 0.9 - hh * 0.05 * k))
            self.poly(pts, col)

    def drop(self, cx, cy, r, col, hi):
        self.poly([(cx, cy - r * 2.2), (cx - r * 0.95, cy - r * 0.2), (cx + r * 0.95, cy - r * 0.2)], col)
        self.circle(cx, cy, r, col)
        self.circle(cx - r * 0.35, cy - r * 0.3, max(2, r * 0.3), hi)

    def spiral(self, cx, cy, r, turns, w, col, phase=0):
        pts = []
        for i in range(90):
            t = i / 89
            a = phase + t * turns * 2 * math.pi
            rr = r * t
            pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
        self.line(pts, col, w)

    def shield(self, cx, cy, w, h, col, rim):
        pts = [(cx - w / 2, cy - h / 2), (cx + w / 2, cy - h / 2), (cx + w / 2, cy), (cx, cy + h / 2), (cx - w / 2, cy)]
        self.poly(pts, rim)
        s = 0.78
        self.poly([(cx + (x - cx) * s, cy + (y - cy) * s) for x, y in pts], col)
        self.poly([(cx - w / 2 * s, cy - h / 2 * s), (cx, cy - h / 2 * s), (cx, cy + h / 2 * s), (cx - w / 2 * s, cy)], tuple(min(255, c + 40) for c in col[:3]))

    def snowflake(self, cx, cy, r, col):
        self.rays(cx, cy, 0, r, 6, col, 4, 90)
        for i in range(6):
            a = math.radians(90 + i * 60)
            bx, by = cx + math.cos(a) * r * 0.6, cy + math.sin(a) * r * 0.6
            for s in (-1, 1):
                b = a + s * math.radians(45)
                self.line([(bx, by), (bx + math.cos(b) * r * 0.3, by + math.sin(b) * r * 0.3)], col, 3)
        self.circle(cx, cy, 4, (255, 255, 255))

    def note(self, cx, cy, col):
        self.circle(cx - 6, cy + 10, 7, col)
        self.circle(cx + 14, cy + 6, 7, col)
        self.line([(cx, cy + 10), (cx, cy - 18)], col, 4)
        self.line([(cx + 20, cy + 6), (cx + 20, cy - 22)], col, 4)
        self.poly([(cx, cy - 18), (cx + 20, cy - 22), (cx + 20, cy - 14), (cx, cy - 10)], col)

    def crown(self, cx, cy, w, pal):
        h = w * 0.7
        pts = [(cx - w / 2, cy + h / 2), (cx - w / 2, cy - h / 4), (cx - w / 4, cy + h / 8), (cx, cy - h / 2), (cx + w / 4, cy + h / 8),
               (cx + w / 2, cy - h / 4), (cx + w / 2, cy + h / 2)]
        self.poly(pts, pal[1])
        self.poly([(cx - w / 2, cy + h / 4), (cx + w / 2, cy + h / 4), (cx + w / 2, cy + h / 2), (cx - w / 2, cy + h / 2)], pal[0])
        for x in (cx - w / 2, cx, cx + w / 2):
            self.circle(x, cy - h / 2 if x == cx else cy - h / 4, 3, pal[2])

    def heart(self, cx, cy, r, col):
        self.circle(cx - r / 2, cy - r / 4, r / 2 + 1, col)
        self.circle(cx + r / 2, cy - r / 4, r / 2 + 1, col)
        self.poly([(cx - r, cy - r / 6), (cx + r, cy - r / 6), (cx, cy + r)], col)

    def eye(self, cx, cy, r, iris, pupil):
        self.poly([(cx - r, cy), (cx, cy - r * 0.6), (cx + r, cy), (cx, cy + r * 0.6)], (236, 240, 248))
        self.circle(cx, cy, r * 0.42, iris)
        self.circle(cx, cy, r * 0.18, pupil)
        self.circle(cx - r * 0.12, cy - r * 0.15, 2, (255, 255, 255))

    def orb(self, cx, cy, r):
        self.circle(cx, cy, r, self.p[0])
        self.circle(cx - 1, cy - 1, r * 0.8, self.p[1])
        self.circle(cx - r * 0.25, cy - r * 0.25, r * 0.45, self.p[2])
        self.circle(cx - r * 0.4, cy - r * 0.4, max(2, r * 0.15), (255, 255, 255))

    def wave(self, x0, y0, w, h):
        pts = [(x0, y0 + h)]
        for i in range(21):
            t = i / 20
            pts.append((x0 + w * t, y0 + h * 0.5 - math.sin(t * math.pi * 1.3) * h * 0.5))
        pts.append((x0 + w, y0 + h))
        self.poly(pts, self.p[1])
        self.circle(x0 + w * 0.62, y0 + h * 0.15, h * 0.32, self.p[1])
        self.circle(x0 + w * 0.66, y0 + h * 0.22, h * 0.16, (0, 0, 0, 0))
        self.line([(x0 + 4, y0 + h * 0.7), (x0 + w * 0.5, y0 + h * 0.25)], self.p[2], 3)

    def tornado(self, cx, cy):
        for i in range(6):
            t = i / 5
            w = 10 + t * 34
            y = cy + 22 - t * 44
            self.d.ellipse([cx - w / 2 + math.sin(t * 5) * 4, y - 4, cx + w / 2 + math.sin(t * 5) * 4, y + 4],
                           outline=self.p[1 if i % 2 else 2], width=4)

    def bell(self, cx, cy):
        pal = GOLD
        self.poly([(cx - 8, cy - 16), (cx + 8, cy - 16), (cx + 18, cy + 12), (cx - 18, cy + 12)], pal[1] + (255,))
        self.circle(cx, cy - 16, 8, pal[1] + (255,))
        self.poly([(cx - 6, cy - 16), (cx, cy - 16), (cx - 6, cy + 10), (cx - 14, cy + 10)], pal[2] + (255,))
        self.d.rectangle([cx - 20, cy + 10, cx + 20, cy + 15], fill=pal[0] + (255,))
        self.circle(cx, cy + 19, 4, self.p[1])

    def scythe(self):
        self.line([(16, 58), (44, 8)], WOOD[1], 5)
        self.arc(30, 20, 26, 190, 300, 9, self.p[1], self.p[2])

    def chain(self, x1, y1, x2, y2, n, col):
        for i in range(n):
            t = i / (n - 1)
            x, y = x1 + (x2 - x1) * t, y1 + (y2 - y1) * t
            if i % 2:
                self.d.ellipse([x - 5, y - 8, x + 5, y + 8], outline=col, width=3)
            else:
                self.d.ellipse([x - 8, y - 5, x + 8, y + 5], outline=col, width=3)

    def finish(self) -> Image.Image:
        a = self.img.getchannel("A")
        # mặt sáng trên-trái, bóng dưới-phải
        px = self.img.load()
        for y in range(CELL):
            for x in range(CELL):
                r, g, b, al = px[x, y]
                if not al:
                    continue
                up = px[x - 1, y - 1][3] if x and y else 0
                dn = px[x + 1, y + 1][3] if x < CELL - 1 and y < CELL - 1 else 0
                if not up:
                    px[x, y] = (min(255, r + 46), min(255, g + 46), min(255, b + 46), al)
                elif not dn:
                    px[x, y] = (int(r * 0.62), int(g * 0.62), int(b * 0.62), al)
        ring = ImageChops.subtract(a.filter(ImageFilter.MaxFilter(5)), a)
        out = Image.new("RGBA", (CELL, CELL))
        glow = Image.new("RGBA", (CELL, CELL), self.glow + (0,))
        glow.putalpha(a.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(4)).point(lambda v: int(v * 0.55)))
        out.alpha_composite(glow)
        outline = Image.new("RGBA", (CELL, CELL), (18, 14, 26, 255))
        out.paste(outline, mask=ring)
        out.alpha_composite(self.img)
        return out


# ------------------------------------------------ công thức từng kỹ năng
def recipe(skill_id: str, ic: Icon):
    P, E = ic.p, ic.p
    kind = skill_id.split("_")[-1]
    if skill_id.endswith("_focus"):  # Charge: lõi năng lượng + mũi tên dồn vào
        ic.star(32, 32, 26, 10, 8, P[1]); ic.orb(32, 32, 10)
        for a in (45, 135, 225, 315):
            r = math.radians(a)
            ic.poly([(32 + math.cos(r) * 30, 32 + math.sin(r) * 30), (32 + math.cos(r + .25) * 20, 32 + math.sin(r + .25) * 20),
                     (32 + math.cos(r - .25) * 20, 32 + math.sin(r - .25) * 20)], P[2])
        return
    if skill_id.endswith("_ward"):  # Ward: khiên có ấn
        ic.shield(32, 32, 42, 50, P[1], GOLD[1] + (255,)); ic.star(32, 28, 9, 4, 4, P[2]); return
    if skill_id.endswith("_surge"):  # Burst: vụ nổ toả tia
        ic.rays(32, 32, 12, 30, 12, P[1], 4); ic.star(32, 32, 18, 8, 6, P[2]); ic.circle(32, 32, 6, (255, 255, 255)); return
    R = {
        # Miran — kiếm mảnh & súng gió
        "gus_basic": lambda: (ic.arc(30, 34, 24, 200, 330, 9, P[1], P[2]), ic.arc(34, 30, 24, 30, 160, 9, P[1], P[2]), ic.blade(14, 50, 48, 14, 6)),
        "gus_gale_lunge": lambda: (ic.tornado(26, 32), ic.blade(22, 52, 54, 12, 6)),
        "gus_overcharge": lambda: (ic.line([(6, 40), (26, 34)], P[2], 3), ic.line([(6, 30), (26, 30)], P[2], 3),
                                   ic.poly([(24, 24), (50, 24), (58, 31), (50, 38), (24, 38)], P[1]), ic.circle(54, 31, 5, (255, 255, 255))),
        "gus_ult_tempest": lambda: (ic.blade(10, 54, 54, 10, 7, guard=False), ic.blade(54, 54, 10, 10, 7, guard=False), ic.star(32, 32, 14, 5, 4, P[2])),
        "gus_passive": lambda: (ic.shield(32, 32, 40, 48, P[0], P[1]), ic.blade(32, 52, 32, 12, 6)),
        # Karen — trượng cọ
        "cel_basic": lambda: (ic.arc(34, 40, 22, 190, 350, 10, P[1], P[2]), ic.line([(14, 56), (42, 18)], WOOD[1], 5), ic.poly([(40, 22), (48, 8), (50, 22)], P[2])),
        "cel_radiant_mend": lambda: (ic.heart(32, 34, 20, (232, 70, 96)), ic.star(32, 30, 8, 3, 4, (255, 255, 255)), ic.rays(32, 32, 24, 30, 8, P[1], 3)),
        "cel_sun_brand": lambda: (ic.rays(32, 32, 16, 29, 12, P[1], 4), ic.circle(32, 32, 14, P[1]), ic.circle(30, 30, 8, P[2])),
        "cel_ult_aurora_canvas": lambda: (ic.d.rectangle([8, 10, 56, 52], fill=WOOD[0] + (255,)), ic.d.rectangle([12, 14, 52, 48], fill=(250, 236, 200, 255)),
                                          ic.arc(32, 52, 18, 180, 360, 9, P[1], P[2]), ic.rays(32, 46, 20, 26, 7, P[1], 3)),
        "cel_passive": lambda: (ic.circle(32, 34, 24, (230, 200, 150)), ic.circle(42, 44, 6, (0, 0, 0, 0)),
                                [ic.circle(32 + math.cos(a) * 13, 30 + math.sin(a) * 13, 5, c) for a, c in zip((3.6, 4.4, 5.2, 6.0), ((236, 80, 80), P[1], (80, 160, 236), (110, 200, 110)))]),
        # Park — khiên tháp lò rèn
        "bas_basic": lambda: (ic.shield(28, 32, 40, 48, (110, 70, 60), GOLD[1] + (255,)), ic.flame(46, 40, 30, 20)),
        "bas_bulwark": lambda: (ic.d.rectangle([12, 22, 52, 58], fill=METAL[1] + (255,)), [ic.d.rectangle([x, 14, x + 7, 24], fill=METAL[1] + (255,)) for x in (12, 26, 40)],
                                ic.d.rectangle([26, 40, 38, 58], fill=METAL[0] + (255,)), ic.flame(32, 30, 14, 10)),
        "bas_anvil_crush": lambda: (ic.line([(14, 54), (40, 22)], WOOD[1], 6), ic.poly([(30, 8), (56, 22), (48, 36), (22, 22)], METAL[1] + (255,)),
                                    ic.poly([(30, 8), (56, 22), (52, 26), (28, 14)], METAL[2] + (255,)), ic.rays(48, 44, 4, 14, 6, P[2], 3)),
        "bas_ult_bastion": lambda: (ic.poly([(4, 58), (32, 14), (60, 58)], (70, 50, 46)), ic.poly([(26, 24), (32, 14), (38, 24), (34, 58), (30, 58)], P[1]), ic.flame(32, 18, 22, 22)),
        "bas_passive": lambda: (ic.shield(32, 34, 44, 50, (110, 70, 60), GOLD[1] + (255,)), ic.arrow(56, 10, 40, 26, METAL[1] + (255,)), ic.arrow(8, 10, 24, 26, METAL[1] + (255,))),
        # Se Ok — cung băng
        "lyr_basic": lambda: (ic.arrow(10, 54, 54, 10, P[2]), ic.line([(8, 46), (18, 56)], P[1], 3)),
        "lyr_triple_icicle": lambda: [ic.arrow(8, 50 - i * 14, 52, 26 - i * 14 + 14, P[2] if i == 1 else P[1]) for i in range(3)],
        "lyr_hail_volley": lambda: (ic.arc(32, 52, 26, 200, 340, 6, WOOD[1] + (255,)), [ic.arrow(14 + i * 14, 4 + (i % 2) * 8, 10 + i * 14, 40 + (i % 2) * 8, P[2]) for i in range(4)]),
        "lyr_ult_zero_arrow": lambda: (ic.snowflake(40, 24, 20, P[2]), ic.arrow(6, 58, 46, 18, (255, 255, 255))),
        "lyr_passive": lambda: (ic.eye(32, 32, 26, P[1], P[0]), ic.snowflake(32, 32, 7, (255, 255, 255))),
        # Kai — song đao trăng khuyết
        "kes_basic": lambda: (ic.blade(12, 52, 50, 14, 6, guard=False), ic.blade(52, 52, 14, 14, 6, guard=False), ic.arc(32, 32, 26, 200, 260, 5, P[2])),
        "kes_mirage_step": lambda: ([ic.line([(4, 18 + i * 12), (30 - i * 4, 18 + i * 12)], P[1 + i % 2], 4) for i in range(4)],
                                    [ic.poly([(34 + j * 8, 14), (48 + j * 8, 32), (34 + j * 8, 50), (40 + j * 8, 32)], P[2 - j]) for j in range(2)]),
        "kes_sand_flurry": lambda: [ic.arc(32, 32, 26 - i * 5, 200 + i * 40, 320 + i * 40, 7, P[1 + i % 2]) for i in range(3)],
        "kes_ult_golden_fang": lambda: (ic.arc(22, 32, 22, 280, 440, 10, GOLD[1] + (255,), GOLD[2] + (255,)), ic.arc(42, 32, 22, 100, 260, 10, GOLD[1] + (255,), GOLD[2] + (255,)), ic.star(32, 32, 7, 3, 4, (255, 255, 255))),
        "kes_passive": lambda: ([ic.poly([(10 + i * 14, 50), (20 + i * 14, 30), (26 + i * 14, 30), (16 + i * 14, 50)], P[1 + i % 2]) for i in range(3)], ic.line([(6, 56), (58, 56)], P[0], 3)),
        # Nerio — đàn hạc san hô
        "ner_basic": lambda: (ic.note(28, 32, P[1]), ic.circle(48, 16, 3, P[2])),
        "ner_coral_grace": lambda: (ic.drop(32, 38, 14, P[1], P[2]), ic.heart(32, 40, 7, (255, 255, 255))),
        "ner_riptide_chord": lambda: (ic.spiral(32, 32, 28, 2.4, 5, P[1]), ic.note(30, 30, P[2])),
        "ner_ult_leviathan_hymn": lambda: (ic.arc(32, 36, 26, 180, 360, 7, GOLD[1] + (255,)), ic.line([(8, 36), (8, 58)], GOLD[1], 5), ic.line([(56, 36), (56, 58)], GOLD[1], 5),
                                           [ic.line([(14 + i * 9, 20 + abs(i - 2) * 4), (14 + i * 9, 58)], P[2], 2) for i in range(5)]),
        "ner_passive": lambda: ic.wave(6, 16, 52, 40),
        # Corvin — lưỡi hái nguyệt ảnh
        "cor_basic": lambda: ic.scythe(),
        "cor_umbra_mark": lambda: (ic.ring(32, 32, 24, 4, P[1]), ic.star(32, 32, 16, 6, 5, P[2]), ic.circle(32, 32, 5, (20, 10, 40))),
        "cor_reaper_arc": lambda: (ic.arc(32, 32, 28, 0, 300, 8, P[1], P[2]), ic.circle(32, 32, 8, P[0])),
        "cor_ult_abyss_Bell": lambda: (ic.rays(32, 34, 24, 30, 10, P[1], 3), ic.bell(32, 30)),
        "cor_passive": lambda: (ic.circle(32, 32, 24, P[1]), ic.circle(42, 26, 22, (0, 0, 0, 0)), ic.eye(40, 36, 10, P[2], P[0])),
        # Rhea — trường thương dung nham
        "ign_basic": lambda: (ic.line([(8, 56), (44, 20)], WOOD[1], 5), ic.poly([(40, 24), (58, 6), (48, 30)], METAL[2] + (255,)), ic.flame(18, 46, 18, 14)),
        "ign_magma_dive": lambda: (ic.flame(32, 56, 22, 34), ic.line([(32, 4), (32, 40)], WOOD[1], 5), ic.poly([(26, 38), (38, 38), (32, 54)], METAL[2] + (255,))),
        "ign_cinder_sweep": lambda: (ic.arc(32, 38, 26, 190, 350, 10, P[1], P[2]), ic.flame(14, 26, 16, 12), ic.flame(50, 26, 16, 12)),
        "ign_ult_valkyrie_star": lambda: (ic.star(32, 30, 26, 10, 5, P[1]), ic.star(32, 30, 14, 6, 5, P[2]), [ic.line([(14 + i * 18, 40), (10 + i * 18, 62)], METAL[1], 3) for i in range(3)]),
        "ign_passive": lambda: ([ic.poly([(32, 34), (4 + k * 4, 14 + k * 6), (14 + k * 4, 38)], P[1 + k % 2]) for k in range(3)],
                                [ic.poly([(32, 34), (60 - k * 4, 14 + k * 6), (50 - k * 4, 38)], P[1 + k % 2]) for k in range(3)], ic.circle(32, 36, 6, P[2])),
        # Mara — roi nước xoáy sâu
        "mar_basic": lambda: ic.line([(8 + i * 3, 50 - i * 2 + math.sin(i * 0.7) * 8) for i in range(17)], P[1], 5),
        "mar_vortex_bind": lambda: (ic.chain(8, 32, 56, 32, 7, P[2]), ic.ring(32, 32, 18, 3, P[1])),
        "mar_abyss_geyser": lambda: (ic.d.rectangle([24, 14, 40, 58], fill=P[1]), ic.circle(32, 14, 14, P[2]), [ic.drop(16 + i * 16, 16 - (i % 2) * 6, 4, P[1], P[2]) for i in range(3)]),
        "mar_ult_maelstrom": lambda: (ic.spiral(32, 32, 30, 3, 6, P[1]), ic.spiral(32, 32, 22, 2.5, 3, P[2], phase=1)),
        "mar_passive": lambda: (ic.ring(32, 14, 6, 4, METAL[1]), ic.line([(32, 20), (32, 54)], METAL[1], 5), ic.line([(20, 28), (44, 28)], METAL[1], 4),
                                ic.arc(32, 36, 20, 20, 160, 6, METAL[1] + (255,))),
        # Aurelia — đại kiếm khải huyền
        "aur_basic": lambda: ic.blade(14, 52, 52, 10, 12),
        "aur_solar_cleave": lambda: (ic.rays(44, 20, 10, 18, 8, P[1], 3), ic.blade(10, 56, 44, 20, 10), ic.arc(30, 34, 26, 160, 280, 8, P[2])),
        "aur_eclipse_nova": lambda: (ic.rays(32, 32, 20, 31, 16, P[1], 3), ic.circle(32, 32, 18, P[1]), ic.circle(32, 32, 14, (30, 20, 30))),
        "aur_ult_judgement": lambda: (ic.rays(32, 20, 14, 26, 9, P[1], 3, 200), ic.blade(32, 6, 32, 60, 12)),
        "aur_passive": lambda: (ic.crown(32, 30, 40, [c + (255,) for c in GOLD]), ic.circle(32, 50, 7, (30, 20, 30)), ic.ring(32, 50, 9, 2, P[1])),
        # Soren — thánh kiếm vĩnh băng
        "ser_basic": lambda: (ic.blade(14, 52, 50, 12, 8, pal=[ic.glow, (180, 228, 255), (240, 252, 255)]), ic.snowflake(46, 46, 8, P[2])),
        "ser_glacier_crown": lambda: (ic.crown(32, 34, 44, [c for c in P]), ic.snowflake(32, 18, 6, (255, 255, 255))),
        "ser_shatter_lance": lambda: (ic.poly([(6, 58), (56, 8), (46, 26), (16, 58)], P[1]), ic.poly([(56, 8), (40, 18), (46, 26)], P[2]), ic.snowflake(16, 18, 8, P[2])),
        "ser_ult_eternal_winter": lambda: ic.snowflake(32, 32, 28, P[2]),
        "ser_passive": lambda: [ic.poly([(14 + i * 14, 58), (20 + i * 14, 10 + (i % 2) * 10), (26 + i * 14, 58)], P[1 + i % 2]) for i in range(3)],
        # Luma — tinh cầu cực quang
        "lum_basic": lambda: (ic.ring(32, 32, 26, 2, P[2]), ic.orb(32, 32, 16)),
        "lum_astral_surge": lambda: (ic.poly([(32, 8), (52, 48), (12, 48)], (220, 230, 255)), ic.poly([(32, 16), (44, 42), (20, 42)], P[1]),
                                     [ic.line([(44, 38 + i * 3), (62, 44 + i * 6)], c, 2) for i, c in enumerate(((240, 90, 90), (250, 210, 80), (100, 220, 120), (90, 150, 250)))]),
        "lum_starfall_prism": lambda: [(ic.line([(18 + i * 14, 4), (8 + i * 14, 30 + i * 6)], P[1], 3), ic.star(8 + i * 14, 32 + i * 6, 8, 3, 5, P[2])) for i in range(3)],
        "lum_ult_symphony": lambda: (ic.spiral(32, 32, 28, 2, 4, P[1]), [ic.star(32 + math.cos(a) * 18, 32 + math.sin(a) * 18, 5, 2, 5, (255, 255, 255)) for a in (0.5, 2.6, 4.5)], ic.orb(32, 32, 8)),
        "lum_passive": lambda: [ic.arc(32, 64, 40 - i * 8, 200, 340, 6, c) for i, c in enumerate(((90, 255, 170, 255), (90, 200, 255, 255), (190, 140, 255, 255)))],
    }
    R[skill_id]()


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> None:
    argparse.ArgumentParser(description=__doc__).parse_args()
    heroes = [("gustave_blade", "gus", ["basic", "gale_lunge", "overcharge", "ult_tempest", "passive"]),
              ("celine_prism", "cel", ["basic", "radiant_mend", "sun_brand", "ult_aurora_canvas", "passive"]),
              ("bastian_aegis", "bas", ["basic", "bulwark", "anvil_crush", "ult_bastion", "passive"]),
              ("lyra_frostbow", "lyr", ["basic", "triple_icicle", "hail_volley", "ult_zero_arrow", "passive"]),
              ("kestrel_dune", "kes", ["basic", "mirage_step", "sand_flurry", "ult_golden_fang", "passive"]),
              ("nereus_tide", "ner", ["basic", "coral_grace", "riptide_chord", "ult_leviathan_hymn", "passive"]),
              ("corvus_night", "cor", ["basic", "umbra_mark", "reaper_arc", "ult_abyss_Bell", "passive"]),
              ("ignis_valkyrie", "ign", ["basic", "magma_dive", "cinder_sweep", "ult_valkyrie_star", "passive"]),
              ("marina_abyss", "mar", ["basic", "vortex_bind", "abyss_geyser", "ult_maelstrom", "passive"]),
              ("aurelia_eclipse", "aur", ["basic", "solar_cleave", "eclipse_nova", "ult_judgement", "passive"]),
              ("seraph_glacier", "ser", ["basic", "glacier_crown", "shatter_lance", "ult_eternal_winter", "passive"]),
              ("lumina_chrono", "lum", ["basic", "astral_surge", "starfall_prism", "ult_symphony", "passive"])]
    ids = [x for hero, pre, own in heroes for x in [f"{pre}_{k}" for k in own] + [f"{hero}_{k}" for k in ("focus", "ward", "surge")]]
    rows = math.ceil(len(ids) / COLS)
    atlas = Image.new("RGBA", (COLS * CELL, rows * CELL))
    positions = {}
    for n, sid in enumerate(ids):
        prefix = next((h for h in HERO_ELEM if "_" in h and sid.startswith(h)), sid.split("_")[0])
        ic = Icon(ELEM[HERO_ELEM[prefix]])
        recipe(sid, ic)
        atlas.alpha_composite(ic.finish(), ((n % COLS) * CELL, (n // COLS) * CELL))
        positions[sid] = [n % COLS, n // COLS]
    out = BUNDLE / "ui" / "skill-icons.png"
    atlas.save(out, optimize=True)
    (BUNDLE / "ui" / "skill-icons.json").write_text(json.dumps({"cell": CELL, "columns": COLS, "rows": rows, "positions": positions}, indent=1), encoding="utf8")
    mp = BUNDLE / "manifest.json"
    man = json.loads(mp.read_text(encoding="utf8"))
    man["files"]["ui/skill-icons.png"] = {"sha256": sha(out), "bytes": out.stat().st_size, "width": atlas.width, "height": atlas.height}
    mp.write_text(json.dumps(man, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print("icons", len(ids))


if __name__ == "__main__":
    main()
