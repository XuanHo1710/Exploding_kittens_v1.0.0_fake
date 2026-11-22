"""Landmark civic buildings (L / XL): department store, museum, weather institute, corporation
tower, space center, Pokemon tower, lighthouse, harbor terminal and battle tower. Gen 3 references:
Lilycove / Celadon Department Store 9 wide, Devon Corp 10x9, Space Center 9x8, Weather Institute
~11x8 (docs/explanation/research/gen3-civic-buildings.md); drawn on 10- or 8-wide bodies so doors stay centred."""
import math

import civickit as CK
from civickit import (BRICK, CREAM, GLASS, IO, ROOF, SLATE, STEELC, STONEC, WARM, WHITE, WOODW, E, bulbs,
                      dish, dome, flag, flat_roof, gable_roof, glyph_sign, hip_roof, lamp_post, planter, relief,
                      ring_emblem, sliding_door, star, swing_door, wall_fn, walls)

TILE_GREY = [STONEC[0], STONEC[1], STONEC[2], STONEC[3], STONEC[4]]
TILE_CREAM = [CREAM[0], CREAM[1], CREAM[2], CREAM[3], CREAM[4]]


def theme(F, accent, rim=None, wood=False):
    return CK.interior_theme(F, accent, rim=rim, floor_px=CK.wood_floor(F) if wood else CK.tiled_floor(F, 8))


def window_rows(B, rows, inset=4, w=10, gap=6, skip=()):
    """Regular grid of windows across the body for each (h0, h1) row."""
    out = []
    for (h0, h1) in rows:
        x = B.x0 + inset
        while x + w <= B.x1 - inset:
            if not any(a <= x < b or a < x + w <= b for a, b in skip):
                out.append((x, x + w, h0, h1, "square"))
            x += w + gap
    return out


# ---------------------------------------------------------------- department store
def dept_exterior(sc, B, t, night):
    R = ROOF["red"]
    door = dict(x0=B.tile_x(4), x1=B.tile_x(6), h=28, px=sliding_door(WHITE))
    rows = [(36, 46), (54, 64), (72, 82)]
    win = window_rows(B, rows, inset=6, w=12, gap=6)
    show = [(B.x0 + 6, B.tile_x(4) - 6, 6, 24, "square"), (B.tile_x(6) + 6, B.x1 - 6, 6, 24, "square")]
    walls(sc, B, wall_fn(B, CREAM, door=door, windows=win + show, pattern="panel",
                         bands=((28, 31, R), (49, 50, STONEC), (67, 68, STONEC), (85, 86, STONEC)), t=t, night=night))
    flat_roof(sc, B.x0, B.x1, 0, B.D, B.wh, STONEC, parapet=4)
    for x in range(B.x0 + 4, B.x1 - 10, 14):              # rooftop garden boxes
        sc.box(x, x + 10, 6, 12, B.wh + 4, B.wh + 9, top=lambda u, v, U, V: (116, 186, 96) if (u + v) % 4 else (236, 92, 98),
               front=lambda *a: WOODW[2], edge=WOODW[4])
    for x in range(B.x0, B.x1, 4):                        # railing
        sc.box(x, x + 1, -1, 0, B.wh + 4, B.wh + 10, front=lambda *a: STEELC[1], edge=None)
    sc.box(B.x0, B.x1, -1, 0, B.wh + 9, B.wh + 10, front=lambda *a: STEELC[0], edge=None)
    glyph_sign(sc, B.x1 - 14, B.x1 - 4, -2, 34, 84, R, ink=WHITE[0], seed=7)     # vertical sign
    relief(sc, CK.pokeball(7), B.xm, 31, {1: IO, 2: R[1], 3: WHITE[0]}, w=9, h=15)


DEPT_1F = ["OOOOOOOOOOOOOOOOOO",
           "#wYYYY.ee.YYYYU.w#",
           "#................#",
           "#.CCCCn....xx.xx.#",
           "#................#",
           "#.YY.YY...YY.YY..#",
           "#g..............g#",
           "########MM########"]


