"""Keyframe library: 6 frame / hàng cho mọi loại rig, đúng thứ tự hàng của prompts/battle/README.md.

Hero (BACK, 6 hàng): IDLE_BREATHE, ATTACK_STRIKE, SKILL_CAST, PARRY_COUNTER, DODGE, HURT_FAINT
Gatekeeper / Monster / Animal (FRONT, 4 hàng): IDLE_BREATHE, ATTACK_COMBO, HURT_STAGGER, FAINT
Boss (FRONT, 6 hàng): IDLE_BREATHE, COMBO_ATTACK, HEAVY_SWEEP, PHASE_AWAKEN, STAGGER_BREAK, DEFEAT
Movement: idle / walk, 6 frame mỗi hướng.

Ví dụ (chạy từ thư mục gốc): py tools/expedition/build_units.py --only gale_wolf,chicken
"""

from __future__ import annotations

import math

TAU = 2 * math.pi

HERO_ROWS = ("IDLE_BREATHE", "ATTACK_STRIKE", "SKILL_CAST", "PARRY_COUNTER", "DODGE", "HURT_FAINT")
ENEMY_ROWS = ("IDLE_BREATHE", "ATTACK_COMBO", "HURT_STAGGER", "FAINT")
BOSS_ROWS = ("IDLE_BREATHE", "COMBO_ATTACK", "HEAVY_SWEEP", "PHASE_AWAKEN", "STAGGER_BREAK", "DEFEAT")


def mix(*parts, **kw):
    out = {}
    for p in parts:
        out.update(p)
    out.update(kw)
    return out


def lerp_pose(a, b, t):
    out = dict(a)
    for k, v in b.items():
        if isinstance(v, (int, float)) and not isinstance(v, bool) and isinstance(a.get(k, 0.0), (int, float)):
            out[k] = a.get(k, 0.0) + (v - a.get(k, 0.0)) * t
        else:
            out[k] = v
    return out


# ---------------------------------------------------------------- humanoid

LEGS = {
    "stance": dict(rh_p=-10, rk=12, lh_p=14, lk=16, rh_r=4, lh_r=4, lean=6),
    "wide": dict(rh_p=-14, rk=16, lh_p=18, lk=22, rh_r=10, lh_r=10, lean=8),
    "windup": dict(rh_p=-18, rk=20, lh_p=20, lk=24, lean=-4, root_z=-0.03),
    "lunge": dict(root_z=0.15, lh_p=48, lk=50, rh_p=-34, rk=8, lean=16),
    "reach": dict(root_z=0.20, lh_p=54, lk=52, rh_p=-40, rk=6, lean=20),
    "crouch": dict(lh_p=42, lk=78, rh_p=30, rk=72, lean=22),
    "dash": dict(root_x=-0.22, lift=0.05, lh_p=30, lk=62, rh_p=-12, rk=42, lean=14, tilt=-14),
    "dash2": dict(root_x=-0.27, lift=0.02, lh_p=12, lk=30, rh_p=-22, rk=22, lean=10, tilt=-10),
    "land": dict(root_x=-0.13, lh_p=32, lk=48, rh_p=22, rk=44, lean=16, tilt=-4),
    "flinch": dict(rh_p=-8, rk=14, lh_p=10, lk=18, lean=-14, root_z=-0.04, head_p=-15, tilt=5),
    "knock": dict(rh_p=-26, rk=16, lh_p=6, lk=12, lean=-24, root_z=-0.10, head_p=-25, tilt=-4),
    "stagger": dict(lh_p=30, lk=46, rh_p=8, rk=40, lean=20, head_p=22, tilt=6),
    "kneel": dict(lh_p=78, lk=96, rh_p=-6, rk=112, lean=24, head_p=26),
    "collapse": dict(fall=48, lh_p=40, lk=70, rh_p=20, rk=70, lean=10, head_p=10),
    "lying": dict(fall=86, lh_p=4, lk=8, rh_p=-4, rk=12, head_p=-20, roll=4),
    "seat": dict(lh_p=82, lh_r=34, lk=88, rh_p=82, rh_r=34, rk=88, lean=8),
}

