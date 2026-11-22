"""Three multi-floor cave designs (A, B, C) drawn as schematics by cave_mock.py.

Mock data, not game maps. Each floor is carved from solid rock with a few ops
(blob, room, tunnel, water, crack, ...), and the features sit on top (ladders,
holes, boulders, items, trainers). The rules behind each layout are in
docs/explanation/research/gen3-caves.md §5-§6.

    python3 tools/maps/cave_mock.py --variant a     # renders tmp/cave-mocks/variant-a.png

Coordinates are Mons cells (16 px, the camera shows 40 x 22). `level` orders the
floors: 1F = 0, B1F = -1, 2F = 1. A hole drops to the floor one level down at the
same (x, y) (pret: warphole keeps the player's coordinates).

Ops:
  ("blob", cx, cy, rx, ry)            organic chamber (ellipse with a wobbly rim)
  ("room", x, y, w, h)                rectangle with cut corners
  ("tunnel", [(x, y), ...], width)    corridor along a polyline
  ("pillar", cx, cy, rx, ry)          rock left standing inside a chamber
  ("water", cx, cy, rx, ry)           still water (Surf)
  ("crack", x, y, w, h)               cracked floor (on carved floor only): a slow step breaks it, you fall
  ("ledge", x0, x1, y)                one-way ledge row, jumped southward
  ("stairs", x, y, w, h)              rock stairs between two heights (walkable)
  ("smash", x, y, w, h)               Rock Smash rocks
  ("barrier", x, y, w, h, id)         rock barrier that opens when switch `id` is pressed
Features:
  ("ladder", id, x, y)  ("hole", id, x, y)  ("boulder", id, x, y)  ("switch", id, x, y)
  ("item", x, y)  ("hidden", x, y)  ("fossil", x, y)  ("trainer", x, y, facing, sight)
  ("npc", x, y, label)  ("legend", x, y, label)  ("entrance", x, y, label)  ("exit", x, y, label)
`route` (optional): waypoints the main path must visit in order (the cell behind each boulder).
"""

VARIANTS = {}

# --------------------------------------------------------------------------------------------
# A. "Hang Nguyệt Thạch": Mt. Moon pattern. A through-cave between two routes. 1F is one big
# connected floor with a loop; B1F is only ladder pockets (no floor of its own); B2F holds the
# fossil chamber and the way out. Ladders stack at the same (x, y) on every floor.
# --------------------------------------------------------------------------------------------
VARIANTS["a"] = dict(
    title="A · Hang Nguyệt Thạch (kiểu Mt. Moon)",
    concept=("Hang xuyên núi nối hai Route: 1F rộng có vòng lặp, B1F chỉ là các túi thang, B2F có phòng "
             "hoá thạch và lối ra."),
    floors=[
        dict(name="1F", level=0, w=88, h=52, dark=False, ops=[
            ("tunnel", [(45, 51), (45, 40)], 4),                       # entrance from the south route
            ("blob", 44, 34, 14, 8),                                     # main hall
            ("pillar", 39, 32, 2, 1), ("pillar", 51, 37, 2, 2),
            ("tunnel", [(31, 34), (14, 34)], 3),                         # west branch
            ("blob", 13, 37, 8, 7),
            ("tunnel", [(12, 30), (12, 9)], 3),                          # up to the NW ladder
            ("blob", 12, 7, 6, 4),
            ("tunnel", [(44, 27), (44, 14)], 4),                         # main way north
            ("blob", 44, 9, 10, 5),
            ("tunnel", [(54, 9), (74, 9), (74, 20)], 3),                 # NE corridor: closes the loop
            ("tunnel", [(57, 35), (68, 35)], 3),                         # east branch
            ("blob", 75, 30, 9, 10),
            ("pillar", 74, 31, 2, 2),
        ], features=[
            ("entrance", 45, 51, "Route 6"),
            ("trainer", 45, 20, "W", 3),
            ("npc", 47, 46, "Hiker"),
            ("hidden", 35, 40),
            ("trainer", 23, 34, "E", 5), ("item", 9, 41),
            ("trainer", 12, 18, "S", 5),
            ("ladder", 1, 10, 6),
            ("ladder", 2, 44, 7),
            ("trainer", 64, 9, "W", 6),
            ("trainer", 64, 35, "W", 4),
            ("ladder", 3, 79, 24), ("item", 81, 37),
        ]),
        dict(name="B1F", level=-1, w=88, h=52, dark=False, ops=[
            ("blob", 12, 8, 6, 4),                                       # pocket 1: 1F NW -> B2F west
            ("blob", 44, 9, 6, 4),                                       # pocket 2: the main way down
            ("tunnel", [(44, 12), (44, 20), (30, 20), (30, 24)], 3),
            ("blob", 29, 24, 4, 3),
            ("blob", 79, 27, 6, 5),                                      # pocket 3: dead end, reward
            ("blob", 68, 44, 8, 4),                                      # pocket 4: the way out
            ("tunnel", [(74, 44), (87, 44)], 4),
        ], features=[
            ("ladder", 1, 10, 6), ("ladder", 4, 14, 10),
            ("ladder", 2, 44, 7), ("ladder", 5, 30, 24), ("item", 32, 20),
            ("ladder", 3, 79, 24), ("npc", 75, 28, "Hiker (TM)"), ("item", 83, 30),
            ("ladder", 6, 64, 44), ("exit", 87, 44, "Route 7"),
        ]),
        dict(name="B2F", level=-2, w=88, h=52, dark=False, ops=[
            ("blob", 15, 14, 8, 6),                                      # west area (from ladder 4)
            ("tunnel", [(14, 19), (14, 32), (24, 32)], 3),
            ("ledge", 12, 16, 26),                                       # one way down into the fossil room
            ("blob", 34, 30, 12, 8),                                     # fossil chamber
            ("pillar", 41, 33, 1, 1),
            ("tunnel", [(45, 32), (56, 32), (56, 44), (62, 44)], 3),
            ("blob", 64, 44, 6, 4),
            ("tunnel", [(56, 32), (56, 14), (60, 12)], 3),               # side branch north-east
            ("blob", 66, 11, 8, 5),
        ], features=[
            ("ladder", 4, 14, 10), ("trainer", 19, 15, "W", 4), ("item", 9, 17),
            ("ladder", 5, 30, 24),
            ("trainer", 34, 26, "S", 3), ("fossil", 32, 30), ("fossil", 36, 30),
            ("trainer", 52, 32, "W", 4),
            ("ladder", 6, 64, 44),
            ("trainer", 61, 13, "E", 4), ("item", 71, 9), ("hidden", 70, 14),
        ]),
    ],
    links=dict(ladder={1: ("1F", "B1F"), 2: ("1F", "B1F"), 3: ("1F", "B1F"), 4: ("B1F", "B2F"),
                       5: ("B1F", "B2F"), 6: ("B1F", "B2F")}),
)

