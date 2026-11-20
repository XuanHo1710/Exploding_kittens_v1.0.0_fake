# Tasks: 10-Slot Equipment, Set Bonuses, Durability & Deterministic +0 to +10 Weapon Enhancement

**Input**: Design documents from `/specs/007-equipment-enhancement/`

**Prerequisites**: `001-foundation-game-engine`, `002-auth-character`, `004-combat-skills`, `005-inventory-loot`, `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/equipment-enhancement-contract.md`, `quickstart.md`

**Tests**: Bao gồm kiểm thử đối chiếu bảng CSV, kiểm thử 10 ô & 6 bộ set, kiểm thử `+0 → +10` chắc chắn, cổng `bld_blacksmith` Lv 1–4, spam đồng thời và WAL crash recovery (`TS-ENH-001..004`, `SEC-005..008`).

## Phase 1: Setup (Shared Config Loader, Math & DTOs)

**Purpose**: Nạp bảng cường hóa 10 cấp từ nguồn chuẩn duy nhất và định nghĩa toán học tính bộ set, chỉ số cường hóa và Zod DTO.

- [ ] T001 Define strict REST DTOs for equip, unequip, upgrade, repair, dismantle, and roadmap socketing in `packages/shared/src/contracts/equipment-enhancement.dto.ts`
- [ ] T002 [P] Implement `EnhancementTiersConfig` loading and validating all 10 tiers against `docs/balancing/weapon-upgrade-costs.csv` and `game-data/items.json` enforcing `EnhancementTierRule.fromLevel`, `EnhancementTierRule.toLevel`, `EnhancementTierRule.blacksmithLevelReq`, `EnhancementTierRule.successRateMvp` (`=== 1.00`), `EnhancementTierRule.breakRiskMvp` (`=== false`), `EnhancementTierRule.downgradeRiskMvp` (`=== false`), `EnhancementTierRule.atkBonusPctCumulative`, `EnhancementTierRule.bonusFlatAtkBase`, `EnhancementTierRule.milestonePerk`, `EnhancementTierRule.goldCost`, and `EnhancementTierRule.requiredMaterials` per `data-model.md` in `packages/game-config/src/enhancement-tiers.config.ts`
- [ ] T003 [P] Implement `SetBonusCalculator` evaluating all 6 sets (`set_greenhaven_novice`..`set_abyssal_sovereign`) and `WORN` (`50%` base stats at `0` durability) enforcing `ActiveSetBonusState.setId`, `ActiveSetBonusState.equippedPieceCount`, `ActiveSetBonusState.twoPieceActive`, and `ActiveSetBonusState.fourPieceActive` per `data-model.md` in `packages/shared/src/equipment/set-bonus-calculator.ts`
- [ ] T004 [P] Implement `WeaponEnhancementMath` calculating `WeaponATK(e) = floor(BaseATK * (1 + EnhPct) + EnhFlat)` and applying `+5` (`+3% CritRate`) and `+10` (`+8% Boss Poise`, `+5% Skill Scaling`) milestone perks in `packages/shared/src/equipment/weapon-enhancement-math.ts`

---

## Phase 2: Foundational (Upgrade History Repository & Loadout Validators)

**Purpose**: Dựng kho lưu lịch sử cường hóa JSON cục bộ và bộ xác thực 10 ô trang bị chuẩn.

- [ ] T005 Implement `UpgradeHistoryRepository` managing append-only `data/db/history/upgrade-history-<charId>.json` enforcing `UpgradeHistoryRecord.upgradeId`, `UpgradeHistoryRecord.idempotencyKey`, `UpgradeHistoryRecord.characterId`, `UpgradeHistoryRecord.itemInstanceId`, `UpgradeHistoryRecord.itemId`, `UpgradeHistoryRecord.fromLevel`, `UpgradeHistoryRecord.toLevel`, `UpgradeHistoryRecord.goldSpent`, `UpgradeHistoryRecord.materialsConsumed`, `UpgradeHistoryRecord.blacksmithLevel`, `UpgradeHistoryRecord.result`, and `UpgradeHistoryRecord.createdAt` per `data-model.md` in `apps/game-server/src/modules/enhancement/upgrade-history.repository.ts`
- [ ] T006 [P] Implement `EquipmentLoadoutValidator` enforcing ownership, `levelReq`, `allowedClasses`, two-handed `OFF_HAND` rule, unique `instanceId` across all 10 slots (`EquipmentLoadout.MAIN_HAND`, `EquipmentLoadout.OFF_HAND`, `EquipmentLoadout.HELMET`, `EquipmentLoadout.CHEST_ARMOR`, `EquipmentLoadout.GLOVES`, `EquipmentLoadout.BOOTS`, `EquipmentLoadout.RING_1`, `EquipmentLoadout.RING_2`, `EquipmentLoadout.NECKLACE`, `EquipmentLoadout.ACCESSORY`) per `data-model.md` in `apps/game-server/src/modules/equipment/equipment-loadout.validator.ts`

