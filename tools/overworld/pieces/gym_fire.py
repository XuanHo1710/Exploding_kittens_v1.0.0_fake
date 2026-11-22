"""Fire gym (Volcano Foundry) surroundings: scorched ground, basalt paving, lava pools,
braziers, lava rocks, charred trees, ember vents. Palette pulled from the gym's own sheet
(charcoal basalt, crimson, bronze, lava orange) so pieces sit next to it without clashing.
Slugs are prefixed `fire-`. GYM describes the review scene (review-gym-fire.png)."""
import math

from PIL import ImageDraw

from overworld_kit import GRASS, IO, contact_shade, draw_blobs, grass_px, h16

TAU = 2 * math.pi
BASALT = [(120, 104, 112), (96, 82, 92), (74, 62, 74), (54, 44, 58), (34, 28, 40)]
ASH = [(176, 164, 156), (148, 136, 132), (120, 108, 108), (90, 80, 84), (62, 54, 60)]
LAVA = [(255, 246, 168), (255, 208, 72), (255, 150, 40), (232, 84, 30), (160, 40, 34)]
CRIM = [(244, 104, 84), (222, 62, 60), (190, 40, 52), (140, 26, 50), (96, 18, 44)]
BRONZE = [(240, 198, 120), (208, 156, 84), (170, 114, 60), (120, 76, 50), (82, 50, 44)]
CHAR = [(92, 78, 72), (66, 54, 52), (44, 36, 38)]
GROUND = [(104, 86, 80), (86, 70, 68), (72, 58, 58), (58, 46, 48), (42, 33, 38)]   # ash-and-basalt soil
EMBER = [(214, 92, 44), (150, 52, 38)]
CRAG = [(132, 112, 116), (104, 86, 94), (80, 64, 76), (58, 46, 58), (38, 30, 42)]
CRAG_OUT = (22, 16, 24)


def _has(facing, side):
    return facing is not None and side in facing


