#!/usr/bin/env python3
"""
Normalize one agy Poké Ball draft (8 x 6 slots on #FF00FF, see ballkit.py) into the Mons sheet:
  assets/items/PokeBalls/<Folder>/<id>-ball.png   8 x 6 cells of 32 px native, x2 NEAREST (512x384), transparent
  assets/items/PokeBalls/<Folder>/<id>-ball.json  layout, frame counts, timings, notes
Mechanical only (the drawing is accepted as drawn, user rule 2026-11-19): background key, grid-line removal, every
piece to the slot holding most of it, ONE shared scale from the ball size (the ball = BALL_PX native px), ball
centred in its cell (shake row: on a common baseline), the cell grows so nothing is cut, a 15-colour palette taken
from the drawing itself (after keying) and a colour-majority downscale (no colour mixing: area-averaging a 5x larger
anti-aliased draft made muddy grey / dark smudges), the dark outline kept on the silhouette, then the Gen 3 pass
(BGR555, alpha 0/255) and x2.

  python3 normalize_ball.py --ball poke --input /tmp/mons-refs/poke-ball-raw.png
"""
import argparse
import json
import math
import os
import sys
from collections import deque

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ballkit as K  # noqa: E402
from PIL import Image  # noqa: E402
import gen3  # noqa: E402


KEY = "magenta"           # or "green" (purple / pink balls, ballkit.GREEN_BG): tests below run on tr(p)