**Checkpoint**: Canonical enhancement config, 6-set calculator, 10-slot validator, and local JSON upgrade history repository ready.

---

## Phase 3: User Story 1 - Trang bị 10 Ô, Kích hoạt 6 Bộ Set & Tính lại Sức mạnh Chiến đấu (Priority: P1) 🎯 MVP

**Goal**: Cho phép mặc/tháo an toàn trên toàn bộ 10 ô trang bị, kích hoạt 2-pc & 4-pc cho 6 bộ set, tương thích đổi Hero và cập nhật nóng `DerivedCombatStats` + `combatRating`.

**Independent Test**: Mặc đủ 10 ô & 4 món `set_mossroot_guard`, kiểm tra thưởng 2-pc/4-pc, từ chối sai class/cấp/nhẫn trùng/túi đầy, và đồng bộ `EquipmentChanged`.

### Implementation for User Story 1

- [ ] T007 [US1] Implement `EquipmentService` (`equip`, `unequip`, automatic `OFF_HAND` unequip for two-handed weapons, active-hero weapon compatibility check, full-bag guard, immediate `StatCalculator` + `combatRating` recompute, `EquipmentChanged` event) inside `["character:<id>", "inventory:<id>"]` WAL transaction in `apps/game-server/src/modules/equipment/equipment.service.ts`
- [ ] T008 [US1] Implement `EquipmentController` (`POST /equipment/equip`, `POST /equipment/unequip`) with `OwnershipGuard` and `X-Idempotency-Key` in `apps/game-server/src/modules/equipment/equipment.controller.ts`
- [ ] T009 [P] [US1] Implement `EquipmentModal` displaying 10-slot paperdoll, 2-pc/4-pc active set highlights, durability meters, and stat diff tooltips in `apps/client/src/ui/modals/EquipmentModal.tsx`
- [ ] T010 [US1] Add unit & e2e tests verifying 10-slot equip/unequip, all 6 sets 2-pc/4-pc calculation, two-handed rule, ring deduplication, and full-bag refusal (`SEC-005`) in `apps/game-server/tests/equipment/equipment-loadout.e2e-spec.ts`

**Checkpoint**: 10-slot equipment and 6-set bonus engine verified independently.

---

## Phase 4: User Story 2 - Cường hóa Vũ khí Chắc chắn `100%` Từ `+0` Đến `+10` Gắn Cấp Lò Rèn (Priority: P1) 🎯 MVP

**Goal**: Thực thi cường hóa chắc chắn `100%` `+0 → +10` (trần cứng `+10`, không vỡ, không tụt) khóa theo `bld_blacksmith` Lv 1–4, hỗ trợ tự rút nguyên liệu rương (`bld_storage >= Lv 2`), đặc quyền `+5`/`+10` và cam kết 4 tệp JSON WAL nguyên tử.

**Independent Test**: Pass `TS-ENH-001`, `TS-ENH-002`, `TS-ENH-003`, `TS-ENH-004`, `SEC-006`, `SEC-007`, `SEC-008` kèm WAL crash recovery giữa giao dịch 4 tệp.

### Implementation for User Story 2

- [ ] T011 [US2] Implement `EnhancementService` enforcing deterministic `100%` `+0 -> +10` progression, hard cap `+10` (`ERR_MAX_ENHANCEMENT_REACHED`), `bld_blacksmith` Lv 1..4 gate (`ERR_BLACKSMITH_LEVEL_REQUIRED`), `bld_storage >= Lv 2` `autoCraftPull`, `+5`/`+10` milestone activation, and single sorted-lock (`character`, `house`, `inventory`, `ledger`) 4-file WAL commit (`characters`, `inventories`, `upgrade-history`, `currency-ledger`) in `apps/game-server/src/modules/enhancement/enhancement.service.ts`
- [ ] T012 [US2] Implement `EnhancementController` (`POST /api/v1/characters/:charId/enhancement/upgrade`, `GET /api/v1/characters/:charId/enhancement/history`) with `OwnershipGuard`, `X-Idempotency-Key`, and `WeaponEnhanced` internal event in `apps/game-server/src/modules/enhancement/enhancement.controller.ts`
- [ ] T013 [P] [US2] Implement `BlacksmithEnhanceModal` (before/after `WeaponATK` preview, 100% deterministic indicator, material checklist from bag+storage, `+5`/`+10` milestone badges) and Phaser `WeaponAuraOverlay` (`Weapon Glow I` & `Radiant Aura II`) in `apps/client/src/ui/modals/BlacksmithEnhanceModal.tsx` and `apps/client/src/game/systems/WeaponAuraOverlay.ts`
- [ ] T014 [US2] Add e2e, concurrency, and WAL crash-recovery tests (`TS-ENH-001..004`, `SEC-007`, `SEC-008`) verifying `+0 -> +10`, `26,400 GOLD` total reconciliation, Blacksmith gates, `+10` cap rejection, and 10 concurrent upgrade requests in `apps/game-server/tests/enhancement/weapon-enhancement.e2e-spec.ts`

