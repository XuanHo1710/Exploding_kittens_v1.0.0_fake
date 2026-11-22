"""Non-humanoid rigs: quadruped (thú bốn chân / rồng / ngựa), blob (slime), serpent (rắn biển),
arthropod (bọ cạp / cua / nhện), flyer (chim / dơi / bướm), floater (u linh / sứa / bạch tuộc).

Mỗi hàm `build_*(spec, pose)` trả `pixel_rig.Model` trong hệ tọa độ nhân vật (+z = phía trước mặt).
Kích thước tham chiếu `S` ~ chiều cao vai/thân; mọi số đo là bội số của S.

Ví dụ (chạy từ thư mục gốc): py tools/expedition/build_units.py --only gale_wolf,chicken
"""

from __future__ import annotations

import math

from pixel_rig import Model, m_apply, m_mul, rot_x, rot_y, rot_z, v_add, v_lerp, v_mul
from rig_humanoid import _ring

G_BODY, G_LEG_FL, G_LEG_FR, G_LEG_BL, G_LEG_BR, G_HEAD, G_TAIL, G_WING_L, G_WING_R, G_FX, G_EXTRA = range(20, 31)


def _eyes(m, c, R, r, side_off, fwd, up, col, size=1, both=True):
    for side in ((-1, 1) if both else (1,)):
        m.px(v_add(c, m_apply(R, (side * side_off * r, up * r, fwd * r))), col, bias=r * 0.5, size=size)


# ---------------------------------------------------------------- quadruped


