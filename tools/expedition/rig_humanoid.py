"""Humanoid rig (tỷ lệ người thật ~8 đầu, không chibi) cho Anh Hùng, NPC địch hình người, Golem và Trùm.

`build_humanoid(spec, pose)` trả về `pixel_rig.Model` trong hệ tọa độ nhân vật.
`spec` mô tả tỷ lệ, chất liệu, tóc/mũ, trang phục, vũ khí; `pose` là dict góc khớp (độ):

  root_x / root_z      dịch thân sang phải / về phía trước (đơn vị = chiều cao H)
  lift                 nhảy khỏi mặt đất (đơn vị H)
  lean, twist, tilt    gập người trước, xoay thân, nghiêng thân
  fall, roll           xoay toàn thân quanh trục ngang (ngã sấp > 0) / trục dọc trước (ngã nghiêng)
  rs_p rs_r re         vai phải pitch / roll, khuỷu phải;  ls_* re trái tương tự
  rh_p rh_r rk         hông phải pitch / roll, gối phải;  lh_* lk trái tương tự
  head_p, head_y       cúi/ngẩng, quay đầu
  w_p, w_r             hướng vũ khí tay phải (giống quy ước limb_dir)
  o_p, o_r             hướng vật tay trái (khiên / cung / dao thứ hai)
  two_hand             tay trái bám vào cán vũ khí bằng IK
  wind                 độ bay áo choàng / tóc (0..1), phase  pha gợn sóng
  fx                   danh sách hiệu ứng: 'slash', 'slash_low', 'spark', 'charge', 'burst', 'ring', 'aura', 'stars', 'arrow'

Ví dụ (chạy từ thư mục gốc): py tools/expedition/build_units.py --only gale_wolf,chicken
"""

from __future__ import annotations

import math

from pixel_rig import (
    IDENT,
    Mat,
    Model,
    limb_dir,
    m_apply,
    m_mul,
    rot_x,
    rot_y,
    rot_z,
    v_add,
    v_cross,
    v_dot,
    v_len,
    v_lerp,
    v_mul,
    v_norm,
    v_sub,
)

BUILDS = {
    #          shoulderW hipW  limb  torso  head  waist
    "male":   (0.118, 0.056, 1.00, 1.00, 0.062, 1.00),
    "female": (0.098, 0.064, 0.88, 0.90, 0.060, 0.82),
    "lean":   (0.108, 0.054, 0.92, 0.94, 0.061, 0.92),
    "heavy":  (0.150, 0.072, 1.32, 1.28, 0.058, 1.22),
    "giant":  (0.170, 0.080, 1.55, 1.45, 0.052, 1.35),
    "golem":  (0.190, 0.085, 1.85, 1.60, 0.050, 1.30),
}

G_BODY, G_LEG_L, G_LEG_R, G_ARM_L, G_ARM_R, G_HEAD, G_HAIR, G_CAPE, G_WPN, G_OFF, G_FX, G_TAIL = range(12)


def ik_elbow(s, t, lu, lf, pole):
    d = v_sub(t, s)
    dist = v_len(d)
    dist = max(1e-3, min(dist, (lu + lf) * 0.999))
    dn = v_norm(d)
    a = (lu * lu - lf * lf + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, lu * lu - a * a))
    p = v_sub(pole, v_mul(dn, v_dot(pole, dn)))
    p = v_norm(p) if v_len(p) > 1e-6 else (0.0, -1.0, 0.0)
    return v_add(v_add(s, v_mul(dn, a)), v_mul(p, h)), v_add(s, v_mul(dn, dist))


def _perp(d):
    p = v_cross(d, (0.0, 0.0, 1.0))
    if v_len(p) < 0.2:
        p = v_cross(d, (1.0, 0.0, 0.0))
    return v_norm(p)


def _ring(m, center, rx, rz, y_axis_m, mat, r, grp, n=10, start=0.0, end=2 * math.pi, closed=True):
    pts = []
    steps = n if closed else n
    for i in range(steps + (1 if closed else 1)):
        a = start + (end - start) * i / steps
        pts.append(v_add(center, m_apply(y_axis_m, (math.cos(a) * rx, 0.0, math.sin(a) * rz))))
    for i in range(len(pts) - 1):
        m.cap(pts[i], pts[i + 1], r, r, mat, grp)
    return pts


# ---------------------------------------------------------------- weapons


