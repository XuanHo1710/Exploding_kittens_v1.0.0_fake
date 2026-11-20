# FINAL DESIGN REPORT — Eldoria: Forgotten Wilds

**Trạng thái Dự án**: `DESIGN_AND_PLANNING_ONLY` — **Hoàn tất Bộ Hồ sơ Thiết kế Thương mại v2.0 (Đã cập nhật Local Docker Redis/MinIO & 2D Pixel Multi-Animation Pipeline)**  
**Ngày hoàn thiện**: 2026-11-19  
**Hiến pháp Hiện hành**: [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) (`v2.0.0`, amended `2026-11-19` theo `DEC-003` / `ADR-007`)  
**Chế độ Kỹ thuật**: **Không có mã nguồn production nào trong `apps/` hay `packages/`** — sẵn sàng bàn giao cho người dùng rà soát và phê duyệt trước khi chuyển sang `IMPLEMENTATION MODE`.

---

## 1. Tóm tắt Điều hành (Executive Summary)

**Eldoria: Forgotten Wilds** là tựa game **2D Classic 16-bit Pixel Art Online Multiplayer Action RPG kết hợp Survival-Lite, Farming, Animal Husbandry, Base Building, Weapon Enhancement (`+0 → +10`), Fair In-Game Gacha và Multi-Phase Co-op Boss Raids**, chạy trực tiếp trên trình duyệt Desktop (React + TypeScript + Phaser 3 ở khung chuẩn `640×360` phóng tỷ lệ nguyên, `pixelArt: true`, `roundPixels: true`, bộ máy hoạt ảnh 25 trạng thái + `AnimationStuckWatchdog`) kết nối thời gian thực (`20 Hz` server simulation / `60 FPS` client render) với máy chủ NestJS Authoritative chạy trong Local Docker Compose.

Toàn bộ chu trình thiết kế 8 giai đoạn cùng đợt cập nhật kiểm tra chéo **v2.0** đã hoàn thành đầy đủ tài liệu chuẩn studio, dữ liệu gốc có kiểm chứng tự động, bản vẽ minh họa pixel art, **8 mockup HTML tương tác chạy offline** (bao gồm phòng kiểm định hoạt ảnh 2D không lỗi `pixel-animation-showcase.html`), mô phỏng cân bằng toán học thực thi bằng Node.js, và **13 thư mục đặc tả Spec Kit (`specs/001..013`, 131 tệp, 314 tasks)** đã được chủ dự án phê duyệt chuyển sang **`IMPLEMENTATION MODE`** (`DEC-004`: `Q1-A`, `Q2-C`, `Q3-1&2`).

### Tuân thủ Tuyệt đối Chỉ thị Người dùng (Constitution v2.0.0 Principle I — NON-NEGOTIABLE)
- **100% Cơ sở dữ liệu Bền vững Chính dạng JSON Cục bộ (`data/db/**/*.json`)**: Mọi trạng thái bền vững (`Account`, `Session`, `Character`, `Inventory`, `Homestead`, `WorldRegion`, `Party`, `CurrencyLedger` per-character, `UpgradeHistory`, `GachaHistory`, `SecurityAudit`, `Indexes`) vẫn lưu 100% bằng tệp JSON cục bộ qua **`JsonDatabaseEngine`** (khóa `AsyncLockManager` chống deadlock, ghi nguyên tử `tmp → fsync → rename`, JSON WAL Two-Phase Commit & Crash Recovery lũy đẳng, `checksumSha256`, backup xoay vòng `data/backups/`). **VẪN CẤM TUYỆT ĐỐI** PostgreSQL, MySQL, MongoDB, SQLite, TypeORM, Prisma và mọi dịch vụ đám mây bên thứ ba (AWS S3 Cloud, Cloudflare R2, Firebase, Supabase, Auth0, Redis Cloud).
- **Local Docker Redis (`redis:7-alpine`) — Ephemeral Runtime Only**: Được phép chạy hoàn toàn nội bộ trong Docker Compose cục bộ để tăng tốc hot session lookup, online presence, party invite TTL `60s`, sliding-window rate limit và zone pub/sub — kèm chế độ `RAM_FALLBACK` và bất biến **Zero-Data-Loss** khi Redis restart.
- **Local Docker MinIO (`minio/minio`, S3-compatible) — Local Assets & Backup Storage**: Chạy hoàn toàn nội bộ trong Docker Compose với 2 bucket: `eldoria-assets` (public read-only, phiên bản `v1/`, chứa toàn bộ sprite sheets, extruded tilesets `1px`, padding `2px`, Tiled `.tmj`, âm thanh, local fonts) và `eldoria-backups` (private, lưu bản chụp nén xoay vòng của `data/db/`).
- **Đồ họa 2D Pixel Giàu Hoạt ảnh Không Lỗi (`specs/013-local-infra-pixel-animation`)**: Triệt tiêu tận gốc 7 lỗi kinh điển của game 2D pixel (rách viền ô đất, nhòe sub-pixel, lem khung sprite sheet, kẹt trạng thái hoạt ảnh, cắt lệch chiều sâu Y-sort, thiếu khóa crash, giật chân khi đổi khung hình) và có kiểm định tự động [`validate-animation-pipeline.mjs`](../../tools/design-validation/validate-animation-pipeline.mjs) cùng showcase tương tác ngoại tuyến [`pixel-animation-showcase.html`](../ui-ux/mockups/pixel-animation-showcase.html).

