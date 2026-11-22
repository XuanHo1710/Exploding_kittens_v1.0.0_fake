#!/usr/bin/env python3
"""
Import the user's hand-drawn Player sheets (image-generator output) as Gen 3 overworld sheets.

Sources (committed, decisions.md §9): `assets/characters/Player/players-drawn.json` lists every drawn Player in
picker order (slug, order, Vietnamese name, gender, child, look) and each drawing is kept next to its output as
`assets/characters/Player/<slug>/<slug>-drawn.jpg`: a photo of a 4x4 grid on magenta, rows down / left / right /
up, columns stand, step A, stand, step B. Per sheet:

  1. key the magenta background (flood from the border and from every pure magenta pixel, then peel the pink
     JPEG fringe) and find the 16 cells from the background gaps;
  2. quantise every sprite pixel of the sheet to one shared colour set;
  3. ONE scale per Character from its standing height: adults stand `--height` px (default 26), children
     `--child-height` px (default 22). The flying parts of a pose (hair, scarf, net) never shrink the Character:
     they go into the wider frame (`--frame-w`, default 32: a 32x32 frame, a real GBA sprite shape);
  4. downscale every frame by majority vote (no smoothing; dark colours weigh more; the grid phase that best
     matches the drawing's own pixels wins), then keep the face readable: the eyes are found in the drawing
     (small dark marks inside the skin of the face) and forced to 1 px wide, 1-2 px tall, with skin beside
     and above them where the drawing has skin there (so they never melt into the hair);
  5. place the frames on the Mons contract: frame bottom-centre = tile bottom-centre, feet on native row 30
     standing and 31 stepping, standing frames centred on the body (not on a ponytail), step frames aligned on
     the head; the stand column repeats at 0 and 2; the right row is the left row mirrored;
  6. black silhouette outline (dark edge pixels turn black), then the shared Gen 3 pass: BGR555, alpha 0/255,
     <= 15 colours for the whole sheet.

Writes assets/characters/Player/<slug>/<slug>-overworld.png + .json (x2) and <slug>-run.png + .json (the same
frames, played faster: "run": "walk frames reused"). The JSON carries the picker fields `name`, `gender`, `child`,
`order`, `source: "drawn"`, `look` and the frame size (`frame.native_w` = 32).

`--add-from DIR` copies new drawings from a drop folder (one image per Character + `order.txt`, one line
`<index> <file> <Name>: <look>` each, `(f)` / `(m)` for the gender, `child` in the look) into the asset folders
and merges them into players-drawn.json; the drop folder is left as it is.

Usage (from the repo root):
  python3 tools/characters/import_drawn.py                       # every Player in players-drawn.json
  python3 tools/characters/import_drawn.py player-hoa player-na  # only these slugs
  python3 tools/characters/import_drawn.py --add-from tmp/characters-in   # take in new drawings, then import
  python3 tools/characters/import_drawn.py --report tmp/report/player-characters.png
  python3 tools/characters/import_drawn.py player-hoa --frame-w 16 --scale-by body --out-root tmp/x  # trial
"""
import argparse
import json
import os
import re
import shutil
import sys
import unicodedata
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
PYDEPS = os.path.join(HERE, ".pydeps")
if os.path.isdir(PYDEPS) and PYDEPS not in sys.path:
    sys.path.insert(0, PYDEPS)
sys.path.insert(0, HERE)

from PIL import Image, ImageDraw, ImageFont  # noqa: E402

import charkit as CK  # noqa: E402
from charkit import gen3  # noqa: E402

H = CK.H                          # native frame height (32)
FEET_STAND, FEET_STEP = 30, 31    # native row of the lowest foot pixel (SKILL.md engine contract)
CHARS = os.path.join(REPO, "assets", "characters")
# hand-made source lists, one per group that has drawn Characters: assets/characters/<Group>/<file>
INDEXES = {"Player": "players-drawn.json", "League": "league-drawn.json"}
ROOT = os.path.join(CHARS, "Player")      # the Player picker (report, --add-from)
QUANT = 24                        # working colours before the Gen 3 merge to 15 (keeps distinct hues)
DARK_LUM = 96                     # an edge pixel darker than this turns black (outline)
DARK_WEIGHT = 2.5                 # majority vote weight of near-black source colours (eyes, outlines)
DARK_VOTE_LUM = 60                # 'near-black' for DARK_WEIGHT
SPECKLE_SUPPORT = 0.45            # a pixel whose colour covers less of its block than this may be smoothed
EYE_LUM = 70                      # an eye mark is darker than this
EYE_BLACK = 45                    # ... and its main colour darker than this (a mouth is lighter)
CORE_COVER = 0.25                 # a column belongs to the body when this share of the frame height is filled


