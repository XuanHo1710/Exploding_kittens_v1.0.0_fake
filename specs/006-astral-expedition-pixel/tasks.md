---

description: "Actionable, dependency-ordered task list for Astral Expedition Pixel (006-astral-expedition-pixel)"
---

# Tasks: Astral Expedition Pixel — Game 2D Pixel Turn-Based Gacha Phong Cách Expedition 33

**Input**: Design documents from `/specs/006-astral-expedition-pixel/` (`plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`)

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/asset-pipeline.md](./contracts/asset-pipeline.md), [contracts/socket-and-storage.md](./contracts/socket-and-storage.md), [contracts/vertical-battle-ui.md](./contracts/vertical-battle-ui.md)

**Tests**: Included per Constitution Principle VII (`Verifiable Quality Gates`) and `SC-001`–`SC-008` measurable verification requirements.

**Organization**: Tasks are grouped by User Story (`US1`–`US5`) to enable independent implementation, asset verification, and end-to-end testing of each increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (operates on distinct files with no unmet dependencies)
- **[Story]**: Maps task to a specific user story (`[US1]` .. `[US5]`); omitted in Setup, Foundational, and Polish phases
- All file paths are repository-root relative

---

## Phase 1: Setup (Shared Infrastructure & Local Docker Stack)

**Purpose**: Initialize isolated directories, local zero-cost Docker Redis configuration, and offline Python asset pipeline directories without altering existing game modes.

- [ ] T001 Create isolated module directories `shared/src/expedition/`, `server/src/game/expedition/`, `client/src/expedition/`, `data/expedition/`, `database-astral-expedition/`, and `tools/expedition/` per project structure in `specs/006-astral-expedition-pixel/plan.md`
- [ ] T002 [P] Create local zero-cost Redis container configuration in `docker-compose.expedition.yml` following the service contract in `specs/006-astral-expedition-pixel/contracts/socket-and-storage.md`
- [ ] T003 [P] Migrate offline tool directories `tools/pokemon/` to `tools/units/` and `prompts/moves/` to `prompts/skills/` with updated relative imports in `tools/README.md`
- [ ] T004 [P] Add `.gitignore` rules for runtime local profile saves `server/data/expedition/` and temporary asset scratch `tmp/` in `.gitignore`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core shared data contracts, local Docker Redis + atomic JSON persistence, static security middleware, and asset bundler required before any User Story runs.

**⚠️ CRITICAL**: Complete this phase before executing runtime tasks in User Stories `US1`–`US4` (`US5` pipeline refactoring only depends on Phase 1).