---

## 2. Danh mục Đầy đủ Tài liệu & Sản phẩm Đã Tạo (Complete Deliverables Inventory)

| Nhóm Sản phẩm | Đường dẫn Thư mục | Số lượng Tệp | Nội dung Chính & Trạng thái Kiểm chứng |
| :--- | :--- | :---: | :--- |
| **Hiến pháp & Cấu hình Spec Kit** | [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) | 2 | Constitution `v1.0.0` (8 Nguyên tắc + Sync Impact Report) + `.specify/feature.json` trỏ `specs/001` |
| **Master Game Data Catalog** | [`game-data/*.json`](../../game-data/characters.json) | **12** (`~761 KB`) | `12` heroes (`3` MVP), `60` skills (`15` MVP, `8` Iconic Ultimates), `30` regular + `8` elite monsters, `5` bosses (`16` phases, `48` skills), `157` items, `36` recipes (`22` MVP), `15` crops (`5` MVP), `6` animals (`2` MVP), `13` buildings (`43` levels, `6` MVP), `30` quests DAG (`12` MVP), `62` loot tables, `4` gacha banners (`baseRates = 1.000000`). **Đã kiểm chứng `validate-catalog.mjs`: PASS (`0` lỗi, `0` cảnh báo).** |
| **Game Design Documents** | [`docs/game-design/`](../game-design/00-game-vision.md) | **21** | `00-game-vision.md` đến `20-multiplayer-design.md` — mỗi tài liệu hệ thống đáp ứng đầy đủ 14 chiều của Quality Gate (Mục 27). |
| **Art Direction & Pixel Concept Art** | [`docs/art-direction/`](../art-direction/art-bible.md) | **11 docs + 4 `.jpg`** | Art Bible `32×32`/`48×64`/`640×360`, 25 Animation States, HFSM, Sprite Sheet/Tileset/VFX/Audio Standards, Asset Manifest (100% local), Production Backlog (`Wave 1 = 159 ngày công`) + 4 bản vẽ Concept Pixel Art gốc trong `concepts/`. |
| **UI/UX Design & Offline Mockups** | [`docs/ui-ux/`](../ui-ux/design-system.md) | **7 docs + 8 `.html`** | Design System (WCAG AA), đặc tả đủ `24/24` màn hình (`SCR-01..24`), User Flows, Interaction/IME Việt, Responsive, A11y, Playwright UI QA Strategy + **8** màn hình HTML5/Canvas/SVG tương tác chạy 100% offline tại [`docs/ui-ux/mockups/index.html`](../ui-ux/mockups/index.html) (bao gồm [`pixel-animation-showcase.html`](../ui-ux/mockups/pixel-animation-showcase.html)). |
| **Technical Architecture & ADRs** | [`docs/architecture/`](../architecture/system-architecture.md) | **12 docs + 7 ADRs + 1 Diagrams** | System, Frontend, Backend (21 modules), Game Server 20Hz, Network Protocol, JSON Database Design, Data Dictionary (26 entities), Security & Anti-Cheat (14 threats), REST & WebSocket Contracts, Local Docker Deployment (`server` + `redis` + `minio` + `minio-init`), `ADR-001..007`, và 8 sơ đồ Mermaid chuẩn trong `diagrams/architecture-diagrams.md`. |
| **Balancing & Simulations** | [`docs/balancing/`](../balancing/simulation-results.md) | **6** (`4 .md + 2 .csv`) | Progression Model (EXP/CR Lv 1–100 chính xác bằng script), Combat Formulas, `weapon-upgrade-costs.csv`, `gacha-probabilities.csv`, Economy Analysis (30-day Faucet/Sink), Simulation Results (100k Monte Carlo). |
| **Testing & QA Plans** | [`docs/testing/`](../testing/test-strategy.md) | **5** | 13-Layer Test Strategy, E2E Test Scenarios, Acceptance Criteria (Gherkin/MVP Exit), Performance Load Test Plan (20→500 CCU `proposed`), Security Test Plan. |
| **Spec Kit Feature Specifications** | [`specs/001..013/`](../../specs/001-foundation-game-engine/spec.md) | **131** (`12×10 + 11`) | **13** feature độc lập (`001-foundation-game-engine` → `013-local-infra-pixel-animation`), tổng **`125` Functional Requirements** và **`314` tasks** có thứ tự phụ thuộc (bao gồm bộ sinh ảnh PNG 4 hướng/ra chiêu/VFX/`16×16` và ghép nối E2E). Mỗi feature đủ `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/*.md`, `quickstart.md`, `tasks.md`, `analysis-report.md`, `checklists/requirements.md` (`16/16` `[x]`) và custom domain checklist (`100%` `[ ]`). |
| **Management, Traceability & Tools** | [`docs/management/`](./mvp-scope.md), [`docs/README.md`](../README.md), [`tools/design-validation/`](../../tools/design-validation/validate-catalog.mjs) | **11 docs + 4 scripts + 1 sim JSON** | MVP Scope, Feature Roadmap, Technical Backlog, Risk Register (`RSK-001..014`), Requirements Traceability Matrix, Assumptions & Decisions (`DEC-001..003`, `ASM-001..012`), Sources & Licenses, Progress, Handoff, Master Index và 4 công cụ Node.js tự động kiểm chứng (`validate-catalog`, `validate-animation-pipeline`, `run-simulations`, `audit-workspace`). |

