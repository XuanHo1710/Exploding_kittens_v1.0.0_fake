"""Follower walk sheets re-rendered from the Fall-back 3D models, for every species that has no hand-drawn
`<slug>-movement.png` (user 2026-11-20, decisions.md §32; the 2D species get theirs cut by
game/tools/follower_assets.py). Same format as the cut sheets:

  <slug>-walk.png        4 rows (down, left, right, up) x FRAMES walk frames of 32x32, feet on the bottom row, centred
  <slug>-walk-shiny.png  the same with the model's shiny texture (when it has one)
  <slug>-render.json     gains "walk": {file, frames, cycle, elevation, yaws, scale, height} (+ "shinyFile")

written into the species' Fall-back folder next to its battle render (decisions.md §5b). Camera: orthographic,
ELEV degrees above the ground (the overworld view; battle sprites use 8), yaws 180 / 90 / 270 / 0 for down / left /
right / up (the 8-direction order of tools/model3d/build_fallback.py: 180 + 45 d, S, SE, E, ...). Animation: the
walk that build_fallback.plan picks (procedural leg swing, glide or hover included), FRAMES samples of one loop.
Size: the map height of decisions.md §6 (game/tools/follower_assets.py drawn_height), one scale for every frame and
direction. The §5 look (3x supersampling + smooth()) and one 15-colour BGR555 palette per image.

Needs numpy + OpenCV ($MONS_PY3D). Resumable (a species whose json already has a current "walk" is skipped):

  $MONS_PY3D tools/model3d/walk_sprites.py --jobs 12
  $MONS_PY3D tools/model3d/walk_sprites.py --only 286 --force
  $MONS_PY3D tools/model3d/walk_sprites.py --contact        # tmp/report/3d-walk/contact-*.png
"""
import argparse
import json
import math
import os
import signal
import sys
import time
import traceback

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(REPO, "game", "tools"))
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

import battle_sprites as bs  # noqa: E402
import build_fallback as bf  # noqa: E402
import follower_assets  # noqa: E402
from render3d import pose  # noqa: E402

VERSION = 1
ELEV = 30
FRAMES = 4
CELL = follower_assets.FRAME
YAWS = (180, 90, 270, 0)                        # down, left, right, up
LOG = os.path.join(REPO, "tmp", "model3d-walk.log")
REPORT = os.path.join(REPO, "tmp", "report", "3d-walk")


def walk_frames(model, A, poser):
    """(frames [pose], loop seconds, hidden bones) of the walk loop"""
    pick, _air = bf.plan(model, A, poser)
    if pick is None and poser:
        pick, _air = bf.plan(model, A, {})
    if pick is None:
        raise RuntimeError("no usable animation")
    name, speed, proc, rec = pick.get("walk") or pick["idle"]
    rec = rec or poser.get("WALK") or poser.get("STAND") or {}
    anim = A.get(name) if name else None
    L0 = bf.length(anim) if anim else 2.0
    L = 1.0 / speed if proc else L0 / speed
    LB = bf.limbs(model, rec.get("proc") or None) if proc else {}
    out = []
    for f in range(FRAMES):
        t = f / FRAMES * L if proc else f / FRAMES * L * speed
        pz = pose(anim, t) if anim else {}
        for b, (r, p) in rec.get("offs", {}).items():
            r0, p0, s0 = pz.get(b, bs.ZERO)
            pz[b] = (r0 + np.asarray(r, float), p0 + np.asarray(p, float), s0)
        if proc:
            pz = bf.proc_walk(pz, t, 1.0 / L, LB)
        out.append(pz)
    return out, L, set(rec.get("hide", ()))


