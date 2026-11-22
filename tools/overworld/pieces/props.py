"""Prop painters: each returns RGBA frames on a transparent cell-snapped canvas (16 px cells).
PROPS[slug] = dict(cells=(w, h), frames=painter -> [Image], emissive=[RGB], kind='prop'|'cross')."""
import math

from PIL import Image, ImageDraw

from overworld_kit import (BARK, CLIFF, FOLIAGE_OUT, GRASS, HEDGE, IO, LEAF, SHADE_KEY, STONE, WOOD, contact_shade,
                           draw_blobs, h16)
from terrain import emerald_tree

BULB = (255, 240, 170)
BULB2 = (255, 214, 120)
SHINE = (255, 255, 255)


def canvas(w, h):
    return Image.new("RGBA", (w * 16, h * 16), (0, 0, 0, 0))


# ---------------------------------------------------------------- foliage
def tree():
    """Emerald-style 2x2 tree: a full round crown built from three rows of leaf lobes (each lobe lit
    top-left, so the rows read as layered scallops), deep olive outline, short trunk, opaque shade."""
    return [emerald_tree(canvas(2, 2), lawn=False)]


def bush():
    im = canvas(1, 1)
    contact_shade(im, 2, 14, 14, alpha=80)
    draw_blobs(im, [(8, 9, 7, 5.5), (4.5, 10, 4, 4), (11.5, 10, 4, 4), (8, 5.5, 5, 4)], HEDGE, FOLIAGE_OUT, speck=52)
    return [im]


def cut_tree():
    im = canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 4, 12, 14, alpha=80)
    d.rectangle([7, 9, 8, 14], fill=BARK[1] + (255,))
    draw_blobs(im, [(8, 6, 5, 4.5), (5, 8.5, 3.2, 2.8), (11, 8.5, 3.2, 2.8)],
               [(150, 210, 120), (110, 176, 100), (78, 140, 86), (54, 104, 72)], FOLIAGE_OUT)
    return [im]


PETAL = [(255, 189, 131), (222, 106, 98), (205, 65, 82)]      # light, mid, deep (Emerald flower bed)
EYE = (238, 230, 164)
BLOSSOM = ["..lm..",
           ".lmmm.",
           "lmeedm",
           "mmeddd",
           ".mddd.",
           "..dd.."]


def flower_patch(petal=PETAL, eye=EYE, spots=((1, 2), (8, 1), (5, 7)), shape=BLOSSOM):
    """Emerald-style flower patch: round blossoms with an eye over a small dark-green leaf clump;
    frames sway the blossoms 1 px (played 0,1,0,2)."""
    frames = []
    for lean in (0, 1, -1):
        im = canvas(1, 1)
        p = im.load()
        for x, y in ((2, 13), (3, 12), (6, 13), (9, 12), (12, 13), (4, 14), (10, 14), (7, 12)):
            for dx, dy in ((0, 0), (1, 0), (0, 1)):
                p[x + dx, y + dy] = (LEAF[2] if dy else LEAF[1]) + (255,)
        for i, (sx, sy) in enumerate(spots):
            ln = lean if i % 2 == 0 else -lean
            for v, row in enumerate(shape):
                for u, ch in enumerate(row):
                    if ch == ".":
                        continue
                    col = {"l": petal[0], "m": petal[1], "d": petal[2], "e": eye}[ch]
                    x, y = sx + u + ln, sy + v
                    if 0 <= x < 16 and 0 <= y < 16:
                        p[x, y] = col + (255,)
            stem_x = sx + len(shape[0]) // 2 + ln
            for y in range(sy + len(shape), 13):
                if 0 <= stem_x < 16:
                    p[stem_x, y] = LEAF[2] + (255,)
        frames.append(im)
    return frames


def flowers():
    return flower_patch()


SMALL_BLOSSOM = [".lm.",
                 "lmed",
                 "mddd",
                 ".dd."]
STAR_BLOSSOM = ["..l..",
                ".lml.",
                "lmemd",
                ".mdd.",
                "..d.."]


def flowers_yellow():
    """Buttercup-yellow patch: four small cups with a warm brown eye."""
    return flower_patch([(255, 238, 156), (242, 204, 80), (206, 150, 56)], (150, 96, 60),
                        ((1, 3), (6, 1), (11, 3), (6, 7)), SMALL_BLOSSOM)


def flowers_white():
    """White daisy patch: star blossoms with a yellow eye, cool grey shade."""
    return flower_patch([(255, 255, 250), (230, 232, 236), (184, 190, 210)], (244, 200, 80),
                        ((0, 2), (9, 1), (5, 6)), STAR_BLOSSOM)


def flowers_blue():
    """Blue-violet bellflower patch: small blossoms with a pale eye."""
    return flower_patch([(204, 196, 255), (150, 142, 232), (104, 92, 186)], (250, 240, 190),
                        ((2, 1), (10, 2), (5, 6), (11, 7)), SMALL_BLOSSOM)