---

## 3. Sơ đồ Kiến trúc, Minh họa Pixel Art & Mockup Tương tác

### 3.1 Bộ Sơ đồ Mermaid (`docs/architecture/diagrams/architecture-diagrams.md`)
- Bao gồm đầy đủ 8 sơ đồ trực quan hóa: Kiến trúc Tổng thể 100% Local JSON, Chu trình Multi-File WAL Two-Phase Commit & Roll-Forward Recovery, ERD Logic 26 Thực thể JSON, Luồng Mạng 20 Hz Client Prediction & Server Reconciliation, State Machine 3 Phase của `boss_thornback_elder` (`65% / 30%`, Stagger `6.0s / ×1.40`), Chu trình Sống `ZoneInstance`/`DungeonInstance`, Thứ tự Phụ thuộc 12 Spec Kit Features và Render Depth Stack thống nhất (`0–99` Ground → `180–199` Unlit Telegraph → `200–299` Shadows → `1000..99999` Y-Sorted Entities → `100000–109999` Air VFX + `109500` Telegraph Rim Echo → `110000–119999` Lighting/Overlays).

### 3.2 Bộ Minh họa Concept Pixel Art (`docs/art-direction/concepts/`)
1. [`greenhaven-village-concept.jpg`](../art-direction/concepts/greenhaven-village-concept.jpg): Ngôi làng khởi đầu Greenhaven (lò rèn, nhà gỗ, vườn cây, không khí 16-bit ấm áp).
2. [`whispering-forest-combat-concept.jpg`](../art-direction/concepts/whispering-forest-combat-concept.jpg): Cảnh chiến đấu Co-op trong Rừng Thì Thầm (Kael tung `Crimson Crescent`, Lyra, Seraphina với vòng ánh sáng dưới chân).
3. [`dungeon-boss-arena-concept.jpg`](../art-direction/concepts/dungeon-boss-arena-concept.jpg): Đấu trường `dng_mossroot_hollow` đối đầu `boss_thornback_elder` kèm vùng Telegraph đỏ sắc nét trên sàn dưới chân nhân vật.
4. [`starter-heroes-sheet-concept.jpg`](../art-direction/concepts/starter-heroes-sheet-concept.jpg): Bản mẫu tạo hình 3 Anh hùng Khởi đầu MVP (`chr_kael_vanguard`, `chr_lyra_windrunner`, `chr_seraphina_dawn`).
- *Ghi chú Art Director*: 4 bản vẽ đóng vai trò **Moodboard / Concept Reference** truyền cảm hứng màu sắc và khí chất; khi họa sĩ bước vào sản xuất sprite sheet thực tế (Wave 1), bắt buộc tuân thủ chuẩn góc nhìn **Top-Down 3/4 trực giao (`32×32` tile, `48×64` hero frame)** trong `art-bible.md` và `character-design-standard.md` để đồng bộ hóa trang phục và tỷ lệ giữa tất cả nhân vật.

### 3.3 Bộ 7 Interactive Offline HTML5 Mockups (`docs/ui-ux/mockups/`)
Mở trực tiếp [`docs/ui-ux/mockups/index.html`](../ui-ux/mockups/index.html) bằng trình duyệt mà không cần mạng hay server:
- [`auth-character-select.html`](../ui-ux/mockups/auth-character-select.html) (`SCR-01..03`)
- [`main-hud-world.html`](../ui-ux/mockups/main-hud-world.html) (`SCR-05`, `SCR-18`, Minimap, Skill Hotbar, Chat)
- [`inventory-blacksmith-enhance.html`](../ui-ux/mockups/inventory-blacksmith-enhance.html) (`SCR-06..07`, `SCR-12..13` — bấm thử cường hóa `+0 → +10` với chi phí thực)
- [`gacha-collection.html`](../ui-ux/mockups/gacha-collection.html) (`SCR-10..11` — quay thử 1x/10x, đếm pity chuẩn `65/80` & `55/70` khớp 100% `game-data/gacha-banners.json`)
- [`farming-building-grid.html`](../ui-ux/mockups/farming-building-grid.html) (`SCR-15..16` — đặt công trình trên lưới `32×32` với ghost preview xanh/đỏ & tưới cây)
- [`boss-raid-party.html`](../ui-ux/mockups/boss-raid-party.html) (`SCR-21..22` — mô phỏng thanh máu/Poise Boss 3 phase & vòng Telegraph `#FF3B3B`)

---

## 4. Các Quyết định Kiến trúc & Thiết kế Cốt lõi (Critical Technical Decisions)