def weapon(m: Model, kind: str, hand, d, H, mats, grp=G_WPN, scale=1.0):
    """Draw a held weapon; `d` = unit direction of the business end from the hand."""
    S = H * scale
    metal = mats.get("metal")
    grip = mats.get("grip", mats.get("leather"))
    acc = mats.get("accent", metal)
    glow = mats.get("glow", acc)
    perp = _perp(d)
    if kind in ("sword", "rapier", "greatsword", "dagger", "khopesh", "cutlass", "icesword"):
        L = {"sword": 0.40, "rapier": 0.44, "greatsword": 0.60, "dagger": 0.20, "khopesh": 0.34, "cutlass": 0.34, "icesword": 0.52}[kind] * S
        W = {"sword": 0.020, "rapier": 0.007, "greatsword": 0.040, "dagger": 0.014, "khopesh": 0.022, "cutlass": 0.022, "icesword": 0.034}[kind] * S
        m.cap(v_sub(hand, v_mul(d, 0.05 * S)), v_add(hand, v_mul(d, 0.03 * S)), 0.012 * S, 0.012 * S, grip, grp)
        base = v_add(hand, v_mul(d, 0.035 * S))
        m.cap(v_add(base, v_mul(perp, 0.045 * S)), v_sub(base, v_mul(perp, 0.045 * S)), 0.011 * S, 0.011 * S, acc, grp)
        if kind == "rapier":
            m.ball(v_add(hand, v_mul(d, 0.02 * S)), 0.03 * S, acc, grp)
        tip = v_add(base, v_mul(d, L))
        if kind == "khopesh":
            mid = v_add(base, v_mul(d, L * 0.55))
            hook = v_add(v_add(mid, v_mul(d, L * 0.35)), v_mul(perp, 0.07 * S))
            m.quad(v_add(base, v_mul(perp, W)), v_sub(base, v_mul(perp, W)), v_sub(mid, v_mul(perp, W)), v_add(mid, v_mul(perp, W)), metal, grp)
            m.quad(v_add(mid, v_mul(perp, W)), v_sub(mid, v_mul(perp, W * 1.4)), hook, v_add(hook, v_mul(perp, W * 2)), metal, grp)
            return tip
        bw = v_mul(perp, W)
        shoulder = v_add(base, v_mul(d, L * 0.86))
        m.quad(v_add(base, bw), v_sub(base, bw), v_sub(shoulder, bw), v_add(shoulder, bw), metal, grp)
        m.tri(v_add(shoulder, bw), v_sub(shoulder, bw), tip, metal, grp)
        if W > 0.012 * S:
            m.line(base, v_add(base, v_mul(d, L * 0.9)), metal.ramp[0], bias=1.5)
        return tip
    if kind in ("spear", "lance", "trident", "glaive"):
        L = (0.95 if kind != "glaive" else 0.85) * S
        back = v_sub(hand, v_mul(d, 0.30 * S))
        tip_base = v_add(hand, v_mul(d, L * 0.62))
        m.cap(back, tip_base, 0.012 * S, 0.012 * S, grip, grp)
        m.cap(v_sub(tip_base, v_mul(d, 0.02 * S)), v_add(tip_base, v_mul(d, 0.01 * S)), 0.02 * S, 0.02 * S, acc, grp)
        tip = v_add(tip_base, v_mul(d, 0.17 * S))
        if kind == "trident":
            for o in (-1, 0, 1):
                b = v_add(tip_base, v_mul(perp, o * 0.04 * S))
                m.cap(b, v_add(b, v_mul(d, 0.13 * S if o == 0 else 0.10 * S)), 0.009 * S, 0.004 * S, metal, grp)
            m.cap(v_add(tip_base, v_mul(perp, 0.045 * S)), v_sub(tip_base, v_mul(perp, 0.045 * S)), 0.009 * S, 0.009 * S, metal, grp)
        elif kind == "glaive":
            w = v_mul(perp, 0.04 * S)
            m.poly([tip_base, v_add(tip_base, w), v_add(tip, v_mul(w, 0.6)), tip], metal, grp)
        else:
            w = v_mul(perp, 0.028 * S if kind == "spear" else 0.034 * S)
            mid = v_add(tip_base, v_mul(d, 0.06 * S))
            m.poly([tip_base, v_add(mid, w), tip, v_sub(mid, w)], metal, grp)
            if kind == "lance":
                m.cap(back, v_sub(hand, v_mul(d, 0.12 * S)), 0.02 * S, 0.016 * S, acc, grp)
        return tip
    if kind in ("staff", "brush", "astro_staff", "crook"):
        L = 0.86 * S
        lo = v_sub(hand, v_mul(d, 0.30 * S))
        hi = v_add(hand, v_mul(d, L * 0.62))
        m.cap(lo, hi, 0.012 * S, 0.011 * S, grip, grp)
        if kind == "brush":
            # bristle tuft at the lower end, like a giant painter's brush
            m.cap(lo, v_sub(lo, v_mul(d, 0.04 * S)), 0.02 * S, 0.02 * S, acc, grp)
            m.cap(v_sub(lo, v_mul(d, 0.04 * S)), v_sub(lo, v_mul(d, 0.16 * S)), 0.03 * S, 0.006 * S, mats.get("bristle", glow), grp)
            m.ball(hi, 0.022 * S, glow, grp)
            return v_sub(lo, v_mul(d, 0.16 * S))
        if kind == "crook":
            c = v_add(hi, v_mul(perp, 0.05 * S))
            _ring(m, c, 0.05 * S, 0.05 * S, IDENT, acc, 0.011 * S, grp, n=6, start=0, end=math.pi, closed=False)
            return hi
        m.cap(v_sub(hi, v_mul(d, 0.03 * S)), hi, 0.022 * S, 0.016 * S, acc, grp)
        for o in (-1, 1):
            m.cap(hi, v_add(v_add(hi, v_mul(d, 0.07 * S)), v_mul(perp, o * 0.035 * S)), 0.008 * S, 0.004 * S, acc, grp)
        orb = v_add(hi, v_mul(d, 0.05 * S))
        m.ball(orb, 0.03 * S, glow, grp)
        return orb
    if kind in ("scythe", "greataxe", "hammer", "maul"):
        L = 0.80 * S
        lo = v_sub(hand, v_mul(d, 0.26 * S))
        hi = v_add(hand, v_mul(d, L * 0.68))
        m.cap(lo, hi, 0.013 * S, 0.013 * S, grip, grp)
        if kind == "scythe":
            p2 = v_cross(d, perp)
            pts = [hi]
            for i in range(1, 6):
                a = i / 5
                pts.append(v_add(v_add(hi, v_mul(p2, -0.30 * S * a)), v_mul(d, -0.10 * S * a * a)))
            inner = [v_add(p, v_mul(d, -0.035 * S * math.sin(math.pi * i / 5))) for i, p in enumerate(pts)]
            for i in range(5):
                m.quad(pts[i], pts[i + 1], inner[i + 1], inner[i], metal, grp)
            return pts[-1]
        if kind == "greataxe":
            p2 = v_cross(d, perp)
            top = v_add(hi, v_mul(d, 0.02 * S))
            bot = v_sub(hi, v_mul(d, 0.16 * S))
            edge_t = v_add(v_add(top, v_mul(p2, 0.14 * S)), v_mul(d, 0.05 * S))
            edge_b = v_add(v_add(bot, v_mul(p2, 0.14 * S)), v_mul(d, -0.05 * S))
            m.poly([top, edge_t, edge_b, bot], metal, grp)
            m.line(edge_t, edge_b, metal.ramp[0], bias=1.5)
            return edge_t
        # hammer / maul: a box head
        p2 = v_norm(v_cross(d, perp))
        sz = (0.06 if kind == "hammer" else 0.075) * S
        c = v_add(hi, v_mul(d, sz * 0.2))
        box(m, c, v_mul(p2, sz * 1.5), v_mul(perp, sz), v_mul(d, sz * 0.9), metal, grp)
        return c
    if kind == "bow":
        # d = bow limb axis (up); bow bulges toward `perp`-forward
        fwd = mats.get("_fwd", (0.0, 0.0, 1.0))
        pts = []
        for i in range(9):
            a = -1 + 2 * i / 8
            pts.append(v_add(v_add(hand, v_mul(d, a * 0.30 * S)), v_mul(fwd, 0.08 * S * (1 - a * a))))
        for i in range(8):
            m.cap(pts[i], pts[i + 1], 0.012 * S, 0.012 * S, grip if i in (3, 4) else acc, grp)
        return pts
    if kind == "shield":
        n = v_norm(d)
        u = _perp(n)
        w = v_norm(v_cross(n, u))
        rim = []
        for i in range(10):
            a = 2 * math.pi * i / 10
            rim.append(v_add(v_add(hand, v_mul(u, math.cos(a) * 0.16 * S)), v_mul(w, math.sin(a) * 0.22 * S)))
        face = v_add(hand, v_mul(n, 0.03 * S))
        for i in range(10):
            m.tri(face, rim[i], rim[(i + 1) % 10], metal, grp)
        for i in range(10):
            m.cap(rim[i], rim[(i + 1) % 10], 0.012 * S, 0.012 * S, acc, grp)
        m.ball(v_add(face, v_mul(n, 0.012 * S)), 0.035 * S, glow, grp)
        return face
    if kind == "tower_shield":
        n = v_norm(d)
        up = (0.0, 1.0, 0.0)
        w = v_norm(v_cross(up, n))
        hh, hw = 0.26 * S, 0.14 * S
        c = v_add(v_add(hand, v_mul(n, 0.03 * S)), (0.0, -0.08 * S, 0.0))
        corners = [
            v_add(v_add(c, v_mul(up, hh)), v_mul(w, hw)),
            v_add(v_add(c, v_mul(up, hh)), v_mul(w, -hw)),
            v_add(v_add(c, v_mul(up, -hh * 0.8)), v_mul(w, -hw)),
            v_add(c, v_mul(up, -hh * 1.1)),
            v_add(v_add(c, v_mul(up, -hh * 0.8)), v_mul(w, hw)),
        ]
        m.poly([c] + corners + [corners[0]], metal, grp)
        for i in range(5):
            m.cap(corners[i], corners[(i + 1) % 5], 0.014 * S, 0.014 * S, acc, grp)
        m.ball(v_add(c, v_mul(n, 0.015 * S)), 0.045 * S, glow, grp)
        m.line(v_add(c, v_mul(up, hh * 0.9)), v_add(c, v_mul(up, -hh * 0.9)), acc.ramp[0], bias=2)
        return c
    if kind == "lyre":
        up = d
        side = _perp(d)
        for o in (-1, 1):
            pts = [v_add(hand, v_mul(side, o * 0.02 * S))]
            for i in range(1, 4):
                a = i / 3
                pts.append(v_add(v_add(hand, v_mul(up, 0.14 * S * a)), v_mul(side, o * (0.02 + 0.05 * math.sin(a * 2.2)) * S)))
            m.chain(pts, 0.012 * S, 0.009 * S, acc, grp)
        top_l = v_add(v_add(hand, v_mul(up, 0.15 * S)), v_mul(side, -0.035 * S))
        top_r = v_add(v_add(hand, v_mul(up, 0.15 * S)), v_mul(side, 0.035 * S))
        m.cap(top_l, top_r, 0.009 * S, 0.009 * S, acc, grp)
        for o in (-0.02, 0.0, 0.02):
            m.line(v_add(hand, v_mul(side, o * S)), v_add(v_add(hand, v_mul(up, 0.14 * S)), v_mul(side, o * S)), glow.ramp[0], bias=3)
        return top_l
    if kind == "astrolabe":
        c = v_add(hand, v_mul(d, 0.09 * S))
        _ring(m, c, 0.07 * S, 0.07 * S, rot_x(70), acc, 0.008 * S, grp, n=10)
        _ring(m, c, 0.05 * S, 0.05 * S, rot_z(60), acc, 0.007 * S, grp, n=8)
        m.ball(c, 0.03 * S, glow, grp)
        return c
    if kind == "whip":
        pts = [hand]
        for i in range(1, 8):
            a = i / 7
            pts.append(v_add(v_add(hand, v_mul(d, 0.42 * S * a)), (0.0, -0.10 * S * a * a, 0.0)))
        m.chain(pts, 0.010 * S, 0.005 * S, acc, grp)
        m.ball(pts[-1], 0.016 * S, glow, grp)
        return pts[-1]
    if kind == "pistol":
        m.cap(hand, v_add(hand, v_mul(d, 0.10 * S)), 0.014 * S, 0.011 * S, metal, grp)
        m.cap(hand, v_add(hand, (0.0, -0.04 * S, 0.0)), 0.012 * S, 0.012 * S, grip, grp)
        return v_add(hand, v_mul(d, 0.10 * S))
    if kind == "claw":
        for o in (-1, 0, 1):
            b = v_add(hand, v_mul(perp, o * 0.012 * S))
            m.cap(b, v_add(b, v_mul(d, 0.08 * S)), 0.007 * S, 0.002 * S, metal, grp)
        return v_add(hand, v_mul(d, 0.08 * S))
    if kind == "orb":
        m.ball(v_add(hand, v_mul(d, 0.05 * S)), 0.04 * S, glow, grp)
        return hand
    if kind == "tome":
        box(m, v_add(hand, v_mul(d, 0.03 * S)), (0.06 * S, 0, 0), (0, 0.075 * S, 0), (0, 0, 0.02 * S), acc, grp)
        return hand
    return hand


