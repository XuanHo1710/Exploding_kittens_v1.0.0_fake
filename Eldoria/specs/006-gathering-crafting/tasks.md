# Tasks: Resource Gathering & Multi-Station Crafting System

**Input**: Design documents from `/specs/006-gathering-crafting/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/gathering-crafting-contract.md`, `quickstart.md`

**Tests**: Bao gồm các kiểm thử tự động trọng yếu (gathering validation, node race, 36-recipe catalog, atomic WAL crafting, auto-pull storage, cancel refund, concurrency).

## Phase 1: Setup (Shared Contracts & Recipe Catalog Schema)

**Purpose**: Định nghĩa hợp đồng WebSocket/REST dùng chung và schema đọc chuẩn `game-data/recipes.json` (36 công thức, 22 MVP).

- [ ] T001 Define shared WebSocket (`INTERACT_REQ`, `RESOURCE_NODE_UPDATED`) and REST crafting request/response DTOs and error codes in `packages/shared/src/contracts/gathering-crafting-contracts.ts`
- [ ] T002 [P] Implement Zod catalog schema for `game-data/recipes.json` enforcing `CraftingRecipeRef.id`, `CraftingRecipeRef.category`, `CraftingRecipeRef.stationBuildingId`, `CraftingRecipeRef.stationLevelReq`, `CraftingRecipeRef.altStationBuildingIds`, `CraftingRecipeRef.publicStationNpcId`, `CraftingRecipeRef.craftTimeSeconds`, `CraftingRecipeRef.goldCost`, `CraftingRecipeRef.ingredients`, `CraftingRecipeRef.outputItemId`, `CraftingRecipeRef.outputQty`, `CraftingRecipeRef.unlockCondition`, `CraftingRecipeRef.expReward`, and `CraftingRecipeRef.craftingTokenReward` per `data-model.md` in `packages/game-config/src/schemas/recipe-catalog.schema.ts`

---

## Phase 2: Foundational (Persistent Schemas & Station Resolver)

**Purpose**: Lược đồ lưu trữ JSON cục bộ cho điểm tài nguyên, hàng đợi chế tạo và lớp xác thực trạm chế tạo dùng chung cho các User Story.

- [ ] T003 [P] Implement `ResourceNodeState` Zod schema enforcing `ResourceNodeState.nodeId`, `ResourceNodeState.zoneId`, `ResourceNodeState.nodeType`, `ResourceNodeState.tileX`, `ResourceNodeState.tileY`, `ResourceNodeState.requiredToolTier`, `ResourceNodeState.maxCharges`, `ResourceNodeState.remainingCharges`, `ResourceNodeState.respawnSeconds`, `ResourceNodeState.respawnAt`, and `ResourceNodeState.lootTableId` per `data-model.md` in `apps/game-server/src/modules/world/schemas/resource-node.schema.ts`
- [ ] T004 [P] Implement `CraftingJob` Zod schema enforcing `CraftingJob.jobId`, `CraftingJob.idempotencyKey`, `CraftingJob.characterId`, `CraftingJob.recipeId`, `CraftingJob.stationType`, `CraftingJob.stationBuildingInstanceId`, `CraftingJob.batchCount`, `CraftingJob.status`, `CraftingJob.materialsConsumed`, `CraftingJob.goldSpent`, `CraftingJob.startedAt`, and `CraftingJob.completesAt` per `data-model.md` in `apps/game-server/src/modules/crafting/schemas/crafting-job.schema.ts`
- [ ] T005 Implement `StationResolverService` validating `<= 96 px` proximity, `HOMESTEAD_BUILDING` ownership/active status/`stationLevelReq`/`altStationBuildingIds`, and `PUBLIC_NPC` proximity per `contracts/gathering-crafting-contract.md` in `apps/game-server/src/modules/crafting/StationResolverService.ts`

**Checkpoint**: Shared schemas, 36-recipe catalog validation, and station proximity/level verification ready.

---

## Phase 3: User Story 1 - Khai thác Tài nguyên Thế giới Công bằng và Xác thực Máy chủ (Priority: P1) 🎯 MVP

**Goal**: Cho phép khai thác đủ 5 loại điểm tài nguyên (`TREE`, `STONE`, `ORE_VEIN`, `HERB_PATCH`, `FISHING_SPOT`) với kiểm định server-authoritative (`<= 96 px`, tool tier, stamina, charges, bag space), tái sinh theo đồng hồ server và đồng bộ zone.