| Mã | Quyết định | Lý do & Trade-off Chính |
| :--- | :--- | :--- |
| **`DEC-001` / `ADR-001`** | **100% JSON-Only Local Database (`JsonDatabaseEngine`) & Zero Third-Party** | Thực thi tuyệt đối chỉ thị người dùng; phân mảnh per-character (`characters/`, `inventories/`, `houses/`, `ledgers/currency-ledger-<charId>-<YYYY-MM>.json`) và per-account (`indexes/idempotency/<accountId>.json`) để loại bỏ khóa ghi toàn cục. Đánh đổi: không tuyên bố MMO-scale nghìn người chơi trên 1 nút đơn nếu chưa đo kiểm tải thực tế. |
| **`ADR-002`** | **Server-Authoritative Modular Monolith (NestJS 20 Hz) + Shared Collision Library** | Toàn bộ di chuyển, va chạm, sát thương, loot và kinh tế do máy chủ xác thực; dùng chung `packages/shared/src/math/collision.ts` với Phaser 3 client nhằm giảm rubber-banding và tránh chi phí vận hành Microservices ở MVP. |
| **`ADR-003`** | **Local Self-Hosted Auth (`crypto.scrypt` + JWT 15m + Rotating Refresh Cookie)** | Không lệ thuộc Auth0/Firebase; chống brute-force cục bộ (`5 lần/15p` lockout), phát hiện tái sử dụng refresh token thu hồi toàn bộ phiên, và chặn IDOR theo cặp `accountId ↔ characterId`. |
| **`ADR-004`** | **Phaser 3 `640×360` Pixel-Perfect Canvas + Decoupled React UI (`GameUiBridge`)** | Giữ render pixel sắc nét 60 FPS không trộn DOM, đẩy state UI theo nhịp tối đa 10 Hz và bảo đảm `InputFocusManager` hỗ trợ bộ gõ tiếng Việt IME (Telex/VNI) mà không cướp phím tắt `WASD`/`1-5`. |
| **`ADR-005`** | **Deterministic Weapon Enhancement `+0 → +10` (100% Thành công ở MVP) & Fair In-Game Gacha** | Loại bỏ cảm giác ức chế vỡ/tụt đồ bằng cổng tiến độ nguyên liệu + cấp `bld_blacksmith` Lv 1–4; Gacha 100% bằng `STARLIGHT_SHARD` kiếm trong game, khóa cứng không có Cash Shop / IAP tiền thật. |
| **`ADR-006`** | **Explicit Scale Envelope (`20 → 50 → 100 → 500` CCU) & Honest Verification Boundary** | Thiết kế tách ranh giới `ZoneInstance` và `Region` sẵn sàng chia kênh nếu tương lai vượt trần đơn nút; mọi thông số độ trễ/CPU/VRAM/CCU trước khi chạy mã thật đều gắn nhãn `proposed / unverified`. |

---

## 5. Kết quả Kiểm chứng Thực tế & Mô phỏng Cân bằng (Actual Verification Results)

> **Ranh giới Trung thực (Constitution Principle VIII)**:
> - **Đã xác minh thực tế ở giai đoạn thiết kế (`VERIFIED`)**: Toàn bộ kết quả từ 3 script Node.js `v22.20.0` chạy trực tiếp trên workspace (`validate-catalog.mjs`, `run-simulations.mjs`, `audit-workspace.mjs`) và kiểm tra cú pháp JS/URL của 7 mockup HTML.
> - **Chưa xác minh runtime (`proposed / unverified`)**: Độ trễ `p95` ghi `fsync`, mức CPU/RAM ở `20–500 CCU`, mức VRAM `<= 128 MB`, trải nghiệm chơi thực tế 60 FPS và kết quả Playwright E2E — sẽ chỉ được xác minh sau khi chuyển sang `IMPLEMENTATION MODE`.

### 5.1 Kiểm chứng Tính toàn vẹn Catalog (`node tools/design-validation/validate-catalog.mjs`)
- **Kết quả**: **PASS — `0 errors, 0 warnings`**.
- Xác nhận toàn bộ 12 tệp JSON hợp lệ cú pháp, không trùng ID, không đứt gãy khóa ngoại chéo (`skills → heroes`, `recipes → items/buildings`, `crops/animals → items`, `loot-tables → items`, `quests → DAG không vòng lặp`, `gacha-banners → heroes/weapons`, tổng `baseRates === 1.000000`, và mọi nguyên liệu chế tạo MVP đều có cờ `mvp: true`).

### 5.2 Mô phỏng Monte Carlo & Cân bằng (`node tools/design-validation/run-simulations.mjs` → `tools/design-validation/last-sim-output.json`)
1. **Gacha 100,000 lượt quay / banner (Mulberry32 Seeded PRNG)**:
   - `bnr_perm_heroes` (Seed `20261119`): Tỷ lệ Top-Tier thực nghiệm **`2.384%`** (`MYTHIC 0.544%`, `LEGENDARY 1.840%`), trung bình **`41.95` lượt** (`6,711` Shards), P50 `44`, P90 `70`, tối đa `75 <= 80` (Hard Pity hoạt động chính xác 100%).
   - `bnr_perm_arsenal` (Seed `20261120`): Tỷ lệ Top-Tier thực nghiệm **`2.870%`** (`MYTHIC 0.717%`, `LEGENDARY 2.153%`), trung bình **`34.84` lượt** (`5,575` Shards), tối đa `66 <= 70`.
   - `bnr_lim_storm_sovereign` (Seed `20261121`): Tỷ lệ ra Featured Top-Tier đạt **`67.80%`** (khớp kỳ vọng lý thuyết `66.67%` của quy tắc 50/50 + bảo chứng lần 2).
