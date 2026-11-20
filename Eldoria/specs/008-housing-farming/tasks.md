# Tasks: Survival, Farming, Animal Husbandry & Homestead Building System

**Input**: Design documents from `/specs/008-housing-farming/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/housing-farming-contract.md`, `quickstart.md`

**Tests**: Bao gồm các kiểm thử tự động trọng yếu (24h offline catch-up, clock tampering, 7-layer + BFS placement, non-lethal starvation, party permissions, concurrency & WAL recovery).

## Phase 1: Setup (Shared Contracts & Homestead Catalog Schemas)

**Purpose**: Định nghĩa hợp đồng REST/WebSocket dùng chung và Zod schema nạp chuẩn `crops.json`, `animals.json`, `buildings.json`.

- [ ] T001 Define shared REST/WebSocket DTOs, error codes, and `GameUiBridge` events for survival, farming, animals, and buildings in `packages/shared/src/contracts/housing-farming-contracts.ts`
- [ ] T002 [P] Implement Zod schemas validating `game-data/crops.json` (15/5 MVP), `game-data/animals.json` (6/2 MVP), and `game-data/buildings.json` (13/6 MVP) in `packages/game-config/src/schemas/homestead-catalog.schema.ts`

---

## Phase 2: Foundational (Persistent JSON Schemas, World Clock, Repository & Permission Guard)

**Purpose**: Hạ tầng lưu trữ JSON cục bộ cho lãnh địa (`houses/<charId>.json`), đồng hồ thế giới (`world-clock.json`), phân quyền và động cơ mô phỏng offline 24h bắt buộc trước mọi User Story.

- [ ] T003 [P] Implement `WorldClockState` schema enforcing `WorldClockState.epochStartMs`, `WorldClockState.currentDay`, `WorldClockState.currentSeason`, `WorldClockState.dayPhase`, `WorldClockState.minuteOfDay`, and `WorldClockState.weatherHistory24h` per `data-model.md` in `apps/game-server/src/modules/world/schemas/world-clock.schema.ts`
- [ ] T004 [P] Implement `SurvivalState` schema enforcing `SurvivalState.hunger`, `SurvivalState.hungerState`, `SurvivalState.stamina`, `SurvivalState.maxStamina`, `SurvivalState.farmingLevel`, `SurvivalState.farmingExp`, `SurvivalState.activeFoodBuffs`, and `SurvivalState.lastFoodConsumedAt` per `data-model.md` in `apps/game-server/src/modules/character/schemas/survival-state.schema.ts`
- [ ] T005 [P] Implement `HomesteadAggregate`, `BuildingInstance`, `CropPlotTile`, and `AnimalInstance` schemas enforcing `HomesteadAggregate.houseId`, `HomesteadAggregate.ownerCharacterId`, `HomesteadAggregate.regionId`, `HomesteadAggregate.zoneId`, `HomesteadAggregate.gridWidth`, `HomesteadAggregate.gridHeight`, `HomesteadAggregate.buildings`, `HomesteadAggregate.farmPlots`, `HomesteadAggregate.animals`, `BuildingInstance.buildingInstanceId`, `BuildingInstance.buildingId`, `BuildingInstance.level`, `BuildingInstance.originTileX`, `BuildingInstance.originTileY`, `BuildingInstance.rotation`, `BuildingInstance.status`, `BuildingInstance.permissionMode`, `BuildingInstance.assetVariantKey`, `BuildingInstance.constructionStartedAt`, `BuildingInstance.completesAt`, `CropPlotTile.plotId`, `CropPlotTile.buildingInstanceId`, `CropPlotTile.tileX`, `CropPlotTile.tileY`, `CropPlotTile.state`, `CropPlotTile.cropId`, `CropPlotTile.stage`, `CropPlotTile.growthProgressMinutes`, `CropPlotTile.wateredUntil`, `CropPlotTile.fertilizerType`, `CropPlotTile.regrowCount`, `CropPlotTile.lastSimulatedAt`, `AnimalInstance.animalInstanceId`, `AnimalInstance.animalId`, `AnimalInstance.buildingInstanceId`, `AnimalInstance.nickname`, `AnimalInstance.growthStage`, `AnimalInstance.ageHours`, `AnimalInstance.happiness`, `AnimalInstance.hunger`, `AnimalInstance.health`, `AnimalInstance.productionProgressMinutes`, `AnimalInstance.pendingProduce`, `AnimalInstance.lastPettedGameDay`, and `AnimalInstance.lastSimulatedAt` per `data-model.md` in `apps/game-server/src/modules/building/schemas/homestead.schema.ts`
- [ ] T006 Implement `WorldClockService` managing the 24-minute in-game day, 14-day seasons, deterministic per-region weather generation, `data/db/world/world-clock.json` persistence, and `WORLD_CLOCK_SYNC` broadcast in `apps/game-server/src/modules/world/WorldClockService.ts`
- [ ] T007 [P] Implement `HomesteadRepository` wrapping `JsonDatabaseEngine` reads/writes for `data/db/houses/<characterId>.json` and `HomesteadPermissionGuard` enforcing `OWNER_ONLY` vs `PARTY_ACCESS` (and audit logging forbidden access) in `apps/game-server/src/modules/building/HomesteadRepository.ts` and `apps/game-server/src/modules/building/HomesteadPermissionGuard.ts`
- [ ] T008 Implement `OfflineHomesteadSimulator` performing 100% server-timestamp lazy catch-up strictly capped at `24 hours` (`86,400,000 ms`) across construction timers, weather-segmented crop growth/auto-irrigation/auto-harvest, and 15-minute stepped animal hunger/health-floor-20/auto-feeder/auto-collector simulation in `apps/game-server/src/modules/building/OfflineHomesteadSimulator.ts`

