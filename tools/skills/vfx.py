"""Gen-3 style battle move effects (Pillow only, runs with agy's Python too).

Screen: 240 x 160 (GBA), scaled up for output. The player's Pokémon stands bottom-left seen from BEHIND, the opponent
top-right seen from the FRONT, each on an oval platform; a text box covers the bottom 40 px. A move = an ARCHETYPE
(how the effect travels, see build_moves.py) x a TYPE particle (what it looks like, 18 types).

Particles: assets/skills/vfx/particles/<type>.png when present (AI-drawn, made by normalize_particles.py: 4 frames of 32 px
on a transparent row), otherwise the procedural pixel particles below. Generic sprites (impact star, slash, fangs,
fist, foot, note, arrows, sparkle) are procedural.
"""
import glob
import json
import math
import os
import random
import re
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:  # agy's Python: use the Pillow build shipped with the sprite skill
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "../pokemon/.pydeps"))
    from PIL import Image, ImageDraw

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
W, H = 240, 160
P_POS, E_POS = (64, 116), (176, 64)        # feet of the player / opponent sprite = the centres of the battle-scene platforms
TEXT_TOP = 112                            # Gen 3 text box: y 112-160 (battle scenes leave it empty)
OUTLINE = (24, 24, 40, 255)

# type -> (dark, mid, light, accent) and particle shape
PAL = {
    "normal": ((150, 140, 120), (210, 200, 180), (250, 248, 235), (255, 255, 255), "star"),
    "fire": ((200, 50, 20), (245, 120, 30), (255, 200, 60), (255, 245, 170), "flame"),
    "water": ((30, 80, 190), (60, 140, 240), (140, 200, 255), (230, 245, 255), "drop"),
    "electric": ((200, 150, 0), (250, 210, 30), (255, 245, 120), (255, 255, 230), "spark"),
    "grass": ((30, 110, 40), (70, 170, 60), (140, 220, 100), (220, 250, 180), "leaf"),
    "ice": ((70, 140, 190), (130, 200, 235), (200, 240, 255), (255, 255, 255), "shard"),
    "fighting": ((150, 40, 20), (210, 90, 40), (250, 160, 90), (255, 230, 190), "star"),
    "poison": ((90, 30, 120), (150, 70, 180), (205, 140, 230), (245, 215, 255), "bubble"),
    "ground": ((110, 80, 40), (170, 130, 70), (220, 190, 120), (245, 230, 180), "rock"),
    "flying": ((110, 140, 200), (170, 200, 240), (225, 240, 255), (255, 255, 255), "feather"),
    "psychic": ((190, 40, 110), (240, 100, 170), (255, 170, 210), (255, 230, 245), "ring"),
    "bug": ((90, 120, 20), (150, 180, 40), (200, 225, 90), (240, 250, 190), "orb"),
    "rock": ((100, 85, 60), (160, 140, 100), (205, 190, 150), (240, 230, 200), "rock"),
    "ghost": ((60, 40, 110), (110, 80, 170), (170, 140, 220), (230, 215, 255), "wisp"),
    "dragon": ((60, 40, 160), (110, 80, 230), (170, 150, 255), (230, 220, 255), "flame"),
    "dark": ((30, 25, 35), (75, 60, 75), (130, 110, 120), (200, 180, 190), "shard"),
    "steel": ((110, 115, 130), (170, 175, 190), (220, 225, 235), (255, 255, 255), "star"),
    "fairy": ((210, 80, 150), (245, 140, 195), (255, 200, 230), (255, 245, 250), "sparkle"),
}


def _poly(d, pts, fill):
    d.polygon(pts, fill=fill + (255,), outline=OUTLINE)


def shape(kind, pal, frame=0, size=16):
    """one procedural particle (RGBA, size x size), pixel-art: flat colours + dark outline; frame 0..3 animates"""
    dk, md, lt, ac = pal[:4]
    S = 64  # draw big then downscale with NEAREST -> crisp pixels
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = S / 2
    wob = [0, 3, 0, -3][frame % 4]
    if kind == "star":
        r1, r2 = 28 - abs(wob), 11
        pts = [(c + (r1 if i % 2 == 0 else r2) * math.cos(math.pi / 4 * i + frame * 0.2),
                c + (r1 if i % 2 == 0 else r2) * math.sin(math.pi / 4 * i + frame * 0.2)) for i in range(8)]
        _poly(d, pts, md); d.ellipse([c - 7, c - 7, c + 7, c + 7], fill=ac + (255,))
    elif kind == "flame":
        h = 26 + wob
        _poly(d, [(c, c - h), (c + 16, c), (c + 12, c + 18), (c, c + 24), (c - 12, c + 18), (c - 16, c)], dk)
        _poly(d, [(c, c - h + 10), (c + 10, c + 2), (c + 7, c + 16), (c - 7, c + 16), (c - 10, c + 2)], md)
        d.ellipse([c - 6, c + 2, c + 6, c + 16], fill=lt + (255,))
    elif kind == "drop":
        _poly(d, [(c, c - 24), (c + 15, c + 4), (c, c + 22), (c - 15, c + 4)], md)
        d.ellipse([c - 15, c - 6, c + 15, c + 22], fill=md + (255,), outline=OUTLINE)
        d.ellipse([c - 7, c - 2, c + 1, c + 6], fill=ac + (255,))
    elif kind == "spark":
        z = [(c - 6, c - 28), (c + 12, c - 28), (c + 2, c - 6), (c + 16, c - 6), (c - 8, c + 28), (c - 1, c + 2), (c - 14, c + 2)]
        if frame % 2:
            z = [(S - x, y) for x, y in z]
        _poly(d, z, lt); d.line(z[:3], fill=ac + (255,), width=3)
    elif kind == "leaf":
        a = frame * math.pi / 4
        pts = [(c + 26 * math.cos(a), c + 26 * math.sin(a)), (c + 10 * math.cos(a + 1.6), c + 10 * math.sin(a + 1.6)),
               (c - 26 * math.cos(a), c - 26 * math.sin(a)), (c + 10 * math.cos(a - 1.6), c + 10 * math.sin(a - 1.6))]
        _poly(d, pts, md); d.line([pts[0], pts[2]], fill=dk + (255,), width=3)
    elif kind == "shard":
        a = frame * math.pi / 6
        pts = [(c + 28 * math.cos(a), c + 28 * math.sin(a)), (c + 9 * math.cos(a + 1.9), c + 9 * math.sin(a + 1.9)),
               (c - 20 * math.cos(a), c - 20 * math.sin(a)), (c + 9 * math.cos(a - 1.9), c + 9 * math.sin(a - 1.9))]
        _poly(d, pts, lt); d.line([pts[0], pts[2]], fill=ac + (255,), width=3)
    elif kind == "bubble":
        r = 22 + wob
        d.ellipse([c - r, c - r, c + r, c + r], fill=md + (255,), outline=OUTLINE, width=3)
        d.ellipse([c - r + 8, c - r + 8, c - r + 18, c - r + 18], fill=ac + (255,))
    elif kind == "rock":
        pts = [(c - 22, c - 6), (c - 10, c - 22), (c + 14, c - 18), (c + 24, c + 2), (c + 12, c + 22), (c - 16, c + 18)]
        if frame % 2:
            pts = [(S - x, y) for x, y in pts]
        _poly(d, pts, md); _poly(d, [(c - 10, c - 14), (c + 10, c - 12), (c + 2, c)], lt)
    elif kind == "feather":
        a = frame * math.pi / 5
        pts = [(c + 27 * math.cos(a), c + 27 * math.sin(a)), (c + 9 * math.cos(a + 1.4), c + 9 * math.sin(a + 1.4)),
               (c - 27 * math.cos(a), c - 27 * math.sin(a)), (c + 9 * math.cos(a - 1.4), c + 9 * math.sin(a - 1.4))]
        _poly(d, pts, lt); d.line([pts[0], pts[2]], fill=md + (255,), width=3)
    elif kind == "ring":
        r = 14 + frame * 4
        d.ellipse([c - r, c - r, c + r, c + r], outline=OUTLINE, width=8)
        d.ellipse([c - r, c - r, c + r, c + r], outline=md + (255,), width=5)
    elif kind == "orb":
        r = 18 + wob
        d.ellipse([c - r, c - r, c + r, c + r], fill=md + (255,), outline=OUTLINE, width=3)
        d.ellipse([c - 8, c - 8, c + 4, c + 4], fill=lt + (255,))
    elif kind == "wisp":
        d.ellipse([c - 18, c - 10 + wob, c + 18, c + 22 + wob], fill=md + (255,), outline=OUTLINE, width=3)
        _poly(d, [(c - 8, c - 2 + wob), (c, c - 28), (c + 8, c - 2 + wob)], md)
        d.ellipse([c - 6, c + 2 + wob, c + 4, c + 12 + wob], fill=ac + (255,))
    elif kind == "sparkle":
        r = 26 - abs(wob) * 2
        _poly(d, [(c, c - r), (c + 6, c - 6), (c + r, c), (c + 6, c + 6), (c, c + r), (c - 6, c + 6), (c - r, c), (c - 6, c - 6)], lt)
        d.ellipse([c - 5, c - 5, c + 5, c + 5], fill=ac + (255,))
    return im.resize((size, size), Image.NEAREST)


