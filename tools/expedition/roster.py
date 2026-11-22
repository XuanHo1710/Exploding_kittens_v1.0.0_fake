"""Unit roster — thiết kế chuẩn (design lock) cho mọi thực thể trong database-astral-expedition/units/.

Mỗi mục: id, category, nameVi, element, realm, rig, style (bảng hoạt ảnh), spec (tỷ lệ + bảng màu),
`art` = sheet vẽ tay trong art-source/motion/ được ưu tiên dùng thay cho bản dựng từ rig.

Danh mục (category) → thư mục / bố cục sheet:
  heroes       BACK  192 px, 6x6 battle + 64 px 6x8 movement (idle+walk) + 128 px portrait
  gatekeepers  FRONT 192 px, 6x4 battle + 64 px 6x4 walk
  bosses       FRONT 256 px, 6x6 battle
  monsters     FRONT 192 px, 6x4 battle + 64 px 6x4 walk   (quái hoang dã + người địch)
  animals      FRONT 192 px, 6x4 battle + 64 px 6x4 walk   (động vật)

Ví dụ (chạy từ thư mục gốc): py tools/expedition/build_units.py --only gale_wolf,chicken
"""

from __future__ import annotations

from rig_humanoid import mats_from

REALMS = {
    "01-dawn-meadow": "Verdant",
    "02-everfrost-peaks": "Frost",
    "03-sunken-dunes": "Solar",
    "04-abyssal-sanctum": "Tide",
    "05-cinder-caldera": "Pyre",
    "06-nocturne-veil": "Astral",
    "07-aurora-zenith": "Astral",
}

SKIN_FAIR = (236, 196, 160)
SKIN_TAN = (204, 150, 110)
SKIN_DEEP = (150, 98, 72)
SKIN_PALE = (240, 214, 200)

FX = {
    "Verdant": {"fx": (150, 240, 170), "fx_core": (232, 255, 220), "glow": (110, 220, 150)},
    "Frost": {"fx": (150, 220, 255), "fx_core": (236, 250, 255), "glow": (120, 200, 248)},
    "Solar": {"fx": (255, 214, 96), "fx_core": (255, 248, 210), "glow": (250, 190, 70)},
    "Tide": {"fx": (90, 210, 240), "fx_core": (220, 250, 255), "glow": (70, 180, 230)},
    "Pyre": {"fx": (255, 140, 60), "fx_core": (255, 236, 150), "glow": (250, 110, 50)},
    "Astral": {"fx": (210, 140, 255), "fx_core": (250, 226, 255), "glow": (190, 120, 250)},
}


def M(element, **colors):
    c = dict(FX[element])
    c.update(colors)
    return mats_from(c)


def hero(id_, name, element, style, H=118, **spec):
    spec["H"] = H
    return {"id": id_, "category": "heroes", "nameVi": name, "element": element, "rig": "humanoid", "style": style, "spec": spec}


# ---------------------------------------------------------------- 12 heroes (BACK view)

