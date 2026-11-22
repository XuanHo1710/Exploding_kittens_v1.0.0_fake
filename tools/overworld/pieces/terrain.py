"""Terrain painters. Each entry returns a spec the generator turns into sheets:
  kind 'blob'  : paint(d, facing, x, y, f, mask) for the 47-tile autotile (d = signed px inside)
  kind 'fill'  : list of 16 px variant painters (grass)
  kind 'row'   : 4-tile row connector (single, start, middle, end) painter(i, x, y)
"""
import math

from overworld_kit import (WOOD, CLIFF, DIRT, EDGE_DARK, FOLIAGE_OUT, GRASS, HEDGE, IO, LEAF, BARK, PAVE, SAND, SEA, TALL, WATER,
                           TG_DEPTH, TG_LEAF, TG_TIP, grass_px, h16)

TAU = 2 * math.pi


def _has(facing, side):
    return facing is not None and side in facing


# ---------------------------------------------------------------- tall grass (encounter grass)
# One classic clump per 8x8 quarter: pointed blade tips, dark outline, lit left, shaded right.
# o outline, L light, M mid, D dark, . gap between clumps
# Emerald encounter grass: every cell holds ONE rosette of pointed blades fanning out from a low
# centre (olive outline, teal-green blades lit on their left edge); the lawn shows between rosettes.
# o olive outline, L light blade edge, M blade, D shaded blade, . lawn
# Emerald encounter grass uses exactly 4 colours: lawn mint, teal leaves, olive depths, light tips.
# One dense leafy clump per cell (original drawing), lawn showing only around its rim.
# t teal leaf, l light tip, o olive depth, . lawn
ROSETTE = ["................",
           "..tt...tt...tt..",
           ".tllt.tllt.tllt.",
           ".tlttotlttotltt.",
           "..ttoottttoottt.",
           ".totlltootlltot.",
           "tootllttotllttot",
           "toottttoottttoo.",
           ".tooottooottoot.",
           "..tllooottllooo.",
           ".tllttoottlttot.",
           ".tttooottttooot.",
           "..tooo.otoo.oo..",
           "...oo...oo......",
           "................",
           "................"]
assert all(len(r) == 16 for r in ROSETTE) and len(ROSETTE) == 16


def _star_clump():
    """One star-shaped clump per cell: 6 pointed blades radiating from a low centre. Each blade is
    teal with an olive midrib and an olive shaded lower edge; the outer upper tips are light.
    Built as a 16x16 character map so it tiles exactly and never reads as a glyph."""
    cx, cy = 7.5, 8.5
    rows = []
    for y in range(16):
        row = ""
        for x in range(16):
            px, py = (x + 0.5 - cx) * 0.86, (y + 0.5 - cy) * 0.94   # wider than tall: clumps touch
            ch = "."
            if math.hypot(px, py) < 1.6:
                ch = "o"
            for k in range(6):
                a = math.radians(-90 + 60 * k + 12)
                ux, uy = math.cos(a), math.sin(a)
                s = px * ux + py * uy                      # along the blade
                q = -px * uy + py * ux                     # across it (+ = lower/right side)
                if not (1.0 <= s <= 8.2):
                    continue
                w = 3.3 * math.sin(math.pi * min(1.0, s / 8.4)) ** 0.8 + 0.3   # broad oval leaf
                if abs(q) >= w:
                    continue
                if (abs(q) < 0.5 and s < 5.5) or q > w - 0.8:
                    ch = "o"                               # midrib and shaded lower edge
                elif q < -w * 0.35 and s > 2.5 and (q < -w + 1.0):
                    ch = "l"                               # sunlit upper edge of the leaf
                else:
                    ch = "t"
                break
            row += ch
        rows.append(row)
    return rows


ROSETTE = _star_clump()
TALL_INK = {"t": TG_LEAF, "l": TG_TIP, "o": TG_DEPTH}


def tall_grass(d, facing, x, y, f, m):
    if d < 0:
        return grass_px(x, y)
    ch = ROSETTE[y % 16][x % 16]
    return TALL_INK[ch] if ch in TALL_INK else grass_px(x, y)


# ---------------------------------------------------------------- dirt path (Emerald, soft)
# Interior: warm sand with short light dashes and a few darker grains on a loose 16 px lattice.
DASHES = ((2, 2), (10, 4), (5, 9), (13, 11), (1, 14), (8, 13))
GRAINS = ((7, 1), (14, 7), (3, 6), (11, 15), (6, 12))


def _dirt_px(x, y):
    x, y = x % 16, y % 16
    for dx, dy in DASHES:
        if y == dy and dx <= x <= dx + 1:
            return DIRT[0]
    if (x, y) in GRAINS:
        return DIRT[2]
    return DIRT[1]


def soft_edge(d, x, y, inner, edge, ground):
    """Emerald soil edge: no outline. The last 2 px dither from the ground into the soil
    (checker of a darker soil tone over the ground, then darker soil over the soil), so
    paths and sand melt into the lawn instead of being cut out of it."""
    if d < 0:
        return ground
    if d < 1:
        return edge if (x + y) % 2 == 0 else ground
    if d < 2:
        return edge if (x + y) % 2 == 1 else inner
    return None


def dirt_path(d, facing, x, y, f, m):
    c = soft_edge(d, x, y, DIRT[1], DIRT[2], grass_px(x, y))
    return c if c is not None else _dirt_px(x, y)


