#!/usr/bin/env python3
"""
A short Gen-3 style battle between two Pokémon, turn by turn, to demo the move animations:
HP boxes (name, level, HP bar draining), "used MOVE!", effectiveness messages, faint animation.

usage:
  python3 battle_demo.py --player charizard --foe pikachu \
      --turns "p:flamethrower,f:thunderbolt,p:swords-dance,f:quick-attack,p:earthquake" \
      [--out tmp/moves/battle-demo.webp] [--level 50]
Types come from the species lists assets/pokemon/<Gen>/gen*.md; damage is a simplified Gen-3 formula (demo only).
"""
import argparse
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vfx  # noqa: E402
from vfx import Image, ImageDraw, W, H  # noqa: E402

CHART = {  # attacking type -> {defending type: multiplier} (only non-1 entries)
    "normal": {"rock": .5, "ghost": 0, "steel": .5}, "fire": {"fire": .5, "water": .5, "grass": 2, "ice": 2, "bug": 2, "rock": .5, "dragon": .5, "steel": 2},
    "water": {"fire": 2, "water": .5, "grass": .5, "ground": 2, "rock": 2, "dragon": .5},
    "electric": {"water": 2, "electric": .5, "grass": .5, "ground": 0, "flying": 2, "dragon": .5},
    "grass": {"fire": .5, "water": 2, "grass": .5, "poison": .5, "ground": 2, "flying": .5, "bug": .5, "rock": 2, "dragon": .5, "steel": .5},
    "ice": {"fire": .5, "water": .5, "grass": 2, "ice": .5, "ground": 2, "flying": 2, "dragon": 2, "steel": .5},
    "fighting": {"normal": 2, "ice": 2, "poison": .5, "flying": .5, "psychic": .5, "bug": .5, "rock": 2, "ghost": 0, "dark": 2, "steel": 2, "fairy": .5},
    "poison": {"grass": 2, "poison": .5, "ground": .5, "rock": .5, "ghost": .5, "steel": 0, "fairy": 2},
    "ground": {"fire": 2, "electric": 2, "grass": .5, "poison": 2, "flying": 0, "bug": .5, "rock": 2, "steel": 2},
    "flying": {"electric": .5, "grass": 2, "fighting": 2, "bug": 2, "rock": .5, "steel": .5},
    "psychic": {"fighting": 2, "poison": 2, "psychic": .5, "dark": 0, "steel": .5},
    "bug": {"fire": .5, "grass": 2, "fighting": .5, "poison": .5, "flying": .5, "psychic": 2, "ghost": .5, "dark": 2, "steel": .5, "fairy": .5},
    "rock": {"fire": 2, "ice": 2, "fighting": .5, "ground": .5, "flying": 2, "bug": 2, "steel": .5},
    "ghost": {"normal": 0, "psychic": 2, "ghost": 2, "dark": .5}, "dragon": {"dragon": 2, "steel": .5, "fairy": 0},
    "dark": {"fighting": .5, "psychic": 2, "ghost": 2, "dark": .5, "fairy": .5},
    "steel": {"fire": .5, "water": .5, "electric": .5, "ice": 2, "rock": 2, "steel": .5, "fairy": 2},
    "fairy": {"fire": .5, "fighting": 2, "poison": .5, "dragon": 2, "dark": 2, "steel": .5},
}


def species_types(slug):
    for md in glob.glob(os.path.join(vfx.REPO, "assets", "units", "Gen*", "gen*.md")):
        for line in open(md, encoding="utf-8"):
            m = re.match(r"^\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|", line)
            if m and re.sub(r"[^a-z0-9]+", "-", m.group(1).lower()).strip("-") == slug:
                return [t.split("(")[0].strip().lower() for t in m.group(2).split("/")]
    return ["normal"]