**Checkpoint**: Deterministic `+0..+10` weapon enhancement passes all integrity, gate, and WAL crash tests independently.

---

## Phase 5: User Story 3 - Độ bền, Sửa chữa, Tách Trang bị & Lộ trình Khảm ngọc (Priority: P2)

**Goal**: Hoàn thiện vòng đời hao mòn độ bền (`WORN` `50%` ở `0` không vỡ đồ), sửa bằng `csm_repair_kit` hoặc `GOLD` có chiết khấu Lò Rèn, tách trang bị thừa và giao diện mở rộng khảm ngọc M2+.

**Independent Test**: Kiểm thử `durability = 0` (`WORN`), sửa `+50%` bằng kit, sửa `100%` bằng Gold giảm `0%/10%/20%/30%`, tách đồ không mặc (chặn đồ đang mặc) và trả mã lộ trình cho socket M2+.

### Implementation for User Story 3

- [ ] T015 [US3] Implement `DurabilityRepairService` handling combat/death durability decay (`-10%` on death, floor `0`, never destroys item), `WORN` stat trigger, and `POST /equipment/repair` enforcing `DurabilityRepairRecord.itemInstanceId`, `DurabilityRepairRecord.durabilityBefore`, `DurabilityRepairRecord.durabilityAfter`, `DurabilityRepairRecord.repairMethod` (`GOLD_BLACKSMITH` / `REPAIR_KIT`), and `DurabilityRepairRecord.discountPctApplied` (`0 | 10 | 20 | 30`) per `data-model.md` with atomic `CurrencyLedger` write in `apps/game-server/src/modules/equipment/durability-repair.service.ts`
- [ ] T016 [P] [US3] Implement `DismantleService` (`POST /equipment/dismantle` returning `30%-50%` salvage materials, blocking equipped items, enforcing `confirmHighValue: true` for `>= +1` or `RARE+`, checking bag capacity) and `SocketingRoadmapService` (`POST /equipment/socket` returning `ERR_FEATURE_LOCKED_ROADMAP` while preserving `ItemInstance.sockets`) in `apps/game-server/src/modules/equipment/dismantle.service.ts` and `apps/game-server/src/modules/equipment/socketing.roadmap.service.ts`
- [ ] T017 [US3] Add integration tests verifying `WORN` non-destructive durability, `csm_repair_kit` vs `bld_blacksmith` Lv 1–4 discounts, dismantle safeguards, and M2 socketing hook in `apps/game-server/tests/equipment/durability-dismantle.spec.ts`

**Checkpoint**: Durability, repair, dismantling, and M2 socketing extensibility verified independently.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T018 [P] Add automated parity test asserting `packages/game-config/src/enhancement-tiers.config.ts` matches `docs/balancing/weapon-upgrade-costs.csv` cell-for-cell across all 10 tiers in `packages/game-config/tests/enhancement-csv-parity.spec.ts`
- [ ] T019 Run full `quickstart.md` validation scenarios verifying zero breakage, `+10` hard cap, 4-file WAL consistency, and full `UpgradeHistory` ↔ `CurrencyLedger` parity

---

## Dependencies & Execution Order

- **Phase 1 (Config & Shared Math)** → **Phase 2 (History Repo & 10-Slot Validator)** → blocks User Stories 1, 2, 3.
- **US1 (`EquipmentService`)**, **US2 (`EnhancementService`)**, and **US3 (`DurabilityRepairService`/`DismantleService`)** can proceed in parallel after Phase 2, converging on `StatCalculator` (`004`) and `InventoryService`/`EconomyService` (`005`).
- **MVP First**: Phases 1–4 deliver full 10-slot equipment, 6-set bonuses, and deterministic `+0..+10` weapon enhancement required by `dng_mossroot_hollow` progression.
