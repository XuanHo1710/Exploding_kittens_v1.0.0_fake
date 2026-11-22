r"""Viết bộ prompt vẽ tay (ImageGen / agy) cho từng unit, theo chuẩn của art-source/motion.

Mỗi unit có một file prompts/units/<category>/<unit_id>.md gồm: ảnh đính kèm theo thứ tự (FIRST = bản vẽ tay
chuẩn phong cách trong art-source/motion, SECOND = sheet hiện tại làm khung tư thế và bố cục, THIRD = góc nhìn
prompts/battle/orientation-*.png), prompt đầy đủ cho sheet battle và movement, mô tả thiết kế lấy từ
tools/expedition/roster.py, đường dẫn lưu bản vẽ (art-source/units/...-source.png) và lệnh xuất 1-1.
Thiết kế là nhân vật nguyên bản của Astral Expedition; prompt cấm sao chép nhân vật, trang phục hay
logo của game có sẵn.

  py tools/expedition/write_unit_prompts.py
  py tools/expedition/write_unit_prompts.py --only vulcan_titan,gale_wolf
"""

from __future__ import annotations

import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
for _p in (os.path.join(HERE, "..", "units", ".pydeps"), HERE):
    _p = os.path.abspath(_p)
    if os.path.isdir(_p) and _p not in sys.path:
        sys.path.insert(0, _p)

from roster import ALL_UNITS, UNITS_BY_ID  # noqa: E402

OUT = os.path.join(REPO, "prompts", "units")

NAMED = {
    "near-black": (30, 28, 36), "charcoal": (64, 60, 66), "slate grey": (110, 116, 130), "steel grey": (160, 170, 190),
    "silver": (210, 214, 224), "white": (242, 242, 246), "ivory": (238, 230, 206), "cream": (236, 214, 170),
    "sand": (210, 180, 120), "tan": (190, 150, 100), "brown": (130, 90, 60), "dark brown": (80, 56, 44),
    "rust": (180, 90, 50), "crimson": (180, 50, 50), "red": (220, 70, 60), "orange": (240, 130, 50),
    "amber": (236, 170, 70), "gold": (232, 196, 90), "yellow": (240, 220, 110), "olive": (110, 120, 70),
    "moss green": (90, 140, 80), "forest green": (50, 90, 60), "emerald": (60, 180, 110), "teal": (40, 130, 150),
    "aqua": (110, 220, 228), "sky blue": (130, 200, 245), "ice blue": (190, 226, 248), "blue": (60, 110, 180),
    "navy": (34, 56, 110), "violet": (140, 80, 210), "purple": (90, 50, 130), "lavender": (200, 180, 240),
    "pink": (240, 170, 210), "coral": (236, 140, 130), "plum": (110, 40, 80),
}


def cname(rgb):
    rgb = (rgb[0] - 4, rgb[1] - 1, rgb[2] + 3)  # undo the art_tone warm shift before naming
    return min(NAMED, key=lambda k: sum((a - b) ** 2 for a, b in zip(NAMED[k], rgb)))


def mcol(mats, key):
    m = mats.get(key)
    return cname(m.ramp[1]) if m is not None else None


WEAPON = {
    "rapier": "a slender rapier with a swept guard", "pistol": "a small arcane flintlock", "brush": "a staff-length painter's brush with a glowing bristle tip",
    "hammer": "a one-handed forge hammer", "tower_shield": "a tall tower shield with a glowing core", "bow": "a longbow of pale crystal",
    "khopesh": "a curved khopesh blade", "staff": "a tall staff topped by a glowing orb", "lyre": "a small coral lyre", "scythe": "a long crescent scythe",
    "lance": "a heavy lance with a leaf-shaped head", "whip": "a coiling water whip", "greatsword": "a broad two-handed greatsword", "icesword": "a long blade of clear ice",
    "shield": "a round kite shield", "astro_staff": "a star-headed staff", "astrolabe": "a floating gold astrolabe", "glaive": "a glaive", "spear": "a spear",
    "trident": "a trident", "greataxe": "a great executioner's axe", "sword": "a longsword", "crook": "a hooked judge's crook", "tome": "a heavy tome",
    "maul": "a huge two-handed maul", "dagger": "a short dagger", "cutlass": "a notched cutlass", "orb": "a hovering orb of light", "claw": "metal claws",
}
BUILD = {"male": "adult man, realistic heroic proportions (about 8 heads tall)", "female": "adult woman, realistic heroic proportions (about 8 heads tall)",
         "lean": "lean, agile adult, realistic proportions", "heavy": "broad, heavily built adult", "giant": "towering giant, massive frame, small head relative to the body",
         "golem": "massive golem built of carved material, long heavy arms, small head sunk between the shoulders"}
