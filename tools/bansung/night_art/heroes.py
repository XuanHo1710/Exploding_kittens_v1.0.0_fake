"""
tools/bansung/night_art/heroes.py

5 anh hùng "Đêm Zombie" — vẽ procedural theo rig, tỷ lệ cơ thể thật (KHÔNG chibi đầu to),
khung 48×48, chân tại (24, 44) khớp pivot hiện có (`anchorX 24, anchorY 44`) để rig súng
xoay 360° trong `client/src/bansung/anim.ts` vẫn đúng vai.

Xuất:
- hero_<id>_{idle,run,shoot,dash,stunned,dead}.png  (dải ngang, nhìn nghiêng, hướng phải)
- hero_<id>_move8.png  atlas 6 cột × 8 hàng (idle ↓ ← → ↑, walk ↓ ← → ↑) — chuẩn
  `.agents/skills/expedition-sprite-generator` (thứ tự hàng: down, left, right, up).
"""
from __future__ import annotations

import math

from pixel import Canvas, hexc, ramp, flip_h, rotate_about, strip, grid

CELL = 48
FOOT_Y = 44
CX = 24


class HeroLook:
    """Thiết kế ngoại hình 1 anh hùng (headgear: hood | helm | gasmask | visor | bunny)."""

    def __init__(self, hid, name, skin, torso, torso_trim, pants, boots, accent, headgear,
                 head_main, cape=None, backpack=None, scarf=None):
        self.hid = hid
        self.name = name
        self.skin = skin
        self.torso = torso
        self.torso_trim = torso_trim
        self.pants = pants
        self.boots = boots
        self.accent = accent
        self.headgear = headgear
        self.head_main = head_main
        self.cape = cape
        self.backpack = backpack
        self.scarf = scarf


HEROES = [
    HeroLook('ranger', 'Cyber Ranger — Trinh sát đêm', skin='#e0a882', torso='#2b3a55', torso_trim='#22d3ee',
             pants='#334155', boots='#1f2937', accent='#22d3ee', headgear='hood', head_main='#26324a',
             scarf='#22d3ee'),
    HeroLook('knight', 'Knight — Hiệp sĩ thép xanh', skin='#d9a07c', torso='#3b5bdb', torso_trim='#fcc419',
             pants='#2c3e9e', boots='#8b98ad', accent='#fcc419', headgear='helm', head_main='#4263eb',
             cape='#b02a37', backpack='shield'),
    HeroLook('pyro', 'Pyromancer — Giả kim hỏa ngục', skin='#c98f6e', torso='#a61e1e', torso_trim='#ff922b',
             pants='#5c1a1a', boots='#3b2a24', accent='#ff922b', headgear='gasmask', head_main='#c92a2a',
             backpack='tank'),
    HeroLook('laser', 'Laser Engineer — Kỹ sư quang tử', skin='#e8b796', torso='#e9ecef', torso_trim='#e64980',
             pants='#5f3dc4', boots='#343a40', accent='#e64980', headgear='visor', head_main='#dee2e6',
             backpack='battery'),
    HeroLook('mascot', 'Mascot — Thỏ trắng cảm tử', skin='#f2c3a1', torso='#f1f3f5', torso_trim='#22b8cf',
             pants='#3b4a6b', boots='#1f2a44', accent='#e03131', headgear='bunny', head_main='#f8f9fa',
             scarf='#22b8cf'),
]


# ---------------------------------------------------------------------------
# Side view (hướng phải)
# ---------------------------------------------------------------------------

def _leg(c: Canvas, hip_x, hip_y, foot_x, foot_y, rp_pants, rp_boot, forward=1):
    """Chân dày 4 px, gối có highlight, ủng 6 px có mũi giày & đế tối."""
    knee_x = (hip_x + foot_x) / 2 + forward * 1
    knee_y = (hip_y + foot_y) / 2 - 1
    c.line(hip_x, hip_y, knee_x, knee_y, rp_pants[2], 4)
    c.line(knee_x, knee_y, foot_x, foot_y - 3, rp_pants[1], 4)
    c.set(knee_x + 1, knee_y, rp_pants[3])
    c.rect(foot_x - 2, foot_y - 4, foot_x + 1, foot_y - 1, rp_boot[2])
    c.rect(foot_x - 2, foot_y - 2, foot_x + 3 * forward, foot_y - 1, rp_boot[2])
    c.rect(foot_x - 2, foot_y, foot_x + 3 * forward, foot_y, rp_boot[0])
    c.rect(foot_x - 2, foot_y - 4, foot_x + 1, foot_y - 4, rp_boot[3])


