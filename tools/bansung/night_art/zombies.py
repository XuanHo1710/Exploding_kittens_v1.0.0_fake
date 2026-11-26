"""
tools/bansung/night_art/zombies.py  (v2 — spec 007 "Đêm Zombie")

Reskin toàn bộ quái thường thành ZOMBIE, vẽ procedural theo rig (Pillow) với
NHIỀU FRAME hơn và chuyển động chân thực hơn:

  clip       frame   ghi chú
  idle         6     thở, đầu lắc lư, tay đung đưa, hàm nhai
  run          8     chu kỳ bước đầy đủ (contact → passing), gối gập, bob theo bước,
                     tay vươn/lắc ngược chân, walker khập khiễng, runner đổ người
  attack       8     anticipation (kéo tay về) → strike (vồ/cắn) → recovery
  lunge        6     thu người → bật nhảy → tiếp đất
  slam         8     giơ hai tay qua đầu → nện xuống + bụi
  fuse_run     8     chạy + mụn mủ phát sáng nhấp nháy
  spark        4     phình ra, sắp nổ
  dead         8     trúng đòn → loạng choạng → ngã ngửa (xoay quanh chân, tự căn giữa)
                     + máu phun theo cung + vũng máu loang; Bloater nổ tung

Giữ nguyên kích thước cell & pivot trong manifest (gameplay, hitbox, AI không đổi).
Chỉ thay số frame (xem CLIP_FRAMES) → parent cập nhật manifest/LICENSES.

7 dạng cơ thể: walker, runner, brute (Tank), bloater, spitter, crawler, crow.
Mắt phát sáng theo nguyên tố → đọc được trong bóng tối.
"""
from __future__ import annotations

import math

from pixel import Canvas, hexc, ramp, mix, rotate_about, strip

from PIL import Image

ARCHETYPE = {
    'scarab': 'crawler', 'mortar_beetle': 'crawler',
    'skirmisher': 'runner', 'venom_stalker': 'runner', 'volt_stalker': 'runner',
    'void_reaper': 'runner', 'crimson_lancer': 'runner', 'saw_berserker': 'runner',
    'mirror_knight': 'walker',
    'bomb_goblin': 'bloater', 'blight_bomber': 'bloater', 'plague_bearer': 'bloater',
    'cactus_brute': 'brute', 'magma_brute': 'brute', 'plasma_golem': 'brute', 'shield_warden': 'brute',
    'cactus_spitter': 'spitter', 'pyro_shaman': 'spitter', 'thunder_mage': 'spitter',
    'frost_mage': 'spitter', 'void_acolyte': 'spitter', 'healing_priest': 'spitter',
    'chrono_mage': 'spitter', 'solar_priest': 'spitter', 'laser_sniper': 'spitter', 'sniper_mech': 'spitter',
    'iron_drone': 'crow', 'shock_drone_mk2': 'crow', 'magnet_drone': 'crow',
}

# skin, clothes, eye/glow, blood
ELEM = {
    'rot':    ('#7a9a6a', '#4a4e5a', '#d8f5a2', '#6b0f1a'),
    'fire':   ('#6b4a3a', '#3b2a24', '#ff922b', '#5c1010'),
    'frost':  ('#8fb3c9', '#3d5a80', '#a5d8ff', '#3b2f6b'),
    'volt':   ('#7b8a6a', '#3a3f2a', '#ffe066', '#6b0f1a'),
    'void':   ('#7d6b8f', '#3b1f5e', '#d0bfff', '#4c1d95'),
    'toxic':  ('#7fae4e', '#3f5a2a', '#a9e34b', '#3f6212'),
    'mech':   ('#8a8f7a', '#495057', '#ff6b6b', '#6b0f1a'),
    'blood':  ('#9a8a72', '#7a1d1d', '#ff4d4d', '#7f1d1d'),
    'holy':   ('#a3a88f', '#dee2e6', '#63e6be', '#6b0f1a'),
}
MOB_ELEM = {
    'scarab': 'rot', 'mortar_beetle': 'fire', 'skirmisher': 'blood', 'venom_stalker': 'toxic',
    'volt_stalker': 'volt', 'void_reaper': 'void', 'crimson_lancer': 'blood', 'saw_berserker': 'blood',
    'mirror_knight': 'mech', 'bomb_goblin': 'fire', 'blight_bomber': 'toxic', 'plague_bearer': 'toxic',
    'cactus_brute': 'rot', 'magma_brute': 'fire', 'plasma_golem': 'void', 'shield_warden': 'mech',
    'cactus_spitter': 'toxic', 'pyro_shaman': 'fire', 'thunder_mage': 'volt', 'frost_mage': 'frost',
    'void_acolyte': 'void', 'healing_priest': 'holy', 'chrono_mage': 'void', 'solar_priest': 'fire',
    'laser_sniper': 'mech', 'sniper_mech': 'mech', 'iron_drone': 'mech', 'shock_drone_mk2': 'volt',
    'magnet_drone': 'mech',
}

# Tên hiển thị tiếng Anh ngắn gọn (đồng bộ với `shortName` trong shared/src/bansung/enemies.ts)
ZOMBIE_SHORT_NAMES = {
    'scarab': 'Crawler', 'skirmisher': 'Runner', 'bomb_goblin': 'Bloater', 'cactus_brute': 'Tank',
    'cactus_spitter': 'Spitter', 'laser_sniper': 'Sniper', 'pyro_shaman': 'Burner', 'thunder_mage': 'Shocker',
    'iron_drone': 'Crow', 'frost_mage': 'Frost', 'venom_stalker': 'Stalker', 'shield_warden': 'Riot',
    'mortar_beetle': 'Mortar', 'void_acolyte': 'Acolyte', 'saw_berserker': 'Sawman', 'healing_priest': 'Priest',
    'shock_drone_mk2': 'Volt Crow', 'chrono_mage': 'Warper', 'plasma_golem': 'Void Tank', 'sniper_mech': 'Marksman',
    'plague_bearer': 'Plaguer', 'crimson_lancer': 'Lancer', 'void_reaper': 'Reaper', 'mirror_knight': 'Knight',
    'magnet_drone': 'Mag Crow', 'blight_bomber': 'Boomer', 'volt_stalker': 'Sparker', 'solar_priest': 'Sunburnt',
    'magma_brute': 'Magma Tank',
}

