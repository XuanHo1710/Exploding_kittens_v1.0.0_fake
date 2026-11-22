"""Tiny software renderer for the Bedrock-format (.geo.json) Pokémon models in assets/pokemon/Fall-back/ -> 8-direction
sprite sheets.

Conventions follow Blockbench's Bedrock codec: x is mirrored, bone/cube rotations become (-rx, -ry, rz) with
Euler order ZYX (R = Rz @ Ry @ Rx), animation positions become (-x, y, z).
"""
import json, math, re
import numpy as np
from PIL import Image


def fx(v):
    return np.array([-v[0], v[1], v[2]], float)


def rot(r):
    rx, ry, rz = (math.radians(a) for a in r)
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def T(t):
    M = np.eye(4); M[:3, 3] = t; return M


def R4(r):
    M = np.eye(4); M[:3, :3] = rot(r); return M


def S4(s):
    M = np.eye(4); M[0, 0], M[1, 1], M[2, 2] = s; return M


# ---------------------------------------------------------------- molang (just enough for the idle/walk loops in Fall-back)
ENV = {
    "sin": lambda d: math.sin(math.radians(d)), "cos": lambda d: math.cos(math.radians(d)),
    "abs": abs, "sqrt": math.sqrt, "floor": math.floor, "ceil": math.ceil, "round": round,
    "min": min, "max": max, "pow": pow, "exp": math.exp, "pi": math.pi, "fmod": math.fmod,
    "clamp": lambda v, a, b: max(a, min(b, v)), "lerp": lambda a, b, t: a + (b - a) * t,
    "random": lambda a=0, b=1: (a + b) / 2, "atan2": lambda y, x: math.degrees(math.atan2(y, x)),
    "asin": lambda v: math.degrees(math.asin(v)), "acos": lambda v: math.degrees(math.acos(v)),
    "atan": lambda v: math.degrees(math.atan(v)),
}


def _fn(name):
    """a Molang math function name -> its ENV name; a name ENV only has with an "f" prefix (the C-style float
    variant, e.g. the modulo function of upstream files) maps to that one"""
    return name if name in ENV or "f" + name not in ENV else "f" + name


def math_names(s):
    """'math.<fn>' -> the bare ENV name"""
    return re.sub(r"\bmath\.(\w+)", lambda m: _fn(m.group(1)), s)


def geometry(doc):
    """the geometry list of a .geo.json document: key "geometry" (Fall-back files), or a namespaced "<ns>:geometry"
    key as upstream exports write it"""
    return next(v for k, v in doc.items() if k.split(":")[-1] == "geometry")


def molang(e, t):
    if isinstance(e, (int, float)):
        return float(e)
    s = str(e).lower().strip().rstrip(";")
    s = re.sub(r"\b(query|q)\.(anim_time|life_time)\b", "__T__", s)
    s = re.sub(r"\b(query|q|variable|v|temp|t|context|c)\.\w+", "0", s)
    s = math_names(s).replace("__T__", "t")
    try:
        return float(eval(s, {"__builtins__": {}}, {**ENV, "t": t}))
    except Exception:
        return 0.0


def vec3(v, t):
    if isinstance(v, dict):
        v = v.get("post", v.get("pre", v.get("vector", 0)))
    if isinstance(v, list):
        return np.array([molang(x, t) for x in v] + [0.0] * (3 - len(v)))[:3]
    x = molang(v, t)
    return np.array([x, x, x])


def channel(ch, t):
    if not isinstance(ch, dict) or not all(re.fullmatch(r"[0-9.]+", k) for k in ch):
        return vec3(ch, t)
    keys = sorted((float(k), v) for k, v in ch.items())
    if t <= keys[0][0]:
        return vec3(keys[0][1], t)
    for (ta, va), (tb, vb) in zip(keys, keys[1:]):
        if t <= tb:
            a = vec3(va["post"] if isinstance(va, dict) and "post" in va else va, t)
            b = vec3(vb["pre"] if isinstance(vb, dict) and "pre" in vb else vb, t)
            k = (t - ta) / (tb - ta) if tb > ta else 1
            return a + (b - a) * k
    return vec3(keys[-1][1], t)


def pose(anim, t):
    """bone -> (rot, pos, scale) in raw bedrock units"""
    out = {}
    if not anim:
        return out
    L = anim.get("animation_length")
    if L and anim.get("loop", False):
        t = t % L
    for name, ch in anim.get("bones", {}).items():
        r = channel(ch["rotation"], t) if "rotation" in ch else np.zeros(3)
        p = channel(ch["position"], t) if "position" in ch else np.zeros(3)
        s = channel(ch["scale"], t) if "scale" in ch else np.ones(3)
        out[name] = (r, p, s)
    return out


