"""Beam moves drawn by code (effect source "code", decisions.md §12, 2026-11-19).

agy and the Fallback converter give a beam as ONE segment drawn in a 96 px cell that vfx.py tiles from the mouth to the
target, so the beam looks segmented and stubby. This module draws the whole beam on the 240 x 160 GBA screen instead,
in 3 phases (like Ruby / Sapphire / Emerald):

1. CHARGE: a glowing orb just in front of the user's mouth (vfx.beam_start pushes the mouth anchor out of the user's
           sprite: a beam never covers its user, decisions.md §12), growing, with streaks pulled in from the front.
2. FIRE:   ONE continuous straight beam from the mouth to the target's body anchor: white core, 2 colour bands of the
           move's palette, a 1 px dark outline, the thickness pulsing with a short period, a flared mouth end and a
           bright head; per-move detail travels along the beam (ice crystals, sun rays, psychic rings, flames, ...).
3. HIT:    white flash, a radial burst in the move's colours on the target, the beam keeps pouring a moment, then
           retracts into a last burst of particles; the hit reaction (shake / blink / knock-back) stays vfx.py's.

Pixel rules: every shape is rasterised on the 240 x 160 grid (no anti-aliasing; vfx.py scales the layer up with
nearest neighbour), colours come from a per-move palette (<= 15 colours, all BGR555-safe: multiples of 8), and every
shape gets a 1 px outline in the palette's dark colour. Both directions use the real (diagonal) line between the two
anchors. Only moves listed in STYLES are drawn here; the other beam-archetype moves (Fire Blast, Zap Cannon, ...)
are not beams on screen and keep their normal path.

API used by vfx.animate:  handles(move), timeline(move), Beam(...).shake(f) / .dim(f) / .draw(f), strips(move).
"""
import math
import random

from PIL import Image

W, H = 240, 160
TEXT_TOP = 112                 # the Gen 3 text box covers y 112-160: nothing of the beam may end in its straight edge
MAX_HALF = 8.0                 # thickest half-width (GBA px) whatever the Pokémon sizes
ORB_MAX = 10.0                 # biggest charge orb radius
N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
HOLD, RETRACT = 16, 6          # hit phase: the beam keeps pouring HOLD steps, then retracts in RETRACT steps
TRAVEL, HIT = 8, 30            # fire = the head runs mouth -> target in TRAVEL steps; HIT steps after it lands


