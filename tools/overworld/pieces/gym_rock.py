"""Rock gym (Geode Bastion) surroundings: cobble road, slate flagstone plaza with amethyst inlays,
quarry scree, amethyst crystal clusters, menhirs, rubble, ore minecart, cairn lanterns, ore crates.
Palette pulled from the gym's own sheet (slate blue-grey, rust-iron bands, menhir sandstone,
glowing amethyst) so pieces sit next to it without clashing.
Slugs are prefixed `rock-`. GYM describes the review scene (review-gym-rock.png)."""
import math

from PIL import Image, ImageDraw

from overworld_kit import WOOD, contact_shade, draw_blobs

SLATE = [(180, 186, 206), (148, 154, 178), (118, 122, 150), (88, 90, 122), (60, 60, 92)]
COB = [(200, 194, 196), (168, 162, 168), (136, 130, 142), (104, 98, 116), (70, 64, 84)]
IRON = [(204, 192, 190), (156, 146, 152), (114, 104, 118), (78, 70, 88), (50, 44, 62)]
RUST = [(236, 156, 96), (202, 110, 66), (160, 76, 52), (116, 50, 48), (78, 34, 42)]
MEN = [(206, 194, 172), (174, 160, 142), (140, 126, 114), (104, 92, 90), (70, 60, 68)]
GRAVEL = [(190, 176, 164), (162, 148, 140), (134, 120, 118), (102, 90, 94), (70, 60, 70)]
AME = [(255, 236, 255), (236, 178, 255), (194, 120, 242), (142, 74, 204), (96, 46, 152)]
GLOW = AME[:4]                     # emissive tones (AME[4] is the outline, darkens at night)


def _has(facing, side):
    return facing is not None and side in facing


def _wrap(a):
    a %= 16
    return min(a, 16 - a)


# ---------------------------------------------------------------- terrain
# quarry ground: packed grey-brown grit with a few small slate chips (4 variants, last almost plain)
GROUND = [(170, 160, 152), (150, 140, 134), (130, 120, 118), (104, 96, 100)]
WALL = [(160, 164, 190), (128, 132, 162), (100, 102, 136), (74, 74, 108), (50, 48, 78), (34, 32, 54)]
CHIPS = [((4, 5), (11, 12)), ((10, 3), (2, 11)), ((7, 9),), ()]
GRIT_D = [((13, 2), (1, 8), (8, 14)), ((6, 7), (14, 13)), ((2, 3), (12, 5), (11, 15)), ((9, 6),)]
GRIT_L = [((9, 9), (2, 1)), ((13, 8), (5, 14)), ((3, 13),), ((3, 12),)]


def rock_ground_px(x, y, v=0):
    x, y = x % 16, y % 16
    for cx, cy in CHIPS[v % 4]:
        if (x, y) == (cx, cy):
            return SLATE[1]
        if (x, y) == (cx + 1, cy):
            return SLATE[2]
        if (x, y) in ((cx, cy + 1), (cx + 1, cy + 1)):
            return GROUND[2]
    if (x, y) in GRIT_D[v % 4]:
        return GROUND[2]
    if (x, y) in GRIT_L[v % 4]:
        return GROUND[0]
    return GROUND[1]


BOULDERS = [(4, 4), (12, 3), (9, 10), (2, 12), (15, 13)]
GLINT = (7, 6)


def _boulder_px(x, y):
    """Raised rock top: big periodic Voronoi boulders, each rounded and lit from the top-left."""
    best = []
    for i, (cx, cy) in enumerate(BOULDERS):
        dx, dy = (x + 0.5 - cx + 8) % 16 - 8, (y + 0.5 - cy + 8) % 16 - 8
        best.append((dx * dx + dy * dy, dx, dy, i))
    best.sort()
    d0, dx, dy, i = best[0]
    gap = math.sqrt(best[1][0]) - math.sqrt(d0)
    if gap < 0.9:
        return WALL[4] if (dx > 0 or dy > 0) else WALL[3]
    l = -dx * 0.6 - dy * 0.8
    if l > 2.4:
        return WALL[0]
    if l > -0.3:
        return WALL[1]
    if l > -2.6:
        return WALL[2]
    return WALL[3]


