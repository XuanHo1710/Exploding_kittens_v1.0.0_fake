"""Poison gym (Toadstool Bog Hall) surroundings: bog mud, bubbling toxic pools, plank boardwalk,
toadstool clusters, crooked dead trees, cauldrons, slime barrels, mushroom lamps, brambles.
Palette pulled from the gym's own sheet (plum planks, toadstool purple, verdigris hoops, moss,
bone stems, toxic green glow) so pieces sit next to it without clashing.
Slugs are prefixed `poison-`. GYM describes the review scene (review-gym-poison.png)."""
import math

from PIL import ImageDraw

from overworld_kit import contact_shade, draw_blobs

TAU = 2 * math.pi
MUD = [(144, 120, 114), (120, 98, 100), (100, 80, 90), (76, 60, 74), (52, 40, 58)]
MOSS = [(176, 192, 100), (138, 162, 78), (104, 128, 64), (76, 98, 56), (52, 68, 46)]
MURK = [(150, 158, 170), (92, 100, 112), (62, 66, 84)]           # puddle glint / water / deep
GLOW = [(240, 255, 200), (190, 255, 110), (130, 230, 60), (80, 180, 50), (50, 120, 50)]
WOODP = [(196, 156, 116), (164, 124, 92), (130, 94, 74), (96, 66, 58), (66, 44, 46)]
CAP = [(222, 156, 244), (188, 110, 228), (150, 74, 200), (112, 50, 160), (74, 32, 114)]
STEM = [(240, 232, 208), (214, 202, 178), (180, 166, 150), (140, 124, 120), (98, 86, 96)]
IRON = [(128, 124, 150), (94, 90, 116), (68, 64, 90), (48, 44, 68), (32, 28, 46)]
HOOP = [(182, 214, 180), (132, 174, 150), (94, 132, 118), (64, 94, 92), (42, 62, 66)]
DEAD = [(186, 170, 172), (152, 134, 144), (120, 102, 120), (84, 66, 90), (48, 34, 58)]
BRIAR = [(160, 112, 176), (126, 80, 148), (96, 56, 120), (70, 40, 94)]
PEAT = [(132, 108, 104), (108, 86, 88), (92, 72, 80), (78, 60, 70), (58, 44, 56)]   # bog-ground peat
THORN = (40, 22, 52)                 # bramble-wall outline / thorns


def _has(facing, side):
    return facing is not None and side in facing


def _a(c):
    return c + (255,)


# ---------------------------------------------------------------- terrain
# Ground fill: soft plum-brown peat. Each variant is a calm base with a few irregular specks
# (moss clumps, damp dark smears, pale grit) so big areas read as one surface, not a grid.
_GROUND = [
    dict(moss=((3, 4),), damp=((9, 11, 3),), grit=((13, 2), (6, 13))),
    dict(moss=((11, 9),), damp=((2, 3, 2),), grit=((7, 6),)),
    dict(moss=((5, 12), (13, 3)), damp=(), grit=((10, 14),)),
    dict(moss=(), damp=(), grit=((4, 8),)),
]


def ground_px(x, y, v=0):
    x, y = x % 16, y % 16
    g = _GROUND[v % len(_GROUND)]
    for tx, ty in g["moss"]:
        if (x, y) in ((tx, ty), (tx + 1, ty), (tx + 2, ty + 1)):
            return MOSS[3]
        if (x, y) in ((tx + 1, ty - 1),):
            return MOSS[2]
        if (x, y) == (tx, ty + 1):
            return PEAT[3]
    for tx, ty, w in g["damp"]:
        if y == ty and tx <= x < tx + w:
            return PEAT[3]
        if y == ty + 1 and tx + 1 <= x < tx + w + 1:
            return PEAT[3]
        if y == ty - 1 and x == tx + 1:
            return PEAT[1]
    if (x, y) in g["grit"]:
        return PEAT[1]
    return PEAT[2]


def _gnd(d, x, y):
    return PEAT[3] if d > -1.5 else ground_px(x, y)

PUDDLES = ((3, 5, 4),)               # (x, y, width) of a 2-row murky puddle
WET = (68, 54, 70)                   # wet bog mud, a step darker than the peat ground