**Checkpoint**: World clock, JSON homestead schemas, strict permissions, and 24-hour server-clock offline simulator ready.

---

## Phase 3: User Story 1 - Sinh tồn Ấm áp & Canh tác Nông trại 15 Giống Cây Chuẩn Đồng hồ Máy chủ (Priority: P1) 🎯 MVP

**Goal**: Cung cấp hệ thống sinh tồn (`Hunger 0..100`, Stamina, `2` kênh Food Buff) và đầy đủ 6 thao tác nông trại cho 15 giống cây (`5` MVP) kèm phẩm chất `NORMAL`/`SILVER`/`GOLD` và tự động hóa Lv 3–4.

**Independent Test**: Kiểm thử độc lập vòng đời `TILL → PLANT → WATER → FERTILIZE → HARVEST` trên 5 cây MVP, ghi đè 2 kênh Food Buff, chống chỉnh đồng hồ máy khách (`TS-FRM-002`) và đổi mùa héo/nhà kính Lv 4.

### Implementation for User Story 1

- [ ] T009 [P] [US1] Implement `SurvivalService` handling online hunger decay, offline freeze, non-lethal `EXHAUSTED` (`maxStamina = 60%`), `POST /survival/consume` with 2-channel (`FOOD_COMBAT`/`FOOD_UTILITY`) Food Buff override, kitchen Lv 2/3 & `SILVER`/`GOLD` scaling, and consumption cooldown in `apps/game-server/src/modules/character/SurvivalService.ts`
- [ ] T010 [US1] Implement `FarmingService` executing `TILL`, `PLANT`, `WATER` (with `PARTY_ACCESS` helper support & rain/already-watered guards), `FERTILIZE`, `HARVEST` (quality formula + regrow + atomic full-bag precheck), `CLEAR`, and `autoIrrigation`/`autoHarvest` toggles inside sorted WAL locks in `apps/game-server/src/modules/farming/FarmingService.ts`
- [ ] T011 [US1] Implement `FarmingController` (`POST /api/v1/characters/:charId/farming/action`, `PATCH /api/v1/characters/:charId/farming/:bldInstId/automation`) and `FarmingModule` wiring in `apps/game-server/src/modules/farming/FarmingController.ts` and `apps/game-server/src/modules/farming/farming.module.ts`
- [ ] T012 [P] [US1] Implement `SurvivalClockHud` (Hunger bar, 2 Food Buff countdown icons, Day/Season/Weather HUD) and `FarmManageModal` in `apps/client/src/ui/hud/SurvivalClockHud.tsx` and `apps/client/src/ui/modals/FarmManageModal.tsx`
- [ ] T013 [US1] Add unit & integration tests covering 5 MVP crops + 10 post-MVP crops, 2-channel Food Buff override, client clock tampering rejection (`TS-FRM-002`), 24h offline cap, seasonal withering vs Lv 4 greenhouse, and party watering permissions in `apps/game-server/tests/farming/farming-offline.spec.ts`

