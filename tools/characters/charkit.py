#!/usr/bin/env python3
"""
charkit: paper-doll engine for Mons overworld Characters, drawn the Gen 3 way.

Gen 3 sprites are hand-shaded pixel art in palette indices; recolouring = swapping the palette.
charkit does the same (decisions.md §9, facts: docs/explanation/research/gen3-overworld-characters.md):

  - every layer is a 16-column ASCII block whose characters are ROLE + SHADE, already hand-shaded:
        skin    1 light  2 mid  3 shadow  4 outline       (the 4 shared skin shades)
        hair    i light  h mid  H dark                    (3-shade ramps, dark = outline)
        top     v        t      T
        bottom  q        p      P      (hips, trousers, skirt)
        leg     x        l      L      (lower legs: trousers or bare skin)
        shoe    g        f      F
        hat     z        y      Y
        accent  k        j      J      (ribbons, bands, ties, trims)
        extra   o        m      M      (apron, coat, bag, prop)
        e = eye (black)   K = black   W = white   . = keep what is below   _ = erase
  - a Character maps each ROLE to a ramp: one of the slots A / B / C of its NPC palette, or its own
    ramps (Player, Gym Leaders), or "skin" (bare legs / arms: light, mid, dark -> skin 2, 3, 4).
  - layers stack in order (body, garments, head, hair, hat, accessories); later ones cover earlier.
  - frames: rows down, left, right (= left mirrored), up; columns stand, step A, stand, step B.
    Step frames sink everything 1 px (feet on row 30 standing, 31 stepping). A down/up stepB that is
    not drawn is stepA mirrored.

Layer = {dir: (y0, rows)} or {dir: {pose: (y0, rows)}}, dir in down / left / up.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
STRUCT = os.path.join(HERE, "..", "gen3")  # tools/gen3: shared Gen 3 pass
sys.path.insert(0, STRUCT)

from PIL import Image  # noqa: E402

import gen3  # noqa: E402

W, H = 16, 32
DIRS = ("down", "left", "right", "up")
COLS = ("stand", "stepA", "stand", "stepB")
SCALE = 2
BLACK, WHITE = (0, 0, 0), (255, 255, 255)

# Gen 3 NPC skin (light, mid, shadow, outline); the outline doubles as the generic warm dark line.
SKIN = [(255, 214, 181), (255, 197, 148), (222, 148, 115), (123, 66, 66)]

ROLES = {"hair": "ihH", "top": "vtT", "bottom": "qpP", "leg": "xlL", "shoe": "gfF",
         "hat": "zyY", "accent": "kjJ", "extra": "omM"}
DECODE = {ch: (role, i) for role, chars in ROLES.items() for i, ch in enumerate(chars)}
DECODE.update({str(i + 1): ("skin", i) for i in range(4)})
FIXED = {"e": BLACK, "K": BLACK, "W": WHITE}


def tri(r5, pick=(1, 2, 4)):
    """3-shade ramp (light, mid, dark) from a 5-tone gym ramp."""
    return [r5[i] for i in pick]


# The 4 shared NPC palettes (Gen 3 layout: transparent, 4 skin, ramps A/B/C of 3 shades, white, black).
# Every ramp comes from a gym sheet (MONS_PALETTE=gym).
NPC_PALETTES = {
    "npc1": {   # blue / brown / khaki
        "A": tri([(120, 200, 255), (70, 160, 240), (40, 120, 210), (30, 84, 170), (24, 56, 120)]),        # water SEA
        "B": tri([(206, 156, 104), (172, 120, 78), (138, 92, 62), (100, 64, 52), (70, 46, 44)], (1, 3, 4)),  # ground TIMBER
        "C": tri([(248, 222, 176), (232, 198, 148), (210, 170, 122), (170, 128, 100), (122, 88, 80)], (0, 2, 4)),  # ground SAND
    },
    "npc2": {   # red / navy / stone
        "A": tri([(246, 110, 88), (222, 64, 62), (186, 40, 54), (136, 26, 52), (92, 18, 46)], (0, 1, 3)),  # fire CRIM
        "B": tri([(104, 118, 172), (80, 94, 150), (62, 74, 128), (46, 54, 102), (32, 36, 76)], (1, 3, 4)),  # electric NAVY
        "C": tri([(234, 226, 222), (222, 212, 206), (186, 174, 174), (146, 134, 142), (106, 96, 112)], (0, 2, 4)),  # gym STONE
    },
    "npc3": {   # green / gold / timber
        "A": tri([(178, 230, 116), (118, 200, 90), (72, 162, 74), (46, 122, 66), (30, 84, 58)], (1, 2, 4)),  # grass LEAF
        "B": tri([(255, 236, 156), (238, 198, 102), (202, 152, 72), (152, 106, 62), (102, 70, 56)], (0, 2, 4)),  # psychic GOLD
        "C": tri([(226, 176, 116), (192, 138, 86), (154, 102, 66), (112, 72, 54), (76, 48, 44)], (1, 2, 4)),  # grass TIMBER
    },
    "npc4": {   # pink / plum / smoke
        "A": tri([(255, 196, 178), (250, 146, 134), (222, 98, 112), (172, 64, 98), (118, 44, 82)], (1, 2, 4)),  # water CORAL
        "B": tri([(240, 156, 218), (212, 108, 194), (172, 72, 168), (126, 50, 138), (84, 34, 102)], (1, 2, 4)),  # psychic PLUM
        "C": tri([(222, 214, 220), (190, 182, 196), (156, 148, 168), (122, 114, 140), (92, 86, 112)], (0, 2, 4)),  # fire SMOKE
    },
}


def T(y0, block):
    """A mask block: y0 = native row of the first line; every line must be exactly 16 columns."""
    rows = block.strip("\n").split("\n")
    for r in rows:
        if len(r) != W:
            raise ValueError(f"mask line is {len(r)} wide, not {W}: {r!r}")
    return (y0, rows)


def mirror(block):
    y0, rows = block
    return (y0, [r[::-1] for r in rows])


def pick(layer, d, pose):
    if layer is None:
        return None
    v = layer.get(d)
    if v is None:
        return None
    if isinstance(v, tuple):
        return v
    if pose in v:
        return v[pose]
    if pose == "stepB" and "stepA" in v:
        return mirror(v["stepA"]) if d in ("down", "up") else v["stepA"]
    return v.get("stand")


def compose(layers, d, pose, fh=H):
    """Stack the layers for one frame -> grid[y][x] = shade char or None (dir 'right' = 'left' mirrored)."""
    src = "left" if d == "right" else d
    bob = 1 if pose.startswith("step") else 0
    grid = [[None] * W for _ in range(fh)]
    for layer in layers:
        blk = pick(layer, src, pose)
        if blk is None:
            continue
        y0, rows = blk
        for j, row in enumerate(rows):
            y = y0 + j + bob
            if not 0 <= y < fh:
                continue
            for x, ch in enumerate(row):
                if ch == ".":
                    continue
                grid[y][x] = None if ch == "_" else ch
    if d == "right":
        grid = [row[::-1] for row in grid]
    return grid


def resolve(roles, ramps=None, palette=None):
    """roles: {role: 'A'|'B'|'C'|'skin'|[3 colours]} -> {role: [3 or 4 colours]}."""
    out = {"skin": SKIN}
    for role, v in roles.items():
        if v == "skin":
            out[role] = SKIN[1:]
        elif isinstance(v, str):
            out[role] = (ramps or NPC_PALETTES[palette])[v]
        else:
            out[role] = list(v)
    return out


def paint(grid, colours):
    fh = len(grid)
    img = Image.new("RGBA", (W, fh), (0, 0, 0, 0))
    px = img.load()
    for y in range(fh):
        for x in range(W):
            ch = grid[y][x]
            if ch is None:
                continue
            if ch in FIXED:
                px[x, y] = FIXED[ch] + (255,)
                continue
            if ch not in DECODE:
                raise KeyError(f"unknown mask character {ch!r}")
            role, i = DECODE[ch]
            if role not in colours:
                raise KeyError(f"role '{role}' (char {ch!r}) has no colour")
            px[x, y] = colours[role][i] + (255,)
    return img


def colours_of(img):
    return sorted({p[:3] for p in img.getdata() if p[3] == 255})


DARKS = set("4HTPLFYJM")


def black_silhouette(grid):
    """Player look (pret Brendan / May / Red / Leaf): every dark pixel on the silhouette edge turns black."""
    fh = len(grid)
    out = [row[:] for row in grid]
    for y in range(fh):
        for x in range(W):
            if grid[y][x] in DARKS:
                nb = [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)]
                if any(not (0 <= a < W and 0 <= b < fh) or grid[b][a] is None for a, b in nb):
                    out[y][x] = "K"
    return out


class Character:
    def __init__(self, slug, group, layers, roles, palette="own", child=False, ramps=None, black_outline=False,
                 info=None):
        self.slug, self.group, self.layers, self.palette, self.child = slug, group, layers, palette, child
        self.black_outline = black_outline
        self.info = dict(info or {})   # extra JSON fields (Player picker: name, gender, order)
        self.colours = resolve(roles, ramps, palette if palette in NPC_PALETTES else None)

    @property
    def fh(self):
        return 16 if self.child else H

    def sheet(self, layers=None):
        layers = layers or self.layers
        out = Image.new("RGBA", (W * len(COLS), self.fh * len(DIRS)), (0, 0, 0, 0))
        for r, d in enumerate(DIRS):
            for c, pose in enumerate(COLS):
                g = compose(layers, d, pose, self.fh)
                if self.black_outline:
                    g = black_silhouette(g)
                out.paste(paint(g, self.colours), (c * W, r * self.fh))
        return self.validate(gen3.to_gen3(out))

    def validate(self, img):
        n = len(colours_of(img))
        if n > 15:
            raise ValueError(f"{self.slug}: {n} colours > 15 (one 4bpp palette)")
        if self.palette in NPC_PALETTES:
            allowed = {c for r in NPC_PALETTES[self.palette].values() for c in r} | set(SKIN) | {BLACK, WHITE}
            allowed = {gen3.snap(c) for c in allowed}
            extra = [c for c in colours_of(img) if c not in allowed]
            if extra:
                raise ValueError(f"{self.slug}: colours outside palette {self.palette}: {extra}")
        return img


def up(img, k=SCALE):
    return img.resize((img.width * k, img.height * k), Image.NEAREST)


PRET_ORDER = [  # pret 9-frame strip index -> (dir, pose)
    ("down", "stand"), ("up", "stand"), ("left", "stand"),
    ("down", "stepA"), ("down", "stepB"), ("up", "stepA"), ("up", "stepB"),
    ("left", "stepA"), ("left", "stepB"),
]


def grid_cell(d, pose):
    return [DIRS.index(d), {"stand": 0, "stepA": 1, "stepB": 3}[pose]]


def meta(ch, kind, img):
    k = SCALE
    m = {
        "character": ch.slug, "group": ch.group, "sheet": kind,
        "frame": {"w": W * k, "h": ch.fh * k, "native_w": W, "native_h": ch.fh, "scale": k},
        "grid": {"rows": list(DIRS), "cols": list(COLS),
                 "note": "right = left mirrored (baked into the sheet); the stand column repeats at 0 and 2"},
        "anchor": "frame bottom-centre on the bottom-centre of the Character's tile; a 16x32 frame's upper half "
                  "overlaps the tile above",
        "pret_frames": [grid_cell(d, p) for d, p in PRET_ORDER],
        "palette": ch.palette, "colours": [list(c) for c in colours_of(img)],
        "fps": 60,
    }
    m.update(getattr(ch, "info", {}))
    if kind == "run":
        m["anim"] = {"run_" + d: {"cols": [1, 2, 3, 0], "ticks": [5, 3, 5, 3]} for d in DIRS}
        m["speed_px_per_frame"] = 2
    else:
        m["anim"] = {"walk_" + d: {"cols": [1, 2, 3, 0], "ticks": [8, 8, 8, 8]} for d in DIRS}
        m["anim"].update({"face_" + d: {"cols": [0], "ticks": [16]} for d in DIRS})
        m["speed_px_per_frame"] = 1
    return m


def export(ch, root, sheets):
    """sheets = {kind: native image}; writes <root>/<Group>/<slug>/<slug>-<kind>.png (x2) + .json."""
    out = os.path.join(root, ch.group, ch.slug)
    os.makedirs(out, exist_ok=True)
    paths = []
    for kind, img in sheets.items():
        p = os.path.join(out, f"{ch.slug}-{kind}.png")
        up(img).save(p)
        with open(p[:-4] + ".json", "w", encoding="utf-8") as f:
            json.dump(meta(ch, kind, img), f, indent=2, ensure_ascii=False)
            f.write("\n")
        paths.append(p)
    return paths
