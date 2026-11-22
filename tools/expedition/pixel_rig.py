"""3D-rig -> pixel rasterizer for Astral Expedition unit sprites (no external deps beyond Pillow).

Mỗi nhân vật được dựng bằng các khối 3D đơn giản (capsule côn, khối cầu, tam giác) trong hệ
tọa độ của chính nhân vật: +x = tay phải, +y = lên, +z = phía trước mặt. Camera xoay theo
`yaw` (hướng nhìn) và `pitch` (góc nhìn từ trên xuống), chiếu trực giao rồi raster bằng
z-buffer. Ánh sáng cố định từ trên-trái-phía trước (`LIGHT`), đổ bóng thành các dải màu rõ
(cel shading 4 tông) theo chuẩn prompts/battle/README.md: viền tối #1b1726 1 px, ánh sáng
trên-trái, pixel vuông, không blur, không anti-alias, alpha nhị phân.

Kết quả của một sheet được gom về <= 15 màu BGR555 (gen3) để qua `check_gen3.py`.

Ví dụ (chạy từ thư mục gốc): py tools/expedition/build_units.py --only gale_wolf,chicken
"""

from __future__ import annotations

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GEN3_DIR = os.path.abspath(os.path.join(HERE, "..", "gen3"))
PYDEPS = os.path.abspath(os.path.join(HERE, "..", "units", ".pydeps"))
for _p in (PYDEPS, GEN3_DIR, HERE):
    if os.path.isdir(_p) and _p not in sys.path:
        sys.path.insert(0, _p)

from PIL import Image  # noqa: E402

import gen3  # noqa: E402

OUTLINE = gen3.snap((27, 23, 38))
LIGHT = (-0.52, 0.62, 0.59)
_ln = math.sqrt(sum(c * c for c in LIGHT))
LIGHT = tuple(c / _ln for c in LIGHT)

# ---------------------------------------------------------------- vectors & rotations


def v_add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def v_sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def v_mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def v_lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def v_len(a):
    return math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])


def v_norm(a):
    n = v_len(a) or 1.0
    return (a[0] / n, a[1] / n, a[2] / n)


def v_cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def v_dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def m_mul(a, b):
    return tuple(
        tuple(sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)) for i in range(3)
    )


def m_apply(m, v):
    return (
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    )


IDENT = ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))


def rot_x(deg):
    """Positive: +y tilts toward +z (lean forward)."""
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return ((1.0, 0.0, 0.0), (0.0, c, -s), (0.0, s, c))


def rot_y(deg):
    """Positive: +z turns toward +x (turn toward own right)."""
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return ((c, 0.0, s), (0.0, 1.0, 0.0), (-s, 0.0, c))


def rot_z(deg):
    """Positive: +y tilts toward +x (lean to own right)."""
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return ((c, s, 0.0), (-s, c, 0.0), (0.0, 0.0, 1.0))


def limb_dir(pitch, roll, side=1.0):
    """Unit direction of a limb hanging from a joint: pitch 0 = down, 90 = forward, 180 = up,
    negative = backward; roll > 0 swings outward on `side` (+1 right, -1 left)."""
    p, r = math.radians(pitch), math.radians(roll)
    return (side * math.sin(r), -math.cos(r) * math.cos(p), math.cos(r) * math.sin(p))


# ---------------------------------------------------------------- colours & materials


def _clamp8(v):
    return max(0, min(255, int(round(v))))


def shade_rgb(rgb, k, hue_warm):
    """Lighten (k>0) toward warm or darken (k<0) toward cool purple: hue-shifted ramps."""
    r, g, b = rgb
    if k >= 0:
        tr, tg, tb = (255, 246, 214) if hue_warm else (240, 248, 255)
        return (r + (tr - r) * k, g + (tg - g) * k, b + (tb - b) * k)
    k = -k
    tr, tg, tb = (34, 22, 58)
    return (r + (tr - r) * k, g + (tg - g) * k, b + (tb - b) * k)


def art_tone(rgb, mute=0.16):
    """Art-source look: slightly muted, warm-leaning base colours (the ImageGen atlases in
    database-astral-expedition/art-source/ never use fully saturated primaries)."""
    r, g, b = rgb
    y = 0.299 * r + 0.587 * g + 0.114 * b
    r, g, b = (c + (y - c) * mute for c in (r, g, b))
    return (r + 4, g + 1, b - 3)


