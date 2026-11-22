#!/usr/bin/env python3
"""
Export the Mons UI kit (uikit.py) as game assets, native pixels (the engine scales the whole
screen by an integer: x6 for 1080 px), plus designer previews.

Usage:  draw_ui.py [--out-root assets/ui]
Writes:
  assets/ui/ui.json                         screens, palette, District accents, HP thresholds, menus
  assets/ui/Font/mons-font.png + .json      white glyph atlas (ASCII + every Vietnamese letter), BMFont-like metrics
  assets/ui/Windows/<district>/*.png        window (9-slice), tab, menu card (+ selected), command button (+ selected),
                                     level badge (3-slice), touch d-pad, A button, menu button; slices in ui.json
  assets/ui/HUD/*.png                       battle panels (one row per type), HP frame + cells, dock tile, B button
  assets/ui/Icons/icons.png                 white 9x9 icons (tint in the engine), order in ui.json
  assets/ui/Types/<type>.png                18 type labels (Vietnamese)
  assets/ui/Badges/<gym>-badge[-small|-locked].png  8 gym badges (tools/ui/badges.py), one silhouette per District
  assets/ui/Items/<item>.png + items.json   24x24 bag icons (items.py)
  assets/ui/MonIcons/                       32x32 party icons, 2 frames (mon_icons.py, run separately: ~2 min)
  assets/ui/_preview/*.png                  PC and phone screens: overworld, battle, bag, summary, Mondex, title (x4, review only)
"""
import argparse
import json
import os
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from PIL import Image, ImageDraw  # noqa: E402

import monsfont as F  # noqa: E402
import uikit as U  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    U.finish(img).save(path)
    return path


# ---------------------------------------------------------------- font
FONT_ABOVE, FONT_CELL_H = 5, 15


def font_chars():
    chars = [c for c in F.G if len(c) == 1 and c not in "é"]
    vowels = "aăâeêioôơuưy"
    tones = ["", "́", "̀", "̉", "̃", "̣"]
    for v in vowels + vowels.upper():
        for t in tones:
            c = unicodedata.normalize("NFC", v + t)
            if c not in chars:
                chars.append(c)
    return chars


