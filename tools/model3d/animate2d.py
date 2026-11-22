"""Re-time a hand-drawn v2 movement sheet with the motion of the species' 3D model.

The drawings stay 100% hand-drawn: for every output frame the 3D loop (same direction) decides
  * WHICH hand-drawn key pose to show: fly loops -> the key whose phase matches the 3D silhouette phase (wings
    up / half / down); walk loops -> the keys in step order, as many strides as the 3D body bob shows, and
  * HOW MUCH to shift it: the 3D body's vertical bob and sideways sway, scaled to the 2D sprite size.
Loops are NOT fixed: one loop per movement mode the 3D model has that fits the species (walk, run, fly, in that order;
run re-uses the walk drawings at the 3D run rhythm), each with as many frames as the 3D sheet (or --frames).
Output: same rows (down, left, right, up), 192 px cells, loops side by side, magenta background, shadows kept in place.
The loop layout is embedded in the PNG (tEXt "mons-loops": [{mode, frames, cycle, keys}, ...]); the game reads it via
the manifest, so the folder still holds only the 2 sheet files.

usage: python tools/model3d/animate2d.py <v2 movement.png> <3d sheets dir> <slug> <walk|walk_fly|fly> <out.png> [--frames N]
"""
import json, os, sys
import numpy as np
from PIL import Image

CELL = 192
DIR3D = [0, 6, 2, 4]  # 3D sheet columns for down, left, right, up


