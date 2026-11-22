"""Shiny sprites by recolour (user, 2026-11-20): the same drawings in the shiny colours, no redraw.

For a 2D species folder `assets/pokemon/<GenX-Region>/<NNN>-<Name>/` it writes, next to the originals:

  <slug>-movement-shiny.png   the movement sheet recoloured (magenta key and layout untouched)
  <slug>-battle-shiny.png     the battle sheet recoloured, when the species has one
  <slug>-shiny.json           the colour map: the sheet palette (quantised representatives), their groups, the
                              computed shiny colour of each representative, and the hand overrides

A Fall-back folder (`--fallback-3d`, a rendered species whose model has no shiny texture) gets
`<slug>-front-shiny.png`, `<slug>-back-shiny.png`, `<slug>-icon-shiny.png` the same way (alpha key); species with a
shiny texture are rendered by `tools/model3d/battle_sprites.py --shiny` instead.

How the colours are found:
  1. the reference site's normal and shiny renders of the species (same pose, pixel for pixel) are fetched once into
     $MONS_SHINY_REFS (default /tmp/mons-refs/shiny, never into assets/); every opaque pixel gives a (normal colour,
     shiny colour) pair;
  2. the sheet's colours are quantised to ~48 representatives (key excluded) and grouped into colour families (hue +
     chroma, lightness weighted low, so a shade ramp stays one group);
  3. each representative's transform (shiny hue, chroma ratio, lightness shift; additive a/b for greys) comes from the
     reference pairs near it (kernel-weighted, the most common change wins), blended with its group's when it has few;
  4. every sheet colour is moved by its representative's transform in CIE LCh, so the shading survives; then the
     changed colours get a chroma boost when the result is duller than the reference shiny (`saturation`).

Hand overrides in `<slug>-shiny.json` (re-running keeps them):
  "map": {"#rrggbb": "#rrggbb"}   keys are representatives from "palette"; every pixel nearest one takes that Lab shift
  "auto": false                   only the overrides (other colours unchanged)
  "saturation": 1.2               the chroma factor of the changed colours (default: "auto", matched to the reference)
  "lightness": 4                  the L* added to the changed colours (default: "auto", matched to the reference)
  "keep": [{"preset": "flame"}]   pixels that keep their normal colour: those matching "grow" within "radius" px of a
                                  pixel matching "seed" (LCh tests: min_L / max_L / min_C / hue [lo, hi] degrees);
                                  presets: "flame" (a tail / body flame that stays fire-coloured)

  python3 -I tools/units/shiny_recolor.py Charmander Charmeleon Charizard
  python3 -I tools/units/shiny_recolor.py --all --jobs 8 --report tmp/report/shiny
  python3 -I tools/units/shiny_recolor.py 006 --compare tmp/report/shiny/pilot.png
"""
import argparse
import glob
import json
import math
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
PYDEPS = os.path.join(HERE, ".pydeps")
if os.path.isdir(PYDEPS) and PYDEPS not in sys.path:
    sys.path.insert(0, PYDEPS)
from PIL import Image  # noqa: E402

REFS = os.environ.get("MONS_SHINY_REFS", os.path.join(REPO, "tmp", "mons-refs", "shiny"))
REF_URL = os.environ.get("MONS_SHINY_REF_URL", "https://img.pokemondb.net/sprites/home/{kind}/{slug}.png")
REPS = 48            # sheet palette representatives
L_W = 0.4            # lightness weight in colour distances (a shade ramp is one family)
GROUP_DIST = 9.0    # single-link distance that joins two representatives into one group
MATCH_DIST = 28.0    # a reference pixel farther than this from every representative is ignored
PRIOR = 8            # kernel weight a representative needs before its own transform outweighs its group's
HUE_KEEP = 0.3       # share of a colour's hue offset from its reference family that the shiny colour keeps
SIGMA = 10.0         # kernel width (Lab units) of the reference colours that steer a representative
SAT_MIN = 1.1        # the smallest automatic chroma boost (a recolour reads duller than the shiny artwork)
SAT_MAX = 1.35       # the largest automatic chroma boost
L_MAX = 8.0          # the largest automatic lightness correction
PRESETS = {"flame": {"seed": {"min_L": 68, "min_C": 68, "hue": [66, 92]},       # the flame's bright yellow core
                     "grow": {"min_C": 45, "hue": [-10, 92]}, "radius": 10}}