# Số frame mới cho từng loại clip
CLIP_FRAMES = {
    'idle': 6, 'run': 8, 'attack': 8, 'lunge': 6, 'slam': 8, 'fuse_run': 8, 'spark': 4, 'dead': 8,
}
CLIP_FPS = {
    'idle': 6, 'run': 12, 'attack': 16, 'lunge': 14, 'slam': 14, 'fuse_run': 16, 'spark': 14, 'dead': 12,
}

MOUTH = (40, 10, 16, 255)
BONE = hexc('#e9e4d0')
BONE_D = hexc('#b8b09a')
SHOE = ramp('#2b2b2b')


def _blood(mob):
    return ramp(ELEM[MOB_ELEM.get(mob, 'rot')][3])


def _eye(c: Canvas, x, y, glow):
    c.set(x, y, glow)
    c.set(x + 1, y, (255, 255, 255, 255))


def _limb(c: Canvas, x0, y0, x1, y1, col, w):
    c.line(x0, y0, x1, y1, col, max(1, int(round(w))))


# ---------------------------------------------------------------------------
# Humanoid zombie (walker / runner / spitter / brute / bloater)
# ---------------------------------------------------------------------------

def humanoid(cw, ch, foot, mob, arche, pose) -> Canvas:
    """pose: gait, moving, bob, lean, windup, attack, raise_, jaw, sway, tilt, hurt, glowpulse, swell."""
    c = Canvas(cw, ch)
    skin_h, cloth_h, glow_h, _ = ELEM[MOB_ELEM.get(mob, 'rot')]
    skin = ramp(skin_h)
    cloth = ramp(cloth_h)
    glow = hexc(glow_h)
    pants = ramp('#3a3a4a' if arche != 'brute' else '#33302c')
    blood = _blood(mob)

    gait = pose.get('gait', 0.0)
    moving = pose.get('moving', False)
    bob = pose.get('bob', 0)
    lean = pose.get('lean', 0.0)
    windup = pose.get('windup', 0.0)
    attack = pose.get('attack', 0.0)
    raise_ = pose.get('raise_', 0.0)
    jaw = pose.get('jaw', 0)
    sway = pose.get('sway', 0.0)
    tilt = pose.get('tilt', 0)
    swell = pose.get('swell', 0.0)
    gp = pose.get('glowpulse', 1.0)

    u = foot / 46.0
    cx = cw // 2
    size = {'walker': 1.0, 'runner': 0.95, 'spitter': 0.95, 'brute': 1.0, 'bloater': 0.92}[arche]
    H = 36 * u * size
    if arche == 'brute':
        H = foot * 0.86
    top = foot - H + bob
    hunch = {'walker': 2, 'runner': 4, 'spitter': 3, 'brute': 2, 'bloater': 1}[arche] * u
    hunch += lean * u
    s = math.sin(gait) if moving else 0.0
    cg = math.cos(gait) if moving else 0.0
    stride = {'walker': 4, 'runner': 6.5, 'spitter': 4, 'brute': 4.5, 'bloater': 3.5}[arche] * u
    lift_h = {'walker': 1.5, 'runner': 3.5, 'spitter': 2, 'brute': 2, 'bloater': 1.5}[arche] * u

    shoulder_w = {'walker': 11, 'runner': 10, 'spitter': 10, 'brute': 20, 'bloater': 12}[arche] * u
    hip_y = top + H * 0.66
    sh_y = top + H * 0.30
    head_r = {'walker': 4.2, 'runner': 4.0, 'spitter': 4.6, 'brute': 4.0, 'bloater': 4.0}[arche] * u
    leg_w = (7 if arche == 'brute' else 3.6) * u
    arm_w = (6 if arche == 'brute' else 3.0) * u

    def leg(hipx, phase_sign, col, shoe):
        # chân: đùi + cẳng, gối gập khi nhấc, khập khiễng cho walker
        ss = s * phase_sign
        fx = hipx + stride * ss
        lift = max(0.0, cg * phase_sign) * lift_h if moving else 0.0
        if arche == 'walker' and phase_sign > 0:
            lift *= 0.4  # chân bị thương lê đi
        fy = foot - 1 - lift
        kx = (hipx + fx) / 2 + (1.5 + lift * 0.6) * u
        ky = (hip_y + fy) / 2 - lift * 0.3
        _limb(c, hipx, hip_y, kx, ky, col[2], leg_w)
        _limb(c, kx, ky, fx, fy - 1, col[1], leg_w * 0.9)
        c.set(kx + 1, ky, col[3])
        # ống quần rách lộ xương ống chân
        if arche in ('walker', 'runner') and phase_sign < 0:
            c.set(kx - 1, ky + 2, BONE_D)
        c.rect(fx - 2 * u, fy - 1, fx + 2.5 * u, fy + 1, shoe[1])
        c.rect(fx - 2 * u, fy + 1, fx + 2.5 * u, fy + 1, shoe[0])
        return fx, fy

    def arm(shx, shy, front, col):
        # cánh tay 2 đoạn: zombie vươn ra trước; windup kéo về, attack vồ tới
        base_reach = {'walker': 11, 'runner': 7, 'spitter': 6, 'brute': 4, 'bloater': 6}[arche] * u
        swing = (-s if front else s) * (2.5 if arche == 'runner' else 1.2) * u
        reach = base_reach + attack * 7 * u - windup * 6 * u + swing + sway * u
        drop = {'walker': 3, 'runner': 6, 'spitter': 7, 'brute': 14, 'bloater': 7}[arche] * u
        drop += windup * -3 * u - attack * 2 * u
        if raise_ > 0:  # slam: tay giơ qua đầu
            reach = reach * (1 - raise_) + (-1 * u) * raise_
            drop = drop * (1 - raise_) + (-H * 0.55) * raise_
        ex = shx + reach * 0.45
        ey = shy + drop * 0.55 + (1 if front else 0)
        hx = shx + reach
        hy = shy + drop
        _limb(c, shx, shy, ex, ey, col[2] if front else col[1], arm_w)
        _limb(c, ex, ey, hx, hy, col[1] if not front else col[2], arm_w * 0.85)
        if arche == 'brute':
            c.ellipse(hx + 1, hy, 3.6 * u, 3.6 * u, col[1])
            c.ellipse(hx, hy - 1, 1.6 * u, 1.4 * u, col[3])
        else:
            c.rect(hx, hy - 1, hx + 1.5 * u, hy + 1, col[1])
            c.set(hx + 2 * u, hy, BONE_D)          # móng / ngón tay xương
            c.set(hx + 2 * u, hy + 2, BONE_D)
        if front:
            c.set(ex, ey + 1, blood[2])
        return hx, hy

    # --- tay sau ---
    arm(cx + hunch * 0.5, sh_y + 1, False, skin)
    # --- chân sau ---
    hip_off = 3.5 * u if arche == 'brute' else 1
    leg(cx - hip_off, -1, (pants[0], pants[0], pants[1], pants[2]), (SHOE[0], SHOE[0], SHOE[1], SHOE[2]))

    # --- thân ---
    tx0 = cx - shoulder_w / 2 + hunch
    if arche == 'bloater':
        br = (9 + swell * 3) * u
        bx, by = cx + hunch * 0.5, hip_y - 6 * u
        c.ellipse(bx, by, br, br * 0.95, skin[2])
        c.ellipse(bx + br * 0.25, by - br * 0.35, br * 0.4, br * 0.3, skin[3])
        c.ellipse(bx - br * 0.45, by + br * 0.35, br * 0.45, br * 0.4, skin[1])
        # rạn da + mụn mủ phát sáng
        c.line(bx - br * 0.6, by - br * 0.1, bx - br * 0.1, by + br * 0.3, skin[0], 1)
        c.line(bx + br * 0.1, by + br * 0.6, bx + br * 0.5, by + br * 0.2, skin[0], 1)
        pg = glow if gp > 0.5 else mix(glow, skin[2], 0.55)
        for (ox, oy, rr) in ((-4, -2, 1.5), (3, 2, 1.7), (-1, 4, 1.2), (5, -5, 1.4), (-6, 3, 1.1)):
            c.ellipse(bx + ox * u * (1 + swell * 0.3), by + oy * u * (1 + swell * 0.3), rr * u, rr * u, pg)
            c.set(bx + ox * u - 1, by + oy * u - 1, (255, 255, 240, 255))
        c.rect(cx - 7 * u, hip_y - 1 * u, cx + 7 * u, hip_y, cloth[1])
        c.rect(cx - 6 * u, hip_y + 1 * u, cx - 3 * u, hip_y + 2 * u, cloth[1])
    else:
        c.poly([(tx0, sh_y), (tx0 + shoulder_w, sh_y), (cx + shoulder_w * 0.32 + hunch * 0.4, hip_y),
                (cx - shoulder_w * 0.36 + hunch * 0.2, hip_y)], cloth[2])
        c.poly([(tx0, sh_y), (tx0 + shoulder_w * 0.35, sh_y), (cx - shoulder_w * 0.2, hip_y),
                (cx - shoulder_w * 0.36 + hunch * 0.2, hip_y)], cloth[1])
        c.rect(tx0 + shoulder_w * 0.6, sh_y, tx0 + shoulder_w - 1, sh_y + 1, cloth[3])
        # áo rách lộ da, xương sườn, vết thương
        mid_y = sh_y + (hip_y - sh_y) * 0.5
        c.ellipse(cx + shoulder_w * 0.15 + hunch * 0.6, mid_y, 2.4 * u, 3.2 * u, skin[1])
        for k in range(3):
            c.set(cx + shoulder_w * 0.08 + hunch * 0.6 + k, mid_y - 1 + k * 2 * u * 0.6, BONE)
        c.set(cx + hunch * 0.6, sh_y + (hip_y - sh_y) * 0.35, blood[3])
        c.set(cx + 1 + hunch * 0.6, sh_y + (hip_y - sh_y) * 0.42, blood[2])
        c.set(cx + 1 + hunch * 0.6, sh_y + (hip_y - sh_y) * 0.62, blood[2])
        # vạt áo rách tua rua
        for k in range(4):
            hx_ = cx - shoulder_w * 0.3 + hunch * 0.3 + k * shoulder_w * 0.2
            c.set(hx_, hip_y + 1 + (k % 2), cloth[1])
        if arche == 'brute':
            c.ellipse(tx0 + shoulder_w * 0.25, sh_y + 2 * u, 5 * u, 4 * u, skin[2])
            c.ellipse(tx0 + shoulder_w * 0.2, sh_y + 1 * u, 2.5 * u, 2 * u, skin[3])
            c.ellipse(tx0 + shoulder_w * 0.7, sh_y + 6 * u, 3 * u, 2.5 * u, skin[1])  # khối u
            for k in range(4):
                c.set(tx0 + shoulder_w * (0.4 + 0.11 * k), sh_y + 4 * u + k * 2, glow)
            # gai xương lộ trên lưng
            for k in range(3):
                bx_ = tx0 + 2 + k * 3 * u
                c.line(bx_, sh_y + 1, bx_ - 1, sh_y - 2 * u, BONE, 1)
        # chi tiết nguyên tố
        el = MOB_ELEM.get(mob, 'rot')
        if el == 'fire':
            for k in range(3):
                c.set(tx0 + 2 + k * 3, sh_y + 3 + k * 2, hexc('#1f1410'))
                c.set(tx0 + 3 + k * 3, sh_y + 4 + k * 2, hexc('#ff922b') if gp > 0.5 else hexc('#c2410c'))
        elif el == 'frost':
            c.line(tx0, sh_y - 1, tx0 + 3, sh_y - 2, hexc('#e7f5ff'), 1)
            c.set(tx0 + shoulder_w - 2, sh_y - 1, hexc('#e7f5ff'))
        elif el == 'toxic':
            c.set(cx + hunch * 0.4, hip_y + 2, glow)
            c.set(cx + hunch * 0.4, hip_y + 3 + int(gp * 2), glow)
        elif el == 'void':
            c.line(tx0 + 2, sh_y + 2, tx0 + 4, hip_y - 2, hexc('#9775fa'), 1)
        elif el == 'volt':
            if gp > 0.5:
                c.line(tx0 + shoulder_w, sh_y, tx0 + shoulder_w + 2, sh_y - 3, glow, 1)
    c.rect(cx - shoulder_w * 0.36 + hunch * 0.2, hip_y - 1, cx + shoulder_w * 0.32 + hunch * 0.4, hip_y,
           ramp('#3b2f2f')[2])

    # --- chân trước ---
    leg(cx + hip_off, 1, pants, SHOE)

    # --- đầu ---
    hx = cx + hunch + 2 * u + tilt * 0.5
    hy = top + head_r + abs(tilt) * 0.3
    if arche == 'brute':
        hx = cx + hunch + 3 * u
        hy = sh_y - head_r * 0.2
    # cổ
    _limb(c, cx + hunch * 0.8, sh_y, hx - 1, hy + head_r * 0.6, skin[1], 2.2 * u)
    c.ellipse(hx, hy, head_r, head_r * 1.05, skin[2])
    c.ellipse(hx - head_r * 0.35, hy - head_r * 0.35, head_r * 0.45, head_r * 0.35, skin[3])
    c.ellipse(hx - head_r * 0.6, hy + head_r * 0.3, head_r * 0.35, head_r * 0.5, skin[1])
    c.set(hx - head_r * 0.7, hy, skin[0])  # tai
    # tóc lơ thơ + mảng sọ lộ
    c.line(hx - head_r, hy - head_r * 0.6, hx + head_r * 0.2, hy - head_r * 1.05, ramp('#2f2a2a')[1], 1)
    c.line(hx - head_r * 0.8, hy - head_r * 0.2, hx - head_r * 1.2, hy + head_r * 0.4, ramp('#2f2a2a')[1], 1)
    if mob in ('skirmisher', 'void_reaper', 'saw_berserker', 'cactus_brute'):
        c.ellipse(hx - head_r * 0.1, hy - head_r * 0.6, head_r * 0.35, head_r * 0.25, BONE)
    # mắt phát sáng, quầng thâm, hàm há
    c.set(hx + head_r * 0.35, hy - head_r * 0.15 + 1, skin[0])
    _eye(c, int(round(hx + head_r * 0.35)), int(round(hy - head_r * 0.15)), glow)
    mouth_open = 1 + int(round(jaw + attack * 2))
    if arche == 'spitter':
        mouth_open += 1
        c.ellipse(hx + head_r * 0.2, hy + head_r * 1.15, head_r * 0.6, head_r * 0.55, skin[1])
    my = hy + head_r * 0.45
    c.rect(hx + head_r * 0.1, my, hx + head_r * 0.85, my + mouth_open, MOUTH)
    c.set(hx + head_r * 0.3, my, BONE)  # răng
    c.set(hx + head_r * 0.7, my, BONE)
    if mouth_open >= 2:
        c.set(hx + head_r * 0.5, my + mouth_open, blood[2])  # chảy dãi máu
    if arche == 'spitter' and attack > 0.3:
        c.rect(hx + head_r * 0.3, my + 1, hx + head_r * 0.75, my + mouth_open - 1, glow)
        # luồng phun bắn ra
        for k in range(int(2 + attack * 4)):
            c.set(hx + head_r + 1 + k * 2, my + 1 + (k % 2), glow)

    # --- tay trước ---
    fhx, fhy = arm(cx + hunch * 0.7 + 1, sh_y + 2, True, skin)

    # --- phụ kiện ---
    if mob == 'shield_warden':
        sh = ramp('#343a40')
        sx = fhx - 2 * u
        c.rect(sx, sh_y - 4 * u, sx + 4 * u, hip_y + 4 * u, sh[2])
        c.rect(sx + 4 * u, sh_y - 4 * u, sx + 4 * u, hip_y + 4 * u, sh[0])
        c.rect(sx + 1, sh_y - 3 * u, sx + 3 * u, sh_y + 2 * u, ramp('#74c0fc')[1])
        c.set(sx + 1, sh_y - 3 * u, hexc('#d0ebff'))
        c.rect(sx, hip_y - 3 * u, sx + 4 * u, hip_y - 2 * u, hexc('#fcc419'))
        c.line(sx + 1, hip_y, sx + 3 * u, hip_y + 2 * u, sh[3], 1)  # vết xước
    if mob == 'saw_berserker':
        rot = pose.get('frame', 0) * 0.8
        c.ellipse(fhx + 3 * u, fhy, 4.2 * u, 4.2 * u, ramp('#adb5bd')[2])
        for k in range(6):
            a = rot + k * math.pi / 3
            c.set(fhx + 3 * u + math.cos(a) * 4.5 * u, fhy + math.sin(a) * 4.5 * u, ramp('#adb5bd')[3])
        c.ellipse(fhx + 3 * u, fhy, 1.2 * u, 1.2 * u, blood[2])
    if mob in ('crimson_lancer', 'void_reaper'):
        col = ramp('#868e96' if mob == 'crimson_lancer' else '#9775fa')
        ang = -0.45 + attack * 0.5 - windup * 0.4
        lx0, ly0 = fhx - 8 * u * math.cos(ang), fhy - 8 * u * math.sin(ang)
        lx1, ly1 = fhx + 10 * u * math.cos(ang), fhy + 10 * u * math.sin(ang)
        c.line(lx0, ly0, lx1, ly1, ramp('#5c3d2e')[2], 1)
        c.line(lx1, ly1, lx1 + 3 * u * math.cos(ang), ly1 + 3 * u * math.sin(ang), col[3], 2)
        if mob == 'void_reaper':
            c.line(lx1, ly1, lx1 - 4 * u, ly1 + 3 * u, col[2], 1)
    if mob in ('laser_sniper', 'sniper_mech', 'mirror_knight'):
        c.rect(hx - head_r, hy - head_r * 0.55, hx + head_r * 0.6, hy - head_r * 0.2, ramp('#495057')[2])
        c.set(hx - head_r * 0.6, hy - head_r * 0.55, ramp('#495057')[3])
        _eye(c, int(round(hx + head_r * 0.35)), int(round(hy - head_r * 0.15)), glow)
        if mob != 'mirror_knight':
            gun = ramp('#343a40')
            c.line(fhx - 3 * u, fhy, fhx + 8 * u, fhy - 1 - attack * 2, gun[2], 2)
            if attack > 0.6:
                c.set(fhx + 9 * u, fhy - 1 - attack * 2, hexc('#ffd43b'))
    if mob in ('healing_priest', 'solar_priest', 'void_acolyte', 'chrono_mage', 'frost_mage', 'thunder_mage',
               'pyro_shaman'):
        hood = ramp(cloth_h)
        c.ellipse(hx - head_r * 0.25, hy - head_r * 0.25, head_r * 1.15, head_r * 1.05, hood[1])
        c.ellipse(hx - head_r * 0.45, hy - head_r * 0.55, head_r * 0.5, head_r * 0.3, hood[3])
        c.ellipse(hx + head_r * 0.25, hy + head_r * 0.1, head_r * 0.75, head_r * 0.85, skin[2])
        _eye(c, int(round(hx + head_r * 0.35)), int(round(hy - head_r * 0.15)), glow)
        c.rect(hx + head_r * 0.1, my, hx + head_r * 0.8, my + mouth_open, MOUTH)
        # quả cầu năng lượng trong tay khi vận chiêu
        if windup > 0.2 or attack > 0.2:
            orb_r = (1.2 + windup * 1.5 + attack) * u
            c.ellipse(fhx + 2 * u, fhy - 1, orb_r, orb_r, glow)
            c.set(fhx + 2 * u, fhy - 2, (255, 255, 255, 255))
    if pose.get('hurt'):
        c.set(hx - 1, hy + 1, blood[3])
        c.set(hx, hy + 2, blood[2])
    c.outline()
    return c