def _pixels(im):
    """pixel sequence (Pillow 12+ renamed getdata)."""
    return im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata()


def lum(c):
    return (299 * c[0] + 587 * c[1] + 114 * c[2]) // 1000


def is_skin(c):
    """light warm colours (faces); a yellow cap or an orange coat has too little blue."""
    r, g, b = c[:3]
    return r >= 150 and g >= 95 and r >= g >= b - 10 and r - b >= 25 and b >= 0.4 * r and lum(c) >= 125


# ---------------------------------------------------------------- sources

def ascii_slug(name):
    s = unicodedata.normalize("NFD", name.replace("đ", "d").replace("Đ", "D"))
    s = "".join(ch for ch in s if not unicodedata.combining(ch)).lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def drawing_path(slug, group="Player"):
    return os.path.join(CHARS, group, slug, f"{slug}-drawn.jpg")


def load_index(group="Player"):
    """{"frame_w", "scale_by", "characters": [entry]} of a group (assets/characters/<Group>/<index file>)."""
    path = os.path.join(CHARS, group, INDEXES[group])
    if not os.path.exists(path):
        return {"frame_w": 32, "scale_by": "height", "characters": []}
    return json.load(open(path, encoding="utf-8"))


def save_index(idx, group="Player"):
    idx["characters"].sort(key=lambda p: (p.get("order", 0), p["slug"]))
    with open(os.path.join(CHARS, group, INDEXES[group]), "w", encoding="utf-8") as f:
        json.dump(idx, f, indent=2, ensure_ascii=False)
        f.write("\n")


def read_order(path):
    """[{slug, order, name, gender, child, look, file}] from a drop folder's order.txt (# = comment)."""
    rows = []
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"(\d+)\s+(\S+)\s+(.*)$", line)
        if not m:
            sys.exit(f"order.txt: cannot read line {line!r}")
        idx, fname, rest = int(m.group(1)), m.group(2), m.group(3).strip()
        name = re.split(r"[:(]", rest, maxsplit=1)[0].strip()
        look = rest[len(name):].lstrip(" :").strip()
        if look.startswith("(") and look.endswith(")") and look.count("(") == 1:
            look = look[1:-1]
        low = rest.lower()
        if re.search(r"\(f\)|\bgirl\b|\bfemale\b", low):
            gender = "f"
        elif re.search(r"\(m\)|\bboy\b|\bmale\b", low):
            gender = "m"
        else:
            gender = None
        look = re.sub(r"\s*\((f|m)\)\s*$", "", look)
        rows.append({"slug": "player-" + ascii_slug(name), "order": idx, "name": name, "gender": gender,
                     "child": "child" in low, "look": look, "file": fname})
    return rows


def add_from(folder):
    """Copy the Player drawings of a drop folder into the asset folders and merge their lines into
    players-drawn.json."""
    idx = load_index()
    known = {p["slug"]: p for p in idx["characters"]}
    added = []
    for row in read_order(os.path.join(folder, "order.txt")):
        old = known.get(row["slug"], {})
        gender = row["gender"] or old.get("gender")
        if gender is None:
            sys.exit(f"order.txt: no gender for {row['name']}; add (f) / (m) to its line")
        entry = {"slug": row["slug"], "order": row["order"], "name": row["name"], "gender": gender,
                 "child": row["child"], "look": old.get("look") or row["look"]}
        known[row["slug"]] = entry
        os.makedirs(os.path.join(ROOT, row["slug"]), exist_ok=True)
        src = os.path.join(folder, row["file"])
        dst = drawing_path(row["slug"])
        if src.lower().endswith((".jpg", ".jpeg")):
            shutil.copyfile(src, dst)
        else:
            Image.open(src).convert("RGB").save(dst, quality=95)
        added.append(row["slug"])
    idx["characters"] = list(known.values())
    save_index(idx)
    return added


# ---------------------------------------------------------------- background key + cells

def _loose(p):
    """magenta or a magenta blend (JPEG noise, the pink fringe next to the outline)."""
    r, g, b = p
    m = (r + b) / 2
    return m > 90 and g < 0.35 * m and abs(r - b) < 70


def _strict(p):
    r, g, b = p
    return r > 190 and b > 190 and g < 80 and abs(r - b) < 40


def _tinted(p):
    r, g, b = p
    m = (r + b) / 2
    return m > 70 and g < 0.5 * m and abs(r - b) < 70