HEROES = [
    hero("gustave_blade", "Miran", "Verdant", "blade", build="male", hair="short", skirt="coat", weapon="rapier", offhand="pistol",
         mats=M("Verdant", skin=SKIN_FAIR, hair=(96, 62, 44), top=(62, 84, 60), skirt=(62, 84, 60), legs=(72, 54, 46), boots=(70, 42, 34),
                gloves=(110, 72, 50), belt=(124, 84, 50), metal=(204, 210, 222), accent=(214, 166, 74), grip=(84, 52, 40), trim=(210, 170, 90))),
    hero("celine_prism", "Karen", "Solar", "caster", build="female", hair="ponytail", skirt="robe", weapon="brush", bust=True,
         mats=M("Solar", skin=SKIN_FAIR, hair=(232, 160, 80), top=(242, 232, 206), skirt=(220, 132, 70), legs=(180, 110, 70), boots=(130, 82, 56),
                gloves=(242, 232, 206), belt=(200, 150, 60), metal=(230, 200, 120), accent=(230, 170, 60), grip=(120, 76, 50), bristle=(255, 210, 120))),
    hero("bastian_aegis", "Park", "Pyre", "shield", build="heavy", helm="helm", skirt="tabard", weapon="hammer", offhand="tower_shield", knee_guard=True,
         mats=M("Pyre", skin=SKIN_TAN, top=(122, 130, 146), skirt=(170, 70, 40), legs=(92, 92, 104), boots=(70, 62, 66), gloves=(110, 116, 130),
                belt=(120, 80, 50), metal=(168, 176, 196), accent=(240, 130, 50), grip=(96, 62, 44), pauldron=(150, 158, 176))),
    hero("lyra_frostbow", "Se Ok", "Frost", "bow", build="female", hair="long", skirt="coat", offhand="bow", bust=True,
         mats=M("Frost", skin=SKIN_PALE, hair=(238, 241, 248), top=(40, 54, 77), skirt=(41, 51, 70), legs=(58, 66, 90), boots=(70, 65, 63),
                gloves=(104, 151, 153), belt=(129, 111, 81), metal=(214, 236, 250), accent=(130, 200, 250), grip=(90, 110, 150))),
    hero("kestrel_dune", "Kai", "Solar", "dual", build="lean", hair="spiky", skirt="loin", weapon="khopesh", offhand="khopesh",
         mats=M("Solar", skin=SKIN_DEEP, hair=(40, 34, 44), top=(190, 140, 70), skirt=(150, 96, 50), legs=(70, 56, 56), boots=(110, 78, 50),
                gloves=(90, 64, 50), belt=(210, 170, 70), metal=(240, 214, 120), accent=(200, 140, 40), grip=(80, 56, 44), cape=(226, 186, 110)), cape_len=0.35),
    hero("nereus_tide", "Nerio", "Tide", "caster", build="lean", hair="long", skirt="robe", weapon="staff", offhand="lyre",
         mats=M("Tide", skin=SKIN_FAIR, hair=(140, 220, 228), top=(40, 126, 160), skirt=(30, 96, 130), legs=(40, 80, 110), boots=(50, 70, 100),
                gloves=(200, 240, 244), belt=(230, 200, 120), metal=(200, 240, 248), accent=(240, 200, 110), grip=(90, 110, 120))),
    hero("corvus_night", "Corvin", "Astral", "heavy", build="lean", helm="hood", skirt="coat", weapon="scythe",
         mats=M("Astral", skin=SKIN_PALE, top=(58, 44, 86), skirt=(48, 36, 74), legs=(40, 32, 56), boots=(34, 28, 46), gloves=(70, 60, 96),
                belt=(150, 120, 200), metal=(214, 214, 236), accent=(170, 110, 240), grip=(60, 44, 70), hood=(46, 36, 70), cape=(46, 36, 70)), cape_len=0.62),
    hero("ignis_valkyrie", "Rhea", "Pyre", "polearm", build="female", hair="long", helm="winged", skirt="skirt", weapon="lance", bust=True, plume=True,
         mats=M("Pyre", skin=SKIN_FAIR, hair=(250, 180, 70), top=(184, 52, 50), skirt=(150, 40, 44), legs=(130, 60, 56), boots=(110, 50, 44),
                gloves=(200, 180, 150), belt=(240, 190, 80), metal=(230, 206, 150), accent=(250, 176, 64), grip=(110, 60, 40), cape=(200, 60, 50),
                pauldron=(220, 190, 120), plume=(250, 120, 60))),
    hero("marina_abyss", "Mara", "Tide", "blade", build="female", hair="long", skirt="coat", weapon="whip", bust=True,
         mats=M("Tide", skin=SKIN_PALE, hair=(40, 70, 150), top=(34, 74, 152), skirt=(30, 60, 130), legs=(220, 236, 244), boots=(40, 56, 100),
                gloves=(60, 200, 224), belt=(200, 220, 240), metal=(200, 236, 248), accent=(64, 200, 226), grip=(40, 60, 100))),
    hero("aurelia_eclipse", "Aurelia", "Solar", "heavy", build="female", hair="long", skirt="tabard", weapon="greatsword", bust=True, crown=True,
         mats=M("Solar", skin=SKIN_FAIR, hair=(248, 230, 150), top=(40, 34, 48), skirt=(36, 30, 44), legs=(50, 44, 60), boots=(40, 34, 44),
                gloves=(232, 194, 70), belt=(232, 194, 70), metal=(236, 222, 170), accent=(236, 190, 64), grip=(60, 40, 40), cape=(232, 190, 64),
                pauldron=(232, 194, 70), crown=(250, 220, 100))),
    hero("seraph_glacier", "Soren", "Frost", "shield", build="male", hair="short", skirt="tabard", weapon="icesword", offhand="shield", crown=True,
         mats=M("Frost", skin=SKIN_PALE, hair=(232, 244, 250), top=(170, 214, 246), skirt=(232, 244, 250), legs=(120, 160, 200), boots=(90, 120, 170),
                gloves=(220, 236, 250), belt=(140, 190, 230), metal=(210, 236, 252), accent=(130, 196, 250), grip=(80, 110, 150), cape=(236, 246, 252),
                pauldron=(190, 226, 250), crown=(170, 230, 255))),
    hero("lumina_chrono", "Luma", "Astral", "caster", build="female", hair="long", skirt="robe", weapon="astro_staff", offhand="astrolabe", bust=True, halo=True,
         mats=M("Astral", skin=SKIN_PALE, hair=(246, 190, 240), top=(136, 76, 210), skirt=(110, 60, 180), legs=(80, 50, 140), boots=(70, 44, 120),
                gloves=(240, 220, 250), belt=(250, 210, 120), metal=(240, 226, 250), accent=(250, 214, 120), grip=(90, 60, 130))),
    # SSS · Jung: tóc đen sóng chạm vai, sơ mi trắng trơn, áo khoác và bốt đen.
    hero("jung_afterglow", "Jung", "Solar", "blade", H=176, build="female", hair="shag", weapon="katana", weapon_scale=0.85, battle_fill=0.85, bust=True, cape_len=0.27,
         mats=M("Solar", skin=SKIN_FAIR, hair=(28, 26, 34), top=(236, 234, 228), legs=(42, 42, 52), boots=(38, 35, 43), gloves=(36, 34, 42),
                belt=(54, 48, 48), metal=(228, 234, 242), accent=(255, 154, 46), grip=(34, 28, 34), cape=(14, 14, 20), trim=(46, 43, 50),
                fx=(255, 160, 60), fx_core=(255, 240, 200), glow=(255, 140, 40))),
]
HEROES[0]["art"] = {"battle": "gustave-battle.png", "movement": "gustave-movement.png"}


# ---------------------------------------------------------------- helpers for enemies


def enemy(id_, name, element, realm, rig, style=None, category="gatekeepers", **spec):
    art = spec.pop("art", None)
    d = {"id": id_, "category": category, "nameVi": name, "element": element, "realm": realm, "rig": rig, "style": style, "spec": spec}
    if art:
        d["art"] = art
    return d


def golem_mats(element, rock, rock2, glow, **kw):
    c = dict(FX[element])
    c.update(skin=rock, face=rock, top=rock, arms=rock, legs=rock2, boots=rock2, gloves=rock, hips=rock2, neck=rock2, pauldron=rock2, glow=glow)
    c.update(kw)
    return mats_from(c)


# ---------------------------------------------------------------- 20 gatekeepers (FRONT view)

