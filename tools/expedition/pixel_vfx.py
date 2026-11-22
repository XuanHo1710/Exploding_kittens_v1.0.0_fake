r"""Vẽ 60 dải hiệu ứng chiêu thức (6 nguyên tố × 5 kiểu × CAST/EFFECT, 8 frame × 96 px) theo phong cách art-source.

Mỗi frame cộng dồn một "trường năng lượng" (đĩa, vòng, lưỡi liềm, tia) rồi lượng tử thành 5 tông của
nguyên tố (lõi gần trắng → viền tối) với dither ô cờ ở ranh giới tông, thêm hạt đặc trưng (lá, mảnh băng,
tia nắng, giọt nước, than hồng, sao) có viền tối. Kết quả ghi vào art-source/vfx/skills/*-source.png
(nền #FF00FF) rồi xuất 1-1 sang vfx/skills/ qua art_source.py.

  py tools/expedition/pixel_vfx.py                 # vẽ + xuất cả 60 dải
  py tools/expedition/pixel_vfx.py --only pyre_slash --preview tmp/vfx
"""

from __future__ import annotations

import argparse
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
for _p in (os.path.join(HERE, "..", "units", ".pydeps"), os.path.join(HERE, "..", "gen3"), HERE):
    _p = os.path.abspath(_p)
    if os.path.isdir(_p) and _p not in sys.path:
        sys.path.insert(0, _p)

from PIL import Image  # noqa: E402

import gen3  # noqa: E402
from art_source import ELEMENTS, VFX_STYLES, export, mapping, save_source, write_readme  # noqa: E402

CELL = 96
TAU = 2 * math.pi

# core, bright, mid, dark, deep  (art-source: warm, slightly muted, luminous core)
PALETTES = {
    "verdant": [(240, 255, 214), (176, 232, 124), (100, 184, 86), (48, 112, 62), (28, 60, 42)],
    "frost": [(246, 252, 255), (176, 228, 250), (100, 172, 226), (54, 106, 170), (32, 54, 104)],
    "solar": [(255, 250, 216), (255, 216, 112), (236, 162, 56), (172, 98, 36), (94, 50, 30)],
    "tide": [(232, 252, 255), (136, 228, 236), (58, 172, 202), (32, 106, 152), (22, 54, 94)],
    "pyre": [(255, 244, 192), (255, 186, 84), (236, 106, 42), (162, 48, 38), (82, 26, 32)],
    "astral": [(252, 238, 255), (224, 172, 255), (168, 106, 230), (98, 58, 162), (50, 30, 94)],
}
LEVELS = (0.84, 0.60, 0.38, 0.20, 0.08)


