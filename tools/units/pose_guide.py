#!/usr/bin/env python3
"""
Pose guide for the v2 movement sheet, taken from the species' pre-rendered 3D sheets.

The guide has EXACTLY the v2 layout (prompts/movement/README.md): rows = down, left, right, up; columns = a 4-frame
loop sampled evenly from the 3D animation (frames 1, 4, 7, 10 of 12), Walk and/or Fly by `locomotion`:
  walk     -> 4 cols x 4 rows  (Walk)
  walk_fly -> 8 cols x 4 rows  (Walk 1-4, Fly 5-8)
  fly      -> 4 cols x 4 rows  (Fly / hover)
It is attached to the image generator as the THIRD image so the 2D sprite copies the smooth 3D motion
(leg / wing positions, body tilt and bob per frame) while keeping the hand-drawn pixel-art look.

3D sheets: <sheets-dir>/<slug>.json + per-mode PNGs (8 direction columns: down, down-right, right, up-right, up,
up-left, left, down-left; `frames` rows), made by the 3D re-render pipeline (tools/model3d/).

Usage:
  python3 pose_guide.py --slug charizard --locomotion walk_fly --plan          # -> "idle walk fly" (loops to draw; --with-run adds run)
  python3 pose_guide.py --slug charizard --locomotion walk_fly --mode run --frames 6 --out .../charizard-pose-run.png
  python3 pose_guide.py --slug venomoth --locomotion fly --out /tmp/mons-refs/venomoth-pose-guide.png   # v2 4-key guide
  python3 pose_guide.py --all            # every species in Fall-back -> Fall-back/<Gen>/<NNN-Name>/<slug>-pose-guide.png
"""
import argparse
import glob
import json
import os
import re
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PYDEPS = os.path.join(SCRIPT_DIR, ".pydeps")
if os.path.isdir(PYDEPS) and PYDEPS not in sys.path:
    sys.path.insert(0, PYDEPS)
from PIL import Image, ImageDraw  # noqa: E402

