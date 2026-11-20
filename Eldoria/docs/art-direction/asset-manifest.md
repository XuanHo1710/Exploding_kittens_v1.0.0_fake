# Master Asset Manifest — Eldoria: Forgotten Wilds

**Trạng thái**: Hoàn thiện (Asset Registry Baseline v1.0)  
**Chế độ**: `DESIGN_AND_PLANNING_ONLY`  
**Cập nhật lần cuối**: 2026-11-19  
**Tham chiếu nguồn chuẩn (Single Source of Truth)**: [Constitution](../../.specify/memory/constitution.md) · [00-game-vision.md](../game-design/00-game-vision.md) · [characters.json](../../game-data/characters.json) · [skills.json](../../game-data/skills.json) · [monsters.json](../../game-data/monsters.json) · [bosses.json](../../game-data/bosses.json) · [items.json](../../game-data/items.json) · [buildings.json](../../game-data/buildings.json) · [crops.json](../../game-data/crops.json) · [animals.json](../../game-data/animals.json)  
**Visual Concept References**:
- [Greenhaven Village Concept](concepts/greenhaven-village-concept.jpg)
- [Whispering Forest Combat Concept](concepts/whispering-forest-combat-concept.jpg)
- [Mossroot Hollow Boss Arena Concept](concepts/dungeon-boss-arena-concept.jpg)
- [Starter Heroes Sheet Concept](concepts/starter-heroes-sheet-concept.jpg)

---

## 1. Kiến trúc Lưu trữ Tài nguyên Cục bộ (Local `assets/` + Local Docker MinIO S3-Compatible Bucket)

Tuân thủ **Nguyên tắc I (Hiến pháp v2.0.0 & `ADR-007`)**: toàn bộ tài nguyên đồ họa 2D pixel art, bản đồ, hiệu ứng, phông chữ và âm thanh của **Eldoria: Forgotten Wilds** được quản lý gốc tại thư mục `assets/` và đồng bộ tự động (qua container `minio-init`) lên **Local Docker MinIO (`eldoria-assets` bucket, prefix phiên bản `v1/`)** chạy trên `http://localhost:9000/eldoria-assets` kèm dự phòng trực tiếp `/assets/` khi chạy chế độ không Docker (`ASSET_STORAGE_MODE=local_fs`).

### 1.1 Cây Thư mục Tài nguyên Chuẩn (`assets/` ↔ MinIO `eldoria-assets/v1/`)
```text
assets/
├── manifest.json                 # Bảng chỉ mục asset tự động sinh lúc build kèm SHA-256 content hash
├── sprites/
│   ├── characters/               # 12 anh hùng (chr_*.png + chr_*.json TexturePacker/Phaser Atlas)
│   ├── monsters/                 # 30 quái thường + 8 elite (chia atlas theo Region)
│   ├── bosses/                   # 5 Boss lớn 128x128..256x256 (mỗi Boss 1 atlas riêng)
│   ├── npcs/                     # NPC làng & thương nhân (npc_*.png)
│   ├── animals/                  # 6 vật nuôi (anm_* — Baby + Adult 4 hướng)
│   ├── crops/                    # 15 cây trồng (68 stage sprites trong atlas theo mùa/nhóm)
│   ├── buildings/                # 13 công trình (43 biến thể cấp độ Lv1..Lv4)
│   └── props/                    # Cây chặt gỗ, vỉa quặng, rương, trụ phá hủy được, bàn chế tạo
├── tilesets/                     # Tileset đã extrude 1px + margin 2px + spacing 4px (.png + .tsj)
├── maps/                         # Bản đồ Tiled JSON (.tmj) dùng chung giữa Client & Server
├── vfx/                          # Sprite sheet VFX kỹ năng, 12 Ultimates, Boss Telegraphs, hạt pixel
├── icons/                        # 157 item icons (wpn/eqp/mat/csm/sed) + 60 skill icons + status/currency
├── ui/
│   ├── portraits/                # 12 chân dung anh hùng 128x128 (khớp characters.json visualSpec)
│   ├── panels/                   # Khung 9-slice, thanh HP/MP/Stamina/Poise, viền Rarity
│   ├── banners/                  # Ảnh minh họa Gacha Banner (bnr_perm_heroes, bnr_perm_arsenal, ...)
│   └── cursors/                  # Con trỏ chuột pixel (default, attack, gather, build, interact)
├── audio/
│   ├── audio-manifest.json       # Metadata loopStartMs / loopEndMs chống tiếng tách vòng lặp
│   ├── bgm/                      # Nhạc nền (.ogg chính + .mp3 dự phòng)
│   ├── sfx/                      # SFX Combat, Gathering, Blacksmith +1..+10, Gacha (.ogg + .mp3)
│   ├── ambience/                 # Âm thanh không gian & thời tiết (.ogg + .mp3)
│   └── ui/                       # Âm thanh giao diện (.ogg + .mp3)
└── fonts/                        # Font pixel nội địa hóa Tiếng Việt đầy đủ dấu (SIL_OFL_LOCAL_FONT)
```