class Field:
    def __init__(self):
        self.e = [0.0] * (CELL * CELL)
        self.stamps = []  # (kind, x, y, size, rot)

    def _add(self, x0, y0, x1, y1, fn):
        x0, y0 = max(0, int(x0)), max(0, int(y0))
        x1, y1 = min(CELL - 1, int(x1) + 1), min(CELL - 1, int(y1) + 1)
        e = self.e
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                v = fn(x + 0.5, y + 0.5)
                if v > 0:
                    i = y * CELL + x
                    e[i] = 1 - (1 - e[i]) * (1 - min(1.0, v))

    def disc(self, cx, cy, r, k=1.0, sy=1.0):
        def fn(x, y):
            d = math.hypot(x - cx, (y - cy) / sy) / max(r, 0.5)
            return k * max(0.0, 1 - d) ** 0.8
        self._add(cx - r, cy - r * sy, cx + r, cy + r * sy, fn)

    def ring(self, cx, cy, r, w, k=1.0, sy=0.45, a0=0.0, a1=TAU):
        def fn(x, y):
            dx, dy = x - cx, (y - cy) / sy
            a = math.atan2(dy, dx) % TAU
            lo, hi = a0 % TAU, a1 % TAU
            inside = (lo <= a <= hi) if lo <= hi else (a >= lo or a <= hi)
            if a1 - a0 >= TAU - 1e-6:
                inside = True
            if not inside:
                return 0.0
            d = abs(math.hypot(dx, dy) - r) / max(w, 0.5)
            return k * max(0.0, 1 - d)
        self._add(cx - r - w, cy - (r + w) * sy, cx + r + w, cy + (r + w) * sy, fn)

    def crescent(self, cx, cy, r, w, a0, a1, k=1.0, sy=1.0):
        """Thick arc tapering at both ends: the classic slash smear."""
        span = (a1 - a0) or 1e-6

        def fn(x, y):
            dx, dy = x - cx, (y - cy) / sy
            a = math.atan2(dy, dx)
            t = ((a - a0) / span) if span > 0 else ((a0 - a) / -span)
            t2 = ((a + TAU - a0) / span) if span > 0 else ((a0 - a + TAU) / -span)
            if not 0 <= t <= 1:
                t = t2 if 0 <= t2 <= 1 else -1
            if t < 0:
                return 0.0
            ww = w * math.sin(math.pi * t) ** 0.7
            d = abs(math.hypot(dx, dy) - r) / max(ww, 0.4)
            return k * max(0.0, 1 - d) * (0.55 + 0.45 * t)
        self._add(cx - r - w, cy - (r + w) * sy, cx + r + w, cy + (r + w) * sy, fn)

    def beam(self, x0, y0, x1, y1, w, k=1.0, taper=0.0):
        vx, vy = x1 - x0, y1 - y0
        l2 = vx * vx + vy * vy or 1.0

        def fn(x, y):
            t = max(0.0, min(1.0, ((x - x0) * vx + (y - y0) * vy) / l2))
            ww = w * (1 - taper * t)
            d = math.hypot(x - (x0 + vx * t), y - (y0 + vy * t)) / max(ww, 0.4)
            return k * max(0.0, 1 - d)
        self._add(min(x0, x1) - w, min(y0, y1) - w, max(x0, x1) + w, max(y0, y1) + w, fn)

    def stamp(self, kind, x, y, size=1, rot=0.0):
        self.stamps.append((kind, x, y, size, rot))

    def render(self, pal) -> Image.Image:
        cols = [gen3.snap(c) for c in pal]
        im = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        px = im.load()
        e = self.e
        for y in range(CELL):
            for x in range(CELL):
                v = e[y * CELL + x] + (0.035 if (x + y) & 1 else -0.035)
                for i, lv in enumerate(LEVELS):
                    if v > lv:
                        px[x, y] = cols[i] + (255,)
                        break
        for kind, x, y, size, rot in self.stamps:
            draw_motif(px, kind, x, y, size, rot, cols)
        # dark rim in the element's deep tone (art-source glows keep a readable edge)
        rim = []
        for y in range(CELL):
            for x in range(CELL):
                if px[x, y][3] == 0:
                    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                        if 0 <= nx < CELL and 0 <= ny < CELL and px[nx, ny][3] and px[nx, ny][:3] in (cols[0], cols[1], cols[2]):
                            rim.append((x, y))
                            break
        for x, y in rim:
            px[x, y] = cols[4] + (255,)
        return im


def _put(px, x, y, c):
    if 0 <= x < CELL and 0 <= y < CELL:
        px[x, y] = c + (255,)