- [ ] T005 Register `'astral_expedition'` in `GAME_MODES` and export `ASTRAL_EXPEDITION_STATIC_ROOT` in `shared/src/index.ts`
- [ ] T006 Define canonical TypeScript interfaces and validation helpers in `shared/src/expedition/types.ts` implementing constrained fields from `data-model.md`: `HeroDefinition.heroId`, `HeroDefinition.nameVi`, `HeroDefinition.titleVi`, `HeroDefinition.rarity`, `HeroDefinition.element`, `HeroDefinition.role`, `HeroDefinition.baseStats`, `HeroDefinition.growthPerLevel`, `HeroDefinition.skillIds`, `HeroDefinition.spriteSpec`, `HeroInstance.level`, `HeroInstance.awakeningRank`, `CombatSkillDefinition.skillId`, `CombatSkillDefinition.slotKind`, `CombatSkillDefinition.nameVi`, `CombatSkillDefinition.summaryVi`, `CombatSkillDefinition.apCost`, `CombatSkillDefinition.apGain`, `CombatSkillDefinition.targetScope`, `CombatSkillDefinition.hits`, `CombatSkillDefinition.canTriggerBreak`, `CombatSkillDefinition.vfxSpec`, `RealmMapSpec.mapId`, `BossDefinition.bossId`, `GatekeeperEncounter.patrolWaypoints`, `GatekeeperEncounter.gateBarrierTiles`, `GatekeeperEncounter.aggroRadius`, `ExpeditionProfile.clearedGatekeepers`, `ExpeditionProfile.lastRestAnchorId`, `ExpeditionProfile.astralSeal`, `ExpeditionProfile.starlightToken`, `PityLedger.ssrPityCount`, `SummonBannerConfig`, `BattleSessionState`, and `CombatantRuntime`
- [ ] T007 [P] Implement `ExpeditionRedisService` with `127.0.0.1:6379` RESP/Redis client, key prefixes (`exp:profile:*`, `exp:battle:*`, `exp:lock:*`, `exp:rl:*`), and automatic `InMemoryCacheFallback` in `server/src/game/expedition/expedition-redis.service.ts`
- [ ] T008 [P] Implement per-account atomic persistence (`write temp -> fsync -> rename`) and starter profile initializer in `server/src/game/expedition/expedition-store.ts`
- [ ] T009 [P] Implement fail-closed `AstralExpeditionStaticGuard` and `/database-astral-expedition` static mount in `server/src/app.module.ts` per `specs/006-astral-expedition-pixel/contracts/socket-and-storage.md`
- [ ] T010 Implement asset packager and SHA-256 manifest builder in `tools/expedition/build_bundle.py` and frame/palette gate checker in `tools/expedition/verify_bundle.py`
- [ ] T011 Wire base `ExpeditionService` provider in `server/src/game/expedition/expedition.service.ts` and `exp:*` Socket.IO event routing skeleton in `server/src/game/game.gateway.ts`
- [ ] T012 [P] Create client state store and Socket.IO request/response wrapper in `client/src/expedition/store.ts` and multi-frame sprite/atlas loader in `client/src/expedition/assetLoader.ts`

**Checkpoint**: Foundation ready — static guard, Redis + atomic JSON persistence, shared contracts, and client/server wiring are operational.

---

## Phase 3: User Story 1 - Chiến Đấu Theo Lượt Phong Cách Expedition Với Menu Kỹ Năng Dọc & Phản Xạ Né/Đỡ (Priority: P1) 🎯 MVP

**Goal**: Deliver a complete, playable 60 FPS diagonal 2D pixel turn-based combat slice featuring the 3 starter Heroes (`36 frames` each in battle), **Vertical Skill Menu**, CTB Turn Order Timeline, `0..9 AP` economy, two-way real-time **Timed Hit** + **Dodge / Parry Counter**, and **Break Gauge**.

**Independent Test**: Launch **Astral Expedition Pixel** from the lobby into a test battle with the 3 starter Heroes (`Lâm Phong`, `Minh Châu`, `Thạch Sơn`), execute skills from the Vertical Skill Menu (`0 AP` Basic Attack restoring AP + Active/Ultimate skills with Timed Hit rings), perform Dodge and Parry Counter against multi-beat enemy attacks, trigger Break Stagger, and verify server replay acceptance.

### Tests for User Story 1

- [ ] T013 [P] [US1] Write deterministic combat engine unit tests covering CTB Turn Timeline, AP `0..9`, Timed Hit multipliers, Dodge/Parry Counter windows, Break Stagger, and `replayAndVerify` anti-tamper checks in `server/test/expedition-battle-engine.test.cjs`

### Implementation for User Story 1