def box(m, c, ax, ay, az, mat, grp):
    """Oriented box with half-axes ax, ay, az."""
    def corner(i, j, k):
        return v_add(v_add(v_add(c, v_mul(ax, i)), v_mul(ay, j)), v_mul(az, k))

    faces = [
        ((1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)),
        ((-1, -1, -1), (-1, -1, 1), (-1, 1, 1), (-1, 1, -1)),
        ((-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)),
        ((-1, -1, -1), (1, -1, -1), (1, -1, 1), (-1, -1, 1)),
        ((-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)),
        ((-1, -1, -1), (-1, 1, -1), (1, 1, -1), (1, -1, -1)),
    ]
    for f in faces:
        m.quad(*(corner(*v) for v in f), mat, grp)


# ---------------------------------------------------------------- fx


def fx(m: Model, kinds, H, pelvis, Rt, hand, tip, mats, phase=0.0):
    glow = mats.get("fx") or mats.get("glow")
    if glow is None:
        return
    core = mats.get("fx_core", glow)
    for k in kinds:
        if k in ("slash", "slash_low", "sweep"):
            c = v_add(pelvis, m_apply(Rt, (0.0, 0.25 * H if k == "slash" else 0.10 * H, 0.10 * H)))
            r = (0.42 if k != "sweep" else 0.46) * H
            a0, a1 = (100, -40) if k == "slash" else ((70, -70) if k == "slash_low" else (150, -150))
            pts = []
            for i in range(9):
                a = math.radians(a0 + (a1 - a0) * i / 8)
                if k == "sweep":
                    local = (math.sin(a) * r, 0.02 * H, math.cos(a) * r * 0.9)
                else:
                    local = (0.10 * H * math.sin(a), math.sin(a) * r * 0.75, math.cos(a) * r)
                pts.append(v_add(c, m_apply(Rt, local)))
            for i in range(8):
                w = math.sin(math.pi * (i + 0.5) / 8)
                m.cap(pts[i], pts[i + 1], 0.010 * H * w + 0.3, 0.010 * H * w + 0.3, glow, G_FX)
        elif k == "spark" and tip is not None:
            for dx, dy in ((1, 0), (0, 1), (0.7, 0.7), (-0.7, 0.7)):
                a = v_add(tip, (dx * 0.06 * H, dy * 0.06 * H, 0.05 * H))
                b = v_add(tip, (-dx * 0.06 * H, -dy * 0.06 * H, 0.05 * H))
                m.line(a, b, core.ramp[0], bias=40)
        elif k == "charge" and tip is not None:
            for i in range(6):
                a = phase + i * math.pi / 3
                p = v_add(tip, (math.cos(a) * 0.07 * H, math.sin(a) * 0.07 * H, 0.02 * H))
                m.ball(p, 0.012 * H, glow, G_FX)
            m.ball(tip, 0.035 * H, core, G_FX)
        elif k == "burst" and tip is not None:
            m.ball(tip, 0.07 * H, core, G_FX)
            for i in range(8):
                a = phase + i * math.pi / 4
                p0 = v_add(tip, (math.cos(a) * 0.08 * H, math.sin(a) * 0.08 * H, 0.03 * H))
                p1 = v_add(tip, (math.cos(a) * 0.16 * H, math.sin(a) * 0.16 * H, 0.03 * H))
                m.cap(p0, p1, 0.012 * H, 0.004 * H, glow, G_FX)
        elif k in ("ring", "aura"):
            r = (0.32 if k == "ring" else 0.42) * H
            _ring(m, (pelvis[0], 0.004 * H, pelvis[2]), r, r * 0.9, IDENT, glow, 0.008 * H + 0.4, G_FX, n=16)
            if k == "aura":
                for i in range(6):
                    a = phase + i * math.pi / 3
                    p = (pelvis[0] + math.cos(a) * r * 0.8, 0.25 * H + 0.35 * H * ((i * 0.37 + phase) % 1.0), pelvis[2] + math.sin(a) * r * 0.8)
                    m.ball(p, 0.014 * H, core, G_FX)
        elif k == "stars":
            hc = v_add(pelvis, m_apply(Rt, (0.0, 0.50 * H, 0.0)))
            for i in range(3):
                a = phase + i * 2.09
                p = v_add(hc, (math.cos(a) * 0.09 * H, 0.03 * H * math.sin(a * 2), math.sin(a) * 0.09 * H))
                m.ball(p, 0.014 * H, core, G_FX)
        elif k == "arrow" and tip is not None:
            m.cap(tip, v_add(tip, m_apply(Rt, (0.0, 0.05 * H, 0.45 * H))), 0.008 * H, 0.008 * H, glow, G_FX)


