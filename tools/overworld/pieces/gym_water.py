"""Water gym (Waterfall Rotunda) surroundings: white-marble / aqua pool-tile plaza, marble-rimmed
reflecting pools that glow at night, pebble-beach ponds, coral, pearl reef lamps, lily pads, reeds,
a shell fountain and an anchor. Palette pulled from the gym's own sheet (white marble shaded to
periwinkle, sea blue, aqua trim, coral, pearl) so pieces sit next to it without clashing.
Slugs are prefixed `water-`. GYM describes the review scene (review-gym-water.png)."""
import math

from PIL import Image, ImageDraw

from overworld_kit import TALL, contact_shade, draw_blobs, h16

TAU = 2 * math.pi
MARBLE = [(250, 252, 255), (226, 234, 246), (196, 206, 230), (150, 160, 200), (107, 116, 166)]
AQUA = [(236, 250, 250), (190, 230, 236), (150, 200, 214), (100, 150, 180), (70, 100, 140)]
SEA = [(120, 200, 255), (70, 160, 240), (40, 120, 210), (30, 84, 170), (24, 56, 120)]
ROCK = [(220, 226, 236), (186, 196, 214), (150, 160, 186), (110, 120, 152), (76, 84, 116)]
CORAL = [(255, 196, 178), (250, 146, 134), (222, 98, 112), (172, 64, 98), (118, 44, 82)]
PEARL = [(255, 248, 244), (246, 224, 230), (222, 190, 210), (178, 150, 186), (128, 108, 152)]
GLOW = [(222, 255, 255), (142, 236, 255), (72, 190, 242), (42, 132, 212), (32, 90, 176)]  # pool / pearl light
POND = [(216, 244, 255), (118, 192, 244), (66, 146, 226), (48, 106, 200), (36, 74, 156)]
WETSAND = [(214, 196, 160), (190, 168, 132), (156, 136, 112), (120, 104, 96)]
LILY = [(160, 220, 112), (104, 184, 80), (64, 144, 64), (34, 96, 52)]
GROUT = (64, 124, 200)
TILE = [(206, 240, 248), (150, 208, 232), (112, 176, 214), (80, 132, 186)]   # aqua glaze tile
OUT = (62, 70, 112)                      # cool marble outline
SAND = [(244, 234, 206), (234, 222, 190), (220, 204, 168), (196, 178, 144), (160, 140, 118)]  # beach sand
FOAM = [(250, 254, 255), (214, 238, 250), (160, 208, 236)]
REEF_OUT = (40, 56, 100)


def _has(facing, side):
    return facing is not None and side in facing


# ---------------------------------------------------------------- ground (fill) and border
# Sparse soft details per variant, all at fixed spots of a 16 px period (exact-repeat tiles).
_SPECKS = [
    [(3, 4, 2), (12, 11, 2), (9, 2, 0)],
    [(10, 5, 2), (2, 12, 2), (13, 14, 0), (6, 9, 2)],
    [(7, 13, 2), (14, 3, 0)],
    [(5, 7, 2)],
]
_SHELLS = [[(11, 6, PEARL)], [], [], []]             # tiny 2 px shells
_DAMP = [[], [], [], [(9, 10), (10, 10), (11, 10), (8, 11), (9, 11), (10, 11), (11, 11), (12, 11),
                    (9, 12), (10, 12), (11, 12), (10, 13)]]          # one soft damp patch


def beach_px(x, y, v=0):
    """Pale wet beach sand: calm cream base, a few soft darker grains, a tiny shell or damp patch."""
    x, y, v = x % 16, y % 16, v % 4
    for sx, sy, ramp in _SHELLS[v]:
        if (x, y) == (sx, sy):
            return ramp[0]
        if (x, y) == (sx + 1, sy):
            return ramp[2]
        if (x, y) == (sx + 1, sy + 1):
            return SAND[3]
    if (x, y) in _DAMP[v]:
        edge = (x, y) in (_DAMP[v][0], _DAMP[v][4], _DAMP[v][7], _DAMP[v][-1])
        return SAND[2] if edge else (226, 210, 176)
    for sx, sy, k in _SPECKS[v]:
        if (x, y) == (sx, sy):
            return SAND[k]
        if k == 2 and (x, y) == (sx - 1, sy - 1):
            return SAND[0]
    return SAND[1]


