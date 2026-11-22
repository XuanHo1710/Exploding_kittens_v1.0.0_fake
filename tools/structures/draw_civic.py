#!/usr/bin/env python3
"""
Mons civic structures: every module in civic/*.py exports SPECS {slug: spec}; civickit.py
renders them with the Gen 3 contract (see SKILL.md).

Usage:  draw_civic.py [slug ...|all] [--night] [--out-root assets/structures]
Writes assets/structures/<Category>/<slug>/<slug>-{structure,ground,door,preview}.png, -door.json,
-door.gif, -interior-<floor>.png + -interior.json, assets/structures/civic-overview.png (base set) and
assets/structures/civic-themed-overview.png (gym-city variants from civic/themed.py, one row per gym type).
Regional variants (civic/regional.py) also write assets/structures/civic-<type>-overview.png per gym region.
"""
import glob
import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PYDEPS = os.path.join(HERE, ".pydeps")
if os.path.isdir(PYDEPS) and PYDEPS not in sys.path:
    sys.path.insert(0, PYDEPS)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "civic"))

from PIL import Image, ImageDraw  # noqa: E402

import civickit as CK  # noqa: E402


def load_specs():
    specs = {}
    for path in sorted(glob.glob(os.path.join(HERE, "civic", "*.py"))):
        if os.path.basename(path).startswith("_"):
            continue
        module = importlib.import_module(os.path.basename(path)[:-3])
        for slug, spec in getattr(module, "SPECS", {}).items():
            spec = dict(spec)
            spec["_B"] = CK.Body(spec["size"], spec["body"], spec.get("x_off"), spec.get("depth"),
                                 spec.get("wall_h", 30))
            specs[slug] = spec
    return specs


def overview(done, root):
    """All exteriors on one lawn sheet, sorted by size class (review only)."""
    order = {"S": 0, "M": 1, "L": 2, "XL": 3}
    items = sorted(done, key=lambda d: (order[d[1]], d[0]))
    ims = [(slug, Image.open(pre + "-preview.png")) for slug, _, pre in items]
    cols = 6
    cw = max(im.width for _, im in ims)
    rows = []
    for i in range(0, len(ims), cols):
        rows.append(ims[i:i + cols])
    H = sum(max(im.height for _, im in r) + 18 for r in rows)
    sheet = Image.new("RGB", (cols * (cw + 8), H), (30, 30, 40))
    d = ImageDraw.Draw(sheet)
    y = 0
    for r in rows:
        rh = max(im.height for _, im in r)
        for i, (slug, im) in enumerate(r):
            x = i * (cw + 8)
            sheet.paste(im, (x, y + 16 + rh - im.height))
            d.text((x + 4, y + 2), slug, fill=(240, 240, 240))
        y += rh + 18
    sheet.save(os.path.join(root, "civic-overview.png"))


def themed_overview(specs, root):
    """Gym-city sets: one row per type with the gym next to its themed civic buildings (review only)."""
    rows = {}
    for slug, sp in specs.items():
        if sp.get("theme"):
            pre = os.path.join(root, sp["category"], slug, slug + "-preview.png")
            if os.path.exists(pre):
                rows.setdefault(sp["theme"], []).append((sp.get("base", slug), slug, pre))
    if not rows:
        return
    order = ["fire", "water", "grass", "electric", "psychic", "poison", "ground", "rock"]
    kinds = [k for k in order if k in rows] + sorted(k for k in rows if k not in order)
    base_order = ["pokemon-center", "poke-mart", "house-red"]
    cells = []
    for k in kinds:
        gym = os.path.join(root, "Battle", f"gym-{k}", f"gym-{k}-preview.png")
        items = sorted(rows[k], key=lambda r: (base_order.index(r[0]) if r[0] in base_order else 9, r[1]))
        cells.append((k, ([(f"gym-{k}", gym)] if os.path.exists(gym) else []) + [(s, p) for _, s, p in items]))
    ncol = max(len(c) for _, c in cells)
    cw, rh, pad, lab = 256, 256, 8, 16
    sheet = Image.new("RGB", (ncol * (cw + pad) + pad, len(cells) * (rh + lab + pad) + pad), (30, 30, 40))
    d = ImageDraw.Draw(sheet)
    y = pad
    for k, row in cells:
        for i, (slug, path) in enumerate(row):
            im = Image.open(path)
            x = pad + i * (cw + pad)
            sheet.paste(im, (x + (cw - im.width) // 2, y + lab + rh - im.height))
            d.text((x + 2, y + 2), slug, fill=(240, 240, 240))
        y += rh + lab + pad
    sheet.save(os.path.join(root, "civic-themed-overview.png"))


def region_overview(specs, root, kind):
    """One region's full city set (civic/regional.py + themed.py + the gym) on one sheet (review only):
    assets/structures/civic-<type>-overview.png."""
    items = [(f"gym-{kind}", os.path.join(root, "Battle", f"gym-{kind}", f"gym-{kind}-preview.png"))]
    for slug, sp in specs.items():
        if sp.get("theme") == kind or sp.get("region") == kind:
            items.append((slug, os.path.join(root, sp["category"], slug, slug + "-preview.png")))
    items = [(s, p) for s, p in items if os.path.exists(p)]
    ims = [(s, Image.open(p)) for s, p in items]
    order = {192: 0, 256: 1, 320: 2, 384: 3}
    ims.sort(key=lambda it: (0 if it[0].startswith("gym-") else 1, order.get(it[1].width, 9), it[0]))
    cols, cw, pad, lab = 6, max(im.width for _, im in ims), 8, 16
    rows = [ims[i:i + cols] for i in range(0, len(ims), cols)]
    H = sum(max(im.height for _, im in r) + lab + pad for r in rows) + pad
    sheet = Image.new("RGB", (cols * (cw + pad) + pad, H), (30, 30, 40))
    d = ImageDraw.Draw(sheet)
    y = pad
    for r in rows:
        rh = max(im.height for _, im in r)
        for i, (slug, im) in enumerate(r):
            x = pad + i * (cw + pad)
            sheet.paste(im, (x + (cw - im.width) // 2, y + lab + rh - im.height))
            d.text((x + 2, y + 2), slug, fill=(240, 240, 240))
        y += rh + lab + pad
    sheet.save(os.path.join(root, f"civic-{kind}-overview.png"))


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    root = os.path.abspath(os.path.join(HERE, "../..", "assets", "structures"))
    if "--out-root" in argv:
        i = argv.index("--out-root")
        root = os.path.abspath(argv[i + 1])
        del argv[i:i + 2]
    night = "--night" in argv
    argv = [a for a in argv if a != "--night"]
    specs = load_specs()
    slugs = list(specs) if (not argv or "all" in argv) else argv
    done = []
    for s in slugs:
        if s not in specs:
            raise SystemExit(f"unknown structure {s!r}; known: {', '.join(specs)}")
        pre = CK.render(s, specs[s], root, night=night)
        done.append((s, specs[s]["size"], pre))
        print(f"{s:20s} {specs[s]['size']:2s} -> {os.path.relpath(pre, root)}")
    base = [d for d in done if not specs[d[0]].get("theme") and not specs[d[0]].get("region")]
    if len(base) > 1:
        overview(base, root)
    if any(specs[d[0]].get("theme") for d in done):
        themed_overview(specs, root)
    regions = sorted({specs[d[0]]["region"] for d in done if specs[d[0]].get("region")})
    for k in regions:
        region_overview(specs, root, k)


if __name__ == "__main__":
    main()
