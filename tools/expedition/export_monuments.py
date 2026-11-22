"""Vẽ bộ công trình (monument) pixel cho 7 vùng: tháp đá rune, cổng vòm đổ nát, tượng hộ vệ, tháp canh.

Mỗi vùng một atlas `structures/<theme>/monuments.png` gồm 4 ô 128×128 (vẽ ở 64×64 rồi phóng ×2 cho điểm ảnh 2×2),
trang trí riêng theo vùng: tuyết phủ, dây leo, cát lấp, san hô, khe dung nham, rêu đêm, cụm pha lê.
Chân công trình nằm giữa cạnh dưới ô (chiếm 4×2 ô bản đồ).

Chạy từ thư mục gốc repo:  .venv/Scripts/python.exe tools/expedition/export_monuments.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "database-astral-expedition"
KINDS = ("obelisk", "arch", "statue", "tower")
N = 64  # cỡ vẽ gốc

THEMES = {
    "meadow": dict(stone=[(70, 74, 70), (112, 116, 104), (150, 154, 138), (190, 194, 176)], glow=(120, 255, 170), decor="vines"),
    "snow": dict(stone=[(70, 84, 104), (112, 128, 150), (156, 172, 194), (214, 226, 240)], glow=(140, 220, 255), decor="snow"),
    "desert": dict(stone=[(110, 70, 44), (168, 116, 72), (210, 160, 104), (240, 204, 150)], glow=(255, 200, 90), decor="sand"),
    "underwater": dict(stone=[(30, 60, 80), (54, 98, 116), (84, 138, 150), (130, 184, 190)], glow=(90, 240, 230), decor="coral"),
    "volcano": dict(stone=[(28, 24, 28), (56, 48, 50), (88, 76, 76), (126, 110, 104)], glow=(255, 120, 40), decor="lava"),
    "night": dict(stone=[(34, 36, 56), (62, 64, 92), (96, 98, 130), (140, 142, 176)], glow=(200, 140, 255), decor="moss"),
    "aurora": dict(stone=[(60, 70, 120), (100, 112, 168), (150, 162, 214), (210, 222, 250)], glow=(130, 255, 200), decor="crystal"),
}


def outline(img: Image.Image, color=(16, 14, 20, 255)) -> Image.Image:
    a = img.getchannel("A")
    ring = ImageChops.subtract(a.filter(ImageFilter.MaxFilter(3)), a)
    out = Image.new("RGBA", img.size)
    out.paste(Image.new("RGBA", img.size, color), mask=ring)
    out.alpha_composite(img)
    return out


def glow_dot(d, x, y, g, r=1):
    d.rectangle([x - r, y - r, x + r, y + r], fill=g + (255,))


def draw_kind(kind: str, t: dict, rng: random.Random) -> Image.Image:
    img = Image.new("RGBA", (N, N))
    d = ImageDraw.Draw(img)
    dk, md, lt, hi = [c + (255,) for c in t["stone"]]
    g = t["glow"]
    if kind == "obelisk":
        d.rectangle([14, 54, 50, 62], fill=md)
        d.rectangle([14, 54, 50, 55], fill=hi)
        d.rectangle([18, 50, 46, 54], fill=lt)
        d.polygon([(23, 50), (41, 50), (37, 12), (27, 12)], fill=md)
        d.polygon([(23, 50), (32, 50), (32, 12), (27, 12)], fill=lt)  # mặt sáng (đèn trái trên)
        d.polygon([(27, 12), (37, 12), (32, 3)], fill=hi)
        d.line([(37, 12), (41, 50)], fill=dk)
        for y in range(17, 46, 6):  # rune phát sáng
            glow_dot(d, 32, y, g, 1)
            d.point([(30, y), (34, y)], fill=g + (180,))
    elif kind == "arch":
        for x0 in (8, 44):
            d.rectangle([x0, 20, x0 + 11, 62], fill=md)
            d.rectangle([x0, 20, x0 + 4, 62], fill=lt)
            for y in range(24, 62, 7):
                d.line([(x0, y), (x0 + 11, y)], fill=dk)
        d.rectangle([5, 10, 47, 20], fill=md)  # xà ngang gãy ở bên phải
        d.rectangle([5, 10, 47, 12], fill=hi)
        d.polygon([(47, 10), (53, 14), (47, 20)], fill=lt)
        d.rectangle([27, 8, 36, 21], fill=lt)  # đá khoá có ấn phát sáng
        glow_dot(d, 31, 14, g, 2)
        for _ in range(5):  # đá vụn dưới chân
            x, y = rng.randint(20, 42), rng.randint(56, 61)
            d.rectangle([x, y, x + rng.randint(2, 4), y + 2], fill=lt if rng.random() < 0.5 else md)
    elif kind == "statue":
        d.rectangle([16, 50, 48, 62], fill=md)
        d.rectangle([16, 50, 48, 52], fill=hi)
        d.polygon([(22, 50), (42, 50), (38, 22), (26, 22)], fill=md)  # áo choàng
        d.polygon([(22, 50), (32, 50), (32, 22), (26, 22)], fill=lt)
        d.ellipse([25, 11, 39, 25], fill=md)  # mũ trùm
        d.ellipse([25, 11, 32, 25], fill=lt)
        d.rectangle([28, 17, 36, 22], fill=dk)
        d.point([(30, 19), (34, 19)], fill=g + (255,))  # mắt sáng
        d.line([(46, 8), (46, 50)], fill=dk, width=2)  # gậy + quả cầu
        d.ellipse([42, 3, 50, 11], fill=g + (255,))
        d.point([(44, 5)], fill=(255, 255, 255, 255))
        d.rectangle([38, 28, 46, 32], fill=md)  # tay cầm gậy
    else:  # tower
        d.rectangle([16, 16, 48, 62], fill=md)
        d.rectangle([16, 16, 26, 62], fill=lt)
        for y in range(20, 62, 6):
            d.line([(16, y), (48, y)], fill=dk)
            off = 0 if (y // 6) % 2 else 5
            for x in range(16 + off, 48, 10):
                d.line([(x, y), (x, y + 6)], fill=dk)
        for x in range(14, 50, 8):  # lỗ châu mai
            d.rectangle([x, 8, x + 4, 16], fill=md)
            d.rectangle([x, 8, x + 1, 16], fill=hi)
        d.rectangle([14, 14, 50, 17], fill=lt)
        d.rectangle([27, 26, 37, 38], fill=g + (255,))  # cửa sổ rực đèn
        d.rectangle([27, 26, 37, 27], fill=(255, 255, 255, 255))
        d.line([(32, 26), (32, 38)], fill=dk)
        d.rectangle([26, 50, 38, 62], fill=dk)  # cửa
        d.pieslice([26, 46, 38, 56], 180, 360, fill=dk)

    # trang trí theo vùng
    a = img.getchannel("A")
    deco = t["decor"]
    px = img.load()
    for y in range(N):
        for x in range(N):
            if a.getpixel((x, y)) == 0:
                continue
            top = y == 0 or a.getpixel((x, y - 1)) == 0
            if deco in ("snow", "crystal") and top:
                for k in range(rng.randint(1, 3)):
                    if y + k < N and a.getpixel((x, y + k)):
                        px[x, y + k] = (244, 250, 255, 255)
            elif deco in ("vines", "moss") and rng.random() < 0.05:
                col = (78, 150, 70, 255) if deco == "vines" else (110, 90, 170, 255)
                for k in range(rng.randint(2, 6)):
                    if y + k < N and a.getpixel((x, y + k)):
                        px[x, y + k] = col
            elif deco == "lava" and rng.random() < 0.012:
                for k in range(rng.randint(3, 7)):
                    yy, xx = y + k, x + rng.choice((-1, 0, 0, 1))
                    if 0 <= xx < N and yy < N and a.getpixel((xx, yy)):
                        px[xx, yy] = (255, 140, 50, 255)
    if deco == "sand":
        d.ellipse([6, 56, 30, 66], fill=(226, 196, 136, 255))
        d.ellipse([34, 57, 60, 66], fill=(214, 182, 122, 255))
    elif deco == "coral":
        for x0 in (8, 52):
            for k in range(3):
                d.ellipse([x0 + k * 2 - 2, 50 - k * 5, x0 + k * 2 + 4, 56 - k * 5], fill=(240, 110, 140, 255) if k % 2 else (250, 160, 150, 255))
        for _ in range(4):
            bx, by = rng.randint(10, 54), rng.randint(4, 30)
            d.ellipse([bx, by, bx + 3, by + 3], outline=(190, 250, 255, 200))
    elif deco == "crystal":
        for x0, hgt in ((6, 14), (54, 18)):
            d.polygon([(x0, 62), (x0 + 6, 62), (x0 + 6, 62 - hgt + 3), (x0 + 3, 62 - hgt), (x0, 62 - hgt + 3)], fill=(150, 120, 240, 255))
            d.line([(x0 + 3, 61), (x0 + 3, 62 - hgt + 1)], fill=(236, 240, 255, 255))
    img = outline(img)
    # quầng sáng mờ quanh điểm phát sáng
    glow = Image.new("RGBA", (N, N))
    gd = ImageDraw.Draw(glow)
    spots = {"obelisk": [(32, 30, 14)], "arch": [(31, 14, 8)], "statue": [(46, 7, 8), (32, 19, 5)], "tower": [(32, 32, 10)]}[kind]
    for x, y, r in spots:
        gd.ellipse([x - r, y - r, x + r, y + r], fill=g + (70,))
    glow = glow.filter(ImageFilter.GaussianBlur(3))
    base = Image.new("RGBA", (N, N))
    base.alpha_composite(img)
    base.alpha_composite(glow)
    return base


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.parse_args()
    manifest_path = BUNDLE / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf8"))
    for theme, t in THEMES.items():
        rng = random.Random(sum(theme.encode()) * 31)
        atlas = Image.new("RGBA", (N * 2 * len(KINDS), N * 2))
        for i, kind in enumerate(KINDS):
            cell = draw_kind(kind, t, rng).resize((N * 2, N * 2), Image.Resampling.NEAREST)
            atlas.alpha_composite(cell, (i * N * 2, 0))
        out = BUNDLE / "structures" / theme / "monuments.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        atlas.save(out, optimize=True)
        key = out.relative_to(BUNDLE).as_posix()
        manifest["files"][key] = {"sha256": sha(out), "bytes": out.stat().st_size, "width": atlas.width, "height": atlas.height}
        print("wrote", key)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


if __name__ == "__main__":
    main()