# ---------------------------------------------------------------- hand-drawn details


def _folds(m, top, hem, r0, r1, mat, trim, Rt, H, n=3):
    """Dark fold creases running down a cloth panel and a light trim band at its hem."""
    side_v = m_apply(Rt, (1.0, 0.0, 0.0))
    fwd = m_apply(Rt, (0.0, 0.0, 1.0))
    for i in range(n):
        u = (i + 0.5) / n * 1.6 - 0.8
        a = v_add(v_add(top, v_mul(side_v, u * r0 * 0.7)), v_mul(fwd, r0 * 0.75))
        b = v_add(v_add(hem, v_mul(side_v, u * r1 * 0.9)), v_mul(fwd, r1 * 0.8))
        m.line(a, v_lerp(a, b, 0.92), mat.ramp[3], bias=0.6 + r1 * 0.35)
    if trim is not None:
        for sgn in (-1, 1):
            for k in range(5):
                t = k / 4
                p = v_add(v_add(hem, v_mul(side_v, (t - 0.5) * 2 * r1 * 0.9 * sgn)), v_mul(fwd, r1 * (0.55 + 0.4 * (1 - abs(t - 0.5) * 2))))
                m.px(v_add(p, (0.0, r1 * 0.55, 0.0)), trim.ramp[0], bias=r1 * 0.5, size=1)


def _hair_locks(m, Hd, hr, mat, wind, ph, length=3.5, n=9, thick=1.0, crown_only=False):
    """Hair as separate tapered locks from the scalp, falling with gravity and blown back by `wind`
    (the strand look of the hand-drawn atlases)."""
    for i in range(n):
        a = math.pi * (0.15 + 0.7 * i / max(1, n - 1))          # around the back half of the head
        sx, sz = math.cos(a), -math.sin(a)
        if crown_only:
            a = math.pi * (-0.15 + 1.3 * i / max(1, n - 1))
            sx, sz = math.cos(a) * 0.9, -math.sin(a) * 0.6 + 0.25
        root = Hd(sx * 0.72, 0.55, sz * 0.72)
        sway = math.sin(ph + i * 0.9) * 0.18 * (0.4 + wind)
        pts = [root]
        for k in range(1, 4):
            t = k / 3
            pts.append(Hd(sx * (0.85 + 0.25 * t) + sway * t * 2.0,
                          0.55 - length * t,
                          sz * (0.80 + 0.3 * t) - (wind * 1.6 + 0.25) * t * t))
        m.chain(pts, hr * 0.30 * thick, hr * 0.05, mat, G_HAIR)


# ---------------------------------------------------------------- humanoid


