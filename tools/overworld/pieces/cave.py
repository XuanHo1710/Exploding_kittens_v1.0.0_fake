"""Cave pieces for the Mons caves (docs/explanation/research/gen3-caves.md §4.4), one set per style.

  moon-cave-*        Hang Nguyệt Thạch (Mt. Moon pattern): cool grey-blue limestone, moonstone and crystal glints.
  granite-cave-*     Động Đá Hoa (Granite Cave pattern): warm pink-brown granite, ancient carvings, braziers.
  Regional caves D-I (docs/explanation/cave-regions.md), each with its own floor, rock-top and face
  painters and wall outline (FLOOR_PAINT / TOP_PAINT / FACE_PAINT / WALL_SDF), not just a palette:
  volcano-cave-*     basalt columns, ropy cooled lava      quarry-cave-*      timber-shored chiselled galleries
  mystic-cave-*      smooth ice with icicles, snow         lagoon-cave-*      rounded wet boulders, sand and pebbles
  powerplant-cave-*  straight concrete, steel tread plate  garden-cave-*      earth woven with roots, moss

Each style has the same kit, so a cave map re-skins by its theme (tools/maps/themes.json):
  terrain  <p>-floor (fill, 4 variants, behaviour CAVE: every floor cell has encounters, pret MB_CAVE),
           <p>-gravel (walkable patch for the `vary` pass), <p>-wall (rock mass seen from above, blob) and
           <p>-wall-face (two rows of rock face under every south edge, so walls read as height),
           <p>-ledge (one-way, JUMP_SOUTH) and <p>-ledge-north / -east / -west (JUMP_NORTH / EAST / WEST;
           garden ledges are roots, quarry ledges timber), <p>-stairs (rock steps through a face), <p>-water,
           granite only: granite-cave-cracked (CRACKED_FLOOR) and granite-cave-mosaic (ancient chamber floor)
  props    <p>-ladder-up, <p>-ladder-down, <p>-hole, <p>-exit (light at the mouth), <p>-stalagmite,
           <p>-rock, <p>-rock-big, <p>-rubble, <p>-pebbles, <p>-puddle, <p>-boulder (Strength),
           <p>-smash-rock (Rock Smash), plus the style's own pieces (cave_regions.py for D-I);
           cave-mouth-<style>: the entrance seen from the route (3x3, door = bottom middle).
Exported by gen_overworld.py into assets/overworld/Caves/ (owner "cave"):

    python3 tools/overworld/gen_overworld.py --cave
"""
import math

from PIL import Image, ImageDraw

from overworld_kit import IO, S as SBIT, contact_shade, draw_blobs, h16, mix

# ---------------------------------------------------------------- palettes (light -> dark)
STYLE = {
    "moon": dict(
        floor=[(200, 206, 214), (178, 186, 198), (156, 164, 180), (124, 130, 152), (88, 92, 118)],
        rock=[(164, 172, 196), (132, 140, 170), (104, 110, 142), (76, 80, 112), (46, 48, 74)],
        top=[(132, 140, 166), (106, 112, 142), (86, 90, 120), (64, 66, 96), (42, 42, 66)],
        out=(34, 34, 56),
        water=[(196, 228, 240), (110, 170, 214), (78, 132, 190), (54, 92, 150), (30, 46, 92)],
        accent=[(240, 250, 255), (188, 226, 248), (150, 186, 240), (126, 138, 214), (84, 86, 160)],   # moonstone
        dust=(214, 236, 250)),
    "granite": dict(
        floor=[(234, 206, 184), (214, 182, 160), (192, 156, 138), (160, 122, 110), (114, 82, 80)],
        rock=[(206, 160, 142), (176, 128, 116), (144, 98, 92), (108, 70, 72), (70, 44, 52)],
        top=[(176, 130, 116), (148, 104, 96), (120, 82, 80), (92, 60, 64), (62, 40, 48)],
        out=(52, 32, 40),
        water=[(200, 236, 224), (112, 190, 184), (76, 150, 156), (52, 108, 124), (30, 62, 82)],
        accent=[(250, 226, 150), (226, 184, 96), (186, 136, 70), (136, 92, 56), (84, 58, 44)],      # ochre carvings
        dust=(248, 220, 214)),
    # Regional caves D-I (docs/explanation/cave-regions.md), each in its District's gym-matched ramps
    # (biome.py ROCK_RAMPS / EMBLEM_COLS): the kit is the same, the stone, water and accent change.
    "volcano": dict(                                    # D Hầm Dung Nham: basalt and ash, glowing magma veins
        floor=[(190, 176, 172), (164, 150, 150), (138, 124, 128), (106, 92, 100), (70, 58, 68)],
        rock=[(150, 134, 140), (120, 104, 112), (96, 82, 92), (74, 62, 74), (46, 38, 52)],
        top=[(124, 108, 114), (100, 86, 96), (80, 68, 80), (62, 50, 64), (40, 32, 44)],
        out=(32, 24, 34),
        water=[(236, 240, 226), (150, 206, 190), (108, 166, 158), (74, 120, 124), (42, 72, 84)],      # hot spring
        accent=[(255, 240, 168), (255, 196, 80), (240, 120, 48), (186, 62, 40), (112, 36, 38)],        # magma
        dust=(214, 206, 204)),
    "quarry": dict(                                     # E Mỏ Đá Bỏ Hoang: slate, dust, timber shoring
        floor=[(218, 210, 196), (196, 188, 174), (170, 162, 150), (138, 130, 122), (98, 92, 90)],
        rock=[(188, 186, 186), (156, 152, 154), (124, 120, 126), (92, 88, 98), (58, 56, 68)],
        top=[(156, 152, 152), (128, 124, 128), (104, 100, 108), (80, 76, 88), (52, 50, 62)],
        out=(38, 36, 48),
        water=[(214, 232, 230), (128, 186, 190), (90, 146, 158), (62, 104, 124), (36, 62, 84)],
        accent=[(252, 238, 170), (234, 198, 96), (186, 140, 66), (132, 92, 56), (82, 58, 48)],         # gold ore
        dust=(244, 230, 188),
        ledge="timber"),
    "mystic": dict(                                     # F Động Băng Tinh Tú: pale lilac ice rock, star crystal
        floor=[(234, 234, 248), (214, 214, 236), (192, 192, 222), (158, 156, 198), (114, 110, 158)],
        rock=[(212, 212, 240), (180, 178, 220), (148, 144, 196), (114, 108, 164), (76, 70, 120)],
        top=[(172, 170, 212), (144, 140, 190), (118, 112, 166), (92, 86, 138), (62, 56, 100)],
        out=(44, 38, 76),
        water=[(238, 248, 252), (172, 216, 242), (128, 178, 228), (92, 132, 198), (54, 76, 142)],
        accent=[(255, 238, 250), (255, 196, 238), (230, 140, 214), (160, 90, 180), (96, 56, 124)],     # star crystal
        dust=(255, 255, 255)),
    "lagoon": dict(                                     # G Hang Triều Lam: wet teal sea rock, shells, coral
        floor=[(230, 226, 204), (208, 204, 182), (184, 182, 162), (146, 148, 136), (100, 106, 104)],
        rock=[(150, 196, 190), (112, 164, 164), (84, 134, 140), (60, 102, 114), (36, 66, 82)],
        top=[(120, 168, 166), (94, 140, 144), (72, 114, 124), (52, 88, 102), (32, 58, 74)],
        out=(24, 44, 62),
        water=[(222, 240, 246), (110, 196, 226), (76, 156, 206), (54, 110, 170), (30, 60, 112)],
        accent=[(255, 240, 236), (255, 184, 176), (236, 120, 124), (176, 72, 92), (110, 46, 70)],      # coral, pearl
        dust=(240, 255, 250)),
    "powerplant": dict(                                 # H Đường Hầm Điện Ngầm: concrete, steel, cables
        floor=[(204, 210, 218), (174, 182, 194), (150, 158, 172), (112, 120, 138), (76, 82, 100)],
        rock=[(206, 208, 212), (174, 178, 186), (142, 146, 158), (106, 110, 126), (66, 70, 88)],
        top=[(150, 150, 158), (124, 124, 136), (100, 100, 114), (76, 76, 92), (50, 50, 66)],
        out=(34, 36, 52),
        water=[(220, 236, 240), (140, 196, 214), (100, 156, 186), (70, 112, 150), (40, 66, 100)],
        accent=[(255, 250, 190), (255, 232, 96), (240, 190, 48), (184, 128, 40), (110, 80, 40)],       # live current
        dust=(236, 238, 242)),
    "garden": dict(                                     # I Hang Rễ Cổ Thụ: soft earth, old roots, moss, glowworms
        floor=[(196, 170, 132), (170, 144, 110), (146, 120, 92), (116, 92, 74), (80, 62, 56)],
        rock=[(198, 160, 122), (168, 128, 98), (136, 98, 80), (102, 72, 62), (66, 46, 48)],
        top=[(150, 124, 96), (124, 100, 78), (102, 82, 66), (80, 64, 54), (54, 44, 42)],
        out=(40, 34, 38),
        water=[(222, 242, 236), (136, 206, 196), (96, 170, 170), (66, 128, 138), (38, 80, 96)],
        accent=[(236, 255, 220), (190, 250, 170), (120, 220, 150), (70, 160, 120), (40, 100, 90)],     # glowworm
        dust=(236, 255, 200),
        ledge="root"),
}
REGIONS = ("volcano", "quarry", "mystic", "lagoon", "powerplant", "garden")
WOOD = [(236, 196, 140), (196, 146, 96), (140, 96, 70), (88, 58, 50)]
ROOT = [(214, 176, 130), (176, 134, 96), (132, 94, 72), (88, 62, 54)]
STEEL = [(232, 236, 240), (186, 194, 206), (136, 146, 164), (88, 96, 116)]
MOSS = [(176, 210, 120), (126, 174, 92), (84, 134, 76)]
PATINA = [(150, 206, 190), (100, 164, 150), (66, 120, 116)]          # old bronze / teal paint on the granite carvings
FLAME = [(255, 246, 196), (255, 206, 96), (240, 130, 56), (178, 70, 48)]


def _has(facing, side):
    return facing is not None and side in facing


# ---------------------------------------------------------------- floor
def _floor_px(st, x, y, v):
    fn = FLOOR_PAINT.get(st)
    return fn(x % 16, y % 16, v) if fn else _floor_base(st, x, y, v)