def key_background(im):
    """bytearray, 1 = background. Flood over magenta-ish pixels from the border and every pure magenta pixel."""
    w, h = im.size
    data = list(_pixels(im))
    loose = bytearray(1 if _loose(p) else 0 for p in data)
    bg = bytearray(w * h)
    q = deque(i for i, p in enumerate(data) if _strict(p))
    q.extend(range(w))
    q.extend(range((h - 1) * w, h * w))
    q.extend(y * w for y in range(h))
    q.extend(y * w + w - 1 for y in range(h))
    while q:
        i = q.popleft()
        if bg[i] or not loose[i]:
            continue
        bg[i] = 1
        x = i % w
        if x > 0:
            q.append(i - 1)
        if x < w - 1:
            q.append(i + 1)
        if i >= w:
            q.append(i - w)
        if i < (h - 1) * w:
            q.append(i + w)
    for _ in range(2):   # peel the pink fringe that touches the background
        peel = []
        for i, p in enumerate(data):
            if bg[i] or not _tinted(p):
                continue
            x = i % w
            if (x > 0 and bg[i - 1]) or (x < w - 1 and bg[i + 1]) or (i >= w and bg[i - w]) \
                    or (i < (h - 1) * w and bg[i + w]):
                peel.append(i)
        for i in peel:
            bg[i] = 1
    return data, bg


def bands(profile, n, thr=2, gap=8):
    """n (start, end) runs of profile > thr; runs closer than `gap` join, then the closest pairs merge."""
    runs, s, last = [], None, None
    for i, v in enumerate(profile):
        if v > thr:
            if s is None:
                s = i
            elif i - last > gap:
                runs.append([s, last])
                s = i
            last = i
    if s is not None:
        runs.append([s, last])
    runs = [r for r in runs if r[1] - r[0] >= 4] or runs   # drop specks
    while len(runs) > n:
        k = min(range(len(runs) - 1), key=lambda j: runs[j + 1][0] - runs[j][1])
        runs[k:k + 2] = [[runs[k][0], runs[k + 1][1]]]
    return runs


def find_cells(im, bg):
    """{(row, col): (x0, y0, x1, y1)} exclusive boxes of the sprite in each of the 16 cells."""
    w, h = im.size
    rows = [w - sum(bg[y * w:(y + 1) * w]) for y in range(h)]
    rb = bands(rows, 4)
    if len(rb) != 4:
        raise ValueError(f"found {len(rb)} rows of sprites, expected 4")
    cells = {}
    for r, (y0, y1) in enumerate(rb):
        cols = [sum(1 for y in range(y0, y1 + 1) if not bg[y * w + x]) for x in range(w)]
        cb = bands(cols, 4)
        if len(cb) != 4:
            raise ValueError(f"row {r}: found {len(cb)} sprites, expected 4")
        for c, (x0, x1) in enumerate(cb):
            ys = [y for y in range(y0, y1 + 1) if any(not bg[y * w + x] for x in range(x0, x1 + 1))]
            cells[(r, c)] = (x0, ys[0], x1 + 1, ys[-1] + 1)
    return cells


# ---------------------------------------------------------------- downscale

USED = [(0, 0), (0, 1), (0, 3), (1, 0), (1, 1), (1, 3), (3, 0), (3, 1), (3, 3)]   # right row = left mirrored


def quantise(data, bg, w, cells):
    """One shared colour set for the sheet: {cell: (size, labels bytes (255 = clear))}, palette list."""
    pix = []
    for cell in USED:
        x0, y0, x1, y1 = cells[cell]
        pix.extend(data[y * w + x] for y in range(y0, y1) for x in range(x0, x1) if not bg[y * w + x])
    strip = Image.new("RGB", (len(pix), 1))
    strip.putdata(pix)
    q = strip.quantize(colors=QUANT, dither=Image.Dither.NONE)
    flat = q.getpalette()[:QUANT * 3]
    pal = [tuple(flat[i:i + 3]) for i in range(0, len(flat), 3)]
    idx = iter(_pixels(q))
    out = {}
    for cell in USED:
        x0, y0, x1, y1 = cells[cell]
        lab = bytearray(255 for _ in range((x1 - x0) * (y1 - y0)))
        k = 0
        for y in range(y0, y1):
            for x in range(x0, x1):
                if not bg[y * w + x]:
                    lab[k] = next(idx)
                k += 1
        out[cell] = ((x1 - x0, y1 - y0), lab)
    return out, pal


def core_span(size, lab):
    """(x0, x1) of the body: the columns filled over CORE_COVER of the frame height (flying hair, a scarf
    end or a net held out fill only a few rows of their columns)."""
    sw, sh = size
    cols = [i for i in range(sw) if sum(lab[y * sw + i] != 255 for y in range(sh)) >= CORE_COVER * sh]
    return (cols[0], cols[-1] + 1) if cols else (0, sw)