- [ ] T014 [P] [US1] Author starter Hero data (`gustave_blade`, `celine_prism`, `bastian_aegis`), 15 starter skills, and baseline Meadow enemies in `data/expedition/heroes.json` and `data/expedition/skills.json` conforming to `HeroDefinition.*` and `CombatSkillDefinition.*` in `data-model.md`
- [ ] T015 [P] [US1] Generate and normalize `192×192` `6×6` (`36-frame`) diagonal `BACK` battle sheets for the 3 starter Heroes and `6×4` (`24-frame`) `FRONT` battle sheet for starter enemies into `database-astral-expedition/units/` using `tools/units/normalize_sheet.py` and `tools/gen3/check_gen3.py`
- [ ] T016 [P] [US1] Generate 15 starter skill VFX (`8-frame CAST` + `8-frame EFFECT` + beam configs) into `database-astral-expedition/vfx/skills/` and the `8-frame` animated `01-dawn-meadow` battle scene into `database-astral-expedition/battle-scenes/01-dawn-meadow/`
- [ ] T017 [P] [US1] Generate chamfered pixel UI frames, Vietnamese glyph atlas, AP gems, and vertical command cards into `database-astral-expedition/ui/` via `tools/ui/draw_ui.py`
- [ ] T018 [US1] Implement deterministic `ExpeditionBattleEngine` (CTB queue, AP `0..9`, Offensive Timed Hit, Defensive Dodge/Parry Riposte, Break Gauge, and `replayAndVerify`) in `shared/src/expedition/battle-engine.ts` enforcing `BattleSessionState` transitions and `CombatSkillDefinition.apCost`/`apGain`/`hits`/`canTriggerBreak` from `data-model.md`
- [ ] T019 [US1] Implement `exp:load_profile`, `exp:battle_start`, and `exp:battle_commit` handlers with Redis session caching in `server/src/game/expedition/expedition.service.ts`
- [ ] T020 [P] [US1] Implement 60 FPS diagonal pixel battle canvas renderer (`IDLE_BREATHE` continuous 6f loop, `ATTACK`/`SKILL_CAST`/`PARRY_COUNTER`/`DODGE`/`HURT_FAINT` playback, `8-frame` animated scene backdrop, and un-obscured enemy telegraphs) in `client/src/expedition/battleRenderer.ts`
- [ ] T021 [P] [US1] Implement Expedition 33-style `VerticalSkillMenu` (auto-collapsing during animations, `0 AP` basic fallback, Vietnamese 2-line skill summary) in `client/src/expedition/VerticalSkillMenu.tsx` and `client/src/expedition/expedition.css` per `specs/006-astral-expedition-pixel/contracts/vertical-battle-ui.md`
- [ ] T022 [P] [US1] Implement two-way real-time `TimingOverlay` (shrinking Timed Hit ring + Dodge/Parry prompts + keyboard/touch bindings) in `client/src/expedition/TimingOverlay.tsx`
- [ ] T023 [US1] Integrate battle view into `client/src/components/ExpeditionBoard.tsx` and register the **Astral Expedition Pixel** lobby card in `client/src/components/Home.tsx` and `client/src/App.tsx`

**Checkpoint**: User Story 1 (MVP Combat Slice) is playable end-to-end from `Home.tsx` with 36-frame Hero animations, Vertical Skill Menu, Timed Hit, Parry Counter, and server-verified battle commits.

---

## Phase 4: User Story 2 - Khám Phá Thế Giới 2D Pixel Qua 7 Vùng Đất & Vượt Quái Gác Cổng (Priority: P1)

**Goal**: Deliver full 2D pixel world exploration across all **7 sequential independent Realms** (`Đồng Cỏ → Tuyết → Sa Mạc → Dưới Nước → Núi Lửa → Vùng Ban Đêm → Quang Phổ Mây Trời Ban Đêm`) with `8-frame` living terrain animations, Rest Anchors, and **20 patrolling/blocking Gatekeeper Encounters**.

**Independent Test**: Walk from spawn in `01-dawn-meadow` through patrolling Gatekeepers (triggering themed battles on contact, unlocking gate barriers upon victory, or respawning safely `>= 6` tiles away at the nearest Rest Anchor upon defeat) and traverse sequentially across all 7 connected Realm Maps with `0` seam or collision deadlocks.

### Tests for User Story 2

- [ ] T024 [P] [US2] Write automated map solver and progression tests verifying all 7 Realm paths, 20 Gatekeeper barrier unlocks, `>= 6` tile safe respawn distance, and `exp:reach_anchor` / `exp:warp_realm` authorization in `server/test/expedition-realms-gatekeepers.test.cjs`

### Implementation for User Story 2

