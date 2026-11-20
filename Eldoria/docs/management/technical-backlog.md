# Technical Backlog & Prioritized Engineering Roadmap — Eldoria: Forgotten Wilds

**Trạng thái**: Design Baseline v1.0 (`DESIGN_AND_PLANNING_ONLY`)  
**Cập nhật lần cuối**: 2026-11-19  
**Tham chiếu**: [`feature-roadmap.md`](./feature-roadmap.md), [`mvp-scope.md`](./mvp-scope.md), [`simulation-results.md`](../balancing/simulation-results.md)

---

## 1. Nguyên tắc Sắp xếp Backlog

- **Ưu tiên P0 (Blocking Foundation & Constitution Compliance)**: Phải xong trước mọi tính năng gameplay (`JsonDatabaseEngine`, `GameCatalogLoader`, `SimulationLoop 20 Hz`, `Auth/Ownership`).
- **Ưu tiên P1 (MVP Vertical Slice & Real Simulation Fixes)**: Toàn bộ lát cắt dọc chơi được từ đầu đến cuối + điều chỉnh cân bằng thực tế phát hiện bởi mô phỏng (như `BLG-BAL-001` điều chỉnh Boss TTK từ `25s` về `120–210s`).
- **Ưu tiên P2–P3 (M2–M5 Post-MVP Expansions)**: Mở rộng 6 vùng còn lại, 9 nhân vật tiếp theo, Safe Trade, Guild, Gamepad, Mobile Touch.
- *Lưu ý*: Toàn bộ ước lượng nỗ lực (person-weeks) là giả định thiết kế ban đầu (`proposed / unverified`), cần hiệu chuẩn lại sau Sprint 1.

---

## 2. Danh mục Backlog Theo Cột mốc & Mức độ Ưu tiên

### 2.1 Milestone 1 — Vertical Slice MVP (Ưu tiên Cao nhất)

