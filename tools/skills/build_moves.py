#!/usr/bin/env python3
"""
Build data/battle/moves.json: every move (Gen 1-9, 919) with its battle data and the VISUAL ARCHETYPE used to animate it
on the Gen-3 style battle screen (attacker bottom-left seen from behind, target top-right seen from the front).

Archetypes (how the effect moves on screen):
  contact     attacker lunges at the target; impact sprite on the target (variant: hit / slash / bite / punch / kick)
  projectile  particles fly from attacker to target, burst on hit (Ember, Water Gun, Shadow Ball, Gunk Shot)
  beam        a continuous stream from attacker to target (Ice Beam, Hyper Beam, Flamethrower, Solar Beam)
  fall        particles fall from the top of the screen onto the target (Thunder, Blizzard, Rock Slide)
  wave        a wave / gust sweeps across the screen toward the target side (Surf, Heat Wave, Gust)
  quake       the screen shakes, dust bursts under the target (Earthquake, Magnitude, Bulldoze)
  burst       a radial explosion on the target, or on the user for self-KO moves (Explosion)
  sound       notes / sound rings travel from attacker to target (Growl, Sing, Hyper Voice)
  powder      a drifting cloud of spores onto the target (Sleep Powder, Spore)
  buff        aura rising around the user + stat-up overlay (Swords Dance, Agility, Calm Mind)
  debuff      particles on the target + stat-down overlay (Leer, Screech, Scary Face)
  heal        green sparkles rising around the user (Recover, Synthesis)
  field       a full-screen tint / overlay (Rain Dance, Sunny Day, Trick Room)
Heuristics come from PokéAPI flags, target and damage class + keyword rules; OVERRIDES fixes the rest.

usage: python3 build_moves.py <pokeapi csv dir> [--out data/battle/moves.json]
needs: moves, move_names, type_names, move_flag_map (+ move_flags) CSVs from PokéAPI data/v2/csv
"""
import csv
import json
import os
import re
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
GENS = {1: "Gen1-Kanto", 2: "Gen2-Johto", 3: "Gen3-Hoenn", 4: "Gen4-Sinnoh", 5: "Gen5-Unova",
        6: "Gen6-Kalos", 7: "Gen7-Alola", 8: "Gen8-Galar", 9: "Gen9-Paldea"}
CLASS = {"1": "status", "2": "physical", "3": "special"}
TARGET = {"1": "specific-move", "2": "selected-pokemon-me-first", "3": "ally", "4": "users-field", "5": "user-or-ally",
          "6": "opponents-field", "7": "user", "8": "random-opponent", "9": "all-other-pokemon", "10": "selected-pokemon",
          "11": "all-opponents", "12": "entire-field", "13": "user-and-allies", "14": "all-pokemon", "15": "all-allies",
          "16": "fainting-pokemon"}
SELF = {"user", "users-field", "user-or-ally", "user-and-allies", "all-allies", "ally"}
FOE = {"selected-pokemon", "selected-pokemon-me-first", "random-opponent", "all-opponents", "opponents-field", "all-other-pokemon"}

KW = [  # (regex on the English name, archetype) — checked in order
    (r"\b(earthquake|magnitude|bulldoze|fissure|stomping tantrum|high horsepower|earth power|tectonic)\b", "quake"),
    (r"\b(explosion|self-destruct|misty explosion|mind blown|steel beam)\b", "burst"),
    (r"\b(thunder|blizzard|rock slide|stone edge|hurricane|meteor|hail|draco meteor|sky attack|bolt beak|"
     r"rock tomb|avalanche|head smash|icicle crash|diamond storm|precipice|thunderous kick|bleakwind|wildbolt)\b", "fall"),
    (r"\b(surf|muddy water|heat wave|gust|twister|razor wind|whirlwind|hydro steamer|sludge wave|discharge|"
     r"lava plume|boomburst|petal blizzard|icy wind|air cutter|origin pulse|water spout|eruption)\b", "wave"),
    (r"(beam|ray|laser|cannon|flamethrower|hydro pump|blast burn|hydro cannon|frenzy plant|psystrike|"
     r"dragon breath|fire blast|focus blast|zap cannon|energy|spectral thief|core enforcer|prismatic)", "beam"),
    (r"(spore|powder|stun spore|cotton|sleep powder|rage powder|magic powder)", "powder"),
]
CAST_PLACE = {  # identifier -> where image 1 (CAST) sits on the user: body (default) / back / ground
    "eruption": "back", "water-spout": "back", "blast-burn": "back", "hydro-cannon": "back", "flare-blitz": "body",
    "earthquake": "ground", "magnitude": "ground", "bulldoze": "ground", "fissure": "ground", "precipice-blades": "ground",
    # charges and stomps: the CAST is the dust kicked up at the feet as the user dashes (user, 2026-11-19: Tackle)
    "tackle": "ground", "body-slam": "ground", "take-down": "ground", "double-edge": "ground", "quick-attack": "ground",
    "stomp": "ground", "headbutt": "ground", "skull-bash": "ground", "giga-impact": "ground", "extreme-speed": "ground",
}