def hp_box(fr, foe, name, lv, hp, maxhp):
    d = ImageDraw.Draw(fr)
    x0, y0, x1, y1 = (8, 8, 112, 36) if foe else (128, 74, 234, 107)   # above the text box (y 112)
    d.rounded_rectangle([x0, y0, x1, y1], 4, fill=(248, 248, 216, 255), outline=(64, 72, 64, 255), width=2)
    d.text((x0 + 6, y0 + 3), name.upper(), fill=(64, 64, 64, 255))
    d.text((x1 - 30, y0 + 3), f"Lv{lv}", fill=(64, 64, 64, 255))
    bx0, by = x0 + 34, y0 + 17
    d.rectangle([bx0 - 22, by - 2, x1 - 6, by + 4], fill=(80, 88, 80, 255))
    d.text((bx0 - 20, by - 4), "HP", fill=(248, 200, 64, 255))
    frac = max(0.0, hp / maxhp)
    col = (88, 208, 128) if frac > .5 else (248, 200, 64) if frac > .2 else (240, 88, 64)
    if frac > 0:
        d.rectangle([bx0, by, bx0 + max(1, int((x1 - 8 - bx0) * frac)), by + 2], fill=col + (255,))
    if not foe:
        d.text((x1 - 46, by + 6), f"{max(0, round(hp)):>3}/{maxhp}", fill=(64, 64, 64, 255))