ARMS = {
    "blade": {
        "ready": dict(rs_p=38, rs_r=8, re=45, w_p=105, ls_p=-8, ls_r=18, le=35),
        "windup": dict(rs_p=158, rs_r=10, re=22, w_p=212, ls_p=40, ls_r=20, le=40, twist=-26),
        "strike": dict(rs_p=86, re=6, w_p=62, ls_p=-30, ls_r=25, le=20, twist=24),
        "follow": dict(rs_p=34, rs_r=14, re=12, w_p=-12, ls_p=-35, ls_r=25, le=20, twist=34),
        "raise": dict(rs_p=168, re=6, w_p=182, ls_p=60, ls_r=25, le=40),
        "release": dict(rs_p=96, re=0, w_p=96, ls_p=-20, ls_r=30, le=10),
        "guard": dict(rs_p=72, rs_r=-6, re=78, w_p=172, w_r=-40, ls_p=40, ls_r=10, le=70),
        "riposte": dict(rs_p=92, re=0, w_p=92, ls_p=-40, ls_r=30, le=10, twist=30),
    },
    "dual": {
        "ready": dict(rs_p=40, re=50, w_p=95, ls_p=36, ls_r=10, le=55, o_p=100),
        "windup": dict(rs_p=150, re=25, w_p=210, ls_p=-20, le=60, o_p=40, twist=-30),
        "strike": dict(rs_p=88, re=4, w_p=60, ls_p=80, le=20, o_p=110, twist=20),
        "follow": dict(rs_p=40, re=10, w_p=0, ls_p=100, le=5, o_p=60, twist=-20),
        "raise": dict(rs_p=160, re=10, w_p=180, ls_p=160, le=10, o_p=180),
        "release": dict(rs_p=96, re=0, w_p=96, ls_p=96, le=0, o_p=96),
        "guard": dict(rs_p=75, re=80, w_p=170, w_r=-40, ls_p=75, le=80, o_p=170, o_r=-40),
        "riposte": dict(rs_p=92, re=0, w_p=92, ls_p=60, le=20, o_p=50, twist=30),
    },
    "heavy": {
        "ready": dict(rs_p=30, re=52, w_p=156, two_hand=True),
        "windup": dict(rs_p=150, re=40, w_p=222, twist=-36, two_hand=True),
        "strike": dict(rs_p=72, re=18, w_p=40, twist=30, two_hand=True),
        "follow": dict(rs_p=22, re=28, w_p=-18, twist=42, two_hand=True),
        "raise": dict(rs_p=170, re=20, w_p=186, two_hand=True),
        "release": dict(rs_p=100, re=10, w_p=100, two_hand=True),
        "guard": dict(rs_p=62, re=80, w_p=160, w_r=-60, two_hand=True),
        "riposte": dict(rs_p=80, re=10, w_p=60, twist=34, two_hand=True),
    },
    "polearm": {
        "ready": dict(rs_p=24, re=66, w_p=100, two_hand=True),
        "windup": dict(rs_p=20, re=110, w_p=96, twist=-32, two_hand=True),
        "strike": dict(rs_p=88, re=2, w_p=92, twist=16, two_hand=True),
        "follow": dict(rs_p=76, re=12, w_p=68, twist=26, two_hand=True),
        "raise": dict(rs_p=160, re=10, w_p=170, two_hand=True),
        "release": dict(rs_p=100, re=4, w_p=110, two_hand=True),
        "guard": dict(rs_p=50, re=82, w_p=150, w_r=-70, two_hand=True),
        "riposte": dict(rs_p=90, re=0, w_p=90, twist=24, two_hand=True),
    },
    "caster": {
        "ready": dict(rs_p=22, rs_r=10, re=58, w_p=176, ls_p=12, ls_r=22, le=42),
        "windup": dict(rs_p=118, re=40, w_p=172, ls_p=70, ls_r=20, le=40, twist=-12),
        "strike": dict(rs_p=100, re=10, w_p=118, ls_p=92, le=8, twist=12),
        "follow": dict(rs_p=62, re=30, w_p=150, ls_p=60, le=30, twist=16),
        "raise": dict(rs_p=168, re=6, w_p=182, ls_p=150, ls_r=20, le=10),
        "release": dict(rs_p=108, re=0, w_p=112, ls_p=112, ls_r=10, le=0),
        "guard": dict(rs_p=82, re=70, w_p=172, w_r=-50, ls_p=70, le=60),
        "riposte": dict(rs_p=100, re=0, w_p=100, ls_p=96, le=0, twist=22),
    },
    "bow": {
        "ready": dict(ls_p=60, ls_r=6, le=20, rs_p=30, re=60, o_p=150, o_r=-10),
        "windup": dict(ls_p=88, ls_r=4, le=2, rs_p=86, rs_r=20, re=128, draw=1, o_p=178, o_r=-6, twist=-14),
        "strike": dict(ls_p=88, ls_r=4, le=2, rs_p=70, rs_r=34, re=30, o_p=178, o_r=-6, twist=-14, fx_extra=("arrow",)),
        "follow": dict(ls_p=80, le=10, rs_p=40, rs_r=30, re=40, o_p=170, twist=-6),
        "raise": dict(ls_p=130, le=4, rs_p=122, rs_r=20, re=110, draw=1, o_p=210),
        "release": dict(ls_p=130, le=4, rs_p=100, rs_r=36, re=30, o_p=210, fx_extra=("arrow",)),
        "guard": dict(ls_p=64, le=72, o_p=120, o_r=-80, rs_p=40, re=70),
        "riposte": dict(ls_p=88, le=2, rs_p=70, rs_r=34, re=30, o_p=178, twist=-10, fx_extra=("arrow",)),
    },
    "shield": {
        "ready": dict(ls_p=48, ls_r=10, le=62, rs_p=34, re=50, w_p=110),
        "windup": dict(ls_p=52, le=60, rs_p=152, re=30, w_p=206, twist=-20),
        "strike": dict(ls_p=40, le=60, rs_p=82, re=8, w_p=50, twist=22),
        "follow": dict(ls_p=40, le=60, rs_p=30, re=14, w_p=-10, twist=28),
        "raise": dict(ls_p=126, le=20, rs_p=146, re=20, w_p=190),
        "release": dict(ls_p=92, le=6, rs_p=60, re=30, w_p=90, twist=14),
        "guard": dict(ls_p=76, le=34, rs_p=40, re=60, w_p=120, twist=-10),
        "riposte": dict(ls_p=94, le=4, rs_p=80, re=10, w_p=60, twist=26),
    },
    "fist": {
        "ready": dict(rs_p=28, rs_r=12, re=82, ls_p=26, ls_r=12, le=82),
        "windup": dict(rs_p=-34, rs_r=20, re=100, ls_p=60, le=70, twist=-30),
        "strike": dict(rs_p=92, rs_r=4, re=0, ls_p=10, le=90, twist=30),
        "follow": dict(rs_p=30, re=80, ls_p=92, ls_r=4, le=0, twist=-22),
        "raise": dict(rs_p=168, rs_r=14, re=20, ls_p=168, ls_r=14, le=20),
        "release": dict(rs_p=72, re=0, ls_p=72, le=0, lean=20),
        "guard": dict(rs_p=70, re=118, ls_p=70, le=118),
        "riposte": dict(rs_p=92, re=0, ls_p=20, le=80, twist=28),
    },
}