# ---------------------------------------------------------------------------
# Crawler
# ---------------------------------------------------------------------------

def crawler(cw, ch, foot, mob, pose) -> Canvas:
    c = Canvas(cw, ch)
    skin_h, cloth_h, glow_h, _ = ELEM[MOB_ELEM.get(mob, 'rot')]
    skin = ramp(skin_h)
    cloth = ramp(cloth_h)
    glow = hexc(glow_h)
    blood = _blood(mob)
    gait = pose.get('gait', 0.0)
    moving = pose.get('moving', False)
    attack = pose.get('attack', 0.0)
    windup = pose.get('windup', 0.0)
    bob = pose.get('bob', 0)
    u = foot / 28.0 if ch <= 32 else foot / 40.0
    cx = cw // 2
    surge = (math.sin(gait) * 1.2 * u) if moving else 0.0  # thân trườn tới/lùi theo nhịp tay
    by = foot - 5 * u + bob
    bx = cx - 2 * u + surge - windup * 2 * u + attack * 2 * u
    # vệt máu kéo lê
    c.rect(bx - 8 * u, foot - 1, bx - 2 * u, foot, blood[1])
    c.set(bx - 9 * u, foot, blood[1])
    # chân đứt lê phía sau
    c.line(bx - 6 * u, by + 1 * u, bx - 10 * u, foot - 1, skin[1], max(2, int(round(1.6 * u))))
    c.set(bx - 10 * u, foot - 2, BONE)
    # thân
    c.ellipse(bx, by, 7 * u, 3.6 * u, cloth[2])
    c.ellipse(bx - 1 * u, by - 1.5 * u, 4 * u, 1.5 * u, cloth[3])
    c.ellipse(bx - 5 * u, by + 1 * u, 2.5 * u, 2 * u, skin[1])
    for k in range(3):
        c.set(bx - 2 * u + k * 2, by - 2.5 * u, BONE)  # cột sống lộ
    c.set(bx - 7 * u, by + 1 * u, blood[3])
    if mob == 'mortar_beetle':
        c.ellipse(bx, by - 3.2 * u, 4 * u, 2.6 * u, ramp('#495057')[2])
        c.ellipse(bx - 1, by - 4 * u, 1.5 * u, 1 * u, ramp('#495057')[3])
        pg = glow if pose.get('glowpulse', 1.0) > 0.5 else mix(glow, skin[1], 0.5)
        c.set(bx + 1 * u, by - 5.5 * u, pg)
        c.set(bx + 1 * u, by - 6.5 * u, pg)
    # đầu ngẩng lên khi cắn
    hx = bx + 8 * u + attack * 3 * u - windup * 1 * u
    hy = by - 1 * u - attack * 2.5 * u - windup * 1.5 * u
    c.ellipse(hx, hy, 3.2 * u, 3.2 * u, skin[2])
    c.ellipse(hx - 1 * u, hy - 1 * u, 1.4 * u, 1.2 * u, skin[3])
    c.line(hx - 2.5 * u, hy - 2.5 * u, hx + 0.5 * u, hy - 3.2 * u, ramp('#2f2a2a')[1], 1)
    _eye(c, int(round(hx + 1 * u)), int(round(hy - 0.5 * u)), glow)
    mo = 1 + int(round(attack * 2))
    c.rect(hx + 0.5 * u, hy + 1.2 * u, hx + 2.7 * u, hy + 1.2 * u + mo, MOUTH)
    c.set(hx + 1 * u, hy + 1.2 * u, BONE)
    # hai tay cào: tay này kéo, tay kia vươn (lệch pha)
    for k, off in enumerate((0.0, math.pi)):
        ss = math.sin(gait + off) if moving else 0.0
        ax = bx + 4 * u + k * 2
        reach = 4.5 * u + ss * 2.5 * u + attack * 4 * u - windup * 2 * u
        lift = max(0.0, math.cos(gait + off)) * 2 * u if moving else 0.0
        ex = ax + reach * 0.5
        ey = by - 1 * u - lift
        hxx = ax + reach + 1 * u
        hyy = foot - 1 - lift * 0.5
        col = skin[2] if k == 1 else skin[1]
        c.line(ax, by, ex, ey, col, max(2, int(round(1.8 * u))))
        c.line(ex, ey, hxx, hyy, col, max(2, int(round(1.6 * u))))
        c.set(hxx + 1, hyy, BONE_D)
    c.outline()
    return c


