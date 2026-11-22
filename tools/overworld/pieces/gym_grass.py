"""Grass gym (Canopy Conservatory) surroundings: cream flagstone garden path, timber-edged
flower beds, a stone-coped lily pond, potted topiaries, bud lanterns, a garden bench, a bee
hive, sunflowers and seed sacks. Palette pulled from the gym's own sheet (cream stone, leaf
greens, warm timber, terracotta, blossom pink, warm glow) so pieces sit next to it.
Slugs are prefixed `grass-`. GYM describes the review scene (review-gym-grass.png)."""
import math

from PIL import Image, ImageDraw

from overworld_kit import FOLIAGE_OUT, IO, contact_shade, draw_blobs, h16

TAU = 2 * math.pi
CREAM = [(250, 244, 222), (230, 220, 190), (200, 188, 160), (158, 148, 134), (112, 104, 110)]
LEAFG = [(178, 230, 116), (118, 200, 90), (72, 162, 74), (46, 122, 66), (30, 84, 58)]
DLEAF = [(112, 176, 86), (74, 140, 72), (50, 108, 64), (34, 78, 56), (22, 52, 46)]
TIMBER = [(226, 176, 116), (192, 138, 86), (154, 102, 66), (112, 72, 54), (76, 48, 44)]
STONEW = [(214, 210, 190), (182, 178, 160), (146, 144, 132), (108, 108, 104), (74, 76, 80)]
POT = [(240, 156, 106), (212, 116, 78), (172, 84, 62), (128, 60, 54), (88, 42, 46)]
PINK = [(255, 196, 222), (250, 140, 186), (214, 88, 146), (156, 56, 112)]
YELLOW = [(255, 246, 170), (255, 214, 92), (226, 160, 60)]
WHITE = [(255, 255, 246), (226, 228, 236)]
GLOW = [(255, 250, 206), (255, 228, 140), (244, 186, 96)]
POND = [(206, 246, 244), (132, 214, 222), (84, 176, 204), (60, 136, 180), (44, 98, 150)]
SOIL = [(166, 120, 86), (134, 94, 70), (106, 72, 58), (78, 52, 48), (54, 36, 40)]
BURLAP = [(232, 210, 158), (206, 178, 124), (168, 140, 96), (118, 94, 70)]
TIN = [(214, 236, 226), (150, 196, 186), (98, 150, 150), (60, 100, 110)]
LOAM = [(150, 108, 76), (124, 88, 64), (104, 72, 56), (84, 56, 48), (60, 40, 40)]
LITTER = [(214, 150, 74), (176, 112, 58), (168, 160, 78), (122, 116, 58)]
ROSE = [(255, 176, 196), (236, 92, 128), (184, 48, 92), (120, 30, 70)]


def _has(facing, side):
    return facing is not None and side in facing


def _a(c):
    return c + (255,)


# ---------------------------------------------------------------- ground (fill)
# Dark garden loam: a calm base with sparse bark chips, fallen leaves, clover sprigs and petals.
# Each variant is an exact 16 px repeat; features stay inside the tile so cells join seamlessly.
SPECKS = (
    (("chip", 3, 4), ("clover", 10, 10), ("pit", 13, 14)),
    (("leaf", 9, 5), ("petal", 3, 12)),
    (("chip", 12, 9), ("leaf2", 5, 3)),
    (("pit", 6, 11),),
)