def snap(c):
    """BGR555-safe colour (5 bits per channel)"""
    return tuple(min(248, (int(v) // 8) * 8) for v in c)


def P(o, m, l, w=(248, 248, 248), a=None):
    """palette: o = outline (dark), m = outer band, l = inner band, w = core, a = accent (details)"""
    return {"o": snap(o), "m": snap(m), "l": snap(l), "w": snap(w), "a": snap(a or l)}


RAINBOW = [((248, 184, 216), (232, 96, 160)), ((248, 240, 152), (232, 192, 48)), ((184, 248, 168), (72, 192, 96)),
           ((176, 232, 248), (64, 168, 232)), ((216, 192, 248), (144, 104, 232))]
SIGNAL = [((248, 160, 152), (216, 40, 56)), ((200, 248, 120), (88, 184, 40))]

# Per-move look. half = (half-width at the mouth end, at the target end) in GBA px for a ~52 px Pokémon (scaled with
# the sizes like every effect); cf = core fraction; detail = what travels along the beam; noise = ragged flame /
# water edges; pulse = thickness pulse (period 4 steps); bulge = waves running along the beam; flare = wider mouth end;
# charge = CHARGE steps; burst = size of the hit burst (x the target height); dim = background darkening (r, g, b, a);
# shake = screen shake while firing; twin = two parallel beams; rainbow = colour bands scrolling along the beam.
BASE = dict(half=(3.0, 3.0), cf=0.42, detail=None, noise=0.0, pulse=0.12, bulge=0.10, flare=0.45, charge=20,
            burst=0.55, dim=None, shake=0, twin=False, rainbow=None, head=1.45, streak="line", orb=1.0)
STYLES = {
    # --- the 3 prototype moves -------------------------------------------------------------------------------
    "hyper-beam": dict(pal=P((128, 40, 8), (248, 128, 24), (248, 216, 72), (248, 248, 232), (248, 96, 32)),
                       half=(7.8, 6.8), cf=0.45, detail="helix", pulse=0.16, bulge=0.12, flare=0.45, charge=24,
                       burst=0.7, dim=(24, 8, 0, 72), shake=2, head=1.4, orb=1.0),
    "ice-beam": dict(pal=P((24, 64, 152), (80, 168, 240), (176, 232, 248), (248, 248, 248), (136, 208, 248)),
                     half=(4.4, 3.8), cf=0.40, detail="ice", pulse=0.14, bulge=0.16, charge=20, burst=0.6),
    "solar-beam": dict(pal=P((40, 96, 16), (144, 208, 40), (248, 240, 120), (248, 248, 224), (248, 200, 48)),
                       half=(8.8, 7.8), cf=0.48, detail="rays", pulse=0.10, bulge=0.10, flare=0.45, charge=34,
                       burst=0.72, head=1.35, streak="light", orb=1.4),
    # --- the other beams ---------------------------------------------------------------------------------------
    "psybeam": dict(pal=P((112, 24, 104), (232, 88, 184), (248, 176, 224), (248, 240, 248), (168, 104, 240)),
                    half=(3.0, 2.8), detail="rings", bulge=0.2, burst=0.55),
    "aurora-beam": dict(pal=P((56, 40, 112), (144, 104, 232), (216, 192, 248)), rainbow=RAINBOW,
                        half=(3.4, 3.0), detail="sparkle", burst=0.6),
    "flamethrower": dict(pal=P((136, 24, 8), (232, 72, 16), (248, 168, 40), (248, 240, 152), (248, 104, 24)),
                         half=(3.2, 7.0), cf=0.36, detail="flames", noise=0.45, pulse=0.08, bulge=0.0, flare=0.2,
                         burst=0.6, streak="flame"),
    "hydro-pump": dict(pal=P((16, 56, 144), (56, 128, 232), (144, 208, 248), (248, 248, 248), (96, 176, 248)),
                       half=(3.0, 6.0), cf=0.40, detail="drops", noise=0.22, bulge=0.06, flare=0.3, burst=0.65),
    "dragon-breath": dict(pal=P((64, 24, 104), (80, 176, 88), (176, 240, 144), (232, 248, 216), (152, 88, 216)),
                          half=(2.6, 5.6), cf=0.36, detail="flames", noise=0.45, pulse=0.08, bulge=0.0, flare=0.2,
                          burst=0.55, dim=(16, 0, 32, 80), streak="flame"),
    "hydro-cannon": dict(pal=P((16, 48, 136), (48, 120, 232), (136, 200, 248), (248, 248, 248), (96, 176, 248)),
                         half=(4.2, 6.0), cf=0.42, detail="drops", noise=0.15, flare=0.5, charge=24, burst=0.8,
                         shake=1),
    # user 2026-11-19 (anime reference: a wide violet-pink beam with a white core): Hyper Beam's shape, recoloured
    "signal-beam": dict(pal=P((88, 24, 104), (200, 72, 208), (240, 160, 240), (248, 240, 248), (168, 96, 232)),
                        half=(7.8, 6.8), cf=0.45, detail="helix", pulse=0.16, bulge=0.12, flare=0.45, charge=24,
                        burst=0.7, dim=(16, 0, 24, 72), shake=2, head=1.4, orb=1.0),
    "flash-cannon": dict(pal=P((56, 64, 96), (160, 168, 200), (224, 232, 240), (248, 248, 248), (200, 208, 232)),
                         half=(4.6, 4.2), cf=0.5, detail="rays", burst=0.7, streak="light"),
    "charge-beam": dict(pal=P((112, 80, 0), (240, 192, 24), (248, 240, 128), (248, 248, 232), (248, 224, 64)),
                        half=(2.8, 2.6), detail="bolts", burst=0.55),
    "core-enforcer": dict(pal=P((16, 72, 40), (64, 200, 120), (176, 248, 184), (240, 248, 240), (88, 224, 152)),
                          half=(3.8, 3.4), detail="rings", burst=0.7, dim=(0, 24, 8, 80)),
    "fleur-cannon": dict(pal=P((128, 32, 96), (240, 112, 176), (248, 192, 224), (248, 248, 248), (248, 152, 200)),
                         half=(5.2, 4.8), cf=0.46, detail="sparkle", flare=0.55, charge=24, burst=0.75),
    "prismatic-laser": dict(pal=P((48, 32, 96), (144, 104, 232), (216, 192, 248)), rainbow=RAINBOW,
                            half=(5.8, 5.2), cf=0.46, detail="sparkle", charge=26, burst=0.8, dim=(16, 8, 32, 96),
                            shake=1),
    "moongeist-beam": dict(pal=P((32, 16, 72), (120, 72, 208), (192, 160, 248), (240, 232, 248), (88, 56, 176)),
                           half=(4.6, 4.2), detail="rings", charge=24, burst=0.7, dim=(8, 0, 32, 120)),
    "dynamax-cannon": dict(pal=P((96, 8, 40), (232, 40, 88), (248, 152, 176), (248, 240, 240), (248, 88, 128)),
                           half=(5.6, 5.0), cf=0.45, detail="helix", charge=24, burst=0.8, dim=(32, 0, 16, 110),
                           shake=2),
    "eternabeam": dict(pal=P((80, 8, 32), (216, 32, 72), (248, 120, 136), (248, 232, 232), (184, 24, 56)),
                       half=(6.2, 5.6), cf=0.45, detail="helix", charge=26, burst=0.85, dim=(32, 0, 16, 130),
                       shake=2),
    "dragon-energy": dict(pal=P((80, 40, 8), (232, 144, 40), (248, 224, 120), (248, 248, 224), (200, 88, 216)),
                          half=(5.6, 5.0), cf=0.45, detail="helix", charge=24, burst=0.8, dim=(24, 8, 24, 100),
                          shake=1),
    "twin-beam": dict(pal=P((112, 24, 104), (232, 88, 184), (248, 176, 224), (248, 240, 248), (168, 104, 240)),
                      half=(1.8, 1.6), cf=0.45, twin=True, detail=None, bulge=0.15, burst=0.55),
    "armor-cannon": dict(pal=P((112, 24, 8), (232, 88, 24), (248, 184, 56), (248, 240, 168), (248, 120, 40)),
                         half=(3.2, 5.8), cf=0.40, detail="flames", noise=0.25, flare=0.4, charge=24, burst=0.8,
                         shake=1, streak="flame"),
    "fickle-beam": dict(pal=P((96, 48, 16), (224, 160, 64), (248, 232, 160), (248, 248, 232), (248, 200, 96)),
                        half=(4.0, 3.6), detail="rays", burst=0.65, streak="light"),
}
# Beam-archetype moves that are NOT a beam on screen (not drawn here; source "code" plays them unchanged):
NOT_BEAMS = {
    "fire-blast": "Gen 3: a fireball flies over, then the five-armed 'big' flame burst sits on the target",
    "spike-cannon": "physical volley of spikes (a projectile, several hits)",
    "zap-cannon": "an electric ball shot at the target (projectile)",
    "blast-burn": "a huge explosion on the target, not a ray",
    "frenzy-plant": "giant roots burst out of the ground under the target",
    "focus-blast": "a ball of energy (projectile)",
    "energy-ball": "a ball of energy (projectile)",
    "acid-spray": "a spray of acid blobs (projectile)",
    "psystrike": "psychic waves form around the target (burst)",
    "spectral-thief": "physical: the user's shadow strikes the target (contact)",
}


def style(move):
    return {**BASE, **STYLES[move["identifier"]]}


def handles(move):
    return move["identifier"] in STYLES


def timeline(move):
    """(charge, fire, hit) step counts of a code beam"""
    return style(move)["charge"], TRAVEL, HIT


def size_k(k):
    """thickness factor for a Pokémon k x the reference height: the beam follows the sizes gently"""
    return max(0.75, min(1.35, k ** 0.5))


def start_reach(move, ua):
    """how far a code beam reaches around its start point (GBA px), for vfx.beam_start, which puts the start IN FRONT
    of the user's mouth so the beam never covers the user (decisions.md §12, 2026-11-19):
    r0 = radius of the charge orb (with most of its late star spikes) / flared mouth end (nominal: the flicker,
    pulse and spike tips may touch the user's edge), w = half-width of the beam body per px along the beam (+1 px outline, the flare fading over the first
    7 px, twin beams counted together), ymax = lowest start y (the flared end must clear the text box)"""
    st = style(move)
    wu = min(MAX_HALF, st["half"][0] * size_k(ua))
    flared = wu * (1 + st["flare"])
    r0 = max(flared, min(ORB_MAX, flared * 1.1 * st["orb"]) * 1.35) + 1   # x 1.35: the late star's spikes
    twin = wu + 1.8 if st["twin"] else 0.0
    w = [wu * (1 + st["flare"] * max(0.0, 1 - u / 7)) * (1 + st["pulse"]) + twin + 1 for u in range(12)]
    return r0, w, TEXT_TOP - 3 - flared


def ease(t):
    t = max(0.0, min(1.0, t))
    return 0.5 - 0.5 * math.cos(math.pi * t)


def ease_out(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 2


def nz(x):
    """smooth noise in about -0.6..1 (flame tongues)"""
    return max(-0.6, 0.6 * math.sin(x) + 0.4 * math.sin(2.3 * x + 1.7))


# ---------------------------------------------------------------- pixel layer
class Pix:
    """a set of GBA-grid pixels {(x, y): rgb}; shapes are rasterised without anti-aliasing, outline() adds the
    1 px dark outline around everything drawn so far"""

    def __init__(self):
        self.p = {}

    def put(self, x, y, c):
        if -2 <= x < W + 2 and -2 <= y < H + 2:
            self.p[(x, y)] = c

    def sprite(self, rows, x, y, pal):
        h, w = len(rows), len(rows[0])
        x0, y0 = int(round(x - w / 2)), int(round(y - h / 2))
        if y0 + h + 1 > TEXT_TOP or y0 < 1 or x0 < 1 or x0 + w + 1 >= W:
            return                                       # small pieces are dropped whole, never cut by an edge
        for j, r in enumerate(rows):
            for i, ch in enumerate(r):
                if ch != ".":
                    self.put(x0 + i, y0 + j, pal[ch])

    def line(self, x0, y0, x1, y1, c):
        if max(y0, y1) + 2 > TEXT_TOP or min(y0, y1) < 1:
            return
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            t = i / max(1, n)
            self.put(int(math.floor(x0 + (x1 - x0) * t)), int(math.floor(y0 + (y1 - y0) * t)), c)

    def field(self, shapes, colour):
        """union of shapes: each shape.eval(x, y) -> (e px inside the edge, frac 0 centre..1 edge, cf, key) or None;
        the shape with the largest e wins; colour(e, frac, cf, key) -> rgb"""
        if not shapes:
            return
        x0 = max(0, int(min(s.box[0] for s in shapes)))
        y0 = max(0, int(min(s.box[1] for s in shapes)))
        x1 = min(W, int(max(s.box[2] for s in shapes)) + 1)
        y1 = min(H, int(max(s.box[3] for s in shapes)) + 1)
        for y in range(y0, y1):
            for x in range(x0, x1):
                best = None
                for s in shapes:
                    b = s.box
                    if b[0] <= x <= b[2] and b[1] <= y <= b[3]:
                        r = s.eval(x + 0.5, y + 0.5)
                        if r and r[0] > 0 and (best is None or r[0] > best[0]):
                            best = r
                if best:
                    self.p[(x, y)] = colour(*best)

    def outline(self, c):
        add = {(x + dx, y + dy) for (x, y) in self.p for dx, dy in N4} - self.p.keys()
        for q in add:
            self.p[q] = c
        return self

    def over(self, other):
        self.p.update(other.p)
        return self

    def image(self):
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        px = im.load()
        for (x, y), c in self.p.items():
            if 0 <= x < W and 0 <= y < H:
                px[x, y] = c + (255,)
        return im


# ---------------------------------------------------------------- shapes (evaluated per pixel centre)
class Blob:
    """a disc with optional spikes: r(θ) = r * (1 + amp * ((1 + cos(n θ + rot)) / 2) ** 4); squash < 1 flattens it"""

    def __init__(self, c, r, spikes=0, amp=0.0, rot=0.0, cf=0.5, squash=1.0, key=None):
        self.c, self.r, self.n, self.amp, self.rot, self.cf, self.sq, self.key = c, max(0.6, r), spikes, amp, rot, cf, squash, key
        R = self.r * (1 + amp) + 1
        self.box = (c[0] - R, c[1] - R, c[0] + R, c[1] + R)

    def eval(self, x, y):
        dx, dy = x - self.c[0], (y - self.c[1]) / self.sq
        d = math.hypot(dx, dy)
        r = self.r
        if self.n and self.amp:
            r *= 1 + self.amp * ((1 + math.cos(self.n * math.atan2(dy, dx) + self.rot)) / 2) ** 4
        return (r - d, d / r, self.cf, self.key)


class Ray:
    """the beam body from a (u = 0) to b, visible for u0 <= u <= u1, half-widths wp / wn (per integer u, above /
    below the axis), round caps at both visible ends"""

    def __init__(self, a, b, u0, u1, wp, wn, cf, key=None):
        self.a, self.cf, self.key = a, cf, key
        L = math.dist(a, b) or 1.0
        self.d = ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
        self.n = (-self.d[1], self.d[0])
        self.u0, self.u1, self.wp, self.wn = u0, u1, wp, wn
        p0 = (a[0] + self.d[0] * u0, a[1] + self.d[1] * u0)
        p1 = (a[0] + self.d[0] * u1, a[1] + self.d[1] * u1)
        R = max(max(wp), max(wn)) + 2
        self.box = (min(p0[0], p1[0]) - R, min(p0[1], p1[1]) - R, max(p0[0], p1[0]) + R, max(p0[1], p1[1]) + R)

    def w(self, u, v):
        arr = self.wp if v >= 0 else self.wn
        return arr[max(0, min(len(arr) - 1, int(u)))]

    def eval(self, x, y):
        rx, ry = x - self.a[0], y - self.a[1]
        u = rx * self.d[0] + ry * self.d[1]
        v = rx * self.n[0] + ry * self.n[1]
        if u < self.u0 or u > self.u1:
            ue = self.u0 if u < self.u0 else self.u1
            w = self.w(ue, v)
            dd = math.hypot(u - ue, v)
            return (w - dd, dd / max(w, 0.5), self.cf, (self.key, ue))
        w = self.w(u, v)
        return (w - abs(v), abs(v) / max(w, 0.5), self.cf, (self.key, u))


class Ring:
    """an ellipse ring across the beam at u = uc (psychic rings): along-axis radius ra, across radius rb"""

    def __init__(self, a, d, n, uc, ra, rb, key):
        self.c = (a[0] + d[0] * uc, a[1] + d[1] * uc)
        self.d, self.n, self.ra, self.rb, self.key, self.cf = d, n, ra, rb, key, 0.0
        R = max(ra, rb) + 1
        self.box = (self.c[0] - R, self.c[1] - R, self.c[0] + R, self.c[1] + R)

    def eval(self, x, y):
        rx, ry = x - self.c[0], y - self.c[1]
        u = rx * self.d[0] + ry * self.d[1]
        v = rx * self.n[0] + ry * self.n[1]
        q = math.sqrt((u / self.ra) ** 2 + (v / self.rb) ** 2)
        if 0.55 <= q <= 1.0:
            return (10.0, 1.0, 0.0, self.key)
        return None


# ---------------------------------------------------------------- detail sprites (outlined automatically)
SPR = {
    "flake": ["w.w.w", ".lwl.", "wwaww", ".lwl.", "w.w.w"],
    "flake7": ["...w...", ".w.w.w.", "..lwl..", "wwwawww", "..lwl..", ".w.w.w.", "...w..."],
    "orb5": [".lll.", "lwwwl", "lwwwl", "lwwwl", ".lll."],
    "orb5a": [".aaa.", "alwla", "awwwa", "alwla", ".aaa."],
    "shard": [".w.", "wlw", "wlw", "lal", ".a."],
    "spark": ["..w..", "..w..", "wwwww", "..w..", "..w.."],
    "spark3": [".w.", "www", ".w."],
    "flame": ["..m..", ".ml..", ".mlm.", "mlwlm", "mlwlm", ".mmm."],
    "flame_s": [".m.", "mlm", "mwm", ".m."],
    "drop": [".l.", "lwl", "lll", ".m."],
    "orb": [".l.", "lwl", ".l."],
    "orb_a": [".a.", "awa", ".a."],
    "bolt": ["...w.", "..w..", ".www.", "..w..", ".w..."],
    "bolt2": [".w...", "..w..", ".www.", "..w..", "...w."],
}


class Beam:
    """one code beam: user mouth `src` -> target body point `dst` (GBA px), sizes ua / ut (sprite height / 52),
    target sprite height t_h, timing (charge, fire, hit) steps"""

    def __init__(self, move, src, dst, ua, ut, t_h, timing, seed=1):
        self.m, self.st = move, style(move)
        self.pal = self.st["pal"]
        self.CAST, self.TRAVEL, self.HIT = timing
        self.hit0 = self.CAST + self.TRAVEL
        self.wu = min(MAX_HALF, self.st["half"][0] * size_k(ua))
        self.wt = min(MAX_HALF, self.st["half"][1] * size_k(ut))
        # a mouth low on the screen (big player Pokémon): lift the beam start so its flared end clears the text box
        src = (src[0], min(src[1], TEXT_TOP - 3 - self.wu * (1 + self.st["flare"])))
        dst = (dst[0], min(dst[1], TEXT_TOP - 3 - self.wt * self.st["head"] * 1.3))
        self.src, self.dst = src, dst
        self.t_h = t_h
        self.L = math.dist(src, dst) or 1.0
        self.rnd = random.Random(seed)
        self.seed = seed

    # ------------------------------------------------------------ hints for vfx.animate
    def shake(self, f):
        k = self.st["shake"]
        if not k or not (self.CAST <= f < self.hit0 + HOLD):
            return (0, 0)
        r = random.Random(self.seed * 1000 + f)
        return (r.choice((-k, k)), r.choice((-1, 1)) if k > 1 else 0)

    def dim(self, f):
        d = self.st["dim"]
        if not d:
            return None
        a0, a1 = self.CAST - 8, self.hit0 + HOLD + RETRACT
        if f < a0 or f >= a1 + 6:
            return None
        k = min(1.0, (f - a0) / 8) if f < a1 else 1 - (f - a1) / 6
        return d[:3] + (int(d[3] * max(0.0, k)),)

    # ------------------------------------------------------------ colours
    def colour(self, f):
        pal, rb = self.pal, self.st["rainbow"]

        def c(e, frac, cf, key):
            if isinstance(key, str):                     # detail rings: colour by name
                return pal[key]
            if frac < cf:
                return pal["w"]
            u = key[1] if isinstance(key, tuple) and key[1] is not None else 0
            edge = max(1.25, 0.22 * e / max(1e-3, 1 - frac))   # outer band: >= 1.25 px, ~22% of the half-width
            if rb:
                lt, md = rb[int((u - f * 3) / 7) % len(rb)]
                return snap(md) if e < edge else snap(lt)
            return pal["m"] if e < edge else pal["l"]
        return c

    # ------------------------------------------------------------ geometry
    def widths(self, f, shrink=1.0):
        st = self.st
        n = int(self.L) + 3
        pulse = 1 + st["pulse"] * math.sin(2 * math.pi * f / 4)
        wp, wn = [], []
        for iu in range(n):
            t = min(1.0, iu / self.L)
            w = (self.wu + (self.wt - self.wu) * t) * pulse * shrink
            w *= 1 + st["flare"] * max(0.0, 1 - iu / 7)
            w *= 1 + st["bulge"] * math.sin(2 * math.pi * (iu / 14 - f / 5))
            if st["noise"]:
                k = st["noise"] * min(1.0, 0.3 + t)
                wp.append(max(0.6, w * (1 + k * nz(iu * 0.33 - f * 1.2))))
                wn.append(max(0.6, w * (1 + k * nz(iu * 0.33 - f * 1.2 + 7.3))))
            else:
                wp.append(max(0.6, w)); wn.append(max(0.6, w))
        return wp, wn

    def at(self, u, v=0.0, a=None):
        a = a or self.src
        d = ((self.dst[0] - self.src[0]) / self.L, (self.dst[1] - self.src[1]) / self.L)
        n = (-d[1], d[0])
        return (a[0] + d[0] * u + n[0] * v, a[1] + d[1] * u + n[1] * v)

    # ------------------------------------------------------------ the 3 phases
    def draw(self, f, shake=(0, 0)):
        """[(layer name, 240 x 160 RGBA)] for step f"""
        if f < self.CAST:
            return [("cast", self.charge(f, shake).image())]
        h = f - self.hit0
        out = []
        body = None
        if h < HOLD + RETRACT:
            body = self.fire(f, shake)
            out.append(("effect", body.image()))
        if h >= 0:
            imp = self.impact(h, shake)
            if imp.p:
                out.append(("impact", imp.image()))
            if h < 2:                                    # white flash
                out.append(("flash", Image.new("RGBA", (W, H), (248, 248, 248, 150 if h == 0 else 70))))
        return out

    def charge(self, f, shake):
        st, pal = self.st, self.pal
        c = (self.src[0] + shake[0], self.src[1] + shake[1])
        t = (f + 1) / self.CAST
        rmax = min(ORB_MAX, self.wu * (1 + st["flare"]) * 1.1 * st["orb"], max(3.0, TEXT_TOP - 2 - c[1]))
        r = rmax * ease(min(1.0, t * 1.2)) + 0.6 * math.sin(f * 1.4)
        late = f >= self.CAST - 4
        layer = Pix()
        # streaks pulled into the orb
        streaks = Pix()
        n = 12 if st["streak"] == "light" else 9
        far = 10 + rmax * 2.2 + (10 if st["streak"] == "light" else 0)
        r_ = random.Random(self.seed)
        # pulled in from the front half only (toward the target): the user stands behind the orb and the streaks
        # must not cross its body (decisions.md §12: beams start in front of the mouth)
        fwd = math.atan2((self.dst[1] - self.src[1]) / 0.8, self.dst[0] - self.src[0])
        angs = [fwd + r_.uniform(-1.45, 1.45) for _ in range(n)]
        offs = [r_.randrange(0, 10) for _ in range(n)]
        if t < 0.92:
            for i in range(n):
                cyc = 9
                p = ((f + offs[i]) % cyc) / cyc
                d0 = r + 2 + (far - r) * (1 - p)
                a = angs[i] + 0.12 * math.sin(f * 0.15 + i)
                ca, sa = math.cos(a), math.sin(a) * 0.8
                if st["streak"] == "light":                # solar: sparkles of sunlight drifting in
                    streaks.sprite(SPR["spark3"] if p < 0.5 else ["w"], c[0] + d0 * ca, c[1] + d0 * sa, pal)
                elif st["streak"] == "flame":
                    streaks.sprite(SPR["flame_s"] if p < 0.6 else ["l"], c[0] + d0 * ca, c[1] + d0 * sa, pal)
                else:
                    ln = 2 + 3 * (1 - p)
                    streaks.line(c[0] + d0 * ca, c[1] + d0 * sa, c[0] + (d0 + ln) * ca, c[1] + (d0 + ln) * sa, pal["l"])
            streaks.outline(pal["o"])
        orb = Pix()
        orb.field([Blob(c, max(1.0, r), spikes=4 if late else 0, amp=0.7 if late else 0.0, rot=f * 0.6,
                        cf=0.55 if late else 0.45)], self.colour(f))
        orb.outline(pal["o"])
        return layer.over(streaks).over(orb)

    def fire(self, f, shake):
        st, pal = self.st, self.pal
        h = f - self.hit0
        a = (self.src[0] + shake[0], self.src[1] + shake[1])
        if st["shake"] >= 2:                               # Hyper Beam: the beam itself trembles
            j = random.Random(self.seed * 77 + f).choice((-1, 0, 1))
            a = self.at(0, j, a)
        if h < 0:                                          # the head runs from the mouth to the target
            u1 = self.L * ease_out((f - self.CAST + 1) / self.TRAVEL)
            u0, shrink = 0.0, 1.0
        elif h < HOLD:
            u0, u1, shrink = 0.0, self.L, 1.0
        else:                                              # retract: the tail runs to the target, the beam thins
            q = (h - HOLD + 1) / RETRACT
            u0, u1, shrink = self.L * ease(q), self.L, 1 - 0.55 * q
        wp, wn = self.widths(f, shrink)
        shapes = []
        offs = [0.0]
        if st["twin"]:
            g = self.wu + 1.8
            offs = [-g, g]
        for o in offs:
            a2, b2 = self.at(0, o, a), self.at(self.L, o, a)
            shapes.append(Ray(a2, b2, u0, u1, wp, wn, st["cf"]))
            if u0 < 2:                                     # flared, flickering mouth end
                shapes.append(Blob(a2, wp[0] * (1.05 + 0.12 * math.sin(f * 1.9)), spikes=5, amp=0.35, rot=f * 0.7,
                                   cf=0.5, key=(None, 0)))
            hp = self.at(u1, o, a)
            if h < 0:                                      # bright head while travelling
                shapes.append(Blob(hp, wp[min(len(wp) - 1, int(u1))] * st["head"] * shrink, cf=0.6, key=(None, u1)))
            else:                                          # spiky head where it meets the target
                rh = self.wt * st["head"] * shrink * (1.1 + 0.18 * math.sin(f * 1.7))
                shapes.append(Blob(hp, rh, spikes=7, amp=0.55, rot=f * 0.5, cf=0.58, key=(None, u1)))
        body = Pix()
        body.field(shapes, self.colour(f))
        body.outline(pal["o"])
        det = self.details(f, a, u0, u1, wp, shrink)
        return body.over(det)

    def details(self, f, a, u0, u1, wp, shrink):
        """per-move detail travelling along the visible beam [u0, u1]"""
        st, pal, kind = self.st, self.pal, self.st["detail"]
        lay = Pix()
        w = lambda u: wp[max(0, min(len(wp) - 1, int(u)))]
        lo, hi = u0 + 3, u1 - 3
        if not kind or hi <= lo:
            return lay
        if kind == "rings":                                # psychic rings across the beam, travelling forward
            d = ((self.dst[0] - self.src[0]) / self.L, (self.dst[1] - self.src[1]) / self.L)
            n = (-d[1], d[0])
            rings = []
            for i in range(12):
                uc = (i * 16 + f * 4) % (self.L + 16)
                if lo <= uc <= hi:
                    rings.append(Ring(a, d, n, uc, 2.8, w(uc) * 2.2 + 2.0, ("l", "a", "m")[i % 3]))
            lay.field(rings, self.colour(f))
            return lay.outline(pal["o"])
        if kind == "helix":                                # two strands of energy orbs spiralling round the beam
            big = w(self.L / 2) > 4.5
            step = 10 if big else 6
            for i in range(0, int(self.L) + step * 2, step):
                u = (i + f * 5) % (self.L + step * 2)
                if lo <= u <= hi:
                    for k, ph in ((0, 0.0), (1, math.pi)):
                        v = (w(u) + (3.0 if big else 2.2)) * math.sin(u / 7 - f * 0.9 + ph)
                        spr = ("orb5" if k == 0 else "orb5a") if big else ("orb" if k == 0 else "orb_a")
                        lay.sprite(SPR[spr], *self.at(u, v, a), pal)
            return lay.outline(pal["o"])
        if kind == "ice":                                  # ice crystals and snowflakes riding the beam
            for i in range(8):                             # big snowflakes riding ON the beam
                u = (i * 19 + f * 5) % (self.L + 19)
                if lo + 2 <= u <= hi:
                    v = (1 if i % 2 else -1) * w(u) * 0.35
                    lay.sprite(SPR["flake7"] if (i + f // 3) % 2 == 0 else SPR["flake"], *self.at(u, v, a), pal)
            for i in range(10):                            # ice shards glittering along the edges
                u = (i * 13 + 6 + f * 7) % (self.L + 13)
                if lo <= u <= hi:
                    side = 1 if i % 2 else -1
                    lay.sprite(SPR["shard"], *self.at(u, side * (w(u) + 2.5 + (i % 3)), a), pal)
            return lay.outline(pal["o"])
        if kind == "rays":                                 # sun rays: light streaks racing along the beam + sparkles
            inner = Pix()                                  # golden streaks inside the beam (no outline)
            for i in range(10):
                u = (i * 17 + f * 8) % (self.L + 17)
                v = (0.66 if i % 2 else -0.66) * w(u)
                if lo <= u and u + 6 <= hi:
                    inner.line(*self.at(u, v, a), *self.at(u + 6, v, a), pal["a"])
            rays = Pix()                                   # short rays shooting out of the edges, flickering
            r = random.Random(self.seed * 13 + f // 2)
            for i in range(4):
                u = r.uniform(lo + 4, hi)
                side = r.choice((-1, 1))
                ln = r.randint(3, 6)
                p0 = self.at(u, side * (w(u) + 2), a)
                p1 = self.at(u + ln * 0.6, side * (w(u) + 2 + ln), a)
                rays.line(*p0, *p1, pal["a"])
            for i in range(6):
                u = (i * 23 + f * 4) % (self.L + 23)
                if lo <= u <= hi:
                    side = 1 if i % 2 else -1
                    rays.sprite(SPR["spark"] if (f + i) % 4 < 2 else SPR["spark3"],
                                *self.at(u, side * (w(u) + 4 + (i % 3) * 2), a), pal)
            rays.outline(pal["o"])
            return inner.over(rays)
        if kind == "flames":                               # flame tongues licking off the stream, rising
            for i in range(10):
                u = (i * 11 + f * 3) % (self.L + 11)
                if lo + 4 <= u <= hi:
                    side = 1 if i % 2 else -1
                    age = ((f + i * 3) % 6) / 6
                    x, y = self.at(u, side * (w(u) * 0.9 + 1), a)
                    lay.sprite(SPR["flame"] if u > self.L * 0.4 else SPR["flame_s"], x, y - 2 - age * 4, pal)
            return lay.outline(pal["o"])
        if kind == "drops":                                # water spray flying off the jet
            for i in range(12):
                u = (i * 9 + f * 5) % (self.L + 9)
                if lo + 4 <= u <= hi:
                    side = 1 if i % 2 else -1
                    age = ((f + i * 2) % 5) / 5
                    lay.sprite(SPR["drop"] if i % 3 else SPR["orb"], *self.at(u, side * (w(u) + 2 + age * 6), a), pal)
            return lay.outline(pal["o"])
        if kind == "sparkle":
            for i in range(7):
                u = (i * 19 + f * 4) % (self.L + 19)
                if lo <= u <= hi:
                    side = 1 if i % 2 else -1
                    lay.sprite(SPR["spark"] if (f + i) % 4 < 2 else SPR["spark3"],
                               *self.at(u, side * (w(u) + 3 + (i % 2) * 2), a), pal)
            return lay.outline(pal["o"])
        if kind == "bolts":                                # little zigzag sparks jumping round the beam
            r = random.Random(self.seed * 31 + f)
            for i in range(6):
                u = r.uniform(lo, hi)
                side = r.choice((-1, 1))
                lay.sprite(SPR["bolt"] if r.random() < 0.5 else SPR["bolt2"], *self.at(u, side * (w(u) + 3), a), pal)
            return lay.outline(pal["o"])
        return lay

    def impact(self, h, shake):
        """radial burst on the target: a big star when the beam lands, particles flying out when it ends"""
        st, pal = self.st, self.pal
        c = (self.dst[0] + shake[0], self.dst[1] + shake[1])
        lay = Pix()
        Rb = max(8.0, min(26.0, self.t_h * st["burst"] * 0.75))
        Rb = max(6.0, min(Rb, (TEXT_TOP - 2 - c[1]) / (0.62 * 1.65)))   # the star tips stay above the text box
        if h < 7:                                          # the landing burst
            R = Rb * (0.55 + 0.45 * ease_out(h / 2)) if h < 3 else Rb * (1 - 0.12 * (h - 2))
            lay.field([Blob(c, R * 0.55, spikes=8, amp=0.65, rot=h * 0.35, cf=0.55, key=(None, 0))], self.colour(h))
            lay.outline(pal["o"])
        start = HOLD - 3
        if h >= start:                                     # the last burst: particles flying out
            k = h - start
            if k < 6:
                core = Pix()
                core.field([Blob(c, Rb * (0.62 - 0.08 * k), spikes=8, amp=0.6, rot=k * 0.4, cf=0.58, key=(None, 0))],
                           self.colour(h))
                lay.over(core.outline(pal["o"]))
            parts = Pix()
            n = 10
            spr = {"ice": "flake", "rays": "spark", "flames": "flame_s", "drops": "drop", "sparkle": "spark",
                   "bolts": "bolt"}.get(st["detail"], "orb")
            for i in range(n):
                ang = i * 2 * math.pi / n + 0.3
                rr = Rb * 0.4 + k * 2.4
                if k < 14:
                    parts.sprite(SPR[spr] if k < 9 else SPR["orb"] if k < 12 else ["l"],
                                 c[0] + rr * math.cos(ang), c[1] + rr * 0.8 * math.sin(ang) - (k * 0.3 if spr == "flame_s" else 0), pal)
            lay.over(parts.outline(pal["o"]))
        return lay


# ---------------------------------------------------------------- strips for the move viewer ("2 images" panel)
def _fit(frames, k=2, keep_x=False):
    """crop GBA-px frames to one square around everything drawn (3 px to spare; beam pieces may run off left /
    right, like agy's beam travel frames) and scale them k x: never a cut drawing, the cell grows instead"""
    boxes = [f.getbbox() for f in frames if f.getbbox()]
    if not boxes:
        return [Image.new("RGBA", (96, 96), (0, 0, 0, 0)) for _ in frames]
    x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
    x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    side = max(48, int(max(x1 - x0, y1 - y0)) + 6)
    if keep_x:
        side = max(48, int(y1 - y0) + 6)
    box = (int(cx - side / 2), int(cy - side / 2), int(cx - side / 2) + side, int(cy - side / 2) + side)
    return [f.crop(box).resize((side * k, side * k), Image.NEAREST) for f in frames]


def strips(move):
    """(cast frames, effect frames), 8 each, drawn by this module at GBA px x 2: the charge orb (cast); a piece of the
    beam (effect 1-4) and the hit burst (5-8). Only for showing the move; vfx.animate draws code beams on the
    battle screen directly. Cells are >= 96 px and grow so nothing is cut."""
    tl = timeline(move)
    c = (120.0, 60.0)
    bm = Beam(move, c, (c[0] + 60, c[1]), 0.9, 0.9, 30, tl)
    cast = [bm.charge(max(0, int((i + 1) / 8 * tl[0]) - 1), (0, 0)).image() for i in range(8)]
    bm.src, bm.dst = (c[0] - 60, c[1]), (c[0] + 60, c[1])
    bm.L = math.dist(bm.src, bm.dst)
    travel = [bm.fire(bm.hit0 + 2 + i, (0, 0)).image().crop((int(c[0]) - 24, 0, int(c[0]) + 24, H)) for i in range(4)]
    travel = [_pad(t) for t in travel]
    bm.dst = c
    hit = [bm.impact(h, (0, 0)).image() for h in (0, 2, HOLD - 2, HOLD + 3)]
    eff = _fit(travel, keep_x=True)
    side = eff[0].height
    hit = _fit(hit)
    if hit[0].height > side:                         # one cell size per strip
        eff = [_square(t, hit[0].height) for t in eff]
    else:
        hit = [_square(t, side) for t in hit]
    return _fit(cast), eff + hit


def _pad(img):
    """a 48 px wide slice of the beam on a full-height canvas, so _fit can crop it square around the beam"""
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.paste(img, (W // 2 - img.width // 2, 0))
    return out


def _square(img, side):
    out = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    out.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return out
