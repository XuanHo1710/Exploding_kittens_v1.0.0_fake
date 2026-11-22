#!/usr/bin/env python3
"""
Mons map generator: theme -> pieces -> one assembled Gen 3-style map.

  python3 mapgen.py themes                      list themes and their briefs
  python3 mapgen.py inventory <theme>           which role pieces exist, which must be created
  python3 mapgen.py world <world.json> [--debug]   build every map of a world, check the seams, write
        Gen 3 connections into each .tmj and an overview <name>.png
  python3 mapgen.py build <spec.map.json> [--debug]
        -> next to the spec: <slug>.png (preview, x2), <slug>.tmj (Tiled), <slug>-objects.tsj,
           <slug>-collision.txt, <slug>-report.md (+ <slug>-debug.png with --debug)
  python3 mapgen.py cave <group> [--dir D]      check every floor of one cave together (kind cave, cavekit.py):
        ladder pairs, landings under holes and cracked floor, every pocket reachable from the mouth and back,
        then the mechanics played from every mouth (Strength, levers, ice, carts; both tides); --dir: maps folder

The spec format is documented in ../references/spec.md. Pieces are rendered with the overworld
generator's own painters (same pixels as assets/overworld/), structures come from assets/structures/ (#FF00FF keyed).
Lint rules follow docs/explanation/research/gen3-map-composition.md.
"""
import glob
import heapq
import json
import math
import os
import random
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "../.."))
OW_SCRIPTS = os.path.join(REPO, "tools", "overworld")
sys.path.insert(0, OW_SCRIPTS)
sys.path.insert(0, os.path.join(OW_SCRIPTS, "pieces"))

import gen_overworld as GO  # noqa: E402
import overworld_kit as K  # noqa: E402

TS = K.CELL                      # 16 px authoring cell; exports are x2
OUT_TS = TS * 2
OVERWORLD = os.path.join(REPO, "assets", "overworld")
STRUCTURES = os.path.join(REPO, "assets", "structures")
MAPS = os.path.join(REPO, "assets", "maps")
THEMES = json.load(open(os.path.join(HERE, "themes.json")))
CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!$%&*+-/<>?@[]^{|}~"
DIRS4 = {"N": (0, -1), "E": (1, 0), "S": (0, 1), "W": (-1, 0)}
JUMP = {"JUMP_SOUTH": "S", "JUMP_EAST": "E", "JUMP_WEST": "W", "JUMP_NORTH": "N"}
JUMP_CH = {"S": "v", "E": ">", "W": "<", "N": "^"}
# walkable lawn patches (op vary, every theme's nature kit): still "open lawn". Flagged `patch=True`.
GROUND_VARIANTS = tuple(s for s, t in GO.TERRAIN.items() if t.get("patch"))
# walkable decals: flagged `walk=True` on the prop (flowers, tufts, pebbles, ferns, shells, theme decals ...)
WALKABLE_PROPS = {"flowers", "flowers-yellow", "flowers-white", "flowers-blue", "tuft", "pebbles", "mushrooms",
                  "lily-pad", "fern"} | {s for s, p in GO.PROPS.items() if p.get("walk")}
HM_PROPS = {"cut-tree", "smash-rock"}
# mechanics (tools/maps/cavekit.py, spec.md "Cave mechanics"): usable on caves and routes
MECH_OPS = ("boulder", "smash_rock", "cut_tree", "switch", "barrier", "gate", "lever", "lamp", "crystal", "rail",
            "lava", "ice", "tide")

# Layout scale. The game camera shows 640x360 px = 40 x 22.5 cells since 2026-11-19 (game/src/screen.ts,
# WORLD_ZOOM 3 on 1920x1080); the Gen 3 numbers below were measured on the GBA 15x10 view, so every rule
# that is a distance or size on the map is x2 (MAP_SCALE). Per-cell rules (wall thickness, trainer sight,
# open space around obstacles) are game mechanics and stay as measured.
VIEW = (40, 22)                  # camera screen in cells: "every screen has something", debug grid, walk
MAP_SCALE = 2                    # map distances vs the measured Gen 3 layouts
EXIT_W = {"city": (4, 10), "other": (4, 8)}    # Gen 3: 3-8 / 2-5, x2 then trimmed to stay readable
SIGN_REACH = 20                  # a sign within half a screen of each exit
TRAINER_SIGHT = (7, 5)           # cells across / down: half the GBA screen, a game rule, not scaled
CENTER_STEPS = (12 * MAP_SCALE, 26 * MAP_SCALE)     # Center from the main entrance
GYM_STEPS = (30 * MAP_SCALE, 55 * MAP_SCALE)        # gym from the main entrance (warn above GYM_MAX)
GYM_MAX = 70 * MAP_SCALE
NPC_CELLS = 600                  # cities: warn below one NPC per NPC_CELLS cells (about 1.5 per screen)
SEAM_GRASS = 7 * MAP_SCALE       # no tall grass this close to a seam
PLAIN_SCREEN = 0.1               # warn when more than this share of a camera screen is plain lawn


def jump_dir(slug):
    """'S' / 'E' / 'W' / 'N' for a ledge terrain (from its behaviour tag), else None."""
    return JUMP.get(GO.TERRAIN[slug].get("behaviour")) if slug in GO.TERRAIN else None


# ---------------------------------------------------------------- piece lookup
def index_slugs():
    try:
        return {p["slug"]: p for p in json.load(open(os.path.join(OVERWORLD, "index.json")))["pieces"]}
    except (OSError, ValueError, KeyError):
        return {}


def structure_dir(slug):
    hits = glob.glob(os.path.join(STRUCTURES, "*", slug, f"{slug}-structure.png"))
    return os.path.dirname(hits[0]) if hits else None


def piece_kind(slug):
    if slug in GO.TERRAIN:
        return "terrain"
    if slug in GO.PROPS:
        return "prop"
    if structure_dir(slug):
        return "structure"
    return None


def exported(slug, idx):
    k = piece_kind(slug)
    if k == "structure":
        return True
    return slug in idx


def resolve_role(theme, role):
    """First existing candidate for a role, plus the candidates that do not exist yet."""
    cands = THEMES[theme].get(role, THEMES.get("_mechanics", {}).get(role, []))   # mechanic roles: shared fallback
    cands = cands if isinstance(cands, list) else [cands]
    have = [c for c in cands if piece_kind(c)]
    missing = [c for c in cands if not piece_kind(c)]
    return have, missing


# ---------------------------------------------------------------- Pokémon sprites
POKEMON = os.path.join(REPO, "assets", "units")
_SIZES = None


PX_PER_M = 27 / 1.7          # the hero: 1.7 m drawn 27 px tall (docs/agents/decisions.md §6)
MAX_W_M = 4.5


def pokemon_height_cells(name):
    """Drawn height in cells, the settled game rule (docs/agents/decisions.md §6):
    game_h = hitbox.height x baseScale (Pokédex height when the hitbox is missing), drawn in metres as
    clamp(0.95 * game_h^0.45, 0.65, 2.4), at 27 px per 1.7 m."""
    global _SIZES
    if _SIZES is None:
        try:
            _SIZES = {k.lower(): v for k, v in json.load(open(os.path.join(REPO, "data", "units", "pokemon_sizes.json"),
                                                                encoding="utf-8")).items()}
        except (OSError, ValueError):
            _SIZES = {}
    v = _SIZES.get(name.lower()) or {}
    hb = (v.get("hitbox") or {}).get("height")
    game_h = hb * (v.get("baseScale") or 1) if hb else (v.get("height") or 10) / 10
    drawn_m = min(2.4, max(0.65, 0.95 * game_h ** 0.45))
    return drawn_m * PX_PER_M / TS


