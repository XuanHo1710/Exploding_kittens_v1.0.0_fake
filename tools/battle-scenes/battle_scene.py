#!/usr/bin/env python3
"""
Mons Battle Scenes: the still picture behind the separate Gen 3-style battle screen
(docs/adr/0001-gen3-battle-screen.md, spec docs/explanation/research/gen3-battle-scenes.md §4).

  python3 battle_scene.py [district ...] [--preview] [--mock-all]

One scene per District x terrain x kind (wild / trainer) plus one per gym, at the Gen 3 frame
240x160 exported x2. Layers are drawn separately (backdrop, ground, opponent platform, player
platform, props) and composed into <scene>.png with the text-box band (y >= 112) left clear.
Colours come from each District's own pieces (overworld biome.py ramps), so a battle reads as the
place it started in.

Output: assets/battle-scenes/<district>/<scene>.png and assets/battle-scenes/<district>/layers/<scene>-<layer>.png,
assets/battle-scenes/_preview/ (contact sheets and mock battles with Pokémon; look only).
"""
import colorsys
import glob
import math
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "../.."))
OW = os.path.join(REPO, "tools", "overworld")
sys.path.insert(0, OW)
sys.path.insert(0, os.path.join(OW, "pieces"))
import gen_overworld as GO  # noqa: E402
import overworld_kit as K  # noqa: E402
import biome as BI  # noqa: E402

W, H = 240, 160
BAND = 112                       # text box band starts here: never painted
HORIZON = 40
OPP = (176, 64)                  # platform ellipse centres, 128x32 (pret measurements)
PLY = (64, 116)
PLAT_R = (63, 15)                # platform ellipse radii
SUFFIX = ""                      # file-name suffix of the frame ("" = gba, "-wide")
OUT = os.path.join(REPO, "assets", "battle-scenes")

# Frames: "gba" = the pret 240x160 screen; "wide" = the Mons widescreen (decision §10): 390x180 covers
# the phone screen (19.5:9) and the PC screen (16:9) shows its centre 320 columns (x 35..354). Framed
# further back so more of the place shows: smaller platforms set wider apart, horizon a little higher,
# and the ground stops where the UI dock starts (y 128).
FRAMES = {
    "gba": dict(W=240, H=160, BAND=112, HORIZON=40, OPP=(176, 64), PLY=(64, 116), PLAT_R=(63, 15), SUFFIX=""),
    "wide": dict(W=390, H=180, BAND=128, HORIZON=44, OPP=(271, 76), PLY=(127, 114), PLAT_R=(46, 11), SUFFIX="-wide"),
}
PC_CROP = (35, 0, 355, 180)      # the PC view inside a wide scene


def set_frame(name):
    globals().update(FRAMES[name])


def SX(x):
    """An x position designed on the 240 px frame, spread to the current width."""
    return int(round(x * W / 240))

