"""Psychic-Type Gym: Observatory Temple (sanctum).

Exterior: a classical temple. Three-step marble stylobate (split by the ground-level door bay), a
front colonnade of fluted columns before a recessed lavender cella with tall stained-glass lancets,
a heavy entablature (architrave, triglyph frieze with star metopes, dentil cornice) and a front
pediment holding the eye medallion. Crown: a ribbed observatory dome on a drum with a glowing lens
slot and a brass telescope, under a floating halo ring and three orbs. Props: crystal orbs hovering
over slim obelisks. Interior: 1F sanctum of marble islands over a starry void, joined only by
two-way WARP PADS (two decoys); stairs up to the 2F observatory, where a warp and a light bridge
lead to the leader's dais under a star map.
"""
import math

from gymkit import (BW, DOOR_X0, DOOR_X1, IO, T, X0, E, R5, chamfer_inside, emblem_level, facade, lit, rgb,
                    sphere_sculpt, t_floor, t_rim)

MARBLE = R5((250, 246, 255), (230, 224, 246), (202, 194, 230), (164, 152, 204), (120, 108, 168))
CELLA = R5((214, 192, 242), (190, 166, 228), (164, 138, 210), (130, 106, 182), (96, 76, 148))
PLUM = R5((240, 156, 218), (212, 108, 194), (172, 72, 168), (126, 50, 138), (84, 34, 102))
GOLD = R5((255, 236, 156), (238, 198, 102), (202, 152, 72), (152, 106, 62), (102, 70, 56))
DOMER = R5((238, 234, 252), (210, 204, 238), (174, 166, 216), (136, 126, 188), (98, 88, 150))
DECK = R5((158, 128, 186), (134, 104, 166), (110, 84, 146), (86, 64, 120), (62, 46, 94))
GLOW = E([(255, 238, 252), (255, 178, 234), (238, 118, 210), (186, 78, 182), (128, 52, 144)])
GL = [rgb(c) for c in GLOW]
CYAN = E([(232, 252, 255), (150, 226, 255), (96, 170, 240)])
WIN_GLOW = [((255, 200, 240), True), ((200, 146, 255), True), ((150, 100, 230), True)]

CX, CD = 48, 14            # dome centre
DRUM0, DRUM1 = 48, 54      # drum heights (dome springs from DRUM1)
DR, DH = 28, 24            # dome radius / height
COLS = (3, 13, 24, 72, 83, 93)
WINDOWS = [("stained", 6, 11, 11, 30), ("stained", 16, 21, 11, 30),
           ("stained", 75, 80, 11, 30), ("stained", 85, 90, 11, 30)]


# ---------------------------------------------------------------- emblem: third eye with rays
def psy_eye(u, v):
    au = abs(u)
    lv = emblem_level("eye", u, v)
    if lv:
        return lv
    if v >= 17 and au < 1.2:                       # top ray
        return 1
    if v >= 15.5 and abs(au - 8) < 1.1 and v <= 18:  # side rays
        return 1
    if v <= 2 and au < 1.2:                        # bottom ray
        return 1
    return 0


# ---------------------------------------------------------------- exterior parts
def fluted(sc, cx, cd, h0, h1, r=3):
    """Fluted marble column with a torus base and a gold-banded capital."""
    sc.box(cx - 4, cx + 5, cd - 4, cd + 3, h0, h0 + 2, top=MARBLE[0],
           front=lambda u, v, U, V: MARBLE[1] if v == 1 else MARBLE[3], edge=MARBLE[4])

    def inside(x, d, h):
        return ((x - cx) / r) ** 2 + ((d - cd) / (r * 0.8)) ** 2 < 1

    def color(x, d, h, face):
        dx = x - cx
        if face == "top":
            return MARBLE[0]
        if dx in (-2, 0, 2):                     # flute grooves
            return MARBLE[2] if dx < 0 else MARBLE[3]
        return MARBLE[0] if dx < -1 else MARBLE[1] if dx < 2 else MARBLE[3]
    sc.sculpt(cx - r - 1, cx + r + 2, cd - r, cd + r + 1, h0 + 2, h1 - 3, inside, color, edge=MARBLE[4])
    sc.box(cx - 4, cx + 5, cd - 4, cd + 3, h1 - 3, h1 - 1, top=GOLD[1],
           front=lambda u, v, U, V: GOLD[1] if v else GOLD[3], edge=GOLD[4])
    sc.box(cx - 5, cx + 6, cd - 5, cd + 3, h1 - 1, h1, top=MARBLE[0], front=MARBLE[1], edge=MARBLE[4])


