#!/usr/bin/env python3
"""
Mons evolution effect (decisions.md §12b, 2026-11-19): the Gen 3 evolution scene on screen (pret/pokeemerald
src/evolution_scene.c + src/evolution_graphics.c: old sprite fades to white, old / new white silhouettes grow and
shrink faster and faster, sparkle spiral / arc / circle / spray, light-blue background, B cancels during the
alternation, white flash, the new Pokémon in colour, its cry, "Congratulations!") with the 3D reference's evolution
particles (upstream particle data evo_*.particle.json, MPL-2.0) rendered to 2D Gen 3 strips as the sparkles.

  strips    render the evo_* particle effects with the reference particle engine used for the move Fallback
            (expressions, emitters, billboards; fitted, never cut; <= 15 colours, alpha 0/255, 1 px outline where it helps) into the git-ignored library
            assets/skills/Fallback/_evolution/ (every effect + a contact sheet), then copy the ones the game uses into the
            tracked assets/ui/Evolution/ (+ evolution.json: strip sizes / fps and the cues, LICENSE.md)
  facts     write data/battle/evolution-animation.json (the 3D reference's sequence vs Gen 3's, frame numbers computed by
            running the pret logic below, sources)
  preview   play the Mons sequence for a species pair exactly like game/src/scenes/Evolve.ts (same per-frame pret logic
            at 60 fps, same cues) and write a key-frame sheet tmp/report/evolution-preview.png (+ --frames-dir)
            The move viewer (move_viewer.py, page /evolution) uses render_frames() from here.

usage (the Pillow python, see AGENTS.md):
  python3 evolution_fx.py strips [--sheet]
  python3 evolution_fx.py facts
  python3 evolution_fx.py preview charmander charmeleon [--cancel 200]
"""
import argparse
import json
import math
import os
import random
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fallback_vfx as cv  # noqa: E402  (the particle engine of the move Fallback)
import vfx  # noqa: E402
from vfx import Image  # noqa: E402

REPO = vfx.REPO
LIB = os.path.join(REPO, "assets", "skills", "Fallback", "_evolution")       # git-ignored (assets/skills/Fallback/), every effect
OFFICIAL = os.path.join(REPO, "assets", "ui", "Evolution")                    # tracked, what the game plays
FACTS = os.path.join(REPO, "data", "battle", "evolution-animation.json")
REPORT = os.path.join(REPO, "tmp", "report")
K_UNIT = 40           # strip px per world unit: 1 unit = the Pokémon's height = the 40 px front sprite (drawn x2 in game)
DUMMY_MOVE = {"type": "normal", "identifier": "evolution", "class": "status"}
MID = (0.0, 0.5, 0.0)   # evo_particles plays on the "middle" locator; its children are emitter_bound there

# name -> (upstream effect, sample window [t0, t1] s after the effect starts, frames, loop, outline)
STRIPS = {
    "sparkle-spiral": ("evo_sparkle", (1.0, 2.0), 12, True, True),
    "buildup": ("evo_buildup", (3.0, 4.0), 12, True, True),
    "obscuring": ("evo_obscuring", (0.0, 2.0), 10, False, False),
    "godrays-small": ("evo_godrays_small", (0.1, 1.6), 12, False, False),
    "godrays": ("evo_godrays", (0.1, 1.6), 12, False, False),
    "flyingsparkles": ("evo_flyingsparkles", (1.0, 2.0), 12, True, True),
    "bigsparkle": ("evo_bigsparkle", (0.5, 1.5), 12, True, True),
    "implode": ("evo_implode", (0.0, 0.33), 8, False, True),
    "smokeburst": ("evo_smokeburst", (0.0, 1.2), 10, False, False),
    "sparkleburst": ("evo_sparkleburst", (0.03, 1.2), 12, False, True),
    "sparklefetti": ("evo_sparklefetti", (0.1, 2.0), 12, False, True),
}
# what the game plays (copied to assets/ui/Evolution/) and when, in GBA frames (60 fps) from the start of a Gen 3 phase
GAME_STRIPS = ["sparkle", "buildup", "flyingsparkles", "implode", "godrays", "sparkleburst"]
CUES = [
    {"strip": "buildup", "phase": "spiral", "at": 0, "until": "cycle", "front": True,
     "why": "reference evo_buildup (2-7 s): cyan dots pulled into the Pokémon while the light builds up"},
    {"strip": "flyingsparkles", "phase": "cycle", "at": 0, "until": "circle", "front": True,
     "why": "reference evo_flyingsparkles (6-10 s): sparkles flying off while the silhouettes alternate"},
    {"strip": "implode", "phase": "circle", "at": 0, "front": True,
     "why": "reference evo_implode (9.58 s) = Gen 3 EvolutionSparkles_CircleInward"},
    {"strip": "godrays", "phase": "spray", "at": 32, "front": False,
     "why": "reference evo_godrays: light rays behind the new Pokémon as the white flash clears (Gen 3 spray frame 32)"},
    {"strip": "sparkleburst", "phase": "spray", "at": 32, "front": True,
     "why": "reference evo_sparkleburst (10.01 s, the reveal)"},
]


# ====================================================================== strips (reference evo_* -> 2D)
def sim_effect(name, t_end, seed=3):
    eff = cv.Effect.get(name)
    world = cv.World(DUMMY_MOVE, seed)
    return world.run([(0.0, eff, MID, cv.basis_facing((0.0, 0.0, 1.0)), "actor", None)], t_end)


