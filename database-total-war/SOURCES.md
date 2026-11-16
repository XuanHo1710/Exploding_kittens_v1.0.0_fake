# Open-Source Reference & Historical Dataset Provenance (`database-total-war/opensource/`)

This directory curates open-source historical data, unit/structure/technology simulation templates, portraits/icons, music, and RTS steering/formation/pathfinding reference implementations for **Tam Quốc Toàn Chiến (Total War: Three Kingdoms)**.

---

## 1. `han_china/` — 0 A.D. Han China RTS Civilization Mod

- **Repository URL**: `https://github.com/0ADMods/han_china.git`
- **Commit SHA**: `8fe9d2834608e32b89bd0f6ddc6943fee97df8bb` (`2022-02-17`)
- **Licenses**:
  - **Code / Simulation Data (`license.txt`)**: `GPL-2.0-or-later` (GNU General Public License v2.0+)
  - **Art / Textures / Audio (`art/license.txt`)**: `CC-BY-SA-3.0` (Creative Commons Attribution-ShareAlike 3.0)
- **Attribution**:
  - Original Authors: *The Council of Modders, Fallen Empire Studio, Scion Development*
  - Engine & Base Framework: *Wildfire Games (`http://www.wildfiregames.com/`)*
  - License Link: `http://creativecommons.org/licenses/by-sa/3.0/`
- **Extracted Directories & Files (577 files, ~12.69 MB)**:
  - `simulation/data/civs/han.json` — Han Dynasty civilization definition, starting entities, imperial ruler names, soundtrack bindings.
  - `simulation/templates/units/han/` — 57 XML unit templates covering Han spearmen (*Máo Bīng*), halberdiers (*Jǐ Bīng*), swordsmen (*Dāo Bīng*), archers (*Shè Shǒu*), crossbowmen (*Nǔ Shǒu*), cavalry, elite champions (*Hǔ Bēn*, *Yǔ Lín*, *Wu Wei Guard*, *Sun Wu Trouble Freeing Forces*), heroes (*Liú Bāng*, *Hán Xìn*, *Wèi Qīng*), siege engines (*Tóushí Chē*, *Nǔ Chē*, *Gōngchéng Chuí*, *Gōngchéng Tǎ*), and warships including Chibi fire ships (*Huǒ Chuán*) & tower ships (*Lóu Chuán*).
  - `simulation/templates/structures/han/` — 40 Han military, civic, fortification, and economic structure templates.
  - `simulation/data/technologies/` & `simulation/data/auras/` — 25 Han technologies (e.g., *Art of War*, *Crossbow Tradition*, *Silk Road*, *Poison Arrows*) and 16 hero/minister/structure auras.
  - `art/textures/ui/` — Session UI icons, Chinese faction emblem (`emblem_chinese.png`), unit/structure/technology portraits, aura badges, and `art/textures/ui/shields/` (6 Han `.dds` shield textures converted via Pillow to RGBA `.png` plus `sh_c07.png`, `banner_han.png`, `garrison_flag_han.png`, `han_sail_dragon.png`, `prop_swords_han.png`, `han_xin.png`).
  - `art/actors/`, `art/variants/`, `art/particles/`, `art/material/` — Complete XML actor & variant definitions (3D `.dae` meshes and heavy skin `.dds` sheets omitted to keep total size compact).
  - `audio/music/` — 2 Han Dynasty ambient peace tracks (`hill_of_sorrows.ogg`, `red_dawn.ogg`).
  - `gui/`, `mod.json`, `readme.md`, `license.txt`, `art/license.txt`.

---

## 2. `twtk_map/` — Total War: Three Kingdoms Interactive Campaign & Strategic Map

