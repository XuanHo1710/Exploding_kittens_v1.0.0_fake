"""Render multi-floor cave designs as readable floor-plan schematics, and check them.

A design tool, not the map engine: it reads the variants in cave_variants.py, carves each
floor on the Mons cell grid, checks the layout the way a player walks it (ladders, holes,
ledges, Strength boulders and switches, Rock Smash, Surf; for D-I also lava fills, ice
slides, both tides, minecarts, lever gates, Cut vines) and draws every floor side by side
with a 40 x 22 camera-screen grid, numbered ladder pairs, a legend and the main path.

    python3 tools/maps/cave_mock.py                      # all variants + overview into tmp/cave-mocks/
    python3 tools/maps/cave_mock.py --variant b --cell 10
    python3 tools/maps/cave_mock.py --report             # print the numbers only, no images

Research behind the variants: docs/explanation/research/gen3-caves.md.
"""
import argparse
import math
import os
import random
import sys
from collections import deque

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from cave_variants import VARIANTS  # noqa: E402

VIEW = (40, 22)            # Mons camera in cells (decisions.md §10)
WALK_TPS = 3.75            # Gen 3 walk: 16 frames per metatile at 60 fps
ENC_RATE = 10              # Emerald cave encounterRate (wild_encounters.json)
STEPS_PER_ENC = 2880 / (ENC_RATE * 16) + 4   # WildEncounterCheck + 4 immune steps
EXPLORE = 1.6              # steps actually walked / shortest path (side branches, backtracking)
WILD_S, TRAINER_S = 30, 75

# cell codes
WALL, FLOOR, WATER, CRACK, LEDGE, STAIRS, SMASH, BARRIER = "#", ".", "~", "c", "L", "=", "K", "R"
# mechanics of the regional caves (D-I)
LAVA, ICE, CRYSTAL, TIDE, SUNK, SHELF, RAIL, GATE, VINE = "l", "i", "x", "t", "u", "h", "r", "g", "v"
SOLID = (WALL, CRYSTAL)                      # rock to the walker and to the pocket count
DIRS = {"E": (1, 0), "W": (-1, 0), "S": (0, 1), "N": (0, -1)}   # walk order = the original A-C order

C = dict(bg=(24, 22, 28), rock=(46, 40, 38), rim=(92, 80, 70), floor=(204, 186, 156), floor_dark=(118, 108, 98),
         water=(78, 134, 204), crack=(222, 196, 140), crackline=(120, 92, 60), ledge=(214, 120, 40),
         stairs=(168, 150, 128), grid=(255, 255, 255), text=(236, 232, 224), sub=(170, 164, 156),
         path=(255, 236, 90), panel=(36, 33, 40), item=(214, 44, 44), boulder=(132, 92, 58), switch=(250, 210, 40),
         barrier=(150, 40, 40), smash=(150, 150, 156), trainer=(50, 110, 230), npc=(60, 170, 90),
         legend=(190, 90, 230), fossil=(250, 244, 220), enter=(60, 210, 110), exit=(60, 210, 110),
         lava=(232, 84, 28), lavaglow=(255, 200, 60), fill=(120, 70, 50), ice=(196, 236, 250), iceline=(255, 255, 255),
         crystal=(120, 220, 240), tide=(214, 200, 150), tidewave=(78, 134, 204), sunk=(70, 110, 120),
         shelf=(120, 136, 150), rail=(96, 66, 44), tie=(170, 130, 90), cart=(230, 150, 60), gate=(250, 220, 40),
         lever=(250, 220, 40), lamp=(255, 230, 150), vine=(60, 150, 60), vent=(255, 120, 60), ore=(210, 180, 255),
         mirror=(170, 250, 255), flower=(255, 140, 190))
PAIR = [(255, 99, 72), (72, 200, 255), (255, 200, 40), (170, 120, 255), (90, 230, 120), (255, 120, 200),
        (60, 230, 220), (255, 160, 60), (200, 255, 90), (150, 170, 255)]