def rock_border(d, facing, x, y, f, m):
    """Raised slate rock wall framing the map: boulder top, dark outline, tall stratified south
    face with cracks and amethyst seams glinting in the crevices."""
    if d < 0:
        return GROUND[3] if _has(facing, "S") and d > -2 else rock_ground_px(x, y)
    if d < 1:
        return WALL[5]
    if _has(facing, "S") and d < 10:
        if d < 2:
            return WALL[4]
        if d >= 9:
            return WALL[1]                       # lit lip of the top
        if x % 16 == 9 and 3 <= d < 6:
            return AME[1] if int(d) == 4 else AME[3]   # amethyst seam in the face
        if (x % 7 == 3 and d < 7) or (x % 5 == 0 and 6 <= d < 8):
            return WALL[5]
        if 5.5 <= d < 6.5:
            return WALL[2]
        return WALL[3] if d < 5.5 else WALL[2] if d >= 7.5 else WALL[3]
    if (_has(facing, "E") or _has(facing, "W")) and d < 2:
        return WALL[3]
    if _has(facing, "N") and d < 2:
        return WALL[0]
    gx, gy = x % 16, y % 16
    if m != 255 and d > 4 and (gx, gy) == GLINT:          # glints only on rim tiles: no grid
        return AME[0]
    if m != 255 and d > 4 and (gx, gy) == (GLINT[0], GLINT[1] + 1):
        return AME[2]
    return _boulder_px(x, y)


COBBLES = [(3, 3), (10, 2), (14, 8), (7, 8), (1, 11), (11, 13), (5, 14), (14, 15)]


def _cobble_px(x, y):
    """Rounded cobbles: periodic Voronoi cells, dark mortar seams, each stone lit top-left."""
    best = []
    for i, (cx, cy) in enumerate(COBBLES):
        dx, dy = (x + 0.5 - cx + 8) % 16 - 8, (y + 0.5 - cy + 8) % 16 - 8
        best.append((dx * dx + dy * dy * 1.3, dx, dy, i))
    best.sort()
    d0, dx, dy, i = best[0]
    if math.sqrt(best[1][0]) - math.sqrt(d0) < 1.0:
        return COB[4]
    if math.sqrt(best[1][0]) - math.sqrt(d0) < 2.0 and (dx > 0 or dy > 0):
        return COB[3]
    l = -dx * 0.65 - dy * 0.75
    base = 1 if i % 3 else 2
    if l > 1.6:
        return COB[base - 1]
    return COB[base]


def cobble_road(d, facing, x, y, f, m):
    """Grey cobblestone road with a dark kerb line into the grass."""
    if d < -1:
        return rock_ground_px(x, y)
    if d < 0:
        return GROUND[2]
    if d < 1:
        return COB[4]
    if d < 2:
        return COB[0] if (_has(facing, "N") or _has(facing, "W")) else COB[3]
    return _cobble_px(x, y)


