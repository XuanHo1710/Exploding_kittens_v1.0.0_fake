#!/usr/bin/env python3
"""
Screen art and the app icon drawn by agy (decisions.md §10): the loading screen, the login background and the
favicon / Home-Screen icon. ONE generate_image each, accepted as drawn (agy one-shot rule).

  python3 tools/agy/ui_pack.py prompt <key|all>        # tmp/prompts/ui/<key>.md + tmp/agy-requests/ui-<key>.txt
  python3 tools/agy/ui_pack.py normalize <key> --input tmp/mons-refs/ui-<key>-raw.png [--anchor 1] [--patch x0,y0,x1,y1,dx,dy]
  python3 tools/agy/ui_pack.py check <key|all>         # check_gen3 line per output (automatic, no visual review)
  python3 tools/agy/ui_pack.py list

Keys:
  loading  390x180 native backdrop of the Boot scene  -> assets/ui/Screens/loading.png
  login    390x180 native backdrop of the login form  -> assets/ui/Screens/login.png
  icon     64x64 native emblem on transparency        -> assets/ui/Icons/app/app-icon.png, then tools/ui/app_icons.py
           builds game/public/icons/ (favicon.ico 16/32/48, favicon-32.png, icon-180/192/512.png) from it.
normalize: the backdrops are cropped to 390:180 (--anchor), snapped to 128 colours, downscaled to native by the majority
rule (the draft is not on an exact pixel grid; --patch repaints a watermark first) and sent through the Gen 3 pass (tools/gen3/gen3.py: BGR555, <= 15 colours per 8x8 tile).
The icon: #FF00FF keyed out, cropped to the emblem, fitted into 60 px of the 64 px square, 15 colours + transparency.
The PC shows the middle 320 columns of a backdrop (x 35..354), like the wide Battle Scenes.
"""
import argparse
import os
import subprocess
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
sys.path.insert(0, os.path.join(REPO, "tools", "gen3"))
SCREENS = os.path.join(REPO, "assets", "ui", "Screens")
APP = os.path.join(REPO, "assets", "ui", "Icons", "app")
PROMPTS = os.path.join(REPO, "tmp", "prompts", "ui")
REQS = os.path.join(REPO, "tmp", "agy-requests")
RAW = os.path.join(REPO, "tmp", "mons-refs")
SCREEN_REF = "assets/skills/image.png"              # the Gen 3 battle screen (palette / pixel feel)
TITLE_REF = "assets/ui/_preview/phone-title.png"    # the Mons title screen (UI kit colours, 390x180)
CENTER_REF = "assets/structures/Civic/pokemon-center/pokemon-center-structure.png"
KIT_REF = "assets/ui/_preview/kit.png"
UI_PALETTES = 99                                    # check_gen3 budget for UI files (expedition-ui-generator SKILL.md)

COMMON = (
    "Original pixel art for a Game Boy Advance era monster-catching game called Mons (Gen 3 Ruby / Sapphire / "
    "Emerald look). The attached screenshots show the game's own screens: copy only their pixel style, palette feel "
    "and scale, never their exact contents, HUD, windows or text. GBA look: crisp square pixels, flat colours with "
    "2-4 tone ramps, dithering only in the sky, a dark outline on foreground shapes, no anti-aliasing, no blur, no "
    "soft glow, no gradients, no photo, no 3D render. No text, no letters, no numbers, no logos, no watermark, no "
    "official game characters or official logos: everything is an original design.")

