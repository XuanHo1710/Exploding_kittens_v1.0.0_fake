"""Living 8-frame Battle Scenes, Overworld Tilesets, Structures, and 7-Realm Tiled .tmj Generator.

Includes special multi-band flowing Aurora Night-Sky Spectrum (`07-aurora-zenith`)
and BFS pathability + >=6-tile RestAnchor safety verification.
"""

from collections import deque
import math
import os
import random
import sys
from pathlib import Path
from PIL import Image, ImageDraw
from meadow_landscape import add_meadow_landscape

HERE = os.path.dirname(os.path.abspath(__file__))
GEN3_DIR = os.path.abspath(os.path.join(HERE, "..", "gen3"))
PYDEPS = os.path.abspath(os.path.join(HERE, "..", "units", ".pydeps"))
for p in (PYDEPS, GEN3_DIR, HERE):
    if os.path.isdir(p) and p not in sys.path:
        sys.path.insert(0, p)

import gen3  # noqa: E402
from pixel_sprites import ELEMENT_RAMPS, GOLD_LIT, OUTLINE, WHITE, apply_silhouette_outline, finalize_gen3_sheet  # noqa: E402

THEME_PALETTES = {
    "meadow": {
        "sky": [(136, 200, 248), (184, 224, 248)],
        "ground": (88, 176, 88),
        "path": (208, 176, 128),
        "wall": (32, 96, 56),
        "anim": (72, 184, 240),
        "plat": (64, 144, 72),
    },
    "snow": {
        "sky": [(152, 192, 232), (216, 240, 248)],
        "ground": (224, 240, 248),
        "path": (160, 192, 224),
        "wall": (64, 104, 152),
        "anim": (120, 216, 248),
        "plat": (176, 216, 240),
    },
    "desert": {
        "sky": [(240, 176, 96), (248, 224, 152)],
        "ground": (232, 192, 112),
        "path": (192, 144, 80),
        "wall": (136, 88, 40),
        "anim": (64, 192, 184),
        "plat": (208, 160, 88),
    },
    "underwater": {
        "sky": [(16, 56, 112), (24, 104, 168)],
        "ground": (32, 96, 136),
        "path": (64, 152, 184),
        "wall": (16, 48, 88),
        "anim": (96, 232, 240),
        "plat": (40, 128, 168),
    },
    "volcano": {
        "sky": [(56, 24, 32), (136, 48, 32)],
        "ground": (64, 56, 64),
        "path": (96, 80, 80),
        "wall": (32, 24, 32),
        "anim": (248, 112, 32),
        "plat": (88, 64, 64),
    },
    "night": {
        "sky": [(24, 16, 56), (56, 32, 104)],
        "ground": (40, 48, 88),
        "path": (80, 72, 128),
        "wall": (24, 24, 56),
        "anim": (184, 112, 248),
        "plat": (64, 56, 112),
    },
    "aurora": {
        "sky": [(16, 16, 48), (40, 24, 88)],
        "ground": (72, 64, 128),
        "path": (144, 136, 216),
        "wall": (32, 24, 72),
        "anim": (104, 240, 216),
        "plat": (112, 96, 184),
    },
}