_BOULDERS = ((4.5, 4.0, 5.2), (12.5, 2.5, 4.4), (10.0, 10.5, 5.6), (2.0, 12.5, 4.2), (16.0, 9.0, 3.4),
             (6.0, 15.5, 3.0))
_CREVICE_LIFE = {(9, 6): CORAL[1], (10, 6): CORAL[2], (9, 5): CORAL[0], (1, 7): AQUA[1], (2, 7): AQUA[2],
                 (14, 15): CORAL[2], (15, 15): CORAL[1], (5, 10): AQUA[2], (4, 9): AQUA[1],
                 (13, 7): CORAL[2], (14, 7): CORAL[1], (7, 1): CORAL[2]}


def _reef_top(x, y):
    """Reef-rock top: irregular pale boulders (16 px seamless) lit top-left, a few coral sprigs and
    anemones tucked in the dark crevices between them."""
    best, bn = -99.0, (0.0, 0.0)
    for cx, cy, r in _BOULDERS:
        for ddx in (-16, 0, 16):
            for ddy in (-16, 0, 16):
                dx, dy = x + 0.5 - (cx + ddx), y + 0.5 - (cy + ddy)
                q = r - math.hypot(dx, dy)
                if q > best:
                    best, bn = q, (dx / r, dy / r)
    if best < 0.6:
        return _CREVICE_LIFE.get((x, y), ROCK[4])
    if best < 1.4:
        return ROCK[3]
    l = -bn[0] * 0.65 - bn[1] * 0.75
    return ROCK[0] if l > 0.45 else ROCK[1] if l > -0.1 else ROCK[2]


def reef_wall(d, facing, x, y, f, m):
    """Raised reef / white sea-cliff: boulder-and-coral top, chalk strata south face, surf at its foot."""
    if d < 0:
        return FOAM[2] if _has(facing, "S") and d > -1.5 else beach_px(x, y)
    if d < 1:
        return REEF_OUT
    if _has(facing, "S") and d < 9:
        if d < 2.5:                                    # surf foam breaking on the cliff foot
            return FOAM[0] if (x + int(d)) % 5 else FOAM[1]
        if d < 3.5:
            return FOAM[1] if x % 3 else FOAM[2]
        if d >= 8:
            return REEF_OUT                            # dark lip edge under the top
        if 5.5 <= d < 6.5:
            return MARBLE[1]                           # pale stratum band
        crack = ((x * 5) % 11) < 2
        return MARBLE[3] if crack else (MARBLE[2] if d < 5.5 else MARBLE[1])
    if (_has(facing, "E") or _has(facing, "W")) and d < 3:
        return REEF_OUT if d < 1 else MARBLE[2] if d < 2 else ROCK[3]
    if (_has(facing, "N")) and d < 2:
        return MARBLE[0]
    return _reef_top(x, y)