def stylobate(sc):
    """Three marble steps on both sides of the ground-level door bay."""
    steps = [(-6, 30, -12, 0, 3), (-3, 29, -9, 3, 6), (0, 28, -6, 6, 9)]

    def front(u, v, U, V):
        return MARBLE[1] if v == V - 1 else MARBLE[3] if v == 0 else MARBLE[2]

    def top(u, v, U, V):
        return MARBLE[0] if v == 0 else MARBLE[1]
    for (a, b, d0, h0, h1) in steps:
        for (x0, x1) in ((a, b), (BW - b, BW - a)):
            sc.box(x0, x1, d0, 2, h0, h1, top=top, front=front, edge=MARBLE[4])


def cella(sc, th, t, night):
    def extra(x, d, h, face):
        if face != "front":
            return None
        # door pilasters (gold-capped marble jambs)
        if DOOR_X0 - 4 <= x < DOOR_X0 or DOOR_X1 <= x < DOOR_X1 + 4:
            if h >= 26:
                return GOLD[1] if h == 27 else GOLD[2]
            left = x < DOOR_X0
            u = x - (DOOR_X0 - 4 if left else DOOR_X1)
            return MARBLE[1] if u == 0 else MARBLE[3] if u == 3 else MARBLE[2]
        # vertical pilaster strips between windows (behind the columns)
        if x in (0, 1, BW - 2, BW - 1):
            return CELLA[1] if x < BW // 2 else CELLA[3]
        return None
    sc.sculpt(0, BW, 2, 28, 0, 38, lambda x, d, h: True,
              facade(th, t, night, top=38, bands=((34, 35),), pattern="marble", windows=WINDOWS,
                     plinth=0, ramp=CELLA, extra=extra))


def door_hood(sc, night):
    """Arched lintel over the door with a crescent moon motif."""
    def inside(x, d, h):
        u = x - 48
        if not (-18 <= u <= 17 and -2 <= d < 2):
            return False
        if h < 28:
            return False
        return h < 31 or (u + 0.5) ** 2 / 18.5 ** 2 + ((h - 31) / 6) ** 2 < 1

    def color(x, d, h, face):
        u = x - 47.5
        if face == "top":
            return PLUM[0]
        # crescent moon
        m1 = u * u + (h - 32) ** 2
        m2 = (u - 1.6) ** 2 + (h - 32.8) ** 2
        if m1 < 12 and m2 >= 8:
            return GLOW[0] if u < 0 else GLOW[1]
        if h == 28:
            return PLUM[4]
        if (u * u) / 18 ** 2 + ((h - 31) / 5.5) ** 2 >= 0.8 and h >= 31:
            return GOLD[1] if u < 0 else GOLD[2]
        return PLUM[2] if h > 29 else PLUM[3]
    sc.sculpt(28, 68, -2, 2, 28, 38, inside, color, shadow=False, edge=PLUM[4])


