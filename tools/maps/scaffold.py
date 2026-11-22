#!/usr/bin/env python3
"""
Scaffold map specs from a world table, the Gen 3 way.

  python3 scaffold.py assets/maps/world.json [slug ...] [--force]

A world entry may be a plain position `[x, y]` (a hand-made map: its spec is the source of truth) or
an object that asks for a scaffold:

  "flint-city": {"at": [312, -240], "size": [96, 80], "kind": "city", "theme": "quarry", "gym": "rock"}
  "route-14":   {"at": [384, -80], "size": [240, 40], "kind": "route", "theme": "canyon"}
  "route-8":    {"at": [432, 20], "size": [264, 80], "kind": "route", "theme": "lagoon", "sea": true}

For every scaffolded map it works out the exits from the world: two maps that touch along an edge
get an exit on the same world cells (an existing exit of a hand-made neighbour wins, otherwise the
middle of the shared span), and the exit toward the start map (`"start"` in the world file) is home.
Then it lays the map out with the rules in ../SKILL.md (routes: winding lane, grass beside it, ledges
toward home, a landmark every 60x40, trainers, signs; towns and cities: streets between exits, Center
near home, Mart beside it, the gym quarter in the far half, houses on the streets, lamps, dress),
builds it, and retries with another seed while the lint reports errors. The written spec is the
source of truth from then on: edit it by hand and rebuild with `mapgen.py build`.

`--force` rescaffolds over an existing spec but keeps its hand ops: every `cave_entrance` op and every op
marked `"hand": true` is carried over and applied after the new layout (HAND_OPS).
"""
import json
import os
import random
import sys
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
# ops a rescaffold (--force) keeps from the old spec: placed by hand or by another step (cave mouths, mechanics)
HAND_OPS = ("cave_entrance",)


def hand_ops(path):
    """The ops of an existing spec that --force must keep (HAND_OPS, or `"hand": true`)."""
    try:
        old = json.load(open(path))
    except (OSError, ValueError):
        return []
    return [op for op in old.get("ops", []) if op.get("op") in HAND_OPS or op.get("hand")]
sys.path.insert(0, HERE)
import mapgen as MG  # noqa: E402

GO = MG.GO
S = MG.MAP_SCALE                 # x2 since 2026-11-19: the view is 40x22.5 cells (see mapgen.VIEW)
EXIT = 6                         # default land exit width (Mons: 4-8, cities 4-10)
LANE = {"route": 4, "town": 3, "city": 4}      # main lane / street width
GYM_KIT = {
    "electric": ["electric-cable-spool", "electric-capacitor-bank", "electric-hazard-cone", "electric-transformer"],
    "fire": ["fire-ember-vent", "fire-charred-tree", "fire-magma-crack", "fire-lava-rock"],
    "grass": ["grass-sunflowers", "grass-fern-urn", "grass-topiary", "grass-bench"],
    "psychic": ["psychic-standing-stone", "psychic-crystal", "psychic-obelisk", "psychic-crystal"],
    "water": ["water-coral", "water-starfish", "water-anchor", "water-lily-pads"],
    "ground": ["ground-clay-pots", "ground-water-trough", "ground-saguaro", "ground-tumbleweed"],
    "poison": ["poison-toadstools", "poison-cattails", "poison-cauldron", "poison-slime-barrel"],
    "rock": ["rock-minecart", "rock-ore-crate", "rock-crystal-cluster", "rock-rubble"],
}
ACCENT = {t: f"{t}-ground" for t in GYM_KIT}
LIGHT_FLOOR = {"fire": "@plaza", "poison": "@plaza"}           # their own paving is too dark for a court
TRAINERS = ["youngster", "lass", "hiker", "camper", "picnicker", "bug-catcher", "fisher", "black-belt",
            "ruin-maniac", "kindler", "psychic", "swimmer", "sailor", "beauty"]


# ---------------------------------------------------------------- world geometry
def load_world(path):
    w = json.load(open(path))
    base = os.path.dirname(os.path.abspath(path))
    maps = {}
    for slug, v in w["maps"].items():
        if isinstance(v, dict):
            maps[slug] = dict(v, slug=slug, at=tuple(v["at"]))
        else:
            spec = json.load(open(os.path.join(base, slug, f"{slug}.map.json")))
            maps[slug] = dict(slug=slug, at=tuple(v), size=spec["size"], kind=spec["kind"], theme=spec["theme"],
                              sea=bool(spec.get("surf")), handmade=True, spec=spec)
    return w, base, maps


