#!/usr/bin/env python3
"""
Body anchors ("điểm phát chiêu") of each Pokémon for move effects, taken from its Fall-back 3D model: bones and
locators projected with the same orthographic camera as the pokemon3d sheets (front = the "down" direction, yaw 180;
back = "up", yaw 0; 35 degrees above the ground), in the rest pose.

Each anchor is stored relative to the 3D silhouette: x = (px - centre) / width, y = (bottom - py) / width (so it maps
onto the 2D sprite by its width and bottom-centre, which a smoke cloud or flame on top does not disturb), plus
`vis` = the point is on the side facing the camera (draw the effect in front) or hidden behind the body.

  mouth  jaw / mouth / beak bone (else the front of the head)
  head   head bone centre
  vent   locators or bones named smoke / fire / flame / vent / shell / cannon / blowhole / volcano / hump
         (where Eruption, Lava Plume, Water Spout come out); else the top of the torso
  hand_l, hand_r  ends of the arms;  tail  tip of the tail;  body  torso centre;  feet  bottom centre

Needs numpy (renders with tools/model3d/render3d.py), so run it with a numpy Python ($MONS_PY3D):
  $MONS_PY3D tools/skills/build_anchors.py torkoal typhlosion
  ... --all            every species with a model in assets/pokemon/Fall-back/
Output: data/pokemon/pokemon-anchors.json (merged). Per-species hand fixes: assets/pokemon/<Gen>/<NNN-Name>/<slug>-anchors.json
with the same {"front": {...}, "back": {...}} shape override single anchors.
"""
import glob
import json
import math
import os
import re
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
sys.path.insert(0, os.path.join(REPO, "tools", "model3d"))
import numpy as np  # noqa: E402
from render3d import fx, rot, render, pose, T, R4, S4  # noqa: E402
from build_fallback import load, plan  # noqa: E402

OUT = os.path.join(REPO, "data", "units", "pokemon-anchors.json")
VIEWS = {"front": 180, "back": 0,          # straight (4-direction sheets)
         "front_d": 135, "back_d": 315,    # diagonal battle views: opponent facing the lower-left, player facing the upper-right
         "front_s": 90}                    # 4-direction sheets: the opponent uses the "left" row (facing the player)
ELEV = 35
VENT = re.compile(r"smoke|fire|flame|vent|shell|cannon|blowhole|volcano|hump|lava|exhaust|spout|crater", re.I)


def idle_pose(folder):
    """the model and the pose of frame 0 of its idle animation (the pose the 2D sprites were drawn from)"""
    model, A, poser = load(folder)
    pick, _air = plan(model, A, poser)
    if pick is None:
        pick, _air = plan(model, A, {})
    pz = {}
    if pick and pick.get("idle"):
        name, speed, proc, rec = pick["idle"]
        rec = rec or poser.get("STAND") or poser.get("WALK") or {}
        anim = A.get(name) if name else None
        pz = pose(anim, 0.0) if anim else {}
        for b, (r, p) in rec.get("offs", {}).items():
            r0, p0, s0 = pz.get(b, (np.zeros(3), np.zeros(3), np.ones(3)))
            pz[b] = (r0 + r, p0 + p, s0)
        model.hide = set(rec.get("hide", ()))
    return model, pz


def world_mats(model, pz):
    mats = {}

    def W(name):
        if name in mats:
            return mats[name]
        b = model.bones[name]
        p = fx(b.get("pivot", [0, 0, 0]))
        par = b.get("parent")
        Mp = W(par) if par in model.bones else np.eye(4)
        pp = fx(model.bones[par].get("pivot", [0, 0, 0])) if par in model.bones else np.zeros(3)
        r0 = np.array(b.get("rotation", [0, 0, 0]), float)
        ar, ap, asc = pz.get(name, (np.zeros(3), np.zeros(3), np.ones(3)))
        r = r0 + ar
        mats[name] = Mp @ T(p - pp + np.array([-ap[0], ap[1], ap[2]])) @ R4([-r[0], -r[1], r[2]]) @ S4(asc)
        return mats[name]
    for n in model.bones:
        W(n)
    return mats


def bone_points(model, mats, name):
    """world corners of a bone's cubes (or its pivot)"""
    b = model.bones[name]
    bp = fx(b.get("pivot", [0, 0, 0]))
    pts = []
    for c in b.get("cubes", []):
        o, s, inf = c["origin"], c["size"], c.get("inflate", 0)
        for x in (-o[0] - s[0] - inf, -o[0] + inf):
            for y in (o[1] - inf, o[1] + s[1] + inf):
                for z in (o[2] - inf, o[2] + s[2] + inf):
                    pts.append(np.array([x, y, z]) - bp)
    if not pts:
        pts = [np.zeros(3)]
    P = np.array([list(p) + [1] for p in pts]) @ mats[name].T
    return P[:, :3]


def descendants(model, name):
    out = [name]
    for n, b in model.bones.items():
        if b.get("parent") == name:
            out += descendants(model, n)
    return out


