"""Mechanic and decoration pieces of the six regional caves D-I (docs/explanation/cave-regions.md).

The shared kit of every style (floor, gravel, wall, two-row face, ledges in four directions, stairs,
water, ladders, hole, exit light, Strength boulder, Rock Smash rock, cave mouth) lives in cave.py;
this module adds what each cave's own mechanic needs, plus 5-8 decoration Props per cave:

  D volcano-cave-*     lava (blob, 4 frames, LAVA), lava-fill (boulder sunk in lava, walkable), vent (steam)
  E quarry-cave-*      rail (4-way connector, walkable), cart / cart-v / cart-ore, ore, ore-crystal
  F mystic-cave-*      ice (blob, ICE: slide until stopped), stopper (crystal block), mirror (mirror crystal)
  G lagoon-cave-*      tide-sand (low-tide floor), tide-water (high tide, 8 frames, Surf), shelf (rock shelf)
  H powerplant-cave-*  gate-<bit>-closed / -open (vertical run), gate-h-<bit>-closed / -open (horizontal run),
                       lever-<bit>-on / -off, generator-lamp (lit 1x2), generator (2x2)
  I garden-cave-*      vine (Cut), moss (patch), flowers / flowers-blue, lily (on water); its ledges are roots

Exported with the cave kit by gen_overworld.py into assets/overworld/Caves/ (owner "cave"):

    python3 tools/overworld/gen_overworld.py --cave
"""
import math

from PIL import Image, ImageDraw

import cave as C
from cave import MOSS, ROOT, STEEL, STYLE, WOOD, canvas
from overworld_kit import contact_shade, draw_blobs, h16, mix

DARK = (14, 12, 20)
ICE = [(246, 250, 255), (222, 236, 250), (198, 220, 246), (164, 194, 236), (122, 152, 212)]
WETSAND = [(232, 220, 186), (210, 196, 160), (186, 170, 138), (152, 136, 116), (108, 98, 92)]
BIT = {0: [(255, 250, 190), (255, 232, 96), (240, 190, 48), (150, 104, 40)],      # lever / gate number 0: amber
       1: [(236, 252, 255), (140, 226, 250), (70, 170, 230), (40, 96, 164)]}      # number 1: cyan
LEAF = [(176, 224, 120), (118, 186, 92), (72, 140, 76), (44, 96, 62)]


def _st(name):
    s = STYLE[name]
    return s["floor"], s["rock"], s["out"], s["accent"]


def _px(im, x, y, c):
    if 0 <= x < im.width and 0 <= y < im.height:
        im.putpixel((x, y), c + (255,))


def _prisms(im, prisms, ramp, out, glint=True):
    """Crystal prisms (cx, base_y, half_width, height) with a lit left facet and a dark right one."""
    p = im.load()
    for cx, base, hw, ht in prisms:
        for y in range(base - ht, base + 1):
            t = (y - (base - ht)) / ht
            w = hw * min(1.0, t * 2.2 + 0.1)
            for x in range(im.width):
                u = x + 0.5 - cx
                if abs(u) <= w and 0 <= y < im.height:
                    edge = abs(u) > w - 1
                    c = out if edge else ramp[0] if u < -w * 0.2 and t < 0.6 else ramp[1] if u < 0.3 * w else ramp[3]
                    p[x, y] = c + (255,)
        if glint:
            _px(im, int(cx - 1), base - ht + 3, (255, 255, 255))


# ================================================================ D volcano: lava, filled lava, vent
def _lava_px(x, y, f):
    """Molten lava, 16 px periodic in x and y: two crossing slow waves give bright ropes of fresh
    melt and dark patches of cooling crust; f moves the flow 4 px east per frame (4 frames = a loop)."""
    A = STYLE["volcano"]["accent"]
    k = 2 * math.pi / 16
    xx = x - f * 4
    t = math.sin(k * xx + 1.6 * math.sin(k * y)) * 0.65 + math.sin(k * (2 * y - xx) + 0.8) * 0.35
    if t > 0.86:
        return A[0]
    if t > 0.55:
        return A[1]
    if t < -0.82:
        return A[4]
    if t < -0.55:
        return A[3]
    return A[2]


def _lava_painter():
    F, R, O, A = _st("volcano")

    def paint(d, facing, x, y, f, m):
        if d < 0:
            return None
        if d < 1.5:
            return O
        if d < 3:
            return R[3] if (x + y) % 3 else A[3]                     # basalt crust, glowing through
        if d < 4:
            return A[3]
        return _lava_px(x, y, f)
    return paint


def lava_fill():
    """A Strength boulder pushed into the lava (1x1, walkable): its flat top sits level with the
    floor, ringed by cooling lava. Opaque: put it over the lava cell the engine filled."""
    def paint():
        F, R, O, A = _st("volcano")
        frames = []
        for f in range(4):
            im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
            p = im.load()
            for y in range(16):
                for x in range(16):
                    p[x, y] = _lava_px(x, y, f) + (255,)
            draw_blobs(im, [(8, 8, 7.4, 7.0)], [F[1], F[2], F[2], F[3]], O)
            for x, y in ((3, 8), (4, 9), (5, 9), (6, 10), (11, 4), (12, 5), (9, 12), (10, 12)):
                p[x, y] = A[3] + (255,)                                   # cooling cracks still glow
            for x, y in ((4, 4), (5, 4), (4, 5)):
                p[x, y] = F[0] + (255,)
            frames.append(im)
        return frames
    return paint


def vent():
    """Heat vent (1x2): a cinder crater with a glowing throat; a steam plume rises in the cell above
    in rhythm (frames: idle, puff, plume, fading). Decoration: never blocks the way."""
    def paint():
        F, R, O, A = _st("volcano")
        steam = [(244, 240, 236), (214, 206, 206), (176, 166, 170)]
        frames = []
        for f in range(4):
            im = canvas(1, 2)
            d = ImageDraw.Draw(im)
            d.ellipse([1, 21, 14, 30], fill=R[2] + (255,), outline=O + (255,))
            d.arc([1, 21, 14, 30], 200, 340, fill=R[0] + (255,))
            d.ellipse([4, 23, 11, 28], fill=A[3] + (255,), outline=R[4] + (255,))
            d.ellipse([6, 24, 9, 27], fill=(A[1] if f == 2 else A[2]) + (255,))
            puffs = {0: [], 1: [(8, 20, 2.5, 2)], 2: [(8, 19, 3, 2.5), (7, 13, 4, 3.5), (9, 6, 4.5, 4)],
                     3: [(9, 11, 3.5, 3), (7, 4, 3, 2.5)]}[f]
            if puffs:
                draw_blobs(im, puffs, steam + [steam[2]], (150, 140, 146))
            frames.append(im)
        return frames
    return paint


def magma_crack():
    """Walkable decal: a glowing crack across the basalt floor."""
    def paint():
        A = STYLE["volcano"]["accent"]
        F = STYLE["volcano"]["floor"]
        im = canvas(1, 1)
        pts = ((1, 4), (2, 5), (3, 5), (4, 6), (5, 7), (6, 7), (7, 8), (8, 9), (9, 9), (10, 10), (11, 11), (12, 11),
               (13, 12), (14, 13), (7, 9), (6, 10), (6, 11), (10, 9), (11, 8))
        for x, y in pts:
            _px(im, x, y, A[2] if (x + y) % 3 else A[1])
            if im.getpixel((x, y - 1))[3] == 0:
                _px(im, x, y - 1, F[4])
        return [im]
    return paint


def obsidian():
    """Black glass shards (1x2) with violet sheen."""
    def paint():
        im = canvas(1, 2)
        O = STYLE["volcano"]["out"]
        contact_shade(im, 2, 14, 30)
        ramp = [(150, 138, 176), (86, 76, 108), (60, 52, 78), (38, 32, 50)]
        _prisms(im, [(8, 30, 3.2, 20), (4, 30, 2.2, 11), (12, 30, 2.4, 14)], ramp, O)
        return [im]
    return paint


def ember_rock():
    """A basalt rock split by glowing seams (1x1)."""
    def paint():
        F, R, O, A = _st("volcano")
        im = canvas(1, 1)
        contact_shade(im, 2, 14, 14)
        draw_blobs(im, [(8, 8.5, 6.5, 5.5), (5, 10, 3.6, 3.2)], R, O)
        for x, y in ((8, 4), (8, 5), (7, 6), (7, 7), (8, 8), (9, 9), (10, 9), (5, 9), (6, 9)):
            _px(im, x, y, A[2] if y % 2 else A[1])
        return [im]
    return paint


def ash_pile():
    """Walkable decal: a soft heap of grey ash with a few cinders."""
    def paint():
        F = STYLE["volcano"]["floor"]
        im = canvas(1, 1)
        draw_blobs(im, [(8, 10, 6.5, 3.5), (6, 8.5, 3.5, 2.5)], [(214, 208, 206), (192, 186, 186), F[1], F[2]], F[3])
        for x, y in ((5, 10), (10, 11), (8, 8)):
            _px(im, x, y, F[4])
        return [im]
    return paint


def sulfur():
    """Yellow sulfur crystals on a rock (1x1)."""
    def paint():
        F, R, O, A = _st("volcano")
        im = canvas(1, 1)
        contact_shade(im, 2, 14, 14)
        draw_blobs(im, [(8, 11, 6, 3.5)], R, O)
        _prisms(im, [(6, 12, 1.8, 7), (9, 12, 2.0, 9), (12, 12, 1.4, 5)],
                [(255, 250, 170), (240, 222, 90), (210, 186, 60), (160, 130, 48)], (110, 88, 44))
        return [im]
    return paint


