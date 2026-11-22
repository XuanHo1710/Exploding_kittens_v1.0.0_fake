#!/usr/bin/env python3
"""
gymkit: shared ENGINE for Mons gyms (no shared look). Every gym type lives in its own module
gyms/<type>.py exporting THEME (a dict) and designs everything itself: body
architecture, crown, props, emblem, sparks, interior floors, tiles, decor and mechanics.

The kit only provides plumbing + optional building blocks:
  exterior : Scene setup, door animation pixels, windows, facade patterns, columns, spheres,
             boulders, eave/deck colours, emblem plate, lamp tops, build/flatten/ground layer.
  interior : multi-floor ASCII maps rendered tile by tile on the overhead map camera
             (research.md section 9), stairs up/down between floors, warp pads, one-way holes,
             switch + gates, trainers with sight lines, BFS checks (leader reachable, every
             trainer unavoidable), JSON + designer route overlays.

THEME keys (required unless marked optional):
  name, archetype, wall/accent/trim/rock/deck (5-tone ramps), glow (emissive 5-ramp)
  exterior(sc, th, t, night)          draws the whole building (walls, crown, props, hood, door)
  sparks(sc, th, night)               optional post-outline accents
  night_lights                        optional list of screen-x (half scale) for warm ground pools
  door_spill / door_inside            RGB used by door_px for the revealed interior
  emblem                              str kind (see emblem_level) or callable(u, v) -> 0..3
  floors: [ {name, grid:[str], trainers:[(x, y, facing, sight)]} ]   first floor = entrance floor
  links:  [ {type: 'stairs'|'warp'|'hole', a: (floor, x, y), b: (floor, x, y)} ]  stairs/warp two-way
  leader: (floor, x, y, facing)
  floor_px(gx, gy) -> RGB, hazard_px(gx, gy) -> RGB, hazard_ramp (5), ledge (5), outside (5)
  tiles: {char: fn(ctx, c, r)}        optional per-char overrides / new tile chars
  decor(ctx)                          optional pass after tiles (props, statues, lamps ...)
  walk_extra                          optional string of extra walkable chars
  legend_extra                        optional {char: description}
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "gen3"))  # tools/gen3: shared Gen 3 pass
import gen3  # noqa: E402
from boxkit import OUTLINE, Scene

MAGENTA = (255, 0, 255)
# Gen 3 grid (pret-measured: Emerald gyms are 6x5 metatiles, Pokemon Center 4x4). Everything below is
# on the 16 px metatile grid so the exterior slices into metatiles and the door into a 2x2-metatile strip.
T = 16
CELL = 8 * T        # native canvas: 8x8 metatiles (final x2 = 256)
G = 7 * T - 1       # ground line: h = 0 on the d = 0 face lands on y = G, the LAST row of metatile row 6,
                    # so a d = 0 door (h 0..27) fills the 2x2-metatile strip; the bottom row holds front props
BW = 6 * T          # building body width: 6 metatiles, like the Emerald gyms
X0 = (CELL - BW) // 2
MAX_H = G           # nothing may rise above the canvas top: body 5 rows + crown allowance 2 rows
C = 6               # default chamfer
DECK = 34           # default roof deck top height
CX, CD = 48, 16     # default crown centre
DOOR_X0, DOOR_X1, DOOR_H = 2 * T, 4 * T, 28   # 2-tile sliding door; its animated strip is 2x2 metatiles
DOOR_STRIP = (X0 + DOOR_X0, G + 1 - 2 * T, 2 * T, 2 * T)   # x, y, w, h in native canvas px (rows 80..111)
EXT_PALETTES = 6    # Rustboro Gym uses 6 BG palettes, Petalburg Gym 4 (pret map data)
INT_PALETTES = 13   # a whole interior map = one tileset pair
CONTACT = (131, 131, 139)   # Gen 3 1 px ground contact line (research.md section 1)

GLASS = [(200, 230, 255), (128, 180, 238), (88, 140, 214), (60, 100, 176), (44, 70, 130)]
WARM = [((255, 238, 170), True), ((255, 206, 110), True), ((244, 160, 80), True)]
FRAME = [(196, 190, 204), (150, 144, 164), (110, 104, 128)]
IO = (44, 28, 44)
STONE = [(222, 212, 206), (186, 174, 174), (146, 134, 142), (106, 96, 112)]
WOOD = [(222, 170, 112), (186, 130, 82), (146, 96, 64), (100, 64, 52)]
STEEL = [(210, 218, 230), (170, 180, 198), (130, 140, 162), (92, 100, 124), (60, 66, 88)]
DIRS = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}


# ================================================================ small utils
def R5(*c):
    return list(c)


def E(ramp):
    """Mark a ramp emissive (kept bright at night)."""
    return [(c, True) for c in ramp]


def rgb(c):
    return c[0] if isinstance(c[0], tuple) else c


def nz(x, y, s=0):
    n = (int(x) * 374761393 + int(y) * 668265263 + s * 2147483647) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return (n ^ (n >> 16)) & 255


def cl(x, y, s=0):
    return nz(int(x) // 2, int(y) // 2, s)


def ell(x, d, cx, cd, r, rd=0.5):
    return ((x - cx) / r) ** 2 + ((d - cd) / (r * rd)) ** 2


def shade(ramp, x, cx, face, n=128, spread=6):
    dx = x - cx
    if face == "top":
        k = 0 if dx < -spread else 1 if dx <= spread else 2
    else:
        k = 1 if dx < -spread else 2 if dx <= spread else 3
    if n > 225:
        k = min(len(ramp) - 1, k + 1)
    elif n < 20:
        k = max(0, k - 1)
    return ramp[k]


def lit(ramp, nx, ny):
    """Band a ramp by a surface normal (light from the top-left)."""
    l = -(nx * 0.6) + ny * 0.8
    k = 0 if l > 0.55 else 1 if l > 0.1 else 2 if l > -0.4 else 3
    return ramp[min(k, len(ramp) - 1)]


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def in_poly(px, py, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi:
            inside = not inside
        j = i
    return inside


# ================================================================ emblems
BOLT = [(3, 19.5), (-7, 8), (-1, 8), (-5, -0.5), (8, 11.5), (1.5, 11.5), (6.5, 19.5)]


def emblem_level(kind, u, v):
    """0 = empty, 1 = rim, 2 = mid, 3 = core. u in -16..16 (0 = centre), v in 0..19 (0 = bottom).
    kind: str (flame drop gem leaf bolt eye bubbles mesa) or a callable(u, v)."""
    if callable(kind):
        return kind(u, v)
    q = v / 19
    au = abs(u)
    if v < 0 or v > 19:
        return 0
    if kind == "flame":
        core = 9 * (1 - q) ** 0.7
        tongues = 4 * max(0, math.sin(u * 0.55 + 1.2)) * q
        if au >= core + tongues * (1 - q) * 2:
            return 0
        return 3 if au < 3 and q < 0.55 else 2 if au < 5.5 * (1 - q) and q < 0.75 else 1
    if kind == "drop":
        inn = u * u + (v - 7) ** 2 < 56 if v <= 7 else au < 7.5 * (1 - (v - 7) / 12.5)
        if not inn:
            return 0
        if (u + 2) ** 2 + (v - 8) ** 2 < 7:
            return 3
        return 2 if u * u + (v - 7) ** 2 < 26 or (v > 7 and au < 5 * (1 - (v - 7) / 12)) else 1
    if kind == "gem":
        e = au / 10 + abs(v - 9.5) / 10
        if e >= 1:
            return 0
        return 3 if e < 0.42 else 2 if u < 0 or v > 13 else 1
    if kind == "leaf":
        ca, sa = math.cos(0.75), math.sin(0.75)
        x = u * ca - (v - 9.5) * sa
        y = u * sa + (v - 9.5) * ca
        if (x / 11.5) ** 2 + (y / 5.6) ** 2 >= 1:
            return 3 if (abs(u - 6) < 1 and v < 4) else 0
        return 3 if abs(y) < 0.8 else 2 if y > 0 else 1
    if kind == "bolt":
        if not in_poly(u, v, BOLT):
            return 0
        edge = any(not in_poly(u + du, v + dv, BOLT) for du, dv in ((1.6, 0), (-1.6, 0), (0, 1.6), (0, -1.6)))
        return 1 if edge else 3 if u < 1 else 2
    if kind == "eye":
        if au >= 13 or abs(v - 9.5) >= 6.8 * (1 - (u / 13) ** 2):
            return 0
        rr = u * u + (v - 9.5) ** 2
        return 3 if rr < 6 else 2 if rr < 22 else 1
    if kind == "bubbles":
        for bx, by, br in ((0, 7, 7), (-7.5, 14.5, 4), (6.5, 15.5, 3.4)):
            dd = (u - bx) ** 2 + (v - by) ** 2
            if dd < br * br:
                if (u - bx + br * 0.35) ** 2 + (v - by - br * 0.3) ** 2 < (br * 0.32) ** 2:
                    return 3
                return 1 if dd > (br - 1.6) ** 2 else 2
        return 0
    if kind == "mesa":
        w = 13 if v < 5 else 10 if v < 10 else 7 if v < 14 else 4 if v < 17 else 0
        if au >= w:
            return 0
        return 3 if v % 5 == 4 else 2 if u < 0 else 1
    return 0


# ================================================================ exterior building blocks
def door_px(th, u, h, t, night):
    """Pixels of the 2-tile sliding glass door (u in 0..31, h in 0..27), t = open fraction."""
    tr, wl, gl = th["trim"], th["wall"], th["glow"]
    if u < 2 or u >= 30 or h >= 26:
        return tr[1] if (u < 1 or h == 27) else tr[2]
    s = int(round(t * 14))
    left = 2 <= u < 16 - s
    right = 16 + s <= u < 30
    if left or right:
        lu = u - 2 if left else u - (16 + s)
        if lu in (0, 13) or h in (0, 1, 25):
            return wl[4]
        if night:
            return WARM[2] if (lu + h) % 9 else WARM[1]
        if (lu + h) % 11 in (0, 1) and h > 6:
            return GLASS[0]
        return GLASS[2] if h > 12 else GLASS[3]
    if h < 7:
        w = (7 - h) // 2
        if 16 - s - w <= u < 16 + s + w:
            return gl[3] if night else th.get("door_spill", (196, 160, 120))
    ins = th.get("door_inside", (50, 40, 50))
    return (ins, True) if night else ins


def win_mask(kind, u, v, W, H):
    if kind in ("round", "round_wood"):
        cx, cy, r = (W - 1) / 2, H / 2, W / 2
        return (u - cx) ** 2 + (v - cy) ** 2 < r * r
    if kind in ("arch", "stained"):
        r = W / 2
        if v <= H - r:
            return 0 <= u < W and v >= 0
        return (u - (W - 1) / 2) ** 2 + (v - (H - r)) ** 2 < r * r
    return 0 <= u < W and 0 <= v <= H


def win_color(th, w, x, h, night):
    """w = (kind, x0, x1, h0, h1); kinds: square wood arch stained round round_wood slit strip."""
    kind, x0, x1, h0, h1 = w
    if not (x0 - 1 <= x <= x1 and h0 - 1 <= h <= h1 + 1):
        return None
    u, v, W, H = x - x0, h - h0, x1 - x0, h1 - h0
    if not win_mask(kind, u, v, W, H):
        return None
    wood = kind in ("wood", "round_wood")
    fr = (th["trim"][1], th["trim"][3]) if wood else (FRAME[0], FRAME[1])
    edge = any(not win_mask(kind, u + du, v + dv, W, H) for du, dv in ((1, 0), (-1, 0), (0, 1), (0, -1)))
    if edge:
        return fr[0] if v == 0 or u == 0 else fr[1]
    glow = th.get("win_glow", WARM)
    if kind == "stained":
        if night:
            return glow[0] if (u + v) % 4 < 2 else glow[1]
        a, g = th["accent"], [rgb(c) for c in th["glow"]]
        return a[1] if ((u + v) // 2) % 2 else g[1] if (u - v) % 3 else g[0]
    if kind in ("square", "wood") and (u == W // 2 or v == H // 2):
        return FRAME[2] if not wood else th["trim"][2]
    if night:
        return glow[1] if (u + v) % 7 else glow[0]
    if (u - v) % 9 in (0, 1):
        return GLASS[0]
    return GLASS[1] if v > H // 2 else GLASS[2]


def pattern_offset(pattern, x, h):
    """Return a ramp-index offset (-1 lighter, +1 darker) for a wall material pattern."""
    if pattern == "brick":
        course = h // 5
        if h % 5 == 0 or (x + course * 6) % 12 == 0:
            return 1
        return -1 if cl(x, h, 1) > 200 else 0
    if pattern == "blocks":
        course = h // 6
        if h % 6 == 0 or (x + course * 5) % 10 == 0:
            return 1
        return -1 if nz((x + course * 5) // 10, course, 4) > 190 else 0
    if pattern == "ribbed":
        m = x % 4
        return -1 if m == 0 else 1 if m == 3 else 0
    if pattern == "planks":
        if x % 5 == 0:
            return 1
        return -1 if nz(x // 5, h // 7, 5) > 230 else 0
    if pattern == "plaster":
        if nz(x, h, 6) > 250:
            return 1
        return -1 if cl(x, h, 7) > 238 else 0
    if pattern == "marble":
        return 1 if x % 16 == 0 else 0
    return 0


def facade(th, t, night, *, base=0, top=44, bands=((5, 8), (33, 35)), pattern="brick", windows=(),
           door=True, door_h0=0, plinth=3, ramp=None, curve=None, chamfer=False, ao=True,
           top_color=None, extra=None):
    """Generic front-face colour function for a sculpt / box body.
    curve=(cx, halfwidth) shades a curved front; chamfer=True shades d>0 faces as chamfers.
    extra(x, d, h, face) -> colour|None lets a module paint its own details first."""
    W = ramp or th["wall"]
    A, P = th["accent"], th["rock"]

    def f(x, d, h, face):
        if extra is not None:
            c = extra(x, d, h, face)
            if c is not None:
                return c
        if face == "top":
            return top_color(x, d, h) if top_color else W[1]
        hh = h - base
        side = 0
        if curve:
            cx, hw = curve
            side = -1 if x < cx - hw * 0.5 else 1 if x > cx + hw * 0.5 else 0
        elif chamfer and d > 0:
            side = -1 if x < BW // 2 else 1
        if door and side == 0 and DOOR_X0 <= x < DOOR_X1 and door_h0 <= h < door_h0 + DOOR_H:
            return door_px(th, x - DOOR_X0, h - door_h0, t, night)
        for w in windows:
            c = win_color(th, w, x, h, night)
            if c is not None:
                return c
        if hh < plinth:
            return P[3] if (x // 6 + h) % 2 else P[4]
        for (b0, b1) in bands:
            if b0 <= hh <= b1:
                if side:
                    return A[1] if side < 0 else A[3]
                return A[0] if hh == b1 else A[3] if hh == b0 else A[2]
        tt = top - base
        if ao and hh >= tt - 3:
            return W[4]
        if ao and hh >= tt - 5:
            return W[3]
        k = 2 + side + pattern_offset(pattern, x, h)
        return W[max(0, min(4, k))]
    return f


def deck_color(th, x, d):
    """Roof deck top colour with the theme's pools (th['pools'] = [(cx, cd, r)], th['pool'] = 3 colours)."""
    D = th["deck"]
    pr = th.get("pool") or th["glow"][1:4]
    for cx, cd, r in th.get("pools", ()):
        q = ((x - cx) / r) ** 2 + ((d - cd) / (r * 0.7)) ** 2
        if q < 1:
            return pr[0] if q < 0.35 else pr[1] if q < 0.7 else pr[2]
    return D[1] if cl(x, d, 2) > 180 else D[2]


