"""Small shops and services on the 4x4 house shell (Gen 3 reuses the house layout for Name Rater,
Move Deleter, Fan Club ...), plus the Day Care with its paddock and the odd Trick House."""
import math

import civickit as CK
from civickit import (BRICK, CREAM, GLASS, IO, ROOF, STONEC, WHITE, WOODW, E, awning, chimney, gable_roof,
                      heart, hip_roof, planter, relief, ring_emblem, sliding_door, star, swing_door, wall_fn,
                      walls)

SHOP_1F = ["OOOOOOOOOOO",
           "#wxxx.kkgw#",
           "#.........#",
           "#CCn......#",
           "#.....tt..#",
           "#g....cc.g#",
           "#.........#",
           "###MM######"]


def shop_theme(roof, floor=None):
    F = floor or [CREAM[0], CREAM[1], CREAM[2], CREAM[3], CREAM[4]]
    return CK.interior_theme(F, ROOF[roof], rim=CREAM, floor_px=CK.tiled_floor(F, 8))


# ---------------------------------------------------------------- Bike Shop
def wheel(r=6):
    def f(u, v):
        for cx in (-r - 1, r + 1):
            q = math.hypot(u - cx, v - r)
            if r - 1.3 < q <= r:
                return 1
            if q < 1.2:
                return 3
            if q < r - 1.3 and (abs(u - cx) < 0.6 or abs(v - r) < 0.6):
                return 3
        if -r <= u <= r and abs(v - r - 1) < 0.8:
            return 3
        return 0
    return f


def bike_exterior(sc, B, t, night):
    R = ROOF["teal"]
    door = dict(x0=B.tile_x(2), x1=B.tile_x(4), h=26, px=sliding_door(WHITE, height=26))

    def window(x, d, h, face):
        if face == "front" and d == 0 and B.x0 + 4 <= x < B.tile_x(2) - 3 and 6 <= h < 20:
            u, v = x - B.x0 - 4, h - 6
            if u in (0, B.tile_x(2) - B.x0 - 8) or v in (0, 13):
                return WHITE[3]
            if night:
                return E(CK.WARM[1])
            lv = wheel(4)(u - 13, v - 1)
            if lv:
                return IO if lv == 1 else STONEC[3]
            return GLASS[0] if (u - v) % 9 in (0, 1) else GLASS[1]
        return None
    walls(sc, B, wall_fn(B, WHITE, door=door, extra=window, pattern="siding", t=t, night=night))
    gable_roof(sc, B.x0, B.x1, 0, B.D, B.wh, 14, R, ov=2)
    awning(sc, B.x0 + 2, B.x1 - 2, B.wh - 4, [(252, 252, 255), R[1], R[3], R[4]])