### 1.2 Phương án Đã Loại bỏ (Rejected Alternatives — Tuân thủ Hiến pháp v2.0.0)
- **Amazon S3 Cloud / Cloudflare R2 / Google Cloud Storage + CDN trả phí bên thứ ba**: **BỊ TỪ CHỐI TUYỆT ĐỐI**. Vi phạm Nguyên tắc I (0 dịch vụ đám mây bên thứ ba). Chỉ sử dụng **Local Docker MinIO** tự vận hành cục bộ (`eldoria-assets`, `Cache-Control: public, max-age=31536000, immutable` cho prefix `v1/` kèm mã băm SHA-256).
- **Google Fonts / CDN Font ngoài**: **BỊ TỪ CHỐI**. Mọi font chữ pixel hỗ trợ Tiếng Việt được tải bản quyền mở `SIL_OFL_LOCAL_FONT` về lưu cố định trong `assets/fonts/` (và đồng bộ lên `eldoria-assets/v1/fonts/`).

---

## 2. Bảng Đối soát Tổng hợp Danh mục Nội dung (`game-data/*.json` Reconciliation)

Toàn bộ số liệu dưới đây đã được đối soát trực tiếp với các tệp nguồn chuẩn `game-data/*.json`:

| Nhóm Nội dung | Tiền tố ID | Tổng Số lượng (Dài hạn) | Wave 1 (M1 MVP) | Post-MVP (M2–M5) | Nguồn Dữ liệu Chuẩn |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Playable Characters** | `chr_*` | `12` | `3` | `9` | `game-data/characters.json` |
| **Character Portraits** | `chr_*` | `12` | `3` | `9` | `game-data/characters.json` |
| **Combat Skills (Icon + VFX + SFX)** | `skl_*` | `60` | `15` | `45` | `game-data/skills.json` |
| **Regular Monsters** | `mob_*` | `30` | `8` | `22` | `game-data/monsters.json` |
| **Elite Monsters** | `mob_elite_*` | `8` | `1` | `7` | `game-data/monsters.json` |
| **Dungeon Bosses** | `boss_*` | `5` | `1` | `4` | `game-data/bosses.json` |
| **Weapons (Icons + In-hand Overlay)** | `wpn_*` | `40` | `10` | `30` | `game-data/items.json` |
| **Armor & Accessories (Icons)** | `eqp_*` | `40` | `12` | `28` | `game-data/items.json` |
| **Materials (Icons)** | `mat_*` | `50` | `29` | `21` | `game-data/items.json` |
| **Consumables (Icons)** | `csm_*` | `12` | `11` | `1` | `game-data/items.json` |
| **Seeds (Icons)** | `sed_*` | `15` | `5` | `10` | `game-data/items.json` |
| **Crops (Growth Stage Sprites)** | `crp_*` | `15` (`68` stage sprites) | `5` (`22` stage sprites) | `10` (`46` stage sprites) | `game-data/crops.json` |
| **Farm & Fantasy Animals** | `anm_*` | `6` | `2` | `4` | `game-data/animals.json` |
| **Homestead & Guild Buildings** | `bld_*` | `13` (`43` level variants) | `6` (`22` level variants) | `7` (`21` level variants) | `game-data/buildings.json` |
| **World Regions & Dungeons** | `reg_*` / `dng_*` | `8` regions + `5` dungeons | `2` regions + `1` dungeon | `6` regions + `4` dungeons | `docs/game-design/00-game-vision.md` |

---

## 3. Bảng Manifest Chi tiết theo Từng Miền Tài nguyên

### 3.1 Nhân vật Điều khiển (`chr_*` — 12 Nhân vật & Chân dung)
*Lưu ý: Đường dẫn `portraitPath` và `atlasKey` khớp 100% trường `visualSpec` trong `game-data/characters.json`.*