# ---------------------------------------------------------------- terrain
def _tile_px(x, y):
    """8 px pool tiles: white marble and aqua glaze in a checker, blue grout, lit top-left bevel."""
    xx, yy = x % 8, y % 8
    tx, ty = (x // 8) % 2, (y // 8) % 2
    ramp = TILE if tx != ty else MARBLE
    if xx == 7 or yy == 7:
        return GROUT
    if xx == 0 or yy == 0:
        return ramp[0]
    if xx == 6 or yy == 6:
        return ramp[2]
    if ramp is MARBLE and (xx, yy) in (((2, 4), (3, 3), (4, 3), (5, 2)) if tx else ((1, 2), (2, 3), (3, 3), (4, 4))):
        return MARBLE[2]                         # fixed hairline vein, different on the two marble tiles
    return ramp[1]


def marble_plaza(d, facing, x, y, f, m):
    """White-marble / aqua pool-tile paving with blue grout and a short south curb."""
    if d < -1:
        return beach_px(x, y)
    if d < 0:
        return SAND[3]
    if d < 1:
        return OUT
    if _has(facing, "S") and d < 3:
        return MARBLE[3] if d < 2 else MARBLE[2]
    if d < 2:
        return MARBLE[0] if (_has(facing, "N") or _has(facing, "W")) else MARBLE[2]
    return _tile_px(x, y)


def _caustic(x, y, f):
    a = TAU / 16
    v = math.sin(a * (x + 2 * f) + 1.3 * math.sin(a * y)) + \
        0.7 * math.sin(2 * a * y + 0.9 * math.cos(a * x) - TAU * f / 8)
    return GLOW[0] if v > 1.25 else GLOW[1] if v > 0.55 else GLOW[2] if v > -0.7 else GLOW[3]


def reflecting_pool(d, facing, x, y, f, m):
    """Sunken pool, 8 frames: marble coping, tiled inner wall under the north rim, caustic water."""
    if d < -1:
        return beach_px(x, y)
    if d < 0:
        return SAND[3]
    if d < 1:
        return OUT
    if d < 2:
        return MARBLE[0] if (_has(facing, "N") or _has(facing, "W")) else MARBLE[1]
    if d < 3.5:
        return MARBLE[1] if not _has(facing, "S") else MARBLE[2]
    if d < 4.5:
        return MARBLE[3]
    if _has(facing, "N") and d < 8:             # inner wall below the north coping
        if d < 5.5:
            return AQUA[3]
        return AQUA[2] if x % 4 else AQUA[3]
    edge = d - (3.5 if _has(facing, "N") else 0)
    if edge < 5.5:
        return GLOW[4]                           # deep shadow line along the wall
    if edge < 6.5:
        return GLOW[3]
    return _caustic(x, y, f)


def _pebble_px(x, y):
    """Fixed pebbles on wet sand (16 px periodic): lit top-left, dark bottom-right."""
    for (px, py, w, h, ramp) in ((1, 1, 3, 2, ROCK), (6, 3, 2, 2, PEARL), (11, 1, 3, 3, ROCK),
                                 (3, 7, 2, 2, PEARL), (8, 8, 3, 2, ROCK), (13, 6, 2, 2, ROCK),
                                 (0, 12, 3, 2, PEARL), (6, 13, 2, 2, ROCK), (11, 12, 3, 2, PEARL)):
        u, v = (x - px) % 16, (y - py) % 16
        if u < w and v < h:
            if u == 0 and v == 0:
                return ramp[0]
            if u == w - 1 or v == h - 1:
                return ramp[3]
            return ramp[1]
        if (u, v) in ((w, h - 1), (w - 1, h)) or (u < w and v == h):
            return WETSAND[3]                    # tiny wet shadow under each pebble
    return WETSAND[1] if (x + 2 * y) % 7 else WETSAND[2]


def _pond_water(x, y, f):
    yy, row = y % 8, y // 8
    xx = (x + 2 * f + (5 if row % 2 else 0)) % 16
    if yy == 2 and xx in (2, 3, 4):
        return POND[0]
    if (yy == 3 and xx in (1, 5)) or (yy == 6 and xx in (10, 11)):
        return POND[1]
    return POND[2] if (yy + (xx // 4)) % 7 else POND[3]


def pebble_pond(d, facing, x, y, f, m):
    """Natural pond with a wet-pebble beach rim and a lapping foam line, 8 frames."""
    if d < -1:
        return beach_px(x, y)
    if d < 0:
        return SAND[3]
    if d < 1:
        return WETSAND[3]
    swash = 5.5 + 1.0 * math.sin(TAU * f / 8)
    if d < swash:
        return _pebble_px(x, y)
    if d < swash + 1:
        return POND[0] if (x + y + f) % 3 else GLOW[0]
    if d < swash + 2.5:
        return POND[1]
    return _pond_water(x, y, f)


TERRAIN = {
    "water-ground": dict(kind="fill", behaviour="SAND",
                         variants=[(lambda x, y, v=v: beach_px(x, y, v)) for v in range(4)]),
    "water-border": dict(kind="blob", behaviour="NORMAL", paint=reef_wall,
                         sdf=dict(margin=1.5, radius=4, wobble=0.6, freq=2)),
    "water-marble-plaza": dict(kind="blob", behaviour="NORMAL", paint=marble_plaza,
                               sdf=dict(margin=2, radius=2, wobble=0.0, freq=1)),
    "water-reflecting-pool": dict(kind="blob", behaviour="POND_WATER", paint=reflecting_pool, frames=8,
                                  emissive=GLOW, sdf=dict(margin=2, radius=3, wobble=0.0, freq=1)),
    "water-pebble-pond": dict(kind="blob", behaviour="POND_WATER", paint=pebble_pond, frames=8,
                              sdf=dict(margin=2, radius=4, wobble=0.9, freq=1)),
}


# ---------------------------------------------------------------- props
def _canvas(w, h):
    return Image.new("RGBA", (w * 16, h * 16), (0, 0, 0, 0))


def _a(c):
    return c + (255,)


def coral():
    """Branching pink coral clump on a pale reef stone, with a small pearl shell."""
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 14, 14, alpha=90)
    draw_blobs(im, [(8, 12, 6, 2.5)], ROCK, ROCK[4])
    for x0, y0, x1, y1 in ((8, 12, 8, 3), (8, 9, 4, 4), (8, 8, 12, 3), (5, 6, 2, 5), (11, 6, 14, 7), (8, 10, 11, 8)):
        d.line([x0, y0, x1, y1], fill=_a(CORAL[4]), width=3)
    for x0, y0, x1, y1 in ((8, 12, 8, 3), (8, 9, 4, 4), (8, 8, 12, 3), (5, 6, 2, 5), (11, 6, 14, 7), (8, 10, 11, 8)):
        d.line([x0, y0, x1, y1], fill=_a(CORAL[2]))
        d.line([x0 - 1, y0, x1 - 1, y1], fill=_a(CORAL[1]))
    for x, y in ((8, 3), (4, 4), (12, 3), (2, 5), (14, 7)):
        im.putpixel((x, y), _a(CORAL[0]))
    d.ellipse([10, 10, 14, 13], fill=_a(PEARL[1]), outline=_a(PEARL[4]))
    d.line([11, 11, 12, 11], fill=_a(PEARL[0]))
    return [im]


def shell_lamp():
    """Reef lamp: scallop-shell foot, coral post, open clam holding a glowing pearl."""
    im = _canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 3, 13, 30, alpha=90)
    d.pieslice([2, 23, 13, 36], 180, 360, fill=_a(PEARL[1]), outline=_a(PEARL[4]))
    d.line([2, 29, 13, 29], fill=_a(PEARL[4]))
    for x in (5, 8, 11):
        d.line([7.5, 29, x, 25], fill=_a(PEARL[3]))
    d.line([4, 27, 6, 25], fill=_a(PEARL[0]))
    d.rectangle([6, 11, 9, 24], fill=_a(CORAL[2]), outline=_a(CORAL[4]))
    d.line([7, 12, 7, 23], fill=_a(CORAL[1]))
    d.rectangle([4, 16, 6, 17], fill=_a(CORAL[2]), outline=_a(CORAL[4]))
    d.rectangle([9, 19, 11, 20], fill=_a(CORAL[3]), outline=_a(CORAL[4]))
    d.chord([2, 6, 13, 14], 0, 180, fill=_a(PEARL[1]), outline=_a(PEARL[4]))          # lower valve
    d.line([4, 10, 11, 10], fill=_a(PEARL[3]))
    d.chord([3, 0, 12, 7], 180, 360, fill=_a(PEARL[2]), outline=_a(PEARL[4]))         # upper valve
    d.line([5, 2, 7, 1], fill=_a(PEARL[0]))
    d.ellipse([5, 4, 10, 9], fill=_a(GLOW[2]), outline=_a(GLOW[3]))
    d.ellipse([6, 5, 8, 7], fill=_a(GLOW[1]))
    im.putpixel((6, 5), _a(GLOW[0]))
    return [im]


def lily_pads():
    """Floating lily pads (sit on a water cell) with one pink bloom and a faint ripple."""
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    for box in ([1, 2, 9, 8], [8, 8, 15, 14], [1, 10, 6, 14]):
        x0, y0, x1, y1 = box
        d.arc([x0 - 1, y0 + 1, x1 + 1, y1 + 2], 20, 160, fill=(222, 255, 255, 110))
        d.ellipse(box, fill=_a(LILY[1]), outline=_a(LILY[3]))
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        d.polygon([(cx, cy), (x1 + 1, cy - 2), (x1 + 1, cy + 1)], fill=(0, 0, 0, 0))     # notch
        d.line([cx, cy, x1, cy - 1], fill=_a(LILY[3]))
        d.line([x0 + 2, y0 + 1, cx - 1, y0 + 1], fill=_a(LILY[0]))
        d.point((cx - 1, cy + 1), fill=_a(LILY[2]))
    for x, y, c in ((4, 3, CORAL[1]), (3, 4, CORAL[1]), (5, 4, CORAL[1]), (4, 5, CORAL[2]), (4, 4, PEARL[0]),
                    (3, 3, CORAL[0]), (5, 3, CORAL[0])):
        im.putpixel((x, y), _a(c))
    return [im]


def reeds():
    """Cattail reeds for pond edges, 3 frames (sway, play 0,1,0,2)."""
    frames = []
    stalks = [(4, 3), (7, 1), (10, 4), (12, 6)]
    for lean in (0, 1, -1):
        im = _canvas(1, 1)
        d = ImageDraw.Draw(im)
        contact_shade(im, 3, 14, 14, alpha=70)
        for i, (x, top) in enumerate(stalks):
            ln = lean if i % 2 == 0 else lean
            d.line([x, 14, x + ln, top + 3], fill=_a(TALL[3]))
            d.line([x + ln, top + 3, x + ln, top + 1], fill=_a(TALL[3]))
            d.rectangle([x + ln - 1, top, x + ln, top + 3], fill=_a((150, 96, 62)), outline=None)
            im.putpixel((x + ln - 1, top), _a((190, 132, 86)))
            im.putpixel((x + ln, top + 3), _a((96, 60, 50)))
            im.putpixel((x + ln, top - 1), _a(TALL[2]))
        for x0, x1, top in ((3, 1 + lean, 8), (8, 9 + lean, 7), (11, 14 + lean, 9), (6, 5 + lean, 10)):
            d.line([x0, 14, x1, top], fill=_a(TALL[1]))
            d.point((x1, top), fill=_a(TALL[0]))
        frames.append(im)
    return frames


def fountain():
    """Small marble shell fountain, 4 frames: jet, overflow drips and basin ripples (glow at night)."""
    frames = []
    for f in range(4):
        im = _canvas(2, 2)
        d = ImageDraw.Draw(im)
        contact_shade(im, 3, 29, 30, alpha=90)
        d.ellipse([1, 16, 30, 30], fill=_a(MARBLE[3]), outline=_a(OUT))                 # south face
        d.ellipse([1, 13, 30, 27], fill=_a(MARBLE[1]), outline=_a(OUT))                 # rim top
        d.arc([2, 14, 29, 26], 180, 270, fill=_a(MARBLE[0]))
        d.ellipse([4, 15, 27, 25], fill=_a(GLOW[2]), outline=_a(MARBLE[3]))             # water
        d.arc([5, 16, 26, 24], 200, 340, fill=_a(GLOW[3]))
        r = 3 + 2 * f
        d.arc([15.5 - r * 1.4, 20 - r * 0.55, 15.5 + r * 1.4, 20 + r * 0.55], 0, 360, fill=_a(GLOW[1]))
        d.rectangle([13, 9, 18, 21], fill=_a(MARBLE[2]), outline=_a(OUT))              # pedestal
        d.line([14, 10, 14, 20], fill=_a(MARBLE[0]))
        d.line([17, 10, 17, 20], fill=_a(MARBLE[3]))
        d.pieslice([8, 3, 23, 14], 180, 360, fill=_a(PEARL[1]), outline=_a(PEARL[4]))   # shell bowl
        d.line([8, 8, 23, 8], fill=_a(PEARL[4]))
        for x in (11, 15, 20):
            d.line([15.5, 8, x, 4], fill=_a(PEARL[3]))
        d.line([10, 6, 12, 4], fill=_a(PEARL[0]))
        for y in range(0, 5):                                                            # jet
            c = GLOW[0] if (y + f) % 3 == 0 else GLOW[1]
            im.putpixel((15, y), _a(c))
            im.putpixel((16, y), _a(GLOW[2] if (y + f) % 3 else GLOW[1]))
        for sx in (7, 24):                                                               # overflow drips
            for y in range(9, 18):
                if (y - f) % 4 != 0:
                    im.putpixel((sx, y), _a(GLOW[1] if (y - f) % 4 == 1 else GLOW[2]))
        im.putpixel((15 + (f % 2), 0), _a(GLOW[0]))
        frames.append(im)
    return frames


def anchor():
    """Navy iron anchor planted in the ground, wrapped in rope."""
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 14, 14, alpha=90)
    iron = [ROCK[2], ROCK[3], SEA[3], SEA[4]]
    d.ellipse([5, 0, 10, 4], outline=_a(iron[3]))
    d.ellipse([6, 1, 9, 3], outline=_a(iron[1]))
    d.rectangle([7, 3, 8, 13], fill=_a(iron[2]), outline=None)
    d.line([7, 4, 7, 12], fill=_a(iron[1]))
    d.rectangle([3, 4, 12, 5], fill=_a(iron[2]), outline=None)
    d.line([3, 4, 12, 4], fill=_a(iron[0]))
    d.line([2, 6, 13, 6], fill=_a(iron[3]))
    d.arc([2, 5, 13, 14], 20, 160, fill=_a(iron[3]), width=2)
    d.arc([3, 5, 12, 13], 30, 150, fill=_a(iron[1]))
    d.polygon([(1, 9), (3, 8), (4, 11)], fill=_a(iron[2]), outline=_a(iron[3]))
    d.polygon([(14, 9), (12, 8), (11, 11)], fill=_a(iron[2]), outline=_a(iron[3]))
    for y in (7, 9):
        d.line([6, y, 9, y + 1], fill=_a((206, 152, 94)))
        d.point((6, y), fill=_a((236, 190, 126)))
    d.line([9, 10, 11, 12], fill=_a((160, 110, 70)))
    return [im]