def build_quadruped(spec: dict, pose: dict) -> Model:
    g = pose.get
    S = spec["S"]
    mats = spec["mats"]
    body = mats["body"]
    belly = mats.get("belly", body)
    dark = mats.get("dark", body)
    m = Model()
    bl = spec.get("body_len", 0.55) * S
    leg_k = spec.get("leg", 1.0)
    lu, ll = 0.23 * S * leg_k, 0.22 * S * leg_k
    h0 = (lu + ll) * 0.92 + spec.get("paw", 0.05) * S
    cr, hr_, br = spec.get("chest_r", 0.17) * S, spec.get("hip_r", 0.15) * S, spec.get("belly_r", 0.13) * S
    bw = spec.get("width", 0.09) * S
    Rb = rot_x(-g("body_p", 0.0))
    root = (0.0, h0 + g("bob", 0.0) * S, g("root_z", 0.0) * S)
    Hc = v_add(root, (0.0, 0.0, -bl / 2))

    def B(x, y, z):  # body frame anchored at hips
        return v_add(Hc, m_apply(Rb, (x, y, z + 0.0)))

    Cc = B(0.0, spec.get("chest_up", 0.02) * S, bl)
    # legs
    ph = g("phase", 0.0)
    legs = (
        ("fl", -1, Cc, True, G_LEG_FL), ("fr", 1, Cc, True, G_LEG_FR),
        ("bl", -1, Hc, False, G_LEG_BL), ("br", 1, Hc, False, G_LEG_BR),
    )
    for name, side, base, front, grp in legs:
        sw = g(name, 0.0)
        bend = g(name + "_k", 0.0)
        top = v_add(base, m_apply(Rb, (side * bw, -0.06 * S, 0.0)))
        tilt = g("body_p", 0.0) if front else 0.0
        if front:
            d1 = (side * 0.06, -math.cos(math.radians(sw + tilt)), math.sin(math.radians(sw + tilt)))
            k = v_add(top, v_mul(d1, lu))
            a2 = sw + tilt - bend
            d2 = (side * 0.02, -math.cos(math.radians(a2)), math.sin(math.radians(a2)))
            a = v_add(k, v_mul(d2, ll))
        else:
            a1 = sw + 22
            d1 = (side * 0.06, -math.cos(math.radians(a1)), math.sin(math.radians(a1)))
            k = v_add(top, v_mul(d1, lu * 0.95))
            a2 = sw - 32 - bend
            d2 = (side * 0.02, -math.cos(math.radians(a2)), math.sin(math.radians(a2)))
            a = v_add(k, v_mul(d2, ll * 1.02))
        r0 = (0.10 if not front else 0.075) * S * spec.get("leg_r", 1.0)
        r1 = 0.045 * S * spec.get("leg_r", 1.0)
        m.cap(top, k, r0, r1, body, grp)
        m.cap(k, a, r1, r1 * 0.8, mats.get("legs", body), grp)
        hoof = mats.get("hoof", dark)
        m.cap(a, v_add(a, (0.0, -0.01 * S, 0.05 * S)), r1 * 0.95, r1 * 0.85, hoof, grp)
    # body
    m.ball(Cc, cr, body, G_BODY)
    m.ball(B(0.0, 0.0, 0.0), hr_, body, G_BODY)
    m.cap(B(0, -0.02 * S, 0.08 * S), B(0, -0.03 * S, bl - 0.05 * S), br, br * 1.05, belly, G_BODY)
    m.cap(B(0, 0.02 * S, 0.0), Cc, hr_ * 0.95, cr * 0.95, body, G_BODY)
    if spec.get("hump"):
        m.ball(B(0, 0.16 * S, bl * 0.45), 0.13 * S, body, G_BODY)
    if spec.get("shell"):
        sm = mats["shell"]
        m.ell(B(0, 0.06 * S, bl * 0.5), 0.40 * S, 0.24 * S, sm, G_BODY)
        for i in range(-1, 2):
            m.ball(B(i * 0.12 * S, 0.24 * S, bl * 0.5 + i * 0.05 * S), 0.07 * S, sm, G_BODY)
    if spec.get("wool"):
        wm = mats["wool"]
        for i in range(5):
            z = bl * i / 4
            for side in (-1, 1):
                m.ball(B(side * 0.08 * S, 0.06 * S + 0.03 * S * (i % 2), z), 0.14 * S, wm, G_BODY)
    if spec.get("spines"):
        sp = mats.get("accent", dark)
        for i in range(5):
            b = B(0, 0.12 * S, bl * (0.1 + 0.2 * i))
            m.cap(b, v_add(b, m_apply(Rb, (0, 0.12 * S, -0.04 * S))), 0.035 * S, 0.008 * S, sp, G_BODY)
    # neck & head
    na = math.radians(spec.get("neck_angle", 40) + g("neck_p", 0.0))
    nl = spec.get("neck_len", 0.24) * S
    nb = v_add(Cc, m_apply(Rb, (0.0, 0.06 * S, 0.06 * S)))
    nd = m_apply(Rb, (0.0, math.sin(na), math.cos(na)))
    turn = g("head_y", 0.0)
    nd = m_apply(rot_y(turn * 0.5), nd)
    ne = v_add(nb, v_mul(nd, nl))
    m.cap(nb, ne, spec.get("neck_r", 0.09) * S, spec.get("neck_r", 0.09) * S * 0.85, mats.get("neck", body), G_HEAD)
    if spec.get("mane"):
        mm = mats.get("mane", body)
        m.cap(v_add(nb, (0, 0.06 * S, -0.03 * S)), v_add(ne, (0, 0.05 * S, -0.02 * S)), spec["mane"] * S, spec["mane"] * S * 0.8, mm, G_HEAD)
    hr = spec.get("head_r", 0.10) * S
    Rhd = m_mul(m_mul(m_mul(Rb, rot_y(turn)), rot_x(-g("head_p", 0.0) - spec.get("head_tilt", 0.0))), IDENT3)
    hc = v_add(ne, m_apply(Rhd, (0.0, hr * 0.3, hr * 0.5)))

    def Hd(x, y, z):
        return v_add(hc, m_apply(Rhd, (x * hr, y * hr, z * hr)))

    head_m = mats.get("head", body)
    m.ball(hc, hr, head_m, G_HEAD)
    sn = spec.get("snout", 1.3)
    snr = spec.get("snout_r", 0.55)
    jaw = g("jaw", 0.0)
    if sn > 0:
        tipp = Hd(0, -0.35 - 0.1 * sn, 0.6 + sn)
        m.cap(Hd(0, -0.1, 0.5), tipp, hr * snr, hr * snr * 0.72, mats.get("snout", head_m), G_HEAD)
        m.px(v_add(tipp, m_apply(Rhd, (0, hr * 0.15, hr * snr * 0.7))), dark.ramp[3], bias=hr * 0.8, size=max(1, int(hr / 6)))
        if jaw:
            ja = math.radians(jaw)
            jt = Hd(0, -0.45 - math.sin(ja) * sn, 0.55 + math.cos(ja) * sn * 0.9)
            m.cap(Hd(0, -0.45, 0.4), jt, hr * snr * 0.6, hr * snr * 0.4, mats.get("mouth", dark), G_HEAD)
            if spec.get("fangs"):
                m.line(Hd(0.2, -0.45, 0.6 + sn * 0.7), Hd(0.2, -0.75, 0.6 + sn * 0.7), (240, 240, 232), bias=hr)
    eye = spec.get("eye_rgb", (24, 16, 32))
    es = max(1, int(round(hr / 8)))
    _eyes(m, hc, Rhd, hr, 0.55, 0.62, 0.22, eye, es)
    if hr >= 6:   # catch-light in each eye, like the hand-drawn wolf
        for side in (-1, 1):
            m.px(v_add(hc, m_apply(Rhd, (side * 0.50 * hr, 0.30 * hr, 0.66 * hr))), (236, 232, 220), bias=hr * 0.55, size=1)
    ears = spec.get("ears", "pointed")
    inner = mats.get("belly", head_m)
    if ears in ("pointed", "long"):
        for side in (-1, 1):
            if ears == "pointed":
                m.cap(Hd(side * 0.56, 0.78, -0.08), Hd(side * 0.72, 1.40, -0.26), hr * 0.18, hr * 0.04, inner, G_HEAD)
            else:
                m.cap(Hd(side * 0.36, 0.9, -0.12), Hd(side * 0.45, 2.4, -0.80), hr * 0.16, hr * 0.10, inner, G_HEAD)
    em = mats.get("ear", head_m)
    for side in (-1, 1):
        if ears == "pointed":
            m.cap(Hd(side * 0.55, 0.7, -0.15), Hd(side * 0.75, 1.55, -0.35), hr * 0.32, hr * 0.06, em, G_HEAD)
        elif ears == "long":
            m.cap(Hd(side * 0.35, 0.8, -0.2), Hd(side * 0.45, 2.6, -0.9), hr * 0.3, hr * 0.18, em, G_HEAD)
        elif ears == "floppy":
            m.cap(Hd(side * 0.75, 0.4, -0.2), Hd(side * 1.25, -0.2, -0.3), hr * 0.28, hr * 0.18, em, G_HEAD)
        elif ears == "round":
            m.ball(Hd(side * 0.7, 0.75, -0.2), hr * 0.3, em, G_HEAD)
    horns = spec.get("horns")
    hm = mats.get("horn", dark)
    if horns == "antlers":
        for side in (-1, 1):
            b = Hd(side * 0.45, 0.85, -0.2)
            p1 = Hd(side * 1.0, 1.9, -0.5)
            p2 = Hd(side * 1.6, 2.9, -0.4)
            m.chain([b, p1, p2], hr * 0.16, hr * 0.07, hm, G_HEAD)
            m.cap(p1, Hd(side * 0.7, 2.6, 0.1), hr * 0.1, hr * 0.05, hm, G_HEAD)
            m.cap(Hd(side * 1.3, 2.4, -0.45), Hd(side * 2.1, 2.7, -0.9), hr * 0.09, hr * 0.04, hm, G_HEAD)
            m.cap(p2, Hd(side * 1.4, 3.5, 0.0), hr * 0.08, hr * 0.03, hm, G_HEAD)
    elif horns == "curved":
        for side in (-1, 1):
            m.chain([Hd(side * 0.45, 0.7, 0.0), Hd(side * 0.95, 1.2, -0.6), Hd(side * 1.15, 0.6, -1.1), Hd(side * 1.0, 0.0, -0.8)], hr * 0.28, hr * 0.1, hm, G_HEAD)
    elif horns == "straight":
        for side in (-1, 1):
            m.cap(Hd(side * 0.4, 0.7, 0.1), Hd(side * 0.6, 1.8, -0.5), hr * 0.18, hr * 0.04, hm, G_HEAD)
    elif horns == "cow":
        for side in (-1, 1):
            m.chain([Hd(side * 0.6, 0.6, 0.0), Hd(side * 1.2, 0.8, 0.0), Hd(side * 1.4, 1.2, 0.2)], hr * 0.18, hr * 0.06, hm, G_HEAD)
    elif horns == "dragon":
        for side in (-1, 1):
            m.chain([Hd(side * 0.45, 0.7, -0.3), Hd(side * 0.7, 1.3, -1.2), Hd(side * 0.75, 1.5, -2.1)], hr * 0.26, hr * 0.05, hm, G_HEAD)
    if spec.get("tusks"):
        for side in (-1, 1):
            m.cap(Hd(side * 0.35, -0.6, 1.2), Hd(side * 0.55, 0.0, 1.7), hr * 0.14, hr * 0.05, hm, G_HEAD)
    if spec.get("comb"):
        cm = mats["comb"]
        m.ball(Hd(0, 1.0, 0.1), hr * 0.38, cm, G_HEAD)
        m.ball(Hd(0, 0.9, 0.5), hr * 0.3, cm, G_HEAD)
        m.ball(Hd(0, -0.9, 0.9), hr * 0.25, cm, G_HEAD)
    if spec.get("beak"):
        m.cap(Hd(0, -0.05, 0.7), Hd(0, -0.25, 1.5), hr * 0.32, hr * 0.06, mats["beak"], G_HEAD)
    if spec.get("crest_glow"):
        m.ball(Hd(0, 1.0, -0.2), hr * 0.3, mats["glow"], G_HEAD)
    # fur tufts: ruff on the neck and chest, a ragged crest along the spine, cheek tufts
    if spec.get("fur"):
        fm = mats.get("mane", body)
        rng_n = 0
        for i in range(7):                                   # spine crest
            t = i / 6
            base = v_lerp(v_add(nb, (0.0, 0.05 * S, 0.0)), B(0.0, 0.10 * S, 0.05 * S), t)
            tip = v_add(base, m_apply(Rb, (0.02 * S * math.sin(i * 2.1), 0.05 * S, -0.07 * S)))
            m.cap(base, tip, 0.045 * S * (1 - 0.4 * t), 0.006 * S, fm if t < 0.5 else body, G_BODY)
        for i in range(6):                                   # chest / throat ruff hanging down
            a = -0.9 + 1.8 * i / 5
            base = v_add(Cc, m_apply(Rb, (math.sin(a) * 0.10 * S, 0.02 * S, 0.10 * S)))
            tip = v_add(base, m_apply(Rb, (math.sin(a) * 0.04 * S, -0.12 * S, 0.03 * S)))
            m.cap(base, tip, 0.04 * S, 0.006 * S, mats.get("belly", body), G_BODY)
        for side in (-1, 1):                                 # cheek tufts
            m.cap(Hd(side * 0.70, -0.30, 0.10), Hd(side * 1.15, -0.55, -0.35), hr * 0.30, hr * 0.05, fm, G_HEAD)
        for side, base in ((-1, Hc), (1, Hc)):               # haunch fur
            m.cap(B(side * 0.11 * S, 0.0, 0.0), B(side * 0.14 * S, -0.12 * S, -0.06 * S), 0.05 * S, 0.008 * S, body, G_BODY)
        rng_n += 1

    # tail
    tail = spec.get("tail")
    if tail:
        tm = mats.get("tail", body)
        tb = B(0.0, 0.05 * S, -0.10 * S)
        ta = math.radians(spec.get("tail_angle", 20) + g("tail_p", 0.0))
        wag = g("tail_wag", 0.0)
        n_tails = spec.get("tails", 1)
        for ti in range(n_tails):
            spread = (ti - (n_tails - 1) / 2) * 0.5
            pts = [tb]
            tl = spec.get("tail_len", 0.40) * S
            for i in range(1, 5):
                t = i / 4
                a = ta + spread * 0.3 * t
                x = math.sin(wag + t * 1.5) * 0.12 * S * t + spread * 0.25 * S * t
                curl = spec.get("tail_curl", 0.0) * t * t
                pts.append(v_add(tb, m_apply(Rb, (x, math.sin(a) * tl * t + curl * S, -math.cos(a) * tl * t))))
            r0 = {"bushy": 0.07, "thin": 0.025, "short": 0.05, "lizard": 0.07, "puff": 0.06, "plume": 0.05, "dragon": 0.08}.get(tail, 0.04) * S
            r1 = {"bushy": 0.05, "thin": 0.012, "short": 0.03, "lizard": 0.01, "puff": 0.06, "plume": 0.09, "dragon": 0.01}.get(tail, 0.02) * S
            if tail == "short":
                pts = pts[:3]
            if tail == "puff":
                m.ball(pts[1], r0, tm, G_TAIL)
                continue
            if tail == "bushy":
                m.cap(pts[0], pts[1], r0 * 0.6, r0, tm, G_TAIL)
                m.chain(pts[1:], r0 * 1.1, r1, tm, G_TAIL)
                m.ball(pts[-1], r1 * 1.2, mats.get("tail_tip", tm), G_TAIL)
            else:
                m.chain(pts, r0, r1, tm, G_TAIL)
            if tail == "dragon":
                tp = pts[-1]
                m.tri(tp, v_add(tp, m_apply(Rb, (0.06 * S, 0.04 * S, -0.08 * S))), v_add(tp, m_apply(Rb, (-0.06 * S, 0.04 * S, -0.08 * S))), mats.get("wing", tm), G_TAIL)
    # wings (dragon / griffin)
    if spec.get("wings"):
        wm = mats["wing"]
        flap = g("flap", 0.0)
        span = spec.get("wing_span", 0.75) * S
        for side, grp in ((-1, G_WING_L), (1, G_WING_R)):
            root = B(side * 0.08 * S, 0.12 * S, bl * 0.75)
            a0 = math.radians(20 + flap * 40)
            elbow = v_add(root, (side * math.cos(a0) * span * 0.55, math.sin(a0) * span * 0.55 + 0.05 * S, -0.10 * S))
            tipw = v_add(elbow, (side * math.cos(a0 + 0.6) * span * 0.5, math.sin(a0 + 0.6) * span * 0.5, -0.18 * S))
            m.cap(root, elbow, 0.03 * S, 0.022 * S, mats.get("wing_bone", body), grp)
            m.cap(elbow, tipw, 0.022 * S, 0.01 * S, mats.get("wing_bone", body), grp)
            trail = [B(side * 0.05 * S, 0.06 * S, bl * 0.25), v_add(elbow, (side * 0.08 * S, -0.22 * S, -0.30 * S)), v_add(tipw, (0, -0.15 * S, -0.10 * S))]
            m.tri(root, elbow, trail[0], wm, grp)
            m.tri(elbow, trail[1], trail[0], wm, grp)
            m.tri(elbow, tipw, trail[1], wm, grp)
            m.tri(tipw, trail[2], trail[1], wm, grp)
    if spec.get("rider_seat"):
        pose["_seat"] = B(0.0, 0.18 * S, bl * 0.55)
    _fx_simple(m, pose, S, Cc, hc, mats)
    return m