def touching(maps):
    """(a, side of a, b, lo, hi) for every pair of maps sharing an edge span (world coords)."""
    out = []
    for a in maps.values():
        ax, ay = a["at"]
        aw, ah = a["size"]
        for b in maps.values():
            if a is b:
                continue
            bx, by = b["at"]
            bw, bh = b["size"]
            for side, ok, a0, a1, b0, b1 in (
                    ("N", by + bh == ay, ax, ax + aw, bx, bx + bw), ("S", ay + ah == by, ax, ax + aw, bx, bx + bw),
                    ("W", bx + bw == ax, ay, ay + ah, by, by + bh), ("E", ax + aw == bx, ay, ay + ah, by, by + bh)):
                lo, hi = max(a0, b0), min(a1, b1)
                if ok and hi - lo >= 4:
                    out.append((a["slug"], side, b["slug"], lo, hi))
    return out


OPP = {"N": "S", "S": "N", "E": "W", "W": "E"}


def existing_exit(m, side):
    """World span of a hand-made map's exit on `side`, if it has one."""
    if not m.get("handmade"):
        return None
    for op in m["spec"]["ops"]:
        if op.get("op") == "exit" and op["side"] == side:
            along = m["at"][0] if side in "NS" else m["at"][1]
            return along + op["at"], along + op["at"] + op.get("width", 4)
    return None


def plan_exits(maps, links):
    """slug -> list of exits (side, local at, width, to, sea)."""
    exits = {s: [] for s in maps}
    for a, side, b, lo, hi in links:
        ma, mb = maps[a], maps[b]
        sea = ma.get("sea") and mb.get("sea")
        span = existing_exit(mb, OPP[side]) or existing_exit(ma, side)
        if sea:
            s0, s1 = lo, hi
        elif span and lo <= span[0] and span[1] <= hi:
            s0, s1 = span
        else:
            mid = (lo + hi) // 2
            s0, s1 = mid - EXIT // 2, mid + EXIT - EXIT // 2
        along = ma["at"][0] if side in "NS" else ma["at"][1]
        exits[a].append(dict(side=side, at=s0 - along, width=s1 - s0, to=b, sea=bool(ma.get("sea")),
                             seam_sea=bool(sea)))
    return exits


def home_sides(maps, links, start):
    """For each map, the side of the neighbour on the shortest walk from the start map."""
    adj = {s: [] for s in maps}
    for a, side, b, lo, hi in links:
        adj[a].append((b, side))
    prev, q = {start: None}, deque([start])
    while q:
        cur = q.popleft()
        for nb, side in adj[cur]:
            if nb not in prev:
                prev[nb] = (cur, OPP[side])
                q.append(nb)
    return {s: (p[1] if p else None) for s, p in prev.items()}


# ---------------------------------------------------------------- shared helpers
def P(t, w, *pts):
    return {"op": "path", "t": t, "width": w, "points": [list(p) for p in pts]}


def R(t, *box, **k):
    return dict({"op": "rect", "t": t, "box": list(box)}, **k)


def B(t, c, r, **k):
    return dict({"op": "blob", "t": t, "center": list(c), "r": list(r), "keep": True}, **k)


def PR(t, *at, **k):
    return dict({"op": "prop", "t": t, "each": [list(a) for a in at], "snap": 2}, **k)


def exit_ops(exs, lane):
    ops = []
    for e in exs:
        if e["seam_sea"] or e["sea"]:
            ops.append({"op": "exit", "side": e["side"], "at": e["at"], "width": e["width"], "to": e["to"],
                        "mark_only": True, "depth": 1})
        else:
            ops.append({"op": "exit", "side": e["side"], "at": e["at"], "width": e["width"], "t": lane, "to": e["to"]})
    return ops


def exit_point(e, W, H, inset=0):
    """Cell at the middle of an exit, `inset` cells inside the map."""
    mid = e["at"] + e["width"] // 2 - 1
    return {"N": (mid, inset), "S": (mid, H - 1 - inset), "W": (inset, mid), "E": (W - 1 - inset, mid)}[e["side"]]


def ortho(a, b, horizontal_first):
    (ax, ay), (bx, by) = a, b
    return [a, (bx, ay), b] if horizontal_first else [a, (ax, by), b]