# ---------------------------------------------------------------- geometry -> textured quads
FACES = ["north", "south", "east", "west", "up", "down"]


def box_uv(u, v, sx, sy, sz):
    sx, sy, sz = math.floor(sx), math.floor(sy), math.floor(sz)
    return {
        "east": (u, v + sz, u + sz, v + sz + sy),
        "north": (u + sz, v + sz, u + sz + sx, v + sz + sy),
        "west": (u + sz + sx, v + sz, u + 2 * sz + sx, v + sz + sy),
        "south": (u + 2 * sz + sx, v + sz, u + 2 * sz + 2 * sx, v + sz + sy),
        "up": (u + sz + sx, v + sz, u + sz, v),
        "down": (u + sz + 2 * sx, v, u + sz + sx, v + sz),
    }


def face_corners(x0, x1, y0, y1, z0, z1):
    # TL, TR, BR, BL as seen from outside the face
    return {
        "north": [(x1, y1, z0), (x0, y1, z0), (x0, y0, z0), (x1, y0, z0)],
        "south": [(x0, y1, z1), (x1, y1, z1), (x1, y0, z1), (x0, y0, z1)],
        "east": [(x1, y1, z1), (x1, y1, z0), (x1, y0, z0), (x1, y0, z1)],
        "west": [(x0, y1, z0), (x0, y1, z1), (x0, y0, z1), (x0, y0, z0)],
        "up": [(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)],
        "down": [(x0, y0, z1), (x1, y0, z1), (x1, y0, z0), (x0, y0, z0)],
    }


class Model:
    def __init__(self, geo_path, tex_path, hide=()):
        g = geometry(json.load(open(geo_path)))[0]
        self.tw, self.th = g["description"]["texture_width"], g["description"]["texture_height"]
        self.bones = {b["name"]: b for b in g["bones"]}
        self.order = [b["name"] for b in g["bones"]]
        tex = Image.open(tex_path).convert("RGBA")
        self.tex = np.asarray(tex).astype(np.float32)
        self.sx, self.sy = tex.width / self.tw, tex.height / self.th  # texture may be hi-res
        self.hide = set(hide)

    def quads(self, pz):
        """world-space quads [(4x3 corners, uv rect, normal)] for pose pz"""
        world = {}

        def W(name):
            if name in world:
                return world[name]
            b = self.bones[name]
            p = fx(b.get("pivot", [0, 0, 0]))
            par = b.get("parent")
            Mp = W(par) if par in self.bones else np.eye(4)
            pp = fx(self.bones[par].get("pivot", [0, 0, 0])) if par in self.bones else np.zeros(3)
            r0 = np.array(b.get("rotation", [0, 0, 0]), float)
            ar, ap, asc = pz.get(name, (np.zeros(3), np.zeros(3), np.ones(3)))
            rr = r0 + ar
            M = Mp @ T(p - pp + np.array([-ap[0], ap[1], ap[2]])) @ R4([-rr[0], -rr[1], rr[2]]) @ S4(asc)
            world[name] = M
            return M

        def hidden(name):
            while name:
                if name in self.hide:
                    return True
                name = self.bones[name].get("parent")
            return False

        out = []
        for name in self.order:
            b = self.bones[name]
            if not b.get("cubes") or hidden(name):
                continue
            M = W(name)
            if np.abs(M[:3, :3]).sum() < 1e-6:  # scaled to 0 = hidden by the animation
                continue
            bp = fx(b.get("pivot", [0, 0, 0]))
            for c in b["cubes"]:
                o, s, inf = c["origin"], c["size"], c.get("inflate", 0)
                x0, x1 = -o[0] - s[0] - inf, -o[0] + inf
                y0, y1 = o[1] - inf, o[1] + s[1] + inf
                z0, z1 = o[2] - inf, o[2] + s[2] + inf
                if isinstance(c.get("uv"), dict):
                    uvs = {}
                    for f, d in c["uv"].items():
                        u, v = d["uv"]; w, h = d.get("uv_size", [0, 0])
                        uvs[f] = (u + w, v + h, u, v) if f in ("up", "down") else (u, v, u + w, v + h)
                else:
                    u, v = c.get("uv", [0, 0])
                    uvs = box_uv(u, v, *s)
                    if c.get("mirror"):
                        uvs = {f: (r[2], r[1], r[0], r[3]) for f, r in uvs.items()}
                        uvs["east"], uvs["west"] = uvs["west"], uvs["east"]
                cr = np.eye(4)
                if "rotation" in c:
                    cp = fx(c.get("pivot", [0, 0, 0])) - bp
                    rr = c["rotation"]
                    cr = T(cp) @ R4([-rr[0], -rr[1], rr[2]]) @ T(-cp)
                Mc = M @ cr
                for f, pts in face_corners(x0, x1, y0, y1, z0, z1).items():
                    if f not in uvs:
                        continue
                    P = np.array([list(np.array(q) - bp) + [1] for q in pts]) @ Mc.T
                    out.append((P[:, :3], uvs[f]))
        return out


