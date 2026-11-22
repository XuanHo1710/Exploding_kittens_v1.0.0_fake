#!/usr/bin/env python3
"""
Move viewer: a small web page to watch drawn moves on the Gen 3 battle screen with any two Pokémon.

  python3 tools/skills/move_viewer.py [--port 8765]
  (then e.g. `cloudflared tunnel --url http://127.0.0.1:8765` to open it on a phone)

- The move list is read from assets/skills/ on every request: a move appears when its official folder assets/skills/<Gen>/<Name>/ has
  an image (or a code-beam marker), when the local Fallback library assets/skills/Fallback/ has a converted image of it
  (fallback_vfx.py), or when beams.py can draw it.
- One main source (decisions.md §12, 2026-11-19): assets/skills/<Gen>/<Name>/ holds the official images of every move.
  Default view (`src=default`, "Chính thức") = what is there (a code beam when <id>-code.json is there; procedural
  when the folder has no image yet); each image is labelled with where it came from (data/battle/move-vfx-sources.json:
  Fallback / agy / code sinh, and "(Fallback trống)" etc. when it was filled from the next source).
- Comparison (`src=fallback`, vfx source "fallback"): every image of the Fallback library, approved or not; (`src=code`)
  the beams drawn by beams.py. The page never names the upstream project (user rule, THIRD_PARTY_NOTICES.md).
- Choice per move (radios "Mặc định / Fallback / agy / Code"): POST /api/official {move, source} stores it in
  data/battle/move-vfx-official.json and re-applies that move at once (apply_official.py writes assets/skills/<Gen>/<Name>/);
  "Mặc định" (source "default") clears the choice and applies the default rule (code beam -> Fallback -> agy's old
  drawing -> procedural, per image filled from the next source when empty). POST /api/apply applies every game move +
  every chosen move ("Áp dụng vào Skills"). The page has NO login and may be shared through a public tunnel: the two
  write endpoints accept only a move identifier from moves.json and a source from a fixed list (nothing from a request
  becomes a path), the body is limited to 2 KB, and writes go only to the move's own assets/skills/<Gen>/<Name>/ folder, the
  two data/battle/move-vfx-*.json files, assets/skills/LICENSE-Fallback.md and the tmp/history/ backups.
- Pick the player's Pokémon (seen from behind, bottom-left) and the opponent (seen from the front, top-right), see
  both of their battle views, pick a move and who uses it; frames come from vfx.animate, the same renderer as
  battle_preview.py and the move review, so the page shows exactly what the game shows.
- Only names from those lists are accepted (no paths); renders are cached in tmp/move-viewer/ (the key includes the
  source, the move's image dates, approved.json's and both move-vfx-*.json dates and vfx.py's / beams.py's dates).
- Sound (assets/third-party/reference-sounds/sounds.json, upstream sounds, decisions.md §16): /api/sound?move=<id>&part=actor|target|impact[&i=<n>]
  serves only files listed in the manifest. The page plays the actor sound on frame 0 and the target sound (or, for a
  damaging move with no own sound, one of its type's impact sounds; normal falls back to fighting) on the hit frame.
- Evolution page (/evolution, decisions.md §12b): the Gen 3 evolution sequence of the game (evolution_fx.py, the same
  per-frame logic as game/src/scenes/Evolve.ts) rendered with Pillow for a chosen pair, optionally stopped with B;
  /api/evo/list, /api/evo/render?pre=&post=&cancel=0|1 (frames in sheets of 100, cached in tmp/move-viewer/),
  /api/evo/sound?name=evo-full|evo-notify|evo-ui|cry[&slug=] (only manifest files).
- Catch page (/catch, "Bắt Pokémon"): the Gen 3 capture sequence of one Poké Ball sheet (assets/items/PokeBalls/) on the
  battle screen, rendered by expedition-summon-orb-generator/scripts/catch_anim.py: /api/catch/list, /api/catch/render?ball=&target=
  &player=&shakes=0-3&result=success|fail&scene= (frames in sheets of 50, cached in tmp/move-viewer/),
  /api/catch/frames/<key>-<n>.png, /api/catch/sound?name=<event>[&i=] (only the battle poke_ball files of the manifest).
"""
import argparse
import datetime
import glob
import hashlib
import io
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vfx  # noqa: E402
import beams  # noqa: E402
import apply_official  # noqa: E402
import evolution_fx  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "items"))
import catch_anim  # noqa: E402
from vfx import Image  # noqa: E402

