"""Psychic gym (Observatory Temple) surroundings: lavender marble plaza with gold inlay,
twinkling star-mosaic constellation rounds, moonflower/crystal garden beds, floating orbs on
slim pedestals, obelisks with a glowing channel, crystal shards, a brass telescope, a moon-gate
arch and star lamps. Palette pulled from the gym's own sheet (lavender marble, cella violet,
plum/magenta glow, gold, cyan lens) so pieces sit next to it without clashing.
Slugs are prefixed `psychic-`. GYM describes the review scene (review-gym-psychic.png)."""
import math

from PIL import Image, ImageDraw

from overworld_kit import contact_shade, h16

TAU = 2 * math.pi
# ramps light -> deep (sampled from gyms/psychic.py, nudged a touch darker for the overworld)
MARBLE = [(244, 240, 252), (222, 214, 242), (196, 186, 226), (160, 146, 202), (110, 96, 158)]
VIOLET = [(176, 150, 214), (146, 118, 196), (116, 90, 170), (88, 66, 142), (60, 44, 104)]
DECK = [(126, 98, 170), (100, 76, 148), (80, 58, 126), (60, 42, 104), (40, 28, 78)]
PLUM = [(240, 156, 218), (212, 108, 194), (172, 72, 168), (126, 50, 138), (84, 34, 102)]
GOLD = [(255, 236, 156), (238, 198, 102), (202, 152, 72), (152, 106, 62), (102, 70, 56)]
SOIL = [(138, 104, 140), (112, 80, 122), (90, 62, 106), (68, 46, 88), (46, 32, 68)]
# emissive (stay lit at night): kept distinct from every non-glowing colour above
GLOW = [(255, 238, 252), (255, 178, 234), (238, 118, 210), (186, 78, 182)]
CYAN = [(232, 252, 255), (150, 226, 255), (96, 170, 240)]
STAR = [(255, 250, 220), (255, 226, 132), (214, 190, 255)]
PETAL = [(250, 246, 255), (214, 206, 250)]
OUT = VIOLET[4]


def _has(facing, side):
    return facing is not None and side in facing


def _a(c):
    return c + (255,)


# ---------------------------------------------------------------- ground (fill) + border
# violet moss over pale stone dust (mid-dark so marble, mosaic and the gym's white pop on it)
MOSS = [(178, 160, 210), (148, 128, 186), (124, 104, 164), (104, 86, 146), (84, 68, 124)]
FLECK = (236, 226, 255)                    # tiny star fleck: stays lit at night
# per variant: (dust specks, moss specks, star flecks); variant 3 is almost plain
_SPECKS = [
    ([(3, 4), (12, 11)], [(9, 2), (5, 13)], [(13, 5)]),
    ([(10, 6)], [(2, 9), (13, 14)], []),
    ([(6, 12)], [(11, 3)], [(2, 2)]),
    ([], [(7, 8)], []),
]


def ground_px(x, y, v=0):
    """Smooth violet moss: calm base, a few soft irregular dust/moss specks and a rare star
    fleck. 16 px exact-repeat, 4 variants (variant 3 almost plain) so big areas read as one."""
    x, y = x % 16, y % 16
    dust, moss, stars = _SPECKS[v % 4]
    for sx, sy in stars:
        if (x, y) == (sx, sy):
            return FLECK
    for sx, sy in dust:                     # pale dust: 3-px lazy diagonal, lit pixel on top
        if (x, y) == (sx, sy):
            return MOSS[0]
        if (x, y) in ((sx + 1, sy), (sx - 1, sy + 1)):
            return MOSS[1]
    for sx, sy in moss:                     # darker moss tuft
        if (x, y) in ((sx, sy), (sx + 1, sy)):
            return MOSS[3]
        if (x, y) == (sx + 1, sy - 1):
            return MOSS[1]
    return MOSS[2]


STONE_V = [(226, 214, 246), (192, 176, 230), (156, 136, 204), (118, 98, 170), (80, 62, 130)]
BORDER_OUT = (44, 30, 80)


