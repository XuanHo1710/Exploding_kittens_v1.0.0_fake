r"""Dựng lại toàn bộ sprite sheet trong database-astral-expedition/units/ từ roster + rig 3D.

  .\.venv\Scripts\python.exe tools/expedition/build_units.py                 # tất cả
  .\.venv\Scripts\python.exe tools/expedition/build_units.py --only gale_wolf,chicken
  .\.venv\Scripts\python.exe tools/expedition/build_units.py --jobs 8 --preview tmp/units-review

Bố cục (prompts/battle/README.md, prompts/movement/README.md):
  heroes       <id>-battle.png 1152x1152 (6x6 @192, BACK) · <id>-movement.png 384x512 (6x8 @64) · <id>-portrait.png 128x128
  gatekeepers  <id>-battle.png 1152x768  (6x4 @192, FRONT) · <id>-movement.png 384x256 (6x4 @64 walk)
  bosses       <id>-battle.png 1536x1536 (6x6 @256, FRONT)
  monsters     như gatekeepers
  animals      như gatekeepers

Sheet vẽ tay trong art-source/motion/ (`art` trong roster) được chép nguyên vào units/ và thắng bản dựng từ rig.
Script cũng ghi data/expedition/units.json và cập nhật các mục units/ trong manifest.json.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from concurrent.futures import ProcessPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
PYDEPS = os.path.abspath(os.path.join(HERE, "..", "units", ".pydeps"))
for _p in (PYDEPS, HERE):
    if os.path.isdir(_p) and _p not in sys.path:
        sys.path.insert(0, _p)

from PIL import Image, ImageDraw  # noqa: E402

import anims  # noqa: E402
from pixel_rig import OUTLINE, Camera, Model, Mat, ground, limit_palette, m_apply, m_mul, render, rot_x, rot_z, v_add, v_sub  # noqa: E402
from rig_beasts import build_arthropod, build_blob, build_flyer, build_floater, build_quadruped, build_serpent  # noqa: E402
from rig_humanoid import G_LEG_L, G_LEG_R, build_humanoid, place  # noqa: E402
from roster import ALL_UNITS, FX, UNITS_BY_ID  # noqa: E402
from art_source import export_one, save_source, write_readme  # noqa: E402

BUNDLE = os.path.join(REPO, "database-astral-expedition")
ART = os.path.join(BUNDLE, "art-source", "motion")
DATA = os.path.join(REPO, "data", "expedition")

YAW_BACK, YAW_FRONT = 135.0, -45.0
MOVE_YAWS = (0.0, -90.0, 90.0, 180.0)  # rows: DOWN, LEFT, RIGHT, UP
CELL = {"heroes": 192, "gatekeepers": 192, "monsters": 192, "animals": 192, "bosses": 256}
BASE = {192: 160, 256: 226, 64: 58, 128: 0}
MOVE_HUMAN_H = 46.0

BUILDERS = {
    "quadruped": build_quadruped,
    "blob": build_blob,
    "serpent": build_serpent,
    "arthropod": build_arthropod,
    "flyer": build_flyer,
    "floater": build_floater,
}


# ---------------------------------------------------------------- model assembly per rig


def size_of(unit):
    s = unit["spec"]
    if unit["rig"] == "humanoid":
        return s["H"]
    if unit["rig"] == "rider":
        return s["mount"]["S"]
    if unit["rig"] == "arachne":
        return s["spider"]["S"]
    return s["S"]


SEAT_KEEP = ("rs_p", "rs_r", "re", "ls_p", "ls_r", "le", "w_p", "w_r", "o_p", "o_r", "two_hand", "twist", "head_p", "head_y", "phase", "wind", "fx", "draw")


def _rider_pose(p, lean_extra=0.0):
    q = {k: v for k, v in p.items() if k in SEAT_KEEP}
    q.update(anims.LEGS["seat"])
    q["lean"] = 8 + lean_extra + (p.get("lean", 0) - 6) * 0.5
    return q


def model_for(unit, pose, mount_pose=None):
    rig = unit["rig"]
    spec = unit["spec"]
    if rig == "humanoid":
        return place(build_humanoid(spec, pose), pose, spec["H"])
    if rig in BUILDERS:
        return place(BUILDERS[rig](spec, pose), pose, spec["S"])
    if rig == "rider":
        mp = dict(mount_pose or {})
        roll, lift = mp.pop("roll", 0.0), mp.pop("lift", 0.0)
        mount = build_quadruped(spec["mount"], mp)
        seat = mp.get("_seat", (0.0, spec["mount"]["S"] * 0.6, 0.0))
        rider_spec = spec["rider"]
        rp = _rider_pose(pose)
        rider = build_humanoid(rider_spec, rp)
        H = rider_spec["H"]
        dx = v_sub(seat, (0.0, 0.5 * H - 0.02 * H, 0.0))
        rider = rider.transformed(lambda q: v_add(q, dx))
        mount.extend(rider)
        return place(mount, {"roll": roll, "lift": lift}, spec["mount"]["S"])
    if rig == "arachne":
        sp = dict(mount_pose or {})
        roll = min(sp.pop("roll", 0.0), 35.0)
        lift = sp.pop("lift", 0.0)
        spider_spec = spec["spider"]
        S = spider_spec["S"]
        spider = build_arthropod(spider_spec, sp)
        rider_spec = spec["rider"]
        H = rider_spec["H"]
        rp = {k: v for k, v in pose.items() if k not in ("root_x", "root_z", "lift", "fall", "roll")}
        upper = build_humanoid(rider_spec, rp)
        upper.items = [it for it in upper.items if not (it[0] in ("cap", "ell", "tri") and it[-1] in (G_LEG_L, G_LEG_R))]
        h = 0.20 * S + sp.get("bob", 0.0) * S
        Rb = rot_x(-sp.get("body_p", 0.0))
        anchor = v_add((0.0, h, sp.get("root_z", 0.0) * S), m_apply(Rb, (0.0, 0.10 * S, 0.20 * S)))
        dx = v_sub(anchor, (0.0, 0.5 * H, 0.0))
        upper = upper.transformed(lambda q: v_add(q, dx))
        spider.extend(upper)
        return place(spider, {"roll": roll, "lift": lift}, S)
    raise ValueError(rig)


# ---------------------------------------------------------------- pose tables


def battle_rows(unit):
    cat, rig, style = unit["category"], unit["rig"], unit.get("style")
    if rig == "humanoid":
        if cat == "heroes":
            return anims.hero_rows(style), None
        if cat == "bosses":
            return anims.boss_rows(style), None
        return anims.enemy_rows(style), None
    if rig == "quadruped":
        rows = anims.quad_rows(style or "pounce")
        return (anims.boss_from_enemy(rows) if cat == "bosses" else rows), None
    if rig == "rider":
        return anims.enemy_rows(style), anims.quad_rows("charge")
    if rig == "arachne":
        return anims.boss_rows(style), anims.boss_from_enemy(anims.generic_rows("arthropod"))
    rows = anims.generic_rows(rig)
    return (anims.boss_from_enemy(rows) if cat == "bosses" else rows), None


def move_rows(unit):
    """Returns list of rows; each row = (yaw, [(pose, mount_pose)] * 6)."""
    rig, style = unit["rig"], unit.get("style")
    rows = []
    loops = ("idle", "walk") if unit["category"] == "heroes" else ("walk",)
    for loop in loops:
        for yaw in MOVE_YAWS:
            frames = []
            for i in range(6):
                if rig == "humanoid":
                    p = anims.humanoid_idle(style, i) if loop == "idle" else anims.humanoid_walk(style, i)
                    frames.append((p, None))
                elif rig == "quadruped":
                    frames.append((anims.quad_walk(i), None))
                elif rig == "rider":
                    frames.append((anims.humanoid_idle(style, i), anims.quad_walk(i)))
                else:
                    frames.append((anims.generic_walk(rig, i), None))
            rows.append((yaw, frames))
    return rows


# ---------------------------------------------------------------- render sheets


def _frame(unit, pose, mpose, cam, cell):
    m = model_for(unit, dict(pose), dict(mpose) if mpose is not None else None)
    return render(m, cam, cell, cell)


def fit(unit, frames, cell, want_scale, base, pitch, idle_safe=0.82):
    """One (scale, cx, base_y) for a whole sheet. `frames` = [(pose, mount_pose, yaw), ...].
    The idle frame (first) must fit `idle_safe` of the cell; the union of every frame must fit
    the cell with a 2 px margin; the union is centred horizontally and kept on the baseline."""
    big = cell * 3
    bx, by = big / 2, big * 0.75
    union = None
    idle = None
    for i, (pose, mpose, yaw) in enumerate(frames):
        cam = Camera(bx, by, yaw, pitch=pitch, scale=want_scale)
        bb = _frame(unit, pose, mpose, cam, big).getbbox()
        if not bb:
            continue
        if i == 0:
            idle = bb
        union = bb if union is None else (min(union[0], bb[0]), min(union[1], bb[1]), max(union[2], bb[2]), max(union[3], bb[3]))
    if union is None:
        return want_scale, cell / 2, base
    k_idle = 1.0
    if idle:
        k_idle = min(1.0, idle_safe * cell / max(1, idle[3] - idle[1]), idle_safe * cell / max(1, idle[2] - idle[0]))
    k_union = min((cell - 4) / max(1, union[2] - union[0]), (cell - 4) / max(1, union[3] - union[1]))
    k = min(k_idle, k_union) * 0.97
    fill = unit["spec"].get("battle_fill") if cell >= 192 else None
    if fill and idle:
        # nhân vật cần to bằng tranh vẽ tay: ưu tiên dáng đứng chiếm `fill` ô, cho phép mũi vũ khí sát mép
        k = min(fill * cell / max(1, idle[3] - idle[1]), k_union * 1.22)
    cx = cell / 2 - ((union[0] + union[2]) / 2 - bx) * k
    top, bot = (union[1] - by) * k, (union[3] - by) * k
    # feet stay on the cell floor first; only then lower the baseline to make room overhead
    base_y = min(max(base, 3 - top), cell - 3 - bot)
    return want_scale * k, cx, base_y


def render_battle(unit):
    cat = unit["category"]
    cell = CELL[cat]
    rows, mrows = battle_rows(unit)
    yaw = YAW_BACK if cat == "heroes" else YAW_FRONT
    size = size_of(unit)

    def mp(r, f):
        return mrows[min(r, len(mrows) - 1)][f] if mrows is not None else None

    frames = [(pose, mp(r, f), yaw) for r, row in enumerate(rows) for f, pose in enumerate(row)]
    scale, cx, base_y = fit(unit, frames, cell, 1.0, BASE[cell], 20.0, idle_safe=0.80 if cat != "bosses" else 0.84)
    sheet = Image.new("RGBA", (cell * 6, cell * len(rows)), (0, 0, 0, 0))
    for r, row in enumerate(rows):
        for f, pose in enumerate(row):
            mpose = mp(r, f)
            cam = Camera(cx, base_y, yaw, pitch=20.0, scale=scale)
            im = _frame(unit, pose, mpose, cam, cell)
            sheet.alpha_composite(im, (f * cell, r * cell))
    return limit_palette(sheet, 15), size


def render_movement(unit):
    rows = move_rows(unit)
    cell = 64
    size = size_of(unit)
    if unit["rig"] == "humanoid":
        scale = MOVE_HUMAN_H / 118.0 * (unit["spec"]["H"] / 118.0) ** 0.35
    elif unit["rig"] == "rider":
        scale = 0.31
    else:
        scale = 0.40
    # one scale + anchor for all directions so the unit keeps its size while turning
    allf = [(pose, mpose, yaw) for yaw, frames in rows for pose, mpose in frames]
    scale, cx, base_y = fit(unit, allf, cell, scale, BASE[64], 30.0, idle_safe=0.86)
    sheet = Image.new("RGBA", (cell * 6, cell * len(rows)), (0, 0, 0, 0))
    for r, (yaw, frames) in enumerate(rows):
        for f, (pose, mpose) in enumerate(frames):
            cam = Camera(cx, base_y, yaw, pitch=30.0, scale=scale)
            im = _frame(unit, pose, mpose, cam, cell)
            sheet.alpha_composite(im, (f * cell, r * cell))
    return limit_palette(sheet, 15)


def render_portrait(unit):
    spec = unit["spec"]
    el = unit["element"]
    H = spec["H"]
    scale = 300.0 / H
    bg = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    d = ImageDraw.Draw(bg)
    deep = Mat(FX[el]["glow"]).ramp[3]
    mid = Mat(FX[el]["glow"]).ramp[2]
    lite = Mat(FX[el]["glow"]).ramp[0]
    d.rounded_rectangle([0, 0, 127, 127], radius=10, fill=deep + (255,), outline=OUTLINE + (255,), width=2)
    d.polygon([(2, 96), (96, 2), (127, 2), (127, 30), (30, 127), (2, 127)], fill=mid + (255,))
    d.rounded_rectangle([2, 2, 125, 125], radius=9, outline=lite + (255,), width=1)
    pose = anims.humanoid_idle(unit.get("style"), 0)
    pose.update(rs_p=4, re=10, ls_p=4, le=10, two_hand=False, lean=2, head_p=-4, wind=0.2, face_detail=True)
    bust = dict(spec)
    bust.pop("weapon", None)
    bust.pop("offhand", None)
    m = place(build_humanoid(bust, pose), pose, H)
    # head centre (~0.925 H above the ground) lands at y 60
    cam = Camera(64, 60 + 0.925 * H * scale * math.cos(math.radians(8)), -22.0, pitch=8.0, scale=scale)
    fig = render(m, cam, 128, 128)
    bg.alpha_composite(fig)
    # re-mask corners outside the rounded frame
    mask = Image.new("L", (128, 128), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, 127, 127], radius=10, fill=255)
    out = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    out.paste(bg, (0, 0), mask)
    d2 = ImageDraw.Draw(out)
    d2.rounded_rectangle([0, 0, 127, 127], radius=10, outline=OUTLINE + (255,), width=2)
    return limit_palette(out, 15)


def edge_hits(sheet, cell):
    """Opaque pixels touching a cell border = art cut off by the canvas (prompts: safe box)."""
    px = sheet.load()
    hits = 0
    for cy in range(0, sheet.height, cell):
        for cx in range(0, sheet.width, cell):
            for t in range(cell):
                for x, y in ((cx + t, cy), (cx + t, cy + cell - 1), (cx, cy + t), (cx + cell - 1, cy + t)):
                    if px[x, y][3]:
                        hits += 1
    return hits


def _art(name, expect=None):
    with Image.open(os.path.join(ART, name)) as im:
        if expect and im.size != expect:
            raise ValueError(f"{name}: expected {expect}, got {im.size}")
        return im.convert("RGBA")


def art_override(unit, sheet):
    """Prefer a reviewed redraw, then the roster's original hand-painted sheet."""
    filename = f"redraw/{unit['id']}-{sheet}.png"
    if os.path.isfile(os.path.join(ART, filename)):
        return filename
    return (unit.get("art") or {}).get(sheet)