def _hash(a, b, seed=0):
    h = (a * 374761393 + b * 668265263 + seed * 2246822519) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


# texture kinds: brightness offset from part-local coordinates (u along the part, v across it)
# so fur strands, cloth weave and stone blotches stay glued to the body between frames.
TEXTURES = ("smooth", "skin", "cloth", "fur", "metal", "stone", "leaf", "scale")


def texture_offset(kind, x, y, u, v):
    if kind == "fur":
        # strands: change quickly across the part, slowly along it
        return (_hash(int(v * 7.0), int(u / 3.0), 7) - 0.5) * 0.52
    if kind == "cloth":
        fold = (_hash(int(v * 3.0), int(u / 6.0), 3) - 0.5) * 0.22
        weave = 0.05 if (x + 2 * y) % 4 == 0 else 0.0
        return fold + weave
    if kind == "metal":
        streak = 0.16 if (int(u) % 7 == 0 and abs(v) < 0.5) else 0.0
        return streak + (_hash(x // 2, y // 2, 11) - 0.5) * 0.08
    if kind == "stone":
        return (_hash(x // 3, y // 3, 5) - 0.5) * 0.42 + (_hash(x, y, 9) - 0.5) * 0.14
    if kind == "leaf":
        return (_hash(x // 2, y // 2, 13) - 0.5) * 0.42
    if kind == "scale":
        return 0.12 if (int(u / 2.5) + int(v * 3)) % 2 == 0 else -0.06
    if kind == "skin":
        return (_hash(x, y, 2) - 0.5) * 0.05
    return 0.0


THRESH = (0.70, 0.28, -0.12)


class Mat:
    """A material = 4-tone ramp [light, mid, shadow, deep] (+ optional specular / glow) and a
    texture kind. Band edges are checker-dithered like the hand-drawn atlases."""

    def __init__(self, rgb, light=0.34, dark=0.50, deep=0.78, spec=None, glow=False, line=True, warm=True, tex="smooth"):
        base = tuple(rgb) if glow else art_tone(tuple(rgb))
        self.ramp = [
            gen3.snap(tuple(_clamp8(c) for c in shade_rgb(base, light, warm))),
            gen3.snap(tuple(_clamp8(c) for c in base)),
            gen3.snap(tuple(_clamp8(c) for c in shade_rgb(base, -dark, warm))),
            gen3.snap(tuple(_clamp8(c) for c in shade_rgb(base, -deep, warm))),
        ]
        self.spec = gen3.snap(spec) if spec else None
        self.glow = glow
        self.line = line
        self.tex = tex

    def tone(self, intensity, x=0, y=0, u=0.0, v=0.0):
        if self.glow:
            return self.ramp[0] if intensity > 0.2 + (0.12 if (x + y) & 1 else 0.0) else self.ramp[1]
        if self.spec and intensity > 0.94:
            return self.spec
        t = intensity + texture_offset(self.tex, x, y, u, v)
        # ordered dither in a narrow band around each threshold
        d = 0.045 if (x + y) & 1 else -0.045
        t += d
        if t > THRESH[0]:
            return self.ramp[0]
        if t > THRESH[1]:
            return self.ramp[1]
        if t > THRESH[2]:
            return self.ramp[2]
        return self.ramp[3]

    @property
    def dark(self):
        return self.ramp[3]


# ---------------------------------------------------------------- camera


class Camera:
    """Orthographic camera. yaw = direction the character faces (0 = toward viewer / DOWN,
    90 = screen RIGHT, -90 = screen LEFT, 180 = away / UP, 135 = BACK battle, -45 = FRONT battle)."""

    def __init__(self, cx, base_y, yaw, pitch=20.0, scale=1.0):
        self.cx, self.base_y, self.scale = cx, base_y, scale
        a = math.radians(yaw)
        self.f = (math.sin(a), 0.0, math.cos(a))
        self.r = (-math.cos(a), 0.0, math.sin(a))
        self.cp, self.sp = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))

    def world(self, p):
        return (
            self.r[0] * p[0] + self.f[0] * p[2],
            p[1],
            self.r[2] * p[0] + self.f[2] * p[2],
        )

    def project(self, p):
        wx, wy, wz = self.world(p)
        s = self.scale
        sx = self.cx + wx * s
        sy = self.base_y + (-wy * self.cp + wz * self.sp) * s
        depth = (wz * self.cp + wy * self.sp) * s
        return (sx, sy, depth)


# ---------------------------------------------------------------- model (list of 3D primitives)


class Model:
    """Collects primitives in character-local 3D space."""

    def __init__(self):
        self.items = []

    def cap(self, a, b, ra, rb, mat, group=0):
        self.items.append(("cap", a, b, ra, rb, mat, group))

    def ball(self, c, r, mat, group=0, sy=1.0):
        self.items.append(("ell", c, r, r * sy, mat, group))

    def ell(self, c, rx, ry, mat, group=0):
        self.items.append(("ell", c, rx, ry, mat, group))

    def tri(self, a, b, c, mat, group=0):
        self.items.append(("tri", a, b, c, mat, group))

    def quad(self, a, b, c, d, mat, group=0):
        self.tri(a, b, c, mat, group)
        self.tri(a, c, d, mat, group)

    def poly(self, pts, mat, group=0):
        for i in range(1, len(pts) - 1):
            self.tri(pts[0], pts[i], pts[i + 1], mat, group)

    def line(self, a, b, rgb, bias=2.5):
        self.items.append(("line", a, b, gen3.snap(rgb), bias))

    def px(self, p, rgb, bias=2.0, size=1):
        self.items.append(("px", p, gen3.snap(rgb), bias, size))

    def chain(self, pts, r0, r1, mat, group=0):
        n = len(pts) - 1
        for i in range(n):
            ra = r0 + (r1 - r0) * i / max(1, n)
            rb = r0 + (r1 - r0) * (i + 1) / max(1, n)
            self.cap(pts[i], pts[i + 1], ra, rb, mat, group)

    def extend(self, other):
        self.items.extend(other.items)

    def transformed(self, fn):
        """New model with every 3D point passed through fn (radii unchanged)."""
        out = Model()
        for it in self.items:
            k = it[0]
            if k == "cap":
                out.items.append((k, fn(it[1]), fn(it[2])) + it[3:])
            elif k == "ell":
                out.items.append((k, fn(it[1])) + it[2:])
            elif k == "tri":
                out.items.append((k, fn(it[1]), fn(it[2]), fn(it[3])) + it[4:])
            elif k == "line":
                out.items.append((k, fn(it[1]), fn(it[2])) + it[3:])
            elif k == "px":
                out.items.append((k, fn(it[1])) + it[2:])
        return out

    def min_y(self):
        lo = 1e9
        for it in self.items:
            k = it[0]
            if k == "cap":
                lo = min(lo, it[1][1] - it[3], it[2][1] - it[4])
            elif k == "ell":
                lo = min(lo, it[1][1] - it[3])
            elif k == "tri":
                lo = min(lo, it[1][1], it[2][1], it[3][1])
        return lo


# ---------------------------------------------------------------- raster


class Raster:
    def __init__(self, w, h):
        self.w, self.h = w, h
        n = w * h
        self.z = [-1e9] * n
        self.c = [None] * n
        self.g = [-1] * n
        self.m = [None] * n

    def _put(self, x, y, d, col, grp, mat):
        if 0 <= x < self.w and 0 <= y < self.h:
            i = y * self.w + x
            if d > self.z[i]:
                self.z[i] = d
                self.c[i] = col
                self.g[i] = grp
                self.m[i] = mat

    def capsule(self, a, b, ra, rb, mat, grp):
        ax, ay, ad = a
        bx, by, bd = b
        ra = max(ra, 0.55)
        rb = max(rb, 0.55)
        rm = max(ra, rb) + 1
        x0 = max(0, int(math.floor(min(ax, bx) - rm)))
        x1 = min(self.w - 1, int(math.ceil(max(ax, bx) + rm)))
        y0 = max(0, int(math.floor(min(ay, by) - rm)))
        y1 = min(self.h - 1, int(math.ceil(max(ay, by) + rm)))
        abx, aby = bx - ax, by - ay
        l2 = abx * abx + aby * aby
        seg = math.sqrt(l2)
        lx, ly, lz = LIGHT
        for y in range(y0, y1 + 1):
            py = y + 0.5
            for x in range(x0, x1 + 1):
                px = x + 0.5
                if l2 > 1e-9:
                    t = ((px - ax) * abx + (py - ay) * aby) / l2
                    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
                else:
                    t = 0.0
                cx = ax + abx * t
                cy = ay + aby * t
                r = ra + (rb - ra) * t
                dx, dy = px - cx, py - cy
                d2 = dx * dx + dy * dy
                rr = r + 0.3
                if d2 <= rr * rr:
                    q = min(1.0, d2 / (r * r))
                    nz = math.sqrt(1.0 - q)
                    inv = 1.0 / rr
                    intensity = dx * inv * lx - dy * inv * ly + nz * lz
                    depth = ad + (bd - ad) * t + nz * r
                    cross = (dx * aby - dy * abx) / (seg * rr) if seg > 1e-6 else dx / rr
                    self._put(x, y, depth, mat.tone(intensity, x, y, t * seg, cross), grp, mat)

    def ellipse(self, c, rx, ry, mat, grp):
        cx, cy, cd = c
        rx = max(rx, 0.6)
        ry = max(ry, 0.6)
        x0 = max(0, int(math.floor(cx - rx - 1)))
        x1 = min(self.w - 1, int(math.ceil(cx + rx + 1)))
        y0 = max(0, int(math.floor(cy - ry - 1)))
        y1 = min(self.h - 1, int(math.ceil(cy + ry + 1)))
        lx, ly, lz = LIGHT
        rr = min(rx, ry)
        for y in range(y0, y1 + 1):
            v = (y + 0.5 - cy) / (ry + 0.3)
            for x in range(x0, x1 + 1):
                u = (x + 0.5 - cx) / (rx + 0.3)
                e = u * u + v * v
                if e <= 1.0:
                    nz = math.sqrt(1.0 - e)
                    intensity = u * lx - v * ly + nz * lz
                    self._put(x, y, cd + nz * rr, mat.tone(intensity, x, y, (y + 0.5 - cy), u), grp, mat)

    def triangle(self, a, b, c, mat, grp):
        (ax, ay, ad), (bx, by, bd), (cx, cy, cd) = a, b, c
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-6:
            return
        # flat normal from the projected facet (screen x right, y up, depth toward viewer)
        u = (bx - ax, -(by - ay), bd - ad)
        w = (cx - ax, -(cy - ay), cd - ad)
        n = v_norm(v_cross(u, w))
        if n[2] < 0:
            n = (-n[0], -n[1], -n[2])
        intensity = min(0.9, v_dot(n, LIGHT))
        x0 = max(0, int(math.floor(min(ax, bx, cx))))
        x1 = min(self.w - 1, int(math.ceil(max(ax, bx, cx))))
        y0 = max(0, int(math.floor(min(ay, by, cy))))
        y1 = min(self.h - 1, int(math.ceil(max(ay, by, cy))))
        eps = -0.02
        for y in range(y0, y1 + 1):
            py = y + 0.5
            for x in range(x0, x1 + 1):
                px = x + 0.5
                l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den
                l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den
                l3 = 1.0 - l1 - l2
                if l1 >= eps and l2 >= eps and l3 >= eps:
                    self._put(x, y, l1 * ad + l2 * bd + l3 * cd, mat.tone(intensity, x, y, float(y), x / 6.0), grp, mat)

    def line(self, a, b, col, bias):
        ax, ay, ad = a
        bx, by, bd = b
        n = int(max(abs(bx - ax), abs(by - ay))) + 1
        for i in range(n + 1):
            t = i / n
            x = int(math.floor(ax + (bx - ax) * t))
            y = int(math.floor(ay + (by - ay) * t))
            d = ad + (bd - ad) * t
            if 0 <= x < self.w and 0 <= y < self.h:
                j = y * self.w + x
                if d + bias >= self.z[j]:
                    if self.c[j] is None:
                        self.g[j] = 999
                    self.c[j] = col
                    self.z[j] = max(self.z[j], d)

    def pixel(self, p, col, bias, size):
        x0, y0 = int(math.floor(p[0])), int(math.floor(p[1]))
        for dy in range(size):
            for dx in range(size):
                x, y = x0 + dx, y0 + dy
                if 0 <= x < self.w and 0 <= y < self.h:
                    j = y * self.w + x
                    if self.c[j] is not None and p[2] + bias >= self.z[j]:
                        self.c[j] = col

    def finish(self, interior=True):
        """Interior part lines + 1 px dark outline -> RGBA image."""
        w, h = self.w, self.h
        c, z, g, m = self.c, self.z, self.g, self.m
        out = list(c)
        if interior:
            for y in range(h):
                for x in range(w):
                    i = y * w + x
                    if c[i] is None or m[i] is None or not m[i].line:
                        continue
                    gi, zi = g[i], z[i]
                    for j in (i - 1 if x > 0 else -1, i + 1 if x < w - 1 else -1, i - w, i + w):
                        if 0 <= j < w * h and c[j] is not None and g[j] != gi and g[j] != 999 and z[j] > zi + 2.2:
                            out[i] = m[i].dark
                            break
        for y in range(h):
            for x in range(w):
                i = y * w + x
                mi = m[i]
                if c[i] is None or mi is None or mi.glow or out[i] == mi.dark:
                    continue
                if (x > 0 and c[i - 1] is None) or (y > 0 and c[i - w] is None):
                    if out[i] in (mi.ramp[1], mi.ramp[2]):
                        out[i] = mi.ramp[0] if out[i] == mi.ramp[1] else mi.ramp[1]
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        px = img.load()
        for y in range(h):
            for x in range(w):
                col = out[y * w + x]
                if col is not None:
                    px[x, y] = col + (255,)
                else:
                    if (
                        (x > 0 and c[y * w + x - 1] is not None)
                        or (x < w - 1 and c[y * w + x + 1] is not None)
                        or (y > 0 and c[(y - 1) * w + x] is not None)
                        or (y < h - 1 and c[(y + 1) * w + x] is not None)
                    ):
                        px[x, y] = OUTLINE + (255,)
        return img


def render(model: Model, cam: Camera, w: int, h: int, interior=True) -> Image.Image:
    r = Raster(w, h)
    lines = []
    for it in model.items:
        k = it[0]
        if k == "cap":
            _, a, b, ra, rb, mat, grp = it
            r.capsule(cam.project(a), cam.project(b), ra * cam.scale, rb * cam.scale, mat, grp)
        elif k == "ell":
            _, c, rx, ry, mat, grp = it
            r.ellipse(cam.project(c), rx * cam.scale, ry * cam.scale, mat, grp)
        elif k == "tri":
            _, a, b, c, mat, grp = it
            r.triangle(cam.project(a), cam.project(b), cam.project(c), mat, grp)
        else:
            lines.append(it)
    for it in lines:
        if it[0] == "line":
            r.line(cam.project(it[1]), cam.project(it[2]), it[3], it[4])
        else:
            r.pixel(cam.project(it[1]), it[2], it[3] * cam.scale, max(1, int(round(it[4] * cam.scale))))
    return r.finish(interior)


def ground(model: Model, lift: float = 0.0) -> Model:
    """Shift a model so its lowest point rests on y = 0 (+ lift for jumps)."""
    dy = -model.min_y() + lift
    return model.transformed(lambda p: (p[0], p[1] + dy, p[2]))


# ---------------------------------------------------------------- sheet palette


def limit_palette(img: Image.Image, limit: int = 15) -> Image.Image:
    """Merge the sheet down to `limit` BGR555 colours (outline protected). Binary alpha kept."""
    data = list(img.getdata())
    counts = {}
    for p in data:
        if p[3]:
            counts[p[:3]] = counts.get(p[:3], 0) + 1
    if len(counts) <= limit:
        return img
    remap = gen3._reduce(counts, limit, keep={OUTLINE})
    out = Image.new("RGBA", img.size)
    out.putdata([(remap[p[:3]] + (255,)) if p[3] else (0, 0, 0, 0) for p in data])
    return out