def eye_marks(size, lab, pal, s, both):
    """Eye candidates of one frame in source pixels: [(cx, cy, height, label)]. A candidate pixel is a dark
    pixel in the head (top 60 %) with skin right below it and skin on both sides in its row (`both`) or on
    one side; candidates join 8-connected, and a mark must be eye-sized and near black (a mouth is lighter)."""
    sw, sh = size
    skin = [is_skin(c) for c in pal] + [False] * (256 - len(pal))
    dark = [lum(c) < EYE_LUM for c in pal] + [False] * (256 - len(pal))
    below, side = max(2, int(round(0.9 * s))), max(2, int(round(0.8 * s)))
    marks = set()
    for y in range(int(sh * 0.6)):
        base = y * sw
        for x in range(sw):
            if not dark[lab[base + x]]:
                continue
            left = any(skin[lab[base + i]] for i in range(max(0, x - side), x))
            right = any(skin[lab[base + i]] for i in range(x + 1, min(sw, x + side + 1)))
            if (left and right) if both else (left or right):
                if any(skin[lab[(y + d) * sw + x]] for d in range(1, below + 1) if y + d < sh):
                    marks.add((x, y))
    out, seen = [], set()
    for p in sorted(marks):
        if p in seen:
            continue
        comp, q = [], [p]
        seen.add(p)
        while q:
            a, b = q.pop()
            comp.append((a, b))
            for da in (-1, 0, 1):
                for db in (-1, 0, 1):
                    n = (a + da, b + db)
                    if n in marks and n not in seen:
                        seen.add(n)
                        q.append(n)
        xs, ys = [a for a, _ in comp], [b for _, b in comp]
        if len(comp) < 0.2 * s * s or max(ys) - min(ys) > 1.8 * s or max(xs) - min(xs) > 1.8 * s:
            continue
        votes = {}
        for a, b in comp:
            votes[lab[b * sw + a]] = votes.get(lab[b * sw + a], 0) + 1
        label = max(votes, key=votes.get)
        if lum(pal[label]) < EYE_BLACK and sum(ys) / len(ys) <= 0.55 * sh:   # a collar or a fist is lower
            out.append((sum(xs) / len(xs), sum(ys) / len(ys), max(ys) - min(ys) + 1, label))
    return out


def head_anchor(size, lab):
    """(x centre of the top 40 % rows, first row) of a source frame: eyes are matched relative to it."""
    sw, sh = size
    rows = [y for y in range(sh) if any(lab[y * sw + x] != 255 for x in range(sw))]
    top = rows[0] if rows else 0
    ys = range(top, top + max(1, int((rows[-1] - top + 1) * 0.4)) if rows else 1)
    xs = [x for y in ys for x in range(sw) if lab[y * sw + x] != 255]
    return ((min(xs) + max(xs) + 1) / 2 if xs else sw / 2), top


def row_eyes(frames, pal, s, side_view, ref_y=None):
    """Eyes of the three frames of one sheet row ({cell: (size, lab)}) -> {cell: [(cx, cy, height, label)]}.
    A mark counts when it is found at the same place (relative to the head) in at least two of the three
    frames; strict marks (skin on both sides) first, then one-sided ones. The lowest mark is an eye, the
    second eye (front view only) sits level with it, a gap apart; the front view needs both eyes. The side
    view's eye is in front of the head centre at the front view's eye height (`ref_y`, relative to the top).
    Frames that missed a mark get it copied. Returns ({cell: eyes}, eye height relative to the top or None)."""
    anchors = {c: head_anchor(*f) for c, f in frames.items()}
    found = {}
    for c, f in frames.items():
        hx, top = anchors[c]
        strict = eye_marks(*f, pal, s, True)
        loose = [m for m in eye_marks(*f, pal, s, False)
                 if all(abs(m[0] - k[0]) > 0.5 * s or abs(m[1] - k[1]) > 0.5 * s for k in strict)]
        found[c] = [(m[0] - hx, m[1] - top, m[2], m[3], rank) for rank, ms in ((0, strict), (1, loose)) for m in ms]
    groups = []
    for c, ms in found.items():
        for m in ms:
            for g in groups:
                if c not in g["cells"] and abs(g["x"] - m[0]) <= 1.0 * s and abs(g["y"] - m[1]) <= 0.6 * s:
                    g["cells"][c] = m
                    break
            else:
                groups.append({"x": m[0], "y": m[1], "cells": {c: m}})
    groups = [g for g in groups if len(g["cells"]) >= 2]
    if side_view:      # facing left: the eye is in front of the head centre, level with the front view's eyes
        groups = [g for g in groups if ref_y is not None and g["x"] < 0 and abs(g["y"] - ref_y) <= 0.8 * s]
    for g in groups:
        g["rank"] = min(m[4] for m in g["cells"].values())
        g["lum"] = lum(pal[next(iter(g["cells"].values()))[3]])
    groups.sort(key=lambda g: (g["rank"], -g["y"]))
    if groups:   # of the marks level with the lowest one, the darkest is the eye (a hair shadow is lighter)
        level = [g for g in groups if g["rank"] == groups[0]["rank"] and groups[0]["y"] - g["y"] <= 0.6 * s]
        first = min(level, key=lambda g: g["lum"])
        groups.remove(first)
        groups.insert(0, first)
    pick = []
    for g in groups:
        if pick and (side_view or len(pick) == 2 or abs(g["y"] - pick[0]["y"]) > 0.6 * s
                     or abs(g["x"] - pick[0]["x"]) < 1.5 * s):
            continue
        pick.append(g)
    out = {c: [] for c in frames}
    if not side_view and len(pick) < 2:
        return out, None
    for g in pick:
        ref = next(iter(g["cells"].values()))
        for c in frames:
            hx, top = anchors[c]
            m = g["cells"].get(c, ref)
            out[c].append((m[0] + hx, m[1] + top, m[2], m[3]))
    return out, (sum(g["y"] for g in pick) / len(pick) if pick else None)


