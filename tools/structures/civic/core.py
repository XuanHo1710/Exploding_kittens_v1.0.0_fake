"""Core civic shells (S class, 4x4 metatile bodies like Emerald): Pokemon Center, Poke Mart and
town houses. Original designs in the gyms' visual language; Gen 3 proportions from
docs/explanation/research/gen3-civic-buildings.md (Center / Mart / house = 4x4 metatiles in RSE)."""
import civickit as CK
from civickit import (BRICK, CREAM, GLASS, IO, ROOF, SLATE, STONEC, WHITE, WOODW, Body, E, bag, chimney,
                      dome, eave_band, gable_roof, hip_roof, planter, pokeball, sliding_door, swing_door,
                      wall_fn, walls)

RED = ROOF["red"]
BLUE = ROOF["blue"]


# ---------------------------------------------------------------- Pokemon Center
def center_exterior(sc, B, t, night):
    door = dict(x0=B.tile_x(1), x1=B.tile_x(3), h=28,
                px=sliding_door(WHITE, inside=(84, 60, 72), spill=(238, 214, 178)))
    win = [(B.x0 + 3, B.x0 + 13, 10, 22, "square"), (B.x1 - 13, B.x1 - 3, 10, 22, "square")]
    walls(sc, B, wall_fn(B, WHITE, door=door, windows=win, bands=((3, 5, SLATE),), t=t, night=night))
    # red roof slab with a ribbed hump (the Center's signature), Poke Ball on the eave band
    hip_roof(sc, B.x0, B.x1, 0, B.D, B.wh + 4, 9, RED, ov=2)
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
    # skylight beacon on the hump
    sc.box(int(B.xm) - 2, int(B.xm) + 2, 9, 12, B.wh + 23, B.wh + 26,
           top=lambda *a: E(GLASS[0]) if night else GLASS[0], front=lambda *a: E(GLASS[1]) if night else GLASS[2])


CENTER_1F = ["OOOOOOOOOOOOOO",
             "#wkkzv##vzpgw#",
             "#g...hnn....g#",
             "#...CCCCCC...#",
             "#............#",
             "#U....rr..ss.#",
             "#.....rr..tt.#",
             "#g....rr..ss.#",
             "######MM######"]
CENTER_2F = ["OOOOOOOOOOOOOO",
             "#wgnn..nnggw.#",
             "#.CCCC.CCCC..#",
             "#............#",
             "#D...........#",
             "#............#",
             "#g..ss..ss..g#",
             "#g..tt..tt..g#",
             "#####g##g#####"]

# ---------------------------------------------------------------- Poke Mart
GOODS = [(236, 92, 98), (96, 160, 236), (252, 220, 96), (120, 200, 120), (250, 250, 255)]


