#!/usr/bin/env python3
"""
Write the prompt file of a move (Gen-3 battle screen): assets/skills/<GenX-Region>/<English name>/<identifier>-prompt.md
with its 2 image prompts:
  1. CAST   - the effect ON the Pokémon using the move (charge, aura, wind-up)  -> <identifier>-cast.png
  2. EFFECT - the move itself (frames 1-4 travelling, 5-8 impact; or 8 frames of one sequence) -> <identifier>-effect.png
Each image: 8 frames in a 4 x 2 grid on #FF00FF. Text = prompts/skills/README.md COMMON block + the archetype block
below + the move line (+ --note: how the move really looks).

usage:
  python3 move_prompt.py --move thunderbolt [--note "extra detail"] [--print]
  python3 move_prompt.py --move thunderbolt,flamethrower,surf
  python3 move_prompt.py --move eruption --note "lava bursts from the user's back, flaming rocks rain down"
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vfx  # noqa: E402

README = os.path.join(vfx.REPO, "prompts", "moves", "README.md")

CAST = {  # by damage class (+ archetype for status moves)
    "physical": "the Pokémon winds up for a physical attack: white speed lines and a dash streak around its body, small "
                "dust kicked up at the bottom, a few <TYPE>-coloured glints; frames 1-8 build up then release",
    "special": "the Pokémon gathers <TYPE> energy: <LOOK> particles are drawn in from the edges toward the centre and a "
               "<TYPE>-coloured ring of light pulses around the body, getting brighter from frame 1 to frame 8",
    "buff": "a power-up aura around the Pokémon: <TYPE>-coloured light rises from the bottom like flames / streaks, small "
            "sparkles orbit the body, a red-orange glow at its feet; loops from frame 8 back to frame 1",
    "heal": "a healing aura: soft green-white sparkles and small crosses rise around the Pokémon, a green glow at its feet; "
            "loops",
    "status": "the Pokémon prepares the move: <LOOK> particles swirl around the body with a faint <TYPE>-coloured ring",
}
EFFECT = {
    "contact": "8 frames of the hit landing ON the target: <VARIANT> in white with <TYPE>-coloured edges and small "
               "<LOOK> particles; frame 1 appears, frames 2-4 biggest and brightest, frames 5-8 break apart and fade",
    "projectile": "frames 1-4: the projectile in flight, moving to the RIGHT (a <LOOK> ball / blast with a short trail "
                  "on its left side), a loop; frames 5-8: it explodes on the target, a <TYPE> burst that grows then "
                  "fades",
    "beam": "frames 1-4: one SEGMENT of a horizontal <TYPE> beam / stream flowing to the RIGHT, filling the cell from the "
            "left edge to the right edge so copies join into a long beam (<LOOK> texture, bright core, darker edges), a "
            "loop; frames 5-8: the beam's impact splash on the target, growing then fading",
    "fall": "frames 1-4: the move coming DOWN from the sky onto the target, vertical, filling the cell from the top edge "
            "to the bottom edge (<LOOK>), a flickering loop; frames 5-8: the impact on the target / ground, a <TYPE> "
            "burst with debris, growing then fading",
    "wave": "frames 1-4: a wide <TYPE> wave / gust rolling to the RIGHT (<LOOK>), a loop; frames 5-8: it crashes over "
            "the target, splashing outward then fading",
    "sound": "frames 1-4: sound waves (curved arcs) and music notes travelling to the RIGHT, <TYPE>-coloured; frames "
             "5-8: concentric sound rings hitting the target, then fading",
    "powder": "frames 1-4: a drifting cloud of fine <LOOK> powder / spores moving to the RIGHT, a loop; frames 5-8: the "
              "powder settling over the target, sparkling then fading",
    "quake": "8 frames of a ground shock under the target: cracks spreading in the ground, rocks and dust bursting "
             "upward, growing to frame 4 then settling to frame 8",
    "burst": "8 frames of a <TYPE> explosion centred in the cell: a small bright core, expanding rings of <LOOK> energy "
             "and debris, biggest at frame 4, fading out by frame 8",
    "debuff": "8 frames of a weakening effect ON the target: <LOOK> particles circling inward, a dim blue-purple ring "
              "shrinking around the centre, small downward arrows; loops",
    "buff": "8 frames of the stat boost around the user: rising <TYPE>-coloured streaks and sparkles, one red upward "
            "arrow climbing; loops",
    "heal": "8 frames of healing around the user: green-white sparkles and plus signs rising, soft green rings; loops",
    "field": "8 frames of a small weather / field tile that is scattered over the whole screen: <LOOK> (e.g. rain "
             "drops, sun rays, sand, hail, glitter), each frame shifted so it loops",
}
SIGNATURE = {  # identifier -> {"cast": ..., "effect": ...}: how famous moves really look (replaces the archetype text)
    "earthquake": {
        "cast": "the Pokémon stomps the ground to start a quake, seen at its feet: frames 1-2 small dust puffs and a "
                "few pebbles at the bottom centre, frames 3-4 a flat brown shockwave ring bursts outward along the "
                "ground (a wide flat ellipse, bottom third of the frame) with short ground cracks radiating sideways, "
                "frames 5-6 chunks of earth and rocks jump up from the cracks with tan dust clouds, frames 7-8 the "
                "dust settles and the rocks drop back down. Everything stays low, in the bottom half of the frame",
        "effect": "8 frames of the quake hitting the ground UNDER the target, everything in the bottom half of the "
                  "frame and spreading wide: frame 1 a jagged dark crack opens across the ground, frames 2-3 the crack "
                  "splits wider into several branches and slabs of earth tilt up, frame 4 (biggest) sharp brown rock "
                  "spikes and boulders burst upward from the cracks with big tan dust clouds, frames 5-6 rocks and "
                  "pebbles fly up and fall back, dust spreading sideways, frames 7-8 the slabs sink back, cracks close "
                  "and the dust fades. Brown earth, dark brown cracks, tan / sand dust, grey-brown rocks",
    },
    "eruption": {
        "cast": "the Pokémon's back erupts like a volcano: ONE big plume coming straight up out of the bottom centre "
                "of the frame (its back). Frames 1-2: a small orange-red glow and embers at the bottom centre; frames "
                "3-5: a thick column of bright lava and fire shoots straight UP from the bottom centre to near the top, "
                "widening like a volcano plume (a mushroom of fire at the top); frames 6-8: the plume breaks into "
                "molten rocks flung up and outward with grey smoke puffs, fire shrinking back down. The heat glow is "
                "orange-red, never pink; dark red magma, orange fire, yellow-white hot core",
        "effect": "frames 1-4: a volley of 3-4 flaming molten rocks (dark red-brown rock with glowing orange cracks, "
                  "each trailing fire upward) falling DOWN from the top edge to the bottom edge, a loop; frames 5-8: the "
                  "rocks smash into the ground under the target: a big fiery explosion of lava splashes, fire columns "
                  "and black-grey smoke, biggest at frame 6, scattering embers and fading by frame 8",
    },
}
SIG_DIR = os.path.join(vfx.REPO, "prompts", "moves", "signatures")  # <genx-region>.json, same shape as SIGNATURE
for _f in sorted(os.listdir(SIG_DIR)) if os.path.isdir(SIG_DIR) else []:
    if _f.endswith(".json"):
        for _k, _v in json.load(open(os.path.join(SIG_DIR, _f), encoding="utf-8")).items():
            SIGNATURE.setdefault(_k, _v)
LOOK = {k: v for k, v in (
    ("normal", "white impact stars"), ("fire", "orange-red flames"), ("water", "blue water droplets and foam"),
    ("electric", "yellow zig-zag lightning and sparks"), ("grass", "green leaves"), ("ice", "pale blue ice shards"),
    ("fighting", "orange impact bursts"), ("poison", "purple sludge bubbles"), ("ground", "brown earth clods and dust"),
    ("flying", "white feathers and wind slashes"), ("psychic", "pink psychic rings"), ("bug", "yellow-green energy orbs"),
    ("rock", "grey-brown rock chunks"), ("ghost", "purple ghostly wisps"), ("dragon", "blue-violet dragon flames"),
    ("dark", "black shadow shards"), ("steel", "silver metallic glints"), ("fairy", "pink sparkles"))}
VARIANT = {"hit": "a 4-point impact star", "slash": "three diagonal claw slashes", "bite": "a pair of jaws snapping shut",
           "punch": "a fist impact", "kick": "a foot impact"}


def common():
    txt = open(README, encoding="utf-8").read()
    m = re.search(r"## COMMON \(2 images\)\s+```\n(.*?)```", txt, re.S)
    return m.group(1).strip() if m else ""


def hexes(typ):
    return ", ".join("#%02x%02x%02x" % c for c in vfx.PAL.get(typ, vfx.PAL["normal"])[:4])


def build(m, note=""):
    arch, typ = m["vfx"]["archetype"], m["type"]
    if m["class"] == "status":
        ck = "buff" if arch == "buff" else "heal" if arch == "heal" else "status"
    else:
        ck = m["class"]
    fill = lambda t: (t.replace("<TYPE>", typ).replace("<LOOK>", LOOK.get(typ, typ))
                      .replace("<VARIANT>", VARIANT.get(m["vfx"].get("variant", "hit"), "an impact")))
    head = (f"MOVE: {m['name']} ({typ} type, {m['class']}, {m['gen']}). Draw it the way it looks in the Pokémon games, "
            f"in Gen 3 GBA pixel style. Type palette: {hexes(typ)} (+ white and the outline colour).")
    d = vfx.move_dir(m)
    rel = os.path.relpath(d, vfx.REPO)
    out = {}
    sig = SIGNATURE.get(m["identifier"], {})
    place = {"back": " POSITION: the effect comes out of the Pokémon's BACK: it starts at the bottom CENTRE of the "
                     "frame and rises / bursts straight upward. The game draws this image BEHIND the Pokémon (its body "
                     "hides the lower middle), so the effect SHOULD fill the centre: one central plume, not two side "
                     "columns, not a ring or an arch around an empty middle.",
             "ground": " POSITION: the effect is on the GROUND around the Pokémon's feet: keep it in the bottom third "
                       "of the frame, spreading sideways."}.get(m["vfx"].get("cast", "body"), "")
    for kind, body, cell in (("cast", sig.get("cast") or fill(CAST[ck]), vfx.CAST_CELL),
                             ("effect", sig.get("effect") or fill(EFFECT[arch]), vfx.EFFECT_CELL)):
        on_body = ("keep the centre of every frame (the middle half) mostly empty so the Pokémon shows through, put "
                   "the effect around it and in front of it." if m["vfx"].get("cast", "body") == "body" else "")
        extra = ("IMAGE 1 of 2 - CAST, the effect drawn ON the Pokémon that uses the move. The Pokémon itself is NOT "
                 "drawn" + (": " + on_body if on_body else ".") + place if kind == "cast" else
                 "IMAGE 2 of 2 - EFFECT, the move itself, without any Pokémon.")
        ref = ("REFERENCE: the attached image shows how this move looks in the Pokémon games (any generation). Copy "
               "only its shapes, colours and motion; redraw everything in the GBA pixel style above and ignore any "
               "Pokémon, HP boxes, text, UI or background in it.")
        txt = "\n\n".join(x for x in (common(), extra, head, "FRAMES: " + body + ".", f"Extra: {note}" if note else "", ref) if x)
        raw = f"/tmp/mons-refs/move-{m['identifier']}-{kind}-raw.png"
        txt += (f"\n\n---\nAfter generating: save the image to {raw}, then run\n"
                f"python3 tools/skills/normalize_move.py --move {m['identifier']} --kind {kind} "
                f"--input {raw}\n(-> {rel}/{m['identifier']}-{kind}.png, 8 frames of {cell} px)\n")
        out[kind] = txt
    return out


def load_moves():
    return json.load(open(os.path.join(vfx.REPO, "data", "battle", "moves.json"), encoding="utf-8"))["moves"]


def norm(q):
    return re.sub(r"[^a-z0-9]+", "", q.lower())


def find(q, ms=None):
    """a move from its English name / identifier / folder name / id, forgiving case, spaces, hyphens, apostrophes"""
    ms = ms or load_moves()
    k = norm(q)
    for m in ms:
        if k in (norm(m["name"]), norm(m["identifier"]), str(m["id"])):
            return m
    import difflib
    names = {norm(m["name"]): m for m in ms}
    near = difflib.get_close_matches(k, list(names), n=3, cutoff=0.75)
    if len(near) >= 1:
        return names[near[0]]
    return None


def prompt_path(m):
    return os.path.join(vfx.move_dir(m), f"{m['identifier']}-prompt.md")


def write(m, note="", force=False):
    """write assets/skills/<Gen>/<Name>/<identifier>-prompt.md; keeps an existing (maybe hand-edited) file unless force/note"""
    p = prompt_path(m)
    if os.path.isfile(p) and not force and not note:
        return p, False
    os.makedirs(os.path.dirname(p), exist_ok=True)
    parts = build(m, note)
    txt = (f"# {m['name']} — move effect prompts\n\n"
           f"{m['type']} · {m['class']} · power {m['power']} · {m['gen']} · archetype `{m['vfx']['archetype']}`\n\n"
           f"2 images, each ONE `generate_image` call (single shot, ratio 16:9), 8 frames as a 4 x 2 grid on #FF00FF.\n\n"
           f"## Step 0 — reference image (search the web)\n\n"
           f"Search the web for how **{m['name']}** looks as a Pokémon move animation (any generation, the nicest clear "
           f"one: e.g. `Pokémon {m['name']} move animation`, Bulbapedia / Pokémon wiki move page, gameplay video "
           f"frames or GIF). Pick 1 image (or a frame of a GIF) where the effect is big and clear, save it as "
           f"`/tmp/mons-refs/move-{m['identifier']}-reference.png` and ATTACH it to both `generate_image` calls. "
           f"Nothing found → generate without it. Never commit the reference.\n\n"
           f"## Image 1 — CAST (on the Pokémon using the move) → `{m['identifier']}-cast.png`\n\n```\n{parts['cast'].split(chr(10) + '---')[0].strip()}\n```\n\n"
           f"## Image 2 — EFFECT (the move itself) → `{m['identifier']}-effect.png`\n\n```\n{parts['effect'].split(chr(10) + '---')[0].strip()}\n```\n\n"
           f"## After generating\n\n```bash\nS=tools/skills\n"
           f"python3 $S/normalize_move.py --move {m['identifier']} --kind cast   --input /tmp/mons-refs/move-{m['identifier']}-cast-raw.png\n"
           f"python3 $S/normalize_move.py --move {m['identifier']} --kind effect --input /tmp/mons-refs/move-{m['identifier']}-effect-raw.png\n"
           f"python3 $S/battle_preview.py --move {m['identifier']} --strips\n"
           f"python3 $S/battle_preview.py --move {m['identifier']} --attacker <slug> --target <slug>\n```\n")
    open(p, "w", encoding="utf-8").write(txt)
    return p, True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--move", required=True, help="English name(s) or identifiers, comma separated")
    ap.add_argument("--note", default=""); ap.add_argument("--print", action="store_true")
    ap.add_argument("--force", action="store_true", help="rewrite an existing prompt file")
    a = ap.parse_args()
    ms = load_moves()
    for q in a.move.split(","):
        m = find(q.strip(), ms)
        if not m:
            sys.exit(f"move '{q}' not found")
        p, made = write(m, a.note, a.force)
        print(os.path.relpath(p, vfx.REPO), "(written)" if made else "(exists, kept; --force to rewrite)")
        if a.print:
            print(open(p, encoding="utf-8").read())

if __name__ == "__main__":
    main()
