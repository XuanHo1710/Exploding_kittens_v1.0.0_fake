"""
Organic layout passes for mapgen (ops `vary`, `forest_edge`, `decorate`, `plateau`, `stream`).

They turn a correct but stiff layout (one flat lawn, straight walls of identical 2x2 trees, props
sprinkled evenly) into a natural one, the way Gen 3 maps read: the ground changes in soft patches,
forest edges are ragged and layered with trees stepping out of the wall, decoration comes in small
vignettes with a purpose, and the land has height. Everything is deterministic from the map seed.

Every pass only touches free lawn (grid None or one of the ground variants), never a floor, a door
step, an exit mouth or a cell the spec reserves (`clear` boxes, trainer sight lines). Every blocking
piece it adds is checked against reachability: if the player could no longer reach an exit or a door
from home, or a pocket of more than a few cells is cut off, the piece is taken back.
"""
import math
import os
import sys
from collections import deque

_OW = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "overworld")  # tools/overworld (+ pieces)
sys.path[:0] = [p for p in (_OW, os.path.join(_OW, "pieces")) if p not in sys.path]
import gen_overworld as GO  # noqa: E402

# walkable ground patches on the lawn (every theme's nature kit; flagged patch=True on the terrain)
VARIANTS = tuple(s for s, t in GO.TERRAIN.items() if t.get("patch"))
FLOWERS = ("flowers", "flowers-yellow", "flowers-white", "flowers-blue")
TREES = (("tree", 4), ("pine-tree", 3), ("tree-small", 3))    # species of the trees that step out of a wall
BUSHES = (("bush", 4), ("bush-wide", 2), ("bush-flower", 2))
D8 = [(dx, dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dx or dy]
D4 = ((1, 0), (-1, 0), (0, 1), (0, -1))

CAP = {"log": 1, "well": 1, "stump": 2}         # at most this many per 1500 cells: they read as landmarks
# vignettes: (pool, min, max). "*flowers" picks one or two colours per vignette.
KITS = {
    "meadow": [
        [("*flowers", 3, 4), ("tuft", 1, 2), (("rock", "rocks-small", "pebbles"), 0, 1)],
        [("bush-flower", 1, 1), ("*flowers", 2, 3), ("tuft", 1, 1)],
        [("rocks-small", 1, 1), ("pebbles", 1, 1), ("tuft", 1, 2), ("*flowers", 0, 2)],
        [(("bush", "bush-wide"), 1, 1), ("tuft", 1, 2), ("*flowers", 1, 2)],
        [("*flowers", 2, 3), ("tuft", 2, 3)],
    ],
    "grove": [
        [(("tree-small", "tree", "pine-tree"), 1, 1), ("tree-small", 0, 1), ("*flowers", 1, 2), ("tuft", 1, 2)],
        [("pine-tree", 1, 1), ("stump", 0, 1), ("mushrooms", 1, 1), ("tuft", 1, 1)],
    ],
    "woods": [
        [("stump", 1, 1), ("mushrooms", 1, 2), ("tuft", 1, 1)],
        [("log", 1, 1), ("mushrooms", 1, 1), ("tuft", 1, 2)],
        [(("bush", "bush-flower"), 1, 2), ("mushrooms", 0, 1), ("flowers-white", 0, 1), ("tuft", 1, 1)],
    ],
    "water": [
        [("reeds", 2, 3), ("lily-pad", 1, 2), ("tuft", 0, 1)],
        [("reeds", 1, 2), ("lily-pad", 1, 1), ("flowers-blue", 0, 1), ("tuft", 1, 1)],
    ],
    "town": [
        [("flower-bed", 1, 1), ("*flowers", 1, 2)],
        [("barrel", 1, 2), ("crates", 1, 2)],
        [("planter", 1, 1), ("*flowers", 1, 2), ("tuft", 0, 1)],
        [("bush-flower", 1, 2), ("*flowers", 1, 2)],
        [("well", 1, 1), ("*flowers", 1, 2), ("tuft", 1, 1)],
    ],
}


# ---------------------------------------------------------------- theme kits
# Each theme's `nature` entry in themes.json says which piece plays which part in these passes (the
# meadow defaults above are the reference): `vary` patches, `swap` (meadow piece -> theme piece, e.g.
# tuft -> fire-tuft), `flowers`, `trees` / `alt` / `canopy` / `bushes` / `floor` for forest_edge,
# extra vignettes per context in `more` (or `kits` to replace a context), `pond` settings.
VARY = [["lush-grass", 0.22, 8, 0], ["clover", 0.08, 6, 0], ["worn-earth", 0.06, 5, 1]]
FLOOR = (("fern", 5), ("tuft", 3), ("mushrooms", 1.4), ("flowers-white", 0.8), ("stump", 0.5))


def kit(m):
    return m.mg.THEMES.get(m.theme, {}).get("nature", {})


def sw(m, slug):
    """The theme's stand-in for a meadow prop (tuft -> fire-tuft ...), or the slug itself."""
    alt = kit(m).get("swap", {}).get(slug)
    return alt if alt and alt in m.go.PROPS else slug


def flowers_of(m):
    fl = [f for f in kit(m).get("flowers", FLOWERS) if f in m.go.PROPS]
    return fl or list(FLOWERS)


def swap_pool(m, pool):
    """[(slug, weight)] with every slug swapped for the theme's stand-in."""
    return [(sw(m, s), w) for s, w in pool]


# ---------------------------------------------------------------- noise
def _hash(seed, k, ix, iy):
    n = (ix * 374761393 + iy * 668265263 + seed * 2246822519 + k * 3266489917) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535


def noise(x, y, scale, seed, k=0):
    """Smooth value noise in [0, 1] with features about `scale` cells across, plus a finer octave."""
    def one(sc, kk):
        fx, fy = x / sc, y / sc
        ix, iy = math.floor(fx), math.floor(fy)
        tx, ty = fx - ix, fy - iy
        tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
        a, b = _hash(seed, kk, ix, iy), _hash(seed, kk, ix + 1, iy)
        c, d = _hash(seed, kk, ix, iy + 1), _hash(seed, kk, ix + 1, iy + 1)
        return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty
    return 0.68 * one(scale, k) + 0.32 * one(scale / 2.4, k + 101)


# ---------------------------------------------------------------- shared helpers
def seed_of(m, op):
    s = op.get("seed", m.spec.get("seed", 1))
    return s if isinstance(s, int) else sum(map(ord, str(s)))


def lawnish(m, x, y, top=False):
    """Open lawn: bare, a ground patch, or (top=True) the walkable top of a plateau."""
    s = m.grid[y][x]
    if s is None or s in VARIANTS:
        return True
    return top and m.go.group_of(s) == "cliff" and m.go.TERRAIN[s]["kind"] == "blob" and not m.cell_solid_terrain(x, y)


def keep_out(m, pad=2, water=False):
    """Cells a pass must leave alone: floors, structures and their door steps, exit mouths (and
    `pad` cells around them), reserved cells and, with water=True, water."""
    near = set()
    seeds = set()
    for y in range(m.H):
        for x in range(m.W):
            s = m.grid[y][x]
            if m.is_floor(s) or (s and m.go.TERRAIN[s]["kind"] == "row"):
                seeds.add((x, y))
            elif water and s and m.go.TERRAIN[s].get("behaviour") in ("POND_WATER", "OCEAN_WATER"):
                seeds.add((x, y))
    for st in m.structs:
        seeds |= st["foot"] | st["doors"]
        seeds |= {(x, y + k) for x, y in st["doors"] for k in (1, 2, 3)}
    for e in m.exits.values():
        for (x, y) in e["cells"]:
            dx, dy = {"N": (0, 1), "S": (0, -1), "W": (1, 0), "E": (-1, 0)}[e["side"]]
            seeds |= {(x + dx * k, y + dy * k) for k in range(6)}
    for (x, y) in seeds:
        for j in range(-pad, pad + 1):
            for i in range(-pad, pad + 1):
                near.add((x + i, y + j))
    return near | m.reserved


def home_cells(m):
    home = m.home or (next(iter(m.exits)) if m.exits else None)
    return m.exits[home]["cells"] if home in m.exits else []


def reach(m, C):
    """Cells the player can reach from the home exit (ledges one way, doors from below)."""
    MG = m.mg
    starts = [c for c in home_cells(m) if C[c[1]][c[0]] in (".,fD~" if MG.SURF else ".,fD")]
    seen = set(starts)
    q = deque(starts)
    while q:
        x, y = q.popleft()
        for nx, ny, _ in MG.neighbours(C, x, y, surf=MG.SURF):
            if (nx, ny) not in seen:
                seen.add((nx, ny))
                q.append((nx, ny))
    return seen


class Guard:
    """Keeps every exit and door reachable from home while blocking pieces go in: `ok()` after a
    change says whether to keep it (at most `pocket` reachable cells may be lost besides the cells
    the change itself covers)."""

    def __init__(self, m, pocket=3):
        self.m, self.pocket = m, pocket
        self.m.mg.SURF = bool(m.spec.get("surf"))
        self.targets = [e["cells"] for n, e in m.exits.items()] + [sorted(st["doors"]) for st in m.structs if st["doors"]]
        self.size = len(reach(m, m.collision())) if m.exits else 0

    def ok(self, covered=1, cells=()):
        """`cells`: the cells the change just blocked; a change that squeezes a walkable cell next to
        them into a 1-cell slot (blocked on both sides along a row or column) is refused too."""
        C = self.m.collision()
        if cells and makes_slot(self.m, C, set(cells)):
            return False
        if not self.m.exits:
            return True
        R = reach(self.m, C)
        if any(not any(c in R for c in cells) for cells in self.targets):
            return False
        if len(R) < self.size - covered - self.pocket:
            return False
        self.size = len(R)
        return True


def makes_slot(m, C, new):
    """True when the change touches a 1-cell slot: a walkable cell beside the `new` blocked cells is
    pinched between two blocked cells (left+right or up+down), or a new cell plugs such a corridor.
    Slots read as glitches, and closing a corridor's mouth leaves a dead end."""
    def blocked(x, y, before):
        if not m.inside(x, y):
            return True
        if before and (x, y) in new:
            return False
        return C[y][x] in "#~H"

    def pinched(x, y, before):
        return (blocked(x - 1, y, before) and blocked(x + 1, y, before)) or \
               (blocked(x, y - 1, before) and blocked(x, y + 1, before))
    if any(pinched(*c, True) for c in new):
        return True                      # never plug a 1-cell corridor: its two halves become dead ends
    ring = {(x + dx, y + dy) for x, y in new for dx, dy in D4} - new
    # any pinched walkable neighbour: a new slot, or an old 1-cell corridor whose mouth this would close
    return any(m.inside(*c) and C[c[1]][c[0]] in ".,f" and pinched(*c, False) for c in ring)


def blocking(m, slug):
    return slug not in m.mg.WALKABLE_PROPS


def try_prop(m, guard, slug, x, y, force=False, over_wall=False):
    """place_prop plus the reachability guard for blocking props. over_wall: an upright prop whose
    base row stands on free ground may lean its crown over a tree wall (y-sorted, it overlaps it)."""
    if any((cx, cy) in m.reserved for cx, cy in cells_of(m, slug, x, y)) and not force:
        return False
    if over_wall:
        w = m.go.PROPS[slug]["cells"][0]
        base = [(x + i, y) for i in range(w)]
        crown = cells_of(m, slug, x, y) - set(base)
        steps = {(a, b + k) for st in m.structs for a, b in st["doors"] for k in (1, 2)}
        if any(not m.inside(*c) or m.cell_solid_terrain(*c) or m.is_floor(m.grid[c[1]][c[0]]) or c in steps
               or c in m.reserved for c in base):
            return False
        if any(not m.inside(*c) or (not is_wall(m, m.grid[c[1]][c[0]]) and m.cell_solid_terrain(*c)) for c in crown):
            return False
        force = True
    if not m.place_prop(slug, x, y, force):
        return False
    if blocking(m, slug):
        w = m.go.PROPS[slug]["cells"][0]
        if not guard.ok(covered=w, cells=[(x + i, y) for i in range(w)]):
            m.props.pop()
            m.busy -= cells_of(m, slug, x, y)
            return False
    return True


def cells_of(m, slug, x, y):
    w, h = m.go.PROPS[slug]["cells"]
    return {(x + i, y - j) for i in range(w) for j in range(h)}


def _pool(m, items):
    """[(slug, weight)] from a list of slugs, roles (@ttree) or (slug, weight) pairs."""
    out = []
    for it in items:
        s, w = (it, 1) if isinstance(it, str) else it
        for slug in (m.role_pool(s) if s.startswith("@") else [s]):
            out.append((slug, w))
    return out


def pick(pool, r):
    tot = sum(w for _, w in pool)
    acc = 0
    for s, w in pool:
        acc += w
        if r * tot < acc:
            return s
    return pool[-1][0]


def dist_field(m, sources, limit=99):
    """Chebyshev distance from a set of cells (BFS, 8 neighbours), capped at `limit`."""
    dist = {c: 0 for c in sources}
    q = deque(sources)
    while q:
        x, y = q.popleft()
        d = dist[(x, y)]
        if d >= limit:
            continue
        for dx, dy in D8:
            c = (x + dx, y + dy)
            if m.inside(*c) and c not in dist:
                dist[c] = d + 1
                q.append(c)
    return dist


# ---------------------------------------------------------------- organic shapes on the cell grid
def components(cells):
    """4-connected components of a set of cells, largest first."""
    seen, out = set(), []
    for c0 in sorted(cells):
        if c0 in seen:
            continue
        comp, q = set(), [c0]
        while q:
            c = q.pop()
            if c in seen or c not in cells:
                continue
            seen.add(c)
            comp.add(c)
            q += [(c[0] + dx, c[1] + dy) for dx, dy in D4]
        out.append(comp)
    return sorted(out, key=len, reverse=True)


def smooth(cells, allowed, rounds=2):
    """Cellular smoothing: a cell joins when 5+ of its 8 neighbours are in, leaves when 3 or fewer
    are. Rounds off corners and fills bays, so outlines read as blobs instead of boxes."""
    cells = set(cells)
    for _ in range(rounds):
        cand = cells | {(x + dx, y + dy) for x, y in cells for dx, dy in D8}
        nxt = set()
        for c in cand:
            if c not in allowed:
                continue
            k = sum((c[0] + dx, c[1] + dy) in cells for dx, dy in D8)
            if k >= 5 or (c in cells and k >= 4):
                nxt.add(c)
        cells = nxt
    return cells


def tidy(cells, allowed=None, min_size=1, holes=True):
    """Make a shape autotile-friendly: every cell sits in a full 2x2 of the shape (no 1-cell spurs or
    strips), 1-cell holes and notches are filled (when `allowed`), islands under `min_size` go."""
    cells = set(cells)
    for _ in range(4):
        before = len(cells)
        if holes and allowed is not None:
            for c in {(x + dx, y + dy) for x, y in cells for dx, dy in D4} - cells:
                if c in allowed and sum((c[0] + dx, c[1] + dy) in cells for dx, dy in D4) >= 3:
                    cells.add(c)
        cells = {(x, y) for x, y in cells
                 if any(all((x + i, y + j) in cells for i in (a, a + 1) for j in (b, b + 1))
                        for a in (-1, 0) for b in (-1, 0))}
        if len(cells) == before:
            break
    return set().union(*[c for c in components(cells) if len(c) >= min_size]) if cells else cells


def warped(x, y, scale, seed, k, warp=2.5):
    """Domain-warped noise: blobs with lobes and bays instead of round puddles of plain value noise."""
    wx = (noise(x, y, scale * 1.3, seed, k + 7) - 0.5) * 2 * warp
    wy = (noise(x, y, scale * 1.3, seed, k + 13) - 0.5) * 2 * warp
    return noise(x + wx, y + wy, scale, seed, k)


# ---------------------------------------------------------------- vary: soft ground patches
def vary(m, op):
    """Noise-driven patches of lush grass, clover meadow and worn earth on the free lawn. `cover`
    gives each one's share of the free lawn; worn earth leans toward the lanes (trodden ground)."""
    seed = seed_of(m, op)
    base = op.get("kinds") or kit(m).get("vary") or VARY
    base = [list(k) + [0] * (4 - len(k)) for k in base]
    cover = op.get("cover", [k[1] for k in base])
    for i, key in enumerate(("lush", "meadow", "earth")):        # old per-slot overrides still work
        if key in op and i < len(base):
            base[i][0] = op[key]
    kinds = [(k[0], cover[i] if i < len(cover) else k[1], k[2], 21 + i, k[3]) for i, k in enumerate(base)]
    x0, y0, x1, y1 = op.get("box", (0, 0, m.W - 1, m.H - 1))
    avoid = keep_out(m, op.get("margin", 0))      # patches may touch lanes and ledges: they blend
    struct = {c for st in m.structs for c in st["foot"] | st["doors"]}
    avoid |= {(x + i, y + j) for x, y in struct for i in (-1, 0, 1) for j in (-1, 0, 1)}
    for q in getattr(m, "quarters", []):          # gym quarters and theme patches keep their own ground
        avoid |= {(x, y) for x in range(q[0] - 1, q[2] + 2) for y in range(q[1] - 1, q[3] + 2)}
    for pt in getattr(m, "patches", []):
        avoid |= {(x, y) for x in range(pt[1] - 1, pt[3] + 2) for y in range(pt[2] - 1, pt[4] + 2)}
    free = [(x, y) for y in range(max(0, y0), min(m.H, y1 + 1)) for x in range(max(0, x0), min(m.W, x1 + 1))
            if m.grid[y][x] is None and (x, y) not in avoid and (x, y) not in struct]
    if not free:
        return
    floor = [(x, y) for y in range(m.H) for x in range(m.W) if m.is_floor(m.grid[y][x])]
    near_lane = dist_field(m, floor, 6) if floor else {}
    taken = {}
    freeset = set(free)
    for slug, cover, scale, k, lane in kinds:
        if not slug or cover <= 0 or slug not in m.go.TERRAIN:
            continue
        val = {}
        for c in free:
            if c in taken:
                continue
            v = warped(c[0], c[1], scale, seed, k)
            if lane:                                  # trodden ground leans toward the lanes
                d = near_lane.get(c, 9)
                v += 0.22 if 2 <= d <= 4 else 0.08 if d == 5 else 0
            val[c] = v
        n = int(len(free) * cover)
        mine = set(sorted(val, key=lambda c: -val[c])[:n])
        # organic outline: smooth the threshold, then every cell in a full 2x2, no 1-cell holes
        room = freeset - set(taken)
        mine = tidy(smooth(mine, room, 3), room, op.get("min_size", 6))
        for c in mine:
            taken[c] = slug
    for (x, y), s in taken.items():
        m.grid[y][x] = s
    m.notes.append("vary: " + ", ".join(f"{sum(1 for s in taken.values() if s == k[0])} {k[0]}" for k in kinds)
                   + " cells")


# ---------------------------------------------------------------- forest_edge: ragged, layered walls
def is_wall(m, s):
    """Tree walls of any theme: 2x2 tree blocks (tree-wall, pine-wall, <type>-tree-wall) and forest blobs."""
    return s is not None and (m.go.TERRAIN[s]["kind"] == "quad" or m.go.group_of(s) == "tree-wall"
                              or s == "forest" or s.endswith("-forest"))


def forest_edge(m, op):
    """Break straight tree walls: whole-tree lobes grown out of the wall edge, groves of a second
    species (pine-wall) inside the wall, single trees of mixed species stepping out in front of it
    (touching it, or 3+ cells clear, never leaving a 1-cell corridor) and bushes at its foot."""
    seed = seed_of(m, op)
    K = kit(m)
    wall = m.res(op.get("t", "@wall"))
    alt = op.get("alt", K.get("alt", "pine-wall"))
    alt = alt if alt in m.go.TERRAIN else None
    guard = Guard(m, pocket=op.get("pocket", 6))
    avoid = keep_out(m, op.get("margin", 2), water=True)
    x0, y0, x1, y1 = op.get("box", (0, 0, m.W - 1, m.H - 1))

    def inbox(x, y):
        return x0 <= x <= x1 and y0 <= y <= y1

    def free(x, y):
        return (m.inside(x, y) and inbox(x, y) and lawnish(m, x, y) and (x, y) not in m.busy
                and (x, y) not in avoid)

    # 1) lobes: whole 2x2 trees on even cells grown out of the wall edge (two rounds = up to 4 deep)
    lobes = 0
    lob = op.get("lobes", 0.6)
    for rnd, chance in enumerate((lob, lob * 0.65, lob * 0.4)):     # three rounds: lobes 2-6 cells deep
        for by in range(0, m.H - 1, 2):
            for bx in range(0, m.W - 1, 2):
                blk = [(bx, by), (bx + 1, by), (bx, by + 1), (bx + 1, by + 1)]
                if not all(free(*c) for c in blk):
                    continue
                ring = [(bx + i, by + j) for i in range(-1, 3) for j in range(-1, 3) if not (0 <= i <= 1 and 0 <= j <= 1)]
                touch = sum(1 for c in ring if m.inside(*c) and is_wall(m, m.grid[c[1]][c[0]]))
                if touch < 3 or any(m.inside(*c) and not (free(*c) or is_wall(m, m.grid[c[1]][c[0]])) for c in ring):
                    continue
                # no 1-cell slots: a free cell beside the block must not have a wall right behind it
                slot = False
                for (cx, cy), (dx, dy) in [((bx - 1, by + j), (-1, 0)) for j in (0, 1)] + \
                        [((bx + 2, by + j), (1, 0)) for j in (0, 1)] + \
                        [((bx + i, by - 1), (0, -1)) for i in (0, 1)] + [((bx + i, by + 2), (0, 1)) for i in (0, 1)]:
                    if m.inside(cx, cy) and free(cx, cy) and m.inside(cx + dx, cy + dy) and \
                            (is_wall(m, m.grid[cy + dy][cx + dx]) or m.cell_solid_terrain(cx + dx, cy + dy)):
                        slot = True
                if slot:
                    continue
                if noise(bx, by, 6.5, seed, 31) * 0.7 + noise(bx, by, 3, seed, 33 + rnd) * 0.3 < 1 - chance:
                    continue
                old = [m.grid[y][x] for x, y in blk]
                for x, y in blk:
                    m.grid[y][x] = wall
                if guard.ok(covered=4, cells=blk):
                    lobes += 1
                else:
                    for (x, y), s in zip(blk, old):
                        m.grid[y][x] = s
    # 2) groves of the second species inside the wall (whole even blocks only)
    groves = 0
    if alt:
        for by in range(0, m.H - 1, 2):
            for bx in range(0, m.W - 1, 2):
                blk = [(bx, by), (bx + 1, by), (bx, by + 1), (bx + 1, by + 1)]
                if all(m.grid[y][x] == wall for x, y in blk) and inbox(bx, by) and \
                        noise(bx, by, op.get("grove_scale", 9), seed, 41) > 1 - op.get("mix", K.get("mix", 0.32)):
                    for x, y in blk:
                        m.grid[y][x] = alt
                    groves += 1
    # 3) trees stepping out of the wall: touching it, or at least 3 cells clear of it
    walls = [(x, y) for y in range(m.H) for x in range(m.W) if is_wall(m, m.grid[y][x])]
    dist = dist_field(m, walls, 8)
    reach_ = op.get("reach", 5)
    pool = [(s, w) for s, w in _pool(m, op.get("trees", K.get("trees", TREES))) if s in m.go.PROPS]
    trees = 0
    cand = sorted(((noise(x, y, 5, seed, 51) * 0.75 + _hash(seed, 54, x, y) * 0.25, x, y) for (x, y), d in dist.items()
                   if d == 1 or 3 <= d <= reach_), reverse=True)
    for v, x, y in cand if pool else ():
        if v < 1 - op.get("density", 0.6) * (1.2 if dist.get((x, y)) == 1 else 0.7):
            continue
        # species in clumps (a run of pines, a stand of young trees), not alternating tree by tree
        slug = pick(pool, min(0.999, noise(x, y, 6, seed, 53) * 0.8 + _hash(seed, 52, x, y) * 0.2))
        w, h = m.go.PROPS[slug]["cells"]
        base = [(x + i, y) for i in range(w)]
        cover = cells_of(m, slug, x, y)
        if not all(free(*c) for c in base) or any(not m.inside(*c) for c in cover):
            continue
        ds = {dist.get(c, 99) for c in base}
        if not (min(ds) == 1 and max(ds) <= 2 or min(ds) >= 3 and max(ds) <= reach_):
            continue
        if any(c in m.busy for c in cover if not is_wall(m, m.grid[c[1]][c[0]]) and c not in base):
            continue
        # keep trees apart (no 1-cell slots between two trunks)
        if any((bx + dx, by + dy) in m.busy for bx, by in base for dx, dy in D8
               if (bx + dx, by + dy) not in cover and m.inside(bx + dx, by + dy)
               and not is_wall(m, m.grid[by + dy][bx + dx]) and min(ds) > 1):
            continue
        if try_prop(m, guard, slug, x, y, over_wall=True):
            trees += 1
    # 4) bushes along the foot of a south-facing wall edge, in short runs
    bushes = 0
    bpool = [(s, w) for s, w in _pool(m, op.get("bushes", K.get("bushes") or swap_pool(m, BUSHES))) if s in m.go.PROPS]
    for (x, y), d in sorted(dist.items(), key=lambda t: (t[0][1], t[0][0])) if bpool else ():
        if d != 1 or not m.inside(x, y - 1) or not is_wall(m, m.grid[y - 1][x]):
            continue
        if noise(x, y, 2.5, seed, 61) < 1 - op.get("bush", 0.3):
            continue
        slug = pick(bpool, _hash(seed, 62, x, y))
        w = m.go.PROPS[slug]["cells"][0]
        if all(free(x + i, y) for i in range(w)) and try_prop(m, guard, slug, x, y):
            bushes += 1
    # 5) canopy: tree props over the wall off its 2-cell grid, so the wall reads as overlapping crowns
    #    of mixed species instead of a lattice of identical trees (y-sorted, they overlap each other)
    canopy = 0
    cpool = [s for s in K.get("canopy", ("tree", "pine-tree")) if s in m.go.PROPS]
    dens = op.get("canopy", 0.32)
    if cpool and dens > 0:
        placed_at = set()
        for y in range(1, m.H):
            for x in range(m.W - 1):
                if not inbox(x, y) or (x % 2 == 0 and y % 2 == 1):
                    continue                     # exactly on a block: adds nothing
                cov = [(x + i, y - j) for i in (0, 1) for j in (0, 1)]
                if not all(m.inside(*c) and is_wall(m, m.grid[c[1]][c[0]]) for c in cov):
                    continue
                if any(c in m.busy for c in cov):
                    continue
                if _hash(seed, 81, x, y) > dens * (0.5 + noise(x, y, 5, seed, 82)):
                    continue
                if any((x + dx, y + dy) in placed_at for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                    continue
                pine = any(alt and m.grid[c[1]][c[0]] == alt for c in cov) or noise(x, y, 7, seed, 83) > 0.68
                slug = cpool[-1] if pine else cpool[0]            # canopy = [round crown, pine]
                if m.place_prop(slug, x, y, force=True):
                    placed_at.add((x, y))
                    canopy += 1
    # 6) forest floor: ferns, tufts, mushrooms and the odd stump in stretches along the wall's foot
    floor_n = 0
    fl = op.get("floor", 0.4)
    fpool = [(s, w) for s, w in op.get("floor_kit", K.get("floor") or swap_pool(m, FLOOR)) if s in m.go.PROPS]
    walls = [(x, y) for y in range(m.H) for x in range(m.W) if is_wall(m, m.grid[y][x])]
    dist = dist_field(m, walls, 3)
    for (x, y), d in sorted(dist.items(), key=lambda t: (t[0][1], t[0][0])) if fpool and fl > 0 else ():
        if d not in (1, 2) or not free(x, y):
            continue
        if noise(x, y, 3.5, seed, 91) < 1 - fl or _hash(seed, 92, x, y) > (0.6 if d == 1 else 0.25):
            continue
        slug = pick(fpool, _hash(seed, 93, x, y))
        if blocking(m, slug):
            if any(_blocking_at(m, x + dx, y + dy) for dx, dy in D8) or not try_prop(m, guard, slug, x, y):
                continue
        elif not m.place_prop(slug, x, y):
            continue
        floor_n += 1
    m.notes.append(f"forest_edge: {lobes} lobes, {groves} pine groves, {trees} trees stepping out, {bushes} bushes, "
                   f"{canopy} canopy trees, {floor_n} forest-floor pieces")


# ---------------------------------------------------------------- decorate: clustered vignettes
def decorate(m, op):
    """Fill open lawn with small vignettes until no free cell is more than `max` cells from something
    to look at: mixed flowers + tufts + a rock in the open, stump / log + mushrooms by the trees,
    reeds and lily pads at the water, flower beds and barrels near houses (towns). Then dot the lane
    edges with tufts and pebbles."""
    m.flush_pending()
    seed = seed_of(m, op)
    rng = __import__("random").Random(seed * 7919 + 13)
    lim = op.get("max", 4)
    town = op.get("town", m.kind != "route")
    guard = Guard(m, pocket=op.get("pocket", 3))
    avoid = keep_out(m, op.get("margin", 1))
    x0, y0, x1, y1 = op.get("box", (0, 0, m.W - 1, m.H - 1))
    K = kit(m)
    kits = dict(K.get("kits", {}), **(op.get("kits") or {}))
    more = K.get("more", {})
    have = set(m.go.PROPS)
    theme_flowers = flowers_of(m)
    water = {(x, y) for y in range(m.H) for x in range(m.W)
             if m.grid[y][x] and m.go.TERRAIN[m.grid[y][x]].get("behaviour") == "POND_WATER"}
    walls = [(x, y) for y in range(m.H) for x in range(m.W)
             if m.grid[y][x] and (is_wall(m, m.grid[y][x]) or m.go.group_of(m.grid[y][x]) in ("hedge", "cliff"))]
    wall_d = dist_field(m, walls, 4) if walls else {}
    water_d = dist_field(m, list(water), 4) if water else {}
    struct = [c for st in m.structs for c in st["foot"]]
    struct_d = dist_field(m, struct, 7) if struct else {}
    tried = set()
    placed = vignettes = 0
    count = {}

    def candidates():
        C = m.collision()
        interest = set(m.busy) | tried
        for y in range(m.H):
            for x in range(m.W):
                s = m.grid[y][x]
                if s is not None and (is_wall(m, s) or lawnish(m, x, y, top=True)):
                    continue                    # walls are backdrop, plateau tops are lawn: both still want detail
                if (s is not None and s not in VARIANTS) or C[y][x] not in ".,f":
                    interest.add((x, y))
        D = dist_field(m, list(interest), lim + 6)
        out = [(d, c) for c, d in D.items() if d > lim and x0 <= c[0] <= x1 and y0 <= c[1] <= y1
               and lawnish(m, *c, top=True) and c not in avoid]
        return out

    def items_for(ctx):
        lst = (kits.get(ctx) or KITS[ctx]) + more.get(ctx, [])
        vig = lst[rng.randrange(len(lst))]
        cols = rng.sample(theme_flowers, min(2, len(theme_flowers))) * 2
        out = []
        for pool, lo, hi in vig:
            for _ in range(rng.randint(lo, hi)):
                if pool == "*flowers":
                    s = cols[0] if rng.random() < 0.6 else cols[1]
                elif isinstance(pool, (list, tuple)):
                    s = rng.choice(pool)
                else:
                    s = pool
                cap = CAP.get(s, 999)                     # caps count the meadow name (log, stump, well)
                s = sw(m, s)
                if s in have and count.get(s, 0) < cap * max(1, m.W * m.H // 1500):
                    out.append(s)
                    count[s] = count.get(s, 0) + 1
        return out

    def vignette(ax, ay, ctx):
        items = items_for(ctx)
        # blocking pieces first (they need the most room), then the walkable decals around them
        items.sort(key=lambda s: (not blocking(m, s), -m.go.PROPS[s]["cells"][0] * m.go.PROPS[s]["cells"][1]))
        r = 1 if ctx == "town" else 3           # town props stand together (a yard), nature spreads out
        spots = sorted(((abs(i) + abs(j) + rng.random() * (0.6 if ctx == "town" else 1.6), ax + i, ay + j)
                        for i in range(-r, r + 1) for j in range(-r, r + 1)), key=lambda t: t[0])
        got = 0
        for s in items:
            for _, x, y in spots:
                if not (m.inside(x, y) and (x, y) not in avoid):
                    continue
                if m.go.PROPS[s].get("water"):          # lily pads float on a water cell
                    if (x, y) in water and (x, y) not in m.busy and \
                            sum((x + dx, y + dy) in water for dx, dy in D8) >= 5:
                        m.props.append((s, x, y))
                        m.busy.add((x, y))
                        got += 1
                        break
                    continue
                if not lawnish(m, x, y, top=True):
                    continue
                if m.go.PROPS[s].get("bank") and not any((x + dx, y + dy) in water for dx, dy in D4):
                    continue
                if blocking(m, s) and any(_blocking_at(m, x + dx, y + dy) for dx, dy in D8
                                          if (x + dx, y + dy) not in cells_of(m, s, x, y)):
                    continue                    # blocking pieces never shoulder to shoulder (no 1-cell slots)
                if try_prop(m, guard, s, x, y):
                    got += 1
                    break
        return got

    # plateau tops are lawn too: a tree or two of mixed species on each big enough top
    for k, top in enumerate(getattr(m, "plateau_tops", [])):
        walk = sorted((c for c in top if lawnish(m, *c, top=True) and c not in avoid and c not in m.busy),
                      key=lambda c: _hash(seed, 77 + k, *c))
        want = 0 if len(walk) < 24 else 1 + len(walk) // 50
        got = 0
        for x, y in walk:
            if got >= want:
                break
            slug = sw(m, ("tree", "pine-tree", "tree-small")[(got + k) % 3])
            if slug not in have or not all(c in top for c in cells_of(m, slug, x, y)):
                continue
            if any(_blocking_at(m, x + dx, y + dy) for dx in (-2, -1, 0, 1, 2) for dy in (-1, 0, 1)):
                continue
            if try_prop(m, guard, slug, x, y):
                got += 1
                placed += 1
        for x, y in walk[len(walk) // 2:][:len(walk) // 40]:        # and meadow vignettes up there
            if (x, y) not in m.busy:
                placed += vignette(x, y, "meadow")
    # every pond gets one or two water vignettes on its banks (reeds, lily pads, a log)
    banks = 0
    seen = set()
    for c0 in sorted(water):
        if c0 in seen:
            continue
        comp, q = [], [c0]
        while q:
            c = q.pop()
            if c in seen or c not in water:
                continue
            seen.add(c)
            comp.append(c)
            q += [(c[0] + dx, c[1] + dy) for dx, dy in D4]
        bank = sorted({(x + dx, y + dy) for x, y in comp for dx, dy in D4
                       if m.inside(x + dx, y + dy) and lawnish(m, x + dx, y + dy, top=True) and (x + dx, y + dy) not in avoid},
                      key=lambda c: _hash(seed, 75, *c))
        for k in range(min(len(bank), 1 + len(comp) // 18, 3)):
            got = vignette(*bank[k * len(bank) // max(1, min(len(bank), 1 + len(comp) // 18, 3))], "water")
            placed += got
            banks += 1 if got else 0

    for _ in range(op.get("n", 400)):
        cand = candidates()
        if not cand:
            break
        cand.sort(key=lambda t: (-t[0], _hash(seed, 71, *t[1])))
        d, (ax, ay) = cand[0]
        ctx = "meadow"
        if water_d.get((ax, ay), 9) <= 3:
            ctx = "water"
        elif wall_d.get((ax, ay), 9) <= 2 and rng.random() < 0.7:
            ctx = "woods"
        elif town and struct_d.get((ax, ay), 9) <= 6 and rng.random() < 0.6:
            ctx = "town"
        elif d >= lim + 3 and rng.random() < 0.55:
            ctx = "grove"
        got = vignette(ax, ay, ctx)
        placed += got
        vignettes += 1 if got else 0
        tried.add((ax, ay))
    # sprinkle: single tufts, pebbles and the odd flower over the open lawn, like texture
    spr = 0
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if not m.inside(x, y) or not lawnish(m, x, y, top=True) or (x, y) in m.busy or (x, y) in avoid:
                continue
            if _hash(seed, 91, x, y) > op.get("sprinkle", 0.08):
                continue
            if any((x + dx, y + dy) in m.busy for dx, dy in D8):
                continue
            r = _hash(seed, 92, x, y)
            s = sw(m, "tuft") if r < 0.6 else sw(m, "pebbles") if r < 0.75 else \
                theme_flowers[int(r * 97) % len(theme_flowers)]
            if s in have and m.place_prop(s, x, y):
                spr += 1
    # lane edges: tufts and pebbles where the lawn meets a lane
    edge = 0
    floor = {(x, y) for y in range(m.H) for x in range(m.W) if m.is_floor(m.grid[y][x])}
    for y in range(m.H):
        for x in range(m.W):
            if not lawnish(m, x, y, top=True) or (x, y) in m.busy or (x, y) in m.reserved:
                continue
            if not any((x + dx, y + dy) in floor for dx, dy in D4):
                continue
            if _hash(seed, 81, x, y) > op.get("lane_edge", 0.14):
                continue
            if any((x + dx, y + dy) in m.busy for dx, dy in D8):
                continue
            s = sw(m, "tuft") if _hash(seed, 82, x, y) < 0.65 else sw(m, "pebbles")
            if s in have and m.place_prop(s, x, y):
                edge += 1
    m.notes.append(f"decorate: {vignettes} vignettes ({banks} at the water), {placed} pieces, {edge} lane-edge "
                   f"decals, {spr} sprinkled")


def _blocking_at(m, x, y):
    for s, px, py in m.props:
        if blocking(m, s):
            w, h = m.go.PROPS[s]["cells"]
            if py == y and px <= x < px + w:
                return True
    return False


# ---------------------------------------------------------------- plateau: raised ground with a face
def _plateau_shape(box, seed, amp, k=0):
    """Irregular plateau top inside `box`: a rounded rectangle whose edge is pushed in and out by
    noise (lobes and notches), smoothed, every cell in a 2x2, each column one unbroken run (so every
    column has exactly one south edge to hang the face from) and no 1-column steps in that edge."""
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1 + 1) / 2, (y0 + y1 + 1) / 2
    rx, ry = (x1 - x0 + 1) / 2, (y1 - y0 + 1) / 2
    allowed = {(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}
    cells = set()
    for x, y in allowed:
        u, v = abs(x + 0.5 - cx) / rx, abs(y + 0.5 - cy) / ry
        e = (u ** 2.8 + v ** 2.8) ** (1 / 2.8)
        if e < 1.0 - amp * (warped(x, y, 4.5, seed, 141 + k, 1.5) - 0.3):
            cells.add((x, y))
    cells = tidy(smooth(cells, allowed, 3), allowed)
    comps = components(cells)
    cells = comps[0] if comps else set()
    for _ in range(3):
        cols = {}
        for x, y in cells:
            cols.setdefault(x, []).append(y)
        bot = {x: max(ys) for x, ys in cols.items()}
        xs = sorted(bot)
        runs, cur = [], [xs[0]] if xs else []
        for x in xs[1:]:
            if bot[x] == bot[cur[-1]] and x == cur[-1] + 1:
                cur.append(x)
            else:
                runs.append(cur)
                cur = [x]
        if cur:
            runs.append(cur)
        for i, run in enumerate(runs):            # a step of the south edge narrower than 3 columns
            if len(run) >= 3 or len(runs) == 1:   # takes its wider neighbour's bottom
                continue
            nbs = [r for r in (runs[i - 1] if i else None, runs[i + 1] if i + 1 < len(runs) else None) if r]
            b = bot[max(nbs, key=len)[0]]
            for x in run:
                cells -= {(x, y) for y in range(b + 1, bot[x] + 1)}
                cells |= {(x, y) for y in range(bot[x], b + 1) if (x, y) in allowed}
                bot[x] = b
        cols = {}
        for x, y in cells:
            cols.setdefault(x, []).append(y)
        cells = {(x, y) for x, ys in cols.items() for y in range(min(ys), max(ys) + 1)}
        bot = {x: max(y for xx, y in cells if xx == x) for x in cols}
        for x in sorted(bot):                     # a lone column sticking out or in: level it
            l, r = bot.get(x - 1), bot.get(x + 1)
            if l is not None and r is not None and (bot[x] > max(l, r) or bot[x] < min(l, r)):
                b = min(l, r) if bot[x] < min(l, r) else max(l, r)
                cells -= {(x, y) for y in range(b + 1, bot[x] + 1)}
                cells |= {(x, y) for y in range(bot[x], b + 1) if (x, y) in allowed}
        cells = tidy(cells, allowed)
    return cells


def _faces(top, face):
    """Rock-face cells under every south edge of a top: `face` rows below each column's bottom."""
    out = set()
    for x, y in top:
        if (x, y + 1) not in top:
            out |= {(x, y + k) for k in range(1, face + 1)} - top
    return out


def _put_level(m, top, faces, t_top, t_face):
    for x, y in top:
        if m.inside(x, y):
            m.grid[y][x] = t_top
    for x, y in faces:
        if m.inside(x, y):
            m.grid[y][x] = t_face


def _stairs_col(m, top, face, want, foot_ok):
    """Best column for stairs cut through the face: the column's bottom and both neighbours' bottoms
    level (so the step lands on walkable top, not the rim), the cell above it inside the top, and a
    free foot below. Nearest to `want` (a list of preferred columns) or the middle of the south edge."""
    bot = {}
    for x, y in top:
        bot[x] = max(bot.get(x, y), y)
    good = []
    for x, b in bot.items():
        if any(bot.get(x + i) != b for i in (-1, 1)):
            continue
        flat = sum(bot.get(x + i) == b for i in (-2, 2))       # rather two level columns each side
        if not all((x + i, b - j) in top for i in (-1, 0, 1) for j in (1, 2)):
            continue
        if not foot_ok(x, b + face + 1):
            continue
        good.append((x, b, flat))
    if not good:
        return None
    if want:
        return min(good, key=lambda t: (-t[2], min(abs(t[0] - w) for w in want), -t[1]))[:2]
    xs = sorted(bot)
    mid = (xs[0] + xs[-1]) / 2
    return min(good, key=lambda t: (-t[2], -t[1], abs(t[0] - mid)))[:2]


def plateau(m, op):
    """A raised plateau with an organic outline. `box` bounds its top; the outline has lobes and
    notches (`lobes`, 0 = the plain box), the rock face (`face` rows, default 2) follows every south
    edge, so lobes show side walls and inner corners, and `stairs` (preferred columns, or automatic)
    are cut through the face. `levels: 2` stacks a smaller second level on the top with its own face
    and stairs. The top is the map's lawn: walkable (rim excepted) and decorated like the ground."""
    x0, y0, x1, y1 = op["box"]
    seed = seed_of(m, op) + x0 * 31 + y0 * 17
    top_t = m.res(op.get("t", "@cliff"))

    def piece(name, base):                    # <top>-face, <top>-2, <top>-face-2 of this rock, else the base piece
        return name if name in m.go.TERRAIN else base
    face_slug = op.get("face_t", piece(f"{top_t}-face", "cliff-face"))
    face = op.get("face", 2)
    stairs = m.res(op.get("stairs_t", "@stairs"))
    want = op.get("stairs", [])
    amp = op.get("lobes", 0.35) * max(0.25, min(1.0, (min(x1 - x0, y1 - y0) - 2) / 8))   # small tops stay simple
    if op.get("shape") == "rect" or amp <= 0:
        top = {(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}
    else:
        top = _plateau_shape((x0, y0, x1, y1), seed, amp)
    faces = _faces(top, face)
    _put_level(m, top, faces, top_t, face_slug)

    def foot_free(x, y):
        return m.inside(x, y) and (m.grid[y][x] is None or m.grid[y][x] in VARIANTS or m.is_floor(m.grid[y][x]))
    col = _stairs_col(m, top, face, want, foot_free)
    if col:
        for k in range(1, face + 1):
            m.put(stairs, col[0], col[1] + k)
    else:
        m.warns.append(f"plateau {op['box']}: no column for stairs (level south edge 3 wide needed)")
    tops = [top]
    if op.get("levels", 1) >= 2:
        t2 = op.get("t2", piece(f"{top_t}-2", "cliff-2"))
        f2 = op.get("face_t2", piece(f"{top_t}-face-2", "cliff-face-2"))
        inner = dist_field(m, [(x, y) for y in range(m.H) for x in range(m.W) if (x, y) not in top], 6)
        cand = {(x, y) for x, y in top if inner.get((x, y), 0) >= 3
                and inner.get((x, y + face + 1), 0) >= 2}
        bx = [x for x, _ in cand]
        top2 = set()
        if len(cand) >= 16:
            by = [y for _, y in cand]
            top2 = _plateau_shape((min(bx), min(by), max(bx), max(by)), seed + 7, amp * 0.8, 9) & cand
            top2 = tidy(top2)
        faces2 = _faces(top2, face)
        if len(top2) >= 12 and faces2 <= top:
            _put_level(m, top2, faces2, t2, f2)
            c2 = _stairs_col(m, top2, face, want, lambda x, y: (x, y) in top and inner.get((x, y), 0) >= 2)
            if c2:
                for k in range(1, face + 1):
                    m.put(stairs, c2[0], c2[1] + k)
            tops.append(top2)
        else:
            m.warns.append(f"plateau {op['box']}: too small for a second level")
    # tree-wall blocks the plateau cut in half would fall back to stray bushes: they join the top
    for _ in range(3):
        grown = False
        for y in range(m.H):
            for x in range(m.W):
                g = m.grid[y][x]
                if not g or m.go.TERRAIN[g]["kind"] != "quad":
                    continue
                bx, by = x - x % 2, y - y % 2
                if all(m.inside(bx + i, by + j) and m.grid[by + j][bx + i] == g for i in (0, 1) for j in (0, 1)):
                    continue
                if any((x + dx, y + dy) in top for dx, dy in D4):
                    m.grid[y][x] = top_t
                    top.add((x, y))
                    grown = True
        if not grown:
            break
    allc = top | faces
    m.plateaus.append((min(x for x, _ in allc), min(y for _, y in allc), max(x for x, _ in allc), max(y for _, y in allc)))
    if not hasattr(m, "plateau_tops"):
        m.plateau_tops = []
    m.plateau_tops += tops


# ---------------------------------------------------------------- water: ponds and creeks
def _lawn_free(m, x, y, struct):
    return m.inside(x, y) and (x, y) not in struct and (m.grid[y][x] is None or m.grid[y][x] in VARIANTS)


def banks(m, water, share, seed, t_bank="water-sandy", sand=None):
    """Sandy banks on stretches of a water body's edge: those edge cells switch to the sandy-edge
    piece and the lawn beside them to sand (sand joins water, so beach runs into the water)."""
    if share <= 0 or t_bank not in m.go.TERRAIN:
        return 0
    struct = {c for st in m.structs for c in st["foot"] | st["doors"]}
    reserved = keep_out(m, 0)
    edge = [c for c in water if any(_lawn_free(m, c[0] + dx, c[1] + dy, struct) for dx, dy in D4)]
    pick_ = {c for c in edge if noise(c[0], c[1], 4.5, seed, 171) > 1 - share}
    pick_ = {c for c in pick_ if sum((c[0] + dx, c[1] + dy) in pick_ for dx, dy in D8) >= 1}   # stretches, not dots
    ok = {(x + i, y + j) for x, y in pick_ for i in range(-3, 4) for j in range(-3, 4)}
    ok = {c for c in ok if _lawn_free(m, *c, struct) and c not in reserved and c not in water}
    land = {c for c in ok if any((c[0] + dx, c[1] + dy) in pick_ for dx, dy in D4)}
    land |= {c for c in ok if any((c[0] + dx, c[1] + dy) in land for dx, dy in D4)
             and noise(c[0], c[1], 3, seed, 173) > 0.4}           # a second row in places
    if sand and sand in m.go.TERRAIN:
        land = tidy(smooth(land, ok, 1) | land, ok, 4)         # strips of beach, at least 2x2 everywhere
        for x, y in land:
            m.grid[y][x] = sand
        pick_ |= {c for c in edge if any((c[0] + dx, c[1] + dy) in land for dx, dy in D4)}
    for x, y in pick_:
        m.grid[y][x] = t_bank
    return len(pick_)


def pond(m, op):
    """An organic pond: a few overlapping circles around `center` (radii `r`), pushed by noise,
    smoothed and tidied so the autotile outline reads round (no 1-cell spurs or notches). Only lawn
    is flooded (never a lane, structure or wall). `bank` (0-1, default 0.35) turns stretches of the
    edge into sandy beach."""
    t = m.res(op.get("t", kit(m).get("pond", {}).get("t", "@water")))
    seed = seed_of(m, op) + int(op["center"][0] * 13 + op["center"][1] * 7)
    cx, cy = op["center"]
    rx, ry = op["r"]
    rng = __import__("random").Random(seed)
    circles = [(cx, cy, rx * 0.85, ry * 0.85)]
    n = op.get("lobes", 4)
    for i in range(n):
        a = (i + rng.uniform(-0.3, 0.3)) * 2 * math.pi / n
        f = rng.uniform(0.5, 0.75)
        circles.append((cx + math.cos(a) * rx * f, cy + math.sin(a) * ry * f,
                        rx * rng.uniform(0.38, 0.6), ry * rng.uniform(0.38, 0.6)))
    struct = {c for st in m.structs for c in st["foot"] | st["doors"]}
    allowed = {(x, y) for y in range(int(cy - ry - 2), int(cy + ry + 3)) for x in range(int(cx - rx - 2), int(cx + rx + 3))
               if m.inside(x, y) and (op.get("over", False) or _lawn_free(m, x, y, struct))}
    cells = set()
    for x, y in allowed:
        v = max(1 - math.hypot((x + 0.5 - a) / ra, (y + 0.5 - b) / rb) for a, b, ra, rb in circles)
        if v > op.get("rough", 0.45) * (warped(x, y, 3.5, seed, 151, 1.5) - 0.5):
            cells.add((x, y))
    cells = tidy(smooth(cells, allowed, 2), allowed)
    comps = components(cells)
    cells = comps[0] if comps else set()
    for x, y in cells:
        m.grid[y][x] = t
    pk = kit(m).get("pond", {})
    nb = banks(m, cells, op.get("bank", pk.get("bank", 0.35)), seed, sand=op.get("bank_sand", pk.get("bank_sand")))
    m.notes.append(f"pond at {op['center']}: {len(cells)} cells, {nb} sandy bank cells")


def _spline(pts, step=0.08):
    """Catmull-Rom curve through the points, sampled about every `step` cells: (x, y, s) with s the
    distance along it."""
    P = [pts[0]] + [tuple(p) for p in pts] + [pts[-1]]
    out, s = [], 0.0
    prev = None
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        L = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
        n = max(2, int(L / step))
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                       + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                       + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            if prev:
                s += math.hypot(x - prev[0], y - prev[1])
            out.append((x, y, s))
            prev = (x, y)
    out.append((pts[-1][0], pts[-1][1], s + (math.hypot(pts[-1][0] - prev[0], pts[-1][1] - prev[1]) if prev else 0)))
    return out


def stream(m, op):
    """A meandering creek of `t` (default @water) along `points` (any direction, halves allowed): a
    smooth curve through them that swings sideways in soft bends (`wobble` cells, default 1.4) and
    breathes between `wmin` and `wmax` cells wide (default 1.2-3; `width` is the mean, default 2).
    It floods lawn and lanes, never walls or structures, and is tidied so the autotile reads round.
    Where it crosses a lane it becomes a bridge (bridge across a north-south stream, bridge-v across
    an east-west one), `bridge_width` lane cells wide (default 1: Gen 3 bridges are narrow), with the
    creek kept 2 wide under it. `bank` (default 0.2) turns stretches of its edge into sandy beach."""
    t = m.res(op.get("t", kit(m).get("pond", {}).get("t", "@water")))
    seed = seed_of(m, op)
    mean = op.get("width", 2)
    wmin, wmax = op.get("wmin", 1.0), op.get("wmax", 3.2)
    wob = op.get("wobble", 1.4)
    pts = op["points"]
    curve = _spline(pts)
    struct = {c for st in m.structs for c in st["foot"] | st["doors"]}
    floor = {(x, y) for y in range(m.H) for x in range(m.W) if m.is_floor(m.grid[y][x])}
    near_floor = dist_field(m, list(floor), 3) if floor else {}
    cells, vert = {}, {}
    total = curve[-1][2] or 1
    for i, (x, y, sd) in enumerate(curve):
        a, b = curve[max(0, i - 3)], curve[min(len(curve) - 1, i + 3)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        L = math.hypot(tx, ty) or 1
        nx, ny = -ty / L, tx / L
        fade = min(1.0, sd / 3, (total - sd) / 3)            # ends stay on their points
        off = wob * fade * (0.75 * math.sin(sd * 0.42 + seed) + 0.25 * math.sin(sd * 0.17 + seed * 2.3))
        px, py = x + nx * off, y + ny * off
        w = mean + (noise(sd, 0.5, 6, seed, 161) - 0.5) * 3.2 * max(mean - wmin, wmax - mean)
        if near_floor.get((int(px), int(py)), 9) <= 2:
            w = 2.0                                          # an even, 2-wide creek under the bridge
        r = max(wmin, min(wmax, w)) / 2
        for j in range(int(py - r) - 1, int(py + r) + 2):
            for k in range(int(px - r) - 1, int(px + r) + 2):
                if (k + 0.5 - px) ** 2 + (j + 0.5 - py) ** 2 <= (r + 0.12) ** 2:
                    cells[(k, j)] = abs(ty) >= abs(tx)
        c = (int(math.floor(px)), int(math.floor(py)))      # the centre line itself: never broken
        cells.setdefault(c, abs(ty) >= abs(tx))

    def floodable(c):
        return m.inside(*c) and c not in struct and not is_wall(m, m.grid[c[1]][c[0]]) \
            and m.go.group_of(m.grid[c[1]][c[0]] or "") != "cliff"
    allowed = {c for c in set(cells) | {(x + dx, y + dy) for x, y in cells for dx, dy in D8} if floodable(c)}
    shape = {c for c in cells if c in allowed}
    # 4-connect diagonal steps, fill 1-cell notches, drop spurs
    for x, y in list(shape):
        for dx, dy in ((1, 1), (1, -1)):
            if (x + dx, y + dy) in shape and (x + dx, y) not in shape and (x, y + dy) not in shape:
                add = (x + dx, y) if (x + dx, y) in allowed else (x, y + dy)
                if add in allowed:
                    shape.add(add)
                    cells.setdefault(add, cells.get((x, y), True))
    shape = tidy(shape, allowed, holes=True) | {c for c in shape if c in floor}
    for c in shape:
        if c not in cells:
            cells[c] = True
    crossings = {}
    water = set()
    for (x, y) in shape:
        if m.is_floor(m.grid[y][x]):
            crossings[(x, y)] = cells[(x, y)]
            continue
        m.grid[y][x] = t
        water.add((x, y))
    # bridges: in each crossing keep the middle `bridge_width` lane rows (columns) as a bridge, the
    # other lane cells over the stream become water, so the deck reads as a narrow Gen 3 bridge
    bw = op.get("bridge_width", 1)
    for comp in components(set(crossings)):
        vertical = sum(crossings[c] for c in comp) * 2 >= len(comp)
        lines = sorted({c[1] if vertical else c[0] for c in comp})
        lo = max(0, (len(lines) - bw) // 2)
        keep = set(lines[lo:lo + bw])
        for (x, y) in comp:
            on = (y if vertical else x) in keep
            m.grid[y][x] = op.get("bridge", "bridge" if vertical else "bridge-v") if on else t
            if not on:
                water.add((x, y))
    pk = kit(m).get("pond", {})
    banks(m, water, op.get("bank", min(0.2, pk.get("bank", 0.2))), seed + 3, sand=op.get("bank_sand", pk.get("bank_sand")))