- **Repository URL**: `https://github.com/IMRZ/twtk-interactive-map.git`
- **Commit SHA**: `2a6df04b5cc5836d1e70298da6d3864090b79384` (`2026-02-19`)
- **License**: `MIT` (`LICENSE`, Copyright (c) 2019–2020 IMRZ)
- **Extracted Directories & Files (161 files, ~1.66 MB)**:
  - `src/data/common/campaigns.json` — 4 historical start dates (`182 Mandate of Heaven`, `190 Rise of the Warlords`, `194 A World Betrayed`, `291 Eight Princes`).
  - `src/data/common/regions.json` & `fertility.json` — 201 Three Kingdoms settlements, commanderies/provinces, coordinates, resource specialties, and agricultural fertility tiers (including Pingyuan, Chibi, Hulao Pass, Chenliu/Guandu corridor, Xiangyang/Linju-Jiangling/Changban corridor).
  - `src/data/startpos/*.json` — Starting positions, faction keys, map pin coordinates, and historical biographies for 38 playable warlords across 4 eras.
  - `src/assets/icons/*.png` — 21 hydrated RGBA PNG settlement & specialty resource icons (`city`, `gate_pass`, `iron`, `horses`, `jade`, `silk`, `tea`, `spice`, `salt`, `copper`, `farms`, `lumber`, `trade_port`, etc.).
  - `src/assets/characters/*/{mini.png, bobble.png}` — 77 hydrated RGBA PNG warlord portraits (`Cao Cao`, `Liu Bei`, `Sun Jian`, `Sun Ce`, `Lü Bu`, `Dong Zhuo`, `Yuan Shao`, `Yuan Shu`, `Gongsun Zan`, `Ma Teng`, `Liu Biao`, `Kong Rong`, `Tao Qian`, `Zhang Jue`, `Meng Huo`, `Lady Zhurong`, etc.).
  - `src/store/`, `src/components/`, `src/config/`, `public/locales/en.json`, `package.json`, `tsconfig.json`, `LICENSE`, `README.md` (oversized ~20 MB Git LFS background map/video blobs intentionally omitted).

---

## 3. `yuka_steering/` — Yuka Game AI Steering, Formations, Boids & Pathfinding Reference

- **Repository URL**: `https://github.com/Mugen87/yuka.git`
- **Commit SHA**: `10591304811222d6856020d5de129b39ef43b58d` (`2023-01-16`)
- **License**: `MIT` (`LICENSE`, Copyright (c) 2023 Yuka authors)
- **Extracted Directories & Files (71 files, ~0.36 MB)**:
  - `src/steering/` — Autonomous `Vehicle` agent, `SteeringManager`, `Path`, `Smoother`, and 13 steering behaviors including `OffsetPursuitBehavior.js` (leader-relative formation slots), `SeparationBehavior.js`, `AlignmentBehavior.js`, `CohesionBehavior.js` (boids crowd flocking), `FollowPathBehavior.js`, `ObstacleAvoidanceBehavior.js`, `ArriveBehavior.js`, and `SeekBehavior.js`.
  - `src/navigation/` & `src/graph/` — `NavMesh`, `Corridor`, `AStar.js`, `Dijkstra.js`, and graph search primitives.
  - `src/partitioning/` — `CellSpacePartitioning.js` spatial hash grid for $O(1)$ local neighbor queries in large RTS regiments.
  - `src/math/`, `src/core/`, `examples/steering/offsetPursuit/`, `examples/steering/flocking/`.

---

## 4. `tw3k_historical_db.json` — Unified Tam Quốc Toàn Chiến Historical & Unit Database

- **Generated File**: `tw3k_historical_db.json` (~191 KB)
- **Contents**:
  - `campaigns` (4 start dates with bilingual Vietnamese/English titles)
  - `featuredBattlefields` (5 core tactical battlefields: **Pingyuan / Bình Nguyên**, **Guandu / Quan Độ**, **Changban / Trường Bản**, **Chibi / Xích Bích**, and **Hulao Pass / Hổ Lao Quan** linked to TWTK region keys & coordinates)
  - `warlords` (38 historical warlords with Vietnamese Tam Quốc names & titles, Wu Xing elements, campaign start coordinates, and portrait paths)
  - `regions` (201 settlements/commanderies with coordinates, resources, fertility, and icon paths)
  - `hanCivilization` (57 resolved Han unit templates with inherited stats/icons/actors & bilingual Vietnamese/Chinese names, 25 technologies, 16 auras, 40 structures, 13 shield/banner PNGs, and 2 soundtrack OGG references)
  - `steeringReference` (module map into `yuka_steering/src/` for RTS regiment movement & formation steering)

---

## 5. `portraits/` & Historical Woodblock / Silk-Scroll Portrait References

- **Source Repository**: Wikimedia Commons (`https://commons.wikimedia.org/`) — Classical Ming/Qing *Sancai Tuhui* (*Tam Tài Đồ Hội*, 1609), *Wanxiaotang Zhuanren Huazhuan* (*Vãn Tiếu Đường Trúc Trang Họa Truyện* by Shangguan Zhou, 1743), and Palace Museum imperial scroll portraits.
- **License**: `Public Domain` (`PD-Old-100` / `PD-Art` / `CC0-1.0`) — works of classical Chinese portrait painters deceased >100 years ago, composited with original Thủy Mặc Xuan-paper ink-wash brush strokes, Han lamellar armor overlays, and Wu Xing element medallions in `database-total-war/portraits/` (`24` RGBA PNGs: `12` `160×320` general cards + `12` `96×96` floating battle medallions).