def _publish(rel, img, size):
    """Write art-source/<rel>-source.png (flat #FF00FF) and export it 1-1 onto <rel>."""
    save_source(rel, img)
    export_one(rel, size)
    return rel


def build_unit(uid):
    unit = UNITS_BY_ID[uid]
    cat = unit["category"]
    art = unit.get("art") or {}
    written = []
    cell = CELL[cat]
    rows = 6 if cat in ("heroes", "bosses") else 4
    bsize = (cell * 6, cell * rows)
    battle_art = art_override(unit, "battle")
    if battle_art:
        sheet = _art(battle_art, bsize)
    else:
        sheet = render_battle(unit)[0]
        n = edge_hits(sheet, cell)
        if n:
            print(f"WARN {uid}-battle: {n} px touch a cell edge", file=sys.stderr)
    written.append(_publish(f"units/{cat}/{uid}-battle.png", sheet, bsize))
    if cat != "bosses":
        msize = (384, 512 if cat == "heroes" else 256)
        movement_art = art_override(unit, "movement")
        if movement_art:
            sheet = _art(movement_art, msize)
        else:
            sheet = render_movement(unit)
            n = edge_hits(sheet, 64)
            if n:
                print(f"WARN {uid}-movement: {n} px touch a cell edge", file=sys.stderr)
        written.append(_publish(f"units/{cat}/{uid}-movement.png", sheet, msize))
    if cat == "heroes":
        portrait_art = art_override(unit, "portrait")
        portrait = _art(portrait_art, (128, 128)) if portrait_art else render_portrait(unit)
        written.append(_publish(f"units/heroes/{uid}-portrait.png", portrait, (128, 128)))
    for target, name in (art.get("extra") or {}).items():
        im = _art(name)
        written.append(_publish(f"units/{cat}/{target}", im, im.size))
    return uid, written


