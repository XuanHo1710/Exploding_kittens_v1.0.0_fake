#!/usr/bin/env python3
"""
STEP 1 of the skill: give only the move's English name; finds its folder and prompt file (creates them if missing).

usage:  python3 tools/skills/start_move.py "Eruption"
        (also: "swords dance", swords-dance, "Kings Shield", 284)
prints: the move, folder assets/skills/<GenX-Region>/<English name>/, prompt file, which of the 2 images exist, what to do next.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import move_prompt  # noqa: E402
import vfx  # noqa: E402


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    q = " ".join(sys.argv[1:])
    m = move_prompt.find(q)
    if not m:
        sys.exit(f"move '{q}' not found in data/battle/moves.json (use its English name, e.g. 'Eruption', 'Swords Dance')")
    p, made = move_prompt.write(m)
    d = vfx.move_dir(m)
    rel = lambda x: os.path.relpath(x, vfx.REPO)
    have = {k: os.path.isfile(os.path.join(d, f"{m['identifier']}-{k}.png")) for k in ("cast", "effect")}
    print(f"MOVE    : {m['name']} ({m['identifier']}, #{m['id']}) - {m['type']} {m['class']}, {m['gen']}, archetype {m['vfx']['archetype']}")
    print(f"FOLDER  : {rel(d)}/")
    print(f"PROMPT  : {rel(p)}  ({'created now' if made else 'found'})")
    for k in ("cast", "effect"):
        print(f"IMAGE {1 if k == 'cast' else 2} : {m['identifier']}-{k}.png  {'DONE' if have[k] else 'missing'}")
    tw = os.path.join(d, f"{m['identifier']}-vfx.json")
    print(f"TUNING  : {rel(tw) if os.path.isfile(tw) else 'none (optional ' + m['identifier'] + '-vfx.json: size / position per move)'}")
    todo = [k for k in ("cast", "effect") if not have[k]]
    print("NEXT    : " + (f"open the PROMPT file and follow it: step 0 reference, then draw {' + '.join(todo)}, then normalize"
                          if todo else f"both images exist; preview: python3 tools/skills/battle_preview.py --move {m['identifier']} --strips"))


if __name__ == "__main__":
    main()
