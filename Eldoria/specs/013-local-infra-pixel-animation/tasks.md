# Tasks: Local Containerized Runtime Cache (Redis), Object Asset Storage (MinIO S3), PNG 2D Pixel Generator & Glitch-Free Multi-Animation Pipeline

**Input**: Design documents from `/specs/013-local-infra-pixel-animation/`  
**Prerequisites**: `plan.md` (required), `spec.md` (required for user stories), `research.md`, `data-model.md`, `contracts/local-infra-and-pixel-pipeline.md`, `quickstart.md`, `specs/001-foundation-game-engine`  
**User-Ratified Decisions (`DEC-004`, 2026-11-19)**: `Q1-A` (`32×32` tile / `48×64` hero / `128×128..256×256` boss + `16×16` animated VFX/particles/projectiles/icons, zero mixel) · `Q2-C` (Full 13-spec + 24/24 screens via Checkpointable Multi-Run Strategy: Run 1 6–8h Core E2E + Real PNGs, Run 2 Full 24/24 Screens & QA) · `Q3-1&2` (**Implementation Mode Authorized** — ready for `/speckit-implement`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (`US1`, `US2`, `US3`, `US4`)
- Include exact file paths in descriptions and explicit `data-model.md` + `Entity.field` citations for all constrained fields

## Path Conventions

- **Monorepo**: `apps/game-server/src/`, `apps/client/src/`, `packages/shared/src/`, `tools/docker/`, `tools/asset-pipeline/`, `assets/v1/`, `docker-compose.yml`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize local Docker Compose container stack, bucket bootstrap automation, and environment templates strictly bound to local interfaces (zero external cloud services).

- [X] T001 Create local Docker Compose stack blueprint (`eldoria-server`, `redis:7-alpine` with unified `maxmemory 256mb` and `maxmemory-policy volatile-lru`, `minio/minio`, `minio/mc` init sidecar) with strict `127.0.0.1` local bindings and component healthchecks in `docker-compose.yml` and `.env.example`
- [X] T002 [P] Create automated MinIO bucket bootstrap script (`eldoria-assets` public-read + local CORS, `eldoria-backups` private, versioned `v1/` asset mirroring with SHA-256 verification) in `tools/docker/minio-init.sh`
- [X] T003 [P] Configure local Docker and PNG asset pipeline npm scripts and lint rules ensuring zero external cloud endpoints or SQL/NoSQL dependencies in `package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared Zod data contracts (covering 100% of constrained fields in `data-model.md`) and base NestJS infrastructure adapters for Local Redis & Local MinIO that MUST complete before user story implementation.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Define shared Zod schemas and TypeScript contracts in `packages/shared/src/contracts/assets-and-animation.ts` enforcing every canonical constraint from `data-model.md` for `AssetManifest` (`AssetManifest.manifestVersion`, `AssetManifest.generatedAt`, `AssetManifest.pixelStandard`, `AssetManifest.entries`), `AssetEntry` (`AssetEntry.assetKey`, `AssetEntry.objectKey`, `AssetEntry.kind`, `AssetEntry.loadingGroup`, `AssetEntry.sha256`, `AssetEntry.sizeBytes`), `BackupObjectSnapshot` (`BackupObjectSnapshot.backupId`, `BackupObjectSnapshot.reason`, `BackupObjectSnapshot.sourceJsonFileCount`, `BackupObjectSnapshot.archiveSha256`, `BackupObjectSnapshot.retentionTier`, `BackupObjectSnapshot.createdAt`), `AnimationClipDefinition` (`AnimationClipDefinition.clipKey`, `AnimationClipDefinition.entityId`, `AnimationClipDefinition.state`, `AnimationClipDefinition.direction`, `AnimationClipDefinition.atlasKey`, `AnimationClipDefinition.frameCount`, `AnimationClipDefinition.frameDurationMs`, `AnimationClipDefinition.loop`, `AnimationClipDefinition.priority`, `AnimationClipDefinition.pivotNorm`, `AnimationClipDefinition.hitFrameIndex`, `AnimationClipDefinition.cancelWindowStartFrame`, `AnimationClipDefinition.watchdogMaxDurationMs`, `AnimationClipDefinition.fallbackState`), and unified `HealthCheckResponse`
- [X] T005 [P] Implement `LocalRedisModule` and `LocalRedisService` (`ioredis` targeting local Docker Redis `redis://redis:6379`, exponential reconnect, memory usage `> 80%` warning probe, and automatic degraded `RAM_FALLBACK` switch) in `apps/game-server/src/infrastructure/redis/local-redis.module.ts` and `apps/game-server/src/infrastructure/redis/local-redis.service.ts`
- [X] T006 [P] Implement `LocalMinioModule` and `LocalMinioService` (`@aws-sdk/client-s3` configured strictly with `endpoint: http://minio:9000` and `forcePathStyle: true`, bucket health probe, streaming upload/download with SHA-256 verification, and `ASSET_STORAGE_MODE=local_fs` fallback) in `apps/game-server/src/infrastructure/minio/local-minio.module.ts` and `apps/game-server/src/infrastructure/minio/local-minio.service.ts`

**Checkpoint**: Foundation ready — user story implementation can now proceed in parallel.

---

## Phase 3: User Story 1 - Sinh Ảnh PNG Pixel 4 Hướng / Ra Chiêu / Hiệu Ứng `16×16` & Bộ Máy Hoạt Ảnh 2D Không Lỗi (Priority: P1) 🎯 MVP

**Goal**: Deterministically generate real transparent RGBA32 `.png` pixel sprite sheets and Phaser JSON atlases offline (4 directions front/back/left/right, skill casts, VFX, `16×16` animated micro-effects/projectiles/icons, MVP monsters, `boss_thornback_elder`, animals, crops, buildings, and extruded `32×32` tilesets per `Q1-A`) and power them with a zero-blur, zero-bleed, zero-stuck 2D Phaser 3 rendering & HFSM animation engine.

**Independent Test**: Run `generate-all-mvp-pngs.mjs` to inspect crisp transparent `.png` sheets on disk, load the sandbox scene with 3 MVP heroes, 1 monster, 1 boss, extruded grass/water tiles, and Y-sorted tree/pillar obstacles; cycle all 25 humanoid states × 4 directions plus `16×16` VFX effects at 720p/1080p/1440p + 125%/150% DPI, and run 1,000 rapid transitions asserting 0% stuck states, 0 seam bleeds, and 0 pixel blur.

### Offline Deterministic PNG Pixel Art & Atlas Generators (`FR-013`, `Q1-A`)

- [X] T007 [P] [US1] Implement pure Node.js 22 (`node:zlib`) RGBA32 `.png` encoder and Phaser 3 JSON Hash atlas packer enforcing `padding: 2px`, `extrude: 1px`, POT `<= 2048×2048`, and SHA-256 hashing per `data-model.md` (`AssetManifest.pixelStandard`, `AssetEntry.sha256`, `AssetEntry.sizeBytes`) in `tools/asset-pipeline/png-encoder.mjs`
- [X] T008 [P] [US1] Implement 4-direction (`down`/`front`, `up`/`back`, `left`, `right`) `48×64` hero PNG sprite-sheet generator for the 3 MVP heroes (`chr_kael_vanguard`, `chr_lyra_windrunner`, `chr_seraphina_dawn`) covering idle, walk, run, 3-hit attack combo, cast/skill, ultimate, dodge, block, hit, death, mining, woodcutting, farming, and fishing per `data-model.md` (`AnimationClipDefinition.clipKey`, `AnimationClipDefinition.entityId`, `AnimationClipDefinition.state`, `AnimationClipDefinition.direction`, `AnimationClipDefinition.frameCount`, `AnimationClipDefinition.frameDurationMs`, `AnimationClipDefinition.pivotNorm`) in `tools/asset-pipeline/generate-hero-pngs.mjs`
- [X] T009 [P] [US1] Implement `16×16` animated VFX, projectile, hit-spark, status-icon, loot-sparkle, and environmental-particle PNG sprite-sheet generator plus MVP skill/ultimate VFX (`Crimson Crescent`, `Tempest Arrowstorm`, `Solar Judgment`) and `#FF3B3B` Boss Telegraph overlays per `data-model.md` (`AssetManifest.pixelStandard`) in `tools/asset-pipeline/generate-vfx-16x16-pngs.mjs`
- [X] T010 [P] [US1] Implement Wave 1 monsters (`mob_moss_slime`, `mob_forest_goblin`, `mob_timber_wolf` + MVP forest pack), `boss_thornback_elder` (`128×128`, 3 phases + stagger), 2 farm animals, 5 crop growth-stage sheets, 6 homestead buildings, and extruded `32×32` tilesets (`reg_greenhaven_village`, `reg_whispering_forest`, `dng_mossroot_hollow`) PNG generator in `tools/asset-pipeline/generate-world-boss-pngs.mjs`
- [X] T011 [US1] Implement master asset build CLI orchestrating `T008–T010` to generate all `.png`/`.json` atlases under `assets/v1/` and emit `assets/v1/manifest.json` per `data-model.md` (`AssetManifest.manifestVersion`, `AssetManifest.generatedAt`, `AssetManifest.pixelStandard`, `AssetManifest.entries`, `AssetEntry.assetKey`, `AssetEntry.objectKey`, `AssetEntry.kind`, `AssetEntry.loadingGroup`, `AssetEntry.sha256`, `AssetEntry.sizeBytes`) in `tools/asset-pipeline/generate-all-mvp-pngs.mjs`

### Glitch-Free 2D Phaser Renderer & Multi-Animation Engine (`FR-006..FR-009`, `FR-011`)

- [X] T012 [US1] Implement `MinioAssetLoader` in Phaser 3 `BootScene` loading grouped entries per `data-model.md` (`AssetManifest.pixelStandard`, `AssetEntry.assetKey`, `AssetEntry.objectKey`, `AssetEntry.kind`, `AssetEntry.loadingGroup`, `AssetEntry.sha256`, `AssetEntry.sizeBytes`) with max `3` bounded retries, `/assets` fallback, and safe pixel placeholder texture in `apps/client/src/game/rendering/MinioAssetLoader.ts`
- [X] T013 [P] [US1] Implement `PixelCameraController` enforcing `640x360` integer scaling, `pixelArt: true`, `antialias: false`, `roundPixels: true`, `Math.round` camera scroll snapping, dynamic browser resize + `125%/150%` DPI recalculation, and damped integer-pixel camera shake (`0%/50%/100%`) in `apps/client/src/game/rendering/PixelCameraController.ts`
- [X] T014 [P] [US1] Implement `DepthLayerManager` enforcing the unified Render Depth Stack (`0-99` ground, `100-119` ally decals, `180-199` unlit Boss Telegraph, `200-299` ground shadows, `1000+Math.round(footY)` Y-sort entities, `100000-109999` air VFX + canopy occlusion `alpha 0.55`, `109500` Telegraph Rim Echo, `110000-119999` overlays) in `apps/client/src/game/rendering/DepthLayerManager.ts`
- [X] T015 [US1] Implement `PixelAnimationRegistry` registering all 25 humanoid states × 4 directions (extensible to 8) plus monster/elite/boss/animal/crop/`16×16` VFX animations per `data-model.md` (`AnimationClipDefinition.clipKey`, `AnimationClipDefinition.entityId`, `AnimationClipDefinition.state`, `AnimationClipDefinition.direction`, `AnimationClipDefinition.atlasKey`, `AnimationClipDefinition.frameCount`, `AnimationClipDefinition.frameDurationMs`, `AnimationClipDefinition.loop`, `AnimationClipDefinition.pivotNorm`) with `playSafe()` graceful fallback chain in `apps/client/src/game/animation/PixelAnimationRegistry.ts`
- [X] T016 [US1] Implement `CharacterHfsmController` enforcing 6 superstates, transition priorities, cancel windows, and visual-only VFX/SFX frame triggers per `data-model.md` (`AnimationClipDefinition.state`, `AnimationClipDefinition.priority`, `AnimationClipDefinition.hitFrameIndex`, `AnimationClipDefinition.cancelWindowStartFrame`) strictly decoupled from server 20 Hz combat damage in `apps/client/src/game/animation/CharacterHfsmController.ts`
- [X] T017 [US1] Implement `AnimationStuckWatchdog` monitoring every active non-looping clip per `data-model.md` (`AnimationClipDefinition.loop`, `AnimationClipDefinition.watchdogMaxDurationMs`, `AnimationClipDefinition.fallbackState`) to auto-recover stuck animations and record telemetry in `apps/client/src/game/animation/AnimationStuckWatchdog.ts`
- [X] T018 [P] [US1] Implement `AnimatedEnvironmentController` playing `16×16` animated water/grass/fire loops, lanterns, crop stage sprites, and weather pixel particles capped at `<= 120` concurrent particles and `<= 3 Hz` flash ceiling in `apps/client/src/game/rendering/AnimatedEnvironmentController.ts`

### Verification Tests for User Story 1

- [X] T019 [P] [US1] Write unit stress test driving `1,000` rapid HFSM transitions (including simulated dropped end-frames and missing clip keys) asserting `0%` stuck states and `0` uncaught exceptions (`SC-003`) in `apps/client/test/unit/animation-hfsm-watchdog.spec.ts`
- [X] T020 [P] [US1] Write and execute real Chrome Playwright visual integrity suite testing `1280x720`, `1920x1080`, `1080p @ 125% DPI`, and `1440p @ 150% DPI` for `0` tile seam bleeding, `image-rendering: pixelated`, `640×360` canvas, `0` console errors, `0` failed assets (`SC-004`) in `apps/client/test/e2e/pixel-visual-integrity.spec.ts` (verified via `npm run test:e2e:browser` with evidence screenshots in `docs/testing/evidence/`)

**Checkpoint**: User Story 1 (MVP) generates real crisp 2D `.png` sprite sheets (4-dir + skill cast + VFX + `16×16` animations) and renders them glitch-free across desktop viewports and 1,000 rapid state transitions.

---

## Phase 4: User Story 2 - Vận hành Hạ tầng Tự chủ Một Lệnh với Bộ nhớ Đệm Nóng & Kho Tài nguyên Đóng gói Cục bộ (Priority: P1)

**Goal**: Wire all Local Docker Redis ephemeral adapters (hot session, brute-force lockout, idempotency fast-path, presence, party invites, rate limiting, pub/sub) and Local Docker MinIO services (asset manifest serving & rotating JSON DB backup uploader) while keeping `data/db/**/*.json` as the sole persistent database.

**Independent Test**: Boot the local Docker Compose stack offline on a clean host, confirm automatic MinIO bucket creation and `.png` asset serving, execute concurrent logins, zone presence updates, party invites, and backup snapshots, and verify 100% of persistent records live in `data/db/**/*.json` and `eldoria-backups`.

### Implementation for User Story 2

- [X] T021 [P] [US2] Implement `RedisSessionCacheService` (`eldoria:sess:<sha256TokenHash>` read-through cache backed by `data/db/sessions/<id>.json` with instant revocation invalidation and RAM fallback) in `apps/game-server/src/infrastructure/redis/redis-ephemeral.services.ts`
- [X] T022 [P] [US2] Implement `RedisLockoutService` (`eldoria:auth:lockout:<accountOrIp>`, `900s` TTL brute-force lockout >= 5 failures with RAM fallback) and `RedisIdempotencyService` (`eldoria:idem:<accountId>:<action>:<key>`, `86400s` TTL fast-path backed by `data/db/indexes/idempotency/<accountId>.json`) in `apps/game-server/src/infrastructure/redis/redis-ephemeral.services.ts`
- [X] T023 [P] [US2] Implement `RedisPresenceAndInviteService` (`eldoria:presence:zone:<id>`, `eldoria:presence:char:<id>`, `eldoria:party:invite:<id>` `60s` TTL, `eldoria:pubsub:zone:<id>`) and `RedisRateLimitService` (`eldoria:rl:<scope>:<actorId>` sliding-window anti-spam with RAM fallback) in `apps/game-server/src/infrastructure/redis/redis-ephemeral.services.ts`
- [X] T024 [US2] Implement `AssetManifestService` and `GET /api/v1/assets/manifest` serving verified `eldoria-assets` metadata per `data-model.md` (`AssetManifest.manifestVersion`, `AssetManifest.generatedAt`, `AssetManifest.pixelStandard`, `AssetManifest.entries`, `AssetEntry.assetKey`, `AssetEntry.objectKey`, `AssetEntry.kind`, `AssetEntry.loadingGroup`, `AssetEntry.sha256`, `AssetEntry.sizeBytes`) with `/assets` fallback URL in `apps/game-server/src/infrastructure/minio/local-minio.service.ts`
- [X] T025 [US2] Extend `LocalBackupService` (`001`) with `BackupUploaderService` archiving rotating 6h/daily `data/db/` snapshots into private bucket `eldoria-backups` per `data-model.md` (`BackupObjectSnapshot.backupId`, `BackupObjectSnapshot.reason`, `BackupObjectSnapshot.sourceJsonFileCount`, `BackupObjectSnapshot.archiveSha256`, `BackupObjectSnapshot.retentionTier`, `BackupObjectSnapshot.createdAt`), enforcing `< 15%` low-disk warning alerts and rejecting truncated/checksum-mismatched uploads in `apps/game-server/src/infrastructure/minio/local-minio.service.ts`

### Verification Tests for User Story 2

- [X] T026 [P] [US2] Write integration test verifying Redis session cache, brute-force lockout (`900s`), idempotency fast-path (`24h`), presence TTL, and rate-limit sliding window under fallback/flush modes in `apps/game-server/test/integration/redis-restart-zero-data-loss.spec.ts`
- [X] T027 [P] [US2] Write integration test verifying `GET /api/v1/assets/manifest`, local MinIO bucket access policies, `< 15%` low-disk warning probe, corrupt-upload checksum rejection, and `< 5 min` backup restore (`SC-006`) in `apps/game-server/test/integration/minio-assets-and-backups.spec.ts`

**Checkpoint**: User Stories 1 and 2 work independently with full local Docker Redis + MinIO integration and 100% JSON primary persistence.

---

## Phase 5: User Story 3 - Kiểm chứng Tự động Toàn vẹn Bộ Hoạt ảnh & Tài nguyên 2D Trước Khi Chơi (Priority: P2)

**Goal**: Automate pre-pack and server boot-time verification of 100% MVP `.png` sprite atlases, extruded tilesets, animation clips, and MinIO object existence/checksums so zero broken-sprite or missing-key defects reach gameplay.

**Independent Test**: Feed a sample asset bundle with an intentionally missing combat clip or un-extruded tileset into both the pre-pack CLI and server boot validator and verify immediate fail-fast reporting naming the exact entity/state/key; fix it and verify 100% pass (`SC-002`).

### Implementation & Verification for User Story 3

- [X] T028 [US3] Build pre-pack asset verification gate CLI checking `extrude: 1px` on all tilesets, `padding: 2px` on POT `<= 2048` sprite atlases, valid PNG headers/transparency, and cross-checking `assets/v1/manifest.json` against `data-model.md` (`AssetManifest.manifestVersion`, `AssetManifest.generatedAt`, `AssetManifest.pixelStandard`, `AssetManifest.entries`, `AssetEntry.assetKey`, `AssetEntry.objectKey`, `AssetEntry.kind`, `AssetEntry.loadingGroup`, `AssetEntry.sha256`, `AssetEntry.sizeBytes`, `AnimationClipDefinition.clipKey`, `AnimationClipDefinition.entityId`, `AnimationClipDefinition.state`, `AnimationClipDefinition.direction`, `AnimationClipDefinition.atlasKey`, `AnimationClipDefinition.frameCount`, `AnimationClipDefinition.frameDurationMs`, `AnimationClipDefinition.pivotNorm`, `AnimationClipDefinition.hitFrameIndex`) in `tools/asset-pipeline/pack-and-verify-assets.mjs`
- [X] T029 [US3] Implement NestJS `onModuleInit` `AssetManifestService.loadAndValidate` verifying `AssetManifest` schema, SHA-256 digests, and MinIO `HeadObject`/local existence for `AssetEntry.objectKey` / `AssetEntry.sha256` / `AssetEntry.sizeBytes` (`data-model.md`) on server startup (fail-fast on corrupted manifest, degraded warning on transient MinIO outage) in `apps/game-server/src/infrastructure/minio/local-minio.service.ts`
- [X] T030 [P] [US3] Write contract tests verifying `pack-and-verify-assets.mjs` and `AssetManifestService` reject missing MVP animation keys, wrong frame counts, missing `1px` extrude, and mismatched object checksums (`SC-002`) in `apps/game-server/test/integration/asset-animation-preflight.spec.ts`

**Checkpoint**: 100% of MVP 2D pixel `.png` assets and animation keys are machine-verified before upload and on server boot.

---

## Phase 6: User Story 4 - Khôi phục An toàn Khi Dịch vụ Phụ trợ Khởi động lại Không Mất Dữ liệu Người chơi (Priority: P2)

**Goal**: Prove unified health reporting (`OK | DEGRADED`) and zero persistent data loss when Local Docker Redis flushes or restarts mid-session.

**Independent Test**: Execute 50 consecutive inventory/enhancement/gacha WAL transactions, execute `redis-cli FLUSHALL` and restart the Redis container, then reload all characters and verify 100% JSON integrity and transparent reconnect (`SC-005`).

### Implementation & Verification for User Story 4

- [X] T031 [US4] Implement unified `GET /api/v1/health` controller aggregating `jsonPrimaryDb`, `gameCatalog`, `localRedis` (`CONNECTED | RAM_FALLBACK`), and `localMinio` (`UP | DEGRADED`) returning HTTP `503` only when `jsonPrimaryDb` or `gameCatalog` is down and HTTP `200 DEGRADED` on transient Redis/MinIO interruption in `apps/game-server/src/modules/health/health.controller.ts`
- [X] T032 [US4] Write zero-data-loss resilience integration test executing `50` consecutive inventory/enhancement/gacha WAL commits followed by Local Redis `FLUSHALL` asserting `100%` data integrity in `data/db/**/*.json` and automatic fallback recovery (`SC-005`) in `apps/game-server/test/integration/redis-restart-zero-data-loss.spec.ts`

**Checkpoint**: All 4 user stories are independently implemented and verified.

---

## Phase 7: Polish, End-to-End User Wiring & Multi-Run Verification (`FR-014`, `Q2-C`)

**Purpose**: Wire generated `.png` sprite sheets & `16×16` animations end-to-end across playable scenes and React UI screens, verify full user journey against live Local Docker stack, and maintain clean Run 1 → Run 2 checkpoints toward all 13 specs & 24/24 screens.

- [X] T033 Wire end-to-end player gameplay loop binding real `.png` sprite sheets (4-dir movement, 3-hit combo, 15 MVP skill casts, `16×16` VFX/particles, ground loot sparkles, homestead crops/buildings, and `boss_thornback_elder` 3-phase `#FF3B3B` telegraphs) across `WorldScene`, `DungeonScene`, and all 24 React RPG UI screens (`SCR-01..24`, `FR-014`) in `apps/client/src/game/scenes/WorldScene.ts`, `apps/client/src/game/scenes/DungeonScene.ts`, and `apps/client/src/ui/*.tsx`
- [X] T034 Write and execute full End-to-End Chrome Playwright User Journey test (`Register → Create Hero → 4-Dir Walk & Vietnamese Chat in Greenhaven → Farming Harvest/Chicken → Craft Copper Ingot → Enhance +0→+1 → Fair Gacha x10 → Boss Thornback Elder Arena + #FF3B3B Telegraph + Ultimate → Boss Ignis Forgelord Arena → Settings JSON Persistence`, `FR-014`) in `apps/client/test/e2e/full-user-journey.spec.ts` (verified `10/10` steps PASS via `npm run test:e2e:browser`)
- [X] T035 [P] Maintain and verify the offline 2D multi-animation visual showcase (`FR-012`, pre-built during Design Phase) against updated MVP animation metadata and zero external URLs in `docs/ui-ux/mockups/pixel-animation-showcase.html`
- [ ] T036 [P] Create automated local Docker Compose cold-start smoke test measuring clean `docker compose up -d` boot time to all-healthy state asserting `< 60s` (`SC-001`) in `tools/docker/verify-local-stack-boot.mjs` _(Script created & `--config-only` PASS; live `docker compose up -d` cold-start timing pending Windows Docker Desktop daemon start)_
- [X] T037 Record Run 1 & Full 24-Screen Implementation completion checkpoint in `docs/management/PROGRESS.md`
- [X] T038 Run full cross-validation gate (`validate-catalog.mjs`, `validate-animation-pipeline.mjs`, `audit-workspace.mjs`, `assets:verify`, `npm run build`, `npm run test`, and live production server smoke test) and record verified evidence before closing feature `013`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Runs alongside `specs/001-foundation-game-engine` monorepo root (`BLG-001`) at start of **Run 1 — Block A**.
- **Foundational (Phase 2)**: Depends on Setup completion — **BLOCKS** all user stories (`T004` schemas + `T005`/`T006` base Redis/MinIO adapters).
- **User Stories (Phase 3–6)**: All depend on Foundational (Phase 2):
  - **US1 (P1 🎯 MVP)** (`T007–T020`, Block B–C) and **US2 (P1)** (`T021–T027`, Block A–B) run in parallel.
  - **US3 (P2)** (`T028–T030`) depends on `T011`, `T024` (pre-pack & boot validator).
  - **US4 (P2)** (`T031–T032`) depends on `T005`, `T006`, `T021–T023` (unified health & Redis restart zero-data-loss test).
- **Polish & E2E Wiring (Phase 7)**: `T033–T034` connect live gameplay modules from `002..012` with `013` PNG/Docker infrastructure (Block D–F in Run 1, expanding to all 24/24 screens in Run 2 per `Q2-C`).

### Parallel Execution Examples

```bash
# Phase 3 (US1 — Block B PNG Generation) — Generate all 3 PNG asset families in parallel after T007:
Task: "T008 [US1] Generate 4-dir 48x64 hero PNG sheets in tools/asset-pipeline/generate-hero-pngs.mjs"
Task: "T009 [US1] Generate 16x16 animated VFX & skill/telegraph PNG sheets in tools/asset-pipeline/generate-vfx-16x16-pngs.mjs"
Task: "T010 [US1] Generate mobs, Boss Thornback, animals, crops, buildings & extruded tileset PNGs in tools/asset-pipeline/generate-world-boss-pngs.mjs"

# Phase 3 (US1 — Block C Renderer) — Implement camera, depth stack & animated environment in parallel:
Task: "T013 [US1] Implement PixelCameraController in apps/client/src/game/rendering/PixelCameraController.ts"
Task: "T014 [US1] Implement DepthLayerManager in apps/client/src/game/rendering/DepthLayerManager.ts"
Task: "T018 [US1] Implement AnimatedEnvironmentController in apps/client/src/game/rendering/AnimatedEnvironmentController.ts"

# Phase 4 (US2) — Launch all 5 Redis ephemeral adapters in parallel:
Task: "T021 [US2] Implement RedisSessionCacheService"
Task: "T022 [US2] Implement RedisLockoutService & RedisIdempotencyService"
Task: "T023 [US2] Implement RedisPresenceAndInviteService & RedisRateLimitService"
```

---

## Implementation Strategy (`Q2-C` Multi-Run Autonomous Execution)

### Run 1 (Hours 0–8 — Core E2E Playable Vertical Slice + All Real PNG Assets)
1. **Block A (`0–1h`)**: Execute `001` core (`JsonDatabaseEngine` + Monorepo) + `013` Phase 1–2 (`T001–T006`) + `US2` Redis/MinIO adapters (`T021–T025`).
2. **Block B (`1–2.5h`)**: Execute `013` PNG Generators (`T007–T011`) + `US3` Pre-Flight/Boot Validators (`T028–T030`) → real `.png` 4-dir/skill/VFX/`16×16` assets live in Local MinIO!
3. **Block C (`2.5–4h`)**: Execute `002` + `003` + `013` Phaser 2D Engine (`T012–T018`) → multiplayer 4-dir walking with real PNG sprites!
4. **Block D (`4–5.5h`)**: Execute `004` (applying `BLG-BAL-001` Boss TTK tuning) + `005` + live VFX wiring.
5. **Block E (`5.5–7h`)**: Execute vertical-slice core of `006`, `007` (`+0→+10`), `008` (Farm/Build), `009` (Fair Gacha), `010` (Party/Chat), `011` (`boss_thornback_elder` 3 phases).
6. **Block F (`7–8h`)**: Execute `T019–T020`, `T026–T027`, `T031–T036` + core playable screens of `012` → **STOP & VERIFY RUN 1 GREEN CHECKPOINT (`T037`)**.

### Run 2 (Full 13-Spec + All 24/24 Screens Polish — `Q2-C`)
1. Complete all remaining secondary UI screens (`SCR-01..24`) & WCAG AA / `VP-A11Y 130%` Playwright audit (`012`).
2. Complete remaining catalog crafting/husbandry/friends/block edge cases across `006..011`, author/implement `specs/014-quests-onboarding` (`BLG-QST-001`), and run `20–500 CCU` load tests (`T038`).

---

## Notes

- `[P]` tasks operate on separate files with no unfinished blocking dependencies.
- Every single one of the **30 constrained fields** in `data-model.md` (`4` `AssetManifest`, `6` `AssetEntry`, `6` `BackupObjectSnapshot`, `14` `AnimationClipDefinition`) has explicit resolving `data-model.md` + `Entity.field` citations in implementing tasks (`T004`, `T007–T009`, `T011–T012`, `T015–T017`, `T024–T025`, `T028–T029`).
- All runtime performance metrics (`< 60s` boot, `60 FPS`, `<= 128 MB` VRAM, `20 Hz` tick, `< 2 ms` Redis p95) remain `proposed / unverified` until measured during `IMPLEMENTATION MODE`.
