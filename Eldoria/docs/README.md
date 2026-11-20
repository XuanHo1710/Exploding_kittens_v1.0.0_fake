# Eldoria: Forgotten Wilds — Master Documentation Index

**Trạng thái Dự án**: `DESIGN_AND_PLANNING_ONLY` (Hoàn tất Bộ Hồ sơ Thiết kế Thương mại v2.0 — Đã Cập nhật Local Docker Redis/MinIO & 2D Pixel Multi-Animation Pipeline)  
**Cập nhật lần cuối**: 2026-11-19  
**Ràng buộc Tối thượng**: [Hiến pháp Dự án v2.0.0](../.specify/memory/constitution.md) — **100% Cơ sở dữ liệu Chính JSON Cục bộ (`data/db/**/*.json`) + Local Docker Redis & MinIO (Zero External Cloud/Third-Party Services)**.

---

## Thứ tự Đọc Khuyến nghị (Recommended Reading Order)

1. **Quản trị & Tầm nhìn**: [Constitution](../.specify/memory/constitution.md) → [00-game-vision.md](./game-design/00-game-vision.md) → [01-game-design-document.md](./game-design/01-game-design-document.md) → [mvp-scope.md](./management/mvp-scope.md) → [FINAL-DESIGN-REPORT.md](./management/FINAL-DESIGN-REPORT.md).
2. **Kiến trúc Kỹ thuật & JSON Database**: [ADR-001](./architecture/architecture-decisions/ADR-001-json-only-local-database.md) → [system-architecture.md](./architecture/system-architecture.md) → [database-design.md](./architecture/database-design.md) → [data-dictionary.md](./architecture/data-dictionary.md) → [security-design.md](./architecture/security-design.md).
3. **Dữ liệu Chuẩn & Cân bằng**: [game-data/](../game-data/characters.json) → [combat-formulas.md](./balancing/combat-formulas.md) → [simulation-results.md](./balancing/simulation-results.md).
4. **Mỹ thuật & Giao diện**: [art-bible.md](./art-direction/art-bible.md) → [design-system.md](./ui-ux/design-system.md) → [Interactive Mockups Hub](./ui-ux/mockups/index.html).
5. **Kế hoạch Triển khai Spec Kit**: [feature-roadmap.md](./management/feature-roadmap.md) → [`specs/001-foundation-game-engine/`](../specs/001-foundation-game-engine/spec.md) đến [`specs/012-game-ui-qa/`](../specs/012-game-ui-qa/spec.md).

---

## 1. Quản trị, Lộ trình & Báo cáo Tổng kết (`docs/management/`)

| Tài liệu | Mục đích | Trạng thái |
| :--- | :--- | :---: |
| [Constitution v2.0.0](../.specify/memory/constitution.md) | Hiến pháp 8 Nguyên tắc bất khả xâm phạm (100% JSON Primary DB + Local Docker Redis/MinIO, Glitch-Free 2D Pixel Pipeline, Fair Gacha) | Ratified |
| [FINAL-DESIGN-REPORT.md](./management/FINAL-DESIGN-REPORT.md) | Báo cáo Tổng kết & Review Độc lập 5 Góc nhìn (Game Director, Lead Eng, Art, Economy, QA) | Complete |
| [mvp-scope.md](./management/mvp-scope.md) | Ranh giới Vertical Slice MVP vs Tầm nhìn Dài hạn & Tiêu chí Nghiệm thu | Complete |
| [feature-roadmap.md](./management/feature-roadmap.md) | Lộ trình M1–M5 & Đồ thị Phụ thuộc 12 Spec Kit Features | Complete |
| [technical-backlog.md](./management/technical-backlog.md) | Danh mục Backlog Kỹ thuật Ưu tiên P0–P3 & Hạng mục Cân chỉnh Boss TTK | Complete |
| [risk-register.md](./management/risk-register.md) | Sổ Đăng ký 14 Rủi ro Chính & Phương án Giảm thiểu (kể cả giới hạn JSON DB, Local Docker Redis/MinIO, Boss TTK & Quest Spec) | Complete |
| [requirements-traceability.md](./management/requirements-traceability.md) | Ma trận Truy vết Hai chiều Hiến pháp + Brief Mục 3–29 → Docs → JSON → Specs → QA | Complete |
| [assumptions-and-decisions.md](./management/assumptions-and-decisions.md) | Nhật ký Quyết định `DEC-001..002`, Giả định `ASM-001..012` & Chỉ số `unverified` | Complete |
| [sources-and-licenses.md](./management/sources-and-licenses.md) | Chính sách Sở hữu Trí tuệ Nguyên bản, Zero Third-Party & Giấy phép Mã nguồn Mở | Complete |
| [PROGRESS.md](./management/PROGRESS.md) | Theo dõi Tiến độ 8 Giai đoạn Thiết kế & Kết quả Quality Gate | Complete |
| [HANDOFF.md](./management/HANDOFF.md) | Hướng dẫn Khôi phục Ngữ cảnh & Tiếp nối Phiên làm việc | Complete |

