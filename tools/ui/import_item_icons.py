#!/usr/bin/env python3
"""
Turn the reference engine's 2D item textures into Mons bag icons: assets/ui/Items/<id>.png (24x24, Gen 3 rules) and the
entries of assets/ui/Items/items.json marked "source": "reference".

  python3 -I tools/ui/import_item_icons.py [<reference source>] [--scale epx|nearest|center] [--sheet tmp/report/item-icons.png]

<reference source> = a checkout of the upstream project (THIRD_PARTY_NOTICES.md, "Item icons"); default
$MONS_REFERENCE_SRC. Its item art is MPL-2.0: the converted icons stay under MPL-2.0 (modified: upscaled, re-coloured
to Gen 3). The checkout is only read as data: model JSON with json.load, textures with Pillow; nothing in it is run.

Which items (ids are kebab-case English, no namespace):
  - every hold item of data/battle/held-items.json (berries go to the QUẢ pocket, the rest to VẬT PHẨM);
  - the Gen 3 evolution items (stones, trade items) plus the item evolutions data/pokemon/pokemon-evolutions.json
    lists for Gen 1-3 species;
  - the other Gen 1-3 bag items the reference has art for (EXTRA: medicine, vitamins, Rare Candy, battle X items,
    fossils) and the Gen 3 berries that are not hold items (MORE_BERRIES);
  - never the hand-drawn icons of items.py (ball, potion, berry …): an id that is already drawn is left alone.
Items the reference has no 2D texture for (or only a 3D block model) are skipped and listed.

Conversion (the textures are 16x16 pixel art with their own coloured outline):
  epx (default)  EPX/Scale2x to 32 px (edges stay pixel-art, no new colours), then a colour-majority resample to fit
                 22 px (never bilinear), centred in 24x24 with >= 1 px margin;
  nearest        nearest-neighbour x1.375..1.5 to fit 22 px;
  center         the 16 px art as it is, centred.
A silhouette whose edge is mostly light gets a dark outline (each outline pixel = its neighbour's colour x0.45, the
weight of the items.py outlines). Then the shared Gen 3 pass (gen3.to_gen3): BGR555 colours, alpha 0/255,
<= 15 colours per icon.
"""
import argparse
import collections
import glob
import json
import os
import sys

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
for _d in ("tools/units/.pydeps",):
    _p = os.path.join(REPO, _d)
    if os.path.isdir(_p) and _p not in sys.path:
        sys.path.insert(0, _p)
sys.path.insert(0, os.path.join(REPO, "tools", "gen3"))

from PIL import Image, ImageDraw, ImageFont  # noqa: E402

import gen3  # noqa: E402

OUT = os.path.join(REPO, "assets", "ui", "Items")
S, FIT = 24, 22
MAX_COLOURS = 15

# texture name in the reference when it is not the id with "_" for "-"
ALIAS = {"up-grade": "upgrade"}
EN = {"kings-rock": "King's Rock", "exp-share": "Exp. Share", "up-grade": "Up-Grade", "never-melt-ice": "Never-Melt Ice",
      "deep-sea-tooth": "Deep Sea Tooth", "deep-sea-scale": "Deep Sea Scale", "bright-powder": "Bright Powder",
      "silver-powder": "Silver Powder", "black-glasses": "Black Glasses", "twisted-spoon": "Twisted Spoon"}

