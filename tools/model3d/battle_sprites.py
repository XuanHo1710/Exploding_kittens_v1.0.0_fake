"""Battle front / back sprites and the party icon re-rendered from the Fall-back 3D models, for every species that has
no hand-drawn `<slug>-movement.png` (decisions.md §5b). Same formats as the sprites the game cuts from the 2D sheets
(game/tools/build_assets.py battle_strip, tools/ui/mon_icons.py):

  <slug>-front.png   2 idle frames side by side, each frameW x 64*res (feet on the bottom row), foe view (yaw 140)
  <slug>-back.png    2 idle frames side by side, each frameW x 80*res, player view (yaw 340)
  <slug>-icon.png    32x64: two 32x32 frames stacked, frame 2 one pixel higher (the Gen 3 party-icon hop)
  <slug>-render.json yaw, elevation, scale, foot anchor, frame sizes, source model + licence note

written into the species' Fall-back folder `assets/pokemon/Fall-back/<GenX-Region>/<NNN>-<Name>/`. Camera:
orthographic, 8 degrees above the ground (near eye level); pose: the poser's battle pose (else `battle_idle`, else the
standing idle), sampled at t = 0 and half a loop; the decisions.md §5 look (3x supersampling + smooth()); one
15-colour BGR555 palette per image (Gen 3 OBJ rule, `check_gen3.py --grid 1 --max-palettes 1`). Size: a bigger
species fills more of the frame (`size_frac`: 0.7 to 1.0 of the frame height from data/pokemon/pokemon_sizes.json).
Resolution (`--res`, default 2; user 2026-11-20, decisions.md §5c): the game shows the sprites in the Gen 3 box (64 px
foe / 80 px player high, at most 96 / 120 px wide) and draws them from textures `res` times finer (128 / 160 px frames).

Needs numpy + OpenCV ($MONS_PY3D). Resumable (a species with a current `-render.json` is skipped):

  $MONS_PY3D tools/model3d/battle_sprites.py --jobs 8                 # every species without a 2D sheet
  $MONS_PY3D tools/model3d/battle_sprites.py --only 286 --only Joltik --force
  $MONS_PY3D tools/model3d/battle_sprites.py --contact 60             # QC contact sheets + failed list only
  $MONS_PY3D tools/model3d/battle_sprites.py --shiny --jobs 8         # shiny views from the shiny textures

--shiny (user, 2026-11-20) renders the same views with the model's shiny texture (the resolver's `shiny` variation):
<slug>-front-shiny.png, <slug>-back-shiny.png, <slug>-icon-shiny.png, same sizes and anchors, recorded under "shiny"
in the species' -render.json (a later normal re-render keeps that entry). A model without a shiny texture fails
("no shiny texture"): recolour its render with tools/units/shiny_recolor.py --fallback-3d instead.
"""
import argparse
import glob
import json
import math
import os
import random
import re
import signal
import sys
import time
import traceback
import unicodedata

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "gen3"))
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

import build_fallback as bf  # noqa: E402  (also patches render3d.molang: unknown names -> 1.0)
import gen3  # noqa: E402
from render3d import pose, render, rot, smooth  # noqa: E402

VERSION = 2                    # 2: textures `res` x the Gen 3 box (was 40 / 52 px frames)
FALLBACK = os.path.join(REPO, "assets", "units", "Fall-back")
SIZES = os.path.join(REPO, "data", "units", "pokemon_sizes.json")
LOCOMOTION = os.path.join(REPO, "data", "units", "pokemon-locomotion.json")
LOG = os.path.join(REPO, "tmp", "model3d-batch.log")
REPORT = os.path.join(REPO, "tmp", "report", "3d-sprites")
SS = 3
ELEV = 8
BOX = {"front": (64, 96), "back": (80, 120)}   # the game's on-screen box per view: height, max width (native px)
RES = 2


def views(res):
    """view -> yaw, frame height (texture px), max sprite width, for textures `res` times the on-screen size"""
    return {v: {"yaw": y, "h": round(BOX[v][0] * res), "max_w": round(BOX[v][1] * res)}
            for v, y in (("front", 140), ("back", 340))}