---

## 2. Game Design Documents (`docs/game-design/` — 21 tài liệu)

| Tài liệu | Phạm vi Thiết kế | Trạng thái |
| :--- | :--- | :---: |
| [00-game-vision.md](./game-design/00-game-vision.md) | Tầm nhìn, 7 Trụ cột & Bảng Quy ước ID/Enum Chuẩn Toàn Dự án | Complete |
| [01-game-design-document.md](./game-design/01-game-design-document.md) | Master GDD tổng hợp toàn trò chơi & ma trận hệ thống | Complete |
| [02-core-gameplay-loop.md](./game-design/02-core-gameplay-loop.md) | Vòng lặp 10 bước, Mục tiêu 5p–1 tháng, Gameplay-First Onboarding & Hiệp lực Nông trại–Combat | Complete |
| [03-world-building.md](./game-design/03-world-building.md) | Truyền thuyết, Hồ sơ 8 Khu vực, Lớp Tiled Map, Partitioning, Fog of War, Thời tiết | Complete |
| [04-character-design.md](./game-design/04-character-design.md) | 12 Character Design Sheets đầy đủ & Phân tích Cân bằng Rarity | Complete |
| [05-character-progression.md](./game-design/05-character-progression.md) | 17 Chỉ số, Đường cong EXP Lv 1–100, Ascension, Talent Tree & Trần Chống Power Creep | Complete |
| [06-combat-system.md](./game-design/06-combat-system.md) | Action Combat 20Hz/60FPS, Dodge/Parry, Ma trận 9 Nguyên tố, CC DR, Boss Stagger & Combat Feel | Complete |
| [07-skill-system.md](./game-design/07-skill-system.md) | Động cơ Kỹ năng Hướng Dữ liệu & Danh mục 60 Kỹ năng (15 MVP, 8 Iconic Ultimates) | Complete |
| [08-equipment-system.md](./game-design/08-equipment-system.md) | 11 Loại Vũ khí, 10 Slot Trang bị, 6 Equipment Sets, Độ bền, Sửa chữa & Phân rã | Complete |
| [09-weapon-enhancement.md](./game-design/09-weapon-enhancement.md) | Cường hóa Vũ khí `+0 → +10` Chắc chắn 100% MVP, Cổng Blacksmith Lv 1–4 & WAL Atomic | Complete |
| [10-gacha-system.md](./game-design/10-gacha-system.md) | Gacha 100% Nội tệ `STARLIGHT_SHARD`, Công khai Tỷ lệ, Pity `65/80` & `55/70`, `STAR_ESSENCE` | Complete |
| [11-crafting-system.md](./game-design/11-crafting-system.md) | Chuỗi Luyện kim, Rèn, Nấu ăn, Giả kim & Danh mục 36 Công thức (`22` MVP) | Complete |
| [12-farming-system.md](./game-design/12-farming-system.md) | Sinh tồn Hunger/Food Buff, 4 Mùa, 15 Cây trồng (`5` MVP) & Offline Server-Time Trần 24h | Complete |
| [13-animal-husbandry.md](./game-design/13-animal-husbandry.md) | Chăn nuôi 6 Loài (`2` MVP + Fantasy Animal), Hạnh phúc, Không chết vĩnh viễn & Chuỗi sản phẩm | Complete |
| [14-building-system.md](./game-design/14-building-system.md) | Lãnh địa, 13 Công trình (`6` MVP), Ghost Preview Lưới `32x32` & 7 Lớp Xác thực Placement | Complete |
| [15-monster-ai.md](./game-design/15-monster-ai.md) | FSM 10 Trạng thái, Threat Table, Pathfinding A* & Hồ sơ 30 Quái thường + 8 Elite | Complete |
| [16-boss-design.md](./game-design/16-boss-design.md) | Hồ sơ 5 Boss Đa giai đoạn (`48` Boss Skills), Telegraph, Poise Stagger, Enrage & Anti-Exploit | Complete |
| [17-dungeon-design.md](./game-design/17-dungeon-design.md) | Kiến trúc `DungeonInstance`, Bản thiết kế 7 Phòng `dng_mossroot_hollow` & 4 Phụ bản M2–M5 | Complete |
| [18-quest-and-npc.md](./game-design/18-quest-and-npc.md) | Danh mục NPC 8 Vùng & 30 Nhiệm vụ (`12` MVP) theo DAG Không Vòng lặp | Complete |
| [19-game-economy.md](./game-design/19-game-economy.md) | Hệ sinh thái 5 Tiền tệ, Faucets/Sinks, Kiểm soát Lạm phát & Sổ cái `CurrencyLedger` JSON | Complete |
| [20-multiplayer-design.md](./game-design/20-multiplayer-design.md) | Co-op PvE Server-Authoritative, Chat, Party 2–4P, Personal Loot, Reconnect 120s & Lộ trình Mở rộng | Complete |