GATEKEEPERS = [
    enemy("meadow_stag", "Lộc Giác Cổ Thụ", "Verdant", "01-dawn-meadow", "quadruped", "charge", S=118, horns="antlers", tail="short", ears="pointed",
          neck_len=0.30, leg=1.15, head_r=0.09, snout=1.2, snout_r=0.5,
          mats=M("Verdant", body=(150, 104, 68), belly=(230, 206, 170), dark=(64, 44, 36), horn=(210, 196, 150), legs=(130, 90, 60), mane=(120, 160, 80))),
    enemy("moss_sentinel", "Hộ Binh Rêu Đá", "Verdant", "01-dawn-meadow", "humanoid", "fist", H=128, build="golem", no_face=False, eye_rgb=(170, 255, 180), hair="bald",
          mats=golem_mats("Verdant", (124, 130, 116), (92, 96, 90), (140, 240, 160), pauldron=(90, 150, 70), hips=(90, 150, 70), hair=(90, 150, 70))),
    enemy("gale_wolf", "Tinh Anh Phong Lang", "Verdant", "01-dawn-meadow", "quadruped", "pounce", S=112, tail="bushy", ears="pointed", mane=0.13, fangs=True,
          head_r=0.10, snout=1.4, mats=M("Verdant", body=(140, 128, 118), belly=(210, 200, 186), dark=(54, 44, 46), mane=(106, 120, 96), tail=(130, 120, 112), tail_tip=(220, 210, 196)),
          art={"battle": "gale-wolf-battle.png", "extra": {"gale_wolf-leap.png": "gale-wolf-leap.png"}}),
    enemy("frost_golem", "Cự Nhân Băng Tinh", "Frost", "02-everfrost-peaks", "humanoid", "fist", H=138, build="golem", hair="bald", eye_rgb=(220, 250, 255),
          mats=golem_mats("Frost", (150, 206, 240), (96, 150, 204), (200, 240, 255), pauldron=(220, 244, 255), hair=(200, 240, 255))),
    enemy("snow_prowler", "Báo Tuyết Hàn Phong", "Frost", "02-everfrost-peaks", "quadruped", "pounce", S=108, tail="thin", tail_len=0.6, tail_angle=5, ears="round",
          head_r=0.10, snout=0.8, snout_r=0.6, fangs=True, body_len=0.62, leg=0.95,
          mats=M("Frost", body=(226, 232, 238), belly=(248, 250, 252), dark=(70, 80, 100), tail=(206, 214, 226), legs=(214, 222, 232), eye=(120, 200, 240))),
    enemy("glacier_lancer", "Giáo Sĩ Đền Băng", "Frost", "02-everfrost-peaks", "humanoid", "polearm", H=124, build="male", helm="hood", skirt="robe", weapon="glaive", kind="human",
          mats=M("Frost", skin=SKIN_PALE, top=(110, 150, 200), skirt=(70, 110, 170), legs=(60, 90, 140), boots=(60, 80, 120), gloves=(200, 220, 240),
                 belt=(220, 236, 250), metal=(206, 236, 252), accent=(140, 210, 250), grip=(80, 100, 140), hood=(220, 232, 246), cape=(210, 226, 244))),
    enemy("dune_scorpio", "Bọ Cạp Vàng Cổ Đại", "Solar", "03-sunken-dunes", "arthropod", None, S=120, kind="scorpion",
          mats=M("Solar", body=(220, 170, 60), body2=(190, 130, 40), legs=(150, 96, 40), claw=(230, 186, 80), head=(210, 160, 56), sting=(120, 60, 120))),
    enemy("sun_ushabti", "Tượng Thần Cát Nung", "Solar", "03-sunken-dunes", "humanoid", "blade", H=132, build="heavy", helm="hood", skirt="loin", weapon="khopesh", eye_rgb=(255, 220, 120),
          mats=M("Solar", skin=(206, 160, 110), face=(206, 160, 110), top=(206, 160, 110), arms=(206, 160, 110), legs=(196, 150, 104), skirt=(240, 234, 214),
                 boots=(170, 126, 86), gloves=(206, 160, 110), belt=(60, 90, 170), metal=(240, 210, 110), accent=(60, 90, 170), grip=(120, 80, 50), hood=(60, 90, 170), pauldron=(236, 196, 80))),
    enemy("mirage_raider", "Kỵ Binh Ảo Ảnh", "Solar", "03-sunken-dunes", "rider", "polearm",
          mount=dict(S=112, tail="thin", tail_angle=-30, ears="pointed", mane=0.07, neck_len=0.36, neck_angle=48, head_r=0.085, snout=1.7, snout_r=0.5, head_tilt=38, leg=1.2,
                     body_len=0.6, rider_seat=True,
                     mats=M("Solar", body=(150, 104, 64), belly=(176, 128, 84), dark=(50, 36, 30), mane=(40, 30, 28), tail=(40, 30, 28), hoof=(40, 32, 30))),
          rider=dict(H=96, build="lean", helm="hood", skirt="none", weapon="spear", cape_len=0.35,
                     mats=M("Solar", skin=SKIN_DEEP, top=(70, 60, 80), legs=(200, 170, 120), boots=(90, 60, 44), gloves=(90, 60, 44), belt=(220, 170, 70),
                            metal=(236, 220, 170), accent=(220, 140, 60), grip=(110, 76, 50), hood=(236, 220, 186), cape=(200, 70, 50)))),
    enemy("abyss_serpent", "Hải Xà Lân Tinh", "Tide", "04-abyssal-sanctum", "serpent", None, S=150, fins=True, crest=True, thick=0.10, head_r=0.10,
          mats=M("Tide", body=(40, 130, 150), body2=(50, 150, 168), fin=(110, 220, 220), head=(46, 140, 160), mouth=(120, 30, 60)), eye_rgb=(255, 236, 120)),
    enemy("coral_warden", "Giáp Sĩ Vỏ Trai Cổ", "Tide", "04-abyssal-sanctum", "humanoid", "shield", H=126, build="heavy", helm="helm", skirt="tabard", weapon="trident", offhand="shield",
          mats=M("Tide", skin=(120, 180, 190), top=(230, 140, 130), skirt=(60, 120, 150), legs=(50, 100, 130), boots=(220, 120, 110), gloves=(230, 140, 130),
                 belt=(240, 220, 200), metal=(240, 170, 150), accent=(250, 230, 210), grip=(90, 110, 120), pauldron=(240, 160, 140))),
    enemy("kraken_spawn", "Thủy Quái Xoáy Ngầm", "Tide", "04-abyssal-sanctum", "floater", None, S=124, kind="kraken", hover=0.10,
          mats=M("Tide", body=(120, 70, 150), tentacle=(150, 90, 170), core=(80, 220, 230)), eye_rgb=(255, 230, 90)),
    enemy("magma_automaton", "Chiến Khôi Nham Thạch", "Pyre", "05-cinder-caldera", "humanoid", "fist", H=134, build="golem", hair="bald", eye_rgb=(255, 210, 90),
          mats=golem_mats("Pyre", (70, 60, 66), (54, 46, 52), (255, 140, 50), pauldron=(240, 110, 40), hips=(240, 110, 40))),
    enemy("cinder_drake", "Hỏa Long Cảnh Vệ", "Pyre", "05-cinder-caldera", "quadruped", "breath", S=118, wings=True, tail="dragon", tail_len=0.6, horns="dragon", ears="none",
          spines=True, neck_len=0.32, neck_angle=50, head_r=0.09, snout=1.4, snout_r=0.5, fangs=True, leg=0.9,
          mats=M("Pyre", body=(190, 60, 48), belly=(240, 180, 90), dark=(80, 30, 36), horn=(240, 220, 180), wing=(140, 40, 50), wing_bone=(110, 36, 40), accent=(250, 170, 70))),
    enemy("forge_executioner", "Đao Phủ Lò Rèn", "Pyre", "05-cinder-caldera", "humanoid", "heavy", H=136, build="heavy", helm="hood", skirt="loin", weapon="greataxe", kind="human",
          mats=M("Pyre", skin=SKIN_DEEP, top=SKIN_DEEP, arms=SKIN_DEEP, legs=(70, 50, 46), skirt=(90, 50, 40), boots=(50, 40, 40), gloves=(60, 46, 44),
                 belt=(140, 90, 50), metal=(160, 150, 150), accent=(250, 120, 50), grip=(80, 56, 44), hood=(50, 40, 44))),
    enemy("night_stalker", "Kỵ Sĩ Đêm Tím", "Astral", "06-nocturne-veil", "humanoid", "blade", H=126, build="male", helm="horned", skirt="tabard", weapon="sword", cape_len=0.62, kind="human",
          mats=M("Astral", skin=SKIN_PALE, top=(70, 56, 100), skirt=(56, 44, 84), legs=(50, 42, 70), boots=(40, 34, 56), gloves=(80, 70, 110),
                 belt=(170, 130, 220), metal=(110, 100, 140), accent=(190, 130, 250), grip=(60, 44, 70), cape=(90, 40, 110), pauldron=(100, 90, 130), horn=(220, 210, 230)),
          visor_glow=(230, 160, 255)),
    enemy("luna_kitsune", "Hồ Ly Dạ Quang", "Astral", "06-nocturne-veil", "quadruped", "pounce", S=100, tail="bushy", tails=3, tail_angle=35, ears="pointed",
          head_r=0.10, snout=1.3, snout_r=0.45, crest_glow=True,
          mats=M("Astral", body=(236, 228, 246), belly=(250, 248, 255), dark=(90, 70, 120), tail=(230, 220, 246), tail_tip=(210, 150, 250), ear=(236, 228, 246))),
    enemy("eclipse_judge", "Phán Quan Bóng Nguyệt", "Astral", "06-nocturne-veil", "humanoid", "caster", H=130, build="male", helm="hood", skirt="robe", weapon="crook", offhand="tome", halo=True,
          mats=M("Astral", skin=SKIN_PALE, top=(40, 34, 60), skirt=(30, 26, 48), legs=(30, 26, 48), boots=(30, 26, 48), gloves=(220, 210, 240),
                 belt=(220, 190, 110), metal=(220, 200, 140), accent=(230, 200, 120), grip=(60, 50, 80), hood=(40, 34, 60), cape=(120, 40, 60)), no_face=True),
    enemy("aurora_archon_left", "Thiên Sứ Tinh Vân Tả Vệ", "Astral", "07-aurora-zenith", "humanoid", "polearm", H=128, build="female", hair="long", helm="winged", skirt="skirt", weapon="spear",
          wings="crystal", wing_span=0.6, halo=True, bust=True,
          mats=M("Astral", skin=SKIN_PALE, hair=(250, 236, 250), top=(236, 230, 250), skirt=(170, 140, 240), legs=(210, 200, 240), boots=(160, 130, 220),
                 gloves=(236, 230, 250), belt=(250, 214, 120), metal=(236, 236, 252), accent=(150, 230, 240), grip=(120, 100, 170), wing=(170, 230, 250))),
    enemy("aurora_archon_right", "Thiên Sứ Quang Phổ Hữu Vệ", "Astral", "07-aurora-zenith", "humanoid", "blade", H=128, build="male", hair="short", helm="winged", skirt="tabard", weapon="sword", offhand="shield",
          wings="crystal", wing_span=0.6, halo=True,
          mats=M("Astral", skin=SKIN_FAIR, hair=(250, 220, 150), top=(240, 236, 250), skirt=(250, 190, 150), legs=(220, 200, 230), boots=(200, 150, 140),
                 gloves=(240, 236, 250), belt=(250, 214, 120), metal=(240, 236, 252), accent=(250, 180, 140), grip=(140, 100, 120), wing=(250, 210, 200))),
]

