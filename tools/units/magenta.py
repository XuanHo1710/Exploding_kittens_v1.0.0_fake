#!/usr/bin/env python3
"""
Shared magenta-background cleaner for Pokémon sheets (Pillow only). Used by normalize_sheet.py (raw drafts),
clean_magenta.py (final sheets) and check_magenta.py (the audit), so all three agree on what "magenta left" is.

What counts as background left (never a colour of the species' own art, see `allowed_colours`):
  - key   : near-#FF00FF pixels (JPEG noise of the key) and flat light-magenta slot panels (a light magenta colour
            covering a big share of the sheet), connected to the background (flood fill from the background,
            4-neighbours: a pixel enclosed by the drawing is never keyed);
  - shade : the darker / greyed magenta shades the image model paints (shadows under the feet, slot tints),
            hue very close to 300 deg and saturated, also flooded from the background;
  - frame : thin magenta-hued lines left by a panel / grid border (straight lines, rectangle outlines);
  - fringe: the 1-2 px ring of magenta-tinted pixels on the drawing's edge (outline blended with the key). It is
            despilled, not cut: a dark pixel becomes the drawing's own dark outline colour, a light one the
            neighbouring body colour with the closest brightness (a lone pink speck with no body around becomes
            background).
Allowed colours come from the species' `<slug>-reference.jpg` (official artwork) and its Fall-back texture
(`assets/pokemon/Fall-back/<Gen>/<NNN>-<Name>/textures/<slug>.png`): pink / purple species keep their colours.
A loss guard restores a cell where cleaning would remove more than half of its drawing (shade / speck removals).

  python3 -c "import sys; sys.path.insert(0, 'tools/units'); import magenta; print(magenta.allowed_for_sheet(
      'assets/pokemon/Gen1-Kanto/042-Golbat/golbat-movement.png')[:5])"
"""
import glob
import os
import re
import sys
from collections import Counter, deque

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
PYDEPS = os.path.join(HERE, ".pydeps")
if os.path.isdir(PYDEPS) and PYDEPS not in sys.path:
    sys.path.insert(0, PYDEPS)

from PIL import Image, ImageChops  # noqa: E402

KEY = (255, 0, 255)
# the ground-shadow ellipse normalize_sheet.py draws itself (fill, outline): never magenta left
OWN_SHADOW = ((42, 16, 58), (27, 23, 38))
TINT_MIN = 24            # min(r, b) - g at or above this = magenta-tinted
ALLOW_TOL = 24           # Euclidean distance to an allowed colour …
ALLOW_G_TOL = 20         # … and the green channel within this (a key blend has almost no green)


# ---------------------------------------------------------------- colour tests

def luma(p):
    return (299 * p[0] + 587 * p[1] + 114 * p[2]) // 1000


def kdist2(p):
    return (255 - p[0]) ** 2 + p[1] ** 2 + (255 - p[2]) ** 2


def is_tinted(p):
    """magenta-hued: red and blue both well above green, roughly balanced (hue ~ 270-330 deg)"""
    lo, hi = (p[0], p[2]) if p[0] < p[2] else (p[2], p[0])
    return lo - p[1] >= TINT_MIN and lo >= 0.5 * hi


def is_shade(p):
    """a darker / greyed shade of the key: saturated, hue very close to 300 deg (painted shadows, slot tints, noise)"""
    lo, hi = (p[0], p[2]) if p[0] < p[2] else (p[2], p[0])
    return hi >= 115 and lo >= 0.8 * hi and p[1] <= 0.15 * hi


def is_light_tint(p):
    """a light magenta panel colour (the flat slot panels the image model sometimes paints)"""
    lo, hi = (p[0], p[2]) if p[0] < p[2] else (p[2], p[0])
    return hi >= 170 and lo >= 0.8 * hi and lo - p[1] >= 60


# ---------------------------------------------------------------- allowed (species) colours

def _bins(pixels, share):
    c = Counter((p[0] >> 3, p[1] >> 3, p[2] >> 3) for p in pixels)
    n = max(1, len(pixels))
    return [(r * 8 + 4, g * 8 + 4, b * 8 + 4) for (r, g, b), k in c.items() if k >= share * n]