IDENT3 = ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))


def _fx_simple(m, pose, S, body_c, head_c, mats):
    glow = mats.get("fx") or mats.get("glow")
    if not glow:
        return
    ph = pose.get("phase", 0.0)
    for k in pose.get("fx", ()):
        if k in ("bite", "slash"):
            c = v_add(head_c, (0.0, 0.0, 0.18 * S))
            pts = []
            for i in range(7):
                a = math.radians(120 - 240 * i / 6)
                pts.append(v_add(c, (0.06 * S * math.cos(a) * 0.4, 0.22 * S * math.sin(a) * 0.8, 0.18 * S * math.cos(a))))
            for i in range(6):
                w = math.sin(math.pi * (i + 0.5) / 6)
                m.cap(pts[i], pts[i + 1], 0.016 * S * w + 0.3, 0.016 * S * w + 0.3, glow, G_FX)
        elif k == "ring":
            _ring(m, (body_c[0], 0.01 * S, body_c[2] - 0.2 * S), 0.6 * S, 0.5 * S, IDENT3, glow, 0.012 * S + 0.4, G_FX, n=16)
        elif k == "stars":
            for i in range(3):
                a = ph + i * 2.09
                m.ball(v_add(head_c, (math.cos(a) * 0.15 * S, 0.18 * S, math.sin(a) * 0.15 * S)), 0.025 * S, mats.get("fx_core", glow), G_FX)
        elif k == "breath":
            for i in range(5):
                t = (i + 1) / 5
                m.ball(v_add(head_c, (0.0, -0.05 * S * t, 0.2 * S + 0.55 * S * t)), 0.04 * S + 0.08 * S * t, glow if i % 2 else mats.get("fx_core", glow), G_FX)
        elif k == "aura":
            for i in range(6):
                a = ph + i * math.pi / 3
                m.ball(v_add(body_c, (math.cos(a) * 0.45 * S, 0.1 * S + 0.3 * S * ((i * 0.37 + ph) % 1.0), math.sin(a) * 0.45 * S)), 0.03 * S, glow, G_FX)