def overhead_floor(theme, width, height):
    """Paint a continuous floor and place biome features around both combat lanes."""
    palette = THEME_PALETTES[theme]
    rng = random.Random("arena:" + theme)
    floor = palette["ground"]
    stone = palette["wall"]
    liquid = palette["anim"]
    base = Image.new("RGBA", (width, height))
    surface = base.load()
    for y in range(height):
        for x in range(width):
            broad = math.sin(x*.044+y*.033) + math.sin(y*.119-x*.064)
            detail = math.sin(x*.29+y*.45) + math.cos(x*.59-y*.24)
            border = max(0, max(abs(x-width/2)/width, abs(y-height/2)/height)-.27)
            shade = round(broad*7 + detail*3 + rng.randrange(-7, 8) - border*70)
            surface[x,y] = terrain_color(floor, shade) + (255,)
    draw = ImageDraw.Draw(base)

    # Frame the clearing with uneven banks of water, ice, lava or cloud sea.
    for upper in (True, False):
        edge = 0 if upper else height-1
        sign = 1 if upper else -1
        points = [(x, edge+sign*int(13 + 7*math.sin(x*.033+sign) + 5*math.sin(x*.079))) for x in range(width)]
        draw.polygon([(0,edge), *points, (width-1,edge)], fill=terrain_color(stone,-12))
        for shift, offset in ((0,-5), (3,-56), (6,-38)):
            draw.line([(x,y-sign*shift) for x,y in points], fill=terrain_color(liquid,offset))
        for _ in range(140):
            x = rng.randrange(width-6)
            y = points[x][1] - sign*rng.randint(6,14)
            draw.line((x,y,x+rng.randrange(2,7),y), fill=terrain_color(liquid,rng.choice((-72,-48,-32,-8))))

    for _ in range(460):
        x, y = rng.randrange(2,width-7), rng.randrange(3,height-6)
        edge = min(x, width-1-x, y, height-1-y)
        if edge > 44 and rng.random() < .83:
            continue
        if theme == "desert":
            draw.line([(x,y), (x+4,y-1), (x+7,y-1)], fill=terrain_color(floor,rng.choice((-25,22))))
        elif theme in ("meadow", "night", "underwater"):
            shade = terrain_color(stone, 14)
            draw.line([(x,y+2),(x-1,y),(x-1,y-1)],fill=shade)
            draw.line([(x,y+2),(x+2,y),(x+3,y)], fill=terrain_color(floor,22))
            if edge < 36 and rng.randrange(5)==0:
                draw.point((x+3,y),fill=terrain_color(liquid,18))
        else:
            draw.line([(x,y),(x+2,y-1),(x+5,y),(x+7,y+2)], fill=terrain_color(stone, 12))
            draw.line((x+1,y+1,x+4,y+1), fill=terrain_color(floor,18))
    for cx, cy in ((27,42),(352,39),(358,137),(37,145),(173,22),(226,156)):
        for _ in range(3 if theme in ("aurora", "desert") else 5):
            x, y = cx+rng.randrange(-13,14), cy+rng.randrange(-9,10)
            prop = Image.new("RGBA",(16,16))
            draw_terrain_landmark(ImageDraw.Draw(prop),theme,stone)
            scale = rng.choice((16,20,24))
            prop = prop.resize((scale,scale),Image.Resampling.NEAREST)
            base.paste(prop,(x,y),prop)
    return base