def mart_exterior(sc, B, t, night):
    door = dict(x0=B.tile_x(2), x1=B.tile_x(4), h=28,
                px=sliding_door(WHITE, inside=(70, 70, 96), spill=(220, 220, 236)))

    def showcase(x, d, h, face):
        if face != "front" or d != 0:
            return None
        if B.x0 + 4 <= x < B.tile_x(2) - 3 and 7 <= h < 24:
            u, v = x - (B.x0 + 4), h - 7
            if v in (0, 16) or u in (0, B.tile_x(2) - 8 - B.x0 - 1):
                return WHITE[3]
            if night:
                return E(CK.WARM[1])
            if v in (5, 10):
                return WOODW[2]
            if (u + v) % 9 in (0, 1):
                return GLASS[0]
            return GOODS[(u // 3 + v // 5) % len(GOODS)] if v % 5 in (2, 3) and u % 3 else GLASS[1]
        return None
    walls(sc, B, wall_fn(B, WHITE, door=door, bands=((3, 5, SLATE),), extra=showcase, t=t, night=night))
    hip_roof(sc, B.x0, B.x1, 0, B.D, B.wh + 4, 12, BLUE, ov=2)
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


MART_1F = ["OOOOOOOOOOO",
           "#wYYY.YYYw#",
           "#.........#",
           "#.YY..YY..#",
           "#.........#",
           "#.YY..YY..#",
           "#Cn.......#",
           "#C........#",
           "######MM###"]


# ---------------------------------------------------------------- houses
def house_exterior(roof, walls_ramp=CREAM, pattern="siding", chim=True, door_tile=1, flowers=True):
    R = ROOF[roof]

    def ext(sc, B, t, night):
        dx0 = B.tile_x(door_tile)
        door = dict(x0=dx0, x1=dx0 + 16, h=26, px=swing_door(WOODW))
        others = [i for i in range(4) if i != door_tile]
        win = [(B.tile_x(i) + 3, B.tile_x(i) + 13, 9, 19, "square") for i in others[:3] if i != door_tile]
        walls(sc, B, wall_fn(B, walls_ramp, door=door, windows=win[:2] if len(win) > 2 else win,
                             pattern=pattern, t=t, night=night))
        if chim:
            chimney(sc, B.x0 + 6, 12, B.wh, B.wh + 22)
        gable_roof(sc, B.x0, B.x1, 0, B.D, B.wh, 16, R, ov=2, rows=3)
        if flowers:
            planter(sc, B.tile_x(others[-1]) + 2, B.tile_x(others[-1]) + 14, -4, 4)
    return ext


HOUSE_1F = ["OOOOOOOOOOO",
            "#wkv...gbw#",
            "#........b#",
            "#..tt.....#",
            "#..cc.....#",
            "#g.......U#",
            "#.........#",
            "###MM######"]


def center_theme():
    F = [(255, 250, 220), (246, 234, 190), (226, 208, 160), (186, 164, 130), (140, 120, 104)]
    ball = CK.pokeball(20)

    def motif(gx, gy):                       # faint Poke Ball inlay between counter and door
        u, v = gx + 0.5 - 7 * 16, (6.5 * 16) - gy + 20
        if abs(u) < 22 and 0 <= v < 42:
            lv = ball(u, v)
            if lv == 1:
                return (238, 176, 120)
            if lv == 3 and v > 20:
                return (246, 196, 150)
        return None
    return CK.interior_theme(F, RED, floor_px=CK.tiled_floor(F, 8, motif))


def mart_theme():
    F = [(240, 244, 255), (222, 228, 244), (196, 204, 226), (152, 160, 196), (108, 114, 160)]
    return CK.interior_theme(F, BLUE, floor_px=CK.tiled_floor(F, 8))


def house_theme(roof):
    F = [WOODW[0], WOODW[1], WOODW[2], WOODW[3], WOODW[4]]
    return CK.interior_theme(F, ROOF[roof], rim=CREAM, floor_px=CK.wood_floor(F))


SPECS = {
    "pokemon-center": dict(name="Pokemon Center", category="Civic", size="S", body=4, depth=20, wall_h=30,
                           exterior=center_exterior, door_kind="sliding",
                           interior=dict(theme=center_theme(), floors=[
                               dict(name="1F", grid=CENTER_1F, npcs=[{"role": "nurse", "x": 5, "y": 2}]),
                               dict(name="2F", grid=CENTER_2F, npcs=[{"role": "link attendant", "x": 3, "y": 1},
                                                                    {"role": "trade attendant", "x": 8, "y": 1}])])),
    "poke-mart": dict(name="Poke Mart", category="Civic", size="S", body=4, depth=20, wall_h=30,
                      exterior=mart_exterior, door_kind="sliding",
                      interior=dict(theme=mart_theme(), floors=[
                          dict(name="1F", grid=MART_1F, npcs=[{"role": "clerk", "x": 2, "y": 6}])])),
}
for roof in ("red", "blue", "green", "orange"):
    SPECS[f"house-{roof}"] = dict(name=f"House ({roof} roof)", category="Residential", size="S", body=4,
                                  depth=18, wall_h=22, exterior=house_exterior(roof, door_tile=1 if roof in ("red", "green") else 2),
                                  door_kind="swing",
                                  interior=dict(theme=house_theme(roof), floors=[dict(name="1F", grid=HOUSE_1F)]))
