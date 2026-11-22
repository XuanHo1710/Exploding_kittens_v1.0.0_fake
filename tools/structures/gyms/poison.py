"""Poison-Type Gym: Toadstool Bog Hall (swamp apothecary).

Exterior: a crooked, barrel-bulging plank cottage-hall bound by verdigris hoops, under a shaggy
leaning moss-thatch mound that drips glowing slime. Giant purple toadstools with glowing spots
burst from the thatch beside two bubbling toxic pools. Round bottle-glass portholes glow green at
night. A raised boardwalk porch with mushroom-lamp posts leads to the door under a round bubble
sign; brewing vats lean on both flanks and iron cauldrons bubble in front.

Interior: 1F apothecary hall (bottle shelves, vats, a sludge gutter crossed by a metal grate)
-> stairs DOWN to the B1F toxic bog sewer (mossy stepping stones, a grate catwalk) -> stairs UP to
the sealed 1F brewing lab -> one-way slime chute H drops onto the leader's island in the bog.
"""
import math

from gymkit import (DEFAULT_TILES, DOOR_X0, DOOR_X1, IO, STEEL, T, X0, E, R5, cl, door_px, lit, nz, rgb,
                    sphere_sculpt, t_bridge, t_floor, t_hazard)

PLANK = R5((134, 104, 116), (110, 84, 100), (90, 66, 86), (70, 50, 70), (50, 34, 54))
ACC = R5((206, 146, 236), (170, 104, 214), (134, 72, 184), (98, 50, 142), (66, 36, 102))
HOOP = R5((182, 214, 180), (132, 174, 150), (94, 132, 118), (64, 94, 92), (42, 62, 66))
MOSS = R5((176, 192, 100), (138, 162, 78), (104, 128, 64), (76, 98, 56), (52, 68, 46))
CAP = R5((222, 156, 244), (188, 110, 228), (150, 74, 200), (112, 50, 160), (74, 32, 114))
STEM = R5((240, 232, 208), (214, 202, 178), (180, 166, 150), (140, 124, 120), (98, 86, 96))
ROCK = R5((140, 130, 140), (112, 102, 116), (88, 78, 96), (64, 56, 76), (44, 38, 56))
IRON = R5((128, 124, 150), (94, 90, 116), (68, 64, 90), (48, 44, 68), (32, 28, 46))
WOODP = R5((196, 156, 116), (164, 124, 92), (130, 94, 74), (96, 66, 58), (66, 44, 46))
GLOW = E([(240, 255, 200), (190, 255, 110), (130, 230, 60), (80, 180, 50), (50, 120, 50)])
GLI = [rgb(c) for c in GLOW]
BOTTLE = [(226, 250, 210), (166, 222, 168), (118, 184, 138), (82, 140, 110)]

BCX = 48                                    # body centre x


# ================================================================ exterior
def body_hw(h):
    return 47 + 3 * math.sin(math.pi * min(max(h, 0), 40) / 40)


def curve_d(e, hw, flat=24, depth=12):
    return 0 if e < flat else depth * ((e - flat) / max(1, hw - flat)) ** 2