def palette_of(path, share=0.001):
    """magenta-ish colours of an official artwork (.jpg on white) or a texture (.png with alpha)"""
    try:
        im = Image.open(path)
    except OSError:
        return []
    im = im.convert("RGBA")
    if im.width * im.height > 300 * 300:
        im.thumbnail((300, 300), Image.Resampling.NEAREST)
    raw = im.tobytes()
    px = [tuple(raw[i:i + 3]) for i in range(0, len(raw), 4) if raw[i + 3] >= 128]
    px = [p for p in px if min(p) < 232]                     # the artwork's white background
    return [c for c in _bins(px, share) if min(c[0], c[2]) - c[1] >= 10 and kdist2(c) >= 60 * 60]


_FB = None


def fallback_textures(slug, folder=None):
    """the species' base texture(s) in assets/pokemon/Fall-back (no shiny / no emissive / no special forms)"""
    global _FB
    num = None
    if folder:
        m = re.match(r"(\d{3,4})-", os.path.basename(folder.rstrip("/")))
        num = m.group(1) if m else None
    if _FB is None:
        _FB = {}
        for d in glob.glob(os.path.join(REPO, "assets", "units", "Fall-back", "*", "*")):
            m = re.match(r"(\d{3,4})-", os.path.basename(d))
            if m:
                _FB.setdefault(m.group(1), []).append(d)
    dirs = _FB.get(num, []) if num else []
    if not dirs:
        dirs = [d for ds in _FB.values() for d in ds if os.path.basename(d).split("-", 1)[1].lower().replace(" ", "-") == slug]
    out = []
    for d in dirs:
        tex = sorted(glob.glob(os.path.join(d, "textures", "*.png")))
        base = [t for t in tex if "_" not in os.path.basename(t)]
        out += base or [t for t in tex if not re.search(r"shiny|emissive", os.path.basename(t))]
    return out


def find_reference(slug, *dirs):
    """<slug>-reference.jpg in the given folders, else in the species folder under assets/pokemon"""
    for d in dirs:
        if d:
            p = os.path.join(d, f"{slug}-reference.jpg")
            if os.path.isfile(p):
                return p
    hits = glob.glob(os.path.join(REPO, "assets", "units", "Gen*", "*", f"{slug}-reference.jpg"))
    return hits[0] if hits else None


_SLUGS = None


def species_slugs():
    """slug -> species folder of every drawn species (assets/pokemon/Gen*/<NNN>-<Name>/<slug>-*.png|jpg)"""
    global _SLUGS
    if _SLUGS is None:
        _SLUGS = {}
        for f in glob.glob(os.path.join(REPO, "assets", "units", "Gen*", "*", "*-*.*")):
            m = re.match(r"(.+)-(movement|battle|posses|reference)\.(png|jpg)$", os.path.basename(f))
            if m:
                _SLUGS.setdefault(m.group(1), os.path.dirname(f))
    return _SLUGS


def slug_of(path):
    """the species slug a file name starts with (longest match: 'ho-oh-idle.png' -> 'ho-oh')"""
    b = os.path.basename(path).lower()
    best = None
    for s in species_slugs():
        if b.startswith(s + "-") and (best is None or len(s) > len(best)):
            best = s
    return best


def allowed_colours(slug, folder=None, extra_dirs=()):
    """species colours that are magenta-ish but genuine (official artwork + Fall-back texture), plus the own shadow"""
    folder = folder or species_slugs().get(slug)
    cols = list(OWN_SHADOW)
    ref = find_reference(slug, folder, *extra_dirs) if slug else None
    if ref:
        cols += palette_of(ref)
    for t in fallback_textures(slug, folder) if slug else []:
        cols += palette_of(t, share=0.002)
    return cols


def allowed_for_sheet(path):
    slug = slug_of(path) or os.path.basename(path).split("-")[0]
    return allowed_colours(slug, species_slugs().get(slug) or os.path.dirname(path))