---

## 3. Art Direction, Pixel Art Bible & Concept Art (`docs/art-direction/` — 11 tài liệu + 4 Concept Art)

| Tài liệu | Nội dung Chính | Trạng thái |
| :--- | :--- | :---: |
| [art-bible.md](./art-direction/art-bible.md) | Tiêu chuẩn Classic 16-bit Pixel Art (`32x32`, `48x64`, `640x360`), Bảng màu, Ánh sáng, Readability | Complete |
| [character-design-standard.md](./art-direction/character-design-standard.md) | Tỷ lệ Chibi/Heroic, 4 Hộp Không gian, Silhouette 8 Class, Portrait & 3-Layer Equipment Policy | Complete |
| [animation-standard.md](./art-direction/animation-standard.md) | Đặc tả Đủ 25 Trạng thái Animation (4-dir MVP / 8-dir Ext) & Tách Client Visual vs Server Combat | Complete |
| [animation-state-machine.md](./art-direction/animation-state-machine.md) | HFSM 6 Siêu trạng thái, 11 Cấp Ưu tiên, Cancel Windows & Đồng bộ `animState` Multiplayer | Complete |
| [sprite-sheet-standard.md](./art-direction/sprite-sheet-standard.md) | Quy chuẩn Packing POT `<=2048` & Blueprint cho Hero, Monster, Animal, Boss mẫu | Complete |
| [tileset-standard.md](./art-direction/tileset-standard.md) | Autotile 16/47, 8 Lớp Tiled `.tmj`, Extrusion `1px`, 7 Trạng thái Đất Nông trại | Complete |
| [environment-design.md](./art-direction/environment-design.md) | Hướng Mỹ thuật 8 Vùng + 5 Dungeon, LUT Ngày/Đêm/4 Mùa & Blueprint Bố cục Làng/Rừng/Boss | Complete |
| [vfx-design.md](./art-direction/vfx-design.md) | VFX 9 Nguyên tố, 8 Ultimate Biểu tượng, Telegraph Layer `180–199` & An toàn Ánh sáng `<=3Hz` | Complete |
| [audio-design.md](./art-direction/audio-design.md) | Chiptune/FM-Orchestral Cục bộ (`.ogg`/`.mp3`), BGM/SFX, 5 Mixing Buses & Chống Clipping Co-op | Complete |
| [asset-manifest.md](./art-direction/asset-manifest.md) | Danh mục Ánh xạ 100% Local Paths `assets/` cho Toàn bộ Catalog (0 S3/CDN) | Complete |
| [asset-production-backlog.md](./art-direction/asset-production-backlog.md) | Kế hoạch Sản xuất 5 Đợt (`Wave 1 MVP = 159 ngày công`) & 7 Cổng QA Nghiệm thu Asset | Complete |
| **Pixel Concept Art (`concepts/`)** | [Greenhaven Village](./art-direction/concepts/greenhaven-village-concept.jpg), [Whispering Forest Combat](./art-direction/concepts/whispering-forest-combat-concept.jpg), [Mossroot Boss Arena](./art-direction/concepts/dungeon-boss-arena-concept.jpg), [Starter Heroes Sheet](./art-direction/concepts/starter-heroes-sheet-concept.jpg) | Complete |