# ---------------------------------------------------------------- Flower Shop
def flower_exterior(sc, B, t, night):
    R = ROOF["pink"]
    door = dict(x0=B.tile_x(1), x1=B.tile_x(2), h=26, px=swing_door(WOODW))

    def glasshouse(x, d, h, face):
        if face == "front" and d == 0 and B.tile_x(2) + 2 <= x < B.x1 - 2 and 4 <= h < B.wh - 3:
            u, v = x - B.tile_x(2) - 2, h - 4
            if u % 7 == 0 or v % 6 == 0:
                return WHITE[1]
            if night:
                return E(CK.WARM[2])
            if v < 5 and (u + v) % 3:
                return [(236, 92, 140), (252, 220, 96), (250, 250, 255), (120, 200, 120)][(u // 3) % 4]
            return GLASS[0] if (u - v) % 8 in (0, 1) else GLASS[1]
        return None
    walls(sc, B, wall_fn(B, CREAM, door=door, extra=glasshouse,
                         windows=[(B.x0 + 3, B.x0 + 13, 9, 19, "arch")], t=t, night=night))
    gable_roof(sc, B.x0, B.x1, 0, B.D, B.wh, 14, R, ov=2)
    planter(sc, B.x0 + 2, B.tile_x(1) - 1, -4, 5)
    planter(sc, B.tile_x(2) + 1, B.x1 - 2, -4, 5, flowers=((236, 92, 140), (250, 250, 255), (252, 220, 96)))


# ---------------------------------------------------------------- Fan Club / Name Rater (badge houses)
def badge_house(roof, emblem, cols, door_tile=1, walls_ramp=CREAM):
    R = ROOF[roof]

    def ext(sc, B, t, night):
        dx = B.tile_x(door_tile)
        door = dict(x0=dx, x1=dx + 16, h=26, px=swing_door(WOODW))
        others = [i for i in range(4) if i != door_tile]
        win = [(B.tile_x(i) + 3, B.tile_x(i) + 13, 9, 19, "round" if i == others[-1] else "square")
               for i in (others[0], others[-1])]
        walls(sc, B, wall_fn(B, walls_ramp, door=door, windows=win, pattern="planks", t=t, night=night))
        hip_roof(sc, B.x0, B.x1, 0, B.D, B.wh, 16, R, ov=2)
        relief(sc, emblem, B.xm, B.wh + 1, cols, d0=-1, d1=1, w=9, h=15)
    return ext


# ---------------------------------------------------------------- Trick House
def trick_exterior(sc, B, t, night):
    R = ROOF["purple"]
    door = dict(x0=B.tile_x(2), x1=B.tile_x(3), h=26, px=swing_door(ROOF["teal"]))
    win = [(B.x0 + 4, B.x0 + 12, 8, 20, "arch"), (B.x1 - 12, B.x1 - 4, 12, 22, "round")]
    walls(sc, B, wall_fn(B, ROOF["teal"], door=door, windows=win, pattern="planks", t=t, night=night))

    def inside(x, d, h):                           # crooked roof: the ridge leans to one side
        lean = (x - B.x0) / B.bw
        top = B.wh + 10 + 10 * lean + 3 * math.sin(x * 0.35)
        return B.x0 - 2 <= x < B.x1 + 2 and -2 <= d < B.D and B.wh <= h < top - abs(d - B.D * 0.45) * 0.5

    def color(x, d, h, face):
        if face == "front":
            return R[3]
        return R[1] if (x // 5 + d // 3) % 2 else R[2]
    sc.sculpt(B.x0 - 2, B.x1 + 2, -2, B.D, B.wh, B.wh + 24, inside, color, edge=R[4])
    spiral = ring_emblem(6, lambda u, v: 3 if abs(math.hypot(u, v) - (math.atan2(v, u) + math.pi) * 0.8) < 0.8 else 0)
    relief(sc, spiral, B.tile_x(1) - 2, B.wh - 1, {1: IO, 2: (252, 220, 96), 3: R[2]}, d0=-2, d1=0, w=7, h=13)


# ---------------------------------------------------------------- Day Care (M canvas: house + paddock)
def daycare_exterior(sc, B, t, night):
    R = ROOF["orange"]
    door = dict(x0=B.tile_x(1), x1=B.tile_x(2), h=26, px=swing_door(WOODW))
    win = [(B.tile_x(2) + 3, B.tile_x(2) + 13, 9, 19, "square"), (B.x0 + 3, B.x0 + 13, 9, 19, "square")]
    walls(sc, B, wall_fn(B, WOODW, door=door, windows=win, pattern="planks", t=t, night=night),
          x1=B.tile_x(3))
    chimney(sc, B.x0 + 4, 10, B.wh, B.wh + 20, STONEC)
    gable_roof(sc, B.x0, B.tile_x(3), 0, B.D, B.wh, 16, R, ov=2)
    planter(sc, B.tile_x(2) + 2, B.tile_x(3) - 1, -4, 5)
    # paddock: fenced lawn with a trough and hay bales, to the right of the house
    px0, px1 = B.tile_x(3) + 2, B.x1 + 12
    for x in range(px0, px1, 6):
        sc.box(x, x + 2, -6, -4, 0, 9, front=lambda u, v, U, V: WOODW[1] if u == 0 else WOODW[2], edge=WOODW[4])
    for hh in (3, 7):
        sc.box(px0, px1, -6, -5, hh, hh + 1, front=lambda *a: WOODW[1], edge=None)
    sc.box(px0 + 4, px0 + 14, 6, 10, 0, 4, top=lambda u, v, U, V: (120, 180, 230) if 0 < u < 9 and 0 < v < 3 else WOODW[1],
           front=lambda *a: WOODW[2], edge=WOODW[4])
    for (hx, hd) in ((px1 - 14, 8), (px1 - 9, 12)):
        sc.box(hx, hx + 8, hd, hd + 5, 0, 6, top=lambda u, v, U, V: (246, 214, 110) if (u + v) % 3 else (220, 180, 80),
               front=lambda u, v, U, V: (230, 190, 90) if v % 2 else (200, 160, 70), edge=(150, 110, 60))


DAYCARE_1F = ["OOOOOOOOOOOO",
              "#wkk.vg...w#",
              "#..........#",
              "#.Cn.......#",
              "#.C...tt...#",
              "#g....cc..g#",
              "#..........#",
              "#..........#",
              "###MM#######"]

SPECS = {
    "bike-shop": dict(name="Bike Shop", category="Commerce", size="S", body=4, depth=18, wall_h=24,
                      exterior=bike_exterior, door_kind="sliding",
                      interior=dict(theme=shop_theme("teal"), floors=[dict(name="1F", grid=SHOP_1F)])),
    "flower-shop": dict(name="Flower Shop", category="Commerce", size="S", body=4, depth=18, wall_h=24,
                        exterior=flower_exterior, door_kind="swing",
                        interior=dict(theme=shop_theme("pink"), floors=[dict(name="1F", grid=SHOP_1F)])),
    "fan-club": dict(name="Pokemon Fan Club", category="Residential", size="S", body=4, depth=18, wall_h=24,
                     exterior=badge_house("pink", heart(7), {1: IO, 2: (246, 136, 182), 3: (255, 220, 236)}),
                     door_kind="swing",
                     interior=dict(theme=shop_theme("pink"), floors=[dict(name="1F", grid=SHOP_1F)])),
    "name-rater": dict(name="Name Rater", category="Residential", size="S", body=4, depth=18, wall_h=24,
                       exterior=badge_house("purple", star(7), {1: IO, 2: (252, 220, 96), 3: (255, 246, 190)}, door_tile=2),
                       door_kind="swing",
                       interior=dict(theme=shop_theme("purple"), floors=[dict(name="1F", grid=SHOP_1F)])),
    "trick-house": dict(name="Trick House", category="Entertainment", size="S", body=4, depth=18, wall_h=24,
                        exterior=trick_exterior, door_kind="swing",
                        interior=dict(theme=shop_theme("purple"), floors=[dict(name="1F", grid=SHOP_1F)])),
    "day-care": dict(name="Day Care", category="Civic", size="M", body=6, x_off=1, depth=18, wall_h=24,
                     exterior=daycare_exterior, door_kind="swing",
                     interior=dict(theme=shop_theme("orange", [WOODW[0], WOODW[1], WOODW[2], WOODW[3], WOODW[4]]),
                                   floors=[dict(name="1F", grid=DAYCARE_1F)])),
}