- [ ] T025 [P] [US2] Author canonical 7 Realm specifications and 20 Gatekeeper encounter configs in `data/expedition/realms.json` and `data/expedition/gatekeepers.json` conforming to `RealmMapSpec.mapId`, `GatekeeperEncounter.patrolWaypoints`, `GatekeeperEncounter.gateBarrierTiles`, `GatekeeperEncounter.aggroRadius`, `ExpeditionProfile.clearedGatekeepers`, and `ExpeditionProfile.lastRestAnchorId` in `data-model.md`
- [ ] T026 [P] [US2] Generate 47-tile blob autotiles, `8-frame` animated terrain/prop strips, and Signature Silhouette Rest Anchors/Portals for all 7 themes (`meadow`, `snow`, `desert`, `underwater`, `volcano`, `night`, `aurora`) into `database-astral-expedition/overworld/` and `database-astral-expedition/structures/` via `tools/overworld/gen_overworld.py` and `tools/structures/draw_civic.py`
- [ ] T027 [P] [US2] Generate `48-frame` (`6×4` × `idle`/`walk`) overworld movement sheets for party leaders and `24-frame` overworld + `24-frame` `FRONT` battle sheets for Gatekeeper archetypes into `database-astral-expedition/units/`
- [ ] T028 [US2] Author 7 Map Specs (`01-dawn-meadow` through `07-aurora-zenith`) in `assets/maps/` and export lint-clean Tiled `.tmj` maps (`0` seam errors) into `database-astral-expedition/maps/` using `tools/maps/mapgen.py`
- [ ] T029 [US2] Implement `exp:reach_anchor`, `exp:warp_realm`, Gatekeeper clear persistence, and defeat safe-respawn logic in `server/src/game/expedition/expedition.service.ts`
- [ ] T030 [P] [US2] Implement 60 FPS `overworldRenderer` (Tiled `.tmj` layers, `8-frame` synchronized tile animations, ambient biome particles, Y-sorted party leader, patrolling Gatekeepers with `!` encounter transition, and mobile virtual D-pad) in `client/src/expedition/overworldRenderer.ts`
- [ ] T031 [US2] Connect seamless Overworld ↔ Battle transitions, Realm Map HUD, and Rest Anchor recovery prompts in `client/src/components/ExpeditionBoard.tsx`

**Checkpoint**: User Stories 1 and 2 work together — players explore all 7 animated pixel realms, confront patrolling Gatekeepers, unlock realm gates, and rest at anchors.

---

## Phase 5: User Story 3 - Chinh Phục Trùm Khu Vực & Trùm Cuối Quang Phổ Mây Trời Ban Đêm (Priority: P2)

**Goal**: Deliver **6 Regional Bosses** and the colossal 3-phase **Final Boss (`Astral Painter Seraphina`)** on the `07-aurora-zenith` (*Quang Phổ Mây Trời Ban Đêm*) arena, each with `256×256` `36-frame` sprites, multi-phase transformations, delayed/multi-beat Parry cadences, and strict telegraph visibility.

**Independent Test**: Enter each Regional Boss arena and the Final Boss arena on `07-aurora-zenith`, fight across phase thresholds (`65%` and `30%` HP), verify phase-awakening animations, confirm Ultimate VFX never hides Boss telegraphs, and verify realm-unlock + first-clear rewards.

### Tests for User Story 3

- [ ] T032 [P] [US3] Write multi-phase Boss state transition, Break armor-shatter, and Final Boss 3-phase simulation tests in `server/test/expedition-bosses.test.cjs`

### Implementation for User Story 3

