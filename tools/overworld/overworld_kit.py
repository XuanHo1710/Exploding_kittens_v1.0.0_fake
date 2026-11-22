#!/usr/bin/env python3
"""
overworld_kit: engine for Mons overworld pieces.

CONNECTING PIECES (the core): every terrain that has a border is a 47-tile BLOB autotile.
Each 16 px tile is built per quadrant from its 8 neighbours with a signed-distance edge:
  quadrant with both side neighbours + diagonal -> fill
  both side neighbours, no diagonal             -> concave (inner) corner notch
  one side neighbour only                       -> straight edge
  no side neighbour                             -> rounded convex corner
The edge margin wobbles with a 16 px-periodic function, so any two tiles that share a
border meet pixel-exactly: paths, rivers, ponds, hedges and forests of ANY shape join up.
Other connectors: 4-neighbour mask (fences, 16 tiles) and 2-neighbour rows (ledges, 4 tiles).

Mask bits (neighbour present = same terrain): N=1 NE=2 E=4 SE=8 S=16 SW=32 W=64 NW=128.
A diagonal bit only counts when both adjacent sides are set (blob reduction) -> 47 tiles.
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw

# Gen 3 hardware pass shared with the structure skill (BGR555, alpha 0/255, <= 15 colours / 8x8 tile)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "gen3"))  # tools/gen3: shared Gen 3 pass
import gen3  # noqa: E402

CELL = 16
SCALE = 2
IO = (24, 41, 82)                  # Emerald's navy outline / darkest colour (pret general palette 0)
SHADE_KEY = (1, 2, 3)              # contact_shade marker; gen_overworld swaps it for the owner's shade colour
N, NE, E, SE, S, SW, W, NW = 1, 2, 4, 8, 16, 32, 64, 128
BITS = {"N": N, "NE": NE, "E": E, "SE": SE, "S": S, "SW": SW, "W": W, "NW": NW}


# ---------------------------------------------------------------- palettes (5 tones: light -> deep)
# Emerald / Hoenn colour language: every value is a pret BGR555 level (floor(c5 * 255 / 31)) taken
# from the pokeemerald `general` tileset palettes (data/tilesets/primary/general/palettes/00-05.pal).
# Colours only: the tiles themselves are original Mons drawings.
GRASS = [(164, 213, 197), (115, 197, 164), (98, 189, 156), (65, 180, 131), (24, 164, 106)]   # mint lawn
TALL = [(180, 255, 131), (131, 197, 98), (57, 139, 49), (24, 123, 74), (57, 82, 0)]          # encounter grass
DIRT = [(238, 230, 164), (222, 205, 131), (213, 180, 106), (205, 156, 82), (164, 123, 74)]   # sandy path
PAVE = [(238, 238, 230), (213, 213, 213), (189, 189, 189), (164, 164, 164), (131, 131, 139)]
SAND = [(255, 246, 197), (238, 230, 164), (222, 205, 131), (213, 180, 106), (205, 156, 82)]
WATER = [(222, 230, 238), (115, 189, 246), (98, 172, 238), (74, 115, 172), (24, 41, 82)]
SEA = [(222, 230, 238), (98, 164, 222), (82, 139, 197), (74, 115, 172), (41, 65, 139)]
CLIFF = [(238, 213, 205), (222, 180, 164), (189, 148, 139), (156, 115, 115), (98, 65, 82)]
LEAF = [(180, 255, 131), (131, 197, 98), (57, 139, 49), (24, 123, 74), (57, 82, 0)]
HEDGE = [(180, 255, 131), (131, 197, 98), (82, 164, 74), (57, 139, 49), (57, 82, 0)]
BARK = [(164, 98, 90), (106, 90, 90), (65, 57, 49)]
WOOD = [(255, 197, 148), (222, 148, 115), (164, 98, 90), (106, 74, 65)]
STONE = [(222, 230, 238), (189, 205, 230), (156, 164, 189), (98, 98, 123), (65, 74, 106)]
FOLIAGE_OUT = (57, 82, 0)      # Emerald trees and hedges: deep olive outline, never black
EDGE_DARK = (205, 156, 82)     # sandy rim where paths meet grass (soft, no dark outline in Gen 3)
GRASS_SHADE = (65, 180, 131)   # opaque contact shade baked under props standing on the lawn
TG_LEAF, TG_TIP, TG_DEPTH = (24, 164, 106), (164, 213, 197), (57, 82, 0)   # tall-grass inks

# ---------------------------------------------------------------- palette sets
# MONS_PALETTE selects the colour language; the pixel structure (Emerald shapes, soft edges) is the
# same for all of them.
#   emerald  : pokeemerald `general` palettes (mint Hoenn lawn, olive foliage)
#   gym      : every ramp taken from the Mons gym sheets, so pieces sit in tone with the gyms
#              (foliage = grass gym LEAF, soil = ground gym SAND, water = water gym SEA, stone/wood =
#              gymkit STONE/WOOD, outlines = the gyms' navy-plum); lawn = gym-green family
#   gym-mint : as `gym`, but the lawn keeps the Emerald mint
PALETTE = os.environ.get("MONS_PALETTE", "gym")      # chosen 2026-11-17: tone-matched with the gyms
if PALETTE in ("gym", "gym-mint"):
    LEAF = [(178, 230, 116), (118, 200, 90), (72, 162, 74), (46, 122, 66), (30, 84, 58)]   # gyms/grass.py
    HEDGE = [(178, 230, 116), (118, 200, 90), (88, 176, 80), (72, 162, 74), (30, 84, 58)]
    TALL = LEAF
    FOLIAGE_OUT = (30, 40, 52)                                   # the gyms' dark teal-navy outline
    DIRT = [(248, 222, 176), (232, 198, 148), (210, 170, 122), (190, 150, 110), (150, 110, 90)]  # ground gym SAND
    EDGE_DARK = DIRT[2]
    SAND = [(250, 232, 196), (240, 216, 172), (222, 192, 148), (196, 160, 122), (160, 124, 100)]  # ground gym CREAM
    PAVE = [(234, 226, 222), (222, 212, 206), (186, 174, 174), (146, 134, 142), (106, 96, 112)]   # gymkit STONE
    WATER = [(200, 230, 255), (120, 196, 250), (88, 160, 236), (48, 112, 200), (24, 56, 120)]   # water gym SEA/GLASS
    SEA = [(216, 240, 255), (88, 168, 240), (64, 136, 220), (40, 100, 184), (24, 56, 120)]
    CLIFF = [(222, 212, 206), (186, 174, 174), (146, 134, 142), (106, 96, 112), (70, 60, 80)]  # warm gym stone
    STONE = [(222, 212, 206), (186, 174, 174), (146, 134, 142), (106, 96, 112), (70, 62, 82)]
    BARK = [(154, 102, 66), (112, 72, 54), (76, 48, 44)]                                      # grass gym TIMBER
    WOOD = [(226, 176, 116), (192, 138, 86), (154, 102, 66), (112, 72, 54)]
    IO = (27, 23, 38)                                             # boxkit / gym silhouette outline
    TG_LEAF, TG_TIP, TG_DEPTH = LEAF[2], LEAF[0], LEAF[4]
    if PALETTE == "gym":
        GRASS = [(186, 226, 140), (136, 200, 106), (120, 188, 98), (96, 170, 88), (60, 134, 76)]
    GRASS_SHADE = GRASS[3]
def mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def h16(x, y, s=0):
    """Deterministic hash on a 16-periodic lattice (keeps tiles exactly repeatable)."""
    x, y = int(x) % 16, int(y) % 16
    n = (x * 374761393 + y * 668265263 + s * 2246822519) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return (n ^ (n >> 16)) & 255


# ---------------------------------------------------------------- blob 47
def reduce_mask(m):
    for diag, a, b in ((NE, N, E), (SE, S, E), (SW, S, W), (NW, N, W)):
        if not (m & a and m & b):
            m &= ~diag
    return m


BLOB_MASKS = sorted({reduce_mask(m) for m in range(256)},
                    key=lambda m: (bin(m & (N | E | S | W)).count("1"), m))
assert len(BLOB_MASKS) == 47
BLOB_INDEX = {m: i for i, m in enumerate(BLOB_MASKS)}
BLOB_COLS = 8                      # sheet = 8 x 6 tiles (47 used, last slot empty)
BLOB_ROWS = 6


def blob_index(mask):
    """Tile index in the 47 sheet for a raw 8-neighbour mask."""
    return BLOB_INDEX[reduce_mask(mask)]


def mask_at(grid, c, r, same):
    """Raw neighbour mask of cell (c, r) in an ASCII grid; same(ch) says if ch connects."""
    m = 0
    for name, (dx, dy) in (("N", (0, -1)), ("NE", (1, -1)), ("E", (1, 0)), ("SE", (1, 1)),
                           ("S", (0, 1)), ("SW", (-1, 1)), ("W", (-1, 0)), ("NW", (-1, -1))):
        x, y = c + dx, r + dy
        inside = 0 <= y < len(grid) and 0 <= x < len(grid[0])
        if (same(grid[y][x]) if inside else True):
            m |= BITS[name]
    return m


WOBBLE_PHASE = 0.9


def blob_sdf(x, y, mask, margin=3.0, radius=4.0, wobble=0.8, freq=1):
    """Signed distance (px, >0 inside) from pixel (x, y) of a 16 px tile to the terrain edge,
    plus the facing of the nearest edge ('N','S','E','W','NE',...) or None when deep inside."""
    px, py = x + 0.5, y + 0.5
    west, north = x < 8, y < 8
    hx, vy = ("W" if west else "E"), ("N" if north else "S")
    ex = px if west else 16 - px
    ey = py if north else 16 - py
    H, V = bool(mask & BITS[hx]), bool(mask & BITS[vy])
    D = bool(mask & BITS[vy + hx])
    two_pi = 2 * math.pi / 16
    # margins wobble but never drop below 0.5 px: a negative margin would let the edge cross
    # the tile border and leave see-through lines in the overlay sheets
    # ONE wobble profile for both axes: a horizontal run and a vertical run of the same terrain get
    # exactly the same edge (style is identical whichever way a path goes); still 16-periodic, so
    # neighbouring tiles meet pixel-exactly
    mx = max(0.5, margin + wobble * math.sin(two_pi * freq * py + WOBBLE_PHASE))   # W/E edge margin
    my = max(0.5, margin + wobble * math.sin(two_pi * freq * px + WOBBLE_PHASE))   # N/S edge margin
    if H and V:
        if D:
            return 99.0, None
        e = math.hypot(ex / mx, ey / my)
        return (e - 1) * min(mx, my), vy + hx
    if H:
        return ey - my, vy
    if V:
        return ex - mx, hx
    qx, qy = mx + radius - ex, my + radius - ey
    if qx > 0 and qy > 0:
        return radius - math.hypot(qx, qy), vy + hx
    if ey - my < ex - mx:
        return ey - my, vy
    return ex - mx, hx


def soften(d, x, y):
    """Soft Emerald-style edge for ANY blob terrain: the outermost inside ring and the first outside
    ring become a checker of 'inside' and 'outside', so hard outlines dissolve into the ground over
    2 px. Returns the distance to paint with (or None to leave the pixel as it is). Parity uses the
    tile-local x + y; tiles are 16 px (even), so the checker is continuous across tiles."""
    if 0 <= d < 1 and (x + y) % 2 == 1:
        return -0.5                              # outside shows through the rim
    if -1 <= d < 0 and (x + y) % 2 == 0:
        return 1.5                               # the terrain's own edge tone spills one pixel out
    return None


def blob_sheet(paint, frames=1, overlay_cut=None, soft=True, **sdf):
    """Render the 47-tile sheet. paint(d, facing, x, y, f, mask) -> RGB(A).
    overlay_cut: pixels with d < overlay_cut become transparent, so the terrain can be layered
    on top of ANY ground (lava in scorched earth, quicksand in dry earth, pool on a plaza).
    soft: dither the edge 2 px wide (see soften); in overlay sheets the outside half of the
    checker is transparent, so the soft edge works on any ground.
    Returns a list of sheets (one per frame), each 8x6 tiles at 16 px."""
    out = []
    for f in range(frames):
        sheet = Image.new("RGBA", (BLOB_COLS * CELL, BLOB_ROWS * CELL), (0, 0, 0, 0))
        p = sheet.load()
        for i, m in enumerate(BLOB_MASKS):
            X, Y = (i % BLOB_COLS) * CELL, (i // BLOB_COLS) * CELL
            for y in range(CELL):
                for x in range(CELL):
                    d, facing = blob_sdf(x, y, m, **sdf)
                    if soft:
                        ds = soften(d, x, y)
                        if ds is not None:
                            d = ds
                    if overlay_cut is not None and d < overlay_cut:
                        continue
                    c = paint(d, facing, x, y, f, m)
                    if c is not None:
                        p[X + x, Y + y] = c if len(c) == 4 else c + (255,)
        out.append(sheet)
    return out


def blob_tile(sheet, mask):
    i = blob_index(mask)
    return sheet.crop(((i % BLOB_COLS) * CELL, (i // BLOB_COLS) * CELL,
                       (i % BLOB_COLS + 1) * CELL, (i // BLOB_COLS + 1) * CELL))


# ---------------------------------------------------------------- 4-neighbour + row connectors
CROSS_MASKS = list(range(16))      # bit 1=N 2=E 4=S 8=W


def cross_mask(grid, c, r, same):
    m = 0
    for bit, (dx, dy) in ((1, (0, -1)), (2, (1, 0)), (4, (0, 1)), (8, (-1, 0))):
        x, y = c + dx, r + dy
        if 0 <= y < len(grid) and 0 <= x < len(grid[0]) and same(grid[y][x]):
            m |= bit
    return m


def row_index(grid, c, r, same, axis="h"):
    """0 single, 1 start (left/top), 2 middle, 3 end (right/bottom)."""
    dx, dy = (1, 0) if axis == "h" else (0, 1)

    def has(x, y):
        return 0 <= y < len(grid) and 0 <= x < len(grid[0]) and same(grid[y][x])
    a, b = has(c - dx, r - dy), has(c + dx, r + dy)
    return {(False, False): 0, (False, True): 1, (True, True): 2, (True, False): 3}[(a, b)]


# ---------------------------------------------------------------- shared painters
GRASS_VARIANTS = 4


LAWN_DOTS = [  # light dots on a loose, never-aligned 16 px lattice (the Hoenn lawn's fine speckle)
    ((1, 2), (6, 1), (11, 3), (14, 6), (3, 7), (8, 6), (12, 10), (1, 12), (6, 11), (10, 14), (14, 13)),
    ((2, 1), (8, 3), (13, 1), (4, 5), (10, 8), (15, 9), (1, 10), (6, 13), (12, 14)),
    ((3, 3), (9, 1), (14, 4), (6, 8), (11, 10), (2, 13), (8, 14), (14, 12)),
    ((5, 2), (12, 4), (2, 8), (9, 9), (14, 14), (5, 13)),
]
LAWN_DARK = [((4, 10), (13, 7)), ((7, 6),), ((12, 2),), ()]


def grass_px(x, y, v=0):
    """Emerald-style short grass: mint with single light dots scattered over the cell (and a rare
    darker dot); 4 exact-repeat variants with fewer dots each, so the lawn speckles without a grid."""
    x, y = x % 16, y % 16
    v %= GRASS_VARIANTS
    if (x, y) in LAWN_DOTS[v]:
        return GRASS[0]
    if (x, y) in LAWN_DARK[v]:
        return GRASS[2]
    return GRASS[1]


def blob_shade(ramp, nx, ny):
    l = -(nx * 0.65) + (-ny) * 0.75
    return ramp[0] if l > 0.55 else ramp[1] if l > 0.05 else ramp[2] if l > -0.45 else ramp[3]


def blobs_mask(blobs, w, h):
    """Pixels covered by ellipses (cx, cy, rx, ry) -> {(x, y): (nx, ny)} of the covering blob."""
    pts = {}
    for (cx, cy, rx, ry) in blobs:
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if 0 <= x < w and 0 <= y < h:
                    q = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
                    if q < 1:
                        nx, ny = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
                        l = -(nx * 0.65) - ny * 0.75
                        if (x, y) not in pts or l > pts[(x, y)][2]:
                            pts[(x, y)] = (nx, ny, l)
    return pts


def draw_blobs(img, blobs, ramp, outline, speck=None):
    p = img.load()
    pts = blobs_mask(blobs, img.width, img.height)
    for (x, y), (nx, ny, _) in pts.items():
        edge = any((x + dx, y + dy) not in pts for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        col = outline if edge else blob_shade(ramp, nx, ny)
        if speck and not edge and h16(x, y, speck) > 236:
            col = ramp[0]
        p[x, y] = col + (255,)
    return pts


def shade_px(img, x, y, col):
    if 0 <= x < img.width and 0 <= y < img.height and img.getpixel((x, y))[3] == 0:
        img.putpixel((x, y), col + (255,))


def contact_shade(img, x0, x1, y, col=None, alpha=None):
    """Gen 3 contact shade: an OPAQUE 1-2 px band under a prop (no semi-transparency). It is drawn
    with SHADE_KEY; gen_overworld replaces the key with the owner's ground shade (lawn mint for base
    props, the gym ground's dark tone for gym props). `alpha` is accepted for old call sites and
    ignored; the corners are trimmed so the band reads as a soft ellipse."""
    for x in range(x0, x1):
        for yy in (y, y + 1):
            corner = yy == y + 1 and (x in (x0, x1 - 1))
            if corner:
                continue
            if 0 <= x < img.width and 0 <= yy < img.height and img.getpixel((x, yy))[3] == 0:
                img.putpixel((x, yy), (col or SHADE_KEY) + (255,))


# ---------------------------------------------------------------- night
def night(img, emissive=()):
    """Cool, darker night version; pixels whose RGB is in `emissive` stay unchanged."""
    out = img.copy()
    p = out.load()
    keep = set(emissive) | {SHADE_KEY}       # the shade marker is resolved per scene after night
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = p[x, y]
            if a == 0 or (r, g, b) in keep:
                continue
            p[x, y] = (int(r * .46), int(g * .52 + 4), min(255, int(b * .72 + 42)), a)
    return out


def gen3_pass(img):
    """Gen 3 hardware rules at native scale: BGR555 colours, alpha 0/255, <= 15 colours per 8x8 tile.
    Per-pixel snap + per-tile reduce only (no global merge), so a tile cut from a sheet and the same
    tile inside the sheet always come out identical."""
    return gen3.to_gen3(img, key=None)


def up(img, raw=False):
    """x2 NEAREST export; every asset goes through the Gen 3 pass first (raw=True only for the
    opt-in, non-Gen 3 soft night glow)."""
    im = img if raw else gen3_pass(img)
    return im.resize((im.width * SCALE, im.height * SCALE), Image.NEAREST)


# ---------------------------------------------------------------- Tiled
def tsj_blob(name, image, frames, behaviour, duration=267, tiles_px=CELL * SCALE):
    """Tiled tileset: 47-blob 'mixed' wangset + per-frame animation + behaviour property.
    The image holds `frames` full sheets stacked vertically (frame f = rows f*6..f*6+5)."""
    tiles = []
    wangtiles = []
    for i, m in enumerate(BLOB_MASKS):
        def bit(b):
            return 1 if m & b else 2
        # Tiled order: top, top-right, right, bottom-right, bottom, bottom-left, left, top-left
        wangid = [bit(N), bit(NE), bit(E), bit(SE), bit(S), bit(SW), bit(W), bit(NW)]
        wangtiles.append({"tileid": i, "wangid": wangid})
        t = {"id": i, "properties": [{"name": "behaviour", "type": "string", "value": behaviour}]}
        if frames > 1:
            t["animation"] = [{"tileid": i + f * BLOB_COLS * BLOB_ROWS, "duration": duration}
                              for f in range(frames)]
        tiles.append(t)
    return {"type": "tileset", "version": "1.10", "name": name, "image": image,
            "imagewidth": BLOB_COLS * tiles_px, "imageheight": BLOB_ROWS * tiles_px * frames,
            "tilewidth": tiles_px, "tileheight": tiles_px, "columns": BLOB_COLS,
            "tilecount": BLOB_COLS * BLOB_ROWS * frames, "margin": 0, "spacing": 0,
            "tiles": tiles,
            "wangsets": [{"name": name, "type": "mixed", "tile": BLOB_INDEX[255 & reduce_mask(255)],
                          "colors": [{"name": name, "color": "#3080ff", "probability": 1, "tile": -1},
                                     {"name": "other", "color": "#80ff40", "probability": 1, "tile": -1}],
                          "wangtiles": wangtiles}]}


def write_json(path, data):
    with open(path, "w") as fh:
        json.dump(data, fh, indent=1)


def glow_sprite(tint, cells=3, peak=120):
    """Soft round light pool (RGBA) to lay under a lamp at night; `cells` wide, centred."""
    size = cells * CELL
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    p = im.load()
    c = (size - 1) / 2
    for y in range(size):
        for x in range(size):
            r = math.hypot((x - c) / c, (y - c) / c * 1.25)
            if r < 1:
                a = int(peak * (1 - r) ** 1.4)
                a -= a % 16                     # stepped falloff = retro banding, no smooth gradient
                if a > 0:
                    p[x, y] = tint + (a,)
    return im