def _speck(kind, dx, dy):
    if kind == "chip":                       # bark mulch chip, lit top, shadow below
        return {(0, 0): LOAM[1], (1, 0): LOAM[1], (1, 1): LOAM[3]}.get((dx, dy))
    if kind in ("leaf", "leaf2"):            # fallen leaf
        a, b = (LITTER[0], LITTER[1]) if kind == "leaf" else (LITTER[2], LITTER[3])
        return {(0, 0): a, (1, 0): a, (1, -1): a, (2, -1): b, (0, 1): LOAM[4], (1, 1): LOAM[3]}.get((dx, dy))
    if kind == "clover":                     # three-leaf sprig
        return {(0, 0): LEAFG[1], (2, 0): LEAFG[2], (1, -1): LEAFG[0], (1, 0): DLEAF[2],
                (1, 1): DLEAF[3], (0, 1): LOAM[4], (2, 1): LOAM[4]}.get((dx, dy))
    if kind == "petal":
        return {(0, 0): PINK[1], (1, 0): PINK[2]}.get((dx, dy))
    if kind == "petalw":
        return {(0, 0): WHITE[0], (1, 0): WHITE[1]}.get((dx, dy))
    if kind == "pit":
        return (94, 64, 52) if (dx, dy) == (0, 0) else None
    return None


def ground_px(x, y, v=0):
    x, y = x % 16, y % 16
    for kind, sx, sy in SPECKS[v % 4]:
        c = _speck(kind, x - sx, y - sy)
        if c is not None:
            return c
    return LOAM[2]


# ---------------------------------------------------------------- terrain
# Flagstones: three bands of irregular cream slabs (16 px periodic) with mossy grout.
BANDS = ((0, 6, (5, 12)), (6, 11, (2, 9)), (11, 16, (7, 14)))


def _flag_px(x, y):
    for b, (y0, y1, splits) in enumerate(BANDS):
        if y0 <= y < y1:
            break
    if y == y1 - 1 or x in splits:
        return DLEAF[1] if (x * 3 + y) % 5 else DLEAF[0]       # moss grout
    xs = sorted(splits)
    left = max([s for s in xs if s < x], default=xs[-1] - 16) + 1
    right = min([s for s in xs if s > x], default=xs[0] + 16) - 1
    top, bot = y0, y1 - 2
    slab = sum(1 for s in xs if s < x) + 3 * b
    if (x in (left, right)) and (y in (top, bot)):
        return DLEAF[1]                                         # rounded slab corner
    if y == top or x == left:
        return CREAM[0]
    if y == bot or x == right:
        return CREAM[3]
    if (x + 2 * y) % 7 == 0:
        return CREAM[3] if slab % 2 else CREAM[2]               # fixed pitting
    return (CREAM[1], STONEW[1], CREAM[2])[slab % 3]


def flagstone(d, facing, x, y, f, m):
    """Cream garden flagstones in moss; dark stone outline into the lawn."""
    if d < -1:
        return ground_px(x, y)
    if d < 0:
        return LOAM[4]
    if d < 1:
        return STONEW[4]
    if d < 2:
        return CREAM[3] if (_has(facing, "S") or _has(facing, "E")) else CREAM[0]
    return _flag_px(x, y)


# Flower bed: tilled soil furrows, one blossom per 8x8 quarter, timber plank edging.
BLOOMS = ((3, 3, 0), (11, 3, 1), (7, 11, 2), (15, 11, 0))
BLOOM_COLS = (PINK[1], YELLOW[1], WHITE[0])


def _bed_px(x, y):
    for bx, by, k in BLOOMS:
        dx, dy = (x - bx + 8) % 16 - 8, y - by
        col = BLOOM_COLS[k]
        if (dx, dy) == (0, 0):
            return YELLOW[2] if k != 1 else POT[2]
        if abs(dx) + abs(dy) == 1:
            if (dx, dy) == (1, 0) or (dx, dy) == (0, 1):
                return {0: PINK[2], 1: YELLOW[2], 2: WHITE[1]}[k]
            return col
        if (dx, dy) in ((-1, 2), (1, 2), (0, 2)):
            return LEAFG[2] if dx else LEAFG[3]
        if (dx, dy) in ((-2, 2), (2, 1)):
            return LEAFG[1]
    if y % 4 == 3:
        return SOIL[3]
    if y % 4 == 0:
        return SOIL[1]
    return SOIL[2] if (x + y) % 5 else SOIL[3]