def _arms(style, key):
    a = dict(ARMS[style][key])
    a.pop("fx_extra", None)
    return a


def _fx(style, key, *base):
    extra = ARMS[style][key].get("fx_extra", ())
    return list(base) + list(extra)


def breathe(style, i, legs="stance", amp=1.0, extra=None):
    s = math.sin(TAU * i / 6)
    base = mix(LEGS[legs], _arms(style, "ready"))
    p = dict(base)
    p["lean"] = base.get("lean", 0) + 1.6 * s * amp
    p["lk"] = base.get("lk", 0) + 3 * s * amp
    p["rk"] = base.get("rk", 0) + 3 * s * amp
    p["rs_p"] = base.get("rs_p", 0) + 3 * s * amp
    p["ls_p"] = base.get("ls_p", 0) - 2 * s * amp
    p["head_p"] = -2 * s * amp
    p["phase"] = TAU * i / 6
    p["wind"] = 0.32 + 0.12 * s
    if extra:
        p.update(extra)
    return p


def hero_rows(style):
    A = lambda k: _arms(style, k)  # noqa: E731
    rows = []
    rows.append([breathe(style, i) for i in range(6)])
    rows.append([
        mix(LEGS["stance"], A("ready"), phase=0.0),
        mix(LEGS["windup"], A("windup"), phase=1.0, wind=0.4),
        mix(LEGS["lunge"], A("strike"), phase=2.0, wind=0.7, fx=_fx(style, "strike", "slash")),
        mix(LEGS["reach"], A("follow"), phase=3.0, wind=0.8, fx=["slash_low"]),
        mix(lerp_pose(LEGS["stance"], LEGS["lunge"], 0.45), lerp_pose(A("follow"), A("ready"), 0.5), phase=4.0, wind=0.5),
        mix(LEGS["stance"], A("ready"), phase=5.0),
    ])
    rows.append([
        mix(LEGS["stance"], A("ready"), phase=0.0),
        mix(LEGS["wide"], lerp_pose(A("ready"), A("raise"), 0.5), phase=1.0, fx=["charge"]),
        mix(LEGS["wide"], A("raise"), phase=2.0, wind=0.6, fx=["charge", "ring"]),
        mix(lerp_pose(LEGS["stance"], LEGS["lunge"], 0.5), A("release"), phase=3.0, wind=0.8, fx=_fx(style, "release", "burst", "ring")),
        mix(LEGS["windup"], A("release"), phase=4.0, wind=0.6, fx=["ring"]),
        mix(LEGS["stance"], A("ready"), phase=5.0),
    ])
    rows.append([
        mix(LEGS["wide"], A("guard"), phase=0.0),
        mix(LEGS["windup"], A("guard"), twist=-16, phase=1.0, fx=["spark"]),
        mix(LEGS["crouch"], A("windup"), twist=-62, lean=14, phase=2.0, wind=0.8),
        mix(LEGS["lunge"], A("riposte"), phase=3.0, wind=0.9, fx=_fx(style, "riposte", "slash")),
        mix(LEGS["reach"], A("follow"), phase=4.0, wind=0.6),
        mix(LEGS["stance"], A("ready"), phase=5.0),
    ])
    rows.append([
        mix(LEGS["stance"], A("ready"), phase=0.0),
        mix(LEGS["crouch"], A("ready"), phase=1.0),
        mix(LEGS["dash"], A("ready"), phase=2.0, wind=1.0),
        mix(LEGS["dash2"], A("ready"), phase=3.0, wind=0.9),
        mix(LEGS["land"], A("ready"), phase=4.0, wind=0.5),
        mix(LEGS["stance"], A("ready"), phase=5.0),
    ])
    rows.append(hurt_faint_rows(style))
    return rows


