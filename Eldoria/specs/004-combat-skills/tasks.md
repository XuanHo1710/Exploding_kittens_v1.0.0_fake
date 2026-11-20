# Tasks: Real-Time Action Combat & 60-Skill Data-Driven Engine

**Input**: Design documents from `/specs/004-combat-skills/`

**Prerequisites**: `001-foundation-game-engine`, `002-auth-character`, `003-world-movement`, `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/combat-skills-contract.md`, `quickstart.md`

**Tests**: Bao gồm kiểm thử đơn vị công thức/hitbox, kiểm thử tích hợp WebSocket combat (`TS-CMB-001..004`, `SEC-010`, `SEC-013`) và kiểm thử lớp hiển thị Ultimate readability.

## Phase 1: Setup (Shared Combat Contracts & Pure Math)

**Purpose**: Định nghĩa Zod DTO nghiêm ngặt và toàn bộ hàm toán học thuần về chỉ số, sát thương 5 bước và hình học va chạm 2D dùng chung.

- [ ] T001 Define strict WebSocket combat and REST skill DTOs (stripping/rejecting client-supplied damage or cooldown fields) in `packages/shared/src/contracts/combat-skills.dto.ts`
- [ ] T002 [P] Implement `StatCalculator` enforcing hard caps on `DerivedCombatStats.totalAtk`, `DerivedCombatStats.totalDef`, `DerivedCombatStats.critRate` (`<= 0.75`), `DerivedCombatStats.critDamage` (`<= 2.50`), `DerivedCombatStats.cooldownReduction` (`<= 0.40`), `DerivedCombatStats.attackSpeedMult` (`<= 1.60`), `DerivedCombatStats.defPenPct` (`<= 0.50`), and `DerivedCombatStats.elementalRes` (`[-0.35, 0.70]`) per `data-model.md` in `packages/shared/src/combat/stat-calculator.ts`
- [ ] T003 [P] Implement 5-step Master Damage Formula and 9-element affinity matrix (`1.25x / 1.20x / 0.85x / 1.00x`, `NEUTRAL` 30% positive-res ignore, hyperbolic DEF mitigation) in `packages/shared/src/combat/damage-formula.ts`
- [ ] T004 [P] Implement 2D hitbox geometry solvers (`ARC`, `CIRCLE`, `LINE`, `RECT`, swept segment-vs-circle `PROJECTILE` anti-tunneling, `SELF`) in `packages/shared/src/combat/hitbox-geometry.ts`

---

## Phase 2: Foundational (Combat Runtime Registry & Status/CC Infrastructure)

**Purpose**: Dựng hạ tầng trạng thái RAM trong `ZoneInstance`, hiệu ứng trạng thái và bộ theo dõi CC Diminishing Returns làm nền cho cả 3 User Story.

- [ ] T005 Implement `CombatActorStore` managing in-memory actor lifecycles enforcing `CombatActorRuntime.entityId`, `CombatActorRuntime.actorType`, `CombatActorRuntime.combatState`, `CombatActorRuntime.hp`, `CombatActorRuntime.mp`, `CombatActorRuntime.stamina`, `CombatActorRuntime.poise`, and `CombatActorRuntime.lastProcessedSeq` per `data-model.md` in `apps/game-server/src/modules/combat/combat-actor.store.ts`
- [ ] T006 [P] Implement `StatusEffectService` enforcing `ActiveStatusEffect.effectId`, `ActiveStatusEffect.effectType` (including FIFO-by-expiry `SHIELD` absorption), `ActiveStatusEffect.sourceEntityId`, `ActiveStatusEffect.element`, `ActiveStatusEffect.stacks`, `ActiveStatusEffect.remainingMs`, and `ActiveStatusEffect.nextTickAtMs` (`1000 ms` DoT & zone intervals) per `data-model.md` in `apps/game-server/src/modules/combat/status-effect.service.ts`
- [ ] T007 [P] Implement `CcDiminishingService` enforcing `CcDiminishingTracker.ccGroup`, `CcDiminishingTracker.applicationCount` (`100% -> 50% -> 25% -> 0% IMMUNE`), and `CcDiminishingTracker.windowExpiresAtTick` (`20,000 ms` rolling window + Boss Hard-CC conversion to Poise/Frostbite) per `data-model.md` in `apps/game-server/src/modules/combat/cc-diminishing.service.ts`
- [ ] T008 [P] Implement `ElementalReactionService` executing all 9 elemental reactions (`Melt`, `Overload`, `Eclipse Burst`, `Electro-Shock`, `Vaporize`, `Freeze & Shatter`, `Swirl`, `Crystallize`, `Kinetic Break`) with `2,000 ms` per-pair/per-target ICD and `<= 1.35x` multiplier cap in `apps/game-server/src/modules/combat/elemental-reaction.service.ts`

**Checkpoint**: Shared math, RAM actor state, status effects, CC DR, and 9-element reactions ready.

---