def render_strip(name, eff, win, n, outline):
    snaps = sim_effect(eff, win[1] + 0.05)
    cam = cv.battle_cam(10)            # the evolution screen looks at the Pokémon from the front, slightly above
    O = cam.p(MID)
    times = [win[0] + (win[1] - win[0]) * i / (n - 1 if n > 1 else 1) for i in range(n)]
    if STRIPS[name][3]:                # loops: n frames over the window, the last one before the first again
        times = [win[0] + (win[1] - win[0]) * i / n for i in range(n)]
    idx = [min(len(snaps) - 1, max(0, round(t / (snaps[1][0] - snaps[0][0])))) for t in times]
    frames, N, k = fit_frames([snaps[i][1] for i in idx], cam, O, K_UNIT, outline)
    strip = Image.new("RGBA", (N * n, N), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        strip.alpha_composite(f, (i * N, 0))
    s, dropped = k / K_UNIT, 0
    fps = n / (win[1] - win[0]) if STRIPS[name][3] else (n - 1) / (win[1] - win[0])
    return strip, dict(effect=eff, frames=n, cell=N, fps=round(fps, 2), loop=STRIPS[name][3],
                       outline=outline, window_s=list(win), px_per_unit=round(K_UNIT * s, 2), refit=round(s, 3),
                       loose_dropped=dropped)


MARGIN = 2            # transparent px kept between the drawing and the cell edge (as the move Fallback engine)
N_MAX = 192           # biggest cell (as the move Fallback engine)


def fit_frames(groups, cam, O, k, outline, big=640):
    """never cut, nothing dropped: these effects are clouds of small particles (the engine's finish() would keep
    the cell for its 'body' and drop the loose ones), so every frame is rendered on a big canvas, cut to the Gen 3
    look (the engine's gen3(): alpha 0/255, one shared <= 15 colour palette, 1 px outline), and the square cell centred
    on the locator is made just big enough for every opaque pixel (+ MARGIN); past N_MAX px the strip is re-rendered
    smaller. Returns (frames, cell px, px per unit used)."""
    for _ in range(6):
        raw = [cv.render(g, cam, k, O, (big / 2, big / 2), (big, big)) for g in groups]
        done = cv.gen3(raw, 15, outline, alpha_cut=48, speck=1)   # glow particles: a lower cut keeps their core
        half = 0.0
        for d in done:
            bb = d.getbbox()
            if bb:
                half = max(half, big / 2 - bb[0], bb[2] - big / 2, big / 2 - bb[1], bb[3] - big / 2)
        N = max(32, 4 * math.ceil((half + MARGIN) / 2))
        if N <= N_MAX:
            o = int(big / 2 - N / 2)
            return [d.crop((o, o, o + N, o + N)) for d in done], N, k
        k *= (N_MAX / 2 - MARGIN) / half * 0.98
    raise SystemExit("cannot fit")


def render_sparkle():
    """one sparkle particle (the texture the reference's evo_sparkle / sparkleburst use, its 4-frame flipbook, tinted
    like evo_sparkle at 38 % of its life) for the Gen 3 sparkle sprites (spiral, arc, circle, spray)"""
    cv.Effect.get("evo_sparkle").tex()
    tex = cv._TEX["textures/particles/generic/sparkle/glowingsparkle_yellow"]
    tint = cv.hexcol("#FFFFF864")
    frames = []
    for i in range(4):
        f = tex.crop((0, i * 8, 8, i * 8 + 8))
        px = [(int(r * tint[0]), int(g * tint[1]), int(b * tint[2]), a) for r, g, b, a in cv.pixels(f)]
        f2 = Image.new("RGBA", (8, 8))
        f2.putdata(px)
        cell = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
        cell.alpha_composite(f2, (1, 1))
        frames.append(cell)
    frames = cv.gen3(frames, 15, True, alpha_cut=96, speck=1)
    strip = Image.new("RGBA", (40, 10), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        strip.alpha_composite(f, (i * 10, 0))
    return strip, dict(effect="evo_sparkle (texture glowingsparkle_yellow, one particle)", frames=4, cell=10,
                       fps=24, loop=True, outline=True, note="drawn by the Gen 3 sparkle motions, not by an emitter")


def cmd_strips(sheet=False):
    os.makedirs(LIB, exist_ok=True)
    meta = {}
    im, m = render_sparkle()
    im.save(os.path.join(LIB, "evo-sparkle.png"))
    meta["sparkle"] = m
    for name, (eff, win, n, loop, outline) in STRIPS.items():
        im, m = render_strip(name, eff, win, n, outline)
        im.save(os.path.join(LIB, f"evo-{name}.png"))
        meta[name] = m
        print(f"  {name:15s} {m['frames']:2d} x {m['cell']:3d} px  {m['fps']:5.2f} fps  x{m['refit']}  dropped {m['loose_dropped']}")
    lib_meta = {"_about": "Upstream evo_* particle effects (3D reference, MPL-2.0) rendered to Gen 3 strips by "
                          "tools/skills/evolution_fx.py strips (library, git-ignored); the "
                          "game copies are in assets/ui/Evolution/.", "warnings": sorted(cv.WARN), "strips": meta}
    json.dump(lib_meta, open(os.path.join(LIB, "evolution-strips.json"), "w"), indent=1, ensure_ascii=False)
    os.makedirs(OFFICIAL, exist_ok=True)
    for name in GAME_STRIPS:
        shutil.copyfile(os.path.join(LIB, f"evo-{name}.png"), os.path.join(OFFICIAL, f"evo-{name}.png"))
    game = {"_about": "Evolution scene assets (decisions.md §12b). Strips: upstream evo_* particles (MPL-2.0, see "
                      "LICENSE.md) rendered by evolution_fx.py strips; drawn x2 in game, centred on the "
                      "Pokémon. Cues: GBA frames (60 fps) from the start of a Gen 3 phase (data/battle/"
                      "evolution-animation.json); 'until' = loop until that phase starts.",
            "scale": 2, "strips": {n: {k: meta[n][k] for k in ("frames", "cell", "fps", "loop")} for n in GAME_STRIPS},
            "cues": CUES, "sounds": SOUND_CUES}
    json.dump(game, open(os.path.join(OFFICIAL, "evolution.json"), "w"), indent=1, ensure_ascii=False)
    write_license()
    if sheet:
        contact_sheet(meta)
    print(f"strips -> {os.path.relpath(LIB, REPO)} ({len(meta)}), game -> {os.path.relpath(OFFICIAL, REPO)} ({len(GAME_STRIPS)})")
    if cv.WARN:
        print("warnings:", "; ".join(sorted(cv.WARN)))


def contact_sheet(meta):
    rows = []
    for name, m in meta.items():
        im = Image.open(os.path.join(LIB, f"evo-{name}.png"))
        z = 2 if m["cell"] <= 96 else 1
        rows.append(im.resize((im.width * z, im.height * z), Image.NEAREST))
    W = max(r.width for r in rows)
    sh = Image.new("RGBA", (W, sum(r.height + 4 for r in rows)), (24, 26, 48, 255))
    y = 0
    for r in rows:
        sh.alpha_composite(r, (0, y))
        y += r.height + 4
    os.makedirs(REPORT, exist_ok=True)
    sh.save(os.path.join(REPORT, "evolution-strips.png"))
    print("sheet ->", os.path.relpath(os.path.join(REPORT, "evolution-strips.png"), REPO))


def write_license():
    txt = f"""# Evolution sparkles: MPL-2.0 notice

Written by `tools/skills/evolution_fx.py strips` (decisions.md §12b, 2026-11-19).
The `evo-*.png` strips in this folder were rendered from upstream particle effect data
(`particles/evo_*.particle.json` and their textures under `textures/particle/generic/`) by our own
re-implementation of that particle format (the engine used for the move Fallback) with a front camera, then cut
to the Gen 3 look (<= 15 colours, alpha 0/255, 1 px outline on the sparkles). That upstream data is licensed
under the Mozilla Public License 2.0: licence text [`LICENSES/MPL-2.0.txt`](../../../LICENSES/MPL-2.0.txt), project, commit and
copyright notice in [`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md).
The scene itself (timing, silhouettes, sparkle paths, background) follows the Gen 3 games' logic as documented by
pret/pokeemerald and is drawn by our code; no Nintendo graphics are used. `evolution.json` is ours.

| File | Upstream effect |
|---|---|
""" + "".join(f"| `evo-{n}.png` | `{('evo_sparkle (one particle of its texture)' if n == 'sparkle' else STRIPS[n][0])}` |\n"
              for n in GAME_STRIPS)
    open(os.path.join(OFFICIAL, "LICENSE.md"), "w").write(txt)


# ====================================================================== Gen 3 sequence (pret logic, 60 fps)
SINE = [int(round(math.sin(2 * math.pi * i / 256) * 256)) for i in range(256)]
SPARKLE_MATRICES = [0x3C0, 0x380, 0x340, 0x300, 0x2C0, 0x280, 0x240, 0x200, 0x1C0, 0x180, 0x140, 0x100]
BG_CONTROL = [(0, 12, 1, 6), (13, 36, 5, 2), (13, 24, 1, 2), (37, 49, 1, 6)]
# sBgAnim_PalIndexes: palette slot j (1..13) of row r -> colour index 0 (black) .. 13 (light blue 172, 213, 255)


def _bg_rows():
    """pret's 50 rows rebuilt from their pattern (rows 10 / 48 differ by one stray value in pret's table)"""
    rows = []
    for r in range(13):                               # rows 0-12: the light grows in from slot 13
        rows.append([0] + [j - 12 + r if j >= 13 - r else 0 for j in range(1, 14)])
    for r in range(12):                               # rows 13-24: a bright peak walks from slot 12 to slot 1
        rows.append([0] + [13 - abs(j - (12 - r)) for j in range(1, 14)])
    for r in range(12):                               # rows 25-36: a dark valley walks from slot 12 to slot 1
        rows.append([0] + [1 + abs(j - (12 - r)) for j in range(1, 14)])
    for r in range(13):                               # rows 37-49: fades out
        rows.append([0] + [max(0, 13 - r - j) if r <= 10 else 0 for j in range(1, 14)])
    return rows


BG_ROWS = _bg_rows()
BG_COLOURS = [tuple(min(248, (round(c * i / 13) // 8) * 8) for c in (172, 213, 255)) for i in range(14)]


def Sin(a, amp):
    return (SINE[a & 255] * amp) >> 8


def Cos(a, amp):
    return (SINE[(a + 64) & 255] * amp) >> 8


def tdiv(a, b):
    """C integer division (truncates toward zero)"""
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b > 0) else -q


def fade_frames(delay):
    """BeginNormalPaletteFade 0 <-> 16: 9 blend steps (deltaY 2), each (delay + 2) frames (BG pass + OBJ pass)"""
    return 9 * (delay + 2)


class Fade:
    def __init__(self, start, target, delay):
        self.start, self.target, self.step, self.e = start, target, delay + 2, 0

    def y(self):
        d = min(abs(self.target - self.start), 2 * (self.e // self.step))
        return self.start + (d if self.target > self.start else -d)

    def advance(self):
        self.e += 1
        return self.y() == self.target


class Sparkle:
    __slots__ = ("kind", "x", "y", "x2", "y2", "amp", "trig", "t", "speed", "matrix", "front", "invisible", "alive", "id")

    def __init__(self, kind, x, y, sid, amp=0, trig=0, speed=0, matrix=31, front=True):
        self.kind, self.x, self.y, self.x2, self.y2 = kind, x, y, 0, 0
        self.amp, self.trig, self.t, self.speed, self.matrix = amp, trig, 0, speed, matrix
        self.front, self.invisible, self.alive, self.id = front, False, True, sid

    def step(self):
        if self.kind == "spiral":                     # SpriteCB_Sparkle_SpiralUpward
            if self.y > 8:
                self.y = 88 - tdiv(self.t * self.t, 80)
                self.y2 = tdiv(Sin(self.trig, self.amp), 4)
                self.x2 = Cos(self.trig, self.amp)
                self.trig += 4
                if self.t & 1:
                    self.amp -= 1
                self.t += 1
                self.front = self.y2 > 0
                self.matrix = min(31, tdiv(self.amp, 4) + 20)
            else:
                self.alive = False
        elif self.kind == "arc":                      # SpriteCB_Sparkle_ArcDown
            if self.y < 88:
                self.y = 8 + tdiv(self.t * self.t, 5)
                self.y2 = tdiv(Sin(self.trig, self.amp), 4)
                self.x2 = Cos(self.trig, self.amp)
                self.amp = 8 + Sin(self.t * 4, 40)
                self.t += 1
            else:
                self.alive = False
        elif self.kind == "circle":                   # SpriteCB_Sparkle_CircleInward
            if self.amp > 8:
                self.y2 = Sin(self.trig, self.amp)
                self.x2 = Cos(self.trig, self.amp)
                self.amp -= self.speed
                self.trig += 4
            else:
                self.alive = False
        elif self.kind == "spray":                    # SpriteCB_Sparkle_Spray
            if not (self.t & 3):
                self.y += 1
            if self.trig < 128:
                self.y2 = -Sin(self.trig, self.amp)
                self.x = 120 + tdiv(self.speed * self.t, 3)
                self.trig += 1
                m = 31 - tdiv(self.trig * 12, 128)
                if self.trig > 64:
                    self.front = True
                else:
                    self.invisible = False
                    self.front = False
                self.matrix = max(20, m)
                self.t += 1
            else:
                self.alive = False

    def scale(self):
        return 256 / SPARKLE_MATRICES[self.matrix - 20]


def cycle_schedule():
    """Task_CycleEvolutionMonSprite as a list of (pre scale, post scale) per frame (scale /256), speeds 10..128"""
    pre, post, show, speed, out = 256, 16, 0, 8, []
    while True:
        if speed == 128:              # TryEnd: done, the post-evo sprite at full size
            out.append((pre, post))
            return out
        speed += 2
        show ^= 1
        out.append((pre, post))       # the TryEnd frame
        while True:
            fin = 0
            if not show:
                if pre < 256 - speed:
                    pre += speed
                else:
                    pre, fin = 256, fin + 1
                if post > 16 + speed:
                    post -= speed
                else:
                    post, fin = 16, fin + 1
            else:
                if post < 256 - speed:
                    post += speed
                else:
                    post, fin = 256, fin + 1
                if pre > 16 + speed:
                    pre -= speed
                else:
                    pre, fin = 16, fin + 1
            out.append((pre, post))
            if fin == 2:
                break


CYCLE = cycle_schedule()
SPIRAL_FRAMES = 64 + 96 + 1      # Task_Sparkles_SpiralUpward: 64 frames of spawns, then a 96-frame countdown
ARC_FRAMES = 96 + 1
CIRCLE_FRAMES = 48 + 1
SPRAY_FRAMES = 128 + 1
REVEAL_FROM_SPIRAL = SPIRAL_FRAMES + ARC_FRAMES + len(CYCLE) + CIRCLE_FRAMES     # spray (white flash) start
EVO_FULL_REVEAL_S = 10.0         # 3D reference: evolution_full starts with the animation, the reveal burst is at 10.0 s
SOUND_CUES = [
    {"sound": "cry", "of": "pre", "phase": "intro_cry", "at": 0, "gen3": "EvoScene_DoMonAnimAndCry(pre)"},
    {"sound": "evo-notify", "phase": "intro_sound", "at": 0,
     "gen3": "MUS_EVOLUTION_INTRO", "reference": "evolution.notification (the 'can evolve' jingle)"},
    {"sound": "evo-full", "phase": "spiral", "at": REVEAL_FROM_SPIRAL - round(EVO_FULL_REVEAL_S * 60),
     "gen3": "MUS_EVOLUTION", "reference": "evolution.full at animation 0 s; started so that its 10.0 s (the burst) "
                                           "falls on the Gen 3 white flash; stopped when B cancels"},
    {"sound": "cry", "of": "post", "phase": "evo_cry", "at": 0, "gen3": "EvoScene_DoMonAnimAndCry(post)"},
    {"sound": "evo-ui", "phase": "congrats", "at": 0, "gen3": "MUS_EVOLVED",
     "reference": "evolution.ui (played when a Pokémon evolves without the animation)"},
    {"sound": "cry", "of": "pre", "phase": "cancel_cry", "at": 0, "gen3": "EvoScene_DoMonAnimAndCry(pre) after B"},
]
TEXTS = {"intro": "Ồ? {pre} đang tiến hoá!", "congrats": "Chúc mừng! {pre} đã tiến hoá thành {post}!",
         "cancel": "Hả? {pre} đã dừng tiến hoá."}
INTRO_HOLD = 30                  # frames the intro text stays after it is typed (Gen 3: auto, no button)
CRY_WAIT = 60
NOTIFY_WAIT = 54                 # evolution_notification.ogg is 0.86 s
POST_TEXT = 150


def text_frames(s):
    return math.ceil(len(s) * 18 / (1000 / 60)) + INTRO_HOLD      # Dialogue types 1 char / 18 ms


class EvoSim:
    """The Mons evolution sequence, one GBA frame per step(); the same logic as game/src/scenes/Evolve.ts"""

    def __init__(self, pre_name, post_name, cancel_at=None, seed=7):
        self.rng = random.Random(seed)
        self.names = {"pre": pre_name, "post": post_name}
        self.cancel_at = cancel_at        # cycle frame at which B is held (preview only)
        self.f = 0
        self.phase, self.pf = "fade_in", 0
        self.phase_start = {}
        self.screen_black = Fade(16, 0, 0)
        self.scene_black = None           # BG 2-4 to black (Fade) or None (0)
        self.white = None                 # screen white (Fade)
        self.mon_white = None             # OBJ 1-2 (the two Pokémon) to white
        self.mon_white_y = 0
        self.show = {"pre": True, "post": False}
        self.scale = {"pre": 256, "post": 256}
        self.bg_on = False                # BG1 / BG2 light-blue animation shown
        self.bg = None                    # palette task state
        self.bg_row = None
        self.bg_d0 = 0
        self.sparkles, self.nid = [], 0
        self.strips = []                  # [name, start frame, until phase or None, front]
        self.events = []                  # (frame, kind, value)
        self.cancelled = False
        self.done = False
        self.script = self._script()

    # ---- helpers
    def ev(self, kind, value):
        self.events.append((self.f, kind, value))

    def enter(self, name):
        self.phase, self.pf = name, 0
        self.phase_start[name] = self.f
        for c in SOUND_CUES:
            if c["phase"] == name and c["at"] == 0:
                self.sound(c)
        for c in CUES:
            if c["phase"] == name and c["at"] == 0:
                self.strips.append([c["strip"], self.f, c.get("until"), c["front"]])
        self.strips = [s for s in self.strips if s[2] != name]

    def sound(self, c):
        self.ev("sound", c["sound"] if c["sound"] != "cry" else f"cry:{c['of']}")

    def spawn(self, kind, x, y, **kw):
        self.nid += 1
        s = Sparkle(kind, x, y, self.nid, **kw)
        self.sparkles.append(s)

    def wait(self, n):
        for _ in range(n):
            yield

    # ---- the sequence (Task_EvolutionScene)
    def _script(self):
        yield from self.wait(fade_frames(0))                        # EVOSTATE_FADE_IN
        self.enter("intro_msg")
        intro = TEXTS["intro"].format(**self.names)
        self.ev("text", intro)
        yield from self.wait(text_frames(intro))
        self.enter("intro_cry")
        yield from self.wait(CRY_WAIT)
        self.enter("intro_sound")
        yield from self.wait(NOTIFY_WAIT)
        self.enter("bg_fade")                                       # EVOSTATE_START_MUSIC: BG to black, delay 4
        self.scene_black = Fade(0, 16, 4)
        yield from self.wait(fade_frames(4))
        self.enter("spiral")                                        # StartBgAnimation + SpiralUpward(17)
        self.bg_on, self.bg = True, dict(cyc=0, pal=0, ctl=0, n=0, start=0, active=True)
        self.mon_white = Fade(0, 16, 10)
        for t in range(64):
            if not (t & 7):
                for i in range(4):
                    self.spawn("spiral", 120, 88, amp=48, trig=(t & 120) * 2 + i * 64, matrix=31)
            yield
        yield from self.wait(SPIRAL_FRAMES - 64)
        self.enter("arc")                                           # EvolutionSparkles_ArcDown
        for t in range(ARC_FRAMES):
            if t < 6:
                for i in range(9):
                    self.spawn("arc", 120, 8, amp=8, trig=i * 16, matrix=25)
            yield
        self.enter("cycle")                                         # CycleEvolutionMonSprite (B cancels)
        self.mon_white, self.mon_white_y = None, 16
        self.show = {"pre": True, "post": True}
        for i, (a, b) in enumerate(CYCLE):
            if self.cancel_at is not None and i >= self.cancel_at:
                self.cancelled = True
                break
            self.scale = {"pre": a, "post": b}
            yield
        if self.cancelled:                                          # EVOSTATE_CANCEL
            self.show, self.scale = {"pre": True, "post": False}, {"pre": 256, "post": 256}
            self.bg_on, self.bg, self.sparkles, self.strips = False, None, [], []
            self.enter("cancel")
            self.ev("stop", "evo-full")
            self.scene_black = None
            self.white, self.mon_white = Fade(16, 0, 0), Fade(16, 0, 0)
            yield from self.wait(fade_frames(0))
            self.enter("cancel_cry")
            yield from self.wait(CRY_WAIT)
            self.enter("cancel_msg")
            self.ev("text", TEXTS["cancel"].format(**self.names))
            yield from self.wait(POST_TEXT)
            self.done = True
            return
        self.show, self.scale = {"pre": False, "post": True}, {"pre": 256, "post": 256}
        self.enter("circle")                                        # EvolutionSparkles_CircleInward
        for t in range(CIRCLE_FRAMES):
            if t in (0, 32):
                for i in range(16):
                    self.spawn("circle", 120, 56, amp=120, trig=i * 16, speed=4 if t == 0 else 8, matrix=31)
            yield
        self.enter("spray")                                         # EvolutionSparkles_SprayAndFlash
        self.white = Fade(0, 16, 0)
        for t in range(SPRAY_FRAMES):
            if t == 0:
                for _ in range(8):
                    self.spawn("spray", 120, 56, speed=3 - self.rng.randrange(7), amp=48 + (self.rng.randrange(65536) & 0x3F),
                               matrix=31, front=False)
            elif t == 32:
                self.white, self.mon_white = Fade(16, 0, 0), Fade(16, 0, 0)
                self.bg_on, self.bg = False, None                   # (the light-blue task ended ~1.3 s earlier)
            elif t < 50:
                self.spawn("spray", 120, 56, speed=3 - self.rng.randrange(7), amp=48 + (self.rng.randrange(65536) & 0x3F),
                           matrix=31, front=False)
            for c in CUES:
                if c["phase"] == "spray" and c["at"] == t and t:
                    self.strips.append([c["strip"], self.f, c.get("until"), c["front"]])
            yield
        self.enter("restore")                                       # EVOSTATE_RESTORE_SCREEN: BG back from black
        self.scene_black = Fade(16, 0, 0)
        yield from self.wait(fade_frames(0))
        self.enter("evo_cry")
        yield from self.wait(CRY_WAIT)
        self.enter("congrats")
        self.ev("text", TEXTS["congrats"].format(**self.names))
        yield from self.wait(POST_TEXT)
        self.done = True

    def step(self):
        """advance one GBA frame; False when the sequence is over"""
        if self.done:
            return False
        try:
            next(self.script)
        except StopIteration:
            self.done = True
        for c in SOUND_CUES:
            if c["phase"] == self.phase and c["at"] == self.pf and c["at"]:
                self.sound(c)
        for fd in (self.screen_black, self.scene_black, self.white):
            if fd:
                fd.advance()
        if self.mon_white:
            self.mon_white.advance()
            self.mon_white_y = self.mon_white.y()
        for s in self.sparkles:
            s.step()
        self.sparkles = [s for s in self.sparkles if s.alive]
        if self.bg is not None:
            self.bg_step()
        self.f += 1
        self.pf += 1
        return not self.done

    def bg_step(self):
        b = self.bg                                                 # Task_UpdateBgPalette + Task_AnimateBg
        self.bg_d0 = (self.bg_d0 + 5) & 255
        if not b["active"]:
            return
        if b["start"] < 20:
            b["start"] += 1
            return
        S, E, C_, D = BG_CONTROL[b["ctl"]]
        old = b["cyc"]
        b["cyc"] += 1
        if old > D:
            if E == b["pal"]:
                b["n"] += 1
                if b["n"] == C_:
                    b["n"] = 0
                    b["ctl"] += 1
                b["pal"] = BG_CONTROL[b["ctl"]][0] if b["ctl"] < len(BG_CONTROL) else 0
            else:
                self.bg_row = b["pal"]
                b["cyc"] = 0
                b["pal"] += 1
        if b["ctl"] == len(BG_CONTROL):
            b["active"] = False
            self.bg_row = None

    # ---- what to draw now
    def state(self):
        y = lambda fd: fd.y() if fd else 0  # noqa: E731
        return dict(f=self.f, phase=self.phase, pf=self.pf, screen_black=y(self.screen_black),
                    scene_black=y(self.scene_black), white=y(self.white), mon_white=self.mon_white_y,
                    show=dict(self.show), scale=dict(self.scale), bg_on=self.bg_on, bg_row=self.bg_row,
                    bg_d0=self.bg_d0, strips=[list(s) for s in self.strips],
                    sparkles=[(s.x + s.x2, s.y + s.y2, s.scale(), s.front, s.invisible, s.id) for s in self.sparkles])


# ====================================================================== preview renderer (Pillow, like Evolve.ts)
SW, SH = 320, 180
MON_CX, MON_CY = SW // 2, 72     # the Pokémon's centre on the Mons screen (sprite 40 px drawn x2: y 32..112)
PK = 1.25                        # pret 240x160 px -> Mons screen px around the Pokémon (64 px sprite -> 80 px)
RING = 14                        # px per light-blue band


def px_(x):
    return MON_CX + (x - 120) * PK


def py_(y):
    return MON_CY + (y - 64) * PK


class Renderer:
    def __init__(self, pre, post, scene="meadow-tall-grass-wild-wide"):
        self.mon = {k: self.mon_sprite(s) for k, s in (("pre", pre), ("post", post))}
        self.white = {k: self.silhouette(im) for k, im in self.mon.items()}
        p = os.path.join(REPO, "assets", "battle-scenes", scene.split("-")[0], f"{scene}.png")
        if os.path.isfile(p):
            bg = Image.open(p).convert("RGB")
            bg = bg.resize((bg.width // 2, bg.height // 2), Image.NEAREST)
            ox = (bg.width - SW) // 2
            self.scene = bg.crop((ox, 0, ox + SW, SH))
        else:
            self.scene = Image.new("RGB", (SW, SH), (28, 30, 58))
        meta = json.load(open(os.path.join(OFFICIAL, "evolution.json"), encoding="utf-8"))
        self.meta = meta
        self.strips = {}
        for n, m in meta["strips"].items():
            im = Image.open(os.path.join(OFFICIAL, f"evo-{n}.png")).convert("RGBA")
            c = m["cell"]
            self.strips[n] = [im.crop((i * c, 0, (i + 1) * c, c)) for i in range(m["frames"])]
        self.big = {n: [f.resize((f.width * 2, f.height * 2), Image.NEAREST) for f in fr]
                    for n, fr in self.strips.items() if n != "sparkle"}
        self.spk_cache = {}
        # light-blue bands: index map a bit bigger than the screen (the two layers move on a 4 px circle)
        self.band = Image.new("L", (SW + 24, SH + 24))
        bp = self.band.load()
        for yy in range(SH + 24):
            for xx in range(SW + 24):
                d = math.hypot(xx - 12 - MON_CX, (yy - 12 - MON_CY) * 1.15)
                j = 13 - int(d // RING)
                bp[xx, yy] = j if j >= 1 else 0

    @staticmethod
    def mon_sprite(slug):
        im = vfx.battle_sprite(slug, "front", height=40, cap=80).convert("RGBA")
        im.putalpha(im.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
        return im.resize((im.width * 2, im.height * 2), Image.NEAREST)

    @staticmethod
    def silhouette(im):
        w = Image.new("RGBA", im.size, (255, 255, 255, 255))
        w.putalpha(im.getchannel("A"))
        return w

    def sparkle(self, i, scale):
        key = (i, round(scale * 8))
        if key not in self.spk_cache:
            f = self.strips["sparkle"][i]
            s = max(1, round(f.width * PK * scale))
            self.spk_cache[key] = f.resize((s, s), Image.NEAREST)
        return self.spk_cache[key]

    def frame(self, st):
        cv_ = Image.new("RGBA", (SW, SH), (0, 0, 0, 255))
        if st["bg_on"]:
            row = BG_ROWS[st["bg_row"]] if st["bg_row"] is not None else [0] * 14
            pal = []
            for j in range(256):
                pal += list(BG_COLOURS[row[j]] if j < 14 else (0, 0, 0))
            d0 = st["bg_d0"]
            d1 = (d0 + 128) & 255
            layers = []
            for d in (d0, d1):
                ox, oy = round(Cos(d, 4) * PK), round(Sin(d, 4) * PK)
                im = self.band.crop((12 + ox, 12 + oy, 12 + ox + SW, 12 + oy + SH))
                im.putpalette(pal) if im.mode == "P" else None
                pim = Image.frombytes("P", im.size, im.tobytes())
                pim.putpalette(pal)
                layers.append(pim.convert("RGB"))
            cv_.paste(Image.blend(layers[0], layers[1], 0.5), (0, 0))
        else:
            sc = self.scene
            if st["scene_black"]:
                sc = Image.blend(sc, Image.new("RGB", sc.size), st["scene_black"] / 16)
            cv_.paste(sc, (0, 0))
        spk = st["sparkles"]
        f = st["f"]
        for front in (False, True):
            for x, y, s, fr, inv, sid in spk:
                if fr != front or inv:
                    continue
                im = self.sparkle((f // 3 + sid) % 4, s)
                cv_.alpha_composite(im, (round(px_(x) - im.width / 2), round(py_(y) - im.height / 2)))
            if not front:
                self.strips_at(cv_, st, False)
                for k in ("pre", "post"):
                    if st["show"][k]:
                        self.draw_mon(cv_, k, st["scale"][k] / 256, st["mon_white"])
        self.strips_at(cv_, st, True)
        out = cv_.convert("RGB")
        if st["white"]:
            out = Image.blend(out, Image.new("RGB", out.size, (255, 255, 255)), st["white"] / 16)
        if st["screen_black"]:
            out = Image.blend(out, Image.new("RGB", out.size), st["screen_black"] / 16)
        return out

    def draw_mon(self, cv_, k, s, white):
        im, wh = self.mon[k], self.white[k]
        if s != 1:
            w, h = max(1, round(im.width * s)), max(1, round(im.height * s))
            im, wh = im.resize((w, h), Image.NEAREST), wh.resize((w, h), Image.NEAREST)
        pos = (round(MON_CX - im.width / 2), round(MON_CY - im.height / 2))
        if white >= 16:
            cv_.alpha_composite(wh, pos)
            return
        cv_.alpha_composite(im, pos)
        if white:
            w2 = wh.copy()
            w2.putalpha(wh.getchannel("A").point(lambda v: round(v * white / 16)))
            cv_.alpha_composite(w2, pos)

    def strips_at(self, cv_, st, front):
        for name, start, until, fr in st["strips"]:
            if fr != front or name not in self.big:
                continue
            m = self.meta["strips"][name]
            i = int((st["f"] - start) * m["fps"] / 60)
            if m["loop"]:
                i %= m["frames"]
            elif i >= m["frames"]:
                continue
            im = self.big[name][i]
            cv_.alpha_composite(im, (round(MON_CX - im.width / 2), round(MON_CY - im.height / 2)))


def run(pre, post, cancel_at=None, every=2):
    """[(state, image)] every `every` GBA frames (2 = 30 fps) + the sim's events"""
    names = mon_names()
    sim = EvoSim(names.get(pre, pre.title()), names.get(post, post.title()), cancel_at)
    r = Renderer(pre, post)
    out = []
    while True:
        alive = sim.step()
        if sim.f % every == 0 or not alive:
            st = sim.state()
            out.append((st, r.frame(st)))
        if not alive:
            break
    return out, sim.events


def mon_names():
    p = os.path.join(REPO, "game", "public", "assets", "mons", "mons.json")
    try:
        return {k: v["name"] for k, v in json.load(open(p, encoding="utf-8")).items()}
    except (OSError, ValueError):
        return {}


def cmd_preview(pre, post, cancel_at=None, frames_dir=None):
    frames, events = run(pre, post, cancel_at)
    os.makedirs(REPORT, exist_ok=True)
    if frames_dir:
        os.makedirs(frames_dir, exist_ok=True)
        for i, (st, im) in enumerate(frames):
            im.save(os.path.join(frames_dir, f"{i:04d}.png"))
    # key frames: the first frame of each phase + a few inside the long ones
    picks, seen = [], set()
    for i, (st, im) in enumerate(frames):
        tag = st["phase"]
        mark = tag in ("cycle", "spiral", "spray") and st["pf"] in (40, 120, 200, 300, 380, 20, 36, 60)
        if tag not in seen or mark:
            seen.add(tag)
            picks.append((f"{tag} {st['pf']}", im))
    cols = 4
    rows = (len(picks) + cols - 1) // cols
    sh = Image.new("RGB", (cols * SW, rows * (SH + 14)), (20, 20, 28))
    from PIL import ImageDraw
    d = ImageDraw.Draw(sh)
    for i, (lbl, im) in enumerate(picks):
        x, y = (i % cols) * SW, (i // cols) * (SH + 14)
        sh.paste(im, (x, y + 14))
        d.text((x + 3, y + 1), lbl, fill=(230, 230, 230))
    name = "evolution-preview" + ("-cancel" if cancel_at is not None else "")
    sh.save(os.path.join(REPORT, f"{name}.png"))
    try:
        frames[0][1].save(os.path.join(REPORT, f"{name}.webp"), save_all=True, append_images=[f for _, f in frames[1:]],
                          duration=33, loop=0, lossless=False, quality=70)
    except (OSError, ValueError, KeyError) as e:
        print("  (no webp:", e, ")")
    print(f"{len(frames)} frames ({len(frames) / 30:.1f} s at 30 fps) -> tmp/report/{name}.png (+ .webp)")
    for e in events:
        print("  ", e)


# ====================================================================== facts
def cmd_facts():
    cyc = len(CYCLE)
    swaps, big = [], "pre"
    for i, (a, b) in enumerate(CYCLE[1:], 1):
        nb = "post" if b > a else "pre"
        if nb != big:
            swaps.append(i)
            big = nb
    gaps = [b - a for a, b in zip([0] + swaps, swaps)]
    gen3 = {
        "source": "pret/pokeemerald master: src/evolution_scene.c (Task_EvolutionScene, StartBgAnimation, "
                  "Task_UpdateBgPalette, Task_AnimateBg), src/evolution_graphics.c (EvolutionSparkles_*, "
                  "CycleEvolutionMonSprite), src/palette.c (BeginNormalPaletteFade); cached in tmp/pokeemerald/",
        "fps": 60,
        "fade_rule": "BeginNormalPaletteFade(palettes, delay, 0<->16): deltaY 2 -> 9 blend steps, each (delay + 2) frames "
                     "(BG pass then OBJ pass) => delay 0 = 18 frames, delay 4 = 54, delay 10 = 108",
        "screen": "240x160; both Pokémon sprites at (120, 64), 64x64, affine scaled about their centre",
        "states": [
            {"state": "EVOSTATE_FADE_IN", "what": "all palettes from black, delay 0", "frames": fade_frames(0)},
            {"state": "EVOSTATE_INTRO_MSG", "what": "'What? {pre} is evolving!' (prints, no button)"},
            {"state": "EVOSTATE_INTRO_MON_ANIM", "what": "pre-evo front animation + cry"},
            {"state": "EVOSTATE_INTRO_SOUND", "what": "PlaySE(MUS_EVOLUTION_INTRO), wait until it ends"},
            {"state": "EVOSTATE_START_MUSIC", "what": "PlayNewMapMusic(MUS_EVOLUTION); BG palettes 2-4 fade to black, delay 4",
             "frames": fade_frames(4)},
            {"state": "EVOSTATE_START_BG_AND_SPARKLE_SPIRAL",
             "what": "StartBgAnimation (BG1 + BG2 light-blue palette cycling, blended 8/8, both layers circling 4 px); "
                     "EvolutionSparkles_SpiralUpward: SE_M_MEGA_KICK, the two Pokémon palettes fade to white (delay 10, "
                     f"{fade_frames(10)} frames), 4 sparkles every 8 frames for 64 frames (32) from (120, 88) rising "
                     "y = 88 - t^2/80 on a shrinking orbit (radius 48 -> 8, x = cos, y = sin / 4, front when y2 > 0), "
                     "then a 96-frame wait", "frames": SPIRAL_FRAMES},
            {"state": "EVOSTATE_SPARKLE_ARC", "what": "EvolutionSparkles_ArcDown: SE_M_BUBBLE_BEAM2, 9 sparkles per frame for "
                                                      "6 frames (54) from (120, 8) falling y = 8 + t^2/5 to y 88, radius "
                                                      "8 + sin(t*4) * 40 at a fixed angle, small (matrix 25)",
             "frames": ARC_FRAMES},
            {"state": "EVOSTATE_CYCLE_MON_SPRITE / WAIT_CYCLE_MON_SPRITE",
             "what": "CycleEvolutionMonSprite: both sprites WHITE (palettes set to white); pre starts at scale 256/256, "
                     "post at 16/256; each cycle one grows to 256 while the other shrinks to 16 by `speed` per frame; "
                     "speed 10, 12 ... 128 (60 cycles); ends on the post-evo sprite at full size",
             "frames": cyc, "seconds": round(cyc / 60, 2), "frames_per_swap": gaps,
             "cancel": "B held (gMain.heldKeys == B_BUTTON) during WAIT_CYCLE_MON_SPRITE, while the cycle task runs and "
                       "the evolution can be stopped -> ends on the pre-evo sprite"},
            {"state": "EVOSTATE_SPARKLE_CIRCLE", "what": "EvolutionSparkles_CircleInward: SE_SHINY, 16 sparkles on a "
                                                         "circle of radius 120 round (120, 56) closing in by 4 px/frame, "
                                                         "16 more at frame 32 by 8 px/frame", "frames": CIRCLE_FRAMES},
            {"state": "EVOSTATE_SPARKLE_SPRAY", "what": "EvolutionSparkles_SprayAndFlash: SE_M_PETAL_DANCE, BG + sparkles "
                                                        "fade to WHITE (delay 0); 8 sparkles then 1 per frame until 50 "
                                                        "spray up and out from (120, 56) (x += speed -3..3 / 3, arc height "
                                                        "48..111, shrinking); at frame 32 everything incl. the Pokémon "
                                                        "fades back from white (the new Pokémon in colour)",
             "frames": SPRAY_FRAMES},
            {"state": "EVOSTATE_EVO_SOUND", "what": "PlaySE(SE_EXP)"},
            {"state": "EVOSTATE_RESTORE_SCREEN", "what": "stop music, restore the BG, BG palettes 2-4 back from black (delay 0)",
             "frames": fade_frames(0)},
            {"state": "EVOSTATE_EVO_MON_ANIM", "what": "post-evo front animation + cry"},
            {"state": "EVOSTATE_SET_MON_EVOLVED", "what": "'Congratulations! Your {pre} evolved into {post}!' + MUS_EVOLVED; "
                                                          "species set, Pokédex seen + caught"},
            {"state": "EVOSTATE_TRY_LEARN_MOVE", "what": "moves of the new species for this level (MonTryLearningNewMove)"},
            {"state": "EVOSTATE_CANCEL ... CANCEL_MSG", "what": "m4aMPlayAllStop; BG 2-4 + both Pokémon palettes fade from "
                                                                "WHITE (delay 0); pre-evo animation + cry; '{pre} stopped "
                                                                "evolving!'; then still TRY_LEARN_MOVE"},
        ],
        "background": "BG palette 10 cycles through sBgAnim_PalIndexes (50 rows x 16 slots, colour 0 = black .. 13 = "
                      "light blue 172, 213, 255) in 4 stages {rows 0-12 x1, delay 6}, {13-36 x5, delay 2}, {13-24 x1, "
                      "delay 2}, {37-49 x1, delay 6} after a 20-frame wait; each row (delay + 2) frames",
        "spiral_to_flash_frames": REVEAL_FROM_SPIRAL,
        "notes": ["pret's spray flicker (sTrigIdx > 112) sits in the branch for sTrigIdx <= 64, so it never shows",
                  "sparkle sprite: graphics/misc/evo_sparkle.png, 8x8, one frame; sizes via OAM matrices 20-31 "
                  "(0x3C0 .. 0x100 = 1/3.75 .. 1x)"],
    }
    reference = {
        "license": "MPL-2.0 (see LICENSES/MPL-2.0.txt, THIRD_PARTY_NOTICES.md): summarised, no file copied here",
        "source": "upstream source 1.8.4: Evolution.kt (forceEvolve), "
                  "generic/animations/evolution.animation.json, "
                  "particles/evo_*.particle.json, sounds.json, client/gui/PartyOverlayDataControl.kt",
        "trigger": "forceEvolve(): EVOLUTION_STARTED = true (the entity stops, busy lock); +1.0 s play the "
                   "animation 'evolution'; +11.2 s evolutionMethod() = the species / model swap (moves kept); +12.0 s "
                   "cry animation, EVOLUTION_STARTED = false, chat 'X evolved into Y'. No entity -> just the "
                   "evolution.ui sound + the message. No cancel once started (optional evolutions are accepted in the UI).",
        "animation": {"length_s": 12.0, "sound_at_0": "evolution.full (evolution/evolution_full.ogg, volume 0.9, 13.27 s)",
                      "particles_at_0": "evo_particles on locator 'middle'",
                      "timeline_5.25": "q.evo_glow_time(5.08) (no Kotlin implementation in 1.8.4: the glow comes from "
                                       "the evo_obscuring particles)",
                      "root_part": "spins 0 -> 3600 deg (10 turns, accelerating then slowing) 5.0-10.125 s; rises 20 px "
                                   "(x entity_size, max 1.2) 5.25-7.125 s, holds, lands 10.33-10.625 s with a small "
                                   "bounce at 10.71 s; scale 1 -> 0.75 (4.92-5.54 s) and back to 1 (10.33-10.46 s)"},
        "evo_particles_timeline_s": {"0.00": "evo_sparkle", "2.00": "evo_buildup", "5.00": "evo_obscuring",
                                     "5.01": "evo_godrays_small", "5.10": "evo_godrays", "6.00": "evo_flyingsparkles",
                                     "7.00": "evo_bigsparkle", "9.58": "evo_implode", "10.00": "evo_smokeburst",
                                     "10.01": "evo_sparkleburst", "10.02": "evo_sparklefetti"},
        "effects": {
            "evo_sparkle": "glowingsparkle_yellow, 10-20/s from a point orbiting 3 turns/s below the middle, rising (accel 4), "
                           "life 1 s, looping 5 s",
            "evo_buildup": "glowing_dots_cyan, rate grows with age (10/s per s), sphere radius 2 x size, inwards, life 0.75 s, 5 s",
            "evo_obscuring": "glowingsmoke_cyan, 420+ particles at once on a sphere moving inwards, life 5 s (hides the model)",
            "evo_godrays_small / evo_godrays": "lightbeam 6x128, 12/s, growing with age (2 / 4 units long), life 1 s, 3 / 4 s",
            "evo_flyingsparkles": "glowingsparkle_yellow, 15-25/s from a sphere outwards at 4-6 units/s, drag 2, life 1 s, 4 s",
            "evo_bigsparkle": "bigsparkle 16x16 x6 frames on a ring 1.7-2.5 units out, 8/s, life 0.3 s, 2 s",
            "evo_implode": "64 glowing_dots_cyan at once from a 3-unit sphere inwards, life 0.3 s",
            "evo_smokeburst": "130-260 glowingsmoke_cyan outwards at 10-12.5 units/s, life 0.1-1.2 s",
            "evo_sparkleburst": "35-70 glowingsparkle_yellow outwards at 18 units/s, drag 4, life 0.9-1.75 s",
            "evo_sparklefetti": "15-60 'star' confetti thrown up (4-8 units/s, gravity 10), life 1.5-2.5 s",
        },
        "sounds": {"evolution.full": "evolution_full.ogg 13.27 s (the whole animation)",
                   "evolution.notification": "evolution_notification.ogg 0.86 s: party overlay jingle when a level-up "
                                             "unlocks an evolution (instead of the level-up jingle)",
                   "evolution.ui": "evolution_ui.ogg 2.02 s (volume 0.2): evolving without an entity"},
    }
    mons = {
        "rule": "Gen 3 on screen (decisions.md §12b): the pret sequence and timing frame by frame (game/src/scenes/"
                "Evolve.ts and evolution_fx.py EvoSim share the logic), the reference's particles as extra sparkles, "
                "its sounds (no Gen 3 music)",
        "screen": f"{SW}x{SH} (PC; phone 390 wide); the Pokémon's centre ({MON_CX}, {MON_CY}) (40 px front sprite x2); pret "
                  f"coordinates around (120, 64) are scaled x{PK}",
        "background": f"the meadow battle scene; during the light-blue animation, concentric bands of {RING} px round "
                      "the Pokémon stand for pret's BG1 / BG2 tile layers (pret's tiles are not used): band j takes "
                      "the colour of palette slot j of the current row (pret's row table and timing), the two layers "
                      "circle like Task_AnimateBg and are blended 50/50",
        "white": "white silhouettes = a white copy of the sprite on top (alpha = fade y / 16)",
        "strips": {"folder": "assets/ui/Evolution/ (tracked; library of every effect: assets/skills/Fallback/_evolution/, ignored)",
                   "cues": CUES, "scale": 2, "px_per_unit": K_UNIT},
        "sounds": SOUND_CUES,
        "texts": TEXTS,
        "cancel": "B (pressed or held) or a tap during the alternation, as Gen 3 / as before",
        "waits": {"intro_hold": INTRO_HOLD, "cry": CRY_WAIT, "notify": NOTIFY_WAIT, "after_text": "A to continue"},
    }
    out = {"_about": "Evolution animation facts: the 3D reference (upstream data 1.8.4, MPL-2.0) and Gen 3 (pret/pokeemerald), and what Mons "
                     "does. Written by tools/skills/evolution_fx.py facts (frame numbers "
                     "computed by running the pret logic).",
           "reference": reference, "gen3": gen3, "mons": mons}
    json.dump(out, open(FACTS, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("facts ->", os.path.relpath(FACTS, REPO), f"(cycle {cyc} frames, spiral->flash {REVEAL_FROM_SPIRAL})")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("strips")
    s.add_argument("--sheet", action="store_true")
    sub.add_parser("facts")
    p = sub.add_parser("preview")
    p.add_argument("pre")
    p.add_argument("post")
    p.add_argument("--cancel", type=int, default=None, help="cycle frame at which B is held")
    p.add_argument("--frames-dir")
    a = ap.parse_args()
    if a.cmd == "strips":
        cmd_strips(a.sheet)
    elif a.cmd == "facts":
        cmd_facts()
    else:
        cmd_preview(a.pre, a.post, a.cancel, a.frames_dir)


if __name__ == "__main__":
    main()
