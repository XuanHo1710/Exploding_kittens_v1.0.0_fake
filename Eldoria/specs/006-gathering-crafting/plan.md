# Implementation Plan: Resource Gathering & Multi-Station Crafting System

**Branch**: `006-gathering-crafting` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-gathering-crafting/spec.md`

## Summary

Triển khai hệ thống **Khai thác Tài nguyên Thế giới** (`TREE`, `STONE`, `ORE_VEIN`, `HERB_PATCH`, `FISHING_SPOT` trong `data/db/world/<regionId>.json`) và **Chế tạo Đa Trạm Nguyên tử** (đọc 36 công thức / 22 MVP từ nguồn chuẩn `game-data/recipes.json`) hoàn toàn trên hạ tầng **100% Local JSON Database (`JsonDatabaseEngine`)**. Server xác thực mọi kiểm định khoảng cách `<= 96 px`, bậc công cụ, Stamina, tái sinh node theo đồng hồ máy chủ, cấp công trình trạm, rút nguyên liệu tự động từ `bld_storage` Lv 2+, hàng đợi chế tạo, hoàn tiền hủy `80%` và ghi nguyên tử đa tệp qua JSON WAL + `CurrencyLedger`. Client tích hợp lớp hiển thị node pixel-perfect trong Phaser 3 và `CraftingModal` bằng React/Zustand qua `GameUiBridge`.

## Technical Context

**Language/Version**: TypeScript 5.x trên Node.js 22 LTS

**Primary Dependencies**: NestJS 11 (`world`, `crafting`, `inventory`, `economy`, `building` modules), Socket.IO / `ws`, Zod, React 19, Phaser 3, Zustand, Tailwind CSS

**Storage**: 100% Local JSON File Database (`data/db/world/<regionId>.json`, `data/db/characters/<id>.json`, `data/db/inventories/<id>.json`, `data/db/houses/<id>.json`, `data/db/ledgers/currency-ledger-<YYYY-MM>.json`, `data/db/audit/security-audit-<YYYY-MM-DD>.json`) qua `JsonDatabaseEngine` + Read-Only Catalog (`game-data/recipes.json`, `game-data/items.json`, `game-data/buildings.json`) — ZERO external DBMS / ZERO Redis / ZERO third-party services

**Testing**: Jest + Supertest (server gathering/crafting unit, concurrency & WAL crash recovery tests), Vitest (client crafting store & bridge tests)

**Target Platform**: Desktop Web Browser + Self-Hosted Localhost/Linux/Windows Node.js Server

**Project Type**: Monorepo Web Game (`apps/game-server`, `apps/client`, `packages/shared`, `packages/game-config`)

**Performance Goals**: Xử lý `INTERACT_REQ` khai thác trong RAM `< 5 ms`, REST `POST /crafting/execute` WAL commit `p95 < 100 ms` ở 50 CCU (`proposed / unverified`)

**Constraints**: Cấm ghi `world/<regionId>.json` trong tick 20 Hz; mọi thao tác kinh tế/nguyên liệu bắt buộc `AsyncLockManager` sorted keys + WAL + `idempotencyKey`; không hardcode bảng công thức

**Scale/Scope**: 5 loại `ResourceNodeState` trên các zone MVP (`reg_greenhaven_village`, `reg_whispering_forest`) và mở rộng 8 vùng; toàn bộ 36 công thức (`22` MVP) trong `game-data/recipes.json`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Nguyên tắc Hiến pháp | Kiểm tra Trước Thiết kế | Kiểm tra Sau Thiết kế (Phase 1) | Ghi chú |
| :--- | :---: | :---: | :--- |
| **I. JSON-Only Primary Database & Zero Third-Party Services** | PASS | PASS | 100% `data/db/**/*.json`, WAL đa tệp, anti-bot telemetry nội bộ; 0 DB ngoài, 0 Redis, 0 CAPTCHA thứ ba |
| **II. Server-Authoritative & Anti-Cheat** | PASS | PASS | Server kiểm tra `<= 96 px`, tool tier, stamina, station level, unlock, `idempotencyKey`, sorted locks & `CurrencyLedger` |
| **III. Data-Driven Single Source of Truth** | PASS | PASS | Đọc 100% công thức từ `game-data/recipes.json` (36 tổng / 22 MVP) và trạm từ `game-data/buildings.json` |
| **IV. Modular Monolith & Decoupled Simulation** | PASS | PASS | Node respawn chạy trong `ZoneInstance` RAM + dirty flush 30s; `CraftingModal` tách riêng khỏi Phaser 60 FPS |
| **V. Classic 16-Bit Pixel-Perfect Visual Cohesion** | PASS | PASS | Node bám lưới `32x32 px`, Y-sorted trong Phaser, hoạt ảnh 4 hướng chuẩn (`MINING`, `WOODCUTTING`, `FISHING`, `CRAFTING`) |
| **VI. Fair Progression & Meaningful Loops** | PASS | PASS | Kết nối chặt Gather → Craft → Cooking/Blacksmith/Enhancement; hoàn `80%` minh bạch khi hủy hàng đợi |
| **VII. Spec-Driven & Vertical-Slice MVP** | PASS | PASS | Tách độc lập `006`, ưu tiên 22 công thức MVP và node làng/rừng; giữ `DESIGN_AND_PLANNING_ONLY` |
| **VIII. Verifiable Quality Gates & Evidence Integrity** | PASS | PASS | Gắn nhãn rõ `proposed / unverified` cho độ trễ `p95 < 100 ms`; phủ đủ 100% `Entity.field` |

## Project Structure

### Documentation (this feature)

```text
specs/006-gathering-crafting/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── gathering-crafting-contract.md
├── checklists/
│   ├── requirements.md
│   └── crafting-rules.md
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
│   │       │   ├── schemas/resource-node.schema.ts
│   │       │   ├── ResourceNodeRepository.ts
│   │       │   ├── GatheringService.ts
│   │       │   ├── GatheringTelemetryGuard.ts
│   │       │   └── GatheringGatewayHandler.ts
│   │       └── crafting/
│   │           ├── schemas/crafting-job.schema.ts
│   │           ├── StationResolverService.ts
│   │           ├── CraftingBonusCalculator.ts
│   │           ├── CraftingService.ts
│   │           ├── CraftingController.ts
│   │           └── crafting.module.ts
│   └── tests/
│       ├── world/gathering.spec.ts
│       └── crafting/crafting-atomic.spec.ts
└── client/
    ├── src/
    │   ├── game/systems/ResourceNodeRenderSystem.ts
    │   ├── stores/useCraftingStore.ts
    │   └── ui/modals/CraftingModal.tsx
    └── tests/crafting-modal.spec.ts
packages/
├── shared/
│   └── src/contracts/gathering-crafting-contracts.ts
└── game-config/
    └── src/schemas/recipe-catalog.schema.ts
```

**Structure Decision**: Bổ sung module domain `crafting` và mở rộng module `world` trong `apps/game-server/src/modules/` tuân theo `docs/architecture/backend-architecture.md`, dùng chung hợp đồng trong `packages/shared` và schema catalog trong `packages/game-config`.

## Complexity Tracking

*Không có vi phạm Hiến pháp nào cần giải trình ngoại lệ.*