| Canonical ID | Local Sprite Atlas Path | Local Portrait Path | Atlas Group | Resolution (Frame / Portrait) | Frames (4-Dir Full Set) | MVP / Wave | License Status |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `chr_kael_vanguard` | `assets/sprites/characters/chr_kael_vanguard.{png,json}` | `assets/ui/portraits/chr_kael_vanguard.png` | `atlas_chr_kael_vanguard` | `48×64` / `128×128` | `136` frames (25 states) | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| `chr_lyra_windrunner` | `assets/sprites/characters/chr_lyra_windrunner.{png,json}` | `assets/ui/portraits/chr_lyra_windrunner.png` | `atlas_chr_lyra_windrunner` | `48×64` / `128×128` | `136` frames (25 states) | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| `chr_seraphina_dawn` | `assets/sprites/characters/chr_seraphina_dawn.{png,json}` | `assets/ui/portraits/chr_seraphina_dawn.png` | `atlas_chr_seraphina_dawn` | `48×64` / `128×128` | `136` frames (25 states) | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| `chr_bram_bastion` | `assets/sprites/characters/chr_bram_bastion.{png,json}` | `assets/ui/portraits/chr_bram_bastion.png` | `atlas_chr_bram_bastion` | `48×64` / `128×128` | `136` frames | Post-MVP (W2) | `ORIGINAL_IN_HOUSE` |
| `chr_vex_nightblade` | `assets/sprites/characters/chr_vex_nightblade.{png,json}` | `assets/ui/portraits/chr_vex_nightblade.png` | `atlas_chr_vex_nightblade` | `48×64` / `128×128` | `136` frames | Post-MVP (W2) | `ORIGINAL_IN_HOUSE` |
| `chr_rowan_tidewarden` | `assets/sprites/characters/chr_rowan_tidewarden.{png,json}` | `assets/ui/portraits/chr_rowan_tidewarden.png` | `atlas_chr_rowan_tidewarden` | `48×64` / `128×128` | `136` frames | Post-MVP (W2) | `ORIGINAL_IN_HOUSE` |
| `chr_orin_stormcaller` | `assets/sprites/characters/chr_orin_stormcaller.{png,json}` | `assets/ui/portraits/chr_orin_stormcaller.png` | `atlas_chr_orin_stormcaller` | `48×64` / `128×128` | `136` frames | Post-MVP (W3) | `ORIGINAL_IN_HOUSE` |
| `chr_freya_frostveil` | `assets/sprites/characters/chr_freya_frostveil.{png,json}` | `assets/ui/portraits/chr_freya_frostveil.png` | `atlas_chr_freya_frostveil` | `48×64` / `128×128` | `136` frames | Post-MVP (W3) | `ORIGINAL_IN_HOUSE` |
| `chr_mira_ironfist` | `assets/sprites/characters/chr_mira_ironfist.{png,json}` | `assets/ui/portraits/chr_mira_ironfist.png` | `atlas_chr_mira_ironfist` | `48×64` / `128×128` | `136` frames | Post-MVP (W3) | `ORIGINAL_IN_HOUSE` |
| `chr_torvald_rageborn` | `assets/sprites/characters/chr_torvald_rageborn.{png,json}` | `assets/ui/portraits/chr_torvald_rageborn.png` | `atlas_chr_torvald_rageborn` | `48×64` / `128×128` | `136` frames | Post-MVP (W4) | `ORIGINAL_IN_HOUSE` |
| `chr_aurelia_starbow` | `assets/sprites/characters/chr_aurelia_starbow.{png,json}` | `assets/ui/portraits/chr_aurelia_starbow.png` | `atlas_chr_aurelia_starbow` | `48×64` / `128×128` | `136` frames | Post-MVP (W4) | `ORIGINAL_IN_HOUSE` |
| `chr_nyx_voidcaller` | `assets/sprites/characters/chr_nyx_voidcaller.{png,json}` | `assets/ui/portraits/chr_nyx_voidcaller.png` | `atlas_chr_nyx_voidcaller` | `48×64` / `128×128` | `136` frames | Post-MVP (W5) | `ORIGINAL_IN_HOUSE` |

### 3.2 Quái vật Thường (`mob_*` — 30), Elite (`mob_elite_*` — 8) & Boss (`boss_*` — 5)
*Kích thước sprite khớp 100% trường `spriteSize` trong `game-data/monsters.json` và `game-data/bosses.json`.*

