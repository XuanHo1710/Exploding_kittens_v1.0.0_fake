#!/usr/bin/env python3
"""
Assemble the final movement sheet (v3) from per-loop normalized sheets.

Each loop (walk, run, fly …) was generated as its own image (4 rows = down, left, right, up; N columns = frames that
copy the 3D pose guide of that loop) and normalized with `normalize_sheet.py --mode move4 --layout loop`.
This script puts the loops side by side (order: walk, run, fly) and embeds the layout in the PNG as a tEXt chunk
"mons-loops" = [{"mode","frames","cycle","keys"}, …] (cycle = the 3D loop length in seconds, so the game plays the 2D
loop at the 3D rhythm). The species folder keeps only `<slug>-movement.png` + `<slug>-posses.png`.

Usage:
  python3 assemble_loops.py --slug charizard --out "<OUT_DIR>/charizard-movement.png" \
      walk=/tmp/mons-refs/charizard-walk.png run=/tmp/mons-refs/charizard-run.png fly=/tmp/mons-refs/charizard-fly.png
"""
import argparse
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PYDEPS = os.path.join(SCRIPT_DIR, ".pydeps")
if os.path.isdir(PYDEPS) and PYDEPS not in sys.path:
    sys.path.insert(0, PYDEPS)
from PIL import Image  # noqa: E402
from PIL.PngImagePlugin import PngInfo  # noqa: E402

def _sheets_dir():
    """pre-rendered 3D sheets: $MONS_3D_DIR, else <repo>/pokemon3d (symlink, git-ignored), else $MONS_SODIER_WAR/client/assets/pokemon3d"""
    for d in (os.environ.get("MONS_3D_DIR"),
              os.path.join(os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../..")), "pokemon3d"),
              os.path.join(os.environ.get("MONS_SODIER_WAR") or "/home/huy/Main/sodier-war-next", "client/assets/pokemon3d")):
        if d and os.path.isdir(d):
            return d
    return "pokemon3d"  # -> clear "not found" error below


SHEETS = _sheets_dir()
ORDER = ["idle", "walk", "run", "fly"]
CELL = 192


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--sheets-dir", default=SHEETS)
    ap.add_argument("loops", nargs="+", help="mode=path of a normalized loop sheet (4 rows x N frames of 192 px)")
    a = ap.parse_args()
    parts = dict(x.split("=", 1) for x in a.loops)
    bad = set(parts) - set(ORDER)
    if bad:
        sys.exit(f"unknown loop(s) {sorted(bad)}; use {ORDER}")
    meta = {}
    try:
        meta = json.load(open(os.path.join(a.sheets_dir, f"{a.slug}.json")))["modes"]
    except OSError:
        print("note: no 3D json, cycles default to frames x 0.1 s")
    ims, loops = [], []
    for mode in [m for m in ORDER if m in parts]:
        im = Image.open(parts[mode]).convert("RGB")
        if im.height != 4 * CELL or im.width % CELL:
            sys.exit(f"{mode}: {im.size} is not a normalized loop sheet (4 rows of {CELL} px)")
        n = im.width // CELL
        src = mode if mode in meta else ("walk" if mode in ("run", "idle") and "walk" in meta else None)
        cycle = round(meta[src]["cycle"], 3) if src else round(n * 0.1, 3)
        ims.append(im)
        loops.append({"mode": mode, "frames": n, "cycle": cycle, "keys": mode})
    sheet = Image.new("RGB", (sum(i.width for i in ims), 4 * CELL), (255, 0, 255))
    x = 0
    for im in ims:
        sheet.paste(im, (x, 0))
        x += im.width
    info = PngInfo()
    info.add_text("mons-loops", json.dumps(loops, separators=(",", ":")))
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    sheet.save(a.out, pnginfo=info)
    print(f"OK: {a.out} ({sheet.width}x{sheet.height}) loops: " + ", ".join(f"{l['mode']} {l['frames']}f/{l['cycle']}s" for l in loops))


if __name__ == "__main__":
    main()