OVERRIDES = {  # identifier -> archetype (signature cases the rules get wrong)
    "eruption": "fall", "water-spout": "wave",
    "swords-dance": "buff", "agility": "buff", "dragon-dance": "buff", "quiver-dance": "buff", "shell-smash": "buff",
    "rain-dance": "field", "sunny-day": "field", "sandstorm": "field", "hail": "field", "snowscape": "field",
    "trick-room": "field", "electric-terrain": "field", "grassy-terrain": "field", "misty-terrain": "field",
    "psychic-terrain": "field", "gravity": "field", "haze": "field",
    "rest": "heal", "wish": "heal", "aqua-ring": "heal", "ingrain": "heal",
    "ember": "projectile", "water-gun": "projectile", "thunder-shock": "projectile", "thunderbolt": "fall",
    "ice-beam": "beam", "psychic": "burst", "confusion": "burst", "shadow-ball": "projectile",
    "flamethrower": "beam", "solar-beam": "beam", "hyper-beam": "beam", "metal-claw": "contact",
    "bubble": "projectile", "bubble-beam": "projectile", "vine-whip": "contact", "razor-leaf": "projectile",
    "fire-spin": "wave", "whirlpool": "wave", "sand-attack": "projectile", "string-shot": "projectile",
    "poison-sting": "projectile", "pin-missile": "projectile", "water-shuriken": "projectile",
}


def rows(d, name):
    with open(os.path.join(d, name + ".csv"), encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main():
    d = sys.argv[1]
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else os.path.join(REPO, "data", "battle", "moves.json")
    moves = [r for r in rows(d, "moves") if int(r["id"]) < 10000]
    names = {r["move_id"]: r["name"] for r in rows(d, "move_names") if r["local_language_id"] == "9"}
    types = {r["type_id"]: r["name"].lower() for r in rows(d, "type_names") if r["local_language_id"] == "9"}
    fid = {r["id"]: r["identifier"] for r in rows(d, "move_flags")}
    flags = {}
    for r in rows(d, "move_flag_map"):
        flags.setdefault(r["move_id"], set()).add(fid.get(r["move_flag_id"], r["move_flag_id"]))
    out_moves, counts = [], {}
    for r in moves:
        mid, ident = r["id"], r["identifier"]
        name = names.get(mid, ident.replace("-", " ").title())
        cls, tgt, fl = CLASS[r["damage_class_id"]], TARGET.get(r["target_id"], r["target_id"]), flags.get(mid, set())
        low = name.lower()
        arch, variant = None, None
        if ident in OVERRIDES:
            arch = OVERRIDES[ident]
        elif cls == "status":
            if "heal" in fl or re.search(r"(recover|roost|synthesis|moonlight|morning sun|heal|milk drink|soft-boiled|slack off|shore up)", low):
                arch = "heal"
            elif tgt in ("entire-field", "opponents-field") and tgt == "entire-field":
                arch = "field"
            elif "sound" in fl:
                arch = "sound"
            elif "powder" in fl:
                arch = "powder"
            elif tgt in SELF or "dance" in fl:
                arch = "buff"
            else:
                arch = "debuff"
        else:
            for pat, a in KW:
                if re.search(pat, low):
                    arch = a
                    break
            if arch is None:
                if "sound" in fl:
                    arch = "sound"
                elif "contact" in fl:
                    arch = "contact"
                elif "ballistic" in fl or "pulse" in fl:
                    arch = "projectile"
                elif tgt in ("all-opponents", "all-other-pokemon") and cls == "special":
                    arch = "wave"
                else:
                    arch = "projectile"
        if arch == "contact":
            variant = ("bite" if "bite" in fl else "punch" if "punch" in fl else
                       "slash" if re.search(r"(slash|claw|cut|scratch|fury swipes|night slash|leaf blade|x-scissor|cross chop|razor|sacred sword|psycho cut|aerial ace|wing attack)", low) else
                       "kick" if re.search(r"kick", low) else "hit")
        counts[arch] = counts.get(arch, 0) + 1
        out_moves.append({
            "id": int(mid), "identifier": ident, "name": name, "gen": GENS[int(r["generation_id"])],
            "type": types[r["type_id"]], "class": cls, "power": int(r["power"]) if r["power"] else None,
            "accuracy": int(r["accuracy"]) if r["accuracy"] else None, "pp": int(r["pp"]) if r["pp"] else None,
            "priority": int(r["priority"]), "target": tgt, "flags": sorted(fl),
            "vfx": {"archetype": arch, **({"variant": variant} if variant else {}),
                    **({"cast": CAST_PLACE[ident]} if CAST_PLACE.get(ident, "body") != "body" else {})},
        })
    doc = {"about": "Moves with battle data + VFX archetype for the Gen-3 style battle screen "
                    "(skill .agents/skills/expedition-skill-vfx). Regenerate: python3 tools/skills/build_moves.py <pokeapi csv dir>. "
                    "Hand fixes go into OVERRIDES in that script (or per-move 'vfx' edits that you keep in OVERRIDES).",
           "archetypes": dict(sorted(counts.items(), key=lambda kv: -kv[1])), "count": len(out_moves), "moves": out_moves}
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(out, len(out_moves), doc["archetypes"])


if __name__ == "__main__":
    main()