def flowerbed(d, facing, x, y, f, m):
    """Raised bed: 1 px dark outline, timber edging (taller south face), soil + blossoms."""
    if d < 0:
        return LOAM[4] if _has(facing, "S") and d > -1.5 else ground_px(x, y)
    if d < 1:
        return TIMBER[4]
    south = _has(facing, "S")
    if south and d < 5:                     # short south face of the edging board
        if d < 2:
            return TIMBER[3]
        if d < 4:
            return TIMBER[2] if (x % 8) else TIMBER[3]
        return TIMBER[0]
    if d < 3:
        if _has(facing, "N") or _has(facing, "W"):
            return TIMBER[0] if d < 2 else TIMBER[1]
        return TIMBER[1] if d < 2 else TIMBER[2]
    if d < 4:
        return SOIL[4]
    return _bed_px(x, y)


# Lily pond: stone coping, sunken water with drifting ripples (4 frames), fixed lily pads.
PADS = ((5, 5, True), (12, 12, False))


def _pad_px(x, y):
    for cx, cy, lotus in PADS:
        dx, dy = x - cx, y - cy
        r = dx * dx + dy * dy
        if lotus and (dx, dy) in ((0, -1), (-1, -1), (1, -1), (0, -2)):
            return PINK[0] if dy == -2 or dx == -1 else PINK[1]
        if lotus and (dx, dy) == (0, 0):
            return YELLOW[0]
        if r <= 9 and not (dx > 0 and dy == 0 or dx > 0 and dy == -1 and r <= 4):
            if r > 6:
                return DLEAF[3]
            return LEAFG[1] if dx + dy < 0 else LEAFG[2]
    return None


def lily_pond(d, facing, x, y, f, m):
    if d < -1:
        return ground_px(x, y)
    if d < 0:
        return LOAM[4]
    if d < 1:
        return STONEW[4]
    if d < 3:
        if _has(facing, "S") or _has(facing, "E"):
            return STONEW[2] if d < 2 else STONEW[3]
        return STONEW[0] if d < 2 else STONEW[1]
    if _has(facing, "N") and d < 5:          # inner bank shadow under the north coping
        return POND[4] if d < 4 else POND[3]
    if d < 3.5:
        return POND[4]
    if d > 5:
        c = _pad_px(x, y)
        if c is not None:
            return c
    v = math.sin(TAU / 16 * (x + 2 * y) + TAU * f / 4) + 0.7 * math.sin(TAU / 16 * (2 * x - y) - TAU * f / 4)
    if v > 1.35:
        return POND[0]
    return POND[1] if v > 0.6 else POND[2] if v > -0.9 else POND[3]


# Border: a tall clipped hedge wall wrapped in climbing roses, on a timber planter kerb.
ROSES_TOP = ((11, 5),)
ROSES_FACE = ((3, 0), (10, 2), (14, 0))     # (x, row-on-face) per 16 px


def _clip_px(x, y):
    """Clipped hedge top: offset rows of small rounded leaf cushions, lit from the top-left."""
    period = 8
    row = y // period
    u = (x + (4 if row % 2 else 0)) % period
    v = y % period
    nx, ny = (u + 0.5 - 4) / 4, (v + 0.5 - 4) / 4
    r = math.hypot(nx, ny)
    if r > 1.02:
        return DLEAF[3]
    l = -nx * 0.65 - ny * 0.75
    return LEAFG[1] if l > 0.75 else LEAFG[2] if l > 0.05 else DLEAF[1] if l > -0.55 else DLEAF[2]


def _rose(x, y, spots):
    for rx, ry in spots:
        dx, dy = x - rx, y - ry
        if (dx, dy) == (0, 0):
            return ROSE[0]
        if (dx, dy) in ((1, 0), (0, 1)):
            return ROSE[1]
        if (dx, dy) == (1, 1):
            return ROSE[2]
        if (dx, dy) in ((-1, 1), (2, 1)):
            return ROSE[3]
    return None


FACE = 9          # px height of the south face (wall reads tall)