def build_humanoid(spec: dict, pose: dict) -> Model:
    g = pose.get
    H = spec["H"]
    shW, hipW, limb, torso_k, head_r, waist_k = BUILDS[spec.get("build", "male")]
    shW *= H
    hipW *= H
    hr = head_r * H * spec.get("head_scale", 1.45 if spec.get("build") == "golem" else 1.0)
    mats = spec["mats"]
    skin = mats["skin"]
    top = mats.get("top", skin)
    legs_m = mats.get("legs", top)
    boots = mats.get("boots", legs_m)
    gloves = mats.get("gloves", skin)
    arms_m = mats.get("arms", top)
    m = Model()

    hipY = 0.50 * H
    P = (g("root_x", 0.0) * H, hipY, g("root_z", 0.0) * H)
    Rt = m_mul(m_mul(rot_y(g("twist", 0.0)), rot_x(g("lean", 0.0) + spec.get("lean", 0.0))), rot_z(g("tilt", 0.0)))
    Rh = rot_y(g("twist", 0.0) * 0.35)

    def T(x, y, z):
        return v_add(P, m_apply(Rt, (x, y - hipY, z)))

    # ---- legs
    lu_leg, ll_leg = 0.235 * H, 0.225 * H
    knees, ankles = {}, {}
    for side, pfx, grp in ((1.0, "r", G_LEG_R), (-1.0, "l", G_LEG_L)):
        J = v_add(P, m_apply(Rh, (side * hipW, -0.01 * H, 0.0)))
        hp, hrl, kn = g(pfx + "h_p", 0.0), g(pfx + "h_r", 0.0) + 3, g(pfx + "k", 0.0)
        d1 = m_apply(Rh, limb_dir(hp, hrl, side))
        K = v_add(J, v_mul(d1, lu_leg))
        d2 = m_apply(Rh, limb_dir(hp - kn, hrl, side))
        A = v_add(K, v_mul(d2, ll_leg))
        knees[side], ankles[side] = K, A
        rt, rk, ra = 0.050 * H * limb, 0.034 * H * limb, 0.025 * H * limb
        T1 = v_lerp(J, K, 0.38)
        m.cap(J, T1, rt * 1.02, rt * 1.04, legs_m, grp)          # upper thigh
        m.cap(T1, K, rt * 1.04, rk, legs_m, grp)                 # thigh tapers into the knee
        C1 = v_lerp(K, A, 0.32)
        mid = v_lerp(K, A, spec.get("boot_top", 0.45))
        m.cap(K, C1, rk, rk * 1.12, legs_m, grp)                 # calf bulge
        m.cap(C1, mid, rk * 1.12, ra * 1.08, legs_m, grp)
        m.cap(mid, A, ra * 1.18, ra * 1.0, boots, grp)
        m.ball(v_lerp(mid, A, 0.08), ra * 1.30, boots, grp)       # boot cuff
        fdir = m_apply(Rh, v_norm((side * 0.12, -0.25, 1.0)))
        toe = v_add(A, v_mul(fdir, 0.078 * H * min(1.25, limb)))
        m.cap(A, toe, ra * 1.08, ra * 0.80, boots, grp)
        m.cap(A, v_add(A, v_mul(fdir, -0.02 * H)), ra * 0.95, ra * 0.85, boots, grp)   # heel
        if spec.get("knee_guard"):
            m.ball(v_add(K, m_apply(Rh, (0.0, 0.0, rk * 0.5))), rk * 0.9, mats["metal"], grp)

    # ---- torso / pelvis
    tk = torso_k
    m.cap(T(-hipW * 0.9, hipY + 0.02 * H, 0), T(hipW * 0.9, hipY + 0.02 * H, 0), 0.062 * H * tk * waist_k ** 0.5, 0.062 * H * tk * waist_k ** 0.5, mats.get("hips", legs_m), G_BODY)
    for side in (-1.0, 1.0):
        m.cap(
            T(side * 0.030 * H * tk, 0.585 * H, 0.0),
            T(side * shW * 0.52, 0.735 * H, 0.0),
            0.050 * H * tk * waist_k,
            0.064 * H * tk,
            top,
            G_BODY,
        )
    m.cap(T(0, 0.55 * H, 0), T(0, 0.70 * H, 0.004 * H), 0.058 * H * tk * waist_k, 0.06 * H * tk, top, G_BODY)
    if spec.get("bust"):
        for side in (-1.0, 1.0):
            m.ball(T(side * 0.03 * H, 0.705 * H, 0.04 * H * tk), 0.032 * H, top, G_BODY)
    if mats.get("belt"):
        _ring(m, T(0, 0.565 * H, 0), 0.066 * H * tk * waist_k, 0.055 * H * tk * waist_k, Rt, mats["belt"], 0.012 * H, G_BODY, n=10)
        m.ball(T(0, 0.565 * H, 0.058 * H * tk * waist_k), 0.014 * H, mats.get("accent", mats["belt"]), G_BODY)   # buckle
        if spec.get("skirt") not in ("robe",) and spec.get("build") not in ("golem",) and not spec.get("no_strap"):
            # diagonal strap across the chest (right shoulder -> left hip), front and back
            for z in (0.062, -0.060):
                m.cap(T(shW * 0.45, 0.79 * H, z * H * tk), T(-hipW * 0.9, 0.58 * H, z * H * tk * waist_k), 0.008 * H, 0.008 * H, mats["belt"], G_BODY)
    if mats.get("trim"):
        m.line(T(0, 0.75 * H, 0.06 * H * tk), T(0, 0.58 * H, 0.06 * H * tk * waist_k), mats["trim"].ramp[0], bias=2)

    # ---- skirt / coat tails / robe
    skirt = spec.get("skirt")
    sk_m = mats.get("skirt", top)
    wind = g("wind", 0.3)
    ph = g("phase", 0.0)
    if skirt in ("robe", "gown"):
        # one flared bell from the waist to the ankles, following the legs' average
        ank = v_lerp(ankles[1.0], ankles[-1.0], 0.5)
        kn = v_lerp(knees[1.0], knees[-1.0], 0.5)
        spread = v_len(v_sub(ankles[1.0], ankles[-1.0]))
        hem = v_add(v_lerp(kn, ank, 0.85), (math.sin(ph) * 0.01 * H, 0.0, -0.03 * H * (1 + wind)))
        mid = v_add(v_lerp(T(0, 0.56 * H, 0), hem, 0.5), (0.0, 0.0, -0.01 * H))
        r_hem = 0.064 * H * tk + spread * 0.30
        m.cap(T(0, 0.585 * H, 0), mid, 0.062 * H * tk * waist_k, (0.062 * H * tk + r_hem) * 0.5, sk_m, G_BODY)
        m.cap(mid, hem, (0.062 * H * tk + r_hem) * 0.5, r_hem, sk_m, G_BODY)
        _folds(m, T(0, 0.585 * H, 0), hem, 0.06 * H * tk, r_hem, sk_m, mats.get("trim") or mats.get("accent"), Rt, H, n=5)
        m.cap(v_add(hem, (0.0, 0.0, -0.02 * H)), v_add(hem, (0.0, 0.0, 0.02 * H)), r_hem * 0.98, r_hem * 0.98, sk_m, G_BODY)
    if skirt in ("coat", "skirt", "tabard", "loin"):
        hem_k = {"coat": 0.42, "robe": 0.92, "skirt": 0.22, "tabard": 0.55, "loin": 0.35}[skirt]
        for side in (-1.0, 1.0):
            top_p = T(side * 0.045 * H, 0.565 * H, 0.0)
            hem = v_lerp(knees[side], ankles[side], hem_k) if hem_k > 0.3 else v_lerp(v_add(P, (side * hipW, 0, 0)), knees[side], 0.6 + hem_k)
            hem = v_add(hem, (side * 0.02 * H, 0.0, -0.025 * H * (1 + wind)))
            if skirt in ("robe",):
                hem = v_add(hem, (side * 0.03 * H, 0, 0))
            r1 = {"coat": 0.058, "robe": 0.07, "skirt": 0.06, "tabard": 0.05, "loin": 0.045}[skirt] * H * tk
            m.cap(top_p, hem, 0.06 * H * tk * waist_k, r1, sk_m, G_BODY)
            _folds(m, top_p, hem, 0.06 * H * tk * waist_k, r1, sk_m, mats.get("trim") or mats.get("accent"), Rt, H)
        if skirt in ("coat", "tabard"):
            # back panel flaring in the wind
            bk = v_lerp(v_lerp(knees[1.0], knees[-1.0], 0.5), v_lerp(ankles[1.0], ankles[-1.0], 0.5), hem_k)
            bk = v_add(bk, (math.sin(ph) * 0.02 * H, 0.03 * H * wind, -0.08 * H * (0.6 + wind)))
            m.cap(T(0, 0.57 * H, -0.03 * H), bk, 0.055 * H * tk, 0.05 * H * tk, sk_m, G_BODY)

    # ---- neck & head
    neck_b = T(0, 0.825 * H, 0)
    neck_t = T(0, 0.858 * H, 0.004 * H)
    m.cap(neck_b, neck_t, 0.028 * H * tk ** 0.5, 0.025 * H, mats.get("neck", skin), G_BODY)
    collar = mats.get("collar", mats.get("trim", mats.get("belt")))
    if collar is not None and not spec.get("no_collar"):
        _ring(m, T(0, 0.818 * H, 0.0), 0.034 * H * tk ** 0.5, 0.03 * H * tk ** 0.5, Rt, collar, 0.009 * H, G_BODY, n=8)
    Rhd = m_mul(m_mul(Rt, rot_y(g("head_y", 0.0))), rot_x(g("head_p", 0.0)))
    hc = v_add(neck_t, m_apply(Rhd, (0.0, hr * 0.86, 0.10 * hr)))

    def Hd(x, y, z):
        return v_add(hc, m_apply(Rhd, (x * hr, y * hr, z * hr)))

    hood = spec.get("helm") == "hood"
    helm = spec.get("helm")
    head_m = mats.get("face", skin)
    m.ell(hc, hr * 0.86, hr, head_m, G_HEAD)
    m.ball(Hd(0, -0.45, 0.30), hr * 0.58, head_m, G_HEAD)
    if not spec.get("no_face") and spec.get("build") != "golem":
        m.cap(Hd(0, 0.02, 0.80), Hd(0, -0.26, 1.00), hr * 0.10, hr * 0.12, head_m, G_HEAD)      # nose
        for side in (-1, 1):
            m.ball(Hd(side * 0.86, -0.06, -0.04), hr * 0.20, head_m, G_HEAD)                   # ears
    hair_m = mats.get("hair")
    style = spec.get("hair", "short")
    if hair_m is not None and not hood:
        if style != "bald":
            m.ball(Hd(0, 0.26, -0.14), hr * 1.04, hair_m, G_HAIR)
            m.ball(Hd(0, 0.52, 0.22), hr * 0.80, hair_m, G_HAIR)
            m.ball(Hd(0.10, 0.62, 0.56), hr * 0.46, hair_m, G_HAIR)
            for side in (-1, 1):
                m.cap(Hd(side * 0.40, 0.66, 0.50), Hd(side * 0.62, 0.30, 0.70), hr * 0.30, hr * 0.12, hair_m, G_HAIR)
                m.ball(Hd(side * 0.68, 0.10, -0.02), hr * 0.46, hair_m, G_HAIR)
                if style in ("long", "mane", "ponytail"):
                    m.chain([Hd(side * 0.78, 0.25, 0.30), Hd(side * 0.86, -0.55, 0.32), Hd(side * 0.80, -1.25, 0.10)], hr * 0.30, hr * 0.16, hair_m, G_HAIR)
        if style in ("long", "mane", "wild"):
            _hair_locks(m, Hd, hr, hair_m, wind, ph, length=(3.8 if style == "long" else 3.0), n=11 if style != "long" else 9,
                        thick=1.25 if style != "long" else 1.0)
        elif style == "ponytail":
            sway = math.sin(ph) * 0.3 * wind
            m.ball(Hd(0, 0.75, -0.75), hr * 0.35, mats.get("accent", hair_m), G_HAIR)
            for o in (-0.18, 0.0, 0.18):
                m.chain([Hd(o * 0.5, 0.7, -0.9), Hd(sway + o, -0.2, -1.6 - wind * 0.5), Hd(sway * 2 + o * 1.6, -1.5, -1.8 - wind), Hd(sway * 3 + o * 2.2, -2.4, -1.7 - wind * 1.3)],
                        hr * 0.26, hr * 0.06, hair_m, G_HAIR)
        elif style == "bun":
            m.ball(Hd(0, 0.85, -0.65), hr * 0.5, hair_m, G_HAIR)
        if style in ("short", "ponytail", "bun", "long"):
            _hair_locks(m, Hd, hr, hair_m, wind * 0.3, ph, length=0.9, n=7, thick=0.75, crown_only=True)
        elif style == "spiky":
            for a in (-60, -25, 10, 45, 80, 120, 160):
                ra = math.radians(a)
                base = Hd(0.6 * math.sin(ra) * 0.8, 0.55, 0.5 * math.cos(ra) - 0.3)
                tipp = Hd(1.1 * math.sin(ra), 1.25, 0.9 * math.cos(ra) - 0.7)
                m.cap(base, tipp, hr * 0.38, hr * 0.06, hair_m, G_HAIR)
    if helm in ("helm", "great_helm", "horned", "winged"):
        hm = mats["metal"]
        m.ball(Hd(0, 0.18, -0.05), hr * 1.08, hm, G_HAIR)
        if helm == "great_helm":
            m.ball(Hd(0, -0.35, 0.15), hr * 0.92, hm, G_HAIR)
        m.cap(Hd(-0.9, 0.05, 0.75), Hd(0.9, 0.05, 0.75), hr * 0.08, hr * 0.08, mats.get("visor", hm), G_HAIR)
        if helm == "horned":
            for side in (-1, 1):
                m.chain([Hd(side * 0.8, 0.5, 0), Hd(side * 1.5, 0.9, -0.1), Hd(side * 1.7, 1.8, -0.4)], hr * 0.3, hr * 0.06, mats.get("horn", mats["accent"]), G_HAIR)
        if helm == "winged":
            for side in (-1, 1):
                m.tri(Hd(side * 0.9, 0.3, -0.2), Hd(side * 1.7, 1.4, -0.9), Hd(side * 0.9, 0.9, -0.6), mats["accent"], G_HAIR)
        if spec.get("plume"):
            m.chain([Hd(0, 1.0, -0.1), Hd(0, 1.5, -0.8), Hd(0, 1.1, -1.8 - wind)], hr * 0.28, hr * 0.12, mats["plume"], G_HAIR)
    elif hood:
        cm = mats.get("hood", mats.get("cape", top))
        m.ball(Hd(0, 0.22, -0.22), hr * 1.22, cm, G_HAIR)
        m.chain([Hd(0, 0.1, -0.8), Hd(0, -1.2, -1.1)], hr * 1.05, hr * 0.9, cm, G_HAIR)
    if helm == "crown" or spec.get("crown"):
        cmat = mats.get("crown", mats.get("accent"))
        _ring(m, Hd(0, 0.65, -0.1), hr * 0.8, hr * 0.75, Rhd, cmat, hr * 0.12, G_HAIR, n=8)
        for a in range(0, 360, 72):
            ra = math.radians(a)
            b = Hd(0.8 * math.cos(ra), 0.7, 0.75 * math.sin(ra) - 0.1)
            m.cap(b, v_add(b, m_apply(Rhd, (0, hr * 0.45, 0))), hr * 0.1, hr * 0.03, cmat, G_HAIR)
    if spec.get("halo"):
        _ring(m, Hd(0, 1.5, -0.6), hr * 1.0, hr * 1.0, m_mul(Rhd, rot_x(-20)), mats.get("glow"), hr * 0.08, G_FX, n=12)
    if spec.get("horns") and helm not in ("horned",):
        hmat = mats.get("horn", mats.get("accent"))
        for side in (-1, 1):
            m.chain([Hd(side * 0.55, 0.65, 0.1), Hd(side * 1.1, 1.2, -0.2), Hd(side * 1.15, 1.9, -0.7)], hr * 0.28, hr * 0.05, hmat, G_HAIR)
    if spec.get("antlers"):
        amat = mats.get("horn", mats.get("accent"))
        for side in (-1, 1):
            b = Hd(side * 0.5, 0.8, -0.1)
            t1 = Hd(side * 1.3, 1.9, -0.4)
            m.chain([b, Hd(side * 0.9, 1.4, -0.2), t1], hr * 0.18, hr * 0.08, amat, G_HAIR)
            m.cap(Hd(side * 0.9, 1.4, -0.2), Hd(side * 0.6, 2.1, 0.1), hr * 0.12, hr * 0.05, amat, G_HAIR)
            m.cap(t1, Hd(side * 1.9, 2.4, -0.6), hr * 0.10, hr * 0.04, amat, G_HAIR)
    # face: eyes (only show if facing camera — depth-tested pixels)
    eye_col = spec.get("eye_rgb", (40, 28, 48))
    es = max(1, int(round(hr / 7)))
    if helm in ("helm", "great_helm", "horned", "winged"):
        for side in (-1, 1):
            m.px(Hd(side * 0.32, 0.05, 1.04), spec.get("visor_glow", (248, 232, 160)), bias=hr * 0.6, size=es)
    elif not spec.get("no_face"):
        if g("face_detail"):
            # portrait close-up: eye whites + iris, brows, nose shade and mouth (sizes are model units)
            brow = (hair_m or head_m).ramp[3]
            for side in (-1, 1):
                m.px(Hd(side * 0.36, 0.06, 0.90), (244, 244, 240), bias=hr * 0.4, size=hr * 0.26)
                m.px(Hd(side * 0.30, 0.02, 0.93), eye_col, bias=hr * 0.5, size=hr * 0.17)
                m.px(Hd(side * 0.30, 0.10, 0.95), (255, 255, 255), bias=hr * 0.6, size=hr * 0.06)
                m.line(Hd(side * 0.16, 0.36, 0.93), Hd(side * 0.56, 0.40, 0.80), brow, bias=hr * 0.4)
            m.px(Hd(0.04, -0.22, 0.99), head_m.ramp[2], bias=hr * 0.5, size=hr * 0.1)
            m.line(Hd(-0.16, -0.55, 0.88), Hd(0.16, -0.55, 0.88), head_m.ramp[3], bias=hr * 0.5)
        else:
            for side in (-1, 1):
                m.px(Hd(side * 0.33, 0.02, 0.88), eye_col, bias=hr * 0.35, size=es)
                if hr >= 5.5:
                    m.line(Hd(side * 0.16, 0.30, 0.93), Hd(side * 0.52, 0.34, 0.80), (hair_m or head_m).ramp[3], bias=hr * 0.35)
            if hr >= 9:
                m.px(Hd(0, -0.48, 0.86), head_m.ramp[2], bias=hr * 0.3, size=1)

    # ---- arms
    lu_arm, lf_arm = 0.175 * H * min(limb, 1.25), 0.160 * H * min(limb, 1.25)
    hands = {}
    elbows = {}
    for side, pfx, grp in ((1.0, "r", G_ARM_R), (-1.0, "l", G_ARM_L)):
        S = T(side * shW, 0.805 * H, -0.004 * H)
        sp, sr, el = g(pfx + "s_p", 0.0), g(pfx + "s_r", 0.0) + 7, g(pfx + "e", 8.0)
        d1 = m_apply(Rt, limb_dir(sp, sr, side))
        E = v_add(S, v_mul(d1, lu_arm))
        d2 = m_apply(Rt, limb_dir(sp + el, sr * 0.6, side))
        Hn = v_add(E, v_mul(d2, lf_arm))
        hands[side], elbows[side] = [S, E, Hn, d2], E
    tip = None
    hand_r = hands[1.0][2]
    wkind = spec.get("weapon")
    wdir = None
    if wkind:
        if "w_p" in pose:
            wdir = m_apply(Rt, limb_dir(g("w_p"), g("w_r", 0.0), 1.0))
        else:
            wdir = v_norm(v_add(hands[1.0][3], m_apply(Rt, (0.0, 0.9, 0.6))))
    if g("two_hand") and wdir is not None:
        Sl = hands[-1.0][0]
        target = v_add(hand_r, v_mul(wdir, -0.085 * H))
        El, Hl = ik_elbow(Sl, target, lu_arm, lf_arm, m_apply(Rt, (-0.6, -0.6, -0.5)))
        hands[-1.0] = [Sl, El, Hl, v_norm(v_sub(Hl, El))]
    for side, grp in ((1.0, G_ARM_R), (-1.0, G_ARM_L)):
        S, E, Hn, d2 = hands[side]
        r_u, r_f = 0.034 * H * limb, 0.027 * H * limb
        m.ball(S, 0.038 * H * tk, mats.get("shoulder", arms_m), grp)                     # deltoid
        B1 = v_lerp(S, E, 0.45)
        m.cap(S, B1, r_u * 1.05, r_u * 1.08, arms_m, grp)                                   # biceps
        m.cap(B1, E, r_u * 1.08, r_f * 0.92, arms_m, grp)
        F1 = v_lerp(E, Hn, 0.30)
        m.cap(E, F1, r_f * 0.95, r_f * 1.05, mats.get("forearm", arms_m), grp)             # forearm swell
        m.cap(F1, v_lerp(E, Hn, 0.55), r_f * 1.05, r_f * 0.92, mats.get("forearm", arms_m), grp)
        m.cap(v_lerp(E, Hn, 0.55), Hn, r_f * 0.98, r_f * 0.72, gloves, grp)
        hs = 0.024 * H * min(limb, 1.4)
        m.ell(Hn, hs * 1.05, hs * 1.15, gloves, grp)                                         # palm
        fing = v_add(Hn, v_mul(d2, hs * 1.5))
        m.cap(Hn, fing, hs * 0.80, hs * 0.55, gloves, grp)                                  # fingers
        thumb = v_add(v_add(Hn, v_mul(d2, hs * 0.6)), m_apply(Rt, (-side * hs * 0.9, hs * 0.4, hs * 0.5)))
        m.cap(Hn, thumb, hs * 0.45, hs * 0.32, gloves, grp)
        if mats.get("pauldron"):
            m.ell(v_add(S, m_apply(Rt, (side * 0.016 * H, 0.016 * H, 0.0))), 0.052 * H * tk, 0.032 * H * tk, mats["pauldron"], grp)
    # ---- cape (drawn after body; z-buffer resolves)
    cape_m = mats.get("cape")
    if cape_m is not None:
        cl = spec.get("cape_len", 0.66) * max(0.25, math.cos(math.radians(min(89.0, abs(g("fall", 0.0))))))
        cols, rows = 4, 3
        top_pts = [T(-shW * 0.85 + 2 * shW * 0.85 * i / cols, 0.80 * H, -0.06 * H * tk) for i in range(cols + 1)]
        grid = []
        for rr in range(rows + 1):
            t = rr / rows
            row_pts = []
            for i, tp in enumerate(top_pts):
                u = i / cols - 0.5
                spread = 1.0 + 0.35 * t
                x = tp[0] + (tp[0] - P[0]) * (spread - 1) * 0.6
                y = tp[1] - cl * H * t
                z = tp[2] - (0.05 + 0.14 * wind) * H * t * t - 0.02 * H * t
                z += math.sin(u * 7.0 + ph + t * 2.0) * 0.022 * H * t
                y += math.sin(u * 5.0 + ph * 1.3) * 0.015 * H * t * wind
                row_pts.append((x + u * 0.04 * H * t, max(y, 0.02 * H), z))
            grid.append(row_pts)
        for rr in range(rows):
            for i in range(cols):
                m.quad(grid[rr][i], grid[rr][i + 1], grid[rr + 1][i + 1], grid[rr + 1][i], cape_m, G_CAPE)
    if spec.get("wings"):
        wm = mats.get("wing", cape_m)
        flap = g("flap", 0.0)
        for side in (-1, 1):
            root = T(side * 0.05 * H, 0.76 * H, -0.06 * H)
            span = spec.get("wing_span", 0.55) * H
            pts = []
            for i in range(4):
                a = math.radians(25 + 32 * i + flap * 18)
                pts.append(v_add(root, (side * math.cos(a) * span * (1 - 0.12 * i), math.sin(a) * span * 0.9 - 0.08 * H, -0.12 * H - 0.05 * H * i)))
            for i in range(3):
                m.tri(root, pts[i], pts[i + 1], wm, G_CAPE)
            if spec["wings"] == "crystal":
                for p in pts:
                    m.cap(root, p, 0.012 * H, 0.004 * H, mats.get("glow", wm), G_CAPE)
    if spec.get("tail"):
        tm = mats.get("tail", top)
        sw = math.sin(ph) * 0.06 * H
        m.chain([T(0, 0.50 * H, -0.05 * H), T(sw, 0.38 * H, -0.18 * H), T(sw * 2, 0.30 * H, -0.32 * H), T(sw * 3, 0.32 * H, -0.45 * H)], 0.035 * H, 0.012 * H, tm, G_TAIL)
    # ---- weapons
    if wkind:
        wm = dict(mats)
        wm["_fwd"] = m_apply(Rt, (0.0, 0.0, 1.0))
        tip = weapon(m, wkind, hand_r, wdir, H, wm, G_WPN, spec.get("weapon_scale", 1.0))
        if isinstance(tip, list):
            tip = tip[4]
    off = spec.get("offhand")
    if off:
        hl = hands[-1.0][2]
        if "o_p" in pose:
            odir = m_apply(Rt, limb_dir(g("o_p"), g("o_r", 0.0), -1.0))
        elif off in ("shield", "tower_shield"):
            odir = m_apply(Rt, v_norm((-0.35, 0.0, 1.0)))
        elif off == "bow":
            odir = m_apply(Rt, (0.0, 1.0, 0.0))
        else:
            odir = v_norm(v_add(hands[-1.0][3], m_apply(Rt, (0.0, 0.9, 0.6))))
        wm = dict(mats)
        wm["_fwd"] = m_apply(Rt, (0.0, 0.0, 1.0))
        res = weapon(m, off, hl, odir, H, wm, G_OFF, spec.get("off_scale", 1.0))
        if off == "bow" and isinstance(res, list):
            nock = v_lerp(hl, hands[1.0][2], 1.0) if g("draw", 0) else v_add(hl, v_mul(wm["_fwd"], 0.02 * H))
            m.line(res[0], nock, (232, 232, 224), bias=3)
            m.line(nock, res[-1], (232, 232, 224), bias=3)
            if g("draw", 0):
                m.cap(hands[1.0][2], v_add(hl, v_mul(wm["_fwd"], 0.12 * H)), 0.006 * H, 0.006 * H, mats.get("metal"), G_OFF)
            if tip is None:
                tip = v_add(hl, v_mul(wm["_fwd"], 0.12 * H))
    if tip is None:
        tip = hand_r
    if g("fx"):
        fx(m, g("fx"), H, P, Rt, hand_r, tip, mats, ph)
    return m