| Canonical IDs | Local Asset Path | Atlas Group | Frame Size | Frames / Entity | MVP / Wave | License Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `mob_moss_slime`, `mob_timber_wolf`, `mob_spore_cap`, `mob_briar_boar`, `mob_hollow_bat`, `mob_root_crawler` | `assets/sprites/monsters/atlas_mobs_forest_64.{png,json}` | `atlas_mobs_forest_64` | `64×64` | `28–36` frames (Idle/Walk/Atk/Hit/Stun/Death) | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| `mob_forest_goblin`, `mob_goblin_shaman` | `assets/sprites/monsters/atlas_mobs_forest_48x64.{png,json}` | `atlas_mobs_forest_48x64` | `48×64` | `36` frames (4-dir humanoid mob) | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| `mob_elite_alpha_direwolf` | `assets/sprites/monsters/mob_elite_alpha_direwolf.{png,json}` | `atlas_elite_forest` | `96×96` | `48` frames (+ howling/enrage aura) | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| `mob_elite_briar_stag` | `assets/sprites/monsters/mob_elite_briar_stag.{png,json}` | `atlas_elite_forest` | `96×96` | `48` frames | Post-MVP (W2) | `ORIGINAL_IN_HOUSE` |
| `mob_stone_golem` (`96×96`), `mob_ironhide_kobold` (`48×64`), `mob_cinder_drake` (`64×64`), `mob_slag_elemental` (`64×64`), `mob_elite_magma_colossus` (`96×96`) | `assets/sprites/monsters/atlas_mobs_ironpeak.{png,json}` | `atlas_mobs_ironpeak` | `48×64` / `64×64` / `96×96` | `32–48` frames | Post-MVP (W2) | `ORIGINAL_IN_HOUSE` |
| `mob_quartz_beetle`, `mob_cavern_hydroid`, `mob_amethyst_stalker`, `mob_voltaic_jelly` (`64×64`), `mob_elite_crystal_matriarch` (`96×96`) | `assets/sprites/monsters/atlas_mobs_crystal.{png,json}` | `atlas_mobs_crystal` | `64×64` / `96×96` | `32–48` frames | Post-MVP (W3) | `ORIGINAL_IN_HOUSE` |
| `mob_ruin_sentinel` (`96×96`), `mob_cursed_acolyte` (`48×64`), `mob_sandstone_gargoyle` (`96×96`), `mob_astral_wraith` (`64×64`), `mob_elite_sunstone_warden` (`96×96`) | `assets/sprites/monsters/atlas_mobs_ruins.{png,json}` | `atlas_mobs_ruins` | `48×64` / `64×64` / `96×96` | `32–48` frames | Post-MVP (W3) | `ORIGINAL_IN_HOUSE` |
| `mob_frostbite_hound` (`64×64`), `mob_glacier_yeti` (`96×96`), `mob_ice_valkyrie_shade` (`48×64`), `mob_blizzard_elemental` (`64×64`), `mob_elite_permafrost_mammoth` (`96×96`) | `assets/sprites/monsters/atlas_mobs_frostbound.{png,json}` | `atlas_mobs_frostbound` | `48×64` / `64×64` / `96×96` | `32–48` frames | Post-MVP (W4) | `ORIGINAL_IN_HOUSE` |
| `mob_ash_hound` (`64×64`), `mob_obsidian_brute` (`96×96`), `mob_pyroclast_cultist` (`48×64`), `mob_elite_cinder_wyvern` (`96×96`) | `assets/sprites/monsters/atlas_mobs_ember.{png,json}` | `atlas_mobs_ember` | `48×64` / `64×64` / `96×96` | `32–48` frames | Post-MVP (W4) | `ORIGINAL_IN_HOUSE` |
| `mob_void_thrall` (`48×64`), `mob_abyssal_knight` (`96×96`), `mob_eclipse_weaver` (`64×64`), `mob_elite_dread_harbinger` (`96×96`) | `assets/sprites/monsters/atlas_mobs_abyssal.{png,json}` | `atlas_mobs_abyssal` | `48×64` / `64×64` / `96×96` | `32–48` frames | Post-MVP (W5) | `ORIGINAL_IN_HOUSE` |
| **`boss_thornback_elder`** | `assets/sprites/bosses/boss_thornback_elder.{png,json}` | `atlas_boss_thornback` | **`128×128`** | `72` frames (3 phases + stagger + exposed heart) | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| **`boss_ignis_forgelord`** | `assets/sprites/bosses/boss_ignis_forgelord.{png,json}` | `atlas_boss_ignis` | **`160×160`** | `76` frames | Post-MVP (W2) | `ORIGINAL_IN_HOUSE` |
| **`boss_prism_leviathan`** | `assets/sprites/bosses/boss_prism_leviathan.{png,json}` | `atlas_boss_prism` | **`192×192`** | `80` frames | Post-MVP (W3) | `ORIGINAL_IN_HOUSE` |
| **`boss_boreas_frostking`** | `assets/sprites/bosses/boss_boreas_frostking.{png,json}` | `atlas_boss_boreas` | **`192×192`** | `80` frames | Post-MVP (W4) | `ORIGINAL_IN_HOUSE` |
| **`boss_malakor_abyss`** | `assets/sprites/bosses/boss_malakor_abyss.{png,json}` | `atlas_boss_malakor` | **`256×256`** | `96` frames (3 phases + Eclipse form) | Post-MVP (W5) | `ORIGINAL_IN_HOUSE` |

### 3.3 Công trình (`bld_*` — 13 Công trình / 43 Biến thể Cấp độ)
| Canonical ID | Local Asset Path | Atlas Group | Footprint (`tiles`) | Sprite Canvas (`px`) | Variants (`levels`) | MVP / Wave | License Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| `bld_player_house` | `assets/sprites/buildings/atlas_bld_mvp.{png,json}` | `atlas_bld_mvp` | `5×4` | `160×160` | `4` (`lv1..lv4`) | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| `bld_storage` | `assets/sprites/buildings/atlas_bld_mvp.{png,json}` | `atlas_bld_mvp` | `3×2` | `96×96` | `4` (`lv1..lv4`) | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| `bld_farm_plot` | `assets/sprites/buildings/atlas_bld_mvp.{png,json}` | `atlas_bld_mvp` | `4×4` | `128×128` | `4` (`lv1..lv4` + sprinkler) | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| `bld_chicken_coop` | `assets/sprites/buildings/atlas_bld_mvp.{png,json}` | `atlas_bld_mvp` | `3×3` | `96×112` | `3` (`lv1..lv3`) | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| `bld_blacksmith` | `assets/sprites/buildings/atlas_bld_mvp.{png,json}` | `atlas_bld_mvp` | `4×3` | `128×128` | `4` (`lv1..lv4` + 4f fire) | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| `bld_kitchen` | `assets/sprites/buildings/atlas_bld_mvp.{png,json}` | `atlas_bld_mvp` | `3×3` | `96×112` | `3` (`lv1..lv3` + chimney) | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| `bld_barn` | `assets/sprites/buildings/atlas_bld_exp1.{png,json}` | `atlas_bld_exp1` | `5×4` | `160×160` | `3` (`lv1..lv3`) | Post-MVP (W2) | `ORIGINAL_IN_HOUSE` |
| `bld_workshop` | `assets/sprites/buildings/atlas_bld_exp1.{png,json}` | `atlas_bld_exp1` | `4×3` | `128×128` | `3` (`lv1..lv3`) | Post-MVP (W2) | `ORIGINAL_IN_HOUSE` |
| `bld_furnace` | `assets/sprites/buildings/atlas_bld_exp1.{png,json}` | `atlas_bld_exp1` | `3×3` | `96×112` | `3` (`lv1..lv3` + glow) | Post-MVP (W2) | `ORIGINAL_IN_HOUSE` |
| `bld_alchemy_lab` | `assets/sprites/buildings/atlas_bld_exp2.{png,json}` | `atlas_bld_exp2` | `3×3` | `96×112` | `3` (`lv1..lv3`) | Post-MVP (W3) | `ORIGINAL_IN_HOUSE` |
| `bld_training_ground` | `assets/sprites/buildings/atlas_bld_exp2.{png,json}` | `atlas_bld_exp2` | `5×4` | `160×144` | `3` (`lv1..lv3`) | Post-MVP (W3) | `ORIGINAL_IN_HOUSE` |
| `bld_stable` | `assets/sprites/buildings/atlas_bld_exp2.{png,json}` | `atlas_bld_exp2` | `4×3` | `128×128` | `3` (`lv1..lv3`) | Post-MVP (W3) | `ORIGINAL_IN_HOUSE` |
| `bld_guild_hall` | `assets/sprites/buildings/bld_guild_hall.{png,json}` | `atlas_bld_guild` | `7×6` | `224×224` | `3` (`lv1..lv3`) | Post-MVP (W5) | `ORIGINAL_IN_HOUSE` |