# ---------------------------------------------------------------- blob / slime


def build_blob(spec, pose):
    g = pose.get
    S = spec["S"]
    mats = spec["mats"]
    m = Model()
    sq = g("squash", 0.0)
    rx = 0.36 * S * (1 + sq * 0.35)
    ry = 0.30 * S * (1 - sq * 0.4)
    c = (0.0, ry, g("root_z", 0.0) * S)
    m.ell(c, rx, ry, mats["body"], G_BODY)
    m.ell(v_add(c, (0.0, -0.08 * S, 0.06 * S)), rx * 0.92, ry * 0.75, mats["body"], G_BODY)
    if mats.get("core"):
        m.ball(v_add(c, (0.06 * S, 0.02 * S, 0.0)), 0.09 * S, mats["core"], G_EXTRA)
    if spec.get("sprout"):
        lm = mats["leaf"]
        top = v_add(c, (0.0, ry * 0.95, 0.0))
        stem = v_add(top, (0.02 * S, 0.12 * S, 0.0))
        m.cap(top, stem, 0.02 * S, 0.015 * S, lm, G_HEAD)
        for side in (-1, 1):
            m.ell(v_add(stem, (side * 0.08 * S, 0.02 * S, 0.0)), 0.08 * S, 0.035 * S, lm, G_HEAD)
        if mats.get("flower"):
            m.ball(v_add(stem, (0, 0.04 * S, 0)), 0.04 * S, mats["flower"], G_HEAD)
    for side in (-1, 1):
        e = v_add(c, (side * 0.11 * S, 0.06 * S, rx * 0.9))
        m.px(e, spec.get("eye_rgb", (24, 16, 32)), bias=0.2 * S, size=max(1, int(S / 22)))
    if g("jaw", 0):
        m.px(v_add(c, (0.0, -0.06 * S, rx * 0.92)), (40, 16, 32), bias=0.2 * S, size=max(1, int(S / 16)))
    _fx_simple(m, pose, S, c, v_add(c, (0, 0.1 * S, 0)), mats)
    return m


# ---------------------------------------------------------------- serpent / wyrm / eel