---

## 4. UI/UX Design & Interactive Mockups (`docs/ui-ux/` — 7 tài liệu + 7 HTML Mockups)

| Tài liệu / Mockup | Nội dung Chính | Trạng thái |
| :--- | :--- | :---: |
| [design-system.md](./ui-ux/design-system.md) | Design Tokens Pixel Fantasy, WCAG AA Đã Xác minh, Font Việt hóa Cục bộ, 9-Slice & 8 Component States | Complete |
| [screen-inventory.md](./ui-ux/screen-inventory.md) | Wireframe & Đặc tả Đầy đủ 24/24 Màn hình Bắt buộc (`SCR-01`..`SCR-24`) | Complete |
| [user-flows.md](./ui-ux/user-flows.md) | 6 Sơ đồ Luồng Trải nghiệm Chính từ Onboarding 5p đến Boss Raid & Reconnect | Complete |
| [interaction-design.md](./ui-ux/interaction-design.md) | Điều khiển Phím/Chuột, `InputFocusManager` 5 Tầng + Tiếng Việt IME, Roadmap Gamepad & Touch | Complete |
| [responsive-design.md](./ui-ux/responsive-design.md) | Desktop Breakpoints (`1024x768`..`2560x1440`), Integer Scaling `640x360` & Ngân sách Chữ Việt `+25%` | Complete |
| [accessibility.md](./ui-ux/accessibility.md) | Chống Mù màu 3 Lớp, Tắt Camera Shake, `<=3Hz` Flash, Focus Ring & Phụ đề Boss | Complete |
| [ui-testing-strategy.md](./ui-ux/ui-testing-strategy.md) | Quy trình Audit Playwright Cục bộ, Ma trận 24 Màn hình × 9 Trạng thái & Mẫu Báo cáo Tiếng Việt | Complete |
| **[Interactive Mockup Hub](./ui-ux/mockups/index.html)** | Cổng mở trực tiếp offline trên trình duyệt (0 CDN ngoài) liên kết tới: [Auth/Starter](./ui-ux/mockups/auth-character-select.html), [Main HUD & World](./ui-ux/mockups/main-hud-world.html), [Inventory & +10 Forge](./ui-ux/mockups/inventory-blacksmith-enhance.html), [Fair Gacha](./ui-ux/mockups/gacha-collection.html), [Farming & Build Grid](./ui-ux/mockups/farming-building-grid.html), [Boss Raid & Party](./ui-ux/mockups/boss-raid-party.html), **[2D Pixel Multi-Animation Inspector](./ui-ux/mockups/pixel-animation-showcase.html)** | Complete |

