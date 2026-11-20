# Tasks: Foundation, JSON-Only Database Engine & Game Loop Shell

**Input**: Design documents from `/specs/001-foundation-game-engine/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/json-db-and-health-contract.md`, `quickstart.md`

**Tests**: Bao gồm các tác vụ kiểm thử tự động trọng yếu (unit, WAL crash recovery, concurrency, fail-fast catalog) theo `docs/testing/test-strategy.md`.

## Phase 1: Setup (Shared Monorepo Infrastructure)

**Purpose**: Khởi tạo workspace monorepo TypeScript tự chủ (không dùng DB ngoài hay dịch vụ bên thứ ba).

- [ ] T001 Create monorepo workspace configuration (`package.json`, `tsconfig.base.json`, `.env.example`, `.gitignore` ignoring `data/`) at repository root
- [ ] T002 [P] Initialize `packages/shared/package.json` and canonical enums/constants in `packages/shared/src/enums/game-enums.ts`
- [ ] T003 [P] Initialize `packages/game-config/package.json` with Zod schema dependencies in `packages/game-config/src/index.ts`
- [ ] T004 [P] Initialize NestJS application shell in `apps/game-server/package.json` and `apps/game-server/src/main.ts`
- [ ] T005 [P] Initialize React + Vite + Phaser 3 + Zustand + Tailwind application shell in `apps/client/package.json` and `apps/client/vite.config.ts`

---

## Phase 2: Foundational (Core Utilities & Security Guards)

**Purpose**: Hạ tầng lõi an toàn đường dẫn, băm SHA-256 và khóa đồng thời bắt buộc trước mọi User Story.

- [ ] T006 Implement `PathSecurityGuard` enforcing safe path containment and `JsonEnvelope.entityId` identifier constraints per `data-model.md` in `apps/game-server/src/core/json-db/PathSecurityGuard.ts`
- [ ] T007 [P] Implement canonical JSON serialization and `JsonEnvelope.checksumSha256` verification helper per `data-model.md` in `apps/game-server/src/core/json-db/ChecksumUtil.ts`
- [ ] T008 [P] Implement `AsyncLockManager` with lexicographical `WalTransaction.lockKeys` sorting and `3000 ms` timeout per `data-model.md` in `apps/game-server/src/core/json-db/AsyncLockManager.ts`
- [ ] T009 [P] Define shared REST health, catalog, and `GameUiBridge` event types in `packages/shared/src/contracts/foundation-contracts.ts`

**Checkpoint**: Security guards, checksums, sorted locks, and shared contracts ready.

---

## Phase 3: User Story 1 - Bảo toàn Dữ liệu 100% trên Tệp JSON Cục bộ (Priority: P1) 🎯 MVP

**Goal**: Xây dựng `JsonDatabaseEngine` hoàn chỉnh với atomic write, multi-file JSON WAL, crash recovery, index rebuild, idempotency và rotating local backups.

**Independent Test**: Chạy integration test tạo DB mới, 50 giao dịch đồng thời, 100 kịch bản giả lập crash ở trạng thái WAL `PREPARED`, kiểm chứng `0` corrupt file, `0` deadlock và `verifyIntegrity()` đạt `100%`.

### Implementation for User Story 1