# ---------------------------------------------------------------- rocks
def rock():
    im = canvas(1, 1)
    contact_shade(im, 2, 14, 14, alpha=90)
    draw_blobs(im, [(8, 8.5, 6.5, 5.5), (5.5, 10, 4, 3.5)], STONE, STONE[4], speck=61)
    p = im.load()
    for x, y in ((9, 7), (10, 8), (10, 9)):
        p[x, y] = STONE[3] + (255,)
    return [im]


def smash_rock():
    im = canvas(1, 1)
    contact_shade(im, 2, 14, 14, alpha=90)
    ramp = [(236, 222, 200), (206, 190, 166), (170, 152, 132), (128, 110, 100)]
    draw_blobs(im, [(8, 8.5, 6.5, 5.5)], ramp, (88, 74, 70))
    p = im.load()
    for x, y in ((8, 4), (8, 5), (7, 6), (7, 7), (8, 8), (9, 9), (9, 10), (6, 9), (5, 10), (10, 7), (11, 6)):
        p[x, y] = (96, 80, 74, 255)
    return [im]


def rock_big():
    im = canvas(2, 2)
    contact_shade(im, 3, 29, 29, alpha=90)
    pts = draw_blobs(im, [(16, 15, 13, 11), (8, 19, 7, 7), (24, 18, 7, 7), (15, 9, 9, 6)], STONE, STONE[4], speck=62)
    p = im.load()
    for (x, y) in pts:                       # short south face: darker lower band
        if y >= 22 and p[x, y][:3] != STONE[4] and (x, y + 1) in pts:
            p[x, y] = (STONE[3] if y >= 25 else STONE[2]) + (255,)
    for x, y in ((18, 10), (19, 11), (19, 12), (20, 13), (11, 15), (12, 16)):
        p[x, y] = STONE[3] + (255,)
    return [im]


# ---------------------------------------------------------------- man-made
def _fence_tile(mask, gate=None):
    """mask bits: 1=N 2=E 4=S 8=W (connect toward that neighbour)."""
    im = canvas(1, 1)
    d = ImageDraw.Draw(im)
    W0, W1, W2, W3 = (c + (255,) for c in WOOD)
    if mask & 2 or mask & 8 or gate:
        x0 = 0 if mask & 8 or gate else 8
        x1 = 15 if mask & 2 or gate else 8
        if gate == "open":
            x0, x1 = 0, 3
        d.rectangle([x0, 5, x1, 6], fill=W1)
        d.line([x0, 5, x1, 5], fill=W0)
        d.rectangle([x0, 9, x1, 10], fill=W1)
        d.line([x0, 9, x1, 9], fill=W0)
        d.line([x0, 11, x1, 11], fill=W3)
        if gate == "open":
            d.rectangle([12, 4, 15, 12], fill=W1, outline=W3)
    if mask & 1 or mask & 4:                 # rails seen from above when running N/S
        y0 = 0 if mask & 1 else 8
        y1 = 15 if mask & 4 else 8
        d.rectangle([6, y0, 9, y1], fill=W1)
        d.line([6, y0, 6, y1], fill=W0)
        d.line([9, y0, 9, y1], fill=W3)
    if gate != "closed" or True:
        d.rectangle([6, 2, 9, 12], fill=W0, outline=W3)      # post
        d.line([7, 3, 7, 11], fill=(250, 216, 160, 255))
    contact_shade(im, 5, 11, 13, alpha=80)
    if gate == "closed":
        d.rectangle([10, 4, 15, 12], fill=W1, outline=W3)
        d.line([11, 6, 14, 10], fill=W2)
    return im


def fence():
    return [[_fence_tile(m)] for m in range(16)] + [[_fence_tile(2 | 8, "closed")], [_fence_tile(8, "open")]]


def sign():
    im = canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 5, 11, 14, alpha=80)
    d.rectangle([7, 9, 8, 14], fill=WOOD[3] + (255,))
    d.rectangle([1, 2, 14, 10], fill=WOOD[1] + (255,), outline=WOOD[3] + (255,))
    d.rectangle([3, 4, 12, 8], fill=WOOD[0] + (255,))
    d.line([3, 8, 12, 8], fill=WOOD[2] + (255,))
    return [im]


def mailbox():
    im = canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 5, 11, 14, alpha=80)
    d.rectangle([7, 9, 8, 14], fill=WOOD[3] + (255,))
    d.rounded_rectangle([3, 3, 12, 10], radius=3, fill=(214, 84, 76, 255), outline=(120, 40, 44, 255))
    d.line([5, 4, 10, 4], fill=(246, 140, 120, 255))
    d.rectangle([4, 7, 11, 8], fill=(170, 60, 60, 255))
    d.rectangle([12, 2, 13, 6], fill=(255, 220, 90, 255))
    return [im]


def item_ball():
    im = canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 4, 12, 13, alpha=90)
    d.ellipse([3, 3, 12, 12], fill=(232, 72, 72, 255), outline=IO + (255,))
    d.chord([3, 3, 12, 12], 0, 180, fill=(246, 246, 246, 255), outline=IO + (255,))
    d.line([4, 8, 11, 8], fill=IO + (255,))
    d.ellipse([6, 6, 9, 9], fill=(246, 246, 246, 255), outline=IO + (255,))
    im.putpixel((5, 5), SHINE + (255,))
    return [im]