DISTRICTS = {                    # district -> (gym type or None, sky, landscape)
    "meadow": (None, (214, 234, 248), "hills"),
    "garden": ("grass", (222, 238, 248), "hedges"),
    "powerplant": ("electric", (218, 228, 236), "pylons"),
    "mystic": ("psychic", (232, 226, 246), "stones"),
    "lagoon": ("water", (210, 236, 250), "sea"),
    "volcano": ("fire", (240, 228, 216), "volcano"),
    "quarry": ("rock", (222, 226, 230), "cliffs"),
    "canyon": ("ground", (246, 234, 212), "mesas"),
    "marsh": ("poison", (220, 230, 222), "deadwood"),
    "moon-cave": (None, (40, 44, 64), "cave"),         # cave Districts: only cave scenes, from the cave's own pieces
    "granite-cave": (None, (60, 40, 44), "cave"),
    "volcano-cave": (None, (52, 34, 40), "cave"),      # regional caves D-I (docs/explanation/cave-regions.md)
    "quarry-cave": (None, (44, 42, 52), "cave"),
    "mystic-cave": (None, (50, 44, 82), "cave"),
    "lagoon-cave": (None, (28, 50, 66), "cave"),
    "powerplant-cave": (None, (40, 42, 56), "cave"),
    "garden-cave": (None, (44, 40, 40), "cave"),
}
CAVE = {d: d[:-5] for d in DISTRICTS if d.endswith("-cave")}  # District -> tools/overworld/pieces/cave.py style
TERRAINS = ["tall-grass", "path", "sand", "water", "cave", "indoor"]
PROPS = {
    "meadow": ["street-lamp", "sign", "fence"], "garden": ["grass-topiary", "grass-bud-lantern", "grass-fern-urn"],
    "powerplant": ["electric-power-pole", "electric-hazard-cone", "electric-beacon"],
    "mystic": ["psychic-obelisk", "psychic-star-lamp", "psychic-crystal"],
    "lagoon": ["water-shell-lamp", "water-bollard", "water-anchor"],
    "volcano": ["fire-brazier", "fire-obsidian-spire", "fire-lava-rock"],
    "quarry": ["rock-cairn-lantern", "rock-menhir", "rock-minecart"],
    "canyon": ["ground-totem", "ground-saguaro", "ground-clay-pots"],
    "marsh": ["poison-mushroom-lamp", "poison-cattails", "poison-toadstools"],
    "moon-cave": [], "granite-cave": [],
    "volcano-cave": ["volcano-cave-basalt-columns", "volcano-cave-ember-rock", "volcano-cave-obsidian"],
    "quarry-cave": ["quarry-cave-lantern", "quarry-cave-cart-ore", "quarry-cave-ore-crystal"],
    "mystic-cave": ["mystic-cave-crystal", "mystic-cave-star-stone", "mystic-cave-icicle"],
    "lagoon-cave": ["lagoon-cave-coral-fan", "lagoon-cave-barnacle-rock", "lagoon-cave-coral"],
    "powerplant-cave": ["powerplant-cave-generator-lamp", "powerplant-cave-panel", "powerplant-cave-transformer"],
    "garden-cave": ["garden-cave-glowshroom", "garden-cave-fern", "garden-cave-flowers"],
}


# ---------------------------------------------------------------- colour
def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a[:3], b[:3]))


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def ramps(district):
    t = DISTRICTS[district][0]
    g = BI.GROUND.get(t, {}) if t else {}
    lawn = [BI._tint(c, g.get("lawn")) for c in K.GRASS] if g else [tuple(c) for c in K.GRASS]
    path = [BI._tint(c, g.get("path")) for c in K.DIRT] if g.get("path") else [tuple(c) for c in K.DIRT]
    leaf = BI.RAMPS[t] if t else [tuple(c) for c in K.LEAF]
    accent = BI.EMBLEM_COLS[t] if t else [(238, 92, 120), (190, 52, 92), (120, 40, 60)]
    sand = [tuple(c) for c in K.SAND]
    if t == "ground":
        sand = [mix(c, path[1], 0.35) for c in sand]
    return dict(lawn=lawn, path=path, leaf=leaf, accent=accent, sand=sand, water=[tuple(c) for c in K.WATER],
                rock=[tuple(c) for c in K.CLIFF], stone=[tuple(c) for c in K.STONE], wood=[tuple(c) for c in K.WOOD],
                sky=DISTRICTS[district][1])


def h(x, y, s=0):
    return K.h16(x, y, s)


# ---------------------------------------------------------------- District pieces (16 px tiles)
_TILES = {}


def slug_for(district, role):
    t = DISTRICTS[district][0]
    base = {"lawn": "grass", "path": "dirt-path", "tall-grass": "tall-grass", "tree-wall": "tree-wall"}[role]
    if t:
        cand = {"lawn": f"{t}-lawn", "path": f"{t}-path", "tall-grass": f"{t}-tall-grass", "tree-wall": f"{t}-tree-wall"}[role]
        if cand in GO.TERRAIN:
            return cand
    return base


def tile(slug, kind="interior", v=0):
    """One 16 px tile of an overworld piece: a fill variant, a blob interior, or a blob edge."""
    key = (slug, kind, v)
    if key not in _TILES:
        sheet = GO.build_terrain(slug)[0]
        spec = GO.TERRAIN[slug]
        if spec["kind"] == "fill":
            n = sheet.width // 16
            _TILES[key] = sheet.crop(((v % n) * 16, 0, (v % n) * 16 + 16, 16)).convert("RGBA")
        elif spec["kind"] == "quad":
            _TILES[key] = sheet.convert("RGBA")                       # the whole 2x2 tree block
        else:
            mask = {"interior": 255, "south": K.N | K.E | K.W | K.NE | K.NW,
                    "north": K.S | K.E | K.W | K.SE | K.SW}[kind]
            _TILES[key] = K.blob_tile(sheet, mask).convert("RGBA")
    return _TILES[key]


