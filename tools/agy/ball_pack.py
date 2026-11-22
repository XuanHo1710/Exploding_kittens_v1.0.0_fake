#!/usr/bin/env python3
"""
Prompt pack for one Poké Ball sprite sheet (agy, ONE generate_image per ball, accepted as drawn):
  tmp/prompts/<id>-ball.md                 the prompt + attachments + the commands to run after
  tmp/prompts/balls/<id>-guide.png         pose guide laid out like the sheet (8 x 6 slots of 128 px on #FF00FF, or
                                           #00FF00 for the purple / pink balls of ballkit.GREEN_BG): a
                                           ROUND ball (ray-cast sphere in two hemispheres, coloured from the ball's
                                           reference item icon) in the poses of the 3D reference animation
                                           (spin, lid angles, shake tilt, break-out lid flip) + Gen 3 effects (flash
                                           burst, capture stars at pokeemerald's offsets). The reference's own model is a
                                           voxel cube, so it is not rendered (user: round pixel balls only).
  tmp/prompts/balls/<id>-icon.png          reference item icon x8 (colours)
  tmp/prompts/balls/<id>-artwork.png       official artwork (PokeAPI dream-world item art, else the item sprite)
  tmp/agy-requests/ball-<id>.txt           the Vietnamese request for tools/agy/agy_queue.py

Needs numpy and MONS_REF_ASSETS=<3D reference assets dir>:
  $MONS_PY3D tools/agy/ball_pack.py poke master …   (or `all`)
"""
import argparse
import math
import os
import sys
import urllib.request

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
sys.path.insert(0, os.path.join(REPO, "tools/items"))
import ballkit as K  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

G = 128            # guide slot px
RAD = 24           # ball radius in the guide (48 px = ~38 % of the slot, like the 12 px ball in a 32 px cell)
ELEV = 20          # camera above the ball (degrees)
MAG = (255, 0, 255, 255)
GREEN = (0, 255, 0, 255)       # purple / pink balls (ballkit.GREEN_BG) are drawn on green
OUTLINE = (24, 24, 42)
INSIDE = np.array([236, 236, 246], float)
LIGHT = np.array([-0.45, 0.75, 0.55]); LIGHT /= np.linalg.norm(LIGHT)


def Rx(a):
    a = math.radians(a); c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def Rz(a):
    a = math.radians(a); c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


class Icon:
    """samples the round reference item icon as the front view of the ball"""
    def __init__(self, im):
        self.a = np.asarray(im.convert("RGBA")).astype(float)
        x0, y0, x1, y1 = im.convert("RGBA").getbbox()
        self.cx, self.cy, self.r = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2 - 1.0

    def sample(self, x, y, z):
        back = z < 0
        x, y = x * 0.86, y * 0.86                                 # stay off the icon's outline
        x = np.where(back, np.where(x < 0, -0.62, 0.62), x)      # back half: clean colour bands, no button / mottling
        u = np.clip((self.cx + x * self.r).astype(int), 0, self.a.shape[1] - 1)
        v = np.clip((self.cy - y * self.r).astype(int), 0, self.a.shape[0] - 1)
        c = self.a[v, u]
        return np.where(c[..., 3:4] > 100, c[..., :3], INSIDE)