- [ ] T010 [P] [US1] Implement `JsonEnvelope` schema and validation enforcing `JsonEnvelope.$schemaVersion`, `JsonEnvelope.entityType`, `JsonEnvelope.entityId`, `JsonEnvelope.revision`, `JsonEnvelope.updatedAt`, `JsonEnvelope.checksumSha256`, and `JsonEnvelope.data` per `data-model.md` in `apps/game-server/src/core/json-db/schemas/json-envelope.schema.ts`
- [ ] T011 [P] [US1] Implement `AtomicFileWriter` (`tmp -> fsync -> rename` with NTFS `EPERM`/`EBUSY` bounded retry and safe read-only degradation on disk errors) in `apps/game-server/src/core/json-db/AtomicFileWriter.ts`
- [ ] T012 [P] [US1] Implement `SchemaManifest` bootstrap & migration tracker enforcing `SchemaManifest.currentVersion`, `SchemaManifest.initializedAt`, and `SchemaManifest.migrationsApplied` per `data-model.md` in `apps/game-server/src/core/json-db/SchemaManifestStore.ts`
- [ ] T013 [US1] Implement `WalManager` enforcing `WalTransaction.txId`, `WalTransaction.idempotencyKey`, `WalTransaction.status`, `WalTransaction.lockKeys`, `WalTransaction.operations`, `WalTransaction.checksumSha256`, and `WalTransaction.createdAt` per `data-model.md` in `apps/game-server/src/core/json-db/WalManager.ts`
- [ ] T014 [US1] Implement `IdempotencyStore` enforcing `IdempotencyRecord.compositeKey`, `IdempotencyRecord.status`, `IdempotencyRecord.responseSnapshot`, and `IdempotencyRecord.expiresAt` per `data-model.md` in `apps/game-server/src/core/json-db/IdempotencyStore.ts`
- [ ] T015 [US1] Implement `IndexManager` and automatic boot `IndexRebuilder` from primary aggregate JSON folders in `apps/game-server/src/core/json-db/IndexManager.ts`
- [ ] T016 [US1] Implement `CrashRecoveryService` (clean orphan `.tmp.*`, verify WAL checksum, idempotent roll-forward `PREPARED` WALs, cleanup `COMMITTED` WALs) in `apps/game-server/src/core/json-db/CrashRecoveryService.ts`
- [ ] T017 [P] [US1] Implement `LocalBackupService` enforcing `BackupManifest.backupId`, `BackupManifest.reason`, `BackupManifest.fileCount`, `BackupManifest.totalBytes`, `BackupManifest.rootChecksumSha256`, and `BackupManifest.createdAt` per `data-model.md` (6h rotation: keep 4 recent + 7 daily) in `apps/game-server/src/core/json-db/LocalBackupService.ts`
- [ ] T018 [US1] Assemble `JsonDatabaseEngine` implementing `contracts/json-db-and-health-contract.md` and `StaggeredDirtyFlusher` (30s staggered window, max 4 concurrent flushes) in `apps/game-server/src/core/json-db/JsonDatabaseEngine.ts` and `apps/game-server/src/core/json-db/StaggeredDirtyFlusher.ts`
- [ ] T019 [US1] Add unit and crash-recovery/concurrency integration tests (`TS-DB-001`..`TS-DB-005`) in `apps/game-server/tests/json-db/json-database-engine.spec.ts`

**Checkpoint**: `JsonDatabaseEngine` passes atomic write, WAL crash recovery, concurrency, and backup tests independently.

---

## Phase 4: User Story 2 - Nạp Danh mục Nội dung Chuẩn từ Nguồn Duy nhất (Priority: P1)

**Goal**: Nạp, kiểm chứng lược đồ và tham chiếu chéo toàn bộ 12 tệp `game-data/*.json` khi khởi động (fail-fast) và cung cấp REST catalog API.

**Independent Test**: Nạp thành công 12 tệp `game-data/*.json` trong `< 2s`, trả `manifestHash` hợp lệ, và từ chối khởi động ngay khi có 1 ID sai hoặc tổng xác suất banner khác `1.0`.

### Implementation for User Story 2

- [ ] T020 [P] [US2] Define Zod schemas for all 12 catalog bundles in `packages/game-config/src/schemas/catalog-schemas.ts`
- [ ] T021 [US2] Implement referential integrity cross-validator across all 12 bundles (skills→characters, recipes→items, loot-tables→monsters/bosses/items, quests→items/mobs, gacha-banners sum=1.0) in `packages/game-config/src/cross-ref-validator.ts`
- [ ] T022 [US2] Implement `GameCatalogLoader` enforcing `CatalogBundle.manifestHash`, `CatalogBundle.loadedAt`, and `CatalogBundle.files` per `data-model.md` (frozen read-only RAM maps) in `apps/game-server/src/core/config/GameCatalogLoader.ts`
- [ ] T023 [US2] Implement `CatalogController` (`GET /api/v1/catalog/manifest`, `GET /api/v1/catalog/:bundle` with ETag) in `apps/game-server/src/core/config/CatalogController.ts`
- [ ] T024 [US2] Add unit and API tests verifying valid load and fail-fast rejection on broken IDs in `apps/game-server/tests/config/catalog-loader.spec.ts`