def generic(kind, frame=0, size=32, pal=None):
    """impact / slash / bite / punch / kick / note / up / down / sparkle sprites"""
    pal = pal or PAL["normal"]
    S = 64
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = S / 2
    if kind == "hit":
        r1 = 30 - frame * 2
        pts = [(c + (r1 if i % 2 == 0 else 12) * math.cos(math.pi / 5 * i), c + (r1 if i % 2 == 0 else 12) * math.sin(math.pi / 5 * i)) for i in range(10)]
        _poly(d, pts, (255, 250, 220)); d.ellipse([c - 8, c - 8, c + 8, c + 8], fill=(255, 255, 255, 255))
    elif kind == "slash":
        for k in range(3):
            o = (k - 1) * 12
            d.line([(8 + o, 6), (56 + o, 58)], fill=OUTLINE, width=8); d.line([(8 + o, 6), (56 + o, 58)], fill=(255, 255, 255, 255), width=4)
    elif kind == "bite":
        for y0, sgn in ((8, 1), (56, -1)):
            for k in range(4):
                x = 10 + k * 13
                _poly(d, [(x, y0), (x + 12, y0), (x + 6, y0 + sgn * (18 + frame * 2))], (255, 255, 255))
    elif kind in ("punch", "kick"):
        d.ellipse([c - 20, c - 18, c + 20, c + 18], fill=pal[1] + (255,), outline=OUTLINE, width=4)
        for k in range(3):
            d.rectangle([c - 16 + k * 11, c - 22, c - 8 + k * 11, c - 10], fill=pal[2] + (255,), outline=OUTLINE)
    elif kind == "note":
        d.ellipse([c - 14, c + 6, c + 2, c + 20], fill=pal[1] + (255,), outline=OUTLINE, width=3)
        d.rectangle([c - 2, c - 24, c + 3, c + 12], fill=OUTLINE)
        _poly(d, [(c + 3, c - 24), (c + 18, c - 16), (c + 3, c - 12)], pal[1])
    elif kind in ("up", "down"):
        pts = [(c, 4), (c + 22, 30), (c + 9, 30), (c + 9, 60), (c - 9, 60), (c - 9, 30), (c - 22, 30)]
        if kind == "down":
            pts = [(x, S - y) for x, y in pts]
        _poly(d, pts, (250, 90, 70) if kind == "up" else (80, 130, 250))
    elif kind == "sparkle":
        return shape("sparkle", PAL["fairy"] if pal is None else pal, frame, size)
    return im.resize((size, size), Image.NEAREST)


