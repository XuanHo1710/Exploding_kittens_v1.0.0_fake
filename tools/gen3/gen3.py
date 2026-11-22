#!/usr/bin/env python3
"""
gen3: Gen 3 (GBA, pokeemerald / pokefirered) hardware rules for Mons structure art.

Facts (docs/explanation/research/gen3-visual-style.md, measured from pret data):
  - colour is 15-bit BGR555; pret stores a 5-bit level c as floor(c * 255 / 31) in 8-bit PNG/.pal
  - 4bpp 8x8 tiles: each tile uses ONE 16-colour palette, index 0 transparent -> <= 15 colours
  - a map's tilesets hold <= 13 BG palettes; one Emerald building uses 3-6 of them
  - metatile = 16x16; alpha is either 0 or 255 (no blending on BG tiles)

Library:
  to_gen3(img)            -> RGBA image snapped to BGR555, binary alpha, <= 15 colours per 8x8 tile
  report(img, grid=16)    -> dict of measurable checks (see check_gen3.py for the CLI)
Work on NATIVE pixels (16 px metatiles). Upscale x2 with NEAREST only after this pass.
"""
from PIL import Image

MAGENTA = (255, 0, 255)
LEVELS = [c * 255 // 31 for c in range(32)]
LEVEL_SET = set(LEVELS)
TILE = 8
MAX_TILE_COLOURS = 15
MAX_PALETTES = 13


def snap(c):
    """Nearest BGR555 colour, written the way pret writes it (floor(c5 * 255 / 31))."""
    return tuple(LEVELS[min(31, (v * 31 + 127) // 255)] for v in c[:3])


def is_bgr555(c):
    return all(v in LEVEL_SET for v in c[:3])


def _opaque(p, key):
    return p[3] == 255 and p[:3] != key


def _dist(a, b):
    # perceptual-ish weights (green most visible)
    return 2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2


def _reduce(colours, limit, keep=()):
    """Map a {colour: count} dict to <= limit colours by merging the closest pair (rarer one absorbed)."""
    cols = dict(colours)
    remap = {c: c for c in cols}
    while len(cols) > limit:
        best = None
        keys = list(cols)
        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                d = _dist(keys[i], keys[j])
                if best is None or d < best[0]:
                    best = (d, keys[i], keys[j])
        _, a, b = best
        # absorb the rarer colour, unless it is a protected one (outline)
        lo, hi = (a, b) if cols[a] < cols[b] else (b, a)
        if lo in keep and hi not in keep:
            lo, hi = hi, lo
        cols[hi] += cols.pop(lo)
        for k, v in remap.items():
            if v == lo:
                remap[k] = hi
    return remap


def to_gen3(img, key=MAGENTA, alpha_cut=128, keep=(), max_colours=None, max_palettes=None, regions=()):
    """Return a new RGBA image obeying the Gen 3 rules. Pixels equal to `key` stay as-is
    (magenta background sheets); transparent pixels become (0, 0, 0, 0).
    max_colours: first merge the whole image down to this many colours (a building's budget);
    max_palettes: then keep merging until the 8x8 tiles pack into this many 15-colour palettes,
    checked on the whole image and on every box in `regions` (the greedy packer is not monotone,
    so a single cell is verified on its own, exactly as check_gen3.py measures it)."""
    im = img.convert("RGBA")
    w, h = im.size
    src = im.load()
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = out.load()
    keep = {snap(c) for c in keep}
    for y in range(h):
        for x in range(w):
            r, g, b, a = src[x, y]
            if a < alpha_cut:
                continue
            if (r, g, b) == key:
                px[x, y] = key + (255,)
            else:
                px[x, y] = snap((r, g, b)) + (255,)

    def global_merge(limit):
        counts = {}
        for y in range(h):
            for x in range(w):
                p = px[x, y]
                if _opaque(p, key):
                    counts[p[:3]] = counts.get(p[:3], 0) + 1
        if len(counts) <= limit:
            return len(counts)
        remap = _reduce(counts, limit, keep)
        for y in range(h):
            for x in range(w):
                p = px[x, y]
                if _opaque(p, key):
                    px[x, y] = remap[p[:3]] + (255,)
        return limit

    def tile_reduce():
        for ty in range(0, h, TILE):
            for tx in range(0, w, TILE):
                counts = {}
                for y in range(ty, min(h, ty + TILE)):
                    for x in range(tx, min(w, tx + TILE)):
                        p = px[x, y]
                        if _opaque(p, key):
                            counts[p[:3]] = counts.get(p[:3], 0) + 1
                if len(counts) <= MAX_TILE_COLOURS:
                    continue
                remap = _reduce(counts, MAX_TILE_COLOURS, keep)
                for y in range(ty, min(h, ty + TILE)):
                    for x in range(tx, min(w, tx + TILE)):
                        p = px[x, y]
                        if _opaque(p, key):
                            px[x, y] = remap[p[:3]] + (255,)

    def palettes_needed():
        # the whole image AND every region (e.g. each Day / Night / door-frame cell) must fit
        counts = [palette_count(out, key)] + [palette_count(out.crop(b), key) for b in regions]
        return None if None in counts else max(counts)

    n = global_merge(max_colours) if max_colours else global_merge(10 ** 6)
    tile_reduce()
    if max_palettes:
        while n > MAX_TILE_COLOURS:
            pc = palettes_needed()
            if pc is not None and pc <= max_palettes:
                break
            n = global_merge(n - 1)
            tile_reduce()
    return out


def tile_sets(img, key=MAGENTA):
    im = img.convert("RGBA")
    w, h = im.size
    px = im.load()
    sets = []
    for ty in range(0, h - h % TILE, TILE):
        for tx in range(0, w - w % TILE, TILE):
            s = frozenset(px[x, y][:3] for y in range(ty, ty + TILE) for x in range(tx, tx + TILE)
                          if _opaque(px[x, y], key))
            if s:
                sets.append(s)
    return sets


def palette_count(img, key=MAGENTA):
    """Greedy estimate of how many 15-colour palettes the 8x8 tiles need (lower bound-ish)."""
    pals = []
    for s in sorted(set(tile_sets(img, key)), key=len, reverse=True):
        if len(s) > MAX_TILE_COLOURS:
            return None  # impossible: a tile already breaks the 15-colour rule
        best = None
        for i, p in enumerate(pals):
            u = p | s
            if len(u) <= MAX_TILE_COLOURS and (best is None or len(u) < best[0]):
                best = (len(u), i)
        if best is None:
            pals.append(set(s))
        else:
            pals[best[1]] |= s
    return len(pals)


def native_scale(img, ks=(2,)):
    """Upscale factor of a Mons export: 2 if the image is an exact NEAREST x2 upscale, else 1.
    Only x2 is tried by default: a flat one-colour tile would otherwise look like a x4 upscale."""
    im = img.convert("RGBA")
    w, h = im.size
    px = im.load()
    best = 1
    for k in ks:
        if w % k or h % k:
            break
        if all(px[x, y] == px[x - x % k, y - y % k] for y in range(h) for x in range(w)):
            best = k
        else:
            break
    return best


def report(img, grid=16, key=MAGENTA):
    """Measurable Gen 3 checks on an image (auto-detects an x2/x4 upscale)."""
    k = native_scale(img)
    im = img.convert("RGBA")
    if k > 1:
        im = im.resize((im.width // k, im.height // k), Image.NEAREST)
    w, h = im.size
    px = im.load()
    semi = non555 = 0
    colours = set()
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if 0 < p[3] < 255:
                semi += 1
            if _opaque(p, key):
                colours.add(p[:3])
                xs.append(x)
                ys.append(y)
                if not is_bgr555(p):
                    non555 += 1
    sets = tile_sets(im, key)
    worst = max((len(s) for s in sets), default=0)
    over = sum(1 for s in sets if len(s) > MAX_TILE_COLOURS)
    bbox = (min(xs), min(ys), max(xs) + 1, max(ys) + 1) if xs else None
    return {
        "scale": k, "native": (w, h),
        "canvas_on_grid": w % grid == 0 and h % grid == 0,
        "footprint_tiles": None if bbox is None else ((bbox[2] - bbox[0] + grid - 1) // grid,
                                                       (bbox[3] - bbox[1] + grid - 1) // grid),
        "bbox": bbox, "colours": len(colours),
        "semi_alpha_px": semi, "non_bgr555_px": non555,
        "tile_colours_max": worst, "tiles_over_15": over,
        "palettes_est": palette_count(im, key),
    }


def failures(r, max_palettes=MAX_PALETTES):
    f = []
    if not r["canvas_on_grid"]:
        f.append("canvas not on the grid")
    if r["semi_alpha_px"]:
        f.append(f"{r['semi_alpha_px']} semi-transparent px")
    if r["non_bgr555_px"]:
        f.append(f"{r['non_bgr555_px']} px off the BGR555 grid")
    if r["tiles_over_15"]:
        f.append(f"{r['tiles_over_15']} 8x8 tiles over 15 colours (max {r['tile_colours_max']})")
    if r["palettes_est"] is not None and r["palettes_est"] > max_palettes:
        f.append(f"needs ~{r['palettes_est']} palettes (> {max_palettes})")
    return f