# ---------------------------------------------------------------- catalog + manifest


def unit_kind(u):
    """human = playable heroes and human enemies (spec kind="human"); else boss / animal / monster."""
    cat = u["category"]
    if cat == "heroes" or u["spec"].get("kind") == "human" or (u["rig"] == "rider"):
        return "human" if cat != "bosses" else "boss"
    return "boss" if cat == "bosses" else "monster"


def unit_catalog():
    out = []
    for u in ALL_UNITS:
        cat = u["category"]
        battle_art = art_override(u, "battle")
        movement_art = art_override(u, "movement")
        cell = CELL[cat]
        rows = 6 if cat in ("heroes", "bosses") else 4
        entry = {
            "unitId": u["id"],
            "category": cat,
            "nameVi": u["nameVi"],
            "element": u["element"],
            "realm": u.get("realm"),
            "rig": u["rig"],
            "kind": unit_kind(u),
            "battle": {
                "path": f"units/{cat}/{u['id']}-battle.png",
                "cell": cell,
                "cols": 6,
                "rows": rows,
                "view": "BACK" if cat == "heroes" else "FRONT",
                "rowKeys": list(anims.HERO_ROWS if cat == "heroes" else (anims.BOSS_ROWS if cat == "bosses" else anims.ENEMY_ROWS)),
                "source": "art-source/motion/" + battle_art if battle_art else "rig",
            },
        }
        if cat != "bosses":
            entry["movement"] = {
                "path": f"units/{cat}/{u['id']}-movement.png",
                "cell": 64,
                "cols": 6,
                "rows": 8 if cat == "heroes" else 4,
                "rowKeys": (["IDLE_DOWN", "IDLE_LEFT", "IDLE_RIGHT", "IDLE_UP"] if cat == "heroes" else []) + ["WALK_DOWN", "WALK_LEFT", "WALK_RIGHT", "WALK_UP"],
                "source": "art-source/motion/" + movement_art if movement_art else "rig",
            }
        if cat == "heroes":
            entry["portrait"] = {"path": f"units/heroes/{u['id']}-portrait.png", "size": 128}
        extra = (u.get("art") or {}).get("extra")
        if extra:
            entry["extraSheets"] = [f"units/{cat}/{k}" for k in extra]
        out.append(entry)
    return out


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def update_manifest():
    path = os.path.join(BUNDLE, "manifest.json")
    with open(path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    files = {k: v for k, v in manifest.get("files", {}).items() if not k.startswith("units/")}
    for root, _dirs, names in os.walk(os.path.join(BUNDLE, "units")):
        for fn in sorted(names):
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, BUNDLE).replace("\\", "/")
            entry = {"sha256": sha256_file(full), "bytes": os.path.getsize(full)}
            if fn.endswith(".png"):
                with Image.open(full) as im:
                    entry["width"], entry["height"] = im.width, im.height
            files[rel] = entry
    manifest["files"] = dict(sorted(files.items()))
    counts = {}
    for u in ALL_UNITS:
        counts[u["category"]] = counts.get(u["category"], 0) + 1
    manifest["heroCount"] = counts.get("heroes", 0)
    manifest["bossCount"] = counts.get("bosses", 0)
    manifest["gatekeeperArchetypes"] = counts.get("gatekeepers", 0)
    manifest["monsterCount"] = counts.get("monsters", 0)
    manifest["animalCount"] = counts.get("animals", 0)
    manifest["unitCount"] = len(ALL_UNITS)
    manifest["totalFiles"] = len(files)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")