# ---------------------------------------------------------------- rasteriser
LIGHT = np.array([-0.45, 0.8, 0.55]); LIGHT /= np.linalg.norm(LIGHT)


def render(model, pz, yaw, size, scale, elev=35, foot=0.86, ox=0.0, raw=False):
    """orthographic camera from the front, `elev` degrees above the ground; returns RGBA uint8 (size x size),
    or with raw=True the buffers (albedo float RGB, mask bool, depth in px toward the camera)"""
    Ry = rot([0, yaw, 0])
    e = math.radians(elev)
    up = np.array([0, math.cos(e), -math.sin(e)]); toward = np.array([0, math.sin(e), math.cos(e)])
    img = np.zeros((size, size, 4), np.float32)
    alb = np.zeros((size, size, 3), np.float32)
    zb = np.full((size, size), -1e9, np.float32)
    cx, cy = size / 2 + ox, size * foot
    tex, th, tw = model.tex, model.tex.shape[0], model.tex.shape[1]
    for P, (u0, v0, u1, v1) in model.quads(pz):
        Pw = P @ Ry.T
        n = np.cross(Pw[1] - Pw[0], Pw[3] - Pw[0])
        ln = np.linalg.norm(n)
        if ln < 1e-9:
            continue
        n /= ln
        if n @ toward >= 0:  # outward normal must face the camera... (TL,TR,BL winding gives inward n)
            continue
        n = -n
        shade = 0.62 + 0.38 * max(0.0, float(n @ LIGHT))
        sx = cx + (Pw @ np.array([1, 0, 0])) * scale
        sy = cy - (Pw @ up) * scale
        dz = Pw @ toward
        UV = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
        for tri in ((0, 1, 2), (0, 2, 3)):
            xs, ys, zs = sx[list(tri)], sy[list(tri)], dz[list(tri)]
            x_min, x_max = max(int(math.floor(xs.min())), 0), min(int(math.ceil(xs.max())), size - 1)
            y_min, y_max = max(int(math.floor(ys.min())), 0), min(int(math.ceil(ys.max())), size - 1)
            if x_min > x_max or y_min > y_max:
                continue
            den = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
            if abs(den) < 1e-9:
                continue
            gx, gy = np.meshgrid(np.arange(x_min, x_max + 1) + 0.5, np.arange(y_min, y_max + 1) + 0.5)
            a = ((ys[1] - ys[2]) * (gx - xs[2]) + (xs[2] - xs[1]) * (gy - ys[2])) / den
            b = ((ys[2] - ys[0]) * (gx - xs[2]) + (xs[0] - xs[2]) * (gy - ys[2])) / den
            c = 1 - a - b
            m = (a >= -1e-4) & (b >= -1e-4) & (c >= -1e-4)
            if not m.any():
                continue
            z = a * zs[0] + b * zs[1] + c * zs[2]
            tu = np.array([UV[i][0] for i in tri]); tv = np.array([UV[i][1] for i in tri])
            u = a * tu[0] + b * tu[1] + c * tu[2]
            v = a * tv[0] + b * tv[1] + c * tv[2]
            lo_u, hi_u = min(u0, u1), max(u0, u1); lo_v, hi_v = min(v0, v1), max(v0, v1)
            u = np.clip(u, lo_u, max(lo_u, hi_u - 1e-3)); v = np.clip(v, lo_v, max(lo_v, hi_v - 1e-3))
            px = np.clip((u * model.sx).astype(int), 0, tw - 1); py = np.clip((v * model.sy).astype(int), 0, th - 1)
            col = tex[py, px]
            sub = zb[y_min:y_max + 1, x_min:x_max + 1]
            m &= (col[..., 3] > 127) & (z > sub)
            if not m.any():
                continue
            sub[m] = z[m]
            im = img[y_min:y_max + 1, x_min:x_max + 1]
            rgb = col[..., :3] * shade
            im[m, :3] = rgb[m]; im[m, 3] = 255
            alb[y_min:y_max + 1, x_min:x_max + 1][m] = col[..., :3][m]
    if raw:
        mask = img[..., 3] > 0
        return alb, mask, np.where(mask, zb * scale, 0).astype(np.float32)
    return np.clip(img, 0, 255).astype(np.uint8)


