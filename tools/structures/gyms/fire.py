"""Fire-Type Gym: Volcano Foundry.

Exterior: the building IS the volcano. A basalt/obsidian cone whose front is sliced flat into a
forge facade: a glowing arched forge mouth around the 2-tile door, a flame keystone, crimson
coping and riveted bronze bands, two lava grooves running from the crater rim down the cut face
into lava troughs either side of the paved entrance, two brick smokestacks on the shoulders
(fire + smoke), and a molten crater with a smoke plume as the crown. Ground props: an anvil
with a glowing ingot (left) and a crucible on iron legs (right).

Interior: 1F forge hall (anvils, crucibles, bellows, molten-metal channels) -> a cracked-floor
hole drops you into the B1F magma cavern (lava lake, bridges, stalagmites) -> stairs UP to the
1F leader terrace, which a full-width molten trench cuts off from the entrance hall.
"""
import math

from gymkit import (IO, T, X0, DOOR_X0, DOOR_X1, E, R5, cl, emblem_plate, flame_top, rgb, sphere_sculpt, lit,
                    door_px, nz, t_rim, _wallblock)

# ---------------------------------------------------------------- palettes
WALL = R5((104, 90, 110), (84, 72, 94), (66, 56, 78), (50, 42, 64), (36, 30, 50))       # cut basalt
OBS = R5((122, 104, 118), (96, 80, 98), (74, 60, 80), (56, 44, 64), (40, 31, 50))      # cone rock
CRIM = R5((246, 110, 88), (222, 64, 62), (186, 40, 54), (136, 26, 52), (92, 18, 46))
BRONZE = R5((246, 206, 128), (214, 162, 88), (174, 118, 62), (124, 80, 52), (84, 52, 44))
IRON = R5((150, 146, 168), (114, 110, 136), (84, 80, 106), (60, 56, 82), (40, 36, 58))
BRICK = R5((206, 112, 86), (176, 84, 70), (142, 62, 60), (106, 44, 52), (74, 30, 44))
BASALT = R5((96, 80, 88), (74, 62, 74), (58, 48, 62), (44, 36, 52), (32, 26, 42))
SMOKE = R5((222, 214, 220), (190, 182, 196), (156, 148, 168), (122, 114, 140), (92, 86, 112))
LAVA = E([(255, 246, 168), (255, 208, 72), (255, 150, 40), (232, 84, 30), (176, 44, 34)])
LAVAI = [rgb(c) for c in LAVA]
SOOT = ((70, 28, 34), True)

# ---------------------------------------------------------------- volcano heightfield
VC, VD, KX, KD = 48, 14, 1.25, 1.5          # cone centre (x, d) and footprint stretch
HRIM, HPOOL, SLOPE_U = 66, 62, 52          # rim / lava pool heights, cone slope run
AH, AX, AD, ADD = 52, 52, 12, 32            # broad basalt apron (flared volcano base)
GROOVES = (15, 81)                          # lava grooves on the cut face (x centre)
TROUGHS = ((-1, 27), (69, 97))             # lava troughs at the base (x0, x1)
STACKS, STACK_TOP = ((5, 11), (91, 11)), 60


def polar(x, d):
    dx, dd = (x - VC) * KX, (d - VD) * KD
    return math.hypot(dx, dd), math.atan2(dd, dx)


def rim_r(a):
    return 12 + 1.0 * math.sin(a * 5 + 0.4) + 0.5 * math.sin(a * 9)


def _cone(x, d):
    r, a = polar(x, d)
    rr = rim_r(a)
    if r < rr - 4:
        return HPOOL
    if r < rr:
        return HPOOL + (r - rr + 4) / 4 * (HRIM - HPOOL)
    u = r - rr
    if u >= SLOPE_U:
        return 0
    return HRIM * (1 - u / SLOPE_U) ** 1.4 + 1.2 * math.sin(a * 13) * (u / SLOPE_U)


def _apron(x, d):
    q = 1 - (abs(x - VC) / AX) ** 4 - (abs(d - AD) / ADD) ** 4
    return AH * math.sqrt(q) if q > 0 else 0


