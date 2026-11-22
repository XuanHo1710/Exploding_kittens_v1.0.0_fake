"""Rock-Type Gym: Geode Bastion (stone fortress).

Exterior: battered slate curtain wall between two square crenellated corner towers with
machicolation bands, cross arrow slits and amethyst beacons; a rust-iron banded gatehouse
arch frames the sliding door under a glowing crystal tympanum; behind the parapet rises a
jagged faceted slate peak split by a glowing geode and amethyst ore veins, crowned by a
crystal cluster. Ground props: menhirs on rock cairns topped with glowing crystals.

Interior: 1F quarry hall (14x20) cut by two rock shelves (one guarded gap each) and a chasm
that seals the leader terrace -> drop through a hole into the B1F mine (20x14: timber shoring,
minecart rails, crystal clusters, timber bridges over a chasm) -> stairs UP onto the 1F
leader terrace. A second, decoy hole drops into a dead-end mine pocket whose stairs lead
back to the 1F entrance quarry.
"""
import math

from gymkit import (IO, STONE, T, WARM, WOOD, X0, DOOR_X0, DOOR_X1, E, R5, cl, nz, door_px, t_floor,
                    t_rim)

# ---------------------------------------------------------------- palette
SLATE = R5((180, 186, 206), (148, 154, 178), (118, 122, 150), (88, 90, 122), (60, 60, 92))
IRON = R5((204, 192, 190), (156, 146, 152), (114, 104, 118), (78, 70, 88), (50, 44, 62))
RUST = R5((236, 156, 96), (202, 110, 66), (160, 76, 52), (116, 50, 48), (78, 34, 42))
PEAK = R5((176, 164, 176), (140, 128, 148), (110, 98, 124), (80, 70, 100), (54, 46, 74))
DECKR = R5((156, 148, 146), (128, 120, 124), (102, 94, 104), (78, 70, 86), (54, 46, 64))
MEN = R5((206, 194, 172), (174, 160, 142), (140, 126, 114), (104, 92, 90), (70, 60, 68))
AME = [(255, 236, 255), (236, 178, 255), (194, 120, 242), (142, 74, 204), (96, 46, 152)]
GLOW = E(AME)
SHELL = [(222, 212, 230), (182, 168, 198)]           # pale chalcedony geode rind
SLIT_DAY = (36, 30, 56)

# ---------------------------------------------------------------- shared geometry
TW_L, TW_R = (-6, 10), (86, 102)                    # tower x spans
T_D0, T_D1, T_H = -3, 13, 48                          # tower front/back depth, wall top
GATE = (24, 72, 0, 12, 0, 46)                         # gatehouse box
BODY_H = 30


def body_df(h):
    """Battered (inward sloping) front of the curtain wall."""
    return 1 + h * 0.12