def _drop(style):
    d = dict(rs_p=-10, rs_r=24, re=20, ls_p=-6, ls_r=24, le=18, w_p=40, o_p=30, two_hand=False)
    if style in ("heavy", "polearm"):
        d["w_p"] = 60
    return d


def hurt_faint_rows(style):
    A = lambda k: _arms(style, k)  # noqa: E731
    return [
        mix(LEGS["flinch"], A("ready"), rs_p=10, ls_p=30, ls_r=30, phase=0.0),
        mix(LEGS["knock"], A("ready"), rs_p=-14, rs_r=26, ls_p=-20, ls_r=34, phase=1.0, wind=0.9),
        mix(LEGS["stagger"], A("ready"), rs_p=10, ls_p=20, phase=2.0),
        mix(LEGS["kneel"], _drop(style), rs_p=20, w_p=60, phase=3.0),
        mix(LEGS["collapse"], _drop(style), rs_p=60, ls_p=50, w_p=120, phase=4.0),
        mix(LEGS["lying"], _drop(style), rs_p=150, rs_r=20, re=10, ls_p=140, ls_r=26, le=20, w_p=176, o_p=176, phase=5.0, wind=0.1),
    ]


def backward(row):
    """FRONT-view enemies fall onto their back (toward top-right, inside the cell) instead of
    face-down toward the heroes / bottom edge."""
    out = []
    for p in row:
        q = dict(p)
        if q.get("fall"):
            q["fall"] = -abs(q["fall"])
            q["head_p"] = -abs(q.get("head_p", 0.0)) * 0.5
            q["lean"] = -abs(q.get("lean", 0.0)) * 0.4
        out.append(q)
    return out


def enemy_rows(style):
    rows = _enemy_rows(style)
    rows[3] = backward(rows[3])
    return rows


def _enemy_rows(style):
    A = lambda k: _arms(style, k)  # noqa: E731
    return [
        [breathe(style, i, legs="wide", amp=1.2) for i in range(6)],
        [
            mix(LEGS["windup"], A("windup"), phase=0.0),
            mix(LEGS["lunge"], A("strike"), phase=1.0, wind=0.8, fx=_fx(style, "strike", "slash")),
            mix(LEGS["reach"], A("follow"), phase=2.0, wind=0.7),
            mix(LEGS["wide"], A("raise"), phase=3.0, fx=["charge"]),
            mix(LEGS["lunge"], A("release"), phase=4.0, wind=0.9, fx=_fx(style, "release", "slash_low", "burst")),
            mix(LEGS["wide"], A("ready"), phase=5.0),
        ],
        [
            mix(LEGS["flinch"], A("ready"), phase=0.0),
            mix(LEGS["knock"], A("ready"), rs_p=-10, ls_p=-16, ls_r=34, phase=1.0, wind=0.9),
            mix(LEGS["stagger"], A("ready"), phase=2.0),
            mix(LEGS["stagger"], A("ready"), tilt=-8, head_p=10, phase=3.0),
            mix(LEGS["windup"], A("ready"), phase=4.0),
            mix(LEGS["wide"], A("ready"), phase=5.0),
        ],
        [
            mix(LEGS["stagger"], A("ready"), phase=0.0),
            mix(LEGS["kneel"], _drop(style), phase=1.0),
            mix(LEGS["kneel"], _drop(style), lean=40, head_p=40, phase=2.0),
            mix(LEGS["collapse"], _drop(style), rs_p=60, ls_p=50, w_p=120, phase=3.0),
            mix(LEGS["lying"], _drop(style), rs_p=150, ls_p=140, w_p=176, o_p=176, phase=4.0),
            mix(LEGS["lying"], _drop(style), rs_p=152, ls_p=142, w_p=176, o_p=176, phase=4.5, wind=0.05),
        ],
    ]


