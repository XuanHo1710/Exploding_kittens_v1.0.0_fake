"""
tools/bansung/night_art/bosses.py

9 BOSS ZOMBIE cho chế độ "Đêm Zombie" (spec 007) — vẽ procedural theo rig, ô 96×96,
chân tại (48, 93) khớp `offX -48 / offY -94` hiện có trong manifest → render & hitbox không đổi.

Chuẩn: alpha nhị phân 0/255, viền 1 px #1b1726, ánh sáng chính trên-trái + viền sáng trăng
(rim light xanh lạnh) phía sau-phải để nổi khối trong bóng đêm, dither Bayer 4×4 giữa 4 tông.

| Boss gameplay ID        | Tên zombie (EN) | Ý tưởng hình                                   |
|-------------------------|-----------------|-----------------------------------------------|
| boss_beholder           | Brood Eye       | Khối thịt nhiều mắt, mắt chính khổng lồ, gai xương, xúc tu làm chân |
| boss_colossus           | Iron Hulk       | Zombie khổng lồ bị đóng giáp sắt, lò lửa ở ngực, nắm đấm thép     |
| boss_overlord           | Plague Core     | Lồng xương sườn bay, tim dịch bệnh phát sáng, ống truyền rỉ độc  |
| boss_arsenal            | Gunner          | Xác lính cụt tay gắn súng máy 6 nòng, băng đạn, mũ sắt            |
| boss_tempest            | Storm Wraith    | Bóng ma trùm áo rách bay lơ lửng, vương miện sét                  |
| boss_destroyer          | Butcher         | Đồ tể béo phị, tạp dề đẫm máu, dao phay khổng lồ, móc xích        |
| boss_frost_empress      | Frost Queen     | Xác nữ hoàng đóng băng, vương miện băng, váy băng, quyền trượng   |
| boss_abyssal_leviathan  | Drowned Maw     | Thủy quái trương phình, hàm khổng lồ, hà bám, xúc tu              |
| boss_storm_herald       | Volt Twins      | Zombie hai đầu (vàng/xanh), cột thu lôi sau lưng, hồ quang        |

Mỗi boss 34–47 frame (idle 8 · move 8 · attack 12 · stun 6 · dead 10, hoặc theo clip riêng).
"""
from __future__ import annotations

import math

from pixel import Canvas, hexc, ramp, mix, rotate_about, strip, OUTLINE

CELL = 96
FOOT = 93
CX = 48

MOON = (150, 178, 230, 255)
BLOOD = hexc('#6b0f1a')
BLOOD_L = hexc('#a61e2d')
BLOOD_D = hexc('#3d0710')
BONE = '#d8cfb2'
VOID_EYE = (255, 255, 255, 255)

_LX, _LY, _LZ = -0.48, -0.62, 0.62
_LN = math.sqrt(_LX * _LX + _LY * _LY + _LZ * _LZ)
_LX, _LY, _LZ = _LX / _LN, _LY / _LN, _LZ / _LN

ROUGH_SCALE = 0.45

BAYER4 = (
    (0, 8, 2, 10),
    (12, 4, 14, 6),
    (3, 11, 1, 9),
    (15, 7, 13, 5),
)


def _clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


def _hash(x, y, s=0):
    h = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791)
    h = (h ^ (h >> 13)) * 1274126177
    return (h ^ (h >> 16)) & 0xFFFF


def ease(t):
    t = _clamp(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------------------
# Shading primitives (dither 4 tông + rim light trăng)
# ---------------------------------------------------------------------------

def _tone(rp, nx, ny, nz, x, y, bias=0.0, rim=True):
    lam = nx * _LX + ny * _LY + nz * _LZ
    inten = 0.16 + 0.84 * max(0.0, lam) + bias
    v = inten * 3.55 - 0.25 + (BAYER4[y & 3][x & 3] / 16.0 - 0.47) * 0.55
    idx = int(_clamp(int(v), 0, 3))
    col = rp[idx]
    if rim and nx > 0.66 and ny > -0.3 and nz < 0.7:
        col = mix(col, MOON, 0.3)
    return col


def orb(c, cx, cy, rx, ry, rp, rough=0, seed=0, rim=True, bias=0.0):
    rx = max(0.6, rx)
    ry = max(0.6, ry)
    for y in range(int(math.floor(cy - ry)), int(math.ceil(cy + ry)) + 1):
        for x in range(int(math.floor(cx - rx)), int(math.ceil(cx + rx)) + 1):
            dx = (x - cx) / rx
            dy = (y - cy) / ry
            d = dx * dx + dy * dy
            if d > 1.0:
                continue
            nz = math.sqrt(1.0 - d)
            col = _tone(rp, dx, dy, nz, x, y, bias, rim)
            if rough and _hash(x, y, seed) % 100 < rough * ROUGH_SCALE:
                col = rp[max(0, rp.index(col) - 1)] if col in rp else rp[1]
            c.set(x, y, col)


def capsule(c, x0, y0, x1, y1, r0, r1, rp, rough=0, seed=0, rim=True, bias=0.0):
    """Khối trụ thuôn có đổ bóng thật (không bị 'sâu đo' do chồng hình tròn)."""
    vx, vy = x1 - x0, y1 - y0
    l2 = vx * vx + vy * vy
    rmax = max(r0, r1)
    for y in range(int(math.floor(min(y0, y1) - rmax)), int(math.ceil(max(y0, y1) + rmax)) + 1):
        for x in range(int(math.floor(min(x0, x1) - rmax)), int(math.ceil(max(x0, x1) + rmax)) + 1):
            t = 0.0 if l2 < 1e-6 else _clamp(((x - x0) * vx + (y - y0) * vy) / l2, 0.0, 1.0)
            px = x0 + vx * t
            py = y0 + vy * t
            r = r0 + (r1 - r0) * t
            ox, oy = x - px, y - py
            d2 = ox * ox + oy * oy
            if d2 > r * r:
                continue
            nx, ny = ox / max(0.5, r), oy / max(0.5, r)
            nz = math.sqrt(max(0.0, 1.0 - nx * nx - ny * ny))
            col = _tone(rp, nx, ny, nz, x, y, bias, rim)
            if rough and _hash(x, y, seed) % 100 < rough * ROUGH_SCALE:
                col = rp[1] if col is not rp[0] else rp[0]
            c.set(x, y, col)


def _scan_poly(pts):
    ys = [p[1] for p in pts]
    n = len(pts)
    for y in range(int(math.floor(min(ys))), int(math.ceil(max(ys))) + 1):
        xs = []
        for i in range(n):
            ax, ay = pts[i]
            bx, by = pts[(i + 1) % n]
            if (ay <= y < by) or (by <= y < ay):
                xs.append(ax + (y - ay) * (bx - ax) / (by - ay))
        xs.sort()
        for i in range(0, len(xs) - 1, 2):
            for x in range(int(math.ceil(xs[i])), int(math.floor(xs[i + 1])) + 1):
                yield x, y


def cloth(c, pts, rp, rough=0, seed=0, folds=0.0, rim=True):
    """Đa giác vải/da có gradient ngang (trái sáng → phải tối) + nếp gấp sin."""
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    w = max(1.0, x1 - x0)
    h = max(1.0, y1 - y0)
    for x, y in _scan_poly(pts):
        u = (x - x0) / w * 2 - 1
        v = (y - y0) / h
        fold = math.sin(x * 0.55 + v * 3.0) * folds
        nx = _clamp(u * 0.85 + fold, -1, 1)
        ny = _clamp(-0.35 + v * 0.75, -1, 1)
        nz = math.sqrt(max(0.05, 1 - nx * nx * 0.6 - ny * ny * 0.4))
        col = _tone(rp, nx, ny, nz, x, y, 0.0, rim)
        if rough and _hash(x, y, seed) % 100 < rough * ROUGH_SCALE:
            col = rp[1]
        c.set(x, y, col)


def plate(c, x0, y0, x1, y1, rp, rivets=True):
    dark, shadow, mid, light = rp
    c.rect(x0, y0, x1, y1, mid)
    c.rect(x0, y0, x1, y0, light)
    c.rect(x0, y0, x0, y1, light)
    c.rect(x1, y0 + 1, x1, y1, shadow)
    c.rect(x0 + 1, y1, x1, y1, dark)
    if rivets and x1 - x0 >= 5 and y1 - y0 >= 4:
        for (rx, ry) in ((x0 + 1, y0 + 1), (x1 - 1, y0 + 1), (x0 + 1, y1 - 1), (x1 - 1, y1 - 1)):
            c.set(rx, ry, light)
            c.set(rx + 1, ry + 1, dark)


def glow(c, cx, cy, r, core, mid_col=None, edge=None):
    """Đốm phát sáng 3 lớp (không anti-alias)."""
    if edge is not None and r >= 2:
        c.ellipse(cx, cy, r, r, edge)
    if mid_col is not None:
        c.ellipse(cx, cy, max(0.6, r * 0.66), max(0.6, r * 0.66), mid_col)
    c.ellipse(cx, cy, max(0.5, r * 0.34), max(0.5, r * 0.34), core)


def eye(c, x, y, col, size=1):
    if size <= 1:
        c.set(x, y, col)
        c.set(x + 1, y, (255, 255, 255, 255))
    else:
        c.ellipse(x, y, size, size * 0.7, col)
        c.set(x, y, (255, 255, 255, 255))


def bolt(c, x0, y0, x1, y1, col, core=None, seed=0, jag=3.0, steps=7):
    """Tia sét zig-zag xác định (seed theo frame để nhấp nháy)."""
    pts = [(x0, y0)]
    for i in range(1, steps):
        t = i / steps
        px = x0 + (x1 - x0) * t
        py = y0 + (y1 - y0) * t
        off = ((_hash(i, seed, 7) % 200) / 100.0 - 1.0) * jag
        nx, ny = -(y1 - y0), (x1 - x0)
        nl = math.hypot(nx, ny) or 1.0
        pts.append((px + nx / nl * off, py + ny / nl * off))
    pts.append((x1, y1))
    for i in range(len(pts) - 1):
        c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], col, 2)
    if core:
        for i in range(len(pts) - 1):
            c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], core, 1)