# ---------------------------------------------------------------- museum
def museum_exterior(sc, B, t, night):
    door = dict(x0=B.tile_x(4), x1=B.tile_x(6), h=28, px=swing_door(WOODW, width=32, height=28))
    walls(sc, B, wall_fn(B, STONEC, door=door, pattern="stone", bands=((30, 33, STONEC),), t=t, night=night))
    flat_roof(sc, B.x0, B.x1, 0, B.D, B.wh + 4, SLATE, parapet=3)
    sc.box(B.x0 - 2, B.x1 + 2, -10, 2, B.wh, B.wh + 4, top=lambda *a: STONEC[0],
           front=lambda u, v, U, V: STONEC[1] if v else STONEC[3], edge=STONEC[4])        # entablature
    for i, cx in enumerate(range(B.x0 + 6, B.x1 - 4, 16)):                                # colonnade
        if B.tile_x(4) - 2 <= cx < B.tile_x(6):
            continue
        sc.box(cx, cx + 5, -9, -5, 0, B.wh, top=lambda *a: STONEC[0],
               front=lambda u, v, U, V: STONEC[0] if u < 2 else STONEC[2] if u < 4 else STONEC[3], edge=STONEC[4])

    def ped_in(x, d, h):                                    # triangular pediment
        return -10 <= d < -6 and B.wh + 4 <= h < B.wh + 4 + 18 * (1 - abs(x + 0.5 - B.xm) / (B.bw / 2 + 2))

    def ped_col(x, d, h, face):
        return STONEC[0] if face == "top" else STONEC[2] if (h - B.wh) % 6 == 0 else STONEC[1]
    sc.sculpt(B.x0 - 2, B.x1 + 3, -10, -6, B.wh + 4, B.wh + 23, ped_in, ped_col, edge=STONEC[4])
    fossil = ring_emblem(6, lambda u, v: 3 if abs(math.hypot(u, v) - (math.atan2(v, u) + math.pi) * 0.7) < 0.9 else 0)
    relief(sc, fossil, B.xm, B.wh + 6, {1: IO, 2: CREAM[1], 3: WOODW[3]}, d0=-12, d1=-10, w=7, h=13)
    for i, (x0, x1, d0) in enumerate(((B.tile_x(3), B.tile_x(7), -14), (B.tile_x(3) + 4, B.tile_x(7) - 4, -12))):
        sc.box(x0, x1, d0, d0 + 2, 0, 2 + i * 2, top=lambda *a: STONEC[0], front=lambda *a: STONEC[2], edge=STONEC[4])


MUSEUM_1F = ["OOOOOOOOOOOOOOOO",
             "#wfff..zz..fffw#",
             "#..............#",
             "#.xx..ff..ff.xx#",
             "#..............#",
             "#.G..........G.#",
             "#.....Cn.......#",
             "#g............g#",
             "#######MM#######"]


# ---------------------------------------------------------------- weather institute
def weather_exterior(sc, B, t, night):
    door = dict(x0=B.tile_x(4), x1=B.tile_x(6), h=28, px=sliding_door(WHITE))
    win = window_rows(B, [(10, 22)], inset=6, w=12, gap=8, skip=((B.tile_x(4) - 4, B.tile_x(6) + 4),))
    walls(sc, B, wall_fn(B, WHITE, door=door, windows=win, pattern="panel", bands=((25, 27, ROOF["blue"]),),
                         t=t, night=night))
    flat_roof(sc, B.x0, B.x1, 0, B.D, B.wh, STONEC, parapet=3)
    dome(sc, B.x0 + 30, 12, 18, 8, B.wh + 3, 22, WHITE, ribs=0, glass=False)          # radar dome
    sc.box(B.x1 - 30, B.x1 - 28, 10, 12, B.wh + 3, B.wh + 40, front=lambda *a: STEELC[1], edge=IO)
    for k, (dx, dh) in enumerate(((-6, 40), (4, 40), (-1, 44))):                        # anemometer cups
        sc.box(B.x1 - 29 + dx, B.x1 - 25 + dx, 10, 12, B.wh + dh, B.wh + dh + 3, front=lambda *a: ROOF["blue"][1], edge=IO)
    sc.box(B.x1 - 34, B.x1 - 20, 10, 12, B.wh + 41, B.wh + 42, front=lambda *a: STEELC[2], edge=None)
    dish(sc, B.x1 - 12, 14, B.wh + 3, r=5)
    cloud = ring_emblem(8, lambda u, v: 3 if (u + 2) ** 2 + (v - 1) ** 2 < 12 or (u - 3) ** 2 + v * v < 9 else 0)
    relief(sc, cloud, B.xm, B.wh - 2, {1: IO, 2: ROOF["blue"][1], 3: WHITE[0]}, w=9, h=17)