def _head_side(c: Canvas, L: HeroLook, hx, hy):
    """hx, hy = góc trên-trái vùng đầu 8×9."""
    skin = ramp(L.skin)
    main = ramp(L.head_main)
    acc = hexc(L.accent)
    # sọ + mặt
    c.rect(hx, hy + 1, hx + 7, hy + 8, skin[2])
    c.rect(hx + 1, hy, hx + 6, hy + 8, skin[2])
    c.rect(hx + 7, hy + 7, hx + 7, hy + 8, skin[1])  # cằm bóng
    c.set(hx + 6, hy + 4, (32, 26, 40, 255))  # mắt
    c.set(hx + 7, hy + 5, skin[1])  # mũi
    c.rect(hx + 4, hy + 8, hx + 6, hy + 8, skin[1])
    g = L.headgear
    if g == 'hood':
        c.rect(hx - 1, hy - 1, hx + 5, hy + 9, main[2])
        c.rect(hx + 1, hy - 2, hx + 6, hy - 1, main[2])
        c.rect(hx - 2, hy + 3, hx - 1, hy + 10, main[1])
        c.rect(hx + 5, hy - 1, hx + 7, hy + 1, main[3])
        c.rect(hx + 3, hy + 3, hx + 8, hy + 4, acc)  # kính visor neon
        c.set(hx + 8, hy + 3, (220, 255, 255, 255))
        c.rect(hx, hy - 1, hx + 3, hy - 1, main[3])
    elif g == 'helm':
        c.rect(hx - 1, hy - 1, hx + 8, hy + 8, main[2])
        c.rect(hx - 1, hy + 6, hx + 8, hy + 8, main[1])
        c.rect(hx + 4, hy + 3, hx + 8, hy + 3, (20, 20, 30, 255))  # khe mắt
        c.rect(hx - 1, hy - 1, hx + 8, hy - 1, hexc(L.torso_trim))
        c.rect(hx + 3, hy - 1, hx + 3, hy + 8, hexc(L.torso_trim))
        c.rect(hx, hy, hx + 2, hy + 1, main[3])
        gold = ramp(L.torso_trim)
        c.line(hx, hy, hx - 3, hy - 4, gold[2], 2)  # sừng
        c.set(hx - 4, hy - 5, gold[3])
        c.line(hx + 5, hy - 1, hx + 4, hy - 5, gold[1], 2)
    elif g == 'gasmask':
        c.rect(hx - 1, hy - 1, hx + 6, hy + 9, main[2])
        c.poly([(hx - 1, hy - 1), (hx + 3, hy - 4), (hx + 1, hy - 1)], main[1])
        c.line(hx + 1, hy - 3, hx - 4, hy + 1, main[1], 2)  # chóp mũ trùm đổ ra sau
        c.rect(hx + 4, hy + 2, hx + 8, hy + 8, ramp('#495057')[2])  # mặt nạ
        c.rect(hx + 5, hy + 3, hx + 7, hy + 4, hexc('#ffa94d'))  # mắt kính cam
        c.set(hx + 7, hy + 3, hexc('#fff3bf'))
        c.rect(hx + 7, hy + 6, hx + 9, hy + 8, ramp('#343a40')[2])  # bộ lọc
        c.rect(hx - 1, hy + 8, hx + 6, hy + 9, hexc(L.torso_trim))
    elif g == 'visor':
        c.ellipse(hx + 3.5, hy + 4, 5, 5, main[2])
        c.ellipse(hx + 2.5, hy + 2.5, 2.5, 2, main[3])
        c.rect(hx + 3, hy + 3, hx + 8, hy + 5, acc)
        c.rect(hx + 6, hy + 3, hx + 8, hy + 3, (255, 214, 235, 255))
        c.rect(hx - 1, hy + 5, hx + 1, hy + 8, main[1])
        c.line(hx + 1, hy - 1, hx - 1, hy - 5, hexc('#9c36b5'), 1)  # ăng-ten
        c.set(hx - 1, hy - 6, hexc('#e599f7'))
    elif g == 'bunny':
        c.rect(hx - 1, hy - 1, hx + 4, hy + 9, main[2])
        c.rect(hx - 2, hy + 3, hx - 1, hy + 9, main[1])
        c.line(hx + 1, hy - 1, hx, hy - 8, main[2], 2)  # tai thỏ
        c.line(hx + 4, hy - 1, hx + 5, hy - 7, main[2], 2)
        c.line(hx + 1, hy - 2, hx + 1, hy - 6, hexc('#ffc9c9'), 1)
        red = ramp(L.accent)
        c.rect(hx + 2, hy - 2, hx + 4, hy - 1, red[2])  # nơ đỏ
        c.set(hx + 3, hy - 2, red[3])
        c.set(hx + 6, hy + 4, (32, 26, 40, 255))
        c.set(hx + 6, hy + 6, hexc('#ff8787'))  # má hồng