def basalt_columns():
    """Hexagonal basalt columns of three heights (1x2), lit tops."""
    def paint():
        F, R, O, A = _st("volcano")
        im = canvas(1, 2)
        d = ImageDraw.Draw(im)
        contact_shade(im, 1, 15, 30)
        for x0, top in ((1, 14), (6, 8), (11, 17)):
            d.rectangle([x0, top + 2, x0 + 4, 29], fill=R[1] + (255,), outline=O + (255,))
            d.line([x0 + 1, top + 3, x0 + 1, 28], fill=R[0] + (255,))
            d.line([x0 + 3, top + 3, x0 + 3, 28], fill=R[2] + (255,))
            d.polygon([(x0, top + 2), (x0 + 1, top), (x0 + 3, top), (x0 + 4, top + 2)], fill=R[0] + (255,),
                      outline=O + (255,))
        return [im]
    return paint


# ================================================================ E quarry: rails, carts, ore
def _rail_tile(m):
    """Minecart rail, 4-neighbour connector (bit 1=N 2=E 4=S 8=W): timber sleepers and two steel rails;
    two adjacent sides make a curve, one side ends in a buffer stop, 0 is a short loose length."""
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    p = im.load()
    sides = [s for s, b in (("N", 1), ("E", 2), ("S", 4), ("W", 8)) if m & b]
    corner = len(sides) == 2 and not ({"N", "S"} == set(sides) or {"E", "W"} == set(sides))

    def put(x, y, c):
        if 0 <= x < 16 and 0 <= y < 16:
            p[x, y] = c + (255,)

    def straight(vertical, y0=0, y1=15):
        for a in range(y0, y1 + 1):                    # sleepers every 4 px
            if a % 4 == 1:
                for b in range(2, 14):
                    put(*((b, a) if vertical else (a, b)), WOOD[2] if b in (2, 13) else WOOD[1])
            if a % 4 == 2:
                for b in range(2, 14):
                    put(*((b, a) if vertical else (a, b)), WOOD[3])
        for a in range(y0, y1 + 1):
            for b, c in ((4, STEEL[0]), (5, STEEL[2]), (10, STEEL[0]), (11, STEEL[2])):
                put(*((b, a) if vertical else (a, b)), c)

    if corner:
        cx = 16 if "E" in sides else 0
        cy = 0 if "N" in sides else 16
        for y in range(16):
            for x in range(16):
                r = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                ang = math.atan2(y + 0.5 - cy, x + 0.5 - cx)
                if 2.5 <= r <= 13.5 and int(round(ang / (math.pi / 10))) % 2 == 0 and \
                        abs(ang / (math.pi / 10) - round(ang / (math.pi / 10))) < 0.18:
                    put(x, y, WOOD[1])
        for y in range(16):
            for x in range(16):
                r = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                for rr in (4.5, 11.5):
                    if abs(r - rr) < 0.5:
                        put(x, y, STEEL[0])
                    elif abs(r - (rr + 1)) < 0.5:
                        put(x, y, STEEL[2])
        return im
    if not sides:                                      # loose length, buffers both ends
        straight(False, 3, 12)
        for x in (2, 13):
            for y in range(3, 13):
                put(x, y, WOOD[3])
        return im
    if {"N", "S"} <= set(sides):
        straight(True)
    if {"E", "W"} <= set(sides):
        straight(False)
    for s in sides:                                    # the half toward each remaining side
        if s in ("N", "S") and {"N", "S"} <= set(sides):
            continue
        if s in ("E", "W") and {"E", "W"} <= set(sides):
            continue
        if s == "N":
            straight(True, 0, 8)
        elif s == "S":
            straight(True, 7, 15)
        elif s == "E":
            straight(False, 7, 15)
        else:
            straight(False, 0, 8)
    if len(sides) == 1:                                # buffer stop at the end of the line
        s = sides[0]
        box = {"N": (3, 8, 12, 11), "S": (3, 4, 12, 7), "E": (4, 3, 7, 12), "W": (8, 3, 11, 12)}[s]
        for y in range(box[1], box[3] + 1):
            for x in range(box[0], box[2] + 1):
                edge = x in (box[0], box[2]) or y in (box[1], box[3])
                put(x, y, WOOD[3] if edge else WOOD[0] if (x + y) % 5 == 0 else WOOD[1])
        cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
        put(cx, cy, (220, 70, 60))
    return im


def rail():
    def paint():
        return [[_rail_tile(m)] for m in range(16)]
    return paint


def cart(vertical=False, ore=False):
    """Minecart (1x1): a riveted iron tub on four wheels, seen from above; `vertical` for a N-S rail."""
    def paint():
        im = canvas(1, 1)
        d = ImageDraw.Draw(im)
        A = STYLE["quarry"]["accent"]
        tub = [(176, 120, 96), (146, 92, 76), (108, 66, 60), (66, 42, 44)]
        contact_shade(im, 2, 14, 14)
        if vertical:
            for x, y in ((3, 3), (11, 3), (3, 11), (11, 11)):
                d.rectangle([x - 1, y, x + 2, y + 2], fill=STEEL[3] + (255,))
            d.rectangle([4, 1, 11, 14], fill=tub[1] + (255,), outline=tub[3] + (255,))
            d.rectangle([5, 3, 10, 12], fill=tub[2] + (255,))
            d.line([5, 2, 10, 2], fill=tub[0] + (255,))
            d.line([4, 13, 11, 13], fill=tub[3] + (255,))
            box = (5, 3, 10, 9)
        else:
            for x in (3, 11):
                d.rectangle([x - 1, 10, x + 2, 13], fill=STEEL[3] + (255,))
                d.point((x, 11), fill=STEEL[1] + (255,))
            d.rectangle([1, 3, 14, 12], fill=tub[1] + (255,), outline=tub[3] + (255,))
            d.rectangle([2, 4, 13, 7], fill=tub[2] + (255,))
            d.line([2, 8, 13, 8], fill=tub[0] + (255,))
            d.point([(3, 10), (12, 10), (7, 10)], fill=STEEL[1] + (255,))
            box = (3, 4, 12, 7)
        if ore:
            draw_blobs(im, [((box[0] + box[2]) / 2, box[1] + 2, (box[2] - box[0]) / 2 + 0.5, 2.6)],
                       [(160, 156, 160), (124, 120, 126), (92, 88, 98), (70, 66, 76)], (52, 50, 62))
            for x, y in ((box[0] + 1, box[1] + 1), (box[2] - 2, box[1] + 2)):
                d.point((x, y), fill=A[0] + (255,))
                d.point((x + 1, y), fill=A[1] + (255,))
        return [im]
    return paint


def ore(crystal=False):
    """Ore vein in a rock (1x1, blocking): gold nuggets, or (crystal) violet amethyst points."""
    def paint():
        F, R, O, A = _st("quarry")
        im = canvas(1, 1)
        contact_shade(im, 2, 14, 14)
        draw_blobs(im, [(8, 8.5, 6.5, 5.5), (5.5, 10, 4, 3.5)], R[:4], O)
        if crystal:
            _prisms(im, [(6, 10, 1.8, 7), (9, 10, 2.2, 9), (12, 11, 1.4, 5)],
                    [(236, 200, 255), (190, 130, 236), (150, 96, 200), (100, 60, 150)], (70, 44, 104))
        else:
            for x, y in ((5, 6), (9, 5), (11, 9), (6, 10), (8, 8)):
                _px(im, x, y, A[0])
                _px(im, x + 1, y, A[1])
                _px(im, x, y + 1, A[2])
                _px(im, x + 1, y + 1, A[3])
        return [im]
    return paint


def lantern():
    """Mine lantern on a timber post (1x2), the flame flickers (3 frames)."""
    def paint():
        A = STYLE["quarry"]["accent"]
        frames = []
        for f in range(3):
            im = canvas(1, 2)
            d = ImageDraw.Draw(im)
            contact_shade(im, 4, 12, 30)
            d.rectangle([7, 8, 9, 29], fill=WOOD[1] + (255,), outline=WOOD[3] + (255,))
            d.line([7, 9, 7, 28], fill=WOOD[0] + (255,))
            d.line([5, 8, 12, 8], fill=WOOD[3] + (255,))
            d.line([11, 8, 11, 10], fill=STEEL[3] + (255,))
            d.rectangle([9, 10, 13, 16], fill=(A[0] if f != 1 else A[1]) + (255,), outline=(70, 60, 60, 255))
            d.line([11, 11, 11, 15], fill=(A[1] if f != 2 else A[0]) + (255,))
            d.line([9, 16, 13, 16], fill=(70, 60, 60, 255))
            frames.append(im)
        return frames
    return paint


def shoring():
    """Timber shoring frame (1x2): two posts and a cap beam, to stand against a face or across a gallery."""
    def paint():
        im = canvas(1, 2)
        d = ImageDraw.Draw(im)
        contact_shade(im, 0, 16, 30)
        for x in (1, 12):
            d.rectangle([x, 6, x + 3, 29], fill=WOOD[1] + (255,), outline=WOOD[3] + (255,))
            d.line([x + 1, 7, x + 1, 28], fill=WOOD[0] + (255,))
        d.rectangle([0, 3, 15, 7], fill=WOOD[1] + (255,), outline=WOOD[3] + (255,))
        d.line([1, 4, 14, 4], fill=WOOD[0] + (255,))
        d.line([4, 8, 7, 11], fill=WOOD[2] + (255,))
        d.line([11, 8, 8, 11], fill=WOOD[2] + (255,))
        return [im]
    return paint


def crate():
    def paint():
        im = canvas(1, 1)
        d = ImageDraw.Draw(im)
        contact_shade(im, 1, 15, 14)
        d.rectangle([2, 3, 13, 13], fill=WOOD[1] + (255,), outline=WOOD[3] + (255,))
        d.rectangle([2, 3, 13, 5], fill=WOOD[0] + (255,), outline=WOOD[3] + (255,))
        d.line([3, 6, 12, 12], fill=WOOD[2] + (255,))
        d.line([3, 12, 12, 6], fill=WOOD[2] + (255,))
        return [im]
    return paint