# --------------------------------------------------------------------------------------------
# B. "Động Đá Hoa": Granite Cave pattern. A dead-end cave that ends in a story chamber. 1F is
# lit by the mouth, B1F and B2F are dark (Flash). B1F's cracked floor is a risky shortcut: a
# slow step drops you into a sealed B2F pocket with an item and a ladder back. A hole at a dead
# end drops into a second pocket. B1F and B2F are the same size, so every link stacks.
# --------------------------------------------------------------------------------------------
VARIANTS["b"] = dict(
    title="B · Động Đá Hoa (kiểu Granite Cave)",
    concept=("Hang cụt 4 tầng kết thúc ở phòng cốt truyện: B1F-B2F tối, sàn nứt là đường tắt mạo hiểm, "
             "hố rơi xuống túi có phần thưởng."),
    floors=[
        dict(name="1F", level=0, w=84, h=30, dark=False, ops=[
            ("tunnel", [(70, 29), (70, 21)], 4),
            ("tunnel", [(80, 20), (8, 20)], 4),                          # long gallery under the cliff
            ("blob", 62, 19, 6, 4), ("blob", 36, 20, 7, 5),
            ("pillar", 36, 20, 2, 1),
            ("tunnel", [(16, 18), (16, 8)], 3), ("blob", 16, 7, 5, 3),
            ("tunnel", [(50, 18), (50, 8)], 3), ("blob", 50, 7, 6, 3),
            ("tunnel", [(56, 7), (72, 7)], 3), ("blob", 77, 8, 5, 4),
            ("tunnel", [(77, 11), (77, 18)], 3),
            ("ledge", 75, 79, 15),                                       # NE loop returns one way
            ("blob", 6, 20, 4, 5),
        ], features=[
            ("entrance", 70, 29, "Route 12"),
            ("npc", 63, 18, "Hiker (Flash)"),
            ("item", 49, 6), ("item", 80, 6), ("trainer", 64, 7, "W", 5),
            ("ladder", 1, 16, 6),
            ("npc", 5, 19, "Bia đá"), ("hidden", 4, 23),
        ]),
        dict(name="B1F", level=-1, w=64, h=52, dark=True, ops=[
            ("blob", 16, 9, 7, 5),
            ("tunnel", [(22, 9), (30, 9), (30, 15)], 3),
            ("blob", 36, 24, 13, 9),                                     # chamber with the cracked field
            ("crack", 32, 14, 12, 22),                                  # a band across the chamber
            ("tunnel", [(46, 24), (54, 24)], 3),
            ("blob", 57, 23, 5, 4),
            ("tunnel", [(14, 14), (14, 42), (57, 42), (57, 27)], 3),     # the long dark way round
            ("tunnel", [(14, 42), (14, 46), (6, 46)], 3),
        ], features=[
            ("ladder", 1, 16, 6),
            ("trainer", 30, 42, "W", 4), ("item", 59, 21),
            ("ladder", 2, 58, 24),
            ("ladder", 3, 27, 24),
            ("hole", 1, 6, 46),
            ("trainer", 14, 30, "S", 4),
            ("ladder", 5, 8, 46),
        ]),
        dict(name="B2F", level=-2, w=64, h=52, dark=True, ops=[
            ("blob", 37, 24, 14, 11),                                    # sealed fall pocket under the field
            ("blob", 59, 25, 4, 6),
            ("tunnel", [(58, 30), (58, 44), (16, 44), (16, 38)], 3),
            ("tunnel", [(34, 44), (34, 49), (39, 49)], 3), ("smash", 33, 46, 3, 1),
            ("blob", 44, 49, 4, 1),
            ("blob", 15, 35, 5, 4),
            ("blob", 6, 46, 3, 3),                                       # hole pocket
        ], features=[
            ("ladder", 3, 27, 24), ("item", 37, 29), ("hidden", 44, 20),
            ("ladder", 2, 58, 24), ("trainer", 50, 44, "W", 5),
            ("item", 45, 49),
            ("ladder", 4, 15, 33),
            ("item", 5, 45), ("ladder", 5, 8, 46),
        ]),
        dict(name="B3F", level=-3, w=40, h=30, dark=False, ops=[
            ("blob", 20, 16, 15, 10),
            ("pillar", 12, 12, 2, 2), ("pillar", 28, 12, 2, 2), ("pillar", 12, 21, 2, 1), ("pillar", 28, 21, 2, 1),
            ("water", 20, 9, 5, 2),
            ("tunnel", [(20, 25), (20, 28)], 3),
        ], features=[
            ("ladder", 4, 20, 27),
            ("legend", 20, 13, "Phòng cổ"),
            ("npc", 24, 20, "Nhà nghiên cứu"), ("item", 8, 16),
        ]),
    ],
    links=dict(ladder={1: ("1F", "B1F"), 2: ("B1F", "B2F"), 3: ("B2F", "B1F"), 4: ("B2F", "B3F"),
                       5: ("B2F", "B1F")}),
)