SHEETS = {
    "loading": dict(
        out="assets/ui/Screens/loading.png", ratio="16:9", refs=[TITLE_REF, SCREEN_REF], native=(390, 180),
        what=(
            "A wide title / loading screen illustration, 390x180 art pixels (draw it as if every art pixel were a "
            "4x4 block), landscape at DUSK: a warm orange-pink-violet sky with a few pixel clouds and the first stars, "
            "a grassy hill in the foreground on the lower third, far blue mountains and a small town's lit windows in "
            "the valley. On the hill crest stand dark silhouettes: a young trainer with a cap and a backpack seen from "
            "behind, pointing at the horizon, and 2-3 small ORIGINAL creature silhouettes beside them (a round bird on "
            "a post, a fox-like quadruped with a big tail, a small round blob) — original shapes, not any existing "
            "game monster. The trainer and creatures stand in the MIDDLE of the picture (the central 80 % of the "
            "width): the outer 10 % on the left and right may be cut on narrow screens. Keep the band from 70 % to "
            "88 % of the height calm and fairly dark (grass in shadow, few details): a loading bar and a short line "
            "of text are drawn there by the game. Nothing important in the top or bottom 8 % (they may be cropped). "
            "Calm, hopeful mood.")),
    "login": dict(
        out="assets/ui/Screens/login.png", ratio="16:9", refs=[CENTER_REF, TITLE_REF, SCREEN_REF], native=(390, 180),
        what=(
            "A wide backdrop for the login screen, 390x180 art pixels (draw it as if every art pixel were a 4x4 "
            "block): a small town square at NIGHT seen from the front in the Gen 3 overworld 3/4 view, deep navy-blue "
            "sky with stars and a moon, the first attached building (the game's own healing center: scarlet ribbed "
            "dome roof, cream walls) on the far left, a few houses with warm yellow lit windows on the far right, "
            "street lamps with soft pixel light pools, a cobbled plaza with a small round fountain and flower beds in "
            "the foreground. Calm, quiet, nobody walking around. The MIDDLE of the picture (the central 50 % of the "
            "width and 15-90 % of the height) must stay EMPTY and low-contrast — just dark sky and plain plaza "
            "paving — because the login form (name, password, buttons) is drawn there on top. Detailed buildings "
            "only near the left and right edges, but keep them inside the central 82 % of the width so a narrower "
            "crop still shows them. Nothing important in the top or bottom 8 %.")),
    "icon": dict(
        out="assets/ui/Icons/app/app-icon.png", ratio="1:1", refs=[KIT_REF, TITLE_REF], native=(64, 64),
        what=(
            "ONE app icon / favicon emblem, 64x64 art pixels (draw it as if every art pixel were an 8x8 block, big "
            "and bold), centred on the square and filling about 85 % of it: an ORIGINAL round emblem inspired by a "
            "capture sphere but NOT the official red-white ball: a sphere split diagonally into a teal-green upper "
            "half (#3898a0 / #96e6d4) and a cream lower half (#fcf6e4 / #e8dcc2), a navy band (#1c1e3a) across the "
            "split with a small golden four-point star in its centre, and on the upper half a bold blocky cream "
            "letter M (the only letter allowed, simple and thick, 2-art-pixel strokes). A 2-art-pixel navy outline "
            "around the whole sphere, one white highlight in the upper left. Few, large shapes so it is still "
            "readable when shrunk to 16x16. At most 15 colours. Background: ONE flat solid pure magenta #FF00FF "
            "everywhere around the emblem (no shadow, no border, no frame, no checkerboard); never use #FF00FF "
            "inside the emblem.")),
}


def prompt(key):
    s = SHEETS[key]
    common = COMMON if key != "icon" else COMMON.replace("No text, no letters", "No text, no other letters")
    return f"{common}\n\n{s['what']}"