class Allowed:
    """fast cached test: is this colour one of the species' own (allowed) colours?"""

    def __init__(self, cols):
        self.cols = [c for c in cols if c not in OWN_SHADOW]     # the own shadow is matched exactly only
        self.cache = {}

    def __call__(self, p):
        v = self.cache.get(p)
        if v is None:
            if p in OWN_SHADOW:
                v = True
            elif kdist2(p) < 60 * 60:
                v = False                                   # near-pure key is never a species colour
            else:
                v = any((p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2 <= ALLOW_TOL ** 2
                        and abs(p[1] - c[1]) <= ALLOW_G_TOL for c in self.cols)
            self.cache[p] = v
        return v


# ---------------------------------------------------------------- the cleaner

def tinted_indices(im, bg_mask=None):
    """indices of the non-background pixels with min(r, b) - g >= TINT_MIN (Pillow band maths, then a C-speed
    regex scan)"""
    r, g, b = im.convert("RGB").split()
    m = ImageChops.subtract(ImageChops.darker(r, b), g).point(lambda v: 255 if v >= TINT_MIN else 0)
    if bg_mask is not None:
        m = ImageChops.subtract(m, bg_mask)
    return [mo.start() for mo in re.finditer(b"[^\x00]", m.tobytes())]


def outline_colour(img, bg_mask):
    """the drawing's own dark outline colour: the most common untinted dark colour of the drawing (an existing
    colour, so cleaning adds no new colour)"""
    dark = img.convert("L").point(lambda v: 255 if v < 70 else 0)
    dark = ImageChops.subtract(dark, bg_mask)
    cols = Image.composite(img, Image.new("RGB", img.size, KEY), dark).getcolors(1 << 24) or []
    cols = [(n, c) for n, c in cols if c != KEY and not is_tinted(c)]
    if not cols:
        return (24, 20, 32)
    return max(cols)[1]


def mask_of(bg, W, H):
    """bytearray 0/1 -> Pillow 'L' mask 0/255"""
    return Image.frombytes("L", (W, H), bytes(bg).translate(_TO255))


_TO255 = bytes([0, 255] + [255] * 254)
_TO1 = bytes([0] + [1] * 255)


def drop_soft_panels(flood, W, H, col):
    """keep only real panels among the 'panel' pixels: a region (4-neighbours) that is a filled rectangle at least
    40 x 40 px with its corners filled (an aura / gas of the species' own colour is not rectangular); the other
    'panel' pixels stay keyable only when they are near-#FF00FF"""
    N = W * H
    pan = {i for i, f in flood.items() if f == "panel"}
    seen = set()
    for s in list(pan):
        if s in seen:
            continue
        comp, st = [], [s]
        seen.add(s)
        while st:
            i = st.pop()
            comp.append(i)
            x = i % W
            for j in ((i - 1) if x > 0 else -1, (i + 1) if x < W - 1 else -1, i - W, i + W):
                if 0 <= j < N and j in pan and j not in seen:
                    seen.add(j)
                    st.append(j)
        xs = [i % W for i in comp]
        ys = [i // W for i in comp]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        bw, bh = x1 - x0 + 1, y1 - y0 + 1
        cs = set(comp)

        def corner(cx, cy, dx, dy):
            return sum(1 for a in range(4) for b in range(4) if (cy + b * dy) * W + cx + a * dx in cs) >= 8

        ok = bw >= 40 and bh >= 40 and len(comp) >= 0.3 * bw * bh and \
            sum((corner(x0, y0, 1, 1), corner(x1, y0, -1, 1), corner(x0, y1, 1, -1), corner(x1, y1, -1, -1))) >= 3
        if not ok:
            for i in comp:
                if kdist2(col(i)) < 100 * 100:
                    flood[i] = "key"
                else:
                    del flood[i]


def thick_regions(cand, W, H):
    """tinted pixels inside an area at least 7 px thick (morphological opening, 7 x 7): the drawing's own pink /
    purple parts. A 1-3 px fringe ring, even one touching such an area, is not part of it"""
    if not cand:
        return set()
    from PIL import ImageFilter
    buf = bytearray(W * H)
    for i in cand:
        buf[i] = 255
    op = Image.frombytes("L", (W, H), bytes(buf)).filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(7))
    return {mo.start() for mo in re.finditer(b"[^\x00]", op.tobytes())} & cand


def dark_edge(px, bg, W, H):
    """indices of dark drawn pixels (luma < 70) within 2 px of the background (Pillow: dark mask AND dilated background)"""
    from PIL import ImageFilter
    img = Image.frombytes("RGB", (W, H), bytes(px))
    m = mask_of(bg, W, H)
    dark = ImageChops.subtract(img.convert("L").point(lambda v: 255 if v < 70 else 0), m)
    near = m.filter(ImageFilter.MaxFilter(5))
    e = ImageChops.multiply(dark, near)
    return [mo.start() for mo in re.finditer(b"[^\x00]", e.tobytes())]


def _seg_dist2(p, c):
    """squared distance from p to the blend line c -> #FF00FF (how well p is 'c mixed with the key')"""
    d = (KEY[0] - c[0], KEY[1] - c[1], KEY[2] - c[2])
    v = (p[0] - c[0], p[1] - c[1], p[2] - c[2])
    dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]
    t = 0.0 if dd == 0 else max(0.0, min(1.0, (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / dd))
    return (v[0] - t * d[0]) ** 2 + (v[1] - t * d[1]) ** 2 + (v[2] - t * d[2]) ** 2


def clean(px, bg, W, H, allowed, cell=None, max_iter=4, guard=0.5, kinds=None):
    """Clean one image in place.
    px: bytearray RGB (W*H*3); bg: bytearray W*H (1 = background, changed in place); allowed: Allowed.
    cell: (cw, ch) grid for the loss guard and the per-cell report (None = the whole image is one cell).
    Categories: key (near-#FF00FF / light panel tint, flooded), shade (saturated darker magenta, flooded),
    frame, fringe (despilled to a body / outline colour), speck (lone light pink pixel -> background).
    Returns (stats, changed indices); `kinds` (a dict) receives index -> category. Loss guard: a cell whose shade + speck removals exceed `guard` of its drawn
    pixels (key / panel / frame pixels not counted as drawing) is restored and listed in stats['reverted']."""
    orig_px, orig_bg = bytes(px), bytes(bg)
    N = W * H
    kind = {}

    def col(i):
        o = 3 * i
        return (px[o], px[o + 1], px[o + 2])

    def touches_bg(i):
        x = i % W
        return (x > 0 and bg[i - 1]) or (x < W - 1 and bg[i + 1]) or (i >= W and bg[i - W]) or (i + W < N and bg[i + W])

    def nbrs4(i):
        x = i % W
        if x > 0:
            yield i - 1
        if x < W - 1:
            yield i + 1
        if i >= W:
            yield i - W
        if i + W < N:
            yield i + W

    tinted_all = tinted_indices(Image.frombytes("RGB", (W, H), bytes(px)), mask_of(bg, W, H))
    outline = None
    has_panel = False
    for _ in range(max_iter):
        changed = 0
        cand = {i for i in tinted_all if not bg[i] and is_tinted(col(i)) and not allowed(col(i))}
        # panel colours: light magenta covering >= 0.2 % of the image
        lc = Counter()
        for i in cand:
            p = col(i)
            if is_light_tint(p):
                lc[(p[0] >> 3, p[1] >> 3, p[2] >> 3)] += 1
        panels = [(r * 8 + 4, g * 8 + 4, b * 8 + 4) for (r, g, b), k in lc.items() if k >= max(300, 0.002 * N)]
        flood = {}
        for i in cand:
            p = col(i)
            if panels and is_light_tint(p) and any(max(abs(p[0] - c[0]), abs(p[1] - c[1]), abs(p[2] - c[2])) <= 24
                                                  for c in panels):
                flood[i] = "panel"
            elif kdist2(p) < 100 * 100:
                flood[i] = "key"
            elif is_shade(p):
                flood[i] = "shade"
            elif is_light_tint(p):
                flood[i] = "soft"                   # light tint: keyed only next to a removed panel
        tagged = {i for i, f in flood.items() if f == "panel"}
        drop_soft_panels(flood, W, H, col)
        if any(f == "panel" for f in flood.values()) or has_panel:
            has_panel = True                        # real panels on this sheet: holes of the panel colour go too
            for i in tagged:
                flood[i] = "panel"

        def near_panel(i):
            return any(kind.get(j) == "panel" for j in nbrs4(i))

        q = deque(i for i, f in flood.items()
                  if (f != "soft" and (kdist2(col(i)) < 60 * 60 or touches_bg(i))) or (f == "soft" and near_panel(i))
                  or (has_panel and i in tagged))
        while q:
            i = q.popleft()
            if bg[i]:
                continue
            bg[i] = 1
            kind[i] = "panel" if flood[i] == "soft" else flood[i]
            changed += 1
            for j in nbrs4(i):
                if j in flood and not bg[j] and (flood[j] != "soft" or kind[i] == "panel"):
                    q.append(j)
        cand = {i for i in cand if not bg[i]}
        cand -= thick_regions(cand, W, H)           # >= 7 px thick tinted areas are the species' own colours
        # fringe: tinted pixels in the 2 px ring next to the background -> the colour they are a key blend of
        l1 = {i for i in cand if touches_bg(i)}
        l2 = {i for i in cand if i not in l1 and any(not bg[j] and touches_bg(j) for j in nbrs4(i))}
        ring = l1 | l2
        if ring and outline is None:
            outline = outline_colour(Image.frombytes("RGB", (W, H), bytes(px)), mask_of(bg, W, H))
        repl = {}
        for i in ring:
            p = col(i)
            x, y = i % W, i // W
            best, bd = None, None
            for yy in range(max(0, y - 2), min(H, y + 3)):
                for xx in range(max(0, x - 2), min(W, x + 3)):
                    j = yy * W + xx
                    if bg[j] or j in cand:
                        continue
                    c = col(j)
                    d = _seg_dist2(p, c) + 40 * (abs(xx - x) + abs(yy - y))
                    if bd is None or d < bd:
                        best, bd = c, d
            if best is None and i in l2 and luma(p) >= 90:
                continue                                # deeper pixel of a big light tinted area: next round
            if best is None and i in l1 and luma(p) >= 90:
                repl[i] = None                          # lone light pink speck: background
                continue
            od = _seg_dist2(p, outline) + 200
            if best is None or od < bd:
                best = outline
            repl[i] = best
        for i, c in repl.items():
            if c is not None and c == col(i):
                continue                            # already the colour it would get (next to a thick tinted part)
            if c is None:
                bg[i] = 1
                kind[i] = "speck"
            else:
                o = 3 * i
                px[o], px[o + 1], px[o + 2] = c
                kind[i] = "fringe"
            changed += 1
        cand = {i for i in cand if not bg[i] and is_tinted(col(i))}
        # frames: thin straight lines / rectangle outlines (panel / grid borders): tinted pixels, or dark pixels on the
        # background, in a component that is a line or a rectangle outline with background on both sides
        def thin(i):
            x = i % W
            hz = any(x - k >= 0 and bg[i - k] for k in (1, 2, 3)) and any(x + k < W and bg[i + k] for k in (1, 2, 3))
            vt = any(i - k * W >= 0 and bg[i - k * W] for k in (1, 2, 3)) and \
                any(i + k * W < N and bg[i + k * W] for k in (1, 2, 3))
            return hz or vt

        fc = set(cand)
        fc |= {i for i in dark_edge(px, bg, W, H) if not bg[i]}
        seen = set()
        for s in fc:
            if s in seen:
                continue
            comp, st = [], [s]
            seen.add(s)
            while st:
                i = st.pop()
                comp.append(i)
                x = i % W
                for dx in (-1, 0, 1):
                    if (dx < 0 and x == 0) or (dx > 0 and x == W - 1):
                        continue
                    for dy in (-W, 0, W):
                        j = i + dx + dy
                        if j != i and 0 <= j < N and j in fc and j not in seen:
                            seen.add(j)
                            st.append(j)
            if len(comp) < 40:
                continue
            xs = [i % W for i in comp]
            ys = [i // W for i in comp]
            x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
            bw, bh = x1 - x0 + 1, y1 - y0 + 1
            near_edge = sum(1 for x, y in zip(xs, ys) if x - x0 < 4 or x1 - x < 4 or y - y0 < 4 or y1 - y < 4)
            line = min(bw, bh) <= 5 and max(bw, bh) >= 40
            rect = max(bw, bh) >= 60 and min(bw, bh) >= 20 and near_edge >= 0.85 * len(comp) and len(comp) < 0.25 * bw * bh
            if (line or rect) and sum(1 for i in comp if thin(i)) >= 0.8 * len(comp):
                for i in comp:
                    bg[i] = 1
                    kind[i] = "frame"
                changed += len(comp)
        if not changed:
            break
    # loss guard + per-cell report
    cw, ch = cell or (W, H)

    def cell_of(i):
        return ((i % W) // cw, (i // W) // ch)

    lost = Counter(cell_of(i) for i, k in kind.items() if k in ("shade", "speck"))
    reverted = []
    if guard and lost:
        om = Image.frombytes("L", (W, H), orig_bg)
        drawn = Counter()
        for (cx, cy) in lost:
            drawn[(cx, cy)] = om.crop((cx * cw, cy * ch, min(W, (cx + 1) * cw), min(H, (cy + 1) * ch))).histogram()[0]
        for i, k in kind.items():
            if k in ("key", "panel", "frame") and cell_of(i) in drawn:
                drawn[cell_of(i)] -= 1
        reverted = sorted(c for c, n in lost.items() if drawn[c] >= 200 and n > guard * drawn[c])
        for (cx, cy) in reverted:
            for y in range(cy * ch, min(H, (cy + 1) * ch)):
                a, b = y * W + cx * cw, y * W + min(W, (cx + 1) * cw)
                bg[a:b] = orig_bg[a:b]
                px[3 * a:3 * b] = orig_px[3 * a:3 * b]
                for i in range(a, b):
                    kind.pop(i, None)
    stats = {"key": 0, "shade": 0, "frame": 0, "fringe": 0, "speck": 0}
    cells = Counter()
    for i, k in kind.items():
        stats["key" if k == "panel" else k] += 1
        cells[cell_of(i)] += 1
    stats["reverted"] = reverted
    stats["cells"] = dict(cells)
    if kinds is not None:
        kinds.update(kind)
    return stats, set(kind)


# ---------------------------------------------------------------- final sheets (RGB on exact #FF00FF)

def sheet_cell(W, H):
    for c in (192, 128):
        if W % c == 0 and H % c == 0:
            return (c, c)
    return None


def load_sheet(path):
    im = Image.open(path)
    im.load()
    return (im,) + split_sheet(im)


def split_sheet(im):
    """RGB bytes + background mask (exact #FF00FF) of a sheet image"""
    rgb = im.convert("RGB")
    W, H = rgb.size
    px = bytearray(rgb.tobytes())
    r, g, b = rgb.split()
    m = ImageChops.multiply(ImageChops.multiply(r.point(lambda v: 255 if v == 255 else 0),
                                                b.point(lambda v: 255 if v == 255 else 0)),
                            g.point(lambda v: 255 if v == 0 else 0))
    bg = bytearray(m.tobytes().translate(_TO1))
    return px, bg, W, H


def clean_image(im, allowed, guard=0.5):
    """clean one final sheet image in memory: (cleaned RGB image, stats, changed indices)"""
    px, bg, W, H = split_sheet(im)
    stats, changed = clean(px, bg, W, H, allowed, cell=sheet_cell(W, H), guard=guard)
    out = Image.composite(Image.new("RGB", (W, H), KEY), Image.frombytes("RGB", (W, H), bytes(px)), mask_of(bg, W, H))
    return out, stats, changed


def clean_sheet(path, allowed=None, guard=0.5):
    """clean one final sheet file in memory: (cleaned RGB image, stats, changed indices, original image)"""
    im = Image.open(path)
    im.load()
    allowed = allowed or Allowed(allowed_for_sheet(path))
    out, stats, changed = clean_image(im, allowed, guard)
    return out, stats, changed, im


def save_like(out, src_im, path):
    """save `out` as PNG keeping the text chunks of the source (assemble_loops.py stores the loop layout there)"""
    from PIL.PngImagePlugin import PngInfo
    info = PngInfo()
    for k, v in (getattr(src_im, "text", None) or {}).items():
        info.add_text(k, v)
    tmp = path + ".part.png"
    out.save(tmp, "PNG", pnginfo=info)
    os.replace(tmp, path)


# ---------------------------------------------------------------- previews

PREVIEW_BG = (112, 120, 136)


def grey_view(im):
    """the sheet with its exact #FF00FF background shown neutral grey (magenta left stands out)"""
    im = im.convert("RGB")
    r, g, b = im.split()
    m = ImageChops.multiply(ImageChops.multiply(r.point(lambda v: 255 if v == 255 else 0),
                                                b.point(lambda v: 255 if v == 255 else 0)),
                            g.point(lambda v: 255 if v == 0 else 0))
    return Image.composite(Image.new("RGB", im.size, PREVIEW_BG), im, m)


def worst_cell(stats, W, H):
    """box of the cell with the most changed pixels"""
    cw, ch = sheet_cell(W, H) or (W, H)
    cells = stats.get("cells") or {}
    if not cells:
        return (0, 0, min(W, cw), min(H, ch))
    cx, cy = max(cells, key=lambda c: cells[c])
    return (cx * cw, cy * ch, min(W, (cx + 1) * cw), min(H, (cy + 1) * ch))


def all_sheets():
    """every final sheet: assets/pokemon/Gen*/<NNN>-<Name>/<slug>-{movement,battle,posses}.png"""
    out = []
    for kind in ("movement", "battle", "posses"):
        out += glob.glob(os.path.join(REPO, "assets", "units", "Gen*", "*", f"*-{kind}.png"))
    return sorted(out)


def busy_slugs():
    """species with an image request queued / running (tmp/agy-requests/queue.json): do not touch their sheets"""
    import json
    p = os.path.join(REPO, "tmp", "agy-requests", "queue.json")
    try:
        q = json.load(open(p, encoding="utf-8"))
    except (OSError, ValueError):
        return set()
    out = set()
    for e in q if isinstance(q, list) else []:
        k = e.get("key", "") if isinstance(e, dict) else str(e)
        m = re.match(r"(.+?)-(movement|battle|posses)\b", k)
        if m:
            out.add(m.group(1))
    return out