def particle(type_, frame=0, size=16):
    """AI sheet assets/skills/vfx/particles/<type>.png (4 frames side by side) if present, else procedural"""
    p = os.path.join(REPO, "assets", "skills", "vfx", "particles", f"{type_}.png")
    if os.path.isfile(p):
        sheet = Image.open(p).convert("RGBA")
        n = max(1, sheet.width // sheet.height)
        c = sheet.height
        return sheet.crop(((frame % n) * c, 0, (frame % n + 1) * c, c)).resize((size, size), Image.NEAREST)
    pal = PAL.get(type_.split("-")[0], PAL["normal"])
    return shape(pal[4], pal, frame, size)


# ---------------------------------------------------------------- battle scene
def find_sheet(slug):
    import glob
    hits = glob.glob(os.path.join(REPO, "assets", "units", "Gen*", "[0-9]*-*", f"{slug}-movement.png"))
    return hits[0] if hits else None


HI = 3      # output scale: the scene is laid out at 240x160 (GBA) and shown x3; the Pokémon layer is drawn at x3 itself


def shrink(img, w, h):
    """resize pixel art: nearest when (almost) 1:1 or enlarging, area-average (BOX) when shrinking a lot (keeps thin
    outlines and eyes instead of dropping pixels), then hard alpha again"""
    w, h = max(1, int(w)), max(1, int(h))
    if w >= img.width * 0.85:
        return img.resize((w, h), Image.NEAREST)
    out = img.resize((w, h), Image.BOX)
    a = out.split()[3].point(lambda v: 255 if v > 110 else 0)
    out.putalpha(a)
    return out


_SIZES = None


POKEMON_SCALE = 1 / 1.5    # every Pokémon on the battle screen (user decision 2026-11-18: 1.5x smaller); effects follow


def sprite_height(slug, view):
    """on-screen height like Gen 3 (64 px sprite box): grows with the Pokédex height, the player's back sprite
    (closer to the camera) ~15% bigger. 0.4 m Pikachu ~34 px, 0.7 m Bulbasaur ~42, 1.7 m Typhlosion ~60 (front)."""
    global _SIZES
    if _SIZES is None:
        try:
            _SIZES = {re.sub(r"[^a-z0-9]", "", k.lower()): v for k, v in
                      json.load(open(os.path.join(REPO, "data", "units", "pokemon_sizes.json"), encoding="utf-8")).items()}
        except OSError:
            _SIZES = {}
    h_m = (_SIZES.get(re.sub(r"[^a-z0-9]", "", slug.lower())) or {}).get("height", 10) / 10
    px = max(28.0, min(64.0, 64 * (h_m / 2.0) ** 0.4)) * POKEMON_SCALE
    return int(round(px * (1.15 if view == "back" else 1.0)))


def diagonal(slug):
    """True when the battle sprites of this species are the diagonal ones (8-direction movement sheet or a drawn
    battle sheet), so its anchors use the diagonal views"""
    p = find_sheet(slug)
    if not p:
        return False
    if os.path.isfile(os.path.join(os.path.dirname(p), f"{slug}-battle.png")):
        return True
    return Image.open(p).size == (1536, 1152)


def battle_sprite(slug, view, height=None, cap=96):
    """opponent ("front": top-right, facing the lower-left) / player ("back": bottom-left, from behind facing the
    upper-right) battle sprite: the standing frame of its drawn battle sheet, else cut from its movement sheet;
    magenta keyed, scaled to `height` (default: sprite_height, from the species' real size)"""
    height = height or sprite_height(slug, view)
    bs = battle_sheet(slug) if slug else None
    if bs and view in bs[1].get("views", []):
        im, meta = bs
        n = meta.get("frames", 6)
        cell = im.crop(((0 if view == "front" else n) * 192, 0, ((0 if view == "front" else n) + 1) * 192, 192))
        bb = cell.getbbox()
        if bb:
            cell = cell.crop(bb)
            k = min(height / cell.height, cap / cell.width)
            return shrink(cell, round(cell.width * k), round(cell.height * k))
    p = find_sheet(slug)
    if not p:
        im = Image.new("RGBA", (40, 48), (0, 0, 0, 0))
        ImageDraw.Draw(im).ellipse([2, 6, 38, 46], fill=(200, 200, 210, 255), outline=OUTLINE, width=2)
        return im
    sheet = Image.open(p)
    w, h = sheet.size
    sheet = sheet.convert("RGBA")
    C = 192
    flip = False
    if (w, h) == (1536, 1152):                    # legacy 8 directions: diagonal battle views (the screen is diagonal)
        col, row = (1, 0) if view == "front" else (3, 0)   # down-right mirrored = facing the lower-left / up-right
        flip = view == "front"
    else:                                        # v2 / v3: rows down, left, right, up (no diagonals):
        col, row = 0, (1 if view == "front" else 3)   # opponent = facing left (toward the player), player = back
        try:                                     # flying species fight in the air: use the FLY loop (wings open)
            x = 0
            for l in json.loads(Image.open(p).text.get("mons-loops", "[]")):
                if l["mode"] == "fly":
                    col = x
                x += l["frames"]
        except (ValueError, KeyError, OSError):
            pass
    cell = sheet.crop((col * C, row * C, (col + 1) * C, (row + 1) * C))
    if flip:
        cell = cell.transpose(Image.FLIP_LEFT_RIGHT)
    px = cell.load()
    for y in range(C):
        for x in range(C):
            r, g, b, a = px[x, y]
            if (r - g > 80 and b - g > 80 and r > 120 and b > 120) or (r < 60 and g < 40 and b < 75 and y > C * 0.8):
                px[x, y] = (0, 0, 0, 0)          # magenta background + painted ground shadow
    bb = cell.getbbox() or (0, 0, C, C)
    cell = cell.crop(bb)
    k = min(height / cell.height, cap / cell.width)  # very wide species: cap the width
    return shrink(cell, round(cell.width * k), round(cell.height * k))


_ANCH = None


def anchors(slug, view):
    """body anchors of a species for one view ("front" / "back") from data/pokemon/pokemon-anchors.json (build_anchors.py),
    overridden by assets/pokemon/<Gen>/<NNN-Name>/<slug>-anchors.json; {} when unknown"""
    global _ANCH
    if _ANCH is None:
        try:
            _ANCH = json.load(open(os.path.join(REPO, "data", "units", "pokemon-anchors.json"), encoding="utf-8"))
        except OSError:
            _ANCH = {}
    entry = _ANCH.get(slug) or {}
    key = view + "_d" if diagonal(slug) else ("front_s" if view == "front" else view)   # match the sprite used
    a = dict((entry.get(key) or entry.get(view)) or {})
    sheet = find_sheet(slug)
    if sheet:
        fix = os.path.join(os.path.dirname(sheet), f"{slug}-anchors.json")
        if os.path.isfile(fix):
            for k, v in (json.load(open(fix, encoding="utf-8")).get(view) or {}).items():
                a[k] = {**a.get(k, {}), **v}
    return a


def anchor_xy(slug, view, part, sprite, feet):
    """screen point (x, y, visible) of a body part on a battle sprite standing with its bottom centre at `feet`;
    mapped by the sprite's width and bottom centre. None when the part is unknown."""
    an = anchors(slug, view)
    a = an.get(part)
    if not a:
        return None
    asp = an.get("_aspect") or 1.0                      # 3D silhouette height / width
    if part in ("hand_l", "hand_r") and "hand_l" in an and "hand_r" in an and not a.get("fixed"):
        # hands depend on the pose and the 2D drawing stands differently from the 3D idle pose: make them
        # symmetric and put them on the sprite's own outline at that height (arms hang at the sides)
        hl, hr = an["hand_l"], an["hand_r"]
        v = (hl["y"] + hr["y"]) / 2 / asp
        other = hr if part == "hand_l" else hl
        side = 1 if (a["x"], part) >= (other["x"], "hand_m") else -1   # the more-right hand takes the right edge
        row = int(round(sprite.height * (1 - v)))
        row = max(0, min(sprite.height - 1, row))
        alpha = sprite.split()[3]
        xs = [x for x in range(sprite.width) if alpha.getpixel((x, row)) > 60]
        if xs:
            edge = (max(xs) if side > 0 else min(xs)) - sprite.width / 2
            x = edge - side * 0.08 * sprite.width
        else:
            x = side * abs(hl["x"] + hr["x"]) / 2 * sprite.width
        return (feet[0] + x, feet[1] - v * sprite.height, bool(a.get("vis", True)))
    v = a["y"] / asp                                    # height above the feet, as a fraction of the body height
    return (feet[0] + a["x"] * sprite.width, feet[1] - v * sprite.height, bool(a.get("vis", True)))


def posed(sprite, sx=1.0, sy=1.0, rot=0.0):
    """sprite squashed / stretched (anchored at its feet) and rotated around its feet (degrees, + = counter-clockwise);
    returns (image, (feet_x, feet_y) inside that image)"""
    s = sprite
    if (round(sx, 3), round(sy, 3)) != (1.0, 1.0):
        s = sprite.resize((max(1, round(sprite.width * sx)), max(1, round(sprite.height * sy))), Image.NEAREST)
    if abs(rot) < 0.5:
        return s, (s.width // 2, s.height)
    W2, H2 = s.width * 2 + 4, s.height * 2 + 4
    c = Image.new("RGBA", (W2, H2), (0, 0, 0, 0))
    c.paste(s, (W2 // 2 - s.width // 2, H2 // 2 - s.height))
    return c.rotate(rot, resample=Image.NEAREST, center=(W2 // 2, H2 // 2)), (W2 // 2, H2 // 2)


_BATTLE = {}
BATTLE_ROWS = ["attack", "hurt", "dodge", "faint"]


def battle_sheet(slug):
    """level-B battle poses assets/pokemon/<Gen>/<NNN-Name>/<slug>-battle.png (magenta keyed) + meta, or None"""
    if slug in _BATTLE:
        return _BATTLE[slug]
    res = None
    mv = find_sheet(slug) if slug else None
    p = os.path.join(os.path.dirname(mv), f"{slug}-battle.png") if mv else None
    if p and os.path.isfile(p):
        im = Image.open(p)
        meta = json.loads(im.text.get("mons-battle", "{}") or "{}")
        im = im.convert("RGBA")
        px = im.load()
        for y in range(im.height):
            yc = y % 192
            for x in range(im.width):
                r, g, b, a = px[x, y]
                if r - g > 80 and b - g > 80 and r > 120 and b > 120:
                    px[x, y] = (0, 0, 0, 0)
                elif yc > 192 * 0.72 and g < 90 and r - g > 20 and b - g > 20 and max(r, b) < 200:
                    px[x, y] = (0, 0, 0, 0)       # painted ground shadow blended with the magenta background
                elif yc > 192 * 0.8 and r < 60 and g < 40 and b < 75:
                    px[x, y] = (0, 0, 0, 0)       # dark ground shadow (as in battle_sprite)
        res = (im, meta)
    _BATTLE[slug] = res
    return res


def battle_frame(slug, view, anim, i, height):
    """frame i (0-5) of a drawn battle animation, scaled like the battle sprite (its standing frame = `height`);
    returns (image, (feet_x, feet_y)) or None when the species / view / row is not drawn"""
    bs = battle_sheet(slug)
    if not bs or anim not in BATTLE_ROWS:
        return None
    im, meta = bs
    n, C = meta.get("frames", 6), 192
    col0 = 0 if view == "front" else n
    r = (meta.get("rows") or BATTLE_ROWS).index(anim)
    cell = im.crop(((col0 + i) * C, r * C, (col0 + i + 1) * C, (r + 1) * C))
    bb = cell.getbbox()
    if not bb:
        return None
    stand = im.crop((col0 * C, 0, (col0 + 1) * C, C)).getbbox() or bb   # attack frame 1 = standing pose
    k = height / max(1, stand[3] - stand[1])
    part = cell.crop(bb)
    part = shrink(part, round(part.width * k), round(part.height * k))
    fx = (C / 2 - bb[0]) * k                              # keep the frame's own sideways shift (dodge)
    fy = (stand[3] - bb[1]) * k                           # the standing baseline, not this frame's bottom
    return part, (int(round(fx)), int(round(fy)))


def ease(t):
    return 0.5 - 0.5 * math.cos(math.pi * max(0.0, min(1.0, t)))


def body_pose(role, kind, f, timing, lunge, miss=False):
    """level-A battle body motion (no extra drawings): (sx, sy, rot, dx, dy) for the user / target at step f.
    kind: physical / special / self; lunge: +1 when the user is bottom-left (target to the right), -1 otherwise."""
    CAST, TRAVEL, HIT, hit0 = timing
    sx = sy = 1.0; rot = dx = dy = 0.0
    if role == "user":
        if kind == "physical":
            if f < CAST:                                 # wind-up: crouch and lean back
                k = math.sin(math.pi * f / CAST * 0.5)
                sx, sy, rot = 1 + 0.07 * k, 1 - 0.09 * k, lunge * 7 * k
                dx, dy = -lunge * 4 * k, 0
            elif f < hit0 + 6:                           # strike: stretch toward the target, lean in, spring back
                k = 1 - abs((f - CAST) / max(1, TRAVEL + 6) * 2 - 1)
                sx, sy, rot = 1 - 0.05 * k, 1 + 0.06 * k, -lunge * 11 * k
        elif kind == "special":
            if f < CAST - 3:                             # gather: swell and rise a little
                k = ease(f / max(1, CAST - 3))
                sx = sy = 1 + 0.07 * k; dy = -2 * k
            elif f < CAST:                               # release: quick squash
                sx, sy, dy = 1.1, 0.9, 0
            elif f < CAST + 6:                           # recoil: rock back
                k = 1 - (f - CAST) / 6
                rot, dx = lunge * 5 * k, -lunge * 2 * k
        else:                                            # self moves: two happy hops
            if f < TRAVEL:
                k = abs(math.sin(math.pi * f / max(1, TRAVEL) * 2))
                dy = -5 * k; sx, sy = 1 - 0.04 * k, 1 + 0.06 * k
    elif role == "target" and miss and HIT and hit0 - 4 <= f < hit0 + 12:   # dodge: a quick hop to the side
        k = math.sin(math.pi * (f - hit0 + 4) / 16)
        dx, dy = lunge * 13 * k, -5 * k
        sx, sy = 1 - 0.05 * k, 1 + 0.05 * k
    elif role == "target" and HIT and hit0 <= f < hit0 + 16:   # hurt: knocked back, tilted away, squashed
        h = f - hit0
        k = (1 - h / 16) ** 1.5
        dx, dy = lunge * 7 * k, -lunge * 2 * k
        rot = -lunge * 10 * k
        if h < 3:
            sx, sy = 1.1, 0.88
    return sx, sy, rot, dx, dy


def faint_pose(i, n, away):
    """level-A faint: flinch, topple away, sink into the platform and fade. (sx, sy, rot, dx, dy, sink_px_frac, alpha)"""
    t = i / max(1, n - 1)
    if t < 0.2:                                          # flinch
        k = t / 0.2
        return 1.06, 0.92, away * 4 * math.sin(k * math.pi * 2), 0, 0, 0.0, 1.0
    if t < 0.45:                                         # topple
        k = ease((t - 0.2) / 0.25)
        return 1.0, 1.0, -away * 22 * k, away * 4 * k, 0, 0.0, 1.0
    k = ease((t - 0.45) / 0.55)                          # sink down through the platform and fade
    return 1.0, 1.0, -away * 22, away * 4, 0, k, 1.0 - 0.6 * k


def move_from(move):
    """the body part a move comes out of: vfx.from in moves.json, else a default by placement / archetype"""
    v = move["vfx"]
    if v.get("from"):
        return v["from"]
    if v.get("cast") == "back":
        return "vent"
    if v.get("cast") == "ground" or v.get("variant") == "kick":
        return "feet"
    if v.get("variant") == "punch":
        return "hand"
    if v["archetype"] in ("projectile", "beam", "sound", "powder", "wave") and move["class"] != "physical":
        return "mouth"
    return "body"


SCENE = None   # a assets/battle-scenes/<district>/<scene>.png (480 x 320 = 240 x 160 x 2) used as the background


def use_scene(path):
    """battle background from the expedition-battle-scene skill; the output scale becomes the scene's own (x2) so its
    pixels stay square"""
    global SCENE, HI
    if not path:
        SCENE = None
        return
    p = path if os.path.isabs(path) else os.path.join(REPO, path)
    if not os.path.isfile(p):
        hits = glob.glob(os.path.join(REPO, "assets", "battle-scenes", "*", f"{path}.png"))
        if not hits:
            raise SystemExit(f"battle scene '{path}' not found (assets/battle-scenes/<district>/<name>.png)")
        p = hits[0]
    im = Image.open(p).convert("RGBA")
    HI = max(1, im.width // W)
    SCENE = im.resize((W * HI, H * HI), Image.NEAREST)


def base_layer():
    """the x HI background: the battle scene, else the simple procedural grass field"""
    if SCENE is not None:
        base = SCENE.copy()
        filler = Image.new("RGBA", base.size, (248, 248, 248, 255))   # under the empty text-box band
        filler.alpha_composite(base)
        return filler
    return background().resize((W * HI, H * HI), Image.NEAREST)


def compose(back, draws, front):
    """final x3 frame: the 240x160 back layer (background, effects behind the Pokémon) scaled x3, the Pokémon drawn at
    x3 resolution (`draws` = [(image, (x, y)) in x3 px]), then the 240x160 front layer (effects, flashes, text) x3"""
    big = base_layer()
    big.alpha_composite(back.convert("RGBA").resize((W * HI, H * HI), Image.NEAREST))
    for img, (x, y) in draws:
        big.paste(img, (int(x), int(y)), img)
    big.alpha_composite(front.resize((W * HI, H * HI), Image.NEAREST))
    return big


def background():
    bg = Image.new("RGBA", (W, H), (248, 248, 232, 255))
    d = ImageDraw.Draw(bg)
    for y in range(H):  # pale sky-to-grass gradient like the Gen 3 grass battle background
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(232 - 40 * t), int(244 - 20 * t), int(220 - 70 * t), 255))
    for (cx, cy), (rx, ry) in ((E_POS, (52, 13)), (P_POS, (60, 15))):
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(152, 208, 112, 255), outline=(96, 160, 72, 255), width=2)
        d.ellipse([cx - rx + 10, cy - ry + 4, cx + rx - 10, cy + ry - 4], fill=(176, 224, 136, 255))
    return bg


def text_box(frame, text):
    d = ImageDraw.Draw(frame)
    d.rectangle([0, TEXT_TOP, W - 1, H - 1], fill=(40, 80, 104, 255))
    d.rectangle([3, TEXT_TOP + 3, W - 4, H - 4], fill=(248, 248, 248, 255), outline=(208, 112, 80, 255), width=2)
    d.text((10, TEXT_TOP + 12), text, fill=(64, 64, 64, 255))


# ---------------------------------------------------------------- the 2 images of a move
# Every move = 2 strips of 8 frames (square cells, magenta-keyed or transparent):
#   CAST   <identifier>-cast.png    on the Pokémon that uses the move (charge, aura, sparks, mouth flash, wind-up)
#   EFFECT <identifier>-effect.png  the move itself (fireball, bolt, wave, beam segment, slash, burst, ...)
# Looked up in assets/skills/<GenX-Region>/<English name>/; missing ones are generated procedurally (archetype x type).
CAST_CELL, EFFECT_CELL, NFR = 96, 96, 8
REF_H = 52  # effect scales were tuned on a ~52 px tall Pokémon
BACK_BASE = 0.30  # "back" casts: base of the image at 30% of the body height (mid back), mostly hidden by the body
CAST_REL = 1.25  # the 96 px cast cell is drawn 1.25 x the user's sprite height
SPLIT = {"projectile", "beam", "fall", "wave", "sound", "powder"}  # effect frames 1-4 travel (loop), 5-8 impact
DIM_TYPES = {"ghost", "dark", "psychic", "dragon"}


def move_folder(move):
    """English move name as a folder name: 'Swords Dance' -> 'Swords-Dance', 'King’s Shield' -> 'Kings-Shield'"""
    n = re.sub(r"[’'.,:]", "", move["name"])
    return re.sub(r"[^A-Za-z0-9]+", "-", n).strip("-")


def move_dir(move):
    """assets/skills/<GenX-Region>/<English name>/ : the move's 2 images and its prompt"""
    return os.path.join(REPO, "assets", "skills", move["gen"], move_folder(move))


# Where the 2 strips come from (decisions.md §12, 2026-11-19, "one main source"):
#   assets/skills/<GenX-Region>/<Name>/ is THE official place of every move: <id>-cast.png + <id>-effect.png (+ <id>-vfx.json),
#   or <id>-code.json for a beam drawn by code (beams.py). apply_official.py writes it from the user's choice
#   (data/battle/move-vfx-official.json) and the default rule (official_plan below) and records where each image came
#   from in data/battle/move-vfx-sources.json. agy is no longer used for move effects; its old drawings are kept in
#   git history and in tmp/history/skills-agy-<date>/ (backed up before apply_official.py overwrote them).
#   source "default" (also "official", and "agy" = the same folder): a code beam when the move's official folder holds
#       <id>-code.json, else per image the strip in assets/skills/<Gen>/<Name>/, else the procedural strip.
#   source "fallback" (comparison: env MONS_VFX_SOURCE=fallback or the `source` argument; an unknown older value is
#       read as "fallback" with a warning): the local library assets/skills/Fallback/<Gen>/<Name>/ (converted from the
#       upstream particle effects by fallback_vfx.py, MPL-2.0, THIRD_PARTY_NOTICES.md, not in git), any
#       image there (approved or not), else the official image, else procedural.
#   source "code" (comparison): beam moves that beams.py knows are drawn by code on the screen itself (charge orb ->
#       one continuous beam -> burst); every other move plays like "default".
# Each image takes its size tuning from the -vfx.json next to the strip it came from (procedural: the official one).
SOURCES = ("default", "fallback", "code", "official", "agy")   # the last 2 are aliases
_ALIAS = {"official": "default", "agy": "default"}
FALLBACK_DIR = os.path.join(REPO, "assets", "skills", "Fallback")
APPROVED = os.path.join(FALLBACK_DIR, "approved.json")
FALLBACK_GENERIC = os.path.join(FALLBACK_DIR, "generic.json")   # {id: [effects]}: library moves converted from generic_move
OFFICIAL_CHOICES = os.path.join(REPO, "data", "battle", "move-vfx-official.json")   # the user's explicit choices
OFFICIAL_SOURCES = os.path.join(REPO, "data", "battle", "move-vfx-sources.json")    # where each official image came from
HISTORY = os.path.join(REPO, "tmp", "history")                                         # skills-agy-<date>/ backups
KINDS = ("cast", "effect")
ORIGINS = ("official", "fallback", "procedural", "code")   # where one played image comes from
CHOICES = ("fallback", "agy", "code")                       # what the user can pick per move
_JSON = {}                                                  # path -> (mtime, data)
_WARNED = set()                                             # unknown source values already reported


def _beams():
    """beams.py (the code-drawn beams), imported from this folder"""
    here = os.path.dirname(os.path.abspath(__file__))
    if here not in sys.path:
        sys.path.insert(0, here)
    import beams
    return beams


def _json(path):
    """a JSON object re-read when the file changes ({} when missing)"""
    try:
        mt = os.path.getmtime(path)
    except OSError:
        return {}
    if _JSON.get(path, (None,))[0] != mt:
        try:
            data = json.load(open(path, encoding="utf-8"))
        except ValueError as e:
            raise SystemExit(f"bad JSON in {path}: {e}")
        _JSON[path] = (mt, data if isinstance(data, dict) else {})
    return _JSON[path][1]


def can_code(move):
    """beams.py can draw this move (a beam it has a style for)"""
    return move["vfx"]["archetype"] == "beam" and _beams().handles(move)


def code_marker(move):
    return os.path.join(move_dir(move), f"{move['identifier']}-code.json")


def code_beam(move, source=None):
    """True when this move is drawn by beams.py for this source: "code" for every beam beams.py knows, "default" when
    the official folder says so (<id>-code.json)"""
    s = vfx_source(source)
    if s == "fallback" or not can_code(move):
        return False
    return s == "code" or os.path.isfile(code_marker(move))


def vfx_source(source=None):
    s = (source or os.environ.get("MONS_VFX_SOURCE") or "default").lower()
    s = _ALIAS.get(s, s)
    if s not in SOURCES:
        # older configs / URLs named the Fallback library after its upstream project: read any unknown value as it
        if s not in _WARNED:
            _WARNED.add(s)
            print(f"vfx: unknown effect source {s!r} read as 'fallback' (use one of {', '.join(SOURCES)})", file=sys.stderr)
        s = "fallback"
    return s


def fallback_dir(move):
    """assets/skills/Fallback/<GenX-Region>/<English name>/ : the strips converted by fallback_vfx.py (local library)"""
    return os.path.join(FALLBACK_DIR, move["gen"], move_folder(move))


def source_dir(move, source=None):
    """folder holding the move's strips for a source: assets/skills/Fallback/<Gen>/... (fallback) or assets/skills/<Gen>/..."""
    return fallback_dir(move) if vfx_source(source) == "fallback" else move_dir(move)


def approved_fallback():
    """assets/skills/Fallback/approved.json: {identifier: {"cast": bool, "effect": bool, "note": str}} (re-read when it changes).
    false = that converted image is empty or clearly broken and is never made official; true / missing = it may be."""
    return _json(APPROVED)


def official_choices():
    """{identifier: "fallback" | "agy" | "code"}: the user's explicit choices (data/battle/move-vfx-official.json)"""
    return {k: v for k, v in _json(OFFICIAL_CHOICES).items() if not k.startswith("_") and v in CHOICES}


def applied_sources():
    """{identifier: record} of data/battle/move-vfx-sources.json (what apply_official.py wrote into assets/skills/<Gen>/);
    the label "fallback-generic" (the upstream generic type impact) is read as "fallback" with "generic": true"""
    out = {}
    for k, v in (_json(OFFICIAL_SOURCES).get("moves") or {}).items():
        if isinstance(v, dict):
            if GENERIC_LABEL in (v.get("source"), v.get("cast"), v.get("effect")):
                v = dict(v, generic=True, **{f: "fallback" for f in ("source", "cast", "effect") if v.get(f) == GENERIC_LABEL})
            out[k] = v
    return out


GENERIC_LABEL = "fallback-generic"


def is_generic(move):
    """the move's Fallback version is the upstream generic_move (type impact + hit on the target, user 2026-11-20:
    every damaging move without its own upstream effect plays it), not an effect of its own"""
    return move["identifier"] in _json(FALLBACK_GENERIC)


_BLANK = {}                                       # path -> (mtime, blank?)


def is_blank(path):
    """True when a strip has no visible pixel at all (converted effects with no particles)"""
    mt = os.path.getmtime(path)
    if _BLANK.get(path, (None,))[0] != mt:
        _BLANK[path] = (mt, Image.open(path).convert("RGBA").getchannel("A").getbbox() is None)
    return _BLANK[path][1]


def is_approved(move, kind):
    """the Fallback image may be made official: not marked false in approved.json (a deny list in practice)"""
    return (approved_fallback().get(move["identifier"]) or {}).get(kind) is not False


def strip_path(move, kind, origin):
    """the strip file of one origin: 'official' (= 'agy', assets/skills/<Gen>/) or 'fallback' (assets/skills/Fallback/<Gen>/)"""
    d = fallback_dir(move) if origin == "fallback" else move_dir(move)
    return os.path.join(d, f"{move['identifier']}-{kind}.png")


def agy_original(move, name):
    """path of agy's own drawing `name` (<id>-cast.png / <id>-effect.png / <id>-vfx.json) of a move, or None: the newest
    backup in tmp/history/skills-agy-*/, else the file in assets/skills/<Gen>/ while it is still agy's (the move was never
    applied, or its record says that image came from agy)"""
    rel = os.path.join(move["gen"], move_folder(move), name)
    bk = sorted(glob.glob(os.path.join(HISTORY, "skills-agy-*", rel)))
    if bk:
        return bk[-1]
    p = os.path.join(move_dir(move), name)
    if not os.path.isfile(p):
        return None
    rec = applied_sources().get(move["identifier"])
    if rec is None:
        return p
    kind = next((k for k in KINDS if name.endswith(f"-{k}.png")), None)
    return p if kind and rec.get(kind) == "agy" else None


def lib_path(move, kind, lib):
    """the candidate image of a library for the official choice: 'fallback' or 'agy' (agy's old drawing)"""
    if lib == "fallback":
        return strip_path(move, kind, "fallback")
    return agy_original(move, f"{move['identifier']}-{kind}.png")


def unusable(move, kind, lib):
    """None when that library's image may be official, else 'missing', 'blank' or 'denied' (approved.json false)"""
    p = lib_path(move, kind, lib)
    if not p or not os.path.isfile(p):
        return "missing"
    if is_blank(p):
        return "blank"
    if lib == "fallback" and not is_approved(move, kind):
        return "denied"
    return None


def usable(move, lib):
    """the library has at least one usable image of this move (code: beams.py draws it)"""
    return can_code(move) if lib == "code" else any(unusable(move, k, lib) is None for k in KINDS)


# beam-archetype moves whose Fallback version may win over the code beam. Empty: the user's rule (2026-11-20) is that
# every move that already played as a code beam stays code ("các skill đã chọn code từ trước thì không chuyển qua").
SPRAY_BEAMS: set = set()


def default_source(move):
    """the default rule for a move with no explicit choice (user 2026-11-19, 2026-11-20): a code beam (except the
    SPRAY_BEAMS with a usable Fallback version), else the Fallback version when it is usable, else agy's old drawing,
    else procedural"""
    if can_code(move) and not (move["identifier"] in SPRAY_BEAMS and usable(move, "fallback")):
        return "code"
    return next((lib for lib in ("fallback", "agy") if usable(move, lib)), "procedural")


_ORDER = {"fallback": ("fallback", "agy"), "agy": ("agy", "fallback"), "procedural": ("fallback", "agy")}


def official_plan(move, choice=Ellipsis):
    """what the official folder of a move should hold: {source, explicit, default, cast, effect, why} where cast / effect
    = 'fallback' / 'agy' / 'procedural' / 'code' and why = {kind: reason} for the images filled from the next source
    because the chosen one has none (reason 'missing' / 'blank' / 'denied'). The explicit choice (choice=Ellipsis: from
    move-vfx-official.json; None = the default rule) wins at the move level, except that a usable Fallback version
    beats a choice of agy (user 2026-11-20: all upstream move effects are official; the generic move effect does not);
    per image the order is fallback ->
    agy -> procedural (choice agy, only left when Fallback has no usable image: agy -> fallback -> procedural)."""
    if choice is Ellipsis:
        choice = official_choices().get(move["identifier"])
    if choice == "code" and not can_code(move):
        choice = None
    if choice == "agy" and usable(move, "fallback") and not is_generic(move):
        # user 2026-11-20 ("về hiệu ứng skill thì lấy toàn bộ của <the upstream project>"): every upstream move effect
        # is official, so a usable Fallback version wins over agy's old drawing even where agy was chosen. The generic
        # move effect (type impact + hit, not the move's own) does not: a move the user had agy draw and chose
        # explicitly keeps agy's drawing (Dig, user 2026-11-20)
        choice = "fallback"
    default = default_source(move)
    src = choice or default
    out = {"source": src, "explicit": bool(choice), "default": default, "why": {}}
    for k in KINDS:
        if src == "code":
            out[k] = "code"
            continue
        out[k] = next((lib for lib in _ORDER[src] if unusable(move, k, lib) is None), "procedural")
        if src in ("fallback", "agy") and out[k] != src:
            out["why"][k] = unusable(move, k, src)
    return out


def official_origin(move, kind):
    """where image `kind` of the move's official version comes from by the rule (before / without applying)"""
    return official_plan(move)[kind]


def strip_origin(move, kind, source=None):
    """'official', 'fallback', 'procedural' or 'code': where image `kind` (cast / effect) of the move is played from
    for this source"""
    if code_beam(move, source):
        return "code"

    def has(o):
        p = strip_path(move, kind, o)
        return os.path.isfile(p) and (forced or not is_blank(p))
    forced = vfx_source(source) == "fallback"
    order = ["fallback", "official"] if forced else ["official"]
    return next((o for o in order if has(o)), "procedural")


def strip_origins(move, source=None):
    return {k: strip_origin(move, k, source) for k in KINDS}


def has_source(move, source):
    d = source_dir(move, source)
    return any(os.path.isfile(os.path.join(d, f"{move['identifier']}-{k}.png")) for k in KINDS)


def load_strip(path):
    if not os.path.isfile(path):
        return None
    im = Image.open(path).convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if r - g > 70 and b - g > 70 and r > 120 and b > 120:
                px[x, y] = (0, 0, 0, 0)
    c = im.height
    return [im.crop((i * c, 0, (i + 1) * c, c)) for i in range(max(1, im.width // c))]


# Cells: a strip's cell is its image height (96 px by default; a strip may use a bigger cell so that nothing is cut,
# decisions.md §12 2026-11-19). The on-screen size follows the DRAWING: one cell pixel is always drawn at the same
# scale as a pixel of a 96 px cell (CAST_CELL / EFFECT_CELL are the reference densities), so a bigger cell only adds
# room around the drawing, centred on the same point.
def touches(frame, side, min_run=4):
    """True when opaque pixels run >= min_run px along that border of the frame (the drawing is cut there)"""
    a = frame.getchannel("A")
    W_, H_ = frame.size
    line = {"left": a.crop((0, 0, 1, H_)), "right": a.crop((W_ - 1, 0, W_, H_)),
            "top": a.crop((0, 0, W_, 1)), "bottom": a.crop((0, H_ - 1, W_, H_))}[side].tobytes()
    run = best = 0
    for v in line:
        run = run + 1 if v else 0
        best = max(best, run)
    return best >= min_run


LINE_ARCHS = {"beam"}   # straight-line moves (rays, streams, jets): their start is pushed in front of the mouth


def mask_points(mask, thr=60):
    """opaque pixels [(x, y)] of a 240 x 160 L mask (the user's sprite over the frames a beam is shown)"""
    w = mask.width
    return [(i % w, i // w) for i, v in enumerate(mask.tobytes()) if v > thr]


def beam_start(pts, mouth, dst, side, r0, w=None, reach=0.55):
    """decisions.md §12 (user rule 2026-11-19): a straight-line move starts IN FRONT of the user's mouth and never
    covers the user's own sprite. From the mouth point, step sideways toward the target (`side` +1 = right for the
    player's Pokémon seen from behind, -1 = left for the opponent), keeping the mouth height, until neither the start
    disc (radius r0: charge orb / flared beam end) nor the beam body toward `dst` (half-width w[int(u)] at u px along
    it, the last value beyond) touches any of the user's opaque pixels `pts` (1 px to spare). Never further than
    `reach` x the horizontal distance to the target; returns the start point."""
    x0, y = mouth
    if not pts:
        return (x0, y)
    w = list(w or [0.0])
    lim = max(0, int(abs(dst[0] - x0) * reach))
    r2 = (r0 + 1) ** 2
    for t in range(lim + 1):
        px, py = x0 + side * t, y
        L = math.dist((px, py), dst) or 1.0
        dx, dy = (dst[0] - px) / L, (dst[1] - py) / L
        clear = True
        for qx, qy in pts:
            rx, ry = qx + 0.5 - px, qy + 0.5 - py
            if rx * rx + ry * ry < r2:
                clear = False
                break
            u = rx * dx + ry * dy
            if 0 < u < L and abs(rx * dy - ry * dx) < w[min(len(w) - 1, int(u))] + 1:
                clear = False
                break
        if clear:
            return (px, py)
    return (x0 + side * lim, y)


_CAPS = {}


def beam_cap(frame, side):
    """a beam segment cut by the cell edge (copies join along the path) gets a rounded end on `side` ('left' /
    'right') where it is the first / last copy, so the beam never ends in a straight cut; outlined like the drawing"""
    key = (id(frame), side)
    if key in _CAPS and _CAPS[key][0] is frame:
        return _CAPS[key][1]
    out = frame
    if touches(frame, side):
        W_, H_ = frame.size
        a = frame.getchannel("A")
        col = a.crop((0, 0, 1, H_) if side == "left" else (W_ - 1, 0, W_, H_)).tobytes()
        ys = [y for y, v in enumerate(col) if v]
        y0, y1 = ys[0], ys[-1]
        cy, hh = (y0 + y1) / 2, max(2.0, (y1 - y0) / 2 + 1)
        r = max(3.0, min(hh, W_ / 2))
        out = frame.copy()
        px, al = out.load(), a.load()
        def keep(x, y):   # inside the half-ellipse that closes the band (d = 0 where the cap starts, 1 at the edge)
            d = (r - x) / r if side == "left" else (x - (W_ - 1 - r)) / r
            return d <= 0 or ((y - cy) / hh) ** 2 + d * d <= 1
        cut = set()
        xs = range(0, int(r) + 1) if side == "left" else range(int(W_ - 1 - r), W_)
        for x in xs:
            for y in range(H_):
                if al[x, y] and not keep(x, y):
                    px[x, y] = (0, 0, 0, 0)
                    cut.add((x, y))
        for x, y in cut:   # outline the new rounded edge
            if any((x + dx, y + dy) not in cut and 0 <= x + dx < W_ and 0 <= y + dy < H_ and px[x + dx, y + dy][3]
                   for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = OUTLINE
    if len(_CAPS) > 256:
        _CAPS.clear()
    _CAPS[key] = (frame, out)
    return out


def from_sky(frame, top_y, sy):
    """a falling frame whose drawing touches the cell top (a bolt from the sky): extend its touching columns up so it
    reaches the top of the screen instead of ending in a straight cut. top_y = screen y of the cell top, sy = scale.
    Returns (image, extra cell px added on top)."""
    if top_y <= 0 or not touches(frame, "top"):
        return frame, 0
    ext = int(math.ceil(top_y / max(sy, 1e-3))) + 2
    out = Image.new("RGBA", (frame.width, frame.height + ext), (0, 0, 0, 0))
    out.paste(frame.crop((0, 0, frame.width, 1)).resize((frame.width, ext), Image.NEAREST), (0, 0))
    out.paste(frame, (0, ext))
    return out, ext


def _glow(size, col, r, alpha):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = size / 2
    for k in range(4, 0, -1):
        rr = r * k / 4
        d.ellipse([c - rr, c - rr * 0.8, c + rr, c + rr * 0.8], fill=col + (int(alpha * (5 - k) / 4),))
    return im


def proc_cast(move):
    """procedural CAST strip: a pulsing type-coloured aura with particles rising / orbiting around the body"""
    typ = move["type"]; pal = PAL.get(typ, PAL["normal"])
    out = []
    for f in range(NFR):
        im = _glow(CAST_CELL, pal[2], 30 + 6 * math.sin(f / NFR * 2 * math.pi), 90)
        c = CAST_CELL / 2
        for i in range(6):
            a = f / NFR * 2 * math.pi + i * math.pi / 3
            rr = 30 + 4 * math.sin(f + i)
            p = particle(typ, f + i, 12)
            im.alpha_composite(p, (int(c + rr * math.cos(a) - 6), int(c + rr * 0.7 * math.sin(a) - 6 - f % 4)))
        if move["class"] == "physical":  # wind-up: speed lines instead of a big aura
            d = ImageDraw.Draw(im)
            for i in range(3):
                y = 30 + i * 16 + (f * 3) % 8
                d.line([(10, y), (34, y)], fill=(255, 255, 255, 200), width=2)
        out.append(im)
    return out


def proc_effect(move):
    """procedural EFFECT strip, by archetype: the object / blast the move throws"""
    arch, typ = move["vfx"]["archetype"], move["type"]; pal = PAL.get(typ, PAL["normal"])
    variant = move["vfx"].get("variant", "hit")
    out = []
    for f in range(NFR):
        im = Image.new("RGBA", (EFFECT_CELL, EFFECT_CELL), (0, 0, 0, 0))
        c = EFFECT_CELL // 2
        if arch in SPLIT and f >= 4:                     # frames 5-8: the impact on the target
            k = f - 4
            im.alpha_composite(_glow(EFFECT_CELL, pal[2], 14 + k * 9, 170 - k * 35), (0, 0))
            for i in range(8):
                a = i * math.pi / 4 + k * 0.2
                p = particle(typ if arch != "sound" else typ, f + i, 20 - k * 2)
                rr = 8 + k * 9
                im.alpha_composite(p, (int(c + rr * math.cos(a) - p.width / 2), int(c + rr * 0.8 * math.sin(a) - p.height / 2)))
            out.append(im)
            continue
        if arch == "contact":
            g = generic(variant, f, 40 + f * 5, pal)
            im.alpha_composite(g, (c - g.width // 2, c - g.height // 2))
        elif arch in ("projectile", "beam", "sound", "powder"):
            im.alpha_composite(_glow(EFFECT_CELL, pal[2], 26, 110), (0, 0))
            p = particle(typ, f, 44) if arch != "sound" else generic("note", f, 44, pal)
            im.alpha_composite(p, (c - 22, c - 22))
            for i in range(3):  # trail (stays inside the cell: decisions.md §12, never cut at the cell edge)
                q = particle(typ, f + i + 1, 18 - i * 4)
                im.alpha_composite(q, (c - 22 - i * 8 - q.width // 2, c - q.height // 2))
        elif arch == "fall":
            if typ == "electric":
                d = ImageDraw.Draw(im)
                x = c + (f % 2) * 6 - 3
                # from the sky (the top edge is extended up by animate()), pointed end inside the cell
                pts = [(x, 0), (x + 10, 24), (x - 6, 26), (x + 8, 52), (x - 8, 54), (x + 4, EFFECT_CELL - 14), (x + 1, EFFECT_CELL - 8)]
                d.line(pts, fill=OUTLINE, width=9); d.line(pts, fill=pal[2] + (255,), width=5); d.line(pts, fill=(255, 255, 255, 255), width=2)
            else:
                for i in range(4):
                    p = particle(typ, f + i, 26)
                    im.alpha_composite(p, (10 + i * 20, (f * 9 + i * 23) % (EFFECT_CELL - 26)))
        elif arch in ("burst", "quake", "debuff"):
            r = 8 + f * 4                               # the 18 px ring particles stay >= 2 px inside the cell
            im.alpha_composite(_glow(EFFECT_CELL, pal[2], r, 150 - f * 12), (0, 0))
            for i in range(8):
                a = i * math.pi / 4
                p = particle(typ if arch != "quake" else "ground", f + i, 18)
                im.alpha_composite(p, (int(c + r * math.cos(a) - 9), int(c + r * 0.7 * math.sin(a) - 9)))
        elif arch == "wave":
            for i in range(5):
                p = particle(typ, f + i, 26)
                im.alpha_composite(p, (4 + i * 15, int(c - 20 + 12 * math.sin(f * 0.8 + i))))
        elif arch in ("buff", "heal"):
            im.alpha_composite(_glow(EFFECT_CELL, (250, 110, 80) if arch == "buff" else (110, 230, 130), 34, 90), (0, 0))
            g = generic("up", f, 26) if arch == "buff" else generic("sparkle", f, 26, PAL["grass"])
            im.alpha_composite(g, (c + 18, c - 26 - f * 2))
            for i in range(4):
                p = particle(typ, f + i, 14)
                im.alpha_composite(p, (c - 30 + i * 18, EFFECT_CELL - 20 - ((f * 7 + i * 13) % 60)))
        else:  # field
            for i in range(6):
                p = particle(typ, f + i, 18)
                im.alpha_composite(p, (2 + (i * 37 + f * 5) % (EFFECT_CELL - 22), 2 + (i * 29 + f * 11) % (EFFECT_CELL - 22)))
        out.append(im)
    return out


def move_tweaks(move, source=None):
    """optional per-move tuning assets/skills/<Gen>/<Name>/<identifier>-vfx.json:
    {"cast": {"scale": 1.3, "w": 1, "h": 1, "x": 0, "y": -0.1}, "effect": {...}}
    scale multiplies the automatic (size-following) scale, w / h stretch width / height only,
    x / y shift by a fraction of the Pokémon's height (cast: the user, effect: the target; y < 0 = up).
    Each image uses the -vfx.json next to the strip it comes from (the official one in assets/skills/<Gen>/, or the Fallback
    library's when comparing; procedural: the official one). apply_official.py merges the right parts into the official
    -vfx.json."""
    base = {"scale": 1.0, "w": 1.0, "h": 1.0, "x": 0.0, "y": 0.0}
    out = {"cast": dict(base), "effect": dict(base)}
    for k, origin in strip_origins(move, source).items():
        if origin == "code":                              # code beams are sized by beams.py itself
            continue
        d = fallback_dir(move) if origin == "fallback" else move_dir(move)
        p = os.path.join(d, f"{move['identifier']}-vfx.json")
        if os.path.isfile(p):
            try:
                data = json.load(open(p, encoding="utf-8"))
            except ValueError as e:
                raise SystemExit(f"bad JSON in {p}: {e}")
            out[k].update({kk: float(v) for kk, v in (data.get(k) or {}).items() if kk in base})
    return out


def move_strips(move, source=None):
    """(cast frames, effect frames): each image from strip_origin() (default: the official image in assets/skills/<Gen>/ ->
    procedural; code beams: beams.py's pictures)"""
    org = strip_origins(move, source)
    if "code" in org.values():                            # beams.py: a picture of the charge / beam / burst
        return _beams().strips(move)
    cast = load_strip(strip_path(move, "cast", org["cast"])) if org["cast"] != "procedural" else None
    eff = load_strip(strip_path(move, "effect", org["effect"])) if org["effect"] != "procedural" else None
    return cast or proc_cast(move), eff or proc_effect(move)


# ---------------------------------------------------------------- animation: CAST -> EFFECT -> HIT
def timeline(move, source=None):
    """(cast, travel, hit) frame counts of a move (code beams: charge, fire, hit from beams.py)"""
    if code_beam(move, source):
        return _beams().timeline(move)
    arch = move["vfx"]["archetype"]
    self_only = arch in ("buff", "heal", "field")
    travel = {"contact": 8, "projectile": 14, "beam": 18, "fall": 12, "wave": 18, "quake": 4, "burst": 4, "sound": 16,
              "powder": 18, "debuff": 4, "buff": 30, "heal": 30, "field": 34}.get(arch, 10)
    return (0 if self_only else 16), travel, (0 if self_only else 18)


def animate(move, attacker, target, enemy_attacks=False, seed=1, log=None, miss=False, source=None):
    """240x160 RGBA frames (30 fps): CAST strip on the user, EFFECT strip along the archetype path, hit reaction.
    log (a list) receives one dict per drawn layer: {step, layer, behind, box, mask, x, y} and a {"meta": ...} first,
    used by expedition-skill-review to measure size / position / coverage."""
    rnd = random.Random(seed)
    arch, typ = move["vfx"]["archetype"], move["type"]
    pal = PAL.get(typ, PAL["normal"])
    cast, eff = move_strips(move, source)
    CC, EC = cast[0].height, eff[0].height       # cell sizes of the 2 strips (96, or bigger so nothing is cut)
    spr_p = battle_sprite(attacker if not enemy_attacks else target, "back")
    spr_e = battle_sprite(target if not enemy_attacks else attacker, "front")
    hi_of = {id(spr_p): battle_sprite(attacker if not enemy_attacks else target, "back", spr_p.height * HI, 96 * HI),
             id(spr_e): battle_sprite(target if not enemy_attacks else attacker, "front", spr_e.height * HI, 96 * HI)}
    a_pos, t_pos = (E_POS, P_POS) if enemy_attacks else (P_POS, E_POS)
    a_spr, t_spr = (spr_e, spr_p) if enemy_attacks else (spr_p, spr_e)
    ua, ut = a_spr.height / REF_H, t_spr.height / REF_H        # every effect scales with the Pokémon it is on
    a_ctr = (a_pos[0], a_pos[1] - a_spr.height // 2)           # body centres follow the real sprite sizes
    # where the move comes out of (data/pokemon/pokemon-anchors.json, from the 3D model): mouth, vent, hand, feet, body
    part = move_from(move)
    a_view = "front" if enemy_attacks else "back"
    em = None
    if attacker and part == "hand":
        hs_ = [anchor_xy(attacker, a_view, k, a_spr, a_pos) for k in ("hand_l", "hand_r")]
        hs_ = [h for h in hs_ if h]
        em = max(hs_, key=lambda h: (h[0] if not enemy_attacks else -h[0])) if hs_ else None   # the hand nearer the target
    elif attacker and part not in ("body", "feet"):
        em = anchor_xy(attacker, a_view, part, a_spr, a_pos)
    a_src = (em[0], em[1]) if em and arch in SPLIT else a_ctr  # travelling effects start at that body part
    t_ctr = (t_pos[0], t_pos[1] - t_spr.height // 2)
    lunge = -1 if enemy_attacks else 1
    beam = None
    is_code = code_beam(move, source)
    t_pt = t_ctr
    if is_code:   # drawn by beams.py: mouth (or vent) -> the target's body anchor (the Beam is made below)
        t_view = "back" if enemy_attacks else "front"
        tb = anchor_xy(target, t_view, "body", t_spr, t_pos) if target else None
        if tb:   # the body anchor, kept inside the middle of the sprite (the 2D drawing is not the 3D model)
            t_pt = (max(t_pos[0] - t_spr.width * 0.3, min(t_pos[0] + t_spr.width * 0.3, tb[0])),
                    max(t_pos[1] - t_spr.height * 0.75, min(t_pos[1] - t_spr.height * 0.3, tb[1])))
    bg = Image.new("RGBA", (W, H), (0, 0, 0, 0))     # behind-the-Pokémon layer; the background is added in compose()
    if typ in DIM_TYPES:
        bg.alpha_composite(Image.new("RGBA", (W, H), (20, 10, 40, 110)))
    self_only = arch in ("buff", "heal", "field")
    CAST, TRAVEL, HIT = timeline(move, source)
    total = CAST + TRAVEL + HIT
    hit0 = CAST + TRAVEL
    frames = []
    body_kind = "self" if self_only else ("physical" if move["class"] == "physical" else "special")
    if arch in ("debuff", "sound", "powder") or move["class"] == "status":
        body_kind = "self" if self_only else "special"

    def user_offset(f):
        """the user's own sideways move at step f: physical wind-up, contact lunge"""
        if f < CAST:
            if move["class"] == "physical":
                k = f / CAST
                return (int(-lunge * 5 * math.sin(k * math.pi)), int(lunge * 3 * math.sin(k * math.pi)))
        elif arch == "contact" and f < hit0:               # lunge to the target
            k = (f - CAST) / TRAVEL
            return (int(lunge * 18 * k), int(-lunge * 10 * k))
        elif arch == "contact" and f < hit0 + 4:
            k = 1 - (f - hit0) / 4
            return (int(lunge * 18 * k), int(-lunge * 10 * k))
        return (0, 0)

    def pose_of(who, sprite, f, hi=True):
        """battle pose of the user / target at step f (untinted): (image, (feet_x, feet_y) in it, x HI image, its feet,
        (dx, dy) extra body offset); level B (drawn <slug>-battle.png) when the species has it, else level-A motion"""
        slug_ = attacker if who == "user" else target
        view_ = ("front" if enemy_attacks else "back") if who == "user" else ("back" if enemy_attacks else "front")
        anim_, i_ = None, 0
        if who == "user" and f < hit0 + 6 and not self_only:
            anim_ = "attack"
            i_ = min(2, 3 * f // max(1, CAST)) if f < CAST else (3 if f < CAST + max(2, TRAVEL // 2) else 4) if f < hit0 else 5
        elif who == "target" and HIT and miss and hit0 - 4 <= f < hit0 + 12:
            anim_, i_ = "dodge", min(5, (f - hit0 + 4) * 6 // 16)
        elif who == "target" and HIT and not miss and hit0 <= f < hit0 + 16:
            anim_, i_ = "hurt", min(5, (f - hit0) * 6 // 16)
        drawn = battle_frame(slug_, view_, anim_, i_, sprite.height) if anim_ and slug_ else None
        if drawn:
            img_, fxy = drawn
            hi_img, hfxy = battle_frame(slug_, view_, anim_, i_, sprite.height * HI) if hi else (None, None)
            dd = (0, 0)
            if anim_ == "dodge":                           # drawn dodges are often too small: add the level-A hop
                _, _, _, hdx, hdy = body_pose(who, body_kind, f, (CAST, TRAVEL, HIT, hit0), lunge, miss)
                dd = (int(round(hdx)), int(round(hdy)))
            return img_, fxy, hi_img, hfxy, dd
        psx, psy, prot, pdx, pdy = body_pose(who, body_kind, f, (CAST, TRAVEL, HIT, hit0), lunge, miss)
        s_, fxy = posed(sprite, psx, psy, prot)
        hi_img, hfxy = posed(hi_of[id(sprite)], psx, psy, prot) if hi else (None, None)
        return s_, fxy, hi_img, hfxy, (int(round(pdx)), int(round(pdy)))

    # straight-line moves start IN FRONT of the mouth, outside the user's sprite (decisions.md §12, user rule
    # 2026-11-19): the user's opaque pixels over every step the charge / beam is shown, then beam_start
    beam_src = cast_at = None
    if arch in LINE_ARCHS and attacker and not self_only:
        um = Image.new("L", (W, H), 0)
        for f in range(hit0 + (_beams().HOLD + _beams().RETRACT if is_code else 0)):
            img_, (fx_, fy_), _, _, dd = pose_of("user", a_spr, f, hi=False)
            off = user_offset(f)
            um.paste(255, (a_pos[0] - fx_ + off[0] + dd[0], a_pos[1] - fy_ + off[1] + dd[1]),
                     img_.getchannel("A").point(lambda v: 255 if v > 60 else 0))
        pts = mask_points(um)
        mouth = (em[0], em[1]) if em else a_ctr
        side = -1 if enemy_attacks else 1
        if is_code:
            r0, wl, ymax = _beams().start_reach(move, ua)
            beam_src = beam_start(pts, (mouth[0], min(mouth[1], ymax)), t_pt, side, r0, wl)
        else:   # strips: the segments (beam_cap rounds the first one) and the charge image, each just outside
            tw_ = move_tweaks(move, source)
            trav = eff[:4] if len(eff) >= 8 else eff
            bbs = [b for b in (t.getbbox() for t in trav) if b]
            k_ = 0.32 * ua * tw_["effect"]["scale"]
            sx_, sy_ = k_ * tw_["effect"]["w"], k_ * tw_["effect"]["h"]
            hh = max((max(abs(b[1] - EC / 2), abs(b[3] - EC / 2)) for b in bbs), default=EC / 4) * sy_
            beam_src = beam_start(pts, mouth, t_ctr, side, max(EC * sx_ / 2 * 0.8, hh), [hh])
            cbs = [b for b in (c.getbbox() for c in cast) if b]
            if cbs and move["vfx"].get("cast", "body") == "body":
                ck = a_spr.height * CAST_REL / CAST_CELL * tw_["cast"]["scale"]
                rc = max(max(abs(b[0] - CC / 2), abs(b[2] - CC / 2)) * tw_["cast"]["w"] for b in cbs) * ck
                rc = max(rc, max(max(abs(b[1] - CC / 2), abs(b[3] - CC / 2)) * tw_["cast"]["h"] for b in cbs) * ck)
                bot = max((b[3] - CC / 2) * tw_["cast"]["h"] for b in cbs) * ck   # its drawing stays above the text box
                cast_at = beam_start(pts, (mouth[0], min(mouth[1], TEXT_TOP - 2 - bot)), t_ctr, side, rc * 0.8)
        a_src = beam_src
    if is_code:
        beam = _beams().Beam(move, beam_src or ((em[0], em[1]) if em else a_ctr), t_pt, ua, ut, t_spr.height,
                             (CAST, TRAVEL, HIT), seed=seed)

    def at(fr, img, x, y, scale=1.0, shake=(0, 0), layer="effect", behind=False, clip_above=None):
        sx, sy = scale if isinstance(scale, tuple) else (scale, scale)
        if (sx, sy) != (1.0, 1.0):
            img = img.resize((max(1, int(img.width * sx)), max(1, int(img.height * sy))), Image.NEAREST)
        px_, py_ = int(x - img.width / 2 + shake[0]), int(y - img.height / 2 + shake[1])
        if clip_above is not None:                       # keep only the rows below screen y = clip_above
            cut = int(clip_above) - py_
            if cut >= img.height:
                return
            if cut > 0:
                img = img.copy(); img.paste((0, 0, 0, 0), (0, 0, img.width, cut))
        fr.alpha_composite(img, (px_, py_))
        if log is not None:
            bb = img.getbbox()
            if bb:
                log.append({"step": f, "layer": layer, "behind": behind, "x": px_, "y": py_, "mask": img.split()[3],
                            "box": (px_ + bb[0], py_ + bb[1], px_ + bb[2], py_ + bb[3])})

    def lerp(p, q, t):
        return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)

    # where the CAST image sits on the user (vfx.cast in moves.json): body (default) / back / ground
    place = move["vfx"].get("cast", "body")
    a_h = a_spr.height
    tw = move_tweaks(move, source)
    tc, te = tw["cast"], tw["effect"]
    cast_k = a_h * CAST_REL / CAST_CELL * tc["scale"]    # the cast image follows the user's size (x per-move tweak)
    cast_scale = cast_k * tc["h"]                        # vertical scale (used for anchoring)
    CS = (cast_k * tc["w"], cast_k * tc["h"])
    cast_dx = tc["x"] * a_h

    def E(k):                                             # effect scale k with the per-move tweak
        return (k * te["scale"] * te["w"], k * te["scale"] * te["h"])
    half = CC * cast_scale / 2

    def bottom(frames_):                                  # lowest drawn pixel over all frames (cell px)
        return max(((fr_.getbbox() or (0, 0, 0, fr_.height))[3] for fr_ in frames_), default=frames_[0].height if frames_ else CAST_CELL)

    # back / ground: anchor where the DRAWING ends, not the cell (agy may draw it anywhere in the slot)
    lift = (bottom(cast) - CC / 2) * cast_scale
    cast_x = a_pos[0]
    if place == "back" and em:   # out of its vent / back anchor: the drawing's base on that point
        cast_y = em[1] - lift
        cast_x = em[0]
    elif place == "back":    # no anchor: behind the body, drawing's base at mid back, rising above the head
        cast_y = a_pos[1] - BACK_BASE * a_h - lift
    elif place == "ground":  # on the ground: drawing's base just under the feet, behind the body
        cast_y = a_pos[1] + 3 - lift
    elif cast_at:            # a straight-line move's charge: in front of the mouth, outside the user (beam_start)
        cast_x, cast_y = cast_at
    elif em:                 # centred on the body part the move comes out of (e.g. the mouth)
        cast_x, cast_y = em[0], em[1]
    else:
        cast_y = a_ctr[1]
    cast_y += tc["y"] * a_h
    if place == "back":   # not enough room above (the opponent stands high): shrink it, keep its base on the back
        top_px = min(((fr_.getbbox() or (0, CC, 0, 0))[1] for fr_ in cast), default=0)
        base_y = cast_y + lift
        top_y = base_y - (bottom(cast) - top_px) * cast_scale
        if top_y < 2:   # shrink to fit, but never below 60%: a big eruption may run off the top of the screen
            k = max(0.6, (base_y - 2) / (base_y - top_y))
            cast_k *= k; cast_scale *= k; CS = (CS[0] * k, CS[1] * k)
            half = CC * cast_scale / 2
            cast_y = base_y - (bottom(cast) - CC / 2) * cast_scale
    else:   # keep the top of the DRAWING on screen (not the cell: a ring at the feet fills only the cell's lower part,
        # and pushing by the cell moved the Bulldoze ring of a high-standing opponent far below its feet)
        top_px = min(((fr_.getbbox() or (0, CC, 0, 0))[1] for fr_ in cast), default=0)
        cast_y = max(cast_y, (CC / 2 - top_px) * cast_scale - 4)
    # behind the body unless the anchor faces the camera (Torkoal's shell seen from behind: in front)
    cast_behind = place == "ground" or (place == "back" and not (em and em[2]))
    ground_line = a_pos[1] - 0.3 * a_h                   # ground casts: the part below this line is drawn again in front
    imp = eff[4:] if arch in SPLIT and len(eff) >= 8 else eff
    ground_hit = arch in ("quake", "fall")               # impacts that happen on the ground under the target
    if arch == "quake":   # cracks spread on the ground: as wide as the target, behind it
        hs = max(0.4, max(t_spr.width, t_spr.height) * 1.25 / EFFECT_CELL)
    else:
        hs = max(0.4, t_spr.height * (1.5 if arch != "beam" else 1.1) / EFFECT_CELL)
    hs_y = hs * te["scale"] * te["h"]
    iy = (t_pos[1] + 4 - (bottom(imp) - EC / 2) * hs_y) if ground_hit else t_ctr[1]
    iy += te["y"] * t_spr.height
    ix = t_ctr[0] + te["x"] * t_spr.height
    if log is not None:
        log.append({"meta": {"move": move["identifier"], "archetype": arch, "cast_place": place, "enemy": enemy_attacks,
                             "cast_steps": CAST, "travel_steps": TRAVEL, "hit_steps": HIT, "hit0": hit0,
                             "user_feet": a_pos, "target_feet": t_pos, "screen": (W, H), "text_top": TEXT_TOP}})
    for f in range(total):
        fr = bg.copy()
        shake = (rnd.choice((-3, 3)), rnd.choice((-1, 1))) if arch == "quake" and CAST <= f < total - 4 else (0, 0)
        if beam:
            shake = beam.shake(f)
            dim = beam.dim(f)
            if dim:
                fr.alpha_composite(Image.new("RGBA", (W, H), dim))
        if f < CAST and cast_behind and not beam:                       # 1st image behind the user's body
            at(fr, cast[f % len(cast)], cast_x + cast_dx, cast_y, CS, shake, layer="cast", behind=True)
        if arch == "quake" and f >= hit0 and HIT and not miss:   # quake impact on the ground, behind the target
            at(fr, eff[min(len(eff) - 1, (f - hit0) // 2)], ix, iy, E(hs), shake, layer="impact", behind=True)
        t_off, t_hidden, a_tint, t_tint = (0, 0), False, None, None
        a_off = user_offset(f)                             # CAST: wind-up; contact: lunge to the target and back
        if f < CAST and move["class"] != "physical" and f >= CAST - 4 and f % 2 == 0:
            a_tint = pal[3]                                # short bright flash just before release
        if self_only and (f // 3) % 2 == 0:
            a_tint = (250, 100, 70) if arch == "buff" else (90, 230, 120) if arch == "heal" else None
        if HIT and hit0 <= f < hit0 + 14 and not miss:     # HIT: target shakes, blinks, takes the type tint
            t_off = (3 if (f // 2) % 2 else -3, 0)
            t_hidden = (f - hit0) % 4 == 1 and arch not in ("debuff", "sound", "powder")
            t_tint = (80, 130, 250) if arch == "debuff" else pal[1]

        def tinted(img, tint):
            if tint is None:
                return img
            st = 0.25 if f < CAST else 0.5                # the charge flash is light, hit / status tints stronger
            ov = Image.new("RGBA", img.size, tint + (0,))
            ov.putalpha(img.split()[3].point(lambda v: v * st))
            return Image.alpha_composite(img, ov)

        def put(sprite, pos, off, tint, who="sprite"):
            # pose_of: level B (drawn <slug>-battle.png) when the species has it, else level-A body motion; the x3
            # image is the same sprite at x3 resolution (drawn sharp)
            img_, (fx_, fy_), hi_img, (hfx, hfy), dd = pose_of(who, sprite, f)
            s, hi_img = tinted(img_, tint), tinted(hi_img, tint)
            off = (off[0] + dd[0], off[1] + dd[1])
            sx_, sy_ = pos[0] - fx_ + off[0] + shake[0], pos[1] - fy_ + off[1] + shake[1]
            draws.append((hi_img, (pos[0] * HI - hfx + (off[0] + shake[0]) * HI, pos[1] * HI - hfy + (off[1] + shake[1]) * HI)))
            if log is not None:
                bb = s.getbbox() or (0, 0, s.width, s.height)
                log.append({"step": f, "layer": who, "behind": False, "x": sx_, "y": sy_, "mask": s.split()[3],
                            "box": (sx_ + bb[0], sy_ + bb[1], sx_ + bb[2], sy_ + bb[3])})

        draws = []
        for s, pos in ((spr_e, E_POS), (spr_p, P_POS)):
            is_att = pos == a_pos
            if not is_att and t_hidden:
                continue
            put(s, pos, a_off if is_att else t_off, a_tint if is_att else t_tint, "user" if is_att else "target")
        back, fr = fr, Image.new("RGBA", (W, H), (0, 0, 0, 0))   # from here on: the front layer

        if beam:                                           # code beam: charge orb / beam / burst + flash (beams.py)
            for name, img in beam.draw(f, shake):
                if name == "impact" and miss:
                    continue
                if name == "flash" and miss:
                    continue
                fr.alpha_composite(img)
                if log is not None and name != "flash":
                    bb = img.getbbox()
                    if bb:
                        log.append({"step": f, "layer": name, "behind": False, "x": 0, "y": 0, "mask": img.split()[3],
                                    "box": bb})
        elif f < CAST and place == "ground":                 # the ground part (dust ring at the feet) in front
            at(fr, cast[f % len(cast)], cast_x + cast_dx, cast_y, CS, shake, layer="cast", clip_above=ground_line)
        if beam:                                           # (drawn above)
            pass
        elif f < CAST and not cast_behind:                 # 1st image: on the user
            at(fr, cast[f % len(cast)], cast_x + a_off[0] + cast_dx, cast_y + a_off[1], CS, shake, layer="cast")
        elif f < CAST:
            pass
        elif f < hit0 or self_only:                        # 2nd image: the move on its path
            k = (f - CAST) / max(1, TRAVEL)
            travel = eff[:4] if arch in SPLIT and len(eff) >= 8 else eff
            if enemy_attacks and arch in ("projectile", "beam", "wave", "sound", "powder"):
                travel = [t.transpose(Image.FLIP_LEFT_RIGHT) for t in travel]
            e = travel[(f - CAST) % len(travel)]
            if arch == "projectile" or arch == "sound":
                x, y = lerp(a_src, t_ctr, k)
                at(fr, e, x, y - 12 * math.sin(math.pi * k), E((0.5 + 0.2 * k) * (ua + (ut - ua) * k)), shake)
            elif arch == "beam":
                n = int(math.dist(a_src, t_ctr) / 10)
                last = int(n * min(1.0, k * 1.6))
                fwd_side = "right" if t_ctr[0] >= a_src[0] else "left"     # the head of the beam faces the target
                back_side = "left" if fwd_side == "right" else "right"
                for i in range(last + 1):
                    x, y = lerp(a_src, t_ctr, i / n)
                    seg = travel[(f + i) % len(travel)]
                    if i == last:                          # segments are cut edge to edge so copies join: round the
                        seg = beam_cap(seg, fwd_side)      # head and the tail instead of a straight cut
                    if i == 0:
                        seg = beam_cap(seg, back_side)
                    at(fr, seg, x, y, E(0.32 * (ua + (ut - ua) * i / n)), shake)
            elif arch == "fall":
                fs = E(max(0.45, t_spr.height * 1.3 / EFFECT_CELL))
                fy = t_ctr[1] - 70 + 70 * min(1.0, k * 1.4)
                e, ext = from_sky(e, fy - e.height * fs[1] / 2 + shake[1], fs[1])   # a bolt reaches up to the sky
                at(fr, e, t_ctr[0], fy - ext * fs[1] / 2, fs, shake)
            elif arch == "wave":
                x = a_src[0] + (t_ctr[0] - a_src[0]) * k
                at(fr, e, x, (a_src[1] + t_ctr[1]) / 2 - 6, E(0.8 * (ua + ut) / 2), shake)
            elif arch == "powder":
                for i in range(5):
                    x, y = lerp(a_src, t_ctr, min(1.0, k + i * 0.04))
                    at(fr, travel[(f + i) % len(travel)], x + math.sin(f * 0.4 + i) * 6, y + (i - 2) * 6, E(0.3 * (ua + (ut - ua) * k)), shake)
            elif arch in ("buff", "heal"):
                at(fr, e, a_ctr[0], a_ctr[1], E(0.85 * ua), shake, layer="aura")
            elif arch == "field":
                ov = Image.new("RGBA", (W, H), pal[1] + (int(50 + 30 * math.sin(f / 4)),)); fr.alpha_composite(ov)
                for i in range(6):
                    at(fr, eff[(f + i) % len(eff)], (i * 47 + f * 3) % W, (i * 31 + f * 6) % TEXT_TOP, 0.45)
        elif not miss:                                     # HIT: the effect lands on the target (not on a miss)
            h = f - hit0
            if arch in SPLIT and len(eff) >= 8:
                e = eff[4 + min(3, h // 4)]
            else:
                e = eff[min(len(eff) - 1, h // 2)]
            if arch != "quake":                            # (quake was drawn behind the target)
                at(fr, e, ix, iy, E(hs), shake, layer="impact")
            if h < 3:  # flash in the move's colour
                fr.alpha_composite(Image.new("RGBA", (W, H), pal[3] + (100 - h * 30,)))
        who = (attacker or "?").upper().replace("-", " ")
        text_box(fr, f"{'Foe ' if enemy_attacks else ''}{who} used {move['name'].upper()}!")
        out_ = compose(back, draws, fr)
        frames.append(out_)
        if HIT and f == hit0 and not miss:                # hit-stop: hold the impact a moment
            frames += [out_] * 3
    return frames


def save(frames, out, scale=3, fps=30):
    big = [(f if f.size == (W * scale, H * scale) else f.resize((W * scale, H * scale), Image.NEAREST)).convert("RGB")
           for f in frames]
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    big[0].save(out, save_all=True, append_images=big[1:], duration=int(1000 / fps), loop=0, lossless=True)
    return out