---

## 5. Technical Architecture, JSON DB & Local Docker Infra (`docs/architecture/` — 12 tài liệu + 7 ADRs + Diagrams)

| Tài liệu | Nội dung Chính | Trạng thái |
| :--- | :--- | :---: |
| [system-architecture.md](./architecture/system-architecture.md) | Tổng quan C4 Modular Monolith, Monorepo & Quy tắc Phụ thuộc Một chiều | Complete |
| [frontend-architecture.md](./architecture/frontend-architecture.md) | Phaser 3 (60 FPS) ↔ `GameUiBridge` ↔ React/Zustand, Y-Sorting & Object Pooling | Complete |
| [backend-architecture.md](./architecture/backend-architecture.md) | 21 NestJS Domain Modules, Quyền sở hữu Tệp JSON & Ranh giới Giao dịch WAL | Complete |
| [game-server-architecture.md](./architecture/game-server-architecture.md) | Vòng lặp 20 Hz, Entity Lifecycle, `SpatialHashGrid` & Lộ trình Capacity `20–500 CCU` | Complete |
| [network-protocol.md](./architecture/network-protocol.md) | Prediction/Reconciliation, Interpolation 100ms, Delta Compression & Reconnect 120s | Complete |
| [database-design.md](./architecture/database-design.md) | **Kiến trúc `JsonDatabaseEngine` 100% JSON Cục bộ** (Sharding, WAL 2PC, Checksum, Lock, Backup) | Complete |
| [data-dictionary.md](./architecture/data-dictionary.md) | Từ điển Lược đồ JSON Đầy đủ 26 Thực thể Persistent & Static Catalog | Complete |
| [security-design.md](./architecture/security-design.md) | Xác thực `crypto.scrypt` Cục bộ, JWT/Refresh Rotation, Ownership Guard, Path Guard & Audit | Complete |
| [anti-cheat-design.md](./architecture/anti-cheat-design.md) | Phân tích Đủ 14 Bề mặt Tấn công Gian lận, Violation Scoring & Anti-Clock-Tampering | Complete |
| [api-contracts.md](./architecture/api-contracts.md) | Hợp đồng REST `/api/v1/*` kèm `X-Idempotency-Key` & Bảng Mã lỗi Chuẩn | Complete |
| [websocket-contracts.md](./architecture/websocket-contracts.md) | Hợp đồng WebSocket `/game` (`C2S_*`, `S2C_*`) & Đồng bộ `animState` | Complete |
| [deployment-design.md](./architecture/deployment-design.md) | Triển khai 100% Local Docker Compose (`eldoria-server` + `redis` + `minio` + `minio-init`), Backup & Disaster Recovery | Complete |
| [Architecture Diagrams](./architecture/diagrams/architecture-diagrams.md) | Bộ Sơ đồ Mermaid C4, Sequence (Enhance/Gacha/Combat) & State Machine (Monster/Boss/Crop) | Complete |
| **ADRs (`architecture-decisions/`)** | [ADR-001 JSON DB](./architecture/architecture-decisions/ADR-001-json-only-local-database.md), [ADR-002 Monolith/20Hz](./architecture/architecture-decisions/ADR-002-modular-monolith-and-20hz-loop.md), [ADR-003 Server-Auth](./architecture/architecture-decisions/ADR-003-server-authoritative-combat-and-sync.md), [ADR-004 Phaser-React](./architecture/architecture-decisions/ADR-004-phaser-react-zustand-bridge.md), [ADR-005 Enhance/Gacha](./architecture/architecture-decisions/ADR-005-deterministic-enhancement-and-fair-gacha.md), [ADR-006 Partitioning](./architecture/architecture-decisions/ADR-006-in-process-world-partitioning.md), **[ADR-007 Local Docker Redis/MinIO & 2D Pixel Pipeline](./architecture/architecture-decisions/ADR-007-local-docker-redis-minio-and-glitch-free-2d-pipeline.md)** | Complete |