def _torso_side(c: Canvas, L: HeroLook, x0, y0, lean=0):
    """Thân hình thang: vai rộng 13 px → eo 10 px, vạt áo loe ra (coat) hoặc giáp đùi (knight)."""
    t = ramp(L.torso)
    trim = ramp(L.torso_trim)
    dark, shadow, mid, light = t
    # vai → eo
    c.poly([(x0 - 2, y0), (x0 + 11, y0), (x0 + 10, y0 + 10), (x0, y0 + 10)], mid)
    # vạt áo / hông
    coat = L.hid in ('ranger', 'pyro', 'mascot')
    hem = 15 if coat else 13
    c.poly([(x0, y0 + 10), (x0 + 10, y0 + 10), (x0 + 12, y0 + hem), (x0 - 2, y0 + hem)], shadow if coat else mid)
    # đổ bóng lưng (trái) + đón sáng ngực (phải-trên)
    c.rect(x0 - 1, y0 + 1, x0 + 1, y0 + 9, shadow)
    c.rect(x0 + 6, y0 + 1, x0 + 9, y0 + 6, light)
    c.rect(x0 + 10, y0 + 1, x0 + 10, y0 + 8, mid)
    c.rect(x0 - 1, y0 + hem, x0 + 11, y0 + hem, dark)
    # thắt lưng + khoá
    belt = ramp('#3b2f2f')
    c.rect(x0, y0 + 10, x0 + 10, y0 + 11, belt[2])
    c.rect(x0 + 7, y0 + 10, x0 + 8, y0 + 11, trim[3])
    # viền áo / dây đeo chéo
    c.line(x0 + 1, y0, x0 + 8, y0 + 9, trim[1], 1)
    c.set(x0 + 4, y0 + 4, trim[3])
    if coat:
        c.rect(x0 + 10, y0 + 11, x0 + 10, y0 + hem - 1, trim[1])  # nẹp vạt trước (1 px, tông tối)
    if L.hid == 'knight':
        c.ellipse(x0 + 3, y0 + 1, 4, 2.5, trim[2])  # giáp vai vàng
        c.ellipse(x0 + 2, y0, 2, 1, trim[3])
        c.rect(x0 + 6, y0 + 3, x0 + 7, y0 + 8, trim[3])  # thập tự ngực
        c.rect(x0 + 5, y0 + 4, x0 + 8, y0 + 4, trim[3])
        c.rect(x0 + 1, y0 + 12, x0 + 9, y0 + 12, trim[1])
    if L.hid == 'laser':
        c.rect(x0 + 6, y0 + 3, x0 + 9, y0 + 6, hexc(L.accent))  # lõi năng lượng
        c.rect(x0 + 7, y0 + 4, x0 + 8, y0 + 4, (255, 230, 245, 255))
        c.rect(x0 + 1, y0 + 7, x0 + 9, y0 + 7, ramp('#adb5bd')[1])
    if L.hid == 'pyro':
        c.rect(x0 + 8, y0 + 2, x0 + 9, y0 + 9, trim[2])
        for k in range(3):
            c.set(x0 + 2 + k * 3, y0 + hem - 1, trim[3])  # viền lửa vạt áo
    if L.scarf:
        sc = ramp(L.scarf)
        c.rect(x0 - 1, y0 - 1, x0 + 10, y0 + 1, sc[2])
        c.rect(x0 - 1, y0 + 1, x0 + 10, y0 + 1, sc[1])
        c.rect(x0 + 6, y0 - 1, x0 + 9, y0 - 1, sc[3])
        c.line(x0 - 1, y0 + 1, x0 - 4, y0 + 5, sc[1], 2)  # đuôi khăn bay