def render_ball(icon, spin=0.0, pitch=0.0, tilt=0.0, lid=0.0, elev=ELEV, dark=0.0):
    """ray-cast the ball (unit sphere cut into a bottom and a lid hemisphere) into a G x G RGBA cell.
    spin / pitch: degrees about x through the centre (+ = top toward the viewer); tilt: degrees about z through the
    contact point (- = to the left); lid: open angle (degrees) about the hinge at the back of the band."""
    e = math.radians(elev)
    d = np.array([0, -math.sin(e), -math.cos(e)])
    X, Y = np.array([1.0, 0, 0]), np.array([0, math.cos(e), -math.sin(e)])
    ys, xs = np.mgrid[0:G, 0:G]
    sx, sy = (xs + 0.5 - G / 2) / RAD, -(ys + 0.5 - G / 2) / RAD
    O = sx[..., None] * X + sy[..., None] * Y - 5 * d
    # bottom part: world = Rt (Rp p - c) + c, c = contact point (0, -1, 0)
    c = np.array([0, -1.0, 0])
    Rp, Rt = Rx(-(spin + pitch)), Rz(-tilt)
    A = Rt @ Rp

    def to_local(M, t):          # world = M p + t  ->  p = M^T (world - t)
        return (O - t) @ M, d @ M

    tb = c - Rt @ c
    H = Rx(-lid); h = np.array([0, 0, -1.0])
    Al, tl = A @ H, A @ (h - H @ h) + tb          # lid: world = A (H (p - h) + h) + tb
    best_t = np.full((G, G), np.inf); col = np.zeros((G, G, 3)); nrm = np.zeros((G, G, 3))
    for M, t, half in ((A, tb, -1), (Al, tl, 1)):
        o, dl = to_local(M, t)
        b = o @ dl
        cc = (o * o).sum(-1) - 1
        disc = b * b - cc
        ok = disc >= 0
        sq = np.sqrt(np.where(ok, disc, 0))
        for tt in (-b - sq, -b + sq):
            p = o + tt[..., None] * dl
            hit = ok & (p[..., 1] * half >= 0) & (tt < best_t)
            best_t = np.where(hit, tt, best_t)
            col = np.where(hit[..., None], icon.sample(p[..., 0], p[..., 1], p[..., 2]), col)
            nrm = np.where(hit[..., None], p @ M.T, nrm)
        tt = -o[..., 1] / dl[1] if abs(dl[1]) > 1e-9 else np.full((G, G), 1e9)
        p = o + tt[..., None] * dl
        hit = ((p[..., 0] ** 2 + p[..., 2] ** 2) <= 1) & (tt < best_t)
        best_t = np.where(hit, tt, best_t)
        col = np.where(hit[..., None], INSIDE, col)
        nw = np.array([0, -half, 0.0]) @ M.T
        nw = nw if nw @ d < 0 else -nw
        nrm = np.where(hit[..., None], nw, nrm)
    mask = np.isfinite(best_t)
    shade = 0.6 + 0.4 * np.clip(nrm @ LIGHT, 0, 1)
    rgb = np.clip(col * shade[..., None] * (1 - dark), 0, 255)
    out = np.zeros((G, G, 4), np.uint8)
    out[mask, :3] = rgb[mask]; out[mask, 3] = 255
    grow = mask.copy()                                      # 2 px dark outline
    for _ in range(2):
        g = grow.copy()
        g[1:] |= grow[:-1]; g[:-1] |= grow[1:]; g[:, 1:] |= grow[:, :-1]; g[:, :-1] |= grow[:, 1:]
        grow = g
    edge = grow & ~mask
    out[edge, :3] = OUTLINE; out[edge, 3] = 255
    return Image.fromarray(out, "RGBA")


def star(d, cx, cy, r, fill=(255, 230, 60), outline=OUTLINE):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=fill, outline=outline)


def burst(d, cx, cy, r, tint, rays=8):
    for i in range(rays):
        a = i * 2 * math.pi / rays + math.pi / rays
        d.polygon([(cx + r * math.cos(a), cy + r * math.sin(a)),
                   (cx + r * 0.25 * math.cos(a + 0.5), cy + r * 0.25 * math.sin(a + 0.5)),
                   (cx + r * 0.25 * math.cos(a - 0.5), cy + r * 0.25 * math.sin(a - 0.5))], fill=tint)
    d.ellipse((cx - r * 0.42, cy - r * 0.42, cx + r * 0.42, cy + r * 0.42), fill=(255, 255, 255))


def sparks(d, cx, cy, r, tint, n=8):
    for i in range(n):
        a = i * 2 * math.pi / n
        x, y = cx + r * math.cos(a), cy + r * math.sin(a)
        d.rectangle((x - 3, y - 3, x + 3, y + 3), fill=tint)
        d.rectangle((x - 1, y - 1, x + 1, y + 1), fill=(255, 255, 255))


def tint_of(icon):
    """most common saturated colour of the item icon (flash rays), else pale yellow"""
    cols = {}
    for p in np.asarray(icon.convert("RGBA")).reshape(-1, 4).tolist():
        if p[3] > 200 and max(p[:3]) - min(p[:3]) > 60:
            cols[tuple(p[:3])] = cols.get(tuple(p[:3]), 0) + 1
    c = max(cols, key=cols.get) if cols else (255, 240, 150)
    return tuple(min(255, int(v * 0.5 + 128)) for v in c)       # lightened: a flash, not a solid blob


def load_icon(bid):
    """the reference 16x16 item icon; the Strange Ball has none: its official artwork (white keyed out) instead"""
    p = os.path.join(K.REF_ASSETS, "textures/item/poke_balls", f"{bid}_ball.png")
    if os.path.isfile(p):
        return Image.open(p).convert("RGBA")
    a = np.asarray(Image.open(artwork(bid) or sys.exit(f"{bid}: no icon and no artwork")).convert("RGBA")).copy()
    a[(a[..., :3] > 245).all(-1)] = 0
    return Image.fromarray(a, "RGBA")


