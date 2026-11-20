# 00 — Game Vision & Canonical Identity: Eldoria: Forgotten Wilds

**Trạng thái**: Hoàn thiện (Design Baseline v1.0)  
**Chế độ**: `DESIGN_AND_PLANNING_ONLY`  
**Cập nhật lần cuối**: 2026-11-19  
**Tài liệu gốc quản trị**: [Constitution](../../.specify/memory/constitution.md)

---

## 1. Tuyên ngôn Tầm nhìn (High-Level Vision)

**Eldoria: Forgotten Wilds** là tựa game **Online Multiplayer Open-World Pixel RPG** mang phong cách **Classic 16-bit Fantasy Pixel Art** với chiều sâu thị giác **2.5D** (Y-sorting, occlusion, bóng đổ và phân tầng địa hình). Trò chơi hòa quyện trải nghiệm **sinh tồn — nông trại — chăn nuôi — chế tạo — xây dựng căn cứ** ấm áp với **chiến đấu hành động thời gian thực (Action RPG)** giàu chiều sâu kỹ năng, **cường hóa vũ khí +1 đến +10**, **gacha sưu tầm minh bạch bằng tiền tệ trong game** và **đột kích boss tổ đội (Co-op Boss Raid)**.

### Câu định vị (Elevator Pitch)
> *Bắt đầu từ một ngôi nhà gỗ nhỏ tại Greenhaven Village, người chơi tự do chọn con đường của riêng mình: trồng trọt, chăn nuôi, khai khoáng, rèn vũ khí huyền thoại lên +10, mở rộng lãnh địa hoặc lập party cùng bạn bè chinh phục các hầm ngục và Boss nhiều giai đoạn khắp 8 vùng đất bí ẩn của Eldoria — trong một thế giới pixel sống động, công bằng và hoàn toàn tự chủ về dữ liệu.*

---

## 2. Triết lý Tham khảo & Cam kết Nguyên bản

Trò chơi tham khảo triết lý thiết kế (tuyệt đối KHÔNG sao chép nhân vật, bản đồ, cốt truyện hay tài sản trí tuệ) từ các tượng đài cùng thể loại:

| Tựa game tham khảo | Điểm mạnh thiết kế được chắt lọc | Cách Eldoria áp dụng nguyên bản |
| :--- | :--- | :--- |
| **Stardew Valley** | Nhịp sống nông trại ấm áp, mùa vụ, chăn nuôi gắn kết cảm xúc | Hệ thống đất đai, tưới tiêu, mùa vụ, hạnh phúc động vật và chuỗi nấu ăn cung cấp buff chiến đấu thực chất |
| **Terraria / Core Keeper** | Vòng lặp khám phá → khai thác → chế tạo → hạ boss mở khóa vùng mới | Tiến trình mở khóa 8 vùng sinh thái thông qua Boss Milestone, tinh luyện quặng và xây xưởng |
| **Minecraft** | Tự do xây dựng căn cứ mang dấu ấn cá nhân | Hệ thống đặt công trình theo lưới (grid snapping), nâng cấp kiến trúc theo cấp độ có chức năng sản xuất |
| **Albion Online** | Nền kinh tế liên kết mọi nghề nghiệp | Nông dân, thợ mỏ, thợ rèn và chiến binh bổ trợ trực tiếp nhau qua nguyên liệu, thực phẩm và công trình |
| **Ragnarok Online / MapleStory** | Cảm giác MMO pixel thân thiện, bản sắc class rõ ràng, săn boss cùng bạn bè | 8 Class cốt lõi (12 nhân vật), bản đồ phân vùng nhiều người chơi gặp gỡ, chat, party và săn boss tổ đội |
| **Genshin Impact** | Cộng hưởng nguyên tố, sưu tầm nhân vật/vũ khí có chiều sâu đội hình | 9 nguyên tố có phản ứng chiến thuật; Gacha MVP hoàn toàn dùng `STARLIGHT_SHARD` kiếm từ gameplay, công khai xác suất và có pity |
| **Hades** | Cảm giác chiến đấu mượt, dodge i-frame, anticipation & impact sắc nét | Action combat 20 Hz server-authoritative / 60 FPS client với dodge, parry, combo, hit-stop và telegraph boss rõ ràng |