# Gen 3 evolution items: Vietnamese name, description (Gen 3 bag text, our wording)
EVO = {
    "fire-stone": ("Đá Lửa", "Viên đá đỏ rực như lửa. Dùng cho một số loài Pokémon để chúng tiến hoá."),
    "water-stone": ("Đá Nước", "Viên đá xanh trong như nước. Dùng cho một số loài Pokémon để chúng tiến hoá."),
    "thunder-stone": ("Đá Sấm", "Viên đá có vân tia sét. Dùng cho một số loài Pokémon để chúng tiến hoá."),
    "leaf-stone": ("Đá Lá", "Viên đá có vân hình lá. Dùng cho một số loài Pokémon để chúng tiến hoá."),
    "moon-stone": ("Đá Mặt Trăng", "Viên đá đen sẫm như bầu trời đêm. Dùng cho một số loài Pokémon để chúng tiến hoá."),
    "sun-stone": ("Đá Mặt Trời", "Viên đá đỏ cam như mặt trời. Dùng cho một số loài Pokémon để chúng tiến hoá."),
    "kings-rock": ("Đá Vua", None), "metal-coat": ("Áo Kim Loại", None), "dragon-scale": ("Vảy Rồng", None),
    "up-grade": ("Bản Nâng Cấp", None), "deep-sea-tooth": ("Răng Biển Sâu", None), "deep-sea-scale": ("Vảy Biển Sâu", None),
}
STAT_VI = {"atk": "Tấn Công", "def": "Phòng Thủ", "spa": "Đặc Công", "spd": "Đặc Thủ", "spe": "Tốc Độ"}
TYPE_VI = {"normal": "THƯỜNG", "fire": "LỬA", "water": "NƯỚC", "electric": "ĐIỆN", "grass": "CỎ", "ice": "BĂNG",
           "fighting": "GIÁC ĐẤU", "poison": "ĐỘC", "ground": "ĐẤT", "flying": "BAY", "psychic": "SIÊU LINH", "bug": "BỌ",
           "rock": "ĐÁ", "ghost": "MA", "dragon": "RỒNG", "dark": "BÓNG TỐI", "steel": "THÉP"}
CURE_VI = {"CURE_PAR": "tê liệt", "CURE_SLP": "ngủ", "CURE_PSN": "trúng độc", "CURE_BRN": "bỏng", "CURE_FRZ": "đóng băng",
           "CURE_CONFUSION": "bối rối", "CURE_ATTRACT": "say mê"}
TRADE = {"kings-rock": "Poliwhirl và Slowpoke", "metal-coat": "Onix và Scyther", "dragon-scale": "Seadra",
         "up-grade": "Porygon", "deep-sea-tooth": "Clamperl", "deep-sea-scale": "Clamperl"}


