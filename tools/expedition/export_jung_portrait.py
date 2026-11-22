"""Xuất chân dung pixel 128×128 cho Jung (SSS) từ bản đã duyệt hoặc hình dự phòng.

Vẽ ở 512 px (khối mặt 3/4 quay phải, tóc đen xù ngang vai kiểu wolf cut, áo thun trắng, áo khoác gió đen
trễ khỏi vai viền cam, chuôi katana sau vai, ánh viền cam rạng đông), rồi hạ xuống 128 px + lượng tử bảng màu
có dither để cùng chất liệu với chân dung vẽ tay của các anh hùng khác.
Ghi art-source/motion/redraw/jung_afterglow-portrait.png (build_units.py ưu tiên bản này) và units/heroes/.

Chạy từ thư mục gốc repo:  .venv/Scripts/python.exe tools/expedition/export_jung_portrait.py
"""

from __future__ import annotations

import argparse
import math
import os
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DB = os.path.join(REPO, "database-astral-expedition")
N = 512

SKIN = (238, 200, 176)
SKIN_SH = (184, 132, 118)
SKIN_DEEP = (128, 84, 86)
HAIR = (22, 20, 28)
HAIR_HI = (70, 72, 96)
RIM = (255, 156, 60)
RIM_HI = (255, 214, 140)
TEE = (236, 232, 224)
TEE_SH = (150, 150, 168)
JACKET = (20, 20, 28)
JACKET_HI = (74, 78, 98)
ORANGE = (255, 138, 38)


def layer():
    return Image.new("RGBA", (N, N), (0, 0, 0, 0))


def shade(base: Image.Image, mask: Image.Image, color, alpha=255, blur=0):
    """Tô `color` lên `base` theo `mask` (L), có thể làm mềm mép."""
    if blur:
        mask = mask.filter(ImageFilter.GaussianBlur(blur))
    if alpha != 255:
        mask = mask.point(lambda v: v * alpha // 255)
    base.paste(Image.new("RGBA", (N, N), color + (255,)), (0, 0), mask)


def poly_mask(pts, blur=0):
    m = Image.new("L", (N, N), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur)) if blur else m


def ell_mask(box, blur=0):
    m = Image.new("L", (N, N), 0)
    ImageDraw.Draw(m).ellipse(box, fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur)) if blur else m


def strand(draw: ImageDraw.ImageDraw, x0, y0, x1, y1, w, color, bend=0.0):
    """Lọn tóc thuôn nhọn: đường cong bậc 2 từ (x0,y0) tới (x1,y1)."""
    mx, my = (x0 + x1) / 2 + bend, (y0 + y1) / 2
    pts_l, pts_r = [], []
    for i in range(13):
        t = i / 12
        x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t * t * x1
        y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * my + t * t * y1
        dx = 2 * (1 - t) * (mx - x0) + 2 * t * (x1 - mx)
        dy = 2 * (1 - t) * (my - y0) + 2 * t * (y1 - my)
        ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln, dx / ln
        ww = w * (1 - t) ** 0.8
        pts_l.append((x + nx * ww, y + ny * ww))
        pts_r.append((x - nx * ww, y - ny * ww))
    draw.polygon(pts_l + pts_r[::-1], fill=color)