def street_lamp():
    im = canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 4, 12, 30, alpha=90)
    iron = [(110, 112, 132, 255), (72, 74, 92, 255), (44, 44, 60, 255)]
    d.rectangle([4, 27, 11, 29], fill=iron[1], outline=iron[2])
    d.rectangle([7, 9, 8, 27], fill=iron[1])
    d.line([7, 9, 7, 27], fill=iron[0])
    d.polygon([(4, 3), (11, 3), (12, 5), (3, 5)], fill=iron[1], outline=iron[2])
    d.rectangle([4, 5, 11, 10], fill=BULB2 + (255,), outline=iron[2])
    d.rectangle([5, 6, 7, 9], fill=BULB + (255,))
    d.line([6, 1, 9, 1], fill=iron[2])
    d.rectangle([6, 2, 9, 2], fill=iron[1])
    return [im]


def cave_mouth():
    im = canvas(2, 2)
    d = ImageDraw.Draw(im)
    pts = draw_blobs(im, [(16, 18, 15, 13), (6, 24, 6, 7), (26, 24, 6, 7), (16, 8, 10, 6)], CLIFF, (70, 54, 54), speck=71)
    d.ellipse([7, 10, 24, 34], fill=(18, 14, 24, 255), outline=(70, 54, 54, 255))
    d.rectangle([8, 26, 23, 31], fill=(18, 14, 24, 255))
    d.line([9, 31, 22, 31], fill=(70, 54, 54, 255))
    for x, y in ((4, 28), (27, 29), (3, 30), (28, 30)):
        d.ellipse([x - 2, y - 1, x + 2, y + 1], fill=STONE[2] + (255,), outline=STONE[4] + (255,))
    return [im]


# ---------------------------------------------------------------- coast + rewards
PALM = [(176, 236, 120), (120, 196, 96), (72, 150, 80), (44, 104, 72)]
TRUNK = [(214, 170, 120), (176, 128, 90), (120, 84, 70)]


def palm_tree():
    """Beach palm (2x2): a ringed, gently curved trunk and a star of drooping fronds, lit top-left."""
    im = canvas(2, 2)
    contact_shade(im, 9, 31, 22, alpha=90)
    p = im.load()
    for k in range(17):                         # trunk from the ground up, leaning a little left
        y = 30 - k
        x = 16 - (k * k) // 64
        for dx in (0, 1, 2):
            p[x + dx, y] = (TRUNK[0] if dx == 0 else TRUNK[1] if dx == 1 else TRUNK[2]) + (255,)
        if k % 3 == 0:
            p[x + 1, y] = TRUNK[2] + (255,)
    cx, cy = 14, 10
    for ang in (-170, -140, -110, -75, -40, -10, 15, 40, 140, 165, 195):
        a = math.radians(ang)
        for t in range(15):
            x = cx + math.cos(a) * t
            y = cy + math.sin(a) * t * 0.6 + (t * t) / 34.0       # fronds droop at the tips
            for w in ((-1, 0, 1, 2) if t < 10 else (-1, 0, 1)):
                xx, yy = int(round(x)), int(round(y + w))
                if 0 <= xx < 32 and 0 <= yy < 32:
                    edge = abs(w) == 1
                    lit = math.sin(a) < 0
                    col = PALM[3] if edge and not lit else PALM[2] if edge else PALM[0] if lit and t < 8 else PALM[1]
                    p[xx, yy] = col + (255,)
    for (x, y) in ((13, 12), (15, 12), (14, 13)):  # coconuts
        p[x, y] = TRUNK[2] + (255,)
    return [im]


BERRY = [(238, 92, 120), (190, 52, 92)]


def berry_tree():
    """Berry tree (1x2): a small round shrub-tree on a short trunk, hung with ripe red berries."""
    im = canvas(1, 2)
    contact_shade(im, 3, 13, 30, alpha=90)
    d = ImageDraw.Draw(im)
    d.rectangle([7, 22, 8, 29], fill=BARK[1] + (255,))
    d.point([(7, 22), (7, 25)], fill=BARK[0] + (255,))
    draw_blobs(im, [(8, 14, 7, 6.5), (4.5, 17, 4, 3.5), (11.5, 17, 4, 3.5)], LEAF, FOLIAGE_OUT, speck=33)
    p = im.load()
    for (x, y) in ((5, 12), (10, 11), (8, 16), (12, 15), (4, 17), (9, 19)):
        p[x, y] = BERRY[0] + (255,)
        p[x, y + 1] = BERRY[1] + (255,)
        p[x + 1, y + 1] = BERRY[1] + (255,)
    return [im]