# Gen 1-3 bag items besides hold items and evolution items: id -> (Vietnamese name, pocket, kind, description)
EXTRA = {
    # medicine (Thuốc Hồi, Thuốc Mạnh, Giải Độc, Hồi Sinh are hand-drawn and stay)
    "hyper-potion": ("Thuốc Cực Mạnh", "THUỐC", "medicine", "Hồi 200 HP cho một Pokémon."),
    "max-potion": ("Thuốc Tối Đa", "THUỐC", "medicine", "Hồi toàn bộ HP cho một Pokémon."),
    "full-restore": ("Hồi Phục Toàn Diện", "THUỐC", "medicine", "Hồi toàn bộ HP và chữa mọi trạng thái xấu cho một Pokémon."),
    "max-revive": ("Hồi Sinh Tối Đa", "THUỐC", "medicine", "Hồi sinh một Pokémon đã gục với toàn bộ HP."),
    "burn-heal": ("Trị Bỏng", "THUỐC", "medicine", "Chữa bỏng cho một Pokémon."),
    "ice-heal": ("Trị Băng", "THUỐC", "medicine", "Làm tan băng cho một Pokémon bị đóng băng."),
    "awakening": ("Thuốc Tỉnh Ngủ", "THUỐC", "medicine", "Đánh thức một Pokémon đang ngủ."),
    "paralyze-heal": ("Trị Tê Liệt", "THUỐC", "medicine", "Chữa tê liệt cho một Pokémon."),
    "full-heal": ("Trị Toàn Bộ", "THUỐC", "medicine", "Chữa mọi trạng thái xấu cho một Pokémon."),
    "ether": ("Nước PP", "THUỐC", "medicine", "Hồi 10 PP cho một chiêu của Pokémon."),
    "max-ether": ("Nước PP Tối Đa", "THUỐC", "medicine", "Hồi toàn bộ PP cho một chiêu của Pokémon."),
    "elixir": ("Tiên Dược", "THUỐC", "medicine", "Hồi 10 PP cho mọi chiêu của một Pokémon."),
    "max-elixir": ("Tiên Dược Tối Đa", "THUỐC", "medicine", "Hồi toàn bộ PP cho mọi chiêu của một Pokémon."),
    "energy-root": ("Rễ Năng Lượng", "THUỐC", "medicine", "Rễ cây rất đắng. Hồi 200 HP nhưng Pokémon sẽ kém thân thiết hơn."),
    "heal-powder": ("Bột Chữa Lành", "THUỐC", "medicine", "Bột rất đắng. Chữa mọi trạng thái xấu nhưng Pokémon sẽ kém thân thiết hơn."),
    "revival-herb": ("Cỏ Hồi Sinh", "THUỐC", "medicine", "Cỏ rất đắng. Hồi sinh một Pokémon đã gục với toàn bộ HP."),
    "moomoo-milk": ("Sữa Moomoo", "THUỐC", "medicine", "Sữa rất bổ. Hồi 100 HP cho một Pokémon."),
    "lava-cookie": ("Bánh Dung Nham", "THUỐC", "medicine", "Đặc sản vùng núi lửa. Chữa mọi trạng thái xấu cho một Pokémon."),
    "rage-candy-bar": ("Kẹo Cuồng Nộ", "THUỐC", "medicine", "Kẹo nổi tiếng. Hồi 20 HP cho một Pokémon."),
    "hp-up": ("Tăng HP", "THUỐC", "medicine", "Tăng điểm nỗ lực HP của một Pokémon."),
    "protein": ("Đạm Tăng Lực", "THUỐC", "medicine", "Tăng điểm nỗ lực Tấn Công của một Pokémon."),
    "iron": ("Sắt Bền", "THUỐC", "medicine", "Tăng điểm nỗ lực Phòng Thủ của một Pokémon."),
    "calcium": ("Canxi", "THUỐC", "medicine", "Tăng điểm nỗ lực Đặc Công của một Pokémon."),
    "zinc": ("Kẽm", "THUỐC", "medicine", "Tăng điểm nỗ lực Đặc Thủ của một Pokémon."),
    "carbos": ("Tăng Tốc", "THUỐC", "medicine", "Tăng điểm nỗ lực Tốc Độ của một Pokémon."),
    "pp-up": ("Tăng PP", "THUỐC", "medicine", "Tăng PP tối đa của một chiêu."),
    "pp-max": ("PP Tối Đa", "THUỐC", "medicine", "Tăng PP tối đa của một chiêu lên mức cao nhất."),
    "rare-candy": ("Kẹo Hiếm", "THUỐC", "medicine", "Kẹo chứa đầy năng lượng. Tăng 1 cấp cho một Pokémon."),
    # battle items (used in battle on the Pokémon out)
    "x-attack": ("Tăng Công X", "VẬT PHẨM", "battle", "Tăng Tấn Công của Pokémon đang chiến đấu. Chỉ dùng trong trận."),
    "x-defense": ("Tăng Thủ X", "VẬT PHẨM", "battle", "Tăng Phòng Thủ của Pokémon đang chiến đấu. Chỉ dùng trong trận."),
    "x-sp-atk": ("Tăng Đặc Công X", "VẬT PHẨM", "battle", "Tăng Đặc Công của Pokémon đang chiến đấu. Chỉ dùng trong trận."),
    "x-speed": ("Tăng Tốc X", "VẬT PHẨM", "battle", "Tăng Tốc Độ của Pokémon đang chiến đấu. Chỉ dùng trong trận."),
    "x-accuracy": ("Tăng Chính Xác X", "VẬT PHẨM", "battle", "Tăng độ chính xác của Pokémon đang chiến đấu. Chỉ dùng trong trận."),
    "dire-hit": ("Đòn Hiểm", "VẬT PHẨM", "battle", "Pokémon đang chiến đấu dễ ra đòn chí mạng hơn. Chỉ dùng trong trận."),
    "guard-spec": ("Khiên Bảo Vệ", "VẬT PHẨM", "battle", "Đội của bạn không bị giảm chỉ số trong 5 lượt. Chỉ dùng trong trận."),
    # fossils (Gen 1 and Gen 3)
    "helix-fossil": ("Hoá Thạch Xoắn", "VẬT PHẨM", "fossil", "Hoá thạch của một Pokémon cổ đại sống dưới biển, hình vỏ ốc xoắn."),
    "dome-fossil": ("Hoá Thạch Vòm", "VẬT PHẨM", "fossil", "Hoá thạch của một Pokémon cổ đại sống dưới biển, hình mai vòm."),
    "old-amber": ("Hổ Phách Cổ", "VẬT PHẨM", "fossil", "Một mảnh hổ phách cổ còn giữ gen của một Pokémon thời tiền sử."),
    "root-fossil": ("Hoá Thạch Rễ", "VẬT PHẨM", "fossil", "Hoá thạch của một Pokémon cổ đại sống dưới biển, hình rễ cây."),
    "claw-fossil": ("Hoá Thạch Vuốt", "VẬT PHẨM", "fossil", "Hoá thạch của một Pokémon cổ đại sống dưới biển, hình móng vuốt."),
}
ALIAS.update({"old-amber": "old_amber_fossil"})
EN.update({"x-sp-atk": "X Sp. Atk", "guard-spec": "Guard Spec.", "pp-up": "PP Up", "pp-max": "PP Max", "hp-up": "HP Up",
           "moomoo-milk": "Moomoo Milk"})