def hedge_wall(d, facing, x, y, f, m):
    if d < -1.5:
        return ground_px(x, y)
    if d < 0:
        return LOAM[4] if _has(facing, "S") else ground_px(x, y)
    if d < 1:
        return DLEAF[4]
    if _has(facing, "S") and d < FACE:
        if d < 2:
            return TIMBER[3]                                 # planter kerb
        if d < 3:
            return TIMBER[1] if x % 8 else TIMBER[3]
        if d >= FACE - 1:
            return LEAFG[1]                                  # clipped top lip
        fy = int(FACE - 1 - d)                               # 0 at top of the face
        c = _rose(x % 16, fy, ROSES_FACE) if fy < 4 else None
        if c:
            return c
        shade = DLEAF[1] if fy < 2 else DLEAF[2] if fy < 4 else DLEAF[3]
        if (x * 3 + fy * 5) % 7 == 0:
            return DLEAF[1] if fy >= 2 else LEAFG[2]        # leaf texture
        return shade
    if _has(facing, "E") and d < 2.5:
        return DLEAF[3] if d < 2 else DLEAF[2]
    if (_has(facing, "N") or _has(facing, "W")) and d < 2:
        return LEAFG[1]
    c = _rose(x, y, ROSES_TOP)
    return c or _clip_px(x, y)


TERRAIN = {
    "grass-ground": dict(kind="fill", behaviour="NORMAL",
                         variants=[(lambda x, y, v=v: ground_px(x, y, v)) for v in range(4)]),
    "grass-border": dict(kind="blob", behaviour="NORMAL", paint=hedge_wall,
                         sdf=dict(margin=1.0, radius=3, wobble=0.0, freq=1)),
    "grass-flagstone": dict(kind="blob", behaviour="NORMAL", paint=flagstone,
                            sdf=dict(margin=2, radius=3, wobble=0.4, freq=1)),
    "grass-flowerbed": dict(kind="blob", behaviour="NORMAL", paint=flowerbed,
                            sdf=dict(margin=1.5, radius=2, wobble=0.0, freq=1)),
    "grass-lily-pond": dict(kind="blob", behaviour="POND_WATER", paint=lily_pond, frames=4,
                            sdf=dict(margin=2, radius=4, wobble=0.5, freq=1)),
}


# ---------------------------------------------------------------- props
def _canvas(w, h):
    return Image.new("RGBA", (w * 16, h * 16), (0, 0, 0, 0))


def _pot(d, x0, x1, y0, y1):
    d.polygon([(x0, y0), (x1, y0), (x1 - 2, y1), (x0 + 2, y1)], fill=_a(POT[1]), outline=_a(POT[4]))
    d.rectangle([x0 - 1, y0, x1 + 1, y0 + 2], fill=_a(POT[0]), outline=_a(POT[4]))
    d.line([x0 + 1, y0 + 4, x0 + 3, y1 - 1], fill=_a(POT[0]))
    d.line([x1 - 2, y0 + 4, x1 - 3, y1 - 1], fill=_a(POT[2]))


def topiary():
    im = _canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 3, 13, 30, alpha=90)
    d.line([8, 8, 8, 22], fill=_a(TIMBER[3]))
    draw_blobs(im, [(8, 17, 5.5, 4.5)], LEAFG, FOLIAGE_OUT, speck=81)
    draw_blobs(im, [(8, 9.5, 4.5, 3.8)], LEAFG, FOLIAGE_OUT, speck=82)
    draw_blobs(im, [(8, 3.5, 2.6, 2.4)], LEAFG, FOLIAGE_OUT)
    p = im.load()
    for x, y in ((6, 15), (10, 17), (7, 8), (9, 11), (8, 2)):
        p[x, y] = _a(PINK[0])
    _pot(d, 3, 12, 22, 29)
    return [im]