def is_bg(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    return (r - g > 80) & (b - g > 80) & (r > 120) & (b > 120)


def is_shadow(a):  # the dark purple ellipse normalize_sheet draws: (42,16,58) / outline (27,23,38)
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    return (r < 60) & (g < 40) & (b < 75)


def split_cell(cell):
    """creature (RGBA, shadow removed) and the shadow layer of one 2D cell"""
    a = np.asarray(cell.convert("RGB"))
    bg = is_bg(a)
    sh = is_shadow(a) & ~bg
    # the shadow is the flat ellipse below the sprite: keep only dark pixels in rows that are mostly shadow
    rows = np.where(sh.sum(1) > 0.6 * np.maximum(1, (~bg).sum(1)))[0]
    shadow_rows = np.zeros_like(bg)
    if len(rows):
        shadow_rows[rows] = True
    shadow = sh & shadow_rows
    body = ~bg & ~shadow
    rgba = np.dstack([a, (body * 255).astype(np.uint8)])
    return Image.fromarray(rgba), shadow


def metrics(alpha):
    ys, xs = np.nonzero(alpha)
    if not len(ys):
        return None
    return {"top": ys.min(), "bot": ys.max(), "h": ys.max() - ys.min() + 1, "cx": xs.mean(), "cy": ys.mean()}


def norm(v):
    v = np.asarray(v, float)
    return (v - v.min()) / (v.max() - v.min()) if v.max() > v.min() else np.zeros_like(v)


LOOP_META_KEY = "mons-loops"  # PNG tEXt chunk: JSON list of {mode, frames, cycle, keys} in column order


def save_with_loops(img, path, loops):
    """save the sheet with its loop layout embedded (keeps the 2-file folder rule; the game manifest reads it)"""
    from PIL.PngImagePlugin import PngInfo
    info = PngInfo()
    info.add_text(LOOP_META_KEY, json.dumps(loops, separators=(",", ":")))
    img.save(path, pnginfo=info)


def plan_loops(meta, loco, frames=None):
    """which loops to build: every movement mode the 3D model has that fits the species' locomotion, in the order
    walk, run, fly. Walk and run reuse the hand-drawn WALK keys (run = the same drawings at the 3D run rhythm);
    fly uses the FLY keys. Frames per loop = the 3D sheet's frame count unless overridden."""
    m = meta["modes"]
    groups = {"walk": ["walk"], "fly": ["fly"], "walk_fly": ["walk", "fly"]}[loco]
    plan = []
    if "walk" in groups:
        for mode in ("walk", "run"):
            if mode in m:
                plan.append({"mode": mode, "keys": "walk", "src3d": mode})
    if "fly" in groups:
        src = "fly" if "fly" in m else ("walk" if "walk" in m else next(iter(m)))
        plan.append({"mode": "fly", "keys": "fly", "src3d": src})
    n = frames or meta["frames"]
    for p in plan:
        p["frames"] = n
        p["cycle"] = round(m[p["src3d"]]["cycle"], 3)
    return plan, groups


def main():
    src, sheets, slug, loco, out = sys.argv[1:6]
    NF = int(sys.argv[sys.argv.index("--frames") + 1]) if "--frames" in sys.argv else None
    meta = json.load(open(os.path.join(sheets, f"{slug}.json")))
    plan, groups = plan_loops(meta, loco, NF)
    im2 = Image.open(src).convert("RGB")
    if im2.size != (4 * len(groups) * CELL, 4 * CELL):
        sys.exit(f"expected a normalized 4-key v2 sheet {4 * len(groups) * CELL}x{4 * CELL} for '{loco}', got {im2.size[0]}x{im2.size[1]}"
                 " (run normalize_sheet.py --mode move4 first; do not re-time an already re-timed sheet)")
    out_cols = sum(p["frames"] for p in plan)
    sheet = Image.new("RGB", (out_cols * CELL, 4 * CELL), (255, 0, 255))
    report = []
    col0 = 0
    for p in plan:
        N, gi = p["frames"], groups.index(p["keys"])
        md = meta["modes"][p["src3d"]]
        im3 = np.asarray(Image.open(os.path.join(sheets, md["file"])).convert("RGBA"))
        c3, F3 = md["cell"], meta["frames"]
        walking = p["keys"] == "walk"
        idx = [round(i * F3 / N) % F3 for i in range(N)]
        strides = 1
        if walking:  # steps per loop from the 3D front-view bob (dips = foot planted); a stride = 2 steps
            bots = [metrics(im3[f * c3:(f + 1) * c3, DIR3D[0] * c3:(DIR3D[0] + 1) * c3, 3] > 0)["bot"] for f in idx]
            steps = sum(1 for i in range(N) if bots[i] > bots[i - 1] and bots[i] >= bots[(i + 1) % N]) or 2
            strides = max(1, round(steps / 2))
        for r in range(4):
            keys = [split_cell(im2.crop(((gi * 4 + k) * CELL, r * CELL, (gi * 4 + k + 1) * CELL, (r + 1) * CELL))) for k in range(4)]
            km = [metrics(np.asarray(k[0])[..., 3] > 0) for k in keys]
            kh = norm([x["h"] for x in km])
            m3 = [metrics(im3[f * c3:(f + 1) * c3, DIR3D[r] * c3:(DIR3D[r] + 1) * c3, 3] > 0) for f in idx]
            h3 = norm([x["h"] for x in m3])
            rising = [h3[(i + 1) % N] >= h3[i - 1] for i in range(N)]
            k = np.mean([x["h"] for x in km]) / max(1e-6, np.mean([x["h"] for x in m3]))
            cy0, cx0 = np.mean([x["bot"] for x in m3]), np.mean([x["cx"] for x in m3])
            hi_key, lo_key = int(np.argmax(kh[[0, 2]]) * 2), int(np.argmin(kh[[0, 2]]) * 2)
            for i in range(N):
                # walk/run: the 4 walk keys in step order (contact L, passing, contact R, passing), `strides` per loop.
                # fly: phase of the 3D loop -- tallest silhouette -> the tall extreme key, lowest -> the short one,
                # in between -> the half pose matching the direction of travel
                if walking:
                    best = int(((i / N) * strides % 1) * 4)
                elif h3[i] >= 0.75:
                    best = hi_key
                elif h3[i] <= 0.25:
                    best = lo_key
                else:
                    best = 3 if rising[i] else 1
                spr, shadow = keys[best]
                dy = int(round((m3[i]["bot"] - cy0) * k))
                dx = int(round((m3[i]["cx"] - cx0) * k * 0.5))
                cell = Image.new("RGB", (CELL, CELL), (255, 0, 255))
                if shadow.any():  # shadow stays on the ground
                    cell_np = np.asarray(cell).copy()
                    src_np = np.asarray(im2.crop(((gi * 4 + best) * CELL, r * CELL, (gi * 4 + best + 1) * CELL, (r + 1) * CELL)))
                    cell_np[shadow] = src_np[shadow]
                    cell = Image.fromarray(cell_np)
                cell.paste(spr.convert("RGB"), (dx, dy), spr)
                sheet.paste(cell, ((col0 + i) * CELL, r * CELL))
                if r == 0:
                    report.append(f"{p['mode']}{i + 1}:k{best + 1}{dy:+d}")
        col0 += N
    loops = [{k: p[k] for k in ("mode", "frames", "cycle", "keys")} for p in plan]
    save_with_loops(sheet, out, loops)
    print(f"{slug}: {loco} -> {sheet.size[0]}x{sheet.size[1]} loops " + ", ".join(f"{l['mode']} {l['frames']}f/{l['cycle']}s" for l in loops))
    print("  down row:", " ".join(report))


if __name__ == "__main__":
    main()