def downscale(size, lab, s, pal, phase, eyes=()):
    """Majority downscale of one frame (labels) with source px per output px `s`, grid shifted by `phase`.
    Returns (native label grid, untrimmed, as rows of ints / None, purity)."""
    sw, sh = size
    px_, py_ = phase
    ow = int((sw + px_) / s) + 2
    oh = int((sh + py_) / s) + 2
    weight = [DARK_WEIGHT if lum(c) < DARK_VOTE_LUM else 1.0 for c in pal]
    grid, support, allvotes, pure, total = [], [], [], 0, 0
    for j in range(oh):
        sy0, sy1 = int(round(j * s - py_)), int(round((j + 1) * s - py_))
        row, sup, vrow = [], [], []
        for i in range(ow):
            sx0, sx1 = int(round(i * s - px_)), int(round((i + 1) * s - px_))
            votes, n = {}, 0
            for y in range(max(0, sy0), min(sh, sy1)):
                base = y * sw
                for x in range(max(0, sx0), min(sw, sx1)):
                    v = lab[base + x]
                    if v != 255:
                        votes[v] = votes.get(v, 0) + 1
                        n += 1
            block = max(1, (sy1 - sy0) * (sx1 - sx0))
            vrow.append(votes)
            if n * 2 <= block:
                row.append(None)
                sup.append(1.0)
                pure += block - n
            else:
                best = max(votes, key=lambda v: votes[v] * weight[v])
                row.append(best)
                sup.append(votes[best] / n)
                pure += votes[best]
            total += block
        grid.append(row)
        support.append(sup)
        allvotes.append(vrow)
    clean = [r[:] for r in grid]
    for j in range(oh):               # speckles: a weakly supported pixel unlike every neighbour
        for i in range(ow):
            v = grid[j][i]
            if v is None:
                continue
            nb = [grid[b][a] for a in (i - 1, i, i + 1) for b in (j - 1, j, j + 1)
                  if (a, b) != (i, j) and 0 <= a < ow and 0 <= b < oh and grid[b][a] is not None]
            if not nb:                # a lone pixel off the body
                clean[j][i] = None
            elif support[j][i] < SPECKLE_SUPPORT and weight[v] == 1 and v not in nb:
                clean[j][i] = max(set(nb), key=nb.count)
    if eyes:
        place_eyes(clean, allvotes, eyes, s, phase, pal)
    return clean, pure / max(1, total)


def place_eyes(grid, votes, eyes, s, phase, pal):
    """Force each eye mark to a 1 px wide (1-2 px tall) dark pixel and give it skin beside and above it where
    the drawing has some skin in that block, so the eye stays a separate mark at 1x."""
    oh, ow = len(grid), len(grid[0])
    skin = {i for i, c in enumerate(pal) if is_skin(c)}
    eye_px = []
    for cx, cy, hgt, label in eyes:
        i, j = int((cx + phase[0]) / s), int((cy - hgt / 2 + phase[1]) / s)
        tall = hgt >= 1.15 * s
        cells = [(i, j), (i, j + 1)] if tall else [(i, int((cy + phase[1]) / s))]
        for a, b in cells:
            if 0 <= a < ow and 0 <= b < oh and grid[b][a] is not None:
                grid[b][a] = label
                eye_px.append((a, b))
    for a, b in eye_px:
        for na, nb in ((a - 1, b), (a + 1, b), (a, b - 1)):
            if not (0 <= na < ow and 0 <= nb < oh) or (na, nb) in eye_px or grid[nb][na] is None:
                continue
            v = votes[nb][na]
            n = sum(v.values())
            sk = {k: c for k, c in v.items() if k in skin}
            if sk and n and sum(sk.values()) >= 0.3 * n and grid[nb][na] not in skin:
                grid[nb][na] = max(sk, key=sk.get)