# the Gen 3 berries that are not hold items (Pokéblock berries, #16-35 and Enigma #43)
MORE_BERRIES = {"razz-berry": "Quả Mâm Xôi", "bluk-berry": "Quả Việt Quất", "nanab-berry": "Quả Chuối", "wepear-berry": "Quả Lê Tây",
                "pinap-berry": "Quả Dứa", "pomeg-berry": "Quả Lựu", "kelpsy-berry": "Quả Tảo", "qualot-berry": "Quả Mận",
                "hondew-berry": "Quả Dưa Sương", "grepa-berry": "Quả Nho", "tamato-berry": "Quả Cà Chua", "cornn-berry": "Quả Ngô",
                "magost-berry": "Quả Măng Cụt", "rabuta-berry": "Quả Chôm Chôm", "nomel-berry": "Quả Chanh", "spelon-berry": "Quả Ớt",
                "pamtre-berry": "Quả Cọ", "watmel-berry": "Quả Dưa Hấu", "durin-berry": "Quả Sầu Riêng", "belue-berry": "Quả Mọng Tím",
                "enigma-berry": "Quả Bí Ẩn"}


def describe(iid, it):
    """Short Vietnamese bag text from the Gen 3 hold effect (held-items.json)."""
    e, p = it.get("holdEffect", ""), it.get("param", 0)
    hooks = it.get("hooks") or {}
    if e == "RESTORE_HP":
        d = f"Cho Pokémon cầm. Tự hồi {p} HP khi HP còn một nửa trở xuống."
    elif e in CURE_VI:
        d = f"Cho Pokémon cầm. Tự chữa {CURE_VI[e]}, dùng một lần."
    elif e == "CURE_STATUS":
        d = "Cho Pokémon cầm. Tự chữa mọi trạng thái xấu và bối rối, dùng một lần."
    elif e == "RESTORE_PP":
        d = f"Cho Pokémon cầm. Hồi {p} PP cho một chiêu đã hết PP."
    elif e.startswith("CONFUSE_"):
        d = "Cho Pokémon cầm. Hồi 1/8 HP khi HP còn một nửa; Pokémon ghét vị này sẽ bị bối rối."
    elif e in ("ATTACK_UP", "DEFENSE_UP", "SPEED_UP", "SP_ATTACK_UP", "SP_DEFENSE_UP"):
        st = next(iter(hooks.get("end-of-turn", {}).get("boost", {"atk": 1})))
        d = f"Cho Pokémon cầm. Tăng {STAT_VI[st]} khi HP còn 1/4 trở xuống."
    elif e == "CRITICAL_UP":
        d = "Cho Pokémon cầm. Dễ ra đòn chí mạng hơn khi HP còn 1/4 trở xuống."
    elif e == "RANDOM_STAT_UP":
        d = "Cho Pokémon cầm. Tăng mạnh một chỉ số ngẫu nhiên khi HP còn 1/4 trở xuống."
    elif e == "EVASION_UP":
        d = "Cho Pokémon cầm. Đòn của đối thủ dễ trượt hơn."
    elif e == "RESTORE_STATS":
        d = "Cho Pokémon cầm. Hồi các chỉ số bị giảm, dùng một lần."
    elif e == "EXP_SHARE":
        d = "Pokémon cầm nó được chia điểm kinh nghiệm dù không ra trận."
    elif e == "QUICK_CLAW":
        d = "Cho Pokémon cầm. Đôi khi giúp nó ra đòn trước."
    elif e == "FRIENDSHIP_UP":
        d = "Pokémon cầm nó thân thiết với bạn nhanh hơn."
    elif e == "CHOICE_BAND":
        d = "Cho Pokémon cầm. Tăng Tấn Công nhưng chỉ dùng được một chiêu."
    elif e == "FLINCH":
        d = "Cho Pokémon cầm. Đòn đánh có thể làm đối thủ chùn bước."
    elif e.endswith("_POWER"):
        t = hooks.get("modify-attack", {}).get("type", "normal")
        d = f"Cho Pokémon cầm. Tăng sức mạnh chiêu hệ {TYPE_VI.get(t, t.upper())}."
    elif e == "DOUBLE_PRIZE":
        d = "Nhận gấp đôi tiền thưởng nếu Pokémon cầm nó ra trận."
    elif e == "REPEL":
        d = "Pokémon đầu đội cầm nó thì ít gặp Pokémon hoang dã hơn."
    elif e in ("DEEP_SEA_TOOTH", "DEEP_SEA_SCALE"):
        d = f"Tăng {'Đặc Công' if e == 'DEEP_SEA_TOOTH' else 'Đặc Thủ'} của Clamperl khi nó cầm."
    elif e == "CAN_ALWAYS_RUN":
        d = "Pokémon cầm nó luôn chạy thoát khỏi Pokémon hoang dã."
    elif e == "PREVENT_EVOLVE":
        d = "Pokémon cầm nó sẽ không tiến hoá."
    elif e == "FOCUS_BAND":
        d = "Cho Pokémon cầm. Đôi khi giúp nó trụ lại với 1 HP."
    elif e == "LUCKY_EGG":
        d = "Pokémon cầm nó nhận thêm điểm kinh nghiệm."
    elif e == "SCOPE_LENS":
        d = "Cho Pokémon cầm. Tăng tỉ lệ đòn chí mạng."
    elif e == "LEFTOVERS":
        d = "Cho Pokémon cầm. Hồi một ít HP sau mỗi lượt."
    elif e == "LIGHT_BALL":
        d = "Tăng Đặc Công của Pikachu khi nó cầm."
    elif e == "METAL_POWDER":
        d = "Tăng Phòng Thủ của Ditto khi nó cầm."
    elif e == "SHELL_BELL":
        d = "Cho Pokémon cầm. Hồi HP bằng 1/8 sát thương gây ra."
    elif e in ("DRAGON_SCALE", "UP_GRADE"):
        d = "Một vật phẩm quý hiếm."
    else:
        d = "Vật phẩm cho Pokémon cầm."
    if iid in TRADE:
        d += f" {TRADE[iid]} tiến hoá khi được trao đổi lúc cầm nó."
    return d


