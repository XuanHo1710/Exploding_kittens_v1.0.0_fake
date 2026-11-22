"""Build 8-direction animated sprite sheets from Bedrock-format Pokémon models (an extracted upstream jar).

Sheet layout: 8 columns (sheet direction order: down, down-right, right, up-right, up, up-left, left, down-left),
rows = for each mode in MODES order, FRAMES rows. Transparent background. A JSON manifest describes it.
usage: build3d.py <assets-root> <out-dir-for-game> <preview-dir> <id>...
"""
import sys, os, json, re, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render3d import Model, pose, render, outline, smooth
import numpy as np
from PIL import Image

ROOT, OUT, PREVIEW, *IDS = sys.argv[1:]
DEX = {"ivysaur": "0002", "charizard": "0006", "pikachu": "0025", "venomoth": "0049", "geodude": "0074", "rayquaza": "0384"}
GEO = {"pikachu": "pikachu_male"}
PREFER_AIR = {"venomoth"}          # always airborne in the source models
CELL, FRAMES, SS = 160, 12, 3
CELLS = {"charizard": 224, "rayquaza": 256}  # drawn bigger in game
MODES = ["idle", "walk", "run", "fly"]


def length(anim):
    if anim.get("animation_length"):
        return float(anim["animation_length"])
    ks = [float(k) for k in re.findall(r"anim_time\s*\*\s*90\s*\*\s*([0-9.]+)", json.dumps(anim))]
    return min(4.0, max(4.0 / k for k in ks)) if ks else 2.0


def serpent_fly(T=2.0, A=17.0, phi=30.0, lift=30.0):
    """procedural flight for long serpents (the source Rayquaza model only ships a static coiled idle): the rest pose is a
    straight horizontal body, every segment yaws on a travelling sine wave -> S-shaped undulation, arms paddle"""
    w = 360.0 / T
    chain = ["torso", "segment1", "segment"] + [f"segment{i}" for i in range(2, 15)] + ["tail1", "tail", "tail2", "tail3", "tail4"]
    bones = {}
    for i, b in enumerate(chain):
        bones[b] = {"rotation": [f"math.sin(q.anim_time*{w}-{i * phi + 90})*{A * 0.3}", f"math.sin(q.anim_time*{w}-{i * phi})*{A}", 0]}
    bones["body"] = {"position": [0, f"{lift}+math.sin(q.anim_time*{w * 2})*1.5", 0]}
    bones["neck"] = {"rotation": [-8, f"-math.sin(q.anim_time*{w}+25)*{A * 1.1}", 0]}  # keep the head looking ahead
    bones["neck2"] = {"rotation": [-6, 0, 0]}
    for side, sg in (("left", 1), ("right", -1)):
        bones[f"arm_{side}"] = {"rotation": [f"20+math.sin(q.anim_time*{w * 2})*18", 0, sg * 25]}
    return {"loop": True, "animation_length": T, "bones": bones}