---

## 6. Balancing, Simulations & QA (`docs/balancing/` & `docs/testing/`)

| Tài liệu | Nội dung Chính | Trạng thái |
| :--- | :--- | :---: |
| [progression-model.md](./balancing/progression-model.md) | Đường cong EXP Lv 1–100 (Node.js verified), Điểm Thuộc tính/Kỹ năng, Ascension & Combat Rating | Complete |
| [combat-formulas.md](./balancing/combat-formulas.md) | Công thức Sát thương 5 Bước, Giáp Hyperbolic, Khắc hệ, Parry/Poise & 8 Trần Cứng | Complete |
| [weapon-upgrade-costs.csv](./balancing/weapon-upgrade-costs.csv) | Bảng Chi phí, Nguyên liệu, Blacksmith Gate & Thời gian Farm `+0 → +10` | Complete |
| [gacha-probabilities.csv](./balancing/gacha-probabilities.csv) | Bảng Xác suất Công khai 4 Banner khớp `game-data/gacha-banners.json` | Complete |
| [economy-analysis.md](./balancing/economy-analysis.md) | Phân tích Kinh tế Định lượng Faucets/Sinks, Chống Lạm phát & Đòn bẩy Cân chỉnh | Complete |
| [simulation-results.md](./balancing/simulation-results.md) | **Kết quả Chạy Thực tế Node.js**: 100k Monte Carlo Gacha, +10 Forge, Boss TTK Audit & Kinh tế 30 Ngày | Verified |
| [test-strategy.md](./testing/test-strategy.md) | Chiến lược Kiểm thử 13 Lớp, 6 Nhóm Kịch bản/Module & Quy trình Audit UI/UX | Complete |
| [test-scenarios.md](./testing/test-scenarios.md) | Danh mục Kịch bản Kiểm thử Trọng yếu (`TS-DB`, `AUTH`, `WLD`, `CMB`, `ENH`, `GAC`, `FRM`, `BOS`) | Complete |
| [acceptance-criteria.md](./testing/acceptance-criteria.md) | 11 Tiêu chí Nghiệm thu Cấp Dự án (`AC-001`..`AC-011`) & Tiêu chí Chốt Thiết kế | Complete |
| [performance-test-plan.md](./testing/performance-test-plan.md) | Kế hoạch Load Test 20/50/100/500 CCU & Bài test Đặc thù `JsonDatabaseEngine` | Complete |
| [security-test-plan.md](./testing/security-test-plan.md) | 15 Bài Kiểm thử Xâm nhập & Chống Gian lận Tự động (`SEC-001`..`SEC-015`) | Complete |

---

## 7. Canonical Game Content Catalog (`game-data/` — 12 tệp JSON, 0 lỗi kiểm chứng)

