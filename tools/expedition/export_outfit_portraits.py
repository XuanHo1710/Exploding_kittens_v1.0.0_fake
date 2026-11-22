"""Vẽ chân dung cho từng trang phục (outfit) của anh hùng bằng chuyển bảng màu.

Sprite chiến đấu gốc và sprite trang phục trùng khớp từng điểm ảnh → học bảng màu gốc → màu trang phục
(phiếu bầu theo điểm ảnh), rồi áp lên chân dung gốc: mỗi điểm ảnh tìm màu gốc gần nhất, đổi sang màu trang
phục tương ứng và giữ nguyên độ lệch sáng/tối (giữ chi tiết nét vẽ). Da / mắt không đổi trong sprite nên giữ nguyên.
Ghi `units/heroes/variants/<hero>-<variant>-portrait.png`, thêm trường `portrait` vào wardrobe.json, cập nhật manifest.

Chạy từ thư mục gốc repo:  .venv/Scripts/python.exe tools/expedition/export_outfit_portraits.py
"""

from __future__ import annotations

import argparse
import colorsys
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
HEROES = ROOT / "database-astral-expedition" / "units" / "heroes"


def _bin(h, sat, v):
    """Dải màu: xám (theo độ sáng) hoặc 24 dải sắc độ × 3 độ sáng."""
    vb = 0 if v < 0.33 else 1 if v < 0.66 else 2
    return ("g", vb) if sat < 0.22 else (int(h * 24) % 24, vb)


def hsv_transfer(base: Image.Image, variant: Image.Image) -> dict:
    """Học phép biến đổi màu theo từng dải: lệch sắc độ, lệch độ bão hoà, tỉ lệ độ sáng."""
    acc: dict = defaultdict(lambda: [0, 0.0, 0.0, 0.0])
    for a, b in zip(base.getdata(), variant.getdata()):
        if a[3] < 200 or b[3] < 200:
            continue
        h1, s1, v1 = colorsys.rgb_to_hsv(*(c / 255 for c in a[:3]))
        h2, s2, v2 = colorsys.rgb_to_hsv(*(c / 255 for c in b[:3]))
        dh = ((h2 - h1 + 0.5) % 1) - 0.5
        k = _bin(h1, s1, v1)
        e = acc[k]
        e[0] += 1
        e[1] += dh if s2 > 0.12 else 0
        e[2] += s2 - s1
        e[3] += (v2 + 0.02) / (v1 + 0.02)
    out = {}
    for k, (n, dh, ds, rv) in acc.items():
        if n < 150:
            continue
        dh, ds, rv = dh / n, ds / n, rv / n
        if abs(dh) > 0.03 or abs(ds) > 0.1 or abs(rv - 1) > 0.12:
            out[k] = (dh, ds, rv)
    return out


def recolor(portrait: Image.Image, tf: dict) -> Image.Image:
    out = portrait.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            h, sat, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if v < 0.14:
                continue  # nền / viền tối giữ nguyên
            if 0.02 <= h <= 0.11 and 0.15 <= sat <= 0.62 and v > 0.42:
                continue  # màu da giữ nguyên
            t = tf.get(_bin(h, sat, v))
            if not t:
                continue
            dh, ds, rv = t
            nh, ns, nv = (h + dh) % 1, max(0, min(1, sat + ds)), max(0, min(1, v * rv))
            nr, ng, nb = colorsys.hsv_to_rgb(nh, ns, nv)
            px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return out