def boss_rows(style):
    A = lambda k: _arms(style, k)  # noqa: E731
    er = enemy_rows(style)
    sweep = [
        mix(LEGS["wide"], A("ready"), phase=0.0),
        mix(LEGS["windup"], A("windup"), twist=-52, lean=-6, phase=1.0, wind=0.6),
        mix(LEGS["crouch"], A("windup"), twist=-58, lean=12, phase=2.0, wind=0.7, fx=["charge"]),
        mix(LEGS["reach"], A("strike"), twist=48, phase=3.0, wind=1.0, fx=["sweep"]),
        mix(LEGS["lunge"], A("follow"), twist=56, phase=4.0, wind=0.8, fx=["sweep"]),
        mix(LEGS["wide"], A("ready"), phase=5.0),
    ]
    awaken = [
        mix(LEGS["wide"], A("ready"), phase=0.0, fx=["aura"]),
        mix(LEGS["crouch"], A("guard"), lean=30, head_p=30, phase=1.0, fx=["aura", "ring"]),
        mix(LEGS["wide"], A("raise"), lean=-8, head_p=-25, phase=2.0, wind=0.8, fx=["aura", "ring", "charge"]),
        mix(LEGS["wide"], A("raise"), lean=-14, head_p=-35, lift=0.04, phase=3.0, wind=1.0, fx=["aura", "ring", "burst"]),
        mix(LEGS["wide"], A("release"), lean=10, phase=4.0, wind=0.9, fx=["aura", "burst"]),
        mix(LEGS["wide"], A("ready"), phase=5.0, fx=["aura"]),
    ]
    stagger = [
        mix(LEGS["flinch"], A("ready"), phase=0.0),
        mix(LEGS["knock"], A("ready"), phase=1.0, wind=0.9),
        mix(LEGS["stagger"], _drop(style), phase=2.0, fx=["stars"]),
        mix(LEGS["stagger"], _drop(style), tilt=-10, head_p=30, phase=3.0, fx=["stars"]),
        mix(LEGS["stagger"], _drop(style), tilt=8, head_p=26, phase=4.0, fx=["stars"]),
        mix(LEGS["windup"], A("ready"), phase=5.0),
    ]
    defeat = [
        mix(LEGS["stagger"], _drop(style), phase=0.0),
        mix(LEGS["kneel"], _drop(style), phase=1.0),
        mix(LEGS["kneel"], _drop(style), lean=44, head_p=44, phase=2.0),
        mix(LEGS["collapse"], _drop(style), rs_p=60, ls_p=50, w_p=120, phase=3.0),
        mix(LEGS["lying"], _drop(style), rs_p=150, ls_p=140, w_p=176, o_p=176, phase=4.0),
        mix(LEGS["lying"], _drop(style), rs_p=152, ls_p=142, w_p=176, o_p=176, phase=4.4, wind=0.05),
    ]
    return [er[0], er[1], sweep, awaken, stagger, backward(defeat)]


def humanoid_walk(style, i, run=False):
    p = TAU * i / 6
    s, c = math.sin(p), math.cos(p)
    amp = 34 if run else 26
    base = dict(_arms(style, "ready"))
    base.pop("twist", None)
    # carry pose: weapon low, arms swinging
    w = dict(
        lh_p=amp * s, lk=8 + 34 * max(0.0, -c), rh_p=-amp * s, rk=8 + 34 * max(0.0, c),
        lean=6, phase=p, wind=0.45, head_p=0,
    )
    arms = dict(base)
    if style in ("blade", "fist"):
        arms.update(rs_p=-20 * s + 10, re=30, w_p=30, ls_p=20 * s, ls_r=10, le=20)
    elif style == "dual":
        arms.update(rs_p=-20 * s + 10, re=30, w_p=30, ls_p=20 * s + 10, le=30, o_p=30)
    elif style == "bow":
        arms.update(ls_p=20 * s + 10, le=20, o_p=160, rs_p=-20 * s, re=20)
    elif style == "shield":
        arms.update(ls_p=40, le=60, rs_p=-18 * s + 10, re=30, w_p=40)
    else:
        arms.update(rs_p=base.get("rs_p", 20) - 8 * s)
    return mix(w, arms)


