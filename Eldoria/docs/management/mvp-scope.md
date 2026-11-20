# MVP Scope Definition — Eldoria: Forgotten Wilds

**Trạng thái**: Baseline v1.0  
**Cập nhật lần cuối**: 2026-11-19  
**Tham chiếu**: [Constitution](../../.specify/memory/constitution.md), [00-game-vision.md](../game-design/00-game-vision.md)

---

## 1. Mục tiêu Vertical Slice MVP

MVP của **Eldoria: Forgotten Wilds** được thiết kế theo triết lý **Vertical Slice hoàn chỉnh từ đầu đến cuối** — đủ nhỏ để một đội ngũ nhỏ triển khai an toàn trên nền **JSON-Only Local Database**, nhưng đủ sâu để người chơi trải nghiệm trọn vẹn vòng lặp `Explore → Gather → Combat → Loot → Craft → Upgrade → Build → Unlock → Boss Battle` cùng bạn bè trong thời gian thực.

---

## 2. Bảng Phạm vi MVP so với Tầm nhìn Dài hạn (Full Catalog)

| Hạng mục | Phạm vi MVP (Milestone 1 — Vertical Slice) | Tầm nhìn Dài hạn (Catalog Thiết kế) | Ghi chú ranh giới |
| :--- | :--- | :--- | :--- |
| **Khu vực Thế giới** | 2 khu vực: `reg_greenhaven_village` (Làng + Lãnh địa), `reg_whispering_forest` (Rừng) + 1 Dungeon `dng_mossroot_hollow` | 8 khu vực (`reg_*`) + 5+ Dungeon | Bản đồ Tiled `.tmj`/`.json`, phân vùng zone/instance |
| **Giới hạn Cấp độ** | Level 1 – 30 (soft endgame MVP ở Lv 20–25) | Level 1 – 100 | Công thức EXP/Stat đã định nghĩa đủ 1–100 |
| **Nhân vật chơi được** | 3 nhân vật (`chr_kael_vanguard`, `chr_lyra_windrunner`, `chr_seraphina_dawn`) mở khóa starter + sưu tầm mở rộng từ banner nội tệ | 12 nhân vật trải đủ 8 Class, 9 Nguyên tố, 6 Rarity | Toàn bộ 12 nhân vật đều có thiết kế & JSON hoàn chỉnh |
| **Kỹ năng** | 15 kỹ năng trong `skills.json` + Basic Attack nhúng sẵn trong `characters.json` (tức 1 Basic + 1 Passive + 3 Active + 1 Ultimate cho mỗi nhân vật MVP) | 60 kỹ năng độc lập trong `skills.json` (+ 12 Basic Attack nhúng) | Kiến trúc skill data-driven mở rộng không cần viết lại engine |
| **Quái vật thường** | 8 quái vật (`mob_moss_slime`, `mob_forest_goblin`, `mob_timber_wolf`, `mob_spore_cap`, `mob_briar_boar`, `mob_hollow_bat`, `mob_root_crawler`, `mob_goblin_shaman`) | 30 quái vật thường | AI State Machine đầy đủ 10 trạng thái |
| **Elite Monster** | 1 Elite (`mob_elite_alpha_direwolf`) | 8 Elite Monster (1/vùng) | Có cơ chế triệu hồi bầy & telegraph riêng |
| **Boss** | 1 Boss 3 phase (`boss_thornback_elder` trong `dng_mossroot_hollow`) | 5 Boss đa giai đoạn | Có stagger/break, telegraph rõ, anti-exploit arena |
| **Vũ khí** | 10 vũ khí đại diện cho các starter & drop dungeon | 40 vũ khí (11 `WeaponType`) | Hỗ trợ đầy đủ enhancement `+0` → `+10` |
| **Trang bị (Armor/Acc)** | 12 trang bị khởi đầu & bộ Mossroot | 40 trang bị + bộ set bonus | Đủ các slot Helmet, Chest, Gloves, Boots, Ring, Necklace, Accessory |
| **Cường hóa Vũ khí** | `+0` đến `+10` (nâng cấp chắc chắn 100% khi đủ nguyên liệu, không vỡ/tụt cấp) | `+0` đến `+10` + đánh giá mở rộng phụ trợ (socketing/reforging) | Xử lý atomic trên JSON DB + WAL |
| **Nguyên liệu & Chế tạo** | 22 nguyên liệu MVP (trên 50 tổng), **22 công thức MVP** (Smelting, Blacksmith, Cooking, Alchemy) | 50 nguyên liệu, **36 công thức** | Gắn trực tiếp chuỗi thu hoạch → nấu ăn / rèn |
| **Nông trại & Chăn nuôi** | 5 cây trồng (`crp_sunwheat`, `crp_berry_bush`, `crp_moon_herb`, `crp_golden_carrot`, `crp_ember_pepper`), 2 động vật (`anm_meadow_chicken`, `anm_clover_cow`) | 15 cây trồng, 6 động vật (kể cả fantasy animals) | Chu kỳ ngày/đêm, tưới nước, tiến trình offline theo server timestamp |
| **Xây dựng & Nhà cửa** | 6 công trình cốt lõi (`bld_player_house`, `bld_storage`, `bld_farm_plot`, `bld_chicken_coop`, `bld_blacksmith`, `bld_kitchen`) | 13 công trình (gồm Barn, Workshop, Furnace, Alchemy Lab, Training Ground, Stable, Guild Hall) | Grid snapping, ghost preview, server validation |
| **Gacha & Sưu tầm** | Permanent Character Banner (`bnr_perm_heroes`) & Permanent Weapon Banner (`bnr_perm_arsenal`) — 100% dùng `STARLIGHT_SHARD` kiếm trong game | Thêm 2 Limited Banner xoay vòng theo mùa (`4` banner chuẩn) | Công khai xác suất, hard pity **80 (Hero) / 70 (Weapon)**, soft pity **65 / 55**, chuyển đổi trùng lặp sang `STAR_ESSENCE` |
| **Multiplayer & Social** | Đồng bộ người chơi trong vùng (20 Hz sim), Chat (Zone/Party), Party (2–4 người), Co-op Combat & Boss Instance, Save & Reconnect | Bạn bè nâng cao, Trade, Marketplace, Guild, Raid 8 người, PvP Arena | PvE & Co-op ưu tiên tuyệt đối |
| **Lưu trữ & Hạ tầng** | 100% Local JSON Database (`data/db/**/*.json`) + In-memory cache + Local static assets | Sharded local JSON + backup/archive automation | KHÔNG dùng SQL/NoSQL ngoài, KHÔNG dùng Redis/S3/dịch vụ thứ 3 |