def band_rows(ramp, h, h0, h1):
    """Light-at-top row colour for an eave / cornice band between h0 and h1."""
    k = int((h - h0) / max(1, h1 - h0) * 5)
    return [ramp[4], ramp[3], ramp[2], ramp[1], ramp[0]][max(0, min(4, k))]


def chamfer_inside(x0, x1, d0, d1, h0, h1, c=C):
    def f(x, d, h):
        return (x0 <= x < x1 and d0 <= d < d1 and h0 <= h < h1
                and d - d0 >= c - 1 - (x - x0) and d - d0 >= (x - x0) - (x1 - x0 - c))
    return f


def column(sc, th, cx, cd, h0, h1, r=2.6, ramp=None, capital=True):
    R = ramp or th["trim"]

    def inside(x, d, h):
        return ell(x, d, cx, cd, r, 0.8) < 1

    def color(x, d, h, face):
        if face == "top":
            return R[0]
        dx = x - cx
        return R[0] if dx < -r * 0.4 else R[1] if dx < r * 0.3 else R[2] if dx < r * 0.8 else R[3]
    sc.sculpt(int(cx - r - 1), int(cx + r + 2), int(cd - r), int(cd + r + 1), h0, h1, inside, color)
    if capital:
        sc.box(int(cx - r - 1), int(cx + r + 2), int(cd - r - 1), int(cd + r + 1), h1, h1 + 2,
               top=R[0], front=R[1], edge=R[4] if len(R) > 4 else IO)