OUTFIT = {"coat": "long travelling coat with split tails", "robe": "floor-length robe", "skirt": "short battle skirt over leggings",
          "tabard": "armoured tabard reaching the knees", "loin": "wrapped loincloth", "none": "fitted bodywear"}
HELM = {"helm": "a rounded steel helm", "great_helm": "a closed great helm with a visor slit", "horned": "a horned helm", "winged": "a winged circlet helm",
        "hood": "a deep hood", "crown": "a crown"}

STYLE_REF = {
    "heroes": ("art-source/motion/gustave-battle.png", "art-source/motion/gustave-movement-source.png"),
    "bosses": ("art-source/motion/seraphina-battle.png", None),
    "beast": ("art-source/motion/gale-wolf-battle.png", "art-source/motion/gale-wolf-leap.png"),
    "humanoid_enemy": ("art-source/motion/seraphina-battle.png", "art-source/motion/gustave-movement-source.png"),
    # Gatekeepers are mini-bosses: same rendering bar as the hand-drawn boss sheets.
    "gatekeeper_humanoid": ("art-source/motion/redraw/vulcan_titan-battle.png", "art-source/motion/redraw/boreal_chevalier-battle.png"),
    "gatekeeper_golem": ("art-source/motion/redraw/sylvan_warden-battle.png", "art-source/motion/redraw/vulcan_titan-battle.png"),
    "gatekeeper_beast": ("art-source/motion/redraw/leviathan_sovereign-battle.png", "art-source/motion/gale-wolf-battle.png"),
}

ELITE = (
    "Gatekeeper mini-boss presence: imposing, menacing silhouette that fills the cell, dense surface detail (engraved armour, scales, fur, cracks, runes), "
    "small saturated elemental accents (glowing eyes, seams or runes) against a darker body, strong readable pose with weight and momentum, "
    "the same detail level and finish as the attached boss sprite sheets."
)

COMMON = (
    "High-density hand-painted 16-bit fantasy pixel art sprite sheet, the same rendering as the FIRST attached image: "
    "realistic adult proportions (never chibi, never an enlarged head), rich cloth folds and fur strands built from small pixel clusters, "
    "4-6 hue-shifted tones per material, warm muted palette, top-left light, crisp 1-pixel dark outline (#1b1726), strict square pixels, "
    "no blur, no anti-aliasing, no soft glow, no text, no grid lines, no ground platform. "
    "Background: flat solid pure magenta #FF00FF everywhere (use #00FF00 only if the character itself is magenta or purple). "
    "Original character of the Astral Expedition world: do not copy any character, costume, emblem or logo from an existing game."
)