def tools():
    """A pickaxe and a shovel leaning together (1x1)."""
    def paint():
        im = canvas(1, 1)
        d = ImageDraw.Draw(im)
        contact_shade(im, 3, 13, 14)
        d.line([4, 13, 9, 3], fill=WOOD[2] + (255,), width=1)
        d.line([5, 13, 10, 3], fill=WOOD[1] + (255,))
        d.line([6, 2, 13, 5], fill=STEEL[2] + (255,))
        d.line([6, 1, 12, 4], fill=STEEL[0] + (255,))
        d.line([12, 13, 9, 5], fill=WOOD[2] + (255,))
        d.polygon([(10, 12), (14, 12), (14, 15), (11, 15)], fill=STEEL[1] + (255,), outline=STEEL[3] + (255,))
        return [im]
    return paint


def planks():
    """A pile of spare planks (2x1)."""
    def paint():
        im = canvas(2, 1)
        d = ImageDraw.Draw(im)
        contact_shade(im, 1, 31, 14)
        for k, y in enumerate((10, 7, 4)):
            x0 = 2 + k * 2
            d.rectangle([x0, y, x0 + 25 - k * 3, y + 3], fill=WOOD[1] + (255,), outline=WOOD[3] + (255,))
            d.line([x0 + 1, y + 1, x0 + 24 - k * 3, y + 1], fill=WOOD[0] + (255,))
        return [im]
    return paint


# ================================================================ F mystic: ice, stopper, mirror
def _ice_painter():
    F, R, O, A = _st("mystic")

    def paint(d, facing, x, y, f, m):
        if d < 0:
            return None
        if d < 1:
            return ICE[3]
        if d < 2.5:
            return ICE[0] if (x + y) % 2 else ICE[1]                  # frost rim
        xx, yy = x % 16, y % 16
        s = (xx + yy) % 16
        if s in (3, 4) or s == 11:
            return ICE[0]                                             # long diagonal shine: slippery
        if (xx, yy) in ((12, 2), (13, 3), (2, 12), (3, 13), (13, 9)):
            return ICE[3]                                             # hairline cracks in the ice
        if (xx - yy) % 16 == 7 and 4 < xx < 12:
            return ICE[2]
        return ICE[1]
    return paint


def stopper():
    """Crystal stopper (1x1, blocking): a squat cluster of lilac prisms frozen into the ice; a slide
    ends on the cell before it."""
    def paint():
        F, R, O, A = _st("mystic")
        im = canvas(1, 1)
        contact_shade(im, 1, 15, 14)
        draw_blobs(im, [(8, 12.5, 7, 2.5)], [ICE[0], ICE[1], ICE[2], ICE[3]], ICE[4])
        _prisms(im, [(8, 13, 3.4, 12), (3.5, 13, 2.4, 8), (12.5, 13, 2.4, 9)], [A[0], A[1], A[2], A[3]], O)
        return [im]
    return paint


def mirror():
    """Mirror crystal (1x2): a tall faceted slab that reflects the room; a glint runs down it (3 frames)."""
    def paint():
        F, R, O, A = _st("mystic")
        frames = []
        for f in range(3):
            im = canvas(1, 2)
            d = ImageDraw.Draw(im)
            contact_shade(im, 2, 14, 30)
            d.polygon([(4, 29), (2, 10), (8, 1), (13, 10), (11, 29)], fill=ICE[1] + (255,), outline=O + (255,))
            d.polygon([(5, 27), (4, 11), (8, 4), (8, 27)], fill=ICE[0] + (255,))
            d.polygon([(9, 27), (9, 5), (11, 11), (10, 27)], fill=ICE[2] + (255,))
            gy = 8 + f * 7
            d.line([5, gy + 2, 10, gy - 2], fill=(255, 255, 255, 255))
            d.line([5, gy + 3, 10, gy - 1], fill=A[0] + (255,))
            draw_blobs(im, [(8, 29, 6, 2.2)], [A[1], A[2], A[3], A[3]], O)
            frames.append(im)
        return frames
    return paint


def icicle():
    """An ice stalagmite (1x2)."""
    def paint():
        im = canvas(1, 2)
        O = STYLE["mystic"]["out"]
        contact_shade(im, 3, 13, 30)
        _prisms(im, [(8, 30, 3.4, 26), (4.5, 30, 2.0, 10), (11.5, 30, 2.0, 13)], ICE[:2] + [ICE[2], ICE[4]], O)
        return [im]
    return paint


def frost():
    """Walkable decal: a feathery frost pattern on the floor."""
    def paint():
        im = canvas(1, 1)
        for (cx, cy) in ((5, 6), (11, 10)):
            for k in range(-3, 4):
                _px(im, cx + k, cy, ICE[0])
                _px(im, cx, cy + k, ICE[0])
                if abs(k) < 3:
                    _px(im, cx + k, cy + k, ICE[2])
                    _px(im, cx + k, cy - k, ICE[2])
            _px(im, cx, cy, (255, 255, 255))
        return [im]
    return paint


def star_stone():
    """A fallen-star fragment (1x1): a dark meteorite with glowing pink-white star points, pulsing (3)."""
    def paint():
        F, R, O, A = _st("mystic")
        frames = []
        for f in range(3):
            im = canvas(1, 1)
            contact_shade(im, 2, 14, 14)
            draw_blobs(im, [(8, 9, 6, 5)], [(120, 112, 150), (90, 82, 120), (66, 60, 96), (48, 42, 72)], O)
            glow = [A[0], A[1], (255, 255, 255)][f]
            for x, y in ((6, 7), (10, 9), (8, 11)):
                _px(im, x, y, glow)
                _px(im, x + 1, y, A[2])
            frames.append(im)
        return frames
    return paint


def ice_rock():
    """A rock sealed in clear ice (1x1)."""
    def paint():
        F, R, O, A = _st("mystic")
        im = canvas(1, 1)
        contact_shade(im, 1, 15, 14)
        draw_blobs(im, [(8, 8.5, 7, 6)], ICE[:4], ICE[4])
        draw_blobs(im, [(8, 9.5, 4, 3.4)], R[1:5], R[4])
        _px(im, 4, 4, (255, 255, 255))
        _px(im, 5, 4, (255, 255, 255))
        return [im]
    return paint


def orb():
    """The astronomer's star globe on a crystal pedestal (1x2)."""
    def paint():
        F, R, O, A = _st("mystic")
        im = canvas(1, 2)
        d = ImageDraw.Draw(im)
        contact_shade(im, 1, 15, 30)
        d.rectangle([4, 16, 11, 29], fill=R[1] + (255,), outline=O + (255,))
        d.line([5, 17, 5, 28], fill=R[0] + (255,))
        d.rectangle([2, 26, 13, 29], fill=R[2] + (255,), outline=O + (255,))
        d.ellipse([2, 3, 13, 14], fill=(70, 64, 120, 255), outline=O + (255,))
        d.arc([2, 3, 13, 14], 180, 270, fill=A[1] + (255,))
        for x, y in ((5, 7), (9, 6), (7, 10), (11, 10)):
            d.point((x, y), fill=(255, 255, 255, 255))
        d.point((6, 5), fill=A[0] + (255,))
        return [im]
    return paint


# ================================================================ G lagoon: tide sand, tide water, shelf
def _tide_sand_painter():
    F = STYLE["lagoon"]["floor"]
    Wt = STYLE["lagoon"]["water"]

    def paint(d, facing, x, y, f, m):
        if d < 0:
            return None
        if C._feather(d, x, y, 3.0):
            return None
        xx, yy = x % 16, y % 16
        rip = (yy + int(round(math.sin(xx * math.pi / 8) * 1.4))) % 8
        if rip == 0:
            return WETSAND[2]                                         # wavy ripple marks left by the tide
        if rip == 1:
            return WETSAND[0]
        if (xx, yy) in ((12, 3), (13, 3), (4, 12)):
            return Wt[1]                                              # a little left-behind water
        if (xx, yy) in ((7, 8), (8, 8)):
            return STYLE["lagoon"]["accent"][1]                       # a pink shell
        return WETSAND[1]
    return paint