# ---------------------------------------------------------------- street furniture (neutral, any town)
def bench():
    """Park bench (2x1): two-slat wooden seat and backrest on dark iron legs, neutral wood."""
    im = canvas(2, 1)
    contact_shade(im, 2, 30, 15, alpha=80)
    d = ImageDraw.Draw(im)
    d.rectangle([3, 3, 28, 4], fill=WOOD[1] + (255,))       # backrest
    d.rectangle([3, 5, 28, 5], fill=WOOD[3] + (255,))
    d.rectangle([3, 8, 28, 9], fill=WOOD[0] + (255,))       # seat
    d.rectangle([3, 10, 28, 10], fill=WOOD[2] + (255,))
    for x in (4, 27):
        d.rectangle([x, 2, x + 1, 14], fill=BARK[2] + (255,))
    return [im]


def planter():
    """Stone planter box (1x1) with a mound of leaves and a few small blossoms."""
    im = canvas(1, 1)
    contact_shade(im, 1, 15, 15, alpha=80)
    d = ImageDraw.Draw(im)
    d.rectangle([2, 8, 13, 14], fill=STONE[2] + (255,))
    d.rectangle([2, 8, 13, 8], fill=STONE[1] + (255,))
    d.rectangle([2, 14, 13, 14], fill=STONE[4] + (255,))
    draw_blobs(im, [(8, 6, 5.5, 3.5), (5, 7, 3, 2.5), (11, 7, 3, 2.5)], HEDGE, FOLIAGE_OUT, speck=17)
    p = im.load()
    for x, y in ((5, 5), (9, 4), (11, 6)):
        p[x, y] = (238, 160, 170, 255)
    return [im]


# ---------------------------------------------------------------- nature detail (decals and vignette pieces)
def stamp(im, rows, ink, ox=0, oy=0):
    """Paint an ASCII sprite: each char in `ink` is a colour, anything else is left as it is."""
    p = im.load()
    for v, row in enumerate(rows):
        for u, ch in enumerate(row):
            if ch in ink and 0 <= ox + u < im.width and 0 <= oy + v < im.height:
                p[ox + u, oy + v] = ink[ch] + (255,)


TUFT = ["................",
        "................",
        "................",
        "................",
        "......l.........",
        "..l...m...l.....",
        "..m..lm..lm..l..",
        "...m.mm.lm..m...",
        "...mmdm.md.mm...",
        "....mdmmdmmd....",
        "..l.mddmddmd.l..",
        "..mmdmddddmdmm..",
        "...mddddddddm...",
        "....ssssssss....",
        "................",
        "................"]


def tuft():
    """Walkable tuft of taller grass blades in the lawn's own greens (light tips, dark roots)."""
    im = canvas(1, 1)
    stamp(im, TUFT, {"l": GRASS[0], "m": GRASS[2], "d": GRASS[4], "s": GRASS[3]})
    return [im]


FERN = ["................",
        "................",
        "................",
        "......l.........",
        ".....lm...l.....",
        "..l..mm..lm.....",
        "..mm.md.mm...l..",
        "...mmdmmd...mm..",
        ".l..mddd..mmd...",
        ".mm..dd.mmd..l..",
        "..mmmddmdd..mm..",
        "....mddddmmmd...",
        "..lmmdddddd.....",
        "...mmddddddm....",
        ".....ssssss.....",
        "................"]


def fern():
    """Walkable forest-floor fern: arched fronds of paired leaflets in deep greens with light tips,
    for the foot of tree walls and shady corners."""
    im = canvas(1, 1)
    stamp(im, FERN, {"l": LEAF[1], "m": LEAF[2], "d": LEAF[3], "s": GRASS[3]})
    return [im]


PEBBLES = ["................",
           "................",
           "................",
           "................",
           "................",
           "................",
           ".........lm.....",
           "...lm...lmmd....",
           "..lmmd...dds....",
           "..mmdd..........",
           "...dds.....lm...",
           "...........mds..",
           "......lm....s...",
           ".....lmd........",
           "......ss........",
           "................"]


def pebbles():
    """Walkable scatter of four small stones (warm grey, lit top-left, shade under each)."""
    im = canvas(1, 1)
    stamp(im, PEBBLES, {"l": STONE[0], "m": STONE[1], "d": STONE[3], "s": GRASS[3]})
    return [im]


ROCKS_SMALL = ["................",
               "................",
               "................",
               "................",
               "................",
               "......oooo......",
               ".....olllmo.....",
               "....ollmmmdo....",
               "..oooolmmmddo...",
               ".ollmoommdddooo.",
               ".olmmmdoodddlmo.",
               ".ommmddo.oooomdo",
               "..oddddo..ommddo",
               "...oooo....oooo.",
               "...ssssssssssss.",
               "................"]


def rocks_small():
    """A cluster of three small boulders (blocking): one tall in the back, two low in front."""
    im = canvas(1, 1)
    stamp(im, ROCKS_SMALL, {"o": STONE[4], "l": STONE[0], "m": STONE[1], "d": STONE[2], "s": SHADE_KEY})
    return [im]