def fringe(x):
    return nz(x // 3, 7, 3) % 4


EAVE_HW = 53
DRIPS = [(3, 6), (15, 4), (26, 7), (39, 3), (66, 5), (72, 7), (83, 4), (94, 6)]
WINDOWS = [(18, 18), (78, 18)]
POOLS = [(29, 8, 6), (70, 9, 5)]


def eave_d(x):
    return -6 + curve_d(abs(x - BCX), EAVE_HW, 26, 13)


def body(sc, th, t, night):
    def inside(x, d, h):
        e = abs(x - BCX)
        hw = body_hw(h)
        return e < hw and curve_d(e, hw) <= d < 32

    def color(x, d, h, face):
        if face == "top":
            return PLANK[1]
        if d == 0 and DOOR_X0 <= x < DOOR_X1 and h < 28:
            return door_px(th, x - DOOR_X0, h, t, night)
        for wx, wh in WINDOWS:
            dd = (x - wx) ** 2 + (h - wh) ** 2
            if dd < 7.6 ** 2:
                if dd > 5.6 ** 2:
                    lt = (x - wx) + (wh - h) < 0
                    return HOOP[1] if lt else HOOP[3]
                if x == wx or h == wh:
                    return HOOP[2]
                if night:
                    return GLOW[0] if dd < 5 else GLOW[1] if (x + h) % 5 else GLOW[2]
                if (x - wx + 2) ** 2 + (h - wh - 2) ** 2 < 3:
                    return BOTTLE[0]
                return BOTTLE[1] if h > wh else BOTTLE[2] if x < wx else BOTTLE[3]
        s = (x - BCX) / body_hw(h)
        k = 1 if s < -0.45 else 2 if s < 0.45 else 3
        if s > 0.86:
            k = 4
        elif s < -0.86:
            k = 2
        if h < 3:
            return ROCK[3] if (x // 5 + h) % 2 else ROCK[4]
        for b0 in (6, 29):
            if b0 <= h < b0 + 3:
                if (x - 2) % 9 == 0 and h == b0 + 1:
                    return HOOP[0]
                return HOOP[min(4, (0 if h == b0 + 2 else 1 if h == b0 + 1 else 2) + max(0, k - 1))]
        if h >= 35:
            return PLANK[4]
        if h >= 33:
            return PLANK[min(4, k + 1)]
        jog = 2 * ((h // 11) % 2)
        m = (x + jog) % 6
        if m == 0:
            k += 1
        elif m == 1:
            k -= 1
        elif m == 3 and (h % 11) == 5 and nz((x + jog) // 6, h // 11, 2) > 150:
            k += 2
        return PLANK[max(0, min(4, k))]
    sc.sculpt(-2, 99, 0, 32, 0, 40, inside, color)


def roof(sc, th):
    MT = 72                                   # thatch peak height

    def lean(h):
        return BCX + (h - 44) * 0.22

    def rad(x, d, h):
        nx, nd = (x - lean(h)) / 52, (d - 16) / 21
        a = math.atan2(nd, nx)
        return math.hypot(nx, nd) * (1 + 0.05 * math.sin(5 * a + 1) + 0.03 * math.sin(11 * a)), a

    def in_mound(x, d, h):
        if h < 44:
            return False
        r, _ = rad(x, d, h)
        return r < 1 and h < 44 + (MT - 44) * (1 - r ** 1.25)

    def in_eave(x, d, h):
        e = abs(x - BCX)
        return e < EAVE_HW - (h - 44) * 0.6 * (h > 44) and 34 + fringe(x) <= h < 48 and eave_d(x) <= d < 36

    def inside(x, d, h):
        return in_eave(x, d, h) or in_mound(x, d, h)

    def color(x, d, h, face):
        r, a = rad(x, d, h)
        nx = (x - lean(h)) / 52
        if face == "top":
            k = 1 if nx < -0.25 else 2 if nx < 0.35 else 3
            if r < 0.22:
                k -= 1
            if h % 5 == 0:
                k += 1
            elif int((a + 4) * 22) % 4 == 0:
                k += 1
            elif cl(x, d, 9) > 214:
                k -= 1
            return MOSS[max(0, min(4, k))]
        # front faces: shaggy straw courses with slime drips
        for dx, ln in DRIPS:
            if dx <= x <= dx + 1 and h < 34 + fringe(dx) + ln:
                return GLOW[1] if x == dx else GLOW[2]
        base = 1 if nx < -0.55 else 2 if nx < 0.3 else 3
        if h < 48 and d <= eave_d(x) + 1:           # eave skirt
            if h <= 34 + fringe(x):
                return MOSS[4]
            if (h - fringe(x)) % 5 == 0:
                base += 1
        elif h % 5 == 0:
            base += 1
        if (x * 3 + (h // 5) * 5) % 7 == 0:
            base += 1
        return MOSS[max(0, min(4, base))]
    sc.sculpt(-7, 104, -7, 38, 34, MT + 1, inside, color)
    return in_mound


def toadstool(sc, mx, md, h0, stem_top, R, CH, lean=0.0, sr=4):
    """Stem rising from the thatch + gilled underside + spotted domed cap (emissive spots)."""
    def stem_in(x, d, h):
        cx = mx + lean * (h - h0) / max(1, stem_top - h0)
        return ((x - cx) / sr) ** 2 + ((d - md) / (sr * 0.7)) ** 2 < 1

    def stem_col(x, d, h, face):
        cx = mx + lean * (h - h0) / max(1, stem_top - h0)
        dx = x - cx
        if face == "top":
            return STEM[0]
        k = 0 if dx < -sr * 0.4 else 1 if dx < sr * 0.3 else 2
        if (h - h0) % 7 == 0:
            k += 1
        return STEM[k]
    sc.sculpt(int(mx - sr - 2 - abs(lean)), int(mx + sr + 3 + abs(lean)), int(md - sr), int(md + sr + 1),
              h0, stem_top, stem_in, stem_col)
    cx = mx + lean
    base = stem_top - 3

    def gill_in(x, d, h):
        return ((x - cx) / (R - 2)) ** 2 + ((d - md) / ((R - 2) * 0.55)) ** 2 < 1

    def gill_col(x, d, h, face):
        return STEM[3] if int(x - cx) % 3 == 0 else STEM[2]
    sc.sculpt(int(cx - R), int(cx + R + 1), int(md - R * 0.6), int(md + R * 0.6) + 1, base - 2, base,
              gill_in, gill_col, shadow=False)

    def cap_in(x, d, h):
        return h >= base and ((x - cx) / R) ** 2 + ((d - md) / (R * 0.55)) ** 2 + ((h - base) / CH) ** 2 < 1

    def cap_col(x, d, h, face):
        if face == "front" and h < base + 2:
            return CAP[4] if h == base else CAP[3]
        yy = h + d - base - md                 # screen-space rows keep the spots round
        sy = int(yy // 5)
        sx = int((x - cx + 60 + (sy % 2) * 3) // 7)
        ox, oy = (x - cx + 60 + (sy % 2) * 3) - sx * 7 - 3.5, yy - sy * 5 - 2.5
        if nz(sx, sy, int(mx)) > 120 and ox * ox + oy * oy * 1.4 < 4.5 and abs(x - cx) < R - 2.5 and h > base + 2:
            return GLOW[0] if ox * ox + oy * oy < 1.6 else GLOW[1]
        return lit(CAP, (x - cx) / R, (h - base) / CH + (0.25 if face == "top" else 0))
    sc.sculpt(int(cx - R - 1), int(cx + R + 2), int(md - R * 0.6) - 1, int(md + R * 0.6) + 2, base, base + CH + 1,
              cap_in, cap_col)


def bubbles(sc, pts):
    sphere_sculpt(sc, pts, lambda x, d, h, f, b, nx, ny: GLOW[0] if (nx < -0.1 and ny > 0.1) else
                  GLOW[1] if ny > -0.4 else GLOW[3], shadow=False, rd=0.9)


def pool(sc, px, pd, pr, hb):
    """Bubbling toxic pool: a mossy stone basin sunk into the thatch with glowing sludge + bubbles."""
    def inside(x, d, h):
        return ((x - px) / pr) ** 2 + ((d - pd) / (pr * 0.6)) ** 2 < 1

    def color(x, d, h, face):
        q = ((x - px) / pr) ** 2 + ((d - pd) / (pr * 0.6)) ** 2
        if face == "top":
            if q > 0.62:
                return ROCK[1] if x < px else ROCK[2]
            if (x - px + 2) ** 2 + (d - pd - 1) ** 2 < 2:
                return GLOW[0]
            return GLOW[1] if q < 0.3 else GLOW[2]
        return ROCK[2] if x < px else ROCK[3]
    sc.sculpt(px - pr - 1, px + pr + 2, int(pd - pr * 0.6) - 1, int(pd + pr * 0.6) + 2, hb, hb + 3, inside, color,
              shadow=False)
    bubbles(sc, [(px - 2, pd, hb + 6, 2.3), (px + 2, pd, hb + 10, 1.6), (px - 1, pd, hb + 14, 1.1)])


def vat(sc, cx, cd, H, r=8):
    def inside(x, d, h):
        return ((x - cx) / r) ** 2 + ((d - cd) / (r * 0.6)) ** 2 < 1

    def color(x, d, h, face):
        q = ((x - cx) / r) ** 2 + ((d - cd) / (r * 0.6)) ** 2
        if face == "top":
            if q > 0.62:
                return WOODP[1] if x < cx else WOODP[2]
            return GLOW[1] if q < 0.25 else GLOW[2]
        dx = (x - cx) / r
        k = 0 if dx < -0.55 else 1 if dx < 0.15 else 2 if dx < 0.7 else 3
        if h in (3, 4, H // 2, H // 2 + 1, H - 4, H - 3):
            return IRON[min(4, k + (1 if h in (3, H // 2, H - 4) else 0))]
        if int(x - cx + 20) % 3 == 0:
            k += 1
        return WOODP[min(4, k)]
    sc.sculpt(cx - r - 1, cx + r + 2, int(cd - r * 0.6) - 1, int(cd + r * 0.6) + 2, 0, H, inside, color)


def cauldron(sc, cx, cd, r=7):
    for lx in (-4, 3):
        sc.box(cx + lx, cx + lx + 2, cd - 1, cd + 1, 0, 3, top=IRON[3], front=IRON[3], edge=IRON[4])

    def inside(x, d, h):
        return 2 <= h < 11 and ((x - cx) / r) ** 2 + ((d - cd) / (r * 0.6)) ** 2 + ((h - 6.5) / 5.6) ** 2 < 1.15

    def color(x, d, h, face):
        q = ((x - cx) / r) ** 2 + ((d - cd) / (r * 0.6)) ** 2
        if face == "top":
            if h >= 10 and q < 0.55:
                return GLOW[0] if (x - cx + 2) ** 2 + (d - cd) ** 2 < 2 else GLOW[1] if q < 0.3 else GLOW[2]
            return IRON[0] if x < cx else IRON[1]
        if h >= 9:
            return IRON[0] if x < cx else IRON[2]
        return lit(IRON, (x - cx) / r, (h - 6.5) / 5.6)
    sc.sculpt(cx - r - 2, cx + r + 3, int(cd - r * 0.6) - 2, int(cd + r * 0.6) + 3, 2, 11, inside, color)
    bubbles(sc, [(cx - 2, cd, 13, 2.2), (cx + 2, cd, 16, 1.6), (cx - 1, cd, 19, 1.1)])


def mushroom_lamp(sc, cx, cd, h0, R=5):
    def inside(x, d, h):
        return h >= h0 and ((x - cx) / R) ** 2 + ((d - cd) / (R * 0.6)) ** 2 + ((h - h0) / 4.5) ** 2 < 1

    def color(x, d, h, face):
        if face == "front" and h < h0 + 1:
            return GLOW[1]
        if face == "top" and ((x - cx + 1.5) ** 2 < 2 or (x - cx - 2) ** 2 < 1) and abs(d - cd) < 1.5:
            return GLOW[0]
        return (lit(CAP, (x - cx) / R, (h - h0) / 4.5 + 0.2), True)
    sc.sculpt(cx - R - 1, cx + R + 2, int(cd - R * 0.6) - 1, int(cd + R * 0.6) + 2, h0, h0 + 6, inside, color,
              shadow=False)


def exterior(sc, th, t, night):
    body(sc, th, t, night)
    # side brewing vats with feed pipes into the walls
    for cx, px0, px1 in ((-6, 1, 7), (102, 89, 95)):
        sc.box(px0, px1, 6, 8, 21, 24, top=HOOP[0], front=lambda u, v, U, V: HOOP[1] if v == 2 else HOOP[3],
               edge=HOOP[4])
        vat(sc, cx, 7, 24)
    in_mound = roof(sc, th)
    # crown: toadstool cluster bursting from the thatch (back to front), bubbling pools
    toadstool(sc, 51, 20, 50, 76, 20, 11, lean=-2, sr=5)
    toadstool(sc, 19, 15, 44, 64, 12, 8, lean=-4, sr=3)
    toadstool(sc, 79, 16, 44, 60, 11, 8, lean=3, sr=3)
    toadstool(sc, 10, 13, 42, 52, 6, 4, lean=-2, sr=2)
    toadstool(sc, 89, 15, 42, 51, 5, 4, lean=2, sr=2)
    for px, pd, pr in POOLS:
        hb = next(h for h in range(80, 34, -1) if in_mound(px, pd, h)) - 1
        pool(sc, px, pd, pr, hb)
    # slime drips hanging from the thatch
    for dx, ln in DRIPS:
        hb = 34 + fringe(dx)
        sc.box(dx, dx + 2, int(eave_d(dx)) - 1, int(eave_d(dx)), hb - ln, hb,
               top=GLOW[1], front=lambda u, v, U, V: GLOW[2] if v == 0 else GLOW[1] if u == 0 else GLOW[2],
               shadow=False)
    # boardwalk porch
    sc.box(16, 80, -12, 0, 0, 3,
           top=lambda u, v, U, V: WOODP[3] if v % 3 == 2 else WOODP[1] if (u + v * 5) % 13 else WOODP[2],
           front=lambda u, v, U, V: WOODP[2] if v == 2 else WOODP[3], edge=WOODP[4])
    for bx in (17, 75):
        sc.box(bx, bx + 4, -11, -8, 3, 11,
               top=WOODP[0], front=lambda u, v, U, V: WOODP[1] if u == 0 else WOODP[3] if u == 3 else WOODP[2],
               edge=WOODP[4])
        sc.box(bx - 1, bx + 5, -12, -7, 11, 13, top=HOOP[0], front=HOOP[2], edge=HOOP[4])
        mushroom_lamp(sc, bx + 2, -9, 13)
    # lintel + round bubble sign over the door
    sc.box(29, 67, -1, 0, 28, 31, top=WOODP[1],
           front=lambda u, v, U, V: WOODP[1] if v == 2 else WOODP[2], edge=WOODP[4])

    def disc_in(x, d, h):
        return (x - 48) ** 2 + (h - 46) ** 2 < 11 ** 2
    def disc_col(x, d, h, face):
        q = (x - 48) ** 2 + (h - 46) ** 2
        if face == "top" or q > 9.5 ** 2:
            return HOOP[0] if (x - 48) + (46 - h) < -4 else HOOP[1] if (x - 48) + (46 - h) < 4 else HOOP[3]
        for bx, bh, br in ((45.5, 43.5, 4.6), (52.5, 49.5, 3.0), (47.5, 53.5, 1.8)):
            bq = (x - bx) ** 2 + (h - bh) ** 2
            if bq < br * br:
                if (x - bx + br * 0.4) ** 2 + (h - bh - br * 0.4) ** 2 < (br * 0.33) ** 2 + 0.3:
                    return GLOW[0]
                return GLOW[3] if bq > (br - 1.2) ** 2 else GLOW[1]
        return ACC[3] if q > 8.3 ** 2 else ACC[4]
    sc.sculpt(36, 61, -9, -6, 34, 58, disc_in, disc_col, shadow=False, edge=HOOP[4])
    # front cauldrons
    cauldron(sc, -7, -5)
    cauldron(sc, 103, -5)


def sparks(sc, th, night):
    for i, (ex, ey) in enumerate(((-10, 89), (-6, 85), (104, 88), (107, 83), (11, 52), (14, 47),
                                  (86, 51), (83, 46), (50, 8), (34, 30))):
        sc.put(X0 + ex, ey, GLOW[0] if i % 2 else GLOW[1])


# ================================================================ interior
SLUDGE = R5((214, 160, 240), (176, 112, 218), (138, 76, 188), (104, 52, 150), (72, 36, 110))
FLOOR_1 = R5((178, 162, 172), (150, 134, 150), (124, 108, 128), (96, 80, 104), (68, 54, 80))
FLOOR_B = R5((152, 164, 134), (124, 136, 112), (100, 112, 94), (76, 86, 76), (54, 62, 58))
RIM_B = R5((132, 140, 120), (110, 118, 102), (88, 96, 86), (64, 72, 68), (44, 50, 50))


def hazard_px(gx, gy):
    x, y = gx % T, gy % T
    a = 2 * math.pi / T
    for bx, by, br in ((4, 5, 2.2), (11, 12, 1.2)):
        dd = (x - bx) ** 2 + (y - by) ** 2
        if dd < br * br:
            if (x - bx + 0.8) ** 2 + (y - by + 0.8) ** 2 < 0.9:
                return GLI[0]
            return GLI[2] if dd > (br - 1) ** 2 else SLUDGE[1]
    v = math.sin(a * x + 1.2 * math.sin(a * y)) + 0.7 * math.sin(2 * a * y + 0.9 * math.cos(a * x))
    return SLUDGE[1] if v > 1.2 else SLUDGE[2] if v > -0.5 else SLUDGE[3]


def _floor1_px(gx, gy):
    x, y = gx % T, gy % T
    off = 0 if y < 8 else 4
    u, v = (x + off) % 8, y % 8
    F = FLOOR_1
    if v == 7 or u == 7:
        return MOSS[3] if (x, y) in ((7, 3), (11, 15), (3, 7)) else F[3]
    if v == 0 or u == 0:
        return F[0]
    if (u, v) in ((3, 4), (4, 4), (5, 2)):
        return F[2]
    return F[1]


def _build_cobbles():
    pts = [(3, 4), (11, 2), (8, 10), (15, 13), (1, 13)]

    def near(x, y):
        best, bi = 1e9, 0
        for i, (px, py) in enumerate(pts):
            for ox in (-16, 0, 16):
                for oy in (-16, 0, 16):
                    dd = (x - px - ox) ** 2 + ((y - py - oy) * 1.2) ** 2
                    if dd < best:
                        best, bi = dd, i * 9 + (ox // 16 + 1) * 3 + (oy // 16 + 1)
        return bi
    ids = [[near(x, y) for x in range(T)] for y in range(T)]
    F = FLOOR_B
    out = [[F[1]] * T for _ in range(T)]
    for y in range(T):
        for x in range(T):
            me = ids[y][x]
            if ids[(y + 1) % T][x] != me or ids[y][(x + 1) % T] != me:
                out[y][x] = F[3]
            elif ids[(y - 1) % T][x] != me or ids[y][(x - 1) % T] != me:
                out[y][x] = F[0]
            elif (me // 9) % 2:
                out[y][x] = F[2] if (x + y) % 5 == 0 else F[1]
    for (x, y) in ((5, 7), (6, 7), (12, 12)):
        out[y][x] = MOSS[2]
    return out


COBBLE = _build_cobbles()


def _floorb_px(gx, gy):
    return COBBLE[gy % T][gx % T]


def bridge_px(u, v, col):
    if u in (2, 13):
        return STEEL[3]
    if 3 <= u <= 12:
        if v % 4 == 0:
            return STEEL[1] if u not in (3, 12) else STEEL[0]
        if u in (3, 12) or u % 3 == 1:
            return STEEL[2]
        return SLUDGE[4]
    return None


def per_floor(fn):
    def w(ctx, c, r):
        b = ctx.floor["name"] == "B1F"
        ctx.th["floor"] = FLOOR_B if b else FLOOR_1
        ctx.th["floor_px"] = _floorb_px if b else _floor1_px
        ctx.th["rim"] = RIM_B if b else PLANK
        fn(ctx, c, r)
    return w


def t_stone(ctx, c, r):
    """Mossy stepping stone sitting in the sludge."""
    t_hazard(ctx, c, r)
    X, Y = c * T, r * T
    d = ctx.d
    d.ellipse([X + 1, Y + 4, X + 14, Y + 14], fill=ROCK[3], outline=IO)
    d.ellipse([X + 1, Y + 2, X + 14, Y + 11], fill=ROCK[1], outline=IO)
    d.ellipse([X + 3, Y + 3, X + 12, Y + 9], fill=ROCK[0])
    d.ellipse([X + 6, Y + 4, X + 12, Y + 9], fill=MOSS[1])
    ctx.p[X + 4, Y + 4] = (236, 228, 230)
    ctx.p[X + 8, Y + 6] = MOSS[0]


def t_chute(ctx, c, r):
    """Slime chute: a round sewer pipe mouth swirling with glowing sludge."""
    t_floor(ctx, c, r)
    X, Y, p = c * T, r * T, ctx.p
    for y in range(T):
        for x in range(T):
            dd = ((x - 7.5) / 7) ** 2 + ((y - 8) / 6.5) ** 2
            if dd < 1:
                if dd > 0.78:
                    col = IO if dd > 0.92 else STEEL[1] if y < 8 else STEEL[3]
                else:
                    ang = math.atan2(y - 8, x - 7.5) + dd * 6
                    col = GLI[1] if math.sin(ang * 2) > 0.5 else GLI[3] if dd > 0.3 else GLI[2]
                    if dd < 0.08:
                        col = (30, 40, 26)
                p[X + x, Y + y] = col


TILES = {ch: per_floor(fn) for ch, fn in DEFAULT_TILES.items()}
TILES.update({ch: per_floor(t_floor) for ch in ".TBVCR"})
TILES["o"] = per_floor(t_stone)
TILES["H"] = per_floor(t_chute)
TILES["|"] = per_floor(t_bridge)
TILES["="] = per_floor(t_bridge)


BOTTLES = [GLI[1], CAP[1], (120, 200, 236), (240, 140, 170), GLI[0], ACC[0], (250, 210, 110)]


def draw_shelf(ctx, c, r):
    d, X, Y = ctx.d, c * T, r * T
    top = Y - 8
    d.rectangle([X, top, X + 15, Y + 15], fill=WOODP[3], outline=IO)
    d.rectangle([X + 1, top + 1, X + 14, top + 2], fill=WOODP[1])
    for i, sy in enumerate((top + 4, top + 12)):
        d.rectangle([X + 2, sy, X + 13, sy + 6], fill=PLANK[4])
        d.line([X + 1, sy + 7, X + 14, sy + 7], fill=WOODP[2])
        for k in range(4):
            col = BOTTLES[(c * 3 + r * 5 + i * 2 + k) % len(BOTTLES)]
            bx = X + 2 + k * 3
            tall = (c + k + i) % 2
            d.rectangle([bx, sy + 2 - tall, bx + 1, sy + 6], fill=col)
            ctx.p[bx, sy + 2 - tall] = (240, 240, 240)
    d.rectangle([X + 1, Y + 12, X + 14, Y + 15], fill=WOODP[2], outline=IO)


def draw_vat(ctx, c, r):
    d, X, Y = ctx.d, c * T, r * T + 3
    d.rectangle([X + 1, Y - 4, X + 14, Y + 12], fill=WOODP[2], outline=IO)
    for sx in (4, 8, 12):
        d.line([X + sx, Y + 2, X + sx, Y + 11], fill=WOODP[3])
    d.line([X + 2, Y + 2, X + 2, Y + 11], fill=WOODP[1])
    for hy in (Y + 4, Y + 9):
        d.line([X + 1, hy, X + 14, hy], fill=HOOP[2])
    d.ellipse([X + 1, Y - 6, X + 14, Y + 2], fill=WOODP[1], outline=IO)
    d.ellipse([X + 3, Y - 5, X + 12, Y + 0], fill=GLI[2])
    d.ellipse([X + 4, Y - 4, X + 9, Y - 2], fill=GLI[1])
    ctx.p[X + 5, Y - 3] = GLI[0]


def t_vent(ctx, c, r):
    """Bubbling vent in the sludge (blocked): ring of froth with rising bubbles."""
    t_hazard(ctx, c, r)
    d, X, Y = ctx.d, c * T, r * T
    d.ellipse([X + 2, Y + 6, X + 13, Y + 13], fill=SLUDGE[0], outline=SLUDGE[4])
    d.ellipse([X + 4, Y + 7, X + 11, Y + 11], fill=GLI[2])
    for bx, by, br in ((5, 3, 2), (10, 1, 1), (9, 5, 1)):
        d.ellipse([X + bx - br, Y + by - br, X + bx + br, Y + by + br], fill=GLI[1], outline=GLI[3])
    ctx.p[X + 6, Y + 8] = GLI[0]


def draw_cauldron(ctx, c, r):
    d, X, Y = ctx.d, c * T, r * T
    d.rectangle([X + 3, Y + 12, X + 4, Y + 15], fill=IRON[3])
    d.rectangle([X + 11, Y + 12, X + 12, Y + 15], fill=IRON[3])
    d.ellipse([X + 1, Y + 1, X + 14, Y + 14], fill=IRON[2], outline=IO)
    d.ellipse([X + 3, Y + 6, X + 7, Y + 11], fill=IRON[1])
    d.ellipse([X + 1, Y, X + 14, Y + 6], fill=IRON[0], outline=IO)
    d.ellipse([X + 3, Y + 1, X + 12, Y + 5], fill=GLI[2])
    d.ellipse([X + 4, Y + 1, X + 8, Y + 3], fill=GLI[1])
    for bx, by in ((6, -3), (9, -6), (5, -8)):
        d.ellipse([X + bx, Y + by, X + bx + 2, Y + by + 2], fill=GLI[1], outline=GLI[3])


def draw_shrooms(ctx, c, r):
    d, X, Y = ctx.d, c * T, r * T
    for sx, sy, rr, hh in ((3, 6, 4, 7), (10, 2, 5, 10), (11, 10, 3, 4)):
        bx, by = X + sx, Y + sy + hh
        d.rectangle([bx - 1, Y + sy + 2, bx + 1, by], fill=STEM[1], outline=STEM[3])
        d.ellipse([bx - rr, Y + sy - 2, bx + rr, Y + sy + 3], fill=CAP[2], outline=IO)
        d.line([bx - rr + 2, Y + sy - 1, bx, Y + sy - 1], fill=CAP[0])
        ctx.p[bx + 1, Y + sy] = GLI[0]
        ctx.p[bx - 2, Y + sy + 1] = GLI[1]


def decor(ctx):
    for r in range(ctx.h):
        for c in range(ctx.w):
            ch = ctx.g(c, r)
            if ch == "B":
                draw_shelf(ctx, c, r)
            elif ch == "V":
                draw_vat(ctx, c, r)
            elif ch == "C":
                draw_cauldron(ctx, c, r)
            elif ch == "R":
                draw_shrooms(ctx, c, r)
    if ctx.floor["name"] == "B1F":
        d = ctx.d
        # sewer pipes in the north rim pouring sludge into the bog
        for c in (5, 14):
            X, Y = c * T, 1 * T
            d.rectangle([X + 2, Y + 4, X + 13, Y + 13], fill=STEEL[2], outline=IO)
            d.rectangle([X + 3, Y + 5, X + 12, Y + 6], fill=STEEL[0])
            d.ellipse([X + 4, Y + 7, X + 11, Y + 13], fill=(30, 22, 40), outline=STEEL[3])
            d.rectangle([X + 5, Y + 10, X + 10, Y + 22], fill=SLUDGE[1])
            d.line([X + 6, Y + 10, X + 6, Y + 22], fill=SLUDGE[0])
            d.ellipse([X + 2, Y + 19, X + 13, Y + 25], outline=SLUDGE[0])
        # slime splat where the chute lands
        lx, ly = LANDING
        X, Y = lx * T, ly * T
        d.ellipse([X + 2, Y + 5, X + 13, Y + 13], fill=GLI[3], outline=GLI[4] if len(GLI) > 4 else IO)
        d.ellipse([X + 4, Y + 6, X + 9, Y + 9], fill=GLI[1])
        ctx.p[X + 5, Y + 7] = GLI[0]


LANDING = (9, 3)
TILES["Q"] = per_floor(t_vent)


def emblem_bubbles(u, v):
    """Three toxic bubbles rising on a diagonal (big low-left, small high-right)."""
    for bx, by, br in ((-4, 6.5, 6.5), (6.5, 12.5, 4), (1, 17.2, 2.3)):
        dd = (u - bx) ** 2 + (v - by) ** 2
        if dd < br * br:
            if (u - bx + br * 0.4) ** 2 + (v - by - br * 0.35) ** 2 < (br * 0.3) ** 2 + 0.4:
                return 3
            return 1 if dd > (br - 1.6) ** 2 else 2
    return 0

THEME = dict(
    name="Poison-Type Gym", archetype="Toadstool Bog Hall",
    wall=PLANK, accent=ACC, trim=HOOP, rock=ROCK, deck=MOSS, glow=GLOW,
    emblem=emblem_bubbles, door_spill=(170, 210, 130), door_inside=(44, 52, 36),
    exterior=exterior, sparks=sparks,
    night_lights=[X0 - 7, X0 + 103, X0 + 19, X0 + 77],
    floor=FLOOR_1, floor_px=_floor1_px, rim=PLANK,
    hazard_px=hazard_px, hazard_ramp=SLUDGE, hazard_like="oQ",
    bridge_px=bridge_px, stair_ramp=[STEEL[1], STEEL[2], STEEL[3]],
    ledge=R5((170, 160, 170), (144, 132, 148), (116, 104, 124), (86, 76, 98), (60, 52, 72)),
    outside=MOSS,
    tiles=TILES, decor=decor, walk_extra="o",
    legend_extra={"o": "stepping stone in the sludge", "Q": "bubbling sludge vent (blocked)", "B": "bottle shelf (blocked)", "V": "brewing vat (blocked)",
                  "C": "cauldron (blocked)", "R": "toadstool cluster (blocked)", "~": "toxic sludge (blocked)",
                  "|": "metal grate N-S", "=": "metal grate E-W", "H": "slime chute, one-way drop (link)"},
    floors=[
        dict(name="1F", grid=[
            "##################",   # 0
            "#BBBBBBBHBBBBBBBB#",   # 1  brewing lab: slime chute H in the shelf wall
            "#V.....T.......DV#",   # 2  T5 guards the chute; D = arrival from B1F
            "#VV.....C.......V#",   # 3
            "#~~~~~~~~~~~~~~~~#",   # 4  sludge moat seals the lab
            "#~~~~~~~~~~~~~~~~#",   # 5
            "#D...B.......B...#",   # 6  stairs DOWN to the bog sewer
            "#VT..B..VV...B...#",   # 7  T2 guards the stairs
            "#..B....VV...BB..#",   # 8
            "#~~~~~~~~~~|~~~~~#",   # 9  sludge gutter + metal grate
            "#...........T....#",   # 10 T1 guards the grate
            "#.BB..........BB.#",   # 11
            "#C..............C#",   # 12
            "########MM########",   # 13
            "OOOOOOOOOOOOOOOOOO"],  # 14
             trainers=[(12, 10, "left", 1), (2, 7, "up", 1), (7, 2, "right", 1)]),
        dict(name="B1F", grid=[
            "OOOOOOOOPKKPOOOOOOOO",   # 0  leader alcove
            "########PKKP########",   # 1
            "#U..~~~~....~~~~R.U#",   # 2  U = arrival from 1F / U back up to the lab
            "#.T.~~~~R..R~~~~...#",   # 3  leader island (chute lands at 9,3)
            "#R..~~~~~~~~~~~~...#",   # 4
            "#~o~~~~~~~~~~~~~~o~#",   # 5  stepping stones
            "#~oo~~~~Q~~~~~~~oo~#",   # 6
            "#~~o~~~~~~~~~Q~~o~~#",   # 7
            "#~~oo~~~~~~~~~~oo~~#",   # 8
            "#~~~o~~~~~~~~~~o~~~#",   # 9
            "#R......====......R#",   # 10 grate catwalk
            "#......T~~~~.......#",   # 11 T4 guards the catwalk
            "#V......~~~~......V#",   # 12
            "####################"],  # 13
             trainers=[(2, 3, "down", 1), (7, 11, "up", 1)]),
    ],
    battle_order=[0, 1, 3, 4, 2],
    links=[dict(type="stairs", a=("1F", 1, 6), b=("B1F", 1, 2)),
           dict(type="stairs", a=("B1F", 18, 2), b=("1F", 15, 2)),
           dict(type="hole", a=("1F", 8, 1), b=("B1F", 9, 3))],
    leader=("B1F", 9, 1, "down"),
)
