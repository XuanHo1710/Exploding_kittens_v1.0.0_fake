"""Nature kits: the ground-variation patches and small Props every map theme needs for the map
generator's organic passes (`vary`, `decorate`, `forest_edge`), so a volcano route, a marsh or a
quarry gets the same richness as the meadow (lush grass, clover, worn earth, tufts, pebbles, flowers,
stumps, logs, reeds ...), drawn in that theme's own colours.

  * patches: walkable 47-tile blob terrains (`patch=True`). Their outside AND their feathered last
    6 px are transparent, so a patch wears into whatever ground lies under it (the theme lawn, a gym
    quarter, the base lawn) with no rim and no lawn-coloured specks of the wrong theme.
  * props: theme stand-ins for the meadow decals and furniture (tuft, pebbles, flowers, bush, stump,
    log, rocks, fern) plus a few unique pieces per theme (steam vent, cactus, ore rock, shells ...).
    `walk=True` marks walkable decals; `water=True` a prop laid on a water cell; `bank=True` one that
    stands beside water. Contact shades use SHADE_KEY, so every map re-shades them for its ground.

`theme_pieces(prefix, lawn, leaf)` returns (TERRAIN, PROPS) for one gym theme (biome.py merges them
into that gym's module); BASE_TERRAIN / BASE_PROPS are the shared coast and woods pieces, merged into
the base set by gen_overworld. The kit table that tells the passes which piece plays which part lives
in the map generator's themes.json (`nature`)."""
import math

from PIL import Image, ImageDraw

from overworld_kit import BARK, GRASS, LEAF, SHADE_KEY, STONE, WOOD, draw_blobs, h16, mix
import props as P

S = SHADE_KEY


# ---------------------------------------------------------------- drawing helpers
def canvas(w=1, h=1):
    return Image.new("RGBA", (w * 16, h * 16), (0, 0, 0, 0))


def stamp(im, rows, ink, ox=0, oy=0):
    p = im.load()
    for v, row in enumerate(rows):
        for u, ch in enumerate(row):
            x, y = ox + u, oy + v
            if ch in ink and 0 <= x < im.width and 0 <= y < im.height:
                p[x, y] = tuple(ink[ch][:3]) + (255,)
    return im


def sprite(rows, ink, w=1, h=1):
    """One static frame from an ASCII drawing (rows shorter than the canvas are padded)."""
    return lambda: [stamp(canvas(w, h), rows, ink)]


def recolor(paint, mapping):
    """A base prop painter with its colours swapped (mapping: RGB -> RGB)."""
    m = {tuple(k): tuple(v) for k, v in mapping.items()}

    def out():
        frames = []
        for im in paint():
            im = im.copy()
            p = im.load()
            for y in range(im.height):
                for x in range(im.width):
                    r, g, b, a = p[x, y]
                    if a and (r, g, b) in m:
                        p[x, y] = m[(r, g, b)] + (a,)
            frames.append(im)
        return frames
    return out


def darker(c, k=0.8):
    return tuple(int(v * k) for v in c[:3])