def bud_lantern():
    im = _canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 12, 30, alpha=90)
    d.rectangle([2, 27, 7, 29], fill=_a(STONEW[2]), outline=_a(STONEW[4]))
    d.line([3, 27, 6, 27], fill=_a(STONEW[0]))
    d.rectangle([4, 5, 5, 27], fill=_a(TIMBER[1]))
    d.line([4, 5, 4, 26], fill=_a(TIMBER[0]))
    d.line([6, 6, 6, 26], fill=_a(TIMBER[4]))
    d.line([3, 5, 3, 26], fill=_a(TIMBER[4]))
    # curled hook arm with a vine
    d.line([4, 3, 10, 3], fill=_a(TIMBER[3]))
    d.line([4, 2, 9, 2], fill=_a(TIMBER[1]))
    d.point([(11, 4), (11, 5)], fill=_a(TIMBER[3]))
    for x, y in ((6, 9), (5, 11), (4, 13), (5, 16), (6, 18), (5, 21)):
        im.putpixel((x, y), _a(LEAFG[1]))
        im.putpixel((x - 1 if x > 4 else x + 1, y + 1), _a(LEAFG[3]))
    # hanging bud: glowing core held in pink petals
    d.ellipse([8, 6, 14, 15], fill=_a(GLOW[1]), outline=_a(PINK[3]))
    d.ellipse([9, 8, 12, 13], fill=_a(GLOW[0]))
    d.polygon([(8, 9), (9, 5), (11, 8)], fill=_a(PINK[1]), outline=_a(PINK[3]))
    d.polygon([(14, 9), (13, 5), (11, 8)], fill=_a(PINK[2]), outline=_a(PINK[3]))
    d.point([(9, 6), (10, 7)], fill=_a(PINK[0]))
    d.line([10, 4, 12, 4], fill=_a(LEAFG[3]))
    d.point((11, 16), fill=_a(GLOW[2]))
    return [im]


def bench():
    im = _canvas(2, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 30, 14, alpha=90)
    for x in (4, 27):                                   # legs
        d.rectangle([x, 10, x + 1, 13], fill=_a(TIMBER[4]))
    d.rectangle([1, 1, 30, 4], fill=_a(TIMBER[1]), outline=_a(TIMBER[4]))   # backrest
    d.line([2, 2, 29, 2], fill=_a(TIMBER[0]))
    d.rectangle([1, 5, 30, 11], fill=_a(TIMBER[2]), outline=_a(TIMBER[4]))  # seat (slats)
    for y in (6, 8):
        d.line([2, y, 29, y], fill=_a(TIMBER[0]))
        d.line([2, y + 1, 29, y + 1], fill=_a(TIMBER[1]))
    d.line([2, 10, 29, 10], fill=_a(TIMBER[3]))
    for x0 in (0, 28):                                  # cream scroll armrests
        d.rectangle([x0, 0, x0 + 3, 12], fill=_a(CREAM[1]), outline=_a(CREAM[4]))
        d.line([x0 + 1, 1, x0 + 1, 10], fill=_a(CREAM[0]))
        d.line([x0 + 2, 11, x0 + 2, 11], fill=_a(CREAM[3]))
    for x, y in ((10, 1), (21, 1)):                     # leaf carving on the backrest
        d.point([(x, y + 1), (x + 1, y + 1)], fill=_a(LEAFG[2]))
    return [im]


def beehive():
    frames = []
    bees = (((3, 7), (12, 3)), ((5, 5), (10, 6)), ((2, 4), (13, 5)))
    for k in range(3):
        im = _canvas(1, 2)
        d = ImageDraw.Draw(im)
        contact_shade(im, 2, 14, 30, alpha=90)
        d.rectangle([3, 26, 4, 29], fill=_a(TIMBER[4]))
        d.rectangle([11, 26, 12, 29], fill=_a(TIMBER[4]))
        for y0 in (19, 13):                              # two stacked hive boxes
            d.rectangle([2, y0, 13, y0 + 6], fill=_a(CREAM[1]), outline=_a(CREAM[4]))
            d.line([3, y0 + 1, 12, y0 + 1], fill=_a(CREAM[0]))
            d.line([3, y0 + 5, 12, y0 + 5], fill=_a(CREAM[3]))
        d.rectangle([5, 23, 10, 24], fill=_a(IO))       # entrance slot
        d.rectangle([1, 25, 14, 26], fill=_a(TIMBER[2]), outline=_a(TIMBER[4]))
        d.polygon([(0, 13), (8, 7), (15, 13)], fill=_a(LEAFG[2]), outline=_a(DLEAF[4]))  # leaf-green gable roof
        d.line([2, 12, 8, 8], fill=_a(LEAFG[0]))
        d.line([9, 8, 13, 11], fill=_a(LEAFG[3]))
        for bx, by in bees[k]:
            im.putpixel((bx, by), _a(YELLOW[1]))
            im.putpixel((bx + 1, by), _a(IO))
            im.putpixel((bx, by - 1), _a(WHITE[0]))
        frames.append(im)
    return frames


