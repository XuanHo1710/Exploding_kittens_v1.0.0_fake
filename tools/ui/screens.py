"""Full-screen menus composed from the UI kit: bag, summary, Mondex, title (PC and phone previews).

Shared frame: an ink background with 45-degree stripes, a title tab at the top left, content in
chamfered windows / cards, and on the phone a back button (B) at the bottom right.
"""
import json
import os

from PIL import Image, ImageDraw

import items as IT
import monsfont as F
import uikit as U
from previews import REPO, _mon, _save

ACC = U.ACCENT["water"]
TXT = dict(ink=U.TEXT, shadow=U.TEXT_SH)


def backdrop(W, H, title, acc=ACC):
    img = U.canvas(W, H)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, H], fill=U.INK2)
    for x in range(-H, W, 12):
        d.line([(x, H), (x + H, 0)], fill=U.shade(U.INK2, 1.15), width=4)
    U.tab(img, 4, 3, title, acc)
    return img


def phone_extras(img, acc):
    W, H = img.size
    U.round_button(img, W - 16, H - 16, 11, "B", U.CREAM, ink=U.INK, sh=U.CREAM_D)


def mon_icon(name):
    meta = json.load(open(os.path.join(REPO, "assets", "ui", "MonIcons", "icons.json")))
    f = meta["species"][name]["file"]
    return Image.open(os.path.join(REPO, "assets", "ui", "MonIcons", f)).convert("RGBA").crop((0, 0, 32, 32))


def type_chip(img, x, y, slug):
    U.type_icon(img, x, y, slug)


# ================================================================ bag
BAG = {
    "VẬT PHẨM": [("escape-rope", 2), ("repel", 4), ("map", 1)],
    "BÓNG": [("ball", 12), ("great-ball", 3)],
    "THUỐC": [("potion", 5), ("super-potion", 2), ("antidote", 3), ("revive", 1)],
    "QUẢ": [("berry", 7)],
    "CHÌA KHOÁ": [("key", 1), ("tm", 2)],
}
DESC = {"potion": ("Xịt lên một Pokémon để hồi", "20 HP."), "super-potion": ("Hồi 50 HP cho một Pokémon.", ""),
        "antidote": ("Chữa trạng thái trúng độc.", ""), "revive": ("Hồi sinh một Pokémon đã ngất", "với nửa HP.")}