**Independent Test**: Kiểm thử khai thác cả 5 loại node trong zone MVP, xác nhận trừ Stamina đúng, cập nhật `remainingCharges`/`respawnAt`, chặn out-of-range/low-tool-tier/depleted-node race, và flush dirty xuống `data/db/world/<regionId>.json`.

### Implementation for User Story 1

- [ ] T006 [P] [US1] Implement `ResourceNodeRepository` loading/persisting `zones[].resourceNodes[]` in `data/db/world/<regionId>.json` via `JsonDatabaseEngine` dirty-flag checkpointing (zero disk I/O in 20 Hz tick) in `apps/game-server/src/modules/world/ResourceNodeRepository.ts`
- [ ] T007 [P] [US1] Implement `GatheringTelemetryGuard` tracking `GatheringAttempt.requestId`, `GatheringAttempt.characterId`, `GatheringAttempt.nodeId`, `GatheringAttempt.toolTierUsed`, `GatheringAttempt.staminaSpent`, `GatheringAttempt.distancePx`, and `GatheringAttempt.serverTimestamp` per `data-model.md` and writing `BOT_SUSPICION_GATHERING` events to local `security-audit-*.json` in `apps/game-server/src/modules/world/GatheringTelemetryGuard.ts`
- [ ] T008 [US1] Implement `GatheringService` with per-node contention serialization, server tool-tier lookup, `<= 96 px` check, stamina deduction (`8`/`4`), loot-table roll, atomic inventory grant, interruption handling, and server-clock node respawn sweep in `apps/game-server/src/modules/world/GatheringService.ts`
- [ ] T009 [US1] Implement `GatheringGatewayHandler` handling WebSocket `INTERACT_REQ` (`targetType: "NODE"`), broadcasting `RESOURCE_NODE_UPDATED` via spatial grid, and emitting `MINING`/`WOODCUTTING`/`FISHING` animation states in `apps/game-server/src/modules/world/GatheringGatewayHandler.ts`
- [ ] T010 [P] [US1] Implement Phaser 3 `ResourceNodeRenderSystem` rendering Y-sorted `32x32` pixel nodes, depleted/respawn visuals, `world:node_prompt` HUD cue, and `vfx:gather_hit` particles in `apps/client/src/game/systems/ResourceNodeRenderSystem.ts`
- [ ] T011 [US1] Add unit and concurrency integration tests for 5 node types, last-charge race, tool-tier/range rejection, stamina deduction, and server-clock respawn in `apps/game-server/tests/world/gathering.spec.ts`

**Checkpoint**: World resource gathering vertical slice fully testable and server-authoritative.

---

## Phase 4: User Story 2 - Chế tạo, Luyện kim, Nấu ăn & Giả kim Nguyên tử qua Đa Trạm (Priority: P1) 🎯 MVP

**Goal**: Thực thi toàn bộ 36 công thức (22 MVP) từ `game-data/recipes.json` qua giao dịch đa tệp WAL nguyên tử với `autoCraftPull` từ `bld_storage` Lv 2+, kiểm tra điều kiện mở khóa và ghi `CurrencyLedger`.

**Independent Test**: Chạy kiểm thử chế tạo đơn và theo mẻ (`1..50`) qua `POST /crafting/execute` và `POST /crafting/jobs/:jobId/claim`, kiểm chứng `autoCraftPull`, khóa chống trùng `idempotencyKey`, 50 request đồng thời không double-spend, và sổ cái khớp 100%.

### Implementation for User Story 2

- [ ] T012 [US2] Implement `CraftingService` core execution (`executeCraft`, `claimCraftJob`, `getCraftingState`) with sorted `AsyncLockManager` locks (`character`, `house`, `inventory`, `ledger`), `unlockCondition` validation, bag-then-storage `autoCraftPull` (`bld_storage` Lv `>= 2`), atomic WAL ingredient/Gold deduction, and `CraftingLedgerLink.ledgerEntryId`, `CraftingLedgerLink.txId`, `CraftingLedgerLink.idempotencyKey`, `CraftingLedgerLink.characterId`, `CraftingLedgerLink.currencyType`, `CraftingLedgerLink.delta`, `CraftingLedgerLink.reasonCode`, and `CraftingLedgerLink.recipeId` enforcement per `data-model.md` in `apps/game-server/src/modules/crafting/CraftingService.ts`
- [ ] T013 [US2] Implement `CraftingController` (`GET /api/v1/characters/:charId/crafting/state`, `POST /api/v1/characters/:charId/crafting/execute`, `POST /api/v1/characters/:charId/crafting/jobs/:jobId/claim`) with ownership guard and mandatory `X-Idempotency-Key` header validation in `apps/game-server/src/modules/crafting/CraftingController.ts`
- [ ] T014 [P] [US2] Implement `useCraftingStore` Zustand store synced with REST crafting endpoints and `GameUiBridge` modal triggers in `apps/client/src/stores/useCraftingStore.ts`
- [ ] T015 [US2] Implement `CraftingModal` React component displaying 8 recipe categories, station filter, missing ingredients/unlock reasons, bag+storage totals, batch selector (`1..50`), and atomic submit/claim actions in `apps/client/src/ui/modals/CraftingModal.tsx`