def sunflowers():
    frames = []
    heads = ((4, 6, 7), (11, 3, 9), (8, 12, 5))       # (x, head y, stem length)
    for lean in (0, 1, -1):
        im = _canvas(1, 2)
        d = ImageDraw.Draw(im)
        contact_shade(im, 2, 14, 30, alpha=80)
        for i, (hx, hy, _) in enumerate(heads):
            d.line([hx, hy + 3, hx, 29], fill=_a(DLEAF[2]))
            d.point((hx - 1, hy + 9 + i), fill=_a(LEAFG[2]))
            d.line([hx + 1, hy + 7 + i, hx + 3, hy + 6 + i], fill=_a(LEAFG[1]))
            d.point((hx + 2, hy + 7 + i), fill=_a(DLEAF[3]))
        for i, (hx, hy, _) in enumerate(heads):
            cx = hx + (lean if i != 2 else -lean)
            d.ellipse([cx - 3, hy - 3, cx + 3, hy + 3], fill=_a(YELLOW[1]), outline=_a(YELLOW[2]))
            d.point([(cx - 1, hy - 3), (cx - 3, hy - 1), (cx - 2, hy - 2)], fill=_a(YELLOW[0]))
            d.rectangle([cx - 1, hy - 1, cx + 1, hy + 1], fill=_a(SOIL[3]))
            d.point((cx - 1, hy - 1), fill=_a(SOIL[1]))
            d.point((cx + 1, hy + 1), fill=_a(SOIL[4]))
        d.ellipse([3, 26, 12, 30], fill=_a(DLEAF[2]), outline=_a(DLEAF[4]))   # leafy base clump
        d.line([5, 27, 9, 27], fill=_a(LEAFG[1]))
        frames.append(im)
    return frames


def seed_sacks():
    im = _canvas(2, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 1, 30, 14, alpha=90)

    def sack(x0, top):
        d.rounded_rectangle([x0, top + 3, x0 + 9, 13], radius=3, fill=_a(BURLAP[1]), outline=_a(BURLAP[3]))
        d.polygon([(x0 + 2, top + 3), (x0 + 4, top), (x0 + 6, top), (x0 + 7, top + 3)],
                  fill=_a(BURLAP[1]), outline=_a(BURLAP[3]))
        d.line([x0 + 2, top + 3, x0 + 7, top + 3], fill=_a(POT[2]))          # twine
        d.line([x0 + 1, top + 5, x0 + 1, 11], fill=_a(BURLAP[0]))
        d.line([x0 + 8, top + 6, x0 + 8, 12], fill=_a(BURLAP[2]))
        d.rectangle([x0 + 3, top + 7, x0 + 5, top + 8], fill=_a(LEAFG[2]))  # leaf mark, no text
        d.point((x0 + 4, top + 6), fill=_a(LEAFG[3]))

    sack(1, 1)
    sack(9, 3)
    for x, y in ((19, 13), (20, 14), (18, 14), (21, 13)):                   # spilled seeds
        im.putpixel((x, y), _a(SOIL[1]))
    # watering can (gym glass-teal tin)
    d.rounded_rectangle([21, 5, 29, 13], radius=2, fill=_a(TIN[1]), outline=_a(TIN[3]))
    d.line([22, 6, 22, 12], fill=_a(TIN[0]))
    d.line([28, 7, 28, 12], fill=_a(TIN[2]))
    d.arc([22, 1, 28, 8], 180, 360, fill=_a(TIN[3]))
    d.line([21, 10, 17, 6], fill=_a(TIN[3]), width=2)
    d.line([20, 9, 17, 6], fill=_a(TIN[1]))
    d.rectangle([15, 4, 17, 6], fill=_a(TIN[2]), outline=_a(TIN[3]))
    return [im]