def terrain_tile(district, terrain, v=0):
    return {"tall-grass": lambda: tile(slug_for(district, "tall-grass")),
            "path": lambda: tile(slug_for(district, "path")),
            "sand": lambda: tile("sand"),
            "water": lambda: tile("water"),
            "cave": lambda: tile(f"{CAVE[district]}-cave-floor", v=v) if district in CAVE else tile("mountain"),
            "indoor": lambda: tile("paved-path"),
            "lawn": lambda: tile(slug_for(district, "lawn"), v=v)}[terrain]()


def tint_img(im, hsv):
    if not hsv:
        return im
    im = im.copy()
    p = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = p[x, y]
            if a:
                p[x, y] = BI._tint((r, g, b), hsv) + (a,)
    return im


# ---------------------------------------------------------------- backdrop: flat Gen 3 sky + the District's own horizon
def backdrop(district, terrain, R):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    t = DISTRICTS[district][0]
    if terrain == "cave":                                    # rock wall: the mountain face, tiled
        face, top = tile("mountain", "south"), tile("mountain")
        if district in CAVE:                                 # the cave's own rock top and face
            face, top = tile(f"{CAVE[district]}-cave-wall", "south"), tile(f"{CAVE[district]}-cave-wall")
        for y in range(0, HORIZON, 16):
            for x in range(0, W, 16):
                im.alpha_composite(top if y < HORIZON - 16 else face, (x, y))
        return im
    if terrain == "indoor":                                  # plaster wall, timber skirting, two windows
        wall = mix(R["wood"][0], (250, 246, 236), 0.55)
        d.rectangle([0, 0, W - 1, HORIZON - 1], fill=wall)
        for x in range(0, W, 32):
            d.line([(x, 0), (x, HORIZON - 6)], fill=mix(wall, R["wood"][1], 0.35))
        d.rectangle([0, HORIZON - 6, W - 1, HORIZON - 1], fill=R["wood"][2])
        d.line([(0, HORIZON - 6), (W, HORIZON - 6)], fill=R["wood"][1])
        for x in (SX(36), SX(188)):
            d.rectangle([x, 8, x + 16, 26], fill=mix(R["sky"], (255, 255, 255), 0.4), outline=R["wood"][3])
            d.line([(x + 8, 8), (x + 8, 26)], fill=R["wood"][3])
            d.line([(x, 17), (x + 16, 17)], fill=R["wood"][3])
        return im
    sky = R["sky"]
    bands = [mix(sky, (176, 206, 236), 0.35), mix(sky, (200, 222, 244), 0.2), sky, mix(sky, (255, 255, 255), 0.45)]
    for k, c in enumerate(bands):                            # Gen 3: a few flat bands, lightest at the horizon
        d.rectangle([0, k * 8, W - 1, HORIZON - 1 if k == 3 else k * 8 + 7], fill=c)
    kind = DISTRICTS[district][2]
    if terrain == "water":
        kind = "sea"
    hz = HORIZON
    if kind == "sea":
        sea = tile("shore")
        for x in range(0, W, 16):
            im.alpha_composite(sea.crop((0, 8, 16, 16)), (x, hz - 8))
        for cx, w in ((SX(40), 34), (SX(186), 22)):                  # far islands: outlined, 2 tones
            far = mix(R["leaf"][2], sky, 0.5)
            d.rounded_rectangle([cx - w // 2, hz - 13, cx + w // 2, hz - 7], 3, fill=far, outline=mix(far, R["leaf"][4], 0.4))
        return im
    if kind in ("volcano", "cliffs", "mesas"):               # far silhouette, then a band of the District's rock
        far = mix(R["rock"][2], sky, 0.55)
        edge = mix(R["rock"][3], sky, 0.35)
        if kind == "volcano":
            c0 = SX(150)
            pts = [(c0 - 80, hz - 8), (c0 - 12, hz - 36), (c0 + 12, hz - 36), (c0 + 80, hz - 8)]
            d.polygon(pts + [(c0 + 80, hz), (c0 - 80, hz)], fill=far, outline=edge)
            d.line([(c0 - 12, hz - 36), (c0 + 12, hz - 36)], fill=mix(R["accent"][1], sky, 0.2), width=2)
            d.ellipse([c0 - 10, 0, c0 + 14, 12], fill=mix((210, 206, 206), sky, 0.3), outline=mix((170, 166, 166), sky, 0.3))
        elif kind == "mesas":
            for x0, w, top in ((SX(6), 50, 22), (SX(90), 34, 14), (SX(156), 60, 26)):
                d.rectangle([x0, hz - top, x0 + w, hz - 6], fill=mix(R["path"][2], sky, 0.5), outline=mix(R["path"][4], sky, 0.35))
        else:
            for x0, w, top in ((SX(0), 40, 20), (SX(40), 30, 28), (SX(70), 46, 16), (SX(150), 40, 26), (SX(190), 50, 18)):
                d.rectangle([x0, hz - top, x0 + w, hz - 6], fill=far, outline=edge)
        near = mix(R["rock"][2] if kind != "mesas" else R["path"][2], sky, 0.3)
        for x in range(W):                                    # a low rolling foot of the hills, no wall
            y1 = hz - 6 - 3 * math.sin(x / 17.0) - 2 * math.sin(x / 7.0 + 1)
            d.line([(x, y1), (x, hz)], fill=near)
            d.point((x, y1), fill=mix(near, (255, 255, 255), 0.25))
    else:                                                     # a tree line of the District's own 2x2 trees
        trees = tile(slug_for(district, "tree-wall"))
        if kind == "pylons":
            poles = (SX(28), SX(120), SX(212))
            for px in poles:
                d.line([(px, hz - 34), (px, hz - 8)], fill=mix((96, 100, 112), sky, 0.45), width=2)
                d.line([(px - 7, hz - 30), (px + 7, hz - 30)], fill=mix((96, 100, 112), sky, 0.45))
            for a, b in ((poles[0], poles[1]), (poles[1], poles[2])):
                for k in range(a, b):
                    tt = (k - a) / (b - a)
                    d.point((k, hz - 30 + int(6 * math.sin(math.pi * tt))), fill=mix((96, 100, 112), sky, 0.5))
        if kind == "stones":
            for x in range(W):                                # pale far peaks behind the trees
                y1 = hz - 22 - 8 * abs(math.sin(x / 41.0))
                d.line([(x, y1), (x, hz - 12)], fill=mix(R["stone"][1], sky, 0.55))
        far = tint_img(trees, None)
        for x in range(-8, W, 32):                            # back row, faded toward the sky
            im.alpha_composite(fade(far, sky, 0.45), (x, hz - 30))
        for x in range(-24, W, 32):                           # front row, crisp
            im.alpha_composite(far, (x, hz - 20))
        if kind == "deadwood":
            for tx in (SX(22), SX(132), SX(210)):
                d.line([(tx, hz - 30), (tx, hz - 14)], fill=mix((84, 72, 72), sky, 0.35), width=2)
                d.line([(tx, hz - 24), (tx + 6, hz - 29)], fill=mix((84, 72, 72), sky, 0.35))
                d.line([(tx, hz - 20), (tx - 5, hz - 25)], fill=mix((84, 72, 72), sky, 0.35))
    return im


def fade(im, colour, t):
    im = im.copy()
    p = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = p[x, y]
            if a:
                p[x, y] = mix((r, g, b), colour, t) + (a,)
    return im


# ---------------------------------------------------------------- ground: the District's own tiles, lit toward the horizon
def ground(terrain, R, kind, district=None):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for y in range(HORIZON, BAND, 16):
        for x in range(0, W, 16):
            if terrain == "tall-grass":                      # a lawn field; tall grass lives on the platforms
                tl = terrain_tile(district, "lawn", v=K.h16(x // 16, y // 16, 9))
            else:
                tl = terrain_tile(district, terrain, v=K.h16(x // 16, y // 16, 9)) if district in CAVE \
                    else terrain_tile(district, terrain)
            im.alpha_composite(tl, (x, y))
    # Gen 3 depth: the two rows next to the horizon are a step lighter
    band = Image.new("RGBA", (W, 16), (255, 255, 255, 0))
    top = fade(im.crop((0, HORIZON, W, HORIZON + 16)), (255, 255, 255), 0.18)
    im.alpha_composite(top, (0, HORIZON))
    if kind == "trainer" and terrain in ("tall-grass", "path", "sand"):
        lane = terrain_tile(district, "path")                 # a trodden lane between the two spots
        mask = Image.new("L", (W, H), 0)
        md = ImageDraw.Draw(mask)
        for k in range(0, 101):
            x = PLY[0] + (OPP[0] - PLY[0]) * k / 100
            y = PLY[1] - 8 + (OPP[1] + 4 - (PLY[1] - 8)) * k / 100
            r = (9 - 4 * k / 100) * PLAT_R[0] / 63
            md.ellipse([x - r * 1.9, y - r * 0.55, x + r * 1.9, y + r * 0.55], fill=255)
        lane_full = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for y in range(HORIZON, BAND, 16):
            for x in range(0, W, 16):
                lane_full.alpha_composite(lane, (x, y))
        mp = mask.load()                                      # soft edge: a 2 px checker, never a hard cut
        lp = lane_full.load()
        p = im.load()
        for y in range(HORIZON, BAND):
            for x in range(W):
                if mp[x, y] and (mp.get(x - 2, y) if False else True):
                    inner = all(mp[min(W - 1, max(0, x + dx)), min(H - 1, max(0, y + dy))] for dx, dy in ((2, 0), (-2, 0), (0, 1), (0, -1)))
                    if inner or (x + y) % 2 == 0:
                        p[x, y] = lp[x, y]
    return im


# ---------------------------------------------------------------- platforms: a disc with depth, lit top-left, coloured outline
def disc(centre, top_tile, ramp, rim_light=None, ring=None, thickness=5):
    """An Emerald-style platform: an ellipse top textured with a tile, a lit top-left rim, a darker side
    face `thickness` px deep, an outline in the material's darkest tone, and a soft contact shade."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cx, cy = centre
    rx, ry = PLAT_R

    def inside(x, y, dy=0, sx=0):
        return ((x + 0.5 - cx) / (rx - sx)) ** 2 + ((y + 0.5 - cy - dy) / (ry - sx * 0.25)) ** 2 <= 1
    p = im.load()
    tp = top_tile.load()
    for y in range(cy - ry - 1, cy + ry + thickness + 3):
        for x in range(cx - rx - 1, cx + rx + 2):
            if not (0 <= x < W and 0 <= y < H):
                continue
            top = inside(x, y, -thickness // 2)
            side = inside(x, y, thickness - thickness // 2) and not top
            if top:
                c = tp[x % 16, y % 16][:3]
                if not inside(x, y, -thickness // 2, 1.5):    # rim: outline, lit top-left, darker bottom-right
                    up = y < cy - thickness // 2
                    c = ramp[4] if not (up and x < cx + 20) else (rim_light or ramp[0])
                elif not inside(x, y, -thickness // 2, 3) and y < cy - thickness // 2 and x < cx:
                    c = mix(c, rim_light or ramp[0], 0.5)
                p[x, y] = c + (255,)
            elif side:
                edge = not inside(x, y, thickness - thickness // 2, 1.5)
                c = ramp[4] if edge else (ramp[3] if (x // 3 + y) % 5 else ramp[4])
                p[x, y] = c + (255,)
            elif inside(x, y, thickness + 2, -2) and (x + y) % 2 == 0:   # contact shade, dithered
                p[x, y] = ramp[4] + (255,)
    if ring:
        d = ImageDraw.Draw(im)
        k = PLAT_R[0] / 63
        d.ellipse([cx - int(44 * k), cy - thickness // 2 - int(9 * k), cx + int(44 * k), cy - thickness // 2 + int(9 * k)],
                  outline=ring)
    return im


def platform(centre, terrain, kind, R, gym=None, district=None):
    if gym is not None:
        floor_tile, accent = gym                              # calm stone tinted to the gym floor, ring in the gym colour
        cols = sorted(floor_tile.convert("RGB").getcolors(256), reverse=True)
        base = mix(cols[0][1], (236, 236, 236), 0.55)
        stone = tile("paved-path")
        top = fade(stone, base, 0.45)
        ramp = [mix(base, (255, 255, 255), 0.5), base, mix(base, (60, 60, 80), 0.2), mix(base, (40, 40, 60), 0.45),
                mix(base, (24, 24, 40), 0.65)]
        return disc(centre, top, ramp, rim_light=accent[0], ring=accent[1], thickness=6)
    if kind == "trainer":
        if terrain == "water":                                # a raft of planks
            planks = Image.new("RGBA", (16, 16), R["wood"][1] + (255,))
            dp = ImageDraw.Draw(planks)
            for x in (0, 8):
                dp.line([(x, 0), (x, 15)], fill=R["wood"][2])
            dp.line([(4, 3), (4, 4)], fill=R["wood"][0])
            return disc(centre, planks, R["wood"][:4] + [mix(R["wood"][3], (20, 20, 30), 0.4)], thickness=4)
        top = tile("paved-path") if terrain != "indoor" else tile("paved-path")
        st = R["stone"]
        return disc(centre, top, [st[0], st[1], st[2], st[3], st[4]], ring=mix(st[0], (255, 255, 240), 0.5), thickness=5)
    # wild: a natural mound in the terrain's own material
    if terrain == "water":                                   # ripples on open water, no solid platform
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        cx, cy = centre
        for k, c in ((0, R["water"][0]), (10, R["water"][2]), (20, R["water"][0])):
            q = PLAT_R[0] / 63
            d.ellipse([cx - int((60 - k) * q), cy - int((13 - k // 3) * q), cx + int((60 - k) * q), cy + int((13 - k // 3) * q)],
                      outline=c)
        return im
    if terrain == "cave" and district in CAVE:              # a mound of the cave floor, rimmed in its rock
        import cave as CV
        st = CV.STYLE[CAVE[district]]
        return disc(centre, tile(f"{CAVE[district]}-cave-floor"), st["floor"][:4] + [st["out"]], thickness=6)
    top = {"tall-grass": tile(slug_for(district, "tall-grass")), "path": tile(slug_for(district, "path")),
           "sand": tile("sand"), "cave": tile("mountain"), "indoor": tile("paved-path")}[terrain]
    mat = {"tall-grass": R["lawn"], "path": R["path"], "sand": R["sand"], "cave": R["rock"], "indoor": R["stone"]}[terrain]
    return disc(centre, top, mat, thickness=6 if terrain != "sand" else 4)


# ---------------------------------------------------------------- props (trainer)
def props_layer(district, R):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    names = [n for n in PROPS[district] if n in GO.PROPS]
    shade = mix(R["lawn"][3], (0, 0, 0), 0.1)
    if district in CAVE:                                      # cave props stand on the cave floor
        import cave as CV
        shade = CV.STYLE[CAVE[district]]["floor"][3]
    spots = [(6, BAND - 16), (22, BAND - 18), (SX(214), HORIZON + 4)]   # zone A (left), zone B (right, far)
    for (x, y), name in zip(spots, names):
        if GO.PROPS[name].get("kind") == "cross":
            continue
        fr = GO.keyed_shade(GO.prop_frames(name, resolve=False)[0].copy(), shade)
        im.alpha_composite(fr, (x, y - fr.height))
    return im


# ---------------------------------------------------------------- gym
def gym_parts(t):
    path = os.path.join(REPO, "assets", "structures", "Battle", f"gym-{t}", f"gym-{t}-interior-1F.png")
    src = Image.open(path).convert("RGBA")
    half = src.resize((src.width // 2, src.height // 2), Image.NEAREST)   # 16 px tiles
    wall = half.crop((0, 0, half.width, 48))
    floor_tile = half.crop((half.width // 2 - 8, half.height // 2, half.width // 2 + 8, half.height // 2 + 16))
    colours = sorted(floor_tile.convert("RGB").getcolors(256) or [(1, (128, 128, 128))], reverse=True)
    floor = colours[0][1]
    return wall, floor_tile, floor


def gym_scene(t):
    wall, tile, floor = gym_parts(t)
    acc = BI.EMBLEM_COLS[t]
    back = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for x in range(0, W, wall.width):
        back.paste(wall.crop((0, 0, min(wall.width, W - x), 48)), (x, -8))
    gr = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for y in range(HORIZON - 4, BAND, 16):
        for x in range(0, W, 16):
            gr.paste(tile, (x, y))
    gp = gr.load()
    for y in range(HORIZON - 4, BAND):                        # soften the floor so the platforms read
        for x in range(W):
            c = gp[x, y]
            gp[x, y] = mix(mix(c, (250, 250, 250), 0.55), floor, 0.2) + (255,)    # calm the pattern
    plat = (tile, acc)
    return back, gr, platform(OPP, None, "gym", None, plat), platform(PLY, None, "gym", None, plat)


# ---------------------------------------------------------------- compose + export
def compose(layers):
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for layer in layers:
        im.alpha_composite(layer)
    px = im.load()
    for y in range(BAND, H):                                  # the text box band stays empty
        for x in range(W):
            px[x, y] = (0, 0, 0, 0)
    return im


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out = K.up(img)
    if SUFFIX:                         # the wider frame holds more props: keep the 13-palette budget
        sys.path.insert(0, os.path.join(REPO, "tools", "gen3"))
        import gen3
        nat = out.resize((out.width // 2, out.height // 2), Image.NEAREST)
        if (gen3.palette_count(nat) or 99) > gen3.MAX_PALETTES:
            nat = gen3.to_gen3(nat, max_palettes=gen3.MAX_PALETTES)
            out = nat.resize((nat.width * 2, nat.height * 2), Image.NEAREST)
    out.save(path)


def build(district):
    R = ramps(district)
    made = []
    for terrain in (["cave"] if district in CAVE else TERRAINS):
        for kind in ("wild", "trainer"):
            if terrain == "indoor" and kind == "wild":
                continue
            name = f"{district}-{terrain}-{kind}{SUFFIX}"
            layers = dict(backdrop=backdrop(district, terrain, R), ground=ground(terrain, R, kind, district),
                          **{"platform-opp": platform(OPP, terrain, kind, R, district=district),
                             "platform-player": platform(PLY, terrain, kind, R, district=district)})
            if kind == "trainer" and (terrain not in ("indoor", "cave", "water") or PROPS[district]):
                layers["props"] = props_layer(district, R)
            for k, v in layers.items():
                save(compose([v]), os.path.join(OUT, district, "layers", f"{name}-{k}.png"))
            save(compose(list(layers.values())), os.path.join(OUT, district, f"{name}.png"))
            made.append(name)
    t = DISTRICTS[district][0]
    if t:
        b, g, po, pp = gym_scene(t)
        name = f"{district}-gym{SUFFIX}"
        for k, v in dict(backdrop=b, ground=g, **{"platform-opp": po, "platform-player": pp}).items():
            save(compose([v]), os.path.join(OUT, district, "layers", f"{name}-{k}.png"))
        save(compose([b, g, po, pp]), os.path.join(OUT, district, f"{name}.png"))
        made.append(name)
    return made


# ---------------------------------------------------------------- preview: a mock battle
def posses_frame(name, col):
    hits = glob.glob(os.path.join(REPO, "assets", "units", "*", f"*-{name}", f"{name.lower()}-posses.png"))
    if not hits:
        return None
    sh = Image.open(hits[0]).convert("RGBA")
    cell = sh.width // 8
    im = sh.crop((col * cell, 0, col * cell + cell, cell))
    p = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = p[x, y]
            if (r - g) > 80 and (b - g) > 80 and r > 120 and b > 120:
                p[x, y] = (0, 0, 0, 0)
    im = im.resize((64, 64), Image.LANCZOS)                   # 192 -> 64, the Gen 3 battle sprite size
    im.putalpha(im.split()[3].point(lambda v: 255 if v >= 128 else 0))
    return im


def mock(scene_path, opp="Gengar", ply="Pikachu"):
    """The scene with two Pokémon on their platforms and placeholder HP boxes and text box (no text)."""
    base = Image.open(scene_path).convert("RGBA").resize((W, H), Image.NEAREST)
    o = posses_frame(opp, 7)                                  # down-left: 3/4 front, facing the player
    pl = posses_frame(ply, 4)                                 # up: full back view
    if o:                                                     # centre the drawn body, feet a little behind the middle
        bb = o.getbbox()
        base.alpha_composite(o, (OPP[0] - (bb[0] + bb[2]) // 2, OPP[1] + 4 - bb[3]))
    if pl:
        bb = pl.getbbox()
        base.alpha_composite(pl, (PLY[0] - (bb[0] + bb[2]) // 2, BAND - 1 - bb[3]))
    d = ImageDraw.Draw(base)
    ink, paper = (40, 48, 56), (248, 248, 232)
    for (x0, y0, x1, y1) in ((13, 16, 112, 43), (127, 74, 229, 109)):
        d.rounded_rectangle([x0, y0, x1, y1], 4, fill=paper, outline=ink)
        d.rectangle([x0 + 30, y1 - 12, x1 - 8, y1 - 8], fill=ink)
        d.rectangle([x0 + 32, y1 - 11, x1 - 26, y1 - 9], fill=(88, 208, 128))
        d.rectangle([x0 + 8, y0 + 6, x0 + 46, y0 + 9], fill=mix(ink, paper, 0.6))   # name bar, no letters
    d.rectangle([0, BAND, W - 1, H - 1], fill=(40, 80, 104))
    d.rounded_rectangle([4, BAND + 4, W - 5, H - 5], 4, fill=(248, 248, 248), outline=(56, 120, 152))
    return K.up(base)


# Opponents that belong in each District: (wild, trainer, gym); the player's Pokémon stays the same
CAST = {
    "meadow": ("Rattata", "Pidgey", None), "garden": ("Oddish", "Bulbasaur", "Bulbasaur"),
    "powerplant": ("Voltorb", "Magnemite", "Magnemite"), "mystic": ("Abra", "Drowzee", "Gengar"),
    "lagoon": ("Psyduck", "Squirtle", "Squirtle"), "volcano": ("Vulpix", "Charmander", "Charizard"),
    "quarry": ("Geodude", "Machop", "Onix"), "canyon": ("Diglett", "Sandshrew", "Sandshrew"),
    "marsh": ("Ekans", "Grimer", "Grimer"),
    "moon-cave": ("Zubat", "Geodude", None), "granite-cave": ("Zubat", "Machop", None),
    "volcano-cave": ("Slugma", "Magmar", None), "quarry-cave": ("Geodude", "Onix", None),
    "mystic-cave": ("Clefairy", "Jynx", None), "lagoon-cave": ("Shellder", "Seel", None),
    "powerplant-cave": ("Voltorb", "Magnemite", None), "garden-cave": ("Paras", "Oddish", None),
}
CAVE_WILD = "Zubat"


def mock_all(made, ply="Pikachu"):
    """Every scene of every District as a mock battle, one sheet per District (look only)."""
    prev = os.path.join(OUT, "_preview")
    for dname, scenes in made.items():
        tiles = []
        for sc in scenes:
            wild, trainer, gym = CAST[dname]
            opp = gym if sc.endswith("-gym") else trainer if sc.endswith("-trainer") else wild
            if sc.endswith("cave-wild"):
                opp = CAVE_WILD
            tiles.append(mock(os.path.join(OUT, dname, f"{sc}.png"), opp=opp, ply=ply))
        cols = 3
        rows = (len(tiles) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * 488 - 8, rows * 328 - 8), (28, 30, 34))
        for i, t in enumerate(tiles):
            sheet.paste(t.convert("RGB"), ((i % cols) * 488, (i // cols) * 328))
        sheet.save(os.path.join(prev, f"mock-{dname}.png"))
        print("wrote", os.path.join(prev, f"mock-{dname}.png"))


def main(argv):
    frame = next((a.split("=", 1)[1] for a in argv if a.startswith("--frame=")), "gba")
    set_frame(frame)
    names = [a for a in argv if not a.startswith("--")] or list(DISTRICTS)
    made = {}
    for dname in names:
        made[dname] = build(dname)
        print(dname, len(made[dname]), "scenes")
    prev = os.path.join(OUT, "_preview")
    os.makedirs(prev, exist_ok=True)
    for dname, scenes in made.items():                        # one contact sheet per district
        ims = [Image.open(os.path.join(OUT, dname, f"{s}.png")).convert("RGBA") for s in scenes]
        cols = 4
        rows = (len(ims) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * W + (cols - 1) * 8, rows * H + (rows - 1) * 8), (28, 30, 34))
        for i, im in enumerate(ims):
            small = im.resize((W, H), Image.NEAREST)
            bg = Image.new("RGBA", small.size, (28, 30, 34, 255))
            bg.alpha_composite(small)
            sheet.paste(bg.convert("RGB"), ((i % cols) * (W + 8), (i // cols) * (H + 8)))
        sheet.save(os.path.join(prev, f"battle-{dname}{SUFFIX}.png"))
    if "--mock-all" in argv:
        mock_all(made)
    if "--preview" in argv:
        picks = [("meadow", "tall-grass-wild"), ("volcano", "path-trainer"), ("lagoon", "water-wild"),
                 ("mystic", "gym"), ("canyon", "sand-trainer"), ("marsh", "tall-grass-wild"),
                 ("quarry", "cave-wild"), ("powerplant", "gym")]
        tiles = [mock(os.path.join(OUT, dn, f"{dn}-{sc}.png")) for dn, sc in picks if dn in made]
        if tiles:
            sheet = Image.new("RGB", (2 * 480 + 8, ((len(tiles) + 1) // 2) * 328), (28, 30, 34))
            for i, t in enumerate(tiles):
                sheet.paste(t.convert("RGB"), ((i % 2) * 488, (i // 2) * 328))
            sheet.save(os.path.join(prev, "battle-mock.png"))
            print("wrote", os.path.join(prev, "battle-mock.png"))


if __name__ == "__main__":
    main(sys.argv[1:])