REPO = vfx.REPO
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(REPO, "tmp", "move-viewer")
LOCK = threading.Lock()          # vfx keeps the scene / scale in module globals
MOVES = os.path.join(REPO, "data", "battle", "moves.json")
VI = os.path.join(REPO, "data", "battle", "move-names-vi.json")
SOUNDS = os.path.join(REPO, "assets", "third-party", "reference-sounds", "sounds.json")
SOUND_ROOT = os.path.join(REPO, "assets", "third-party", "reference-sounds")
IMPACT_FALLBACK = {"normal": "fighting"}    # the upstream sounds have no normal-type impact sounds
OFFICIAL = vfx.OFFICIAL_CHOICES   # data/battle/move-vfx-official.json: the user's choice per move
OFFICIAL_SOURCES = vfx.CHOICES    # ("fallback", "agy", "code")
WLOCK = threading.Lock()         # official choices / apply writes
MAX_BODY = 2048


def sound_manifest():
    try:
        return json.load(open(SOUNDS, encoding="utf-8"))
    except (OSError, ValueError):
        return {"moves": {}, "impact_by_type": {}}


def impact_files(man, typ):
    imp = man.get("impact_by_type", {})
    return imp.get(typ) or imp.get(IMPACT_FALLBACK.get(typ, ""), [])


def sound_file(move, part, i):
    """repo path of a manifest-listed sound, or None; never built from the query string"""
    man = sound_manifest()
    own = man.get("moves", {}).get(move["identifier"], {})
    files = impact_files(man, move["type"]) if part == "impact" else own.get(part, [])
    if not files:
        return None
    rel = files[i % len(files)]
    p = os.path.realpath(os.path.join(REPO, rel))
    return p if p.startswith(SOUND_ROOT + os.sep) and p.endswith(".ogg") and os.path.isfile(p) else None


PAGE_SRC = {"default": "default", "official": "default", "agy": "default", "fallback": "fallback",
            "code": "code"}   # page value -> vfx source (anything else: 404)


def has_code(m):
    """the move has a code-drawn version (beams.py)"""
    return vfx.can_code(m)


def strip_files(m, origin):
    """the move's strip files of one origin: 'official' (assets/skills/<Gen>/) or 'fallback' (assets/skills/Fallback/<Gen>/)"""
    return {k: p for k in vfx.KINDS if os.path.isfile(p := vfx.strip_path(m, k, origin))}


def game_moves():
    try:
        return apply_official.game_moves()
    except SystemExit:
        return set()


def compact(plan):
    return {k: plan[k] for k in ("source", "cast", "effect", "why")}


