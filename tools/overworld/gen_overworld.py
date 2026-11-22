#!/usr/bin/env python3
"""
Generate Mons overworld pieces into assets/overworld/.

  python3 gen_overworld.py [slug ...|all] [--gym <type>] [--cave] [--night]

Gen 3 by default: day only, every PNG through the Gen 3 pass (BGR555, alpha 0/255, <= 15 colours
per 8x8 tile). --night also writes the (non-Gen 3) -night files, night review halves and lamp glows.
Terrain (assets/overworld/Terrain/<slug>/):
  blob  -> <slug>.png (8x6 tiles, 47-blob autotile), -night.png, -anim.png (frames stacked
           vertically, one full sheet per frame), <slug>.tsj (Tiled mixed wangset + animation)
  fill  -> grass: 3 variants in a row
  row   -> ledges: 4 tiles in a row [single, start, middle, end]
Props (assets/overworld/Props/<slug>/): <slug>.png, -night.png, -anim.png (horizontal strip) + <slug>.json
  fence is a 4-neighbour connector: 18 tiles in a row = masks 0..15 (bit 1=N 2=E 4=S 8=W),
  then gate-closed, gate-open.
Also: assets/overworld/catalog.png and assets/overworld/review-scene.png (day | night, review only).
"""
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "pieces"))

import glob  # noqa: E402
import importlib  # noqa: E402

import overworld_kit as K  # noqa: E402
from props import PROPS  # noqa: E402
from terrain import TERRAIN  # noqa: E402

import naturekit  # noqa: E402  (shared nature-kit pieces: coast and woods patches and props)

TERRAIN.update(naturekit.BASE_TERRAIN)
PROPS.update(naturekit.BASE_PROPS)
# Gym environment modules: pieces/gym_<type>.py may export TERRAIN, PROPS and GYM (review scene).
BASE_TERRAIN, BASE_PROPS = list(TERRAIN), list(PROPS)
GYMS = {}
for path in sorted(glob.glob(os.path.join(HERE, "pieces", "gym_*.py"))):
    module = importlib.import_module(os.path.basename(path)[:-3])
    gtype = os.path.basename(path)[4:-3]
    TERRAIN.update(getattr(module, "TERRAIN", {}))
    PROPS.update(getattr(module, "PROPS", {}))
    GYMS[gtype] = dict(module=module, terrain=list(getattr(module, "TERRAIN", {})), props=list(getattr(module, "PROPS", {})),
                       scene=getattr(module, "GYM", None))
# Cave pieces (pieces/cave.py): owner "cave", written to assets/overworld/Caves/ (--cave for previews only).
# pieces/cave_regions.py adds the mechanic and decoration pieces of the regional caves D-I.
import cave  # noqa: E402
import cave_regions  # noqa: E402
CAVE_TERRAIN = dict(cave.TERRAIN, **cave_regions.TERRAIN)
CAVE_PROPS = dict(cave.PROPS, **cave_regions.PROPS)
TERRAIN.update(CAVE_TERRAIN)
PROPS.update(CAVE_PROPS)
CAVE = set(CAVE_TERRAIN) | set(CAVE_PROPS)

ROOT = os.path.abspath(os.path.join(HERE, "../..", "assets", "overworld"))
TS = K.CELL
NIGHT = False          # opt-in (--night): Gen 3 has no day/night
# ---------------------------------------------------------------- output layout
# assets/overworld/Base/{Terrain,Props}/<slug>/            shared pieces
# assets/overworld/Gyms/<type>/{Terrain,Props}/<slug>/     pieces belonging to one gym
# assets/overworld/_preview/                               catalogs + review scenes (look only, never assets)
# Every piece also ships its smallest units in <slug>/tiles/ so maps can be assembled freely.
PREVIEW = os.path.join(ROOT, "_preview")
INDEX = []
DIRS8 = (("n", K.N), ("ne", K.NE), ("e", K.E), ("se", K.SE), ("s", K.S), ("sw", K.SW), ("w", K.W), ("nw", K.NW))


def owner(slug):
    if slug in CAVE:
        return "cave"
    for g, info in GYMS.items():
        if slug in info["terrain"] or slug in info["props"]:
            return g
    return None


def piece_dir(group, slug):
    g = owner(slug)
    base = (os.path.join(ROOT, "Caves") if g == "cave" else os.path.join(ROOT, "Gyms", g) if g
            else os.path.join(ROOT, "Base"))
    return os.path.join(base, group, slug)


def blob_code(m):
    """Readable neighbour code of a blob tile: which sides/corners connect to the same terrain."""
    parts = [n for n, b in DIRS8 if m & b]
    return "-".join(parts) if parts else "solo"


def cross_code(m):
    parts = [n for n, b in (("n", 1), ("e", 2), ("s", 4), ("w", 8)) if m & b]
    return "-".join(parts) if parts else "post"


def save_tile(img, path, slug, night=None):
    K.up(img).save(path + ".png")
    if NIGHT if night is None else night:
        K.up(night_of(slug, img)).save(path + "-night.png")