def guide(bid, out):
    icon = load_icon(bid)
    ic = Icon(icon)
    tint = tint_of(icon)
    # poses from the 3D reference animation (data/battle/pokeball-animation.json): throw spins -720 deg/s (45 deg a frame here); open: lid -70
    # (-100 at the peak), bottom +35; shake: Gen 3 tilts (~34 / ~21 deg) as 15 / 30; break: lid flies to -163
    rows = [
        [(dict(spin=45 * i), {}) for i in range(8)],
        [(dict(lid=40, pitch=10), {}), (dict(lid=80, pitch=20), {}), (dict(lid=80, pitch=20), {"burst": 56}),
         (dict(lid=80, pitch=20), {"sparks": 50})],
        [(dict(), {}), (dict(tilt=-15), {}), (dict(tilt=-30), {}), (dict(tilt=15), {}), (dict(tilt=30), {})],
        [(dict(), {"click": 1}), (dict(dark=0.3), {"stars": 0.45}), (dict(), {"stars": 0.8}), (dict(), {"stars": 1.0, "small": 1})],
        [(dict(pitch=10, tilt=4), {}), (dict(lid=150, pitch=10), {}), (dict(lid=150, pitch=10), {"burst": 60}), (None, {"sparks": 54})],
        [(dict(elev=10), {})],
    ]
    im = Image.new("RGBA", (G * K.COLS, G * len(K.ROWS)), GREEN if K.bg_of(bid) == "green" else MAG)
    for r, row in enumerate(rows):
        for c, (pz, fx) in enumerate(row):
            cell = Image.new("RGBA", (G, G), (0, 0, 0, 0))
            cx, cy = G / 2, G / 2
            if pz is not None:
                cell.alpha_composite(render_ball(ic, **pz))
            d = ImageDraw.Draw(cell)
            if "burst" in fx:
                burst(d, cx, cy - 6, fx["burst"], tint)
            if "sparks" in fx:
                sparks(d, cx, cy, fx["sparks"] * 0.9, tint)
            if fx.get("click"):
                star(d, cx, cy + 3, 8, fill=(255, 255, 255))
            if "stars" in fx:
                k = fx["stars"]
                rr = 6 if fx.get("small") else 10
                for ox, oy, amp in ((10, 2, -3), (15, 0, -4), (-10, 2, -4)):   # pokeemerald sCaptureStars
                    star(d, cx + ox * 4 * k, cy - 20 + (oy + amp * 4 * math.sin(math.pi * min(1, k))) * 4 * 0.6 - 14 * k, rr)
            im.alpha_composite(cell, (c * G, r * G))
    im.convert("RGB").save(out)
    if not os.path.isfile(os.path.join(K.REF_ASSETS, "textures/item/poke_balls", f"{bid}_ball.png")):
        icon = Image.open(os.path.join(K.REF_ASSETS, "textures/poke_balls", f"{bid}_ball.png"))   # model texture
    big = icon.convert("RGBA").resize((icon.width * 8, icon.height * 8), Image.NEAREST)
    bg = Image.new("RGBA", big.size, MAG)
    bg.alpha_composite(big)
    bg.convert("RGB").save(os.path.join(K.REFS, f"{bid}-icon.png"))