---

## 3. Bảy Trụ cột Thiết kế (Design Pillars)

1. **Thế giới sống động và có thể khám phá**: Chu kỳ ngày/đêm, thời tiết, mùa vụ, tài nguyên tái tạo và 8 vùng đất khác biệt khí hậu, sinh thái và truyền thuyết.
2. **Chiến đấu phản hồi tốt, có chiều sâu kỹ năng**: Action combat thời gian thực kết hợp basic combo, dodge i-frame, block/parry, 60 kỹ năng bản sắc, cộng hưởng nguyên tố và cơ chế phá giáp/stagger boss.
3. **Mọi hoạt động farm đều có giá trị đối với tiến trình phát triển**: Nông sản tạo món ăn buff combat; chăn nuôi tạo vật liệu may giáp và thuốc; gỗ/đá nâng cấp lò rèn để mở khóa cường hóa vũ khí +1 đến +10.
4. **Người chơi tự lựa chọn con đường phát triển**: Có thể tập trung làm thợ thủ công/nông trại, đi săn boss tốc độ cao hoặc chơi linh hoạt cả hai; nhân vật độ hiếm thấp vẫn có vai trò chiến thuật độc nhất (ví dụ: phá giáp boss hoặc tạo khiên nguyên tố).
5. **Pixel Art nhất quán, đẹp mắt và dễ nhận diện**: Chuẩn 16-bit (`32x32` tile, `48x64` humanoid, nearest-neighbor, silhouette rõ, combat telegraph sạch).
6. **Multiplayer công bằng, bảo mật và chống gian lận**: Server-authoritative toàn diện, mọi giao dịch kinh tế nguyên tử trên cơ sở dữ liệu JSON cục bộ có khóa khóa theo aggregate và WAL chống nhân bản.
7. **Duy trì khả năng chơi lâu dài không grind vô nghĩa**: Mục tiêu phân tầng rõ ràng từ 5 phút đến 1 tháng; nâng cấp MVP chắc chắn không vỡ đồ; không ép nạp tiền hay dùng dark pattern.

---

## 4. Ràng buộc Kiến trúc Tối thượng (Từ Hiến pháp Dự án)

- **100% JSON Local Primary Database**: Toàn bộ dữ liệu người chơi, thế giới, kho đồ, nhà cửa, sổ cái tiền tệ và lịch sử gacha lưu tại `data/db/**/*.json` qua `JsonDatabaseEngine` nội bộ. **TUYỆT ĐỐI KHÔNG** dùng PostgreSQL, TypeORM, Redis, S3 hay bất kỳ dịch vụ đám mây/bên thứ ba nào.
- **Single Source of Truth**: Mọi định danh nội dung và thông số cân bằng được cố định trong 12 tệp JSON tại `game-data/*.json`.
- **Chế độ hiện tại**: `DESIGN_AND_PLANNING_ONLY` — hoàn thiện 100% thiết kế, dữ liệu chuẩn, mô phỏng cân bằng, mockup UI và bộ đặc tả Spec Kit trước khi viết mã nguồn production.

---

## 5. Bảng Quy ước Định danh & Enum Chuẩn (Canonical Registry)

Tất cả tài liệu trong `docs/`, tệp dữ liệu trong `game-data/` và đặc tả trong `specs/` PHẢI sử dụng đúng các định danh sau:

### 5.1 Quy ước Tiền tố ID
| Loại đối tượng | Tiền tố | Ví dụ chuẩn |
| :--- | :--- | :--- |
| Region | `reg_` | `reg_greenhaven_village`, `reg_whispering_forest` |
| Zone / Map Chunk | `zon_` | `zon_greenhaven_square`, `zon_forest_west` |
| Dungeon | `dng_` | `dng_mossroot_hollow` |
| Character | `chr_` | `chr_kael_vanguard`, `chr_lyra_windrunner` |
| Skill | `skl_` | `skl_kael_ult_crimson_crescent` |
| Regular Monster | `mob_` | `mob_moss_slime`, `mob_timber_wolf` |
| Elite Monster | `mob_elite_` | `mob_elite_alpha_direwolf` |
| Boss | `boss_` | `boss_thornback_elder` |
| Weapon | `wpn_` | `wpn_iron_longsword` |
| Armor / Accessory | `eqp_` | `eqp_hunter_tunic` |
| Material | `mat_` | `mat_oak_wood`, `mat_iron_ore` |
| Consumable / Seed | `csm_` / `sed_` | `csm_herb_stew`, `sed_sunwheat` |
| Crafting Recipe | `rcp_` | `rcp_smelt_iron_ingot` |
| Crop | `crp_` | `crp_sunwheat` |
| Animal | `anm_` | `anm_meadow_chicken` |
| Building | `bld_` | `bld_player_house`, `bld_blacksmith` |
| Quest | `qst_` | `qst_001_first_harvest` |
| NPC | `npc_` | `npc_elder_rowan`, `npc_smith_garrik` |
| Loot Table | `ltb_` | `ltb_boss_thornback_elder` |
| Gacha Banner | `bnr_` | `bnr_perm_heroes`, `bnr_perm_arsenal` |

### 5.2 Enum Chuẩn Hệ thống
- **`CharacterClass`**: `WARRIOR`, `KNIGHT`, `ASSASSIN`, `ARCHER`, `MAGE`, `HEALER`, `BERSERKER`, `SUMMONER`
- **`CharacterRole`**: `TANK`, `MELEE_DPS`, `RANGED_DPS`, `MAGIC_DPS`, `SUPPORT`, `HYBRID`
- **`Element`**: `FIRE`, `WATER`, `EARTH`, `WIND`, `LIGHTNING`, `FROST`, `LIGHT`, `SHADOW`, `NEUTRAL`
- **`Rarity`**: `COMMON`, `UNCOMMON`, `RARE`, `EPIC`, `LEGENDARY`, `MYTHIC`
- **`WeaponType`**: `SWORD`, `GREATSWORD`, `DAGGER`, `SPEAR`, `AXE`, `BOW`, `CROSSBOW`, `STAFF`, `WAND`, `SHIELD`, `GAUNTLET`
- **`EquipmentSlot`**: `MAIN_HAND`, `OFF_HAND`, `HELMET`, `CHEST_ARMOR`, `GLOVES`, `BOOTS`, `RING_1`, `RING_2`, `NECKLACE`, `ACCESSORY`
- **`SkillType`**: `BASIC`, `PASSIVE`, `ACTIVE`, `ULTIMATE`
- **`CurrencyType`**: `GOLD`, `STARLIGHT_SHARD`, `CRAFTING_TOKEN`, `BOSS_TOKEN`, `STAR_ESSENCE`
- **`Season`**: `SPRING`, `SUMMER`, `AUTUMN`, `WINTER`
- **`WeatherType`**: `CLEAR`, `RAIN`, `STORM`, `FOG`, `SNOW`, `HEATWAVE`

### 5.3 Danh sách 12 Nhân vật Chuẩn & 8 Khu vực Chuẩn
| ID Nhân vật | Tên | Class | Role | Nguyên tố | Rarity | Vũ khí chính | MVP |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| `chr_kael_vanguard` | Kael Ironbound | `WARRIOR` | `MELEE_DPS` | `FIRE` | `RARE` | `SWORD` | Có |
| `chr_lyra_windrunner` | Lyra Galeweaver | `ARCHER` | `RANGED_DPS` | `WIND` | `RARE` | `BOW` | Có |
| `chr_seraphina_dawn` | Seraphina Solis | `HEALER` | `SUPPORT` | `LIGHT` | `RARE` | `STAFF` | Có |
| `chr_bram_bastion` | Bram Stoneheart | `KNIGHT` | `TANK` | `EARTH` | `EPIC` | `SHIELD` | Không |
| `chr_vex_nightblade` | Vex Duskveil | `ASSASSIN` | `MELEE_DPS` | `SHADOW` | `EPIC` | `DAGGER` | Không |
| `chr_orin_stormcaller` | Orin Voltspire | `MAGE` | `MAGIC_DPS` | `LIGHTNING` | `LEGENDARY` | `STAFF` | Không |
| `chr_freya_frostveil` | Freya Glaciersong | `MAGE` | `MAGIC_DPS` | `FROST` | `EPIC` | `WAND` | Không |
| `chr_torvald_rageborn` | Torvald Bloodforge | `BERSERKER` | `MELEE_DPS` | `FIRE` | `LEGENDARY` | `GREATSWORD` | Không |
| `chr_nyx_voidcaller` | Nyx Umbramancer | `SUMMONER` | `MAGIC_DPS` | `SHADOW` | `MYTHIC` | `WAND` | Không |
| `chr_rowan_tidewarden` | Rowan Mistbreaker | `KNIGHT` | `TANK` | `WATER` | `UNCOMMON` | `SPEAR` | Không |
| `chr_mira_ironfist` | Mira Crankbolt | `WARRIOR` | `HYBRID` | `NEUTRAL` | `COMMON` | `GAUNTLET` | Không |
| `chr_aurelia_starbow` | Aurelia Astralforge | `ARCHER` | `RANGED_DPS` | `LIGHT` | `MYTHIC` | `CROSSBOW` | Không |