def sphere_sculpt(sc, blobs, color_fn, shadow=True, rd=0.5):
    """Union of spheres (cx, cd, ch, r); color_fn(x, d, h, face, blob, nx, ny)."""
    xs = [b[0] for b in blobs]
    rs = max(b[3] for b in blobs)
    x0, x1 = int(min(xs) - rs - 1), int(max(xs) + rs + 2)
    d0 = int(min(b[1] - b[3] * rd for b in blobs) - 1)
    d1 = int(max(b[1] + b[3] * rd for b in blobs) + 2)
    h0 = int(min(b[2] - b[3] for b in blobs) - 1)
    h1 = int(max(b[2] + b[3] for b in blobs) + 2)

    def best(x, d, h):
        bb, bv = None, 1.0
        for b in blobs:
            v = ((x - b[0]) / b[3]) ** 2 + ((d - b[1]) / (b[3] * rd)) ** 2 + ((h - b[2]) / b[3]) ** 2
            if v < bv:
                bb, bv = b, v
        return bb

    def inside(x, d, h):
        return best(x, d, h) is not None

    def color(x, d, h, face):
        b = best(x, d, h)
        return color_fn(x, d, h, face, b, (x - b[0]) / b[3], (h - b[2]) / b[3] + (0.35 if face == "top" else 0))
    sc.sculpt(x0, x1, d0, d1, max(0, h0), h1, inside, color, shadow=shadow)


def boulders(sc, bl, ramp, d0, d1, base=DECK):
    """Rounded rocks (cx, cd, r, height) sitting on a surface at h = base."""
    def inside(x, d, h):
        for cx, cd, r, hh in bl:
            if ((x - cx) / r) ** 2 + ((d - cd) / (r * 0.8)) ** 2 + ((h - base + 1) / hh) ** 2 < 1 and h >= base:
                return True
        return False

    def color(x, d, h, face):
        n = cl(x, h + d, 3)
        if face == "top":
            return ramp[0] if n > 170 else ramp[1]
        left = x < CX
        return ramp[1 if left else 2] if n > 90 else ramp[2 if left else 3]
    if bl:
        sc.sculpt(-6, BW + 6, d0, d1, base, base + max(b[3] for b in bl) + 2, inside, color)


