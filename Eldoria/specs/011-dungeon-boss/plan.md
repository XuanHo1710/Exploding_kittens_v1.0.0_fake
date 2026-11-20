# Implementation Plan: Instanced Dungeons, 10-State Monster AI & Multi-Phase Boss Encounters

**Branch**: `011-dungeon-boss` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-dungeon-boss/spec.md`

## Summary

Xây dựng trọn vẹn phân hệ Quái vật, AI, Hầm ngục riêng biệt và Boss nhiều giai đoạn 100% Server-Authoritative & Data-Driven trong Modular Monolith NestJS + Phaser 3: (1) `MonsterRosterLoader` & `MonsterAiEngine` nạp `30` Regular + `8` Elite (`8 + 1` MVP) từ `game-data/monsters.json`, vận hành 10-state AI FSM, Budgeted Octile A* (`<= 120` nodes), Threat Table 6 chế độ, multiplayer dynamic scaling và lưu bền vững đồng hồ hồi sinh Elite vào `data/db/world/<regionId>.json`; (2) `DungeonInstanceManager` quản lý vòng đời `DungeonInstanceRuntime` trong RAM cho `dng_mossroot_hollow` (MVP) và 4 Hầm ngục hậu MVP; (3) `BossEncounterController` nạp 5 Boss từ `game-data/bosses.json` (`boss_thornback_elder` 3 phase `100/65/30`, Poise Stagger `6.0s` / `x1.40`, `FIRE x1.50`, Enrage `360s`, 4 trụ `safePillars`, 1–4 player scaling lock, anti-exploit, revive cap 2 & wipe reset) cùng tầng vẽ Telegraph unlit `Depth 180–199` trên Phaser; và (4) `BossRewardDistributor` phát thưởng nguyên tử qua Multi-File JSON WAL với khóa First Clear cấp tài khoản, trần tuần `STARLIGHT_SHARD`/`BOSS_TOKEN` và tự chuyển đồ tràn túi sang `bld_storage`.

## Technical Context

**Language/Version**: TypeScript 5.x trên Node.js 22 LTS

**Primary Dependencies**: NestJS 11, Socket.IO / `ws`, Zod, `JsonDatabaseEngine` (từ `001`), `GameCatalogLoader` (`monsters.json`, `bosses.json`, `loot-tables.json`), Phaser 3 (`DungeonScene`, `TelegraphOverlayLayer`), Zustand (`useHudStore`)

**Storage**: Ephemeral In-Process RAM (`DungeonInstanceRuntime`, `ActiveMonsterRuntime`, `ActiveBossRuntime`, `ActiveTelegraphRuntime` — 0 disk I/O per 20 Hz tick) + 100% Local JSON Database (`data/db/world/<regionId>.json`, `data/db/characters/<characterId>.json`, `data/db/accounts/<accountId>.json`, `data/db/inventories/<characterId>.json`, `data/db/ledgers/currency-ledger-<YYYY-MM>.json`) — ZERO External DBMS/Redis/Third-Party Services

**Testing**: Jest (unit & integration tests cho 10-state FSM, Threat Table, Budgeted A*, 5-Boss data-driven headless simulation, Boss reward WAL atomicity & overflow-to-storage), Socket.IO/`ws` Integration Test Client (5s entry lock, out-of-arena rejection, revive cap, wipe reset), Vitest (client `TelegraphOverlayLayer` depth band `180-199` verification)

**Target Platform**: Self-Hosted Single-Node NestJS Server (Node.js 22 LTS) + Desktop Web Browser (Phaser 3 / React)

**Project Type**: Monorepo Web Game (`apps/game-server`, `apps/client`, `packages/shared`, `packages/game-config`)

**Performance Goals**: Mục tiêu ngân sách AI + Pathfinding `< 6 ms` mỗi tick `50 ms` cho tối đa `60` quái hoạt động/Zone (`proposed / unverified`), zero GC churn cho A* min-heap, `10 Hz` delta snapshot

**Constraints**: 100% thông số quái & Boss đọc từ `game-data/monsters.json` & `game-data/bosses.json` (cấm hardcode); cấm ghi đĩa trong tick `20 Hz`; Boss telegraph bắt buộc hiển thị ở Layer `180–199` unlit không bị VFX tầng `100000+` che khuất và `<= 3 flashes/s`

**Scale/Scope**: MVP triển khai đầy đủ `8` Regular + `1` Elite (`reg_greenhaven_village`, `reg_whispering_forest`) và `dng_mossroot_hollow` (`boss_thornback_elder`); khung data-driven hỗ trợ sẵn `30` Regular + `8` Elite + `5` Bosses đến cấp 100 (M2–M5)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Nguyên tắc Hiến pháp | Kiểm tra Trước Thiết kế | Kiểm tra Sau Thiết kế (Phase 1) | Ghi chú |
| :--- | :---: | :---: | :--- |
| **I. JSON-Only Primary Database & Zero Third-Party Services** | PASS | PASS | Ephemeral RAM cho 20 Hz AI/Dungeon; `world/`, `characters/`, `accounts/`, `inventories/`, `ledgers/` 100% JSON cục bộ |
| **II. Server-Authoritative & Anti-Cheat** | PASS | PASS | Server xác thực hitbox, mốc `executesAtMs`, rào chắn 5s, tọa độ arena, khóa First Clear cấp account, đóng góp `>= 5%` |
| **III. Data-Driven Single Source of Truth** | PASS | PASS | Nạp trực tiếp từ `game-data/monsters.json` & `game-data/bosses.json` (`100%/65%/30%`, `6000ms`, `x1.4`, `360s`) |
| **IV. Modular Monolith & Decoupled Simulation** | PASS | PASS | Chạy trong `SimulationLoop` 20 Hz, zero disk write trong tick, tự dọn RAM instance trống (`120s`/`300s`) |
| **V. Classic 16-Bit Pixel-Perfect Visual Cohesion** | PASS | PASS | Ground telegraph unlit Layer `180–199`, colorblind geometry, `<= 3 flashes/s`, sprite Boss `128x128..256x256` |
| **VI. Fair Progression & Meaningful Loops** | PASS | PASS | Thưởng Boss cá nhân công bằng, tự chuyển `bld_storage` khi đầy túi, reset sạch không mất đồ khi wipe |
| **VII. Spec-Driven & Vertical-Slice MVP** | PASS | PASS | Tập trung triển khai MVP `dng_mossroot_hollow` + `8+1` quái, cấu trúc mở sẵn cho 4 Dungeon M2–M5 |
| **VIII. Verifiable Quality Gates & Evidence Integrity** | PASS | PASS | Gắn nhãn `proposed / unverified` cho mục tiêu `< 6 ms` AI CPU; headless sim test cho đủ 5 Boss |

## Project Structure

### Documentation (this feature)

```text
specs/011-dungeon-boss/
├── spec.md                            # Feature specification + Clarifications
├── plan.md                            # This file
├── research.md                        # Phase 0 research decisions
├── data-model.md                      # Canonical RAM & JSON entities + 40 constrained fields
├── quickstart.md                      # End-to-end validation guide
├── contracts/
│   └── dungeon-boss-contract.md       # Service, WS & REST dungeon/boss contracts
├── checklists/
│   ├── requirements.md                # 16-item spec quality checklist (validated)
│   └── boss-encounter.md              # 12-item domain boss/AI review checklist
├── tasks.md                           # Dependency-ordered implementation tasks
└── analysis-report.md                 # Cross-artifact /speckit-analyze audit
```

### Source Code (repository root — Planned Layout for Implementation Phase)

```text
packages/shared/src/
└── contracts/
    └── dungeon-boss-contracts.ts      # Shared WS/REST schemas cho Telegraph, BossState, Lockouts, Rewards