def _floor_base(st, x, y, v):
    """Packed cave earth: base tone, a few 2-px pebbles with a lit top, darker grains, and per variant a
    hairline crack, a pebble cluster or dust glints. 16 px periodic, no grid shows."""
    F = STYLE[st]["floor"]
    x, y = x % 16, y % 16
    pebbles = {0: ((3, 4), (11, 11)), 1: ((12, 3),), 2: ((4, 10), (6, 11), (12, 5), (9, 13)), 3: ((2, 13),)}[v]
    for px, py in pebbles:
        if (x, y) in ((px, py), (px + 1, py)):
            return F[0]
        if (x, y) in ((px, py + 1), (px + 1, py + 1)):
            return F[3]
    if v == 1 and ((x, y) in ((3, 9), (4, 9), (5, 10), (6, 10), (7, 11), (8, 11), (9, 11), (10, 12))):
        return F[3]                                                    # hairline crack
    if v == 3 and (x, y) in ((6, 5), (13, 9), (9, 2)):
        return STYLE[st]["dust"]                                       # mineral glint
    if h16(x, y, 31 + v) > 246:
        return F[2]
    if h16(x, y, 47 + v) > 250:
        return F[0]
    if (x + 2 * y + v * 5) % 16 == 0 and y % 4 == 1:
        return F[2]                                                    # faint strata dashes
    return F[1]


def _gravel_px(st, x, y):
    """Loose grit: the floor tone with scattered 2-px chips (lit top, dark foot) on a jittered 8 px lattice."""
    F = STYLE[st]["floor"]
    x, y = x % 16, y % 16
    for cx, cy in ((2, 3), (9, 1), (13, 6), (5, 9), (11, 12), (1, 14), (7, 15)):
        if (x, y) in ((cx, cy), (cx + 1, cy)):
            return F[0]
        if (x, y) in ((cx, cy + 1), (cx + 1, cy + 1)):
            return F[3]
    return F[2] if h16(x, y, 77) > 200 else F[1]