STUMP = ["................",
         "................",
         "................",
         "................",
         "................",
         "....oooooooo....",
         "...orrrRRrrro...",
         "...orRrrrrRro...",
         "...oorrRRrroo...",
         "...ObbBbbBbbO...",
         "...OBbbBbbbBO...",
         "...ObbBbbBbbO...",
         "..OObbBbbBbbOO..",
         ".OBO.OOOOOOO.OBO",
         "..ssssssssssss..",
         "................"]


def stump():
    """Cut tree stump: pale ringed top, bark sides, two roots and a contact shade (blocking)."""
    im = canvas(1, 1)
    stamp(im, STUMP, {"o": WOOD[2], "r": WOOD[0], "R": WOOD[1], "O": BARK[2], "b": BARK[0], "B": BARK[1],
                      "s": SHADE_KEY})
    return [im]


def log():
    """Fallen log (2x1): a bark cylinder lying east-west, a ringed cut end facing west, a moss patch
    on top and a contact shade (blocking)."""
    im = canvas(2, 1)
    p = im.load()
    contact_shade(im, 3, 30, 14)
    for x in range(6, 30):
        for y in range(5, 14):
            t = (y - 5) / 8
            c = BARK[0] if t < 0.3 else BARK[1] if t < 0.75 else BARK[2]
            if y == 5 or (x == 29 and 6 <= y <= 12):
                c = BARK[2]
            elif (x * 3 + y) % 9 == 0 and 6 < y < 12:
                c = BARK[2]                                  # bark furrows
            p[x, y] = c + (255,)
    stamp(im, ["..ooo..",
               ".orrro.",
               "orRRrro",
               "orRrRro",
               "orRRrro",
               "orrrrro",
               ".orrro.",
               "..ooo.."], {"o": WOOD[3], "r": WOOD[0], "R": WOOD[1]}, 2, 5)
    stamp(im, ["..mmm....mm.",
               ".mMmmm..mMm."], {"m": LEAF[2], "M": LEAF[1]}, 12, 4)
    return [im]


MUSHROOMS = ["................",
             "................",
             "................",
             "................",
             "................",
             "....ooo.........",
             "...orwro........",
             "..orrrrwo...ooo.",
             "..owrrrro..orrwo",
             "...oooooo..owrro",
             "....ccd.....oco.",
             "....ccd..oo..cd.",
             "....ccd.oBbo.cd.",
             "....cdd..cd..cd.",
             "...sssssssssss..",
             "................"]


def mushrooms():
    """Walkable cluster: two red caps with white spots and a small brown one, cream stems."""
    im = canvas(1, 1)
    stamp(im, MUSHROOMS, {"o": (120, 44, 52), "r": (214, 76, 72), "w": (246, 240, 230), "c": (240, 228, 200),
                          "d": (196, 176, 150), "B": (176, 128, 90), "b": (140, 96, 70), "s": GRASS[3]})
    return [im]


def reeds():
    """Tall reeds for a bank (blocking): green blades of different heights, three brown cattail
    heads and a dark root band."""
    im = canvas(1, 1)
    p = im.load()
    blades = ((2, 6, -1), (4, 2, 0), (6, 5, 1), (8, 1, 0), (10, 4, -1), (12, 3, 1), (13, 7, 0))
    for bx, top, lean in blades:
        for y in range(top, 14):
            x = bx + (lean if y < top + 3 else 0)
            p[x, y] = (LEAF[1] if y < top + 2 else LEAF[2] if y < 11 else LEAF[3]) + (255,)
            if y > top + 4 and x + 1 < 16:
                p[x + 1, y] = LEAF[3] + (255,)
    for hx, hy in ((4, 3), (8, 2), (12, 4)):
        for y in range(hy, hy + 4):
            p[hx, y] = (176, 112, 74, 255)
            p[hx + 1, y] = (130, 80, 60, 255)
        p[hx, hy - 1] = LEAF[2] + (255,)
    for x in range(2, 15):
        p[x, 14] = LEAF[4] + (255,)
    return [im]


def lily_pad():
    """Two floating lily pads (notched discs, lit top-left) and a small pink blossom: lay it on a
    water cell, it sits on the surface."""
    im = canvas(1, 1)
    stamp(im, ["................",
               "................",
               "..oooo..........",
               ".ollmmo.........",
               "olllmmmo...ooo..",
               "ollm.mmdo.ollmo.",
               "olm...mdo.olpPo.",
               ".ommmmdo..oPpPdo",
               "..odddo...ommmdo",
               "...ooo.....oooo.",
               "........ooooo...",
               ".......ollmmmo..",
               "......ollm.mmdo.",
               "......olm..mmdo.",
               ".......ommmmdo..",
               "........ooooo..."],
          {"o": (34, 92, 70), "l": LEAF[1], "m": LEAF[2], "d": LEAF[3], "p": (250, 190, 206), "P": (226, 128, 160)})
    return [im]