# Boss-grade concepts for hand-drawn gatekeeper sheets (prompts/units/gatekeepers). The rig spec above only drives the
# fallback render and the pose layout; the redraw follows these descriptions. All designs are original.
GATEKEEPER_CONCEPTS = {
    "meadow_stag": "a colossal ancient forest stag, shoulders as tall as a man, chestnut hide with a dark dorsal stripe, bark-like armour plates grown over the chest and shoulders, "
                   "enormous antlers shaped like gnarled oak branches carrying moss, hanging vines and tiny white blossoms, roots wrapped around the hooves, glowing pale-green eyes, "
                   "a thick shaggy neck ruff",
    "moss_sentinel": "a hulking stone guardian golem of weathered grey granite slabs bound together by thick roots, moss and ferns growing on the shoulders, a cracked rune-carved chest slab "
                     "with a glowing green core behind it, oversized boulder fists, a small head sunk between the shoulders with one glowing green eye slit, ivy hanging from the arms",
    "frost_golem": "a towering glacier giant of jagged pale-blue ice over a dark blue rock core, clusters of crystal spikes jutting from the shoulders and back, a crust of snow on top, "
                   "huge fists ending in icicle claws, a craggy face with glowing cyan eyes, frost cracks across the chest",
    "snow_prowler": "a large sabre-toothed snow leopard, thick white fur with charcoal rosettes, long curved ice-blue sabre fangs, ridge of frost crystals along the spine, "
                    "a long heavy tail, scarred muzzle, pale cyan eyes, cold mist curling from the jaws",
    "glacier_lancer": "a frost temple templar, tall adult man in layered silver-blue plate armour over a white and navy robe, a frosted fur mantle, a crested ice helm with a glowing cyan visor slit, "
                      "frost runes engraved on the breastplate, wields a long glaive whose blade is a crescent of clear blue ice",
    "dune_scorpio": "a giant ancient golden scorpion, sandstone-gold armoured carapace engraved with sun glyphs, bronze-banded segmented tail ending in a violet venom-glowing stinger, "
                    "huge serrated pincers, a cluster of amber eyes, sand trickling from the joints",
    "sun_ushabti": "an animated sun-baked clay guardian statue, tall heavy humanoid of terracotta with cracks glowing gold, a lapis-blue and gold striped headcloth, a broad gold collar, "
                   "a white linen kilt with a blue sash, a sun disc set in the chest, burning gold eyes, wields a large bronze sickle-sword",
    "mirage_raider": "a desert lancer: lean rider in sand-coloured wraps and bronze scale armour, a long crimson scarf streaming behind, face veiled so only glowing amber eyes show, "
                     "a long spear with a crimson pennant, riding a lean dark-chestnut desert horse with a tasselled bridle and an ornate saddle cloth, heat haze shimmering at the edges",
    "abyss_serpent": "a deep-sea serpent coiled on the ground, the neck rising in an S-curve, teal-black scales with rows of glowing aqua spots, tall translucent fin sails along the spine, "
                     "a bioluminescent lantern lure hanging from the brow, golden eyes, needle-fanged jaws, pale ivory belly plates",
    "coral_warden": "a heavy deep-sea knight in armour grown from pink-orange coral and pearlescent clam shells, a helm shaped like a nautilus shell with glowing teal eye slits, barnacles on the pauldrons, "
                    "a tattered seaweed tabard, teal skin, a round clam-shell shield and a bronze and coral trident",
    "kraken_spawn": "a hovering young kraken, violet mantle with a glowing teal core visible through translucent skin, eight thick tentacles with hooked suckers curling below, "
                    "large golden eyes with horizontal pupils, a hooked beak, water dripping from the tentacle tips",
    "magma_automaton": "a hulking war construct of black basalt plates, molten orange magma glowing through every crack and joint, a furnace grate in the chest, chimney vents on the shoulders "
                       "trailing embers, huge pistoned forearms with riveted iron bands, a single glowing visor slit",
    "cinder_drake": "a fierce four-legged fire drake, obsidian-black and crimson armoured scales with ember-glowing cracks, gold underbelly plates, swept-back ivory horns, "
                    "tattered leathery wings half spread, a row of flaming back spines, smoke and embers from the nostrils, a heavy muscular stance",
    "forge_executioner": "a hulking executioner, scarred dark-skinned muscular torso crossed with leather straps, a heavy blacksmith apron, a black hood with eye holes, iron chains on the belt, "
                         "an iron gauntlet, wields a massive greataxe whose forged edge glows orange-hot",
    "night_stalker": "a dark knight in violet-black plate armour, a horned helm with a glowing violet visor slit, spiked pauldrons, a long tattered purple cape, "
                     "a longsword etched with lavender glowing runes",
    "luna_kitsune": "an elegant silver-white fox spirit, three long flowing tails tipped with violet moonfire, a glowing crescent moon mark on the forehead, lavender eyes, "
                    "a red-violet ribbon collar, small wisps of violet flame floating around it",
    "eclipse_judge": "a tall faceless judge in a midnight hooded robe, a void-black face with two glowing pale eyes, a golden eclipse halo (black disc ringed with gold) behind the head, "
                     "a crimson stole, a hooked judge's crook, a heavy chained tome hanging at the hip",
    "aurora_archon_left": "a female celestial guardian, adult woman, silver-white armour, long white hair, a winged circlet, large crystal prism wings refracting cyan and violet aurora light, "
                          "a lavender battle skirt, a thin light halo, wields a long spear with a crystal tip",
    "aurora_archon_right": "a male celestial guardian, adult man, golden hair, white-gold plate armour, a peach-coral tabard, large crystal wings glowing warm rose-gold, a thin light halo, "
                           "wields a longsword and a round shield with a sunburst",
}
for _u in GATEKEEPERS:
    if _u["id"] in GATEKEEPER_CONCEPTS:
        _u["concept"] = GATEKEEPER_CONCEPTS[_u["id"]]