def draw_motif(px, kind, x, y, size, rot, cols):
    """Element particles: hard pixel shapes, light core + dark edge."""
    x, y = int(round(x)), int(round(y))
    core, bright, mid, dark, deep = cols
    s = max(1, size)
    if kind == "leaf":
        ca, sa = math.cos(rot), math.sin(rot)
        for t in range(-2 * s, 2 * s + 1):
            w = int(round((1 - (t / (2 * s + 0.5)) ** 2) * s))
            for k in range(-w, w + 1):
                _put(px, int(x + ca * t - sa * k), int(y + sa * t + ca * k), bright if k <= 0 else mid)
        _put(px, int(x + ca * 2 * s), int(y + sa * 2 * s), deep)
    elif kind == "shard":
        for t in range(-2 * s, 2 * s + 1):
            w = s - abs(t) // 2
            for k in range(-w, w + 1):
                _put(px, x + k, y + t, core if k < 0 else bright if k == 0 else mid)
        _put(px, x, y + 2 * s + 1, dark)
    elif kind == "ray":
        for t in range(-2 * s, 2 * s + 1):
            c = core if abs(t) < s else bright
            _put(px, x + t, y, c)
            _put(px, x, y + t, c)
        _put(px, x, y, core)
    elif kind == "drop":
        for t in range(-s - 1, s + 2):
            w = max(0, int(round(math.sqrt(max(0, (s + 0.6) ** 2 - t * t)))) if t >= 0 else max(0, s + t))
            for k in range(-w, w + 1):
                _put(px, x + k, y + t, core if (k < 0 and t < 0) else bright if k <= 0 else mid)
    elif kind == "ember":
        for t in range(-2 * s, s + 1):
            w = s if t >= 0 else max(0, s + (t + 1) // 2)
            for k in range(-w, w + 1):
                _put(px, x + k, y + t, core if (t >= 0 and abs(k) < s) else bright if t > -s else mid)
        _put(px, x, y - 2 * s - 1, dark)
    elif kind == "star":
        for t in range(-2 * s, 2 * s + 1):
            _put(px, x + t, y, bright)
            _put(px, x, y + t, bright)
        for t in range(-s, s + 1):
            _put(px, x + t, y + t, mid)
            _put(px, x + t, y - t, mid)
        _put(px, x, y, core)
    elif kind == "rune":
        for t in range(-s, s + 1):
            _put(px, x + t, y - s, bright)
            _put(px, x, y + t, bright)
        _put(px, x - s, y + s, mid)
        _put(px, x + s, y + s, mid)


MOTIF = {"verdant": "leaf", "frost": "shard", "solar": "ray", "tide": "drop", "pyre": "ember", "astral": "star"}


def _particles(f: Field, el, rng, cx, cy, n, spread, rise, frame, size=1, sy=0.8):
    for k in range(n):
        a = rng.uniform(0, TAU)
        r = spread * rng.uniform(0.3, 1.0)
        x = cx + math.cos(a) * r
        y = cy + math.sin(a) * r * sy - rise * frame * rng.uniform(0.6, 1.4)
        f.stamp(MOTIF[el], x, y, size + (1 if rng.random() < 0.25 else 0), a)


# ---------------------------------------------------------------- CAST (on the caster)


def cast_frame(el, style, i, rng) -> Field:
    f = Field()
    grow = min(1.0, (i + 1) / 4)
    fade = 1.0 if i < 5 else (1.0 - (i - 4) * 0.28)
    # ground circle under the caster's feet
    f.ring(48, 82, 30 * grow, 2.2, 0.75 * fade, sy=0.32)
    f.ring(48, 82, 22 * grow, 1.2, 0.45 * fade, sy=0.32, a0=i * 0.4, a1=i * 0.4 + 4.2)
    focus = (48, 44)
    if style == "slash":
        a0 = -2.6 + i * 0.25
        f.crescent(48, 48, 26, 5 + i * 0.6, a0, a0 + 2.2 * grow, 0.95 * fade, sy=0.9)
        focus = (62, 34)
    elif style == "ray":
        r = 4 + i * 1.6 if i < 5 else 12 - (i - 5) * 3
        f.disc(60, 40, r, 1.0 * fade)
        for k in range(6):
            a = k * TAU / 6 + i * 0.3
            f.beam(60, 40, 60 + math.cos(a) * (r + 8), 40 + math.sin(a) * (r + 8), 1.4, 0.7 * fade, taper=0.8)
        focus = (60, 40)
    elif style == "meteor":
        f.ring(48, 16, 16 * grow, 1.6, 0.85 * fade, sy=0.42)
        f.disc(48, 16, 5 * grow, 0.9 * fade)
        for k in range(4):
            x = 30 + k * 12
            f.beam(x, 70, x + 2, 70 - 30 * grow, 1.0, 0.45 * fade, taper=0.7)
        focus = (48, 18)
    elif style == "wave":
        for k in range(3):
            rr = (8 + 12 * k + i * 4) % 40 + 4
            f.ring(48, 82, rr, 1.8, 0.8 * fade * (1 - rr / 48), sy=0.32)
        f.beam(48, 80, 48, 80 - 50 * grow, 5 * grow, 0.55 * fade, taper=0.6)
        focus = (48, 40)
    else:  # sigil
        f.ring(48, 82, 32 * grow, 1.4, 0.9 * fade, sy=0.32)
        for k in range(8):
            a = k * TAU / 8 + i * 0.35
            f.stamp("rune", 48 + math.cos(a) * 26 * grow, 82 + math.sin(a) * 26 * 0.32 * grow, 1, 0)
        if i >= 3:
            f.beam(48, 82, 48, 14, 6 * fade, 0.6 * fade, taper=0.4)
        focus = (48, 46)
    # motes converge on the focus, then burst at the peak
    for k in range(7):
        a = k * TAU / 7 + i * 0.5
        r = max(4.0, 34 * (1 - i / 5)) if i < 5 else 10 + (i - 4) * 10
        f.stamp(MOTIF[el], focus[0] + math.cos(a) * r, focus[1] + math.sin(a) * r * 0.8, 1 + (k % 3 == 0), a)
    if i == 4:
        f.disc(focus[0], focus[1], 10, 1.0)
    return f


# ---------------------------------------------------------------- EFFECT (on the target)


def effect_frame(el, style, i, rng) -> Field:
    f = Field()
    cx, cy = 48, 56
    if style == "slash":
        cuts = ((-2.4, -0.6, 30, 0), (2.2, 0.6, 28, 1), (-1.9, 0.0, 24, 2))
        for a0, span_dir, r, start in cuts:
            age = i - start
            if 0 <= age <= 3:
                k = 1.0 - age * 0.22
                f.crescent(cx + (start - 1) * 4, cy - 4, r, 6 - age, a0, a0 + 2.0 * (1 if a0 < 0 else -1) * min(1, (age + 1) / 2), k)
        if 3 <= i <= 4:
            f.beam(cx - 22, cy - 22, cx + 22, cy + 18, 3.5, 1.0, taper=0.0)
            f.beam(cx + 22, cy - 22, cx - 22, cy + 18, 3.5, 1.0, taper=0.0)
            f.disc(cx, cy - 2, 9, 1.0)
        if i >= 4:
            _particles(f, el, rng, cx, cy, 8, 12 + (i - 4) * 9, 0.0, 0, 1)
    elif style == "ray":
        if i <= 5:
            w = (1.5, 3, 6, 8, 8, 5)[i]
            f.beam(94, 2, cx, cy, w, 1.0 if i >= 2 else 0.7, taper=0.1)
            f.beam(94, 2, cx, cy, w * 0.4, 1.0)
        if i >= 3:
            r = (10, 16, 20, 16, 10)[min(4, i - 3)]
            f.disc(cx, cy, r, 1.0 if i < 6 else 0.55)
            f.ring(cx, cy + 14, r + 6, 2.0, 0.8, sy=0.4)
        if i >= 5:
            _particles(f, el, rng, cx, cy, 9, 14 + (i - 5) * 10, 3.0, i - 5, 1)
    elif style == "meteor":
        if i <= 3:
            t = (i + 1) / 4
            mx, my = 90 - 42 * t, 4 + 50 * t
            f.beam(mx + 18, my - 22, mx, my, 7, 0.75, taper=0.8)
            f.disc(mx, my, 8, 1.0)
            f.stamp(MOTIF[el], mx + 12, my - 14, 1, 0.6)
        elif i == 4:
            f.disc(cx, cy, 26, 1.0)
        else:
            r = 20 + (i - 5) * 10
            f.ring(cx, cy + 8, r, 4 - (i - 5), 0.95 - (i - 5) * 0.25, sy=0.45)
            f.disc(cx, cy, 14 - (i - 5) * 5, 0.8)
            _particles(f, el, rng, cx, cy, 10, r, 4.0, i - 4, 1)
    elif style == "wave":
        if i <= 4:
            t = i / 4
            x = 10 + 70 * t
            f.crescent(x - 18, cy, 24, 8, -1.2, 1.2, 1.0, sy=1.2)
            f.crescent(x - 26, cy, 18, 4, -1.0, 1.0, 0.6, sy=1.2)
            for k in range(3):
                f.stamp(MOTIF[el], x + 2, cy - 24 + k * 22, 1, 0)
        if i >= 4:
            f.disc(cx, cy, 16 - (i - 4) * 3, 0.9)
            _particles(f, el, rng, cx, cy, 10, 12 + (i - 4) * 8, 4.0, i - 4, 1)
    else:  # sigil
        grow = min(1.0, (i + 1) / 3)
        f.ring(cx, 84, 34 * grow, 1.6, 0.95, sy=0.34)
        f.ring(cx, 84, 24 * grow, 1.0, 0.6, sy=0.34, a0=-i * 0.5, a1=-i * 0.5 + 4.5)
        for k in range(6):
            a = k * TAU / 6 - i * 0.4
            f.stamp("rune", cx + math.cos(a) * 29 * grow, 84 + math.sin(a) * 29 * 0.34 * grow, 1, 0)
        if 3 <= i <= 5:
            w = (8, 12, 7)[i - 3]
            f.beam(cx, 84, cx, 2, w, 1.0, taper=0.2)
            f.beam(cx, 84, cx, 2, w * 0.35, 1.0)
        if i >= 5:
            for k in range(5):
                f.stamp("rune", cx - 20 + k * 10, 70 - (i - 5) * 14 - (k % 2) * 6, 1, 0)
    return f


def render_pair(element: str, style: str):
    pal = PALETTES[element]
    cast = Image.new("RGBA", (CELL * 8, CELL), (0, 0, 0, 0))
    eff = Image.new("RGBA", (CELL * 8, CELL), (0, 0, 0, 0))
    for i in range(8):
        rng = random.Random(f"{element}-{style}-{i}")
        cast.alpha_composite(cast_frame(element, style, i, rng).render(pal), (i * CELL, 0))
        rng = random.Random(f"{element}-{style}-fx-{i}")
        eff.alpha_composite(effect_frame(element, style, i, rng).render(pal), (i * CELL, 0))
    return cast, eff


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", default="", help="comma separated keys such as pyre_slash")
    ap.add_argument("--preview", default="", help="folder for a contact sheet of every strip")
    args = ap.parse_args()
    keys = [f"{e}_{s}" for e in ELEMENTS for s in VFX_STYLES]
    if args.only:
        keys = [k for k in keys if k in args.only.split(",")]
    for key in keys:
        el, st = key.split("_")
        cast, eff = render_pair(el, st)
        save_source(f"vfx/skills/{key}-cast.png", cast)
        save_source(f"vfx/skills/{key}-effect.png", eff)
    rows = [m for m in mapping("vfx") if any(m[0].startswith(f"vfx/skills/{k}-") for k in keys)]
    done, _ = export(rows)
    write_readme("vfx")
    if args.preview:
        os.makedirs(args.preview, exist_ok=True)
        sheet = Image.new("RGBA", (768, 96 * 2 * len(keys)), (40, 42, 54, 255))
        for n, key in enumerate(keys):
            for k, ph in enumerate(("cast", "effect")):
                with Image.open(os.path.join(HERE, "..", "..", "database-astral-expedition", "vfx", "skills", f"{key}-{ph}.png")) as im:
                    sheet.alpha_composite(im.convert("RGBA"), (0, (2 * n + k) * 96))
        sheet.save(os.path.join(args.preview, "vfx-contact.png"))
    print(f"drew {len(keys)} vfx pair(s), exported {len(done)} strip(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