def _back_accessory(c: Canvas, L: HeroLook, x0, y0, swing=0.0):
    if L.cape:
        cp = ramp(L.cape)
        sway = int(round(-1 - abs(swing) * 2))
        c.poly([(x0, y0), (x0 + 5, y0), (x0 + 3 + sway, y0 + 21), (x0 - 4 + sway, y0 + 20)], cp[2])
        c.line(x0 + 2, y0 + 3, x0 - 1 + sway, y0 + 19, cp[1], 1)
        c.line(x0 - 3 + sway, y0 + 20, x0 + 3 + sway, y0 + 21, cp[0], 1)
        c.line(x0 + 4, y0 + 1, x0 + 2 + sway, y0 + 20, cp[3], 1)
    if L.backpack == 'shield':
        sh = ramp('#ced4da')
        c.shaded_rect(x0 - 4, y0 + 1, x0, y0 + 11, sh)
        c.rect(x0 - 3, y0 + 4, x0 - 1, y0 + 6, hexc(L.torso_trim))
    elif L.backpack == 'tank':
        tk = ramp('#868e96')
        c.shaded_rect(x0 - 4, y0 + 1, x0, y0 + 12, tk)
        c.rect(x0 - 4, y0 + 5, x0, y0 + 6, hexc(L.torso_trim))
        c.set(x0 - 3, y0, hexc('#ffd43b'))
    elif L.backpack == 'battery':
        bt = ramp('#495057')
        c.shaded_rect(x0 - 3, y0 + 2, x0, y0 + 10, bt)
        c.rect(x0 - 2, y0 + 4, x0 - 1, y0 + 8, hexc(L.accent))


def _moon_rim(c: Canvas, side: int = -1, amount: float = 0.38):
    """Viền sáng trăng lạnh ở mép lưng (đêm) — tạo khối 3D, không đổi alpha."""
    src = c.img.copy()
    sp = src.load()
    cool = (150, 182, 255)
    for y in range(c.h):
        for x in range(c.w):
            p = sp[x, y]
            if p[3] == 0:
                continue
            nx = x + side
            if 0 <= nx < c.w and sp[nx, y][3] != 0:
                continue
            if p[:3] == (27, 23, 38):
                continue
            c.px[x, y] = (int(p[0] + (cool[0] - p[0]) * amount), int(p[1] + (cool[1] - p[1]) * amount),
                          int(p[2] + (cool[2] - p[2]) * amount), 255)


def _gait(phase: float, stride: float, lift: float):
    """Chu kỳ bước thật: chân trụ lùi đều, chân vung nhấc cao ở giữa pha. Trả (dx, lift)."""
    sp = math.sin(phase)
    cp = math.cos(phase)
    dx = stride * sp
    up = lift * max(0.0, cp) ** 1.5 if sp > -0.2 else 0.0
    return dx, up