def moves_drawn():
    ms = json.load(open(MOVES, encoding="utf-8"))["moves"]
    vi = json.load(open(VI, encoding="utf-8"))["names"]
    snd = sound_manifest()
    game, choice, applied = game_moves(), vfx.official_choices(), vfx.applied_sources()
    out = []
    for m in ms:
        own = snd.get("moves", {}).get(m["identifier"], {})
        off, fb = strip_files(m, "official"), strip_files(m, "fallback")
        code = has_code(m)
        marker = os.path.isfile(vfx.code_marker(m))
        if not (off or fb or code or marker):
            continue
        can = {lib: vfx.usable(m, lib) for lib in OFFICIAL_SOURCES}
        plans = {"default": compact(vfx.official_plan(m, None))}
        plans.update({lib: compact(vfx.official_plan(m, lib)) for lib in OFFICIAL_SOURCES
                      if can[lib] or choice.get(m["identifier"]) == lib})
        rec = applied.get(m["identifier"])
        out.append(dict(id=m["identifier"], name=m["name"], vi=vi.get(m["identifier"]), type=m["type"],
                        cls=m["class"], gen=m["gen"], archetype=m["vfx"]["archetype"],
                        official=bool(off) or marker, fallback=bool(fb), code=code, game=m["identifier"] in game,
                        origin=vfx.strip_origins(m, "default"), origin_fb=vfx.strip_origins(m, "fallback"),
                        origin_code=vfx.strip_origins(m, "code"), can=can, plans=plans,
                        choice=choice.get(m["identifier"]),
                        rec={k: rec.get(k) for k in ("source", "explicit", "cast", "effect", "filled")} if rec else None,
                        sound=dict(actor=len(own.get("actor", [])), target=len(own.get("target", [])),
                                   impact=len(impact_files(snd, m["type"]))),
                        updated=max([os.path.getmtime(p) for p in list(off.values()) + list(fb.values())]
                                    or [os.path.getmtime(beams.__file__)])))
    return sorted(out, key=lambda x: -x["updated"]), {m["identifier"]: m for m in ms}


def pokemon():
    out = []
    for p in glob.glob(os.path.join(REPO, "assets", "units", "Gen*", "[0-9]*-*", "*-movement.png")):
        folder = os.path.basename(os.path.dirname(p))
        slug = os.path.basename(p)[: -len("-movement.png")]
        out.append(dict(slug=slug, dex=int(folder.split("-")[0]), name=folder.split("-", 1)[1],
                        battle=os.path.isfile(os.path.join(os.path.dirname(p), f"{slug}-battle.png"))))
    return sorted(out, key=lambda x: (x["dex"], x["slug"]))


def scenes():
    return sorted(os.path.basename(p)[:-4] for p in glob.glob(os.path.join(REPO, "assets", "battle-scenes", "*", "*.png"))
                  if not p.endswith("-wide.png"))


def proc_strip(move, kind):
    """the procedural strip vfx.py plays when there is no image (8 frames side by side)"""
    with LOCK:
        frames = (vfx.proc_cast if kind == "cast" else vfx.proc_effect)(move)
    return join(frames)


