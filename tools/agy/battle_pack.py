#!/usr/bin/env python3
"""
Prompt pack for a species' battle pose sheet (level B: ATTACK / HURT / DODGE / FAINT, front + back).

usage: python3 tools/agy/battle_pack.py --name Charmander --species Gen1-Kanto/004-Charmander [--views front,back] [--note "..."]
writes tmp/prompts/<slug>-battle.md + tmp/prompts/<slug>-battle-look-<view>.png (design lock cut from the movement
sheet: the creature's idle frames in that view). Prompt text: prompts/battle/README.md.
"""
import argparse
import json
import os
import re
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
sys.path.insert(0, os.path.join(REPO, "tools/skills"))
from vfx import Image  # noqa: E402  (Pillow, with the skill fallback)

S = "tools/units"


def species_notes(slug, kind):
    """drawing notes of a species from data/pokemon/pokemon-notes.json (kind: movement / battle)"""
    import json as _json
    p = os.path.join(REPO, "data", "units", "pokemon-notes.json")
    if not os.path.isfile(p):
        return ""
    v = _json.load(open(p, encoding="utf-8")).get(slug.lower())
    if not v:
        return ""
    if isinstance(v, str):
        return v
    return " ".join(x for x in (v.get("auto", ""), v.get("all", ""), v.get(kind, "")) if x)


def look_strip(sheet, view, out):
    """idle frames of the movement sheet in one view (front = row 'down', back = row 'up'), on magenta"""
    im = Image.open(sheet).convert("RGB")
    C = 192
    w, h = im.size
    if (w, h) == (1536, 1152):                 # legacy 8 directions x 6: diagonal battle views
        col = 1 if view == "front" else 3          # down-right (mirrored -> facing the lower-left) / up-right
        cells = [im.crop((col * C, r * C, (col + 1) * C, (r + 1) * C)) for r in range(3)]
        if view == "front":
            cells = [c.transpose(Image.FLIP_LEFT_RIGHT) for c in cells]
    else:                                      # v2 / v3: rows down, left, right, up; idle loop first
        row = 1 if view == "front" else 3          # facing left (toward the player) / back
        c0 = 0
        try:                                       # flyers: use the FLY loop (wings open), not walk / idle
            loops = json.loads(Image.open(sheet).text.get("mons-loops", "[]"))
            x = 0
            for l in loops:
                if l["mode"] == "fly":
                    c0 = x
                x += l["frames"]
        except (ValueError, KeyError, AttributeError):
            pass
        cells = [im.crop(((c0 + c) * C, row * C, (c0 + c + 1) * C, (row + 1) * C)) for c in (0, 2, 4)]
    strip = Image.new("RGB", (C * len(cells), C), (255, 0, 255))
    for i, c in enumerate(cells):
        strip.paste(c, (i * C, 0))
    strip.save(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True); ap.add_argument("--species", required=True)
    ap.add_argument("--views", default="front,back"); ap.add_argument("--note", default="")
    a = ap.parse_args()
    slug = re.sub(r"[^a-z0-9]+", "-", a.name.lower()).strip("-")
    a.note = " ".join(x for x in (species_notes(slug, "battle"), a.note) if x)   # data/pokemon/pokemon-notes.json + --note
    sheet = os.path.join(REPO, "assets", "units", a.species, f"{slug}-movement.png")
    if not os.path.isfile(sheet):
        sys.exit(f"no movement sheet {sheet}: draw the movement sheet first (it is the design lock)")
    txt = open(os.path.join(REPO, "prompts/battle/README.md"), encoding="utf-8").read()
    blocks = re.findall(r"```\n(.*?)\n```", txt, re.S)
    common = next(b for b in blocks if b.startswith("Pixel art battle animation"))
    viewb = next(b for b in blocks if b.startswith("VIEW:"))
    rows = next(b for b in blocks if "ROW 1 ATTACK" in b)
    os.makedirs(os.path.join(REPO, "tmp/prompts"), exist_ok=True)
    md = [f"# {a.name} — battle poses (ATTACK / HURT / DODGE / FAINT)\n\n",
          "2 images (one per view), each ONE `generate_image`, ratio **3:2**, 6 columns × 4 rows.\n\n",
          f"Step 0: `bash {S}/fetch_reference.sh \"{a.name}\"`\n"]
    for view in a.views.split(","):
        look = f"tmp/prompts/{slug}-battle-look-{view}.png"
        look_strip(sheet, view, os.path.join(REPO, look))
        head, *paras = re.split(r"\n<VIEW> = ", viewb)
        mine = next(p for p in paras if p.startswith(view.upper() + ":"))
        vb = head.replace("<VIEW>", view.upper()) + "\n" + mine.split(":", 1)[1].strip()
        md.append(f"""
## View `{view}`

Attach in this order:
1. FIRST  `/tmp/mons-refs/{slug}-reference.jpg`
2. SECOND `{look}`  (this creature: keep the design IDENTICAL, only the pose / angle changes)
3. THIRD  `prompts/battle/orientation-{view}.png`  (VIEWING ANGLE example, another creature: copy ONLY the angle — {'3/4 toward the LOWER-LEFT' if view == 'front' else 'looking toward the UPPER-RIGHT, seen from behind-right: back + side of the face'})

Prompt:
```
{common}

{vb}

{rows}{chr(10) + 'Extra: ' + a.note if a.note else ''}
```

After generating: save `/tmp/mons-refs/{slug}-battle-raw-{view}.jpg` AND a copy in the repo `tmp/raw/{slug}-battle-raw-{view}.jpg` (for review), then
`python3 {S}/normalize_sheet.py --mode move4 --layout loop --frames 6 --keep-x --input /tmp/mons-refs/{slug}-battle-raw-{view}.jpg --output /tmp/mons-refs/{slug}-battle-{view}.png`
""")
    args = " ".join(f"--{v} /tmp/mons-refs/{slug}-battle-{v}.png" for v in a.views.split(","))
    md.append(f"""
## Assemble + status
```bash
python3 tools/agy/assemble_battle.py --species {a.species} {args}
python3 tools/data/battle_status.py
python3 tools/skills/review_move.py tackle --pairs {slug}:bulbasaur   # look at the sheet
```
""")
    out = os.path.join(REPO, f"tmp/prompts/{slug}-battle.md")
    open(out, "w", encoding="utf-8").write("".join(md))
    print(os.path.relpath(out, REPO))


if __name__ == "__main__":
    main()
