# Implementation Plan: Local Containerized Runtime Cache (Redis), Object Asset Storage (MinIO S3) & Glitch-Free 2D Pixel Multi-Animation Pipeline

**Branch**: `013-local-infra-pixel-animation` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/013-local-infra-pixel-animation/spec.md` & Constitution v2.0.0 Amendment (`DEC-003` / `ADR-007`)

---

## Summary

Tích hợp hai dịch vụ hạ tầng mã nguồn mở tự vận hành 100% trong **Local Docker Compose** — **Local Redis (`redis:7-alpine`)** cho trạng thái runtime tạm thời (presence, hot session, rate limiting, pub/sub) và **Local MinIO (`minio/minio`, chuẩn S3 API)** cho kho lưu trữ & phân phát tài nguyên 2D pixel art (`eldoria-assets`) cùng bản sao lưu xoay vòng (`eldoria-backups`) — **song song với cơ sở dữ liệu bền vững chính vẫn 100% là tệp JSON cục bộ (`data/db/**/*.json`)**. Đồng thời thiết kế trọn bộ pipeline đồ họa & hoạt ảnh 2D pixel phong phú **không lỗi** (chống mờ pixel, chống hở viền tile `extrude: 1px / padding: 2px`, Y-sorting chuẩn `1000 + Math.round(footY)`, bộ máy HFSM 25 trạng thái × 4 hướng tích hợp Anti-Stuck Watchdog, và công cụ kiểm định tự động trước khi khởi chạy).

---

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 22 LTS  
**Primary Dependencies**:
- Backend: NestJS 11, `ioredis` (chỉ kết nối Local Docker Redis nội bộ `redis://redis:6379` với degraded fallback về RAM), `@aws-sdk/client-s3` (khóa duy nhất 1 S3 client trỏ cứng `endpoint: http://minio:9000`, `forcePathStyle: true` tới Local Docker MinIO — không kết nối AWS Cloud), `zod`
- Frontend: React 19, Vite 6, Phaser 3 (`pixelArt: true`, `antialias: false`, `roundPixels: true`, `640×360` integer scaling), Zustand
- Local Container Stack: Docker Compose v2 (`eldoria-server`, `redis:7-alpine`, `minio/minio`, `minio/mc` init sidecar, tùy chọn `traefik`)
**Storage**:
- **Primary Persistent DB (100% JSON)**: `data/db/**/*.json` qua `JsonDatabaseEngine` (WAL 2PC, `tmp → fsync → rename`, SHA-256 checksum, per-character ledger, per-account idempotency). **ZERO SQL/NoSQL DBMS.**
- **Ephemeral Runtime Cache**: Local Docker Redis (chính sách toàn cục thống nhất `maxmemory 256mb`, `maxmemory-policy volatile-lru` kèm cảnh báo `> 80%` RAM; mọi khóa đều có TTL hữu hạn và tự fallback sang RAM).
- **Object Asset & Backup Storage**: Local Docker MinIO (2 bucket: `eldoria-assets` public-read versioned prefix, `eldoria-backups` private).
**Testing**: Vitest (unit/contract), Docker Compose integration tests (Redis restart zero-data-loss test, MinIO bucket/checksum test), `tools/design-validation/validate-animation-pipeline.mjs`, Playwright visual regression (`720p/1080p/1440p` zero-bleed/zero-stuck check)  
**Target Platform**: Localhost / LAN / Self-Hosted Single VPS via Docker Compose; Desktop WebGL2 Browsers  
**Performance Goals (`proposed / unverified`)**:
- `docker compose up -d` healthy toàn stack trong `< 60s`
- Redis hot-lookup `< 2 ms` p95 nội bộ mạng Docker; degraded fallback không drop kết nối quá `500 ms`
- Phaser 3 client ổn định `60 FPS`, `<= 128 MB` VRAM trong MVP, `0%` animation stuck trên `1,000` chuyển trạng thái liên tiếp
**Constraints**: Chủ dự án đã phê duyệt `DEC-004` (`Q1-A`, `Q2-C`, `Q3-1&2`) cho phép chuyển sang **`IMPLEMENTATION MODE`** sau khi chốt `/speckit-tasks`; giữ nguyên ràng buộc 100% JSON Primary DB + Local Docker Redis/MinIO, không kết nối dịch vụ đám mây/bên thứ ba ra Internet.

---

## Constitution Check (Constitution v2.0.0)

