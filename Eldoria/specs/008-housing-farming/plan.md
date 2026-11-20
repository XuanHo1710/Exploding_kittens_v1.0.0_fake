# Implementation Plan: Survival, Farming, Animal Husbandry & Homestead Building System

**Branch**: `008-housing-farming` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-housing-farming/spec.md`

## Summary

Triển khai trọn bộ hệ thống **Sinh tồn** (`Hunger 0..100`, Stamina, tối đa `2` Food Buff, `WorldClockService` 24 phút/ngày & 14 ngày/mùa), **Nông trại** (`15` giống / `5` MVP từ `game-data/crops.json`), **Chăn nuôi** (`6` loài / `2` MVP từ `game-data/animals.json`, sàn `health >= 20` không chết vĩnh viễn), **Mô phỏng Ngoại tuyến 100% theo Đồng hồ Máy chủ trần `24 giờ`** (`OfflineHomesteadSimulator`), và **Xây dựng Lãnh địa** (`13` công trình / `6` MVP từ `game-data/buildings.json` gồm `bld_blacksmith` Lv 1..4) lưu trữ hoàn toàn trên tệp JSON cục bộ `data/db/houses/<characterId>.json` và `data/db/world/world-clock.json` thông qua `JsonDatabaseEngine`. Client bổ sung `BuildingGhostSystem` (`32x32` grid snapping + xoay hướng) trong Phaser 3 cùng các modal quản lý React/Zustand tách biệt khỏi vòng 60 FPS.

## Technical Context

**Language/Version**: TypeScript 5.x trên Node.js 22 LTS

**Primary Dependencies**: NestJS 11 (`building`, `farming`, `animal`, `world`, `character`, `inventory`, `economy` modules), Socket.IO / `ws`, Zod, React 19, Phaser 3, Zustand, Tailwind CSS

**Storage**: 100% Local JSON File Database (`data/db/houses/<characterId>.json`, `data/db/characters/<characterId>.json`, `data/db/inventories/<characterId>.json`, `data/db/world/world-clock.json`, `data/db/ledgers/currency-ledger-<YYYY-MM>.json`, `data/db/audit/security-audit-<YYYY-MM-DD>.json`) + Read-Only Catalog (`game-data/crops.json`, `game-data/animals.json`, `game-data/buildings.json`, `game-data/items.json`) — ZERO external DBMS / ZERO Redis / ZERO third-party services

**Testing**: Jest + Supertest (server offline 24h catch-up, clock tampering, BFS placement, starvation safety, party permissions, concurrency & WAL recovery tests), Vitest (client ghost preview & homestead store tests)

**Target Platform**: Desktop Web Browser + Self-Hosted Localhost/Linux/Windows Node.js Server

**Project Type**: Monorepo Web Game (`apps/game-server`, `apps/client`, `packages/shared`, `packages/game-config`)

**Performance Goals**: Offline catch-up 24h (`36` tiles + `24` animals) & `32×24` BFS reachability `< 10 ms` trong RAM; REST homestead mutation WAL commit `p95 < 50 ms` ở 50 CCU (`proposed / unverified`)

**Constraints**: Cấm chạy timer nền cho lãnh địa offline; 100% đồng hồ server (`Date.now()`); không chết vĩnh viễn; mọi mutation dùng `AsyncLockManager` sorted keys + WAL + `idempotencyKey`

**Scale/Scope**: 15 crops (5 MVP), 6 animals (2 MVP), 13 buildings (6 MVP), lưới lãnh địa `32×24 tiles` hỗ trợ chủ nhà + tối đa 3 thành viên Party đồng thời

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Nguyên tắc Hiến pháp | Kiểm tra Trước Thiết kế | Kiểm tra Sau Thiết kế (Phase 1) | Ghi chú |
| :--- | :---: | :---: | :--- |
| **I. JSON-Only Primary Database & Zero Third-Party Services** | PASS | PASS | 100% `data/db/houses/<id>.json` & `world-clock.json`, WAL JSON, 0 SQL/Redis/S3 |
| **II. Server-Authoritative & Anti-Cheat** | PASS | PASS | 100% server clock (cap 24h), 7-layer + BFS placement validation, strict `OWNER_ONLY` vs `PARTY_ACCESS`, sorted locks |
| **III. Data-Driven Single Source of Truth** | PASS | PASS | Đọc 100% từ `game-data/crops.json`, `animals.json`, `buildings.json`, `items.json` |
| **IV. Modular Monolith & Decoupled Simulation** | PASS | PASS | Lazy catch-up (không tick offline), Phaser `BuildingGhostSystem` tách khỏi React `useHomesteadStore` |
| **V. Classic 16-Bit Pixel-Perfect Visual Cohesion** | PASS | PASS | Bắt buộc lưới `32x32 px`, Y-sorting, 43 `assetVariantKey`, bong bóng trạng thái diegetic không nhấp nháy gắt |
| **VI. Fair Progression & Meaningful Loops** | PASS | PASS | Nông sản/chăn nuôi → Food Buff & `bld_blacksmith` Lv 1..4 → `+10`; không chết vĩnh viễn; không trả tiền skip timer |
| **VII. Spec-Driven & Vertical-Slice MVP** | PASS | PASS | Ưu tiên 5 crops, 2 animals, 6 buildings MVP nhưng kiến trúc mở sẵn đủ 15/6/13; giữ `DESIGN_AND_PLANNING_ONLY` |
| **VIII. Verifiable Quality Gates & Evidence Integrity** | PASS | PASS | Gắn nhãn `proposed / unverified` cho mục tiêu `< 10 ms` & `p95 < 50 ms`; phủ 100% `Entity.field` |

## Project Structure

### Documentation (this feature)

```text
specs/008-housing-farming/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── housing-farming-contract.md
├── checklists/
│   ├── requirements.md
│   └── homestead-farming.md
├── tasks.md
└── analysis-report.md
```

### Source Code (repository root — Planned Layout for Implementation Phase)

```text
apps/
├── game-server/
│   ├── src/
│   │   └── modules/
│   │       ├── world/
│   │       │   ├── schemas/world-clock.schema.ts
│   │       │   └── WorldClockService.ts
│   │       ├── character/
│   │       │   ├── schemas/survival-state.schema.ts
│   │       │   └── SurvivalService.ts
│   │       ├── building/
│   │       │   ├── schemas/homestead.schema.ts
│   │       │   ├── HomesteadRepository.ts
│   │       │   ├── BuildingPlacementValidator.ts
│   │       │   ├── HomesteadPermissionGuard.ts
│   │       │   ├── OfflineHomesteadSimulator.ts
│   │       │   ├── BuildingService.ts
│   │       │   ├── HomesteadController.ts
│   │       │   └── building.module.ts
│   │       ├── farming/
│   │       │   ├── FarmingService.ts
│   │       │   ├── FarmingController.ts
│   │       │   └── farming.module.ts
│   │       └── animal/
│   │           ├── AnimalService.ts
│   │           ├── AnimalController.ts
│   │           └── animal.module.ts
│   └── tests/
│       ├── farming/farming-offline.spec.ts
│       ├── building/building-placement-bfs.spec.ts
│       └── animal/animal-husbandry.spec.ts
└── client/
    ├── src/
    │   ├── game/systems/BuildingGhostSystem.ts
    │   ├── game/systems/HomesteadRenderSystem.ts
    │   ├── stores/useHomesteadStore.ts
    │   ├── ui/hud/SurvivalClockHud.tsx
    │   └── ui/modals/
    │       ├── BuildingModal.tsx
    │       ├── FarmManageModal.tsx
    │       └── AnimalCoopModal.tsx
    └── tests/homestead-ghost.spec.ts
packages/
├── shared/
│   └── src/contracts/housing-farming-contracts.ts
└── game-config/
    └── src/schemas/homestead-catalog.schema.ts
```

**Structure Decision**: Bố trí theo 3 domain module độc lập `building`, `farming`, `animal` (phối hợp với `world` và `character`) trong `apps/game-server/src/modules/` theo đúng `docs/architecture/backend-architecture.md`, dùng chung `HomesteadRepository` (`data/db/houses/<charId>.json`) để đảm bảo ranh giới khóa aggregate nhất quán.

## Complexity Tracking

*Không có vi phạm Hiến pháp nào cần giải trình ngoại lệ.*
