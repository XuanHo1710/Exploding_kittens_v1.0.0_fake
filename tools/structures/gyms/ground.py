"""Ground-Type Gym: Canyon Pueblo (stepped adobe mesa hall).

Exterior: a two-storey adobe pueblo. Soft-cornered sandstone-plaster lower block with a terracotta
base band and protruding viga beam-ends, a set-back upper block (terrace with clay pots and a timber
ladder in between, T-shaped upper doorway), a terraced strata mesa crown with a carved totem and
boulders hanging off the deck, a stepped stone/timber lintel portal carrying the mesa emblem, carved
totem poles with fire bowls and saguaro cactus planters on the ground.

Interior: 1F canyon hall cut by quicksand pits and terraced sandstone ledges (steps 'S' are the
crossings). The leader terrace is sealed off by a quicksand gulch, so the only way on is the
sinkhole 'H' -> fall into the B1F sand burrow -> plank bridge + ledge steps -> stairs 'U' that come
back up onto the 1F leader terrace (arrival 'D'), then one last ledge step below the dais alcove.
"""
import math

from gymkit import (BW, DOOR_X0, DOOR_X1, IO, T, X0, WARM, E, R5, cl, door_px, emblem_level,
                    flame_top, nz, rgb, sphere_sculpt, lit, win_color)

# ---------------------------------------------------------------- palette
SAND = R5((248, 222, 176), (232, 198, 148), (210, 170, 122), (170, 128, 100), (122, 88, 80))      # plaster
TERRA = R5((242, 152, 98), (220, 116, 72), (186, 86, 58), (142, 60, 52), (98, 42, 46))          # terracotta
TIMBER = R5((206, 156, 104), (172, 120, 78), (138, 92, 62), (100, 64, 52), (70, 46, 44))         # vigas
ROCK = R5((238, 188, 132), (216, 156, 104), (186, 124, 84), (146, 92, 70), (102, 64, 58))        # mesa rock
CREAM = R5((250, 232, 196), (236, 212, 168), (214, 184, 140), (176, 144, 112), (128, 100, 88))   # pale strata
DECK = R5((240, 212, 160), (222, 190, 140), (198, 162, 116), (158, 122, 94), (112, 84, 74))
TURQ = R5((150, 230, 212), (90, 196, 186), (56, 152, 160), (44, 106, 128), (36, 72, 96))
SCRUB = R5((176, 206, 112), (130, 172, 84), (92, 136, 72), (64, 100, 64), (44, 70, 56))
EMBER = E([(255, 246, 190), (255, 214, 110), (250, 166, 60), (214, 110, 44), (160, 70, 40)])
EMBERI = [rgb(c) for c in EMBER]

LOW_TOP = 36                 # lower block roof (terrace) height
UP_D0, UP_D1, UP_TOP = 12, 32, 54
UP_X0, UP_X1 = 14, 82
MX, MD = 48, 22              # mesa centre
LOW_WIN = [("wood", 6, 13, 12, 21), ("wood", 17, 24, 12, 21), ("wood", 72, 79, 12, 21), ("wood", 83, 90, 12, 21)]
UP_WIN = [("wood", 20, 26, 42, 49), ("wood", 70, 76, 42, 49)]
LOW_VIGA = [3, 12, 21, 72, 81, 90]
UP_VIGA = [16, 24, 31, 64, 72, 79]


# ---------------------------------------------------------------- exterior helpers
def rrect(x0, x1, d0, d1, r):
    def f(x, d):
        if not (x0 <= x < x1 and d0 <= d < d1):
            return False
        cx = min(max(x, x0 + r), x1 - 1 - r)
        cd = min(max(d, d0 + r), d1 - 1 - r)
        return (x - cx) ** 2 + (d - cd) ** 2 <= r * r + 0.6
    return f


def recess(w, x, h, W):
    """Deep-set window reveal: 2 px of shaded adobe around the wood frame."""
    _, x0, x1, h0, h1 = w
    if not (x0 - 3 <= x <= x1 + 2 and h0 - 3 <= h <= h1 + 3):
        return None
    if h <= h0 - 2:
        return W[0] if h == h0 - 2 else W[1]          # lit sill
    if h >= h1 + 1 or x <= x0 - 2:
        return W[4] if (h >= h1 + 2 or x == x0 - 3) else W[3]
    return W[3]