def pokemon_sprite(name, facing="down", frame=0, height=None):
    """(RGBA at 16 px cell scale, display name) from assets/pokemon/<Gen>/<NNN>-<Name>/<slug>-movement.png.
    Legacy 8x6 sheets: columns are 8 directions (down, down-right, right, ...), rows Walk A/B, Run A/B,
    Fly A/B. v2/v3 sheets: rows are down, left, right, up and columns the loop frames."""
    global _SIZES
    key = name.lower().replace(" ", "-")
    hits = [p for p in glob.glob(os.path.join(POKEMON, "*", "*", "*-movement.png"))
            if os.path.basename(os.path.dirname(p)).lower().split("-", 1)[-1] == key
            or os.path.basename(p).lower() == f"{key}-movement.png"]
    if not hits:
        return None, name
    sheet = Image.open(hits[0]).convert("RGBA")
    cell = 192
    if sheet.size == (1536, 1152):                       # legacy 8 directions x 6 rows
        col = {"down": 0, "right": 2, "up": 4, "left": 6}[facing]
        row = frame % 2
    else:                                                # v2/v3: 4 direction rows
        row = {"down": 0, "left": 1, "right": 2, "up": 3}[facing]
        col = frame % max(1, sheet.width // cell)
    im = sheet.crop((col * cell, row * cell, col * cell + cell, row * cell + cell))
    px = im.load()
    for yy in range(im.height):
        for xx in range(im.width):
            r, g, b, a = px[xx, yy]
            if (r - g) > 80 and (b - g) > 80 and r > 120 and b > 120:
                px[xx, yy] = (0, 0, 0, 0)
    bbox = im.getbbox()
    if not bbox:
        return None, name
    im = im.crop(bbox)
    if height is None:
        height = pokemon_height_cells(os.path.basename(os.path.dirname(hits[0])).split("-", 1)[-1])
    th = max(6, int(round(height * TS)))
    tw = max(4, int(round(im.width * th / im.height)))
    tw = min(tw, int(MAX_W_M * PX_PER_M))
    im = im.resize((tw, th), Image.LANCZOS)
    a = im.split()[3].point(lambda v: 255 if v >= 128 else 0)
    im.putalpha(a)
    return im, os.path.basename(os.path.dirname(hits[0]))


def pokemon_frames(name, height=None):
    """{facing: [frames]} for a walk cycle, every frame cut with ONE shared box and ONE scale so the
    feet stay put between frames. Legacy 8x6: walk A/B rows; v2/v3: the first row-loop columns."""
    key = name.lower().replace(" ", "-")
    hits = [p for p in glob.glob(os.path.join(POKEMON, "*", "*", "*-movement.png"))
            if os.path.basename(os.path.dirname(p)).lower().split("-", 1)[-1] == key
            or os.path.basename(p).lower() == f"{key}-movement.png"]
    if not hits:
        return None
    sheet = Image.open(hits[0]).convert("RGBA")
    cell = 192
    if sheet.size == (1536, 1152):
        cells = {f: [((c, r)) for r in (0, 1)] for f, c in (("down", 0), ("right", 2), ("up", 4), ("left", 6))}
    else:
        n = max(1, min(4, sheet.width // cell))
        cells = {f: [(c, r) for c in range(n)] for f, r in (("down", 0), ("left", 1), ("right", 2), ("up", 3))}

    def keyed(c, r):
        im = sheet.crop((c * cell, r * cell, c * cell + cell, r * cell + cell))
        px = im.load()
        for yy in range(cell):
            for xx in range(cell):
                rr, g, b_, a_ = px[xx, yy]
                if (rr - g) > 80 and (b_ - g) > 80 and rr > 120 and b_ > 120:
                    px[xx, yy] = (0, 0, 0, 0)
        return im
    raw = {f: [keyed(c, r) for c, r in cs] for f, cs in cells.items()}
    boxes = [im.getbbox() for fs in raw.values() for im in fs if im.getbbox()]
    box = (min(b_[0] for b_ in boxes), min(b_[1] for b_ in boxes), max(b_[2] for b_ in boxes), max(b_[3] for b_ in boxes))
    down = raw["down"][0].getbbox()
    if height is None:
        height = pokemon_height_cells(os.path.basename(os.path.dirname(hits[0])).split("-", 1)[-1])
    scale = height * TS / (down[3] - down[1])
    out = {}
    for f, fs in raw.items():
        out[f] = []
        for im in fs:
            im = im.crop(box)
            im = im.resize((max(4, round(im.width * scale)), max(4, round(im.height * scale))), Image.LANCZOS)
            im.putalpha(im.split()[3].point(lambda v: 255 if v >= 128 else 0))
            out[f].append(im)
    return out


def render_layers(m):
    """The map split for animation: the flat ground + terrain image, and every upright thing (props,
    fences, buildings) as (bottom px, x px, image, px, py), at 16 px cell scale."""
    scene, chars = char_scene(m)
    used = set(chars.values()) | {m.ground}
    used |= {GO.TERRAIN[s_]["fallback"] for s_ in list(used) if GO.TERRAIN[s_].get("fallback")}
    sheets = {s_: GO.build_terrain(s_)[0] for s_ in used}
    ov = {s_: GO.build_terrain(s_, overlay=True)[0] for s_ in used if GO.TERRAIN[s_]["kind"] == "blob"}
    base = ground_image(m, sheets[m.ground])
    sheets[m.ground] = Image.new("RGBA", sheets[m.ground].size)
    under = []
    items = []
    for st in m.structs:
        cell = Image.open(os.path.join(st["dir"], f"{st['slug']}-structure.png")).height
        gpath = os.path.join(st["dir"], f"{st['slug']}-ground.png")
        if os.path.exists(gpath):
            g = Image.open(gpath).convert("RGBA").crop((0, 0, cell, cell))
            under.append((g.resize((cell // 2, cell // 2), Image.NEAREST), st["x"] * TS, st["y"] * TS))
        im = GO.load_keyed(os.path.join(st["dir"], f"{st['slug']}-structure.png"), (0, 0, cell, cell))
        items.append((st["y"] * TS + im.height, st["x"] * TS, im, st["x"] * TS, st["y"] * TS))
    layer = GO.render_scene(sheets, scene, chars, [], [], [], False, under, ground=m.ground, ov_sheets=ov)
    base.alpha_composite(layer)
    shade = GO.ground_shade(m.ground)
    cache = {}
    for s_, x, y in m.props:
        if s_ not in cache:
            cache[s_] = GO.keyed_shade(GO.prop_frames(s_, resolve=False)[0].copy(), shade)
        w, h = GO.PROPS[s_]["cells"]
        items.append(((y + 1) * TS, x * TS, cache[s_], x * TS, (y - h + 1) * TS))
    fset = {(x, y): s_ for s_, x, y in m.fences}
    for s_, x, y in m.fences:
        if s_ not in cache:
            cache[s_] = GO.keyed_shade(GO.prop_frames(s_, resolve=False)[0].copy(), shade)
        msk = sum(b_ for b_, (dx, dy) in ((1, (0, -1)), (2, (1, 0)), (4, (0, 1)), (8, (-1, 0)))
                  if fset.get((x + dx, y + dy)) == s_)
        items.append(((y + 1) * TS, x * TS, cache[s_].crop((msk * TS, 0, msk * TS + TS, TS)), x * TS, y * TS))
    items.sort(key=lambda t: (t[0], t[1]))
    return base, items


def cmd_walk(path, argv):
    """mapgen.py walk <spec> --pokemon NAME --via x,y x,y ... [--out f.webp] [--view 40x22] [--scale 2]"""
    def opt(name, default=None):
        return argv[argv.index(name) + 1] if name in argv else default
    via = []
    if "--via" in argv:
        for a in argv[argv.index("--via") + 1:]:
            if a.startswith("--"):
                break
            via.append(tuple(int(v) for v in a.split(",")))
    spec = json.load(open(path))
    m = Map(spec, path)
    for op in spec.get("ops", []):
        m.apply(op)
    m.flush_pending()
    C = m.collision()
    global SURF
    SURF = bool(spec.get("surf"))
    cells = [via[0]]
    for a, b in zip(via, via[1:]):
        seg, _, _ = walk(C, [a], [b])
        if seg is None:
            sys.exit(f"no walkable path from {a} to {b}")
        cells += seg[1:]
    name = opt("--pokemon", "Pikachu")
    frames = pokemon_frames(name)
    if not frames:
        sys.exit(f"no movement sheet for {name}")
    base, items = render_layers(m)
    vw, vh = (int(v) for v in opt("--view", f"{VIEW[0]}x{VIEW[1]}").split("x"))
    scale = int(opt("--scale", "2"))
    out = opt("--out", os.path.join(os.path.dirname(os.path.abspath(path)), f"{m.slug}-{name.lower()}-walk.webp"))
    ticks_per_cell, flip = 8, 4                     # 2 px per tick at 16 px cells (Gen 3 walk speed)
    shots = []
    t = 0
    for (ax, ay), (bx, by) in zip(cells, cells[1:]):
        facing = {(0, 1): "down", (0, -1): "up", (1, 0): "right", (-1, 0): "left"}.get((bx - ax, by - ay), "down")
        if abs(bx - ax) + abs(by - ay) > 1:         # a ledge hop
            facing = "down" if by > ay else "right" if bx > ax else "left"
        for k in range(ticks_per_cell):
            fx = (ax + (bx - ax) * k / ticks_per_cell) * TS
            fy = (ay + (by - ay) * k / ticks_per_cell) * TS
            fr = frames[facing][(t // flip) % len(frames[facing])]
            px = int(fx + TS / 2 - fr.width / 2)
            py = int(fy + TS - 1 - fr.height)
            bottom = int(fy + TS - 1)
            cx = min(max(0, int(fx + TS / 2 - vw * TS / 2)), m.W * TS - vw * TS)
            cy = min(max(0, int(fy + TS / 2 - vh * TS / 2)), m.H * TS - vh * TS)
            view = base.crop((cx, cy, cx + vw * TS, cy + vh * TS))
            drawn = False
            for bot, x0, im, ix, iy in items:          # painter's order by feet: behind first, then the Pokémon
                if not drawn and (bot, x0) > (bottom, px):
                    paste_clip(view, fr, px - cx, py - cy)
                    drawn = True
                if ix + im.width < cx or ix > cx + vw * TS or iy + im.height < cy or iy > cy + vh * TS:
                    continue
                paste_clip(view, im, ix - cx, iy - cy)
            if not drawn:
                paste_clip(view, fr, px - cx, py - cy)
            shots.append(K.up(view).convert("RGB").resize((vw * TS * scale, vh * TS * scale), Image.NEAREST))
            t += 1
    shots[0].save(out, save_all=True, append_images=shots[1:], duration=33, loop=0, quality=85, method=4)
    print(f"{len(shots)} frames, {len(shots) * 33 / 1000:.1f} s -> {rel(out, REPO)}")


def paste_clip(view, im, x, y):
    """alpha_composite that accepts negative offsets (part of the item is left of / above the view)."""
    cx, cy = max(0, -x), max(0, -y)
    cw = min(im.width, view.width - x)
    ch = min(im.height, view.height - y)
    if cx >= cw or cy >= ch:
        return
    view.alpha_composite(im.crop((cx, cy, cw, ch)), (max(0, x), max(0, y)))


# ---------------------------------------------------------------- the map model
class Map:
    def __init__(self, spec, path):
        self.spec, self.path = spec, path
        self.theme = spec.get("theme", "meadow")
        if self.theme not in THEMES:
            sys.exit(f"unknown theme '{self.theme}'; see `mapgen.py themes`")
        self.slug = spec["slug"]
        self.kind = spec.get("kind", "route")
        self.W, self.H = spec["size"]
        self.view = tuple(spec.get("view", VIEW))
        self.home = spec.get("home")             # exit name the player comes from
        self.rng = random.Random(spec.get("seed", 1))
        self.grid = [[None] * self.W for _ in range(self.H)]
        self.props, self.fences, self.structs = [], [], []    # (slug,x,y) / (slug,x,y) / dict
        self.exits = {}                                     # name -> dict(side, cells, to)
        self.events = spec.get("events", {})
        self.errors, self.warns, self.notes = [], [], []
        self.missing = set()
        self.ground = self.res(spec.get("ground", "@ground"))
        self.border = self.res(spec.get("border", "@border"), required=False)
        self.busy = set()
        self.patches = []                                   # (fill, x0, y0, x1, y1, radius, rim, fringe)
        self.quarters = []                                  # gym quarters (x0, y0, x1, y1, prefix)
        self.pending = []                                   # gym vignettes waiting for flush_pending
        self.pokemon = []                                   # (RGBA sprite at 16 px scale, x px, y px, name)
        self.plateaus = []                                  # (x0, y0, x1, y1) of each plateau op (top + face)
        self.triggers = {}                                  # caves: (x, y) -> ladder / hole / cave_exit (cavekit.py)
        self.warps = []                                     # cave mouths on a route: dict(cells, foot, to)
        self.mech = []                                      # game-driven objects: boulders, HM obstacles, gates ...
        self.mgrid = {}                                     # (x, y) -> collision char of a mechanic terrain (lava, ice ...)
        self.placeholders = set()                           # mechanic art roles with no piece yet (drawn flat)
        self.tide = {"flood": set(), "seal": set()}         # tide op: cells that change at high tide
        self.mg, self.go = sys.modules[__name__], GO        # for the organic passes in nature.py
        self.reserved = set()                               # cells no pass may decorate: `clear` + trainer sight
        for x0, y0, x1, y1 in spec.get("clear", []):
            self.reserved |= {(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}
        for t in self.events.get("trainers", []):
            tx, ty = t["at"]
            dx, dy = DIRS4.get(t.get("facing", "S"), (0, 1))
            self.reserved |= {(tx + dx * k, ty + dy * k) for k in range(0, t.get("sight", 4) + 2)}

    # -- slugs and roles
    def res(self, t, required=True):
        if t is None:
            return None
        if isinstance(t, list):
            return [self.res(x, required) for x in t]
        if t.startswith("@"):
            have, missing = resolve_role(self.theme, t[1:])
            self.missing.update(missing)
            if have:
                return have[0]
            if required:
                self.errors.append(f"role {t} has no existing piece in theme '{self.theme}' (wanted {missing})")
            return None
        if not piece_kind(t):
            self.missing.add(t)
            self.errors.append(f"piece '{t}' does not exist")
            return None
        return t

    def role_pool(self, t):
        """All existing candidates of a role (for scatter), or the slug itself."""
        if isinstance(t, list):
            return [s for x in t for s in self.role_pool(x)]
        if t.startswith("@"):
            have, missing = resolve_role(self.theme, t[1:])
            self.missing.update(missing)
            return [h for h in have if h in GO.PROPS] or have
        return [t] if piece_kind(t) else []

    def inside(self, x, y):
        return 0 <= x < self.W and 0 <= y < self.H

    def put(self, slug, x, y, keep=False):
        if self.inside(x, y) and (not keep or self.grid[y][x] is None):
            self.grid[y][x] = slug

    # -- ops
    def apply(self, op):
        o = op["op"]
        keep = op.get("keep", False)
        t = self.res(op.get("t")) if "t" in op and o not in ("scatter", "units") else None
        if o == "frame":
            th = op.get("thick", 4)
            for y in range(self.H):
                for x in range(self.W):
                    if x < th or y < th or x >= self.W - th or y >= self.H - th:
                        self.put(t, x, y, keep)
        elif o == "rect":
            x0, y0, x1, y1 = op["box"]
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    self.put(t, x, y, keep)
        elif o == "path":
            w = op.get("width", 2)
            pts = op["points"]
            for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                if ax != bx and ay != by:
                    self.errors.append(f"path segment {ax},{ay}->{bx},{by} is diagonal; use orthogonal points")
                    continue
                for x in range(min(ax, bx), max(ax, bx) + 1):
                    for y in range(min(ay, by), max(ay, by) + 1):
                        for i in range(w):
                            for j in range(w):
                                if op.get("avoid_busy") and (x + i, y + j) in self.busy:
                                    continue
                                self.put(t, x + i, y + j, keep)
        elif o == "blob":
            cx, cy = op["center"]
            rx, ry = op["r"]
            s = op.get("seed", 7)
            e = {"round": 4, "ellipse": 2}[op.get("shape", "round")]   # round = Gen 3 rounded rectangle
            cells = set()
            for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
                for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                    wob = 0.12 * (K.h16(x, y, s) / 255 - 0.5)
                    if abs((x - cx) / max(rx, .5)) ** e + abs((y - cy) / max(ry, .5)) ** e < 1 + wob:
                        cells.add((x, y))
            for x, y in cells:              # drop 1-cell nubs: they read as glitches, not shape
                if sum((x + dx, y + dy) in cells for dx, dy in DIRS4.values()) >= 2:
                    self.put(t, x, y, keep)
        elif o == "patch":
            if not t or GO.TERRAIN[t]["kind"] != "fill":
                self.errors.append(f"patch needs a fill terrain, got {op.get('t')}")
                return
            x0, y0, x1, y1 = op["box"]
            self.patches.append((t, x0, y0, x1, y1, op.get("r", 3), op.get("rim", "none"), op.get("fringe", 2),
                                 op.get("blend", 0.0)))
        elif o == "exit":
            side, at, w = op["side"], op["at"], op.get("width", 4)
            depth = op.get("depth")
            cells = []
            for i in range(w):
                for d in range(self.W if side in "EW" else self.H):
                    x, y = {"N": (at + i, d), "S": (at + i, self.H - 1 - d),
                            "W": (d, at + i), "E": (self.W - 1 - d, at + i)}[side]
                    if not self.inside(x, y):
                        break
                    if depth is None and d > 0 and self.grid[y][x] in (None, t):
                        break
                    if depth is not None and d >= depth:
                        break
                    if not op.get("mark_only"):                 # mark_only: record the exit, paint nothing
                        self.grid[y][x] = t
                    if d == 0:
                        cells.append((x, y))
            name = op.get("name", side)
            if name in self.exits and "name" not in op:      # two seams on one side (route-10 north: 9b and 12)
                name = f"{side}-{op.get('to')}"
            self.exits[name] = dict(side=side, cells=cells, to=op.get("to"), width=w, surf=bool(op.get("surf")))
        elif o == "ledge":
            d = op.get("dir")                                   # N / E / W / S: the jump direction (default the piece's)
            role = {"N": "@ledgen", "E": "@ledgee", "W": "@ledgew"}.get(d)
            slug = t or (self.res(role, required=False) if role else None) or self.res("@ledge")
            d = d or jump_dir(slug)
            if role and not op.get("t") and not self.res(role, required=False):
                self.placeholders.add(role[1:])
            cells = [(x, op["y"]) for x in range(op["x"][0], op["x"][1] + 1)] if d in ("S", "N") \
                else [(op["x"], y) for y in range(op["y"][0], op["y"][1] + 1)]
            for x, y in cells:
                self.put(slug, x, y)
                if d != jump_dir(slug):
                    self.mgrid[(x, y)] = JUMP_CH[d]
        elif o == "stamp":
            ax, ay = op["at"]
            legend = {k: self.res(v) for k, v in op["legend"].items()}
            for j, row in enumerate(op["rows"]):
                for i, ch in enumerate(row):
                    if ch in legend:
                        self.put(legend[ch], ax + i, ay + j, keep)
        elif o == "structure":
            self.add_structure(op)
        elif o == "gym_quarter":
            self.gym_quarter(op)
        elif o == "units":
            self.add_pokemon(op)
        elif o == "prop":
            snap = op.get("snap", 0)
            for s, x, y in [(op["t"], *op["at"])] if "at" in op else [(op["t"], *a) for a in op["each"]]:
                slug = self.res(s)
                if not slug:
                    continue
                spots = sorted(((abs(i) + abs(j), x + i, y + j) for i in range(-snap, snap + 1)
                                for j in range(-snap, snap + 1)), key=lambda t: t[0])
                if not any(self.place_prop(slug, px, py, op.get("force", False)) for _, px, py in spots):
                    self.warns.append(f"prop {slug} at {x},{y} skipped (blocked or off-map)")
        elif o == "dress":
            self.flush_pending()
            self.dress(op)
        elif o in ("carve", "ladder", "hole", "cave_exit", "cave_decorate", "wall_props") + MECH_OPS:
            import cavekit                      # cave maps: carving, ladders, holes, exits, wall props, mechanics
            getattr(cavekit, o)(self, op)
        elif o == "cave_entrance":
            self.cave_entrance(op)
        elif o in ("vary", "forest_edge", "decorate", "plateau", "stream", "pond"):
            import nature                       # organic passes: ground patches, ragged walls, vignettes, height
            getattr(nature, o)(self, op)
        elif o == "scatter":
            pool = self.role_pool(op["t"])
            if not pool:
                self.errors.append(f"scatter {op['t']}: no existing prop")
                return
            x0, y0, x1, y1 = op["box"]
            n, tries = op.get("n", 6), 0
            placed = 0
            on = op.get("on")
            while placed < n and tries < n * 40:
                tries += 1
                x, y = self.rng.randint(x0, x1), self.rng.randint(y0, y1)
                if on is not None and self.grid[y][x] != self.res(on):
                    continue
                if self.place_prop(self.rng.choice(pool), x, y):
                    placed += 1
            if placed < n:
                self.warns.append(f"scatter {op['t']} in {op['box']}: placed {placed}/{n}")
        elif o == "fence":
            slug = self.res(op.get("t", "@fence"))
            pts = op["points"]
            for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                for x in range(min(ax, bx), max(ax, bx) + 1):
                    for y in range(min(ay, by), max(ay, by) + 1):
                        if (x, y) not in self.busy and self.inside(x, y):
                            self.fences.append((slug, x, y))
                            self.busy.add((x, y))
        else:
            self.errors.append(f"unknown op '{o}'")

    def dress(self, op):
        """Fill open lawn the Gen 3 way: while some lawn cell is more than `max` cells from any
        obstacle, put a prop from the pool at the most open one. Streets, door steps and exits stay free."""
        pool = self.role_pool(op["t"])
        lim = op.get("max", 4)
        x0, y0, x1, y1 = op.get("box", (0, 0, self.W - 1, self.H - 1))
        keep_free = {c for e in self.exits.values() for c in e["cells"]}
        for st in self.structs:
            keep_free |= {(x, y + k) for x, y in st["doors"] for k in (1, 2)}
        placed = 0
        for _ in range(op.get("n", 200)):
            C = self.collision()
            walk = {(x, y) for y in range(self.H) for x in range(self.W) if C[y][x] in ".,fD"}
            dist, frontier = {}, []
            for (x, y) in walk:
                if any((x + dx, y + dy) not in walk for dx, dy in DIRS4.values()):
                    dist[(x, y)] = 1
                    frontier.append((x, y))
            while frontier:
                nxt = []
                for (x, y) in frontier:
                    for dx, dy in DIRS4.values():
                        c = (x + dx, y + dy)
                        if c in walk and c not in dist:
                            dist[c] = dist[(x, y)] + 1
                            nxt.append(c)
                frontier = nxt
            cand = [(d, c) for c, d in dist.items() if d > lim and x0 <= c[0] <= x1 and y0 <= c[1] <= y1
                    and self.grid[c[1]][c[0]] in (None,) + GROUND_VARIANTS and c not in keep_free
                    and c not in self.reserved]
            if not cand:
                break
            cand.sort(key=lambda t: (-t[0], K.h16(t[1][0], t[1][1], 5)))
            done = False
            for _, (cx, cy) in cand[:12]:
                slug = self.rng.choice(pool)
                w, h = GO.PROPS[slug]["cells"]
                if self.place_prop(slug, cx, cy + h - 1):
                    placed += 1
                    done = True
                    break
            if not done:
                break
        self.notes.append(f"dress placed {placed} props")

    def place_prop(self, slug, x, y, force=False):
        w, h = GO.PROPS[slug]["cells"]
        cells = {(x + i, y - j) for i in range(w) for j in range(h)}
        if any(not self.inside(cx, cy) for cx, cy in cells) or (cells & self.busy):
            return False
        steps = {(x, y + k) for st in self.structs for x, y in st["doors"] for k in (1, 2)}
        if not force and cells & steps:            # keep every doorstep clear
            return False
        if not force and {(x + i, y) for i in range(w)} & self.reserved:   # `clear` boxes, trainer sight
            return False
        if not force and any(self.cell_solid_terrain(cx, cy) or self.is_floor(self.grid[cy][cx])
                             for cx, cy in cells):
            return False
        self.busy |= cells
        self.props.append((slug, x, y))
        return True

    def add_structure(self, op):
        slug = self.res(op["t"])
        if not slug:
            return
        d = structure_dir(slug)
        sheet = Image.open(os.path.join(d, f"{slug}-structure.png"))
        cell = sheet.height
        n = cell // OUT_TS                            # canvas size in cells
        door = None
        dj = os.path.join(d, f"{slug}-door.json")
        if os.path.exists(dj):
            j = json.load(open(dj))
            door = (j["x"] // OUT_TS, (j["y"] + j["h"]) // OUT_TS - 1, max(1, j["w"] // OUT_TS))
        if "door" in op:
            if not door:
                self.errors.append(f"{slug} has no door json; place it with 'at'")
                return
            ox, oy = op["door"][0] - door[0], op["door"][1] - door[1]
        else:
            ox, oy = op["at"]
        keyed = GO.load_keyed(os.path.join(d, f"{slug}-structure.png"), (0, 0, cell, cell))
        a = keyed.split()[3].load()
        foot = set()
        last = door[1] if door else n - 1          # rows below the door row are the walkable doorstep
        for cy in range(last + 1):
            for cx in range(n):
                cov = sum(1 for yy in range(TS) for xx in range(TS) if a[cx * TS + xx, cy * TS + yy])
                if cov >= TS * TS * 0.3:
                    foot.add((ox + cx, oy + cy))
        doors = set()
        if door:
            doors = {(ox + door[0] + i, oy + door[1]) for i in range(door[2])}
            foot -= doors
        clash = (foot | doors) & self.busy
        if clash:
            self.warns.append(f"{slug} overlaps {len(clash)} busy cells, e.g. {sorted(clash)[0]}")
        self.busy |= foot | doors
        for (x, y) in foot | doors:
            if self.inside(x, y) and self.cell_solid_terrain(x, y):
                self.warns.append(f"{slug} sits on solid terrain at {x},{y}")
                break
        self.structs.append(dict(slug=slug, x=ox, y=oy, n=n, dir=d, foot=foot, doors=doors,
                                 to=op.get("to", f"{slug}-interior")))
        if op.get("link") and doors:
            dx = min(x for x, _ in doors)
            self.link((dx, max(y for _, y in doors) + 1), self.res(op["link"]), op.get("link_width", 2))

    def cave_entrance(self, op):
        """A cave mouth on a route (3x3 prop, anchored bottom-left at `at`): its bottom middle cell is a Warp
        into the cave map `to`; the other cells are rock. Put it against the route's wall or cliff."""
        slug = self.res(op.get("t", "@entrance"))
        if not slug:
            return
        x, y = op["at"]
        w, h = GO.PROPS[slug]["cells"]
        cells = {(x + i, y - j) for i in range(w) for j in range(h)}
        door = (x + w // 2, y)
        if any(not self.inside(*c) for c in cells):
            self.errors.append(f"cave_entrance at {x},{y} is off the map")
            return
        below = (door[0], door[1] + 1)
        clear = cells | {below}
        for p_ in [p_ for p_ in self.props if {(p_[1] + i, p_[2] - j) for i in range(GO.PROPS[p_[0]]["cells"][0])
                                               for j in range(GO.PROPS[p_[0]]["cells"][1])} & clear]:
            self.props.remove(p_)                  # props laid earlier (decorate) give way to the mouth
            pw, ph = GO.PROPS[p_[0]]["cells"]
            self.busy -= {(p_[1] + i, p_[2] - j) for i in range(pw) for j in range(ph)}
        for cx, cy in cells:                       # the mouth replaces whatever lawn or wall was there
            self.grid[cy][cx] = None
        self.busy -= cells
        self.place_prop(slug, x, y, force=True)
        if self.inside(*below) and self.cell_solid_terrain(*below):
            self.grid[below[1]][below[0]] = None
        self.warps.append(dict(doors={door}, foot=cells - {door}, to=op["to"], slug=slug))

    def gym_quarter(self, op):
        """A gym that belongs to its street (docs/explanation/research/world-art-review.md W1-10): theme ground worn
        into the lawn with a soft fringe, a mid-tone forecourt (gym width + 2, `depth` rows), a statue
        pair beside the door, two theme lamps, a lane to the road and 1-2 vignettes of theme props."""
        prefix = op.get("prefix") or op["t"].replace("gym-", "")
        dx, dy = op["door"]
        n_before = len(self.structs)
        self.add_structure(dict(op="structure", t=op["t"], door=op["door"], to=op.get("to", f"{op['t']}-interior")))
        if len(self.structs) == n_before:
            return
        st = self.structs[-1]
        bx0 = min(x for x, _ in st["foot"])
        bx1 = max(x for x, _ in st["foot"])
        by0 = min(y for _, y in st["foot"])
        extra, depth = op.get("court", [2, 3])
        floor = self.res(op.get("floor", "@floor"))
        accent = self.res(op.get("accent", "@accent"))
        court = [(x, y) for x in range(bx0 - extra, bx1 + extra + 1) for y in range(dy + 1, dy + depth + 1)]
        if accent:
            self.patches.append((accent, bx0 - 3, by0 + 1, bx1 + 3, dy + depth + 1, 2, "none", op.get("fringe", 2),
                                 op.get("blend", 0.7)))
        for (x, y) in court:
            if self.inside(x, y) and (x, y) not in self.busy:
                self.grid[y][x] = floor
        for (x, y) in ((dx - 2, dy + 2), (dx + 3, dy + 2)):
            self.place_prop(f"{prefix}-statue", x, y, force=True) if f"{prefix}-statue" in GO.PROPS else None
        lamp = self.res(op["lamp"], required=False) if op.get("lamp") else None   # statues frame the door; lamps opt-in
        if lamp:
            for x in (bx0 - extra, bx1 + extra):
                self.place_prop(lamp, x, dy + depth, force=True)
        if op.get("link", "@plaza"):
            self.link((dx, dy + depth + 1), self.res(op.get("link", "@plaza")), 2, exclude=court)
        kit = [self.res(k) for k in op.get("kit", [])]
        kit = [k for k in kit if k]
        sides = [(bx0 - extra - 2, dy + depth), (bx1 + extra + 2, dy + depth)]
        self.pending.append((kit, sides))          # placed after every structure and lane (flush_pending)
        self.quarters.append((bx0 - 3, by0, bx1 + 3, dy + depth + 1, prefix))

    def add_pokemon(self, op):
        """A Pokémon standing on a cell: one frame of its movement sheet, magenta keyed, scaled to its
        3D-model hitbox height (data/pokemon/pokemon_sizes.json), feet on the cell's bottom edge. It is depth-sorted with props and
        buildings by its feet, so a lamp or tree on a lower row is drawn in front of it."""
        img, name = pokemon_sprite(op["t"], op.get("facing", "down"), op.get("frame", 0), op.get("height"))
        if img is None:
            self.errors.append(f"pokemon '{op['t']}': no movement sheet found under assets/pokemon/")
            return
        x, y = op["at"]
        if not self.inside(x, y):
            self.errors.append(f"pokemon {name} at {x},{y} is off the map")
            return
        px = x * TS + TS // 2 - img.width // 2
        py = (y + 1) * TS - 1 - img.height
        self.pokemon.append((img, px, py, name))

    def flush_pending(self):
        """Gym vignettes go in last (before dress), so they never take a building's or a lane's cells."""
        for kit, sides in self.pending:
            for i, k in enumerate(kit):             # alternate sides, packed close together
                cx, cy = sides[i % 2]
                for r_ in range(0, 4):
                    if any(self.place_prop(k, cx + ddx, cy - ddy)
                           for ddx in range(-r_, r_ + 1) for ddy in range(0, r_ + 2)):
                        break
        self.pending = []

    def link(self, start, slug, width=2, exclude=()):
        """Lay a lane from `start` (the cell under a door) to the nearest floor cell, turning as
        little as possible, around solid terrain and anything placed."""
        if not slug:
            return
        floors = {(x, y) for y in range(self.H) for x in range(self.W) if self.is_floor(self.grid[y][x])} - set(exclude)
        if not floors:
            self.warns.append(f"link from {start}: no lane to join")
            return
        pq = [(0, start, None, None)]
        seen, prev = set(), {}
        goal = None
        while pq:
            cost, cell, d, parent = heapq.heappop(pq)
            if (cell, d) in seen:
                continue
            seen.add((cell, d))
            prev.setdefault(cell, parent)
            if cell in floors and cell != start:
                goal = cell
                break
            x, y = cell
            for nd, (dx, dy) in DIRS4.items():
                nx, ny = x + dx, y + dy
                ok = (self.inside(nx, ny) and (nx, ny) not in self.busy
                      and not self.cell_solid_terrain(nx, ny))
                if ok or (nx, ny) in floors:
                    heapq.heappush(pq, (cost + 1 + (3 if d and nd != d else 0), (nx, ny), nd, cell))
        if goal is None:
            self.warns.append(f"link from {start}: no route to a lane")
            return
        cell = prev[goal]
        while cell is not None:
            for i in range(width):
                for j in range(width):
                    c = (cell[0] + i, cell[1] + j)
                    if self.inside(*c) and c not in self.busy and not self.cell_solid_terrain(*c):
                        self.put(slug, *c)
            cell = prev.get(cell)

    # -- passability
    def is_floor(self, s):
        return s is not None and GO.group_of(s) == "floor"

    def cell_solid_terrain(self, x, y):
        s = self.grid[y][x]
        if s is None:
            return False
        if s in self.spec.get("walk", []):
            return False
        if s in self.spec.get("solid", []):
            return True
        spec = GO.TERRAIN[s]
        if spec.get("solid"):                # cave rock and its face
            return True
        if spec["kind"] in ("fill",):
            return False
        if spec.get("behaviour") in ("POND_WATER", "OCEAN_WATER"):
            return True
        g = GO.group_of(s)
        if g == "cliff":                     # raised plateau: stairs walk, the face blocks, the top blocks
            if spec["kind"] == "row":        # only on its rim (you cannot step off the edge)
                return False
            if spec.get("face") or not spec.get("top"):     # plateau tops (cliff, cliff-2, <type>-cliff ...)
                return True
            if not self.walk_tops():
                return True
            lv = spec.get("level", 1)        # rim: next to lower ground (a lower level, or off the plateau)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if not (dx or dy):
                        continue
                    if not self.inside(x + dx, y + dy):
                        return True
                    n = self.grid[y + dy][x + dx]
                    if GO.group_of(n or "") != "cliff":
                        return True
                    ns = GO.TERRAIN[n]
                    if ns["kind"] != "row" and ns.get("level", 1) < lv:
                        return True
            return False
        return (g in ("cliff", "hedge", "forest", "tree-wall", "mountain") or s.endswith(("-border", "-forest", "-tree-wall"))
                or any(w in s for w in ("pool", "pond", "conduit")))

    def walk_tops(self):
        """Plateau tops are walkable (rim excepted) when the map made them with the plateau op;
        a cliff painted with plain rect/blob stays a solid block, as before."""
        return bool(self.plateaus)

    def collision(self, tide="low"):
        """Per cell: '.' walk, ',' tall grass, '#' solid, '~' surf, 'v' '>' '<' '^' ledge, 'D' door,
        'H' HM obstacle, 'f' walkable prop; mechanics (cavekit.MECH_CHAR): 'B' boulder, 'G' gate, 'X' barrier,
        'l' lever, 'o' switch, 'L' lava, 'i' ice, 'r' rail; 'S' trigger (ladder, hole, exit, cart)."""
        C = [["." for _ in range(self.W)] for _ in range(self.H)]
        for y in range(self.H):
            for x in range(self.W):
                s = self.grid[y][x]
                if jump_dir(s):
                    C[y][x] = JUMP_CH[jump_dir(s)]
                elif s and GO.TERRAIN[s].get("behaviour") in ("POND_WATER", "OCEAN_WATER") \
                        and s not in self.spec.get("solid", []):
                    C[y][x] = "~"
                elif self.cell_solid_terrain(x, y):
                    C[y][x] = "#"
                elif s and GO.TERRAIN[s].get("behaviour") == "TALL_GRASS":
                    C[y][x] = ","
                elif s and GO.TERRAIN[s].get("behaviour") == "CRACKED_FLOOR":
                    C[y][x] = "c"
        for slug, x, y in self.props:
            w, h = GO.PROPS[slug]["cells"]
            for i in range(w):
                for j in range(1 if h >= 2 else h):     # Gen 3: only the base row of a tall prop blocks;
                    if self.inside(x + i, y - j):       # you walk behind a lamp head or a tree crown
                        C[y - j][x + i] = "H" if slug in HM_PROPS else ("f" if slug in WALKABLE_PROPS else "#")
        for slug, x, y in self.fences:
            C[y][x] = "#"
        for st in self.structs + self.warps:
            for (x, y) in st["foot"]:
                if self.inside(x, y):
                    C[y][x] = "#"
            for (x, y) in st["doors"]:
                if self.inside(x, y):
                    C[y][x] = "D"
        if self.mgrid or self.mech or self.tide["flood"] or self.tide["seal"]:
            import cavekit
            cavekit.apply_mech(self, C, tide)
        for (x, y) in self.triggers:              # cave ladders, holes, exits and carts
            C[y][x] = "S"
        return C


# ---------------------------------------------------------------- walking (Dijkstra with ledges)
def neighbours(C, x, y, hm=False, surf=False):
    H, W = len(C), len(C[0])
    if C[y][x] == "D":                          # a door is entered from below and left the same way
        yield x, y + 1, 1
        return
    for d, (dx, dy) in DIRS4.items():
        nx, ny = x + dx, y + dy
        if not (0 <= nx < W and 0 <= ny < H):
            continue
        c = C[ny][nx]
        if c in "v><^":
            jd = {"v": "S", ">": "E", "<": "W", "^": "N"}[c]
            if d != jd:
                continue
            lx, ly = nx + dx, ny + dy
            if 0 <= lx < W and 0 <= ly < H and C[ly][lx] in ".,fio":
                yield lx, ly, 2
            continue
        if c == "D":
            if d == "N":
                yield nx, ny, 1
            continue
        if c in ".,fio" or (hm and c == "H") or (surf and c == "~"):
            yield nx, ny, 1


SURF = False                      # set per map: sea routes and island towns are walked with Surf


def walk(C, starts, goals, hm=False, grass_cost=0):
    """Cheapest path; cost = steps + grass_cost per tall-grass cell. Returns (path, steps, grass)."""
    goals = set(goals)
    pq = [(0, 0, 0, s, None) for s in starts if C[s[1]][s[0]] in (".,fD~" if SURF else ".,fD")]
    heapq.heapify(pq)
    seen, prev = {}, {}
    while pq:
        cost, steps, grass, cell, parent = heapq.heappop(pq)
        if cell in seen:
            continue
        seen[cell] = (steps, grass)
        prev[cell] = parent
        if cell in goals:
            path = [cell]
            while prev[path[-1]] is not None:
                path.append(prev[path[-1]])
            return path[::-1], steps, grass
        for nx, ny, st in neighbours(C, *cell, hm=hm, surf=SURF):
            if (nx, ny) not in seen:
                g = 1 if C[ny][nx] == "," else 0
                heapq.heappush(pq, (cost + st + g * grass_cost, steps + st, grass + g, (nx, ny), cell))
    return None, None, None


# ---------------------------------------------------------------- lint
def lint(m, C):
    global SURF
    SURF = bool(m.spec.get("surf"))
    E, Wn, N = m.errors, m.warns, m.notes
    vw, vh = m.view
    walkable = sum(1 for row in C for c in row if c in ".,fD")
    N.append(f"size {m.W}x{m.H} cells ({m.W * m.H / (vw * vh):.1f} screens of {vw}x{vh}); "
             f"walkable {100 * walkable / (m.W * m.H):.0f} %")
    # exits
    lo_w, hi_w = EXIT_W["city" if m.kind == "city" else "other"]
    for name, ex in m.exits.items():
        surf = SURF or ex.get("surf")                   # a sea seam on a land map (`"surf": true` on the exit op)
        if not surf and not lo_w <= ex["width"] <= hi_w:
            Wn.append(f"exit {name}: width {ex['width']} (Mons {m.kind}s use {lo_w}-{hi_w})")
        bad = [c for c in ex["cells"] if C[c[1]][c[0]] not in (".,f~" if surf else ".,f")]
        if bad:
            E.append(f"exit {name}: edge cells not walkable {bad}")
    if not m.exits:
        Wn.append("no exits: a map with no connection is a dead island")
    home = m.home or (next(iter(m.exits)) if m.exits else None)
    if home and home not in m.exits:
        E.append(f"home exit '{home}' not defined")
        home = None
    # reachability both ways from home
    targets = {f"exit {n}": e["cells"] for n, e in m.exits.items() if n != home}
    for st in m.structs:
        if st["doors"]:
            targets[f"door {st['slug']}"] = sorted(st["doors"])
    for wp in m.warps:
        targets[f"cave {wp['to']}"] = sorted(wp["doors"])
    routes = {}
    if home:
        hc = m.exits[home]["cells"]
        sea = {f"exit {n}" for n, e in m.exits.items() if e.get("surf")}
        for label, cells in targets.items():
            SURF = SURF or label in sea                 # a sea seam is reached by surfing from the shore
            out = walk(C, hc, cells, grass_cost=50)
            back = walk(C, cells, hc, grass_cost=50)
            SURF = bool(m.spec.get("surf"))
            if out[0] is None:
                E.append(f"{label} unreachable from home exit {home}")
                continue
            if back[0] is None:
                E.append(f"{label}: no way back to home exit {home} (soft-lock)")
                continue
            routes[label] = (out, back)
            N.append(f"{label}: out {out[1]} steps / {out[2]} forced grass, back {back[1]} steps / {back[2]} grass")
            if label.startswith("exit"):
                plain = walk(C, hc, cells, hm=False)
                withhm = walk(C, hc, cells, hm=True)
                if plain[0] is None and withhm[0] is not None:
                    Wn.append(f"{label} needs an HM obstacle: HM props should gate side branches, not the main lane")
                if m.kind == "route" and back[1] > out[1] and any(ch in "v><" for row in C for ch in row):
                    Wn.append(f"{label}: way back ({back[1]}) is longer than way out ({out[1]}); ledges should face home")
    if m.kind == "city" and home:
        lint_city(m, C, routes, home)
    # gym lane: the cell under each gym door joins the main floor network
    floor = {(x, y) for y in range(m.H) for x in range(m.W) if m.is_floor(m.grid[y][x])}
    comps, seen = [], set()
    for c in floor:
        if c in seen:
            continue
        comp, stack = set(), [c]
        while stack:
            q = stack.pop()
            if q in seen or q not in floor:
                continue
            seen.add(q)
            comp.add(q)
            stack += [(q[0] + dx, q[1] + dy) for dx, dy in DIRS4.values()]
        comps.append(comp)
    exit_cells = {c for e in m.exits.values() for c in e["cells"]}
    main = max(comps, key=lambda c: (bool(c & exit_cells), len(c)), default=set())
    for st in m.structs:
        if st["slug"].startswith("gym-") and st["doors"] and floor:
            x, y = min(st["doors"])
            if (x, y + 1) not in main:
                Wn.append(f"{st['slug']}: the lane from its door does not join the main road (paving gap)")
    # structures too close
    for i, a in enumerate(m.structs):
        for b in m.structs[i + 1:]:
            if any(abs(x1 - x2) <= 1 and abs(y1 - y2) <= 1 for x1, y1 in a["foot"] for x2, y2 in b["foot"]):
                Wn.append(f"{a['slug']} and {b['slug']} touch: keep >= 2 cells between buildings")
    # theme share: the theme is an accent (10-20 % of the map), not a coat of paint
    prefixes = tuple(f"{t}-" for t in ("fire", "water", "grass", "electric", "psychic", "poison", "ground", "rock"))
    # the district's own landscape (lawn, lanes, foliage, rock, nature kit: flagged nature=True) is
    # not the accent; the gym's ground, floors, features, props and statues are
    themed = {(x, y) for y in range(m.H) for x in range(m.W) if (m.grid[y][x] or "").startswith(prefixes)
              and not GO.TERRAIN[m.grid[y][x]].get("nature")}
    for f, x0, y0, x1, y1, *_ in m.patches:
        themed |= {(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}
    for s_, x, y in m.props:
        if s_.startswith(prefixes) and not GO.PROPS[s_].get("nature"):
            w, h = GO.PROPS[s_]["cells"]
            themed |= {(x + i, y - j) for i in range(w) for j in range(h)}
    share = 100 * len(themed) / (m.W * m.H)
    N.append(f"theme share {share:.0f} % of the map")
    if share > 25 and m.kind in ("town", "city"):     # a theme's own routes may be fully themed
        Wn.append(f"theme covers {share:.0f} % of the map (accent target 10-20 %)")
    if 0 < share < 10 and m.kind in ("town", "city") and m.quarters:
        Wn.append(f"theme covers only {share:.0f} % of the map (accent target 10-20 %): widen the gym quarter")
    # doors
    for st in m.structs:
        for (x, y) in st["doors"]:
            if not (m.inside(x, y + 1) and C[y + 1][x] in ".,f"):
                E.append(f"door of {st['slug']} at {x},{y}: cell below is not walkable")
    # ledge direction vs home side
    if home:
        hs = m.exits[home]["side"]
        for ch, d in (("v", "S"), (">", "E"), ("<", "W")):
            if any(ch in row for row in C) and d != hs:
                Wn.append(f"ledges jump {d} but home is {hs}: the one-way shortcut should point home")
        if any("v" in row for row in C):
            gaps = [y for y in range(m.H) if "v" in C[y]]
            for y in sorted(set(gaps)):
                row = C[y]
                if all(row[x] in "v#~H" for x in range(m.W)):
                    E.append(f"ledge row {y} spans the whole walkable width: no gap to climb back")
    # wall thickness
    for side in "NSEW":
        thin = []
        rng = range(m.W) if side in "NS" else range(m.H)
        for i in rng:
            depth = 0
            while depth < 2:
                x, y = {"N": (i, depth), "S": (i, m.H - 1 - depth), "W": (depth, i), "E": (m.W - 1 - depth, i)}[side]
                if C[y][x] != "#":
                    break
                depth += 1
            if depth == 1:
                thin.append(i)
        if thin:
            Wn.append(f"{side} wall is 1 cell thick at {thin[:6]}{'...' if len(thin) > 6 else ''} (Gen 3 walls are >= 2)")
    # tall grass
    grass = sum(row.count(",") for row in C)
    if m.kind != "route" and grass:
        N.append(f"{grass} tall-grass cells in a {m.kind}: Gen 3 towns keep grass to the exits only")
    if m.kind == "route" and not grass and not SURF:
        Wn.append("route has no tall grass")
    # signs near exits
    signs = [tuple(s["at"]) for s in m.events.get("signs", [])]
    signs += [(x, y) for s, x, y in m.props if s == m.res("@sign", required=False)]
    for name, ex in m.exits.items():
        cx, cy = ex["cells"][len(ex["cells"]) // 2] if ex["cells"] else (0, 0)
        if not any(abs(sx - cx) + abs(sy - cy) <= SIGN_REACH for sx, sy in signs):
            Wn.append(f"exit {name}: no sign within {SIGN_REACH} cells")
    # trainers
    for t in m.events.get("trainers", []):
        x, y = t["at"]
        sight = t.get("sight", 4)
        f = t.get("facing", "S")
        lim = TRAINER_SIGHT[0] if f in "EW" else TRAINER_SIGHT[1]
        if sight > lim:
            Wn.append(f"trainer at {x},{y} sees {sight} cells {f}; keep it within {lim} (half a GBA screen)")
        if not m.inside(x, y) or C[y][x] not in (".,~" if SURF else ".,"):
            E.append(f"trainer at {x},{y} stands on a blocked cell")
    # boring screens
    interest = set()
    for s, x, y in m.props:
        interest.add((x, y))
    for st in m.structs:
        interest |= st["foot"]
    for k in ("signs", "trainers", "items", "npcs"):
        interest |= {tuple(e["at"]) for e in m.events.get(k, [])}
    boring = []
    for sy in range(0, m.H, vh):
        for sx in range(0, m.W, vw):
            if min(m.W - sx, vw) < vw // 2 or min(m.H - sy, vh) < vh // 2:
                continue                              # a thin leftover strip, not a screen of its own
            cells = [(x, y) for y in range(sy, min(m.H, sy + vh)) for x in range(sx, min(m.W, sx + vw))]
            kinds = {m.grid[y][x] for x, y in cells}
            open_ = sum(1 for x, y in cells if C[y][x] in ".,f")
            if open_ > len(cells) * 0.3 and not any(c in interest for c in cells) and len(kinds) <= 2:
                boring.append((sx, sy))
    if boring:
        Wn.append(f"screens with nothing to look at (top-left cells): {boring}")
    # plain lawn: a cell is plain when it and its 8 neighbours are bare lawn (no prop, no ground patch,
    # no terrain); a screen with many plain cells reads as one flat colour (user, 2026-11-19)
    busy = set(interest) | {(x, y) for s, x, y in m.fences}
    for s, x, y in m.props:
        w, h = GO.PROPS[s]["cells"]
        busy |= {(x + i, y - j) for i in range(w) for j in range(h)}
    marked = {(x, y) for y in range(m.H) for x in range(m.W) if m.grid[y][x] is not None or (x, y) in busy}
    near = set()
    for (x, y) in marked:
        for j in range(-1, 2):
            for i in range(-1, 2):
                near.add((x + i, y + j))
    flat = []
    for sy in range(0, m.H, vh):
        for sx in range(0, m.W, vw):
            if min(m.W - sx, vw) < vw // 2 or min(m.H - sy, vh) < vh // 2:
                continue
            cells = [(x, y) for y in range(sy, min(m.H, sy + vh)) for x in range(sx, min(m.W, sx + vw))]
            plain = sum(1 for c in cells if c not in near)
            if plain > PLAIN_SCREEN * len(cells):
                flat.append(f"{sx},{sy} ({100 * plain // len(cells)} %)")
    if flat:
        Wn.append(f"screens with over {PLAIN_SCREEN:.0%} plain lawn (top-left cells): {', '.join(flat)}; "
                  f"run vary / forest_edge / decorate")
    # dead ends
    items = {tuple(e["at"]) for e in m.events.get("items", [])} | {(x, y) for s, x, y in m.props if s == "item-ball"}
    rewardish = items | {tuple(e["at"]) for k in ("npcs", "trainers") for e in m.events.get(k, [])}
    exit_cells = {c for e in m.exits.values() for c in e["cells"]}
    seen_tips = set()
    for y in range(m.H):
        for x in range(m.W):
            if C[y][x] not in ".,f" or (x, y) in exit_cells:
                continue
            deg = [(x + dx, y + dy) for dx, dy in DIRS4.values()
                   if m.inside(x + dx, y + dy) and C[y + dy][x + dx] in ".,fDv><"]
            if len(deg) != 1:
                continue
            run, cur, last = [(x, y)], deg[0], (x, y)
            while True:
                cx, cy = cur
                if not m.inside(cx, cy) or C[cy][cx] not in ".,f":
                    break
                nb = [(cx + dx, cy + dy) for dx, dy in DIRS4.values()
                      if m.inside(cx + dx, cy + dy) and C[cy + dy][cx + dx] in ".,fDv><" and (cx + dx, cy + dy) != last]
                if len(nb) != 1:
                    break
                run.append(cur)
                last, cur = cur, nb[0]
            if len(run) >= 4 and (x, y) not in seen_tips:
                seen_tips.add((x, y))
                near = any(abs(ix - rx) + abs(iy - ry) <= 2 for rx, ry in run for ix, iy in rewardish)
                if not near:
                    Wn.append(f"dead end {len(run)} cells long ending at {x},{y} has no reward (item, NPC, berry)")
    return routes


def lint_city(m, C, routes, home):
    """Big-city rules measured on 12 Gen 3 cities (docs/explanation/research/gen3-city-layout.md §3-4)."""
    E, Wn, N = m.errors, m.warns, m.notes
    walk = {(x, y) for y in range(m.H) for x in range(m.W) if C[y][x] in ".,fD"}
    pct = 100 * len(walk) / (m.W * m.H)
    if not 30 <= pct <= 60:
        Wn.append(f"city walkable {pct:.0f} % (Gen 3 cities 25-59 %, median ~45 %)")
    # open space: distance from every walkable cell to the nearest obstacle
    dist, frontier = {}, []
    for (x, y) in walk:
        if any(not m.inside(x + dx, y + dy) or (x + dx, y + dy) not in walk for dx, dy in DIRS4.values()):
            dist[(x, y)] = 1
            frontier.append((x, y))
    while frontier:
        nxt = []
        for (x, y) in frontier:
            for dx, dy in DIRS4.values():
                c = (x + dx, y + dy)
                if c in walk and c not in dist:
                    dist[c] = dist[(x, y)] + 1
                    nxt.append(c)
        frontier = nxt
    far = sorted((d, c) for c, d in dist.items() if d > 5)
    near = 100 * sum(1 for d in dist.values() if d <= 2) / max(1, len(dist))
    N.append(f"open space: {near:.0f} % of walkable cells within 2 of an obstacle (Gen 3: 83-100 %)")
    if far:
        Wn.append(f"{len(far)} cells more than 5 from any obstacle, e.g. {far[-1][1]}: an empty field, "
                  f"fill it with trees, lamps, flower beds or a building")
    # Center near the main entrance, gym in the far half
    steps = {lab.split(" ", 1)[1]: r[0][1] for lab, r in routes.items() if lab.startswith("door ")}
    center = min((v for k, v in steps.items() if "center" in k), default=None)
    gyms = {k: v for k, v in steps.items() if k.startswith("gym-")}
    if center is None:
        Wn.append("city has no Pokemon Center")
    elif center > CENTER_STEPS[1]:
        Wn.append(f"Center is {center} steps from the main entrance (Mons: {CENTER_STEPS[0]}-{CENTER_STEPS[1]})")
    if not gyms:
        Wn.append("city has no gym")
    for g, v in gyms.items():
        N.append(f"{g}: {v} steps from the main entrance" + (f", {v / center:.1f}x the Center" if center else ""))
        if center and v < 1.4 * center:
            Wn.append(f"{g} is only {v / center:.1f}x as far as the Center (Gen 3: >= 1.4x, gym in the far half)")
        if v > GYM_MAX:
            Wn.append(f"{g} is {v} steps in (Mons: {GYM_STEPS[0]}-{GYM_STEPS[1]})")
    if m.events.get("trainers"):
        Wn.append("trainers in a city (Gen 3 cities have none)")
    want = m.W * m.H / NPC_CELLS
    npcs = len(m.events.get("npcs", []))
    if npcs < want:
        Wn.append(f"{npcs} NPCs for {m.W * m.H} cells (Mons: at least one per {NPC_CELLS} cells, {want:.0f})")


# ---------------------------------------------------------------- render
def char_scene(m):
    slugs = sorted({s for row in m.grid for s in row if s})
    if len(slugs) > len(CHARS):
        sys.exit("too many terrains in one map")
    chars = {CHARS[i]: s for i, s in enumerate(slugs)}
    back = {s: c for c, s in chars.items()}
    scene = ["".join(back[s] if s else "." for s in row) for row in m.grid]
    return scene, chars


def render(m, night=False):
    scene, chars = char_scene(m)
    used = set(chars.values()) | {m.ground}
    used |= {GO.TERRAIN[s_]["fallback"] for s_ in list(used) if GO.TERRAIN[s_].get("fallback")}
    sheets = {s: GO.build_terrain(s)[0] for s in used}
    ov = {s: GO.build_terrain(s, overlay=True)[0] for s in used if GO.TERRAIN[s]["kind"] == "blob"}
    for s in {p[0] for p in m.props} | {f[0] for f in m.fences}:
        sheets[s] = GO.prop_frames(s, resolve=False)[0]     # contact shade takes this map's ground
    under, over = [], []
    for st in m.structs:
        cell = Image.open(os.path.join(st["dir"], f"{st['slug']}-structure.png")).height
        gpath = os.path.join(st["dir"], f"{st['slug']}-ground.png")
        if os.path.exists(gpath):
            g = Image.open(gpath).convert("RGBA").crop((0, 0, cell, cell))
            under.append((g.resize((cell // 2, cell // 2), Image.NEAREST), st["x"] * TS, st["y"] * TS))
        over.append((GO.load_keyed(os.path.join(st["dir"], f"{st['slug']}-structure.png"), (0, 0, cell, cell)),
                     st["x"] * TS, st["y"] * TS))
    fences = [(x, y, s) for s, x, y in m.fences]
    over += [(img, px, py) for img, px, py, _ in m.pokemon]   # depth-sorted with props by their feet
    if m.mech or m.mgrid or m.triggers:                       # mechanics: art, or a flat placeholder colour
        import cavekit
        over += cavekit.overlay(m)
    if m.kind == "cave":                                     # preview only: the game draws item balls itself
        ball = GO.prop_frames("item-ball")[0]
        for it in m.events.get("items", []):
            if not it.get("hidden") and not it.get("fossil"):
                over.append((ball, it["at"][0] * TS, it["at"][1] * TS))
    base = ground_image(m, sheets[m.ground])
    sheets[m.ground] = Image.new("RGBA", sheets[m.ground].size)    # render_scene lays terrain on nothing
    layer = GO.render_scene(sheets, scene, chars, list(m.props), fences, over, night, under,
                            ground=m.ground, ov_sheets=ov)
    base.alpha_composite(layer)
    return K.up(base)


def ground_image(m, sheet):
    """Base ground (16 px scale): the ground fill, plus each patch of a theme fill as a rounded area
    with a wobbling, darker worn rim and stray specks, so it wears into the lawn instead of being
    stamped on it (same look as the overworld city showcase quarters)."""
    img = Image.new("RGBA", (m.W * TS, m.H * TS))
    nvar = sheet.width // TS
    for y in range(m.H):
        for x in range(m.W):
            v = K.h16(x, y, 9) % nvar
            img.paste(sheet.crop((v * TS, 0, v * TS + TS, TS)), (x * TS, y * TS))
    p = img.load()
    for fill, x0, y0, x1, y1, r, rim, fringe, blend in m.patches:
        sp = GO.build_terrain(fill)[0]
        spx = sp.load()
        nv = sp.width // TS
        X0, Y0, X1, Y1 = x0 * TS, y0 * TS, (x1 + 1) * TS, (y1 + 1) * TS
        R = r * TS
        F = max(fringe * TS, 3)                     # fringe: theme specks thinning out over the lawn
        for py in range(Y0 - F, Y1 + F):
            for px in range(X0 - F, X1 + F):
                if not (0 <= px < m.W * TS and 0 <= py < m.H * TS):
                    continue
                qx = max(X0 + R - px, 0, px - (X1 - R))
                qy = max(Y0 + R - py, 0, py - (Y1 - R))
                straight = qx == 0 or qy == 0
                d = (min(px - X0, X1 - px, py - Y0, Y1 - py) if straight else R - math.hypot(qx, qy))
                d += 2.2 * math.sin(px * 0.21 + py * 0.05) + 1.4 * math.sin(py * 0.31 - px * 0.07)
                cx, cy = px // TS, py // TS
                col = spx[(K.h16(cx, cy, 9) % nv) * TS + px % TS, py % TS]
                if blend:                           # lift the theme ground toward the lawn: an accent, not a stain
                    lawn = p[px, py]
                    col = tuple(int(c1 * (1 - blend) + c2 * blend) for c1, c2 in zip(col[:3], lawn[:3])) + (255,)
                if d < 0:
                    # 2x2-pixel clusters (never single-pixel noise), ~25 % at the edge down to 0 at the fringe
                    chance = 0.25 * (1 + d / F)
                    if chance > 0 and K.h16(px // 2, py // 2, 77) < chance * 255:
                        p[px, py] = col
                    continue
                if rim == "dark" and d < 1.2:
                    col = tuple(int(ch * 0.76) for ch in col[:3]) + (255,)
                elif rim == "light" and d < 1.2:
                    col = tuple(min(255, int(ch * 1.12)) for ch in col[:3]) + (255,)
                p[px, py] = col
    return img


def debug_overlay(img, m, C, routes):
    img = img.convert("RGBA")
    layer = Image.new("RGBA", img.size)
    d = ImageDraw.Draw(layer)
    s = OUT_TS
    tint = {"#": (200, 30, 30, 70), "~": (30, 90, 220, 70), "v": (250, 200, 0, 110), ">": (250, 200, 0, 110),
            "<": (250, 200, 0, 110), "D": (255, 0, 255, 120), "H": (255, 120, 0, 120), ",": (0, 160, 0, 40),
            "S": (0, 230, 230, 150), "c": (255, 150, 0, 90), "^": (250, 200, 0, 110), "B": (140, 140, 140, 150),
            "G": (250, 230, 0, 130), "X": (120, 120, 140, 150), "l": (255, 60, 60, 150), "o": (255, 255, 255, 110),
            "L": (255, 80, 0, 130), "i": (160, 230, 255, 110), "r": (150, 110, 70, 130)}
    for y, row in enumerate(C):
        for x, c in enumerate(row):
            if c in tint:
                d.rectangle([x * s, y * s, x * s + s - 1, y * s + s - 1], fill=tint[c])
    vw, vh = m.view
    for x in range(0, m.W + 1, vw):
        d.line([x * s, 0, x * s, m.H * s], fill=(255, 255, 255, 120), width=2)
    for y in range(0, m.H + 1, vh):
        d.line([0, y * s, m.W * s, y * s], fill=(255, 255, 255, 120), width=2)
    for out, back in routes.values():
        for path, col in ((out[0], (255, 255, 255, 220)), (back[0], (40, 40, 40, 220))):
            pts = [(x * s + s // 2 + (4 if col[0] < 100 else -4), y * s + s // 2) for x, y in path]
            if len(pts) > 1:
                d.line(pts, fill=col, width=3)
    for t in m.events.get("trainers", []):
        x, y = t["at"]
        dx, dy = DIRS4[t.get("facing", "S")]
        for k in range(1, t.get("sight", 4) + 1):
            d.rectangle([(x + dx * k) * s + 8, (y + dy * k) * s + 8, (x + dx * k) * s + s - 8,
                         (y + dy * k) * s + s - 8], fill=(255, 60, 60, 120))
    img.alpha_composite(layer)
    return img


# ---------------------------------------------------------------- Tiled export
def rel(path, start):
    return os.path.relpath(path, start).replace(os.sep, "/")


def piece_folder(slug):
    idx = index_slugs()
    if slug in idx:
        return os.path.join(OVERWORLD, idx[slug]["dir"].replace("\\", "/"))
    hits = glob.glob(os.path.join(OVERWORLD, "**", slug), recursive=True)
    return hits[0] if hits else None


def overlay_tileset(slug, outdir):
    """Map-local copy of a blob terrain's .tsj that points at the transparent-outside sheet, so a
    blob laid on a non-grass ground shows no grass rim."""
    folder = piece_folder(slug)
    src = os.path.join(folder, f"{slug}.tsj")
    d = json.load(open(src))
    img = d["image"]
    cand = img.replace("-anim.png", "-overlay-anim.png") if img.endswith("-anim.png") else img.replace(".png", "-overlay.png")
    if os.path.exists(os.path.join(folder, cand)):
        img = cand
    d["image"] = rel(os.path.join(folder, img), outdir)
    d["name"] = f"{slug}-overlay"
    os.makedirs(outdir, exist_ok=True)
    out = os.path.join(outdir, f"{slug}-overlay.tsj")
    json.dump(d, open(out, "w"), indent=1)
    return out


def export_tiled(m, outdir, C):
    scene, chars = char_scene(m)
    tidal = bool(m.tide["flood"] or m.tide["seal"])
    if tidal:                                   # the high-tide terrain goes in its own (hidden) tile layer
        import cavekit
        low = m.grid
        m.grid = cavekit.high_grid(m)
        scene_h, chars_h = char_scene(m)
        m.grid = low
    tdir = os.path.join(os.path.dirname(os.path.abspath(outdir)), "_tilesets")   # beside the map folders (assets/maps)
    tilesets, first = [], {}
    gid = 1

    def add_ts(key, path):
        nonlocal gid
        d = json.load(open(path))
        first[key] = gid
        tilesets.append({"firstgid": gid, "source": rel(path, outdir)})
        gid += d["tilecount"]
        return d

    meta = {}
    gfold = piece_folder(m.ground)
    meta[m.ground] = add_ts(m.ground, os.path.join(gfold, f"{m.ground}.tsj"))
    allc = set(chars.values()) | (set(chars_h.values()) if tidal else set())
    terr = sorted(allc | {GO.TERRAIN[s_]["fallback"] for s_ in allc if GO.TERRAIN[s_].get("fallback")})
    for s in terr:
        if s == m.ground:
            continue
        kind = GO.TERRAIN[s]["kind"]
        path = overlay_tileset(s, tdir) if kind == "blob" else os.path.join(piece_folder(s), f"{s}.tsj")
        meta[s] = add_ts(s, path)
    ground = []
    nvar = meta[m.ground]["tilecount"]
    for y in range(m.H):
        for x in range(m.W):
            ground.append(first[m.ground] + K.h16(x, y, 9) % nvar)
    def terrain_data(scene, chars):
        terrain = [0] * (m.W * m.H)
        for y in range(m.H):
            for x in range(m.W):
                ch = scene[y][x]
                s = chars.get(ch)
                if not s or s == m.ground:
                    continue
                spec = GO.TERRAIN[s]
                if spec["kind"] == "quad":
                    bx, by = x - x % 2, y - y % 2
                    if all(by + j < m.H and bx + i < m.W and scene[by + j][bx + i] == ch for i in (0, 1) for j in (0, 1)):
                        terrain[y * m.W + x] = first[s] + (y % 2) * meta[s]["columns"] + (x % 2)
                        continue
                    s = spec["fallback"]
                    spec = GO.TERRAIN[s]
                if spec["kind"] == "blob":
                    msk = GO.terrain_mask(scene, chars, x, y, s)
                    terrain[y * m.W + x] = first[s] + K.blob_index(msk)
                elif spec["kind"] == "row":
                    terrain[y * m.W + x] = first[s] + K.row_index(scene, x, y, lambda q, ch=ch: q == ch, spec["axis"])
                elif spec["kind"] == "fill":
                    terrain[y * m.W + x] = first[s] + K.h16(x, y, 9) % meta[s]["tilecount"]
        return terrain
    terrain = terrain_data(scene, chars)
    # object collection tileset (props, fence tiles, structures, contact lines)
    sdir = os.path.join(tdir, "structures")
    os.makedirs(sdir, exist_ok=True)
    images = []

    def image_id(path):
        if path not in images:
            images.append(path)
        return images.index(path)

    oid = 1
    fset = {(x, y): s for s, x, y in m.fences}
    items = []
    # props carry a contact shade painted in their owner's ground colour; re-shade them for THIS
    # map's ground (same as the preview) into assets/maps/_tilesets/props/<ground>/
    pdir = os.path.join(tdir, "props", m.ground)
    os.makedirs(pdir, exist_ok=True)
    shade = GO.ground_shade(m.ground)

    def shaded(s, mask=None):
        name = f"{s}.png" if mask is None else f"{s}-{GO.cross_code(mask)}.png"
        out = os.path.join(pdir, name)
        sheet = GO.keyed_shade(GO.prop_frames(s, resolve=False)[0].copy(), shade)
        if mask is not None:
            sheet = sheet.crop((mask * TS, 0, mask * TS + TS, TS))
        K.up(sheet).save(out)
        return out

    for s, x, y in m.props:
        items.append(((y + 1), x, s, shaded(s), x * OUT_TS, (y + 1) * OUT_TS))
    mech_art = []                               # one image per resolved mechanic art role, for the game to draw
    if m.mech or any(t["kind"] == "cart" for t in m.triggers.values()) or "L" in m.mgrid.values():
        import cavekit
        for role, s in sorted(cavekit.art(m).items()):
            if s in GO.PROPS:
                mech_art.append((role, shaded(s)))
    for s, x, y in m.fences:
        msk = sum(b for b, (dx, dy) in ((1, (0, -1)), (2, (1, 0)), (4, (0, 1)), (8, (-1, 0)))
                  if fset.get((x + dx, y + dy)) == s)
        items.append(((y + 1), x, s, shaded(s, msk), x * OUT_TS, (y + 1) * OUT_TS))
    shadows = []
    for st in m.structs:
        src = os.path.join(st["dir"], f"{st['slug']}-structure.png")
        cell = Image.open(src).height
        out = os.path.join(sdir, f"{st['slug']}-structure.png")
        if not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(src):
            k = GO.load_keyed(src, (0, 0, cell, cell))
            k.resize((cell, cell), Image.NEAREST).save(out)
        items.append((st["y"] + st["n"], st["x"], st["slug"], out, st["x"] * OUT_TS, (st["y"] + st["n"]) * OUT_TS))
        g = os.path.join(st["dir"], f"{st['slug']}-ground.png")
        if os.path.exists(g):
            gout = os.path.join(sdir, f"{st['slug']}-ground.png")
            Image.open(g).convert("RGBA").crop((0, 0, cell, cell)).save(gout)
            shadows.append((st["slug"] + "-ground", gout, st["x"] * OUT_TS, (st["y"] + st["n"]) * OUT_TS))
    obj_layer, shadow_layer = [], []
    ofirst = gid
    for name, p, px, py in shadows:
        shadow_layer.append({"id": oid, "name": name, "gid": ofirst + image_id(p), "x": px, "y": py,
                             "width": Image.open(p).width, "height": Image.open(p).height, "visible": True})
        oid += 1
    for _, _, s, p, px, py in sorted(items, key=lambda t: (t[0], t[1])):
        im = Image.open(p)
        obj_layer.append({"id": oid, "name": s, "gid": ofirst + image_id(p), "x": px, "y": py,
                          "width": im.width, "height": im.height, "visible": True})
        oid += 1
    art_layer = []
    for role, p in mech_art:
        im = Image.open(p)
        art_layer.append({"id": oid, "name": role, "gid": ofirst + image_id(p), "x": 0, "y": im.height,
                          "width": im.width, "height": im.height, "visible": False})
        oid += 1
    tiles = []
    for i, p in enumerate(images):
        im = Image.open(p)
        tiles.append({"id": i, "image": rel(p, outdir), "imagewidth": im.width, "imageheight": im.height})
    ots = {"type": "tileset", "version": "1.10", "name": f"{m.slug}-objects", "columns": 0, "margin": 0,
           "spacing": 0, "tilecount": len(images), "tilewidth": max([t["imagewidth"] for t in tiles] or [32]),
           "tileheight": max([t["imageheight"] for t in tiles] or [32]),
           "grid": {"orientation": "orthogonal", "width": 1, "height": 1}, "tiles": tiles}
    ots_path = os.path.join(outdir, f"{m.slug}-objects.tsj")
    json.dump(ots, open(ots_path, "w"), indent=1)
    tilesets.append({"firstgid": ofirst, "source": rel(ots_path, outdir)})
    # events: warps, exits, signs, trainers, items, npcs
    ev = []

    def rect_obj(name, typ, x, y, w=1, h=1, props=None):
        nonlocal oid
        o = {"id": oid, "name": name, "type": typ, "x": x * OUT_TS, "y": y * OUT_TS, "width": w * OUT_TS,
             "height": h * OUT_TS, "visible": True,
             "properties": [{"name": k, "type": "string", "value": str(v)} for k, v in (props or {}).items()]}
        oid += 1
        ev.append(o)

    for st in m.structs:
        for (x, y) in sorted(st["doors"]):
            rect_obj(f"{st['slug']}-door", "warp", x, y, props={"to": st["to"]})
    for wp in m.warps:
        for (x, y) in sorted(wp["doors"]):
            rect_obj(f"{wp['slug']}-door", "warp", x, y, props={"to": wp["to"]})
    for (x, y), t in sorted(m.triggers.items()):
        rect_obj(f"{t['kind']}-{t.get('id', '')}".rstrip("-"), t["kind"], x, y,
                 props={k: v for k, v in t.items() if k not in ("kind", "x", "y")})
    for e in m.mech:                            # mechanics: the game draws and changes them (cavekit.MECH_CHAR)
        rect_obj(e.get("slug") or e["kind"], e["kind"], e["x"], e["y"],
                 props={k: v for k, v in e.items() if k not in ("kind", "x", "y", "slug")})
    for name, ex in m.exits.items():
        xs = [c[0] for c in ex["cells"]] or [0]
        ys = [c[1] for c in ex["cells"]] or [0]
        rect_obj(f"exit-{name}", "connection", min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1,
                 {"side": ex["side"], "to": ex.get("to") or ""})
    for k, typ in (("signs", "sign"), ("trainers", "trainer"), ("items", "item"), ("npcs", "npc")):
        for e in m.events.get(k, []):
            x, y = e["at"]
            rect_obj(e.get("name", typ), typ, x, y, props={a: b for a, b in e.items() if a not in ("at", "name")})
    ground_layer = {"id": 1, "name": "ground", "type": "tilelayer", "width": m.W, "height": m.H, "x": 0, "y": 0,
                    "opacity": 1, "visible": True, "data": ground}
    if m.patches:            # blended theme patches are not on the tile grid: ship the ground as one image
        gimg = K.up(ground_image(m, GO.build_terrain(m.ground)[0]))
        gimg.save(os.path.join(outdir, f"{m.slug}-ground.png"))
        ground_layer = {"id": 1, "name": "ground", "type": "imagelayer", "image": f"{m.slug}-ground.png",
                        "x": 0, "y": 0, "opacity": 1, "visible": True}
    layers = [
        ground_layer,
        {"id": 2, "name": "terrain", "type": "tilelayer", "width": m.W, "height": m.H, "x": 0, "y": 0,
         "opacity": 1, "visible": True, "data": terrain},
        {"id": 3, "name": "shadows", "type": "objectgroup", "draworder": "index", "opacity": 1, "visible": True,
         "x": 0, "y": 0, "objects": shadow_layer},
        {"id": 4, "name": "objects", "type": "objectgroup", "draworder": "topdown", "opacity": 1, "visible": True,
         "x": 0, "y": 0, "objects": obj_layer},
        {"id": 5, "name": "events", "type": "objectgroup", "draworder": "index", "opacity": 1, "visible": True,
         "x": 0, "y": 0, "objects": ev},
    ]
    nid = 6
    if art_layer:
        layers.append({"id": nid, "name": "mech-art", "type": "objectgroup", "draworder": "index", "opacity": 1,
                       "visible": False, "x": 0, "y": 0, "objects": art_layer})
        nid += 1
    if tidal:
        layers.append({"id": nid, "name": "terrain-high", "type": "tilelayer", "width": m.W, "height": m.H, "x": 0,
                       "y": 0, "opacity": 1, "visible": False, "data": terrain_data(scene_h, chars_h)})
        nid += 1
    props = [{"name": "theme", "type": "string", "value": m.theme},
             {"name": "kind", "type": "string", "value": m.kind},
             {"name": "border", "type": "string", "value": m.border or ""},
             {"name": "collision", "type": "file", "value": f"{m.slug}-collision.txt"}]
    for k, v in sorted(m.spec.get("cave", {}).items()):      # caves: name, floor, dark, below, group
        props.append({"name": k, "type": "bool" if isinstance(v, bool) else "string", "value": v})
    if m.placeholders:                          # mechanics with no art yet: the game draws a flat colour
        props.append({"name": "placeholders", "type": "string", "value": ",".join(sorted(m.placeholders))})
    if tidal:
        props.append({"name": "collision_high", "type": "file", "value": f"{m.slug}-collision-high.txt"})
    tmj = {"type": "map", "version": "1.10", "tiledversion": "1.10.2", "orientation": "orthogonal",
           "renderorder": "right-down", "width": m.W, "height": m.H, "tilewidth": OUT_TS, "tileheight": OUT_TS,
           "infinite": False, "nextlayerid": nid, "nextobjectid": oid, "layers": layers, "tilesets": tilesets,
           "properties": props}
    json.dump(tmj, open(os.path.join(outdir, f"{m.slug}.tmj"), "w"), indent=1)


# ---------------------------------------------------------------- commands
def cmd_themes():
    for name, t in THEMES.items():
        if not name.startswith("_"):
            print(f"{name:12s} {t['brief']}")


def nature_slugs(theme):
    """Every piece the theme's `nature` kit names (patches, swaps, flowers, trees, floor, vignettes)."""
    kit = THEMES[theme].get("nature", {})
    out = []

    def add(x):
        if isinstance(x, str):
            if x != "*flowers" and x not in out:
                out.append(x)
        elif isinstance(x, (list, tuple)):
            for y in x:
                add(y)
    add([v[0] for v in kit.get("vary", [])])
    add(list(kit.get("swap", {}).values()))
    for key in ("flowers", "canopy", "alt"):
        add(kit.get(key, []))
    for key in ("trees", "floor", "bushes"):
        add([v[0] for v in kit.get(key, [])])
    for ctx in list(kit.get("more", {}).values()) + list(kit.get("kits", {}).values()):
        for vig in ctx:
            add([it[0] for it in vig])
    if kit.get("pond", {}).get("t"):
        add(kit["pond"]["t"])
    return out


def cmd_inventory(theme):
    if theme not in THEMES:
        sys.exit(f"unknown theme '{theme}'")
    idx = index_slugs()
    todo = []
    print(f"theme {theme}: {THEMES[theme]['brief']}\n")
    for role in THEMES["_roles"]:
        cands = THEMES[theme].get(role, [])
        if not cands:
            continue
        marks = []
        for c in cands:
            k = piece_kind(c)
            if not k:
                marks.append(f"{c} [MISSING]")
                todo.append((role, c))
            elif not exported(c, idx):
                marks.append(f"{c} [in code, not exported]")
                todo.append((role, c))
            else:
                marks.append(c)
        print(f"  {role:9s} " + ", ".join(marks))
    kit = nature_slugs(theme)
    if kit:
        marks = []
        for c in kit:
            if not piece_kind(c):
                marks.append(f"{c} [MISSING]")
                todo.append(("nature", c))
            elif not exported(c, idx):
                marks.append(f"{c} [in code, not exported]")
                todo.append(("nature", c))
        print(f"  {'nature':9s} {len(kit)} kit pieces (themes.json `nature`)" + (": " + ", ".join(marks) if marks else ", all exported"))
    if todo:
        print("\nto create or export:")
        for role, c in todo:
            skill = "expedition-structure-generator" if role in ("center", "mart", "house", "gym", "special") \
                else "expedition-overworld-generator"
            print(f"  {c:24s} role {role:9s} -> {skill}")


def cmd_build(path, debug=False):
    m = build(path, debug)
    bad = m.errors
    if m.kind == "cave" and m.spec.get("cave", {}).get("group"):
        bad = bad or cmd_cave(m.spec["cave"]["group"], quiet_missing=True, exit=False,
                              maps_dir=os.path.dirname(os.path.dirname(os.path.abspath(path))))
    sys.exit(1 if bad else 0)


def cave_floors(group, maps_dir=MAPS):
    out = []
    for path in sorted(glob.glob(os.path.join(maps_dir, "*", "*.map.json"))):
        try:
            sp = json.load(open(path))
        except ValueError:
            continue
        if sp.get("kind") == "cave" and sp.get("cave", {}).get("group") == group:
            out.append(sp["slug"])
    return out


def cmd_cave(group, quiet_missing=False, exit=True, maps_dir=MAPS):
    """Check every floor of one cave together: cavekit.check_cave (ladder pairs, landings, pockets) and
    cavekit.solve_cave (the mechanics played from every mouth), at both tides when a floor has a tide op."""
    import cavekit
    slugs = cave_floors(group, maps_dir)
    built = [s_ for s_ in slugs if os.path.exists(os.path.join(maps_dir, s_, f"{s_}.tmj"))]
    if len(built) < len(slugs):
        if not quiet_missing:
            print("not built yet:", ", ".join(sorted(set(slugs) - set(built))))
        if exit:
            sys.exit(1)
        return []
    tides = ["low"]
    if any(os.path.exists(os.path.join(maps_dir, s_, f"{s_}-collision-high.txt")) for s_ in slugs):
        tides.append("high")
    errs, notes = [], []
    for td in tides:
        for fn in (cavekit.check_cave, cavekit.solve_cave):
            e_, n_ = fn(maps_dir, slugs, td)
            errs += [f"[{td}] {x}" if fn is cavekit.check_cave and len(tides) > 1 else x for x in e_]
            notes += n_
    print(f"cave {group}: " + "; ".join(notes))
    for e in errs:
        print("CAVE ERROR", e)
    print(f"cave {group}: {len(errs)} errors")
    if exit:
        sys.exit(1 if errs else 0)
    return errs


def build(path, debug=False, quiet=False):
    spec = json.load(open(path))
    m = Map(spec, path)
    for op in spec.get("ops", []):
        m.apply(op)
    m.flush_pending()
    import cavekit
    cavekit.convert_hm_props(m)                # Rock Smash rocks and Cut trees are game-driven mechanics
    if m.kind == "cave":
        cavekit.faces(m)
    outdir = os.path.dirname(os.path.abspath(path))
    if m.errors and any("does not exist" in e or "no existing piece" in e for e in m.errors):
        print("\n".join("ERROR " + e for e in m.errors))
        print("missing pieces:", ", ".join(sorted(m.missing)), "-> run `mapgen.py inventory", m.theme + "`")
        sys.exit(1)
    idx = index_slugs()
    used = {s_ for row in m.grid for s_ in row if s_} | {m.ground} | {p_[0] for p_ in m.props} | {f_[0] for f_ in m.fences}
    used |= {GO.TERRAIN[s_]["fallback"] for s_ in list(used) if s_ in GO.TERRAIN and GO.TERRAIN[s_].get("fallback")}
    unexported = sorted(s_ for s_ in used if s_ not in idx)
    if unexported:
        print("ERROR pieces exist in code but are not exported:", ", ".join(unexported))
        print("-> run gen_overworld.py (--gym <type> for theme pieces), then build again")
        sys.exit(1)
    C = m.collision()
    if m.kind == "cave":
        import cavekit
        routes = cavekit.lint(m, C)
    else:
        routes = lint(m, C)
    open(os.path.join(outdir, f"{m.slug}-collision.txt"), "w").write("\n".join("".join(r) for r in C) + "\n")
    img = render(m)
    img.save(os.path.join(outdir, f"{m.slug}.png"))
    if m.tide["flood"] or m.tide["seal"]:       # tide: the high-tide variant of the same map
        Ch = m.collision("high")
        open(os.path.join(outdir, f"{m.slug}-collision-high.txt"), "w").write("\n".join("".join(r) for r in Ch) + "\n")
        low = m.grid
        m.grid = cavekit.high_grid(m)
        render(m).save(os.path.join(outdir, f"{m.slug}-high.png"))
        m.grid = low
        m.notes.append(f"tide: {len(m.tide['flood'])} cells flood, {len(m.tide['seal'])} seal at high tide")
    if m.placeholders:
        m.notes.append("mechanics drawn as placeholders (no piece yet): " + ", ".join(sorted(m.placeholders)))
    if debug:
        debug_overlay(img.copy(), m, C, routes).save(os.path.join(outdir, f"{m.slug}-debug.png"))
    export_tiled(m, outdir, C)
    unused = sorted(m.missing)
    lines = [f"# {m.slug} ({m.kind}, theme {m.theme})", ""]
    lines += [f"- ERROR {e}" for e in m.errors] + [f"- WARN {w}" for w in m.warns] + [f"- note {n}" for n in m.notes]
    if unused:
        lines.append(f"- note theme candidates not created yet (fallbacks used): {', '.join(unused)}")
    open(os.path.join(outdir, f"{m.slug}-report.md"), "w").write("\n".join(lines) + "\n")
    if not quiet:
        print("\n".join(lines[2:]))
        print(f"\nwrote {rel(outdir, REPO)}/{m.slug}.png .tmj -objects.tsj -collision.txt -report.md"
              + (" -debug.png" if debug else ""))
    print(f"{m.slug}: {len(m.errors)} errors, {len(m.warns)} warnings")
    m.C = C
    return m


# ---------------------------------------------------------------- world: maps placed side by side
SIDE_DIR = {"N": "up", "S": "down", "W": "left", "E": "right"}
OPP = {"N": "S", "S": "N", "E": "W", "W": "E"}


def world_links(maps, pos):
    """Every pair of maps whose rectangles touch along an edge: (a, side of a, b, offset, overlap
    span in world coords along the edge). Offset is Gen 3's: b's start minus a's start along the edge."""
    links = []
    for a in maps:
        ax, ay = pos[a]
        aw, ah = maps[a].W, maps[a].H
        for b in maps:
            if a == b:
                continue
            bx, by = pos[b]
            bw, bh = maps[b].W, maps[b].H
            for side, touch, a0, a1, b0, b1 in (
                    ("N", by + bh == ay, ax, ax + aw, bx, bx + bw), ("S", ay + ah == by, ax, ax + aw, bx, bx + bw),
                    ("W", bx + bw == ax, ay, ay + ah, by, by + bh), ("E", ax + aw == bx, ay, ay + ah, by, by + bh)):
                lo, hi = max(a0, b0), min(a1, b1)
                if touch and hi > lo:
                    links.append((a, side, b, b0 - a0, (lo, hi)))
    return links


def edge_cells(m, side, world_lo, world_hi, origin):
    """Walkability of a map's edge row/column between two world coordinates along that edge."""
    ox, oy = origin
    out = []
    for w in range(world_lo, world_hi):
        x, y = {"N": (w - ox, 0), "S": (w - ox, m.H - 1), "W": (0, w - oy), "E": (m.W - 1, w - oy)}[side]
        out.append(m.C[y][x] in ".,fv><~")          # land or surfable water both carry across a seam
    return out


def cmd_world(path, debug=False):
    spec = json.load(open(path))
    base = os.path.dirname(os.path.abspath(path))
    pos = {k: tuple(v["at"] if isinstance(v, dict) else v) for k, v in spec["maps"].items()}
    maps = {}
    for slug in pos:
        maps[slug] = build(os.path.join(base, slug, f"{slug}.map.json"), debug, quiet=True)
    errors, warns, notes = [], [], []
    links = world_links(maps, pos)
    conns = {k: [] for k in maps}
    for a, side, b, off, (lo, hi) in links:
        ea = edge_cells(maps[a], side, lo, hi, pos[a])
        eb = edge_cells(maps[b], OPP[side], lo, hi, pos[b])
        axis = "x" if side in "NS" else "y"
        bad = [lo + i for i, (u, v) in enumerate(zip(ea, eb)) if u != v]
        both = [lo + i for i, (u, v) in enumerate(zip(ea, eb)) if u and v]
        if any(ea) and not both:
            errors.append(f"seam {a} {side} | {b}: {a} is open at the seam but {b} is closed everywhere opposite")
        elif bad and side in "NW":       # report each seam once
            warns.append(f"seam {a} {side} | {b}: open on one side only at world {axis} {bad[:8]}"
                         f"{'...' if len(bad) > 8 else ''} (a funnel; Gen 3 allows it, cell-for-cell reads cleaner)")
        # Emerald: 0 of 128 seams have tall grass in the strip the camera shows across the seam
        m = maps[a]
        ox, oy = pos[a]
        for w in range(lo, hi):
            for k in range(SEAM_GRASS):
                x, y = {"N": (w - ox, k), "S": (w - ox, m.H - 1 - k), "W": (k, w - oy), "E": (m.W - 1 - k, w - oy)}[side]
                if m.C[y][x] == ",":
                    warns.append(f"{a}: tall grass at {x},{y} within {SEAM_GRASS} cells of the seam to {b}")
                    break
            else:
                continue
            break
        if any(ea):
            conns[a].append({"direction": SIDE_DIR[side], "map": b, "offset": off})
    for slug, m in maps.items():
        linked = {(c["direction"]) for c in conns[slug]}
        for name, ex in m.exits.items():
            if SIDE_DIR[ex["side"]] not in linked:
                (errors if ex.get("to") in maps else notes).append(
                    f"{slug}: exit {name} ({ex['side']}) has no neighbour in the world (to: {ex.get('to')})")
            elif ex.get("to") and ex["to"] in maps and not any(
                    c["map"] == ex["to"] and c["direction"] == SIDE_DIR[ex["side"]] for c in conns[slug]):
                notes.append(f"{slug}: exit {name} says to {ex['to']} but touches another map")
        # write the Gen 3 connections into the map's Tiled file
        tp = os.path.join(base, slug, f"{slug}.tmj")
        t = json.load(open(tp))
        t["properties"] = [q for q in t["properties"] if q["name"] != "connections"]
        t["properties"].append({"name": "connections", "type": "string", "value": json.dumps(conns[slug])})
        json.dump(t, open(tp, "w"), indent=1)
    # overview image at quarter scale (8 px per cell)
    x0 = min(p[0] for p in pos.values())
    y0 = min(p[1] for p in pos.values())
    x1 = max(pos[k][0] + maps[k].W for k in maps)
    y1 = max(pos[k][1] + maps[k].H for k in maps)
    sc = spec.get("overview_px", 8)
    img = Image.new("RGB", ((x1 - x0) * sc, (y1 - y0) * sc), (24, 28, 36))
    block = K.up(GO.build_terrain("tree-wall")[0]).convert("RGB").resize((2 * sc, 2 * sc), Image.LANCZOS)
    for by in range(0, img.height, 2 * sc):          # empty land between maps reads as forest, not void
        for bx in range(0, img.width, 2 * sc):
            img.paste(block, (bx, by))
    d = ImageDraw.Draw(img)
    for k, m in maps.items():
        im = Image.open(os.path.join(base, k, f"{k}.png")).convert("RGB").resize((m.W * sc, m.H * sc), Image.LANCZOS)
        px, py = (pos[k][0] - x0) * sc, (pos[k][1] - y0) * sc
        img.paste(im, (px, py))
        d.rectangle([px, py, px + m.W * sc - 1, py + m.H * sc - 1], outline=(255, 255, 255))
        d.rectangle([px + 2, py + 2, px + 8 + 6 * len(k), py + 14], fill=(0, 0, 0))
        d.text((px + 5, py + 3), k, fill=(255, 255, 255))
    out = os.path.join(base, spec.get("name", "world") + ".png")
    img.save(out)
    lines = [f"# world {spec.get('name', 'world')}", ""]
    lines += [f"- ERROR {e}" for e in errors] + [f"- WARN {w}" for w in warns] + [f"- note {n}" for n in notes]
    lines += ["", "| map | connections |", "|---|---|"]
    lines += [f"| {k} | " + ", ".join(f"{c['direction']} → {c['map']} ({c['offset']:+d})" for c in conns[k]) + " |"
              for k in maps]
    open(os.path.join(base, spec.get("name", "world") + "-report.md"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines[2:]))
    total = sum(len(m.errors) for m in maps.values())
    print(f"\nwrote {rel(out, REPO)}; world: {len(errors)} seam/link errors, map errors {total}")
    sys.exit(1 if errors or total else 0)


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return
    if argv[0] == "themes":
        cmd_themes()
    elif argv[0] == "inventory":
        cmd_inventory(argv[1])
    elif argv[0] == "build":
        cmd_build(argv[1], "--debug" in argv)
    elif argv[0] == "walk":
        cmd_walk(argv[1], argv[2:])
    elif argv[0] == "cave":
        d = argv[argv.index("--dir") + 1] if "--dir" in argv else MAPS
        cmd_cave(argv[1], maps_dir=os.path.abspath(d))
    elif argv[0] == "world":
        cmd_world(argv[1], "--debug" in argv)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