# ---------------------------------------------------------------- 7 bosses (256 px FRONT)


def boss(id_, name, element, realm, rig, style=None, **spec):
    d = enemy(id_, name, element, realm, rig, style, category="bosses", **spec)
    return d


BOSSES = [
    boss("sylvan_warden", "Hộ Vệ Cổ Mộc Ngàn Năm", "Verdant", "01-dawn-meadow", "humanoid", "fist", H=200, build="golem", hair="bald", antlers=True, eye_rgb=(200, 255, 140),
         mats=golem_mats("Verdant", (120, 86, 60), (96, 66, 48), (170, 250, 140), pauldron=(80, 150, 70), hips=(80, 150, 70), horn=(140, 104, 70), hair=(80, 150, 70))),
    boss("boreal_chevalier", "Kỵ Sĩ Băng Giá Vĩnh Cửu", "Frost", "02-everfrost-peaks", "humanoid", "heavy", H=196, build="heavy", helm="great_helm", plume=True, skirt="tabard", weapon="icesword",
         weapon_scale=1.05, cape_len=0.66, knee_guard=True, visor_glow=(170, 236, 255),
         mats=M("Frost", skin=SKIN_PALE, top=(160, 196, 230), skirt=(60, 90, 150), legs=(130, 160, 200), boots=(110, 140, 180), gloves=(170, 200, 230),
                belt=(220, 236, 250), metal=(196, 224, 248), accent=(110, 180, 240), grip=(70, 90, 140), cape=(50, 80, 140), pauldron=(210, 232, 250), plume=(236, 246, 255))),
    boss("chronos_khepri", "Pharaoh Đồng Hồ Cát Vàng", "Solar", "03-sunken-dunes", "humanoid", "caster", H=196, build="giant", helm="hood", skirt="loin", weapon="astro_staff", offhand="orb",
         wings="crystal", wing_span=0.55, halo=True, crown=True, eye_rgb=(255, 230, 120),
         mats=M("Solar", skin=SKIN_DEEP, top=(236, 196, 80), skirt=(244, 238, 220), legs=SKIN_DEEP, arms=SKIN_DEEP, boots=(210, 160, 60), gloves=(236, 196, 80),
                belt=(40, 80, 160), metal=(250, 220, 110), accent=(40, 80, 160), grip=(120, 80, 40), hood=(40, 80, 160), wing=(70, 180, 170), crown=(250, 220, 110), pauldron=(236, 196, 80))),
    boss("leviathan_sovereign", "Chúa Tể Thủy Cung Thẳm Sâu", "Tide", "04-abyssal-sanctum", "serpent", None, S=230, fins=True, crown=True, horns=True, thick=0.11, head_r=0.10, rise=1.0,
         mats=M("Tide", body=(30, 90, 150), body2=(40, 110, 170), fin=(90, 220, 220), head=(34, 100, 160), mouth=(140, 30, 70), crown=(250, 214, 110), horn=(220, 236, 240)),
         eye_rgb=(255, 240, 140)),
    boss("vulcan_titan", "Đại Tướng Lò Rèn Dung Nham", "Pyre", "05-cinder-caldera", "humanoid", "heavy", H=200, build="giant", helm="horned", skirt="tabard", weapon="maul", cape_len=0.6,
         knee_guard=True, visor_glow=(255, 200, 80),
         mats=M("Pyre", skin=SKIN_DEEP, top=(80, 64, 66), skirt=(170, 50, 40), legs=(70, 56, 60), boots=(56, 46, 50), gloves=(90, 74, 76), belt=(250, 140, 50),
                metal=(110, 96, 100), accent=(255, 140, 50), grip=(70, 50, 44), cape=(150, 40, 36), pauldron=(120, 100, 104), horn=(240, 200, 120))),
    boss("nocturne_weaver", "Nữ Hoàng Nguyệt Ảnh Đêm Thâu", "Astral", "06-nocturne-veil", "arachne", "caster",
         spider=dict(S=150, kind="spider", mats=M("Astral", body=(54, 40, 80), abdomen=(70, 50, 110), legs=(44, 34, 66), head=(54, 40, 80), mark=(220, 150, 255), fang=(230, 220, 240)), eye_rgb=(230, 150, 255)),
         rider=dict(H=150, build="female", hair="long", skirt="none", weapon="crook", offhand="orb", crown=True, bust=True,
                    mats=M("Astral", skin=SKIN_PALE, hair=(210, 200, 236), top=(70, 50, 110), legs=(54, 40, 80), boots=(54, 40, 80), gloves=(230, 220, 250),
                           belt=(220, 170, 250), metal=(230, 210, 250), accent=(220, 150, 255), grip=(60, 44, 80), crown=(240, 200, 255)))),
    boss("astral_painter_seraphina", "TRÙM CUỐI — Vĩnh Dạ Quang Phổ Vương", "Astral", "07-aurora-zenith", "humanoid", "heavy", H=200, build="female", hair="long", skirt="robe",
         weapon="brush", wings="crystal", halo=True, bust=True,
         mats=M("Astral", skin=SKIN_FAIR, hair=(220, 220, 230), top=(60, 48, 70), skirt=(60, 48, 70), legs=SKIN_FAIR, boots=(70, 50, 60), gloves=(70, 56, 80),
                belt=(220, 170, 150), metal=(220, 200, 210), accent=(210, 160, 140), grip=(120, 90, 80), wing=(200, 220, 230), bristle=(236, 236, 240)),
         art={"battle": "seraphina-battle.png", "extra": {"astral_painter_seraphina-starblade.png": "seraphina-starblade.png"}}),
]