def humanoid_idle(style, i):
    s = math.sin(TAU * i / 6)
    arms = dict(_arms(style, "ready"))
    if style in ("blade", "fist"):
        arms.update(rs_p=8, re=24, w_p=40, ls_p=0, ls_r=10, le=16)
    return mix(dict(rh_p=-2, lh_p=2, rk=2 + 3 * s, lk=2 + 3 * s, lean=2 + s), arms, phase=TAU * i / 6, wind=0.25 + 0.1 * s, head_p=-1.5 * s)


# ---------------------------------------------------------------- quadruped


def quad_walk(i, amp=24, run=False):
    p = TAU * i / 6
    s, c = math.sin(p), math.cos(p)
    a = amp * (1.3 if run else 1.0)
    return dict(
        fl=a * s, br=a * s, fr=-a * s, bl=-a * s,
        fl_k=30 * max(0.0, c), fr_k=30 * max(0.0, -c), bl_k=20 * max(0.0, -c), br_k=20 * max(0.0, c),
        bob=0.012 * abs(c), tail_wag=0.6 * s, phase=p, head_p=2 * s,
    )


def quad_rows(kind="pounce"):
    idle = []
    for i in range(6):
        s = math.sin(TAU * i / 6)
        idle.append(dict(bob=-0.012 * s, tail_wag=0.5 * s, head_p=-3 * s, neck_p=2 * s, fl=4, br=-4, phase=TAU * i / 6))
    if kind == "charge":
        attack = [
            dict(body_p=-6, head_p=-25, neck_p=-20, fl=-10, fr=10, bl_k=20, br_k=20),
            dict(body_p=-10, head_p=-40, neck_p=-25, root_z=0.12, fl=30, fr=-20, bl=-30, br=20),
            dict(body_p=-12, head_p=-45, neck_p=-30, root_z=0.32, fl=-20, fr=34, bl=26, br=-30, fx=["bite"]),
            dict(body_p=8, head_p=10, neck_p=20, root_z=0.30, fl=40, fr=20, fl_k=40, fx=["bite"]),
            dict(body_p=2, head_p=-10, root_z=0.12, fl=10, br=-10),
            dict(),
        ]
    elif kind == "rear":
        attack = [
            dict(body_p=10, head_p=10, neck_p=15, fl=20, fl_k=40),
            dict(body_p=32, head_p=20, neck_p=20, fl=60, fl_k=70, fr=50, fr_k=60, jaw=20),
            dict(body_p=8, head_p=-20, root_z=0.22, fl=-20, fr=-10, jaw=30, fx=["bite"]),
            dict(body_p=-6, head_p=-25, root_z=0.26, fl=30, fr=-20, fx=["ring"]),
            dict(body_p=0, root_z=0.10, fl=10),
            dict(),
        ]
    elif kind == "breath":
        attack = [
            dict(body_p=6, head_p=20, neck_p=25, jaw=10, flap=0.6),
            dict(body_p=10, head_p=30, neck_p=30, jaw=20, flap=1.0, fx=["aura"]),
            dict(body_p=-4, head_p=-15, neck_p=-5, jaw=45, root_z=0.06, flap=0.2, fx=["breath"]),
            dict(body_p=-4, head_p=-18, neck_p=-8, jaw=50, root_z=0.08, flap=0.0, fx=["breath", "bite"]),
            dict(body_p=0, head_p=0, jaw=10, root_z=0.04, flap=0.4),
            dict(flap=0.2),
        ]
    else:  # pounce / bite
        attack = [
            dict(body_p=-8, head_p=-12, neck_p=-12, fl=-14, fr=-8, fl_k=30, fr_k=30, bl_k=40, br_k=40, bob=-0.05),
            dict(body_p=12, head_p=-5, root_z=0.14, lift=0.14, fl=55, fr=48, fl_k=30, fr_k=20, bl=-40, br=-34, jaw=30),
            dict(body_p=-4, head_p=-18, root_z=0.30, lift=0.06, fl=40, fr=30, bl=-20, br=-26, jaw=45, fx=["bite"]),
            dict(body_p=-8, head_p=-12, root_z=0.32, fl=-10, fr=10, jaw=10, fx=["bite"]),
            dict(body_p=-2, root_z=0.14, fl=10, br=-10),
            dict(),
        ]
    hurt = [
        dict(body_p=10, head_p=25, neck_p=10, root_z=-0.06, jaw=20),
        dict(body_p=14, head_p=30, neck_p=12, root_z=-0.14, fl=20, fr=30, jaw=30),
        dict(body_p=-6, head_p=-10, root_z=-0.10, bl_k=40, br_k=40, bob=-0.04),
        dict(body_p=-4, head_p=-20, root_z=-0.08, bl_k=30, br_k=30, fx=["stars"]),
        dict(body_p=0, head_p=-6, root_z=-0.03),
        dict(),
    ]
    faint = [
        dict(body_p=-6, head_p=-20, bl_k=40, br_k=40, fl_k=20, fr_k=20),
        dict(body_p=-10, head_p=-30, fl=30, fr=30, fl_k=80, fr_k=80, bl_k=60, br_k=60),
        dict(roll=30, head_p=-20, fl=20, fl_k=60, bl_k=60),
        dict(roll=62, head_p=-10, fl=30, fr=40, bl=-20, br=-30),
        dict(roll=86, head_p=0, fl=34, fr=44, bl=-24, br=-34, tail_wag=0.0),
        dict(roll=88, head_p=4, fl=36, fr=46, bl=-26, br=-36, tail_wag=0.1),
    ]
    for row in (attack, hurt, faint):
        for i, p in enumerate(row):
            p.setdefault("phase", TAU * i / 6)
    return [idle, attack, hurt, faint]