def _bog_px(x, y):
    for px, py, w in PUDDLES:
        if py <= y <= py + 1 and px <= x < px + w:
            if y == py and x == px + 1:
                return MURK[0]                       # glint
            return MURK[2] if y == py else MURK[1]
        if y == py + 2 and px + 1 <= x < px + w:
            return MUD[3]                            # lit lower lip
    if (x, y) in ((11, 11), (12, 11), (13, 12)):
        return MOSS[3]
    if (x, y) == (12, 10):
        return MOSS[2]
    if (x, y) == (13, 3):
        return GLOW[2]                               # a single glowing spore speck
    if (x, y) in ((9, 1), (1, 13), (14, 7)):
        return MUD[3]
    return WET


def bog(d, facing, x, y, f, m):
    """Dark plum bog mud with murky puddles, moss tufts and a glowing spore; ragged edge into the peat ground."""
    if d < 0:
        return _gnd(d, x, y)
    if d < 1:
        return MUD[4]
    if d < 2 and (_has(facing, "N") or _has(facing, "W")):
        return MUD[4]                                # sunken: shaded inner lip top-left
    if d < 2 and _has(facing, "S"):
        return MUD[3]
    return _bog_px(x, y)


BUBBLES = ((4, 4, 0), (11, 6, 1), (7, 12, 2), (13, 13, 3))     # (x, y, phase)


def toxic_pool(d, facing, x, y, f, m):
    """Sunken toxic ooze, 4 frames: mud rim with a short south face, bright crust, bubbles that
    swell and pop in a 4-frame cycle, slow churning swirls."""
    if d < -2:
        return _gnd(d, x, y)
    if d < -1:
        return MUD[4] if (x * 3 + y) % 5 else MUD[3]  # wet mud lip, sits on bog or peat alike
    if d < 0:
        return MUD[3]
    if d < 1:
        return MUD[4]
    if _has(facing, "N") and d < 4:
        return MUD[3] if d < 3 else MUD[4]
    if d < 2.5:
        return GLOW[1]
    for bx, by, ph in BUBBLES:
        s = (f + ph) % 4
        dx, dy = x - bx, y - by
        if s == 1 and (dx, dy) == (0, 0):
            return GLOW[0]
        if s == 2 and abs(dx) <= 1 and abs(dy) <= 1:
            return GLOW[0] if (dx, dy) == (-1, -1) else GLOW[1] if (dx, dy) != (0, 0) else GLOW[2]
        if s == 3 and abs(dx) + abs(dy) == 2 and dx * dy == 0:
            return GLOW[1]                                         # pop splash
    a = TAU / 16
    v = math.sin(a * (x + 2 * f) + 1.3 * math.sin(a * y)) + 0.6 * math.sin(2 * a * y + 0.8 * math.cos(a * x))
    return GLOW[1] if v > 1.15 else GLOW[2] if v > -0.5 else GLOW[3]


def boardwalk(d, facing, x, y, f, m):
    """Raised plank boardwalk like the gym's porch: cross boards, staggered butt joints, nail heads,
    a 2 px south face where it steps down to the ground."""
    if d < 0:
        return _gnd(d, x, y)
    if d < 1:
        return WOODP[4]
    if _has(facing, "S") and d < 3:
        return WOODP[3] if d < 2 else WOODP[4] if x % 4 == 3 else WOODP[3]
    if d < 2 and (_has(facing, "N") or _has(facing, "W")):
        return WOODP[0]
    row, yy = y // 4, y % 4
    if yy == 3:
        return WOODP[4]
    joint = (row * 7 + 3) % 16
    if x == joint:
        return WOODP[3]
    if yy == 1 and x in ((joint + 2) % 16, (joint - 2) % 16):
        return WOODP[4]                                            # nail heads
    if yy == 0:
        return WOODP[0] if (x + row * 5) % 9 else WOODP[1]
    if (x * 3 + row * 5) % 11 == 0:
        return WOODP[2]                                            # grain speck
    return WOODP[1]


_LOBE = [  # per 8 px lobe in the 16 px tile: (radius, berry?, cane?)
    (0.97, True, False), (0.90, False, True), (0.93, False, False), (0.99, False, True)]