**Checkpoint**: 12 catalog JSON bundles load, cross-validate, and serve via REST independently.

---

## Phase 5: User Story 3 - Vòng lặp Mô phỏng 20 Hz & Vỏ Client Pixel-Perfect (Priority: P2)

**Goal**: Dựng khung `SimulationLoop` 20 Hz (không I/O đĩa trong tick), static asset hosting cục bộ, graceful shutdown, health check và vỏ Phaser 3 `640x360` + React/Zustand bridge.

**Independent Test**: Khởi chạy server & client cục bộ, xác nhận `GET /api/v1/health` trả `LOCAL_JSON`, canvas pixel sắc nét ở `1280x720` & `1920x1080`, và `SIGINT` flush sạch dữ liệu dirty.

### Implementation for User Story 3

- [ ] T025 [P] [US3] Implement fixed-timestep `SimulationLoop` (20 Hz `process.hrtime.bigint()`, maxCatchUpTicks=2, tick budget warning > 35 ms, zero disk I/O in tick) in `apps/game-server/src/core/realtime/SimulationLoop.ts`
- [ ] T026 [P] [US3] Implement `HealthController` (`GET /api/v1/health`), local `/assets/` static mount (blocking `/data/`), and `GracefulShutdownHook` (`SIGINT`/`SIGTERM` drain locks + flush dirty) in `apps/game-server/src/core/health/HealthController.ts` and `apps/game-server/src/app.module.ts`
- [ ] T027 [P] [US3] Implement typed `GameUiBridge` and `InputFocusManager` in `apps/client/src/bridge/GameUiBridge.ts` and `apps/client/src/bridge/InputFocusManager.ts`
- [ ] T028 [US3] Implement `PhaserGameFactory` (`640x360`, `pixelArt: true`, `roundPixels: true`, `antialias: false`), `BootScene`, and `WorldStateBuffer` in `apps/client/src/game/PhaserGameFactory.ts` and `apps/client/src/game/state/WorldStateBuffer.ts`
- [ ] T029 [US3] Implement minimal React shell, `useSystemStore`, `HttpClient` catalog sync, and reconnecting overlay banner in `apps/client/src/app/App.tsx` and `apps/client/src/stores/useSystemStore.ts`
- [ ] T030 [US3] Add integration test for graceful shutdown flush and Playwright visual smoke test for `640x360` crisp pixel scaling in `apps/client/tests/pixel-shell.spec.ts`

**Checkpoint**: Full foundation vertical slice operational with zero external DB/cloud dependencies.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T031 [P] Add structured local JSON file logger (`logs/server-YYYY-MM-DD.jsonl` with 14-day rotation) in `apps/game-server/src/core/logging/LocalJsonLogger.ts`
- [ ] T032 [P] Add localhost-only `/internal/metrics` exporter (`sim_tick_duration_ms`, `json_db_write_latency_ms`, `wal_pending_count`) in `apps/game-server/src/core/health/MetricsController.ts`
- [ ] T033 Run full `quickstart.md` validation suite and verify zero third-party network calls or external DB dependencies in `package.json`

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → blocks User Stories 1, 2, 3.
- **US1 (`JsonDatabaseEngine`)** and **US2 (`GameCatalogLoader`)** can proceed in parallel after Phase 2.
- **US3 (`SimulationLoop` + Phaser/React Shell)** depends on Phase 2 and integrates with US1 (`StaggeredDirtyFlusher`, `GracefulShutdownHook`) and US2 (`CatalogController`).
- **MVP First**: Complete Phases 1–3 (`US1`) and Phase 4 (`US2`) first as the immutable core required by features `002` through `012`.
