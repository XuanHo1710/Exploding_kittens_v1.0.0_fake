#!/usr/bin/env python3
"""
Turn the upstream project's move effects into Mons move strips (the same 2 x 8-frame format agy draws, see
normalize_move.py). Upstream project, version and licence (MPL-2.0): THIRD_PARTY_NOTICES.md.

The upstream data describes a move effect as (<ns> = its asset namespace, detected from the checkout)
  data/<ns>/action_effects/moves/<move>.json      the timeline: which particle effect plays on the user / target,
                                                   on which locator, after which pauses (+ sounds, animations)
  assets/<ns>/bedrock/particles/**/*.particle.json Bedrock "Snowstorm" particle effects (emitters, particles,
                                                   Molang expressions, flipbook textures, tint gradients)
  assets/<ns>/textures/particle/**.png             the particle textures ("textures/particles/x" -> "particle/x.png")
A move without its own action effect plays `generic_move` (MoveInstruction.kt): the user's own animation, then
`impact_<type>` + `hit` on the target for damaging moves (Knock Off is one of them).

This script is our own small re-implementation (no upstream code): a safe Molang subset evaluator, a fixed-step 3D
emitter / particle simulation, an orthographic camera like the Gen 3 battle view (side-on, ~25 degrees from above, the
user bottom-left facing the target top-right) and a billboard rasteriser with nearest-neighbour texture mapping.
The frames are framed into 96 px cells (never cut: fitted, or a bigger cell, see finish()), alpha is cut to 0 / 255, the strip is reduced to <= 15 colours (Gen 3) and
gets an optional 1 px dark outline. Which particles go in which strip:
  cast   = particles on the user that stay on the user (effects that do not read target_delta / target_distance)
  effect = archetype-driven (vfx.py): `fall` -> frames 1-4 the target-side particles still in the air (camera follows
           them), 5-8 the landing; `beam` / `projectile` -> 1-4 the user-side particles that reach toward the target
           (a beam segment seen side-on; a spray such as Flamethrower: the particles over that segment, with a wider
           impact window), 5-8 the target side; `buff` / `heal` / `field` (self moves, vfx.py plays only the effect
           strip, on the user) -> 8 frames of the user side; everything else -> 8 frames of the target side.
Gaps filled (2026-11-20, all upstream move effects official): a travelling move whose particles do not read the target
(a powder / sand spray thrown forward) uses the user's particles that have left it as the travel frames; a move with
nothing on the target uses the user's particles arriving there (Leech Seed's seeds); a self burst (Explosion,
Self-Destruct: nothing on the target) splits the user side in time, the gathering = cast, the last effects (the
boom) = effect; a `fall` move leaves a cloud parked high in the sky (Thunder's storm cloud) out of its falling frames.
Texture paths follow the upstream reader (".png", every "particles/" and "textures/" and the namespace dropped).
Still empty by design: images where upstream itself shows nothing (Growl, Tail Whip's target, most casts).
A `<id>-vfx.json` next to the strips keeps the upstream world size relative to the Pokémon (1 block = the Pokémon's
height, clamped), so vfx.py scales the strips like the upstream game does.

Output: assets/skills/Fallback/<GenX-Region>/<English name>/<id>-cast.png, <id>-effect.png, <id>-vfx.json (rendered from
the upstream MPL-2.0 textures: see assets/skills/Fallback/README.md; never the agy folders assets/skills/Gen*/), and
tmp/fallback-vfx/<GenX-Region>/<English name>/<id>-source.json (what was converted, sample times, warnings).
apply_official.py makes them the official images of every move that has one (vfx.official_plan: a usable Fallback
version wins over agy and procedural, user 2026-11-20), per image unless they are blank or
assets/skills/Fallback/approved.json marks them false (after a rebuild, look at the --sheet contact sheets and mark empty or
clearly broken images false). MONS_VFX_SOURCE=fallback / battle_preview.py --source fallback forces all of them; the
move viewer calls them "Fallback".

usage:
  python3 fallback_vfx.py --move eruption --move earthquake --move knock-off --move ice-beam
  python3 fallback_vfx.py --list                      # Mons moves with their own upstream effect
  python3 fallback_vfx.py --move eruption --sheet     # + a big contact sheet of both strips (tmp/fallback-vfx/sheets/)
  python3 fallback_vfx.py --all                       # every Mons move that has an upstream action effect (~30 s)
  python3 fallback_vfx.py --generic                   # every damaging move without one: the generic type impact
                                                      # (upstream generic_move; listed in assets/skills/Fallback/generic.json)
Env MONS_REFERENCE_SRC = the upstream checkout (its root, or its common/src/main/resources); no default
(tools/README.md). The asset namespace is detected from it.
"""
import argparse
import glob
import json
import math
import os
import random
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vfx  # noqa: E402
from vfx import Image  # noqa: E402



def _resources(root):
    """the upstream checkout (root or common/src/main/resources) -> its resources folder ("" when not set)"""
    if not root:
        return ""
    sub = os.path.join(root, "common", "src", "main", "resources")
    return sub if os.path.isdir(sub) else root


def _namespace(res):
    """the upstream asset namespace: the assets/<ns>/ folder that has bedrock/particles/"""
    base = os.path.join(res, "assets")
    if not res or not os.path.isdir(base):
        return ""
    return next((ns for ns in sorted(os.listdir(base)) if os.path.isdir(os.path.join(base, ns, "bedrock", "particles"))), "")


SRC = _resources(os.environ.get("MONS_REFERENCE_SRC", ""))
NS = _namespace(SRC)


def need_src():
    """stop with a clear message when the upstream checkout is not configured (only the converting steps need it)"""
    if not NS:
        sys.exit("fallback_vfx: set MONS_REFERENCE_SRC to the upstream checkout (THIRD_PARTY_NOTICES.md, tools/README.md); "
                 f"got {SRC or 'nothing'}")
    return SRC
OUT = vfx.FALLBACK_DIR                                   # the strips + -vfx.json: assets/skills/Fallback/<Gen>/<Name>/
META = os.path.join(vfx.REPO, "tmp", "fallback-vfx")    # <id>-source.json (what was converted) + sheets/, never in assets/skills/
C = vfx.CAST_CELL
# Mons move -> upstream effect when upstream has none of its own but a close one (user decision: Earthquake = Bulldoze)
BORROW = {"earthquake": "bulldoze", "hyper-beam": "icebeam", "wing-attack": "aerialace"}
# a borrowed effect recoloured to the move's own colours: luminance -> ramp (dark outline pixels kept)
RECOLOR = {"hyper-beam": [(150, 40, 0), (225, 85, 20), (250, 135, 30), (255, 185, 60), (255, 230, 150)]}


def recolor(strip, ramp):
    """map every opaque, non-outline pixel by its brightness onto `ramp` (dark -> light)"""
    px = strip.load()
    for y in range(strip.height):
        for x in range(strip.width):
            r, g, b, a = px[x, y]
            if a == 0 or max(r, g, b) < 48:          # transparent or the 1 px dark outline
                continue
            t = (0.3 * r + 0.59 * g + 0.11 * b) / 255 * (len(ramp) - 1)
            i = min(len(ramp) - 2, int(t))
            f = t - i
            c = [round(ramp[i][k] + (ramp[i + 1][k] - ramp[i][k]) * f) for k in range(3)]
            px[x, y] = (c[0], c[1], c[2], a)
    return strip


# ====================================================================== Molang (safe subset, compiled to closures)
class MolangError(Exception):
    pass


_TOK = re.compile(r"\s*(?:(\d+\.\d*|\.\d+|\d+)[fF]?|([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)|"
                  r"'([^']*)'|(&&|\|\||==|!=|<=|>=|\?\?|->|[-+*/!<>?:;,(){}\[\]=]))")
_ALIAS = {"variable": "v", "query": "q", "temp": "t", "context": "c"}


def norm(name):
    head, _, rest = name.partition(".")
    head = _ALIAS.get(head.lower(), head.lower())
    return f"{head}.{rest.lower()}" if rest else head


def _tokens(src):
    out, i = [], 0
    src = src.strip()
    while i < len(src):
        m = _TOK.match(src, i)
        if not m or m.end() == i:
            if src[i:].strip() == "":
                break
            raise MolangError(f"bad token at {src[i:i + 12]!r}")
        i = m.end()
        num, name, s, op = m.groups()
        out.append(("n", float(num)) if num is not None else ("id", name) if name is not None else
                   ("s", s) if s is not None else ("op", op))
    return out


def _deg(f):
    return lambda a: f(math.radians(a))


def _round(x):
    return math.floor(x + 0.5)


MATH = {
    "sin": _deg(math.sin), "cos": _deg(math.cos),
    "asin": lambda a: math.degrees(math.asin(max(-1, min(1, a)))), "acos": lambda a: math.degrees(math.acos(max(-1, min(1, a)))),
    "atan": lambda a: math.degrees(math.atan(a)), "atan2": lambda y, x: math.degrees(math.atan2(y, x)),
    "abs": abs, "ceil": math.ceil, "floor": math.floor, "round": _round, "trunc": math.trunc,
    "sqrt": lambda a: math.sqrt(max(0.0, a)), "exp": math.exp, "ln": lambda a: math.log(a) if a > 0 else 0.0,
    "pow": lambda a, b: math.pow(a, b) if a >= 0 or float(b).is_integer() else 0.0,
    "fmod": lambda a, b: math.fmod(a, b) if b else 0.0, "min": min, "max": max,
    "clamp": lambda v, lo, hi: max(lo, min(hi, v)), "lerp": lambda a, b, t: a + (b - a) * t,
    "lerprotate": lambda a, b, t: a + (((b - a + 180) % 360) - 180) * t,
    "hermite_blend": lambda t: 3 * t * t - 2 * t * t * t, "sign": lambda a: (a > 0) - (a < 0),
    "min_angle": lambda a: ((a + 180) % 360) - 180,
}
RANDOM = {"random", "random_integer", "die_roll", "die_roll_integer"}