def build_serpent(spec, pose):
    g = pose.get
    S = spec["S"]
    mats = spec["mats"]
    m = Model()
    n = 16
    ph = g("phase", 0.0)
    rise = max(0.05, spec.get("rise", 0.9) + g("rise", 0.0))
    strike = g("strike", 0.0)
    pts = []
    n_neck = 7
    coil_c = (0.0, 0.0, -0.16 * S)
    for i in range(n):
        if i < n_neck:
            # rising S-curved neck: head (u=0) -> coil (u=1)
            u = i / (n_neck - 1)
            y = rise * S * (1 - u) ** 1.15 * 0.62 + 0.07 * S
            z = (0.10 + strike * 0.38) * S * (1 - u) ** 1.5 - 0.10 * S * math.sin(u * math.pi) * (1 - strike * 0.5)
            x = 0.04 * S * math.sin(ph + u * 3)
        else:
            # tail coiled on the ground around coil_c, shrinking spiral
            u = (i - n_neck) / (n - n_neck - 1)
            a = math.pi * 0.5 + u * 1.75 * math.pi + 0.15 * math.sin(ph)
            rad = 0.26 * S * (1 - 0.45 * u)
            x = coil_c[0] + math.cos(a) * rad - 0.0
            z = coil_c[2] + math.sin(a) * rad * 0.9 - 0.26 * S * 0.9 * 1.0 + 0.26 * S * 0.9
            y = 0.07 * S + 0.03 * S * (1 - u)
            if i == n_neck:
                x, z = 0.0, 0.10 * S + coil_c[2]
        pts.append((x, y, z))
    body = mats["body"]
    r_max = spec.get("thick", 0.10) * S
    for i in range(n - 1):
        t = i / (n - 1)
        ra = r_max * (0.85 + 0.3 * math.sin(math.pi * min(1, t * 1.6))) * (1 - t * 0.7)
        rb = r_max * (0.85 + 0.3 * math.sin(math.pi * min(1, (t + 1 / (n - 1)) * 1.6))) * (1 - (t + 1 / (n - 1)) * 0.7)
        m.cap(pts[i], pts[i + 1], ra, rb, body if i % 2 == 0 else mats.get("body2", body), G_BODY)
        if spec.get("fins") and i % 2 == 1 and i < n - 2:
            fm = mats["fin"]
            p = pts[i]
            m.tri(v_add(p, (0, ra * 0.6, 0)), v_add(p, (0, ra * 1.9, -0.04 * S)), v_add(pts[i + 1], (0, ra * 0.6, 0)), fm, G_EXTRA)
    head = pts[0]
    hr = spec.get("head_r", 0.12) * S
    Rhd = rot_x(-g("head_p", 10.0))
    m.ball(head, hr, mats.get("head", body), G_HEAD)
    jaw = g("jaw", 0.0)
    snout = v_add(head, m_apply(Rhd, (0.0, -0.1 * hr, 1.5 * hr)))
    m.cap(head, snout, hr * 0.8, hr * 0.5, mats.get("head", body), G_HEAD)
    if jaw:
        ja = math.radians(jaw)
        m.cap(v_add(head, (0, -0.4 * hr, 0.2 * hr)), v_add(head, m_apply(Rhd, (0, -0.4 * hr - math.sin(ja) * 1.3 * hr, math.cos(ja) * 1.3 * hr))), hr * 0.45, hr * 0.3, mats.get("mouth", body), G_HEAD)
    _eyes(m, head, Rhd, hr, 0.6, 0.5, 0.35, spec.get("eye_rgb", (248, 232, 120)), max(1, int(hr / 7)))
    if spec.get("crest"):
        cm = mats["fin"]
        for i in range(3):
            b = v_add(head, m_apply(Rhd, (0, hr * 0.7, -hr * 0.3 * i)))
            m.cap(b, v_add(b, m_apply(Rhd, (0, hr * (1.4 - 0.3 * i), -hr * 0.9))), hr * 0.18, hr * 0.04, cm, G_HEAD)
    if spec.get("horns"):
        for side in (-1, 1):
            m.chain([v_add(head, (side * hr * 0.5, hr * 0.6, -hr * 0.2)), v_add(head, (side * hr * 0.9, hr * 1.3, -hr * 1.0)), v_add(head, (side * hr * 0.8, hr * 1.5, -hr * 1.8))], hr * 0.22, hr * 0.05, mats.get("horn", body), G_HEAD)
    if spec.get("crown"):
        _ring(m, v_add(head, (0, hr * 0.85, -hr * 0.1)), hr * 0.7, hr * 0.6, IDENT3, mats["crown"], hr * 0.1, G_HEAD, n=8)
        for a in range(0, 360, 60):
            ra = math.radians(a)
            b = v_add(head, (math.cos(ra) * hr * 0.7, hr * 0.9, math.sin(ra) * hr * 0.6 - hr * 0.1))
            m.cap(b, v_add(b, (0, hr * 0.5, 0)), hr * 0.1, hr * 0.03, mats["crown"], G_HEAD)
    _fx_simple(m, pose, S, pts[4], head, mats)
    return m


# ---------------------------------------------------------------- arthropods (scorpion / crab / spider / beetle)