ROWS = {
    "heroes": ["IDLE_BREATHE: 6-frame seamless combat breathing, cape and hair moving", "ATTACK_STRIKE: stance, deep wind-up, lunge, full-reach strike (impact), follow-through, return",
               "SKILL_CAST: stance, gather elemental energy, raise the weapon, unleash the burst, recoil, stance", "PARRY_COUNTER: guard brace, crisp deflection, spin-step, explosive riposte, recovery, stance",
               "DODGE: stance, crouch, clear lateral dash (~25% of the cell), dash end, landing, stance", "HURT_FAINT: frames 1-3 flinch and knockback, frames 4-6 knees buckle and fall inside the cell"],
    "bosses": ["IDLE_BREATHE", "COMBO_ATTACK: three-beat combo", "HEAVY_SWEEP: huge wind-up then a wide sweep", "PHASE_AWAKEN: rising power, aura and roar",
               "STAGGER_BREAK: armour cracks, dazed sway", "DEFEAT: kneel, collapse, lie still inside the cell"],
    "elite": ["IDLE_BREATHE: 6-frame menacing breathing loop, body rising and settling, glowing details pulsing",
              "ATTACK_COMBO: heavy anticipation wind-up, explosive strike toward the bottom-left with a short elemental arc, follow-through, second wind-up, finishing blow, recover",
              "HURT_STAGGER: violent flinch, knocked back, armour or scales chipping, stagger, regain an angry footing",
              "FAINT: buckle, collapse heavily, glow fading, lie still inside the cell"],
    "enemy": ["IDLE_BREATHE: 6-frame breathing loop", "ATTACK_COMBO: wind-up, strike, follow-through, second wind-up, second strike, recover",
              "HURT_STAGGER: flinch, knockback, stagger, regain footing", "FAINT: buckle, fall, lie still inside the cell"],
}


def describe(u):
    s = u["spec"]
    rig = u["rig"]
    el = u["element"]
    if rig == "rider":
        r, mnt = s["rider"], s["mount"]
        return (f"A desert lancer: {describe({'spec': r, 'rig': 'humanoid', 'element': el, 'id': u['id']})} "
                f"riding a long-legged {mcol(mnt['mats'], 'body')} horse-like mount with a {mcol(mnt['mats'], 'mane')} mane.")
    if rig == "arachne":
        r, sp = s["rider"], s["spider"]
        return (f"Queen of a moonlit web: the upper body of a pale {r.get('build')} sorceress with {mcol(r['mats'], 'hair')} hair and a crown, "
                f"holding {WEAPON.get(r.get('weapon'), 'a staff')}, merged at the waist with a huge {mcol(sp['mats'], 'abdomen')} spider body, eight long legs, "
                f"glowing {mcol(sp['mats'], 'mark')} markings.")
    if rig == "humanoid":
        m = s["mats"]
        parts = [BUILD.get(s.get("build", "male"), "adult")]
        if s.get("hair") and s.get("hair") != "bald" and s.get("helm") not in ("hood", "helm", "great_helm", "horned"):
            parts.append(f"{s['hair']} {mcol(m, 'hair')} hair")
        if s.get("helm"):
            parts.append(HELM.get(s["helm"], s["helm"]) + (f" ({mcol(m, 'hood') or mcol(m, 'metal')})"))
        parts.append(f"{mcol(m, 'top')} upper garment")
        if s.get("skirt"):
            parts.append(f"{mcol(m, 'skirt') or mcol(m, 'top')} {OUTFIT.get(s['skirt'], s['skirt'])}")
        if m.get("cape") is not None:
            parts.append(f"{mcol(m, 'cape')} cape")
        if m.get("pauldron") is not None:
            parts.append(f"{mcol(m, 'pauldron')} pauldrons")
        parts.append(f"{mcol(m, 'boots')} boots")
        if s.get("weapon"):
            parts.append("wields " + WEAPON.get(s["weapon"], s["weapon"]))
        if s.get("offhand"):
            parts.append("off-hand " + WEAPON.get(s["offhand"], s["offhand"]))
        for flag, text in (("wings", "crystal prism wings"), ("halo", "a thin light halo"), ("horns", "curved horns"), ("antlers", "branching antlers"), ("tail", "a tail")):
            if s.get(flag):
                parts.append(text)
        if s.get("build") == "golem":
            parts.append(f"body of {mcol(m, 'top')} carved stone with {mcol(m, 'glow')} glowing seams and eyes")
        return ", ".join(p for p in parts if p) + "."
    m = s["mats"]
    body = mcol(m, "body")
    if rig == "quadruped":
        species = u["id"].replace("_", " ")
        bits = [f"a realistic {body} {species} (four-legged) with a {mcol(m, 'belly')} underside"]
        for key, text in (("horns", f"{s.get('horns')} horns"), ("mane", "a thick mane"), ("wings", "leathery wings"), ("spines", "a row of back spines"),
                          ("hump", "a hump"), ("shell", "a heavy domed shell"), ("wool", "a thick woolly fleece"), ("tusks", "tusks")):
            if s.get(key):
                bits.append(text)
        if s.get("tail"):
            bits.append(f"{s.get('tails', 1)} {s['tail']} tail(s)".replace("1 ", "a "))
        return ", ".join(bits) + "."
    if rig == "serpent":
        return f"a great {body} sea serpent coiled on the ground, the neck rising in an S-curve" + (", fins along the spine" if s.get("fins") else "") + (", a crown" if s.get("crown") else "") + "."
    if rig == "arthropod":
        return f"a {body} {s.get('kind', 'scorpion')} ({u['id'].replace('_', ' ')}) with armoured, segmented plates."
    if rig == "flyer":
        return f"a {body} {u['id'].replace('_', ' ')}" + (", perched on the ground" if s.get("perched") else ", hovering on beating wings") + "."
    if rig == "floater":
        return f"a hovering {body} {s.get('kind', 'wisp')} creature with a glowing core."
    if rig == "blob":
        return f"a round {body} slime with a sprout on top and a glowing core."
    return body