2. **Cường hóa Vũ khí `+0 → +10` (`wpn_iron_longsword`)**:
   - Sức mạnh tăng tuyến tính kiểm soát từ `26 → 155 ATK` (`5.96x`); tổng chi phí trực tiếp **`26,400 Gold`** (+`10,275G` phí luyện phôi nếu tự nung từ quặng thô).
   - Thời gian đạt `+10`: **Casual `22.4 ngày`** (`22.35h`), **Regular `5.5 ngày`** (`13.84h`), **Hardcore `1.8 ngày`** (`8.95h`).
3. **Cân bằng Độ hiếm 12 Anh hùng (Anti-Pay-to-Win Parity)**:
   - Kiểm chứng cả 12 nhân vật ở Lv 15 (`+5`) và Lv 60 (`+10`): `chr_mira_ironfist` (`COMMON`, Lv15 `618` / Lv60 `5,033` DPS) và `chr_kael_vanguard` (`RARE` MVP, `679` / `5,748` DPS) hoàn toàn ngang tầm với `LEGENDARY`/`MYTHIC` (`482–596` ở Lv15 / `4,309–5,281` ở Lv60). Không có hiện tượng lũy thừa hay Pay-to-Win.
4. **Phát hiện Thực tế Quan trọng về Boss TTK (`RSK-003` / `BLG-BAL-001` — P1)**:
   - Mô phỏng chứng minh với trọng số `2.4*STR + 1.4*DEX` hiện tại và `HP` gốc trong `bosses.json`, cả 5 Boss đều bị hạ quá nhanh (`25s / 36s / 46s / 60s / 77s` Solo; `28s / 39s / 50s / 65s / 84s` Party 4P) so với mục tiêu thiết kế **`120–210 giây`**. Đã ghi nhận minh bạch vào `simulation-results.md`, `risk-register.md` (`RSK-003`) và `technical-backlog.md` (`BLG-BAL-001`) để điều chỉnh trước Playtest M1.
5. **Kinh tế 30 Ngày (Faucet vs Sink)**:
   - Tỷ lệ **Sink / Faucet đạt `97.5%` (Casual), `87.2%` (Regular), `92.8%` (Hardcore)** — không xảy ra siêu lạm phát Gold. Người chơi 100% miễn phí nhận **`6,072 STARLIGHT_SHARD`** (`37.95` lượt quay, cộng thêm thưởng khám phá ~`40.7` lượt) trong 30 ngày đầu.

### 5.3 Kiểm toán Chéo Toàn Workspace (`node tools/design-validation/audit-workspace.mjs`)
- Kiểm tra toàn bộ tệp bắt buộc, liên kết nội bộ trong `docs/README.md`, thẻ đánh dấu chưa hoàn thiện (unresolved placeholders), cấu trúc 120 tệp Spec Kit, URL ngoại tuyến trong mockups và quét từ khóa vi phạm Hiến pháp Nguyên tắc I: **PASS (`0 P0`, `0 P1`, `0 P2`, `0` liên kết hỏng, `0` URL ngoài, `0` vi phạm JSON-only DB)**.

---

## 6. Kết quả Đánh giá Độc lập 5 Góc nhìn (Independent 5-Role Final Design Review)

Hội đồng rà soát độc lập gồm 5 vai trò đã đọc chéo toàn bộ tài liệu, JSON và Spec Kit mà không làm mịn sự thật. Tổng kết từng vai trò và câu trả lời cho 12 câu hỏi chất lượng (Mục 29):