def _height(x, d):
    c, a = _cone(x, d), _apron(x, d)
    if c >= HPOOL - 0.5:
        return c
    k = 0.18
    m = max(c, a)
    return m + math.log(math.exp(k * (c - m)) + math.exp(k * (a - m))) / k if m > 0 else 0


HF = {}
for _x in range(-16, 112):
    for _d in range(0, 72):
        _h = int(round(_height(_x, _d)))
        if _h > 0:
            HF[(_x, _d)] = _h


def hf(x, d):
    return HF.get((x, d), 0)


STREAKS = [(math.atan2(-VD * KD, (g - VC) * KX), 0) for g in GROOVES] + [(-2.05, 44), (-1.09, 44)]


def streak(r, a):
    """0 = lava core, 1 = lava edge, 2 = groove lip, None = plain rock."""
    for a0, hmin in STREAKS:
        w = 2.6 / max(r, 1)
        e = abs(a - a0 - 0.035 * math.sin(r * 0.33))
        if e < w * 0.45:
            return 0, hmin
        if e < w:
            return 1, hmin
        if e < w + 1.4 / max(r, 1):
            return 2, hmin
    return None, 0


def flame_emblem(u, v):
    """Three-tongue flame: 0 empty, 1 rim, 2 mid, 3 core. u -16..16, v 0..19 (0 = bottom)."""
    def body(u, v):
        if v < 0 or v > 19:
            return False
        q = v / 19
        main = abs(u + 1.5 * math.sin(q * 3.2)) < 8.5 * (1 - q) ** 0.75 if v < 19 else False
        left = v < 13 and abs(u + 6 + 1.5 * q) < 4.2 * (1 - v / 13) ** 0.8 and v > 2
        right = v < 11 and abs(u - 6 - 1.5 * q) < 3.8 * (1 - v / 11) ** 0.8 and v > 2
        return main or left or right
    if not body(u, v):
        return 0
    if not all(body(u + du, v + dv) for du, dv in ((1.5, 0), (-1.5, 0), (0, 1.5), (0, -1.2))):
        return 1
    if abs(u) < 3 and v < 9:
        return 3
    return 2