def _bramble_lobe(x, y):
    """Tangled bramble clumps on an 8 px staggered lattice (periodic in 16), lit top-left, each
    lobe a little different: thorn tips, pale dead canes, the odd glowing berry."""
    row = y // 8
    sx = x + (4 if row % 2 else 0)
    u, v = sx % 8, y % 8
    rad, berry, cane = _LOBE[(sx // 8) % 2 + 2 * (row % 2)]
    nx, ny = (u + 0.5 - 4) / 4, (v + 0.5 - 4) / 4
    r = math.hypot(nx, ny)
    if r > rad:
        return THORN
    l = -nx * 0.65 - ny * 0.75
    c = BRIAR[1] if l > 0.75 else BRIAR[2] if l > -0.1 else BRIAR[3] if l > -0.7 else (58, 32, 76)
    if (u, v) == (6, 2):
        return THORN                                               # thorn tip
    if berry and (u, v) == (4, 5):
        return GLOW[1]
    if cane and v == 6 - u // 2 and 2 <= u <= 5:
        return DEAD[1]                                             # pale dead cane
    return c


def border(d, facing, x, y, f, m):
    """Raised wall of thorny purple bramble with gnarled dead trunks showing on its south face."""
    if d < 0:
        return PEAT[4] if _has(facing, "S") and d > -2 else _gnd(d, x, y)
    if d < 1:
        return THORN
    if d < 2 and (x * 7 + y * 3) % 11 == 0:
        return DEAD[1]                                             # dead twig tips poking out
    if _has(facing, "S") and d < 6:
        k = x % 8
        if k in (2, 3) and d < 5:                                  # dead trunks under the canopy
            return DEAD[4] if d < 1.8 else DEAD[2] if k == 2 else DEAD[3]
        if k == 6 and d < 2.5:
            return DEAD[3]                                         # root spur
        return BRIAR[3] if d >= 4.5 else THORN if (x + int(d)) % 4 == 0 else (60, 34, 80)
    return _bramble_lobe(x, y)


TERRAIN = {
    "poison-ground": dict(kind="fill", behaviour="NORMAL",
                          variants=[(lambda x, y, v=v: ground_px(x, y, v)) for v in range(4)]),
    "poison-border": dict(kind="blob", behaviour="NORMAL", paint=border, emissive=[GLOW[1]],
                          sdf=dict(margin=1.0, radius=5, wobble=1.6, freq=2)),
    "poison-bog": dict(kind="blob", behaviour="NORMAL", paint=bog, emissive=[GLOW[1]],
                       sdf=dict(margin=2.5, radius=4, wobble=1.4, freq=2)),
    "poison-toxic-pool": dict(kind="blob", behaviour="NORMAL", paint=toxic_pool, frames=4, emissive=GLOW[:4],
                              overlay_cut=-2.0,
                              sdf=dict(margin=2, radius=3, wobble=0.6, freq=1)),
    "poison-boardwalk": dict(kind="blob", behaviour="NORMAL", paint=boardwalk,
                             sdf=dict(margin=1.5, radius=2, wobble=0.0, freq=1)),
}


# ---------------------------------------------------------------- props
def _canvas(w, h):
    from PIL import Image
    return Image.new("RGBA", (w * 16, h * 16), (0, 0, 0, 0))


def _cap(d, cx, top, rx, ry, spots):
    """Toadstool cap: dome from y=top down ry px, half-width rx; lit top-left, dark rim, spots."""
    d.chord([cx - rx, top, cx + rx, top + 2 * ry], 180, 360, fill=_a(CAP[2]), outline=_a(CAP[4]))
    d.line([cx - rx + 1, top + ry, cx + rx - 1, top + ry], fill=_a(CAP[4]))
    d.ellipse([cx - rx + 2, top + 1, cx, top + ry - 1], fill=_a(CAP[1]))
    d.point((cx - rx + 2, top + 2), fill=_a(CAP[0]))
    d.line([cx + 1, top + ry - 1, cx + rx - 1, top + ry - 1], fill=_a(CAP[3]))
    for sx, sy in spots:
        d.point((cx + sx, top + sy), fill=_a(GLOW[1]))


def _stem(d, x0, y0, x1, y1):
    d.rectangle([x0, y0, x1, y1], fill=_a(STEM[1]), outline=_a(STEM[4]))
    d.line([x0 + 1, y0 + 1, x0 + 1, y1 - 1], fill=_a(STEM[0]))


def toadstools():
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 15, 14, alpha=90)
    _stem(d, 4, 7, 7, 14)
    _cap(d, 5, 1, 5, 6, ((-2, 3), (1, 2), (3, 4)))
    _stem(d, 11, 10, 13, 14)
    _cap(d, 12, 6, 3, 4, ((0, 2),))
    _stem(d, 8, 12, 9, 15)
    d.ellipse([6, 10, 11, 14], fill=_a(CAP[2]), outline=_a(CAP[4]))
    d.rectangle([7, 13, 10, 13], fill=_a(CAP[4]))
    d.point((7, 11), fill=_a(CAP[0]))
    d.point((9, 11), fill=_a(GLOW[1]))
    return [im]


def dead_tree():
    im = _canvas(2, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 8, 25, 30, alpha=100)
    d.polygon([(11, 30), (21, 30), (18, 26), (19, 15), (16, 10), (14, 15), (15, 26)],
              fill=_a(DEAD[2]), outline=_a(DEAD[4]))
    d.line([15, 16, 15, 28], fill=_a(DEAD[0]))
    d.line([16, 14, 16, 25], fill=_a(DEAD[1]))
    d.line([19, 16, 19, 27], fill=_a(DEAD[3]))
    for pts in (((16, 18), (11, 14), (6, 13), (3, 9)), ((17, 15), (22, 11), (24, 6), (28, 4)),
                ((16, 11), (14, 6), (16, 2)), ((11, 14), (9, 8)), ((22, 11), (27, 12))):
        d.line(pts, fill=_a(DEAD[2]), width=2, joint="curve")
        d.line([(x - 1, y) for x, y in pts], fill=_a(DEAD[1]))
        for x, y in pts[-1:]:
            d.point((x, y - 1), fill=_a(DEAD[3]))
    d.point((17, 21), fill=_a(DEAD[4]))                          # knot hole
    d.point((17, 22), fill=_a(DEAD[4]))
    for x, y0, n in ((6, 14, 4), (9, 14, 3), (22, 12, 5), (25, 7, 3), (14, 7, 3)):  # hanging moss
        for k in range(n):
            d.point((x, y0 + k), fill=_a(MOSS[2] if k < n - 1 else MOSS[3]))
        d.point((x, y0), fill=_a(MOSS[1]))
    for x, y in ((10, 29), (22, 29)):                             # root flares
        d.line([x, y, x + 2, y - 1], fill=_a(DEAD[3]))
    return [im]


def cauldron():
    frames = []
    for k in range(3):
        im = _canvas(1, 1)
        d = ImageDraw.Draw(im)
        contact_shade(im, 2, 14, 14, alpha=100)
        d.line([4, 13, 4, 14], fill=_a(IRON[4]))
        d.line([11, 13, 11, 14], fill=_a(IRON[4]))
        d.ellipse([1, 5, 14, 14], fill=_a(IRON[2]), outline=_a(IRON[4]))
        d.arc([3, 7, 9, 13], 160, 250, fill=_a(IRON[0]))
        d.point((4, 9), fill=_a(IRON[0]))
        d.arc([5, 7, 13, 13], 0, 90, fill=_a(IRON[3]))
        d.ellipse([1, 4, 14, 8], fill=_a(IRON[1]), outline=_a(IRON[4]))
        d.ellipse([3, 5, 12, 7], fill=_a(GLOW[2]))
        d.line([4, 6, 7, 6], fill=_a(GLOW[1]))
        drip = (5, 8 + k) if k < 2 else None                       # slime dribble down the side
        d.line([5, 8, 5, 9], fill=_a(GLOW[2]))
        if drip:
            d.point(drip, fill=_a(GLOW[3]))
        for i, (x, y) in enumerate(((7, 4), (9, 2), (6, 0))):
            yy = y - k
            if yy >= 0:
                d.point((x + (i + k) % 2, yy), fill=_a(GLOW[1] if i == 0 else GLOW[0]))
        if k == 1:
            d.point((10, 5), fill=_a(GLOW[0]))
        frames.append(im)
    return frames


def mushroom_lamp():
    im = _canvas(1, 2)
    d = ImageDraw.Draw(im)
    contact_shade(im, 3, 13, 30, alpha=90)
    d.ellipse([4, 27, 11, 30], fill=_a(MOSS[3]), outline=_a(MOSS[4]))
    d.point((5, 28), fill=_a(MOSS[1]))
    _stem(d, 6, 11, 9, 28)
    d.line([8, 14, 8, 26], fill=_a(STEM[2]))
    d.ellipse([5, 8, 10, 13], fill=_a(GLOW[1]), outline=_a(GLOW[3]))     # glowing bulb under the cap
    d.point((6, 10), fill=_a(GLOW[0]))
    _cap(d, 7, 1, 7, 7, ((-3, 3), (1, 2), (4, 4), (-1, 5)))
    return [im]


def slime_barrel():
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 14, 14, alpha=100)
    d.rectangle([2, 4, 13, 14], fill=_a(WOODP[2]), outline=_a(WOODP[4]))
    for x in (4, 8, 11):
        d.line([x, 6, x, 13], fill=_a(WOODP[3]))
    d.line([3, 6, 3, 13], fill=_a(WOODP[0]))
    d.line([5, 6, 5, 13], fill=_a(WOODP[1]))
    for y in (6, 11):
        d.line([2, y, 13, y], fill=_a(HOOP[2]))
        d.point((3, y), fill=_a(HOOP[0]))
        d.point((12, y), fill=_a(HOOP[3]))
    d.ellipse([2, 2, 13, 6], fill=_a(WOODP[3]), outline=_a(WOODP[4]))
    d.ellipse([3, 3, 12, 5], fill=_a(GLOW[2]))
    d.line([5, 3, 8, 3], fill=_a(GLOW[1]))
    d.point((6, 3), fill=_a(GLOW[0]))
    for x, n in ((10, 4), (6, 2)):                                       # slime running over the rim
        d.line([x, 6, x, 6 + n], fill=_a(GLOW[2]))
        d.point((x, 6 + n), fill=_a(GLOW[3]))
    d.point((11, 6), fill=_a(GLOW[2]))
    return [im]


