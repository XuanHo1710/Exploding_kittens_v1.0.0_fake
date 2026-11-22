#!/usr/bin/env python3
"""
Mons overworld Characters: every module in chars/*.py exports SPECS {slug: spec};
charkit.py renders them with the Gen 3 contract (see SKILL.md).

Usage:  draw_chars.py [slug ...|group ...|all] [--out-root assets/characters] [--preview DIR]
Writes assets/characters/<Group>/<slug>/<slug>-overworld.png + .json (and -run.png + .json for the
Player), and assets/characters/<group>-overview.png (one row per Character: the 4x4 grid on grass, x2,
with names) for every group touched. A Character with a <slug>-drawn.jpg in its folder is imported from that
drawing (import_drawn.py) and skipped here; the overview reads its sheet back from disk.
"""
import argparse
import glob
import importlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PYDEPS = os.path.join(HERE, ".pydeps")
if os.path.isdir(PYDEPS) and PYDEPS not in sys.path:
    sys.path.insert(0, PYDEPS)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "chars"))

from PIL import Image, ImageDraw  # noqa: E402

import charkit as CK  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
GRASS = (136, 200, 106, 255)
INK = (40, 36, 58)


def load_specs():
    specs = {}
    for path in sorted(glob.glob(os.path.join(HERE, "chars", "*.py"))):
        if os.path.basename(path).startswith("_"):
            continue
        module = importlib.import_module(os.path.basename(path)[:-3])
        for slug, spec in getattr(module, "SPECS", {}).items():
            specs[slug] = dict(spec)
    return specs


def build(slug, spec):
    ch = CK.Character(slug, spec["group"], spec["layers"], spec["roles"],
                      palette=spec.get("palette", "own"), child=spec.get("child", False),
                      black_outline=spec.get("black_outline", False), info=spec.get("info"))
    sheets = {"overworld": ch.sheet()}
    if spec.get("run_layers"):
        sheets["run"] = ch.sheet(spec["run_layers"])
    return ch, sheets


def imported(root, slug, spec):
    """A Character whose sheet comes from the user's drawing (<slug>-drawn.jpg next to it, import_drawn.py):
    its paper-doll spec stays for reference but is not rendered over the import."""
    return os.path.exists(os.path.join(root, spec["group"], slug, f"{slug}-drawn.jpg"))


def drawn(root, group):
    """[(slug, {"overworld": native sheet})] of the group's imported drawings (import_drawn.py, "source": "drawn"),
    read back from disk so the overview shows the whole group."""
    rows = []
    for j in sorted(glob.glob(os.path.join(root, group, "*", "*-overworld.json"))):
        m = json.load(open(j, encoding="utf-8"))
        if m.get("source") == "drawn":
            img = Image.open(j[:-5] + ".png").convert("RGBA")
            rows.append((m.get("order", 99), m["character"], img.resize((img.width // 2, img.height // 2))))
    return [(slug, {"overworld": img}) for _, slug, img in sorted(rows)]


def overview(rows, path, k=3):
    """rows = [(slug, {kind: native sheet})]: each sheet shown as its 4x4 grid laid out in one row."""
    pad, label = 8, 14
    cells = []
    for slug, sheets in rows:
        for kind, img in sheets.items():
            cells.append((f"{slug}" + ("" if kind == "overworld" else f" ({kind})"), img))
    cw = max(img.width for _, img in cells) * k
    chh = max(img.height for _, img in cells) * k
    per = 6
    cols = min(per, len(cells))
    nrows = (len(cells) + per - 1) // per
    out = Image.new("RGBA", (pad + cols * (cw + pad), pad + nrows * (chh + label + pad)), (248, 244, 236, 255))
    d = ImageDraw.Draw(out)
    for i, (name, img) in enumerate(cells):
        x = pad + (i % per) * (cw + pad)
        y = pad + (i // per) * (chh + label + pad)
        d.text((x, y), name, fill=INK)
        bg = Image.new("RGBA", img.size, GRASS)
        bg.alpha_composite(img)
        out.paste(bg.resize((img.width * k, img.height * k), Image.NEAREST), (x, y + label))
    out.save(path)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("targets", nargs="*", default=["all"])
    ap.add_argument("--out-root", default=os.path.join(REPO, "assets", "characters"))
    a = ap.parse_args()
    specs = load_specs()
    pick = [s for s in specs if "all" in a.targets or s in a.targets or specs[s]["group"] in a.targets]
    if not pick:
        sys.exit(f"nothing matches {a.targets}; known: {', '.join(specs)}")
    groups = set()
    for slug in pick:
        groups.add(specs[slug]["group"])
        if imported(a.out_root, slug, specs[slug]):
            print("kept", slug, "(imported from its drawing: import_drawn.py)")
            continue
        ch, sheets = build(slug, specs[slug])
        for p in CK.export(ch, a.out_root, sheets):
            print("wrote", os.path.relpath(p, REPO))
    for g in sorted(groups):
        # the overview always shows the whole group, not only the slugs drawn this run
        full = [(s, build(s, specs[s])[1]) for s in specs
                if specs[s]["group"] == g and not imported(a.out_root, s, specs[s])] + drawn(a.out_root, g)
        p = overview(full, os.path.join(a.out_root, f"{g.lower()}-overview.png"))
        print("wrote", os.path.relpath(p, REPO))


if __name__ == "__main__":
    main()