VIEWS = views(RES)
ICON = {"yaw": 140, "cell": 32, "fit": 28, "bottom": 30}
LICENCE = ("Re-rendered from the Fall-back 3D model, animation and texture (CC BY-NC 3.0, non-commercial; "
           "credit: THIRD_PARTY_NOTICES.md section 1)")


def species_slug(folder):
    """decisions.md §1 (same as tools/lint_repo.py species_slug)."""
    name = folder.split("-", 1)[1].lower().replace("♀", "-f").replace("♂", "-m")
    name = re.sub(r"['’.]", "", name)
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", name).strip("-")


def species_list(with_2d=False):
    """[(gen, folder, slug)] of the Fall-back species without a hand-drawn movement sheet (all with with_2d)."""
    out = []
    for d in sorted(glob.glob(os.path.join(FALLBACK, "Gen*", "*", ""))):
        gen, folder = d.rstrip("/").split("/")[-2:]
        if not re.match(r"\d{3,4}-", folder):
            continue
        has2d = glob.glob(os.path.join(REPO, "assets", "units", gen, glob.escape(folder), "*-movement.png"))
        if with_2d or not has2d:
            out.append((gen, folder, species_slug(folder)))
    return out


def size_frac(name):
    """0.7..1.0: share of the frame height the sprite fills. game_h = hitbox.height x baseScale (decisions.md §6),
    compressed like the map sizes (0.95 h^0.45, clamped 0.65..2.4 m): <= 0.65 m -> 0.7, >= 1.6 m -> 1.0. A placeholder
    entry (hitbox 1 x 1, baseScale 1: species the upstream data has no real size for) uses the Pokédex height."""
    try:
        sz = json.load(open(SIZES, encoding="utf-8")).get(name) or {}
        hb = sz.get("hitbox") or {}
        stub = hb.get("width") == 1 and hb.get("height") == 1 and sz.get("baseScale", 1) == 1   # placeholder entry
        h = hb["height"] * sz.get("baseScale", 1.0) if hb.get("height") and not stub else sz["height"] / 10
    except Exception:
        return 0.85
    drawn = min(max(0.95 * h ** 0.45, 0.65), 2.4)
    return round(min(max(0.7 + 0.3 * (drawn - 0.65) / (1.6 - 0.65), 0.7), 1.0), 3)


# ---------------------------------------------------------------- pose
ZERO = (np.zeros(3), np.zeros(3), np.ones(3))


def aquatic(dex):
    try:
        return any(p["no"] == dex and p.get("aquatic") for p in json.load(open(LOCOMOTION))["units"])
    except Exception:
        return False


def battle_pose(folder, model, A, poser, water=False):
    """(anim name, {bone: (rot, pos)} offsets, hidden bones): for aquatic species the swimming idle (upright in the
    water, as Gen 3 draws fish; their ground pose flops on its side), else the poser's isBattle pose, else
    `battle_idle`, else the standing / hovering idle that build_fallback.plan picks."""
    if water:
        name = next((k for k in ("water_idle", "surfacewater_idle") if k in A), None)
        if name:
            rec = poser.get("STAND") or {}
            return name, {}, set(rec.get("hide", ()))
    for pf in sorted(glob.glob(os.path.join(folder, "posers", "*.json"))):
        try:
            pj = json.load(open(pf))
        except Exception:
            continue
        glob_tp = pj.get("transformedParts") if isinstance(pj.get("transformedParts"), list) else []
        for pname, p in (pj.get("poses") or {}).items():
            if not isinstance(p, dict) or not p.get("isBattle") or re.search("ride|sleep|water", pname, re.I):
                continue
            anims = [m.group(2) for a in p.get("animations", []) if isinstance(a, str)
                     for m in [re.search(r"bedrock\(\s*'([^']+)'\s*,\s*'([^']+)'", a)] if m]
            anims = [a for a in anims if a in A]
            if not anims:
                continue
            hide, offs = set(), {}
            for t in glob_tp + list(p.get("transformedParts") or []):
                if not isinstance(t, dict) or t.get("part") not in model.bones:
                    continue
                if t.get("isVisible") is False:
                    hide.add(t["part"])
                elif t.get("isVisible") is True:
                    hide.discard(t["part"])
                if "position" in t or "rotation" in t:
                    offs[t["part"]] = (np.array(t.get("rotation", [0, 0, 0]), float),
                                       np.array(t.get("position", [0, 0, 0]), float))
            return anims[0], offs, hide
        break
    pick, _air = bf.plan(model, A, poser)
    name, _speed, _proc, rec = pick["idle"]
    rec = rec or poser.get("STAND") or {}
    if "battle_idle" in A and "placeholder" not in json.dumps(A["battle_idle"])[:200].lower():
        name = "battle_idle"
    return name, rec.get("offs", {}), set(rec.get("hide", ()))