# ---------------------------------------------------------------- monsters (wild + human enemies)


def mon(id_, name, element, realm, rig, style=None, **spec):
    return enemy(id_, name, element, realm, rig, style, category="monsters", **spec)


MONSTERS = [
    mon("verdant_slime", "Chất Nhờn Mầm Xanh", "Verdant", "01-dawn-meadow", "blob", None, S=84, sprout=True,
        mats=M("Verdant", body=(110, 200, 110), core=(220, 255, 180), leaf=(70, 160, 70), flower=(250, 200, 220))),
    mon("briar_goblin", "Yêu Tinh Gai Bụi", "Verdant", "01-dawn-meadow", "humanoid", "dual", H=86, build="lean", hair="spiky", skirt="loin", weapon="dagger", offhand="dagger", head_scale=1.25,
        eye_rgb=(250, 230, 90), mats=M("Verdant", skin=(130, 170, 80), hair=(70, 90, 40), top=(110, 80, 56), skirt=(90, 64, 44), legs=(130, 170, 80), boots=(80, 60, 44),
                                       gloves=(130, 170, 80), belt=(150, 110, 60), metal=(180, 186, 190), accent=(120, 90, 50), grip=(80, 60, 40))),
    mon("highway_bandit", "Đạo Tặc Đường Rừng", "Verdant", "01-dawn-meadow", "humanoid", "dual", H=116, build="male", helm="hood", skirt="coat", weapon="dagger", offhand="dagger", kind="human",
        mats=M("Verdant", skin=SKIN_TAN, top=(90, 70, 60), skirt=(80, 60, 50), legs=(60, 56, 60), boots=(56, 40, 36), gloves=(70, 50, 40), belt=(130, 90, 50),
               metal=(190, 196, 204), accent=(160, 60, 50), grip=(70, 50, 40), hood=(110, 40, 40), cape=(110, 40, 40)), cape_len=0.45),
    mon("frost_wisp", "Linh Hồn Sương Giá", "Frost", "02-everfrost-peaks", "floater", None, S=112, kind="wisp", flames=True,
        mats=M("Frost", body=(180, 226, 250), head=(220, 244, 255), core=(255, 255, 255), flame=(140, 210, 250)), eye_rgb=(40, 80, 140)),
    mon("yeti_brute", "Người Tuyết Cuồng Nộ", "Frost", "02-everfrost-peaks", "humanoid", "fist", H=130, build="heavy", hair="mane", horns=True, eye_rgb=(70, 160, 230),
        mats=M("Frost", skin=(150, 170, 200), face=(150, 170, 200), top=(238, 240, 246), arms=(232, 236, 244), legs=(226, 230, 240), boots=(200, 206, 220),
               gloves=(150, 170, 200), hips=(226, 230, 240), neck=(238, 240, 246), hair=(240, 244, 250), horn=(190, 200, 210))),
    mon("sand_wyrm", "Sa Trùng Nuốt Cát", "Solar", "03-sunken-dunes", "serpent", None, S=140, thick=0.12, horns=True, head_r=0.11, rise=0.7,
        mats=M("Solar", body=(200, 160, 100), body2=(180, 140, 84), head=(190, 150, 90), mouth=(150, 50, 60), horn=(240, 230, 200)), eye_rgb=(40, 30, 30)),
    mon("tomb_mummy", "Xác Ướp Lăng Mộ", "Solar", "03-sunken-dunes", "humanoid", "fist", H=118, build="lean", hair="bald", eye_rgb=(250, 220, 90),
        mats=M("Solar", skin=(226, 214, 184), face=(226, 214, 184), top=(226, 214, 184), arms=(220, 208, 178), legs=(216, 204, 174), boots=(196, 184, 154),
               gloves=(226, 214, 184), belt=(60, 90, 170), neck=(220, 208, 178), crown=(240, 200, 80)), crown=True),
    mon("drowned_corsair", "Hải Tặc Chết Đuối", "Tide", "04-abyssal-sanctum", "humanoid", "blade", H=118, build="male", hair="long", skirt="coat", weapon="cutlass", kind="human",
        eye_rgb=(150, 250, 220), mats=M("Tide", skin=(120, 170, 160), hair=(40, 60, 60), top=(60, 80, 110), skirt=(50, 66, 96), legs=(90, 80, 70), boots=(50, 44, 44),
                                        gloves=(120, 170, 160), belt=(150, 110, 60), metal=(170, 190, 180), accent=(200, 170, 80), grip=(70, 50, 40))),
    mon("lantern_jelly", "Sứa Đèn Lồng", "Tide", "04-abyssal-sanctum", "floater", None, S=104, kind="jelly", hover=0.25,
        mats=M("Tide", body=(150, 210, 240), tentacle=(120, 180, 230), core=(255, 236, 150)), eye_rgb=(40, 60, 120)),
    mon("ember_imp", "Tiểu Quỷ Than Hồng", "Pyre", "05-cinder-caldera", "humanoid", "fist", H=84, build="lean", hair="bald", horns=True, tail=True, wings="bat", wing_span=0.5,
        head_scale=1.2, eye_rgb=(255, 236, 120),
        mats=M("Pyre", skin=(200, 70, 50), face=(200, 70, 50), top=(200, 70, 50), arms=(200, 70, 50), legs=(170, 56, 44), boots=(90, 40, 40), gloves=(90, 40, 40),
               hips=(90, 40, 40), horn=(250, 220, 170), wing=(120, 40, 40), tail=(170, 56, 44))),
    mon("lava_salamander", "Kỳ Nhông Dung Nham", "Pyre", "05-cinder-caldera", "quadruped", "pounce", S=96, tail="lizard", tail_len=0.6, tail_angle=-5, ears="none", spines=True,
        leg=0.6, body_len=0.7, chest_r=0.15, hip_r=0.14, belly_r=0.12, neck_len=0.14, neck_angle=15, head_r=0.10, snout=1.1, snout_r=0.6, width=0.13,
        mats=M("Pyre", body=(60, 50, 56), belly=(250, 140, 50), dark=(36, 30, 36), accent=(255, 170, 60), tail=(60, 50, 56)), eye_rgb=(255, 220, 90)),
    mon("dusk_bat", "Dơi Hoàng Hôn", "Astral", "06-nocturne-veil", "flyer", None, S=126, kind="bat", body_r=0.11, head_r=0.08, wing_span=0.55,
        mats=M("Astral", body=(70, 50, 90), belly=(110, 80, 130), head=(80, 60, 100), wing=(110, 60, 140), wing_bone=(60, 40, 80))),
    mon("hollow_wraith", "U Hồn Rỗng", "Astral", "06-nocturne-veil", "floater", None, S=132, kind="wraith",
        mats=M("Astral", body=(70, 60, 100), head=(30, 24, 44), hood=(60, 50, 90), hand=(220, 210, 240), core=(200, 140, 255)), eye_rgb=(230, 170, 255)),
    mon("cult_acolyte", "Tín Đồ Nguyệt Thực", "Astral", "06-nocturne-veil", "humanoid", "caster", H=118, build="male", helm="hood", skirt="robe", weapon="staff", offhand="tome", kind="human",
        mats=M("Astral", skin=SKIN_PALE, top=(90, 40, 70), skirt=(70, 30, 56), legs=(50, 30, 50), boots=(40, 30, 40), gloves=(200, 190, 210), belt=(220, 180, 90),
               metal=(200, 190, 210), accent=(220, 180, 90), grip=(70, 50, 60), hood=(90, 40, 70))),
    mon("venom_spider", "Nhện Độc Rừng Thẳm", "Astral", "06-nocturne-veil", "arthropod", None, S=110, kind="spider",
        mats=M("Astral", body=(60, 56, 70), abdomen=(80, 70, 96), legs=(50, 46, 60), head=(60, 56, 70), mark=(170, 240, 110), fang=(220, 220, 220)), eye_rgb=(170, 255, 110)),
    mon("prism_moth", "Bướm Lăng Kính", "Astral", "07-aurora-zenith", "flyer", None, S=132, kind="moth", body_r=0.09, head_r=0.06, wing_span=0.5,
        mats=M("Astral", body=(220, 200, 240), head=(236, 220, 250), wing=(170, 220, 250), wing2=(240, 170, 230), legs=(160, 140, 200), glow=(255, 240, 180))),
    mon("star_sentinel", "Tinh Thạch Hộ Vệ", "Astral", "07-aurora-zenith", "humanoid", "polearm", H=132, build="golem", hair="bald", weapon="spear", halo=True, eye_rgb=(255, 250, 220),
        mats=golem_mats("Astral", (170, 150, 230), (120, 100, 190), (250, 230, 255), pauldron=(220, 200, 250), metal=(236, 230, 252), accent=(150, 230, 240), grip=(120, 100, 190))),
]


