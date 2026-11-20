# Tasks: Instanced Dungeons, 10-State Monster AI & Multi-Phase Boss Encounters

**Input**: Design documents from `/specs/011-dungeon-boss/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/dungeon-boss-contract.md`, `quickstart.md`

**Tests**: Bao gồm kiểm thử 10-state Monster AI FSM, Budgeted Octile A*, Threat Table, kịch bản `boss_thornback_elder` 3 giai đoạn, chống gian lận đấu trường, phát thưởng WAL tràn túi vào Kho, và mô phỏng headless cho đủ 5 Boss.

## Phase 1: Setup (Shared Contracts & Persistent Schemas)

**Purpose**: Định nghĩa hợp đồng sự kiện Telegraph/Boss/Dungeon và lược đồ Zod cho các bản ghi bền vững trên JSON cục bộ.

- [ ] T001 Define shared WebSocket & REST schemas (`SKILL_TELEGRAPH_EVENT`, `SKILL_TELEGRAPH_CANCELLED`, `BOSS_STATE_EVENT`, `BOSS_REWARD_SUMMARY`, `DUNGEON_LEAVE_REQ`, `ALLY_REVIVE_REQ`, `PILLAR_INTERACT_REQ`, canonical dungeon/boss error codes) in `packages/shared/src/contracts/dungeon-boss-contracts.ts`
- [ ] T002 [P] Implement `EliteRespawnTimerRecord` Zod schema enforcing `EliteRespawnTimerRecord.spawnPointId`, `EliteRespawnTimerRecord.monsterId`, `EliteRespawnTimerRecord.lastKilledAtMs`, and `EliteRespawnTimerRecord.nextRespawnAtMs` per `data-model.md` in `apps/game-server/src/modules/monster-ai/schemas/elite-respawn.schema.ts`
- [ ] T003 [P] Implement `BossRewardLockoutRecord` Zod schema enforcing `BossRewardLockoutRecord.bossId`, `BossRewardLockoutRecord.accountFirstClearClaimed`, `BossRewardLockoutRecord.weeklyResetIsoWeek`, `BossRewardLockoutRecord.weeklyStarlightClaimed`, `BossRewardLockoutRecord.weeklyBossTokensEarned`, and `BossRewardLockoutRecord.instanceCooldownUntilMs` per `data-model.md` in `apps/game-server/src/modules/dungeon-boss/schemas/boss-lockout.schema.ts`

---

## Phase 2: Foundational (Pathfinding, Threat Table & Telegraph Scheduler)

**Purpose**: Hạ tầng lõi A*, Bảng Đe dọa và Bộ lập lịch Telegraph dùng chung cho cả quái thế giới mở và Boss Hầm ngục.

- [ ] T004 [P] Implement `NavGridPathfinder` (compiled `Uint8Array` Tiled collision grid, pooled `BinaryMinHeap` Budgeted Octile A* `<= 120` nodes, `333 ms` repath throttle, LOS bypass, `28 px` separation force, `1.5s`/`3.0s` stuck recovery) in `apps/game-server/src/modules/monster-ai/NavGridPathfinder.ts`
- [ ] T005 [P] Implement `ThreatTableService` supporting all 6 `targetPriority` modes (`NEAREST`, `HIGHEST_THREAT`, `LOWEST_HP`, `RANGED_FIRST`, `HEALER_FIRST`, `LAST_ATTACKER`), Tank `1.6x`, Taunt `3.0x` + `TAUNTED 4s` override, `0` overheal threat, and `+10%`/`+20%` anti-ping-pong hysteresis in `apps/game-server/src/modules/monster-ai/ThreatTableService.ts`
- [ ] T006 Implement `TelegraphScheduler` enforcing `ActiveTelegraphRuntime.telegraphId`, `ActiveTelegraphRuntime.casterId`, `ActiveTelegraphRuntime.hitboxShape`, `ActiveTelegraphRuntime.durationMs`, `ActiveTelegraphRuntime.executesAtMs`, and `ActiveTelegraphRuntime.renderDepthBand` (`"180-199"`) per `data-model.md` with immediate cancellation on Stagger/Death in `apps/game-server/src/modules/dungeon-boss/TelegraphScheduler.ts`

**Checkpoint**: Shared pathfinder, threat engine, and server-authoritative telegraph scheduler ready.

---

## Phase 3: User Story 1 - Hành vi Quái vật 10 Trạng thái, Bảng Đe dọa & Hồi sinh Elite (Priority: P1) 🎯 MVP