# --------------------------------------------------------------------------------------------
# C. "Đường Chiến Thắng": Victory Road pattern. A through-cave with Strength puzzles. 1F: push a
# boulder onto a switch to open a barrier. 2F: a ring around a rock massif (a loop) with a ledge
# making it one-way on the west side. 3F: push a boulder into a hole; it lands on 2F's sealed
# switch and opens the barrier to the exit. Two ladders join 2F and 3F (a second loop).
# --------------------------------------------------------------------------------------------
VARIANTS["c"] = dict(
    title="C · Đường Chiến Thắng (kiểu Victory Road)",
    concept=("Hang xuyên 3 tầng với câu đố Strength: đẩy đá lên công tắc (1F), đẩy đá xuống hố để nó rơi "
             "lên công tắc tầng dưới (3F → 2F)."),
    floors=[
        dict(name="1F", level=0, w=96, h=44, dark=False, ops=[
            ("tunnel", [(20, 43), (20, 34)], 4),
            ("blob", 23, 30, 10, 5),
            ("tunnel", [(30, 27), (30, 12)], 3),
            ("blob", 22, 9, 8, 4),
            ("tunnel", [(32, 31), (64, 31)], 3),
            ("barrier", 52, 30, 1, 3, 1),
            ("blob", 73, 29, 12, 7),
            ("smash", 72, 21, 3, 1),
            ("tunnel", [(73, 22), (73, 13)], 3), ("blob", 73, 11, 5, 3),
        ], features=[
            ("entrance", 20, 43, "Route 22"),
            ("boulder", 1, 30, 24), ("switch", 1, 30, 14),
            ("trainer", 22, 9, "S", 4), ("item", 16, 8),
            ("trainer", 62, 31, "W", 5), ("trainer", 78, 33, "N", 4),
            ("ladder", 1, 82, 27),
            ("item", 73, 10), ("hidden", 68, 34),
        ]),
        dict(name="2F", level=1, w=96, h=44, dark=False, ops=[
            ("tunnel", [(20, 9), (76, 9)], 4),                           # the ring round the massif
            ("tunnel", [(20, 9), (20, 36)], 4),
            ("tunnel", [(20, 36), (76, 36)], 4),
            ("tunnel", [(76, 9), (76, 36)], 4),
            ("ledge", 18, 22, 22),                                       # west side runs one way (south)
            ("stairs", 46, 34, 4, 4),
            ("blob", 60, 21, 5, 2),                                      # sealed switch alcove
            ("blob", 83, 26, 7, 5),
            ("tunnel", [(76, 9), (86, 9)], 4), ("blob", 88, 10, 5, 4),
            ("barrier", 81, 7, 1, 4, 2),
            ("tunnel", [(90, 10), (95, 10)], 4),
            ("tunnel", [(20, 9), (10, 9)], 3), ("blob", 8, 9, 4, 3),
        ], features=[
            ("ladder", 1, 82, 27),
            ("ladder", 2, 24, 10), ("ladder", 3, 72, 34),
            ("switch", 2, 60, 20), ("ladder", 4, 64, 22),
            ("trainer", 40, 9, "E", 5), ("trainer", 56, 36, "W", 5), ("trainer", 76, 18, "S", 5),
            ("trainer", 30, 36, "E", 4),
            ("item", 6, 9), ("hidden", 48, 36),
            ("exit", 95, 10, "Liên Minh"),
        ]),
        dict(name="3F", level=1 + 1, w=96, h=44, dark=False, ops=[
            ("blob", 24, 12, 8, 5),
            ("tunnel", [(24, 16), (24, 30), (56, 30)], 3),
            ("blob", 60, 24, 8, 7),
            ("tunnel", [(66, 30), (72, 32)], 3), ("blob", 72, 33, 5, 4),
            ("tunnel", [(16, 12), (8, 12), (8, 26)], 3),
            ("blob", 11, 27, 4, 2),
            ("water", 12, 33, 6, 4),
            ("blob", 12, 35, 2, 1),                                      # island in the pool (Surf branch)
        ], features=[
            ("ladder", 2, 24, 10), ("trainer", 30, 13, "W", 5),
            ("trainer", 40, 30, "W", 6),
            ("boulder", 2, 60, 26), ("hole", 1, 60, 20),
            ("ladder", 4, 64, 22),
            ("ladder", 3, 72, 34), ("trainer", 67, 26, "S", 4),
            ("item", 12, 35), ("item", 70, 35),
        ]),
    ],
    links=dict(ladder={1: ("1F", "2F"), 2: ("2F", "3F"), 3: ("2F", "3F"), 4: ("2F", "3F")}),
    route=[("1F", 30, 25), ("3F", 60, 27)],          # stand behind each boulder, in order, then the exit
)

# ============================================================================================
# Regional caves D-I: one per District that had no cave yet, each built around ONE signature
# mechanic from the research (gen3-caves.md §2.5), so no two feel alike. Where each entrance
# sits on the world map, the concept and the pieces each needs: docs/explanation/cave-regions.md.
# Extra ops / features these use (cave_mock.py draws and checks them):
#   ("lava", cx, cy, rx, ry)  ("lavaflow", [(x, y), ...], width)   lava: never walkable
#   ("ice", x, y, w, h)       ("crystal", (x, y), ...)             ice slides you until something stops you
#   ("tide", x, y, w, h)      sand at low tide, water (Surf) at high tide
#   ("sunk", x, y, w, h)      low-tide passage, flooded to the roof at high tide
#   ("shelf", x, y, w, h)     rock shelf, reachable only from water (a Surfer at high tide)
#   ("rail", [(x, y), ...])   one-way minecart: board at the first point, get off at the last
#   ("gate", x, y, w, h, bit, open_when)  electric gate, open while lever `bit` is 0 or 1
#   ("vine", x, y, w, h)      vines (Cut)
#   ("jump", x, y, w, h, dir) one-way ledge jumped toward N / S / E / W
#   ("fill", id, x, y)        the lava cell boulder `id` is pushed into: it becomes floor
#   ("lever", bit, x, y)      flips every gate with that bit
#   ("lamp", x, y, radius)    generator light on a dark floor (drawing only)
#   ("deco", x, y, kind)      vent | ore | mirror | flower (drawing only)
# `goal: "legend"` makes the story chamber the goal even when the cave also has an exit.
# ============================================================================================