def starfish():
    """Coral starfish and two little shells lying on the sand."""
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    cx, cy = 6, 7
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        r = 5 if i % 2 == 0 else 2.2
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    sh = [(x + 1, y + 1) for x, y in pts]
    d.polygon(sh, fill=(120, 100, 80, 80))
    d.polygon(pts, fill=_a(CORAL[1]), outline=_a(CORAL[4]))
    for x, y in ((6, 4), (5, 6), (4, 7)):
        im.putpixel((x, y), _a(CORAL[0]))
    im.putpixel((6, 7), _a(CORAL[2]))
    d.pieslice([10, 9, 15, 14], 180, 360, fill=_a(PEARL[1]), outline=_a(PEARL[4]))
    d.line([10, 11, 15, 11], fill=_a(PEARL[4]))
    im.putpixel((11, 10), _a(PEARL[0]))
    d.ellipse([2, 12, 5, 14], fill=_a(AQUA[1]), outline=_a(AQUA[4]))
    im.putpixel((3, 12), _a(AQUA[0]))
    return [im]


def bollard():
    """Navy mooring bollard with a coil of rope, set in the sand."""
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 3, 13, 14, alpha=90)
    iron = [SEA[2], SEA[3], SEA[4], (16, 32, 76)]
    d.rectangle([5, 5, 10, 13], fill=_a(iron[1]), outline=_a(iron[3]))
    d.line([6, 6, 6, 12], fill=_a(iron[0]))
    d.line([9, 6, 9, 12], fill=_a(iron[2]))
    d.ellipse([3, 1, 12, 6], fill=_a(iron[1]), outline=_a(iron[3]))
    d.ellipse([5, 2, 10, 4], fill=_a(iron[0]))
    im.putpixel((6, 2), _a(AQUA[1]))
    rope = [(236, 196, 132), (206, 152, 94), (150, 104, 64)]
    for y in (8, 10):
        d.line([4, y, 11, y + 1], fill=_a(rope[1]))
        d.point((5, y), fill=_a(rope[0]))
        d.point((10, y + 1), fill=_a(rope[2]))
    d.arc([8, 11, 15, 15], 0, 360, fill=_a(rope[2]))
    d.arc([9, 11, 14, 14], 180, 300, fill=_a(rope[0]))
    return [im]


