"""Electric-Type Gym: Dynamo Power Plant.

Exterior: a two-level industrial power station. The lower block wears ribbed navy metal siding,
riveted panel seams, copper portholes, vertical copper conduits (with glowing sight-glass at
night) and a yellow/black hazard band; a hanging steel canopy with the bolt crest shelters the
sliding door. The setback roof is a railed catwalk; the upper control block carries a lit
control-room window strip. Crown: a stepped insulator spire with a lightning rod between twin
Tesla coils (toroids + plasma orbs) linked by arcs. Ground props: transformer boxes with
insulator stacks and warning lamps.

Interior: 1F generator hall (turbines, conveyors, charged-floor pits crossed by grating bridges);
the stairs to the 2F control catwalk sit behind an energy barrier 'X' that only drops once the
breaker switch '*' at the far end of the hall is stepped on. 2F: steel catwalks over the open
void above the hall, leading to the leader on the reactor dais.
"""
import math

from gymkit import (BW, DOOR_X0, DOOR_X1, G, IO, STEEL, T, X0, E, R5, chamfer_inside, emblem_plate, ell, lit, rgb, shade,
                    sphere_sculpt, door_px, t_hazard, t_floor, t_rim)

NAVY = R5((104, 118, 172), (80, 94, 150), (62, 74, 128), (46, 54, 102), (32, 36, 76))
NAVY2 = R5((130, 146, 196), (106, 122, 178), (86, 100, 156), (64, 76, 128), (44, 52, 98))
YEL = R5((255, 242, 130), (250, 212, 60), (226, 168, 34), (176, 116, 34), (116, 74, 40))
COP = R5((252, 196, 140), (228, 152, 92), (190, 110, 66), (140, 74, 54), (94, 48, 46))
STL = R5((214, 222, 236), (176, 186, 206), (138, 148, 176), (100, 108, 140), (66, 72, 104))
DECKR = R5((150, 160, 186), (124, 134, 164), (100, 110, 142), (78, 86, 118), (56, 62, 92))
GLOW = E([(255, 255, 232), (255, 244, 112), (250, 206, 52), (222, 150, 32), (160, 100, 40)])
PLASMA = E([(244, 252, 255), (176, 236, 255), (110, 196, 255), (80, 140, 236), (70, 90, 190)])
SCREEN = E([(220, 255, 250), (150, 236, 232), (90, 196, 208), (60, 140, 170)])
BLACK = (40, 38, 58)
GL = [rgb(c) for c in GLOW]
PL = [rgb(c) for c in PLASMA]

LOW_H = 34           # lower block height = catwalk deck
UP_X0, UP_X1, UP_D0, UP_D1, UP_H = 12, 84, 10, 32, 52
PORTHOLES = ((14, 15), (82, 15))      # centre x, centre h ; radius 6
PIPES = (5, 24, 69, 88)              # conduit x (3 px wide)
COILS = (22, 74)
CD = 21