class _Parser:
    def __init__(self, src):
        self.t, self.i = _tokens(src), 0

    def peek(self, k=0):
        return self.t[self.i + k] if self.i + k < len(self.t) else ("end", None)

    def op(self, *ops):
        tk = self.peek()
        if tk[0] == "op" and tk[1] in ops:
            self.i += 1
            return tk[1]
        return None

    def need(self, o):
        if not self.op(o):
            raise MolangError(f"expected {o!r}, got {self.peek()!r}")

    def program(self):
        stmts = []
        while self.peek()[0] != "end" and not (self.peek()[0] == "op" and self.peek()[1] == "}"):
            if self.op(";") or self.op(")", ","):   # stray ')' / ',' : the upstream parser tolerates them, so do we
                continue
            stmts.append(self.statement())
        return ("prog", stmts)

    def statement(self):
        tk = self.peek()
        if tk == ("id", "return"):
            self.i += 1
            return ("ret", self.expr())
        if tk[0] == "id" and tk[1].lower() in ("loop", "for_each", "break", "continue"):
            raise MolangError(f"unsupported Molang statement {tk[1]}")
        return self.expr()

    def expr(self):
        left = self.ternary()
        if self.op("="):
            if left[0] != "var":
                raise MolangError("assignment to a non-variable")
            return ("set", left[1], self.expr())
        return left

    def ternary(self):
        c = self.coalesce()
        if self.op("?"):
            a = self.ternary()
            b = self.ternary() if self.op(":") else ("num", 0.0)
            return ("?:", c, a, b)
        return c

    def _bin(self, nxt, ops):
        left = nxt()
        while True:
            o = self.op(*ops)
            if not o:
                return left
            left = ("bin", o, left, nxt())

    def coalesce(self):
        return self._bin(self.orr, ("??",))

    def orr(self):
        return self._bin(self.andd, ("||",))

    def andd(self):
        return self._bin(self.eq, ("&&",))

    def eq(self):
        return self._bin(self.rel, ("==", "!="))

    def rel(self):
        return self._bin(self.add, ("<", "<=", ">", ">="))

    def add(self):
        return self._bin(self.mul, ("+", "-"))

    def mul(self):
        return self._bin(self.unary, ("*", "/"))

    def unary(self):
        o = self.op("-", "!", "+")
        if o:
            return ("un", o, self.unary())
        return self.primary()

    def primary(self):
        tk = self.peek()
        self.i += 1
        if tk[0] == "n":
            return ("num", tk[1])
        if tk[0] == "s":
            return ("str", tk[1])
        if tk == ("op", "("):
            e = self.expr()
            self.need(")")
            return e
        if tk == ("op", "{"):
            p = self.program()
            self.need("}")
            return p
        if tk[0] == "id":
            low = tk[1].lower()
            if low in ("true", "false"):
                return ("num", 1.0 if low == "true" else 0.0)
            if low == "this":
                return ("num", 0.0)
            name = norm(tk[1])
            if self.op("("):
                args = []
                if not self.op(")"):
                    while True:
                        args.append(self.expr())
                        if self.op(")"):
                            break
                        self.need(",")
                return ("call", name, args)
            if self.op("["):
                self.expr()
                self.need("]")
                return ("num", 0.0)     # arrays: not used by the move effects
            return ("var", name)
        raise MolangError(f"unexpected {tk!r}")


def _num(x):
    return x if isinstance(x, (int, float)) else (1.0 if x else 0.0) if not isinstance(x, str) else 0.0


def _compile(node):
    k = node[0]
    if k == "num":
        v = node[1]
        return lambda e: v
    if k == "str":
        v = node[1]
        return lambda e: v
    if k == "var":
        n = node[1]
        if n == "math.pi":
            return lambda e: math.pi
        return lambda e: e.get(n)
    if k == "set":
        n, f = node[1], _compile(node[2])

        def _set(e):
            v = f(e)
            e.set(n, v)
            return v
        return _set
    if k == "?:":
        c, a, b = (_compile(x) for x in node[1:])
        return lambda e: a(e) if _num(c(e)) != 0 else b(e)
    if k == "un":
        f = _compile(node[2])
        return {"-": lambda e: -_num(f(e)), "+": lambda e: _num(f(e)), "!": lambda e: 0.0 if _num(f(e)) else 1.0}[node[1]]
    if k == "bin":
        o, a, b = node[1], _compile(node[2]), _compile(node[3])
        if o == "+":
            def _add(e):
                x, y = a(e), b(e)
                return x + y if isinstance(x, str) and isinstance(y, str) else \
                    (str(x) + str(y) if isinstance(x, str) or isinstance(y, str) else x + y)
            return _add
        ops = {"-": lambda x, y: _num(x) - _num(y), "*": lambda x, y: _num(x) * _num(y),
               "/": lambda x, y: _num(x) / _num(y) if _num(y) else 0.0,
               "<": lambda x, y: float(x < y), "<=": lambda x, y: float(x <= y), ">": lambda x, y: float(x > y),
               ">=": lambda x, y: float(x >= y), "==": lambda x, y: float(x == y), "!=": lambda x, y: float(x != y)}
        if o == "&&":
            return lambda e: 1.0 if _num(a(e)) and _num(b(e)) else 0.0
        if o == "||":
            return lambda e: 1.0 if _num(a(e)) or _num(b(e)) else 0.0
        if o == "??":
            return lambda e: a(e) if a(e) is not None else b(e)
        f = ops[o]
        return lambda e: f(a(e), b(e))
    if k == "call":
        name, args = node[1], [_compile(x) for x in node[2]]
        head, _, fn = name.partition(".")
        if head == "math":
            if fn in RANDOM:
                def _rand(e, fn=fn):
                    v = [_num(x(e)) for x in args]
                    r = e.rng
                    if fn == "random":
                        return v[0] + (v[1] - v[0]) * r.random()
                    if fn == "random_integer":
                        return float(r.randint(int(round(min(v[:2]))), int(round(max(v[:2])))))
                    n = int(v[0])
                    s = sum(v[1] + (v[2] - v[1]) * r.random() for _ in range(n))
                    return float(round(s)) if fn == "die_roll_integer" else s
                return _rand
            f = MATH.get(fn) or MATH.get("f" + fn) or (lambda *a: 0.0)   # math.<x> -> the C-style f<x> (modulo)
            return lambda e: float(f(*[_num(x(e)) for x in args]))
        return lambda e: e.query(name, [x(e) for x in args])
    if k == "ret":
        f = _compile(node[1])
        return lambda e: ("__ret__", f(e))
    if k == "prog":
        fs = [_compile(x) for x in node[1]]
        if len(fs) == 1 and node[1][0][0] not in ("ret",):
            return fs[0]

        def _prog(e):
            for f in fs:
                v = f(e)
                if isinstance(v, tuple) and v and v[0] == "__ret__":
                    return v[1]
            return 0.0
        return _prog
    raise MolangError(f"unknown node {k}")


_CACHE = {}
WARN = set()


def molang(src):
    """compile a Molang string / number / bool once; returns f(env) -> float | str"""
    if isinstance(src, bool):
        v = 1.0 if src else 0.0
        return lambda e: v
    if isinstance(src, (int, float)):
        v = float(src)
        return lambda e: v
    if src not in _CACHE:
        try:
            f = _compile(_Parser(src).program())
        except MolangError as err:
            WARN.add(f"Molang skipped ({err}): {src[:60]}")
            f = lambda e: 0.0  # noqa: E731
        _CACHE[src] = f
    return _CACHE[src]


def ev(src, env, default=0.0):
    if src is None:
        return default
    if isinstance(src, (list, tuple)):
        return [_num(molang(s)(env)) for s in src]
    v = molang(src)(env)
    return v


def evn(src, env, default=0.0):
    return _num(ev(src, env, default)) if src is not None else default


# ====================================================================== vectors
def add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def mul(a, k): return (a[0] * k, a[1] * k, a[2] * k)
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def length(a): return math.sqrt(dot(a, a))


def unit(a):
    n = length(a)
    return mul(a, 1 / n) if n > 1e-9 else (0.0, 0.0, 0.0)


def basis_facing(fwd):
    """local frame of a model facing `fwd` (horizontal): Bedrock models look toward local -z"""
    z = unit((-fwd[0], 0.0, -fwd[2]))
    y = (0.0, 1.0, 0.0)
    x = cross(y, z)
    return (x, y, z)


def to_world(basis, v):
    x, y, z = basis
    return (x[0] * v[0] + y[0] * v[1] + z[0] * v[2], x[1] * v[0] + y[1] * v[1] + z[1] * v[2],
            x[2] * v[0] + y[2] * v[1] + z[2] * v[2])


def to_local(basis, v):
    return (dot(basis[0], v), dot(basis[1], v), dot(basis[2], v))


# ====================================================================== effects (particle JSON)
_INDEX = None
_TEX = {}


def effect_index():
    global _INDEX
    if _INDEX is None:
        _INDEX = {}
        for p in glob.glob(os.path.join(need_src(), "assets", NS, "bedrock", "particles", "**", "*.json"), recursive=True):
            try:
                ident = json.load(open(p, encoding="utf-8"))["particle_effect"]["description"]["identifier"]
            except (ValueError, KeyError):
                continue
            _INDEX[ident] = p
    return _INDEX


class Effect:
    _cache = {}

    @classmethod
    def get(cls, ident):
        ident = ident if ":" in ident else f"{NS}:{ident}"
        if ident not in cls._cache:
            p = effect_index().get(ident)
            cls._cache[ident] = cls(json.load(open(p, encoding="utf-8")), p) if p else None
            if not p:
                WARN.add(f"particle effect {ident} not found")
        return cls._cache[ident]

    def __init__(self, data, path):
        pe = data["particle_effect"]
        d = pe["description"]
        self.id, self.path = d["identifier"], path
        brp = d.get("basic_render_parameters", {})
        self.material = brp.get("material", "particles_alpha")
        self.texture = brp.get("texture", "")
        self.curves = {norm(k)[2:]: v for k, v in pe.get("curves", {}).items()}
        self.events = pe.get("events", {})
        self.c = {k.split(":", 1)[-1]: v for k, v in pe.get("components", {}).items()}
        known = {"emitter_initialization", "emitter_local_space", "emitter_rate_instant", "emitter_rate_steady",
                 "emitter_rate_manual", "emitter_lifetime_once", "emitter_lifetime_looping", "emitter_lifetime_expression",
                 "emitter_lifetime_events", "emitter_shape_point", "emitter_shape_sphere", "emitter_shape_box",
                 "emitter_shape_disc", "emitter_shape_custom", "emitter_shape_entity_aabb", "particle_initial_speed",
                 "particle_initial_spin", "particle_lifetime_expression", "particle_lifetime_events",
                 "particle_motion_dynamic", "particle_motion_parametric", "particle_motion_collision",
                 "particle_appearance_billboard", "particle_appearance_tinting", "particle_appearance_lighting",
                 "particle_initialization", "emitter_space", "particle_kill_plane", "particle_expire_if_in_blocks",
                 "particle_expire_if_not_in_blocks"}
        for k in self.c:
            if k not in known:
                WARN.add(f"component {k} ignored ({self.id})")
        self.reaching = any(re.search(r"target_(delta|distance)", json.dumps(v)) for k, v in self.c.items()
                            if k != "emitter_initialization")
        self.invisible = self.texture.endswith("invisible") or "particle_appearance_billboard" not in self.c

    def tex(self):
        if self.texture not in _TEX:
            # the upstream reader's rule: drop ".png", every "particles/" and "textures/", and the namespace; the rest
            # is a sprite of the particle atlas (textures/particle/<rel>.png). So "textures/textures/moves/x" and
            # "textures/particles/moves/x" are the same sprite; a leading "particle/" is tolerated too.
            rel = self.texture.split(":", 1)[-1]
            rel = (rel[:-4] if rel.endswith(".png") else rel).replace("particles/", "").replace("textures/", "")
            base = os.path.join(need_src(), "assets", NS, "textures", "particle")
            cands = [rel] + ([rel[len("particle/"):]] if rel.startswith("particle/") else [])
            p = next((os.path.join(base, r + ".png") for r in cands if os.path.isfile(os.path.join(base, r + ".png"))), None)
            if p:
                _TEX[self.texture] = Image.open(p).convert("RGBA")
            elif re.search(r"(^|/)wool_colored_white$", rel):
                _TEX[self.texture] = Image.new("RGBA", (16, 16), (255, 255, 255, 255))   # a base-game white block
                WARN.add(f"texture {self.texture} is a base-game texture: drawn plain white")
            else:
                _TEX[self.texture] = None
                WARN.add(f"texture {self.texture} not found")
        return _TEX[self.texture]