REPO = os.path.abspath(os.path.join(SCRIPT_DIR, "../.."))
DEX = os.path.join(REPO, "assets", "units")
def _sheets_dir():
    """pre-rendered 3D sheets: $MONS_3D_DIR, else <repo>/pokemon3d (symlink, git-ignored), else $MONS_SODIER_WAR/client/assets/pokemon3d"""
    for d in (os.environ.get("MONS_3D_DIR"),
              os.path.join(os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../..")), "pokemon3d"),
              os.path.join(os.environ.get("MONS_SODIER_WAR") or "/home/huy/Main/sodier-war-next", "client/assets/pokemon3d")):
        if d and os.path.isdir(d):
            return d
    return "pokemon3d"  # -> clear "not found" error below


SHEETS = _sheets_dir()
DIR_COLS = [0, 6, 2, 4]          # down, left, right, up in the 3D sheet's 8-direction order
MAGENTA = (255, 0, 255)


def slug_of(name):
    s = name.lower().replace("♀", "-f").replace("♂", "-m")
    s = re.sub(r"['’.]+", "", s)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def loops_for(meta, locomotion):
    m = meta["modes"]
    walk = "walk" if "walk" in m else next(iter(m))
    fly = "fly" if "fly" in m else walk
    return {"walk": [walk], "walk_fly": [walk, fly], "fly": [fly if "fly" in m else walk]}[locomotion]


def plan(meta, locomotion, with_run=False):
    """loops to draw (decision 2026-11-18, option B): idle, walk (species that walk), fly (species that fly), from the
    species' own 3D model; run only on request (with_run) -- the game plays the walk faster when running"""
    m = meta["modes"]
    out = ["idle"] if "idle" in m else []
    if locomotion in ("walk", "walk_fly") and "walk" in m:
        out.append("walk")
        if with_run and "run" in m:
            out.append("run")
    if locomotion in ("fly", "walk_fly") and ("fly" in m or locomotion == "fly"):
        out.append("fly")
    return out


def guide(slug, locomotion, out, sheets_dir=SHEETS, cell=128, mode=None, frames=4):
    """mode=None: the v2 4-key guide (walk and/or fly by locomotion). mode=walk|run|fly: ONE loop, `frames` columns."""
    jp = os.path.join(sheets_dir, f"{slug}.json")
    if not os.path.isfile(jp):
        sys.exit(f"no 3D sheet for '{slug}' in {sheets_dir} (set MONS_3D_DIR, or link <repo>/pokemon3d to the rendered "
                 "sheets, or render it: tools/model3d/build_fallback.py); use the v2 fallback without a pose guide")
    meta = json.load(open(jp))
    if mode:
        src = mode if mode in meta["modes"] else ("walk" if mode == "run" else next(iter(meta["modes"])))
        loops, fly_cols = [src], ({0} if mode == "fly" or (mode == "idle" and locomotion == "fly") else set())
    else:
        loops = loops_for(meta, locomotion)
        fly_cols = {1} if locomotion == "walk_fly" else ({0} if locomotion == "fly" else set())
    n = meta["frames"]
    picks = [round(i * n / frames) % n for i in range(frames)]
    ref_scale = meta["modes"][loops[0]]["scale"]
    # collect cells at a common px-per-model-unit, anchored at the feet
    cells = []  # (loop_idx, row, frame, image, foot_y)
    imgs = {}
    for li, mode in enumerate(loops):
        md = meta["modes"][mode]
        im = imgs.setdefault(md["file"], Image.open(os.path.join(sheets_dir, md["file"])).convert("RGBA"))
        c, k = md["cell"], ref_scale / md["scale"]
        for r, dc in enumerate(DIR_COLS):
            for fi, f in enumerate(picks):
                sp = im.crop((dc * c, f * c, (dc + 1) * c, (f + 1) * c))  # noqa: E501
                if k != 1:
                    sp = sp.resize((max(1, round(c * k)), max(1, round(c * k))), Image.LANCZOS)
                cells.append((li, r, fi, sp, md["foot"] * sp.height))
    # one scale for the whole guide: fit every sprite (relative to its feet) into the 80% safe box
    top = bot = side = 1e-6
    for li, r, fi, sp, fy in cells:
        bb = sp.getbbox()
        if bb:
            top, bot = max(top, fy - bb[1]), max(bot, bb[3] - fy)
            side = max(side, abs(bb[0] - sp.width / 2), abs(bb[2] - sp.width / 2))
    safe, lift = 0.8 * cell, 0.12 * cell
    s = min(safe / (top + bot + lift), (safe / 2) / side)
    base = cell * 0.1 + top * s + lift  # feet line inside the cell (fly cells sit `lift` higher)
    cols = len(picks) * len(loops)
    sheet = Image.new("RGB", (cols * cell, 4 * cell), MAGENTA)
    d = ImageDraw.Draw(sheet)
    for li, r, fi, sp, fy in cells:
        sp = sp.resize((max(1, round(sp.width * s)), max(1, round(sp.height * s))), Image.LANCZOS)
        col = li * len(picks) + fi
        x0, y0 = col * cell, r * cell
        feet = base - (lift if li in fly_cols else 0)
        if li in fly_cols:  # shadow ellipse on the ground line, like the v2 fly frames
            w = cell * 0.3
            d.ellipse([x0 + cell / 2 - w / 2, y0 + base - cell * 0.025, x0 + cell / 2 + w / 2, y0 + base + cell * 0.025], fill=(42, 16, 58))
        a = sp.split()[3].point(lambda v: 255 if v > 110 else 0)
        sheet.paste(sp.convert("RGB"), (round(x0 + cell / 2 - sp.width / 2), round(y0 + feet - fy * s)), a)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    sheet.quantize(128, method=Image.Quantize.FASTOCTREE).save(out, optimize=True)
    return f"{slug}: {mode or locomotion} {sheet.size[0]}x{sheet.size[1]} loops={loops} 3D frames={[p + 1 for p in picks]}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug")
    ap.add_argument("--locomotion", choices=["walk", "walk_fly", "fly"])
    ap.add_argument("--out")
    ap.add_argument("--sheets-dir", default=SHEETS)
    ap.add_argument("--cell", type=int, default=128)
    ap.add_argument("--mode", choices=["idle", "walk", "run", "fly"], help="one movement loop (v3 per-loop generation)")
    ap.add_argument("--with-run", action="store_true", help="--plan: also list the optional run loop")
    ap.add_argument("--frames", type=int, default=6, help="frames per loop with --mode (default 6 = every 2nd 3D frame; 12 = all)")
    ap.add_argument("--plan", action="store_true", help="print the loops to draw for --slug/--locomotion and exit")
    ap.add_argument("--all", action="store_true", help="write <slug>-pose-guide.png into every Fall-back species folder")
    a = ap.parse_args()
    if a.plan:
        jp = os.path.join(a.sheets_dir, f"{a.slug}.json")
        if not os.path.isfile(jp):
            sys.exit(f"no 3D sheet for '{a.slug}' in {a.sheets_dir} (set MONS_3D_DIR or link <repo>/pokemon3d)")
        print(" ".join(plan(json.load(open(jp)), a.locomotion, a.with_run)))
        return
    if not a.all:
        print(guide(a.slug, a.locomotion, a.out, a.sheets_dir, a.cell, a.mode, a.frames if a.mode else 4))
        return
    loco = {p["no"]: p["locomotion"] for p in json.load(open(os.path.join(REPO, "data", "units", "pokemon-locomotion.json"), encoding="utf-8"))["units"]}
    ok = fail = 0
    for d in sorted(glob.glob(os.path.join(DEX, "Fall-back", "Gen*", "[0-9]*-*"))):
        no, name = os.path.basename(d).split("-", 1)
        slug = slug_of(name)
        try:
            guide(slug, loco.get(int(no), "walk"), os.path.join(d, f"{slug}-pose-guide.png"), a.sheets_dir, a.cell)
            ok += 1
        except Exception as e:  # noqa: BLE001
            fail += 1
            print("FAIL", os.path.basename(d), e)
    print(f"pose guides: {ok} ok, {fail} failed")


if __name__ == "__main__":
    main()
