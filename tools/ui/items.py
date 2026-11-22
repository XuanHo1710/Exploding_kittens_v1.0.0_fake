"""Item icons, 24x24 (the Gen 3 bag-icon size), drawn part by part: every part has a 4-tone ramp
(light, mid, dark, outline) and is outlined in its own darkest tone; light comes from the top-left,
with a hand-placed white glint. Original drawings in the Pokémon item-icon style."""
from PIL import Image, ImageDraw

import uikit as U

S = 24
INK = (40, 36, 58)


def R(light, mid, dark, line=None):
    return [light, mid, dark, line or U.shade(dark, .55)]


RED = R((248, 120, 104), (222, 56, 56), (156, 32, 48))
WHITE = R((255, 255, 255), (232, 232, 240), (180, 180, 200), (96, 96, 120))
BLUE = R((120, 176, 248), (56, 112, 216), (32, 64, 152))
GREY = R((230, 230, 236), (186, 186, 200), (130, 130, 150), (70, 70, 90))
PURPLE = R((224, 150, 236), (176, 88, 200), (112, 48, 140))
ORANGE = R((255, 196, 112), (244, 136, 48), (180, 84, 32))
YELLOW = R((255, 246, 168), (248, 214, 64), (200, 150, 32))
GREEN = R((168, 232, 120), (88, 184, 80), (40, 120, 64))
BERRY = R((150, 140, 248), (96, 80, 216), (56, 40, 150))
ROPE = R((240, 204, 150), (204, 150, 92), (146, 96, 56))
TEAL = R((170, 240, 226), (80, 196, 186), (40, 128, 140))
BRASS = R((255, 236, 150), (226, 180, 64), (160, 116, 40))
PAPER = R((255, 248, 226), (238, 222, 184), (196, 170, 128))


class _Mask:
    """ImageDraw on a mask whose shapes fill with 255 unless told otherwise (fill=0 cuts a hole)."""

    def __init__(self, m):
        self.d = ImageDraw.Draw(m)

    def __getattr__(self, name):
        fn = getattr(self.d, name)

        def call(*a, **k):
            k.setdefault("fill", 255)
            return fn(*a, **k)
        return call