def rose_arch():
    """Timber trellis arch over the path, smothered in climbing roses (2x2)."""
    im = _canvas(2, 2)
    d = ImageDraw.Draw(im)
    for x0 in (1, 27):                                  # posts
        d.rectangle([x0, 8, x0 + 3, 31], fill=_a(TIMBER[1]), outline=_a(TIMBER[4]))
        d.line([x0 + 1, 9, x0 + 1, 30], fill=_a(TIMBER[0]))
        for y in range(12, 30, 4):                      # trellis rungs
            d.line([x0 + 1, y, x0 + 2, y], fill=_a(TIMBER[3]))
    d.arc([1, 1, 30, 22], 180, 360, fill=_a(TIMBER[4]), width=4)
    d.arc([2, 2, 29, 21], 180, 360, fill=_a(TIMBER[1]), width=2)
    d.arc([2, 2, 29, 21], 200, 300, fill=_a(TIMBER[0]))
    draw_blobs(im, [(4, 6, 4, 3.5), (10, 2.5, 4.5, 2.6), (21, 2.5, 4.5, 2.6), (27, 6, 4, 3.5),
                    (3, 16, 2.6, 3), (28, 18, 2.6, 3)], LEAFG, FOLIAGE_OUT, speck=91)
    px = im.load()
    for x, y in ((3, 5), (9, 2), (15, 1), (20, 2), (26, 4), (28, 8), (2, 15), (29, 18), (5, 9), (12, 4)):
        for (dx, dy), c in (((0, 0), ROSE[0]), ((1, 0), ROSE[1]), ((0, 1), ROSE[1]), ((1, 1), ROSE[2])):
            if px[x + dx, y + dy][3]:
                px[x + dx, y + dy] = _a(c)
    return [im]


def fern_urn():
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 3, 13, 15, alpha=90)
    d.polygon([(3, 8), (12, 8), (10, 13), (5, 13)], fill=_a(STONEW[1]), outline=_a(STONEW[4]))
    d.rectangle([2, 7, 13, 9], fill=_a(STONEW[0]), outline=_a(STONEW[4]))
    d.rectangle([5, 13, 10, 14], fill=_a(STONEW[2]), outline=_a(STONEW[4]))
    d.line([5, 10, 6, 12], fill=_a(STONEW[0]))
    d.line([10, 10, 9, 12], fill=_a(STONEW[3]))
    for (x0, y0, x1, y1) in ((7, 7, 2, 2), (8, 7, 13, 1), (7, 7, 5, 0), (8, 7, 10, 0), (7, 7, 1, 6), (8, 7, 14, 5)):
        d.line([x0, y0, x1, y1], fill=_a(DLEAF[3]))
    for x, y in ((3, 3), (5, 1), (10, 1), (12, 2), (2, 5), (13, 4), (6, 3), (9, 3)):
        im.putpixel((x, y), _a(LEAFG[1]))
        im.putpixel((x + 1 if x < 8 else x - 1, y + 1), _a(LEAFG[2]))
    return [im]


