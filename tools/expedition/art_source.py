r"""Ánh xạ 1-1 giữa database-astral-expedition/art-source/ và ảnh game cho units/, ui/, vfx/skills/.

Quy ước giống art-source/motion, battle-scenes, structures: mỗi ảnh game `<domain>/<path>.png` có đúng một
bản gốc `art-source/<domain>/<path>-source.png` vẽ trên nền phẳng #FF00FF. Bước xuất tách nền magenta,
đưa về alpha 0/255, màu BGR555, tối đa 15 màu và đúng kích thước lưới, rồi cập nhật manifest.json.
Bản gốc có thể là ảnh dựng từ code (build_units.py, pixel_vfx.py, pixel_ui.py) hoặc bản vẽ tay /
ImageGen đặt đè lên cùng tên file; ảnh nào nằm trong art-source thì ảnh đó được xuất.

  py tools/expedition/art_source.py                      # xuất cả ba domain từ art-source
  py tools/expedition/art_source.py --domain vfx         # chỉ vfx/skills
  py tools/expedition/art_source.py --readme             # viết lại README bảng ánh xạ
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
PYDEPS = os.path.abspath(os.path.join(HERE, "..", "units", ".pydeps"))
GEN3_DIR = os.path.abspath(os.path.join(HERE, "..", "gen3"))
for _p in (PYDEPS, GEN3_DIR, HERE):
    if os.path.isdir(_p) and _p not in sys.path:
        sys.path.insert(0, _p)

from PIL import Image  # noqa: E402

import gen3  # noqa: E402

BUNDLE = os.path.join(REPO, "database-astral-expedition")
ART = os.path.join(BUNDLE, "art-source")
MAGENTA = (255, 0, 255)
DOMAINS = ("units", "ui", "vfx")

ELEMENTS = ("verdant", "frost", "solar", "tide", "pyre", "astral")
VFX_STYLES = ("slash", "ray", "meteor", "wave", "sigil")

UI_FILES = {
    "ui/hud-kit.png": ((256, 64), "Khung chân dung 64×64, viên AP đầy và rỗng, vòng hồi chiêu. Đá khắc viền đồng, chỉ vàng."),
    "ui/combat-kit.png": ((288, 192), "Sáu ô huy hiệu nguyên tố, bốn thanh HP/AP/Break/Phase, ba trạng thái nút, ba biểu tượng trạng thái."),
    "ui/gacha/astral-orb.png": ((1024, 768), "Tinh Cầu Triệu Hồi 8×6 ô 128 px: xoay 8, tụ lực 4, rung 5, đổi hạng 4, vỡ sao 4, lắng 3."),
}


def source_rel(target_rel: str) -> str:
    stem, ext = os.path.splitext(target_rel)
    if target_rel.startswith("vfx/"):
        return stem + "-source" + ext
    return stem + "-source" + ext


def source_path(target_rel: str) -> str:
    return os.path.join(ART, *source_rel(target_rel).split("/"))


def target_path(target_rel: str) -> str:
    return os.path.join(BUNDLE, *target_rel.split("/"))


def to_source(img: Image.Image) -> Image.Image:
    """RGBA art -> opaque RGB on flat #FF00FF (the art-source convention)."""
    bg = Image.new("RGBA", img.size, MAGENTA + (255,))
    bg.alpha_composite(img.convert("RGBA"))
    return bg.convert("RGB")