def catalogue():
    """[(id, vi, en, pocket, kind, desc)] the game needs, in group order: evolution, held, berry, then EXTRA."""
    held = json.load(open(os.path.join(REPO, "data", "battle", "held-items.json"), encoding="utf-8"))["items"]
    evo_ids = list(EVO)
    path = os.path.join(REPO, "data", "units", "pokemon-evolutions.json")
    if os.path.exists(path):
        for sp in json.load(open(path, encoding="utf-8"))["species"].values():
            rules = list(sp.get("gen3") or [])
            if str(sp.get("gen", "9")) in ("1", "2", "3"):
                rules += sp.get("mons") or []
            for r in rules:
                for iid in [r.get("item")] + [q.get("item") for q in r.get("requires", []) if q.get("k") == "held_item"]:
                    if iid and iid not in evo_ids:
                        evo_ids.append(iid)
    out = []
    for iid in evo_ids:
        h = held.get(iid, {})
        vi, desc = EVO.get(iid, (h.get("vi") or iid, None))
        out.append((iid, vi, EN.get(iid), "VẬT PHẨM", "evolution", desc or (describe(iid, h) if h else
                                                                          "Dùng cho một số loài Pokémon để chúng tiến hoá.")))
    for iid, h in held.items():
        if iid in evo_ids:
            continue
        berry = h.get("berry") or iid.endswith("-berry")
        out.append((iid, h.get("vi") or iid, EN.get(iid), "QUẢ" if berry else "VẬT PHẨM", "berry" if berry else "held",
                    describe(iid, h)))
    for iid, (vi, pocket, kind, desc) in EXTRA.items():
        out.append((iid, vi, EN.get(iid), pocket, kind, desc))
    for iid, vi in MORE_BERRIES.items():
        if iid not in held:
            out.append((iid, vi, EN.get(iid), "QUẢ", "berry", "Quả mọng hiếm, dùng để trồng và làm bánh kẹo cho Pokémon."))
    return [(i, vi, en or " ".join(w.capitalize() for w in i.split("-")), p, k, d) for i, vi, en, p, k, d in out]


