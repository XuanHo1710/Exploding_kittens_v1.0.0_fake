r"""Vẽ lại ba atlas giao diện (hud-kit, combat-kit, astral-orb) theo chất liệu của art-source/structures:
đá xám khắc có vân, viền đồng vát sáng trên-trái / tối dưới-phải, chỉ vàng, đá quý nhiều mặt. Vẽ ở mật độ
1:1 (không phóng ×2) và giữ nguyên tọa độ các ô của bản cũ (bảng cắt trong art-source/ui/README.md).
Ghi art-source/ui/**-source.png (nền #FF00FF) rồi xuất 1-1 sang ui/ qua art_source.py.

  py tools/expedition/pixel_ui.py
"""

from __future__ import annotations

import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
for _p in (os.path.join(HERE, "..", "units", ".pydeps"), os.path.join(HERE, "..", "gen3"), HERE):
    _p = os.path.abspath(_p)
    if os.path.isdir(_p) and _p not in sys.path:
        sys.path.insert(0, _p)

from PIL import Image  # noqa: E402

import gen3  # noqa: E402
from art_source import UI_FILES, export, mapping, save_source, write_readme  # noqa: E402
from pixel_rig import OUTLINE, _hash  # noqa: E402
from pixel_vfx import PALETTES, draw_motif  # noqa: E402

S = gen3.snap
BRONZE = [S(c) for c in ((236, 200, 140), (196, 146, 86), (146, 98, 60), (92, 60, 44), (52, 36, 36))]
GOLD = [S(c) for c in ((255, 240, 176), (232, 196, 108), (186, 136, 64))]
STONE = [S(c) for c in ((118, 112, 126), (88, 84, 100), (64, 60, 78), (44, 40, 56), (30, 27, 40))]
INK = S((26, 23, 36))


def _set(px, w, h, x, y, c):
    if 0 <= x < w and 0 <= y < h:
        px[x, y] = c + (255,)


def chamfer_dist(x, y, box, c):
    x0, y0, x1, y1 = box
    d = min(x - x0, x1 - x, y - y0, y1 - y)
    for cx, cy, sx, sy in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
        d = min(d, ((x - cx) * sx + (y - cy) * sy - c) / 1.4142)
    return d