def save_source(target_rel: str, img: Image.Image) -> str:
    path = source_path(target_rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    to_source(img).save(path)
    return path


def _is_key(r, g, b):
    return r > 200 and b > 200 and g < 90


def normalize(src: Image.Image, size, limit=15) -> Image.Image:
    """Key the magenta background, resize to the target grid, snap BGR555, <= `limit` colours."""
    im = src.convert("RGBA")
    data = [(0, 0, 0, 0) if (p[3] < 128 or _is_key(p[0], p[1], p[2])) else gen3.snap(p[:3]) + (255,) for p in im.getdata()]
    keyed = Image.new("RGBA", im.size)
    keyed.putdata(data)
    if keyed.size != tuple(size):
        # hand-drawn / ImageGen sources come at their own resolution: fit the same grid
        keyed = keyed.resize(tuple(size), Image.NEAREST)
    from pixel_rig import limit_palette

    return limit_palette(keyed, limit)


def normalize_jung_portrait(src: Image.Image) -> Image.Image:
    size = (128, 128)
    sized = src.convert("RGBA").resize(size, Image.Resampling.LANCZOS)
    # Keep distinct hair, coat and face ramps on the portrait while enforcing the tile palette limit.
    return gen3.to_gen3(normalize(sized, size, limit=48), max_palettes=13)


def mapping(domain: str):
    """[(target_rel, (w, h), note)] for one domain."""
    out = []
    if domain == "units":
        with open(os.path.join(REPO, "data", "expedition", "units.json"), encoding="utf-8") as f:
            units = json.load(f)
        for u in units:
            for key in ("battle", "movement"):
                if key in u:
                    s = u[key]
                    note = f"{u['nameVi']} · {u['category']} · {key} {s['cols']}×{s['rows']} @{s['cell']} · " + ("view " + s.get("view", "") if key == "battle" else "DOWN/LEFT/RIGHT/UP")
                    out.append((s["path"], (s["cols"] * s["cell"], s["rows"] * s["cell"]), note))
            if "portrait" in u:
                out.append((u["portrait"]["path"], (128, 128), f"{u['nameVi']} · chân dung 128×128"))
            for extra in u.get("extraSheets", []):
                with Image.open(target_path(extra)) as im:
                    out.append((extra, im.size, f"{u['nameVi']} · sheet phụ vẽ tay"))
    elif domain == "ui":
        for rel, (size, note) in UI_FILES.items():
            out.append((rel, size, note))
    elif domain == "vfx":
        for el in ELEMENTS:
            for st in VFX_STYLES:
                for ph, note in (("cast", "CAST 8 frame 96 px trên người dùng chiêu"), ("effect", "EFFECT 8 frame 96 px trên mục tiêu")):
                    out.append((f"vfx/skills/{el}_{st}-{ph}.png", (768, 96), f"{el} · {st} · {note}"))
    return out


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def update_manifest(rels):
    path = os.path.join(BUNDLE, "manifest.json")
    with open(path, encoding="utf-8") as f:
        manifest = json.load(f)
    files = manifest.setdefault("files", {})
    for rel in rels:
        full = target_path(rel)
        with Image.open(full) as im:
            files[rel] = {"sha256": sha256_file(full), "bytes": os.path.getsize(full), "width": im.width, "height": im.height}
    manifest["files"] = dict(sorted(files.items()))
    manifest["totalFiles"] = len(manifest["files"])
    with open(path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")


def export(rels_sizes, manifest=True):
    """Normalize every existing source onto its game file. Returns (exported, missing)."""
    done, missing = [], []
    for rel, size, _ in rels_sizes:
        src = source_path(rel)
        if not os.path.isfile(src):
            missing.append(rel)
            continue
        with Image.open(src) as im:
            # UI atlases mix every element colour: Gen 3 allows several 15-colour palettes there
            out = normalize_jung_portrait(im) if rel == "units/heroes/jung_afterglow-portrait.png" else normalize(im, size, limit=48 if rel.startswith("ui/") else 15)
        os.makedirs(os.path.dirname(target_path(rel)), exist_ok=True)
        out.save(target_path(rel))
        done.append(rel)
    if manifest and done:
        update_manifest(done)
    return done, missing


def export_one(rel, size, manifest=False):
    return export([(rel, size, "")], manifest=manifest)


README_HEAD = {
    "units": (
        "# Nguồn hình units · Astral Expedition Pixel\n\n"
        "Mỗi sheet trong `units/` có đúng một bản gốc `*-source.png` ở cùng đường dẫn tương đối, vẽ trên nền phẳng `#FF00FF`.\n"
        "Bản gốc hiện tại được dựng bằng rig 3D (`tools/expedition/build_units.py`) theo phong cách của `art-source/motion/`: "
        "tỷ lệ người thật, ánh sáng trên-trái, viền `#1b1726`, bảng màu trầm ấm, vân lông / vải / đá / kim loại và dither ở ranh giới tông. "
        "Sheet của Lâm Phong, Phong Lang và Seraphina lấy nguyên từ bản vẽ ImageGen trong `art-source/motion/`.\n\n"
        "Thay một unit bằng bản vẽ tay: vẽ theo `prompts/battle/README.md` hoặc `prompts/movement/README.md`, giữ đúng số cột × hàng, "
        "lưu đè lên file `-source.png` tương ứng, rồi chạy `py tools/expedition/art_source.py --domain units`.\n\n"
    ),
    "ui": (
        "# Nguồn hình giao diện · Astral Expedition Pixel\n\n"
        "Mỗi atlas trong `ui/` có một bản gốc `*-source.png` trên nền `#FF00FF`, vẽ ở mật độ 1:1 theo chất liệu của "
        "`art-source/structures/`: đá xám khắc, viền đồng, chỉ vàng, đá quý nhiều mặt, ánh sáng trên-trái. Giữ nguyên vị trí từng ô "
        "vì game cắt theo tọa độ cố định (xem bảng). Dựng lại bằng `py tools/expedition/pixel_ui.py`, xuất bằng `py tools/expedition/art_source.py --domain ui`.\n\n"
    ),
    "vfx": (
        "# Nguồn hình hiệu ứng chiêu thức · Astral Expedition Pixel\n\n"
        "60 dải hiệu ứng: 6 nguyên tố × 5 kiểu (`slash`, `ray`, `meteor`, `wave`, `sigil`) × 2 pha (`cast` trên người dùng, "
        "`effect` trên mục tiêu). Mỗi dải 8 frame × 96 px, vẽ trên nền `#FF00FF` với lõi sáng, nhiều tông, hạt đặc trưng nguyên tố "
        "(lá, tinh thể băng, tia nắng, giọt nước, than hồng, sao) và viền tối màu nguyên tố. Dựng lại bằng `py tools/expedition/pixel_vfx.py`, "
        "xuất bằng `py tools/expedition/art_source.py --domain vfx`.\n\n"
    ),
}

UI_SLICES = (
    "\n## Tọa độ cắt (px trên ảnh game)\n\n"
    "| Atlas | Ô | Vùng |\n|---|---|---|\n"
    "| hud-kit | Khung chân dung | 0,0 – 63,63 |\n| hud-kit | Viên AP đầy | 80,8 – 111,55 |\n| hud-kit | Viên AP rỗng | 128,8 – 159,55 |\n"
    "| hud-kit | Vòng hồi chiêu | 200,6 – 249,57 |\n"
    "| combat-kit | Huy hiệu nguyên tố (Verdant, Frost, Solar, Tide, Pyre, Astral) | x = 48·i + 2 … 48·i + 45, y = 2 … 45 |\n"
    "| combat-kit | Thanh HP, AP, Break, Phase | 0,52+32·i – 109,79+32·i |\n"
    "| combat-kit | Nút normal, active, disabled | 118,52+32·i – 287,79+32·i |\n"
    "| combat-kit | Biểu tượng trạng thái | tâm 152, 206, 258; y 152 – 188 |\n"
    "| astral-orb | Hàng 1–6 | 8, 4, 5, 4, 4, 3 frame × 128 px |\n"
)


def write_readme(domain):
    rows = mapping(domain)
    folder = os.path.join(ART, "vfx" if domain == "vfx" else domain)
    os.makedirs(folder, exist_ok=True)
    lines = [README_HEAD[domain], "| Bản gốc (`art-source/`) | Ảnh game | Kích thước | Mô tả |\n|---|---|---|---|\n"]
    for rel, size, note in rows:
        lines.append(f"| `{source_rel(rel)}` | `{rel}` | {size[0]}×{size[1]} | {note} |\n")
    if domain == "ui":
        lines.append(UI_SLICES)
    with open(os.path.join(folder, "README.md"), "w", encoding="utf-8") as f:
        f.write("".join(lines))


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--domain", choices=DOMAINS + ("all",), default="all")
    ap.add_argument("--readme", action="store_true", help="only rewrite the README mapping tables")
    args = ap.parse_args()
    domains = DOMAINS if args.domain == "all" else (args.domain,)
    for d in domains:
        write_readme(d)
        if args.readme:
            continue
        done, missing = export(mapping(d))
        print(f"{d}: exported {len(done)} file(s) from art-source" + (f", {len(missing)} without source: {', '.join(missing[:5])}" if missing else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