def draw_side(L: HeroLook, phase: float = 0.0, moving=False, bob=0, lean=0.0, arm=0.0, crouch=0,
              stride: float = 4.5, lift: float = 3.0, cloth: float = 0.0, head_tilt: int = 0) -> Canvas:
    """Nhìn nghiêng, hướng phải. Tay CẦM SÚNG (tay trước) do code vẽ theo rig → sprite chỉ có tay sau.

    Vai trước nằm tại (CX+3, FOOT_Y-23) khi bob=0 → khớp `makeHeroRig(4, -33, ...)` ở scale 1.5.
    """
    c = Canvas(CELL, CELL)
    pants = ramp(L.pants)
    boot = ramp(L.boots)
    skin = ramp(L.skin)
    t = ramp(L.torso)
    top = FOOT_Y - 37 + bob + crouch  # đỉnh đầu
    hip_y = top + 26
    lean_px = int(round(lean * 3))
    s = math.sin(phase) if moving else 0.0
    if moving:
        fdx, flift = _gait(phase, stride, lift)
        bdx, blift = _gait(phase + math.pi, stride, lift)
    else:
        fdx = flift = bdx = blift = 0.0
    torso_x = CX - 5 + lean_px
    torso_y = top + 12

    _back_accessory(c, L, torso_x, torso_y, s * 0.6 + cloth)
    # chân sau (tông tối hơn)
    _leg(c, CX - 1 + lean_px, hip_y, int(round(CX - 1 + bdx)), int(round(FOOT_Y - blift)),
         (pants[0], pants[0], pants[1], pants[2]), (boot[0], boot[0], boot[1], boot[2]))
    # tay sau: đung đưa ngược chân, khuỷu cong nhẹ
    sh_x, sh_y = torso_x + 2, torso_y + 2
    swing = (-s * 3.0 if moving else 0.0) + arm * 3.0
    elb_x = sh_x + swing * 0.5
    elb_y = sh_y + 5
    hand_x = int(round(sh_x + swing + 1))
    hand_y = int(round(sh_y + 9 - abs(arm) * 3))
    c.ellipse(sh_x, sh_y + 1, 2.5, 2.5, t[1])
    c.line(sh_x, sh_y, elb_x, elb_y, t[1], 4)
    c.line(elb_x, elb_y, hand_x, hand_y, t[0], 3)
    c.rect(hand_x - 1, hand_y, hand_x + 1, hand_y + 2, skin[1])
    c.set(hand_x, hand_y, skin[2])
    # thân
    _torso_side(c, L, torso_x, torso_y, lean)
    # vạt áo/coat đung đưa (secondary motion, trễ pha)
    if L.hid in ('ranger', 'pyro', 'mascot'):
        sway = int(round(math.sin(phase - 0.9) * 1.5 + cloth * 2)) if (moving or cloth) else 0
        hem_y = torso_y + 15
        c.rect(torso_x - 2 + min(0, sway), hem_y, torso_x - 1, hem_y + 1, t[0])
    # chân trước
    _leg(c, CX + 1 + lean_px, hip_y, int(round(CX + 1 + fdx)), int(round(FOOT_Y - flift)), pants, boot)
    # vai trước (khớp tay súng do code vẽ)
    c.ellipse(torso_x + 8, torso_y + 2, 2.4, 2.2, t[2])
    c.set(torso_x + 8, torso_y + 1, t[3])
    # đầu
    _head_side(c, L, CX - 3 + lean_px + (1 if lean > 0.3 else 0), top + 2 + head_tilt)
    _moon_rim(c, -1, 0.34)
    c.outline()
    return c


# ---------------------------------------------------------------------------
# Front / back view (cho atlas 6×8)
# ---------------------------------------------------------------------------