| Tệp JSON | Số lượng Bản ghi | Công cụ Kiểm chứng |
| :--- | :--- | :--- |
| [characters.json](../game-data/characters.json) | 12 nhân vật (`3` MVP) | `tools/design-validation/validate-catalog.mjs` |
| [skills.json](../game-data/skills.json) | 60 kỹ năng (`15` MVP) | `validate-catalog.mjs` |
| [monsters.json](../game-data/monsters.json) | 30 thường + 8 Elite (`8+1` MVP) | `validate-catalog.mjs` |
| [bosses.json](../game-data/bosses.json) | 5 Boss đa giai đoạn (`1` MVP) | `validate-catalog.mjs` |
| [items.json](../game-data/items.json) | 157 vật phẩm (`40` Wpn, `40` Eqp, `50` Mat, `12` Csm, `15` Seed) | `validate-catalog.mjs` |
| [recipes.json](../game-data/recipes.json) | 36 công thức (`22` MVP) | `validate-catalog.mjs` |
| [crops.json](../game-data/crops.json) | 15 cây trồng (`5` MVP) | `validate-catalog.mjs` |
| [animals.json](../game-data/animals.json) | 6 loài động vật (`2` MVP) | `validate-catalog.mjs` |
| [buildings.json](../game-data/buildings.json) | 13 công trình / 43 cấp (`6` MVP) | `validate-catalog.mjs` |
| [quests.json](../game-data/quests.json) | 30 nhiệm vụ theo DAG (`12` MVP) | `validate-catalog.mjs` |
| [loot-tables.json](../game-data/loot-tables.json) | 62 bảng rơi đồ (`18` MVP) | `validate-catalog.mjs` |
| [gacha-banners.json](../game-data/gacha-banners.json) | 4 banner (`2` MVP, tổng rate `= 1.000000`) | `validate-catalog.mjs` & `run-simulations.mjs` |

---

## 8. Bộ Đặc tả Triển khai Spec Kit (`specs/` — 13 Feature Độc lập)

Mỗi thư mục feature bao gồm trọn bộ quy trình Spec Kit (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `checklists/`, `tasks.md`, `analysis-report.md`):

1. [`001-foundation-game-engine`](../specs/001-foundation-game-engine/spec.md) — *(Khuyến nghị triển khai đầu tiên)* Monorepo, `JsonDatabaseEngine`, Catalog Loader & 20 Hz / 60 FPS Shell
2. [`002-auth-character`](../specs/002-auth-character/spec.md) — Xác thực Cục bộ (`scrypt`/JWT) & Quản lý Nhân vật
3. [`003-world-movement`](../specs/003-world-movement/spec.md) — Bản đồ Tiled, Phân vùng Thế giới, Di chuyển 20 Hz & Spatial Sync
4. [`004-combat-skills`](../specs/004-combat-skills/spec.md) — Action Combat, Hitbox Server, Dodge/Parry & 60-Skill Engine
5. [`005-inventory-loot`](../specs/005-inventory-loot/spec.md) — Kho đồ, `ItemInstance`, Personal Loot & `CurrencyLedger` JSON
6. [`006-gathering-crafting`](../specs/006-gathering-crafting/spec.md) — Khai thác Tài nguyên, Luyện kim, Nấu ăn, Giả kim & Chế tạo
7. [`007-equipment-enhancement`](../specs/007-equipment-enhancement/spec.md) — Trang bị 10 Slot, Set Bonus & Cường hóa Chắc chắn `+1..+10`
8. [`008-housing-farming`](../specs/008-housing-farming/spec.md) — Sinh tồn, Nông trại, Chăn nuôi (Offline 24h) & Xây dựng Grid-Snap
9. [`009-gacha-collection`](../specs/009-gacha-collection/spec.md) — Gacha Nội tệ Minh bạch, Pity, Chuyển đổi Trùng lặp & Sưu tầm
10. [`010-multiplayer-social`](../specs/010-multiplayer-social/spec.md) — Presence, Chat, Bạn bè, Party 2–4P, Co-op Homestead & Reconnect 120s
11. [`011-dungeon-boss`](../specs/011-dungeon-boss/spec.md) — Phụ bản `DungeonInstance`, AI 10 Trạng thái & Boss Đa giai đoạn
12. [`012-game-ui-qa`](../specs/012-game-ui-qa/spec.md) — Giao diện Pixel Fantasy 24 Màn hình, A11y & Playwright QA Harness
13. [`013-local-infra-pixel-animation`](../specs/013-local-infra-pixel-animation/spec.md) — **Local Docker Redis + MinIO (S3) & Glitch-Free 2D Pixel Multi-Animation Pipeline** (chạy song song cuối Sprint 1 cùng `001`)