# ================================================================ exterior
def hazard_stripe(x, h):
    return YEL[1] if ((x + h) // 3) % 2 == 0 else BLACK


def lower_front(th, t, night):
    def f(x, d, h, face):
        if face == "top":                       # catwalk grating
            if d > UP_D0 + 1:
                return DECKR[2]
            return STL[2] if x % 3 == 0 else STL[1] if (d % 3) else STL[3]
        side = 0
        if d > 0:
            side = -1 if x < BW // 2 else 1
        if side == 0 and DOOR_X0 <= x < DOOR_X1 and h < 28:
            return door_px(th, x - DOOR_X0, h, t, night)
        if h < 3:
            return STL[3] if (x // 6 + h) % 2 else STL[4]
        if h >= LOW_H - 2:
            return STL[0] if h == LOW_H - 1 else STL[1] if side <= 0 else STL[2]
        if 28 <= h <= 31:
            if h in (28, 31):
                return BLACK if h == 28 else YEL[0]
            return hazard_stripe(x, h) if side == 0 else (YEL[2] if side < 0 else YEL[3])
        for cx, ch in PORTHOLES:
            r2 = (x - cx) ** 2 + (h - ch) ** 2
            if r2 < 6.5 ** 2 and side == 0:
                if r2 >= 4.5 ** 2:              # thick copper rim with rivets
                    a = math.atan2(h - ch, x - cx)
                    if abs(math.sin(a * 3)) < 0.18 and r2 > 5.3 ** 2:
                        return COP[0]
                    return COP[1] if (x - cx) - (h - ch) < 0 else COP[3]
                if night:
                    return GLOW[1] if (x + h) % 5 else GLOW[0]
                if (x - cx + 1) ** 2 + (h - ch - 2) ** 2 < 3:
                    return (226, 244, 255)
                return (120, 176, 232) if h > ch else (80, 128, 200)
        if h == 27 or h == 4:
            return NAVY[4]
        k = 2 + side
        if side == 0:
            if x % 16 == 0:
                return NAVY[3]
            if x % 16 in (2, 14) and h % 6 == 2:
                return NAVY2[0]            # rivets
            m = x % 4
            k += -1 if m == 1 else 1 if m == 3 else 0
        if h >= 24:
            k += 1
        return NAVY[max(0, min(4, k))]
    return f


def upper_front(night):
    def f(x, d, h, face):
        if face == "top":
            if (x - 48) ** 2 / 4 + (d - CD) ** 2 < 5:
                return DECKR[1]
            if x % 8 == 0 or d % 8 == 0:
                return DECKR[3]
            return DECKR[1] if (x // 8 + d // 8) % 2 else DECKR[2]
        side = 0 if d == UP_D0 else (-1 if x < 48 else 1)
        hh = h - LOW_H
        if side == 0 and 18 <= x < 78 and 6 <= hh <= 12:      # control-room window strip
            if hh in (6, 12) or (x - 18) % 10 == 0:
                return STL[1] if hh == 12 else STL[3]
            if night:
                u = (x - 18) % 10
                return SCREEN[0] if (u + hh) % 7 == 0 else SCREEN[1] if hh > 9 else SCREEN[2]
            if (x - hh) % 10 in (0, 1):
                return (220, 240, 255)
            return (120, 180, 232) if hh > 9 else (80, 128, 200)
        if hh < 2:
            return NAVY2[4]
        if 3 <= hh <= 4 or 14 <= hh <= 15:
            return YEL[1 + (1 if side else 0) + (side > 0)] if hh in (4, 15) else YEL[3]
        if h >= UP_H - 3:
            return NAVY2[3]
        k = 2 + side - (1 if x % 6 == 0 and side == 0 else 0)
        return NAVY2[max(0, min(4, k))]
    return f


def railing(sc):
    def inside(x, d, h):
        if not (4 <= x < BW - 4 and 1 <= d < 2):
            return False
        return x % 10 == 4 or x % 10 == 5 or h in (LOW_H + 3, LOW_H + 6)

    def color(x, d, h, face):
        if face == "top":
            return YEL[0]
        return YEL[1] if h == LOW_H + 6 else YEL[2] if h == LOW_H + 3 else STL[2]
    sc.sculpt(4, BW - 4, 1, 2, LOW_H, LOW_H + 7, inside, color, shadow=False)


def conduits(sc, night):
    for px in PIPES:
        up = UP_X0 + 6 <= px < UP_X1 - 6

        def col(u, v, U, V, px=px):
            if v % 9 == 4 and u == 1:
                return GLOW[1] if night else COP[0]
            if v % 9 in (3, 5):
                return STL[1] if u < 2 else STL[3]          # brackets
            return COP[1] if u == 0 else COP[2] if u == 1 else COP[3]
        sc.box(px, px + 3, -3, 0, 3, LOW_H + 1, top=COP[0], front=col, edge=COP[4])
        if up:
            sc.box(px, px + 3, -3, UP_D0 - 3, LOW_H + 1, LOW_H + 4, top=COP[0], front=COP[2], edge=COP[4])
            sc.box(px, px + 3, UP_D0 - 3, UP_D0, LOW_H, UP_H + 1, top=COP[0], front=col, edge=COP[4])


def canopy(sc, th):
    def front(u, v, U, V):
        if v == V - 1:
            return STL[0]
        if v == 0:
            return STL[3]
        return hazard_stripe(u, v)
    sc.box(30, 66, -9, 0, 28, 32, top=lambda u, v, U, V: STL[1] if v % 3 else STL[2], front=front, edge=STL[4])
    for rx in (33, 63):                      # tension rods up to the wall
        for i in range(9):
            d = -8 + i
            sc.box(rx, rx + 1, d, d + 1, 32 + i // 2, 33 + i // 2, top=STL[0], front=STL[2])
    def disc_in(x, d, h):
        return (x - 48) ** 2 + ((h - 42) * 1.15) ** 2 < 12 ** 2
    def disc_col(x, d, h, face):
        rr = (x - 48) ** 2 + ((h - 42) * 1.15) ** 2
        if face == "top":
            return YEL[0]
        if rr > 10.3 ** 2:
            return YEL[1] if x - 48 < -(h - 42) else YEL[3]
        return NAVY[3] if rr > 8.6 ** 2 else NAVY[4]
    sc.sculpt(35, 62, -4, -2, 31, 54, disc_in, disc_col, shadow=False, edge=YEL[4])
    emblem_plate(sc, th, h0=32, d0=-7, d1=-4, cx=48, rim=YEL)


def transformer(sc, cx, night):
    x0, x1 = cx - 7, cx + 7

    def fins(u, v, U, V):
        if v == V - 1:
            return STL[0]
        if v < 2:
            return STL[4]
        if 8 <= v <= 10 and 3 <= u <= 10:
            return hazard_stripe(u, v)
        return NAVY2[1] if u % 3 == 0 else NAVY2[2] if u % 3 == 1 else NAVY2[3]
    sc.box(x0, x1, -6, 4, 0, 16, top=lambda u, v, U, V: NAVY2[1] if (u + v) % 5 else NAVY2[0], front=fins,
           edge=NAVY[4])
    for ix in (cx - 4, cx + 3):
        def ins_in(x, d, h, ix=ix):
            if h < 16 or h >= 28:
                return False
            r = 1.6 if (h - 16) % 3 == 2 else 2.6
            return ell(x, d, ix + 0.5, -1, r, 0.8) < 1

        def ins_col(x, d, h, face, ix=ix):
            if face == "top":
                return (236, 230, 220)
            return (226, 214, 196) if x <= ix else (170, 150, 150) if (h - 16) % 3 != 2 else (130, 110, 120)
        sc.sculpt(ix - 3, ix + 5, -4, 2, 16, 28, ins_in, ins_col, shadow=False)
        sphere_sculpt(sc, [(ix + 0.5, -1, 29.5, 1.8)],
                      lambda x, d, h, f, b, nx, ny: PLASMA[0] if ny > 0 else PLASMA[2], shadow=False)
    sc.box(cx - 2, cx + 2, -7, -6, 10, 13, front=GLOW[2] if night else YEL[2], edge=None)


def spire(sc):
    tiers = [(36, 61, 16, 28, 52, 58), (40, 57, 18, 26, 58, 66), (44, 53, 20, 23, 66, 74)]
    for (x0, x1, d0, d1, h0, h1) in tiers:
        def fr(u, v, U, V):
            if v == V - 1:
                return GLOW[2]
            if v == 0:
                return NAVY[4]
            if v % 4 == 2:
                return (236, 228, 214) if u < U // 3 else (196, 184, 180)     # insulator rings
            return NAVY[1] if u < 2 else NAVY[3] if u >= U - 2 else NAVY[2]
        sc.box(x0, x1, d0, d1, h0, h1, top=lambda u, v, U, V: YEL[0] if u in (0, U - 1) or v in (0, V - 1)
               else NAVY[1], front=fr, edge=NAVY[4])
    sc.box(47, 50, 21, 23, 74, 81, top=COP[0], front=lambda u, v, U, V: COP[0] if u == 0 else COP[2],
           edge=COP[4])
    sphere_sculpt(sc, [(48.5, 22, 83, 3)],
                  lambda x, d, h, f, b, nx, ny: PLASMA[0] if nx * nx + ny * ny < 0.3 else lit(PLASMA[1:], nx, ny),
                  shadow=False, rd=0.8)


def tesla(sc, cx):
    sc.box(cx - 7, cx + 8, CD - 6, CD + 6, UP_H, UP_H + 5,
           top=STL[1], front=lambda u, v, U, V: hazard_stripe(u, v) if 1 <= v <= 3 else STL[3], edge=STL[4])

    def coil_in(x, d, h):
        r = 3.2 if h < UP_H + 17 else 2
        return ell(x, d, cx + 0.5, CD, r, 0.8) < 1

    def coil_col(x, d, h, face):
        ramp = COP if (h % 2) else [COP[1], COP[2], COP[3], COP[4], COP[4]]
        return shade(ramp, x, cx + 0.5, face, 128, spread=1)
    sc.sculpt(cx - 4, cx + 6, CD - 4, CD + 4, UP_H + 5, UP_H + 20, coil_in, coil_col)

    def tor_in(x, d, h):                # flattened toroid
        rho = math.hypot(x - cx - 0.5, (d - CD) / 0.6)
        return (rho - 4.5) ** 2 + ((h - (UP_H + 21)) * 1.4) ** 2 < 3 ** 2

    def tor_col(x, d, h, face):
        if face == "top":
            return STL[0]
        return STL[1] if x < cx - 2 else STL[2] if x < cx + 3 else STL[3]
    sc.sculpt(cx - 9, cx + 11, CD - 6, CD + 7, UP_H + 18, UP_H + 25, tor_in, tor_col, shadow=False)
    sphere_sculpt(sc, [(cx + 0.5, CD, UP_H + 27, 3.6)],
                  lambda x, d, h, f, b, nx, ny: PLASMA[0] if (nx + 0.3) ** 2 + (ny - 0.3) ** 2 < 0.25
                  else lit(PLASMA[1:], nx, ny), shadow=False, rd=0.8)


def exterior(sc, th, t, night):
    # lower block (chamfered corners), catwalk deck on top
    sc.sculpt(0, BW, 0, 34, 0, LOW_H, chamfer_inside(0, BW, 0, 34, 0, LOW_H, 6), lower_front(th, t, night))
    # upper control block, set back
    sc.sculpt(UP_X0, UP_X1, UP_D0, UP_D1, LOW_H, UP_H,
              chamfer_inside(UP_X0, UP_X1, UP_D0, UP_D1, LOW_H, UP_H, 6), upper_front(night))
    # crown
    for cx in COILS:
        tesla(sc, cx)
    spire(sc)
    # roof vents
    for vx in (32, 64):
        sc.box(vx - 3, vx + 3, 13, 16, UP_H, UP_H + 4, top=lambda u, v, U, V: STL[3] if u % 2 else STL[1],
               front=lambda u, v, U, V: STL[2] if v % 2 else STL[3], edge=STL[4])
    conduits(sc, night)
    railing(sc)
    canopy(sc, th)
    transformer(sc, -6, night)
    transformer(sc, BW + 6, night)


def _arc(sc, a, b, seed, cols, amp=3.0):
    """Jagged lightning bolt between two screen points: zigzag vertices joined by solid lines."""
    (x0, y0), (x1, y1) = a, b
    n = max(3, int(math.hypot(x1 - x0, y1 - y0) // 4))
    pts = []
    for i in range(n + 1):
        q = i / n
        off = 0 if i in (0, n) else amp * (1 if (i + seed) % 2 else -1) * (0.5 + ((i * 7 + seed) % 3) / 4)
        pts.append((round(x0 + (x1 - x0) * q), round(y0 + (y1 - y0) * q + off)))
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        m = max(abs(bx - ax), abs(by - ay), 1)
        for k in range(m + 1):
            x, y = round(ax + (bx - ax) * k / m), round(ay + (by - ay) * k / m)
            sc.put(x, y + 1, cols[2])
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        m = max(abs(bx - ax), abs(by - ay), 1)
        for k in range(m + 1):
            x, y = round(ax + (bx - ax) * k / m), round(ay + (by - ay) * k / m)
            sc.put(x, y, cols[0] if k % 3 else cols[1])


def sparks(sc, th, night):
    def scr(x, d, h):
        return X0 + x, G - h - d
    tip = scr(48, 22, 83)
    for i, cx in enumerate(COILS):
        orb = scr(cx + (5 if i == 0 else -4), CD, UP_H + 28)
        _arc(sc, orb, tip if i == 0 else tip, 3 + i * 5, (PLASMA[0], GLOW[1], PLASMA[2]), amp=4)
    # small crackles around the orbs and transformers
    for (x, d, h) in ((COILS[0] - 6, CD, UP_H + 32), (COILS[1] + 7, CD, UP_H + 31), (-10, -1, 31),
                      (-3, -1, 30), (BW + 2, -1, 31), (BW + 9, -1, 30)):
        sx, sy = scr(x, d, h)
        for dx, dy in ((0, 0), (1, -1), (0, -2), (1, -3)):
            sc.put(sx + dx, sy + dy, PLASMA[1] if dy else GLOW[0])


# ================================================================ interior
FLOOR = R5((196, 204, 222), (172, 180, 202), (144, 152, 178), (110, 118, 148), (78, 84, 112))
CATWALK = R5((220, 226, 236), (186, 194, 212), (150, 158, 182), (112, 120, 150), (78, 84, 114))
PIT = R5((255, 250, 170), (250, 214, 70), (70, 80, 140), (40, 46, 90), (24, 28, 60))
VOID = [(14, 14, 34), (22, 24, 50), (34, 38, 72), (52, 58, 100)]


def floor_px(gx, gy):
    """1F steel diamond-plate tile (exact 16 px repeat)."""
    x, y = gx % T, gy % T
    if x == 0 or y == 0:
        return FLOOR[0]
    if x == T - 1 or y == T - 1:
        return FLOOR[3]
    if (x, y) in ((2, 2), (13, 2), (2, 13), (13, 13)):
        return FLOOR[4]
    if (x, y) in ((2, 1), (13, 1), (1, 2), (12, 2)):
        return FLOOR[0]
    if (x + y) % 6 == 0 and (x - y) % 4 == 0 and 3 < x < 13 and 3 < y < 13:
        return FLOOR[2]
    if (x + y) % 6 == 1 and (x - y) % 4 == 1 and 3 < x < 13 and 3 < y < 13:
        return FLOOR[0]
    return FLOOR[1]


def catwalk_px(gx, gy):
    """2F platform: grating with a darker cross-hatch."""
    x, y = gx % T, gy % T
    if x == 0 or y == 0:
        return CATWALK[0]
    if x == T - 1 or y == T - 1:
        return CATWALK[3]
    if x % 3 == 0 or y % 3 == 0:
        return CATWALK[2]
    return CATWALK[1]


ZIG = [7, 6, 5, 4, 5, 6, 7, 8, 9, 10, 11, 10, 9, 8, 7, 7]


def hazard_px(gx, gy):
    """Charged pit: deep navy with a crackling bolt line, repeating every tile."""
    x, y = gx % T, gy % T
    z = ZIG[x]
    if y == z:
        return PIT[0]
    if abs(y - z) == 1:
        return PIT[1]
    if (x + y * 3) % 11 == 0:
        return PIT[2]
    return PIT[3] if (y // 4) % 2 == 0 else PIT[4]


def void_px(gx, gy):
    """2F: the generator hall far below (dark, faint plates, coil glints)."""
    x, y = gx % T, gy % T
    if (x, y) in ((4, 9), (12, 3)):
        return PL[2]
    if x == 0 or y == 0:
        return VOID[2]
    if (x, y) in ((8, 8), (8, 7), (7, 8)):
        return VOID[3]
    return VOID[1] if (x // 8 + y // 8) % 2 else VOID[0]


def tile_floor(ctx, c, r):
    if ctx.floor["name"] == "2F":
        ctx.fill(c, r, catwalk_px)
        if ctx.g(c, r - 1) in "#P":
            for x in range(T):
                ctx.p[c * T + x, r * T] = CATWALK[3]
        # yellow safety edge toward the void
        X, Y = c * T, r * T
        for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if ctx.g(c + dc, r + dr) == "~":
                for i in range(T):
                    if dc:
                        xx = X + (T - 1 if dc > 0 else 0)
                        ctx.p[xx, Y + i] = IO
                        ctx.p[xx - dc, Y + i] = YEL[1] if (i // 3) % 2 else BLACK
                    else:
                        yy = Y + (T - 1 if dr > 0 else 0)
                        ctx.p[X + i, yy] = IO
                        ctx.p[X + i, yy - dr] = YEL[1] if (i // 3) % 2 else BLACK
    else:
        t_floor(ctx, c, r)


def tile_hazard(ctx, c, r):
    th = ctx.th
    if ctx.floor["name"] == "2F":
        saved = th["hazard_px"]
        th["hazard_px"] = void_px
        t_hazard(ctx, c, r)
        th["hazard_px"] = saved
    else:
        t_hazard(ctx, c, r)


def tile_bridge(ctx, c, r):
    tile_hazard(ctx, c, r)
    horizontal = ctx.g(c, r) == "="
    X, Y, p = c * T, r * T, ctx.p
    for y in range(T):
        for x in range(T):
            u, v = (y, x) if horizontal else (x, y)
            if u in (1, 14):
                col = IO
            elif u in (2, 13):
                col = YEL[1] if (v // 3) % 2 else BLACK
            elif 3 <= u <= 12:
                col = STL[3] if (u % 3 == 0 or v % 3 == 0) else STL[1]
            else:
                continue
            p[X + x, Y + y] = col


def tile_rim(ctx, c, r):
    t_rim(ctx, c, r, NAVY)
    # yellow hazard trim along the inner front face of the rim
    X, Y = c * T, r * T
    if ctx.g(c, r + 1) not in "#OP":
        for x in range(T):
            ctx.p[X + x, Y + 11] = YEL[1] if ((X + x) // 3) % 2 else BLACK


def tile_conveyor(ctx, c, r):
    """'C' conveyor belt running E-W (blocked), short south face."""
    X, Y, p = c * T, r * T, ctx.p
    face = ctx.g(c, r + 1) != "C"
    for y in range(T):
        for x in range(T):
            gx = X + x
            if y < 2:
                col = STL[0] if y == 0 else STL[1]
            elif y < 11:
                col = (54, 56, 78) if (gx - y) % 6 in (0, 1) and 3 < y < 10 else (36, 38, 58)
                if y in (2, 10):
                    col = STL[3]
            elif face:
                col = IO if y == T - 1 else STL[2] if (gx % 8) in (2, 3) else STL[3]
                if y == 11:
                    col = YEL[1] if (gx // 3) % 2 else BLACK
            else:
                col = (36, 38, 58)
            p[X + x, Y + y] = col
    for dc, xx in ((-1, 0), (1, T - 1)):
        if ctx.g(c + dc, r) != "C":
            for y in range(T):
                p[X + xx, Y + y] = IO
                if 0 < y < T - 1:
                    p[X + xx - dc, Y + y] = COP[2]


def _turbine(ctx, c, r):
    """2-tile-tall generator (top tile at r): copper drum seen from above with a short front face."""
    d, X, Y = ctx.d, c * T, r * T
    d.rectangle([X + 1, Y + 2, X + 14, Y + 30], fill=NAVY[2], outline=IO)
    d.rectangle([X + 2, Y + 3, X + 13, Y + 4], fill=NAVY[0])
    d.ellipse([X + 2, Y + 5, X + 13, Y + 18], fill=COP[2], outline=COP[4])
    d.ellipse([X + 3, Y + 6, X + 11, Y + 15], fill=COP[1])
    for i in range(4):
        a = i * math.pi / 2 + 0.5
        d.line([X + 7.5, Y + 11.5, X + 7.5 + 4 * math.cos(a), Y + 11.5 + 4 * math.sin(a)], fill=COP[3])
    d.ellipse([X + 6, Y + 10, X + 9, Y + 13], fill=GL[1], outline=COP[4])
    for yy in range(Y + 21, Y + 30):
        for xx in range(X + 2, X + 14):
            ctx.p[xx, yy] = NAVY[3] if (xx % 3) else NAVY[4]
    d.line([X + 2, Y + 20, X + 13, Y + 20], fill=NAVY[1])
    d.rectangle([X + 4, Y + 23, X + 11, Y + 25], fill=PL[1], outline=IO)
    d.line([X + 1, Y + 30, X + 14, Y + 30], fill=IO)


def _console(ctx, c, r):
    d, X, Y = ctx.d, c * T, r * T
    d.rectangle([X + 1, Y - 6, X + 14, Y + 14], fill=STL[2], outline=IO)
    d.rectangle([X + 2, Y - 5, X + 13, Y + 3], fill=STL[1])
    d.rectangle([X + 3, Y - 4, X + 12, Y + 2], fill=(40, 70, 100), outline=STL[3])
    d.line([X + 4, Y - 1, X + 6, Y - 3, X + 8, Y, X + 11, Y - 3], fill=rgb(SCREEN[1]))
    d.rectangle([X + 2, Y + 4, X + 13, Y + 13], fill=STL[3])
    for i, col in enumerate((GL[1], PL[1], (240, 90, 80))):
        d.rectangle([X + 3 + i * 4, Y + 6, X + 4 + i * 4, Y + 7], fill=col)
    d.line([X + 2, Y + 10, X + 13, Y + 10], fill=YEL[1])


def _coil_pillar(ctx, c, r):
    d, X, Y = ctx.d, c * T, r * T
    d.rectangle([X + 3, Y + 4, X + 12, Y + 15], fill=STL[3], outline=IO)
    for yy in range(Y - 4, Y + 6, 2):
        d.line([X + 5, yy, X + 10, yy], fill=COP[1])
        d.line([X + 5, yy + 1, X + 10, yy + 1], fill=COP[3])
    d.rectangle([X + 5, Y - 4, X + 10, Y + 5], outline=IO)
    d.ellipse([X + 2, Y - 11, X + 13, Y - 2], fill=PL[2], outline=IO)
    d.ellipse([X + 4, Y - 9, X + 9, Y - 5], fill=PL[0])


def _reactor(ctx, c, r):
    """Reactor core behind the leader dais (drawn over the north rim)."""
    d, X, Y = ctx.d, c * T, r * T
    d.rectangle([X - 4, Y - 14, X + 36, Y + 2], fill=NAVY[3], outline=IO)
    d.ellipse([X + 4, Y - 13, X + 27, Y + 1], fill=STL[2], outline=IO)
    d.ellipse([X + 7, Y - 11, X + 24, Y - 1], fill=PL[2], outline=PL[3])
    d.ellipse([X + 11, Y - 9, X + 20, Y - 3], fill=PL[0])
    for xx in (X - 2, X + 30):
        d.rectangle([xx, Y - 12, xx + 3, Y + 1], fill=COP[2], outline=IO)


def decor(ctx):
    name = ctx.floor["name"]
    for r in range(ctx.h):
        for c in range(ctx.w):
            ch = ctx.g(c, r)
            if ch == "G" and ctx.g(c, r - 1) != "G":
                _turbine(ctx, c, r)
            elif ch == "B":
                _console(ctx, c, r)
            elif ch == "Q":
                _coil_pillar(ctx, c, r)
    if name == "2F":
        _reactor(ctx, 6, 1)
        for (c, r) in ((4, 7), (8, 8), (11, 7), (6, 3 + 0)):
            if ctx.g(c, r) == "~" and ctx.g(c, r - 1) == "~":
                X, Y = c * T, r * T
                ctx.d.ellipse([X + 2, Y + 2, X + 13, Y + 13], outline=(70, 50, 60))
                ctx.d.ellipse([X + 4, Y + 4, X + 11, Y + 11], fill=(60, 44, 56), outline=(96, 64, 62))
                ctx.d.ellipse([X + 6, Y + 6, X + 9, Y + 9], fill=PL[3])


def tile_base(ctx, c, r):
    tile_floor(ctx, c, r)


THEME = dict(
    name="Electric-Type Gym", archetype="Dynamo Power Plant",
    wall=NAVY, accent=YEL, trim=COP, rock=STL, deck=DECKR, glow=GLOW, rim=NAVY,
    emblem="bolt", door_spill=(230, 220, 150), door_inside=(34, 40, 70),
    exterior=exterior, sparks=sparks,
    night_lights=[X0 - 6, X0 + BW + 6],
    floor=FLOOR, floor_px=floor_px, hazard_px=hazard_px, hazard_ramp=PIT,
    ledge=STL, outside=R5((120, 124, 140), (100, 104, 122), (84, 88, 106), (66, 70, 88), (48, 52, 70)),
    stair_ramp=[STL[0], STL[1], STL[2], STL[3]],
    tiles={"#": tile_rim, ".": tile_floor, "T": tile_floor, "~": tile_hazard, "|": tile_bridge,
           "=": tile_bridge, "C": tile_conveyor, "G": tile_base, "B": tile_base, "Q": tile_base},
    decor=decor,
    legend_extra={"~": "charged pit / open void (blocked)", "C": "conveyor belt (blocked)",
                  "G": "turbine generator (blocked)", "B": "control console (blocked)",
                  "Q": "tesla coil pillar (blocked)", "X": "energy barrier (drops after switch)"},
    floors=[
        dict(name="1F", grid=[
            "##################",   # 0
            "#UQCCCCCCCCCCCCB*#",   # 1  stairs up behind the barrier, breaker switch far right
            "#X...............#",   # 2  energy barrier in front of the stairs
            "#~~~~~~~~~~~~|~~~#",   # 3
            "#~~~~~~~~~~~~|~~~#",   # 4
            "#G..........T...G#",   # 5  T3 watches the bridge foot (13,5)
            "#G...CCCCC......G#",   # 6
            "#~~|~~~~~~~~~~~~~#",   # 7
            "#~~|~~~~~~~~~~~~~#",   # 8
            "#B..T....CCCC...B#",   # 9  T2 watches the bridge foot (3,9)
            "#G..............G#",   # 10
            "#G~~~~~~~~~~~|~~G#",   # 11
            "#...........T....#",   # 12 T1 watches the bridge foot (13,12)
            "#B..B.....B.....B#",   # 13
            "########MM########",   # 14
            "OOOOOOOOOOOOOOOOOO"],  # 15
             trainers=[(12, 12, "right", 1), (4, 9, "left", 1), (12, 5, "right", 1)]),
        dict(name="2F", grid=[
            "##############",   # 0
            "#B~~~QKKQ~~~B#",   # 1  reactor dais between coil pillars
            "#~~~~.KK.~~~~#",   # 2
            "#~~~~.....~~~#",   # 3
            "#~~~~~~~~|~~~#",   # 4
            "#~.======.T~~#",   # 5  T5 watches the junction (9,5)
            "#~|~~~~~~~~~~#",   # 6
            "#~|~~~~~~~~~~#",   # 7
            "#~|~~~~~~~~~~#",   # 8
            "#~.T~~~~~~~~~#",   # 9  T4 watches the catwalk head (2,9)
            "#~..=======.D#",   # 10 arrival from 1F
            "##############"],  # 11
             trainers=[(3, 9, "left", 1), (10, 5, "left", 1)]),
    ],
    links=[dict(type="stairs", a=("1F", 1, 1), b=("2F", 12, 10))],
    leader=("2F", 6, 2, "down"),
)
