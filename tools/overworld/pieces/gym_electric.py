"""Electric gym (Dynamo Power Plant) surroundings: steel diamond-plate walkway, concrete apron
with a hazard-stripe border, glowing cable trench, power poles, transformers, cable spools,
warning beacons, Tesla posts and a yellow safety rail. Palette pulled from the gym's own sheet
(navy siding, safety yellow, copper, steel, plasma cyan) so pieces sit next to it without
clashing. Slugs are prefixed `electric-`. GYM describes the review scene (review-gym-electric.png)."""
from PIL import Image, ImageDraw

from overworld_kit import BARK, WOOD, contact_shade

NAVY = [(104, 118, 172), (80, 94, 150), (62, 74, 128), (46, 54, 102), (32, 36, 76)]
YEL = [(255, 242, 130), (250, 212, 60), (226, 168, 34), (176, 116, 34), (116, 74, 40)]
COP = [(252, 196, 140), (228, 152, 92), (190, 110, 66), (140, 74, 54), (94, 48, 46)]
STL = [(214, 222, 236), (176, 186, 206), (138, 148, 176), (100, 108, 140), (66, 72, 104)]
CONC = [(204, 204, 198), (178, 178, 176), (150, 150, 154), (116, 116, 130), (80, 80, 98)]
GLOW = [(255, 255, 232), (255, 244, 112), (250, 206, 52), (222, 150, 32)]
PLASMA = [(244, 252, 255), (176, 236, 255), (110, 196, 255), (80, 140, 236), (70, 90, 190)]
BLACK = (40, 38, 58)
ASPH = [(124, 126, 142), (104, 106, 122), (90, 92, 108), (78, 80, 96), (60, 62, 80)]
CERAMIC = [(240, 240, 232), (206, 208, 210), (150, 154, 170)]


def _has(facing, side):
    return facing is not None and side in facing


def _a(c):
    return c + (255,)


# ---------------------------------------------------------------- terrain
# ---------------------------------------------------------------- ground fill
# Sparse, irregular specks on a calm asphalt base (exact 16 px repeat, no grid/dither).
_SPECKS = [
    [((4, 11), 1)],                                                         # almost plain
    [((2, 3), 1), ((11, 2), 3), ((7, 9), 1), ((13, 12), 3), ((5, 14), 3), ((14, 6), 1)],  # aggregate
    [((9, 4), 1), ((3, 12), 3)],                                            # + tyre-worn smear
    [((12, 3), 3), ((2, 7), 1), ((10, 13), 1)],                             # + hairline crack
]
_WEAR = {(5, 6), (6, 6), (7, 6), (8, 7), (9, 7), (10, 7), (11, 7), (6, 7), (7, 7), (9, 8)}
_CRACK = {(5, 10): 4, (6, 10): 4, (7, 11): 4, (8, 11): 4, (9, 12): 4, (6, 11): 0, (8, 12): 0}


def _ground(x, y, v=0):
    x, y = x % 16, y % 16
    if v == 2 and (x, y) in _WEAR:
        return ASPH[3]
    if v == 3 and (x, y) in _CRACK:
        return ASPH[4] if _CRACK[(x, y)] else ASPH[1]
    for (sx, sy), k in _SPECKS[v]:
        if (x, y) == (sx, sy):
            return ASPH[k]
        if k == 1 and (x, y) == (sx + 1, sy + 1):
            return ASPH[3]                      # pebble's own tiny shadow
    return ASPH[2]


def _gv(v):
    return lambda x, y: _ground(x, y, v)


# ---------------------------------------------------------------- blast-wall border (raised)
_BOLLARD = {}
for _y, _row in enumerate(("..KKK..", ".KAAAK.", ".KBBBKs", ".KKKKKs", ".KBBBKs", ".KKKKKs", "..sss..")):
    for _x, _ch in enumerate(_row):
        if _ch != ".":
            _BOLLARD[(5 + _x, 1 + _y)] = {"K": BLACK, "A": YEL[0], "B": YEL[1], "s": CONC[3]}[_ch]