def generic_rows(kind):
    """Rows for blob / serpent / arthropod / flyer / floater rigs."""
    ph = lambda i: TAU * i / 6  # noqa: E731
    if kind == "blob":
        idle = [dict(squash=0.12 * math.sin(ph(i)), phase=ph(i)) for i in range(6)]
        attack = [dict(squash=0.45), dict(squash=-0.4, lift=0.20, root_z=0.12), dict(squash=-0.2, lift=0.10, root_z=0.26),
                  dict(squash=0.6, root_z=0.34, fx=["ring"], jaw=1), dict(squash=0.2, root_z=0.18), dict(squash=0.0)]
        hurt = [dict(squash=0.4, root_z=-0.06), dict(squash=-0.3, root_z=-0.12), dict(squash=0.3, root_z=-0.1, fx=["stars"]), dict(squash=0.1, root_z=-0.06, fx=["stars"]), dict(squash=-0.05), dict()]
        faint = [dict(squash=0.3), dict(squash=0.6), dict(squash=0.9), dict(squash=1.2), dict(squash=1.45), dict(squash=1.6)]
    elif kind == "serpent":
        idle = [dict(phase=ph(i), rise=0.05 * math.sin(ph(i)), head_p=10 + 4 * math.sin(ph(i))) for i in range(6)]
        attack = [dict(rise=0.25, head_p=-10, strike=-0.2), dict(rise=0.30, head_p=-20, jaw=30, strike=-0.3), dict(strike=1.0, rise=-0.15, head_p=20, jaw=55, fx=["bite"]),
                  dict(strike=1.1, rise=-0.25, head_p=25, jaw=40, fx=["bite"]), dict(strike=0.4, rise=0.0, jaw=10), dict()]
        hurt = [dict(rise=-0.1, strike=-0.3, head_p=-20, jaw=30), dict(rise=-0.25, strike=-0.5, head_p=-30, jaw=35), dict(rise=-0.3, strike=-0.3, fx=["stars"]), dict(rise=-0.2, strike=-0.2, fx=["stars"]), dict(rise=-0.1), dict()]
        faint = [dict(rise=-0.2, head_p=20), dict(rise=-0.4, head_p=30), dict(rise=-0.6, head_p=40), dict(rise=-0.78, head_p=45, roll=20), dict(rise=-0.84, head_p=45, roll=40), dict(rise=-0.86, head_p=45, roll=45)]
    elif kind == "arthropod":
        idle = [dict(phase=ph(i), bob=0.01 * math.sin(ph(i)), pinch=0.5 + 0.5 * math.sin(ph(i)), walk=0.1) for i in range(6)]
        attack = [dict(reach=-0.4, body_p=6, sting=-0.4), dict(reach=1.0, pinch=1.0, root_z=0.14, body_p=-4), dict(reach=1.2, pinch=0.0, root_z=0.22, fx=["bite"]),
                  dict(sting=1.0, root_z=0.22, body_p=-10, fx=["bite"]), dict(sting=0.3, reach=0.3, root_z=0.1), dict()]
        hurt = [dict(body_p=12, root_z=-0.06, reach=-0.5), dict(body_p=16, root_z=-0.14, reach=-0.6, sting=-0.5), dict(body_p=-6, root_z=-0.1, fx=["stars"]), dict(root_z=-0.08, fx=["stars"]), dict(root_z=-0.03), dict()]
        faint = [dict(body_p=-8, bob=-0.05), dict(body_p=-12, bob=-0.1, reach=-0.6), dict(roll=50, bob=-0.05), dict(roll=110), dict(roll=170, walk=0.4, phase=1.0), dict(roll=178, walk=0.2, phase=2.5)]
    elif kind == "flyer":
        idle = [dict(flap=math.sin(ph(i)) * 0.8 + 0.2, bob=0.03 * math.sin(ph(i)), phase=ph(i), step=math.sin(ph(i))) for i in range(6)]
        attack = [dict(flap=1.0, bob=0.10, body_p=10, flap_on=True), dict(flap=-0.4, bob=0.14, body_p=20, flap_on=True), dict(flap=0.4, bob=-0.05, root_z=0.26, body_p=-30, flap_on=True, jaw=1, fx=["bite"]),
                  dict(flap=0.9, bob=-0.02, root_z=0.30, body_p=-20, flap_on=True, fx=["bite"]), dict(flap=0.2, bob=0.05, root_z=0.12, flap_on=True), dict(flap=0.6)]
        hurt = [dict(flap=-0.6, bob=0.0, root_z=-0.08, body_p=20, flap_on=True), dict(flap=-0.8, bob=-0.04, root_z=-0.14, body_p=30, flap_on=True), dict(flap=0.6, root_z=-0.1, fx=["stars"], flap_on=True), dict(flap=-0.2, root_z=-0.06, fx=["stars"], flap_on=True), dict(flap=0.4, flap_on=True), dict(flap=0.6)]
        faint = [dict(flap=-0.8, bob=-0.05, flap_on=True), dict(flap=-0.9, bob=-0.15, body_p=30, flap_on=True), dict(flap=-0.9, bob=-0.25, body_p=50, flap_on=True), dict(roll=50, bob=-0.3, flap=-0.5, flap_on=True), dict(roll=84, bob=-0.35, flap=-0.2, flap_on=True), dict(roll=88, bob=-0.35, flap=-0.2, flap_on=True)]
    else:  # floater
        idle = [dict(phase=ph(i), bob=0.03 * math.sin(ph(i)), pulse=math.sin(ph(i))) for i in range(6)]
        attack = [dict(lean=-14, bob=0.06, pulse=0.6), dict(lean=-20, bob=0.08, reach=0.5, pulse=1.0, fx=["aura"]), dict(lean=24, root_z=0.24, reach=1.0, jaw=1, fx=["bite"]),
                  dict(lean=20, root_z=0.26, reach=0.8, fx=["bite", "ring"]), dict(lean=6, root_z=0.10, reach=0.2), dict()]
        hurt = [dict(lean=-20, root_z=-0.06, pulse=-0.5), dict(lean=-28, root_z=-0.14, pulse=-0.8), dict(lean=10, root_z=-0.1, fx=["stars"]), dict(lean=4, root_z=-0.06, fx=["stars"]), dict(root_z=-0.03), dict()]
        faint = [dict(lean=10, bob=-0.05), dict(lean=20, bob=-0.12), dict(lean=30, bob=-0.2, roll=20), dict(lean=40, bob=-0.26, roll=50), dict(lean=50, bob=-0.3, roll=80), dict(lean=52, bob=-0.3, roll=86)]
    rows = [idle, attack, hurt, faint]
    for row in rows:
        for i, p in enumerate(row):
            p.setdefault("phase", ph(i))
    return rows