def sheet(model, frames, height):
    """the 4 x FRAMES sheet, its scale"""
    ext = bs.union([bs.extent(model, pz, y) for y in YAWS for pz in frames])
    if ext is None:
        raise RuntimeError("blank render")
    w, h = ext[1] - ext[0], ext[3] - ext[2]
    scale = min((height - 1) / max(h, math.sqrt(w * h), 1e-6), (CELL - 2) / max(w, 1e-6))
    for _ in range(4):
        ims = [[bs.draw(model, pz, y, ext, scale)[0] for pz in frames] for y in YAWS]
        boxes = [im.getbbox() for row in ims for im in row]
        if not all(boxes):
            raise RuntimeError("blank render")
        bx = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
        if bx[3] - bx[1] <= CELL and bx[2] - bx[0] <= CELL:
            break
        scale *= min(CELL / (bx[3] - bx[1] + 0.5), CELL / (bx[2] - bx[0] + 0.5))
    bw, bh = bx[2] - bx[0], bx[3] - bx[1]
    out = Image.new("RGBA", (CELL * FRAMES, CELL * 4), (0, 0, 0, 0))
    for r, row in enumerate(ims):
        for i, im in enumerate(row):
            out.alpha_composite(im.crop(bx), (i * CELL + (CELL - bw) // 2, r * CELL + CELL - bh))
    return bs.palette15(out), scale


def build(gen, folder, slug):
    t0 = time.time()
    bs.ELEV = ELEV                                 # extent() / draw() read the module's camera elevation
    src = os.path.join(bs.FALLBACK, gen, folder)
    rj = os.path.join(src, f"{slug}-render.json")
    meta = json.load(open(rj))
    height = follower_assets.drawn_height(folder.split("-", 1)[1])
    model, A, poser = bf.load(src)
    frames, L, hide = walk_frames(model, A, poser)
    model.hide = hide
    im, scale = sheet(model, frames, height)
    bs.save(im, os.path.join(src, f"{slug}-walk.png"))
    walk = {"version": VERSION, "file": f"{slug}-walk.png", "frames": FRAMES, "cycle": round(L, 3), "elevation": ELEV,
            "yaws": list(YAWS), "scale": round(scale, 4), "height": height}
    try:
        if bf.shiny_texture(src):
            smodel, sA, sposer = bf.load(src, shiny=True)
            sframes, _, _ = walk_frames(smodel, sA, sposer)
            smodel.hide = hide
            sim, _ = sheet(smodel, sframes, height)
            bs.save(sim, os.path.join(src, f"{slug}-walk-shiny.png"))
            walk["shinyFile"] = f"{slug}-walk-shiny.png"
    except Exception as e:                          # no shiny texture: the game falls back to the normal sheet
        walk["shinyError"] = f"{type(e).__name__}: {e}"[:200]
    meta = json.load(open(rj))                     # re-read: another tool may have written it meanwhile
    meta["walk"] = walk
    tmp = rj + ".part"
    with open(tmp, "w") as f:
        json.dump(meta, f, indent=1)
    os.replace(tmp, rj)
    return f"{gen}/{folder} ok {time.time() - t0:.0f}s h={height} cycle={L:.2f}{' shiny' if 'shinyFile' in walk else ''}"


def done(gen, folder, slug):
    try:
        r = json.load(open(os.path.join(bs.FALLBACK, gen, folder, f"{slug}-render.json")))
        w = r.get("walk") or {}
        return w.get("version") == VERSION and os.path.isfile(os.path.join(bs.FALLBACK, gen, folder, w["file"]))
    except Exception:
        return False


def rendered(gen, folder, slug):
    return os.path.isfile(os.path.join(bs.FALLBACK, gen, folder, f"{slug}-render.json"))


def _alarm(*_):
    raise TimeoutError("timeout (300 s)")


def work(job):
    gen, folder, slug, force = job
    if not rendered(gen, folder, slug):
        return "skip", f"{gen}/{folder} skip (no battle render)"
    if not force and done(gen, folder, slug):
        return "skip", f"{gen}/{folder} skip (done)"
    signal.signal(signal.SIGALRM, _alarm)
    signal.alarm(300)
    try:
        return "ok", build(gen, folder, slug)
    except Exception as e:
        tb = traceback.format_exc().splitlines()
        return "fail", f"{gen}/{folder} FAIL {type(e).__name__}: {e} | {tb[-3].strip() if len(tb) > 2 else ''}"
    finally:
        signal.alarm(0)


def contact(items):
    """contact sheets of the rendered walk sheets (4x zoom on a grass green) -> tmp/report/3d-walk/"""
    os.makedirs(REPORT, exist_ok=True)
    ok = [it for it in items if done(*it)]
    per = 40
    for s in range(0, len(ok), per):
        part = ok[s:s + per]
        cols = 4
        sheet_ = Image.new("RGBA", (cols * (CELL * FRAMES + 8), ((len(part) + cols - 1) // cols) * (CELL * 4 + 8)),
                           (120, 170, 110, 255))
        for i, (gen, folder, slug) in enumerate(part):
            im = Image.open(os.path.join(bs.FALLBACK, gen, folder, f"{slug}-walk.png")).convert("RGBA")
            sheet_.alpha_composite(im, ((i % cols) * (CELL * FRAMES + 8), (i // cols) * (CELL * 4 + 8)))
        sheet_.resize((sheet_.width * 2, sheet_.height * 2), Image.NEAREST).save(os.path.join(REPORT, f"contact-{s // per + 1}.png"))
    print(f"{len(ok)} walk sheets -> {os.path.relpath(REPORT, REPO)}/")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 4) - 2))
    ap.add_argument("--only", action="append", default=[], help="dex number or name (repeatable)")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--contact", action="store_true", help="only write the contact sheets")
    a = ap.parse_args()
    want = {w.lower().lstrip("0") for w in a.only}
    items = bs.species_list()
    if a.only:
        items = [it for it in items if it[1].split("-", 1)[0].lstrip("0") in want or it[2] in want
                 or it[1].split("-", 1)[1].lower() in want]
    if a.contact:
        return contact(items)
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    import multiprocessing as mp
    n = {"ok": 0, "skip": 0, "fail": 0}
    jobs = [(*it, a.force) for it in items]
    with open(LOG, "a", encoding="utf-8") as log, mp.Pool(a.jobs, initializer=bs._init) as pool:
        log.write(f"{time.strftime('%F %T')} start {len(jobs)} species, {a.jobs} jobs\n")
        for i, (st, msg) in enumerate(pool.imap_unordered(work, jobs), 1):
            n[st] += 1
            line = f"{time.strftime('%T')} [{i}/{len(jobs)}] {msg}"
            log.write(line + "\n")
            log.flush()
            print(line, flush=True)
        log.write(f"{time.strftime('%F %T')} end ok={n['ok']} skip={n['skip']} fail={n['fail']}\n")
    print(n)


if __name__ == "__main__":
    main()