def bush_flower():
    """Flowering shrub: the bush shape dotted with pink and white blossoms."""
    im = canvas(1, 1)
    contact_shade(im, 2, 14, 14)
    draw_blobs(im, [(8, 9, 7, 5.5), (4.5, 10, 4, 4), (11.5, 10, 4, 4), (8, 5.5, 5, 4)], HEDGE, FOLIAGE_OUT, speck=52)
    p = im.load()
    for x, y in ((5, 5), (10, 4), (12, 8), (3, 9), (8, 9), (6, 12), (11, 12)):
        p[x, y] = (250, 214, 226, 255)
        p[x + 1, y] = (232, 140, 170, 255)
        p[x, y + 1] = (232, 140, 170, 255)
    return [im]


def bush_wide():
    """Wide low shrub (2x1): five leaf lobes in a row, so two-cell gaps close without a hedge."""
    im = canvas(2, 1)
    contact_shade(im, 2, 30, 14)
    draw_blobs(im, [(16, 9, 14, 5), (6, 9.5, 5, 4.5), (13, 6.5, 5.5, 4.5), (21, 6, 5.5, 4.5), (26.5, 9.5, 4.5, 4.5)],
               HEDGE, FOLIAGE_OUT, speck=58)
    return [im]


def pine_tree():
    """Standalone 2x2 pine: the same drawing as `pine-wall` on a transparent canvas."""
    from terrain import emerald_pine
    im = emerald_pine(canvas(2, 2), lawn=False)
    contact_shade(im, 7, 25, 30)
    return [im]


YOUNG = [(208, 234, 140), (162, 210, 106), (118, 176, 86), (78, 136, 72), (44, 96, 62)]   # young tree, yellow-green


def tree_small():
    """Young round tree (1x2): a light yellow-green crown on a slim pale trunk; lighter and smaller
    than `tree`, so groves mix two sizes."""
    im = canvas(1, 2)
    contact_shade(im, 3, 13, 30)
    d = ImageDraw.Draw(im)
    d.rectangle([7, 18, 8, 29], fill=BARK[1] + (255,))
    d.point([(7, 20), (7, 24), (7, 27)], fill=BARK[0] + (255,))
    d.point([(8, 22), (8, 26)], fill=BARK[2] + (255,))
    lobes = [(8, 11, 7, 7.5), (4.5, 14, 3.8, 3.6), (11.5, 14, 3.8, 3.6), (8, 5.5, 5, 4)]
    draw_blobs(im, lobes, YOUNG, YOUNG[4], speck=44)
    p = im.load()
    for x, y in ((5, 6), (6, 5), (4, 10), (9, 8)):
        if p[x, y][3]:
            p[x, y] = YOUNG[0] + (255,)
    return [im]


# ---------------------------------------------------------------- town detail
def well():
    """Village well (2x2): round stone ring with dark water, two posts and a little shingled roof
    with a hanging bucket (blocking)."""
    im = canvas(2, 2)
    contact_shade(im, 3, 29, 30)
    d = ImageDraw.Draw(im)
    d.ellipse([4, 15, 27, 29], fill=STONE[2] + (255,), outline=STONE[4] + (255,))
    d.rectangle([4, 21, 27, 25], fill=STONE[2] + (255,))
    for x in range(5, 27, 4):                                  # stone blocks on the front of the ring
        d.line([x, 23, x, 27], fill=STONE[3] + (255,))
    d.line([5, 22, 26, 22], fill=STONE[1] + (255,))
    d.ellipse([7, 15, 24, 23], fill=STONE[1] + (255,), outline=STONE[4] + (255,))
    d.ellipse([9, 16, 22, 22], fill=(40, 70, 120, 255))
    d.line([11, 18, 14, 18], fill=(90, 150, 210, 255))
    for x in (6, 24):                                          # posts
        d.rectangle([x, 6, x + 1, 22], fill=WOOD[2] + (255,))
        d.line([x, 6, x, 22], fill=WOOD[1] + (255,))
    d.polygon([(3, 8), (16, 1), (28, 8), (26, 10), (5, 10)], fill=(186, 84, 72, 255), outline=(108, 46, 50, 255))
    d.line([6, 8, 16, 3], fill=(226, 128, 104, 255))
    d.line([8, 8, 24, 8], fill=(140, 58, 58, 255))
    d.line([16, 10, 16, 13], fill=WOOD[3] + (255,))            # rope and bucket
    d.rectangle([14, 13, 18, 16], fill=WOOD[1] + (255,), outline=WOOD[3] + (255,))
    return [im]


CRATE = ["................",
         "................",
         "..oooooooooooo..",
         "..oLLLLLLLLLLo..",
         "..oLmmmmmmmmdo..",
         "..ommdmmmmdmdo..",
         "..ommmdmmdmmdo..",
         "..oLLLLLLLLLLo..",
         "..ommmmdmmmmdo..",
         "..ommmdmdmmmdo..",
         "..ommdmmmdmmdo..",
         "..omdmmmmmdmdo..",
         "..oddddddddddo..",
         "..oooooooooooo..",
         "...ssssssssss...",
         "................"]