def still(player, foe, text, sp, sf, foe_off=(0, 0), player_off=(0, 0), hide=(), faint=None):
    """one frame at the output scale (Pokémon drawn sharp at x HI); faint = (who, i, n): flinch, topple away, sink into
    the platform, fade (drawn FAINT row of <slug>-battle.png when the species has it)"""
    HI = vfx.HI
    draws = []
    for who, spr, pos, off in (("foe", sf, vfx.E_POS, foe_off), ("player", sp, vfx.P_POS, player_off)):
        if who in hide:
            continue
        slug = foe if who == "foe" else player
        view = "front" if who == "foe" else "back"
        hi_h = spr.height * HI
        if faint and faint[0] == who:
            away = 1 if who == "foe" else -1             # falls away from the other Pokémon
            sx, sy, rot, dx, dy, sink, alpha = vfx.faint_pose(faint[1], faint[2], away)
            i, n = faint[1], faint[2]
            drawn = vfx.battle_frame(slug, view, "faint", min(5, i * 6 // max(1, int(n * 0.6))), hi_h)
            if drawn:                                    # level B: the drawn faint, then it sinks and fades
                img, (fx, fy) = drawn
                t = max(0.0, (i / max(1, n - 1) - 0.6) / 0.4)
                sink, alpha, dx, dy = t * 0.8, 1.0 - 0.6 * t, 0, 0
            else:
                img, (fx, fy) = vfx.posed(vfx.battle_sprite(slug, view, hi_h, 96 * HI), sx, sy, rot)
            if alpha < 1:
                img = img.copy(); img.putalpha(img.split()[3].point(lambda v: int(v * alpha)))
            down = int(sink * hi_h)
            x0, y0 = pos[0] * HI - fx + int(dx * HI), pos[1] * HI - fy + int(dy * HI) + down
            keep = max(0, (pos[1] + 2) * HI - y0)        # rows above the platform line stay visible
            if keep <= 0:
                continue
            draws.append((img.crop((0, 0, img.width, min(img.height, keep))), (x0, y0)))
        else:
            hi = vfx.battle_sprite(slug, view, hi_h, 96 * HI)
            draws.append((hi, (pos[0] * HI - hi.width // 2 + off[0] * HI, pos[1] * HI - hi.height + off[1] * HI)))
    front = vfx.Image.new("RGBA", (W, H), (0, 0, 0, 0))
    vfx.text_box(front, text)
    return vfx.compose(vfx.Image.new("RGBA", (W, H), (0, 0, 0, 0)), draws, front)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--player", default="charizard"); ap.add_argument("--foe", default="pikachu")
    ap.add_argument("--turns", default="p:flamethrower,f:thunderbolt,p:swords-dance,f:quick-attack,p:earthquake")
    ap.add_argument("--level", type=int, default=50); ap.add_argument("--out", default="")
    ap.add_argument("--scene", default="", help="battle background: assets/battle-scenes/<district>/<name>.png or just <name>, "
                                                "e.g. garden-tall-grass-trainer")
    a = ap.parse_args()
    vfx.use_scene(a.scene)
    moves = {m["identifier"]: m for m in json.load(open(os.path.join(vfx.REPO, "data", "battle", "moves.json"), encoding="utf-8"))["moves"]}
    side = {"p": {"slug": a.player, "types": species_types(a.player), "hp": 140.0, "max": 140, "atk": 1.0},
            "f": {"slug": a.foe, "types": species_types(a.foe), "hp": 110.0, "max": 110, "atk": 1.0}}
    sp, sf = vfx.battle_sprite(a.player, "back"), vfx.battle_sprite(a.foe, "front")
    frames = []

    def push(fr, n=1):
        ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))   # HP boxes on their own layer, scaled like the scene
        hp_box(ov, True, side["f"]["slug"].replace("-", " "), a.level, side["f"]["hp"], side["f"]["max"])
        hp_box(ov, False, side["p"]["slug"].replace("-", " "), a.level, side["p"]["hp"], side["p"]["max"])
        big = fr.copy()
        big.alpha_composite(ov.resize(big.size, Image.NEAREST))
        frames.extend([big] * n)

    push(still(a.player, a.foe, f"Wild {a.foe.upper()} appeared!", sp, sf), 30)
    push(still(a.player, a.foe, f"Go! {a.player.upper()}!", sp, sf), 24)
    for turn in a.turns.split(","):
        who, mid = turn.split(":")
        miss = mid.strip().endswith("!miss")             # "f:tackle!miss": the move misses, the target dodges
        mid = mid.replace("!miss", "")
        att, dfd = side[who], side["f" if who == "p" else "p"]
        if att["hp"] <= 0 or dfd["hp"] <= 0:
            break
        m = moves[mid.strip()]
        for fr in vfx.animate(m, att["slug"], dfd["slug"], enemy_attacks=(who == "f"), miss=miss):
            push(fr)
        msgs = []
        if miss:
            push(still(a.player, a.foe, f"{'Foe ' if who == 'f' else ''}{att['slug'].upper()}'s attack missed!", sp, sf), 26)
            continue
        if m["class"] == "status":
            if m["vfx"]["archetype"] == "buff":
                att["atk"] *= 2 if mid in ("swords-dance", "dragon-dance", "nasty-plot") else 1.5
                msgs.append(f"{att['slug'].upper()}'s ATTACK rose!")
        else:
            eff = 1.0
            for t in dfd["types"]:
                eff *= CHART.get(m["type"], {}).get(t, 1.0)
            stab = 1.5 if m["type"] in att["types"] else 1.0
            dmg = (m["power"] or 40) * 0.42 * stab * eff * att["atk"]
            start, end = dfd["hp"], max(0.0, dfd["hp"] - dmg)
            for i in range(1, 19):  # HP drains like the GBA games
                dfd["hp"] = start + (end - start) * i / 18
                push(still(a.player, a.foe, f"{'Foe ' if who == 'f' else ''}{att['slug'].upper()} used {m['name'].upper()}!", sp, sf))
            if eff > 1: msgs.append("It's super effective!")
            elif 0 < eff < 1: msgs.append("It's not very effective...")
            elif eff == 0: msgs.append(f"It doesn't affect {dfd['slug'].upper()}...")
        for t in msgs:
            push(still(a.player, a.foe, t, sp, sf), 26)
        if dfd["hp"] <= 0:
            foe_down = dfd is side["f"]
            for i in range(30):  # faint (level A): flinch, topple, sink into the platform, fade
                push(still(a.player, a.foe, "", sp, sf, faint=("foe" if foe_down else "player", i, 30)))
            name = ("Foe " if foe_down else "") + dfd["slug"].upper()
            push(still(a.player, a.foe, f"{name} fainted!", sp, sf, hide=("foe",) if foe_down else ("player",)), 40)
            break
    out = a.out or os.path.join(vfx.REPO, "tmp", "moves", "battle-demo.webp")
    big = [f.convert("RGB") for f in frames]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    big[0].save(out, save_all=True, append_images=big[1:], duration=33, loop=0, quality=88, method=4)
    print(out, f"{len(frames)} frames, {len(frames) / 30:.1f}s", {k: (v['slug'], v['types'], round(v['hp'])) for k, v in side.items()})


if __name__ == "__main__":
    main()
