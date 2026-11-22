r"""Build the complete Multi-Frame Gen 3 Pixel Asset Bundle + Canonical JSON Data
for Astral Expedition Pixel (`006-astral-expedition-pixel`).

Example (run from repo root):
    .\.venv\Scripts\python.exe tools/expedition/build_bundle.py
"""

import argparse
import hashlib
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
PYDEPS = os.path.abspath(os.path.join(HERE, "..", "units", ".pydeps"))
for p in (PYDEPS, HERE):
    if os.path.isdir(p) and p not in sys.path:
        sys.path.insert(0, p)

from PIL import Image  # noqa: E402
from pixel_sprites import (  # noqa: E402
    HERO_VISUALS,
    render_skill_vfx_pair,
    render_summon_orb_sheet,
)
from visual_kit import combat_kit, hud_kit, landmark_sheets  # noqa: E402
from pixel_worlds import (  # noqa: E402
    build_and_verify_tmj,
    render_battle_scene_layers,
    render_tileset_and_anim,
)

BOSSES_SPEC = [
    ("sylvan_warden", "Verdant", False),
    ("boreal_chevalier", "Frost", False),
    ("chronos_khepri", "Solar", False),
    ("leviathan_sovereign", "Tide", False),
    ("vulcan_titan", "Pyre", False),
    ("nocturne_weaver", "Astral", False),
    ("astral_painter_seraphina", "Astral", True),
]

GATEKEEPER_ARCHETYPES = [
    ("meadow_stag", "Verdant"),
    ("moss_sentinel", "Verdant"),
    ("gale_wolf", "Verdant"),
    ("frost_golem", "Frost"),
    ("snow_prowler", "Frost"),
    ("glacier_lancer", "Frost"),
    ("dune_scorpio", "Solar"),
    ("sun_ushabti", "Solar"),
    ("mirage_raider", "Solar"),
    ("abyss_serpent", "Tide"),
    ("coral_warden", "Tide"),
    ("kraken_spawn", "Tide"),
    ("magma_automaton", "Pyre"),
    ("cinder_drake", "Pyre"),
    ("forge_executioner", "Pyre"),
    ("night_stalker", "Astral"),
    ("luna_kitsune", "Astral"),
    ("eclipse_judge", "Astral"),
    ("aurora_archon_left", "Astral"),
    ("aurora_archon_right", "Astral"),
]