def pixels(im):
    """the pixel values (Pillow 13 renamed getdata)"""
    return getattr(im, "get_flattened_data", im.getdata)()


def is_key(c):
    """the magenta key of a 2D sheet, or a transparent pixel of an RGBA sprite"""
    return (len(c) == 4 and c[3] == 0) or (c[0] > 240 and c[2] > 240 and c[1] < 16)


# ---------------------------------------------------------------- colour space (sRGB <-> CIE Lab, D65)
def _lin(v):
    v /= 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def _gam(v):
    v = 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
    return max(0, min(255, round(v * 255)))


def _f(t):
    return t ** (1 / 3) if t > 216 / 24389 else (24389 / 27 * t + 16) / 116


def _fi(t):
    return t ** 3 if t ** 3 > 216 / 24389 else (116 * t - 16) / (24389 / 27)


def lab(c):
    r, g, b = _lin(c[0]), _lin(c[1]), _lin(c[2])
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    fx, fy, fz = _f(x), _f(y), _f(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def rgb(L, a, b):
    fy = (L + 16) / 116
    x, y, z = _fi(fy + a / 500) * 0.95047, _fi(fy), _fi(fy - b / 200) * 1.08883
    r = 3.2406 * x - 1.5372 * y - 0.4986 * z
    g = -0.9689 * x + 1.8758 * y + 0.0415 * z
    bl = 0.0557 * x - 0.2040 * y + 1.0570 * z
    return (_gam(max(0.0, r)), _gam(max(0.0, g)), _gam(max(0.0, bl)))


def dist(p, q):
    return math.sqrt((L_W * (p[0] - q[0])) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2)


def hexc(c):
    return "#%02x%02x%02x" % tuple(c[:3])


def unhex(s):
    s = s.lstrip("#")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


# ---------------------------------------------------------------- species + references
def folder_of(name):
    """the 2D species folder for a dex number or a name"""
    want = name.lower().lstrip("0")
    for d in sorted(glob.glob(os.path.join(REPO, "assets", "units", "Gen*", "*", ""))):
        base = os.path.basename(d.rstrip("/"))
        if "-" not in base or not glob.glob(os.path.join(glob.escape(d), "*-movement.png")):
            continue
        num, nm = base.split("-", 1)
        if num.lstrip("0") == want or nm.lower() == want:
            return d.rstrip("/")
    raise SystemExit(f"no 2D species folder for {name!r}")


def slug_of(folder):
    p = glob.glob(os.path.join(glob.escape(folder), "*-movement.png"))[0]
    return os.path.basename(p)[: -len("-movement.png")]


def reference(slug, kind, site_slug=None):
    """the reference site's normal / shiny render (256 px, RGBA), fetched once into REFS"""
    os.makedirs(REFS, exist_ok=True)
    path = os.path.join(REFS, f"{slug}-home-{kind}.png")
    if not os.path.isfile(path) or not os.path.getsize(path):
        url = REF_URL.format(kind=kind, slug=site_slug or slug)
        req = urllib.request.Request(url, headers={"User-Agent": "mons-tools"})
        with urllib.request.urlopen(req, timeout=30) as r, open(path + ".part", "wb") as fh:
            fh.write(r.read())
        os.replace(path + ".part", path)
    im = Image.open(path)
    im.load()
    return im.convert("RGBA")


def ref_pairs(slug, site_slug=None):
    """[(normal Lab, shiny Lab)] of the pixels opaque in both renders (colours deduplicated with counts)"""
    n, s = reference(slug, "normal", site_slug), reference(slug, "shiny", site_slug)
    if n.size != s.size:
        s = s.resize(n.size, Image.NEAREST)
    count = {}
    for p, q in zip(pixels(n), pixels(s)):
        if p[3] > 200 and q[3] > 200:
            k = (p[:3], q[:3])
            count[k] = count.get(k, 0) + 1
    return [(lab(p), lab(q), w) for (p, q), w in count.items()]


# ---------------------------------------------------------------- palette, groups, transforms
def palette(sheets):
    """REPS representative colours of the sheets' drawn pixels (magenta key left out)"""
    hist = {}
    for im in sheets:
        for w, c in im.getcolors(1 << 24):
            if not is_key(c):
                hist[c] = hist.get(c, 0) + w
    # weight by area: repeat each colour roughly by its count (capped) so big regions get more representatives
    tot = sum(hist.values())
    data = []
    for c, w in hist.items():
        data += [c[:3]] * max(1, round(w * 200000 / tot))
    big = Image.new("RGB", (len(data), 1))
    big.putdata(data)
    q = big.quantize(REPS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = q.getpalette()[: 3 * REPS]
    used = sorted(set(pixels(q)))
    return [tuple(pal[3 * i: 3 * i + 3]) for i in used], hist


def groups(reps_lab):
    """single-link families of representatives -> group index per representative"""
    n = len(reps_lab)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for i in range(n):
        for j in range(i + 1, n):
            if dist(reps_lab[i], reps_lab[j]) < GROUP_DIST:
                parent[find(i)] = find(j)
    roots = {}
    return [roots.setdefault(find(i), len(roots)) for i in range(n)]


def stats(pairs):
    """weighted sums of a set of (normal, shiny, w) pairs"""
    W = sum(w for _, _, w in pairs)
    if not W:
        return None
    mn = [sum(p[i] * w for p, _, w in pairs) / W for i in range(3)]
    ms = [sum(q[i] * w for _, q, w in pairs) / W for i in range(3)]
    return {"w": W, "n": mn, "s": ms}


def dominant(pairs, step=10.0):
    """the pairs whose change (shiny - normal, Lab) is in the most common bin (+ its neighbours): a colour that
    becomes two different shiny colours in two places (body vs flame) follows the bigger one instead of their mix"""
    if not pairs:
        return pairs
    key = lambda p, q: tuple(round((q[k] - p[k]) / step) for k in range(3))  # noqa: E731
    hist = {}
    for p, q, w in pairs:
        k = key(p, q)
        hist[k] = hist.get(k, 0) + w
    near = lambda k, j: all(abs(k[i] - j[i]) <= 1 for i in range(3))  # noqa: E731
    best = max(hist, key=lambda k: sum(v for j, v in hist.items() if near(k, j)))
    return [(p, q, w) for p, q, w in pairs if near(key(p, q), best)]


def blend(a, b, t):
    """mix two stats dicts (t = weight of a)"""
    if a is None:
        return b
    if b is None:
        return a
    return {"w": a["w"], "n": [a["n"][i] * t + b["n"][i] * (1 - t) for i in range(3)],
            "s": [a["s"][i] * t + b["s"][i] * (1 - t) for i in range(3)]}


def apply(tf, c_lab):
    """move one Lab colour by a transform: lightness shift, and hue rotation + chroma ratio for coloured families
    (additive a / b for greys)"""
    if tf is None:
        return c_lab
    (Ln, an, bn), (Ls, as_, bs) = tf["n"], tf["s"]
    L = max(0.0, min(100.0, c_lab[0] + (Ls - Ln)))
    Cn, Cs = math.hypot(an, bn), math.hypot(as_, bs)
    if Cn < 10:
        return (L, c_lab[1] + as_ - an, c_lab[2] + bs - bn)
    hn, hs = math.atan2(bn, an), math.atan2(bs, as_)
    off = (math.atan2(c_lab[2], c_lab[1]) - hn + math.pi) % (2 * math.pi) - math.pi
    dh = abs((hs - hn + math.pi) % (2 * math.pi) - math.pi)
    keep = 1 - (1 - HUE_KEEP) * min(1.0, dh / math.radians(30))   # unchanged families keep the drawing's hues
    h = hs + keep * off                             # the shiny hue, the drawing's own hue offset damped
    C = Cs * max(0.5, min(1.5, math.hypot(c_lab[1], c_lab[2]) / Cn))
    return (L, C * math.cos(h), C * math.sin(h))


def compute(sheets, slug, site_slug=None):
    reps, _ = palette(sheets)
    reps_lab = [lab(c) for c in reps]
    grp = groups(reps_lab)
    pairs = ref_pairs(slug, site_slug)
    own, near = [[] for _ in reps], [0] * len(reps)
    for p, q, w in pairs:
        ds = [dist(p, r) for r in reps_lab]
        best = min(range(len(reps)), key=ds.__getitem__)
        if ds[best] < MATCH_DIST:
            near[best] += w
        for i, d in enumerate(ds):                  # kernel: every reference colour near a representative counts
            if d < 3 * SIGMA:
                own[i].append((p, q, w * math.exp(-(d / SIGMA) ** 2)))
    gst = [stats(dominant([x for i in range(len(reps)) if grp[i] == g for x in own[i]])) for g in range(max(grp) + 1)]
    tfs = []
    for i in range(len(reps)):
        st = stats(dominant(own[i]))
        w = st["w"] if st else 0
        tfs.append(blend(st, gst[grp[i]], w / (w + PRIOR)))
    return reps, grp, tfs, near


# ---------------------------------------------------------------- writing
def lch(c_lab):
    return c_lab[0], math.hypot(c_lab[1], c_lab[2]), math.degrees(math.atan2(c_lab[2], c_lab[1]))


def match(test, c_lab):
    """an LCh test of a keep rule (hue range may start below 0)"""
    L, C, h = lch(c_lab)
    lo, hi = test.get("hue", [-180, 360])
    return (L >= test.get("min_L", 0) and L <= test.get("max_L", 100) and C >= test.get("min_C", 0)
            and (lo <= h <= hi or lo <= h + 360 <= hi or lo <= h - 360 <= hi))


def keep_mask(im, rules, labs):
    """L mask (255 = keep the normal colour) of the "keep" rules"""
    out = Image.new("L", im.size, 0)
    for rule in rules:
        r = dict(PRESETS.get(rule.get("preset"), {}), **{k: v for k, v in rule.items() if k != "preset"})
        seeds = r["seed"] if isinstance(r["seed"], list) else [r["seed"]]
        seed_set = {c for c, cl in labs.items() if any(match(t, cl) for t in seeds)}
        grow_set = {c for c, cl in labs.items() if match(r["grow"], cl)}
        seed = Image.new("L", im.size)
        seed.putdata([255 if c in seed_set else 0 for c in pixels(im)])
        k = 4                                        # dilate on a 1/4 grid (MaxFilter is slow at full size)
        small = seed.resize((max(1, im.width // k), max(1, im.height // k)), Image.BOX).point(lambda v: 255 if v else 0)
        size = 2 * max(1, round(r.get("radius", 10) / k)) + 1
        from PIL import ImageFilter
        near = small.filter(ImageFilter.MaxFilter(size)).resize(im.size, Image.NEAREST)
        grow = Image.new("L", im.size)
        grow.putdata([255 if c in grow_set else 0 for c in pixels(im)])
        out.paste(255, mask=Image.composite(grow, Image.new("L", im.size, 0), near))
    return out


def mean_lab(hist, labs):
    """area-weighted mean Lab and mean chroma of {colour: count}"""
    W = sum(hist.values()) or 1
    m = [sum(labs[c][k] * w for c, w in hist.items()) / W for k in range(3)]
    return m, sum(math.hypot(labs[c][1], labs[c][2]) * w for c, w in hist.items()) / W


def ref_hist(slug, kind, site_slug=None):
    im = reference(slug, kind, site_slug)
    h = {}
    for c in pixels(im):
        if c[3] > 200:
            h[c[:3]] = h.get(c[:3], 0) + 1
    return h


def de(a, b):
    return math.sqrt(sum((a[k] - b[k]) ** 2 for k in range(3)))


def sources(folder):
    """(slug, [source PNGs]) of a 2D species folder or a rendered Fall-back folder"""
    rj = glob.glob(os.path.join(glob.escape(folder), "*-render.json"))
    if rj and os.sep + "Fall-back" + os.sep in folder:
        slug = os.path.basename(rj[0])[: -len("-render.json")]
        return slug, [os.path.join(folder, f"{slug}-{k}.png") for k in ("front", "back", "icon")]
    slug = slug_of(folder)
    srcs = [os.path.join(folder, f"{slug}-{k}.png") for k in ("movement", "battle")]
    return slug, [p for p in srcs if os.path.isfile(p)]


def do_folder(folder, site_slug=None):
    """recolour one species folder; returns (folder, slug, written, review dict)"""
    slug, srcs = sources(folder)
    rgba = srcs[0].endswith(("-front.png", "-back.png", "-icon.png"))
    sheets = [Image.open(p).convert("RGBA" if rgba else "RGB") for p in srcs]
    jpath = os.path.join(folder, f"{slug}-shiny.json")
    old = json.load(open(jpath, encoding="utf-8")) if os.path.isfile(jpath) else {}
    site = site_slug or old.get("reference_slug") or slug
    overrides = {k.lower(): v.lower() for k, v in (old.get("map") or {}).items()}
    auto = old.get("auto", True)
    reps, grp, tfs, nref = compute(sheets, slug, site)
    reps_lab = [lab(c) for c in reps]
    shiny = [rgb(*apply(tf, reps_lab[i])) for i, tf in enumerate(tfs)]
    shifts = []
    for i, c in enumerate(reps):
        if hexc(c) in overrides:                    # hand override: the same Lab shift for every nearest pixel
            t = lab(unhex(overrides[hexc(c)]))
            d = [t[k] - reps_lab[i][k] for k in range(3)]
            shiny[i] = unhex(overrides[hexc(c)])
            shifts.append(lambda cl, d=d: (cl[0] + d[0], cl[1] + d[1], cl[2] + d[2]))
        elif auto:                                  # computed: the representative's transform (keeps the ramps)
            shifts.append(lambda cl, tf=tfs[i]: apply(tf, cl))
        else:
            shifts.append(None)
    # every colour of the sheets -> its shiny Lab (before the saturation pass)
    hist = {}
    for im in sheets:
        for w, c in im.getcolors(1 << 24):
            if not is_key(c):
                hist[c] = hist.get(c, 0) + w
    labs = {c: lab(c) for c in hist}
    new, unmatched = {}, 0
    for c, cl in labs.items():
        i = min(range(len(reps)), key=lambda i: dist(cl, reps_lab[i]))
        new[c] = shifts[i](cl) if shifts[i] else cl
        if not nref[i] and not any(nref[j] for j in range(len(reps)) if grp[j] == grp[i]):
            unmatched += hist[c]
    nlabs = {c: new[c] for c in hist}
    # saturation: the shiny result should be as colourful against the reference shiny as the drawing is against
    # the reference normal
    m_n, c_n = mean_lab(hist, labs)
    m_s, c_s = mean_lab(hist, nlabs)
    rn, rs = ref_hist(slug, "normal", site), ref_hist(slug, "shiny", site)
    rl = {c: lab(c) for c in set(rn) | set(rs)}
    rm_n, rc_n = mean_lab(rn, rl)
    rm_s, rc_s = mean_lab(rs, rl)
    sat_auto = SAT_MIN if c_s < 1 or rc_n < 1 else max(SAT_MIN, min(SAT_MAX, (c_n / rc_n) * rc_s / c_s))
    sat = old.get("saturation", "auto")
    sat_v = sat_auto if sat == "auto" else float(sat)
    # lightness: the drawing gets lighter / darker by as much as the reference does (changed colours, at most ±L_MAX)
    lit = old.get("lightness", "auto")
    lit_v = max(-L_MAX, min(L_MAX, (rm_s[0] - rm_n[0]) - (m_s[0] - m_n[0]))) if lit == "auto" else float(lit)
    lut = {}
    for c, cl in new.items():
        if de(cl, labs[c]) > 1.0:
            cl = (max(0.0, min(100.0, cl[0] + lit_v)), cl[1] * sat_v, cl[2] * sat_v)
        lut[c] = rgb(*cl) + ((c[3],) if len(c) == 4 else ())
    written = []
    rules = old.get("keep") or []
    for p, im in zip(srcs, sheets):
        out = p[:-4] + "-shiny.png"
        res = Image.new(im.mode, im.size)
        res.putdata([lut.get(c, c) for c in pixels(im)])
        if rules:
            res.paste(im, mask=keep_mask(im, rules, labs))
        res.save(out + ".part", format="PNG", optimize=True)
        os.replace(out + ".part", out)
        written.append(out)
    # review numbers: distance of the result's mean colour to the reference shiny, against the drawing's own offset
    # to the reference normal (a drawing that is redder than the reference stays redder); hue of the biggest change
    final = {c: lab(lut[c][:3]) for c in hist}
    m_f, _ = mean_lab(hist, final)
    review = {"offset_normal": round(de(m_n, rm_n), 1), "offset_shiny": round(de(m_f, rm_s), 1),
              "ref_change": round(de(rm_n, rm_s), 1), "sheet_change": round(de(m_n, m_f), 1),
              "unmatched": round(unmatched / max(1, sum(hist.values())), 2), "saturation": round(sat_v, 2), "lightness": round(lit_v, 1),
              "hand": bool(overrides or rules or sat != "auto" or lit != "auto" or not auto)}
    doc = {"tool": "tools/units/shiny_recolor.py", "auto": auto, "map": old.get("map") or {},
           "saturation": sat, "lightness": lit, "keep": rules, "reference_slug": site,
           "sources": [os.path.basename(p) for p in srcs], "review": review,
           "palette": [{"from": hexc(c), "to": hexc(shiny[i]), "group": grp[i], "ref_px": nref[i]}
                       for i, c in enumerate(reps)]}
    with open(jpath + ".part", "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=1)
    os.replace(jpath + ".part", jpath)
    return folder, slug, written, review


def verdict(r):
    """OK / CHECK + reason from a review dict"""
    why = []
    if r["offset_shiny"] > r["offset_normal"] + 12:
        why.append(f"mean colour {r['offset_shiny']} from the reference shiny (drawing {r['offset_normal']} from normal)")
    if r["ref_change"] > 8 and r["sheet_change"] < r["ref_change"] * 0.4:
        why.append(f"changed too little ({r['sheet_change']} vs reference {r['ref_change']})")
    if r["unmatched"] > 0.25:
        why.append(f"{int(r['unmatched'] * 100)}% of the pixels have no reference colour")
    if r.get("hand"):
        return "OK hand-tuned" + (f" (auto: {'; '.join(why)})" if why else "")
    return ("CHECK " + "; ".join(why)) if why else "OK"


def review_3d(folder, site):
    """review numbers of a rendered species' shiny views (shiny texture) against the reference renders"""
    slug = sources(folder)[0]
    hn, hs = {}, {}
    for h, f in ((hn, f"{slug}-front.png"), (hs, f"{slug}-front-shiny.png")):
        for w, c in Image.open(os.path.join(folder, f)).convert("RGBA").getcolors(1 << 24):
            if c[3]:
                h[c[:3]] = h.get(c[:3], 0) + w
    labs = {c: lab(c) for c in set(hn) | set(hs)}
    m_n, _ = mean_lab(hn, labs)
    m_s, _ = mean_lab(hs, labs)
    rn, rs = ref_hist(slug, "normal", site), ref_hist(slug, "shiny", site)
    rl = {c: lab(c) for c in set(rn) | set(rs)}
    rm_n, _ = mean_lab(rn, rl)
    rm_s, _ = mean_lab(rs, rl)
    return {"offset_normal": round(de(m_n, rm_n), 1), "offset_shiny": round(de(m_s, rm_s), 1),
            "ref_change": round(de(rm_n, rm_s), 1), "sheet_change": round(de(m_n, m_s), 1), "unmatched": 0}


def all_3d():
    """[(folder, site slug)] of the rendered species with shiny views, dex order (site slug = the species id)"""
    sd = {x["dex"]: x["id"] for x in json.load(open(os.path.join(REPO, "data", "units", "pokemon-species.json"),
                                                     encoding="utf-8"))["species"]}
    out = []
    for j in glob.glob(os.path.join(REPO, "assets", "units", "Fall-back", "Gen*", "*", "*-render.json")):
        if "shiny" in json.load(open(j, encoding="utf-8")):
            d = os.path.dirname(j)
            dex = int(os.path.basename(d).split("-")[0])
            out.append((dex, d, sd.get(dex)))
    return [(d, site) for _, d, site in sorted(out)]


def _work_3d(job):
    folder, site = job
    try:
        return folder, sources(folder)[0], verdict(review_3d(folder, site)), site
    except Exception as e:
        return folder, sources(folder)[0], f"CHECK failed: {type(e).__name__}: {e}", site


# ---------------------------------------------------------------- comparison images
def front_cells(sheet):
    """the first two front-facing cells (layouts as game/tools/build_assets.py battle_strip)"""
    w, h = sheet.size
    if w * 3 == h * 4:
        cell = w // 8
        return [sheet.crop((7 * cell, r * cell, 8 * cell, (r + 1) * cell)) for r in range(2)]
    cell = h // 4
    return [sheet.crop((c * cell, 0, (c + 1) * cell, cell)) for c in range(2)]


def unkey(im):
    im = im.convert("RGBA")
    im.putdata([(0, 0, 0, 0) if is_key(px) else px for px in pixels(im)])
    return im


def fit(im, box):
    """crop to the drawing and scale it into a box (integer upscale for small sprites)"""
    bb = im.getbbox()
    if bb:
        im = im.crop(bb)
    s = min(box / im.width, box / im.height)
    if s >= 2:
        s = int(s)
        return im.resize((im.width * s, im.height * s), Image.NEAREST)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS if s < 1 else Image.NEAREST)


def views(folder, slug):
    """(normal, shiny) front views of a species folder"""
    if os.path.isfile(os.path.join(folder, f"{slug}-movement-shiny.png")):
        n = Image.open(os.path.join(folder, f"{slug}-movement.png")).convert("RGB")
        s = Image.open(os.path.join(folder, f"{slug}-movement-shiny.png")).convert("RGB")
        return unkey(front_cells(n)[0]), unkey(front_cells(s)[0])
    out = []
    for f in (f"{slug}-front.png", f"{slug}-front-shiny.png"):
        im = Image.open(os.path.join(folder, f)).convert("RGBA")
        out.append(im.crop((0, 0, im.width // 2, im.height)))
    return tuple(out)


def batch_image(items, out, box=120):
    """items: [(label, folder, slug, site_slug, verdict)] -> 3 x 4 grid of species, each normal | shiny | reference"""
    from PIL import ImageDraw
    bg, pad, lab_h = (236, 236, 244), 8, 14
    cw = 3 * box + 4 * pad
    ch = box + lab_h + 2 * pad
    sheet = Image.new("RGB", (3 * cw, 4 * ch), bg)
    d = ImageDraw.Draw(sheet)
    for k, (label, folder, slug, site, flag) in enumerate(items):
        x0, y0 = (k % 3) * cw, (k // 3) * ch
        d.rectangle((x0 + 2, y0 + 2, x0 + cw - 3, y0 + ch - 3), outline=(190, 70, 70) if flag != "OK" else (170, 170, 190))
        d.text((x0 + pad, y0 + 4), label + ("" if flag == "OK" else "  [CHECK]"), fill=(20, 20, 40))
        try:
            ims = list(views(folder, slug))
        except Exception:
            ims = [Image.new("RGBA", (1, 1))] * 2
        try:
            ims.append(reference(slug, "shiny", site))
        except Exception:
            ims.append(Image.new("RGBA", (1, 1)))
        for j, im in enumerate(ims):
            im = fit(im, box)
            sheet.paste(im, (x0 + pad + j * (box + pad) + (box - im.width) // 2,
                             y0 + lab_h + pad + (box - im.height)), im)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.save(out)
    return out


# ---------------------------------------------------------------- batch run
def all_2d():
    """every 2D species folder (with a movement sheet), dex order"""
    out = []
    for d in sorted(glob.glob(os.path.join(REPO, "assets", "units", "Gen*", "*", ""))):
        d = d.rstrip("/")
        if glob.glob(os.path.join(glob.escape(d), "*-movement.png")):
            out.append(d)
    return sorted(out, key=lambda d: (int(os.path.basename(d).split("-")[0]), d))


def _work(folder):
    try:
        f, slug, written, review = do_folder(folder)
        return folder, slug, verdict(review), review
    except Exception as e:                           # missing reference, odd sheet ...
        slug = sources(folder)[0]
        return folder, slug, f"CHECK failed: {type(e).__name__}: {e}", None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("species", nargs="*", help="dex number or name of a 2D species, or a species folder")
    ap.add_argument("--all", action="store_true", help="every 2D species")
    ap.add_argument("--fallback-3d", action="store_true", help="the species folders given are Fall-back renders")
    ap.add_argument("--jobs", type=int, default=1, help="worker processes")
    ap.add_argument("--site-slug", help="the reference site's name for the species when it differs from the slug")
    ap.add_argument("--compare", metavar="PNG", help="also write a normal | shiny | reference shiny comparison image")
    ap.add_argument("--report", metavar="DIR", help="write batch-NNN.png (12 species each) + review.txt into DIR")
    ap.add_argument("--batch-start", type=int, default=1, help="number of the first batch image")
    ap.add_argument("--report-3d", action="store_true", help="with --report: review the shiny renders of "
                    "tools/model3d/battle_sprites.py --shiny instead (no recolour)")
    a = ap.parse_args()
    if a.report_3d:
        import multiprocessing as mp
        with mp.Pool(max(1, a.jobs)) as pool:
            res = pool.map(_work_3d, all_3d())
        os.makedirs(a.report, exist_ok=True)
        with open(os.path.join(a.report, "review.txt"), "a", encoding="utf-8") as fh:
            for f, slug, flag, _ in res:
                fh.write(f"{os.path.basename(f)}\t3d\t{flag}\n")
        for b in range(0, len(res), 12):
            items = [(os.path.basename(f), f, s, site, v) for f, s, v, site in res[b:b + 12]]
            print(batch_image(items, os.path.join(a.report, f"batch-{a.batch_start + b // 12:03d}.png")))
        return
    folders = all_2d() if a.all else [s if os.path.isdir(s) else folder_of(s) for s in a.species]
    folders = [os.path.abspath(f) for f in folders]
    if a.site_slug and len(folders) == 1:
        res = [do_folder(folders[0], a.site_slug)]
        res = [(f, s, verdict(r), r) for f, s, _, r in res]
    elif a.jobs > 1:
        import multiprocessing as mp
        with mp.Pool(a.jobs) as pool:
            res = pool.map(_work, folders)
    else:
        res = [_work(f) for f in folders]
    for f, slug, flag, _ in res:
        print(f"{os.path.relpath(f, REPO)}\t{flag}")
    if a.compare:
        batch_image([(os.path.basename(f), f, s, None, v) for f, s, v, _ in res], a.compare)
    if a.report:
        os.makedirs(a.report, exist_ok=True)
        with open(os.path.join(a.report, "review.txt"), "a", encoding="utf-8") as fh:
            for f, slug, flag, r in res:
                fh.write(f"{os.path.basename(f)}\t2d\t{flag}\t{json.dumps(r) if r else ''}\n")
        for b in range(0, len(res), 12):
            items = [(os.path.basename(f), f, s, None, v) for f, s, v, _ in res[b:b + 12]]
            print(batch_image(items, os.path.join(a.report, f"batch-{a.batch_start + b // 12:03d}.png")))


if __name__ == "__main__":
    main()
