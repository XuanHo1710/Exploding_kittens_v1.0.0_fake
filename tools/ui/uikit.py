"""
uikit: the Mons UI visual language (decided 2026-11-18, see docs/agents/decisions.md §10).

  - 45-degree chamfered windows (the same corner rule as the Mons buildings), navy ink outline,
    an accent frame that follows the District the Player stands in, cream paper fill.
  - speaker tabs, icon cards for the Start menu (the selected card slides out), slanted battle
    HUD panels with a type-coloured edge, 12-segment HP, hexagon level badges.
  - Gen 3 pixel rules: BGR555 colours (gen3.snap), alpha 0 or 255, native pixels scaled by integers.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "gen3"))  # tools/gen3: shared Gen 3 pass

from PIL import Image, ImageDraw  # noqa: E402

import gen3  # noqa: E402
import monsfont as F  # noqa: E402

# ---------------------------------------------------------------- screens
SCREENS = {"pc": (320, 180, 6), "phone": (390, 180, 6)}   # native w, h, scale to 1080 px

# ---------------------------------------------------------------- palette
INK, INK2 = (28, 30, 58), (58, 62, 104)
CREAM, CREAM_D = (252, 246, 228), (232, 220, 194)
WHITE = (255, 255, 255)
TEXT, TEXT_SH = (72, 72, 88), (208, 208, 216)
MALE, MALE_SH, FEMALE, FEMALE_SH = (64, 128, 232), (176, 208, 248), (232, 80, 104), (248, 184, 192)
HP = {"high": (88, 200, 120), "mid": (240, 196, 48), "low": (232, 72, 64), "empty": (84, 88, 120)}
EXP = (96, 200, 248)

# District accents: light, mid, dark, each taken from that gym's ramps (tools/structures/gyms/<type>.py)
ACCENT = {
    "start": [(150, 230, 212), (56, 152, 160), (36, 72, 96)],        # ground TURQ
    "fire": [(246, 110, 88), (222, 64, 62), (136, 26, 52)],          # fire CRIM
    "water": [(120, 200, 255), (40, 120, 210), (24, 56, 120)],       # water SEA
    "grass": [(178, 230, 116), (72, 162, 74), (30, 84, 58)],         # grass LEAF
    "electric": [(255, 242, 130), (226, 168, 34), (116, 74, 40)],    # electric YEL
    "rock": [(236, 156, 96), (160, 76, 52), (78, 34, 42)],           # rock RUST
    "ground": [(242, 152, 98), (186, 86, 58), (98, 42, 46)],         # ground TERRA
    "poison": [(206, 146, 236), (134, 72, 184), (66, 36, 102)],      # poison ACC
    "psychic": [(240, 156, 218), (172, 72, 168), (84, 34, 102)],     # psychic PLUM
}

TYPES = [  # slug, Vietnamese label, colour
    ("normal", "THƯỜNG", (168, 168, 120)), ("fire", "LỬA", (240, 128, 48)), ("water", "NƯỚC", (104, 144, 240)),
    ("grass", "CỎ", (120, 200, 80)), ("electric", "ĐIỆN", (248, 208, 48)), ("ice", "BĂNG", (152, 216, 216)),
    ("fighting", "GIÁC ĐẤU", (192, 48, 40)), ("poison", "ĐỘC", (160, 64, 160)), ("ground", "ĐẤT", (224, 192, 104)),
    ("flying", "BAY", (168, 144, 240)), ("psychic", "SIÊU LINH", (248, 88, 136)), ("bug", "BỌ", (168, 184, 32)),
    ("rock", "ĐÁ", (184, 160, 56)), ("ghost", "MA", (112, 88, 152)), ("dragon", "RỒNG", (112, 56, 248)),
    ("dark", "BÓNG TỐI", (112, 88, 72)), ("steel", "THÉP", (184, 184, 208)), ("fairy", "TIÊN", (238, 153, 172)),
]
TYPE_COLOUR = {s: c for s, _, c in TYPES}

START_MENU = [("dex", "MONDEX"), ("nav", "POKÉNAV"), ("party", "ĐỘI HÌNH"), ("bag", "TÚI ĐỒ"), ("card", "HUY HIỆU"),
              ("gear", "CÀI ĐẶT"), ("exit", "THOÁT")]          # no SAVE entry (decision 2026-11-18)
BATTLE_MENU = [("sword", "ĐÁNH"), ("bag", "TÚI"), ("party", "ĐỘI"), ("run", "CHẠY")]


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)


def canvas(w, h):
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def finish(img):
    """Gen 3 pass: BGR555 colours, alpha 0/255 (no tile-colour limit: UI is not a BG tileset)."""
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            p = px[x, y]
            px[x, y] = (gen3.snap(p) + (255,)) if p[3] >= 128 else (0, 0, 0, 0)
    return img


# ---------------------------------------------------------------- primitives
def chamfer(d, x0, y0, x1, y1, c, k):
    k = max(0, k)
    d.polygon([(x0 + k, y0), (x1 - k, y0), (x1, y0 + k), (x1, y1 - k), (x1 - k, y1), (x0 + k, y1),
               (x0, y1 - k), (x0, y0 + k)], fill=c)


WIN_SLICE = 8     # 9-slice margin of a window (px, native)


def window(img, x, y, w, h, acc, fill=CREAM, k=4, rule=True):
    d = ImageDraw.Draw(img)
    x1, y1 = x + w - 1, y + h - 1
    chamfer(d, x, y, x1, y1, INK, k)
    chamfer(d, x + 1, y + 1, x1 - 1, y1 - 1, acc[1], k - 1)
    chamfer(d, x + 3, y + 3, x1 - 3, y1 - 3, INK, k - 2)
    chamfer(d, x + 4, y + 4, x1 - 4, y1 - 4, fill, k - 3)
    d.line([(x + k, y + 1), (x1 - k, y + 1)], fill=acc[0])
    if rule:
        d.line([(x + 6, y + h - 7), (x1 - 6, y + h - 7)], fill=CREAM_D)


def card(img, x, y, w, h, acc, selected=False, k=3):
    d = ImageDraw.Draw(img)
    chamfer(d, x, y, x + w - 1, y + h - 1, INK, k)
    chamfer(d, x + 1, y + 1, x + w - 2, y + h - 2, acc[1] if selected else CREAM, k - 1)


def tab(img, x, y, text, acc, w=None):
    d = ImageDraw.Draw(img)
    w = w or F.width(text) + 12
    d.polygon([(x, y + 11), (x + 4, y), (x + w, y), (x + w + 4, y + 11)], fill=INK)
    d.polygon([(x + 2, y + 10), (x + 5, y + 1), (x + w - 1, y + 1), (x + w + 2, y + 10)], fill=acc[1])
    if text:
        F.draw(img, x + 7, y + 3, text, ink=WHITE, shadow=acc[2])
    return w + 5


def hexa(img, x, y, text, acc, w=None):
    d = ImageDraw.Draw(img)
    w = w or F.width(text) + 8
    d.polygon([(x, y + 6), (x + 4, y), (x + w, y), (x + w + 4, y + 6), (x + w, y + 12), (x + 4, y + 12)], fill=INK)
    d.polygon([(x + 2, y + 6), (x + 5, y + 1), (x + w - 1, y + 1), (x + w + 2, y + 6), (x + w - 1, y + 11),
               (x + 5, y + 11)], fill=acc[0])
    if text:
        F.draw(img, x + 5, y + 3, text, ink=INK, shadow=acc[0])
    return w + 5


HP_SEGS, HP_SEG_W = 12, 4


def hp_bar(img, x, y, frac, segs=HP_SEGS):
    d = ImageDraw.Draw(img)
    state = "high" if frac > .5 else "mid" if frac > .2 else "low"
    on = max(1 if frac > 0 else 0, round(segs * frac))
    d.rectangle([x, y, x + segs * HP_SEG_W + 1, y + 5], fill=INK)
    for i in range(segs):
        hp_cell(img, x + 1 + i * HP_SEG_W, y + 1, state if i < on else "empty")


def hp_cell(img, x, y, state):
    d = ImageDraw.Draw(img)
    c = HP[state]
    d.rectangle([x, y, x + 2, y + 3], fill=c)
    if state != "empty":
        d.line([x, y, x + 2, y], fill=shade(c, 1.25))
        d.line([x, y + 3, x + 2, y + 3], fill=shade(c, .8))


def slant(img, x, y, w, h, edge, flip=False):
    """Battle HUD panel: a parallelogram, cream body, `edge`-coloured bottom rule (the Pokémon's type)."""
    d = ImageDraw.Draw(img)
    s = h // 2
    pts = ([(x + s, y), (x + w - 1, y), (x + w - 1 - s, y + h - 1), (x, y + h - 1)] if not flip else
           [(x, y), (x + w - 1 - s, y), (x + w - 1, y + h - 1), (x + s, y + h - 1)])
    d.polygon(pts, fill=INK)
    inner = [(px + (1 if i in (0, 3) else -1), py + (1 if i < 2 else -1)) for i, (px, py) in enumerate(pts)]
    d.polygon(inner, fill=CREAM)
    lo = min(p[0] for p in pts[2:]) + 2
    hi = max(p[0] for p in pts[2:]) - 2
    d.line([(lo, y + h - 3), (hi, y + h - 3)], fill=edge)
    d.line([(lo, y + h - 2), (hi, y + h - 2)], fill=shade(edge, .7))


ICONS = {   # 9x9 glyph icons, drawn in one colour
    "dex": [".#######.", "#..###..#", "#.#...#.#", "#.#...#.#", "#..###..#", "#.......#", "#.#####.#", "#.......#", ".#######."],
    "party": ["..##.##..", ".#..#..#.", ".#..#..#.", "..##.##..", ".........", ".##...##.", "#..#.#..#", "#..#.#..#", ".##...##."],
    "bag": ["...###...", "..#...#..", ".#######.", "#.......#", "#..###..#", "#..#.#..#", "#..###..#", "#.......#", ".#######."],
    "card": ["#########", "#.......#", "#.##.##.#", "#.##....#", "#....##.#", "#.##....#", "#.......#", "#########", "........."],
    "gear": ["...#.#...", ".#.###.#.", "..#...#..", "##.#.#.##", ".#.###.#.", "##.#.#.##", "..#...#..", ".#.###.#.", "...#.#..."],
    "exit": ["####.....", "#..#.....", "#..#..#..", "#..#####.", "#..#..#..", "#..#.....", "####.....", ".........", "........."],
    "sword": [".......##", "......###", ".....###.", "#...###..", ".#.###...", "..###....", ".##.#....", "##...#...", "#........"],
    "run": ["....##...", "....##...", "..####...", ".#.##.#..", "...##....", "..#..#...", ".#....#..", "#.....##.", "........."],
    "nav": [".#######.", "#.......#", "#.#####.#", "#.#...#.#", "#.#.#.#.#", "#.#...#.#", "#.#####.#", "#...#...#", ".#######."],
}


def icon(img, x, y, name, col):
    for j, row in enumerate(ICONS[name]):
        for i, c in enumerate(row):
            if c == "#":
                img.putpixel((x + i, y + j), col + (255,))


def menu_card(img, x, y, w, ic, label, acc, selected=False):
    card(img, x, y, w, 14, acc, selected)
    icon(img, x + 4, y + 2, ic, WHITE if selected else acc[2])
    F.draw(img, x + 17, y + 4, label, ink=WHITE if selected else INK, shadow=acc[2] if selected else CREAM_D)


def command(img, x, y, w, h, ic, label, acc, selected=False, stacked=False):
    d = ImageDraw.Draw(img)
    chamfer(d, x, y, x + w - 1, y + h - 1, INK, 5 if h < 30 else 6)
    chamfer(d, x + 1, y + 1, x + w - 2, y + h - 2, acc[1] if selected else CREAM, 4 if h < 30 else 5)
    ink, sh = (WHITE, acc[2]) if selected else (INK, CREAM_D)
    if stacked:
        icon(img, x + w // 2 - 4, y + 10, ic, WHITE if selected else acc[2])
        F.draw(img, x + w // 2 - F.width(label) // 2, y + h - 17, label, ink=ink, shadow=sh)
    else:
        icon(img, x + 7, y + (h - 9) // 2, ic, WHITE if selected else acc[2])
        F.draw(img, x + 21, y + (h - 7) // 2, label, ink=ink, shadow=sh)


TYPE_W, TYPE_H = 52, 16


def type_icon(img, x, y, slug, w=TYPE_W):
    """Type label: chamfered chip, type colour, white Vietnamese label (room above for capital diacritics)."""
    label = next(lab for s, lab, _ in TYPES if s == slug)
    c = TYPE_COLOUR[slug]
    d = ImageDraw.Draw(img)
    chamfer(d, x, y, x + w - 1, y + TYPE_H - 1, shade(c, .5), 2)
    chamfer(d, x + 1, y + 1, x + w - 2, y + TYPE_H - 2, c, 1)
    d.line([x + 3, y + 1, x + w - 4, y + 1], fill=shade(c, 1.25))
    d.line([x + 3, y + TYPE_H - 2, x + w - 4, y + TYPE_H - 2], fill=shade(c, .8))
    F.draw(img, x + w // 2 - F.width(label) // 2, y + 6, label, ink=WHITE, shadow=shade(c, .55))


BADGES = {  # gym -> (body colour, emblem colour, 8x8 emblem)
    "fire": ((222, 64, 62), (246, 206, 128), ["...##...", "..####..", ".##..##.", "##.##.##", "##.##.##", ".######.", "..####..", "...##..."]),
    "water": ((40, 120, 210), (200, 230, 255), ["...##...", "...##...", "..####..", ".######.", "##.#####", "##..####", ".######.", "..####.."]),
    "grass": ((72, 162, 74), (178, 230, 116), ["......##", "....####", "..#####.", ".####.#.", "####.#..", "###.#...", ".#......", "#......."]),
    "electric": ((226, 168, 34), (255, 242, 130), ["....###.", "...###..", "..###...", ".######.", "...###..", "..###...", ".###....", ".##....."]),
    "rock": ((118, 122, 150), (236, 156, 96), ["..####..", ".##..##.", "##....##", "#.####.#", "#.#..#.#", "##....##", ".##..##.", "..####.."]),
    "ground": ((186, 86, 58), (150, 230, 212), ["........", "...##...", "..####..", ".##..##.", "##....##", "########", "#.#..#.#", "########"]),
    "poison": ((134, 72, 184), (176, 192, 100), ["..####..", ".######.", "##.##.##", "########", ".######.", "..#..#..", "..####..", "...##..."]),
    "psychic": ((172, 72, 168), (255, 236, 156), ["..####..", ".#....#.", "#..##..#", "#.#..#.#", "#.#..#.#", "#..##..#", ".#....#.", "..####.."]),
}


def badge(img, x, y, gym):
    c, a, rows = BADGES[gym]
    d = ImageDraw.Draw(img)
    d.ellipse([x, y, x + 23, y + 23], fill=INK)
    d.ellipse([x + 1, y + 1, x + 22, y + 22], fill=shade(c, .7))
    d.ellipse([x + 2, y + 2, x + 20, y + 20], fill=c)
    d.ellipse([x + 4, y + 4, x + 10, y + 9], fill=shade(c, 1.35))
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == "#":
                img.putpixel((x + 8 + i, y + 8 + j), a + (255,))


def dpad(img, x, y, acc):
    d = ImageDraw.Draw(img)
    for (a, b, c, e) in ((x + 14, y, x + 27, y + 41), (x, y + 14, x + 41, y + 27)):
        d.rectangle([a, b, c, e], fill=INK)
    for (a, b, c, e) in ((x + 15, y + 1, x + 26, y + 40), (x + 1, y + 15, x + 40, y + 26)):
        d.rectangle([a, b, c, e], fill=CREAM)
    d.rectangle([x + 17, y + 17, x + 24, y + 24], fill=CREAM_D)
    for (px_, py_, rows) in ((x + 18, y + 4, [".##.", "####"]), (x + 18, y + 35, ["####", ".##."]),
                             (x + 4, y + 18, [".#", "##", "##", ".#"]), (x + 35, y + 18, ["#.", "##", "##", "#."])):
        for j, r in enumerate(rows):
            for i, c in enumerate(r):
                if c == "#":
                    img.putpixel((px_ + i, py_ + j), acc[2] + (255,))


def round_button(img, cx, cy, r, label, fill, ink=WHITE, sh=None):
    d = ImageDraw.Draw(img)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=INK)
    d.ellipse([cx - r + 1, cy - r + 1, cx + r - 1, cy + r - 1], fill=fill)
    d.arc([cx - r + 2, cy - r + 2, cx + r - 2, cy + r - 2], 200, 300, fill=shade(fill, 1.3))
    F.draw(img, cx - F.width(label) // 2 + 1, cy - 3, label, ink=ink, shadow=sh or shade(fill, .6))


def menu_button(img, x, y, acc):
    d = ImageDraw.Draw(img)
    chamfer(d, x, y, x + 17, y + 15, INK, 3)
    chamfer(d, x + 1, y + 1, x + 16, y + 14, CREAM, 2)
    for k in range(3):
        d.line([x + 5, y + 4 + k * 3, x + 12, y + 4 + k * 3], fill=acc[2])


def dock(img, y, w, h):
    d = ImageDraw.Draw(img)
    d.rectangle([0, y, w - 1, y + h - 1], fill=INK2)
    d.line([0, y, w - 1, y], fill=INK)
    for x in range(-h, w, 10):
        d.line([(x, y + h - 1), (x + h - 1, y + 1)], fill=shade(INK2, 1.12), width=3)


# ---------------------------------------------------------------- bevelled shapes (badges, item icons)
def mask_poly(w, h, polys, minus=()):
    """polys / minus: lists of shapes; a shape is a polygon point list or ('ellipse', box) or ('rect', box)."""
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    for shapes, val in ((polys, 255), (minus, 0)):
        for s in shapes:
            if isinstance(s, tuple) and s and s[0] == "ellipse":
                d.ellipse(s[1], fill=val)
            elif isinstance(s, tuple) and s and s[0] == "rect":
                d.rectangle(s[1], fill=val)
            else:
                d.polygon(s, fill=val)
    return m


def bevel(img, x0, y0, mask, ramp, outline=INK, depth=2):
    """Paint a mask as a bevelled metal / enamel piece: ink outline, light top-left rim, dark
    bottom-right rim, mid body. ramp = [light, mid, dark]."""
    mp = mask.load()
    w, h = mask.size

    def inside(x, y):
        return 0 <= x < w and 0 <= y < h and mp[x, y]
    for y in range(h):
        for x in range(w):
            if not inside(x, y):
                continue
            if any(not inside(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                c = outline
            elif any(not inside(x + k, y + k) for k in range(1, depth + 1)):
                c = ramp[2]
            elif any(not inside(x - k, y - k) for k in range(1, depth + 1)):
                c = ramp[0]
            else:
                c = ramp[1]
            img.putpixel((x0 + x, y0 + y), c + (255,))


def ramp3(c):
    return [shade(c, 1.35), c, shade(c, .62)]


BADGE_SHAPES = {   # 24x24 silhouettes: body polygons, emblem polygons (accent)
    "fire": ([[(12, 1), (15, 6), (19, 9), (21, 14), (19, 19), (15, 22), (9, 22), (5, 19), (3, 14), (5, 9), (8, 12), (9, 6)]],
             [[(12, 8), (14, 12), (16, 15), (14, 19), (10, 19), (8, 16), (10, 13)]]),
    "water": ([[(12, 1), (18, 3), (21, 7), (22, 12), (20, 16), (15, 18), (14, 22), (10, 22), (9, 18), (4, 16), (2, 12), (3, 7), (6, 3)],
               ],
              [[(11, 17), (12, 4), (13, 17)], [(8, 16), (5, 8), (9, 16)], [(16, 16), (19, 8), (15, 16)]]),
    "grass": ([[(3, 21), (3, 13), (7, 6), (13, 2), (21, 2), (21, 9), (17, 16), (10, 20)]],
              [[(5, 20), (18, 5), (19, 6), (6, 21)], [(10, 14), (10, 9), (11, 9), (11, 14)], [(13, 11), (17, 11), (17, 12), (13, 12)]]),
    "electric": ([[(14, 1), (4, 13), (10, 13), (7, 23), (20, 9), (13, 9), (18, 1)]],
                 [[(14, 4), (8, 12), (12, 12)]]),
    "rock": ([[(8, 2), (16, 2), (22, 8), (22, 16), (16, 22), (8, 22), (2, 16), (2, 8)]],
             [[(12, 5), (18, 12), (12, 19), (6, 12)]]),
    "ground": ([[(1, 21), (1, 15), (5, 15), (5, 10), (9, 10), (9, 4), (15, 4), (15, 10), (19, 10), (19, 15), (23, 15), (23, 21)]],
               [[(10, 7), (14, 7), (14, 8), (10, 8)], [(6, 13), (18, 13), (18, 14), (6, 14)], [(2, 18), (22, 18), (22, 19), (2, 19)]]),
    "poison": ([[(1, 12), (3, 6), (8, 2), (16, 2), (21, 6), (23, 12)], ("rect", (8, 11, 15, 22))],
               [("ellipse", (6, 5, 9, 8)), ("ellipse", (13, 4, 17, 8)), ("ellipse", (17, 8, 19, 10))]),
    "psychic": ([("ellipse", (1, 1, 22, 22))],
                [[(17, 3), (18, 6), (21, 7), (18, 8), (17, 11), (16, 8), (13, 7), (16, 6)]]),
}
BADGE_MINUS = {"psychic": [("ellipse", (6, -2, 26, 18))]}


def badge(img, x, y, gym):
    """Gym badge, 24x24: every District has its own silhouette (decision §10, redesigned 2026-11-18)."""
    c, a, _ = BADGES[gym]
    body, emblem = BADGE_SHAPES[gym]
    bevel(img, x, y, mask_poly(24, 24, body, BADGE_MINUS.get(gym, ())), ramp3(c))
    em = mask_poly(24, 24, emblem)
    if gym == "psychic":
        em = mask_poly(24, 24, emblem)
    ep = em.load()
    bp = mask_poly(24, 24, body, BADGE_MINUS.get(gym, ())).load()
    for yy in range(24):
        for xx in range(24):
            if ep[xx, yy] and (bp[xx, yy] or gym == "psychic"):
                img.putpixel((x + xx, y + yy), a + (255,))
    if gym == "psychic":      # the star sits in the crescent's mouth: outline it
        for yy in range(24):
            for xx in range(24):
                if ep[xx, yy] and any(0 <= xx + dx < 24 and 0 <= yy + dy < 24 and not ep[xx + dx, yy + dy]
                                      and not bp[xx + dx, yy + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    img.putpixel((x + xx, y + yy), INK + (255,))


# ---------------------------------------------------------------- item icons (16x16)
ITEMS = [  # slug, Vietnamese name, body colour, accent colour, shapes, accent shapes
    ("ball", "Poké Ball", (222, 64, 62), (236, 236, 244),
     [("ellipse", (1, 1, 14, 14))], [("rect", (2, 8, 13, 13))]),
    ("great-ball", "Great Ball", (40, 120, 210), (236, 236, 244),
     [("ellipse", (1, 1, 14, 14))], [("rect", (2, 8, 13, 13))]),
    ("potion", "Thuốc Hồi", (172, 72, 168), (200, 230, 255),
     [("rect", (5, 1, 10, 4)), [(4, 5), (11, 5), (13, 9), (13, 14), (2, 14), (2, 9)]], [("rect", (4, 8, 11, 11))]),
    ("super-potion", "Thuốc Mạnh", (240, 128, 48), (255, 242, 130),
     [("rect", (5, 1, 10, 4)), [(4, 5), (11, 5), (13, 9), (13, 14), (2, 14), (2, 9)]], [("rect", (4, 8, 11, 11))]),
    ("antidote", "Giải Độc", (72, 162, 74), (252, 246, 228),
     [("rect", (5, 1, 10, 4)), [(4, 5), (11, 5), (13, 9), (13, 14), (2, 14), (2, 9)]], [("rect", (7, 7, 8, 12)), ("rect", (5, 9, 10, 10))]),
    ("revive", "Hồi Sinh", (226, 168, 34), (255, 248, 200),
     [[(8, 1), (14, 8), (8, 14), (2, 8)]], [[(8, 4), (10, 8), (8, 11), (6, 8)]]),
    ("berry", "Quả Mọng", (64, 112, 220), (118, 200, 90),
     [("ellipse", (2, 4, 13, 14))], [[(8, 1), (12, 1), (10, 5), (7, 5)]]),
    ("escape-rope", "Dây Thoát", (186, 130, 82), (236, 200, 150),
     [("ellipse", (1, 3, 14, 13))], [("ellipse", (4, 6, 11, 10))]),
    ("repel", "Xịt Chống", (110, 120, 152), (232, 72, 64),
     [("rect", (4, 4, 11, 14)), ("rect", (6, 1, 9, 3))], [("rect", (4, 7, 11, 9))]),
    ("tm", "Đĩa Chiêu", (90, 196, 186), (252, 246, 228),
     [("ellipse", (1, 1, 14, 14))], [("ellipse", (6, 6, 9, 9))]),
    ("key", "Chìa Khoá", (226, 168, 34), (255, 242, 130),
     [("ellipse", (1, 1, 7, 7)), ("rect", (6, 3, 14, 5)), ("rect", (11, 5, 12, 8)), ("rect", (13, 5, 14, 7))], [("ellipse", (3, 3, 5, 5))]),
    ("map", "Bản Đồ", (226, 200, 150), (72, 162, 74),
     [[(1, 3), (5, 1), (10, 3), (14, 1), (14, 12), (10, 14), (5, 12), (1, 14)]], [[(4, 6), (8, 5), (11, 8), (7, 10)]]),
    ("old-rod", "Cần Câu Cũ", (196, 144, 88), (240, 136, 48),
     [[(2, 13), (4, 14), (13, 3), (11, 2)]], [("ellipse", (10, 9, 14, 13))]),
    ("good-rod", "Cần Câu Tốt", (56, 112, 216), (222, 56, 56),
     [[(2, 13), (4, 14), (13, 3), (11, 2)]], [("ellipse", (10, 9, 14, 13))]),
    ("super-rod", "Cần Câu Siêu Cấp", (222, 56, 56), (248, 214, 64),
     [[(2, 13), (4, 14), (13, 3), (11, 2)]], [("ellipse", (10, 9, 14, 13))]),
]


def item_icon(img, x, y, slug):
    _, _, c, a, body, acc = next(i for i in ITEMS if i[0] == slug)
    m = mask_poly(16, 16, body)
    bevel(img, x, y, m, ramp3(c), depth=1)
    am = mask_poly(16, 16, acc).load()
    mp = m.load()
    for yy in range(16):
        for xx in range(16):
            if am[xx, yy] and mp[xx, yy]:
                inner = all(0 <= xx + dx < 16 and 0 <= yy + dy < 16 and mp[xx + dx, yy + dy]
                            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
                if inner:
                    img.putpixel((x + xx, y + yy), a + (255,))
    if slug in ("ball", "great-ball"):           # band + button
        d = ImageDraw.Draw(img)
        d.line([x + 2, y + 8, x + 13, y + 8], fill=INK)
        d.ellipse([x + 6, y + 6, x + 9, y + 9], fill=INK)
        d.point((x + 7, y + 7), fill=WHITE)