def bramble():
    im = _canvas(1, 1)
    contact_shade(im, 2, 14, 14, alpha=80)
    draw_blobs(im, [(8, 10, 6.5, 4.5), (4.5, 10.5, 3.5, 3.5), (11.5, 10, 3.5, 3.5), (7.5, 7, 4, 3)],
               BRIAR, (52, 30, 70), speck=61)
    p = im.load()
    d = ImageDraw.Draw(im)
    for pts in (((4, 7), (2, 4), (3, 2)), ((11, 7), (13, 4), (12, 2)), ((8, 5), (9, 2), (7, 1))):
        d.line(pts, fill=_a(BRIAR[2]))                                  # curling canes
        x, y = pts[-1]
        d.point((x, y), fill=_a((52, 30, 70)))
    for x, y in ((1, 4), (14, 4), (10, 2), (1, 10), (15, 9), (6, 2)):  # thorns poking out
        p[x, y] = _a((52, 30, 70))
    for x, y in ((6, 9), (10, 8), (9, 12), (4, 11)):                   # curling vines
        p[x, y] = _a(BRIAR[3])
    for x, y in ((7, 10), (11, 11)):                                     # glowing berries
        p[x, y] = _a(GLOW[1])
    return [im]


def cattails():
    """Bog reeds: a clump of crooked blades with plum seed-heads, one tipped with a glowing spore."""
    im = _canvas(1, 1)
    d = ImageDraw.Draw(im)
    contact_shade(im, 2, 14, 14, alpha=80)
    for x0, top, lean in ((4, 4, -1), (7, 2, 0), (10, 5, 1), (12, 8, 1), (2, 8, -1)):
        d.line([x0, 14, x0 + lean, top + 3], fill=_a(MOSS[2]))
        d.point((x0 - 1, 13), fill=_a(MOSS[4]))
    for x0, top, lean in ((4, 4, -1), (7, 2, 0), (10, 5, 1)):
        x = x0 + lean
        d.rectangle([x, top, x + 1, top + 3], fill=_a(WOODP[3]), outline=_a(WOODP[4]))
        d.point((x, top + 1), fill=_a(WOODP[1]))
        d.point((x + (1 if lean >= 0 else 0), top - 1), fill=_a(MOSS[1]))
    d.point((8, 1), fill=_a(GLOW[1]))
    for x, y in ((3, 12), (11, 13), (6, 11)):
        d.point((x, y), fill=_a(MOSS[1]))
    return [im]