# ---------------------------------------------------------------- reference files (read as data only)
def item_root(src):
    """<checkout>/…/assets/<namespace>/ that holds models/item and textures/item/held_items."""
    for d in sorted(glob.glob(os.path.join(src, "**", "assets", "*"), recursive=True)):
        if os.path.isdir(os.path.join(d, "models", "item")) and os.path.isdir(os.path.join(d, "textures", "item", "held_items")):
            return d
    raise SystemExit("no item models / textures under the reference checkout")


def texture_path(root, ref):
    """'<ns>:item/a/b' -> <root>/textures/item/a/b.png (the namespace prefix is dropped)."""
    ref = ref.split(":", 1)[-1]
    return os.path.join(root, "textures", ref + ".png")


def load_texture(root, iid):
    """(RGBA 16x16 image, texture path relative to textures/) or (None, reason)."""
    name = ALIAS.get(iid, iid.replace("-", "_"))
    mpath = os.path.join(root, "models", "item", name + ".json")
    layers = []
    if os.path.exists(mpath):
        with open(mpath, encoding="utf-8") as f:
            model = json.load(f)
        parent = str(model.get("parent", "")).split(":", 1)[-1]
        tex = model.get("textures") or {}
        if parent not in ("item/generated", "item/handheld"):
            return None, f"3D model only (parent {parent or 'none'})"
        layers = [texture_path(root, tex[k]) for k in sorted(tex) if k.startswith("layer")]
    if not layers:
        hits = sorted(glob.glob(os.path.join(root, "textures", "item", "**", name + ".png"), recursive=True))
        if not hits:
            return None, "no texture in the reference"
        layers = hits[:1]
    img = None
    for p in layers:
        if not os.path.isfile(p):
            return None, "model names a missing texture"
        im = Image.open(p).convert("RGBA")
        if im.height > im.width:                      # animated strip: first frame
            im = im.crop((0, 0, im.width, im.width))
        img = im if img is None else Image.alpha_composite(img, im.resize(img.size, Image.NEAREST))
    return img, os.path.relpath(layers[0], os.path.join(root, "textures"))


# ---------------------------------------------------------------- conversion
def binary_alpha(im):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            px[x, y] = p[:3] + (255,) if p[3] >= 128 else (0, 0, 0, 0)
    return im


def epx(im):
    """EPX / Scale2x: x2 that rounds staircase edges and adds no colour."""
    w, h = im.size
    s = im.load()
    out = Image.new("RGBA", (w * 2, h * 2))
    d = out.load()
    g = lambda x, y: s[x, y] if 0 <= x < w and 0 <= y < h else (0, 0, 0, 0)
    for y in range(h):
        for x in range(w):
            P, A, B, C, D = s[x, y], g(x, y - 1), g(x + 1, y), g(x - 1, y), g(x, y + 1)
            e = [P, P, P, P]
            if C == A and C != D and A != B:
                e[0] = A
            if A == B and A != C and B != D:
                e[1] = B
            if D == C and D != B and C != A:
                e[2] = C
            if B == D and B != A and D != C:
                e[3] = D
            d[2 * x, 2 * y], d[2 * x + 1, 2 * y], d[2 * x, 2 * y + 1], d[2 * x + 1, 2 * y + 1] = e
    return out