*GATE: Must pass before implementation and across cross-feature reconciliation.*

| Nguyên tắc Hiến pháp (v2.0.0) | Trạng thái | Ghi chú Xác minh |
| :--- | :---: | :--- |
| **I. JSON-Only Primary Persistent DB + Local Docker Redis & MinIO (Zero Cloud/3rd-Party)** | **PASS** | Primary DB 100% `data/db/**/*.json`; Redis chỉ chạy Docker local cho dữ liệu tạm có thể tái tạo; MinIO chỉ chạy Docker local (`localhost:9000` / mạng bridge nội bộ) cho assets & backups. Cấm tuyệt đối PostgreSQL/TypeORM/Prisma/MongoDB/SQLite/AWS S3 Cloud/Firebase/Auth0. |
| **II. Server-Authoritative Simulation & Anti-Cheat** | **PASS** | Animation HFSM & Hit-Stop chạy trên client chỉ phục vụ hiển thị; sát thương, hit-confirm và cooldown tính hoàn toàn trên server 20 Hz. Rate-limit Redis bổ sung lớp phòng thủ chống spam gói tin. |
| **III. Data-Driven Single Source of Truth** | **PASS** | Mọi animation key, sprite atlas path và MinIO object key sinh/đối chiếu trực tiếp từ `game-data/*.json`, `animation-standard.md` và `asset-manifest.md`. |
| **IV. Modular Monolith & Decoupled Simulation** | **PASS** | Thêm 2 infrastructure adapters (`LocalRedisAdapter`, `LocalMinioAdapter`) trong `apps/game-server/src/infrastructure/` mà không tách microservices. |
| **V. Classic 16-Bit Pixel-Perfect & Glitch-Free 2D Pipeline** | **PASS** | Khóa cứng `32×32` tile, `48×64` hero, `128×128..256×256` boss, `extrude: 1px`, `padding: 2px`, `pixelArt: true`, `roundPixels: true`, `Depth 180–199` / `109500` Boss Telegraph bảo vệ và Anti-Stuck Watchdog. |
| **VI. Fair Progression & Non-Predatory Gacha** | **PASS** | Không thay đổi cơ chế công bằng; mọi tài sản gacha/enhancement vẫn commit WAL xuống JSON DB trước khi cập nhật cache. |
| **VII. Spec-Driven Development & Vertical-Slice MVP** | **PASS** | Khóa đợt tài nguyên đầu tiên vào Wave 1 MVP (3 hero, 8+1 mob, 1 boss, 2 animal, 5 crop, 6 building, 2 region + 1 dungeon). |
| **VIII. Verifiable Quality Gates & Evidence Integrity** | **PASS** | Mọi mục tiêu tải/FPS gắn nhãn `proposed / unverified`; cung cấp công cụ kiểm định tự động `validate-animation-pipeline.mjs` và mockup showcase chạy offline thật. |

---

## Project Structure (Target Design Blueprint — Do NOT create `apps/` or `packages/` in Design Mode)

### Documentation & Design Artifacts (Created in `DESIGN_AND_PLANNING_ONLY`)

```text
specs/013-local-infra-pixel-animation/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
├── analysis-report.md
├── contracts/
│   └── local-infra-and-pixel-pipeline.md
└── checklists/
    ├── requirements.md
    └── pixel-infra-and-animation.md

docs/
├── architecture/
│   ├── architecture-decisions/
│   │   └── ADR-007-local-docker-redis-minio-and-glitch-free-2d-pipeline.md
│   └── deployment-design.md              # Updated with local Docker Compose (server + redis + minio + minio-init)
└── ui-ux/mockups/
    └── pixel-animation-showcase.html     # Offline interactive 2D pixel animation & anti-glitch inspector

tools/design-validation/
├── validate-animation-pipeline.mjs       # Automated cross-check of 2D animation keys & MinIO manifest
└── audit-workspace.mjs                   # Updated for Constitution v2.0.0 & 13 Spec Kit features
```

### Target Production Layout (Future `IMPLEMENTATION MODE`)