def render_battle_scene_layers(theme: str) -> tuple[Image.Image, Image.Image]:
    """Render wide 390x180 (upscaled x2 -> 780x360) battle backdrop+platforms and an 8-frame ambient-anim strip."""
    pal = THEME_PALETTES[theme]
    w, h = 390, 180
    source = Path(HERE).parents[1] / "database-astral-expedition" / "art-source" / "battle-scenes" / "arena-atlas-source.png"
    if source.is_file():
        with Image.open(source) as original:
            row, col = divmod(list(THEME_PALETTES).index(theme), 2)
            # Keep the crop inside its panel even where the atlas split rounds to a pixel.
            left, right = round(col * original.width / 2), round((col + 1) * original.width / 2)
            top, bottom = round(row * original.height / 4), round((row + 1) * original.height / 4)
            panel = original.crop((left + 1, top + 1, right - 1, bottom - 1))
            base = panel.convert("RGB").resize((w, h), Image.Resampling.NEAREST)
        base = gen3.to_gen3(
            base.quantize(colors=28, dither=Image.Dither.NONE).convert("RGBA"),
            max_palettes=13,
        )
    else:
        base = gen3.to_gen3(overhead_floor(theme, w, h), max_colours=15)

    # 8-frame animated environmental overlay (each frame 390x180 -> strip 3120x180 native, or compact 384x176; keep exact 390x180 x2!)
    # Note: we store 8-frame ambient overlay at 195x90 native upscaled x4 = 780x360 per frame -> 6240x360 strip, or 8 frames stacked vertically 780x2880; horizontal 8 frames of 390x180 native (3120x180) is crisp & fast!
    anim = Image.new("RGBA", (w * 8, h), (0, 0, 0, 0))
    aurora_ribbon_cols = [
        gen3.snap((88, 248, 192)),
        gen3.snap((88, 192, 248)),
        gen3.snap((192, 112, 248)),
        gen3.snap((248, 128, 216)),
        gen3.snap((248, 216, 96)),
        gen3.snap((168, 232, 120)),
        gen3.snap((200, 176, 248)),
    ]
    a_col = gen3.snap(pal["anim"])

    for f in range(8):
        fim = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        fd = ImageDraw.Draw(fim)
        phase = (f / 8.0) * math.tau

        if theme == "aurora":
            # Magnificent 7-spectrum undulating Aurora Night-Sky ribbons + twinkling stars!
            for s_idx in range(28):
                sx = (s_idx * 47 + 13) % w
                sy = (s_idx * 19 + 5) % 24
                if (s_idx + f) % 3 != 0:
                    fd.point((sx, sy), fill=WHITE)
            for b_i, rcol in enumerate(aurora_ribbon_cols):
                pts = []
                for x in range(332, w+1, 5):
                    y = 162 + b_i * 2 + int(math.sin(phase + x * .1 + b_i * .45) * 3)
                    pts.append((x, y))
                fd.line(pts, fill=terrain_color(rcol,-80), width=1)
        else:
            # Living weather / biome particles & animated horizon ripples across 8 frames
            for i in range(22):
                px = (i * 53 + f * 7) % (w - 8)
                py = (i * 29 + f * (5 if theme in ("snow", "desert") else -4)) % (h - 16)
                if 40 < px < w-40 and 34 < py < h-34:
                    continue
                if theme == "volcano":
                    fd.rectangle([px, py, px + 2, py + 2], fill=GOLD_LIT if i % 2 == 0 else a_col)
                elif theme == "underwater":
                    fd.ellipse([px, py, px + 4, py + 4], outline=a_col, width=1)
                elif theme == "desert":
                    fd.line((px, py, px+3, py), fill=terrain_color(pal["ground"],24))
                else:
                    fd.rectangle([px, py, px + 2, py + 1], fill=a_col)

        anim.paste(fim, (f * w, 0))

    base_out = base.resize((w * 2, h * 2), Image.NEAREST)
    anim_out = gen3.to_gen3(anim, max_colours=15).resize((w * 8 * 2, h * 2), Image.NEAREST)
    return base_out, anim_out


def terrain_color(color, offset):
    return gen3.snap(tuple(max(0, min(255, channel + offset)) for channel in color))


def draw_terrain_landmark(draw, theme, wall):
    """Draw seven silhouettes at the native 16-pixel scale."""
    dark, mid, light = (terrain_color(wall, n) for n in (-16, 28, 60))
    draw.ellipse((1, 11, 15, 15), fill=dark)
    if theme == "meadow":
        draw.rectangle((7, 8, 9, 14), fill=(106, 73, 49))
        draw.polygon([(1, 10), (2, 5), (5, 2), (10, 1), (14, 5), (15, 10), (11, 12), (4, 12)], fill=dark)
        draw.ellipse((2, 2, 13, 10), fill=mid)
        draw.ellipse((3, 2, 8, 6), fill=light)
    elif theme == "snow":
        draw.rectangle((7, 9, 9, 14), fill=dark)
        for y, radius in ((10, 6), (7, 5), (4, 3)):
            draw.polygon([(8, y - 4), (8 + radius, y + 2), (8 - radius, y + 2)], fill=mid)
            draw.line([(8 - radius, y + 1), (7, y - 2), (10, y + 1)], fill=(224, 240, 248))
    elif theme == "desert":
        draw.polygon([(4, 13), (5, 4), (8, 1), (11, 3), (12, 13)], fill=mid)
        draw.polygon([(5, 4), (8, 1), (8, 12), (4, 13)], fill=light)
        draw.line([(7, 5), (8, 6), (7, 8), (8, 9)], fill=dark)
        draw.line((3, 13, 13, 13), fill=light)
    elif theme == "underwater":
        draw.line([(8, 14), (7, 7), (8, 3), (10, 1)], fill=(216, 112, 160), width=2)
        draw.line([(8, 12), (4, 9), (3, 5), (1, 4)], fill=(152, 72, 144), width=2)
        draw.line([(9, 13), (12, 9), (13, 5), (15, 4)], fill=(88, 192, 192), width=2)
        draw.point([(1, 4), (10, 1), (15, 4)], fill=(224, 208, 232))
    elif theme == "night":
        draw.line((8, 6, 8, 14), fill=light, width=2)
        draw.polygon([(3, 8), (4, 4), (8, 2), (12, 4), (14, 8)], fill=(112, 80, 160))
        draw.line((4, 8, 13, 8), fill=(176, 144, 232))
        draw.point([(5, 5), (9, 4), (11, 6), (2, 2)], fill=(232, 208, 248))
    else:
        gleam = (232, 112, 48) if theme == "volcano" else (112, 224, 232)
        draw.polygon([(2, 13), (4, 6), (8, 1), (12, 5), (14, 13), (8, 15)], fill=mid)
        draw.polygon([(4, 6), (8, 1), (8, 11), (2, 13)], fill=light)
        draw.line([(8, 3), (7, 8), (9, 11), (8, 13)], fill=gleam)
        draw.point([(12, 4), (4, 10)], fill=gleam)