def crop16(sheet, i, cols, w=1, h=1):
    x, y = (i % cols) * TS * w, (i // cols) * TS * h
    return sheet.crop((x, y, x + TS * w, y + TS * h))


# ---------------------------------------------------------------- terrain
FLOOR_WORDS = ("path", "plaza", "road", "apron", "plate", "flagstone", "boardwalk", "paving", "mosaic")


def group_of(slug):
    """Terrains in the same group connect to each other (no grass seam where a road meets a plaza).
    A spec may set group=...; walkable floors (paths, plazas, paving...) default to 'floor'."""
    if slug is None:
        return None
    spec = TERRAIN.get(slug, {})
    if spec.get("group"):
        return spec["group"]
    return "floor" if any(w in slug for w in FLOOR_WORDS) else slug


def terrain_mask(scene, chars, c, r, slug):
    """8-neighbour blob mask of cell (c, r) drawn with `slug` (the cell's own terrain, or its blob
    fallback). Same char or same group connects; a terrain with a `joins(nb, dx, dy)` rule decides
    per neighbour and direction first (plateau levels and faces, sand into a pond edge)."""
    ch = scene[r][c]
    own = chars.get(ch)
    g, wg = group_of(slug), group_of(own)
    rule = TERRAIN[slug].get("joins") or TERRAIN.get(own, {}).get("joins")
    H, W = len(scene), len(scene[0])
    m = 0
    for name, (dx, dy) in (("N", (0, -1)), ("NE", (1, -1)), ("E", (1, 0)), ("SE", (1, 1)),
                           ("S", (0, 1)), ("SW", (-1, 1)), ("W", (-1, 0)), ("NW", (-1, -1))):
        x, y = c + dx, r + dy
        if not (0 <= y < H and 0 <= x < W):
            m |= K.BITS[name]
            continue
        q = scene[y][x]
        nb = chars.get(q)
        hit = rule(nb, dx, dy) if rule else None
        if hit is None:
            hit = q == ch or group_of(nb) in (g, wg)
        if hit:
            m |= K.BITS[name]
    return m


def soften_grout(img, cut=0.72, pull=0.55):
    """Soft paving for themed floors: pixels much darker than the floor's median tone (grout,
    seams, hard joint lines) are pulled most of the way toward that median, so stones read as
    smooth paving instead of a hard dark grid. Light patterns and the theme colours stay."""
    im = img.copy()
    p = im.load()
    pts = [p[x, y] for y in range(im.height) for x in range(im.width) if p[x, y][3]]
    if not pts:
        return im

    def lum(c):
        return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
    med = sorted(pts, key=lum)[len(pts) // 2]
    ml = lum(med)
    for y in range(im.height):
        for x in range(im.width):
            c = p[x, y]
            if c[3] and lum(c) < cut * ml:
                p[x, y] = K.mix(c[:3], med[:3], pull) + (c[3],)
    return im


def build_terrain(slug, overlay=False):
    spec = TERRAIN[slug]
    kind = spec["kind"]
    if kind == "blob":
        cut = spec.get("overlay_cut", 0.0) if overlay else None
        frames = K.blob_sheet(spec["paint"], spec.get("frames", 1), overlay_cut=cut, soft=spec.get("soft", True),
                              **spec["sdf"])
        if owner(slug) and group_of(slug) == "floor" and spec.get("soft_grout", True):
            frames = [soften_grout(fr) for fr in frames]     # gym paving: soft joints like the base paving
    elif kind == "quad":
        frames = [spec["block"]()]
    elif kind == "fill":
        sheet = Image.new("RGBA", (TS * len(spec["variants"]), TS))
        p = sheet.load()
        for i, fn in enumerate(spec["variants"]):
            for y in range(TS):
                for x in range(TS):
                    p[i * TS + x, y] = fn(x, y) + (255,)
        frames = [sheet]
    else:
        sheet = Image.new("RGBA", (TS * 4, TS))
        p = sheet.load()
        for i in range(4):
            for y in range(TS):
                for x in range(TS):
                    p[i * TS + x, y] = spec["paint"](i, x, y) + (255,)
        frames = [sheet]
    return frames


def save_terrain(slug, frames):
    spec = TERRAIN[slug]
    out = piece_dir("Terrain", slug)
    os.makedirs(out, exist_ok=True)
    base = os.path.join(out, slug)
    tdir = os.path.join(out, "tiles")
    os.makedirs(tdir, exist_ok=True)
    K.up(frames[0]).save(base + ".png")
    if NIGHT:
        K.up(night_of(slug, frames[0])).save(base + "-night.png")
    image = f"{slug}.png"
    if len(frames) > 1:
        strip = Image.new("RGBA", (frames[0].width, frames[0].height * len(frames)))
        for i, fr in enumerate(frames):
            strip.paste(fr, (0, i * fr.height))
        K.up(strip).save(base + "-anim.png")
        if NIGHT:
            nstrip = Image.new("RGBA", strip.size)
            for i, fr in enumerate(frames):
                nstrip.paste(night_of(slug, fr), (0, i * fr.height))
            K.up(nstrip).save(base + "-anim-night.png")
        image = f"{slug}-anim.png"
    if spec["kind"] == "quad":
        names = ["tl", "tr", "bl", "br"]
        for i, nm in enumerate(names):
            save_tile(crop16(frames[0], i, 2), os.path.join(tdir, f"{slug}-{nm}"), slug)
        K.write_json(base + ".tsj", {
            "type": "tileset", "version": "1.10", "name": slug, "image": image,
            "imagewidth": TS * 4, "imageheight": TS * 4, "tilewidth": TS * 2, "tileheight": TS * 2,
            "columns": 2, "tilecount": 4, "margin": 0, "spacing": 0,
            "tiles": [{"id": i, "properties": [{"name": "behaviour", "type": "string", "value": spec["behaviour"]},
                                               {"name": "blocking", "type": "bool", "value": True},
                                               {"name": "piece", "type": "string", "value": nm}]}
                      for i, nm in enumerate(names)]})
        INDEX.append(dict(slug=slug, owner=owner(slug) or "base", type="terrain", kind="2x2-block",
                          dir=os.path.relpath(out, ROOT), tiles=[f"tiles/{slug}-{nm}.png" for nm in names],
                          note="stamp as a 2x2 block on even cells; use the forest autotile for odd edges"))
        return
    if spec["kind"] == "blob":
        K.write_json(base + ".tsj", K.tsj_blob(slug, image, len(frames), spec["behaviour"]))
        ov = build_terrain(slug, overlay=True)          # transparent outside: layer on any ground
        K.up(ov[0]).save(base + "-overlay.png")
        if NIGHT:
            K.up(night_of(slug, ov[0])).save(base + "-overlay-night.png")
        if len(ov) > 1:
            st = Image.new("RGBA", (ov[0].width, ov[0].height * len(ov)))
            for i, fr in enumerate(ov):
                st.paste(fr, (0, i * fr.height))
            K.up(st).save(base + "-overlay-anim.png")
        # single tiles: transparent outside, so each can sit on any ground; animated ones also
        # get a horizontal frame strip
        for i, m in enumerate(K.BLOB_MASKS):
            name = os.path.join(tdir, f"{slug}-{blob_code(m)}")
            save_tile(crop16(ov[0], i, K.BLOB_COLS), name, slug)
            if len(ov) > 1:
                strip = Image.new("RGBA", (TS * len(ov), TS))
                nstrip = Image.new("RGBA", strip.size)
                for f, fr in enumerate(ov):
                    t = crop16(fr, i, K.BLOB_COLS)
                    strip.paste(t, (f * TS, 0))
                    nstrip.paste(night_of(slug, t), (f * TS, 0))
                K.up(strip).save(name + "-anim.png")
                if NIGHT:
                    K.up(nstrip).save(name + "-anim-night.png")
        INDEX.append(dict(slug=slug, owner=owner(slug) or "base", type="terrain", kind="blob-47",
                          frames=len(frames), dir=os.path.relpath(out, ROOT),
                          tiles="tiles/<slug>-<code>.png, code = connected neighbours (n ne e se s sw w nw) or 'solo'"))
    else:
        n = frames[0].width // TS
        K.write_json(base + ".tsj", {
            "type": "tileset", "version": "1.10", "name": slug, "image": image,
            "imagewidth": n * TS * 2, "imageheight": TS * 2, "tilewidth": TS * 2, "tileheight": TS * 2,
            "columns": n, "tilecount": n, "margin": 0, "spacing": 0,
            "tiles": [{"id": i, "properties": [{"name": "behaviour", "type": "string", "value": spec["behaviour"]},
                                               {"name": "piece", "type": "string",
                                                "value": (["single", "start", "middle", "end"][i]
                                                          if spec["kind"] == "row" else f"variant-{i}")}]}
                      for i in range(n)]})
        names = (["single", "start", "middle", "end"] if spec["kind"] == "row" else [f"v{i}" for i in range(n)])
        for i, nm in enumerate(names):
            save_tile(crop16(frames[0], i, n), os.path.join(tdir, f"{slug}-{nm}"), slug)
        INDEX.append(dict(slug=slug, owner=owner(slug) or "base", type="terrain",
                          kind="row-connector" if spec["kind"] == "row" else "fill",
                          dir=os.path.relpath(out, ROOT), tiles=[f"tiles/{slug}-{nm}.png" for nm in names]))


# ---------------------------------------------------------------- props
def ground_shade(ground):
    """Opaque contact-shade colour on a ground fill: the lawn shade for grass, else the darkest of the
    fill's 4 most common tones (so a shade never shows a lawn-green rim on volcanic rock)."""
    if not ground or ground == "grass":
        return K.GRASS_SHADE
    st = cave_style_of(ground) if ground in CAVE_TERRAIN else None
    if st in cave.REGIONS:                   # regional caves: always the floor's own shade tone
        return cave.STYLE[st]["floor"][3]
    from collections import Counter
    tile = build_terrain(ground)[0].crop((0, 0, TS, TS)).convert("RGB")
    common = [c for c, _ in Counter(tile.getdata()).most_common(4)]
    return min(common, key=lambda c: sum(c))


def shade_colour(slug):
    """Shade baked into a SAVED prop: its owner's ground (lawn for base props, the gym's ground fill)."""
    g = owner(slug)
    if g == "cave":
        return ground_shade(PROPS.get(slug, {}).get("ground"))
    return ground_shade(GYMS[g]["scene"].get("ground") if g and GYMS[g]["scene"] else None)


def keyed_shade(im, col):
    p = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if p[x, y] == K.SHADE_KEY + (255,):
                p[x, y] = col + (255,)
    return im


def prop_frames(slug, resolve=True):
    """resolve=False keeps the SHADE_KEY marker, so a scene can paint the shade of ITS ground."""
    spec = PROPS[slug]
    res = spec["paint"]()
    if resolve:
        col = shade_colour(slug)
        res = [[keyed_shade(f, col) for f in r] if isinstance(r, list) else keyed_shade(r, col) for r in res]
    if spec.get("kind") == "cross":          # list of [frame] per tile -> one row sheet
        w, h = spec["cells"]
        sheet = Image.new("RGBA", (len(res) * w * TS, h * TS), (0, 0, 0, 0))
        for i, fr in enumerate(res):
            sheet.paste(fr[0], (i * w * TS, 0))
        return [sheet]
    return res


def lamp_night(img, slug="street-lamp"):
    """Night lamp: dark recolour, keep the emissive pixels, add a warm glow halo and ground pool.
    A prop may set lamp=(r, g, b) to tint its glow."""
    spec = PROPS[slug]
    n = K.night(img, spec.get("emissive", ()))
    tint = spec["lamp"] if isinstance(spec.get("lamp"), tuple) else (255, 210, 120)
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    w, h = img.size
    d.ellipse([0, h - 8, w - 1, h - 1], fill=tint + (110,))
    d.ellipse([0, 0, w - 1, min(h - 1, 15)], fill=tint + (90,))
    glow.alpha_composite(n)
    return glow


def night_of(slug, img):
    """Night version of any piece; `emissive` colours (props or terrain) stay lit."""
    spec = PROPS.get(slug) or TERRAIN.get(slug) or {}
    if slug in PROPS and spec.get("lamp"):
        return lamp_night(img, slug)
    return K.night(img, spec.get("emissive", ()))


def save_prop(slug, frames):
    spec = PROPS[slug]
    out = piece_dir("Props", slug)
    os.makedirs(out, exist_ok=True)
    base = os.path.join(out, slug)

    def nightf(im):
        return night_of(slug, im)
    K.up(frames[0]).save(base + ".png")
    if NIGHT:
        K.up(nightf(frames[0])).save(base + "-night.png")
    meta = {"cells": spec["cells"], "frames": len(frames), "anchor": "bottom-left cell",
            "emissive_at_night": bool(spec.get("emissive"))}
    if len(frames) > 1:
        w = frames[0].width
        strip = Image.new("RGBA", (w * len(frames), frames[0].height))
        nstrip = Image.new("RGBA", strip.size)
        for i, fr in enumerate(frames):
            strip.paste(fr, (i * w, 0))
            nstrip.paste(nightf(fr), (i * w, 0))
        K.up(strip).save(base + "-anim.png")
        if NIGHT:
            K.up(nstrip).save(base + "-anim-night.png")
        meta.update(order=spec.get("order", list(range(len(frames)))), duration_ms=267)
    if spec.get("kind") == "cross":
        meta.update(connector="4-neighbour", tiles="0..15 = mask (1=N 2=E 4=S 8=W), 16 = gate closed, 17 = gate open")
        tdir = os.path.join(out, "tiles")
        os.makedirs(tdir, exist_ok=True)
        w, h = spec["cells"]
        n = frames[0].width // (TS * w)
        for i in range(n):
            nm = cross_code(i) if i < 16 else ("gate-closed" if i == 16 else "gate-open")
            save_tile(crop16(frames[0], i, n, w, h), os.path.join(tdir, f"{slug}-{nm}"), slug)
        meta["tile_files"] = "tiles/<slug>-<code>.png, code = connected sides (n e s w), 'post', gate-closed, gate-open"
    if len(frames) > 1:
        fdir = os.path.join(out, "frames")
        os.makedirs(fdir, exist_ok=True)
        for i, fr in enumerate(frames):
            save_tile(fr, os.path.join(fdir, f"{slug}-f{i}"), slug)
    if spec.get("lamp") and NIGHT:
        tint = spec["lamp"] if isinstance(spec["lamp"], tuple) else (255, 210, 120)
        K.up(K.glow_sprite(tint), raw=True).save(base + "-glow.png")      # soft alpha: opt-in, not Gen 3
        meta["night_glow"] = f"{slug}-glow.png: 3x3 cells, centre it on the lamp head at night, under props"
    K.write_json(base + ".json", meta)
    INDEX.append(dict(slug=slug, owner=owner(slug) or "base", type="prop",
                      kind="4-way-connector" if spec.get("kind") == "cross" else "prop",
                      cells=list(spec["cells"]), frames=len(frames), dir=os.path.relpath(out, ROOT)))


# ---------------------------------------------------------------- review scene
SCENE = [
    "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
    "FFFFFFFFFF..==..FFFFFFFF^^^^^^FF",
    "FFFF,,,FF...==........FF^^^^^^FF",
    "FF,,,,,,....==..........^^^^^^.F",
    "FF,,,,,,,...======......kkkSkk.F",
    "F..,,,,.....=....=......kkkSkk.F",
    "F...........=....=..#######..h.F",
    "F..~~~......======..#.....#.h..F",
    "F.~~~~~~........=...#.###.#.h..F",
    "F.~~~~~~~~~~....=...#.###.#....F",
    "F..~~~~...~.....=...#.....#....F",
    "F.........~.....=...#######....F",
    "F_________~___..=..............F",
    "F,,,,.....~.....=.......,,,,,..F",
    "F,,,,,....~.....=......,,,,,,..F",
    "F.,,,.....~~~...=.....sssssss..F",
    "F.........~~~....ssssssswwwwsssF",
    "F........ssssssssswwwwwwwwwwwwwF",
    "FFFFF...sssswwwwwwwwwwwwwwwwwwwF",
    "FFFFFFsswwwwwwwwwwwwwwwwwwwwwwww",
]
TERRAIN_CHAR = {",": "tall-grass", "=": "dirt-path", "#": "paved-path", "s": "sand", "~": "water",
                "w": "shore", "^": "cliff", "h": "hedge", "F": "tree-wall", "_": "ledge",
                "k": "cliff-face", "S": "stairs"}
# (slug, col, row) anchored at the bottom-left cell
SCENE_PROPS = [("tree", 8, 6), ("tree", 29, 11), ("bush", 6, 10), ("bush", 7, 10),
               ("bush", 8, 10), ("sign", 11, 3), ("flowers", 3, 6), ("flowers", 4, 6), ("flowers", 5, 5),
               ("rock", 18, 9), ("rock-big", 17, 14), ("mailbox", 2, 6), ("item-ball", 6, 3),
               ("cut-tree", 30, 7), ("cave-mouth", 24, 5), ("smash-rock", 30, 8), ("street-lamp", 19, 6),
               ("street-lamp", 27, 13)]
SCENE_FENCE = [(c, 12) for c in range(21, 27)] + [(27, r) for r in range(9, 13)]


# Nature review (2026-11-19): ground patches, a plateau with a two-row face and stairs, a mixed
# tree-wall / pine-wall edge and every nature / town detail Prop, as the map passes combine them.
NATURE_SCENE = [
    "FFFFFFFFFFFFFFPPPPFFFFFFFFFFFFFF",
    "FFFFFFFFFFFFFFPPPPFFFFFFFFPPPPFF",
    "FFFFFFPPFFFFFFPPPPFFFFFFFFPPPPFF",
    "FFFFFFPPFF......FFFF....FFFFFFFF",
    "FF..............FF........FFFFFF",
    "F...LLLLL.................~~~.FF",
    "F..LLLLLLL......EEEE.....~~~~~.F",
    "F..LLLLLLL.....EEEEEE...~~~~~~.F",
    "F...LLLL........EEEE.....~~~~..F",
    "F.......^^^^^^^^..........~~...F",
    "F.......^^^^^^^^...............F",
    "F..CCC..^^^^^^^^...............F",
    "F.CCCCC.^^^^^^^^......====.....F",
    "F.CCCCC.kkkkSkkk......====.....F",
    "F..CCC..kkkkSkkk......====.....F",
    "F.....................====.....F",
    "F..............................F",
    "F..............................F",
    "FF............................FF",
    "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
]
NATURE_CHARS = {"L": "lush-grass", "E": "worn-earth", "C": "clover", "k": "cliff-face", "S": "stairs",
                "P": "pine-wall", "=": "paved-path"}
NATURE_PROPS = [("pine-tree", 3, 4), ("tree-small", 10, 4), ("tree", 11, 5), ("bush", 1, 5), ("bush-wide", 6, 4),
                ("flowers-yellow", 10, 10), ("flowers-white", 11, 10), ("flowers-blue", 13, 11), ("tuft", 9, 11),
                ("flowers", 14, 10), ("pebbles", 17, 9), ("rocks-small", 19, 10), ("tuft", 18, 11),
                ("stump", 22, 4), ("mushrooms", 23, 4), ("log", 20, 5), ("reeds", 24, 6), ("reeds", 24, 8),
                ("lily-pad", 27, 7), ("lily-pad", 28, 6), ("bush-flower", 1, 16), ("flowers-white", 2, 16),
                ("tuft", 4, 10), ("well", 26, 13), ("crates", 28, 12), ("barrel", 29, 12), ("barrel", 29, 13),
                ("flower-bed", 21, 16), ("signpost", 19, 14), ("flowers-blue", 4, 17), ("mushrooms", 15, 4),
                ("tree-small", 7, 17), ("pine-tree", 12, 18), ("flowers-yellow", 10, 17), ("tuft", 16, 17)]


def load_keyed(path, box=None):
    """Load a Mons asset drawn on #FF00FF, crop `box` (full-res px), make magenta transparent and
    bring it to the half scale used here (all Mons sheets are exported x2)."""
    im = Image.open(path).convert("RGBA")
    if box:
        im = im.crop(box)
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if r > 230 and g < 40 and b > 230:
                px[x, y] = (0, 0, 0, 0)
    return im.resize((im.width // 2, im.height // 2), Image.NEAREST)


def render_scene(sheets, scene=None, chars=None, props=None, fences=None, overlays=(), night=False, under=(),
                 ground=None, ov_sheets=None):
    """Paint an ASCII scene with the pieces. overlays: [(RGBA image, x_px, y_px)] sorted with props
    by their bottom edge (structures, Pokémon sprites).
    ground: slug of a 'fill' terrain used as the base instead of grass. ov_sheets: when given,
    blob terrains are laid as transparent-outside overlays on that base (no grass rims)."""
    scene = scene or SCENE
    chars = dict(TERRAIN_CHAR, **(chars or {}))
    props = SCENE_PROPS if props is None else props
    fences = SCENE_FENCE if fences is None else fences
    W, H = len(scene[0]), len(scene)
    assert all(len(r) == W for r in scene), [len(r) for r in scene]
    img = Image.new("RGBA", (W * TS, H * TS))
    base = sheets[ground or "grass"]
    nvar = base.width // TS
    for r in range(H):
        for c in range(W):
            v = K.h16(c, r, 9) % nvar
            img.paste(base.crop((v * TS, 0, v * TS + TS, TS)), (c * TS, r * TS))
            ch = scene[r][c]
            slug = chars.get(ch)
            if not slug:
                continue
            spec = TERRAIN[slug]
            if spec["kind"] == "quad":                 # 2x2 block on even cells, else its blob fallback
                bc, br = c - c % 2, r - r % 2
                if all(br + j < H and bc + i < W and scene[br + j][bc + i] == ch for i in (0, 1) for j in (0, 1)):
                    q = (c % 2) * TS, (r % 2) * TS
                    img.paste(sheets[slug].crop((q[0], q[1], q[0] + TS, q[1] + TS)), (c * TS, r * TS))
                    continue
                slug = spec["fallback"]
                spec = TERRAIN[slug]
            if spec["kind"] == "blob":
                m = terrain_mask(scene, chars, c, r, slug)    # a fallback cell also joins its own wall group
                if ov_sheets is not None:
                    img.alpha_composite(K.blob_tile(ov_sheets[slug], m), (c * TS, r * TS))
                else:
                    img.alpha_composite(K.blob_tile(sheets[slug], m), (c * TS, r * TS))
            elif spec["kind"] == "row":
                i = K.row_index(scene, c, r, lambda x, ch=ch: x == ch, spec["axis"])
                img.paste(sheets[slug].crop((i * TS, 0, i * TS + TS, TS)), (c * TS, r * TS))
            elif spec["kind"] == "fill":
                v = K.h16(c, r, 9) % (sheets[slug].width // TS)
                img.paste(sheets[slug].crop((v * TS, 0, v * TS + TS, TS)), (c * TS, r * TS))
    for im, x, y in under:                   # ground shadows etc., below every prop
        img.alpha_composite(im, (x, y))
    if night:                                # lamp light pools on the ground
        for slug, c, r in props:
            spec = PROPS.get(slug, {})
            if spec.get("lamp"):
                w, h = spec["cells"]
                tint = spec["lamp"] if isinstance(spec["lamp"], tuple) else (255, 210, 120)
                gl = K.glow_sprite(tint)
                cx, cy = c * TS + w * TS // 2, (r - h + 1) * TS + 6
                img.alpha_composite(gl, (max(0, cx - gl.width // 2), max(0, cy - gl.height // 2)))
    shade = ground_shade(ground)
    if night:
        dot = Image.new("RGBA", (1, 1), shade + (255,))
        shade = K.night(dot).getpixel((0, 0))[:3]
    resolved = {}

    def sheet_of(key):                       # prop sheet with the shade of THIS scene's ground
        if key not in resolved:
            resolved[key] = keyed_shade(sheets[key].copy(), shade)
        return resolved[key]
    fgrid = [["." for _ in range(W)] for _ in range(H)]
    for f in fences:
        fgrid[f[1]][f[0]] = f[2] if len(f) > 2 else "fence"
    items = [((r + 1) * TS, c * TS, "f", f[2] if len(f) > 2 else "fence", (c, r)) for f in fences for c, r in [f[:2]]]
    for slug, c, r in props:
        items.append(((r + 1) * TS, c * TS, "p", slug, (c, r)))
    for k, (im, x, y) in enumerate(overlays):
        items.append((y + im.height, x, "o", k, None))
    for bottom, x, kind, key, cr in sorted(items, key=lambda t: (t[0], t[1])):
        if kind == "f":
            c, r = cr
            m = K.cross_mask(fgrid, c, r, lambda q, key=key: q == key)
            img.alpha_composite(sheet_of(key).crop((m * TS, 0, m * TS + TS, TS)), (c * TS, r * TS))
        elif kind == "p":
            c, r = cr
            w, h = PROPS[key]["cells"]
            img.alpha_composite(sheet_of(key), (c * TS, (r - h + 1) * TS))
        else:
            im, ox, oy = overlays[key]
            img.alpha_composite(im, (max(0, ox), max(0, oy)))
    return img


def gym_layers(g, night):
    """(under, overlays) for a gym scene: its ground shadow, its structure and Pokémon sprites,
    all taken straight from the #FF00FF sheets with the magenta keyed out."""
    repo = os.path.abspath(os.path.join(ROOT, "..", ".."))
    t = g["type"]
    sdir = os.path.join(repo, "assets", "structures", "Battle", f"gym-{t}")
    sheet = Image.open(os.path.join(sdir, f"gym-{t}-structure.png"))
    cell = sheet.height                      # square cells: Day (| Night when drawn with --night)
    box = (cell, 0, cell * 2, cell) if (night and sheet.width >= 2 * cell) else (0, 0, cell, cell)
    c, r = g["structure_at"]                 # top-left cell of the gym's 8x8-metatile structure canvas
    ground = Image.open(os.path.join(sdir, f"gym-{t}-ground.png")).convert("RGBA").crop(box)
    under = [(ground.resize((cell // 2, cell // 2), Image.NEAREST), c * TS, r * TS)]
    over = [(load_keyed(os.path.join(sdir, f"gym-{t}-structure.png"), box), c * TS, r * TS)]
    for (path, col, row, sc, sr) in g.get("sprites", ()):
        sp = load_keyed(os.path.join(repo, path), (col * 192, row * 192, col * 192 + 192, row * 192 + 192))
        over.append((sp, sc * TS, sr * TS))
    return under, over


def overlay_sheets(night=False):
    """Transparent-outside first frame of every blob terrain (cached)."""
    key = "night" if night else "day"
    if key not in _OV:
        d = {}
        for slug, spec in TERRAIN.items():
            if spec["kind"] == "blob":
                fr = build_terrain(slug, overlay=True)[0]
                d[slug] = night_of(slug, fr) if night else fr
        _OV[key] = d
    return _OV[key]


_OV = {}


def render_gym(gtype, sheets, nsheets):
    """Gym review: the gym's own `ground` fill as the base (never the generic lawn) and every
    blob terrain laid on it as an overlay."""
    g = dict(GYMS[gtype]["scene"], type=gtype)
    out = []
    for night, sh in ((False, sheets), (True, nsheets))[:2 if NIGHT else 1]:
        under, over = gym_layers(g, night)
        out.append(render_scene(sh, g["scene"], g.get("chars"), g.get("props", []), g.get("fences", []),
                                over, night, under, ground=g.get("ground"), ov_sheets=overlay_sheets(night)))
    return out


# ---------------------------------------------------------------- catalog
def catalog(day_imgs):
    rows = []
    for name, im in day_imgs:
        rows.append((name, im))
    gap = 6
    colw = max(im.width for _, im in rows)
    H = sum(im.height for _, im in rows) + gap * (len(rows) + 1)
    sheet = Image.new("RGBA", (colw * 2 + gap * 3, H), (30, 28, 38, 255))
    y = gap
    for name, im in rows:
        sheet.alpha_composite(im, (gap, y))
        if NIGHT:
            sheet.alpha_composite(night_of(name, im), (colw + gap * 2, y))
        y += im.height + gap
    return sheet if NIGHT else sheet.crop((0, 0, colw + gap * 2, H))


def side_by_side(day, nite=None):
    if nite is None:
        return K.up(day)
    sc = Image.new("RGBA", (day.width * 2 + 8, day.height), (24, 20, 30, 255))
    sc.paste(day, (0, 0))
    sc.paste(nite, (day.width + 8, 0))
    return K.up(sc)


def write_index():
    """assets/overworld/index.json: every piece with its owner (base or gym), kind and folder (merged across runs)."""
    path = os.path.join(ROOT, "index.json")
    old = {}
    if os.path.exists(path):
        import json
        old = {e["slug"]: e for e in json.load(open(path))["pieces"]}
    for e in INDEX:
        old[e["slug"]] = e
    for e in old.values():                   # one separator on every OS, so the index does not churn
        e["dir"] = e["dir"].replace("\\", "/")
    K.write_json(path, {"note": "Assemble maps from the files in each piece folder; _preview/ holds look-only scenes.",
                        "pieces": sorted(old.values(), key=lambda e: (e["owner"] != "base", e["owner"], e["type"], e["slug"]))})


def catalog_grid(imgs, width=400, gap=6):
    """Pieces packed left to right in rows (a cave style has ~40 pieces: a single column is too tall)."""
    rows, row, w = [], [], gap
    for name, im in imgs:
        if row and w + im.width + gap > width:
            rows.append(row)
            row, w = [], gap
        row.append(im)
        w += im.width + gap
    rows.append(row)
    H = sum(max(im.height for im in r) for r in rows) + gap * (len(rows) + 1)
    sheet = Image.new("RGBA", (width, H), (30, 28, 38, 255))
    y = gap
    for r in rows:
        x = gap
        for im in r:
            sheet.alpha_composite(im, (x, y))
            x += im.width + gap
        y += max(im.height for im in r) + gap
    return sheet


def cave_style_of(slug):
    """The cave style a cave piece belongs to (its slug prefix, or the cave-mouth suffix)."""
    for st in cave.STYLE:
        if slug.startswith(f"{st}-cave-") or slug == f"cave-mouth-{st}":
            return st
    return None


def render_caves(cat, sheets):
    """_preview/catalog-cave-<style>.png and review-cave-<style>.png (look only)."""
    ov = overlay_sheets()
    for st in cave.STYLE:
        mine = [(k, im) for k, im in cat if k in CAVE and cave_style_of(k) == st]
        if mine:
            K.up(catalog_grid(mine)).save(os.path.join(PREVIEW, f"catalog-cave-{st}.png"))
        if st in cave_regions.SCENES:
            rows, chars, props, fences, ground = cave_regions.scene(st)
        else:
            (rows, chars, props, ground), fences = cave.scene(st), []
        K.up(render_scene(sheets, rows, chars, props, fences, ground=ground, ov_sheets=ov)).save(
            os.path.join(PREVIEW, f"review-cave-{st}.png"))


def main(argv):
    """all | <slug ...> | --gym <type> (only that gym's pieces + catalog-gym-<type> + review-gym-<type>)
    | --cave (only the cave pieces + catalog-cave-<style> + review-cave-<style>)."""
    global NIGHT
    NIGHT = "--night" in argv
    argv = [a for a in argv if a != "--night"]
    os.makedirs(PREVIEW, exist_ok=True)
    gym = None
    caves = "--cave" in argv
    argv = [a for a in argv if a != "--cave"]
    if "--gym" in argv:
        gym = argv[argv.index("--gym") + 1]
        if gym not in GYMS:
            raise SystemExit(f"no pieces/gym_{gym}.py")
    want = [a for a in argv if a not in ("all", "--gym", gym)]
    terr = GYMS[gym]["terrain"] if gym else list(CAVE_TERRAIN) if caves else list(TERRAIN)
    props = GYMS[gym]["props"] if gym else list(CAVE_PROPS) if caves else list(PROPS)
    sheets, cat = {}, []
    for slug in TERRAIN:                      # every sheet is needed to paint scenes
        frames = build_terrain(slug)
        sheets[slug] = frames[0]
        if slug in terr and (not want or slug in want):
            save_terrain(slug, frames)
            print("terrain", slug, f"{len(frames)} frame(s)")
            cat.append((slug, frames[0]))
    for slug in PROPS:
        frames = prop_frames(slug)
        sheets[slug] = prop_frames(slug, resolve=False)[0]     # scenes paint their own ground's shade
        if slug in props and (not want or slug in want):
            save_prop(slug, frames)
            print("prop   ", slug, f"{len(frames)} frame(s)")
            cat.append((slug, frames[0]))
    nsheets = {k: night_of(k, v) for k, v in sheets.items()}
    if gym:
        K.up(catalog(cat)).save(os.path.join(PREVIEW, f"catalog-gym-{gym}.png"))
        if GYMS[gym]["scene"]:
            side_by_side(*render_gym(gym, sheets, nsheets)).save(os.path.join(PREVIEW, f"review-gym-{gym}.png"))
        write_index()
        print("wrote gym", gym)
        return
    if caves:
        render_caves(cat, sheets)
        write_index()
        print("wrote caves")
        return
    base_cat = [(k, im) for k, im in cat if k in BASE_TERRAIN or k in BASE_PROPS]
    if want:                                     # slug-only run: pieces only, previews stay as they are
        write_index()
        print("wrote", ", ".join(want))
        return
    K.up(catalog(base_cat)).save(os.path.join(PREVIEW, "catalog.png"))
    side_by_side(render_scene(sheets), render_scene(nsheets, night=True) if NIGHT else None).save(
        os.path.join(PREVIEW, "review-scene.png"))
    K.up(render_scene(sheets, NATURE_SCENE, NATURE_CHARS, NATURE_PROPS, [])).save(
        os.path.join(PREVIEW, "review-nature.png"))
    for g in GYMS:
        gcat = [(k, im) for k, im in cat if k in GYMS[g]["terrain"] or k in GYMS[g]["props"]]
        if gcat:                                 # a slug-only run leaves the other catalogs as they are
            K.up(catalog(gcat)).save(os.path.join(PREVIEW, f"catalog-gym-{g}.png"))
        if GYMS[g]["scene"]:
            side_by_side(*render_gym(g, sheets, nsheets)).save(os.path.join(PREVIEW, f"review-gym-{g}.png"))
    write_index()
    print("wrote", ROOT)


if __name__ == "__main__":
    main(sys.argv[1:])
