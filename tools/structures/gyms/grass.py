"""Grass-Type Gym: Canopy Conservatory (timber-framed Victorian glasshouse).

Exterior: a tall arched glass nave with a radial fanlight, flanked by two lower curved-roof glass
wings, all in a warm timber grid on a cream stone plinth. Stone planter boxes full of flowers line
the wings, vines climb the chamfered corners, pergola posts with knee braces hold a leaf-shaped
awning over the sliding door, and the leaf emblem glows in the fanlight. Crown: a great blossoming
tree canopy rising behind a ribbed glass cupola. Props: spiral topiaries in terracotta pots topped
with glowing bud lanterns. At night every pane glows warm with plant silhouettes behind the glass.

Interior: 1F hedge-maze garden (raised thorn-rose hedges, flower beds, stepping-stone paths, a
lily pond crossed by one footbridge) -> spiral stairs around the great trunk -> 2F tree-canopy
walkway (plank platforms and rope bridges over a leafy void, leader on the crown platform).
A vine hole on 2F drops back to the 1F entrance garden (one-way shortcut out).
"""
import math

from gymkit import (BW, DOOR_X0, DOOR_X1, IO, T, X0, E, R5, cl, door_px, emblem_level, lit, nz, rgb,
                    sphere_sculpt)

# ---------------------------------------------------------------- palette
CREAM = R5((250, 244, 222), (230, 220, 190), (200, 188, 160), (158, 148, 134), (112, 104, 110))
LEAF = R5((178, 230, 116), (118, 200, 90), (72, 162, 74), (46, 122, 66), (30, 84, 58))
DLEAF = R5((112, 176, 86), (74, 140, 72), (50, 108, 64), (34, 78, 56), (22, 52, 46))
TIMBER = R5((226, 176, 116), (192, 138, 86), (154, 102, 66), (112, 72, 54), (76, 48, 44))
GLASSG = R5((232, 252, 244), (186, 230, 220), (138, 198, 198), (98, 158, 176), (68, 114, 146))
STONEW = R5((214, 210, 190), (182, 178, 160), (146, 144, 132), (108, 108, 104), (74, 76, 80))
POT = R5((240, 156, 106), (212, 116, 78), (172, 84, 62), (128, 60, 54), (88, 42, 46))
PINK = [(255, 196, 222), (250, 140, 186), (214, 88, 146), (156, 56, 112)]
YELLOW = [(255, 246, 170), (255, 214, 92), (226, 160, 60)]
WHITE = [(255, 255, 246), (226, 228, 236)]
GLOW = E([(255, 250, 206), (255, 228, 140), (244, 186, 96), (204, 138, 70), (150, 96, 58)])
GLOWI = [rgb(c) for c in GLOW]
WATER = R5((206, 246, 244), (132, 214, 222), (84, 176, 204), (60, 136, 180), (44, 98, 150))
SOIL = R5((166, 120, 86), (134, 94, 70), (106, 72, 58), (78, 52, 48), (54, 36, 40))

NCX = 48                     # nave centre
NX0, NX1 = 22, 74            # nave span
SPRING, RISE = 34, 20        # nave arch spring line / rise (crest h = 54)
WD0, WD1 = 5, 28             # wing depth span
NIGHT_PANE = (150, 132, 84)


def _emis(c, night):
    return (c, True) if night else c


# ---------------------------------------------------------------- glass pane colour
def _plants(x, h, s=0):
    """Silhouette of potted palms / ferns standing behind the lower glass."""
    for px, top in ((7 + s, 17), (19 + s, 21), (33 + s, 15), (49 + s, 19), (63 + s, 16), (79 + s, 22),
                    (93 + s, 18), (105 + s, 15)):
        dx = x - px
        if h < top and abs(dx) <= 1 + (top - h) // 6:
            return True
        frond = top - 1 - abs(dx) * 0.55
        if abs(dx) < 7 and abs(h - frond) < 1.2 and h > 6:
            return True
    return False


def pane(x, h, night, hmax=40):
    if _plants(x, h):
        return DLEAF[3] if night else (DLEAF[2] if (x + h) % 5 else DLEAF[1])
    if night:
        return GLOW[1] if (x - h) % 11 in (0, 1) else GLOW[2] if h > 10 else GLOW[3]
    if (x - h) % 13 in (0, 1):
        return GLASSG[0]
    q = h / hmax
    return GLASSG[1] if q > 0.66 else GLASSG[2] if q > 0.25 else GLASSG[3]


