"""Cave maps (`kind: "cave"`) for mapgen.py: carving, rock faces, ladders, holes, exits, decoration and lint.

A cave floor starts as solid rock (the theme's `@wall`) and `carve` digs chambers and tunnels into it, the
way tools/maps/cave_mock.py draws the approved mock plans. After the ops every wall cell over open floor
becomes the two-row `@face`, so walls read as height. Floor cells are the theme's `@ground`, a fill with
behaviour CAVE: every floor cell has wild encounters (pret MB_CAVE, docs/explanation/research/gen3-caves.md
§2.3). Ladders, holes and exits are trigger cells ('S' in the collision grid) exported as Tiled events
(`ladder`, `hole`, `cave_exit`) that game/tools/build_assets.py turns into the game's `stairs`.

    python3 tools/maps/mapgen.py build assets/maps/moonstone-cave-1f/moonstone-cave-1f.map.json --debug
    python3 tools/maps/mapgen.py cave moonstone-cave        # check every floor of one cave together

Ops (spec.md "Caves"):
  carve        {shapes: [[kind, ...], ...], seed, rough}   kinds as cave_mock: blob, room, tunnel, pillar,
               water, crack, ledge, stairs (coordinates in cells)
  ladder       {at, dir: up|down, to, id}                   a ladder to `to`; the ladder with the same id there
  hole         {at, to}                                     one-way drop to `to` (default the floor below) at the same cell
  cave_exit    {cells, to}                                  the cave mouth: stepping on it leaves for route `to`
  cave_decorate {n, walk, pools...}                         props along the walls, never cutting a way
  boulder switch barrier smash_rock cut_tree lever gate lamp crystal lava ice rail tide
               the mechanics (spec.md "Cave mechanics"): game-driven objects and terrains, art by role with
               placeholders; solve_cave plays them from every mouth (`mapgen.py cave <group>`)
"""
import math
import os
import random
from collections import deque

DIRS4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
WALL, FLOOR, WATER, CRACK, LEDGE, STAIRS = "#", ".", "~", "c", "L", "="
LAVA, ICE, LEDGE_N, LEDGE_E, LEDGE_W = "V", "I", "N", "E", "W"
# collision chars of the mechanics (spec.md "Cave mechanics"); the game reads the same chars
#   B boulder (origin)  H Rock Smash rock / Cut tree  G electric gate  X rock barrier  l lever  o floor switch
#   L lava  i ice  r rail  ^ > < v ledges (jump north / east / west / south)
LEDGE_CH = {"v": (0, 1), "^": (0, -1), ">": (1, 0), "<": (-1, 0)}
# optimistic open set for the static pocket checks: obstacles that some mechanic can open count as open
OPEN = set(".,fScHioBGXL")