**Checkpoint**: Survival & 15-crop server-timestamp farming vertical slice independently operational.

---

## Phase 4: User Story 2 - Xây dựng & Nâng cấp 13 Công trình Lãnh địa An toàn Theo Lưới (Priority: P1) 🎯 MVP

**Goal**: Cung cấp Building Placement System (`32x32` snapping, Ghost Preview, xoay hướng, kiểm định 7 lớp + BFS Reachability) và vòng đời nâng cấp đầy đủ 13 công trình (`6` MVP gồm `bld_blacksmith` Lv 1..4) qua JSON WAL nguyên tử.

**Independent Test**: Kiểm thử đặt, xoay, di dời, nâng cấp và hủy/phá dỡ các công trình MVP; chứng minh 100% trường hợp đè đường đi/spawn/quest hoặc cô lập `interactionPoints` bị chặn bởi BFS và `bld_blacksmith` Lv 1..4 lưu bền vững đúng cấp.

### Implementation for User Story 2

- [ ] T014 [P] [US2] Implement `BuildingPlacementValidator` loading Tiled `no_build_mask`/`mandatory_road_tiles`/`spawn_points`/`quest_corridor_mask` and executing the 7-layer validation pipeline including `32×24` `Uint8Array` BFS flood-fill reachability to every `interactionPoints` tile in `apps/game-server/src/modules/building/BuildingPlacementValidator.ts`
- [ ] T015 [US2] Implement `BuildingService` (`getHomesteadWithCatchUp`, `placeBuilding`, `upgradeBuilding`, `moveBuilding` with occupied-entity safe push, `cancelOrDemolishBuilding` enforcing 80%/50% refunds & `bld_player_house` protection, `setPermission`) with `bld_storage` Lv 2+ `autoCraftPull` and sorted WAL commits + `CurrencyLedger` in `apps/game-server/src/modules/building/BuildingService.ts`
- [ ] T016 [US2] Implement `HomesteadController` (`GET /homestead`, `POST /buildings/place`, `POST /buildings/:bldInstId/upgrade`, `POST /buildings/:bldInstId/move`, `PATCH /buildings/:bldInstId/permission`, `DELETE /buildings/:bldInstId`, `POST /survival/consume`) and `BuildingModule` in `apps/game-server/src/modules/building/HomesteadController.ts` and `apps/game-server/src/modules/building/building.module.ts`
- [ ] T017 [P] [US2] Implement Phaser 3 `BuildingGhostSystem` (`32x32` snapping, `R` key rotation, green/red tile pre-check, interaction point arrows) and `HomesteadRenderSystem` (Y-sorted `assetVariantKey` buildings, construction scaffolds, crop stages, diegetic animal bubbles) in `apps/client/src/game/systems/BuildingGhostSystem.ts` and `apps/client/src/game/systems/HomesteadRenderSystem.ts`
- [ ] T018 [P] [US2] Implement `useHomesteadStore` and `BuildingModal` (6 building categories, level comparison highlighting `bld_blacksmith` `+3/+6/+8/+10` gates, permission toggles) in `apps/client/src/stores/useHomesteadStore.ts` and `apps/client/src/ui/modals/BuildingModal.tsx`
- [ ] T019 [US2] Add unit, BFS reachability, concurrency (5 parallel place requests), `OWNER_ONLY` vs `PARTY_ACCESS` authZ, and WAL crash recovery tests (`TS-FRM-004`, `TS-BLD-01`..`06`) in `apps/game-server/tests/building/building-placement-bfs.spec.ts`