# ---------------------------------------------------------------------------
# Crow (thay drone)
# ---------------------------------------------------------------------------

def crow(cw, ch, foot, mob, pose) -> Canvas:
    c = Canvas(cw, ch)
    _, _, glow_h, _ = ELEM[MOB_ELEM.get(mob, 'mech')]
    glow = hexc(glow_h)
    body = ramp('#2b2b38')
    gait = pose.get('gait', 0.0)
    attack = pose.get('attack', 0.0)
    windup = pose.get('windup', 0.0)
    u = foot / 46.0
    cx = cw // 2 - attack * 2 * u
    cy = foot - 22 * u + math.sin(gait) * 1.5 * u + attack * 7 * u - windup * 3 * u
    flap = math.sin(gait * 2.0)
    if attack > 0.4:
        flap = -0.9  # khép cánh lao xuống
    # bóng đổ dưới đất
    if not pose.get('noshadow'):
        c.ellipse(cw // 2, foot - 1, 5 * u, 1.2, (20, 16, 28, 255))
    # cánh sau
    c.poly([(cx - 1 * u, cy - 2 * u), (cx - 6 * u, cy - 7 * u - flap * 5 * u), (cx - 13 * u, cy - 5 * u - flap * 6 * u),
            (cx - 7 * u, cy + 2 * u)], body[1])
    for k in range(3):
        c.set(cx - (8 + k * 2) * u, cy - (4 + flap * 5) * u + k, body[0])  # lông rách
    # thân
    c.ellipse(cx, cy, 6 * u, 4 * u, body[2])
    c.ellipse(cx - 1 * u, cy - 1.5 * u, 3 * u, 1.5 * u, body[3])
    for k in range(4):
        c.set(cx - 3 * u + k * 2, cy + 1 * u, hexc('#ced4da'))  # xương sườn lộ
    c.set(cx - 1 * u, cy + 2 * u, hexc('#7f1d1d'))
    # đầu + mỏ (há khi lao)
    hx, hy = cx + 6 * u, cy - 2 * u - attack * u
    c.ellipse(hx, hy, 3 * u, 2.6 * u, body[2])
    beak = hexc('#e9b949')
    gape = attack * 1.5 * u
    c.poly([(cx + 8 * u, hy - 0.8 * u), (cx + 13 * u + attack * 3 * u, hy + 0.8 * u - gape), (cx + 8 * u, hy + 0.6 * u)], beak)
    if gape > 0.5:
        c.poly([(cx + 8 * u, hy + 0.8 * u), (cx + 12 * u + attack * 2 * u, hy + 1.6 * u + gape), (cx + 8 * u, hy + 1.6 * u)],
               hexc('#c79a2c'))
    _eye(c, int(round(cx + 6.5 * u)), int(round(cy - 3 * u - attack * u)), glow)
    # đuôi
    c.poly([(cx - 5 * u, cy), (cx - 11 * u, cy + 3 * u), (cx - 9 * u, cy - 1 * u)], body[1])
    # chân/móng thõng
    c.line(cx + 1 * u, cy + 3 * u, cx + 2 * u + attack * 3 * u, cy + 6 * u, hexc('#e9b949'), 1)
    # cánh trước
    c.poly([(cx + 1 * u, cy - 2 * u), (cx - 3 * u, cy - 8 * u - flap * 6 * u), (cx - 10 * u, cy - 7 * u - flap * 7 * u),
            (cx - 4 * u, cy + 2 * u)], body[2])
    c.line(cx, cy - 2 * u, cx - 9 * u, cy - 7 * u - flap * 7 * u, body[3], 1)
    if mob == 'shock_drone_mk2' and (pose.get('glowpulse', 1.0) > 0.5 or attack > 0.3):
        c.line(cx - 2 * u, cy + 3 * u, cx + 1 * u, cy + 5 * u, glow, 1)
        c.line(cx + 1 * u, cy + 5 * u, cx - 1 * u, cy + 7 * u, glow, 1)
    if mob == 'magnet_drone':
        c.rect(cx - 2 * u, cy - 6 * u, cx + 2 * u, cy - 5 * u, hexc('#e03131'))
        c.rect(cx - 2 * u, cy - 7 * u, cx - 1 * u, cy - 5 * u, hexc('#adb5bd'))
        c.rect(cx + 1 * u, cy - 7 * u, cx + 2 * u, cy - 5 * u, hexc('#adb5bd'))
    c.outline()
    return c


# ---------------------------------------------------------------------------
# Pose timelines per clip
# ---------------------------------------------------------------------------

def _draw(mob, cw, ch, foot, pose):
    a = ARCHETYPE.get(mob, 'walker')
    if a == 'crawler':
        return crawler(cw, ch, foot, mob, pose)
    if a == 'crow':
        return crow(cw, ch, foot, mob, pose)
    return humanoid(cw, ch, foot, mob, a, pose)


def _pose_for(mob, clip, i, n):
    arche = ARCHETYPE.get(mob, 'walker')
    t = i / max(1, n)
    gp = 1.0 if (i % 2 == 0) else 0.3
    if clip in ('run', 'fuse_run'):
        g = t * math.pi * 2
        s = math.sin(g)
        # contact (chân dang rộng) → thân thấp; passing → thân cao
        if arche == 'runner':
            bob = 1 if abs(s) > 0.7 else -1
        elif arche in ('brute', 'bloater'):
            bob = 1 if abs(s) > 0.6 else 0
        else:
            bob = 1 if abs(s) > 0.7 else 0
        tilt = 1 if (arche == 'walker' and s > 0.3) else 0  # đầu ngoẹo theo bước khập khiễng
        jaw = 1 if i % 4 in (1, 2) else 0
        lean = 1.5 if arche == 'runner' else (0.6 if clip == 'fuse_run' else 0.0)
        return dict(gait=g, moving=True, bob=bob, tilt=tilt, jaw=jaw, lean=lean,
                    glowpulse=gp if clip == 'fuse_run' else 1.0, frame=i)
    if clip == 'idle':
        bobs = [0, 0, 1, 1, 1, 0]
        sway = math.sin(t * math.pi * 2)
        return dict(gait=0.3 * sway, moving=False, bob=bobs[i % 6], sway=sway, tilt=int(round(sway)),
                    jaw=1 if i in (2, 3) else 0, glowpulse=0.4 + 0.6 * (i % 3 != 2), frame=i)
    if clip == 'attack':
        W = [0.35, 0.75, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0]
        A = [0.0, 0.0, 0.0, 1.0, 1.0, 0.75, 0.45, 0.15]
        k = min(len(W) - 1, int(i * len(W) / max(1, n)))
        w, a = W[k], A[k]
        return dict(gait=0.6, moving=False, windup=w, attack=a, lean=a * 3 - w * 2,
                    bob=1 if a > 0.9 else 0, jaw=2 if a > 0.5 else 0, frame=i)
    if clip == 'lunge':
        bob = [2, 3, 0, -3, -1, 1][i % 6]
        lean = [-1, -2, 4, 6, 4, 1][i % 6]
        a = [0, 0, 0.6, 1, 0.8, 0.3][i % 6]
        w = [0.5, 1.0, 0, 0, 0, 0][i % 6]
        return dict(gait=1.2, moving=i in (2, 3, 4), bob=bob, lean=lean, attack=a, windup=w, jaw=2 if a > 0.5 else 0,
                    frame=i)
    if clip == 'slam':
        R = [0.2, 0.55, 0.9, 1.0, 0.3, 0.0, 0.0, 0.0]
        A = [0.0, 0.0, 0.0, 0.0, 0.6, 1.0, 0.6, 0.2]
        return dict(gait=0.4, moving=False, raise_=R[i % 8], attack=A[i % 8], lean=A[i % 8] * 3 - R[i % 8],
                    bob=[0, -1, -1, -2, 0, 2, 1, 0][i % 8], jaw=2 if A[i % 8] > 0.5 else 1, frame=i)
    if clip == 'spark':
        return dict(gait=0.0, moving=False, swell=0.15 + 0.2 * i, glowpulse=1.0 if i % 2 == 0 else 0.2,
                    jaw=1 + (i % 2), frame=i)
    return dict(gait=0.0, moving=False, frame=i)


def _spurt(c: Canvas, x, y, dirx, n, blood, seed):
    """Cung máu phun (giọt rời) — không viền để nhìn như chất lỏng."""
    for k in range(n):
        tt = (k + 1) / n
        px = x + dirx * tt * 9 + ((seed * 7 + k * 3) % 3 - 1)
        py = y - math.sin(tt * math.pi) * 5 + tt * 4
        c.set(px, py, blood[2] if k % 2 == 0 else blood[3])
        if k % 3 == 0:
            c.set(px + dirx, py + 1, blood[1])


def _fall_frame(base: Image.Image, deg: float, cw: int, ch: int, foot: int, center_t: float) -> Image.Image:
    """Xoay thân quanh gót chân trên canvas lớn rồi căn giữa dần (thân nằm không bị cắt khỏi cell)."""
    big = Image.new('RGBA', (cw * 3, ch * 3), (0, 0, 0, 0))
    big.alpha_composite(base, (cw, ch))
    rot = rotate_about(big, deg, cw + cw // 2, ch + foot)
    bbox = rot.getbbox()
    if not bbox:
        return base
    x0, y0, x1, y1 = bbox
    bw = x1 - x0
    # vị trí khi chỉ xoay quanh chân
    pivot_left = x0 - cw
    target_left = (cw - bw) // 2
    left = int(round(pivot_left + (target_left - pivot_left) * center_t))
    left = max(-2, min(cw - bw + 2, left))
    bottom = min(foot + 1, ch)
    crop = rot.crop(bbox)
    tmp = Image.new('RGBA', (cw + 8, ch + 8), (0, 0, 0, 0))
    tmp.alpha_composite(crop, (left + 4, max(0, bottom - (y1 - y0)) + 4))
    return tmp.crop((4, 4, 4 + cw, 4 + ch))


def _death_frames(mob, n, cw, ch, foot):
    arche = ARCHETYPE.get(mob, 'walker')
    blood = _blood(mob)
    frames = []
    cx = cw // 2
    if arche == 'bloater':
        # phình → nổ tung → xác + vũng máu loang
        for i in range(n):
            if i < 3:
                img = _draw(mob, cw, ch, foot, dict(swell=0.3 + 0.3 * i, glowpulse=1.0 if i % 2 == 0 else 0.3,
                                                     jaw=2, hurt=1, frame=i)).img
                frames.append(img)
                continue
            c = Canvas(cw, ch)
            k = i - 3
            # mảnh vụn bay + vòng bắn tung tóe
            rr = 4 + k * 3
            for j in range(14):
                a = j * math.pi * 2 / 14 + k * 0.3
                dist = rr * (0.6 + 0.4 * ((j * 5) % 3) / 2)
                px = cx + math.cos(a) * dist
                py = foot - 10 + math.sin(a) * dist * 0.6 + k * k * 0.6
                if py < foot:
                    c.set(px, py, blood[2] if j % 2 else blood[3])
                    if k < 2:
                        c.set(px + 1, py, blood[1])
            # chân còn lại + xương
            skin = ramp(ELEM[MOB_ELEM.get(mob, 'rot')][0])
            c.line(cx - 2, foot - 6, cx - 3, foot, skin[1], 3)
            c.line(cx + 2, foot - 5, cx + 3, foot, skin[1], 3)
            c.set(cx, foot - 7, BONE)
            c.set(cx + 1, foot - 8, BONE)
            pool = 3 + k * 2.5
            c.ellipse(cx + 1, foot, pool, 1.6 + k * 0.25, blood[1])
            c.ellipse(cx, foot - 0.5, pool * 0.6, 1.0, blood[2])
            if k == 0:
                c.ellipse(cx, foot - 10, 6, 5, (255, 255, 230, 255))  # chớp nổ
                c.ellipse(cx, foot - 10, 3, 3, hexc(ELEM[MOB_ELEM.get(mob, 'rot')][2]))
            frames.append(c.img)
        return frames
    # humanoid / crawler / crow: trúng đòn → loạng choạng → ngã
    recoil = [dict(lean=-2, hurt=1, jaw=2, windup=0.3), dict(lean=-3, bob=1, hurt=1, jaw=2, windup=0.6)]
    angles = [0, 0, 14, 38, 66, 86, 90, 90]
    if arche == 'crow':
        angles = [0, 25, 70, 120, 160, 180, 180, 180]
    if arche == 'crawler':
        angles = [0, 0, 0, 0, 0, 0, 0, 0]
    for i in range(n):
        k = min(len(angles) - 1, int(round(i * (len(angles) - 1) / max(1, n - 1))))
        pose = dict(recoil[min(1, i)], frame=i) if i < 2 else dict(hurt=1, jaw=1, frame=i)
        if arche == 'crawler':
            pose = dict(attack=0.4 if i in (1, 3) else 0.0, bob=(1 if i % 2 else 0), frame=i)
        if arche == 'crow':
            pose = dict(pose, noshadow=True, gait=i * 1.3)
        base = _draw(mob, cw, ch, foot, pose).img
        ang = angles[k]
        if arche == 'crow':
            # rơi xuống đất xoay vòng
            drop = min(1.0, i / max(1, n - 3)) * 16
            big = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
            big.alpha_composite(base, (0, 0))
            rot = rotate_about(big, -ang, cx, foot - 22)
            img = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
            img.alpha_composite(rot, (0, int(drop)) if drop < ch else (0, 0))
            img = img.crop((0, 0, cw, ch))
        elif arche == 'crawler':
            img = base
            if i >= 4:
                # thân xẹp xuống
                sq = base.resize((cw, max(1, int(ch * (1.0 - 0.08 * (i - 3))))), Image.NEAREST)
                img = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
                img.alpha_composite(sq, (0, ch - sq.height - (ch - foot - 1)))
        else:
            img = _fall_frame(base, ang, cw, ch, foot, min(1.0, ang / 90.0)) if ang > 0 else base
        c = Canvas(cw, ch)
        # vũng máu loang dưới thân (vẽ TRƯỚC thân)
        if arche == 'crow':
            sh_r = 5 * (cw / 48.0) * (0.6 + 0.4 * min(1.0, i / max(1, n - 3)))
            c.ellipse(cx, foot - 1, sh_r, 1.2, (20, 16, 28, 255))
        if i >= 3:
            pool = (i - 2) * cw * 0.065
            c.ellipse(cx - 3, foot - 0.5, pool + 3, 1.4 + (i - 3) * 0.35, blood[1])
            c.ellipse(cx - 4, foot - 1, pool * 0.6 + 1.5, 1.0, blood[2])
            if i >= 5:
                c.set(cx - 4 - pool * 0.4, foot - 1, blood[3])
        c.img.alpha_composite(img)
        # máu phun theo cung ở các frame đầu (từ ngực/cổ ra sau)
        if i < 5 and arche != 'crow':
            sy = foot - (ch * 0.55 if i < 2 else ch * 0.35 - i * 2)
            _spurt(c, cx - 1, sy, -1, 5 + i, blood, i)
            if i in (1, 2):
                _spurt(c, cx + 2, sy + 2, 1, 4, blood, i + 3)
        if arche == 'crow' and i >= 2:
            for j in range(3):  # lông rơi
                c.set(cx - 6 + j * 5, foot - 16 + (i * 3 + j * 5) % 14, hexc('#2b2b38'))
        frames.append(c.img)
    return frames


def build_clip(mob: str, clip: str, frames: int, cw: int, ch: int, foot: int):
    if clip == 'dead':
        imgs = _death_frames(mob, frames, cw, ch, foot)
    else:
        imgs = [_draw(mob, cw, ch, foot, _pose_for(mob, clip, i, frames)).img for i in range(frames)]
    out = strip(imgs, cw, ch)
    # alpha nhị phân (audit)
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            p = px[x, y]
            px[x, y] = (p[0], p[1], p[2], 255) if p[3] >= 128 else (0, 0, 0, 0)
    return out


def resolve_mob_clip(fname: str):
    stem = fname[:-4]
    for m in sorted(ARCHETYPE.keys(), key=len, reverse=True):
        if stem.startswith(m + '_'):
            return m, stem[len(m) + 1:]
    return None, None


def build_from_manifest(manifest: dict, enemy_dir: str, backup_dir: str | None = None):
    """Sinh lại mọi clip quái thường (không đụng boss, không đụng clip miragine_*).

    Trả về {fname: dict(mob, clip, frames, cellW, cellH, offX, offY, fps, loop, keys=[...])}.
    """
    import os
    import shutil

    done = {}
    for key, v in manifest['sprites'].items():
        if v.get('category') != 'enemy':
            continue
        fname = v['path'].split('/')[-1]
        if fname.startswith('miragine_'):
            continue
        mob, clip = resolve_mob_clip(fname)
        if not mob:
            continue
        if fname in done:
            done[fname]['keys'].append(key)
            continue
        cw, ch = int(v['cellW']), int(v['cellH'])
        frames = CLIP_FRAMES.get(clip, int(v['frames']))
        foot = -int(v['offY'])
        dst = os.path.join(enemy_dir, fname)
        if backup_dir and os.path.exists(dst):
            os.makedirs(backup_dir, exist_ok=True)
            bk = os.path.join(backup_dir, fname)
            if not os.path.exists(bk):
                shutil.copy2(dst, bk)
        img = build_clip(mob, clip, frames, cw, ch, foot)
        assert img.width == frames * cw and img.height == ch, fname
        img.save(dst)
        done[fname] = dict(mob=mob, clip=clip, frames=frames, cellW=cw, cellH=ch, offX=int(v['offX']),
                           offY=int(v['offY']), fps=float(CLIP_FPS.get(clip, v.get('fps', 10))),
                           loop=clip in ('idle', 'run', 'fuse_run', 'spark'),
                           path=v['path'], keys=[key])
    return done