# ---------------------------------------------------------------- terrain
def basalt_path(d, facing, x, y, f, m):
    """Hexagon-ish basalt flagstones with a hairline of glowing grout here and there."""
    if d < -1:
        return grass_px(x, y)
    if d < 0:
        return GRASS[3]
    if d < 1:
        return BASALT[4]
    if d < 2:
        return BASALT[0] if (_has(facing, "N") or _has(facing, "W")) else BASALT[3]
    xx = (x + (4 if (y // 8) % 2 else 0)) % 8
    yy = y % 8
    if xx == 7 or yy == 7:
        return LAVA[3] if (x * 3 + y) % 13 == 0 else BASALT[4]
    if xx == 0 or yy == 0:
        return BASALT[0]
    return BASALT[1] if (xx + yy) % 6 else BASALT[2]


def scorched(d, facing, x, y, f, m):
    """Ash-grey scorched earth patch with a few dying embers; ragged edge into grass."""
    if d < -1:
        return grass_px(x, y)
    if d < 0:
        return (104, 120, 64)                 # singed grass rim
    if d < 1:
        return ASH[3]
    if (x, y) in ((4, 6), (11, 12)):
        return LAVA[2]
    if (x, y) in ((5, 6), (11, 11)):
        return LAVA[3]
    if (x + y) % 4 == 0 and (x // 4 + y // 4) % 2 == 0:
        return ASH[2]
    if (x, y) in ((8, 3), (2, 13), (14, 8)):
        return ASH[0]
    return ASH[1]


def lava_pool(d, facing, x, y, f, m):
    """Sunken lava pool, 4 frames: basalt rim, bright crust edge, slowly churning magma."""
    if d < -2:
        return grass_px(x, y)
    if d < -1:
        return ASH[3]                         # ash rim, sits on grass or on fire-ground
    if d < 0:
        return ASH[1]
    if d < 1:
        return BASALT[4]
    if _has(facing, "N") and d < 4:
        return BASALT[2] if d < 3 else BASALT[3]
    if d < 2.5:
        return LAVA[1]
    a = TAU / 16
    v = math.sin(a * (x + 4 * f) + 1.3 * math.sin(a * y)) + 0.6 * math.sin(2 * a * y + 0.8 * math.cos(a * x) + f)
    return LAVA[0] if v > 1.1 else LAVA[1] if v > 0.5 else LAVA[2] if v > -0.6 else LAVA[3]


# ---------------------------------------------------------------- volcanic ground (fill)
# Four 16 px variants: sparse, irregular grit clusters on a calm charcoal-brown base, one
# almost plain, a dim ember speck in two of them. No regular grid or dither.
_GRIT = [
    [((3, 4), 1), ((4, 4), 3), ((3, 5), 3), ((11, 10), 3), ((12, 10), 1), ((12, 11), 3), ((7, 14), 3)],
    [((9, 2), 3), ((10, 2), 3), ((10, 3), 1), ((2, 11), 3), ((14, 13), 1), ((13, 13), 3), ((6, 7), "E")],
    [((5, 9), 3), ((6, 9), 1), ((6, 10), 3), ((13, 4), 3), ((12, 15), "e")],
    [((8, 6), 3)],
]


def _ground(v):
    pts = dict(_GRIT[v])

    def px(x, y):
        k = pts.get((x % 16, y % 16))
        if k == "E":
            return EMBER[0]
        if k == "e":
            return EMBER[1]
        return GROUND[k] if k is not None else GROUND[2]
    return px


# ---------------------------------------------------------------- basalt crag border (raised)
_SEEDS = [(2.5, 3.0), (11.0, 1.5), (6.5, 9.5), (14.0, 9.0), (1.0, 13.5), (10.0, 14.5)]
_HOT = {(0, 2), (3, 5)}                       # seed pairs whose shared seam glows


def _chunks(x, y):
    """Irregular faceted basalt chunks (wrapped Voronoi, repeats every 16 px), lit from the
    top-left, dark seams, a couple of seams glowing with magma."""
    x, y = x % 16, y % 16
    ds = []
    for i, (sx, sy) in enumerate(_SEEDS):
        for ox in (-16, 0, 16):
            for oy in (-16, 0, 16):
                ds.append((math.hypot(x + 0.5 - sx - ox, y + 0.5 - sy - oy), i, sx + ox, sy + oy))
    ds.sort()
    (d0, i0, sx, sy), (d1, i1, _, _) = ds[0], next(t for t in ds if t[1] != ds[0][1])
    if d1 - d0 < 1.0:
        return LAVA[3] if tuple(sorted((i0, i1))) in _HOT else CRAG_OUT
    nx, ny = (x + 0.5 - sx) / 4.0, (y + 0.5 - sy) / 4.0
    l = -nx * 0.65 - ny * 0.75
    return CRAG[0] if l > 0.55 else CRAG[1] if l > 0.0 else CRAG[2] if l > -0.55 else CRAG[3]


def crag(d, facing, x, y, f, m):
    if d < 0:
        if _has(facing, "S") and d > -2:       # soft contact shadow on the ground at the foot
            return (20, 12, 18, 110)
        return None
    if d < 1:
        return CRAG_OUT
    if _has(facing, "S") and d < 8:            # south face: stacked basalt columns, glowing crack
        if d >= 7:
            return CRAG[1]
        if x % 4 == 0:
            return CRAG[4]
        if x % 16 in (9, 10) and 2 <= d < 6 and (x // 16 + y) % 2 == 0:
            return LAVA[2] if x % 16 == 9 else LAVA[3]
        return CRAG[3] if d < 3 else CRAG[2] if x % 4 != 3 else CRAG[3]
    if (_has(facing, "E") or _has(facing, "W")) and d < 2:
        return CRAG[3]
    if _has(facing, "N") and d < 2:
        return CRAG[0]
    return _chunks(x, y)


# ---------------------------------------------------------------- ash grass + basalt ledge (map roles)
def ash_grass(d, facing, x, y, f, m):
    """Encounter grass of the volcano slopes: the Emerald star clump in ash grey with ember tips."""
    from terrain import ROSETTE
    if d < 0:
        return _ground(0)(x, y)
    ch = ROSETTE[y % 16][x % 16]
    if ch == "l":
        return EMBER[0] if (x // 4 + y // 4) % 5 == 0 else ASH[0]
    if ch == "t":
        return ASH[2]
    if ch == "o":
        return GROUND[4]
    return _ground(0)(x, y)



def _basalt_ledge(along, across, start, end):
    from terrain import _ledge_band
    from overworld_kit import CLIFF
    c = _ledge_band(along, across, start, end)
    if c is None:
        return None
    return CRAG[CLIFF.index(c)] if c in CLIFF else c


def basalt_ledge(i, x, y):
    """South-facing ledge in basalt on the scorched ground (JUMP_SOUTH)."""
    from terrain import LEDGE_Y1
    c = _basalt_ledge(x, y, i in (0, 1), i in (0, 3))
    if c is not None:
        return c
    if y == LEDGE_Y1 + 1:
        return GROUND[4]
    return _ground(0)(x, y)


TERRAIN = {
    "fire-ground": dict(kind="fill", behaviour="NORMAL", emissive=[EMBER[0]],
                        variants=[_ground(v) for v in range(4)]),
    "fire-border": dict(kind="blob", behaviour="NORMAL", paint=crag, emissive=LAVA[2:5], overlay_cut=-2.0,
                        sdf=dict(margin=1.0, radius=4, wobble=1.2, freq=2)),
    "fire-basalt-path": dict(kind="blob", behaviour="NORMAL", paint=basalt_path, emissive=[LAVA[3]],
                             sdf=dict(margin=2, radius=2, wobble=0.0, freq=1)),
    "fire-scorched": dict(kind="blob", behaviour="NORMAL", paint=scorched,
                          sdf=dict(margin=2.5, radius=4, wobble=1.4, freq=2)),
    "fire-lava-pool": dict(kind="blob", behaviour="NORMAL", paint=lava_pool, frames=4, emissive=LAVA[:4],
                           overlay_cut=-2.0,
                           sdf=dict(margin=2, radius=3, wobble=0.6, freq=1)),
    "fire-ash-grass": dict(kind="blob", behaviour="TALL_GRASS", paint=ash_grass, emissive=[EMBER[0]],
                           sdf=dict(margin=0.01, radius=0.01, wobble=0.0, freq=1)),
    "fire-ledge": dict(kind="row", axis="h", behaviour="JUMP_SOUTH", paint=basalt_ledge),
}


# ---------------------------------------------------------------- props
def _canvas(w, h):
    from PIL import Image
    return Image.new("RGBA", (w * 16, h * 16), (0, 0, 0, 0))


def brazier():
    im = _canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 3, 13, 30, alpha=90)
    d.rectangle([5, 18, 10, 29], fill=BASALT[2] + (255,), outline=BASALT[4] + (255,))
    d.line([6, 19, 6, 28], fill=BASALT[0] + (255,))
    d.rectangle([2, 13, 13, 18], fill=BRONZE[2] + (255,), outline=BRONZE[4] + (255,))
    d.line([3, 14, 12, 14], fill=LAVA[3] + (255,))
    d.polygon([(8, 0), (13, 13), (3, 13)], fill=LAVA[2] + (255,), outline=LAVA[3] + (255,))
    d.polygon([(8, 5), (11, 13), (5, 13)], fill=LAVA[1] + (255,))
    d.polygon([(8, 8), (9, 13), (7, 13)], fill=LAVA[0] + (255,))
    return [im]


def lava_rock():
    im = _canvas(1, 1)
    contact_shade(im, 2, 14, 14, alpha=100)
    draw_blobs(im, [(8, 8.5, 6.5, 5.5), (5, 10, 4, 3.5)], BASALT, BASALT[4])
    p = im.load()
    for x, y in ((7, 6), (8, 7), (8, 8), (9, 9), (10, 9), (5, 9)):
        p[x, y] = LAVA[2] + (255,)
    p[8, 8] = LAVA[1] + (255,)
    return [im]


def charred_tree():
    """Dead, charred tree: ash-grey bark with a 1 px dark outline so it reads on dark ground."""
    im = _canvas(2, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 8, 24, 30, alpha=110)
    out = CRAG_OUT + (255,)
    limbs = ((16, 18, 8, 9), (16, 16, 24, 7), (16, 14, 16, 3), (10, 12, 5, 12), (21, 11, 27, 12))
    for (x0, y0, x1, y1) in limbs:
        d.line([x0, y0, x1, y1], fill=out, width=4)
    d.polygon([(13, 30), (19, 30), (18, 14), (14, 14)], fill=out)
    for (x0, y0, x1, y1) in limbs:
        d.line([x0, y0, x1, y1], fill=ASH[3] + (255,), width=2)
        d.line([x0 - 1, y0, x1 - 1, y1], fill=ASH[2] + (255,))
    d.polygon([(14, 29), (18, 29), (17, 15), (15, 15)], fill=ASH[3] + (255,))
    d.line([15, 16, 14, 29], fill=ASH[2] + (255,))
    for x, y in ((16, 22), (17, 23), (15, 26)):
        im.putpixel((x, y), LAVA[3] + (255,))
    return [im]


def ember_vent():
    frames = []
    for k in range(3):
        im = _canvas(1, 1)
        d = ImageDraw.Draw(im)
        d.ellipse([3, 9, 12, 14], fill=BASALT[2] + (255,), outline=BASALT[4] + (255,))
        d.ellipse([5, 10, 10, 13], fill=LAVA[3] + (255,))
        d.point((7, 11), fill=LAVA[1] + (255,))
        for i, (x, y) in enumerate(((7, 7), (9, 4), (6, 2))):
            yy = y - k
            if yy >= 0:
                im.putpixel((x + (i + k) % 2, yy), (LAVA[1] if i == 0 else LAVA[2]) + (255,))
        frames.append(im)
    return frames


def obsidian_spire():
    """Tall jagged obsidian shard cluster with a magma glint at its base."""
    im = _canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 14, 30, alpha=110)
    OB = [(150, 128, 170), (96, 76, 120), (60, 44, 82), (36, 26, 54)]
    out = (18, 12, 28, 255)
    for poly, lit in (([(3, 30), (5, 14), (8, 30)], 1), ([(9, 30), (11, 17), (13, 30)], 2),
                      ([(5, 30), (8, 4), (11, 30)], 1)):
        d.polygon(poly, fill=OB[lit] + (255,), outline=out)
    d.line([7, 8, 6, 28], fill=OB[0] + (255,))
    d.line([9, 12, 10, 28], fill=OB[2] + (255,))
    for x, y in ((7, 29), (8, 29), (10, 29)):
        im.putpixel((x, y), LAVA[3] + (255,))
    im.putpixel((8, 28), LAVA[2] + (255,))
    return [im]


def magma_crack():
    """Flat cracked-ground decal: forked fissure with pulsing magma, 3 frames."""
    frames = []
    seg = [(2, 6), (5, 7), (7, 6), (9, 9), (12, 9), (14, 12)]
    br = [(7, 6), (8, 3), (10, 2)]
    for k in range(3):
        im = _canvas(1, 1)
        d = ImageDraw.Draw(im)
        hot = [LAVA[3], LAVA[2], LAVA[1]][k]
        for path in (seg, br):
            d.line(path, fill=GROUND[4] + (255,), width=3)
        for path in (seg, br):
            d.line(path, fill=hot + (255,), width=1)
        im.putpixel((9, 9), LAVA[0 if k == 2 else 1] + (255,))
        frames.append(im)
    return frames


def ash_boulders():
    """Two ash-crusted boulders, 2x1."""
    im = _canvas(2, 1)
    contact_shade(im, 2, 30, 14, alpha=100)
    draw_blobs(im, [(10, 9, 7.5, 6), (22, 10.5, 6, 4.5), (5, 11, 4, 3.5)], ASH[1:] + [ASH[4]], ASH[4])
    p = im.load()
    for x, y in ((9, 10), (10, 11), (22, 11)):
        p[x, y] = CHAR[1] + (255,)
    return [im]


PROPS = {
    "fire-obsidian-spire": dict(cells=(1, 2), paint=obsidian_spire, emissive=LAVA[2:4]),
    "fire-magma-crack": dict(cells=(1, 1), paint=magma_crack, emissive=LAVA[:4], order=[0, 1, 2, 1]),
    "fire-ash-boulders": dict(cells=(2, 1), paint=ash_boulders),
    "fire-brazier": dict(cells=(1, 2), paint=brazier, emissive=LAVA[:4], lamp=(255, 170, 80)),
    "fire-lava-rock": dict(cells=(1, 1), paint=lava_rock, emissive=LAVA[1:4]),
    "fire-charred-tree": dict(cells=(2, 2), paint=charred_tree, emissive=[LAVA[3]]),
    "fire-ember-vent": dict(cells=(1, 1), paint=ember_vent, emissive=LAVA[:4], order=[0, 1, 2]),
}

# ---------------------------------------------------------------- review scene around the gym
GYM = dict(
    structure_at=(8, 4),          # top-left cell of the gym's 8x8-metatile structure canvas (door at cols 11-12)
    ground="fire-ground",
    scene=[
        "RRRRRRRRRRRRRRRRRRRRRRRR",
        "RRR..................RRR",
        "RR.aa..............aa.RR",
        "R.aa..............aa...R",
        "R...~~............~~...R",
        "R...~~............~~...R",
        "R.a..............a....aR",
        "R.aa..............aa.aaR",
        "R......................R",
        "R......................R",
        "R.....bbbbbbbbbbbb.....R",
        "R.....bbbbbbbbbbbb.....R",
        "R.......aa.bb.aa.......R",
        "R.......a..bb..a.......R",
        "R..~~......bb.....~~...R",
        "R.aaa......bb.....aaa..R",
        "RRa........bb.........RR",
        "RRRRRRRRRRRbbRRRRRRRRRRR",
    ],
    chars={"a": "fire-scorched", "~": "fire-lava-pool", "b": "fire-basalt-path", "R": "fire-border"},
    props=[("fire-brazier", 5, 12), ("fire-brazier", 18, 12), ("fire-lava-rock", 3, 9),
           ("fire-lava-rock", 20, 9), ("fire-charred-tree", 6, 16), ("fire-charred-tree", 16, 16),
           ("fire-ember-vent", 8, 12), ("fire-ember-vent", 15, 12), ("sign", 13, 15),
           ("fire-obsidian-spire", 1, 9), ("fire-obsidian-spire", 22, 9), ("fire-obsidian-spire", 9, 16),
           ("fire-obsidian-spire", 14, 16), ("fire-obsidian-spire", 6, 5), ("fire-obsidian-spire", 17, 5),
           ("fire-magma-crack", 2, 4), ("fire-magma-crack", 21, 3), ("fire-magma-crack", 4, 11),
           ("fire-magma-crack", 19, 11), ("fire-ash-boulders", 2, 1), ("fire-ash-boulders", 20, 1),
           ("fire-lava-rock", 6, 14), ("fire-lava-rock", 17, 14), ("fire-ember-vent", 1, 12),
           ("fire-ember-vent", 22, 13), ("fire-lava-rock", 3, 6)],
)


# ---------------------------------------------------------------- biome foliage (soft theme recolours)
from biome import biome_pieces  # noqa: E402

_BT, _BP = biome_pieces("fire")
TERRAIN.update(_BT)
PROPS.update(_BP)