# ---------------------------------------------------------------------------------- carving
class Carver:
    def __init__(self, w, h, seed):
        self.w, self.h = w, h
        self.g = [[WALL] * w for _ in range(h)]
        self.rng = random.Random(seed)

    def inside(self, x, y, edge=False):
        if edge:
            return 0 <= x < self.w and 0 <= y < self.h
        return 1 <= x < self.w - 1 and 1 <= y < self.h - 1

    def put(self, x, y, v, edge=False):
        if self.inside(x, y, edge):
            self.g[y][x] = v

    def ellipse(self, cx, cy, rx, ry, v, wobble=True):
        k, ph = self.rng.randint(3, 6), self.rng.uniform(0, 6.28)
        for y in range(int(cy - ry * 1.2) - 1, int(cy + ry * 1.2) + 2):
            for x in range(int(cx - rx * 1.2) - 1, int(cx + rx * 1.2) + 2):
                dx, dy = (x - cx) / rx, (y - cy) / ry
                f = 1 + (0.1 * math.sin(k * math.atan2(dy, dx) + ph) if wobble else 0)
                if dx * dx + dy * dy <= f * f:
                    self.put(x, y, v)

    def blob(self, cx, cy, rx, ry):
        self.ellipse(cx, cy, rx, ry, FLOOR)

    def pillar(self, cx, cy, rx, ry):
        self.ellipse(cx, cy, rx, ry, WALL, wobble=False)

    def water(self, cx, cy, rx, ry):
        self.ellipse(cx, cy, rx, ry, WATER)

    def area(self, x, y, w, h, frm, to):
        for j in range(h):
            for i in range(w):
                if self.inside(x + i, y + j, True) and self.g[y + j][x + i] in frm:
                    self.g[y + j][x + i] = to

    def crack(self, x, y, w, h):
        self.area(x, y, w, h, FLOOR, CRACK)

    def stairs(self, x, y, w, h):
        self.area(x, y, w, h, FLOOR + WALL, STAIRS)

    def ledge(self, x0, x1, y):
        self.area(x0, y, x1 - x0 + 1, 1, FLOOR, LEDGE)

    def ledge_n(self, x0, x1, y):
        """A ledge you jump north over (Gen 3 MB_JUMP_NORTH)."""
        self.area(x0, y, x1 - x0 + 1, 1, FLOOR, LEDGE_N)

    def ledge_e(self, x, y0, y1):
        self.area(x, y0, 1, y1 - y0 + 1, FLOOR, LEDGE_E)

    def ledge_w(self, x, y0, y1):
        self.area(x, y0, 1, y1 - y0 + 1, FLOOR, LEDGE_W)

    def lava(self, x, y, w, h):
        """Lava over floor (a boulder pushed in fills the cell)."""
        self.area(x, y, w, h, FLOOR, LAVA)

    def lavablob(self, cx, cy, rx, ry):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 and self.inside(x, y) and self.g[y][x] == FLOOR:
                    self.g[y][x] = LAVA

    def ice(self, x, y, w, h):
        """Ice floor (Gen 3 MB_ICE): the Player slides until something stops them."""
        self.area(x, y, w, h, FLOOR, ICE)

    def room(self, x, y, w, h):
        for j in range(h):
            for i in range(w):
                if min(i, w - 1 - i) + min(j, h - 1 - j) >= 1:
                    self.put(x + i, y + j, FLOOR)

    def floor(self, x, y, w, h):
        """Plain rectangle of floor (no cut corners), e.g. to widen a mouth."""
        self.area(x, y, w, h, WALL, FLOOR)

    def wall(self, x, y, w, h):
        self.area(x, y, w, h, FLOOR + CRACK, WALL)

    def tunnel(self, pts, width):
        lo = -(width // 2)
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            n = max(abs(x1 - x0), abs(y1 - y0), 1)
            for s in range(n + 1):
                x, y = round(x0 + (x1 - x0) * s / n), round(y0 + (y1 - y0) * s / n)
                for dy in range(lo, lo + width):
                    for dx in range(lo, lo + width):
                        X, Y = x + dx, y + dy
                        edge = X in (0, self.w - 1) or Y in (0, self.h - 1)
                        if self.inside(X, Y, True) and self.g[Y][X] == WALL:
                            self.put(X, Y, FLOOR, edge=edge)

    def labels(self):
        lab, n = {}, 0
        for y in range(self.h):
            for x in range(self.w):
                if self.g[y][x] != WALL and (x, y) not in lab:
                    q = [(x, y)]
                    lab[(x, y)] = n
                    while q:
                        a, b = q.pop()
                        for dx, dy in DIRS4:
                            c, d = a + dx, b + dy
                            if 0 <= c < self.w and 0 <= d < self.h and self.g[d][c] != WALL and (c, d) not in lab:
                                lab[(c, d)] = n
                                q.append((c, d))
                    n += 1
        return lab

    def roughen(self, rounds=(0.3, 0.2)):
        """Nibble the rock rim so chambers read as caves; never joins two pockets (wall stays >= 3)."""
        for p in rounds:
            lab = self.labels()
            add = []
            for y in range(2, self.h - 2):
                for x in range(2, self.w - 2):
                    if self.g[y][x] != WALL:
                        continue
                    near = [self.g[y + dy][x + dx] for dx, dy in DIRS4]
                    if FLOOR not in near or any(v not in (FLOOR, WALL) for v in near):
                        continue
                    seen = {lab[(x + dx, y + dy)] for dy in range(-3, 4) for dx in range(-3, 4)
                            if (x + dx, y + dy) in lab}
                    if len(seen) == 1 and self.rng.random() < p:
                        add.append((x, y))
            for x, y in add:
                self.g[y][x] = FLOOR

    def tidy(self):
        """No 1-row walls (they cannot carry a two-row face) and no lone rock cells or 1-cell floor nicks."""
        for _ in range(3):
            changed = False
            for y in range(1, self.h - 1):
                for x in range(1, self.w - 1):
                    v = self.g[y][x]
                    if v == WALL:
                        n, s = self.g[y - 1][x], self.g[y + 1][x]
                        walls = sum(self.g[y + dy][x + dx] == WALL for dx, dy in DIRS4)
                        if (n != WALL and s != WALL) or walls <= 1:
                            self.g[y][x] = FLOOR
                            changed = True
                    elif v == FLOOR:
                        walls = sum(self.g[y + dy][x + dx] == WALL for dx, dy in DIRS4)
                        if walls >= 3:
                            self.g[y][x] = WALL
                            changed = True
            if not changed:
                break


def carve(m, op):
    c = Carver(m.W, m.H, op.get("seed", m.spec.get("seed", 1)))
    for sh in op["shapes"]:
        getattr(c, sh[0])(*sh[1:])
    if op.get("rough", True):
        c.roughen()
    c.tidy()
    for sh in op.get("after", []):                 # exact touches after roughening (ledges, cracks, steps)
        getattr(c, sh[0])(*sh[1:])
    used = {v for row in c.g for v in row}
    role = {WALL: "@wall", WATER: "@water", CRACK: "@crack", LEDGE: "@ledge", STAIRS: "@stairs"}
    slug = {k: m.res(r) if k in used else None for k, r in role.items()}
    slug[FLOOR] = None
    # mechanic terrains: the piece is optional (placeholder until the art exists), the collision comes from mgrid
    mech = {LAVA: ("@lava", "L"), ICE: ("@ice", "i"), LEDGE_N: ("@ledgen", "^"), LEDGE_E: ("@ledgee", ">"),
            LEDGE_W: ("@ledgew", "<")}
    for k, (r, _) in mech.items():
        if k in used:
            slug[k] = m.res(r, required=False) or (m.res("@ledge", required=False) if k in "NEW" else None)
    for y in range(m.H):
        for x in range(m.W):
            v = c.g[y][x]
            m.grid[y][x] = slug[v]
            if v in mech:
                m.mgrid[(x, y)] = mech[v][1]
                if not m.res(mech[v][0], required=False):
                    m.placeholders.add(mech[v][0][1:])


def is_wall(m, s):
    return s is not None and m.go.TERRAIN.get(s, {}).get("group") == m.res("@wall")


def faces(m):
    """Every wall cell above open floor becomes the lower face, and the wall above it the upper face."""
    wall, face = m.res("@wall"), m.res("@face")
    if not face:
        return
    lower = [(x, y) for y in range(m.H - 1) for x in range(m.W)
             if m.grid[y][x] == wall and not is_wall(m, m.grid[y + 1][x])]
    for x, y in lower:
        m.grid[y][x] = face
    for x, y in lower:
        if y > 0 and m.grid[y - 1][x] == wall:
            m.grid[y - 1][x] = face


# ---------------------------------------------------------------------------------- features
def add_trigger(m, x, y, kind, **kw):
    if not m.inside(x, y):
        m.errors.append(f"{kind} at {x},{y} is off the map")
        return
    if m.cell_solid_terrain(x, y):
        m.errors.append(f"{kind} at {x},{y} sits in rock")
    m.triggers[(x, y)] = dict(kind=kind, x=x, y=y, **kw)


def ladder(m, op):
    x, y = op["at"]
    up = op.get("dir", "down") == "up"
    slug = m.res("@ladderup" if up else "@ladderdown")
    add_trigger(m, x, y, "ladder", to=op["to"], id=op["id"], dir="up" if up else "down")
    if slug:
        m.busy.discard((x, y))
        m.place_prop(slug, x, y, force=True)


def hole(m, op):
    x, y = op["at"]
    to = op.get("to") or m.spec.get("cave", {}).get("below")
    if not to:
        m.errors.append(f"hole at {x},{y}: no floor below (set cave.below or `to`)")
    add_trigger(m, x, y, "hole", to=to)
    slug = m.res("@hole")
    if slug:
        m.place_prop(slug, x, y, force=True)


def cave_exit(m, op):
    for x, y in op["cells"]:
        add_trigger(m, x, y, "cave_exit", to=op["to"])
        slug = m.res("@exit")
        if slug:
            m.place_prop(slug, x, y, force=True)


def walkable(C, x, y):
    """Floor-like cell (optimistic: boulders, HM obstacles, gates, barriers and lava may open), ledge or water."""
    return 0 <= y < len(C) and 0 <= x < len(C[0]) and (C[y][x] in OPEN or C[y][x] in "~v^><")


def reach(C, start, swim=False):
    """Cells reachable on foot from start; ledges only in their jump direction; water only with swim."""
    H, W = len(C), len(C[0])
    seen, q = {start}, deque([start])
    while q:
        x, y = q.popleft()
        for dx, dy in DIRS4:
            nx, ny = x + dx, y + dy
            if not (0 <= nx < W and 0 <= ny < H) or (nx, ny) in seen:
                continue
            c = C[ny][nx]
            if c in LEDGE_CH:
                lx, ly = nx + dx, ny + dy
                if LEDGE_CH[c] == (dx, dy) and 0 <= lx < W and 0 <= ly < H and C[ly][lx] in OPEN \
                        and (lx, ly) not in seen:
                    seen.add((lx, ly))
                    q.append((lx, ly))
                continue
            if c in OPEN or (swim and c == "~"):
                seen.add((nx, ny))
                q.append((nx, ny))
    return seen


def cave_decorate(m, op):
    """Props along the rock: blocking ones (`pool`) only where the floor around stays open and every
    trigger, item, NPC and trainer keeps the same reachability; walkable decals (`walk`) anywhere quiet."""
    rng = random.Random(op.get("seed", 5))
    pool = [m.res(t) for t in op.get("pool", ["@cprops"])]
    pool = [s for t in pool for s in (t if isinstance(t, list) else [t]) if s]
    pool = [s for t in op.get("pool", ["@cprops"]) for s in m.role_pool(t)]
    walk = [s for t in op.get("walk", ["@cdeco"]) for s in m.role_pool(t)]
    keep = set(m.triggers) | set(m.reserved)
    for k in ("items", "npcs", "trainers"):
        keep |= {tuple(e["at"]) for e in m.events.get(k, [])}
    for (x, y), t in m.triggers.items():
        keep |= {(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1, 2)}
    box = op.get("box", (0, 0, m.W - 1, m.H - 1))

    def snapshot():
        C = m.collision()
        marks = sorted(keep & {(x, y) for y in range(m.H) for x in range(m.W) if walkable(C, x, y)})
        if not marks:
            return C, {}
        comp = {}
        for p in marks:
            if p not in comp:
                r = reach(C, p)
                for q in marks:
                    if q in r:
                        comp.setdefault(q, p)
        return C, {p: comp.get(p) for p in marks}
    C, base = snapshot()
    floor = [(x, y) for y in range(box[1], box[3] + 1) for x in range(box[0], box[2] + 1)
             if m.inside(x, y) and C[y][x] == "." and m.grid[y][x] is None and (x, y) not in keep]
    rng.shuffle(floor)
    placed, n = 0, op.get("n", 40)
    for x, y in floor:
        if placed >= n:
            break
        near_wall = any(m.inside(x + dx, y + dy) and C[y + dy][x + dx] == "#" for dx, dy in DIRS4)
        open8 = sum(1 for dx in (-1, 0, 1) for dy in (-1, 0, 1) if (dx or dy) and m.inside(x + dx, y + dy)
                    and C[y + dy][x + dx] == ".")
        if not near_wall or open8 < 5 or not pool:
            continue
        slug = rng.choice(pool)
        w, h = m.go.PROPS[slug]["cells"]
        cells = {(x + i, y) for i in range(w)}
        if cells & keep or any(not m.inside(cx, cy) or C[cy][cx] != "." for cx, cy in cells):
            continue
        if not m.place_prop(slug, x, y):
            continue
        C2, after = snapshot()
        if after != base or any(not walkable(C2, *p) for p in base):
            m.props.pop()
            m.busy -= {(x + i, y - j) for i in range(w) for j in range(h)}
            continue
        C = C2
        placed += 1
    dec = 0
    for x, y in floor:
        if dec >= op.get("n_walk", 30) or not walk:
            break
        if (x, y) in m.busy or (x, y) in keep or rng.random() > 0.5:
            continue
        if m.place_prop(rng.choice(walk), x, y):
            dec += 1
    m.notes.append(f"cave_decorate placed {placed} props and {dec} decals")


# ---------------------------------------------------------------------------------- lint (one floor)
def lint(m, C):
    E, Wn, N = m.errors, m.warns, m.notes
    vw, vh = m.view
    walk = sum(1 for row in C for c in row if c in ".fScio")
    N.append(f"size {m.W}x{m.H} cells ({m.W * m.H / (vw * vh):.1f} screens of {vw}x{vh}); "
             f"walkable {100 * walk / (m.W * m.H):.0f} %")
    for (x, y), t in m.triggers.items():
        if not any(walkable(C, x + dx, y + dy) and C[y + dy][x + dx] != "S" for dx, dy in DIRS4):
            E.append(f"{t['kind']} at {x},{y}: no walkable cell beside it")
        if t["kind"] == "ladder" and not walkable(C, x, y + 1):
            E.append(f"ladder at {x},{y}: the landing cell below it ({x},{y + 1}) is not walkable")
    # pockets: every walkable region needs a way out (a ladder or exit), dead ends hold a reward
    seen = set()
    rewards = {tuple(e["at"]) for k in ("items", "npcs") for e in m.events.get(k, [])}
    pockets = 0
    for y in range(m.H):
        for x in range(m.W):
            if (x, y) in seen or C[y][x] not in ".fScio":
                continue
            r = reach(C, (x, y), swim=bool(m.spec.get("surf")))
            und = set()
            q = [(x, y)]                       # the undirected region (ledges either way) for pocket counting
            und.add((x, y))
            while q:
                a, b = q.pop()
                for dx, dy in DIRS4:
                    p = (a + dx, b + dy)
                    if p not in und and walkable(C, *p) and C[p[1]][p[0]] != "~":
                        und.add(p)
                        q.append(p)
            seen |= und
            if len(und) < 4:
                continue
            pockets += 1
            outs = [t for p, t in m.triggers.items() if p in und and t["kind"] in ("ladder", "cave_exit", "cart")]
            if not outs:
                E.append(f"pocket at {x},{y} ({len(und)} cells) has no ladder or exit: a soft-lock")
                continue
            if len(outs) == 1 and not any(p in und for p in rewards) and outs[0]["kind"] != "cave_exit":
                Wn.append(f"dead-end pocket at {x},{y} ({len(und)} cells) holds no item or NPC")
    N.append(f"{pockets} pocket(s), {sum(t['kind'] == 'ladder' for t in m.triggers.values())} ladders, "
             f"{sum(t['kind'] == 'hole' for t in m.triggers.values())} holes, "
             f"{sum(1 for row in C for c in row if c == 'c')} cracked cells")
    tx, ty = m.mg.TRAINER_SIGHT
    for t in m.events.get("trainers", []):
        s = t.get("sight", 4)
        if s > (tx if t.get("facing", "S") in "EW" else ty):
            Wn.append(f"trainer at {t['at']}: sight {s} is beyond the Gen 3 limit")
        if not walkable(C, *t["at"]):
            E.append(f"trainer at {t['at']} stands in rock")
    for k in ("items", "npcs"):
        for e in m.events.get(k, []):
            x, y = e["at"]
            if not m.inside(x, y) or C[y][x] == "~":
                E.append(f"{k[:-1]} at {e['at']} is off the floor")
    return {}


# ---------------------------------------------------------------------------------- lint (whole cave)
def load_floor(maps_dir, slug, tide="low"):
    """One built floor: collision (the high-tide one when `tide` is high and the floor has it), map properties and
    events (events marked for the other tide left out)."""
    import json
    d = os.path.join(maps_dir, slug)
    tmj = json.load(open(os.path.join(d, f"{slug}.tmj")))
    cpath = os.path.join(d, f"{slug}-collision-high.txt")
    if tide != "high" or not os.path.exists(cpath):
        cpath = os.path.join(d, f"{slug}-collision.txt")
    C = [line.rstrip("\n") for line in open(cpath)]
    props = {p["name"]: p["value"] for p in tmj.get("properties", [])}
    ev = []
    for layer in tmj["layers"]:
        if layer.get("name") == "events":
            for o in layer["objects"]:
                pr = {p["name"]: p["value"] for p in o.get("properties", [])}
                if pr.get("tide") and pr["tide"] != tide:
                    continue
                ev.append(dict(pr, type=o.get("type"), name=o.get("name"), x=int(o["x"] // 32), y=int(o["y"] // 32)))
    return dict(slug=slug, C=C, props=props, events=ev, tidal=os.path.exists(os.path.join(d, f"{slug}-collision-high.txt")))


def check_cave(maps_dir, slugs, tide="low"):
    """Ladders pair up, landings are floor, every pocket of every floor is reachable from outside and can get back
    out (obstacles a mechanic can open count as open here; `solve_cave` plays the mechanics). Returns (errors, notes)."""
    floors = {s: load_floor(maps_dir, s, tide) for s in slugs}
    E, N = [], []
    edges = {}

    def link(a, b):
        edges.setdefault(a, set()).add(b)
    labels = {}
    for s, f in floors.items():                 # regions split by ledges; a ledge links its top to its foot
        C, lab = f["C"], {}
        for y in range(len(C)):
            for x in range(len(C[0])):
                if C[y][x] in OPEN and (x, y) not in lab:
                    lab[(x, y)] = (s, x, y)
                    q = [(x, y)]
                    while q:
                        a, b = q.pop()
                        for dx, dy in DIRS4:
                            p = (a + dx, b + dy)
                            if p not in lab and 0 <= p[1] < len(C) and 0 <= p[0] < len(C[0]) \
                                    and C[p[1]][p[0]] in OPEN:
                                lab[p] = (s, x, y)
                                q.append(p)
        labels[s] = lab
        for y in range(1, len(C) - 1):
            for x in range(1, len(C[0]) - 1):
                if C[y][x] in LEDGE_CH:
                    dx, dy = LEDGE_CH[C[y][x]]
                    if (x - dx, y - dy) in lab and (x + dx, y + dy) in lab:
                        link(lab[(x - dx, y - dy)], lab[(x + dx, y + dy)])

    def pocket(slug, x, y):
        return labels[slug].get((x, y), (slug, x, y))
    OUT = ("outside",)
    for s, f in floors.items():
        lad = [e for e in f["events"] if e["type"] == "ladder"]
        for e in lad:
            to = e.get("to")
            if to not in floors:
                E.append(f"{s}: ladder {e.get('id')} at {e['x']},{e['y']} leads to unknown floor '{to}'")
                continue
            partner = [p for p in floors[to]["events"] if p["type"] == "ladder" and p.get("id") == e.get("id")]
            if len(partner) != 1 or partner[0].get("to") != s:
                E.append(f"{s}: ladder {e.get('id')} has no single partner on {to} pointing back")
                continue
            p = partner[0]
            if not walkable(floors[to]["C"], p["x"], p["y"] + 1):
                E.append(f"{to}: landing below ladder {p.get('id')} ({p['x']},{p['y'] + 1}) is not walkable")
                continue
            if abs(p["x"] - e["x"]) + abs(p["y"] - e["y"]) > 0:
                N.append(f"ladder {e.get('id')} {s}->{to} moves ({p['x'] - e['x']}, {p['y'] - e['y']})")
            link(pocket(s, e["x"], e["y"] + 1), pocket(to, p["x"], p["y"] + 1))
        for e in f["events"]:
            if e["type"] == "hole":
                to = e.get("to")
                if to not in floors or not walkable(floors[to]["C"], e["x"], e["y"]):
                    E.append(f"{s}: hole at {e['x']},{e['y']} does not land on floor in {to}")
                    continue
                for dx, dy in DIRS4:
                    if walkable(f["C"], e["x"] + dx, e["y"] + dy) and f["C"][e["y"] + dy][e["x"] + dx] != "S":
                        link(pocket(s, e["x"] + dx, e["y"] + dy), pocket(to, e["x"], e["y"]))
                        break
            if e["type"] == "cart":
                lx, ly = (int(v) for v in e["land"].split(","))
                for dx, dy in DIRS4:
                    if walkable(f["C"], e["x"] + dx, e["y"] + dy) and f["C"][e["y"] + dy][e["x"] + dx] != "S":
                        link(pocket(s, e["x"] + dx, e["y"] + dy), pocket(s, lx, ly))
                if not walkable(f["C"], lx, ly):
                    E.append(f"{s}: cart at {e['x']},{e['y']} lands on {lx},{ly}, which is not floor")
            if e["type"] == "cave_exit":
                for dx, dy in DIRS4:
                    if walkable(f["C"], e["x"] + dx, e["y"] + dy) and f["C"][e["y"] + dy][e["x"] + dx] != "S":
                        pk = pocket(s, e["x"] + dx, e["y"] + dy)
                        link(pk, OUT)
                        link(OUT, pk)
                        break
        below = f["props"].get("below")
        for y, row in enumerate(f["C"]):
            for x, ch in enumerate(row):
                if ch != "c":
                    continue
                if below not in floors or not walkable(floors[below]["C"], x, y):
                    E.append(f"{s}: cracked floor at {x},{y} does not land on floor in {below}")
                    break
                link(pocket(s, x, y), pocket(below, x, y))
    # every pocket of size >= 4 that holds a trigger must be reachable from outside, and reach outside
    allp = set()
    for s, f in floors.items():
        for e in f["events"]:
            if e["type"] in ("ladder", "cave_exit"):
                y = e["y"] + 1 if e["type"] == "ladder" else e["y"]
                for dx, dy in ((0, 0),) + DIRS4:
                    if walkable(f["C"], e["x"] + dx, y + dy) and f["C"][y + dy][e["x"] + dx] != "S":
                        allp.add(pocket(s, e["x"] + dx, y + dy))
                        break

    def closure(start, graph):
        seen, q = {start}, [start]
        while q:
            a = q.pop()
            for b in graph.get(a, ()):
                if b not in seen:
                    seen.add(b)
                    q.append(b)
        return seen
    fwd = closure(OUT, edges)
    rev = {}
    for a, bs in edges.items():
        for b in bs:
            rev.setdefault(b, set()).add(a)
    back = closure(OUT, rev)
    for p in sorted(allp, key=str):
        if p not in fwd:
            E.append(f"{p[0]}: pocket at {p[1]} is unreachable from the cave mouth")
        elif p not in back:
            E.append(f"{p[0]}: pocket at {p[1]} has no way back out (soft-lock)")
    N.append(f"{len(floors)} floors, {len(allp)} pockets, {sum(len(b) for b in edges.values())} links")
    return E, N


def wall_props(m, op):
    """Props hung on the rock face (carvings, crystals in the wall): spots where the whole prop covers face
    cells, the cell under it is open floor, at least `gap` cells apart. Faces are made first (idempotent)."""
    faces(m)
    face = m.res("@face")
    slug = m.res(op["t"])
    if not slug or not face:
        return
    w, h = m.go.PROPS[slug]["cells"]
    x0, y0, x1, y1 = op.get("box", (0, 0, m.W - 1, m.H - 1))
    rng = random.Random(op.get("seed", 9))
    spots = []
    for y in range(max(y0, h - 1), min(y1, m.H - 2) + 1):
        for x in range(x0, min(x1, m.W - w) + 1):
            cells = [(x + i, y - j) for i in range(w) for j in range(h)]
            if all(m.grid[cy][cx] == face for cx, cy in cells) and all(
                    m.grid[y + 1][x + i] is None or not m.cell_solid_terrain(x + i, y + 1) for i in range(w)):
                spots.append((x, y))
    rng.shuffle(spots)
    done = []
    for x, y in spots:
        if len(done) >= op.get("n", 3):
            break
        if any(abs(x - a) + abs(y - b) < op.get("gap", 10) for a, b in done):
            continue
        cells = {(x + i, y - j) for i in range(w) for j in range(h)}
        if cells & m.busy:
            continue
        m.busy |= cells
        m.props.append((slug, x, y))
        done.append((x, y))
    m.notes.append(f"wall_props {slug}: {len(done)}")


# ---------------------------------------------------------------------------------- mechanics (spec.md "Cave mechanics")
# Objects the game draws and changes itself (never baked into the map image): kind -> collision char and art role.
MECH_CHAR = {"boulder": "B", "smash": "H", "cut": "H", "gate": "G", "barrier": "X", "lever": "l", "switch": "o",
             "lamp": "#", "crystal": "#"}
MECH_ROLE = {"boulder": "@boulder", "smash": "@smash", "cut": "@cut", "gate": "@gate", "barrier": "@barrier",
             "lever": "@lever", "switch": "@switch", "lamp": "@lamp", "crystal": "@crystal"}
# every art role a mechanic may draw (open / on states, the cart, filled lava); themes.json `_mechanics` lists the
# default candidates, a theme overrides them. A role with no piece yet is a placeholder (drawn as a flat colour).
MECH_ART = ("boulder", "smash", "cut", "gate", "gateopen", "barrier", "lever", "leveron", "switch", "lamp",
            "crystal", "cart", "lavafill")
HM_KIND = {"smash-rock": "smash", "cut-tree": "cut"}
# placeholder colours (preview and game) for mechanics whose art does not exist yet
PLACEHOLDER_RGB = {"boulder": (120, 112, 104), "smash": (150, 104, 72), "cut": (56, 128, 64), "gate": (232, 200, 40),
                   "gateopen": (90, 80, 40), "barrier": (96, 88, 96), "lever": (200, 60, 40), "switch": (200, 200, 210),
                   "lamp": (255, 236, 140), "crystal": (150, 220, 250), "cart": (110, 70, 40), "lava": (228, 84, 24),
                   "lavafill": (92, 72, 64), "ice": (190, 230, 250), "rail": (140, 110, 80), "ledgen": (250, 200, 0),
                   "ledgee": (250, 200, 0), "ledgew": (250, 200, 0), "tidewater": (40, 100, 200)}


def op_cells(op):
    """The cells an op names: `at`, `each`, `cells` or an inclusive `box`."""
    if "at" in op:
        return [tuple(op["at"])]
    if "each" in op or "cells" in op:
        return [tuple(c) for c in op.get("each", op.get("cells"))]
    if "box" in op:
        x0, y0, x1, y1 = op["box"]
        return [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
    return []


def add_mech(m, kind, x, y, **kw):
    if not m.inside(x, y):
        m.errors.append(f"{kind} at {x},{y} is off the map")
        return
    if kind in ("gate", "barrier"):               # a gate stands in a passage: the cell under it is floor
        if m.cell_solid_terrain(x, y):
            m.grid[y][x] = None
    elif m.cell_solid_terrain(x, y):
        m.errors.append(f"{kind} at {x},{y} sits in rock")
    if not m.res(MECH_ROLE[kind], required=False):
        m.placeholders.add(kind)
    m.mech.append(dict(kind=kind, x=x, y=y, **kw))


def boulder(m, op):
    """Strength boulders. `id` names a single boulder (default b<n>); the game keys it `<map>:<id>`."""
    for x, y in op_cells(op):
        n = sum(1 for e in m.mech if e["kind"] == "boulder") + 1
        add_mech(m, "boulder", x, y, id=op.get("id") if "at" in op and op.get("id") else f"b{n}")


def smash_rock(m, op):
    for x, y in op_cells(op):
        add_mech(m, "smash", x, y)


def cut_tree(m, op):
    for x, y in op_cells(op):
        add_mech(m, "cut", x, y)


def switch(m, op):
    """Floor switch (FR MB_STRENGTH_BUTTON): a boulder on it opens every barrier with the same `id`."""
    for x, y in op_cells(op):
        add_mech(m, "switch", x, y, id=str(op.get("id", "1")))


def barrier(m, op):
    for x, y in op_cells(op):
        add_mech(m, "barrier", x, y, id=str(op.get("id", "1")))


def gate(m, op):
    """Electric gate reading cave bit `bit`: open while the bit is clear when `open` (default), else while it is set."""
    for x, y in op_cells(op):
        add_mech(m, "gate", x, y, bit=int(op.get("bit", 0)), open=bool(op.get("open", True)))


def lever(m, op):
    """Lever: A toggles cave bit `bit` (shared by every floor of the cave group)."""
    for x, y in op_cells(op):
        add_mech(m, "lever", x, y, bit=int(op.get("bit", 0)))


def lamp(m, op):
    """Fixed light on a dark floor (generator lamp): a lit circle of `r` cells (default 3) in the darkness mask."""
    for x, y in op_cells(op):
        add_mech(m, "lamp", x, y, r=int(op.get("r", 3)))


def crystal(m, op):
    """Solid stopper (ice crystals): blocks walking and ends a slide."""
    for x, y in op_cells(op):
        add_mech(m, "crystal", x, y)


def _paint(m, cells, role, ch):
    slug = m.res(role, required=False)
    if not slug:
        m.placeholders.add(role[1:])
    for x, y in cells:
        if m.inside(x, y):
            m.grid[y][x] = slug
            m.mgrid[(x, y)] = ch


def lava(m, op):
    """Lava cells (`box`, `cells`, or `blob: [cx, cy, rx, ry]`): solid; a boulder pushed in fills the cell for good."""
    cells = op_cells(op)
    if "blob" in op:
        cx, cy, rx, ry = op["blob"]
        cells += [(x, y) for y in range(int(cy - ry) - 1, int(cy + ry) + 2)
                  for x in range(int(cx - rx) - 1, int(cx + rx) + 2)
                  if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1]
    _paint(m, [(x, y) for x, y in cells if m.inside(x, y) and not m.cell_solid_terrain(x, y)], "@lava", "L")


def ice(m, op):
    _paint(m, [(x, y) for x, y in op_cells(op) if m.inside(x, y) and not m.cell_solid_terrain(x, y)], "@ice", "i")


def rail(m, op):
    """Minecart: `points` (orthogonal polyline). The first point is the cart (a trigger); stepping on it rides the
    rail one way to its end and lands on `land` (default: the cell past the end, along the last segment)."""
    pts = [tuple(p) for p in op["points"]]
    path = [pts[0]]
    d = (0, 1)
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        if ax != bx and ay != by:
            m.errors.append(f"rail segment {ax},{ay}->{bx},{by} is diagonal")
            return
        d = ((bx > ax) - (bx < ax), (by > ay) - (by < ay))
        for k in range(1, abs(bx - ax) + abs(by - ay) + 1):
            path.append((ax + d[0] * k, ay + d[1] * k))
    land = tuple(op["land"]) if "land" in op else (path[-1][0] + d[0], path[-1][1] + d[1])
    slug = m.res("@rail", required=False)
    if slug and slug in m.go.PROPS:               # a 4-way connector prop (quarry-cave-rail): laid as fence tiles
        for i, (x, y) in enumerate(path):          # under the cart too, so the track has no buffer at its start
            if not m.inside(x, y):
                continue
            if m.cell_solid_terrain(x, y):
                m.grid[y][x] = None
            if (slug, x, y) not in m.fences:
                m.fences.append((slug, x, y))
            if i:
                m.mgrid[(x, y)] = "r"
    else:
        _paint(m, path[1:], "@rail", "r")
    x0, y0 = path[0]
    if m.cell_solid_terrain(x0, y0):
        m.grid[y0][x0] = None
    if m.inside(*land) and m.cell_solid_terrain(*land):
        m.errors.append(f"rail from {x0},{y0} lands in rock at {land}")
    if not m.res("@cart", required=False):
        m.placeholders.add("cart")
    add_trigger(m, x0, y0, "cart", path=";".join(f"{x},{y}" for x, y in path), land=f"{land[0]},{land[1]}")


def tide(m, op):
    """Two states of one map (Shoal Cave): at high tide the `flood` boxes are surf water (`t`, default @water) and
    the `seal` boxes are rock (flooded tunnels); at low tide both are the floor drawn by the other ops.
    Events may carry `tide: "high"|"low"` to exist at one tide only."""
    for k in ("flood", "seal"):
        for x0, y0, x1, y1 in op.get(k, []):
            m.tide[k] |= {(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1) if m.inside(x, y)}
    m.tide["t"] = op.get("t", "@water")


def convert_hm_props(m):
    """Rock Smash rocks and Cut trees placed as props become mechanics, so the game can remove them."""
    for p_ in [p_ for p_ in m.props if p_[0] in HM_KIND]:
        m.props.remove(p_)
        m.mech.append(dict(kind=HM_KIND[p_[0]], x=p_[1], y=p_[2], slug=p_[0]))


def apply_mech(m, C, tide="low"):
    """Collision chars of the mechanics over the terrain ones (before the trigger cells)."""
    for (x, y), ch in m.mgrid.items():
        C[y][x] = ch
    for e in m.mech:
        C[e["y"]][e["x"]] = MECH_CHAR[e["kind"]]
    if tide == "high":
        for x, y in m.tide["flood"]:
            C[y][x] = "~"
        for x, y in m.tide["seal"]:
            C[y][x] = "#"


def art(m):
    """role -> slug for every mechanic art role that resolves in this theme (exported for the game)."""
    kinds = {e["kind"] for e in m.mech} | {t["kind"] for t in m.triggers.values()}
    need = kinds | {"gateopen" for k in kinds if k == "gate"} | {"leveron" for k in kinds if k == "lever"}
    need |= {"lavafill"} if "L" in m.mgrid.values() else set()
    out = {}
    for r in MECH_ART:
        s = m.res("@" + r, required=False) if r in need else None
        if s:
            out[r] = s
    for e in m.mech:
        if e.get("slug"):
            out.setdefault(e["kind"], e["slug"])
    return out


def high_grid(m):
    """The terrain grid at high tide: flood -> water, seal -> rock with its face."""
    water = m.res(m.tide.get("t", "@water"), required=False) or m.res("@water", required=False)
    wall = m.res("@wall", required=False)
    g = [row[:] for row in m.grid]
    for x, y in m.tide["flood"]:
        g[y][x] = water
    for x, y in m.tide["seal"]:
        g[y][x] = wall
    if m.kind == "cave":
        saved = m.grid
        m.grid = g
        faces(m)
        m.grid = saved
    return g


def overlay(m):
    """Preview images of the mechanics (16 px scale): (RGBA image, x px, y px) with art or a placeholder colour."""
    from PIL import Image as _I
    out = []
    TS = m.mg.TS

    def tile(role, slug=None):
        slug = slug or m.res("@" + role, required=False)
        if slug and slug in m.go.PROPS:
            w, h = m.go.PROPS[slug]["cells"]
            return m.go.prop_frames(slug)[0].crop((0, 0, w * TS, h * TS)), h
        im = _I.new("RGBA", (TS, TS))
        c = PLACEHOLDER_RGB.get(role, (255, 0, 255))
        for yy in range(2, TS - 2):
            for xx in range(2, TS - 2):
                im.putpixel((xx, yy), c + (255,) if 3 < xx < TS - 4 and 3 < yy < TS - 4 else (24, 24, 32, 255))
        return im, 1
    for e in m.mech:
        im, h = tile(e["kind"], e.get("slug"))
        out.append((im, e["x"] * TS, (e["y"] - h + 1) * TS))
    for t in m.triggers.values():
        if t["kind"] == "cart":
            im, h = tile("cart")
            out.append((im, t["x"] * TS, (t["y"] - h + 1) * TS))
    for (x, y), ch in m.mgrid.items():
        role = {"L": "lava", "i": "ice", "r": "rail", "^": "ledgen", ">": "ledgee", "<": "ledgew"}.get(ch)
        if role in m.placeholders:
            im = _I.new("RGBA", (TS, TS), PLACEHOLDER_RGB[role] + (150,))
            out.append((im, x * TS, y * TS))
    return out


# ---------------------------------------------------------------------------------- solver (whole cave, mechanics)
def solve_cave(maps_dir, slugs, tide="low", cap=30000):
    """Play the cave's mechanics from every mouth: walking (ledges one way, ice slides to a stop), ladders, holes,
    carts, Strength pushes (a boulder fills lava, falls through a hole to the floor below, or locks onto a switch
    that opens its barriers), levers flipping cave bits for the gates. Surf and the cutting HMs are assumed.
    Boulders that are not saved (on a switch, fallen, sunk) go back when the Player leaves the floor (Gen 3).
    Returns (errors, notes)."""
    floors = {s: load_floor(maps_dir, s, tide) for s in slugs}
    E, N = [], []
    origin, sw, bar, gates, levers, trig, stand = {}, {}, {}, {}, {}, {}, {}
    for s, f in floors.items():
        for e in f["events"]:
            t, p = e["type"], (e["x"], e["y"])
            if t == "boulder":
                origin[(s, e.get("id") or f"{p}")] = (s, *p)
            elif t == "switch":
                sw[(s, *p)] = e.get("id", "1")
            elif t == "barrier":
                bar[(s, *p)] = e.get("id", "1")
            elif t == "gate":
                gates[(s, *p)] = (int(e.get("bit", 0)), str(e.get("open", "True")).lower() == "true")
            elif t == "lever":
                levers[(s, *p)] = int(e.get("bit", 0))
            elif t in ("ladder", "hole", "cave_exit", "cart"):
                trig[(s, *p)] = e
            elif t in ("item", "npc", "trainer"):
                stand[(s, *p)] = f"{t} {e.get('name')}"
    keys = sorted(origin)

    def ok(s, x, y):
        C = floors[s]["C"]
        return 0 <= y < len(C) and 0 <= x < len(C[0])

    def open_cell(s, x, y, occ, filled, bits, pressed):
        if not ok(s, x, y) or (s, x, y) in occ:
            return False
        c = floors[s]["C"][y][x]
        if c in ".,fScHioB~":
            return True
        if c == "X":
            return bar[(s, x, y)] in pressed
        if c == "G":
            bit, op = gates[(s, x, y)]
            return op != bool(bits >> bit & 1)
        if c == "L":
            return (s, x, y) in filled
        return False

    def landing(e, s):
        to = e.get("to")
        if e["type"] == "ladder":
            p = [q for q in floors.get(to, {"events": []})["events"] if q["type"] == "ladder" and q.get("id") == e.get("id")]
            return (to, p[0]["x"], p[0]["y"] + 1) if p else None
        if e["type"] == "hole":
            return (to, e["x"], e["y"]) if to in floors else None
        if e["type"] == "cart":
            lx, ly = (int(v) for v in e["land"].split(","))
            return (s, lx, ly)
        return None

    def explore(s, start, occ, filled, bits, pressed):
        seen, q, hits = {start}, [start], []
        while q:
            x, y = q.pop()
            C = floors[s]["C"]
            if C[y][x] == "S" and (x, y) != start:
                hits.append((x, y))
                continue
            for dx, dy in DIRS4:
                nx, ny = x + dx, y + dy
                if not ok(s, nx, ny):
                    continue
                c = C[ny][nx]
                if c in LEDGE_CH:
                    if LEDGE_CH[c] != (dx, dy) or not open_cell(s, nx + dx, ny + dy, occ, filled, bits, pressed):
                        continue
                    nx, ny = nx + dx, ny + dy
                elif not open_cell(s, nx, ny, occ, filled, bits, pressed):
                    continue
                while C[ny][nx] == "i" and open_cell(s, nx + dx, ny + dy, occ, filled, bits, pressed):
                    nx, ny = nx + dx, ny + dy           # Gen 3 ice: slide until blocked or off the ice
                if (nx, ny) not in seen:
                    seen.add((nx, ny))
                    q.append((nx, ny))
        return seen, hits

    starts, mouths = [], set()
    for (s, x, y), e in sorted(trig.items()):
        if e["type"] == "cave_exit" and (s, e.get("to")) not in mouths:
            mouths.add((s, e.get("to")))
            for dx, dy in DIRS4:
                if ok(s, x + dx, y + dy) and floors[s]["C"][y + dy][x + dx] in ".,fio":
                    starts.append((s, x + dx, y + dy, f"{s} exit to {e.get('to')}"))
                    break
    reached, capped = set(), False
    all_exits = {e.get("to") for e in trig.values() if e["type"] == "cave_exit"}
    for s0, x0, y0, label in starts:
        init = (s0, (x0, y0), tuple(origin[k] for k in keys), frozenset(), 0, frozenset())
        seen_states, q, exits, n = set(), deque([init]), set(), 0
        while q:
            s, pos, bpos, filled, bits, saved = q.popleft()
            occ = {b for b in bpos if b}
            pressed = {sw[b] for b in occ if b in sw}
            cells, hits = explore(s, pos, occ, filled, bits, pressed)
            key = (s, hash(tuple(sorted(cells))), bpos, filled, bits)
            if key in seen_states:
                continue
            seen_states.add(key)
            n += 1
            if n > cap:
                capped = True
                break
            reached |= {(s, *c) for c in cells}

            def push(st):
                q.append(st)
            for hx, hy in hits:                                   # warps
                e = trig[(s, hx, hy)]
                if e["type"] == "cave_exit":
                    exits.add(e.get("to"))
                    continue
                to = landing(e, s)
                if not to or to[0] not in floors:
                    continue
                nb = bpos
                if to[0] != s:                                    # leaving the floor: unsaved boulders go back
                    nb = tuple(b if (k in saved or (b and b[0] != s) or b is None) else origin[k]
                               for k, b in zip(keys, bpos))
                push((to[0], to[1:], nb, filled, bits, saved))
            for (ls, lx, ly), bit in levers.items():               # levers: A from a cell beside them
                if ls == s and any((lx + dx, ly + dy) in cells for dx, dy in DIRS4):
                    p = next((lx + dx, ly + dy) for dx, dy in DIRS4 if (lx + dx, ly + dy) in cells)
                    push((s, p, bpos, filled, bits ^ (1 << bit), saved))
            for i, b in enumerate(bpos):                           # Strength: walk into a boulder from beside it
                if not b or b[0] != s or b in sw:                  # a boulder on a switch stays put
                    continue
                k = keys[i]
                for dx, dy in DIRS4:
                    x, y = b[1] - dx, b[2] - dy
                    tx, ty = b[1] + dx, b[2] + dy
                    if (x, y) not in cells or not ok(s, tx, ty) or (s, tx, ty) in occ:
                        continue
                    c = floors[s]["C"][ty][tx]
                    nb, nf, ns = list(bpos), filled, saved
                    if c in ".,fioB":
                        nb[i] = (s, tx, ty)
                        if (s, tx, ty) in sw:
                            ns = saved | {k}
                    elif c == "L" and (s, tx, ty) not in filled:
                        nb[i], nf, ns = None, filled | {(s, tx, ty)}, saved | {k}
                    elif c == "L":
                        nb[i] = (s, tx, ty)
                    elif c == "S" and trig.get((s, tx, ty), {}).get("type") == "hole":
                        to = trig[(s, tx, ty)].get("to")
                        if to not in floors or (to, tx, ty) in occ or floors[to]["C"][ty][tx] not in ".,fioB":
                            continue
                        nb[i], ns = (to, tx, ty), saved | {k}
                    else:
                        continue
                    push((s, (x, y), tuple(nb), nf, bits, ns))
            if all_exits <= exits and all(any((s_, x_ + dx, y_ + dy) in reached for dx, dy in DIRS4 + ((0, 0),))
                                          for (s_, x_, y_) in stand):
                break                                             # everything found: no need to play on
        N.append(f"solve [{tide}] from {label}: {n} states, reaches exits to {sorted(exits) or 'none'}"
                 + (" (state cap hit: partial)" if n > cap else ""))
        if not exits:
            E.append(f"solve [{tide}]: from {label} no way out")
    if not capped:
        for (s, x, y), what in sorted(stand.items()):
            if not any((s, x + dx, y + dy) in reached for dx, dy in DIRS4 + ((0, 0),)):
                E.append(f"solve [{tide}]: {s} {what} at {x},{y} cannot be reached with the mechanics")
    return E, N