def generic_walk(kind, i):
    p = TAU * i / 6
    s = math.sin(p)
    if kind == "blob":
        return dict(squash=0.25 * s, lift=0.06 * max(0.0, -s), phase=p)
    if kind == "serpent":
        return dict(phase=p * 1.0, rise=0.02 * s)
    if kind == "arthropod":
        return dict(phase=p, walk=1.0, bob=0.01 * abs(s))
    if kind == "flyer":
        return dict(flap=math.sin(p) * 0.9, bob=0.04 * math.sin(p), phase=p, step=s)
    return dict(phase=p, bob=0.04 * s, pulse=s)


def boss_from_enemy(rows):
    """Promote a 4-row enemy table to the 6 boss rows (non-humanoid bosses)."""
    idle, attack, hurt, faint = rows
    heavy = [dict(p) for p in attack]
    for p in heavy:
        if p.get("fx"):
            p["fx"] = list(p["fx"]) + ["ring"]
    awaken = []
    for i in range(6):
        p = dict(idle[i])
        p["fx"] = ["aura"] + (["ring"] if i in (2, 3, 4) else []) + (["burst"] if i == 3 else [])
        if "jaw" not in p:
            p["jaw"] = 40 if i in (2, 3) else 0
        p["flap"] = 1.0 if i in (2, 3) else p.get("flap", 0.0)
        awaken.append(p)
    stagger = [dict(p) for p in hurt]
    for p in stagger[2:5]:
        p["fx"] = ["stars"]
    return [idle, attack, heavy, awaken, stagger, faint]