def ref_key(u):
    if u["category"] == "heroes":
        return "heroes"
    if u["category"] == "bosses":
        return "bosses"
    if u["category"] == "gatekeepers" and u.get("concept"):
        if u["spec"].get("build") == "golem":
            return "gatekeeper_golem"
        return "gatekeeper_humanoid" if u["rig"] in ("humanoid", "rider") else "gatekeeper_beast"
    return "humanoid_enemy" if u["rig"] in ("humanoid", "rider") else "beast"


def write_unit(u):
    cat, uid = u["category"], u["id"]
    first, extra = STYLE_REF[ref_key(u)]
    view = "BACK" if cat == "heroes" else "FRONT"
    orient = "prompts/battle/orientation-back.png" if view == "BACK" else "prompts/battle/orientation-front.png"
    cell = 256 if cat == "bosses" else 192
    rows = ROWS["heroes" if cat == "heroes" else ("bosses" if cat == "bosses" else ("elite" if cat == "gatekeepers" and u.get("concept") else "enemy"))]
    design = u.get("concept") or describe(u)
    elite = cat == "gatekeepers" and bool(u.get("concept"))
    lines = [
        f"# {u['nameVi']} · `{uid}`\n\n",
        f"Nhóm `{cat}` · nguyên tố {u['element']} · rig `{u['rig']}`" + (f" · vùng `{u.get('realm')}`" if u.get("realm") else "") + "\n\n",
        "## Ảnh đính kèm (theo thứ tự)\n\n",
        f"1. FIRST: `database-astral-expedition/{first}` — chuẩn phong cách, mật độ pixel và cách tô.\n",
        f"2. SECOND: `database-astral-expedition/art-source/units/{cat}/{uid}-battle-source.png` — chỉ lấy bố cục lưới, tư thế từng hàng và tỷ lệ trong ô; không chép cách tô.\n",
        f"3. THIRD: `{orient}` — chỉ lấy góc xoay 3/4 {view}.\n",
    ]
    if extra:
        note = "chuẩn phong cách boss thứ hai, mật độ chi tiết" if elite else "tham khảo thêm chuyển động"
        lines.append(f"4. FOURTH (tùy chọn): `database-astral-expedition/{extra}` — {note}.\n")
    if elite:
        design = design.rstrip(".") + "."
    lines += [
        "\n## Thiết kế\n\n", design + "\n\n",
        f"## Prompt · battle ({view}, 6 × {len(rows)} ô {cell} px)\n\n```text\n",
        COMMON + "\n",
        f"Subject: {design}\n",
        *([ELITE + "\n"] if elite else []),
        f"View: 3/4 {'from behind-right, looking up-right at the enemy (like the THIRD image)' if view == 'BACK' else 'facing down-left toward the heroes (like the THIRD image), attacks swing toward the bottom-left'}.\n",
        f"Layout: 6 columns x {len(rows)} rows of equal square cells, keep the whole figure inside the central 85% of every cell, feet on the same baseline.\n",
    ]
    for i, r in enumerate(rows, 1):
        lines.append(f"ROW {i} {r}.\n")
    lines.append("```\n\n")
    if cat != "bosses":
        mrows = "8 rows: idle DOWN, LEFT, RIGHT, UP then walk DOWN, LEFT, RIGHT, UP" if cat == "heroes" else "4 rows: walk DOWN, LEFT, RIGHT, UP"
        lines += [
            f"## Prompt · movement (6 × {8 if cat == 'heroes' else 4} ô 64 px, top-down 3/4)\n\n```text\n", COMMON + "\n",
            f"Subject: {design}\nLayout: 6 columns x {mrows}; 6 distinct frames per loop, same height in every direction "
            "(like `art-source/motion/gustave-movement-source.png`).\n```\n\n",
        ]
    lines += [
        "## Lưu và xuất\n\n",
        f"- Battle: lưu đè `database-astral-expedition/art-source/units/{cat}/{uid}-battle-source.png`.\n",
    ]
    if cat != "bosses":
        lines.append(f"- Movement: lưu đè `database-astral-expedition/art-source/units/{cat}/{uid}-movement-source.png`.\n")
    lines += [
        "- Chuẩn hóa từng hàng nếu bản vẽ lệch lưới: `py tools/units/normalize_sheet.py --mode move4 --layout loop --frames 6 --keep-x --input <bản vẽ> --output <file -source.png>`.\n",
        "- Xuất 1-1 sang game: `py tools/expedition/art_source.py --domain units`.\n",
        f"- Không chạy lại `build_units.py --only {uid}` sau khi đã có bản vẽ tay: lệnh đó dựng lại bản gốc từ rig. Muốn giữ bản vẽ, khai báo trường `art` cho unit trong `tools/expedition/roster.py`.\n",
    ]
    path = os.path.join(OUT, cat, f"{uid}.md")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("".join(lines))
    return path