def _tide_water_painter():
    F, R, O, A = _st("lagoon")
    Wt = STYLE["lagoon"]["water"]

    def paint(d, facing, x, y, f, m):
        if d < 0:
            return None
        if d < 1.5:
            return WETSAND[1] if (x + y + f // 2) % 2 else Wt[0]            # foam line on the sand
        if d < 3.5:
            return Wt[1]                                             # shallows
        xx, yy = (x + f * 2) % 16, y % 16
        if (yy == 4 and 2 <= xx <= 5) or (yy == 10 and 9 <= xx <= 12) or (yy == 14 and 4 <= xx <= 6):
            return Wt[0] if f % 4 < 2 else Wt[1]
        return Wt[2] if (x * 7 + y * 3 + f) % 23 else Wt[3]
    return paint


def _shelf_painter():
    F, R, O, A = _st("lagoon")

    def paint(d, facing, x, y, f, m):
        if d < 0:
            return None
        if d < 1:
            return O
        if C._has(facing, "S") and d < 5:                          # short wet face toward the camera
            return R[4] if d < 2 else R[3] if d < 3.5 else R[2]
        if d < 2:
            return R[0] if C._has(facing, "N") else R[2]
        xx, yy = x % 16, y % 16
        if yy in (0, 8) or (xx == 0 and yy < 8) or (xx == 8 and yy >= 8):
            return R[2]                                               # joints of the flat slabs
        if yy in (1, 9):
            return R[0]
        if (xx, yy) in ((4, 4), (12, 12)):
            return STYLE["lagoon"]["dust"]                            # barnacles
        return R[1]
    return paint


def shells():
    def paint():
        F, R, O, A = _st("lagoon")
        im = canvas(1, 1)
        for x, y, c in ((3, 5, A[1]), (10, 3, A[0]), (12, 10, A[1]), (5, 11, A[0])):
            _px(im, x, y, c)
            _px(im, x + 1, y, c)
            _px(im, x, y + 1, A[2])
            _px(im, x + 1, y + 1, A[3])
        return [im]
    return paint


def coral(fan=False):
    """Pink branching coral (1x1), or a tall fan coral (1x2)."""
    def paint():
        F, R, O, A = _st("lagoon")
        im = canvas(1, 2 if fan else 1)
        d = ImageDraw.Draw(im)
        H = im.height
        contact_shade(im, 3, 13, H - 2)
        if fan:                                                   # sea fan: a lattice of branching twigs
            for a in range(200, 345, 18):
                r = math.radians(a)
                x1, y1 = 7.5 + math.cos(r) * 7, 28 + math.sin(r) * 24
                d.line([7.5, 28, x1, y1], fill=A[3] + (255,))
                xm, ym = 7.5 + math.cos(r) * 4, 28 + math.sin(r) * 14
                d.line([xm, ym, xm + math.cos(r + 0.5) * 3, ym + math.sin(r + 0.5) * 6], fill=A[2] + (255,))
                d.point((round(x1), round(y1)), fill=A[1] + (255,))
            for y in (12, 18):
                d.arc([1, y - 8, 14, y + 22], 200, 340, fill=A[2] + (255,))
            d.rectangle([6, 26, 9, H - 2], fill=A[3] + (255,), outline=A[4] + (255,))
        else:
            for pts in (((8, 14), (8, 8), (5, 4)), ((8, 10), (11, 6), (12, 3)), ((8, 12), (4, 9), (3, 6))):
                d.line(pts, fill=A[3] + (255,), width=2)
                d.line(pts, fill=A[1] + (255,))
            for x, y in ((5, 4), (12, 3), (3, 6)):
                d.point((x, y), fill=A[0] + (255,))
        return [im]
    return paint


def starfish():
    def paint():
        F, R, O, A = _st("lagoon")
        im = canvas(1, 1)
        for k in range(5):
            a = -math.pi / 2 + k * 2 * math.pi / 5
            for t in range(0, 5):
                _px(im, int(round(8 + math.cos(a) * t)), int(round(8 + math.sin(a) * t)), (240, 150, 80))
        _px(im, 8, 8, (255, 210, 140))
        _px(im, 8, 7, (255, 210, 140))
        return [im]
    return paint


def seaweed():
    """Walkable decal: strands of kelp washed on the floor, swaying (3 frames, played 0 1 0 2)."""
    def paint():
        frames = []
        for f in range(3):
            im = canvas(1, 1)
            sway = (0, 1, -1)[f]
            for x0 in (4, 9, 12):
                for y in range(5, 15):
                    xx = x0 + int(round(math.sin(y / 3.0) * 1)) + (sway if y < 9 else 0)
                    _px(im, xx, y, (96, 168, 112) if y < 10 else (58, 118, 92))
            frames.append(im)
        return frames
    return paint


def tide_pool():
    """A rock pool left by the tide, with a starfish (1x1, walkable edge)."""
    def paint():
        F, R, O, A = _st("lagoon")
        Wt = STYLE["lagoon"]["water"]
        im = canvas(1, 1)
        d = ImageDraw.Draw(im)
        d.ellipse([1, 3, 14, 14], fill=R[1] + (255,), outline=O + (255,))
        d.ellipse([3, 5, 12, 12], fill=Wt[2] + (255,))
        d.line([4, 7, 7, 7], fill=Wt[0] + (255,))
        for k in range(5):
            a = -math.pi / 2 + k * 2 * math.pi / 5
            for t in range(0, 3):
                _px(im, int(round(9 + math.cos(a) * t)), int(round(9 + math.sin(a) * t)), (240, 150, 80))
        return [im]
    return paint


def clam():
    """A giant clam holding a pearl (1x1): the pearl grotto's treasure."""
    def paint():
        F, R, O, A = _st("lagoon")
        im = canvas(1, 1)
        d = ImageDraw.Draw(im)
        contact_shade(im, 1, 15, 14)
        d.pieslice([1, 6, 14, 19], 180, 360, fill=(150, 170, 196, 255), outline=(60, 70, 100, 255))
        for x in (4, 7, 10):
            d.line([x + 1, 12, x, 7], fill=(110, 128, 160, 255))
        d.chord([1, 0, 14, 14], 180, 360, fill=(196, 210, 228, 255), outline=(60, 70, 100, 255))
        d.ellipse([5, 7, 10, 12], fill=A[0] + (255,), outline=A[2] + (255,))
        _px(im, 6, 8, (255, 255, 255))
        return [im]
    return paint


def barnacle_rock():
    def paint():
        F, R, O, A = _st("lagoon")
        im = canvas(1, 1)
        contact_shade(im, 2, 14, 14)
        draw_blobs(im, [(8, 8.5, 6.5, 5.5), (5, 10, 3.6, 3.2)], R, O)
        for x, y in ((6, 5), (9, 7), (11, 5), (5, 9), (10, 10)):
            _px(im, x, y, STYLE["lagoon"]["dust"])
            _px(im, x, y + 1, R[4])
        return [im]
    return paint


# ================================================================ H powerplant: gates, levers, lamps
def gate(bit, closed, horizontal=False):
    """Electric gate (1x1 per cell, laid as a run across a corridor): a steel floor track with two
    emitter studs; closed, a crackling field in the gate's number colour fills the run (3 frames,
    blocking); open, the track shows its lamp dark and the cell is walkable. The default run is
    vertical (a column across an E-W corridor); horizontal=True turns it 90 degrees."""
    def paint():
        col = BIT[bit]
        frames = []
        for f in range(3 if closed else 1):
            im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            d.rectangle([5, 0, 10, 15], fill=STEEL[2] + (255,))
            d.line([5, 0, 5, 15], fill=STEEL[3] + (255,))
            d.line([10, 0, 10, 15], fill=STEEL[3] + (255,))
            d.line([6, 0, 6, 15], fill=STEEL[1] + (255,))
            for y in (2, 10):                                         # emitter studs
                d.rectangle([6, y, 9, y + 3], fill=STEEL[0] + (255,), outline=STEEL[3] + (255,))
                d.point((7, y + 1), fill=(col[1] if closed else (70, 74, 90)) + (255,))
            if closed:
                for k in range(16):                                   # the field: a jagged bolt that moves
                    x = 7 + int(round(math.sin((k + f * 5) * 1.3) * 3))
                    d.point((x, k), fill=col[0] + (255,))
                    d.point((x + 1, k), fill=col[1] + (255,))
                    if (k + f) % 5 == 0:
                        d.point((x - 2, k), fill=col[2] + (255,))
                        d.point((x + 3, k), fill=col[2] + (255,))
            frames.append(im.rotate(90) if horizontal else im)
        return frames
    return paint


def lever(bit, on):
    """Lever box on a post (1x1, blocking, press A): handle up and the number lamp lit when on."""
    def paint():
        F, R, O, A = _st("powerplant")
        col = BIT[bit]
        im = canvas(1, 1)
        d = ImageDraw.Draw(im)
        contact_shade(im, 3, 13, 14)
        d.rectangle([7, 9, 8, 14], fill=STEEL[3] + (255,))
        d.rectangle([2, 3, 13, 10], fill=R[1] + (255,), outline=O + (255,))
        d.line([3, 4, 12, 4], fill=R[0] + (255,))
        d.rectangle([4, 6, 7, 8], fill=(col[1] if on else (66, 70, 86)) + (255,), outline=O + (255,))
        d.point((5, 6), fill=(col[0] if on else (96, 100, 116)) + (255,))
        if on:
            d.line([10, 7, 12, 1], fill=STEEL[1] + (255,))
            d.rectangle([11, 0, 13, 1], fill=(220, 70, 60, 255))
        else:
            d.line([10, 7, 12, 12], fill=STEEL[1] + (255,))
            d.rectangle([11, 12, 13, 13], fill=(220, 70, 60, 255))
        return [im]
    return paint


def generator_lamp():
    """Generator lamp (1x2): a caged work light on a steel pole; it lights the dark B1F around it
    (the engine's fixed light source). The bulb hums (2 frames)."""
    def paint():
        F, R, O, A = _st("powerplant")
        frames = []
        for f in range(2):
            im = canvas(1, 2)
            d = ImageDraw.Draw(im)
            contact_shade(im, 3, 13, 30)
            d.rectangle([4, 26, 11, 29], fill=R[2] + (255,), outline=O + (255,))
            d.rectangle([7, 10, 8, 26], fill=STEEL[2] + (255,))
            d.line([7, 10, 7, 26], fill=STEEL[1] + (255,))
            d.ellipse([3, 1, 12, 10], fill=(A[0] if f == 0 else A[1]) + (255,), outline=STEEL[3] + (255,))
            d.ellipse([5, 3, 9, 7], fill=(255, 255, 240, 255))
            for x in (5, 7, 10):
                d.line([x, 1, x, 10], fill=STEEL[3] + (255,))
            frames.append(im)
        return frames
    return paint


def generator():
    """Generator (2x2): a riveted steel housing with a glowing coil window that pulses (3 frames)."""
    def paint():
        F, R, O, A = _st("powerplant")
        frames = []
        for f in range(3):
            im = canvas(2, 2)
            d = ImageDraw.Draw(im)
            contact_shade(im, 1, 31, 30)
            d.rectangle([2, 8, 29, 29], fill=STEEL[1] + (255,), outline=O + (255,))
            d.rectangle([2, 4, 29, 9], fill=STEEL[0] + (255,), outline=O + (255,))
            d.line([3, 10, 28, 10], fill=STEEL[2] + (255,))
            d.rectangle([7, 13, 24, 24], fill=(40, 40, 54, 255), outline=STEEL[3] + (255,))
            for k in range(4):
                y = 15 + k * 2 + (f % 2)
                d.line([9, y, 22, y], fill=(A[(k + f) % 3]) + (255,))
            for x, y in ((4, 12), (27, 12), (4, 27), (27, 27)):
                d.point((x, y), fill=STEEL[3] + (255,))
            d.rectangle([22, 1, 25, 4], fill=STEEL[2] + (255,), outline=O + (255,))
            d.rectangle([4, 26, 12, 28], fill=A[2] + (255,))
            frames.append(im)
        return frames
    return paint


def pipes():
    """A pipe run along the floor with a red valve wheel (2x1)."""
    def paint():
        im = canvas(2, 1)
        d = ImageDraw.Draw(im)
        contact_shade(im, 0, 32, 14)
        for y0 in (4, 9):
            d.rectangle([0, y0, 31, y0 + 3], fill=STEEL[1] + (255,), outline=STEEL[3] + (255,))
            d.line([0, y0 + 1, 31, y0 + 1], fill=STEEL[0] + (255,))
        for x in (6, 24):
            d.rectangle([x, 3, x + 2, 13], fill=STEEL[2] + (255,), outline=STEEL[3] + (255,))
        d.ellipse([13, 2, 19, 8], outline=(200, 60, 56, 255))
        d.line([16, 2, 16, 8], fill=(200, 60, 56, 255))
        return [im]
    return paint


def cable():
    """Walkable decal: a coil of heavy cable on the floor."""
    def paint():
        im = canvas(1, 1)
        d = ImageDraw.Draw(im)
        d.ellipse([2, 5, 13, 13], outline=(56, 58, 72, 255))
        d.ellipse([4, 6, 11, 12], outline=(86, 88, 104, 255))
        d.line([13, 9, 15, 9], fill=(56, 58, 72, 255))
        d.line([0, 4, 3, 7], fill=(56, 58, 72, 255))
        d.point((7, 6), fill=STYLE["powerplant"]["accent"][2] + (255,))
        return [im]
    return paint


def panel():
    """Control cabinet (1x2) with dials and indicator lamps."""
    def paint():
        F, R, O, A = _st("powerplant")
        im = canvas(1, 2)
        d = ImageDraw.Draw(im)
        contact_shade(im, 1, 15, 30)
        d.rectangle([1, 6, 14, 29], fill=STEEL[1] + (255,), outline=O + (255,))
        d.line([2, 7, 13, 7], fill=STEEL[0] + (255,))
        d.rectangle([3, 9, 12, 15], fill=(40, 52, 60, 255), outline=STEEL[3] + (255,))
        d.line([4, 13, 6, 11, 8, 12, 11, 10], fill=(120, 230, 160, 255))
        for x, c in ((4, A[1]), (7, (120, 230, 160)), (10, (220, 70, 60))):
            d.rectangle([x, 18, x + 1, 19], fill=c + (255,))
        d.ellipse([4, 22, 8, 26], fill=STEEL[0] + (255,), outline=STEEL[3] + (255,))
        d.line([6, 24, 7, 22], fill=O + (255,))
        d.rectangle([10, 22, 12, 27], fill=STEEL[2] + (255,), outline=STEEL[3] + (255,))
        return [im]
    return paint


def transformer():
    """A ribbed transformer with two insulators (1x2)."""
    def paint():
        F, R, O, A = _st("powerplant")
        im = canvas(1, 2)
        d = ImageDraw.Draw(im)
        contact_shade(im, 1, 15, 30)
        d.rectangle([2, 12, 13, 29], fill=(150, 170, 150, 255), outline=O + (255,))
        for x in range(4, 13, 3):
            d.line([x, 14, x, 27], fill=(110, 130, 116, 255))
        d.line([3, 13, 12, 13], fill=(196, 214, 196, 255))
        for x in (4, 10):
            for k in range(3):
                d.rectangle([x, 4 + k * 3, x + 2, 5 + k * 3], fill=(236, 230, 220, 255), outline=(150, 120, 110, 255))
        d.polygon([(6, 18), (9, 18), (7, 21), (9, 21), (6, 25), (7, 22), (5, 22)], fill=A[1] + (255,))
        return [im]
    return paint


def drain():
    """Walkable decal: a steel drain grate set in the concrete."""
    def paint():
        F = STYLE["powerplant"]["floor"]
        im = canvas(1, 1)
        d = ImageDraw.Draw(im)
        d.rectangle([2, 3, 13, 12], fill=(48, 50, 64, 255), outline=F[3] + (255,))
        for x in range(4, 13, 2):
            d.line([x, 4, x, 11], fill=STEEL[2] + (255,))
        d.line([2, 12, 13, 12], fill=F[0] + (255,))
        return [im]
    return paint


# ================================================================ I garden: vine, moss, flowers
def vine():
    """Cut vines (1x1, blocking until Cut): a curtain of hanging stems and leaves filling the cell."""
    def paint():
        im = canvas(1, 1)
        for k, x0 in enumerate((2, 6, 10, 13)):
            for y in range(0, 16):
                x = x0 + int(round(math.sin(y / 3.0 + k) * 1.0))
                _px(im, x, y, LEAF[3] if (y + k) % 4 else LEAF[2])
            for y in range(2 + k, 15, 4):                              # leaves along each stem
                x = x0 + int(round(math.sin(y / 3.0 + k) * 1.0))
                side = 1 if (y // 4 + k) % 2 else -2
                _px(im, x + side, y, LEAF[1])
                _px(im, x + side + 1, y, LEAF[0] if side > 0 else LEAF[1])
                _px(im, x + side, y + 1, LEAF[2])
        contact_shade(im, 1, 15, 14)
        return [im]
    return paint


def _moss_painter():
    def paint(d, facing, x, y, f, m):
        if d < 0 or C._feather(d, x, y, 4.0):
            return None
        xx, yy = x % 16, y % 16
        if (xx, yy) in ((3, 4), (11, 2), (7, 11), (13, 13)):
            return MOSS[0]
        if (xx * 3 + yy * 5) % 11 == 0:
            return MOSS[2]
        if (xx, yy) in ((5, 7), (12, 9)):
            return (250, 236, 170)                                    # tiny pale flowers
        return MOSS[1]
    return paint


def flowers(blue=False):
    """Glowing cave flowers (1x1, walkable): pale bells on dark stems, swaying (3 frames, 0 1 0 2)."""
    def paint():
        petal = [(214, 232, 255), (150, 190, 250), (96, 130, 210)] if blue else \
            [(255, 222, 240), (246, 160, 206), (200, 96, 160)]
        frames = []
        for f in range(3):
            im = canvas(1, 1)
            sway = (0, 1, -1)[f]
            for cx, cy in ((4, 6), (10, 4), (8, 10), (13, 11)):
                for y in range(cy + 2, min(16, cy + 6)):
                    _px(im, cx, y, LEAF[3])
                _px(im, cx - 1, cy + 4, LEAF[2])
                x = cx + sway
                _px(im, x, cy, petal[0])
                _px(im, x + 1, cy, petal[1])
                _px(im, x - 1, cy + 1, petal[1])
                _px(im, x, cy + 1, petal[1])
                _px(im, x + 1, cy + 1, petal[2])
            frames.append(im)
        return frames
    return paint


def glowshroom():
    """Glowing mushrooms (1x1), cyan-green caps."""
    def paint():
        A = STYLE["garden"]["accent"]
        im = canvas(1, 1)
        d = ImageDraw.Draw(im)
        contact_shade(im, 3, 13, 14)
        for (x, y, r) in ((6, 7, 4), (11, 10, 3)):
            d.rectangle([x - 1, y, x, 14], fill=(236, 226, 200, 255))
            d.pieslice([x - r, y - r, x + r, y + r], 180, 360, fill=A[1] + (255,), outline=A[3] + (255,))
            d.point((x - 1, y - r + 1), fill=A[0] + (255,))
        return [im]
    return paint


def fern():
    def paint():
        im = canvas(1, 1)
        contact_shade(im, 3, 13, 14)
        for a in (-2.2, -1.6, -1.0, -0.5):
            for side in (1, -1):
                ang = a if side > 0 else -math.pi - a
                for t in range(0, 7):
                    _px(im, int(round(8 + math.cos(ang) * t)), int(round(13 + math.sin(ang) * t)),
                        LEAF[1] if t > 2 else LEAF[2])
        _px(im, 8, 13, LEAF[3])
        return [im]
    return paint


def root(size=(2, 1)):
    """A thick old root arching out of the floor (2x1, blocking), or the mother root's trunk (3x3)."""
    def paint():
        F, R, O, A = _st("garden")
        w, h = size
        im = canvas(w, h)
        d = ImageDraw.Draw(im)
        if (w, h) == (2, 1):
            contact_shade(im, 1, 31, 14)
            d.arc([1, 4, 30, 24], 180, 360, fill=ROOT[3] + (255,), width=5)
            d.arc([2, 5, 29, 23], 185, 355, fill=ROOT[1] + (255,), width=2)
            d.arc([3, 6, 28, 22], 200, 340, fill=ROOT[0] + (255,))
            for x, y in ((9, 6), (20, 5)):
                d.point((x, y), fill=MOSS[1] + (255,))
            return [im]
        contact_shade(im, 2, 46, 46)
        d.polygon([(10, 47), (14, 26), (12, 6), (20, 0), (30, 0), (36, 6), (34, 26), (40, 47)],
                  fill=ROOT[1] + (255,), outline=O + (255,))
        for pts in (((10, 47), (2, 40), (0, 44)), ((40, 47), (46, 38), (47, 44)), ((24, 47), (22, 40))):
            d.line(pts, fill=ROOT[2] + (255,), width=3)
        for x in (17, 23, 29):
            d.line([x, 4, x - 1, 22, x + 1, 44], fill=ROOT[2] + (255,))
        d.line([14, 6, 15, 40], fill=ROOT[0] + (255,))
        for x, y in ((18, 2), (24, 1), (30, 3), (14, 12)):
            d.ellipse([x - 3, y - 1, x + 3, y + 2], fill=MOSS[1] + (255,), outline=MOSS[2] + (255,))
        for x, y in ((20, 18), (28, 30), (17, 34), (31, 14)):
            d.point((x, y), fill=A[1] + (255,))
        return [im]
    return paint


def glowworms():
    """Glowworm threads hanging from a face (2x1): fine silk lines with lit beads."""
    def paint():
        A = STYLE["garden"]["accent"]
        im = canvas(2, 1)
        for x0, n in ((3, 9), (7, 13), (12, 7), (18, 11), (23, 8), (28, 12)):
            for y in range(0, n):
                if y % 3 == 2:
                    _px(im, x0, y, A[0] if y % 2 else A[1])
                else:
                    _px(im, x0, y, (190, 210, 196))
        return [im]
    return paint


def lily():
    """A lily pad with a pale flower (1x1, laid on a water cell)."""
    def paint():
        im = canvas(1, 1)
        d = ImageDraw.Draw(im)
        d.pieslice([2, 4, 13, 14], 20, 340, fill=LEAF[1] + (255,), outline=LEAF[3] + (255,))
        d.line([8, 9, 13, 8], fill=LEAF[3] + (255,))
        d.ellipse([5, 5, 9, 9], fill=(255, 236, 246, 255), outline=(220, 140, 190, 255))
        _px(im, 7, 7, (255, 230, 120))
        return [im]
    return paint


# ================================================================ extra floor pieces (redesign 2026-11-19)
def _boardwalk_painter():
    """Mine plank walkway (walkable blob): planks laid across the way, nail heads, dark kerb boards."""
    def paint(d, facing, x, y, f, m):
        if d < 0:
            return None
        if d < 1:
            return WOOD[3]
        if d < 2:
            return WOOD[2]
        xx, yy = x % 16, y % 16
        if yy % 4 == 3:
            return WOOD[3]                                            # gap between planks
        if yy % 4 == 0:
            return WOOD[0]
        if (xx, yy % 4) in ((2, 1), (13, 1)):
            return STEEL[2]                                           # nail heads
        if (xx + yy * 5) % 11 == 0:
            return WOOD[2]                                            # grain
        return WOOD[1]
    return paint


def light_pool():
    """Lantern light on the mine floor (2x2, walkable decal): a warm pale ellipse with a dithered rim."""
    def paint():
        F = STYLE["quarry"]["floor"]
        im = canvas(2, 2)
        hi = mix(F[0], (255, 244, 200), 0.5)
        for y in range(32):
            for x in range(32):
                q = ((x + 0.5 - 16) / 15) ** 2 + ((y + 0.5 - 16) / 11) ** 2
                if q < 0.55 or (q < 1.0 and (x + y) % 2 == 0 and q < 0.8):
                    _px(im, x, y, hi if q < 0.55 else F[0])
                elif q < 1.0 and (x + y) % 2 == 0:
                    _px(im, x, y, F[0])
        return [im]
    return paint


def _snow_painter():
    """Snow drift (walkable patch): white heaped snow, a lilac shadow on its south side, feathered edge."""
    F = STYLE["mystic"]["floor"]

    def paint(d, facing, x, y, f, m):
        if d < 0 or C._feather(d, x, y, 3.0):
            return None
        if C._has(facing, "S") and d < 3:
            return F[2]
        xx, yy = x % 16, y % 16
        if (yy + int(round(math.sin(xx * math.pi / 8) * 1.5))) % 8 == 0:
            return ICE[1]
        return (250, 250, 255) if h16(xx, yy, 5) < 240 else (255, 255, 255)
    return paint


def drip():
    """Dripping water (1x1, walkable): a drop falls from the roof into a puddle and rings out (4 frames)."""
    def paint():
        Wt = STYLE["lagoon"]["water"]
        F = STYLE["lagoon"]["floor"]
        frames = []
        for f in range(4):
            im = canvas(1, 1)
            d = ImageDraw.Draw(im)
            d.ellipse([3, 9, 12, 14], fill=Wt[2] + (255,), outline=F[3] + (255,))
            if f == 0:
                d.line([7, 1, 7, 2], fill=Wt[0] + (255,))
            elif f == 1:
                d.line([7, 5, 7, 7], fill=Wt[0] + (255,))
            elif f == 2:
                d.point((7, 11), fill=(255, 255, 255, 255))
                d.ellipse([5, 10, 10, 13], outline=Wt[0] + (255,))
            else:
                d.ellipse([3, 9, 12, 14], outline=Wt[1] + (255,))
            frames.append(im)
        return frames
    return paint


# ================================================================ registry
TERRAIN, PROPS = {}, {}
TERRAIN["volcano-cave-lava"] = dict(kind="blob", behaviour="LAVA", paint=_lava_painter(), frames=4, soft=False,
                                    solid=True, lava=True, emissive=STYLE["volcano"]["accent"][:3],
                                    sdf=dict(margin=1.0, radius=5, wobble=0.7, freq=1))
TERRAIN["mystic-cave-ice"] = dict(kind="blob", behaviour="ICE", paint=_ice_painter(), walk=True, soft=False,
                                  sdf=dict(margin=0.5, radius=3, wobble=0.0, freq=1))
TERRAIN["lagoon-cave-tide-sand"] = dict(kind="blob", behaviour="TIDE_SAND", paint=_tide_sand_painter(), walk=True,
                                        group="lagoon-cave-tide",
                                        soft=False, sdf=dict(margin=1.0, radius=6, wobble=0.6, freq=1))
TERRAIN["lagoon-cave-tide-water"] = dict(kind="blob", behaviour="TIDE_WATER", paint=_tide_water_painter(), frames=8,
                                         group="lagoon-cave-tide",
                                         soft=False, sdf=dict(margin=1.0, radius=6, wobble=0.6, freq=1))
TERRAIN["lagoon-cave-shelf"] = dict(kind="blob", behaviour="CAVE", paint=_shelf_painter(), walk=True, shelf=True,
                                    soft=False, sdf=dict(margin=0.5, radius=4, wobble=0.5, freq=1))
TERRAIN["quarry-cave-boardwalk"] = dict(kind="blob", behaviour="CAVE", paint=_boardwalk_painter(), walk=True,
                                        soft=False, sdf=dict(margin=0.5, radius=1, wobble=0.0, freq=1))
TERRAIN["mystic-cave-snow"] = dict(kind="blob", patch=True, walk=True, behaviour="CAVE", paint=_snow_painter(),
                                   soft=False, sdf=dict(margin=1.0, radius=7, wobble=0.8, freq=1))
TERRAIN["garden-cave-moss"] = dict(kind="blob", patch=True, walk=True, behaviour="CAVE", paint=_moss_painter(),
                                   soft=False, sdf=dict(margin=1.0, radius=7, wobble=0.0, freq=1))


def _prop(slug, cells, paint, style, **kw):
    PROPS[slug] = dict(cells=cells, paint=paint, ground=f"{style}-cave-floor", **kw)


V, Q, M, L, P, G = (f"{s}-cave" for s in ("volcano", "quarry", "mystic", "lagoon", "powerplant", "garden"))
_A = STYLE["volcano"]["accent"]
# D volcano
_prop(f"{V}-lava-fill", (1, 1), lava_fill(), "volcano", walk=True, emissive=_A[:3])
_prop(f"{V}-vent", (1, 2), vent(), "volcano", order=[0, 0, 1, 2, 3], emissive=_A[1:3])
_prop(f"{V}-magma-crack", (1, 1), magma_crack(), "volcano", walk=True, emissive=_A[1:3])
_prop(f"{V}-obsidian", (1, 2), obsidian(), "volcano")
_prop(f"{V}-ember-rock", (1, 1), ember_rock(), "volcano", emissive=_A[1:3])
_prop(f"{V}-ash-pile", (1, 1), ash_pile(), "volcano", walk=True)
_prop(f"{V}-sulfur", (1, 1), sulfur(), "volcano")
_prop(f"{V}-basalt-columns", (1, 2), basalt_columns(), "volcano")
# E quarry
_prop(f"{Q}-light", (2, 2), light_pool(), "quarry", walk=True)
_prop(f"{Q}-rail", (1, 1), rail(), "quarry", kind="cross", walk=True)
_prop(f"{Q}-cart", (1, 1), cart(), "quarry")
_prop(f"{Q}-cart-v", (1, 1), cart(vertical=True), "quarry")
_prop(f"{Q}-cart-ore", (1, 1), cart(ore=True), "quarry")
_prop(f"{Q}-ore", (1, 1), ore(), "quarry")
_prop(f"{Q}-ore-crystal", (1, 1), ore(crystal=True), "quarry")
_prop(f"{Q}-lantern", (1, 2), lantern(), "quarry", order=[0, 1, 0, 2], emissive=STYLE["quarry"]["accent"][:2])
_prop(f"{Q}-shoring", (1, 2), shoring(), "quarry")
_prop(f"{Q}-crate", (1, 1), crate(), "quarry")
_prop(f"{Q}-tools", (1, 1), tools(), "quarry")
_prop(f"{Q}-planks", (2, 1), planks(), "quarry")
# F mystic
_prop(f"{M}-stopper", (1, 1), stopper(), "mystic")
_prop(f"{M}-mirror", (1, 2), mirror(), "mystic", order=[0, 1, 2], emissive=[(255, 255, 255)])
_prop(f"{M}-crystal", (1, 2), C.crystal("mystic"), "mystic")
_prop(f"{M}-crystal-small", (1, 1), C.crystal("mystic", False), "mystic")
_prop(f"{M}-icicle", (1, 2), icicle(), "mystic")
_prop(f"{M}-frost", (1, 1), frost(), "mystic", walk=True)
_prop(f"{M}-star-stone", (1, 1), star_stone(), "mystic", order=[0, 1, 2, 1], emissive=STYLE["mystic"]["accent"][:2])
_prop(f"{M}-ice-rock", (1, 1), ice_rock(), "mystic")
_prop(f"{M}-orb", (1, 2), orb(), "mystic")
# G lagoon
_prop(f"{L}-shells", (1, 1), shells(), "lagoon", walk=True)
_prop(f"{L}-drip", (1, 1), drip(), "lagoon", walk=True)
_prop(f"{L}-coral", (1, 1), coral(), "lagoon")
_prop(f"{L}-coral-fan", (1, 2), coral(fan=True), "lagoon")
_prop(f"{L}-starfish", (1, 1), starfish(), "lagoon", walk=True)
_prop(f"{L}-seaweed", (1, 1), seaweed(), "lagoon", walk=True, order=[0, 1, 0, 2])
_prop(f"{L}-tide-pool", (1, 1), tide_pool(), "lagoon")
_prop(f"{L}-clam", (1, 1), clam(), "lagoon")
_prop(f"{L}-barnacle-rock", (1, 1), barnacle_rock(), "lagoon")
# H powerplant
for _b in (0, 1):
    _prop(f"{P}-gate-{_b}-closed", (1, 1), gate(_b, True), "powerplant", order=[0, 1, 2], emissive=BIT[_b][:3])
    _prop(f"{P}-gate-{_b}-open", (1, 1), gate(_b, False), "powerplant", walk=True)
    _prop(f"{P}-gate-h-{_b}-closed", (1, 1), gate(_b, True, True), "powerplant", order=[0, 1, 2],
          emissive=BIT[_b][:3])
    _prop(f"{P}-gate-h-{_b}-open", (1, 1), gate(_b, False, True), "powerplant", walk=True)
    _prop(f"{P}-lever-{_b}-on", (1, 1), lever(_b, True), "powerplant", emissive=BIT[_b][:2])
    _prop(f"{P}-lever-{_b}-off", (1, 1), lever(_b, False), "powerplant")
_prop(f"{P}-generator-lamp", (1, 2), generator_lamp(), "powerplant", order=[0, 1], lamp=(255, 236, 150),
      emissive=STYLE["powerplant"]["accent"][:2] + [(255, 255, 240)])
_prop(f"{P}-generator", (2, 2), generator(), "powerplant", order=[0, 1, 2], emissive=STYLE["powerplant"]["accent"][:3])
_prop(f"{P}-pipes", (2, 1), pipes(), "powerplant")
_prop(f"{P}-cable", (1, 1), cable(), "powerplant", walk=True)
_prop(f"{P}-panel", (1, 2), panel(), "powerplant")
_prop(f"{P}-transformer", (1, 2), transformer(), "powerplant")
_prop(f"{P}-drain", (1, 1), drain(), "powerplant", walk=True)
# I garden
_prop(f"{G}-vine", (1, 1), vine(), "garden", cut=True)
_prop(f"{G}-flowers", (1, 1), flowers(), "garden", walk=True, order=[0, 1, 0, 2])
_prop(f"{G}-flowers-blue", (1, 1), flowers(blue=True), "garden", walk=True, order=[0, 1, 0, 2])
_prop(f"{G}-glowshroom", (1, 1), glowshroom(), "garden", emissive=STYLE["garden"]["accent"][:2])
_prop(f"{G}-fern", (1, 1), fern(), "garden")
_prop(f"{G}-root", (2, 1), root(), "garden")
_prop(f"{G}-mother-root", (3, 3), root((3, 3)), "garden")
_prop(f"{G}-glowworms", (2, 1), glowworms(), "garden", emissive=STYLE["garden"]["accent"][:2])
_prop(f"{G}-lily", (1, 1), lily(), "garden", water=True)

# ---------------------------------------------------------------- review scenes (one per style)
# Every regional cave gets its own chamber, cut from its approved mock (tools/maps/cave_variants.py):
# D a lava river with a boulder bridge and a magma lake island, E galleries joined by a minecart line,
# F a crystal ice rink under snow drifts, G a tidal basin with shelves, H straight tunnels split by an
# electric gate, I three root chambers linked by one-way root ledges. Chars: W wall, k face (auto),
# . floor, g gravel, ~ water, _ ^ > < ledges S / N / E / W, S stairs, L lava, I ice, n snow,
# s tide sand, t tide water, h shelf, m moss, b boardwalk.
def _carve(w, h, floors, walls=(), fills=()):
    """A w x h scene: all rock, `floors` rects carved out, `walls` rects put back, then two face rows
    above every floor cell that has rock right over it; `fills` (x, y, w, h, char) paint terrains last."""
    g = [["W"] * w for _ in range(h)]
    for x0, y0, ww, hh in floors:
        for y in range(y0, y0 + hh):
            for x in range(x0, x0 + ww):
                g[y][x] = "."
    for x0, y0, ww, hh in walls:
        for y in range(y0, y0 + hh):
            for x in range(x0, x0 + ww):
                g[y][x] = "W"
    for y in range(h):
        for x in range(w):
            if g[y][x] == "." and y >= 1 and g[y - 1][x] == "W":
                g[y - 1][x] = "k"
                if y >= 2 and g[y - 2][x] == "W" and y - 2 > 0:
                    g[y - 2][x] = "k"
    for x0, y0, ww, hh, ch in fills:
        for y in range(y0, y0 + hh):
            for x in range(x0, x0 + ww):
                g[y][x] = ch
    return ["".join(r) for r in g]


def _lava_cells():
    cells = []
    for y in range(4, 19):                                        # a river winding south-west
        x0 = 6 + int(round(math.sin(y / 3.0) * 1.5))
        cells += [(x, y) for x in range(x0, x0 + 3)]
    for y in range(5, 14):                                        # the magma lake round an island
        for x in range(13, 28):
            q = ((x - 20) / 6.5) ** 2 + ((y - 9) / 4.2) ** 2
            isl = ((x - 20) / 2.6) ** 2 + ((y - 9) / 1.3) ** 2
            if q < 1 and isl > 1:
                cells.append((x, y))
    return cells


def _scene_volcano():
    return _carve(32, 20, [(2, 4, 28, 15), (15, 19, 4, 1), (1, 9, 1, 8)], [(28, 4, 2, 3), (2, 4, 2, 2)],
                  [(x, y, 1, 1, "L") for x, y in _lava_cells()] + [(10, 15, 2, 2, "g"), (24, 16, 4, 2, "g")])


SCENES = {
    "volcano": (_scene_volcano(), {"L": "volcano-cave-lava"},
                [("volcano-cave-lava-fill", 6, 16), ("volcano-cave-lava-fill", 7, 16),
                 ("volcano-cave-lava-fill", 8, 16),
                 ("volcano-cave-boulder", 5, 12), ("volcano-cave-boulder", 12, 9),
                 ("volcano-cave-vent", 4, 8), ("volcano-cave-vent", 27, 15), ("volcano-cave-vent", 14, 17),
                 ("volcano-cave-basalt-columns", 3, 18), ("volcano-cave-basalt-columns", 29, 10),
                 ("volcano-cave-basalt-columns", 12, 6), ("volcano-cave-obsidian", 22, 16),
                 ("volcano-cave-obsidian", 29, 13), ("volcano-cave-ember-rock", 18, 16),
                 ("volcano-cave-sulfur", 20, 9), ("volcano-cave-ash-pile", 11, 12), ("volcano-cave-ash-pile", 25, 4),
                 ("volcano-cave-magma-crack", 16, 15), ("volcano-cave-magma-crack", 3, 14),
                 ("volcano-cave-ladder-down", 19, 9), ("volcano-cave-ladder-up", 23, 4),
                 ("volcano-cave-smash-rock", 2, 11), ("volcano-cave-rock-big", 19, 18),
                  ("volcano-cave-stalagmite", 10, 5)]
                + [("volcano-cave-exit", x, 19) for x in range(15, 19)], []),
}


def _scene_quarry():
    return _carve(32, 20, [(2, 4, 9, 4), (20, 4, 10, 4), (2, 7, 28, 2), (6, 9, 3, 3), (23, 9, 3, 3), (1, 12, 30, 7),
                           (15, 19, 4, 1)],
                  [(5, 13, 5, 3), (19, 13, 5, 3), (11, 4, 9, 3)],
                  [(6, 9, 3, 3, "b"), (23, 9, 3, 3, "b"), (26, 13, 3, 2, "g")])


SCENES["quarry"] = (_scene_quarry(), {"b": "quarry-cave-boardwalk"},
                    [("quarry-cave-lantern", 5, 5), ("quarry-cave-light", 4, 7), ("quarry-cave-lantern", 22, 5),
                     ("quarry-cave-light", 21, 7), ("quarry-cave-lantern", 13, 17), ("quarry-cave-light", 12, 18),
                     ("quarry-cave-shoring", 6, 8), ("quarry-cave-shoring", 8, 8), ("quarry-cave-shoring", 23, 8),
                     ("quarry-cave-shoring", 25, 8), ("quarry-cave-cart", 3, 12), ("quarry-cave-cart-v", 29, 15),
                     ("quarry-cave-cart-ore", 20, 17), ("quarry-cave-ore", 2, 5), ("quarry-cave-ore-crystal", 3, 5),
                     ("quarry-cave-ore", 29, 5), ("quarry-cave-smash-rock", 28, 6), ("quarry-cave-crate", 9, 5),
                     ("quarry-cave-crate", 10, 5), ("quarry-cave-tools", 9, 6), ("quarry-cave-planks", 16, 8),
                     ("quarry-cave-ladder-up", 25, 6), ("quarry-cave-ladder-down", 15, 15),
                     ("quarry-cave-rubble", 1, 18), ("quarry-cave-boulder", 11, 13)]
                    + [("quarry-cave-exit", x, 19) for x in range(15, 19)],
                    [(x, 12, "quarry-cave-rail") for x in range(3, 30)]
                    + [(29, y, "quarry-cave-rail") for y in range(13, 18)]
                    + [(x, 17, "quarry-cave-rail") for x in range(19, 29)]
                    + [(10, y, "quarry-cave-rail") for y in (13, 14)]
                    + [(x, 7, "quarry-cave-rail") for x in range(11, 21)])


def _scene_mystic():
    rows = _carve(32, 20, [(2, 4, 28, 15), (15, 19, 4, 1)], [(2, 4, 3, 3), (26, 4, 4, 2), (13, 4, 5, 2)],
                  [(9, 9, 16, 8, "I"), (2, 14, 6, 3, "n"), (24, 6, 6, 2, "n"), (5, 6, 4, 2, "n"), (26, 14, 3, 3, "~")])
    return rows


SCENES["mystic"] = (_scene_mystic(), {"I": "mystic-cave-ice", "n": "mystic-cave-snow"},
                    [("mystic-cave-stopper", 11, 10), ("mystic-cave-stopper", 17, 9), ("mystic-cave-stopper", 23, 11),
                     ("mystic-cave-stopper", 14, 14), ("mystic-cave-stopper", 20, 16), ("mystic-cave-stopper", 10, 15),
                     ("mystic-cave-mirror", 25, 13), ("mystic-cave-mirror", 8, 9), ("mystic-cave-crystal", 6, 13),
                     ("mystic-cave-crystal", 29, 9), ("mystic-cave-crystal-small", 28, 9),
                      ("mystic-cave-crystal", 19, 7),
                     ("mystic-cave-icicle", 3, 11), ("mystic-cave-icicle", 22, 6), ("mystic-cave-frost", 12, 18),
                     ("mystic-cave-frost", 21, 18), ("mystic-cave-star-stone", 27, 18), ("mystic-cave-ice-rock", 2, 18),
                     ("mystic-cave-orb", 11, 7), ("mystic-cave-ladder-up", 8, 5), ("mystic-cave-ladder-down", 25, 7),
                     ("mystic-cave-boulder", 4, 9)] + [("mystic-cave-exit", x, 19) for x in range(15, 19)], [])


def _scene_lagoon():
    return _carve(32, 20, [(2, 4, 28, 15), (15, 19, 4, 1)], [(2, 4, 4, 3), (24, 4, 6, 2), (13, 4, 4, 2), (6, 12, 3, 3)],
                  [(10, 7, 9, 7, "s"), (19, 7, 11, 9, "t"), (24, 9, 3, 3, "h"), (19, 14, 3, 2, "s"),
                   (2, 16, 4, 2, "~")])


SCENES["lagoon"] = (_scene_lagoon(), {"s": "lagoon-cave-tide-sand", "t": "lagoon-cave-tide-water",
                                      "h": "lagoon-cave-shelf"},
                    [("lagoon-cave-clam", 25, 10), ("lagoon-cave-shells", 12, 9), ("lagoon-cave-starfish", 15, 12),
                     ("lagoon-cave-seaweed", 17, 8), ("lagoon-cave-seaweed", 11, 12), ("lagoon-cave-shells", 20, 15),
                     ("lagoon-cave-tide-pool", 4, 9), ("lagoon-cave-tide-pool", 9, 17), ("lagoon-cave-drip", 7, 7),
                     ("lagoon-cave-drip", 22, 18), ("lagoon-cave-coral-fan", 8, 9), ("lagoon-cave-coral", 9, 9),
                     ("lagoon-cave-coral", 28, 17), ("lagoon-cave-barnacle-rock", 23, 17),
                      ("lagoon-cave-barnacle-rock", 3, 12),
                     ("lagoon-cave-rock-big", 12, 18), ("lagoon-cave-ladder-up", 20, 4),
                      ("lagoon-cave-ladder-down", 27, 13),
                     ("lagoon-cave-boulder", 10, 15), ("lagoon-cave-smash-rock", 29, 6)]
                    + [("lagoon-cave-exit", x, 19) for x in range(15, 19)], [])


def _scene_powerplant():
    return _carve(32, 20, [(2, 4, 12, 4), (18, 4, 12, 4), (2, 8, 3, 6), (12, 8, 8, 3), (27, 8, 3, 6), (2, 14, 28, 5),
                           (15, 19, 4, 1)],
                  [(8, 14, 6, 3), (20, 14, 4, 3)], [])


SCENES["powerplant"] = (_scene_powerplant(), {},
                        [("powerplant-cave-gate-0-closed", 12, 8), ("powerplant-cave-gate-0-closed", 12, 9),
                         ("powerplant-cave-gate-0-closed", 12, 10), ("powerplant-cave-gate-1-open", 19, 8),
                         ("powerplant-cave-gate-1-open", 19, 9), ("powerplant-cave-gate-1-open", 19, 10),
                         ("powerplant-cave-gate-h-1-closed", 27, 12), ("powerplant-cave-gate-h-1-closed", 28, 12),
                         ("powerplant-cave-gate-h-1-closed", 29, 12), ("powerplant-cave-gate-h-0-open", 2, 12),
                         ("powerplant-cave-gate-h-0-open", 3, 12), ("powerplant-cave-gate-h-0-open", 4, 12),
                         ("powerplant-cave-lever-0-on", 7, 4), ("powerplant-cave-lever-1-off", 24, 4),
                         ("powerplant-cave-generator", 14, 18), ("powerplant-cave-generator-lamp", 17, 17),
                         ("powerplant-cave-generator-lamp", 3, 6), ("powerplant-cave-generator-lamp", 28, 6),
                         ("powerplant-cave-panel", 11, 5), ("powerplant-cave-panel", 20, 5),
                         ("powerplant-cave-transformer", 29, 17), ("powerplant-cave-transformer", 2, 17),
                         ("powerplant-cave-pipes", 4, 18), ("powerplant-cave-pipes", 24, 18),
                         ("powerplant-cave-cable", 15, 9), ("powerplant-cave-drain", 26, 15),
                          ("powerplant-cave-drain", 6, 15),
                         ("powerplant-cave-ladder-up", 9, 5), ("powerplant-cave-ladder-down", 22, 7),
                         ("powerplant-cave-smash-rock", 16, 7)]
                        + [("powerplant-cave-exit", x, 19) for x in range(15, 19)], [])


def _scene_garden():
    return _carve(32, 20, [(2, 4, 8, 6), (13, 3, 8, 6), (23, 4, 7, 6), (2, 12, 10, 7), (14, 12, 16, 7), (15, 19, 4, 1),
                           (10, 6, 3, 2), (21, 6, 2, 2), (5, 10, 3, 2), (25, 10, 3, 2), (12, 15, 2, 2)],
                  [],
                  [(10, 6, 1, 2, ">"), (21, 6, 1, 2, "<"), (5, 10, 3, 1, "_"), (25, 11, 3, 1, "^"), (12, 15, 1, 2, ">"),
                   (19, 13, 7, 4, "~"), (3, 14, 4, 3, "m"), (15, 4, 4, 2, "m")])


SCENES["garden"] = (_scene_garden(), {"m": "garden-cave-moss", "^": "garden-cave-ledge-north",
                                      ">": "garden-cave-ledge-east", "<": "garden-cave-ledge-west"},
                    [("garden-cave-vine", 28, 12), ("garden-cave-vine", 28, 13), ("garden-cave-vine", 28, 14),
                     ("garden-cave-mother-root", 26, 18), ("garden-cave-lily", 21, 14), ("garden-cave-lily", 23, 15),
                     ("garden-cave-flowers", 4, 15), ("garden-cave-flowers-blue", 6, 16),
                      ("garden-cave-flowers", 16, 5),
                     ("garden-cave-flowers-blue", 18, 4), ("garden-cave-glowshroom", 3, 5),
                      ("garden-cave-glowshroom", 29, 8),
                     ("garden-cave-glowshroom", 14, 13), ("garden-cave-fern", 8, 13), ("garden-cave-fern", 24, 5),
                     ("garden-cave-root", 6, 8), ("garden-cave-root", 22, 18), ("garden-cave-glowworms", 14, 1),
                     ("garden-cave-glowworms", 4, 3), ("garden-cave-ladder-up", 26, 6),
                      ("garden-cave-ladder-down", 4, 7),
                     ("garden-cave-boulder", 10, 17), ("garden-cave-stalagmite", 20, 18)]
                    + [("garden-cave-exit", x, 19) for x in range(15, 19)], [])


def scene(st):
    """(rows, chars, props, fences, ground) of the review scene for a regional style."""
    rows, extra, props, fences = SCENES[st]
    chars, ground = C.scene(st)[1], C.scene(st)[3]
    chars = dict(chars, **{"^": f"{st}-cave-ledge-north", ">": f"{st}-cave-ledge-east", "<": f"{st}-cave-ledge-west"})
    return rows, dict(chars, **extra), props, fences, ground
