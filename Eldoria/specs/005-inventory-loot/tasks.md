# Tasks: Authoritative Inventory, Ground Loot & Atomic Currency Ledger

**Input**: Design documents from `/specs/005-inventory-loot/`

**Prerequisites**: `001-foundation-game-engine`, `002-auth-character`, `003-world-movement`, `004-combat-skills`, `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/inventory-loot-contract.md`, `quickstart.md`

**Tests**: Bao gồm kiểm thử đơn vị bất biến bảo toàn, kiểm thử đồng thời chống nhân bản/double-spending, chống cướp đồ và WAL crash recovery (`SEC-005`, `SEC-006`, `SEC-007`, `SEC-008`, `SEC-011`).

## Phase 1: Setup (Shared Identifiers, DTOs & Invariants)

**Purpose**: Tạo bộ sinh `UUIDv7` nội bộ không phụ thuộc dịch vụ ngoài, Zod schema chống số lượng âm và hàm kiểm tra bất biến kho đồ dùng chung.

- [ ] T001 Implement monotonic CSPRNG `UUIDv7` generator (zero third-party deps) in `packages/shared/src/utils/uuidv7.ts`
- [ ] T002 [P] Define strict REST & WebSocket DTO schemas (rejecting `quantity <= 0` and invalid slots) in `packages/shared/src/contracts/inventory-loot.dto.ts`
- [ ] T003 [P] Implement `assertInventoryInvariants` verifying unique `ItemInstance.instanceId`, unique `ItemInstance.slotIndex`, strict `ItemInstance.ownerCharacterId`, and `1..maxStack` quantity conservation in `packages/shared/src/inventory/inventory-invariants.ts`

---

## Phase 2: Foundational (Repositories for Sharded Inventory & Monthly Currency Ledger)

**Purpose**: Xây dựng lớp truy cập dữ liệu JSON cục bộ cho kho đồ phân mảnh và sổ cái tiền tệ theo tháng trước khi triển khai các User Story.

- [ ] T004 Implement `InventoryRepository` reading/writing `data/db/inventories/<charId>.json` enforcing `InventoryAggregate.characterId`, `InventoryAggregate.bagCapacity` (`40..120`), `InventoryAggregate.storageCapacity` (`0..200`), `InventoryAggregate.bagItems`, and `InventoryAggregate.storageItems` per `data-model.md` in `apps/game-server/src/modules/inventory/inventory.repository.ts`
- [ ] T005 [P] Implement `ItemInstanceFactory` enforcing `ItemInstance.instanceId`, `ItemInstance.itemId`, `ItemInstance.ownerCharacterId`, `ItemInstance.quantity`, `ItemInstance.slotIndex`, `ItemInstance.enhancementLevel`, `ItemInstance.durability`, `ItemInstance.bonusRolls`, `ItemInstance.sockets`, `ItemInstance.quality`, `ItemInstance.bound`, and `ItemInstance.acquiredAt` per `data-model.md` in `apps/game-server/src/modules/inventory/item-instance.factory.ts`
- [ ] T006 [P] Implement `CurrencyLedgerRepository` managing append-only `data/db/ledgers/currency-ledger-<YYYY-MM>.json` enforcing `CurrencyLedgerEntry.ledgerEntryId`, `CurrencyLedgerEntry.txId`, `CurrencyLedgerEntry.idempotencyKey`, `CurrencyLedgerEntry.characterId`, `CurrencyLedgerEntry.currencyType`, `CurrencyLedgerEntry.delta`, `CurrencyLedgerEntry.balanceBefore`, `CurrencyLedgerEntry.balanceAfter`, `CurrencyLedgerEntry.reasonCode`, `CurrencyLedgerEntry.metadata`, and `CurrencyLedgerEntry.createdAt` per `data-model.md` in `apps/game-server/src/modules/economy/currency-ledger.repository.ts`

**Checkpoint**: Sharded inventory JSON repository, item instance factory, and monthly append-only ledger repository ready.

---

## Phase 3: User Story 1 - Quản lý Kho đồ Túi/Rương An toàn & Chống Nhân bản Vật phẩm (Priority: P1) 🎯 MVP