| Mã Backlog | Hạng mục Kỹ thuật | Spec / Tài liệu Liên quan | Ưu tiên | Phụ thuộc | Ước lượng (`proposed`) |
| :--- | :--- | :--- | :---: | :--- | :---: |
| `BLG-001` | Khởi tạo Monorepo (`apps/client`, `apps/game-server`, `packages/shared`, `packages/game-config`) | `specs/001-foundation-game-engine` | `P0` | Không | 0.5 tuần |
| `BLG-002` | Xây dựng **`JsonDatabaseEngine`** 100% cục bộ (`AsyncLockManager`, Atomic `tmp→fsync→rename`, WAL 2PC, `CrashRecoveryService`, `IndexRebuilder`, `StaggeredDirtyFlusher`, `LocalBackupService`) | `specs/001`, `database-design.md`, `ADR-001` | `P0` | `BLG-001` | 2.0 tuần |
| `BLG-003` | `GameCatalogLoader` nạp & kiểm chứng chéo 12 tệp `game-data/*.json` (fail-fast) + REST `/catalog` | `specs/001`, `validate-catalog.mjs` | `P0` | `BLG-001` | 0.5 tuần |
| `BLG-004` | Vòng lặp `SimulationLoop` 20 Hz + vỏ Phaser 3 `640x360` pixel-perfect + `GameUiBridge` | `specs/001`, `ADR-002`, `ADR-004` | `P0` | `BLG-001` | 1.0 tuần |
| `BLG-016` | **Local Docker Stack (Redis + MinIO S3) & Glitch-Free 2D Multi-Animation Pipeline (`013`)**: `docker-compose.yml` (`redis:7-alpine`, `minio/minio`, `minio-init`), `LocalRedisAdapter` (RAM fallback), `LocalMinioAdapter` (`eldoria-assets` / `eldoria-backups`), `PixelCameraController`, `DepthLayerManager`, 25-state HFSM + `AnimationStuckWatchdog`, `pack-and-verify-assets.mjs` | `specs/013-local-infra-pixel-animation`, `ADR-007` | `P0` | `BLG-001`, `BLG-004` | 2.0 tuần |
| `BLG-005` | `IdentityModule` (`crypto.scrypt`, JWT 15m, Refresh Rotation, Brute-Force Lockout) & `CharacterModule` (WAL tạo 4 nhân vật/tài khoản, `StatCalculator`) | `specs/002-auth-character` | `P0` | `BLG-002`, `BLG-003` | 1.5 tuần |
| `BLG-006` | `WorldModule` & `MovementModule`: Tiled `.tmj` collision dùng chung, `SpatialHashGrid` (`256px` / `5x5`), Prediction/Reconciliation, Day/Night/Weather, Homestead `60s` unload | `specs/003-world-movement` | `P0` | `BLG-004`, `BLG-005` | 2.5 tuần |
| `BLG-007` | `CombatModule` & `SkillModule`: 15 kỹ năng MVP (trên engine 60 kỹ năng), Hitbox server, Dodge i-frame `300ms`, Block/Parry `200ms`, 9-Element Reactions, CC DR | `specs/004-combat-skills` | `P1` | `BLG-006` | 3.0 tuần |
| `BLG-BAL-001` | **Hiệu chỉnh Boss TTK Pacing (Phát hiện thực tế từ Simulation)**: Giảm trọng số `STR/DEX/INT` trong `StatCalculator` (`2.4→0.85` / `1.4→0.45` / `2.2→0.85`) + nhân hệ số `Boss HP ~1.5x` để đưa TTK `boss_thornback_elder` từ `25s` lên vùng lý tưởng `120–210s` | `simulation-results.md`, `combat-formulas.md`, `bosses.json` | `P1` | `BLG-007` | 0.5 tuần |
| `BLG-008` | `InventoryModule`, `LootModule` (`PERSONAL_INSTANCED`, `120s` TTL) & `EconomyModule` (`CurrencyLedger` WAL) | `specs/005-inventory-loot` | `P1` | `BLG-002`, `BLG-007` | 2.0 tuần |
| `BLG-009` | `Gathering` (`ResourceNode`) & `CraftingModule` (22 công thức MVP Smelting/Cooking/Alchemy/Forge) | `specs/006-gathering-crafting` | `P1` | `BLG-006`, `BLG-008` | 2.0 tuần |
| `BLG-010` | `EquipmentModule` (10 slots, Sets, Repair) & `EnhancementModule` (Chắc chắn `+0 → +10`, cổng `bld_blacksmith` Lv 1–4, WAL `UpgradeHistory`) | `specs/007-equipment-enhancement` | `P1` | `BLG-007`, `BLG-008`, `BLG-009` | 1.5 tuần |
| `BLG-011` | `BuildingModule` (6 công trình MVP, Ghost Preview, BFS Reachability), `FarmingModule` (5 cây MVP), `AnimalModule` (Gà/Bò, 24h Server-Time Offline Cap) | `specs/008-housing-farming` | `P1` | `BLG-006`, `BLG-008`, `BLG-009` | 3.0 tuần |
| `BLG-012` | `GachaModule` (`bnr_perm_heroes`, `bnr_perm_arsenal`, CSPRNG trong lock, Pity `65/80` & `55/70`, `STAR_ESSENCE` shop, WAL `GachaHistory`) | `specs/009-gacha-collection` | `P1` | `BLG-005`, `BLG-008` | 1.5 tuần |
| `BLG-013` | `PartyModule` (2–4 người), `ChatModule` (Sanitized, 50-msg RAM ring buffer), `Friends`, Co-op Homestead `PARTY_ACCESS` & Reconnect `120s` | `specs/010-multiplayer-social` | `P1` | `BLG-006`, `BLG-007`, `BLG-008` | 2.0 tuần |
| `BLG-014` | `DungeonModule` (`dng_mossroot_hollow`), 10-State Monster AI (`8 + 1` MVP) & Multi-Phase Boss (`boss_thornback_elder`, Layer 180–199 Telegraph, Poise Stagger, Anti-Exploit) | `specs/011-dungeon-boss` | `P1` | `BLG-007`, `BLG-013` | 3.0 tuần |
| `BLG-QST-001` | **Đặc tả & Triển khai `QuestModule` & Onboarding `OB-1..OB-8` (Phát hiện từ Review Board `QA-P1-01`)**: Bổ sung Spec Kit độc lập `specs/014-quests-onboarding` cho backend `QuestModule` (Module #16/21 trong `backend-architecture.md`: `/quests/:questId/accept`, `/quests/:questId/claim`, trình nghe sự kiện kill/gather/craft/build, kiểm chứng DAG 12 quest MVP, tránh trôi nhiệm vụ hướng dẫn đầu game) trước khi chạy Sprint Quest của M1 | `18-quest-and-npc.md`, `game-data/quests.json`, `api-contracts.md`, `backend-architecture.md` | `P1` | `BLG-008`, `BLG-009`, `BLG-011` | 1.5 tuần |
| `BLG-015` | Bộ 24 màn hình React Pixel Fantasy UI (`SCR-01..24`), Font Việt hóa cục bộ, WCAG AA, A11y & Playwright QA Harness + Load Test Bot Swarm (20–500 CCU) | `specs/012-game-ui-qa`, `performance-test-plan.md` | `P1` | `BLG-005`..`BLG-014`, `BLG-QST-001` | 3.0 tuần |
| `BLG-ART-001` | Sản xuất Wave 1 Pixel Art & Audio Assets (3 MVP Heroes, 8+1 Mobs, Thornback Boss, Greenhaven/Forest/Mossroot Tilesets, 6 Buildings, SFX/BGM cục bộ) | `asset-production-backlog.md` | `P1` | Song song từ Sprint 1 | ~159 ngày công họa sĩ/âm thanh (`proposed`) |

### 2.2 Milestone 2 – 5 (Post-MVP Expansions)

| Mã Backlog | Hạng mục Mở rộng | Milestone | Ưu tiên | Điều kiện tiên quyết |
| :--- | :--- | :---: | :---: | :--- |
| `BLG-M2-01` | Vùng `reg_ironpeak_mountains`, `dng_slag_foundry`, `boss_ignis_forgelord`, mở cấp `31–45`, 4 hero tiếp theo, 4 công trình (`Barn`, `Workshop`, `Furnace`, `Alchemy Lab`), Equipment Socketing | M2 | `P2` | Đạt 100% tiêu chí M1 & Load Test 50 CCU |
| `BLG-M3-01` | Vùng `reg_crystal_caverns`, `reg_forgotten_ruins`, `boss_prism_leviathan`, Guild Hall, Safe P2P Trade (có WAL & audit), Auto-Irrigation Farming, cân nhắc chia `currency-ledger` theo ngày nếu > 100 CCU | M3 | `P2` | Ổn định lạm phát kinh tế M1–M2 |
| `BLG-M4-01` | Vùng `reg_frostbound_highlands`, `reg_ember_wasteland`, `boss_boreas_frostking`, Limited Banners nội tệ xoay vòng 21 ngày, Opt-in Normalized PvP Arena, Gamepad Support | M4 | `P3` | Hoàn thiện PvP modifier balance |
| `BLG-M5-01` | Vùng `reg_abyssal_kingdom`, `boss_malakor_abyss` (4 phases), Lv 100 Endgame, 8-Player Raid, Multi-Process Region Shard (nếu vượt trần JSON single-node 500 CCU), Mobile Touch UI | M5 | `P3` | Báo cáo Load Test 500 CCU |