def trim_box(grid):
    rows = [j for j, r in enumerate(grid) if any(v is not None for v in r)]
    cols = [i for i in range(len(grid[0])) if any(r[i] is not None for r in grid)]
    return (cols[0], rows[0], cols[-1] + 1, rows[-1] + 1) if rows else (0, 0, 1, 1)


def trim(grid):
    x0, y0, x1, y1 = trim_box(grid)
    return [r[x0:x1] for r in grid[y0:y1]]


PHASES = [(a / 3, b / 3) for a in range(3) for b in range(3)]


def best_downscale(size, lab, s, pal, eyes=()):
    """Best grid phase (purity) for one frame, eyes placed; returns (native grid, body centre x in that grid)."""
    best = None
    for fx, fy in PHASES:
        g, p = downscale(size, lab, s, pal, (fx * s, fy * s))
        if best is None or p > best[1]:
            best = (g, p, (fx * s, fy * s))
    g, phase = best[0], best[2]
    if eyes:
        g, _ = downscale(size, lab, s, pal, phase, eyes)
    x0, _y0, _x1, _y1 = trim_box(g)
    c0, c1 = core_span(size, lab)
    centre = (c0 + c1) / 2 / s + phase[0] / s - x0
    return trim(g), centre


def head_centre(grid):
    """x centre of the top 40 % of a native sprite (step frames line up on the head, not on the legs)."""
    top = grid[:max(1, int(len(grid) * 0.4))]
    xs = [i for r in top for i, v in enumerate(r) if v is not None]
    return (min(xs) + max(xs) + 1) / 2 if xs else len(grid[0]) / 2


def layout(frames, centres, fw):
    """frames {cell: native grid} -> {cell: (x, y) top-left in the fw x 32 frame}; None if a frame is too tall.
    A frame wider than fw keeps its place and loses what passes the sides (16 px trials)."""
    def fit(x, g):
        return min(max(x, 0), fw - len(g[0])) if len(g[0]) <= fw else x

    pos = {}
    for r in (0, 1, 3):
        st = frames[(r, 0)]
        sx = fit(int(round(fw / 2 - centres[(r, 0)])), st)
        pos[(r, 0)] = (sx, FEET_STAND + 1 - len(st))
        hc = sx + head_centre(st)
        for c in (1, 3):
            g = frames[(r, c)]
            pos[(r, c)] = (fit(int(round(hc - head_centre(g))), g), FEET_STEP + 1 - len(g))
    if any(pos[cell][1] < 0 for cell in frames):
        return None
    return pos


# ---------------------------------------------------------------- sheet

def outline(img, fw):
    """Black silhouette outline (Player look, as charkit.black_silhouette): every dark pixel on the edge of
    the silhouette turns black. Light edge pixels stay (adding a line outside would fatten the sprite)."""
    w, h = img.size
    src = img.load()
    out = img.copy()
    px = out.load()

    def clear(x, y, fx, fy):
        return not (fx <= x < fx + fw and fy <= y < fy + H) or src[x, y][3] == 0

    for fy in range(0, h, H):
        for fx in range(0, w, fw):
            for y in range(fy, fy + H):
                for x in range(fx, fx + fw):
                    p = src[x, y]
                    if p[3] and lum(p) < DARK_LUM and any(
                            clear(a, b, fx, fy) for a, b in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))):
                        px[x, y] = (0, 0, 0, 255)
    return out