# ---------------------------------------------------------------- paved path (retro)
def _pave_px(x, y):
    """Soft paving: 8 px stones in running bond with LIGHT grout, rounded stone corners and a lit
    top edge only (no hard dark grid): reads as smooth town paving, not a tiled floor."""
    yy = y % 8
    xx = (x + (4 if (y // 8) % 2 else 0)) % 8
    if xx == 7 or yy == 7:
        return PAVE[2]                                  # grout: one soft step darker, never the darkest
    if (xx, yy) in ((0, 0), (6, 0), (0, 6), (6, 6)):
        return PAVE[2]                                  # rounded corners
    if yy == 0:
        return PAVE[0]                                  # lit top edge of each stone
    if yy == 6 or xx == 6:
        return PAVE[1] if (xx + yy) % 3 else PAVE[2]
    return PAVE[1]


def paved_path(d, facing, x, y, f, m):
    if d < 0:
        return grass_px(x, y)
    if d < 1.5:
        return PAVE[2]                                  # soft kerb (dithered into the lawn by soften)
    return _pave_px(x, y)


# ---------------------------------------------------------------- sand
def _sand_px(x, y):
    """Beach sand: soft, sparse: short light dashes, a few darker grains, one tiny pink shell."""
    x, y = x % 16, y % 16
    for dx, dy in ((3, 3), (11, 6), (6, 12), (14, 14)):
        if y == dy and dx <= x <= dx + 1:
            return SAND[0]
    if (x, y) in ((8, 1), (1, 9), (12, 11), (4, 15)):
        return SAND[2]
    if (x, y) == (9, 9):
        return (238, 148, 115)
    return SAND[1]


def sand(d, facing, x, y, f, m):
    c = soft_edge(d, x, y, SAND[1], SAND[2], grass_px(x, y))
    return c if c is not None else _sand_px(x, y)


# ---------------------------------------------------------------- water (pond / river), 8 frames
def _water_px(x, y, f, R):
    """Classic water: base blue with short white '~' ripple streaks drifting 2 px per frame."""
    yy = y % 8
    row = y // 8
    xx = (x + 2 * f + (5 if row % 2 else 0)) % 16
    if yy == 2 and xx in (2, 3, 4):
        return R[0]
    if yy == 3 and xx in (1, 5):
        return R[0]
    if yy == 3 and xx in (2, 3, 4):
        return R[1]
    if yy == 6 and xx in (10, 11):
        return R[1]
    return R[2] if (yy + (xx // 4)) % 7 else R[3]


def _rock_rim(x, y, d):
    """Cobbled pink-brown rock rim (Emerald pond / ledge stone): 3x2 cobbles, lit tops, dark joints."""
    u, v = (x + (2 if (y // 2) % 2 else 0)) % 4, y % 2
    if d < 0.8:
        return CLIFF[4]
    if u == 3:
        return CLIFF[4]
    return CLIFF[2] if v == 0 and u < 2 else CLIFF[3]           # Emerald: dark red-brown, lit tops


def water(d, facing, x, y, f, m):
    """Emerald pond: a cobbled rock rim, a darker blue band, then flat light blue with a single
    drifting glint pixel (8-frame cycle, still reads as calm water). The rim and band are narrow
    enough that a 1-cell creek still shows light water down its middle, and the convex corners use
    the largest radius the 47-tile set allows, so outlines read round."""
    if d < 0:
        return grass_px(x, y)
    if d < 2.5:
        return _rock_rim(x, y, d)
    if d < 4.5:
        return WATER[3]
    if f in (3, 4) and (x, y) in ((6 + f, 9), (7 + f, 9)):   # a brief glint mid-cycle; frame 0 is still
        return WATER[0]
    return WATER[1]


def water_sandy(d, facing, x, y, f, m):
    """Pond edge with a sandy bank instead of the rock rim (same group as water, so the two edge
    styles alternate along one pond): sand, a wet band, a lapping foam line, then the pond's light
    blue. Its margin is tiny, so a `sand` cell beside it (sand joins water) runs on seamlessly."""
    if d < 0:
        return grass_px(x, y)
    lap = 0.6 * math.sin(TAU * f / 8)
    if d < 4.2:
        return _sand_px(x, y)
    if d < 5.2 + lap:
        return SAND[2] if (x + y) % 3 else SAND[3]                 # wet sand
    if d < 6.2 + lap:
        return WATER[0] if (x + f // 2) % 3 else WATER[1]          # foam where the water laps
    if d < 7.4:
        return WATER[2]
    if f in (3, 4) and (x, y) in ((6 + f, 9), (7 + f, 9)):
        return WATER[0]
    return WATER[1]


def _sand_joins(nb, dx, dy):
    """Sand runs straight into a pond edge (water group) instead of leaving a lawn seam."""
    return True if nb is not None and TERRAIN.get(nb, {}).get("group", nb) == "water" else None


# ---------------------------------------------------------------- shore (sand -> sea), 8 frames
def shore(d, facing, x, y, f, m):
    swash = 1.6 + 1.4 * math.sin(TAU * f / 8)
    if d < -1.5:
        return _sand_px(x, y)
    if d < 0:
        return SAND[2] if f in (2, 3, 4) else SAND[1]     # wet sand after the wave
    if d < swash:
        return SEA[0] if (x + f) % 3 else SEA[1]
    if d < swash + 2:
        return SEA[1]
    return _water_px(x, y, f, SEA)


# ---------------------------------------------------------------- cliff plateau (raised)
def _south_face(d, facing, x, y, m, top=3):
    """Full-cell rock face for the south row of a raised terrain (cliff, mountain): every tile with
    no raised neighbour to the south shows a rock face from row `top` down, trimmed at its ends by
    the blob edge, so a plateau reads one cell tall the Emerald way."""
    from overworld_kit import S as SBIT
    if m & SBIT or y < top or d < 0:
        return None
    if y == top:
        return CLIFF[0]                         # lit lip
    if y >= 14:
        return CLIFF[4]                         # dark foot
    if (_has(facing, "E") or _has(facing, "W")) and d < 2:
        return CLIFF[4]
    if y == 8:
        return CLIFF[2]                         # weathered ledge across the face
    stripe = (x + (2 if y > 8 else 0)) % 5
    if stripe == 0 or y >= 12 and (x + y) % 2 == 0:
        return CLIFF[4]                         # vertical cracks, darkening toward the foot
    return CLIFF[3]


# ---------------------------------------------------------------- foliage (hedge / forest), raised
def _lobes(x, y, period, ramp, offset_rows=True, gap=None, rim=None):
    """Round leafy crowns on a staggered grid: lit top-left with a highlight cluster, speckled leaf
    texture, shadows shifting toward teal. gap / rim override the colours between crowns and of each
    crown's 1 px rim (Emerald forests: teal ground shadow in the gaps, thin olive rim)."""
    row = y // period
    u = (x + (period // 2 if offset_rows and row % 2 else 0)) % period
    v = y % period
    half = period / 2
    nx, ny = (u + 0.5 - half) / half, (v + 0.5 - half * 0.9) / half
    r = math.hypot(nx, ny)
    if r > 1.0:
        return gap or ramp[4]
    if r > 0.88:
        return rim or ramp[3]
    l = -nx * 0.6 - ny * 0.8
    k = 0 if l > 0.62 else 1 if l > 0.12 else 2 if l > -0.45 else 3
    hx, hy = (x * 7 + y * 3) % 11, (x * 5 + y * 9) % 13
    if k <= 1 and hx == 0:
        return ramp[0]
    if k >= 1 and hy == 0:
        return ramp[min(4, k + 1)]
    return ramp[k]


def hedge(d, facing, x, y, f, m):
    if d < 0:
        return GRASS[3] if _has(facing, "S") and d > -1.5 else grass_px(x, y)
    if d < 1:
        return FOLIAGE_OUT
    if _has(facing, "S") and d < 4:
        return HEDGE[4] if d < 2.5 else HEDGE[3]
    return _lobes(x, y, 8, HEDGE)


def forest(d, facing, x, y, f, m):
    if d < 0:
        return GRASS[3] if _has(facing, "S") and d > -2 else grass_px(x, y)
    if d < 1:
        return FOLIAGE_OUT
    if _has(facing, "S") and d < 6:                    # trunks under the canopy edge
        if x % 8 in (3, 4) and d < 4.5:
            return BARK[0] if x % 8 == 3 else BARK[1]
        return LEAF[4] if d < 4.5 else LEAF[3]
    c = _lobes(x, y, 16, LEAF, gap=GRASS[4], rim=FOLIAGE_OUT)
    if c in (LEAF[1], LEAF[2]) and h16(x, y, 41) > 200:      # Emerald crowns sparkle with light leaves
        return LEAF[0] if c == LEAF[1] else LEAF[1]
    return c


# ---------------------------------------------------------------- ledges (row connectors)
LIP = [CLIFF[1], CLIFF[2], CLIFF[3]]       # Emerald ledges: pinkish-brown rock lip


LEDGE_Y0, LEDGE_Y1 = 6, 12            # rock band rows inside the cell (Emerald: a thin stony lip)


def _ledge_band(along, across, start, end):
    """Pixel of a ledge band. along = position along the ledge (0..15), across = 0..15 across it.
    start/end: this tile is a free end on the low/high side (rounded cap)."""
    a0, a1 = LEDGE_Y0, LEDGE_Y1
    if start and along < 3:
        a0 += 3 - along
        a1 -= 1 if along == 0 else 0
    if end and along > 12:
        a0 += along - 12
        a1 -= 1 if along == 15 else 0
    if not (a0 <= across <= a1):
        return None
    if across in (a0, a1) or (start and along == 0) or (end and along == 15):
        return CLIFF[4]
    if across == a0 + 1:
        return CLIFF[2] if along % 4 != 3 else CLIFF[4]           # lit top of each stone
    return CLIFF[3] if (along + 2 * across) % 5 else CLIFF[4]


def _ledge_s(i, x, y):
    """South-facing ledge; i: 0 single, 1 left end, 2 middle, 3 right end."""
    c = _ledge_band(x, y, i in (0, 1), i in (0, 3))
    if c is not None:
        return c
    if y == LEDGE_Y1 + 1 and LEDGE_Y0 + 2 < 16:
        return GRASS[3]                     # 1 px shade on the lawn below the lip
    return grass_px(x, y)


def ledge_south(i, x, y):
    return _ledge_s(i, x, y)


def ledge_east(i, x, y):
    """East-facing ledge; i runs top -> bottom (0 single, 1 top end, 2 middle, 3 bottom end)."""
    return _ledge_side(i, x, y)


def ledge_west(i, x, y):
    return _ledge_side(i, 15 - x, y)


def _ledge_side(i, x, y):
    """East-facing ledge band (mirrored for west); i runs top -> bottom."""
    c = _ledge_band(y, x, i in (0, 1), i in (0, 3))
    if c is not None:
        return c
    if x == LEDGE_Y1 + 1:
        return GRASS[3]
    return grass_px(x, y)


# ---------------------------------------------------------------- tree wall (Emerald 2x2 trees)
def emerald_tree(im, lawn=True):
    """Paint one Emerald-style 2x2 tree into a 32x32 RGBA image (lawn=True fills the lawn first).
    Crown: staggered diamond leaves (6x4 lattice), bright upper half (light tips, mid leaves, green
    joints) and a shaded lower half (mid leaves, olive joints), with a scalloped olive rim.
    Under it: an olive underside bowl with a short trunk, ringed by the teal ground halo."""
    p = im.load()
    if lawn:
        for y in range(32):
            for x in range(32):
                p[x, y] = grass_px(x, y, 3) + (255,)
    for y in range(23, 32):                                   # teal halo on the ground
        for x in range(32):
            if ((x + 0.5 - 16) / 15.8) ** 2 + ((y + 0.5 - 28) / 4.2) ** 2 < 1:
                p[x, y] = GRASS[4] + (255,)
    for y in range(21, 31):                                   # olive underside bowl + short stump
        for x in range(32):
            if ((x + 0.5 - 16) / 11.5) ** 2 + ((y + 0.5 - 26) / 4.5) ** 2 < 1:
                p[x, y] = LEAF[4] + (255,)
    for y in range(26, 30):
        for x in range(13, 19):
            p[x, y] = (BARK[0] if y == 26 else BARK[1] if x < 16 else BARK[2]) + (255,)

    def inside(x, y):
        dx, dy = (x + 0.5 - 16) / 15.5, (y + 0.5 - 13.5) / 13.5
        a = math.atan2(dy, dx)
        return dx * dx + dy * dy < (1 - 0.06 * abs(math.sin(6 * a))) ** 2
    crown = {(x, y) for y in range(0, 27) for x in range(32) if inside(x, y)}
    if lawn:                                                  # teal halo dithered into the lawn
        for y in range(32):
            for x in range(32):
                if (x, y) in crown or p[x, y][:3] != grass_px(x, y, 3):
                    continue
                near = min((max(abs(x - cx), abs(y - cy)) for cx, cy in crown
                            if abs(x - cx) <= 2 and abs(y - cy) <= 2), default=9)
                if near == 1 or (near == 2 and (x + y) % 2 == 0):
                    p[x, y] = GRASS[4] + (255,)
    for (x, y) in crown:
        edge = any((x + ex, y + ey) not in crown for ex, ey in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        # brightness falls off from the sunlit top-centre of the crown (light from the top-left)
        t = math.hypot((x + 0.5 - 14) / 1.15, y + 0.5 - 3) / 22
        if edge:
            p[x, y] = (LEAF[2] if t < 0.45 else LEAF[4]) + (255,)
            continue
        row = y // 5                                      # staggered 6x5 diamond leaves, thin dark veins
        u, v = (x + (3 if row % 2 else 0)) % 6, y % 5
        leaf = abs(u - 2.5) / 3 + abs(v - 2) / 2.5 < 1.12
        if not leaf:
            c = LEAF[2] if t < 0.55 else LEAF[4]
        elif (u, v) in ((2, 0), (1, 1), (2, 1), (3, 0)):  # lit upper-left of each leaf
            c = LEAF[0] if t < 0.75 else LEAF[1]
        else:
            c = LEAF[0] if t < 0.35 else LEAF[1] if t < 0.75 else LEAF[2]
        p[x, y] = c + (255,)
    return im


# Emerald crowns read as stacked downward chevrons (feathered leaves): light upper edges, mid fill,
# dark notches beneath; the lower half of the crown uses the same stamp one shade darker.
CHEVRON = ["LM..ML",
           ".LMML.",
           "..LL..",
           "DD..DD"]
CHEV_HIGH = {"L": LEAF[0], "M": LEAF[1], ".": LEAF[1], "D": LEAF[2]}
CHEV_LOW = {"L": LEAF[1], "M": LEAF[2], ".": LEAF[2], "D": LEAF[4]}


def tree_wall_block():
    """One Emerald-style 2x2 tree on lawn as an OPAQUE 32x32 block (tiles tl, tr, bl, br).
    The crown runs to the block edge and a teal ground shadow fills the trunk row, so blocks stamped
    side by side on even cells read as the dense tree walls of Hoenn routes and towns."""
    from PIL import Image
    return emerald_tree(Image.new("RGBA", (32, 32)), lawn=True)


def crown_lobes(cx, cy, rx, ry, n=10, r=5.0):
    """Emerald-style round crown: a core plus a ring of n leaf clumps around an ellipse (the ring
    gives the evenly scalloped outline) and an inner ring of 5 clumps (the leafy texture inside)."""
    lobes = [(cx, cy, rx * 0.9, ry * 0.9)]
    for i in range(n):
        a = 2 * math.pi * i / n - math.pi / 2
        lobes.append((cx + rx * math.cos(a), cy + ry * math.sin(a), r, r * 0.95))
    for i in range(5):
        a = 2 * math.pi * i / 5 - math.pi / 2 + 0.6
        lobes.append((cx + rx * 0.45 * math.cos(a), cy + ry * 0.45 * math.sin(a), r * 0.95, r * 0.9))
    return lobes


# Emerald tree crowns are mostly mid green with a light top-left and small bright leaf glints
TREE = [LEAF[1], LEAF[2], LEAF[2], LEAF[3]]


def sparkle(im, lobes):
    """Small bright leaf glints on the lit upper-left of each lobe (Emerald's (180,255,131) flecks)."""
    p = im.load()
    for (cx, cy, rx, ry) in lobes[1:]:
        for dx, dy in ((-0.45, -0.5), (-0.15, -0.65), (-0.6, -0.15)):
            x, y = int(cx + dx * rx), int(cy + dy * ry)
            if 0 <= x < im.width and 0 <= y < im.height and p[x, y][:3] in (LEAF[1], LEAF[2]):
                p[x, y] = LEAF[0] + (255,)


# ---------------------------------------------------------------- mountain (raised rock massif)
_PEBBLES = ((3, 4), (11, 2), (7, 10), (14, 12), (1, 13), (9, 6))


def _rock_top(x, y):
    """Mountain top: dusty rock with a few lit pebbles and darker grains on a 16 px lattice."""
    x, y = x % 16, y % 16
    for px, py in _PEBBLES:
        if (x, y) == (px, py) or (x, y) == (px + 1, py):
            return CLIFF[0]
        if (x, y) == (px, py + 1) or (x, y) == (px + 1, py + 1):
            return CLIFF[2]
    if (x * 7 + y * 3) % 23 == 0:
        return CLIFF[2]
    u, v = (x + (8 if (y // 8) % 2 else 0)) % 16, y % 8   # low ridges: lit top, shaded underside
    if v == 6 and 2 <= u <= 9:
        return CLIFF[2]
    if v == 5 and 3 <= u <= 8:
        return CLIFF[0]
    return CLIFF[1]


def mountain(d, facing, x, y, f, m):
    """Emerald-style rock massif (Route 111-112, Mt. Chimney slopes): a dusty rock top, a full-cell
    striated south face with a weathered ledge, darker side rims and a lit north lip. Blocking."""
    if d < 0:
        if _has(facing, "S") and d > -2:
            return GRASS[3]                     # shade at the foot of the face
        return grass_px(x, y)
    face = _south_face(d, facing, x, y, m, top=2)
    if face is not None:
        return face
    if (_has(facing, "E") or _has(facing, "W")) and d < 3:
        return CLIFF[4] if d < 1 else CLIFF[3] if d < 2 else CLIFF[2]
    if _has(facing, "N") and d < 2:
        return CLIFF[3] if d < 1 else CLIFF[0]
    return _rock_top(x, y)


# ---------------------------------------------------------------- stairs (rock steps up a face)
def stairs(i, x, y):
    """Stone steps cut into a cliff-face (or mountain face), read top to bottom; i: 0 single, 1 top,
    2 middle, 3 bottom. The top cell keeps the plateau's grass edge, the bottom one ends in the lawn
    shade, so a 2-cell flight fits a 2-cell cliff-face exactly. Walkable; group cliff."""
    top, bottom = i in (0, 1), i in (0, 3)
    if top and y < 3:
        return grass_px(x, y)
    if bottom and y >= 14:
        return GRASS[4] if y == 14 and 2 <= x <= 13 else grass_px(x, y)
    if x < 2 or x > 13:                                    # the cut sides: face rock
        return CLIFF[4] if x in (1, 14) else CLIFF[3]
    if x == 2:
        return CLIFF[3]
    step = (y + (1 if top else 0)) % 5
    if step == 0:
        return CLIFF[0]                                    # lit nose of the tread
    if step == 4:
        return CLIFF[4] if x % 4 else CLIFF[3]             # riser shadow
    if step == 3:
        return CLIFF[2]
    return CLIFF[1]


# ---------------------------------------------------------------- wooden bridge over water
def _bridge(along, across, i):
    """Plank deck across the water; along runs the length of the bridge, across its width."""
    if across < 2 or across > 13:
        return WATER[1]                         # calm water either side of the deck
    if across in (2, 13):
        return BARK[2]                          # rail shadow
    if across in (3, 12):
        post = along in (1, 14) and (i in (0, 1) and along == 1 or i in (0, 3) and along == 14)
        return BARK[1] if post else WOOD[2]     # side rail
    if along % 4 == 3:
        return WOOD[3]                          # gap between planks
    return WOOD[0] if across == 4 else WOOD[1]


def bridge_h(i, x, y):
    return _bridge(x, y, i)


def bridge_v(i, x, y):
    return _bridge(y, x, i)


# ---------------------------------------------------------------- ground variety (soft patches on the lawn)
# Three walkable patch autotiles that wear into the lawn with NO edge line: the last 3-4 px break up
# into 2x2 clusters of lawn, so a patch reads as a change in the ground, never as a stamped shape.
def _feather(d, x, y, width=3.0, seed=51):
    """True when an inside pixel near the edge should show the lawn instead (2x2 clusters, more of
    them toward the edge, thinning out over `width` px). d is continuous across tiles, so
    neighbouring tiles feather seamlessly; a wide feather hides the cell grid of the outline."""
    if d >= width:
        return False
    return h16(x // 2 * 2, y // 2 * 2, seed) < 255 * (1 - d / width) ** 1.4 * 0.95


LUSH_TUFTS = ((1, 1), (9, 3), (5, 7), (13, 9), (2, 12), (10, 13))
LUSH = (108, 180, 92)                   # between GRASS[2] and GRASS[3]: thicker, deeper grass
LUSH_GLYPH = ("l.l.l",
              ".ddd.",
              "..d..")


def _lush_px(x, y):
    """Lush grass: one step deeper than the lawn, packed with small 3-blade tufts (dark blades, light
    tips), so a patch reads as thicker, taller grass."""
    x, y = x % 16, y % 16
    for tx, ty in LUSH_TUFTS:
        u, v = (x - tx) % 16, (y - ty) % 16
        if u < 5 and v < 3:
            ch = LUSH_GLYPH[v][u]
            if ch == "l":
                return GRASS[0]
            if ch == "d":
                return GRASS[3]
    if (x * 5 + y * 3) % 17 == 0:
        return GRASS[4]
    return LUSH


def lush_grass(d, facing, x, y, f, m):
    if d < 0 or _feather(d, x, y, 6.5, 51):
        return grass_px(x, y)
    return _lush_px(x, y)


SOIL = [(226, 192, 142), (204, 166, 120), (182, 144, 106), (150, 112, 90)]   # worn earth: ground gym SAND, a step darker
SOIL_GRAINS = ((3, 2), (12, 4), (7, 9), (14, 12), (2, 13), (9, 15))
SOIL_DASH = ((5, 4), (11, 10), (1, 8))
SOIL_SPRIG = ((8, 2), (3, 10), (13, 14))


def _soil_px(x, y):
    x, y = x % 16, y % 16
    for gx, gy in SOIL_GRAINS:
        if (x, y) == (gx, gy):
            return SOIL[3]
        if (x, y) == (gx - 1, gy - 1):
            return SOIL[0]
    for dx, dy in SOIL_DASH:
        if y == dy and dx <= x <= dx + 1:
            return SOIL[0]
    for sx, sy in SOIL_SPRIG:                   # a few grass sprigs survive on the bare ground
        if (x, y) in ((sx, sy), (sx + 2, sy)):
            return GRASS[2]
        if (x, y) == (sx + 1, sy + 1):
            return GRASS[3]
    return SOIL[1]


def worn_earth(d, facing, x, y, f, m):
    """Worn, bare earth where the lawn has been trodden away: soil a step darker than the path, a few
    grains and grass sprigs, and a wide ragged edge that breaks into lawn clusters (no outline)."""
    lawn = grass_px(x, y)
    if d < 0:
        return lawn
    if d < 5.5 and h16(x // 2 * 2, y // 2 * 2, 63) < 255 * (1 - d / 5.5) ** 1.3 * 0.9:
        return lawn if h16(x, y, 64) > 70 else GRASS[2]            # grass clusters thinning inward
    if d < 2.5 and (x + y) % 2:
        return SOIL[2]
    return _soil_px(x, y)


CLOVER = ["................",
          "..aa............",
          ".abba.....w.....",
          "..ab.aa..wWw....",
          "....abba..w.....",
          ".....aa.........",
          "...........aa...",
          "...y......abba..",
          "..yYy......ab.aa",
          "...y.........abb",
          "..............aa",
          "....aa..........",
          "...abba.aa......",
          "....ab.abba..w..",
          ".......aa...wWw.",
          ".............w.."]
CLOVER_INK = {"a": GRASS[3], "b": GRASS[2], "w": (238, 236, 226), "W": (246, 214, 120),
              "y": (246, 222, 120), "Y": (232, 176, 84)}


def clover(d, facing, x, y, f, m):
    """Clover meadow: trefoil leaf clusters with tiny white and yellow blossoms on the lawn."""
    if d < 0 or _feather(d, x, y, 6.0, 71):
        return grass_px(x, y)
    ch = CLOVER[y % 16][x % 16]
    return CLOVER_INK[ch] if ch in CLOVER_INK else grass_px(x, y, 2)


# ---------------------------------------------------------------- raised plateau (cliff + cliff-face)
def _face_px(x, Y, d, facing):
    """Rock face of a raised plateau, Y = 0..31 down a two-cell face (row 3 is the lit lip).
    Columns of rock with lit left edges and dark cracks, two weathered ledges, darker toward the
    foot; E/W ends darken so the face reads as rounded rock."""
    if (_has(facing, "E") or _has(facing, "W")) and d < 3:
        return CLIFF[4] if d < 1.5 else CLIFF[3]
    if Y == 3:
        return CLIFF[0]
    if Y == 4:
        return GRASS[2] if (x * 7) % 11 < 3 else CLIFF[1]          # grass hanging over the lip
    if Y >= 29:
        return CLIFF[4]
    if Y in (13, 22):
        return CLIFF[1] if (x + Y) % 7 else CLIFF[2]                # lit top of a ledge
    if Y in (14, 23):
        return CLIFF[4] if x % 3 else CLIFF[3]                      # its shadow
    band = 0 if Y < 13 else 1 if Y < 22 else 2
    cuts = (0, 5, 9, 14) if band == 0 else (2, 8, 12) if band == 1 else (0, 4, 10, 13)
    col = min((x - c) % 16 for c in cuts)              # irregular rock columns, 16 px periodic
    if col == 0 and (Y * 3 + x) % 9 < 7:
        return CLIFF[4] if (Y + band) % 4 else CLIFF[3]             # crack between columns
    if col == 1 and (Y * 5 + x * 3) % 11 < 8:
        return CLIFF[1] if band == 0 else CLIFF[2]                  # lit left edge of a column
    return (CLIFF[2], CLIFF[2], CLIFF[3])[band] if (x * 3 + Y * 5) % 13 else CLIFF[3]


TOP = [(198, 232, 152), (156, 212, 118)]      # sunlit plateau top: one step lighter than the lawn


def _top_px(x, y):
    """Plateau top: the map's own lawn. Transparent, so the ground layer (with its variants) shows
    through and the top takes the same patches, trees and flowers as the ground around it."""
    return None


def _rim(d, facing, x, y):
    """Plateau rim on its top: the E/W sides show a narrow band of rock face (seen edge-on) under a
    lit grass lip; the far N edge a dark rock lip. None = plain plateau grass."""
    if (_has(facing, "E") or _has(facing, "W")) and d < 7:
        if d < 1:
            return CLIFF[4]
        if d < 6:
            if (y + (3 if d < 3.5 else 0)) % 6 == 0:
                return CLIFF[4]                                     # horizontal cracks
            return CLIFF[3] if d < 3.5 else CLIFF[2]
        return CLIFF[0]
    if _has(facing, "N") and d < 4:
        return CLIFF[4] if d < 1 else CLIFF[3] if d < 2.5 else CLIFF[0] if d < 3.5 else GRASS[0]
    return None


def cliff(d, facing, x, y, f, m):
    """Plateau top. Its rim rows: E/W show a short rock side, the N edge a dark lip; a south edge
    with no cliff-face below shows a one-cell face (use cliff-face rows for real height)."""
    from overworld_kit import S as SBIT
    if d < 0:
        if _has(facing, "S") and d > -2:       # contact shade at the foot of the face
            return GRASS[4] if d > -1 else GRASS[3]
        return grass_px(x, y)
    if not m & SBIT and y >= 3:
        return _face_px(x, y if y <= 4 else y + 14, d, facing)      # one cell: lip, then the lower face
    rim = _rim(d, facing, x, y)
    return rim if rim is not None else _top_px(x, y)


def plateau_joins(level, face):
    """Direction-aware joining for plateau pieces (group cliff, levels 1 and 2), so an irregular
    plateau outline gets side walls: a top joins its own face (and stairs) only below it, so where a
    lobe sticks out south the face beside it ends and the lobe shows its rock side; a top joins any
    higher level (that one stands on it) but never a lower one; a face joins its own level and stairs."""
    def joins(nb, dx, dy):
        spec = TERRAIN.get(nb) if nb else None
        if not spec or (spec.get("group") != "cliff" and nb != "cliff"):
            return False
        lv, isface, stair = spec.get("level", 1), spec.get("face", False), spec["kind"] == "row"
        if stair:
            return dy != 0
        if face:
            return lv == level
        if lv > level:
            return True
        if lv < level:
            return False
        return dy == 1 if isface else True
    return joins


def cliff_face(d, facing, x, y, f, m):
    """Two-cell rock face under a cliff plateau (group cliff): the upper cell (another face cell
    below it) carries the plateau's grass edge and lit lip, the lower one the foot and its shade."""
    from overworld_kit import S as SBIT
    upper = bool(m & SBIT)
    if d < 0:
        if _has(facing, "S") and d > -2:
            return GRASS[4] if d > -1 else GRASS[3]
        return grass_px(x, y)
    Y = y if upper else y + 16
    if Y < 3:
        rim = _rim(d, facing, x, y)
        return rim if rim is not None else _top_px(x, y)
    return _face_px(x, Y, d, facing)


# ---------------------------------------------------------------- pine (second tree species)
PINE = [(164, 216, 136), (100, 172, 106), (64, 136, 94), (42, 102, 82), (26, 68, 62)]   # cool evergreen
PINE_TIERS = ((0, 11, 7.5), (5, 17, 11.0), (10, 23, 14.0), (15, 27, 15.6))           # top, bottom, half-width


def _pine_mask():
    """{(x, y): (tier, u, v)} for a 2x2 conical pine: four drooping tiers, each tier's scalloped lower
    edge drawn over the tier below (upper tiers win)."""
    pts = {}
    for k, (t, b, w) in enumerate(PINE_TIERS):
        for y in range(t, b + 1):
            v = (y - t) / max(1, b - t)
            hw = 1.0 + (w - 1.0) * v ** 0.85
            for x in range(32):
                u = (x + 0.5 - 16) / hw
                if abs(u) > 1:
                    continue
                lim = b - 1.6 * abs(math.sin((x + 0.5 - 16) * math.pi / 5.0))   # scalloped bough tips
                if y > lim:
                    continue
                pts[(x, y)] = (k, u, v, lim - y)
    return pts


PINE_MASK = _pine_mask()


def emerald_pine(im, lawn=True):
    """Paint one 2x2 pine into a 32x32 RGBA image: tiers of needle boughs (lit left, shaded right,
    a dark scallop under each tier), a short trunk and the teal ground halo (lawn=True also lays the
    lawn first, for the opaque pine-wall block)."""
    p = im.load()
    if lawn:
        for y in range(32):
            for x in range(32):
                p[x, y] = grass_px(x, y, 3) + (255,)
        for y in range(25, 32):
            for x in range(32):
                if ((x + 0.5 - 16) / 15) ** 2 + ((y + 0.5 - 28.5) / 3.6) ** 2 < 1:
                    p[x, y] = GRASS[4] + (255,)
    for y in range(26, 31):
        for x in range(14, 18):
            p[x, y] = (BARK[0] if x == 14 else BARK[1] if x < 17 else BARK[2]) + (255,)
    crown = PINE_MASK
    if lawn:
        for y in range(32):
            for x in range(32):
                if (x, y) in crown or p[x, y][:3] != grass_px(x, y, 3):
                    continue
                near = min((max(abs(x - cx), abs(y - cy)) for cx, cy in crown
                            if abs(x - cx) <= 2 and abs(y - cy) <= 2), default=9)
                if near == 1 or (near == 2 and (x + y) % 2 == 0):
                    p[x, y] = GRASS[4] + (255,)
    for (x, y), (k, u, v, below) in crown.items():
        edge = any((x + ex, y + ey) not in crown for ex, ey in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        if edge:
            c = PINE[3] if u < -0.2 and below > 1 else PINE[4]
        elif below < 1.5:
            c = PINE[3] if u < 0 else PINE[4]                    # shade under the bough tips
        else:
            s = 0 if u < -0.45 else 1 if u < 0.25 else 2
            if (x + 2 * y) % 5 == 0:
                s += 1                                           # needle strokes
            if s == 0 and (x - y) % 6 == 0 and v < 0.7:
                c = PINE[0]
            else:
                c = PINE[min(4, s + 1)]
        p[x, y] = c + (255,)
    return im


def pine_wall_block():
    from PIL import Image
    return emerald_pine(Image.new("RGBA", (32, 32)), lawn=True)


TERRAIN = {
    "grass": dict(kind="fill", behaviour="SHORT_GRASS",
                  variants=[(lambda x, y, v=v: grass_px(x, y, v)) for v in range(4)]),
    "tall-grass": dict(kind="blob", behaviour="TALL_GRASS", paint=tall_grass,
                       sdf=dict(margin=0.01, radius=0.01, wobble=0.0, freq=1)),
    "dirt-path": dict(kind="blob", behaviour="NORMAL", paint=dirt_path, soft=False,
                      sdf=dict(margin=2.5, radius=4.5, wobble=0.7, freq=1)),
    "paved-path": dict(kind="blob", behaviour="NORMAL", paint=paved_path,
                       sdf=dict(margin=2, radius=4, wobble=0.0, freq=1)),
    "sand": dict(kind="blob", behaviour="SAND", paint=sand, soft=False, joins=_sand_joins,
                 sdf=dict(margin=2.5, radius=5, wobble=1.0, freq=1)),
    "water": dict(kind="blob", behaviour="POND_WATER", paint=water, frames=8,
                  sdf=dict(margin=2, radius=6, wobble=0.0, freq=1)),
    # a pond edge with a sandy bank (joins water: one pond mixes rock rims and sandy beaches)
    "water-sandy": dict(kind="blob", behaviour="POND_WATER", paint=water_sandy, frames=8, group="water", soft=False,
                        sdf=dict(margin=0.5, radius=7.5, wobble=0.0, freq=1)),
    "shore": dict(kind="blob", behaviour="OCEAN_WATER", paint=shore, frames=8,
                  sdf=dict(margin=3, radius=5, wobble=1.0, freq=1)),
    "cliff": dict(kind="blob", behaviour="NORMAL", paint=cliff, joins=plateau_joins(1, False), top=True,
                  sdf=dict(margin=1.5, radius=6.5, wobble=0.6, freq=1)),
    # two rows under a cliff plateau: the rock face that gives it height (same group, so it joins)
    "cliff-face": dict(kind="blob", behaviour="NORMAL", paint=cliff_face, group="cliff", face=True,
                       joins=plateau_joins(1, True), sdf=dict(margin=1.5, radius=6.5, wobble=0.6, freq=1)),
    # a second, higher level standing on a plateau top (same drawing, its own outline)
    "cliff-2": dict(kind="blob", behaviour="NORMAL", paint=cliff, group="cliff", level=2, top=True,
                    joins=plateau_joins(2, False), sdf=dict(margin=1.5, radius=6.5, wobble=0.6, freq=1)),
    "cliff-face-2": dict(kind="blob", behaviour="NORMAL", paint=cliff_face, group="cliff", level=2, face=True,
                         joins=plateau_joins(2, True), sdf=dict(margin=1.5, radius=6.5, wobble=0.6, freq=1)),
    "lush-grass": dict(kind="blob", patch=True, behaviour="SHORT_GRASS", paint=lush_grass,
                       sdf=dict(margin=1.0, radius=7, wobble=0.0, freq=1)),
    "worn-earth": dict(kind="blob", patch=True, behaviour="NORMAL", paint=worn_earth, soft=False,
                       sdf=dict(margin=1.5, radius=6.5, wobble=0.0, freq=1)),
    "clover": dict(kind="blob", patch=True, behaviour="SHORT_GRASS", paint=clover,
                   sdf=dict(margin=1.0, radius=7, wobble=0.0, freq=1)),
    "pine-wall": dict(kind="quad", behaviour="NORMAL", block=pine_wall_block, fallback="forest", group="tree-wall"),
    "hedge": dict(kind="blob", behaviour="NORMAL", paint=hedge, sdf=dict(margin=1.5, radius=3, wobble=1.0, freq=2)),
    "forest": dict(kind="blob", behaviour="NORMAL", paint=forest, sdf=dict(margin=1.0, radius=5, wobble=1.6, freq=2)),
    # 2x2 Emerald tree block; scenes use it for every even-aligned 2x2 of forest and fall back to the
    # `forest` blob for odd edges
    "tree-wall": dict(kind="quad", behaviour="NORMAL", block=tree_wall_block, fallback="forest"),
    "ledge": dict(kind="row", axis="h", behaviour="JUMP_SOUTH", paint=ledge_south),
    "mountain": dict(kind="blob", behaviour="NORMAL", paint=mountain, soft=False,
                     sdf=dict(margin=0.5, radius=3, wobble=0.6, freq=1)),
    "stairs": dict(kind="row", axis="v", behaviour="NORMAL", paint=stairs, group="cliff"),
    "bridge": dict(kind="row", axis="h", behaviour="NORMAL", paint=bridge_h, group="water"),
    "bridge-v": dict(kind="row", axis="v", behaviour="NORMAL", paint=bridge_v, group="water"),
    "ledge-east": dict(kind="row", axis="v", behaviour="JUMP_EAST", paint=ledge_east),
    "ledge-west": dict(kind="row", axis="v", behaviour="JUMP_WEST", paint=ledge_west),
}
