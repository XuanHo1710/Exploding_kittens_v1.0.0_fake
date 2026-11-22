#!/usr/bin/env python3
"""
Review a theme's nature kit composed on a small scene (look only, never an asset).

  python3 review_kit.py [theme ...]          (default: every theme in themes.json)

For each theme it lays out one 44x30 map with the theme's own roles (frame, lane, tall grass, a plateau
with its rock face and stairs, a pond fed by a creek when the kit has `stream`, a tide pool on coast
themes), runs the organic passes `vary`, `forest_edge` and `decorate` with the theme's `nature` kit,
and writes assets/overworld/_preview/review-kit-<theme>.png: the scene on top, then a strip with every piece
of the kit (its ground patches as swatches, then its props) on the theme's lawn. Nothing is written
to assets/maps/.
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mapgen as MG  # noqa: E402

GO, K = MG.GO, MG.K
TS = MG.TS
PREVIEW = os.path.join(MG.OVERWORLD, "_preview")


def scene_spec(theme):
    kit = MG.THEMES[theme].get("nature", {})
    W, H = 44, 30
    ops = [{"op": "frame", "t": "@wall", "thick": 4},
           {"op": "exit", "side": "S", "at": 19, "width": 6, "t": "@path", "name": "S"},
           {"op": "exit", "side": "N", "at": 22, "width": 6, "t": "@path", "name": "N"},
           {"op": "path", "t": "@path", "width": 3, "points": [[20, 25], [20, 15], [23, 15], [23, 4]]},
           {"op": "plateau", "box": [5, 5, 16, 11]},
           {"op": "blob", "t": "@grass", "center": [10, 21], "r": [4, 3.2], "keep": True}]
    if "tidepool" in kit.get("route", []):
        ops.append({"op": "pond", "center": [35, 8.5], "r": [3, 2.2], "bank": 0.5, "lobes": 3})
    ops.append({"op": "pond", "center": [33.5, 21], "r": [4.2, 2.8]})
    if kit.get("stream"):
        ops.append({"op": "stream", "points": [[39, 9], [36, 14], [33.5, 20]], "width": 2, "wobble": 1.4})
    ops += [{"op": "vary"}, {"op": "forest_edge"}, {"op": "decorate", "max": 2}]
    return dict(slug=f"review-kit-{theme}", kind="route", theme=theme, size=[W, H], seed=3, home="S", ops=ops)


def kit_pieces(theme):
    """(patch terrains, props) named anywhere in the theme's nature kit, in kit order."""
    kit = MG.THEMES[theme].get("nature", {})
    terr = [v[0] for v in kit.get("vary", [])]
    props = []

    def add(s):
        if isinstance(s, str) and s in GO.PROPS and s not in props:
            props.append(s)
    for s in kit.get("swap", {}).values():
        add(s)
    for s in kit.get("flowers", []):
        add(s)
    for key in ("trees", "floor", "bushes"):
        for s in kit.get(key, []):
            add(s[0] if isinstance(s, list) else s)
    for s in kit.get("canopy", []):
        add(s)
    for ctx in list(kit.get("more", {}).values()) + list(kit.get("kits", {}).values()):
        for vig in ctx:
            for pool, *_ in vig:
                for s in (pool if isinstance(pool, list) else [pool]):
                    add(s)
    return terr, props


def strip(theme, ground, width):
    """The kit's patches (4x2-cell swatches with a feathered edge) and props on the theme lawn."""
    terr, props = kit_pieces(theme)
    cols = width // TS
    cells, x, y, rowh = [], 1, 1, 1
    place = []
    for s in props:
        w, h = GO.PROPS[s]["cells"]
        if x + w >= cols:
            x, y = 1, y + rowh + 1
            rowh = 1
        place.append((s, x, y + h - 1))
        rowh = max(rowh, h)
        x += w + 1
    top = y + rowh + 1
    rows = top + 5
    scene = [["."] * cols for _ in range(rows)]
    chars = {}
    for i, s in enumerate(terr):
        ch = "abcdefgh"[i]
        chars[ch] = s
        x0 = 1 + i * 8
        for yy in range(top, top + 3):
            for xx in range(x0, x0 + 6):
                if xx < cols:
                    scene[yy][xx] = ch
    scene = ["".join(r) for r in scene]
    sheets = {s: GO.build_terrain(s)[0] for s in set(chars.values()) | {ground}}
    ov = {s: GO.build_terrain(s, overlay=True)[0] for s in set(chars.values())}
    for s, _, _ in place:
        sheets[s] = GO.prop_frames(s, resolve=False)[0]
    return K.up(GO.render_scene(sheets, scene, chars, place, [], ground=ground, ov_sheets=ov))


def review(theme):
    m = MG.Map(scene_spec(theme), None)
    for op in m.spec["ops"]:
        m.apply(op)
    img = MG.render(m)
    s = strip(theme, m.ground, img.width // 2)
    out = Image.new("RGBA", (img.width, img.height + s.height + 8), (30, 28, 38, 255))
    out.paste(img, (0, 0))
    out.paste(s, (0, img.height + 8))
    path = os.path.join(PREVIEW, f"review-kit-{theme}.png")
    out.save(path)
    errs = m.errors + [w for w in m.warns if "skipped" not in w]
    print(f"{theme:11s} -> {os.path.relpath(path, MG.REPO)}  {'; '.join(m.notes[-3:])[:160]}"
          + (f"  ERRORS {errs}" if m.errors else ""))
    return m


if __name__ == "__main__":
    os.makedirs(PREVIEW, exist_ok=True)
    for th in sys.argv[1:] or [t for t in MG.THEMES if not t.startswith("_") and "nature" in MG.THEMES[t]]:
        review(th)