def slate_plaza(d, facing, x, y, f, m):
    """Raised slate flagstone forecourt: big offset slabs, a curb with a short south face,
    and a small glowing amethyst inlay at some grout crossings."""
    if d < -1:
        return rock_ground_px(x, y)
    if d < 0:
        return GROUND[2]
    if d < 1:
        return SLATE[4]
    if _has(facing, "S") and d < 4:                 # short south face of the curb
        return SLATE[3] if d < 2.5 else SLATE[2]
    if d < 2:
        return SLATE[0] if (_has(facing, "N") or _has(facing, "W")) else SLATE[3]
    xx = (x + (4 if (y // 8) % 2 else 0)) % 8
    yy = y % 8
    gx, gy = x % 16, y % 16
    if (gx, gy) == (7, 7):
        return AME[1]
    if (gx, gy) in ((6, 7), (8, 7), (7, 6), (7, 8)):
        return AME[2]
    if xx == 7 or yy == 7:
        return SLATE[4]
    if xx == 0 or yy == 0:
        return SLATE[0]
    if xx == 6 or yy == 6:
        return SLATE[2]
    if (gx, gy) in ((3, 3), (12, 11), (2, 12)):
        return SLATE[2]
    return SLATE[1]


SHARDS = ((4, 5), (12, 12))


def scree(d, facing, x, y, f, m):
    """Quarry scree: warm-grey gravel with fixed slate pebbles and two amethyst chips."""
    if d < -1:
        return rock_ground_px(x, y)
    if d < 0:
        return GROUND[2]
    if d < 1:
        return GROUND[3]
    if d < 2:
        return GROUND[2] if (_has(facing, "N") or _has(facing, "W")) else GRAVEL[2]
    gx, gy = x % 16, y % 16
    for sx, sy in SHARDS:
        if (gx, gy) == (sx, sy):
            return AME[1]
        if (gx, gy) == (sx + 1, sy):
            return AME[3]
    for (px, py, r) in ((9, 3, 2), (2, 10, 2), (13, 7, 1), (7, 13, 1)):
        ddx, ddy = gx - px, gy - py
        if abs(ddx) <= r and abs(ddy) <= r - (1 if abs(ddx) == r else 0) + 0:
            if ddy == r or (abs(ddx) == r and ddy >= 0):
                return SLATE[4]
            return SLATE[1] if ddx + ddy < 0 else SLATE[2]
        if ddy == r + 1 and abs(ddx) < r:
            return GRAVEL[3]
    if (gx + gy) % 4 == 0 and (gx // 4 + gy // 4) % 2 == 0:
        return GRAVEL[2]
    if (gx, gy) in ((5, 1), (14, 3), (1, 6), (10, 9), (4, 15)):
        return GRAVEL[0]
    return GRAVEL[1]


TERRAIN = {
    "rock-ground": dict(kind="fill", behaviour="NORMAL",
                        variants=[(lambda x, y, v=v: rock_ground_px(x, y, v)) for v in range(4)]),
    "rock-border": dict(kind="blob", behaviour="NORMAL", paint=rock_border, emissive=AME[:4],
                        sdf=dict(margin=1.0, radius=5, wobble=0.9, freq=1)),
    "rock-cobble-road": dict(kind="blob", behaviour="NORMAL", paint=cobble_road,
                             sdf=dict(margin=2, radius=2, wobble=0.3, freq=1)),
    "rock-slate-plaza": dict(kind="blob", behaviour="NORMAL", paint=slate_plaza, emissive=AME[1:3],
                             sdf=dict(margin=1.5, radius=2, wobble=0.0, freq=1)),
    "rock-scree": dict(kind="blob", behaviour="NORMAL", paint=scree, emissive=[AME[1], AME[3]],
                       sdf=dict(margin=2.5, radius=4, wobble=0.7, freq=1)),
}


# ---------------------------------------------------------------- props
def _canvas(w, h):
    return Image.new("RGBA", (w * 16, h * 16), (0, 0, 0, 0))


def _a(c):
    return c + (255,)


def _prism(d, cx, base, top, half, tilt=0):
    """Amethyst prism standing on `base`, tip at `top`; lit left face, ridge, dark right face."""
    tx = cx + tilt
    shoulder = top + half + 1
    poly = [(tx, top), (tx + half, shoulder), (cx + half, base), (cx - half, base), (tx - half, shoulder)]
    d.polygon(poly, fill=_a(AME[2]), outline=_a(AME[4]))
    left = [(tx, top + 1), (tx, base - 1), (cx - half + 1, base - 1), (tx - half + 1, shoulder)]
    d.polygon(left, fill=_a(AME[1]))
    d.line([tx, top + 1, cx, base - 1], fill=_a(AME[0]))
    d.line([cx + half - 1, base - 1, tx + half - 1, shoulder + 1], fill=_a(AME[3]))


def crystal_cluster():
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 14, 14, alpha=90)
    draw_blobs(im, [(8, 12, 6.5, 2.5)], SLATE, SLATE[4])
    _prism(d, 4, 12, 5, 2, tilt=-2)
    _prism(d, 12, 12, 4, 2, tilt=2)
    _prism(d, 8, 13, 0, 3)
    im.putpixel((2, 1), _a(AME[0]))
    return [im]


def menhir():
    im = _canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 14, 30, alpha=90)
    d.polygon([(4, 29), (3, 12), (5, 7), (11, 6), (12, 12), (12, 29)], fill=_a(MEN[2]), outline=_a(MEN[4]))
    d.polygon([(4, 28), (4, 12), (6, 8), (7, 8), (7, 28)], fill=_a(MEN[1]))
    d.line([5, 10, 5, 27], fill=_a(MEN[0]))
    d.line([11, 13, 11, 28], fill=_a(MEN[3]))
    d.line([4, 29, 12, 29], fill=_a(MEN[4]))
    d.line([4, 27, 11, 27], fill=_a(MEN[3]))                     # short south face of the base
    d.rectangle([3, 18, 12, 20], fill=_a(RUST[2]), outline=_a(RUST[4]))   # rust-iron band
    d.line([4, 18, 11, 18], fill=_a(RUST[0]))
    d.point((8, 19), fill=_a(IRON[0]))
    for x, y in ((8, 10), (9, 11), (9, 12), (8, 13), (8, 14), (9, 15), (7, 22), (8, 23), (8, 24)):
        im.putpixel((x, y), _a(AME[2]))                           # glowing ore vein
    _prism(d, 8, 7, 0, 2)
    return [im]


def rubble():
    im = _canvas(1, 1)
    contact_shade(im, 1, 15, 14, alpha=90)
    draw_blobs(im, [(5, 10, 4, 3.2), (11, 11, 3.5, 2.8), (8, 6.5, 3.5, 3), (13, 7, 2, 1.8), (2.5, 13, 1.8, 1.4)],
               SLATE, SLATE[4], speck=71)
    p = im.load()
    for x, y in ((5, 12), (6, 12), (11, 13), (8, 8)):
        p[x, y] = _a(SLATE[3])
    p[9, 9] = _a(AME[1])
    p[10, 9] = _a(AME[3])
    return [im]


def minecart():
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 1, 15, 14, alpha=90)
    draw_blobs(im, [(5, 6, 3, 2.5), (10, 5.5, 3.5, 2.5), (8, 4, 2.5, 2)], SLATE, SLATE[4])
    for x, y in ((9, 4), (5, 5)):
        im.putpixel((x, y), _a(AME[1]))
        im.putpixel((x + 1, y), _a(AME[2]))
    d.polygon([(1, 6), (14, 6), (13, 12), (2, 12)], fill=_a(RUST[2]), outline=_a(RUST[4]))
    d.line([2, 7, 13, 7], fill=_a(RUST[0]))
    d.line([3, 11, 12, 11], fill=_a(RUST[3]))
    for x in (4, 11):                                            # iron straps with rivets
        d.line([x, 7, x, 11], fill=_a(IRON[2]))
        im.putpixel((x, 8), _a(IRON[0]))
    for cx in (4, 11):
        d.rectangle([cx - 2, 12, cx + 1, 14], fill=_a(IRON[3]), outline=_a(IRON[4]))
        im.putpixel((cx - 1, 12), _a(IRON[1]))
    return [im]


def cairn_lantern():
    im = _canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 14, 30, alpha=90)
    draw_blobs(im, [(8, 27, 6.5, 3), (8, 22.5, 5, 2.5), (8, 18.5, 3.8, 2.2)], MEN, MEN[4], speck=73)
    d.rectangle([7, 12, 8, 16], fill=_a(IRON[3]))
    d.line([4, 3, 11, 3], fill=_a(IRON[4]))
    d.polygon([(4, 3), (11, 3), (12, 5), (3, 5)], fill=_a(RUST[2]), outline=_a(RUST[4]))
    d.rectangle([4, 5, 11, 12], fill=_a(AME[2]), outline=_a(IRON[4]))
    d.rectangle([5, 6, 7, 11], fill=_a(AME[1]))
    d.point((6, 7), fill=_a(AME[0]))
    d.line([8, 5, 8, 12], fill=_a(IRON[3]))
    d.line([3, 12, 12, 12], fill=_a(IRON[3]))
    d.rectangle([7, 1, 8, 2], fill=_a(IRON[2]))
    return [im]