# --------------------------------------------------------------------------------------------
# D. "Hầm Dung Nham" (volcano): a late through-cave in the corner between Route 4 (entrance,
# south) and Route 4b (exit, west), a shortcut round Cinder City. Lava rivers cut every corridor;
# a Strength boulder pushed into the lava fills one cell and makes a crossing (Victory Road idea,
# the former variant C puzzle, here with lava). Two routes reach B1F's west hall (1F boulder, or
# ladder 2 + B1F boulder 2): a loop. Boulder 3 is on both routes. B2F is the magma core: rewards.
# --------------------------------------------------------------------------------------------
VARIANTS["d"] = dict(
    title="D · Hầm Dung Nham (núi lửa · Strength + dung nham)",
    concept=("Hang xuyên cuối game giữa Route 4 và Route 4b: sông dung nham cắt mọi hành lang, đẩy tảng đá "
             "Strength xuống dung nham để lấp thành lối; hai đường tới sảnh tây B1F tạo vòng lặp."),
    floors=[
        dict(name="1F", level=0, w=96, h=44, dark=False, ops=[
            ("tunnel", [(72, 43), (72, 36)], 4),                         # entrance from Route 4
            ("blob", 70, 30, 11, 6), ("pillar", 66, 28, 2, 1),
            ("lava", 76, 33, 3, 1),
            ("tunnel", [(60, 30), (22, 30)], 3),                         # the lava corridor west
            ("blob", 44, 30, 4, 7),                                      # river gallery
            ("blob", 20, 30, 8, 6),                                      # west hall
            ("tunnel", [(76, 25), (76, 10)], 3),                         # NE branch
            ("blob", 78, 8, 8, 4),
            ("tunnel", [(86, 8), (92, 8)], 3), ("smash", 88, 7, 1, 3),
            ("blob", 14, 8, 8, 4),                                       # NW exit pocket (from B1F only)
            ("tunnel", [(8, 8), (0, 8)], 3),
            ("lavaflow", [(44, 2), (44, 42)], 1),                        # river: one cell deep at the corridor
        ], features=[
            ("entrance", 72, 43, "Route 4"),
            ("trainer", 64, 33, "N", 4), ("deco", 74, 27, "vent"), ("deco", 62, 30, "vent"),
            ("boulder", 1, 50, 30), ("fill", 1, 44, 30),
            ("trainer", 30, 30, "E", 5),
            ("ladder", 1, 16, 26), ("item", 14, 32), ("deco", 24, 34, "vent"),
            ("trainer", 24, 27, "S", 4),
            ("trainer", 76, 18, "S", 5), ("ladder", 2, 82, 8), ("item", 72, 6), ("item", 92, 8),
            ("ladder", 3, 18, 6), ("hidden", 11, 10),
            ("exit", 0, 8, "Route 4b"),
        ]),
        dict(name="B1F", level=-1, w=96, h=44, dark=False, ops=[
            ("blob", 80, 10, 9, 5),                                      # east area (ladder 2)
            ("tunnel", [(80, 15), (80, 30)], 3), ("blob", 78, 32, 8, 6),
            ("lava", 74, 34, 2, 2),
            ("tunnel", [(72, 10), (56, 10), (56, 28), (24, 28)], 3),     # the long way west
            ("blob", 18, 28, 7, 5),                                      # west hall (ladder 1)
            ("tunnel", [(18, 23), (18, 8)], 3), ("blob", 20, 7, 6, 3),   # north to the exit ladder
            ("blob", 40, 28, 4, 7), ("blob", 18, 17, 6, 2),              # river galleries
            ("lavaflow", [(40, 20), (40, 40)], 1),
            ("lavaflow", [(2, 17), (40, 17)], 1),
        ], features=[
            ("ladder", 2, 82, 8), ("trainer", 70, 10, "W", 5), ("deco", 86, 12, "vent"),
            ("trainer", 80, 22, "S", 4), ("ladder", 4, 84, 34), ("item", 75, 37),
            ("trainer", 56, 18, "N", 4),
            ("boulder", 2, 46, 28), ("fill", 2, 40, 28),
            ("ladder", 1, 16, 26), ("trainer", 22, 30, "W", 4), ("hidden", 14, 31),
            ("boulder", 3, 18, 21), ("fill", 3, 18, 17),
            ("ladder", 3, 18, 6), ("item", 24, 6),
        ]),
        dict(name="B2F", level=-2, w=40, h=30, dark=False, ops=[
            ("blob", 20, 15, 15, 10),
            ("lava", 18, 11, 8, 3),
            ("blob", 18, 11, 2, 1),                                      # an island in the lava lake
            ("room", 16, 11, 5, 2),
            ("pillar", 8, 20, 2, 2),
            ("tunnel", [(30, 22), (36, 26)], 3),
            ("smash", 33, 24, 2, 1),
            ("blob", 37, 27, 2, 2),
        ], features=[
            ("ladder", 4, 28, 21), ("trainer", 22, 22, "W", 5),
            ("boulder", 4, 18, 18), ("fill", 4, 18, 13),                 # optional: a bridge to the island
            ("legend", 30, 10, "Lõi núi"),
            ("npc", 8, 14, "Nhà địa chất (Đá Lửa)"), ("item", 18, 11),
            ("item", 37, 27), ("hidden", 6, 16),
            ("deco", 26, 18, "vent"), ("deco", 12, 18, "vent"),
        ]),
    ],
    links=dict(ladder={1: ("1F", "B1F"), 2: ("1F", "B1F"), 3: ("B1F", "1F"), 4: ("B1F", "B2F")}),
    route=[("B1F", 18, 22)],                         # boulder 3 is on every way to the exit
)