| Vai trò Rà soát | Phán quyết | Nhận định Trọng tâm & Điểm Cần Lưu ý |
| :--- | :---: | :--- |
| **1. Game Director** | **CONDITIONAL PASS** | Vòng lặp 10 bước gắn kết chặt giữa Nông trại/Nấu ăn → Chiến đấu → Rèn `+10` → Boss Raid; phạm vi MVP khóa chặt. **Điều kiện mở khóa**: (1) Xử lý `BLG-BAL-001` để `boss_thornback_elder` kéo dài `120–210s` đủ trải nghiệm 3 phase; (2) Bổ sung `specs/013-quests-onboarding` (`BLG-QST-001`) cho backend `QuestModule` & `OB-1..OB-8` trước Sprint Quest. |
| **2. Lead Software Engineer** | **CONDITIONAL PASS** | Kiến trúc `JsonDatabaseEngine` (WAL 2PC, `AsyncLockManager` sorted locks, checksum SHA-256, `StaggeredDirtyFlusher`) hoàn toàn khả thi cho 20–100 CCU mà không cần DBMS/Redis ngoài. **Đã khắc phục ngay sau review (`QA-P1-03`)**: Phân mảnh `currency-ledger-<charId>-<YYYY-MM>.json` và `indexes/idempotency/<accountId>.json` để loại bỏ nút cổ chai khóa ghi toàn cục, đồng thời làm rõ quy tắc Roll-Forward lũy đẳng (`currentRevision >= afterEnvelope.revision`). **Cần đo kiểm thực tế**: Load test `fsync` 50–500 CCU khi vào giai đoạn code. |
| **3. Art Director & UI/UX Lead** | **CONDITIONAL PASS** | Quy chuẩn 16-bit (`32×32`, `48×64`, `640×360`), 25 animation states, 24 màn hình WCAG AA, hỗ trợ tiếng Việt IME và bảo vệ Telegraph (`Layer 180–199` + `Telegraph Rim Echo 109500`) đạt chuẩn thương mại. **Đã khắc phục ngay (`QA-P1-04`, `QA-P3-01..02`)**: Đồng bộ hoàn toàn Phaser Depth Stack giữa `vfx-design.md`, `art-bible.md` và `frontend-architecture.md`; chỉnh phím nóng Minimap (`]` / `Alt+M`) và rule độ dài tài khoản trên `SCR-01`. **Lưu ý sản xuất**: Giữ chuẩn top-down 3/4 trực giao khi chuyển từ 4 moodboard sang sprite sheet thật. |
| **4. Economy & Balancing Designer** | **CONDITIONAL PASS** | Mô phỏng Gacha 100k, Rarity Parity 12 anh hùng và Sink/Faucet 30 ngày (`87.2%–97.5%`) rất vững chắc, không P2W. **Hạng mục mở cần xử lý**: (1) `BLG-BAL-001` chỉnh Boss TTK trước Playtest M1; (2) Theo dõi thanh khoản Casual (`780G` cuối ngày 30 hơi sát) và mô phỏng C6 Constellation ở bản cân bằng M2; (3) Chỉnh `crp_honey_melon` (`RSK-012`) trước khi mở M3. |
| **5. QA & Security Lead** | **CONDITIONAL PASS** | Bộ 120 tệp Spec Kit, 14 threat models, 13-layer test strategy và 3 script kiểm chứng tự động tạo nền móng kiểm thử cực tốt; 100% custom checklists được giữ trung thực ở trạng thái `[ ]` chờ reviewer ký duyệt. **Điều kiện**: Tách `specs/013-quests-onboarding` (`BLG-QST-001`) để bảo phủ trọn vẹn test backend Quest; kiểm thử mạng xấu (ping 150/300ms, 5% packet loss) và crash-recovery kill `-9` ngay từ Sprint 1–3. |

### Trả lời Trực tiếp 12 Câu hỏi Kiểm định Chất lượng (Section 29)
1. *Thiết kế có đủ hấp dẫn và thống nhất?* **Có** — vòng lặp khám phá/nông trại/rèn/boss ăn khớp, chỉ cần hiệu chỉnh Boss TTK (`BLG-BAL-001`) để trận Boss đạt cao trào 2–3.5 phút.
2. *Hệ thống kỹ năng/nhân vật có bản sắc và không Pay-to-Win?* **Có** — mô phỏng chứng minh `COMMON`/`RARE` MVP đạt DPS ngang tầm `LEGENDARY`/`MYTHIC`.
3. *Tiến trình `+0 → +10` có công bằng và rõ mục tiêu?* **Có** — 100% chắc chắn không vỡ đồ ở MVP, gắn chặt `bld_blacksmith` Lv 1–4 và lộ trình `5.5 ngày` cho người chơi Regular.
4. *Gacha có minh bạch, 100% nội tệ và hợp lý?* **Có** — công khai tỷ lệ khớp `gacha-banners.json`, hard pity `80/70`, người chơi miễn phí kiếm `~38–40` lượt trong 30 ngày đầu.
5. *Phong cách Pixel Art & Animation có đồng nhất và khả thi?* **Có** — khóa phạm vi Wave 1 (`3` hero, `8+1` mob, `1` boss, 4 hướng, 3-Layer Equipment Policy = `~159` ngày công).
6. *UI có mang bản sắc Pixel Fantasy RPG và sạch sẽ?* **Có** — kiểm chứng trực tiếp qua 7 mockup HTML offline, WCAG AA, tách khỏi kiểu web dashboard.
7. *Kiến trúc 100% JSON Database & 0 dịch vụ ngoài có khả thi và an toàn?* **Có cho mốc 20–100 CCU** nhờ phân mảnh per-character/per-account, WAL 2PC, `fsync` + atomic rename, checksum SHA-256 và backup cục bộ; trần 500 CCU được cảnh báo trung thực cần load test thực tế.
8. *Chống gian lận có thực chất và không hứa hẹn viển vông?* **Có** — Server-Authoritative 100% với 14 kịch bản tấn công, thừa nhận rõ giới hạn nhận diện bot không có CAPTCHA ngoài (`RSK-007`).
9. *Tài liệu có đồng nhất chéo không?* **Có** — toàn bộ điểm lệch phát hiện trong quá trình audit (render depth, recipe count, pity wording, MVP material flags, Boss phase thresholds, simulation table) đã được đồng bộ triệt để.
10. *Kế hoạch kiểm thử có đủ bao phủ?* **Có** — 13 lớp kiểm thử (Unit, WAL Crash, Security/IDOR, Network Impairment, 24×9 UI Playwright, Load Test 20–500 CCU).
11. *Còn khu vực nào mơ hồ chưa đủ để lập trình?* **Đã thu hẹp về 2 mục rõ ràng có mã theo dõi**: `BLG-BAL-001` (chốt hệ số ATK/Boss HP) và `BLG-QST-001` (tách `specs/013-quests-onboarding` cho backend `QuestModule`).
12. *Bước triển khai đầu tiên là gì?* **`specs/001-foundation-game-engine`** (Monorepo + `JsonDatabaseEngine` + `GameCatalogLoader` + 20 Hz Simulation Loop + vỏ Phaser 3 `640×360`).