## Phase 3: User Story 1 - Chiến đấu Hành động Thời gian thực: Combo, Dodge i-Frame & Perfect Parry (Priority: P1) 🎯 MVP

**Goal**: Chạy chiến đấu cận chiến/tầm xa cơ bản 20 Hz với chuỗi combo, Dodge `300 ms` i-frame, Block `60%` / Perfect Parry `200 ms`, chống gian lận gói tin.

**Independent Test**: Pass unit tests + `TS-CMB-001`, `TS-CMB-002`, `SEC-010` chứng minh 3-hit combo, Dodge i-frame, Perfect Parry phản `25%` Poise và bác bỏ `100%` fake damage.

### Implementation for User Story 1

- [ ] T009 [US1] Implement `CombatService` 20 Hz tick processor handling 3/4-hit Basic Attacks (`750 ms` combo window, `150 ms` input buffer, `3-6 MP/hit` restore), Safe Zone guard, Boss Phase HP Floor Guard, and Stagger limit (`max 3/phase`) enforcing `CombatActorRuntime.comboStep` and `CombatActorRuntime.exhaustedUntilTick` (`1,500 ms` at `0` stamina) per `data-model.md` in `apps/game-server/src/modules/combat/combat.service.ts`
- [ ] T010 [US1] Implement Dodge (`20` Stamina, `1,200 ms` CDR-immune CD, `300 ms` i-frame, `112 px` swept wall collision), Block (`60%` DR in `120°`, `12` Sta, `1.0s` Guard Break), and Perfect Parry (`200 ms` window, `100%` DR, `+15` Sta, `25%` Poise counter) enforcing `CombatActorRuntime.iFrameUntilTick`, `CombatActorRuntime.dodgeCooldownUntilTick`, and `CombatActorRuntime.parryWindowUntilTick` per `data-model.md` in `apps/game-server/src/modules/combat/defensive-actions.service.ts`
- [ ] T011 [US1] Implement `CombatGateway` handling `BASIC_ATTACK_REQ`, `DODGE_REQ`, `BLOCK_STATE`, `RESPAWN_REQ` with per-event rate limiting, monotonic `seq` validation, LoS checks, and anti-cheat `suspicionScore` hooks in `apps/game-server/src/modules/combat/combat.gateway.ts`
- [ ] T012 [US1] Add unit & e2e tests verifying 5-step damage formula, swept hitboxes, Dodge i-frame, Perfect Parry vs Block, and fake-damage rejection (`TS-CMB-001`, `TS-CMB-002`, `SEC-010`) in `apps/game-server/tests/combat/combat-mechanics.e2e-spec.ts`

**Checkpoint**: Core server-authoritative action combat loop verified independently.

---

## Phase 4: User Story 2 - Động cơ 60 Kỹ năng Hướng dữ liệu, Cộng hưởng 9 Nguyên tố & Khống chế (Priority: P1)

**Goal**: Thực thi động cơ kỹ năng đọc `game-data/skills.json` chạy đúng `castTimeMs -> startupMs -> activeMs -> recoveryMs` cho đủ 15 kỹ năng MVP (kiến trúc sẵn sàng 60 kỹ năng), lưu cấp kỹ năng & hotbar vào JSON nhân vật.

**Independent Test**: Thi triển trọn bộ 15 kỹ năng của Kael/Lyra/Seraphina, xác nhận Interrupt trong `CASTING`, cancel `40%` cuối `RECOVERY`, phản ứng nguyên tố ICD `2,000 ms`, và CC DR `100% -> 50% -> 25% -> IMMUNE`.

### Implementation for User Story 2

- [ ] T013 [US2] Implement `SkillExecutionEngine` reading `game-data/skills.json` enforcing `SkillRuntimeExecution.executionId`, `SkillRuntimeExecution.casterEntityId`, `SkillRuntimeExecution.skillId`, `SkillRuntimeExecution.skillRank`, `SkillRuntimeExecution.phase`, `SkillRuntimeExecution.castTimeMs`, `SkillRuntimeExecution.startupMs`, `SkillRuntimeExecution.activeMs`, `SkillRuntimeExecution.recoveryMs` (`40%` late-recovery Dodge/Block cancel + `150 ms` buffer), `SkillRuntimeExecution.hitboxShape`, `SkillRuntimeExecution.aimAngle`, and `SkillRuntimeExecution.hitTargetCounts` per `data-model.md` in `apps/game-server/src/modules/skill/skill-execution.engine.ts`
- [ ] T014 [P] [US2] Implement `ProjectileZoneManager` advancing active projectiles (`swept collision`, `pierceCount`, `boomerang: true` for `Searing Halo`) and ground zones (`Crimson Crescent` cinder trail, `Cyclone Snare`, `Tempest Arrowstorm`, `Sanctuary Ward`, `Storm Dominion`, `Abyssal Eclipse`) at 20 Hz in `apps/game-server/src/modules/skill/projectile-zone.manager.ts`
- [ ] T015 [P] [US2] Implement `SkillEffectRegistry` covering all 15 MVP skills (`chr_kael_vanguard`, `chr_lyra_windrunner`, `chr_seraphina_dawn`) plus shared handler primitives for the remaining 45 roadmap skills (linear `upgradeScalingPerRank`, `pveModifier`/`pvpModifier`, `singleTargetMultiHitDiminishing`) in `apps/game-server/src/modules/skill/skill-effect.registry.ts`
- [ ] T016 [US2] Implement `SkillProgressionController` (`POST /api/v1/characters/:charId/skills/upgrade`, `PUT /api/v1/characters/:charId/skills/hotbar`) and `SkillProgressionRepository` persisting `CharacterSkill.skillId`, `CharacterSkill.rank`, `CharacterSkill.masteryExp`, and `CharacterSkill.hotbarSlot` per `data-model.md` atomically in `data/db/characters/<charId>.json` in `apps/game-server/src/modules/skill/skill-progression.controller.ts`
- [ ] T017 [US2] Add integration tests verifying all 15 MVP skills, catalog loading of all 60 skills, Interrupt `50%` MP refund + `2,000 ms` penalty CD, Melt/Swirl/Eclipse Burst ICD, and CC DR (`TS-CMB-003`) in `apps/game-server/tests/skill/skill-engine.spec.ts`

