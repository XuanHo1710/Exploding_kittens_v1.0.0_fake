"""Build 3D sprite sheets (same format as build3d.py) straight from the per-Pokémon Fall-back folders
(assets/pokemon/Fall-back/<Gen>/<NNN>-<Name>/{models,animations,posers,resolvers,textures}).

usage: build_fallback.py <out-dir> <preview-dir> <jobs> <slug>=<folder> ...      (or --list <file> with "slug<TAB>folder")
Sheets are written as 256-colour palette PNGs (with alpha). Modes that use the same animation share one PNG.
"""
import sys, os, json, re, glob, math, time, signal, traceback
os.environ.setdefault("OMP_NUM_THREADS", "1"); os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from render3d import Model, pose, render, smooth
import render3d


class _Env(dict):
    def __missing__(self, k):  # bare per-file variables (e.g. Frillish's `sf`, Clamperl's `speed`) are speed factors
        return 1.0


def _molang(e, t):
    if isinstance(e, (int, float)):
        return float(e)
    s = str(e).lower().strip().rstrip(";")
    s = re.sub(r"\b(query|q)\.(anim_time|life_time)\b", "__T__", s)
    s = re.sub(r"\b(query|q|variable|v|temp|t|context|c)\.\w+", "0", s)
    s = render3d.math_names(s).replace("__T__", "t")
    try:
        return float(eval(s, {"__builtins__": {}}, _Env({**render3d.ENV, "t": t})))
    except Exception:
        return 0.0


render3d.molang = _molang  # same as render3d.molang except unknown names -> 1.0 instead of failing the whole expression

CELL, FRAMES, SS = 160, 12, 3
MODES = ["idle", "walk", "run", "fly"]
REGIONAL = re.compile(r"_(alolan?|galarian?|hisuian?|paldean?|valencian?|mega|gmax|female)\b")


def length(anim):
    if anim.get("animation_length"):
        return float(anim["animation_length"])
    ks = [float(k) for k in re.findall(r"anim_time\s*\*\s*90\s*\*\s*([0-9.]+)", json.dumps(anim))]
    return min(4.0, max(4.0 / k for k in ks)) if ks else 2.0


def bare(p):  # "mons:textures/pokemon/x/y.png" -> "y.png" (any namespace)
    return os.path.basename(p.split(":")[-1])


def shiny_texture(folder):
    """the shiny texture of a species folder (the base resolver's `shiny` variation, else textures/*shiny*.png), or
    None"""
    rs = sorted(glob.glob(f"{folder}/resolvers/*.json"))
    base = [r for r in rs if os.path.basename(r).startswith("0_")] or rs
    res = json.load(open(base[0]))
    var = next((v for v in res["variations"] if v.get("aspects") == ["shiny"]), None)
    tex = (var or {}).get("texture")
    if isinstance(tex, dict):
        tex = (tex.get("frames") or [None])[0]
    if tex and os.path.isfile(f"{folder}/textures/{bare(tex)}"):
        return f"{folder}/textures/{bare(tex)}"
    pngs = sorted(glob.glob(f"{folder}/textures/*shiny*.png"), key=len)
    return pngs[0] if pngs else None