- [ ] T033 [P] [US3] Author all 6 Regional Bosses and Final Boss `Seraphina` phase scripts, multi-hit Parry cadences, and first-clear reward tables in `data/expedition/bosses.json` conforming to `BossDefinition.bossId` and 2–3 phase rules in `data-model.md`
- [ ] T034 [P] [US3] Generate and normalize `256×256` `6×6` (`36-frame`) colossal `FRONT` battle sheets for all 7 Bosses (`IDLE_BREATHE`, `COMBO_ATTACK`, `HEAVY_SWEEP`, `PHASE_AWAKEN`, `STAGGER_BREAK`, `DEFEAT`) into `database-astral-expedition/units/bosses/`
- [ ] T035 [P] [US3] Generate all 7 Boss Battle Scenes (`390×180` ×2 wide) with `8-frame` animated environment layers—including the `8–12 frame` flowing 7-color aurora ribbon sky of `07-aurora-zenith`—into `database-astral-expedition/battle-scenes/` via `tools/battle-scenes/battle_scene.py`
- [ ] T036 [US3] Extend `ExpeditionBattleEngine` in `shared/src/expedition/battle-engine.ts` and `ExpeditionService` in `server/src/game/expedition/expedition.service.ts` to process HP-threshold phase transitions, Vulcan/Boreal Break-shield mechanics, and first-clear realm unlocks (`FR-013`, `FR-014`)
- [ ] T037 [US3] Add Boss HP + Break header bar, phase-transition banner cut-ins, and anti-obscuration telegraph z-layering in `client/src/expedition/battleRenderer.ts` and `client/src/components/ExpeditionBoard.tsx`

**Checkpoint**: All 6 Regional Bosses and the Final Boss on *Quang Phổ Mây Trời Ban Đêm* are fully playable with 36-frame colossal sprites and multi-phase mechanics.

---

## Phase 6: User Story 4 - Triệu Hồi Anh Hùng (Gacha), Sắp Xếp Đội Hình & Phát Triển Sức Mạnh (Priority: P2)

**Goal**: Deliver the full **12-Hero Gacha Roster (`R / SR / SSR`, 60 total skills)**, `26+ frame` Astral Summon Orb animation, transparent drop-rate & **Hard Pity 80** mechanics, duplicate Awakening (`A1..A6` + `starlightToken` overflow), and 3-Hero Squad + Skill upgrade management.

**Independent Test**: Earn `astralSeal` currency, open `GachaModal`, view published rates and Pity counter, execute 1x and 10x pulls (verifying 10-pull `SR+` guarantee, Hard Pity `80` `SSR` guarantee, and duplicate Awakening conversion), customize the 3-Hero squad in `PartyModal`, upgrade levels/skills, and enter battle with the new team.

### Tests for User Story 4

- [ ] T038 [P] [US4] Write 10,000-pull statistical & boundary test suite verifying `SR+` 10-pull guarantee, Soft Pity `65`, Hard Pity `80`, duplicate `A6` overflow conversion, Redis idempotency locks, and Redis-restart persistence survival in `server/test/expedition-gacha.test.cjs`

### Implementation for User Story 4

- [ ] T039 [P] [US4] Expand `data/expedition/heroes.json`, `data/expedition/skills.json`, and `data/expedition/banners.json` with the remaining 9 Gacha Heroes (completing all 12 Heroes and 60 skills) and banner config conforming to `HeroDefinition.rarity`, `HeroInstance.level`, `HeroInstance.awakeningRank`, `ExpeditionProfile.astralSeal`, `ExpeditionProfile.starlightToken`, `SummonBannerConfig`, and `PityLedger.ssrPityCount` in `data-model.md`
- [ ] T040 [P] [US4] Generate `36-frame` `BACK` battle sheets, `48-frame` overworld movement sheets, portraits, and remaining 45 skill VFX strips (`8f CAST` + `8f EFFECT`) for the 9 unlockable Gacha Heroes into `database-astral-expedition/units/heroes/` and `database-astral-expedition/vfx/skills/`
- [ ] T041 [P] [US4] Generate the `8×6` (`26+ frame`) Astral Summon Orb sprite sheet (`R` Blue / `SR` Purple / `SSR` Aurora Gold rarity states) into `database-astral-expedition/ui/gacha/astral-orb.png` via `tools/items/normalize_ball.py`
- [ ] T042 [US4] Implement cryptographic RNG summon resolver, Soft Pity `65`, Hard Pity `80`, 10-pull `SR+` guarantee, and `A1..A6` / `starlightToken` duplicate conversion in `shared/src/expedition/gacha-rules.ts` and export unified catalog in `shared/src/expedition/catalog.ts`
- [ ] T043 [US4] Implement Redis-locked atomic `exp:summon`, `exp:update_party`, and `exp:upgrade_hero` handlers in `server/src/game/expedition/expedition.service.ts` and `server/src/game/game.gateway.ts`
- [ ] T044 [P] [US4] Implement `GachaModal` (1x/10x summon controls, 26-frame Astral Orb reveal animation, live Pity `X/80` badge, rate disclosure table, and pull history) in `client/src/expedition/GachaModal.tsx`
- [ ] T045 [P] [US4] Implement `PartyModal` (12-Hero collection grid, 3-slot active squad builder, level/awakening/skill upgrade actions, and vertical skill preview) in `client/src/expedition/PartyModal.tsx`
- [ ] T046 [US4] Wire `GachaModal` and `PartyModal` shortcuts and reward notifications into `client/src/components/ExpeditionBoard.tsx`

