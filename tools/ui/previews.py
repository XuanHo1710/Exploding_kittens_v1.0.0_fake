"""Designer previews: PC and phone screens composed from the UI kit (assets/ui/_preview, x4, never used in game)."""
import os

from PIL import Image

import monsfont as F
import uikit as U

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
K = 4
DOCK_Y = 128
PC_CROP_X = 35          # PC shows x 35..354 of a 390 px wide Battle Scene


def _save(img, out, name):
    os.makedirs(out, exist_ok=True)
    U.finish(img.copy()).resize((img.width * K, img.height * K), Image.NEAREST).save(os.path.join(out, name))


def _cell(path, row, col, fh=32):
    sh = Image.open(path).convert("RGBA")
    sh = sh.resize((sh.width // 2, sh.height // 2), Image.NEAREST)
    return sh.crop((col * 16, row * fh, col * 16 + 16, row * fh + fh))


def _mon(path, col, size):
    """Temporary battle sprite: a movement-sheet frame (192 px cell) scaled down, magenta keyed."""
    sh = Image.open(path).convert("RGBA")
    c = sh.crop((col * 192, 0, col * 192 + 192, 192))
    px = c.load()
    for y in range(c.height):
        for x in range(c.width):
            r, g, b, a = px[x, y]
            if r > 200 and b > 200 and g < 80:
                px[x, y] = (0, 0, 0, 0)
    c = c.crop(c.getbbox())
    s = size / max(c.size)
    c = c.resize((max(1, round(c.width * s)), max(1, round(c.height * s))), Image.LANCZOS)
    c.putalpha(c.split()[3].point(lambda v: 255 if v >= 128 else 0))
    return c


def _map(W, H, cx=256, cy=250, path="assets/maps/cinder-town/cinder-town.png"):
    m = Image.open(os.path.join(REPO, path)).convert("RGBA")
    m = m.resize((m.width // 2, m.height // 2), Image.NEAREST)
    return m.crop((cx - W // 2, cy - H // 2, cx - W // 2 + W, cy - H // 2 + H)).copy()


def _people(img, W):
    cx = W // 2 - 8
    img.alpha_composite(_cell(os.path.join(REPO, "assets/characters/Player/player-girl/player-girl-overworld.png"), 3, 0), (cx, 74))
    img.alpha_composite(_cell(os.path.join(REPO, "assets/characters/Trainers/lass/lass-overworld.png"), 0, 0), (cx, 42))


def dialogue(img, x, y, w, acc, speaker, l1, l2):
    U.window(img, x, y, w, 44, acc)
    U.tab(img, x + 8, y - 10, speaker, acc)
    F.draw(img, x + 12, y + 12, l1, ink=U.TEXT, shadow=U.TEXT_SH)
    F.draw(img, x + 12, y + 28, l2, ink=U.TEXT, shadow=U.TEXT_SH)
    F.draw(img, x + w - 16, y + 32, "▼", ink=acc[1], shadow=acc[0])


def start_menu(img, x0, acc, sel=2, right=None):
    right = right or img.width - 2
    for i, (ic, t) in enumerate(U.START_MENU):
        x = x0 - (6 if i == sel else 0)
        U.menu_card(img, x, 4 + i * 15, right - x + 1, ic, t, acc, i == sel)


def hint(img, x, y, text):
    from PIL import ImageDraw
    d = ImageDraw.Draw(img)
    w = F.width(text) + 10
    U.chamfer(d, x, y, x + w, y + 13, U.INK, 3)
    F.draw(img, x + 5, y + 4, text, ink=U.CREAM, shadow=U.INK2)


L1, L2 = "Bạn vừa bước vào tầm mắt tôi!", "Vậy thì mình đấu thôi nhỉ?"


def overworld(out):
    acc = U.ACCENT["fire"]
    for dev in ("pc", "phone"):
        W, H, _ = U.SCREENS[dev]
        for mode in ("dialogue", "menu"):
            img = _map(W, H)
            _people(img, W)
            if dev == "pc":
                if mode == "dialogue":
                    dialogue(img, 4, 132, W - 8, acc, "NỮ SINH", L1, L2)
                else:
                    start_menu(img, W - 82, acc)
                    hint(img, 4, 4, "Enter: Menu   Z: Chọn   X: Quay lại")
            else:
                U.dpad(img, 8, 130, acc)
                U.round_button(img, W - 18, 146, 11, "A", acc[1])
                U.round_button(img, W - 42, 162, 11, "B", U.CREAM, ink=U.INK, sh=U.CREAM_D)
                U.menu_button(img, W - 22, 4, acc)
                if mode == "dialogue":
                    dialogue(img, 64, 132, W - 128, acc, "NỮ SINH", L1, L2)
                else:
                    start_menu(img, W - 104, acc, right=W - 28)
            _save(img, out, f"{dev}-overworld-{mode}.png")


def battle(out, scene="meadow/meadow-tall-grass-wild-wide.png", foe=("Gen1-Kanto/001-Bulbasaur/bulbasaur", "BULBASAUR", 5, .62, "grass"),
           me=("Gen1-Kanto/004-Charmander/charmander", "CHARMANDER", 7, 11, 24, "fire")):
    acc = U.ACCENT["grass"]
    sc = Image.open(os.path.join(REPO, "assets", "battle-scenes", scene)).convert("RGBA")
    sc = sc.resize((sc.width // 2, sc.height // 2), Image.NEAREST)          # 390 x 180 native
    f = _mon(os.path.join(REPO, "assets", "units", foe[0] + "-movement.png"), 7, 40)
    m = _mon(os.path.join(REPO, "assets", "units", me[0] + "-movement.png"), 3, 52)
    sc.alpha_composite(f, (271 - f.width // 2, 80 - f.height))               # feet on the platform centres
    sc.alpha_composite(m, (127 - m.width // 2, 118 - m.height))
    for dev in ("pc", "phone"):
        W, H, _ = U.SCREENS[dev]
        img = sc.crop((PC_CROP_X, 0, PC_CROP_X + W, H)).copy() if dev == "pc" else sc.copy()
        U.slant(img, 0, 6, 124, 26, U.TYPE_COLOUR[foe[4]])
        F.draw(img, 18, 11, foe[1], ink=U.TEXT, shadow=U.TEXT_SH)
        F.draw(img, 18 + F.width(foe[1]) + 2, 11, "♂", ink=U.MALE, shadow=U.MALE_SH)
        U.hexa(img, 92, 7, str(foe[2]), acc)
        U.hp_bar(img, 16, 21, foe[3])
        x = W - 112
        U.slant(img, W - 124, 88, 124, 36, U.TYPE_COLOUR[me[5]], flip=True)
        F.draw(img, x, 93, me[1], ink=U.TEXT, shadow=U.TEXT_SH)
        F.draw(img, x + F.width(me[1]) + 2, 93, "♂", ink=U.MALE, shadow=U.MALE_SH)
        U.hexa(img, x + 78, 89, str(me[2]), acc)
        U.hp_bar(img, x + 4, 106, me[3] / me[4])
        F.draw(img, x + 58, 105, f"{me[3]}/{me[4]}", ink=U.TEXT, shadow=U.TEXT_SH)
        from PIL import ImageDraw
        d = ImageDraw.Draw(img)
        d.line([(x + 10, 117), (W - 12, 117)], fill=U.INK)
        d.line([(x + 10, 117), (x + 44, 117)], fill=U.EXP)
        U.dock(img, DOCK_Y, W, H - DOCK_Y)
        if dev == "pc":
            U.window(img, 4, 134, W - 136, 42, acc)
            U.tab(img, 12, 124, "TRẬN ĐẤU", acc)
            F.draw(img, 16, 146, me[1] + " sẽ làm gì đây?", ink=U.TEXT, shadow=U.TEXT_SH)
            for i, (ic, t) in enumerate(U.BATTLE_MENU):
                U.command(img, W - 128 + (i % 2) * 62, 132 + (i // 2) * 23, 60, 22, ic, t, acc, i == 0)
        else:
            U.window(img, 4, 134, W - 186, 42, acc)
            U.tab(img, 12, 124, "TRẬN ĐẤU", acc)
            F.draw(img, 16, 146, me[1] + " sẽ", ink=U.TEXT, shadow=U.TEXT_SH)
            F.draw(img, 16, 160, "làm gì đây?", ink=U.TEXT, shadow=U.TEXT_SH)
            for i, (ic, t) in enumerate(U.BATTLE_MENU):
                U.command(img, W - 178 + i * 44, 132, 42, 46, ic, t, acc, i == 0, stacked=True)
            U.menu_button(img, W - 22, 4, acc)
        _save(img, out, f"{dev}-battle.png")


def kit_sheet(out):
    W, H = 400, 236
    img = U.canvas(W, H)
    from PIL import ImageDraw
    ImageDraw.Draw(img).rectangle([0, 0, W, H], fill=U.CREAM)
    F.draw(img, 6, 6, "Màu theo District", ink=U.TEXT, shadow=U.TEXT_SH)
    for i, (name, acc) in enumerate(U.ACCENT.items()):
        x = 6 + i * 43
        U.window(img, x, 18, 40, 22, acc, rule=False)
        F.draw(img, x + 20 - F.width(name) // 2, 44, name, ink=U.TEXT, shadow=U.TEXT_SH)
    F.draw(img, 6, 60, "Hệ", ink=U.TEXT, shadow=U.TEXT_SH)
    for i, (slug, _, _) in enumerate(U.TYPES):
        U.type_icon(img, 6 + (i % 7) * 55, 72 + (i // 7) * 18, slug)
    F.draw(img, 6, 132, "Huy hiệu gym", ink=U.TEXT, shadow=U.TEXT_SH)
    for i, g in enumerate(U.BADGES):
        U.badge(img, 6 + i * 30, 144, g)
    F.draw(img, 260, 132, "Icon", ink=U.TEXT, shadow=U.TEXT_SH)
    for i, n in enumerate(U.ICONS):
        U.icon(img, 260 + (i % 4) * 14, 146 + (i // 4) * 13, n, U.ACCENT["start"][2])
    F.draw(img, 6, 178, "HP", ink=U.TEXT, shadow=U.TEXT_SH)
    for i, fr in enumerate((0.9, 0.4, 0.15)):
        U.hp_bar(img, 26 + i * 60, 179, fr)
    F.draw(img, 6, 198, "Font: Chào mừng đến với Mons! Ồ, bạn mới đến à?", ink=U.TEXT, shadow=U.TEXT_SH)
    F.draw(img, 6, 216, "ĐỘI HÌNH - TÚI ĐỒ - CÀI ĐẶT - 0123456789 ♂♀ ữựửừứ ặẳẵằắ", ink=U.TEXT, shadow=U.TEXT_SH)
    _save(img, out, "kit.png")


def render_all(out):
    overworld(out)
    battle(out)
    kit_sheet(out)
