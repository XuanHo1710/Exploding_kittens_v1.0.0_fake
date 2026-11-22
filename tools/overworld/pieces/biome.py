"""Biome variants of the shared Emerald foliage: the SAME pixel structure as tree-wall, forest,
tall-grass and tree, with only the leaf ramp swapped for a theme's ramp. Each ramp keeps the
lightness steps of the base LEAF ramp and stays low in saturation, so a themed route or town edge
sits calmly next to the shared lawn (Gen 3 does the same: ash-dusted trees on Route 113, jungle
greens on Route 119). Gym modules call biome_pieces(prefix, ramp) and merge the result."""
from PIL import Image

import colorsys

from overworld_kit import CLIFF, DIRT, GRASS, GRASS_SHADE, HEDGE, LEAF, STONE, TALL, contact_shade
from props import pine_tree as _pine, tree as _tree, tree_small as _tree_small, YOUNG
from terrain import PINE, TERRAIN as BASE, pine_wall_block
from naturekit import theme_pieces

# District ground: (hue in degrees, saturation x, value x) for the lawn and for the dirt lane. The
# lightness steps of the base ramps are kept, so a district reads as a different season of the same
# picture, never as a new art style (user, 2026-11-18: "not always green").
GROUND = {
    "fire":     dict(lawn=(58, 0.35, 0.92), path=(20, 0.35, 0.74)),     # ash-dusted turf, cinder lane
    "grass":    dict(lawn=(98, 1.05, 1.00), path=None),                # the lush original
    "ground":   dict(lawn=(46, 0.70, 1.02), path=(14, 1.05, 0.95)),     # dry straw, red clay
    "poison":   dict(lawn=(128, 0.55, 0.80), path=(30, 0.50, 0.62)),    # dark moss, peat
    "psychic":  dict(lawn=(160, 0.45, 0.94), path=(268, 0.16, 0.96)),   # dusk teal, lilac stone
    "rock":     dict(lawn=(84, 0.32, 0.90), path=(40, 0.12, 0.86)),     # grey turf, gravel
    "water":    dict(lawn=(76, 0.65, 1.00), path=(40, 0.55, 1.02)),     # sea-breeze, pale sand
    "electric": dict(lawn=(110, 0.60, 0.90), path=(210, 0.12, 0.86)),   # trimmed cool lawn, concrete
}


def _tint(c, hsv):
    if hsv is None:
        return tuple(c[:3])
    h, sm, vm = hsv
    _, s_, v = colorsys.rgb_to_hsv(*(ch / 255 for ch in c[:3]))
    r, g, b = colorsys.hsv_to_rgb(h / 360, min(1, s_ * sm), min(1, v * vm))
    return (round(r * 255), round(g * 255), round(b * 255))

# Leaf ramps, light -> dark, matched to LEAF's lightness: (178,230,116) .. (30,84,58)
RAMPS = {
    "fire":     [(206, 208, 180), (166, 172, 142), (126, 134, 114), (92, 98, 90), (62, 64, 66)],      # ash-dusted
    "grass":    [(238, 196, 206), (126, 200, 98), (76, 160, 80), (48, 120, 68), (30, 84, 58)],        # blossom tips
    "ground":   [(216, 214, 132), (178, 182, 96), (138, 146, 76), (100, 108, 62), (68, 72, 50)],      # dry scrub
    "poison":   [(160, 210, 160), (104, 172, 124), (68, 134, 104), (44, 100, 86), (28, 68, 64)],      # swamp moss
    "psychic":  [(208, 206, 230), (162, 168, 204), (122, 132, 172), (88, 100, 140), (58, 68, 102)],   # moonlit lilac
    "rock":     [(162, 210, 146), (106, 170, 108), (68, 130, 88), (44, 98, 76), (28, 66, 58)],        # mountain pine
    "water":    [(172, 228, 176), (112, 198, 152), (72, 162, 130), (46, 122, 106), (28, 86, 82)],     # sea breeze
    "electric": [(234, 216, 128), (204, 180, 88), (162, 140, 70), (118, 102, 60), (78, 68, 50)],      # autumn gold
}