def drip(c, x, y, length, col=BLOOD, tip=BLOOD_L):
    for k in range(int(length)):
        c.set(x, y + k, col)
    c.set(x, y + int(length), tip)


def stitches(c, x0, y0, x1, y1, n=4, col=(30, 24, 28, 255)):
    c.line(x0, y0, x1, y1, col, 1)
    for i in range(n + 1):
        t = i / max(1, n)
        px = x0 + (x1 - x0) * t
        py = y0 + (y1 - y0) * t
        c.set(px - 1, py - 1, col)
        c.set(px + 1, py + 1, col)


def teeth(c, x0, y, x1, down=True, col=hexc('#e9e1c4'), gap=2):
    for x in range(int(x0), int(x1) + 1, gap):
        c.set(x, y, col)
        c.set(x, y + (1 if down else -1), col)


def blood_pool(c, cx, cy, rx, ry, seed=0):
    c.ellipse(cx, cy, rx, ry, BLOOD_D)
    c.ellipse(cx - rx * 0.15, cy - ry * 0.15, rx * 0.72, ry * 0.6, BLOOD)
    c.ellipse(cx - rx * 0.32, cy - ry * 0.32, rx * 0.25, ry * 0.25, BLOOD_L)
    for k in range(5):
        a = (_hash(k, seed, 3) % 628) / 100.0
        c.ellipse(cx + math.cos(a) * rx * 1.1, cy + math.sin(a) * ry * 1.1, 1.4, 1.0, BLOOD)


# ---------------------------------------------------------------------------
# Pose
# ---------------------------------------------------------------------------

class Pose:
    def __init__(self, clip, i, n):
        self.clip = clip
        self.i = i
        self.n = n
        self.t = i / max(1, n)
        tau = math.pi * 2 * self.t
        self.breath = math.sin(tau)
        self.bob = 0
        self.phase = 0.0
        self.moving = False
        self.wind = 0.0
        self.strike = 0.0
        self.stun = 0.0
        self.sway = 0.0
        self.die = 0.0
        self.extra = 0.0
        if clip in ('idle', 'core_idle'):
            self.bob = int(round(math.sin(tau) * 1.2))
        elif clip in ('run', 'move', 'charge_run'):
            self.moving = True
            self.phase = tau
            self.bob = int(round(abs(math.sin(tau)) * 3.0)) - 1
        elif clip in ('attack', 'beam_windup', 'volley_cast', 'slam_leap', 'enrage_roar', 'charge', 'laser'):
            t = self.t
            self.wind = ease(t / 0.45) if t < 0.45 else max(0.0, 1.0 - (t - 0.45) / 0.18)
            self.strike = 0.0 if t < 0.42 else (1.0 if t < 0.7 else max(0.0, 1.0 - (t - 0.7) / 0.3))
            self.extra = math.sin(tau)
        elif clip in ('stun', 'stagger', 'overheat_stun'):
            self.stun = 1.0
            self.sway = math.sin(tau)
            self.bob = 2
        elif clip == 'dead':
            self.die = i / max(1, n - 1)
            self.stun = 1.0


# ---------------------------------------------------------------------------
# Common rig: legs, arms
# ---------------------------------------------------------------------------

def legs(c, P, hip_l, hip_r, foot_dx=0, r=6, pants='#3a3a4a', boot='#2b2622', stride=10, crouch=0):
    rp_p = ramp(pants)
    rp_b = ramp(boot)
    s = math.sin(P.phase) if P.moving else 0.0
    lift_b = int(round(max(0.0, -math.cos(P.phase)) * 3)) if P.moving else 0
    lift_f = int(round(max(0.0, math.cos(P.phase)) * 3)) if P.moving else 0
    for (hx, hy), sgn, lift, dark in ((hip_l, -1, lift_b, True), (hip_r, 1, lift_f, False)):
        fx = hx + foot_dx + sgn * stride * s * (1 if sgn > 0 else -1) * (-1 if dark else 1)
        fy = FOOT - 2 - lift
        kx = (hx + fx) / 2 + 2
        ky = (hy + fy) / 2 - 1 + crouch
        rp = (rp_p[0], rp_p[0], rp_p[1], rp_p[2]) if dark else rp_p
        capsule(c, hx, hy, kx, ky, r, r * 0.9, rp, rough=6, seed=3)
        capsule(c, kx, ky, fx, fy - 3, r * 0.9, r * 0.75, rp, rough=6, seed=4)
        bp = (rp_b[0], rp_b[0], rp_b[1], rp_b[2]) if dark else rp_b
        orb(c, fx + 2, fy, r * 0.95 + 1, r * 0.6, bp)


# ---------------------------------------------------------------------------
# 1. Iron Hulk (boss_colossus)
# ---------------------------------------------------------------------------