def write_catalog():
    os.makedirs(DATA, exist_ok=True)
    with open(os.path.join(DATA, "units.json"), "w", encoding="utf-8") as f:
        json.dump(unit_catalog(), f, ensure_ascii=False, indent=2)
        f.write("\n")


# ---------------------------------------------------------------- preview (review only, not shipped)


def write_preview(out_dir, ids):
    os.makedirs(out_dir, exist_ok=True)
    for uid in ids:
        u = UNITS_BY_ID[uid]
        cat = u["category"]
        b = Image.open(os.path.join(BUNDLE, "units", cat, f"{uid}-battle.png")).convert("RGBA")
        cell = CELL[cat]
        frames = []
        for r in range(b.height // cell):
            for f in range(6):
                fr = Image.new("RGBA", (cell, cell), (58, 60, 74, 255))
                fr.alpha_composite(b.crop((f * cell, r * cell, (f + 1) * cell, (r + 1) * cell)))
                frames.append(fr.resize((cell * 2, cell * 2), Image.NEAREST).convert("P", palette=Image.ADAPTIVE))
        frames[0].save(os.path.join(out_dir, f"{uid}-battle.gif"), save_all=True, append_images=frames[1:], duration=130, loop=0, disposal=2)
        flat = Image.new("RGBA", b.size, (58, 60, 74, 255))
        flat.alpha_composite(b)
        flat.save(os.path.join(out_dir, f"{uid}-battle-preview.png"))


REVIEW_PAGE = os.path.join(REPO, "specs", "006-astral-expedition-pixel", "design", "units-review.html")

REVIEW_HTML = """<!doctype html>
<html lang="vi">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Duyệt units · Astral Expedition</title>
<style>
:root{color-scheme:dark;font:16px system-ui;background:#171a22;color:#f3eee6}body{max-width:1100px;margin:4vh auto;padding:0 16px}
h1,h2{font-family:Georgia,serif;font-weight:500}label,button,output{display:inline-flex;align-items:center;gap:6px;margin:4px}
select,button{font:inherit;color:inherit;background:#313843;border:1px solid #606979;padding:7px;border-radius:4px}
canvas{display:block;background:#29303b;max-width:100%;height:auto;image-rendering:pixelated;border:1px solid #525964;margin:16px 0}
input{accent-color:#e8b867}p,small{color:#c3cbd5}#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
#grid button{display:flex;flex-direction:column;padding:4px;margin:0}#grid canvas{margin:0;width:100%;border:0}#grid span{font-size:12px;text-align:center}
</style>
<h1>Duyệt units</h1>
<p>Sinh tự động bởi <code>tools/expedition/build_units.py</code>. Sheet có nguồn <b>art-source</b> là bản vẽ tay; còn lại dựng từ rig 3D trong <code>roster.py</code>.</p>
<label>Nhóm <select id="cat"></select></label>
<label>Unit <select id="unit"></select></label>
<label>Trang phục <select id="variant"></select></label>
<label>Sheet <select id="sheet"></select></label>
<label>Hàng <select id="row"></select></label>
<canvas id="view" width="512" height="512" aria-label="Khung xem hoạt ảnh pixel"></canvas>
<button id="play">Tạm dừng</button>
<label>Khung <input id="scrub" type="range" min="1" max="6" value="1"></label>
<label><input id="slow" type="checkbox">Chậm ½</label>
<p id="note"></p>
<h2>Toàn bộ</h2>
<div id="grid"></div>
<script>
const UNITS = __UNITS__;
const WARDROBE = __WARDROBE__;
const BASE = '../../../database-astral-expedition/';
const CAT = {heroes:'Anh hùng',gatekeepers:'Quái gác cổng',bosses:'Trùm',monsters:'Quái & người địch',animals:'Quái · slot cũ'};
const $ = s => document.querySelector(s);
const imgs = {};
const img = p => imgs[p] || (imgs[p] = Object.assign(new Image(), {src: BASE + p}));
const opts = (el, list) => el.replaceChildren(...list.map(([v, t]) => new Option(t, v)));
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches, t = 0, last = 0;
const cats = [...new Set(UNITS.map(u => u.category))];
opts($('#cat'), cats.map(c => [c, CAT[c] || c]));
const unit = () => UNITS.find(u => u.unitId === $('#unit').value);
function sheets(u) { return ['battle', 'movement'].filter(k => u[k]).map(k => [k, k + (u[k].source !== 'rig' ? ' · art-source' : ' · rig')]); }
function sheet() {
  const kind = $('#sheet').value;
  const base = unit()[kind];
  const variant = WARDROBE.find(v => v.heroId === unit().unitId && v.variantId === $('#variant').value);
  return variant ? {...base, path:variant[kind], source:'art-source · ' + variant.nameVi} : base;
}
function rowsOf(s) { return (s.rowKeys && s.rowKeys.length ? s.rowKeys : Array.from({length: s.rows}, (_, i) => 'row ' + (i + 1))).map((r, i) => [i, r]); }
function changeCat() { opts($('#unit'), UNITS.filter(u => u.category === $('#cat').value).map(u => [u.unitId, u.nameVi + ' · ' + u.unitId])); changeUnit(); }
function changeUnit() {
  opts($('#sheet'), sheets(unit()));
  const variants = WARDROBE.filter(v => v.heroId === unit().unitId);
  opts($('#variant'), [['', 'Mặc định'], ...variants.map(v => [v.variantId, v.nameVi])]);
  $('#variant').disabled = !variants.length;
  changeSheet();
}
function changeSheet() { const s = sheet(); opts($('#row'), rowsOf(s)); $('#note').textContent = unit().element + ' · ' + (unit().realm || '') + ' · rig ' + unit().rig + ' · ' + s.path + ' · nguồn ' + s.source; }
$('#cat').onchange = changeCat; $('#unit').onchange = changeUnit; $('#sheet').onchange = changeSheet;
$('#variant').onchange = changeSheet;
$('#play').onclick = () => { playing = !playing; $('#play').textContent = playing ? 'Tạm dừng' : 'Phát'; };
$('#scrub').oninput = () => { playing = false; $('#play').textContent = 'Phát'; };
changeCat();
const ctx = $('#view').getContext('2d'); ctx.imageSmoothingEnabled = false;
function draw(now) {
  if (playing) t += Math.min(now - last, 100) * ($('#slow').checked ? 0.5 : 1);
  last = now;
  let f = Math.floor(t / 130) % 6;
  if (playing) $('#scrub').value = f + 1; else f = $('#scrub').value - 1;
  const s = sheet(), im = img(s.path), c = s.cell, k = Math.floor(512 / c), r = Number($('#row').value);
  ctx.clearRect(0, 0, 512, 512);
  if (im.naturalWidth) ctx.drawImage(im, f * c, r * c, c, c, (512 - c * k) / 2, (512 - c * k) / 2, c * k, c * k);
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
for (const u of UNITS) {
  const b = document.createElement('button'), cv = document.createElement('canvas'), sp = document.createElement('span');
  cv.width = cv.height = 96; sp.textContent = u.nameVi; b.append(cv, sp); $('#grid').append(b);
  b.onclick = () => { $('#cat').value = u.category; changeCat(); $('#unit').value = u.unitId; changeUnit(); scrollTo({top: 0, behavior: 'smooth'}); };
  const im = img(u.battle.path), g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  const paint = () => g.drawImage(im, 0, 0, u.battle.cell, u.battle.cell, 0, 0, 96, 96);
  im.complete && im.naturalWidth ? paint() : im.addEventListener('load', paint);
}
</script>
"""


def write_review_page():
    os.makedirs(os.path.dirname(REVIEW_PAGE), exist_ok=True)
    with open(REVIEW_PAGE, "w", encoding="utf-8") as f:
        wardrobe_path = os.path.join(BUNDLE, "units", "heroes", "variants", "wardrobe.json")
        wardrobe = []
        if os.path.isfile(wardrobe_path):
            with open(wardrobe_path, encoding="utf-8") as source:
                wardrobe = [
                    entry for entry in json.load(source)["variants"]
                    if all(os.path.isfile(os.path.join(BUNDLE, entry[kind])) for kind in ("battle", "movement"))
                ]
        f.write(REVIEW_HTML.replace("__UNITS__", json.dumps(unit_catalog(), ensure_ascii=False))
                .replace("__WARDROBE__", json.dumps(wardrobe, ensure_ascii=False)))


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # Vietnamese help text on a cp1252 Windows console
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", default="", help="comma separated unit ids")
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--preview", default="", help="write GIF / flat previews of the built sheets here")
    ap.add_argument("--no-manifest", action="store_true")
    args = ap.parse_args()
    ids = [u["id"] for u in ALL_UNITS]
    if args.only:
        want = [s.strip() for s in args.only.split(",") if s.strip()]
        unknown = [w for w in want if w not in UNITS_BY_ID]
        if unknown:
            print("unknown unit ids:", ", ".join(unknown), file=sys.stderr)
            return 2
        ids = want
    if args.jobs > 1 and len(ids) > 1:
        with ProcessPoolExecutor(max_workers=args.jobs) as ex:
            results = list(ex.map(build_unit, ids))
    else:
        results = [build_unit(i) for i in ids]
    for uid, paths in results:
        print(f"{uid:28s} " + "  ".join(paths))
    write_catalog()
    write_review_page()
    write_readme("units")
    if not args.no_manifest:
        update_manifest()
    if args.preview:
        write_preview(args.preview, ids)
    print(f"built {len(results)} unit(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