def build_arthropod(spec, pose):
    g = pose.get
    S = spec["S"]
    mats = spec["mats"]
    shell = mats["body"]
    joint = mats.get("legs", shell)
    m = Model()
    kind = spec.get("kind", "scorpion")
    ph = g("phase", 0.0)
    h = 0.20 * S + g("bob", 0.0) * S
    z0 = g("root_z", 0.0) * S
    Rb = rot_x(-g("body_p", 0.0))

    def B(x, y, z):
        return v_add((0.0, h, z0), m_apply(Rb, (x, y, z)))

    if kind == "crab":
        m.ell(B(0, 0.04 * S, 0), 0.34 * S, 0.17 * S, shell, G_BODY)
        m.ell(B(0, 0.0, 0.04 * S), 0.30 * S, 0.14 * S, mats.get("belly", shell), G_BODY)
    elif kind == "spider":
        m.ball(B(0, 0.04 * S, 0.12 * S), 0.16 * S, shell, G_BODY)
        m.ell(B(0, 0.12 * S, -0.22 * S), 0.24 * S, 0.22 * S, mats.get("abdomen", shell), G_BODY)
        if mats.get("mark"):
            m.ball(B(0, 0.26 * S, -0.26 * S), 0.07 * S, mats["mark"], G_EXTRA)
    else:
        for i in range(4):
            m.ball(B(0, 0.03 * S, 0.16 * S - i * 0.12 * S), (0.15 - i * 0.012) * S, shell if i % 2 == 0 else mats.get("body2", shell), G_BODY)
    # legs
    n_pairs = 4
    for i in range(n_pairs):
        for side in (-1, 1):
            z = (0.12 - i * 0.10) * S if kind != "crab" else (0.06 - i * 0.07) * S
            if kind == "spider":
                z = (0.18 - i * 0.07) * S
            gait = math.sin(ph + i * 1.6 + (0 if side > 0 else math.pi)) * g("walk", 0.0)
            base = B(side * 0.12 * S, 0.0, z)
            spread = (0.32 if kind != "spider" else 0.38) * S
            knee = v_add(base, (side * spread * 0.6, 0.16 * S, (gait * 0.08 + (0.1 - i * 0.06)) * S))
            foot = (base[0] + side * spread * 1.05, 0.0, base[2] + (gait * 0.12 + (0.14 - i * 0.09)) * S)
            if kind == "spider":
                knee = v_add(base, (side * spread * 0.6, 0.30 * S, (gait * 0.1 + (0.12 - i * 0.07)) * S))
            m.cap(base, knee, 0.035 * S, 0.028 * S, joint, G_LEG_FL if side < 0 else G_LEG_FR)
            m.cap(knee, foot, 0.028 * S, 0.012 * S, joint, G_LEG_FL if side < 0 else G_LEG_FR)
    # head & claws
    head_z = 0.30 * S if kind == "scorpion" else (0.24 * S if kind == "spider" else 0.18 * S)
    hc = B(0, 0.04 * S, head_z if kind != "crab" else 0.16 * S)
    if kind != "crab":
        m.ball(hc, 0.10 * S, mats.get("head", shell), G_HEAD)
    eye = spec.get("eye_rgb", (248, 64, 64))
    if kind == "spider":
        for ex, ey in ((-0.04, 0.05), (0.04, 0.05), (-0.07, 0.02), (0.07, 0.02)):
            m.px(v_add(hc, (ex * S, ey * S, 0.09 * S)), eye, bias=0.05 * S, size=max(1, int(S / 60)))
        for side in (-1, 1):
            m.cap(v_add(hc, (side * 0.03 * S, -0.04 * S, 0.06 * S)), v_add(hc, (side * 0.02 * S, -0.12 * S, 0.1 * S)), 0.02 * S, 0.008 * S, mats.get("fang", joint), G_HEAD)
    else:
        for side in (-1, 1):
            stalk = v_add(hc, (side * 0.06 * S, 0.09 * S, 0.04 * S))
            if kind == "crab":
                m.cap(v_add(hc, (side * 0.06 * S, 0.0, 0.0)), stalk, 0.012 * S, 0.012 * S, joint, G_HEAD)
                m.ball(stalk, 0.022 * S, mats.get("eye", shell), G_HEAD)
            else:
                m.px(v_add(hc, (side * 0.045 * S, 0.04 * S, 0.08 * S)), eye, bias=0.05 * S, size=max(1, int(S / 50)))
    if kind in ("scorpion", "crab"):
        pinch = g("pinch", 0.0)
        reach = g("reach", 0.0)
        for side in (-1, 1):
            sh = B(side * 0.14 * S, 0.02 * S, (0.24 if kind == "scorpion" else 0.12) * S)
            el = v_add(sh, (side * 0.16 * S, 0.06 * S + reach * 0.1 * S, (0.12 + reach * 0.15) * S))
            hand = v_add(el, (side * 0.02 * S, 0.04 * S + reach * 0.06 * S, (0.16 + reach * 0.15) * S))
            cm = mats.get("claw", shell)
            m.cap(sh, el, 0.04 * S, 0.035 * S, joint, G_EXTRA)
            m.cap(el, hand, 0.035 * S, 0.05 * S, cm, G_EXTRA)
            m.ell(hand, 0.075 * S, 0.06 * S, cm, G_EXTRA)
            op = 0.06 + pinch * 0.06
            m.cap(hand, v_add(hand, (side * -0.02 * S, op * S, 0.12 * S)), 0.035 * S, 0.01 * S, cm, G_EXTRA)
            m.cap(hand, v_add(hand, (side * -0.02 * S, -op * S * 0.5, 0.11 * S)), 0.03 * S, 0.01 * S, cm, G_EXTRA)
    if kind == "scorpion":
        sting = g("sting", 0.0)
        pts = [B(0, 0.06 * S, -0.30 * S)]
        for i in range(1, 7):
            t = i / 6
            a = math.radians(-10 + 200 * t + sting * 40 * t)
            pts.append(v_add(pts[0], (math.sin(ph * 0.5) * 0.02 * S * t, math.sin(a) * 0.34 * S * (0.5 + t * 0.5) + 0.25 * S * t, -math.cos(a) * 0.22 * S * (0.5 + t * 0.5) - 0.05 * S)))
        for i in range(6):
            m.cap(pts[i], pts[i + 1], (0.07 - i * 0.006) * S, (0.065 - i * 0.006) * S, shell if i % 2 == 0 else mats.get("body2", shell), G_TAIL)
        st = pts[-1]
        m.ball(st, 0.06 * S, mats.get("sting", shell), G_TAIL)
        m.cap(st, v_add(st, (0, -0.04 * S, 0.12 * S)), 0.03 * S, 0.004 * S, mats.get("sting", shell), G_TAIL)
    _fx_simple(m, pose, S, B(0, 0, 0), hc, mats)
    return m


# ---------------------------------------------------------------- flyers (bird / owl / bat / moth / chicken)