### 3.4 Cây trồng (`crp_*` — 15 Cây / 68 Stage Sprites) & Vật nuôi (`anm_*` — 6 Loài)
| Canonical IDs | Local Asset Path | Atlas Group | Frame Size | Frames / Stages | MVP / Wave | License Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `crp_sunwheat` (4st), `crp_berry_bush` (5st), `crp_moon_herb` (4st), `crp_golden_carrot` (4st), `crp_ember_pepper` (5st) | `assets/sprites/crops/atlas_crops_mvp.{png,json}` | `atlas_crops_mvp` | `32×48` | `22` stage sprites (+2f sway mature) | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| `crp_frost_turnip` (4st), `crp_clover_hay` (4st), `crp_silver_pumpkin` (5st), `crp_storm_radish` (4st), `crp_crimson_tomato` (5st), `crp_honey_melon` (5st), `crp_shadow_garlic` (4st), `crp_crystal_lotus` (5st), `crp_ash_chili` (5st), `crp_starlight_melon` (5st) | `assets/sprites/crops/atlas_crops_postmvp.{png,json}` | `atlas_crops_postmvp` | `32×48` | `46` stage sprites (+2f sway mature) | Post-MVP (W2–W4) | `ORIGINAL_IN_HOUSE` |
| `anm_meadow_chicken`, `anm_clover_cow` | `assets/sprites/animals/atlas_animals_mvp.{png,json}` | `atlas_animals_mvp` | `32×32` (Chicken) / `48×48` (Cow) | `24` frames/loài (Baby+Adult, Idle/Walk/Eat/Happy 4-dir) | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| `anm_cloud_sheep`, `anm_bristle_pig`, `anm_ridge_goat`, `anm_lunar_moth_hare` | `assets/sprites/animals/atlas_animals_postmvp.{png,json}` | `atlas_animals_postmvp` | `48×48` (Sheep/Pig/Goat) / `32×32` (Silkhare) | `24` frames/loài | Post-MVP (W2–W5) | `ORIGINAL_IN_HOUSE` |

### 3.5 Bản đồ Tiled, Tilesets & Khu vực (`reg_*` — 8 Vùng & `dng_*` — 5 Hầm ngục)
| Canonical Region / Dungeon ID | Tileset Path (`.png` + `.tsj`) | Map Path (`.tmj`) | Grid / Canvas Spec | Variants | MVP / Wave | License Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `reg_greenhaven_village` (`zon_greenhaven_square`, `zon_player_homestead`) | `assets/tilesets/ts_greenhaven.{png,tsj}` + `ts_farming_soil.{png,tsj}` + `ts_building_grid_overlay.{png,tsj}` | `assets/maps/greenhaven/zon_greenhaven_square.tmj`, `zon_player_homestead.tmj` | `32×32` extruded (`margin 2, spacing 4`) · `60×44` & `32×28` tiles | 4 mùa (`SPRING/SUMMER/AUTUMN/WINTER`) + 4f water | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| `reg_whispering_forest` (`zon_forest_west`, `zon_forest_deep`) | `assets/tilesets/ts_whispering_forest.{png,tsj}` | `assets/maps/whispering_forest/zon_forest_west.tmj`, `zon_forest_deep.tmj` | `32×32` extruded · `48×40` tiles × 2 | 4 mùa + tàn tích cổ | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| `dng_mossroot_hollow` (+ Boss Arena) | `assets/tilesets/ts_dng_mossroot.{png,tsj}` | `assets/maps/dungeons/dng_mossroot_hollow.tmj`, `dng_mossroot_hollow_boss.tmj` | `32×32` extruded · Boss Arena `26×20` tiles | Đuốc 4f + nấm phát quang + 4 trụ vỡ | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| `reg_ironpeak_mountains` + `dng_slag_foundry` | `assets/tilesets/ts_ironpeak.{png,tsj}` | `assets/maps/ironpeak/zon_ironpeak_pass.tmj`, `assets/maps/dungeons/dng_slag_foundry.tmj` | `32×32` extruded · Boss Arena `28×22` tiles | Dung nham 4f + đường ray 16-tile | Post-MVP (W2) | `ORIGINAL_IN_HOUSE` |
| `reg_crystal_caverns` + `dng_prism_sanctum` | `assets/tilesets/ts_crystal_caverns.{png,tsj}` | `assets/maps/crystal_caverns/zon_crystal_depths.tmj`, `assets/maps/dungeons/dng_prism_sanctum.tmj` | `32×32` extruded · Boss Arena `30×24` tiles | Hồ pha lê 4f + tinh thể phát sáng | Post-MVP (W3) | `ORIGINAL_IN_HOUSE` |
| `reg_forgotten_ruins` | `assets/tilesets/ts_forgotten_ruins.{png,tsj}` | `assets/maps/forgotten_ruins/zon_sunstone_plaza.tmj` | `32×32` extruded | Bẫy cổ ngữ + sa thạch | Post-MVP (W3) | `ORIGINAL_IN_HOUSE` |
| `reg_frostbound_highlands` + `dng_glacial_citadel` | `assets/tilesets/ts_frostbound.{png,tsj}` | `assets/maps/frostbound/zon_frost_ridge.tmj`, `assets/maps/dungeons/dng_glacial_citadel.tmj` | `32×32` extruded · Boss Arena `32×24` tiles | Băng phản chiếu + tuyết | Post-MVP (W4) | `ORIGINAL_IN_HOUSE` |
| `reg_ember_wasteland` | `assets/tilesets/ts_ember_wasteland.{png,tsj}` | `assets/maps/ember_wasteland/zon_caldera_rim.tmj` | `32×32` extruded | Magma 4f + đá obsidian | Post-MVP (W4) | `ORIGINAL_IN_HOUSE` |
| `reg_abyssal_kingdom` + `dng_eclipse_throne` | `assets/tilesets/ts_abyssal_kingdom.{png,tsj}` | `assets/maps/abyssal/zon_void_causeway.tmj`, `assets/maps/dungeons/dng_eclipse_throne.tmj` | `32×32` extruded · Boss Arena `36×28` tiles | Sàn nứt sụp đổ + parallax sao | Post-MVP (W5) | `ORIGINAL_IN_HOUSE` |