**Checkpoint**: Full 12-Hero Gacha loop, Pity 80 guarantee, squad building, and progression upgrades operate atomically end-to-end.

---

## Phase 7: User Story 5 - Chuẩn Hóa Bộ Quy Trình Tạo Tài Nguyên Pixel Art Cho Đúng Nghiệp Vụ Game Mới (Priority: P3)

**Goal**: Complete the synchronized rename and domain rewrite of all **11 `.agents/skills/expedition-*` workflows**, `prompts/`, `tools/`, and `GLOSSARY.md` so `100%` of asset documentation, prompts, and validator scripts speak the **Astral Expedition Pixel** domain with `0` legacy creature-catching references or broken links.

*(Note: Per Constitution Principle II, this phase has no runtime code dependency on Phase 2 and SHOULD be executed early in parallel right after Phase 1 whenever staffing/agent order allows.)*

**Independent Test**: Run `py tools/expedition/verify_skills_and_glossary.py` to confirm all 11 `.agents/skills/expedition-*` folders exist, `0` `pokemon-*`/`pokeball-*` skill folders remain, `0` legacy creature-catching terms appear in skills/prompts/glossary, and `100%` of relative Markdown links resolve cleanly.

### Tests for User Story 5

- [ ] T047 [P] [US5] Implement automated skill/prompt/glossary domain auditor and relative-link verifier in `tools/expedition/verify_skills_and_glossary.py` enforcing `SC-006` and `specs/006-astral-expedition-pixel/contracts/asset-pipeline.md`

### Implementation for User Story 5

- [ ] T048 [P] [US5] Rewrite `GLOSSARY.md` with canonical **Astral Expedition Pixel** world, combat, vertical-menu, boss, and Gacha terminology
- [ ] T049 [P] [US5] Rewrite multi-frame AI prompt templates in `prompts/battle/README.md`, `prompts/movement/README.md`, `prompts/skills/README.md`, `prompts/overworld/README.md`, `prompts/structure/README.md`, `prompts/structure/door.md`, and `prompts/structure/interior.md` for Expedition Heroes, Gatekeepers, `256×256` Bosses, and 7 animated Realms
- [ ] T050 [US5] Rename `.agents/skills/pokemon-sprite-generator`, `pokemon-battle-poses`, `pokemon-battle-scene`, `pokemon-character-generator`, and `pokeball-generator` to `expedition-sprite-generator`, `expedition-battle-poses`, `expedition-battle-scene`, `expedition-npc-generator`, and `expedition-summon-orb-generator` (removing old folders) and rewrite their `SKILL.md` files for `36f`/`48f` sprites and Gacha Orbs
- [ ] T051 [US5] Rename `.agents/skills/pokemon-move-vfx`, `pokemon-move-review`, and `pokemon-ui-generator` to `expedition-skill-vfx`, `expedition-skill-review`, and `expedition-ui-generator` (removing old folders) and rewrite their `SKILL.md` files for 60 skills, Boss telegraph safety, and the Expedition 33 Vertical Skill Menu
- [ ] T052 [US5] Rename `.agents/skills/pokemon-overworld-generator`, `pokemon-structure-generator`, and `pokemon-map-generator` to `expedition-overworld-generator`, `expedition-structure-generator`, and `expedition-map-generator` (removing old folders) and rewrite their `SKILL.md` and `references/*.md` files for the 7 animated Realms and Gatekeeper maps
- [ ] T053 [US5] Update CLI docstrings, help descriptions, and default output paths across `tools/agy/`, `tools/units/`, `tools/skills/`, `tools/maps/`, `tools/ui/`, and `tools/items/` to match the renamed `expedition-*` skills and pass `tools/expedition/verify_skills_and_glossary.py`