def draw_hulk(c, P):
    skin = ramp('#7f8f6a')
    iron = ramp('#5f6876')
    rust = ramp('#8a4a2a')
    heat = 0.35 + 0.65 * max(P.wind, P.stun * (0.5 + 0.5 * P.sway))
    yb = P.bob + P.stun * 3
    # chain behind
    for k in range(6):
        c.set(30 + k, 62 + yb + (k % 2), iron[1])
    legs(c, P, (40, 62 + yb), (56, 62 + yb), r=8, pants='#3b3530', boot='#4a4f58', stride=11, crouch=P.stun * 2)
    # back arm
    sw = math.sin(P.phase) * 6 if P.moving else 0
    capsule(c, 30, 38 + yb, 26 - P.wind * 4 - sw, 62 + yb, 8, 7, (skin[0], skin[0], skin[1], skin[2]), rough=10, seed=5)
    orb(c, 25 - P.wind * 4 - sw, 66 + yb, 8, 7, (iron[0], iron[0], iron[1], iron[2]))
    # torso
    orb(c, 48, 46 + yb, 23, 19, skin, rough=12, seed=6)
    for k in range(4):
        c.set(36 + k * 3, 52 + yb + (k & 1), hexc('#5d4a6a'))  # vết bầm
    cloth(c, [(30, 34 + yb), (66, 32 + yb), (64, 56 + yb), (34, 58 + yb)], iron, rough=4, seed=7)
    for px in (33, 41, 49, 57):
        plate(c, px, 36 + yb, px + 7, 44 + yb, iron)
    # furnace grate
    hot = mix(hexc('#ff6a00'), hexc('#fff3a0'), heat)
    c.rect(43, 46 + yb, 55, 54 + yb, hexc('#1c1418'))
    for gy in range(47, 54, 2):
        c.rect(44, gy + yb, 54, gy + yb, hot)
    c.rect(44, 47 + yb, 44, 53 + yb, rust[1])
    c.rect(54, 47 + yb, 54, 53 + yb, rust[1])
    # belt + loincloth
    c.rect(32, 57 + yb, 64, 59 + yb, rust[0])
    c.rect(47, 57 + yb, 50, 59 + yb, rust[3])
    # pauldrons
    orb(c, 31, 33 + yb, 10, 8, iron, rough=6, seed=8)
    orb(c, 65, 32 + yb, 11, 9, iron, rough=6, seed=9)
    for k in range(3):
        c.line(60 + k * 4, 25 + yb, 62 + k * 4, 30 + yb, hexc('#c8ccd4'), 1)
    # head (sunk)
    orb(c, 53, 25 + yb + P.stun * 2, 8, 8, skin, rough=14, seed=10)
    c.rect(47, 21 + yb, 59, 23 + yb, iron[2])  # mặt nạ sắt hàn
    c.rect(47, 21 + yb, 59, 21 + yb, iron[3])
    eye_c = hexc('#ff3b3b') if P.stun < 1 else hexc('#ff9a66')
    eye(c, 55, 26 + yb, eye_c)
    eye(c, 51, 26 + yb, eye_c)
    c.rect(51, 30 + yb, 58, 31 + yb, (40, 10, 16, 255))
    teeth(c, 52, 30 + yb, 57)
    # front arm (slam)
    if P.wind > 0 or P.strike > 0:
        ex, ey = 70 + P.strike * 8, max(14, 30 - P.wind * 14 + P.strike * 30)
        fx, fy = 66 + P.strike * 14, max(12, 18 - P.wind * 6 + P.strike * 66)
        fy = min(fy, 82)
    else:
        ex, ey = 72, 50 + yb
        fx, fy = 70 + (math.sin(P.phase) * 6 if P.moving else 0), 68 + yb
    capsule(c, 66, 38 + yb, ex, ey, 9, 8, skin, rough=10, seed=11)
    capsule(c, ex, ey, fx, fy, 8, 7, skin, rough=10, seed=12)
    orb(c, fx + 1, fy + 2, 10, 9, iron, rough=4, seed=13)
    for k in range(3):
        c.set(fx - 4 + k * 4, fy - 4, iron[3])
    if P.strike > 0.6:
        for k in range(5):
            a = math.pi * (0.9 + k * 0.08)
            c.line(fx + 1, 90, fx + 1 + math.cos(a) * -14, 90 + math.sin(a) * 6, hexc('#a08a6a'), 1)
    # drips
    drip(c, 40, 59 + yb, 3)
    drip(c, 58, 56 + yb, 2)


# ---------------------------------------------------------------------------
# 2. Butcher (boss_destroyer)
# ---------------------------------------------------------------------------

def draw_butcher(c, P):
    skin = ramp('#a8867f')
    apron = ramp('#d6cfbb')
    blade = ramp('#a9b2bc')
    yb = P.bob + P.stun * 3
    legs(c, P, (40, 72 + yb), (56, 72 + yb), r=8, pants='#3a3440', boot='#2a2420', stride=9)
    # back arm with hook
    capsule(c, 30, 40 + yb, 22, 60 + yb + P.sway * 2, 8, 7, (skin[0], skin[0], skin[1], skin[2]), rough=12, seed=21)
    c.line(22, 62 + yb, 22, 72 + yb, ramp('#6b6f78')[2], 1)
    c.line(22, 72 + yb, 19, 76 + yb, ramp('#9aa0a8')[3], 2)
    # belly + chest
    orb(c, 48, 58 + yb, 25, 21, skin, rough=10, seed=22)
    orb(c, 48, 38 + yb, 20, 14, skin, rough=10, seed=23)
    stitches(c, 40, 46 + yb, 56, 66 + yb, 5)
    # apron
    cloth(c, [(40, 44 + yb), (58, 44 + yb), (62, 82 + yb), (36, 82 + yb)], apron, rough=5, seed=24, folds=0.25)
    c.line(36, 40 + yb, 30, 30 + yb, apron[1], 1)
    c.line(60, 40 + yb, 64, 30 + yb, apron[1], 1)
    for k in range(14):  # vết máu tạp dề
        x = 39 + _hash(k, 1, 25) % 20
        y = 50 + _hash(k, 2, 25) % 30
        c.ellipse(x, y + yb, 1.5 + (k % 3), 1.2 + (k % 2), BLOOD if k % 3 else BLOOD_L)
    for k in range(4):
        drip(c, 39 + k * 6, 82 + yb, 2 + k % 3)
    # head
    hy = 20 + yb + P.stun * 2
    orb(c, 54, hy, 10, 10, skin, rough=16, seed=26)
    stitches(c, 47, hy - 7, 60, hy - 3, 4)
    eye(c, 57, hy, hexc('#ffd43b'))
    c.ellipse(52, hy, 1.6, 1.4, (30, 20, 26, 255))  # hốc mắt khâu
    c.rect(52, hy + 5, 61, hy + 6, (40, 10, 16, 255))
    stitches(c, 52, hy + 5, 61, hy + 5, 4, hexc('#2a1a1a'))
    # front arm + cleaver (chop arc)
    if P.wind > 0 or P.strike > 0:
        ang = -1.6 - P.wind * 0.3 + P.strike * 2.5
    else:
        ang = 0.9 + (math.sin(P.phase) * 0.15 if P.moving else P.breath * 0.05)
    sx, sy = 64, 36 + yb
    ex, ey = sx + math.cos(ang) * 14, sy + math.sin(ang) * 14
    hx, hy2 = ex + math.cos(ang + 0.3) * 13, ey + math.sin(ang + 0.3) * 13
    capsule(c, sx, sy, ex, ey, 8, 7, skin, rough=12, seed=27)
    capsule(c, ex, ey, hx, hy2, 7, 6, skin, rough=12, seed=28)
    # cleaver blade: rectangle along direction
    dx, dy = math.cos(ang + 0.3), math.sin(ang + 0.3)
    px, py = -dy, dx
    L = 24
    bx0, by0 = hx + dx * 3, hy2 + dy * 3
    pts = [(bx0 - px * 2, by0 - py * 2), (bx0 + dx * L - px * 2, by0 + dy * L - py * 2),
           (bx0 + dx * L + px * 12, by0 + dy * L + py * 12), (bx0 + px * 11, by0 + py * 11)]
    cloth(c, pts, blade, rough=3, seed=29)
    c.line(pts[2][0], pts[2][1], pts[3][0], pts[3][1], hexc('#eef3f7'), 1)  # lưỡi sắc
    c.line(pts[1][0], pts[1][1], pts[2][0], pts[2][1], BLOOD_L, 1)
    orb(c, hx, hy2, 5, 5, ramp('#5a3a28'))
    if P.strike > 0.55:
        for k in range(6):
            a = ang + 0.3 - 0.9 + k * 0.32
            c.set(hx + math.cos(a) * 30, hy2 + math.sin(a) * 30, hexc('#eef3f7'))