def build_sheet(path, fw=32, height=26, scale_by="height", eyes=True):
    """Native sheet (4*fw x 128) + import info. scale_by: "height" = the standing height is `height` px;
    "body" = the body of the front / back stand frames fills the frame width (flying parts cut, fw 16 trials);
    "fit" = `height` px unless the widest frame would pass the frame width (drawings made to fit 16 px: League);
    "widest" = the widest frame fits the frame (the first import, kept for comparison)."""
    im = Image.open(path).convert("RGB")
    data, bg = key_background(im)
    cells = find_cells(im, bg)
    labs, pal = quantise(data, bg, im.width, cells)
    tallest = max(labs[c][0][1] for c in USED if c[1] == 0)
    if scale_by == "height":
        s = tallest / (height + 0.5)
    elif scale_by == "fit":
        s = max(tallest / (height + 0.5), max(labs[c][0][0] for c in USED) / (fw - 0.5))
    elif scale_by == "body":
        body = max(core_span(*labs[c])[1] - core_span(*labs[c])[0] for c in ((0, 0), (3, 0)))
        s = max(body / (fw - 0.5), tallest / (FEET_STAND + 0.5))
    else:
        widest = max(labs[c][0][0] for c in USED)
        s = max(widest / (fw - 0.5), tallest / (FEET_STAND + 0.5))
    for _ in range(40):
        marks = {}
        if eyes:
            front, ref_y = row_eyes({c: labs[c] for c in USED if c[0] == 0}, pal, s, False)
            side, _ = row_eyes({c: labs[c] for c in USED if c[0] == 1}, pal, s, True, ref_y)
            marks = {**front, **side}
        done = {c: best_downscale(*labs[c], s, pal, marks.get(c, ())) for c in USED}
        frames = {c: g for c, (g, _) in done.items()}
        pos = layout(frames, {c: x for c, (_, x) in done.items()}, fw)
        if pos:
            break
        s *= 1.03
    else:
        raise ValueError(f"frames do not fit the {fw}x{H} frame")
    if scale_by == "widest" and any(len(g[0]) > fw for g in frames.values()):
        raise ValueError(f"a frame is wider than {fw} px")
    sheet = Image.new("RGBA", (fw * 4, H * 4), (0, 0, 0, 0))
    px = sheet.load()
    for (r, c), g in frames.items():
        x0, y0 = pos[(r, c)]
        for cc in ((0, 2) if c == 0 else (c,)):
            for j, row in enumerate(g):
                for i, v in enumerate(row):
                    if v is not None and 0 <= x0 + i < fw:
                        px[cc * fw + x0 + i, r * H + y0 + j] = pal[v] + (255,)
    left = sheet.crop((0, H, fw * 4, H * 2))
    mirrored = Image.new("RGBA", left.size, (0, 0, 0, 0))
    for c in range(4):
        mirrored.paste(left.crop((c * fw, 0, (c + 1) * fw, H)).transpose(Image.Transpose.FLIP_LEFT_RIGHT), (c * fw, 0))
    sheet.paste(mirrored, (0, H * 2))
    sheet = gen3.to_gen3(outline(sheet, fw), max_colours=15, keep=[(0, 0, 0)])
    stand_h = max(len(frames[(r, 0)]) for r in (0, 1, 3))
    return sheet, {"scale_src_px": round(s, 2), "stand_height_px": stand_h,
                   "cells": {f"{r},{c}": list(cells[(r, c)]) for r, c in sorted(cells)}}


class Drawn:
    """What charkit.meta() needs from a Character."""
    def __init__(self, slug, group):
        self.slug, self.group, self.palette, self.child = slug, group, slug, False

    @property
    def fh(self):
        return H


def export(entry, sheet, info, fw, group, out_root):
    """<slug>-overworld.png + .json (and the run sheet for a Player). Every field of the index entry but the
    slug goes into the JSON (Player: name, gender, child, order, look; League: role, name)."""
    slug = entry["slug"]
    ch = Drawn(slug, group)
    out = os.path.join(out_root, slug)
    os.makedirs(out, exist_ok=True)
    paths = []
    for kind in ("overworld", "run") if group == "Player" else ("overworld",):
        m = CK.meta(ch, kind, sheet)
        m["frame"] = {"w": fw * CK.SCALE, "h": H * CK.SCALE, "native_w": fw, "native_h": H, "scale": CK.SCALE}
        m["anchor"] = (f"frame bottom-centre on the bottom-centre of the Character's tile; the {fw}x{H} frame "
                       "overlaps the tile above" + (" and half a tile on each side" if fw > CK.W else ""))
        m.update({k: v for k, v in entry.items() if k != "slug"})
        m.update({"source": "drawn", "import": {"from": os.path.relpath(drawing_path(slug, group), REPO),
                                                "tool": "tools/characters/import_drawn.py", **info}})
        if kind == "run":
            m["run"] = "walk frames reused"
        p = os.path.join(out, f"{slug}-{kind}.png")
        CK.up(sheet).save(p)
        with open(p[:-4] + ".json", "w", encoding="utf-8") as f:
            json.dump(m, f, indent=2, ensure_ascii=False)
            f.write("\n")
        paths.append(p)
    return paths


# ---------------------------------------------------------------- report

