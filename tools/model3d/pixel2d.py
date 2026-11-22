"""2D pixel-art movement sheet (v2 layout) rendered straight from a Fall-back 3D model, so the 2D frames follow the 3D
motion exactly: rows = down, left, right, up; columns = 4 frames sampled evenly (1, 4, 7, 10 of 12) from the same
walk / fly loops the 3D sheets use. Pixel-art look: rendered small with nearest texels (no smoothing), palette
reduced, 1 px #1b1726 outline, then scaled up by an integer factor; magenta #FF00FF background, fly cells lifted 12%
above a shadow ellipse (same rules as normalize_sheet.py --mode move4).

usage (repo root, numpy + Pillow):
  python tools/model3d/pixel2d.py <slug> <Fall-back species folder> <walk|walk_fly|fly> <out.png> [--px 2]
"""
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw
import build_fallback as bf            # load / plan / limbs / proc_walk / length + its molang patch
from render3d import pose, render, outline

DIRS = [0, 6, 2, 4]                    # down, left, right, up (8-direction index, yaw = 180 + 45 * i)
PICK = [0, 3, 6, 9]                    # 4 of 12 frames
OUT_CELL = 192
SAT, DEEP = 1.45, 0.95


def sample(model, A, rec, name, speed, proc):
    """the same 12-frame sampling as build_fallback.build(), returns the 4 picked pose dicts"""
    rec = rec or {}
    anim = A.get(name) if name else None
    L0 = bf.length(anim) if anim else 2.0
    LB = bf.limbs(model, rec.get("proc") or None) if proc else {}
    L = 1.0 / speed if proc else L0 / speed
    out = []
    for f in PICK:
        tt = f / 12 * L if proc else f / 12 * L * speed
        pz = pose(anim, tt) if anim else {}
        for b, (r, p) in rec.get("offs", {}).items():
            r0, p0, s0 = pz.get(b, (np.zeros(3), np.zeros(3), np.ones(3)))
            pz[b] = (r0 + r, p0 + p, s0)
        if proc:
            pz = bf.proc_walk(pz, tt, 1.0 / L, LB, amp=1.0 if speed == 1.0 else 1.3)
        out.append(pz)
    return out


def main():
    slug, folder, loco, out = sys.argv[1:5]
    px = int(sys.argv[sys.argv.index("--px") + 1]) if "--px" in sys.argv else 2
    model, A, poser = bf.load(folder)
    pick, air = bf.plan(model, A, poser)
    walk = pick.get("walk")
    fly = pick.get("fly") or (walk if air else None) or walk
    loops = {"walk": [("walk", walk)], "fly": [("fly", fly)], "walk_fly": [("walk", walk), ("fly", fly)]}[loco]
    frames = []  # (loop index, is_fly, row, col, pose, hide)
    for li, (kind, (name, speed, proc, rec)) in enumerate(loops):
        rec = rec or poser.get("STAND") or poser.get("WALK") or {}
        for fi, pz in enumerate(sample(model, A, rec, name, speed, proc)):
            for r, d in enumerate(DIRS):
                frames.append((li, kind == "fly", r, li * 4 + fi, pz, set(rec.get("hide", ()))))
    cell = OUT_CELL // px                       # render cell (one art pixel = px screen pixels)
    # fit: probe at scale 1 on a big canvas, extremes over every frame, then fill 80% of the cell
    big, ps = 512, 2.0
    top = bot = side = 1e-6
    for li, isfly, r, c, pz, hide in frames:
        model.hide = hide
        a = render(model, pz, 180 + 45 * DIRS[r], big, ps, foot=0.6)[..., 3] > 0
        ys, xs = np.nonzero(a)
        if len(ys):
            top, bot = max(top, big * 0.6 - ys.min()), max(bot, ys.max() + 1 - big * 0.6)
            side = max(side, abs(xs + 0.5 - big / 2).max() + 0.5)
    lift = round(0.12 * cell)
    safe = 0.8 * cell
    scale = ps * min((safe - lift) / (top + bot), (safe / 2) / side)
    foot = (0.1 * cell + top * scale / ps + lift) / cell   # feet line (fly cells are drawn `lift` higher)
    cols = 4 * len(loops)
    sheet = Image.new("RGBA", (cols * cell, 4 * cell), (255, 0, 255, 255))
    sprites = Image.new("RGBA", (cols * cell, 4 * cell), (0, 0, 0, 0))
    d = ImageDraw.Draw(sheet)
    for li, isfly, r, c, pz, hide in frames:
        model.hide = hide
        f = foot - (lift / cell if isfly else 0)
        a = render(model, pz, 180 + 45 * DIRS[r], cell, scale, foot=f).astype(np.float32)
        lum = a[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
        a[..., :3] = np.clip((lum[..., None] + (a[..., :3] - lum[..., None]) * SAT) * DEEP, 0, 255)  # same colour push as the 3D sheets
        a = a.astype(np.uint8)
        if isfly:
            w, h, base = cell * 0.34, max(2.5, cell * 0.035), r * cell + foot * cell
            d.ellipse([c * cell + cell / 2 - w / 2, base - h, c * cell + cell / 2 + w / 2, base + h], fill=(42, 16, 58, 255))
        sprites.alpha_composite(Image.fromarray(a), (c * cell, r * cell))
    # palette: shared 24-colour palette for the whole sheet (pixel-art look), then the dark outline
    rgb = sprites.convert("RGB").quantize(24, method=Image.Quantize.MEDIANCUT).convert("RGB")
    sprites = Image.merge("RGBA", (*rgb.split(), sprites.split()[3].point(lambda v: 255 if v > 127 else 0)))
    sprites = Image.fromarray(outline(np.asarray(sprites)))
    sheet.alpha_composite(sprites)
    sheet = sheet.convert("RGB").resize((cols * cell * px, 4 * cell * px), Image.NEAREST)
    sheet.save(out)
    print(f"{slug}: {loco} {sheet.size[0]}x{sheet.size[1]} art-cell={cell}px x{px} loops={[l[1][0] for l in loops]}")


if __name__ == "__main__":
    main()
