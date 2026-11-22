"""Mid-size civic buildings (M / L): player house, route gate, professor's lab, trainer's school,
game corner, contest hall, dojo and the safari entrance. Gen 3 footprints from
docs/explanation/research/gen3-civic-buildings.md (lab / school 7x5 -> drawn 8 wide so the 2-tile door is
centred; game corner 7x4; contest hall 7x7; dojo 6x5)."""
import math

import civickit as CK
from civickit import (BRICK, CREAM, GLASS, IO, ROOF, SLATE, STEELC, STONEC, WARM, WHITE, WOODW, E, awning,
                      bulbs, chimney, dish, dome, flag, flat_roof, gable_roof, glyph_sign, hip_roof, lamp_post,
                      planter, relief, ring_emblem, sliding_door, solar, star, swing_door, wall_fn, walls)


def lobby_theme(F, accent, rim=None, kind="tile"):
    fp = CK.tiled_floor(F, 8) if kind == "tile" else CK.wood_floor(F)
    return CK.interior_theme(F, accent, rim=rim, floor_px=fp)


TILE_CREAM = [CREAM[0], CREAM[1], CREAM[2], CREAM[3], CREAM[4]]
TILE_GREY = [STONEC[0], STONEC[1], STONEC[2], STONEC[3], STONEC[4]]
WOOD_F = [WOODW[0], WOODW[1], WOODW[2], WOODW[3], WOODW[4]]


# ---------------------------------------------------------------- player house (two storeys)
def player_house(sc, B, t, night):
    R = ROOF["teal"]
    door = dict(x0=B.tile_x(1), x1=B.tile_x(2), h=26, px=swing_door(WOODW))
    win = [(B.tile_x(3) + 3, B.tile_x(3) + 13, 9, 19, "square"), (B.tile_x(2) + 3, B.tile_x(2) + 13, 9, 19, "square"),
           (B.tile_x(1) + 3, B.tile_x(1) + 13, 28, 37, "square"), (B.tile_x(3) + 3, B.tile_x(3) + 13, 28, 37, "square")]
    walls(sc, B, wall_fn(B, CREAM, door=door, windows=win, pattern="siding", bands=((23, 24, WOODW),),
                         t=t, night=night))
    chimney(sc, B.x1 - 14, 12, B.wh, B.wh + 24)
    gable_roof(sc, B.x0, B.x1, 0, B.D, B.wh, 16, R, ov=2)
    planter(sc, B.tile_x(2) + 2, B.tile_x(4) - 2, -4, 5)
    # mailbox on a post by the door
    mx = B.x0 + 4
    sc.box(mx + 2, mx + 4, -6, -4, 0, 9, front=lambda *a: WOODW[2], edge=WOODW[4])
    sc.box(mx, mx + 7, -7, -3, 9, 14, top=lambda *a: ROOF["red"][0],
           front=lambda u, v, U, V: ROOF["red"][1] if v > 1 else ROOF["red"][3], edge=ROOF["red"][4])


HOME_1F = ["OOOOOOOOOOOO",
           "#wvkk..gtt.#",
           "#.......tt.#",
           "#..tt....cc#",
           "#..cc......#",
           "#g........U#",
           "#..........#",
           "##MM########"]
HOME_2F = ["OOOOOOOOOOOO",
           "#wkkp..vbbw#",
           "#.......bb.#",
           "#..........#",
           "#g........D#",
           "#.....rr...#",
           "############"]


