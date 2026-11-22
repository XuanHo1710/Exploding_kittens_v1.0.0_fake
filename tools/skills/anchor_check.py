#!/usr/bin/env python3
"""
Check a Pokémon's body anchors (where moves come out: mouth, head, vent, hands, tail, body) against its 2D battle
sprites. Pillow only (agy's Python works). Automatic checks first; only when something looks wrong is a marked image
written for a person / agy to look at, so most species cost nothing.

usage:
  python3 tools/skills/anchor_check.py torkoal [typhlosion ...] [--image]
  python3 tools/skills/anchor_check.py --all          # every species with a movement sheet
prints: OK <slug>  |  CHECK <slug>: reasons  -> tmp/anchors/<slug>.png (marked points, front + back)
fix: assets/pokemon/<Gen>/<NNN-Name>/<slug>-anchors.json, only the wrong points, e.g.
  {"front": {"mouth": {"x": 0.0, "y": 0.92, "vis": true}}, "back": {"vent": {"x": 0.0, "y": 1.3}}}
  (x = offset from the centre / sprite width, + = right on screen; y = height above the feet in 3D-width units:
   copy the value printed for that point and move it by a little; add "fixed": true to a hand to stop the
   automatic snapping to the outline). Then run the check again.
"""
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vfx  # noqa: E402
from vfx import Image, ImageDraw  # noqa: E402

PARTS = ["mouth", "head", "vent", "hand_l", "hand_r", "tail", "body"]
COLS = {"mouth": (230, 0, 0), "head": (255, 150, 0), "vent": (220, 0, 220), "body": (0, 140, 255),
        "hand_l": (0, 190, 0), "hand_r": (0, 120, 0), "tail": (130, 70, 10)}
H_SPRITE = 120
# expected height above the feet (fraction of the sprite height) for points that face the camera
BANDS = {"mouth": (0.1, 1.0), "head": (0.15, 1.05), "vent": (0.3, 1.1), "hand_l": (0.1, 0.9), "hand_r": (0.1, 0.9)}


def near_opaque(sprite, x, y, r=3):
    a = sprite.split()[3]
    for yy in range(int(y) - r, int(y) + r + 1):
        for xx in range(int(x) - r, int(x) + r + 1):
            if 0 <= xx < sprite.width and 0 <= yy < sprite.height and a.getpixel((xx, yy)) > 60:
                return True
    return False


def check(slug, want_image=False):
    issues, marks = [], {}
    if not vfx.find_sheet(slug):
        return "SKIP", ["no movement sheet"], None
    for view in ("front", "back"):
        an = vfx.anchors(slug, view)
        if not an:
            issues.append(f"{view}: no anchors (no 3D model) - defaults are used (body centre)")
            continue
        sp = vfx.battle_sprite(slug, view, H_SPRITE)
        feet = (sp.width / 2, sp.height)
        pts = {}
        for k in PARTS:
            p = vfx.anchor_xy(slug, view, k, sp, feet)
            if not p:
                continue
            x, y, vis = p
            pts[k] = p
            v = (sp.height - y) / sp.height
            if vis and k in BANDS:
                lo, hi = BANDS[k]
                if not lo <= v <= hi:
                    issues.append(f"{view} {k}: at {v:.0%} of the height (expected {lo:.0%}-{hi:.0%})")
            if vis and k != "tail" and not near_opaque(sp, x, y):
                issues.append(f"{view} {k}: not on the drawing (empty pixels)")
            if abs(x - sp.width / 2) > 0.62 * sp.width:
                issues.append(f"{view} {k}: outside the sprite's width")
        if "hand_l" in pts and "hand_r" in pts and abs(pts["hand_l"][0] - pts["hand_r"][0]) < 0.15 * sp.width:
            issues.append(f"{view} hands: both on the same spot")
        if "mouth" in pts and "head" in pts and pts["mouth"][1] - pts["head"][1] > 0.35 * sp.height:
            issues.append(f"{view} mouth: far below the head")
        marks[view] = (sp, pts)
    status = "CHECK" if issues else "OK"
    img = None
    if (issues or want_image) and marks:
        tiles = []
        for view, (sp, pts) in marks.items():
            S = 3
            W, H = sp.width + 90, sp.height + 30
            t = Image.new("RGBA", (W, H), (236, 240, 226, 255))
            t.alpha_composite(sp, ((W - sp.width) // 2, 10))
            t = t.resize((W * S, H * S), Image.NEAREST)
            d = ImageDraw.Draw(t)
            for k, (x, y, vis) in pts.items():
                X, Y = (x + (W - sp.width) / 2) * S, (y + 10) * S
                r = 7
                (d.ellipse if vis else d.rectangle)([X - r, Y - r, X + r, Y + r], outline=COLS[k] + (255,), width=3)
                d.text((X + 10, Y - 7), k + ("" if vis else " (behind)"), fill=COLS[k] + (255,))
            d.text((6, 6), f"{slug} {view}", fill=(0, 0, 0, 255))
            tiles.append(t)
        img = Image.new("RGBA", (sum(t.width for t in tiles), max(t.height for t in tiles)), (255, 255, 255, 255))
        x = 0
        for t in tiles:
            img.alpha_composite(t, (x, 0)); x += t.width
        out = os.path.join(vfx.REPO, "tmp", "anchors", f"{slug}.png")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        img.save(out)
        img = out
    return status, issues, img


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    want = "--image" in sys.argv
    if "--all" in sys.argv:
        args = sorted({os.path.basename(p).rsplit("-movement.png", 1)[0]
                       for p in glob.glob(os.path.join(vfx.REPO, "assets", "units", "Gen*", "[0-9]*-*", "*-movement.png"))})
    if not args:
        sys.exit(__doc__)
    n = {"OK": 0, "CHECK": 0, "SKIP": 0}
    for slug in args:
        st, iss, img = check(slug.lower(), want)
        n[st] += 1
        if st == "OK" and not img:
            print(f"OK    {slug}")
        else:
            print(f"{st:5s} {slug}: " + "; ".join(iss) + (f"  -> {os.path.relpath(img, vfx.REPO)}" if img else ""))
    if len(args) > 1:
        print(f"\n{n['OK']} OK, {n['CHECK']} to check, {n['SKIP']} skipped")


if __name__ == "__main__":
    main()