def _feather(d, x, y, width=4.0):
    """True near a patch edge: show the floor under it in 2x2 clusters, thinning toward the inside."""
    if d >= width:
        return False
    return h16(x // 2, y // 2, 91) / 255 > d / width


# ---------------------------------------------------------------- regional materials (caves D-I)
# Each regional style has its OWN floor, rock-top and face painters (and wall outline, WALL_SDF), so the
# six caves differ in shape and material, not only in colour:
#   volcano    hexagonal basalt column tops, jagged column faces lit warm by lava below, ropy cooled-lava floor
#   quarry     chiselled flat rock faces behind timber posts and a cap beam, straight tunnel walls, dusty floor
#   mystic     smooth glossy ice mass, translucent ice faces with icicles, snow-dusted floor
#   lagoon     rounded wet boulders (tops and stacked-boulder faces) with barnacles and weed, sand and pebbles
#   powerplant concrete roof slabs, straight lined walls with lights, pipes and cable trays, steel tread plate
#   garden     earth woven with roots and moss, irregular organic outline, moss-carpeted earth floor
# floor(x, y, v), top(x, y) and face(x, Y) all take tile-local coordinates (face Y 0..31 down two cells).
def _hexcell(x, y, centres):
    """Nearest and second-nearest centre of a 16 px periodic Voronoi pattern: (index, dx, dy, gap)."""
    best = []
    for i, (cx, cy) in enumerate(centres):
        for ox in (-16, 0, 16):
            for oy in (-16, 0, 16):
                dx, dy = x + 0.5 - (cx + ox), y + 0.5 - (cy + oy)
                best.append((math.hypot(dx, dy), i, dx, dy))
    best.sort()
    d1, i, dx, dy = best[0]
    d2 = next(b[0] for b in best if b[1] != i)
    return i, dx, dy, d2 - d1


HEX = ((4, 3), (12, 3), (0, 11), (8, 11), (5, 7.5), (13, 13))[:4]


def _top_volcano(x, y):
    """Basalt column field seen from above: hexagon-ish tops lit from the top-left, black joints."""
    T, A = STYLE["volcano"]["top"], STYLE["volcano"]["accent"]
    i, dx, dy, gap = _hexcell(x, y, HEX)
    if gap < 1.1:
        return A[4] if (x * 3 + y) % 13 == 0 else T[4]
    l = -(dx * 0.7 + dy * 0.7)
    base = (T[1], T[2], T[1], T[2])[i]
    if l > 2.0:
        return T[0]
    if l < -2.2:
        return T[3]
    return base


def _face_volcano(x, Y):
    """Jagged basalt columns (5-6 px wide, staggered tops), a crack across each; lava light from below
    warms the lit edges of the lowest rows."""
    R, A, O = STYLE["volcano"]["rock"], STYLE["volcano"]["accent"], STYLE["volcano"]["out"]
    cols = ((0, 5, 2, 15), (5, 10, 4, 20), (10, 16, 3, 11))          # x0, x1, top Y, crack Y
    for x0, x1, top, crack in cols:
        if x0 <= x < x1:
            if Y < top:
                return _top_volcano(x, Y + 12)
            if Y >= 30:
                return O
            if Y >= 28:
                return R[4] if (x + Y) % 4 else A[3]
            warm = Y >= 22
            if x == x0:
                return R[4]
            if Y == top:
                return R[0]                                         # lit column top
            if Y == crack:
                return R[4] if x != x1 - 1 else R[3]
            if x == x0 + 1:
                return mix(R[0], A[2], 0.45) if warm else R[0]
            if x == x1 - 1:
                return mix(R[3], A[3], 0.5) if warm and Y > 25 else R[3]
            return R[1] if Y < 18 else R[2]
    return R[2]


def _floor_volcano(x, y, v):
    """Cooled lava: ropy folds of pahoehoe crust; v1 / v3 carry a faint glowing crack."""
    F, A = STYLE["volcano"]["floor"], STYLE["volcano"]["accent"]
    rope = (y + int(round(2.0 * math.sin(x * math.pi / 8 + v * 1.7)))) % 8
    if v == 1 and (x, y) in ((2, 6), (3, 6), (4, 7), (5, 8), (6, 8), (7, 9), (8, 10), (9, 10), (10, 11), (6, 9)):
        return A[2] if (x, y) in ((5, 8), (6, 8)) else A[3]
    if rope == 0:
        return F[3]
    if rope == 1:
        return F[0]
    if rope == 2 and (x + v) % 3 == 0:
        return F[2]
    if h16(x, y, 53 + v) > 248:
        return F[4]                                                  # cinder grains
    return F[1]


def _top_quarry(x, y):
    """Rock above a mine gallery: broken slabs with straight cleavage lines."""
    T = STYLE["quarry"]["top"]
    if (x + 2 * y) % 16 == 0 or (x - y + 4) % 16 == 0 and y < 9:
        return T[4]
    if (x + 2 * y) % 16 == 1:
        return T[0]
    if h16(x, y, 19) > 244:
        return T[3]
    return T[1] if (x // 8 + y // 8) % 2 else T[2]


def _face_quarry(x, Y):
    """A chiselled gallery wall shored with timber: cap beam along the top, a post with a knee brace at
    each cell, flat rock between them scored with horizontal chisel strokes."""
    R, O = STYLE["quarry"]["rock"], STYLE["quarry"]["out"]
    if Y >= 30:
        return O
    if Y == 2:
        return WOOD[0]
    if 3 <= Y <= 5:
        return WOOD[2] if (x * 2 + Y) % 9 == 0 else WOOD[1]
    if Y == 6:
        return WOOD[3]
    if 1 <= x <= 3:                                                   # the post
        if Y >= 28:
            return WOOD[3]
        return (WOOD[0], WOOD[1], WOOD[2])[x - 1] if Y % 9 else WOOD[3]
    if x == 4 and Y < 28:
        return WOOD[3]
    if 7 <= Y <= 10 and x - 4 == Y - 6:
        return WOOD[1]                                                # knee brace
    if 7 <= Y <= 10 and x - 4 == Y - 5:
        return WOOD[3]
    if Y >= 28:
        return R[4]
    if Y % 5 == 2 and (x + Y) % 6 < 3:
        return R[3]                                                   # chisel strokes
    if Y % 5 == 3 and (x + Y) % 6 < 2:
        return R[0]
    return R[1] if Y < 17 else R[2]


def _floor_quarry(x, y, v):
    """Dusty packed floor of a working mine: tool grit, chips of ore, a timber splinter."""
    F, A = STYLE["quarry"]["floor"], STYLE["quarry"]["accent"]
    if v == 0 and (x, y) in ((12, 12), (13, 12)):
        return A[2]
    if v == 2 and y == 3 and 2 <= x <= 6:
        return WOOD[2]
    if v == 1 and (x + y) % 7 == 0 and 4 < x < 12:
        return F[2]                                                   # boot scuffs
    if h16(x, y, 61 + v) > 238:
        return F[2] if h16(x, y, 7) > 128 else F[0]
    return F[1]


def _top_mystic(x, y):
    """Smooth ice mass: no lumps, broad diagonal gloss bands and a few pale cracks."""
    T = STYLE["mystic"]["top"]
    s = (x - y) % 16
    if s in (2, 3) and 2 <= y <= 8:
        return T[0]                                                   # a short gloss streak
    if s == 4 and 3 <= y <= 7:
        return mix(T[0], T[1], 0.5)
    if (x, y) in ((11, 4), (12, 5), (12, 6), (4, 12), (5, 12)):
        return T[3]
    if h16(x, y, 37) > 252:
        return (255, 255, 255)
    if (x - 12) ** 2 + (y - 11) ** 2 < 5 or (x - 3) ** 2 + (y - 13) ** 2 < 3:
        return T[2]                                                   # frost crust
    return T[1]


ICICLES = (5, 2, 8, 3, 1, 6, 2, 9, 4, 2, 7, 1, 3, 8, 2, 5)            # length below the lip, per column


def _face_mystic(x, Y):
    """A translucent ice wall: icicles hang from the white lip, the ice deepens downward, two vertical
    gloss streaks and frozen bubbles; no rock columns."""
    R, O = STYLE["mystic"]["rock"], STYLE["mystic"]["out"]
    Wt = STYLE["mystic"]["water"]
    if Y == 2:
        return (255, 255, 255)
    n = ICICLES[x]
    if 3 <= Y < 3 + n:
        return Wt[0] if Y < 2 + n else Wt[1]
    if Y >= 30:
        return O
    if Y >= 28:
        return R[3]
    if x in (5, 6) and 6 < Y < 24 or x == 12 and 8 < Y < 18:
        return mix(R[0], (255, 255, 255), 0.5)
    if (x, Y) in ((9, 14), (2, 20), (13, 23)):
        return (255, 255, 255)
    if (x, Y) in ((9, 15), (2, 21), (13, 24)):
        return R[3]
    return R[0] if Y < 10 else R[1] if Y < 19 else R[2]


def _floor_mystic(x, y, v):
    """Wind-packed snow over the cave floor: soft drift curves and frost sparkle."""
    F = STYLE["mystic"]["floor"]
    drift = (y + int(round(1.5 * math.sin(x * math.pi / 8 + v)))) % 16
    if v in (0, 3) and drift == 6 and 3 <= (x + v * 5) % 16 < 11:
        return F[2]                                                   # one soft drift curve
    if v in (0, 3) and drift == 5 and 3 <= (x + v * 5) % 16 < 11:
        return F[0]
    if h16(x, y, 5 + v) > 250:
        return (255, 255, 255)
    if v == 2 and (x, y) in ((4, 5), (5, 5), (11, 10), (12, 10), (12, 11)):
        return F[0]                                                   # wind-polished spots
    return F[1]


LAGOON_STONES = [(4.0, 4.5, 4.2), (12.0, 3.0, 3.6), (8.5, 10.5, 4.6), (1.0, 12.5, 3.2), (14.5, 11.0, 3.4)]


def _top_lagoon(x, y):
    """Rounded wet boulders seen from above: big round tops with a white wet highlight, weed and barnacles
    in the gaps."""
    T, O = STYLE["lagoon"]["top"], STYLE["lagoon"]["out"]
    best, nx, ny = 9, 0, 0
    for cx, cy, r in LAGOON_STONES:
        for ox in (-16, 0, 16):
            for oy in (-16, 0, 16):
                dx, dy = x + 0.5 - (cx + ox), y + 0.5 - (cy + oy)
                q = math.hypot(dx, dy) / r
                if q < best:
                    best, nx, ny = q, dx / r, dy / r
    if best >= 1.0:
        return (52, 110, 90) if h16(x, y, 3) > 200 else T[4]
    if -0.55 < nx < -0.25 and -0.6 < ny < -0.3:
        return (236, 250, 248)                                        # wet shine
    lit = -(nx * 0.65) - ny * 0.75
    if best > 0.85:
        return T[3]
    if (x, y) in ((10, 11), (6, 9), (13, 2)):
        return STYLE["lagoon"]["dust"]
    return T[0] if lit > 0.45 else T[1] if lit > -0.2 else T[2]


def _face_lagoon(x, Y):
    """Stacked rounded boulders, three courses, each stone shaded round with a wet shine; barnacles,
    weed hanging in the joints and a dark wet foot."""
    R, O = STYLE["lagoon"]["rock"], STYLE["lagoon"]["out"]
    if Y >= 30:
        return O
    for y0, y1, off in ((2, 11, 0), (12, 20, 4), (21, 29, 2)):
        if y0 <= Y <= y1:
            w = 8
            u = (x + off) % w
            cy, ry = (y0 + y1) / 2, (y1 - y0 + 1) / 2
            nx, ny = (u + 0.5 - w / 2) / (w / 2), (Y + 0.5 - cy) / ry
            q = nx * nx + ny * ny
            if q > 1.0:
                if Y > 24 and u == 0:
                    return (52, 110, 90)                              # weed in the joint
                return R[4]
            if -0.6 < nx < -0.2 and -0.7 < ny < -0.35:
                return (236, 250, 248)
            if (x * 7 + Y * 3) % 29 == 0:
                return STYLE["lagoon"]["dust"]                        # barnacle
            lit = -(nx * 0.6) - ny * 0.8
            if Y >= 26:
                return R[3] if lit < 0.3 else R[2]
            return R[0] if lit > 0.5 else R[1] if lit > -0.2 else R[2] if q < 0.75 else R[3]
    return R[2]


def _floor_lagoon(x, y, v):
    """Firm grey sand strewn with round sea-worn pebbles and the odd shell."""
    F, A = STYLE["lagoon"]["floor"], STYLE["lagoon"]["accent"]
    peb = {0: ((3, 4), (11, 10), (7, 13)), 1: ((12, 3), (4, 9)), 2: ((5, 2), (13, 7), (2, 12), (9, 11)),
           3: ((8, 6),)}[v]
    P = [(170, 196, 192), (126, 156, 156), (84, 112, 118)]
    for px, py in peb:
        if (x, y) in ((px, py), (px + 1, py)):
            return P[0]
        if (x, y) in ((px - 1, py + 1), (px, py + 1), (px + 1, py + 1)):
            return P[1]
        if (x, y) in ((px, py + 2), (px + 1, py + 2)):
            return P[2]
    if v == 3 and (x, y) in ((12, 12), (13, 12)):
        return A[1]
    if h16(x, y, 71 + v) > 240:
        return F[2]
    return F[1]


def _top_powerplant(x, y):
    """Concrete roof slabs over the tunnel: bevelled squares with a bolt in each corner."""
    T = STYLE["powerplant"]["top"]
    if x == 0 or y == 0:
        return T[0]
    if x == 15 or y == 15:
        return T[3]
    if (x, y) in ((2, 2), (13, 2), (2, 13), (13, 13)):
        return T[3]
    if 6 <= x <= 9 and 6 <= y <= 9:
        return T[3] if (y % 2) else T[2]                              # vent grille
    return T[1]


def _face_powerplant(x, Y):
    """Straight lined concrete wall: a fluorescent fitting under the coping, two pipes and a cable tray,
    smooth panels with seams and a dark skirting. Hazard stripes are kept for the gates."""
    R, O = STYLE["powerplant"]["rock"], STYLE["powerplant"]["out"]
    if Y == 2:
        return R[0]
    if Y == 3:
        return R[1]
    if Y >= 30:
        return O
    if Y >= 28:
        return R[4]
    if 26 <= Y <= 27:
        return R[3]
    if 4 <= Y <= 6 and 3 <= x <= 12:                                  # fluorescent light
        if Y == 5 and 4 <= x <= 11:
            return (250, 252, 240)
        return STEEL[3]
    if Y == 7 and 2 <= x <= 13:
        return mix(R[1], (250, 252, 240), 0.5)                        # its glow on the wall
    if 10 <= Y <= 12:
        return STEEL[Y - 10]                                          # pipe
    if Y == 13:
        return STEEL[3] if x % 8 else R[3]
    if Y == 15:
        return (64, 66, 80) if x % 4 else STEEL[2]                    # cable tray
    if Y == 16:
        return (46, 48, 60)
    if x == 0:
        return R[3]
    if x == 1:
        return R[0]
    if Y == 21:
        return R[3]
    return R[1] if Y < 21 else R[2]


def _floor_powerplant(x, y, v):
    """Steel tread plate in welded squares; v2 is a drain grating."""
    F = STYLE["powerplant"]["floor"]
    if x == 0 or y == 0:
        return F[3]
    if x == 1 or y == 1:
        return F[0]
    if v == 2 and y == 8 and 2 <= x <= 13:
        return F[2]                                                   # a weld seam across the plate
    if v == 3 and (x, y) in ((3, 3), (12, 3), (3, 12), (12, 12)):
        return F[3]
    if (x + y) % 4 == 0 and (x - y) % 8 == 0:
        return F[0]                                                   # tread bosses
    if (x + y) % 4 == 1 and (x - y - 1) % 8 == 0:
        return F[2]
    return F[1]


def _roots_px(x, y, seed, slopes=(0, 0)):
    """Root strands woven through earth: two wandering sine roots per 16 px tile, None elsewhere.
    slopes: horizontal drift per row (0 keeps a rock top 16 px periodic; a face may lean)."""
    for k, (x0, slope) in enumerate(zip((3, 11), slopes)):
        t = int(round(x0 + slope * y + math.sin((y + seed) * math.pi / 8 + k * 2.1) * 2.4)) % 16
        if x == t:
            return ROOT[1] if (y + k) % 7 else ROOT[2]
        if x == (t + 1) % 16:
            return ROOT[3]
    return None


def _top_garden(x, y):
    """Dark earth above the cave, crossed by wandering roots, a small moss cushion here and there."""
    T = STYLE["garden"]["top"]
    if (x - 7) ** 2 + (y - 9) ** 2 * 2 < 7:
        return MOSS[1] if (x + y) % 4 else MOSS[0]
    r = _roots_px(x, y, 0)
    if r:
        return r
    if h16(x, y, 23) > 232:
        return T[3]
    return T[1] if (x * 3 + y * 5) % 17 else T[2]


def _face_garden(x, Y):
    """An earthen wall woven with roots: soil strata dots, leaning root strands, moss over the lip,
    glowworm beads, a dark damp foot."""
    R, O, A = STYLE["garden"]["rock"], STYLE["garden"]["out"], STYLE["garden"]["accent"]
    if Y == 2:
        return MOSS[0]
    if Y == 3:
        return MOSS[1]
    if Y == 4 and h16(x, 0, 3) > 100:
        return MOSS[2]
    if Y >= 30:
        return O
    if Y >= 28:
        return R[4]
    r = _roots_px(x, Y, 5, (0.35, -0.3))
    if r:
        return r
    if (x, Y) in ((7, 9), (14, 13), (1, 18), (8, 21), (12, 25)):
        return A[1]
    if (x * 5 + Y * 3) % 19 == 0:
        return R[3]
    return R[1] if Y < 16 else R[2]


def _floor_garden(x, y, v):
    """Dark earth, moss mats of different shapes on half the variants, a thin root or a sprout on the
    others, a few pale flowers in the moss."""
    F = STYLE["garden"]["floor"]
    mats = {0: [(5, 6, 4.0, 2.6)], 1: [], 2: [], 3: [(10, 9, 5.0, 3.2), (3, 3, 2.2, 1.6)]}[v]
    for cx, cy, rx, ry in mats:
        q = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
        q += (h16(x // 2, y // 2, 97) - 128) / 600
        if q < 1.0:
            if (x, y) == (int(cx), int(cy)):
                return (250, 236, 170)
            return MOSS[0] if q < 0.3 and (x + y) % 3 == 0 else MOSS[1] if q < 0.75 else MOSS[2]
    if v == 1 and (x, y) in ((3, 9), (4, 9), (5, 10), (6, 10), (7, 11), (8, 11), (9, 11), (10, 12)):
        return ROOT[2]
    if v == 2 and (x, y) in ((5, 12), (4, 11), (6, 11)):
        return MOSS[1]
    if h16(x, y, 83 + v) > 244:
        return F[3]
    if h16(x, y, 89 + v) > 250:
        return F[0]
    return F[1]


FLOOR_PAINT = {"volcano": _floor_volcano, "quarry": _floor_quarry, "mystic": _floor_mystic,
               "lagoon": _floor_lagoon, "powerplant": _floor_powerplant, "garden": _floor_garden}
TOP_PAINT = {"volcano": _top_volcano, "quarry": _top_quarry, "mystic": _top_mystic, "lagoon": _top_lagoon,
             "powerplant": _top_powerplant, "garden": _top_garden}
FACE_PAINT = {"volcano": _face_volcano, "quarry": _face_quarry, "mystic": _face_mystic, "lagoon": _face_lagoon,
              "powerplant": _face_powerplant, "garden": _face_garden}
# Wall outline per style: jagged basalt, straight cut gallery, smooth round ice, bulging boulders,
# square concrete, irregular organic earth (moon / granite keep the default).
WALL_SDF = {"volcano": dict(margin=1.0, radius=1.5, wobble=1.4, freq=2),
            "quarry": dict(margin=0.5, radius=1.0, wobble=0.0, freq=1),
            "mystic": dict(margin=1.0, radius=7.0, wobble=0.3, freq=1),
            "lagoon": dict(margin=1.0, radius=7.0, wobble=1.3, freq=1),
            "powerplant": dict(margin=0.5, radius=0.5, wobble=0.0, freq=1),
            "garden": dict(margin=1.0, radius=5.0, wobble=1.6, freq=2)}


# ---------------------------------------------------------------- wall (rock mass) and face
LUMPS = [(3.5, 3.0, 4.2), (10.5, 2.0, 3.0), (14.5, 6.5, 3.4), (7.5, 8.5, 4.8), (1.5, 10.5, 3.0),
         (4.5, 14.5, 3.4), (11.5, 13.0, 3.8), (15.0, 15.5, 2.2)]


def _lump_px(st, x, y):
    fn = TOP_PAINT.get(st)
    return fn(x % 16, y % 16) if fn else _lump_base(st, x, y)


def _lump_base(st, x, y):
    """Rock mass from above: rounded lumps lit from the top-left, dark creases between them."""
    R = STYLE[st]["top"]
    best, nx, ny = 9, 0, 0
    for cx, cy, r in LUMPS:
        for ox in (-16, 0, 16):
            for oy in (-16, 0, 16):
                dx, dy = x % 16 + 0.5 - (cx + ox), y % 16 + 0.5 - (cy + oy)
                q = math.hypot(dx, dy) / r
                if q < best:
                    best, nx, ny = q, dx / r, dy / r
    if best >= 1.0:
        return R[4] if h16(x, y, 3) > 60 else R[3]                    # crease
    lit = -(nx * 0.65) - ny * 0.75
    if best > 0.84:
        return R[3] if lit < 0.3 else R[2]
    if lit > 0.5 and best < 0.55:
        return R[0]
    if h16(x, y, 19) > 245:
        return R[3]                                                   # grit
    return R[1] if lit > -0.1 else R[2]


def _face_px(st, x, Y, d, facing):
    fn = FACE_PAINT.get(st)
    if not fn or ((_has(facing, "E") or _has(facing, "W")) and d < 3) or Y < 2:
        return _face_base(st, x, Y, d, facing)
    return fn(x % 16, Y)


def _face_base(st, x, Y, d, facing):
    """Rock face, Y = 0..31 down a two-cell face (Y 2 = the lit lip under the rock top). Irregular rock
    columns with lit left edges, two weathered bands and a dark foot; the E/W ends darken."""
    R = STYLE[st]["rock"]
    if (_has(facing, "E") or _has(facing, "W")) and d < 3:
        return STYLE[st]["out"] if d < 1 else R[4] if d < 2 else R[3]
    if Y == 2:
        return R[0]
    if Y == 3:
        return R[1]
    if Y >= 30:
        return STYLE[st]["out"]
    if Y >= 28:
        return R[4]
    if Y in (12, 21):
        return R[1] if (x + Y) % 6 else R[2]
    if Y in (13, 22):
        return R[4] if x % 3 else R[3]
    band = 0 if Y < 12 else 1 if Y < 21 else 2
    cuts = (1, 7, 10) if band == 0 else (4, 12) if band == 1 else (0, 6, 9, 14)
    lean = (Y % 9) // 4 if band != 1 else -((Y % 9) // 4)
    col = min((x - c - lean) % 16 for c in cuts)
    if col == 0 and h16(x, Y, 7) > 40:
        return R[4]
    if col == 1:
        return R[1] if band == 0 else R[2]
    if col == 2 and band == 0 and h16(x, Y, 9) > 160:
        return R[1]
    if h16(x, Y, 11) > 238:
        return R[4]
    return (R[2], R[2], R[3])[band] if (x * 3 + Y * 5) % 13 else R[3]


def _wall_painter(st):
    F, R, O = STYLE[st]["floor"], STYLE[st]["rock"], STYLE[st]["out"]

    def paint(d, facing, x, y, f, m):
        if d < 0:
            return _floor_px(st, x, y, 0)
        if not m & SBIT and _has(facing, "S"):
            if y >= 4:                                             # no face rows below: a one-cell face
                return _face_px(st, x, y + 14, d, facing)
        if (_has(facing, "E") or _has(facing, "W")) and d < 3:
            return O if d < 1 else R[3] if d < 2 else R[2]
        if _has(facing, "N") and d < 3:
            return O if d < 1 else R[0] if d < 2 else R[1]
        if not m & SBIT and y >= 2 and y < 4:
            return R[0] if y == 2 else R[1]
        return _lump_px(st, x, y)
    return paint


def _face_painter(st):
    R, O = STYLE[st]["rock"], STYLE[st]["out"]

    def paint(d, facing, x, y, f, m):
        if d < 0:
            return _floor_px(st, x, y, 0)
        upper = bool(m & SBIT)
        Y = y if upper else y + 16
        if _has(facing, "N") and d < 3:                            # a thin wall: floor right above the face
            return O if d < 1 else R[0]
        if Y < 2:
            return _lump_px(st, x, y)
        return _face_px(st, x, Y, d, facing)
    return paint


def wall_joins(group):
    """Rock top joins rock everywhere and its face only below it; a face joins faces and the rock above,
    so every south edge shows the two-row face and the face ends round where the wall turns."""
    def joins(nb, dx, dy):
        spec = TERRAIN.get(nb) if nb else None
        if not spec or spec.get("group") != group:
            return False
        return True if not spec.get("face") else dy == 1
    return joins


def face_joins(group):
    def joins(nb, dx, dy):
        spec = TERRAIN.get(nb) if nb else None
        if not spec or spec.get("group") != group:
            return False
        return True if spec.get("face") else dy == -1
    return joins


# ---------------------------------------------------------------- ledge, stairs, water, cracked floor
def _ledge_painter(st):
    F, R, O = STYLE[st]["floor"], STYLE[st]["rock"], STYLE[st]["out"]

    def paint(i, x, y):
        left, right = i in (0, 1), i in (0, 3)
        if (left and x < 2) or (right and x > 13):
            return _floor_px(st, x, y, 0) if y < 6 or y > 13 else (R[3] if y < 11 else F[3])
        if y < 6:
            return _floor_px(st, x, y, 0)
        if y == 6:
            return R[0]
        if y == 7:
            return R[1] if x % 5 else R[2]
        if y < 11:
            return R[2] if (x * 3 + y) % 7 else R[3]
        if y == 11:
            return O
        if y == 12:
            return F[3]
        return _floor_px(st, x, y, 0)
    return paint


def _side_ledge_painter(st, dirn):
    """One-way ledge hopped toward N, E or W (the camera sees no face on those sides): a lit rock rim
    with a dark drop line and a 1 px shade on the low side. i: 0 single, 1 start, 2 middle, 3 end
    along the row (left -> right for N, top -> bottom for E / W)."""
    F, R, O = STYLE[st]["floor"], STYLE[st]["rock"], STYLE[st]["out"]

    def paint(i, x, y):
        t, a = {"N": (x, 15 - y), "E": (y, x), "W": (y, 15 - x)}[dirn]
        start, end = i in (0, 1), i in (0, 3)
        if 6 <= a <= 11 and ((start and t < 2) or (end and t > 13)):
            return O if (t in (0, 15) or a in (6, 10)) and a <= 10 else R[3] if a <= 10 else F[3]
        if a == 6:
            return R[0]
        if a == 7:
            return R[1] if t % 5 else R[2]
        if a == 8:
            return R[2] if (t * 3 + a) % 7 else R[3]
        if a == 9:
            return R[3]
        if a == 10:
            return O
        if a == 11:
            return F[3]
        return _floor_px(st, x, y, 0)
    return paint


def _root_ledge_painter(st, dirn):
    """Garden cave ledge: a thick old root lying across the way, lit on top, moss on its back,
    dark bark furrows, the drop shade on the low side. Hopped toward `dirn` (S, N, E, W).
    Quarry (ledge="timber"): a squared timber baulk, straight, plank grain instead of bark."""
    F, O = STYLE[st]["floor"], STYLE[st]["out"]
    timber = STYLE[st].get("ledge") == "timber"
    ROOT, amp = (WOOD, 0.0) if timber else (globals()["ROOT"], 1.0)

    def paint(i, x, y):
        t, a = {"S": (x, y), "N": (x, 15 - y), "E": (y, x), "W": (y, 15 - x)}[dirn]
        start, end = i in (0, 1), i in (0, 3)
        w = int(round(math.sin(t * math.pi / 8) * amp))             # 16 px periodic wiggle: seamless
        a0, a1 = 4 + w, 11 + w
        if start and t < 3:
            a0 += 3 - t
            a1 -= 3 - t
        if end and t > 12:
            a0 += t - 12
            a1 -= t - 12
        if a0 <= a <= a1:
            if a in (a0, a1) or (start and t == 0) or (end and t == 15):
                return O
            if a == a0 + 1:
                return MOSS[1] if h16(t, 0, 41) > 200 and not timber else ROOT[0]
            if a == a1 - 1:
                return ROOT[3]
            if (t % 8 == 3) if timber else (t + 2 * a) % 6 == 0:
                return ROOT[2]                                    # bark furrow / timber joint
            return ROOT[1]
        if a == a1 + 1 and a0 < a1:
            return F[3]
        return _floor_px(st, x, y, 0)
    return paint


def _stairs_painter(st):
    F, R = STYLE[st]["floor"], STYLE[st]["rock"]
    # tread ramp (lit nose, tread, shadow, riser): wooden steps in the mine, steel steps in the tunnel
    T = {"quarry": (WOOD[0], WOOD[1], WOOD[2], WOOD[3]),
         "powerplant": (STEEL[0], STEEL[1], STEEL[2], STEEL[3])}.get(st, (F[0], F[1], F[2], None))

    def paint(i, x, y):
        top, bottom = i in (0, 1), i in (0, 3)
        if x < 2 or x > 13:
            return R[4] if x in (1, 14) else R[3]
        if bottom and y >= 14:
            return F[3] if y == 14 else _floor_px(st, x, y, 0)
        step = (y + (1 if top else 0)) % 5
        if step == 0:
            return T[0]
        if step == 4:
            return (T[3] or R[3]) if x % 4 else R[4]
        if step == 3:
            return T[2]
        return T[1]
    return paint


def _water_painter(st):
    Wt, R, O = STYLE[st]["water"], STYLE[st]["rock"], STYLE[st]["out"]

    def paint(d, facing, x, y, f, m):
        if d < 0:
            return _floor_px(st, x, y, 0)
        if d < 1.5:
            return O
        if d < 3:
            return R[2] if (x + y) % 3 else R[1]
        if d < 5:
            return Wt[3]
        if d < 6.5:
            return Wt[2]
        xx, yy = (x + f * 2) % 16, y % 16
        if (yy == 5 and 3 <= xx <= 6) or (yy == 11 and 10 <= xx <= 13):
            return Wt[0] if f % 4 < 2 else Wt[1]
        return Wt[1] if (x * 7 + y * 3 + f) % 29 else Wt[2]
    return paint


def _crack_set():
    """A crazed network: three hand-drawn 8x8 crack shapes, one per quadrant (rotated), so cells differ."""
    shapes = [[(0, 2), (1, 2), (2, 3), (3, 3), (4, 4), (5, 4), (5, 5), (6, 6), (7, 6), (4, 5), (3, 6), (3, 7)],
              [(2, 0), (2, 1), (3, 2), (3, 3), (2, 4), (2, 5), (3, 5), (4, 5), (5, 6), (6, 6), (7, 7), (1, 5)],
              [(0, 6), (1, 5), (2, 5), (3, 4), (4, 4), (5, 3), (5, 2), (6, 1), (4, 3), (6, 4), (7, 4)]]
    out = set()
    for q, (ox, oy) in enumerate(((0, 0), (8, 0), (0, 8), (8, 8))):
        if q in (1, 2) and q != 2:
            continue                                                  # leave quiet stretches of plain floor
        for (x, y) in shapes[(q * 2 + 1) % 3]:
            if q in (1, 2):
                x, y = 7 - x, y
            out.add((ox + x, oy + y))
    return out


_CRACKS = _crack_set()


def _cracked(d, facing, x, y, f, m):
    """Granite cracked floor: the floor itself, crazed with dark cracks and a few sunken chips; a slow
    step breaks it (game: falls to the floor below at the same cell)."""
    F = STYLE["granite"]["floor"]
    if d < 0:
        return _floor_px("granite", x, y, 0)
    if _feather(d, x, y, 2.5):
        return _floor_px("granite", x, y, 0)
    xx, yy = x % 16, y % 16
    crack = _CRACKS
    if (xx, yy) in crack:
        return F[4]
    if (xx, yy - 1) in crack and h16(xx, yy, 13) > 110:
        return F[0]                                                   # lit lip of each crack
    if (xx, yy) in ((3, 8), (4, 8), (13, 14)):
        return F[3]
    return F[1] if h16(xx, yy, 17) < 230 else F[2]


def _mosaic(x, y):
    """Ancient chamber floor: worn square flagstones with an ochre lozenge inlay every other stone."""
    F, A = STYLE["granite"]["floor"], STYLE["granite"]["accent"]
    x, y = x % 16, y % 16
    if x == 0 or y == 0:
        return F[3]
    if x == 1 or y == 1:
        return F[0]
    u, v = abs(x - 8), abs(y - 8)
    if u + v == 4:
        return A[2]
    if u + v < 2:
        return A[1]
    return F[1] if h16(x, y, 5) < 236 else F[2]


def _gravel_painter(st):
    def paint(d, facing, x, y, f, m):
        if d < 0 or _feather(d, x, y):
            return None
        return _gravel_px(st, x, y)
    return paint


# ---------------------------------------------------------------- props
def canvas(w, h):
    return Image.new("RGBA", (w * 16, h * 16), (0, 0, 0, 0))


def _put(p, x, y, c):
    if 0 <= x < 32 * 4 and 0 <= y < 32 * 4:
        try:
            p[x, y] = c + (255,)
        except IndexError:
            pass


def ladder_up(st):
    """A wooden ladder leaning on the rock, its top lost in a dark hole in the ceiling (1x2)."""
    def paint():
        im = canvas(1, 2)
        p = im.load()
        R, O = STYLE[st]["rock"], STYLE[st]["out"]
        wood = [(236, 196, 140), (196, 146, 96), (140, 96, 70), (88, 58, 50)]
        d = ImageDraw.Draw(im)
        d.ellipse([2, 0, 13, 8], fill=(14, 12, 20, 255), outline=O + (255,))      # hole in the ceiling rock
        d.arc([2, 0, 13, 8], 200, 340, fill=R[0] + (255,))
        for y in range(4, 30):
            for x, c in ((3, wood[1]), (4, wood[2]), (11, wood[1]), (12, wood[2])):
                p[x, y] = c + (255,)
            p[2, y] = wood[3] + (255,)
            p[13, y] = wood[3] + (255,)
        for y in range(7, 30, 4):
            for x in range(5, 11):
                p[x, y] = wood[0] + (255,)
                p[x, y + 1] = wood[2] + (255,)
        contact_shade(im, 2, 14, 30)
        return [im]
    return paint


def ladder_down(st):
    """A square shaft in the floor with the top of a ladder showing (1x1)."""
    def paint():
        im = canvas(1, 1)
        d = ImageDraw.Draw(im)
        F, R, O = STYLE[st]["floor"], STYLE[st]["rock"], STYLE[st]["out"]
        wood = [(236, 196, 140), (196, 146, 96), (140, 96, 70)]
        d.rounded_rectangle([1, 2, 14, 14], 2, fill=R[2] + (255,), outline=O + (255,))
        d.rectangle([3, 4, 12, 13], fill=(14, 12, 20, 255))
        d.line([2, 2, 13, 2], fill=R[0] + (255,))
        d.line([2, 14, 13, 14], fill=F[3] + (255,))
        for x in (4, 11):
            d.line([x, 3, x, 13], fill=wood[1] + (255,))
            d.line([x + 1, 3, x + 1, 13], fill=wood[2] + (255,))
        for y in (5, 9, 13):
            d.line([5, y, 10, y], fill=wood[0] + (255,))
        return [im]
    return paint


def hole(st):
    """A ragged pit in the floor: rock lip lit on the far side, black depth (1x1). One-way down."""
    def paint():
        im = canvas(1, 1)
        d = ImageDraw.Draw(im)
        F, R, O = STYLE[st]["floor"], STYLE[st]["rock"], STYLE[st]["out"]
        d.ellipse([1, 3, 14, 14], fill=R[1] + (255,), outline=O + (255,))
        d.ellipse([3, 5, 12, 13], fill=(10, 8, 16, 255))
        d.arc([3, 5, 12, 13], 20, 160, fill=R[3] + (255,))
        d.arc([1, 3, 14, 14], 200, 340, fill=F[0] + (255,))
        return [im]
    return paint


def exit_light(st):
    """Daylight spilling in at the cave mouth (1x1, walkable): pale rays fanning out over the floor."""
    def paint():
        im = canvas(1, 1)
        p = im.load()
        F = STYLE[st]["floor"]
        hi = mix(F[0], (255, 250, 228), 0.6)
        for y in range(16):
            for x in range(16):
                ray = (x + y // 3) % 5 < 2
                if y >= 8 or ray:
                    p[x, y] = (hi if y >= 10 or (ray and y > 4) else F[0]) + (255,)
        return [im]
    return paint


def stalagmite(st):
    def paint():
        im = canvas(1, 2)
        R, O = STYLE[st]["rock"], STYLE[st]["out"]
        contact_shade(im, 3, 13, 30)
        pts = {}
        for y in range(6, 30):
            hw = 1 + (y - 6) * 0.22
            for x in range(16):
                if abs(x + 0.5 - 8) <= hw:
                    pts[(x, y)] = (x + 0.5 - 8) / hw
        p = im.load()
        for (x, y), u in pts.items():
            edge = (x - 1, y) not in pts or (x + 1, y) not in pts or (x, y - 1) not in pts
            c = O if edge else R[0] if u < -0.4 else R[1] if u < 0.2 else R[3]
            if not edge and y % 6 == 0:
                c = R[2]
            p[x, y] = c + (255,)
        draw_blobs(im, [(5, 28, 3.5, 2.5), (11.5, 28.5, 3, 2.2)], R, O)
        return [im]
    return paint


def rock(st, big=False):
    def paint():
        R, O = STYLE[st]["rock"], STYLE[st]["out"]
        if big:
            im = canvas(2, 2)
            contact_shade(im, 3, 29, 29)
            pts = draw_blobs(im, [(16, 16, 13, 11), (8, 20, 7, 7), (24, 19, 7, 7), (15, 10, 9, 6)], R, O, speck=63)
            p = im.load()
            for (x, y) in pts:
                if y >= 22 and p[x, y][:3] != O and (x, y + 1) in pts:
                    p[x, y] = (R[3] if y >= 25 else R[2]) + (255,)
            return [im]
        im = canvas(1, 1)
        contact_shade(im, 2, 14, 14)
        draw_blobs(im, [(8, 8.5, 6.5, 5.5), (5.5, 10, 4, 3.5)], R, O, speck=61)
        return [im]
    return paint


def rubble(st):
    def paint():
        im = canvas(1, 1)
        R, O = STYLE[st]["rock"], STYLE[st]["out"]
        contact_shade(im, 2, 15, 14)
        draw_blobs(im, [(5, 11, 3.5, 2.8), (11, 12, 3, 2.4), (8.5, 7.5, 2.6, 2.2), (13, 8, 1.8, 1.6)], R, O)
        return [im]
    return paint


def pebbles(st):
    def paint():
        im = canvas(1, 1)
        p = im.load()
        F = STYLE[st]["floor"]
        for x, y in ((3, 5), (9, 3), (12, 9), (5, 11), (10, 13)):
            p[x, y] = F[0] + (255,)
            p[x + 1, y] = F[0] + (255,)
            p[x, y + 1] = F[3] + (255,)
            p[x + 1, y + 1] = F[4] + (255,)
        return [im]
    return paint


def puddle(st):
    def paint():
        im = canvas(1, 1)
        d = ImageDraw.Draw(im)
        Wt, F = STYLE[st]["water"], STYLE[st]["floor"]
        d.ellipse([1, 5, 14, 13], fill=Wt[2] + (255,), outline=F[3] + (255,))
        d.ellipse([3, 7, 11, 11], fill=Wt[1] + (255,))
        d.line([5, 8, 8, 8], fill=Wt[0] + (255,))
        return [im]
    return paint


def crystal(st, big=True):
    """Moonstone crystal cluster: pale prisms with a bright facet and a dark side (1x2, or 1x1 small)."""
    def paint():
        A, O = STYLE[st]["accent"], STYLE[st]["out"]
        im = canvas(1, 2) if big else canvas(1, 1)
        H = im.height
        contact_shade(im, 2, 14, H - 2)
        p = im.load()
        prisms = ([(8, H - 2, 3.0, 22), (4, H - 2, 2.2, 13), (12, H - 2, 2.2, 15), (10, H - 3, 1.6, 9)] if big
                  else [(8, H - 2, 2.6, 11), (4, H - 2, 1.8, 7), (12, H - 3, 1.8, 6)])
        for cx, base, hw, ht in prisms:
            for y in range(base - ht, base + 1):
                t = (y - (base - ht)) / ht
                w = hw * min(1.0, t * 2.2 + 0.1)
                for x in range(16):
                    u = x + 0.5 - cx
                    if abs(u) <= w:
                        edge = abs(u) > w - 1
                        c = O if edge else A[0] if u < -w * 0.2 and t < 0.6 else A[1] if u < 0.3 * w else A[3]
                        p[x, y] = c + (255,)
        p[7, H - 18 if big else H - 9] = (255, 255, 255, 255)
        return [im]
    return paint


def moonstone():
    """A glowing moonstone boulder: grey rock with a pale opal stone set in its face (1x1)."""
    def paint():
        im = canvas(1, 1)
        R, O, A = STYLE["moon"]["rock"], STYLE["moon"]["out"], STYLE["moon"]["accent"]
        contact_shade(im, 2, 14, 14)
        draw_blobs(im, [(8, 9, 6.5, 5)], R, O)
        d = ImageDraw.Draw(im)
        d.ellipse([5, 5, 11, 11], fill=A[2] + (255,), outline=A[4] + (255,))
        d.ellipse([6, 6, 9, 9], fill=A[1] + (255,))
        im.putpixel((7, 7), (255, 255, 255, 255))
        return [im]
    return paint


def fossil_pedestal():
    """A limestone pedestal holding a spiral fossil (1x2): the fossil room's choice, one of two."""
    def paint():
        im = canvas(1, 2)
        R, O, F = STYLE["moon"]["rock"], STYLE["moon"]["out"], STYLE["moon"]["floor"]
        d = ImageDraw.Draw(im)
        contact_shade(im, 1, 15, 30)
        d.rectangle([3, 18, 12, 29], fill=R[1] + (255,), outline=O + (255,))
        d.line([4, 19, 4, 28], fill=R[0] + (255,))
        d.line([11, 19, 11, 28], fill=R[3] + (255,))
        d.rectangle([1, 14, 14, 18], fill=R[0] + (255,), outline=O + (255,))
        d.ellipse([3, 6, 12, 15], fill=(214, 196, 164, 255), outline=(98, 76, 60, 255))
        for k in range(14):
            a = k * 0.75
            r = 0.5 + k * 0.28
            im.putpixel((int(round(7.5 + math.cos(a) * r)), int(round(10.5 + math.sin(a) * r))), (120, 94, 72, 255))
        im.putpixel((5, 8), (250, 240, 214, 255))
        return [im]
    return paint


def torch():
    """Granite brazier on a stone foot: animated flame (3 frames), stays lit (1x2)."""
    def paint():
        frames = []
        R, O = STYLE["granite"]["rock"], STYLE["granite"]["out"]
        for f in range(3):
            im = canvas(1, 2)
            d = ImageDraw.Draw(im)
            contact_shade(im, 3, 13, 30)
            d.rectangle([5, 18, 10, 29], fill=R[1] + (255,), outline=O + (255,))
            d.line([6, 19, 6, 28], fill=R[0] + (255,))
            d.polygon([(2, 13), (13, 13), (11, 18), (4, 18)], fill=R[2] + (255,), outline=O + (255,))
            d.line([3, 14, 12, 14], fill=PATINA[1] + (255,))
            sway = (0, 1, -1)[f]
            d.polygon([(4, 13), (8 + sway, 2 + f % 2), (12, 13)], fill=FLAME[2] + (255,))
            d.polygon([(5, 13), (8 + sway, 5), (11, 13)], fill=FLAME[1] + (255,))
            d.polygon([(7, 13), (8 + sway, 8), (9, 13)], fill=FLAME[0] + (255,))
            frames.append(im)
        return frames
    return paint


def carving():
    """An ancient relief cut into the granite face: a sun disc with rays and a stylised winged figure
    in ochre, patina dots (2x2, placed on a wall face; no letters)."""
    def paint():
        im = canvas(2, 2)
        d = ImageDraw.Draw(im)
        R, O, A = STYLE["granite"]["rock"], STYLE["granite"]["out"], STYLE["granite"]["accent"]
        d.rounded_rectangle([2, 3, 29, 28], 3, fill=R[2] + (255,), outline=O + (255,))
        d.rectangle([4, 5, 27, 26], outline=R[0] + (255,))
        d.ellipse([12, 7, 19, 14], fill=A[1] + (255,), outline=A[3] + (255,))
        for a in range(0, 360, 45):
            r = math.radians(a)
            d.line([15.5 + math.cos(r) * 5, 10.5 + math.sin(r) * 5, 15.5 + math.cos(r) * 7, 10.5 + math.sin(r) * 7],
                   fill=A[2] + (255,))
        d.polygon([(15, 16), (6, 19), (9, 21), (15, 19), (21, 21), (25, 19), (16, 16)], fill=A[2] + (255,))
        d.line([15, 16, 15, 24], fill=A[3] + (255,))
        d.line([16, 16, 16, 24], fill=A[3] + (255,))
        for x, y in ((7, 8), (24, 8), (7, 24), (24, 24)):
            d.rectangle([x, y, x + 1, y + 1], fill=PATINA[1] + (255,))
        return [im]
    return paint


def tablet():
    """A standing stone tablet with rows of carved glyph marks (not letters) (1x2)."""
    def paint():
        im = canvas(1, 2)
        d = ImageDraw.Draw(im)
        R, O, A = STYLE["granite"]["rock"], STYLE["granite"]["out"], STYLE["granite"]["accent"]
        contact_shade(im, 1, 15, 30)
        d.rounded_rectangle([2, 3, 13, 29], 3, fill=R[1] + (255,), outline=O + (255,))
        d.line([3, 5, 3, 27], fill=R[0] + (255,))
        d.line([12, 6, 12, 28], fill=R[3] + (255,))
        for row, y in enumerate(range(8, 26, 4)):
            for k, x in enumerate(range(5, 11, 3)):
                shape = (row * 2 + k) % 3
                if shape == 0:
                    d.rectangle([x, y, x + 1, y + 1], fill=A[3] + (255,))
                elif shape == 1:
                    d.line([x, y, x + 1, y + 2], fill=A[3] + (255,))
                else:
                    d.point([(x, y + 1), (x + 1, y), (x + 1, y + 2)], fill=A[3] + (255,))
        return [im]
    return paint


def pillar():
    """A broken granite column with a carved band (1x3)."""
    def paint():
        im = canvas(1, 3)
        d = ImageDraw.Draw(im)
        R, O, A = STYLE["granite"]["rock"], STYLE["granite"]["out"], STYLE["granite"]["accent"]
        contact_shade(im, 1, 15, 46)
        d.rectangle([1, 42, 14, 46], fill=R[1] + (255,), outline=O + (255,))
        d.rectangle([3, 8, 12, 42], fill=R[1] + (255,), outline=O + (255,))
        d.line([4, 9, 4, 41], fill=R[0] + (255,))
        d.line([11, 9, 11, 41], fill=R[3] + (255,))
        d.line([8, 10, 8, 40], fill=R[2] + (255,))
        d.polygon([(3, 8), (6, 4), (8, 7), (10, 3), (12, 8)], fill=R[2] + (255,), outline=O + (255,))
        d.rectangle([3, 24, 12, 27], fill=A[2] + (255,), outline=A[4] + (255,))
        d.line([5, 25, 10, 25], fill=A[0] + (255,))
        return [im]
    return paint


def ruin():
    """Fallen carved blocks (2x1)."""
    def paint():
        im = canvas(2, 1)
        d = ImageDraw.Draw(im)
        R, O, A = STYLE["granite"]["rock"], STYLE["granite"]["out"], STYLE["granite"]["accent"]
        contact_shade(im, 1, 31, 14)
        d.rectangle([1, 5, 14, 13], fill=R[1] + (255,), outline=O + (255,))
        d.line([2, 6, 13, 6], fill=R[0] + (255,))
        d.rectangle([5, 8, 10, 10], fill=A[2] + (255,))
        d.polygon([(16, 13), (18, 7), (29, 6), (30, 13)], fill=R[2] + (255,), outline=O + (255,))
        d.line([19, 8, 28, 7], fill=R[0] + (255,))
        return [im]
    return paint


def statue():
    """Ancient guardian statue: a stylised crested bird on a plinth, weathered granite with patina (1x2)."""
    def paint():
        im = canvas(1, 2)
        d = ImageDraw.Draw(im)
        R, O = STYLE["granite"]["rock"], STYLE["granite"]["out"]
        contact_shade(im, 1, 15, 30)
        d.rectangle([2, 23, 13, 29], fill=R[2] + (255,), outline=O + (255,))
        d.line([3, 24, 12, 24], fill=R[0] + (255,))
        d.ellipse([3, 9, 12, 23], fill=R[1] + (255,), outline=O + (255,))
        d.ellipse([4, 3, 11, 11], fill=R[1] + (255,), outline=O + (255,))
        d.polygon([(7, 3), (5, 0), (9, 2)], fill=R[2] + (255,), outline=O + (255,))
        d.point([(6, 6), (9, 6)], fill=PATINA[0] + (255,))
        d.polygon([(7, 8), (9, 8), (8, 10)], fill=STYLE["granite"]["accent"][1] + (255,))
        d.line([4, 14, 6, 20], fill=R[3] + (255,))
        d.line([11, 14, 9, 20], fill=R[3] + (255,))
        return [im]
    return paint


def altar():
    """The ancient chamber's altar: a stepped granite dais with an ochre disc and patina corners (3x2)."""
    def paint():
        im = canvas(3, 2)
        d = ImageDraw.Draw(im)
        R, O, A = STYLE["granite"]["rock"], STYLE["granite"]["out"], STYLE["granite"]["accent"]
        contact_shade(im, 1, 47, 30)
        d.rectangle([1, 18, 46, 29], fill=R[2] + (255,), outline=O + (255,))
        d.line([2, 19, 45, 19], fill=R[0] + (255,))
        d.rectangle([7, 9, 40, 18], fill=R[1] + (255,), outline=O + (255,))
        d.line([8, 10, 39, 10], fill=R[0] + (255,))
        d.ellipse([18, 1, 29, 12], fill=A[1] + (255,), outline=A[3] + (255,))
        d.ellipse([21, 4, 26, 9], fill=A[0] + (255,), outline=A[2] + (255,))
        for x in (4, 42):
            d.rectangle([x, 22, x + 1, 25], fill=PATINA[1] + (255,))
        for x in range(10, 38, 6):
            d.rectangle([x, 13, x + 2, 15], fill=A[3] + (255,))
        return [im]
    return paint


def boulder(st):
    """Strength boulder (1x1, blocking, pushable): a big round rock in the style's stone, lit from the
    top-left, with two hand-hold cracks so it reads as movable, not as scenery."""
    def paint():
        im = canvas(1, 1)
        R, O = STYLE[st]["rock"], STYLE[st]["out"]
        contact_shade(im, 1, 15, 14)
        draw_blobs(im, [(8, 7.8, 7.2, 6.6)], R[:4], O, speck=67)
        p = im.load()
        for x, y in ((4, 9), (5, 10), (6, 10), (7, 11), (10, 4), (11, 5), (11, 6)):
            p[x, y] = R[4] + (255,)
        for x, y in ((4, 3), (5, 3), (3, 4)):
            p[x, y] = mix(R[0], (255, 255, 255), 0.4) + (255,)
        return [im]
    return paint


def smash_rock(st):
    """Rock Smash rock (1x1, blocking): a pale cracked rock, lighter than the style's stone so it reads
    as breakable, crossed by a dark crack network."""
    def paint():
        im = canvas(1, 1)
        R, F, O = STYLE[st]["rock"], STYLE[st]["floor"], STYLE[st]["out"]
        contact_shade(im, 2, 14, 14)
        ramp = [mix(F[0], (255, 255, 255), 0.2), F[0], F[2], R[2]]
        draw_blobs(im, [(8, 8.5, 6.5, 5.5), (5, 10, 3.5, 3.2)], ramp, O)
        p = im.load()
        for x, y in ((8, 4), (8, 5), (7, 6), (7, 7), (8, 8), (9, 9), (9, 10), (6, 9), (5, 10), (10, 7), (11, 6)):
            p[x, y] = R[4] + (255,)
        return [im]
    return paint


def _mouth_volcano(d, im):
    A, R, O = STYLE["volcano"]["accent"], STYLE["volcano"]["rock"], STYLE["volcano"]["out"]
    d.rectangle([17, 44, 30, 46], fill=A[3] + (255,))                                 # glow from the depths
    d.line([19, 45, 28, 45], fill=A[2] + (255,))
    for pts in (((6, 30), (8, 33), (7, 37), (9, 40)), ((40, 26), (38, 30), (40, 34))):
        d.line(pts, fill=A[2] + (255,))
    for x, y in ((22, 4), (25, 2), (27, 5)):
        d.ellipse([x - 2, y - 1, x + 2, y + 2], fill=(206, 200, 200, 255), outline=(150, 140, 144, 255))


def _mouth_quarry(d, im):
    R, O = STYLE["quarry"]["rock"], STYLE["quarry"]["out"]
    for x in (12, 32):                                                              # timber portal
        d.rectangle([x, 22, x + 3, 47], fill=WOOD[1] + (255,), outline=WOOD[3] + (255,))
        d.line([x + 1, 23, x + 1, 46], fill=WOOD[0] + (255,))
    d.rectangle([10, 18, 37, 22], fill=WOOD[1] + (255,), outline=WOOD[3] + (255,))
    d.line([11, 19, 36, 19], fill=WOOD[0] + (255,))
    d.rectangle([16, 23, 31, 47], fill=(14, 12, 20, 255))
    for x in (19, 28):                                                              # rails out of the mine
        d.line([x, 38, x, 47], fill=STEEL[1] + (255,))
    for y in (41, 45):
        d.line([18, y, 29, y], fill=WOOD[2] + (255,))
    d.rectangle([37, 24, 40, 28], fill=STYLE["quarry"]["accent"][0] + (255,), outline=WOOD[3] + (255,))
    d.point([(38, 23)], fill=WOOD[3] + (255,))


def _mouth_mystic(d, im):
    A, O, Wt = STYLE["mystic"]["accent"], STYLE["mystic"]["out"], STYLE["mystic"]["water"]
    for x, y in ((8, 16), (37, 13), (31, 6), (12, 9)):
        d.polygon([(x, y), (x + 2, y - 6), (x + 4, y)], fill=A[1] + (255,), outline=O + (255,))
        d.line([x + 1, y - 1, x + 2, y - 4], fill=A[0] + (255,))
    for x, n in ((17, 5), (20, 3), (25, 6), (29, 3)):                                # icicles in the arch
        d.line([x, 21, x, 21 + n], fill=Wt[0] + (255,))


def _mouth_lagoon(d, im):
    A, O, Wt = STYLE["lagoon"]["accent"], STYLE["lagoon"]["out"], STYLE["lagoon"]["water"]
    d.rectangle([16, 44, 31, 47], fill=Wt[3] + (255,))                               # sea water inside
    d.line([18, 45, 22, 45], fill=Wt[1] + (255,))
    for x, y in ((6, 22), (9, 26), (39, 20), (36, 28), (24, 9)):
        d.rectangle([x, y, x + 1, y], fill=STYLE["lagoon"]["dust"] + (255,))
        d.point([(x, y + 1), (x + 1, y + 1)], fill=O + (255,))
    for x in (5, 41):                                                               # coral at the foot
        d.line([x, 46, x, 40], fill=A[2] + (255,))
        d.line([x, 42, x - 2, 39], fill=A[2] + (255,))
        d.line([x, 43, x + 2, 40], fill=A[1] + (255,))


def _mouth_powerplant(d, im):
    R, O, A = STYLE["powerplant"]["rock"], STYLE["powerplant"]["out"], STYLE["powerplant"]["accent"]
    d.rectangle([11, 17, 36, 47], fill=R[1] + (255,), outline=O + (255,))           # concrete portal
    d.line([12, 18, 35, 18], fill=R[0] + (255,))
    for x in range(12, 36):                                                         # hazard lintel
        for y in (20, 21, 22):
            d.point((x, y), fill=(A[2] if (x + y) % 6 < 3 else (54, 54, 66)) + (255,))
    d.rectangle([15, 24, 32, 47], fill=(14, 12, 20, 255), outline=R[3] + (255,))
    for y in range(26, 46, 4):                                                      # shutter slats, half up
        d.line([16, y, 31, y], fill=(40, 42, 56, 255))
    d.rectangle([38, 26, 40, 46], fill=STEEL[1] + (255,), outline=STEEL[3] + (255,))  # pipe down the side
    d.rectangle([37, 34, 41, 35], fill=STEEL[3] + (255,))
    d.rectangle([7, 28, 9, 31], fill=A[1] + (255,), outline=O + (255,))              # warning lamp


def _mouth_garden(d, im):
    O = STYLE["garden"]["out"]
    for box, a0, a1 in (([12, 15, 35, 55], 190, 350), ([10, 13, 37, 57], 200, 340)):  # roots over the arch
        d.arc(box, a0, a1, fill=ROOT[1] + (255,), width=2)
    d.arc([10, 13, 37, 57], 200, 340, fill=ROOT[3] + (255,))
    for x0, x1 in ((12, 6), (35, 42)):                                              # roots down the sides
        d.line([x0, 30, (x0 + x1) // 2, 40, x1, 47], fill=ROOT[1] + (255,), width=2)
        d.line([x0, 31, (x0 + x1) // 2, 41, x1, 47], fill=ROOT[3] + (255,))
    for x, y in ((8, 10), (16, 5), (27, 4), (37, 9), (22, 7)):                      # moss and leaves on top
        d.ellipse([x - 3, y - 2, x + 3, y + 2], fill=MOSS[1] + (255,), outline=MOSS[2] + (255,))
        d.point((x - 1, y - 1), fill=MOSS[0] + (255,))
    for x, y in ((18, 26), (29, 28), (24, 33)):
        d.point((x, y), fill=STYLE["garden"]["accent"][1] + (255,))                 # glowworms inside


MOUTH_FX = {"volcano": _mouth_volcano, "quarry": _mouth_quarry, "mystic": _mouth_mystic, "lagoon": _mouth_lagoon,
            "powerplant": _mouth_powerplant, "garden": _mouth_garden}


def cave_mouth(st):
    """The cave seen from the route (3x3): a rock arch in the style's stone around a dark opening; the
    middle bottom cell is the door (warp). Placed against the route's cliff or wall."""
    def paint():
        im = canvas(3, 3)
        R, O = STYLE[st]["rock"], STYLE[st]["out"]
        contact_shade(im, 1, 47, 46)
        draw_blobs(im, [(24, 26, 23, 19), (8, 36, 8, 10), (40, 36, 8, 10), (24, 12, 16, 10), (12, 18, 9, 8),
                        (36, 18, 9, 8)], R, O, speck=71)
        d = ImageDraw.Draw(im)
        d.ellipse([14, 18, 33, 52], fill=(14, 12, 20, 255), outline=O + (255,))
        d.rectangle([16, 34, 31, 47], fill=(14, 12, 20, 255))
        d.arc([14, 18, 33, 52], 190, 350, fill=R[0] + (255,))
        if st == "moon":
            A = STYLE["moon"]["accent"]
            for x, y in ((9, 14), (38, 12), (33, 6)):
                d.polygon([(x, y), (x + 2, y - 5), (x + 4, y)], fill=A[1] + (255,), outline=O + (255,))
        elif st == "granite":
            A = STYLE["granite"]["accent"]
            d.rectangle([20, 14, 27, 16], fill=A[2] + (255,), outline=A[4] + (255,))      # carved lintel
            d.point([(23, 15), (24, 15)], fill=A[0] + (255,))
        else:
            MOUTH_FX[st](d, im)
        for x, y in ((6, 44), (42, 45)):
            d.ellipse([x - 2, y - 1, x + 2, y + 1], fill=R[2] + (255,), outline=O + (255,))
        return [im]
    return paint


# ---------------------------------------------------------------- the kits
TERRAIN, PROPS = {}, {}
for st in STYLE:
    p = f"{st}-cave"
    g = f"{p}-wall"
    TERRAIN[f"{p}-floor"] = dict(kind="fill", behaviour="CAVE", variants=[
        (lambda x, y, v=v, st=st: _floor_px(st, x, y, v)) for v in range(4)])
    TERRAIN[f"{p}-gravel"] = dict(kind="blob", patch=True, walk=True, behaviour="CAVE", paint=_gravel_painter(st),
                                  soft=False, sdf=dict(margin=1.0, radius=7, wobble=0.0, freq=1))
    wsdf = WALL_SDF.get(st, dict(margin=1.0, radius=5.5, wobble=0.8, freq=1))
    TERRAIN[g] = dict(kind="blob", behaviour="NORMAL", paint=_wall_painter(st), group=g, solid=True, soft=False,
                      joins=wall_joins(g), sdf=wsdf)
    TERRAIN[f"{p}-wall-face"] = dict(kind="blob", behaviour="NORMAL", paint=_face_painter(st), group=g, face=True,
                                     solid=True, soft=False, joins=face_joins(g), sdf=wsdf)
    root = STYLE[st].get("ledge") in ("root", "timber")
    TERRAIN[f"{p}-ledge"] = dict(kind="row", axis="h", behaviour="JUMP_SOUTH",
                                 paint=_root_ledge_painter(st, "S") if root else _ledge_painter(st))
    for dn, axis, word in (("N", "h", "north"), ("E", "v", "east"), ("W", "v", "west")):
        TERRAIN[f"{p}-ledge-{word}"] = dict(kind="row", axis=axis, behaviour=f"JUMP_{word.upper()}",
                                            paint=_root_ledge_painter(st, dn) if root else _side_ledge_painter(st, dn))
    TERRAIN[f"{p}-stairs"] = dict(kind="row", axis="v", behaviour="NORMAL", paint=_stairs_painter(st))
    TERRAIN[f"{p}-water"] = dict(kind="blob", behaviour="POND_WATER", paint=_water_painter(st), frames=8, soft=False,
                                 sdf=dict(margin=1.0, radius=6, wobble=0.6, freq=1))
    fl = f"{p}-floor"
    PROPS[f"{p}-ladder-up"] = dict(cells=(1, 2), paint=ladder_up(st), ground=fl)
    PROPS[f"{p}-ladder-down"] = dict(cells=(1, 1), paint=ladder_down(st), ground=fl, walk=True)
    PROPS[f"{p}-hole"] = dict(cells=(1, 1), paint=hole(st), ground=fl, walk=True)
    PROPS[f"{p}-exit"] = dict(cells=(1, 1), paint=exit_light(st), ground=fl, walk=True)
    PROPS[f"{p}-stalagmite"] = dict(cells=(1, 2), paint=stalagmite(st), ground=fl)
    PROPS[f"{p}-rock"] = dict(cells=(1, 1), paint=rock(st), ground=fl)
    PROPS[f"{p}-rock-big"] = dict(cells=(2, 2), paint=rock(st, True), ground=fl)
    PROPS[f"{p}-rubble"] = dict(cells=(1, 1), paint=rubble(st), ground=fl)
    PROPS[f"{p}-pebbles"] = dict(cells=(1, 1), paint=pebbles(st), ground=fl, walk=True)
    PROPS[f"{p}-puddle"] = dict(cells=(1, 1), paint=puddle(st), ground=fl, walk=True)
    PROPS[f"{p}-boulder"] = dict(cells=(1, 1), paint=boulder(st), ground=fl, strength=True)
    PROPS[f"{p}-smash-rock"] = dict(cells=(1, 1), paint=smash_rock(st), ground=fl, smash=True)
    PROPS[f"cave-mouth-{st}"] = dict(cells=(3, 3), paint=cave_mouth(st), emissive=[(14, 12, 20)])

TERRAIN["granite-cave-cracked"] = dict(kind="blob", behaviour="CRACKED_FLOOR", paint=_cracked, walk=True, soft=False,
                                       sdf=dict(margin=0.5, radius=4, wobble=0.0, freq=1))
TERRAIN["granite-cave-mosaic"] = dict(kind="fill", behaviour="CAVE", variants=[_mosaic])
PROPS["moon-cave-crystal"] = dict(cells=(1, 2), paint=crystal("moon"), ground="moon-cave-floor")
PROPS["moon-cave-crystal-small"] = dict(cells=(1, 1), paint=crystal("moon", False), ground="moon-cave-floor")
PROPS["moon-cave-moonstone"] = dict(cells=(1, 1), paint=moonstone(), ground="moon-cave-floor")
PROPS["moon-cave-fossil"] = dict(cells=(1, 2), paint=fossil_pedestal(), ground="moon-cave-floor")
PROPS["granite-cave-torch"] = dict(cells=(1, 2), paint=torch(), ground="granite-cave-floor", order=[0, 1, 2],
                                   emissive=FLAME[:3])
PROPS["granite-cave-carving"] = dict(cells=(2, 2), paint=carving(), ground="granite-cave-floor")
PROPS["granite-cave-tablet"] = dict(cells=(1, 2), paint=tablet(), ground="granite-cave-floor")
PROPS["granite-cave-pillar"] = dict(cells=(1, 3), paint=pillar(), ground="granite-cave-floor")
PROPS["granite-cave-ruin"] = dict(cells=(2, 1), paint=ruin(), ground="granite-cave-floor")
PROPS["granite-cave-statue"] = dict(cells=(1, 2), paint=statue(), ground="granite-cave-floor")
PROPS["granite-cave-altar"] = dict(cells=(3, 2), paint=altar(), ground="granite-cave-floor")

# Review scenes (gen_overworld.py --cave): a chamber with a south face, a pillar, a ledge, stairs, a pool,
# ladders, a hole and each style's props. W wall, k face, . floor, g gravel, ~ water, _ ledge, S stairs, c cracked.
SCENE_ROWS = [
    "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
    "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
    "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
    "WWWWkkkkkkkWWWWWWWWWWWWkkkkkkWWW",
    "WWWWkkkkkkkWWWWWWWWWWWWkkkkkkWWW",
    "WWW.........kkkkkkkkkk........WW",
    "WW..........kkkkkkkkkk........WW",
    "WW..gggg.......................W",
    "W..ggggg.....WWWW..........~~~.W",
    "W...ggg......kkkk.........~~~~~W",
    "W............kkkk..........~~~.W",
    "W..............................W",
    "W______________.....ccccc......W",
    "W...............WWWWccccc......W",
    "W...............kSkkccccc......W",
    "W..WWW..........kSkk...........W",
    "W..kkk.........................W",
    "W..kkk.........................W",
    "W..............................W",
    "WWWWWWWWWWWWWWW....WWWWWWWWWWWWW",
]
SCENE_PROPS = {
    "moon": [("moon-cave-ladder-up", 6, 6), ("moon-cave-ladder-down", 20, 10), ("moon-cave-hole", 24, 17),
             ("moon-cave-stalagmite", 3, 7), ("moon-cave-crystal", 10, 9), ("moon-cave-crystal-small", 11, 9),
             ("moon-cave-moonstone", 25, 7), ("moon-cave-rock-big", 8, 18), ("moon-cave-rock", 20, 15),
             ("moon-cave-rubble", 29, 11), ("moon-cave-pebbles", 22, 12), ("moon-cave-puddle", 6, 10),
             ("moon-cave-fossil", 13, 17), ("moon-cave-fossil", 15, 17), ("moon-cave-exit", 15, 19),
             ("moon-cave-exit", 16, 19), ("moon-cave-exit", 17, 19), ("moon-cave-exit", 18, 19)],
    "granite": [("granite-cave-ladder-up", 6, 6), ("granite-cave-ladder-down", 20, 10), ("granite-cave-hole", 24, 17),
                ("granite-cave-stalagmite", 3, 7), ("granite-cave-torch", 9, 7), ("granite-cave-torch", 27, 6),
                ("granite-cave-carving", 14, 4), ("granite-cave-tablet", 11, 10), ("granite-cave-pillar", 29, 17),
                ("granite-cave-ruin", 8, 17), ("granite-cave-statue", 13, 18), ("granite-cave-altar", 20, 18),
                ("granite-cave-rubble", 29, 11), ("granite-cave-pebbles", 22, 11), ("granite-cave-puddle", 6, 10),
                ("granite-cave-exit", 15, 19), ("granite-cave-exit", 16, 19), ("granite-cave-exit", 17, 19),
                ("granite-cave-exit", 18, 19)],
}


def scene(st):
    """(rows, chars, props, ground) of the review scene for one style."""
    p = f"{st}-cave"
    chars = {"W": f"{p}-wall", "k": f"{p}-wall-face", "g": f"{p}-gravel", "~": f"{p}-water", "_": f"{p}-ledge",
             "S": f"{p}-stairs", ".": None,
             "c": "granite-cave-cracked" if st == "granite" else f"{p}-gravel"}
    return SCENE_ROWS, chars, SCENE_PROPS.get(st, []), f"{p}-floor"
