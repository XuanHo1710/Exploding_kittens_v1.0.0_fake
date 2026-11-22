#!/usr/bin/env python3
"""
catch_anim: the Gen 3 capture sequence of one Poké Ball on the battle screen, rendered from the ball's sheet
(assets/items/PokeBalls/<Name-Ball>/<id>-ball.png + .json) with the move-vfx battle renderer (vfx.py: scene, battle sprites,
platform positions). Output: an animated WebP (30 fps, lossless, at the scene's own scale x2 = 480x320) and a
key-frame PNG strip.

  python3 catch_anim.py --ball poke --target bulbasaur [--success | --shakes 0-3] [--player charmander|none]
                        [--scene garden-tall-grass-wild] [--out tmp/report/pokeballs/catch-poke.webp]
  python3 catch_anim.py --all [--target bulbasaur]      every ball sheet on disk: catch-<id>.webp (success) +
                                                        catch-poke-fail.webp (break-out after 2 wobbles)

Sequence (data/battle/pokeball-animation.json "gen3", pokeemerald; GBA 60 fps -> 30 fps, 1 frame = 2 GBA frames):
  intro   12 f   text "Bạn ném một <ball>!" (as game/src/scenes/Battle.ts)
  throw   17 f   (34 GBA, 567 ms) arc from (32, 80) to the hit point, 40 px high; throw row looped 1 drawing / frame
  open     5 f   open row f1 (half open, 83 ms), f2 (wide open, 83 ms); the Pokémon fades to the ball's open colour
  absorb  14 f   (28 GBA, 467 ms) open row f3 (flash) then f4 (burst fading); the Pokémon shrinks 256 -> 1152 affine
                 (to 22 %) while sliding into the ball, then is hidden
  wait     5 f   open ball (f2), then close: f1 (half open) 3 f, closed 2 f
  fall    ~41 f  falls (40 px in Gen 3, here hit point -> platform) and bounces 2 more times at 50 / 25 % of the
                 fall height (3 ground hits; the bounce clip, which holds the taps, plays once at the first hit), phase step +4 / +5 / +6 per GBA frame
  rest    15 f   (31 GBA) then per wobble 14 f (27 GBA): roll left 8 GBA to -34 deg, pause 1, roll right 13 GBA to
                 +21 deg, back to 0 in 5 GBA; the ball rolls (slides r * angle); shake row f2 / f3 (left 15 / 30 deg),
                 f4 / f5 (right), f1 upright; 15 f (31 GBA) between wobbles
  success  20 f (40 GBA) wait, click (success f1, 2 f), darker ball + stars (f2, f3, f4: 4 f each = 24 GBA), the
                 closed ball darkened 6/16 until +60 GBA, then normal; text "Bắt được <TÊN>!", held 1.5 s
  fail     15 f (31 GBA) wait, break row f1 jolt / f2 lid bursts / f3 flash / f4 sparks (83 ms each); the Pokémon
                 grows back out of the ball (22 % -> 100 %, rising to its feet) and its colour fades back; text
                 "Ôi không! Nó thoát ra rồi!", held 1.3 s
The ball drawings are only taken from the sheet (a missing frame falls back to the closest drawn frame of that row,
then to another row, and is reported); code effects are only Gen 3's own (tint / shrink of the Pokémon, the 6/16
palette darkening).
"""
import argparse
import glob
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "../.."))
sys.path.insert(0, os.path.join(REPO, "tools/skills"))
sys.path.insert(0, os.path.join(REPO, "tools/ui"))
import vfx  # noqa: E402
from vfx import Image, ImageDraw  # noqa: E402
import monsfont  # noqa: E402