# --------------------------------------------------------------------------------------------
# E. "Mỏ Đá Bỏ Hoang" (quarry): a mid-game through-mine under the hills south of Route 5
# (entrance, north edge) that comes out in Flint City's west quarter (exit, east edge). B1F is a
# connector floor of three pockets joined ONLY by one-way minecarts: pick the right cart. Cart A
# runs to a pocket whose ladder climbs back to the entrance hall (a loop); cart B runs on. On 1F a
# third cart takes you from the exit pocket back to the entrance hall (shortcut home). Rock Smash
# gates the side galleries with ore pockets; B2F is the old ore vault (rewards).
# --------------------------------------------------------------------------------------------
VARIANTS["e"] = dict(
    title="E · Mỏ Đá Bỏ Hoang (mỏ đá · xe goòng một chiều)",
    concept=("Hang xuyên giữa game từ Route 5 xuống Flint City: tầng B1F chỉ là các túi nối bằng xe goòng "
             "một chiều, chọn đúng xe để đi tiếp; Rock Smash mở các nhánh có mạch quặng."),
    floors=[
        dict(name="1F", level=0, w=88, h=48, dark=False, ops=[
            ("tunnel", [(30, 0), (30, 8)], 4),                           # entrance from Route 5
            ("blob", 30, 14, 10, 6), ("pillar", 26, 13, 2, 1),
            ("tunnel", [(20, 14), (10, 14), (10, 30)], 3),               # west gallery
            ("blob", 12, 34, 7, 5),
            ("tunnel", [(40, 14), (52, 14)], 3), ("smash", 46, 13, 1, 3),
            ("blob", 56, 14, 4, 3),
            ("blob", 72, 32, 10, 7),                                     # exit pocket (from B1F only)
            ("tunnel", [(82, 32), (87, 32)], 3),
            ("rail", [(66, 26), (66, 22), (36, 22), (36, 20)]),          # cart home: exit pocket -> hall
        ], features=[
            ("entrance", 30, 0, "Route 5"),
            ("trainer", 22, 16, "E", 4), ("npc", 34, 10, "Thợ mỏ"), ("ladder", 3, 34, 16), ("deco", 38, 12, "ore"),
            ("trainer", 10, 22, "S", 5), ("ladder", 1, 12, 36), ("item", 6, 34),
            ("item", 57, 14), ("deco", 58, 12, "ore"), ("hidden", 55, 16),
            ("ladder", 2, 74, 34), ("trainer", 78, 30, "W", 4),
            ("exit", 87, 32, "Flint City"),
        ]),
        dict(name="B1F", level=-1, w=88, h=48, dark=False, ops=[
            ("blob", 13, 37, 7, 5),                                      # P1: ladder 1, two carts
            ("blob", 32, 18, 6, 4),                                      # P2: dead end, ladder back up
            ("blob", 68, 36, 11, 6),                                     # P3: the way on
            ("tunnel", [(68, 30), (68, 20)], 3), ("smash", 67, 26, 3, 1),
            ("blob", 68, 16, 6, 4),
            ("rail", [(18, 33), (18, 18), (26, 18)]),                    # cart A -> P2
            ("rail", [(12, 41), (12, 45), (50, 45), (50, 38), (57, 38)]),   # cart B -> P3
        ], features=[
            ("ladder", 1, 12, 36), ("item", 8, 38),
            ("ladder", 3, 34, 16), ("item", 36, 20), ("trainer", 31, 21, "N", 3),
            ("trainer", 62, 36, "E", 4), ("trainer", 72, 40, "W", 4),
            ("ladder", 2, 74, 34), ("ladder", 4, 64, 39),
            ("item", 70, 14), ("deco", 64, 15, "ore"), ("hidden", 72, 17),
        ]),
        dict(name="B2F", level=-2, w=36, h=26, dark=False, ops=[
            ("blob", 18, 13, 14, 9),
            ("pillar", 12, 10, 2, 2), ("pillar", 24, 15, 2, 1),
            ("smash", 6, 15, 1, 3), ("blob", 3, 16, 2, 3),
        ], features=[
            ("ladder", 4, 18, 18), ("legend", 22, 8, "Hầm quặng cũ"),
            ("npc", 26, 10, "Thợ mỏ già (TM)"), ("trainer", 14, 16, "E", 4),
            ("item", 3, 16), ("hidden", 28, 18), ("item", 9, 6),
            ("deco", 16, 6, "ore"), ("deco", 30, 12, "ore"), ("deco", 8, 18, "ore"),
        ]),
    ],
    links=dict(ladder={1: ("1F", "B1F"), 2: ("B1F", "1F"), 3: ("B1F", "1F"), 4: ("B1F", "B2F")}),
)