# ---------------------------------------------------------------- patch autotiles
def feather(d, x, y, width, seed):
    """Lawn-coloured 2x2 clusters thinning out over the last `width` px (here: transparent, so the
    real ground under the patch shows through; d is continuous across tiles, so joins are seamless)."""
    if d >= width:
        return False
    return h16(x // 2 * 2, y // 2 * 2, seed) < 255 * (1 - d / width) ** 1.4 * 0.95


def tex(base, layers, ink, full=None):
    """16 px exact-repeat texture: a base colour, an optional full 16x16 ASCII layer, then glyphs
    stamped at lattice spots (wrapping), so the pattern never shows the cell grid."""
    grid = [[base] * 16 for _ in range(16)]
    for v, row in enumerate(full or ()):
        for u, ch in enumerate(row):
            if ch in ink:
                grid[v % 16][u % 16] = ink[ch]
    for rows, spots in layers:
        for ox, oy in spots:
            for v, row in enumerate(rows):
                for u, ch in enumerate(row):
                    if ch in ink:
                        grid[(oy + v) % 16][(ox + u) % 16] = ink[ch]
    return lambda x, y: tuple(grid[y % 16][x % 16])


def patch(px, width=6.0, seed=51, behaviour="SHORT_GRASS", rim=None, radius=7):
    """Walkable ground patch: `px` inside, a feathered edge that dissolves into the ground below
    (transparent), an optional `rim` tone dithered over the inner 2 px (worn earth, wet mud)."""
    def paint(d, facing, x, y, f, m):
        if d < 0 or feather(d, x, y, width, seed):
            return None
        if rim is not None and d < width * 0.45 and (x + y) % 2 and h16(x, y, seed + 3) < 150:
            return rim
        return px(x, y)
    return dict(kind="blob", behaviour=behaviour, paint=paint, patch=True, soft=False,
                sdf=dict(margin=1.0, radius=radius, wobble=0.0, freq=1))


# glyphs shared by the textures (l light, m mid, d dark, plus per-texture letters)
TUFT3 = ["l.l.l", ".ddd.", "..d.."]
BLADES = ["l..l", "m.lm", "mmd.", ".dd."]
GRAIN = ["l.", ".d"]
DASH = ["ll"]
PEB = [".lm.", "lmmd", ".dd."]
PEB2 = ["lm", "dd"]
CHIP = ["l..", "md.", ".dd"]
MOSS = [".ll.", "lmmm", "mmmd", ".dd."]
CUSHION = ["..ll..", ".lmmml", "lmmmmd", ".mmmd.", "..dd.."]
LEAFA = [".a", "ab"]
LEAFB = ["ab.", ".bc"]
BLOOM = [".w.", "wYw", ".w."]
TREFOIL = [".aa.", "abba", ".ab.", "..a."]
PUDDLE = ["..bbbb..", ".bwwbbb.", "bbbbbbbd", ".dbbbdd.", "..dddd.."]
SPOTS6 = ((1, 1), (9, 3), (5, 7), (13, 9), (2, 12), (10, 13))
SPOTS4 = ((2, 2), (10, 5), (5, 10), (13, 13))
SPOTS3 = ((3, 3), (11, 8), (6, 13))


# ---------------------------------------------------------------- prop factories (theme stand-ins)
def tuft(l, m, d, s=S):
    return lambda: [stamp(canvas(), P.TUFT, {"l": l, "m": m, "d": d, "s": s})]


def fern(l, m, d, s=S):
    return lambda: [stamp(canvas(), P.FERN, {"l": l, "m": m, "d": d, "s": s})]


def pebbles(l, m, d, s=S):
    return lambda: [stamp(canvas(), P.PEBBLES, {"l": l, "m": m, "d": d, "s": s})]


def rocks(o, l, m, d):
    return lambda: [stamp(canvas(), P.ROCKS_SMALL, {"o": o, "l": l, "m": m, "d": d, "s": S})]


def bush(ramp, out, wide=False, dots=None):
    def paint():
        im = canvas(2 if wide else 1, 1)
        if wide:
            P.contact_shade(im, 2, 30, 14)
            draw_blobs(im, [(16, 9, 14, 5), (6, 9.5, 5, 4.5), (13, 6.5, 5.5, 4.5), (21, 6, 5.5, 4.5),
                            (26.5, 9.5, 4.5, 4.5)], ramp, out, speck=58)
        else:
            P.contact_shade(im, 2, 14, 14)
            draw_blobs(im, [(8, 9, 7, 5.5), (4.5, 10, 4, 4), (11.5, 10, 4, 4), (8, 5.5, 5, 4)], ramp, out, speck=52)
        if dots:
            p = im.load()
            c1, c2 = dots
            for x, y in ((5, 5), (10, 4), (12, 8), (3, 9), (8, 9), (6, 12), (11, 12)):
                if p[x, y][3] and p[x, y][:3] != tuple(out):
                    p[x, y] = c1 + (255,)
                    if p[x + 1, y][3]:
                        p[x + 1, y] = c2 + (255,)
        return [im]
    return paint


def flowers(petal, eye, shape=P.BLOSSOM, spots=((1, 2), (8, 1), (5, 7)), leaf=None):
    """Theme flower patch: the Emerald flower clump with its own petals (and leaf colours)."""
    def paint():
        frames = P.flower_patch(petal, eye, spots, shape)
        if leaf:
            m = {LEAF[1]: leaf[0], LEAF[2]: leaf[1]}
            for im in frames:
                p = im.load()
                for y in range(16):
                    for x in range(16):
                        if p[x, y][3] and p[x, y][:3] in m:
                            p[x, y] = m[p[x, y][:3]] + (255,)
        return frames
    return paint


def wood_swap(bark, wood, moss=None):
    """Mapping for stump / log recolours: bark ramp (3), cut-wood ramp (4), moss (2)."""
    m = {BARK[i]: bark[i] for i in range(3)}
    m.update({WOOD[i]: wood[i] for i in range(4)})
    if moss:
        m.update({LEAF[1]: moss[0], LEAF[2]: moss[1]})
    return m


def F(paint, cells=(1, 1), **k):
    """Prop spec."""
    return dict(cells=cells, paint=paint, **k)


def flower_spec(*a, **k):
    """Walkable 3-frame flower patch (played 0,1,0,2 like the base flowers)."""
    return dict(cells=(1, 1), paint=flowers(*a, **k), order=[0, 1, 0, 2], walk=True)


# ---------------------------------------------------------------- unique drawings
STEAM_VENT = ["................",
              ".......ww.......",
              "......wWWw..w...",
              ".....wWWWWw.Ww..",
              "......wWWwwWWw..",
              ".......wwWWWw...",
              "........wWWw....",
              ".........ww.....",
              "....oooooooo....",
              "..oollmmmmddoo..",
              ".olmkkkekkkkdmo.",
              ".omkkkeEekkkkdo.",
              "..oddkkkekkddo..",
              "...ooddddddoo...",
              "....ssssssss....",
              "................"]

OBSIDIAN = ["................",
            "................",
            "................",
            "................",
            "................",
            "......o.........",
            ".....olo........",
            ".....olmo...o...",
            "....olmmdo.olo..",
            "....ommddo.omdo.",
            "..o..ssss..oddo.",
            ".olo........ss..",
            ".omdo...........",
            "..ss.....oo.....",
            "........oldo....",
            ".........ss....."]

CACTUS = ["................",
          "................",
          "................",
          "................",
          "......pPp.......",
          ".....oPYPo......",
          "....olmpmdo.....",
          "...olmlmlmdo....",
          "...olmlmlmdo..o.",
          "...olmlmlmdo.olo",
          "...olmlmlmdo.omd",
          "....olmlmdo..omd",
          ".....oooo....oo.",
          "....ssssss..sss.",
          "................",
          "................"]

BONES = ["................",
         "................",
         "................",
         "................",
         "................",
         "....ooooo.......",
         "...owwwwwo......",
         "..owwwwwwgo.....",
         "..owkwwkwgo.....",
         "..owwwwwwgo..oo.",
         "...owgwggo..owwo",
         "....owwgo..owgo.",
         "..oo.ooo..owgo..",
         ".owwoooooowgo...",
         "..oggggggggo....",
         "...ssssssss....."]

GLOWSHROOM = ["................",
              "................",
              "................",
              "................",
              "....ooo.........",
              "...olllo........",
              "..ollwlmo...ooo.",
              "..olmmmmo..olwlo",
              "...oooooo..ommmo",
              "....ccd.....oco.",
              "....ccd..oo..cd.",
              "....ccd.olmo.cd.",
              "....cdd..cd..cd.",
              "...sssssssssss..",
              "................",
              "................"]

CRYSTALS = ["................",
            "................",
            "................",
            "................",
            "................",
            "......o.........",
            ".....owo........",
            ".....olmo..o....",
            "....olmmo.owo...",
            "..o.olmmdoolmo..",
            ".owoolmmdoolmdo.",
            ".olmoolmdo.omdo.",
            ".omdo.ooo...oo..",
            "..ss..sss...ss..",
            "................",
            "................"]

SHELLS = ["................",
          "................",
          "................",
          "................",
          "................",
          "................",
          "...o.o.o........",
          "..olplplo.......",
          "..opPpPpo....oo.",
          "..olplplo...olpo",
          "...oPPPo...olPPo",
          "....ooo....oPpo.",
          "....sss.....oo..",
          "......oo........",
          ".....owPo.......",
          "......oo........"]

BEACH_GRASS = ["................",
               "......l.........",
               ".....lm....l....",
               "..l..m.m..lm....",
               "..m..m..m.m...l.",
               "...m.m..mm...m..",
               "...m.m..m...m...",
               "....mmm.m..mm...",
               ".l..mdm.m.mm....",
               ".m...dm.mmd...l.",
               "..m..dmmdm...m..",
               "..mm.ddmdd..mm..",
               "...mmddddddmm...",
               ".....dddddd.....",
               "......ssss......",
               "................"]

CABLE_COIL = ["................",
              "................",
              "................",
              "................",
              "................",
              "......oooo......",
              "....oo....oo....",
              "...o..oooo..o...",
              "..o..o....o..o..",
              "..o.o..oo..o.o..",
              "..o.o..oo..o.oyy",
              "..o..o....o..oyY",
              "...o..oooo..o...",
              "....oo....oo....",
              "......oooo......",
              "................"]

UTIL_BOX = ["................",
            "................",
            "................",
            "..oooooooooooo..",
            "..ollllllllldo..",
            "..olmmmmmmmmdo..",
            "..olmmmmmmmmdo..",
            "..olmmyyymmmdo..",
            "..olmmyKymmmdo..",
            "..olmmyyymmmdo..",
            "..olmmmmmmmhdo..",
            "..olmmmmmmmmdo..",
            "..oddddddddddo..",
            "..oooooooooooo..",
            "...ssssssssss...",
            "................"]

BARRELS = ["................",
           "................",
           "................",
           "................",
           "...oooooo.......",
           "..obllllbo......",
           "..obbbbbbo......",
           "..oBBBBBBo.oooo.",
           "..obbbbbbooylyyo",
           "..obbbbbboyyyyYo",
           "..oBBBBBBoYYYYYo",
           "..obbbbbboyyyyYo",
           "..oddddddoYYYYYo",
           "...oooooo.ooooo.",
           "...ssssssssssss.",
           "................"]

CAN = ["................",
       "................",
       "................",
       "................",
       ".....ooooo......",
       "....o.....o.....",
       "....ooooooo.....",
       "...olllllldo...o",
       "..oolmmmmmdo..ol",
       ".o.olmmmmmdooolo",
       ".o.olmmmmmdmmmo.",
       "..oolmmmmmdoo...",
       "...olmmmmmdo....",
       "...oddddddddo...",
       "....ssssssss....",
       "................"]

LEAF_PILE = ["................",
             "................",
             "................",
             "................",
             "................",
             "................",
             ".......ab.......",
             ".....ab.bcab....",
             "...abcaabbcca...",
             "..aabbcabcabcb..",
             "..bcabbcaabbcc..",
             "...cbbcabcbcc...",
             ".....ccbbcc.....",
             "......ssss......",
             "................",
             "................"]

BRANCH = ["................",
          "................",
          "................",
          "................",
          "................",
          "................",
          "..........gg....",
          "........ggo.....",
          "..o....lo.......",
          "...oo.lmo.......",
          ".....lmmd.......",
          "...llmmd........",
          ".llmmdd..o......",
          "lmmdd...o.......",
          ".ss.....s.......",
          "................"]

TULIPS = ["................",
          "................",
          "..o.....o....o..",
          ".lmo...lmo..lmo.",
          ".mmd...mmd..mmd.",
          ".mdd...mdd..mdd.",
          "..g.....g....g..",
          "..g..k..g.k..g..",
          ".kg.kk..gkk..gk.",
          ".kgkk...gk..kgk.",
          "..gk....g....g..",
          "..g.....g....g..",
          "................",
          "................",
          "................",
          "................"]

TIDE_POOL_STAR = [".a.", "aAa", "a.a"]

PUDDLE_PROP = ["................",
               "................",
               "................",
               "................",
               "................",
               "......oooooo....",
               "....oobbwwbboo..",
               "...obbwwbbbbbbo.",
               "...obbbbbbbbbdo.",
               "....oddbbbbddo..",
               "......oooooo....",
               "..oo............",
               ".obwo...........",
               "..oo............",
               "................",
               "................"]


# ---------------------------------------------------------------- procedural props
def boulder(ramp, out, crack=None, glints=None, w=1):
    """Rounded boulder (1x1) with a lit top-left, optional crack line and ore glints."""
    def paint():
        im = canvas(w, 1)
        P.contact_shade(im, 2, w * 16 - 2, 14)
        draw_blobs(im, [(8, 8.5, 6.5, 5.5), (5.5, 10, 4, 3.5)], ramp, out, speck=61)
        p = im.load()
        for x, y in crack or ():
            if p[x, y][3]:
                p[x, y] = out + (255,)
        for (x, y), c in glints or ():
            if p[x, y][3]:
                p[x, y] = c + (255,)
        return [im]
    return paint


def driftwood():
    """Bleached driftwood (2x1): a pale, twisted branch with a forked end and dark knots."""
    im = canvas(2, 1)
    P.contact_shade(im, 3, 29, 13)
    p = im.load()
    pale = [(240, 232, 214), (214, 204, 184), (178, 166, 150), (126, 114, 108)]
    for x in range(4, 25):
        yc = 9 + round(1.2 * math.sin(x * 0.35))
        for y in range(yc - 2, yc + 2):
            t = y - (yc - 2)
            p[x, y] = (pale[0] if t == 0 else pale[1] if t < 3 else pale[2]) + (255,)
        p[x, yc - 3] = pale[3] + (255,)
        p[x, yc + 2] = pale[3] + (255,)
    for i in range(5):                                   # forked end
        p[24 + i // 2, 7 - i] = pale[1] + (255,)
        p[25 + i // 2, 7 - i] = pale[3] + (255,)
        p[24 + i, 9 + i // 2] = pale[2] + (255,)
        p[24 + i, 10 + i // 2] = pale[3] + (255,)
    for x, y in ((9, 9), (15, 8), (21, 10)):
        p[x, y] = pale[3] + (255,)
        p[x + 1, y] = pale[2] + (255,)
    p[3, 8] = p[3, 9] = p[3, 10] = pale[3] + (255,)
    return [im]


def tide_pool():
    """Tide pool (2x1): a ring of wet rocks round clear shallow water with a starfish and weed."""
    im = canvas(2, 1)
    d = ImageDraw.Draw(im)
    rock = [(212, 204, 196), (170, 160, 156), (128, 118, 120), (84, 76, 86)]
    P.contact_shade(im, 2, 30, 14)
    d.ellipse([1, 2, 30, 14], fill=rock[2] + (255,), outline=rock[3] + (255,))
    d.ellipse([4, 4, 27, 12], fill=(64, 136, 196, 255))
    d.ellipse([5, 5, 26, 11], fill=(110, 184, 226, 255))
    d.line([8, 6, 13, 6], fill=(206, 236, 250, 255))
    p = im.load()
    for x in range(2, 30):                               # lit rock tops along the upper rim
        for y in range(2, 6):
            if p[x, y][:3] == rock[2] and (x + y) % 3 == 0:
                p[x, y] = rock[0] + (255,)
    for x in (3, 9, 16, 22, 28):
        for y in range(10, 14):
            if p[x, y][:3] == rock[2]:
                p[x, y] = rock[1] + (255,)
    stamp(im, TIDE_POOL_STAR, {"a": (236, 120, 84), "A": (255, 186, 120)}, 18, 7)
    stamp(im, ["g.g", ".g."], {"g": (60, 150, 110)}, 8, 9)
    return [im]


def pick_crate():
    """Mine crate (1x1) with a pickaxe leaning on it."""
    im = canvas()
    stamp(im, P.CRATE, {"o": WOOD[3], "L": WOOD[0], "m": WOOD[1], "d": WOOD[2], "s": S})
    p = im.load()
    for i in range(10):                                  # handle, top-left to bottom-right
        p[3 + i, 1 + i] = (BARK[0] if i % 3 else BARK[1]) + (255,)
    for x, y in ((1, 3), (2, 2), (3, 1), (4, 0), (5, 0), (6, 1)):
        p[x, y] = STONE[3] + (255,)
    p[4, 1] = STONE[1] + (255,)
    p[2, 3] = STONE[1] + (255,)
    return [im]


# ---------------------------------------------------------------- base kits: coast and woods
SANDY = [(250, 232, 196), (240, 216, 172), (222, 192, 148), (196, 160, 122), (160, 124, 100)]
MARRAM = [(204, 214, 132), (156, 182, 98), (112, 144, 82), (78, 108, 70)]


def _dune_px(sand, grass):
    return tex(sand[1], [(BLADES, ((2, 1), (10, 4), (5, 9), (13, 12))), (GRAIN, ((7, 6), (1, 13), (12, 1)))],
               {"l": grass[0], "m": grass[1], "d": grass[2]})


def _shingle_px():
    g = [(214, 206, 196), (176, 168, 160), (138, 128, 126), (100, 92, 98)]
    return tex(SANDY[2], [(PEB, ((1, 1), (9, 2), (5, 7), (12, 9), (2, 12), (10, 13))), (PEB2, ((6, 3), (14, 6), (0, 9)))],
               {"l": g[0], "m": g[1], "d": g[2]})


def _litter_px():
    lawn = GRASS
    ink = {"a": (206, 160, 96), "b": (172, 120, 78), "c": (214, 190, 116), "l": lawn[0], "d": lawn[3]}
    return tex(mix(lawn[2], (156, 150, 96), 0.4), [(LEAFA, ((1, 1), (9, 5), (4, 10), (12, 13))),
                                                  (LEAFB, ((6, 2), (13, 9), (0, 6))),
                                                  (GRAIN, ((10, 0), (7, 14)))], ink)


def _moss_px(base, ramp):
    return tex(base, [(CUSHION, ((0, 0), (8, 5), (3, 10))), (MOSS, ((11, 12), (12, 0)))],
               {"l": ramp[0], "m": ramp[1], "d": ramp[2]})


BASE_TERRAIN = {
    # coast: marram dune grass on sand, a pebble shingle
    "dune-grass": patch(_dune_px(SANDY, MARRAM), 6.0, 81, "SAND"),
    "shingle": patch(_shingle_px(), 5.5, 83, "NORMAL", rim=SANDY[3]),
    # woods: fallen leaves over the forest-floor lawn, deep moss cushions
    "leaf-litter": patch(_litter_px(), 6.0, 85, "SHORT_GRASS"),
    "moss": patch(_moss_px((84, 152, 84), [(132, 194, 104), (98, 166, 88), (62, 124, 74)]), 6.0, 87),
}

BASE_PROPS = {
    "shells": F(sprite(SHELLS, {"o": (150, 104, 98), "l": (255, 236, 222), "p": (246, 196, 180), "P": (226, 150, 140),
                                "w": (255, 250, 240), "s": S}), walk=True),
    "beach-grass": F(sprite(BEACH_GRASS, {"l": MARRAM[0], "m": MARRAM[1], "d": MARRAM[2], "s": S}), walk=True),
    "driftwood": F(driftwood, (2, 1)),
    "tide-pool": F(tide_pool, (2, 1)),
    "flowers-thrift": flower_spec([(255, 214, 230), (240, 150, 188), (200, 96, 146)], (255, 236, 200), P.SMALL_BLOSSOM,
                                  ((1, 3), (6, 1), (11, 3), (6, 7))),
    "leaf-pile": F(sprite(LEAF_PILE, {"a": (226, 156, 76), "b": (186, 106, 60), "c": (236, 200, 100), "s": S}), walk=True),
    "fallen-branch": F(sprite(BRANCH, {"l": BARK[0], "m": BARK[1], "d": BARK[2], "o": BARK[2], "g": LEAF[2], "s": S}),
                       walk=True),
    "mossy-rock": F(boulder([(170, 200, 140), (150, 150, 146), (118, 116, 120), (86, 84, 98)], (60, 58, 74),
                            glints=[((x, y), (112, 170, 90)) for x, y in ((5, 4), (6, 4), (7, 3), (8, 3), (9, 4),
                                                                           (4, 5), (5, 5), (10, 4))])),
    "toadstool-ring": F(recolor(P.mushrooms, {(214, 76, 72): (222, 150, 70), (120, 44, 52): (126, 70, 44)}), walk=True),
}


# ---------------------------------------------------------------- theme kits
def theme_pieces(prefix, L, R):
    """(TERRAIN, PROPS) of one gym theme's nature kit. L: the theme lawn ramp (5 tones, light ->
    dark), R: its leaf ramp (biome RAMPS). Every slug is prefixed `<prefix>-`."""
    T, Pp = {}, {}
    kit = KITS.get(prefix)
    if kit:
        kit(prefix, L, R, T, Pp)
    shade = L[3]
    # every theme: lawn-coloured tuft and a fern in its own foliage, plus its own bush family
    Pp.setdefault(f"{prefix}-tuft", F(tuft(L[0], L[2], L[4], shade), walk=True))
    Pp.setdefault(f"{prefix}-fern", F(fern(R[1], R[2], R[3], shade), walk=True))
    Pp.setdefault(f"{prefix}-bush", F(bush(R[:4], R[4])))
    Pp.setdefault(f"{prefix}-bush-wide", F(bush(R[:4], R[4], wide=True), (2, 1)))
    # pond banks: reeds and lily pads in the theme's foliage
    Pp.setdefault(f"{prefix}-bank-reeds", F(recolor(P.reeds, {LEAF[i]: R[i] for i in range(1, 5)}), bank=True))
    Pp.setdefault(f"{prefix}-lily-pad", F(recolor(P.lily_pad, {LEAF[i]: R[i] for i in range(1, 4)}), walk=True, water=True))
    return T, Pp


def kit_fire(p, L, R, T, Pp):
    ash = [(214, 210, 198), (190, 186, 174), (164, 158, 150), (136, 130, 126), (112, 106, 108)]
    cinder = [(170, 152, 148), (140, 122, 122), (112, 96, 100), (82, 68, 76)]
    ember = [(255, 180, 60), (232, 84, 30)]
    T[f"{p}-ash"] = patch(tex(ash[1], [(DASH, ((2, 2), (10, 5), (5, 10), (13, 13))), (GRAIN, SPOTS4),
                                       (["d"], ((7, 1), (15, 8), (3, 14)))],
                              {"l": ash[0], "d": ash[3]}), 6.0, 91, "NORMAL")
    T[f"{p}-cinder"] = patch(tex(cinder[1], [(PEB, ((1, 1), (9, 3), (4, 8), (12, 10), (0, 13))),
                                             (PEB2, ((6, 4), (14, 6), (8, 13))), (["e"], ((11, 1), (3, 12)))],
                                 {"l": cinder[0], "m": cinder[1], "d": cinder[3], "e": ember[1]}),
                             5.5, 93, "NORMAL", rim=cinder[2])
    T[f"{p}-singed"] = patch(tex(mix(L[2], (150, 120, 80), 0.35),
                                 [(TUFT3, SPOTS6), (GRAIN, ((7, 4), (14, 14)))],
                                 {"l": (214, 196, 140), "d": (120, 100, 72)}), 6.5, 95)
    Pp[f"{p}-steam-vent"] = F(sprite(STEAM_VENT, {"w": (214, 216, 222), "W": (246, 246, 250), "o": (46, 38, 52),
                                                  "l": cinder[0], "m": cinder[1], "d": cinder[3], "k": (34, 28, 40),
                                                  "e": ember[1], "E": ember[0], "s": S}))
    Pp[f"{p}-obsidian"] = F(sprite(OBSIDIAN, {"o": (24, 18, 32), "l": (156, 136, 190), "m": (74, 62, 96),
                                              "d": (46, 38, 60), "s": S}), walk=True)
    Pp[f"{p}-cinders"] = F(pebbles(cinder[0], cinder[1], cinder[3], L[3]), walk=True)
    Pp[f"{p}-tuft"] = F(tuft((222, 206, 150), (170, 150, 104), (110, 92, 70), L[3]), walk=True)
    Pp[f"{p}-fireweed"] = flower_spec([(255, 190, 226), (230, 110, 180), (176, 60, 140)], (255, 226, 150),
                                      P.SMALL_BLOSSOM, ((2, 1), (10, 2), (5, 6), (11, 7)),
                                      leaf=((150, 150, 100), (110, 108, 78)))
    Pp[f"{p}-ember-lily"] = flower_spec([(255, 222, 130), (250, 150, 60), (210, 80, 44)], (255, 246, 200),
                                        leaf=((150, 150, 100), (110, 108, 78)))
    Pp[f"{p}-bush"] = F(bush([(170, 164, 132), (138, 132, 106), (110, 104, 88), (84, 78, 72)], (52, 46, 50)))
    Pp[f"{p}-bush-wide"] = F(bush([(170, 164, 132), (138, 132, 106), (110, 104, 88), (84, 78, 72)], (52, 46, 50),
                                  wide=True), (2, 1))
    char_bark = [(96, 82, 80), (66, 54, 56), (40, 32, 38)]
    char_wood = [(132, 116, 108), (104, 88, 84), (70, 58, 60), (44, 36, 42)]
    Pp[f"{p}-charred-stump"] = F(recolor(P.stump, wood_swap(char_bark, char_wood)))
    Pp[f"{p}-charred-log"] = F(recolor(P.log, wood_swap(char_bark, char_wood, (cinder[1], cinder[2]))), (2, 1))
    Pp[f"{p}-rocks"] = F(rocks((40, 32, 46), cinder[0], cinder[1], cinder[2]))


def kit_ground(p, L, R, T, Pp):
    clay = [(238, 200, 152), (216, 170, 124), (188, 140, 100), (150, 104, 80)]
    red = [(240, 194, 156), (222, 164, 126), (198, 134, 104), (160, 98, 80)]
    CR1 = ["d.....", ".dl..d", "..ddd.", "..dl..", ".d....", ".d...."]
    CR2 = ["...d.", "dd.d.", "l.d..", "..dl.", "...d."]
    T[f"{p}-cracked"] = patch(tex(clay[1], [(CR1, ((1, 1),)), (CR2, ((9, 8),)), (["dd", "l."], ((11, 2), (3, 12))),
                                            (GRAIN, ((13, 5), (6, 9), (14, 14)))],
                                  {"d": clay[3], "l": clay[0]}), 5.5, 97, "NORMAL", rim=clay[2])
    T[f"{p}-red-sand"] = patch(tex(red[1], [(["lll."], ((1, 2), (9, 6), (3, 10), (11, 14))),
                                            (["..dd"], ((5, 3), (13, 7), (7, 11), (0, 15))), (GRAIN, ((14, 1), (6, 8)))],
                                   {"l": red[0], "d": red[2]}), 6.0, 99, "SAND")
    scrub = [(226, 212, 150), (176, 164, 98), (130, 122, 78)]
    T[f"{p}-scrub"] = patch(tex(mix(L[2], (170, 150, 100), 0.3), [(BLADES, ((1, 1), (9, 4), (4, 9), (12, 12))),
                                                                (GRAIN, ((7, 7), (14, 1), (2, 14)))],
                                {"l": scrub[0], "m": scrub[1], "d": scrub[2]}), 6.5, 101)
    bone = {"o": (138, 116, 98), "w": (244, 236, 218), "g": (206, 192, 170), "k": (92, 72, 62), "s": S}
    Pp[f"{p}-cactus"] = F(sprite(CACTUS, {"o": (40, 72, 56), "l": (140, 196, 110), "m": (90, 156, 88),
                                          "d": (60, 116, 72), "p": (250, 150, 180), "P": (226, 96, 140),
                                          "Y": (255, 220, 120), "s": S}))
    Pp[f"{p}-bones"] = F(sprite(BONES, bone), walk=True)
    mesa = [(240, 186, 140), (214, 148, 104), (180, 114, 84), (138, 82, 66)]
    Pp[f"{p}-cracked-boulder"] = F(boulder(mesa, (92, 54, 52), crack=((8, 4), (8, 5), (7, 6), (8, 7), (9, 8),
                                                                    (9, 9), (8, 10), (10, 7), (11, 6))))
    Pp[f"{p}-pebbles"] = F(pebbles(red[0], red[2], red[3], L[3]), walk=True)
    Pp[f"{p}-tuft"] = F(tuft(scrub[0], scrub[1], scrub[2], L[3]), walk=True)
    Pp[f"{p}-marigold"] = flower_spec([(255, 230, 130), (250, 176, 60), (216, 116, 44)], (150, 90, 50),
                                      P.SMALL_BLOSSOM, ((1, 3), (6, 1), (11, 3), (6, 7)),
                                      leaf=((150, 160, 96), (110, 120, 76)))
    Pp[f"{p}-desert-bloom"] = flower_spec([(255, 210, 226), (236, 140, 170), (190, 90, 130)], (255, 236, 160),
                                          P.STAR_BLOSSOM, ((0, 2), (9, 1), (5, 6)), leaf=((150, 160, 96), (110, 120, 76)))
    sage = [(200, 206, 160), (160, 170, 128), (124, 136, 104), (92, 104, 84)]
    Pp[f"{p}-bush"] = F(bush(sage, (58, 66, 56)))
    Pp[f"{p}-bush-wide"] = F(bush(sage, (58, 66, 56), wide=True), (2, 1))
    dry_bark = [(176, 140, 104), (130, 100, 80), (86, 64, 56)]
    dry_wood = [(240, 210, 160), (214, 170, 120), (170, 126, 90), (120, 86, 66)]
    Pp[f"{p}-stump"] = F(recolor(P.stump, wood_swap(dry_bark, dry_wood)))
    Pp[f"{p}-log"] = F(recolor(P.log, wood_swap(dry_bark, dry_wood, (dry_bark[0], dry_bark[1]))), (2, 1))
    Pp[f"{p}-rocks"] = F(rocks((92, 54, 52), mesa[0], mesa[1], mesa[2]))


def kit_poison(p, L, R, T, Pp):
    mud = [(156, 138, 118), (126, 106, 90), (102, 84, 74), (76, 62, 58)]
    wet = [(184, 206, 204), (122, 156, 160), (80, 108, 116)]
    T[f"{p}-mud"] = patch(tex(mud[1], [(["l.", ".d"], ((2, 2), (10, 5), (5, 10), (13, 13))),
                                       (["w"], ((7, 3), (11, 11))), (["dd"], ((4, 6), (12, 1), (8, 14)))],
                              {"l": mud[0], "d": mud[3], "w": wet[0]}), 5.5, 103, "NORMAL", rim=mud[2])
    moss = [(150, 196, 116), (110, 162, 96), (72, 122, 82)]
    T[f"{p}-moss"] = patch(_moss_px(mix(L[3], moss[2], 0.5), moss), 6.0, 105)
    sedge = [(170, 200, 150), (110, 150, 110), (64, 96, 78)]
    T[f"{p}-sedge"] = patch(tex(mix(L[3], mud[1], 0.3), [(BLADES, ((1, 1), (9, 4), (4, 9), (12, 12))),
                                                        (TUFT3, ((11, 0), (1, 13))), (["w"], ((7, 7), (14, 9)))],
                                {"l": sedge[0], "m": sedge[1], "d": sedge[2], "w": wet[1]}), 6.0, 107)
    Pp[f"{p}-puddle"] = F(sprite(PUDDLE_PROP, {"o": mud[2], "b": wet[1], "w": wet[0], "d": wet[2]}), walk=True)
    Pp[f"{p}-tuft"] = F(tuft(sedge[0], sedge[1], sedge[2], L[3]), walk=True)
    Pp[f"{p}-pebbles"] = F(pebbles((170, 170, 156), (130, 130, 120), (84, 86, 84), L[3]), walk=True)
    Pp[f"{p}-loosestrife"] = flower_spec([(236, 190, 240), (196, 120, 214), (140, 76, 170)], (250, 220, 240),
                                         P.SMALL_BLOSSOM, ((2, 1), (10, 2), (5, 6), (11, 7)))
    Pp[f"{p}-marsh-marigold"] = flower_spec([(255, 240, 150), (246, 206, 70), (200, 150, 50)], (170, 120, 60),
                                            P.SMALL_BLOSSOM, ((1, 3), (6, 1), (11, 3), (6, 7)))
    rot_bark = [(110, 96, 74), (78, 66, 56), (50, 42, 40)]
    rot_wood = [(170, 150, 110), (140, 120, 90), (104, 88, 70), (70, 58, 52)]
    Pp[f"{p}-rotten-log"] = F(recolor(P.log, wood_swap(rot_bark, rot_wood, (moss[0], moss[1]))), (2, 1))
    Pp[f"{p}-stump"] = F(recolor(P.stump, wood_swap(rot_bark, rot_wood)))
    Pp[f"{p}-rocks"] = F(rocks((44, 46, 50), (150, 152, 132), (118, 120, 106), (92, 94, 86)))


def kit_rock(p, L, R, T, Pp):
    g = [(214, 214, 214), (176, 176, 180), (140, 140, 148), (104, 104, 116)]
    T[f"{p}-gravel"] = patch(tex(g[1], [(PEB2, ((1, 1), (6, 3), (11, 1), (3, 7), (9, 6), (14, 8), (0, 12), (6, 11),
                                                (12, 13))), (["d"], ((4, 4), (13, 4), (9, 10), (3, 14)))],
                                 {"l": g[0], "m": g[2], "d": g[3]}), 5.5, 109, "NORMAL", rim=g[2])
    slate = [(200, 208, 214), (158, 168, 182), (122, 132, 150), (90, 98, 118)]
    TALUS = [".lll.", "lmmmd", ".ddd."]
    T[f"{p}-talus"] = patch(tex(mix(L[2], g[2], 0.35), [(TALUS, ((1, 1), (9, 4), (3, 9), (11, 12))),
                                                        (CHIP, ((7, 0), (14, 7), (0, 5), (7, 13)))],
                                {"l": slate[0], "m": slate[1], "d": slate[3]}), 6.0, 111, "NORMAL")
    lichen = [(226, 220, 150), (196, 186, 110), (150, 146, 96)]
    ROSETTE = [".l.", "lml", ".d."]
    T[f"{p}-lichen"] = patch(tex(L[2], [(ROSETTE, ((1, 2), (9, 1), (5, 8), (13, 10), (2, 13))),
                                        (GRAIN, ((11, 5), (7, 13)))], {"l": lichen[0], "m": lichen[1], "d": lichen[2]}),
                             6.5, 113)
    Pp[f"{p}-ore-rock"] = F(boulder(slate, (58, 62, 82), glints=[((6, 6), (255, 214, 110)), ((7, 6), (226, 160, 70)),
                                                                ((10, 9), (255, 214, 110)), ((5, 10), (196, 236, 240)),
                                                                ((11, 8), (226, 160, 70))]))
    Pp[f"{p}-pick-crate"] = F(pick_crate)
    Pp[f"{p}-pebbles"] = F(pebbles(slate[0], slate[1], slate[3], L[3]), walk=True)
    Pp[f"{p}-tuft"] = F(tuft(L[0], (130, 150, 118), (84, 100, 84), L[3]), walk=True)
    Pp[f"{p}-edelweiss"] = flower_spec([(255, 255, 250), (226, 230, 226), (180, 186, 180)], (230, 210, 120),
                                       P.STAR_BLOSSOM, ((0, 2), (9, 1), (5, 6)))
    Pp[f"{p}-saxifrage"] = flower_spec([(255, 220, 236), (240, 160, 196), (200, 110, 156)], (255, 240, 200),
                                       P.SMALL_BLOSSOM, ((1, 3), (6, 1), (11, 3), (6, 7)))
    Pp[f"{p}-rocks"] = F(rocks((58, 62, 82), slate[0], slate[1], slate[2]))
    Pp[f"{p}-stump"] = F(P.stump)


def kit_psychic(p, L, R, T, Pp):
    moss = [(170, 214, 206), (124, 180, 176), (88, 140, 142)]
    T[f"{p}-moss"] = patch(_moss_px(mix(L[3], moss[2], 0.4), moss), 6.0, 115)
    lil = {"a": mix(L[3], (100, 130, 140), 0.3), "b": L[2], "w": (246, 240, 255), "Y": (214, 176, 240),
           "y": (190, 150, 226)}
    T[f"{p}-clover"] = patch(tex(L[1], [(TREFOIL, ((1, 1), (10, 6), (3, 11))), (BLOOM, ((8, 1), (13, 12))),
                                        (["y"], ((6, 7), (14, 3)))], dict(lil, Y=lil["Y"], w=lil["w"])),
                             6.0, 117)
    dust = [(238, 234, 250), (206, 200, 228), (176, 170, 206)]
    STAR = [".w.", "wWw", ".w."]
    T[f"{p}-stardust"] = patch(tex(mix(L[1], dust[2], 0.45), [(STAR, ((2, 2), (10, 9))), (["W"], ((7, 5), (13, 2),
                                                                                                  (4, 12), (14, 14)))],
                                   {"w": dust[1], "W": dust[0]}), 6.0, 119)
    Pp[f"{p}-glowshroom"] = F(sprite(GLOWSHROOM, {"o": (70, 60, 130), "l": (170, 236, 250), "m": (110, 190, 236),
                                                  "w": (250, 255, 255), "c": (226, 230, 246), "d": (176, 180, 210),
                                                  "s": S}), walk=True)
    Pp[f"{p}-crystal-shards"] = F(sprite(CRYSTALS, {"o": (90, 64, 140), "w": (255, 246, 255), "l": (240, 200, 255),
                                                    "m": (200, 150, 236), "d": (150, 100, 200), "s": S}), walk=True)
    Pp[f"{p}-lilac"] = flower_spec([(236, 214, 255), (200, 160, 240), (150, 110, 206)], (255, 240, 250),
                                   P.SMALL_BLOSSOM, ((2, 1), (10, 2), (5, 6), (11, 7)))
    Pp[f"{p}-moonflower"] = flower_spec([(250, 252, 255), (210, 226, 246), (160, 180, 220)], (196, 214, 255),
                                        P.STAR_BLOSSOM, ((0, 2), (9, 1), (5, 6)))
    Pp[f"{p}-pebbles"] = F(pebbles((240, 236, 250), (200, 194, 224), (140, 132, 180), L[3]), walk=True)
    Pp[f"{p}-tuft"] = F(tuft(L[0], (110, 160, 150), (70, 110, 110), L[3]), walk=True)
    Pp[f"{p}-rocks"] = F(rocks((90, 84, 124), (236, 230, 244), (206, 198, 224), (170, 162, 196)))
    Pp[f"{p}-stump"] = F(P.stump)


def kit_water(p, L, R, T, Pp):
    wet = [(226, 212, 180), (204, 188, 156), (180, 162, 134), (150, 132, 112)]
    T[f"{p}-wet-sand"] = patch(tex(wet[1], [(["llll."], ((1, 3), (9, 8), (4, 13))), (["..dd"], ((6, 4), (13, 9), (0, 14))),
                                            (["p"], ((12, 1), (3, 9)))],
                                   {"l": wet[0], "d": wet[2], "p": (240, 190, 180)}), 6.0, 121, "SAND", rim=wet[2])
    T[f"{p}-dune-grass"] = patch(_dune_px(SANDY, MARRAM), 6.0, 123, "SAND")
    T[f"{p}-thrift"] = patch(tex(L[1], [(CUSHION, ((1, 1), (9, 8))), (["pP", "Pp"], ((12, 2), (4, 12), (7, 5)))],
                                 {"l": L[0], "m": L[2], "d": L[3], "p": (246, 180, 206), "P": (214, 120, 164)}),
                             6.0, 125)
    Pp[f"{p}-tuft"] = F(sprite(BEACH_GRASS, {"l": (214, 220, 150), "m": (162, 182, 104), "d": (118, 140, 84), "s": S}),
                        walk=True)
    Pp[f"{p}-pebbles"] = F(pebbles((236, 232, 226), (200, 194, 190), (150, 142, 146), L[3]), walk=True)
    Pp[f"{p}-rocks"] = F(rocks((104, 94, 92), (246, 240, 226), (222, 212, 192), (192, 180, 162)))
    sea_bark = [(214, 204, 184), (178, 166, 150), (126, 114, 108)]
    sea_wood = [(244, 236, 218), (222, 212, 192), (186, 176, 160), (140, 130, 122)]
    Pp[f"{p}-stump"] = F(recolor(P.stump, wood_swap(sea_bark, sea_wood)))


def kit_electric(p, L, R, T, Pp):
    g = [(206, 208, 212), (170, 172, 178), (138, 140, 148), (100, 102, 112)]
    ANG = ["lm", "md"]
    T[f"{p}-gravel"] = patch(tex(g[1], [(ANG, ((0, 0), (5, 2), (10, 0), (14, 4), (2, 6), (8, 7), (12, 10), (4, 11),
                                               (0, 14), (9, 13))), (["d"], ((7, 4), (14, 13), (3, 9)))],
                                 {"l": g[0], "m": g[2], "d": g[3]}), 5.5, 127, "NORMAL", rim=g[2])
    stripes = ["llllllllllllllll"] * 8 + ["................"] * 8
    T[f"{p}-mown"] = patch(tex(L[2], [(["d.d"], ((2, 11), (10, 14))), (["m.m"], ((5, 3), (13, 6)))],
                               {"l": mix(L[0], L[1], 0.5), "d": L[3], "m": L[1]}, full=stripes), 6.0, 129)
    dust = [(206, 200, 186), (184, 178, 164), (156, 150, 140)]
    T[f"{p}-dust"] = patch(tex(dust[1], [(GRAIN, SPOTS6), (DASH, ((4, 4), (12, 11))),
                                         (["s.s", ".m."], ((10, 2), (2, 10)))],
                               {"l": dust[0], "d": dust[2], "s": L[1], "m": L[2]}), 5.5, 131, "NORMAL", rim=dust[2])
    Pp[f"{p}-cable-coil"] = F(sprite(CABLE_COIL, {"o": (40, 40, 52), "y": (250, 200, 60), "Y": (200, 140, 40)}),
                              walk=True)
    Pp[f"{p}-utility-box"] = F(sprite(UTIL_BOX, {"o": (60, 64, 80), "l": (214, 218, 224), "m": (178, 184, 194),
                                                 "d": (130, 136, 150), "y": (250, 210, 60), "K": (40, 40, 52),
                                                 "h": (90, 96, 110), "s": S}))
    Pp[f"{p}-barrels"] = F(sprite(BARRELS, {"o": (40, 44, 64), "b": (80, 130, 200), "B": (60, 100, 170),
                                            "l": (150, 190, 236), "d": (44, 70, 130), "y": (250, 206, 70),
                                            "Y": (210, 160, 50), "s": S}))
    Pp[f"{p}-pebbles"] = F(pebbles(g[0], g[1], g[3], L[3]), walk=True)
    Pp[f"{p}-tuft"] = F(tuft(L[0], L[2], L[4], L[3]), walk=True)
    Pp[f"{p}-dandelions"] = flower_spec([(255, 246, 150), (250, 220, 70), (214, 170, 50)], (200, 140, 40),
                                        P.SMALL_BLOSSOM, ((1, 3), (6, 1), (11, 3), (6, 7)))
    Pp[f"{p}-clover-flowers"] = flower_spec([(255, 255, 255), (232, 236, 240), (196, 200, 214)], (240, 200, 210),
                                            P.SMALL_BLOSSOM, ((2, 1), (10, 2), (5, 6), (11, 7)))
    box = [(160, 200, 120), (118, 168, 96), (86, 136, 84), (60, 104, 72)]
    Pp[f"{p}-bush"] = F(bush(box, (36, 64, 52)))
    Pp[f"{p}-bush-wide"] = F(bush(box, (36, 64, 52), wide=True), (2, 1))
    Pp[f"{p}-rocks"] = F(rocks((72, 76, 90), (214, 216, 218), (180, 184, 188), (146, 150, 158)))
    Pp[f"{p}-stump"] = F(P.stump)


def kit_grass(p, L, R, T, Pp):
    ink = {"a": L[3], "b": L[2], "w": (255, 250, 246), "Y": (250, 210, 90), "r": (240, 110, 120), "R": (255, 190, 190),
           "v": (176, 150, 240), "y": (255, 232, 120)}
    T[f"{p}-flower-meadow"] = patch(tex(L[1], [(BLOOM, ((1, 1), (9, 9))), (["R.", "rR"], ((10, 2), (2, 10))),
                                               (["v"], ((6, 5), (14, 13), (5, 14))), (["y"], ((13, 6), (1, 7))),
                                               (TREFOIL, ((5, 9), (12, 0)))], ink), 6.0, 133)
    mulch = [(196, 150, 108), (166, 120, 88), (142, 100, 76), (110, 78, 64)]
    T[f"{p}-mulch"] = patch(tex(mulch[2], [(["lm", ".d"], ((1, 1), (6, 4), (11, 2), (3, 9), (9, 8), (14, 11), (6, 13),
                                                         (12, 15))), (["mm"], ((4, 6), (13, 6), (0, 13)))],
                                {"l": mulch[0], "m": mulch[1], "d": mulch[3]}), 5.0, 135, "NORMAL", rim=mulch[3])
    Pp[f"{p}-watering-can"] = F(sprite(CAN, {"o": (36, 70, 60), "l": (140, 210, 160), "m": (90, 170, 130),
                                             "d": (60, 130, 110), "s": S}))
    Pp[f"{p}-tulips"] = F(sprite(TULIPS, {"o": (150, 40, 60), "l": (255, 170, 170), "m": (236, 90, 100),
                                          "d": (180, 50, 70), "g": (70, 140, 80), "k": (110, 180, 90)}), walk=True)
    Pp[f"{p}-pinks"] = flower_spec([(255, 220, 236), (246, 150, 196), (210, 96, 150)], (255, 250, 220),
                                   P.STAR_BLOSSOM, ((0, 2), (9, 1), (5, 6)))
    Pp[f"{p}-cornflowers"] = flower_spec([(200, 224, 255), (110, 150, 240), (70, 96, 200)], (250, 240, 200),
                                         P.SMALL_BLOSSOM, ((2, 1), (10, 2), (5, 6), (11, 7)))


for _d in (BASE_TERRAIN, BASE_PROPS):
    for _spec in _d.values():
        _spec["nature"] = True

KITS = {"fire": kit_fire, "ground": kit_ground, "poison": kit_poison, "rock": kit_rock, "psychic": kit_psychic,
        "water": kit_water, "electric": kit_electric, "grass": kit_grass}