def emblem_plate(sc, th, h0=33, d0=-6, d1=-3, cx=CX, rim=None):
    """Front-facing emblem relief: rim in accent, mid/core in glow (emissive at night)."""
    A, GL = (rim or th["accent"]), th["glow"]
    kind = th["emblem"]

    def inside(x, d, h):
        return d0 <= d < d1 and emblem_level(kind, x - cx, h - h0) > 0

    def color(x, d, h, face):
        lv = emblem_level(kind, x - cx, h - h0)
        if face == "top":
            return A[0]
        return GL[0] if lv == 3 else GL[1] if lv == 2 else (A[1] if x <= cx else A[2])
    sc.sculpt(cx - 17, cx + 18, d0, d1, h0, h0 + 21, inside, color, shadow=False, edge=A[4])


def flame_top(sc, ramp, cx, cd, hb, hh=12, r=4.5):
    def inside(x, d, h):
        if h < hb or h >= hb + hh:
            return False
        q = (h - hb) / hh
        rr = r * (1 - q) ** 0.8 + 0.3
        return (x - cx - 0.6 * math.sin(h * 1.3 + cx)) ** 2 + ((d - cd) * 1.4) ** 2 < rr * rr

    def color(x, d, h, face):
        q, e = (h - hb) / hh, abs(x - cx)
        if q < 0.45 and e < 1.5:
            return ramp[0]
        if q < 0.7 and e < 2.5:
            return ramp[1]
        return ramp[2] if q < 0.8 else ramp[3]
    sc.sculpt(int(cx - r - 2), int(cx + r + 3), int(cd - r), int(cd + r), hb, hb + hh, inside, color, shadow=False)


def build(th, t=0.0, night=False):
    th["_night"] = night
    sc = Scene(CELL, CELL, X0, G, k=0)
    th["exterior"](sc, th, t, night)
    sc.outline()
    if th.get("sparks"):
        th["sparks"](sc, th, night)
    if night:
        sc.night()
    return sc


def flatten(sc):
    out = Image.new("RGB", sc.img.size, MAGENTA)
    out.paste(sc.img, (0, 0), sc.img)
    return out