# --------------------------------------------------------------------------------------------
# F. "Động Băng Tinh Tú" (mystic): a dead-end crystal ice cave under the hills south of Route 15
# (entrance, north edge), ending in the star chamber where a meteor fell. Ice floors (Shoal Cave
# Ice Room, Ice Path): you slide until a crystal or the wall stops you. 1F teaches it on a small
# rink (5 slides); B1F's big rink (9 slides) guards the way down. After the rink a one-way ledge
# drops east to a reward area whose ladder climbs back to 1F: a one-way loop home. Rinks were
# solved by search (shortest solution, no shorter one exists): cave_mock.py re-checks them.
# --------------------------------------------------------------------------------------------
VARIANTS["f"] = dict(
    title="F · Động Băng Tinh Tú (huyền bí · trượt băng)",
    concept=("Hang cụt dưới đồi phía nam Route 15: sàn băng trượt tới khi gặp tinh thể; 1F dạy luật trên sân "
             "nhỏ, B1F có sân lớn chặn lối xuống phòng Sao Rơi; gờ một chiều mở vòng về."),
    goal="legend",
    floors=[
        dict(name="1F", level=0, w=80, h=44, dark=False, ops=[
            ("tunnel", [(40, 0), (40, 8)], 4),                           # entrance from Route 15
            ("blob", 40, 12, 10, 5), ("pillar", 44, 11, 2, 1),
            ("tunnel", [(30, 12), (14, 12), (14, 17)], 3),
            ("tunnel", [(14, 17), (14, 21)], 1),                         # one cell onto the rink
            ("room", 12, 22, 12, 8), ("ice", 12, 22, 12, 8),             # teaching rink
            ("crystal", (12, 24), (14, 28), (17, 25), (18, 27), (22, 26)),
            ("tunnel", [(21, 30), (21, 35)], 1),
            ("blob", 21, 37, 5, 3),
            ("tunnel", [(50, 12), (66, 12), (66, 24)], 3),               # east gallery
            ("blob", 66, 29, 8, 5),
        ], features=[
            ("entrance", 40, 0, "Route 15"),
            ("npc", 36, 14, "Cô bé (luật băng)"), ("deco", 46, 15, "mirror"), ("deco", 33, 9, "mirror"),
            ("trainer", 22, 12, "E", 5),
            ("ladder", 1, 21, 37), ("item", 18, 38),
            ("trainer", 60, 12, "W", 5), ("ladder", 2, 66, 30), ("item", 71, 32), ("deco", 61, 27, "mirror"),
            ("hidden", 72, 26),
        ]),
        dict(name="B1F", level=-1, w=80, h=44, dark=False, ops=[
            ("blob", 21, 37, 5, 3),                                      # ladder 1 pocket
            ("tunnel", [(21, 34), (21, 8), (33, 8)], 3),
            ("tunnel", [(33, 8), (33, 13)], 1),
            ("room", 30, 14, 20, 14), ("ice", 30, 14, 20, 14),           # the big rink
            ("crystal", (30, 18), (31, 18), (36, 23), (37, 15), (38, 17), (38, 20), (39, 25), (40, 27), (41, 20),
             (44, 26), (45, 14), (45, 26), (46, 19), (49, 18)),
            ("tunnel", [(46, 28), (46, 34)], 1),
            ("blob", 48, 36, 6, 4),                                      # after the rink
            ("tunnel", [(54, 36), (62, 36)], 3), ("jump", 57, 35, 1, 3, "E"),
            ("blob", 66, 30, 8, 7),                                      # reward area (ladder 2 up)
        ], features=[
            ("ladder", 1, 21, 37), ("trainer", 21, 24, "S", 5), ("item", 26, 6),
            ("deco", 28, 10, "mirror"), ("deco", 56, 31, "mirror"),
            ("ladder", 3, 48, 38), ("trainer", 52, 34, "W", 4),
            ("ladder", 2, 66, 30), ("item", 70, 34), ("hidden", 61, 26), ("trainer", 68, 25, "S", 4),
        ]),
        dict(name="B2F", level=-2, w=36, h=26, dark=False, ops=[
            ("blob", 18, 12, 14, 9),
            ("pillar", 10, 8, 2, 2), ("pillar", 26, 8, 2, 2),
            ("water", 18, 7, 4, 2),
            ("tunnel", [(18, 20), (18, 24)], 3),
        ], features=[
            ("ladder", 3, 18, 23), ("legend", 18, 12, "Phòng Sao Rơi"),
            ("npc", 24, 16, "Nhà thiên văn"), ("item", 7, 14), ("hidden", 29, 14),
            ("deco", 12, 16, "mirror"), ("deco", 24, 10, "mirror"),
        ]),
    ],
    links=dict(ladder={1: ("1F", "B1F"), 2: ("1F", "B1F"), 3: ("B1F", "B2F")}),
)

# --------------------------------------------------------------------------------------------
# G. "Hang Triều Lam" (lagoon): a dead-end sea cave on the east islet of Route 8 (Surf there,
# entrance on the islet's north shore), ending in the pearl grotto. The tide follows the game
# clock (Shoal Cave: high 00-02, 09-14, 21-23 h; set when you walk in from outside). The same
# rooms in two states: at LOW tide the basins are sand and the sunken passages are open; at HIGH
# tide the basins are water (Surf) and you can Surf up onto the rock shelves. The main way works
# at both tides; each tide opens its own rewards, and the low-tide passage is a second way down
# (a loop that only exists at low tide). Come back at the other tide = a reason to revisit.
# --------------------------------------------------------------------------------------------
VARIANTS["g"] = dict(
    title="G · Hang Triều Lam (đầm biển · thuỷ triều)",
    concept=("Hang cụt trên đảo đông Route 8: theo giờ trong game, triều thấp lộ bãi cát và hầm ngầm, triều "
             "cao ngập bãi (Surf) và nước dâng tới các thềm đá; mỗi mức triều mở phần thưởng riêng."),
    goal="legend",
    floors=[
        dict(name="1F", level=0, w=80, h=44, dark=False, ops=[
            ("tunnel", [(40, 43), (40, 36)], 4),                         # entrance from the Route 8 islet
            ("blob", 40, 33, 9, 4),
            ("tunnel", [(40, 29), (40, 25)], 4),
            ("blob", 40, 17, 22, 8),                                     # the tidal basin
            ("blob", 40, 5, 8, 3),                                       # dry landing (ladder 1)
            ("tunnel", [(40, 7), (40, 12)], 4),
            ("tunnel", [(62, 20), (72, 20), (72, 30)], 3),               # low-tide passage east
            ("blob", 72, 33, 6, 4),
            ("shelf", 18, 14, 4, 4), ("shelf", 55, 12, 3, 3),            # shelves: Surf up at high tide
            ("tide", 16, 10, 48, 15),
            ("sunk", 63, 18, 9, 5),
        ], features=[
            ("entrance", 40, 43, "Route 8 (đảo)"),
            ("npc", 45, 33, "Ngư dân (lịch triều)"), ("hidden", 33, 34),
            ("trainer", 30, 18, "E", 5), ("trainer", 52, 14, "W", 5),
            ("item", 19, 15), ("item", 56, 13),
            ("ladder", 1, 40, 4), ("item", 46, 4),
            ("ladder", 3, 72, 34), ("item", 76, 35),
        ]),
        dict(name="B1F", level=-1, w=80, h=44, dark=False, ops=[
            ("blob", 40, 6, 8, 4),
            ("tunnel", [(40, 10), (40, 20)], 3),
            ("blob", 40, 25, 13, 6),                                     # central grotto with a tide pool
            ("shelf", 37, 20, 5, 2),
            ("tide", 33, 22, 16, 6),
            ("tunnel", [(28, 25), (12, 25), (12, 34)], 3),
            ("blob", 12, 37, 6, 4),
            ("tunnel", [(72, 30), (60, 32), (52, 28)], 3),               # from the low-tide ladder 3
            ("blob", 72, 33, 6, 4),
            ("tunnel", [(50, 20), (60, 12)], 3), ("blob", 64, 10, 5, 3),
            ("sunk", 51, 13, 9, 7),
        ], features=[
            ("ladder", 1, 40, 4), ("trainer", 40, 14, "S", 4),
            ("item", 39, 20), ("trainer", 50, 29, "W", 5),
            ("trainer", 20, 25, "E", 5), ("ladder", 2, 12, 38),
            ("ladder", 3, 72, 34),
            ("item", 66, 9), ("hidden", 62, 12),
        ]),
        dict(name="B2F", level=-2, w=36, h=24, dark=False, ops=[
            ("blob", 18, 11, 14, 8),
            ("water", 18, 8, 6, 3),
            ("blob", 18, 7, 2, 1),
            ("tunnel", [(18, 18), (18, 22)], 3),
        ], features=[
            ("ladder", 2, 18, 21), ("legend", 18, 7, "Hang Ngọc Trai"),
            ("npc", 26, 13, "Cô gái lặn"), ("item", 7, 12), ("hidden", 29, 9), ("trainer", 12, 15, "E", 4),
        ]),
    ],
    links=dict(ladder={1: ("1F", "B1F"), 2: ("B1F", "B2F"), 3: ("1F", "B1F")}),
)