def render_tileset_and_anim(theme: str) -> tuple[Image.Image, Image.Image]:
    """Render semantic tiles followed by eight Tiled animation frames, plus the game animation strip."""
    pal = THEME_PALETTES[theme]
    # 8 tile IDs (1..8): 1=ground, 2=ground_var, 3=path, 4=wall, 5=animated_hazard, 6=anchor_pad, 7=gate_barrier, 8=portal_pad
    ts = Image.new("RGBA", (16 * 16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(ts)
    g_col = gen3.snap(pal["ground"])
    p_col = gen3.snap(pal["path"])
    w_col = gen3.snap(pal["wall"])
    a_col = gen3.snap(pal["anim"])

    rng = random.Random(theme)
    for tile, color in enumerate((g_col, g_col, p_col, terrain_color(g_col, -24))):
        x = tile * 16
        d.rectangle((x, 0, x + 15, 15), fill=color)
        for _ in range(26):
            px, py = rng.randrange(16), rng.randrange(16)
            d.line((x + px, py, x + min(15, px + rng.randrange(3)), py), fill=terrain_color(color, rng.choice((-16, -8, 8, 16))))
    accent = {
        "meadow": (248, 224, 104), "snow": (168, 224, 248), "desert": (248, 216, 136),
        "underwater": (168, 128, 232), "volcano": (248, 128, 64),
        "night": (184, 136, 248), "aurora": (144, 248, 224),
    }[theme]
    texture = ts.crop((16, 0, 32, 16))
    detail = ImageDraw.Draw(texture)
    shadow, rim = terrain_color(g_col, -36), terrain_color(g_col, 32)
    for x, y in ((3, 5), (10, 11), (13, 3)):
        if theme in ("meadow", "underwater"):
            detail.line([(x-2,y+2),(x,y+3),(x,y),(x+1,y-2)], fill=shadow)
            detail.point([(x+1,y-2),(x-1,y),(x+2,y+1)], fill=accent)
        elif theme == "snow":
            detail.line([(x-2,y),(x,y-1),(x+2,y)], fill=rim)
            detail.line((x-2,y+1,x+2,y+1), fill=shadow)
            detail.point((x,y), fill=accent)
        elif theme == "desert":
            detail.arc((x-3,y-1,x+2,y+3), 192, 350, fill=shadow)
            detail.line((x-2,y+2,x+1,y+2), fill=rim)
        elif theme == "volcano":
            detail.line([(x-2,y-1),(x,y),(x+1,y+2),(x+2,y+2)],fill=shadow)
            detail.point((x+1,y+1), fill=accent)
        else:
            detail.line((x-1,y,x+1,y), fill=shadow)
            detail.line((x,y-1,x,y+1), fill=accent)
    ts.paste(texture,(16,0))
    prop = ts.crop((48, 0, 64, 16))
    draw_terrain_landmark(ImageDraw.Draw(prop), theme, w_col)
    ts.paste(prop, (48, 0))
    if theme in ("meadow", "underwater", "volcano", "aurora"):
        # Planks, basalt paving and prism bridges read as traversable strips.
        for y in (4, 9, 14):
            d.line((32, y, 47, y), fill=terrain_color(p_col, -24))
        d.point([(35, 2), (44, 7), (37, 12)], fill=terrain_color(p_col, 25))
        for x, y in ((36,4),(43,9),(38,14)):
            d.line((x,y-3,x,y), fill=terrain_color(p_col,-24))
            d.point((x+1,y-2), fill=terrain_color(p_col,17))
    else:
        for x, y in ((34,3),(40,9),(43,13)):
            d.line([(x,y),(x+3,y-1),(x+5,y-1)],fill=terrain_color(p_col,-16))
    # Tile 4: animated water/lava/ice/aurora base
    d.rectangle([64, 0, 79, 15], fill=a_col)
    # Tile 5: RestAnchor stone pad
    d.rectangle([80, 0, 95, 15], fill=p_col)
    d.ellipse([82, 2, 93, 13], outline=GOLD_LIT, width=1)
    # Tile 6: Gatekeeper barrier rune tile
    d.rectangle([96, 0, 111, 15], fill=p_col)
    d.line([98, 2, 109, 13], fill=ELEMENT_RAMPS["Pyre"][1], width=2)
    d.line([109, 2, 98, 13], fill=ELEMENT_RAMPS["Pyre"][1], width=2)
    # Tile 7: Boss / Warp portal pad
    d.rectangle([112, 0, 127, 15], fill=w_col)
    d.ellipse([114, 2, 125, 13], fill=ELEMENT_RAMPS["Astral"][1])

    anim = Image.new("RGBA", (16 * 8, 16), (0, 0, 0, 0))
    ad = ImageDraw.Draw(anim)
    for f in range(8):
        x0 = f * 16
        tint = terrain_color(a_col, -18 if theme == "volcano" else -42)
        ad.rectangle((x0, 0, x0+15, 15), fill=tint)
        for x, y, length in ((1, 2, 5), (7, 5, 7), (4, 9, 8), (10, 13, 4)):
            py = (y + (1, 1, 2, 2, 1, 0, 0, 0)[f]) % 16
            ad.line((x0+x, py, x0+x+length-1, py), fill=a_col)
            ad.point((x0+x+(f % length), py), fill=terrain_color(a_col, 38))
        if theme in ("night", "aurora", "underwater"):
            ad.point((x0+13, (8-f) % 16), fill=accent)
    ts.paste(anim, (128, 0))
    return finalize_gen3_sheet(ts, scale=2), finalize_gen3_sheet(anim, scale=2)


def render_structure_sprites() -> dict[str, Image.Image]:
    """Render Signature Silhouette RestAnchor Flag (128x128) and 4-frame Portal Archway (512x128)."""
    # 1. RestAnchor Flag Shrine (4 frames waving flag! 64x64 native x 4 -> 512x128 at x2)
    flag = Image.new("RGBA", (64 * 4, 64), (0, 0, 0, 0))
    for f in range(4):
        im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rectangle([18, 48, 46, 58], fill=gen3.snap((112, 120, 144)))
        d.line([28, 10, 28, 48], fill=GOLD_LIT, width=2)
        wave = [0, 2, 0, -2][f]
        d.polygon([(29, 12), (50, 16 + wave), (46, 28 - wave), (29, 26)], fill=ELEMENT_RAMPS["Astral"][1])
        d.ellipse([20, 38, 26, 48], fill=ELEMENT_RAMPS["Solar"][0])
        im = apply_silhouette_outline(im)
        flag.paste(im, (f * 64, 0))

    # 2. Realm Warp / Boss Archway (4 frames opening! 64x64 native x 4 -> 512x128 at x2)
    arch = Image.new("RGBA", (64 * 4, 64), (0, 0, 0, 0))
    for f in range(4):
        im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.arc([10, 8, 54, 60], 180, 360, fill=gen3.snap((136, 144, 176)), width=6)
        d.rectangle([10, 32, 18, 58], fill=gen3.snap((104, 112, 144)))
        d.rectangle([46, 32, 54, 58], fill=gen3.snap((104, 112, 144)))
        if f > 0:
            r = 5 + f * 4
            d.ellipse([32 - r, 36 - r, 32 + r, 36 + r], fill=ELEMENT_RAMPS["Astral"][min(3, 3 - f)])
            d.ellipse([32 - r // 2, 36 - r // 2, 32 + r // 2, 36 + r // 2], fill=WHITE)
        im = apply_silhouette_outline(im)
        arch.paste(im, (f * 64, 0))

    return {
        "rest-anchor-flag": finalize_gen3_sheet(flag, scale=2, max_colours=15),
        "realm-warp-gate": finalize_gen3_sheet(arch, scale=2, max_colours=15),
    }


def build_and_verify_tmj(realm: dict, gatekeepers: list[dict]) -> dict:
    """Build a Tiled .tmj JSON map for a RealmMap and verify BFS pathability & >=6-tile anchor safety."""
    w, h = realm["width"], realm["height"]
    # Tile GIDs: 1=ground, 2=ground_var, 3=path, 4=wall, 5=animated_liquid, 6=anchor, 7=gate_barrier, 8=portal
    theme = realm["theme"]
    rng = random.Random(realm["mapId"])
    grid = [[1 if rng.randrange(7) else 2 for x in range(w)] for y in range(h)]
    # Each theme places its pools and landmark clusters around a different route.
    layouts = {
        "meadow": ((20, 34, 9, 32), [(8,5,5,3), (9,39,8,10), (26,58,9,8), (41,31,8,7), (50,57,7,6),
                    (64,37,8,10), (75,56,9,10), (88,47,7,9), (103,19,6,7), (116,37,8,8), (109,65,6,8)]),
        "snow": ((8, 16, 10, 16), [(8, 19, 5, 3), (26, 7, 4, 4), (36, 4, 4, 2), (46, 19, 4, 3)]),
        "desert": ((15, 16, 8, 9), [(7, 5, 4, 3), (23, 5, 4, 3), (36, 19, 4, 3), (47, 18, 3, 3)]),
        "underwater": ((10, 17, 15, 8), [(9, 19, 5, 4), (25, 6, 4, 3), (36, 7, 4, 4), (46, 18, 4, 4)]),
        "volcano": ((16, 8, 17, 15), [(7, 6, 4, 3), (25, 17, 5, 4), (35, 6, 4, 3), (45, 5, 4, 3)]),
        "night": ((9, 15, 8, 16), [(8, 19, 5, 3), (22, 4, 3, 2), (36, 17, 4, 4), (46, 5, 4, 3)]),
        "aurora": ((15, 9, 16, 10), [(8, 5, 4, 3), (16, 18, 5, 4), (30, 17, 4, 4), (43, 6, 5, 3)]),
    }
    bends, basins = layouts[theme]

    for y in range(h):
        for x in range(w):
            if x < 2 or x >= w - 2 or y < 2 or y >= h - 2:
                grid[y][x] = 4
                continue
            for cx, cy, rx, ry in basins:
                radius = ((x-cx)/rx)**2 + ((y-cy)/ry)**2
                if radius < .8 + rng.random() * .18:
                    grid[y][x] = 5
                elif radius < 1.35 and rng.random() < .53:
                    grid[y][x] = 4

    def paint(x, y, radius=1):
        for py in range(max(2, y-radius), min(h-2, y+radius+1)):
            for px in range(max(2, x-radius), min(w-2, x+radius+1)):
                grid[py][px] = 3

    def trail(x0, y0, x1, y1):
        steps = max(abs(x1-x0), abs(y1-y0), 1)
        for step in range(steps+1):
            paint(round(x0+(x1-x0)*step/steps), round(y0+(y1-y0)*step/steps))

    gate_x = [gk["x"] for gk in gatekeepers]
    spine = [(2, 12), (8, 12)]
    for index, gx in enumerate(gate_x + [realm["bossAltar"]["x"]]):
        previous = spine[-1][0]
        spine.extend([((previous+gx)//2, bends[index]), (gx-2, 12), (gx+3, 12)])
    for current, following in zip(spine, spine[1:]):
        trail(*current, *following)

    if theme == "meadow":
        # Four districts, each with two paths around its terrain. Chokepoints below still partition the map.
        circuits = [
            [(9,12),(20,24),(24,41),(17,58),(9,58),(5,44),(7,24),(9,12)],
            [(34,14),(44,24),(53,33),(56,50),(54,67),(42,70),(34,59),(33,35),(34,14)],
            [(66,13),(76,18),(87,31),(88,53),(83,66),(70,66),(65,50),(66,13)],
            [(97,15),(104,27),(114,43),(112,64),(104,70),(99,56),(97,38),(97,15)],
        ]
        for circuit in circuits:
            for start, end in zip(circuit, circuit[1:]):
                trail(*start, *end)

    def carve_branch(tx, ty):
        cx, cy = min(spine, key=lambda point: abs(point[0]-tx))
        trail(cx, cy, tx, ty)
        paint(tx, ty, 2)

    for anc in realm["restAnchors"]:
        carve_branch(anc["x"], anc["y"])
        grid[anc["y"]][anc["x"]] = 6
    for ch in realm["chests"]:
        carve_branch(ch["x"], ch["y"])
        grid[ch["y"]][ch["x"]] = 3

    for x, y in realm.get("wildSpots", []):
        paint(x, y, 1)

    links = realm.get("traversal", [])
    for link in links:
        paint(*link["from"], 2)
        paint(*link["to"], 2)
        if link["id"] == "rope-fen":
            trail(65, 50, *link["from"])
    for link in links:
        ax, ay = link["from"]
        dx, dy = link["to"]
        steps = max(abs(ax-dx), abs(ay-dy))
        for step in range(1, steps):
            x = round(ax + (dx-ax)*step/steps)
            y = round(ay + (dy-ay)*step/steps)
            grid[y][x] = 5 if link["kind"] == "rope" else 4
        grid[ay][ax] = grid[dy][dx] = 3

    for index, gk in enumerate(gatekeepers):
        sx, sy = gk["x"], gk["y"]
        for py in range(sy-2, sy+3):
            grid[py][sx] = 3
        gx = sx + 1
        prior = gx
        for wy in range(2, h - 2):
            offset = 0
            if abs(wy-sy) >= 5:
                offset = round(2 * math.sin((wy-sy)*.45 + index))
            column = gx + offset
            if abs(wy-sy) > 1:
                for xx in range(min(column, prior), max(column, prior)+1):
                    grid[wy][xx] = 5 if (wy+index) % 7 < 5 else 4
            prior = column
        for bx, by in gk["gateBarrierTiles"]:
            grid[by][bx] = 7

    bx, by = realm["bossAltar"]["x"], realm["bossAltar"]["y"]
    grid[by][bx] = 8
    if realm.get("exitPortal"):
        ex, ey = realm["exitPortal"]["x"], realm["exitPortal"]["y"]
        grid[ey][ex] = 8
    if realm.get("backPortal"):
        px, py = realm["backPortal"]["x"], realm["backPortal"]["y"]
        grid[py][px] = 8

    # Safety Rule 1: Every RestAnchor MUST sit >= aggroRadius + 6 Manhattan distance from every Gatekeeper
    for anc in realm["restAnchors"]:
        for gk in gatekeepers:
            dist = abs(anc["x"] - gk["x"]) + abs(anc["y"] - gk["y"])
            min_req = gk["aggroRadius"] + 6
            if dist < min_req:
                raise ValueError(
                    f"Map {realm['mapId']} anchor {anc['anchorId']} too close to {gk['gkId']} ({dist} < {min_req})"
                )

    spawn = (realm["spawn"]["x"], realm["spawn"]["y"])
    connections = {}
    for link in links:
        a, b = tuple(link["from"]), tuple(link["to"])
        connections.setdefault(a, []).append(b)
        connections.setdefault(b, []).append(a)

    def reachable(blocked, use_links=True):
        visited = {spawn}
        q = deque([spawn])
        while q:
            cx, cy = q.popleft()
            extra = connections.get((cx,cy), []) if use_links else []
            for nx, ny in [(cx+1,cy), (cx-1,cy), (cx,cy+1), (cx,cy-1), *extra]:
                if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visited and (nx, ny) not in blocked and grid[ny][nx] not in (4, 5):
                    visited.add((nx, ny))
                    q.append((nx, ny))
        return visited

    landmarks = [("spawn", realm["spawn"]), ("boss", realm["bossAltar"])]
    landmarks.extend(("rest-anchor", point) for point in realm["restAnchors"])
    landmarks.extend(("chest", point) for point in realm["chests"])
    landmarks.extend(("gatekeeper", point) for point in gatekeepers)
    landmarks.extend((key, realm[key]) for key in ("exitPortal", "backPortal") if realm.get(key))
    visited = reachable(set(), use_links=False)
    for kind, point in landmarks:
        position = (point["x"], point["y"])
        if position not in visited or grid[position[1]][position[0]] in (4, 5, 7):
            raise ValueError(f"{realm['mapId']}: unreachable {kind} at {position}")
    for position in [*connections, *map(tuple, realm.get("wildSpots", []))]:
        if position not in visited or grid[position[1]][position[0]] not in (1, 2, 3):
            raise ValueError(f"{realm['mapId']}: blocked traversal or encounter at {position}")
    for anchor in realm["restAnchors"]:
        ax, ay = anchor["x"], anchor["y"]
        clearance = [(ax+dx,ay+dy) for dx,dy in ((1,0),(-1,0),(0,1),(0,-1))]
        if not all(point in visited for point in clearance):
            raise ValueError(f"{realm['mapId']}: rest anchor must have four clear exits")
    # Where no walking route exists, show the pocket as solid terrain instead of inviting entry.
    for y in range(h):
        for x in range(w):
            if (x,y) not in visited and grid[y][x] in (1,2,3):
                grid[y][x] = 4
    for gk in gatekeepers:
        patrol = {(gk["x"], y) for y in range(gk["y"]-2, gk["y"]+3)}
        closed = reachable({tuple(tile) for tile in gk["gateBarrierTiles"]})
        if not patrol <= closed or (bx, by) in closed:
            raise ValueError(f"{realm['mapId']}: invalid patrol or gate bypass at {gk['gkId']}")

    flat_data = [gid for row in grid for gid in row]
    tiled = {
        "compressionlevel": -1,
        "height": h,
        "width": w,
        "infinite": False,
        "orientation": "orthogonal",
        "renderorder": "right-down",
        "tiledversion": "1.10.2",
        "tileheight": 32,
        "tilewidth": 32,
        "type": "map",
        "version": "1.10",
        "nextlayerid": 4 if links else 3,
        "nextobjectid": len(landmarks)+len(links)+1,
        "properties": [
            {"name": "mapId", "type": "string", "value": realm["mapId"]},
            {"name": "theme", "type": "string", "value": realm["theme"]},
        ],
        "tilesets": [
            {
                "firstgid": 1,
                "name": f"{realm['theme']}-tileset",
                "image": f"../../overworld/{realm['theme']}-tileset.png",
                "imagewidth": 512,
                "imageheight": 32,
                "tilewidth": 32,
                "tileheight": 32,
                "tilecount": 16,
                "columns": 16,
                "tiles": [{"id": 4, "animation": [{"tileid": i, "duration": 135} for i in range(8, 16)]}],
            }
        ],
        "layers": [
            {
                "id": 1,
                "name": "ground",
                "type": "tilelayer",
                "visible": True,
                "opacity": 1,
                "x": 0,
                "y": 0,
                "width": w,
                "height": h,
                "data": flat_data,
            },
            {
                "id": 2,
                "name": "landmarks",
                "type": "objectgroup",
                "visible": True,
                "opacity": 1,
                "objects": [
                    {"id": i, "name": point.get("gkId") or point.get("anchorId") or point.get("chestId") or kind,
                     "type": kind, "point": True, "x": 32*point["x"]+16, "y": 32*point["y"]+16,
                     "width": 0, "height": 0, "rotation": 0, "visible": True}
                    for i, (kind, point) in enumerate(landmarks, 1)
                ],
            },
            *([{"id": 3, "name": "traversal", "type": "objectgroup", "visible": True, "opacity": 1, "objects": [
                {"id": len(landmarks)+i+1, "name": link["id"], "type": link["kind"], "point": True, "visible": True,
                 "x": link["from"][0]*32+16, "y": link["from"][1]*32+16,
                 "properties": [
                     {"name": "toX", "type": "int", "value": link["to"][0]},
                     {"name": "toY", "type": "int", "value": link["to"][1]},
                 ]}
                for i, link in enumerate(links)
            ]}] if links else []),
        ],
    }
    if theme == "meadow":
        add_meadow_landscape(tiled)
    return tiled