**Goal**: Cho phép xem, di chuyển, hoán đổi, gộp/tách chồng, sắp xếp, chuyển túi ↔ rương (tầm `<= 96 px` tới `bld_storage`) và dùng nhanh vật phẩm tiêu hao với khóa tuần tự và bảo toàn `100%` số lượng.

**Independent Test**: Pass `SEC-005` và `SEC-006` (20 lệnh tách/chuyển đồng thời trên 1 `itemInstanceId` → `0` trùng `instanceId`, tổng số lượng bảo toàn `100%`, chặn truy cập chéo tài khoản).

### Implementation for User Story 1

- [ ] T007 [US1] Implement `InventoryService` (`move`, `swap`, `merge`, `split`, `sort`, `bag<->storage` with `<= 96 px` `bld_storage` proximity & ownership checks, `addItemInTx`, `consumeMaterialsInTx`) inside `AsyncLockManager` + `assertInventoryInvariants` in `apps/game-server/src/modules/inventory/inventory.service.ts`
- [ ] T008 [US1] Implement `ConsumableUseService` handling `INVENTORY_QUICK_USE` (`category === "CONSUMABLE"`, `5,000 ms` potion cooldown, max `2` active food buffs, atomic decrement & `idempotencyKey`) in `apps/game-server/src/modules/inventory/consumable-use.service.ts`
- [ ] T009 [US1] Implement `InventoryController` (`GET /inventory`, `POST /inventory/move`, `/split`, `/sort`) with `OwnershipGuard`, `X-Idempotency-Key`, and `INVENTORY_PATCH` WS broadcast in `apps/game-server/src/modules/inventory/inventory.controller.ts`
- [ ] T010 [P] [US1] Implement client `useInventoryStore` (`INVENTORY_PATCH` reconciliation) and `InventoryModal` (Bag/Storage tabs, split/sort/quick-use interactions) in `apps/client/src/stores/useInventoryStore.ts` and `apps/client/src/ui/modals/InventoryModal.tsx`
- [ ] T011 [US1] Add concurrency, anti-duplication, and cross-account IDOR integration tests (`SEC-005`, `SEC-006`) in `apps/game-server/tests/inventory/inventory-integrity.e2e-spec.ts`

**Checkpoint**: Per-character JSON inventory operations pass anti-duplication and IDOR tests independently.

---

## Phase 4: User Story 2 - Rơi Chiến lợi phẩm Công bằng & Nhặt đồ Chống Cướp (Priority: P1)

**Goal**: Quay rơi đồ CSPRNG 4 bước từ `62` bảng rơi đồ chuẩn (`18` MVP), quản lý `GroundLoot` thuần RAM (`120s` TTL, mặc định `PERSONAL_INSTANCED`), kiểm tra tầm `<= 96 px` và chiếm quyền nguyên tử khi nhặt.

**Independent Test**: Pass `SEC-011`: chặn nhặt đồ của người khác (`PERSONAL_INSTANCED`), chặn nhặt ngoài `96 px`, giữ nguyên đồ khi túi đầy, và giải phóng RAM sạch sau `120s` với `0` lượt ghi đĩa khi đồ nằm trên đất.

### Implementation for User Story 2

- [ ] T012 [P] [US2] Implement `LootRollerService` executing CSPRNG 4-step roll order (`goldDrop -> guaranteedEntries -> independentEntries -> exclusivePools`) from `game-data/loot-tables.json` with `+25%` `LUK` drop bonus hard cap in `apps/game-server/src/modules/loot/loot-roller.service.ts`
- [ ] T013 [US2] Implement `GroundLootManager` managing ephemeral RAM drops per `ZoneInstance` enforcing `GroundLoot.lootId`, `GroundLoot.zoneId`, `GroundLoot.x`, `GroundLoot.y`, `GroundLoot.lootKind`, `GroundLoot.itemId`, `GroundLoot.quantity`, `GroundLoot.rarity`, `GroundLoot.eligibleCharacterIds`, `GroundLoot.lootRule` (`PERSONAL_INSTANCED` default), `GroundLoot.expiresAt` (`120s` TTL), and atomic `GroundLoot.claimed` lock + rollback on `ERR_INVENTORY_FULL` per `data-model.md` in `apps/game-server/src/modules/loot/ground-loot.manager.ts`
- [ ] T014 [US2] Implement `LootGateway` handling `LOOT_PICKUP_REQ` (rate limit `6/s`, `<= 96 px` Euclidean check, `eligibleCharacterIds` check, audit violation scoring) and `MonsterKilled`/`BossDefeated` event listener in `apps/game-server/src/modules/loot/loot.gateway.ts`
- [ ] T015 [P] [US2] Implement Phaser `GroundLootPool` rendering rarity-tinted pixel drops (`LOOT_SPAWNED`/`LOOT_REMOVED`) with object pooling in `apps/client/src/game/systems/GroundLootPool.ts`
- [ ] T016 [US2] Add unit & e2e tests verifying 4-step CSPRNG rolls, `PERSONAL_INSTANCED` isolation, `<= 96 px` check, concurrent double-pickup rejection, full-bag preservation, and `120s` TTL expiration (`SEC-011`) in `apps/game-server/tests/loot/ground-loot.e2e-spec.ts`