def tr(p):
    """a green-keyed pixel seen as if the key were magenta: (r, g, b) -> (g, (r + b) / 2, g)"""
    return p if KEY == "magenta" else (p[1], (p[0] + p[2]) // 2, p[1])


BG = [(255, 0, 255)]      # the draft's own background colour is added by main() (agy drifts: (202, 63, 182) seen)


def background_shades(im, share=0.02):
    """key-hued colours covering >= share of the draft (a checkerboard of two magenta shades, one per cell)"""
    small = im.resize((im.width // 4, im.height // 4), Image.NEAREST)
    bins = {}
    raw = small.tobytes()
    for p in (raw[j:j + 3] for j in range(0, len(raw), 3)):
        t = tr(p)
        if t[1] < 0.65 * min(t[0], t[2]) and abs(t[0] - t[2]) < 0.15 * max(t[0], t[2]) + 6 and max(t[0], t[2]) > 90:
            k = (p[0] // 16, p[1] // 16, p[2] // 16)
            bins[k] = bins.get(k, 0) + 1
    n = small.width * small.height
    return [tuple(v * 16 + 8 for v in k) for k, c in bins.items() if c >= share * n]


def uniform_border(im, c, tol=30, share=0.6):
    """True when most border pixels are the colour c (a flat background agy used instead of the key colour)"""
    W, H = im.size
    px = im.load()
    pts = [px[x, y] for x in range(0, W, 3) for y in (0, H - 1)] + [px[x, y] for y in range(0, H, 3) for x in (0, W - 1)]
    near = sum(1 for p in pts if sum((p[i] - c[i]) ** 2 for i in range(3)) ** 0.5 < tol)
    return near >= share * len(pts)


def border_colour(im):
    """median colour of the draft's border pixels (its background)"""
    im = im.convert("RGB")
    W, H = im.size
    px = im.load()
    pts = [px[x, y] for x in range(0, W, 3) for y in (0, 1, H - 2, H - 1)] + \
          [px[x, y] for y in range(0, H, 3) for x in (0, 1, W - 2, W - 1)]
    return tuple(sorted(c[i] for c in pts)[len(pts) // 2] for i in range(3))


def bgdist(p):
    return min(((p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2) ** 0.5 for c in BG)


def key(im, protect=()):
    """magenta background -> transparent: every magenta-hued pixel (also dark magenta grid lines, purple shadows and
    tinted slot squares agy sometimes adds) connected to the background, seeded from the border and from every
    near-pure #FF00FF pixel; pinks / purples inside the ball's dark outline survive"""
    im = im.convert("RGBA")
    W, H = im.size
    px = im.load()

    def mag(p):
        r, g, b = tr(p)[:3]
        if mdist(p) < 110 or bgdist(p) < 50:    # agy's background is rarely exactly #FF00FF
            return True
        return g < 0.2 * min(r, b) and 20 < max(r, b) and abs(r - b) < 0.25 * max(r, b) + 6   # dark magenta lines / tints

    seen = bytearray(W * H)
    q = deque()
    for x in range(W):
        for y in (0, H - 1):
            q.append((x, y))
    for y in range(H):
        for x in (0, W - 1):
            q.append((x, y))
        for x in range(W):
            r, g, b, _ = px[x, y]
            if mdist((r, g, b)) < 40 or bgdist((r, g, b)) < 25:
                q.append((x, y))
    while q:
        x, y = q.popleft()
        i = y * W + x
        if seen[i]:
            continue
        seen[i] = 1
        p = px[x, y]
        if p[3] and (not mag(p) or (mdist(p) >= 40 and is_allowed(p, protect, 28))):   # ball colours are never keyed
            continue
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx]:
                q.append((nx, ny))
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a and mdist((r, g, b)) < 45:
                px[x, y] = (0, 0, 0, 0)
    return im


def greyed(p):
    r, g, b = tr(p)[:3]
    return abs(r - b) < 0.1 * max(r, b) + 6 and g < 0.5 * min(r, b) and min(r, b) - g > 30


def drop_panels(im, slot_area):
    """greyed-magenta slot panels agy sometimes paints behind a frame: a connected greyed region as big as a slot
    (bbox >= 40 % of a slot, filling >= 40 % of its bbox) -> transparent. A dark ball (Master Ball caught frame) is
    far smaller than a slot, so it stays"""
    W, H = im.size
    px = im.load()
    seen = bytearray(W * H)
    n = 0
    for y0 in range(H):
        for x0 in range(W):
            if seen[y0 * W + x0]:
                continue
            p = px[x0, y0]
            if not p[3] or not greyed(p):
                continue
            todo, comp = [(x0, y0)], []
            seen[y0 * W + x0] = 1
            while todo:
                x, y = todo.pop()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx]:
                        q = px[nx, ny]
                        if q[3] and greyed(q):
                            seen[ny * W + nx] = 1
                            todo.append((nx, ny))
            xs, ys = [c[0] for c in comp], [c[1] for c in comp]
            area = (max(xs) - min(xs) + 1) * (max(ys) - min(ys) + 1)
            if area >= 0.4 * slot_area and len(comp) >= 0.4 * area:
                for c in comp:
                    px[c] = (0, 0, 0, 0)
                n += 1
    return n


def flatten_cells(im, keyc, thresh=36):
    """agy sometimes paints every slot its own background (pink, grey, dark checkerboard). Per grid slot: the most
    common border colour is that slot's background; flood it from the slot border (only through pixels within
    `thresh` of it, so the ball outline stops the fill) and paint it the key colour. Runs only when the slots'
    border colours differ (a flat #FF00FF draft is left alone)"""
    from PIL import ImageDraw
    from collections import Counter
    R = len(K.ROWS)
    W, H = im.size
    sw, sh = W / K.COLS, H / R
    out = im.copy()
    px = out.load()
    modes = {}
    for r in range(R):
        for c in range(K.COLS):
            x0, y0, x1, y1 = int(c * sw) + 2, int(r * sh) + 2, int((c + 1) * sw) - 3, int((r + 1) * sh) - 3
            ring = [px[x, y][:3] for x in range(x0, x1, 3) for y in (y0, y1)] + \
                   [px[x, y][:3] for y in range(y0, y1, 3) for x in (x0, x1)]
            q = Counter((v[0] // 8, v[1] // 8, v[2] // 8) for v in ring).most_common(1)[0]
            if q[1] >= 0.3 * len(ring):
                modes[(r, c)] = (tuple(v * 8 + 4 for v in q[0]), (x0, y0, x1, y1))
    if len({m[0] for m in modes.values()}) <= 1:
        return out, 0
    n = 0
    for (r, c), (mc, (x0, y0, x1, y1)) in modes.items():
        if sum(abs(a - b) for a, b in zip(mc, keyc)) < 30:
            continue                                  # already the key colour
        seeds = [(x, y) for x in range(x0, x1, 6) for y in (y0, y1)] + [(x, y) for y in range(y0, y1, 6) for x in (x0, x1)]
        cell = out.crop((x0 - 2, y0 - 2, x1 + 3, y1 + 3))
        for x, y in seeds:
            v = cell.getpixel((x - x0 + 2, y - y0 + 2))
            if v[:3] != tuple(keyc) and max(abs(a - b) for a, b in zip(v[:3], mc)) <= thresh:
                ImageDraw.floodfill(cell, (x - x0 + 2, y - y0 + 2), tuple(keyc) + (255,), thresh=thresh)
        out.paste(cell, (x0 - 2, y0 - 2))
        n += 1
    return out, n


def square_burst(part):
    """a flash / burst whose rays reach the four corners of its bbox: agy drew it past its slot and the slot edge
    cut it square (a round burst has empty corners)"""
    a = part.getchannel("A").load()
    W, H = part.size
    if W < 8 or H < 8:
        return False
    k = max(2, min(W, H) // 10)
    full = lambda x0, y0: sum(1 for x in range(x0, x0 + k) for y in range(y0, y0 + k) if a[x, y]) >= 0.5 * k * k  # noqa: E731
    return sum((full(0, 0), full(W - k, 0), full(0, H - k), full(W - k, H - k))) >= 3


def round_burst(part):
    """clear everything outside the ellipse inscribed in the bbox: the square cut becomes a round burst edge"""
    W, H = part.size
    out = part.copy()
    px = out.load()
    cx, cy, rx, ry = (W - 1) / 2, (H - 1) / 2, W / 2, H / 2
    for y in range(H):
        for x in range(W):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1:
                px[x, y] = (0, 0, 0, 0)
    return out


def drop_lines(cell):
    """leftover grid / border lines: straight runs >= 40 % of the slot, empty 3 px beside them"""
    W, H = cell.size
    px = cell.load()
    on = lambda x, y: 0 <= x < W and 0 <= y < H and px[x, y][3] > 0  # noqa: E731
    for vertical in (True, False):
        L, N = (H, W) if vertical else (W, H)
        get = (lambda i, j: on(i, j)) if vertical else (lambda i, j: on(j, i))
        for i in range(N):
            j = 0
            while j < L:
                if not get(i, j):
                    j += 1
                    continue
                k = j
                while k < L and get(i, k):
                    k += 1
                if k - j >= 0.4 * L and sum(1 for t in range(j, k) if get(i - 3, t) or get(i + 3, t)) <= 0.1 * (k - j):
                    for d in (-2, -1, 0, 1, 2):
                        for t in range(j, k):
                            x, y = (i + d, t) if vertical else (t, i + d)
                            if 0 <= x < W and 0 <= y < H:
                                px[x, y] = (0, 0, 0, 0)
                j = k
    return cell


def pieces(im):
    """8-connected opaque pieces: [(pixels, bbox)]"""
    W, H = im.size
    a = im.getchannel("A").load()
    seen, out = bytearray(W * H), []
    for y in range(H):
        for x in range(W):
            if not a[x, y] or seen[y * W + x]:
                continue
            seen[y * W + x] = 1
            todo, pix = [(x, y)], []
            while todo:
                cx, cy = todo.pop()
                pix.append((cx, cy))
                for nx in (cx - 1, cx, cx + 1):
                    for ny in (cy - 1, cy, cy + 1):
                        if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx] and a[nx, ny]:
                            seen[ny * W + nx] = 1
                            todo.append((nx, ny))
            xs, ys = [p[0] for p in pix], [p[1] for p in pix]
            out.append((pix, (min(xs), min(ys), max(xs) + 1, max(ys) + 1)))
    return out


def mdist(p):
    """distance of a colour to the key colour (#FF00FF, or #00FF00 in green mode)"""
    p = tr(p)
    return ((255 - p[0]) ** 2 + p[1] ** 2 + (255 - p[2]) ** 2) ** 0.5


def near_magenta(p):
    """background magenta left in the drawing (a ball's own purples / pinks are further away)"""
    return mdist(p) < 70


def defringe(im, allowed=(), passes=2):
    """edge pixels next to the keyed background whose colour is still bright magenta-tinted (and not one of the
    ball's own colours) -> transparent"""
    W, H = im.size
    px = im.load()
    for _ in range(passes):
        kill = []
        for y in range(H):
            for x in range(W):
                p = px[x, y]
                if not p[3]:
                    continue
                r, g, b = p[0], p[1], p[2]
                if (mdist(p) >= 110 and bgdist(p) >= 70) or is_allowed(p, allowed):
                    continue
                if any(0 <= nx < W and 0 <= ny < H and not px[nx, ny][3]
                       for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))):
                    kill.append((x, y))
        for q in kill:
            px[q] = (0, 0, 0, 0)
        if not kill:
            break


def ball_colours(bid):
    """every colour of the ball's 3D reference item art (protected from keying: purple / pink balls)"""
    p = os.path.join(K.REFS, f"{bid}-icon.png")
    if not os.path.isfile(p):
        return []
    return [c for _, c in Image.open(p).convert("RGB").getcolors(1 << 16) if mdist(c) >= 40]


def allowed_magenta(bid):
    """near-magenta colours the ball itself has (Master / Dream / Love … pinks): from its reference icon"""
    p = os.path.join(K.REFS, f"{bid}-icon.png")
    if not os.path.isfile(p):
        return []
    cols = {c for _, c in Image.open(p).convert("RGB").getcolors(1 << 16) if c != (255, 0, 255)}
    return [c for c in cols if near_magenta(c)]


def is_allowed(p, allowed, tol=48):
    return any(abs(p[0] - c[0]) + abs(p[1] - c[1]) + abs(p[2] - c[2]) <= tol for c in allowed)


def drop_magenta(im, allowed):
    """opaque near-magenta pixels that are not one of the ball's own colours -> transparent; returns the count"""
    px = im.load()
    n = 0
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if p[3] and near_magenta(p) and not is_allowed(p, allowed):
                px[x, y] = (0, 0, 0, 0)
                n += 1
    return n


EFFECT_FRAMES = {("open", 2), ("open", 3), ("success", 1), ("success", 2), ("success", 3), ("break", 2), ("break", 3)}


def _pixels(layers, keys):
    px = []
    for i in keys:
        L = layers.get(i)
        bb = L.getbbox() if L else None
        if not bb:
            continue
        raw = L.crop(bb).tobytes()
        px += [raw[j:j + 3] for j in range(0, len(raw), 8) if raw[j + 3] > 127]     # every 2nd pixel
    return px


def _cut(px, n):
    if not px:
        return []
    q = Image.frombytes("RGB", (len(px), 1), b"".join(px)).quantize(colors=n, method=Image.Quantize.MEDIANCUT,
                                                                      dither=Image.Dither.NONE)
    pal = q.getpalette()
    return [tuple(pal[3 * i:3 * i + 3]) for _, i in sorted(q.getcolors(), reverse=True)]


def sheet_palette(layers, n=15, fx=4):
    """<= n flat colours of the drawing itself, after the background was keyed out (no background colour can get in):
    n - fx colours from the ball frames (median cut) + up to fx effect colours (the raw's own star / flash / spark
    colours: yellow stars, white flash, rays) taken from the effect frames' pixels far from every ball colour, so a
    yellow star is never forced onto a pink ball colour"""
    def frame(i):
        r, c = divmod(i, K.COLS)
        return (K.ROWS[r][0], c)
    body_keys = [i for i in layers if frame(i) not in EFFECT_FRAMES]
    fx_keys = [i for i in layers if frame(i) in EFFECT_FRAMES]
    body = _cut(_pixels(layers, body_keys), n - fx)
    d = lambda u, v: sum((a - b) ** 2 for a, b in zip(u, v)) ** 0.5  # noqa: E731
    far = [p for p in _pixels(layers, fx_keys) if min((d(p, c) for c in body), default=999) > 60]
    effect = _cut(far, fx) if len(far) > 20 else []
    cols = body + effect
    if len(cols) < n:                                   # no distinct effect colours: give the room back to the ball
        cols = _cut(_pixels(layers, list(layers)), n)
    full = cols + [cols[0]] * (256 - len(cols))         # padding repeats a real colour: any index maps to a real one
    pimg = Image.new("P", (1, 1))
    pimg.putpalette([v for c in full for v in c])
    return pimg, full


def mode_resize(part, tw, th, pimg, cols):
    """downscale without mixing colours: each target pixel takes the most common palette colour of its source
    block (opaque when >= half the block is); silhouette-edge pixels keep the dark outline when the block had one"""
    w, h = part.size
    idx = part.convert("RGB").quantize(palette=pimg, dither=Image.Dither.NONE).tobytes()
    al = part.getchannel("A").tobytes()
    lum = [0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2] for c in cols]
    dark = min(range(len(cols)), key=lambda i: lum[i])
    dark = dark if lum[dark] < 70 else -1
    counts = [dict() for _ in range(tw * th)]
    tot = [0] * (tw * th)
    xs = [min(tw - 1, x * tw // w) for x in range(w)]
    for y in range(h):
        ty = min(th - 1, y * th // h) * tw
        row = y * w
        for x in range(w):
            t = ty + xs[x]
            tot[t] += 1
            if al[row + x] > 127:
                d = counts[t]
                i = idx[row + x]
                d[i] = d.get(i, 0) + 1
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    op = out.load()
    for t, d in enumerate(counts):
        n = sum(d.values())
        if n and n * 2 >= tot[t]:
            i = max(d, key=d.get)
            op[t % tw, t // tw] = cols[i] + (255,)
    if dark >= 0:
        for t, d in enumerate(counts):
            x, y = t % tw, t // tw
            if op[x, y][3] and d.get(dark, 0) * 5 >= sum(d.values()) and any(
                    not (0 <= nx < tw and 0 <= ny < th) or not op[nx, ny][3]
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))):
                op[x, y] = cols[dark] + (255,)
    return out


def drop_text(src, ps, notes):
    """text labels agy sometimes writes under the frames (THROW, OPEN, …): small glyph pieces, all dark or all
    white / light grey, sitting in a horizontal line of >= 3 such pieces -> dropped (sparks and stars are coloured
    and scattered, the ball is one big piece)"""
    big = max(len(p[0]) for p in ps)
    dims = sorted(max(bb[2] - bb[0], bb[3] - bb[1]) for pix, bb in ps if len(pix) >= 0.2 * big)
    D = dims[len(dims) // 2]
    px = src.load()

    def dark(pix):
        step = max(1, len(pix) // 60)
        sm = [px[q] for q in pix[::step]]
        lum = sum(0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2] for c in sm) / len(sm)
        sat = sum(max(c[:3]) - min(c[:3]) for c in sm) / len(sm)
        return lum < 80 or sat < 40     # dark ink, or white / grey label text (white fill + black outline)

    glyph = [p for p in ps if max(p[1][2] - p[1][0], p[1][3] - p[1][1]) < 0.4 * D and dark(p[0])]
    drop = set()
    # a whole word joined by its outline into one piece: wide and short (w >= 1.8 h, h < 45 % of the ball), ink-like
    for p in ps:
        w_, h_ = p[1][2] - p[1][0], p[1][3] - p[1][1]
        if w_ >= 1.8 * h_ and h_ < 0.45 * D and dark(p[0]):
            drop.add(id(p))
    for p in glyph:
        cy, h = (p[1][1] + p[1][3]) / 2, p[1][3] - p[1][1]
        line = [q for q in glyph if abs((q[1][1] + q[1][3]) / 2 - cy) < max(4, h * 0.6)
                and abs((q[1][0] + q[1][2]) / 2 - (p[1][0] + p[1][2]) / 2) < 2 * D]
        if len(line) >= 3:
            drop.update(id(q) for q in line)
    if drop:
        notes.append(f"{len(drop)} text-label glyph pieces dropped")
    return [p for p in ps if id(p) not in drop]


def despill_green(im):
    """chroma despill for green-keyed drafts: no kept pixel is greener than its red / blue (g = max(r, b)), so stars,
    sparks, the open lid and the outline lose the green spill (the green-keyed balls have no green of their own)"""
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and g > max(r, b):
                px[x, y] = (r, max(r, b), b, a)


def bands(ps, H, R):
    """the row bands of the draft from the y occupancy of the kept pieces: runs of occupied rows, the closest
    runs merged (stars above a ball) down to R; a band about twice as tall as the others (a burst touching the next
    row) is split at its emptiest line. Returns (bands, ok); fewer than R bands when agy drew fewer rows"""
    occ = [0] * H
    for pix, _ in ps:
        for _, y in pix:
            occ[y] += 1
    runs, s0 = [], None
    for y, o in enumerate(occ + [0]):
        if o and s0 is None:
            s0 = y
        elif not o and s0 is not None:
            if runs and s0 - runs[-1][1] < 4:
                runs[-1][1] = y
            else:
                runs.append([s0, y])
            s0 = None
    while len(runs) > 1:                       # a thin run (a label, a lone spark) joins its closest neighbour
        hs = sorted(r[1] - r[0] for r in runs)
        j = min(range(len(runs)), key=lambda i: runs[i][1] - runs[i][0])
        if runs[j][1] - runs[j][0] >= 0.25 * hs[len(hs) // 2]:
            break
        gl = runs[j][0] - runs[j - 1][1] if j > 0 else 1 << 30
        gr = runs[j + 1][0] - runs[j][1] if j + 1 < len(runs) else 1 << 30
        k = j - 1 if gl <= gr else j + 1
        a, b = sorted((j, k))
        runs[a:b + 1] = [[runs[a][0], runs[b][1]]]
    while len(runs) > R:                       # merge the two closest bands
        j = min(range(len(runs) - 1), key=lambda i: runs[i + 1][0] - runs[i][1])
        runs[j:j + 2] = [[runs[j][0], runs[j + 1][1]]]
    while 0 < len(runs) < R:
        hs = sorted(r[1] - r[0] for r in runs)
        med = hs[len(hs) // 2]
        j = max(range(len(runs)), key=lambda i: runs[i][1] - runs[i][0])
        r0, r1 = runs[j]
        if r1 - r0 < 1.6 * med:
            break
        lo, hi = r0 + (r1 - r0) // 5, r1 - (r1 - r0) // 5
        cut = min(range(lo, hi), key=lambda y: occ[y])
        runs[j:j + 1] = [[r0, cut], [cut, r1]]
    return [tuple(r) for r in runs], len(runs) == R


def group_frames(src, ps, notes):
    """pieces -> frames, robust to a draft whose frames do not sit on the 8-column grid: row bands from the y gaps,
    then in each band the big pieces (ball, lid, burst) make the frames left to right and the small pieces (stars,
    sparks) join the nearest frame; small pieces far from any ball make their own frame (sparks only)"""
    R = len(K.ROWS)
    bl, ok = bands(ps, src.height, R)
    if not ok:
        notes.append(f"agy drew {len(bl)} rows for {R}: rows taken in order")
    rows = [[] for _ in range(R)]
    for p in ps:
        cy = (p[1][1] + p[1][3]) / 2
        r = min(range(len(bl)), key=lambda i: 0 if bl[i][0] <= cy < bl[i][1] else min(abs(cy - bl[i][0]), abs(cy - bl[i][1])))
        rows[r].append(p)
    dims = sorted(max(bb[2] - bb[0], bb[3] - bb[1]) for row in rows if row for pix, bb in [max(row, key=lambda q: len(q[0]))]) or [1]
    D = dims[len(dims) // 2]
    out, extra_last = {}, None
    for r, row in enumerate(rows):
        name, cnt, _ = K.ROWS[r]
        big = sorted([p for p in row if max(p[1][2] - p[1][0], p[1][3] - p[1][1]) >= 0.45 * D], key=lambda p: (p[1][0] + p[1][2]) / 2)
        small = [p for p in row if p not in big]
        frames = []                              # [x0, x1, pieces]
        for p in big:
            cx = (p[1][0] + p[1][2]) / 2
            if frames and cx - (frames[-1][0] + frames[-1][1]) / 2 < 0.8 * D:
                f = frames[-1]
                f[0], f[1] = min(f[0], p[1][0]), max(f[1], p[1][2]); f[2].append(p)
            else:
                frames.append([p[1][0], p[1][2], [p]])
        orphans = []
        centres = []                             # centre of each frame's biggest piece (the ball)
        for f in frames:
            bb = max(f[2], key=lambda q: len(q[0]))[1]
            centres.append(((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2))
        for p in small:
            cx, cy = (p[1][0] + p[1][2]) / 2, (p[1][1] + p[1][3]) / 2
            dist = [((cx - x) ** 2 + (cy - y) ** 2) ** 0.5 for x, y in centres]
            j = min(range(len(frames)), key=lambda i: dist[i]) if frames else None
            if j is not None and dist[j] <= 1.6 * D:
                frames[j][2].append(p)
            else:
                orphans.append(p)
        orphans.sort(key=lambda p: (p[1][0] + p[1][2]) / 2)
        for p in orphans:                        # single-linkage clusters of the leftover sparks
            cx = (p[1][0] + p[1][2]) / 2
            hit = [f for f in frames if f[2][0] in orphans and f[0] - 1.2 * D <= cx <= f[1] + 1.2 * D]
            if hit:
                f = hit[0]; f[0], f[1] = min(f[0], p[1][0]), max(f[1], p[1][2]); f[2].append(p)
            else:
                frames.append([p[1][0], p[1][2], [p]])
        last_ball = max((f[1] for f in frames if f[2][0] not in orphans), default=-1)

        def keep(f):            # a sparks-only frame: big enough, or a smaller one after the last ball (break f4)
            if f[2][0] not in orphans:
                return True
            n = sum(len(q[0]) for q in f[2])
            return n >= 0.08 * D * D or (n >= 0.03 * D * D and f[0] > last_ball)
        frames = [f for f in frames if keep(f)]
        frames.sort(key=lambda f: (f[0] + f[1]) / 2)
        if len(frames) > cnt:
            notes.append(f"{name}: {len(frames)} drawings for {cnt} frames, extra {len(frames) - cnt} dropped")
            extra_last = frames[-1][2]
        for c, f in enumerate(frames[:cnt]):
            out[r * K.COLS + c] = f[2]
    icon = K.ROW_INDEX["icon"] * K.COLS
    spx_ = src.load()

    def whole_ball(plist):                      # one round piece about the ball's size (not a spark / open lid)
        big_ = max(plist, key=lambda q: len(q[0]))
        w_, h_ = big_[1][2] - big_[1][0], big_[1][3] - big_[1][1]
        sm = [spx_[q] for q in big_[0][::max(1, len(big_[0]) // 80)]]
        lum = sum(0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2] for c in sm) / len(sm)
        return len(big_[0]) >= 0.45 * D * D and 0.8 <= w_ / max(1, h_) <= 1.25 and lum < 200   # not a white flash
    if icon not in out and extra_last and whole_ball(extra_last):   # no icon row: agy put it at the end of a row
        out[icon] = extra_last
        notes.append("icon taken from the last extra drawing of a row")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ball", required=True)
    ap.add_argument("--input", required=True)
    ap.add_argument("--bg", choices=("magenta", "green"), default=None, help="draft background (default: ballkit.bg_of)")
    ap.add_argument("--force", action="store_true", help="overwrite even when the same raw would lose frames")
    a = ap.parse_args()
    global KEY
    KEY = a.bg or K.bg_of(a.ball)
    BG[:] = [(255, 0, 255)] if KEY == "magenta" else [(0, 255, 0)]
    if a.ball not in K.BY_ID:
        sys.exit(f"unknown ball {a.ball}")
    draft = Image.open(a.input).convert("RGB")
    bgc = border_colour(draft)
    if (uniform_border(draft, bgc) and bgc not in BG       # the draft's own background (drifted magenta, even grey)
            and 0.3 * bgc[0] + 0.59 * bgc[1] + 0.11 * bgc[2] > 60):   # never a dark one: dark balls must survive
        BG.append(bgc)
    for c in background_shades(draft):              # checkerboards: agy paints cells in two magenta shades
        if c not in BG:
            BG.append(c)
    protect = ball_colours(a.ball)
    flat, nflat = flatten_cells(Image.open(a.input).convert("RGBA"), BG[0])
    src = key(flat, protect)
    R = len(K.ROWS)
    sw, sh = src.width / K.COLS, src.height / R
    rects = [(int(c * sw), int(r * sh), int((c + 1) * sw), int((r + 1) * sh)) for r in range(R) for c in range(K.COLS)]
    for rc in rects:
        src.paste(drop_lines(src.crop(rc)), rc[:2])
    src = key(src, protect)                          # again: tinted squares that agy fenced in with grid lines
    panels = drop_panels(src, sw * sh)
    defringe(src, allowed_magenta(a.ball))
    if KEY == "green":
        despill_green(src)
    edge, notes = set(), ([f"{panels} greyed slot panel(s) removed"] if panels else [])
    if nflat:
        notes.append(f"{nflat} slot background(s) of other colours flattened to the key colour")
    min_piece = max(4, int(sw * sh * 0.0006))      # specks (grid-line crossings, dust) are dropped
    ps = [(pix, bb) for pix, bb in pieces(src) if len(pix) >= min_piece]
    if not ps:
        sys.exit("empty image (is the background pure magenta #FF00FF?)")
    ps = drop_text(src, ps, notes)
    groups = group_frames(src, ps, notes)          # slot index -> [pieces]
    layers, biggest, used = {}, {}, set()
    spx = src.load()
    for i, plist in groups.items():
        L = Image.new("RGBA", src.size, (0, 0, 0, 0))
        lp = L.load()
        for pix, bb in plist:
            for q in pix:
                lp[q] = spx[q]
            if (bb[0] == 0 or bb[1] == 0 or bb[2] == src.width or bb[3] == src.height) and len(pix) >= 12:
                edge.add(i)
            if i not in biggest or len(pix) > biggest[i][0]:
                biggest[i] = (len(pix), bb)
        layers[i] = L
        used.add(i)
    # the icon is the closed ball at rest: when agy left the icon row empty, use its own first shake frame
    # (or the first throw frame) - a copy of a drawn frame, nothing invented
    icon = K.ROW_INDEX["icon"] * K.COLS
    if icon not in used:
        for src_i in (K.ROW_INDEX["shake"] * K.COLS, K.ROW_INDEX["throw"] * K.COLS):
            if src_i in used:
                layers[icon], biggest[icon] = layers[src_i], biggest[src_i]
                used.add(icon)
                notes.append(f"icon row empty in the draft: copied from {K.ROWS[src_i // K.COLS][0]} f1")
                break
    # shared scale from the ball: median of the largest piece's size over throw / shake / icon frames
    sizes = []
    for r, (name, cnt, _) in enumerate(K.ROWS):
        if name in ("throw", "shake", "icon"):
            for c in range(cnt):
                b = biggest.get(r * K.COLS + c)
                if b:
                    sizes.append(max(b[1][2] - b[1][0], b[1][3] - b[1][1]))
    if not sizes:
        sys.exit("no ball found (is the background pure magenta #FF00FF and the 8 x 6 layout kept?)")
    sizes.sort()
    D = sizes[len(sizes) // 2]
    k = K.BALL_PX / D
    # anchor of every frame (draft px): the ball's centre (shake row: its bottom); no clear ball: the bbox centre
    anchors = {}
    for i in used:
        r, c = divmod(i, K.COLS)
        name = K.ROWS[r][0]
        bb = layers[i].getbbox()
        big = biggest.get(i)
        hist = layers[i].crop(bb).getchannel("A").histogram()
        area = (bb[2] - bb[0]) * (bb[3] - bb[1]) - hist[0]
        if big and big[0] >= 0.3 * area and (name, c) != ("break", 3):
            ax = (big[1][0] + big[1][2]) / 2
            ay = big[1][3] if name == "shake" else (big[1][1] + big[1][3]) / 2
        else:
            ax, ay = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2
        anchors[i] = (ax, ay, bb)
    # never cut (decisions.md §12 applied to balls): every drawing stays whole with >= MARGIN px free in its cell;
    # the cell grows (multiple of 8, up to MAX_CELL) instead of cropping a flash / burst / stars; past that the
    # whole sheet shrinks uniformly
    half = K.BALL_PX / 2
    need = K.CELL
    for i, (ax, ay, bb) in anchors.items():
        name = K.ROWS[i // K.COLS][0]
        w = max(ax - bb[0], bb[2] - ax) * k + K.MARGIN
        if name == "shake":
            v = max((ay - bb[1]) * k - half + K.MARGIN, (bb[3] - ay) * k + half + K.MARGIN)
        else:
            v = max(ay - bb[1], bb[3] - ay) * k + K.MARGIN
        need = max(need, 2 * max(w, v) + 1)
    C = min(K.MAX_CELL, 8 * math.ceil(need / 8))
    s_all = min(1.0, (C - 1) / need) if need > C else 1.0
    if C > K.CELL:
        notes.append(f"cell grown to {C} px so no effect is cut")
    if s_all < 1:
        notes.append(f"sheet shrunk to {s_all:.0%} to fit the {C} px cell")
    kk = k * s_all
    base = C / 2 + half * s_all
    pimg, pcols = sheet_palette(layers)
    native = Image.new("RGBA", (C * K.COLS, C * R), (0, 0, 0, 0))
    for i in sorted(used):
        r, c = divmod(i, K.COLS)
        name = K.ROWS[r][0]
        ax, ay, bb = anchors[i]
        part = layers[i].crop(bb)
        if name in ("open", "break") and c in (2, 3) and square_burst(part):
            part = round_burst(part)              # a burst agy drew past its slot (cut square): round it off
            notes.append(f"{name} f{c + 1}: square-cut burst rounded")
        part = mode_resize(part, max(1, round(part.width * kk)), max(1, round(part.height * kk)), pimg, pcols)
        ty = base if name == "shake" else C / 2
        px_ = round(C / 2 - (ax - bb[0]) * kk)
        py_ = round(ty - (ay - bb[1]) * kk)
        px_ = max(0, min(C - part.width, px_))
        py_ = max(0, min(C - part.height, py_))
        native.alpha_composite(part, (c * C + px_, r * C + py_))
    # Gen 3 pass: binary alpha, BGR555, <= 15 colours (one OBJ palette); then no magenta left outside the ball palette
    g3 = gen3.to_gen3(native, key=(255, 0, 255), alpha_cut=128, max_colours=15)
    left = drop_magenta(g3, allowed_magenta(a.ball))
    if left:
        notes.append(f"{left} magenta-tinted px removed after the colour pass")
    out = g3.resize((g3.width * K.SCALE, g3.height * K.SCALE), Image.NEAREST)
    dst = K.sheet_path(a.ball)
    # guard: re-normalizing the SAME raw must not lose a frame (a keying regression ate whole balls twice)
    st = os.stat(a.input)
    raw_id = [int(st.st_mtime), st.st_size]
    gp = g3.getchannel("A").load()
    areas = []
    for i in range(K.COLS * R):
        r_, c_ = divmod(i, K.COLS)
        n_ = sum(1 for y in range(r_ * C, (r_ + 1) * C) for x in range(c_ * C, (c_ + 1) * C) if gp[x, y])
        areas.append(round(n_ / max(1, K.BALL_PX * s_all) ** 2, 3))
    try:
        prev = json.load(open(os.path.splitext(dst)[0] + ".json", encoding="utf-8"))
    except (OSError, ValueError):
        prev = {}
    if prev.get("raw") == raw_id and prev.get("frame_area") and not a.force:
        lost = [i for i, (o, n_) in enumerate(zip(prev["frame_area"], areas)) if o > 0.2 and n_ < 0.5 * o]
        if lost:
            sys.exit(f"ABORT: same raw, but frame(s) {', '.join(str(i + 1) for i in lost)} lost > 50 % of their "
                     f"pixels compared with the previous build: keying regression? (--force to overwrite)")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    out.save(dst)
    meta = {
        "ball": a.ball, "name": K.BY_ID[a.ball][1], "cell": C, "scale": K.SCALE, "cols": K.COLS,
        "ball_px": round(K.BALL_PX * s_all), "baseline_y": round(base),
        "rows": [{"row": i, "name": nm, "frames": cnt, "timing": t} for i, (nm, cnt, t) in enumerate(K.ROWS)],
        "source": "agy single draw (accepted as drawn), normalized by normalize_ball.py",
        "raw": raw_id, "frame_area": areas,
        "draft_ball_px": D, "key": KEY, "draft_background": list(BG[-1]), "notes": notes + [f"cut in the draft: slot {i + 1} touches the draft edge" for i in sorted(edge)],
        "facts": "data/battle/pokeball-animation.json",
    }
    meta_p = os.path.splitext(dst)[0] + ".json"
    try:                                            # keep the reference entry ball_reference.py wrote
        old = json.load(open(meta_p, encoding="utf-8")).get("reference")
        if old and os.path.isfile(os.path.join(os.path.dirname(dst), old["file"])):
            meta["reference"] = old
    except (OSError, ValueError):
        pass
    if "reference" not in meta and os.path.isfile(os.path.join(os.path.dirname(dst), f"{a.ball}-reference.png")):
        meta["reference"] = {"file": f"{a.ball}-reference.png", "source": "see ball_reference.py"}
    json.dump(meta, open(meta_p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"OK: {os.path.relpath(dst, K.REPO)} ({len(used)}/{K.FRAMES} frames, ball {D}px in the draft -> "
          f"{meta['ball_px']}px, cell {C}px)")
    for m in meta["notes"]:
        print("  note:", m)


if __name__ == "__main__":
    main()