FACTS = os.path.join(REPO, "data", "battle", "pokeball-animation.json")
REPORT = os.path.join(REPO, "tmp", "report", "pokeballs")
ROW = {"throw": 0, "open": 1, "shake": 2, "success": 3, "break": 4, "icon": 5}
NFRAMES = {"throw": 8, "open": 4, "shake": 5, "success": 4, "break": 4, "icon": 1}
BALL_SCREEN = 12                            # the ball on the 240x160 screen: 12 px wide as in Gen 3 (16x16 OBJ)
BALL_R = BALL_SCREEN // 2
DEFAULT_SCENE = "garden-tall-grass-wild"
VI_NAMES = {"poke": "Poké Ball", "great": "Great Ball"}   # the game's own item names (game/src/items.ts)
SOUND = {  # event -> file names in assets/third-party/reference-sounds/sounds.json battle.poke_ball (the viewer plays them; not in the WebP)
    "throw": ["poke_ball_throw_1.ogg"], "hit": ["poke_ball_hit.ogg"], "open": ["poke_ball_open.ogg"],
    "recall": ["poke_ball_recall.ogg"], "shut": ["poke_ball_shut.ogg"], "bounce": ["poke_ball_bounce.ogg"],
    "shake": ["poke_ball_shake_1.ogg", "poke_ball_shake_2.ogg", "poke_ball_shake_3.ogg", "poke_ball_shake_4.ogg"],
    "capture": ["poke_ball_capture_succeeded.ogg"], "break": ["poke_ball_break.ogg"],
}


# ---------------------------------------------------------------- inputs
def balls():
    """every ball sheet on disk: [{id, name, png, json}] (a sheet whose .json is not written yet is skipped)"""
    out = []
    for js in sorted(glob.glob(os.path.join(REPO, "assets", "items", "PokeBalls", "*", "*-ball.json"))):
        png = js[:-5] + ".png"
        if not os.path.isfile(png):
            continue
        try:
            meta = json.load(open(js, encoding="utf-8"))
        except (OSError, ValueError):
            continue
        bid = meta.get("ball") or os.path.basename(js)[:-len("-ball.json")]
        out.append(dict(id=bid, name=meta.get("name") or bid.title() + " Ball", png=png, json=js))
    order = {b: i for i, b in enumerate(_ballkit_order())}
    return sorted(out, key=lambda b: (order.get(b["id"], 99), b["id"]))


def _ballkit_order():
    try:
        sys.path.insert(0, HERE)
        import ballkit
        return [b[0] for b in ballkit.BALLS]
    except Exception:   # noqa: BLE001
        return []


def ball_info(bid):
    return next((b for b in balls() if b["id"] == bid), None)