PROPS = {
    "poison-cattails": dict(cells=(1, 1), paint=cattails, emissive=[GLOW[1]], bank=True),
    "poison-toadstools": dict(cells=(1, 1), paint=toadstools, emissive=[GLOW[1]], walk=True),
    "poison-dead-tree": dict(cells=(2, 2), paint=dead_tree),
    "poison-cauldron": dict(cells=(1, 1), paint=cauldron, emissive=GLOW[:4], order=[0, 1, 2]),
    "poison-mushroom-lamp": dict(cells=(1, 2), paint=mushroom_lamp, emissive=GLOW[:4], lamp=(150, 255, 90)),
    "poison-slime-barrel": dict(cells=(1, 1), paint=slime_barrel, emissive=GLOW[:4]),
    "poison-bramble": dict(cells=(1, 1), paint=bramble, emissive=[GLOW[1]]),
}

# ---------------------------------------------------------------- review scene around the gym
GYM = dict(
    structure_at=(8, 4),          # top-left cell of the gym's 8x8-metatile structure canvas (door at cols 11-12)
    ground="poison-ground",
    scene=[
        "TTTTTTTTTTTTTTTTTTTTTTTT",
        "TTT..................TTT",
        "TT.mmm............mmm.TT",
        "T.mmmmm..........mmmmm.T",
        "T.mmoom..........moomm.T",
        "T..moom..........moom..T",
        "T..mmmm..........mmmm..T",
        "TT..mm............mm..TT",
        "T......................T",
        "T......................T",
        "T......................T",
        "T..........bb..........T",
        "T......mm..bb..mm......T",
        "T..mmmmmmm.bb.mmmmmmm..T",
        "T.mmoomm...bb...mmoomm.T",
        "T.mmoomm...bb...mmmmm..T",
        "TT.mmm.....bb.....mm..TT",
        "TTTTTTTTTTTbbTTTTTTTTTTT",
    ],
    chars={"T": "poison-border", "m": "poison-bog", "o": "poison-toxic-pool", "b": "poison-boardwalk"},
    props=[("poison-mushroom-lamp", 10, 13), ("poison-mushroom-lamp", 13, 13),
           ("poison-mushroom-lamp", 10, 16), ("poison-mushroom-lamp", 13, 16),
           ("poison-cauldron", 8, 11), ("poison-slime-barrel", 15, 11), ("poison-slime-barrel", 16, 11),
           ("poison-toadstools", 3, 8), ("poison-toadstools", 20, 8), ("poison-toadstools", 7, 12),
           ("poison-toadstools", 16, 13), ("poison-toadstools", 2, 10), ("poison-toadstools", 21, 15),
           ("poison-dead-tree", 1, 13), ("poison-dead-tree", 21, 12),
           ("poison-cattails", 3, 14), ("poison-cattails", 7, 15), ("poison-cattails", 19, 13),
           ("poison-cattails", 6, 4), ("poison-cattails", 17, 6), ("poison-cattails", 4, 2),
           ("poison-bramble", 5, 10), ("poison-bramble", 18, 10), ("poison-bramble", 8, 16),
           ("poison-bramble", 15, 16), ("poison-cauldron", 20, 4), ("sign", 14, 12)],
)


# ---------------------------------------------------------------- biome foliage (soft theme recolours)
from biome import biome_pieces  # noqa: E402

_BT, _BP = biome_pieces("poison")
TERRAIN.update(_BT)
PROPS.update(_BP)