### 3.6 Kỹ năng (`skl_*` — 60 Kỹ năng), VFX Atlases & Boss Telegraphs
| Nhóm `skl_*` / VFX | Local VFX Atlas Path | Local Skill Icon Atlas | Resolution | Frames | MVP / Wave | License Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| **15 Kỹ năng MVP** (`skl_kael_*` [5], `skl_lyra_*` [5], `skl_seraphina_*` [5] — gồm Ultimates `Crimson Crescent`, `Tempest Arrowstorm`, `Solar Judgment`) | `assets/vfx/atlas_vfx_mvp_skills.{png,json}` | `assets/icons/atlas_icons_skills_mvp.{png,json}` | VFX `32×32`..`160×280` · Icon `32×32` | `6–14` frames/skill | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| **Core Combat, Hit Sparks, Boss Telegraphs & Pixel Particles** (`vfx_telegraph_*`, `vfx_pixel_particles`, `vfx_hit_*`, `vfx_poise_break`, `vfx_weather_*`) | `assets/vfx/atlas_vfx_core_combat.{png,json}` | `assets/icons/atlas_icons_status.{png,json}` | Particles `8×8` · Impacts `32×32`..`96×96` · Icons `16×16` | `4–10` frames/fx | **MVP (W1)** | `ORIGINAL_IN_HOUSE` |
| **Wave 2 Skills (15)** (`skl_bram_*`, `skl_vex_*` gồm `Phantom Sever`, `skl_rowan_*`) | `assets/vfx/atlas_vfx_wave2_skills.{png,json}` | `assets/icons/atlas_icons_skills_post.{png,json}` | `32×32`..`192×192` · Icon `32×32` | `6–14` frames/skill | Post-MVP (W2) | `ORIGINAL_IN_HOUSE` |
| **Wave 3 Skills (15)** (`skl_orin_*` gồm `Storm Dominion`, `skl_freya_*` gồm `Glacial Prison`, `skl_mira_*`) | `assets/vfx/atlas_vfx_wave3_skills.{png,json}` | `assets/icons/atlas_icons_skills_post.{png,json}` | `32×32`..`192×192` · Icon `32×32` | `6–14` frames/skill | Post-MVP (W3) | `ORIGINAL_IN_HOUSE` |
| **Wave 4–5 Skills (15)** (`skl_torvald_*` gồm `Dragonheart Awakening`, `skl_aurelia_*` gồm `Celestial Rain`, `skl_nyx_*` gồm `Abyssal Eclipse`) | `assets/vfx/atlas_vfx_wave45_skills.{png,json}` | `assets/icons/atlas_icons_skills_post.{png,json}` | `32×32`..`224×224` · Icon `32×32` | `6–14` frames/skill | Post-MVP (W4–W5) | `ORIGINAL_IN_HOUSE` |

### 3.7 Vũ khí (`wpn_*` — 40), Trang bị (`eqp_*` — 40), Nguyên liệu (`mat_*` — 50), Tiêu hao (`csm_*` — 12) & Hạt giống (`sed_*` — 15)
*Mọi `iconKey` khớp 100% trường `iconKey` (`ico_<itemId>`) trong `game-data/items.json`.*