def bag(dev, W, H):
    img = backdrop(W, H, "TÚI ĐỒ")
    pocket = "THUỐC"
    pad = 12 if sum(F.width(n) + 18 for n in BAG) < W - 74 else 6
    x = 70
    for name in BAG:                                       # pocket tabs along the top
        on = name == pocket
        w = F.width(name) + pad
        d = ImageDraw.Draw(img)
        U.chamfer(d, x, 3, x + w + 3, 15, U.INK, 3)
        U.chamfer(d, x + 1, 4, x + w + 2, 14, ACC[1] if on else U.CREAM, 2)
        F.draw(img, x + 2 + pad // 2, 6, name, ink=U.WHITE if on else U.INK, shadow=ACC[2] if on else U.CREAM_D)
        x += w + (6 if pad == 12 else 3)
    lw = 150
    lx = W - lw - 4
    items = BAG[pocket]
    sel = 0
    for i, (slug, n) in enumerate(items):                  # item list: 24 px icon, name, count
        y = 20 + i * 26
        on = i == sel
        cx = lx - (6 if on else 0)
        d = ImageDraw.Draw(img)
        U.chamfer(d, cx, y, W - 5, y + 24, U.INK, 5)
        U.chamfer(d, cx + 1, y + 1, W - 6, y + 23, ACC[1] if on else U.CREAM, 4)
        img.alpha_composite(IT.item(slug), (cx + 3, y + 1))
        nm = next(i2[1] for i2 in U.ITEMS if i2[0] == slug)
        F.draw(img, cx + 31, y + 10, nm, ink=U.WHITE if on else U.INK, shadow=ACC[2] if on else U.CREAM_D)
        F.draw(img, W - 24, y + 10, f"x{n}", ink=U.WHITE if on else U.INK, shadow=ACC[2] if on else U.CREAM_D)
    # left: the selected item large in a window
    U.window(img, 4, 22, lx - 14, 92, ACC)
    big = IT.item(items[sel][0]).resize((48, 48), Image.NEAREST)
    img.alpha_composite(big, (4 + (lx - 14) // 2 - 24, 32))
    nm = next(i2[1] for i2 in U.ITEMS if i2[0] == items[sel][0])
    F.draw(img, 4 + (lx - 14) // 2 - F.width(nm) // 2, 90, nm, **TXT)
    l1, l2 = DESC.get(items[sel][0], ("", ""))
    U.window(img, 4, 128, W - (34 if dev == "phone" else 8), 48, ACC)
    U.tab(img, 12, 118, "MÔ TẢ", ACC)
    F.draw(img, 16, 140, l1, **TXT)
    F.draw(img, 16, 156, l2, **TXT)
    if dev == "phone":
        phone_extras(img, ACC)
    return img


# ================================================================ summary
# Gen 3 stat system (docs/explanation/spec/06-gameplay-systems.md §3, data/pokemon/pokemon-stats-gen3.json)
STAT_ROWS = [("hp", "HP"), ("atk", "TẤN CÔNG"), ("def", "PHÒNG THỦ"), ("spa", "ĐẶC CÔNG"), ("spd", "ĐẶC THỦ"),
             ("spe", "TỐC ĐỘ")]
SAMPLE = dict(species=4, level=7, base=dict(hp=39, atk=52, def_=43, spa=60, spd=50, spe=65),
              ivs=dict(hp=12, atk=28, def_=9, spa=31, spd=17, spe=22), evs=dict(hp=4, atk=0, def_=6, spa=12, spd=0, spe=30),
              nature="modest", ability="blaze")
UP, DOWN = (232, 72, 64), (64, 128, 232)          # nature-raised stat red, lowered blue


def gen3_stats(base, ivs, evs, level, up, down):
    out = {}
    for k, _ in STAT_ROWS:
        kk = "def_" if k == "def" else k
        core = (2 * base[kk] + ivs[kk] + evs[kk] // 4) * level // 100
        if k == "hp":
            out[k] = core + level + 10
        else:
            mult = 1.1 if k == up else 0.9 if k == down else 1.0
            out[k] = int((core + 5) * mult)
    return out


MOVES = [("Cào", "normal", 35), ("Gầm Gừ", "normal", 40), ("Đốm Lửa", "fire", 25), ("Khói Mù", "normal", 20)]


def summary(dev, W, H):
    img = backdrop(W, H, "THÔNG TIN")
    lw = 128
    U.window(img, 4, 18, lw, 92, ACC)
    m = _mon(os.path.join(REPO, "assets/pokemon/Gen1-Kanto/004-Charmander/charmander-movement.png"), 0, 48)
    d = ImageDraw.Draw(img)
    d.ellipse([4 + lw // 2 - 24, 80, 4 + lw // 2 + 24, 90], fill=U.CREAM_D)
    img.alpha_composite(m, (4 + lw // 2 - m.width // 2, 87 - m.height))
    F.draw(img, 12, 26, "CHARMANDER", **TXT)
    F.draw(img, 12 + F.width("CHARMANDER") + 3, 26, "♂", ink=U.MALE, shadow=U.MALE_SH)
    U.hexa(img, lw - 26, 23, "7", ACC)
    type_chip(img, 12, 92, "fire")
    F.draw(img, 70, 96, "Số 004", **TXT)
    for i, (name, t, pp) in enumerate(MOVES):              # moves under the portrait
        y = 114 + i * 16
        U.card(img, 4, y, lw, 15, ACC, i == 2)
        on = i == 2
        F.draw(img, 10, y + 5, name, ink=U.WHITE if on else U.INK, shadow=ACC[2] if on else U.CREAM_D)
        F.draw(img, lw - 34, y + 5, f"PP {pp}", ink=U.WHITE if on else U.INK, shadow=ACC[2] if on else U.CREAM_D)
    data = json.load(open(os.path.join(REPO, "data", "units", "pokemon-stats-gen3.json")))
    nat = next(n for n in data["natures"] if n["key"] == SAMPLE["nature"])
    ab = data["abilities"][SAMPLE["ability"]]
    st = gen3_stats(SAMPLE["base"], SAMPLE["ivs"], SAMPLE["evs"], SAMPLE["level"], nat["up"], nat["down"])
    rx = lw + 12
    rw = W - rx - (30 if dev == "phone" else 4)
    U.window(img, rx, 18, rw, 104, ACC)
    U.tab(img, rx + 8, 8, "CHỈ SỐ", ACC)
    cv, ci, ce = rx + rw - 76, rx + rw - 48, rx + rw - 24        # value, IV, EV columns
    for x, t in ((cv, "SỐ"), (ci, "IV"), (ce, "EV")):
        F.draw(img, x, 27, t, ink=ACC[2], shadow=U.CREAM_D)
    d.line([(rx + 8, 37), (rx + rw - 9, 37)], fill=U.CREAM_D)
    for i, (k, label) in enumerate(STAT_ROWS):
        y = 43 + i * 12
        kk = "def_" if k == "def" else k
        col = UP if k == nat["up"] else DOWN if k == nat["down"] else U.TEXT
        F.draw(img, rx + 10, y, label, ink=col, shadow=U.TEXT_SH)
        F.draw(img, cv, y, str(st[k]), **TXT)
        F.draw(img, ci, y, str(SAMPLE["ivs"][kk]), **TXT)
        F.draw(img, ce, y, str(SAMPLE["evs"][kk]), **TXT)
    U.window(img, rx, 126, rw, 50, ACC)
    short = dict(atk="TC", def_="PT", spa="ĐC", spd="ĐT", spe="TĐ")      # Tấn công, Phòng thủ, Đặc công, Đặc thủ, Tốc độ
    F.draw(img, rx + 10, 134, "Tính cách: " + nat["name"], **TXT)
    if nat["up"]:
        x = rx + 14 + F.width("Tính cách: " + nat["name"])
        x = F.draw(img, x, 134, "+" + short[nat["up"] if nat["up"] != "def" else "def_"], ink=UP, shadow=U.TEXT_SH)
        F.draw(img, x + 4, 134, "-" + short[nat["down"] if nat["down"] != "def" else "def_"], ink=DOWN, shadow=U.TEXT_SH)
    F.draw(img, rx + 10, 148, "Đặc tính: " + ab["name"], **TXT)
    eff = ab["effect"]
    F.draw(img, rx + 10, 161, eff if F.width(eff) < rw - 20 else eff[:28] + "...", ink=U.INK2, shadow=U.CREAM_D)
    if dev == "phone":
        phone_extras(img, ACC)
    return img


# ================================================================ Mondex
DEX = [("Bulbasaur", 1, True), ("Ivysaur", 2, True), ("Venusaur", 3, False), ("Charmander", 4, True),
       ("Charmeleon", 5, True), ("Charizard", 6, False), ("Squirtle", 7, True)]


def mondex(dev, W, H):
    img = backdrop(W, H, "MONDEX")
    F.draw(img, 80, 6, "Đã thấy 7   Đã bắt 5", ink=U.CREAM, shadow=U.INK)
    lw = 140
    sel = 3
    for i, (name, no, caught) in enumerate(DEX):
        y = 18 + i * 22
        on = i == sel
        x = 4 + (0 if not on else 4)
        U.card(img, x, y, lw, 21, ACC, on, k=4)
        ic = mon_icon(name).crop((0, 10, 32, 29))
        img.alpha_composite(ic, (x + 2, y + 1))
        F.draw(img, x + 36, y + 8, f"{no:03d}", ink=U.WHITE if on else U.INK, shadow=ACC[2] if on else U.CREAM_D)
        F.draw(img, x + 58, y + 8, name.upper(), ink=U.WHITE if on else U.INK, shadow=ACC[2] if on else U.CREAM_D)
        if caught:                                       # caught mark: a small ball
            U.item_icon(img, x + lw - 18, y + 3, "ball")
    rx = lw + 16
    rw = W - rx - (30 if dev == "phone" else 4)
    U.window(img, rx, 18, rw, 158, ACC)
    name, no, _ = DEX[sel]
    m = _mon(os.path.join(REPO, "assets/pokemon/Gen1-Kanto/004-Charmander/charmander-movement.png"), 0, 48)
    d = ImageDraw.Draw(img)
    cx = rx + rw // 2
    d.ellipse([cx - 28, 78, cx + 28, 88], fill=U.CREAM_D)
    img.alpha_composite(m, (cx - m.width // 2, 85 - m.height))
    F.draw(img, rx + 10, 28, f"{no:03d}", **TXT)
    F.draw(img, rx + 34, 28, name.upper(), **TXT)
    type_chip(img, rx + 10, 92, "fire")
    sizes = json.load(open(os.path.join(REPO, "data", "units", "pokemon_sizes.json"))).get(name, {})
    F.draw(img, rx + 70, 96, f"Cao {sizes.get('height', 6) / 10:.1f} m", **TXT)
    F.draw(img, rx + 70, 110, f"Nặng {sizes.get('weight', 85) / 10:.1f} kg", **TXT)
    F.draw(img, rx + 10, 128, "Ngọn lửa đuôi cho biết sức", **TXT)
    F.draw(img, rx + 10, 142, "khoẻ. Lửa tắt là nó yếu đi.", **TXT)
    if dev == "phone":
        phone_extras(img, ACC)
    return img


# ================================================================ title
LOGO = {   # bold 9x7 letters for the title logo
    "M": ["##.....##", "###...###", "####.####", "##.###.##", "##..#..##", "##.....##", "##.....##"],
    "O": [".#######.", "##.....##", "##.....##", "##.....##", "##.....##", "##.....##", ".#######."],
    "N": ["##.....##", "###....##", "####...##", "##.##..##", "##..##.##", "##...####", "##....###"],
    "S": [".########", "##.......", "##.......", ".#######.", ".......##", ".......##", "########."],
}


def logo(text="MONS", k=5):
    """Title logo: bold letters x k, a fire-accent gradient, a cream rim, an ink outline and drop shadow."""
    acc = U.ACCENT["fire"]
    lw = sum(len(LOGO[c][0]) for c in text) + len(text) - 1
    out = U.canvas(lw * k + 12, 7 * k + 12)
    op = out.load()
    x0 = 0
    for ch in text:
        for j, row in enumerate(LOGO[ch]):
            for i, c in enumerate(row):
                if c != "#":
                    continue
                for yy in range(k):
                    for xx in range(k):
                        Y = j * k + yy
                        col = U.shade(acc[0], 1.1) if Y < 7 * k * .35 else acc[1] if Y < 7 * k * .72 else acc[2]
                        op[4 + (x0 + i) * k + xx, 4 + Y] = col + (255,)
        x0 += len(LOGO[ch][0]) + 1
    for ring, col in ((1, U.CREAM), (1, U.INK)):
        S = {(x, y) for y in range(out.height) for x in range(out.width) if op[x, y][3]}
        for x, y in S:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                X, Y = x + dx, y + dy
                if 0 <= X < out.width and 0 <= Y < out.height and (X, Y) not in S and not op[X, Y][3]:
                    op[X, Y] = col + (255,)
    S = {(x, y) for y in range(out.height) for x in range(out.width) if op[x, y][3]}
    for x, y in sorted(S):
        for dx, dy in ((2, 2), (1, 2), (2, 1)):
            X, Y = x + dx, y + dy
            if 0 <= X < out.width and 0 <= Y < out.height and (X, Y) not in S and not op[X, Y][3]:
                op[X, Y] = U.INK + (255,)
    return out


def title(dev, W, H):
    sc = Image.open(os.path.join(REPO, "assets/battle-scenes/meadow/meadow-path-wild-wide.png")).convert("RGBA")
    sc = sc.resize((sc.width // 2, sc.height // 2), Image.NEAREST)
    img = sc.crop((35, 0, 355, 180)).copy() if dev == "pc" else sc.copy()
    d = ImageDraw.Draw(img)
    d.rectangle([0, 128, W, H], fill=U.shade(img.getpixel((W // 2, 120))[:3], 1.0))
    for i, (path, size, x) in enumerate((("Gen1-Kanto/001-Bulbasaur/bulbasaur", 36, W // 2 - 70),
                                         ("Gen1-Kanto/004-Charmander/charmander", 40, W // 2),
                                         ("Gen1-Kanto/007-Squirtle/squirtle", 36, W // 2 + 70))):
        m = _mon(os.path.join(REPO, "assets", "units", path + "-movement.png"), 0, size)
        img.alpha_composite(m, (x - m.width // 2, 150 - m.height))
    lg = logo()
    img.alpha_composite(lg, (W // 2 - lg.width // 2, 22))
    sub = "Phiên bản 0.1"
    F.draw(img, W // 2 - F.width(sub) // 2, 22 + lg.height + 4, sub, ink=U.INK, shadow=U.CREAM)
    msg = "Nhấn Enter để bắt đầu" if dev == "pc" else "Chạm để bắt đầu"
    w = F.width(msg) + 16
    U.chamfer(d, W // 2 - w // 2, 158, W // 2 + w // 2, 172, U.INK, 4)
    F.draw(img, W // 2 - F.width(msg) // 2, 163, msg, ink=U.CREAM, shadow=U.INK2)
    return img


def render_all(out):
    for dev in ("pc", "phone"):
        W, H, _ = U.SCREENS[dev]
        for name, fn in (("bag", bag), ("summary", summary), ("mondex", mondex), ("title", title)):
            _save(fn(dev, W, H), out, f"{dev}-{name}.png")