def frames_for(A, name, offs):
    """the two idle frames: t = 0 and half a loop"""
    anim = A.get(name) if name else None
    L = bf.length(anim) if anim else 2.0
    out = []
    for t in (0.0, L / 2):
        pz = pose(anim, t) if anim else {}
        for b, (r, p) in offs.items():
            r0, p0, s0 = pz.get(b, ZERO)
            pz[b] = (r0 + r, p0 + p, s0)
        out.append(pz)
    return out, L


# ---------------------------------------------------------------- render + fit
def axes(yaw):
    e = math.radians(ELEV)
    return rot([0, yaw, 0]), np.array([0, math.cos(e), -math.sin(e)])


def extent(model, pz, yaw):
    """true silhouette extent in model units (x0, x1, y0, y1; y up from the ground) from a 256 px mask probe"""
    Ry, up = axes(yaw)
    qs = model.quads(pz)
    if not qs:
        return None
    P = np.concatenate([q[0] for q in qs]) @ Ry.T
    xs, ys = P[:, 0], P @ up
    span = max(xs.max() - xs.min(), ys.max() - ys.min(), 1e-6)
    ps = 200 / span
    size = 256
    ox = -(xs.max() + xs.min()) / 2 * ps
    cy = 28 + ys.max() * ps
    a = render(model, pz, yaw, size, ps, elev=ELEV, foot=cy / size, ox=ox)[..., 3] > 0
    if not a.any():
        return None
    rr, cc = np.nonzero(a.any(1))[0], np.nonzero(a.any(0))[0]
    cx = size / 2 + ox
    return ((cc.min() - cx) / ps, (cc.max() + 1 - cx) / ps, (cy - rr.max() - 1) / ps, (cy - rr.min()) / ps)


def union(es):
    es = [e for e in es if e]
    return (min(e[0] for e in es), max(e[1] for e in es), min(e[2] for e in es), max(e[3] for e in es)) if es else None


def draw(model, pz, yaw, ext, scale):
    """one RGBA frame (binary alpha) with the §5 look; returns (image, ground origin x, y in its pixels)"""
    x0, x1, y0, y1 = ext
    S = int(math.ceil(max(x1 - x0, y1 - y0) * scale)) + 8
    cx = S / 2 - (x0 + x1) / 2 * scale
    cy = 4 + y1 * scale
    alb, msk, dep = render(model, pz, yaw, S * SS, scale * SS, elev=ELEV, foot=cy / S, ox=(cx - S / 2) * SS, raw=True)
    im = Image.fromarray(smooth(alb, msk, dep, S, round_px=1.0 * SS, bulge_px=2.4 * SS))
    im.putalpha(im.getchannel("A").point(lambda v: 255 if v >= 128 else 0))
    return im, cx, cy


def palette15(im):
    """one 15-colour BGR555 palette (+ transparency) for the whole image"""
    a = im.getchannel("A")
    rgb = im.convert("RGB")
    arr, on = np.asarray(rgb), np.asarray(a) > 0
    if not on.any():
        return im
    fill = tuple(int(v) for v in arr[on].mean(0))
    bg = Image.new("RGB", im.size, fill)
    bg.paste(rgb, mask=a)
    q = bg.quantize(colors=15, method=Image.Quantize.MEDIANCUT, kmeans=2, dither=Image.Dither.NONE).convert("RGBA")
    q.putalpha(a)
    return gen3.to_gen3(q, max_colours=15)


