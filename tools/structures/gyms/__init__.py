"""Water-Type Gym: Waterfall Rotunda.

Exterior: an elliptical white-marble drum hall (shaded toward periwinkle) with a sea-blue wave
frieze, tall arched windows, a ring of white columns carrying a round cornice, a scallop-shell
canopy with the drop emblem over the sliding door, and a roof that is itself a fountain basin:
three stemmed bowls spill waterfall curtains down to a curling wave spire. Ground props: reef
lamps (coral post in a shell basin, open clam holding a glowing pearl).

Interior: 1F pool hall (round rim, glass-water pools, wooden bridges) -> stairs UP to the 2F glass
mezzanine (glass walkways over the open well) -> the 2F waterfall chute is a one-way drop ('H')
back down onto the 1F leader island, which cannot be reached from the hall by any bridge.
"""
import math

from gymkit import (CX, DOOR_X0, DOOR_X1, IO, T, X0, E, R5, cl, ell, emblem_level, rgb, lit, mix,
                    door_px, win_color, column, sphere_sculpt, t_floor, t_hazard, t_rim, t_bridge)

WALL = R5((250, 252, 255), (226, 234, 246), (196, 206, 230), (150, 160, 200), (107, 116, 166))
SEA = R5((120, 200, 255), (70, 160, 240), (40, 120, 210), (30, 84, 170), (24, 56, 120))
TRIM = R5((236, 250, 250), (190, 230, 236), (150, 200, 214), (100, 150, 180), (70, 100, 140))
ROCK = R5((220, 226, 236), (186, 196, 214), (150, 160, 186), (110, 120, 152), (76, 84, 116))
DECK = R5((160, 210, 230), (130, 186, 214), (104, 160, 196), (80, 126, 170), (56, 92, 136))
LIQ = R5((230, 250, 255), (120, 210, 250), (60, 160, 230), (40, 110, 200), (30, 70, 160))
GLOW = E([(220, 255, 255), (140, 236, 255), (70, 190, 240), (40, 130, 210), (30, 86, 170)])
GLOWI = [rgb(c) for c in GLOW]
CORAL = R5((255, 196, 178), (250, 146, 134), (222, 98, 112), (172, 64, 98), (118, 44, 82))
PEARL = R5((255, 248, 244), (246, 224, 230), (222, 190, 210), (178, 150, 186), (128, 108, 152))
WIN_GLOW = [((214, 252, 255), True), ((150, 226, 250), True), ((90, 180, 230), True)]

DCX, DCD, DRX, DRD = 48, 16, 46, 19          # drum ellipse
FLAT = 0                                     # flattened entrance bay (front d of the door wall)
TOP = 40                                      # drum top / cornice base
KX, KD, KRX, KRD = 48, 16, 52, 23             # cornice disc
CORN = 46                                     # cornice top
ROOF = 49                                     # basin rim top
FD = 16                                       # fountain centre depth
WINDOWS = [("arch", 18, 26, 7, 24), ("arch", 70, 78, 7, 24), ("arch", 6, 11, 8, 21), ("arch", 85, 90, 8, 21)]
COLS = [-44, -32, -19, 19, 32, 44]


NIGHT = {"on": False}


def night():
    return NIGHT["on"]


def water(i, emissive_at_night=True):
    """Water colour: plain at day, emissive glow ramp at night."""
    if night() and emissive_at_night:
        return GLOW[min(4, i)]
    return LIQ[min(4, i)]


def side_k(x, cx, rx):
    nx = (x - cx) / rx
    return -1 if nx < -0.5 else 1 if nx > 0.42 else 0