def ore_crate():
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 15, 14, alpha=90)
    draw_blobs(im, [(6, 5, 3, 2.5), (10.5, 4.5, 3, 2.5)], SLATE, SLATE[4])
    im.putpixel((10, 4), _a(AME[1]))
    im.putpixel((11, 4), _a(AME[2]))
    d.rectangle([2, 6, 13, 13], fill=_a(WOOD[1]), outline=_a(WOOD[3]))
    d.line([3, 7, 12, 7], fill=_a(WOOD[0]))
    d.line([3, 10, 12, 10], fill=_a(WOOD[2]))
    d.line([3, 12, 12, 12], fill=_a(WOOD[2]))
    for x in (2, 13):
        d.line([x, 6, x, 13], fill=_a(RUST[3]))
    d.line([2, 9, 13, 9], fill=_a(RUST[2]))
    return [im]


def geode():
    """Split geode boulder: grey rind, cracked open to show an amethyst cavity."""
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 1, 15, 14, alpha=90)
    draw_blobs(im, [(8, 9, 6.5, 4.8)], SLATE, SLATE[4], speck=77)
    d.ellipse([4, 6, 12, 12], fill=_a(AME[4]))
    d.ellipse([5, 7, 11, 11], fill=_a(AME[3]))
    for x, y, c in ((6, 9, 1), (7, 8, 0), (8, 9, 2), (9, 8, 1), (10, 10, 2), (7, 10, 2), (6, 8, 2)):
        im.putpixel((x, y), _a(AME[c]))
    d.line([5, 12, 11, 12], fill=_a(SLATE[0]))                   # lit lower rim of the cut
    return [im]