def blast_wall(d, facing, x, y, f, m):
    """Raised concrete blast wall: lit cap with hazard-striped bollards, dark outline, a south face
    with panel seams and a yellow/black hazard band at its foot."""
    if d < 0:
        if _has(facing, "S") and d > -2:
            return ASPH[4]                      # contact shade at the foot
        return _ground(x, y)
    if _has(facing, "S") and d < 9:
        if d < 1:
            return BLACK
        if d >= 8:
            return CONC[0]                      # lit lip of the cap
        if d < 3:
            return YEL[1] if (x + y) % 6 < 3 else BLACK
        if x % 8 == 3:
            return NAVY[4]                      # panel seams
        if x % 8 == 4:
            return CONC[3]
        return CONC[4] if d < 5 else CONC[3]
    if (_has(facing, "E") or _has(facing, "W")) and d < 3:
        if d < 1:
            return BLACK
        if _has(facing, "W"):
            return CONC[0] if d < 2 else CONC[1]
        return CONC[4] if d < 2 else CONC[3]
    if _has(facing, "N") and d < 2:
        return BLACK if d < 1 else CONC[0]
    if d >= 2.5:                                # round hazard bollard set into the cap
        b = _BOLLARD.get((x, y))
        if b is not None:
            return b
    if y % 8 == 7:
        return CONC[2]
    if (x, y) in ((2, 4), (13, 11), (4, 13)):
        return CONC[2]
    return CONC[1]