def wobble_path(a, b, rng, lo, hi, vertical, seg=14 * S):
    """Orthogonal lane from a to b along the long axis with a sideways jog every `seg` cells."""
    pts = [a]
    if vertical:
        y, x = a[1], a[0]
        step = 1 if b[1] > a[1] else -1
        while abs(b[1] - y) > seg + 4:
            y += step * rng.randint(seg - 3, seg + 3)
            pts.append((x, y))
            x = rng.randint(lo, hi)
            pts.append((x, y))
        pts.append((x, b[1] - step * 3))
        pts.append((b[0], b[1] - step * 3))
        pts.append(b)
    else:
        x, y = a[0], a[1]
        step = 1 if b[0] > a[0] else -1
        while abs(b[0] - x) > seg + 4:
            x += step * rng.randint(seg - 3, seg + 3)
            pts.append((x, y))
            y = rng.randint(lo, hi)
            pts.append((x, y))
        pts.append((b[0] - step * 3, y))
        pts.append((b[0] - step * 3, b[1]))
        pts.append(b)
    out = [pts[0]]
    for p in pts[1:]:
        if p != out[-1]:
            out.append(p)
    return out


# ---------------------------------------------------------------- routes
def scaffold_route(m, exs, home, rng):
    W, H = m["size"]
    vertical = H >= W
    th = m["theme"]
    themed = th not in ("meadow", "coast", "woods")
    wall = "@twall" if themed else "@wall"
    grass = "@tgrass" if themed else "@grass"
    tree = "@ttree" if themed else "@tree"
    ops = [{"op": "frame", "t": wall, "thick": 4 if min(W, H) >= 20 else 2}]
    if m.get("sea"):
        ops = [R("@shore", 0, 0, W - 1, H - 1)]
        land = [e for e in exs if not e["sea"] and not e["seam_sea"]]
        for e in exs:
            if e["seam_sea"]:
                continue
            # a land neighbour: a beach strip along that edge so the seam carries land
            ops.append(R("@sand", *{"N": (0, 0, W - 1, 3), "S": (0, H - 4, W - 1, H - 1),
                                    "W": (0, 0, 3, H - 1), "E": (W - 4, 0, W - 1, H - 1)}[e["side"]]))
        ops += exit_ops(exs, "@sand")
        # islands of different shapes, rocks and reefs; trainers swim between them
        n = max(2, W * H // (700 * S * S // 2))
        for i in range(n):
            cx, cy = rng.randint(6 * S, W - 7 * S), rng.randint(6 * S, H - 7 * S)
            rx, ry = rng.uniform(2.5, 6) * S, rng.uniform(2, 4.5) * S
            ops.append({"op": "blob", "t": "@sand", "center": [cx, cy], "r": [rx, ry], "shape": "ellipse"})
            if rx > 3.5 and ry > 3:
                ops.append({"op": "blob", "t": None, "center": [cx, cy], "r": [rx - 1.6, ry - 1.6], "shape": "ellipse"})
                ops.append(PR("palm-tree", (cx, cy)))
            if i % 2 == 0:
                ops.append(PR("@item", (cx + 1, cy)))
        ops.append({"op": "scatter", "t": ["rock"], "box": [3, 3, W - 4, H - 4], "n": n * 2, "on": "shore"})
        trainers = [{"at": [rng.randint(4, W - 5), rng.randint(4, H - 5)], "facing": rng.choice("NSEW"),
                     "sight": 3, "name": f"swimmer-{i + 1}"} for i in range(max(1, W * H // (1200 * S)))]
        return ops, {"trainers": trainers}, True
    ops += exit_ops(exs, "@path")
    lw = LANE["route"]
    # wall lobes so the frame never runs straight
    for i in range(max(2, (W + H) // (12 * S))):
        if vertical:
            y = rng.randint(6 * S, H - 10 * S)
            x0 = 4 if i % 2 == 0 else W - 4 - rng.randint(2, 4) * S
            ops.append(R(wall, x0, y, x0 + rng.randint(2, 3) * S, y + rng.randint(3, 7) * S))
        else:
            x = rng.randint(6 * S, W - 10 * S)
            y0 = 4 if i % 2 == 0 else H - 4 - rng.randint(1, 2) * S
            ops.append(R(wall, x, y0, x + rng.randint(3, 7) * S, y0 + rng.randint(1, 2) * S))
    land = [e for e in exs if not e["sea"]]
    homes = [e for e in land if e["side"] == home] or land[:1]
    hub = exit_point(homes[0], W, H) if homes else (W // 2, H // 2)
    lo, hi = (5 * S, W - 5 * S - lw) if vertical else (5 * S, H - 5 * S - lw)
    lanes = []
    for e in land:
        if e is homes[0]:
            continue
        pts = wobble_path(hub, exit_point(e, W, H), rng, lo, hi, vertical)
        lanes.append(pts)
        ops.append(P("@path", lw, *pts))
    long = H if vertical else W
    # theme features from the kit (themes.json `nature.route`): plateaus with a rock face and stairs,
    # organic ponds, tide pools, a creek into the first pond; each in a free box clear of the lanes
    ops += route_features(m, ops, exs, rng, vertical, long)
    # grass beside the lane, ledges toward home every ~12 cells (never across the lane)
    for k in range(8 * S + 4, long - 12 * S, 16 * S):     # patches stay > SEAM_GRASS from the ends
        side = rng.choice((-1, 1))
        if vertical:
            cx = W // 2 + side * (W // 4)
            ops.append(B(grass, (cx, k + 2 * S), (rng.uniform(2, 3) * S, rng.uniform(2.5, 4) * S)))
        else:
            cy = H // 2 + side * 3 * S
            ops.append(B(grass, (k + 2 * S, cy), (rng.uniform(2.5, 4) * S, rng.uniform(1.2, 1.8) * S)))
    if home in ("S", "E", "W"):
        for k in range(14 * S, long - 10 * S, 12 * S):
            if vertical and home == "S":
                lx = lane_at(lanes, k, vertical)
                if lx is None:
                    continue
                if lx > W // 2:
                    ops.append({"op": "ledge", "y": k, "x": [4, lx - 2], "keep": True})
                else:
                    ops.append({"op": "ledge", "y": k, "x": [lx + lw + 1, W - 5], "keep": True})
            elif not vertical and home in ("E", "W"):
                ly = lane_at(lanes, k, vertical)
                if ly is None:
                    continue
                t = "ledge-west" if home == "W" else "ledge-east"
                if ly > H // 2:
                    ops.append({"op": "ledge", "x": k, "y": [4, ly - 2], "t": t, "keep": True})
                else:
                    ops.append({"op": "ledge", "x": k, "y": [ly + lw + 1, H - 5], "t": t, "keep": True})
    # a landmark every 60x40 window (a 30x20 one in the GBA view), items, berry trees, signs at the exits
    for wy in range(0, H, 20 * S):
        for wx in range(0, W, 30 * S):
            ops.append(PR("@tlandmark" if themed else "@landmark",
                          (min(W - 6, wx + rng.randint(6, 22) * S), min(H - 6, wy + rng.randint(6, 14) * S))))
    for e in land:
        x, y = exit_point(e, W, H, inset=5 * S)
        ops.append(PR("@sign", (x - 2 if e["side"] in "NS" else x, y if e["side"] in "NS" else y - 2)))
    for _ in range(S):
        ops.append(PR("@item", (rng.randint(5, W - 6), rng.randint(5, H - 6))))
        ops.append(PR("berry-tree", (rng.randint(5, W - 6), rng.randint(6, H - 6))))
    ops.append({"op": "scatter", "t": tree, "box": [4, 4, W - 5, H - 5], "n": max(2, W * H // 400)})
    ops += nature_ops(wall)
    trainers = []
    for i, pts in enumerate(lanes):
        for j, (a, b) in enumerate(zip(pts, pts[1:])):
            if j % 2 or len(trainers) >= max(1, W * H // (500 * S * S // 2)):
                continue
            mx, my = (a[0] + b[0]) // 2, (a[1] + b[1]) // 2
            if a[0] == b[0]:
                trainers.append({"at": [mx + lw + 1, my], "facing": "W", "sight": 2})
            else:
                trainers.append({"at": [mx, my + lw + 1], "facing": "N", "sight": 2})
    for i, t in enumerate(trainers):
        t["name"] = f"{TRAINERS[(i + len(m['slug'])) % len(TRAINERS)]}-{i + 1}"
        t["at"] = [min(max(t["at"][0], 4), W - 5), min(max(t["at"][1], 4), H - 5)]
    return ops, {"trainers": trainers}, False


def nature_ops(wall="@wall"):
    """The organic passes (default on for every theme, mapgen nature.py): ground patches, ragged
    layered tree walls and clustered vignettes. Each theme's pieces come from its `nature` kit in
    themes.json (volcano: singed grass, ash and cinder patches, ash pines, steam vents ...)."""
    return [{"op": "vary"}, {"op": "forest_edge", "t": wall}, {"op": "decorate", "max": 2}]


def nature_kit(theme):
    return MG.THEMES.get(theme, {}).get("nature", {})


def free_box(mm, x0, y0, x1, y1, below=0, pad=2, avoid=()):
    """True when the box plus `pad` cells round it (and `below` more rows under it) is plain lawn,
    clear of exits, structures and reserved cells."""
    for y in range(y0 - pad, y1 + pad + below + 1):
        for x in range(x0 - pad, x1 + pad + 1):
            if not (4 <= x < mm.W - 4 and 4 <= y < mm.H - 4):
                return False
            if mm.grid[y][x] is not None or (x, y) in mm.busy or (x, y) in avoid:
                return False
    return True


def exit_zone(mm, reach=8):
    out = set()
    for e in mm.exits.values():
        for x, y in e["cells"]:
            out |= {(x + i, y + j) for i in range(-reach, reach + 1) for j in range(-reach, reach + 1)}
    return out


def pick_box(mm, rng, cx, cy, w, h, below, span, vertical, avoid, taken):
    """A free w x h box near (cx, cy): searched outward along the route axis within `span` cells."""
    best = None
    for dy in range(-span, span + 1):
        for dx in range(-span, span + 1):
            x0, y0 = int(cx + dx - w // 2), int(cy + dy - h // 2)
            box = (x0, y0, x0 + w - 1, y0 + h - 1)
            if any(not (box[2] + 3 < t[0] or t[2] + 3 < box[0] or box[3] + below + 3 < t[1] or t[3] + 3 < box[1])
                   for t in taken):
                continue
            if not free_box(mm, *box, below=below, avoid=avoid):
                continue
            score = abs(dx) + abs(dy) + rng.random()
            if best is None or score < best[0]:
                best = (score, box)
    return best[1] if best else None


def route_features(m, ops, exs, rng, vertical, long):
    """Plateaus, ponds and tide pools along a route, from the theme kit's `route` list (cycled every
    ~36 cells, alternating sides), each in a free box clear of the lanes and exits; `stream: true`
    adds a creek from the nearest wall into the first pond."""
    W, H = m["size"]
    feats = nature_kit(m["theme"]).get("route", ["pond"])
    if not feats:
        return []
    probe = dict(slug=m["slug"], kind="route", theme=m["theme"], size=[W, H], ops=list(ops), seed=1)
    mm = MG.Map(probe, None)
    for op in ops:
        mm.apply(op)
    avoid = exit_zone(mm)
    out, taken, first_pond = [], [], None
    for i, k in enumerate(range(12 * S, long - 8 * S, 18 * S)):
        f = feats[i % len(feats)]
        side = rng.choice((-1, 1))
        if vertical:
            cx, cy = (W // 2 + side * W // 4, k)
        else:
            cx, cy = (k, H // 2 + side * H // 4)
        if f == "plateau":
            w, h = (rng.randint(10, 15), rng.randint(6, 9)) if vertical else (rng.randint(12, 18), rng.randint(5, 8))
            box = pick_box(mm, rng, cx, cy, w, h, 3, 6 * S, vertical, avoid, taken)
            if box:
                op = {"op": "plateau", "box": list(box)}
                if w >= 13 and h >= 8 and rng.random() < 0.4:
                    op["levels"] = 2
                out.append(op)
                taken.append(box)
        elif f in ("pond", "tidepool"):
            rx, ry = (rng.uniform(3.5, 5), rng.uniform(2.6, 3.6)) if f == "pond" else (rng.uniform(2.8, 3.4), 2.2)
            w, h = int(2 * rx) + 2, int(2 * ry) + 2
            box = pick_box(mm, rng, cx, cy, w, h, 0, 5 * S, vertical, avoid, taken)
            if box:
                c = [(box[0] + box[2] + 1) / 2, (box[1] + box[3] + 1) / 2]
                op = {"op": "pond", "center": c, "r": [round(rx, 1), round(ry, 1)]}
                if f == "tidepool":
                    op.update(bank=0.5, lobes=3)
                out.append(op)
                taken.append(box)
                if f == "pond" and first_pond is None:
                    first_pond = (c, box)
    if first_pond and nature_kit(m["theme"]).get("stream"):
        (px, py), box = first_pond
        if vertical:                         # from the nearer side wall into the pond
            sx = 4 if px < W / 2 else W - 5
            pts = [[sx, py - 5], [(sx + px) / 2, py - 3.5], [px, py]]
        else:
            sy = 4 if py < H / 2 else H - 5
            pts = [[px - 6, sy], [px - 3.5, (sy + py) / 2], [px, py]]
        out.append({"op": "stream", "points": pts, "width": 2, "wobble": 1.6})
    return out


def settlement_feature(m, spec, rng):
    """One landmark from the theme kit in a free spot of a town or city: a pond (with a creek when
    the kit has `stream`) or a small plateau with stairs, placed after the buildings."""
    feats = [f for f in nature_kit(m["theme"]).get("route", ["pond"]) if f in ("pond", "plateau", "tidepool")]
    if not feats:
        return []
    mm = MG.Map(dict(spec), None)
    for op in spec["ops"]:
        mm.apply(op)
    W, H = m["size"]
    avoid = exit_zone(mm, 6)
    for st in mm.structs:                    # keep doorsteps and the yard in front of every door free
        avoid |= {(x + i, y + j) for x, y in st["doors"] for i in range(-3, 4) for j in range(0, 6)}
    f = feats[0]
    if f == "plateau":
        box = pick_box(mm, rng, W // 4, H // 4, 8, 5, 3, max(W, H) // 2, False, avoid, [])
        return [{"op": "plateau", "box": list(box)}] if box else []
    rx, ry = (3.6, 2.6) if f == "pond" else (3, 2.2)
    box = pick_box(mm, rng, W // 4, 3 * H // 4, int(2 * rx) + 2, int(2 * ry) + 2, 0, max(W, H) // 2, False, avoid, [])
    if not box:
        return []
    op = {"op": "pond", "center": [(box[0] + box[2] + 1) / 2, (box[1] + box[3] + 1) / 2], "r": [rx, ry]}
    if f == "tidepool":
        op.update(bank=0.5, lobes=3)
    return [op]


def lane_at(lanes, k, vertical):
    """The lane's cross-axis position at long-axis coordinate k (first lane segment covering it)."""
    for pts in lanes:
        for a, b in zip(pts, pts[1:]):
            if vertical and a[0] == b[0] and min(a[1], b[1]) <= k <= max(a[1], b[1]):
                return a[0]
            if not vertical and a[1] == b[1] and min(a[0], b[0]) <= k <= max(a[0], b[0]):
                return a[1]
    return None


# ---------------------------------------------------------------- towns and cities
CANVAS = {}


def door_offset(slug):
    """(canvas cells, door x, door y) of a structure, from its door json."""
    if slug not in CANVAS:
        d = MG.structure_dir(slug)
        from PIL import Image
        n = Image.open(os.path.join(d, f"{slug}-structure.png")).height // MG.OUT_TS
        j = json.load(open(os.path.join(d, f"{slug}-door.json")))
        CANVAS[slug] = (n, j["x"] // MG.OUT_TS, (j["y"] + j["h"]) // MG.OUT_TS - 1)
    return CANVAS[slug]


def scaffold_settlement(m, exs, home, rng):
    W, H = m["size"]
    th = m["theme"]
    city = m["kind"] == "city"
    street = "@plaza" if city else "@path"
    sw = LANE[m["kind"]]
    ops = [{"op": "frame", "t": "@wall", "thick": 4}]
    for (x0, y0, x1, y1) in ((4, 4, 11, 7), (W - 12, 4, W - 5, 7), (4, H - 10, 7, H - 5), (W - 8, H - 10, W - 5, H - 5)):
        if city:
            ops.append(R("@wall", x0, y0, x1, y1))
    ops += exit_ops(exs, street)
    cx, cy = W // 2 - 1, H // 2 - 1
    for e in exs:
        if e["sea"] or e["seam_sea"]:
            continue
        a = exit_point(e, W, H)
        ops.append(P(street, sw, a, (a[0], cy) if e["side"] in "NS" else (cx, a[1]),
                     (cx, cy)))
        x, y = exit_point(e, W, H, inset=4 * S)
        ops.append(PR("@sign", (x - sw if e["side"] in "NS" else x, y if e["side"] in "NS" else y - sw), snap=4))
    if city:
        ops.append(R(street, cx - 4 * S, cy - 3 * S, cx + 5 * S, cy + 3 * S))
        ops.append(PR("@planter", (cx - 4 * S, cy - 3 * S), (cx + 5 * S, cy - 3 * S), (cx - 4 * S, cy + 3 * S),
                      (cx + 5 * S, cy + 3 * S), force=True, snap=0))
        ops.append(PR("@landmark", (cx, cy + 1), force=True, snap=0))
    # structures: Center near home, Mart beside it, gym in the far half, houses on the streets
    homes = [e for e in exs if e["side"] == home and not e["seam_sea"]] or [e for e in exs if not e["seam_sea"]]
    hx, hy = exit_point(homes[0], W, H) if homes else (cx, H - 1)
    want = []
    if m.get("gym"):
        want.append(("gym", f"gym-{m['gym']}", "far"))
    want += [("center", "@center", "near"), ("mart", "@mart", "near")]
    houses = (11 if city else 4)          # Gen 3: 8-14 doored buildings per city; a doubled town holds 4-6
    want += [("house", "@house", "any")] * houses
    if city:
        want += [("special", "@special", "mid"), ("special", "@special", "any"), ("special", "@special", "any")]
    return ops, want, (hx, hy), street


def place_buildings(spec, want, home_xy, street, rng):
    """Greedy placement on a built Map: each building takes the free spot whose door step is closest to
    a street, scored by how far it should be from the home exit."""
    m = MG.Map(spec, None)
    for op in spec["ops"]:
        m.apply(op)
    W, H = m.W, m.H
    th = spec["theme"]
    ops = []
    hx, hy = home_xy
    placed = []
    floor = {(x, y) for y in range(H) for x in range(W) if m.is_floor(m.grid[y][x])}

    def free(x0, y0, x1, y1):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if not (4 <= x < W - 4 and 4 <= y < H - 4):
                    return False
                if m.grid[y][x] is not None or (x, y) in m.busy:
                    return False
                if any(abs(x - px) <= 1 and abs(y - py) <= 1 for px, py in placed):
                    return False
        return True

    for kind, t, where in want:
        slug = m.res(t) if t.startswith("@") else t
        if isinstance(slug, list) or not slug:
            continue
        if t == "@house":
            pool = MG.resolve_role(th, "house")[0] or ["house-red"]
            slug = rng.choice(pool)
        if t == "@special":
            pool = [s for s in MG.resolve_role(th, "special")[0] if door_offset(s)[0] <= 10] or []
            if not pool:
                continue
            slug = rng.choice(pool)
        n, ddx, ddy = door_offset(slug)
        best = None
        for dy in range(5, H - 5):
            for dx in range(5, W - 5):
                ox, oy = dx - ddx, dy - ddy
                below = 4 if kind == "gym" else 1
                extra = 3 if kind == "gym" else 0
                if not free(ox + 1 - extra, oy, ox + n - 2 + extra, dy + below):
                    continue
                near = min((abs(dx - fx) + abs(dy + below + 1 - fy) for fx, fy in floor), default=99)
                if near > (6 if kind == "gym" else 4):
                    continue
                dist = abs(dx - hx) + abs(dy - hy)
                score = {"far": -dist, "near": dist, "mid": abs(dist - (W + H) // 3), "any": rng.random() * 30}[where] + near * 2
                if best is None or score < best[0]:
                    best = (score, dx, dy, ox, oy)
        if best is None:
            continue
        _, dx, dy, ox, oy = best
        if kind == "gym":
            g = slug.replace("gym-", "")
            op = {"op": "gym_quarter", "t": slug, "door": [dx, dy], "accent": ACCENT[g], "kit": GYM_KIT[g],
                  "link": street}
            if g in LIGHT_FLOOR:
                op["floor"] = LIGHT_FLOOR[g]
        else:
            op = {"op": "structure", "t": slug, "door": [dx, dy], "link": street}
        m.apply(op)
        ops.append(op)
        placed += [(x, y) for x in range(ox, ox + n) for y in range(oy, dy + 2)]
        floor = {(x, y) for y in range(H) for x in range(W) if m.is_floor(m.grid[y][x])}
    return ops


def finish_settlement(m, rng, spec=None):
    W, H = m["size"]
    kit = nature_kit(m["theme"])
    flower = (kit.get("flowers") or ["flowers"])[0]
    deco = [kit.get("swap", {}).get(s, s) for s in ("bush", "rock")] + [flower]
    trees = [t for t, w in kit.get("trees", []) for _ in range(max(1, round(w)))] or ["@tree"] * 3
    ops = settlement_feature(m, spec, rng) if spec else []
    ops += [{"op": "scatter", "t": "@lamp", "box": [5, 5, W - 6, H - 6], "n": max(4, W * H // 160)},
            {"op": "scatter", "t": ["@bench", "@planter", flower], "box": [5, 5, W - 6, H - 6], "n": max(4, W * H // 200)}]
    ops += [{"op": "vary"}, {"op": "forest_edge"}]     # ground patches and ragged walls before the trees go in
    ops += [{"op": "dress", "t": trees + deco * max(1, len(trees) // 6), "max": 3, "n": 600},
            PR("@item", (rng.randint(5, W - 6), rng.randint(5, H - 6)))]
    ops.append({"op": "decorate", "max": 2})
    return ops


def npcs_for(m, rng, spec):
    W, H = m["size"]
    mm = MG.Map(spec, None)
    for op in spec["ops"]:
        mm.apply(op)
    C = mm.collision()
    cells = [(x, y) for y in range(5, H - 5) for x in range(5, W - 5) if C[y][x] == "."]
    rng.shuffle(cells)
    n = max(2, int(W * H / 400))          # cities: lint wants one per mapgen.NPC_CELLS
    return [{"at": list(c), "name": f"citizen-{i + 1}"} for i, c in enumerate(cells[:n])]


# ---------------------------------------------------------------- driver
def scaffold(world_path, only=(), force=False):
    w, base, maps = load_world(world_path)
    links = touching(maps)
    exits = plan_exits(maps, links)
    homes = home_sides(maps, links, w.get("start", next(iter(maps))))
    made = []
    for slug, m in maps.items():
        if m.get("handmade") or (only and slug not in only):
            continue
        path = os.path.join(base, slug, f"{slug}.map.json")
        if os.path.exists(path) and not force:
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        keep = hand_ops(path)
        home = homes.get(slug)
        for attempt in range(8):
            rng = random.Random(f"{slug}-{attempt}")
            spec = dict(slug=slug, kind=m["kind"], theme=m["theme"], size=list(m["size"]), seed=attempt + 1)
            if home:
                spec["home"] = home
            if m["kind"] == "route":
                ops, events, surf = scaffold_route(m, exits[slug], home, rng)
                spec["ops"] = ops
                spec["events"] = events
                if surf:
                    spec["surf"] = True
            else:
                ops, want, home_xy, street = scaffold_settlement(m, exits[slug], home, rng)
                spec["ops"] = ops
                gyms = [w_ for w_ in want if w_[0] == "gym"]
                spec["ops"] += place_buildings(dict(spec), gyms, home_xy, street, rng)
                if m["kind"] == "city":         # side streets after the gym, so they wrap around its quarter
                    W_, H_ = m["size"]
                    side = [(12, H_ // 4 + 1), (W_ - 15, H_ // 4 + 1), (W_ - 15, 3 * H_ // 4 - 1),
                            (12, 3 * H_ // 4 - 1), (12, H_ // 4 + 1)]
                    spec["ops"].append(dict(P("@path", 3, *side), keep=True, avoid_busy=True))
                spec["ops"] += place_buildings(dict(spec), [w_ for w_ in want if w_[0] != "gym"], home_xy, street, rng)
                spec["ops"] += finish_settlement(m, rng, dict(spec))
                spec["events"] = {"npcs": npcs_for(m, rng, dict(spec))}
            if not spec.get("home"):
                spec.pop("home", None)
            spec["ops"] += keep
            json.dump(spec, open(path, "w"), indent=1)
            try:
                built = MG.build(path, debug=True, quiet=True)
            except SystemExit:
                continue
            if not built.errors:
                break
        made.append(slug)
    return made


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    done = scaffold(args[0], args[1:], "--force" in sys.argv)
    print("scaffolded:", ", ".join(done) or "nothing (specs exist; use --force)")
