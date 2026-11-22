"""Multi-frame Gen 3 pixel-art character, gatekeeper, boss, VFX, and summon-orb renderer.

Produces crisp BGR555-quantized sprites with #1b1726 1px outlines, binary alpha (0/255),
and rich per-frame kinematics:
  - 12 Heroes: 192x192 x (6 cols x 6 rows = 36 battle frames BACK 3/4) + 64x64 x (6x8 = 48 overworld frames) + 128x128 portrait
  - 20 Gatekeeper archetypes: 192x192 x (6x4 = 24 battle frames FRONT 3/4) + 64x64 x (6x4 = 24 patrol frames)
  - 7 Colossal Bosses: 256x256 x (6 cols x 6 rows = 36 battle frames FRONT 3/4)
  - 60 Skill VFX pairs: 8-frame CAST + 8-frame EFFECT strips (768x96)
  - Astral Summon Orb: 8 cols x 6 rows of 128x128 cells (1024x768)
"""

import math
import os
import sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GEN3_DIR = os.path.abspath(os.path.join(HERE, "..", "gen3"))
PYDEPS = os.path.abspath(os.path.join(HERE, "..", "units", ".pydeps"))
for p in (PYDEPS, GEN3_DIR, HERE):
    if os.path.isdir(p) and p not in sys.path:
        sys.path.insert(0, p)

import gen3  # noqa: E402

OUTLINE = gen3.snap((27, 23, 38))
WHITE = gen3.snap((248, 248, 248))
SKIN_LIT = gen3.snap((248, 216, 184))
SKIN_MID = gen3.snap((224, 176, 144))
SKIN_SHD = gen3.snap((168, 120, 96))
STEEL_LIT = gen3.snap((232, 240, 248))
STEEL_MID = gen3.snap((160, 176, 200))
STEEL_SHD = gen3.snap((88, 104, 136))
GOLD_LIT = gen3.snap((248, 224, 96))
GOLD_MID = gen3.snap((216, 160, 40))

ELEMENT_RAMPS = {
    "Verdant": [gen3.snap((184, 248, 168)), gen3.snap((64, 208, 120)), gen3.snap((24, 136, 80)), gen3.snap((16, 72, 48))],
    "Frost":   [gen3.snap((216, 248, 248)), gen3.snap((88, 200, 248)), gen3.snap((32, 128, 208)), gen3.snap((24, 64, 128))],
    "Solar":   [gen3.snap((248, 248, 176)), gen3.snap((248, 200, 56)), gen3.snap((208, 128, 24)), gen3.snap((128, 64, 16))],
    "Tide":    [gen3.snap((176, 240, 248)), gen3.snap((32, 176, 224)), gen3.snap((16, 104, 176)), gen3.snap((16, 48, 104))],
    "Pyre":    [gen3.snap((248, 232, 144)), gen3.snap((248, 120, 40)), gen3.snap((200, 48, 32)), gen3.snap((112, 24, 32))],
    "Astral":  [gen3.snap((248, 200, 248)), gen3.snap((192, 104, 248)), gen3.snap((112, 48, 192)), gen3.snap((56, 24, 112))],
}

HERO_VISUALS = {
    "gustave_blade":   ("Verdant", (40, 80, 72),  (72, 48, 40),  "rapier_pistol", "coat"),
    "celine_prism":    ("Solar",   (232, 224, 200),(184, 112, 64),"brush_staff",   "robe"),
    "bastian_aegis":   ("Pyre",    (112, 120, 136),(88, 88, 96),  "tower_shield",  "plate"),
    "lyra_frostbow":   ("Frost",   (56, 112, 168), (216, 232, 248),"greatbow",     "cloak"),
    "kestrel_dune":    ("Solar",   (176, 128, 56), (48, 40, 48),  "twin_blades",   "scarf"),
    "nereus_tide":     ("Tide",    (40, 128, 160), (144, 224, 232),"coral_lyre",   "robe"),
    "corvus_night":    ("Astral",  (56, 40, 88),   (208, 208, 232),"scythe",       "cloak"),
    "ignis_valkyrie":  ("Pyre",    (184, 48, 48),  (248, 176, 64), "dragon_lance", "plate"),
    "marina_abyss":    ("Tide",    (32, 72, 152),  (64, 200, 224), "whip",         "coat"),
    "aurelia_eclipse": ("Solar",   (232, 192, 64), (248, 232, 160),"greatsword",   "royal"),
    "seraph_glacier":  ("Frost",   (168, 216, 248),(232, 244, 248),"ice_crown_sword","royal"),
    "lumina_chrono":   ("Astral",  (136, 72, 216), (248, 192, 248),"astrolabe",    "royal"),
}


def apply_silhouette_outline(img: Image.Image, outline_rgb=OUTLINE) -> Image.Image:
    """Add crisp 1px dark navy outline around all opaque pixels without blurring."""
    w, h = img.size
    src = img.load()
    out = img.copy()
    dst = out.load()
    oc = outline_rgb + (255,)
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if src[x, y][3] == 0:
                if (
                    src[x - 1, y][3] == 255
                    or src[x + 1, y][3] == 255
                    or src[x, y - 1][3] == 255
                    or src[x, y + 1][3] == 255
                ):
                    dst[x, y] = oc
    return out