**Checkpoint**: All 11 `expedition-*` skills, prompts, tools, and `GLOSSARY.md` pass `verify_skills_and_glossary.py` with `0` legacy terms and `0` broken links.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Audio feedback, security/static-guard tests, full bundle verification, and zero-regression workspace validation across all 10 existing game modes.

- [ ] T054 [P] Implement WebAudio synthesized SFX & realm ambient BGM cues (menu cursor tick, Timed Hit chime, metallic Parry spark, Break shatter, Boss phase roar, SSR Gacha fanfare) in `client/src/expedition/sound.ts`
- [ ] T055 [P] Write static path-traversal guard tests (`/database-astral-expedition`), asset manifest frame-count checks, and full Socket E2E journey tests in `server/test/expedition-assets-and-e2e.test.cjs`
- [ ] T056 [P] Document **Astral Expedition Pixel** gameplay controls, 7 Realms, Vertical Skill Menu, and optional `docker-compose.expedition.yml` Redis startup in `README.md`
- [ ] T057 Run `py tools/expedition/build_bundle.py`, `py tools/gen3/check_gen3.py --quiet database-astral-expedition`, `py tools/expedition/verify_bundle.py`, `npm run build`, and `npm test --prefix server` to verify `100%` pass rate across all `quickstart.md` quality gates

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Starts immediately (`0` dependencies).
- **Phase 2 (Foundational)**: Depends on Phase 1 — **BLOCKS** runtime stories `US1`–`US4`.
- **Phase 7 (`US5` — Skill/Prompt/Tool Domain Adaptation)**: Depends only on Phase 1 (`T003`). **Recommended execution**: Run immediately alongside Phase 2 (per Constitution Principle II) so `expedition-*` skills/prompts are active before generating full rosters in `US1`–`US4`.
- **Phase 3 (`US1` — Vertical Turn-Based Combat MVP, P1)**: Depends on Phase 2.
- **Phase 4 (`US2` — 7 Animated Realms & 20 Gatekeepers, P1)**: Depends on Phase 2; integrates seamlessly with `US1` battle transitions (`T031`).
- **Phase 5 (`US3` — 6 Regional Bosses & Aurora Final Boss, P2)**: Depends on `US1` battle engine (`T018`) and integrates with `US2` realm progression (`T029`).
- **Phase 6 (`US4` — 12-Hero Gacha, Hard Pity 80 & Squad Builder, P2)**: Depends on Phase 2 and `US1` hero/skill schema (`T014`).
- **Phase 8 (Polish & Cross-Cutting)**: Depends on completion of `US1`–`US5`.

### User Story Dependency Graph

```text
Phase 1 (Setup)
  ├──► Phase 7: US5 (Refactor 11 Skills / Prompts / Tools / Glossary) [Independent after Phase 1]
  └──► Phase 2 (Foundational: Shared Types, Docker Redis, Atomic JSON Store, Static Guard)
         ├──► Phase 3: US1 (Vertical Turn-Based Combat + Timed Hit + Parry MVP) [P1]
         │      ├──► Phase 5: US3 (6 Regional Bosses + Aurora Night-Sky Final Boss) [P2]
         │      └──► Phase 6: US4 (12-Hero Gacha + Hard Pity 80 + Party Upgrades) [P2]
         └──► Phase 4: US2 (7 Animated Realms + 20 Patrolling Gatekeepers) [P1]
                └──► (joins US3 & US4 into Phase 8 Polish & Full E2E Gate)
```

### Parallel Opportunities