def request_vi(key):
    s = SHEETS[key]
    raw = os.path.join(RAW, f"ui-{key}-raw.png")
    refs = ", ".join(f"`{r}`" for r in s["refs"])
    what = {
        "loading": ("ảnh nền màn hình loading (390×180, hoàng hôn, bóng trainer và vài sinh vật nguyên bản trên đồi), "
                    "KHÔNG CHỮ, không logo; giữ phần quan trọng ở giữa, dải 70–88 % chiều cao để trống tối (thanh "
                    "loading + chữ do game vẽ)"),
        "login": ("ảnh nền màn hình đăng nhập (390×180, quảng trường thị trấn ban đêm, cửa sổ sáng đèn), KHÔNG CHỮ, "
                  "không logo; phần GIỮA để trống, tương phản thấp (form đăng nhập vẽ đè lên)"),
        "icon": ("biểu tượng app / favicon (64×64, quả cầu nguyên bản hai màu teal / kem, đai navy có ngôi sao vàng, "
                 "chữ M khối — KHÔNG phải Poké Ball chính thức), nền một màu phẳng #FF00FF"),
    }[key]
    outs = s["out"] + ("` và `game/public/icons/" if key == "icon" else "")
    return (f"Vẽ {what} cho game Mons (pixel art Gen 3). Mở `tmp/prompts/ui/{key}.md` và làm đúng thứ tự: (1) Đúng MỘT "
            f"lần `generate_image` (tỉ lệ {s['ratio']}) với prompt trong file, đính kèm {refs} (ảnh của chính game, chỉ "
            f"để lấy phong cách, bảng màu và tỉ lệ pixel). Lưu ảnh gốc đúng tên `{raw}`. 1 generate_image, không lặp "
            f"lại, không thử lần hai, không sửa ảnh. (2) Chạy lần lượt (mỗi lệnh một lần): "
            f"`python3 tools/agy/ui_pack.py normalize {key} --input {raw}` và `python3 tools/agy/ui_pack.py check {key}`; "
            f"chỉ ghi lại kết quả check. Trả lời cuối ghi rõ: CHECK: <các dòng kết quả>. Chỉ ghi vào `tmp/mons-refs/`, "
            f"`{outs}`; KHÔNG đụng file nào khác.")


def write_prompts(keys):
    os.makedirs(PROMPTS, exist_ok=True)
    os.makedirs(REQS, exist_ok=True)
    for k in keys:
        s = SHEETS[k]
        md = (f"# Mons UI art `{k}` → `{s['out']}`\n\nONE `generate_image` (ratio {s['ratio']}), attach "
              f"{', '.join('`' + r + '`' for r in s['refs'])} (the game's own screens: style only). Save the raw image as "
              f"`tmp/mons-refs/ui-{k}-raw.png`. Accepted as drawn.\n\n```\n{prompt(k)}\n```\n\nAfter generating:\n\n"
              f"```bash\npython3 tools/agy/ui_pack.py normalize {k} --input tmp/mons-refs/ui-{k}-raw.png\n"
              f"python3 tools/agy/ui_pack.py check {k}\n```\n")
        open(os.path.join(PROMPTS, f"{k}.md"), "w", encoding="utf-8").write(md)
        open(os.path.join(REQS, f"ui-{k}.txt"), "w", encoding="utf-8").write(request_vi(k))
        print(f"tmp/prompts/ui/{k}.md, tmp/agy-requests/ui-{k}.txt")


# ---------------------------------------------------------------- normalize / check (Pillow)
def is_mag(p):
    r, g, b = p[:3]
    return (r - 255) ** 2 + g ** 2 + (b - 255) ** 2 < 110 ** 2 or (r > 150 and b > 150 and g < 90 and abs(r - b) < 70)