def anchors_3d(model, pz):
    """world-space anchor points in pose pz"""
    mats = world_mats(model, pz)
    names = list(model.bones)
    low = {n: n.lower() for n in names}
    A = {}

    def centre(ns):
        P = np.vstack([bone_points(model, mats, n) for n in ns])
        return P.mean(axis=0), P

    heads = [n for n in names if low[n] in ("head", "head2", "head1")] or [n for n in names if "head" in low[n]]
    if heads:
        c, P = centre(heads[:1])
        A["head"] = c
    jaws = [n for n in names if re.search(r"jaw|mouth|beak|mandible", low[n])]
    if jaws:
        A["mouth"] = centre(jaws[:1])[0]
    elif heads:  # front-most point of the head, slightly below its centre
        P = bone_points(model, mats, heads[0])
        A["mouth"] = np.array([P[:, 0].mean(), P[:, 1].mean() - 0.15 * np.ptp(P[:, 1]), P[:, 2].min()])
    torso = [n for n in names if low[n] in ("torso", "body", "chest")] or names[:1]
    has = lambda n: bool(model.bones[n].get("cubes"))
    # torso bones without cubes (just a pivot): use the cubes of the bones under them
    tb = [n for n in descendants(model, torso[0]) if has(n)] if not has(torso[0]) else torso[:1]
    if not tb:
        tb = [n for n in names if has(n)]
    tc, tP = centre(tb)
    A["body"] = tc
    own = [n for n in tb if not re.search(r"head|jaw|arm|leg|hand|foot|tail|wing|ear|eye|finger|toe", low[n])] or tb[:1]
    _, oP = centre(own)
    locs = []
    for n in names:
        for ln, pos in (model.bones[n].get("locators") or {}).items():
            pos = pos.get("offset", pos) if isinstance(pos, dict) else pos
            if VENT.search(ln):
                bp = fx(model.bones[n].get("pivot", [0, 0, 0]))
                locs.append((mats[n] @ np.array(list(fx(pos) - bp) + [1]))[:3])
    vb = [n for n in names if VENT.search(low[n])]
    if locs:
        A["vent"] = np.mean(locs, axis=0)
    elif vb:
        A["vent"] = centre(vb)[0]
    else:  # top of the torso's own cubes (not the head / limbs)
        A["vent"] = np.array([oP[:, 0].mean(), oP[:, 1].max(), oP[:, 2].mean()])
    for side, key in (("left", "hand_l"), ("right", "hand_r")):
        # the hand = finger / hand / claw / fist bones of that side, else the last bone of the arm chain
        tips = [n for n in names if side in low[n] and re.search(r"finger|hand|claw|fist|paw|palm", low[n])]
        if not tips:
            arm = [n for n in names if ("arm" in low[n] or "wing" in low[n]) and side in low[n]]
            if arm:
                chain = descendants(model, arm[0])
                tips = [chain[-1]]
        if tips:
            A[key] = centre(tips)[0]
    tails = [n for n in names if "tail" in low[n]]
    if tails:
        P = np.vstack([bone_points(model, mats, n) for n in descendants(model, tails[0])])
        A["tail"] = P[np.argmax(np.linalg.norm(P - tc, axis=1))]
    return A


def project(model, pz, pts, yaw, size=640):
    """screen points + silhouette for one view; scale chosen so the model fills ~60% of the image"""
    Ry = rot([0, yaw, 0])
    e = math.radians(ELEV)
    up = np.array([0, math.cos(e), -math.sin(e)]); toward = np.array([0, math.sin(e), math.cos(e)])
    allp = np.vstack([q[0] for q in model.quads(pz)])
    ext = max(np.ptp(allp[:, 0]), np.ptp(allp[:, 1]), np.ptp(allp[:, 2]), 1e-3)
    scale = size * 0.6 / ext
    foot = 0.8
    alb, mask, depth = render(model, pz, yaw, size, scale, elev=ELEV, foot=foot, raw=True)
    ys, xs = np.nonzero(mask)
    x0, x1, y1 = xs.min(), xs.max() + 1, ys.max() + 1
    w = x1 - x0
    cx = (x0 + x1) / 2
    out = {}
    body_dz = ((Ry @ pts["body"]) @ toward) * scale if "body" in pts else 0.0
    for k, p in pts.items():
        pw = Ry @ p
        sx = size / 2 + pw[0] * scale
        sy = size * foot - (pw @ up) * scale
        dz = (pw @ toward) * scale
        ix, iy = int(np.clip(sx, 0, size - 1)), int(np.clip(sy, 0, size - 1))
        vis = bool(not mask[iy, ix] or dz >= body_dz + 0.05 * w)   # on the camera side of the torso centre
        out[k] = {"x": round(float((sx - cx) / w), 3), "y": round(float((y1 - sy) / w), 3), "vis": vis}
    out["_aspect"] = round(float((y1 - ys.min()) / w), 3)
    return out


def species_folder(slug):
    for d in glob.glob(os.path.join(REPO, "assets", "units", "Fall-back", "Gen*", "[0-9]*-*")):
        if re.sub(r"[^a-z0-9]", "", os.path.basename(d).split("-", 1)[1].lower()) == re.sub(r"[^a-z0-9]", "", slug.lower()):
            return d
    return None


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    if args == ["--all"]:
        slugs = [os.path.basename(d).split("-", 1)[1].lower() for d in glob.glob(os.path.join(REPO, "assets", "units", "Fall-back", "Gen*", "[0-9]*-*"))]
    else:
        slugs = [s.lower() for s in args]
    data = json.load(open(OUT)) if os.path.isfile(OUT) else {}
    for slug in slugs:
        folder = species_folder(slug)
        if not folder:
            print(f"{slug}: no 3D model folder"); continue
        try:
            model, pz = idle_pose(folder)
            A = anchors_3d(model, pz)
            data[slug] = {v: project(model, pz, A, yaw) for v, yaw in VIEWS.items()}
            print(slug, {v: {k: (d["x"], d["y"], d["vis"]) for k, d in data[slug][v].items() if k != "_aspect"} for v in VIEWS})
        except Exception as e:  # noqa: BLE001
            print(f"{slug}: failed ({e})")
    json.dump(data, open(OUT, "w"), indent=1, sort_keys=True)
    print("->", os.path.relpath(OUT, REPO), len(data), "species")


if __name__ == "__main__":
    main()
