#!/usr/bin/env python3
"""
SECOND reference image (style + layout example) for the image generator.

Finished v3 sheets chosen by the user as examples (full, smooth frames):
  * walk + fly species (`walk_fly`, and `fly`-only): Gen2-Johto/189-Jumpluff  (loops walk, run, fly)
  * walk-only species (`walk`):                      Gen2-Johto/183-Marill    (loops walk, run)
For a movement loop it cuts exactly that loop out of the example sheet (same grid as the sheet to draw: N frames x
4 rows down/left/right/up), so the model sees a finished example of the very layout it must produce.

Usage:
  python3 style_example.py --locomotion walk_fly --loop run --out /tmp/mons-refs/<slug>-style-run.png
  python3 style_example.py --locomotion fly --print-source      # which example folder is used
"""
import argparse
import json
import os
import shutil
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PYDEPS = os.path.join(SCRIPT_DIR, ".pydeps")
try:
    from PIL import Image  # noqa: E402
except ImportError:
    sys.path.insert(0, PYDEPS)
    from PIL import Image  # noqa: E402

REPO = os.path.abspath(os.path.join(SCRIPT_DIR, "../.."))
DEX = os.path.join(REPO, "assets", "units")
EXAMPLES = {
    "walk_fly": ("Gen2-Johto/189-Jumpluff", "jumpluff"),
    "fly": ("Gen2-Johto/189-Jumpluff", "jumpluff"),
    "walk": ("Gen2-Johto/183-Marill", "marill"),
}
CELL = 192


def loops_of(png):
    im = Image.open(png)
    raw = getattr(im, "text", {}).get("mons-loops")
    if not raw:
        sys.exit(f"{png} has no 'mons-loops' metadata (not a v3 sheet)")
    return json.loads(raw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--locomotion", required=True, choices=sorted(EXAMPLES))
    ap.add_argument("--loop", choices=["idle", "walk", "run", "fly"])
    ap.add_argument("--print-source", action="store_true")
    ap.add_argument("--out")
    a = ap.parse_args()
    folder, slug = EXAMPLES[a.locomotion]
    base = os.path.join(DEX, folder)
    if a.print_source:
        print(base)
        return
    if not a.out:
        sys.exit("--out is required")
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    if not a.loop:
        sys.exit("--loop is required")
    sheet = os.path.join(base, f"{slug}-movement.png")
    loops = loops_of(sheet)
    names = [l["mode"] for l in loops]
    if a.loop in names:
        want = a.loop
    elif a.loop == "idle":  # the examples have no idle loop: show the layout of their walk (fly for fly-only species)
        want = "fly" if a.locomotion == "fly" and "fly" in names else "walk"
    else:
        want = "walk" if a.loop == "run" and "walk" in names else names[-1]
    x = 0
    for l in loops:
        if l["mode"] == want:
            im = Image.open(sheet).convert("RGB").crop((x * CELL, 0, (x + l["frames"]) * CELL, 4 * CELL))
            im.save(a.out)
            print(f"OK: {a.out} <- {folder} loop '{want}' ({l['frames']} frames x 4 rows, {im.width}x{im.height})")
            return
        x += l["frames"]


if __name__ == "__main__":
    main()