def load(folder, shiny=False):
    """(model, animations, poser) of a species folder; shiny=True paints the model with its shiny texture"""
    rs = sorted(glob.glob(f"{folder}/resolvers/*.json"))
    base = [r for r in rs if os.path.basename(r).startswith("0_")] or rs
    res = json.load(open(base[0]))
    var = next(v for v in res["variations"] if v.get("aspects") == [])
    geo = f"{folder}/models/{bare(var['model'])}.json"
    tex = var.get("texture")
    if isinstance(tex, dict):  # animated texture: first frame
        tex = (tex.get("frames") or [None])[0]
    if not tex:
        tex = next((l["texture"] for l in var.get("layers", []) if isinstance(l.get("texture"), str)), None)
    if not tex or not os.path.isfile(f"{folder}/textures/{bare(tex)}"):
        pngs = sorted(p for p in glob.glob(f"{folder}/textures/*.png") if "shiny" not in p)
        tex = pngs[0]
    tex_path = f"{folder}/textures/{bare(tex)}"
    if shiny:
        tex_path = shiny_texture(folder)
        if not tex_path:
            raise FileNotFoundError("no shiny texture")
    model = Model(geo, tex_path)
    # animations: every file, keyed by full name; the species' own file gives the short names
    full, files = {}, sorted(glob.glob(f"{folder}/animations/*.animation.json"))
    for f in files:
        try:
            full.update(json.load(open(f)).get("animations", {}))
        except Exception:
            pass
    stem = bare(var["model"]).removesuffix(".geo")
    species = res.get("species", "").split(":")[-1]
    want = [stem, re.sub(r"_(male|female)$", "", stem), species]
    own = next((f for w in want for f in files if os.path.basename(f) == f"{w}.animation.json"), None)
    order = [f for f in files if REGIONAL.search(os.path.basename(f))] + [f for f in files if not REGIONAL.search(os.path.basename(f))]
    if own:
        order = [f for f in order if f != own] + [own]
    A = {}
    for f in order:
        try:
            A.update({k.split(".")[-1]: v for k, v in json.load(open(f)).get("animations", {}).items()})
        except Exception:
            pass
    # poser (JSON posers only; Kotlin posers are not in the data) -> {"STAND"|"WALK"|"RUN"|"HOVER"|"FLY": pose record}
    poser = {}
    pp = var.get("poser", "").split(":")[-1]
    pf = f"{folder}/posers/{pp}.json" if pp else None
    if not (pf and os.path.isfile(pf)):
        pf = next(iter(sorted(glob.glob(f"{folder}/posers/*.json"))), None)
    if pf and os.path.isfile(pf):
        try:
            pj = json.load(open(pf))
            glob_tp = pj.get("transformedParts", []) if isinstance(pj.get("transformedParts"), list) else []
            pos_tok = lambda c, tok: re.search(r"(?<![!\w.])" + re.escape(tok) + r"\b", c) is not None  # un-negated
            for pname, pose_ in pj.get("poses", {}).items():
                if not isinstance(pose_, dict) or pose_.get("isBattle") or pose_.get("isTouchingWater") or pose_.get("isUnderWater"):
                    continue
                cond = str(pose_.get("condition", "")).replace(" ", "")
                cond = cond.split("?")[1] if "?" in cond else cond  # "q.has_entity ? X : Y" -> X
                if pos_tok(cond, "q.is_ridden") or pos_tok(cond, "q.in_air") or re.search("ride|mount|sleep|shoulder", pname, re.I):
                    continue
                anims = [m.group(2) for a in pose_.get("animations", []) if isinstance(a, str)
                         for m in [re.search(r"bedrock\(\s*'([^']+)'\s*,\s*'([^']+)'", a)] if m]
                anims = [a for a in anims if a in A]
                proc = {}
                for a in pose_.get("animations", []):
                    m = re.search(r"q\.(biped_walk|quadruped_walk|bimanual_swing)\(([^)]*)\)", str(a))
                    if m:
                        args = [x.strip().strip("'\"") for x in m.group(2).split(",")]
                        try:
                            amp = float(args[1])
                        except Exception:
                            amp = 1.0
                        proc[m.group(1)] = (amp, args[2:])
                hide, offs = set(), {}
                for t in glob_tp + list(pose_.get("transformedParts", []) or []):
                    if not isinstance(t, dict) or t.get("part") not in model.bones:
                        continue
                    if t.get("isVisible") is False:
                        hide.add(t["part"])
                    elif t.get("isVisible") is True:
                        hide.discard(t["part"])
                    if "position" in t or "rotation" in t:
                        offs[t["part"]] = (np.array(t.get("rotation", [0, 0, 0]), float), np.array(t.get("position", [0, 0, 0]), float))
                rec = {"name": pname, "anim": anims[0] if anims else None, "proc": proc, "hide": hide, "offs": offs}
                sprint = pos_tok(cond, "q.is_sprinting")
                for t in pose_.get("poseTypes", []):
                    t = "RUN" if t == "WALK" and sprint else t
                    if t == "STAND" and sprint:
                        continue
                    if t in ("STAND", "WALK", "RUN", "HOVER", "FLY") and (rec["anim"] or rec["proc"]):
                        poser.setdefault(t, rec)
        except Exception as e:
            print("poser parse error", folder, e, file=sys.stderr)
    return model, A, poser