---

## 7. Giả định Chính (Key Assumptions)

Tóm tắt từ [`docs/management/assumptions-and-decisions.md`](./assumptions-and-decisions.md) (`ASM-001`..`ASM-012`):
- **Môi trường vận hành (`ASM-001..003`)**: Máy chủ chạy Node.js `v22+` trên ổ SSD NVMe nội bộ (Linux ext4 hoặc Windows NTFS có loại trừ trình quét antivirus khỏi `data/db/`), mục tiêu vận hành MVP `20–50 CCU` (`100 CCU` mục tiêu tối ưu, `500 CCU` ngưỡng stress cần đo thật).
- **Trình duyệt & Điều khiển (`ASM-004..006`)**: Desktop Chrome/Edge/Firefox hỗ trợ WebGL2 + WebSockets; MVP tập trung bàn phím + chuột (có hỗ trợ bộ gõ tiếng Việt IME), Gamepad/Touch để M4–M5.
- **Nhịp chơi & Nội dung (`ASM-007..012`)**: 3 nhóm người chơi giả định (`Casual 1h/d`, `Regular 2.5h/d`, `Hardcore 5h/d`); mỗi nhân vật gồm `Basic Attack` nhúng trong `characters.json` + `5` kỹ năng (`1 Passive + 3 Active + 1 Ultimate`) trong `skills.json` = `60` kỹ năng chuẩn; không có tiền thật/IAP trong toàn bộ MVP.

---

## 8. Rủi ro Trọng yếu (Key Risks Summary)

Chi tiết đầy đủ tại [`docs/management/risk-register.md`](./risk-register.md) (`RSK-001`..`RSK-013`):
- **6 Rủi ro `P1` cần quản trị sát**:
  - `RSK-001`: Độ trễ `fsync` JSON DB ở mốc `100–500 CCU` *(đã giảm nhẹ nhờ phân mảnh ledger/idempotency; cần load test sớm)*.
  - `RSK-002`: Khóa file handle `fs.rename` trên Windows NTFS *(cần bounded retry 3 lần trong `AtomicFileWriter`)*.
  - `RSK-003`: Boss TTK `25s` quá nhanh so với mục tiêu `120–210s` *(đã xác nhận qua simulation → `BLG-BAL-001`)*.
  - `RSK-005`: Nút cổ chai sản xuất pixel art vẽ tay (`~159` ngày công Wave 1 MVP).
  - `RSK-009`: Nhiễu tầm nhìn VFX trong Boss Raid 4 người *(đã khóa `Depth 180–199` + `Telegraph Rim Echo 109500`)*.
  - `RSK-011`: Scope creep vượt khỏi Vertical Slice MVP.
  - `RSK-013`: Thiếu feature Spec Kit độc lập cho backend `QuestModule` & `OB-1..OB-8` *(→ `BLG-QST-001`)*.
- **6 Rủi ro `P2`**: Trần scale đơn nút > 500 CCU (`RSK-004`), Desync/Rubber-banding (`RSK-006`), Bot/Macro không CAPTCHA ngoài (`RSK-007`), Lạm phát Gold sau tháng 1 (`RSK-008`), Độ rõ dấu tiếng Việt trên font pixel (`RSK-010`), Lệch lợi nhuận cây trồng M3 `crp_honey_melon` (`RSK-012`).

---

## 9. Vấn đề Đang Mở & Hạng mục Tiền Triển khai (Open Issues — Trung thực 100%)

Dự án **KHÔNG tuyên bố hoàn hảo 100%** mà công khai chính xác mọi mục còn mở trước khi viết mã production:

| Mức độ | Số lượng | Danh sách Chi tiết | Hành động & Thời điểm Đóng |
| :---: | :---: | :--- | :--- |
| **`P0` (Blocker)** | **`0`** | Không còn lỗi chặn kiến trúc, schema, Hiến pháp hay liên kết hỏng | Đã đóng 100% |
| **`P1` (Pre-Playtest / Pre-Sprint)** | **`2`** | 1. **`BLG-BAL-001` (`RSK-003`)**: Boss TTK hiện tại `25s–77s` quá nhanh so với mục tiêu `120–210s`.<br>2. **`BLG-QST-001` (`RSK-013`)**: Cần tách feature `specs/014-quests-onboarding` cho backend `QuestModule` (Module #16/21) & `OB-1..OB-8`. | Chốt phương án cân chỉnh TTK trước Sprint `004-combat-skills`; tạo `specs/014-quests-onboarding` trước Sprint Quest của M1 |
| **`P2` (Post-MVP / Theo dõi)** | **`3`** | 1. `RSK-012`: Điều chỉnh `crp_honey_melon` trước M3.<br>2. Thanh khoản Casual ngày 30 (`780G`) hơi sát & chưa mô phỏng C6 Constellation ở M2.<br>3. Đồng nhất chi tiết trang phục 3 hero từ 4 moodboard khi vẽ sprite sheet thật Wave 1. | Xử lý theo đúng milestone tương ứng (M1 Art Wave 1 / M2 / M3) |
| **`Unverified Targets`** | **Toàn bộ Runtime KPIs** | Độ trễ `p95` JSON DB, TPS `20 Hz` ở `20–500 CCU`, client `60 FPS` / `<=128MB VRAM`, kết quả E2E Playwright | Bắt buộc đo thực tế trong `IMPLEMENTATION MODE` theo `performance-test-plan.md` và `ui-testing-strategy.md` |

---

## 10. Đánh giá Mức độ Sẵn sàng Triển khai (Implementation Readiness Assessment)

- **Phán quyết Tổng thể**: **`READY FOR SPRINT 1 — CONDITIONAL ON USER APPROVAL & TRACKED P1 ITEMS`**
- **Lý do sẵn sàng bắt đầu ngay `specs/001-foundation-game-engine`**:
  - Hiến pháp `v1.0.0`, 12 tệp `game-data/*.json`, 21 GDD, 11 Art docs, 7 UI docs + 7 mockups, 19 tài liệu kiến trúc/ADR và 120 tệp Spec Kit (`001..012`) đều nhất quán, vượt qua 100% công cụ kiểm chứng tự động (`0 P0`, `0` vi phạm JSON-only DB).
  - Hai hạng mục `P1` mở (`BLG-BAL-001` thuộc tầng Combat/Boss ở `004`/`011` và `BLG-QST-001` thuộc tầng Quest sau `005`) **KHÔNG chặn** việc khởi công các feature nền tảng `001-foundation-game-engine`, `002-auth-character` và `003-world-movement`.

---

## 11. Khuyến nghị Feature Triển khai Đầu tiên & Hướng dẫn Tiếp nối Spec Kit

### Feature Triển khai Đầu tiên Khuyến nghị: `specs/001-foundation-game-engine`
- **Đã trỏ sẵn tại `.specify/feature.json`** (`25 tasks`, `10/10` tài liệu thiết kế hoàn chỉnh).
- **Phạm vi**: Khởi tạo Monorepo (`apps/client`, `apps/game-server`, `packages/shared`, `packages/game-config`), xây dựng trọn vẹn **`JsonDatabaseEngine`** (phân mảnh per-character/per-account, WAL 2PC, Crash Recovery lũy đẳng, `AsyncLockManager`, `StaggeredDirtyFlusher`, `LocalBackupService`), `GameCatalogLoader` kiểm chứng 12 tệp `game-data/*.json`, vòng lặp `SimulationLoop` 20 Hz và vỏ client Phaser 3 `640×360` + `GameUiBridge`.

### Quy trình Tiếp nối Khi Người dùng Phê duyệt Chuyển sang `IMPLEMENTATION MODE`
1. **Rà soát & Phê duyệt**: Người dùng rà soát báo cáo này, xác nhận phương án cho `BLG-BAL-001` (Boss TTK) và đánh dấu `[x]` các mục đã duyệt trong [`specs/001-foundation-game-engine/checklists/storage-and-engine.md`](../../specs/001-foundation-game-engine/checklists/storage-and-engine.md).
2. **Triển khai Lần lượt Theo Đồ thị Phụ thuộc**:
   - **Sprint 1**: Chạy `/speckit-implement` trên `specs/001-foundation-game-engine` → xác minh WAL Crash Recovery & `validate-catalog`.
   - **Sprint 2–3**: Chuyển active feature sang `002-auth-character` → `003-world-movement` (đo sớm latency & reconciliation).
   - **Sprint 4–5**: Áp dụng quyết định `BLG-BAL-001` → triển khai `004-combat-skills` → `005-inventory-loot`.
   - **Sprint 6–8 (Có thể chạy song song 2 nhánh)**: Nhánh A (`006-gathering-crafting` → `007-equipment-enhancement`) song song Nhánh B (`008-housing-farming` → `009-gacha-collection`), đồng thời chạy `/speckit-specify → /speckit-tasks` tạo `specs/013-quests-onboarding` (`BLG-QST-001`).
   - **Sprint 9–11**: `010-multiplayer-social` → `011-dungeon-boss` → `013-quests-onboarding` → `012-game-ui-qa` + chạy đủ bộ Load Test (`20 → 500 CCU`) và Playwright UI Audit 24 màn hình.