def draw_front(L: HeroLook, phase: float = 0.0, moving=False, bob=0, back=False) -> Canvas:
    """Nhìn thẳng (back=False) / sau lưng (back=True). Giữ tỉ lệ thật, tay súng do code vẽ."""
    c = Canvas(CELL, CELL)
    pants = ramp(L.pants)
    boot = ramp(L.boots)
    skin = ramp(L.skin)
    t = ramp(L.torso)
    trim = ramp(L.torso_trim)
    main = ramp(L.head_main)
    acc = hexc(L.accent)
    top = FOOT_Y - 37 + bob
    hip_y = top + 26
    s = math.sin(phase) if moving else 0.0
    lift_l = int(round(max(0.0, s) * 2))
    lift_r = int(round(max(0.0, -s) * 2))

    if back and L.cape:
        cp = ramp(L.cape)
        c.poly([(CX - 6, top + 12), (CX + 5, top + 12), (CX + 7, top + 30), (CX - 8, top + 30)], cp[2])
        c.rect(CX - 8, top + 29, CX + 7, top + 30, cp[1])
    # chân
    # hông + 2 chân dày 4 px sát nhau, chân nhấc lên co gối (rút ngắn + vệt sáng gối)
    c.rect(CX - 5, hip_y - 1, CX + 4, hip_y + 1, pants[2])
    for lx, lift in ((CX - 4, lift_l), (CX + 1, lift_r)):
        knee = hip_y + (FOOT_Y - hip_y) // 2 - lift
        c.rect(lx, hip_y, lx + 3, FOOT_Y - 3 - lift, pants[2])
        c.rect(lx + 3, hip_y + 1, lx + 3, FOOT_Y - 3 - lift, pants[1])
        c.rect(lx, hip_y, lx, FOOT_Y - 4 - lift, pants[3])
        if lift:
            c.rect(lx, knee, lx + 3, knee, pants[3])
        c.rect(lx - (1 if lx < CX else 0), FOOT_Y - 3 - lift, lx + 3 + (1 if lx > CX else 0), FOOT_Y - lift, boot[2])
        c.rect(lx - (1 if lx < CX else 0), FOOT_Y - lift, lx + 3 + (1 if lx > CX else 0), FOOT_Y - lift, boot[0])
        c.rect(lx, FOOT_Y - 3 - lift, lx + 3, FOOT_Y - 3 - lift, boot[3])
    # tay: chỉ vẽ tay KHÔNG cầm súng (phía -x); tay súng (+x) do code vẽ theo rig
    sw = int(round(s * 2))
    ax, d = (CX - 7, -sw)
    c.rect(ax, top + 13 + max(0, d), ax + 1, top + 22 + d, t[1])
    c.rect(ax, top + 22 + d, ax + 1, top + 23 + d, skin[1])
    # thân hình thang: vai 13 px → eo 10 px
    c.poly([(CX - 6, top + 12), (CX + 6, top + 12), (CX + 5, top + 25), (CX - 5, top + 25)], t[2])
    c.rect(CX - 6, top + 12, CX - 4, top + 24, t[1])
    c.rect(CX + 4, top + 13, CX + 5, top + 24, t[0] if back else t[1])
    if not back:
        c.rect(CX - 2, top + 13, CX + 2, top + 16, t[3])
    c.ellipse(CX + 6, top + 13, 2.2, 2, t[2])  # vai súng
    c.rect(CX - 5, top + 22, CX + 5, top + 23, ramp('#3b2f2f')[2])
    if not back:
        c.set(CX, top + 22, trim[3])
        c.line(CX - 4, top + 13, CX + 3, top + 21, trim[2], 1)
        if L.hid == 'laser':
            c.rect(CX - 1, top + 16, CX + 1, top + 18, acc)
        if L.hid == 'knight':
            c.rect(CX - 1, top + 15, CX + 1, top + 19, trim[3])
            c.rect(CX - 2, top + 16, CX + 2, top + 16, trim[3])
    else:
        if L.backpack == 'tank':
            c.shaded_rect(CX - 3, top + 13, CX + 3, top + 24, ramp('#868e96'))
            c.rect(CX - 3, top + 17, CX + 3, top + 18, trim[2])
        elif L.backpack == 'shield':
            c.shaded_rect(CX - 4, top + 13, CX + 4, top + 24, ramp('#ced4da'))
            c.rect(CX - 1, top + 16, CX + 1, top + 20, trim[2])
        elif L.backpack == 'battery':
            c.shaded_rect(CX - 3, top + 14, CX + 3, top + 22, ramp('#495057'))
            c.rect(CX - 1, top + 16, CX + 1, top + 20, acc)
    if L.scarf:
        sc = ramp(L.scarf)
        c.rect(CX - 5, top + 11, CX + 5, top + 13, sc[2])
        if not back:
            c.rect(CX + 2, top + 13, CX + 3, top + 17, sc[1])
    # đầu
    hx, hy = CX - 4, top + 2
    c.rect(hx, hy + 1, hx + 8, hy + 8, skin[2])
    c.rect(hx + 1, hy, hx + 7, hy + 9, skin[2])
    if not back:
        c.set(hx + 2, hy + 5, (32, 26, 40, 255))
        c.set(hx + 6, hy + 5, (32, 26, 40, 255))
        c.rect(hx + 3, hy + 8, hx + 5, hy + 8, skin[1])
    g = L.headgear
    if g == 'hood':
        c.rect(hx - 1, hy - 1, hx + 9, hy + 2, main[2])
        c.rect(hx - 1, hy - 1, hx, hy + 10, main[1])
        c.rect(hx + 8, hy - 1, hx + 9, hy + 10, main[1])
        c.rect(hx, hy - 2, hx + 8, hy - 1, main[3])
        if back:
            c.rect(hx - 1, hy - 1, hx + 9, hy + 10, main[2])
            c.rect(hx + 1, hy, hx + 3, hy + 6, main[3])
        else:
            c.rect(hx + 1, hy + 4, hx + 7, hy + 5, acc)
            c.set(hx + 2, hy + 4, (220, 255, 255, 255))
    elif g == 'helm':
        c.rect(hx - 1, hy - 1, hx + 9, hy + 9, main[2])
        c.rect(hx - 1, hy + 7, hx + 9, hy + 9, main[1])
        c.rect(hx - 1, hy - 1, hx + 9, hy - 1, trim[2])
        c.rect(hx + 4, hy - 1, hx + 4, hy + 9, trim[2])
        if not back:
            c.rect(hx + 1, hy + 4, hx + 7, hy + 4, (20, 20, 30, 255))
        c.line(hx, hy, hx - 3, hy - 4, trim[2], 2)
        c.line(hx + 8, hy, hx + 11, hy - 4, trim[2], 2)
    elif g == 'gasmask':
        c.rect(hx - 1, hy - 2, hx + 9, hy + 10, main[2])
        c.rect(hx + 3, hy - 4, hx + 5, hy - 2, main[1])
        if not back:
            c.rect(hx + 1, hy + 2, hx + 7, hy + 9, ramp('#495057')[2])
            c.rect(hx + 1, hy + 3, hx + 3, hy + 4, hexc('#ffa94d'))
            c.rect(hx + 5, hy + 3, hx + 7, hy + 4, hexc('#ffa94d'))
            c.rect(hx + 3, hy + 7, hx + 5, hy + 10, ramp('#343a40')[2])
        c.rect(hx - 1, hy + 9, hx + 9, hy + 10, trim[2])
    elif g == 'visor':
        c.ellipse(hx + 4, hy + 4, 5.5, 5.2, main[2])
        c.ellipse(hx + 2.5, hy + 2, 2, 1.5, main[3])
        if not back:
            c.rect(hx, hy + 3, hx + 8, hy + 5, acc)
            c.rect(hx + 1, hy + 3, hx + 3, hy + 3, (255, 214, 235, 255))
        c.line(hx + 7, hy, hx + 9, hy - 5, hexc('#9c36b5'), 1)
        c.set(hx + 9, hy - 6, hexc('#e599f7'))
    elif g == 'bunny':
        c.rect(hx - 1, hy - 1, hx + 9, hy + 2, main[2])
        c.rect(hx - 1, hy - 1, hx, hy + 10, main[1])
        c.rect(hx + 8, hy - 1, hx + 9, hy + 10, main[1])
        if back:
            c.rect(hx - 1, hy - 1, hx + 9, hy + 10, main[2])
        c.line(hx + 1, hy - 1, hx, hy - 8, main[2], 2)
        c.line(hx + 7, hy - 1, hx + 8, hy - 8, main[2], 2)
        if not back:
            c.line(hx + 1, hy - 2, hx + 1, hy - 6, hexc('#ffc9c9'), 1)
            c.line(hx + 7, hy - 2, hx + 8, hy - 6, hexc('#ffc9c9'), 1)
            c.set(hx + 1, hy + 7, hexc('#ff8787'))
            c.set(hx + 7, hy + 7, hexc('#ff8787'))
        red = ramp(L.accent)
        c.rect(hx + 5, hy - 2, hx + 8, hy - 1, red[2])
        c.set(hx + 6, hy - 2, red[3])
    _moon_rim(c, -1, 0.28)
    c.outline()
    return c