apps/game-server/src/
└── modules/
    ├── monster-ai/
    │   ├── monster-ai.module.ts
    │   ├── schemas/
    │   │   └── elite-respawn.schema.ts
    │   ├── NavGridPathfinder.ts       # Octile A* (<= 120 nodes, pooled MinHeap, LOS, separation, stuck recovery)
    │   ├── ThreatTableService.ts      # 6 targetPriority modes, Tank 1.6x, Taunt 3.0x/4s, overheal=0, hysteresis
    │   ├── MonsterRosterLoader.ts     # Loads 30 Regular + 8 Elite from game-data/monsters.json
    │   ├── EliteRespawnStore.ts       # Persists Elite timers in data/db/world/<regionId>.json
    │   └── MonsterAiEngine.ts         # 10-state FSM + sleeping 1024px + multiplayer scaling + summoned minion cap
    └── dungeon-boss/
        ├── dungeon-boss.module.ts
        ├── schemas/
        │   └── boss-lockout.schema.ts
        ├── DungeonInstanceManager.ts  # RAM lifecycle (OPEN/BOSS_LOCKED/CLEARED/RESETTING/CLOSED, 120s/300s GC)
        ├── TelegraphScheduler.ts      # Startup->Active execution + cancellation on Stagger/Death
        ├── BossEncounterController.ts # 5-Boss data-driven controller (phases, pillars, hazards, poise, enrage, anti-exploit)
        ├── BossReviveWipeService.ts   # 30s Downed, 2-revive cap (csm_revive_feather), full wipe reset
        ├── BossRewardDistributor.ts   # Atomic WAL rewards, account First Clear, UTC Monday weekly caps, bag->storage overflow
        ├── DungeonLockoutController.ts# GET /api/v1/characters/:charId/dungeons/lockouts
        └── DungeonRealtimeGateway.ts  # WS handlers (DUNGEON_LEAVE_REQ, ALLY_REVIVE_REQ, PILLAR_INTERACT_REQ)
apps/game-server/tests/
├── monster-ai/
│   ├── monster-ai-fsm.spec.ts
│   └── pathfinding-threat.spec.ts
└── dungeon-boss/
    ├── boss-thornback-encounter.spec.ts
    ├── boss-rewards-anti-exploit.spec.ts
    └── five-boss-headless-sim.spec.ts

apps/client/src/
├── game/
│   ├── scenes/
│   │   └── DungeonScene.ts
│   └── systems/
│       └── TelegraphOverlayLayer.ts   # Depth 180-199 unlit ground telegraph + colorblind dashed/crosshatch mode
└── ui/
    ├── hud/
    │   └── BossHpPoiseBar.tsx         # Boss HP, Poise, Phase badge, Enrage countdown, Weakness element
    └── modals/
        └── BossRewardModal.tsx        # SCR-22 Victory stats, personal loot & storage overflow notice
```

**Structure Decision**: Chia rõ 2 module nội bộ trong Modular Monolith NestJS (`monster-ai` dùng chung cho Open World và Dungeon; `dungeon-boss` quản lý vòng đời `DungeonInstanceRuntime`, Boss multi-phase và thưởng WAL) kết nối chặt với `DungeonScene` / `TelegraphOverlayLayer` (Phaser 3) và `BossHpPoiseBar` / `BossRewardModal` (React).

## Complexity Tracking

*Không có vi phạm Hiến pháp nào cần giải trình ngoại lệ.*