# ---------------------------------------------------------------- procedural walk for idle-only models
LR = re.compile(r"(^|_)(left|right|l|r)(_|$|\d)")


def limbs(model, spec=None):
    """top-most leg/arm bones: {'qfl','qfr','qbl','qbr'} for quadrupeds, {'bl','br'} legs + {'al','ar'} arms
    (+ 'amp' factor); uses the poser's q.biped_walk / q.quadruped_walk / q.bimanual_swing bone names when valid"""
    if spec:
        out, ok = {}, lambda bs: bs and all(b in model.bones for b in bs)
        if "quadruped_walk" in spec and ok(spec["quadruped_walk"][1][:4]):
            out.update(zip(("qfl", "qfr", "qbl", "qbr"), spec["quadruped_walk"][1][:4])); out["amp"] = spec["quadruped_walk"][0]
        elif "biped_walk" in spec and ok(spec["biped_walk"][1][:2]):
            out.update(zip(("bl", "br"), spec["biped_walk"][1][:2])); out["amp"] = spec["biped_walk"][0]
        if "bimanual_swing" in spec and ok(spec["bimanual_swing"][1][:2]):
            out.update(zip(("al", "ar"), spec["bimanual_swing"][1][:2]))
        if any(k in out for k in ("qfl", "bl")):
            return out
        auto = limbs(model)
        return {**auto, **{k: v for k, v in out.items() if k in ("al", "ar")}} if auto else out
    def depth(n):
        d = 0
        while n in model.bones and model.bones[n].get("parent"):
            n = model.bones[n]["parent"]; d += 1
        return d

    def side(n):
        m = LR.search(n)
        return None if not m else ("l" if m.group(2) in ("left", "l") else "r")

    names = [n for n in model.order if not n.startswith("locator")]
    def anc_has(n, key):  # an ancestor already matched the same limb
        p = model.bones[n].get("parent")
        while p in model.bones:
            if key(p):
                return True
            p = model.bones[p].get("parent")
        return False

    out = {}
    def pick(tag, key):
        c = [n for n in names if key(n) and not anc_has(n, key)]
        if c:
            out[tag] = min(c, key=depth)

    leg = lambda n: re.search(r"leg|thigh|foot|feet", n.lower()) is not None
    for fb in ("front", "back"):
        for s in ("l", "r"):
            pick(f"q{fb[0]}{s}", lambda n, fb=fb, s=s: leg(n) and fb in n.lower() and side(n.lower()) == s)
    if len([k for k in out if k.startswith("q")]) < 4:
        out = {}
        for s in ("l", "r"):
            pick(f"b{s}", lambda n, s=s: re.search(r"leg|thigh", n.lower()) and side(n.lower()) == s)
        if not ("bl" in out and "br" in out):
            for s in ("l", "r"):
                pick(f"b{s}", lambda n, s=s: re.search(r"foot|feet", n.lower()) and side(n.lower()) == s)
        if not ("bl" in out and "br" in out):
            out = {}
        for s in ("l", "r"):
            pick(f"a{s}", lambda n, s=s: re.search(r"arm", n.lower()) and "fore" not in n.lower() and side(n.lower()) == s)
    return out