# ---------------------------------------------------------------------------
# Animation sets
# ---------------------------------------------------------------------------

# Số frame mỗi trạng thái — PHẢI khớp `BANSUNG_HERO_ANIM_SPECS` trong shared/src/bansung/heroes.ts
FRAMES = {'idle': 6, 'run': 8, 'shoot': 4, 'dash': 6, 'stunned': 4, 'dead': 6}
DIR_FRAMES = {'idle': 6, 'walk': 8}
# Bob thân khi chạy (px sprite, + là xuống) — khớp HERO_RUN_BOB_Y (×1.5) trong heroes.ts
RUN_BOB = [1, 0, -1, 0, 1, 0, -1, 0]


def side_clips(L: HeroLook):
    img = {}
    # idle 6: thở chậm (lên-xuống 1 px), vai & tay khẽ chuyển, áo phập phồng
    ib = [0, 0, 1, 1, 1, 0]
    ia = [0.0, 0.04, 0.08, 0.1, 0.06, 0.02]
    img['idle'] = [draw_side(L, bob=b, arm=a, cloth=0.15 * math.sin(i * math.pi / 3)).img
                   for i, (b, a) in enumerate(zip(ib, ia))]
    # run 8: gait đầy đủ, nghiêng người ra trước, bob theo nhịp chạm đất
    img['run'] = [draw_side(L, phase=i * math.pi / 4, moving=True, bob=RUN_BOB[i], lean=0.35,
                            stride=5.0, lift=3.5).img for i in range(8)]
    # shoot 4: giật lùi → hồi vị trí (anticipation-follow through)
    img['shoot'] = [draw_side(L, lean=v, arm=0.55, bob=b).img
                    for v, b in ((-0.45, 0), (-0.25, 0), (-0.1, 0), (0.0, 0))]
    # dash 6: hạ trọng tâm → bật → lướt thấp → tiếp đất
    dash_k = [(0.4, 1, 0.3, 2), (1.2, 2, 0.9, 3), (2.0, 3, 1.0, 3), (2.8, 3, 1.0, 2), (3.6, 2, 0.6, 1), (4.4, 1, 0.2, 0)]
    img['dash'] = [draw_side(L, phase=ph, moving=True, lean=ln, crouch=cr, stride=6.0, lift=4.0, cloth=-0.8).img
                   for ph, cr, ln, _ in dash_k]
    # stunned 4: lảo đảo trước-sau, đầu gật
    st = []
    for deg, tilt in ((6, 1), (2, 0), (-5, 1), (-1, 0)):
        base = draw_side(L, bob=1, arm=-0.4, head_tilt=tilt).img
        st.append(rotate_about(base, deg, CX, FOOT_Y))
    img['stunned'] = st
    # dead 6: khuỵu gối → ngã ngửa → nằm im
    dead = []
    for deg, cr in ((0, 2), (8, 4), (28, 4), (55, 3), (80, 2), (90, 1)):
        base = draw_side(L, crouch=cr, arm=-0.6).img
        dead.append(rotate_about(base, deg, CX, FOOT_Y) if deg else base)
    img['dead'] = dead
    for k, v in img.items():
        assert len(v) == FRAMES[k], (k, len(v))
    return img