def strip(model, frames, yaw, H, frac, max_w):
    """2-frame battle strip (W*2 x H), frame width, scale, foot anchor (x, y in the frame)"""
    ext = union([extent(model, pz, yaw) for pz in frames])
    if ext is None:
        raise RuntimeError("blank render")
    w, h = ext[1] - ext[0], ext[3] - ext[2]
    target = max(8.0, H * frac - 2)              # the smooth() outline ring adds ~1 px on each side
    # size = max(height, sqrt(width x height)): a flat, wide body (Joltik, Togekiss in flight) is not drawn as tall
    # as an upright one of the same species size
    scale = min(target / max(h, math.sqrt(w * h), 1e-6), (max_w - 2) / max(w, 1e-6))
    for _ in range(3):
        ims = [draw(model, pz, yaw, ext, scale) for pz in frames]
        boxes = [im.getbbox() for im, _, _ in ims]
        if not all(boxes):
            raise RuntimeError("blank render")
        bx = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
        if bx[3] - bx[1] <= H and bx[2] - bx[0] <= max_w:
            break
        scale *= min(H / (bx[3] - bx[1] + 0.5), max_w / (bx[2] - bx[0] + 0.5))
    fw, fh = bx[2] - bx[0], bx[3] - bx[1]
    out = Image.new("RGBA", (fw * 2, H), (0, 0, 0, 0))
    for i, (im, _, _) in enumerate(ims):
        out.alpha_composite(im.crop(bx), (i * fw, H - fh))
    cx, cy = ims[0][1], ims[0][2]
    foot = (round(cx - bx[0], 1), round(cy - bx[1] + H - fh, 1))
    return palette15(out), fw, scale, foot