def roster(root=ROOT):
    """[(order, slug, name, native sheet, native frame width)] of every Player on disk, in picker order."""
    out = []
    for slug in sorted(os.listdir(root)):
        j = os.path.join(root, slug, f"{slug}-overworld.json")
        if not os.path.exists(j):
            continue
        m = json.load(open(j, encoding="utf-8"))
        img = Image.open(j[:-5] + ".png").convert("RGBA")
        out.append((m.get("order", 99), slug, m.get("name", slug), img.resize((img.width // 2, img.height // 2)),
                    m["frame"].get("native_w", CK.W)))
    return sorted(out)


def font(size):
    for name in ("DejaVuSans.ttf", "NotoSans-Regular.ttf", "LiberationSans-Regular.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def report(path, k=3, per_row=5):
    """Contact sheet: per Player the stand frame of the 4 directions + step A facing down, x3 on a 32 px wide
    slot (a 16 px frame sits in its middle), name below; at most 2400 px."""
    players = roster()
    slot = 32
    cell_w, cell_h, label, pad = 5 * slot * k, H * k, 22, 12
    cols = min(per_row, len(players))
    rows = (len(players) + cols - 1) // cols
    img = Image.new("RGB", (pad + cols * (cell_w + pad), pad + rows * (cell_h + label + pad)), (200, 200, 196))
    d = ImageDraw.Draw(img)
    f = font(16)
    for n, (order, slug, name, sheet, fw) in enumerate(players):
        x0 = pad + (n % cols) * (cell_w + pad)
        y0 = pad + (n // cols) * (cell_h + label + pad)
        d.rectangle((x0 - 4, y0 - 4, x0 + cell_w + 3, y0 + cell_h + label), fill=(222, 222, 216))
        for i, (r, c) in enumerate([(0, 0), (1, 0), (2, 0), (3, 0), (0, 1)]):
            fr = sheet.crop((c * fw, r * H, (c + 1) * fw, (r + 1) * H)).resize((fw * k, H * k), Image.NEAREST)
            img.paste(fr, (x0 + i * slot * k + (slot - fw) * k // 2, y0), fr)
        text = f"{order}. {name}"
        tw = d.textlength(text, font=f)
        d.text((x0 + (cell_w - tw) / 2, y0 + cell_h + 2), text, fill=(30, 30, 40), font=f)
    if max(img.size) > 2400:
        r = 2400 / max(img.size)
        img = img.resize((int(img.width * r), int(img.height * r)), Image.NEAREST)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    img.save(path)
    return path


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("slugs", nargs="*", help="only these slugs (default: every Character of the index files)")
    ap.add_argument("--group", choices=sorted(INDEXES) + ["all"], default="all", help="only this group")
    ap.add_argument("--add-from", metavar="DIR", help="first copy new Player drawings + order.txt lines from DIR")
    ap.add_argument("--frame-w", type=int, help="native frame width (default: the index file's frame_w)")
    ap.add_argument("--height", type=int, help="standing height of an adult in native px (default: index file)")
    ap.add_argument("--child-height", type=int, help="standing height of a child (default: index file)")
    ap.add_argument("--scale-by", choices=("height", "fit", "body", "widest"),
                    help="how the one scale per Character is chosen (default: index file; body / widest = trials)")
    ap.add_argument("--no-eyes", action="store_true", help="do not protect the eyes (trial)")
    ap.add_argument("--out-root", help="write the sheets to OUT_ROOT/<slug>/ instead (trials)")
    ap.add_argument("--report", default=None, help="also write a contact sheet of every Player to this PNG")
    a = ap.parse_args()
    if a.add_from:
        print("added", ", ".join(add_from(a.add_from)))
    groups = sorted(INDEXES) if a.group == "all" else [a.group]
    todo = [(g, load_index(g)) for g in groups]
    known = {e["slug"] for _, idx in todo for e in idx["characters"]}
    bad = [s for s in a.slugs if s not in known]
    if bad:
        sys.exit(f"not in the index files: {', '.join(bad)}; known: {', '.join(sorted(known))}")
    for group, idx in todo:
        fw = a.frame_w or idx["frame_w"]
        scale_by = a.scale_by or idx["scale_by"]
        for entry in idx["characters"]:
            slug = entry["slug"]
            if a.slugs and slug not in a.slugs:
                continue
            height = (a.child_height or idx["child_height"]) if entry.get("child") else (a.height or idx["height"])
            sheet, info = build_sheet(drawing_path(slug, group), fw, height, scale_by, not a.no_eyes)
            for p in export(entry, sheet, info, fw, group, a.out_root or os.path.join(CHARS, group)):
                print("wrote", os.path.relpath(p, REPO))
            print(f"  {slug}: scale {info['scale_src_px']} src px / px, standing height {info['stand_height_px']} px,"
                  f" {len(CK.colours_of(sheet))} colours")
    if a.report:
        print("wrote", os.path.relpath(report(a.report), REPO))


if __name__ == "__main__":
    main()