def finalize_gen3_sheet(native_img: Image.Image, scale: int = 2, max_colours: int = 15) -> Image.Image:
    """Pass native pixel art through gen3 BGR555 + 15-colour quantizer, then NEAREST upscale."""
    clean = gen3.to_gen3(native_img, max_colours=max_colours, keep=(OUTLINE, WHITE))
    if scale > 1:
        clean = clean.resize((clean.width * scale, clean.height * scale), Image.NEAREST)
    return clean


def _draw_hero_weapon_back(draw: ImageDraw.ImageDraw, kind: str, wx: int, wy: int, row: int, frame: int, ramp):
    c_hi, c_mid, c_dk, _ = ramp
    swing = [-10, -24, 12, 30, 16, -4][frame] if row in (1, 3) else [0, -3, -6, 8, 4, 0][frame]
    ang = math.radians(-38 + swing)
    dx = int(math.cos(ang) * 28)
    dy = int(math.sin(ang) * 28)

    if kind == "tower_shield":
        sx, sy = wx + (4 if row == 3 and frame in (1, 2) else 0), wy - 8
        draw.rectangle([sx - 8, sy - 14, sx + 10, sy + 14], fill=STEEL_MID)
        draw.rectangle([sx - 6, sy - 11, sx + 8, sy + 11], fill=c_mid)
        draw.rectangle([sx - 2, sy - 5, sx + 4, sy + 5], fill=GOLD_LIT)
    elif kind == "greatbow":
        draw.arc([wx - 10, wy - 20, wx + 14, wy + 18], -75, 75, fill=c_hi, width=3)
        draw.line([wx - 2, wy - 18, wx - 2, wy + 16], fill=WHITE, width=1)
        if row in (1, 2) and frame in (2, 3):
            draw.line([wx - 2, wy - 2, wx + 22, wy - 14], fill=c_hi, width=2)
    elif kind == "coral_lyre":
        draw.arc([wx - 6, wy - 14, wx + 12, wy + 8], 0, 180, fill=GOLD_LIT, width=2)
        for lx in range(wx - 3, wx + 10, 3):
            draw.line([lx, wy - 10, lx, wy + 4], fill=c_hi, width=1)
    elif kind == "astrolabe":
        ox, oy = wx + 8, wy - 12 - int(math.sin(frame * 1.05) * 3)
        draw.ellipse([ox - 8, oy - 8, ox + 8, oy + 8], outline=GOLD_LIT, width=2)
        draw.ellipse([ox - 4, oy - 4, ox + 4, oy + 4], fill=c_hi)
    else:
        length = 34 if kind in ("greatsword", "dragon_lance", "scythe") else 26
        ex = wx + int(math.cos(ang) * length)
        ey = wy + int(math.sin(ang) * length)
        width = 4 if kind == "greatsword" else 3
        draw.line([wx, wy, ex, ey], fill=STEEL_LIT if "sword" in kind or "rapier" in kind else c_hi, width=width)
        draw.line([wx - 3, wy + 2, wx + 3, wy - 2], fill=GOLD_LIT, width=2)
        if kind == "scythe":
            draw.line([ex, ey, ex + 10, ey + 7], fill=c_hi, width=3)
        elif kind == "twin_blades":
            draw.line([wx - 14, wy + 4, wx - 4 + dx // 2, wy - 12], fill=GOLD_LIT, width=2)

    # Slash smear on active strike / riposte climax frames!
    if (row == 1 and frame in (2, 3)) or (row == 3 and frame in (3, 4)):
        draw.arc([wx - 16, wy - 30, wx + 32, wy + 18], -85, 25, fill=c_hi, width=3)
        draw.arc([wx - 12, wy - 26, wx + 28, wy + 14], -70, 10, fill=WHITE, width=1)
    if row == 3 and frame in (1, 2):
        # Parry spark star!
        px, py = wx + 12, wy - 10
        draw.line([px - 7, py, px + 7, py], fill=WHITE, width=2)
        draw.line([px, py - 7, px, py + 7], fill=GOLD_LIT, width=2)


def render_hero_battle_sheet(hero_id: str) -> Image.Image:
    """Render 6 cols x 6 rows = 36 frames of 192x192 BACK 3/4 battle poses for a Hero."""
    el, coat_rgb, hair_rgb, weapon_kind, style = HERO_VISUALS[hero_id]
    ramp = ELEMENT_RAMPS[el]
    coat_mid = gen3.snap(coat_rgb)
    coat_lit = gen3.snap(tuple(min(248, c + 40) for c in coat_rgb))
    coat_shd = gen3.snap(tuple(max(16, c - 36) for c in coat_rgb))
    hair_mid = gen3.snap(hair_rgb)
    hair_lit = gen3.snap(tuple(min(248, c + 36) for c in hair_rgb))

    cell = 96  # Native 96x96 -> upscaled x2 to 192x192 (1152x1152 total)
    sheet = Image.new("RGBA", (cell * 6, cell * 6), (0, 0, 0, 0))

    for row in range(6):
        for frame in range(6):
            im = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)

            # Per-row & per-frame kinematic offsets
            bob = [0, -1, -2, -1, 0, 1][frame]
            ox, oy = 0, bob
            fallen = False
            if row == 1:  # ATTACK_STRIKE
                ox = [0, -6, 8, 16, 9, 2][frame]
                oy = [0, 2, -2, -3, -1, 0][frame]
            elif row == 2:  # SKILL_CAST
                oy = [0, -2, -5, -7, -3, 0][frame]
            elif row == 3:  # PARRY_COUNTER
                ox = [0, -3, -2, 14, 8, 0][frame]
                oy = [0, 1, 0, -3, -1, 0][frame]
            elif row == 4:  # DODGE (clear sideways shift!)
                ox = [0, -4, -15, -18, -9, 0][frame]
                oy = [0, 2, -3, -4, 1, 0][frame]
            elif row == 5:  # HURT (0..2) + FAINT (3..5)
                if frame <= 2:
                    ox = [-4, -10, -6][frame]
                    oy = [1, 3, 2][frame]
                else:
                    fallen = True

            cx = 44 + ox
            base_y = 82 + oy

            if fallen:
                # Defeated lying pose inside safe box (frames 3..5)
                drop = (frame - 3) * 3
                fy = 74 + drop
                d.Polygon if False else None
                d.ellipse([cx - 20, fy - 5, cx + 18, fy + 6], fill=coat_shd)
                d.rectangle([cx - 14, fy - 8, cx + 8, fy + 2], fill=coat_mid)
                d.ellipse([cx + 6, fy - 10, cx + 18, fy + 1], fill=hair_mid)
                d.line([cx - 18, fy + 3, cx + 14, fy + 4], fill=ramp[1], width=2)
            else:
                # Cast / Royal aura behind back
                if row == 2 and frame in (1, 2, 3, 4):
                    rad = 18 + frame * 3
                    d.ellipse([cx - rad, base_y - 38 - rad // 2, cx + rad, base_y - 10], outline=ramp[0], width=2)
                if style == "royal":
                    halo_y = base_y - 50 + int(math.sin(frame * 1.05) * 2)
                    d.arc([cx - 16, halo_y - 8, cx + 16, halo_y + 10], 190, 350, fill=GOLD_LIT, width=2)

                # Legs & boots (seen from behind-right 3/4)
                stride = [-2, 0, 3, 2, 0, -1][frame] if row in (1, 4) else 0
                d.rectangle([cx - 9 - stride, base_y - 18, cx - 3 - stride, base_y], fill=STEEL_SHD)
                d.rectangle([cx + 3 + stride, base_y - 18, cx + 9 + stride, base_y], fill=STEEL_MID)
                d.rectangle([cx - 10 - stride, base_y - 4, cx - 2 - stride, base_y], fill=coat_shd)
                d.rectangle([cx + 2 + stride, base_y - 4, cx + 11 + stride, base_y], fill=coat_mid)

                # Torso & shoulder pauldrons (3/4 back facing upper-right)
                d.polygon(
                    [(cx - 11, base_y - 40), (cx + 12, base_y - 40), (cx + 9, base_y - 17), (cx - 9, base_y - 17)],
                    fill=coat_mid,
                )
                d.polygon(
                    [(cx + 2, base_y - 40), (cx + 12, base_y - 40), (cx + 9, base_y - 17), (cx + 2, base_y - 17)],
                    fill=coat_lit,
                )

                # Billowing 6-phase Expedition Cloak / Scarf!
                wave = int(math.sin((frame / 6.0) * math.tau) * 5)
                wave2 = int(math.cos((frame / 6.0) * math.tau) * 4)
                d.polygon(
                    [
                        (cx - 11, base_y - 39),
                        (cx + 6, base_y - 38),
                        (cx + 4 + wave2, base_y - 10),
                        (cx - 16 + wave, base_y - 6),
                    ],
                    fill=coat_shd,
                )
                d.line([cx - 15 + wave, base_y - 7, cx + 3 + wave2, base_y - 10], fill=ramp[1], width=2)

                # Right arm + signature weapon
                arm_x, arm_y = cx + 11, base_y - 31
                d.rectangle([arm_x - 3, arm_y - 4, arm_x + 5, arm_y + 7], fill=coat_lit)
                _draw_hero_weapon_back(d, weapon_kind, arm_x + 3, arm_y + 1, row, frame, ramp)

                # Head turned 3/4 toward upper-right (back of hair + right cheek/eye profile!)
                hx, hy = cx + 1, base_y - 52
                d.ellipse([hx - 9, hy - 8, hx + 10, hy + 9], fill=SKIN_MID)
                d.rectangle([hx + 5, hy - 1, hx + 8, hy + 2], fill=OUTLINE)  # Focused profile eye
                # Layered hair silhouette
                d.polygon(
                    [
                        (hx - 11, hy - 3),
                        (hx - 6, hy - 11),
                        (hx + 8, hy - 10),
                        (hx + 10, hy - 3),
                        (hx + 2, hy + 6),
                        (hx - 11, hy + 8 + wave2 // 2),
                    ],
                    fill=hair_mid,
                )
                d.line([hx - 5, hy - 9, hx + 5, hy - 8], fill=hair_lit, width=2)

            im = apply_silhouette_outline(im)
            sheet.paste(im, (frame * cell, row * cell))

    return finalize_gen3_sheet(sheet, scale=2, max_colours=15)


def render_hero_movement_sheet(hero_id: str) -> Image.Image:
    """Render 6 cols x 8 rows (idle 4 dirs + walk 4 dirs = 48 frames) at 64x64 px."""
    el, coat_rgb, hair_rgb, _, _ = HERO_VISUALS[hero_id]
    ramp = ELEMENT_RAMPS[el]
    coat_mid = gen3.snap(coat_rgb)
    coat_shd = gen3.snap(tuple(max(16, c - 36) for c in coat_rgb))
    hair_mid = gen3.snap(hair_rgb)

    cell = 32  # Native 32x32 -> upscaled x2 to 64x64 (384x512)
    sheet = Image.new("RGBA", (cell * 6, cell * 8), (0, 0, 0, 0))

    for loop_idx in range(2):  # 0=idle, 1=walk
        for dir_idx in range(4):  # 0=down, 1=left, 2=right, 3=up
            row = loop_idx * 4 + dir_idx
            for frame in range(6):
                im = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
                d = ImageDraw.Draw(im)
                bob = [0, 0, -1, 0, 0, 1][frame] if loop_idx == 0 else [0, -1, 0, 0, -1, 0][frame]
                step = 0 if loop_idx == 0 else [-3, -1, 2, 3, 1, -2][frame]
                cx, by = 16, 29 + bob

                # Legs
                if dir_idx in (0, 3):
                    d.rectangle([cx - 4, by - 7 + max(0, step), cx - 2, by], fill=STEEL_SHD)
                    d.rectangle([cx + 1, by - 7 + max(0, -step), cx + 3, by], fill=STEEL_MID)
                else:
                    d.rectangle([cx - 2 + step, by - 7, cx + 1 + step, by], fill=STEEL_MID)
                    d.rectangle([cx - 2 - step, by - 7, cx + 1 - step, by], fill=STEEL_SHD)

                # Body & cloak trim
                d.rectangle([cx - 5, by - 16, cx + 5, by - 6], fill=coat_mid if dir_idx != 3 else coat_shd)
                d.line([cx - 5, by - 7, cx + 5, by - 7], fill=ramp[1], width=1)

                # Head & Hair
                hy = by - 22
                d.ellipse([cx - 5, hy - 4, cx + 5, hy + 5], fill=SKIN_LIT if dir_idx != 3 else hair_mid)
                d.polygon([(cx - 6, hy - 2), (cx, hy - 6), (cx + 6, hy - 2), (cx + 5, hy + 2), (cx - 5, hy + 2)], fill=hair_mid)
                if dir_idx == 0:
                    d.point([(cx - 2, hy + 2), (cx + 2, hy + 2)], fill=OUTLINE)
                elif dir_idx == 1:
                    d.point([(cx - 3, hy + 2)], fill=OUTLINE)
                elif dir_idx == 2:
                    d.point([(cx + 3, hy + 2)], fill=OUTLINE)

                im = apply_silhouette_outline(im)
                sheet.paste(im, (frame * cell, row * cell))

    return finalize_gen3_sheet(sheet, scale=2, max_colours=15)


def render_hero_portrait(hero_id: str) -> Image.Image:
    """Render 128x128 (native 64x64 x2) expressive pixel bust portrait."""
    el, coat_rgb, hair_rgb, _, style = HERO_VISUALS[hero_id]
    ramp = ELEMENT_RAMPS[el]
    coat_mid = gen3.snap(coat_rgb)
    coat_lit = gen3.snap(tuple(min(248, c + 36) for c in coat_rgb))
    hair_mid = gen3.snap(hair_rgb)
    hair_lit = gen3.snap(tuple(min(248, c + 40) for c in hair_rgb))

    im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Framed elemental emblem backdrop
    d.polygon([(8, 58), (16, 12), (48, 8), (56, 58)], fill=ramp[3])
    d.line([(16, 12), (48, 8), (56, 58)], fill=ramp[1], width=2)
    # Shoulders
    d.polygon([(10, 62), (20, 40), (44, 40), (54, 62)], fill=coat_mid)
    d.polygon([(24, 40), (44, 40), (50, 62), (28, 62)], fill=coat_lit)
    # Face
    d.ellipse([21, 18, 43, 42], fill=SKIN_LIT)
    d.rectangle([25, 29, 28, 32], fill=OUTLINE)
    d.rectangle([35, 29, 38, 32], fill=OUTLINE)
    d.point([(26, 29), (36, 29)], fill=WHITE)
    d.line([29, 37, 34, 37], fill=SKIN_SHD, width=1)
    # Hair & Crown
    d.polygon([(18, 28), (22, 13), (34, 11), (45, 16), (46, 30), (40, 22), (24, 22)], fill=hair_mid)
    d.line([24, 15, 38, 14], fill=hair_lit, width=2)
    if style == "royal":
        d.polygon([(24, 13), (28, 6), (32, 11), (36, 5), (40, 13)], fill=GOLD_LIT)

    im = apply_silhouette_outline(im)
    return finalize_gen3_sheet(im, scale=2, max_colours=15)


def render_gatekeeper_sheets(arch: str, element: str) -> tuple[Image.Image, Image.Image]:
    """Render (battle_24f_192x192, movement_24f_64x64) for a Gatekeeper Monster."""
    ramp = ELEMENT_RAMPS[element]
    b_cell = 96
    battle = Image.new("RGBA", (b_cell * 6, b_cell * 4), (0, 0, 0, 0))
    seed_h = sum(ord(c) for c in arch) % 3

    for row in range(4):  # 0=idle_breathe, 1=attack, 2=hurt_stagger, 3=faint
        for frame in range(6):
            im = Image.new("RGBA", (b_cell, b_cell), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            bob = int(math.sin((frame / 6.0) * math.tau) * 2)
            ox = [0, 4, -10, -18, -8, 0][frame] if row == 1 else ([0, 8, 5, 3, 1, 0][frame] if row == 2 else 0)
            cx, by = 50 + ox, 80 + bob

            if row == 3 and frame >= 3:
                d.ellipse([cx - 24, 72, cx + 22, 84], fill=ramp[3])
                d.ellipse([cx - 16, 68, cx + 14, 79], fill=ramp[2])
            else:
                # Imposing monstrous silhouette facing FRONT-LEFT (toward player at lower-left)
                d.polygon([(cx - 18, by - 36), (cx + 18, by - 42), (cx + 16, by - 8), (cx - 14, by - 8)], fill=ramp[2])
                d.polygon([(cx - 14, by - 34), (cx + 4, by - 38), (cx + 4, by - 12), (cx - 10, by - 12)], fill=ramp[1])
                # Legs / Claws
                d.rectangle([cx - 14, by - 12, cx - 6, by], fill=ramp[3])
                d.rectangle([cx + 6, by - 12, cx + 14, by], fill=ramp[3])
                # Horns / Crest by archetype hash
                if seed_h == 0:
                    d.polygon([(cx - 12, by - 40), (cx - 22, by - 58), (cx - 4, by - 44)], fill=GOLD_LIT)
                    d.polygon([(cx + 4, by - 42), (cx + 16, by - 60), (cx + 12, by - 42)], fill=GOLD_LIT)
                elif seed_h == 1:
                    d.ellipse([cx - 22, by - 50, cx + 22, by - 26], outline=ramp[0], width=3)
                else:
                    d.polygon([(cx - 8, by - 42), (cx, by - 62), (cx + 10, by - 42)], fill=STEEL_LIT)
                # Glowing eyes facing lower-left
                d.rectangle([cx - 13, by - 32, cx - 9, by - 29], fill=WHITE)
                d.rectangle([cx - 5, by - 31, cx - 1, by - 28], fill=GOLD_LIT)
                if row == 1 and frame in (2, 3):
                    d.arc([cx - 38, by - 44, cx + 2, by - 2], 120, 260, fill=ramp[0], width=3)

            im = apply_silhouette_outline(im)
            battle.paste(im, (frame * b_cell, row * b_cell))

    m_cell = 32
    move = Image.new("RGBA", (m_cell * 6, m_cell * 4), (0, 0, 0, 0))
    for dir_idx in range(4):
        for frame in range(6):
            im = Image.new("RGBA", (m_cell, m_cell), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            step = [-2, 0, 2, 2, 0, -2][frame]
            d.ellipse([8, 9 + (frame % 2), 24, 27], fill=ramp[2])
            d.ellipse([10, 11, 20, 21], fill=ramp[1])
            d.rectangle([10 + step, 25, 13 + step, 30], fill=ramp[3])
            d.rectangle([18 - step, 25, 21 - step, 30], fill=ramp[3])
            d.point([(12, 15), (18, 15)], fill=GOLD_LIT)
            im = apply_silhouette_outline(im)
            move.paste(im, (frame * m_cell, dir_idx * m_cell))

    return finalize_gen3_sheet(battle, scale=2, max_colours=15), finalize_gen3_sheet(move, scale=2, max_colours=15)


def render_boss_battle_sheet(boss_id: str, element: str, is_final: bool = False) -> Image.Image:
    """Render colossal 256x256 x (6 cols x 6 rows = 36 frames) FRONT 3/4 Boss sheet (1536x1536)."""
    ramp = ELEMENT_RAMPS[element]
    cell = 128  # Native 128x128 -> upscaled x2 to 256x256!
    sheet = Image.new("RGBA", (cell * 6, cell * 6), (0, 0, 0, 0))

    for row in range(6):  # 0:idle, 1:combo_a, 2:sweep_b, 3:phase_awaken, 4:stagger_break, 5:defeat
        for frame in range(6):
            im = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            wave = int(math.sin((frame / 6.0) * math.tau) * 5)
            ox = [0, 6, -14, -22, -10, 0][frame] if row in (1, 2) else 0
            oy = int(math.cos((frame / 6.0) * math.tau) * 3)
            if row == 3:
                oy -= frame * 2
            elif row == 4:
                oy += 8 + (frame % 2) * 2
            cx, by = 68 + ox, 108 + oy

            if row == 5 and frame >= 3:
                # Dramatic Boss collapse
                d.ellipse([cx - 40, 92, cx + 38, 114], fill=ramp[3])
                d.polygon([(cx - 32, 98), (cx, 78 + (frame - 3) * 4), (cx + 30, 98)], fill=ramp[2])
            else:
                # Wing / Mantle / Halo Silhouette!
                wing_lift = wave + (8 if row in (2, 3) else 0)
                if is_final:
                    # FINAL BOSS SERAPHINA: 4 Unfurled Aurora Prism Wings + 7-Star Crown + Cosmic Brush-Greatsword!
                    aurora_cols = [
                        ELEMENT_RAMPS["Astral"][1],
                        ELEMENT_RAMPS["Frost"][1],
                        ELEMENT_RAMPS["Solar"][1],
                        ELEMENT_RAMPS["Verdant"][1],
                    ]
                    for w_idx, wc in enumerate(aurora_cols):
                        wy_off = w_idx * 9 - wing_lift
                        d.polygon(
                            [
                                (cx - 6, by - 58 + w_idx * 4),
                                (cx - 52 + w_idx * 5, by - 88 + wy_off),
                                (cx - 42 + w_idx * 5, by - 66 + wy_off),
                            ],
                            fill=wc,
                        )
                        d.polygon(
                            [
                                (cx + 8, by - 58 + w_idx * 4),
                                (cx + 48 - w_idx * 4, by - 92 + wy_off),
                                (cx + 40 - w_idx * 4, by - 68 + wy_off),
                            ],
                            fill=wc,
                        )
                    # Starry Sovereign Gown & Torso
                    d.polygon([(cx - 22, by - 4), (cx - 12, by - 64), (cx + 14, by - 64), (cx + 26, by - 4)], fill=ramp[3])
                    d.polygon([(cx - 14, by - 8), (cx - 8, by - 62), (cx + 8, by - 62), (cx + 14, by - 8)], fill=ramp[2])
                    # 7-Star Celestial Crown + Head
                    d.ellipse([cx - 9, by - 80, cx + 9, by - 62], fill=SKIN_LIT)
                    for s_i in range(-3, 4):
                        sx = cx + s_i * 6
                        sy = by - 88 - (3 - abs(s_i)) * 2 + (frame % 2)
                        d.rectangle([sx - 1, sy - 1, sx + 1, sy + 1], fill=GOLD_LIT)
                    # Colossal Cosmic Brush-Greatsword
                    ang = math.radians(150 + ([-15, -30, 25, 45, 20, 0][frame] if row in (1, 2) else wave))
                    bx2 = cx - 14 + int(math.cos(ang) * 48)
                    by2 = by - 48 + int(math.sin(ang) * 48)
                    d.line([cx - 12, by - 48, bx2, by2], fill=GOLD_LIT, width=4)
                    d.ellipse([bx2 - 6, by2 - 6, bx2 + 6, by2 + 6], fill=ramp[0])
                else:
                    # Colossal Regional Boss Silhouette
                    d.polygon(
                        [(cx - 10, by - 54), (cx - 48, by - 80 - wing_lift), (cx - 34, by - 36)],
                        fill=ramp[3],
                    )
                    d.polygon(
                        [(cx + 10, by - 54), (cx + 46, by - 82 - wing_lift), (cx + 36, by - 36)],
                        fill=ramp[2],
                    )
                    # Armored Giant Body
                    d.polygon(
                        [(cx - 26, by - 64), (cx + 26, by - 66), (cx + 22, by - 14), (cx - 20, by - 14)],
                        fill=ramp[2],
                    )
                    d.polygon(
                        [(cx - 18, by - 60), (cx + 8, by - 62), (cx + 8, by - 22), (cx - 14, by - 22)],
                        fill=ramp[1],
                    )
                    d.rectangle([cx - 20, by - 18, cx - 8, by], fill=STEEL_SHD)
                    d.rectangle([cx + 8, by - 18, cx + 20, by], fill=STEEL_MID)
                    # Horned Helm & Glowing Core
                    d.ellipse([cx - 12, by - 82, cx + 12, by - 58], fill=STEEL_MID)
                    d.polygon([(cx - 12, by - 76), (cx - 26, by - 96), (cx - 4, by - 78)], fill=GOLD_LIT)
                    d.polygon([(cx + 12, by - 76), (cx + 26, by - 96), (cx + 4, by - 78)], fill=GOLD_LIT)
                    d.ellipse([cx - 7, by - 48, cx + 7, by - 34], fill=ramp[0])
                    d.rectangle([cx - 9, by - 72, cx - 3, by - 68], fill=WHITE)
                    # Colossal Boss Weapon
                    d.line([cx - 22, by - 46, cx - 50, by - 18 + wave], fill=STEEL_LIT, width=5)

                if row in (1, 2) and frame in (2, 3):
                    d.arc([cx - 60, by - 78, cx + 10, by + 4], 110, 265, fill=ramp[0], width=4)
                if row == 3:
                    d.ellipse([cx - 44, by - 92, cx + 44, by - 4], outline=GOLD_LIT, width=2)

            im = apply_silhouette_outline(im)
            sheet.paste(im, (frame * cell, row * cell))

    return finalize_gen3_sheet(sheet, scale=2, max_colours=15)


def elemental_mote(draw, element, x, y, size, ramp):
    """Draw a compact material silhouette with a bright edge."""
    if element == "Frost":
        draw.polygon([(x,y-size-1),(x+size,y),(x,y+size+1),(x-size,y)], fill=ramp[2])
        draw.line((x,y-size,x,y+1), fill=ramp[0])
    elif element == "Verdant":
        draw.polygon([(x-size,y+1),(x,y-size),(x+size,y-size),(x+1,y+1)], fill=ramp[1])
        draw.point((x,y), fill=ramp[0])
    elif element == "Solar":
        draw.line((x-size,y,x+size,y), fill=ramp[1])
        draw.line((x,y-size,x,y+size), fill=ramp[0])
    elif element == "Tide":
        draw.ellipse((x-size,y-size,x+size,y+size), outline=ramp[1])
        draw.point((x-1,y-1),fill=ramp[0])
    elif element == "Pyre":
        draw.polygon([(x-size,y+1),(x,y-size-1),(x+size,y+1)], fill=ramp[2])
        draw.line((x,y-1,x,y+1), fill=ramp[0])
    else:
        draw.line((x-size,y,x+size,y), fill=ramp[2])
        draw.line((x,y-size,x,y+size), fill=ramp[1])
        draw.point((x,y), fill=ramp[0])


def render_skill_vfx_pair(element: str, style: str) -> tuple[Image.Image, Image.Image]:
    """Render 8-frame CAST (768x96) and 8-frame EFFECT (768x96) strips with >=4px border safety."""
    ramp = ELEMENT_RAMPS[element]
    cell = 48  # Native 48x48 -> upscaled x2 to 96x96 (768x96 strip)
    cast = Image.new("RGBA", (cell * 8, cell), (0, 0, 0, 0))
    effect = Image.new("RGBA", (cell * 8, cell), (0, 0, 0, 0))

    for f in range(8):
        # CAST: interrupted glyph arcs and material fragments orbit the center.
        cim = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
        cd = ImageDraw.Draw(cim)
        r = (12, 15, 17, 17, 15, 12, 10, 7)[f]
        rotation = f * 15 + ("slash", "ray", "meteor", "wave", "sigil").index(style) * 11
        for angle in range(0, 360, 90):
            cd.arc((24-r,25-r//2,24+r,25+r//2), angle+rotation, angle+rotation+48, fill=ramp[2])
            cd.arc((24-r+2,25-r//2-1,24+r-2,25+r//2-1),angle+rotation,angle+rotation+18,fill=ramp[0])
        for k in range(6):
            a = math.radians(rotation+k*60)
            px = 24+round(math.cos(a)*(r+1))
            py = 23+round(math.sin(a)*(r-3))-(f//3)
            elemental_mote(cd, element, px, py, 1+k%2, ramp)
        if style == "sigil":
            cd.polygon([(24,16),(33,24),(24,32),(15,24)], outline=ramp[1])
        cim = apply_silhouette_outline(cim)
        cast.paste(cim, (f * cell, 0))

        # EFFECT: frames 0..3 projectile/slash travel, frames 4..7 impact burst!
        eim = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
        ed = ImageDraw.Draw(eim)
        if f < 4:
            if style == "slash":
                x = 10 + f * 3
                ed.polygon([(x,38),(x+15,28),(x+21,12),(x+14,19),(x+8,26)], fill=ramp[2])
                ed.line([(x,38),(x+15,28),(x+21,12)], fill=ramp[0], width=2)
                ed.line([(x+4,30),(x+10,24),(x+16,14)], fill=ramp[1])
            elif style == "ray":
                ex = 24 + f * 6
                ed.polygon([(4,24),(12,21),(ex-5,20),(ex,24),(ex-5,28),(12,27)], fill=ramp[2])
                ed.line((8,24,ex-2,24), fill=ramp[0], width=2)
            elif style == "meteor":
                x, y = 15+f*4, 10+f*5
                ed.polygon([(x-10,y-6),(x-4,y-2),(x+3,y+5),(x+7,y+1),(x+2,y-5)], fill=ramp[2])
                elemental_mote(ed, element, x+3, y+2, 4, ramp)
            elif style == "wave":
                x = 10 + f*4
                ed.arc((x,16,x+19,32), 270, 95, fill=ramp[2], width=4)
                ed.arc((x+2,18,x+17,30), 282, 85, fill=ramp[0], width=2)
            else:
                r = 8 + f
                ed.polygon([(24,24-r),(24+r,24),(24,24+r),(24-r,24)], outline=ramp[1])
                elemental_mote(ed, element, 24, 24, 2+f//2, ramp)
            for k in range(3):
                elemental_mote(ed, element, 7+k*5+f*3, 15+(k*9+f*3)%19, 1, ramp)
        else:
            step = f-4
            r = 8+step*4
            for k in range(8-step):
                a = k*math.tau/8+step*.12
                x, y = 24+round(math.cos(a)*r),24+round(math.sin(a)*r*.8)
                elemental_mote(ed, element, x, y, 2 if step < 2 else 1, ramp)
                if step < 2:
                    ed.line((24+(x-24)//2,24+(y-24)//2,x,y), fill=ramp[2])
            if step < 3:
                ed.arc((24-r,24-r//2,24+r,24+r//2),18,160,fill=ramp[1])
            if step < 2:
                if style == "slash":
                    ed.line([(16-step*2,31),(24,24),(32+step*2,17)],fill=ramp[0],width=2)
                elif style == "ray":
                    ed.line((8,24,40,24),fill=ramp[1],width=2)
                    ed.line((16,24,31,24),fill=ramp[0])
                elif style == "meteor":
                    ed.line([(25,24),(21,30),(19,35),(16,37)],fill=ramp[0],width=2)
                    ed.line([(25,25),(32,32),(32,37)],fill=ramp[2])
                elif style == "wave":
                    ed.arc((10,18,38,32),12,165,fill=ramp[0],width=2)
                else:
                    ed.polygon([(24,13),(35,24),(24,35),(13,24)],outline=ramp[0])
            if not step:
                elemental_mote(ed, element, 24, 24, 5, ramp)
        eim = apply_silhouette_outline(eim)
        effect.paste(eim, (f * cell, 0))

    return finalize_gen3_sheet(cast, scale=2, max_colours=15), finalize_gen3_sheet(effect, scale=2, max_colours=15)


def render_summon_orb_sheet() -> Image.Image:
    """Render 8 cols x 6 rows (1024x768 at x2) Astral Summon Orb sprite sheet."""
    cell = 64  # Native 64x64 -> x2 = 128x128
    sheet = Image.new("RGBA", (cell * 8, cell * 6), (0, 0, 0, 0))
    astral = ELEMENT_RAMPS["Astral"]
    frost = ELEMENT_RAMPS["Frost"]
    solar = ELEMENT_RAMPS["Solar"]

    for row in range(6):
        cols = [8, 4, 5, 4, 4, 3][row]
        for f in range(cols):
            im = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
            d = ImageDraw.Draw(im)
            cx, cy = 32, 34
            if row == 2:
                cx += [0, -4, -7, 4, 7][f]
            r = 16
            core_col = solar[1] if (row in (3, 4) and f >= 2) else (astral[1] if row >= 2 else frost[1])

            if row == 4 and f >= 2:
                # Shatter star burst!
                br = min(26, 14 + f * 4)
                d.ellipse([cx - br, cy - br, cx + br, cy + br], outline=GOLD_LIT, width=2)
                for k in range(8):
                    a = k * (math.pi / 4) + f * 0.3
                    d.line([cx, cy, cx + int(math.cos(a) * br), cy + int(math.sin(a) * br)], fill=WHITE, width=2)
            else:
                d.polygon([(cx-7,cy-r),(cx+8,cy-r),(cx+r,cy-7),(cx+r,cy+7),
                           (cx+7,cy+r),(cx-8,cy+r),(cx-r,cy+7),(cx-r,cy-7)], fill=astral[3])
                d.polygon([(cx-7,cy-r),(cx+8,cy-r),(cx+8,cy-7),(cx-6,cy-4),(cx-r,cy-7)], fill=astral[0])
                d.polygon([(cx-6,cy-4),(cx+8,cy-7),(cx+9,cy+5),(cx-2,cy+10),(cx-9,cy+4)], fill=core_col)
                d.polygon([(cx+8,cy-7),(cx+r,cy-7),(cx+r,cy+7),(cx+9,cy+5)], fill=frost[2])
                d.line([(cx-7,cy-9),(cx-2,cy-5),(cx-4,cy+1),(cx+4,cy+5)], fill=WHITE)
                # Rotating astrolabe ring
                ang = f * 22
                d.arc([cx - 21, cy - 10, cx + 21, cy + 10], ang, ang + 290, fill=GOLD_LIT, width=2)
                if row in (1, 3):
                    for k in range(3):
                        sx = cx + (k - 1) * (10 + f * 2)
                        sy = cy - 18 - f * 3
                        d.rectangle([sx - 2, sy - 2, sx + 2, sy + 2], fill=GOLD_LIT)

            im = apply_silhouette_outline(im)
            sheet.paste(im, (f * cell, row * cell))

    return finalize_gen3_sheet(sheet, scale=2, max_colours=15)