# ---------------------------------------------------------------------------
# 3. Gunner (boss_arsenal)
# ---------------------------------------------------------------------------

def draw_gunner(c, P):
    skin = ramp('#8b9a76')
    olive = ramp('#55603f')
    camo = ramp('#4a4f3a')
    metal = ramp('#6c727c')
    yb = P.bob + P.stun * 3
    legs(c, P, (42, 58 + yb), (54, 58 + yb), r=6, pants='#4a4f3a', boot='#2a2420', stride=7)
    # backpack drum
    orb(c, 30, 40 + yb, 9, 12, metal, rough=6, seed=31)
    c.rect(26, 34 + yb, 34, 35 + yb, hexc('#d4af37'))
    # back arm
    capsule(c, 38, 34 + yb, 46, 52 + yb, 5, 4, (skin[0], skin[0], skin[1], skin[2]), rough=12, seed=32)
    # torso vest
    cloth(c, [(36, 28 + yb), (60, 28 + yb), (58, 58 + yb), (38, 58 + yb)], olive, rough=8, seed=33, folds=0.2)
    for k in range(4):
        plate(c, 39 + (k % 2) * 9, 36 + (k // 2) * 9 + yb, 46 + (k % 2) * 9, 42 + (k // 2) * 9 + yb, camo, rivets=False)
    # ammo belt diagonal
    for k in range(10):
        x = 37 + k * 2.3
        y = 28 + k * 2.8 + yb
        c.rect(x, y, x + 1, y + 2, hexc('#d4af37'))
        c.set(x, y, hexc('#fff1a8'))
    c.rect(38, 56 + yb, 58, 58 + yb, ramp('#3b2f2f')[1])
    # torn flesh at shoulder (gun arm stump)
    orb(c, 60, 32 + yb, 6, 6, skin, rough=20, seed=34)
    c.set(63, 34 + yb, BLOOD_L)
    # head + helmet + gasmask
    hy = 18 + yb + P.stun * 2
    orb(c, 50, hy, 8, 8, skin, rough=18, seed=35)
    orb(c, 49, hy - 4, 10, 6, olive, rough=6, seed=36)
    c.rect(39, hy - 1, 60, hy - 1, olive[0])
    c.rect(52, hy + 1, 59, hy + 6, metal[1])  # mặt nạ phòng độc rách
    c.ellipse(57, hy + 5, 2, 2, metal[0])
    eye(c, 55, hy + 1, hexc('#ff6b6b'))
    c.set(59, hy + 3, BLOOD)
    # minigun arm
    gy = 40 + yb - P.wind * 2
    recoil = -2 if P.strike > 0.3 and (P.i % 2 == 0) else 0
    capsule(c, 58, 36 + yb, 64 + recoil, gy, 6, 6, metal, seed=37)
    orb(c, 66 + recoil, gy, 7, 7, metal)
    spin = P.i % 3
    for b in range(3):
        by = gy - 3 + b * 3
        col = metal[3] if (b == spin) else metal[2]
        c.rect(70 + recoil, by, 92 + recoil, by + 1, col)
        c.rect(70 + recoil, by + 1, 92 + recoil, by + 1, metal[0])
    c.rect(78 + recoil, gy - 4, 80 + recoil, gy + 5, metal[1])
    c.rect(90 + recoil, gy - 4, 92 + recoil, gy + 5, metal[0])
    # ammo feed cable
    c.line(30, 46 + yb, 64, gy + 5, hexc('#d4af37'), 1)
    if P.strike > 0.3 and P.i % 2 == 0:
        glow(c, 94 + recoil, gy + 1, 4, hexc('#fffbe0'), hexc('#ffd43b'), hexc('#ff922b'))
    # front arm supporting
    capsule(c, 52, 34 + yb, 66, 44 + yb, 5, 4, skin, rough=12, seed=38)


# ---------------------------------------------------------------------------
# 4. Storm Wraith (boss_tempest)
# ---------------------------------------------------------------------------

def draw_wraith(c, P):
    robe = ramp('#3a3554')
    bonec = ramp(BONE)
    elec = hexc('#9be7ff')
    gold = hexc('#ffe066')
    hov = int(round(math.sin(P.t * math.pi * 2) * 2)) + (P.stun * 4 if P.die == 0 else 0)
    yb = 3 + hov
    # tattered robe with waving hem
    hem = []
    for k in range(9):
        x = 26 + k * 6
        wave = math.sin(P.t * math.pi * 2 * 2 + k * 0.9) * (5 if P.moving else 3)
        hem.append((x, 84 + yb + (5 if k % 2 else -1) + wave))
    pts = [(36, 26 + yb), (60, 26 + yb), (72, 50 + yb)] + hem[::-1][:1] + list(reversed(hem)) + [(24, 52 + yb)]
    pts = [(36, 26 + yb), (60, 26 + yb), (74, 56 + yb)] + list(reversed(hem)) + [(22, 56 + yb)]
    cloth(c, pts, robe, rough=10, seed=41, folds=0.55)
    for k in range(9):
        hx, hy = hem[k]
        c.line(hx, hy, hx + 1, hy + 3, robe[0], 1)
    # wisp tail
    for k in range(4):
        c.set(46 + k, 92 + yb + (k % 2), robe[1])
    # arms
    up = 0.3 + P.wind * 0.7 if (P.wind or P.strike) else 0.15 + 0.05 * P.breath
    for side, sx in ((-1, 36), (1, 60)):
        ex = sx + side * (10 - up * 2)
        ey = 34 + yb - up * 14
        hx = sx + side * (6 - up * 4)
        hy = 22 + yb - up * 18
        capsule(c, sx, 30 + yb, ex, ey, 4, 3, robe, seed=42 + side)
        capsule(c, ex, ey, hx, hy, 2.4, 2, bonec, seed=44 + side)
        for f in range(3):
            c.line(hx, hy, hx + side * (f - 1) * 2, hy - 3, bonec[3], 1)
    # hood
    orb(c, 48, 20 + yb, 11, 11, robe, rough=8, seed=46)
    c.ellipse(50, 22 + yb, 7, 7, hexc('#0b0a14'))
    eye(c, 50, 21 + yb, elec)
    eye(c, 54, 21 + yb, elec)
    c.set(52, 25 + yb, bonec[2])  # hàm lộ xương
    c.rect(49, 26 + yb, 55, 26 + yb, bonec[1])
    # lightning crown
    for k in range(5):
        x = 40 + k * 4
        h = 6 + (k % 2) * 4 + int(P.extra * 2 * (k % 2))
        c.line(x, 11 + yb, x + 1, 11 + yb - h, gold if k % 2 else elec, 1)
    c.rect(39, 11 + yb, 57, 12 + yb, hexc('#c9a227'))
    # charge orb + bolts
    if P.wind > 0.05 or P.strike > 0:
        r = 2 + P.wind * 5 + P.strike * 3
        ox, oy = 48, 2 + yb + 10 - P.wind * 2
        oy = max(6, 6 + yb + 2)
        glow(c, 48, oy, r, hexc('#ffffff'), elec, hexc('#4dabf7'))
        for k in range(3):
            a = (P.i * 1.7 + k * 2.1)
            bolt(c, 48, oy, 48 + math.cos(a) * (14 + r), oy + abs(math.sin(a)) * 18 + 4, elec, hexc('#ffffff'), seed=P.i * 13 + k, jag=2.5, steps=5)
    # orbiting sparks
    for k in range(3):
        a = P.t * math.pi * 2 + k * 2.09
        c.set(48 + math.cos(a) * 26, 50 + yb + math.sin(a) * 10, elec)


# ---------------------------------------------------------------------------
# 5. Frost Queen (boss_frost_empress)
# ---------------------------------------------------------------------------

def draw_frost(c, P):
    skin = ramp('#9fb7c9')
    dress = ramp('#5a8fc4')
    ice = ramp('#cfeeff')
    hair = ramp('#a9bccf')
    yb = P.bob + P.stun * 2
    # dress cone
    hem = []
    for k in range(10):
        x = 24 + k * 5.4
        hem.append((x + (math.sin(P.t * math.pi * 2 + k * 0.7) * 2.5 if P.moving else 0), 92 - (k % 2) * 2 + (math.sin(P.t * math.pi * 2 + k) * 1.5 if P.moving else 0)))
    cloth(c, [(42, 44 + yb), (56, 44 + yb), (74, 88)] + list(reversed(hem)) + [(22, 88)], dress, rough=6, seed=51, folds=0.4)
    for k in range(4):  # sương băng trên váy
        c.line(32 + k * 10, 92, 33 + k * 10, 84 - (k % 3) * 4, ice[1], 1)
    # hair behind
    cloth(c, [(42, 12 + yb), (50, 12 + yb), (46, 44 + yb), (39, 46 + yb)], hair, rough=8, seed=52, folds=0.6)
    # torso (corpse ribs)
    cloth(c, [(40, 26 + yb), (58, 26 + yb), (56, 46 + yb), (42, 46 + yb)], skin, rough=10, seed=53)
    for k in range(4):
        c.line(43, 31 + k * 3 + yb, 54, 31 + k * 3 + yb, skin[0], 1)
    c.rect(41, 44 + yb, 57, 46 + yb, ice[1])
    # ice shoulder shards
    for side, sx in ((-1, 40), (1, 58)):
        for k in range(3):
            tip = (sx + side * (6 + k * 3), 18 + yb - k * 4)
            cloth(c, [(sx, 28 + yb), (sx + side * 4, 26 + yb), tip], ice, seed=54 + k)
    # back arm
    capsule(c, 41, 30 + yb, 34, 48 + yb, 3, 2.5, (skin[0], skin[0], skin[1], skin[2]), seed=55)
    # head
    hy = 16 + yb + P.stun * 2
    orb(c, 50, hy, 7, 8, skin, rough=10, seed=56)
    eye(c, 52, hy, hexc('#e7f5ff'))
    c.ellipse(55, hy + 1, 1.2, 1.6, hexc('#1b2a3a'))
    c.rect(50, hy + 5, 55, hy + 5, hexc('#3a2a3a'))
    for k in range(4):  # tóc rủ
        c.line(43 + k, hy - 4, 40 + k * 2, hy + 18, hair[2 if k % 2 else 3], 1)
    # crown
    for k in range(5):
        x = 44 + k * 3
        h = 5 + (2 if k == 2 else 0) + (k % 2) * 2
        cloth(c, [(x - 1, hy - 7), (x + 1, hy - 7), (x, hy - 7 - h)], ice, seed=57 + k)
    glow(c, 50, hy - 9, 1.2, hexc('#ffffff'))
    # staff arm
    raise_ = P.wind * 10 - P.strike * 4
    sx, sy = 58, 30 + yb
    hx, hy2 = 66, 40 + yb - raise_
    capsule(c, sx, sy, hx, hy2, 3, 2.5, skin, seed=58)
    top_y = 8 + yb - raise_
    c.line(68, top_y, 70, 92, ramp('#7e8fa3')[2], 2)
    c.line(68, top_y, 69, 92, ramp('#7e8fa3')[3], 1)
    cr = 3 + P.wind * 3
    cloth(c, [(68, top_y - cr * 2), (68 + cr, top_y), (68, top_y + cr * 1.5), (68 - cr, top_y)], ice, seed=59)
    if P.wind > 0.2 or P.strike > 0:
        glow(c, 68, top_y, 2 + P.wind * 4, hexc('#ffffff'), hexc('#a5d8ff'), hexc('#4dabf7'))
        for k in range(6):
            a = k * 1.047 + P.t * 4
            c.set(68 + math.cos(a) * (8 + P.wind * 6), top_y + math.sin(a) * (8 + P.wind * 6), ice[3])
    orb(c, hx, hy2, 3, 3, skin)


# ---------------------------------------------------------------------------
# 6. Drowned Maw (boss_abyssal_leviathan)
# ---------------------------------------------------------------------------

def draw_maw(c, P):
    skin = ramp('#4f7a6e')
    belly = ramp('#9db39a')
    flesh = ramp('#8a2f3f')
    yb = P.bob + P.stun * 2
    # tentacles behind
    for k in range(4):
        base = (24 + k * 9, 76 + yb)
        w = math.sin(P.t * math.pi * 2 + k * 1.3) * 6
        mid = (base[0] - 8 + w, 86)
        tip = (base[0] - 14 + w * 1.4, 91)
        capsule(c, base[0], base[1], mid[0], mid[1], 5, 3.5, (skin[0], skin[0], skin[1], skin[2]), seed=61 + k)
        capsule(c, mid[0], mid[1], tip[0], tip[1], 3.5, 1.5, (skin[0], skin[0], skin[1], skin[2]), seed=65 + k)
    # body (uốn mình khi trườn)
    if P.moving:
        yb += int(round(math.sin(P.phase * 2) * 1.5))
    orb(c, 44, 62 + yb, 30, 23, skin, rough=14, seed=69)
    cloth(c, [(26, 70 + yb), (66, 70 + yb), (62, 84 + yb), (30, 84 + yb)], belly, rough=10, seed=70)
    for k in range(18):  # hà bám
        x = 20 + _hash(k, 3, 71) % 46
        y = 44 + _hash(k, 4, 71) % 26
        c.ellipse(x, y + yb, 1.6, 1.2, ramp(BONE)[2])
        c.set(x, y + yb, ramp(BONE)[0])
    # dorsal fins / spines
    for k in range(6):
        x = 22 + k * 7
        c.line(x, 44 + yb - (k % 2) * 2, x - 3, 34 + yb - (k % 3) * 3, skin[0], 2)
    # maw
    open_ = 4 + P.wind * 14 + P.strike * 6 + (P.extra * 1.5 if P.clip == 'idle' else 0)
    if P.clip == 'idle':
        open_ = 4 + (1 + P.breath) * 1.5
    if P.stun:
        open_ = 6 + P.sway * 2
    jx = 62
    jy = 56 + yb
    cloth(c, [(jx - 8, jy - 16), (jx + 26, jy - 6 - open_ * 0.4), (jx + 28, jy - open_ * 0.5), (jx - 6, jy - 2)], skin, rough=10, seed=72)
    cloth(c, [(jx - 6, jy + 2), (jx + 26, jy + open_ * 0.5), (jx + 22, jy + 10 + open_ * 0.4), (jx - 8, jy + 14)], skin, rough=10, seed=73)
    cloth(c, [(jx - 4, jy - 2), (jx + 26, jy - open_ * 0.5 + 1), (jx + 26, jy + open_ * 0.5 - 1), (jx - 4, jy + 2)], flesh, seed=74)
    for k in range(9):
        x = jx + k * 3
        c.line(x, jy - open_ * 0.5 * (k / 8) - 1, x + 1, jy - open_ * 0.5 * (k / 8) + 2, hexc('#ece3c5'), 1)
        c.line(x, jy + open_ * 0.5 * (k / 8) + 1, x + 1, jy + open_ * 0.5 * (k / 8) - 2, hexc('#ece3c5'), 1)
    if P.wind > 0.3 or P.strike > 0:
        glow(c, jx + 10, jy, 2 + P.wind * 3, hexc('#e8fffa'), hexc('#63e6be'), hexc('#0ca678'))
    # dead eyes
    eye(c, jx + 2, jy - 12, hexc('#d8f5a2'), 2)
    eye(c, jx - 6, jy - 14, hexc('#d8f5a2'))
    # drips of water/ichor
    for k in range(3):
        drip(c, jx + 6 + k * 7, jy + 12 + open_ * 0.4, 2 + k, hexc('#2f6f62'), hexc('#63e6be'))


# ---------------------------------------------------------------------------
# 7. Volt Twins (boss_storm_herald)
# ---------------------------------------------------------------------------

def draw_twins(c, P):
    skin = ramp('#7d8a6a')
    jacket = ramp('#3d4048')
    yel = hexc('#ffe066')
    blu = hexc('#74c0fc')
    yb = P.bob + P.stun * 3 + 3
    # lightning rods
    for k, x in enumerate((32, 40, 56, 64)):
        top = 2 + (k % 2) * 4 + yb
        c.line(x, 30 + yb, x, top, ramp('#9aa0a8')[2], 1)
        glow(c, x, top, 1.6, hexc('#ffffff'), yel if k < 2 else blu)
    legs(c, P, (40, 60 + yb), (56, 60 + yb), r=7, pants='#2f3138', boot='#2a2420', stride=6)
    # back arm
    capsule(c, 32, 34 + yb, 26 - P.wind * 4, 56 + yb - P.wind * 18, 6, 5, (skin[0], skin[0], skin[1], skin[2]), rough=10, seed=81)
    # torso
    cloth(c, [(30, 28 + yb), (66, 28 + yb), (62, 60 + yb), (34, 60 + yb)], jacket, rough=8, seed=82, folds=0.3)
    orb(c, 48, 42 + yb, 11, 10, skin, rough=14, seed=83)  # ngực hở
    for k in range(5):
        c.line(36 + k * 6, 30 + yb, 38 + k * 6, 58 + yb, hexc('#1e1f24'), 1)  # dây cáp
    # heads
    for hx, col, sd in ((40, yel, 84), (58, blu, 85)):
        hy = 20 + yb + (P.stun * 3 if hx == 40 else P.stun * 1)
        orb(c, hx, hy, 7, 7, skin, rough=16, seed=sd)
        eye(c, hx + 2, hy, col)
        eye(c, hx - 2, hy, col)
        c.rect(hx - 2, hy + 4, hx + 3, hy + 4, (40, 10, 16, 255))
        stitches(c, hx - 5, hy - 5, hx + 3, hy - 6, 3)
    # arcs between rods
    s = P.i * 7
    bolt(c, 32, 2 + yb, 40, 6 + yb, yel, hexc('#ffffff'), seed=s, jag=2, steps=4)
    bolt(c, 56, 2 + yb, 64, 6 + yb, blu, hexc('#ffffff'), seed=s + 1, jag=2, steps=4)
    if P.wind > 0.2 or P.strike > 0 or P.extra > 0.5:
        bolt(c, 40, 6 + yb, 56, 2 + yb, yel if P.i % 2 else blu, hexc('#ffffff'), seed=s + 2, jag=3, steps=6)
    # front arm
    ang = 0.9 - P.wind * 2.6 + P.strike * 1.2
    ex, ey = 66 + math.cos(ang) * 12, 34 + yb + math.sin(ang) * 12
    fx, fy = ex + math.cos(ang - 0.3) * 12, ey + math.sin(ang - 0.3) * 12
    capsule(c, 64, 34 + yb, ex, ey, 6, 5, skin, rough=10, seed=86)
    capsule(c, ex, ey, fx, fy, 5, 4, skin, rough=10, seed=87)
    orb(c, fx, fy, 4.5, 4.5, skin)
    if P.wind > 0.2 or P.strike > 0:
        glow(c, fx, fy, 2 + P.wind * 3, hexc('#ffffff'), blu, hexc('#1c7ed6'))
        bolt(c, fx, fy, fx + 14, fy - 10, blu, hexc('#ffffff'), seed=s + 3, jag=2, steps=4)


# ---------------------------------------------------------------------------
# 8. Brood Eye (boss_beholder)
# ---------------------------------------------------------------------------

def draw_brood(c, P):
    flesh = ramp('#a3525a')
    dark = ramp('#5e2a38')
    sclera = ramp('#e9e2cf')
    lift = 0
    if P.clip == 'slam_leap':
        lift = int(round(math.sin(min(1.0, P.t / 0.7) * math.pi) * 10))
    yb = P.bob + P.stun * 3 - lift
    # tentacle legs
    for k in range(5):
        bx = 30 + k * 9
        w = math.sin(P.t * math.pi * 2 * (2 if P.moving else 1) + k * 1.2) * (5 if P.moving else 2)
        tx = bx - 6 + k * 3 + w
        ty = FOOT - 1 - (lift if lift else 0) * 0.3
        capsule(c, bx, 66 + yb, (bx + tx) / 2 + 2, 80 + yb * 0.5, 5, 4, (dark[0], dark[1], dark[2], dark[3]), seed=91 + k)
        capsule(c, (bx + tx) / 2 + 2, 80 + yb * 0.5, tx, ty, 4, 2, (dark[0], dark[1], dark[2], dark[3]), seed=96 + k)
    # bone spikes
    for k in range(7):
        a = math.pi * (1.1 + k * 0.13)
        bx = 48 + math.cos(a) * 26
        by = 46 + yb + math.sin(a) * 24
        L = 8 + (k % 3) * 3 + (P.strike * 4 if P.clip == 'volley_cast' else 0)
        cloth(c, [(bx - 2, by), (bx + 2, by), (bx + math.cos(a) * L, by + math.sin(a) * L)], ramp(BONE), seed=100 + k)
    # flesh body
    pulse = 1 + (0.04 * P.breath if P.clip == 'idle' else 0.06 * P.wind)
    orb(c, 48, 48 + yb, 28 * pulse, 25 * pulse, flesh, rough=16, seed=110)
    for k in range(8):  # gân máu
        a = k * 0.8
        c.line(48 + math.cos(a) * 12, 48 + yb + math.sin(a) * 10, 48 + math.cos(a + 0.3) * 24, 48 + yb + math.sin(a + 0.3) * 21, dark[1], 1)
    # small eyes (blink)
    for k in range(5):
        a = -0.5 + k * 0.55
        ex = 48 + math.cos(a + 3.6) * 19
        ey = 48 + yb + math.sin(a + 3.6) * 16
        if (P.i + k) % 5 == 0 or P.stun:
            c.line(ex - 2, ey, ex + 2, ey, dark[0], 1)
        else:
            orb(c, ex, ey, 2.6, 2.2, sclera, rim=False)
            c.set(ex + 1, ey, hexc('#d63b3b'))
    # main eye
    ey = 44 + yb
    if P.stun:
        cloth(c, [(42, ey - 2), (64, ey - 2), (62, ey + 4), (44, ey + 4)], dark, seed=120)
        c.line(44, ey + 1, 62, ey + 1, dark[0], 1)
    else:
        orb(c, 53, ey, 11, 10, sclera, rim=False)
        for k in range(5):
            c.line(44 + k * 2, ey - 6 + k * 3, 48 + k, ey - 2 + k * 2, hexc('#c44c4c'), 1)
        charge = P.wind if P.clip in ('beam_windup', 'enrage_roar') else 0
        iris = mix(hexc('#ff922b'), hexc('#fff3bf'), charge)
        look = 3 if P.clip != 'move' else 2 + int(math.sin(P.phase) * 1)
        c.ellipse(53 + look, ey, 5, 5, iris)
        c.ellipse(53 + look, ey, 2.2, 3.4, (20, 8, 12, 255))
        c.set(51 + look, ey - 3, (255, 255, 255, 255))
        if charge > 0.3:
            glow(c, 53 + look, ey, 2 + charge * 4, hexc('#ffffff'), hexc('#ffe066'), hexc('#ff922b'))
    # mouth
    mo = 2 + (P.wind * 6 if P.clip in ('enrage_roar', 'volley_cast') else 0) + (P.stun * 2)
    c.ellipse(52, 62 + yb, 9, mo, (40, 10, 16, 255))
    teeth(c, 44, 62 + yb - mo, 60)
    teeth(c, 45, 62 + yb + mo - 1, 59, down=False)
    drip(c, 50, 63 + yb + mo, 3)
    if P.clip == 'slam_leap' and P.t > 0.65:
        for k in range(7):
            a = math.pi + k * 0.45
            c.line(48, FOOT, 48 + math.cos(a) * 30, FOOT - abs(math.sin(a)) * 5, hexc('#a08a6a'), 1)


# ---------------------------------------------------------------------------
# 9. Plague Core (boss_overlord)
# ---------------------------------------------------------------------------

def draw_core(c, P):
    bonec = ramp(BONE)
    heart = ramp('#5c8a2a')
    mem = ramp('#4a3a5a')
    tox = hexc('#a9e34b')
    hov = int(round(math.sin(P.t * math.pi * 2) * 2))
    yb = -8 + hov + P.stun * 6
    beat = 0.5 + 0.5 * math.sin(P.t * math.pi * 4)
    open_ = P.wind if P.clip in ('laser', 'charge') else 0
    # bone wings with membrane
    for side in (-1, 1):
        wx = 48 + side * 14
        flap = math.sin(P.t * math.pi * 2 * 2) * 4
        tip = (48 + side * 42, 22 + yb - flap)
        low = (48 + side * 36, 54 + yb + flap * 0.5)
        cloth(c, [(wx, 30 + yb), tip, low], mem, rough=10, seed=130 + side, folds=0.5)
        c.line(wx, 30 + yb, tip[0], tip[1], bonec[2], 2)
        c.line(wx, 34 + yb, low[0], low[1], bonec[1], 1)
    # dangling tubes
    for k in range(4):
        x = 38 + k * 7
        sway = math.sin(P.t * math.pi * 2 + k) * 3
        capsule(c, x, 60 + yb, x + sway, 80 + yb + (k % 2) * 6, 2, 1.5, ramp('#5a5560'), seed=140 + k)
        drip(c, x + sway, 81 + yb + (k % 2) * 6, 2, hexc('#5c8a2a'), tox)
    # heart core
    hr = 9 + beat * 1.5 + open_ * 2
    orb(c, 48, 44 + yb, hr, hr * 0.9, heart, rough=12, seed=150, bias=0.15 * beat)
    glow(c, 48, 44 + yb, 3 + beat * 2 + open_ * 4, hexc('#f4ffd6'), tox, None)
    # ribcage arcs
    for k in range(5):
        yy = 34 + k * 5 + yb
        spread = 14 + k * 1.5 + open_ * 6
        for side in (-1, 1):
            c.line(48, yy - 2, 48 + side * spread, yy + 2, bonec[3 if side < 0 else 2], 2)
            c.line(48 + side * spread, yy + 2, 48 + side * (spread - 3), yy + 6, bonec[1], 1)
    c.line(48, 30 + yb, 48, 60 + yb, bonec[2], 2)  # xương sống
    # skull
    orb(c, 48, 20 + yb, 9, 8, bonec, rough=8, seed=160)
    c.ellipse(45, 20 + yb, 2.2, 2.4, (18, 12, 20, 255))
    c.ellipse(52, 20 + yb, 2.2, 2.4, (18, 12, 20, 255))
    eye(c, 45, 20 + yb, tox)
    eye(c, 52, 20 + yb, tox)
    jaw = 26 + yb + int(open_ * 3)
    c.rect(43, jaw, 53, jaw + 2, bonec[1])
    teeth(c, 43, jaw, 53, gap=2, col=bonec[3])
    if P.clip == 'laser' and P.strike > 0:
        glow(c, 48, 44 + yb, 8, hexc('#ffffff'), hexc('#d8f5a2'), tox)
    if P.stun:
        for k in range(3):
            a = P.t * 6 + k * 2.1
            bolt(c, 48, 44 + yb, 48 + math.cos(a) * 18, 44 + yb + math.sin(a) * 14, hexc('#d0bfff'), None, seed=P.i * 5 + k, jag=2, steps=4)


# ---------------------------------------------------------------------------
# Extra props: EMP pylon (48×48), weakpoint (32×32)
# ---------------------------------------------------------------------------

def draw_pylon(i, n):
    c = Canvas(48, 48)
    bonec = ramp(BONE)
    t = i / n
    c.line(24, 46, 24, 12, ramp('#4a4450')[2], 3)
    for k in range(4):
        c.line(18, 40 - k * 7, 30, 38 - k * 7, bonec[2], 1)
    orb(c, 24, 10, 6, 6, bonec, rough=10, seed=170)
    c.ellipse(22, 10, 1.5, 1.6, (18, 12, 20, 255))
    c.ellipse(27, 10, 1.5, 1.6, (18, 12, 20, 255))
    pulse = 0.5 + 0.5 * math.sin(t * math.pi * 2)
    glow(c, 24, 10, 2 + pulse * 2, hexc('#ffffff'), hexc('#d0bfff'), hexc('#7048e8'))
    for k in range(2):
        a = t * math.pi * 2 + k * math.pi
        bolt(c, 24, 10, 24 + math.cos(a) * 14, 10 + math.sin(a) * 9 + 6, hexc('#b197fc'), hexc('#ffffff'), seed=i * 3 + k, jag=2, steps=4)
    c.ellipse(24, 46, 9, 2, (30, 24, 36, 255))
    c.outline()
    return c.img


def draw_weakpoint(i, n):
    c = Canvas(32, 32)
    t = i / n
    pulse = 0.5 + 0.5 * math.sin(t * math.pi * 2)
    orb(c, 16, 16, 9 + pulse * 1.5, 8 + pulse * 1.5, ramp('#a3525a'), rough=18, seed=180)
    orb(c, 16, 15, 5, 4.5, ramp('#e9e2cf'), rim=False)
    c.ellipse(17, 15, 2.4, 2.4, mix(hexc('#ff922b'), hexc('#fff3bf'), pulse))
    c.ellipse(17, 15, 1, 1.6, (20, 8, 12, 255))
    for k in range(4):
        a = k * 1.57 + t
        c.line(16 + math.cos(a) * 7, 16 + math.sin(a) * 6, 16 + math.cos(a) * 11, 16 + math.sin(a) * 10, ramp('#5e2a38')[1], 1)
    drip(c, 15, 24, 3)
    c.outline()
    return c.img


# ---------------------------------------------------------------------------
# Frame composer (dead clip: ngã + vũng máu) & clip table
# ---------------------------------------------------------------------------

FLOATING = {'boss_tempest', 'boss_overlord'}
WIDE = {'boss_abyssal_leviathan'}


def render_frame(draw_fn, boss_id, clip, i, n):
    from PIL import Image
    P = Pose(clip, i, n)
    floating = boss_id in FLOATING
    if clip != 'dead':
        c = Canvas(CELL, CELL)
        draw_fn(c, P)
        c.outline()
        img = c.img
        if P.stun and not floating:
            # lảo đảo quanh bàn chân (choáng)
            img = rotate_about(img, -P.sway * 4.5, CX, FOOT)
        elif P.moving and floating:
            img = rotate_about(img, -7 + math.sin(P.phase) * 2, CX, 50)
        return img
    # dead: vẽ tư thế choáng rồi ngã trên canvas lớn (không bị cắt), vũng máu loang dần
    body = Canvas(CELL, CELL)
    draw_fn(body, Pose('stun', 0, 6))
    body.outline()
    d = ease(P.die)
    big = Image.new('RGBA', (CELL * 2, CELL * 2), (0, 0, 0, 0))
    big.alpha_composite(body.img, (CELL // 2, CELL // 2))
    pcx, pcy = CX + CELL // 2, FOOT + CELL // 2
    if floating:
        big = big.rotate(d * 40, resample=Image.NEAREST, center=(pcx, pcy - 40))
        dy = int(round(d * 30))
        dx = 0
    elif boss_id in WIDE:
        big = big.rotate(-d * 22, resample=Image.NEAREST, center=(pcx + 20, pcy))
        dy = int(round(d * 6))
        dx = 0
    else:
        big = big.rotate(d * 80, resample=Image.NEAREST, center=(pcx, pcy))
        dy = 0
        dx = int(round(d * 34))
    # ảnh ngã về phía sau (trái) → dịch sang phải để nằm gọn trong ô
    crop = big.crop((CELL // 2 - dx, CELL // 2 - dy, CELL // 2 - dx + CELL, CELL // 2 - dy + CELL))
    out = Canvas(CELL, CELL)
    if d > 0.2:
        blood_pool(out, 44, FOOT - 1, 6 + d * 28, 1.5 + d * 4, seed=len(boss_id))
    out.img.alpha_composite(crop)
    if d > 0.5:
        for k in range(int(d * 6)):
            x = 20 + _hash(k, i, 5) % 56
            drip(out, x, 86 + _hash(k, i, 6) % 4, 1 + k % 2)
    out.binarize()
    return out.img


GENERIC = [('idle', 8, 8, True), ('run', 8, 10, True), ('attack', 12, 14, True), ('stun', 6, 10, True), ('dead', 10, 10, False)]

# boss_id -> (draw_fn, [(file_stem, clip_pose, frames, fps, loop)])
BOSSES = {
    'boss_beholder': (draw_brood, [
        ('boss_beholder_idle', 'idle', 6, 6, True),
        ('boss_beholder_move', 'move', 6, 8, True),
        ('boss_beholder_beam_windup', 'beam_windup', 6, 8, True),
        ('boss_beholder_volley_cast', 'volley_cast', 6, 10, True),
        ('boss_beholder_slam_leap', 'slam_leap', 6, 9, True),
        ('boss_beholder_enrage_roar', 'enrage_roar', 5, 8, True),
        ('boss_beholder_stagger', 'stagger', 4, 6, True),
        ('boss_beholder_dead', 'dead', 8, 8, False),
    ]),
    'boss_colossus': (draw_hulk, [
        ('boss_colossus_idle', 'idle', 8, 8, True),
        ('boss_colossus_run', 'run', 8, 10, True),
        ('boss_colossus_attack', 'attack', 10, 12, True),
        ('boss_colossus_overheat_stun', 'overheat_stun', 6, 10, True),
        ('boss_colossus_dead', 'dead', 10, 10, False),
    ]),
    'boss_overlord': (draw_core, [
        ('boss_overlord_idle', 'core_idle', 8, 8, True),
        ('boss_overlord_charge', 'charge', 10, 12, True),
        ('boss_overlord_laser', 'laser', 10, 14, True),
        ('boss_overlord_stun', 'stun', 6, 10, True),
        ('boss_overlord_dead', 'dead', 10, 10, False),
    ]),
    'boss_arsenal': (draw_gunner, [
        ('boss_arsenal_idle', 'idle', 8, 8, True),
        ('boss_arsenal_run', 'run', 8, 10, True),
        ('boss_arsenal_attack', 'attack', 12, 16, True),
        ('boss_arsenal_dead', 'dead', 10, 10, False),
    ]),
}
for _bid, _fn in (('boss_tempest', draw_wraith), ('boss_destroyer', draw_butcher),
                  ('boss_frost_empress', draw_frost), ('boss_abyssal_leviathan', draw_maw),
                  ('boss_storm_herald', draw_twins)):
    BOSSES[_bid] = (_fn, [(f'{_bid}_{clip}', clip, n, fps, loop) for clip, n, fps, loop in GENERIC])

BOSS_NAMES_EN = {
    'boss_beholder': 'Brood Eye',
    'boss_colossus': 'Iron Hulk',
    'boss_overlord': 'Plague Core',
    'boss_arsenal': 'Gunner',
    'boss_tempest': 'Storm Wraith',
    'boss_destroyer': 'Butcher',
    'boss_frost_empress': 'Frost Queen',
    'boss_abyssal_leviathan': 'Drowned Maw',
    'boss_storm_herald': 'Volt Twins',
}


def build_boss(boss_id, out_dir):
    """Sinh mọi clip của 1 boss → list (file_stem, frames, fps, loop)."""
    import os
    fn, clips = BOSSES[boss_id]
    res = []
    for stem, clip, n, fps, loop in clips:
        frames = [render_frame(fn, boss_id, clip, i, n) for i in range(n)]
        strip(frames, CELL, CELL).save(os.path.join(out_dir, stem + '.png'))
        res.append((stem, n, fps, loop))
    return res


def build_props(out_dir):
    import os
    strip([draw_pylon(i, 6) for i in range(6)], 48, 48).save(os.path.join(out_dir, 'emp_pylon_idle.png'))
    strip([draw_weakpoint(i, 6) for i in range(6)], 32, 32).save(os.path.join(out_dir, 'overlord_weakpoint_idle.png'))
    return [('emp_pylon_idle', 6, 8, True), ('overlord_weakpoint_idle', 6, 8, True)]


def build_all(out_dir):
    out = {}
    for bid in BOSSES:
        out[bid] = build_boss(bid, out_dir)
    out['props'] = build_props(out_dir)
    return out
