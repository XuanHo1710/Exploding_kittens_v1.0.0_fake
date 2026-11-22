#!/usr/bin/env python3
"""
Preview a move on the Gen-3 style battle screen (attacker bottom-left seen from behind, target top-right seen from the
front; --enemy makes the top-right Pokémon attack instead). Pokémon sprites come from their 2D movement sheets in
assets/pokemon/<Gen>/<NNN-Name>/<slug>-movement.png. Output: animated WebP (3x, 30 fps) + a PNG of the hit frame.

usage:
  python3 battle_preview.py --move ember --attacker charizard --target pikachu --out tmp/moves/ember.webp
  python3 battle_preview.py --move "Swords Dance" --attacker charizard --target pikachu --enemy
  python3 battle_preview.py --archetypes --attacker charizard --target pikachu --out tmp/moves/archetypes.png
  python3 battle_preview.py --particles --out tmp/moves/particles.png      # the 18 type particles, 4 frames each
  python3 battle_preview.py --move eruption --source fallback              # strips converted from upstream (fallback_vfx.py)
  python3 battle_preview.py --move hyper-beam --source code                # beams drawn by code (beams.py)
  python3 battle_preview.py --move ice-beam --compare --attacker charmander --target bulbasaur \
      --scene garden-tall-grass-trainer      # key frames agy / Fallback / Code, both sides -> tmp/report/moves/beam-compare-ice-beam.png
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vfx  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

MOVES = os.path.join(vfx.REPO, "data", "battle", "moves.json")


def find_move(q):
    ms = json.load(open(MOVES, encoding="utf-8"))["moves"]
    k = q.strip().lower().replace(" ", "-")
    for m in ms:
        if m["identifier"] == k or m["name"].lower() == q.strip().lower() or str(m["id"]) == q.strip():
            return m
    sys.exit(f"move '{q}' not found in {MOVES}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--move"); ap.add_argument("--attacker", default="charizard"); ap.add_argument("--target", default="pikachu")
    ap.add_argument("--enemy", action="store_true", help="the top-right Pokémon attacks the bottom-left one")
    ap.add_argument("--miss", action="store_true", help="the move misses: the target dodges")
    ap.add_argument("--scene", default="", help="battle background (BattleScenes): path or name, e.g. garden-tall-grass-trainer")
    ap.add_argument("--archetypes", action="store_true", help="contact sheet: one example move per archetype")
    ap.add_argument("--particles", action="store_true", help="contact sheet of the 18 type particles")
    ap.add_argument("--strips", action="store_true", help="show the 2 images of --move (CAST, EFFECT) frame by frame")
    ap.add_argument("--source", choices=vfx.SOURCES, default=None,
                    help="default (the official images in assets/skills/<Gen>/<Name>/, a code beam where the official folder has <id>-code.json, else procedural), fallback (force every image of the local Fallback library assets/skills/Fallback/) or code (every beam beams.py draws; other moves as default); env MONS_VFX_SOURCE")
    ap.add_argument("--compare", action="store_true",
                    help="key frames (charge, mid-fire, full beam, hit) of agy / Fallback / Code, both sides, in one sheet")
    ap.add_argument("--out", default="")
    a = ap.parse_args()
    vfx.use_scene(a.scene)
    if a.strips:
        m = find_move(a.move)
        cast, eff = vfx.move_strips(m, a.source)
        C = 96
        im = Image.new("RGBA", (8 * C + 70, 2 * C + 20), (64, 64, 80, 255))
        d = ImageDraw.Draw(im)
        for r, (lab, st) in enumerate((("1 CAST", cast), ("2 EFFECT", eff))):
            d.text((4, 10 + r * C + C // 2), lab, fill=(255, 255, 255, 255))
            for i, fr in enumerate(st[:8]):
                d.rectangle([70 + i * C, 10 + r * C, 70 + (i + 1) * C - 2, 10 + (r + 1) * C - 2], fill=(150, 200, 120, 255))
                im.alpha_composite(fr.resize((C, C), Image.NEAREST), (70 + i * C, 10 + r * C))
        out = a.out or os.path.join(vfx.REPO, "tmp", "moves", f"{m['identifier']}-strips.png")
        os.makedirs(os.path.dirname(out), exist_ok=True); im.save(out); print(out); return
    if a.particles:
        T = 48
        im = Image.new("RGBA", (4 * T + 90, 18 * T), (40, 40, 52, 255))
        d = ImageDraw.Draw(im)
        for r, t in enumerate(vfx.PAL):
            d.text((4, r * T + T // 2 - 5), t, fill=(255, 255, 255, 255))
            for f in range(4):
                im.alpha_composite(vfx.particle(t, f, 32), (90 + f * T + 8, r * T + 8))
        out = a.out or os.path.join(vfx.REPO, "tmp", "moves", "particles.png")
        os.makedirs(os.path.dirname(out), exist_ok=True); im.save(out); print(out); return
    if a.archetypes:
        demo = ["tackle", "ember", "flamethrower", "thunder", "surf", "earthquake", "explosion", "growl", "sleep-powder",
                "swords-dance", "leer", "recover", "rain-dance"]
        cols = 4
        sheet = Image.new("RGB", (cols * vfx.W * 2, ((len(demo) + cols - 1) // cols) * vfx.H * 2), (0, 0, 0))
        for i, k in enumerate(demo):
            m = find_move(k)
            fr = vfx.animate(m, a.attacker, a.target)
            c, t, h = vfx.timeline(m)
            pick = c + t + 3 + 6 if h else t // 2
            img = fr[min(pick, len(fr) - 1)].convert("RGB").resize((vfx.W * 2, vfx.H * 2), Image.NEAREST)
            ImageDraw.Draw(img).text((6, 4), m["vfx"]["archetype"], fill=(200, 20, 20))
            sheet.paste(img, ((i % cols) * vfx.W * 2, (i // cols) * vfx.H * 2))
        out = a.out or os.path.join(vfx.REPO, "tmp", "moves", "archetypes.png")
        os.makedirs(os.path.dirname(out), exist_ok=True); sheet.save(out); print(out); return
    if not a.move:
        ap.error("--move, --archetypes or --particles")
    m = find_move(a.move)
    if a.compare:
        out = a.out or os.path.join(vfx.REPO, "tmp", "report", "moves", f"beam-compare-{m['identifier']}.png")
        compare(m, a.attacker, a.target, out); print(out); return
    frames = vfx.animate(m, a.attacker, a.target, enemy_attacks=a.enemy, miss=a.miss, source=a.source)
    out = a.out or os.path.join(vfx.REPO, "tmp", "moves", f"{m['identifier']}{'-enemy' if a.enemy else ''}.webp")
    vfx.save(frames, out, scale=vfx.HI)
    c, t, h = vfx.timeline(m, a.source)
    keys = [c // 2, c + t // 2, c + t + 3 + 6] if h else [t // 4, t // 2, 3 * t // 4]   # cast, travel, hit
    fw, fh = frames[0].size
    strip = Image.new("RGB", (fw * 3, fh))
    for i, k in enumerate(keys):
        strip.paste(frames[min(len(frames) - 1, k)].convert("RGB"), (i * fw, 0))
    strip.save(out.rsplit(".", 1)[0] + ".png")  # 3 key frames: image 1 on the user, image 2 travelling, impact
    print(f"{out}  ({m['name']}: {m['type']} {m['class']}, archetype {m['vfx']})")


def key_steps(m, source):
    """steps of the 4 compared moments: charge, mid-fire, full beam, hit (code beams have their own timing)"""
    c, t, h = vfx.timeline(m, source)
    hit0 = c + t
    if vfx.code_beam(m, source):
        import beams
        return [int(c * 0.75), c + t // 2, hit0 + 6, hit0 + beams.HOLD + 1]
    return [int(c * 0.75), c + int(t * 0.35), c + int(t * 0.9), hit0 + 6]


def compare(m, attacker, target, out):
    """one sheet: rows Official / Fallback / Code for the player attacking, then the same 3 for the opponent attacking;
    columns = charge, mid-fire, full beam, hit (each source at its own timing)"""
    rows = []
    for enemy in (False, True):
        for lab, src in (("Official", "default"), ("Fallback", "fallback"), ("Code", "code")):
            if src == "fallback" and not vfx.has_source(m, "fallback"):
                rows.append((lab, enemy, None)); continue
            if src == "code" and not vfx.code_beam(m, "code"):
                rows.append((lab, enemy, None)); continue
            fr = vfx.animate(m, attacker, target, enemy_attacks=enemy, source=src)
            c, t, h = vfx.timeline(m, src)
            idx = [k if k <= c + t else k + 3 for k in key_steps(m, src)]      # +3: hit-stop frames
            rows.append((lab, enemy, [fr[min(len(fr) - 1, i)].convert("RGB") for i in idx]))
    fw, fh = next(r[2][0].size for r in rows if r[2])
    LW, TH = 150, 26
    sheet = Image.new("RGB", (LW + 4 * fw, TH + len(rows) * fh), (32, 36, 44))
    d = ImageDraw.Draw(sheet)
    for i, name in enumerate(("charge", "mid-fire", "full beam", "hit")):
        d.text((LW + i * fw + 8, 7), name, fill=(240, 240, 240))
    for r, (lab, enemy, frames) in enumerate(rows):
        y = TH + r * fh
        d.text((8, y + fh // 2 - 14), lab, fill=(255, 220, 120))
        d.text((8, y + fh // 2 + 2), ("opponent attacks" if enemy else "player attacks"), fill=(200, 200, 200))
        for i in range(4):
            if frames:
                sheet.paste(frames[i], (LW + i * fw, y))
            else:
                d.rectangle([LW + i * fw, y, LW + (i + 1) * fw - 1, y + fh - 1], fill=(60, 60, 66))
                d.text((LW + i * fw + 10, y + fh // 2), "no image for this source", fill=(180, 180, 180))
        d.line([(0, y), (sheet.width, y)], fill=(90, 90, 100))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.save(out)


if __name__ == "__main__":
    main()