def icon(model, pz, yaw):
    ext = extent(model, pz, yaw)
    if ext is None:
        raise RuntimeError("blank render")
    fit = ICON["fit"] - 2
    scale = fit / max(ext[1] - ext[0], ext[3] - ext[2], 1e-6)
    im, _, _ = draw(model, pz, yaw, ext, scale)
    c = im.crop(im.getbbox())
    if max(c.size) > ICON["fit"]:
        s = ICON["fit"] / max(c.size)
        c = c.resize((max(1, round(c.width * s)), max(1, round(c.height * s))), Image.NEAREST)
    n = ICON["cell"]
    cell = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    cell.alpha_composite(c, ((n - c.width) // 2, ICON["bottom"] - c.height))
    out = Image.new("RGBA", (n, 2 * n), (0, 0, 0, 0))
    out.alpha_composite(cell, (0, 0))
    out.alpha_composite(cell, (0, n - 1))
    return palette15(out), scale


# ---------------------------------------------------------------- one species
def paths(gen, folder, slug, shiny=False):
    d = os.path.join(FALLBACK, gen, folder)
    sfx = "-shiny" if shiny else ""
    return {k: os.path.join(d, f"{slug}-{k}{'.json' if k == 'render' else sfx + '.png'}")
            for k in ("front", "back", "icon", "render")}


def save(im, path):
    tmp = path + ".part"
    im.save(tmp, format="PNG", optimize=True)
    os.replace(tmp, path)


def build(gen, folder, slug, shiny=False):
    t0 = time.time()
    src = os.path.join(FALLBACK, gen, folder)
    model, A, poser = bf.load(src, shiny=shiny)
    name, offs, hide = battle_pose(src, model, A, poser, aquatic(int(folder.split("-", 1)[0])))
    model.hide = set(hide)
    frames, L = frames_for(A, name, offs)
    frac = size_frac(folder.split("-", 1)[1])
    P = paths(gen, folder, slug, shiny)
    meta = {"version": VERSION, "tool": "tools/model3d/battle_sprites.py", "source": LICENCE,
            "model": os.path.relpath(model_path(src), REPO), "pose": name, "times": [0.0, round(L / 2, 3)],
            "elevation": ELEV, "camera": "orthographic", "size_frac": frac}
    for view, v in VIEWS.items():
        im, fw, scale, foot = strip(model, frames, v["yaw"], v["h"], frac, v["max_w"])
        save(im, P[view])
        meta[view] = {"file": os.path.basename(P[view]), "yaw": v["yaw"], "frames": 2, "frameW": fw, "frameH": v["h"],
                      "scale": round(scale, 4), "foot": list(foot)}
    im, scale = icon(model, frames[0], ICON["yaw"])
    save(im, P["icon"])
    meta["icon"] = {"file": os.path.basename(P["icon"]), "yaw": ICON["yaw"], "frames": 2, "frameW": 32, "frameH": 32,
                    "layout": "frames stacked vertically", "scale": round(scale, 4)}
    try:
        old = json.load(open(P["render"]))
    except Exception:
        old = {}
    if shiny:                                      # the shiny views go into the normal render's json
        meta = dict(old, shiny={k: meta[k] for k in ("front", "back", "icon")}
                    | {"texture": os.path.relpath(bf.shiny_texture(src), REPO), "version": VERSION})
    elif "shiny" in old:
        meta["shiny"] = old["shiny"]
    tmp = P["render"] + ".part"
    with open(tmp, "w") as f:
        json.dump(meta, f, indent=1)
    os.replace(tmp, P["render"])                   # json last = done
    return f"{gen}/{folder} ok {time.time() - t0:.0f}s pose={name} front={meta['front']['frameW']}" \
           f"x40 back={meta['back']['frameW']}x52 frac={frac}"


def model_path(src):
    rs = sorted(glob.glob(os.path.join(src, "resolvers", "*.json")))
    base = [r for r in rs if os.path.basename(r).startswith("0_")] or rs
    try:
        var = next(v for v in json.load(open(base[0]))["variations"] if v.get("aspects") == [])
        return os.path.join(src, "models", bf.bare(var["model"]) + ".json")
    except Exception:
        return os.path.join(src, "models")


def done(gen, folder, slug, shiny=False):
    try:
        P = paths(gen, folder, slug, shiny)
        r = json.load(open(P["render"]))
        r = r.get("shiny", {}) if shiny else r
        return (r.get("version") == VERSION and r.get("front", {}).get("frameH") == VIEWS["front"]["h"]
                and all(os.path.exists(P[k]) for k in VIEWS))
    except Exception:
        return False


def _alarm(*_):
    raise TimeoutError("timeout (300 s)")


def _init():
    import cv2
    cv2.setNumThreads(1)                           # one process per core already; OpenCV threads + fork can hang


def work(job):
    gen, folder, slug, force, shiny = job
    if not force and done(gen, folder, slug, shiny):
        return "skip", f"{gen}/{folder} skip (done)"
    if shiny and not done(gen, folder, slug):
        return "skip", f"{gen}/{folder} skip (no normal render)"
    signal.signal(signal.SIGALRM, _alarm)
    signal.alarm(300)
    try:
        return "ok", build(gen, folder, slug, shiny)
    except Exception as e:
        tb = traceback.format_exc().splitlines()
        return "fail", f"{gen}/{folder} FAIL {type(e).__name__}: {e} | {tb[-3].strip() if len(tb) > 2 else ''}"
    finally:
        signal.alarm(0)


# ---------------------------------------------------------------- QC
def contact(n, seed=7, only=None, tag=None):
    """contact sheets of n random rendered species (front / back / icon on a grey) + failed.txt; with `only` (a
    species filter) and `tag`: one sheet `contact-<tag>.png` of every matching species"""
    os.makedirs(REPORT, exist_ok=True)
    items = species_list()
    ok = [it for it in items if done(*it)]
    bad = [it for it in items if not done(*it)]
    reasons = {}
    if os.path.exists(LOG):
        for line in open(LOG, encoding="utf-8"):
            m = re.search(r"(Gen\S+/\S+) FAIL (.*)", line)
            if m:
                reasons[m.group(1)] = m.group(2).strip()
    covered = {int(os.path.basename(os.path.dirname(p)).split("-", 1)[0])
               for p in glob.glob(os.path.join(REPO, "assets", "units", "Gen*", "*", "*-movement.png"))}
    covered |= {int(it[1].split("-", 1)[0]) for it in species_list(True)}
    sizes = json.load(open(SIZES, encoding="utf-8"))
    nomodel = sorted((v["nationalPokedexNumber"], k) for k, v in sizes.items()
                     if v.get("nationalPokedexNumber") and v["nationalPokedexNumber"] not in covered)
    with open(os.path.join(REPORT, "failed.txt"), "w", encoding="utf-8") as f:
        for gen, folder, _ in bad:
            f.write(f"{gen}/{folder}\t{reasons.get(f'{gen}/{folder}', 'not rendered')}\n")
        for dex, name in nomodel:
            f.write(f"{dex:03d}-{name}\tno 3D model in Fall-back and no 2D sheet\n")
    pick = sorted(random.Random(seed).sample(ok, min(n, len(ok))))
    per, cw, ch = 20, 300, 66
    if only is not None:
        pick = [it for it in ok if only(it)]
        per = len(pick) or 1
    for s in range(0, len(pick), per):
        part = pick[s:s + per]
        sheet = Image.new("RGBA", (cw * 2, ch * ((len(part) + 1) // 2)), (200, 208, 200, 255))
        d = ImageDraw.Draw(sheet)
        for i, it in enumerate(part):
            P = paths(*it)
            x, y = (i % 2) * cw, (i // 2) * ch
            d.rectangle([x, y, x + cw - 1, y + ch - 1], outline=(150, 160, 150))
            d.text((x + 3, y + 2), it[1].encode("ascii", "replace").decode(), fill=(30, 30, 40))
            fr = Image.open(P["front"]).convert("RGBA")
            bk = Image.open(P["back"]).convert("RGBA")
            ic = Image.open(P["icon"]).convert("RGBA").crop((0, 0, 32, 32))
            sheet.alpha_composite(fr.crop((0, 0, fr.width // 2, fr.height)), (x + 4, y + ch - 2 - fr.height))
            sheet.alpha_composite(bk.crop((0, 0, bk.width // 2, bk.height)), (x + 100, y + ch - 2 - bk.height))
            sheet.alpha_composite(ic, (x + cw - 38, y + ch - 34))
        sheet = sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST)
        sheet.save(os.path.join(REPORT, f"contact-{tag or s // per + 1}.png"))
    print(f"{len(ok)} rendered, {len(bad)} failed, {len(nomodel)} species without any model or sheet"
          f" -> {os.path.relpath(REPORT, REPO)}/")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 4) - 2), help="worker processes")
    ap.add_argument("--only", action="append", default=[], help="dex number or name (repeatable)")
    ap.add_argument("--force", action="store_true", help="re-render species already done")
    ap.add_argument("--with-2d", action="store_true", help="also species that have a hand-drawn movement sheet")
    ap.add_argument("--contact", type=int, metavar="N", help="only write N-species contact sheets + failed.txt")
    ap.add_argument("--contact-tag", help="with --contact and --only: one sheet contact-<TAG>.png of those species")
    ap.add_argument("--list", action="store_true", help="print the species that would be rendered")
    ap.add_argument("--shiny", action="store_true", help="render the shiny views (<slug>-front-shiny.png ...) with the "
                    "model's shiny texture into the existing render's json")
    ap.add_argument("--res", type=float, default=RES, help="texture px per on-screen px (default 2: 128 / 160 px frames)")
    a = ap.parse_args()
    global VIEWS
    VIEWS = views(a.res)
    want = {w.lower().lstrip("0") for w in a.only}
    match = lambda it: (it[1].split("-", 1)[0].lstrip("0") in want or it[2] in want  # noqa: E731
                        or it[1].split("-", 1)[1].lower() in want)
    if a.contact:
        return contact(a.contact, only=match if a.only and a.contact_tag else None, tag=a.contact_tag)
    items = species_list(a.with_2d)
    if a.only:
        items = [it for it in items if match(it)]
    if a.list:
        for it in items:
            print(f"{it[0]}/{it[1]}\t{it[2]}\t{'done' if done(*it) else ''}")
        return
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    jobs = [(*it, a.force, a.shiny) for it in items]
    import multiprocessing as mp
    import shutil
    n = {"ok": 0, "skip": 0, "fail": 0}
    # no maxtasksperchild: recycled workers once left the pool waiting forever with no children (2026-11-20)
    with open(LOG, "a", encoding="utf-8") as log, mp.Pool(a.jobs, initializer=_init) as pool:
        log.write(f"{time.strftime('%F %T')} start {len(jobs)} species, {a.jobs} jobs\n")
        for i, (st, msg) in enumerate(pool.imap_unordered(work, jobs), 1):
            n[st] += 1
            line = f"{time.strftime('%T')} [{i}/{len(jobs)}] {msg}"
            log.write(line + "\n")
            log.flush()
            print(line, flush=True)
            if shutil.disk_usage(REPO).free < 1e9:
                log.write("DISK LOW (< 1 GB free): stopping\n")
                pool.terminate()
                break
        log.write(f"{time.strftime('%F %T')} end ok={n['ok']} skip={n['skip']} fail={n['fail']}\n")
    print(n)


if __name__ == "__main__":
    main()