def paint() -> Image.Image:
    rnd = random.Random(1710)
    img = Image.new("RGBA", (N, N), (20, 17, 26, 255))
    # nền: tối, ánh rạng đông cam loang từ góc phải dưới
    shade(img, ell_mask((300, 300, 800, 760), 110), (110, 48, 30), 150)
    shade(img, ell_mask((400, 380, 680, 640), 80), (200, 96, 40), 90)
    shade(img, ell_mask((-200, -200, 200, 220), 80), (40, 36, 70), 160)

    # ---- tóc sau lưng (khối lớn, ngang vai)
    back = [(140, 120), (190, 70), (270, 52), (350, 74), (395, 130), (408, 210), (400, 300), (380, 360), (330, 372),
            (290, 330), (210, 340), (160, 372), (128, 330), (120, 240)]
    bm = ell_mask((150, 50, 404, 310))
    bd = ImageDraw.Draw(bm)
    for i in range(22):  # khối tóc sau: lọn xù toả ra và rủ xuống ngang vai, ngọn so le
        a = math.radians(-10 + i * 9.5)
        x0, y0 = 277 + 120 * math.cos(a), 180 + 120 * math.sin(a)
        ln = rnd.uniform(70, 130) if math.sin(a) > 0.2 else rnd.uniform(30, 60)
        strand(bd, x0, y0, x0 + math.cos(a) * ln * 0.5 + rnd.uniform(-14, 14), y0 + ln, rnd.uniform(16, 24), 255, rnd.uniform(-14, 14))
    for i in range(9):  # tóc xù trên đỉnh
        a = math.radians(200 + i * 17)
        x0, y0 = 277 + 118 * math.cos(a), 176 + 120 * math.sin(a)
        strand(bd, x0, y0, x0 + math.cos(a) * rnd.uniform(18, 34), y0 + math.sin(a) * rnd.uniform(14, 30), rnd.uniform(10, 16), 255, rnd.uniform(-8, 8))
    back_mask = bm
    shade(img, back_mask, HAIR)

    # ---- áo thun trắng (thân + vai)
    tee = [(110, 512), (112, 400), (160, 352), (230, 330), (300, 332), (380, 352), (420, 400), (424, 512)]
    shade(img, poly_mask(tee, 1), TEE)
    shade(img, poly_mask([(110, 512), (112, 400), (160, 352), (210, 345), (196, 430), (186, 512)], 14), TEE_SH, 170)
    shade(img, poly_mask([(232, 336), (300, 336), (290, 372), (244, 372)], 10), TEE_SH, 150)  # bóng cổ áo
    td = ImageDraw.Draw(img)
    for x0, y0, x1, y1 in [(220, 400, 250, 512), (330, 420, 300, 512)]:  # nếp vải
        td.line([(x0, y0), (x1, y1)], fill=(200, 198, 206), width=4)
    # hình in: mặt trời mọc cam (logo Hanbit) trên ngực
    td.pieslice((262, 430, 342, 510), 180, 360, fill=ORANGE)
    for k in range(3):
        td.rectangle((256, 474 + k * 10, 348, 478 + k * 10), fill=(236, 232, 224))
    td.rectangle((256, 470, 348, 474), fill=(30, 26, 34))
    shade(img, poly_mask([(330, 345), (380, 352), (440, 400), (470, 512), (420, 512)], 18), (255, 214, 170), 120)

    # ---- áo khoác gió đen trễ xuống khuỷu tay (2 bên), viền + khoá kéo cam
    jl = [(0, 512), (0, 372), (46, 346), (104, 356), (150, 398), (168, 450), (172, 512)]
    jr = [(372, 512), (378, 440), (410, 384), (462, 350), (512, 344), (512, 512)]
    d = ImageDraw.Draw(img)
    for pts in (jl, jr):
        shade(img, poly_mask(pts, 1), JACKET)
    # lót cam lộ ra ở mép áo trễ vai
    d.line([(46, 350), (104, 360), (150, 402), (166, 452), (170, 512)], fill=ORANGE, width=6)
    d.line([(380, 512), (380, 442), (412, 388), (462, 354), (512, 348)], fill=ORANGE, width=6)
    for pts in ([(20, 400), (44, 386), (96, 512), (70, 512)], [(440, 400), (460, 390), (496, 512), (472, 512)],
                [(110, 380), (126, 384), (150, 512), (138, 512)]):  # bóng nylon
        shade(img, poly_mask(pts, 8), JACKET_HI, 160)
    for y in (420, 470):  # nếp gấp
        d.line([(10, y), (120, y + 24)], fill=(8, 8, 12), width=4)
    d.line([(150, 410), (160, 512)], fill=(210, 210, 220), width=3)  # khoá kéo
    d.rectangle((452, 420, 482, 436), fill=ORANGE)  # nhãn cam trên tay áo
    d.rectangle((456, 424, 478, 432), fill=(40, 20, 10))

    # ---- chuôi katana thò sau vai trái (chéo)
    d.line([(60, 300), (150, 372)], fill=(20, 16, 22), width=20)
    for i in range(6):
        t = i / 6
        x, y = 60 + 90 * t, 300 + 72 * t
        d.line([(x - 6, y + 8), (x + 8, y - 6)], fill=ORANGE, width=4)
    d.ellipse((140, 356, 172, 388), fill=(200, 170, 90))  # tsuba

    # ---- cổ
    neck = [(232, 270), (300, 268), (304, 345), (276, 360), (236, 348)]
    shade(img, poly_mask(neck, 1), SKIN)
    shade(img, poly_mask([(232, 270), (300, 268), (300, 300), (232, 318)], 8), SKIN_DEEP, 200)
    # dây chuyền mảnh
    d.arc((220, 300, 316, 372), 20, 160, fill=(220, 224, 236), width=2)

    # ---- mặt 3/4 quay phải
    face = [(198, 150), (226, 96), (280, 82), (330, 104), (350, 150), (356, 196), (352, 226), (360, 240), (350, 248),
            (346, 268), (330, 290), (300, 306), (270, 304), (238, 284), (214, 252), (200, 210)]
    shade(img, poly_mask(face, 1), SKIN)
    shade(img, poly_mask([(198, 150), (226, 96), (240, 100), (226, 200), (240, 286), (214, 252), (200, 210)], 14), SKIN_SH, 210)
    shade(img, poly_mask([(240, 290), (300, 306), (330, 290), (300, 296)], 6), SKIN_SH, 160)
    # ánh viền rạng đông bên phải mặt
    shade(img, poly_mask([(338, 120), (352, 150), (358, 198), (352, 226), (346, 268), (336, 270), (342, 200), (334, 140)], 3), RIM_HI, 200)
    # hốc mắt, gò má, cằm
    shade(img, ell_mask((236, 176, 292, 214), 9), SKIN_SH, 120)
    shade(img, ell_mask((306, 178, 344, 210), 8), SKIN_SH, 100)
    shade(img, poly_mask([(320, 205), (346, 240), (330, 250), (318, 236)], 5), SKIN_SH, 150)  # bóng mũi
    shade(img, poly_mask([(332, 200), (342, 232), (338, 234), (328, 206)], 2), (255, 232, 214), 220)  # sống mũi sáng
    shade(img, poly_mask([(214, 252), (238, 284), (270, 304), (262, 310), (226, 292)], 6), SKIN_DEEP, 160)  # quai hàm
    # má ửng
    shade(img, ell_mask((250, 226, 300, 256), 10), (236, 140, 130), 90)
    # tai (bên gần) + khuyên bạc
    shade(img, ell_mask((206, 186, 232, 236), 2), SKIN_SH)
    d.ellipse((210, 232, 226, 250), outline=(226, 230, 240), width=3)

    # mắt: sắc, hơi cụp, tròng hổ phách
    for (cx, cy, w, h) in [(262, 200, 40, 16), (325, 198, 26, 13)]:
        d.ellipse((cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2), fill=(246, 240, 236))
        d.ellipse((cx - h // 2 + 2, cy - h // 2, cx + h // 2 + 2, cy + h // 2), fill=(150, 80, 30))
        d.ellipse((cx - 3, cy - 4, cx + 5, cy + 4), fill=(16, 10, 12))
        d.rectangle((cx + 3, cy - 5, cx + 6, cy - 2), fill=(255, 236, 200))
        d.line([(cx - w // 2 - 4, cy - h // 2 + 3), (cx + w // 2 + 2, cy - h // 2 - 2)], fill=(18, 14, 20), width=5)  # mi trên
    # lông mày thẳng, đậm
    d.line([(234, 170), (288, 180)], fill=(26, 22, 30), width=7)
    d.line([(312, 180), (342, 171)], fill=(26, 22, 30), width=6)
    # mũi + miệng
    d.line([(330, 206), (346, 240), (334, 246)], fill=SKIN_DEEP, width=4)
    d.line([(296, 273), (318, 272), (332, 264)], fill=(150, 70, 74), width=5)
    d.line([(304, 280), (322, 278)], fill=(206, 120, 116), width=3)
    # băng cá nhân trên má (chất đường phố)

    # ---- tóc trước: mái xù lởm chởm + lọn hai bên ôm mặt xuống ngang vai
    hm = Image.new("L", (N, N), 0)
    hd = ImageDraw.Draw(hm)
    for i in range(16):  # mái
        x0 = 200 + i * 10 + rnd.uniform(-4, 4)
        strand(hd, x0, 70 + rnd.uniform(-6, 6), x0 + rnd.uniform(4, 22), 150 + rnd.uniform(0, 40), rnd.uniform(9, 14), 255, rnd.uniform(-8, 8))
    for i in range(9):  # lọn trái ôm mặt
        x0 = 160 + i * 8
        strand(hd, x0, 110 + i * 4, x0 - 30 + rnd.uniform(-10, 10), 330 + rnd.uniform(-20, 40), rnd.uniform(10, 15), 255, rnd.uniform(-20, 10))
    for i in range(6):  # lọn phải (sau má xa)
        x0 = 340 + i * 9
        strand(hd, x0, 120 + i * 6, x0 + 20 + rnd.uniform(-6, 14), 300 + rnd.uniform(-10, 50), rnd.uniform(9, 14), 255, rnd.uniform(-6, 16))
    for i in range(10):  # ngọn tỉa so le ngang vai
        x0 = 140 + i * 26 + rnd.uniform(-6, 6)
        if 215 < x0 < 330:
            continue
        strand(hd, x0, 300, x0 + rnd.uniform(-24, 24), 372 + rnd.uniform(-10, 28), rnd.uniform(7, 11), 255, rnd.uniform(-10, 10))
    shade(img, hm, HAIR)
    # bóng tóc: highlight lạnh phía trên, ánh cam rạng đông viền phải
    hi = Image.new("L", (N, N), 0)
    hdl = ImageDraw.Draw(hi)
    for i in range(7):  # vệt bóng cong trên đỉnh đầu
        x0 = 200 + i * 22 + rnd.uniform(-6, 6)
        strand(hdl, x0, 78 + rnd.uniform(0, 8), x0 + rnd.uniform(8, 20), 128 + rnd.uniform(0, 20), 3.2, 255, rnd.uniform(-6, 6))
    for i in range(4):  # vệt sáng trên lọn ôm mặt
        x0 = 168 + i * 14
        strand(hdl, x0, 200 + i * 8, x0 - 20, 290 + i * 6, 2.6, 255, -8)
    hair_mask = ImageChops.lighter(hm, back_mask)
    shade(img, ImageChops.multiply(hi, hair_mask), HAIR_HI, 150)
    rim = Image.new("L", (N, N), 0)
    ImageDraw.Draw(rim).polygon([(330, 40), (512, 40), (512, 420), (330, 420)], fill=255)
    edge = ImageChops.subtract(hair_mask, hair_mask.filter(ImageFilter.MinFilter(11)))  # dải mép tóc
    shade(img, ImageChops.multiply(edge, rim.filter(ImageFilter.GaussianBlur(30))), RIM, 230)
    return img


def paint_katana() -> Image.Image:
    """Icon vũ khí trấn Hanbit Edge: katana chéo, lưỡi ánh cam rạng đông, chuôi quấn cam-đen, tsuba vàng."""
    img = layer()
    d = ImageDraw.Draw(img)
    glow = Image.new("L", (N, N), 0)
    ImageDraw.Draw(glow).line([(150, 360), (470, 40)], fill=255, width=60)
    shade(img, glow, (255, 140, 40), 150, blur=26)
    # lưỡi cong nhẹ: dải từ tsuba tới mũi
    pts_top, pts_bot = [], []
    for i in range(21):
        t = i / 20
        x, y = 160 + 300 * t, 350 - 300 * t - 26 * math.sin(t * math.pi)
        w = 18 * (1 - t) ** 0.35 + 2
        pts_top.append((x - w * 0.7, y - w * 0.7))
        pts_bot.append((x + w * 0.7, y + w * 0.7))
    d.polygon(pts_top + pts_bot[::-1], fill=(226, 232, 244))
    d.line(pts_bot, fill=(255, 150, 50), width=7)  # lưỡi lửa rạng đông
    d.line(pts_top[2:], fill=(255, 255, 255), width=3)
    d.line([(p[0] + 4, p[1] + 4) for p in pts_top[1:18]], fill=(150, 160, 186), width=4)  # rãnh máu
    # tsuba + habaki
    d.ellipse((132, 322, 192, 382), fill=(214, 168, 70), outline=(110, 70, 20), width=5)
    d.ellipse((152, 342, 172, 362), fill=(60, 40, 20))
    # chuôi quấn
    d.line([(150, 364), (52, 462)], fill=(26, 22, 30), width=30)
    for i in range(7):
        t = i / 7 + .05
        x, y = 150 - 98 * t, 364 + 98 * t
        d.line([(x - 13, y - 3), (x + 3, y + 13)], fill=ORANGE, width=8)
    d.ellipse((34, 446, 66, 478), fill=(214, 168, 70))
    # tua dây cam
    d.line([(50, 470), (40, 506), (60, 500)], fill=ORANGE, width=6)
    return img


def to_icon(img: Image.Image) -> Image.Image:
    small = img.resize((128, 128), Image.LANCZOS)
    alpha = small.split()[3].point(lambda v: 255 if v > 110 else 0)
    rgb = small.convert("RGB").quantize(colors=24, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGBA")
    rgb.putalpha(alpha)
    return rgb


def to_pixel(img: Image.Image) -> Image.Image:
    small = img.resize((128, 128), Image.LANCZOS).convert("RGB")
    q = small.quantize(colors=40, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
    return q.convert("RGBA")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--preview", help="ghi thêm bản phóng to ×4 để xem")
    args = ap.parse_args()
    from build_units import _publish
    from art_source import normalize_jung_portrait

    redraw = os.path.join(DB, "art-source", "motion", "redraw")
    source = os.path.join(redraw, "jung_afterglow-portrait-source.png")
    if os.path.isfile(source):
        with Image.open(source) as portrait:
            out = normalize_jung_portrait(portrait)
    else:
        out = to_pixel(paint())
    os.makedirs(redraw, exist_ok=True)
    out.save(os.path.join(redraw, "jung_afterglow-portrait.png"), optimize=True)
    _publish("units/heroes/jung_afterglow-portrait.png", out, (128, 128))
    icon = to_icon(paint_katana())
    icon_path = os.path.join(DB, "ui", "weapons", "jung_afterglow.png")
    icon.save(icon_path, optimize=True)
    print("wrote ui/weapons/jung_afterglow.png")
    import hashlib
    import json
    man_path = os.path.join(DB, "manifest.json")
    with open(man_path, encoding="utf8") as f:
        man = json.load(f)
    for rel, im in (("ui/weapons/jung_afterglow.png", icon), ("units/heroes/jung_afterglow-portrait.png", out)):
        data = open(os.path.join(DB, rel), "rb").read()
        man["files"][rel] = {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "width": im.width, "height": im.height}
    with open(man_path, "w", encoding="utf8") as f:
        f.write(json.dumps(man, ensure_ascii=False, indent=2) + chr(10))
    if args.preview:
        icon.resize((256, 256), Image.NEAREST).save(args.preview.replace(".png", "-katana.png"))
        out.resize((512, 512), Image.NEAREST).save(args.preview)


if __name__ == "__main__":
    main()
