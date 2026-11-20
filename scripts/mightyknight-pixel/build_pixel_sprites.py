#!/usr/bin/env python3
"""
Mighty Knight 2.5D Pixel — 1:1 Character Master Strip & Portrait Generator.

Strictly enforces 10 <= frames <= 15 per character (1 single horizontal PNG per entity):
- 6 Heroes:   15 frames @ 48x48 -> 720x48  (anchor 24,44)
- 6 Regular:  11 frames @ 48x48 -> 528x48  (anchor 24,44)
- 2 Elites:   12 frames @ 48x48 -> 576x48  (anchor 24,44)
- 4 Bosses:   15 frames @ 80x80 -> 1200x80 (anchor 40,74)
- 6 Portraits: 32x32 crisp pixel art
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple
from PIL import Image

from palette import OUTLINE, PAL, RGBA, TRANSP, PixelCanvas, rot, tint_ramp

ROOT = Path(__file__).resolve().parents[2]
DB_DIR = ROOT / "database-mighty-knight-pixel"

HERO_FRAMES = 15
REGULAR_FRAMES = 11
ELITE_FRAMES = 12
BOSS_FRAMES = 15


@dataclass
class HeroTheme:
    id: str
    armor: Tuple[RGBA, RGBA, RGBA]
    cape: Tuple[RGBA, RGBA, RGBA]
    trim: RGBA
    weapon: Tuple[RGBA, RGBA, RGBA]
    glow: RGBA
    head_style: str  # helm | hood | cowl | horns | wizard | dragon
    weapon_kind: str  # sword | bow | daggers | axe | staff | lance


HERO_THEMES: List[HeroTheme] = [
    HeroTheme("knight", tint_ramp(PAL["blue"]), tint_ramp(PAL["red"]), PAL["gold"], tint_ramp(PAL["silver"]), PAL["gold_hi"], "helm", "sword"),
    HeroTheme("archer", tint_ramp(PAL["green"]), tint_ramp(PAL["wood"]), PAL["gold"], tint_ramp(PAL["wood_lt"]), PAL["cyan_hi"], "hood", "bow"),
    HeroTheme("rogue", tint_ramp(PAL["slate_dk"]), tint_ramp(PAL["gold"]), PAL["purple_hi"], tint_ramp(PAL["silver"]), PAL["purple_hi"], "cowl", "daggers"),
    HeroTheme("barbarian", tint_ramp(PAL["red"]), tint_ramp(PAL["wood_dk"]), PAL["gold"], tint_ramp(PAL["red_hi"]), PAL["orange"], "horns", "axe"),
    HeroTheme("mage", tint_ramp(PAL["purple"]), tint_ramp(PAL["purple_dk"]), PAL["gold"], tint_ramp(PAL["wood"]), PAL["orange"], "wizard", "staff"),
    HeroTheme("lancer", tint_ramp(PAL["cyan"]), tint_ramp(PAL["blue_dk"]), PAL["silver"], tint_ramp(PAL["cyan_hi"]), PAL["cyan_hi"], "dragon", "lance"),
]

# Pose kinematics for Hero frames 0..14
# (body_dx, body_dy, leg_l_dx, leg_r_dx, arm_deg, weapon_deg, cape_lift, down_mode, glow_on, shield_front)
HERO_POSES: Dict[int, Tuple[int, int, int, int, float, float, int, bool, bool, bool]] = {
    0:  (0,  0, -3,  3,   10,  -25,  0, False, False, False),  # IDLE_1
    1:  (0,  1, -3,  3,   14,  -18,  1, False, False, False),  # IDLE_2
    2:  (1, -1, -6,  5,  -12,  -30,  2, False, False, False),  # WALK_1
    3:  (0,  0, -1,  1,    8,  -22,  1, False, False, False),  # WALK_2
    4:  (1, -1,  5, -5,   22,  -10,  2, False, False, False),  # WALK_3
    5:  (-2, 3, -5,  4, -125, -135,  3, False, True,  False),  # WINDUP (coiled)
    6:  (3,  1, -6,  6,   15,    8,  4, False, True,  False),  # STRIKE_1 (horizontal cleave)
    7:  (2, -1, -4,  6,  -52,  -68,  4, False, True,  False),  # STRIKE_2 (rising slash)
    8:  (4,  2, -7,  7,   42,   48,  5, False, True,  False),  # STRIKE_3 (heavy slam)
    9:  (0, -2, -3,  3,  -95,  -92,  5, False, True,  False),  # CAST_HOLD (weapon raised)
    10: (1, -6, -4,  4,  -35,  -45,  6, False, True,  False),  # AIR_SPIN (airborne tuck)
    11: (5,  2, -8,  4,   22,    2,  6, False, True,  False),  # DASH_THRUST (speed lunge)
    12: (-1, 1, -4,  4,  -10,  -75,  1, False, True,  True),   # GUARD_PARRY (shield braced)
    13: (-4, 1, -5,  2,  -45,  -60,  3, False, False, False),  # HIT_STUN (recoil)
    14: (0,  9, -5,  5,   60,   80,  0, True,  False, False),  # DOWN_DEAD (kneeling/fallen)
}


def draw_weapon(
    c: PixelCanvas,
    hx: float,
    hy: float,
    deg: float,
    theme: HeroTheme,
    glow_on: bool,
    frame: int,
) -> None:
    whi, wmid, wsh = theme.weapon
    tip_x, tip_y = rot(hx + 16, hy, hx, hy, deg)
    mid_x, mid_y = rot(hx + 8, hy, hx, hy, deg)
    hilt_x, hilt_y = rot(hx - 3, hy, hx, hy, deg)

    if theme.weapon_kind == "sword":
        c.line(hilt_x, hilt_y, hx + 1, hy, PAL["wood"], 1)
        g1 = rot(hx + 2, hy - 3, hx, hy, deg)
        g2 = rot(hx + 2, hy + 3, hx, hy, deg)
        c.line(g1[0], g1[1], g2[0], g2[1], theme.trim, 1)
        c.line(hx + 2, hy, tip_x, tip_y, wmid, 2)
        c.line(hx + 3, hy - 1, tip_x, tip_y, whi, 1)
        if glow_on and frame in (6, 7, 8):
            c.line(mid_x, mid_y - 2, tip_x + 2, tip_y, theme.glow, 1)

    elif theme.weapon_kind == "bow":
        top = rot(hx + 5, hy - 8, hx, hy, deg * 0.4)
        bot = rot(hx + 5, hy + 8, hx, hy, deg * 0.4)
        arc = rot(hx + 10, hy, hx, hy, deg * 0.4)
        c.line(top[0], top[1], arc[0], arc[1], PAL["wood_lt"], 1)
        c.line(arc[0], arc[1], bot[0], bot[1], PAL["wood"], 1)
        c.line(top[0], top[1], bot[0], bot[1], PAL["silver"], 1)
        if glow_on or frame in (5, 6, 7, 8, 9):
            c.line(hx + 1, hy, hx + 14, hy - (3 if frame == 9 else 0), theme.glow if glow_on else PAL["gold"], 1)

    elif theme.weapon_kind == "daggers":
        t1 = rot(hx + 11, hy, hx, hy, deg)
        c.line(hx, hy, t1[0], t1[1], whi, 1)
        c.line(hx, hy + 1, t1[0], t1[1] + 1, wsh, 1)
        if glow_on:
            c.put(int(t1[0]), int(t1[1]), theme.glow)
        # Off-hand dagger
        ox, oy = hx - 9, hy + 1
        t2 = rot(ox + 9, oy, ox, oy, -deg * 0.65)
        c.line(ox, oy, t2[0], t2[1], theme.glow if glow_on else whi, 1)

    elif theme.weapon_kind == "axe":
        t1 = rot(hx + 15, hy, hx, hy, deg)
        c.line(hilt_x, hilt_y, t1[0], t1[1], PAL["wood_lt"], 1)
        head_c = rot(hx + 12, hy, hx, hy, deg)
        b1 = rot(hx + 11, hy - 5, hx, hy, deg)
        b2 = rot(hx + 16, hy - 4, hx, hy, deg)
        b3 = rot(hx + 16, hy + 4, hx, hy, deg)
        b4 = rot(hx + 11, hy + 5, hx, hy, deg)
        c.poly([head_c, b1, b2, b3, b4], wmid)
        c.line(b2[0], b2[1], b3[0], b3[1], theme.glow if glow_on else PAL["gold_hi"], 1)

    elif theme.weapon_kind == "staff":
        t1 = rot(hx + 16, hy, hx, hy, deg)
        c.line(hilt_x, hilt_y, t1[0], t1[1], PAL["wood_lt"], 1)
        c.ellipse(t1[0], t1[1], 3, 3, PAL["purple_hi"] if not glow_on else theme.glow)
        c.put(int(t1[0]) - 1, int(t1[1]) - 1, PAL["white"])

    elif theme.weapon_kind == "lance":
        t1 = rot(hx + 20, hy, hx, hy, deg)
        c.line(hilt_x - 2, hilt_y, t1[0], t1[1], PAL["slate_lt"], 1)
        tip2 = rot(hx + 22, hy, hx, hy, deg)
        l1 = rot(hx + 15, hy - 3, hx, hy, deg)
        l2 = rot(hx + 15, hy + 3, hx, hy, deg)
        c.poly([tip2, l1, l2], wmid)
        c.line(l1[0], l1[1], tip2[0], tip2[1], theme.glow if glow_on else PAL["white"], 1)


def draw_hero_frame(theme: HeroTheme, frame: int) -> Image.Image:
    c = PixelCanvas(48, 48)
    bdx, bdy, ldx, rdx, arm_deg, wep_deg, cape_lift, down_mode, glow_on, shield_front = HERO_POSES[frame]

    cx = 24 + bdx
    foot_y = 43
    if down_mode:
        # Crisp kneeling/fallen hero pose (no blurry 90-deg rotation!)
        c.shaded_ellipse(cx - 2, foot_y - 3, 9, 4, theme.cape)
        c.shaded_rect(cx - 6, foot_y - 9, 12, 6, theme.armor)
        c.shaded_ellipse(cx + 3, foot_y - 11, 5, 5, theme.armor if theme.head_style in ("helm", "dragon") else tint_ramp(PAL["skin"]))
        c.put(cx + 5, foot_y - 11, PAL["ink"])
        draw_weapon(c, cx + 6, foot_y - 4, 15, theme, False, frame)
        c.add_outline(OUTLINE)
        c.enforce_binary_alpha()
        return c.img

    torso_y = 28 + bdy
    head_y = 17 + bdy

    # Billowing pixel cape behind hero
    cape_pts = [
        (cx - 4, torso_y - 2),
        (cx - 10 - cape_lift, torso_y + 8 - (cape_lift // 2)),
        (cx - 3 - (cape_lift // 2), torso_y + 11),
        (cx + 2, torso_y + 3),
    ]
    c.poly(cape_pts, theme.cape[2])
    c.line(cx - 4, torso_y - 2, cx - 9 - cape_lift, torso_y + 7 - (cape_lift // 2), theme.cape[1], 1)

    # Legs & boots
    hip_y = torso_y + 6
    if frame == 10:  # Airborne tucked legs
        c.shaded_rect(cx - 5, hip_y, 4, 5, theme.armor)
        c.shaded_rect(cx + 1, hip_y - 1, 4, 5, theme.armor)
    else:
        c.line(cx - 2, hip_y, cx + ldx, foot_y - 2, PAL["slate_dk"], 2)
        c.line(cx + 2, hip_y, cx + rdx, foot_y - 2, PAL["slate_dk"], 2)
        c.rect(cx + ldx - 2, foot_y - 3, 5, 3, PAL["wood_dk"])
        c.rect(cx + rdx - 1, foot_y - 3, 5, 3, PAL["wood"])

    # Armored torso + belt + trim
    c.shaded_rect(cx - 5, torso_y - 4, 10, 11, theme.armor)
    c.rect(cx - 5, torso_y + 3, 10, 2, PAL["wood_dk"])
    c.rect(cx - 1, torso_y + 3, 3, 2, theme.trim)
    # Pauldron shoulder
    c.shaded_ellipse(cx - 5, torso_y - 2, 3, 3, theme.armor)
    c.put(cx - 6, torso_y - 3, theme.trim)

    # Head & iconic class headgear
    if theme.head_style == "helm":
        c.shaded_ellipse(cx, head_y, 6, 6, theme.armor)
        c.rect(cx - 1, head_y - 2, 6, 3, PAL["void"])
        c.rect(cx + 1, head_y - 1, 3, 1, PAL["cyan_hi"] if glow_on else PAL["white"])
        # Heroic plume
        c.poly([(cx - 2, head_y - 6), (cx - 8 - cape_lift // 2, head_y - 9), (cx + 1, head_y - 9), (cx + 2, head_y - 5)], theme.cape[1])
    elif theme.head_style == "hood":
        c.shaded_ellipse(cx, head_y, 6, 6, theme.armor)
        c.rect(cx - 1, head_y - 2, 5, 5, PAL["skin"])
        c.put(cx + 2, head_y - 1, PAL["ink"])
        c.poly([(cx - 4, head_y - 5), (cx - 9, head_y - 2), (cx - 4, head_y + 1)], theme.armor[2])
        c.line(cx + 1, head_y - 6, cx - 3, head_y - 11, PAL["red_hi"], 1)
    elif theme.head_style == "cowl":
        c.shaded_ellipse(cx, head_y, 6, 5, tint_ramp(PAL["slate_dk"]))
        c.rect(cx - 1, head_y - 2, 5, 3, PAL["skin"])
        c.put(cx + 2, head_y - 1, PAL["gold_hi"] if glow_on else PAL["white"])
        # Flowing golden scarf
        c.rect(cx - 5, head_y + 2, 10, 3, PAL["gold"])
        c.line(cx - 5, head_y + 3, cx - 10 - cape_lift, head_y + 5, PAL["gold_hi"], 1)
    elif theme.head_style == "horns":
        c.shaded_ellipse(cx, head_y, 6, 6, tint_ramp(PAL["skin"]))
        c.rect(cx - 5, head_y - 6, 10, 4, PAL["slate"])
        c.line(cx - 5, head_y - 4, cx - 9, head_y - 9, PAL["bone_hi"], 1)
        c.line(cx + 5, head_y - 4, cx + 9, head_y - 9, PAL["bone_hi"], 1)
        c.put(cx + 2, head_y - 1, PAL["red_hi"] if glow_on else PAL["ink"])
        c.rect(cx - 2, head_y + 2, 6, 3, PAL["wood"])  # beard
    elif theme.head_style == "wizard":
        c.shaded_ellipse(cx, head_y + 1, 5, 5, tint_ramp(PAL["skin"]))
        c.rect(cx - 2, head_y + 3, 6, 4, PAL["silver"])  # beard
        c.put(cx + 2, head_y, PAL["orange"] if glow_on else PAL["cyan_hi"])
        # Pointed hat
        c.rect(cx - 8, head_y - 4, 16, 2, theme.armor[1])
        c.poly([(cx - 5, head_y - 4), (cx - 1, head_y - 14), (cx + 5, head_y - 4)], theme.armor[1])
        c.rect(cx - 5, head_y - 5, 10, 1, theme.trim)
    elif theme.head_style == "dragon":
        c.shaded_ellipse(cx, head_y, 6, 6, theme.armor)
        c.rect(cx, head_y - 2, 5, 3, PAL["void"])
        c.put(cx + 3, head_y - 1, PAL["cyan_hi"])
        # Dragon crest wings
        c.poly([(cx - 4, head_y - 3), (cx - 10, head_y - 9), (cx - 2, head_y - 6)], PAL["silver"])
        c.poly([(cx + 1, head_y - 5), (cx + 5, head_y - 10), (cx + 4, head_y - 4)], PAL["cyan_hi"])

    # Weapon hand + weapon
    sh_x, sh_y = cx + 4, torso_y - 1
    hand_x, hand_y = rot(sh_x + 5, sh_y, sh_x, sh_y, arm_deg)
    c.line(sh_x, sh_y, hand_x, hand_y, theme.armor[0], 2)
    draw_weapon(c, hand_x, hand_y, wep_deg, theme, glow_on, frame)

    # Shield overlay for Knight or GUARD_PARRY pose (frame 12)
    if theme.id == "knight" or shield_front:
        sx = cx + (6 if shield_front else -1)
        sy = torso_y + (0 if shield_front else 2)
        c.shaded_rect(sx - 3, sy - 5, 7, 10, tint_ramp(PAL["gold"] if shield_front else PAL["blue"]))
        c.rect(sx - 1, sy - 3, 3, 6, PAL["gold_hi"] if shield_front else PAL["silver"])
        if shield_front:
            c.line(sx + 5, sy - 6, sx + 5, sy + 6, PAL["gold_hi"], 1)

    # Hit flash glint on frame 13
    if frame == 13:
        c.put(cx + 6, head_y - 4, PAL["white"])
        c.put(cx + 8, head_y - 2, PAL["gold_hi"])

    c.add_outline(OUTLINE)
    c.enforce_binary_alpha()
    return c.img


def draw_hero_portrait(theme: HeroTheme) -> Image.Image:
    c = PixelCanvas(32, 32)
    # Dark fantasy framed backdrop
    c.rect(0, 0, 32, 32, PAL["void"])
    c.rect(1, 1, 30, 30, theme.armor[2], dither=PAL["void"])
    # Bust
    c.shaded_rect(7, 22, 18, 9, theme.armor)
    c.rect(12, 23, 8, 3, theme.trim)
    # Head
    if theme.head_style in ("helm", "dragon"):
        c.shaded_ellipse(16, 14, 8, 8, theme.armor)
        c.rect(11, 12, 11, 4, PAL["void"])
        c.rect(13, 13, 2, 2, theme.glow)
        c.rect(18, 13, 2, 2, theme.glow)
        if theme.head_style == "helm":
            c.poly([(13, 6), (8, 2), (20, 3), (18, 7)], theme.cape[1])
        else:
            c.poly([(8, 11), (3, 4), (11, 8)], PAL["silver"])
            c.poly([(24, 11), (29, 4), (21, 8)], PAL["cyan_hi"])
    elif theme.head_style == "hood":
        c.shaded_ellipse(16, 14, 9, 9, theme.armor)
        c.shaded_ellipse(16, 15, 6, 6, tint_ramp(PAL["skin"]))
        c.put(13, 14, PAL["ink"])
        c.put(19, 14, PAL["ink"])
        c.line(21, 6, 26, 2, PAL["red_hi"], 2)
    elif theme.head_style == "cowl":
        c.shaded_ellipse(16, 14, 8, 8, tint_ramp(PAL["slate_dk"]))
        c.rect(10, 12, 12, 4, PAL["skin"])
        c.rect(12, 13, 2, 2, PAL["gold_hi"])
        c.rect(18, 13, 2, 2, PAL["gold_hi"])
        c.rect(8, 18, 16, 4, PAL["gold"])
    elif theme.head_style == "horns":
        c.shaded_ellipse(16, 15, 8, 8, tint_ramp(PAL["skin"]))
        c.rect(9, 7, 14, 5, PAL["slate"])
        c.line(9, 9, 4, 3, PAL["bone_hi"], 2)
        c.line(23, 9, 28, 3, PAL["bone_hi"], 2)
        c.rect(12, 13, 2, 2, PAL["red_hi"])
        c.rect(18, 13, 2, 2, PAL["red_hi"])
        c.rect(11, 19, 10, 4, PAL["wood"])
    elif theme.head_style == "wizard":
        c.shaded_ellipse(16, 17, 7, 6, tint_ramp(PAL["skin"]))
        c.rect(11, 20, 10, 5, PAL["silver"])
        c.rect(13, 15, 2, 2, PAL["orange"])
        c.rect(18, 15, 2, 2, PAL["orange"])
        c.rect(5, 11, 22, 3, theme.armor[1])
        c.poly([(9, 11), (16, 2), (23, 11)], theme.armor[1])
        c.rect(9, 10, 14, 1, theme.trim)
    # Crisp pixel border
    c.rect(0, 0, 32, 1, theme.trim)
    c.rect(0, 31, 32, 1, theme.trim)
    c.rect(0, 0, 1, 32, theme.trim)
    c.rect(31, 0, 1, 32, theme.trim)
    c.enforce_binary_alpha()
    return c.img


@dataclass
class EnemyTheme:
    id: str
    frames: int
    body: Tuple[RGBA, RGBA, RGBA]
    head: Tuple[RGBA, RGBA, RGBA]
    accent: RGBA
    eye: RGBA
    style: str  # imp | goblin | shield_orc | brute | shaman | frost_archer | bomber | ghost


ENEMY_THEMES: List[EnemyTheme] = [
    EnemyTheme("skull_imp", REGULAR_FRAMES, tint_ramp(PAL["purple_dk"]), tint_ramp(PAL["bone"]), PAL["purple_hi"], PAL["gold_hi"], "imp"),
    EnemyTheme("goblin_raider", REGULAR_FRAMES, tint_ramp(PAL["green"]), tint_ramp(PAL["green_hi"]), PAL["wood_lt"], PAL["red_hi"], "goblin"),
    EnemyTheme("shield_orc", REGULAR_FRAMES, tint_ramp(PAL["green_dk"]), tint_ramp(PAL["slate"]), PAL["silver"], PAL["orange"], "shield_orc"),
    EnemyTheme("bone_brute", REGULAR_FRAMES, tint_ramp(PAL["bone"]), tint_ramp(PAL["bone_hi"]), PAL["wood"], PAL["red_hi"], "brute"),
    EnemyTheme("tribal_shaman", ELITE_FRAMES, tint_ramp(PAL["red_dk"]), tint_ramp(PAL["red"]), PAL["gold"], PAL["cyan_hi"], "shaman"),
    EnemyTheme("frost_archer", ELITE_FRAMES, tint_ramp(PAL["cyan_dk"]), tint_ramp(PAL["bone"]), PAL["cyan_hi"], PAL["cyan_hi"], "frost_archer"),
    EnemyTheme("bomber_imp", REGULAR_FRAMES, tint_ramp(PAL["red_dk"]), tint_ramp(PAL["orange"]), PAL["gold_hi"], PAL["gold_hi"], "bomber"),
    EnemyTheme("nether_ghost", REGULAR_FRAMES, tint_ramp(PAL["cyan"]), tint_ramp(PAL["gold"]), PAL["gold_hi"], PAL["white"], "ghost"),
]


def draw_enemy_frame(theme: EnemyTheme, frame: int) -> Image.Image:
    c = PixelCanvas(48, 48)
    # 0-1 idle, 2-4 walk, 5 windup, 6-7 attack, 8 hit, 9-10 dead, 11 special_cast
    cx, foot_y = 24, 43
    dy = 1 if frame == 1 else (-1 if frame in (2, 4) else (2 if frame == 5 else 0))
    dx = 3 if frame in (6, 7) else (-4 if frame == 8 else 0)
    cx += dx

    if frame in (9, 10):  # DEAD_1 / DEAD_2
        squash = 2 if frame == 10 else 5
        c.shaded_ellipse(cx, foot_y - squash, 10 if frame == 10 else 8, squash, theme.body)
        c.shaded_ellipse(cx + 4, foot_y - squash - 2, 4, 3, theme.head)
        c.add_outline(OUTLINE)
        c.enforce_binary_alpha()
        return c.img

    scale_big = 1.25 if theme.style == "brute" else (1.12 if theme.style == "shield_orc" else 1.0)
    torso_y = int(29 + dy - (3 if scale_big > 1.15 else 0))
    head_y = int(19 + dy - (4 if scale_big > 1.15 else 0))

    if theme.style == "ghost":
        bob = int(math.sin(frame * 0.9) * 2)
        c.shaded_ellipse(cx, torso_y - 3 + bob, 9, 11, theme.body)
        c.poly([(cx - 9, torso_y + 4 + bob), (cx - 6, torso_y + 11 + bob), (cx, torso_y + 7 + bob), (cx + 6, torso_y + 11 + bob), (cx + 9, torso_y + 4 + bob)], theme.body[2])
        # Treasure crown & gold pouch
        c.rect(cx - 5, head_y - 5 + bob, 10, 4, PAL["gold"])
        c.put(cx - 4, head_y - 6 + bob, PAL["gold_hi"])
        c.put(cx, head_y - 7 + bob, PAL["gold_hi"])
        c.put(cx + 4, head_y - 6 + bob, PAL["gold_hi"])
        c.rect(cx + 1, head_y + bob, 2, 2, theme.eye)
        c.rect(cx + 5, head_y + bob, 2, 2, theme.eye)
        c.add_outline(OUTLINE)
        c.enforce_binary_alpha()
        return c.img

    # Legs
    step = -4 if frame == 2 else (4 if frame == 4 else 0)
    c.line(cx - 3, torso_y + 5, cx - 3 + step, foot_y - 1, theme.body[2], 2)
    c.line(cx + 3, torso_y + 5, cx + 3 - step, foot_y - 1, theme.body[2], 2)

    # Torso
    tw, th = int(10 * scale_big), int(10 * scale_big)
    c.shaded_rect(cx - tw // 2, torso_y - th // 2, tw, th, theme.body)
    # Head
    hr = int(5 * scale_big)
    c.shaded_ellipse(cx, head_y, hr + 1, hr, theme.head)
    c.rect(cx + 1, head_y - 1, 2, 2, PAL["red_hi"] if frame == 5 else theme.eye)

    # Archetype details & weapon
    wdeg = -115 if frame == 5 else (20 if frame == 6 else (-40 if frame == 7 else (-90 if frame == 11 else -20)))
    hx, hy = cx + 5, torso_y
    tx, ty = rot(hx + 12, hy, hx, hy, wdeg)

    if theme.style == "imp":
        c.line(cx - 4, head_y - 4, cx - 7, head_y - 8, PAL["purple_hi"], 1)
        c.line(cx + 3, head_y - 4, cx + 6, head_y - 8, PAL["purple_hi"], 1)
        c.line(hx, hy, tx, ty, PAL["silver"], 1)
    elif theme.style == "goblin":
        c.poly([(cx - 4, head_y - 4), (cx - 10, head_y - 6), (cx - 4, head_y)], theme.head[1])
        c.line(hx, hy, tx, ty, PAL["silver"], 2)
    elif theme.style == "shield_orc":
        # Heavy front iron tower shield
        c.shaded_rect(cx + 3, torso_y - 7, 7, 15, tint_ramp(PAL["slate_lt"]))
        c.rect(cx + 5, torso_y - 4, 3, 9, PAL["gold"])
        c.line(hx - 2, hy - 3, tx, ty - 2, PAL["silver"], 2)
    elif theme.style == "brute":
        # Giant bone club
        c.line(hx, hy, tx, ty, PAL["wood_lt"], 3)
        c.ellipse(tx, ty, 4, 4, PAL["bone_hi"])
    elif theme.style == "shaman":
        # Feathered red mask + hex staff
        c.line(cx - 3, head_y - 5, cx - 6, head_y - 11, PAL["gold"], 1)
        c.line(cx, head_y - 5, cx, head_y - 12, PAL["red_hi"], 1)
        c.line(cx + 3, head_y - 5, cx + 6, head_y - 11, PAL["gold"], 1)
        c.line(hx, hy + 4, tx, ty - 4, PAL["wood"], 1)
        c.ellipse(tx, ty - 4, 3, 3, PAL["cyan_hi"] if frame == 11 else PAL["red_hi"])
    elif theme.style == "frost_archer":
        c.poly([(cx - 5, head_y - 5), (cx + 2, head_y - 9), (cx + 5, head_y - 3)], PAL["cyan"])
        c.line(hx + 3, hy - 7, hx + 7, hy, PAL["cyan_hi"], 1)
        c.line(hx + 7, hy, hx + 3, hy + 7, PAL["cyan_hi"], 1)
        c.line(hx + 3, hy - 7, hx + 3, hy + 7, PAL["white"], 1)
        if frame in (5, 6, 11):
            c.line(hx + 2, hy, hx + 13, hy, PAL["cyan_hi"], 1)
    elif theme.style == "bomber":
        # Glowing bomb held overhead
        by = head_y - 8 + (1 if frame % 2 else 0)
        c.shaded_ellipse(cx + 1, by, 5, 5, tint_ramp(PAL["slate_dk"]))
        c.put(cx + 3, by - 5, PAL["gold_hi"] if frame in (5, 6, 7) else PAL["orange"])
        c.put(cx + 4, by - 6, PAL["red_hi"])

    c.add_outline(OUTLINE)
    c.enforce_binary_alpha()
    return c.img


@dataclass
class BossTheme:
    id: str
    body: Tuple[RGBA, RGBA, RGBA]
    armor: Tuple[RGBA, RGBA, RGBA]
    accent: RGBA
    glow: RGBA
    style: str  # shaman | chieftain | golem | abyss


BOSS_THEMES: List[BossTheme] = [
    BossTheme("boss_elder_shaman", tint_ramp(PAL["red_dk"]), tint_ramp(PAL["gold"]), PAL["red_hi"], PAL["cyan_hi"], "shaman"),
    BossTheme("boss_war_chieftain", tint_ramp(PAL["green_dk"]), tint_ramp(PAL["red"]), PAL["gold"], PAL["orange"], "chieftain"),
    BossTheme("boss_lava_golem", tint_ramp(PAL["slate_dk"]), tint_ramp(PAL["orange"]), PAL["red_hi"], PAL["gold_hi"], "golem"),
    BossTheme("boss_abyss_lord", tint_ramp(PAL["void"]), tint_ramp(PAL["purple"]), PAL["purple_hi"], PAL["cyan_hi"], "abyss"),
]


def draw_boss_frame(theme: BossTheme, frame: int) -> Image.Image:
    c = PixelCanvas(80, 80)
    cx, foot_y = 40, 73
    # 0-1 idle, 2-4 walk, 5 telegraph, 6-7 atk, 8 slam, 9 cast, 10 charge, 11 enrage, 12 stagger, 13-14 defeat
    if frame in (13, 14):
        h = 9 if frame == 13 else 5
        c.shaded_ellipse(cx, foot_y - h, 20 if frame == 14 else 16, h, theme.body)
        c.shaded_ellipse(cx + 8, foot_y - h - 4, 8, 6, theme.armor)
        c.add_outline(OUTLINE)
        c.enforce_binary_alpha()
        return c.img

    dy = 2 if frame == 1 else (-2 if frame in (2, 4) else (-5 if frame == 11 else (3 if frame == 8 else 0)))
    dx = 6 if frame in (6, 7, 10) else (-6 if frame == 12 else 0)
    cx += dx
    torso_y = 46 + dy
    head_y = 26 + dy
    glow_on = frame in (5, 8, 9, 10, 11)

    # Back cape / magma spikes / abyss wings
    if theme.style == "abyss":
        spread = 8 if glow_on else 0
        c.poly([(cx - 8, torso_y - 6), (cx - 28 - spread, torso_y - 20), (cx - 22, torso_y + 6)], theme.armor[2])
        c.poly([(cx + 6, torso_y - 6), (cx + 24 + spread, torso_y - 18), (cx + 18, torso_y + 4)], theme.armor[2])
    elif theme.style == "golem":
        c.poly([(cx - 14, torso_y - 12), (cx - 20, torso_y - 24), (cx - 6, torso_y - 14)], theme.armor[1])
        c.poly([(cx + 8, torso_y - 12), (cx + 16, torso_y - 24), (cx + 16, torso_y - 10)], theme.armor[1])

    # Massive legs
    step = -6 if frame == 2 else (6 if frame == 4 else 0)
    c.shaded_rect(cx - 12 + step, torso_y + 10, 9, 16, theme.body)
    c.shaded_rect(cx + 3 - step, torso_y + 10, 9, 16, theme.body)

    # Colossal torso + pauldrons
    c.shaded_rect(cx - 16, torso_y - 14, 32, 26, theme.body)
    c.shaded_rect(cx - 13, torso_y - 8, 26, 12, theme.armor)
    c.shaded_ellipse(cx - 16, torso_y - 10, 7, 7, theme.armor)
    c.shaded_ellipse(cx + 15, torso_y - 10, 7, 7, theme.armor)

    # Glowing core / lava fissures
    if glow_on or theme.style == "golem":
        c.rect(cx - 4, torso_y - 5, 8, 6, theme.glow)

    # Boss Head / Crown / Skull Mask
    c.shaded_ellipse(cx, head_y, 11, 10, theme.body if theme.style != "shaman" else tint_ramp(PAL["bone"]))
    c.rect(cx - 4, head_y - 2, 4, 3, theme.glow if glow_on else PAL["red_hi"])
    c.rect(cx + 3, head_y - 2, 4, 3, theme.glow if glow_on else PAL["red_hi"])

    if theme.style == "shaman":
        for ox in (-9, -4, 0, 4, 9):
            c.line(cx + ox, head_y - 9, cx + ox * 1.4, head_y - 19, theme.accent if ox % 2 else PAL["gold"], 2)
    elif theme.style == "chieftain":
        c.line(cx - 9, head_y - 5, cx - 18, head_y - 16, PAL["bone_hi"], 2)
        c.line(cx + 9, head_y - 5, cx + 18, head_y - 16, PAL["bone_hi"], 2)
    elif theme.style == "abyss":
        c.poly([(cx - 8, head_y - 8), (cx - 11, head_y - 19), (cx - 2, head_y - 10)], PAL["purple_hi"])
        c.poly([(cx + 8, head_y - 8), (cx + 11, head_y - 19), (cx + 2, head_y - 10)], PAL["purple_hi"])
        c.poly([(cx - 3, head_y - 9), (cx, head_y - 21), (cx + 3, head_y - 9)], PAL["gold_hi"])

    # Boss Weapon
    wdeg = (
        -125 if frame == 5 else
        12 if frame == 6 else
        -45 if frame == 7 else
        55 if frame == 8 else
        -95 if frame in (9, 11) else
        0 if frame == 10 else
        -25
    )
    hx, hy = cx + 14, torso_y - 2
    tip = rot(hx + 22, hy, hx, hy, wdeg)
    c.line(hx - 4, hy, tip[0], tip[1], PAL["wood_lt"] if theme.style != "abyss" else PAL["purple_hi"], 3)
    if theme.style == "chieftain":
        b1 = rot(hx + 16, hy - 9, hx, hy, wdeg)
        b2 = rot(hx + 24, hy - 7, hx, hy, wdeg)
        b3 = rot(hx + 24, hy + 7, hx, hy, wdeg)
        b4 = rot(hx + 16, hy + 9, hx, hy, wdeg)
        c.poly([b1, b2, b3, b4], PAL["silver"])
        c.line(b2[0], b2[1], b3[0], b3[1], theme.glow if glow_on else PAL["red_hi"], 2)
    elif theme.style == "shaman":
        c.ellipse(tip[0], tip[1], 6, 6, theme.glow if glow_on else PAL["red_hi"])
        c.ellipse(tip[0], tip[1], 3, 3, PAL["white"])
    elif theme.style == "golem":
        c.shaded_ellipse(tip[0], tip[1], 7, 7, tint_ramp(PAL["orange"]))
    elif theme.style == "abyss":
        tip2 = rot(hx + 26, hy, hx, hy, wdeg)
        c.line(hx, hy, tip2[0], tip2[1], PAL["purple_hi"], 4)
        c.line(hx + 2, hy, tip2[0], tip2[1], PAL["white"], 1)

    if frame == 11:  # Enrage roar aura pixels
        for a in range(0, 360, 45):
            rx, ry = rot(cx + 26, torso_y - 4, cx, torso_y - 4, a)
            c.rect(int(rx) - 1, int(ry) - 1, 2, 2, theme.glow)

    c.add_outline(OUTLINE)
    c.enforce_binary_alpha()
    return c.img


def build_all() -> None:
    (DB_DIR / "sprites" / "heroes").mkdir(parents=True, exist_ok=True)
    (DB_DIR / "sprites" / "enemies").mkdir(parents=True, exist_ok=True)
    (DB_DIR / "sprites" / "bosses").mkdir(parents=True, exist_ok=True)
    (DB_DIR / "portraits").mkdir(parents=True, exist_ok=True)

    for hero in HERO_THEMES:
        strip = Image.new("RGBA", (48 * HERO_FRAMES, 48), TRANSP)
        for f in range(HERO_FRAMES):
            strip.paste(draw_hero_frame(hero, f), (f * 48, 0))
        strip.save(DB_DIR / "sprites" / "heroes" / f"{hero.id}.png", optimize=True)
        draw_hero_portrait(hero).save(DB_DIR / "portraits" / f"{hero.id}.png", optimize=True)

    for enemy in ENEMY_THEMES:
        assert 10 <= enemy.frames <= 15
        strip = Image.new("RGBA", (48 * enemy.frames, 48), TRANSP)
        for f in range(enemy.frames):
            strip.paste(draw_enemy_frame(enemy, f), (f * 48, 0))
        strip.save(DB_DIR / "sprites" / "enemies" / f"{enemy.id}.png", optimize=True)

    for boss in BOSS_THEMES:
        strip = Image.new("RGBA", (80 * BOSS_FRAMES, 80), TRANSP)
        for f in range(BOSS_FRAMES):
            strip.paste(draw_boss_frame(boss, f), (f * 80, 0))
        strip.save(DB_DIR / "sprites" / "bosses" / f"{boss.id}.png", optimize=True)

    print(
        f"[OK] Generated 6 heroes (15f each), 8 enemies (11-12f each), 4 bosses (15f each), "
        f"6 portraits -> {DB_DIR}"
    )


if __name__ == "__main__":
    build_all()