for id_ in IDS:
    d = f"{DEX[id_]}_{id_}"
    m = Model(f"{ROOT}/bedrock/pokemon/models/{d}/{GEO.get(id_, id_)}.geo.json", f"{ROOT}/textures/pokemon/{d}/{id_}.png")
    A = {k.split(".")[-1]: v for k, v in json.load(open(f"{ROOT}/bedrock/pokemon/animations/{d}/{id_}.animation.json"))["animations"].items()}
    air = id_ in PREFER_AIR
    pick = {
        "idle": ("air_idle" if air else "ground_idle", 1.0),
        "walk": ("air_fly" if air else "ground_walk", 1.0),
        "run": ("air_fly" if air else ("ground_run" if "ground_run" in A else "ground_walk"), 1.0 if air or "ground_run" in A else 1.8),
        "fly": ("air_fly" if "air_fly" in A else None, 1.0),
    }
    if id_ == "rayquaza":  # static coiled idle + our procedural serpent flight for every moving mode
        A["air_fly"] = serpent_fly()
        pick = {"idle": ("ground_idle", 1.0), "walk": ("air_fly", 1.0), "run": ("air_fly", 1.8), "fly": ("air_fly", 1.0)}
    if pick["walk"][0] not in A:  # idle-only models: glide using the idle loop
        pick["walk"] = pick["run"] = ("air_idle" if "air_idle" in A else "ground_idle", 1.0)
    modes = [k for k in MODES if pick[k][0] in A]
    # sample all poses first (also used for auto-fit)
    jobs = []
    for mode in modes:
        name, speed = pick[mode]
        L = length(A[name]) / speed
        for f in range(FRAMES):
            jobs.append((mode, f, pose(A[name], f / FRAMES * L * speed), L))
    # auto-fit: probe on a big canvas, take the extreme silhouette over every frame/direction, per mode
    big, ps = 384, 4.0
    while True:  # shrink the probe scale until no silhouette touches the probe canvas border
        ext = {mode: [0, 0, 0] for mode in modes}  # top, bottom, side (probe px)
        clipped = False
        for mode, f, pz, _ in jobs:
            e = ext[mode]
            for k in range(8):
                a = render(m, pz, 180 + 45 * k, big, ps, foot=0.6)[..., 3] > 0
                ys, xs = np.nonzero(a)
                if len(ys):
                    clipped |= ys.min() == 0 or xs.min() == 0 or ys.max() == big - 1 or xs.max() == big - 1
                    e[0] = max(e[0], big * 0.6 - ys.min()); e[1] = max(e[1], ys.max() + 1 - big * 0.6)
                    e[2] = max(e[2], abs(xs + 0.5 - big / 2).max() + 0.5)
        if not clipped:
            break
        ps /= 2
    fit = lambda t, b, sd, c: ps * min(c * 0.96 / (t + b), c * 0.48 / sd)
    # on-screen size is set by the old single-sheet fit (all modes in one 128px cell) so nothing changes size in game
    T, B, SD = (max(e[i] for e in ext.values()) for i in range(3))
    unit = fit(T, B, SD, 128) / 128          # model unit -> fraction of the in-game 3D cell
    C = CELLS.get(id_, CELL)
    os.makedirs(OUT, exist_ok=True)
    PREFIX = os.environ.get("PREFIX", "")
    meta = {"unit": round(unit, 5), "frames": FRAMES, "modes": {}}
    pv_rows, walk_strip = [], None
    for mode in modes:
        t, b, sd = ext[mode]
        sc = fit(t, b, sd, C)
        foot = (C * 0.02 + t * sc / ps) / C
        sheet = Image.new("RGBA", (C * 8, C * FRAMES))
        for i, (md, f, pz, L) in enumerate(j for j in jobs if j[0] == mode):
            for k in range(8):
                alb, msk, dep = render(m, pz, 180 + 45 * k, C * SS, sc * SS, foot=foot, raw=True)
                a = smooth(alb, msk, dep, C, round_px=1.0 * SS, bulge_px=2.4 * SS)
                sheet.paste(Image.fromarray(a), (k * C, i * C))
        sheet.save(f"{OUT}/{id_}-{mode}.png", optimize=True)
        L = next(j[3] for j in jobs if j[0] == mode)
        meta["modes"][mode] = {"file": f"{id_}-{mode}.png", "cell": C, "scale": round(sc, 4), "foot": round(foot, 4), "cycle": round(L, 3)}
        pv_rows.append(sheet.crop((0, 0, C * 8, C)))
        if mode == "walk":
            walk_strip = Image.new("RGBA", (C * 8, C))
            for f in range(8):
                walk_strip.alpha_composite(sheet.crop((C, f * FRAMES // 8 * C, 2 * C, (f * FRAMES // 8 + 1) * C)), (f * C, 0))
    json.dump(meta, open(f"{OUT}/{id_}.json", "w"))
    pv = Image.new("RGBA", (C * 8, C * (len(pv_rows) + 1)), (96, 150, 72, 255))
    for r, im in enumerate(pv_rows + [walk_strip]):
        pv.alpha_composite(im, (0, r * C))
    pv.save(f"{PREVIEW}/{id_}-3d{PREFIX}-preview.png")
    print(id_, "cell", C, "unit", meta["unit"], {k: (v["scale"], v["foot"]) for k, v in meta["modes"].items()})