def build_flyer(spec, pose):
    g = pose.get
    S = spec["S"]
    mats = spec["mats"]
    body = mats["body"]
    m = Model()
    kind = spec.get("kind", "bird")
    flap = g("flap", 0.0)
    hover = spec.get("hover", 0.35) * S + g("bob", 0.0) * S
    perched = spec.get("perched", False)
    if perched:
        hover = spec.get("body_r", 0.13) * S * 0.9 + 0.08 * S + g("bob", 0.0) * S
    z0 = g("root_z", 0.0) * S
    Rb = rot_x(-g("body_p", spec.get("body_p", 0.0)))

    def B(x, y, z):
        return v_add((0.0, hover, z0), m_apply(Rb, (x, y, z)))

    br = spec.get("body_r", 0.13) * S
    if kind == "moth":
        m.cap(B(0, 0, 0.06 * S), B(0, -0.02 * S, -0.16 * S), br * 0.7, br * 0.5, body, G_BODY)
    else:
        m.ell(B(0, 0, 0), br, br * 1.1, body, G_BODY)
        m.ell(B(0, -0.02 * S, 0.04 * S), br * 0.85, br * 0.9, mats.get("belly", body), G_BODY)
    hr = spec.get("head_r", 0.09) * S
    hc = B(0, br * 0.95 + hr * 0.4, 0.04 * S) if kind in ("owl", "bat") else B(0, br * 0.8, br * 0.6)
    m.ball(hc, hr, mats.get("head", body), G_HEAD)
    if kind == "owl":
        m.ell(v_add(hc, (0, -0.01 * S, hr * 0.6)), hr * 0.8, hr * 0.6, mats.get("face", body), G_HEAD)
        for side in (-1, 1):
            m.cap(v_add(hc, (side * hr * 0.55, hr * 0.6, 0)), v_add(hc, (side * hr * 0.8, hr * 1.3, -hr * 0.2)), hr * 0.25, hr * 0.05, mats.get("head", body), G_HEAD)
            m.px(v_add(hc, (side * hr * 0.38, hr * 0.05, hr * 0.95)), spec.get("eye_rgb", (248, 200, 64)), bias=hr, size=max(1, int(hr / 4)))
    elif kind == "bat":
        for side in (-1, 1):
            m.cap(v_add(hc, (side * hr * 0.5, hr * 0.6, 0)), v_add(hc, (side * hr * 0.9, hr * 1.6, -hr * 0.2)), hr * 0.35, hr * 0.05, mats.get("head", body), G_HEAD)
        _eyes(m, hc, IDENT3, hr, 0.4, 0.9, 0.1, spec.get("eye_rgb", (248, 64, 64)), max(1, int(hr / 5)))
        if g("jaw", 0):
            m.line(v_add(hc, (-hr * 0.2, -hr * 0.5, hr * 0.9)), v_add(hc, (-hr * 0.2, -hr * 0.9, hr * 0.9)), (240, 240, 232), bias=hr)
    elif kind == "moth":
        for side in (-1, 1):
            m.chain([v_add(hc, (side * hr * 0.3, hr * 0.6, hr * 0.3)), v_add(hc, (side * hr * 1.2, hr * 1.8, hr * 0.8)), v_add(hc, (side * hr * 2.0, hr * 2.2, hr * 0.4))], hr * 0.12, hr * 0.06, mats.get("legs", body), G_HEAD)
        _eyes(m, hc, IDENT3, hr, 0.55, 0.7, 0.1, spec.get("eye_rgb", (248, 248, 248)), max(1, int(hr / 5)))
    else:
        _eyes(m, hc, IDENT3, hr, 0.6, 0.55, 0.2, spec.get("eye_rgb", (24, 16, 32)), max(1, int(hr / 6)))
    if mats.get("beak"):
        m.cap(v_add(hc, (0, -hr * 0.1, hr * 0.7)), v_add(hc, (0, -hr * 0.35, hr * (1.5 if kind != "owl" else 1.0))), hr * 0.3, hr * 0.06, mats["beak"], G_HEAD)
    if spec.get("comb"):
        cm = mats["comb"]
        for i in range(3):
            m.ball(v_add(hc, (0, hr * (0.9 + 0.1 * (i % 2)), hr * (0.4 - 0.35 * i))), hr * 0.32, cm, G_HEAD)
        m.ball(v_add(hc, (0, -hr * 0.8, hr * 0.7)), hr * 0.25, cm, G_HEAD)
    # wings
    wm = mats.get("wing", body)
    span = spec.get("wing_span", 0.5) * S
    for side, grp in ((-1, G_WING_L), (1, G_WING_R)):
        root = B(side * br * 0.7, br * 0.3, 0.02 * S)
        if perched and not g("flap_on", False):
            m.ell(B(side * br * 0.85, 0.0, -0.02 * S), br * 0.45, br * 0.9, wm, grp)
            continue
        a = math.radians(10 + flap * 60)
        if kind == "moth":
            up = v_add(root, (side * math.cos(a) * span, math.sin(a) * span * 0.9 + 0.1 * S, 0.06 * S))
            lo = v_add(root, (side * math.cos(a) * span * 0.75, math.sin(a) * span * 0.4 - 0.12 * S, -0.10 * S))
            mid = v_add(root, (side * math.cos(a) * span * 1.0, math.sin(a) * span * 0.6, -0.02 * S))
            m.tri(root, up, mid, wm, grp)
            m.tri(root, mid, lo, mats.get("wing2", wm), grp)
            if mats.get("glow"):
                m.ball(v_lerp(root, mid, 0.6), 0.04 * S, mats["glow"], grp)
        else:
            el = v_add(root, (side * math.cos(a) * span * 0.5, math.sin(a) * span * 0.5, -0.02 * S))
            tip = v_add(el, (side * math.cos(a * 0.7) * span * 0.55, math.sin(a * 1.3) * span * 0.45, -0.08 * S))
            back = B(side * br * 0.4, -0.02 * S, -0.16 * S)
            m.cap(root, el, 0.02 * S, 0.015 * S, mats.get("wing_bone", wm), grp)
            m.cap(el, tip, 0.015 * S, 0.006 * S, mats.get("wing_bone", wm), grp)
            if kind == "bat":
                m.tri(root, el, back, wm, grp)
                m.tri(el, tip, v_lerp(back, tip, 0.5), wm, grp)
                m.tri(el, v_lerp(back, tip, 0.5), back, wm, grp)
            else:
                # feathered wing: filled membrane + 3 primary feather tips on the trailing edge
                trail = v_add(v_lerp(el, tip, 0.5), (side * 0.02 * S, -0.10 * S, -0.10 * S))
                m.tri(root, el, back, wm, grp)
                m.tri(el, trail, back, wm, grp)
                m.tri(el, tip, trail, mats.get("wing2", wm), grp)
                for i in range(3):
                    f0 = v_lerp(tip, trail, i / 3)
                    m.cap(f0, v_add(f0, (side * 0.03 * S, -0.03 * S, -0.06 * S)), 0.022 * S, 0.006 * S, mats.get("wing2", wm), grp)
    # tail & feet
    if kind in ("bird", "owl", "chicken"):
        tm = mats.get("tail", body)
        tb = B(0, -0.02 * S, -br * 0.9)
        for o in (-1, 0, 1):
            m.cap(tb, v_add(tb, m_apply(Rb, (o * 0.04 * S, 0.06 * S if kind == "chicken" else -0.02 * S, -0.14 * S))), 0.035 * S, 0.02 * S, tm, G_TAIL)
    feet = mats.get("feet")
    if feet is not None:
        step = g("step", 0.0)
        for side in (-1, 1):
            top = B(side * br * 0.4, -br * 0.8, 0)
            ft = (top[0], top[1] - 0.08 * S, top[2] + side * step * 0.05 * S)
            m.cap(top, ft, 0.018 * S, 0.012 * S, feet, G_LEG_FL if side < 0 else G_LEG_FR)
            m.cap(ft, v_add(ft, (0, 0, 0.05 * S)), 0.012 * S, 0.008 * S, feet, G_LEG_FL if side < 0 else G_LEG_FR)
    _fx_simple(m, pose, S, B(0, 0, 0), hc, mats)
    return m