```text
docker-compose.yml                        # Local stack: eldoria-server, redis, minio, minio-init, (optional) traefik
apps/game-server/src/infrastructure/
├── redis/
│   ├── local-redis.module.ts             # NestJS module exports LocalRedisService & adapters
│   ├── local-redis.service.ts            # ioredis client + health check + degraded RAM fallback
│   ├── redis-session-cache.service.ts    # Hot session read-through cache (backed by data/db/sessions/*.json)
│   ├── redis-lockout.service.ts          # Brute-force lockout counter (eldoria:auth:lockout:*, 900s TTL + RAM fallback)
│   ├── redis-idempotency.service.ts      # Fast-path replay filter (eldoria:idem:*, 24h TTL backed by JSON idempotency)
│   ├── redis-presence.service.ts         # Online zone presence, party invites TTL 60s & zone pub/sub
│   └── redis-rate-limit.service.ts       # Sliding-window anti-spam (WS/REST) with RAM fallback
└── minio/
    ├── local-minio.module.ts             # NestJS module exports LocalMinioService & asset/backup services
    ├── local-minio.service.ts            # @aws-sdk/client-s3 (endpoint http://minio:9000, forcePathStyle: true)
    ├── asset-manifest.service.ts         # Serves versioned manifest + MinIO public base URL + SHA-256 verification
    ├── asset-manifest-boot.validator.ts  # onModuleInit boot-time manifest & MinIO object integrity verification
    └── backup-uploader.service.ts        # Pushes rotating JSON DB snapshots to eldoria-backups + < 15% disk guard

apps/client/src/game/
├── rendering/
│   ├── PixelCameraController.ts          # Integer zoom 640x360, roundPixels, toggleable damped pixel shake
│   ├── DepthLayerManager.ts              # Unified Depth 0..119999 + Y-Sort (1000 + Math.round(footY))
│   └── MinioAssetLoader.ts               # Loads atlases/maps from local MinIO with retry(3) & safe pixel fallback
└── animation/
    ├── PixelAnimationRegistry.ts         # Registers all 25-state x 4-dir Phaser anims from validated manifest
    ├── CharacterHfsmController.ts        # 6-superstate, 11-priority HFSM + cancel windows
    └── AnimationStuckWatchdog.ts         # Guarantees zero permanent stuck states (maxDurationMs + 150ms grace)
```

---

## Cross-Feature Impact Matrix (Plan Cross-Check Across `specs/001..012`)

| Feature Hiện có | Tác động từ Constitution v2.0.0 & `013` | Cập nhật Plan Tương ứng |
| :--- | :--- | :--- |
| **`001-foundation-game-engine`** | Primary DB vẫn 100% JSON (`JsonDatabaseEngine`); thêm hook đẩy backup sang `eldoria-backups` (MinIO) và healthcheck hợp nhất `/api/v1/health` báo trạng thái `jsonDb` + `redis` + `minio`. | Cập nhật `specs/001/plan.md` & `docs/architecture/database-design.md` |
| **`002-auth-character`** | `Session` vẫn ghi bền vững vào `data/db/sessions/*.json`, đồng thời cache nóng trong Local Redis (TTL = token expiry) và đếm khóa brute-force bằng Redis sliding window (fallback RAM). | Cập nhật `specs/002/plan.md` |
| **`003-world-movement`** | Bản đồ `.tmj` và tileset (`extrude: 1px`, `padding: 2px`) nạp từ Local MinIO `eldoria-assets`; `ZoneInstance` ghi trạng thái `presence:zone:<id>` lên Local Redis; camera khóa số nguyên chống rách ô đất. | Cập nhật `specs/003/plan.md` |
| **`004-combat-skills`** | Tách hoàn toàn Visual Animation (`CharacterHfsmController` + `AnimationStuckWatchdog`) khỏi Server Combat Hit; VFX atlas nạp từ MinIO, Depth `180–199` & `109500` bất biến. | Đã khớp chuẩn; đối chiếu qua `validate-animation-pipeline.mjs` |
| **`005..009`** | Giao dịch Inventory/Loot/Craft/Enhance/Housing/Gacha vẫn 100% WAL nguyên tử trên `data/db/**/*.json`; Local Redis chỉ hỗ trợ lớp khóa nhanh/chống spam đầu vào, KHÔNG thay thế WAL JSON. | Không phá vỡ invariant nào |
| **`010-multiplayer-social`** | Presence trực tuyến, danh sách bạn bè online, lời mời Party TTL `60s`, rate-limit chat và pub/sub sự kiện vùng tận dụng Local Redis để mở rộng mượt mà hơn. | Cập nhật `specs/010/plan.md` |
| **`011-dungeon-boss`** | Atlas Boss `128×128..256×256` tải lười (lazy-load) từ MinIO khi vào `dng_mossroot_hollow`, giải phóng VRAM khi rời phụ bản; giữ nguyên quy tắc Telegraph `180–199`. | Đã khớp chuẩn |
| **`012-game-ui-qa`** | Bổ sung Playwright visual regression chống tile seam bleed, sub-pixel blur, animation stuck watchdog test (`1,000` transitions) và Docker stack smoke test (`redis` restart zero-data-loss). | Cập nhật `specs/012/plan.md` |