def export_font(root):
    chars = font_chars()
    glyphs = {}
    cells = []
    for c in chars:
        (base, marks), = F.CLUSTERS(c)
        pix, w = F.GLYPH(base, marks)
        cells.append((c, pix, w))
    per_row = 24
    cw = max(w for _, _, w in cells) + 1
    rows = (len(cells) + per_row - 1) // per_row
    atlas = U.canvas(per_row * cw, rows * FONT_CELL_H)
    for i, (c, pix, w) in enumerate(cells):
        x0, y0 = (i % per_row) * cw, (i // per_row) * FONT_CELL_H
        for x, y in pix:
            atlas.putpixel((x0 + x, y0 + FONT_ABOVE + y), (255, 255, 255, 255))
        glyphs[c] = {"x": x0, "y": y0, "w": w, "h": FONT_CELL_H, "xadvance": w + 1}
    save(atlas, os.path.join(root, "Font", "mons-font.png"))
    meta = {
        "atlas": "mons-font.png", "line_height": 16, "cell_h": FONT_CELL_H,
        "baseline_from_cell_top": FONT_ABOVE + 7, "cap_top_from_cell_top": FONT_ABOVE,
        "space_advance": F.SPACE + 1,
        "draw": "glyphs are white masks: draw the shadow colour at offsets [1,0],[0,1],[1,1], then the ink at [0,0]",
        "colours": {"text": U.TEXT, "text_shadow": U.TEXT_SH, "on_accent": U.WHITE},
        "glyphs": glyphs,
    }
    with open(os.path.join(root, "Font", "mons-font.json"), "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    return len(glyphs)


# ---------------------------------------------------------------- per-District frames
def export_district(root, name, acc):
    out = os.path.join(root, "Windows", name)
    img = U.canvas(24, 24)
    U.window(img, 0, 0, 24, 24, acc, rule=False)
    save(img, os.path.join(out, "window.png"))
    img = U.canvas(28, 12)
    U.tab(img, 0, 0, "", acc, w=23)
    save(img, os.path.join(out, "tab.png"))
    for sel in (False, True):
        img = U.canvas(24, 14)
        U.card(img, 0, 0, 24, 14, acc, sel)
        save(img, os.path.join(out, "menu-card" + ("-selected" if sel else "") + ".png"))
        img = U.canvas(24, 22)
        d = ImageDraw.Draw(img)
        U.chamfer(d, 0, 0, 23, 21, U.INK, 5)
        U.chamfer(d, 1, 1, 22, 20, acc[1] if sel else U.CREAM, 4)
        save(img, os.path.join(out, "command" + ("-selected" if sel else "") + ".png"))
    img = U.canvas(21, 13)
    U.hexa(img, 0, 0, "", acc, w=16)
    save(img, os.path.join(out, "level-badge.png"))
    img = U.canvas(42, 42)
    U.dpad(img, 0, 0, acc)
    save(img, os.path.join(out, "touch-dpad.png"))
    img = U.canvas(23, 23)
    U.round_button(img, 11, 11, 11, "A", acc[1])
    save(img, os.path.join(out, "touch-a.png"))
    img = U.canvas(18, 16)
    U.menu_button(img, 0, 0, acc)
    save(img, os.path.join(out, "touch-menu.png"))


def export_hud(root):
    out = os.path.join(root, "HUD")
    for kind, (w, h, flip) in {"panel-foe": (120, 26, False), "panel-player": (120, 36, True)}.items():
        img = U.canvas(w, h * len(U.TYPES))
        for i, (slug, _, c) in enumerate(U.TYPES):
            U.slant(img, 0, i * h, w, h, c, flip)
        save(img, os.path.join(out, kind + ".png"))
    img = U.canvas(U.HP_SEGS * U.HP_SEG_W + 2, 6)
    ImageDraw.Draw(img).rectangle([0, 0, img.width - 1, 5], fill=U.INK)
    save(img, os.path.join(out, "hp-frame.png"))
    img = U.canvas(4 * 4, 4)
    for i, st in enumerate(("high", "mid", "low", "empty")):
        U.hp_cell(img, i * 4, 0, st)
    save(img, os.path.join(out, "hp-cells.png"))
    img = U.canvas(60, 70)
    U.dock(img, 0, 60, 70)
    save(img, os.path.join(out, "dock.png"))
    img = U.canvas(23, 23)
    U.round_button(img, 11, 11, 11, "B", U.CREAM, ink=U.INK, sh=U.CREAM_D)
    save(img, os.path.join(out, "touch-b.png"))


def export_icons(root):
    names = list(U.ICONS)
    img = U.canvas(len(names) * 10, 9)
    for i, n in enumerate(names):
        U.icon(img, i * 10, 0, n, U.WHITE)
    save(img, os.path.join(root, "Icons", "icons.png"))
    for slug, _, _ in U.TYPES:
        img = U.canvas(U.TYPE_W, U.TYPE_H)
        U.type_icon(img, 0, 0, slug)
        save(img, os.path.join(root, "Types", slug + ".png"))
    import items as IT
    for slug, name, *_ in U.ITEMS:
        save(IT.item(slug), os.path.join(root, "Items", slug + ".png"))
    # drawn icons first; icons imported by tools/ui/import_item_icons.py ("source": "reference") are kept
    path = os.path.join(root, "Items", "items.json")
    old = json.load(open(path, encoding="utf-8")).get("items", {}) if os.path.exists(path) else {}
    items = {s: {"name": n, "source": "drawn"} for s, n, *_ in U.ITEMS}
    items.update({k: v for k, v in old.items() if isinstance(v, dict) and v.get("source") == "reference" and k not in items})
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"size": [IT.S, IT.S], "items": items}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    import badges                      # gym badges: 32 px, 16 px and locked silhouettes (tools/ui/badges.py)
    badges.export(os.path.join(root, "Badges"))
    return names


def export_meta(root, icons, nglyphs):
    meta = {
        "screens": {k: {"native": [w, h], "scale": s, "output": [w * s, h * s]} for k, (w, h, s) in U.SCREENS.items()},
        "palette": {"ink": U.INK, "ink2": U.INK2, "cream": U.CREAM, "cream_dark": U.CREAM_D, "white": U.WHITE,
                    "text": U.TEXT, "text_shadow": U.TEXT_SH, "male": U.MALE, "female": U.FEMALE, "exp": U.EXP},
        "district_accents": {k: {"light": v[0], "mid": v[1], "dark": v[2]} for k, v in U.ACCENT.items()},
        "slices": {"window": 8, "tab": [6, 6], "menu-card": [4, 4], "command": 6, "level-badge": [6, 6]},
        "hp": {"segments": U.HP_SEGS, "cell_w": U.HP_SEG_W, "cells_order": ["high", "mid", "low", "empty"],
               "high_above": 0.5, "mid_above": 0.2, "colours": U.HP},
        "panels": {"order": [s for s, _, _ in U.TYPES], "foe_h": 26, "player_h": 36},
        "types": {s: {"label": lab, "colour": c} for s, lab, c in U.TYPES},
        "icons": {"file": "Icons/icons.png", "size": 9, "stride": 10, "order": icons},
        "start_menu": [{"icon": i, "label": t} for i, t in U.START_MENU],
        "battle_menu": [{"icon": i, "label": t} for i, t in U.BATTLE_MENU],
        "font": {"file": "Font/mons-font.json", "glyphs": nglyphs},
        "language": "vi",
    }
    with open(os.path.join(root, "ui.json"), "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-root", default=os.path.join(REPO, "assets", "ui"))
    a = ap.parse_args()
    n = export_font(a.out_root)
    for name, acc in U.ACCENT.items():
        export_district(a.out_root, name, acc)
    export_hud(a.out_root)
    icons = export_icons(a.out_root)
    export_meta(a.out_root, icons, n)
    import previews
    import screens
    previews.render_all(os.path.join(a.out_root, "_preview"))
    screens.render_all(os.path.join(a.out_root, "_preview"))
    print(f"UI kit written to {os.path.relpath(a.out_root, REPO)}: {n} glyphs, {len(U.ACCENT)} Districts")


if __name__ == "__main__":
    main()