# --------------------------------------------------------------------------------------------
# H. "Đường Hầm Điện Ngầm" (powerplant): a through-tunnel from the power-plant yard in Hub City's
# north-east quarter (entrance, 1F pump room) to the outfall on the Route 7 shore (exit, B1F
# east edge). Electric gates and levers: every lever flips ALL gates of its number, some open and
# some close (Gen 4 Sunyshore idea on Gen 3 FR Victory Road switch logic). B1F is dark except the
# generator lamps (Flash helps); the levers all sit on the lit B2F (never two puzzles on a dark
# floor). Solution: L0 in the generator hall (G1 opens, G2 shuts behind you, so take ladder 3: a
# loop) -> through G1 -> ladder 4 -> pull L0 again to open G4 -> L1 -> G5 opens -> exit.
# --------------------------------------------------------------------------------------------
VARIANTS["h"] = dict(
    title="H · Đường Hầm Điện Ngầm (nhà máy điện · cần gạt + cổng điện)",
    concept=("Hang xuyên từ sân nhà máy điện Hub City ra cống xả Route 7: mỗi cần gạt đảo mọi cổng cùng số "
             "(cổng này mở thì cổng kia đóng); B1F tối, chỉ sáng quanh đèn máy phát."),
    floors=[
        dict(name="1F", level=0, w=36, h=24, dark=False, ops=[
            ("room", 4, 4, 28, 16),                                      # pump room
            ("tunnel", [(18, 19), (18, 23)], 4),
            ("water", 26, 9, 3, 2),
        ], features=[
            ("entrance", 18, 23, "Hub City"),
            ("npc", 14, 12, "Kỹ sư (cần gạt)"), ("ladder", 1, 8, 6), ("item", 29, 16), ("trainer", 22, 6, "W", 5),
        ]),
        dict(name="B1F", level=-1, w=88, h=44, dark=True, ops=[
            ("room", 4, 4, 20, 14),                                      # west hall
            ("tunnel", [(23, 10), (40, 10)], 3), ("gate", 31, 9, 1, 3, 0, 1),
            ("tunnel", [(27, 11), (27, 26), (44, 26)], 3), ("blob", 44, 27, 4, 3),   # ladder 3 pocket
            ("room", 40, 4, 22, 16),                                     # middle hall
            ("tunnel", [(61, 10), (87, 10)], 3), ("gate", 70, 9, 1, 3, 1, 1),
            ("room", 64, 18, 10, 8), ("tunnel", [(56, 19), (64, 21)], 3), ("smash", 62, 17, 1, 6),
        ], features=[
            ("ladder", 1, 10, 8), ("ladder", 2, 18, 14), ("lamp", 12, 10, 6), ("trainer", 20, 6, "W", 4),
            ("ladder", 3, 44, 26), ("lamp", 44, 26, 4), ("hidden", 46, 29),
            ("lamp", 50, 11, 7), ("trainer", 46, 8, "E", 5), ("trainer", 58, 14, "N", 4), ("ladder", 4, 56, 16),
            ("item", 70, 22), ("hidden", 72, 24),
            ("lamp", 80, 10, 4), ("exit", 87, 10, "Route 7 (cống xả)"),
        ]),
        dict(name="B2F", level=-2, w=88, h=44, dark=False, ops=[
            ("room", 6, 8, 18, 12), ("water", 10, 16, 3, 2),             # west room
            ("tunnel", [(23, 14), (36, 14)], 3), ("gate", 30, 13, 1, 3, 0, 0),
            ("room", 36, 6, 16, 22),                                     # generator hall
            ("room", 55, 6, 14, 20),                                     # east room (ladder 4)
            ("water", 62, 21, 5, 3), ("blob", 63, 21, 1, 0.6),
            ("tunnel", [(68, 14), (80, 14)], 3), ("gate", 72, 13, 1, 3, 0, 0),
            ("room", 78, 8, 8, 14),
        ], features=[
            ("ladder", 2, 18, 14), ("item", 8, 10), ("trainer", 20, 18, "N", 4),
            ("lever", 0, 44, 10), ("ladder", 3, 44, 26), ("trainer", 40, 20, "E", 5), ("npc", 48, 8, "Máy phát"),
            ("ladder", 4, 56, 16), ("lever", 0, 60, 10), ("item", 63, 21), ("trainer", 64, 8, "S", 4),
            ("lever", 1, 82, 12), ("item", 83, 19),
        ]),
    ],
    links=dict(ladder={1: ("1F", "B1F"), 2: ("B1F", "B2F"), 3: ("B2F", "B1F"), 4: ("B1F", "B2F")}),
)

