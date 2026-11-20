#!/usr/bin/env python3
"""
Mighty Knight 2.5D Pixel — Modular Pixel VFX (18 strips), 4 Biomes x 5 Parallax Layers,
and Crisp Pixel UI Icons (30 Skill/Ult Icons, 12 Relic Icons, Stat & HUD Icons).
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Dict, List, Tuple
from PIL import Image

from palette import OUTLINE, PAL, RGBA, TRANSP, PixelCanvas, hex_rgba, rot, tint_ramp

ROOT = Path(__file__).resolve().parents[2]
DB_DIR = ROOT / "database-mighty-knight-pixel"


def build_vfx() -> None:
    vdir = DB_DIR / "vfx"
    vdir.mkdir(parents=True, exist_ok=True)

    def save_strip(name: str, cw: int, ch: int, frames: int, draw_fn) -> None:
        strip = Image.new("RGBA", (cw * frames, ch), TRANSP)
        for f in range(frames):
            c = PixelCanvas(cw, ch)
            draw_fn(c, f, frames, cw, ch)
            strip.paste(c.img, (f * cw, 0))
        strip.save(vdir / f"{name}.png", optimize=True)

    # 1. slash_crescent (64x48, 4f)
    def d_slash(c: PixelCanvas, f: int, n: int, w: int, h: int) -> None:
        t = f / max(1, n - 1)
        cx, cy = 22 + int(t * 14), 24
        for ang in range(-75, 76, 6):
            r = 16 + int(t * 6)
            rad = math.radians(ang)
            x1 = cx + math.cos(rad) * r
            y1 = cy + math.sin(rad) * (r * 0.78)
            x0 = cx + math.cos(rad) * (r - max(2, 7 - f * 2))
            y0 = cy + math.sin(rad) * ((r - max(2, 7 - f * 2)) * 0.78)
            c.line(x0, y0, x1, y1, PAL["white"] if f < 2 else PAL["cyan_hi"], 2)
            c.put(int(x1), int(y1), PAL["blue_hi"])

    save_strip("slash_crescent", 64, 48, 4, d_slash)

    # 2. slash_cross_x (64x64, 5f)
    def d_cross(c: PixelCanvas, f: int, n: int, w: int, h: int) -> None:
        r = 12 + f * 5
        th = max(1, 3 - f // 2)
        c.line(32 - r, 32 - r, 32 + r, 32 + r, PAL["white"], th)
        c.line(32 + r, 32 - r, 32 - r, 32 + r, PAL["gold_hi"], th)
        if f >= 1:
            c.ellipse(32, 32, max(2, 8 - f), max(2, 8 - f), PAL["purple_hi"])

    save_strip("slash_cross_x", 64, 64, 5, d_cross)

    # 3. whirlwind_360 (96x64, 6f)
    def d_whirl(c: PixelCanvas, f: int, n: int, w: int, h: int) -> None:
        phase = f * 60
        for ring in (0, 1):
            rx = 34 + ring * 8
            ry = 14 + ring * 5
            for a in range(0, 300, 10):
                rad = math.radians(a + phase + ring * 90)
                px = 48 + math.cos(rad) * rx
                py = 34 + math.sin(rad) * ry
                c.rect(int(px) - 1, int(py) - 1, 3 if a > 200 else 2, 2, PAL["white"] if a > 220 else PAL["cyan_hi"])

    save_strip("whirlwind_360", 96, 64, 6, d_whirl)

    # 4. holy_pillar (64x128, 6f)
    def d_holy(c: PixelCanvas, f: int, n: int, w: int, h: int) -> None:
        bw = [8, 18, 24, 20, 12, 6][f]
        c.rect(32 - bw // 2, 4, bw, 114, PAL["gold"])
        if bw >= 8:
            c.rect(32 - bw // 4, 4, max(2, bw // 2), 114, PAL["white"])
        c.ellipse(32, 116, bw + 6, 8, PAL["gold_hi"])
        c.ellipse(32, 116, bw, 4, PAL["white"])

    save_strip("holy_pillar", 64, 128, 6, d_holy)

    # 5. ground_fissure (96x48, 5f)
    def d_fissure(c: PixelCanvas, f: int, n: int, w: int, h: int) -> None:
        spread = 14 + f * 8
        c.ellipse(48, 28, spread, spread * 0.42, PAL["wood_dk"])
        c.ellipse(48, 28, max(4, spread - 4), max(2, spread * 0.34), PAL["orange"] if f < 3 else PAL["red_dk"])
        for ang in range(0, 360, 45):
            rad = math.radians(ang)
            c.line(48, 28, 48 + math.cos(rad) * (spread + 6), 28 + math.sin(rad) * (spread * 0.48), PAL["gold_hi"] if f < 2 else PAL["ink"], 1)

    save_strip("ground_fissure", 96, 48, 5, d_fissure)

    # 6. fire_meteor (48x64, 6f)
    def d_meteor(c: PixelCanvas, f: int, n: int, w: int, h: int) -> None:
        if f < 3:
            cy = 14 + f * 14
            c.poly([(24, cy + 8), (14, cy - 12), (24, cy - 18), (34, cy - 12)], PAL["orange"])
            c.ellipse(24, cy, 9, 9, PAL["red"])
            c.ellipse(24, cy + 1, 5, 5, PAL["gold_hi"])
        else:
            r = 10 + (f - 2) * 4
            c.ellipse(24, 46, r, r * 0.7, PAL["red"])
            c.ellipse(24, 46, max(3, r - 5), max(2, r * 0.45), PAL["gold_hi"])

    save_strip("fire_meteor", 48, 64, 6, d_meteor)

    # 7. lightning_bolt (48x128, 5f)
    def d_bolt(c: PixelCanvas, f: int, n: int, w: int, h: int) -> None:
        pts = [(24, 2), (18 + (f % 3) * 4, 30), (30 - (f % 2) * 6, 58), (19 + f * 2, 88), (24, 120)]
        for i in range(len(pts) - 1):
            c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], PAL["cyan_hi"], 3 if f < 3 else 1)
            c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], PAL["white"], 1)
        c.ellipse(24, 120, 10 - f, 4, PAL["white"])

    save_strip("lightning_bolt", 48, 128, 5, d_bolt)

    # 8. frost_nova (96x64, 5f)
    def d_frost(c: PixelCanvas, f: int, n: int, w: int, h: int) -> None:
        r = 14 + f * 8
        for ang in range(0, 360, 30):
            rad = math.radians(ang)
            px = 48 + math.cos(rad) * r
            py = 36 + math.sin(rad) * (r * 0.45)
            c.poly([(px, py - 8), (px - 3, py), (px + 3, py)], PAL["cyan_hi"])
            c.put(int(px), int(py - 6), PAL["white"])

    save_strip("frost_nova", 96, 64, 5, d_frost)

    # 9. gravity_vortex (96x64, 6f)
    def d_gravity(c: PixelCanvas, f: int, n: int, w: int, h: int) -> None:
        c.ellipse(48, 34, 14, 7, PAL["ink"])
        for arm in range(4):
            base = arm * 90 + f * 30
            for k in range(1, 14):
                rad = math.radians(base + k * 14)
                r = 6 + k * 2.5
                px = 48 + math.cos(rad) * r
                py = 34 + math.sin(rad) * (r * 0.46)
                c.rect(int(px), int(py), 2, 2, PAL["purple_hi"] if k < 7 else PAL["purple"])

    save_strip("gravity_vortex", 96, 64, 6, d_gravity)

    # 10. dragon_spirit (96x48, 6f)
    def d_dragon(c: PixelCanvas, f: int, n: int, w: int, h: int) -> None:
        for seg in range(10):
            sx = 12 + seg * 7
            sy = 24 + int(math.sin((seg * 0.7) + f * 1.1) * 7)
            rad = 4 + (seg // 3)
            c.ellipse(sx, sy, rad, rad, PAL["cyan"] if seg < 8 else PAL["cyan_hi"])
            if seg == 9:
                c.poly([(sx + 4, sy - 6), (sx + 14, sy), (sx + 4, sy + 6)], PAL["white"])
                c.put(sx + 6, sy - 2, PAL["gold_hi"])

    save_strip("dragon_spirit", 96, 48, 6, d_dragon)

    # 11. phoenix_flame (96x64, 6f)
    def d_phoenix(c: PixelCanvas, f: int, n: int, w: int, h: int) -> None:
        flap = int(math.sin(f * 1.1) * 10)
        c.poly([(14, 32), (48, 22), (82, 32), (48, 42)], PAL["orange"])
        c.poly([(36, 32), (24, 12 + flap), (62, 26)], PAL["red_hi"])
        c.poly([(36, 32), (24, 52 - flap), (62, 38)], PAL["red_hi"])
        c.ellipse(66, 32, 9, 6, PAL["gold_hi"])
        c.put(70, 31, PAL["white"])

    save_strip("phoenix_flame", 96, 64, 6, d_phoenix)

    # 12. magic_rune_25d (80x40, 4f)
    def d_rune(c: PixelCanvas, f: int, n: int, w: int, h: int) -> None:
        for a in range(0, 360, 8):
            rad = math.radians(a)
            c.put(int(40 + math.cos(rad) * 34), int(20 + math.sin(rad) * 15), PAL["gold_hi"])
            c.put(int(40 + math.cos(rad) * 24), int(20 + math.sin(rad) * 11), PAL["white"])
        pts = [(40 + math.cos(math.radians(i * 72 + f * 18)) * 30, 20 + math.sin(math.radians(i * 72 + f * 18)) * 13) for i in range(5)]
        for i in range(5):
            j = (i + 2) % 5
            c.line(pts[i][0], pts[i][1], pts[j][0], pts[j][1], PAL["gold"], 1)

    save_strip("magic_rune_25d", 80, 40, 4, d_rune)

    # 13. parry_ring (64x64, 4f)
    def d_parry(c: PixelCanvas, f: int, n: int, w: int, h: int) -> None:
        r = 12 + f * 6
        for a in range(0, 360, 6):
            rad = math.radians(a)
            px, py = int(32 + math.cos(rad) * r), int(32 + math.sin(rad) * r)
            c.rect(px - 1, py - 1, 2, 2, PAL["white"] if f < 2 else PAL["gold_hi"])
        for a in range(0, 360, 45):
            rad = math.radians(a)
            c.line(32 + math.cos(rad) * (r - 4), 32 + math.sin(rad) * (r - 4), 32 + math.cos(rad) * (r + 4), 32 + math.sin(rad) * (r + 4), PAL["gold"], 1)

    save_strip("parry_ring", 64, 64, 4, d_parry)

    # 14. aura_fury (48x56, 4f)
    def d_aura(c: PixelCanvas, f: int, n: int, w: int, h: int) -> None:
        for i in range(6):
            x = 12 + i * 5
            h_flame = 14 + ((i + f) % 3) * 8
            c.poly([(x - 3, 50), (x, 50 - h_flame), (x + 3, 50)], PAL["orange"] if i % 2 else PAL["gold_hi"])

    save_strip("aura_fury", 48, 56, 4, d_aura)

    # 15. hit_spark (32x32, 4f)
    def d_spark(c: PixelCanvas, f: int, n: int, w: int, h: int) -> None:
        r = 5 + f * 3
        for a in range(0, 360, 45):
            rad = math.radians(a + f * 15)
            c.line(16, 16, 16 + math.cos(rad) * r, 16 + math.sin(rad) * r, PAL["white"] if f < 2 else PAL["gold_hi"], 1)

    save_strip("hit_spark", 32, 32, 4, d_spark)

    # 16. dust_puff (32x24, 4f)
    def d_dust(c: PixelCanvas, f: int, n: int, w: int, h: int) -> None:
        r = max(2, 6 - f)
        c.ellipse(10 + f * 2, 16 - f, r, r, PAL["bone"])
        c.ellipse(20 + f * 2, 17 - f, max(2, r - 1), max(2, r - 1), PAL["bone_sh"])

    save_strip("dust_puff", 32, 24, 4, d_dust)

    # 17. projectiles_sheet (32x24, 12f: 12 distinct crisp pixel projectiles)
    def d_proj(c: PixelCanvas, f: int, n: int, w: int, h: int) -> None:
        if f == 0:  # arrow
            c.line(4, 12, 26, 12, PAL["wood_lt"], 1)
            c.poly([(29, 12), (24, 9), (24, 15)], PAL["silver"])
            c.line(4, 10, 7, 12, PAL["white"], 1)
            c.line(4, 14, 7, 12, PAL["white"], 1)
        elif f == 1:  # pierce_arrow
            c.line(2, 12, 28, 12, PAL["gold_hi"], 2)
            c.poly([(31, 12), (23, 7), (23, 17)], PAL["white"])
        elif f == 2:  # frost_arrow
            c.line(4, 12, 27, 12, PAL["cyan_hi"], 2)
            c.poly([(30, 12), (24, 8), (24, 16)], PAL["white"])
        elif f == 3:  # sword_wave
            for a in range(-65, 66, 8):
                rad = math.radians(a)
                c.rect(int(14 + math.cos(rad) * 11), int(12 + math.sin(rad) * 10), 3, 2, PAL["gold_hi"])
        elif f == 4:  # shuriken
            c.line(16, 4, 16, 20, PAL["silver"], 2)
            c.line(8, 12, 24, 12, PAL["silver"], 2)
            c.ellipse(16, 12, 3, 3, PAL["green_hi"])
        elif f == 5:  # tomahawk
            c.ellipse(16, 12, 8, 8, PAL["red_hi"])
            c.ellipse(16, 12, 4, 4, PAL["wood"])
            c.line(10, 6, 22, 18, PAL["gold_hi"], 2)
        elif f == 6:  # arcane_bolt
            c.ellipse(16, 12, 7, 6, PAL["purple"])
            c.ellipse(17, 12, 4, 3, PAL["white"])
        elif f == 7:  # soul_lance
            c.line(3, 12, 28, 12, PAL["cyan"], 2)
            c.poly([(30, 12), (20, 7), (20, 17)], PAL["cyan_hi"])
        elif f == 8:  # phoenix_wave
            c.poly([(4, 12), (18, 4), (30, 12), (18, 20)], PAL["orange"])
            c.ellipse(22, 12, 5, 4, PAL["gold_hi"])
        elif f == 9:  # dragon_wave
            c.poly([(4, 12), (18, 5), (30, 12), (18, 19)], PAL["cyan_hi"])
            c.put(24, 10, PAL["gold_hi"])
        elif f == 10:  # shaman_hex / boss_shadow
            c.ellipse(16, 12, 6, 6, PAL["red"])
            c.ellipse(16, 12, 3, 3, PAL["gold_hi"])
        else:  # boss_boulder / fireball
            c.ellipse(16, 12, 8, 8, PAL["orange"])
            c.ellipse(15, 11, 5, 5, PAL["slate"])
            c.put(18, 9, PAL["gold_hi"])
        c.add_outline(OUTLINE)

    save_strip("projectiles_sheet", 32, 24, 12, d_proj)

    # 18. pickups_sheet (16x16, 10f: gold 0-1, exp 2-3, potion 4-5, fury 6-7, relic_chest 8-9)
    def d_pickup(c: PixelCanvas, f: int, n: int, w: int, h: int) -> None:
        kind = f // 2
        alt = f % 2
        if kind == 0:  # gold coin
            rx = 5 if alt == 0 else 3
            c.shaded_ellipse(8, 8, rx, 5, tint_ramp(PAL["gold"]))
            c.rect(8, 6, 1, 4, PAL["gold_hi"])
        elif kind == 1:  # exp gem
            c.poly([(8, 2 + alt), (13, 8), (8, 14 - alt), (3, 8)], PAL["cyan_hi"])
            c.put(8, 7, PAL["white"])
        elif kind == 2:  # potion
            c.shaded_ellipse(8, 10, 5, 4, tint_ramp(PAL["red"]))
            c.rect(6, 4, 4, 3, PAL["silver"])
            c.put(6, 9, PAL["white"])
        elif kind == 3:  # fury orb
            c.shaded_ellipse(8, 8, 5, 5, tint_ramp(PAL["orange"]))
            c.ellipse(8, 8, 2 + alt, 2 + alt, PAL["gold_hi"])
        else:  # relic chest
            c.shaded_rect(2, 5, 12, 8, tint_ramp(PAL["wood_lt"]))
            c.rect(2, 8, 12, 2, PAL["gold"])
            c.rect(7, 7, 2, 4, PAL["gold_hi"])
        c.add_outline(OUTLINE)

    save_strip("pickups_sheet", 16, 16, 10, d_pickup)


def build_terrains() -> None:
    biome_specs: Dict[str, Dict[str, RGBA]] = {
        "grasslands": {
            "sky_top": hex_rgba("#243b6b"),
            "sky_bot": hex_rgba("#6aa8d8"),
            "far": hex_rgba("#385b7a"),
            "mid": hex_rgba("#275940"),
            "ground_a": hex_rgba("#3e7c47"),
            "ground_b": hex_rgba("#33693d"),
            "path": hex_rgba("#8e7552"),
            "fg": hex_rgba("#162c22"),
            "accent": PAL["gold_hi"],
        },
        "jungle": {
            "sky_top": hex_rgba("#162238"),
            "sky_bot": hex_rgba("#2f5a5c"),
            "far": hex_rgba("#1e3d42"),
            "mid": hex_rgba("#1c4a38"),
            "ground_a": hex_rgba("#2c543e"),
            "ground_b": hex_rgba("#234332"),
            "path": hex_rgba("#59564e"),
            "fg": hex_rgba("#111e1a"),
            "accent": PAL["cyan_hi"],
        },
        "volcano": {
            "sky_top": hex_rgba("#220e1a"),
            "sky_bot": hex_rgba("#7a2824"),
            "far": hex_rgba("#441a24"),
            "mid": hex_rgba("#361b26"),
            "ground_a": hex_rgba("#42303a"),
            "ground_b": hex_rgba("#35262e"),
            "path": hex_rgba("#633834"),
            "fg": hex_rgba("#1a0e14"),
            "accent": PAL["orange"],
        },
        "citadel": {
            "sky_top": hex_rgba("#120e29"),
            "sky_bot": hex_rgba("#3b2c6e"),
            "far": hex_rgba("#2a2254"),
            "mid": hex_rgba("#362f63"),
            "ground_a": hex_rgba("#3c3b5e"),
            "ground_b": hex_rgba("#312f4f"),
            "path": hex_rgba("#625e85"),
            "fg": hex_rgba("#141126"),
            "accent": PAL["purple_hi"],
        },
    }

    for biome, p in biome_specs.items():
        bdir = DB_DIR / "terrains" / biome
        bdir.mkdir(parents=True, exist_ok=True)

        # 1. bg_sky (640x168) banded retro gradient + stars/clouds
        sky = PixelCanvas(640, 168)
        bands = 8
        for y in range(168):
            t = int((y / 168) * bands) / (bands - 1)
            r = int(p["sky_top"][0] + (p["sky_bot"][0] - p["sky_top"][0]) * t)
            g = int(p["sky_top"][1] + (p["sky_bot"][1] - p["sky_top"][1]) * t)
            b = int(p["sky_top"][2] + (p["sky_bot"][2] - p["sky_top"][2]) * t)
            for x in range(640):
                sky.put(x, y, (r, g, b, 255))
        # Pixel moon / sun + clouds/stars
        sky.ellipse(520, 42, 18, 18, p["accent"])
        for i in range(28):
            sx = (i * 97 + 19) % 636
            sy = (i * 41 + 9) % 92
            sky.rect(sx, sy, 2 if i % 4 == 0 else 1, 1, PAL["white"])
        for cx in (90, 270, 440):
            sky.ellipse(cx, 54, 34, 8, p["sky_bot"])
            sky.ellipse(cx + 18, 48, 22, 7, p["sky_bot"])
        sky.img.save(bdir / "bg_sky.png", optimize=True)

        # 2. bg_far (640x112) distant mountains / castle spires
        far = PixelCanvas(640, 112)
        for i in range(8):
            bx = i * 80
            peak = 24 + ((i * 23) % 32)
            far.poly([(bx - 16, 112), (bx + 40, peak), (bx + 96, 112)], p["far"])
            if biome == "citadel" and i % 2 == 0:
                far.rect(bx + 32, peak - 14, 16, 40, p["far"])
                far.rect(bx + 38, peak - 6, 4, 6, p["accent"])
            elif biome == "volcano" and i == 3:
                far.rect(bx + 34, peak, 12, 8, PAL["orange"])
        far.img.save(bdir / "bg_far.png", optimize=True)

        # 3. bg_mid (640x96) trees / ruins / torches
        mid = PixelCanvas(640, 96)
        for i in range(10):
            tx = i * 64 + 14
            if biome in ("grasslands", "jungle"):
                mid.rect(tx + 12, 46, 8, 50, PAL["wood_dk"])
                mid.ellipse(tx + 16, 38, 22, 18, p["mid"])
                mid.ellipse(tx + 10, 32, 14, 12, p["ground_a"])
            else:
                mid.rect(tx + 8, 26, 16, 70, p["mid"])
                mid.rect(tx + 6, 22, 20, 6, p["path"])
                mid.rect(tx + 14, 14, 4, 8, p["accent"])
        mid.img.save(bdir / "bg_mid.png", optimize=True)

        # 4. ground_arena (1280x204) 2.5D depth-shaded belt floor
        g = PixelCanvas(1280, 204)
        for y in range(204):
            col = p["ground_a"] if (y // 12) % 2 == 0 else p["ground_b"]
            if 58 <= y <= 146:
                col = p["path"] if (y + 1) % 24 > 2 else p["ground_b"]
            g.rect(0, y, 1280, 1, col)
        # Pixel flagstones / grass tufts for crisp motion reference
        for x in range(16, 1264, 32):
            for row in (22, 44, 162, 186):
                g.rect(x + (row % 9), row, 5, 2, p["accent"] if biome == "volcano" else p["mid"])
            g.rect(x, 60, 2, 84, p["ground_b"])
        # Top edge rim separating wall/ground
        g.rect(0, 0, 1280, 4, OUTLINE)
        g.rect(0, 4, 1280, 2, p["path"])
        g.img.save(bdir / "ground_arena.png", optimize=True)

        # 5. fg_silhouette (640x44) foreground bushes/rocks
        fg = PixelCanvas(640, 44)
        for x in range(0, 640, 48):
            fg.ellipse(x + 20, 38, 28, 16, p["fg"])
            fg.ellipse(x + 42, 42, 20, 14, p["fg"])
        fg.img.save(bdir / "fg_silhouette.png", optimize=True)


def build_ui_icons() -> None:
    udir = DB_DIR / "ui"
    udir.mkdir(parents=True, exist_ok=True)

    def make_icon(name: str, bg: RGBA, fg: RGBA, hi: RGBA, shape: str) -> None:
        c = PixelCanvas(24, 24)
        c.rect(1, 1, 22, 22, bg)
        c.rect(2, 2, 20, 20, tint_ramp(bg)[2])
        if shape == "sword":
            c.line(5, 19, 19, 5, fg, 2)
            c.line(7, 13, 11, 17, hi, 2)
        elif shape == "spin":
            for a in range(0, 300, 20):
                rad = math.radians(a)
                c.rect(int(12 + math.cos(rad) * 7), int(12 + math.sin(rad) * 7), 2, 2, hi)
        elif shape == "bolt":
            c.line(14, 3, 9, 12, hi, 2)
            c.line(9, 12, 15, 12, hi, 2)
            c.line(15, 12, 10, 21, fg, 2)
        elif shape == "shield":
            c.shaded_rect(6, 5, 12, 14, tint_ramp(fg))
            c.rect(11, 7, 2, 10, hi)
        elif shape == "star":
            c.ellipse(12, 12, 6, 6, fg)
            c.line(12, 3, 12, 21, hi, 2)
            c.line(3, 12, 21, 12, hi, 2)
        elif shape == "arrow":
            c.line(4, 18, 19, 5, fg, 2)
            c.poly([(20, 4), (13, 5), (19, 11)], hi)
        elif shape == "flame":
            c.poly([(12, 3), (19, 15), (12, 21), (5, 15)], fg)
            c.ellipse(12, 14, 3, 4, hi)
        elif shape == "vortex":
            c.ellipse(12, 12, 7, 7, fg)
            c.ellipse(12, 12, 3, 3, PAL["ink"])
            c.put(9, 8, hi)
        elif shape == "boot":
            c.rect(6, 6, 6, 10, fg)
            c.rect(6, 14, 12, 4, hi)
        elif shape == "heart":
            c.ellipse(9, 9, 4, 4, fg)
            c.ellipse(15, 9, 4, 4, fg)
            c.poly([(5, 10), (19, 10), (12, 19)], fg)
        elif shape == "lock":
            c.rect(7, 11, 10, 9, fg)
            c.line(9, 11, 9, 6, hi, 2)
            c.line(15, 11, 15, 6, hi, 2)
            c.line(9, 6, 15, 6, hi, 2)
        else:
            c.ellipse(12, 12, 6, 6, fg)
            c.ellipse(11, 11, 3, 3, hi)
        # Pixel frame
        c.rect(0, 0, 24, 1, OUTLINE)
        c.rect(0, 23, 24, 1, OUTLINE)
        c.rect(0, 0, 1, 24, OUTLINE)
        c.rect(23, 0, 1, 24, OUTLINE)
        c.enforce_binary_alpha()
        c.img.save(udir / f"{name}.png", optimize=True)

    # 30 Hero Skill + Ult icons
    hero_cols = {
        "knight": (PAL["blue_dk"], PAL["blue_hi"], PAL["gold_hi"]),
        "archer": (PAL["green_dk"], PAL["green_hi"], PAL["cyan_hi"]),
        "rogue": (PAL["slate_dk"], PAL["gold"], PAL["purple_hi"]),
        "barbarian": (PAL["red_dk"], PAL["orange"], PAL["gold_hi"]),
        "mage": (PAL["purple_dk"], PAL["purple_hi"], PAL["orange"]),
        "lancer": (PAL["cyan_dk"], PAL["cyan_hi"], PAL["white"]),
    }
    shapes = ["spin", "flame", "shield", "sword"]
    for hid, (bg, fg, hi) in hero_cols.items():
        for s in range(1, 5):
            make_icon(f"skill_{hid}_{s}", bg, fg, hi, shapes[s - 1])
        make_icon(f"ult_{hid}", PAL["void"], hi, PAL["white"], "star")

    # 12 Relic icons
    relic_defs = [
        ("relic_vampiric_fang", PAL["red_dk"], PAL["red_hi"], PAL["white"], "flame"),
        ("relic_chrono_crystal", PAL["cyan_dk"], PAL["cyan_hi"], PAL["white"], "vortex"),
        ("relic_phantom_cloak", PAL["purple_dk"], PAL["purple_hi"], PAL["white"], "spin"),
        ("relic_thunder_sigil", PAL["slate_dk"], PAL["gold"], PAL["white"], "bolt"),
        ("relic_parry_emblem", PAL["gold_dk"], PAL["gold_hi"], PAL["white"], "shield"),
        ("relic_fury_core", PAL["red_dk"], PAL["orange"], PAL["gold_hi"], "star"),
        ("relic_giant_slayer", PAL["red_dk"], PAL["red"], PAL["gold_hi"], "sword"),
        ("relic_frost_brand", PAL["cyan_dk"], PAL["cyan"], PAL["white"], "arrow"),
        ("relic_midas_coin", PAL["gold_dk"], PAL["gold"], PAL["gold_hi"], "orb"),
        ("relic_phoenix_feather", PAL["red_dk"], PAL["orange"], PAL["white"], "flame"),
        ("relic_aegis_rune", PAL["blue_dk"], PAL["blue_hi"], PAL["white"], "shield"),
        ("relic_combo_master", PAL["green_dk"], PAL["green_hi"], PAL["white"], "star"),
    ]
    for name, bg, fg, hi, sh in relic_defs:
        make_icon(name, bg, fg, hi, sh)

    # Core stat & action icons
    for name, bg, fg, hi, sh in [
        ("stat_atk", PAL["red_dk"], PAL["red_hi"], PAL["gold_hi"], "sword"),
        ("stat_hp", PAL["green_dk"], PAL["green_hi"], PAL["white"], "heart"),
        ("stat_def", PAL["blue_dk"], PAL["blue_hi"], PAL["white"], "shield"),
        ("stat_spd", PAL["cyan_dk"], PAL["cyan_hi"], PAL["white"], "boot"),
        ("btn_attack", PAL["red_dk"], PAL["gold"], PAL["white"], "sword"),
        ("btn_dash", PAL["cyan_dk"], PAL["cyan_hi"], PAL["white"], "boot"),
        ("btn_guard", PAL["gold_dk"], PAL["gold_hi"], PAL["white"], "shield"),
        ("btn_switch", PAL["blue_dk"], PAL["gold_hi"], PAL["white"], "spin"),
        ("icon_padlock", PAL["slate_dk"], PAL["slate_lt"], PAL["white"], "lock"),
    ]:
        make_icon(name, bg, fg, hi, sh)


def main() -> None:
    build_vfx()
    build_terrains()
    build_ui_icons()
    print(f"[OK] Generated 18 pixel VFX strips, 4 biomes x 5 parallax layers, and 51 pixel UI icons -> {DB_DIR}")


if __name__ == "__main__":
    main()