| Nhóm Vật phẩm & Canonical IDs | Local Icon Atlas Path | Resolution | Số lượng (MVP / Tổng) | Ghi chú Sprite Thế giới | License Status |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **10 Vũ khí MVP (`wpn_*`)**: `wpn_iron_longsword`, `wpn_elderwood_cleaver`, `wpn_wolf_fang_dagger`, `wpn_mossroot_pike`, `wpn_woodcutter_handaxe`, `wpn_ashwood_shortbow`, `wpn_oak_acolyte_staff`, `wpn_starbloom_scepter`, `wpn_thornbark_bulwark`, `wpn_copper_knuckle_gauntlet` | `assets/icons/atlas_icons_weapons.{png,json}` | `32×32` (icon) + `48×48` (weapon swing overlay) | `10` MVP | Hiển thị ánh sáng cường hóa `+4/+7/+10` bằng pixel glint overlay | `ORIGINAL_IN_HOUSE` |
| **30 Vũ khí Post-MVP (`wpn_*`)**: `wpn_crimson_vanguard_blade`, `wpn_runic_ruin_saber`, `wpn_solaris_eclipse_blade`, `wpn_ironpeak_greatsword`, `wpn_bloodforge_colossus`, `wpn_abyssal_sovereign_claymore`, `wpn_crystal_stiletto`, `wpn_duskveil_twinblade`, `wpn_phantom_eclipse_kris`, `wpn_tidebreaker_halberd`, `wpn_glacier_lance`, `wpn_dragonspine_partisan`, `wpn_forgelord_waraxe`, `wpn_frostbite_greataxe`, `wpn_galeweaver_longbow`, `wpn_prism_recurve_bow`, `wpn_tempest_horizon_bow`, `wpn_iron_arbalest`, `wpn_relic_repeater_crossbow`, `wpn_astralforge_starbow`, `wpn_crystal_conduit_staff`, `wpn_voltspire_stormstaff`, `wpn_celestial_dawn_staff`, `wpn_glaciersong_wand`, `wpn_cinder_rune_wand`, `wpn_umbramancer_void_wand`, `wpn_stoneheart_aegis`, `wpn_boreal_bastion_shield`, `wpn_obsidian_crusher_gauntlet`, `wpn_embercore_titan_gauntlet` | `assets/icons/atlas_icons_weapons.{png,json}` | `32×32` + `48×48` | `30` Post-MVP (W2–W5) | Gồm vũ khí đặc trưng cho 9 anh hùng Post-MVP & bộ Boss | `ORIGINAL_IN_HOUSE` |
| **40 Trang bị (`eqp_*`)**: `12` MVP (`set_greenhaven_novice`, `set_mossroot_guard`, `eqp_hunter_tunic`, 3 trang sức MVP) + `28` Post-MVP (`set_ironpeak_forge`, `set_crystal_arcanist`, `set_frostbound_warden`, `set_abyssal_sovereign`, nhẫn/dây chuyền/phụ kiện) | `assets/icons/atlas_icons_equipment.{png,json}` | `32×32` | `12` MVP / `40` Tổng | Phân mã màu nền ô theo `Rarity` (`COMMON`..`MYTHIC`) | `ORIGINAL_IN_HOUSE` |
| **50 Nguyên liệu (`mat_*`)**: `29` MVP (gỗ, đá, đồng/sắt, quái rừng, tim Thornback, nông sản/trứng/sữa) + `21` Post-MVP | `assets/icons/atlas_icons_materials.{png,json}` | `32×32` (`16×16` loot drop sprite) | `29` MVP / `50` Tổng | Kèm hiệu ứng cột sáng nhỏ khi rơi vật phẩm `EPIC`+ | `ORIGINAL_IN_HOUSE` |
| **12 Tiêu hao (`csm_*`) & 15 Hạt giống (`sed_*`)**: `11` consumables + `5` seeds MVP; `1` consumable (`csm_fertilizer_rich`) + `10` seeds Post-MVP | `assets/icons/atlas_icons_consumables_seeds.{png,json}` | `32×32` | `16` MVP / `27` Tổng | Bao gói hạt giống hiển thị màu nhận diện khớp cây trồng `crp_*` | `ORIGINAL_IN_HOUSE` |

