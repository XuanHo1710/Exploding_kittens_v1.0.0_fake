#!/usr/bin/env python3
"""
Mons gyms: every type is its own design in gyms/<type>.py (THEME dict); gymkit.py is
only the engine (Scene plumbing, door, windows, multi-floor interiors, stairs/warps, checks).

Usage:  draw_gym.py [type ...|all] [--night] [--volume] [--out-root assets/structures/Battle]
  --night   also render the (non-Gen 3) Night cell and night door row
  --volume  semi-dark cast shadow in -ground.png instead of the Gen 3 1 px contact line
Writes assets/structures/Battle/gym-<type>/gym-<type>-{structure,ground,door,preview}.png, -door.json, -door.gif,
-interior-<floor>.png (+ -route.png), -interior-floors.png, -interior.json, and
assets/structures/Battle/gyms-overview{,-interior}.png when several types are rendered.
"""
import importlib
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gymkit  # noqa: E402

TYPES = ["fire", "water", "rock", "grass", "electric", "psychic", "poison", "ground"]


def available():
    return [t for t in TYPES if os.path.exists(os.path.join(HERE, "gyms", f"{t}.py"))]


def load(slug):
    module = importlib.import_module(f"gyms.{slug}")
    th = dict(module.THEME)
    th["slug"] = slug
    return th


def overview(slugs, root):
    pres = [os.path.join(root, f"gym-{s}", f"gym-{s}") for s in slugs]
    previews = [Image.open(p + "-preview.png") for p in pres]
    PW, PH = max(p.width for p in previews), max(p.height for p in previews)
    cols = 4
    rows = (len(slugs) + cols - 1) // cols
    ext = Image.new("RGB", (cols * PW, rows * PH), (30, 30, 40))
    sheets = []
    for i, (pre, pv) in enumerate(zip(pres, previews)):
        ext.paste(pv, ((i % cols) * PW, (i // cols) * PH))
        sheets.append(Image.open(pre + "-interior-floors.png"))
    ext.save(os.path.join(root, "gyms-overview.png"))
    W = max(s.width for s in sheets)
    H = sum(s.height for s in sheets) + 16 * (len(sheets) - 1)
    ins = Image.new("RGB", (W, H), (30, 30, 40))
    y = 0
    for s in sheets:
        ins.paste(s, (0, y))
        y += s.height + 16
    ins.save(os.path.join(root, "gyms-overview-interior.png"))


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    root = os.path.abspath(os.path.join(HERE, "../..", "assets/structures/Battle"))
    if "--out-root" in argv:
        i = argv.index("--out-root")
        root = os.path.abspath(argv[i + 1])
        del argv[i:i + 2]
    night = "--night" in argv      # opt-in: Gen 3 has no day/night
    volume = "--volume" in argv    # opt-in: semi-dark cast shadow instead of the Gen 3 contact line
    argv = [a for a in argv if a not in ("--night", "--volume")]
    slugs = available() if (not argv or "all" in argv) else argv
    for s in slugs:
        if s not in available():
            raise SystemExit(f"unknown gym type {s!r}; modules present: {', '.join(available())}")
        gymkit.render(load(s), root, night=night, volume=volume)
    if len(slugs) > 1:
        overview(slugs, root)


if __name__ == "__main__":
    main()
