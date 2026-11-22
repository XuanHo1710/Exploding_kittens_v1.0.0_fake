#!/usr/bin/env python3
"""
Join the normalized battle pose images into assets/pokemon/<Gen>/<NNN-Name>/<slug>-battle.png:
4 rows (attack, hurt, dodge, faint) x 12 columns (6 front frames, then 6 back frames), 192 px cells on #FF00FF,
PNG text chunk `mons-battle` = {"rows": [...], "views": [...], "frames": 6}.
A view not given is kept from the current sheet (so front and back can be drawn separately).

usage: python3 tools/agy/assemble_battle.py --species Gen1-Kanto/004-Charmander --front f.png [--back b.png]
"""
import argparse
import json
import os
import sys
try:
    import PIL  # noqa: F401
except ImportError:  # agy's Python: use the Pillow build shipped with the sprite skill
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "../pokemon/.pydeps"))

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
sys.path.insert(0, os.path.join(REPO, "tools/skills"))
from vfx import Image  # noqa: E402
from PIL import PngImagePlugin  # noqa: E402

ROWS = ["attack", "hurt", "dodge", "faint"]
C, N = 192, 6


def colour_thumb(cell, n=32):
    """the drawing cropped to its outline, on grey, scaled to n x n: colours tell which way it faces"""
    cell = cell.convert("RGB")
    px = cell.load()
    m = Image.new("L", cell.size, 0)
    mp = m.load()
    for y in range(cell.height):
        for x in range(cell.width):
            r, g, b = px[x, y]
            if not (r - g > 70 and b - g > 70 and r > 120 and b > 120):
                mp[x, y] = 255
    bb = m.getbbox() or (0, 0, cell.width, cell.height)
    c, mm = cell.crop(bb), m.crop(bb)
    bg = Image.new("RGB", c.size, (128, 128, 128))
    bg.paste(c, (0, 0), mm)
    return bg.resize((n, n))


def dist(a, b):
    A, B = a.tobytes(), b.tobytes()
    return sum(abs(x - y) for x, y in zip(A, B)) / len(A)


def facing_fix(img, look):
    """the battle screen is diagonal: opponent faces the lower-left, player faces the upper-right. Compare the
    standing frame with the design-lock image (cut from the movement sheet in the right direction) as it is and
    mirrored. Returns ("flip" | "ok" | "unsure", d_same, d_mirrored)."""
    stand = colour_thumb(img.crop((0, 0, C, C)))
    ref = colour_thumb(look.crop((0, 0, C, C)))
    same, mirr = dist(stand, ref), dist(stand.transpose(Image.FLIP_LEFT_RIGHT), ref)
    if mirr < same * 0.8:
        return "flip", same, mirr
    if same < mirr * 0.8:
        return "ok", same, mirr
    return "unsure", same, mirr


def backup(path):
    """keep the sheet that is about to be replaced: tmp/history/<name>-<time>.png (never cleaned automatically)"""
    import shutil, time
    if os.path.isfile(path):
        d = os.path.join(REPO, "tmp", "history"); os.makedirs(d, exist_ok=True)
        shutil.copyfile(path, os.path.join(d, os.path.basename(path)[:-4] + time.strftime("-%m%d-%H%M%S.png")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--species", required=True); ap.add_argument("--front"); ap.add_argument("--back")
    a = ap.parse_args()
    folder = os.path.join(REPO, "assets", "units", a.species)
    slug = os.path.basename(folder).split("-", 1)[1].lower()
    out = os.path.join(folder, f"{slug}-battle.png")
    sheet = Image.new("RGB", (2 * N * C, len(ROWS) * C), (255, 0, 255))
    views = []
    if os.path.isfile(out):
        old = Image.open(out)
        views = json.loads(old.text.get("mons-battle", "{}")).get("views", [])
        sheet.paste(old.convert("RGB"), (0, 0))
    for i, (v, p) in enumerate((("front", a.front), ("back", a.back))):
        if not p:
            continue
        im = Image.open(p).convert("RGB")
        if im.size != (N * C, len(ROWS) * C):
            sys.exit(f"{p}: expected {N * C}x{len(ROWS) * C} (normalize_sheet --layout loop --frames 6), got {im.size}")
        look = os.path.join(REPO, "tmp", "prompts", f"{slug}-battle-look-{v}.png")
        if not os.path.isfile(look):   # make the design lock (direction reference) if the pack was not run here
            sys.path.insert(0, os.path.join(REPO, "tools", "agy"))
            from battle_pack import look_strip
            mv = os.path.join(folder, f"{slug}-movement.png")
            if os.path.isfile(mv):
                os.makedirs(os.path.dirname(look), exist_ok=True)
                look_strip(mv, v, look)
        if os.path.isfile(look):
            verdict, same, flipped = facing_fix(im, Image.open(look))
            if verdict == "flip":
                im = im.transpose(Image.FLIP_LEFT_RIGHT)
                # mirroring the whole image also reverses the frame order: put the frames back in place per row
                fixed = Image.new("RGB", im.size, (255, 0, 255))
                for c in range(N):
                    fixed.paste(im.crop((c * C, 0, (c + 1) * C, im.height)), ((N - 1 - c) * C, 0))
                im = fixed
                print(f"  {v}: drawn facing the WRONG way (diff {same:.1f} vs mirrored {flipped:.1f}) -> flipped")
            elif verdict == "ok":
                print(f"  {v}: facing OK (diff {same:.1f}, mirrored {flipped:.1f})")
            else:
                print(f"  {v}: facing UNSURE (diff {same:.1f} vs mirrored {flipped:.1f}): look at it — "
                      f"{'opponent must face the LOWER-LEFT' if v == 'front' else 'player must face the UPPER-RIGHT'}")
        sheet.paste(im, (i * N * C, 0))
        if v not in views:
            views.append(v)
    for vi, v in enumerate(("front", "back")):     # a half that has drawings is a view, whatever the old metadata said
        half = sheet.crop((vi * N * C, 0, (vi + 1) * N * C, len(ROWS) * C)).convert("RGB").resize((N * 12, len(ROWS) * 12))
        b = half.tobytes()
        if v not in views and any(not (b[i] > 200 and b[i + 1] < 60 and b[i + 2] > 200) for i in range(0, len(b), 3)):
            views.append(v)
    meta = PngImagePlugin.PngInfo()
    meta.add_text("mons-battle", json.dumps({"rows": ROWS, "views": sorted(views), "frames": N, "cols": ["front"] * N + ["back"] * N}))
    backup(out)
    sheet.save(out, pnginfo=meta)
    print(os.path.relpath(out, REPO), "views:", sorted(views))


if __name__ == "__main__":
    main()