def ground_layer(th, sc, night, volume=False):
    """Gen 3 default: an opaque 1 px grey contact line under the building, nothing else.
    volume=True (opt-in, not Gen 3): flat semi-dark cast shadow + night light pools."""
    if not volume:
        lay = Image.new("RGBA", sc.img.size, (0, 0, 0, 0))
        lp = lay.load()
        px = sc.px
        c = gen3.snap(CONTACT) + (255,)
        for x in range(sc.w):
            for y in range(G - 6, min(sc.h - 1, G + 14)):
                if px[x, y][3] and not px[x, y + 1][3]:
                    lp[x, y + 1] = c
        return lay
    lay = sc.shadow_layer()
    lp = lay.load()
    px = sc.px
    for x in range(sc.w):
        for y in range(G - 6, min(sc.h - 1, G + 14)):
            if px[x, y][3] and not px[x, y + 1][3]:
                lp[x, y + 1] = (20, 12, 48, 170)
    if night:
        c = rgb(th["glow"][1])
        pool = Image.new("RGBA", lay.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(pool)
        for cx in th.get("night_lights", (X0 - 11, X0 + BW + 10)):
            d.ellipse([cx - 16, G - 4, cx + 16, G + 10], fill=c + (56,))
            d.ellipse([cx - 9, G - 1, cx + 9, G + 7], fill=c + (70,))
        d.polygon([(X0 + DOOR_X0, G + 1), (X0 + DOOR_X1, G + 1), (X0 + DOOR_X1 + 6, G + 14),
                   (X0 + DOOR_X0 - 6, G + 14)], fill=(255, 170, 80, 64))
        pl = pool.load()
        for y in range(lay.size[1]):
            for x in range(lay.size[0]):
                if pl[x, y][3] and not px[x, y][3]:
                    lp[x, y] = pl[x, y]
    return lay


# ================================================================ interior engine (multi-floor)
WALK = set(".|=SKTMUDWH*")
LEGEND = {"O": "outside ground", "#": "rim wall", "P": "pillar (blocked)", ".": "floor",
          "~": "hazard (blocked)", "|": "bridge N-S", "=": "bridge E-W", "L": "ledge (blocked)",
          "S": "steps (same floor)", "K": "leader dais", "T": "trainer spot", "B": "prop (blocked)",
          "G": "statue (blocked)", "M": "exit mat", "U": "stairs up (link)", "D": "stairs down (link)",
          "W": "warp pad (link)", "H": "hole, one-way drop (link)", "*": "switch (opens X)",
          "X": "gate (open after switch)"}


class Ctx:
    """Render context for one floor: ctx.p pixels, ctx.d ImageDraw, ctx.g(c, r) tile char."""

    def __init__(self, th, floor, im):
        self.th, self.floor, self.im = th, floor, im
        self.grid = floor["grid"]
        self.w, self.h = len(self.grid[0]), len(self.grid)
        self.p = im.load()
        self.d = ImageDraw.Draw(im)

    def g(self, c, r):
        return self.grid[r][c] if 0 <= r < self.h and 0 <= c < self.w else "#"

    def fill(self, c, r, fn):
        X, Y = c * T, r * T
        for y in range(T):
            for x in range(T):
                self.p[X + x, Y + y] = fn(X + x, Y + y)


def walkset(th):
    return WALK | set(th.get("walk_extra", ""))


# ---------------------------------------------------------------- default tile renderers
def t_outside(ctx, c, r):
    Q = ctx.th["outside"]

    def f(gx, gy):
        x, y = gx % T, gy % T
        if (x, y) in ((3, 4), (4, 4), (11, 11), (9, 2)):
            return Q[3]
        if (x, y) in ((3, 3), (11, 10), (13, 7)):
            return Q[1]
        return Q[2]
    ctx.fill(c, r, f)


def t_rim(ctx, c, r, ramp=None):
    A = ramp or ctx.th.get("rim", ctx.th["accent"])
    _wallblock(ctx, c, r, (A[2], A[1], A[3], A[4]), "#OP")


def t_pillar(ctx, c, r):
    _wallblock(ctx, c, r, (STONE[1], STONE[0], STONE[2], STONE[3]), "#OP", pillar=True)


def _wallblock(ctx, c, r, cols, solid, pillar=False):
    top, light, dark, deep = cols
    X, Y, p = c * T, r * T, ctx.p
    south_room = ctx.g(c, r + 1) not in solid
    fh = 5 if south_room else 0
    for y in range(T):
        for x in range(T):
            if y >= T - fh:
                col = IO if y == T - 1 else (dark if y == T - fh else deep)
            elif y == 0 or x == 0:
                col = light
            elif x == T - 1 or y == T - fh - 1:
                col = dark
            elif not pillar and ((X + x) % 8 == 7 if fh else (Y + y) % 8 == 7):
                col = dark
            else:
                col = top
            p[X + x, Y + y] = col
    me = ctx.g(c, r)
    for dc, dr in ((1, 0), (-1, 0), (0, -1), (0, 1)):
        n = ctx.g(c + dc, r + dr)
        if n not in solid or (pillar and n != me) or (n == "O" and dr == -1):
            for i in range(T):
                xy = (X + (T - 1 if dc > 0 else 0), Y + i) if dc else (X + i, Y + (0 if dr < 0 else T - 1))
                p[xy] = IO


def default_floor_px(th):
    F = th["floor"]

    def f(gx, gy):
        x, y = gx % T, gy % T
        if x == 0 or y == 0:
            return F[0]
        if x == T - 1 or y == T - 1:
            return F[3]
        if (x, y) in ((4, 5), (5, 5), (10, 10), (11, 10), (12, 4)):
            return F[2]
        if (x, y) in ((4, 4), (10, 9), (6, 11)):
            return F[0]
        return F[1]
    return f


def t_floor(ctx, c, r):
    th = ctx.th
    fp = th.get("floor_px") or default_floor_px(th)
    ctx.fill(c, r, fp)
    F = th["floor"]
    if ctx.g(c, r - 1) in "L#PX" or ctx.g(c, r - 1) in th.get("raised", ""):
        X, Y = c * T, r * T
        for x in range(T):
            ctx.p[X + x, Y] = F[3]
            ctx.p[X + x, Y + 1] = F[2]


def t_hazard(ctx, c, r, bridge=None):
    """Sunken hazard (lava/water/void...): far-edge cliff face, bright rim, near-edge outline."""
    th, p = ctx.th, ctx.p
    HZ, F = th["hazard_ramp"], th["floor"]
    hz = th["hazard_px"]
    X, Y = c * T, r * T
    for y in range(T):
        for x in range(T):
            p[X + x, Y + y] = hz(X + x, Y + y)
    lav = "~|=" + th.get("hazard_like", "")
    top = 0
    if ctx.g(c, r - 1) not in lav:
        for x in range(T):
            cr = ((X + x) * 7) % 11 < 2
            p[X + x, Y] = F[2]
            for y in range(1, 5):
                p[X + x, Y + y] = F[4] if cr else F[3]
            p[X + x, Y + 5] = IO
            p[X + x, Y + 6] = HZ[4]
            p[X + x, Y + 7] = HZ[1]
        top = 6
    if ctx.g(c - 1, r) not in lav:
        for y in range(top, T):
            p[X, Y + y] = IO
            if y > top + 1:
                p[X + 1, Y + y] = HZ[1]
    if ctx.g(c + 1, r) not in lav:
        for y in range(top, T):
            p[X + T - 1, Y + y] = IO
            if y > top + 1:
                p[X + T - 2, Y + y] = HZ[1]
    if ctx.g(c, r + 1) not in lav:
        for x in range(T):
            p[X + x, Y + T - 1] = IO
            if 0 < x < T - 1 and p[X + x, Y + T - 2] != IO:
                p[X + x, Y + T - 2] = HZ[1]


def t_bridge(ctx, c, r):
    t_hazard(ctx, c, r)
    horizontal = ctx.g(c, r) == "="
    fn = ctx.th.get("bridge_px")
    X, Y, p = c * T, r * T, ctx.p
    for y in range(T):
        for x in range(T):
            u, v = (y, x) if horizontal else (x, y)       # u across, v along the bridge
            if u in (1, 14):
                col = IO
            elif u in (2, 13):
                col = WOOD[3]
            elif 3 <= u <= 12:
                col = WOOD[2] if v % 4 == 3 else WOOD[0] if v % 4 == 0 else WOOD[1]
            else:
                continue
            if fn:
                col = fn(u, v, col) or col
            p[X + x, Y + y] = col
        if not horizontal:
            p[X + 15, Y + y] = ctx.th["hazard_ramp"][4]
    if horizontal:
        for x in range(T):
            p[X + x, Y + 15] = ctx.th["hazard_ramp"][4]


def t_ledge(ctx, c, r):
    LD, X, Y, p = ctx.th["ledge"], c * T, r * T, ctx.p
    face = ctx.g(c, r + 1) != "L"
    for y in range(T):
        for x in range(T):
            if face and y >= 10:
                cr = ((X + x) * 5) % 9 < 2
                col = LD[1] if y == 10 else IO if y == 15 else LD[4] if cr else LD[3]
            else:
                col = LD[1]
                if (x, y % 8) in ((4, 3), (5, 3), (11, 6)):
                    col = LD[2]
                if (x, y % 8) in ((4, 2), (11, 5)):
                    col = LD[0]
            p[X + x, Y + y] = col
    if ctx.g(c, r - 1) != "L":
        for x in range(T):
            p[X + x, Y] = IO
            p[X + x, Y + 1] = LD[0]
    for dc, x in ((-1, 0), (1, T - 1)):
        if ctx.g(c + dc, r) != "L":
            for y in range(T):
                p[X + x, Y + y] = IO


def t_steps(ctx, c, r):
    LD, X, Y, p = ctx.th["ledge"], c * T, r * T, ctx.p
    for y in range(T):
        for x in range(T):
            p[X + x, Y + y] = STONE[0] if y % 4 == 0 else STONE[2] if y % 4 == 3 else STONE[1]
    for dc, xs in ((-1, (0, 1)), (1, (T - 2, T - 1))):
        if ctx.g(c + dc, r) != "S":
            for y in range(T):
                p[X + xs[0], Y + y] = IO if dc < 0 else LD[3]
                p[X + xs[1], Y + y] = LD[3] if dc < 0 else IO


def t_stairs_link(ctx, c, r):
    """'U' stairs going up to another floor / 'D' stairs going down into a stairwell.
    Adjacent same chars form one wide staircase."""
    up = ctx.g(c, r) == "U"
    X, Y, p = c * T, r * T, ctx.p
    S = ctx.th.get("stair_ramp", STONE)
    dark = (22, 18, 30)
    for y in range(T):
        f = (15 - y) / 15 if up else y / 15          # depth: 0 = at floor level, 1 = far away
        for x in range(T):
            if up and y < 2:
                col = dark
            else:
                base = S[0] if y % 3 == (0 if up else 2) else S[1] if y % 3 == 1 else S[2]
                col = mix(base, dark, f * 0.75)
            p[X + x, Y + y] = col
    TR = ctx.th["trim"]
    for dc, xs in ((-1, (0, 1, 2)), (1, (T - 3, T - 2, T - 1))):
        if ctx.g(c + dc, r) != ctx.g(c, r):
            for y in range(T):
                p[X + xs[0], Y + y] = IO if dc < 0 else TR[3]
                p[X + xs[1], Y + y] = TR[1] if dc < 0 else TR[2]
                p[X + xs[2], Y + y] = TR[2] if dc < 0 else IO
    for x in range(T):
        p[X + x, Y + (0 if not up else T - 1)] = IO


def t_warp(ctx, c, r):
    t_floor(ctx, c, r)
    GL = [rgb(x) for x in ctx.th["glow"]]
    X, Y, p = c * T, r * T, ctx.p
    for y in range(T):
        for x in range(T):
            dd = (x - 7.5) ** 2 + ((y - 7.5) * 1.2) ** 2
            if dd < 49:
                p[X + x, Y + y] = IO if dd > 40 else GL[2] if dd > 24 else GL[1] if dd > 9 else GL[0]


def t_hole(ctx, c, r):
    t_floor(ctx, c, r)
    X, Y, p = c * T, r * T, ctx.p
    F = ctx.th["floor"]
    for y in range(T):
        for x in range(T):
            dd = ((x - 7.5) / 6.5) ** 2 + ((y - 8) / 5.5) ** 2
            if dd < 1:
                p[X + x, Y + y] = IO if dd > 0.82 else (F[4] if y < 6 else (24, 18, 30))


def t_switch(ctx, c, r):
    t_floor(ctx, c, r)
    A, X, Y = ctx.th["accent"], c * T, r * T
    ctx.d.ellipse([X + 3, Y + 4, X + 12, Y + 11], fill=A[1], outline=IO)
    ctx.d.ellipse([X + 5, Y + 5, X + 9, Y + 8], fill=A[0])


def t_gate(ctx, c, r):
    t_floor(ctx, c, r)
    GL = [rgb(x) for x in ctx.th["glow"]]
    X, Y, p = c * T, r * T, ctx.p
    for y in range(2, T - 1):
        for x in range(T):
            if x % 5 == 2:
                p[X + x, Y + y] = GL[1] if y % 3 else GL[0]
    ctx.d.rectangle([X, Y + 1, X + T - 1, Y + 3], fill=STEEL[2], outline=IO)
    ctx.d.rectangle([X, Y + T - 3, X + T - 1, Y + T - 1], fill=STEEL[3], outline=IO)


def t_dais(ctx, c, r):
    A, F, TR = ctx.th["accent"], ctx.th["floor"], ctx.th["trim"]
    X, Y, p = c * T, r * T, ctx.p
    for y in range(T):
        for x in range(T):
            p[X + x, Y + y] = A[2]
    front = ctx.g(c, r + 1) != "K"
    if front:
        for y in range(10, T):
            for x in range(T):
                p[X + x, Y + y] = IO if y == T - 1 else F[1] if y in (10, 13) else F[2]
    for dc, dr in ((-1, 0), (1, 0), (0, -1)):
        if ctx.g(c + dc, r + dr) != "K":
            for i in range(T):
                if dc:
                    x = 0 if dc < 0 else T - 1
                    p[X + x, Y + i] = IO
                    if i < (10 if front else T):
                        p[X + (1 if dc < 0 else T - 2), Y + i] = TR[1]
                else:
                    p[X + i, Y] = IO
                    p[X + i, Y + 1] = TR[1]


def t_mat(ctx, c, r):
    t_floor(ctx, c, r)
    A, X, Y, p = ctx.th["accent"], c * T, r * T, ctx.p
    for y in range(1, T):
        for x in range(T):
            p[X + x, Y + y] = A[1] if y == 2 else A[2] if y % 3 == 0 else A[3]
    for y in range(1, T):
        if ctx.g(c - 1, r) != "M":
            p[X, Y + y] = IO
        if ctx.g(c + 1, r) != "M":
            p[X + T - 1, Y + y] = IO
    for x in range(T):
        p[X + x, Y + 1] = IO


DEFAULT_TILES = {"O": t_outside, "#": t_rim, "P": t_pillar, "~": t_hazard, "|": t_bridge, "=": t_bridge,
                 "L": t_ledge, "S": t_steps, "U": t_stairs_link, "D": t_stairs_link, "W": t_warp,
                 "H": t_hole, "*": t_switch, "X": t_gate, "K": t_dais, "M": t_mat}


def render_floor(th, floor):
    w, h = len(floor["grid"][0]), len(floor["grid"])
    im = Image.new("RGB", (w * T, h * T), IO)
    ctx = Ctx(th, floor, im)
    tiles = dict(DEFAULT_TILES)
    tiles.update(th.get("tiles", {}))
    for r in range(h):
        for c in range(w):
            ch = ctx.g(c, r)
            tiles.get(ch, t_floor)(ctx, c, r)
    # leader dais: type emblem inlaid (unless the module draws its own)
    lf, lx, ly, _ = th["leader"]
    if floor["name"] == lf and th.get("dais_emblem", True):
        GL, A = [rgb(c) for c in th["glow"]], th["accent"]
        cx = (lx + 1) * T if ctx.g(lx + 1, ly) == "K" else lx * T + 8
        top = (ly - 1) * T + 2 if ctx.g(lx, ly - 1) == "K" else ly * T + 1
        for py in range(top, top + 14):
            for px in range(cx - 10, cx + 10):
                lv = emblem_level(th["emblem"], (px - cx + 0.5) * 1.5, (top + 13 - py) * 1.45)
                if lv:
                    ctx.p[px, py] = GL[0] if lv == 3 else GL[1] if lv == 2 else A[3]
    if th.get("decor"):
        th["decor"](ctx)
    return im


# ---------------------------------------------------------------- graph + checks
def _floors(th):
    return {f["name"]: f for f in th["floors"]}


def _get(th, node):
    f, x, y = node
    g = _floors(th)[f]["grid"]
    return g[y][x] if 0 <= y < len(g) and 0 <= x < len(g[0]) else "#"


def trainers(th):
    out = []
    for f in th["floors"]:
        for t in f.get("trainers", ()):
            x, y, facing = t[0], t[1], t[2]
            sight = t[3] if len(t) > 3 else 2
            out.append({"floor": f["name"], "x": x, "y": y, "facing": facing, "sight": sight})
    order = th.get("battle_order")
    if order:
        out = [out[i] for i in order]
    for i, t in enumerate(out):
        t["id"] = f"trainer-{i + 1}"
    return out


def leader(th):
    f, x, y, facing = th["leader"]
    return {"id": "leader", "floor": f, "x": x, "y": y, "facing": facing, "sight": 1}


def warp_map(th):
    m = {}
    for l in th.get("links", ()):
        a, b = tuple(l["a"]), tuple(l["b"])
        m[a] = b
        if l["type"] in ("stairs", "warp"):
            m[b] = a
    return m


def sight_tiles(th, t, walk):
    dx, dy = DIRS[t["facing"]]
    out = []
    for i in range(1, t["sight"] + 1):
        q = (t["floor"], t["x"] + dx * i, t["y"] + dy * i)
        if _get(th, q) not in walk:
            break
        out.append(q)
    return out


def bfs(th, blocked=frozenset()):
    walk = walkset(th)
    wm = warp_map(th)
    tr = trainers(th)
    occupied = {(t["floor"], t["x"], t["y"]) for t in tr}
    L = leader(th)
    occupied.add((L["floor"], L["x"], L["y"]))
    dx, dy = DIRS[L["facing"]]
    goal = (L["floor"], L["x"] + dx, L["y"] + dy)
    start = None
    for f in th["floors"]:
        for y, row in enumerate(f["grid"]):
            if "M" in row:
                start = (f["name"], row.index("M"), y)
                break
        if start:
            break
    s0 = (start, False)
    prev = {s0: None}
    queue = [s0]
    found = None
    for cur in queue:
        node, on = cur
        if node == goal:
            found = cur
            break
        f, x, y = node
        for ddx, ddy in DIRS.values():
            n = (f, x + ddx, y + ddy)
            ch = _get(th, n)
            if not (ch in walk or (ch == "X" and on)):
                continue
            if n in occupied or n in blocked:
                continue
            on2 = on or ch == "*"
            if n in wm:
                n = wm[n]
            st = (n, on2)
            if st not in prev:
                prev[st] = cur
                queue.append(st)
    if not found:
        return None, start, goal
    path, cur = [], found
    while cur:
        path.append(cur[0])
        cur = prev[cur]
    return path[::-1], start, goal


def check(th):
    path, start, goal = bfs(th)
    if path is None:
        raise SystemExit(f"{th['slug']}: leader unreachable from the entrance")
    walk = walkset(th) | {"X"}
    tr = trainers(th)
    for t in tr:
        p2, _, _ = bfs(th, frozenset(sight_tiles(th, t, walk)))
        t["required"] = p2 is None
    return path, tr


def route_overlay(th, floor, base, path, tr):
    ov = Image.blend(base, Image.new("RGB", base.size, (0, 0, 0)), 0.35)
    d = ImageDraw.Draw(ov, "RGBA")
    walk = walkset(th) | {"X"}
    L = leader(th)
    people = [t for t in tr if t["floor"] == floor["name"]] + ([L] if L["floor"] == floor["name"] else [])
    for t in people:
        for (_, x, y) in sight_tiles(th, t, walk):
            d.rectangle([x * T + 1, y * T + 1, x * T + T - 2, y * T + T - 2], fill=(255, 60, 60, 110))
    for (f, x, y) in path:
        if f == floor["name"]:
            d.rectangle([x * T + 6, y * T + 6, x * T + 9, y * T + 9], fill=(255, 255, 255, 230))
    for l in th.get("links", ()):
        for end in ("a", "b"):
            f, x, y = l[end]
            if f == floor["name"]:
                d.rectangle([x * T + 1, y * T + 1, x * T + T - 2, y * T + T - 2], outline=(120, 255, 160, 255))
    for t in people:
        x, y = t["x"] * T, t["y"] * T
        col = (255, 214, 64) if t is L else (90, 220, 255)
        d.ellipse([x + 2, y + 2, x + 13, y + 13], fill=col + (255,), outline=IO)
        ddx, ddy = DIRS[t["facing"]]
        cx, cy = x + 8 + ddx * 4, y + 8 + ddy * 4
        d.polygon([(cx + ddx * 3, cy + ddy * 3), (cx - ddy * 3, cy + ddx * 3), (cx + ddy * 3, cy - ddx * 3)], fill=IO)
        if t is not L:
            k = int(t["id"].split("-")[1])
            for i in range(k):
                d.rectangle([x + 2 + i * 3, y - 3, x + 3 + i * 3, y - 2], fill=(255, 255, 255, 255))
    return ov


# ================================================================ render one gym
def up(im):
    return im.resize((im.width * 2, im.height * 2), Image.NEAREST)


def _at(im, x, size):
    lay = Image.new("RGBA", size, (0, 0, 0, 0))
    lay.paste(im, (x, 0))
    return lay


DOOR_T = (0, 0.25, 0.75, 1)   # closed + 3 open frames (pret field_door.c)


def gen3_frames(th, night):
    """Build the closed building + 3 door-open frames and run them through ONE Gen 3 pass
    (stitched side by side) so every frame shares the same colours and palettes."""
    scenes = [build(th, t, night) for t in DOOR_T]
    strip = Image.new("RGBA", (CELL * len(scenes), CELL), (0, 0, 0, 0))
    for i, sc in enumerate(scenes):
        strip.paste(sc.img, (i * CELL, 0))
    strip = gen3.to_gen3(strip, max_palettes=th.get("palettes", EXT_PALETTES), keep=(IO, OUTLINE),
                         regions=[(i * CELL, 0, (i + 1) * CELL, CELL) for i in range(len(scenes))])
    frames = [strip.crop((i * CELL, 0, (i + 1) * CELL, CELL)) for i in range(len(scenes))]
    check_door_strip(th, frames)
    return scenes[0], frames


def check_door_strip(th, frames):
    """Every pixel that changes while the door opens must lie inside DOOR_STRIP (pret door contract)."""
    dx, dy, dw, dh = DOOR_STRIP
    p = [f.load() for f in frames]
    bad = [(x, y) for y in range(CELL) for x in range(CELL)
           if not (dx <= x < dx + dw and dy <= y < dy + dh) and any(q[x, y] != p[0][x, y] for q in p[1:])]
    if bad:
        xs, ys = [b[0] for b in bad], [b[1] for b in bad]
        raise SystemExit(f"{th.get('slug')}: door animation changes {len(bad)} px outside DOOR_STRIP {DOOR_STRIP} "
                         f"(x {min(xs)}..{max(xs)}, y {min(ys)}..{max(ys)}): put the door on the d = 0 face")


def on_magenta(im):
    out = Image.new("RGB", im.size, MAGENTA)
    out.paste(im, (0, 0), im)
    return out


def render(th, root, night=False, volume=False):
    """Writes (x2 upscale of native Gen 3 pixels):
      -structure.png  closed building, 8x8 metatiles on magenta (Day; + Night cell if night=True)
      -ground.png     RGBA: 1 px contact line (volume=True: semi-dark cast shadow, not Gen 3)
      -door.png       Gen 3 door strip: 4 frames (closed, 3 open) of the 2x2-metatile door region;
                      row 2 = night if night=True. -door.json says where it sits on the structure.
      -door.gif, -preview.png  review only."""
    slug = th["slug"]
    out = os.path.join(root, f"gym-{slug}")
    os.makedirs(out, exist_ok=True)
    pre = os.path.join(out, f"gym-{slug}")
    for stale in (pre + "-interior.png", pre + "-interior-route.png"):
        if os.path.exists(stale):
            os.remove(stale)
    S = CELL * 2
    modes = [False, True] if night else [False]
    built = [gen3_frames(th, n) for n in modes]
    sheet = Image.new("RGB", (S * len(modes), S), MAGENTA)
    ground = Image.new("RGBA", (S * len(modes), S), (0, 0, 0, 0))
    dx, dy, dw, dh = DOOR_STRIP
    door = Image.new("RGB", (dw * 2 * len(DOOR_T), dh * 2 * len(modes)), MAGENTA)
    for r, (n, (sc, frames)) in enumerate(zip(modes, built)):
        sheet.paste(up(on_magenta(frames[0])), (r * S, 0))
        ground.paste(up(ground_layer(th, sc, n, volume)), (r * S, 0))
        for i, f in enumerate(frames):
            door.paste(up(on_magenta(f.crop((dx, dy, dx + dw, dy + dh)))), (i * dw * 2, r * dh * 2))
    sheet.save(pre + "-structure.png")
    ground.save(pre + "-ground.png")
    door.save(pre + "-door.png")
    with open(pre + "-door.json", "w") as fh:
        json.dump({"scale": 2, "x": dx * 2, "y": dy * 2, "w": dw * 2, "h": dh * 2,
                   "frames": ["closed", "open1", "open2", "open3"], "rows": ["day", "night"][:len(modes)],
                   "ticks_per_frame": 4, "frame_ms": 83,
                   "open": [0, 1, 2, 3], "close": [3, 2, 1, 0],
                   "note": "pret field_door.c: door = 2x2 metatiles drawn over the structure at (x, y)"},
                  fh, indent=1)
    gif = [up(on_magenta(f)) for f in built[0][1]]
    seq = gif + gif[::-1]
    seq[0].save(pre + "-door.gif", save_all=True, append_images=seq[1:],
                duration=[600] + [83] * 3 + [600] + [83] * 3, loop=0)
    # interior floors
    path, tr = check(th)
    floors_json, bases = [], []
    for f in th["floors"]:
        base = gen3.to_gen3(render_floor(th, f), max_palettes=th.get("int_palettes", INT_PALETTES)).convert("RGB")
        bases.append(base)
        name = f["name"]
        up(base).save(f"{pre}-interior-{name}.png")
        up(route_overlay(th, f, base, path, tr)).save(f"{pre}-interior-{name}-route.png")
        floors_json.append({"name": name, "image": f"gym-{slug}-interior-{name}.png",
                            "width": len(f["grid"][0]), "height": len(f["grid"]), "grid": f["grid"]})
    legend = dict(LEGEND)
    legend.update(th.get("legend_extra", {}))
    with open(pre + "-interior.json", "w") as fh:
        json.dump({"type": slug, "tile": T, "scale": 2, "floors": floors_json,
                   "links": [{"type": l["type"], "a": list(l["a"]), "b": list(l["b"])} for l in th.get("links", ())],
                   "legend": legend, "walkable": sorted(walkset(th)), "leader": leader(th), "trainers": tr,
                   "route": [list(q) for q in path]}, fh, indent=1)
    # all floors side by side (review sheet)
    gap = 8
    W = sum(b.width for b in bases) + gap * (len(bases) - 1)
    H = max(b.height for b in bases)
    sheet = Image.new("RGB", (W, H), (24, 20, 30))
    x = 0
    for b in bases:
        sheet.paste(b, (x, 0))
        x += b.width + gap
    up(sheet).save(pre + "-interior-floors.png")
    # exterior preview on grass, with the 16 px metatile grid faintly marked
    PW = S * len(modes)
    prev = Image.new("RGBA", (PW, S), (0, 0, 0, 255))
    pp = prev.load()
    for y in range(S):
        for x in range(PW):
            g = (104, 176, 88) if nz(x // 8, y // 8, 11) > 60 else (92, 160, 80)
            if x % (T * 2) == 0 or y % (T * 2) == 0:
                g = (84, 146, 74)
            if x >= S:
                g = (int(g[0] * .46), int(g[1] * .5 + 4), int(g[2] * .7 + 40))
            pp[x, y] = g + (255,)
    prev = Image.alpha_composite(prev, ground)
    for i, (_, frames) in enumerate(built):
        prev = Image.alpha_composite(prev, _at(up(frames[0]), i * S, prev.size))
    prev.convert("RGB").save(pre + "-preview.png")
    req = ", ".join(f"{t['id']}@{t['floor']}={'req' if t['required'] else 'OPTIONAL'}" for t in tr)
    print(f"{slug:9s} floors={'/'.join(f['name'] for f in th['floors'])} route={len(path)}  {req}")
    return pre