---

## Complexity Tracking

| Hạng mục Bổ sung | Lý do Cần thiết | Phương án Đơn giản hơn & Lý do Loại bỏ |
| :--- | :--- | :--- |
| **Local Docker Redis + Degraded Fallback** | Đáp ứng yêu cầu người dùng tăng tốc presence/session/rate-limit/pub-sub trên Docker cục bộ mà không hy sinh tính tự chủ 100% JSON DB. | *Chỉ dùng RAM in-process*: Vẫn hoạt động tốt ở 20–50 CCU nhưng thiếu công cụ pub/sub & sliding-window rate limit chuẩn khi nâng lên 100–500 CCU hoặc nhiều worker. |
| **Local Docker MinIO S3-Compatible Storage** | Đáp ứng yêu cầu người dùng quản lý tập trung kho sprite sheet/atlas/tileset/audio lớn và bản sao lưu JSON bằng chuẩn S3 cục bộ trong Docker. | *Phục vụ static thẳng từ NestJS*: Đơn giản hơn nhưng trộn tải truyền ảnh lớn với vòng lặp 20 Hz và không hỗ trợ versioning/bucket backup chuẩn S3. |
| **Deterministic Offline PNG Pixel Generator** | Đáp ứng yêu cầu tự tạo trọn bộ file `.png` pixel 4 hướng, ra chiêu, hiệu ứng và hoạt ảnh `16×16` trong gói triển khai 6–8 tiếng mà không dùng API trả phí hay tải asset không rõ bản quyền. | *Vẽ tay toàn bộ 159 ngày công trước khi chạy E2E*: Bất khả thi trong khung 6–8 tiếng; dùng bộ sinh PNG pixel nghệ thuật nhất quán tạo ngay bộ sprite hoàn chỉnh chơi được end-to-end và dễ thay thế từng atlas bằng bản vẽ tay Wave 1 sau này. |

---

## End-to-End 6–8 Hour Autonomous Delivery Plan (PNG Pixel Sprite Pipeline + Full User Wiring — `Q1-A` & `Q2-C` Ratified)

> **Quyết định Đã Chốt từ Chủ dự án (`DEC-004`, 2026-11-19)**:
> - **`Q1-A` (Pixel Standard)**: Giữ chuẩn `32×32 px` base tile, `48×64 px` humanoid, `128×128..256×256 px` boss theo `Constitution §V`, đồng thời khóa chuẩn **`16×16 px`** cho toàn bộ hoạt ảnh VFX hạt, đạn đạo nhỏ, icon động, vật phẩm rơi lấp lánh và hạt môi trường (`1:1` mật độ pixel, `0` mixel).
> - **`Q2-C` (Full 13-Spec + 24/24 Screens Scope via Multi-Run Checkpoints)**:
>   - **Run 1 (6–8 giờ đầu — Block A→F)**: Hoàn chỉnh toàn bộ hạ tầng Docker (`server` + `redis` + `minio` + `minio-init`), 100% JSON Primary DB WAL, **bộ sinh ảnh `.png` 4 hướng + ra chiêu + VFX + hoạt ảnh `16×16`**, và lát cắt dọc E2E chơi được xuyên suốt từ Auth → Chọn Hero → World 20Hz/60FPS → Combat/Skills/VFX → Loot/Inventory → Farm/Build → `+0→+10` Forge → Fair Gacha → Boss Thornback 3 Phase + E2E QA.
>   - **Run 2 (Tiếp nối ngay sau Checkpoint Run 1)**: Hoàn thiện đủ `24/24` màn hình React RPG (`SCR-01..24`), các module phụ trợ đầy đủ của `006..012` (toàn bộ crafting/husbandry/friends/block/accessibility `VP-A11Y`), `specs/014-quests-onboarding` và kiểm thử tải `20–500 CCU`.
> - **`Q3-1 & 2` (Implementation Mode Authorized)**: Chính thức mở khóa chuyển sang **`IMPLEMENTATION MODE`** ngay sau khi hoàn tất `/speckit-tasks`.