def entablature(sc, night):
    def arch_col(x, d, h, face):
        if face == "top":
            return MARBLE[1]
        if d > -6:
            return MARBLE[2] if x < BW // 2 else MARBLE[4]
        if h <= 40:                                 # architrave with two fasciae
            return MARBLE[3] if h == 38 else MARBLE[1] if h == 40 else MARBLE[2]
        # frieze: gold triglyphs + plum metopes with tiny stars
        m = (x - 2) % 10
        if m < 3:
            return GOLD[3] if m == 1 else GOLD[1] if m == 0 else GOLD[2]
        if (m, h) in ((6, 43), (6, 44), (6, 42), (5, 43), (7, 43)):
            return GLOW[1] if (m, h) != (6, 43) else GLOW[0]
        return PLUM[3] if h == 41 else PLUM[2]
    sc.sculpt(-4, BW + 4, -6, 28, 38, 45, chamfer_inside(-4, BW + 4, -6, 28, 38, 45, 9), arch_col)

    def corn_col(x, d, h, face):
        if face == "top":
            return deck_px(x, d)
        if d > -8:
            return MARBLE[1] if x < BW // 2 else MARBLE[3]
        if h == 45:
            return MARBLE[4] if x % 3 == 0 else MARBLE[3]   # dentils
        return MARBLE[0] if h == 47 else MARBLE[1]
    sc.sculpt(-6, BW + 6, -8, 30, 45, 48, chamfer_inside(-6, BW + 6, -8, 30, 45, 48, 11), corn_col)


def parapet(sc):
    """Low marble balustrade with gold posts around the roof deck."""
    def front(u, v, U, V):
        return MARBLE[1] if v == V - 1 else MARBLE[3]

    def top(u, v, U, V):
        return GOLD[1] if (u % 8 == 0 or v % 8 == 0) and (U < 6 or V < 6) else MARBLE[0]
    sc.box(-4, BW + 4, 26, 29, 48, 51, top=lambda u, v, U, V: GOLD[1] if u % 8 == 0 else MARBLE[0],
           front=front, edge=MARBLE[4])
    for x0 in (-4, BW + 1):
        sc.box(x0, x0 + 3, -1, 26, 48, 51, top=lambda u, v, U, V: GOLD[1] if v % 8 == 0 else MARBLE[0] if u < 2
               else MARBLE[1], front=front, edge=MARBLE[4])


