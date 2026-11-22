#!/usr/bin/env python3
"""
civickit: engine for Mons CIVIC structures (Pokemon Center, Mart, houses, shops, lab, gate, school,
game corner, contest hall, department store, museum, institutes, towers ...).

Same visual language as the gyms (boxkit 3D blocks, k = 0 Gen 3 front-facing view, #1b1726
silhouette outline, hue-shifted ramps, light from the top-left) and the same Gen 3 output contract
(gen3.py: BGR555, alpha 0/255, <= 15 colours per 8x8 tile, <= 6 palettes, metatile grid, door strip).

Geometry (native px, k = 0): screen = (x, G - h - d). A building body spans x in [B.x0, B.x1),
depth d in [0, B.D) (0 = front wall), walls h in [0, B.wh). Roofs sit on top of the walls.
Canvas = size class (S 6x6, M 8x8, L 10x10, XL 12x12 metatiles); G = canvas - 17, so the base row is
the last pixel row of the second-to-last metatile row (same ground line as gymkit). A spec module
(civic/*.py) exports SPECS: {slug: dict(name, category, size, body=(w_tiles, x_off_tiles),
door=dict(...), exterior(sc, B, t, night), interior=dict(...)|None)}.
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "gen3"))  # tools/gen3: shared Gen 3 pass
import gen3  # noqa: E402
import gymkit as GK
from boxkit import OUTLINE, Scene

T = 16
MAGENTA = (255, 0, 255)
IO = GK.IO
SIZES = {"S": 6, "M": 8, "L": 10, "XL": 12}
DOOR_T = (0, 0.25, 0.75, 1)
EXT_PALETTES = 6

# ---------------------------------------------------------------- shared ramps (gym family, light -> deep)
WHITE = [(250, 250, 255), (226, 230, 244), (196, 202, 226), (152, 158, 196), (108, 114, 160)]
CREAM = [(252, 240, 214), (236, 220, 186), (210, 190, 156), (168, 146, 128), (118, 100, 100)]
BRICK = [(232, 146, 116), (206, 112, 90), (170, 82, 74), (126, 58, 62), (86, 40, 52)]
WOODW = [(232, 186, 126), (204, 150, 96), (166, 112, 74), (122, 78, 60), (84, 52, 48)]
STONEC = [(226, 218, 212), (194, 184, 182), (156, 146, 152), (116, 106, 120), (78, 70, 88)]
SLATE = [(176, 184, 206), (140, 148, 178), (108, 114, 150), (80, 84, 122), (56, 58, 92)]
STEELC = GK.STEEL
GLASS = GK.GLASS
WARM = GK.WARM
ROOF = {   # roof ramps by colour (highlight, light, base, shade, deep)
    "red": [(255, 150, 140), (240, 96, 92), (206, 60, 70), (156, 40, 62), (104, 28, 52)],
    "blue": [(150, 196, 255), (92, 148, 238), (60, 108, 210), (44, 76, 168), (32, 52, 120)],
    "green": [(170, 226, 128), (116, 190, 92), (76, 150, 78), (52, 110, 72), (34, 74, 62)],
    "orange": [(255, 196, 120), (244, 152, 76), (212, 110, 56), (162, 76, 52), (110, 52, 48)],
    "teal": [(140, 226, 214), (82, 190, 186), (52, 148, 160), (38, 106, 128), (30, 72, 96)],
    "purple": [(214, 168, 240), (176, 122, 220), (136, 86, 190), (100, 60, 150), (68, 42, 108)],
    "pink": [(255, 186, 214), (246, 136, 182), (214, 92, 150), (164, 62, 120), (112, 44, 90)],
    "brown": [(214, 160, 116), (180, 120, 84), (142, 88, 66), (104, 62, 56), (70, 42, 46)],
    "slate": SLATE,
    "yellow": [(255, 238, 140), (250, 206, 76), (222, 160, 48), (170, 112, 44), (114, 74, 44)],
    "navy": [(120, 136, 196), (86, 100, 168), (62, 74, 138), (46, 54, 108), (32, 36, 80)],
}


def rgb(c):
    return c[0] if isinstance(c[0], tuple) else c


def E(c):
    return (rgb(c), True)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


# ---------------------------------------------------------------- geometry
class Body:
    """Canvas + body geometry for one structure."""

    def __init__(self, size, w_tiles, x_off=None, depth=None, wall_h=30):
        n = SIZES[size]
        self.size, self.n = size, n
        self.C = n * T
        self.G = self.C - 17
        self.bw = w_tiles * T
        off = (n - w_tiles) // 2 if x_off is None else x_off
        self.x0 = off * T
        self.x1 = self.x0 + self.bw
        self.xm = (self.x0 + self.x1) / 2
        self.D = depth if depth is not None else 22
        self.wh = wall_h

    def tile_x(self, i):
        """Canvas x of metatile column i of the body."""
        return self.x0 + i * T


# ---------------------------------------------------------------- doors
def sliding_door(frame, glass=GLASS, inside=(64, 52, 60), spill=(214, 190, 150), width=32, height=28):
    """Glass sliding door: two leaves narrow sideways (t = open fraction). Returns px(u, h, t, night)."""
    half = width // 2

    def px(u, h, t, night):
        if u < 2 or u >= width - 2 or h >= height - 2:
            return frame[1] if (u < 1 or h == height - 1) else frame[2]
        s = int(round(t * (half - 2)))
        left = 2 <= u < half - s
        right = half + s <= u < width - 2
        if left or right:
            lu = u - 2 if left else u - (half + s)
            if lu in (0, half - 3) or h in (0, 1, height - 3):
                return frame[3]
            if night:
                return WARM[2] if (lu + h) % 9 else WARM[1]
            if (lu + h) % 11 in (0, 1) and h > 6:
                return glass[0]
            return glass[1] if h > height // 2 else glass[2]
        if h < 7:
            w = (7 - h) // 2
            if half - s - w <= u < half + s + w:
                return E(WARM[0]) if night else spill
        return E(inside) if night else inside
    return px


def swing_door(wood, inside=(60, 44, 48), knob=(250, 214, 110), width=16, height=26):
    """Wooden door that swings inward: the leaf narrows to its edge, revealing the dark interior."""

    def px(u, h, t, night):
        if u == 0 or u == width - 1 or h == height - 1:
            return wood[4]
        if h >= height:
            return None
        leaf = int(round((width - 2) * (1 - t)))
        if u - 1 < leaf:
            lu = u - 1
            if lu == leaf - 1 and t > 0:
                return wood[3]
            if h in (6, 7) and lu == leaf - 3 and t < 0.5:
                return knob
            if lu % 5 == 0:
                return wood[2]
            return wood[1] if h > height // 2 else wood[2]
        if h < 5:
            return E(WARM[1]) if night else (196, 168, 132)
        return E(inside) if night else inside
    return px


# ---------------------------------------------------------------- facades
def window_px(x, h, w, night, frame=None):
    """w = (x0, x1, h0, h1, kind); kinds: square, tall, round, arch, shop. None if outside."""
    x0, x1, h0, h1, kind = w
    if not (x0 <= x < x1 and h0 <= h < h1):
        return None
    u, v, W, H = x - x0, h - h0, x1 - x0, h1 - h0
    fr = frame or (WHITE[1], WHITE[3])
    if kind in ("round", "arch"):
        r = W / 2
        cy = H - r if kind == "arch" else H / 2
        if v > cy and (u + 0.5 - W / 2) ** 2 + (v + 0.5 - cy) ** 2 > r * r:
            return "skip"
    if u in (0, W - 1) or v in (0, H - 1):
        return fr[0] if (v == H - 1 or u == 0) else fr[1]
    if kind in ("square", "tall") and (u == W // 2 or (kind == "tall" and v == H // 2)):
        return fr[1]
    if night:
        return WARM[1] if (u + v) % 7 else WARM[0]
    if (u - v) % 7 in (0, 1):
        return GLASS[0]
    return GLASS[1] if v > H // 2 else GLASS[2]


def wall_fn(B, ramp, *, door=None, windows=(), bands=(), pattern="plaster", plinth=STONEC,
            top_h=None, chamfer=True, extra=None, t=0.0, night=False):
    """Front-face colour function for a wall body (use with sculpt over chamfer_inside).
    door = dict(x0, x1, h, px); bands = [(h0, h1, ramp)]; extra(x, d, h, face) -> colour|None."""
    top_h = top_h if top_h is not None else B.wh

    def f(x, d, h, face):
        if extra is not None:
            c = extra(x, d, h, face)
            if c is not None:
                return c
        if face == "top":
            return ramp[1]
        side = 0
        if chamfer and d > 0:
            side = -1 if x < B.xm else 1
        if door and side == 0 and door["x0"] <= x < door["x1"] and h < door["h"]:
            c = door["px"](x - door["x0"], h, t, night)
            if c is not None:
                return c
        if side == 0:
            for w in windows:
                c = window_px(x, h, w, night)
                if c == "skip":
                    break
                if c is not None:
                    return c
        if h < 3:
            return plinth[3] if (x // 6 + h) % 2 else plinth[4]
        for (b0, b1, br) in bands:
            if b0 <= h <= b1:
                if side:
                    return br[1] if side < 0 else br[3]
                return br[0] if h == b1 else br[3] if h == b0 else br[2]
        if h >= top_h - 2:
            return ramp[4]
        if h >= top_h - 4:
            return ramp[3]
        k = 2 + side
        if pattern == "brick":
            course = h // 4
            if h % 4 == 0 or (x + course * 4) % 8 == 0:
                k += 1
        elif pattern == "planks":
            if h % 5 == 0:
                k += 1
        elif pattern == "siding":
            if h % 3 == 0:
                k += 1
        elif pattern == "panel":
            if x % 16 == 0 or h % 12 == 0:
                k += 1
        elif pattern == "stone":
            course = h // 6
            if h % 6 == 0 or (x + course * 5) % 10 == 0:
                k += 1
        return ramp[max(0, min(4, k))]
    return f


def walls(sc, B, f, d0=0, d1=None, h1=None, x0=None, x1=None, c=4):
    x0 = B.x0 if x0 is None else x0
    x1 = B.x1 if x1 is None else x1
    d1 = B.D if d1 is None else d1
    h1 = B.wh if h1 is None else h1
    sc.sculpt(x0, x1, d0, d1, 0, h1, GK.chamfer_inside(x0, x1, d0, d1, 0, h1, c), f)


# ---------------------------------------------------------------- roofs
def gable_roof(sc, x0, x1, d0, d1, h0, rise, R, ov=2, rows=3, ridge=None, edge=True):
    """Ridge parallel to the front; the visible front slope shows shingle rows (Gen 3 house roof)."""
    dm = (d0 + d1) / 2 if ridge is None else ridge
    a, b = d0 - ov, d1

    def height(d):
        if d <= dm:
            return h0 + rise * (d - a + 1) / (dm - a + 1)
        return h0 + rise * (b - d) / (b - dm)

    def inside(x, d, h):
        return x0 - ov <= x < x1 + ov and a <= d < b and h0 <= h < height(d)

    def color(x, d, h, face):
        if face == "front":                        # eave fascia
            return R[3] if h > h0 else R[4]
        if d > dm:
            return R[1]
        row = int((d - a) // rows)
        u = (x + (2 if row % 2 else 0)) % 6
        if (d - a) % rows == rows - 1:
            return R[3]
        if u == 0:
            return R[3]
        k = 2 if x > (x0 + x1) / 2 + 6 else 1 if x > x0 + 6 else 1
        if d >= dm - 1:
            return R[0]
        return R[k]
    sc.sculpt(x0 - ov, x1 + ov, a, b, h0, int(h0 + rise + 1), inside, color, edge=R[4] if edge else None)


def hip_roof(sc, x0, x1, d0, d1, h0, rise, R, ov=2, rows=3):
    """Hipped roof: slopes on all sides; side slopes are lit (left) / shaded (right)."""
    a, b = d0 - ov, d1
    xa, xb = x0 - ov, x1 + ov
    dm = (a + b) / 2
    half_d = (b - a) / 2
    half_x = (xb - xa) / 2
    xm = (xa + xb) / 2

    def height(x, d):
        fd = 1 - abs(d - dm) / half_d
        fx = (half_x - abs(x - xm)) / half_d
        return h0 + rise * max(0.0, min(fd, fx))

    def inside(x, d, h):
        return xa <= x < xb and a <= d < b and h0 <= h < height(x, d)

    def color(x, d, h, face):
        if face == "front":
            return R[3] if h > h0 else R[4]
        fd = 1 - abs(d - dm) / half_d
        fx = (half_x - abs(x - xm)) / half_d
        if fx < fd:                                 # side slope
            return R[0] if x < xm else R[3]
        if abs(fx - fd) < 0.06:
            return R[0]
        row = int((d - a) // rows)
        if (d - a) % rows == rows - 1 or (x + (2 if row % 2 else 0)) % 6 == 0:
            return R[3]
        return R[1] if d < dm else R[0]
    sc.sculpt(xa, xb, a, b, h0, int(h0 + rise + 1), inside, color, edge=R[4])


def flat_roof(sc, x0, x1, d0, d1, h0, R, parapet=3, deck=None, ov=1):
    """Flat roof with a parapet lip; deck(x, d) -> colour for the roof surface."""
    def top(u, v, U, V):
        if u in (0, U - 1) or v in (0, V - 1):
            return R[0]
        if deck:
            return deck(x0 - ov + u, d0 - ov + v)
        return R[2] if (u % 12 == 6 or v % 8 == 4) else R[1]     # flat deck with thin seams
    sc.box(x0 - ov, x1 + ov, d0 - ov, d1, h0, h0 + parapet, top=top,
           front=lambda u, v, U, V: R[0] if v == V - 1 else R[3] if v == 0 else R[2], edge=R[4])


def dome(sc, cx, cd, rx, rd, h0, hh, R, ribs=0, glass=False, emissive=False):
    """Half-ellipsoid dome; ribs = number of vertical ribs (Center roof / observatory)."""
    def inside(x, d, h):
        return h >= h0 and ((x + 0.5 - cx) / rx) ** 2 + ((d - cd) / rd) ** 2 + ((h - h0) / hh) ** 2 < 1

    def color(x, d, h, face):
        nx = (x + 0.5 - cx) / rx
        ny = (h - h0) / hh
        if ribs:
            a = math.atan2(x + 0.5 - cx, (d - cd) * rx / rd + 0.01)
            q = a * ribs / math.pi
            if abs(q - round(q)) < 0.1:
                return R[3]
        if glass:
            if emissive:
                return E(WARM[1]) if (x + h) % 5 else E(WARM[0])
            if (x - h) % 7 in (0, 1) and nx < 0.2:
                return GLASS[0]
        return GK.lit(R, nx, ny + (0.3 if face == "top" else 0))
    sc.sculpt(int(cx - rx - 1), int(cx + rx + 2), int(cd - rd - 1), int(cd + rd + 2), h0, int(h0 + hh + 1),
              inside, color, edge=R[4])


def eave_band(sc, x0, x1, d0, h0, h1, R, emblem=None, cx=None, depth=3, ov=2, emblem_cols=None):
    """Broad coloured band across the wall top (Center/Mart signature); emblem(u, v) -> 0..3."""
    cx = (x0 + x1) / 2 if cx is None else cx
    H = h1 - h0

    def front(u, v, U, V):
        x = x0 - ov + u
        if emblem is not None:
            lv = emblem(x + 0.5 - cx, v)
            if lv:
                cols = emblem_cols or (WHITE[0], WHITE[1], IO)
                return cols[0] if lv == 3 else cols[1] if lv == 2 else cols[2]
        if v == V - 1:
            return R[0]
        if v == 0:
            return R[4]
        return R[1] if v >= V - 2 else R[2]
    sc.box(x0 - ov, x1 + ov, d0 - depth, d0 + 1, h0, h1, top=lambda u, v, U, V: R[0], front=front, edge=R[4])


# ---------------------------------------------------------------- emblems (front-facing reliefs) -> 0 none, 1 rim, 2 mid, 3 core
def pokeball(r=7):
    def f(u, v):
        vv = v - r
        q = u * u + vv * vv
        if q > r * r:
            return 0
        if q > (r - 1.2) ** 2:
            return 1
        if u * u + vv * vv < 4.5:
            return 3 if u * u + vv * vv < 2 else 1
        if abs(vv) < 0.9:
            return 1
        return 2 if vv > 0 else 3
    return f


def bag(r=7):
    """Shopping-bag pictogram (Mart)."""
    def f(u, v):
        if -r + 1 <= u <= r - 1 and 0 <= v <= r * 1.4:
            if u in (-r + 1, r - 1) or v in (0, int(r * 1.4)):
                return 1
            return 2
        if r * 1.4 < v <= r * 1.4 + 3 and abs(abs(u) - 3) < 1.1:
            return 1
        return 0
    return f


def potion_tag(r=7):
    """Round shop tag with a potion-bottle pictogram (Mart): 1 rim, 2 tag, 3 bottle."""
    def f(u, v):
        vv = v - r
        if u * u + vv * vv > r * r:
            return 0
        if u * u + vv * vv > (r - 1.2) ** 2:
            return 1
        if abs(u) <= 2.6 and -4 <= vv <= 1:            # bottle body
            return 3
        if abs(u) <= 1.1 and 1 < vv <= 3.5:            # neck
            return 3
        if abs(u) <= 1.8 and 3.5 < vv <= 4.6:          # cap
            return 1
        return 2
    return f


def heart(r=6):
    """Upright heart: (x^2 + y^2 - 1)^3 - x^2 y^3 <= 0 with y pointing up."""
    def inside(u, v):
        x, y = u / (r * 0.85), (v - r * 0.95) / (r * 0.85)
        return (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0

    def f(u, v):
        if not inside(u, v):
            return 0
        if not all(inside(u + du, v + dv) for du, dv in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            return 1
        return 3 if (u < -1 and v > r * 1.2) else 2
    return f


def star(r=7):
    def f(u, v):
        x, y = u, v - r
        a = math.atan2(y, x)
        rr = math.hypot(x, y)
        lim = r * (0.55 + 0.45 * abs(math.cos(2.5 * a + math.pi / 2)))
        if rr > lim:
            return 0
        return 1 if rr > lim - 1.3 else 3 if rr < 2 else 2
    return f


def ring_emblem(r=7, inner=None):
    """Round badge: rim + face; inner(u, v) -> 0..3 drawn on the face."""
    def f(u, v):
        vv = v - r
        q = u * u + vv * vv
        if q > r * r:
            return 0
        if q > (r - 1.3) ** 2:
            return 1
        if inner:
            lv = inner(u, vv)
            if lv:
                return lv
        return 2
    return f


def relief(sc, emb, cx, h0, cols, d0=-5, d1=-2, w=10, h=16):
    """Front-facing emblem plate: emb(u, v) -> 0..3 with cols = {1: rim, 2: face, 3: core}."""
    def inside(x, d, hh):
        return d0 <= d < d1 and emb(x + 0.5 - cx, hh - h0) > 0

    def color(x, d, hh, face):
        lv = emb(x + 0.5 - cx, hh - h0)
        return cols[2] if face == "top" else cols[lv]
    sc.sculpt(int(cx - w), int(cx + w + 1), d0, d1, h0, h0 + h, inside, color, shadow=False)


def glyph_sign(sc, x0, x1, d, h0, h1, board, ink=IO, seed=0):
    """Blank sign board with abstract glyph blocks (never letters)."""
    def front(u, v, U, V):
        if u in (0, U - 1) or v in (0, V - 1):
            return board[3]
        if 2 <= v <= V - 3:
            k = (u - 2) // 4
            if (u - 2) % 4 < 3 and 1 < u < U - 2 and GK.nz(k, v // 3, seed) > 70:
                return ink
        return board[1]
    sc.box(x0, x1, d - 1, d, h0, h1, front=front, top=lambda *a: board[0], edge=board[4])


# ---------------------------------------------------------------- props
def chimney(sc, x, d, h0, h1, R=BRICK):
    sc.box(x, x + 6, d, d + 4, h0, h1, top=lambda u, v, U, V: IO if 1 <= u <= 4 and 1 <= v <= 2 else R[0],
           front=lambda u, v, U, V: R[1] if v % 3 else R[3], edge=R[4])


def awning(sc, x0, x1, h, cols, d0=-5, stripe=4):
    def top(u, v, U, V):
        return cols[(u // stripe) % 2] if v < V - 1 else cols[2]

    def front(u, v, U, V):
        if v == 0:
            return cols[3]
        return cols[(u // stripe) % 2]
    sc.box(x0, x1, d0, 0, h, h + 2, top=top, front=front, edge=cols[3])
    for x in range(x0, x1, stripe * 2):               # scalloped valance
        sc.box(x, min(x + stripe, x1), d0, d0 + 1, h - 2, h, front=lambda u, v, U, V: cols[0])


def planter(sc, x0, x1, d0, h=5, flowers=((236, 92, 98), (252, 220, 96), (250, 250, 255))):
    sc.box(x0, x1, d0, d0 + 4, 0, h, top=lambda u, v, U, V: (116, 186, 96) if (u + v) % 3 else
           flowers[(u // 2) % len(flowers)],
           front=lambda u, v, U, V: WOODW[1] if v == h - 1 else WOODW[2] if v else WOODW[3], edge=WOODW[4])


def lamp_post(sc, x, d, h=22):
    sc.box(x, x + 2, d, d + 2, 0, h, front=lambda u, v, U, V: STEELC[2] if u else STEELC[1], edge=IO)
    sc.box(x - 2, x + 4, d - 1, d + 3, h, h + 5, top=STEELC[1],
           front=lambda u, v, U, V: E(WARM[0]) if 1 <= v <= 3 and 1 <= u <= 4 else STEELC[2], edge=IO)


def flag(sc, x, d, h0, h1, cols):
    sc.box(x, x + 1, d, d + 1, h0, h1, front=lambda *a: STEELC[1], edge=None)
    sc.box(x + 1, x + 10, d, d + 1, h1 - 7, h1 - 1,
           front=lambda u, v, U, V: cols[0] if (u + v // 2) % 4 < 2 else cols[1], edge=cols[2])


def solar(sc, x0, x1, d0, d1, h):
    sc.box(x0, x1, d0, d1, h, h + 2, top=lambda u, v, U, V: (60, 88, 160) if (u % 5 and v % 4) else (150, 170, 210),
           front=lambda *a: STEELC[2], edge=IO)


def dish(sc, cx, cd, h, r=5):
    sc.box(int(cx) - 1, int(cx) + 1, int(cd), int(cd) + 2, h, h + 5, front=lambda *a: STEELC[2], edge=None)
    GK.sphere_sculpt(sc, [(cx, cd, h + 8, r)], lambda x, d, hh, f, b, nx, ny: STEELC[0] if nx < 0 else STEELC[2],
                     shadow=False, rd=0.4)


def bulbs(sc, x0, x1, d, h, cols=((255, 236, 120), (255, 120, 140)), step=4):
    for i, x in enumerate(range(x0, x1, step)):
        c = cols[i % len(cols)]
        sc.box(x, x + 2, d - 1, d, h, h + 2, front=lambda u, v, U, V, c=c: E(c), edge=None)


# ---------------------------------------------------------------- render (exterior)
def build(spec, t=0.0, night=False):
    B = spec["_B"]
    sc = Scene(B.C, B.C, 0, B.G, k=0)
    spec["exterior"](sc, B, t, night)
    sc.outline()
    if night:
        sc.night()
    return sc


def gen3_frames(spec, night):
    B = spec["_B"]
    scenes = [build(spec, t, night) for t in DOOR_T]
    strip = Image.new("RGBA", (B.C * len(scenes), B.C), (0, 0, 0, 0))
    for i, sc in enumerate(scenes):
        strip.paste(sc.img, (i * B.C, 0))
    strip = gen3.to_gen3(strip, max_palettes=spec.get("palettes", EXT_PALETTES), keep=(IO, OUTLINE),
                         regions=[(i * B.C, 0, (i + 1) * B.C, B.C) for i in range(len(scenes))])
    frames = [strip.crop((i * B.C, 0, (i + 1) * B.C, B.C)) for i in range(len(scenes))]
    return scenes[0], frames


def door_strip(frames, slug):
    """Region that changes while the door opens, snapped OUT to whole metatiles; must be <= 2x2 tiles
    (pret field_door.c door sizes) and sit on the ground rows."""
    C = frames[0].width
    p = [f.load() for f in frames]
    xs, ys = [], []
    for y in range(C):
        for x in range(C):
            if any(q[x, y] != p[0][x, y] for q in p[1:]):
                xs.append(x)
                ys.append(y)
    if not xs:
        raise SystemExit(f"{slug}: door does not animate")
    x0, x1 = min(xs) // T * T, -(-(max(xs) + 1) // T) * T
    y0, y1 = min(ys) // T * T, -(-(max(ys) + 1) // T) * T
    if x1 - x0 > 2 * T or y1 - y0 > 2 * T:
        raise SystemExit(f"{slug}: door strip {x1 - x0}x{y1 - y0} px is bigger than 2x2 metatiles "
                         f"(x {min(xs)}..{max(xs)}, y {min(ys)}..{max(ys)}): keep the door on the d = 0 face")
    return x0, y0, x1 - x0, y1 - y0


def contact_layer(sc, G):
    lay = Image.new("RGBA", sc.img.size, (0, 0, 0, 0))
    lp, px = lay.load(), sc.px
    c = gen3.snap(GK.CONTACT) + (255,)
    for x in range(sc.w):
        for y in range(G - 6, min(sc.h - 1, G + 14)):
            if px[x, y][3] and not px[x, y + 1][3]:
                lp[x, y + 1] = c
    return lay


def up(im):
    return im.resize((im.width * 2, im.height * 2), Image.NEAREST)


def on_magenta(im):
    out = Image.new("RGB", im.size, MAGENTA)
    out.paste(im, (0, 0), im)
    return out


def render(slug, spec, root, night=False):
    """Writes assets/structures/<Category>/<slug>/<slug>-{structure,ground,door,preview}.png, -door.json,
    -door.gif and (if the spec has one) the interior: -interior-<floor>.png + -interior.json."""
    B = spec["_B"]
    out = os.path.join(root, spec["category"], slug)
    os.makedirs(out, exist_ok=True)
    pre = os.path.join(out, slug)
    modes = [False, True] if night else [False]
    built = [gen3_frames(spec, n) for n in modes]
    S = B.C * 2
    sheet = Image.new("RGB", (S * len(modes), S), MAGENTA)
    ground = Image.new("RGBA", (S * len(modes), S), (0, 0, 0, 0))
    dx, dy, dw, dh = door_strip(built[0][1], slug)
    door = Image.new("RGB", (dw * 2 * len(DOOR_T), dh * 2 * len(modes)), MAGENTA)
    for r, (sc, frames) in enumerate(built):
        sheet.paste(up(on_magenta(frames[0])), (r * S, 0))
        ground.paste(up(contact_layer(sc, B.G)), (r * S, 0))
        for i, f in enumerate(frames):
            door.paste(up(on_magenta(f.crop((dx, dy, dx + dw, dy + dh)))), (i * dw * 2, r * dh * 2))
    sheet.save(pre + "-structure.png")
    ground.save(pre + "-ground.png")
    door.save(pre + "-door.png")
    with open(pre + "-door.json", "w") as fh:
        json.dump({"scale": 2, "x": dx * 2, "y": dy * 2, "w": dw * 2, "h": dh * 2,
                   "frames": ["closed", "open1", "open2", "open3"], "rows": ["day", "night"][:len(modes)],
                   "ticks_per_frame": 4, "frame_ms": 83, "open": [0, 1, 2, 3], "close": [3, 2, 1, 0],
                   "kind": spec.get("door_kind", "sliding"),
                   "note": "pret field_door.c: draw the strip over the structure at (x, y)"}, fh, indent=1)
    gif = [up(on_magenta(f)) for f in built[0][1]]
    seq = gif + gif[::-1]
    seq[0].save(pre + "-door.gif", save_all=True, append_images=seq[1:],
                duration=[600] + [83] * 3 + [600] + [83] * 3, loop=0)
    # preview on lawn with the metatile grid
    PW = S * len(modes)
    prev = Image.new("RGBA", (PW, S), (0, 0, 0, 255))
    pp = prev.load()
    for y in range(S):
        for x in range(PW):
            g = (132, 198, 104) if GK.nz(x // 8, y // 8, 11) > 60 else (120, 188, 98)
            if x % (T * 2) == 0 or y % (T * 2) == 0:
                g = (108, 174, 92)
            pp[x, y] = g + (255,)
    prev = Image.alpha_composite(prev, ground)
    for i, (_, frames) in enumerate(built):
        lay = Image.new("RGBA", prev.size, (0, 0, 0, 0))
        lay.paste(up(frames[0]), (i * S, 0))
        prev = Image.alpha_composite(prev, lay)
    prev.convert("RGB").save(pre + "-preview.png")
    if spec.get("interior"):
        render_interior(slug, spec, pre)
    return pre


# ---------------------------------------------------------------- interiors (overhead map camera)
CIVIC_LEGEND = {"O": "outside ground", "#": "rim wall", ".": "floor", "M": "exit mat", "U": "stairs up",
                "D": "stairs down", "C": "counter (blocked)", "n": "staff spot behind a counter",
                "h": "healing machine (blocked)", "p": "PC terminal (blocked)", "Y": "shelf (blocked)",
                "t": "table (blocked)", "s": "stool / sofa", "b": "bed (blocked)", "v": "TV (blocked)",
                "k": "bookshelf (blocked)", "g": "plant (blocked)", "r": "carpet runner", "c": "chair",
                "x": "display case (blocked)", "m": "machine / slot (blocked)", "e": "elevator door",
                "w": "window on the north rim (blocked)", "G": "statue (blocked)", "P": "pillar (blocked)",
                "d": "desk (blocked)", "f": "fossil / exhibit (blocked)", "z": "big screen (blocked)"}
WALKABLE = set(".MUDnsrce")


def _base_floor(ctx, c, r):
    GK.t_floor(ctx, c, r)


def _sprite(ctx, c, r, draw, floor=True):
    if floor:
        _base_floor(ctx, c, r)
    draw(ctx.d, c * T, r * T)


def furniture_tiles(th):
    A, TR = th["accent"], th["trim"]
    dark = IO

    def counter(ctx, c, r):
        _base_floor(ctx, c, r)
        X, Y = c * T, r * T
        left, right = ctx.g(c - 1, r) != "C", ctx.g(c + 1, r) != "C"
        ctx.d.rectangle([X, Y + 2, X + T - 1, Y + 9], fill=CREAM[0])
        ctx.d.rectangle([X, Y + 10, X + T - 1, Y + 14], fill=A[2])
        ctx.d.line([X, Y + 10, X + T - 1, Y + 10], fill=A[1])
        ctx.d.line([X, Y + 2, X + T - 1, Y + 2], fill=dark)
        ctx.d.line([X, Y + 14, X + T - 1, Y + 14], fill=dark)
        if left:
            ctx.d.line([X, Y + 2, X, Y + 14], fill=dark)
        if right:
            ctx.d.line([X + T - 1, Y + 2, X + T - 1, Y + 14], fill=dark)

    def staff(ctx, c, r):
        _base_floor(ctx, c, r)

    def heal(ctx, c, r):
        def dr(d, X, Y):
            d.rectangle([X + 1, Y + 2, X + 14, Y + 13], fill=WHITE[1], outline=dark)
            d.rectangle([X + 1, Y + 10, X + 14, Y + 13], fill=WHITE[3], outline=dark)
            for i in range(3):
                for j in range(2):
                    d.ellipse([X + 3 + i * 4, Y + 3 + j * 3, X + 5 + i * 4, Y + 5 + j * 3], fill=(236, 80, 88), outline=dark)
        _sprite(ctx, c, r, dr)

    def pc(ctx, c, r):
        def dr(d, X, Y):
            d.rectangle([X + 2, Y + 1, X + 13, Y + 13], fill=STEELC[1], outline=dark)
            d.rectangle([X + 4, Y + 3, X + 11, Y + 8], fill=(90, 200, 220), outline=dark)
            d.rectangle([X + 2, Y + 10, X + 13, Y + 13], fill=STEELC[3], outline=dark)
        _sprite(ctx, c, r, dr)

    def shelf(ctx, c, r):
        def dr(d, X, Y):
            d.rectangle([X, Y + 1, X + 15, Y + 14], fill=WOODW[2], outline=dark)
            for i, yy in enumerate((3, 8)):
                for k in range(4):
                    col = [(236, 92, 98), (96, 160, 236), (252, 220, 96), (120, 200, 120)][(k + i + c) % 4]
                    d.rectangle([X + 1 + k * 4, Y + yy, X + 3 + k * 4, Y + yy + 3], fill=col)
            d.line([X, Y + 13, X + 15, Y + 13], fill=WOODW[4])
        _sprite(ctx, c, r, dr)

    def table(ctx, c, r):
        def dr(d, X, Y):
            d.rectangle([X + 1, Y + 3, X + 14, Y + 11], fill=WOODW[1], outline=dark)
            d.rectangle([X + 1, Y + 9, X + 14, Y + 12], fill=WOODW[3], outline=dark)
        _sprite(ctx, c, r, dr)

    def stool(ctx, c, r):
        def dr(d, X, Y):
            d.ellipse([X + 3, Y + 4, X + 12, Y + 12], fill=A[1], outline=dark)
            d.ellipse([X + 5, Y + 5, X + 9, Y + 8], fill=A[0])
        _sprite(ctx, c, r, dr)

    def bed(ctx, c, r):
        def dr(d, X, Y):
            d.rectangle([X + 1, Y, X + 14, Y + 15], fill=WHITE[0], outline=dark)
            d.rectangle([X + 2, Y + 1, X + 13, Y + 4], fill=WHITE[2])
            d.rectangle([X + 1, Y + 6, X + 14, Y + 15], fill=A[1], outline=dark)
        _sprite(ctx, c, r, dr)

    def tv(ctx, c, r):
        def dr(d, X, Y):
            d.rectangle([X + 1, Y + 2, X + 14, Y + 12], fill=(48, 44, 60), outline=dark)
            d.rectangle([X + 3, Y + 4, X + 12, Y + 9], fill=(110, 190, 240))
            d.line([X + 4, Y + 5, X + 7, Y + 5], fill=(220, 244, 255))
        _sprite(ctx, c, r, dr)

    def books(ctx, c, r):
        def dr(d, X, Y):
            d.rectangle([X, Y, X + 15, Y + 15], fill=WOODW[2], outline=dark)
            for row, yy in enumerate((2, 7, 11)):
                for k in range(7):
                    col = [(196, 72, 80), (72, 120, 196), (92, 168, 96), (236, 196, 92)][(k + row) % 4]
                    d.line([X + 1 + k * 2, Y + yy, X + 1 + k * 2, Y + yy + 3], fill=col)
        _sprite(ctx, c, r, dr)

    def plant(ctx, c, r):
        def dr(d, X, Y):
            d.rectangle([X + 5, Y + 10, X + 10, Y + 14], fill=BRICK[1], outline=dark)
            for (dx, dy, rr) in ((8, 6, 5), (4, 8, 3), (11, 8, 3)):
                d.ellipse([X + dx - rr, Y + dy - rr, X + dx + rr, Y + dy + rr], fill=(96, 176, 88), outline=dark)
            d.point([X + 6, Y + 4], fill=(170, 226, 128))
        _sprite(ctx, c, r, dr)

    def runner(ctx, c, r):
        _base_floor(ctx, c, r)
        X, Y = c * T, r * T
        l, rr = ctx.g(c - 1, r) != "r", ctx.g(c + 1, r) != "r"
        x0 = X + (2 if l else 0)
        x1 = X + (13 if rr else 15)
        ctx.d.rectangle([x0, Y, x1, Y + 15], fill=A[2])
        if l:
            ctx.d.line([x0, Y, x0, Y + 15], fill=A[1])
        if rr:
            ctx.d.line([x1, Y, x1, Y + 15], fill=A[3])

    def chair(ctx, c, r):
        def dr(d, X, Y):
            d.rectangle([X + 4, Y + 4, X + 11, Y + 12], fill=WOODW[1], outline=dark)
            d.rectangle([X + 4, Y + 2, X + 11, Y + 5], fill=WOODW[2], outline=dark)
        _sprite(ctx, c, r, dr)

    def case(ctx, c, r):
        def dr(d, X, Y):
            d.rectangle([X + 1, Y + 2, X + 14, Y + 13], fill=STEELC[2], outline=dark)
            d.rectangle([X + 2, Y + 3, X + 13, Y + 9], fill=GLASS[1])
            d.line([X + 3, Y + 4, X + 6, Y + 4], fill=GLASS[0])
            d.ellipse([X + 6, Y + 5, X + 9, Y + 8], fill=(252, 220, 96))
        _sprite(ctx, c, r, dr)

    def machine(ctx, c, r):
        def dr(d, X, Y):
            d.rectangle([X + 2, Y + 1, X + 13, Y + 14], fill=A[1], outline=dark)
            d.rectangle([X + 4, Y + 3, X + 11, Y + 7], fill=(40, 36, 52), outline=dark)
            for k in range(3):
                d.rectangle([X + 4 + k * 3, Y + 4, X + 5 + k * 3, Y + 6], fill=[(255, 120, 140), (255, 236, 120), (120, 220, 255)][k])
            d.rectangle([X + 5, Y + 10, X + 10, Y + 12], fill=TR[1], outline=dark)
        _sprite(ctx, c, r, dr)

    def lift(ctx, c, r):
        def dr(d, X, Y):
            d.rectangle([X + 1, Y, X + 14, Y + 14], fill=STEELC[1], outline=dark)
            d.line([X + 8, Y + 1, X + 8, Y + 13], fill=STEELC[3])
        _sprite(ctx, c, r, dr)

    def window(ctx, c, r):
        GK.t_rim(ctx, c, r)
        X, Y = c * T, r * T
        ctx.d.rectangle([X + 2, Y + 3, X + 13, Y + 10], fill=GLASS[1], outline=dark)
        ctx.d.line([X + 3, Y + 4, X + 7, Y + 4], fill=GLASS[0])

    def statue(ctx, c, r):
        def dr(d, X, Y):
            d.rectangle([X + 3, Y + 10, X + 12, Y + 14], fill=STONEC[2], outline=dark)
            d.ellipse([X + 4, Y + 1, X + 11, Y + 10], fill=STONEC[0], outline=dark)
        _sprite(ctx, c, r, dr)

    def desk(ctx, c, r):
        def dr(d, X, Y):
            d.rectangle([X, Y + 3, X + 15, Y + 12], fill=WOODW[1], outline=dark)
            d.rectangle([X + 3, Y + 4, X + 7, Y + 7], fill=WHITE[1], outline=dark)
            d.rectangle([X + 9, Y + 4, X + 13, Y + 8], fill=STEELC[2], outline=dark)
        _sprite(ctx, c, r, dr)

    def fossil(ctx, c, r):
        def dr(d, X, Y):
            d.rectangle([X + 1, Y + 1, X + 14, Y + 14], fill=STONEC[1], outline=dark)
            d.ellipse([X + 4, Y + 4, X + 11, Y + 11], fill=CREAM[1], outline=STONEC[4])
            d.arc([X + 5, Y + 5, X + 10, Y + 10], 0, 300, fill=STONEC[4])
        _sprite(ctx, c, r, dr)

    def screen(ctx, c, r):
        GK.t_rim(ctx, c, r)
        X, Y = c * T, r * T
        ctx.d.rectangle([X + 1, Y + 2, X + 14, Y + 12], fill=(40, 36, 52), outline=dark)
        ctx.d.rectangle([X + 3, Y + 4, X + 12, Y + 10], fill=(120, 200, 240))

    return {"C": counter, "n": staff, "h": heal, "p": pc, "Y": shelf, "t": table, "s": stool, "b": bed,
            "v": tv, "k": books, "g": plant, "r": runner, "c": chair, "x": case, "m": machine, "e": lift,
            "w": window, "G": statue, "d": desk, "f": fossil, "z": screen}


def interior_theme(floor, accent, rim=None, floor_px=None, trim=None):
    th = dict(floor=floor, accent=accent, rim=rim or accent, trim=trim or WOODW, outside=GK.STONE + [GK.STONE[-1]],
              glow=[accent[0]] * 5, leader=("-", 0, 0, "down"), dais_emblem=False, stair_ramp=STONEC,
              hazard_ramp=floor, hazard_px=lambda gx, gy: floor[2], ledge=STONEC + [STONEC[-1]],
              emblem="drop")
    if floor_px:
        th["floor_px"] = floor_px
    th["tiles"] = furniture_tiles(th)
    return th


def tiled_floor(F, size=8, motif=None):
    """Cream-tile floor (Gen 3 Center style): size-px tiles with a light grout grid; motif(gx, gy)->RGB|None."""
    def f(gx, gy):
        if motif:
            c = motif(gx, gy)
            if c is not None:
                return c
        x, y = gx % size, gy % size
        if x == 0 or y == 0:
            return F[2]
        if (x, y) == (1, 1):
            return F[0]
        return F[1]
    return f


def wood_floor(F):
    def f(gx, gy):
        y = gy % 4
        x = (gx + (gy // 4) * 7) % 16
        if y == 0:
            return F[3]
        if x == 0:
            return F[2]
        return F[1] if (gx // 16 + gy // 4) % 3 else F[0]
    return f


def render_interior(slug, spec, pre):
    it = spec["interior"]
    th = it["theme"]
    out = {"type": slug, "tile": T, "scale": 2, "floors": [], "legend": dict(CIVIC_LEGEND, **it.get("legend", {})),
           "walkable": sorted(WALKABLE | set(it.get("walk_extra", "")))}
    for f in it["floors"]:
        th.setdefault("decor", None)
        base = GK.render_floor(th, f)
        base = gen3.to_gen3(base, max_palettes=GK.INT_PALETTES).convert("RGB")
        name = f["name"]
        up(base).save(f"{pre}-interior-{name}.png")
        out["floors"].append({"name": name, "image": os.path.basename(pre) + f"-interior-{name}.png",
                              "width": len(f["grid"][0]), "height": len(f["grid"]), "grid": f["grid"],
                              "npcs": f.get("npcs", [])})
    with open(pre + "-interior.json", "w") as fh:
        json.dump(out, fh, indent=1)
