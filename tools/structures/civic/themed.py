"""Gym-city THEMED civic shells: Pokemon Center, Poke Mart and a vernacular house for each of the
8 gym types, so a gym's city reads as one style.

Identity is kept (Center: red ribbed hump + red eave band + Poke Ball; Mart: blue roof + band +
potion tag) while walls, plinth, trims, window frames and small rooftop/side props switch to the
gym's own materials (ramps copied from gyms/<type>.py, so saturation stays in the gym range).
Body sizes, wall heights, depths and door geometry are identical to core.py, so every door strip and
door-json cell matches the base pokemon-center / poke-mart / house-red. Interiors reuse core.py's.
"""
import civickit as CK
from civickit import (GLASS, IO, ROOF, WHITE, E, chimney, dome, eave_band, flat_roof, gable_roof, hip_roof,
                      pokeball, sliding_door, swing_door, walls)
import core
from gymkit import WARM, lit, nz, sphere_sculpt

RED, BLUE = ROOF["red"], ROOF["blue"]
TYPES = ("fire", "water", "grass", "electric", "psychic", "poison", "ground", "rock")

# ---------------------------------------------------------------- gym materials (from gyms/<type>.py)
# fire
BASALT = [(96, 80, 88), (74, 62, 74), (58, 48, 62), (44, 36, 52), (32, 26, 42)]
WSTONE = [(240, 214, 184), (222, 190, 160), (196, 160, 134), (156, 118, 106), (110, 80, 84)]   # warm sandstone
BRONZE = [(246, 206, 128), (214, 162, 88), (174, 118, 62), (124, 80, 52), (84, 52, 44)]
FBRICK = [(206, 112, 86), (176, 84, 70), (142, 62, 60), (106, 44, 52), (74, 30, 44)]
LAVA = [(255, 246, 168), (255, 208, 72), (255, 150, 40), (232, 84, 30), (176, 44, 34)]
SMOKE = [(222, 214, 220), (190, 182, 196), (156, 148, 168), (122, 114, 140), (92, 86, 112)]
# water
STUCCO = [(250, 252, 255), (226, 234, 246), (196, 206, 230), (150, 160, 200), (107, 116, 166)]
SEAGL = [(236, 250, 250), (190, 230, 236), (150, 200, 214), (100, 150, 180), (70, 100, 140)]
WROCK = [(220, 226, 236), (186, 196, 214), (150, 160, 186), (110, 120, 152), (76, 84, 116)]
CORAL = [(255, 196, 178), (250, 146, 134), (222, 98, 112), (172, 64, 98), (118, 44, 82)]
SEAROOF = [(160, 210, 236), (118, 180, 222), (84, 144, 200), (60, 106, 166), (42, 74, 130)]
# grass
GCREAM = [(250, 244, 222), (230, 220, 190), (200, 188, 160), (158, 148, 134), (112, 104, 110)]
TIMBER = [(226, 176, 116), (192, 138, 86), (154, 102, 66), (112, 72, 54), (76, 48, 44)]
LEAF = [(178, 230, 116), (118, 200, 90), (72, 162, 74), (46, 122, 66), (30, 84, 58)]
STONEW = [(214, 210, 190), (182, 178, 160), (146, 144, 132), (108, 108, 104), (74, 76, 80)]
POT = [(240, 156, 106), (212, 116, 78), (172, 84, 62), (128, 60, 54), (88, 42, 46)]
PINK = [(255, 196, 222), (250, 140, 186), (214, 88, 146), (156, 56, 112)]
GROOF = [(170, 214, 120), (120, 180, 92), (80, 140, 78), (56, 104, 70), (38, 72, 60)]
# electric
STL = [(214, 222, 236), (176, 186, 206), (138, 148, 176), (100, 108, 140), (66, 72, 104)]
NAVY = [(104, 118, 172), (80, 94, 150), (62, 74, 128), (46, 54, 102), (32, 36, 76)]
YEL = [(255, 242, 130), (250, 212, 60), (226, 168, 34), (176, 116, 34), (116, 74, 40)]
BLACK = (40, 38, 58)
# psychic
MARBLE = [(250, 246, 255), (230, 224, 246), (202, 194, 230), (164, 152, 204), (120, 108, 168)]
CELLA = [(214, 192, 242), (190, 166, 228), (164, 138, 210), (130, 106, 182), (96, 76, 148)]
PLUM = [(240, 156, 218), (212, 108, 194), (172, 72, 168), (126, 50, 138), (84, 34, 102)]
GOLD = [(255, 236, 156), (238, 198, 102), (202, 152, 72), (152, 106, 62), (102, 70, 56)]
# poison
PLANK = [(134, 104, 116), (110, 84, 100), (90, 66, 86), (70, 50, 70), (50, 34, 54)]
MOSS = [(176, 192, 100), (138, 162, 78), (104, 128, 64), (76, 98, 56), (52, 68, 46)]
HOOP = [(182, 214, 180), (132, 174, 150), (94, 132, 118), (64, 94, 92), (42, 62, 66)]
CAP = [(222, 156, 244), (188, 110, 228), (150, 74, 200), (112, 50, 160), (74, 32, 114)]
STEM = [(240, 232, 208), (214, 202, 178), (180, 166, 150), (140, 124, 120), (98, 86, 96)]
PIRON = [(128, 124, 150), (94, 90, 116), (68, 64, 90), (48, 44, 68), (32, 28, 46)]
BOTTLE = [(226, 250, 210), (166, 222, 168), (118, 184, 138), (82, 140, 110), (60, 104, 92)]
# ground
SAND = [(248, 222, 176), (232, 198, 148), (210, 170, 122), (170, 128, 100), (122, 88, 80)]
TERRA = [(242, 152, 98), (220, 116, 72), (186, 86, 58), (142, 60, 52), (98, 42, 46)]
GTIMBER = [(206, 156, 104), (172, 120, 78), (138, 92, 62), (100, 64, 52), (70, 46, 44)]
TURQ = [(150, 230, 212), (90, 196, 186), (56, 152, 160), (44, 106, 128), (36, 72, 96)]
SCRUB = [(176, 206, 112), (130, 172, 84), (92, 136, 72), (64, 100, 64), (44, 70, 56)]
# rock
MEN = [(206, 194, 172), (174, 160, 142), (140, 126, 114), (104, 92, 90), (70, 60, 68)]
RSLATE = [(180, 186, 206), (148, 154, 178), (118, 122, 150), (88, 90, 122), (60, 60, 92)]
RIRON = [(204, 192, 190), (156, 146, 152), (114, 104, 118), (78, 70, 88), (50, 44, 62)]
RUST = [(236, 156, 96), (202, 110, 66), (160, 76, 52), (116, 50, 48), (78, 34, 42)]
DECKR = [(156, 148, 146), (128, 120, 124), (102, 94, 104), (78, 70, 86), (54, 46, 64)]
AME = [(255, 236, 255), (236, 178, 255), (194, 120, 242), (142, 74, 204), (96, 46, 152)]