### 1. Kiến trúc Pipeline Sinh Ảnh `.png` Pixel 2D Tự động 100% Cục bộ (`tools/asset-pipeline/`)
- **Các module generator thuần Node.js 22 (`node:zlib`, 0 native binary, 0 API ngoài, 0 ảnh Internet)**:
  - `tools/asset-pipeline/png-encoder.mjs`: Bộ mã hóa RGBA 32-bit `.png` + bộ tạo Phaser 3 JSON Hash Atlas có `padding: 2px` & `extrude: 1px` tự động.
  - `tools/asset-pipeline/generate-hero-pngs.mjs`: Sinh 3 Anh hùng MVP (`48×64`, 4 hướng `down/up/left/right`, đủ trạng thái chiến đấu & đời sống).
  - `tools/asset-pipeline/generate-vfx-16x16-pngs.mjs`: Sinh toàn bộ bảng ảnh **`16×16 px` hoạt ảnh** (hit sparks, projectiles, elemental bursts, status icons, loot sparkles, water/grass/fire loops) + VFX chiêu/Ultimate MVP & vòng Boss Telegraph `#FF3B3B`.
  - `tools/asset-pipeline/generate-world-boss-pngs.mjs`: Sinh quái MVP, `boss_thornback_elder` (`128×128`, 3 phase + stagger), 2 vật nuôi, 5 cây trồng theo giai đoạn, 6 công trình và extruded tilesets (`32×32`, `extrude: 1px`).
  - `tools/asset-pipeline/generate-all-mvp-pngs.mjs`: Trình điều phối sinh toàn bộ tệp `.png`/`.json` + `assets/v1/manifest.json` (SHA-256) và đồng bộ lên Local MinIO `eldoria-assets/v1/`.

### 2. Lộ trình Triển khai Liên tục 6–8 Giờ Có Điểm Kiểm tra An toàn (6 Checkpointed Blocks)