# ---------------------------------------------------------------- route gate
def gate_exterior(sc, B, t, night):
    door = dict(x0=B.tile_x(2), x1=B.tile_x(4), h=26, px=sliding_door(SLATE, height=26))
    win = [(B.x0 + 4, B.x0 + 14, 9, 19, "square"), (B.x1 - 14, B.x1 - 4, 9, 19, "square")]
    walls(sc, B, wall_fn(B, STONEC, door=door, windows=win, pattern="stone", bands=((22, 23, SLATE),),
                         t=t, night=night))
    flat_roof(sc, B.x0, B.x1, 0, B.D, B.wh, SLATE, parapet=4)
    glyph_sign(sc, B.tile_x(2) + 4, B.tile_x(4) - 4, -1, B.wh - 4, B.wh + 4, ROOF["navy"], ink=WHITE[0], seed=3)
    lamp_post(sc, B.x0 - 6, -4)
    lamp_post(sc, B.x1 + 4, -4)


GATE_1F = ["OOOOOOOOOOOO",
           "#w...MM...w#",
           "#..........#",
           "#Cn........#",
           "#C......g..#",
           "#..........#",
           "#####MM#####"]


# ---------------------------------------------------------------- professor's lab
def lab_exterior(sc, B, t, night):
    door = dict(x0=B.tile_x(3), x1=B.tile_x(5), h=28, px=sliding_door(WHITE))
    strip = [(B.x0 + 4, B.tile_x(3) - 4, 12, 24, "tall"), (B.tile_x(5) + 4, B.x1 - 4, 12, 24, "tall")]
    walls(sc, B, wall_fn(B, WHITE, door=door, windows=strip, pattern="panel", bands=((4, 6, ROOF["teal"]),),
                         t=t, night=night))
    flat_roof(sc, B.x0, B.x1, 0, B.D, B.wh, STONEC, parapet=3)
    solar(sc, B.x0 + 4, B.tile_x(3) - 2, 6, 16, B.wh + 3)
    solar(sc, B.tile_x(5) + 2, B.x1 - 16, 6, 16, B.wh + 3)
    dish(sc, B.x1 - 10, 14, B.wh + 3, r=6)
    sc.box(int(B.xm) - 1, int(B.xm) + 1, 14, 16, B.wh + 3, B.wh + 22, front=lambda *a: STEELC[1], edge=IO)
    sc.box(int(B.xm) - 2, int(B.xm) + 2, 14, 16, B.wh + 22, B.wh + 24, front=lambda *a: E((255, 120, 120)), edge=IO)
    leaf = ring_emblem(7, lambda u, v: 3 if abs(u - v * 0.3) < 1.2 and -4 < v < 5 else 0)
    relief(sc, leaf, B.xm, B.wh - 6, {1: IO, 2: ROOF["teal"][1], 3: WHITE[0]}, w=8, h=15)


LAB_1F = ["OOOOOOOOOOOOOOO",
          "#wkkkk.zz.kkkw#",
          "#.............#",
          "#.dd..ppp..dd.#",
          "#.............#",
          "#xx....n...xxx#",
          "#.....ddd.....#",
          "#g...........g#",
          "#.............#",
          "######MM#######"]