def outline(a, color=(27, 23, 38)):
    """1px dark outline around the opaque silhouette (style of the hand-drawn sheets)"""
    al = a[..., 3] > 0
    grow = np.zeros_like(al)
    grow[1:] |= al[:-1]; grow[:-1] |= al[1:]; grow[:, 1:] |= al[:, :-1]; grow[:, :-1] |= al[:, 1:]
    edge = grow & ~al
    out = a.copy(); out[edge] = (*color, 255)
    return out


# ---------------------------------------------------------------- "rounded clay" post-process (needs OpenCV)
SAT, DEEP, SHARPEN = 1.3, 0.93, 0.7
def smooth(alb, mask, depth, out, round_px, bulge_px, outline_rgb=(27, 23, 38), thin_px=None, depth_blur=0.6, despeck=0):
    """alb/mask/depth rendered at SS x `out`; returns RGBA uint8 out x out with rounded silhouette + soft shading"""
    import cv2
    m = mask.astype(np.float32)
    def nblur(x, sig):  # mask-normalised blur (fills holes / extends colours past the silhouette)
        k = (0, 0)
        num = cv2.GaussianBlur(x * (m[..., None] if x.ndim == 3 else m), k, sig)
        den = cv2.GaussianBlur(m, k, sig)
        den = den[..., None] if x.ndim == 3 else den
        return num / np.maximum(den, 1e-4)
    # rounded silhouette: blur the coverage, re-threshold softly (convex corners round off, tiny notches fill in)
    cov = cv2.GaussianBlur(m, (0, 0), round_px)
    a = np.clip((cov - 0.42) / 0.16, 0, 1)
    # keep thin parts (ears, antennae, whiskers) that the rounding would erase
    r = max(3, int(round(thin_px if thin_px else round_px * 2)) | 1)
    opened = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (r, r)))
    thin = mask & (opened == 0)
    a = np.maximum(a, thin.astype(np.float32))
    if despeck:  # drop tiny islands left over by the rounding/thin-part pass (they read as dirt after downscaling)
        n, lab, st, _ = cv2.connectedComponentsWithStats((a > 0.5).astype(np.uint8), connectivity=8)
        small = np.zeros(n, bool); small[1:] = st[1:, cv2.CC_STAT_AREA] < despeck
        a[small[lab]] = 0
    solid = (a > 0.5).astype(np.uint8)
    col = np.where(mask[..., None], alb, nblur(alb, round_px))
    # soft depth: blur the box edges away, then add a circular "pillow" bulge near the silhouette
    d = nblur(depth, bulge_px * depth_blur)
    dist = cv2.distanceTransform(solid, cv2.DIST_L2, 5)
    u = np.clip(dist / bulge_px, 0, 1)
    d = d + bulge_px * np.sqrt(1 - (1 - u) ** 2)
    gx = cv2.Sobel(d, cv2.CV_32F, 1, 0, ksize=3) / 8
    gy = cv2.Sobel(d, cv2.CV_32F, 0, 1, ksize=3) / 8
    gx, gy = np.clip(gx, -3, 3), np.clip(gy, -3, 3)
    n = np.dstack([-gx, gy, np.ones_like(gx)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    L = np.array([-0.45, 0.65, 0.62]); L /= np.linalg.norm(L)
    lam = np.clip(n @ L, 0, 1)
    h = np.array([0, 0, 1.0]) + L; h /= np.linalg.norm(h)
    spec = np.clip(n @ h, 0, 1) ** 30 * 0.08
    lum = (col @ np.array([0.299, 0.587, 0.114], np.float32))[..., None]
    col = (lum + (col - lum) * SAT) * DEEP  # richer, slightly deeper colours
    rgb = col * (0.62 + 0.48 * lam)[..., None] + 255 * spec[..., None]
    rgba = np.dstack([np.clip(rgb, 0, 255) * a[..., None], a * 255])  # premultiplied
    small = cv2.resize(rgba, (out, out), interpolation=cv2.INTER_AREA)
    al = small[..., 3:4] / 255
    rgb = np.where(al > 0, small[..., :3] / np.maximum(al, 1e-4), 0)
    if SHARPEN:  # unsharp mask brings back texture detail lost to the rounding blur
        rgb = np.clip(rgb + SHARPEN * (rgb - cv2.GaussianBlur(rgb, (0, 0), 0.9)), 0, 255)
    # soft dark outline (1px at output size) under the sprite
    ring = cv2.dilate(small[..., 3], np.ones((3, 3), np.uint8)) / 255
    ring = np.clip(ring - al[..., 0], 0, 1) * 0.85
    out_a = al[..., 0] + ring
    out_rgb = (rgb * al + np.array(outline_rgb) * ring[..., None]) / np.maximum(out_a[..., None], 1e-4)
    return np.dstack([np.clip(out_rgb, 0, 255), np.clip(out_a * 255, 0, 255)]).astype(np.uint8)