def place(model: Model, pose: dict, H: float) -> Model:
    """Apply whole-body fall/roll rotation and grounding."""
    from pixel_rig import ground

    fall, roll = pose.get("fall", 0.0), pose.get("roll", 0.0)
    if fall or roll:
        R = m_mul(rot_x(fall), rot_z(roll))
        pivot = (pose.get("root_x", 0.0) * H, 0.0, pose.get("root_z", 0.0) * H)
        model = model.transformed(lambda p: v_add(pivot, m_apply(R, v_sub(p, pivot))))
        # a lying body is re-centred on its own footprint so it stays inside the cell
        xs, zs = [], []
        for it in model.items:
            if it[0] in ("cap", "tri"):
                pts = it[1:3] if it[0] == "cap" else it[1:4]
            elif it[0] == "ell":
                pts = (it[1],)
            else:
                continue
            for p in pts:
                xs.append(p[0])
                zs.append(p[2])
        if xs:
            k = math.sin(math.radians(min(90.0, max(abs(fall), abs(roll)))))
            dx = ((min(xs) + max(xs)) / 2 - pivot[0]) * k
            dz = ((min(zs) + max(zs)) / 2 - pivot[2]) * k
            model = model.transformed(lambda p: (p[0] - dx, p[1], p[2] - dz))
    return ground(model, pose.get("lift", 0.0) * H)