**Goal**: Nạp đủ `30` Regular + `8` Elite (`8 + 1` MVP) từ `game-data/monsters.json`, vận hành 10-state FSM, Safe Zone/Leash, multiplayer scaling, giới hạn đệ tử triệu hồi và lưu bền vững hồi sinh Elite.

**Independent Test**: Nạp thành công `38` loài từ catalog, vượt qua `TS-AI-01`..`TS-AI-06` (leash/Safe Zone `RETURN`, `FLEE` 4s/20s CD, Tank Taunt, dynamic scaling bảo toàn `% HP`, trần `2` đệ tử không rơi đồ, khôi phục đồng hồ Elite sau server restart).

### Implementation for User Story 1

- [ ] T007 [P] [US1] Implement `MonsterRosterLoader` indexing all `30` Regular and `8` Elite monsters (`8 + 1` MVP flagged) directly from `GameCatalogLoader` (`game-data/monsters.json`) without hardcoded stats in `apps/game-server/src/modules/monster-ai/MonsterRosterLoader.ts`
- [ ] T008 [P] [US1] Implement `EliteRespawnStore` persisting and restoring `EliteRespawnTimerRecord` entries in `data/db/world/<regionId>.json` via `JsonDatabaseEngine` atomic writes in `apps/game-server/src/modules/monster-ai/EliteRespawnStore.ts`
- [ ] T009 [US1] Implement `MonsterAiEngine` enforcing `ActiveMonsterRuntime.instanceId`, `ActiveMonsterRuntime.monsterId`, `ActiveMonsterRuntime.aiState` (10 states + priority override `DEATH > STUNNED > RETURN > FLEE > ATTACK > CHASE > DETECT > PATROL > IDLE`), `ActiveMonsterRuntime.hp`, `ActiveMonsterRuntime.poise`, `ActiveMonsterRuntime.threatTable`, `ActiveMonsterRuntime.fleeCooldownUntilMs`, and `ActiveMonsterRuntime.isSummonedMinion` (max `2` minions, `30s` TTL, `yieldsLoot = false`) per `data-model.md`, plus `1024 px` sleeping optimization, Safe Zone barrier, night `-20%` `SHADOW` respawn, and dynamic `multiplayerScaling` preserving `% HP` in `apps/game-server/src/modules/monster-ai/MonsterAiEngine.ts`
- [ ] T010 [US1] Wire `MonsterAiModule` into `SimulationLoop` 20 Hz tick phase 6 (zero disk writes in tick) in `apps/game-server/src/modules/monster-ai/monster-ai.module.ts`
- [ ] T011 [US1] Add unit & integration tests for 10-state FSM, Budgeted A*, Threat Table, dynamic scaling, minion cap, and Elite restart persistence (`TS-AI-01`..`TS-AI-06`) in `apps/game-server/tests/monster-ai/monster-ai-fsm.spec.ts` and `apps/game-server/tests/monster-ai/pathfinding-threat.spec.ts`

**Checkpoint**: All 38 monster profiles and 10-state AI FSM verified independently with zero per-tick disk I/O.

---

## Phase 4: User Story 2 - Vòng đời Hầm ngục Riêng biệt & Boss `boss_thornback_elder` 3 Giai đoạn (Priority: P1) 🎯 MVP

**Goal**: Triển khai `DungeonInstanceManager` cho `dng_mossroot_hollow`, `BossEncounterController` 100% data-driven từ `game-data/bosses.json` (3 phase `100/65/30`, Poise `6.0s`/`x1.40`/`FIRE x1.50`, Enrage `360s`, 4 trụ `safePillars`, 1–4 player scaling lock, 5s entry lock, anti-exploit) và lớp hiển thị Telegraph unlit Layer `180–199`.

**Independent Test**: Mở 2 instance độc lập (Solo & 4-player), kiểm tra khóa cửa `5s` & khóa scaling `1.00x..3.10x`, chặn tấn công ngoài arena, chạy đủ 3 phase + phá trụ `pil_moss_*` tự choáng `2.5s` + phá Poise hủy `Regrowth Sap Channel` + Enrage `360s`, và kiểm chứng Layer `180–199` không bị Ultimate VFX che.

### Implementation for User Story 2