GLASS_BOTTLE = [(214, 246, 206), (140, 204, 150), (96, 160, 124), (70, 120, 104), (50, 84, 80)]
GLASS_SEA = [(214, 250, 248), (140, 214, 226), (96, 176, 206), (70, 130, 176), (50, 92, 140)]


def em(c, night):
    return E(c) if night else c


# ---------------------------------------------------------------- facade engine
def window(x, h, w, night, fr, glass):
    """w = (x0, x1, h0, h1, kind) kinds: square, tall, arch, round, slit. Returns colour, 'skip' or None."""
    x0, x1, h0, h1, kind = w
    if not (x0 <= x < x1 and h0 <= h < h1):
        return None
    u, v, W, H = x - x0, h - h0, x1 - x0, h1 - h0
    if kind in ("round", "arch"):
        r = W / 2
        cy = H - r if kind == "arch" else H / 2
        if v > cy and (u + 0.5 - W / 2) ** 2 + (v + 0.5 - cy) ** 2 > r * r:
            return "skip"
        if kind == "round" and v < cy and (u + 0.5 - W / 2) ** 2 + (v + 0.5 - cy) ** 2 > r * r:
            return "skip"
    rim = u in (0, W - 1) or v in (0, H - 1)
    if kind in ("round", "arch") and not rim:
        cy = H - W / 2 if kind == "arch" else H / 2
        if v > cy - 1 and (u + 0.5 - W / 2) ** 2 + (v + 0.5 - cy) ** 2 > (W / 2 - 1) ** 2:
            rim = True
        if kind == "round" and v < cy and (u + 0.5 - W / 2) ** 2 + (v + 0.5 - cy) ** 2 > (W / 2 - 1) ** 2:
            rim = True
    if rim:
        return fr[1] if (v == H - 1 or u == 0) else fr[3]
    if kind in ("square", "tall") and (u == W // 2 or (kind == "tall" and v == H // 2)):
        return fr[2]
    if night:
        return WARM[1] if (u + v) % 7 else WARM[0]
    if (u - v) % 7 in (0, 1):
        return glass[0]
    return glass[1] if v > H // 2 else glass[2]


def pattern_k(pat, x, h, side, wh):
    """Ramp index for the wall material at (x, h); side = -1 lit chamfer, 1 shaded chamfer."""
    k = 2 + side
    if pat == "ashlar":                                   # warm cut stone
        c = h // 5
        if h % 5 == 0 or (x + c * 6) % 12 == 0:
            k += 1
        elif nz(x // 4, h // 5, 7) > 236:
            k -= 1
    elif pat == "stucco":
        if nz(x, h, 3) > 246:
            k += 1
        elif h % 9 == 8 and nz(x // 3, h, 5) > 200:
            k -= 1
    elif pat == "panel":
        if x % 16 == 0 or h % 10 == 0:
            k += 1
        elif x % 16 in (2, 14) and h % 10 in (2, 8):
            k = 4
        elif x % 16 == 1:
            k -= 1
    elif pat == "marble":
        c = h // 8
        if h % 8 == 0 or (x + c * 8) % 16 == 0:
            k += 1
        elif (x * 3 + h * 2) % 23 == 0:
            k -= 1
    elif pat == "planks":                                 # vertical boards
        if x % 5 == 0:
            k += 1
        elif nz(x // 5, h // 7, 2) > 220 and x % 5 == 2:
            k += 1
        elif x % 5 == 1:
            k -= 1
    elif pat == "adobe":
        n = nz(x // 2, h // 2, 9)
        if n > 236:
            k += 1
        elif n < 14:
            k -= 1
    elif pat == "drystone":                               # irregular rubble courses
        row = h // 5 if h < 15 else 3 + (h - 15) // 4
        hh = h % 5 if h < 15 else (h - 15) % 4
        w = 7 + nz(row, 0, 4) % 5
        off = nz(row, 1, 4) % w
        if hh == 0 or (x + off) % w == 0:
            k += 1
        elif hh == 1 and (x + off) % w in (1, 2):
            k -= 1
    elif pat == "timber":
        pass                                              # plaster; timber frame is drawn by extra()
    elif pat == "siding":
        if h % 3 == 0:
            k += 1
    return max(0, min(4, k))


def make_wall(B, th, door=None, windows=(), band=None, extra=None, t=0.0, night=False):
    """Front-face colour function: themed wall material, plinth, band, window frames."""
    W, P, ph = th["wall"], th["plinth"], th.get("plinth_h", 3)
    fr, gl = th["frame"], th.get("glass", GLASS)

    def f(x, d, h, face):
        if extra is not None:
            c = extra(x, d, h, face)
            if c is not None:
                return c
        if face == "top":
            return W[1]
        side = 0 if d <= 0 else (-1 if x < B.xm else 1)
        if door and side == 0 and door["x0"] <= x < door["x1"] and h < door["h"]:
            c = door["px"](x - door["x0"], h, t, night)
            if c is not None:
                return c
        if side == 0:
            for w in windows:
                c = window(x, h, w, night, fr, gl)
                if c == "skip":
                    break
                if c is not None:
                    return c
        if h < ph:
            c = th["plinth_fn"](x, h, side) if th.get("plinth_fn") else None
            if c is not None:
                return c
            if h == ph - 1:
                return P[1] if side <= 0 else P[2]
            return P[3] if (x // 6 + h) % 2 else P[4]
        if band and band[0] <= h <= band[1]:
            return th["band_fn"](x, h - band[0], band[1] - band[0], side, night)
        if h >= B.wh - 2:
            return W[4]
        if h >= B.wh - 4:
            return W[3]
        return W[pattern_k(th["pattern"], x, h, side, B.wh)]
    return f


def band_plain(R):
    def f(x, v, V, side, night):
        if side:
            return R[1] if side < 0 else R[3]
        return R[0] if v == V else R[3] if v == 0 else R[2]
    return f


# ---------------------------------------------------------------- props (small, Gen 3 sized)
def brazier(sc, cx, night, d=-3):
    sc.box(cx - 3, cx + 3, d, d + 4, 0, 9, top=BASALT[1],
           front=lambda u, v, U, V: BASALT[1] if u == 0 else BASALT[3] if v % 4 == 0 else BASALT[2], edge=BASALT[4])
    sc.box(cx - 4, cx + 4, d - 1, d + 4, 9, 12, top=lambda u, v, U, V: em(LAVA[1] if (u + v) % 3 else LAVA[0], night),
           front=lambda u, v, U, V: BRONZE[0] if v == V - 1 else BRONZE[2] if u else BRONZE[1], edge=BRONZE[4])
    sphere_sculpt(sc, [(cx, d + 1, 14, 3.2), (cx - 1, d + 1, 17, 2.0)],
                  lambda x, dd, h, face, b, nx, ny: em(LAVA[0] if abs(nx) < 0.4 and ny < 0.3 else
                                                       LAVA[1] if ny < 0.4 else LAVA[2], night),
                  shadow=False, rd=0.5)


def smoke(sc, cx, cd, h):
    sphere_sculpt(sc, [(cx, cd, h + 3, 3.2), (cx + 3, cd, h + 7, 2.6), (cx + 1, cd, h + 10, 2.0)],
                  lambda x, d, hh, face, b, nx, ny: lit(SMOKE, nx, ny), shadow=False, rd=0.5)


def fire_chimney(sc, x, d, h0, h1, night):
    sc.box(x, x + 6, d, d + 4, h0, h1,
           top=lambda u, v, U, V: em(LAVA[2], night) if 1 <= u <= 4 and 1 <= v <= 2 else FBRICK[0],
           front=lambda u, v, U, V: FBRICK[3] if v % 3 == 0 or (u + (v // 3) * 3) % 6 == 0 else FBRICK[1],
           edge=FBRICK[4])
    sc.box(x - 1, x + 7, d - 1, d + 5, h1 - 2, h1, top=BASALT[1], front=BASALT[2], edge=BASALT[4])


def coral(sc, cx, d=-2, s=1.0):
    pts = [(cx, d, 4 * s, 3.2 * s), (cx - 3 * s, d, 7 * s, 2.2 * s), (cx + 3 * s, d, 8 * s, 2.0 * s),
           (cx + 0.5, d, 10 * s, 1.8 * s)]
    sphere_sculpt(sc, pts, lambda x, dd, h, face, b, nx, ny: lit(CORAL, nx, ny) if (x + h) % 4 else CORAL[0],
                  shadow=False, rd=0.6)


def bollard(sc, cx, night, d=-2):
    sc.box(cx - 2, cx + 2, d, d + 3, 0, 10, top=SEAGL[0],
           front=lambda u, v, U, V: SEAGL[1] if u == 0 else SEAGL[3] if v in (0, 3) else SEAGL[2], edge=SEAGL[4])
    sphere_sculpt(sc, [(cx, d + 1, 12, 2.6)],
                  lambda x, dd, h, face, b, nx, ny: em(GLASS_SEA[0] if nx < 0 and ny > 0 else GLASS_SEA[1], night),
                  shadow=False)


def topiary(sc, cx, d=-3):
    sc.box(cx - 3, cx + 3, d, d + 4, 0, 5, top=POT[0],
           front=lambda u, v, U, V: POT[0] if v == V - 1 else POT[2] if u else POT[1], edge=POT[4])
    sphere_sculpt(sc, [(cx, d + 1, 9, 4.2), (cx, d + 1, 14, 3.0)],
                  lambda x, dd, h, face, b, nx, ny: PINK[1] if nz(x, h, 6) > 236 else lit(LEAF, nx, ny),
                  shadow=False, rd=0.6)


def flower_box(sc, x0, x1, h, d=-2):
    flw = (PINK[1], (255, 236, 130), (250, 250, 255), PINK[0])
    sc.box(x0, x1, d, 0, h, h + 3, top=lambda u, v, U, V: flw[(u // 2) % 4] if u % 2 == 0 else LEAF[2],
           front=lambda u, v, U, V: TIMBER[1] if v == V - 1 else TIMBER[3] if v == 0 else TIMBER[2],
           edge=TIMBER[4])
    for x in range(x0 + 1, x1 - 1, 3):
        sc.box(x, x + 2, d - 1, d, h + 3, h + 5, front=lambda u, v, U, V, x=x: flw[(x // 3) % 4] if v else LEAF[1])


def transformer(sc, cx, night, d=-3):
    sc.box(cx - 5, cx + 5, d, d + 5, 0, 12, top=STL[0],
           front=lambda u, v, U, V: (YEL[1] if (u + v) % 6 < 3 else BLACK) if v < 3 else
           STL[1] if u == 0 else STL[3] if u % 3 == 0 else STL[2], edge=NAVY[4])
    for x in (cx - 3, cx + 1):
        sc.box(x, x + 2, d + 1, d + 3, 12, 16, top=lambda *a: em(YEL[0], night),
               front=lambda u, v, U, V: YEL[1] if v % 2 else YEL[3], edge=YEL[4])


def solar_panel(sc, x0, x1, d0, d1, h):
    sc.box(x0, x1, d0, d1, h, h + 2,
           top=lambda u, v, U, V: NAVY[0] if (u % 4 == 0 or v % 3 == 0) else NAVY[2] if (u + v) % 5 else NAVY[1],
           front=lambda *a: STL[2], edge=NAVY[4])


def rod(sc, x, d, h0, h1, night):
    sc.box(x, x + 1, d, d + 1, h0, h1, front=lambda *a: STL[1])
    sc.box(x - 1, x + 2, d, d + 1, h1, h1 + 2, front=lambda *a: em(YEL[0], night))


def obelisk(sc, cx, night, d=-3):
    sc.box(cx - 4, cx + 4, d, d + 4, 0, 3, top=MARBLE[1], front=lambda u, v, U, V: CELLA[2] if v == 0 else MARBLE[2],
           edge=CELLA[4])
    for i, (h0, h1, r) in enumerate(((3, 9, 3), (9, 14, 2))):
        sc.box(cx - r, cx + r, d + 1, d + 3, h0, h1, top=MARBLE[0],
               front=lambda u, v, U, V: MARBLE[1] if u == 0 else MARBLE[3] if u == U - 1 else MARBLE[2], edge=CELLA[4])
    sphere_sculpt(sc, [(cx, d + 2, 19, 2.6)],
                  lambda x, dd, h, face, b, nx, ny: em(PLUM[0] if nx < 0 and ny > 0 else PLUM[1], night), shadow=False)


def toadstool(sc, cx, s=1.0, d=-2, h0=0, lean=0):
    sc.box(int(cx - 1), int(cx + 2), d, d + 2, h0, int(h0 + 6 * s),
           front=lambda u, v, U, V: STEM[1] if u == 0 else STEM[2], edge=STEM[4])

    def inside(x, dd, h):
        q = ((x + 0.5 - cx - lean) / (4.5 * s)) ** 2 + ((dd - d - 1) / (3 * s)) ** 2
        top = h0 + 6 * s
        return top <= h < top + 4 * s and q + ((h - top) / (4 * s)) ** 2 < 1

    def color(x, dd, h, face):
        if (x * 5 + h * 3) % 7 == 0:
            return STEM[0]
        return lit(CAP, (x + 0.5 - cx) / (4.5 * s), (h - h0 - 6 * s) / (4 * s) + (0.3 if face == "top" else 0))
    sc.sculpt(int(cx - 6 * s), int(cx + 6 * s + 2), int(d - 3 * s), int(d + 4 * s), int(h0 + 6 * s),
              int(h0 + 10 * s + 1), inside, color, shadow=False, edge=CAP[4])


def moss_tufts(sc, x0, x1, d, h):
    for x in range(x0, x1, 4):
        n = nz(x, h, 12) % 3
        if nz(x, 7, 13) < 150:
            continue
        sc.box(x, x + 3 + n % 2, d, d + 2, h, h + 1 + n,
               top=lambda *a: MOSS[0], front=lambda u, v, U, V: MOSS[1] if v else MOSS[3])


def cactus_pot(sc, cx, d=-3, flip=1):
    sc.box(cx - 3, cx + 3, d, d + 4, 0, 5, top=TERRA[1],
           front=lambda u, v, U, V: TURQ[1] if v == 2 else TERRA[1] if u == 0 else TERRA[2], edge=TERRA[4])
    sc.box(cx - 1, cx + 2, d + 1, d + 3, 5, 17, top=SCRUB[0],
           front=lambda u, v, U, V: SCRUB[1] if u == 0 else SCRUB[2] if v % 3 else SCRUB[3], edge=SCRUB[4])
    ax = cx + 2 if flip > 0 else cx - 4
    sc.box(ax, ax + 2, d + 1, d + 3, 9, 11, front=lambda *a: SCRUB[2], edge=SCRUB[4])
    sc.box(ax + (1 if flip > 0 else 0), ax + (3 if flip > 0 else 2), d + 1, d + 3, 9, 15,
           front=lambda u, v, U, V: SCRUB[1] if u == 0 else SCRUB[2], edge=SCRUB[4])


def clay_pot(sc, cx, d=-2):
    sphere_sculpt(sc, [(cx, d, 4, 3.4)], lambda x, dd, h, face, b, nx, ny: TURQ[1] if h == 4 else lit(TERRA, nx, ny),
                  shadow=False, rd=0.7)


def vigas(sc, xs, h, d=-3):
    for x in xs:
        sc.box(x, x + 3, d, 0, h, h + 3, top=GTIMBER[0],
               front=lambda u, v, U, V: GTIMBER[3] if (u, v) == (1, 1) else GTIMBER[1] if v == V - 1 else GTIMBER[2],
               edge=GTIMBER[4])


def crystal(sc, cx, night, d=-3):
    sphere_sculpt(sc, [(cx, d + 1, 3, 5.0), (cx + 3, d + 1, 2, 3.5)],
                  lambda x, dd, h, face, b, nx, ny: lit(MEN, nx, ny) if nz(x, h, 2) > 30 else MEN[3],
                  shadow=False, rd=0.7)
    for (ox, h0, hh, w) in ((-2, 6, 9, 3), (1, 6, 6, 2), (3, 5, 4, 2)):
        x0 = cx + ox

        def front(u, v, U, V):
            return em(AME[0] if u == 0 else AME[2] if u < U - 1 else AME[3], night)
        sc.box(x0, x0 + w, d, d + 2, h0, h0 + hh, front=front, top=lambda *a: em(AME[0], night), edge=AME[4])


def buttress(sc, x, R, h=18, d=-3):
    sc.box(x, x + 4, d, 0, 0, h, top=R[0],
           front=lambda u, v, U, V: R[1] if u == 0 else R[3] if (v + u * 2) % 5 == 0 else R[2], edge=R[4])


# ---------------------------------------------------------------- per-type facade settings
def _fire_band(x, v, V, side, night):
    if side:
        return BRONZE[1] if side < 0 else BRONZE[3]
    if v == 1:
        return em(LAVA[1] if x % 6 else LAVA[0], night)
    return BRONZE[0] if v == V else BRONZE[3]


def _fire_plinth(x, h, side):
    if h == 1 and x % 9 == 4 and side == 0:
        return LAVA[2]
    return None


def _water_band(x, v, V, side, night):
    if side:
        return SEAGL[1] if side < 0 else SEAGL[3]
    wave = (x + (0 if v < 2 else 2)) % 6
    if v == V:
        return SEAGL[0]
    if v == 0:
        return SEAGL[4]
    return SEAGL[1] if wave in (0, 1) else SEAGL[2] if wave in (2, 3) else SEAGL[3]


def _elec_band(x, v, V, side, night):
    if v == V:
        return STL[0]
    if v == 0:
        return NAVY[4]
    return YEL[1 if side <= 0 else 2] if (x + v) % 6 < 3 else BLACK


def _psy_band(x, v, V, side, night):
    if side:
        return CELLA[1] if side < 0 else CELLA[3]
    if v == 1 and x % 6 == 3:
        return GOLD[1]
    return CELLA[0] if v == V else PLUM[3] if v == 0 else CELLA[2]


def _poison_band(x, v, V, side, night):
    if side:
        return HOOP[1] if side < 0 else HOOP[3]
    if v == 1 and x % 8 in (3, 4):
        return PIRON[1]
    return HOOP[0] if v == V else HOOP[4] if v == 0 else HOOP[2]


def _poison_plinth(x, h, side):
    n = nz(x // 2, h, 4)
    return MOSS[1 if n > 120 else 2] if h == 2 else MOSS[3] if n > 90 else (88, 78, 96)


def _ground_band(x, v, V, side, night):
    if side:
        return TURQ[1] if side < 0 else TURQ[3]
    step = (x // 3) % 4
    if v == V:
        return TERRA[0]
    if v == 0:
        return TERRA[3]
    return TURQ[1] if (step == v % 4 or step == 3 - v % 4) else TERRA[2]


def _rock_band(x, v, V, side, night):
    if side:
        return RIRON[1] if side < 0 else RIRON[3]
    if v == 1 and x % 8 == 4:
        return RUST[0]
    return RIRON[0] if v == V else RIRON[4] if v == 0 else RUST[2] if v == 1 else RIRON[2]


def _grass_band(x, v, V, side, night):
    if side:
        return TIMBER[1] if side < 0 else TIMBER[3]
    return TIMBER[0] if v == V else TIMBER[4] if v == 0 else TIMBER[2]


THEMES = {
    "fire": dict(wall=WSTONE, pattern="ashlar", plinth=BASALT, plinth_h=4, plinth_fn=_fire_plinth,
                 frame=BRONZE, band_fn=_fire_band, door_frame=BRONZE, win="arch"),
    "water": dict(wall=STUCCO, pattern="stucco", plinth=WROCK, frame=SEAGL, band_fn=_water_band,
                  door_frame=SEAGL, glass=GLASS_SEA, win="arch"),
    "grass": dict(wall=GCREAM, pattern="timber", plinth=STONEW, plinth_h=4, frame=TIMBER, band_fn=_grass_band,
                  door_frame=TIMBER, win="square"),
    "electric": dict(wall=STL, pattern="panel", plinth=NAVY, plinth_h=4, frame=NAVY, band_fn=_elec_band,
                     door_frame=NAVY, win="square"),
    "psychic": dict(wall=MARBLE, pattern="marble", plinth=CELLA, plinth_h=4, frame=GOLD, band_fn=_psy_band,
                    door_frame=GOLD, win="arch"),
    "poison": dict(wall=PLANK, pattern="planks", plinth=MOSS, plinth_h=4, plinth_fn=_poison_plinth, frame=PIRON,
                   band_fn=_poison_band, door_frame=PIRON, glass=GLASS_BOTTLE, win="round"),
    "ground": dict(wall=SAND, pattern="adobe", plinth=TERRA, frame=GTIMBER, band_fn=_ground_band,
                   door_frame=GTIMBER, win="square"),
    "rock": dict(wall=MEN, pattern="drystone", plinth=DECKR, plinth_h=4, frame=RIRON, band_fn=_rock_band,
                 door_frame=RIRON, win="square"),
}


def wall_extra(kind, B, th, wins, door_x):
    """Material details on the front face that sit outside doors/windows (timber frame, pilasters)."""
    def inwin(x, h):
        return any(w[0] - 1 <= x <= w[1] and w[2] - 1 <= h <= w[3] for w in wins)

    def indoor(x, h):
        return door_x[0] - 1 <= x <= door_x[1] and h <= door_x[2]

    if kind == "grass":
        def f(x, d, h, face):
            if face == "top" or d > 0 or h < th.get("plinth_h", 3) or h >= B.wh - 4 or indoor(x, h) or inwin(x, h):
                return None
            if x % 16 in (15, 0):                      # timber posts on the metatile grid
                return TIMBER[2] if x % 16 == 15 else TIMBER[3]
            if h in (th.get("plinth_h", 3), B.wh - 6):
                return TIMBER[2]
            return None
        return f
    if kind == "electric":
        def f(x, d, h, face):
            if face == "top" or d > 0 or indoor(x, h) or inwin(x, h):
                return None
            if B.wh - 9 <= h <= B.wh - 8 and x % 4 == 0:   # vent slots
                return NAVY[3]
            return None
        return f
    return None


# ---------------------------------------------------------------- Pokemon Center (themed)
def wall_props(kind, sc, B, wins, night, eave_h, door=(0, 0)):
    """Things fixed on the front wall (after the wall sculpt): flower boxes, pilasters, vigas, buttresses.
    Items that would cover the door span `door` = (x0, x1) are skipped."""
    def free(x, w):
        return x + w <= door[0] or x >= door[1]
    if kind == "grass":
        for w in wins:
            flower_box(sc, w[0] - 1, w[1] + 1, w[2] - 3)
    elif kind == "psychic":
        for x in (B.x0 + 13, B.x1 - 16):
            sc.box(x, x + 3, -1, 0, 4, eave_h, top=MARBLE[0],
                   front=lambda u, v, U, V: GOLD[1] if v >= V - 2 else MARBLE[1] if u == 0 else MARBLE[3]
                   if u == U - 1 else MARBLE[2], edge=CELLA[4])
    elif kind == "ground":
        vigas(sc, [x for x in (B.x0 + 4, B.x0 + 14, B.x0 + 24, B.x1 - 23, B.x1 - 7) if free(x, 3)], eave_h - 6)
    elif kind == "rock":
        for x in (B.x0 + 4, B.x1 - 8):
            if free(x, 4):
                buttress(sc, x, RSLATE, h=12)
    elif kind == "poison":
        moss_tufts(sc, B.x0 + 1, B.x1 - 2, -1, 0)


def roof_props(kind, sc, B, night, hump=True):
    top = B.wh + 23
    if kind == "water" and hump:
        sphere_sculpt(sc, [(B.xm, 10, top + 6, 2.4)],
                      lambda x, d, h, face, b, nx, ny: em(GLASS_SEA[0] if nx < 0 else GLASS_SEA[2], night), shadow=False)
    elif kind == "psychic" and hump:
        sphere_sculpt(sc, [(B.xm, 10, top + 7, 2.4)],
                      lambda x, d, h, face, b, nx, ny: em(PLUM[0] if nx < 0 and ny > 0 else PLUM[1], night),
                      shadow=False)
    elif kind == "grass":
        moss_like = [(B.x1 - 10, 14, B.wh + 9, 3.0), (B.x1 - 13, 14, B.wh + 10, 2.4)]
        sphere_sculpt(sc, moss_like, lambda x, d, h, face, b, nx, ny: PINK[1] if nz(x, h, 3) > 220 else lit(LEAF, nx, ny),
                      shadow=False)
    elif kind == "poison":
        toadstool(sc, B.x1 - 10, 0.7, d=12, h0=B.wh + 6)
    elif kind == "rock" and hump:
        for (ox, hh) in ((-1, 6), (2, 4)):
            sc.box(int(B.xm) + ox, int(B.xm) + ox + 2, 10, 12, top, top + hh,
                   front=lambda u, v, U, V: em(AME[1] if u == 0 else AME[2], night), top=lambda *a: em(AME[0], night),
                   edge=AME[4])
    elif kind == "ground":
        sc.box(B.x1 - 14, B.x1 - 8, 12, 15, B.wh + 6, B.wh + 14, top=SAND[0],
               front=lambda u, v, U, V: SAND[1] if u == 0 else SAND[2], edge=SAND[4])


def themed_center(kind):
    th = THEMES[kind]

    def ext(sc, B, t, night):
        dk = th["door_frame"]
        door = dict(x0=B.tile_x(1), x1=B.tile_x(3), h=28,
                    px=sliding_door(dk, glass=th.get("glass", GLASS), inside=(84, 60, 72), spill=(238, 214, 178)))
        win = [(B.x0 + 3, B.x0 + 13, 10, 23 if th["win"] == "arch" else 22, th["win"]),
               (B.x1 - 13, B.x1 - 3, 10, 23 if th["win"] == "arch" else 22, th["win"])]
        dx = (door["x0"], door["x1"], door["h"])
        walls(sc, B, make_wall(B, th, door=door, windows=win, band=(3 + th.get("plinth_h", 3) - 3,
                                                                     5 + th.get("plinth_h", 3) - 3),
                               extra=wall_extra(kind, B, th, win, dx), t=t, night=night))
        wall_props(kind, sc, B, win, night, B.wh - 2, door=(door["x0"], door["x1"]))
        hip_roof(sc, B.x0, B.x1, 0, B.D, B.wh + 4, 9, RED, ov=2)
        if kind in ("electric", "grass", "poison", "ground"):
            roof_props(kind, sc, B, night, hump=False)
        if kind == "fire":
            fire_chimney(sc, B.x0 + 6, 13, B.wh + 4, B.wh + 16, night)
        if kind == "electric":
            solar_panel(sc, B.x0 + 1, B.x0 + 15, 4, 12, B.wh + 8)
        dome(sc, B.xm, 9, 19, 7, B.wh + 9, 15, RED, ribs=4)
        eave_band(sc, B.x0, B.x1, 0, B.wh - 2, B.wh + 4, RED)
        emb = pokeball(7)

        def inside(x, d, h):
            return -5 <= d < -2 and emb(x + 0.5 - B.xm, h - (B.wh - 5)) > 0

        def color(x, d, h, face):
            lv = emb(x + 0.5 - B.xm, h - (B.wh - 5))
            if face == "top":
                return WHITE[0]
            return WHITE[0] if lv == 3 else RED[1] if lv == 2 else IO
        sc.sculpt(int(B.xm - 9), int(B.xm + 10), -5, -2, B.wh - 5, B.wh + 10, inside, color, shadow=False)
        sc.box(int(B.xm) - 2, int(B.xm) + 2, 9, 12, B.wh + 23, B.wh + 26,
               top=lambda *a: E(GLASS[0]) if night else GLASS[0], front=lambda *a: E(GLASS[1]) if night else GLASS[2])
        if kind in ("water", "psychic", "rock"):
            roof_props(kind, sc, B, night)
        if kind == "fire":
            smoke(sc, B.x0 + 9, 15, B.wh + 16)
        if kind == "electric":
            rod(sc, B.x1 - 8, 12, B.wh + 8, B.wh + 20, night)
        side_props(kind, sc, night)
    return ext


def side_props(kind, sc, night):
    if kind == "fire":
        brazier(sc, 8, night)
        brazier(sc, 88, night)
    elif kind == "water":
        coral(sc, 8)
        bollard(sc, 88, night)
    elif kind == "grass":
        topiary(sc, 8)
        topiary(sc, 88)
    elif kind == "electric":
        transformer(sc, 88, night)
    elif kind == "psychic":
        obelisk(sc, 8, night)
        obelisk(sc, 88, night)
    elif kind == "poison":
        toadstool(sc, 7, 1.0)
        toadstool(sc, 12, 0.6, d=-1)
        toadstool(sc, 88, 0.9)
    elif kind == "ground":
        cactus_pot(sc, 8, flip=1)
        clay_pot(sc, 87)
    elif kind == "rock":
        crystal(sc, 8, night)
        crystal(sc, 87, night)


# ---------------------------------------------------------------- Poke Mart (themed)
def themed_mart(kind):
    th = THEMES[kind]
    fr = th["frame"]

    def ext(sc, B, t, night):
        door = dict(x0=B.tile_x(2), x1=B.tile_x(4), h=28,
                    px=sliding_door(th["door_frame"], glass=th.get("glass", GLASS), inside=(70, 70, 96),
                                    spill=(220, 220, 236)))
        sx0, sx1 = B.x0 + 4, B.tile_x(2) - 3

        def showcase(x, d, h, face):
            if face != "front" or d != 0:
                return None
            if sx0 <= x < sx1 and 7 <= h < 24:
                u, v = x - sx0, h - 7
                if v in (0, 16) or u in (0, sx1 - sx0 - 1):
                    return fr[1] if v == 16 or u == 0 else fr[3]
                if night:
                    return E(CK.WARM[1])
                if v in (5, 10):
                    return fr[2]
                if (u + v) % 9 in (0, 1):
                    return th.get("glass", GLASS)[0]
                return core.GOODS[(u // 3 + v // 5) % len(core.GOODS)] if v % 5 in (2, 3) and u % 3 else \
                    th.get("glass", GLASS)[1]
            return None
        win = [(sx0 - 1, sx1 + 1, 6, 25, "square")]
        ex = wall_extra(kind, B, th, win, (door["x0"], door["x1"], door["h"]))

        def extra(x, d, h, face):
            c = showcase(x, d, h, face)
            if c is not None:
                return c
            return ex(x, d, h, face) if ex else None
        ph = th.get("plinth_h", 3)
        walls(sc, B, make_wall(B, th, door=door, band=(ph, ph + 2), extra=extra, t=t, night=night))
        if kind == "grass":
            flower_box(sc, sx0, sx1, 3)
        elif kind == "poison":
            wall_props(kind, sc, B, [], night, B.wh - 2, door=(door["x0"], door["x1"]))
        elif kind == "psychic":
            for x in (B.x0 + 1, B.tile_x(2) - 3):
                sc.box(x, x + 3, -1, 0, 4, B.wh - 2, top=MARBLE[0],
                       front=lambda u, v, U, V: GOLD[1] if v >= V - 2 else MARBLE[1] if u == 0 else MARBLE[3]
                       if u == U - 1 else MARBLE[2], edge=CELLA[4])
        hip_roof(sc, B.x0, B.x1, 0, B.D, B.wh + 4, 12, BLUE, ov=2)
        if kind == "fire":
            fire_chimney(sc, B.x0 + 8, 12, B.wh + 4, B.wh + 18, night)
            smoke(sc, B.x0 + 11, 14, B.wh + 18)
        elif kind == "electric":
            solar_panel(sc, B.x0 + 4, B.x0 + 22, 6, 12, B.wh + 11)
            rod(sc, B.x1 - 10, 11, B.wh + 10, B.wh + 22, night)
        elif kind == "water":
            sphere_sculpt(sc, [(B.xm, 9, B.wh + 18, 2.6)],
                          lambda x, d, h, face, b, nx, ny: em(GLASS_SEA[0] if nx < 0 else GLASS_SEA[2], night),
                          shadow=False)
        elif kind == "psychic":
            sphere_sculpt(sc, [(B.xm, 9, B.wh + 20, 2.6)],
                          lambda x, d, h, face, b, nx, ny: em(PLUM[0] if nx < 0 and ny > 0 else PLUM[1], night),
                          shadow=False)
        elif kind == "rock":
            for (ox, hh) in ((-2, 7), (1, 5)):
                sc.box(int(B.xm) + ox, int(B.xm) + ox + 2, 9, 11, B.wh + 15, B.wh + 15 + hh,
                       front=lambda u, v, U, V: em(AME[1] if u == 0 else AME[2], night),
                       top=lambda *a: em(AME[0], night), edge=AME[4])
        else:
            roof_props(kind, sc, B, night, hump=False)
        eave_band(sc, B.x0, B.x1, 0, B.wh - 2, B.wh + 4, BLUE)
        emb = CK.potion_tag(7)
        cx = B.tile_x(3)

        def inside(x, d, h):
            return -5 <= d < -2 and emb(x + 0.5 - cx, h - (B.wh - 5)) > 0

        def color(x, d, h, face):
            lv = emb(x + 0.5 - cx, h - (B.wh - 5))
            if face == "top":
                return WHITE[0]
            return {1: IO, 2: WHITE[0], 3: BLUE[1]}[lv]
        sc.sculpt(cx - 9, cx + 10, -5, -2, B.wh - 5, B.wh + 10, inside, color, shadow=False)
        side_props(kind, sc, night)
    return ext


# ---------------------------------------------------------------- houses (city vernacular)
HOUSE = {   # roof form, roof ramp, wall theme overrides
    "fire": dict(roof="gable", R=FBRICK),
    "water": dict(roof="hip", R=SEAROOF),
    "grass": dict(roof="gable", R=GROOF),
    "electric": dict(roof="flat", R=NAVY),
    "psychic": dict(roof="hip", R=CELLA),
    "poison": dict(roof="thatch", R=MOSS),
    "ground": dict(roof="adobe", R=SAND),
    "rock": dict(roof="gable", R=RSLATE),
}


def thatch_roof(sc, x0, x1, d0, d1, h0, rise, R, ov=3):
    """Rounded moss-thatch mound with a drippy fringe (poison vernacular)."""
    a, b = d0 - ov, d1
    xa, xb = x0 - ov, x1 + ov
    xm, dm = (xa + xb) / 2, (a + b) / 2

    def height(x, d):
        fx = 1 - ((x + 0.5 - xm) / ((xb - xa) / 2)) ** 4
        fd = 1 - ((d - dm) / ((b - a) / 2)) ** 2
        return h0 + rise * max(0.0, fx) ** 0.5 * max(0.0, fd) ** 0.6

    def inside(x, d, h):
        fr = 2 if nz(x // 2, 0, 9) % 3 == 0 else 0
        return xa <= x < xb and a <= d < b and h0 - fr <= h < height(x, d) + 1

    def color(x, d, h, face):
        if face == "front":
            return R[3] if (x + h) % 3 else R[4]
        n = nz(x // 2, d, 5)
        k = 1 if x < xm - 6 else 2 if x < xm + 10 else 3
        if (x + d * 2) % 5 == 0:
            k += 1
        if n > 230:
            k = 0
        return R[min(4, k)]
    sc.sculpt(xa, xb, a, b, h0 - 2, int(h0 + rise + 2), inside, color, edge=R[4])


def themed_house(kind):
    th = THEMES[kind]
    hv = HOUSE[kind]

    def ext(sc, B, t, night):
        dx0 = B.tile_x(1)
        door = dict(x0=dx0, x1=dx0 + 16, h=26, px=swing_door(core.WOODW if kind not in ("electric", "psychic") else
                                                              (NAVY if kind == "electric" else GOLD)))
        wk = {"water": "round", "poison": "round", "psychic": "arch", "fire": "arch"}.get(kind, "square")
        win = [(B.tile_x(2) + 3, B.tile_x(2) + 13, 8, 19, wk), (B.tile_x(3) + 2, B.tile_x(3) + 12, 8, 19, wk)]
        if kind == "water":
            win = [(B.tile_x(2) + 3, B.tile_x(2) + 13, 7, 17, "round"), (B.tile_x(3) + 2, B.tile_x(3) + 12, 7, 17, "round")]
        ph = th.get("plinth_h", 3)
        band = (B.wh - 6, B.wh - 5) if kind in ("ground", "psychic", "electric", "rock") else None
        walls(sc, B, make_wall(B, th, door=door, windows=win, band=band,
                               extra=wall_extra(kind, B, th, win, (dx0, dx0 + 16, 26)), t=t, night=night))
        R = hv["R"]
        if kind == "fire":
            fire_chimney(sc, B.x1 - 14, 12, B.wh, B.wh + 22, night)
        elif kind == "rock":
            chimney(sc, B.x0 + 6, 12, B.wh, B.wh + 20, R=RIRON)
        elif kind == "grass":
            chimney(sc, B.x0 + 6, 12, B.wh, B.wh + 20, R=STONEW)
        if hv["roof"] == "gable":
            gable_roof(sc, B.x0, B.x1, 0, B.D, B.wh, 16, R, ov=2, rows=3)
        elif hv["roof"] == "hip":
            hip_roof(sc, B.x0, B.x1, 0, B.D, B.wh, 13, R, ov=2)
        elif hv["roof"] == "thatch":
            thatch_roof(sc, B.x0, B.x1, 0, B.D, B.wh, 17, R)
        elif hv["roof"] == "flat":
            flat_roof(sc, B.x0, B.x1, 0, B.D, B.wh, STL, parapet=3)
        elif hv["roof"] == "adobe":
            flat_roof(sc, B.x0, B.x1, 0, B.D, B.wh, SAND, parapet=2,
                      deck=lambda x, d: SAND[2] if nz(x // 2, d // 2, 4) > 200 else SAND[1])
            # stepped parapet crown + upper room
            sc.box(B.x0 + 30, B.x1 - 4, 8, B.D - 2, B.wh + 2, B.wh + 12, top=SAND[1],
                   front=lambda u, v, U, V: SAND[3] if v >= V - 2 else
                   (TIMBER[3] if (u in (4, 5, 6, 7) and 2 <= v <= 6) else SAND[2]), edge=SAND[4])
        # roof / wall props
        if kind == "fire":
            smoke(sc, B.x1 - 11, 14, B.wh + 22)
            brazier(sc, 88, night)
        elif kind == "water":
            sphere_sculpt(sc, [(B.xm, 9, B.wh + 15, 2.2)],
                          lambda x, d, h, face, b, nx, ny: em(GLASS_SEA[0] if nx < 0 else GLASS_SEA[2], night),
                          shadow=False)
            coral(sc, 88, s=0.9)
            sc.box(B.x0 + 1, B.tile_x(1) - 1, -2, 0, 0, 4, top=SEAGL[0], front=SEAGL[2], edge=SEAGL[4])
        elif kind == "grass":
            for w in win:
                flower_box(sc, w[0] - 1, w[1] + 1, w[2] - 3)
            topiary(sc, 88)
        elif kind == "electric":
            solar_panel(sc, B.x0 + 3, B.x0 + 30, 4, 12, B.wh + 3)
            solar_panel(sc, B.x0 + 34, B.x1 - 4, 4, 12, B.wh + 3)
            rod(sc, B.x1 - 6, 15, B.wh + 3, B.wh + 16, night)
            transformer(sc, 88, night)
        elif kind == "psychic":
            sphere_sculpt(sc, [(B.xm, 9, B.wh + 17, 2.4)],
                          lambda x, d, h, face, b, nx, ny: em(GOLD[0] if nx < 0 and ny > 0 else GOLD[1], night),
                          shadow=False)
            obelisk(sc, 88, night)
        elif kind == "poison":
            toadstool(sc, B.x1 - 14, 0.9, d=10, h0=B.wh + 9)
            toadstool(sc, 87, 1.0)
            toadstool(sc, 92, 0.5, d=0)
        elif kind == "ground":
            vigas(sc, [B.x0 + 2, B.x0 + 20, B.x1 - 21, B.x1 - 5], B.wh - 4)
            cactus_pot(sc, 88, flip=-1)
        elif kind == "rock":
            crystal(sc, 87, night)
    return ext


# ---------------------------------------------------------------- specs
SPECS = {}
_C, _M, _H = core.SPECS["pokemon-center"], core.SPECS["poke-mart"], core.SPECS["house-red"]
for k in TYPES:
    SPECS[f"pokemon-center-{k}"] = dict(_C, name=f"Pokemon Center ({k} city)", exterior=themed_center(k),
                                        theme=k, base="pokemon-center")
    SPECS[f"poke-mart-{k}"] = dict(_M, name=f"Poke Mart ({k} city)", exterior=themed_mart(k), theme=k,
                                   base="poke-mart")
    SPECS[f"house-{k}"] = dict(_H, name=f"House ({k} city)", exterior=themed_house(k), theme=k, base="house-red")