def panel(img, box, chamfer=4, rim=BRONZE, fill=STONE, active=False, rim_w=3, carved=True):
    """Chamfered frame: dark outline, bevelled metal rim, recessed textured stone face."""
    px = img.load()
    w, h = img.size
    x0, y0, x1, y1 = box
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            d = chamfer_dist(x + 0.5, y + 0.5, (x0, y0, x1 + 1, y1 + 1), chamfer)
            if d < 0:
                continue
            if d < 1:
                _set(px, w, h, x, y, OUTLINE)
            elif d < 1 + rim_w:
                # bevel: which side are we closest to?
                top_left = (y - y0) + (x - x0) < (y1 - y) + (x1 - x)
                k = d - 1
                tone = 0 if (top_left and k < 1.2) else (1 if top_left else (3 if k < 1.2 else 2))
                if active and tone in (0, 1):
                    tone = 0
                _set(px, w, h, x, y, rim[tone])
            elif d < 2 + rim_w:
                _set(px, w, h, x, y, fill[4])  # inner shadow lip
            else:
                n = _hash(x // 3, y // 3, 17) * 0.6 + _hash(x, y, 3) * 0.4
                if carved:
                    shade = 1 if n > 0.72 else (2 if n > 0.30 else 3)
                else:
                    shade = 3 if n > 0.5 else 4
                # top-left of the recess catches no light (it is under the rim)
                if d < 4 + rim_w and ((y - y0) < (y1 - y)):
                    shade = min(4, shade + 1)
                _set(px, w, h, x, y, fill[shade])
    # gold studs in two corners
    for sx, sy in ((x0 + chamfer + 1, y0 + 2), (x1 - chamfer - 1, y1 - 2)):
        _set(px, w, h, sx, sy, GOLD[0])


def gem(img, cx, cy, rw, rh, pal, empty=False):
    """Faceted diamond gem: light facet top-left, dark bottom-right, gold setting."""
    px = img.load()
    w, h = img.size
    for y in range(cy - rh - 2, cy + rh + 3):
        for x in range(cx - rw - 2, cx + rw + 3):
            d = abs(x - cx) / (rw + 0.5) + abs(y - cy) / (rh + 0.5)
            if d > 1.0 + 2.5 / max(rw, rh):
                continue
            if d > 1.0 + 1.2 / max(rw, rh):
                _set(px, w, h, x, y, OUTLINE)
                continue
            if d > 1.0 - 1.5 / max(rw, rh):
                _set(px, w, h, x, y, GOLD[1] if (x < cx or y < cy) else GOLD[2])
                continue
            if empty:
                _set(px, w, h, x, y, STONE[4] if (x + y) & 1 else STONE[3])
                continue
            left, up = x <= cx, y <= cy
            facet = 0 if (left and up) else (1 if up else (2 if left else 3))
            inner = d < 0.45
            tone = (pal[0] if inner and facet == 0 else pal[1 + min(facet, 3)])
            _set(px, w, h, x, y, tone)
    if not empty:
        for k in range(3):
            _set(px, w, h, cx - rw // 3 + k, cy - rh // 2 + k, S((255, 255, 255)))


def ring(img, cx, cy, r, width, col_lit, col_dark, a0=0.0, a1=2 * math.pi, outline=True):
    px = img.load()
    w, h = img.size
    for y in range(int(cy - r - width - 2), int(cy + r + width + 3)):
        for x in range(int(cx - r - width - 2), int(cx + r + width + 3)):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            dist = math.hypot(dx, dy)
            a = math.atan2(dy, dx) % (2 * math.pi)
            if not (a0 <= a <= a1):
                continue
            if abs(dist - r) <= width / 2:
                _set(px, w, h, x, y, col_lit if (dx + dy) < 0 else col_dark)
            elif outline and abs(dist - r) <= width / 2 + 1 and 0 <= x < w and 0 <= y < h and px[x, y][3] == 0:
                _set(px, w, h, x, y, OUTLINE)


# ---------------------------------------------------------------- hud-kit 256x64


def hud_kit():
    img = Image.new("RGBA", (256, 64), (0, 0, 0, 0))
    panel(img, (0, 0, 63, 63), chamfer=7, active=True, rim_w=4)
    gem(img, 96, 32, 14, 23, [S(c) for c in ((255, 246, 200), (255, 206, 110), (232, 150, 60), (176, 96, 42), (110, 56, 34))])
    gem(img, 144, 32, 14, 23, None, empty=True)
    ring(img, 224, 32, 21, 6, BRONZE[1], BRONZE[3])
    ring(img, 224, 32, 21, 3, GOLD[0], GOLD[2], a0=math.radians(200), a1=math.radians(340), outline=False)
    ring(img, 224, 32, 13, 3, STONE[1], STONE[3])
    return img


# ---------------------------------------------------------------- combat-kit 288x192

BAR_COLOURS = (
    ((214, 86, 86), (150, 44, 52)),     # HP
    ((240, 186, 92), (176, 116, 50)),    # AP
    ((110, 200, 194), (54, 120, 130)),   # Break
    ((176, 146, 232), (104, 78, 166)),   # Phase
)


def combat_kit():
    img = Image.new("RGBA", (288, 192), (0, 0, 0, 0))
    px = img.load()
    for i, el in enumerate(("verdant", "frost", "solar", "tide", "pyre", "astral")):
        x = 48 * i
        panel(img, (x + 2, 2, x + 45, 45), chamfer=6, rim_w=3)
        cols = [S(c) for c in PALETTES[el]]
        # glowing medallion + element motif at 3x scale
        for y in range(10, 38):
            for xx in range(x + 10, x + 38):
                d = math.hypot(xx + 0.5 - (x + 24), y + 0.5 - 24)
                if d < 11:
                    _set(px, 288, 192, xx, y, cols[3] if d > 9 else (cols[2] if (xx + y) & 1 and d > 6 else cols[3 if d > 7 else 2]))
        icon = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        draw_motif(icon.load(), {"verdant": "leaf", "frost": "shard", "solar": "ray", "tide": "drop", "pyre": "ember", "astral": "star"}[el], 8, 8, 3, 0.8, cols)
        big = icon.resize((32, 32), Image.NEAREST)
        bp = big.load()
        for yy in range(32):
            for xx in range(32):
                if bp[xx, yy][3] == 0 and any(0 <= xx + ox < 32 and 0 <= yy + oy < 32 and bp[xx + ox, yy + oy][3] and bp[xx + ox, yy + oy][:3] != OUTLINE for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    bp[xx, yy] = OUTLINE + (255,)
        img.alpha_composite(big, (x + 8, 8))
    for i, (lit, dark) in enumerate(BAR_COLOURS):
        y = 52 + 32 * i
        panel(img, (0, y, 109, y + 27), chamfer=5, rim_w=3, carved=False)
        for xx in range(8, 96):
            for yy in range(y + 9, y + 19):
                seg = (xx - 8) % 14 < 12
                if not seg:
                    continue
                c = S(lit) if yy < y + 13 else S(dark)
                if yy == y + 9:
                    c = S(tuple(min(255, v + 40) for v in lit))
                _set(px, 288, 192, xx, yy, c)
    for i, (rim, active, face) in enumerate(((BRONZE, False, STONE), (BRONZE, True, STONE), ([S(c) for c in ((128, 124, 140), (100, 96, 112), (78, 74, 90), (56, 52, 68), (36, 33, 46))], False, STONE))):
        y = 52 + 32 * i
        panel(img, (118, y, 287, y + 27), chamfer=5, rim_w=3, rim=rim, active=active, carved=i != 2)
        gem(img, 132, y + 14, 5, 7, [S(c) for c in ((255, 246, 200), (255, 206, 110), (232, 150, 60), (176, 96, 42), (110, 56, 34))] if i == 1 else None, empty=i != 1)
    for k, (cx, kind) in enumerate(((152, "chill"), (206, "guard"), (258, "curse"))):
        panel(img, (cx - 18, 152, cx + 18, 188), chamfer=5, rim_w=3)
        if kind == "chill":
            cols = [S(c) for c in PALETTES["frost"]]
            for t in range(-9, 10):
                _set(px, 288, 192, cx + t, 170 - t // 2, cols[1])
                _set(px, 288, 192, cx + t, 171 - t // 2, cols[2])
            draw_motif(px, "shard", cx + 6, 164, 2, 0, cols)
        elif kind == "guard":
            gem(img, cx, 170, 9, 11, [S(c) for c in PALETTES["solar"]])
        else:
            cols = [S(c) for c in PALETTES["astral"]]
            ring(img, cx, 170, 9, 3, cols[1], cols[3], a0=math.radians(40), a1=math.radians(320))
            draw_motif(px, "star", cx + 6, 166, 1, 0, cols)
    return img


# ---------------------------------------------------------------- astral-orb 1024x768 (8x6 @128)


def orb_frame(row, f):
    """Faceted astral crystal inside a rotating gold astrolabe (rows: idle 8, charge 4, shake 5,
    rarity reveal 4, shatter 4, settle 3)."""
    img = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    px = img.load()
    astral = [S(c) for c in PALETTES["astral"]]
    frost = [S(c) for c in PALETTES["frost"]]
    solar = [S(c) for c in PALETTES["solar"]]
    cx, cy = 64, 66
    if row == 2:
        cx += (0, -6, -10, 7, 11)[f]
    pal = solar if (row in (3, 4) and f >= 2) else (astral if row >= 2 else frost)
    if row == 4 and f >= 2:
        # shatter: gold star burst with shards flying out
        from pixel_vfx import Field
        fld = Field()
        r = 18 + (f - 2) * 14
        for k in range(8):
            a = k * math.pi / 4 + f * 0.3
            fld.beam(48, 48, 48 + math.cos(a) * r, 48 + math.sin(a) * r, 3, 1.0, taper=0.7)
        fld.disc(48, 48, 14 - (f - 2) * 4, 1.0)
        for k in range(10):
            a = k * 0.63 + f
            fld.stamp("shard", 48 + math.cos(a) * (r + 6), 48 + math.sin(a) * (r + 6), 1, 0)
        burst = fld.render(PALETTES["solar"]).resize((128, 128), Image.NEAREST)
        img.alpha_composite(burst)
        return img
    # back half of the astrolabe ring
    ang = f * 22 if row != 1 else f * 40
    tilt = 0.42

    def ring_pts(front):
        for t in range(0, 360, 2):
            a = math.radians(t + ang)
            x, y = cx + math.cos(a) * 44, cy + math.sin(a) * 44 * tilt
            if (math.sin(a) > 0) == front and not (110 < (t % 360) < 150):
                yield x, y

    for x, y in ring_pts(False):
        for dy in (-1, 0, 1):
            _set(px, 128, 128, int(x), int(y) + dy, BRONZE[2] if dy else BRONZE[1])
    # crystal: octagonal faceted orb
    R = 26
    for y in range(cy - R - 2, cy + R + 3):
        for x in range(cx - R - 2, cx + R + 3):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            d = max(abs(dx), abs(dy), (abs(dx) + abs(dy)) / 1.3)
            if d > R + 1.5:
                continue
            if d > R:
                _set(px, 128, 128, x, y, OUTLINE)
                continue
            # facets: angular sectors with a lit upper-left
            a = math.atan2(dy, dx)
            sector = int(((a + math.pi) / (2 * math.pi)) * 8) % 8
            lit = (-dx - dy) / (R * 1.4)
            inner = d < R * 0.45
            if inner:
                c = pal[0] if (lit > 0.05 or (x + y) % 3 == 0) else pal[1]
            else:
                tone = 1 if lit > 0.25 else (2 if lit > -0.15 else 3)
                if sector % 2:
                    tone = min(4, tone + 1)
                c = pal[tone]
            _set(px, 128, 128, x, y, c)
    for k in range(5):
        _set(px, 128, 128, cx - 14 + k, cy - 15 + k, S((255, 255, 255)))
    for x, y in ring_pts(True):
        for dy in (-1, 0, 1):
            _set(px, 128, 128, int(x), int(y) + dy, GOLD[0] if dy < 0 else (GOLD[1] if dy == 0 else GOLD[2]))
    if row in (1, 3):
        for k in range(3):
            sx = cx + (k - 1) * (18 + f * 4)
            sy = cy - 40 - f * 5
            draw_motif(px, "star", sx, sy, 2, 0, solar if row == 3 else astral)
    return img


def astral_orb():
    sheet = Image.new("RGBA", (1024, 768), (0, 0, 0, 0))
    for row, n in enumerate((8, 4, 5, 4, 4, 3)):
        for f in range(n):
            sheet.alpha_composite(orb_frame(row, f), (f * 128, row * 128))
    return sheet


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.parse_args()
    for rel, img in (("ui/hud-kit.png", hud_kit()), ("ui/combat-kit.png", combat_kit()), ("ui/gacha/astral-orb.png", astral_orb())):
        assert img.size == UI_FILES[rel][0], rel
        save_source(rel, img)
    done, _ = export(mapping("ui"))
    write_readme("ui")
    print(f"exported {len(done)} ui atlas(es)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