PROPS = {
    "rock-crystal-cluster": dict(cells=(1, 1), paint=crystal_cluster, emissive=GLOW),
    "rock-menhir": dict(cells=(1, 2), paint=menhir, emissive=GLOW),
    "rock-rubble": dict(cells=(1, 1), paint=rubble, emissive=[AME[1], AME[3]]),
    "rock-minecart": dict(cells=(1, 1), paint=minecart, emissive=[AME[1], AME[2]]),
    "rock-cairn-lantern": dict(cells=(1, 2), paint=cairn_lantern, emissive=GLOW, lamp=(206, 150, 255)),
    "rock-ore-crate": dict(cells=(1, 1), paint=ore_crate, emissive=[AME[1], AME[2]]),
    "rock-geode": dict(cells=(1, 1), paint=geode, emissive=AME[:3]),
}

# ---------------------------------------------------------------- review scene around the gym
GYM = dict(
    structure_at=(8, 4),          # top-left cell of the gym's 8x8-metatile structure canvas (door at cols 11-12)
    ground="rock-ground",
    scene=[
        "RRRRRRRRRRRRRRRRRRRRRRRR",
        "RRRR..............RRRRRR",
        "RRR...............RRRR.R",
        "RR.................RR..R",
        "R..ss..............ss..R",
        "R.sss.............sss..R",
        "R..sss..........ssss...R",
        "R...s............ss....R",
        "R......................R",
        "R......................R",
        "R.....pppppppppppp.....R",
        "R.....pppppppppppp.....R",
        "RR......pppppppp.......R",
        "RRs........cc.....sss..R",
        "Rss........cc....sssss.R",
        "R.s........cccccccssss.R",
        "R..........cc.....sss..R",
        "RRRRRRRRRRRccRRRRRRRRRRR",
    ],
    chars={"p": "rock-slate-plaza", "c": "rock-cobble-road", "s": "rock-scree", "R": "rock-border"},
    props=[("rock-cairn-lantern", 5, 11), ("rock-cairn-lantern", 18, 11), ("rock-crystal-cluster", 3, 5),
           ("rock-crystal-cluster", 19, 6), ("rock-menhir", 2, 9), ("rock-menhir", 21, 9),
           ("rock-rubble", 8, 15), ("rock-minecart", 19, 14), ("rock-ore-crate", 20, 15),
           ("rock-ore-crate", 21, 15), ("rock-rubble", 18, 16), ("rock-crystal-cluster", 21, 13),
           ("rock-geode", 3, 14), ("rock-crystal-cluster", 2, 15), ("rock-rubble", 4, 16),
           ("rock-geode", 21, 4), ("rock-rubble", 5, 2), ("rock-geode", 15, 8), ("rock-rubble", 7, 9),
           ("rock-menhir", 9, 16), ("rock-cairn-lantern", 14, 16),
           ("sign", 13, 13)],
)


# ---------------------------------------------------------------- biome foliage (soft theme recolours)
from biome import biome_pieces  # noqa: E402

_BT, _BP = biome_pieces("rock")
TERRAIN.update(_BT)
PROPS.update(_BP)
