"""Animated check of a finished v3 movement sheet against the 3D model it copied: one WebP per loop,
top row = the 2D sheet (down, left, right, up), bottom row = the 3D sheet at the same moments, played at the loop's
own rhythm (the `mons-loops` cycle).

usage: python tools/agy/compare_v3.py <movement.png> <3d slug, e.g. charizard> [--sheets <3d dir>] [--out-prefix tmp/<name>-2d-vs-3d]
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
try:
    import PIL  # noqa: F401
except ImportError:  # agy's Python: use the Pillow build shipped with the sprite skill
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "../pokemon/.pydeps"))

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "../.."))
sheet, slug = sys.argv[1:3]
arg = lambda k, d: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
sheets = arg("--sheets", os.path.join(REPO, "pokemon3d"))
name = os.path.basename(sheet).replace("-movement.png", "")
prefix = arg("--out-prefix", os.path.join(REPO, "tmp", f"{name}-2d-vs-3d"))
src = Image.open(sheet)
loops = json.loads(src.text["mons-loops"])
arr = np.asarray(src.convert("RGBA")).copy()
bg = ((arr[..., 0].astype(int) - arr[..., 1]) > 80) & ((arr[..., 2].astype(int) - arr[..., 1]) > 80)
arr[bg, 3] = 0
a2 = Image.fromarray(arr)
meta = json.load(open(os.path.join(sheets, f"{slug}.json")))
T, x0 = 140, 0
for L in loops:
    mode, n = L["mode"], L["frames"]
    md = meta["modes"].get(mode) or meta["modes"]["walk"]
    i3 = Image.open(os.path.join(sheets, md["file"])).convert("RGBA"); c3 = md["cell"]; F3 = meta["frames"]
    frames = []
    for t in range(2 * n):
        f2 = t % n; f3 = round(f2 * F3 / n) % F3
        fr = Image.new("RGB", (4 * T, 2 * T + 24), (96, 150, 72)); d = ImageDraw.Draw(fr)
        d.text((4, 2), f"2D - {mode} ({n} frames, {L['cycle']}s)", fill=(255, 255, 255))
        d.text((4, T + 14), f"3D {slug}", fill=(255, 255, 255))
        for r, c in enumerate([0, 6, 2, 4]):
            p = a2.crop(((x0 + f2) * 192, r * 192, (x0 + f2 + 1) * 192, (r + 1) * 192)).resize((T, T), Image.NEAREST)
            fr.paste(p, (r * T, 12), p)
            q = i3.crop((c * c3, f3 * c3, (c + 1) * c3, (f3 + 1) * c3)).resize((T, T), Image.LANCZOS)
            fr.paste(q, (r * T, T + 24), q)
        frames.append(fr)
    out = f"{prefix}-{mode}.webp"
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=int(L["cycle"] / n * 1000), loop=0, lossless=True)
    print(out)
    x0 += n