**Checkpoint**: Atomic multi-station crafting MVP operational with zero double-spend risk.

---

## Phase 5: User Story 3 - Hàng đợi Chế tạo Nền, Hiệu suất Trạm Lãnh địa & Hủy An toàn (Priority: P2)

**Goal**: Bổ sung hệ số hiệu suất từng cấp công trình (`bld_furnace`, `bld_kitchen`, `bld_alchemy_lab`, `bld_workshop`), giới hạn hàng đợi theo trạm, tiến trình offline theo đồng hồ server và API hủy mẻ hoàn `80%`.

**Independent Test**: Kiểm thử tốc độ nung `+20%..+50%`, giới hạn `parallelSmeltSlots`/`forgeQueueSlots`, nhận thưởng thành phẩm sau khi reconnect, và hủy lệnh `IN_PROGRESS` hoàn đúng `80%` nguyên liệu + Gold kèm bút toán `CRAFT_CANCEL_REFUND`.

### Implementation for User Story 3

- [ ] T016 [P] [US3] Implement `CraftingBonusCalculator` computing server-side station queue capacity, smelting speed reduction (`20%..50%`), workshop material savings (`5%..15%`), and CSPRNG bonus yield chances (`bld_furnace`, `bld_kitchen`, `bld_alchemy_lab`) from `game-data/buildings.json` in `apps/game-server/src/modules/crafting/CraftingBonusCalculator.ts`
- [ ] T017 [US3] Extend `CraftingService` and `CraftingController` with `cancelCraftJob` (`POST /api/v1/characters/:charId/crafting/jobs/:jobId/cancel`) enforcing `IN_PROGRESS` & `serverNow < completesAt` check, `80%` floor refund to original container/bag, and `CRAFT_CANCEL_REFUND` ledger entry in `apps/game-server/src/modules/crafting/CraftingService.ts` and `apps/game-server/src/modules/crafting/CraftingController.ts`
- [ ] T018 [US3] Wire `CraftingModule` registering `StationResolverService`, `CraftingBonusCalculator`, `CraftingService`, and `CraftingController` into NestJS modular monolith in `apps/game-server/src/modules/crafting/crafting.module.ts`
- [ ] T019 [US3] Add integration, concurrency (50 parallel requests), WAL crash recovery, auto-pull storage, station-bonus, and 80%-cancel-refund tests in `apps/game-server/tests/crafting/crafting-atomic.spec.ts`
- [ ] T020 [P] [US3] Add Vitest UI tests for `CraftingModal` category filtering, batch bounds (`1..50`), countdown display, and disabled states in `apps/client/tests/crafting-modal.spec.ts`

**Checkpoint**: Full gathering + multi-station crafting + queue + bonus + cancel flow complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T021 Emit `ItemCrafted` and `ResourceGathered` internal events on `InternalEventBus` so quest progress (`011` / `quest` module) tracks gathering and crafting objectives cleanly in `apps/game-server/src/modules/crafting/CraftingService.ts` and `apps/game-server/src/modules/world/GatheringService.ts`
- [ ] T022 Run `quickstart.md` validation scenarios and verify 100% alignment against all 36 recipes in `game-data/recipes.json` and zero external DB/third-party dependencies

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → blocks User Stories 1, 2, 3.
- **US1 (World Gathering)** and **US2 (Atomic Crafting Core)** can be developed in parallel once Phase 2 completes.
- **US3 (Station Efficiency, Queues & 80% Cancel Refund)** extends US2's `CraftingService` and `CraftingController`.
- **MVP First**: Complete Phases 1–4 (`US1` + `US2`) to unlock the complete `Gather → Smelt/Cook/Forge` vertical slice, then layer `US3` queue bonuses and cancel handling.