def backdrop(src, size, anchor=0.5, patches=()):
    """crop to the native aspect (`anchor` 0 = keep the top, 0.5 = the centre, 1 = the bottom), snap the draft to 128
    colours (removes JPEG noise), then each native pixel takes the most common colour of its box (majority rule: the
    draft's pixel blocks need not line up with the native grid), then the Gen 3 pass.
    `patches`: (x0, y0, x1, y1, dx, dy) boxes in draft pixels repainted from the pixels at (+dx, +dy) — e.g. a mark
    in a corner covered with the grass next to it."""
    from PIL import Image
    import gen3
    im = Image.open(src).convert("RGB")
    for x0, y0, x1, y1, dx, dy in patches:
        im.paste(im.crop((x0 + dx, y0 + dy, x1 + dx, y1 + dy)), (x0, y0))
    w, h = im.size
    tw, th = size
    if w * th > h * tw:                        # wider than 390:180: cut the sides
        nw = round(h * tw / th)
        x = round((w - nw) * anchor)
        im = im.crop((x, 0, x + nw, h))
    else:                                      # taller (a 16:9 draft): cut top and bottom
        nh = round(w * th / tw)
        y = round((h - nh) * anchor)
        im = im.crop((0, y, w, y + nh))
    q = im.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = q.getpalette()
    src_px, (qw, qh) = q.load(), q.size
    out = Image.new("RGBA", size)
    px = out.load()
    for y in range(th):
        for x in range(tw):
            counts = {}
            for yy in range(y * qh // th, max(y * qh // th + 1, (y + 1) * qh // th)):
                for xx in range(x * qw // tw, max(x * qw // tw + 1, (x + 1) * qw // tw)):
                    i = src_px[xx, yy]
                    counts[i] = counts.get(i, 0) + 1
            i = max(counts, key=counts.get)
            px[x, y] = tuple(pal[3 * i:3 * i + 3]) + (255,)
    # opaque backdrop: BGR555, <= 15 colours per 8x8 tile, colours merged until the tiles fit the UI check budget
    return gen3.to_gen3(out, max_palettes=UI_PALETTES).convert("RGB")


def emblem(src, size):
    from PIL import Image
    import gen3
    im = Image.open(src).convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if is_mag(px[x, y]) or px[x, y][3] < 128:
                px[x, y] = (0, 0, 0, 0)
    box = im.getbbox()
    if not box:
        sys.exit("FAIL: the raw image has no emblem (all #FF00FF)")
    im = im.crop(box)
    side = max(im.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    inner = size[0] - 4                        # 2 px free on every side
    sm = sq.resize((inner, inner), Image.BOX)  # Pillow resamples RGBA premultiplied: no magenta fringe
    alpha = sm.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    q = sm.convert("RGB").quantize(colors=15, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGBA")
    q.putalpha(alpha)
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    out.alpha_composite(q, (2, 2))
    return gen3.to_gen3(out)


def normalize(key, src, anchor=0.5, patches=()):
    s = SHEETS[key]
    dst = os.path.join(REPO, s["out"])
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    img = emblem(src, s["native"]) if key == "icon" else backdrop(src, s["native"], anchor, patches)
    img.save(dst)
    print(f"{s['out']} {img.width}x{img.height}")
    if key == "icon":                          # the favicon / Home-Screen sizes are built from the art
        subprocess.run([sys.executable, os.path.join(REPO, "tools", "ui", "app_icons.py")], check=True)


def check(keys):
    bad = 0
    for k in keys:
        f = os.path.join(REPO, SHEETS[k]["out"])
        if not os.path.isfile(f):
            print(f"FAIL {k}: {SHEETS[k]['out']} missing")
            bad += 1
            continue
        r = subprocess.run([sys.executable, os.path.join(REPO, "tools", "gen3", "check_gen3.py"), "--grid", "1",
                            "--max-palettes", str(UI_PALETTES), f], capture_output=True, text=True)
        print(r.stdout.strip() or r.stderr.strip())
        bad += r.returncode != 0
    sys.exit(1 if bad else 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["prompt", "normalize", "check", "list"])
    ap.add_argument("key", nargs="?", default="all")
    ap.add_argument("--input")
    ap.add_argument("--anchor", type=float, default=0.5,
                    help="backdrops: which part the aspect crop keeps (0 top / left, 0.5 centre, 1 bottom / right)")
    ap.add_argument("--patch", action="append", default=[], metavar="X0,Y0,X1,Y1,DX,DY",
                    help="backdrops: repaint this box (draft px) from the pixels shifted by DX,DY (a watermark); repeatable")
    a = ap.parse_args()
    keys = list(SHEETS) if a.key == "all" else [a.key]
    if any(k not in SHEETS for k in keys):
        sys.exit(f"unknown key {a.key}; one of {', '.join(SHEETS)}")
    if a.cmd == "list":
        for k, s in SHEETS.items():
            print(f"{k:8s} {s['native'][0]}x{s['native'][1]} -> {s['out']}")
    elif a.cmd == "prompt":
        write_prompts(keys)
    elif a.cmd == "normalize":
        if not a.input or len(keys) != 1:
            sys.exit("normalize <key> --input <raw.png>")
        normalize(keys[0], a.input, a.anchor, [tuple(int(v) for v in p.split(",")) for p in a.patch])
    else:
        check(keys)


if __name__ == "__main__":
    main()