def curve_value(cv, env):
    typ = cv.get("type", "linear")
    nodes = cv.get("nodes", [])
    x = evn(cv.get("input", 0), env)
    rng_ = evn(cv.get("horizontal_range", 1), env, 1.0) or 1.0
    t = max(0.0, min(1.0, x / rng_))
    if isinstance(nodes, dict):          # bezier_chain: {time: {value | left/right_value}} -> linear between keys
        keys = sorted((float(k), v) for k, v in nodes.items())
        vals = [(k, evn(v.get("value", v.get("right_value", 0)), env)) for k, v in keys]
        if not vals:
            return 0.0
        if x <= vals[0][0]:
            return vals[0][1]
        for (k0, v0), (k1, v1) in zip(vals, vals[1:]):
            if x <= k1:
                return v0 + (v1 - v0) * (x - k0) / ((k1 - k0) or 1)
        return vals[-1][1]
    ns = [evn(n, env) for n in nodes]
    if not ns:
        return 0.0
    if typ == "bezier" and len(ns) >= 4:
        a, b, c_, d = ns[:4]
        u = 1 - t
        return u ** 3 * a + 3 * u * u * t * b + 3 * u * t * t * c_ + t ** 3 * d
    if typ == "catmull_rom" and len(ns) >= 4:
        seg = len(ns) - 3
        f = t * seg
        i = min(seg - 1, int(f))
        s = f - i
        p0, p1, p2, p3 = ns[i:i + 4]
        return 0.5 * (2 * p1 + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s + (-p0 + 3 * p1 - 3 * p2 + p3) * s ** 3)
    f = t * (len(ns) - 1)
    i = min(len(ns) - 2, int(f)) if len(ns) > 1 else 0
    if len(ns) == 1:
        return ns[0]
    return ns[i] + (ns[i + 1] - ns[i]) * (f - i)


# ====================================================================== simulation
ENTITY = {"entity_width": 1.0, "entity_height": 1.0, "entity_size": 1.0, "entity_radius": 0.5, "entity_scale": 1.0}
GROUND = 0.0


class Env:
    """Molang variables of one evaluation: the particle's, then its emitter's, then curves"""
    __slots__ = ("em", "p", "rng", "temps")

    def __init__(self, em, p=None):
        self.em, self.p, self.rng, self.temps = em, p, em.world.rng, {}

    def get(self, name):
        head, key = name[:1], name[2:]
        if head == "v":
            if self.p is not None and key in self.p.vars:
                return self.p.vars[key]
            if key in self.em.vars:
                return self.em.vars[key]
            cv = self.em.eff.curves.get(key)
            if cv is not None:
                return curve_value(cv, self)
            return 0.0
        if head == "t":
            return self.temps.get(key, 0.0)
        if head == "q":
            return self.query(name, [])
        return 0.0

    def set(self, name, val):
        head, key = name[:1], name[2:]
        if head == "v":
            (self.p.vars if self.p is not None else self.em.vars)[key] = val
        elif head == "t":
            self.temps[key] = val

    def query(self, name, args):
        key = name[2:]
        if key in ENTITY:
            return ENTITY[key]
        if key in ("target_deltax", "target_deltay", "target_deltaz", "target_distance"):
            return self.em.vars.get(key, 0.0)
        mv = self.em.world.move
        if key.startswith("move."):
            return {"move.type": mv["type"], "move.name": mv["identifier"].replace("-", ""),
                    "move.damage_category": mv["class"]}.get(key, 0.0)
        return 0.0


class Particle:
    __slots__ = ("vars", "pos", "vel", "age", "life", "rot", "rot_rate", "alive", "em", "id")