def join(frames):
    c = frames[0].height
    im = Image.new("RGBA", (c * len(frames), c), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        im.alpha_composite(f, (i * c, 0))
    return im


def png(im):
    b = io.BytesIO()
    im.save(b, "PNG", optimize=True)
    return b.getvalue()


def render(move, player, foe, foe_attacks, scene, source="default"):
    """frames of one move as a sprite sheet (8 columns) + durations; cached by the inputs, the source, the image dates,
    approved.json's and both move-vfx-*.json dates and the resulting origin of each image"""
    stamp = [os.path.getmtime(p) for d in (vfx.move_dir(move), vfx.fallback_dir(move))
             for p in sorted(glob.glob(os.path.join(d, f"{move['identifier']}-*"))) if p.endswith((".png", ".json"))]
    appr = [os.path.getmtime(p) if os.path.isfile(p) else 0 for p in (vfx.APPROVED, vfx.OFFICIAL_CHOICES, vfx.OFFICIAL_SOURCES)]
    origin = vfx.strip_origins(move, source)
    code = [os.path.getmtime(vfx.__file__), os.path.getmtime(beams.__file__)]   # the renderers themselves (a fix in
    # vfx.py or beams.py must not serve old renders)
    # per-species body anchors (<slug>-anchors.json: where a move comes out of) and the battle / movement sheets
    sprites = [os.path.getmtime(p) for s in (player, foe)
               for p in sorted(glob.glob(os.path.join(REPO, "assets", "units", "Gen*", "[0-9]*-*", f"{s}-*.*")))
               if p.endswith(("-anchors.json", "-battle.png", "-movement.png"))]
    key = hashlib.sha1(json.dumps([move["identifier"], move["vfx"], player, foe, foe_attacks, scene, source, stamp, appr,
                                   origin, code, sprites]).encode()).hexdigest()[:16]
    meta_p, sheet_p = os.path.join(CACHE, f"{key}.json"), os.path.join(CACHE, f"{key}.png")
    if os.path.isfile(meta_p) and os.path.isfile(sheet_p):
        return key, json.load(open(meta_p))
    with LOCK:
        vfx.use_scene(scene)
        # the player's Pokémon is bottom-left: it attacks unless the opponent does (enemy_attacks)
        attacker, target = (foe, player) if foe_attacks else (player, foe)
        frames = vfx.animate(move, attacker, target, enemy_attacks=foe_attacks, source=source)
        scale = vfx.HI
    frames = [(f if f.size == (vfx.W * scale, vfx.H * scale) else f.resize((vfx.W * scale, vfx.H * scale), Image.NEAREST)).convert("RGB")
              for f in frames]
    w, h = frames[0].size
    cols = 8
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGB", (w * cols, h * rows))
    for i, f in enumerate(frames):
        sheet.paste(f, ((i % cols) * w, (i // cols) * h))
    os.makedirs(CACHE, exist_ok=True)
    sheet.save(sheet_p, optimize=True)
    c, t, hit = vfx.timeline(move, source)
    meta = dict(w=w, h=h, cols=cols, n=len(frames), fps=30, phases=dict(cast=c, travel=t, hit=hit), origin=origin)
    json.dump(meta, open(meta_p, "w"))
    return key, meta


# ---------------------------------------------------------------- evolution page
EVO_SOUNDS = {"evo-full": "evolution_full.ogg", "evo-notify": "evolution_notification.ogg", "evo-ui": "evolution_ui.ogg"}
EVO_CHUNK, EVO_COLS = 100, 10


def evo_pairs():
    """evolution pairs of the game (game/public/assets/mons/mons.json 'evo') whose two species have sprites"""
    slugs = {p["slug"]: p for p in pokemon()}
    try:
        mons = json.load(open(os.path.join(REPO, "game", "public", "assets", "mons", "mons.json"), encoding="utf-8"))
    except (OSError, ValueError):
        mons = {}
    out = []
    for k, v in mons.items():
        evo = v.get("evo")
        if evo and k in slugs and evo[1] in slugs:
            out.append(dict(pre=k, post=evo[1], level=evo[0], pre_name=v["name"], post_name=mons[evo[1]]["name"],
                            dex=v["dex"]))
    return sorted(out, key=lambda x: x["dex"])


def evo_sound_file(name, slug):
    man = sound_manifest()
    if name == "cry":
        dex = next((p["dex"] for p in pokemon() if p["slug"] == slug), None)
        files = man.get("units", {}).get(str(dex), {}).get("cry", []) if dex else []
    elif name in EVO_SOUNDS:
        files = [f for f in man.get("battle", {}).get("evolution", []) if os.path.basename(f) == EVO_SOUNDS[name]]
    else:
        files = []
    if not files:
        return None
    p = os.path.realpath(os.path.join(REPO, files[0]))
    return p if p.startswith(SOUND_ROOT + os.sep) and p.endswith(".ogg") and os.path.isfile(p) else None


def evo_render(pre, post, cancel):
    """the sequence at 30 fps in sheets of EVO_CHUNK frames (EVO_COLS columns) + events; cached by the inputs and
    the dates of the renderer, the strips and the two species' sheets"""
    stamp = [os.path.getmtime(p) for p in (evolution_fx.__file__, vfx.__file__,
                                            os.path.join(evolution_fx.OFFICIAL, "evolution.json"))]
    sprites = [os.path.getmtime(p) for s in (pre, post)
               for p in sorted(glob.glob(os.path.join(REPO, "assets", "units", "Gen*", "[0-9]*-*", f"{s}-*.png")))]
    key = hashlib.sha1(json.dumps(["evo", pre, post, cancel, stamp, sprites]).encode()).hexdigest()[:16]
    meta_p = os.path.join(CACHE, f"evo-{key}.json")
    if os.path.isfile(meta_p):
        return key, json.load(open(meta_p))
    with LOCK:
        frames, events = evolution_fx.run(pre, post, cancel_at=150 if cancel else None)
    os.makedirs(CACHE, exist_ok=True)
    w, h = frames[0][1].size
    sheets = []
    for c in range(0, len(frames), EVO_CHUNK):
        part = frames[c:c + EVO_CHUNK]
        rows = (len(part) + EVO_COLS - 1) // EVO_COLS
        sh = Image.new("RGB", (w * EVO_COLS, h * rows))
        for i, (_, im) in enumerate(part):
            sh.paste(im, ((i % EVO_COLS) * w, (i // EVO_COLS) * h))
        sh.save(os.path.join(CACHE, f"evo-{key}-{len(sheets)}.png"), optimize=True)
        sheets.append(f"/api/evo/frames/{key}-{len(sheets)}.png")
    phases = []
    for i, (st, _) in enumerate(frames):
        if not phases or phases[-1][1] != st["phase"]:
            phases.append((i, st["phase"]))
    meta = dict(w=w, h=h, cols=EVO_COLS, chunk=EVO_CHUNK, n=len(frames), fps=30, sheets=sheets, phases=phases,
                events=[(f // 2, k, v) for f, k, v in events], pre=pre, post=post, cancel=bool(cancel))
    json.dump(meta, open(meta_p, "w"), ensure_ascii=False)
    return key, meta


# ---------------------------------------------------------------- catch page (Poké Ball capture sequence)
CATCH_CHUNK, CATCH_COLS = 50, 10


def catch_render(ball, target, player, shakes, success, scene):
    """the capture sequence at 30 fps in sheets of CATCH_CHUNK frames + sound events; cached by the inputs and the
    dates of the renderer, the ball sheet and the two species' sheets"""
    info = catch_anim.ball_info(ball)
    stamp = [os.path.getmtime(p) for p in (catch_anim.__file__, vfx.__file__, catch_anim.monsfont.__file__,
                                            info["png"], info["json"])]
    sprites = [os.path.getmtime(p) for s in (target, player)
               for p in sorted(glob.glob(os.path.join(REPO, "assets", "units", "Gen*", "[0-9]*-*", f"{s}-*.png")))]
    key = hashlib.sha1(json.dumps(["catch", ball, target, player, shakes, success, scene, stamp, sprites]).encode()
                       ).hexdigest()[:16]
    meta_p = os.path.join(CACHE, f"catch-{key}.json")
    if os.path.isfile(meta_p):
        return key, json.load(open(meta_p))
    with LOCK:
        frames, states, events, b = catch_anim.run(ball, target, shakes, success, player, scene or None)
    os.makedirs(CACHE, exist_ok=True)
    w, h = frames[0].size
    sheets = []
    for c in range(0, len(frames), CATCH_CHUNK):
        part = frames[c:c + CATCH_CHUNK]
        rows = (len(part) + CATCH_COLS - 1) // CATCH_COLS
        sh = Image.new("RGB", (w * CATCH_COLS, h * rows))
        for i, im in enumerate(part):
            sh.paste(im, ((i % CATCH_COLS) * w, (i // CATCH_COLS) * h))
        sh.save(os.path.join(CACHE, f"catch-{key}-{len(sheets)}.png"), optimize=True)
        sheets.append(f"/api/catch/frames/{key}-{len(sheets)}.png")
    phases = []
    for i, st in enumerate(states):
        if not phases or phases[-1][1] != st["phase"]:
            phases.append((i, st["phase"]))
    meta = dict(w=w, h=h, cols=CATCH_COLS, chunk=CATCH_CHUNK, n=len(frames), fps=30, sheets=sheets, phases=phases,
                events=events, notes=b.notes, ball=ball, target=target, shakes=shakes, success=success)
    json.dump(meta, open(meta_p, "w"), ensure_ascii=False)
    return key, meta


def catch_sound_file(name, i):
    """a battle poke_ball sound of the manifest for one event of the sequence, or None"""
    files = catch_anim.SOUND.get(name)
    if not files:
        return None
    listed = {os.path.basename(f): f for f in sound_manifest().get("battle", {}).get("poke_ball", [])}
    rel = listed.get(files[i % len(files)])
    if not rel:
        return None
    p = os.path.realpath(os.path.join(REPO, rel))
    return p if p.startswith(SOUND_ROOT + os.sep) and p.endswith(".ogg") and os.path.isfile(p) else None


# ---------------------------------------------------------------- official choice per move + apply to assets/skills/<Gen>/
def official_load():
    """{identifier: "fallback" | "agy" | "code"} (data/battle/move-vfx-official.json; "_updated" dropped)"""
    return vfx.official_choices()


def official_set(move_id, source):
    """store (or clear with source None) the choice, then re-apply that move into assets/skills/<Gen>/<Name>/; validated
    against moves.json and the images on disk (a source with no usable image of the move is refused)"""
    allm = apply_official.all_moves()
    m = allm.get(move_id) if isinstance(move_id, str) else None
    if not m:
        return None, None, "unknown move"
    if source is not None and (source not in OFFICIAL_SOURCES or not vfx.usable(m, source)):
        return None, None, "this source has no usable image for this move"
    with WLOCK:
        try:
            data = json.load(open(OFFICIAL, encoding="utf-8"))
        except (OSError, ValueError):
            data = {}
        data = {k: v for k, v in data.items() if not k.startswith("_") and v in OFFICIAL_SOURCES}
        if source is None:
            data.pop(move_id, None)
        else:
            data[move_id] = source
        out = dict(sorted(data.items()))
        out["_updated"] = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
        tmp = OFFICIAL + ".tmp"
        json.dump(out, open(tmp, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        os.replace(tmp, OFFICIAL)
        with LOCK:
            s = apply_official.apply([move_id])
    return data, s["applied"].get(move_id), None


def apply_all():
    """apply_official.py for every game move + every chosen move; returns the summary shown on the page"""
    with WLOCK, LOCK:
        s = apply_official.apply()
    return {k: v for k, v in s.items() if k != "applied"}


def applied_info():
    try:
        data = json.load(open(vfx.OFFICIAL_SOURCES, encoding="utf-8"))
        return {"updated": data.get("_updated"), **(data.get("_counts") or {})}
    except (OSError, ValueError):
        return None


class H(BaseHTTPRequestHandler):
    def send(self, code, body, ctype, cache=False):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "public, max-age=86400" if cache else "no-store")
        self.end_headers()
        self.wfile.write(body)

    def js(self, obj, code=200):
        self.send(code, json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8")

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))

    def do_POST(self):
        """the only write endpoints: /api/official {move, source} and /api/apply; anything else is refused"""
        u = urlparse(self.path)
        try:
            if u.path not in ("/api/official", "/api/apply"):
                return self.js({"error": "not found"}, 404)
            try:
                n = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                return self.js({"error": "bad length"}, 400)
            if n > MAX_BODY:
                return self.js({"error": "body too large"}, 413)
            raw = self.rfile.read(n) if n > 0 else b""
            if u.path == "/api/apply":
                return self.js(apply_all())
            try:
                body = json.loads(raw or b"{}")
            except ValueError:
                return self.js({"error": "bad JSON"}, 400)
            if not isinstance(body, dict) or set(body) - {"move", "source"}:
                return self.js({"error": "expected {move, source}"}, 400)
            src = body.get("source")
            if src not in OFFICIAL_SOURCES + (None, "default"):
                return self.js({"error": "unknown source"}, 400)
            data, rec, err = official_set(body.get("move"), None if src in (None, "default") else src)
            if err:
                return self.js({"error": err}, 400)
            return self.js({"official": data, "applied": rec})
        except Exception as e:   # noqa: BLE001
            return self.js({"error": f"{type(e).__name__}: {e}"}, 500)

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        try:
            if u.path in ("/", "/index.html"):
                return self.send(200, open(os.path.join(HERE, "move_viewer.html"), "rb").read(), "text/html; charset=utf-8")
            if u.path in ("/evolution", "/evolution.html"):
                return self.send(200, open(os.path.join(HERE, "evolution_viewer.html"), "rb").read(), "text/html; charset=utf-8")
            if u.path in ("/catch", "/catch.html"):
                return self.send(200, open(os.path.join(HERE, "catch_viewer.html"), "rb").read(), "text/html; charset=utf-8")
            if u.path == "/api/catch/list":
                return self.js(dict(balls=[dict(id=b["id"], name=b["name"]) for b in catch_anim.balls()],
                                    pokemon=pokemon(), scenes=scenes(), scene=catch_anim.DEFAULT_SCENE))
            if u.path == "/api/catch/render":
                slugs = {p["slug"] for p in pokemon()}
                ball, target, player = q.get("ball"), q.get("target"), q.get("player") or "none"
                sc = q.get("scene") or ""
                try:
                    shakes = int(q.get("shakes", "3"))
                except ValueError:
                    shakes = -1
                if (ball not in {b["id"] for b in catch_anim.balls()} or target not in slugs
                        or (player != "none" and player not in slugs) or (sc and sc not in scenes())
                        or shakes not in (0, 1, 2, 3) or q.get("result", "success") not in ("success", "fail")):
                    return self.js({"error": "unknown ball, Pokémon, scene or wobble count"}, 404)
                key, meta = catch_render(ball, target, player, shakes, q.get("result", "success") == "success", sc)
                return self.js(meta)
            if u.path.startswith("/api/catch/frames/"):
                name = u.path.rsplit("/", 1)[-1][:-4]
                key, _, idx = name.partition("-")
                if not (len(key) == 16 and all(c in "0123456789abcdef" for c in key) and idx.isdigit()):
                    return self.js({"error": "bad key"}, 404)
                p = os.path.join(CACHE, f"catch-{key}-{int(idx)}.png")
                if not os.path.isfile(p):
                    return self.js({"error": "not rendered"}, 404)
                return self.send(200, open(p, "rb").read(), "image/png", cache=True)
            if u.path == "/api/catch/sound":
                try:
                    i = max(0, int(q.get("i", "0")))
                except ValueError:
                    i = 0
                p = catch_sound_file(q.get("name"), i)
                if not p:
                    return self.js({"error": "no sound"}, 404)
                return self.send(200, open(p, "rb").read(), "audio/ogg", cache=True)
            if u.path == "/api/evo/list":
                return self.js(dict(pairs=evo_pairs(), pokemon=pokemon()))
            if u.path == "/api/evo/render":
                slugs = {p["slug"] for p in pokemon()}
                pre, post = q.get("pre"), q.get("post")
                if pre not in slugs or post not in slugs:
                    return self.js({"error": "unknown Pokémon"}, 404)
                key, meta = evo_render(pre, post, q.get("cancel") == "1")
                return self.js(meta)
            if u.path.startswith("/api/evo/frames/"):
                name = u.path.rsplit("/", 1)[-1][:-4]
                key, _, idx = name.partition("-")
                if not (len(key) == 16 and all(c in "0123456789abcdef" for c in key) and idx.isdigit()):
                    return self.js({"error": "bad key"}, 404)
                p = os.path.join(CACHE, f"evo-{key}-{int(idx)}.png")
                if not os.path.isfile(p):
                    return self.js({"error": "not rendered"}, 404)
                return self.send(200, open(p, "rb").read(), "image/png", cache=True)
            if u.path == "/api/evo/sound":
                name, slug = q.get("name"), q.get("slug")
                if name not in tuple(EVO_SOUNDS) + ("cry",) or (name == "cry" and slug not in {p["slug"] for p in pokemon()}):
                    return self.js({"error": "unknown sound"}, 404)
                p = evo_sound_file(name, slug)
                if not p:
                    return self.js({"error": "no sound"}, 404)
                return self.send(200, open(p, "rb").read(), "audio/ogg", cache=True)
            if u.path == "/api/list":
                drawn, _ = moves_drawn()
                return self.js(dict(moves=drawn, pokemon=pokemon(), scenes=scenes(), official=official_load(),
                                    applied=applied_info()))
            if u.path == "/api/sprite":
                slugs = {p["slug"] for p in pokemon()}
                slug, view = q.get("slug"), q.get("view")
                if slug not in slugs or view not in ("front", "back"):
                    return self.js({"error": "unknown Pokémon or view"}, 404)
                im = vfx.battle_sprite(slug, view, height=150, cap=200)
                return self.send(200, png(im), "image/png")
            if u.path == "/api/render":
                drawn, allm = moves_drawn()
                slugs = {p["slug"] for p in pokemon()}
                mv, pl, fo = q.get("move"), q.get("player"), q.get("foe")
                sc = q.get("scene") or ""
                src = PAGE_SRC.get(q.get("src") or "default")
                entry = next((m for m in drawn if m["id"] == mv), None)
                if not entry or pl not in slugs or fo not in slugs or (sc and sc not in scenes()) or not src:
                    return self.js({"error": "unknown move, Pokémon, scene or source"}, 404)
                if src == "fallback" and not entry["fallback"]:
                    return self.js({"error": "no Fallback version of this move"}, 404)
                if src == "code" and not entry["code"]:
                    return self.js({"error": "no Code version of this move"}, 404)
                key, meta = render(allm[mv], pl, fo, q.get("side") == "foe", sc, src)
                return self.js(dict(meta, src=f"/api/frames/{key}.png"))
            if u.path.startswith("/api/frames/"):
                key = u.path.rsplit("/", 1)[-1][:-4]
                if not (len(key) == 16 and all(c in "0123456789abcdef" for c in key)):
                    return self.js({"error": "bad key"}, 404)
                p = os.path.join(CACHE, f"{key}.png")
                if not os.path.isfile(p):
                    return self.js({"error": "not rendered"}, 404)
                return self.send(200, open(p, "rb").read(), "image/png", cache=True)
            if u.path == "/api/sound":
                _, allm = moves_drawn()
                mv, part = q.get("move"), q.get("part")
                try:
                    i = max(0, int(q.get("i", "0")))
                except ValueError:
                    i = 0
                if mv not in allm or part not in ("actor", "target", "impact"):
                    return self.js({"error": "unknown move or part"}, 404)
                p = sound_file(allm[mv], part, i)
                if not p:
                    return self.js({"error": "no sound"}, 404)
                return self.send(200, open(p, "rb").read(), "audio/ogg", cache=True)
            if u.path.startswith("/api/strip/"):
                mv, kind = u.path.split("/")[3:5] if len(u.path.split("/")) >= 5 else (None, None)
                drawn, allm = moves_drawn()
                src = PAGE_SRC.get(q.get("src") or "default")
                if mv not in {m["id"] for m in drawn} or kind not in vfx.KINDS or not src:
                    return self.js({"error": "unknown move"}, 404)
                origin = vfx.strip_origin(allm[mv], kind, src)    # the image that source actually plays
                if origin == "code":
                    with LOCK:
                        frames = beams.strips(allm[mv])[vfx.KINDS.index(kind)]
                    return self.send(200, png(join(frames)), "image/png")
                if origin == "procedural":
                    return self.send(200, png(proc_strip(allm[mv], kind)), "image/png")
                return self.send(200, open(vfx.strip_path(allm[mv], kind, origin), "rb").read(), "image/png")
            return self.js({"error": "not found"}, 404)
        except Exception as e:   # noqa: BLE001 - show the error on the page instead of a dropped connection
            return self.js({"error": f"{type(e).__name__}: {e}"}, 500)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    a = ap.parse_args()
    print(f"move viewer on http://127.0.0.1:{a.port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", a.port), H).serve_forever()


if __name__ == "__main__":
    main()