def deck_px(x, d):
    if d < -6 or (x < -3 or x > BW + 2):
        return MARBLE[0]
    if (x + d) % 8 == 0 and (x - d) % 8 == 0:
        return GOLD[1]
    return DECK[1] if ((x // 4) + (d // 4)) % 2 else DECK[2]


def dome(sc):
    # drum with round glowing portholes
    def drum_in(x, d, h):
        return ((x - CX) / DR) ** 2 + ((d - CD) / (DR * 0.5)) ** 2 < 1

    def drum_col(x, d, h, face):
        dx = x - CX
        if face == "top" or h >= DRUM1 - 2:
            return GOLD[1] if dx < 6 else GOLD[2]
        for wx in (-20, -10, 0, 10, 20):
            if (dx - wx) ** 2 + (h - 51) ** 2 < 5:
                return GLOW[1] if dx - wx < 0 else GLOW[2]
        return lit(MARBLE, dx / DR, 0)
    sc.sculpt(CX - DR - 1, CX + DR + 2, CD - 15, CD + 15, DRUM0, DRUM1, drum_in, drum_col, edge=MARBLE[4])

    def dome_in(x, d, h):
        return h >= DRUM1 and ((x - CX) / (DR - 2)) ** 2 + ((d - CD) / ((DR - 2) * 0.5)) ** 2 \
            + ((h - DRUM1) / DH) ** 2 < 1

    def dome_col(x, d, h, face):
        dx = x - CX
        hh = h - DRUM1
        if abs(dx) < 4 and 6 < hh < DH - 3 and d <= CD:          # observatory slot
            if 10 <= hh <= 15:
                return CYAN[0] if abs(dx) < 1.5 and 11 <= hh <= 14 else CYAN[1] if abs(dx) < 2.5 else CYAN[2]
            if abs(dx) >= 3:
                return GOLD[2] if dx < 0 else GOLD[3]
            return DECK[4] if hh < 10 else (52, 36, 88)
        a = math.atan2(dx, (d - CD) * 2 + 0.01)
        q = a * 7 / math.pi
        if abs(q - round(q)) < 0.08 and hh > 2:
            return DOMER[3]
        if hh in (8, 16):
            return DOMER[3] if dx > 0 else DOMER[2]
        nx, ny = dx / (DR - 2), hh / DH + 0.15
        return lit(DOMER, nx, ny)
    sc.sculpt(CX - DR, CX + DR + 1, CD - 14, CD + 14, DRUM1, DRUM1 + DH + 1, dome_in, dome_col, edge=DOMER[4])
    # finial
    sc.box(CX - 1, CX + 2, CD - 1, CD + 2, DRUM1 + DH - 1, DRUM1 + DH + 4, top=GOLD[0],
           front=lambda u, v, U, V: GOLD[1] if u == 0 else GOLD[2], edge=GOLD[4])
    # brass telescope poking out of the slot toward the upper left
    tx0, th0, td = CX - 1, DRUM1 + 13, CD - 13
    tube = [(tx0 - i * 1.5, td, th0 + i * 1.0, 2.1) for i in range(7)]

    def tcol(x, d, h, face, b, nx, ny):
        off = (h - th0) - (tx0 - x) / 1.5
        if b is tube[-1] and x <= b[0] - 1.2:
            return CYAN[1]
        if abs((tx0 - x) - 7) < 1 or abs((tx0 - x) - 1.5) < 0.8:
            return GOLD[1] if off > 0 else GOLD[3]
        return DECK[1] if off > 1 else DECK[2] if off > -1 else DECK[3]
    sphere_sculpt(sc, tube, tcol, shadow=False, rd=0.9)


def halo(sc):
    RHO, HR = 20, 84

    def ring_in(x, d, h):
        rho = math.hypot(x - CX, (d - CD) / 0.5)
        return (rho - RHO) ** 2 + ((h - HR) * 1.4) ** 2 < 2.4 ** 2

    def ring_col(x, d, h, face):
        if face == "top":
            return GLOW[0]
        return GLOW[1] if x < CX - 8 else GLOW[2] if x < CX + 10 else GLOW[3]
    sc.sculpt(CX - RHO - 4, CX + RHO + 5, CD - 11, CD + 12, HR - 3, HR + 3, ring_in, ring_col, shadow=False)

    def orb(x, d, h, f, b, nx, ny):
        if nx < -0.2 and ny > 0.2:
            return GLOW[0]
        return GLOW[1] if nx < 0.3 and ny > -0.3 else GLOW[2] if ny > -0.6 else GLOW[3]
    sphere_sculpt(sc, [(10, CD, 74, 3), (86, CD, 74, 3), (CX, CD, 92, 2.6)], orb, shadow=False, rd=0.8)


def pediment(sc):
    P0, PH, HW = 48, 20, 52
    def hp(x):
        return P0 + PH * (1 - abs(x - 47.5) / HW)

    def inside(x, d, h):
        return -8 <= d < -2 and h < hp(x)

    def color(x, d, h, face):
        if face == "top":
            return MARBLE[0] if x < 48 else MARBLE[1]
        top = hp(x)
        if h >= top - 3:                                 # raking cornice
            return MARBLE[1] if h >= top - 1.5 else MARBLE[3]
        if h < P0 + 2:                                   # horizontal geison
            return MARBLE[2] if h == P0 + 1 else MARBLE[3]
        return CELLA[3] if h > P0 + 3 else CELLA[4]      # recessed tympanum
    sc.sculpt(-5, BW + 5, -8, -2, P0, P0 + PH + 1, inside, color, edge=MARBLE[4])
    # eye medallion: gold disc + eye relief (emissive core)
    MC, MH = 47.5, 57

    def disc_in(x, d, h):
        return -9 <= d < -8 and ((x - MC) / 12) ** 2 + ((h - MH) / 7.5) ** 2 < 1

    def disc_col(x, d, h, face):
        q = ((x - MC) / 12) ** 2 + ((h - MH) / 7.5) ** 2
        if q > 0.72:
            return GOLD[1] if h > MH else GOLD[3]
        return PLUM[3]
    sc.sculpt(35, 61, -9, -8, 49, 65, disc_in, disc_col, shadow=False, edge=GOLD[4])

    def eye_in(x, d, h):
        return -10 <= d < -9 and emblem_level("eye", (x - MC) * 1.45, (h - MH) * 1.7 + 9.5) > 0

    def eye_col(x, d, h, face):
        lv = emblem_level("eye", (x - MC) * 1.45, (h - MH) * 1.7 + 9.5)
        if face == "top":
            return MARBLE[0]
        return GLOW[0] if lv == 3 else GLOW[2] if lv == 2 else MARBLE[0] if x < MC else MARBLE[1]
    sc.sculpt(36, 60, -10, -9, 51, 64, eye_in, eye_col, shadow=False, edge=PLUM[4])
    # acroteria: gold orbs on the apex and the two corners
    gold = lambda x, d, h, f, b, nx, ny: lit(GOLD, nx, ny)  # noqa: E731
    sphere_sculpt(sc, [(-2, -5, 51, 2.3), (BW + 1, -5, 51, 2.3), (47.5, -5, P0 + PH + 2, 2.3)], gold, rd=0.9)


def obelisk(sc, cx, cd):
    """Slim marble obelisk with a hovering crystal orb and a small orbiting ring."""
    sc.box(cx - 5, cx + 6, cd - 4, cd + 4, 0, 3, top=MARBLE[0],
           front=lambda u, v, U, V: MARBLE[2] if v else MARBLE[3], edge=MARBLE[4])

    def inside(x, d, h):
        w = 2.6 - (h - 3) * 0.035
        if h >= 24:
            w = max(0.0, (28 - h) * 0.65)
        return abs(x - cx) < w and abs(d - cd) < 2.2

    def color(x, d, h, face):
        dx = x - cx
        if face == "top":
            return MARBLE[0]
        if h >= 24:
            return GOLD[0] if dx < 0 else GOLD[2]
        if 9 <= h <= 18 and dx == 0:
            return GLOW[2] if h % 3 else GLOW[1]          # carved glowing glyph channel
        return MARBLE[1] if dx < 0 else MARBLE[3]
    sc.sculpt(cx - 4, cx + 5, cd - 3, cd + 3, 3, 28, inside, color, edge=MARBLE[4])

    def orb(x, d, h, f, b, nx, ny):
        if nx < -0.25 and ny > 0.25:
            return CYAN[0]
        return GLOW[1] if ny > -0.1 and nx < 0.3 else GLOW[2] if ny > -0.55 else GLOW[3]
    sphere_sculpt(sc, [(cx, cd, 36, 4.6)], orb, shadow=False, rd=0.9)
    for (sx, sh) in ((cx - 7, 41), (cx + 7, 33)):        # orbiting crystal shards
        sc.box(sx, sx + 1, cd, cd + 1, sh, sh + 3, front=lambda u, v, U, V: CYAN[1] if v == 2 else CYAN[2])


def exterior(sc, th, t, night):
    cella(sc, th, t, night)
    door_hood(sc, night)
    stylobate(sc)
    # ground-level marble walk into the door bay
    sc.box(30, 66, -12, 2, 0, 0, top=lambda u, v, U, V: GOLD[2] if (u in (0, U - 1)) else
           MARBLE[1] if (u // 6 + v // 4) % 2 else MARBLE[2])
    for cx in COLS:
        fluted(sc, cx, -3, 9, 38)
    entablature(sc, night)
    parapet(sc)
    dome(sc)
    halo(sc)
    pediment(sc)
    obelisk(sc, -6, -6)
    obelisk(sc, BW + 6, -6)


def sparks(sc, th, night):
    for (x, y, big) in ((12, 18, 1), (86, 15, 1), (29, 10, 0), (70, 7, 0), (7, 39, 0), (91, 37, 0),
                        (-10, 64, 0), (106, 63, 0)):
        X, Y = X0 + x, y
        sc.put(X, Y, GLOW[0])
        if big:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                sc.put(X + dx, Y + dy, GLOW[2])


# ---------------------------------------------------------------- interior
FLOOR = R5((246, 240, 252), (226, 218, 244), (196, 186, 226), (156, 144, 198), (112, 100, 160))
VOID = [(30, 20, 64), (40, 28, 82), (54, 38, 104), (255, 250, 228), (196, 170, 255)]
HZR = R5((255, 246, 230), (176, 140, 250), (96, 66, 170), (60, 40, 120), (36, 22, 76))
RIM = R5((196, 150, 222), (158, 112, 196), (122, 84, 168), (90, 60, 134), (60, 40, 100))
OUT = R5((96, 80, 132), (82, 66, 116), (68, 54, 100), (54, 42, 84), (40, 30, 66))


def floor_px(gx, gy):
    x, y = gx % T, gy % T
    if x == 0 or y == 0:
        return FLOOR[0]
    if x == T - 1 or y == T - 1:
        return FLOOR[3]
    k = abs(x - 7.5) + abs(y - 7.5)
    if 4.5 < k < 5.6:
        return GOLD[2] if y > 7 or x > 7 else GOLD[1]
    if k < 1.1:
        return GL[2]
    if (x, y) in ((3, 12), (12, 3)):
        return FLOOR[2]
    return FLOOR[1]


STARS = {(4, 5): 3, (11, 12): 4, (13, 3): 4, (2, 12): 4, (8, 9): 4}


def hazard_px(gx, gy):
    """Starry void: exact-repeating 16 px tile (two star layouts, checker alternated)."""
    x, y = gx % T, gy % T
    alt = ((gx // T) + (gy // T)) % 2
    if alt:
        x, y = (x + 7) % T, (y + 9) % T
    if (x, y) == (4, 5):
        return VOID[3]
    if (x, y) in ((3, 5), (5, 5), (4, 4), (4, 6)):
        return VOID[4]
    if (x, y) in STARS:
        return VOID[STARS[(x, y)]] if (x, y) != (8, 9) else VOID[2]
    if (x, y) in ((10, 6), (1, 2), (14, 9), (6, 14)):
        return VOID[1]
    return VOID[0]


def tile_rim(ctx, c, r):
    t_rim(ctx, c, r, RIM)


def tile_warp(ctx, c, r):
    """Psychic warp pad: gold ring, glowing pink rings, white core star."""
    t_floor(ctx, c, r)
    X, Y, p = c * T, r * T, ctx.p
    for y in range(T):
        for x in range(T):
            dd = (x - 7.5) ** 2 + ((y - 7.5) * 1.15) ** 2
            if dd < 52:
                col = (IO if dd > 44 else GOLD[1] if dd > 34 and y < 8 else GOLD[2] if dd > 34
                       else GL[3] if dd > 24 else GL[2] if dd > 13 else GL[1] if dd > 4 else GL[0])
                p[X + x, Y + y] = col
    for (x, y) in ((7, 3), (8, 3), (7, 12), (8, 12), (3, 7), (3, 8), (12, 7), (12, 8)):
        p[X + x, Y + y] = GL[0]


def bridge_px(u, v, col):
    """Light bridge: gold rails, translucent pink light deck."""
    if u in (2, 13):
        return GOLD[2] if v % 4 else GOLD[1]
    if 3 <= u <= 12:
        if u in (3, 12):
            return GL[3]
        return GL[0] if (v + u) % 6 == 0 else GL[1] if v % 4 == 0 else GL[2]
    return None


def star_map(ctx):
    """2F north wall: a framed star chart (constellations) spanning the rim behind the dais."""
    d, p = ctx.d, ctx.p
    x0, x1, y0, y1 = 1 * T + 2, (ctx.w - 1) * T - 3, 2, 2 * T - 7
    d.rectangle([x0 - 2, y0 - 1, x1 + 2, y1 + 2], fill=GOLD[3], outline=IO)
    d.rectangle([x0 - 1, y0, x1 + 1, y1 + 1], fill=GOLD[1])
    d.rectangle([x0, y0 + 1, x1, y1], fill=VOID[0])
    for gx in range(x0, x1 + 1):
        for gy in range(y0 + 1, y1 + 1):
            p[gx, gy] = hazard_px(gx, gy)
    cx = (x0 + x1) // 2
    # celestial arcs
    d.arc([cx - 70, y0 - 16, cx + 70, y1 + 40], 190, 350, fill=VOID[2])
    d.arc([cx - 46, y0 - 6, cx + 46, y1 + 26], 195, 345, fill=GOLD[3])
    # constellations (gold lines, white stars)
    for pts in (((x0 + 10, y0 + 18), (x0 + 22, y0 + 8), (x0 + 34, y0 + 14), (x0 + 44, y0 + 6)),
                ((x1 - 10, y0 + 20), (x1 - 20, y0 + 9), (x1 - 34, y0 + 16), (x1 - 46, y0 + 5)),
                ((cx - 16, y0 + 22), (cx - 6, y0 + 6), (cx + 8, y0 + 12), (cx + 18, y0 + 4))):
        d.line(list(pts), fill=GOLD[2])
        for (sx, sy) in pts:
            p[sx, sy] = VOID[3]
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                p[sx + dx, sy + dy] = VOID[4]
    # a pink planet with a ring
    d.ellipse([cx + 34, y0 + 4, cx + 44, y0 + 14], fill=GL[2], outline=GL[3])
    d.ellipse([cx + 35, y0 + 5, cx + 39, y0 + 9], fill=GL[0])
    d.line([cx + 30, y0 + 11, cx + 48, y0 + 7], fill=GOLD[1])
    # crescent moon
    d.ellipse([cx - 46, y0 + 5, cx - 36, y0 + 15], fill=VOID[3])
    d.ellipse([cx - 43, y0 + 4, cx - 34, y0 + 13], fill=VOID[0])


def decor(ctx):
    d, p = ctx.d, ctx.p
    if ctx.floor["name"] == "2F":
        star_map(ctx)
    for r in range(ctx.h):
        for c in range(ctx.w):
            ch = ctx.g(c, r)
            x, y = c * T, r * T - 14
            if ch == "G":                       # crystal orb on a pedestal
                t_floor(ctx, c, r)
                d.rectangle([x + 2, y + 22, x + 13, y + 29], fill=MARBLE[2], outline=IO)
                d.line([x + 3, y + 23, x + 12, y + 23], fill=MARBLE[0])
                d.line([x + 3, y + 27, x + 12, y + 27], fill=GOLD[2])
                d.rectangle([x + 5, y + 18, x + 10, y + 21], fill=GOLD[2], outline=IO)
                d.ellipse([x + 2, y + 6, x + 13, y + 18], fill=GL[2], outline=IO)
                d.ellipse([x + 4, y + 8, x + 10, y + 14], fill=GL[1])
                d.rectangle([x + 5, y + 9, x + 6, y + 10], fill=GL[0])
            elif ch == "B":                     # slim obelisk + hovering orb
                t_floor(ctx, c, r)
                d.rectangle([x + 3, y + 25, x + 12, y + 29], fill=MARBLE[3], outline=IO)
                d.polygon([(x + 5, y + 25), (x + 6, y + 10), (x + 9, y + 10), (x + 10, y + 25)],
                          fill=MARBLE[1], outline=IO)
                d.line([x + 7, y + 13, x + 7, y + 23], fill=GL[2])
                d.polygon([(x + 6, y + 10), (x + 7, y + 7), (x + 9, y + 10)], fill=GOLD[1], outline=IO)
                d.ellipse([x + 4, y - 2, x + 11, y + 5], fill=GL[1], outline=IO)
                d.point((x + 6, y), fill=GL[0])


THEME = dict(
    name="Psychic-Type Gym", archetype="Observatory Temple",
    wall=CELLA, accent=PLUM, trim=GOLD, rock=MARBLE, deck=DECK, glow=GLOW, win_glow=WIN_GLOW,
    emblem=psy_eye, door_spill=(232, 196, 240), door_inside=(64, 38, 92),
    exterior=exterior, sparks=sparks, night_lights=(X0 - 6, X0 + BW + 6),
    floor=FLOOR, floor_px=floor_px, hazard_px=hazard_px, hazard_ramp=HZR,
    ledge=FLOOR, outside=OUT, rim=RIM, stair_ramp=MARBLE[:3], bridge_px=bridge_px,
    tiles={"#": tile_rim, "W": tile_warp},
    decor=decor,
    legend_extra={"~": "starry void (blocked)", "W": "warp pad (two-way teleporter, link)",
                  "|": "light bridge N-S", "G": "crystal orb pedestal (blocked)", "B": "obelisk (blocked)"},
    floors=[
        dict(name="1F", grid=[
            "##################",   # 0
            "#~~~~~G.U.G~~...~#",   # 1  stairs UP to the observatory
            "#~~~~~..T..~~.W.~#",   # 2  T4 blocks the stairs; NE islet = decoy dead end
            "#~~~~~.....~~G.G~#",   # 3
            "#~~~~~..W..~~~~~~#",   # 4  arrival of warp 3
            "#~~~~~~~~~~~~~~~~#",   # 5
            "#~~~~~~~~~~WT..W~#",   # 6  T3 guards warp 3; right pad = decoy to the NE islet
            "#~~~~~~~~~~.....~#",   # 7
            "#WT..~~.W.~.G...~#",   # 8  T2 guards warp 2; centre islet = decoy dead end
            "#....~~G.G~.....~#",   # 9
            "#....~~~~~~...W.~#",   # 10 arrival of warp 2
            "#..W.~~~~~~~~~~~~#",   # 11 arrival of warp 1
            "#~~~~~~~~~~~~~~~~#",   # 12
            "#~~~~~~~~~~~~~~~~#",   # 13
            "#~~~WT.......W~~~#",   # 14 T1 guards warp 1; right pad = decoy
            "#~~~..........~~~#",   # 15
            "#~~~G........G~~~#",   # 16
            "#~~~..........~~~#",   # 17
            "#~~~..B....B..~~~#",   # 18
            "########MM########",   # 19
            "OOOOOOOOOOOOOOOOOO"],  # 20
             trainers=[(5, 14, "left", 1), (2, 8, "left", 1), (12, 6, "left", 1), (8, 2, "up", 1)]),
        dict(name="2F", grid=[
            "##############",   # 0  star map on the north wall
            "##############",   # 1
            "#~~~.PKKP.~~~#",   # 2
            "#~~~G.KK.G~~~#",   # 3  leader on the dais
            "#~~~..SS..~~~#",   # 4
            "#~~~......~~~#",   # 5
            "#~~~~~~|~~~~~#",   # 6  light bridge
            "#~~~~~~|~~~~~#",   # 7
            "#~~~~~~.T.~~~#",   # 8  T6 guards the bridge foot
            "#~~~~~~....~~#",   # 9
            "#~~~~~~..W.~~#",   # 10 arrival of warp 7
            "#.....~~~~~~~#",   # 11
            "#D..TW~~~~~~~#",   # 12 arrival from 1F; T5 guards warp 7
            "#.G...~~~~~~~#",   # 13
            "##############"],  # 14
             trainers=[(4, 12, "right", 1), (8, 8, "left", 1)]),
    ],
    links=[dict(type="warp", a=("1F", 4, 14), b=("1F", 3, 11)),
           dict(type="warp", a=("1F", 1, 8), b=("1F", 14, 10)),
           dict(type="warp", a=("1F", 11, 6), b=("1F", 8, 4)),
           dict(type="warp", a=("1F", 13, 14), b=("1F", 8, 8)),
           dict(type="warp", a=("1F", 15, 6), b=("1F", 14, 2)),
           dict(type="stairs", a=("1F", 8, 1), b=("2F", 1, 12)),
           dict(type="warp", a=("2F", 5, 12), b=("2F", 9, 10))],
    leader=("2F", 6, 3, "down"),
)