| Block & Thời lượng (`proposed`) | Phạm vi Thực thi End-to-End | Đầu ra Kiểm chứng Độc lập (Runnable Checkpoint) |
| :--- | :--- | :--- |
| **Block A — Giờ 0.0 → 1.0**<br>*(Foundation + Local Docker Stack)* | Khởi tạo Monorepo (`apps/client`, `apps/game-server`, `packages/shared`, `packages/game-config`), `docker-compose.yml` (`eldoria-server`, `redis:7-alpine volatile-lru`, `minio/minio`, `minio-init`), `JsonDatabaseEngine` (WAL 2PC + atomic rename + SHA-256 + per-char ledger), `GameCatalogLoader` (12 JSON files), `LocalRedisModule`, `LocalMinioModule`, `GET /api/v1/health`. | `docker compose up -d` lên xanh `< 60s`; `GET /api/v1/health` trả 4 thành phần `UP`; unit test WAL crash recovery PASS. |
| **Block B — Giờ 1.0 → 2.5**<br>*(PNG Pixel Generator + Extrude/Pad + MinIO Sync)* | Viết & chạy `generate-pixel-pngs.mjs` sinh toàn bộ PNG 4 hướng (trước/sau/trái/phải), ra chiêu, VFX, `16×16` hoạt ảnh, quái, boss, cây trồng, công trình & tilesets; chạy `pack-and-verify-assets.mjs` (`extrude: 1px`, `padding: 2px`, SHA-256 manifest) và mirror lên Local MinIO `eldoria-assets/v1/`. | 100% PNG mở xem sắc nét bằng mắt thường; `AssetManifestBootValidator` PASS `0` lỗi; trình duyệt tải trực tiếp từ `localhost:9000/eldoria-assets/v1/`. |
| **Block C — Giờ 2.5 → 4.0**<br>*(Auth + Character + 20Hz/60FPS Pixel World)* | Triển khai `IdentityModule` (`crypto.scrypt` + JWT + Redis hot-session & lockout), `CharacterModule` (3 starter MVP), `WorldModule` & `MovementModule` (Tiled map collision dùng chung, 20 Hz tick, 10 Hz delta snapshot, Redis presence). Client Phaser 3: `MinioAssetLoader`, `PixelCameraController` (`roundPixels`, DPI resize), `DepthLayerManager` (Y-Sort + canopy alpha `0.55`), `PixelAnimationRegistry`, `CharacterHfsmController`, `AnimationStuckWatchdog`. | 2 tab trình duyệt đăng nhập, tạo Kael/Lyra/Seraphina, đi lại 4 hướng thấy nhau mượt trên bản đồ Greenhaven → Whispering Forest bằng PNG thật (`0` seam bleed, `0` stuck). |
| **Block D — Giờ 4.0 → 5.5**<br>*(Action Combat + Skills + VFX + Loot/Inventory)* | Triển khai `CombatModule` & `SkillModule` (Basic 3-Combo + 15 kỹ năng MVP, áp dụng ngay cân chỉnh `BLG-BAL-001` cho Boss TTK), Dodge i-frame `300ms`, Block/Parry, Hit-Stop & 2-frame Hit-Flash, phát VFX PNG & `16×16` hit sparks đồng bộ multiplayer; triển khai `InventoryModule`, `LootModule` (`PERSONAL_INSTANCED`) và `CurrencyLedger` WAL JSON. | Đánh quái rừng bằng combo + chiêu + Ultimate thấy rõ hiệu ứng PNG, nhặt đồ cá nhân, lưu bền vững vào `data/db/inventories/*.json`. |
| **Block E — Giờ 5.5 → 7.0**<br>*(Core Life-Sim + `+10` Forge + Fair Gacha + Boss Arena)* | Ghép nối lát cắt dọc hoàn chỉnh: Farming/Building grid cơ bản tại Homestead (5 cây MVP, 6 công trình, thu hoạch/nấu ăn), Blacksmith Enhancement `+0 → +10` nguyên tử 100% thành công qua WAL, Fair In-Game Gacha (`bnr_perm_heroes`, `bnr_perm_arsenal` + Pity), Party Co-op 2–4 người và `dng_mossroot_hollow` đối đầu `boss_thornback_elder` 3 phase + Telegraph `#FF3B3B` (`Depth 180–199` + `109500`). | Chơi trọn chuỗi 10 bước từ làng → farm → rèn vũ khí → quay gacha nội tệ → lập party hạ Boss Thornback 3 phase không lỗi hiển thị. |
| **Block F — Giờ 7.0 → 8.0**<br>*(End-to-End UI Polish + Automated QA & Resilience Gates)* | Hoàn thiện HUD & các màn hình RPG trọng yếu (Auth, Starter Select, Main HUD, Inventory, Blacksmith `+10`, Gacha, Farm/Build, Party/Boss Reward, Settings), chạy đủ bộ kiểm thử tự động: `1,000`-transition Watchdog stress test (`SC-003`), Playwright visual check `720p/1080p/1440p` + DPI (`SC-004`), 50-tx Redis `FLUSHALL` + restart zero-data-loss (`SC-005`), MinIO backup restore (`SC-006`), và E2E user flow test từ đầu đến cuối. | Toàn bộ cổng kiểm thử tự động PASS; sinh báo cáo bằng chứng thực tế (ảnh chụp, log test, số liệu đo thật). |

### 3. Phạm vi Rõ ràng Cho Multi-Run Full 13-Spec / 24-Screen Delivery (`Q2-C`)
- **Run 1 (Giờ 0 → 8 — Core E2E Vertical Slice + All Real PNG Assets)**: Docker stack (`server` + `redis` + `minio` + `minio-init`), 100% JSON Primary DB WAL, toàn bộ bộ PNG 4 hướng + ra chiêu + VFX + `16×16` động cho MVP, Auth/Character, World 2 vùng + 1 Boss Arena, Combat 3 Hero / 15 Skill (`BLG-BAL-001` đã áp dụng), Loot/Inventory, Crafting/Farm/Build cốt lõi, `+0→+10` Forge, Fair Gacha 2 banner, Party/Chat cơ bản, HUD + màn hình chơi chính và bộ test tự động E2E + resilience.
- **Run 2 (Tiếp nối sau Checkpoint Run 1 — Full 24/24 Screens & Remaining Specs Completion)**: Hoàn thiện toàn bộ `24/24` màn hình React RPG (`SCR-01..24`) đạt WCAG AA & `VP-A11Y 130%`, toàn bộ công thức/vật nuôi/friends/block 50-100 của `006..012`, tách & triển khai `specs/014-quests-onboarding`, và chạy đủ bộ Load Test `20–500 CCU` + Playwright visual regression 24 màn hình.