def facts():
    try:
        return json.load(open(FACTS, encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def species_name(slug):
    try:
        mons = json.load(open(os.path.join(REPO, "game", "public", "assets", "mons", "mons.json"), encoding="utf-8"))
        return mons[slug]["name"]
    except (OSError, ValueError, KeyError):
        return slug.replace("-", " ").upper()


class Ball:
    """the frames of one ball sheet at the output scale, with the fallbacks used (never a new drawing)"""

    def __init__(self, bid, hi, screen_px=None):
        info = ball_info(bid)
        if not info:
            raise SystemExit(f"no ball sheet for '{bid}' (assets/items/PokeBalls/<Name-Ball>/{bid}-ball.png + .json)")
        self.id, self.name = bid, info["name"]
        meta = json.load(open(info["json"], encoding="utf-8"))
        sheet = Image.open(info["png"]).convert("RGBA")
        # layout from the sheet's own .json (cell / scale / ball size / rows change when a sheet is re-normalized)
        cols = int(meta.get("cols", 8))
        scale = float(meta.get("scale", 2))
        rows_meta = meta.get("rows") or [dict(row=r, name=n, frames=NFRAMES[n]) for n, r in ROW.items()]
        cell = meta.get("cell")
        if isinstance(cell, (list, tuple)):                       # [w, h] native
            cw, ch = round(cell[0] * scale), round(cell[1] * scale)
        elif cell:
            cw = ch = round(cell * scale)
        else:
            cw = sheet.width // cols
            ch = sheet.height // max(len(rows_meta), max(int(r.get("row", 0)) for r in rows_meta) + 1)
        ball_sheet = float(meta.get("ball_px", 12)) * scale       # the ball's diameter in sheet px
        self.screen_px = screen_px or BALL_SCREEN                 # the ball's diameter on the 240x160 screen
        self.hi_ = hi
        k = self.screen_px * hi / ball_sheet                      # sheet px -> output px (the sheet only adds detail)
        base = meta.get("baseline_y")
        self.notes = []
        self.rows = {n: [None] * NFRAMES[n] for n in ROW}
        self.anchor = {}
        for rm in rows_meta:
            name, r = rm.get("name"), int(rm.get("row", 0))
            if name not in ROW:
                continue
            n = min(NFRAMES[name], int(rm.get("frames", NFRAMES[name])))
            # the ball centre inside a cell: the cell centre; the shake row stands on the baseline
            ay = (base - meta.get("ball_px", 12) / 2) * scale if (name == "shake" and base is not None) else ch / 2
            self.anchor[name] = (round(cw / 2 * k), round(ay * k))
            for i in range(n):
                if (r + 1) * ch > sheet.height or (i + 1) * cw > sheet.width:
                    continue
                cell = sheet.crop((i * cw, r * ch, (i + 1) * cw, (r + 1) * ch))
                if not cell.getbbox():
                    continue
                self._magenta(cell, name, i)
                if abs(k - 1) > 1e-6:
                    cell = vfx.shrink(cell, round(cell.width * k), round(cell.height * k))
                self.rows[name][i] = cell
        for name, fr in self.rows.items():
            miss = [i + 1 for i, f in enumerate(fr) if f is None]
            if len(miss) == len(fr):
                self.notes.append(f"{name} row: not drawn -> frames of another row used")
            elif miss:
                self.notes.append(f"{name} row: frame(s) {miss} empty -> closest drawn frame used")
            self.anchor.setdefault(name, (round(cw / 2 * k), round(ch / 2 * k)))
        self._dark = {}

    def _magenta(self, cell, row, i):
        px = cell.load()
        for y in range(cell.height):
            for x in range(cell.width):
                r, g, b, a = px[x, y]
                if a and r > 200 and b > 200 and g < 60:
                    self.notes.append(f"{row} f{i + 1}: magenta pixels in the sheet")
                    return

    FALLBACK = {"throw": ["icon", "shake"], "open": ["break"], "shake": ["icon", "throw"],
                "success": ["shake", "icon"], "break": ["open"], "icon": ["shake", "throw"]}

    def get(self, row, i):
        """frame i of a row; a missing one -> the nearest drawn frame of that row, then the same index / first drawn
        frame of the fallback rows"""
        fr = self.rows[row]
        i = max(0, min(len(fr) - 1, i))
        if fr[i] is not None:
            return fr[i]
        for d in range(1, len(fr)):
            for j in (i - d, i + d):
                if 0 <= j < len(fr) and fr[j] is not None:
                    return fr[j]
        for alt in self.FALLBACK[row]:
            af = self.rows[alt]
            if i < len(af) and af[i] is not None:
                return af[i]
            for f in af:
                if f is not None:
                    return f
        raise SystemExit(f"ball {self.id}: no drawing at all for row {row}")

    def place(self, row, i):
        """(image, anchor) of a frame: the anchor is the ball centre inside the image (output px)"""
        im = self.get(row, i)
        for name, fr in self.rows.items():
            if any(f is im for f in fr):
                return im, self.anchor[name]
        return im, (im.width // 2, im.height // 2)

    def has_ball(self, row, i):
        """True when the drawing of that frame has the ball body at its centre (some success / star frames were
        drawn with the stars only)"""
        key = ("has", row, i)
        if key not in self._dark:
            im, (ax, ay) = self.place(row, i)
            a = im.getchannel("A").load()
            r = self.screen_px * self.hi_ / 2 * 0.7
            pts = [(ax + dx, ay + dy) for dx in range(-int(r), int(r) + 1) for dy in range(-int(r), int(r) + 1)
                   if dx * dx + dy * dy <= r * r and 0 <= ax + dx < im.width and 0 <= ay + dy < im.height]
            self._dark[key] = bool(pts) and sum(1 for p in pts if a[p] > 0) / len(pts) > 0.6
        return self._dark[key]

    def closed(self):
        return self.get("shake", 0)

    def darkened(self):
        """Gen 3 success: the ball's palette blended 6/16 toward black (code, not a drawing)"""
        if "c" not in self._dark:
            im = self.closed()
            rgb = Image.blend(im.convert("RGB"), Image.new("RGB", im.size), 6 / 16)
            out = rgb.convert("RGBA")
            out.putalpha(im.getchannel("A"))
            self._dark["c"] = out
        return self._dark["c"]

    def open_colour(self):
        """gBallOpenFadeColors for the 12 Gen 3 balls; a later ball: its icon's main colour, lightened halfway"""
        f = (facts().get("gen3") or {}).get("open_fade_colours_bgr555", {}).get(self.id)
        if f:
            return tuple(round(v * 255 / 31) for v in f)
        im = self.get("icon", 0).convert("RGBA")
        counts = {}
        for r, g, b, a in (im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata()):
            if a and max(r, g, b) - min(r, g, b) > 40 and max(r, g, b) > 70:
                counts[(r, g, b)] = counts.get((r, g, b), 0) + 1
        if not counts:
            return (248, 248, 248)
        r, g, b = max(counts, key=counts.get)
        return tuple(round(v + (255 - v) * 0.5) for v in (r, g, b))


# ---------------------------------------------------------------- timeline
def shake_angles():
    """one Gen 3 wobble, angle per GBA frame (27 frames): -34 deg in 8, pause 1, +21 in 13, back to 0 in 5"""
    a = [-34 * g / 8 for g in range(1, 9)] + [-34.0]
    a += [-34 + 55 * g / 13 for g in range(1, 14)]
    a += [21 - 21 * g / 5 for g in range(1, 6)]
    return a


def shake_frame(angle):
    if angle <= -22:
        return 2
    if angle <= -8:
        return 1
    if angle >= 22:
        return 4
    if angle >= 8:
        return 3
    return 0


def timeline(target_h, shakes, success):
    """[state] at 30 fps. A state: phase, ball (row, i, x, y, dark) or None, mon (visible, tint 0-1, scale, cx, cy:
    the sprite's centre in native px) and text key; plus events [(frame, kind, value)]"""
    ex, ey = vfx.E_POS
    rest = (ex, ey - BALL_R - 1)                               # the ball rests on the platform, at the Pokémon's feet
    body = (ex, ey - target_h / 2)
    hit_y = max(rest[1] - 40, min(rest[1] - 24, body[1] - 16))  # Gen 3: target centre - 16, 40 px above the ground
    hit = (ex, hit_y)
    start = (32, 80)
    S, EV = [], []

    def add(phase, ball=None, mon=None, text="throw"):
        S.append(dict(phase=phase, ball=ball, mon=mon or dict(visible=True, tint=0.0, scale=1.0, cx=body[0], cy=body[1]),
                      text=text))

    def ev(kind, val=None):
        EV.append((len(S), kind, val))

    hidden = dict(visible=False)
    for _ in range(12):
        add("intro")
    ev("sound", "throw")
    for k in range(17):                                      # throw: 34 GBA frames
        t = (k + 1) / 17
        x = start[0] + (hit[0] - start[0]) * t
        y = start[1] + (hit[1] - start[1]) * t - 40 * math.sin(math.pi * t)
        add("throw", ("throw", k % 8, x, y, False))
    ev("sound", "hit")
    ev("sound", "open")
    for j, (fi, n) in enumerate(((0, 3), (1, 2))):           # half open 83 ms, open 83 ms; the Pokémon fades
        for q in range(n):
            g = (sum((3, 2)[:j]) + q + 1) / 5
            add("open", ("open", fi, *hit, False), dict(visible=True, tint=g, scale=1.0, cx=body[0], cy=body[1]))
    ev("sound", "recall")
    for j in range(14):                                      # absorb: 256 -> 1152 affine in 28 GBA frames
        t = (j + 1) / 14
        s = 256 / (256 + 896 * t)
        cx, cy = body[0] + (hit[0] - body[0]) * t, body[1] + (hit[1] - body[1]) * t
        add("absorb", ("open", 2 if j < 7 else 3, *hit, False), dict(visible=True, tint=1.0, scale=s, cx=cx, cy=cy))
    for _ in range(5):
        add("absorb", ("open", 1, *hit, False), hidden)
    ev("sound", "shut")
    for _ in range(3):
        add("close", ("open", 0, *hit, False), hidden)
    for _ in range(2):
        add("close", ("shake", 0, *hit, False), hidden)
    F = rest[1] - hit[1]                                     # fall + 2 bounces = 3 ground hits, 3 bounce sounds
    for n_, (h, step, a0) in enumerate(((F, 4, 64), (F * .5, 5, 0), (F * .25, 6, 0))):
        ph = a0
        while ph < 128:
            ph = min(128, ph + 2 * step)
            add("fall" if n_ == 0 else "bounce", ("shake", 0, rest[0], rest[1] - h * math.sin(math.pi * ph / 128), False),
                hidden)
        if n_ == 0:                                          # the 1 s bounce clip already holds the taps: play it once
            ev("sound", "bounce")
    for _ in range(15):                                      # 31 GBA frames before the first wobble
        add("rest", ("shake", 0, *rest, False), hidden)
    ang = shake_angles()
    for s in range(shakes):
        ev("sound", f"shake{s}")
        for g in range(1, len(ang), 2):
            a = ang[g]
            add("wobble", ("shake", shake_frame(a), rest[0] + BALL_R * math.radians(a), rest[1], False), hidden)
        add("wobble", ("shake", 0, *rest, False), hidden)
        if s < shakes - 1 or not success:
            for _ in range(15):
                add("rest", ("shake", 0, *rest, False), hidden)
    if success:
        for _ in range(20):                                  # +40 GBA frames: the click
            add("rest", ("shake", 0, *rest, False), hidden)
        ev("sound", "capture")
        click = len(S)
        for _ in range(2):
            add("click", ("success", 0, *rest, False), hidden, "caught")
        for i in (1, 2, 3):
            for _ in range(4):
                add("stars", ("success", i, *rest, False), hidden, "caught")
        while len(S) - click < 30:                           # +60 GBA: the palette fades back
            add("caught", ("shake", 0, *rest, True), hidden, "caught")
        for _ in range(45):
            add("caught", ("shake", 0, *rest, False), hidden, "caught")
    else:
        ev("sound", "break")
        brk = len(S)
        for fi, n in ((0, 3), (1, 2), (2, 3), (3, 2)):    # 83 ms each (2.5 frames)
            for _ in range(n):
                add("break", ("break", fi, *rest, False), hidden, "fled")
        # the Pokémon grows out from the lid burst (break f2) over 14 frames while rising, its colour fading back
        for j in range(14):
            t = (j + 1) / 14
            s = 256 / (256 + 896 * (1 - t))
            cx, cy = rest[0] + (body[0] - rest[0]) * t, rest[1] + (body[1] - rest[1]) * t
            m = dict(visible=True, tint=1.0 - max(0.0, (t - 0.4) / 0.6), scale=s, cx=cx, cy=cy)
            if brk + 3 + j < len(S):
                S[brk + 3 + j]["mon"] = m                    # under the break frames f2-f4
            else:
                add("emerge", None, m, "fled")
        for _ in range(40):
            add("free", None, None, "fled")
    return S, EV


# ---------------------------------------------------------------- drawing
_TEXT = {}


def text_layer(text):
    """the Gen 3 text box (vfx.text_box colours) with the Mons pixel font (every Vietnamese letter), 240x160 RGBA"""
    if text not in _TEXT:
        im = Image.new("RGBA", (vfx.W, vfx.H), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        T = vfx.TEXT_TOP
        d.rectangle([0, T, vfx.W - 1, vfx.H - 1], fill=(40, 80, 104, 255))
        d.rectangle([3, T + 3, vfx.W - 4, vfx.H - 4], fill=(248, 248, 248, 255), outline=(208, 112, 80, 255), width=2)
        monsfont.vdraw(im, 12, T + 14, text)
        _TEXT[text] = im
    return _TEXT[text]


def tinted(im, col, t):
    if t <= 0:
        return im
    rgb = Image.blend(im.convert("RGB"), Image.new("RGB", im.size, col), min(1.0, t))
    out = rgb.convert("RGBA")
    out.putalpha(im.getchannel("A"))
    return out


class Scene:
    def __init__(self, ball, target, player, scene, ball_px=None):
        vfx.use_scene(scene or DEFAULT_SCENE)
        self.hi = vfx.HI
        self.ball = ball if isinstance(ball, Ball) else Ball(ball, self.hi, ball_px)
        self.target = target
        self.t_h = vfx.sprite_height(target, "front")
        self.spr_e_lo = vfx.battle_sprite(target, "front")
        self.t_h = self.spr_e_lo.height
        self.spr_e = vfx.battle_sprite(target, "front", self.t_h * self.hi, 96 * self.hi)
        self.spr_p = None
        if player and player != "none":
            lo = vfx.battle_sprite(player, "back")
            self.spr_p = vfx.battle_sprite(player, "back", lo.height * self.hi, 96 * self.hi)
        self.col = self.ball.open_colour()
        for i in (1, 2, 3):
            if not self.ball.has_ball("success", i):
                self.ball.notes.append(f"success f{i + 1}: drawn without the ball -> darkened closed ball under it")
        bname = VI_NAMES.get(self.ball.id, self.ball.name)
        self.texts = {"throw": f"Bạn ném một {bname}!", "caught": f"Bắt được {species_name(target)}!",
                      "fled": "Ôi không! Nó thoát ra rồi!"}
        self.base = vfx.base_layer()
        if self.spr_p is not None:
            x, y = vfx.P_POS[0] * self.hi - self.spr_p.width // 2, vfx.P_POS[1] * self.hi - self.spr_p.height
            self.base.alpha_composite(self.spr_p, (x, y))
        self._mon = {}

    def mon(self, tint, scale):
        key = (round(tint * 16), round(scale * 64))
        if key not in self._mon:
            im = tinted(self.spr_e, self.col, key[0] / 16)
            if key[1] != 64:
                im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.NEAREST)
            self._mon[key] = im
        return self._mon[key]

    def frame(self, st):
        hi = self.hi
        fr = self.base.copy()
        m = st["mon"]
        if m.get("visible", True):
            im = self.mon(m["tint"], m["scale"])
            fr.alpha_composite(im, (round(m["cx"] * hi - im.width / 2), round(m["cy"] * hi - im.height / 2)))
        if st["ball"]:
            row, i, x, y, dark = st["ball"]
            layers = []
            if dark or (row == "success" and i > 0 and not self.ball.has_ball(row, i)):
                _, a0 = self.ball.place("shake", 0)              # Gen 3: the closed ball darkened 6/16 under the stars
                layers.append((self.ball.darkened(), a0))
            if not dark:
                layers.append(self.ball.place(row, i))
            for im, (ax, ay) in layers:
                px, py = round(x) * hi - ax, round(y) * hi - ay      # the ball centre on the native pixel grid
                fr.alpha_composite(im, (px, py))
        fr.alpha_composite(text_layer(self.texts[st["text"]]).resize(fr.size, Image.NEAREST))
        return fr.convert("RGB")


def run(ball, target, shakes=3, success=True, player="charmander", scene=None, ball_px=None):
    """-> (frames [RGB], states, events, Ball)"""
    sc = Scene(ball, target, player, scene, ball_px)
    states, events = timeline(sc.t_h, shakes, success)
    return [sc.frame(s) for s in states], states, events, sc.ball


# ---------------------------------------------------------------- files
def save_webp(frames, out, fps=30):
    """lossless animated WebP; identical consecutive frames merged (their durations summed)"""
    ms = 1000 / fps
    ims, durs = [], []
    prev = None
    for f in frames:
        b = f.tobytes()
        if b == prev:
            durs[-1] += ms
            continue
        prev = b
        ims.append(f)
        durs.append(ms)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    d = [int(round(sum(durs[:i + 1]))) - int(round(sum(durs[:i]))) for i in range(len(durs))]
    ims[0].save(out, save_all=True, append_images=ims[1:], duration=d, loop=0, lossless=True, method=4)
    return out


def key_strip(frames, states, out, cols=4):
    """the middle frame of every phase, labelled, cols per row at the output scale"""
    picks, i = [], 0
    while i < len(states):
        j = i
        while j < len(states) and states[j]["phase"] == states[i]["phase"]:
            j += 1
        mid = i + (j - i) // 2 if states[i]["phase"] not in ("intro", "free", "caught") else min(j - 1, i + 2)
        picks.append((f"{states[i]['phase']} {i / 30:.2f}s", frames[mid]))
        i = j
    picks = picks[:16]
    w, h = frames[0].size
    rows = (len(picks) + cols - 1) // cols
    sh = Image.new("RGB", (cols * w, rows * (h + 16)), (20, 20, 28))
    d = ImageDraw.Draw(sh)
    for k, (lbl, im) in enumerate(picks):
        x, y = (k % cols) * w, (k // cols) * (h + 16)
        sh.paste(im, (x, y + 16))
        d.text((x + 4, y + 2), lbl, fill=(230, 230, 230))
    sh.save(out, optimize=True)
    return out


def render_file(bid, target, shakes, success, player, scene, out, ball_px=None):
    frames, states, events, ball = run(bid, target, shakes, success, player, scene, ball_px)
    save_webp(frames, out)
    strip = key_strip(frames, states, out[:-5] + "-keys.png")
    return out, strip, ball.notes, len(frames)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ball", default="poke")
    ap.add_argument("--all", action="store_true", help="every ball on disk (success) + catch-poke-fail")
    ap.add_argument("--target", default="bulbasaur")
    ap.add_argument("--player", default="charmander", help="the player's Pokémon (back view), or none")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--success", action="store_true", help="3 wobbles, then caught (default)")
    g.add_argument("--shakes", type=int, choices=range(0, 4), help="0-3 wobbles, then it breaks out")
    ap.add_argument("--scene", default=DEFAULT_SCENE)
    ap.add_argument("--out")
    ap.add_argument("--ball-px", type=int, help=f"ball diameter on the 240x160 screen (default {BALL_SCREEN}, Gen 3)")
    ap.add_argument("--index", help="write the produced files, one per line (with --all)")
    a = ap.parse_args()
    jobs = []
    if a.all:
        for b in balls():
            jobs.append((b["id"], 3, True, os.path.join(REPORT, f"catch-{b['id']}.webp")))
        if ball_info("poke"):
            jobs.append(("poke", 2, False, os.path.join(REPORT, "catch-poke-fail.webp")))
    else:
        success = a.shakes is None
        shakes = 3 if success else a.shakes
        out = a.out or os.path.join(REPORT, f"catch-{a.ball}{'' if success else f'-fail{shakes}'}.webp")
        jobs.append((a.ball, shakes, success, out))
    produced = []
    for bid, shakes, success, out in jobs:
        out = out if os.path.isabs(out) else os.path.join(REPO, out)
        try:
            webp, strip, notes, n = render_file(bid, a.target, shakes, success, a.player, a.scene, out, a.ball_px)
        except SystemExit as e:                              # one unusable sheet must not stop --all
            if not a.all:
                raise
            print(f"{bid}: SKIPPED ({e})")
            continue
        produced += [webp, strip]
        print(f"{bid}: {os.path.relpath(webp, REPO)} ({n} frames, {n / 30:.1f} s){' | ' + '; '.join(notes) if notes else ''}")
    if a.index:
        p = a.index if os.path.isabs(a.index) else os.path.join(REPO, a.index)
        with open(p, "w", encoding="utf-8") as f:
            f.write("".join(x + "\n" for x in produced))
        print(f"index: {os.path.relpath(p, REPO)}")


if __name__ == "__main__":
    main()
