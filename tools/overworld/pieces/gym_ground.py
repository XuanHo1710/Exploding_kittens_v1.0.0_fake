"""Ground gym (Canyon Pueblo) surroundings: cracked adobe earth, terracotta flagstones, swirling
quicksand pits, saguaro cacti, carved totems with fire bowls, strata boulders, tumbleweeds, clay pots
and a timber water trough. Palette pulled from the gym's own sheet (sandstone plaster, terracotta,
timber vigas, mesa rock, turquoise, scrub green) so pieces sit next to it without clashing.
Slugs are prefixed `ground-`. GYM describes the review scene (review-gym-ground.png).

`ground-ground` is the desert-sand base the whole gym scene stands on (never the generic lawn) and
`ground-border` is the raised sandstone mesa that frames it. Blob terrains still carry a grass rim
outside the edge (d < 0) for use on ordinary maps; in the gym scene they are laid as overlays."""
import math

from PIL import Image, ImageDraw

from overworld_kit import GRASS, contact_shade, draw_blobs, grass_px, h16

TAU = 2 * math.pi
# 5-tone ramps, light -> deep (sampled from assets/structures/Battle/gym-ground, a touch darker for the ground)
EARTH = [(232, 192, 136), (210, 162, 110), (184, 132, 90), (144, 96, 72), (98, 64, 58)]
TERRA = [(242, 152, 98), (220, 116, 72), (186, 86, 58), (142, 60, 52), (98, 42, 46)]
PLASTER = [(248, 222, 176), (232, 198, 148), (210, 170, 122), (170, 128, 100), (122, 88, 80)]
TIMBER = [(206, 156, 104), (172, 120, 78), (138, 92, 62), (100, 64, 52), (70, 46, 44)]
ROCK = [(238, 188, 132), (216, 156, 104), (186, 124, 84), (146, 92, 70), (102, 64, 58)]
CREAM = [(250, 232, 196), (236, 212, 168), (214, 184, 140), (176, 144, 112), (128, 100, 88)]
TURQ = [(150, 230, 212), (90, 196, 186), (56, 152, 160), (44, 106, 128), (36, 72, 96)]
SCRUB = [(176, 206, 112), (130, 172, 84), (92, 136, 72), (64, 100, 64), (44, 70, 56)]
QSAND = [(238, 206, 150), (220, 180, 124), (196, 150, 100), (160, 114, 80), (116, 80, 64)]
EMBER = [(255, 246, 190), (255, 214, 110), (250, 166, 60), (214, 110, 44), (160, 70, 40)]
SAND = [(246, 220, 168), (234, 202, 148), (220, 184, 130), (196, 154, 106), (150, 108, 80)]
MESA_OUT = (84, 48, 46)
DRYGRASS = (150, 168, 76)
CACTUS_OUT = (34, 60, 48)


def _has(facing, side):
    return facing is not None and side in facing


def _line(pts):
    """Pixels of a polyline (Bresenham), used to bake fixed crack patterns."""
    out = set()
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x1 > x0 else -1), (1 if y1 > y0 else -1)
        err = dx + dy
        while True:
            out.add((x0 % 16, y0 % 16))
            if (x0, y0) == (x1, y1):
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy
    return out


# ---------------------------------------------------------------- terrain
# Short crack network kept inside the tile (no line runs edge to edge, so no tile grid shows).
CRACKS = (_line([(2, 6), (4, 7), (7, 5), (10, 6)])
          | _line([(7, 5), (8, 9), (6, 12)]) | _line([(12, 12), (15, 14)]) | _line([(10, 6), (12, 9)]))
PEBBLES = ((2, 2), (13, 1), (9, 13), (2, 8), (14, 9))


def _earth_px(x, y):
    x, y = x % 16, y % 16
    if (x, y) in CRACKS:
        return EARTH[3]
    if (x, (y - 1) % 16) in CRACKS:
        return EARTH[0]                        # lit lip on the south side of a crack
    for px, py in PEBBLES:
        if (x, y) == (px, py):
            return CREAM[1]
        if (x, y) == (px + 1, py + 1):
            return EARTH[3]
    if h16(x, y, 81) < 22:
        return EARTH[2]                        # sparse soft speckle
    return EARTH[1]


def dry_earth(d, facing, x, y, f, m):
    """Cracked sun-baked adobe ground; ragged edge into grass through a rim of dry scrub."""
    if d < -1:
        return grass_px(x, y)
    if d < 0:
        return DRYGRASS
    if d < 1:
        return EARTH[4]
    if d < 2:
        return EARTH[0] if (_has(facing, "N") or _has(facing, "W")) else EARTH[3]
    return _earth_px(x, y)


