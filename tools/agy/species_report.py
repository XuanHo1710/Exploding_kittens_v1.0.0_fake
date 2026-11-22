#!/usr/bin/env python3
"""
Report images for one finished species (sent to the user, e.g. on Telegram):
  tmp/report/<slug>-movement.png   the movement sheet (as is)
  tmp/report/<slug>-battle.png     the battle sheet (as is)
  tmp/report/<slug>-scene.png      the species against itself on a battle scene, 4 moments in a 2 x 2 grid:
                                   both standing | player attacks, foe hurt | foe attacks, player dodges | foe faints
                                   each panel at half the renderer's current output size

usage: python3 tools/agy/species_report.py <slug> [--scene garden-tall-grass-trainer]
prints the paths of the images it wrote, one per line
"""
import argparse
import glob
import os
import shutil
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
sys.path.insert(0, os.path.join(REPO, "tools/skills"))
import vfx  # noqa: E402
from vfx import Image, W, H  # noqa: E402


def frame_or_stand(slug, view, anim, i, hi_h):
    """a drawn battle frame (level B) or the standing sprite: (img, (foot x, foot y))"""
    got = vfx.battle_frame(slug, view, anim, i, hi_h) if anim else None
    if got:
        return got
    img = vfx.battle_sprite(slug, view, hi_h, 96 * vfx.HI)
    return img, (img.width // 2, img.height)


def panel(slug, foe_anim, player_anim, text):
    HI = vfx.HI
    draws = []
    for who, view, pos, anim in (("foe", "front", vfx.E_POS, foe_anim), ("player", "back", vfx.P_POS, player_anim)):
        hi_h = vfx.battle_sprite(slug, view).height * HI
        img, (fx, fy) = frame_or_stand(slug, view, anim[0] if anim else None, anim[1] if anim else 0, hi_h)
        draws.append((img, (pos[0] * HI - fx, pos[1] * HI - fy)))
    front = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    vfx.text_box(front, text)
    fr = vfx.compose(Image.new("RGBA", (W, H), (0, 0, 0, 0)), draws, front).convert("RGB")
    return fr.resize((fr.width // 2, fr.height // 2), Image.BOX)       # half the current output size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug"); ap.add_argument("--scene", default="garden-tall-grass-trainer")
    a = ap.parse_args()
    slug = a.slug.lower()
    hits = glob.glob(os.path.join(REPO, "assets", "units", "Gen*", "[0-9]*-*", f"{slug}-movement.png"))
    if not hits:
        sys.exit(f"no {slug}-movement.png")
    d = os.path.dirname(hits[0])
    out_dir = os.path.join(REPO, "tmp", "report")
    os.makedirs(out_dir, exist_ok=True)
    outs = []
    for kind in ("movement", "battle"):
        src = os.path.join(d, f"{slug}-{kind}.png")
        if os.path.isfile(src):
            dst = os.path.join(out_dir, f"{slug}-{kind}.png")
            shutil.copyfile(src, dst); outs.append(dst)
    vfx.use_scene(a.scene)
    name = slug.upper()
    panels = [panel(slug, None, None, f"Wild {name} appeared!"),
              panel(slug, ("hurt", 2), ("attack", 3), f"{name} attacks!"),
              panel(slug, ("attack", 3), ("dodge", 3), f"Foe {name} attacks! {name} dodges!"),
              panel(slug, ("faint", 5), None, f"Foe {name} fainted!")]
    pw, ph = panels[0].size
    grid = Image.new("RGB", (2 * pw + 4, 2 * ph + 4), (32, 32, 40))
    for i, p in enumerate(panels):
        grid.paste(p, ((i % 2) * (pw + 4), (i // 2) * (ph + 4)))
    dst = os.path.join(out_dir, f"{slug}-scene.png")
    grid.save(dst); outs.append(dst)
    print("\n".join(outs))


if __name__ == "__main__":
    main()
