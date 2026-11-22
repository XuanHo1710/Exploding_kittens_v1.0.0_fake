"""Vẽ lại bản đồ đi đường (overworld) cho 7 vùng Astral Expedition.

Bố cục mỗi vùng: các con sông chảy dọc chia bản đồ thành từng khu; Quái Gác Cổng đứng chặn đầu cầu
(ô rào chắn gid 7 nằm trên cầu). Đường đất rộng 3 ô nối điểm xuất phát → các cầu → Đại Điện Trùm → cổng
vùng kế tiếp, nhánh đường nhỏ dẫn tới trạm lửa trại, rương báu và bãi quái. Giữa các khu là đồng cỏ,
đồng cỏ cao (gid 2, đi được, che nửa người), hồ nước, rừng cây viền bản đồ.

Giữ nguyên toàn bộ toạ độ thực thể trong catalog (landmarks trong .tmj + bãi quái trong bestiary.ts).
Ghi đè: maps/<id>/<id>.tmj (lớp ground, bỏ thang/dây traversal) và maps/<id>/terrain.png, cập nhật manifest.

Chạy từ thư mục gốc repo:  .venv/Scripts/python.exe tools/expedition/redraw_realm_maps.py --only 01-dawn-meadow
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import re
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter
from meadow_landscape import add_meadow_landscape
from pixel_worlds import gen3

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "database-astral-expedition"
TILE = 32
HALF = 16  # vẽ ở nửa độ phân giải rồi phóng ×2 (điểm ảnh 2×2 kiểu pixel art)

GRASS, TALL, ROAD, TREE, WATER, PAD, GATE, ALTAR = 1, 2, 3, 4, 5, 6, 7, 8
MON = 9  # ô dưới chân công trình (xuất ra gid 4 = chặn, nhưng vẽ nền như cỏ)
MONUMENT_KINDS = ("obelisk", "arch", "statue", "tower")
WALKABLE = {GRASS, TALL, ROAD, PAD, GATE, ALTAR}

# ------------------------------------------------------------------ bảng màu theo chủ đề
PALETTES = {
    "meadow": dict(
        grass=[(92, 156, 64), (100, 166, 68), (84, 146, 60), (110, 174, 74), (96, 160, 70)],
        grass_dark=[(72, 132, 56), (66, 124, 52), (78, 140, 58)],
        tall=[(48, 110, 48), (62, 132, 54), (80, 154, 62), (40, 94, 44), (98, 172, 70)],
        road=[(198, 164, 110), (186, 152, 100), (208, 176, 122), (176, 142, 92)],
        road_rim=[(146, 112, 72), (132, 100, 64)],
        shore=[(216, 198, 142), (204, 186, 130), (224, 208, 156)],
        water=[(64, 146, 190), (58, 134, 180), (72, 156, 200)],
        deep=[(42, 104, 160), (38, 96, 150), (46, 112, 166)],
        foam=(226, 244, 250),
        floor=[(46, 92, 48), (40, 82, 44), (52, 98, 50)],
        canopy=[(30, 84, 48), (46, 118, 58), (80, 154, 70), (128, 196, 96)],
        trunk=(98, 68, 44),
        plank=[(156, 110, 66), (138, 96, 56), (166, 120, 74)],
        plank_dark=(82, 56, 36),
        stone=[(170, 168, 158), (152, 150, 142), (186, 184, 174)],
        rock=[(132, 132, 128), (160, 160, 152), (100, 100, 98)],
        flowers=[(244, 232, 110), (244, 142, 172), (250, 250, 246), (176, 146, 236), (250, 180, 90)],
    ),
}


def theme_palette(**kw):
    out = dict(PALETTES["meadow"])
    out.update(kw)
    return out


PALETTES["snow"] = theme_palette(tree_style="pine",
    grass=[(222, 232, 240), (232, 240, 246), (210, 222, 234), (240, 246, 250), (226, 236, 244)],
    grass_dark=[(196, 210, 226), (186, 202, 220), (204, 216, 230)],
    tall=[(150, 176, 196), (176, 198, 214), (204, 220, 232), (124, 150, 172), (236, 244, 250)],
    road=[(164, 150, 140), (150, 138, 128), (176, 162, 150), (140, 128, 120)],
    road_rim=[(112, 104, 100), (98, 92, 90)],
    shore=[(196, 222, 236), (184, 214, 232), (210, 232, 244)],
    water=[(120, 186, 222), (108, 176, 216), (136, 198, 230)],
    deep=[(70, 130, 186), (62, 120, 178), (80, 142, 196)],
    foam=(250, 254, 255),
    floor=[(170, 190, 208), (156, 178, 200), (184, 202, 218)],
    canopy=[(24, 62, 66), (38, 88, 86), (66, 122, 112), (240, 248, 252)],
    trunk=(86, 70, 60),
    flowers=[(170, 220, 250), (250, 250, 255), (200, 230, 250)],
)
PALETTES["desert"] = theme_palette(tree_style="mesa",
    grass=[(222, 190, 124), (230, 200, 134), (212, 180, 116), (236, 208, 144), (226, 194, 128)],
    grass_dark=[(204, 168, 106), (196, 160, 100), (210, 176, 112)],
    tall=[(150, 150, 80), (174, 170, 90), (196, 188, 104), (126, 126, 70), (214, 204, 120)],
    road=[(186, 140, 94), (172, 128, 86), (198, 152, 104), (160, 118, 80)],
    road_rim=[(140, 98, 64), (124, 86, 56)],
    shore=[(236, 220, 170), (228, 210, 160), (244, 230, 184)],
    water=[(60, 170, 176), (52, 158, 168), (70, 184, 186)],
    deep=[(36, 120, 140), (32, 110, 132), (42, 130, 148)],
    floor=[(186, 132, 86), (172, 120, 78), (196, 142, 94)],
    canopy=[(126, 74, 48), (168, 104, 64), (206, 140, 88), (236, 184, 128)],
    flowers=[(236, 110, 90), (250, 214, 110), (200, 230, 120)],
)
PALETTES["underwater"] = theme_palette(tree_style="coral",
    grass=[(54, 112, 132), (60, 120, 140), (48, 104, 124), (66, 128, 146), (56, 116, 136)],
    grass_dark=[(42, 92, 116), (38, 86, 110), (46, 98, 120)],
    tall=[(36, 110, 92), (48, 132, 104), (66, 156, 116), (28, 90, 80), (90, 180, 130)],
    road=[(196, 186, 150), (184, 174, 140), (208, 198, 162), (172, 162, 130)],
    road_rim=[(130, 126, 108), (116, 112, 98)],
    shore=[(90, 150, 160), (84, 142, 154), (98, 160, 168)],
    water=[(20, 52, 88), (18, 46, 80), (24, 58, 96)],
    deep=[(10, 26, 54), (8, 22, 48), (12, 30, 60)],
    foam=(120, 220, 230),
    floor=[(36, 76, 100), (32, 70, 94), (40, 82, 106)],
    canopy=[(150, 50, 90), (210, 90, 120), (250, 150, 150), (255, 210, 190)],
    trunk=(110, 60, 80),
    flowers=[(250, 140, 170), (140, 230, 230), (250, 220, 120), (190, 150, 250)],
)
PALETTES["volcano"] = theme_palette(tree_style="spire",
    grass=[(78, 64, 62), (86, 70, 66), (70, 58, 56), (94, 76, 70), (82, 66, 62)],
    grass_dark=[(60, 50, 50), (54, 46, 46), (66, 54, 52)],
    tall=[(110, 60, 44), (140, 76, 46), (176, 96, 50), (90, 50, 40), (210, 124, 60)],
    road=[(132, 112, 100), (120, 102, 92), (144, 122, 108), (110, 94, 86)],
    road_rim=[(48, 40, 40), (40, 34, 34)],
    shore=[(70, 40, 34), (62, 36, 30), (80, 46, 38)],
    water=[(236, 106, 34), (226, 92, 28), (246, 132, 46)],
    deep=[(150, 48, 26), (132, 40, 22), (168, 60, 30)],
    foam=(255, 236, 150),
    floor=[(46, 38, 40), (40, 34, 36), (52, 42, 44)],
    canopy=[(28, 24, 28), (52, 44, 48), (84, 70, 72), (240, 120, 50)],
    trunk=(40, 32, 32),
    plank=[(96, 90, 92), (84, 78, 80), (110, 104, 106)],
    plank_dark=(40, 36, 38),
    flowers=[(255, 140, 60), (255, 200, 90), (220, 80, 50)],
)
PALETTES["night"] = theme_palette(tree_style="round",
    grass=[(42, 70, 74), (46, 76, 80), (38, 64, 70), (52, 84, 86), (44, 72, 78)],
    grass_dark=[(32, 56, 64), (28, 50, 60), (36, 60, 68)],
    tall=[(26, 66, 66), (36, 84, 78), (52, 108, 92), (20, 52, 56), (90, 150, 120)],
    road=[(110, 104, 128), (100, 94, 118), (122, 116, 140), (92, 86, 108)],
    road_rim=[(62, 58, 80), (54, 50, 72)],
    shore=[(70, 90, 110), (64, 84, 104), (78, 98, 118)],
    water=[(30, 52, 104), (26, 46, 96), (36, 60, 114)],
    deep=[(16, 28, 70), (14, 24, 62), (20, 32, 78)],
    foam=(170, 210, 255),
    floor=[(22, 40, 50), (18, 34, 44), (26, 46, 56)],
    canopy=[(14, 34, 44), (24, 54, 62), (42, 86, 86), (150, 230, 170)],
    trunk=(50, 42, 52),
    flowers=[(200, 255, 160), (160, 200, 255), (240, 200, 255)],
)
PALETTES["aurora"] = theme_palette(tree_style="arctic", aurora=True,
    grass=[(190, 206, 234), (200, 214, 240), (180, 196, 228), (210, 222, 244), (194, 208, 236)],
    grass_dark=[(164, 182, 218), (154, 174, 212), (172, 188, 224)],
    tall=[(110, 160, 186), (140, 192, 210), (180, 226, 238), (88, 132, 166), (226, 248, 255)],
    road=[(146, 156, 196), (136, 146, 188), (158, 168, 206), (126, 136, 178)],
    road_rim=[(96, 104, 150), (86, 94, 140)],
    shore=[(168, 212, 236), (148, 198, 228), (194, 228, 244)],
    water=[(26, 50, 92), (22, 44, 84), (32, 58, 102)],
    deep=[(12, 24, 58), (10, 20, 52), (16, 30, 66)],
    foam=(214, 244, 255),
    floor=[(140, 156, 198), (128, 146, 190), (152, 168, 208)],
    canopy=[(18, 44, 66), (28, 68, 88), (58, 106, 128), (238, 248, 255)],
    crystal=[(80, 70, 170), (130, 110, 230), (190, 170, 255), (240, 250, 255)],
    trunk=(60, 56, 84),
    plank=[(110, 112, 150), (96, 98, 136), (124, 126, 164)],
    plank_dark=(52, 54, 86),
    stone=[(176, 186, 214), (156, 166, 198), (194, 204, 230)],
    flowers=[(250, 250, 255), (160, 255, 210), (200, 170, 255), (140, 230, 255)],
)


# ------------------------------------------------------------------ kiểu bố cục từng vùng
# sep: vật liệu chắn giữa các khu (sông nước / vách núi rừng); fill: lấp kín bản đồ rồi "khoét" chỗ đi;
# carve: cách khoét (rooms = sảnh + hành lang, islands = đảo nối cầu, maze = lối mòn rừng rậm)
STYLES = {
    "meadow": dict(sep=WATER, fill=None, carve=None, forest=0.66, tall=0.56, lakes=True),
    "snow": dict(sep=TREE, fill=None, carve=None, forest=0.5, tall=0.62, lakes=True, road_w=2),
    "desert": dict(sep=TREE, fill=None, carve=None, forest=0.82, tall=0.64, lakes=True),
    "underwater": dict(sep=TREE, fill=TREE, carve="rooms", forest=0.8, tall=0.55, lakes=False),
    "volcano": dict(sep=WATER, fill=WATER, carve="islands", forest=0.78, tall=0.6, lakes=False, cliffs=True),
    "night": dict(sep=TREE, fill=TREE, carve="maze", forest=0.9, tall=0.5, lakes=False, road_w=2),
    # lãnh nguyên Bắc Cực: biển băng chia khu, nhiều hồ băng, rừng tùng thưa xen tháp pha lê
    "aurora": dict(sep=WATER, fill=None, carve=None, forest=0.7, tall=0.6, lakes=True, aurora=True, lakes_per_zone=4, lake_scale=1.9, coast=True, ridge=True),
}


# ------------------------------------------------------------------ dữ liệu vùng
def load_realm(map_id: str):
    tmj_path = BUNDLE / "maps" / map_id / f"{map_id}.tmj"
    tmj = json.loads(tmj_path.read_text(encoding="utf8"))
    marks = {"anchor": [], "chest": [], "gatekeeper": []}
    for layer in tmj["layers"]:
        for o in layer.get("objects", []) if layer["name"] == "landmarks" else []:
            p = (int(o["x"] // TILE), int(o["y"] // TILE))
            t = o["type"]
            if t == "rest-anchor":
                marks["anchor"].append(p)
            elif t in ("chest", "gatekeeper"):
                marks[t].append(p)
            else:
                marks[t] = p  # spawn, boss, exitPortal, backPortal
    src = (ROOT / "shared/src/expedition/bestiary.ts").read_text(encoding="utf8")
    wild_spots = src.partition("const WILD_SPOTS:")[2]
    m = re.search(rf"'{map_id}': \[(.*?)\],\n", wild_spots)
    if not m:
        raise ValueError(f"Missing WILD_SPOTS for {map_id}")
    marks["wild"] = [(int(a), int(b)) for a, b in re.findall(r"\[(\d+),\s*(\d+)\]", m.group(1))]
    theme = next(p["value"] for p in tmj["properties"] if p["name"] == "theme")
    return tmj_path, tmj, marks, theme


# ------------------------------------------------------------------ bố cục ô (gid)
class Layout:
    def __init__(self, w, h, seed):
        self.w, self.h = w, h
        self.g = [[GRASS] * w for _ in range(h)]
        self.reserved = [[False] * w for _ in range(h)]
        self.rng = random.Random(seed)
        self.prot = set()
        self.monuments = []
        self.bridges = set()

    def inb(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def set(self, x, y, v, force=False):
        if self.inb(x, y) and (force or not self.reserved[y][x]):
            self.g[y][x] = v

    def reserve(self, x, y, r=0):
        for yy in range(y - r, y + r + 1):
            for xx in range(x - r, x + r + 1):
                if self.inb(xx, yy):
                    self.reserved[yy][xx] = True

    def blob(self, cx, cy, rx, ry, v, jitter=0.35, keep=(ROAD, PAD, GATE, ALTAR)):
        ph = self.rng.random() * 6.28
        for y in range(int(cy - ry - 2), int(cy + ry + 3)):
            for x in range(int(cx - rx - 2), int(cx + rx + 3)):
                if not self.inb(x, y) or self.g[y][x] in keep or self.reserved[y][x] or (x, y) in self.prot:
                    continue
                a = math.atan2(y - cy, x - cx)
                k = 1 + jitter * (0.6 * math.sin(3 * a + ph) + 0.4 * math.sin(5 * a + ph * 1.7))
                if ((x - cx) / (rx * k)) ** 2 + ((y - cy) / (ry * k)) ** 2 <= 1:
                    self.g[y][x] = v

    def stamp(self, x, y, width):
        for dy in range(width):
            for dx in range(width):
                xx, yy = x + dx - width // 2, y + dy - width // 2
                if self.inb(xx, yy) and self.g[yy][xx] not in (GATE, PAD, ALTAR):
                    if self.g[yy][xx] == WATER:
                        self.bridges.add((xx, yy))
                    self.g[yy][xx] = ROAD

    def carve(self, cx, cy, rx, ry, rect=False, jitter=0.35):
        """Khoét chỗ đi (cỏ) trong vùng lấp kín, không đụng vách chắn giữa khu."""
        ph = self.rng.random() * 6.28
        for y in range(int(cy - ry - 2), int(cy + ry + 3)):
            for x in range(int(cx - rx - 2), int(cx + rx + 3)):
                if not self.inb(x, y) or (x, y) in self.prot:
                    continue
                if x < 1 or y < 1 or x >= self.w - 1 or y >= self.h - 1:
                    continue
                road_here = self.g[y][x] in (ROAD, PAD, GATE, ALTAR)
                if rect:
                    inside = abs(x - cx) <= rx and abs(y - cy) <= ry and not (abs(x - cx) == rx and abs(y - cy) == ry)
                else:
                    a = math.atan2(y - cy, x - cx)
                    k = 1 + jitter * (0.6 * math.sin(3 * a + ph) + 0.4 * math.sin(5 * a + ph * 1.7))
                    inside = ((x - cx) / (rx * k)) ** 2 + ((y - cy) / (ry * k)) ** 2 <= 1
                if inside and road_here:
                    self.bridges.discard((x, y))  # đường nằm trên đất liền của đảo → không phải cầu
                elif inside:
                    self.g[y][x] = GRASS

    def road(self, pts, width=2, amp=1.6):
        """Đường đất uốn lượn qua các điểm (đoạn ngang / dọc lệch sin, hai đầu bám đúng điểm)."""
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if x0 != x1 and y0 != y1:
                self.road([(x0, y0), (x1, y0), (x1, y1)], width, amp)
                continue
            n = max(abs(x1 - x0), abs(y1 - y0))
            if n == 0:
                self.stamp(x0, y0, width)
                continue
            ph = self.rng.random() * 6.28
            waves = max(1, round(n / 14))
            prev = None
            for i in range(n + 1):
                t = i / n
                off = round(amp * min(1, n / 10) * math.sin(math.pi * t) * math.sin(waves * math.pi * t * 2 + ph))
                if x0 == x1:
                    pt = (x0 + off, y0 + (y1 - y0) * i // n)
                else:
                    pt = (x0 + (x1 - x0) * i // n, y0 + off)
                if prev:
                    x, y = prev
                    while (x, y) != pt:
                        self.stamp(x, y, width)
                        if x != pt[0]:
                            x += 1 if pt[0] > x else -1
                        else:
                            y += 1 if pt[1] > y else -1
                self.stamp(*pt, width)
                prev = pt


def smooth_noise(w, h, cell, seed):
    rng = random.Random(seed)
    sw, sh = max(2, w // cell + 2), max(2, h // cell + 2)
    small = [[rng.random() for _ in range(sw)] for _ in range(sh)]

    def at(x, y):
        fx, fy = x / cell, y / cell
        ix, iy = int(fx), int(fy)
        tx, ty = fx - ix, fy - iy
        tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
        a = small[iy][ix] * (1 - tx) + small[iy][ix + 1] * tx
        b = small[iy + 1][ix] * (1 - tx) + small[iy + 1][ix + 1] * tx
        return a * (1 - ty) + b * ty
    return at


def build_layout(map_id, w, h, marks, seed, theme="meadow"):
    L = Layout(w, h, seed)
    S = STYLES.get(theme, STYLES["meadow"])
    if S["fill"] is not None:
        L.g = [[S["fill"]] * w for _ in range(h)]
    gks = sorted(marks["gatekeeper"])
    spawn = marks["spawn"]
    road_y = spawn[1]

    # sông chặn ở mỗi chốt Gác Cổng: cầu 3 ô, ô rào chắn ở đầu cầu (cột gk.x + 1)
    rivers = []
    for gx, gy in gks:
        bx = gx + 1
        # uốn sông (độ lệch -3..+1 cột) bằng quy hoạch động: bám đường sin, tránh mọi điểm mốc ±1 ô,
        # mỗi hàng lệch tối đa 1 cột so với hàng trên để thành sông liền (không có khe lọt qua)
        protect = [p for p in marks["anchor"] + marks["chest"] + marks["wild"] + gks
                   + [marks[k] for k in ("spawn", "boss", "exitPortal", "backPortal") if k in marks]]
        offs = (-3, -2, -1, 0, 1)
        INF = 10 ** 9

        def row_cost(y, o):
            if abs(y - gy) <= 3:
                return 0 if o == 0 else INF
            for px, py in protect:
                if abs(py - y) <= 1 and bx + o - 1 <= px <= bx + o + 3 and (px, py) != (gx, gy):
                    return INF
            target = -round(1 + math.sin((y + gx * 0.7) / 5.5))
            return abs(o - target)

        best = {o: (row_cost(0, o), [o]) for o in offs}
        for y in range(1, h):
            nxt = {}
            for o in offs:
                c = row_cost(y, o)
                prev = min((best[q] for q in offs if abs(q - o) <= 1), key=lambda t: t[0])
                nxt[o] = (min(INF, prev[0] + c), prev[1] + [o])
            best = nxt
        path = min(best.values(), key=lambda t: t[0])[1]
        cols = {y: (bx + path[y], bx + path[y] + 2) for y in range(h)}
        rivers.append((bx, gy, cols))
        for y, (c0, c1) in cols.items():
            for x in range(c0, c1 + 1):
                L.set(x, y, S["sep"], force=True)
                if abs(y - gy) > 1:
                    L.prot.add((x, y))

    # viền rừng quanh bản đồ (dày 2..4 ô, mép lượn)
    edge = smooth_noise(w, h, 5, seed + 1)
    for y in range(h):
        for x in range(w):
            d = min(x, y, w - 1 - x, h - 1 - y)
            if d < 2 + int(edge(x, y) * 2.6) and S["fill"] is None:
                if L.g[y][x] != S["sep"] or S["sep"] == TREE:
                    L.g[y][x] = TREE

    # đường chính: lượn nhẹ, rộng 3, thẳng ở gần cầu và các mốc trên trục chính
    fixed_x = [spawn[0], *(g[0] for g in gks), marks["boss"][0]]
    fixed_x += [a[0] for a in marks["anchor"] if a[1] == road_y]
    if "exitPortal" in marks:
        fixed_x.append(marks["exitPortal"][0])
    if "backPortal" in marks:
        fixed_x.append(marks["backPortal"][0])
    x_end = marks.get("exitPortal", marks["boss"])[0]
    x_start = marks.get("backPortal", spawn)[0]
    prev = road_y
    for x in range(x_start, x_end + 1):
        near = min(abs(x - fx) for fx in fixed_x)
        target = road_y if near <= 4 else road_y + round(1.4 * math.sin(x / 8.5))
        prev += max(-1, min(1, target - prev))
        for y in (prev - 1, prev, prev + 1):
            if L.inb(x, y):
                if L.g[y][x] == WATER:
                    L.bridges.add((x, y))  # trên sông / dung nham / hư không → cầu
                L.g[y][x] = ROAD
    for gx, gy in gks:
        for y in (gy - 1, gy, gy + 1):
            for x in (gx + 1, gx + 2, gx + 3):
                if L.g[y][x] == WATER or S["sep"] == WATER:
                    L.bridges.add((x, y))
            L.g[y][gx + 1] = GATE
            L.g[y][gx + 2] = ROAD
            L.g[y][gx + 3] = ROAD
        # bãi đứng của Gác Cổng (tuần tra lên xuống 2 ô)
        for y in range(gy - 2, gy + 3):
            for x in range(gx - 2, gx + 1):
                L.g[y][x] = ROAD
    # các khu (giữa hai con sông)
    bounds = [x_start] + [g[0] + 4 for g in gks] + [w]
    zones = list(zip(bounds, bounds[1:]))

    def zone_of(pt):
        # khu = số con sông nằm hẳn bên trái điểm (xét đúng hàng của điểm, vì sông uốn lượn)
        x, y = pt
        return min(len(zones) - 1, sum(1 for _, _, cols in rivers if cols[y][1] < x))

    # khoét không gian đi lại theo kiểu vùng (trước khi nối nhánh đường)
    rng0 = L.rng
    spots = [p for p in marks["anchor"] + marks["chest"] + marks["wild"] + gks]
    spots += [marks[k] for k in ("spawn", "boss", "exitPortal", "backPortal") if k in marks]
    if S["carve"] == "rooms":  # thánh điện đáy biển: sảnh vuông + hành lang
        for px, py in spots:
            L.carve(px, py, rng0.randint(3, 4), rng0.randint(2, 3), rect=True)
        for x in range(x_start + 6, x_end, 9):
            L.carve(x, road_y + rng0.choice((-1, 0, 1)), rng0.randint(2, 4), rng0.randint(2, 3), rect=True)
    elif S["carve"] == "islands":  # đảo nổi giữa dung nham / hư không
        for px, py in spots:
            L.carve(px, py, rng0.uniform(3, 4.5), rng0.uniform(2.4, 3.4), jitter=0.45)
        for x in range(x_start + 5, x_end, 7):
            if any(abs(x - gx - 2) <= 3 for gx, _ in gks):
                continue
            L.carve(x, road_y + rng0.uniform(-2, 2), rng0.uniform(2.6, 4), rng0.uniform(2.2, 3.6), jitter=0.5)
    elif S["carve"] == "maze":  # rừng đêm rậm rạp: bãi trống nhỏ + lối mòn cụt
        for px, py in spots:
            L.carve(px, py, rng0.uniform(2.2, 3), rng0.uniform(1.8, 2.4), jitter=0.4)
        for _ in range(w // 3):
            x0, y0 = rng0.randrange(3, w - 3), rng0.choice((road_y - 1, road_y + 1))
            if (x0, y0) in L.prot:
                continue
            length = rng0.randint(5, 9)
            x, y, step = x0, y0, (1 if y0 > road_y else -1)
            for _k in range(length):
                y += step
                x += rng0.choice((-1, 0, 0, 1))
                if not (2 <= y < h - 2) or not (2 <= x < w - 2) or (x, y) in L.prot:
                    break
                if L.g[y][x] == TREE:
                    L.g[y][x] = GRASS
            L.carve(x, y, 1.6, 1.3, jitter=0.3)
    if S["carve"]:
        # bản đồ dài: thêm sảnh / đảo / bãi trống phụ, mỗi cái nối vào đường chính bằng một nhánh
        kk = max(1.0, h / 25)
        for _ in range(w // 6):
            x, y = rng0.randrange(5, w - 5), rng0.randrange(4, h - 4)
            if abs(y - road_y) < 4 or any((xx, yy) in L.prot for xx in range(x - 4, x + 5)
                                          for yy in range(min(y, road_y) - 1, max(y, road_y) + 2)):
                continue
            if S["carve"] == "rooms":
                L.carve(x, y, round(rng0.randint(3, 4) * kk), round(rng0.randint(2, 3) * kk), rect=True)
            else:
                L.carve(x, y, rng0.uniform(2.5, 3.8) * kk, rng0.uniform(2, 3) * kk, jitter=0.45)
            L.road([(x, road_y), (x, y)], width=2, amp=1.2 if S["carve"] == "maze" else 0)

    # điểm đến phụ: trạm nghỉ, rương, bãi quái → nhánh đường từ trục dọc của khu
    targets = [(p, "anchor") for p in marks["anchor"]] + [(p, "chest") for p in marks["chest"]] + [(p, "wild") for p in marks["wild"]]
    by_zone = {}
    for p, kind in targets:
        by_zone.setdefault(zone_of(p), []).append((p, kind))
    for zi, items in by_zone.items():
        far = [p for p, _ in items if abs(p[1] - road_y) > 3]
        if not far:
            continue
        a, b = zones[zi]
        # trục dọc đặt ở cột trung vị của các điểm xa, tránh sát sông
        xs = sorted(p[0] for p in far)
        trunk = max(a + 4, min(b - 8, xs[len(xs) // 2]))
        lo = min(p[1] for p in far)
        hi = max(p[1] for p in far)
        if hi > road_y:
            L.road([(trunk, road_y), (trunk, hi)], width=2, amp=2.4 if S["carve"] == "maze" else 1.6)
        if lo < road_y:
            L.road([(trunk, road_y), (trunk, lo)], width=2, amp=2.4 if S["carve"] == "maze" else 1.6)
        for p, kind in items:
            if abs(p[1] - road_y) <= 3:
                L.road([(p[0], road_y), p], width=2)
            else:
                L.road([(trunk, p[1]), p], width=2 if kind != "wild" else 2)

    # mốc: bệ đá trạm nghỉ, đại điện trùm, cổng
    for ax, ay in marks["anchor"]:
        L.blob(ax, ay, 2.2, 1.8, ROAD, jitter=0.1, keep=(WATER, GATE))
        L.g[ay][ax] = PAD
        L.reserve(ax, ay, 2)
    for key in ("boss", "exitPortal"):
        if key in marks:
            x, y = marks[key]
            L.blob(x, y, 2.6, 2.2, ROAD, jitter=0.1, keep=(GATE, WATER))
            L.g[y][x] = ALTAR
            L.reserve(x, y, 2)
    for key in ("spawn", "backPortal"):
        if key in marks:
            L.reserve(*marks[key], 2)
    for c in marks["chest"]:
        L.reserve(*c, 1)
    for p in marks["wild"]:
        L.reserve(*p, 2)
        for yy in range(p[1] - 1, p[1] + 2):
            for xx in range(p[0] - 2, p[0] + 3):
                if L.inb(xx, yy) and L.g[yy][xx] == TREE and (xx, yy) not in L.prot:
                    L.g[yy][xx] = GRASS
    for gx, gy in gks:
        L.reserve(gx, gy, 2)
    # đường & cầu cũng là vùng cấm rừng/hồ (chừa lề 1 ô)
    for y in range(h):
        for x in range(w):
            if L.g[y][x] in (ROAD, GATE, PAD, ALTAR):
                L.reserve(x, y, 1)

    # hồ nước (mỗi khu 1–2 hồ, nối với sông khi gần)
    rng = L.rng
    for zi, (a, b) in enumerate(zones if S["lakes"] else []):
        for _ in range(S.get("lakes_per_zone", 2) if b - a > 20 else 1):
            for _try in range(40):
                cx = rng.uniform(a + 4, b - 6)
                cy = rng.uniform(road_y + 7, h - 7) if rng.random() < 0.8 or road_y < 8 else rng.uniform(3, road_y - 5)
                ls = S.get("lake_scale", 1)
                rx, ry = rng.uniform(2.5, 5.5) * ls, rng.uniform(2, 4) * ls
                ok = all(not L.reserved[int(yy)][int(xx)]
                         for yy in range(int(cy - ry), int(cy + ry) + 1)
                         for xx in range(int(cx - rx), int(cx + rx) + 1) if L.inb(int(xx), int(yy)))
                if ok:
                    L.blob(cx, cy, rx, ry, WATER)
                    break

    # cảnh lớn: bờ biển băng phía nam + dải núi băng phía bắc
    if S.get("coast"):
        for x in range(w):
            cy = h - 9 + 2.5 * math.sin(x / 11 + seed) + 1.5 * math.sin(x / 4.7)
            for y in range(int(cy), h):
                if not L.reserved[y][x] and L.g[y][x] in (GRASS, TALL, TREE):
                    L.g[y][x] = WATER
    if S.get("ridge"):
        for x in range(w):
            ry = 5 + 2.5 * math.sin(x / 9 + seed * 0.3) + 1.5 * math.sin(x / 3.9)
            for y in range(0, int(ry)):
                if not L.reserved[y][x] and L.g[y][x] in (GRASS, TALL):
                    L.g[y][x] = TREE

    # cụm rừng + đồng cỏ cao theo nhiễu mượt
    forest = smooth_noise(w, h, 7, seed + 2)
    tall = smooth_noise(w, h, 6, seed + 3)
    for y in range(h):
        for x in range(w):
            if L.reserved[y][x] or L.g[y][x] != GRASS:
                continue
            if forest(x, y) > S["forest"]:
                L.g[y][x] = TREE
            elif tall(x, y) > S["tall"]:
                L.g[y][x] = TALL
    # công trình: tháp rune / cổng vòm / tượng hộ vệ / tháp canh (chân 4×2 ô), cách nhau ≥ 8 ô
    want = min(18, max(5, w * h // 220))
    cells = [(x, y) for y in range(3, h - 3) for x in range(4, w - 3)]
    rng.shuffle(cells)
    for x, y in cells:
        if len(L.monuments) >= want:
            break
        foot = [(xx, yy) for yy in (y - 1, y) for xx in range(x - 2, x + 2)]
        if any(L.reserved[yy][xx] or L.g[yy][xx] not in (GRASS, TALL) for xx, yy in foot):
            continue
        if any(L.g[y - 2][xx] == ROAD or L.g[y + 1][xx] == ROAD for xx in range(x - 2, x + 2)):
            continue
        if any(abs(mx - x) < 8 and abs(my - y) < 8 for _, mx, my in L.monuments):
            continue
        for xx, yy in foot:
            L.g[yy][xx] = MON
        L.monuments.append((MONUMENT_KINDS[rng.randrange(len(MONUMENT_KINDS))], x, y))

    # cỏ cao quanh bãi quái (chỗ quái nấp)
    for px, py in marks["wild"]:
        for yy in range(py - 3, py + 4):
            for xx in range(px - 4, px + 5):
                if L.inb(xx, yy) and L.g[yy][xx] == GRASS and rng.random() < 0.55 and (xx, yy) != (px, py):
                    L.g[yy][xx] = TALL
    return L, rivers, zones


# ------------------------------------------------------------------ kiểm tra đường đi
def bfs(L, start, open_gates):
    seen = {start}
    q = deque([start])
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if (nx, ny) in seen or not L.inb(nx, ny):
                continue
            v = L.g[ny][nx]
            if v == GATE and nx not in open_gates:
                continue
            if v in WALKABLE:
                seen.add((nx, ny))
                q.append((nx, ny))
    return seen


def verify(L, marks):
    gks = sorted(marks["gatekeeper"])
    spawn = marks["spawn"]
    problems = []
    for i in range(len(gks) + 1):
        opened = {g[0] + 1 for g in gks[:i]}
        seen = bfs(L, spawn, opened)
        limit = gks[i][0] + 1 if i < len(gks) else L.w
        leak = [p for p in seen if p[0] >= limit]
        if leak:
            problems.append(f"rò rỉ qua chốt {i + 1}: {leak[:3]}")
    allseen = bfs(L, spawn, {g[0] + 1 for g in gks})
    pts = marks["anchor"] + marks["chest"] + marks["wild"] + [marks["boss"]] + [g for g in gks]
    pts += [marks[k] for k in ("exitPortal", "backPortal") if k in marks]
    for p in pts:
        if p not in allseen:
            problems.append(f"không tới được {p} (gid {L.g[p[1]][p[0]]})")
    return problems


# ------------------------------------------------------------------ vẽ terrain.png
def texture(colors, size, seed, mode="speckle"):
    rng = random.Random(seed)
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            if mode == "blades":
                c = colors[(x * 7 + (y // 3) * 3 + rng.randint(0, 1)) % len(colors)] if rng.random() < 0.82 else colors[rng.randrange(len(colors))]
            elif mode == "planks":
                c = colors[(x // 4) % len(colors)] if (x % 4) else colors[0]
            else:
                c = colors[0] if rng.random() < 0.55 else colors[rng.randrange(len(colors))]
            px[x, y] = c
    return img


def tiled(tex, w, h):
    out = Image.new("RGB", (w, h))
    for y in range(0, h, tex.height):
        for x in range(0, w, tex.width):
            out.paste(tex, (x, y))
    return out


def mask_of(L, kinds, w, h, soft=True, noise=None, grow=0.0):
    small = Image.new("L", (L.w, L.h))
    px = small.load()
    for y in range(L.h):
        for x in range(L.w):
            px[x, y] = 255 if L.g[y][x] in kinds else 0
    big = small.resize((w, h), Image.Resampling.BILINEAR if soft else Image.Resampling.NEAREST)
    if noise is not None:
        big = ImageChops.add(big, noise, scale=1.0, offset=-40)
    thr = int(128 - grow * 100)
    return big.point(lambda v: 255 if v >= thr else 0)


def noise_img(w, h, seed, amp=80):
    rng = random.Random(seed)
    small = Image.new("L", (w // 6 + 1, h // 6 + 1))
    small.putdata([rng.randint(0, amp) for _ in range(small.width * small.height)])
    return small.resize((w, h), Image.Resampling.BICUBIC)


def paint(L, theme, seed, rivers):
    P = PALETTES.get(theme, PALETTES["meadow"])
    w, h = L.w * HALF, L.h * HALF
    rng = random.Random(seed)
    nz = noise_img(w, h, seed)

    img = tiled(texture(P["grass"], 64, seed), w, h)
    # mảng cỏ đậm theo nhiễu tần thấp
    low = noise_img(w, h, seed + 9, amp=255).filter(ImageFilter.GaussianBlur(10)).point(lambda v: 255 if v > 150 else 0)
    img.paste(tiled(texture(P["grass_dark"], 64, seed + 1), w, h), mask=low)

    def layer(kinds, tex, grow=0.0, soft=True):
        m = mask_of(L, kinds, w, h, soft=soft, noise=nz, grow=grow)
        img.paste(tex if tex.size == (w, h) else tiled(tex, w, h), mask=m)
        return m

    forest_floor = layer({TREE}, texture(P["floor"], 64, seed + 2), grow=0.25)
    tall_m = layer({TALL}, texture(P["tall"], 48, seed + 3, "blades"))
    layer({ROAD, PAD, GATE, ALTAR}, Image.new("RGB", (w, h), P["road_rim"][0]), grow=0.18)
    layer({ROAD, PAD, GATE, ALTAR}, texture(P["road"], 64, seed + 4))
    layer({WATER}, texture(P["shore"], 64, seed + 5), grow=0.3)
    water_m = layer({WATER}, texture(P["water"], 64, seed + 6), grow=0.05)
    # nước sâu: co mask lại
    deep = water_m.filter(ImageFilter.MinFilter(9))
    img.paste(tiled(texture(P["deep"], 64, seed + 7), w, h), mask=deep)
    # bọt sóng ven bờ
    ring = ImageChops.subtract(water_m, water_m.filter(ImageFilter.MinFilter(3)))
    foam = Image.new("RGB", (w, h), P["foam"])
    sparse = noise_img(w, h, seed + 11, amp=255).point(lambda v: 255 if v > 120 else 0)
    if not STYLES.get(theme, {}).get("void"):
        img.paste(foam, mask=ImageChops.multiply(ring, sparse))

    if P.get("aurora"):
        band = Image.new("RGB", (w, h))
        bm = Image.new("L", (w, h), 0)
        db, dm = ImageDraw.Draw(band), ImageDraw.Draw(bm)
        aur = [(90, 255, 170), (60, 230, 210), (150, 120, 255), (240, 120, 220), (120, 255, 140)]
        for i in range(h // 14 + 2):
            y0 = i * 14 + rng.randint(-4, 4)
            col = aur[(i // 2) % len(aur)]
            pts = [(x, y0 + 7 * math.sin(x / 41 + i * 0.9) + 3 * math.sin(x / 13 + i)) for x in range(-8, w + 16, 8)]
            db.line(pts, fill=col, width=5)
            dm.line(pts, fill=rng.randint(70, 150), width=5)
        bm = bm.filter(ImageFilter.GaussianBlur(3))
        img.paste(band, mask=ImageChops.multiply(bm, water_m))
    d = ImageDraw.Draw(img)
    if P.get("aurora"):
        for y in range(L.h):
            for x in range(L.w):
                if L.g[y][x] in (GRASS, TALL) and rng.random() < 0.6:
                    d.point([(x * HALF + rng.randint(0, HALF - 1), y * HALF + rng.randint(0, HALF - 1))],
                            fill=rng.choice(((255, 255, 255), (200, 255, 230), (220, 210, 255))))
    S = STYLES.get(theme, STYLES["meadow"])
    road_like = (ROAD, GATE)
    if S.get("void"):  # hư không đầy sao thay cho mặt nước
        for y in range(L.h):
            for x in range(L.w):
                if L.g[y][x] == WATER and rng.random() < 0.5:
                    sx, sy = x * HALF + rng.randint(0, HALF - 1), y * HALF + rng.randint(0, HALF - 1)
                    d.point([(sx, sy)], fill=rng.choice(((250, 250, 255), (190, 220, 255), (240, 200, 255))))
    if S.get("cliffs"):  # vách đá dưới mép đảo → cảm giác đảo nổi
        for y in range(L.h - 1):
            for x in range(L.w):
                if L.g[y][x] != WATER and L.g[y + 1][x] == WATER and (x, y + 1) not in L.bridges:
                    x0, y0 = x * HALF, (y + 1) * HALF
                    d.rectangle([x0, y0, x0 + HALF - 1, y0 + 6], fill=P["floor"][1])
                    d.line([x0, y0, x0 + HALF - 1, y0], fill=P["road_rim"][0])
                    d.line([x0, y0 + 7, x0 + HALF - 1, y0 + 7], fill=P["foam"] if not S.get("void") else P["canopy"][1])
    # cầu: ô đường đè lên nước / dung nham / hư không; ván xếp vuông góc hướng đi
    for (x, y) in L.bridges:
        if L.g[y][x] not in road_like:
            continue
        x0, y0 = x * HALF, y * HALF
        horiz = (x > 0 and L.g[y][x - 1] in road_like) or (x < L.w - 1 and L.g[y][x + 1] in road_like)
        vert = (y > 0 and L.g[y - 1][x] in road_like) and (y < L.h - 1 and L.g[y + 1][x] in road_like)
        d.rectangle([x0, y0, x0 + HALF - 1, y0 + HALF - 1], fill=P["plank"][0])
        for k in range(0, HALF, 4):
            if vert and not horiz:
                d.line([x0, y0 + k, x0 + HALF - 1, y0 + k], fill=P["plank_dark"])
            else:
                d.line([x0 + k, y0, x0 + k, y0 + HALF - 1], fill=P["plank_dark"])
                d.point([(x0 + k + 2, y0 + 3), (x0 + k + 2, y0 + 11)], fill=P["plank"][2])
        if vert and not horiz:
            if x > 0 and L.g[y][x - 1] not in road_like:
                d.rectangle([x0, y0, x0 + 1, y0 + HALF - 1], fill=P["plank_dark"])
            if x < L.w - 1 and L.g[y][x + 1] not in road_like:
                d.rectangle([x0 + HALF - 2, y0, x0 + HALF - 1, y0 + HALF - 1], fill=P["plank_dark"])
        else:
            if y > 0 and L.g[y - 1][x] not in road_like:
                d.rectangle([x0, y0, x0 + HALF - 1, y0 + 1], fill=P["plank_dark"])
            if y < L.h - 1 and L.g[y + 1][x] not in road_like:
                d.rectangle([x0, y0 + HALF - 2, x0 + HALF - 1, y0 + HALF - 1], fill=P["plank_dark"])
    for _, mx, my in L.monuments:
        cx, cy = mx * HALF, (my + 1) * HALF - 3
        d.ellipse([cx - 30, cy - 7, cx + 30, cy + 5], fill=P["floor"][1])
    # bệ đá
    for y in range(L.h):
        for x in range(L.w):
            if L.g[y][x] in (PAD, ALTAR):
                cx, cy = x * HALF + HALF // 2, y * HALF + HALF // 2
                r = 22 if L.g[y][x] == PAD else 27
                d.ellipse([cx - r, cy - r * 0.7, cx + r, cy + r * 0.7], fill=P["stone"][1], outline=P["rock"][2])
                d.ellipse([cx - r + 5, cy - r * 0.7 + 4, cx + r - 5, cy + r * 0.7 - 4], fill=P["stone"][0])
                for k in range(10):
                    a = k / 10 * 6.283
                    d.line([cx, cy, cx + math.cos(a) * (r - 5), cy + math.sin(a) * (r - 5) * 0.7], fill=P["stone"][2])
    # hoa, sỏi, đá trên cỏ
    for y in range(L.h):
        for x in range(L.w):
            v = L.g[y][x]
            x0, y0 = x * HALF, y * HALF
            if v == GRASS:
                if rng.random() < 0.28:
                    col = rng.choice(P["flowers"])
                    for _ in range(rng.randint(2, 5)):
                        fx, fy = x0 + rng.randint(1, HALF - 3), y0 + rng.randint(1, HALF - 3)
                        d.point([(fx, fy)], fill=col)
                        d.point([(fx, fy + 1)], fill=P["grass_dark"][0])
                if rng.random() < 0.05:
                    rx, ry = x0 + rng.randint(3, 10), y0 + rng.randint(4, 11)
                    d.ellipse([rx, ry + 1, rx + 6, ry + 4], fill=P["grass_dark"][1])
                    d.ellipse([rx, ry - 1, rx + 5, ry + 3], fill=P["rock"][0])
                    d.point([(rx + 1, ry)], fill=P["rock"][1])
            elif v == ROAD and rng.random() < 0.18:
                d.point([(x0 + rng.randint(1, 14), y0 + rng.randint(1, 14))], fill=P["road_rim"][1])
            elif v == TALL:
                # ngọn cỏ cao vươn lên
                for _ in range(3):
                    bx, by = x0 + rng.randint(2, 13), y0 + rng.randint(6, 15)
                    hgt = rng.randint(5, 8)
                    d.line([bx, by, bx - 2, by - hgt + 1], fill=P["tall"][3])
                    d.line([bx, by, bx + 2, by - hgt + 1], fill=P["tall"][1])
                    d.line([bx, by, bx, by - hgt], fill=P["tall"][2])
                    d.point([(bx, by - hgt), (bx - 2, by - hgt + 1)], fill=P["tall"][4])
    # cây: tán tròn nhiều lớp, vẽ theo thứ tự y
    trees = []
    for y in range(L.h):
        for x in range(L.w):
            if L.g[y][x] == TREE:
                trees.append((y * HALF + HALF // 2 + rng.randint(-3, 3), x * HALF + HALF // 2 + rng.randint(-3, 3)))
                if rng.random() < 0.35:
                    trees.append((y * HALF + rng.randint(0, HALF), x * HALF + rng.randint(0, HALF)))
    trees.sort()
    dark, mid, light, hi = P["canopy"]
    style = P.get("tree_style", "round")
    for cy, cx in trees:
        if style == "arctic":
            if rng.random() < 0.3:
                dk, md, lt, hl = P["crystal"]
                r0 = rng.randint(8, 11)
                d.ellipse([cx - r0 + 3, cy - r0 * 0.5 + 6, cx + r0 + 4, cy + r0 * 0.5 + 8], fill=P["floor"][1])
                for k, (ox, hh, ww) in enumerate(((-4, r0 + 4, 4), (3, r0 + 9, 5), (7, r0, 3))):
                    px0 = cx + ox
                    d.polygon([(px0 - ww, cy + 4), (px0 + ww, cy + 4), (px0 + ww, cy + 4 - hh + ww), (px0, cy + 4 - hh),
                               (px0 - ww, cy + 4 - hh + ww)], fill=(dk, md, lt)[k])
                    d.line([px0, cy + 2, px0, cy + 6 - hh], fill=hl)
                continue
            dark, mid, light, hi = P["canopy"]
            r0 = rng.randint(8, 11)
            d.ellipse([cx - r0 + 3, cy - r0 * 0.5 + 6, cx + r0 + 4, cy + r0 * 0.5 + 8], fill=P["floor"][1])
            d.rectangle([cx - 1, cy + 3, cx + 1, cy + 8], fill=P["trunk"])
            for k, (wd, top) in enumerate(((r0, cy - 2), (r0 - 2, cy - 7), (r0 - 4, cy - 12))):
                d.polygon([(cx - wd, top + 6), (cx + wd, top + 6), (cx, top - 4)], fill=dark if k == 0 else mid)
                d.line([cx - wd + 2, top + 5, cx + wd - 2, top + 5], fill=hi)  # tuyết đọng trên cành
                d.line([cx - wd + 2, top + 4, cx - 1, top - 2], fill=hi)
            continue
        r = rng.randint(8, 11)
        d.ellipse([cx - r + 3, cy - r * 0.5 + 6, cx + r + 4, cy + r * 0.5 + 8], fill=P["floor"][1])
        if style == "pine":  # tùng phủ tuyết: tầng tam giác, mép trắng
            d.rectangle([cx - 1, cy + 3, cx + 1, cy + 8], fill=P["trunk"])
            for k, (wd, top) in enumerate(((r, cy - 2), (r - 2, cy - 7), (r - 4, cy - 12))):
                d.polygon([(cx - wd, top + 6), (cx + wd, top + 6), (cx, top - 4)], fill=dark if k == 0 else mid)
                d.line([cx - wd + 2, top + 5, cx - 1, top - 2], fill=hi)
        elif style == "mesa":  # đá đỏ sa mạc nhiều tầng
            d.rectangle([cx - r, cy - r + 2, cx + r - 1, cy + 4], fill=dark)
            d.rectangle([cx - r + 1, cy - r, cx + r - 2, cy - 2], fill=mid)
            d.rectangle([cx - r + 2, cy - r, cx - 1, cy - r + 3], fill=light)
            d.line([cx - r + 2, cy - 5, cx + r - 3, cy - 5], fill=dark)
            d.point([(cx - 2, cy - r + 1), (cx + 3, cy - r + 2)], fill=hi)
        elif style == "coral":  # san hô + rong biển
            for k in range(4):
                ox, oy = rng.randint(-r + 3, r - 3), rng.randint(-r + 2, 2)
                rr = rng.randint(3, 6)
                d.ellipse([cx + ox - rr, cy + oy - rr, cx + ox + rr, cy + oy + rr], fill=(dark, mid, light)[k % 3])
            for k in range(2):
                kx = cx + rng.randint(-r, r)
                d.line([kx, cy + 6, kx + rng.choice((-2, 2)), cy - r], fill=P["tall"][1], width=2)
            d.point([(cx - 2, cy - 4), (cx + 3, cy - 1)], fill=hi)
        elif style == "spire":  # cột đá bazan, khe dung nham
            d.polygon([(cx - r + 2, cy + 5), (cx + r - 2, cy + 5), (cx + 3, cy - r - 6), (cx - 3, cy - r - 4)], fill=dark)
            d.polygon([(cx - r + 4, cy + 4), (cx, cy + 4), (cx - 2, cy - r - 3)], fill=mid)
            d.line([cx + 1, cy - r + 2, cx - 1, cy + 3], fill=hi)
            d.point([(cx - 3, cy - r)], fill=light)
        elif style == "crystal":  # cụm pha lê
            for k, (ox, hh, ww) in enumerate(((-4, r + 4, 4), (3, r + 8, 5), (7, r, 3))):
                px0 = cx + ox
                d.polygon([(px0 - ww, cy + 4), (px0 + ww, cy + 4), (px0 + ww, cy + 4 - hh + ww), (px0, cy + 4 - hh),
                           (px0 - ww, cy + 4 - hh + ww)], fill=(dark, mid, light)[k])
                d.line([px0, cy + 2, px0, cy + 6 - hh], fill=hi)
        else:
            d.rectangle([cx - 1, cy + 2, cx + 1, cy + 7], fill=P["trunk"])
            d.ellipse([cx - r, cy - r - 2, cx + r, cy + r - 2], fill=dark)
            d.ellipse([cx - r + 1, cy - r - 3, cx + r - 3, cy + r - 5], fill=mid)
            d.ellipse([cx - r + 3, cy - r - 2, cx + 1, cy - 1], fill=light)
            for _ in range(3):
                d.point([(cx - rng.randint(1, r - 2), cy - rng.randint(3, r))], fill=hi)

    snap = [gen3.snap((channel, 0, 0))[0] for channel in range(256)]
    return img.point(snap * 3).resize((L.w * TILE, L.h * TILE), Image.Resampling.NEAREST)


# ------------------------------------------------------------------ ghi file
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(map_id, out_preview=None):
    tmj_path, tmj, marks, theme = load_realm(map_id)
    seed = sum(map_id.encode()) * 7919
    for attempt in range(12):
        L, rivers, zones = build_layout(map_id, tmj["width"], tmj["height"], marks, seed + attempt, theme)
        problems = verify(L, marks)
        if not problems:
            break
    if problems:
        raise SystemExit(f"{map_id}: {problems}")
    connected = bfs(L, marks["spawn"], {x + 1 for x, _ in marks["gatekeeper"]})
    for y, row in enumerate(L.g):
        for x, gid in enumerate(row):
            if gid in WALKABLE and (x, y) not in connected:
                row[x] = TREE
    tmj["layers"][0]["data"] = [TREE if v == MON else v for row in L.g for v in row]
    # lớp công trình (renderer vẽ theo thứ tự y cùng nhân vật)
    tmj["layers"] = [layer for layer in tmj["layers"] if layer["name"] != "structures"]
    objs = []
    for kind, mx, my in L.monuments:
        objs.append({"id": tmj["nextobjectid"], "name": f"{kind}-{mx}-{my}", "type": kind, "point": True,
                     "x": mx * 32, "y": (my + 1) * 32, "visible": True})
        tmj["nextobjectid"] += 1
    tmj["layers"].append({"id": tmj["nextlayerid"], "name": "structures", "type": "objectgroup", "visible": True,
                          "opacity": 1, "objects": objs})
    tmj["nextlayerid"] += 1
    for layer in tmj["layers"]:
        if layer["name"] == "traversal":
            layer["objects"] = []
    if map_id == "01-dawn-meadow":
        add_meadow_landscape(tmj)
    tmj_path.write_text(json.dumps(tmj, ensure_ascii=False, indent=1), encoding="utf8")
    terrain = paint(L, theme, seed, rivers)
    terrain_path = tmj_path.parent / "terrain.png"
    terrain.save(terrain_path, optimize=True)
    if out_preview:
        terrain.resize((terrain.width // 3, terrain.height // 3), Image.Resampling.BOX).save(out_preview)
    manifest_path = BUNDLE / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf8"))
    files = manifest["files"]
    for p in (tmj_path, terrain_path):
        key = p.relative_to(BUNDLE).as_posix()
        entry = files.setdefault(key, {})
        entry["sha256"] = sha(p)
        entry["bytes"] = p.stat().st_size
        if p.suffix == ".png":
            entry["width"], entry["height"] = terrain.size
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(f"{map_id}: ok (try {attempt + 1}), terrain {terrain.size}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--preview-dir", default="")
    args = ap.parse_args()
    ids = [m for m in sorted(p.name for p in (BUNDLE / "maps").iterdir()) if not args.only or m in args.only.split(",")]
    for mid in ids:
        run(mid, Path(args.preview_dir) / f"{mid}.png" if args.preview_dir else None)