def flagstone(d, facing, x, y, f, m):
    """Terracotta flagstone plaza: running-bond slabs, pale sandstone grout, turquoise inlay
    diamonds; a short south face where the plaza steps down to the grass."""
    if d < -1:
        return grass_px(x, y)
    if d < 0:
        return GRASS[3]
    if d < 1:
        return TERRA[4]
    if _has(facing, "S") and d < 3:
        return TERRA[3] if d < 2 else TERRA[2]
    if d < 2:
        return TERRA[0] if (_has(facing, "N") or _has(facing, "W")) else TERRA[3]
    xx = (x + (4 if (y // 8) % 2 else 0)) % 8
    yy = y % 8
    if xx == 7 or yy == 7:
        return PLASTER[2]                      # grout
    if xx == 0 or yy == 0:
        return TERRA[0]                        # lit top-left bevel
    if xx == 6 or yy == 6:
        return TERRA[2]
    if x // 8 == 0 and y // 8 == 0 and abs(xx - 3) + abs(yy - 3) <= 1:
        return TURQ[1] if (xx, yy) != (3, 2) else TURQ[0]
    return TERRA[1] if (xx * 3 + yy * 5) % 11 else TERRA[2]


def quicksand(d, facing, x, y, f, m):
    """Sunken quicksand pit, 4 frames: earth rim with a short north wall, slow sinking swirls."""
    if d < -1.5:
        return grass_px(x, y)
    if d < -0.5:
        return DRYGRASS
    if d < 0:
        return EARTH[4]
    if d < 1.5:                                # cracked earth lip around the pit
        return EARTH[0] if (_has(facing, "N") or _has(facing, "W")) else EARTH[2]
    if d < 2.5:
        return EARTH[4]
    d -= 1.5
    if _has(facing, "N") and d < 4:
        return EARTH[3] if d < 2.5 else QSAND[4]
    if d < 2:
        return QSAND[3]
    if d < 3:
        return QSAND[2] if (x + y + f) % 3 else QSAND[3]
    a = TAU / 16                               # slow churning swirls, sinking toward dark eddies
    v = (math.sin(a * (x + 2 * f) + 1.6 * math.sin(a * (y - 2 * f)))
         + 0.7 * math.cos(2 * a * y + 0.9 * math.sin(a * x) - f * TAU / 4))
    return (QSAND[0] if v > 1.15 else QSAND[1] if v > 0.3 else QSAND[2] if v > -0.7
            else QSAND[3] if v > -1.3 else QSAND[4])


# ---------------------------------------------------------------- desert sand base (fill)
def _wave(x, x0, x1, y0, amp=1.0, ph=0.0):
    """Row of a short wind ripple at column x (None outside x0..x1)."""
    if not (x0 <= x <= x1):
        return None
    return y0 + int(round(amp * math.sin((x - x0) * TAU / 12 + ph)))


def _sand_base(x, y, seed, dens=10):
    x, y = x % 16, y % 16
    n = h16(x, y, seed)
    if n < dens:
        return SAND[2]                         # sparse soft darker grains
    if n > 255 - dens // 2:
        return SAND[0]                         # rare bright grains
    return SAND[1]


def sand_plain(x, y):
    return _sand_base(x, y, 71, 6)


def sand_ripples(x, y):
    x, y = x % 16, y % 16
    for x0, x1, y0, ph in ((1, 9, 4, 0.0), (7, 14, 11, 1.7)):
        w = _wave(x, x0, x1, y0, 0.8, ph)
        if w is None:
            continue
        if y == w:
            return SAND[2]
        if y == w - 1:
            return SAND[0]
    return _sand_base(x, y, 72, 5)


def sand_pebbles(x, y):
    x, y = x % 16, y % 16
    for px, py, big in ((4, 5, True), (12, 12, False), (13, 3, False)):
        if (x, y) == (px, py):
            return CREAM[1]
        if big and (x, y) == (px + 1, py):
            return CREAM[2]
        if (x, y) == (px + (2 if big else 1), py + 1) or (big and (x, y) == (px + 1, py + 1)):
            return SAND[3]
    return _sand_base(x, y, 73, 8)


SAND_CRACK = _line([(3, 9), (6, 10), (8, 9), (10, 11)]) | _line([(6, 10), (7, 13)])


def sand_cracks(x, y):
    x, y = x % 16, y % 16
    if (x, y) in SAND_CRACK:
        return SAND[3]
    if (x, (y - 1) % 16) in SAND_CRACK:
        return SAND[0]
    return _sand_base(x, y, 74, 7)


# ---------------------------------------------------------------- sandstone mesa wall (raised border)
STRATA = [ROCK[1], ROCK[2], TERRA[2], TERRA[3], ROCK[2], CREAM[2], ROCK[2], ROCK[3], TERRA[3], ROCK[3]]
FACE_TOP = 5                                   # face rows y >= FACE_TOP in a tile with no wall below


def _mesa_top(x, y):
    x, y = x % 16, y % 16
    n = h16(x, y, 77)
    if n < 7:
        return ROCK[2]
    if n > 250:
        return ROCK[0]
    if (x, y) in MESA_CRACK:
        return ROCK[3]
    if (x, (y - 1) % 16) in MESA_CRACK:
        return ROCK[0]
    return ROCK[1]


MESA_CRACK = _line([(3, 4), (5, 5)]) | _line([(11, 12), (12, 13)])


def mesa(d, facing, x, y, f, m):
    """Raised sandstone canyon wall: lit flat top, dark outline, tall south face banded with
    horizontal strata (bands follow the tile row, so they run unbroken along the wall)."""
    if d < 0:
        if _has(facing, "S") and d > -2:
            return SAND[3]                     # contact shade (standalone sheet only)
        return sand_plain(x, y)
    if d < 1:
        return MESA_OUT
    if not (m & 16) and y >= FACE_TOP - 1:     # no wall to the south: the cliff face
        if y == FACE_TOP - 1:
            return MESA_OUT if (_has(facing, "E") and d < 2) else ROCK[0]   # lit cap-rock lip
        if _has(facing, "S") and d < 2:
            return ROCK[4]                     # foot of the face
        band = STRATA[y - FACE_TOP]
        if (_has(facing, "E")) and d < 3:
            band = mix_c(band, ROCK[4])        # face turns away on the east
        elif (_has(facing, "W")) and d < 3:
            band = mix_c(band, ROCK[0])
        if x in (3, 12) and y > FACE_TOP + (2 if x == 3 else 4) or (x == 8 and y < FACE_TOP + 4):
            return ROCK[4]                     # irregular vertical fissures
        if h16(x, y, 79) < 18:
            return mix_c(band, CREAM[1])
        return band
    if (_has(facing, "E") or _has(facing, "W")) and d < 3:
        if _has(facing, "W"):
            return ROCK[0] if d < 2 else ROCK[1]
        return ROCK[3] if d < 2 else ROCK[2]
    if _has(facing, "N") and d < 2:
        return ROCK[0]
    return _mesa_top(x, y)


def mix_c(a, b):
    return tuple((a[i] + b[i]) // 2 for i in range(3))


TERRAIN = {
    "ground-ground": dict(kind="fill", behaviour="NORMAL",
                          variants=[sand_plain, sand_ripples, sand_pebbles, sand_cracks]),
    "ground-border": dict(kind="blob", behaviour="NORMAL", paint=mesa,
                          sdf=dict(margin=1.0, radius=4, wobble=0.6, freq=2)),
    "ground-dry-earth": dict(kind="blob", behaviour="NORMAL", paint=dry_earth,
                             sdf=dict(margin=2.5, radius=4, wobble=1.2, freq=2)),
    "ground-flagstone": dict(kind="blob", behaviour="NORMAL", paint=flagstone,
                             sdf=dict(margin=2, radius=2, wobble=0.0, freq=1)),
    "ground-quicksand": dict(kind="blob", behaviour="SAND", paint=quicksand, frames=4, overlay_cut=-0.5,
                             sdf=dict(margin=3, radius=4, wobble=0.8, freq=1)),
}


# ---------------------------------------------------------------- props
def _canvas(w, h):
    return Image.new("RGBA", (w * 16, h * 16), (0, 0, 0, 0))


def _a(c):
    return c + (255,)


def saguaro():
    im = _canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 3, 13, 30, alpha=90)
    out = _a(CACTUS_OUT)

    def column(x0, x1, y0, y1):
        d.rounded_rectangle([x0, y0, x1, y1], radius=(x1 - x0) // 2, fill=_a(SCRUB[2]), outline=out)
        d.line([x0 + 1, y0 + 2, x0 + 1, y1 - 1], fill=_a(SCRUB[0]))
        if x1 - x0 >= 4:
            d.line([x0 + 2, y0 + 1, x0 + 2, y1 - 1], fill=_a(SCRUB[1]))
        d.line([x1 - 1, y0 + 2, x1 - 1, y1 - 1], fill=_a(SCRUB[3]))

    column(1, 5, 9, 21)                         # left arm (upright part)
    column(10, 14, 6, 17)                       # right arm
    d.rectangle([3, 18, 7, 21], fill=_a(SCRUB[3]), outline=out)     # elbows
    d.line([4, 18, 6, 18], fill=_a(SCRUB[2]))
    d.rectangle([8, 14, 12, 17], fill=_a(SCRUB[3]), outline=out)
    d.line([9, 14, 11, 14], fill=_a(SCRUB[2]))
    column(5, 10, 1, 30)                        # trunk
    p = im.load()
    for x, y in ((7, 5), (6, 11), (8, 16), (7, 23), (3, 12), (12, 9), (8, 27)):
        p[x, y] = _a(CREAM[0])                  # spines
    p[7, 1], p[8, 1] = _a(TERRA[0]), _a(TERRA[1])     # blossom
    return [im]


def totem():
    im = _canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 3, 13, 30, alpha=90)
    # pole: bands of terracotta / turquoise / timber
    d.rectangle([4, 10, 11, 29], fill=_a(TIMBER[1]), outline=_a(TIMBER[4]))
    d.rectangle([5, 23, 10, 28], fill=_a(TERRA[2]))
    d.line([5, 23, 10, 23], fill=_a(TERRA[0]))
    d.rectangle([5, 15, 10, 21], fill=_a(TURQ[2]))
    d.line([5, 15, 10, 15], fill=_a(TURQ[0]))
    d.line([10, 16, 10, 21], fill=_a(TURQ[3]))
    for x in (6, 9):                           # carved eyes + mouth
        d.point((x, 17), fill=_a(TIMBER[4]))
    d.line([6, 20, 9, 20], fill=_a(TIMBER[4]))
    d.point((7, 25), fill=_a(TERRA[4]))
    d.point((8, 26), fill=_a(TERRA[4]))
    d.line([5, 11, 5, 28], fill=_a(TIMBER[0]))
    d.line([4, 22, 11, 22], fill=_a(TIMBER[4]))
    # wings
    d.polygon([(4, 12), (0, 11), (1, 14), (4, 14)], fill=_a(TERRA[1]), outline=_a(TERRA[4]))
    d.polygon([(11, 12), (15, 11), (14, 14), (11, 14)], fill=_a(TERRA[2]), outline=_a(TERRA[4]))
    # fire bowl
    d.rectangle([3, 8, 12, 10], fill=_a(PLASTER[2]), outline=_a(PLASTER[4]))
    d.line([4, 9, 11, 9], fill=_a(PLASTER[1]))
    d.polygon([(8, 0), (12, 8), (3, 8)], fill=_a(EMBER[2]), outline=_a(EMBER[3]))
    d.polygon([(8, 3), (10, 8), (5, 8)], fill=_a(EMBER[1]))
    d.line([7, 6, 7, 8], fill=_a(EMBER[0]))
    d.point((8, 7), fill=_a(EMBER[0]))
    return [im]


def boulder():
    im = _canvas(2, 2)
    contact_shade(im, 3, 29, 29, alpha=100)
    pts = draw_blobs(im, [(16, 16, 13, 11), (8, 20, 7, 7), (24, 19, 7, 7.5), (15, 10, 9, 6)],
                     ROCK, ROCK[4], speck=83)
    p = im.load()
    for (x, y) in pts:
        if p[x, y][:3] == ROCK[4]:
            continue
        if y >= 21 and (x, y + 1) in pts:            # short south face, banded strata
            band = (y + (x // 6) % 2) % 4
            p[x, y] = _a(TERRA[3] if band == 0 else CREAM[3] if band == 2 else ROCK[3])
        elif y in (14, 15) and (x + y) % 7:          # strata stripe across the top
            p[x, y] = _a(TERRA[2] if y == 14 else TERRA[3])
    for x, y in ((19, 8), (20, 9), (20, 10), (11, 17), (12, 18)):
        p[x, y] = _a(ROCK[3])
    return [im]


def tumbleweed():
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 14, 14, alpha=80)
    d.ellipse([1, 2, 14, 14], fill=_a(TIMBER[3]), outline=_a(TIMBER[4]))
    p = im.load()
    for y in range(3, 14):                       # tangled twigs: fixed lattice of lit / dark strands
        for x in range(2, 14):
            if p[x, y][3] and p[x, y][:3] != TIMBER[4]:
                k = (x * 2 + y * 3) % 7
                if k == 0 or (x - y) % 5 == 0:
                    p[x, y] = _a(TIMBER[0] if y < 8 else TIMBER[1])
                elif (x + y) % 4 == 1:
                    p[x, y] = _a(TIMBER[2])
                elif (x + 2 * y) % 9 == 0:
                    p[x, y] = _a(TIMBER[4])
    for x, y in ((0, 7), (15, 9), (6, 1), (11, 1)):
        p[x, y] = _a(TIMBER[2])                  # stray twigs
    p[5, 5] = _a(PLASTER[0])
    return [im]


def clay_pots():
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 1, 15, 14, alpha=90)
    # big pot
    d.ellipse([1, 4, 10, 14], fill=_a(TERRA[1]), outline=_a(TERRA[4]))
    d.ellipse([3, 7, 8, 12], fill=_a(TERRA[1]))
    d.arc([2, 5, 9, 13], 110, 250, fill=_a(TERRA[0]))
    d.arc([2, 5, 9, 13], 300, 60, fill=_a(TERRA[3]))
    d.line([2, 9, 9, 9], fill=_a(TURQ[2]))
    d.point((3, 9), fill=_a(TURQ[1]))
    d.rectangle([3, 2, 8, 4], fill=_a(TERRA[2]), outline=_a(TERRA[4]))
    d.line([4, 3, 7, 3], fill=_a(TERRA[4]))                       # mouth
    # small pot in front
    d.ellipse([8, 8, 14, 14], fill=_a(PLASTER[2]), outline=_a(PLASTER[4]))
    d.point((9, 10), fill=_a(PLASTER[0]))
    d.point((10, 9), fill=_a(PLASTER[1]))
    d.line([9, 12, 13, 12], fill=_a(TERRA[2]))
    d.rectangle([10, 7, 12, 8], fill=_a(PLASTER[3]), outline=_a(PLASTER[4]))
    return [im]


def water_trough():
    frames = []
    for k in range(3):
        im = _canvas(2, 1)
        d = ImageDraw.Draw(im)
        contact_shade(im, 1, 31, 14, alpha=90)
        d.rectangle([1, 3, 30, 13], fill=_a(TIMBER[1]), outline=_a(TIMBER[4]))
        d.line([2, 4, 29, 4], fill=_a(TIMBER[0]))                  # lit top rim
        d.rectangle([3, 5, 28, 8], fill=_a(TURQ[2]), outline=_a(TIMBER[3]))
        d.line([4, 6, 27, 6], fill=_a(TURQ[1]))
        for i in range(3):                                         # drifting glints
            x = 5 + (i * 9 + k * 3) % 22
            d.line([x, 6, x + 1, 6], fill=_a(TURQ[0]))
        d.rectangle([2, 10, 29, 12], fill=_a(TIMBER[2]))            # south face planks
        d.line([2, 10, 29, 10], fill=_a(TIMBER[3]))
        for x in (9, 16, 23):
            d.line([x, 10, x, 12], fill=_a(TIMBER[4]))
        for x in (1, 30):
            d.rectangle([x - 1 if x == 30 else x, 2, x + 1 if x == 1 else x, 13], fill=_a(TIMBER[2]),
                        outline=_a(TIMBER[4]))
        frames.append(im)
    return frames


def hoodoo():
    """Sandstone hoodoo: a striped rock spire with a pale cap stone."""
    im = _canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 14, 30, alpha=100)
    d.polygon([(4, 30), (5, 18), (6, 12), (10, 12), (11, 18), (12, 30)], fill=_a(ROCK[2]), outline=_a(MESA_OUT))
    p = im.load()
    for y in range(13, 30):
        for x in range(5, 12):
            if p[x, y][:3] == MESA_OUT or not p[x, y][3]:
                continue
            band = (y // 3) % 4
            c = [ROCK[1], TERRA[2], ROCK[2], CREAM[2]][band]
            if x <= 6 or (p[x - 1, y][:3] == MESA_OUT):
                c = ROCK[0] if band != 1 else TERRA[1]
            elif x >= 10 or (x < 15 and p[x + 1, y][:3] == MESA_OUT):
                c = ROCK[3] if band != 1 else TERRA[3]
            p[x, y] = _a(c)
    d.ellipse([2, 5, 13, 12], fill=_a(CREAM[2]), outline=_a(MESA_OUT))     # cap stone
    d.line([4, 7, 9, 7], fill=_a(CREAM[0]))
    d.line([3, 8, 4, 8], fill=_a(CREAM[1]))
    d.line([6, 11, 11, 11], fill=_a(CREAM[3]))
    d.line([11, 9, 12, 10], fill=_a(CREAM[3]))
    return [im]


def fossil():
    """Half-buried bone fossil: a pale ammonite spiral and a rib bone in the sand."""
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 1, 15, 13, alpha=60)
    d.ellipse([2, 4, 11, 13], fill=_a(CREAM[1]), outline=_a(PLASTER[4]))
    d.arc([4, 6, 10, 12], 180, 520, fill=_a(CREAM[3]))
    d.arc([5, 7, 9, 11], 0, 300, fill=_a(CREAM[3]))
    d.point((7, 9), fill=_a(PLASTER[4]))
    d.point((4, 6), fill=_a(CREAM[0]))
    d.point((5, 5), fill=_a(CREAM[0]))
    d.line([10, 12, 14, 9], fill=_a(PLASTER[4]), width=1)          # rib bone
    d.line([10, 11, 14, 8], fill=_a(CREAM[0]))
    d.point((14, 8), fill=_a(CREAM[1]))
    d.point((15, 8), fill=_a(PLASTER[4]))
    d.line([1, 13, 12, 13], fill=_a(SAND[3]))                       # sand drifted over the base
    return [im]


PROPS = {
    "ground-hoodoo": dict(cells=(1, 2), paint=hoodoo),
    "ground-fossil": dict(cells=(1, 1), paint=fossil),
    "ground-saguaro": dict(cells=(1, 2), paint=saguaro),
    "ground-totem": dict(cells=(1, 2), paint=totem, emissive=EMBER[:4], lamp=(255, 176, 90)),
    "ground-boulder": dict(cells=(2, 2), paint=boulder),
    "ground-tumbleweed": dict(cells=(1, 1), paint=tumbleweed),
    "ground-clay-pots": dict(cells=(1, 1), paint=clay_pots),
    "ground-water-trough": dict(cells=(2, 1), paint=water_trough, order=[0, 1, 2]),
}

# ---------------------------------------------------------------- review scene around the gym
GYM = dict(
    structure_at=(8, 4),          # top-left cell of the gym's 8x8-metatile structure canvas (door at cols 11-12)
    ground="ground-ground",
    scene=[
        "MMMMMM............MMMMMM",
        "MMMMM..............MMMMM",
        "MMM..................MMM",
        "M.aaaa............aaaa.M",
        "M.aaaaa..........aaaaa.M",
        "M..aaa............aaa..M",
        "M..~~~............~~~..M",
        "MM.~~~............~~~.MM",
        "MM....................MM",
        "M......................M",
        "M....bbbbbbbbbbbbbb....M",
        "M....bbbbbbbbbbbbbb....M",
        "M.aaa.....bbbb....aaa..M",
        "MMaaaa.....bb....aaaaa.M",
        "MM.aaa.....bb.....aaa.MM",
        "M..........bb...aaa...MM",
        "MMM........bb..aaaaa.MMM",
        "MMMMMMMMMM.bb.MMMMMMMMMM",
    ],
    chars={"a": "ground-dry-earth", "~": "ground-quicksand", "b": "ground-flagstone",
           "M": "ground-border"},
    props=[("ground-totem", 5, 11), ("ground-totem", 18, 11), ("ground-saguaro", 1, 10),
           ("ground-saguaro", 22, 9), ("ground-saguaro", 3, 15), ("ground-boulder", 19, 14),
           ("ground-tumbleweed", 6, 8), ("ground-tumbleweed", 4, 13), ("ground-tumbleweed", 21, 8),
           ("ground-tumbleweed", 15, 16), ("ground-clay-pots", 9, 12), ("ground-clay-pots", 14, 12),
           ("ground-water-trough", 7, 14), ("sign", 13, 15), ("ground-hoodoo", 4, 3),
           ("ground-hoodoo", 19, 3), ("ground-fossil", 9, 16), ("ground-fossil", 20, 6),
           ("ground-boulder", 2, 9), ("ground-clay-pots", 17, 15)],
)


# ---------------------------------------------------------------- biome foliage (soft theme recolours)
from biome import biome_pieces  # noqa: E402

_BT, _BP = biome_pieces("ground")
TERRAIN.update(_BT)
PROPS.update(_BP)