def crates():
    """Wooden crate with a plank cross-brace and lit top edge (blocking)."""
    im = canvas(1, 1)
    stamp(im, CRATE, {"o": WOOD[3], "L": WOOD[0], "m": WOOD[1], "d": WOOD[2], "s": SHADE_KEY})
    return [im]


BARREL = ["................",
          "................",
          ".....oooooo.....",
          "....oLLLLLLo....",
          "...oLdddddddo...",
          "...ommmmmmmdo...",
          "...oiiiiiiiio...",
          "...oLmmmmmmdo...",
          "...oLmmmmmmdo...",
          "...oLmmmmmmdo...",
          "...oiiiiiiiio...",
          "...oLmmmmmmdo...",
          "....ommmmmdo....",
          ".....oooooo.....",
          "....ssssssss....",
          "................"]


def barrel():
    """Wooden barrel with two iron hoops and a lit lid rim (blocking)."""
    im = canvas(1, 1)
    stamp(im, BARREL, {"o": WOOD[3], "L": WOOD[0], "m": WOOD[1], "d": WOOD[2], "i": (98, 96, 112),
                       "s": SHADE_KEY})
    return [im]


def flower_bed():
    """Flower bed (2x1): a low timber border round dark soil planted with red, yellow and white
    blossoms on leafy clumps."""
    im = canvas(2, 1)
    contact_shade(im, 1, 31, 14)
    d = ImageDraw.Draw(im)
    d.rectangle([1, 5, 30, 13], fill=WOOD[1] + (255,), outline=WOOD[3] + (255,))
    d.line([2, 6, 29, 6], fill=WOOD[0] + (255,))
    d.rectangle([3, 7, 28, 11], fill=(120, 84, 66, 255))
    p = im.load()
    cols = [PETAL, [(255, 238, 156), (242, 204, 80), (206, 150, 56)], [(255, 255, 250), (230, 232, 236), (184, 190, 210)]]
    for k, x in enumerate(range(4, 28, 4)):
        y = 5 if k % 2 else 4
        for dx, dy in ((0, 3), (1, 3), (2, 3), (0, 4), (1, 4), (2, 4), (1, 5)):
            p[x + dx, y + dy] = (LEAF[2] if dy > 3 else LEAF[1]) + (255,)
        c = cols[k % 3]
        for dx, dy, i in ((1, 0, 0), (0, 1, 1), (1, 1, 0), (2, 1, 1), (1, 2, 2)):
            p[x + dx, y + dy] = c[i] + (255,)
    return [im]


def signpost():
    """Signpost: one post with two blank arrow boards pointing different ways (no text)."""
    im = canvas(1, 1)
    contact_shade(im, 5, 11, 14)
    stamp(im, ["................",
               ".......oo.......",
               "..ooooooooooo...",
               "..oLLLLLLLLLLo..",
               "..ommmmmmmmmmdo.",
               "..oddddddddddo..",
               "..ooooooooooo...",
               "...ooooooooooo..",
               "..oLLLLLLLLLLo..",
               ".odmmmmmmmmmmo..",
               "..oddddddddddo..",
               "...ooooooooooo..",
               ".......Pp.......",
               ".......Pp.......",
               ".......Pp.......",
               "................"],
          {"o": WOOD[3], "L": WOOD[0], "m": WOOD[1], "d": WOOD[2], "P": WOOD[2], "p": WOOD[3]})
    return [im]


# ---------------------------------------------------------------- District gate checkpoint (decisions.md §26)
BOOM_RED = [(236, 112, 100), (214, 84, 76), (150, 52, 56)]
BOOM_WHITE = [(250, 250, 246), (222, 224, 230), (176, 180, 198)]
BOOM_OUT = (62, 40, 58)