def tide_rock():
    """Pale tide rock streaked with kelp, a barnacle crust and a coral sprig."""
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 1, 15, 14, alpha=90)
    draw_blobs(im, [(8, 9, 6.5, 5), (4, 11, 3.5, 3)], ROCK, ROCK[4])
    kelp = [(96, 176, 132), (52, 128, 104), (30, 84, 80)]
    for x0, y0, x1, y1 in ((3, 14, 4, 9), (12, 14, 13, 8), (10, 14, 9, 11)):
        d.line([x0, y0, x1, y1], fill=_a(kelp[1]))
        d.point((x1, y1), fill=_a(kelp[0]))
        d.point((x0, y0 - 1), fill=_a(kelp[2]))
    for x, y in ((6, 6), (8, 5), (7, 8)):
        im.putpixel((x, y), _a(PEARL[0]))
        im.putpixel((x + 1, y + 1), _a(ROCK[3]))
    d.line([11, 6, 12, 3], fill=_a(CORAL[2]))
    d.line([12, 5, 14, 4], fill=_a(CORAL[2]))
    im.putpixel((12, 3), _a(CORAL[0]))
    im.putpixel((14, 4), _a(CORAL[1]))
    return [im]


PROPS = {
    "water-coral": dict(cells=(1, 1), paint=coral),
    "water-shell-lamp": dict(cells=(1, 2), paint=shell_lamp, emissive=GLOW[:4], lamp=(140, 236, 255)),
    "water-lily-pads": dict(cells=(1, 1), paint=lily_pads, walk=True, water=True),
    "water-reeds": dict(cells=(1, 1), paint=reeds, order=[0, 1, 0, 2], bank=True),
    "water-fountain": dict(cells=(2, 2), paint=fountain, emissive=GLOW, order=[0, 1, 2, 3]),
    "water-anchor": dict(cells=(1, 1), paint=anchor),
    "water-starfish": dict(cells=(1, 1), paint=starfish),
    "water-bollard": dict(cells=(1, 1), paint=bollard),
    "water-tide-rock": dict(cells=(1, 1), paint=tide_rock),
}