def _diamond(x, y):
    """Diamond (tread) plate: alternating raised dashes on a 4 px lattice, lit top-left."""
    u, v = x % 4, y % 4
    if (x // 4 + y // 4) % 2 == 0:
        dash, shadow = ((1, 2), (2, 1)), ((2, 2), (3, 1))
    else:
        dash, shadow = ((1, 1), (2, 2)), ((2, 1), (3, 2))
    if (u, v) in dash:
        return STL[0]
    if (u, v) in shadow:
        return STL[3]
    return STL[2] if (x + 2 * y) % 16 else STL[1]


def steel_plate(d, facing, x, y, f, m):
    """Raised steel tread-plate walkway: dark rim, lit N/W bevel, short south face."""
    if d < -1:
        return _ground(x, y)
    if d < 0:
        return ASPH[4]
    if d < 1:
        return STL[4]
    if _has(facing, "S") and d < 3:
        return NAVY[3] if d < 2 else STL[3]
    if d < 2:
        return STL[0] if (_has(facing, "N") or _has(facing, "W")) else STL[3]
    return _diamond(x, y)


def _concrete(x, y):
    yy = y % 8
    xx = (x + (4 if (y // 8) % 2 else 0)) % 8
    if xx == 7 or yy == 7:
        return CONC[3]
    if xx == 0 or yy == 0:
        return CONC[0]
    if (x, y) in ((3, 3), (12, 5), (6, 12), (14, 13), (9, 9)):
        return CONC[2]
    return CONC[1]


def apron(d, facing, x, y, f, m):
    """Concrete slab apron framed by a yellow/black hazard-stripe band."""
    if d < -1:
        return _ground(x, y)
    if d < 0:
        return ASPH[4]
    if d < 1:
        return BLACK
    if d < 4:
        if _has(facing, "S") and d < 2:
            return YEL[3] if (x + y) % 8 < 4 else BLACK
        if (x + y) % 8 < 4:
            return YEL[0] if d < 2 and (_has(facing, "N") or _has(facing, "W")) else YEL[1]
        return BLACK
    if d < 5:
        return CONC[4]
    return _concrete(x, y)


def conduit(d, facing, x, y, f, m):
    """Sunken cable trench, 4 frames: steel lip, dark wall, grated cover over a pulsing plasma cable."""
    if d < -1:
        return _ground(x, y)
    if d < 0:
        return ASPH[4]
    if d < 1:
        return STL[4]
    if _has(facing, "N") and d < 4:            # the trench's north wall shows its face
        return STL[1] if d < 2 else NAVY[3] if d < 3 else NAVY[4]
    if d < 2:
        return STL[1] if _has(facing, "W") else STL[3]
    if d < 2.6:
        return NAVY[4]
    if d > 7 and (x % 4 == 0 or y % 4 == 0):   # wide pits get a grate cover
        return NAVY[1] if (x % 4 == 0 and y % 4 == 0) else NAVY[2]
    if x % 8 == 0 or y % 8 == 0:               # grate bars over the cable
        return NAVY[1] if (x % 8 == 0 and y % 8 == 0) else NAVY[2]
    if (x + y - 4 * f) % 16 in (0, 1, 2) and d >= 3.4:
        return PLASMA[0]
    return PLASMA[3] if d < 3.4 else PLASMA[2] if d < 4.4 else PLASMA[1]


TERRAIN = {
    "electric-ground": dict(kind="fill", behaviour="NORMAL", variants=[_gv(v) for v in range(4)]),
    "electric-border": dict(kind="blob", behaviour="NORMAL", paint=blast_wall, overlay_cut=-2.0,
                            sdf=dict(margin=1.0, radius=3, wobble=0.0, freq=1)),
    "electric-steel-plate": dict(kind="blob", behaviour="NORMAL", paint=steel_plate,
                                 sdf=dict(margin=2, radius=2, wobble=0.0, freq=1)),
    "electric-apron": dict(kind="blob", behaviour="NORMAL", paint=apron,
                           sdf=dict(margin=1, radius=2, wobble=0.0, freq=1)),
    "electric-conduit": dict(kind="blob", behaviour="NORMAL", paint=conduit, frames=4, emissive=PLASMA[:4],
                             sdf=dict(margin=2.5, radius=2, wobble=0.0, freq=1)),
}


# ---------------------------------------------------------------- props
def _canvas(w, h):
    return Image.new("RGBA", (w * 16, h * 16), (0, 0, 0, 0))


def _insulator(d, x, top, bottom):
    """Ribbed ceramic insulator stack, 3 px wide, copper cap."""
    d.rectangle([x - 1, top, x + 1, bottom], fill=_a(CERAMIC[1]))
    for yy in range(top + 1, bottom + 1, 2):
        d.line([x - 1, yy, x + 1, yy], fill=_a(CERAMIC[2]))
    d.line([x - 1, top + 1, x - 1, bottom], fill=_a(CERAMIC[0]))
    d.point((x - 1, top + 2), fill=_a(CERAMIC[0]))
    d.line([x - 1, top - 1, x + 1, top - 1], fill=_a(COP[1]))
    d.point((x, top - 2), fill=_a(COP[3]))


def power_pole():
    im = _canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 4, 12, 30, alpha=90)
    d.rectangle([5, 27, 10, 30], fill=_a(CONC[2]), outline=_a(CONC[4]))
    d.line([6, 28, 9, 28], fill=_a(CONC[0]))
    d.rectangle([6, 7, 9, 27], fill=_a(STL[2]), outline=_a(STL[4]))
    d.line([7, 8, 7, 26], fill=_a(STL[0]))
    for yy in range(19, 24):                   # hazard collar
        for xx in range(7, 9):
            im.putpixel((xx, yy), _a(YEL[1] if (xx + yy) % 4 < 2 else BLACK))
    d.rectangle([0, 8, 15, 10], fill=_a(NAVY[2]), outline=_a(NAVY[4]))
    d.line([1, 8, 14, 8], fill=_a(NAVY[0]))
    d.line([3, 11, 6, 14], fill=_a(NAVY[3]))  # braces
    d.line([12, 11, 9, 14], fill=_a(NAVY[3]))
    for x in (2, 13):
        _insulator(d, x, 3, 7)
    _insulator(d, 8, 1, 6)
    return [im]


def transformer():
    im = _canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 1, 15, 30, alpha=90)
    for x in (4, 8, 12):                       # bushings on the lid
        _insulator(d, x, 5, 13)
    d.rectangle([1, 13, 14, 29], fill=_a(NAVY[2]), outline=_a(NAVY[4]))
    d.rectangle([2, 14, 13, 16], fill=_a(NAVY[1]))           # lid top
    d.line([2, 14, 13, 14], fill=_a(NAVY[0]))
    d.line([2, 17, 13, 17], fill=_a(NAVY[4]))
    for x in range(2, 14):                     # cooling fins on the south face
        d.line([x, 18, x, 28], fill=_a(NAVY[1] if x % 3 == 0 else NAVY[2] if x % 3 == 1 else NAVY[3]))
    d.rectangle([5, 20, 10, 25], fill=_a(YEL[1]), outline=_a(BLACK))   # warning plate, bolt glyph
    for x, y in ((8, 21), (7, 22), (8, 22), (7, 23), (6, 24), (9, 22)):
        im.putpixel((x, y), _a(BLACK))
    d.line([2, 28, 13, 28], fill=_a(NAVY[4]))
    im.putpixel((13, 15), _a(GLOW[1]))         # status lamp
    im.putpixel((12, 15), _a(GLOW[3]))
    return [im]


def cable_spool():
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 14, 14, alpha=90)
    d.ellipse([1, 8, 14, 14], fill=_a(BARK[1]), outline=_a(BARK[2]))     # bottom flange
    d.rectangle([3, 6, 12, 11], fill=_a(COP[2]))                           # copper winding
    for y in range(6, 12):
        d.line([3, y, 12, y], fill=_a(COP[1] if y % 2 else COP[3]))
    d.line([3, 6, 3, 11], fill=_a(COP[0]))
    d.line([12, 6, 12, 11], fill=_a(COP[4]))
    d.ellipse([1, 2, 14, 8], fill=_a(WOOD[1]), outline=_a(BARK[2]))      # top flange
    d.ellipse([3, 3, 12, 7], fill=_a(WOOD[0]))
    d.ellipse([6, 4, 9, 6], fill=_a(BARK[2]))
    d.point((7, 5), fill=_a(BLACK))
    d.line([13, 9, 15, 12], fill=_a(COP[1]))  # loose cable end
    return [im]


def beacon():
    frames = []
    for k in range(4):
        im = _canvas(1, 2)
        d = ImageDraw.Draw(im)
        contact_shade(im, 4, 12, 30, alpha=90)
        d.rectangle([5, 27, 10, 30], fill=_a(NAVY[2]), outline=_a(NAVY[4]))
        d.line([6, 28, 9, 28], fill=_a(NAVY[0]))
        d.rectangle([7, 13, 8, 27], fill=_a(STL[2]))
        d.line([7, 13, 7, 27], fill=_a(STL[0]))
        for y in range(16, 26):
            im.putpixel((8, y), _a(STL[3]))
        for y in range(18, 23):                # hazard collar
            for x in (7, 8):
                im.putpixel((x, y), _a(YEL[1] if (x + y) % 4 < 2 else BLACK))
        d.rectangle([4, 11, 11, 13], fill=_a(STL[1]), outline=_a(STL[4]))
        d.ellipse([4, 3, 11, 12], fill=_a(GLOW[2]), outline=_a(YEL[4]))
        d.rectangle([5, 10, 10, 11], fill=_a(GLOW[3]))
        sx = (5, 7, 9, 7)[k]
        bright = 2 if k != 3 else 1
        for y in range(5, 10):
            for x in range(sx, sx + bright):
                im.putpixel((x, y), _a(GLOW[1]))
        im.putpixel((sx, 5), _a(GLOW[0]))
        d.line([7, 2, 8, 2], fill=_a(STL[4]))
        frames.append(im)
    return frames


def tesla_post():
    frames = []
    arcs = [((3, 4), (2, 3), (1, 5)), ((12, 3), (13, 5), (14, 4)), ((5, 1), (10, 0), (11, 1))]
    for k in range(3):
        im = _canvas(1, 2)
        d = ImageDraw.Draw(im)
        contact_shade(im, 2, 14, 30, alpha=90)
        d.rectangle([3, 23, 12, 29], fill=_a(NAVY[2]), outline=_a(NAVY[4]))   # plinth
        d.line([4, 24, 11, 24], fill=_a(NAVY[0]))
        for x in range(4, 12):
            for y in (26, 27):
                im.putpixel((x, y), _a(YEL[1] if (x + y) % 4 < 2 else BLACK))
        d.rectangle([5, 12, 10, 22], fill=_a(COP[2]), outline=_a(COP[4]))     # coil
        for y in range(13, 22):
            d.line([6, y, 9, y], fill=_a(COP[1] if y % 2 else COP[3]))
        d.line([6, 13, 6, 21], fill=_a(COP[0]))
        d.ellipse([2, 9, 13, 13], fill=_a(STL[1]), outline=_a(STL[4]))       # toroid
        d.line([4, 10, 9, 10], fill=_a(STL[0]))
        d.ellipse([5, 2, 10, 8], fill=_a(PLASMA[2]), outline=_a(PLASMA[4]))  # plasma orb
        d.ellipse([6, 3, 9, 6], fill=_a(PLASMA[1]))
        im.putpixel((7, 4), _a(PLASMA[0]))
        for i, (x, y) in enumerate(arcs[k]):
            im.putpixel((x, y), _a(PLASMA[0] if i == 0 else PLASMA[1]))
        frames.append(im)
    return frames


def _rail_tile(mask, gate=None):
    """Yellow safety rail; mask bits 1=N 2=E 4=S 8=W."""
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    if mask & 2 or mask & 8:
        x0 = 0 if mask & 8 else 8
        x1 = 15 if mask & 2 else 8
        for y0 in (4, 8):
            d.rectangle([x0, y0, x1, y0 + 1], fill=_a(YEL[1]))
            d.line([x0, y0, x1, y0], fill=_a(YEL[0]))
            d.line([x0, y0 + 2, x1, y0 + 2], fill=_a(YEL[4]))
    if mask & 1 or mask & 4:
        y0 = 0 if mask & 1 else 8
        y1 = 15 if mask & 4 else 8
        d.rectangle([6, y0, 9, y1], fill=_a(YEL[1]))
        d.line([6, y0, 6, y1], fill=_a(YEL[0]))
        d.line([9, y0, 9, y1], fill=_a(YEL[3]))
        d.line([7, y0, 8, y0] if False else [8, y0, 8, y1], fill=_a(YEL[2]))
    d.rectangle([6, 2, 9, 12], fill=_a(STL[2]), outline=_a(STL[4]))       # post
    d.line([7, 4, 7, 11], fill=_a(STL[0]))
    d.rectangle([6, 2, 9, 3], fill=_a(YEL[1]))
    d.point((6, 3), fill=_a(BLACK))
    d.point((9, 2), fill=_a(BLACK))
    contact_shade(im, 5, 11, 13, alpha=80)
    if gate == "closed":                         # striped boom arm across the gap
        for x in range(10, 16):
            for y in (6, 7):
                im.putpixel((x, y), _a(YEL[1] if (x // 2) % 2 == 0 else BLACK))
        d.line([10, 8, 15, 8], fill=_a(YEL[4]))
    if gate == "open":                           # boom raised
        for y in range(0, 6):
            for x in (10, 11):
                im.putpixel((x, y), _a(YEL[1] if (y // 2) % 2 == 0 else BLACK))
        d.line([12, 0, 12, 5], fill=_a(YEL[4]))
    return im


def safety_rail():
    return [[_rail_tile(m)] for m in range(16)] + [[_rail_tile(8, "closed")], [_rail_tile(8, "open")]]


def drain():
    """Storm-drain grate flush with the asphalt."""
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    d.rectangle([3, 6, 12, 12], fill=_a(STL[3]), outline=_a(BLACK))
    d.line([4, 7, 11, 7], fill=_a(STL[1]))
    d.line([4, 7, 4, 11], fill=_a(STL[1]))
    for x in range(5, 12, 2):
        d.line([x, 8, x, 11], fill=_a(NAVY[4]))
    d.line([4, 13, 12, 13], fill=_a(ASPH[3]))
    return [im]


def hazard_cone():
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 3, 13, 14, alpha=90)
    d.rectangle([3, 12, 12, 14], fill=_a(BLACK))
    d.line([4, 12, 11, 12], fill=_a(NAVY[3]))
    d.polygon([(7, 2), (8, 2), (11, 12), (4, 12)], fill=_a(YEL[1]), outline=_a(YEL[4]))
    for y in (6, 7, 10):
        for x in range(4, 12):
            if im.getpixel((x, y))[3] and im.getpixel((x, y))[:3] != YEL[4]:
                im.putpixel((x, y), _a(BLACK))
    d.line([7, 3, 5, 11], fill=_a(YEL[0]))
    return [im]


def capacitor_bank():
    """Two tall capacitor cans on a navy plinth, insulator tops and a charge lamp."""
    im = _canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 1, 15, 30, alpha=90)
    d.rectangle([1, 25, 14, 30], fill=_a(NAVY[2]), outline=_a(NAVY[4]))
    d.line([2, 26, 13, 26], fill=_a(NAVY[0]))
    for x in range(2, 14):
        im.putpixel((x, 28), _a(YEL[1] if x % 4 < 2 else BLACK))
    for x0 in (2, 8):
        d.rectangle([x0, 10, x0 + 5, 25], fill=_a(STL[2]), outline=_a(STL[4]))
        d.line([x0 + 1, 11, x0 + 1, 24], fill=_a(STL[0]))
        d.line([x0 + 4, 11, x0 + 4, 24], fill=_a(STL[3]))
        d.line([x0 + 1, 15, x0 + 4, 15], fill=_a(COP[2]))
        d.line([x0 + 1, 20, x0 + 4, 20], fill=_a(COP[2]))
        _insulator(d, x0 + 2, 5, 9)
    d.line([5, 3, 10, 3], fill=_a(COP[1]))        # bus bar between the cans
    d.point((4, 4), fill=_a(COP[3]))
    d.point((11, 4), fill=_a(COP[3]))
    im.putpixel((7, 22), _a(GLOW[1]))
    im.putpixel((7, 23), _a(GLOW[3]))
    return [im]


PROPS = {
    "electric-power-pole": dict(cells=(1, 2), paint=power_pole),
    "electric-transformer": dict(cells=(1, 2), paint=transformer, emissive=[GLOW[1], GLOW[3]]),
    "electric-cable-spool": dict(cells=(1, 1), paint=cable_spool),
    "electric-beacon": dict(cells=(1, 2), paint=beacon, emissive=GLOW[:4], lamp=(255, 214, 90),
                            order=[0, 1, 2, 3]),
    "electric-tesla-post": dict(cells=(1, 2), paint=tesla_post, emissive=PLASMA[:3], lamp=(150, 220, 255),
                                order=[0, 1, 2]),
    "electric-safety-rail": dict(cells=(1, 1), paint=safety_rail, kind="cross"),
    "electric-drain": dict(cells=(1, 1), paint=drain),
    "electric-hazard-cone": dict(cells=(1, 1), paint=hazard_cone),
    "electric-capacitor-bank": dict(cells=(1, 2), paint=capacitor_bank, emissive=[GLOW[1], GLOW[3]]),
}

# ---------------------------------------------------------------- review scene around the gym
_RAIL = "electric-safety-rail"
GYM = dict(
    structure_at=(8, 4),          # top-left cell of the gym's 8x8-metatile structure canvas (door at cols 11-12)
    ground="electric-ground",
    scene=[
        "BBBBBBBBBBBBBBBBBBBBBBBB",
        "BB....................BB",
        "B.cccc............cccc.B",
        "B.cccc............cccc.B",
        "B.cccc............cccc.B",
        "B..e................e..B",
        "B..e................e..B",
        "B..e................e..B",
        "B..eee............eee..B",
        "B....e............e....B",
        "B....cccccccccccccc....B",
        "B....cccccccccccccc....B",
        "B.cccc....pppp....cccc.B",
        "B.cccc....pppp....cccc.B",
        "B..........pp..........B",
        "B..........pp..........B",
        "BBBBBBBBBBBppBBBBBBBBBBB",
    ],
    chars={"c": "electric-apron", "e": "electric-conduit", "p": "electric-steel-plate", "B": "electric-border"},
    props=[("electric-transformer", 2, 4), ("electric-power-pole", 4, 4),
           ("electric-transformer", 21, 4), ("electric-power-pole", 19, 4),
           ("electric-cable-spool", 6, 7), ("electric-cable-spool", 17, 7),
           ("electric-drain", 8, 8), ("electric-drain", 15, 8), ("electric-drain", 2, 10),
           ("electric-drain", 7, 15), ("electric-drain", 21, 15),
           ("electric-hazard-cone", 1, 9), ("electric-hazard-cone", 22, 9),
           ("electric-hazard-cone", 9, 15), ("electric-hazard-cone", 16, 15),
           ("electric-capacitor-bank", 2, 13), ("electric-capacitor-bank", 3, 13),
           ("electric-capacitor-bank", 20, 13), ("electric-capacitor-bank", 21, 13),
           ("electric-cable-spool", 4, 13), ("electric-cable-spool", 19, 12),
           ("electric-beacon", 5, 11), ("electric-beacon", 18, 11),
           ("electric-tesla-post", 9, 13), ("electric-tesla-post", 14, 13), ("sign", 13, 15)],
    fences=[(c, 5, _RAIL) for c in (1, 2, 4, 5, 6)] + [(6, r, _RAIL) for r in (2, 3, 4)]
    + [(c, 5, _RAIL) for c in (17, 18, 19, 21, 22)] + [(17, r, _RAIL) for r in (2, 3, 4)]
    + [(c, 14, _RAIL) for c in (2, 3, 4, 5)] + [(c, 14, _RAIL) for c in (18, 19, 20, 21)],
)


# ---------------------------------------------------------------- biome foliage (soft theme recolours)
from biome import biome_pieces  # noqa: E402

_BT, _BP = biome_pieces("electric")
TERRAIN.update(_BT)
PROPS.update(_BP)