def font(size, bold=False):
    for name in (("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"), "NotoSans-Regular.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


# ---------------------------------------------------------------------------------- carving
class Floor:
    def __init__(self, spec, seed):
        self.spec = spec
        self.name, self.level, self.w, self.h = spec["name"], spec["level"], spec["w"], spec["h"]
        self.dark = spec.get("dark", False)
        self.g = [[WALL] * self.w for _ in range(self.h)]
        self.barrier = {}          # (x, y) -> switch id
        self.ledge_dir = {}
        self.gate = {}             # (x, y) -> (lever bit, open when the lever is 0 or 1)
        self.rails = []            # [(start, end, cells)] one-way minecart rides
        self.rng = random.Random(seed)
        for op in spec["ops"]:
            getattr(self, "op_" + op[0])(*op[1:])
        self.roughen()
        self.feat = spec["features"]

    def inside(self, x, y):
        return 1 <= x < self.w - 1 and 1 <= y < self.h - 1

    def put(self, x, y, v, edge=False):
        if (edge and 0 <= x < self.w and 0 <= y < self.h) or self.inside(x, y):
            self.g[y][x] = v

    def ellipse(self, cx, cy, rx, ry, v, wobble=True):
        k, ph = self.rng.randint(3, 6), self.rng.uniform(0, 6.28)
        for y in range(int(cy - ry * 1.2) - 1, int(cy + ry * 1.2) + 2):
            for x in range(int(cx - rx * 1.2) - 1, int(cx + rx * 1.2) + 2):
                dx, dy = (x - cx) / rx, (y - cy) / ry
                f = 1 + (0.1 * math.sin(k * math.atan2(dy, dx) + ph) if wobble else 0)
                if dx * dx + dy * dy <= f * f:
                    self.put(x, y, v)

    def op_blob(self, cx, cy, rx, ry):
        self.ellipse(cx, cy, rx, ry, FLOOR)

    def op_pillar(self, cx, cy, rx, ry):
        self.ellipse(cx, cy, rx, ry, WALL, wobble=False)

    def op_water(self, cx, cy, rx, ry):
        self.ellipse(cx, cy, rx, ry, WATER)

    def op_crack(self, x, y, w, h):
        for j in range(h):
            for i in range(w):
                if self.g[y + j][x + i] == FLOOR:
                    self.g[y + j][x + i] = CRACK

    def op_room(self, x, y, w, h):
        for j in range(h):
            for i in range(w):
                if min(i, w - 1 - i) + min(j, h - 1 - j) >= 1:
                    self.put(x + i, y + j, FLOOR)

    def op_tunnel(self, pts, width):
        lo = -(width // 2)
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            n = max(abs(x1 - x0), abs(y1 - y0), 1)
            for s in range(n + 1):
                x, y = round(x0 + (x1 - x0) * s / n), round(y0 + (y1 - y0) * s / n)
                for dy in range(lo, lo + width):
                    for dx in range(lo, lo + width):
                        edge = x + dx in (0, self.w - 1) or y + dy in (0, self.h - 1)
                        if 0 <= x + dx < self.w and 0 <= y + dy < self.h and self.g[y + dy][x + dx] == WALL:
                            self.put(x + dx, y + dy, FLOOR, edge=edge)       # a tunnel never undoes water, rocks

    def op_ledge(self, x0, x1, y):
        for x in range(x0, x1 + 1):
            if self.g[y][x] == FLOOR:
                self.g[y][x] = LEDGE
                self.ledge_dir[(x, y)] = (0, 1)

    def op_stairs(self, x, y, w, h):
        for j in range(h):
            for i in range(w):
                if self.g[y + j][x + i] == FLOOR:
                    self.g[y + j][x + i] = STAIRS

    def op_smash(self, x, y, w, h):
        for j in range(h):
            for i in range(w):
                self.g[y + j][x + i] = SMASH

    def op_barrier(self, x, y, w, h, sid):
        for j in range(h):
            for i in range(w):
                if self.g[y + j][x + i] != WALL:
                    self.g[y + j][x + i] = BARRIER
                    self.barrier[(x + i, y + j)] = sid

    def paint(self, x, y, w, h, v, over=(FLOOR,)):
        for j in range(h):
            for i in range(w):
                if self.inside(x + i, y + j) and self.g[y + j][x + i] in over:
                    self.g[y + j][x + i] = v

    def op_lava(self, cx, cy, rx, ry):
        self.ellipse(cx, cy, rx, ry, LAVA)

    def op_lavaflow(self, pts, width):
        """A lava river along a polyline; it only flows over carved floor (a crossing is one cell deep)."""
        lo = -(width // 2)
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            n = max(abs(x1 - x0), abs(y1 - y0), 1)
            for s in range(n + 1):
                x, y = round(x0 + (x1 - x0) * s / n), round(y0 + (y1 - y0) * s / n)
                for dy in range(lo, lo + width):
                    for dx in range(lo, lo + width):
                        if self.inside(x + dx, y + dy) and self.g[y + dy][x + dx] == FLOOR:
                            self.g[y + dy][x + dx] = LAVA

    def op_ice(self, x, y, w, h):
        self.paint(x, y, w, h, ICE)

    def op_crystal(self, *cells):
        for x, y in cells:
            self.g[y][x] = CRYSTAL

    def op_tide(self, x, y, w, h):
        self.paint(x, y, w, h, TIDE, over=(FLOOR, WATER))

    def op_sunk(self, x, y, w, h):
        self.paint(x, y, w, h, SUNK)

    def op_shelf(self, x, y, w, h):
        self.paint(x, y, w, h, SHELF, over=(FLOOR, WALL))

    def op_vine(self, x, y, w, h):
        self.paint(x, y, w, h, VINE, over=(FLOOR, WALL))

    def op_gate(self, x, y, w, h, bit, open_when):
        for j in range(h):
            for i in range(w):
                if self.g[y + j][x + i] not in SOLID:
                    self.g[y + j][x + i] = GATE
                    self.gate[(x + i, y + j)] = (bit, open_when)

    def op_jump(self, x, y, w, h, d):
        for j in range(h):
            for i in range(w):
                if self.g[y + j][x + i] == FLOOR:
                    self.g[y + j][x + i] = LEDGE
                    self.ledge_dir[(x + i, y + j)] = DIRS[d]

    def op_rail(self, pts):
        """One-way minecart: board at the first point, ride the track, get off at the last point."""
        cells = []
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            n = max(abs(x1 - x0), abs(y1 - y0), 1)
            for s in range(n + 1):
                c = (round(x0 + (x1 - x0) * s / n), round(y0 + (y1 - y0) * s / n))
                if not cells or cells[-1] != c:
                    cells.append(c)
        for x, y in cells[1:-1]:
            self.g[y][x] = RAIL
        for x, y in (cells[0], cells[-1]):
            self.g[y][x] = FLOOR
        self.rails.append((cells[0], cells[-1], cells))

    def labels(self):
        lab, n = {}, 0
        for y in range(self.h):
            for x in range(self.w):
                if self.g[y][x] not in SOLID + (RAIL,) and (x, y) not in lab:
                    q = [(x, y)]
                    lab[(x, y)] = n
                    while q:
                        a, b = q.pop()
                        for c, d in ((a + 1, b), (a - 1, b), (a, b + 1), (a, b - 1)):
                            if 0 <= c < self.w and 0 <= d < self.h and self.g[d][c] not in SOLID + (RAIL,) \
                                    and (c, d) not in lab:
                                lab[(c, d)] = n
                                q.append((c, d))
                    n += 1
        return lab

    def roughen(self):
        """Nibble the rock rim so chambers read as caves; never joins two pockets (wall stays >= 3)."""
        for p in (0.3, 0.2):
            lab = self.labels()
            add = []
            for y in range(2, self.h - 2):
                for x in range(2, self.w - 2):
                    if self.g[y][x] != WALL:
                        continue
                    near = [self.g[y + dy][x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
                    if FLOOR not in near or any(v not in (FLOOR, WALL) for v in near):
                        continue
                    seen = {lab[(x + dx, y + dy)] for dy in range(-3, 4) for dx in range(-3, 4)
                            if (x + dx, y + dy) in lab}
                    if len(seen) == 1 and self.rng.random() < p:
                        add.append((x, y))
            for x, y in add:
                self.g[y][x] = FLOOR

    def passable(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h and self.g[y][x] not in SOLID


# ---------------------------------------------------------------------------------- checking
IDF = ("ladder", "hole", "boulder", "switch", "fill", "lever")   # features written (kind, id, x, y, ...)
FREE = ("lamp", "deco")                                         # decoration, may sit on rock


def fxy(ft):
    return (ft[2], ft[3]) if ft[0] in IDF else (ft[1], ft[2])


class Cave:
    def __init__(self, key):
        v = VARIANTS[key]
        self.key, self.v = key, v
        self.floors = [Floor(f, seed=sum(map(ord, key + f["name"]))) for f in v["floors"]]
        self.by = {f.name: f for f in self.floors}
        self.errors, self.warnings = [], []
        self.ladders = {}            # (floor, x, y) -> (floor, x, y)
        self.holes = {}              # (floor, x, y) -> (floor, x, y)
        self.rides = {}              # (floor, x, y) -> (floor, x, y): minecart start -> end
        self.fills = {}              # floor -> {(x, y): boulder id}: lava a boulder fills
        self.levers = {}             # (floor, x, y) -> bit
        lad = {}
        for f in self.floors:
            for a, b, _ in f.rails:
                self.rides[(f.name,) + a] = (f.name,) + b
            for ft in f.feat:
                if ft[0] == "ladder":
                    lad.setdefault(ft[1], []).append((f.name, ft[2], ft[3]))
                if ft[0] == "fill":
                    self.fills.setdefault(f.name, {})[(ft[2], ft[3])] = ft[1]
                if ft[0] == "lever":
                    self.levers[(f.name, ft[2], ft[3])] = ft[1]
                if ft[0] == "hole":
                    below = self.below(f)
                    if below is None:
                        self.errors.append(f"{f.name}: hole {ft[1]} has no floor below")
                    else:
                        self.holes[(f.name, ft[2], ft[3])] = (below.name, ft[2], ft[3])
        for lid, ends in lad.items():
            if len(ends) != 2:
                self.errors.append(f"ladder {lid}: {len(ends)} ends (need 2)")
                continue
            a, b = ends
            self.ladders[a], self.ladders[b] = b, a
        codes = {v for f in self.floors for row in f.g for v in row}
        self.tides = ["low", "high"] if codes & {TIDE, SUNK, SHELF} else [None]
        self.check_cells()
        self.check_boulders()

    def below(self, f):
        lower = [g for g in self.floors if g.level == f.level - 1]
        return lower[0] if lower else None

    def feats(self, kind):
        return [(f, ft) for f in self.floors for ft in f.feat if ft[0] == kind]

    def check_cells(self):
        for f in self.floors:
            for ft in f.feat:
                if ft[0] in FREE:
                    continue
                x, y = fxy(ft)
                if ft[0] == "fill":
                    if f.g[y][x] != LAVA:
                        self.errors.append(f"{f.name}: fill {ft[1]} at ({x},{y}) is not on lava")
                elif not f.passable(x, y) or f.g[y][x] in (LAVA, RAIL):
                    self.errors.append(f"{f.name}: {ft[0]} at ({x},{y}) sits in rock")
        for (fn, x, y), (gn, tx, ty) in self.holes.items():
            if not self.by[gn].passable(tx, ty):
                self.errors.append(f"{fn}: hole at ({x},{y}) lands in rock on {gn}")
        for f in self.floors:
            cr = [(x, y) for y in range(f.h) for x in range(f.w) if f.g[y][x] == CRACK]
            if not cr:
                continue
            b = self.below(f)
            bad = [c for c in cr if not (b and b.g[c[1]][c[0]] in (FLOOR, CRACK))]
            if bad:
                self.errors.append(f"{f.name}: {len(bad)} cracked cells land in rock below")

    def check_boulders(self):
        sw = {ft[1]: (f, ft) for f, ft in self.feats("switch")}
        holes = {ft[1]: (f, ft) for f, ft in self.feats("hole")}
        for f, ft in self.feats("boulder"):
            bid, bx, by = ft[1], ft[2], ft[3]
            # the target on this floor: the switch or lava fill with this id, or else a hole on the same line
            tgt = None
            fill = [c for c, i in self.fills.get(f.name, {}).items() if i == bid]
            if bid in sw and sw[bid][0] is f:
                tgt = (sw[bid][1][2], sw[bid][1][3])
            elif fill:
                tgt = fill[0]
            else:
                for hf, h in holes.values():
                    if hf is f and (h[2] == bx or h[3] == by):
                        tgt = (h[2], h[3])
                        lands = self.holes[(f.name, h[2], h[3])]
                        hit = [s for s in sw.values() if s[0].name == lands[0] and (s[1][2], s[1][3]) == lands[1:]]
                        if not hit:
                            self.errors.append(f"{f.name}: boulder {bid} drops onto no switch")
            if not tgt or (tgt[0] != bx and tgt[1] != by):
                self.errors.append(f"{f.name}: boulder {bid} is not in line with its target")
                continue
            sx, sy = (tgt[0] > bx) - (tgt[0] < bx), (tgt[1] > by) - (tgt[1] < by)
            x, y = bx + sx, by + sy
            while (x, y) != tgt:
                if f.g[y][x] not in (FLOOR, STAIRS):
                    self.errors.append(f"{f.name}: boulder {bid} lane blocked at ({x},{y})")
                    break
                x, y = x + sx, y + sy
            if f.g[by - sy][bx - sx] not in (FLOOR, STAIRS):
                self.errors.append(f"{f.name}: nowhere to stand behind boulder {bid}")

    # walk the cave: state = (floor, x, y, lever bits)
    def walk(self, start, solved=True, surf=True, smash=True, crack=False, cut=True, tide=None, levers=True):
        if len(start) == 3:
            start = start + (0,)
        prev = {start: None}
        q = deque([start])
        blocked = set() if solved else {(f.name, ft[2], ft[3]) for f, ft in self.feats("boulder")}
        while q:
            s = q.popleft()
            fn, x, y, m = s
            f = self.by[fn]
            fills = self.fills.get(fn, {}) if solved else {}
            nxt = []

            def cell(cx, cy):
                v = f.g[cy][cx]
                if v == TIDE:
                    return WATER if tide == "high" else FLOOR
                if v == SUNK:
                    return WALL if tide == "high" else FLOOR
                if v == LAVA and (cx, cy) in fills:
                    return FLOOR
                return v

            def enter(cx, cy, here):
                """Can the player step from `here` onto (cx, cy)? Returns the cell code or None."""
                if not f.passable(cx, cy) or (fn, cx, cy) in blocked:
                    return None
                v = cell(cx, cy)
                if v in (WALL, LAVA, RAIL):
                    return None
                if v == WATER and not surf or v == SMASH and not smash or v == CRACK and not crack:
                    return None
                if v == VINE and not cut or v == BARRIER and not solved:
                    return None
                if v == GATE:
                    bit, ow = f.gate[(cx, cy)]
                    if (m >> bit & 1) != ow:
                        return None
                if v == SHELF and here not in (WATER, SHELF):
                    return None
                return v

            same = prev[s] is not None and prev[s][0] == fn
            if s[:3] in self.ladders and same:
                nxt.append(self.ladders[s[:3]] + (m,))
            elif s[:3] in self.holes and same:
                nxt.append(self.holes[s[:3]] + (m,))
            elif s[:3] in self.rides and same:
                nxt.append(self.rides[s[:3]] + (m,))
            else:
                if levers and s[:3] in self.levers:
                    nxt.append((fn, x, y, m ^ (1 << self.levers[s[:3]])))
                here = cell(x, y)
                for dx, dy in DIRS.values():
                    cx, cy = x + dx, y + dy
                    v = enter(cx, cy, here)
                    if v is None:
                        continue
                    if v == LEDGE:
                        if (dx, dy) != f.ledge_dir[(cx, cy)] or enter(cx + dx, cy + dy, v) is None:
                            continue
                        cx, cy = cx + dx, cy + dy
                    elif v == ICE:                       # slide until something stops you
                        while True:
                            w = enter(cx + dx, cy + dy, ICE)
                            if w is None or w in (LEDGE, SHELF):
                                break
                            cx, cy = cx + dx, cy + dy
                            if w != ICE:
                                break
                    nxt.append((fn, cx, cy, m))
            for n in nxt:
                if n not in prev:
                    prev[n] = s
                    q.append(n)
        return prev

    def ends(self):
        st = [(f.name, ft[1], ft[2]) for f, ft in self.feats("entrance")]
        ex = [(f.name, ft[1], ft[2]) for f, ft in self.feats("exit")]
        if self.v.get("goal") == "legend" or not ex:
            ex = [(f.name, ft[1], ft[2]) for f, ft in self.feats("legend")]
        return st[0], ex[0]

    @staticmethod
    def cells(prev):
        return {s[:3] for s in prev}

    def analyse(self):
        start, goal = self.ends()
        r = dict(path=[], gated=None)
        per = {t: self.cells(self.walk(start, crack=True, tide=t)) for t in self.tides}
        full = set().union(*per.values())
        legs = [start] + [tuple(w) for w in self.v.get("route", [])] + [goal]
        a = start + (0,)
        for b in legs[1:]:
            prev = self.walk(a, tide=self.tides[0])
            hit = next((s for s in prev if s[:3] == b), None)
            if hit is None:
                self.errors.append(f"{b} unreachable from {a[:3]}")
                break
            p, s = [], hit
            while s:
                p.append(s)
                s = prev[s]
            r["path"] += p[::-1][1 if r["path"] else 0:]
            a = hit
        for t in self.tides[1:]:
            if goal not in self.cells(self.walk(start, tide=t)):
                self.errors.append(f"goal unreachable at {t} tide")
        if self.feats("switch") or self.fills or self.levers:
            r["gated"] = all(goal not in self.cells(self.walk(start, solved=False, levers=False, tide=t))
                             for t in self.tides)
            if not r["gated"]:
                self.warnings.append("the puzzle does not gate the goal")
        bare = set().union(*(self.cells(self.walk(start, surf=False, smash=False, cut=False, tide=t))
                             for t in self.tides))
        r["tide_only"] = {}
        for f in self.floors:
            for ft in f.feat:
                if ft[0] in ("item", "hidden", "fossil", "npc", "trainer", "legend"):
                    key = (f.name, ft[1], ft[2])
                    if key not in full:
                        self.errors.append(f"{f.name}: {ft[0]} at {key[1:]} unreachable")
                    elif key not in bare and ft[0] in ("item", "hidden"):
                        r["hm"] = r.get("hm", 0) + 1
                    if len(self.tides) > 1 and key in full and ft[0] in ("item", "hidden"):
                        only = [t for t in self.tides if key in per[t]]
                        if len(only) == 1:
                            r["tide_only"][only[0]] = r["tide_only"].get(only[0], 0) + 1
        r["pockets"] = {f.name: len({v for v in f.labels().values()}) for f in self.floors}
        r["reach"] = full
        # how the main path moves: slides on ice, minecart rides, lever pulls
        r["slides"] = r["rides"] = r["pulls"] = 0
        steps = 0
        for p, q in zip(r["path"], r["path"][1:]):
            d = abs(p[1] - q[1]) + abs(p[2] - q[2])
            if p[3] != q[3]:
                r["pulls"] += 1
            elif p[0] == q[0] and p[:3] in self.rides and self.rides[p[:3]] == q[:3]:
                r["rides"] += 1
                steps += 2
                continue
            elif p[0] == q[0] and d > 2:
                r["slides"] += 1
            steps += max(1, d) if p[0] == q[0] else 1
        r["steps"] = steps
        return r

    def report(self, r):
        lines = [self.v["title"]]
        tot = dict(cells=0, items=0, trainers=0)
        for f in self.floors:
            walk = sum(v not in SOLID for row in f.g for v in row)
            cnt = {k: sum(1 for ft in f.feat if ft[0] == k) for k in ("ladder", "hole", "item", "hidden", "trainer")}
            lines.append(f"  {f.name:4} {f.w}x{f.h} cells = {f.w * f.h / (VIEW[0] * VIEW[1]):.1f} screens, "
                         f"walkable {walk / (f.w * f.h):.0%}, pockets {r['pockets'][f.name]}, ladders {cnt['ladder']}, "
                         f"holes {cnt['hole']}, items {cnt['item']}+{cnt['hidden']} hidden, trainers {cnt['trainer']}"
                         + (", dark" if f.dark else ""))
            tot["cells"] += f.w * f.h
            tot["items"] += cnt["item"] + cnt["hidden"]
            tot["trainers"] += cnt["trainer"]
        steps = r["steps"]
        walked = steps * EXPLORE
        enc = walked / STEPS_PER_ENC
        mins = (walked / WALK_TPS + enc * WILD_S + tot["trainers"] * TRAINER_S) / 60
        # ladder alignment between same-size floors
        off = []
        for a, b in self.ladders.items():
            if a < b:
                off.append(abs(a[1] - b[1]) + abs(a[2] - b[2]))
        lines.append(f"  main path {steps} steps, ~{walked:.0f} walked, ~{enc:.0f} wild battles, "
                     f"{tot['trainers']} trainers, {tot['items']} items -> ~{mins:.0f} min")
        lines.append(f"  ladder pairs {len(off)} (max offset {max(off) if off else 0}), holes {len(self.holes)}, "
                     f"puzzle gates goal: {r['gated']}, items behind Surf/Rock Smash/Cut: {r.get('hm', 0)}")
        extra = [f"{k} {r[k]}" for k in ("slides", "rides", "pulls") if r[k]]
        extra += [f"items only at {t} tide: {n}" for t, n in sorted(r["tide_only"].items())]
        if extra:
            lines.append("  main path uses: " + ", ".join(extra))
        for e in self.errors:
            lines.append("  ERROR " + e)
        for w in self.warnings:
            lines.append("  warning " + w)
        r["minutes"] = mins
        return "\n".join(lines)


# ---------------------------------------------------------------------------------- drawing
def draw_variant(cave, r, cell):
    pad, head, gap = 24, 74, 28
    tf, sf, lf = font(22, True), font(13), font(max(9, cell + 1), True)
    widths = [f.w * cell for f in cave.floors]
    hmax = max(f.h * cell for f in cave.floors)
    W = pad * 2 + sum(widths) + gap * (len(widths) - 1) + 220
    legend_h = 36 + 19 * math.ceil(len(legend_items(cave)) / 4)
    H = head + 40 + hmax + legend_h + pad
    img = Image.new("RGB", (max(W, 1200), H), C["bg"])
    d = ImageDraw.Draw(img, "RGBA")
    d.text((pad, 14), cave.v["title"], font=tf, fill=C["text"])
    d.text((pad, 44), cave.v["concept"], font=sf, fill=C["sub"])
    pair_col = {}
    lid = {}
    for f in cave.floors:
        for ft in f.feat:
            if ft[0] in ("ladder", "hole"):
                key = (ft[0], ft[1])
                lid.setdefault(key, len(lid))
    for k, i in lid.items():
        pair_col[k] = PAIR[i % len(PAIR)]
    path_by = {}
    for s in r["path"]:
        path_by.setdefault(s[0], []).append(s)
    ox = pad
    for f in cave.floors:
        oy = head + 40
        walk = sum(v != WALL for row in f.g for v in row)
        cap = (f"{f.name}  ·  {f.w}×{f.h} ô  ·  {f.w * f.h / (VIEW[0] * VIEW[1]):.1f} màn hình  ·  "
               f"đi được {walk / (f.w * f.h):.0%}" + ("  ·  TỐI (Flash)" if f.dark else ""))
        if f is not cave.floors[-1] and d.textlength(cap, font=font(14, True)) > f.w * cell + gap - 6:
            cap = f"{f.name} · {f.w}×{f.h} ô" + (" · TỐI" if f.dark else "")     # a narrow floor
        d.text((ox, head + 12), cap, font=font(14, True), fill=C["text"])
        draw_floor(d, f, ox, oy, cell, cave, pair_col, path_by.get(f.name, []), lf)
        ox += f.w * cell + gap
    draw_legend(d, pad, head + 40 + hmax + 18, cell, cave)
    return img


def draw_floor(d, f, ox, oy, cell, cave, pair_col, path, lf):
    def box(x, y, inset=0):
        x0, y0 = ox + x * cell, oy + y * cell
        return [x0 + inset, y0 + inset, x0 + cell - 1 - inset, y0 + cell - 1 - inset]

    flo = C["floor_dark"] if f.dark else C["floor"]
    for y in range(f.h):
        for x in range(f.w):
            v = f.g[y][x]
            if v == WALL:
                rim = any(f.passable(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
                d.rectangle(box(x, y), fill=C["rim"] if rim else C["rock"])
                continue
            d.rectangle(box(x, y), fill=flo)
            if v in (LAVA, ICE, CRYSTAL, TIDE, SUNK, SHELF, RAIL, GATE, VINE):
                draw_cell(d, f, v, x, y, box, cell, cave)
                continue
            if v == WATER:
                d.rectangle(box(x, y), fill=C["water"])
            elif v == CRACK:
                d.rectangle(box(x, y), fill=C["crack"])
                d.line([ox + x * cell + 1, oy + y * cell + cell - 2, ox + x * cell + cell - 2, oy + y * cell + 1],
                       fill=C["crackline"], width=1)
            elif v == LEDGE:
                ledge(d, box(x, y), f.ledge_dir[(x, y)])
            elif v == STAIRS:
                for k in range(1, cell, 3):
                    d.line([ox + x * cell, oy + y * cell + k, ox + (x + 1) * cell - 1, oy + y * cell + k],
                           fill=C["stairs"])
            elif v == SMASH:
                d.ellipse(box(x, y, 1), fill=C["smash"], outline=(60, 60, 66))
                d.line([ox + x * cell + 2, oy + y * cell + 2, ox + x * cell + cell - 3, oy + y * cell + cell - 3],
                       fill=(60, 60, 66))
            elif v == BARRIER:
                d.rectangle(box(x, y), fill=C["barrier"])
                d.line(box(x, y, 1), fill=(255, 220, 200), width=1)
                b = box(x, y, 1)
                d.line([b[0], b[3], b[2], b[1]], fill=(255, 220, 200), width=1)
    if f.dark:
        d.rectangle([ox, oy, ox + f.w * cell - 1, oy + f.h * cell - 1], fill=(10, 10, 30, 60))
    for ft in f.feat:
        if ft[0] == "lamp":                          # generator light: a lit circle on a dark floor
            cx, cy, rr = ox + ft[1] * cell + cell // 2, oy + ft[2] * cell + cell // 2, ft[3] * cell
            d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=C["lamp"] + (46,), outline=C["lamp"] + (120,))
    seen = set()
    for (x, y), (bit, ow) in sorted(f.gate.items()):  # one tag per gate: its lever and its state at the start
        if (bit, ow, x) not in seen:
            seen.add((bit, ow, x))
            label(d, ox + x * cell + cell + 1, oy + y * cell - cell - 4, f"G{bit} " + ("mở" if ow == 0 else "đóng"),
                  C["gate"], lf)
    for a, b, cells in f.rails:                      # minecart track, one way: cart at the start, arrow at the end
        pts = [(ox + x * cell + cell // 2, oy + y * cell + cell // 2) for x, y in cells]
        d.line(pts, fill=C["rail"], width=max(3, cell // 2))
        for px, py in pts[1:-1:2]:
            d.rectangle([px - 1, py - 1, px + 1, py + 1], fill=C["tie"])
        d.line(pts, fill=C["tie"], width=1)
        (sx, sy), (ex, ey) = pts[0], pts[-1]
        d.rounded_rectangle([sx - cell + 1, sy - cell // 2 - 1, sx + cell - 1, sy + cell // 2 + 1], 2,
                            fill=C["cart"], outline=(40, 20, 10))
        px, py = pts[-2]
        ang = math.atan2(ey - py, ex - px)
        tip = [(ex + math.cos(ang) * cell, ey + math.sin(ang) * cell),
               (ex + math.cos(ang + 2.4) * cell, ey + math.sin(ang + 2.4) * cell),
               (ex + math.cos(ang - 2.4) * cell, ey + math.sin(ang - 2.4) * cell)]
        d.polygon(tip, fill=C["cart"], outline=(40, 20, 10))
    # camera screens
    for gx in range(0, f.w + 1, VIEW[0]):
        dashed(d, ox + gx * cell, oy, ox + gx * cell, oy + f.h * cell, (255, 255, 255, 110))
    for gy in range(0, f.h + 1, VIEW[1]):
        dashed(d, ox, oy + gy * cell, ox + f.w * cell, oy + gy * cell, (255, 255, 255, 110))
    d.rectangle([ox - 1, oy - 1, ox + f.w * cell, oy + f.h * cell], outline=(255, 255, 255, 160))
    # main path
    pts = [(ox + s[1] * cell + cell // 2, oy + s[2] * cell + cell // 2) for s in path]
    seg = []
    for i, p in enumerate(pts):
        jump = abs(p[0] - seg[-1][0]) > cell or abs(p[1] - seg[-1][1]) > cell if seg else False
        slide = jump and on_ice(f, path[i - 1], path[i])
        if seg and jump and not slide:
            d.line(seg, fill=C["path"] + (200,), width=2)
            seg = []
        seg.append(p)
    if len(seg) > 1:
        d.line(seg, fill=C["path"] + (200,), width=2)
    # features
    r = cell
    for ft in f.feat:
        k = ft[0]
        x, y = fxy(ft)
        cx, cy = ox + x * cell + cell // 2, oy + y * cell + cell // 2
        if k == "ladder":
            other = cave.ladders.get((f.name, x, y))
            up = other and cave.by[other[0]].level > f.level
            col = pair_col[("ladder", ft[1])]
            tri = [(cx, cy - r), (cx - r, cy + r - 1), (cx + r, cy + r - 1)] if up else \
                [(cx, cy + r), (cx - r, cy - r + 1), (cx + r, cy - r + 1)]
            d.polygon(tri, fill=col, outline=(20, 20, 20))
            label(d, cx + r + 1, cy - r - 2, str(ft[1]), col, lf)
        elif k == "hole":
            col = pair_col[("hole", ft[1])]
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(0, 0, 0), outline=col, width=2)
            label(d, cx + r + 1, cy - r - 2, f"H{ft[1]}", col, lf)
        elif k == "boulder":
            d.ellipse([cx - r + 1, cy - r + 1, cx + r - 1, cy + r - 1], fill=C["boulder"], outline=(40, 24, 10),
                      width=2)
        elif k == "switch":
            d.rectangle([cx - r + 2, cy - r + 2, cx + r - 2, cy + r - 2], outline=C["switch"], width=2)
            label(d, cx + r, cy - r - 2, f"S{ft[1]}", C["switch"], lf)
        elif k == "fill":
            d.ellipse([cx - r + 2, cy - r + 2, cx + r - 2, cy + r - 2], outline=C["boulder"], width=2)
            label(d, cx + r, cy - r - 2, f"F{ft[1]}", C["lavaglow"], lf)
        elif k == "lever":
            d.rectangle([cx - r + 1, cy - r + 1, cx + r - 1, cy + r - 1], fill=(40, 40, 50), outline=C["lever"],
                        width=2)
            d.line([cx, cy + r - 2, cx + r - 2, cy - r + 1], fill=C["lever"], width=2)
            label(d, cx + r + 1, cy - r - 2, f"L{ft[1]}", C["lever"], lf)
        elif k == "lamp":
            star(d, cx, cy, r, C["lamp"])
        elif k == "deco":
            deco(d, cx, cy, r, ft[3])
        elif k == "item":
            d.ellipse([cx - r // 2 - 1, cy - r // 2 - 1, cx + r // 2 + 1, cy + r // 2 + 1], fill=C["item"],
                      outline=(255, 255, 255))
        elif k == "hidden":
            d.ellipse([cx - r // 2, cy - r // 2, cx + r // 2, cy + r // 2], outline=C["item"], width=1)
        elif k == "fossil":
            star(d, cx, cy, r, C["fossil"])
        elif k == "trainer":
            fx, fy = {"N": (0, -1), "S": (0, 1), "E": (1, 0), "W": (-1, 0)}[ft[3]]
            ex, ey = cx + fx * ft[4] * cell, cy + fy * ft[4] * cell
            d.line([cx, cy, ex, ey], fill=C["trainer"] + (170,), width=max(2, cell // 3))
            d.ellipse([cx - r + 1, cy - r + 1, cx + r - 1, cy + r - 1], fill=C["trainer"], outline=(255, 255, 255))
        elif k == "npc":
            d.ellipse([cx - r + 1, cy - r + 1, cx + r - 1, cy + r - 1], fill=C["npc"], outline=(255, 255, 255))
            label(d, cx + r + 1, cy - r // 2, ft[3], C["npc"], lf)
        elif k == "legend":
            star(d, cx, cy, r * 2, C["legend"])
            label(d, cx + 2 * r + 2, cy - r // 2, ft[3], C["legend"], lf)
        elif k in ("entrance", "exit"):
            col = C["enter"]
            d.rectangle([cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1], fill=col, outline=(255, 255, 255), width=2)
            txt = ("VÀO" if k == "entrance" else "RA") + f" · {ft[3]}"
            tw = d.textlength(txt, font=lf)
            tx = min(max(cx - tw / 2, ox), ox + f.w * cell - tw)
            ty = cy - 3 * r - 6 if y > f.h // 2 else cy + 2 * r + 2
            label(d, tx, ty, txt, col, lf)
    # where the cracked floor of the floor above drops you
    for up in cave.floors:
        if cave.below(up) is f:
            for y in range(up.h):
                for x in range(up.w):
                    if up.g[y][x] == CRACK:
                        cx, cy = ox + x * cell + cell // 2, oy + y * cell + cell // 2
                        d.point([(cx, cy), (cx + 1, cy), (cx, cy + 1), (cx + 1, cy + 1)], fill=C["crack"])
    # hole landings from the floor above
    for (fn, x, y), (gn, tx, ty) in cave.holes.items():
        if gn != f.name:
            continue
        hid = next(ft[1] for ft in cave.by[fn].feat if ft[0] == "hole" and (ft[2], ft[3]) == (x, y))
        col = pair_col[("hole", hid)]
        cx, cy = ox + tx * cell + cell // 2, oy + ty * cell + cell // 2
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=col, width=2)
        d.line([cx - r + 2, cy - r + 2, cx + r - 2, cy + r - 2], fill=col, width=2)
        d.line([cx - r + 2, cy + r - 2, cx + r - 2, cy - r + 2], fill=col, width=2)
        label(d, cx + r + 1, cy + 1, f"↓H{hid}", col, lf)


def on_ice(f, a, b):
    """True when a -> b is one straight slide over ice (drawn as a line, not a jump)."""
    (x0, y0), (x1, y1) = a[1:3], b[1:3]
    if x0 != x1 and y0 != y1:
        return False
    n = abs(x1 - x0) + abs(y1 - y0)
    sx, sy = (x1 > x0) - (x1 < x0), (y1 > y0) - (y1 < y0)
    return all(f.g[y0 + sy * k][x0 + sx * k] == ICE for k in range(1, n))


def ledge(d, b, dr):
    """A one-way ledge cell: the lip on the far side, an arrow the way you jump."""
    x0, y0, x1, y1 = b
    dx, dy = dr
    if dr == (0, 1):                                 # the original south ledge of A-C
        cell, c = x1 - x0 + 1, x0 + (x1 - x0 + 1) // 2
        d.rectangle([x0, y0 + cell - 3, x1, y1], fill=C["ledge"])
        d.polygon([(c - 2, y0 + 2), (c + 2, y0 + 2), (c, y0 + cell - 4)], fill=C["ledge"])
        return
    lip = {(0, 1): [x0, y1 - 2, x1, y1], (0, -1): [x0, y0, x1, y0 + 2],
           (1, 0): [x1 - 2, y0, x1, y1], (-1, 0): [x0, y0, x0 + 2, y1]}[(dx, dy)]
    d.rectangle(lip, fill=C["ledge"])
    cx, cy, h = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 - 1
    tip = (cx + dx * h, cy + dy * h)
    d.polygon([tip, (cx - dx * h + dy * 2, cy - dy * h + dx * 2), (cx - dx * h - dy * 2, cy - dy * h - dx * 2)],
              fill=C["ledge"])


def draw_cell(d, f, v, x, y, box, cell, cave):
    b = box(x, y)
    if v == LAVA:
        lit = (x, y) in cave.fills.get(f.name, {})
        d.rectangle(b, fill=C["lava"])
        if (x + 2 * y) % 3 == 0 or lit:
            d.line([b[0] + 1, b[1] + cell // 2, b[2] - 1, b[1] + cell // 2 - 1], fill=C["lavaglow"])
    elif v == ICE:
        d.rectangle(b, fill=C["ice"])
        if (x + y) % 4 == 0:
            d.line([b[0] + 1, b[3] - 1, b[2] - 1, b[1] + 1], fill=C["iceline"])
    elif v == CRYSTAL:
        d.rectangle(b, fill=C["ice"] if any(f.g[y + j][x + i] == ICE for i, j in DIRS.values()
                                            if f.inside(x + i, y + j)) else C["rock"])
        cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        h = cell / 2
        d.polygon([(cx, cy - h), (cx + h * 0.7, cy), (cx, cy + h), (cx - h * 0.7, cy)], fill=C["crystal"],
                  outline=(30, 80, 110))
    elif v == TIDE:                                  # sand at low tide, water at high tide
        d.rectangle(b, fill=C["tide"])
        d.line([b[0], b[1] + cell // 3, b[2], b[1] + cell // 3], fill=C["tidewave"])
        d.line([b[0], b[1] + 2 * cell // 3, b[2], b[1] + 2 * cell // 3], fill=C["tidewave"])
    elif v == SUNK:                                  # low-tide passage, flooded to the roof at high tide
        d.rectangle(b, fill=C["sunk"])
        d.line([b[0], b[1], b[2], b[3]], fill=C["tidewave"])
    elif v == SHELF:                                 # rock shelf: only a Surfer at high tide reaches it
        d.rectangle(b, fill=C["shelf"])
        d.rectangle([b[0], b[3] - 1, b[2], b[3]], fill=(70, 80, 92))
    elif v == RAIL:
        d.rectangle(b, fill=C["rock"])
    elif v == GATE:
        bit, ow = f.gate[(x, y)]
        if ow == 0:                                  # open at the start: drawn as an outline
            d.rectangle(b, outline=C["gate"], width=1)
        else:
            d.rectangle(b, fill=(60, 52, 20))
            for k in range(b[0] - cell, b[2], 3):
                d.line([max(k, b[0]), b[3] - max(0, b[0] - k), min(k + cell, b[2]), b[3] - min(cell, b[2] - k)],
                       fill=C["gate"])
    elif v == VINE:
        d.rectangle(b, fill=C["vine"])
        d.arc([b[0] + 1, b[1] + 1, b[2] - 1, b[3] - 1], 200, 520, fill=(170, 230, 120))


def deco(d, cx, cy, r, kind):
    if kind == "vent":                               # heat vent: puffs on a timer
        for k in (0, 1, 2):
            d.arc([cx - r + k * 2, cy - r - k * 3, cx + r - k * 2, cy + r - k * 3], 200, 340, fill=C["vent"], width=2)
        d.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=C["vent"])
    elif kind == "ore":
        for i, (a, b) in enumerate(((-3, -2), (2, -3), (0, 2))):
            d.polygon([(cx + a, cy + b - 3), (cx + a + 3, cy + b), (cx + a, cy + b + 3), (cx + a - 3, cy + b)],
                      fill=C["ore"], outline=(90, 60, 140))
    elif kind == "mirror":
        d.polygon([(cx, cy - r - 2), (cx + r, cy), (cx, cy + r + 2), (cx - r, cy)], fill=C["mirror"],
                  outline=(255, 255, 255))
    elif kind == "flower":
        for a in range(5):
            t = a * 2 * math.pi / 5
            d.ellipse([cx + math.cos(t) * 3 - 2, cy + math.sin(t) * 3 - 2, cx + math.cos(t) * 3 + 2,
                       cy + math.sin(t) * 3 + 2], fill=C["flower"])
        d.ellipse([cx - 1, cy - 1, cx + 1, cy + 1], fill=(255, 230, 90))


def dashed(d, x0, y0, x1, y1, col, on=6, off=5):
    n = int(max(abs(x1 - x0), abs(y1 - y0)))
    for s in range(0, n, on + off):
        a, b = s / max(n, 1), min(s + on, n) / max(n, 1)
        d.line([x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b], fill=col, width=1)


def label(d, x, y, txt, col, f):
    d.text((x, y), txt, font=f, fill=col, stroke_width=2, stroke_fill=(15, 12, 18))


def star(d, cx, cy, r, col):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=col, outline=(20, 20, 20))


EXTRA = [  # (cell code or feature kind, legend key, text): shown only when a variant uses it
    (LAVA, "lava", "Dung nham: không đi được"), ("fill", "fill", "Đẩy đá vào ô F: lấp dung nham thành lối"),
    ("vent", "vent", "Lỗ phun nhiệt (phun theo nhịp)"), (ICE, "ice", "Băng: trượt tới khi gặp vật cản"),
    (CRYSTAL, "crystal", "Tinh thể: chặn đường trượt"), ("mirror", "mirror", "Tinh thể gương (trang trí, phản sáng)"),
    (TIDE, "tide", "Bãi triều: cát lúc thấp, nước (Surf) lúc cao"),
    (SUNK, "sunk", "Hầm ngầm: chỉ mở khi triều thấp"),
    (SHELF, "shelf", "Thềm đá: Surf lên khi triều cao"),
    (RAIL, "rail", "Ray xe goòng: lên xe ở đầu, đi một chiều"), ("ore", "ore", "Mạch quặng (đồ ẩn)"),
    (GATE, "gate", "Cổng điện G: đặc đóng, viền mở (lúc đầu)"),
    ("lever", "lever", "Cần gạt L: đảo mọi cổng cùng số"), ("lamp", "lamp", "Đèn máy phát (vùng sáng)"),
    (VINE, "vine", "Dây leo: Cut để mở"), ("flower", "flower", "Hoa / vườn ngầm"),
    ("jump4", "jump4", "Gờ một chiều mọi hướng (mũi tên = hướng nhảy)"),
]


def legend_items(cave):
    items = [
        ("rock", "Vách đá"), ("floor", "Sàn hang (gặp Pokémon mọi ô)"), ("water", "Nước (Surf)"),
        ("crack", "Sàn nứt: đi chậm là rơi xuống tầng dưới"), ("ledge", "Gờ nhảy một chiều (xuống)"),
        ("stairs", "Bậc đá (đổi độ cao)"), ("up", "Thang lên ▲ (cùng số = cùng cặp)"),
        ("down", "Thang xuống ▼"), ("hole", "Hố H: rơi xuống đúng ô (x, y) tầng dưới"),
        ("land", "Chỗ đáp của hố; chấm = vùng rơi sàn nứt"), ("boulder", "Tảng đá Strength"), ("switch", "Công tắc S"),
        ("barrier", "Rào đá: mở khi công tắc được ấn"), ("smash", "Đá Rock Smash"), ("item", "Vật phẩm"),
        ("hidden", "Vật phẩm ẩn"), ("trainer", "Trainer + tầm nhìn"), ("npc", "NPC"),
        ("enter", "Lối vào / lối ra"), ("path", "Đường chính ngắn nhất"), ("grid", "Lưới màn hình 40×22"),
        ("dark", "Tầng tối (cần Flash)"),
    ]
    codes = {v for f in cave.floors for row in f.g for v in row}
    kinds = {ft[0] for f in cave.floors for ft in f.feat} | {ft[3] for f in cave.floors for ft in f.feat
                                                             if ft[0] == "deco"}
    if any(dr != (0, 1) for f in cave.floors for dr in f.ledge_dir.values()):
        kinds.add("jump4")
    return items + [(k, t) for c, k, t in EXTRA if c in codes or c in kinds]


def draw_legend(d, x, y, cell, cave):
    f, s = font(13), max(cell, 8)
    items = legend_items(cave)
    d.rounded_rectangle([x - 8, y - 8, x + 1180, y + 19 * math.ceil(len(items) / 4) + 4], 8, fill=C["panel"])
    for i, (k, t) in enumerate(items):
        px, py = x + (i % 4) * 296, y + (i // 4) * 19
        b = [px, py + 2, px + s, py + 2 + s]
        legend_glyph(d, k, b, px, py, s)
        d.text((px + s + 8, py), t, font=f, fill=C["text"])


def legend_glyph(d, k, b, px, py, s):
    cx, cy = px + s // 2, py + 2 + s // 2
    if k in ("lava", "ice", "tide", "sunk", "shelf", "vine"):
        d.rectangle(b, fill=C[k])
    elif k == "fill":
        d.rectangle(b, fill=C["lava"])
        d.ellipse([b[0] + 1, b[1] + 1, b[2] - 1, b[3] - 1], outline=C["boulder"], width=2)
    elif k in ("vent", "ore", "mirror", "flower"):
        deco(d, cx, cy, s // 2, k)
    elif k == "crystal":
        d.polygon([(cx, b[1]), (b[2], cy), (cx, b[3]), (b[0], cy)], fill=C["crystal"])
    elif k == "rail":
        d.line([b[0], cy, b[2], cy], fill=C["rail"], width=4)
        d.line([b[0], cy, b[2], cy], fill=C["tie"], width=1)
    elif k == "gate":
        d.rectangle(b, fill=(60, 52, 20), outline=C["gate"])
    elif k == "lever":
        d.rectangle(b, outline=C["lever"], width=2)
        d.line([cx, b[3], b[2], b[1]], fill=C["lever"], width=2)
    elif k == "lamp":
        d.ellipse([b[0] - 2, b[1] - 2, b[2] + 2, b[3] + 2], fill=C["lamp"] + (90,))
    elif k == "jump4":
        ledge(d, b, (1, 0))
    else:
        legend_base(d, k, b, px, py, s)


def legend_base(d, k, b, px, py, s):
    cx, cy = px + s // 2, py + 2 + s // 2
    if k in ("rock", "floor", "water", "crack", "stairs", "barrier"):
        d.rectangle(b, fill=C[k] if k != "rock" else C["rim"])
    elif k == "ledge":
        d.rectangle([px, py + s - 1, px + s, py + s + 2], fill=C["ledge"])
    elif k in ("up", "down"):
        tri = [(cx, py + 2), (px, py + 2 + s), (px + s, py + 2 + s)] if k == "up" else \
            [(cx, py + 2 + s), (px, py + 2), (px + s, py + 2)]
        d.polygon(tri, fill=PAIR[0])
    elif k == "hole":
        d.ellipse(b, fill=(0, 0, 0), outline=PAIR[1], width=2)
    elif k == "land":
        d.ellipse(b, outline=PAIR[1], width=2)
        d.line(b, fill=PAIR[1], width=2)
    elif k == "boulder":
        d.ellipse(b, fill=C["boulder"])
    elif k == "switch":
        d.rectangle(b, outline=C["switch"], width=2)
    elif k == "smash":
        d.ellipse(b, fill=C["smash"])
    elif k == "item":
        d.ellipse(b, fill=C["item"], outline=(255, 255, 255))
    elif k == "hidden":
        d.ellipse(b, outline=C["item"])
    elif k in ("trainer", "npc", "enter"):
        d.ellipse(b, fill=C[k])
    elif k == "path":
        d.line([px, cy, px + s, cy], fill=C["path"], width=2)
    elif k == "grid":
        dashed(d, px, cy, px + s + 4, cy, (255, 255, 255, 160), 3, 2)
    elif k == "dark":
        d.rectangle(b, fill=C["floor_dark"])


def overview(imgs, out):
    w = max(i.width for i in imgs)
    sc = 0.5
    ims = [i.resize((int(i.width * sc), int(i.height * sc)), Image.LANCZOS) for i in imgs]
    H = sum(i.height for i in ims) + 20 * (len(ims) + 1)
    o = Image.new("RGB", (int(w * sc) + 40, H), C["bg"])
    y = 20
    for i in ims:
        o.paste(i, (20, y))
        y += i.height + 20
    o.save(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--variant", choices=sorted(VARIANTS), action="append", help="variant key (default: all)")
    ap.add_argument("--cell", type=int, default=8, help="pixels per cell (default 8)")
    ap.add_argument("--out", default=os.path.join(REPO, "tmp", "cave-mocks"),
                    help="output folder (default tmp/cave-mocks)")
    ap.add_argument("--report", action="store_true", help="print the numbers only, write no images")
    a = ap.parse_args()
    keys = a.variant or sorted(VARIANTS)
    os.makedirs(a.out, exist_ok=True)
    imgs, bad = [], 0
    for k in keys:
        cave = Cave(k)
        r = cave.analyse()
        print(cave.report(r))
        bad += len(cave.errors)
        if a.report:
            continue
        img = draw_variant(cave, r, a.cell)
        p = os.path.join(a.out, f"variant-{k}.png")
        img.save(p)
        imgs.append(img)
        print("  ->", os.path.relpath(p, REPO))
    if imgs and len(keys) > 1:
        p = os.path.join(a.out, "overview.png")
        overview(imgs, p)
        print("->", os.path.relpath(p, REPO))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