def part(img, draw_fn, ramp, gloss=True):
    """Draw a part's mask with draw_fn(mask-draw) and paint it with a diagonal light ramp + outline."""
    m = Image.new("L", (S, S), 0)
    draw_fn(_Mask(m))
    mp = m.load()
    bb = m.getbbox()
    if not bb:
        return m
    x0, y0, x1, y1 = bb
    for y in range(S):
        for x in range(S):
            if not mp[x, y]:
                continue
            if any(not (0 <= x + dx < S and 0 <= y + dy < S) or not mp[x + dx, y + dy]
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                c = ramp[3]
            else:
                t = ((x - x0) / max(1, x1 - x0) + (y - y0) / max(1, y1 - y0)) / 2
                c = ramp[0] if t < .3 and gloss else ramp[1] if t < .68 else ramp[2]
            img.putpixel((x, y), c + (255,))
    return m


def px(img, pts, c):
    for p in pts:
        img.putpixel(p, c + (255,))


def ball(img, top, accent=None):
    part(img, lambda d: d.ellipse([1, 1, 22, 22]), WHITE)
    part(img, lambda d: (d.ellipse([1, 1, 22, 22]), d.rectangle([0, 11, 23, 23], fill=0)), top)
    if accent:
        part(img, lambda d: d.polygon([(4, 6), (8, 3), (9, 8)]), accent, gloss=False)
        part(img, lambda d: d.polygon([(19, 6), (15, 3), (14, 8)]), accent, gloss=False)
    d = ImageDraw.Draw(img)
    d.line([2, 11, 21, 11], fill=INK)
    d.line([2, 12, 21, 12], fill=INK)
    d.ellipse([8, 8, 15, 15], fill=INK)
    d.ellipse([9, 9, 14, 14], fill=(255, 255, 255))
    d.ellipse([10, 10, 13, 13], fill=(200, 200, 216))
    px(img, [(6, 4), (7, 4), (5, 5), (6, 5)], (255, 255, 255))


def bottle(img, body, label, mark):
    part(img, lambda d: d.rectangle([8, 1, 15, 5]), GREY)                  # spray cap
    part(img, lambda d: d.rectangle([15, 2, 19, 4]), GREY, gloss=False)    # nozzle
    part(img, lambda d: d.rectangle([9, 5, 14, 7]), WHITE, gloss=False)    # collar
    part(img, lambda d: d.rounded_rectangle([4, 7, 19, 22], 3), body)      # bottle
    part(img, lambda d: d.rectangle([6, 12, 17, 17]), label, gloss=False)   # label
    mark(ImageDraw.Draw(img))
    px(img, [(6, 9), (6, 10), (7, 9)], (255, 255, 255))                    # glint


def potion(img):
    bottle(img, PURPLE, WHITE, lambda d: (d.line([11, 13, 11, 16], fill=PURPLE[2]), d.line([10, 14, 13, 14], fill=PURPLE[2]),
                                          d.line([10, 15, 13, 15], fill=PURPLE[2])))


def super_potion(img):
    bottle(img, ORANGE, YELLOW, lambda d: (d.polygon([(11, 13), (13, 15), (11, 17), (9, 15)], fill=ORANGE[2]),))


def antidote(img):
    bottle(img, GREEN, WHITE, lambda d: (d.ellipse([9, 13, 14, 16], fill=GREEN[1], outline=GREEN[2]),
                                         d.line([11, 13, 13, 15], fill=GREEN[3])))


def revive(img):
    part(img, lambda d: d.polygon([(11, 1), (21, 11), (11, 22), (2, 11)]), YELLOW)
    d = ImageDraw.Draw(img)
    d.line([11, 4, 11, 19], fill=YELLOW[2])
    d.line([5, 11, 18, 11], fill=YELLOW[2])
    d.polygon([(11, 4), (15, 11), (11, 11)], fill=YELLOW[0])
    px(img, [(7, 7), (8, 6), (8, 8), (9, 7), (8, 7)], (255, 255, 255))


def berry(img):
    part(img, lambda d: d.ellipse([3, 6, 21, 23]), BERRY)
    part(img, lambda d: d.polygon([(11, 6), (13, 1), (20, 2), (16, 6)]), GREEN, gloss=False)
    d = ImageDraw.Draw(img)
    d.line([12, 6, 12, 3], fill=GREEN[3])
    for p in ((8, 12), (14, 10), (16, 16), (10, 18)):
        d.point(p, fill=BERRY[0])
    px(img, [(7, 9), (8, 9), (7, 10)], (255, 255, 255))


def escape_rope(img):
    m = part(img, lambda d: (d.ellipse([1, 4, 22, 21]), d.ellipse([7, 9, 16, 16], fill=0)), ROPE)
    mp = m.load()
    for k in range(3, 26, 3):                                               # twist of the strands, inside the coil
        for t in range(18):
            x, y = k - t * 3 // 17, 4 + t
            if 0 <= x < S and mp[x, y] and img.getpixel((x, y))[:3] != ROPE[3]:
                img.putpixel((x, y), ROPE[2] + (255,))
    part(img, lambda d2: d2.rectangle([18, 15, 21, 23]), ROPE, gloss=False)     # loose end


def repel(img):
    part(img, lambda d: d.rounded_rectangle([5, 5, 18, 23], 2), GREY)
    part(img, lambda d: d.rectangle([7, 1, 16, 5]), RED)
    part(img, lambda d: d.rectangle([5, 11, 18, 17]), RED, gloss=False)
    d = ImageDraw.Draw(img)
    d.polygon([(11, 12), (14, 14), (11, 16), (8, 14)], fill=(255, 255, 255))
    px(img, [(7, 7), (7, 8), (7, 9)], (255, 255, 255))


def tm(img):
    part(img, lambda d: (d.ellipse([1, 1, 22, 22]), d.ellipse([9, 9, 14, 14], fill=0)), TEAL)
    d = ImageDraw.Draw(img)
    d.arc([4, 4, 19, 19], 200, 290, fill=TEAL[0])
    d.ellipse([9, 9, 14, 14], outline=TEAL[3])
    px(img, [(6, 6), (7, 5), (5, 7)], (255, 255, 255))


def key(img):
    part(img, lambda d: (d.ellipse([1, 4, 11, 14]), d.ellipse([4, 7, 8, 11], fill=0)), BRASS)
    part(img, lambda d: d.rectangle([10, 8, 22, 11]), BRASS)
    part(img, lambda d: d.rectangle([16, 11, 18, 15]), BRASS, gloss=False)
    part(img, lambda d: d.rectangle([20, 11, 22, 14]), BRASS, gloss=False)
    px(img, [(3, 6), (4, 5)], (255, 255, 255))


def map_icon(img):
    part(img, lambda d: d.polygon([(1, 4), (7, 1), (16, 4), (22, 1), (22, 19), (16, 22), (7, 19), (1, 22)]), PAPER)
    d = ImageDraw.Draw(img)
    d.line([7, 2, 7, 19], fill=PAPER[2])
    d.line([16, 4, 16, 21], fill=PAPER[2])
    d.polygon([(3, 9), (8, 6), (13, 9), (12, 15), (5, 15)], fill=GREEN[1], outline=GREEN[2])
    d.polygon([(14, 12), (20, 10), (20, 17), (15, 18)], fill=BLUE[0], outline=BLUE[1])
    d.ellipse([9, 9, 12, 12], fill=RED[1], outline=RED[3])


def _rod(img, shaft, reel=None, bobber_top=RED, bobber_bot=WHITE, glint_col=(255, 255, 255)):
    """Diagonal fishing rod (24x24): handle bottom-left, arched tip top-right, hanging line + bobber."""
    part(img, lambda d: d.polygon([(2, 20), (5, 22), (10, 16), (7, 14)]), ROPE if reel is None else GREY, gloss=False)
    part(img, lambda d: d.polygon([(7, 15), (9, 17), (20, 4), (18, 2)]), shaft)
    if reel is not None:
        part(img, lambda d: d.ellipse([6, 15, 13, 21]), reel)
        px(img, [(9, 17), (10, 17)], glint_col)
    d = ImageDraw.Draw(img)
    d.line([(19, 4), (20, 7), (19, 11), (18, 14)], fill=WHITE[2])
    part(img, lambda dr: dr.ellipse([14, 13, 21, 20]), bobber_bot)
    part(img, lambda dr: (dr.ellipse([14, 13, 21, 20]), dr.rectangle([13, 17, 22, 21], fill=0)), bobber_top)
    d.line([15, 16, 20, 16], fill=INK)
    px(img, [(16, 14), (17, 14)], glint_col)


def old_rod(img):
    _rod(img, ROPE, reel=None, bobber_top=ORANGE, bobber_bot=PAPER)


def good_rod(img):
    _rod(img, BLUE, reel=GREY, bobber_top=RED, bobber_bot=WHITE)


def super_rod(img):
    _rod(img, RED, reel=BRASS, bobber_top=YELLOW, bobber_bot=RED)


DRAW = {"ball": lambda i: ball(i, RED), "great-ball": lambda i: ball(i, BLUE, RED), "potion": potion,
        "super-potion": super_potion, "antidote": antidote, "revive": revive, "berry": berry,
        "escape-rope": escape_rope, "repel": repel, "tm": tm, "key": key, "map": map_icon,
        "old-rod": old_rod, "good-rod": good_rod, "super-rod": super_rod}


def item(slug):
    img = U.canvas(S, S)
    DRAW[slug](img)
    return U.finish(img)