def write_index(units):
    rows = []
    for u in units:
        cat = u["category"]
        status = "vẽ tay (art-source/motion)" if u.get("art") else "chờ vẽ tay · đang dùng bản dựng rig"
        rows.append(f"| [{u['nameVi']}]({cat}/{u['id']}.md) | `{u['id']}` | {cat} | {u['element']} | {status} |\n")
    with open(os.path.join(OUT, "README.md"), "w", encoding="utf-8") as f:
        f.write(
            "# Prompt vẽ tay cho units · Astral Expedition Pixel\n\n"
            "Chuẩn phong cách: ba bản vẽ ImageGen trong `database-astral-expedition/art-source/motion/` "
            "(Lâm Phong, Phong Lang, Seraphina). Mỗi unit có một file prompt riêng ghi ảnh cần đính kèm, prompt battle và movement, "
            "đường dẫn lưu bản vẽ trong `art-source/units/` và lệnh xuất 1-1. Thiết kế là nhân vật nguyên bản; prompt cấm sao chép "
            "nhân vật, trang phục hay logo của game có sẵn.\n\n"
            "Sinh lại toàn bộ: `py tools/expedition/write_unit_prompts.py`.\n\n"
            "| Unit | ID | Nhóm | Nguyên tố | Trạng thái |\n|---|---|---|---|---|\n" + "".join(rows)
        )


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    units = [UNITS_BY_ID[i] for i in args.only.split(",")] if args.only else ALL_UNITS
    for u in units:
        write_unit(u)
    write_index(ALL_UNITS)
    print(f"wrote {len(units)} unit prompt(s) to prompts/units/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