**Checkpoint**: Server-authoritative RAM ground loot and anti-ninja-loot pickup verified independently.

---

## Phase 5: User Story 3 - Sổ cái 5 Loại Tiền tệ Nguyên tử Bất biến & Giao dịch NPC (Priority: P2)

**Goal**: Cung cấp `EconomyService.applyLedgerDeltaInTx` cho 5 loại tiền tệ (`GOLD`, `STARLIGHT_SHARD`, `CRAFTING_TOKEN`, `BOSS_TOKEN`, `STAR_ESSENCE`), bán vật phẩm cho NPC qua WAL đa tệp và đối soát sổ cái không bao giờ âm.

**Independent Test**: Pass `SEC-007`, `SEC-008`, và WAL crash recovery giữa giao dịch bán đồ/nhặt Gold: `0` số dư âm, `100%` bút toán thỏa `balanceBefore + delta === balanceAfter >= 0`, tổng delta khớp ví hiện tại.

### Implementation for User Story 3

- [ ] T017 [US3] Implement `EconomyService` enforcing non-negative wallet invariants on `CurrencyWallet.gold`, `CurrencyWallet.starlightShard`, `CurrencyWallet.craftingToken`, `CurrencyWallet.bossToken`, and `CurrencyWallet.starEssence` per `data-model.md` alongside atomic `CurrencyLedgerEntry` WAL writes and reconciliation verifier in `apps/game-server/src/modules/economy/economy.service.ts`
- [ ] T018 [US3] Implement NPC sell flow (`POST /api/v1/characters/:charId/shop/sell`, checking `<= 96 px` NPC distance, blocking currently equipped or quest-locked items, committing `character` + `inventory` + `ledger` in 1 sorted-lock WAL) and `GET /api/v1/characters/:charId/economy/ledger` in `apps/game-server/src/modules/economy/economy.controller.ts`
- [ ] T019 [US3] Add concurrent double-spending, idempotency replay, and WAL crash-recovery reconciliation tests (`SEC-007`, `SEC-008`) in `apps/game-server/tests/economy/currency-ledger.e2e-spec.ts`

**Checkpoint**: Atomic 5-currency ledger and NPC sell transactions verified end-to-end.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T020 [P] Add `reconcileAllWalletsFromLedgers()` integrity utility script hook for local admin verification without external database tools in `apps/game-server/src/modules/economy/ledger-reconciliation.util.ts`
- [ ] T021 Run full `quickstart.md` validation scenarios verifying zero duplicate `instanceId`, zero negative balances, and zero disk writes while `GroundLoot` remains unpicked

---

## Dependencies & Execution Order

- **Phase 1 (UUIDv7, DTOs, Invariants)** → **Phase 2 (Repositories)** → blocks User Stories 1, 2, 3.
- **US1 (`InventoryService`)** and **US3 (`EconomyService`)** can develop concurrently after Phase 2; **US2 (`LootService`)** depends on `InventoryService.addItemInTx` and `EconomyService.applyLedgerDeltaInTx` for atomic pickup persistence.
- **Downstream Unblock**: Completing `005-inventory-loot` unlocks shared transaction APIs required by `006-gathering-crafting`, `007-equipment-enhancement`, `008-housing-farming`, `009-gacha-collection`, and `011-dungeon-boss`.