# ---------------------------------------------------------------- trainer's school
def school_exterior(sc, B, t, night):
    R = ROOF["slate"]
    door = dict(x0=B.tile_x(3), x1=B.tile_x(5), h=26, px=swing_door(WOODW, width=32, height=26))
    win = [(B.tile_x(i) + 3, B.tile_x(i) + 13, 8, 20, "tall") for i in (0, 1, 2, 5, 6, 7)]
    walls(sc, B, wall_fn(B, BRICK, door=door, windows=win, pattern="brick", bands=((3, 4, STONEC),),
                         t=t, night=night))
    gable_roof(sc, B.x0, B.x1, 0, B.D, B.wh, 14, R, ov=2)
    # clock tower over the door
    cx = int(B.xm)
    sc.box(cx - 10, cx + 10, 4, 16, B.wh, B.wh + 30, top=lambda *a: R[1],
           front=lambda u, v, U, V: BRICK[2] if (u + (v // 4) * 4) % 8 else BRICK[3], edge=BRICK[4])
    hip_roof(sc, cx - 10, cx + 10, 4, 16, B.wh + 30, 10, R, ov=2)
    clock = ring_emblem(7, lambda u, v: 3 if (abs(u) < 0.7 and 0 <= v < 5) or (abs(v) < 0.7 and 0 <= u < 4) else 0)
    relief(sc, clock, cx, B.wh + 12, {1: IO, 2: WHITE[0], 3: IO}, d0=2, d1=4, w=8, h=15)
    flag(sc, B.x1 - 8, 4, B.wh, B.wh + 26, (ROOF["red"][1], WHITE[0], ROOF["red"][4]))


SCHOOL_1F = ["OOOOOOOOOOOOOOOO",
             "#wkk..zzzz..kkw#",
             "#......dd......#",
             "#..............#",
             "#.tt..tt..tt...#",
             "#.cc..cc..cc...#",
             "#.tt..tt..tt...#",
             "#.cc..cc..cc..g#",
             "#..............#",
             "#######MM#######"]


# ---------------------------------------------------------------- game corner
def corner_exterior(sc, B, t, night):
    P, Y = ROOF["purple"], ROOF["yellow"]
    door = dict(x0=B.tile_x(3), x1=B.tile_x(5), h=26, px=sliding_door(Y, height=26, inside=(60, 40, 80)))

    def neon(x, d, h, face):
        if face == "front" and d == 0 and (B.x0 + 3 <= x < B.tile_x(3) - 3 or B.tile_x(5) + 3 <= x < B.x1 - 3) \
                and 6 <= h < 20:
            u = x - (B.x0 + 3 if x < B.xm else B.tile_x(5) + 3)
            if (u + h) % 6 == 0:
                return E(Y[0]) if night else Y[1]
            return E((255, 120, 200)) if night and (u // 3 + h // 4) % 2 else P[3] if (u // 3 + h // 4) % 2 else P[2]
        return None
    walls(sc, B, wall_fn(B, P, door=door, extra=neon, pattern="panel", bands=((22, 24, Y),), t=t, night=night))
    flat_roof(sc, B.x0, B.x1, 0, B.D, B.wh, P, parapet=4)
    awning(sc, B.tile_x(3) - 4, B.tile_x(5) + 4, B.wh - 6, [Y[0], P[1], P[3], P[4]])
    bulbs(sc, B.x0 + 2, B.x1 - 2, -1, B.wh + 1)
    coin = ring_emblem(9, star(5))
    relief(sc, coin, B.xm, B.wh + 2, {1: IO, 2: Y[1], 3: Y[0]}, w=10, h=19)


CORNER_1F = ["OOOOOOOOOOOOOOOOOO",
             "#wmmmm.mmmm.mmmmw#",
             "#................#",
             "#.c.c.c..c.c.c...#",
             "#.mmmmm..mmmmm...#",
             "#................#",
             "#.c.c.c..c.c.c...#",
             "#.mmmmm..mmmmm..g#",
             "#Cn..............#",
             "#C...............#",
             "########MM########"]


# ---------------------------------------------------------------- contest hall
def contest_exterior(sc, B, t, night):
    PK = ROOF["pink"]
    door = dict(x0=B.tile_x(3), x1=B.tile_x(5), h=28, px=sliding_door(WHITE))
    win = [(B.x0 + 5, B.x0 + 15, 10, 26, "arch"), (B.x1 - 15, B.x1 - 5, 10, 26, "arch")]
    walls(sc, B, wall_fn(B, CREAM, door=door, windows=win, bands=((28, 31, PK),), t=t, night=night))
    flat_roof(sc, B.x0, B.x1, 0, B.D, B.wh, PK, parapet=3)
    dome(sc, B.xm, 12, 30, 10, B.wh + 3, 26, PK, ribs=5)
    for cx in (B.tile_x(3) - 6, B.tile_x(5) + 4):        # columns flanking the door
        sc.box(cx, cx + 4, -4, 0, 0, B.wh, top=lambda *a: WHITE[0],
               front=lambda u, v, U, V: WHITE[1] if u < 2 else WHITE[3], edge=WHITE[4])
    bulbs(sc, B.x0 + 2, B.x1 - 2, -1, B.wh - 1, cols=((255, 236, 120), (255, 160, 200)))
    ribbon = ring_emblem(9, star(6))
    relief(sc, ribbon, B.xm, B.wh + 3, {1: IO, 2: PK[1], 3: (255, 236, 120)}, w=10, h=19)


CONTEST_1F = ["OOOOOOOOOOOOOOOO",
              "#wGg..zzzz..gGw#",
              "#..............#",
              "#.CCCnn..nnCCC.#",
              "#..............#",
              "#ss..ss..ss..ss#",
              "#tt..tt..tt..tt#",
              "#ss..ss..ss..ss#",
              "#......rr......#",
              "#######MM#######"]


# ---------------------------------------------------------------- dojo
def dojo_exterior(sc, B, t, night):
    R = ROOF["navy"]
    paper = [(252, 248, 236), (236, 228, 210), (210, 198, 176), (150, 120, 96), (96, 70, 60)]
    door = dict(x0=B.tile_x(2), x1=B.tile_x(4), h=26,
                px=sliding_door(WOODW, glass=[paper[0], paper[0], paper[1], paper[2], paper[3]], height=26))
    win = [(B.x0 + 4, B.x0 + 14, 9, 19, "square"), (B.x1 - 14, B.x1 - 4, 9, 19, "square")]
    walls(sc, B, wall_fn(B, WOODW, door=door, windows=win, pattern="planks", bands=((3, 5, STONEC),),
                         t=t, night=night))
    hip_roof(sc, B.x0, B.x1, 0, B.D, B.wh, 18, R, ov=4)
    for x in (B.x0 - 5, B.x1 + 1):                       # upturned eave tips
        sc.box(x, x + 4, -4, -1, B.wh + 1, B.wh + 5, top=lambda *a: R[0], front=lambda *a: R[2], edge=R[4])
    for lx in (B.tile_x(2) - 5, B.tile_x(4) + 1):         # paper lanterns
        sc.box(lx, lx + 4, -3, -1, 14, 21, front=lambda u, v, U, V: E(WARM[0]) if night else
               (ROOF["red"][1] if v % 3 else ROOF["red"][3]), edge=IO)
    sc.box(B.x0 + 16, B.x0 + 21, -2, -1, 4, 22, front=lambda u, v, U, V: ROOF["red"][1] if v % 6 else WHITE[0],
           edge=ROOF["red"][4])                           # cloth banner


DOJO_1F = ["OOOOOOOOOOOOO",
           "#wGz....zGw.#",
           "#...........#",
           "#.rrrrrrrrr.#",
           "#.rrrrrrrrr.#",
           "#.rrrrrrrrr.#",
           "#.rrrrrrrrr.#",
           "#g.........g#",
           "#####MM######"]


# ---------------------------------------------------------------- safari entrance
def safari_exterior(sc, B, t, night):
    R = [(252, 230, 150), (232, 196, 110), (200, 156, 84), (152, 110, 66), (100, 72, 52)]   # straw thatch
    door = dict(x0=B.tile_x(2), x1=B.tile_x(4), h=26, px=swing_door(WOODW, width=32, height=26))
    win = [(B.x0 + 4, B.x0 + 14, 9, 19, "round"), (B.x1 - 14, B.x1 - 4, 9, 19, "round")]
    walls(sc, B, wall_fn(B, WOODW, door=door, windows=win, pattern="planks", t=t, night=night))
    hip_roof(sc, B.x0, B.x1, 0, B.D, B.wh, 20, R, ov=4, rows=2)
    for x in (B.tile_x(2) - 6, B.tile_x(4) + 2):         # bamboo gate posts + lintel
        sc.box(x, x + 4, -6, -2, 0, 34, front=lambda u, v, U, V: (150, 190, 90) if v % 6 else (100, 140, 64),
               edge=(70, 100, 50))
    sc.box(B.tile_x(2) - 8, B.tile_x(4) + 8, -6, -2, 34, 38, front=lambda u, v, U, V: (150, 190, 90) if v else (100, 140, 64),
           top=lambda *a: (180, 216, 110), edge=(70, 100, 50))
    planter(sc, B.x0 + 2, B.x0 + 14, -5, 5, flowers=((150, 200, 90), (120, 180, 80), (252, 220, 96)))


SAFARI_1F = ["OOOOOOOOOOOO",
             "#wkg.MM.gkw#",
             "#..........#",
             "#.CCnn.....#",
             "#..........#",
             "#g.......g.#",
             "#####MM#####"]

SPECS = {
    "player-house": dict(name="Player House", category="Residential", size="M", body=5, depth=20, wall_h=40,
                         exterior=player_house, door_kind="swing",
                         interior=dict(theme=lobby_theme(WOOD_F, ROOF["teal"], rim=CREAM, kind="wood"),
                                       floors=[dict(name="1F", grid=HOME_1F), dict(name="2F", grid=HOME_2F)])),
    "route-gate": dict(name="Route Gate", category="Infrastructure", size="M", body=6, depth=18, wall_h=26,
                       exterior=gate_exterior, door_kind="sliding",
                       interior=dict(theme=lobby_theme(TILE_GREY, SLATE), floors=[dict(name="1F", grid=GATE_1F)])),
    "professor-lab": dict(name="Professor's Lab", category="Civic", size="L", body=8, depth=24, wall_h=32,
                          exterior=lab_exterior, door_kind="sliding",
                          interior=dict(theme=lobby_theme(TILE_GREY, ROOF["teal"]), floors=[dict(name="1F", grid=LAB_1F)])),
    "trainer-school": dict(name="Trainer's School", category="Civic", size="L", body=8, depth=22, wall_h=26,
                           exterior=school_exterior, door_kind="swing",
                           interior=dict(theme=lobby_theme(WOOD_F, BRICK, rim=CREAM, kind="wood"),
                                         floors=[dict(name="1F", grid=SCHOOL_1F)])),
    "game-corner": dict(name="Game Corner", category="Entertainment", size="L", body=8, depth=20, wall_h=30,
                        exterior=corner_exterior, door_kind="sliding",
                        interior=dict(theme=lobby_theme([(120, 96, 160), (100, 78, 140), (82, 62, 120), (62, 46, 96),
                                                         (44, 32, 72)], ROOF["purple"], kind="tile"),
                                      floors=[dict(name="1F", grid=CORNER_1F)])),
    "contest-hall": dict(name="Contest Hall", category="Entertainment", size="L", body=8, depth=26, wall_h=34,
                         exterior=contest_exterior, door_kind="sliding",
                         interior=dict(theme=lobby_theme(TILE_CREAM, ROOF["pink"]), floors=[dict(name="1F", grid=CONTEST_1F)])),
    "dojo": dict(name="Fighting Dojo", category="Battle", size="M", body=6, depth=20, wall_h=26,
                 exterior=dojo_exterior, door_kind="sliding",
                 interior=dict(theme=lobby_theme(WOOD_F, ROOF["navy"], rim=WOODW, kind="wood"),
                               floors=[dict(name="1F", grid=DOJO_1F)])),
    "safari-entrance": dict(name="Safari Zone Entrance", category="Infrastructure", size="M", body=6, depth=18,
                            wall_h=24, exterior=safari_exterior, door_kind="swing",
                            interior=dict(theme=lobby_theme(WOOD_F, ROOF["green"], rim=WOODW, kind="wood"),
                                          floors=[dict(name="1F", grid=SAFARI_1F)])),
}