# ---------------------------------------------------------------- review scene around the gym
GYM = dict(
    structure_at=(8, 4),          # top-left cell of the gym's 8x8-metatile structure canvas (door at cols 11-12)
    ground="water-ground",
    scene=[
        "RRRRRRRRRRRRRRRRRRRRRRRR",
        "RRR..................RRR",
        "RR.oooo..........oooo.RR",
        "R.oooooo........oooooo.R",
        "R.oooooo........oooooo.R",
        "R..oooo..........oooo..R",
        "R......................R",
        "R......................R",
        "R......................R",
        "R......................R",
        "R.....mmmmmmmmmmmm.....R",
        "R...mmmmmmmmmmmmmmmm...R",
        "RR..mmmmmmmmmmmmmmmm..RR",
        "RR........mmmm........RR",
        "R....ppp..mmmm..ppp....R",
        "R....ppp..mmmm..ppp....R",
        "RR........mmmm........RR",
        "RRRRRRRRRRmmmmRRRRRRRRRR",
    ],
    chars={"m": "water-marble-plaza", "p": "water-reflecting-pool", "o": "water-pebble-pond",
           "R": "water-border"},
    props=[("water-shell-lamp", 5, 12), ("water-shell-lamp", 18, 12),
           ("water-shell-lamp", 9, 16), ("water-shell-lamp", 14, 16),
           ("water-fountain", 2, 8), ("water-fountain", 20, 8),
           ("water-coral", 1, 6), ("water-coral", 7, 3), ("water-coral", 22, 6),
           ("water-coral", 2, 14), ("water-coral", 21, 15),
           ("water-reeds", 2, 2), ("water-reeds", 6, 5), ("water-reeds", 21, 2),
           ("water-lily-pads", 4, 3), ("water-lily-pads", 18, 4),
           ("water-anchor", 16, 6), ("sign", 9, 13),
           ("water-starfish", 3, 10), ("water-starfish", 20, 13), ("water-starfish", 8, 15),
           ("water-bollard", 9, 12), ("water-bollard", 14, 12),
           ("water-tide-rock", 1, 9), ("water-tide-rock", 22, 10), ("water-tide-rock", 3, 16),
           ("water-tide-rock", 19, 16)],
)


# ---------------------------------------------------------------- biome foliage (soft theme recolours)
from biome import biome_pieces  # noqa: E402

_BT, _BP = biome_pieces("water")
TERRAIN.update(_BT)
PROPS.update(_BP)