def majority(im, nw, nh):
    """Each output pixel takes the colour (or transparency) covering most of its source area."""
    w, h = im.size
    s = im.load()
    out = Image.new("RGBA", (nw, nh), (0, 0, 0, 0))
    d = out.load()
    for y in range(nh):
        y0, y1 = y * h / nh, (y + 1) * h / nh
        for x in range(nw):
            x0, x1 = x * w / nw, (x + 1) * w / nw
            c = collections.Counter()
            for sy in range(int(y0), min(h, int(-(-y1 // 1)))):
                for sx in range(int(x0), min(w, int(-(-x1 // 1)))):
                    a = (min(x1, sx + 1) - max(x0, sx)) * (min(y1, sy + 1) - max(y0, sy))
                    if a > 0:
                        c[s[sx, sy] if s[sx, sy][3] else (0, 0, 0, 0)] += a
            d[x, y] = c.most_common(1)[0][0]
    return out


def luma(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def edge(im):
    px = im.load()
    w, h = im.size
    return [(x, y) for y in range(h) for x in range(w) if px[x, y][3] and any(
        not (0 <= x + dx < w and 0 <= y + dy < h) or not px[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]


def needs_outline(im):
    px = im.load()
    e = edge(im)
    return bool(e) and sum(luma(px[p]) > 110 for p in e) > len(e) * 0.4


def add_outline(im):
    """1 px outside outline, each pixel = the darkest touching colour x0.45 (items.py weight)."""
    w, h = im.size
    out = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
    out.alpha_composite(im, (1, 1))
    src = out.copy().load()
    d = out.load()
    for y in range(h + 2):
        for x in range(w + 2):
            if src[x, y][3]:
                continue
            nb = [src[x + dx, y + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                  if 0 <= x + dx < w + 2 and 0 <= y + dy < h + 2 and src[x + dx, y + dy][3]]
            if nb:
                c = min(nb, key=luma)
                d[x, y] = tuple(int(v * 0.45) for v in c[:3]) + (255,)
    return out


def convert(tex, scale="epx"):
    im = binary_alpha(tex.copy())
    im = im.crop(im.getbbox())
    outline = needs_outline(im)
    fit = FIT - 2 if outline else FIT
    w, h = im.size
    if scale == "center":
        r = im
    elif scale == "nearest":
        k = min(1.5, fit / max(w, h))
        r = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.NEAREST)
    else:
        e = epx(im)
        k = min(0.75, fit / max(e.size))
        r = majority(e, max(1, round(e.width * k)), max(1, round(e.height * k)))
    if outline:
        r = add_outline(r)
    r = r.crop(r.getbbox())
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.alpha_composite(r, ((S - r.width) // 2, (S - r.height) // 2))
    out = gen3.to_gen3(out, max_colours=MAX_COLOURS)
    return out, outline


# ---------------------------------------------------------------- output
def write_items_json(entries):
    path = os.path.join(OUT, "items.json")
    data = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {"size": [S, S], "items": {}}
    items = {k: (v if isinstance(v, dict) else {"name": v, "source": "drawn"}) for k, v in data.get("items", {}).items()}
    items = {k: v for k, v in items.items() if v.get("source") != "reference"}       # re-import from scratch
    for iid, e in entries.items():
        items[iid] = e
    data = {"size": [S, S], "items": items}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")


def write_licence(entries):
    """assets/ui/Items/LICENSE.md: the MPL-2.0 notice and the source texture of every imported icon."""
    lines = ["# Item icons: MPL-2.0 notice", "",
             "Written by `tools/ui/import_item_icons.py`. The icons listed below were converted from the reference",
             "engine's 16x16 item textures (upscaled to 24x24, outline added where the edge was light, re-coloured to Gen 3:",
             "BGR555, alpha 0/255, <= 15 colours). That art is licensed under the Mozilla Public License 2.0: licence text",
             "[`LICENSES/MPL-2.0.txt`](../../../LICENSES/MPL-2.0.txt), project, commit and copyright notice in",
             "[`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md). The other icons in this folder (`\"source\": \"drawn\"`",
             "in `items.json`, drawn by `tools/ui/items.py`) are Mons's own.", "",
             "| File | Upstream texture |", "|---|---|"]
    lines += [f"| `{iid}.png` | `{e['texture']}` |" for iid, e in entries.items()]
    with open(os.path.join(OUT, "LICENSE.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def contact_sheet(rows, path, zoom=4):
    """All icons x4 on a neutral background, labelled with their ids, one block per group."""
    cell_w, cell_h, cols = S * zoom + 40, S * zoom + 22, 8
    font = ImageFont.load_default()
    blocks = []
    for kind, title in (("evolution", "EVOLUTION"), ("held", "HELD"), ("berry", "BERRY"), ("medicine", "MEDICINE"),
                        ("battle", "BATTLE"), ("fossil", "FOSSIL")):
        ids = [r for r in rows if r[1] == kind]
        if ids:
            blocks.append((f"{title} ({len(ids)})", ids))
    height = sum(18 + ((len(ids) + cols - 1) // cols) * cell_h for _, ids in blocks) + 8
    sheet = Image.new("RGBA", (cols * cell_w + 8, height), (176, 180, 172, 255))
    d = ImageDraw.Draw(sheet)
    y = 4
    for title, ids in blocks:
        d.text((6, y + 2), title, fill=(28, 30, 58), font=font)
        y += 18
        for i, (iid, _, img) in enumerate(ids):
            x, yy = 4 + (i % cols) * cell_w, y + (i // cols) * cell_h
            d.rectangle([x + 19, yy, x + 20 + S * zoom, yy + S * zoom + 1], fill=(200, 204, 196, 255))
            sheet.alpha_composite(img.resize((S * zoom, S * zoom), Image.NEAREST), (x + 20, yy + 1))
            tw = d.textlength(iid, font=font)
            d.text((x + 20 + (S * zoom - tw) / 2, yy + S * zoom + 4), iid, fill=(28, 30, 58), font=font)
        y += ((len(ids) + cols - 1) // cols) * cell_h
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.save(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("src", nargs="?", default=os.environ.get("MONS_REFERENCE_SRC"),
                    help="checkout of the upstream project (default: $MONS_REFERENCE_SRC)")
    ap.add_argument("--scale", choices=("epx", "nearest", "center"), default="epx")
    ap.add_argument("--sheet", default=os.path.join(REPO, "tmp", "report", "item-icons.png"))
    a = ap.parse_args()
    if not a.src or not os.path.isdir(a.src):
        ap.error("give the upstream checkout or set MONS_REFERENCE_SRC")
    root = item_root(a.src)
    old = json.load(open(os.path.join(OUT, "items.json"), encoding="utf-8")).get("items", {})
    drawn = {k for k, v in old.items() if not (isinstance(v, dict) and v.get("source") == "reference")}
    entries, rows, skipped, outlined = {}, [], [], []
    for iid, vi, en, pocket, kind, desc in catalogue():
        if iid in drawn:
            skipped.append((iid, "hand-drawn icon kept"))
            continue
        tex, where = load_texture(root, iid)
        if tex is None:
            skipped.append((iid, where))
            continue
        img, outline = convert(tex, a.scale)
        if outline:
            outlined.append(iid)
        img.save(os.path.join(OUT, iid + ".png"))
        entries[iid] = {"name": vi, "en": en, "pocket": pocket, "kind": kind, "desc": desc, "source": "reference",
                        "texture": where.replace(os.sep, "/")}
        rows.append((iid, kind, img))
    write_items_json(entries)
    write_licence(entries)
    contact_sheet(rows, a.sheet)
    by = collections.Counter(k for _, k, _ in rows)
    print(f"assets/ui/Items: {len(rows)} icons from the reference ({', '.join(f'{k} {n}' for k, n in by.items())}); "
          f"outline added: {', '.join(outlined) or 'none'}")
    for iid, why in skipped:
        print(f"  skipped {iid}: {why}")
    print("contact sheet:", os.path.relpath(a.sheet, REPO))


if __name__ == "__main__":
    main()