def adobe(th, t, night, top, windows, d_front, base_band=True, tdoor=False, vigas=(), viga_h=0, deck_ao=None):
    W, A = SAND, TERRA

    def f(x, d, h, face):
        if face == "top":
            if d <= d_front + 1:
                return W[0]
            if deck_ao is not None and d >= deck_ao - 2:
                return DECK[3] if d >= deck_ao - 1 else DECK[2]
            return DECK[1] if (cl(x, d, 2) > 150 or (x + 2 * d) % 23 == 0) else DECK[0]
        side = 0 if d <= d_front else (-1 if x < BW // 2 else 1)
        if side:
            k = 1 if side < 0 else 3
            if h >= top - 1:
                k -= 1
            if base_band and h < 5:
                return A[k + 1] if h < 4 else A[k]
            return W[k + (1 if side > 0 and d > d_front + 3 else 0)]
        if base_band and DOOR_X0 <= x < DOOR_X1 and h < 28:
            return door_px(th, x - DOOR_X0, h, t, night)
        for w in windows:
            c = win_color(th, w, x, h, night)
            if c is not None:
                return c
        for w in windows:
            c = recess(w, x, h, W)
            if c is not None:
                return c
        if tdoor:
            c = t_doorway(x, h, night)
            if c is not None:
                return c
        if base_band and h < 5:
            if h == 4:
                return A[0]
            return A[2] if (x // 4 + h // 2) % 2 else A[3]
        if base_band and h == 5:
            return W[3]
        if base_band and 29 <= h <= 32:                    # painted step-fret frieze
            u, v = x % 10, h - 29
            peak = min(u, 9 - u)
            if v <= peak - 1:
                return TURQ[2] if (x // 10) % 2 else TERRA[2]
            if v == peak:
                return TURQ[3] if (x // 10) % 2 else TERRA[3]
        if h == top - 1:
            return W[0]
        if h == top - 2:
            return W[1]
        for vx in vigas:                                   # soft AO under each beam-end
            if vx - 1 <= x <= vx + 3 and viga_h - 3 <= h < viga_h:
                return W[3] if h == viga_h - 1 else W[2]
        k = 2
        n = cl(x, h, 6)
        if n > 236:
            k = 1
        elif n < 14:
            k = 3
        if (x * 3 + h * 5) % 37 == 0:
            k = 3
        return W[k]
    return f


def t_doorway(x, h, night):
    """Pueblo T-shaped doorway on the upper block (opens onto the terrace)."""
    stem = 44 <= x < 53 and LOW_TOP <= h < 46
    bar = 41 <= x < 56 and 46 <= h < 51
    if not (stem or bar):
        lint = 39 <= x < 58 and 51 <= h < 53
        if lint:
            return TIMBER[1] if h == 52 else TIMBER[3]
        return None
    edge_l = (stem and x == 44 and h < 46) or (bar and x == 41)
    edge_t = h == 50
    if edge_l or edge_t:
        return SAND[4]
    if night:
        return WARM[1] if (x + h) % 6 else WARM[0]
    return (78, 50, 46) if h > 40 else TERRA[4]


def viga(sc, x, d0, h, n=3):
    def front(u, v, U, V):
        if u == 0 or v == V - 1:
            return TIMBER[1]
        return TIMBER[3] if (u + v) % 3 == 0 else TIMBER[2]
    sc.box(x, x + n, d0, d0 + 3, h, h + 3, top=TIMBER[0], front=front, edge=TIMBER[4])


def mesa(sc):
    """Terraced sandstone mesa crown: angular flat-topped tiers, sheer strata cliffs, scrub, grooves."""
    tiers = [(31, 13, 29, UP_TOP, 64), (23, 16, 27, 64, 72), (14, 18, 25, 72, 78)]
    strata = [(ROCK, 0), (TERRA, 0), (ROCK, 1), (CREAM, 0), (TERRA, 1), (ROCK, 0)]

    def tier(h):
        for i, tt in enumerate(tiers):
            if tt[3] <= h < tt[4]:
                return (i,) + tt
        return None

    def front_d(x, i, d0):
        return d0 + (1 if nz(x // 3, i, 41) > 200 else 0)          # ragged cliff line

    def inside(x, d, h):
        t = tier(h)
        if t is None:
            return False
        i, a, d0, d1, h0, _ = t
        dx = abs(x - MX)
        if d < front_d(x, i, d0) or d >= d1:
            return False
        aa = a - (h - h0) * 0.15 + (1 if nz(d // 3, h // 4, 43 + i) > 170 else 0)
        aa -= max(0, 5 - (d - d0))                                    # 45 deg chipped front corners
        aa -= max(0, 4 - (d1 - 1 - d))
        return dx < aa

    def color(x, d, h, face):
        i, a, d0, d1, h0, h1 = tier(h)
        dx = x - MX
        if face == "top":
            if d <= front_d(x, i, d0) or abs(dx) > a - (h - h0) * 0.15 - 1.5:
                return CREAM[0]                                      # lit rim of the tier
            if nz(x // 2, d // 2, 31 + i) > 244:
                return SCRUB[1] if nz(x, d, 5) > 90 else SCRUB[2]
            return CREAM[1] if cl(x, d, 11) > 80 else CREAM[2]
        hh = h - h0
        if hh >= h1 - h0 - 1:
            ramp, k = CREAM, 1
        else:
            ramp, off = strata[(hh // 3 + i * 2) % len(strata)]
            k = 2 + off
        if d > front_d(x, i, d0) + 1:                               # chamfer faces
            k += -1 if dx < 0 else 2
        elif dx > a * 0.55:
            k += 1
        if hh <= 1 and i > 0:
            k += 1
        if cl(x * 2, i, 9) > 222 and hh < h1 - h0 - 2:              # erosion grooves
            k += 1
        return ramp[max(0, min(4, k))]
    sc.sculpt(MX - 34, MX + 35, UP_D0, UP_D1, UP_TOP, 78, inside, color)


def summit_totem(sc):
    """Carved thunderbird totem on the mesa summit, wings spread, glowing eyes."""
    b = 78
    def front(u, v, U, V):
        if v == V - 1:
            return TIMBER[0]
        if v in (1, 5):
            return TURQ[1] if u < 4 else TURQ[2]
        if v == 3 and u in (2, 6):
            return EMBER[1]
        return TIMBER[1] if u < 3 else TIMBER[2] if u < 7 else TIMBER[3]
    sc.box(MX - 4, MX + 5, 20, 24, b, b + 7, top=TIMBER[0], front=front, edge=TIMBER[4])

    def wing(u, v, U, V):
        if v == V - 1:
            return TURQ[0]
        if u in (0, U - 1):
            return TURQ[3]
        return TURQ[1] if (u // 3) % 2 else TURQ[2]
    sc.box(MX - 11, MX + 12, 19, 20, b + 3, b + 6, top=TURQ[0], front=wing, edge=TURQ[4])

    def head(u, v, U, V):
        if v == 2 and u in (1, 5):
            return EMBER[0]
        if v == 0 and 2 <= u <= 4:
            return TERRA[1]
        return TERRA[1] if u < 3 else TERRA[2]
    sc.box(MX - 3, MX + 4, 21, 23, b + 7, b + 10, top=TERRA[0], front=head, edge=TERRA[4])


def rocks(sc, bl):
    def col(x, d, h, face, blob, nx, ny):
        if face == "top":
            return ROCK[1] if nx < 0.2 else ROCK[2]
        return lit(ROCK[2:], nx, ny)
    sc.default_edge = ROCK[4]
    sphere_sculpt(sc, bl, col, rd=0.7)
    sc.default_edge = None


def ladder(sc, x0, x1, d, h0, h1):
    for rx in (x0, x1 - 1):
        sc.box(rx, rx + 1, d, d + 1, h0, h1, top=TIMBER[0],
               front=lambda u, v, U, V: TIMBER[1] if v % 7 else TIMBER[2], edge=None)
    for h in range(h0 + 3, h1 - 1, 4):
        sc.box(x0 + 1, x1 - 1, d, d + 1, h, h + 1, top=TIMBER[0], front=TIMBER[2])


def pots(sc, spots):
    def col(x, d, h, face, b, nx, ny):
        if ny > 0.72:
            return TERRA[4]                              # open mouth
        if abs(ny) < 0.18:
            return CREAM[1] if nx < 0.3 else CREAM[3]    # painted band
        return lit(TERRA, nx, ny)
    for (x, d, r) in spots:
        sphere_sculpt(sc, [(x, d, LOW_TOP + r - 1, r)], col, shadow=False, rd=0.8)


def lintel_portal(sc, th, night):
    """Stone posts + timber lintel + stepped stone pediment carrying the mesa emblem."""
    def post(u, v, U, V):
        if v >= V - 2:
            return CREAM[1]
        if v < 2:
            return TERRA[3]
        return ROCK[1] if u < 2 else ROCK[2] if u < U - 1 else ROCK[3]
    for px in (26, 64):
        sc.box(px, px + 6, -6, -1, 0, 28, top=CREAM[0], front=post, edge=ROCK[4])

    def beam(u, v, U, V):
        if v == V - 1:
            return TIMBER[0]
        if u < 3 or u >= U - 3:
            return TIMBER[3] if (u + v) % 2 else TIMBER[2]       # end grain
        return TIMBER[1] if (u * 7 + v * 3) % 11 else TIMBER[2]
    sc.box(23, 73, -8, -1, 28, 32, top=TIMBER[0], front=beam, edge=TIMBER[4])

    def stone(u, v, U, V):
        if v == V - 1:
            return CREAM[0]
        if v == 0:
            return ROCK[3]
        return CREAM[2] if u < 2 else CREAM[3] if u >= U - 2 else CREAM[2] if (u + v * 3) % 13 else CREAM[3]
    sc.box(29, 67, -6, -1, 32, 37, top=CREAM[1], front=stone, edge=ROCK[4])
    sc.box(36, 60, -6, -1, 37, 41, top=CREAM[1], front=stone, edge=ROCK[4])
    sc.box(42, 54, -6, -1, 41, 44, top=CREAM[1], front=stone, edge=ROCK[4])
    GL = th["glow"]

    def lv(x, h):
        return emblem_level("mesa", (x - MX) * 0.95, (h - 32) * 1.75)

    def inside(x, d, h):
        return d == -7 and lv(x, h) > 0

    def color(x, d, h, face):
        level = lv(x, h)
        if face == "top":
            return TERRA[0]
        return GL[0] if level == 3 else GL[1] if level == 2 else (TERRA[1] if x <= MX else TERRA[2])
    sc.sculpt(MX - 15, MX + 16, -7, -6, 32, 44, inside, color, shadow=False, edge=TERRA[4])


def totem_pole(sc, cx, cd):
    segs = [(TIMBER, 0, 8), (TURQ, 8, 16), (TERRA, 16, 24)]
    for ramp, h0, h1 in segs:
        def face(u, v, U, V, ramp=ramp):
            if v == V - 1:
                return ramp[0]
            if v == 0:
                return ramp[4]
            if v == 5 and u in (2, 5):
                return EMBER[1] if ramp is TERRA else IO        # eyes (top head glows)
            if v in (2, 3) and 3 <= u <= 4:
                return CREAM[1]                                  # beak / nose
            return ramp[1] if u < 3 else ramp[2] if u < 6 else ramp[3]
        sc.box(cx - 4, cx + 4, cd - 3, cd + 3, h0, h1, top=ramp[0], front=face, edge=ramp[4])

    def wing(u, v, U, V):
        if v == V - 1:
            return CREAM[0]
        return CREAM[2] if (u % 3) else TERRA[2]
    sc.box(cx - 8, cx + 8, cd - 4, cd - 3, 17, 21, top=CREAM[1], front=wing, edge=TERRA[4])
    sc.box(cx - 5, cx + 5, cd - 4, cd + 4, 24, 27, top=EMBER[3],
           front=lambda u, v, U, V: TERRA[1] if v == 2 else TERRA[2], edge=TERRA[4])
    flame_top(sc, EMBER, cx, cd, 27, hh=11, r=4.2)


def cactus_planter(sc, cx, cd, flip=1):
    def pot(u, v, U, V):
        if v == V - 1:
            return TERRA[0]
        if v == 2:
            return TURQ[2]
        return TERRA[1] if u < 3 else TERRA[2] if u < U - 2 else TERRA[3]
    sc.box(cx - 5, cx + 5, cd - 3, cd + 3, 0, 5, top=(110, 78, 62), front=pot, edge=TERRA[4])
    arms = [(cx, 5, 19, 2.6), (cx - 4 * flip, 10, 16, 1.7), (cx + 4 * flip, 8, 13, 1.7)]

    def inside(x, d, h):
        if (x - cx) ** 2 + ((d - cd) * 1.2) ** 2 < 2.6 ** 2 and 5 <= h < 19 - (1 if abs(x - cx) > 1 else 0):
            return True
        for ax, h0, h1, r in arms[1:]:
            if (x - ax) ** 2 + ((d - cd) * 1.4) ** 2 < r * r and h0 <= h < h1:
                return True
            if h0 <= h < h0 + 2 and min(ax, cx) <= x <= max(ax, cx) and abs(d - cd) < 1.5:
                return True
        return False

    def color(x, d, h, face):
        if face == "top":
            return SCRUB[0]
        near = min(arms, key=lambda a: abs(x - a[0]))
        dx = x - near[0]
        if (h + x) % 4 == 0 and abs(dx) < 1:
            return CREAM[0]                                    # spines
        return SCRUB[1] if dx < -0.5 else SCRUB[2] if dx < 1 else SCRUB[3]
    sc.sculpt(cx - 8, cx + 9, cd - 3, cd + 4, 5, 20, inside, color)


def exterior(sc, th, t, night):
    # lower adobe block (soft rounded corners)
    lo = rrect(0, BW, 0, 24, 4)
    sc.sculpt(0, BW, 0, 24, 0, LOW_TOP, lambda x, d, h: lo(x, d),
              adobe(th, t, night, LOW_TOP, LOW_WIN, 0, vigas=LOW_VIGA, viga_h=32, deck_ao=UP_D0))
    # set-back upper block
    up = rrect(UP_X0, UP_X1, UP_D0, UP_D1, 4)
    sc.sculpt(UP_X0, UP_X1, UP_D0, UP_D1, LOW_TOP, UP_TOP, lambda x, d, h: up(x, d),
              adobe(th, t, night, UP_TOP, UP_WIN, UP_D0, base_band=False, tdoor=True,
                    vigas=UP_VIGA, viga_h=50))
    for vx in UP_VIGA:
        viga(sc, vx, UP_D0 - 3, 50)
    mesa(sc)
    rocks(sc, [(16, 15, UP_TOP + 1, 4.5), (23, 14, UP_TOP, 3), (80, 15, UP_TOP + 1, 4.5), (73, 14, UP_TOP, 3)])
    summit_totem(sc)
    # terrace life: ladder, pots
    ladder(sc, 35, 41, 8, LOW_TOP, UP_TOP + 5)
    pots(sc, [(8, 5, 3), (14, 7, 2.3), (82, 5, 3), (88, 7, 2.3), (62, 7, 2.2)])
    for vx in LOW_VIGA:
        viga(sc, vx, -3, 32)
    lintel_portal(sc, th, night)
    # ground props
    totem_pole(sc, -6, -3)
    totem_pole(sc, BW + 6, -3)
    cactus_planter(sc, 17, -9, 1)
    cactus_planter(sc, 79, -9, -1)


def sparks(sc, th, night):
    c = EMBER[1] if night else CREAM[0]
    for ex, ey in ((14, 31), (86, 28), (26, 18), (74, 15), (7, 44), (91, 41)):
        sc.put(X0 + ex, ey, c)


# ---------------------------------------------------------------- interior
FLOOR1 = R5((246, 222, 178), (232, 202, 154), (212, 176, 128), (176, 138, 104), (130, 98, 82))
FLOOR2 = R5((204, 162, 118), (184, 140, 100), (160, 118, 86), (126, 90, 72), (90, 62, 58))
QS = R5((250, 222, 150), (232, 196, 120), (210, 166, 96), (174, 128, 78), (130, 92, 64))
DARK_EARTH = R5((150, 108, 84), (124, 86, 70), (100, 68, 60), (76, 52, 50), (54, 38, 42))


def b1(ctx):
    return ctx.floor["name"] == "B1F"


def floor1_px(gx, gy):
    """Sandstone flagstones, 4 slabs per 16 px tile (exact repeat)."""
    F = FLOOR1
    x, y = gx % T, gy % T
    row = 0 if y < 8 else 1
    xx = (x + (4 if row else 0)) % T
    yy = y % 8
    if yy == 7 or xx % 8 == 7:
        return F[3]
    if yy == 0 or xx % 8 == 0:
        return F[0]
    if (xx % 8, yy) in ((3, 3), (4, 3), (2, 5)):
        return F[2]
    return F[1] if (xx // 8 + row) % 2 else F[2] if (xx % 8 + yy) == 9 else F[1]


def floor2_px(gx, gy):
    """Packed burrow sand with ripples and pebbles (exact repeat)."""
    F = FLOOR2
    x, y = gx % T, gy % T
    if (x, y) in ((3, 4), (11, 12), (12, 12)):
        return F[3]
    if (x, y) in ((3, 3), (11, 11)):
        return F[0]
    if (y * 2 + int(2 * math.sin(x * math.pi / 8))) % 8 == 0:
        return F[2]
    return F[1]


def hazard_px(gx, gy):
    """Quicksand: a sinking spiral per tile on a rippled sand base (exact repeat)."""
    x, y = gx % T - 7.5, gy % T - 7.5
    r = math.hypot(x, y * 1.25)
    a = math.atan2(y, x)
    if r < 7:
        v = (r * 0.9 + a * 1.2) % 3
        if r < 1.6:
            return QS[4]
        return QS[1] if v < 0.9 else QS[3] if v < 1.6 else QS[2]
    return QS[2] if (gx % T + gy % T) % 6 else QS[1]


def t_ground(ctx, c, r):
    ctx.fill(c, r, floor2_px if b1(ctx) else floor1_px)
    F = FLOOR2 if b1(ctx) else FLOOR1
    if ctx.g(c, r - 1) in "L#PXC":
        X, Y = c * T, r * T
        for x in range(T):
            ctx.p[X + x, Y] = F[4]
            ctx.p[X + x, Y + 1] = F[3]


def t_rock(ctx, c, r, solid="#COP"):
    """Canyon rock / rim: mesa-top surface + a short south strata face where it meets the room."""
    deep = b1(ctx)
    top_r = DARK_EARTH if deep else ROCK
    bands = ([DARK_EARTH[2], TERRA[3], DARK_EARTH[3], DARK_EARTH[2]] if deep
             else [TERRA[2], CREAM[2], ROCK[3], TERRA[3]])
    X, Y, p = c * T, r * T, ctx.p
    south = ctx.g(c, r + 1) not in solid
    fh = 7 if south else 0
    for y in range(T):
        for x in range(T):
            if y >= T - fh:
                yy = y - (T - fh)
                if y == T - 1:
                    col = IO
                elif yy == 0:
                    col = top_r[0]
                else:
                    col = bands[(yy - 1) // 2 % 4]
                    if (X + x) % 11 == 3 and yy > 1:
                        col = top_r[4]                     # vertical crack
            else:
                col = top_r[1]
                if (x, y) in ((4, 5), (5, 5), (11, 9), (12, 9), (7, 13 - fh)):
                    col = top_r[2]
                if (x, y) in ((4, 4), (11, 8)):
                    col = top_r[0]
                if not deep and (c * 3 + r) % 5 == 0 and (x, y) in ((9, 3), (10, 3), (10, 2), (8, 4)):
                    col = SCRUB[1] if y < 4 else SCRUB[2]
            p[X + x, Y + y] = col
    for dc, dr in ((1, 0), (-1, 0), (0, -1)):
        n = ctx.g(c + dc, r + dr)
        if n not in solid:
            for i in range(T if dc else T):
                if dc:
                    q = (X + (T - 1 if dc > 0 else 0), Y + i)
                    p[q] = IO
                    if dc < 0 and i < T - fh:
                        p[X + 1, Y + i] = top_r[0]
                else:
                    p[X + i, Y] = IO
                    p[X + i, Y + 1] = top_r[0]


def t_pillar(ctx, c, r):
    """Carved sandstone column seen from above: round turquoise-inlaid capital on the top tile,
    the shaft and a short south face on the tile below."""
    t_rock(ctx, c, r, solid="#OP")
    X, Y, d = c * T, r * T, ctx.d
    if ctx.g(c, r - 1) == "P":
        d.rectangle([X + 4, Y - 2, X + 11, Y + 9], fill=CREAM[2], outline=IO)
        d.line([X + 5, Y - 1, X + 5, Y + 8], fill=CREAM[0])
        d.line([X + 10, Y - 1, X + 10, Y + 8], fill=CREAM[3])
        d.rectangle([X + 4, Y + 3, X + 11, Y + 4], fill=TURQ[2])
        d.rectangle([X + 2, Y + 9, X + 13, Y + 14], fill=ROCK[2], outline=IO)
        d.line([X + 3, Y + 10, X + 12, Y + 10], fill=ROCK[0])
    else:
        d.ellipse([X + 2, Y + 3, X + 13, Y + 14], fill=CREAM[1], outline=IO)
        d.ellipse([X + 4, Y + 5, X + 11, Y + 11], fill=CREAM[0])
        d.ellipse([X + 6, Y + 6, X + 9, Y + 9], fill=TURQ[1], outline=TURQ[3])


def t_steps(ctx, c, r):
    X, Y, p = c * T, r * T, ctx.p
    S = CREAM
    for y in range(T):
        for x in range(T):
            m = y % 4
            p[X + x, Y + y] = S[0] if m == 0 else S[3] if m == 3 else S[1] if x < 8 else S[2]
    for dc, xs in ((-1, (0, 1)), (1, (T - 2, T - 1))):
        if ctx.g(c + dc, r) != "S":
            for y in range(T):
                p[X + xs[0], Y + y] = IO if dc < 0 else TERRA[3]
                p[X + xs[1], Y + y] = TERRA[1] if dc < 0 else IO


def t_sinkhole(ctx, c, r):
    """Sinkhole: dark funnel with sand pouring over the far lip and a lit near lip."""
    t_ground(ctx, c, r)
    X, Y, p = c * T, r * T, ctx.p
    for y in range(T):
        for x in range(T):
            dd = ((x - 7.5) / 7.0) ** 2 + ((y - 8.5) / 6.0) ** 2
            if dd >= 1:
                continue
            if dd > 0.8:
                col = IO if y >= 8 else QS[3]
            elif dd > 0.55:
                col = (86, 58, 50) if y < 8 else (60, 40, 40)
            else:
                col = (28, 18, 24)
            if y < 9 and dd <= 0.8 and x in (5, 9, 10) and y >= 4:
                col = QS[1] if (y + x) % 2 else QS[2]          # sand streams falling in
            p[X + x, Y + y] = col


def bridge_px(u, v, col):
    if u in (2, 13):
        return TIMBER[3]
    if 3 <= u <= 12:
        return TIMBER[2] if v % 4 == 3 else TIMBER[0] if v % 4 == 0 else TIMBER[1]
    return None


def decor(ctx):
    d = ctx.d
    for l in ctx.th["links"]:
        f, lx, ly = l["b"]
        if l["type"] == "hole" and f == ctx.floor["name"]:
            x, y = lx * T, ly * T
            d.ellipse([x + 1, y + 6, x + 14, y + 14], fill=QS[2], outline=QS[4])
            d.ellipse([x + 4, y + 7, x + 11, y + 11], fill=QS[1])
            d.point([(x + 6, y + 8), (x + 9, y + 9)], fill=QS[0])
            for k in range(0, 6, 2):
                d.point([(x + 7, y + k), (x + 9, y + k + 1)], fill=QS[1])
    for r in range(ctx.h):
        for c in range(ctx.w):
            ch = ctx.g(c, r)
            x, y = c * T, r * T - 14
            if ch == "Y":                        # saguaro cactus in a sand bed
                d.ellipse([x + 2, y + 24, x + 13, y + 29], fill=FLOOR1[3], outline=FLOOR1[4])
                d.rounded_rectangle([x + 6, y + 5, x + 10, y + 27], radius=2, fill=SCRUB[2], outline=IO)
                d.rounded_rectangle([x + 1, y + 10, x + 4, y + 20], radius=1, fill=SCRUB[2], outline=IO)
                d.rectangle([x + 3, y + 18, x + 6, y + 20], fill=SCRUB[2])
                d.line([x + 3, y + 21, x + 6, y + 21], fill=IO)
                d.rounded_rectangle([x + 12, y + 13, x + 15, y + 22], radius=1, fill=SCRUB[2], outline=IO)
                d.rectangle([x + 10, y + 19, x + 12, y + 21], fill=SCRUB[2])
                d.line([x + 10, y + 22, x + 12, y + 22], fill=IO)
                d.line([x + 7, y + 6, x + 7, y + 25], fill=SCRUB[0])
                d.line([x + 2, y + 11, x + 2, y + 18], fill=SCRUB[1])
                d.line([x + 13, y + 14, x + 13, y + 20], fill=SCRUB[1])
                d.point([(x + 8, y + 3), (x + 9, y + 4)], fill=TERRA[0])
                d.point([(x + 8, y + 4)], fill=(250, 120, 160))      # bloom
            elif ch == "B":                      # carved totem with fire bowl
                d.rectangle([x + 4, y + 14, x + 11, y + 29], fill=TIMBER[2], outline=IO)
                d.rectangle([x + 5, y + 18, x + 10, y + 21], fill=TURQ[2])
                d.line([x + 5, y + 18, x + 10, y + 18], fill=TURQ[0])
                d.point([(x + 6, y + 24), (x + 9, y + 24)], fill=IO)
                d.line([x + 7, y + 26, x + 8, y + 26], fill=CREAM[1])
                d.line([x + 5, y + 15, x + 5, y + 28], fill=TIMBER[0])
                d.rectangle([x + 1, y + 10, x + 14, y + 14], fill=TERRA[2], outline=IO)
                d.line([x + 2, y + 11, x + 13, y + 11], fill=EMBERI[3])
                d.polygon([(x + 8, y - 3), (x + 13, y + 10), (x + 2, y + 10)], fill=EMBERI[2], outline=EMBERI[3])
                d.polygon([(x + 8, y + 2), (x + 11, y + 10), (x + 5, y + 10)], fill=EMBERI[1])
                d.polygon([(x + 8, y + 6), (x + 9, y + 10), (x + 7, y + 10)], fill=EMBERI[0])
            elif ch == "G":                      # mesa monolith with turquoise inlay
                d.rectangle([x + 1, y + 23, x + 14, y + 29], fill=ROCK[3], outline=IO)
                d.line([x + 2, y + 24, x + 13, y + 24], fill=ROCK[1])
                d.polygon([(x + 2, y + 23), (x + 3, y + 14), (x + 5, y + 14), (x + 5, y + 7), (x + 10, y + 7),
                           (x + 10, y + 12), (x + 13, y + 12), (x + 13, y + 23)], fill=ROCK[1], outline=IO)
                d.line([x + 4, y + 17, x + 12, y + 17], fill=TERRA[2])
                d.line([x + 4, y + 20, x + 12, y + 20], fill=CREAM[2])
                d.line([x + 11, y + 13, x + 11, y + 22], fill=ROCK[3])
                d.rectangle([x + 7, y + 9, x + 8, y + 11], fill=TURQ[1])
            elif ch == "Q":                      # burrow boulder
                d.ellipse([x + 1, y + 16, x + 15, y + 29], fill=DARK_EARTH[2], outline=IO)
                d.ellipse([x + 3, y + 17, x + 11, y + 24], fill=DARK_EARTH[1])
                d.ellipse([x + 4, y + 18, x + 7, y + 20], fill=DARK_EARTH[0])
                d.line([x + 9, y + 25, x + 13, y + 23], fill=DARK_EARTH[3])
            elif ch == "R":                      # burrow stalagmite with roots
                d.polygon([(x + 8, y + 6), (x + 13, y + 29), (x + 3, y + 29)], fill=DARK_EARTH[1], outline=IO)
                d.line([x + 7, y + 11, x + 5, y + 27], fill=DARK_EARTH[0])
                d.line([x + 10, y + 16, x + 11, y + 27], fill=DARK_EARTH[3])
                d.line([x + 2, y + 29, x + 0, y + 30], fill=TIMBER[3])
                d.line([x + 13, y + 29, x + 15, y + 30], fill=TIMBER[3])


THEME = dict(
    name="Ground-Type Gym", archetype="Canyon Pueblo Mesa Hall",
    wall=SAND, accent=TERRA, trim=TIMBER, rock=ROCK, deck=DECK, glow=EMBER,
    emblem="mesa", door_spill=(224, 176, 116), door_inside=(76, 48, 40),
    exterior=exterior, sparks=sparks, night_lights=[X0 - 6, X0 + BW + 6, X0 + 17, X0 + 79],
    floor=FLOOR1, floor_px=floor1_px,
    hazard_px=hazard_px, hazard_ramp=QS, bridge_px=bridge_px,
    ledge=R5((230, 156, 108), (206, 124, 84), (176, 96, 68), (134, 70, 56), (94, 50, 48)),
    outside=R5((222, 192, 140), (206, 174, 124), (190, 158, 110), (160, 128, 94), (120, 94, 76)),
    stair_ramp=[CREAM[1], CREAM[2], CREAM[3], CREAM[4]],
    raised="CRQ",
    tiles={"#": t_rock, "C": t_rock, "P": t_pillar, ".": t_ground, "T": t_ground, "B": t_ground,
           "G": t_ground, "Y": t_ground, "R": t_ground, "Q": t_ground, "S": t_steps, "H": t_sinkhole},
    decor=decor,
    legend_extra={"C": "canyon rock outcrop (blocked)", "Y": "cactus (blocked)", "R": "stalagmite (blocked)", "Q": "boulder (blocked)",
                  "~": "quicksand (blocked)", "H": "sinkhole, one-way drop to B1F"},
    floors=[
        dict(name="1F", grid=[
            "OOOOOOOPKKPOOOOOOO",   # 0  leader alcove cut into the north rim
            "#######PKKP#######",   # 1
            "#CC.T.B....B..CCC#",   # 2  T5 watches the last step (4,3)-(4,4)
            "#C..........Y..YC#",   # 3
            "#LLLSLLLLLLLLLLLL#",   # 4  sandstone ledge, single step at col 4
            "#C..............D#",   # 5  leader terrace: stairs DOWN = arrival from the burrow
            "#~~~~~~~CC~~~~~~~#",   # 6  quicksand gulch seals the terrace off
            "#C~~~~~~~~~~~~~CC#",   # 7
            "#CC....Y.....CC..#",   # 8
            "#CH.T..........TC#",   # 9  sinkhole H guarded by T3; T2 watches the bridge head
            "#CC.............C#",   # 10
            "#~~~~~~~~~~~~~~|~#",   # 11 plank bridge over quicksand (col 15)
            "#~~~~~~~~~~~~~~|~#",   # 12
            "#..~~.......~~...#",   # 13 quicksand pits
            "#.T......CC....~~#",   # 14 T1 watches the ledge step
            "#C.......CC......#",   # 15
            "#LSLLLLLLLLLLLLLL#",   # 16 ledge, single step at col 2
            "#................#",   # 17
            "#Y..G........G..Y#",   # 18
            "#B..............B#",   # 19
            "########MM########",   # 20
            "OOOOOOOOOOOOOOOOOO"],  # 21
             trainers=[(2, 14, "down", 2), (15, 9, "down", 1), (4, 9, "left", 1), (4, 2, "down", 2)]),
        dict(name="B1F", grid=[
            "##############",   # 0
            "#CC......##.U#",   # 1  landing from the sinkhole at (3,1); stairs UP at (12,1)
            "#C...R...#QT.#",   # 2  T6 guards the last tile before the stairs
            "#.....Q..#LLS#",   # 3  ledge step (12,3)
            "#~~~~|~~~~#..#",   # 4  plank bridge over quicksand
            "#~~~~|~~~~~..#",   # 5
            "#C.T.....Q...#",   # 6  T4 watches the bridge foot
            "#B...RQ.....B#",   # 7
            "#CC.......R.Q#",   # 8
            "##############"],  # 9
             trainers=[(3, 6, "right", 2), (11, 2, "right", 1)]),
    ],
    links=[dict(type="hole", a=("1F", 2, 9), b=("B1F", 3, 1)),
           dict(type="stairs", a=("B1F", 12, 1), b=("1F", 16, 5))],
    battle_order=[0, 1, 2, 4, 5, 3],
    leader=("1F", 8, 1, "down"),
)