**Checkpoint**: Data-driven 60-skill engine (15 MVP) and elemental/CC rules verified independently.

---

## Phase 5: User Story 3 - Khả năng Đọc Chiến trường của Ultimate, Tử trận/Hồi sinh & Cảm giác Chiến đấu (Priority: P2)

**Goal**: Hoàn thiện tầng render combat Phaser 3 bảo đảm Boss Telegraph luôn nổi trên VFX Ultimate (`alpha <= 0.45`), hit-stop cục bộ, Camera Shake tắt được, vòng đời Death/Respawn không mất trang bị và `5s` Combat Logout Grace.

**Independent Test**: Pass `TS-CMB-004`, `SEC-013`, kiểm tra 4 Ultimate đồng thời không che Boss Telegraph và tử trận/hồi sinh giữ `100%` trang bị.

### Implementation for User Story 3

- [ ] T018 [US3] Implement `CombatGraceService` enforcing `5-second` Combat Logout Grace on unexpected socket disconnect, safe Death/Respawn state reset without permanent equipment loss, and dirty-flag HP/MP/Stamina flush hook to `StaggeredDirtyFlusher` (zero per-tick disk I/O) in `apps/game-server/src/modules/combat/combat-grace.service.ts`
- [ ] T019 [P] [US3] Implement Phaser `CombatVfxSystem` enforcing strict Depth `100-149` (`alpha <= 0.45`) for player ground VFX strictly below Depth `150-199` Boss Telegraphs, fullscreen flash cap `<= 3 Hz`, `Ally VFX Reduction` (`0.50x` alpha), toggleable `Camera Shake (0%-100%)`, and client-only `40-65 ms` sprite hit-stop in `apps/client/src/game/systems/CombatVfxSystem.ts`
- [ ] T020 [P] [US3] Implement object-pooled `FloatingCombatTextPool` (`CRIT!`, `MELT!`, `PARRY!`, `IMMUNE`), `CombatInputController`, and `useHudStore` cooldown/status/Boss-Poise bindings via `GameUiBridge` in `apps/client/src/game/systems/FloatingCombatTextPool.ts` and `apps/client/src/stores/useHudStore.ts`
- [ ] T021 [US3] Add e2e and Playwright visual tests verifying Ultimate telegraph visibility (`TS-CMB-004`), `5s` Combat Logout Grace (`SEC-013`), and zero-gear-loss respawn in `apps/game-server/tests/combat/death-grace.e2e-spec.ts` and `apps/client/tests/combat-readability.spec.ts`

**Checkpoint**: Visual readability, death/respawn safety, and combat logout grace verified.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T022 [P] Wire `EntityDamaged`, `MonsterKilled`, `PlayerDied`, and `SkillCastStarted` internal events to `InternalEventBus` and verify zero circular imports between `combat`, `skill`, `loot`, and `boss` modules in `apps/game-server/src/modules/combat/combat.module.ts`
- [ ] T023 Run full `quickstart.md` validation scenarios and verify zero disk writes occur inside `SimulationLoop` 20 Hz combat ticks

---

## Dependencies & Execution Order

- **Phase 1 (Shared Math)** → **Phase 2 (Runtime Infrastructure)** → blocks User Stories 1, 2, 3.
- **US1 (`CombatService` & Defensives)** and **US2 (`SkillExecutionEngine` & Progression)** share Phase 2 and can proceed largely in parallel once `CombatActorStore` and `StatusEffectService` are in place.
- **US3 (Ultimate Readability, Death/Respawn, Combat Grace)** integrates with US1 & US2 events.
- **MVP First**: Complete Phases 1–4 (`US1` + `US2`) for all 15 MVP skills, then Phase 5 (`US3`) to seal Co-op readability and disconnect integrity.