def artwork(bid):
    """official artwork (optional): PokeAPI dream-world item art, else the item sprite; '' if none"""
    dst = os.path.join(K.REFS, f"{bid}-artwork.png")
    if os.path.isfile(dst):
        return dst
    slug = f"{bid}-ball"
    for url in (f"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/dream-world/{slug}.png",
                f"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/{slug}.png"):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                data = r.read()
            if data[:8] == b"\x89PNG\r\n\x1a\n":
                tmp = dst + ".part"
                open(tmp, "wb").write(data)
                a = Image.open(tmp).convert("RGBA")
                k = max(1, 360 // max(a.size))
                a = a.resize((a.width * k, a.height * k), Image.NEAREST)
                bg = Image.new("RGBA", a.size, (255, 255, 255, 255))
                bg.alpha_composite(a)
                bg.convert("RGB").save(dst)
                os.remove(tmp)
                return dst
        except Exception:
            continue
    return ""


PROMPT = """Pixel art sprite sheet for a Game Boy Advance Pokémon game (Gen 3: Ruby / Sapphire / Emerald battle screen):
ALL the battle animation frames of ONE item, the {name}, on ONE image. Layout: an invisible grid of 8 columns x 6 rows
of equal square slots (the image is 4:3); do NOT draw the grid. Each frame is centred in its slot with generous empty
space around it; unused slots at the end of a row stay empty background. The ball is ROUND (a sphere, never a cube)
and drawn the SAME size in every frame, about 40 % of the slot width (a big ball, about 48-60 px across), with
chunky clear square pixels and simple shapes (no tiny noisy detail), seen from the front and a little from above,
exactly at the angle of the matching slot in the 3D guide.

ROW 1 - THROW, 8 frames: the closed ball spinning forward in the air, 45 degrees more per frame (one full turn: the
  button and the band roll over the top toward the viewer, round the back and up again), same size, no motion lines.
ROW 2 - OPEN, 4 frames: 1 lid half open (hinged at the back), 2 lid wide open with white light inside, 3 the open
  ball with a big bright flash burst bursting from it (white core, rays tinted with the ball's colours), 4 the burst
  breaking into small sparkles, lid still open.
ROW 3 - SHAKE, 5 frames, the closed ball resting on the ground (no ground drawn): 1 upright, 2 tilted 15 degrees to
  the LEFT, 3 tilted 30 degrees to the LEFT, 4 tilted 15 degrees to the RIGHT, 5 tilted 30 degrees to the RIGHT; it
  tilts on its bottom point, so the bottom stays on the same line.
ROW 4 - CAUGHT, 4 frames, closed upright ball: 1 the button flashes white (click), 2 the ball a little darker and 3
  small yellow stars pop out just above it, 3 the 3 stars fly up and out in arcs (two to the right, one to the
  left), 4 the stars small and far, the ball back to normal colour.
ROW 5 - BREAK OUT, 4 frames: 1 the closed ball jolts (squashed a little), 2 the lid bursts wide open, 3 a big white
  flash burst with rays from the open ball, 4 only the fading burst sparks, no ball.
ROW 6 - ICON, 1 frame: the closed ball upright, front view with the button facing us (bag-icon look).

BALL DESIGN: {notes}. Copy the colours, the colour bands and the markings from the attached artwork and the attached
reference icon; the band and the button are in the middle, the button faces the viewer when upright.

GBA look: crisp square pixels, at most 15 colours plus a 1-pixel dark outline (#18182a) around the ball, flat colours
with 2-3 tones and a small white shine, no anti-aliasing, no blur, no soft glow, no gradients, no 3D render. Bold,
readable shapes that still read when the ball is shown only 12 px wide.
Background: one flat solid pure {bgname} {bghex} everywhere, nothing else: no text, no numbers, no labels, no grid lines,
no borders, no frame boxes, no ground, no shadow, no scenery. Never use {bghex} inside the drawing{bgnote}.

ATTACHED IMAGES: (1) the official artwork of the {name} (found on the web): the drawing MUST match it - colours,
colour bands, markings, band and button; (2) the 3D reference item art of
the {name}: the same colours as pixel art; (3) the 3D POSE GUIDE, laid out exactly like the sheet (8 x 6 slots): each
slot shows the angle, lid position, tilt and effect position of that frame. The guide is a rough 3D pose reference:
copy only the angle, lid position, tilt and effect position, and draw a clean ROUND Gen 3 pixel ball (a circle with the band,
button and shine like the GBA battle ball sprites), never a cube or a blocky voxel shape."""


def pack(bid):
    _, name, notes = K.BY_ID[bid]
    green = K.bg_of(bid) == "green"
    bgfmt = dict(bgname="green" if green else "magenta", bghex="#00FF00" if green else "#FF00FF",
                 bgnote=" (no bright pure green anywhere in the ball)" if green else " (use pinks like #e060b0)")
    os.makedirs(K.REFS, exist_ok=True)
    g = os.path.join(K.REFS, f"{bid}-guide.png")
    guide(bid, g)
    art = artwork(bid)
    rel = lambda p: os.path.relpath(p, REPO)  # noqa: E731
    web = os.path.join(K.RAW_DIR, f"ball-{bid}-reference.png")       # agy saves the web reference here (step 0)
    icon = os.path.join(K.REFS, f"{bid}-icon.png")
    sheet = rel(K.sheet_path(bid))
    raw = K.raw_path(bid)
    folder_ref = os.path.join(K.folder(bid), f"{bid}-reference.png")      # ball_reference.py, downloaded beforehand
    if os.path.isfile(folder_ref):
        art = folder_ref
    md = f"""# {name} — Poké Ball sprite sheet prompt

Ball `{bid}` · output `{sheet}` (8 x 6 square cells, x2, layout in the .json) · skill `.agents/skills/expedition-summon-orb-generator/SKILL.md`

## Step 0 — official artwork from the web (required try)

Search the web for the official artwork / item sprite of the **{name}** (Bulbapedia / archives.bulbagarden.net,
Serebii itemdex, the official Pokémon site; a clear front view of the ball). Download the best one with a small
`.py` file you write in `/tmp/mons-refs/` and run with `python3 /tmp/mons-refs/<file>.py` (no long `python3 -c`),
saving it as `{web}` (PNG). Note the site you used. If nothing can be downloaded, use
`{rel(art) if art else rel(icon)}` instead and say so.

## Image — ONE `generate_image` call (aspect ratio 4:3), accepted as drawn

Attachments, in this order:
1. `{web}` (the web reference; fallback `{rel(art) if art else rel(icon)}`)
2. `{rel(icon)}` (3D reference item art: colours and markings)
3. `{rel(g)}` (round pose guide, laid out like the sheet: angles, lid, tilt, effect positions only)

Save the image exactly as `{raw}`.

```
{PROMPT.format(name=name, notes=notes, **bgfmt)}
```

## After generating (one command each)

```
python3 tools/items/normalize_ball.py --ball {bid} --input {raw}
python3 tools/items/check_ball.py {bid}
```
"""
    mdp = os.path.join(K.PROMPTS, f"{bid}-ball.md")
    open(mdp, "w", encoding="utf-8").write(md)
    req = (f"Vẽ LẠI sprite sheet Poké Ball cho {name} (bóng `{bid}`, skill expedition-summon-orb-generator): bóng **tròn, pixel art GBA, "
           f"không khối vuông, không khối lập phương**, phải GIỐNG official art (màu, dải giữa, hoa văn, nút bấm), lấy ý tưởng "
           f"tư thế từ pose guide 3D. Mở `{rel(mdp)}` và làm đúng thứ tự: (0) tìm ảnh official art của {name} trên web "
           f"(Bulbapedia / Serebii / trang Pokémon chính thức), tải bằng một file `.py` ghi trong `/tmp/mons-refs/` rồi chạy "
           f"`python3 /tmp/mons-refs/<tên>.py`, lưu thành `{web}` và ghi lại tên trang; tải không được thì dùng "
           f"`{rel(art) if art else rel(icon)}`. (1) Đúng MỘT lần `generate_image` (tỉ lệ 4:3) với prompt trong file, đính kèm "
           f"theo thứ tự: ảnh web vừa lưu (ảnh thiết kế chính), `{rel(icon)}`, `{rel(g)}`. Bóng to (khoảng 48-60 px mỗi khung), "
           f"pixel to rõ, nền một màu {bgfmt['bghex']} phẳng{' (bóng tím / hồng nên vẽ trên nền XANH LÁ #00FF00, không dùng nền hồng tím)' if green else ''}, không chữ, không kẻ ô, không bóng đổ; nền một màu phẳng duy nhất {bgfmt['bghex']}, không kẻ ô, không bàn cờ. Lưu ảnh gốc đúng tên `{raw}`. "
           f"Không thử lần hai, không sửa ảnh. (2) Chạy lần lượt (mỗi lệnh một lần): "
           f"`python3 tools/items/normalize_ball.py --ball {bid} --input {raw}` và "
           f"`python3 tools/items/check_ball.py {bid}`; chỉ ghi lại kết quả check. Trả lời cuối "
           f"ghi rõ: REFERENCE: <có/không> <trang web>, CHECK: <dòng kết quả>. Thư mục `{rel(K.folder(bid))}/` chỉ giữ "
           f"`{bid}-ball.png`, `{bid}-ball.json` và `{bid}-reference.png` (nếu có; không xoá nó). KHÔNG đụng file nào khác.")
    rq = os.path.join(REPO, "tmp", "agy-requests", f"ball-{bid}.txt")
    open(rq, "w", encoding="utf-8").write(req)
    print(f"{bid}: {rel(mdp)} -> {rel(rq)}")


def main():
    ap = argparse.ArgumentParser(description="Prompt pack for Poké Ball sprite sheets (agy).")
    ap.add_argument("ids", nargs="+", help="ball ids (poke, master, …) or `all`")
    ids = ap.parse_args().ids
    if not os.path.isdir(K.REF_ASSETS):
        sys.exit("set MONS_REF_ASSETS to the 3D reference assets folder")
    if ids == ["all"]:
        ids = [b[0] for b in K.BALLS]
    for bid in ids:
        if bid not in K.BY_ID:
            sys.exit(f"unknown ball {bid}: {', '.join(K.BY_ID)}")
        pack(bid)


if __name__ == "__main__":
    main()