# Second tree species per theme (pine-shaped: juniper, fen spruce, blue spruce, sea pine ...), light -> dark
PINE_RAMPS = {
    "fire":     [(190, 192, 170), (146, 150, 130), (110, 114, 100), (78, 82, 76), (50, 52, 56)],         # ash pine
    "grass":    [(164, 216, 136), (100, 172, 106), (64, 136, 94), (42, 102, 82), (26, 68, 62)],          # garden pine
    "ground":   [(196, 200, 140), (150, 160, 104), (112, 124, 84), (82, 92, 68), (54, 60, 50)],          # juniper
    "poison":   [(130, 176, 140), (84, 136, 110), (56, 102, 88), (38, 74, 70), (24, 50, 52)],            # fen spruce
    "psychic":  [(186, 196, 226), (136, 150, 196), (100, 114, 162), (72, 84, 128), (48, 56, 94)],        # blue spruce
    "rock":     [(150, 200, 146), (94, 156, 112), (60, 120, 92), (40, 90, 76), (26, 62, 58)],            # mountain pine
    "water":    [(150, 210, 180), (96, 170, 146), (62, 132, 120), (42, 98, 96), (26, 68, 72)],           # sea pine
    "electric": [(220, 200, 120), (176, 156, 84), (136, 118, 66), (98, 86, 56), (66, 58, 46)],           # larch
}
# Plateau rock per theme (CLIFF steps), light -> dark; `grass` keeps the shared warm stone (base cliff)
ROCK_RAMPS = {
    "fire":     [(150, 134, 140), (120, 104, 112), (96, 82, 92), (74, 62, 74), (46, 38, 52)],            # basalt
    "ground":   [(238, 182, 136), (212, 144, 102), (180, 110, 82), (140, 80, 66), (96, 54, 52)],         # red mesa
    "poison":   [(160, 160, 140), (126, 128, 112), (98, 100, 90), (72, 74, 70), (46, 48, 52)],           # peat stone
    "psychic":  [(236, 230, 244), (206, 198, 224), (170, 162, 196), (132, 124, 164), (90, 84, 124)],     # pale marble
    "rock":     [(196, 204, 212), (156, 166, 180), (120, 130, 148), (88, 96, 116), (56, 62, 82)],        # slate
    "water":    [(246, 240, 226), (222, 212, 192), (192, 180, 162), (152, 140, 128), (104, 94, 92)],     # chalk
    "electric": [(214, 216, 218), (180, 184, 188), (146, 150, 158), (108, 112, 124), (72, 76, 90)],      # concrete
}


def lawn_ramp(prefix):
    """The theme lawn's 5 tones (GRASS re-tinted), light -> dark."""
    g = GROUND.get(prefix, {})
    return [_tint(c, g.get("lawn")) for c in GRASS]