def wheelbarrow():
    im = _canvas(2, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 28, 14, alpha=90)
    d.line([16, 9, 30, 12], fill=_a(TIMBER[4]), width=2)              # handles
    d.line([16, 8, 29, 11], fill=_a(TIMBER[1]))
    d.polygon([(3, 6), (20, 6), (17, 12), (6, 12)], fill=_a(TIN[2]), outline=_a(TIN[3]))
    d.line([4, 7, 19, 7], fill=_a(TIN[0]))
    d.line([7, 11, 16, 11], fill=_a(TIN[3]))
    d.ellipse([3, 10, 8, 15], fill=_a(IO))                             # wheel
    d.point((5, 12), fill=_a(STONEW[2]))
    d.line([18, 12, 18, 14], fill=_a(TIMBER[4]))                       # leg
    draw_blobs(im, [(8, 5, 3.5, 2.5), (14, 5, 3.5, 2.5)], LEAFG, FOLIAGE_OUT, speck=93)
    for x, y, c in ((7, 3, PINK[1]), (10, 4, YELLOW[1]), (13, 3, ROSE[1]), (16, 4, WHITE[0]), (5, 5, YELLOW[1])):
        im.putpixel((x, y), _a(c))
        im.putpixel((x + 1, y + 1), _a(PINK[3] if c != YELLOW[1] else YELLOW[2]))
    return [im]


PROPS = {
    "grass-topiary": dict(cells=(1, 2), paint=topiary),
    "grass-bud-lantern": dict(cells=(1, 2), paint=bud_lantern, emissive=GLOW, lamp=(255, 226, 150)),
    "grass-bench": dict(cells=(2, 1), paint=bench),
    "grass-beehive": dict(cells=(1, 2), paint=beehive, order=[0, 1, 2]),
    "grass-sunflowers": dict(cells=(1, 2), paint=sunflowers, order=[0, 1, 0, 2]),
    "grass-seed-sacks": dict(cells=(2, 1), paint=seed_sacks),
    "grass-rose-arch": dict(cells=(2, 2), paint=rose_arch),
    "grass-fern-urn": dict(cells=(1, 1), paint=fern_urn),
    "grass-wheelbarrow": dict(cells=(2, 1), paint=wheelbarrow),
}

# ---------------------------------------------------------------- review scene around the gym
GYM = dict(
    structure_at=(8, 4),          # top-left cell of the gym's 8x8-metatile structure canvas (door at cols 11-12)
    ground="grass-ground",
    scene=[
        "HHHHHHHHHHHHHHHHHHHHHHHH",
        "HHH..................HHH",
        "HH.bbb............bbb.HH",
        "H..bbb............bbb..H",
        "H......................H",
        "H......................H",
        "H..~~~..............~~.H",
        "H.~~~~~............~~~.H",
        "H..~~~..............~..H",
        "H......................H",
        "H.bbbb..pppppppp..bbbb.H",
        "H.bbbb..pppppppp..bbbb.H",
        "H.......pp.pp.pp.......H",
        "H.pppp.....pp.....pppp.H",
        "H.pppp.bb..pp..bb.pppp.H",
        "H......bb..pp..bb......H",
        "H..........pp..........H",
        "HHHHHHHHHHHppHHHHHHHHHHH",
    ],
    chars={"p": "grass-flagstone", "b": "grass-flowerbed", "~": "grass-lily-pond", "H": "grass-border"},
    props=[("grass-topiary", 10, 16), ("grass-topiary", 13, 16), ("grass-rose-arch", 11, 16),
           ("grass-bud-lantern", 10, 13), ("grass-bud-lantern", 13, 13),
           ("grass-bud-lantern", 2, 5), ("grass-bud-lantern", 21, 5),
           ("grass-fern-urn", 2, 13), ("grass-bench", 3, 13), ("grass-fern-urn", 5, 13),
           ("grass-wheelbarrow", 18, 14), ("grass-seed-sacks", 20, 13), ("grass-fern-urn", 21, 14),
           ("grass-beehive", 1, 9), ("grass-sunflowers", 6, 9), ("grass-sunflowers", 22, 9),
           ("grass-sunflowers", 6, 4), ("grass-sunflowers", 17, 4),
           ("grass-fern-urn", 2, 16), ("grass-fern-urn", 21, 16), ("sign", 8, 16)],
)


# ---------------------------------------------------------------- biome foliage (soft theme recolours)
from biome import biome_pieces  # noqa: E402

_BT, _BP = biome_pieces("grass")
TERRAIN.update(_BT)
PROPS.update(_BP)