---

## 3. Danh mục Ngoài phạm vi MVP (Explicit Out-of-Scope for M1)

Các tính năng sau đã được phân tích trong kiến trúc dài hạn nhưng **CỐ Ý loại khỏi MVP** để giữ rủi ro kiểm soát được:
1. **Thanh toán tiền thật (Real-money IAP / Cash Shop)**: Cấm hoàn toàn trong MVP theo Hiến pháp.
2. **PvP Open-World / Arena & Guild War**: Cần cân bằng riêng và kiểm thử tải mạng trước khi mở (Milestone 4+).
3. **Player-to-Player Trade & Auction House / Marketplace**: Rủi ro lạm phát và bot cao; đưa vào Milestone 3 sau khi ổn định nền kinh tế & sổ cái JSON.
4. **Hỗ trợ hàng nghìn người chơi trên cùng một bản đồ (MMO-scale single shard)**: Không tuyên bố hỗ trợ trước khi có kết quả load test thực tế (mục tiêu kiểm chứng ban đầu 20 → 50 → 100 → 500 concurrent players phân vùng theo zone).
5. **Mobile Touch UI hoàn chỉnh & Gamepad Native**: Chỉ thiết kế layout responsive và roadmap điều khiển; MVP ưu tiên bàn phím + chuột trên Desktop.
6. **Hệ thống cường hóa xác suất có rủi ro vỡ đồ**: Không sử dụng trong MVP; chỉ cân nhắc nghiên cứu độc lập nếu cần ở hậu bản.

---

## 4. Tiêu chí Nghiệm thu Vertical Slice MVP (Exit Criteria)

Một bản dựng MVP chỉ được coi là đạt chuẩn khi chứng minh được luồng chơi liên tục sau:
1. Người chơi đăng ký tài khoản cục bộ (lưu JSON + hash mật khẩu), chọn 1 trong 3 nhân vật khởi đầu và vào `reg_greenhaven_village`.
2. Di chuyển mượt (60 FPS render / 20 Hz server tick), gặp và chat với ít nhất 1 người chơi khác cùng zone.
3. Thu thập gỗ/đá/quặng, trồng & thu hoạch nông sản, chăm sóc gà/bò, nấu 1 món ăn có buff chỉ số.
4. Xây dựng/nâng cấp `bld_blacksmith`, rèn vũ khí và cường hóa vũ khí ít nhất từ `+0` lên `+10` trong kịch bản test với giao dịch JSON nguyên tử.
5. Nhận `STARLIGHT_SHARD` từ nhiệm vụ/boss và thực hiện quay 1 lần & 10 lần trên banner với pity được lưu bền vững.
6. Lập party 2–4 người, vào `dng_mossroot_hollow`, hạ gục `boss_thornback_elder` qua đủ 3 phase và nhận chiến lợi phẩm theo quyền sở hữu công bằng.
7. Ngắt kết nối đột ngột giữa phiên và kết nối lại (reconnect) mà không mất vật phẩm, không nhân bản tiền tệ, không hỏng tệp JSON.