def _boom(vertical):
    """One cell of the striped boom arm, seen from above: a 4 px bar with diagonal red / white bands, lit on the
    top-left edge, its opaque contact shade 2 px below (right of a vertical arm)."""
    im = canvas(1, 1)
    p = im.load()
    for a in range(16):
        for b in range(4):
            band = ((a + b) // 4) % 2
            ramp = BOOM_RED if band else BOOM_WHITE
            tone = ramp[0] if b == 0 else ramp[2] if b == 3 else ramp[1]
            x, y = (6 + b, a) if vertical else (a, 6 + b)
            p[x, y] = tone + (255,)
        if vertical:
            p[5, a] = BOOM_OUT + (255,)
            p[10, a] = BOOM_OUT + (255,)
            p[12, a] = SHADE_KEY + (255,)
        else:
            p[a, 5] = BOOM_OUT + (255,)
            p[a, 10] = BOOM_OUT + (255,)
            p[a, 12] = SHADE_KEY + (255,)
    return im


def checkpoint_arm():
    """District gate boom arm (1x1, east-west): tile it across a north / south seam."""
    return [_boom(False)]


def checkpoint_arm_v():
    """District gate boom arm (1x1, north-south): tile it along an east / west seam."""
    return [_boom(True)]


def checkpoint_post():
    """District gate post (1x2): a concrete footing, a yellow-and-navy striped pole, the grey hinge box the boom arm
    hangs from and a signal lamp on top. Frame 0 = lamp red (closed), frame 1 = lamp green (passed)."""
    frames = []
    for lamp in ([(255, 150, 130), (232, 72, 72), (150, 40, 52)], [(196, 255, 170), (96, 210, 110), (40, 130, 80)]):
        im = canvas(1, 2)
        d = ImageDraw.Draw(im)
        contact_shade(im, 2, 14, 30)
        d.rectangle([4, 27, 11, 29], fill=STONE[2] + (255,), outline=STONE[4] + (255,))
        p = im.load()
        for y in range(8, 27):
            c = (246, 206, 74) if (y // 3) % 2 == 0 else (44, 48, 76)
            for x in (6, 7, 8, 9):
                p[x, y] = (c if x < 9 else tuple(max(0, v - 40) for v in c)) + (255,)
        # the hinge box sits at the arm's height: the arm cell is the post's bottom cell, bar on its rows 6-9
        d.rectangle([3, 20, 12, 26], fill=STONE[2] + (255,), outline=STONE[4] + (255,))
        d.line([4, 21, 11, 21], fill=STONE[0] + (255,))
        d.rectangle([5, 23, 10, 24], fill=STONE[3] + (255,))
        d.rectangle([5, 2, 10, 7], fill=lamp[1] + (255,), outline=BOOM_OUT + (255,))
        d.rectangle([6, 3, 7, 4], fill=lamp[0] + (255,))
        d.line([6, 6, 9, 6], fill=lamp[2] + (255,))
        d.line([4, 8, 11, 8], fill=BOOM_OUT + (255,))
        frames.append(im)
    return frames


PROPS = {
    "checkpoint-post": dict(cells=(1, 2), paint=checkpoint_post, order=[0, 1]),
    "checkpoint-arm": dict(cells=(1, 1), paint=checkpoint_arm),
    "checkpoint-arm-v": dict(cells=(1, 1), paint=checkpoint_arm_v),
    "tree": dict(cells=(2, 2), paint=tree),
    "palm-tree": dict(cells=(2, 2), paint=palm_tree),
    "berry-tree": dict(cells=(1, 2), paint=berry_tree),
    "bench": dict(cells=(2, 1), paint=bench),
    "planter": dict(cells=(1, 1), paint=planter),
    "bush": dict(cells=(1, 1), paint=bush),
    "cut-tree": dict(cells=(1, 1), paint=cut_tree),
    "flowers": dict(cells=(1, 1), paint=flowers, order=[0, 1, 0, 2], walk=True),
    "flowers-yellow": dict(cells=(1, 1), paint=flowers_yellow, order=[0, 1, 0, 2], walk=True),
    "flowers-white": dict(cells=(1, 1), paint=flowers_white, order=[0, 1, 0, 2], walk=True),
    "flowers-blue": dict(cells=(1, 1), paint=flowers_blue, order=[0, 1, 0, 2], walk=True),
    "tuft": dict(cells=(1, 1), paint=tuft, walk=True),
    "fern": dict(cells=(1, 1), paint=fern, walk=True),
    "pebbles": dict(cells=(1, 1), paint=pebbles, walk=True),
    "rocks-small": dict(cells=(1, 1), paint=rocks_small),
    "stump": dict(cells=(1, 1), paint=stump),
    "log": dict(cells=(2, 1), paint=log),
    "mushrooms": dict(cells=(1, 1), paint=mushrooms, walk=True),
    "reeds": dict(cells=(1, 1), paint=reeds, bank=True),
    "lily-pad": dict(cells=(1, 1), paint=lily_pad, walk=True, water=True),
    "bush-flower": dict(cells=(1, 1), paint=bush_flower),
    "bush-wide": dict(cells=(2, 1), paint=bush_wide),
    "pine-tree": dict(cells=(2, 2), paint=pine_tree),
    "tree-small": dict(cells=(1, 2), paint=tree_small),
    "well": dict(cells=(2, 2), paint=well),
    "crates": dict(cells=(1, 1), paint=crates),
    "barrel": dict(cells=(1, 1), paint=barrel),
    "flower-bed": dict(cells=(2, 1), paint=flower_bed),
    "signpost": dict(cells=(1, 1), paint=signpost),
    "rock": dict(cells=(1, 1), paint=rock),
    "smash-rock": dict(cells=(1, 1), paint=smash_rock),
    "rock-big": dict(cells=(2, 2), paint=rock_big),
    "fence": dict(cells=(1, 1), paint=fence, kind="cross"),
    "sign": dict(cells=(1, 1), paint=sign),
    "mailbox": dict(cells=(1, 1), paint=mailbox),
    "item-ball": dict(cells=(1, 1), paint=item_ball, emissive=[SHINE]),
    "street-lamp": dict(cells=(1, 2), paint=street_lamp, emissive=[BULB, BULB2], lamp=True),
    "cave-mouth": dict(cells=(2, 2), paint=cave_mouth, emissive=[(18, 14, 24)]),
}