- [ ] T012 [US2] Implement `DungeonInstanceManager` enforcing `DungeonInstanceRuntime.instanceId`, `DungeonInstanceRuntime.dungeonId`, `DungeonInstanceRuntime.partyId`, `DungeonInstanceRuntime.lockedMemberIds`, `DungeonInstanceRuntime.state`, `DungeonInstanceRuntime.entryLockedAtMs` (`5000 ms`, `allowLateJoin: false`), `DungeonInstanceRuntime.reviveCountsByChar`, and `DungeonInstanceRuntime.expiresAtMs` (`120s` empty / `300s` cleared RAM GC) per `data-model.md` in `apps/game-server/src/modules/dungeon-boss/DungeonInstanceManager.ts`
- [ ] T013 [US2] Implement data-driven `BossEncounterController` enforcing `ActiveBossRuntime.bossEntityId`, `ActiveBossRuntime.bossId`, `ActiveBossRuntime.scaledPartySize` (`1..4` locked at `entryLockedAtMs`), `ActiveBossRuntime.currentPhase` (driven by `phases[].hpThresholdPercent` from `bosses.json`: `100/65/30` for Thornback Elder), `ActiveBossRuntime.encounterState`, `ActiveBossRuntime.staggerEndsAtMs` (`6000 ms`, `x1.40` dmg, `FIRE x1.50` Poise, cancels channel), `ActiveBossRuntime.enrageAtMs` (`360s`, `x1.65` ATK, `x1.30` speed), and `ActiveBossRuntime.pillarStates` (4 destructible `safePillars` causing `2.5s` self-stun + `+25%` Poise dmg on `Heartwood Charge` impact + phase `hazards`), plus out-of-arena attack rejection (`ERR_OUT_OF_ARENA_BOUNDS`) and `2s` stuck ranged-skill fallback in `apps/game-server/src/modules/dungeon-boss/BossEncounterController.ts`
- [ ] T014 [P] [US2] Implement client `DungeonScene`, `TelegraphOverlayLayer` (strictly Depth `180–199` unlit, dashed/crosshatch colorblind geometry + optional Blue/Yellow palette, `<= 3 flashes/s`, capping overhead Ultimate VFX alpha `<= 0.65`), and `BossHpPoiseBar` HUD widget in `apps/client/src/game/scenes/DungeonScene.ts`, `apps/client/src/game/systems/TelegraphOverlayLayer.ts`, and `apps/client/src/ui/hud/BossHpPoiseBar.tsx`
- [ ] T015 [US2] Add integration tests for `dng_mossroot_hollow` lifecycle, `boss_thornback_elder` 3-phase transitions, pillar break, Poise stagger cancel, Enrage 360s, and out-of-arena anti-exploit in `apps/game-server/tests/dungeon-boss/boss-thornback-encounter.spec.ts`

**Checkpoint**: Complete `dng_mossroot_hollow` & `boss_thornback_elder` combat loop operational independently.

---

## Phase 5: User Story 3 - Hồi sinh Tổ đội, Party Wipe Reset & Phát thưởng Boss Nguyên tử (Priority: P2)

**Goal**: Triển khai giới hạn 2 lượt hồi sinh/người/trận, reset sạch khi wipe và phân phát phần thưởng Boss công bằng qua Multi-File JSON WAL với khóa First Clear cấp tài khoản, trần tuần và chuyển đồ tràn sang Kho.

**Independent Test**: Hồi sinh thành công 2 lần, từ chối lần 3 (`ERR_REVIVE_LIMIT_REACHED`); wipe khôi phục 100% Boss + 4 trụ về Phase 1; hạ Boss với túi đầy `40/40` chuyển sạch vào `bld_storage`; nhân vật thứ 2 cùng tài khoản không nhận lại `480 STARLIGHT_SHARD` First Clear; đóng góp `< 5%` không nhận thưởng.

### Implementation for User Story 3