**Checkpoint**: 13-building homestead system with 7-layer + BFS safety and `bld_blacksmith` progression gates complete.

---

## Phase 5: User Story 3 - Chăn nuôi 6 Loài Động vật & Mô phỏng Ngoại tuyến Nhân văn (Priority: P2)

**Goal**: Triển khai hệ thống chăn nuôi 6 loài (`2` MVP: `anm_meadow_chicken`, `anm_clover_cow` tại `bld_farm_plot` Lv 2 / `bld_barn`) với chăm sóc, di dời chuồng, sàn sức khỏe `>= 20` không chết vĩnh viễn và tự động cho ăn/gom hàng.

**Independent Test**: Kiểm thử mua, nuôi lớn `BABY → ADULT`, đẩy `Happiness >= 80` kiểm chứng phân phối phẩm chất, bỏ đói `72 giờ` offline xác nhận `health === 20` (không chết), và race test mua vượt sức chứa chuồng (`TS-ANM-04`).

### Implementation for User Story 3

- [ ] T020 [US3] Implement `AnimalService` handling `BUY` (capacity check for `bld_chicken_coop`, `bld_farm_plot` Lv 2+, `bld_barn`), `FEED` (reject when `hunger >= 90`), `PET` (1 reward per in-game day), `COLLECT` (atomic full-bag precheck & happiness-based quality roll), `HEAL`, `RENAME`, `REASSIGN` (free move from `bld_farm_plot` to `bld_barn`), and `SELL` inside sorted WAL locks in `apps/game-server/src/modules/animal/AnimalService.ts`
- [ ] T021 [US3] Implement `AnimalController` (`POST /api/v1/characters/:charId/animals/action`) and `AnimalModule` wiring in `apps/game-server/src/modules/animal/AnimalController.ts` and `apps/game-server/src/modules/animal/animal.module.ts`
- [ ] T022 [P] [US3] Implement `AnimalCoopModal` displaying animal stats (`Hunger`/`Happiness`/`Health`), `BABY → ADULT` progress, `Collect All` / `Feed All`, `Reassign` action, and `autoFeeder`/`autoCollector` toggles in `apps/client/src/ui/modals/AnimalCoopModal.tsx`
- [ ] T023 [US3] Add unit, quality-distribution simulation, 72h starvation safety (`health === 20`), concurrent slot-cap (`TS-ANM-04`), auto-feeder/collector, and party anti-exploit tests (`TS-ANM-01`..`06`) in `apps/game-server/tests/animal/animal-husbandry.spec.ts`
- [ ] T024 [P] [US3] Add Vitest UI tests for `BuildingGhostSystem` snapping/rotation and homestead modal state transitions in `apps/client/tests/homestead-ghost.spec.ts`

**Checkpoint**: Full survival + farming + animal husbandry + homestead building vertical slice complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T025 Emit `BuildingCompleted`, `BuildingUpgraded`, `CropHarvested`, and `AnimalProductCollected` on `InternalEventBus` and expose `getBlacksmithLevel(charId)` & `getStorageAutoPullStatus(charId)` helpers for `006-gathering-crafting` and `007-equipment-enhancement` in `apps/game-server/src/modules/building/BuildingService.ts`
- [ ] T026 Run `quickstart.md` validation scenarios confirming 100% alignment with `crops.json`, `animals.json`, `buildings.json`, zero client-clock trust, and zero external DB/third-party dependencies

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → blocks User Stories 1, 2, 3.
- **US1 (Survival & Farming)** and **US2 (Homestead Buildings)** can execute in parallel after Phase 2, syncing on `bld_farm_plot` capacity & `bld_storage` auto-pull hooks.
- **US3 (Animal Husbandry)** builds directly on `HomesteadRepository`, `OfflineHomesteadSimulator`, and `bld_chicken_coop`/`bld_farm_plot` Lv 2/`bld_barn` from Phase 2 & US2.
- **MVP First**: Complete Phases 1–4 (`US1` + `US2`) to unlock survival, 5 MVP crops, and 6 MVP buildings (including `bld_blacksmith` Lv 1..4), then complete Phase 5 (`US3`) for MVP chicken/cow husbandry.