# ---------------------------------------------------------------- exterior
def drum(sc, th, t, n):
    rd = DRD / DRX

    def inside(x, d, h):
        return d >= FLAT and ell(x, d, DCX, DCD, DRX, rd) < 1

    def color(x, d, h, face):
        if face == "top":
            return WALL[1]
        flat = d == FLAT
        if flat and DOOR_X0 <= x < DOOR_X1 and h < 28:
            return door_px(th, x - DOOR_X0, h, t, n)
        k = side_k(x, DCX, DRX)
        nx = (x - DCX) / DRX
        if abs(nx) > 0.86:
            k += 1
        if flat and x in (DOOR_X0 - 2, DOOR_X1 + 1) and h < 30:
            return SEA[3]
        if flat and (DOOR_X0 - 4 <= x < DOOR_X0 - 2 or DOOR_X1 + 2 <= x < DOOR_X1 + 4) and h < 30:
            return SEA[1] if x < DCX else SEA[2]
        for w in WINDOWS:
            c = win_color(th, w, x, h, n)
            if c is not None:
                return c
        if h < 3:
            return ROCK[3] if (x // 6 + h) % 2 else ROCK[4]
        if 29 <= h <= 35:                       # sea-blue wave frieze
            if h == 35:
                return SEA[0] if k <= 0 else SEA[1]
            if h == 29:
                return SEA[4]
            crest = 32 + 1.5 * math.sin(x * 0.55)
            if abs(h - crest) < 0.7:
                return TRIM[0] if k < 1 else TRIM[2]
            if h > crest:
                return SEA[1 + max(0, k)]
            return SEA[2 + max(0, k)] if k >= 0 else SEA[2]
        if h >= TOP - 3:
            return WALL[4]
        if h >= TOP - 5:
            return WALL[3]
        kk = 2 + k
        a = math.asin(max(-1, min(1, nx)))
        if (a * 9) % 1.0 < 0.09 and h > 3:      # marble pilaster seams on the curve
            kk += 1
        return WALL[max(0, min(4, kk))]
    sc.sculpt(DCX - DRX, DCX + DRX + 1, FLAT, DCD + DRD + 1, 0, TOP, inside, color)


def colonnade(sc, th):
    rd = 22
    for dx in COLS:
        x = DCX + dx
        d = DCD - rd * math.sqrt(1 - (dx / 50) ** 2)
        sc.box(int(x - 4), int(x + 4), int(d - 3), int(d + 3), 0, 3, top=ROCK[1],
               front=lambda u, v, U, V: ROCK[2] if u < U // 2 else ROCK[3], edge=ROCK[4])
        column(sc, th, x, d, 3, TOP - 2, r=2.8, ramp=WALL)


def cornice(sc, th):
    rd = KRD / KRX

    def inside(x, d, h):
        return ell(x, d, KX, KD, KRX, rd) < 1

    def color(x, d, h, face):
        k = side_k(x, KX, KRX)
        if face == "top":
            return WALL[0] if x < KX else WALL[1]
        r = h - TOP
        if r == 0:
            return SEA[4]
        if r == 1:
            return SEA[2] if (x // 3) % 2 else SEA[3]
        if r == 2:
            return WALL[3] if x % 4 == 0 else WALL[2 + max(0, k)]
        if r == 5:
            return WALL[0] if k < 1 else WALL[2]
        return WALL[1 + max(0, k)]
    sc.sculpt(KX - KRX, KX + KRX + 1, KD - KRD, KD + KRD + 1, TOP, CORN, inside, color)


ROOF_R0, ROOF_R1, ROOF_H = 49, 33, 50          # shell-tiled roof cone: outer r, top r, top height
BASIN_R = 29


def roof(sc, th):
    """Shallow fish-scale cone rising from the cornice to the fountain basin, water channels down it."""
    rd = KRD / KRX

    def rr(x, d):
        return math.sqrt(ell(x, d, KX, KD, KRX, rd)) * KRX

    def ang(x, d):
        return math.atan2((d - KD) / rd, x - KX)

    def rc(h):
        return ROOF_R0 - (h - CORN) * (ROOF_R0 - ROOF_R1) / (ROOF_H - CORN)

    def inside(x, d, h):
        r = rr(x, d)
        if h < ROOF_H:
            return r < rc(h)
        return r < ROOF_R1 - 0.5 and (h == ROOF_H or r > BASIN_R)

    def channel(x, d, h):
        a = ang(x, d)
        return any(abs(a - fa) < 0.05 + 0.002 * (ROOF_H - h) for fa, _ in FALL_A)

    def color(x, d, h, face):
        r = rr(x, d)
        nx = (x - KX) / KRX
        if h >= ROOF_H:                         # basin rim + water
            if face == "top" and r < BASIN_R:
                v = math.sin(x * 0.45 + d * 0.9) + 0.6 * math.sin(d * 1.7 - x * 0.25)
                if night():
                    return GLOW[1] if v > 1.1 else GLOW[2] if v > -0.2 else GLOW[3]
                return LIQ[0] if v > 1.25 else LIQ[1] if v > 0.2 else LIQ[2]
            if face == "top":
                return TRIM[0] if nx < 0.3 else TRIM[1]
            if d > KD:
                return TRIM[2]
            return TRIM[1] if nx < -0.45 else TRIM[2] if nx < 0.4 else TRIM[3]
        if channel(x, d, h):
            return water(0) if (h + x) % 3 == 0 else water(1)
        if face == "top":
            row = d // 3
            u = (x + (row % 2) * 3) % 6
            v = d % 3
            edge = ((u - 2.5) / 3) ** 2 + ((v - 0.2) / 3) ** 2 > 0.62
            base = 0 if nx < -0.45 else 1 if nx < 0.4 else 2
            return SEA[base + 1] if edge else SEA[base]
        return SEA[2] if nx < -0.45 else SEA[3] if nx < 0.4 else SEA[4]
    sc.sculpt(KX - ROOF_R0, KX + ROOF_R0 + 1, KD - 23, KD + 24, CORN, ROOF_H + 2, inside, color)


FALL_A = [(-0.55, 0.2), (-1.12, 0.2), (-1.57, 0.22), (-2.02, 0.2), (-2.59, 0.2)]
# tiers: (stem_h0, stem_h1, stem_r, bowl_h1, bowl_r0, bowl_r1)
TIERS = [(ROOF_H + 1, 54, 6, 59, 8, 21), (59, 62, 4, 66, 6, 13), (66, 68, 3, 71, 4, 8)]


def fountain(sc, th):
    def info(h):
        for i, (s0, s1, sr, b1, r0, r1) in enumerate(TIERS):
            if s0 <= h < s1:
                return i, "stem", sr
            if s1 <= h < b1:
                return i, "bowl", r1 - max(0, 2 - (h - s1)) * (r1 - r0) / 2
        return None, None, 0

    def falls(i, a):
        for fa, w in FALL_A:
            if abs(a - fa) < w * (1.0 if i == 0 else 1.25 if i == 1 else 1.6):
                return abs(a - fa) / w
        return None

    def polar(x, d):
        dx, dd = x - CX, (d - FD) / 0.5
        return math.hypot(dx, dd), math.atan2(dd, dx)

    def inside(x, d, h):
        i, part, R = info(h)
        if i is None:
            return False
        r, a = polar(x, d)
        if part == "bowl":
            s1, b1 = TIERS[i][1], TIERS[i][3]
            if h == b1 - 1 and r < R - 2.2:
                return False
            return r < R
        if r < R:
            return True
        # waterfall curtain from the bowl above (this stem's height range)
        Rl = TIERS[i - 1][5] - 1 if i > 0 else None
        if i > 0 and Rl - 1.8 < r < Rl + 0.2 and falls(i, a) is not None:
            return True
        return False

    def lowfall(x, d, h):
        # the bottom curtain falls from bowl 1 into the roof pool
        r, a = polar(x, d)
        R = TIERS[0][5] - 1
        return TIERS[0][0] <= h < TIERS[0][1] and R - 1.8 < r < R + 0.2 and falls(0, a) is not None

    def color(x, d, h, face):
        i, part, R = info(h)
        r, a = polar(x, d)
        nx = (x - CX) / max(R, 1)
        if part == "stem" and r >= R:          # waterfall curtain pixel
            fq = falls(i, a)
            s0 = TIERS[i][0]
            if h <= s0 + 1:
                return water(0)
            return water(1) if (x % 3 == 1 or fq > 0.75) else water(0)
        if face == "top":
            if part == "bowl" and h == TIERS[i][3] - 1 and r >= R - 2.2:
                return TRIM[0] if x < CX + R * 0.3 else TRIM[1]
            if part == "bowl" and r < R - 2.2:
                v = math.sin(x * 0.7 + d * 1.3) + 0.5 * math.sin(d * 2.1 - x * 0.3)
                return water(0) if v > 1.2 else water(1) if v > 0.1 else water(2)
            return WALL[1]
        if part == "bowl":
            s1, b1 = TIERS[i][1], TIERS[i][3]
            if h == b1 - 1:
                return TRIM[0] if nx < 0.3 else TRIM[2]
            if h == s1:
                return WALL[4]
            if h == b1 - 2:
                return SEA[1] if nx < -0.4 else SEA[2] if nx < 0.4 else SEA[3]
            if h == s1 + 1:
                return WALL[3]
            return WALL[0] if nx < -0.5 else WALL[1] if nx < 0.3 else WALL[2]
        return WALL[2] if nx < 0 else WALL[3]
    x0, x1 = CX - 27, CX + 28
    sc.sculpt(x0, x1, FD - 13, FD + 13, TIERS[0][0], 71, lambda x, d, h: inside(x, d, h) or lowfall(x, d, h),
              lambda x, d, h, f: (color(x, d, h, f) if not lowfall(x, d, h) or inside(x, d, h)
                                  else (water(0) if h <= TIERS[0][0] + 1 or (x % 3 == 0) else water(1))))
    wave_spire(sc, th)


def wave_spire(sc, th):
    H0, H1 = 71, 90

    def cxh(h):
        q = (h - H0) / (H1 - H0)
        return CX + 4 * math.sin(q * 3.1), 5.2 * (1 - q) ** 0.85 + 1.2

    # curl: ring arc in the (x, h) plane, the breaking crest folding over to the left
    RCX, RCH, RR = CX - 4, 84, 6

    def curl(x, h):
        rr = math.hypot(x - RCX, h - RCH)
        ang = math.atan2(h - RCH, x - RCX)
        return RR - 3.2 < rr < RR + 0.6 and (ang > -0.1 or ang < -2.3), rr, ang

    def inside(x, d, h):
        c, s = cxh(h)
        if h < RCH and ell(x, d, c, FD, s, 0.6) < 1:
            return True
        ok, rr, ang = curl(x, h)
        return ok and abs(d - FD) < 3 - (1.2 if ang < -2.3 else 0)

    def color(x, d, h, face):
        ok, rr, ang = curl(x, h)
        c, s = cxh(h)
        if ok and not (h < RCH and ell(x, d, c, FD, s, 0.6) < 1):
            if rr > RR - 0.4 or ang > 1.0 and rr > RR - 1.4:
                return water(0)
            if ang < -2.3:
                return water(0) if (h % 2) else water(1)
            return water(2) if rr < RR - 2 else water(1)
        if face == "top":
            return water(0)
        nx = (x - c) / s
        return water(0) if nx < -0.45 else water(1) if nx < 0.15 else water(2) if nx < 0.6 else water(3)
    sc.sculpt(CX - 13, CX + 14, FD - 6, FD + 7, H0, H1, inside, color)
    sphere_sculpt(sc, [(RCX - 6, FD, RCH - 4, 2), (RCX - 3, FD, RCH - 5.5, 1.5)],
                  lambda x, d, h, f, b, nx, ny: water(0) if ny > -0.2 else water(1), shadow=False)


def shell_canopy(sc, th):
    """Scallop shell fan over the door (front-facing relief), drop emblem in the middle."""
    H0, RX, RH = 28, 17, 17

    def rad(x, h):
        ang = math.atan2(h - H0, (x - CX) * RH / RX)
        return math.hypot((x - CX) / RX, (h - H0) / RH), ang

    def inside(x, d, h):
        q, ang = rad(x, h)
        scal = 1 - 0.07 * abs(math.sin(ang * 4.5))
        return h >= H0 and q < scal and -7 <= d < FLAT + 1

    def color(x, d, h, face):
        q, ang = rad(x, h)
        if face == "top":
            return PEARL[0]
        right = x > CX + 5
        if q > 0.84 - 0.07 * abs(math.sin(ang * 4.5)):
            return CORAL[2] if right else CORAL[1]
        if h == H0:
            return SEA[3]
        groove = abs(math.sin(ang * 4.5 + math.pi / 2)) < 0.3
        if groove:
            return CORAL[3] if right else CORAL[2]
        return (PEARL[2] if right else PEARL[0]) if q > 0.45 else (PEARL[3] if right else PEARL[1])
    sc.sculpt(CX - RX - 1, CX + RX + 2, -7, FLAT + 1, H0, H0 + RH + 1, inside, color, shadow=False, edge=PEARL[4])
    # drop emblem relief on the shell
    kind = th["emblem"]

    def e_in(x, d, h):
        return -9 <= d < -7 and emblem_level(kind, x - CX, h - (H0 + 1)) > 0

    def e_col(x, d, h, face):
        lv = emblem_level(kind, x - CX, h - (H0 + 1))
        if face == "top":
            return SEA[0]
        return GLOW[0] if lv == 3 else GLOW[2] if lv == 2 else (SEA[2] if x <= CX else SEA[3])
    sc.sculpt(CX - 9, CX + 10, -9, -7, H0 + 1, H0 + 20, e_in, e_col, shadow=False, edge=SEA[4])
    # lintel step the shell sits on
    sc.box(DOOR_X0 - 4, DOOR_X1 + 4, -6, FLAT, 27, 29, top=TRIM[0],
           front=lambda u, v, U, V: SEA[1] if v else SEA[3], edge=SEA[4])


def reef_lamp(sc, cx, cd):
    n = night()

    def bas_in(x, d, h):
        return ell(x, d, cx, cd, 7.5, 0.55) < 1

    def bas_col(x, d, h, face):
        e = ell(x, d, cx, cd, 7.5, 0.55)
        if face == "top":
            if e < 0.55:
                return GLOW[2] if n else LIQ[1] if cl(x, d, 3) > 200 else LIQ[2]
            return PEARL[0]
        k = 1 if x < cx - 3 else 2 if x < cx + 3 else 3
        return PEARL[k] if h else PEARL[k + 1]
    sc.sculpt(cx - 8, cx + 9, cd - 5, cd + 5, 0, 4, bas_in, bas_col)
    # coral post with side branches
    column(sc, {"trim": CORAL}, cx, cd, 4, 19, r=2.2, ramp=CORAL, capital=False)
    sphere_sculpt(sc, [(cx - 3.5, cd, 12, 1.8), (cx - 4.5, cd, 14.5, 1.4), (cx + 3.5, cd, 9, 1.8),
                       (cx + 4.5, cd, 11.5, 1.3)],
                  lambda x, d, h, f, b, nx, ny: lit(CORAL, nx, ny), shadow=False)
    # open clam: bottom cup + upright fan behind the pearl
    def cup_in(x, d, h):
        return ell(x, d, cx, cd, 6 - (21 - h) * 0.9, 0.6) < 1

    def cup_col(x, d, h, face):
        if face == "top":
            return GLOW[1] if n else PEARL[1]
        return PEARL[2] if x < cx + 2 else PEARL[3]
    sc.sculpt(cx - 7, cx + 8, cd - 4, cd + 4, 18, 21, cup_in, cup_col, shadow=False)

    def fan_in(x, d, h):
        q = math.hypot((x - cx) / 6.5, (h - 21) / 9)
        return cd + 1 <= d < cd + 3 and h >= 21 and q < 1 - 0.08 * abs(math.sin(math.atan2(h - 21, x - cx) * 4))

    def fan_col(x, d, h, face):
        rib = abs(math.sin(math.atan2(h - 21, x - cx) * 4))
        if face == "top":
            return PEARL[0]
        if n:
            return GLOW[2] if rib > 0.4 else GLOW[3]
        return CORAL[1] if rib > 0.4 else CORAL[3]
    sc.sculpt(cx - 7, cx + 8, cd + 1, cd + 3, 21, 31, fan_in, fan_col, shadow=False, edge=PEARL[4])
    sphere_sculpt(sc, [(cx, cd - 1, 24.5, 3.4)],
                  lambda x, d, h, f, b, nx, ny: (GLOW[0] if ny > 0.2 and nx < 0.2 else GLOW[1] if ny > -0.4
                                                 else GLOW[2]) if n else lit(PEARL, nx, ny), shadow=False)


def coral_clump(sc, cx, cd, s=1.0):
    sphere_sculpt(sc, [(cx, cd, 2, 3 * s), (cx - 3 * s, cd, 1.5, 2.2 * s), (cx + 2.5 * s, cd, 4, 2 * s),
                       (cx + 1, cd, 6 * s, 1.6 * s)],
                  lambda x, d, h, f, b, nx, ny: lit(CORAL[0:4] if b[3] > 2 else SEA[0:4], nx, ny), shadow=False)


def exterior(sc, th, t, n):
    NIGHT["on"] = n
    drum(sc, th, t, n)
    coral_clump(sc, 0, 10, 0.8)
    coral_clump(sc, 96, 10, 0.8)
    colonnade(sc, th)
    cornice(sc, th)
    roof(sc, th)
    fountain(sc, th)
    shell_canopy(sc, th)
    # steps in front of the door
    sc.box(DOOR_X0 - 2, DOOR_X1 + 2, -10, -6, 0, 2, top=ROCK[0],
           front=lambda u, v, U, V: ROCK[2], edge=ROCK[4])
    reef_lamp(sc, -6, -4)
    reef_lamp(sc, 102, -4)


def sparks(sc, th, n):
    from gymkit import X0, G
    pts = [(-12, 30), (-15, 36), (12, 26), (14, 34), (-20, 48), (21, 45), (5, 18)]
    for i, (x, y) in enumerate(pts):
        sc.put(X0 + CX + x, y, GLOW[0] if i % 2 else GLOW[1])


# ---------------------------------------------------------------- interior
CUR = {"f": "1F"}
FLOOR1 = R5((246, 250, 255), (222, 232, 248), (190, 204, 232), (150, 162, 204), (110, 120, 170))
GLASSF = R5((226, 246, 255), (190, 228, 248), (150, 204, 236), (106, 160, 210), (74, 116, 172))
HZ = R5((210, 245, 255), (110, 196, 240), (60, 150, 220), (40, 104, 190), (28, 64, 140))
DEEP = R5((120, 190, 230), (60, 130, 200), (36, 90, 170), (26, 60, 130), (18, 38, 96))


def floor_px(gx, gy):
    x, y = gx % T, gy % T
    if CUR["f"] == "2F":                       # glass-and-stone mezzanine slab
        if x in (0, 15) or y in (0, 15):
            return GLASSF[0] if (x == 0 or y == 0) else GLASSF[3]
        if x in (1, 14) or y in (1, 14):
            return ROCK[1]
        if x - y in (0, 1) and 3 < x < 12:
            return GLASSF[0]
        return GLASSF[1] if (x // 7 + y // 7) % 2 else GLASSF[2]
    # 1F white marble, 8 px checker with a sea-blue diamond inlay
    dd = abs(x - 8) + abs(y - 8)
    if dd <= 1:
        return SEA[1]
    if dd == 2:
        return SEA[3]
    if x == 0 or y == 0:
        return FLOOR1[2]
    if x == 15 or y == 15:
        return FLOOR1[3]
    return FLOOR1[0] if ((x < 8) ^ (y < 8)) else FLOOR1[1]


def hazard_px(gx, gy):
    x, y = gx % T, gy % T
    a = 2 * math.pi / T
    v = math.sin(a * x + 1.6 * math.sin(a * y)) + 0.5 * math.sin(2 * a * y)
    R = DEEP if CUR["f"] == "2F" else HZ
    if CUR["f"] == "2F":
        if (x, y) in ((3, 4), (4, 4), (11, 11), (12, 11)):
            return R[0]
        return R[2] if v > 0.8 else R[3] if v > -0.6 else R[4]
    if (x + 2 * y) % 16 in (0, 1) and v > 0.2:
        return R[0]
    return R[1] if v > 0.9 else R[2] if v > -0.5 else R[3]


def bridge_px(u, v, col):
    if CUR["f"] != "2F":
        return None
    if u in (2, 13):
        return TRIM[1]
    if 3 <= u <= 12:
        if u in (3, 12):
            return ROCK[1]
        return GLASSF[0] if (u + v) % 9 == 0 else GLASSF[1] if v % 8 < 4 else GLASSF[2]
    return None


def _set(ctx):
    CUR["f"] = ctx.floor["name"]


def tile_floor(ctx, c, r):
    _set(ctx)
    t_floor(ctx, c, r)


def tile_hazard(ctx, c, r):
    _set(ctx)
    t_hazard(ctx, c, r)


def tile_bridge(ctx, c, r):
    _set(ctx)
    t_bridge(ctx, c, r)


def tile_rim(ctx, c, r):
    _set(ctx)
    t_rim(ctx, c, r, TRIM if ctx.floor["name"] == "2F" else SEA)


def tile_chute(ctx, c, r):
    """2F waterfall chute: a swirling drop through the mezzanine (one-way)."""
    _set(ctx)
    t_floor(ctx, c, r)
    X, Y, p = c * T, r * T, ctx.p
    for y in range(T):
        for x in range(T):
            dx, dy = x - 7.5, (y - 8) * 1.15
            rr = math.hypot(dx, dy)
            if rr >= 7.2:
                continue
            if rr > 6.4:
                col = IO
            else:
                sw = (math.atan2(dy, dx) * 2 + rr * 0.9) % (2 * math.pi)
                col = (GLOWI[0] if sw < 0.8 else GLOWI[1] if sw < 2.6 else GLOWI[2] if sw < 4.4 else GLOWI[3])
                if rr < 1.8:
                    col = DEEP[4]
            p[X + x, Y + y] = col


def decor(ctx):
    d, p = ctx.d, ctx.p
    for r in range(ctx.h):
        for c in range(ctx.w):
            ch = ctx.g(c, r)
            x, y = c * T, r * T - 14
            if ch == "B":                       # reef lamp: shell basin, coral post, glowing pearl
                tile_floor(ctx, c, r)
                d.ellipse([x + 1, y + 22, x + 14, y + 29], fill=PEARL[2], outline=IO)
                d.ellipse([x + 3, y + 23, x + 12, y + 27], fill=LIQ[1])
                d.rectangle([x + 6, y + 10, x + 9, y + 24], fill=CORAL[2], outline=IO)
                d.line([x + 7, y + 11, x + 7, y + 23], fill=CORAL[0])
                d.rectangle([x + 3, y + 14, x + 6, y + 16], fill=CORAL[1], outline=IO)
                d.rectangle([x + 9, y + 17, x + 12, y + 19], fill=CORAL[1], outline=IO)
                d.pieslice([x + 1, y - 2, x + 14, y + 13], 180, 360, fill=PEARL[1], outline=IO)
                for k in range(3, 13, 3):
                    d.line([x + 8, y + 10, x + k, y + 1], fill=PEARL[3])
                d.ellipse([x + 5, y + 4, x + 10, y + 9], fill=GLOWI[1], outline=GLOWI[3])
                p[x + 6, y + 5] = GLOWI[0]
            elif ch == "G":                     # small tiered fountain on a marble plinth
                tile_floor(ctx, c, r)
                d.rectangle([x + 1, y + 22, x + 14, y + 29], fill=WALL[2], outline=IO)
                d.line([x + 2, y + 23, x + 13, y + 23], fill=WALL[0])
                d.ellipse([x + 1, y + 14, x + 14, y + 22], fill=WALL[1], outline=IO)
                d.ellipse([x + 3, y + 15, x + 12, y + 20], fill=LIQ[1])
                d.rectangle([x + 6, y + 7, x + 9, y + 15], fill=WALL[2], outline=IO)
                d.ellipse([x + 3, y + 3, x + 12, y + 8], fill=WALL[1], outline=IO)
                d.ellipse([x + 5, y + 4, x + 10, y + 6], fill=LIQ[1])
                d.line([x + 4, y + 8, x + 4, y + 16], fill=LIQ[0])
                d.line([x + 11, y + 8, x + 11, y + 16], fill=LIQ[1])
                d.rectangle([x + 7, y - 1, x + 8, y + 3], fill=LIQ[0])
    # splash ring where the waterfall chute lands on the 1F island
    if ctx.floor["name"] == "1F":
        for l in THEME["links"]:
            if l["type"] == "hole":
                _, lx, ly = l["b"]
                X, Y = lx * T, ly * T
                d.ellipse([X + 2, Y + 3, X + 13, Y + 12], outline=GLOWI[1])
                d.ellipse([X + 5, Y + 5, X + 10, Y + 10], outline=GLOWI[0])
                for sx, sy in ((1, 2), (14, 3), (3, 13), (12, 13), (8, 1)):
                    p[X + sx, Y + sy] = GLOWI[0]


THEME = dict(
    name="Water-Type Gym", archetype="Waterfall Rotunda",
    wall=WALL, accent=SEA, trim=TRIM, rock=ROCK, deck=DECK, glow=GLOW,
    emblem="drop", door_spill=(150, 200, 230), door_inside=(30, 50, 80), win_glow=WIN_GLOW,
    exterior=exterior, sparks=sparks, night_lights=[X0 - 6, X0 + 102],
    floor=FLOOR1, floor_px=floor_px, hazard_px=hazard_px, hazard_ramp=HZ, bridge_px=bridge_px,
    ledge=R5((236, 240, 248), (204, 212, 228), (166, 176, 200), (122, 132, 164), (86, 94, 128)),
    outside=R5((150, 220, 170), (120, 200, 150), (100, 180, 134), (76, 150, 114), (56, 116, 92)),
    stair_ramp=[WALL[0], WALL[2], WALL[3]],
    tiles={"#": tile_rim, ".": tile_floor, "T": tile_floor, "~": tile_hazard, "|": tile_bridge,
           "=": tile_bridge, "H": tile_chute, "B": tile_floor, "G": tile_floor},
    decor=decor,
    legend_extra={"H": "waterfall chute, one-way drop to the 1F leader island", "~": "pool / open well (blocked)",
                  "B": "reef lamp (blocked)", "G": "fountain (blocked)"},
    floors=[
        dict(name="1F", grid=[
            "OOOOOOOOPKKPOOOOOOOO",   # 0  leader alcove in the north rim
            "########PKKP########",   # 1
            "##~~~~~G....G~~~~~##",   # 2  leader island (only reachable by the waterfall drop)
            "#~~~~~~~T.~~~~~~~~~#",   # 3  T5 guards the 1-tile neck
            "#~~~~~~......~~~~~~#",   # 4  splash landing
            "#~~~~~~~~~~~~~~~~~~#",   # 5  moat around the island
            "#~~~~~~~~~~~~~~~~~~#",   # 6
            "#U...B~~~~~~~~~~~~~#",   # 7  stairs UP to the mezzanine
            "#.....~~~~~~~~~~~~~#",   # 8
            "#.....~~~~~~~~~~~~~#",   # 9
            "#~~|~~~~~~~~~~~~~~~#",   # 10 bridge (west)
            "#~~|~~~~~~~~~~~~~~~#",   # 11
            "#.T................#",   # 12 T2 guards the west bridge foot
            "#B...............TB#",   # 13 T1 guards the east bridge head
            "#~~~~~~~~~~~~~~~|~~#",   # 14 bridge (east)
            "#~~~~~~~~~~~~~~~|~~#",   # 15
            "#..................#",   # 16
            "##G..............G##",   # 17
            "#########MM#########",   # 18
            "OOOOOOOOOOOOOOOOOOOO"],  # 19
             trainers=[(17, 13, "left", 1), (2, 12, "right", 1), (8, 3, "right", 1)]),
        dict(name="2F", grid=[
            "####################",   # 0
            "#D...~~~~~~~~~~..H.#",   # 1  arrival / waterfall chute (NE)
            "#....~~~~~~~~~~....#",   # 2
            "#....~~~~~~~~~~~|~~#",   # 3
            "#~~|~~~~~~~~~~~~|~~#",   # 4  glass walkways over the open well
            "#~~|~~~~~~~~~~.....#",   # 5
            "#.T......~~~~......#",   # 6  T3 guards the west walkway foot
            "#........====......#",   # 7  E-W glass walkway
            "#B.......~~~~.....B#",   # 8
            "####################"],  # 9
             trainers=[(2, 6, "right", 1), (13, 6, "down", 1)]),
    ],
    links=[dict(type="stairs", a=("1F", 1, 7), b=("2F", 1, 1)),
           dict(type="hole", a=("2F", 17, 1), b=("1F", 10, 4))],
    leader=("1F", 9, 1, "down"),
    battle_order=[0, 1, 3, 4, 2],
)