# ---------------------------------------------------------------- animals


def ani(id_, name, element, realm, rig, style=None, **spec):
    return enemy(id_, name, element, realm, rig, style, category="animals", **spec)


ANIMALS = [
    ani("chicken", "Gà Đồng", "Verdant", "01-dawn-meadow", "flyer", None, S=84, kind="chicken", perched=True, body_r=0.17, head_r=0.08, comb=True,
        mats=M("Verdant", body=(244, 240, 230), belly=(250, 248, 240), head=(244, 240, 230), wing=(226, 220, 206), tail=(200, 120, 60), beak=(240, 180, 60), comb=(220, 50, 50), feet=(240, 170, 60))),
    ani("sheep", "Cừu Bông", "Verdant", "01-dawn-meadow", "quadruped", "charge", S=84, wool=True, tail="puff", ears="floppy", head_r=0.09, snout=0.8, snout_r=0.55, leg=0.8,
        mats=M("Verdant", body=(240, 236, 228), wool=(246, 244, 238), head=(70, 60, 64), snout=(70, 60, 64), legs=(70, 60, 64), dark=(40, 34, 40), ear=(70, 60, 64), tail=(246, 244, 238))),
    ani("cow", "Bò Sữa", "Verdant", "01-dawn-meadow", "quadruped", "charge", S=112, tail="thin", ears="floppy", horns="cow", head_r=0.10, snout=1.0, snout_r=0.6, chest_r=0.19, hip_r=0.18, belly_r=0.17, leg=0.85,
        mats=M("Verdant", body=(244, 242, 236), belly=(250, 248, 244), head=(244, 242, 236), snout=(240, 190, 180), dark=(50, 44, 48), horn=(236, 226, 200), legs=(70, 60, 62))),
    ani("horse", "Ngựa Thảo Nguyên", "Verdant", "01-dawn-meadow", "quadruped", "rear", S=118, tail="thin", tail_angle=-30, ears="pointed", mane=0.07, neck_len=0.36, neck_angle=48,
        head_r=0.085, snout=1.7, snout_r=0.5, head_tilt=38, leg=1.2, chest_r=0.17, body_len=0.6,
        mats=M("Verdant", body=(140, 90, 56), belly=(160, 110, 70), dark=(50, 36, 30), mane=(50, 36, 30), tail=(50, 36, 30), hoof=(44, 34, 30))),
    ani("rabbit", "Thỏ Rừng", "Verdant", "01-dawn-meadow", "quadruped", "pounce", S=48, tail="puff", ears="long", head_r=0.13, snout=0.5, snout_r=0.6, leg=0.6, body_len=0.42, chest_r=0.15, hip_r=0.18,
        mats=M("Verdant", body=(190, 160, 130), belly=(240, 230, 214), dark=(80, 60, 50), tail=(250, 248, 240), ear=(190, 160, 130))),
    ani("red_fox", "Cáo Đỏ", "Verdant", "01-dawn-meadow", "quadruped", "pounce", S=76, tail="bushy", tail_angle=10, ears="pointed", head_r=0.10, snout=1.4, snout_r=0.45, leg=0.85,
        mats=M("Verdant", body=(220, 110, 50), belly=(250, 240, 226), dark=(50, 36, 36), tail=(220, 110, 50), tail_tip=(250, 246, 236), legs=(70, 44, 40))),
    ani("wild_boar", "Heo Rừng", "Verdant", "01-dawn-meadow", "quadruped", "charge", S=90, tail="thin", ears="pointed", tusks=True, mane=0.06, head_r=0.12, snout=1.0, snout_r=0.6, leg=0.7, chest_r=0.19,
        mats=M("Verdant", body=(110, 84, 70), belly=(130, 104, 86), dark=(50, 40, 38), mane=(70, 54, 46), horn=(240, 230, 210))),
    ani("mountain_goat", "Dê Núi", "Frost", "02-everfrost-peaks", "quadruped", "charge", S=88, tail="short", ears="pointed", horns="curved", head_r=0.09, snout=1.0, snout_r=0.5, leg=0.95,
        mats=M("Frost", body=(230, 226, 216), belly=(244, 240, 232), dark=(60, 56, 60), horn=(140, 120, 100), legs=(210, 206, 196))),
    ani("desert_camel", "Lạc Đà Sa Mạc", "Solar", "03-sunken-dunes", "quadruped", "charge", S=120, tail="thin", ears="round", hump=True, neck_len=0.40, neck_angle=35, head_r=0.08, snout=1.3, snout_r=0.5, leg=1.25,
        mats=M("Solar", body=(210, 170, 110), belly=(226, 190, 130), dark=(90, 66, 50), legs=(200, 160, 100))),
    ani("reef_crab", "Cua Rạn San Hô", "Tide", "04-abyssal-sanctum", "arthropod", None, S=80, kind="crab",
        mats=M("Tide", body=(230, 90, 70), belly=(250, 180, 150), legs=(210, 80, 64), claw=(240, 110, 80), eye=(30, 24, 30))),
    ani("sea_turtle", "Rùa Biển Cổ", "Tide", "04-abyssal-sanctum", "quadruped", "charge", S=88, shell=True, tail="short", ears="none", head_r=0.10, snout=0.8, snout_r=0.6, leg=0.45, leg_r=1.3,
        neck_len=0.16, neck_angle=10, body_len=0.45,
        mats=M("Tide", body=(120, 170, 110), belly=(200, 210, 150), dark=(50, 70, 50), shell=(110, 120, 70), legs=(120, 170, 110))),
    ani("snow_owl", "Cú Tuyết", "Frost", "02-everfrost-peaks", "flyer", None, S=84, kind="owl", perched=True, body_r=0.17, head_r=0.12,
        mats=M("Frost", body=(240, 242, 248), belly=(250, 250, 255), head=(240, 242, 248), face=(250, 250, 255), wing=(224, 228, 238), tail=(220, 224, 234), beak=(70, 60, 60), feet=(200, 190, 170))),
]