def _vine(x, h, x0, top):
    """Climbing vine stem around x0 with alternating leaves, up to height top."""
    if h > top:
        return None
    sx = x0 + round(1.6 * math.sin(h * 0.33))
    if x == sx:
        return LEAF[3]
    k = h % 6
    side = 1 if (h // 6) % 2 else -1
    if k in (2, 3) and 0 < (x - sx) * side <= (2 if k == 2 else 3):
        return LEAF[1] if k == 2 else LEAF[2]
    if k == 4 and (x - sx) * side == 2 and (h // 6) % 3 == 0:
        return PINK[1]
    return None


# ---------------------------------------------------------------- exterior pieces
def wing_top(x):
    t = min(1.0, x / 24) if x < NCX else min(1.0, (BW - 1 - x) / 24)
    return 18 + 10 * math.sqrt(max(0.0, 1 - (1 - t) ** 2))


def wings(sc, th, night):
    def inside(x, d, h):
        if not (0 <= x < BW and WD0 <= d < WD1 and h >= 0):
            return False
        c = 7
        e = min(x, BW - 1 - x)
        if e < c and (d - WD0 < c - 1 - e or WD1 - 1 - d < c - 1 - e):
            return False
        return h < wing_top(x)

    def color(x, d, h, face):
        top = wing_top(x)
        if face == "top":
            if x % 6 == 0 or (d - WD0) % 10 == 0:
                return TIMBER[1] if x < NCX else TIMBER[2]
            if top - 19 < 1.5 or d >= WD1 - 2:                  # mossy eave
                return LEAF[2] if (x + d) % 3 else LEAF[1]
            if night:
                return (NIGHT_PANE, True) if (x + d) % 9 else (GLOWI[3], True)
            if (x - d) % 11 in (0, 1):
                return GLASSG[0]
            return GLASSG[1] if x < NCX else GLASSG[2]
        side = 0 if d == WD0 else (-1 if x < NCX else 1)
        edge = min(x, BW - 1 - x)
        v = _vine(x, h, 3 if x < NCX else BW - 4, 24) if edge < 7 else None
        if v:
            return v
        if h < 5:
            return STONEW[2 + (side > 0)] if (x // 5 + h // 2) % 2 else STONEW[1 + (side > 0)]
        if h in (5, 6):
            return TIMBER[1] if h == 6 else TIMBER[3]
        if h >= top - 2:
            return TIMBER[1] if side <= 0 else TIMBER[3]
        if h in (17, 18):
            return TIMBER[2] if side <= 0 else TIMBER[3]
        if x % 7 == 0:
            return TIMBER[2] if side <= 0 else TIMBER[3]
        c = pane(x, h - 2, night, 24)
        if side > 0 and not night and not isinstance(c[0], tuple):
            c = tuple(int(v * 0.82) for v in c)
        return c
    sc.sculpt(0, BW, WD0, WD1, 0, 29, inside, color, edge=TIMBER[4])


def nave_top(x):
    q = (x + 0.5 - NCX) / 26
    return SPRING + RISE * math.sqrt(max(0.0, 1 - q * q))


def nave(sc, th, t, night):
    def inside(x, d, h):
        if not (NX0 <= x < NX1 and 0 <= d < 30 and h >= 0):
            return False
        e = min(x - NX0, NX1 - 1 - x)
        if e < 6 and (d < 5 - e or 29 - d < 5 - e):
            return False
        return h < nave_top(x)

    def color(x, d, h, face):
        dx = x + 0.5 - NCX
        if face == "top":
            nx = dx / 26
            if x % 6 == 2 or d % 9 == 0:
                return TIMBER[0] if nx < -0.3 else TIMBER[1] if nx < 0.3 else TIMBER[2]
            if abs(dx) < 1:
                return TIMBER[0]
            if night:
                return (NIGHT_PANE, True) if (x + d) % 13 else (GLOWI[2], True)
            if (x - d) % 12 in (0, 1):
                return GLASSG[0]
            return GLASSG[1] if nx < -0.45 else GLASSG[2] if nx < 0.35 else GLASSG[3]
        side = 0 if d == 0 else (-1 if x < NCX else 1)
        if side:                                           # chamfered corners: vines on timber
            v = _vine(x, h, NX0 + 2 if x < NCX else NX1 - 3, 40)
            if v:
                return v
            if h < 5:
                return STONEW[2 if side < 0 else 3]
            return TIMBER[1] if side < 0 else TIMBER[3]
        if DOOR_X0 <= x < DOOR_X1 and h < 28:
            return door_px(th, x - DOOR_X0, h, t, night)
        top = nave_top(x)
        if h >= top - 2:                                   # arch rib
            return TIMBER[0] if h >= top - 1 else TIMBER[2]
        if h < 4:
            return STONEW[1] if (x // 6 + h // 2) % 2 else STONEW[2]
        if h in (4, 5):
            return TIMBER[3] if h == 4 else TIMBER[1]
        if SPRING - 3 <= h < SPRING:                       # spring beam
            return [TIMBER[3], TIMBER[1], TIMBER[0]][h - SPRING + 3]
        if h < SPRING:
            if x in (DOOR_X0 - 2, DOOR_X0 - 1, DOOR_X1, DOOR_X1 + 1) or (x - NX0) % 7 == 0:
                return TIMBER[1] if x < NCX else TIMBER[2]
            if h in (19, 20):
                return TIMBER[2]
            return pane(x, h - 4, night, 30)
        # radial fanlight
        a = math.atan2(h - SPRING + 0.5, dx)
        r = math.hypot(dx, h - SPRING + 0.5)
        if r < 4.5:
            return TIMBER[1]
        if abs(r - 12) < 0.9:
            return TIMBER[2]
        k = a * 8 / math.pi
        if abs(k - round(k)) < (0.5 / max(1.0, r) * 8 / math.pi * 1.6):
            return TIMBER[2]
        if night:
            return GLOW[0] if r < 10 else GLOW[1] if (x + h) % 7 else GLOW[0]
        if (x - h) % 10 in (0, 1):
            return GLASSG[0]
        return GLASSG[1] if r > 12 else GLASSG[2]
    sc.sculpt(NX0, NX1, 0, 30, 0, 55, inside, color, edge=TIMBER[4])


def cupola(sc, night):
    cx, cd, hb = NCX, 12, 49

    def inside(x, d, h):
        if h < hb:
            return False
        return ((x + 0.5 - cx) / 12) ** 2 + ((d - cd) / 6.5) ** 2 + ((h - hb) / 13) ** 2 < 1

    def color(x, d, h, face):
        dx = x + 0.5 - cx
        a = math.atan2(dx, (d - cd) * 1.8 + 0.01)
        k = a * 5 / math.pi
        if abs(k - round(k)) < 0.12 or (h - hb) in (5, 10):
            return TIMBER[0] if dx < -4 else TIMBER[1] if dx < 4 else TIMBER[2]
        if night:
            return GLOW[1] if (h - hb) > 9 else GLOW[2]
        if (dx - (h - hb)) % 9 in (0, 1) and dx < 2:
            return GLASSG[0]
        return lit(GLASSG[1:], dx / 12, (h - hb) / 13)
    sc.sculpt(cx - 13, cx + 14, cd - 7, cd + 7, hb, hb + 14, inside, color, edge=TIMBER[4])
    # leaf-bud finial
    sphere_sculpt(sc, [(cx, cd, hb + 16, 2.5)],
                  lambda x, d, h, f, b, nx, ny: (GLOW[0] if ny > 0 else GLOW[2]) if night
                  else (LEAF[0] if nx < 0 and ny > 0 else LEAF[2]), shadow=False, rd=0.8)


def great_tree(sc, night):
    def trunk_in(x, d, h):
        q = (h - 46) / 24
        r = 4 - 1.3 * q
        return ((x + 0.5 - NCX) / r) ** 2 + ((d - 24) / (r * 0.7)) ** 2 < 1

    def trunk_col(x, d, h, face):
        dx = x + 0.5 - NCX
        if face == "top":
            return TIMBER[2]
        if (x * 3 + h // 4) % 5 == 0:
            return TIMBER[4]
        return TIMBER[2] if dx < -1.5 else TIMBER[3] if dx < 2 else TIMBER[4]
    sc.sculpt(NCX - 5, NCX + 6, 20, 29, 46, 66, trunk_in, trunk_col)

    def leaf(x, d, h, face, b, nx, ny):
        n = cl(x, h + d, 7)
        if n > 236:
            c = PINK[0] if ny > 0.1 else PINK[1]
            return (c, True) if night and n > 246 else c
        if 228 < n <= 236 and ny > -0.3:
            return WHITE[0]
        base = lit(LEAF, nx, ny)
        i = LEAF.index(base)
        if n < 40:
            i = min(4, i + 1)
        elif n > 205:
            i = max(0, i - 1)
        return LEAF[i]
    sphere_sculpt(sc, [(48, 24, 68, 14), (30, 23, 61, 10.5), (66, 23, 61, 10.5), (38, 22, 73, 9.5),
                       (58, 22, 73, 9.5), (19, 25, 55, 7), (77, 25, 55, 7), (48, 21, 76, 8)], leaf, rd=0.5)


def planter(sc, x0, x1, night):
    def front(u, v, U, V):
        if v == V - 1:
            return CREAM[0]
        if v == V - 2:
            return LEAF[3] if u % 5 == 2 else CREAM[1]
        if v == 0:
            return STONEW[3]
        return CREAM[2] if (u // 6 + v // 3) % 2 else CREAM[1] if u != 0 else CREAM[1]
    sc.box(x0, x1, 0, 6, 0, 8, top=lambda u, v, U, V: SOIL[1] if (u + v) % 3 else SOIL[2],
           front=front, edge=STONEW[4])
    blobs = [(x0 + 3 + i * 5, 3, 10 + (i % 2), 3.6) for i in range((x1 - x0 - 2) // 5)]

    def fl(x, d, h, face, b, nx, ny):
        n = nz(x, h, 13)
        if n > 200 and ny > -0.4:
            col = (PINK, YELLOW, WHITE)[(x // 5) % 3]
            return col[0] if ny > 0.3 else col[1]
        return lit(LEAF, nx, ny)
    sphere_sculpt(sc, blobs, fl, rd=0.8)


def pergola(sc, night):
    for px in (27, 66):
        sc.box(px, px + 3, -10, -7, 0, 29, top=TIMBER[0],
               front=lambda u, v, U, V: TIMBER[1] if u == 0 else TIMBER[2] if u == 1 else TIMBER[3],
               edge=TIMBER[4])
        sc.box(px - 1, px + 4, -11, -6, 0, 3, top=STONEW[0],
               front=lambda u, v, U, V: STONEW[1] if u < 2 else STONEW[2], edge=STONEW[4])
    # knee braces (diagonal timber from post to awning)
    for px, sgn in ((30, 1), (65, -1)):
        def inside(x, d, h, px=px, sgn=sgn):
            k = (x - px) * sgn
            return -10 <= d < -8 and 0 <= k < 6 and abs((h - 22) - k) <= 1

        def col(x, d, h, face):
            return TIMBER[0] if face == "top" else TIMBER[2]
        sc.sculpt(min(px, px - 6 * (sgn < 0)) - 1, max(px, px + 6) + 1, -10, -8, 20, 29, inside, col, shadow=False)


def leaf_awning(sc, night):
    def half(d):
        t = (-d) / 12.0
        return 24 * math.sin(math.pi * min(1.0, 0.12 + t * 0.88)) ** 0.8 * (1 - 0.15 * t)

    def inside(x, d, h):
        if not (-12 <= d < 2 and 28 <= h < 31):
            return False
        dx = abs(x + 0.5 - NCX)
        droop = 1 if dx > half(d) - 4 else 0
        return dx < half(d) and h < 31 - droop

    def color(x, d, h, face):
        dx = x + 0.5 - NCX
        if face == "top":
            if abs(dx) < 1:
                return LEAF[0]
            vein = (abs(dx) * 0.9 + d * 0.9) % 6
            if vein < 1:
                return LEAF[1] if dx < 0 else LEAF[2]
            if abs(dx) > half(d) - 2:
                return LEAF[3]
            return LEAF[1] if dx < -8 else LEAF[2]
        return LEAF[3] if dx < 0 else LEAF[4]
    sc.sculpt(NCX - 26, NCX + 27, -12, 2, 28, 31, inside, color, edge=DLEAF[4])
    # leaf stem curling over the door frame
    sc.box(NCX - 1, NCX + 1, 0, 2, 31, 34, top=LEAF[1], front=LEAF[2], edge=None)


GREENGLOW = E([(232, 255, 196), (178, 240, 128), (110, 206, 96)])


def leaf_medallion(sc, night, cx=NCX, hc=44, r=9):
    """Round timber-rimmed medallion in the fanlight with the leaf emblem (glows green at night)."""
    def inside(x, d, h):
        return -2 <= d < 0 and (x + 0.5 - cx) ** 2 + (h + 0.5 - hc) ** 2 < r * r

    def color(x, d, h, face):
        u, v = x + 0.5 - cx, h + 0.5 - hc
        rr = math.hypot(u, v)
        if face == "top" or rr > r - 1.6:
            return TIMBER[0] if u + v < -3 else TIMBER[1] if u + v < 3 else TIMBER[2]
        lv = emblem_level("leaf", u * 1.45, v * 1.45 + 9.5)
        if lv == 3:
            return GREENGLOW[0] if night else LEAF[0]
        if lv == 2:
            return GREENGLOW[1] if night else LEAF[1]
        if lv == 1:
            return GREENGLOW[2] if night else LEAF[2]
        return CREAM[1] if u + v < 0 else CREAM[2]
    sc.sculpt(cx - r - 1, cx + r + 2, -2, 0, hc - r - 1, hc + r + 2, inside, color, shadow=False, edge=TIMBER[4])


def lantern(sc, cx, cd, hb, night):
    sc.box(cx, cx + 1, cd, cd + 1, hb + 6, 28, top=TIMBER[3], front=TIMBER[3], shadow=False)
    sc.box(cx - 2, cx + 3, cd - 1, cd + 2, hb + 5, hb + 7, top=TIMBER[1], front=TIMBER[2], edge=TIMBER[4])

    def front(u, v, U, V):
        if u in (0, U - 1):
            return TIMBER[2]
        if night:
            return GLOW[0] if v > 1 else GLOW[1]
        return YELLOW[1] if v > 1 else YELLOW[2]
    sc.box(cx - 2, cx + 3, cd - 1, cd + 2, hb + 1, hb + 5, top=TIMBER[1], front=front, edge=TIMBER[4])
    sc.box(cx - 1, cx + 2, cd - 1, cd + 1, hb, hb + 1, top=TIMBER[2], front=TIMBER[3])


def topiary(sc, cx, night):
    cd = -4
    sc.box(cx - 5, cx + 6, cd - 4, cd + 4, 0, 8, top=SOIL[2],
           front=lambda u, v, U, V: POT[0] if v == V - 1 else POT[1] if v >= V - 3 else
           (POT[2] if u < U - 3 else POT[3]) if v > 0 else POT[4], edge=POT[4])
    sc.box(cx, cx + 1, cd, cd + 1, 8, 30, top=TIMBER[2], front=TIMBER[3], shadow=False)

    def ball(x, d, h, face, b, nx, ny):
        swirl = (h + round(3 * math.sin((x - cx) * 0.6))) % 5 == 0
        c = lit(LEAF, nx, ny)
        return DLEAF[2] if swirl and ny < 0.5 else c
    sphere_sculpt(sc, [(cx, cd, 15, 6.5)], ball, rd=0.8)
    sphere_sculpt(sc, [(cx, cd, 25, 4.8)], ball, rd=0.8)
    # glowing bud lantern on the tip
    sphere_sculpt(sc, [(cx, cd, 33, 3)],
                  lambda x, d, h, f, b, nx, ny: ((GLOW[0] if ny > 0 else GLOW[1]) if night else
                                                 (PINK[0] if nx < 0 and ny > 0 else PINK[1])),
                  shadow=False, rd=0.8)
    for sx in (-1, 1):
        sc.box(cx + sx * 3, cx + sx * 3 + 1, cd, cd + 1, 30, 32, top=LEAF[1], front=LEAF[2], shadow=False)


def exterior(sc, th, t, night):
    wings(sc, th, night)
    nave(sc, th, t, night)
    great_tree(sc, night)
    cupola(sc, night)
    planter(sc, 2, 21, night)
    planter(sc, 75, 94, night)
    pergola(sc, night)
    leaf_awning(sc, night)
    lantern(sc, 32, -9, 19, night)
    lantern(sc, 64, -9, 19, night)
    leaf_medallion(sc, night)
    topiary(sc, -8, night)
    topiary(sc, BW + 8, night)


def sparks(sc, th, night):
    if night:
        for i, (ex, ey) in enumerate(((-5, 73), (14, 44), (34, 18), (75, 26), (94, 63), (106, 80),
                                      (84, 41), (1, 86), (62, 10))):
            sc.put(X0 + ex, ey, GLOW[0] if i % 2 else ((200, 255, 140), True))
    else:
        for i, (ex, ey) in enumerate(((10, 37), (86, 34), (26, 19), (72, 15), (-4, 63), (101, 57))):
            sc.put(X0 + ex, ey, PINK[0] if i % 2 else PINK[1])


# ---------------------------------------------------------------- interior tiles
def _wrapd(x, y, cx, cy):
    dx = min(abs(x - cx), T - abs(x - cx))
    dy = min(abs(y - cy), T - abs(y - cy))
    sx = (x - cx) if abs(x - cx) <= T / 2 else (x - cx) - math.copysign(T, x - cx)
    sy = (y - cy) if abs(y - cy) <= T / 2 else (y - cy) - math.copysign(T, y - cy)
    return dx * dx + dy * dy, sx, sy


CLUSTERS = ((3, 4), (11, 3), (7, 10), (14, 11), (1, 12))


def leafy(x, y, R, clusters=CLUSTERS, rad=3.6):
    """Exact-repeating 16 px leaf-cluster texture: highlight top-left of each cluster."""
    best = None
    for cx, cy in clusters:
        dd, sx, sy = _wrapd(x, y, cx, cy)
        if dd < rad * rad and (best is None or dd < best[0]):
            best = (dd, sx, sy)
    if best is None:
        return R[3]
    dd, sx, sy = best
    if sx + sy < -2.5 and dd > 2:
        return R[0]
    if sx + sy > 2.5:
        return R[2]
    return R[1]


GRASS = R5((170, 226, 118), (134, 204, 98), (110, 182, 86), (84, 150, 74), (60, 114, 64))
PLANK = R5((232, 194, 136), (206, 160, 104), (176, 128, 82), (134, 92, 64), (92, 62, 52))
TUFTS = {(3, 4): 3, (4, 3): 0, (5, 4): 3, (11, 11): 3, (12, 10): 0, (13, 11): 3, (9, 2): 0, (1, 9): 0,
         (2, 10): 3, (14, 5): 0}


def grass_px(gx, gy):
    x, y = gx % T, gy % T
    k = TUFTS.get((x, y))
    if k is not None:
        return GRASS[k]
    return GRASS[1] if (x // 8 + y // 8) % 2 else GRASS[2] if (x + y) % 16 == 7 else GRASS[1]


def plank_px(gx, gy):
    x, y = gx % T, gy % T
    row = y // 4
    seam = (x + row * 6) % 16 == 0
    if y % 4 == 3 or seam:
        return PLANK[3]
    if y % 4 == 0:
        return PLANK[0]
    if (x, y % 4) in ((3, 1), (13, 2)) and row % 2 == 0:
        return PLANK[3]
    return PLANK[1] if (x + row) % 9 else PLANK[2]


def water_px(gx, gy):
    x, y = gx % T, gy % T
    a = 2 * math.pi / T
    v = math.sin(a * x + 1.4 * math.sin(a * y)) + 0.5 * math.sin(2 * a * y)
    return WATER[1] if v > 1.2 else WATER[2] if v > -0.4 else WATER[3]


def void_px(gx, gy):
    x, y = gx % T, gy % T
    return leafy((x + 5) % T, (y + 3) % T, DLEAF[1:], clusters=((2, 3), (10, 6), (6, 12), (13, 14)), rad=4.2)


def tile_floor(ctx, c, r):
    two = ctx.floor["name"] == "2F"
    ctx.fill(c, r, plank_px if two else grass_px)
    X, Y, p = c * T, r * T, ctx.p
    n = ctx.g(c, r - 1)
    if n in "#hYf" or (n == "B" and not two):
        for x in range(T):
            p[X + x, Y] = (GRASS[4] if not two else PLANK[4])
            p[X + x, Y + 1] = (GRASS[3] if not two else PLANK[3])


def tile_stones(ctx, c, r):
    tile_floor(ctx, c, r)
    X, Y = c * T, r * T
    for (x0, y0, x1, y1) in ((1, 2, 8, 7), (8, 9, 14, 14)):
        ctx.d.ellipse([X + x0, Y + y0, X + x1, Y + y1], fill=STONEW[1], outline=STONEW[4])
        ctx.d.line([X + x0 + 2, Y + y0 + 1, X + x1 - 2, Y + y0 + 1], fill=STONEW[0])
        ctx.d.line([X + x0 + 2, Y + y1 - 1, X + x1 - 2, Y + y1 - 1], fill=STONEW[2])


def _block(ctx, c, r, solid, top_fn, face_fn, fh=6):
    X, Y, p = c * T, r * T, ctx.p
    me = ctx.g(c, r)
    south_open = ctx.g(c, r + 1) not in solid
    f = fh if south_open else 0
    for y in range(T):
        for x in range(T):
            if y >= T - f:
                col = IO if y == T - 1 else face_fn(X + x, y - (T - f), f)
            else:
                col = top_fn(X + x, Y + y)
            p[X + x, Y + y] = col
    for dc, dr in ((1, 0), (-1, 0), (0, -1), (0, 1)):
        nb = ctx.g(c + dc, r + dr)
        if nb not in solid and not (nb == "O" and dr == -1):
            for i in range(T):
                if dc:
                    p[X + (T - 1 if dc > 0 else 0), Y + i] = IO
                elif dr < 0:
                    p[X + i, Y] = IO
                    p[X + i, Y + 1] = ctx.th["_hl"]
    return me


def tile_rim(ctx, c, r):
    if ctx.floor["name"] == "2F":                      # canopy foliage wall
        ctx.th["_hl"] = LEAF[0]
        _block(ctx, c, r, "#", lambda gx, gy: leafy(gx % T, gy % T, LEAF),
               lambda gx, v, f: DLEAF[2] if (gx + v) % 4 else DLEAF[3], fh=5)
        return
    ctx.th["_hl"] = TIMBER[0]

    def top(gx, gy):
        x, y = gx % T, gy % T
        if y in (0, 15) or x == 0:
            return TIMBER[0] if y == 0 or x == 0 else TIMBER[3]
        if y in (5, 10):
            return TIMBER[3]
        return CREAM[1] if (x + (y // 5) * 5) % 8 else CREAM[2]

    def face(gx, v, f):                                # inner glass wall of the conservatory
        if v == 0:
            return TIMBER[2]
        if gx % 8 == 0:
            return TIMBER[3]
        if (gx - v) % 6 == 0:
            return GLASSG[0]
        return GLASSG[2] if v < 3 else GLASSG[3]
    _block(ctx, c, r, "#O", top, face, fh=7)


def tile_hedge(ctx, c, r):
    ctx.th["_hl"] = LEAF[0]
    solid = "h"

    def top(gx, gy):
        x, y = gx % T, gy % T
        if (x, y) in ((6, 6), (12, 13), (2, 1)):
            return PINK[1]
        if (x, y) in ((5, 6), (6, 5), (11, 13)):
            return PINK[0]
        if (x, y) in ((9, 8), (15, 2), (3, 14)):
            return TIMBER[4]                           # thorns
        return leafy(x, y, LEAF)

    def face(gx, v, f):
        if v == 0:
            return DLEAF[1]
        if (gx + v * 3) % 7 == 0:
            return TIMBER[4]
        return DLEAF[2] if (gx // 3 + v) % 3 else DLEAF[3]
    _block(ctx, c, r, solid, top, face, fh=6)


def tile_bed(ctx, c, r):
    X, Y, p = c * T, r * T, ctx.p
    south = ctx.g(c, r + 1) != "f"
    cols = (PINK, YELLOW, WHITE)[(c + r) % 3]
    for y in range(T):
        for x in range(T):
            if south and y >= 13:
                col = IO if y == 15 else CREAM[2] if y == 13 else CREAM[3]
            else:
                col = SOIL[1] if (x + y) % 4 else SOIL[2]
                fx, fy = x % 5, y % 5
                if (fx, fy) in ((2, 1), (1, 2), (3, 2), (2, 3)):
                    col = cols[1]
                elif (fx, fy) == (2, 2):
                    col = YELLOW[0] if cols is not YELLOW else WHITE[0]
                elif (fx, fy) in ((0, 4), (4, 0)):
                    col = LEAF[2]
            p[X + x, Y + y] = col
    for dc, dr in ((1, 0), (-1, 0), (0, -1)):
        if ctx.g(c + dc, r + dr) != "f":
            for i in range(T):
                if dc:
                    xx = X + (T - 1 if dc > 0 else 0)
                    p[xx, Y + i] = IO
                    p[xx - dc, Y + i] = CREAM[1]
                else:
                    p[X + i, Y] = IO
                    p[X + i, Y + 1] = CREAM[0]


def tile_sunk(ctx, c, r):
    """Pond (1F) / leafy void below the canopy (2F): far-edge face of the bank or platform."""
    two = ctx.floor["name"] == "2F"
    pxf = void_px if two else water_px
    RIM = DLEAF if two else WATER
    X, Y, p = c * T, r * T, ctx.p
    for y in range(T):
        for x in range(T):
            p[X + x, Y + y] = pxf(X + x, Y + y)
    if not two and ctx.g(c, r) == "~" and (c * 7 + r * 3) % 5 == 0:
        ctx.d.ellipse([X + 4, Y + 7, X + 12, Y + 12], fill=LEAF[2], outline=DLEAF[3])
        ctx.d.line([X + 8, Y + 9, X + 12, Y + 9], fill=WATER[3])
        if (c + r) % 2:
            ctx.d.point([(X + 6, Y + 8), (X + 7, Y + 8)], fill=PINK[0])
            ctx.d.point([(X + 6, Y + 9)], fill=PINK[1])
    sunk = "~|="
    top = 0
    if ctx.g(c, r - 1) not in sunk + "#":
        for x in range(T):
            gx = X + x
            for y in range(0, 5):
                if two:
                    col = PLANK[2] if y == 0 else (PLANK[4] if (gx % 8) == 0 else PLANK[3])
                else:
                    col = GRASS[3] if y == 0 else STONEW[2] if (gx // 4 + y) % 2 else STONEW[3]
                p[gx, Y + y] = col
            p[gx, Y + 5] = IO
            p[gx, Y + 6] = RIM[3] if not two else DLEAF[4]
        top = 6
    for dc in (-1, 1):
        if ctx.g(c + dc, r) not in sunk:
            xx = X + (0 if dc < 0 else T - 1)
            for y in range(top, T):
                p[xx, Y + y] = IO
                if not two and y > top:
                    p[xx - dc, Y + y] = WATER[0]
    if ctx.g(c, r + 1) not in sunk:
        for x in range(T):
            p[X + x, Y + T - 1] = IO
            if not two:
                p[X + x, Y + T - 2] = WATER[0]


def tile_bridge(ctx, c, r):
    tile_sunk(ctx, c, r)
    two = ctx.floor["name"] == "2F"
    horiz = ctx.g(c, r) == "="
    X, Y, p = c * T, r * T, ctx.p
    for y in range(T):
        for x in range(T):
            u, v = (y, x) if horiz else (x, y)
            if two:
                if u in (1, 14):
                    col = IO
                elif u in (2, 13):
                    col = TIMBER[0] if v % 4 else TIMBER[3]        # rope rails with knots
                elif 4 <= u <= 11 and v % 4 != 3:
                    col = PLANK[0] if v % 4 == 0 else PLANK[1] if u < 10 else PLANK[2]
                elif 4 <= u <= 11:
                    col = IO
                else:
                    continue
            else:
                if u in (1, 14):
                    col = IO
                elif u in (2, 13):
                    col = TIMBER[3]
                elif 3 <= u <= 12:
                    col = PLANK[3] if v % 4 == 3 else PLANK[0] if v % 4 == 0 else PLANK[1]
                else:
                    continue
            p[X + x, Y + y] = col


def tile_hole(ctx, c, r):
    tile_floor(ctx, c, r)
    X, Y, d = c * T, r * T, ctx.d
    d.ellipse([X + 2, Y + 3, X + 13, Y + 13], fill=DLEAF[3], outline=IO)
    d.ellipse([X + 4, Y + 7, X + 11, Y + 12], fill=DLEAF[4])
    for y in range(0, 12):                              # vine rope tied to the rail, hanging down
        xx = X + 8 + (1 if (y // 3) % 2 else 0)
        ctx.p[xx, Y + y] = LEAF[3]
        if y % 4 == 1:
            ctx.p[xx - 1, Y + y] = LEAF[1]
            ctx.p[xx + 1, Y + y + 1] = LEAF[2]


def tile_dais(ctx, c, r):
    tile_floor(ctx, c, r)
    X, Y, p = c * T, r * T, ctx.p
    pair = ctx.g(c + 1, r) == "K"
    if not pair:
        return
    d = ctx.d
    d.ellipse([X + 1, Y + 1, X + 30, Y + 15], fill=TIMBER[3], outline=IO)
    d.ellipse([X + 1, Y, X + 30, Y + 12], fill=LEAF[2], outline=IO)
    d.ellipse([X + 4, Y + 2, X + 27, Y + 10], fill=LEAF[1])
    for i, fx in enumerate((3, 9, 16, 22, 27)):
        fy = 2 if i % 2 else 9
        d.point([(X + fx, Y + fy), (X + fx + 1, Y + fy), (X + fx, Y + fy + 1)], fill=PINK[i % 2])


def tile_none(ctx, c, r):
    tile_floor(ctx, c, r)


def decor(ctx):
    d, p = ctx.d, ctx.p
    two = ctx.floor["name"] == "2F"
    done = False
    for r in range(ctx.h):
        for c in range(ctx.w):
            ch = ctx.g(c, r)
            x, y = c * T, r * T
            if ch == "B" and not two:                  # spiral topiary in a terracotta pot
                d.rectangle([x + 3, y + 8, x + 12, y + 15], fill=POT[2], outline=IO)
                d.line([x + 4, y + 9, x + 11, y + 9], fill=POT[0])
                d.line([x + 4, y + 10, x + 11, y + 10], fill=POT[1])
                d.ellipse([x + 1, y - 4, x + 14, y + 9], fill=LEAF[2], outline=IO)
                d.ellipse([x + 3, y - 3, x + 10, y + 4], fill=LEAF[1])
                d.ellipse([x + 4, y - 2, x + 7, y + 1], fill=LEAF[0])
                d.arc([x + 3, y - 1, x + 12, y + 7], 20, 160, fill=DLEAF[3])
                d.ellipse([x + 4, y - 11, x + 11, y - 3], fill=LEAF[2], outline=IO)
                d.point([(x + 6, y - 9), (x + 7, y - 9), (x + 6, y - 8)], fill=LEAF[0])
                d.point([(x + 7, y - 12), (x + 8, y - 12)], fill=PINK[1])
            elif ch == "B" and two:                    # lantern post on the platform
                tile_floor(ctx, c, r)
                d.rectangle([x + 6, y - 2, x + 9, y + 14], fill=TIMBER[2], outline=IO)
                d.line([x + 7, y - 1, x + 7, y + 13], fill=TIMBER[0])
                d.rectangle([x + 3, y - 10, x + 12, y - 2], fill=GLOWI[1], outline=IO)
                d.rectangle([x + 5, y - 8, x + 10, y - 4], fill=GLOWI[0])
                d.line([x + 2, y - 11, x + 13, y - 11], fill=TIMBER[3])
            elif ch == "Y" and not done:
                done = True
                w = sum(1 for k in range(c, ctx.w) if ctx.g(k, r) == "Y")
                hh = sum(1 for k in range(r, ctx.h) if ctx.g(c, k) == "Y")
                _trunk(ctx, x, y, w * T, hh * T, two)


def _trunk(ctx, x, y, W, H, two):
    d, p = ctx.d, ctx.p
    if two:
        # branches out over the leafy void
        for (bx, by, ex, ey) in ((x + 4, y + 10, x - 22, y - 8), (x + W - 4, y + 12, x + W + 22, y - 6),
                                 (x + W // 2, y + 4, x + W // 2 + 6, y - 14)):
            d.line([bx, by, ex, ey], fill=IO, width=5)
            d.line([bx, by, ex, ey], fill=TIMBER[3], width=3)
            d.line([bx, by - 1, ex, ey - 1], fill=TIMBER[1], width=1)
            d.ellipse([ex - 6, ey - 5, ex + 6, ey + 5], fill=LEAF[2], outline=IO)
            d.ellipse([ex - 4, ey - 4, ex + 2, ey + 1], fill=LEAF[1])
            d.point([(ex + 2, ey - 2)], fill=PINK[1])
    # bark column with a short south face, roots flaring onto the floor
    d.ellipse([x - 4, y + H - 10, x + W + 3, y + H + 4], fill=TIMBER[3], outline=IO)
    d.rectangle([x + 2, y + 6, x + W - 3, y + H - 2], fill=TIMBER[2], outline=IO)
    for i in range(x + 5, x + W - 4, 5):
        d.line([i, y + 10, i + (1 if (i // 5) % 2 else -1), y + H - 3], fill=TIMBER[3])
        d.line([i + 1, y + 10, i + 1, y + H - 6], fill=TIMBER[1])
    # leafy cap: the lower boughs of the great tree hide where the trunk rises through the ceiling
    blobs = [(x + W // 2, y + 4, W // 2 + 4, 10)] + [(x + i, y + 9, 8, 6) for i in range(2, W, 10)]
    for bx, by, rx, ry in blobs:
        d.ellipse([bx - rx, by - ry, bx + rx, by + ry], fill=LEAF[3], outline=IO)
    for bx, by, rx, ry in blobs:
        d.ellipse([bx - rx + 2, by - ry + 1, bx + rx - 2, by + ry - 3], fill=LEAF[2])
        d.ellipse([bx - rx + 3, by - ry + 2, bx - 1, by - 1], fill=LEAF[1])
        d.point([(bx - rx // 2, by - ry // 2)], fill=LEAF[0])
    for i, (fx, fy) in enumerate(((x + 6, y + 2), (x + W - 9, y + 5), (x + W // 2, y - 3), (x + 14, y + 10))):
        d.point([(fx, fy), (fx + 1, fy), (fx, fy + 1), (fx + 1, fy + 1)], fill=PINK[i % 2])
    if not two:
        for rx, sgn in ((x - 2, -1), (x + W + 1, 1)):
            d.line([rx, y + H - 3, rx + sgn * 8, y + H + 2], fill=IO, width=4)
            d.line([rx, y + H - 3, rx + sgn * 8, y + H + 2], fill=TIMBER[2], width=2)


# ---------------------------------------------------------------- THEME
THEME = dict(
    name="Grass-Type Gym", archetype="Canopy Conservatory",
    wall=CREAM, accent=LEAF, trim=TIMBER, rock=STONEW, deck=DLEAF, glow=GLOW,
    emblem="leaf", door_spill=(170, 210, 120), door_inside=(46, 74, 44),
    exterior=exterior, sparks=sparks,
    night_lights=[X0 - 8, X0 + BW + 8, X0 + 32, X0 + 64],
    floor=PLANK, floor_px=grass_px, hazard_px=water_px,
    hazard_ramp=WATER, ledge=STONEW, outside=R5((150, 206, 104), (120, 188, 90), (98, 166, 80),
                                                 (78, 138, 70), (58, 106, 60)),
    stair_ramp=[PLANK[0], PLANK[1], PLANK[2]],
    raised="hY",
    walk_extra=":",
    tiles={"#": tile_rim, ".": tile_floor, "T": tile_floor, ":": tile_stones, "h": tile_hedge,
           "f": tile_bed, "~": tile_sunk, "|": tile_bridge, "=": tile_bridge, "H": tile_hole,
           "K": tile_dais, "B": tile_none, "Y": tile_none},
    decor=decor,
    legend_extra={"h": "thorn-rose hedge (blocked)", "f": "flower bed (blocked)", ":": "stepping stones",
                  "Y": "great tree trunk (blocked)", "~": "1F lily pond / 2F leafy void (blocked)",
                  "B": "1F topiary pot / 2F lantern post (blocked)", "H": "vine drop to 1F (one-way)"},
    floors=[
        dict(name="1F", grid=[
            "OOOOOOOOOOOOOOOOOO",   # 0
            "##################",   # 1
            "#ff...hYYYYh...ff#",   # 2  great trunk court
            "#f....hYYYYh....f#",   # 3
            "#B...:::UU::::T.B#",   # 4  spiral stairs UP around the trunk; T3 guards the gap landing
            "#hhhhhhhhhhhh:hhh#",   # 5  thorn hedge, gap right
            "#ff::::::::::::.f#",   # 6
            "#..:.ffhhhhff.:..#",   # 7
            "#.B:.ff~~~~ff.:B.#",   # 8  little lily pool parterre
            "#..:T......::..ff#",   # 9  T2 guards the footbridge landing
            "#~~|~~~~~~~~~~~~~#",   # 10 lily pond, footbridge left
            "#~~|~~~~~~~~~~~~~#",   # 11
            "#..:::::::::::...#",   # 12
            "#ff.B.ff....T:.ff#",   # 13 T1 guards the hedge gap landing
            "#hhhhhhhhhhhh:hhh#",   # 14 thorn hedge, gap right
            "#B.ff.......:::.B#",   # 15
            "#...ff..::::.ff..#",   # 16
            "#B......::......B#",   # 17
            "########MM########",   # 18
            "OOOOOOOOOOOOOOOOOO"],  # 19
             trainers=[(12, 13, "right", 1), (4, 9, "left", 1), (14, 4, "left", 1)]),
        dict(name="2F", grid=[
            "################",     # 0  canopy foliage
            "#~~~~~.KK.~~~~~#",     # 1  leader on the crown platform
            "#~~~~~....~~~~~#",     # 2
            "#~~~~~~~~|~~~~~#",     # 3  rope bridge N-S
            "#~~~~~~~~|~~~~~#",     # 4
            "#~...====.T.~~~#",     # 5  rope bridge E-W; T5 guards the junction (9,5)
            "#~...~~~~...~~~#",     # 6
            "#~B.T~~~~~~~~~~#",     # 7  T4 guards the bridge landing (3,7)
            "#~~|~~~~~~~~~~~#",     # 8
            "#~~|~~.YY.~~~~~#",     # 9  great trunk
            "#~~|~..YY..~~~~#",     # 10
            "#~~....DD...H~~#",     # 11 stairs DOWN to 1F; vine drop
            "#~~~~B.....B~~~#",     # 12
            "#~~~~~~~~~~~~~~#",     # 13
            "################"],    # 14
             trainers=[(4, 7, "left", 1), (10, 5, "left", 1)]),
    ],
    links=[dict(type="stairs", a=("1F", 8, 4), b=("2F", 7, 11)),
           dict(type="stairs", a=("1F", 9, 4), b=("2F", 8, 11)),
           dict(type="hole", a=("2F", 12, 11), b=("1F", 6, 16))],
    leader=("2F", 7, 1, "down"),
)