REALMS_LAYOUT = [
    {
        "mapId": "01-dawn-meadow",
        "theme": "meadow",
        "width": 120,
        "height": 76,
        "spawn": {"x": 4, "y": 12},
        "bossAltar": {"x": 111, "y": 12, "bossId": "sylvan_warden"},
        "exitPortal": {"x": 115, "y": 12, "toMapId": "02-everfrost-peaks", "requiresBossId": "sylvan_warden"},
        "restAnchors": [{"anchorId": "meadow_anchor_1", "x": 8, "y": 12}, {"anchorId": "meadow_anchor_2", "x": 47, "y": 24},
                        {"anchorId": "meadow_anchor_3", "x": 79, "y": 55}, {"anchorId": "meadow_anchor_4", "x": 108, "y": 46}],
        "chests": [{"chestId": "meadow_chest_1", "x": 14, "y": 6}, {"chestId": "meadow_chest_2", "x": 32, "y": 28},
                   {"chestId": "meadow_chest_3", "x": 73, "y": 28}, {"chestId": "meadow_chest_4", "x": 16, "y": 60},
                   {"chestId": "meadow_chest_5", "x": 50, "y": 68}, {"chestId": "meadow_chest_6", "x": 106, "y": 66}],
        "traversal": [
            {"id": "ladder-bank", "kind": "ladder", "from": [16, 30], "to": [16, 23]},
            {"id": "grip-ridge", "kind": "grip", "from": [43, 44], "to": [46, 44]},
            {"id": "rope-fen", "kind": "rope", "from": [73, 55], "to": [82, 61]},
            {"id": "ladder-ruin", "kind": "ladder", "from": [107, 28], "to": [107, 22]},
            {"id": "rope-north", "kind": "rope", "from": [40, 9], "to": [50, 9]},
            {"id": "grip-quarry", "kind": "grip", "from": [102, 58], "to": [106, 58]},
        ],
        "wildSpots": [[10,17],[25,7],[43,13],[32,23],[86,27],[17,49],[53,52],[99,56]],
        "gks": [
            {"gkId": "01-dawn-meadow_gk_1", "x": 28, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[29, 11], [29, 12], [29, 13]]},
            {"gkId": "01-dawn-meadow_gk_2", "x": 61, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[62, 11], [62, 12], [62, 13]]},
            {"gkId": "01-dawn-meadow_gk_3", "x": 93, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[94, 11], [94, 12], [94, 13]]},
        ],
    },
    {
        "mapId": "02-everfrost-peaks",
        "theme": "snow",
        "width": 52,
        "height": 25,
        "spawn": {"x": 4, "y": 12},
        "backPortal": {"x": 2, "y": 12, "toMapId": "01-dawn-meadow"},
        "bossAltar": {"x": 46, "y": 12, "bossId": "boreal_chevalier"},
        "exitPortal": {"x": 49, "y": 12, "toMapId": "03-sunken-dunes", "requiresBossId": "boreal_chevalier"},
        "restAnchors": [{"anchorId": "snow_anchor_1", "x": 8, "y": 12}, {"anchorId": "snow_anchor_2", "x": 34, "y": 18}],
        "chests": [{"chestId": "snow_chest_1", "x": 15, "y": 18}, {"chestId": "snow_chest_2", "x": 27, "y": 6}],
        "gks": [
            {"gkId": "02-everfrost-peaks_gk_1", "x": 18, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[19, 11], [19, 12], [19, 13]]},
            {"gkId": "02-everfrost-peaks_gk_2", "x": 30, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[31, 11], [31, 12], [31, 13]]},
            {"gkId": "02-everfrost-peaks_gk_3", "x": 40, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[41, 11], [41, 12], [41, 13]]},
        ],
    },
    {
        "mapId": "03-sunken-dunes",
        "theme": "desert",
        "width": 52,
        "height": 25,
        "spawn": {"x": 4, "y": 12},
        "backPortal": {"x": 2, "y": 12, "toMapId": "02-everfrost-peaks"},
        "bossAltar": {"x": 46, "y": 12, "bossId": "chronos_khepri"},
        "exitPortal": {"x": 49, "y": 12, "toMapId": "04-abyssal-sanctum", "requiresBossId": "chronos_khepri"},
        "restAnchors": [{"anchorId": "desert_anchor_1", "x": 8, "y": 12}, {"anchorId": "desert_anchor_2", "x": 34, "y": 6}],
        "chests": [{"chestId": "desert_chest_1", "x": 14, "y": 6}, {"chestId": "desert_chest_2", "x": 26, "y": 18}],
        "gks": [
            {"gkId": "03-sunken-dunes_gk_1", "x": 18, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[19, 11], [19, 12], [19, 13]]},
            {"gkId": "03-sunken-dunes_gk_2", "x": 30, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[31, 11], [31, 12], [31, 13]]},
            {"gkId": "03-sunken-dunes_gk_3", "x": 40, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[41, 11], [41, 12], [41, 13]]},
        ],
    },
    {
        "mapId": "04-abyssal-sanctum",
        "theme": "underwater",
        "width": 52,
        "height": 25,
        "spawn": {"x": 4, "y": 12},
        "backPortal": {"x": 2, "y": 12, "toMapId": "03-sunken-dunes"},
        "bossAltar": {"x": 46, "y": 12, "bossId": "leviathan_sovereign"},
        "exitPortal": {"x": 49, "y": 12, "toMapId": "05-cinder-caldera", "requiresBossId": "leviathan_sovereign"},
        "restAnchors": [{"anchorId": "abyss_anchor_1", "x": 8, "y": 12}, {"anchorId": "abyss_anchor_2", "x": 34, "y": 18}],
        "chests": [{"chestId": "abyss_chest_1", "x": 15, "y": 18}, {"chestId": "abyss_chest_2", "x": 27, "y": 6}],
        "gks": [
            {"gkId": "04-abyssal-sanctum_gk_1", "x": 18, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[19, 11], [19, 12], [19, 13]]},
            {"gkId": "04-abyssal-sanctum_gk_2", "x": 30, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[31, 11], [31, 12], [31, 13]]},
            {"gkId": "04-abyssal-sanctum_gk_3", "x": 40, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[41, 11], [41, 12], [41, 13]]},
        ],
    },
    {
        "mapId": "05-cinder-caldera",
        "theme": "volcano",
        "width": 52,
        "height": 25,
        "spawn": {"x": 4, "y": 12},
        "backPortal": {"x": 2, "y": 12, "toMapId": "04-abyssal-sanctum"},
        "bossAltar": {"x": 46, "y": 12, "bossId": "vulcan_titan"},
        "exitPortal": {"x": 49, "y": 12, "toMapId": "06-nocturne-veil", "requiresBossId": "vulcan_titan"},
        "restAnchors": [{"anchorId": "volcano_anchor_1", "x": 8, "y": 12}, {"anchorId": "volcano_anchor_2", "x": 34, "y": 6}],
        "chests": [{"chestId": "volcano_chest_1", "x": 14, "y": 6}, {"chestId": "volcano_chest_2", "x": 26, "y": 18}],
        "gks": [
            {"gkId": "05-cinder-caldera_gk_1", "x": 18, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[19, 11], [19, 12], [19, 13]]},
            {"gkId": "05-cinder-caldera_gk_2", "x": 30, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[31, 11], [31, 12], [31, 13]]},
            {"gkId": "05-cinder-caldera_gk_3", "x": 40, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[41, 11], [41, 12], [41, 13]]},
        ],
    },
    {
        "mapId": "06-nocturne-veil",
        "theme": "night",
        "width": 52,
        "height": 25,
        "spawn": {"x": 4, "y": 12},
        "backPortal": {"x": 2, "y": 12, "toMapId": "05-cinder-caldera"},
        "bossAltar": {"x": 46, "y": 12, "bossId": "nocturne_weaver"},
        "exitPortal": {"x": 49, "y": 12, "toMapId": "07-aurora-zenith", "requiresBossId": "nocturne_weaver"},
        "restAnchors": [{"anchorId": "night_anchor_1", "x": 8, "y": 12}, {"anchorId": "night_anchor_2", "x": 34, "y": 18}],
        "chests": [{"chestId": "night_chest_1", "x": 15, "y": 18}, {"chestId": "night_chest_2", "x": 27, "y": 6}],
        "gks": [
            {"gkId": "06-nocturne-veil_gk_1", "x": 18, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[19, 11], [19, 12], [19, 13]]},
            {"gkId": "06-nocturne-veil_gk_2", "x": 30, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[31, 11], [31, 12], [31, 13]]},
            {"gkId": "06-nocturne-veil_gk_3", "x": 40, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[41, 11], [41, 12], [41, 13]]},
        ],
    },
    {
        "mapId": "07-aurora-zenith",
        "theme": "aurora",
        "width": 52,
        "height": 25,
        "spawn": {"x": 4, "y": 12},
        "backPortal": {"x": 2, "y": 12, "toMapId": "06-nocturne-veil"},
        "bossAltar": {"x": 46, "y": 12, "bossId": "astral_painter_seraphina"},
        "restAnchors": [{"anchorId": "aurora_anchor_1", "x": 8, "y": 12}, {"anchorId": "aurora_anchor_2", "x": 29, "y": 6}],
        "chests": [{"chestId": "aurora_chest_1", "x": 15, "y": 6}, {"chestId": "aurora_chest_2", "x": 29, "y": 18}],
        "gks": [
            {"gkId": "07-aurora-zenith_gk_1", "x": 22, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[23, 11], [23, 12], [23, 13]]},
            {"gkId": "07-aurora-zenith_gk_2", "x": 36, "y": 12, "aggroRadius": 3, "gateBarrierTiles": [[37, 11], [37, 12], [37, 13]]},
        ],
    },
]


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Build complete Astral Expedition Pixel asset bundle.")
    parser.parse_args()

    out_root = os.path.join(REPO, "database-astral-expedition")
    data_root = os.path.join(REPO, "data", "expedition")
    maps_spec_root = os.path.join(REPO, "assets", "maps")
    for sub in (
        "units/heroes",
        "units/gatekeepers",
        "units/bosses",
        "vfx/skills",
        "battle-scenes",
        "overworld",
        "structures",
        "maps",
        "ui/gacha",
    ):
        os.makedirs(os.path.join(out_root, sub), exist_ok=True)
    os.makedirs(data_root, exist_ok=True)
    os.makedirs(maps_spec_root, exist_ok=True)

    # 1-3. Every unit sheet (12 heroes, 20 gatekeepers, 7 bosses, monsters, animals) comes from
    # tools/expedition/build_units.py: 3D rig roster (roster.py) + the hand-drawn atlases of
    # art-source/motion/ (roster `art`), which replace the rig output for those units.
    from build_units import build_unit, write_catalog
    from roster import ALL_UNITS

    for unit in ALL_UNITS:
        build_unit(unit["id"])
    write_catalog()

    # 4. Elemental Skill VFX Archetypes (6 elements x 5 styles = 30 pairs -> mapped cleanly across all 60 skills!)
    for el in ("Verdant", "Frost", "Solar", "Tide", "Pyre", "Astral"):
        for style in ("slash", "ray", "meteor", "wave", "sigil"):
            cast_im, fx_im = render_skill_vfx_pair(el, style)
            key = f"{el.lower()}_{style}"
            cast_im.save(os.path.join(out_root, "vfx", "skills", f"{key}-cast.png"))
            fx_im.save(os.path.join(out_root, "vfx", "skills", f"{key}-effect.png"))

    # 5. 7 Animated Battle Scenes + 7 Animated Overworld Tilesets + 7 Tiled .tmj Maps
    for realm in REALMS_LAYOUT:
        map_id = realm["mapId"]
        theme = realm["theme"]

        sc_dir = os.path.join(out_root, "battle-scenes", map_id)
        os.makedirs(sc_dir, exist_ok=True)
        bg_im, anim_im = render_battle_scene_layers(theme)
        bg_im.save(os.path.join(sc_dir, "backdrop.png"))
        anim_im.save(os.path.join(sc_dir, "ambient-anim.png"))

        ts_im, ts_anim = render_tileset_and_anim(theme)
        ts_im.save(os.path.join(out_root, "overworld", f"{theme}-tileset.png"))
        ts_anim.save(os.path.join(out_root, "overworld", f"{theme}-anim.png"))

        # Author Map Spec JSON + export verified Tiled .tmj
        spec_dir = os.path.join(maps_spec_root, map_id)
        os.makedirs(spec_dir, exist_ok=True)
        with open(os.path.join(spec_dir, f"{map_id}.map.json"), "w", encoding="utf-8") as f:
            json.dump(realm, f, ensure_ascii=False, indent=2)

        tmj = build_and_verify_tmj(realm, realm["gks"])
        out_map_dir = os.path.join(out_root, "maps", map_id)
        os.makedirs(out_map_dir, exist_ok=True)
        with open(os.path.join(out_map_dir, f"{map_id}.tmj"), "w", encoding="utf-8", newline="\n") as f:
            json.dump(tmj, f, ensure_ascii=False, indent=2)

    # 6. Signature Silhouette Structures & Gacha Summon Orb & UI Kit
    for relative, image in landmark_sheets():
        target = os.path.join(out_root, relative)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        image.save(target)

    render_summon_orb_sheet().save(os.path.join(out_root, "ui", "gacha", "astral-orb.png"))
    hud_kit().save(os.path.join(out_root, "ui", "hud-kit.png"))
    combat_kit().save(os.path.join(out_root, "ui", "combat-kit.png"))

    # 7. Export Canonical JSON Data in data/expedition/
    with open(os.path.join(data_root, "realms.json"), "w", encoding="utf-8") as f:
        json.dump(REALMS_LAYOUT, f, ensure_ascii=False, indent=2)
    with open(os.path.join(data_root, "heroes.json"), "w", encoding="utf-8") as f:
        json.dump(list(HERO_VISUALS.keys()), f, ensure_ascii=False, indent=2)
    with open(os.path.join(data_root, "bosses.json"), "w", encoding="utf-8") as f:
        json.dump([{"bossId": b[0], "element": b[1], "isFinal": b[2]} for b in BOSSES_SPEC], f, ensure_ascii=False, indent=2)

    # 8. SHA-256 manifest.json (hand-drawn art-source/motion/ sheets were already copied in step 1-3).
    files_manifest = {}
    for root, dirs, files in os.walk(out_root):
        if root == out_root and "art-source" in dirs:
            dirs.remove("art-source")
        for fn in sorted(files):
            if fn == "manifest.json":
                continue
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, out_root).replace("\\", "/")
            entry = {"sha256": sha256_file(full), "bytes": os.path.getsize(full)}
            if fn.endswith(".png"):
                with Image.open(full) as im:
                    entry["width"] = im.width
                    entry["height"] = im.height
            files_manifest[rel] = entry

    manifest = {
        "bundle": "astral-expedition-pixel",
        "version": "1.0.0",
        "heroCount": len(HERO_VISUALS),
        "bossCount": len(BOSSES_SPEC),
        "realmCount": len(REALMS_LAYOUT),
        "gatekeeperArchetypes": len(GATEKEEPER_ARCHETYPES),
        "totalFiles": len(files_manifest),
        "files": files_manifest,
    }
    with open(os.path.join(out_root, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    from build_units import update_manifest

    update_manifest()  # monsterCount / animalCount / unitCount + units/ entries
    from art_source import export as export_art, mapping as art_mapping
    from export_charm_icons import publish as publish_charm_icons
    from export_weapon_icons import publish as publish_weapon_icons
    from export_status_icons import publish as publish_status_icons

    for domain in ("ui", "vfx"):  # art-source/<domain>/*-source.png win over the code drawings (1-1)
        export_art(art_mapping(domain))
    publish_charm_icons()
    publish_weapon_icons()
    publish_status_icons()

    print(
        f"Built Astral Expedition bundle: {len(HERO_VISUALS)} Heroes (36f battle + 48f move), "
        f"{len(BOSSES_SPEC)} Bosses (36f 256x256), {len(REALMS_LAYOUT)} Animated Realms, "
        f"{len(files_manifest)} verified files."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