# Công thức thiết kế từng trang phục: luật đầu tiên khớp (sắc độ, bão hoà, độ sáng, vùng dọc ảnh) được áp dụng.
# op = (sắc độ mới | None, nhân bão hoà, cộng bão hoà, nhân sáng, cộng sáng)
RECIPES = {
    "charcoal-watch": [  # Miran · Vệ Binh Than: áo khoác nâu → xám than, khăn vàng → đỏ thẫm
        dict(h=(0.06, 0.17), s=(0.45, 1), v=(0.35, 1), y=(0.5, 1), op=(0.985, 1.0, 0, 0.9, 0)),
        dict(h=(0.03, 0.2), s=(0.12, 1), v=(0, 0.62), y=(0.42, 1), skip=(0.3, 0.7, 0, 0.62), op=(0.62, 0.25, 0, 0.78, 0)),
    ],
    "ivory-recon": [  # Se Ok · Trinh Sát Ngà: áo choàng navy → trắng ngà
        dict(h=(0.5, 0.78), s=(0.28, 1), v=(0.16, 1), y=(0.35, 1), op=(0.11, 0.14, 0.02, 0.5, 0.56)),
    ],
    "violet-atelier": [  # Karen · Họa Sư Mực Tím: áo gile vàng → tím, áo trong kem → tím oải hương
        dict(h=(0.065, 0.17), s=(0.35, 1), v=(0.25, 1), y=(0.5, 1), x=(0.34, 1), op=(0.8, 0.85, 0, 0.85, 0)),
        dict(h=(0, 1), s=(0, 0.32), v=(0.58, 1), y=(0.55, 1), op=(0.78, 0, 0.2, 0.95, 0)),
    ],
}


def apply_recipe(portrait: Image.Image, rules: list) -> Image.Image:
    out = portrait.copy()
    px = out.load()
    for y in range(out.height):
        fy = y / out.height
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            h, sat, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            for rule in rules:
                if (rule["h"][0] <= h <= rule["h"][1] and rule["s"][0] <= sat <= rule["s"][1]
                        and rule["v"][0] <= v <= rule["v"][1] and rule["y"][0] <= fy <= rule["y"][1]
                        and rule.get("x", (0, 1))[0] <= x / out.width <= rule.get("x", (0, 1))[1]
                        and not (rule.get("skip") and rule["skip"][0] <= x / out.width <= rule["skip"][1]
                                 and rule["skip"][2] <= fy <= rule["skip"][3])):
                    nh, sm, sa, vm, va = rule["op"]
                    nh = h if nh is None else nh
                    ns = max(0, min(1, sat * sm + sa))
                    nv = max(0, min(1, v * vm + va))
                    nr, ng, nb = colorsys.hsv_to_rgb(nh, ns, nv)
                    px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
                    break
    return out


def main() -> None:
    argparse.ArgumentParser(description=__doc__).parse_args()
    wardrobe_path = HEROES / "variants" / "wardrobe.json"
    wardrobe = json.loads(wardrobe_path.read_text(encoding="utf8"))
    manifest_path = ROOT / "database-astral-expedition" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf8"))
    for v in wardrobe["variants"]:
        hero, var = v["heroId"], v["variantId"]
        base = Image.open(HEROES / f"{hero}-battle.png").convert("RGBA")
        variant = Image.open(HEROES / "variants" / f"{hero}-{var}-battle.png").convert("RGBA")
        portrait = Image.open(HEROES / f"{hero}-portrait.png").convert("RGBA")
        out = apply_recipe(portrait, RECIPES[var]) if var in RECIPES else recolor(portrait, hsv_transfer(base, variant))
        rel = f"units/heroes/variants/{hero}-{var}-portrait.png"
        path = ROOT / "database-astral-expedition" / rel
        out.save(path, optimize=True)
        v["portrait"] = rel
        manifest["files"][rel] = {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size,
                                  "width": out.width, "height": out.height}
        print("wrote", rel)
    wardrobe_data = (json.dumps(wardrobe, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    wardrobe_path.write_bytes(wardrobe_data)
    manifest["files"]["units/heroes/variants/wardrobe.json"] = {
        "sha256": hashlib.sha256(wardrobe_data).hexdigest(), "bytes": len(wardrobe_data),
    }
    manifest["totalFiles"] = len(manifest["files"])
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


if __name__ == "__main__":
    main()