# ---------------------------------------------------------------- exterior: cut forge facade
def facade_px(th, x, h, t, night):
    top = hf(x, 0)
    ax, ah = x - VC, h - 24
    # door + forge mouth (inside the arch ring)
    if DOOR_X0 <= x < DOOR_X1 and h < 28:
        return door_px(th, x - DOOR_X0, h, t, night)
    rr = math.hypot(ax, ah) if ah > 0 else abs(ax)
    if rr < 19:
        if h < 28:                     # glowing jamb lining beside the door
            return LAVA[3] if (h // 3) % 2 else LAVA[4]
        v = ah + 2.5 * math.sin(ax * 0.7) + 1.5 * math.sin(ax * 1.9)
        if ah > 13:
            return SOOT
        return LAVA[1] if v < 4 else LAVA[2] if v < 7 else LAVA[3] if v < 10 else LAVA[4]
    # lava grooves
    for g in GROOVES:
        e = abs(x - g)
        if e <= 1:
            return LAVA[0] if (h + 2 * x) % 9 == 0 else LAVA[1]
        if e == 2:
            return LAVA[2] if (h + x) % 5 else LAVA[3]
        if e == 3:
            return WALL[4]
    # riveted metal bands
    if 30 <= h <= 34:
        if h == 32 and x % 6 == 3:
            return BRONZE[0]
        return CRIM[1] if h == 34 else CRIM[4] if h == 30 else CRIM[2]
    if 4 <= h <= 6:
        if h == 5 and x % 6 == 0:
            return BRONZE[0]
        return BRONZE[1] if h == 6 else BRONZE[3] if h == 4 else BRONZE[2]
    if h < 4:
        return BASALT[3] if (x // 6 + h) % 2 else BASALT[4]
    # furnace vents (glowing grilles)
    for vx in (8, 88):
        if abs(x - vx) <= 3 and 9 <= h <= 15:
            if abs(x - vx) == 3 or h in (9, 15):
                return IRON[3]
            return IRON[2] if x % 2 == 0 else (LAVA[2] if h > 11 else LAVA[1])
    # dressed basalt ashlar
    course = (h - 7) // 7
    hx = (x + 9 + course * 7) % 14
    if (h - 7) % 7 == 6 or hx == 0:
        return WALL[4]
    k = 2
    if (h - 7) % 7 == 5 or hx == 13:
        k = 3
    elif (h - 7) % 7 == 0 or hx == 1:
        k = 1
    if nz((x + 9 + course * 7) // 14, course, 3) > 200 and k == 2:
        k = 1
    if x < 8 or x > 88:
        k = min(4, k + 1)
    return WALL[k]


def cone_color(th, t, night):
    def f(x, d, h, face):
        if d == 0 and face == "front":
            return facade_px(th, x, h, t, night)
        r, a = polar(x, d)
        rr = rim_r(a)
        if r < rr - 5 and face == "top":                       # molten crater pool
            v = math.sin(x * 0.7 + d * 0.9) + math.sin(x * 0.3 - d * 1.3)
            return LAVA[0] if v > 1.1 else LAVA[1] if v > -0.3 else LAVA[2]
        if r < rr:                                             # inner crater wall
            return LAVA[3] if h < HRIM - 2 else CRIM[3]
        if r < rr + 3 and face == "top":                       # rim lip
            return OBS[0] if x < VC else OBS[2]
        s, hmin = streak(r, a)
        if s is not None and h >= hmin:
            if s == 0:
                return LAVA[0] if (h + d) % 7 == 0 else LAVA[1]
            if s == 1:
                return LAVA[2]
            return OBS[4]
        gx = hf(x + 1, d) - hf(x - 1, d)
        k = 2 - max(-1.6, min(1.6, gx * 0.55))
        k = int(round(k))
        if face == "front":
            k += 1
        n = nz((x + d) // 3, (h + d) // 3, 4)
        if n > 236:
            k += 1
        elif n < 18:
            k -= 1
        if (h + int(2 * math.sin(x * 0.25))) % 11 == 0 and face == "top":
            k += 1
        k = max(0, min(4, k))
        # glowing magma veins
        if 34 < r < 70 and abs(math.sin(a * 6.0 + r * 0.22)) < 0.05 and cl(x, d, 9) > 120:
            return LAVA[3]
        return OBS[k]
    return f


def volcano(sc, th, t, night):
    xs = [k[0] for k in HF]
    ds = [k[1] for k in HF]
    sc.sculpt(min(xs), max(xs) + 1, 0, max(ds) + 1, 0, HRIM + 1,
              lambda x, d, h: h < HF.get((x, d), 0), cone_color(th, t, night))


def forge_arch(sc):
    """Protruding bronze voussoir ring + jambs around the forge mouth."""
    def ring(x, h):
        ax, ah = x - VC, h - 24
        rr = math.hypot(ax, ah) if ah > 0 else abs(ax)
        return 19 <= rr < 23.5, rr

    def inside(x, d, h):
        return -3 <= d < 0 and ring(x, h)[0]

    def color(x, d, h, face):
        ax, ah = x - VC, h - 24
        _, rr = ring(x, h)
        if face == "top":
            return BRONZE[0] if x < VC else BRONZE[1]
        if rr < 20:                                   # inner lip lit by the fire
            return LAVA[2]
        if ah <= 0:                                   # jamb blocks
            if h % 7 == 0:
                return IRON[4]
            return IRON[1] if ax < 0 and abs(ax) > 21 else IRON[2] if ax < 0 else IRON[3]
        ang = math.atan2(ah, ax)
        seg = int(ang / (math.pi / 9))
        if abs(ang - (seg + 0.5) * math.pi / 9) > math.pi / 9 * 0.42:
            return BRONZE[4]
        base = 1 if ax < -4 else 2 if ax < 6 else 3
        if rr > 22.5:
            base = max(0, base - 1)
        return BRONZE[base]
    sc.sculpt(VC - 25, VC + 26, -3, 0, 0, 49, inside, color, shadow=False, edge=BRONZE[4])


def coping(sc):
    """Riveted crimson metal band following the cut edge of the facade."""
    def top(x):
        return hf(x, 0)

    def inside(x, d, h):
        t = top(x)
        return -2 <= d < 0 and t > 6 and t - 4 <= h < t + 1

    def color(x, d, h, face):
        if face == "top":
            return CRIM[0] if x < VC else CRIM[1]
        k = top(x) - h
        if k == 2 and x % 7 == 3:
            return BRONZE[0]
        return CRIM[[1, 1, 2, 2, 3][max(0, min(4, k))]]
    sc.sculpt(-16, 112, -2, 0, 0, HRIM, inside, color, shadow=False, edge=CRIM[4])


def brick_stack(sc, cx, cd, h0, h1, r=5):
    def inside(x, d, h):
        q = ((x - cx) / r) ** 2 + ((d - cd) / (r * 0.8)) ** 2
        if h >= h1 - 5:
            return q < 1.45
        return q < 1

    def color(x, d, h, face):
        dx = x - cx
        side = 0 if dx < -r * 0.45 else 1 if dx < r * 0.25 else 2 if dx < r * 0.75 else 3
        if h >= h1 - 5:                                # iron crown with notches
            if face == "top":
                q = ((x - cx) / r) ** 2 + ((d - cd) / (r * 0.8)) ** 2
                return (IO, True) if q < 0.45 else LAVA[3] if q < 0.8 else IRON[0]
            if h == h1 - 1 and (x - cx) % 4 == 2:
                return IRON[4]
            if h == h1 - 5:
                return BRONZE[min(4, side + 1)]
            return IRON[min(4, side)]
        if h1 - 12 <= h < h1 - 8:                      # crimson band
            return CRIM[min(4, side + (1 if h == h1 - 12 else 0))]
        course = h // 3
        if h % 3 == 0 or (x + course * 2) % 5 == 0:
            return BRICK[min(4, side + 1)]
        return BRICK[side]
    sc.sculpt(int(cx - r * 1.3 - 1), int(cx + r * 1.3 + 2), int(cd - r), int(cd + r + 1), h0, h1,
              inside, color, shadow=False)


def smoke_fn(x, d, h, face, b, nx, ny):
    if ny < -0.45 and b[2] < 118:
        return ((150, 86, 92), True)
    return lit(SMOKE, nx, ny)


def trough(sc, x0, x1):
    def lava_top(u, v, U, V):
        k = (u * 3 + v * 5) % 11
        return LAVA[0] if k == 0 else LAVA[2] if k in (5, 6) else LAVA[1]
    sc.box(x0 + 2, x1 - 2, -9, 0, 0, 2, top=lava_top, front=LAVA[3])
    lip = lambda u, v, U, V: BASALT[1] if v == V - 1 else BASALT[2] if (u // 5) % 2 else BASALT[3]
    sc.box(x0, x0 + 2, -9, 0, 0, 4, top=BASALT[0], front=lip, edge=BASALT[4])
    sc.box(x1 - 2, x1, -9, 0, 0, 4, top=BASALT[1], front=lip, edge=BASALT[4])
    sc.box(x0, x1, -11, -9, 0, 4, top=lambda u, v, U, V: BRONZE[1] if u % 6 else BRONZE[0],
           front=lambda u, v, U, V: BASALT[2] if (u // 5 + v) % 2 else BASALT[3], edge=BASALT[4])


def causeway(sc):
    def top(u, v, U, V):
        if u in (0, U - 1):
            return BRONZE[2]
        if v % 4 == 0 or (u + (v // 4) * 4) % 8 == 0:
            return BASALT[2]
        return BASALT[1] if (u // 8 + v // 4) % 2 else BASALT[0]
    sc.box(TROUGHS[0][1], TROUGHS[1][0], -11, 0, 0, 1, top=top, front=BASALT[3])


def anvil(sc, cx, cd):
    sc.box(cx - 4, cx + 4, cd - 2, cd + 3, 0, 6, top=BRICK[1],
           front=lambda u, v, U, V: BRICK[2] if v % 3 else BRICK[3], edge=BRICK[4])          # stump
    sc.box(cx - 3, cx + 3, cd - 1, cd + 2, 6, 8, top=IRON[1], front=IRON[3], edge=IRON[4])   # waist
    sc.box(cx - 7, cx + 6, cd - 2, cd + 3, 8, 11, top=IRON[0],
           front=lambda u, v, U, V: IRON[1] if u < 4 else IRON[2], edge=IRON[4])             # face
    sc.box(cx - 9, cx - 7, cd - 1, cd + 2, 9, 11, top=IRON[0], front=IRON[2], edge=IRON[4])   # horn
    sc.box(cx - 2, cx + 3, cd - 1, cd + 2, 11, 13, top=LAVA[0], front=LAVA[2], edge=LAVA[4])  # ingot
    sc.box(cx - 6, cx - 4, cd - 3, cd - 2, 0, 6, front=lambda u, v, U, V: BRONZE[2] if u else BRONZE[1])
    sc.box(cx - 8, cx - 2, cd - 4, cd - 1, 6, 8, top=IRON[0], front=IRON[2], edge=IRON[4])    # hammer


def crucible(sc, cx, cd):
    for lx in (cx - 5, cx + 4):
        sc.box(lx, lx + 2, cd - 1, cd + 1, 0, 9, front=lambda u, v, U, V: IRON[2] if u else IRON[1],
               edge=IRON[4])
    sc.box(cx - 1, cx + 1, cd + 2, cd + 4, 0, 9, front=IRON[3])

    def inside(x, d, h):
        return ((x - cx) / 7.5) ** 2 + ((d - cd) / 5) ** 2 + ((h - 15) / 7.5) ** 2 < 1 and h < 19

    def color(x, d, h, face):
        if face == "top" and h == 18:
            q = ((x - cx) / 6) ** 2 + ((d - cd) / 4) ** 2
            return LAVA[0] if q < 0.3 else LAVA[1] if q < 0.75 else CRIM[3]
        dx = x - cx
        if h == 17:
            return CRIM[0] if dx < 0 else CRIM[2]
        return IRON[1] if dx < -3 else IRON[2] if dx < 3 else IRON[3]
    sc.sculpt(cx - 9, cx + 10, cd - 6, cd + 6, 8, 19, inside, color, edge=IRON[4])
    # pour spout + molten stream into the lava trough
    sc.box(cx - 10, cx - 7, cd - 1, cd + 1, 15, 17, top=IRON[0], front=IRON[2], edge=IRON[4])
    sc.box(cx - 10, cx - 9, cd - 1, cd, 2, 15, front=lambda u, v, U, V: LAVA[0] if v % 4 == 1 else LAVA[1])


def exterior(sc, th, t, night):
    volcano(sc, th, t, night)
    # smokestacks on the shoulders + their fire and smoke
    for cx, cd in STACKS:
        base = hf(cx, cd - 5) - 4
        brick_stack(sc, cx, cd, base, STACK_TOP)
        flame_top(sc, LAVA, cx, cd, STACK_TOP, hh=8, r=3.5)
    sphere_sculpt(sc, [(4, 11, 72, 4), (0, 11, 77, 3.5), (-4, 11, 81, 2.5),
                       (92, 11, 72, 4), (96, 11, 77, 3.5), (100, 11, 81, 2.5)], smoke_fn, shadow=False)
    # crater plume
    sphere_sculpt(sc, [(48, 16, 67, 6), (43, 16, 71, 5.5), (53, 16, 72, 6), (48, 16, 76, 5),
                       (55, 16, 79, 4), (41, 16, 78, 4)], smoke_fn, shadow=False)
    coping(sc)
    forge_arch(sc)
    emblem_plate(sc, th, h0=38, d0=-6, d1=-3, cx=VC, rim=CRIM)
    causeway(sc)
    for x0, x1 in TROUGHS:
        trough(sc, x0, x1)
    anvil(sc, -5, -6)
    crucible(sc, 102, -5)


def sparks(sc, th, night):
    pts = [(-12, 104), (-8, 102), (-4, 106), (46, 30), (51, 27), (42, 26), (6, 40), (10, 37),
           (84, 38), (88, 41), (100, 100), (17, 80), (78, 79)]
    for i, (ex, ey) in enumerate(pts):
        sc.put(X0 + ex, ey, LAVA[1] if i % 2 else LAVA[0])


# ---------------------------------------------------------------- interior
def hazard_px(gx, gy):
    x, y = gx % T, gy % T
    a = 2 * math.pi / T
    v = math.sin(a * x + 1.3 * math.sin(a * y)) + 0.6 * math.sin(2 * a * y + 0.8 * math.cos(a * x))
    return LAVAI[0] if v > 1.15 else LAVAI[1] if v > 0.55 else LAVAI[2] if v > -0.7 else LAVAI[3]


FLOOR1 = R5((120, 104, 116), (96, 82, 98), (78, 66, 84), (60, 50, 68), (42, 34, 52))
CAVE = R5((150, 116, 106), (126, 96, 92), (102, 76, 78), (78, 58, 66), (54, 40, 52))


def forge_floor_px(gx, gy):
    """1F: polished obsidian slabs (2 per tile) with bronze corner studs, exact 16 px repeat."""
    x, y = gx % T, gy % T
    if (x, y) in ((0, 0), (1, 0), (0, 1)):
        return BRONZE[1]
    if (x, y) == (1, 1):
        return BRONZE[3]
    if x == 0 or y == 0:
        return FLOOR1[0]
    if x == T - 1 or y == T - 1:
        return FLOOR1[4]
    if y == 8:
        return FLOOR1[3]
    if y == 9:
        return FLOOR1[1]
    if x + (y % 8) in (5, 6) and y % 8 in (2, 3, 4):
        return FLOOR1[0]                                   # obsidian sheen
    return FLOOR1[2]


def cave_floor_px(gx, gy):
    """B1F: basalt cobbles, 4 stones per tile, exact 16 px repeat."""
    x, y = gx % T, gy % T
    stones = ((4, 4, 3.6), (11, 3, 3.2), (3, 11, 3.0), (11, 11, 3.8))
    for cx, cy, r in stones:
        q = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r)
        if q < 1:
            if x - cx + y - cy < -2:
                return CAVE[0]
            return CAVE[2] if x - cx + y - cy > 2 else CAVE[1]
        if q < 1.45:
            return CAVE[3]
    if (x, y) in ((7, 7), (8, 8)):
        return LAVAI[3]
    return CAVE[4]


RIM1 = R5((108, 92, 104), (90, 76, 90), (70, 58, 74), (52, 42, 60), (36, 28, 46))


def tile_rim(ctx, c, r):
    t_rim(ctx, c, r, BASALT if ctx.floor["name"] == "B1F" else RIM1)


def tile_floor(ctx, c, r):
    b1 = ctx.floor["name"] == "B1F"
    ctx.fill(c, r, cave_floor_px if b1 else forge_floor_px)
    F = CAVE if b1 else FLOOR1
    if ctx.g(c, r - 1) in "#P":
        X, Y = c * T, r * T
        for x in range(T):
            ctx.p[X + x, Y] = F[4]
            ctx.p[X + x, Y + 1] = F[3]


def tile_pillar(ctx, c, r):
    _wallblock(ctx, c, r, (CRIM[2], CRIM[1], CRIM[3], CRIM[4]), "#OP", pillar=True)
    X, Y = c * T, r * T
    ctx.d.ellipse([X + 4, Y + 3, X + 11, Y + 9], fill=BRONZE[2], outline=IO)
    ctx.d.ellipse([X + 5, Y + 4, X + 10, Y + 8], fill=LAVAI[1])
    ctx.d.point([X + 7, Y + 5], fill=LAVAI[0])


def tile_hole(ctx, c, r):
    """Cracked floor: slabs split by glowing fissures around a dark drop."""
    tile_floor(ctx, c, r)
    X, Y, p = c * T, r * T, ctx.p
    for y in range(T):
        for x in range(T):
            dd = ((x - 7.5) / 5.5) ** 2 + ((y - 8) / 4.5) ** 2
            if dd < 1:
                p[X + x, Y + y] = IO if dd > 0.78 else (LAVAI[3] if y > 9 else (26, 16, 26))
    cracks = [[(1, 2), (4, 5), (5, 5)], [(14, 1), (11, 4), (11, 5)], [(1, 14), (4, 11)],
              [(15, 13), (12, 11)], [(8, 0), (8, 3)], [(7, 15), (7, 13)]]
    for cr in cracks:
        pts = [(X + a, Y + b) for a, b in cr]
        ctx.d.line([(a + 1, b) for a, b in pts], fill=IO)
        ctx.d.line(pts, fill=LAVAI[2])


def _upright_floor(ctx, c, r):
    tile_floor(ctx, c, r)


def decor(ctx):
    d = ctx.d
    for r in range(ctx.h):
        for c in range(ctx.w):
            ch = ctx.g(c, r)
            x, y = c * T, r * T
            if ch == "A":                                  # anvil on a stump, glowing ingot
                d.rectangle([x + 5, y + 9, x + 10, y + 15], fill=BRICK[2], outline=IO)
                d.line([x + 6, y + 10, x + 6, y + 14], fill=BRICK[1])
                d.polygon([(x + 1, y + 3), (x + 14, y + 3), (x + 12, y + 7), (x + 11, y + 9),
                           (x + 4, y + 9), (x + 3, y + 6), (x, y + 5)], fill=IRON[2], outline=IO)
                d.line([x + 2, y + 4, x + 13, y + 4], fill=IRON[0])
                d.line([x + 4, y + 7, x + 11, y + 7], fill=IRON[3])
                d.rectangle([x + 6, y + 1, x + 11, y + 3], fill=LAVAI[1], outline=LAVAI[3])
                d.point([x + 7, y + 2], fill=LAVAI[0])
            elif ch == "C":                                # crucible on legs, molten top
                d.line([x + 3, y + 10, x + 2, y + 15], fill=IO, width=2)
                d.line([x + 12, y + 10, x + 13, y + 15], fill=IO, width=2)
                d.ellipse([x + 1, y - 4, x + 14, y + 12], fill=IRON[2], outline=IO)
                d.arc([x + 2, y - 3, x + 13, y + 11], 120, 240, fill=IRON[0])
                d.ellipse([x + 3, y - 3, x + 12, y + 3], fill=CRIM[3], outline=IO)
                d.ellipse([x + 4, y - 2, x + 11, y + 2], fill=LAVAI[1])
                d.point([x + 6, y - 1], fill=LAVAI[0])
            elif ch == "V":                                # bellows (leather + bronze nozzle)
                d.polygon([(x + 2, y + 2), (x + 13, y + 5), (x + 13, y + 11), (x + 2, y + 14)],
                          fill=BRICK[1], outline=IO)
                d.line([x + 4, y + 4, x + 4, y + 12], fill=BRICK[3])
                d.line([x + 8, y + 5, x + 8, y + 12], fill=BRICK[3])
                d.line([x + 3, y + 3, x + 12, y + 6], fill=BRICK[0])
                d.rectangle([x + 13, y + 7, x + 15, y + 9], fill=BRONZE[1], outline=IO)
                d.rectangle([x, y + 6, x + 2, y + 10], fill=BRONZE[2], outline=IO)
            elif ch == "R":                                # stalagmite
                d.polygon([(x + 8, y - 8), (x + 13, y + 14), (x + 2, y + 14)], fill=OBS[2], outline=IO)
                d.line([x + 7, y - 4, x + 4, y + 12], fill=OBS[0])
                d.line([x + 10, y + 2, x + 11, y + 12], fill=OBS[3])
                d.line([x + 8, y + 4, x + 8, y + 10], fill=LAVAI[3])


THEME = dict(
    name="Fire-Type Gym", archetype="Volcano Foundry",
    wall=WALL, accent=CRIM, trim=BRONZE, rock=OBS, deck=BASALT, glow=LAVA,
    emblem=flame_emblem, door_spill=(232, 128, 64), door_inside=(70, 30, 34),
    exterior=exterior, sparks=sparks,
    night_lights=(X0 - 8, X0 + 12, X0 + 84, X0 + 104),
    floor=FLOOR1,
    hazard_px=hazard_px,
    hazard_ramp=R5((255, 244, 170), (255, 200, 64), (244, 128, 36), (204, 72, 32), (150, 40, 36)),
    ledge=R5((206, 190, 182), (174, 156, 152), (140, 122, 124), (104, 88, 98), (70, 58, 72)),
    outside=BASALT, stair_ramp=[(176, 150, 150), (140, 116, 122), (104, 84, 96)],
    tiles={"#": tile_rim, ".": tile_floor, "T": tile_floor, "P": tile_pillar, "H": tile_hole,
           "A": _upright_floor, "C": _upright_floor, "V": _upright_floor, "R": _upright_floor},
    decor=decor,
    legend_extra={"A": "anvil (blocked)", "C": "crucible (blocked)", "V": "bellows (blocked)",
                  "R": "stalagmite (blocked)", "H": "cracked floor, drops to B1F (link)"},
    floors=[
        dict(name="1F", grid=[
            "OOOOOOOOPKKPOOOOOOOO",   # 0  leader alcove in the north rim
            "OOOO####PKKP####OOOO",   # 1
            "OOO#C....SS..~..#OOO",   # 2
            "OO#A........T~..D#OO",   # 3  T5 guards the terrace bridge; D = arrival from B1F
            "O#V..........=....#O",   # 4
            "O#C..........~...C#O",   # 5
            "#~~~~~~~~~~~~~~~~~~#",   # 6  molten trench: terrace unreachable from the hall
            "#~~~~~~~~~~~~~~~~~~#",   # 7
            "#C........~.......C#",   # 8
            "#.........~T....H..#",   # 9  T2 guards the channel bridge; H = cracked floor
            "#..A......=.......V#",   # 10
            "#.........~........#",   # 11
            "#C........~.......C#",   # 12
            "#~~|~~~~~~~~~~~~~~~#",   # 13 molten channel, one crossing
            "#...T..............#",   # 14 T1 guards it
            "#.A....A....A....A.#",   # 15 anvil row
            "#..................#",   # 16
            "##C..............C##",   # 17
            "OO#######MM#######OO",   # 18
            "OOOOOOOOOOOOOOOOOOOO"],  # 19
             trainers=[(4, 14, "left", 1), (11, 9, "down", 1), (12, 3, "down", 1)]),
        dict(name="B1F", grid=[
            "####################",   # 0
            "##~~~~~~~~~~~R....##",   # 1
            "##R....T~~~~~.....##",   # 2  landing (15,2); T3 watches the bridge head
            "##......=====....R##",   # 3  E-W bridge over the lava lake
            "##..R...~~~~~...####",   # 4
            "##......~~~~~~~~~~##",   # 5
            "##...R~~~~~~~~~~~~~#",   # 6
            "##~|~~~~~~~~~~~~~~~#",   # 7  N-S bridge
            "##~|~~~~~~~~~~~~~~~#",   # 8
            "##..T.....~~~R....##",   # 9  T4 watches the bridge foot
            "##R.......~~~....U##",   # 10 stairs UP to the 1F leader terrace
            "##.....R..===.....##",   # 11
            "###.......~~~..R.###",   # 12
            "####################"],  # 13
             trainers=[(7, 2, "down", 1), (4, 9, "left", 1)]),
    ],
    battle_order=[0, 1, 3, 4, 2],
    links=[dict(type="hole", a=("1F", 16, 9), b=("B1F", 15, 2)),
           dict(type="stairs", a=("B1F", 17, 10), b=("1F", 16, 3))],
    leader=("1F", 9, 1, "down"),
)