# ---------------------------------------------------------------- floaters (wisp / ghost / jelly / kraken)


def build_floater(spec, pose):
    g = pose.get
    S = spec["S"]
    mats = spec["mats"]
    body = mats["body"]
    m = Model()
    kind = spec.get("kind", "wisp")
    ph = g("phase", 0.0)
    hover = spec.get("hover", 0.30) * S + g("bob", 0.0) * S
    z0 = g("root_z", 0.0) * S
    c = (0.0, hover + 0.25 * S, z0)
    lean = g("lean", 0.0)
    R = rot_x(lean)
    if kind in ("jelly", "kraken"):
        br = 0.24 * S * (1 + g("pulse", 0.0) * 0.15)
        m.ell(c, br, br * (0.85 if kind == "jelly" else 1.0), body, G_BODY)
        if mats.get("core"):
            m.ball(v_add(c, (0.0, 0.02 * S, 0.06 * S)), br * 0.45, mats["core"], G_EXTRA)
        n_t = 6 if kind == "kraken" else 5
        reach = g("reach", 0.0)
        for i in range(n_t):
            a = 2 * math.pi * i / n_t + 0.3
            base = v_add(c, (math.cos(a) * br * 0.7, -br * 0.55, math.sin(a) * br * 0.7))
            pts = [base]
            for j in range(1, 5):
                t = j / 4
                wav = math.sin(ph + j * 1.2 + i) * 0.07 * S
                out = (0.10 if kind == "kraken" else 0.04) * S * t * (1 + reach * (1 if math.sin(a) > 0 else 0.2) * 2)
                pts.append(v_add(base, (math.cos(a) * out + wav, -0.12 * S * t * (1.4 if kind == "jelly" else 1.0) * (1 - reach * 0.5), math.sin(a) * out + (reach * 0.25 * S * t if math.sin(a) > 0 else 0))))
            m.chain(pts, (0.05 if kind == "kraken" else 0.02) * S, 0.012 * S, mats.get("tentacle", body), G_TAIL)
        _eyes(m, c, IDENT3, br, 0.4, 0.9, 0.05 if kind == "kraken" else -0.1, spec.get("eye_rgb", (248, 224, 96)), max(1, int(S / 30)))
        if kind == "kraken" and g("jaw", 0):
            m.px(v_add(c, (0, -br * 0.4, br * 0.9)), (40, 16, 40), bias=br, size=max(1, int(S / 20)))
    else:
        # wisp / ghost / wraith: hooded head + trailing robe tail
        hr = 0.12 * S
        m.ball(c, hr, mats.get("head", body), G_HEAD)
        tail = [c]
        for j in range(1, 5):
            t = j / 4
            tail.append(v_add(c, m_apply(R, (math.sin(ph + j) * 0.05 * S * t, -0.30 * S * t, -0.14 * S * t))))
        m.chain(tail, hr * 1.25, hr * 0.15, body, G_BODY)
        if kind == "wraith":
            for side in (-1, 1):
                sh = v_add(c, (side * hr * 1.0, -hr * 1.1, 0))
                hand = v_add(sh, m_apply(R, (side * 0.12 * S, -0.08 * S + g("reach", 0.0) * 0.12 * S, 0.10 * S + g("reach", 0.0) * 0.12 * S)))
                m.cap(sh, hand, hr * 0.35, hr * 0.2, body, G_EXTRA)
                m.ball(hand, hr * 0.28, mats.get("hand", body), G_EXTRA)
            hm = mats.get("hood", body)
            m.ball(v_add(c, (0, hr * 0.15, -hr * 0.2)), hr * 1.15, hm, G_HEAD)
        if mats.get("core"):
            m.ball(v_add(c, (0, -0.06 * S, 0.05 * S)), hr * 0.55, mats["core"], G_EXTRA)
        eye = spec.get("eye_rgb", (248, 248, 255))
        for side in (-1, 1):
            m.px(v_add(c, (side * hr * 0.35, 0.0, hr * 1.0)), eye, bias=hr * 1.5, size=max(1, int(S / 40)))
        if spec.get("flames"):
            for i in range(5):
                a = ph * 1.3 + i * 1.25
                m.cap(v_add(c, (math.cos(a) * hr * 0.6, hr * 0.5, math.sin(a) * hr * 0.6)), v_add(c, (math.cos(a) * hr * 0.4, hr * (1.4 + 0.3 * math.sin(ph + i)), math.sin(a) * hr * 0.4 - hr * 0.3)), hr * 0.3, hr * 0.04, mats.get("flame", body), G_FX)
    _fx_simple(m, pose, S, c, c, mats)
    return m