def _mapping(ramp, lawn=None):
    m = {}
    if lawn is not None:                       # the lawn first, so leaf tones shared with it win below
        m.update({tuple(c): _tint(c, lawn) for c in GRASS + [GRASS_SHADE]})
    m.update({LEAF[i]: ramp[i] for i in range(5)})
    m.update({TALL[i]: ramp[i] for i in range(5)})
    mid = tuple((a + b) // 2 for a, b in zip(ramp[1], ramp[2]))
    m[HEDGE[2]] = mid
    return m


def _recolor_px(c, m):
    if c is None:
        return None
    rgb = tuple(c[:3])
    if rgb in m:
        return m[rgb] + tuple(c[3:])
    return c


def _recolor_img(im, m):
    im = im.copy()
    p = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = p[x, y]
            if a and (r, g, b) in m:
                p[x, y] = m[(r, g, b)] + (a,)
    return im


def biome_pieces(prefix, ramp=None):
    """(TERRAIN, PROPS) for one theme: <prefix>-tree-wall, -forest, -tall-grass and the -tree prop."""
    ramp = ramp or RAMPS[prefix]
    g = GROUND.get(prefix, {})
    m = _mapping(ramp, g.get("lawn"))
    terrain, props = {}, {}
    # district lawn, lane and ledge: the base painters with the lawn (and the dirt) re-tinted
    lawn_only = {tuple(c): _tint(c, g.get("lawn")) for c in GRASS + [GRASS_SHADE]} if g else {}
    if g:
        base = BASE["grass"]
        terrain[f"{prefix}-lawn"] = dict(base, variants=[
            (lambda x, y, fn=fn: lawn_only.get(tuple(fn(x, y)), tuple(fn(x, y)))) for fn in base["variants"]])
        dirt = {tuple(c): _tint(c, g["path"]) for c in DIRT} if g.get("path") else {}

        def lane(d, facing, x, y, f, mask, paint=BASE["dirt-path"]["paint"]):
            c = paint(d, facing, x, y, f, mask)
            if c is None:
                return None
            k = tuple(c[:3])
            out = lawn_only.get(k) or dirt.get(k) or (_tint(c, g["path"]) if g.get("path") else k)
            return out + tuple(c[3:])
        terrain[f"{prefix}-path"] = dict(BASE["dirt-path"], paint=lane)
        lp = BASE["ledge"]["paint"]
        terrain[f"{prefix}-ledge"] = dict(BASE["ledge"], paint=(lambda i, x, y, lp=lp: lawn_only.get(tuple(lp(i, x, y)), tuple(lp(i, x, y)))))
    for base, name in (("forest", "forest"), ("tall-grass", "tall-grass")):
        spec = dict(BASE[base])
        paint = spec["paint"]
        spec["paint"] = (lambda d, facing, x, y, f, mask, paint=paint: _recolor_px(paint(d, facing, x, y, f, mask), m))
        terrain[f"{prefix}-{name}"] = spec
    wall = dict(BASE["tree-wall"])
    block = wall["block"]
    wall["block"] = lambda block=block: _recolor_img(block(), m)
    wall["fallback"] = f"{prefix}-forest"
    terrain[f"{prefix}-tree-wall"] = wall
    props[f"{prefix}-tree"] = dict(cells=(2, 2), paint=lambda: [_recolor_img(_tree()[0], m)])
    if prefix in EMBLEM:
        props[f"{prefix}-statue"] = dict(cells=(1, 2), paint=gym_statue(prefix))
    # second and third species: a pine-shaped evergreen (wall block + prop) and a young tree
    pm = dict(lawn_only)
    pm.update({PINE[i]: PINE_RAMPS[prefix][i] for i in range(5)})
    terrain[f"{prefix}-pine-wall"] = dict(BASE["pine-wall"], block=lambda: _recolor_img(pine_wall_block(), pm),
                                          fallback=f"{prefix}-forest")
    props[f"{prefix}-pine"] = dict(cells=(2, 2), paint=lambda: [_recolor_img(_pine()[0], pm)])
    ym = {YOUNG[i]: ramp[i] for i in range(5)}
    props[f"{prefix}-tree-small"] = dict(cells=(1, 2), paint=lambda: [_recolor_img(_tree_small()[0], ym)])
    # plateau in the theme's own rock, its lip and hanging grass in the theme lawn
    if prefix in ROCK_RAMPS:
        cm = dict(lawn_only)
        cm.update({CLIFF[i]: ROCK_RAMPS[prefix][i] for i in range(5)})
        for name in ("cliff", "cliff-face", "cliff-2", "cliff-face-2"):
            spec = dict(BASE[name])
            spec["paint"] = (lambda d, facing, x, y, f, mask, paint=spec["paint"]: _recolor_px(paint(d, facing, x, y, f, mask), cm))
            spec["group"] = "cliff"
            terrain[f"{prefix}-{name}"] = spec
        st = dict(BASE["stairs"])
        st["paint"] = (lambda i, x, y, paint=st["paint"]: _recolor_px(paint(i, x, y), cm))
        terrain[f"{prefix}-stairs"] = st
    # the nature kit: ground patches and small props for the organic map passes (naturekit.py)
    kt, kp = theme_pieces(prefix, lawn_ramp(prefix), ramp)
    terrain.update(kt)
    props.update(kp)
    # district ground, foliage, rock and nature kit: the theme's landscape, not its gym accent (the
    # map lint's accent share skips pieces flagged nature=True); the statue stays an accent
    for d in (terrain, props):
        for slug, spec in d.items():
            if not slug.endswith("-statue"):
                spec["nature"] = True
    return terrain, props


# ---------------------------------------------------------------- gym statue (one per theme, placed in pairs)
EMBLEM = {   # 8x8 emblem, a = light, b = mid, c = dark
    "fire":     ["...a....", "..aa....", "..aba...", ".abba.a.", ".abbbaa.", "abbcbba.", "abccbba.", ".bccbb.."],
    "electric": ["....aa..", "...ab...", "..ab....", ".abbbba.", "....ba..", "...ba...", "..bc....", ".bc....."],
    "grass":    ["....aa..", "...abba.", "..abbba.", ".abcbba.", ".abcba..", ".abca...", "..cc....", ".c......"],
    "psychic":  ["........", "..aaaa..", ".abbbba.", "abbccbba", "abbccbba", ".abbbba.", "..aaaa..", "........"],
    "water":    ["...a....", "...aa...", "..abba..", "..abba..", ".abbbba.", ".abbbcb.", ".abbccb.", "..bccb.."],
    "ground":   ["........", "...aa...", "..abba..", "..abba..", ".abbbba.", ".abbbcb.", "abbbbccb", "cccccccc"],
    "poison":   ["..aaaa..", ".abbbba.", "abaabbba", "abbbbbab", ".cccccc.", "...bb...", "...bb...", "..bccb.."],
    "rock":     ["...a....", "..aba...", "..abba..", ".abbba..", ".abbcba.", "abbccba.", ".bbccb..", "..ccc..."],
}
EMBLEM_COLS = {
    "fire": [(255, 208, 72), (255, 150, 40), (200, 70, 40)],
    "electric": [(255, 244, 112), (250, 206, 52), (190, 130, 40)],
    "grass": [(178, 230, 116), (118, 200, 90), (60, 130, 70)],
    "psychic": [(255, 196, 238), (230, 120, 206), (150, 70, 160)],
    "water": [(222, 236, 248), (110, 180, 238), (60, 104, 170)],
    "ground": [(232, 200, 140), (196, 150, 98), (130, 90, 66)],
    "poison": [(214, 170, 232), (170, 110, 200), (96, 60, 120)],
    "rock": [(236, 200, 255), (190, 130, 236), (130, 74, 190)],
}


def gym_statue(kind):
    """Gym statue (1x2): a neutral stone plinth and pillar; the theme colour lives only in the
    small emblem on top, so a pair at the door ties the gym to the street without a colour coat."""
    def paint():
        im = Image.new("RGBA", (16, 32), (0, 0, 0, 0))
        contact_shade(im, 1, 31, 15, alpha=90)
        p = im.load()
        for y in range(24, 31):                       # plinth
            for x in range(2, 14):
                c = STONE[1] if y == 24 else STONE[4] if x in (2, 13) or y == 30 else STONE[2] if y < 27 else STONE[3]
                p[x, y] = c + (255,)
        for y in range(12, 24):                       # pillar
            for x in range(5, 11):
                c = STONE[4] if x in (5, 10) else STONE[1] if x == 6 else STONE[2]
                p[x, y] = c + (255,)
        for x in range(4, 12):                        # cap
            p[x, 11] = STONE[1] + (255,)
            p[x, 12] = STONE[3] + (255,)
        cols = EMBLEM_COLS[kind]
        for v, row in enumerate(EMBLEM[kind]):        # emblem standing on the cap
            for u, ch in enumerate(row):
                if ch != ".":
                    p[4 + u, 2 + v] = cols["abc".index(ch)] + (255,)
        return [im]
    return paint