| Thứ tự | Region ID | Tên Khu vực | Cấp đề xuất | Boss đại diện | Milestone |
| :---: | :--- | :--- | :---: | :--- | :---: |
| 1 | `reg_greenhaven_village` | Greenhaven Village | 1–5 | (Vùng an toàn & Lãnh địa) | M1 (MVP) |
| 2 | `reg_whispering_forest` | Whispering Forest | 1–15 | `boss_thornback_elder` (trong `dng_mossroot_hollow`) | M1 (MVP) |
| 3 | `reg_ironpeak_mountains` | Ironpeak Mountains | 15–30 | `boss_ignis_forgelord` | M2 |
| 4 | `reg_crystal_caverns` | Crystal Caverns | 30–45 | `boss_prism_leviathan` | M3 |
| 5 | `reg_forgotten_ruins` | Forgotten Ruins | 45–60 | (Elite Guardians + Ancient Trials) | M3 |
| 6 | `reg_frostbound_highlands` | Frostbound Highlands | 60–75 | `boss_boreas_frostking` | M4 |
| 7 | `reg_ember_wasteland` | Ember Wasteland | 75–90 | (Volcanic Raid + Forge Trials) | M4 |
| 8 | `reg_abyssal_kingdom` | Abyssal Kingdom | 90–100 | `boss_malakor_abyss` | M5 |

---

## 6. Mục tiêu Trải nghiệm Người chơi (Player Experience Targets)

- **5 phút đầu**: Tạo nhân vật, bước ra khỏi căn nhà gỗ tại Greenhaven Village, chặt 1 cây gỗ, gặt 1 luống lúa mì đầu tiên, đánh bại 1 `mob_moss_slime` bằng combo kiếm/cung.
- **30 phút đầu**: Nấu món ăn hồi stamina/buff đầu tiên, chế tạo vũ khí sắt, cường hóa lên `+2` tại Blacksmith, gặp người chơi khác ở quảng trường làng và chat.
- **1 giờ đầu**: Khám phá sâu Whispering Forest, mở khóa kỹ năng Active thứ 3 và Ultimate, chạm trán `mob_elite_alpha_direwolf`, thực hiện lượt quay gacha 10 lần đầu tiên hoàn toàn từ `STARLIGHT_SHARD` thưởng nhiệm vụ.
- **1 ngày**: Xây/nâng cấp Nhà, Chuồng Gà, Lò Rèn cấp 2, lập party 2–4 người vào `dng_mossroot_hollow` hạ gục `boss_thornback_elder` qua đủ 3 phase.
- **1 tuần**: Đạt mốc cấp độ MVP (Lv 20–25), rèn vũ khí chủ lực lên `+7` đến `+10`, hoàn thiện trang trại có hệ thống tưới cơ bản và thu thập đủ bộ trang bị dungeon.
- **1 tháng (Post-MVP Roadmap)**: Chinh phục Ironpeak Mountains và Crystal Caverns, xây dựng đa đội hình nguyên tố, nâng cấp công trình cấp cao và chuẩn bị tiến vào các hầm ngục cấp 50+.