ALL_UNITS = HEROES + GATEKEEPERS + BOSSES + MONSTERS + ANIMALS
UNITS_BY_ID = {u["id"]: u for u in ALL_UNITS}

# Body textures that depend on the rig, not on the material name.
_RIG_TEX = {"blob": "skin", "floater": "skin", "serpent": "scale", "arthropod": "scale", "flyer": "fur"}
_BODY_KEYS = ("body", "body2", "belly", "head", "abdomen", "legs")


FURRY = {"meadow_stag", "snow_prowler", "luna_kitsune", "red_fox", "rabbit", "mountain_goat", "wild_boar", "sheep"}


def _apply_rig_textures():
    for u in ALL_UNITS:
        spec = u["spec"]
        if u["id"] in FURRY:
            spec["fur"] = True
        groups = [spec] + [spec[k] for k in ("mount", "rider", "spider") if k in spec]
        for i, g in enumerate(groups):
            rig = u["rig"]
            if "spider" in spec and g is spec["spider"]:
                rig = "arthropod"
            mats = g.get("mats", {})
            if rig in _RIG_TEX:
                for k in _BODY_KEYS:
                    if k in mats:
                        mats[k].tex = _RIG_TEX[rig]
            if g.get("build") == "golem":
                for m in mats.values():
                    if not m.glow and m.tex in ("skin", "cloth", "fur"):
                        m.tex = "stone"
            if u["id"] in ("sylvan_warden",):
                for k in ("pauldron", "hips", "hair"):
                    if k in mats:
                        mats[k].tex = "leaf"


_apply_rig_textures()