### 3.8 UI, NPC, Props, Audio & Local Fonts
| Nhóm Tài nguyên | Canonical IDs / Scope | Local Asset Path | Resolution / Format | MVP / Wave | License Status |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **Village & World NPCs** | `npc_elder_rowan`, `npc_smith_garrik`, `npc_merchant_mira`, `npc_chef_bruno`, `npc_farmer_pip`, `npc_gacha_keeper_selene` (+ 6 NPC mở rộng W2–W5) | `assets/sprites/npcs/atlas_npcs_mvp.{png,json}` | `48×64` (4-dir Idle/Talk) + `128×128` portrait | `6` MVP / `12` Tổng | `ORIGINAL_IN_HOUSE` |
| **Interactive World Props** | Cây Oak/Pine, Đá/Đồng/Sắt/Bạc/Mythril/Obsidian/Void nodes, Rương, Đèn lồng, Giếng, 4 Trụ `pil_moss_*`, Lửa trại, Bàn chế tạo | `assets/sprites/props/atlas_props_mvp.{png,json}` | `32×32`..`64×96` | **MVP (W1)** + W2–W5 | `ORIGINAL_IN_HOUSE` |
| **Pixel Fantasy UI Kit & Banners** | 9-slice gỗ/đá/vàng, thanh HP/MP/Stamina/Poise, `bnr_perm_heroes`, `bnr_perm_arsenal`, 5 con trỏ chuột, biểu tượng tiền tệ (`GOLD`, `STARLIGHT_SHARD`, `CRAFTING_TOKEN`, `BOSS_TOKEN`, `STAR_ESSENCE`) | `assets/ui/atlas_ui_core.{png,json}`, `assets/ui/banners/bnr_*.png`, `assets/ui/cursors/*.png` | Panels `48×48` 9-slice · Banners `640×260` · Cursors `24×24` | **MVP (W1)** + Limited Banners W2+ | `ORIGINAL_IN_HOUSE` |
| **BGM, SFX, Ambience & UI Audio** | `8` MVP BGM (`+11` Post-MVP), `78` MVP SFX (`+95` Post-MVP), `8` MVP Ambience (`+6` Post-MVP) | `assets/audio/{bgm,sfx,ambience,ui}/*.{ogg,mp3}` + `assets/audio/audio-manifest.json` | 44.1 kHz `.ogg` + `.mp3` | **MVP (W1)** + W2–W5 | `ORIGINAL_IN_HOUSE` |
| **Vietnamese Pixel Fonts** | Font tiêu đề RPG 16-bit (`font_eldoria_title`), Font thân văn bản/HUD hỗ trợ đầy đủ dấu tiếng Việt (`font_eldoria_body_vi`), Bitmap Font số sát thương (`font_combat_numbers`) | `assets/fonts/eldoria-pixel-title.woff2`, `assets/fonts/eldoria-pixel-vi.woff2`, `assets/fonts/combat-numbers.{png,fnt}` | Vector TTF/WOFF2 pixel-crisp + Bitmap `.fnt` | **MVP (W1)** | **`SIL_OFL_LOCAL_FONT`** (hoặc `ORIGINAL_IN_HOUSE` cho bitmap số) |

---

## 4. Schema `assets/manifest.json` & Chiến lược Nạp Tài nguyên Cục bộ

Khi biên dịch cục bộ, công cụ đóng gói sinh tệp `assets/manifest.json` theo cấu trúc chuẩn để Client Phaser chỉ tải đúng gói cần thiết theo từng giai đoạn (giảm thời gian vào game lần đầu):

```json
{
  "manifestVersion": "1.0.0",
  "generatedAt": "2026-11-19T00:00:00Z",
  "hostingMode": "LOCAL_SELF_HOSTED",
  "preloadGroups": {
    "boot_core": [
      {
        "id": "ui_core",
        "path": "assets/ui/atlas_ui_core.png",
        "atlasJson": "assets/ui/atlas_ui_core.json",
        "sha256": "<computed-at-build>",
        "license": "ORIGINAL_IN_HOUSE",
        "mvp": true
      }
    ],
    "region_reg_greenhaven_village": [
      {
        "id": "ts_greenhaven",
        "path": "assets/tilesets/ts_greenhaven.png",
        "tiledDescriptor": "assets/tilesets/ts_greenhaven.tsj",
        "sha256": "<computed-at-build>",
        "license": "ORIGINAL_IN_HOUSE",
        "mvp": true
      }
    ]
  }
}
```

### Quy tắc Phân tầng Nạp (Preload Tiers — `proposed/unverified`)
1. **Tier 0 (`boot_core`, tải ở Loading Screen đầu game)**: Font tiếng Việt, UI Core Atlas, Cursors, Audio UI, 3 Nhân vật MVP, Core Combat VFX & Telegraphs, Icon Atlases (`~12–18 MB` tổng ước lượng `proposed/unverified`).
2. **Tier 1 (`region_<regionId>`, tải theo vùng hiện tại)**: Tileset + Map `.tmj` + Quái vật vùng + Nhạc nền/Ambience vùng (`~4–7 MB`/region `proposed/unverified`).
3. **Tier 2 (`dungeon_<dungeonId>`, tải khi bước vào cửa hang)**: Tileset hầm ngục + Boss Atlas (`128×128..256×256`) + Boss BGM (`~3–6 MB` `proposed/unverified`). Tự động giải phóng VRAM vùng cũ khi vượt ngưỡng bộ nhớ texture (`LRU cache = 2` vùng gần nhất).

---

## 5. Quality Gate — Kiểm định Tự động Manifest

- **Zero External Link Gate**: Script kiểm chứng (`tools/design-validation/`) quét toàn bộ `assets/manifest.json` và `game-data/*.json`; nếu phát hiện bất kỳ URL `http://`, `https://`, `s3://` hoặc đường dẫn ngoài `assets/` → báo lỗi **`P0` (CRITICAL — Vi phạm Hiến pháp Nguyên tắc I)**.
- **100% Canonical ID Coverage**: Mọi `id` trong `characters.json`, `skills.json`, `monsters.json`, `bosses.json`, `items.json`, `buildings.json`, `crops.json`, `animals.json` bắt buộc ánh xạ được tới ít nhất 1 mục hợp lệ trong `asset-manifest.md` và `assets/manifest.json`.
- **License Audit**: 100% tệp tài nguyên phải gắn nhãn `ORIGINAL_IN_HOUSE` hoặc `SIL_OFL_LOCAL_FONT` và khớp danh sách tại `docs/management/sources-and-licenses.md`.