INSTITUTE_1F = ["OOOOOOOOOOOOOOOO",
                "#wzzzz.pp.zzzzw#",
                "#..............#",
                "#.ddd..dd..ddd.#",
                "#..............#",
                "#.pp........pp.#",
                "#g...Cn.......U#",
                "#######MM#######"]


# ---------------------------------------------------------------- corporation tower
def corp_exterior(sc, B, t, night):
    N = ROOF["navy"]
    door = dict(x0=B.tile_x(3), x1=B.tile_x(5), h=28, px=sliding_door(STEELC))

    def curtain(x, d, h, face):                             # glass curtain wall above the lobby
        if face != "front" or d != 0 or h < 34 or h >= B.wh - 4:
            return None
        band = (h - 34) % 14
        if band >= 11:
            return STEELC[2] if band == 11 else STEELC[3]
        if x % 12 == 0:
            return STEELC[3]
        if night:
            return E(WARM[1]) if (x // 12 + h // 14) % 3 else N[3]
        return GLASS[0] if (x - h) % 13 in (0, 1) else GLASS[1] if band < 6 else GLASS[2]
    lobby = [(B.x0 + 4, B.tile_x(3) - 4, 6, 26, "tall"), (B.tile_x(5) + 4, B.x1 - 4, 6, 26, "tall")]
    walls(sc, B, wall_fn(B, STEELC, door=door, windows=lobby, extra=curtain, bands=((29, 32, N),),
                         t=t, night=night))
    flat_roof(sc, B.x0, B.x1, 0, B.D, B.wh, STEELC, parapet=3,
              deck=lambda x, d: (236, 92, 98) if abs(math.hypot(x - B.xm, (d - 9) * 1.6) - 8) < 1 else STEELC[2])
    sc.box(B.tile_x(3) - 6, B.tile_x(5) + 6, -6, 0, 28, 30, top=lambda *a: N[1], front=lambda *a: N[3], edge=N[4])
    gem = ring_emblem(7, lambda u, v: 3 if abs(u) + abs(v) < 4 else 0)
    relief(sc, gem, B.xm, B.wh - 18, {1: IO, 2: N[1], 3: (120, 220, 255)}, w=8, h=15)


CORP_1F = ["OOOOOOOOOOOOOO",
           "#wkk.zzzz.ggw#",
           "#............#",
           "#..CCCnn.....#",
           "#............#",
           "#.ss..ss...ee#",
           "#.tt..tt...ee#",
           "#g..........U#",
           "######MM######"]


# ---------------------------------------------------------------- space center
def space_exterior(sc, B, t, night):
    door = dict(x0=B.tile_x(4), x1=B.tile_x(6), h=28, px=sliding_door(WHITE))
    win = window_rows(B, [(10, 20)], inset=6, w=10, gap=6, skip=((B.tile_x(4) - 4, B.tile_x(6) + 4),))
    walls(sc, B, wall_fn(B, WHITE, door=door, windows=win, pattern="panel",
                         bands=((22, 24, ROOF["navy"]), (4, 5, ROOF["red"])), t=t, night=night))
    flat_roof(sc, B.x0, B.x1, 0, B.D, B.wh, STONEC, parapet=3)
    dome(sc, B.x0 + 32, 12, 24, 9, B.wh + 3, 30, WHITE, ribs=0)
    sc.box(B.x0 + 29, B.x0 + 36, 4, 8, B.wh + 22, B.wh + 34, front=lambda *a: (40, 36, 60), edge=IO)  # slot
    # rocket on its pad
    rx, rd = B.x1 - 28, 12
    sc.box(rx - 10, rx + 11, rd - 6, rd + 6, B.wh + 3, B.wh + 6, top=lambda *a: STONEC[1], front=lambda *a: STONEC[3],
           edge=IO)

    def r_in(x, d, h):
        hh = h - B.wh - 6
        if hh < 0 or hh >= 70:
            return False
        rr = 6 if hh < 54 else 6 * (70 - hh) / 16
        fin = hh < 14 and abs(x + 0.5 - rx) < 10 - hh * 0.5 and abs(d - rd) < 1.5
        return ((x + 0.5 - rx) / max(rr, 0.5)) ** 2 + ((d - rd) / max(rr * 0.7, 0.4)) ** 2 < 1 or fin

    def r_col(x, d, h, face):
        hh = h - B.wh - 6
        if hh >= 54:
            return ROOF["red"][1] if x < rx else ROOF["red"][3]
        if 20 <= hh <= 23:
            return ROOF["red"][2]
        if abs(x + 0.5 - rx) >= 6:
            return ROOF["red"][2]
        return WHITE[0] if x < rx - 2 else WHITE[1] if x < rx + 2 else WHITE[3]
    sc.sculpt(rx - 11, rx + 12, rd - 6, rd + 7, B.wh + 6, B.wh + 76, r_in, r_col, edge=IO)


SPACE_1F = ["OOOOOOOOOOOOOOOO",
            "#wzzzz....zzzzw#",
            "#..............#",
            "#.xx..ffff..xx.#",
            "#..............#",
            "#.dd........dd.#",
            "#g....Cn......U#",
            "#######MM#######"]


# ---------------------------------------------------------------- Pokemon tower (memorial)
def tower_exterior(sc, B, t, night):
    S, R = [(176, 164, 196), (146, 134, 172), (118, 106, 146), (88, 78, 118), (60, 52, 88)], ROOF["purple"]
    door = dict(x0=B.tile_x(2), x1=B.tile_x(4), h=26, px=swing_door(WOODW, width=32, height=26))
    cand = lambda x, h: None                               # noqa: E731

    def windows(x, d, h, face):
        if face == "front" and d == 0 and h >= 30:
            if (x - B.x0) % 16 in (6, 7, 8, 9) and h % 22 in range(8, 16):
                return E(WARM[1]) if night else (40, 30, 60)
        return None
    walls(sc, B, wall_fn(B, S, door=door, extra=windows, pattern="stone", t=t, night=night), h1=34)
    hip_roof(sc, B.x0, B.x1, 0, B.D, 34, 6, R, ov=3)
    tiers = [(B.x0 + 8, B.x1 - 8, 4, B.D - 4, 40, 66), (B.x0 + 16, B.x1 - 16, 7, B.D - 6, 72, 94)]
    for (x0, x1, d0, d1, h0, h1) in tiers:
        sc.box(x0, x1, d0, d1, h0 - 6, h1, top=lambda *a: S[1],
               front=lambda u, v, U, V: (E(WARM[1]) if night else (40, 30, 60)) if (u % 12 in (5, 6) and v % 10 in range(3, 8))
               else S[3] if (v % 6 == 0 or (u + (v // 6) * 5) % 10 == 0) else S[1] if v % 6 == 5 else S[2],
               edge=S[4])
        hip_roof(sc, x0, x1, d0, d1, h1, 8, R, ov=3)
    sc.box(int(B.xm) - 1, int(B.xm) + 1, 10, 12, 102, 116, front=lambda *a: (252, 220, 96), edge=IO)


TOWER_1F = ["OOOOOOOOOOOO",
            "#wGG....GGw#",
            "#..........#",
            "#.G..GG..G.#",
            "#..........#",
            "#.G..GG..GU#",
            "#..........#",
            "####MM######"]


# ---------------------------------------------------------------- lighthouse
def lighthouse_exterior(sc, B, t, night):
    R = ROOF["red"]
    door = dict(x0=B.tile_x(2), x1=B.tile_x(4), h=24, px=swing_door(WOODW, width=32, height=24))
    walls(sc, B, wall_fn(B, WHITE, door=door, windows=[(B.x0 + 4, B.x0 + 14, 8, 18, "round"),
                                                       (B.x1 - 14, B.x1 - 4, 8, 18, "round")], t=t, night=night))
    hip_roof(sc, B.x0, B.x1, 0, B.D, B.wh, 10, R, ov=2)
    cx, cd = B.xm, B.D - 6

    def t_in(x, d, h):
        if h < B.wh or h >= 96:
            return False
        r = 11 - (h - B.wh) * 0.04
        return ((x + 0.5 - cx) / r) ** 2 + ((d - cd) / (r * 0.6)) ** 2 < 1

    def t_col(x, d, h, face):
        band = ((h - B.wh) // 12) % 2
        ramp = R if band else WHITE
        nx = (x + 0.5 - cx) / 11
        return ramp[0] if nx < -0.4 else ramp[1] if nx < 0.2 else ramp[2] if nx < 0.6 else ramp[3]
    sc.sculpt(int(cx - 12), int(cx + 13), int(cd - 8), int(cd + 8), B.wh, 96, t_in, t_col, edge=IO)
    sc.box(int(cx) - 10, int(cx) + 10, cd - 7, cd + 6, 96, 98, top=lambda *a: STEELC[1], front=lambda *a: STEELC[3], edge=IO)
    sc.box(int(cx) - 7, int(cx) + 7, cd - 4, cd + 4, 98, 108,
           front=lambda u, v, U, V: E((255, 244, 170)) if night or u in range(4, 10) else GLASS[1] if u % 3 else STEELC[2],
           edge=IO)
    dome(sc, cx, cd, 8, 5, 108, 7, R)


LIGHT_1F = ["OOOOOOOOOO",
            "#wk...gUw#",
            "#........#",
            "#.tt.....#",
            "#.cc...b.#",
            "#g.....b.#",
            "###MM#####"]


# ---------------------------------------------------------------- harbor terminal
def harbor_exterior(sc, B, t, night):
    R = ROOF["blue"]
    door = dict(x0=B.tile_x(3), x1=B.tile_x(5), h=28, px=sliding_door(WHITE))
    win = window_rows(B, [(10, 22)], inset=5, w=12, gap=6, skip=((B.tile_x(3) - 4, B.tile_x(5) + 4),))
    walls(sc, B, wall_fn(B, WHITE, door=door, windows=win, pattern="siding", bands=((3, 5, R),), t=t, night=night))

    def wave_in(x, d, h):                                   # wave-crested roof
        crest = B.wh + 10 + 5 * math.sin((x - B.x0) * 2 * math.pi / 32)
        return B.x0 - 2 <= x < B.x1 + 2 and -2 <= d < B.D and B.wh <= h < crest - abs(d - B.D / 2) * 0.4

    def wave_col(x, d, h, face):
        if face == "front":
            return R[3]
        return R[0] if (x + d) % 16 < 3 else R[1] if (x // 8) % 2 else R[2]
    sc.sculpt(B.x0 - 2, B.x1 + 2, -2, B.D, B.wh, B.wh + 16, wave_in, wave_col, edge=R[4])
    anchor = ring_emblem(8, lambda u, v: 3 if (abs(u) < 0.8 and -5 < v < 4) or (abs(v + 3) < 0.8 and abs(u) < 4)
                         or (abs(v - 4) < 0.8 and abs(u) < 2.5) else 0)
    relief(sc, anchor, B.xm, B.wh - 4, {1: IO, 2: R[1], 3: WHITE[0]}, w=9, h=17)
    for bx in (B.x0 - 4, B.x1 + 1):                       # bollards
        sc.box(bx, bx + 4, -8, -4, 0, 6, top=lambda *a: STEELC[0], front=lambda *a: STEELC[2], edge=IO)
    flag(sc, B.x0 + 6, 4, B.wh + 4, B.wh + 30, (R[1], WHITE[0], R[4]))
    flag(sc, B.x1 - 14, 4, B.wh + 4, B.wh + 30, (ROOF["red"][1], WHITE[0], ROOF["red"][4]))


HARBOR_1F = ["OOOOOOOOOOOOOOOO",
             "#wzz..wwww..zzw#",
             "#..............#",
             "#.CCCnn..nnCCC.#",
             "#..............#",
             "#ss..ss..ss..ss#",
             "#g............g#",
             "#######MM#######"]


# ---------------------------------------------------------------- battle tower
def battle_tower(sc, B, t, night):
    S, Y = SLATE, ROOF["yellow"]
    door = dict(x0=B.tile_x(2), x1=B.tile_x(4), h=28, px=sliding_door(STEELC))

    def stripes(x, d, h, face):
        if face == "front" and d == 0 and h >= 32:
            if (x - B.x0) in (14, 15, B.bw - 16, B.bw - 15):
                return E(Y[0]) if night else Y[1]
            if (x - B.x0) % 16 in range(5, 11) and (h - 32) % 16 in range(4, 11):
                return E(WARM[1]) if night else GLASS[1]
        return None
    walls(sc, B, wall_fn(B, S, door=door, extra=stripes, pattern="panel", bands=((28, 31, Y),), t=t, night=night))
    flat_roof(sc, B.x0, B.x1, 0, B.D, B.wh, S, parapet=4)
    cx = int(B.xm)
    sc.box(cx - 6, cx + 6, 4, 12, B.wh + 4, B.wh + 12, top=lambda *a: S[1], front=lambda *a: S[2], edge=IO)
    sc.box(cx - 2, cx + 2, 6, 10, B.wh + 12, B.wh + 28, front=lambda u, v, U, V: STEELC[1] if u < 2 else STEELC[3], edge=IO)
    GK_gem = ring_emblem(5, lambda u, v: 3 if abs(u) + abs(v) < 3 else 0)
    relief(sc, GK_gem, cx, B.wh + 26, {1: IO, 2: Y[1], 3: (120, 220, 255)}, d0=5, d1=7, w=6, h=11)
    relief(sc, ring_emblem(8, star(5)), B.xm, 30, {1: IO, 2: Y[1], 3: Y[0]}, w=9, h=17)


BATTLE_1F = ["OOOOOOOOOOOOOO",
             "#wGz..ee..zGw#",
             "#............#",
             "#..CCnnnCC...#",
             "#............#",
             "#G..........G#",
             "#....rrrr....#",
             "######MM######"]

SPECS = {
    "department-store": dict(name="Department Store", category="Commerce", size="XL", body=10, depth=24, wall_h=90,
                             exterior=dept_exterior, door_kind="sliding",
                             interior=dict(theme=theme(TILE_CREAM, ROOF["red"]),
                                           floors=[dict(name=f"{i}F", grid=DEPT_1F, npcs=[{"role": "clerk", "x": 6, "y": 3}])
                                                   for i in (1, 2)])),
    "museum": dict(name="Museum", category="Landmark", size="XL", body=10, depth=22, wall_h=34,
                   exterior=museum_exterior, door_kind="swing",
                   interior=dict(theme=theme(TILE_GREY, ROOF["brown"]), floors=[dict(name="1F", grid=MUSEUM_1F)])),
    "weather-institute": dict(name="Weather Institute", category="Landmark", size="XL", body=10, depth=22, wall_h=30,
                              exterior=weather_exterior, door_kind="sliding",
                              interior=dict(theme=theme(TILE_GREY, ROOF["blue"]),
                                            floors=[dict(name="1F", grid=INSTITUTE_1F)])),
    "corporation": dict(name="Corporation Tower", category="Industry", size="XL", body=8, depth=20, wall_h=118,
                        exterior=corp_exterior, door_kind="sliding",
                        interior=dict(theme=theme(TILE_GREY, ROOF["navy"]), floors=[dict(name="1F", grid=CORP_1F)])),
    "space-center": dict(name="Space Center", category="Landmark", size="XL", body=10, depth=22, wall_h=28,
                         exterior=space_exterior, door_kind="sliding",
                         interior=dict(theme=theme(TILE_GREY, ROOF["navy"]), floors=[dict(name="1F", grid=SPACE_1F)])),
    "pokemon-tower": dict(name="Pokemon Tower", category="Landmark", size="L", body=6, depth=20, wall_h=34,
                          exterior=tower_exterior, door_kind="swing",
                          interior=dict(theme=theme([(176, 164, 196), (146, 134, 172), (118, 106, 146), (88, 78, 118),
                                                     (60, 52, 88)], ROOF["purple"]), floors=[dict(name="1F", grid=TOWER_1F)])),
    "lighthouse": dict(name="Lighthouse", category="Landmark", size="L", body=6, depth=22, wall_h=24,
                       exterior=lighthouse_exterior, door_kind="swing",
                       interior=dict(theme=theme([WOODW[0], WOODW[1], WOODW[2], WOODW[3], WOODW[4]], ROOF["red"],
                                                 rim=WHITE, wood=True), floors=[dict(name="1F", grid=LIGHT_1F)])),
    "harbor": dict(name="Harbor Terminal", category="Infrastructure", size="L", body=8, depth=22, wall_h=28,
                   exterior=harbor_exterior, door_kind="sliding",
                   interior=dict(theme=theme(TILE_CREAM, ROOF["blue"]), floors=[dict(name="1F", grid=HARBOR_1F)])),
    "battle-tower": dict(name="Battle Tower", category="Battle", size="XL", body=6, depth=18, wall_h=124,
                         exterior=battle_tower, door_kind="sliding",
                         interior=dict(theme=theme(TILE_GREY, ROOF["yellow"]), floors=[dict(name="1F", grid=BATTLE_1F)])),
}