class Emitter:
    def __init__(self, world, eff, pos, basis, side, role, target=None, root=None):
        self.world, self.eff, self.pos, self.basis = world, eff, pos, basis
        self.side, self.role, self.target, self.root = side, role, target, root or eff.id
        self.particles, self.age, self.acc, self.expired, self.loop = [], 0.0, 0.0, False, -1
        c = eff.c
        r = world.rng
        self.vars = dict(ENTITY, emitter_age=0.0, emitter_random_1=r.random(), emitter_random_2=r.random(),
                         emitter_random_3=r.random(), emitter_random_4=r.random())
        env = Env(self)
        ini = c.get("emitter_initialization", {})
        ev(ini.get("creation_expression"), env)
        if target is not None:   # upstream: emitter - target in the emitter's space, y negated (direction = -dx, dy, -dz)
            d = to_local(basis, sub(pos, target))
            self.vars.update(target_deltax=d[0], target_deltay=-d[1], target_deltaz=d[2], target_distance=length(d))
        lo, lp, le = c.get("emitter_lifetime_once"), c.get("emitter_lifetime_looping"), c.get("emitter_lifetime_expression")
        if lo is not None:
            self.mode, self.active_time = "once", evn(lo.get("active_time", 10), env, 10)
        elif lp is not None:
            self.mode, self.active_time, self.sleep = "loop", evn(lp.get("active_time", 10), env, 10), evn(lp.get("sleep_time", 0), env)
        elif le is not None:
            self.mode, self.active_time = "expr", 1e9
        else:
            self.mode, self.active_time = "loop", 10.0
            self.sleep = 0.0
        self.vars["emitter_lifetime"] = self.active_time
        self.fire(c.get("emitter_lifetime_events", {}).get("creation_event"), None)

    # events: particle_effect (emitter / emitter_bound / particle / particle_with_velocity), expression, sequence, randomize
    def fire(self, names, p):
        if not names:
            return
        for n in names if isinstance(names, list) else [names]:
            self.run_event(self.eff.events.get(n), p)

    def run_event(self, e, p):
        if not e:
            return
        if "sequence" in e:
            for x in e["sequence"]:
                self.run_event(x, p)
        if "randomize" in e:
            opts = e["randomize"]
            tot = sum(o.get("weight", 1) for o in opts)
            x = self.world.rng.random() * tot
            for o in opts:
                x -= o.get("weight", 1)
                if x <= 0:
                    self.run_event(o, p)
                    break
        if "expression" in e:
            ev(e["expression"], Env(self, p))
        pe = e.get("particle_effect")
        if pe:
            eff = Effect.get(pe["effect"])
            if eff:
                at = p.pos if (p is not None and pe.get("type", "emitter").startswith("particle")) else self.pos
                child = Emitter(self.world, eff, at, self.basis, self.side,
                                "travel" if (self.role == "travel" or (self.side == "actor" and eff.reaching)) else self.role,
                                self.target, self.root)
                if pe.get("pre_effect_expression"):
                    ev(pe["pre_effect_expression"], Env(child))
                self.world.emitters.append(child)

    def shape(self, env):
        c = self.eff.c
        for k in ("emitter_shape_point", "emitter_shape_sphere", "emitter_shape_box", "emitter_shape_disc",
                  "emitter_shape_custom", "emitter_shape_entity_aabb"):
            if k in c:
                s, kind = c[k], k[len("emitter_shape_"):]
                break
        else:
            s, kind = {}, "point"
        off = tuple(ev(s.get("offset", [0, 0, 0]), env))
        r = self.world.rng
        surf = bool(s.get("surface_only", False))
        loc = (0.0, 0.0, 0.0)
        if kind == "sphere":
            rad = evn(s.get("radius", 1), env, 1)
            d = unit((r.gauss(0, 1), r.gauss(0, 1), r.gauss(0, 1)))
            loc = mul(d, rad if surf else rad * r.random() ** (1 / 3))
        elif kind in ("box", "entity_aabb"):
            hd = ev(s.get("half_dimensions", [0.5, 0.5, 0.5]), env) if kind == "box" else \
                [ENTITY["entity_width"] / 2, ENTITY["entity_height"] / 2, ENTITY["entity_width"] / 2]
            loc = tuple((r.random() * 2 - 1) * h for h in hd)
            if surf:
                ax = r.randrange(3)
                loc = tuple((hd[i] * (1 if r.random() < 0.5 else -1)) if i == ax else loc[i] for i in range(3))
        elif kind == "disc":
            rad = evn(s.get("radius", 1), env, 1)
            pn = s.get("plane_normal", "y")
            n = {"x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1)}.get(pn) if isinstance(pn, str) else unit(tuple(ev(pn, env)))
            a = unit(cross(n, (0, 0, 1) if abs(n[2]) < 0.9 else (1, 0, 0)))
            b = cross(n, a)
            ang = r.random() * 2 * math.pi
            rr = rad if surf else rad * math.sqrt(r.random())
            loc = add(mul(a, rr * math.cos(ang)), mul(b, rr * math.sin(ang)))
        local = add(off, loc)
        dm = s.get("direction", "outwards")
        if dm in ("outwards", "inwards") and length(loc) < 1e-9:    # a point has no "outwards": any direction
            loc_d = unit((r.gauss(0, 1), r.gauss(0, 1), r.gauss(0, 1)))
            d = loc_d if dm == "outwards" else mul(loc_d, -1)
        elif dm == "outwards":
            d = loc
        elif dm == "inwards":
            d = mul(loc, -1)
        else:
            d = tuple(ev(dm, env))
        return add(self.pos, to_world(self.basis, local)), to_world(self.basis, d)

    def spawn(self):
        c, w = self.eff.c, self.world
        p = Particle()
        r = w.rng
        p.vars = {"particle_random_1": r.random(), "particle_random_2": r.random(), "particle_random_3": r.random(),
                  "particle_random_4": r.random(), "particle_age": 0.0}
        p.em, p.alive, p.age, p.id = self, True, 0.0, w.next_id()
        env = Env(self, p)
        pos, d = self.shape(env)
        sp = c.get("particle_initial_speed", 0)
        if isinstance(sp, list):
            p.vel = to_world(self.basis, tuple(ev(sp, env)))
        else:
            p.vel = mul(unit(d), evn(sp, env))
        p.pos = pos
        lt = c.get("particle_lifetime_expression", {})
        p.life = max(0.01, evn(lt.get("max_lifetime", 1), env, 1))
        p.vars["particle_lifetime"] = p.life
        spin = c.get("particle_initial_spin", {})
        p.rot, p.rot_rate = evn(spin.get("rotation", 0), env), evn(spin.get("rotation_rate", 0), env)
        self.particles.append(p)
        self.fire(c.get("particle_lifetime_events", {}).get("creation_event"), p)
        return p

    def tick(self, dt):
        c = self.eff.c
        self.vars["emitter_age"] = self.age
        env = Env(self)
        ini = c.get("emitter_initialization", {})
        if ini.get("per_update_expression"):
            ev(ini["per_update_expression"], env)
        active = False
        if not self.expired:
            if self.mode == "once":
                active = self.age < self.active_time
                loop = 0
                if not active:
                    self.expired = True
                    self.fire(c.get("emitter_lifetime_events", {}).get("expiration_event"), None)
            elif self.mode == "loop":
                per = self.active_time + self.sleep
                loop = int(self.age // per) if per > 0 else 0
                active = (self.age - loop * per) < self.active_time
            else:
                le = c["emitter_lifetime_expression"]
                active = evn(le.get("activation_expression", 1), env, 1) != 0
                loop = 0
                if evn(le.get("expiration_expression", 0), env) != 0:
                    self.expired = True
                    self.fire(c.get("emitter_lifetime_events", {}).get("expiration_event"), None)
        if active:
            if "emitter_rate_instant" in c:
                if loop != self.loop:
                    self.loop = loop
                    for _ in range(int(evn(c["emitter_rate_instant"].get("num_particles", 10), env, 10))):
                        self.spawn()
            elif "emitter_rate_steady" in c:
                rs = c["emitter_rate_steady"]
                self.acc += evn(rs.get("spawn_rate", 1), env, 1) * dt
                mx = evn(rs.get("max_particles", 50), env, 50)
                while self.acc >= 1:
                    self.acc -= 1
                    if sum(1 for p in self.particles if p.alive) < mx:
                        self.spawn()
        tl = c.get("emitter_lifetime_events", {}).get("timeline", {})
        for k, names in tl.items():
            if self.age <= float(k) < self.age + dt:
                self.fire(names, None)
        for p in self.particles:
            if p.alive:
                self.tick_particle(p, dt)
        self.particles = [p for p in self.particles if p.alive]
        self.age += dt

    def tick_particle(self, p, dt):
        c = self.eff.c
        p.vars["particle_age"] = p.age
        env = Env(self, p)
        pi = c.get("particle_initialization", {})
        if pi.get("per_update_expression"):
            ev(pi["per_update_expression"], env)
        md = c.get("particle_motion_dynamic")
        if md is not None:
            acc = tuple(ev(md.get("linear_acceleration", [0, 0, 0]), env))
            drag = evn(md.get("linear_drag_coefficient", 0), env)
            p.vel = add(p.vel, mul(sub(acc, mul(p.vel, drag)), dt))
            p.pos = add(p.pos, mul(p.vel, dt))
            ra = evn(md.get("rotation_acceleration", 0), env)
            rd = evn(md.get("rotation_drag_coefficient", 0), env)
            p.rot_rate += (ra - rd * p.rot_rate) * dt
        mp = c.get("particle_motion_parametric")
        if mp is not None:
            if "relative_position" in mp:
                p.pos = add(self.pos, to_world(self.basis, tuple(ev(mp["relative_position"], env))))
            if "direction" in mp:
                p.vel = to_world(self.basis, tuple(ev(mp["direction"], env)))
            if "rotation" in mp:
                p.rot = evn(mp["rotation"], env)
        p.rot += p.rot_rate * dt
        col = c.get("particle_motion_collision")
        if col is not None and evn(col.get("enabled", 1), env, 1):
            rad = evn(col.get("collision_radius", 0.1), env, 0.1)
            if p.pos[1] - rad < GROUND:
                hit_speed = abs(p.vel[1])
                if col.get("expire_on_contact"):
                    p.alive = False
                e = evn(col.get("coefficient_of_restitution", 0), env)
                vy = -p.vel[1] * e if p.vel[1] < 0 else p.vel[1]
                p.pos = (p.pos[0], GROUND + rad, p.pos[2])
                fr = evn(col.get("collision_drag", 0), env)
                hx, hz = p.vel[0], p.vel[2]
                hs = math.hypot(hx, hz)
                if fr > 0 and hs > 0:
                    k = max(0.0, hs - fr * dt) / hs
                    hx, hz = hx * k, hz * k
                p.vel = (hx, vy if abs(vy) > 0.05 else 0.0, hz)
                for ce in col.get("events", []) or []:
                    if hit_speed >= ce.get("min_speed", 0):
                        self.fire(ce.get("event"), p)
        prev = p.age
        p.age += dt
        p.vars["particle_age"] = p.age
        le = c.get("particle_lifetime_events", {})
        for k, names in le.get("timeline", {}).items():
            if prev < float(k) <= p.age:
                self.fire(names, p)
        lt = c.get("particle_lifetime_expression", {})
        if lt.get("expiration_expression") is not None and evn(lt["expiration_expression"], env) != 0:
            p.alive = False
        if p.age >= p.life or not p.alive:
            p.alive = False
            self.fire(le.get("expiration_event"), p)

    @property
    def done(self):
        return self.expired and not self.particles

    def render_items(self):
        """what each live particle looks like now: world quad + texture rect + tint"""
        eff, c = self.eff, self.eff.c
        if eff.invisible:
            return []
        bb = c["particle_appearance_billboard"]
        tex = eff.tex()
        if tex is None:
            return []
        out = []
        uvc = bb.get("uv", {})
        tw_, th_ = uvc.get("texture_width", 1), uvc.get("texture_height", 1)
        kx, ky = tex.width / tw_, tex.height / th_
        tint_c = c.get("particle_appearance_tinting", {}).get("color")
        for p in self.particles:
            p.vars["particle_age"] = p.age
            env = Env(self, p)
            size = ev(bb.get("size", [0.1, 0.1]), env)
            if not isinstance(size, list):
                size = [size, size]
            hw, hh = size[0] / 1.5, size[1] / 1.5       # upstream: half extents = size / 1.5
            if abs(hw) < 1e-4 or abs(hh) < 1e-4:
                continue
            fb = uvc.get("flipbook")
            if fb:
                base = ev(fb.get("base_UV", [0, 0]), env)
                su = ev(fb.get("size_UV", [1, 1]), env)
                st = ev(fb.get("step_UV", [0, 0]), env)
                mf = max(1, int(evn(fb.get("max_frame", 1), env, 1)))
                if fb.get("stretch_to_lifetime"):
                    fr = int(p.age / p.life * mf)
                else:
                    fr = int(p.age * evn(fb.get("frames_per_second", 8), env, 8))
                fr = fr % mf if fb.get("loop") else min(mf - 1, fr)
                u0, v0 = base[0] + st[0] * fr, base[1] + st[1] * fr
            else:
                u0, v0 = ev(uvc.get("uv", [0, 0]), env)
                su = ev(uvc.get("uv_size", [tw_, th_]), env)
            rect = (u0 * kx, v0 * ky, su[0] * kx, su[1] * ky)
            if tint_c is None:
                tint = (1.0, 1.0, 1.0, 1.0)
            elif isinstance(tint_c, list):
                tv = ev(tint_c, env)
                tint = tuple(tv + [1.0] * (4 - len(tv)))[:4]
            elif isinstance(tint_c, str):
                tint = hexcol(tint_c)
            else:
                tint = gradient(tint_c, env)
            vd = p.vel
            dcfg = bb.get("direction", {})
            if dcfg.get("mode") == "custom":
                vd = to_world(self.basis, tuple(ev(dcfg.get("custom_direction", [0, 0, 1]), env)))
            out.append(dict(pos=p.pos, hw=hw, hh=hh, rot=p.rot, mode=bb.get("facing_camera_mode", "rotate_xyz"),
                            dir=unit(vd), spd=length(p.vel), basis=self.basis, tex=eff.texture, rect=rect, tint=tint,
                            mat=eff.material, side=self.side, role=self.role, root=self.root, eff=eff.id))
        return out


def pixels(im):
    return list(im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata())


def hexcol(s):
    s = s.lstrip("#")
    if len(s) == 8:   # Bedrock: #AARRGGBB
        a, r, g, b = (int(s[i:i + 2], 16) / 255 for i in (0, 2, 4, 6))
    else:
        r, g, b = (int(s[i:i + 2], 16) / 255 for i in (0, 2, 4))
        a = 1.0
    return (r, g, b, a)


def gradient(cfg, env):
    t = evn(cfg.get("interpolant", 0), env)
    g = cfg.get("gradient", {})
    if isinstance(g, list):
        g = {i / max(1, len(g) - 1): v for i, v in enumerate(g)}
    keys = sorted((float(k), hexcol(v) if isinstance(v, str) else tuple(v + [1.0] * (4 - len(v)))) for k, v in g.items())
    if not keys:
        return (1.0, 1.0, 1.0, 1.0)
    if t <= keys[0][0]:
        return keys[0][1]
    for (k0, c0), (k1, c1) in zip(keys, keys[1:]):
        if t <= k1:
            f = (t - k0) / ((k1 - k0) or 1)
            return tuple(a + (b - a) * f for a, b in zip(c0, c1))
    return keys[-1][1]


class World:
    def __init__(self, move, seed=1):
        self.move, self.rng, self.emitters, self._id = move, random.Random(seed), [], 0

    def next_id(self):
        self._id += 1
        return self._id

    def run(self, starts, t_end, dt=1 / 30):
        """starts: [(t, effect, pos, basis, side, target)]; returns [(t, [render items])] every dt"""
        starts = sorted(starts, key=lambda s: s[0])
        snaps, t, i = [], 0.0, 0
        while t <= t_end + 1e-9:
            while i < len(starts) and starts[i][0] <= t + 1e-9:
                st, eff, pos, basis, side, target = starts[i]
                role = "impact" if side == "target" else ("travel" if eff.reaching else "cast")
                self.emitters.append(Emitter(self, eff, pos, basis, side, role, target))
                i += 1
            for e in list(self.emitters):
                e.tick(dt)
            self.emitters = [e for e in self.emitters if not e.done]
            items = []
            for e in self.emitters:
                items += e.render_items()
            snaps.append((t, items))
            t += dt
        return snaps


# ====================================================================== action-effect timeline
D_BATTLE = 5.0                           # user -> target distance (blocks); the upstream default target_deltaz is 5
YAW = math.radians(45)                   # the target is up-right of the user, like the Gen 3 screen
LOCATORS = {"root": (0, 0, 0), "middle": (0, 0.5, 0), "target": (0, 0.5, -0.1), "special": (0, 0.6, -0.35),
            "head": (0, 0.85, -0.2), "mouth": (0, 0.7, -0.4)}


def action_dir():
    """data/<ns>/action_effects/moves/ of the upstream checkout"""
    return os.path.join(need_src(), "data", NS, "action_effects", "moves")


def source_key(move):
    return BORROW.get(move["identifier"], move["identifier"].replace("-", ""))


def action_effect(key):
    base = action_dir()
    p = os.path.join(base, f"{key}.json")
    if os.path.isfile(p):
        return key, json.load(open(p, encoding="utf-8"))
    return "generic_move", json.load(open(os.path.join(base, "generic_move.json"), encoding="utf-8"))


def anim_particles(name, part):
    """particle_effects of a generic move animation (q.bedrock_stateful('bulldoze', 'actor'))"""
    for p in glob.glob(os.path.join(need_src(), "assets", NS, "bedrock", "**", "animations", "**", f"{name}.animation.json"), recursive=True):
        a = json.load(open(p, encoding="utf-8")).get("animations", {}).get(f"animation.{name}.{part}", {})
        out = []
        for t, lst in a.get("particle_effects", {}).items():
            for x in lst if isinstance(lst, list) else [lst]:
                out.append((float(t), x["effect"], x.get("locator", "root")))
        return out
    return []


def timeline(move):
    """[(t, side, effect id, locator, target locator)] from the upstream action effect, plus notes"""
    key, tl = action_effect(source_key(move))
    menv = type("E", (), {"get": lambda s, n: s.query(n, []) if n.startswith("q.") else 0.0, "set": lambda s, n, v: None, "rng": random.Random(0),
                          "query": lambda s, n, a: {"q.move.type": move["type"], "q.move.name": source_key(move),
                                                    "q.move.damage_category": move["class"]}.get(n, 0.0)})()
    out, notes, t = [], [], 0.0

    def side_of(cond):
        cond = (cond or "q.entity.is_user").replace(" ", "")
        return "target" if "is_user==false" in cond else "actor"

    def eff_name(e):
        if e.startswith("'") or "+" in e or "q." in e:
            v = ev(e, menv)
            return v if isinstance(v, str) else None
        return e

    def run(kf):
        nonlocal t
        typ = kf.get("type")
        if kf.get("condition") and not _num(ev(kf["condition"], menv)):
            return
        if typ == "pause":
            t += evn(kf.get("pause", 0), menv)
        elif typ == "sequence":
            for k in kf.get("keyframes", []):
                run(k)
        elif typ == "parallel":
            t0, t1 = t, t
            for k in kf.get("keyframes", []):
                t = t0
                run(k)
                t1 = max(t1, t)
            t = t1
        elif typ == "animation":
            notes.append(f"t={t:.2f}: the user's own model animation {kf.get('animation')} (not converted)")
            t += evn(kf.get("delay", 0), menv)
        elif typ == "entity_particles":
            name = eff_name(kf.get("effect", ""))
            if name:
                locs = kf.get("locators", ["target"])
                tl_ = kf.get("targetLocators")
                out.append((t, side_of(kf.get("entityCondition")), name, locs[0], tl_[0] if tl_ else None))
            t += evn(kf.get("delay", 0), menv)
        elif typ == "entity_molang":
            sd = side_of(kf.get("entityCondition"))
            for ex in kf.get("expressions", []):
                for m in re.finditer(r"q\.particle\(\s*'([^']+)'\s*,\s*'([^']+)'", ex):
                    out.append((t, sd, m.group(1), m.group(2), None))
                for m in re.finditer(r"q\.bedrock_stateful\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)", ex):
                    for dt_, e, loc in anim_particles(m.group(1), m.group(2)):
                        out.append((t + dt_, sd, e, loc, None))
            t += evn(kf.get("delay", 0), menv)
    for kf in tl.get("timeline", []):
        run(kf)
    return key, out, notes, t


# ====================================================================== camera + rasteriser
class Cam:
    def __init__(self, right, up):
        self.r, self.u = unit(right), unit(up)
        self.d = cross(self.r, self.u)        # into the scene

    def p(self, v):
        return dot(v, self.r), dot(v, self.u)


def battle_cam(pitch):
    a = math.radians(pitch)
    return Cam((1, 0, 0), (0, math.cos(a), math.sin(a)))


def side_cam(fwd, pitch=12):
    a = math.radians(pitch)
    f = unit((fwd[0], 0, fwd[2]))
    away = cross(f, (0, 1, 0))
    return Cam(f, add(mul((0, 1, 0), math.cos(a)), mul(away, math.sin(a))))


def axes(it, cam):
    m = it["mode"]
    if m in ("rotate_y", "lookat_y"):
        e1, e2 = unit((cam.r[0], 0, cam.r[2])), (0.0, 1.0, 0.0)
    elif m in ("lookat_direction", "direction_x", "direction_y", "direction_z") and length(it["dir"]) > 0.5:
        v = it["dir"]
        if m == "direction_z":
            e1 = unit(cross(v, (0, 1, 0) if abs(v[1]) < 0.9 else (1, 0, 0)))
            e2 = cross(v, e1)
        else:
            o = unit(cross(cam.d, v))
            if length(o) < 0.5:
                e1, e2 = cam.r, cam.u
            else:
                e1, e2 = (v, o) if m != "direction_y" else (o, v)
    elif m.startswith("emitter_transform_"):
        b = it["basis"]
        e1, e2 = {"emitter_transform_xy": (b[0], b[1]), "emitter_transform_xz": (b[0], b[2]),
                  "emitter_transform_yz": (b[2], b[1])}.get(m, (b[0], b[2]))
    else:
        e1, e2 = cam.r, cam.u
    if it["rot"]:
        a = math.radians(it["rot"])
        e1, e2 = add(mul(e1, math.cos(a)), mul(e2, math.sin(a))), add(mul(e1, -math.sin(a)), mul(e2, math.cos(a)))
    return e1, e2


def screen_box(it, cam):
    """centre and half extents (projected world units) of an item's quad"""
    e1, e2 = axes(it, cam)
    cx, cy = cam.p(it["pos"])
    a, b = cam.p(mul(e1, abs(it["hw"]))), cam.p(mul(e2, abs(it["hh"])))
    return cx, cy, abs(a[0]) + abs(b[0]), abs(a[1]) + abs(b[1])


_TINTED = {}


def tinted(it):
    tex = _TEX.get(it["tex"])
    x, y, w, h = it["rect"]
    q = tuple(round(v * 31) for v in it["tint"])
    key = (it["tex"], round(x), round(y), round(w), round(h), q, it["mat"])
    if key not in _TINTED:
        fx, fy = w < 0, h < 0
        x0, x1 = sorted((x, x + w))
        y0, y1 = sorted((y, y + h))
        im = tex.crop((int(round(x0)), int(round(y0)), max(int(round(x0)) + 1, int(round(x1))), max(int(round(y0)) + 1, int(round(y1)))))
        if fx:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        if fy:
            im = im.transpose(Image.FLIP_TOP_BOTTOM)
        r, g, b, a = it["tint"]
        px = [(int(pr * r), int(pg * g), int(pb * b), int(pa * a)) for pr, pg, pb, pa in pixels(im)]
        if it["mat"] == "particles_alpha":   # alpha test
            px = [(pr, pg, pb, 255 if pa >= 128 else 0) for pr, pg, pb, pa in px]
        im = Image.new("RGBA", im.size)
        im.putdata(px)
        _TINTED[key] = im
    return _TINTED[key]


def draw(canvas, it, cam, k, O, opx):
    """rasterise one particle quad: affine texture mapping, nearest neighbour"""
    e1, e2 = axes(it, cam)
    cx, cy = cam.p(it["pos"])
    Cx, Cy = opx[0] + k * (cx - O[0]), opx[1] - k * (cy - O[1])
    a = cam.p(mul(e1, it["hw"]))
    b = cam.p(mul(e2, it["hh"]))
    A = (k * a[0], -k * a[1])          # centre -> right edge of the texture (px)
    Bd = (-k * b[0], k * b[1])         # centre -> bottom edge of the texture (px)
    det = A[0] * Bd[1] - Bd[0] * A[1]
    if abs(det) < 0.3:
        return
    xs = [Cx + sa * A[0] + sb * Bd[0] for sa in (-1, 1) for sb in (-1, 1)]
    ys = [Cy + sa * A[1] + sb * Bd[1] for sa in (-1, 1) for sb in (-1, 1)]
    x0, x1 = max(0, math.floor(min(xs))), min(canvas.width, math.ceil(max(xs)))
    y0, y1 = max(0, math.floor(min(ys))), min(canvas.height, math.ceil(max(ys)))
    if x1 <= x0 or y1 <= y0:
        return
    src = tinted(it)
    tw, th = src.size
    Ux, Uy = Bd[1] / det, -Bd[0] / det
    Vx, Vy = -A[1] / det, A[0] / det
    coef = (tw / 2 * Ux, tw / 2 * Uy, tw / 2 * (Ux * (x0 - Cx) + Uy * (y0 - Cy)) + tw / 2,
            th / 2 * Vx, th / 2 * Vy, th / 2 * (Vx * (x0 - Cx) + Vy * (y0 - Cy)) + th / 2)
    img = src.transform((x1 - x0, y1 - y0), Image.AFFINE, coef, resample=Image.NEAREST)
    canvas.alpha_composite(img, (x0, y0))


def render(items, cam, k, O, opx, size=(C, C)):
    cv = Image.new("RGBA", size, (0, 0, 0, 0))
    for it in sorted(items, key=lambda i: -dot(i["pos"], cam.d)):     # far first
        draw(cv, it, cam, k, O, opx)
    return cv


# ====================================================================== Gen 3 look
OUTLINE = (24, 24, 40, 255)


def despeckle(im, min_px):
    """drop opaque specks smaller than min_px pixels (4-connected): tiny far particles read as noise at GBA size"""
    W_, H_ = im.size
    px = im.load()
    seen = set()
    for y in range(H_):
        for x in range(W_):
            if (x, y) in seen or not px[x, y][3]:
                continue
            comp, todo = [], [(x, y)]
            seen.add((x, y))
            while todo:
                cx, cy = todo.pop()
                comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < W_ and 0 <= ny < H_ and (nx, ny) not in seen and px[nx, ny][3]:
                        seen.add((nx, ny))
                        todo.append((nx, ny))
            if len(comp) < min_px:
                for cx, cy in comp:
                    px[cx, cy] = (0, 0, 0, 0)
    return im


def snap555(c):
    """nearest BGR555 colour written like pret (floor(c5 * 255 / 31)); same rule as tools/gen3/gen3.py snap()"""
    return tuple(min(31, (v * 31 + 127) // 255) * 255 // 31 for v in c[:3]) + tuple(c[3:])


def gen3(frames, colors=15, outline=True, alpha_cut=96, speck=4):
    """alpha 0/255, specks removed, one shared palette of <= `colors` colours (outline included) on the BGR555 grid,
    1 px dark outline"""
    cut = []
    for f in frames:
        px = [(r, g, b, 255) if a >= alpha_cut else (0, 0, 0, 0) for r, g, b, a in pixels(f)]
        im = Image.new("RGBA", f.size)
        im.putdata(px)
        cut.append(despeckle(im, speck) if speck > 1 else im)
    opaque = [p[:3] for f in cut for p in pixels(f) if p[3]]
    if opaque:
        sample = Image.new("RGB", (len(opaque), 1))
        sample.putdata(opaque)
        pal = sample.quantize(max(1, colors - (1 if outline else 0)), method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        flat = pal.getpalette()
        pal.putpalette([v for i in range(0, len(flat), 3) for v in snap555(flat[i:i + 3])])   # Gen 3: BGR555
        out = []
        for f in cut:
            q = f.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGBA")
            q.putalpha(f.getchannel("A"))
            out.append(q)
        cut = out
    if outline:
        for f in cut:
            a = f.getchannel("A").load()
            px = f.load()
            W_, H_ = f.size
            edge = [(x, y) for y in range(H_) for x in range(W_) if not a[x, y] and any(
                0 <= x + dx < W_ and 0 <= y + dy < H_ and a[x + dx, y + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
            for x, y in edge:
                px[x, y] = snap555(OUTLINE)
    return cut


# ====================================================================== strips
def pct(vals, q):
    if not vals:
        return 0.0
    s = sorted(vals)
    return s[min(len(s) - 1, int(q * (len(s) - 1) + 0.5))]


def pick(snaps, pred, n, max_len, frac=0.12, t_from=0.0):
    """n snapshot indices spread over the time `pred` particles are on screen (from first sight until they fade)"""
    counts = [sum(abs(it["hw"] * it["hh"]) for it in items if pred(it)) if t >= t_from else 0 for t, items in snaps]   # area
    if not any(counts):
        return []
    peak = max(counts)
    i0 = next(i for i, c in enumerate(counts) if c > 0)
    i1 = max(i for i, c in enumerate(counts) if c >= frac * peak)
    i0 = next(i for i, c in enumerate(counts) if c >= min(frac, 0.05) * peak)
    dt = snaps[1][0] - snaps[0][0] if len(snaps) > 1 else 1 / 30
    i0 = min(i0 + 1, i1)
    i1 = min(i1, i0 + int(max_len / dt))
    return [round(i0 + (i1 - i0) * j / max(1, n - 1)) for j in range(n)]


def frame_set(snaps, idx, pred, cam, origin, mode, win, track=False, k=None):
    """framing of some frames: (k px per block, per-frame screen origin, cell px of that origin)"""
    groups = [[it for it in snaps[i][1] if pred(it)] for i in idx]
    O = cam.p(origin)
    centres = []
    L, R, U, Dn = [], [], [], []
    for g in groups:
        boxes = [screen_box(it, cam) for it in g]
        if track and boxes:
            o = (sum(b[0] for b in boxes) / len(boxes), sum(b[1] for b in boxes) / len(boxes))
        else:
            o = O
        centres.append(o)
        for cx, cy, ex, ey in boxes:
            L.append(o[0] - (cx - ex)); R.append(cx + ex - o[0]); U.append(cy + ey - o[1]); Dn.append(o[1] - (cy - ey))
    q = 0.97
    l, r, u, d = (min(w, max(0.05, pct(v, q))) for v, w in ((L, win[0]), (R, win[0]), (U, win[1]), (Dn, win[2])))
    if mode == "bottom":
        k = k or min(0.46 * C / max(l, r), 0.92 * C / max(0.1, u + d))
        opx = (C / 2, C * 0.96 - k * d)
    else:
        k = k or 0.46 * C / max(l, r, u, d)
        opx = (C / 2, C / 2)
    return groups, centres, k, opx


# ---- never cut (user rule, decisions.md §12 2026-11-19): every frame is rendered on a big padded canvas and the whole
# drawing of the strip (all 8 frames, after speck removal) must fit its cell with >= MARGIN px to spare.
#   - the "body" of the drawing (every connected piece of DEBRIS px or more) decides the size: too big -> the strip is
#     re-rendered smaller (uniformly, down to S_MIN, and never so far that its -vfx.json scale passes its clamp: the
#     scale grows by the same factor so the on-screen size stays the upstream one); what still does not fit gets a bigger
#     cell (up to N_MAX px; vfx.py reads the cell from the image height and sizes by the drawing, not by the cell);
#   - small loose particles (sparks, droplets < DEBRIS px) and pieces entirely outside the old 96 px framing (never
#     shown before: far debris, a bolt high in the sky) do not grow the cell: they stay when they fit in it and are
#     dropped WHOLE when they do not, never cut;
#   - beam segments ("join" frames) are cut at the left / right cell edges on purpose: vfx.py lays overlapping copies
#     along the path and rounds the two ends; only their height must fit.
PAD = 2 * C                       # padding around the 96 px reference cell while rendering
MARGIN = 2                        # transparent px kept between the drawing and the cell edge
S_MIN = 0.75                      # smallest re-render factor before the cell grows instead (pixels stay readable)
N_MAX = 2 * C                     # biggest cell
DEBRIS = 64                       # px: a loose piece smaller than this may be dropped instead of growing the cell


def _union(boxes):
    boxes = [b for b in boxes if b]
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)) if boxes else None


def outer_pieces(im, box):
    """connected pieces (8-connected, outline included) of `im` that reach outside `box` (x0, y0, x1, y1):
    [(area, (x0, y0, x1, y1), pixels)]; pieces fully inside are not labelled (fast)"""
    W_, H_ = im.size
    a = im.getchannel("A").load()
    seen, out = set(), []
    bx0, by0, bx1, by1 = box
    for y in range(H_):
        inside_row = by0 <= y < by1
        for x in range(W_):
            if inside_row and bx0 <= x < bx1:
                continue
            if not a[x, y] or (x, y) in seen:
                continue
            todo, pix = [(x, y)], []
            seen.add((x, y))
            while todo:
                cx, cy = todo.pop()
                pix.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < W_ and 0 <= ny < H_ and (nx, ny) not in seen and a[nx, ny]:
                            seen.add((nx, ny))
                            todo.append((nx, ny))
            xs, ys = [q[0] for q in pix], [q[1] for q in pix]
            out.append((len(pix), (min(xs), min(ys), max(xs) + 1, max(ys) + 1), pix))
    return out


def finish(spec, colors, outline, speck, s_lo=S_MIN):
    """spec = one entry per frame: None (blank) or (items, cam, O, opx, k, mode) with opx in 96 px cell coordinates;
    mode "" = normal, "join" = a beam segment (only its height must fit), "free" = travel frames whose framing is not
    tied to the -vfx.json world size (projectile / spray travel): first shrunk on their own to fit the 96 px cell.
    Returns (frames of N x N px, N, s, dropped loose pieces): s = the uniform re-render factor of the other frames."""
    big, cen = C + 2 * PAD, PAD + C / 2
    free = {}                         # frame index -> its own factor

    def run(s):
        fk = lambda i: free.get(i, s)  # noqa: E731
        raw = [None if fs is None else render(fs[0], fs[1], fs[4] * fk(i), fs[2],
                                               (cen + (fs[3][0] - C / 2) * fk(i), cen + (fs[3][1] - C / 2) * fk(i)), (big, big))
               for i, fs in enumerate(spec)]
        cut = lambda v: 255 if v >= 96 else 0  # noqa: E731   (gen3's alpha cut)
        u = _union([r.getchannel("A").point(cut).getbbox() for r in raw if r is not None])
        if not u:
            return None, None, {}, {}
        u = (max(0, u[0] - 2), max(0, u[1] - 2), min(big, u[2] + 2), min(big, u[3] + 2))   # room for the outline
        done = gen3([r.crop(u) if r is not None else Image.new("RGBA", (u[2] - u[0], u[3] - u[1])) for r in raw],
                    colors, outline, speck=speck)
        inner = C / 2 - MARGIN
        box = (int(cen - inner - u[0]), int(cen - inner - u[1]), int(cen + inner - u[0]), int(cen + inner - u[1]))
        halves, loose = {}, {}
        for i, (fs, d) in enumerate(zip(spec, done)):
            if fs is None or not d.getbbox():
                continue
            h, hb = 0.0, C / 2 * fk(i)                      # hb: the old 96 px framing at this scale
            for area, (x0, y0, x1, y1), pix in outer_pieces(d, box):
                x0, y0, x1, y1 = x0 + u[0], y0 + u[1], x1 + u[0], y1 + u[1]
                hy = max(cen - y0, y1 - cen)
                hp = hy if fs[5] == "join" else max(hy, cen - x0, x1 - cen)
                away = not (y0 < cen + hb and y1 > cen - hb and (fs[5] == "join" or (x0 < cen + hb and x1 > cen - hb)))
                if away or area < DEBRIS:   # a small loose particle, or a piece entirely outside the old framing
                    loose.setdefault(i, []).append((hp, pix))   # (never shown before): kept if it fits, else dropped whole
                else:                       # the body of the drawing: must fit
                    h = max(h, hp)
            halves[i] = h
        return done, u, halves, loose

    s = 1.0
    done, u, halves, loose = run(s)
    for _ in range(3):                # "free" travel frames: fit the 96 px cell on their own
        over = {i: h for i, h in halves.items() if spec[i][5] == "free" and h + MARGIN > C / 2}
        if not over:
            break
        for i, h in over.items():
            free[i] = free.get(i, 1.0) * (C / 2) / (h + MARGIN)
        done, u, halves, loose = run(s)
    half = max(halves.values(), default=0.0)
    for _ in range(3):                # shrink to fit the 96 px cell, but not below s_lo
        need = half + MARGIN
        if not done or need <= C / 2:
            break
        s2 = max(min(s, s_lo), s * (C / 2) / need)
        if need * s2 / s > N_MAX / 2:  # even the biggest cell is too small: shrink more (not the "free" frames)
            s2 = s * (N_MAX / 2) / need
        if s2 >= s - 1e-3:
            break
        s = s2
        done, u, halves, loose = run(s)
        half = max(halves.values(), default=0.0)
    if not done:
        return [Image.new("RGBA", (C, C), (0, 0, 0, 0)) for _ in spec], C, 1.0, 0
    N = max(C, 4 * math.ceil((half + MARGIN) / 2))          # even, multiple of 4
    o = cen - N / 2
    out, dropped = [], 0
    for i, d in enumerate(done):
        for hp, pix in loose.get(i, []):                    # loose particles past the cell: dropped whole
            if hp + MARGIN > N / 2:
                px = d.load()
                for q in pix:
                    px[q] = (0, 0, 0, 0)
                dropped += 1
        cell = Image.new("RGBA", (N, N), (0, 0, 0, 0))
        cell.paste(d, (int(u[0] - o), int(u[1] - o)))        # (only beam "join" frames reach past the cell sides)
        out.append(cell)
    return out, N, s, dropped


def build(move, colors=15, outline=True, pitch=25.0, poke_h=1.0, clamp=(0.6, 2.2, 1.5), seed=1, sheet=False, speck=4):
    key, events, notes, t_end = timeline(move)
    fwd = (math.cos(YAW), 0.0, math.sin(YAW))
    A, T = (0.0, 0.0, 0.0), mul(fwd, D_BATTLE)
    bA, bT = basis_facing(fwd), basis_facing(mul(fwd, -1))

    def loc(side, name):
        base, b = (A, bA) if side == "actor" else (T, bT)
        return add(base, to_world(b, LOCATORS.get(name, LOCATORS["middle"])))
    starts, used = [], []
    for t, side, name, locator, tloc in events:
        eff = Effect.get(name)
        if not eff:
            continue
        other = "target" if side == "actor" else "actor"
        starts.append((t, eff, loc(side, locator), bA if side == "actor" else bT, side,
                       loc(other, tloc) if tloc else None))
        used.append(dict(t=round(t, 3), side=side, effect=eff.id, locator=locator, target_locator=tloc))
    t_last = max([s[0] for s in starts], default=0) + 3.0
    world = World(move, seed)
    snaps = world.run(starts, t_last)
    cam = battle_cam(pitch)
    arch = move["vfx"]["archetype"]
    # the generic move effect (type impact + hit on the target, nothing travels): framed like a projectile's impact
    # (travelling archetypes: frames 5-8, the travel left empty for apply_official.py) or a contact hit (8 frames)
    arch_e = arch if key != "generic_move" else ("projectile" if arch in vfx.SPLIT else "contact")
    place = move["vfx"].get("cast", "body")
    a_loc = next((loc("actor", e[3]) for e in events if e[1] == "actor"), loc("actor", "middle"))
    t_loc = next((loc("target", e[3]) for e in events if e[1] == "target"), loc("target", "middle"))
    info = dict(action_effect=key, effects=used, notes=notes, archetype=arch, cast_place=place)

    fwd_d = lambda it: dot(sub(it["pos"], A), fwd)  # noqa: E731   (blocks from the user toward the target)
    # a self-KO burst (Explosion: orbs gather, then the boom on the user) has nothing on the target: the boom (the
    # user-side effects started last) is the EFFECT strip, the gathering before it the CAST
    late = set()
    a_ts = sorted({s[0] for s in starts if s[4] == "actor"})
    if arch == "burst" and len(a_ts) > 1 and not any(s[4] == "target" or s[5] is not None for s in starts):
        late = {s[1].id for s in starts if s[4] == "actor" and s[0] >= a_ts[-1] - 0.3}
        notes.append(f"self burst: the user-side effects from t={a_ts[-1] - 0.3:.2f} ({', '.join(sorted(late))}) are the effect strip")

    # ---- CAST: user-side particles that stay on the user
    is_cast = lambda it: it["side"] == "actor" and it["role"] == "cast" and it["root"] not in late  # noqa: E731
    ci = pick(snaps, is_cast, 8, 1.3)
    if ci:
        mode = "bottom" if place in ("back", "ground") else "center"
        origin = (A[0], 0.0, A[2]) if mode == "bottom" else a_loc
        groups, cen, k_c, opx = frame_set(snaps, ci, is_cast, cam, origin, mode, (2.6, 9.0, 0.6) if mode == "bottom" else (1.8, 1.8, 1.8))
        cast = [(g, cam, cen[0], opx, k_c, "") for g in groups]
        info["cast_times"] = [round(snaps[i][0], 2) for i in ci]
    else:
        cast, k_c = [None] * 8, None
        info["cast_times"] = []
        notes.append("upstream plays no particles on the user: the cast strip is empty (transparent)")

    # ---- EFFECT
    tgt = lambda it: it["side"] == "target"  # noqa: E731
    eff_frames, k_e, travel_k = [], None, None
    ground = (T[0], 0.0, T[2])
    if arch_e == "fall":
        # in the air: falling pieces and bolts; a cloud parked high in the sky (Thunder's storm cloud, 8 blocks up:
        # far above the Gen 3 screen) is not what falls, and it would come down over the target as one dark mass
        air = lambda it: tgt(it) and it["pos"][1] > 1.2 and (it["pos"][1] < 5.0 or it["spd"] > 2.0 or abs(it["hh"]) > 1.5)  # noqa: E731
        low = lambda it: tgt(it) and it["pos"][1] <= 1.6  # noqa: E731
        ti = pick(snaps, air, 4, 0.5)
        t_land = next((t for t, items in snaps if any(tgt(it) and it["pos"][1] < 0.5 for it in items)), 0.0)
        ii = pick(snaps, low, 4, 1.2, t_from=t_land)     # from the first rock landing
        k1 = frame_set(snaps, ti, air, cam, ground, "center", (2.0, 2.0, 2.0), track=True)[2] if ti else 1e9
        k2 = frame_set(snaps, ii, low, cam, ground, "bottom", (2.2, 3.0, 0.5))[2] if ii else 1e9
        k_e = min(k1, k2)                  # one scale for the falling rocks and the landing
        if ti:
            g1, c1, _, o1 = frame_set(snaps, ti, air, cam, ground, "center", (2.0, 2.0, 2.0), track=True, k=k_e)
            eff_frames = [(g, cam, c, o1, k_e, "") for g, c in zip(g1, c1)]
        while len(eff_frames) < 4:
            eff_frames.append(None)
        if ii:
            g2, c2, _, o2 = frame_set(snaps, ii, low, cam, ground, "bottom", (2.2, 3.0, 0.5), k=k_e)
            eff_frames += [(g, cam, c, o2, k_e, "") for g, c in zip(g2, c2)]
        info["effect_times"] = [round(snaps[i][0], 2) for i in ti + ii]
    elif arch_e in ("beam", "projectile", "wave", "sound", "powder"):
        trav = lambda it: it["side"] == "actor" and it["role"] == "travel"  # noqa: E731
        sc = side_cam(fwd)
        s0, s1 = 0.4 * D_BATTLE, 0.6 * D_BATTLE
        mid = add(A, mul(fwd, (s0 + s1) / 2))
        mid = (mid[0], a_loc[1] * 0.5 + t_loc[1] * 0.5, mid[2])
        mx = sc.p(mid)[0]

        def in_seg(it):               # the part of the beam halfway between the two Pokémon (once it reaches there)
            if not trav(it):
                return False
            cx, cy, ex, ey = screen_box(it, sc)
            return cx - ex < mx - 0.45 * (s1 - s0) and cx + ex > mx + 0.45 * (s1 - s0)
        def in_band(it):              # a spray (flames, water, gas) has no long quad: the particles over that segment
            if not trav(it):
                return False
            cx, cy, ex, ey = screen_box(it, sc)
            return abs(cx - mx) < 0.5 * (s1 - s0) + ex

        def centre_in_band(it):       # the spray particles drawn whole in the segment frame (never cut at its edges)
            return trav(it) and abs(screen_box(it, sc)[0] - mx) < 0.5 * (s1 - s0)
        ti = pick(snaps, in_seg if arch == "beam" else trav, 4, 0.5)
        tp = trav
        if not ti and arch != "beam":
            # nothing reads the target, but the user's particles fly toward it (a powder / sand spray thrown forward):
            # the ones that have left the user are the travelling part
            tp = lambda it: it["side"] == "actor" and 0.9 < fwd_d(it) < D_BATTLE - 0.9  # noqa: E731
            ti = pick(snaps, tp, 4, 0.5)
            if ti:
                notes.append("travel: no particle reads the target; used the user's particles thrown toward it")
        spray = False
        if not ti and arch == "beam":
            ti, spray = pick(snaps, in_band, 4, 0.5), True
            notes.append("beam: no single quad spans the segment, used the spray particles over it")
        if ti and arch == "beam":     # a beam segment seen side-on, filling the cell width (copies join along the path)
            travel_k = C / (s1 - s0)  # a spray: only the particles centred over the segment, drawn whole
            for i in ti:
                eff_frames.append(([it for it in snaps[i][1] if (centre_in_band(it) if spray else trav(it))], sc,
                                   sc.p(mid), (C / 2, C / 2), travel_k, "free" if spray else "join"))
        elif ti:
            g1, c1, k1, _ = frame_set(snaps, ti, tp, cam, a_loc, "center", (1.5, 1.5, 1.5), track=True)
            travel_k = k1
            eff_frames = [(g, cam, c, (C / 2, C / 2), k1, "free") for g, c in zip(g1, c1)]
        while len(eff_frames) < 4:
            eff_frames.append(None)
        ii = pick(snaps, tgt, 4, 1.2)
        if ii:
            iw = 2.4 if spray else 1.4   # a spray's impact (splash, flames) is wide: a bigger window, no hard clip
            g2, c2, k_e, o2 = frame_set(snaps, ii, tgt, cam, t_loc, "center", (iw, iw, iw))
            eff_frames += [(g, cam, c, o2, k_e, "") for g, c in zip(g2, c2)]
        info["effect_times"] = [round(snaps[i][0], 2) for i in ti + ii]
    elif arch_e in ("buff", "heal", "field"):
        # self moves: vfx.py never shows the cast strip (no cast phase), it plays the EFFECT strip on the user (an
        # aura) -> the user-side particles go in the effect strip, framed on the user
        own = lambda it: it["side"] == "actor"  # noqa: E731
        ii = pick(snaps, own, 8, 1.4)
        if ii:
            g2, c2, k_e, o2 = frame_set(snaps, ii, own, cam, a_loc, "center", (1.4, 1.4, 1.4))
            eff_frames = [(g, cam, c, o2, k_e, "") for g, c in zip(g2, c2)]
            notes.append("self move: the user-side particles are the effect strip (shown on the user)")
        info["effect_times"] = [round(snaps[i][0], 2) for i in ii]
    else:
        hit, o_e = tgt, t_loc
        ii = pick(snaps, hit, 8, 1.2 if arch != "quake" else 1.4)
        if not ii and late:              # self burst: the boom on the user
            hit, o_e = (lambda it: it["side"] == "actor" and it["root"] in late), a_loc
            ii = pick(snaps, hit, 8, 1.2)
        if not ii:                       # nothing on the target, but the user's particles fly there (Leech Seed's
            # seeds): the part of their flight that reaches the target
            hit = lambda it: it["side"] == "actor" and it["role"] == "travel" and fwd_d(it) > D_BATTLE - 1.6  # noqa: E731
            ii = pick(snaps, hit, 8, 1.2)
            if ii:
                notes.append("effect: nothing on the target; used the user's particles arriving there")
        if ii:
            if arch == "quake":
                g2, c2, k_e, o2 = frame_set(snaps, ii, hit, cam, ground, "bottom", (2.2, 2.5, 0.4))
            else:
                g2, c2, k_e, o2 = frame_set(snaps, ii, hit, cam, o_e, "center", (1.4, 1.4, 1.4))
            eff_frames = [(g, cam, c, o2, k_e, "") for g, c in zip(g2, c2)]
        info["effect_times"] = [round(snaps[i][0], 2) for i in ii]
    while len(eff_frames) < 8:
        eff_frames.append(None)
    if not k_e:
        notes.append("upstream plays no particles on the target")

    # keep the upstream world size: 1 block = the Pokémon's height (vfx.py: cast cell = 1.25 x the user's height,
    # impact cell = 1.5 x the target's height, quake = 1.25 x its size, beam impact = 1.1 x)
    rel_e = {"quake": 1.25, "beam": 1.1}.get(arch, 1.5)
    # never cut: fit each strip in its cell (re-render smaller, never so small that the -vfx.json scale would pass its
    # clamp and the effect would shrink on screen; else a bigger cell)
    lo_c = max(S_MIN, C / (1.25 * k_c * poke_h) / clamp[1]) if k_c else 1.0
    lo_e = max(S_MIN, C / (rel_e * k_e * poke_h) / clamp[2]) if k_e else 1.0
    cast, n_c, s_c, d_c = finish(cast[:8], colors, outline, speck, min(1.0, lo_c))
    eff_frames, n_e, s_e, d_e = finish(eff_frames[:8], colors, outline, speck, min(1.0, lo_e))
    k_c, k_e = k_c and k_c * s_c, k_e and k_e * s_e
    travel_k = travel_k and travel_k * s_e
    info["cells"] = dict(cast=n_c, effect=n_e, refit=dict(cast=round(s_c, 3), effect=round(s_e, 3)),
                         loose_dropped=dict(cast=d_c, effect=d_e))
    if n_c > C or n_e > C or s_c < 1 or s_e < 1 or d_c or d_e:
        notes.append(f"fit in the cell (never cut): cast {n_c} px x{s_c:.2f}, effect {n_e} px x{s_e:.2f}, "
                     f"{d_c + d_e} loose particles past the cell dropped whole")
    tweak = {}
    if k_c:
        tweak["cast"] = {"scale": round(max(clamp[0], min(clamp[1], C / (1.25 * k_c * poke_h))), 3)}   # cast <= 2.2
    if k_e:
        tweak["effect"] = {"scale": round(max(clamp[0], min(clamp[2], C / (rel_e * k_e * poke_h))), 3)}  # effect <= 1.5
    info.update(px_per_block=dict(cast=k_c and round(k_c, 2), effect=k_e and round(k_e, 2), travel=travel_k and round(travel_k, 2)),
                vfx_tweak=tweak, camera=dict(pitch=pitch, yaw_deg=45, distance_blocks=D_BATTLE),
                palette_colors=colors, outline=outline, warnings=sorted(w for w in WARN))
    d = os.path.join(OUT, move["gen"], vfx.move_folder(move))
    if not os.path.realpath(d).startswith(os.path.realpath(vfx.FALLBACK_DIR) + os.sep) and OUT == vfx.FALLBACK_DIR:
        raise SystemExit(f"refusing to write outside {vfx.FALLBACK_DIR}: {d}")
    os.makedirs(d, exist_ok=True)
    for kind, frames in (("cast", cast), ("effect", eff_frames)):
        N = frames[0].height
        strip = Image.new("RGBA", (N * 8, N), (0, 0, 0, 0))
        for i, f in enumerate(frames[:8]):
            strip.alpha_composite(f, (i * N, 0))
        if move["identifier"] in RECOLOR:
            strip = recolor(strip, RECOLOR[move["identifier"]])
        strip.save(os.path.join(d, f"{move['identifier']}-{kind}.png"))
    json.dump(tweak, open(os.path.join(d, f"{move['identifier']}-vfx.json"), "w"), indent=2)
    md = os.path.join(META, move["gen"], vfx.move_folder(move))
    os.makedirs(md, exist_ok=True)
    json.dump(info, open(os.path.join(md, f"{move['identifier']}-source.json"), "w"), indent=2, ensure_ascii=False)
    if sheet:
        Z = 3 if max(n_c, n_e) <= C else 2
        sh = Image.new("RGBA", (max(n_c, n_e) * 8 * Z, (n_c + n_e) * Z + 6), (120, 168, 96, 255))
        y = 0
        for frames in (cast, eff_frames):
            N = frames[0].height
            for i, f in enumerate(frames[:8]):
                sh.alpha_composite(f.resize((N * Z, N * Z), Image.NEAREST), (i * N * Z, y))
            y += N * Z + 6
        os.makedirs(os.path.join(META, "sheets"), exist_ok=True)
        sh.save(os.path.join(META, "sheets", f"{move['identifier']}.png"))
    return d, info


def mons_moves():
    return {m["identifier"]: m for m in json.load(open(os.path.join(vfx.REPO, "data", "battle", "moves.json"), encoding="utf-8"))["moves"]}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--move", action="append", default=[])
    ap.add_argument("--list", action="store_true", help="Mons moves that have their own upstream action effect")
    ap.add_argument("--all", action="store_true", help="convert every move listed by --list")
    ap.add_argument("--generic", action="store_true",
                    help="also convert every damaging move with no upstream effect of its own (its generic_move: the "
                         "type impact + hit on the target), recorded in assets/skills/Fallback/generic.json")
    ap.add_argument("--colors", type=int, default=15)
    ap.add_argument("--no-outline", action="store_true")
    ap.add_argument("--pitch", type=float, default=25.0, help="camera angle from above (degrees)")
    ap.add_argument("--pokemon-height", type=float, default=1.0, help="blocks that equal one Pokémon height")
    ap.add_argument("--sheet", action="store_true", help="also write tmp/fallback-vfx/sheets/<id>.png (x3)")
    a = ap.parse_args()
    ms = mons_moves()
    if a.list:
        base = action_dir()
        have = {os.path.basename(p)[:-5] for p in glob.glob(os.path.join(base, "*.json"))}
        rows = [m for m in ms.values() if source_key(m) in have]
        for m in rows:
            print(f"{m['identifier']:22} {m['gen']:12} {m['vfx']['archetype']:10} <- {source_key(m)}")
        print(f"{len(rows)} Mons moves have an upstream action effect ({len(have)} files)")
        return
    if a.all:
        base = action_dir()
        have = {os.path.basename(p)[:-5] for p in glob.glob(os.path.join(base, "*.json"))}
        a.move = [m["identifier"] for m in ms.values() if source_key(m) in have]
    if a.generic:
        base = action_dir()
        have = {os.path.basename(p)[:-5] for p in glob.glob(os.path.join(base, "*.json"))}
        a.move += [m["identifier"] for m in ms.values() if m["class"] != "status" and source_key(m) not in have]
    if not a.move:
        ap.error("--move, --all, --generic or --list")
    gen_path = vfx.FALLBACK_GENERIC
    generic = json.load(open(gen_path, encoding="utf-8")) if os.path.isfile(gen_path) else {}
    for q in a.move:
        m = ms.get(q.lower().replace(" ", "-")) or sys.exit(f"move {q} not found")
        WARN.clear()
        d, info = build(m, a.colors, not a.no_outline, a.pitch, a.pokemon_height, sheet=a.sheet)
        print(f"OK {m['identifier']}: {os.path.relpath(d, vfx.REPO)}  (from {info['action_effect']}, "
              f"{len(info['effects'])} effects, tweak {info['vfx_tweak']})")
        for w in info["warnings"]:
            print("  warn:", w)
        if info["action_effect"] == "generic_move":   # no own upstream effect: the generic type impact
            generic[m["identifier"]] = sorted({e["effect"] for e in info["effects"]})
        else:
            generic.pop(m["identifier"], None)
    json.dump(dict(sorted(generic.items())), open(gen_path, "w", encoding="utf-8"), indent=1)


if __name__ == "__main__":
    main()