def _stone_top(x, y):
    """Top of the stone wall seen from above: offset rows of rounded 8 px stones lit top-left,
    with sparse glowing crystal tips between them."""
    row = y // 8
    u = (x + (4 if row % 2 else 0)) % 8
    v = y % 8
    k = (h16((x + (4 if row % 2 else 0)) // 8, row, 77)) % 7
    if k == 0 and (u, v) in ((3, 2), (3, 3), (4, 3), (3, 4), (4, 4)):
        return {(3, 2): CYAN[0], (3, 3): CYAN[1], (4, 3): CYAN[2], (3, 4): CYAN[2], (4, 4): CYAN[2]}[(u, v)]
    if k == 3 and (u, v) in ((4, 2), (4, 3), (5, 3), (4, 4), (5, 4)):
        return {(4, 2): GLOW[0], (4, 3): GLOW[1], (5, 3): GLOW[2], (4, 4): GLOW[2], (5, 4): GLOW[2]}[(u, v)]
    nx, ny = (u + 0.5 - 4) / 4, (v + 0.5 - 4) / 4
    r = math.hypot(nx, ny)
    if r > 1.0:
        return STONE_V[4]
    if r > 0.86:
        return STONE_V[3]
    l = -nx * 0.65 - ny * 0.75
    return STONE_V[0] if l > 0.6 else STONE_V[1] if l > 0.0 else STONE_V[2] if l > -0.55 else STONE_V[3]


def border(d, facing, x, y, f, m):
    """Raised wall of lavender standing stones (map frame): dark outline, a cut south face of
    upright slabs with glowing rune notches, rounded stone tops with crystal tips."""
    if d < 0:
        return MOSS[4] if _has(facing, "S") and d > -2 else ground_px(x, y)
    if d < 1:
        return BORDER_OUT
    if _has(facing, "S") and d < 7:
        if d >= 6:
            return STONE_V[1]                       # lit lip along the top of the face
        if d < 2:
            return STONE_V[4]
        u = x % 8
        if u == 0:
            return BORDER_OUT if d < 5 else STONE_V[4]
        if u == 1:
            return STONE_V[2]
        if u == 4 and 3 <= d < 4 and (x // 8) % 2 == 0:
            return GLOW[2]                          # rune notch
        return STONE_V[3]
    if (_has(facing, "E") or _has(facing, "W")) and d < 2:
        return STONE_V[3]
    if _has(facing, "N") and d < 2:
        return STONE_V[0]
    return _stone_top(x, y)


# ---------------------------------------------------------------- terrain
def _marble_px(x, y):
    """8 px marble slabs; gold diamond inlay where slabs meet (alternating with plum studs)."""
    for (cx, cy, gold) in ((7.5, 7.5, True), (15.5, 15.5, False), (-0.5, -0.5, False),
                           (15.5, -0.5, False), (-0.5, 15.5, False)):
        r = abs(x - cx) + abs(y - cy)
        if gold and r <= 2:
            return GOLD[0] if r <= 1 and x < 8 and y < 8 else GOLD[1] if r <= 1 else GOLD[2]
        if not gold and r <= 1:
            return PLUM[2]
    xx, yy = x % 8, y % 8
    if xx == 7 or yy == 7:
        return MARBLE[4] if (xx == 7 and yy == 7) else MARBLE[3]
    if xx == 0 or yy == 0:
        return MARBLE[1]
    if (x, y) in ((2, 3), (3, 4), (4, 4), (10, 12), (11, 12), (12, 13), (12, 2), (13, 3), (4, 10)):
        return MARBLE[3]                      # fixed vein flecks
    return MARBLE[2]


def marble_plaza(d, facing, x, y, f, m):
    """Lavender marble slabs with gold inlay, framed by a gold kerb and a violet outline."""
    if d < -1:
        return ground_px(x, y)
    if d < 0:
        return MOSS[4]
    if d < 1:
        return OUT
    if d < 2:
        return GOLD[1] if (_has(facing, "N") or _has(facing, "W")) else GOLD[3]
    if d < 3 and _has(facing, "S"):
        return GOLD[2]
    return _marble_px(x, y)


STARS = [((3, 4), 0), ((11, 3), 1), ((7, 11), 2), ((13, 12), 0)]
DOTS = [((8, 6), 1), ((1, 12), 2), ((14, 8), 0), ((5, 1), 2)]


def star_mosaic(d, facing, x, y, f, m):
    """Night-sky mosaic: indigo tesserae with 4-point stars and dots that twinkle (3 frames),
    ringed by a gold band. Use for constellation rounds or a runner; stars stay lit at night."""
    if d < -1:
        return ground_px(x, y)
    if d < 0:
        return MOSS[4]
    if d < 1:
        return OUT
    if d < 2:
        return GOLD[1] if (_has(facing, "N") or _has(facing, "W")) else GOLD[3]
    if d < 3:
        return DECK[4]
    for (sx, sy), ph in STARS:
        lit = (ph + f) % 3
        if (x, y) == (sx, sy):
            return STAR[0] if lit else STAR[1]
        if abs(x - sx) + abs(y - sy) == 1:
            return STAR[1] if lit == 1 else STAR[2] if lit == 2 else DECK[1]
        if lit == 1 and abs(x - sx) + abs(y - sy) == 2 and (x == sx or y == sy):
            return STAR[2]
    for (sx, sy), ph in DOTS:
        if (x, y) == (sx, sy):
            return CYAN[1] if (ph + f) % 3 != 2 else DECK[0]
    xx, yy = x % 4, y % 4                       # small square tesserae
    if xx == 3 or yy == 3:
        return DECK[3]
    return DECK[2] if (x // 4 + y // 4) % 3 else DECK[1]


FLOWERS = [(3, 3), (11, 3), (7, 11), (15, 11)]
LEAFV = [(150, 196, 206), (104, 156, 184), (74, 116, 158), (54, 84, 130), (36, 56, 98)]   # moonleaf (blue-teal)
# one leafy rosette per 8x8 quarter (o outline, L light, M mid, D dark)
ROSETTE = ["........",
           "..oo.oo.",
           ".oLLoLMo",
           "oLLMMMDo",
           "oLMMMDDo",
           ".oMDDDo.",
           "..oooo..",
           "........"]
SHARDS = [(9, 1), (1, 8), (14, 9)]


def moon_garden(d, facing, x, y, f, m):
    """Raised moonflower bed: marble kerb, dark plum soil, pale moonflowers with glowing hearts
    and cyan crystal-sand glints (hearts and glints stay lit at night)."""
    if d < -1:
        return ground_px(x, y)
    if d < 0:
        return MOSS[4]
    if d < 1:
        return OUT
    if d < 2:
        return MARBLE[1] if (_has(facing, "N") or _has(facing, "W")) else MARBLE[3]
    if d < 3:
        return MARBLE[3] if _has(facing, "S") else SOIL[4]
    for fx, fy in FLOWERS:
        dx, dy = (x - fx + 8) % 16 - 8, y - fy
        if (dx, dy) == (0, 0):
            return GLOW[1]
        if abs(dx) + abs(dy) == 1:
            return PETAL[0] if dx <= 0 and dy <= 0 else PETAL[1]
        if (dx, dy) == (1, 1):
            return LEAFV[3]
    for sx, sy in SHARDS:
        if (x, y) == (sx, sy):
            return CYAN[0]
        if (x, y) == (sx, sy + 1):
            return CYAN[2]
    u, v = (x + 4 * ((y // 8) % 2)) % 8, y % 8
    ch = ROSETTE[v][u]
    if ch != ".":
        return {"o": LEAFV[4], "L": LEAFV[1], "M": LEAFV[2], "D": LEAFV[3]}[ch]
    if (x + 2 * y) % 5 == 0 and (x // 4 + y // 4) % 2:
        return SOIL[1]
    if (x * 3 + y) % 11 == 0:
        return SOIL[3]
    return SOIL[2]


TERRAIN = {
    "psychic-ground": dict(kind="fill", behaviour="NORMAL", emissive=[FLECK],
                           variants=[(lambda x, y, v=v: ground_px(x, y, v)) for v in range(4)]),
    "psychic-border": dict(kind="blob", behaviour="NORMAL", paint=border,
                           emissive=[CYAN[0], CYAN[1], GLOW[0], GLOW[1], GLOW[2]],
                           sdf=dict(margin=1.0, radius=4, wobble=0.8, freq=2)),
    "psychic-marble-plaza": dict(kind="blob", behaviour="NORMAL", paint=marble_plaza,
                                 sdf=dict(margin=2, radius=2, wobble=0.0, freq=1)),
    "psychic-star-mosaic": dict(kind="blob", behaviour="NORMAL", paint=star_mosaic, frames=3,
                                emissive=STAR + [CYAN[1]],
                                sdf=dict(margin=2, radius=4, wobble=0.0, freq=1)),
    "psychic-moon-garden": dict(kind="blob", behaviour="NORMAL", paint=moon_garden,
                                emissive=[GLOW[1], CYAN[0], CYAN[2]],
                                sdf=dict(margin=2, radius=3, wobble=0.5, freq=1)),
}


# ---------------------------------------------------------------- props
def _canvas(w, h):
    return Image.new("RGBA", (w * 16, h * 16), (0, 0, 0, 0))


def _orb(im, cx, cy, r, ramp, rim):
    """Shaded glowing sphere: rim outline, 3 tones lit from the top-left, white glint."""
    p = im.load()
    for y in range(int(cy - r) - 1, int(cy + r) + 2):
        for x in range(int(cx - r) - 1, int(cx + r) + 2):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            q = math.hypot(dx, dy)
            if q > r or not (0 <= x < im.width and 0 <= y < im.height):
                continue
            if q > r - 1:
                p[x, y] = _a(rim)
                continue
            l = -(dx * 0.65 + dy * 0.75) / r
            p[x, y] = _a(ramp[1] if l > 0.25 else ramp[2] if l > -0.35 else ramp[3])
    p[int(cx - r * 0.45), int(cy - r * 0.45)] = _a(ramp[0])


def _pedestal(d, x0, x1, top, bottom):
    """Slim fluted marble shaft with gold cap and a stepped plinth."""
    d.rectangle([x0, top, x1, bottom], fill=_a(MARBLE[1]), outline=_a(MARBLE[4]))
    d.line([x0 + 1, top + 1, x0 + 1, bottom - 1], fill=_a(MARBLE[0]))
    d.line([x1 - 1, top + 1, x1 - 1, bottom - 1], fill=_a(MARBLE[3]))
    d.rectangle([x0 - 2, top - 2, x1 + 2, top], fill=_a(GOLD[1]), outline=_a(GOLD[4]))
    d.rectangle([x0 - 2, bottom, x1 + 2, bottom + 3], fill=_a(MARBLE[2]), outline=_a(MARBLE[4]))
    d.line([x0 - 1, bottom + 1, x1 + 1, bottom + 1], fill=_a(MARBLE[0]))


def orb_pedestal():
    """Pink psychic orb hovering over a slim pedestal; bobs 0,1,2,1 px."""
    frames = []
    for k in range(3):
        im = _canvas(1, 2)
        d = ImageDraw.Draw(im)
        contact_shade(im, 3, 13, 30, alpha=90)
        _pedestal(d, 6, 9, 19, 26)
        cy = 10.5 - k
        d.line([5, 16 - (0 if k else 0), 10, 16], fill=_a(GLOW[3]))     # hovering shimmer bar
        _orb(im, 8, cy, 5, GLOW, PLUM[4])
        frames.append(im)
    return frames


def obelisk():
    """Tapered marble obelisk, gold pyramidion, glowing cyan channel down its face."""
    im = _canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 14, 30, alpha=90)
    d.rectangle([2, 26, 13, 29], fill=_a(MARBLE[2]), outline=_a(MARBLE[4]))
    d.line([3, 27, 12, 27], fill=_a(MARBLE[0]))
    d.polygon([(5, 6), (10, 6), (11, 26), (4, 26)], fill=_a(MARBLE[1]), outline=_a(MARBLE[4]))
    d.line([5, 7, 5, 25], fill=_a(MARBLE[0]))
    d.line([9, 7, 10, 25], fill=_a(MARBLE[3]))
    d.polygon([(7, 0), (8, 0), (10, 5), (5, 5)], fill=_a(GOLD[1]), outline=_a(GOLD[4]))
    d.line([7, 1, 6, 4], fill=_a(GOLD[0]))
    d.line([7, 9, 7, 23], fill=_a(CYAN[1]))
    d.line([8, 9, 8, 23], fill=_a(CYAN[2]))
    for y in (12, 18):
        im.putpixel((7, y), _a(CYAN[0]))
    im.putpixel((7, 8), _a(GLOW[1]))               # small eye-star at the top of the channel
    im.putpixel((8, 8), _a(GLOW[1]))
    return [im]


def crystal_cluster():
    """Three faceted shards (magenta, cyan, violet) from a marble-chip base."""
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 14, 14, alpha=100)
    shards = [((2, 13), (4, 6), (7, 13), CYAN, (54, 96, 168)),
              ((10, 13), (12, 5), (14, 13), PLUM, PLUM[4]),
              ((5, 13), (8, 1), (11, 13), GLOW, PLUM[4])]
    for (a, tip, b, ramp, rim) in shards:
        d.polygon([a, tip, b], fill=_a(ramp[2]), outline=_a(rim))
        mid = ((a[0] + b[0]) // 2, 12)
        d.line([tip[0], tip[1] + 2, mid[0] - 1, mid[1]], fill=_a(ramp[1]))
        d.line([tip[0] + 1, tip[1] + 3, mid[0] + 1, mid[1]], fill=_a(ramp[-1] if ramp is CYAN else ramp[3]))
        im.putpixel((tip[0], tip[1] + 1), _a(ramp[0]))
    d.line([3, 13, 13, 13], fill=_a(MARBLE[3]))
    d.line([4, 14, 12, 14], fill=_a(MARBLE[4]))
    return [im]


def telescope():
    """Brass star-gazing telescope on a violet tripod, tilted to the north-east sky."""
    im = _canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 1, 15, 30, alpha=90)
    for (x0, x1) in ((8, 2), (8, 13), (8, 8)):
        d.line([x0, 18, x1, 29], fill=_a(DECK[3]))
    d.line([8, 18, 3, 29], fill=_a(DECK[1]))
    d.line([8, 18, 8, 29], fill=_a(DECK[2]))
    d.rectangle([6, 16, 10, 18], fill=_a(GOLD[2]), outline=_a(GOLD[4]))
    # tube: thick diagonal from lower-left eyepiece to the upper-right objective
    tube = [(2, 18), (13, 5), (15, 8), (5, 20)]
    d.polygon(tube, fill=_a(GOLD[2]), outline=_a(GOLD[4]))
    d.line([3, 18, 13, 6], fill=_a(GOLD[0]))
    d.line([4, 19, 14, 7], fill=_a(GOLD[1]))
    d.line([6, 15, 8, 17], fill=_a(VIOLET[2]))          # band
    d.line([9, 11, 11, 13], fill=_a(VIOLET[2]))
    d.polygon([(12, 4), (14, 2), (15, 3), (15, 8), (14, 8)], fill=_a(VIOLET[3]), outline=_a(OUT))
    im.putpixel((14, 4), _a(CYAN[1]))                   # lens glint
    d.rectangle([1, 18, 3, 21], fill=_a(DECK[2]), outline=_a(OUT))   # eyepiece
    return [im]


def moon_gate():
    """Circular violet moon-gate (4 cells wide, walk-through middle 2 cells) on marble plinths,
    with a gold inlay ring, a gold crescent keystone and a glowing pink inner rim."""
    im = _canvas(4, 3)
    p = im.load()
    cx, cy, ro, ri = 32, 27, 26, 18
    for y in range(41):
        for x in range(64):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            q = math.hypot(dx, dy)
            if ri <= q <= ro:
                if q > ro - 1:
                    col = OUT
                elif q < ri + 1:
                    col = GLOW[2] if dy < 0 else VIOLET[4]
                elif q < ri + 2 and dy < 0:
                    col = GLOW[3]
                else:
                    l = -(dx * 0.65 + dy * 0.75) / q
                    col = VIOLET[0] if l > 0.6 else VIOLET[1] if l > 0.1 else VIOLET[2] if l > -0.5 else VIOLET[3]
                    if abs(q - (ri + ro) / 2 - 0.5) < 0.6:
                        col = GOLD[1] if l > 0 else GOLD[2]
                p[x, y] = _a(col)
    d = ImageDraw.Draw(im)
    for x0 in (6, 45):                              # marble plinths under each leg
        d.rectangle([x0, 38, x0 + 12, 45], fill=_a(MARBLE[2]), outline=_a(MARBLE[4]))
        d.line([x0 + 1, 39, x0 + 11, 39], fill=_a(MARBLE[0]))
        d.line([x0 + 1, 43, x0 + 11, 43], fill=_a(MARBLE[3]))
        contact_shade(im, x0, x0 + 13, 46, alpha=90)
    # crescent keystone
    d.ellipse([26, -1, 38, 11], fill=_a(GOLD[1]), outline=_a(GOLD[4]))
    d.ellipse([30, -2, 40, 8], fill=_a(VIOLET[1]))
    for x, y in ((27, 4), (27, 5), (28, 7)):
        p[x, y] = _a(GOLD[0])
    d.ellipse([33, 2, 37, 6], fill=_a(GLOW[1]), outline=_a(GLOW[3]))
    p[34, 3] = _a(GLOW[0])
    return [im]


def star_lamp():
    """Slim violet post with gold rings, crowned by a four-point star lantern; violet glow."""
    im = _canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 4, 12, 30, alpha=90)
    d.rectangle([4, 27, 11, 29], fill=_a(VIOLET[2]), outline=_a(OUT))
    d.line([5, 27, 10, 27], fill=_a(VIOLET[0]))
    d.rectangle([7, 12, 8, 27], fill=_a(VIOLET[2]))
    d.line([7, 12, 7, 26], fill=_a(VIOLET[0]))
    d.line([6, 12, 6, 26], fill=_a(OUT))
    d.line([9, 12, 9, 26], fill=_a(OUT))
    for y in (13, 20):
        d.line([5, y, 10, y], fill=_a(GOLD[1]))
        d.line([5, y + 1, 10, y + 1], fill=_a(GOLD[3]))
    # four-point star lantern
    d.polygon([(8, 0), (10, 4), (15, 6), (10, 8), (8, 12), (6, 8), (1, 6), (6, 4)],
              fill=_a(STAR[1]), outline=_a(GOLD[3]))
    d.polygon([(8, 3), (9, 5), (11, 6), (9, 7), (8, 9), (7, 7), (5, 6), (7, 5)], fill=_a(STAR[0]))
    im.putpixel((8, 6), _a(GLOW[0]))
    return [im]


def standing_stone():
    """Lavender menhir on a moss tuft with a glowing eye-star rune carved in its face."""
    im = _canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 14, 30, alpha=90)
    d.polygon([(4, 29), (3, 12), (5, 5), (8, 3), (11, 5), (12, 12), (12, 29)],
              fill=_a(STONE_V[2]), outline=_a(BORDER_OUT))
    d.line([4, 12, 5, 6], fill=_a(STONE_V[0]))
    d.line([5, 6, 8, 4], fill=_a(STONE_V[0]))
    d.line([4, 13, 4, 28], fill=_a(STONE_V[1]))
    d.line([5, 7, 5, 28], fill=_a(STONE_V[1]))
    d.line([11, 8, 11, 28], fill=_a(STONE_V[3]))
    d.line([5, 26, 11, 26], fill=_a(STONE_V[3]))
    for (x, y) in ((8, 12), (8, 13), (7, 14), (9, 14), (8, 15), (8, 16), (6, 14), (10, 14)):
        im.putpixel((x, y), _a(GLOW[2]))
    im.putpixel((8, 14), _a(GLOW[0]))
    d.line([3, 29, 13, 29], fill=_a(MOSS[3]))
    d.line([2, 30, 6, 30], fill=_a(MOSS[4]))
    d.line([10, 30, 14, 30], fill=_a(MOSS[4]))
    return [im]


PROPS = {
    "psychic-orb-pedestal": dict(cells=(1, 2), paint=orb_pedestal, emissive=GLOW, order=[0, 1, 2, 1],
                                 lamp=(238, 118, 210)),
    "psychic-obelisk": dict(cells=(1, 2), paint=obelisk, emissive=CYAN + [GLOW[1]]),
    "psychic-crystal": dict(cells=(1, 1), paint=crystal_cluster, emissive=CYAN + GLOW),
    "psychic-telescope": dict(cells=(1, 2), paint=telescope, emissive=[CYAN[1]]),
    "psychic-moon-gate": dict(cells=(4, 3), paint=moon_gate, emissive=GLOW),
    "psychic-standing-stone": dict(cells=(1, 2), paint=standing_stone, emissive=[GLOW[0], GLOW[2]]),
    "psychic-star-lamp": dict(cells=(1, 2), paint=star_lamp, emissive=STAR + [GLOW[0]], lamp=(186, 140, 255)),
}

# ---------------------------------------------------------------- review scene around the gym
GYM = dict(
    structure_at=(8, 4),          # top-left cell of the gym's 8x8-metatile structure canvas (door at cols 11-12)
    ground="psychic-ground",
    scene=[
        "#######..........#######",
        "##....................##",
        "#..gg..............gg..#",
        "#.gggg............gggg.#",
        "#.gggg............gggg.#",
        "#..gg..............gg..#",
        "#......................#",
        "#.***..............***.#",
        "#.***..............***.#",
        "#.***..............***.#",
        "#......................#",
        "#....mmmmmmmmmmmmmm....#",
        "#....mmmmmmmmmmmmmm....#",
        "#.........mmmm.........#",
        "##........mmmm........##",
        "#..ggg....mmmm....ggg..#",
        "##.ggg....mmmm....ggg.##",
        "##########mmmm##########",
    ],
    chars={"#": "psychic-border", "m": "psychic-marble-plaza", "*": "psychic-star-mosaic",
           "g": "psychic-moon-garden"},
    props=[("psychic-star-lamp", 5, 10), ("psychic-star-lamp", 18, 10),
           ("psychic-orb-pedestal", 3, 8), ("psychic-orb-pedestal", 20, 8),
           ("psychic-obelisk", 9, 14), ("psychic-obelisk", 14, 14),
           ("psychic-moon-gate", 10, 16),
           ("psychic-crystal", 2, 3), ("psychic-crystal", 21, 5), ("psychic-crystal", 6, 13),
           ("psychic-crystal", 17, 13), ("psychic-crystal", 4, 16), ("psychic-crystal", 19, 15),
           ("psychic-telescope", 5, 6), ("psychic-telescope", 18, 6),
           ("psychic-standing-stone", 2, 13), ("psychic-standing-stone", 21, 13),
           ("psychic-standing-stone", 7, 16), ("psychic-standing-stone", 16, 16),
           ("psychic-star-lamp", 1, 11), ("psychic-star-lamp", 22, 11),
           ("sign", 8, 16)],
)


# ---------------------------------------------------------------- biome foliage (soft theme recolours)
from biome import biome_pieces  # noqa: E402

_BT, _BP = biome_pieces("psychic")
TERRAIN.update(_BT)
PROPS.update(_BP)