# texture per material name (art-source look: fur strands, woven cloth, chased metal, stone)
TEX_BY_NAME = {
    "skin": "skin", "face": "skin", "neck": "skin", "snout": "skin", "mouth": "smooth", "beak": "smooth",
    "hair": "fur", "mane": "fur", "tail": "fur", "tail_tip": "fur", "wool": "fur", "body": "fur", "belly": "fur",
    "head": "fur", "ear": "fur", "legs": "cloth", "feet": "smooth", "hoof": "smooth", "dark": "smooth",
    "horn": "stone", "shell": "stone", "claw": "scale", "sting": "scale", "fin": "smooth", "wing": "cloth",
    "wing2": "cloth", "wing_bone": "fur", "leaf": "leaf", "flower": "smooth", "comb": "smooth", "core": "smooth",
    "boots": "cloth", "gloves": "cloth", "grip": "cloth", "accent": "metal", "belt": "cloth", "trim": "metal",
    "eye": "smooth", "tentacle": "skin", "flame": "smooth", "hand": "skin", "fang": "smooth", "mark": "smooth",
}


def mats_from(colors: dict, **kw) -> dict:
    """Build a material dict from {name: rgb}; names ending with '!' are glowing."""
    out = {}
    for name, rgb in colors.items():
        glow = name.endswith("!")
        key = name.rstrip("!")
        if key in ("metal", "visor", "crown", "pauldron"):
            out[key] = Mat(rgb, light=0.5, dark=0.45, deep=0.7, spec=(248, 248, 248), tex="metal")
        elif key in ("glow", "fx", "fx_core", "bristle"):
            out[key] = Mat(rgb, light=0.55, glow=True, line=False)
        else:
            out[key] = Mat(rgb, glow=glow, tex=TEX_BY_NAME.get(key, "cloth"))
    out.update(kw)
    return out