def directional_clips(L: HeroLook):
    """Dải 4 hướng (down/left/right/up) cho idle 6 frame và walk 8 frame."""
    out = {}
    ib = [0, 0, 1, 1, 1, 0]
    down_i = [draw_front(L, bob=b).img for b in ib]
    up_i = [draw_front(L, bob=b, back=True).img for b in ib]
    right_i = [draw_side(L, bob=b, arm=0.05 * (i % 3)).img for i, b in enumerate(ib)]
    out[('idle', 'down')] = down_i
    out[('idle', 'up')] = up_i
    out[('idle', 'right')] = right_i
    out[('idle', 'left')] = [flip_h(f) for f in right_i]
    ph = [i * math.pi / 4 for i in range(8)]
    out[('walk', 'down')] = [draw_front(L, phase=p, moving=True, bob=RUN_BOB[i]).img for i, p in enumerate(ph)]
    out[('walk', 'up')] = [draw_front(L, phase=p, moving=True, bob=RUN_BOB[i], back=True).img for i, p in enumerate(ph)]
    rw = [draw_side(L, phase=p, moving=True, bob=RUN_BOB[i], lean=0.2, stride=4.0, lift=2.5).img for i, p in enumerate(ph)]
    out[('walk', 'right')] = rw
    out[('walk', 'left')] = [flip_h(f) for f in rw]
    return out


def move8_atlas(L: HeroLook):
    """Atlas tham chiếu 8 cột × 8 hàng (idle 6 frame + 2 ô trống; walk 8 frame) — down, left, right, up."""
    d = directional_clips(L)
    rows = []
    for st in ('idle', 'walk'):
        for dr in ('down', 'left', 'right', 'up'):
            rows.append(d[(st, dr)])
    return grid(rows, CELL, CELL)


def build_all(out_dir: str, design_dir: str | None = None):
    import os
    os.makedirs(out_dir, exist_ok=True)
    written = []
    for L in HEROES:
        for state, frames in side_clips(L).items():
            p = os.path.join(out_dir, f'hero_{L.hid}_{state}.png')
            strip(frames, CELL, CELL).save(p)
            written.append((p, len(frames)))
        for (st, dr), frames in directional_clips(L).items():
            p = os.path.join(out_dir, f'hero_{L.hid}_{st}_{dr}.png')
            strip(frames, CELL, CELL).save(p)
            written.append((p, len(frames)))
        if design_dir:
            os.makedirs(design_dir, exist_ok=True)
            move8_atlas(L).save(os.path.join(design_dir, f'hero_{L.hid}_move8.png'))
    return written