def proc_walk(pz, t, freq, L, amp=1.0):
    """add a sine leg/arm swing (the upstream Quadruped/BipedWalkAnimation style) on top of a sampled idle pose"""
    ph = 2 * math.pi * freq * t
    add = {}
    amp *= min(1.4, max(0.6, L.get("amp", 1.0) / 0.9))  # poser amplitude (upstream default 1.4 rad x limb swing)
    if "qfl" in L:
        a = 24 * amp
        add = {L["qfl"]: a * math.sin(ph), L["qbr"]: a * math.sin(ph), L["qfr"]: -a * math.sin(ph), L["qbl"]: -a * math.sin(ph)}
    else:
        if "bl" in L:
            add[L["bl"]] = 28 * amp * math.sin(ph); add[L["br"]] = -28 * amp * math.sin(ph)
        if "al" in L and "ar" in L:
            add[L["al"]] = -18 * amp * math.sin(ph); add[L["ar"]] = 18 * amp * math.sin(ph)
    out = dict(pz)
    for b, x in add.items():
        r, p, s = out.get(b, (np.zeros(3), np.zeros(3), np.ones(3)))
        out[b] = (r + np.array([x, 0, 0]), p, s)
    return out


def plan(model, A, poser):
    """mode -> (anim name or None, speed, procedural-walk?, pose record or None); also returns air flag"""
    has = lambda k: k in A
    an = lambda t: poser[t]["anim"] if t in poser else None
    rec = lambda t: poser.get(t)
    real = lambda k: has(k) and "placeholder" not in k.lower()
    idle = an("STAND") or next((k for k in ("ground_idle", "idle", "air_idle", "water_idle", "battle_idle") if real(k)), None)
    if idle is None:
        idle = next((k for k in sorted(A) if "idle" in k and "placeholder" not in k.lower()), None)
    walk = an("WALK") or ("ground_walk" if real("ground_walk") else None)
    fly = an("FLY") or ("air_fly" if real("air_fly") else None)
    hover = an("HOVER") or ("air_idle" if real("air_idle") else None)
    if poser:
        air = "STAND" not in poser and ("HOVER" in poser or "FLY" in poser) or (idle or "").startswith("air_")
    else:
        air = (idle or "").startswith("air_") or (not walk and fly is not None and not real("ground_idle"))
    if not walk and not real("ground_idle") and real("water_swim") and not fly:  # fish
        walk = "water_swim"
        if real("water_idle"):
            idle = "water_idle"
    if air:
        mv = fly or walk or ("air_walk" if real("air_walk") else None) or hover or idle  # last resort: glide
        i = (hover, 1.0, False, rec("HOVER")) if hover else (idle, 1.0, False, rec("STAND"))
        m = (mv, 1.0, False, rec("FLY") if fly else rec("WALK"))
        return {"idle": i, "walk": m, "run": m, "fly": m if fly else None}, True
    pick = {"idle": (idle, 1.0, False, rec("STAND"))}
    wrec = rec("WALK")
    proc = (wrec or {}).get("proc") or None
    if walk and walk != idle and not (proc and walk.endswith("idle")):
        pick["walk"] = (walk, 1.0, False, wrec)
    else:
        walk = walk or idle
        L = limbs(model, proc)
        if L and any(k in L for k in ("qfl", "bl")):  # idle + procedural leg swing
            pick["walk"] = (walk, 1.0, True, wrec)
        else:  # limbless / unknown rig: glide with the idle loop
            pick["walk"] = (walk, 1.0, False, wrec)
            if real("summary_idle"):  # long snakes lie straight in ground_idle; the coiled summary pose reads better
                pick["idle"] = ("summary_idle", 1.0, False, rec("STAND"))
    if an("RUN") and an("RUN") != pick["walk"][0]:
        pick["run"] = (an("RUN"), 1.0, False, rec("RUN"))
    elif real("ground_run"):
        pick["run"] = ("ground_run", 1.0, False, wrec)
    else:
        w = pick["walk"]
        pick["run"] = (w[0], 1.8, w[2], w[3]) if (w[0] != idle or w[2]) else w
    if fly:
        pick["fly"] = (fly, 1.0, False, rec("FLY"))
    return pick, False