# --------------------------------------------------------------------------------------------
# I. "Hang Rễ Cổ Thụ" (garden): an early-mid through-cave under the old tree north of Bloom Town
# (entrance, south edge) that comes out on Route 2's east bank (exit, west edge). 1F is a lattice
# of nine root chambers whose corridors are mostly one-way root ledges, jumped N / S / E / W
# (Mt. Moon B2F and Meteor Falls ledges, turned into a maze): read the arrows, find the way to
# the north-west ladder. Falling back south loops you round (C -> E -> SE -> entrance hall).
# B1F is the underground garden and lake (Surf island); a one-way root ledge drops west to the
# exit ladder. Cut vines gate the side pockets only; B2F, the mother root, is behind vines.
# --------------------------------------------------------------------------------------------
VARIANTS["i"] = dict(
    title="I · Hang Rễ Cổ Thụ (vườn hoa · mê cung gờ rễ một chiều)",
    concept=("Hang xuyên từ gốc cây cổ thụ Bloom Town ra bờ đông Route 2: 1F là mạng 9 buồng rễ nối bằng gờ "
             "một chiều bốn hướng; B1F là vườn ngầm có hồ; dây leo (Cut) chặn các túi phần thưởng."),
    floors=[
        dict(name="1F", level=0, w=80, h=44, dark=False, ops=[
            ("tunnel", [(40, 43), (40, 40)], 4),                         # entrance from Bloom Town
            ("blob", 40, 36, 6, 4), ("blob", 14, 36, 6, 4), ("blob", 66, 36, 6, 4),
            ("blob", 40, 22, 6, 4), ("blob", 66, 22, 6, 4),
            ("blob", 14, 8, 6, 4), ("blob", 40, 8, 6, 4), ("blob", 66, 8, 6, 4),
            ("blob", 14, 22, 6, 4), ("tunnel", [(8, 22), (0, 22)], 3),   # exit chamber (from B1F only)
            ("tunnel", [(34, 36), (20, 36)], 3),                         # SM - SW
            ("tunnel", [(46, 36), (60, 36)], 3),                         # SM - SE
            ("tunnel", [(40, 32), (40, 26)], 3), ("jump", 39, 29, 3, 1, "N"),   # SM -> C
            ("tunnel", [(46, 22), (60, 22)], 3), ("jump", 53, 21, 1, 3, "E"),   # C -> E
            ("tunnel", [(66, 26), (66, 32)], 3),                         # E - SE
            ("tunnel", [(66, 18), (66, 12)], 3), ("jump", 65, 15, 3, 1, "N"),   # E -> NE
            ("tunnel", [(60, 8), (46, 8)], 3), ("jump", 53, 7, 1, 3, "W"),      # NE -> N
            ("tunnel", [(34, 8), (20, 8)], 3),                           # N - NW
            ("tunnel", [(40, 12), (40, 18)], 3), ("jump", 39, 15, 3, 1, "S"),   # N -> C (fall back)
            ("tunnel", [(8, 36), (3, 36)], 3), ("vine", 6, 35, 1, 3),    # vine pocket off SW
        ], features=[
            ("entrance", 40, 43, "Bloom Town"),
            ("npc", 44, 38, "Người làm vườn"), ("deco", 36, 34, "flower"),
            ("item", 12, 38), ("item", 2, 36), ("hidden", 68, 38),
            ("trainer", 40, 22, "W", 5), ("trainer", 66, 25, "S", 4), ("deco", 62, 20, "flower"),
            ("item", 70, 6), ("trainer", 40, 6, "W", 5), ("deco", 44, 10, "flower"),
            ("ladder", 1, 12, 6),
            ("ladder", 2, 16, 22), ("exit", 0, 22, "Route 2"),
        ]),
        dict(name="B1F", level=-1, w=80, h=44, dark=False, ops=[
            ("blob", 14, 8, 6, 4),
            ("tunnel", [(20, 8), (32, 8), (32, 16)], 3),
            ("blob", 44, 24, 16, 9),                                     # the underground garden
            ("water", 49, 26, 6, 4), ("blob", 50, 26, 1, 1),
            ("tunnel", [(28, 26), (16, 26)], 3), ("jump", 22, 25, 1, 3, "W"),   # one way to the exit
            ("blob", 14, 24, 5, 4),
            ("tunnel", [(60, 22), (72, 22), (72, 32)], 3), ("vine", 64, 21, 1, 3),
            ("blob", 72, 36, 5, 4),
        ], features=[
            ("ladder", 1, 12, 6), ("trainer", 32, 12, "S", 4),
            ("npc", 38, 20, "Bà chăm vườn"), ("deco", 34, 28, "flower"), ("deco", 40, 30, "flower"),
            ("deco", 56, 18, "flower"), ("item", 50, 26), ("hidden", 36, 18), ("trainer", 44, 30, "E", 5),
            ("ladder", 2, 16, 22),
            ("ladder", 3, 72, 37), ("item", 76, 38),
        ]),
        dict(name="B2F", level=-2, w=36, h=24, dark=False, ops=[
            ("blob", 18, 11, 14, 8),
            ("pillar", 18, 9, 3, 2),
            ("tunnel", [(18, 18), (18, 22)], 3),
        ], features=[
            ("ladder", 3, 18, 21), ("legend", 18, 13, "Rễ Mẹ"),
            ("item", 6, 10), ("hidden", 30, 12), ("item", 26, 6),
            ("deco", 12, 15, "flower"), ("deco", 24, 15, "flower"),
        ]),
    ],
    links=dict(ladder={1: ("1F", "B1F"), 2: ("B1F", "1F"), 3: ("B1F", "B2F")}),
)