def blocks(R, x, h, side=0, ch=8, bw=16, s=0):
    """Big slate ashlar blocks: dark mortar, lit top/left edge, per-block tone."""
    course = int(h) // ch
    off = (course % 2) * (bw // 2)
    u, v = (int(x) + off) % bw, int(h) % ch
    k = 2 + side
    if v == 0 or u == bw - 1:
        k += 1
    elif v == ch - 1 or u == 0:
        k -= 1
    else:
        n = nz((int(x) + off) // bw, course, 9 + s)
        if n > 200:
            k += 1
        elif n < 40:
            k -= 1
        elif (u * 7 + v * 3) % 23 == 0:
            k += 1
    return R[max(0, min(4, k))]


def prism(sc, px, pd, hb, hh, r, tilt, edge=True):
    """Hexagonal amethyst crystal prism with a pointed tip (emissive)."""
    def inside(x, d, h):
        if h < hb or h >= hb + hh:
            return False
        xc = px + tilt * (h - hb)
        taper = min(1.0, (hb + hh - h) / (r * 1.5))
        return abs(x - xc) + abs(d - pd) * 0.9 < r * taper + 0.4

    def color(x, d, h, face):
        xc = px + tilt * (h - hb)
        e = x - xc
        taper = min(1.0, (hb + hh - h) / (r * 1.5))
        if taper < 1 and e < 0.5:                      # lit tip facet
            return GLOW[0] if e < -0.5 or h % 2 else GLOW[1]
        return GLOW[0] if e < -r * 0.45 else GLOW[1] if e < 0.3 else GLOW[2] if e < r * 0.55 else GLOW[3]
    sc.sculpt(int(px - r - 2 - abs(tilt) * hh), int(px + r + 3 + abs(tilt) * hh), int(pd - r - 1),
              int(pd + r + 2), hb, hb + hh, inside, color, shadow=False, edge=GLOW[4] if edge else None)


def cluster(sc, cx, cd, hb, s=1.0):
    for (dx, dd, hh, r, tl) in ((0, 0, 13, 3.2, 0), (-4, 1, 9, 2.4, -0.3), (4, 1, 10, 2.4, 0.28),
                                (-2, -2, 6, 1.8, -0.15), (3, -2, 6, 1.8, 0.2)):
        prism(sc, cx + dx * s, cd + dd, hb, max(3, int(hh * s)), max(1.4, r * s), tl)


# ---------------------------------------------------------------- crown: faceted slate peak + geode
CONES = [  # cx, cd, top, base radius, facets, rotation
    (48, 20, 80, 28, 5, 0.314),
    (29, 18, 62, 14.5, 4, 0.9),
    (68, 18, 65, 15, 4, 0.2),
    (19, 15, 47, 9.5, 4, 0.5),
    (77, 15, 48, 9.5, 4, 1.2),
]
VEINS = [(34, 36, 57), (64, 35, 61), (55, 52, 72), (21, 33, 45), (76, 33, 47)]   # x, h0, h1
GEODE = (46, 48, 9.0, 7.5)          # x, h, rx, rh on the peak front


def _cone_hit(x, d, h):
    best = None
    for i, (cx, cd, top, rb, n, rot) in enumerate(CONES):
        if h >= top:
            continue
        R = rb * (top - h) / (top - BODY_H)
        R *= 1 + 0.07 * (((int(h) // 6) * 7 + i) % 3 - 1)          # stepped slate ledges
        dx, dd = x - cx - (h - BODY_H) * (0.06 if i == 0 else -0.05 if cx > 48 else 0.05), (d - cd) / 0.55
        r = math.hypot(dx, dd)
        a = math.atan2(dd, dx) + rot
        seg = 2 * math.pi / n
        m = (a % seg) - seg / 2
        rp = R * math.cos(seg / 2) / math.cos(m)
        if r < rp:
            q = r / max(rp, 0.1)
            if best is None or q < best[1]:
                best = (i, q, a - m - rot, abs(m) / (seg / 2))
    return best


def _tri(t):
    return 4 * abs(t - math.floor(t + 0.5)) - 1


def geode_disc(sc):
    """Split geode set into the peak: pale chalcedony rind, dark band, radial amethyst teeth."""
    gx, gh, rx, rh = GEODE

    def e_of(x, h):                     # hexagonal metric: a cut, faceted geode
        u, v = abs(x - gx + 0.5) / rx, abs(h - gh + 0.5) / rh
        return max(u * 0.87 + v * 0.5, v) ** 1.6

    def inside(x, d, h):
        e = e_of(x, h)
        return e < 1 and (d >= 9 or (d == 8 and e > 0.7))

    def color(x, d, h, face):
        e = e_of(x, h)
        if face == "top" or e > 0.7:
            return SHELL[0] if (x < gx + 3 and h > gh - 2) or face == "top" else SHELL[1]
        if e > 0.56:
            return GLOW[4]
        ang = math.atan2((h - gh + 0.5) / rh, (x - gx + 0.5) / rx)
        sector = int((ang + math.pi) / (2 * math.pi) * 12) % 2
        if e < 0.1:
            return GLOW[0]
        if e < 0.22:
            return GLOW[1]
        return (GLOW[1] if x < gx else GLOW[2]) if sector else GLOW[3]
    sc.sculpt(int(gx - rx - 1), int(gx + rx + 2), 8, 12, int(gh - rh - 1), int(gh + rh + 2), inside, color,
              shadow=False)


def crown(sc):
    def inside(x, d, h):
        return d < 34 and _cone_hit(x, d, h) is not None

    def color(x, d, h, face):
        i, q, fa, edge = _cone_hit(x, d, h)
        if face == "front":
            gx, gh, rx, rh = GEODE
            e = ((x - gx) / rx) ** 2 + ((h - gh) / rh) ** 2
            if e < 1.45:
                return PEAK[4] if h < gh else PEAK[3]
            for vx, h0, h1 in VEINS:
                if h0 <= h <= h1:
                    xv = vx + 2.5 * _tri((h - h0) / 9.0)
                    if abs(x - xv) < 0.6:
                        return GLOW[1]
                    if abs(x - xv) < 1.2:
                        return GLOW[3]
        L = -math.cos(fa) * 0.75 - math.sin(fa) * 0.35            # light from the top-left-front
        k = 0 if L > 0.5 else 1 if L > 0.05 else 2 if L > -0.45 else 3
        if face == "top":
            k = max(0, k - 1)
        elif edge > 0.86:                                          # crisp facet ridge
            k = 0 if L > -0.2 else max(0, k - 1)
        elif int(h) % 6 == 0:                                      # ledge shadow line
            k += 1
        return PEAK[max(0, min(4, k))]
    sc.sculpt(6, 92, 2, 34, BODY_H, 81, inside, color)
    geode_disc(sc)
    cluster(sc, 49, 21, 73, 0.9)
    prism(sc, 43, 19, 71, 7, 1.9, -0.5)
    prism(sc, 55, 19, 71, 8, 2.0, 0.45)
    cluster(sc, 29, 18, 58, 0.55)
    cluster(sc, 68, 18, 61, 0.6)


# ---------------------------------------------------------------- body
SLITS_BODY = [(17, 8, 22), (79, 8, 22)]    # cx, h0, h1 (cross slits on the curtain wall)


def slit_color(x, h, cx, h0, h1, night):
    """Cross-shaped arrow slit (balistraria). Returns colour or None."""
    v = h - h0
    L = h1 - h0
    arm = L // 2 + 1
    ins = (abs(x - cx) <= 0.5 and 0 <= v <= L) or (abs(x - cx) <= 3 and v in (arm, arm + 1))
    if not ins:
        frame = (abs(x - cx) <= 1.5 and -1 <= v <= L + 1) or (abs(x - cx) <= 4 and arm - 1 <= v <= arm + 2)
        if frame:
            return SLATE[0] if (x < cx and v > 0) else SLATE[3]
        return None
    if night:
        return WARM[1] if v % 5 else WARM[0]
    return SLIT_DAY


def body(sc, th, t, night):
    def inside(x, d, h):
        return 4 <= x < 92 and body_df(h) <= d < 32 and 0 <= h < BODY_H

    def color(x, d, h, face):
        if face == "top" and h >= BODY_H - 1:
            return DECKR[1] if cl(x, d, 2) > 170 else DECKR[2]
        if h < 3:
            return SLATE[4] if (x // 8 + h) % 2 else SLATE[3]
        if 24 <= h <= 26:
            return RUST[1] if h == 26 else RUST[3] if h == 24 else RUST[2]
        if h >= BODY_H - 3:
            return SLATE[4]
        for cx, h0, h1 in SLITS_BODY:
            c = slit_color(x, h, cx, h0, h1, night)
            if c is not None:
                return c
        c = blocks(SLATE, x, h, 0)
        if face == "top":                               # battered slope catches light
            c = SLATE[max(0, SLATE.index(c) - 1)] if c in SLATE else c
        return c
    sc.sculpt(4, 92, 0, 32, 0, BODY_H, inside, color)
    # crenellated front parapet
    pd0 = int(body_df(BODY_H)) - 1

    def par_in(x, d, h):
        if not (8 <= x < 88 and pd0 <= d < pd0 + 4 and BODY_H <= h < BODY_H + 10):
            return False
        return h < BODY_H + 5 or (x - 8) % 9 < 5

    def par_col(x, d, h, face):
        if face == "top":
            return SLATE[0] if h >= BODY_H + 5 else DECKR[1]
        if h == BODY_H:
            return SLATE[4]
        m = (x - 8) % 9
        if h >= BODY_H + 5:
            return SLATE[1] if m == 0 else SLATE[3] if m == 4 else SLATE[2]
        return SLATE[1] if h == BODY_H + 4 else SLATE[2] if (x // 9 + h) % 5 else SLATE[3]
    sc.sculpt(8, 88, pd0, pd0 + 4, BODY_H, BODY_H + 10, par_in, par_col)


# ---------------------------------------------------------------- towers
def tower(sc, x0, x1, night):
    c = 4
    cxm = (x0 + x1) / 2

    def flare(h):
        return max(0.0, (12 - h) * 0.22)

    def inside(x, d, h):
        f = flare(h)
        xl, xr, df = x0 - f, x1 + f, T_D0 - f
        if not (xl <= x < xr and df <= d < T_D1 and 0 <= h < T_H):
            return False
        return (d - df) >= c - 1 - (x - xl) and (d - df) >= (x - xl) - (xr - xl - c)

    def color(x, d, h, face):
        f = flare(h)
        side = 0
        if d - (T_D0 - f) > 0.6:
            side = -1 if x < cxm else 1
        if face == "top" and h < T_H - 1:
            return SLATE[1] if side <= 0 else SLATE[2]
        if h < 3:
            return SLATE[4] if (x // 6 + h) % 2 else SLATE[3]
        if 24 <= h <= 26:
            return (RUST[0] if side < 0 else RUST[3]) if side else (RUST[1] if h == 26 else RUST[3] if h == 24 else RUST[2])
        if side == 0:
            for h0, h1 in ((10, 21), (30, 42)):
                s = slit_color(x, h, int(cxm), h0, h1, night)
                if s is not None:
                    return s
        return blocks(SLATE, x, h, side, s=int(x0))
    sc.sculpt(x0 - 4, x1 + 4, T_D0 - 3, T_D1, 0, T_H, inside, color)

    # machicolation band (corbelled, wider) with roof walk on top
    bx0, bx1, bd0, bd1, bh0, bh1 = x0 - 2, x1 + 2, T_D0 - 2, T_D1 + 1, T_H - 2, T_H + 5

    def band_in(x, d, h):
        if not (bx0 <= x < bx1 and bd0 <= d < bd1 and bh0 <= h < bh1):
            return False
        if (d - bd0) < 2 - (x - bx0) or (d - bd0) < (x - bx0) - (bx1 - bx0 - 3):
            return False
        return h >= bh0 + 2 or (x - bx0) % 4 < 2

    def band_col(x, d, h, face):
        if face == "top":
            return DECKR[1] if cl(x, d, 6) > 150 else DECKR[2]
        side = -1 if (d > bd0 and x < cxm) else 1 if (d > bd0) else 0
        if h < bh0 + 2:
            return SLATE[2 + side] if (x - bx0) % 4 == 0 else SLATE[3 + max(0, side)]
        if h == bh1 - 1:
            return SLATE[0] if side <= 0 else SLATE[2]
        if h == bh0 + 2:
            return SLATE[4]
        return SLATE[1 + side] if side else SLATE[1] if (x // 7 + h) % 4 else SLATE[2]
    sc.sculpt(bx0, bx1, bd0, bd1, bh0, bh1, band_in, band_col)

    # merlons: back + sides first, then the beacon, then the front row
    mh0, mh1 = bh1, bh1 + 6

    def merlon(x, d, h, which):
        if not (bx0 <= x < bx1 and bd0 <= d < bd1 and mh0 <= h < mh1):
            return False
        edge_l, edge_r = x < bx0 + 3, x >= bx1 - 3
        edge_f, edge_b = d < bd0 + 3, d >= bd1 - 3
        if which == "front":
            if not edge_f:
                return False
            return (x - bx0) % 6 < 3 or edge_l or edge_r
        if edge_f:
            return False
        if edge_b:
            return (x - bx0) % 6 < 3 or edge_l or edge_r
        if edge_l or edge_r:
            return (d - bd0) % 6 < 3
        return False

    def mcol(x, d, h, face):
        if face == "top":
            return SLATE[0]
        if x < bx0 + 3:
            return SLATE[1]
        if x >= bx1 - 3:
            return SLATE[3]
        return SLATE[1] if (x - bx0) % 6 == 0 else SLATE[3] if (x - bx0) % 6 == 2 else SLATE[2]
    sc.sculpt(bx0, bx1, bd0, bd1, mh0, mh1, lambda x, d, h: merlon(x, d, h, "back"), mcol, shadow=False)
    # amethyst beacon on an iron cradle
    cx, cd = int(cxm), (bd0 + bd1) // 2
    sc.box(cx - 4, cx + 4, cd - 3, cd + 3, mh0, mh0 + 3, top=IRON[2],
           front=lambda u, v, U, V: RUST[1] if v == 2 else RUST[3], edge=IRON[4])
    cluster(sc, cx, cd, mh0 + 3, 0.75)
    sc.sculpt(bx0, bx1, bd0, bd1, mh0, mh1, lambda x, d, h: merlon(x, d, h, "front"), mcol, shadow=False)


# ---------------------------------------------------------------- gatehouse
def gem_level(u, v):
    """Crystal-cluster emblem: u in -16..16, v in 0..19 (0 = bottom). 0 empty / 1 rim / 2 mid / 3 core."""
    best = 0
    for cx, w, top, base in ((0, 5.5, 19, 0), (-7, 3.6, 12, 0), (7, 3.6, 13, 0)):
        if not (base <= v <= top):
            continue
        tip = top - w * 1.1
        hw = w if v <= tip else w * (top - v) / (top - tip)
        if v < 3:
            hw *= 0.6 + 0.13 * v
        du = u - cx
        if abs(du) < hw:
            lvl = 1 if abs(du) > hw - 1.3 or v <= base + 0.5 else 3 if du < -0.5 and v < tip else 2
            best = max(best, lvl) if best != 1 else lvl
    return best


def gate(sc, th, t, night):
    x0, x1, d0, d1, h0, h1 = GATE
    ACX, ACH, AR = 48, 22, 17.5           # arch centre / radius

    def inside(x, d, h):
        if not (x0 <= x < x1 and d0 <= d < d1 and h0 <= h < h1):
            return False
        return (d - d0) >= 2 - (x - x0) and (d - d0) >= (x - x0) - (x1 - x0 - 3)

    def color(x, d, h, face):
        if face == "top":
            return DECKR[1] if cl(x, d, 8) > 150 else DECKR[2]
        side = 0 if d == d0 else (-1 if x < ACX else 1)
        if side:
            return blocks(SLATE, x, h, side, s=3)
        if DOOR_X0 <= x < DOOR_X1 and h < 28:
            return door_px(th, x - DOOR_X0, h, t, night)
        r = math.hypot(x - ACX + 0.5, (h - ACH) * 1.0)
        if h >= 28 and r < AR:                         # tympanum: recessed crystal relief
            lv = gem_level((x - ACX + 0.5) * 1.6, (h - 28) * 1.7)
            if lv:
                return GLOW[0] if lv == 3 else GLOW[1] if lv == 2 else GLOW[3]
            if night:
                return ((70, 44, 104), True)
            return (52, 42, 74) if h > 30 else (40, 32, 60)
        if r < AR + 5 and h >= 26:                     # voussoirs + keystone
            ang = math.degrees(math.atan2(h - ACH, x - ACX + 0.5))
            if abs(ang - 90) < 6:
                return RUST[1] if r > AR + 3.5 else RUST[2] if x < ACX else RUST[3]
            if r < AR + 1:
                return SLATE[4]
            k = int((ang + 180) // 13) % 2
            if r > AR + 4:
                return SLATE[3]
            return SLATE[0] if (k and x < ACX) else SLATE[1] if k else SLATE[2]
        if DOOR_X0 <= x < DOOR_X1 and h < 30:
            return IRON[3]
        # pillars: iron straps with rivets
        for b0 in (7, 19):
            if b0 <= h <= b0 + 2:
                if h == b0 + 1 and (x - x0) % 4 == 1:
                    return IRON[0]
                return RUST[1] if h == b0 + 2 else RUST[3] if h == b0 else RUST[2]
        if h < 3:
            return SLATE[4] if (x // 6 + h) % 2 else SLATE[3]
        if h1 - 4 <= h < h1 - 1:
            return IRON[2] if (x - x0) % 5 else IRON[0]
        if h == h1 - 1:
            return IRON[1]
        if h1 - 7 <= h < h1 - 4:
            return SLATE[4]
        return blocks(SLATE, x, h, 0, ch=7, bw=12, s=5)
    sc.sculpt(x0, x1, d0, d1, h0, h1, inside, color)

    def m_in(x, d, h):
        if not (x0 <= x < x1 and d0 <= d < d1 and h1 <= h < h1 + 6):
            return False
        if d < d0 + 3:
            return (x - x0) % 8 < 4 or x >= x1 - 4
        return (x < x0 + 3 or x >= x1 - 3) and (d - d0) % 6 < 3

    def m_col(x, d, h, face):
        if face == "top":
            return SLATE[0]
        m = (x - x0) % 8
        return SLATE[1] if m == 0 else SLATE[3] if m == 3 else SLATE[2]
    sc.sculpt(x0, x1, d0, d1, h1, h1 + 6, m_in, m_col, shadow=False)
    # iron lanterns hanging off the pillars
    for lx in (27, 69):
        sc.box(lx - 2, lx + 2, d0 - 3, d0 - 1, 28, 35, top=IRON[1],
               front=lambda u, v, U, V: (GLOW[1] if 1 <= v <= 4 and 1 <= u <= 2 else IRON[2]), edge=IRON[4])


# ---------------------------------------------------------------- ground props: crystal menhirs on cairns
def menhir(sc, cx, cd):
    def inside(x, d, h):
        w = 5.2 - h * 0.07 - (0.25 * (h - 24) if h > 24 else 0)
        return abs(x - cx - h * 0.04) < w and abs(d - cd) < 3 and h < 30

    def color(x, d, h, face):
        if face == "top":
            return MEN[0]
        xc = cx + h * 0.04
        vx = xc + 1.4 * math.sin(h * 0.5)
        if 4 < h < 25 and abs(x - vx) < 0.6:
            return GLOW[2]
        e = x - xc
        k = 1 if e < -2 else 2 if e < 2 else 3
        if h % 9 == 0 and cl(x, h, 3) > 90:
            k += 1
        return MEN[min(4, k)]
    sc.sculpt(cx - 7, cx + 8, cd - 3, cd + 4, 0, 30, inside, color)
    cluster(sc, cx + 1, cd, 28, 0.8)

    def cairn(x, d, h):
        for bx, bd, r, hh in ((cx - 4, cd - 1, 3.0, 4), (cx + 4, cd - 1, 3.0, 3.5), (cx, cd - 2, 2.6, 3)):
            if ((x - bx) / r) ** 2 + ((d - bd) / (r * 0.8)) ** 2 + (h / hh) ** 2 < 1:
                return True
        return False

    def ccol(x, d, h, face):
        if face == "top":
            return MEN[1] if cl(x, d, 3) > 120 else MEN[2]
        return MEN[2] if x < cx else MEN[3]
    sc.sculpt(cx - 10, cx + 10, cd - 7, cd + 1, 0, 5, cairn, ccol)


def shard(sc, cx, cd):
    """Small crystal shard in a rock cairn flanking the gate."""
    def inside(x, d, h):
        return ((x - cx) / 4) ** 2 + ((d - cd) / 3) ** 2 + (h / 4) ** 2 < 1

    def col(x, d, h, face):
        return MEN[1] if face == "top" else MEN[2] if x < cx else MEN[3]
    sc.sculpt(cx - 5, cx + 6, cd - 4, cd + 4, 0, 5, inside, col)
    prism(sc, cx, cd, 3, 7, 1.8, 0.15)


# ---------------------------------------------------------------- exterior entry
def exterior(sc, th, t, night):
    body(sc, th, t, night)
    crown(sc)
    gate(sc, th, t, night)
    tower(sc, *TW_L, night)
    tower(sc, *TW_R, night)
    shard(sc, 17, -8)
    shard(sc, 79, -8)
    menhir(sc, -5, -6)
    menhir(sc, 101, -6)


def sparks(sc, th, night):
    """Four-point twinkles beside the summit and beacon crystals."""
    for ex, ey in ((55, 9), (78, 16), (18, 42), (110, 44)):
        sc.put(ex, ey, GLOW[0])
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sc.put(ex + dx, ey + dy, GLOW[2])


# ---------------------------------------------------------------- interior
CHASM = [(30, 24, 48), (40, 32, 62), (54, 42, 82)]
QF = R5((216, 206, 190), (192, 180, 162), (162, 148, 134), (126, 112, 106), (90, 78, 82))
MF = R5((176, 142, 120), (150, 118, 100), (124, 96, 86), (96, 72, 70), (68, 50, 56))
TIMBER = WOOD
AMEI = AME


def hazard_px(gx, gy):
    x, y = gx % T, gy % T
    if (x, y) in ((4, 9), (12, 3)):
        return AMEI[2]
    if (x, y) in ((4, 8), (12, 2)):
        return AMEI[1]
    if (x, y) in ((3, 9), (5, 9), (11, 3), (13, 3), (9, 13)):
        return AMEI[4]
    if (x + y * 3) % 11 == 0 or (x * 5 + y) % 13 == 0:
        return CHASM[1]
    if (x, y) in ((7, 5), (8, 5), (1, 13), (2, 13), (14, 7)):
        return CHASM[2]
    return CHASM[0]


def quarry_px(gx, gy):
    """1F quarry flagstones: one long slab over two half slabs (running bond)."""
    x, y = gx % T, gy % T
    top = y < 8
    yy = y % 8
    split = (x == 15) if top else (x == 7 or x == 15)
    if yy == 7 or split:
        return QF[3]
    if yy == 0 or (x == 0) or (not top and x == 8):
        return QF[0]
    if (x, y) in ((4, 3), (5, 3), (11, 5), (3, 11), (12, 12), (12, 11)):
        return QF[2]
    if (x, y) in ((10, 2), (5, 12)):
        return QF[0]
    return QF[1]


def mine_px(gx, gy):
    x, y = gx % T, gy % T
    if (x, y) in ((3, 4), (4, 4), (11, 11), (12, 11), (8, 7), (13, 2)):
        return MF[3]
    if (x, y) in ((3, 3), (4, 3), (11, 10), (12, 10), (13, 1)):
        return MF[0]
    if (x, y) in ((6, 13), (14, 6), (1, 9)):
        return MF[2]
    if (x, y) == (7, 12):
        return AMEI[2]
    return MF[1]


def _mine(ctx):
    return ctx.floor["name"] == "B1F"


def tile_floor(ctx, c, r):
    if _mine(ctx):
        ctx.fill(c, r, mine_px)
        if ctx.g(c, r - 1) in "#":
            X, Y = c * T, r * T
            for x in range(T):
                ctx.p[X + x, Y] = MF[4]
                ctx.p[X + x, Y + 1] = MF[2]
    else:
        t_floor(ctx, c, r)


def tile_rim(ctx, c, r):
    t_rim(ctx, c, r, PEAK if _mine(ctx) else SLATE)


def tile_rails(ctx, c, r):
    tile_floor(ctx, c, r)
    X, Y, p = c * T, r * T, ctx.p
    rail = "r=c"
    horiz = ctx.g(c - 1, r) in rail or ctx.g(c + 1, r) in rail
    for i in range(T):
        for j in range(T):
            u, v = (i, j) if horiz else (j, i)        # u along, v across
            if v in (3, 12) and u % 4 == 1:
                col = TIMBER[2]
            elif v in (2, 13) and u % 4 == 1:
                col = TIMBER[1]
            elif v in (4, 11):
                col = IRON[0]
            elif v in (5, 10):
                col = IRON[3]
            elif 2 <= v <= 13 and u % 4 in (1, 2):
                col = TIMBER[2] if u % 4 == 1 else TIMBER[3]
            else:
                continue
            p[X + (u if horiz else v), Y + (v if horiz else u)] = col


def draw_crystals(d, x, y, big=True):
    """Upright amethyst cluster standing at the tile (x, y) whose base row is y + 29."""
    d.ellipse([x + 1, y + 24, x + 14, y + 31], fill=PEAK[2], outline=IO)
    d.line([x + 3, y + 25, x + 9, y + 25], fill=PEAK[0])
    shapes = [(8, 3 if big else 9, 3), (4, 12, 2), (12, 13, 2)]
    for cx, top, w in shapes:
        poly = [(x + cx, y + top), (x + cx + w, y + top + w + 1), (x + cx + w, y + 27), (x + cx - w, y + 27),
                (x + cx - w, y + top + w + 1)]
        d.polygon(poly, fill=AMEI[2], outline=IO)
        d.line([x + cx - w + 1, y + top + w + 1, x + cx - w + 1, y + 26], fill=AMEI[1])
        d.line([x + cx, y + top + 1, x + cx, y + 26], fill=AMEI[0] if w > 2 else AMEI[1])
        d.line([x + cx + w - 1, y + top + w + 2, x + cx + w - 1, y + 26], fill=AMEI[3])


def decor(ctx):
    d = ctx.d
    mine = _mine(ctx)
    # hole arrival rubble on the mine floor
    if mine:
        for l in ctx.th["links"]:
            if l["type"] == "hole" and l["b"][0] == "B1F":
                _, bx, by = l["b"]
                X, Y = bx * T, by * T
                for (ox, oy, rr) in ((1, 2, 2), (12, 1, 2), (2, 12, 2), (12, 12, 3), (7, 0, 1)):
                    d.ellipse([X + ox, Y + oy, X + ox + rr + 1, Y + oy + rr], fill=MF[3], outline=IO)
                    d.point([X + ox + 1, Y + oy], fill=MF[0])
    for r in range(ctx.h):
        for c in range(ctx.w):
            ch = ctx.g(c, r)
            x, y = c * T, r * T - 14
            if ch == "C":
                tile_floor(ctx, c, r)
                draw_crystals(d, x, y)
            elif ch == "R":                      # cut quarry blocks stacked
                tile_floor(ctx, c, r)
                d.rectangle([x + 1, y + 20, x + 14, y + 29], fill=QF[3], outline=IO)
                d.line([x + 2, y + 21, x + 13, y + 21], fill=QF[1])
                d.line([x + 7, y + 22, x + 7, y + 28], fill=QF[4])
                d.rectangle([x + 3, y + 12, x + 12, y + 20], fill=SLATE[2], outline=IO)
                d.line([x + 4, y + 13, x + 11, y + 13], fill=SLATE[0])
                d.line([x + 4, y + 14, x + 4, y + 19], fill=SLATE[1])
                d.point([x + 9, y + 16], fill=SLATE[3])
                d.point([x + 10, y + 25], fill=QF[4])
            elif ch == "Y":                      # timber shoring frame
                tile_floor(ctx, c, r)
                for px in (x + 1, x + 11):
                    d.rectangle([px, y + 10, px + 3, y + 29], fill=TIMBER[1], outline=IO)
                    d.line([px + 1, y + 11, px + 1, y + 28], fill=TIMBER[0])
                d.rectangle([x, y + 7, x + 15, y + 11], fill=TIMBER[2], outline=IO)
                d.line([x + 1, y + 8, x + 14, y + 8], fill=TIMBER[0])
                d.line([x + 5, y + 12, x + 10, y + 17], fill=TIMBER[3])
                d.line([x + 10, y + 12, x + 5, y + 17], fill=TIMBER[3])
                # hanging crystal lamp
                d.rectangle([x + 6, y + 13, x + 9, y + 17], fill=AMEI[1], outline=IO)
                d.point([x + 7, y + 14], fill=AMEI[0])
            elif ch == "c":                      # minecart full of ore on the rails
                tile_rails(ctx, c, r)
                d.rectangle([x + 2, y + 25, x + 13, y + 29], fill=IRON[4])
                d.ellipse([x + 2, y + 26, x + 5, y + 29], fill=IO)
                d.ellipse([x + 10, y + 26, x + 13, y + 29], fill=IO)
                d.polygon([(x + 1, y + 16), (x + 14, y + 16), (x + 13, y + 27), (x + 2, y + 27)], fill=RUST[2],
                          outline=IO)
                d.line([x + 2, y + 17, x + 13, y + 17], fill=RUST[0])
                d.line([x + 2, y + 22, x + 13, y + 22], fill=RUST[3])
                for ox, oy, cc in ((3, 13, PEAK[1]), (7, 12, AMEI[2]), (10, 13, PEAK[2])):
                    d.ellipse([x + ox, y + oy, x + ox + 4, y + oy + 4], fill=cc, outline=IO)
                d.point([x + 8, y + 13], fill=AMEI[0])
            elif ch == "G":                      # crystal obelisk statue by the entrance
                tile_floor(ctx, c, r)
                d.rectangle([x + 2, y + 23, x + 13, y + 29], fill=SLATE[2], outline=IO)
                d.line([x + 3, y + 24, x + 12, y + 24], fill=SLATE[0])
                d.polygon([(x + 5, y + 6), (x + 10, y + 6), (x + 11, y + 23), (x + 4, y + 23)], fill=MEN[2],
                          outline=IO)
                d.line([x + 6, y + 7, x + 5, y + 22], fill=MEN[0])
                d.polygon([(x + 7, y - 2), (x + 10, y + 3), (x + 7, y + 6), (x + 5, y + 3)], fill=AMEI[1],
                          outline=IO)
                d.point([x + 7, y + 1], fill=AMEI[0])
                d.line([x + 8, y + 10, x + 8, y + 19], fill=AMEI[2])


def tile_hole(ctx, c, r):
    """Collapsed quarry floor: jagged pit with a lit far lip, rubble and radiating cracks."""
    tile_floor(ctx, c, r)
    X, Y, p = c * T, r * T, ctx.p
    pit = [(2, 6), (5, 3), (8, 4), (11, 2), (14, 6), (13, 10), (14, 13), (9, 13), (6, 14), (2, 12), (3, 9)]
    ctx.d.polygon([(X + a, Y + b) for a, b in pit], fill=(26, 20, 34), outline=IO)
    for x in range(T):                                # far (north) inner wall face
        for y in range(T):
            if p[X + x, Y + y] == (26, 20, 34) and p[X + x, Y + y - 1] in (IO,) and y < 9:
                p[X + x, Y + y] = QF[3]
                if y + 1 < T and p[X + x, Y + y + 1] == (26, 20, 34):
                    p[X + x, Y + y + 1] = QF[4]
    for a, b in ((1, 4), (0, 3), (15, 4), (15, 3), (8, 15), (8, 14), (0, 14)):
        p[X + a, Y + b] = QF[3]
    p[X + 7, Y + 10] = AMEI[3]
    p[X + 10, Y + 11] = AMEI[2]


def tile_trainer(ctx, c, r):
    tile_floor(ctx, c, r)


def tile_ledge(ctx, c, r):
    """Quarry rock shelf: cut-stone top with a strata front face."""
    X, Y, p = c * T, r * T, ctx.p
    LD = ctx.th["ledge"]
    face = ctx.g(c, r + 1) != "L"
    for y in range(T):
        for x in range(T):
            if face and y >= 9:
                if y == 9:
                    col = LD[1]
                elif y == 15:
                    col = IO
                else:
                    col = LD[3] if (y + (x // 5)) % 3 else LD[4]
            else:
                yy = y % 8
                xx = (x + (4 if (y // 8) % 2 else 0)) % 8
                col = LD[3] if yy == 7 or xx == 7 else LD[0] if yy == 0 or xx == 0 else LD[1]
            p[X + x, Y + y] = col
    if ctx.g(c, r - 1) != "L":
        for x in range(T):
            p[X + x, Y] = IO
    for dc, x in ((-1, 0), (1, T - 1)):
        if ctx.g(c + dc, r) not in "LT":
            for y in range(T):
                p[X + x, Y + y] = IO


THEME = dict(
    name="Rock-Type Gym", archetype="Geode Bastion",
    wall=SLATE, accent=RUST, trim=IRON, rock=PEAK, deck=DECKR, glow=GLOW,
    emblem=gem_level, door_spill=(206, 170, 130), door_inside=(64, 50, 70),
    exterior=exterior, sparks=sparks,
    night_lights=(X0 - 5, X0 + 101),
    floor=QF, floor_px=quarry_px, hazard_px=hazard_px,
    hazard_ramp=R5((236, 178, 255), (88, 66, 120), (64, 48, 92), (44, 34, 66), (22, 16, 34)),
    ledge=R5((214, 200, 182), (184, 168, 152), (150, 134, 124), (112, 96, 98), (78, 64, 74)),
    outside=R5((150, 138, 120), (128, 116, 102), (108, 98, 88), (86, 76, 72), (62, 54, 56)),
    stair_ramp=STONE,
    tiles={"#": tile_rim, ".": tile_floor, "T": tile_trainer, "r": tile_rails, "L": tile_ledge, "H": tile_hole,
           "C": lambda ctx, c, r: None, "R": lambda ctx, c, r: None, "Y": lambda ctx, c, r: None,
           "c": lambda ctx, c, r: None, "G": lambda ctx, c, r: None},
    decor=decor,
    walk_extra="r",
    legend_extra={"r": "minecart rails (floor)", "C": "crystal cluster (blocked)", "R": "cut stone blocks (blocked)",
                  "Y": "timber shoring (blocked)", "c": "ore minecart (blocked)", "G": "crystal obelisk (blocked)"},
    floors=[
        dict(name="1F", grid=[
            "OOOOOPKKPOOOOO",   # 0  leader alcove in the north rim
            "#####PKKP#####",   # 1
            "#C....SS....C#",   # 2  leader terrace
            "#..........D.#",   # 3  stairs DOWN (arrival from the mine)
            "#~~~~~~~~~~~~#",   # 4  quarry chasm seals the terrace
            "#~~~~~~~~~~~~#",   # 5
            "#.....R......#",   # 6  upper quarry
            "#.H.......R..#",   # 7  hole -> B1F mine (the way on)
            "#.....R....C.#",   # 8
            "#LLT.LLLLLLLL#",   # 9  shelf, T2 guards the gap (4,9)
            "#............#",   # 10 middle quarry
            "#.R......H...#",   # 11 decoy hole -> dead-end mine pocket
            "#....C.......#",   # 12
            "#..........R.#",   # 13
            "#LLLLLLLLT.LL#",   # 14 shelf, T1 guards the gap (10,14)
            "#............#",   # 15 lower quarry
            "#.D.......R..#",   # 16 stairs back up from the pocket
            "#C...G..G...C#",   # 17
            "######MM######",   # 18
            "OOOOOOOOOOOOOO"],  # 19
             trainers=[(9, 14, "right", 1), (3, 9, "right", 1)]),
        dict(name="B1F", grid=[
            "####################",   # 0
            "#Y.....Y~~~Y......C#",   # 1
            "#......T~~~........#",   # 2  T3 watches the bridge head (7,3)
            "#rrrrrrr===rrrrrrc.#",   # 3  rails + E-W timber bridge
            "#C......~~~...C....#",   # 4
            "#YY..YY~~~~........#",   # 5
            "#~~~~~~~~~~..T.....#",   # 6  T4 watches the bridge head (14,6)
            "#~~~~~~~~~~~~~|~~~~#",   # 7  N-S timber bridge
            "#~~~~~~~~~~~~~|~~~~#",   # 8
            "#Y..Y~~~..C...r...Y#",   # 9  dead-end pocket (left) | ore yard (right)
            "#....~~~rrrrrrrrr..#",   # 10
            "#.U..~~~.C.....C...#",   # 11 pocket stairs UP -> 1F entrance quarry
            "#C...~~~Y.....Y..U.#",   # 12 stairs UP -> 1F leader terrace
            "####################"],  # 13
             trainers=[(7, 2, "down", 1), (13, 6, "right", 1)]),
    ],
    links=[dict(type="hole", a=("1F", 2, 7), b=("B1F", 3, 2)),
           dict(type="hole", a=("1F", 9, 11), b=("B1F", 3, 10)),
           dict(type="stairs", a=("B1F", 2, 11), b=("1F", 2, 16)),
           dict(type="stairs", a=("B1F", 17, 12), b=("1F", 11, 3))],
    leader=("1F", 6, 1, "down"),
)