def save_png(im, path):
    q = im.quantize(256, method=Image.Quantize.FASTOCTREE)
    q.save(path, optimize=True)


def build(slug, folder, OUT, PREVIEW):
    t0 = time.time()
    model, A, poser = load(folder)
    pick, air = plan(model, A, poser)
    if pick is None:
        pick, air = plan(model, A, {}) if poser else (None, air)
    if pick is None:
        raise RuntimeError("no usable animation")
    # unique animation keys (modes using the same anim + speed + pose share samples and the PNG)
    keys, recs = {}, {}
    for mode in MODES:
        if pick.get(mode) and (pick[mode][0] is not None or mode == "idle"):
            name, speed, proc, rec = pick[mode]
            rec = rec or poser.get("STAND") or poser.get("WALK") or {}
            k = (name, speed, proc, rec.get("name"))
            recs[k] = rec
            keys.setdefault(k, []).append(mode)
    samples = {}
    for key in keys:
        name, speed, proc, _ = key
        rec = recs[key]
        LB = limbs(model, rec.get("proc") or None) if proc else {}
        anim = A.get(name) if name else None
        L0 = length(anim) if anim else 2.0
        if proc:  # one leg cycle per sheet loop (idle overlay plays at real time; its loop seam is subtle)
            L = 1.0 / speed
            freq = 1.0 / L
        else:
            L = L0 / speed
        fr = []
        for f in range(FRAMES):
            tt = f / FRAMES * L if proc else f / FRAMES * L * speed
            pz = pose(anim, tt) if anim else {}
            for b, (r, p) in rec.get("offs", {}).items():  # poser transformedParts offsets
                r0, p0, s0 = pz.get(b, (np.zeros(3), np.zeros(3), np.ones(3)))
                pz[b] = (r0 + r, p0 + p, s0)
            if proc:
                pz = proc_walk(pz, tt, freq, LB, amp=1.0 if speed == 1.0 else 1.3)
            fr.append(pz)
        samples[key] = (fr, L)
    # auto-fit probe (as build3d.py): extreme silhouette over every frame/direction, per key
    big, ps = 384, 4.0
    while True:
        ext = {k: [0, 0, 0] for k in samples}
        clipped = False
        for k, (fr, _) in samples.items():
            e = ext[k]
            model.hide = set(recs[k].get("hide", ()))
            for pz in fr:
                for d in range(8):
                    a = render(model, pz, 180 + 45 * d, big, ps, foot=0.6)[..., 3] > 0
                    ys, xs = np.nonzero(a)
                    if len(ys):
                        clipped |= ys.min() == 0 or xs.min() == 0 or ys.max() == big - 1 or xs.max() == big - 1
                        e[0] = max(e[0], big * 0.6 - ys.min()); e[1] = max(e[1], ys.max() + 1 - big * 0.6)
                        e[2] = max(e[2], abs(xs + 0.5 - big / 2).max() + 0.5)
        if not clipped or ps < 1e-3:
            break
        ps /= 2
    if max(max(e) for e in ext.values()) <= 0:
        raise RuntimeError("blank render")
    fit = lambda t, b, sd, c: ps * min(c * 0.96 / max(t + b, 1e-6), c * 0.48 / max(sd, 1e-6))
    T, B, SD = (max(e[i] for e in ext.values()) for i in range(3))
    unit = fit(T, B, SD, 128) / 128
    C = CELL
    meta = {"unit": round(unit, 5), "frames": FRAMES, "modes": {}, "src": "fallback-v4"}
    if air:
        meta["air"] = True
    pv_rows, walk_strip = [], None
    for key, modes in keys.items():
        fr, L = samples[key]
        t, b, sd = ext[key]
        sc = fit(t, b, sd, C) * float(os.environ.get("FITPAD", "1"))  # FITPAD<1: extra margin (thin parts the probe misses)
        foot = (C * 0.02 + t * sc / ps) / C
        sheet = Image.new("RGBA", (C * 8, C * FRAMES))
        model.hide = set(recs[key].get("hide", ()))
        for i, pz in enumerate(fr):
            for d in range(8):
                alb, msk, dep = render(model, pz, 180 + 45 * d, C * SS, sc * SS, foot=foot, raw=True)
                sheet.paste(Image.fromarray(smooth(alb, msk, dep, C, round_px=1.0 * SS, bulge_px=2.4 * SS)), (d * C, i * C))
        fname = f"{slug}-{modes[0]}.png"
        save_png(sheet, f"{OUT}/{fname}")
        for mode in modes:
            meta["modes"][mode] = {"file": fname, "cell": C, "scale": round(sc, 4), "foot": round(foot, 4), "cycle": round(L, 3)}
        pv_rows.append(sheet.crop((0, 0, C * 8, C)))
        if "walk" in modes:
            walk_strip = Image.new("RGBA", (C * 8, C))
            for f in range(8):
                walk_strip.alpha_composite(sheet.crop((C, f * FRAMES // 8 * C, 2 * C, (f * FRAMES // 8 + 1) * C)), (f * C, 0))
    meta["modes"] = {m: meta["modes"][m] for m in MODES if m in meta["modes"]}
    if PREVIEW:
        rows = pv_rows + ([walk_strip] if walk_strip else [])
        pv = Image.new("RGBA", (C * 8, C * len(rows)), (96, 150, 72, 255))
        for r, im in enumerate(rows):
            pv.alpha_composite(im, (0, r * C))
        save_png(pv, f"{PREVIEW}/{slug}-3d-v3-preview.png")
    json.dump(meta, open(f"{OUT}/{slug}.json.tmp", "w"))
    os.replace(f"{OUT}/{slug}.json.tmp", f"{OUT}/{slug}.json")  # json last: the UI treats it as "done"
    desc = {m: (pick[m][0], pick[m][1], "proc" if pick[m][2] else "", (pick[m][3] or {}).get("name")) for m in meta["modes"]}
    return f"{slug} ok {time.time() - t0:.0f}s air={air} {desc}"


def _alarm(*_):
    raise TimeoutError("timeout")


def work(args):
    slug, folder, OUT, PREVIEW = args
    try:
        if slug not in os.environ.get("FORCE", "").split(",") and json.load(open(f"{OUT}/{slug}.json")).get("src") == "fallback-v4":
            return f"{slug} skip (exists)"
    except Exception:
        pass
    signal.signal(signal.SIGALRM, _alarm); signal.alarm(1200)
    try:
        return build(slug, folder, OUT, PREVIEW)
    except Exception as e:
        return f"{slug} FAIL {type(e).__name__}: {e} | {traceback.format_exc().splitlines()[-3].strip()}"
    finally:
        signal.alarm(0)


if __name__ == "__main__":
    OUT, PREVIEW, J, *rest = sys.argv[1:]
    if rest[0] == "--list":
        items = [l.rstrip("\n").split("\t") for l in open(rest[1]) if l.strip()]
    else:
        items = [a.split("=", 1) for a in rest]
    os.makedirs(OUT, exist_ok=True)
    jobs = [(s, f, OUT, (PREVIEW if "/Gen1-Kanto/" in f else os.path.join(PREVIEW, "3d-previews"))) for s, f in items]
    for j in jobs:
        os.makedirs(j[3], exist_ok=True)
    import shutil, multiprocessing as mp
    with mp.Pool(int(J), maxtasksperchild=4) as pool:
        for msg in pool.imap_unordered(work, jobs):
            print(time.strftime("%H:%M:%S"), msg, flush=True)
            if shutil.disk_usage("/").free < 3e9:
                print("DISK LOW (<3 GB free) - stopping", flush=True)
                pool.terminate(); break