- [ ] T016 [US3] Implement `BossReviveWipeService` enforcing `30s` `DOWNED` state, `<= 64 px` range, `2.0s` channel consuming `csm_revive_feather` via WAL, max `2` revives per player (`DungeonInstanceRuntime.reviveCountsByChar`), and full Party Wipe reset (`100% HP`, Phase 1, restore all `safePillars` & clear hazards) in `apps/game-server/src/modules/dungeon-boss/BossReviveWipeService.ts`
- [ ] T017 [US3] Implement `BossRewardDistributor` executing sorted-lock Multi-File JSON WAL (`["account:<accId>", "character:<charId>", "house:<charId>", "inventory:<charId>", "ledger:<YYYY-MM>"]`) enforcing `>= 5%` contribution eligibility, `partyScaling.rewardBonusPercent` (`+0%..+30%`), immutable account-level `BossRewardLockoutRecord.accountFirstClearClaimed`, UTC Monday `00:00` `weeklyResetIsoWeek` caps (`weeklyStarlightClaimed`, `weeklyBossTokensEarned`), `instanceCooldownUntilMs`, and automatic bag-full overflow routing into `bld_storage` in `apps/game-server/src/modules/dungeon-boss/BossRewardDistributor.ts`
- [ ] T018 [P] [US3] Implement `DungeonLockoutController` (`GET /api/v1/characters/:charId/dungeons/lockouts`), `DungeonRealtimeGateway` (`DUNGEON_LEAVE_REQ`, `ALLY_REVIVE_REQ`, `PILLAR_INTERACT_REQ`), `DungeonBossModule`, and client `BossRewardModal` (`SCR-22`) in `apps/game-server/src/modules/dungeon-boss/DungeonLockoutController.ts`, `apps/game-server/src/modules/dungeon-boss/DungeonRealtimeGateway.ts`, `apps/game-server/src/modules/dungeon-boss/dungeon-boss.module.ts`, and `apps/client/src/ui/modals/BossRewardModal.tsx`
- [ ] T019 [US3] Add integration & anti-exploit tests for revive cap, Party Wipe reset, contribution `< 5%`, account-level First Clear immutability, weekly caps, and full-bag storage overflow in `apps/game-server/tests/dungeon-boss/boss-rewards-anti-exploit.spec.ts`

**Checkpoint**: Revive, wipe reset, and fair atomic boss rewards verified independently.

---

## Phase 6: User Story 4 - Khung Mở rộng Dữ liệu Cho 4 Boss & Hầm ngục Hậu MVP (Priority: P3)

**Goal**: Xác minh kiến trúc data-driven vận hành trọn vẹn cả 5 Boss trong `game-data/bosses.json`, bao gồm trụ tương tác cơ chế đặc thù (`pil_coolant_*`, `pil_quartz_*`, `pil_brazier_*`, `pil_sunseal_*`) và khóa sàn `15%` HP `1.5s` Phase 4 của `boss_malakor_abyss`.

**Independent Test**: Chạy bộ headless simulation harness trên toàn bộ 5 Boss (`boss_thornback_elder`..`boss_malakor_abyss`), xác nhận 0 lỗi cấu hình, đúng số giai đoạn (3/3/3/3/4) và khóa chuyển pha `15%` HP của Malakor.

### Implementation for User Story 4

- [ ] T020 [US4] Extend `BossEncounterController` with data-driven interactive pillar handlers (`COOLANT_VALVE`, `GROUNDING_QUARTZ`, `WARMTH_BRAZIER`, `SUNSEAL_OBELISK`) and anti-phase-skip floor clamp (`15%` HP lock for `1500 ms` on `boss_malakor_abyss` Phase 4) in `apps/game-server/src/modules/dungeon-boss/BossEncounterController.ts`
- [ ] T021 [US4] Add 5-boss data-driven headless simulation test suite verifying all phase thresholds, hitbox shapes, stagger multipliers, enrage timers, and rewards directly against `game-data/bosses.json` in `apps/game-server/tests/dungeon-boss/five-boss-headless-sim.spec.ts`

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T022 [P] Add AI tick duration & active `DungeonInstance` count metrics to localhost `/internal/metrics` exporter (`ai_tick_duration_ms`, `active_dungeon_instances`) in `apps/game-server/src/modules/dungeon-boss/DungeonInstanceManager.ts`
- [ ] T023 Run full `quickstart.md` validation checklist and confirm zero hardcoded boss/monster stats and zero per-tick disk I/O across `monster-ai` and `dungeon-boss` modules

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → blocks User Stories 1–4.
- **US1 (Monster AI 10-State)** and **US2 (DungeonInstance + Boss Thornback)** are both `P1` MVP priorities and can develop in parallel after Phase 2 (US2 reuses `NavGridPathfinder`, `ThreatTableService`, `TelegraphScheduler` from Phase 2).
- **US3 (Revive, Wipe Reset & Fair WAL Rewards)** builds directly on US2 (`DungeonInstanceManager`, `BossEncounterController`).
- **US4 (4 Post-MVP Boss Extensions)** builds on US2 without blocking MVP release.