- **Phase 1**: `T002`, `T003`, `T004` run in parallel on separate files.
- **Phase 2**: `T007` (Redis service), `T008` (JSON store), `T009` (Static guard), and `T012` (Client store/loader) run in parallel once `T006` (`types.ts`) completes; **US5 (`T047`–`T053`)** can run in parallel with Phase 2.
- **User Story 1 (`US1`)**: `T013` (tests), `T014` (starter data), `T015` (36f Hero sprites), `T016` (VFX & Meadow scene), and `T017` (UI kit) all run in parallel; `T020` (`battleRenderer.ts`), `T021` (`VerticalSkillMenu.tsx`), and `T022` (`TimingOverlay.tsx`) also run in parallel.
- **User Story 2 (`US2`)**: `T024` (tests), `T025` (7-realm & 20-gatekeeper JSON), `T026` (autotiles & 8f terrain strips), and `T027` (48f movement & 24f Gatekeeper sprites) all run in parallel.
- **User Story 3 (`US3`)**: `T032` (tests), `T033` (boss JSON), `T034` (`256×256` 36f Boss sheets), and `T035` (7 animated Boss Battle Scenes including Aurora Zenith) run in parallel.
- **User Story 4 (`US4`)**: `T038` (10k-pull Gacha tests), `T039` (9 Gacha Hero JSONs), `T040` (9 Hero `36f`/`48f` sprites + 45 skill VFX), and `T041` (26f Summon Orb) run in parallel; `T044` (`GachaModal.tsx`) and `T045` (`PartyModal.tsx`) run in parallel.

---

## Parallel Example: User Story 1 (MVP Combat Slice)

```bash
# 1. Parallel Asset & Data Batch for US1:
Task T014: "Author starter Hero data and 15 starter skills in data/expedition/heroes.json and data/expedition/skills.json"
Task T015: "Generate 192x192 6x6 (36-frame) BACK battle sheets for 3 starter Heroes in database-astral-expedition/units/"
Task T016: "Generate 15 starter skill VFX (8f CAST + 8f EFFECT) and 8f animated Meadow battle scene in database-astral-expedition/"
Task T017: "Generate chamfered pixel UI frames and Vietnamese glyph atlas in database-astral-expedition/ui/"

# 2. Parallel UI & Canvas Batch for US1 (after T018 engine):
Task T020: "Implement 60 FPS diagonal pixel battleRenderer.ts in client/src/expedition/battleRenderer.ts"
Task T021: "Implement Expedition 33-style VerticalSkillMenu.tsx in client/src/expedition/VerticalSkillMenu.tsx"
Task T022: "Implement two-way real-time TimingOverlay.tsx in client/src/expedition/TimingOverlay.tsx"
```

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 7 (`US5`) + Phase 2 + Phase 3 (`US1`))

1. Complete **Phase 1 (Setup)** and **Phase 7 (`US5` — Clean `expedition-*` Skills/Prompts/Tools)**.
2. Complete **Phase 2 (Foundational — Docker Redis + Atomic JSON Store + Static Guard)**.
3. Complete **Phase 3 (`US1` — Vertical Skill Menu + 36-Frame Diagonal Combat + Timed Hit & Parry)**.
4. **STOP & VALIDATE**: Play a complete 3-Hero turn-based battle from the lobby at 60 FPS and pass `expedition-battle-engine.test.cjs`.

### Incremental Full Campaign Delivery

1. **Increment 2 (`+ US2`)**: Add all 7 animated pixel Realms + 20 patrolling Gatekeepers → validate full traversal `01-dawn-meadow` → `07-aurora-zenith`.
2. **Increment 3 (`+ US3`)**: Add all 6 Regional Bosses + 3-Phase Final Boss `Astral Painter Seraphina` on the animated Aurora Night-Sky Spectrum arena.
3. **Increment 4 (`+ US4`)**: Add full 12-Hero `R/SR/SSR` Gacha banner, 26-frame Astral Orb animation, Hard Pity 80, and Squad/Skill upgrade modals.
4. **Increment 5 (`Phase 8`)**: Add synthesized pixel audio, security/E2E tests, and pass full monorepo build & regression checks (`SC-001`–`SC-008`).
