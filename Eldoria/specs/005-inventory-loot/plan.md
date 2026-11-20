# Implementation Plan: Authoritative Inventory, Ground Loot & Atomic Currency Ledger

**Branch**: `005-inventory-loot` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-inventory-loot/spec.md`

## Summary

Xây dựng 3 module kinh tế-vật phẩm lõi (`InventoryModule`, `LootModule`, `EconomyModule`) và lớp UI/HUD tương ứng (`useInventoryStore`, `GroundLootRenderer`): (1) quản lý kho đồ phân mảnh theo nhân vật tại `data/db/inventories/<charId>.json` (`40–120` ô túi, `0–200` ô rương) với `ItemInstance` mang `UUIDv7` toàn cục và kiểm tra bất biến chống nhân bản; (2) quản lý `GroundLoot` thuần RAM (`120s` TTL, mặc định `PERSONAL_INSTANCED`, tầm nhặt `<= 96 px`, CSPRNG 4 bước từ `62` bảng rơi đồ chuẩn `game-data/loot-tables.json`); và (3) động cơ ví + sổ cái 5 loại tiền tệ bất biến (`data/db/ledgers/currency-ledger-YYYY-MM.json`) cam kết nguyên tử qua JSON WAL + khóa sắp xếp `AsyncLockManager` + `idempotencyKey`.

## Technical Context

**Language/Version**: TypeScript 5.x trên Node.js 22 LTS

**Primary Dependencies**: NestJS (`InventoryModule`, `LootModule`, `EconomyModule`, WebSocket `/game`), Node `crypto` CSPRNG & UUIDv7 generator, Zod strict validation, `JsonDatabaseEngine` (`001-foundation-game-engine`), `GameCatalogLoader` (`game-data/items.json`, `game-data/loot-tables.json`), Phaser 3 (`GroundLootPool`), React + Zustand (`useInventoryStore`)

**Storage**: 100% Local JSON Files (`data/db/inventories/<charId>.json`, `data/db/ledgers/currency-ledger-<YYYY-MM>.json`, `Character.currencies` trong `data/db/characters/<charId>.json`) + Ephemeral RAM `GroundLoot` trong `ZoneInstance` — ZERO PostgreSQL/TypeORM/SQLite/Redis/S3/Third-Party Services

**Testing**: Jest unit, concurrency, anti-duplication & WAL crash recovery tests (`SEC-005`, `SEC-006`, `SEC-007`, `SEC-008`, `SEC-011`), Vitest invariant tests

**Target Platform**: Desktop Web Browser + Self-Hosted NestJS Single-Node Server

**Project Type**: Monorepo Authoritative Economy & Inventory Feature

**Performance Goals**: Atomic inventory/ledger WAL commit `p95 < 15 ms` ở 50 CCU (`proposed / unverified`); `0` disk writes while `GroundLoot` sits on map; `GroundLoot` pool `60 FPS` client

**Constraints**: Canonical lock ordering (`character:<id>`, `inventory:<id>`, `ledger:<YYYY-MM>`); `balanceBefore + delta === balanceAfter >= 0`; `idempotencyKey` retention `>= 24h`; strict ownership & `<= 96 px` range checks

**Scale/Scope**: Full 157-item catalog, 62 loot tables (18 MVP), 5 canonical currencies, reusable internal transaction APIs for features `006`–`011`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Nguyên tắc Hiến pháp | Pre-Design | Post-Design | Ghi chú |
| :--- | :---: | :---: | :--- |
| **I. JSON-Only Primary Database & Zero Third-Party Services** | PASS | PASS | `inventories/*.json`, `ledgers/currency-ledger-YYYY-MM.json`, WAL JSON cục bộ; 0 DB ngoài, 0 Redis |
| **II. Server-Authoritative & Anti-Cheat** | PASS | PASS | CSPRNG server loot, `PERSONAL_INSTANCED`, `<= 96 px` check, `claimed` lock, `idempotencyKey`, chống âm/IDOR/nhân bản |
| **III. Data-Driven Single Source of Truth** | PASS | PASS | Đọc chuẩn `game-data/items.json` (157 items) và `game-data/loot-tables.json` (62 tables) |
| **IV. Modular Monolith & Decoupled Simulation** | PASS | PASS | `GroundLoot` chạy 100% RAM zone; chỉ ghi JSON khi nhặt/chuyển/bán; client cập nhật qua `INVENTORY_PATCH` |
| **V. Classic 16-Bit Pixel-Perfect Visual Cohesion** | PASS | PASS | Icon loot rơi theo màu rarity chuẩn pixel, object pooling tránh GC |
| **VI. Fair Progression & Meaningful Loops** | PASS | PASS | Chống cướp đồ Co-op (`PERSONAL_INSTANCED`), giữ nguyên đồ trên đất khi đầy túi, minh bạch 5 tiền tệ |
| **VII. Spec-Driven & Vertical-Slice MVP** | PASS | PASS | Khóa đồ MVP (`bound: true`), tập trung 18 bảng rơi đồ MVP trên động cơ hỗ trợ đủ 62 bảng |
| **VIII. Verifiable Quality Gates & Evidence Integrity** | PASS | PASS | Ghi rõ độ trễ ghi là `proposed / unverified` và phương án chia ledger theo ngày nếu vượt ngưỡng |

## Project Structure

### Documentation (this feature)

```text
specs/005-inventory-loot/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── inventory-loot-contract.md
├── checklists/
│   ├── requirements.md
│   └── economy-integrity.md
├── tasks.md
└── analysis-report.md
```

### Source Code (repository root — Planned Layout for Implementation Phase)

```text
packages/shared/src/
├── utils/
│   └── uuidv7.ts                        # Monotonic UUIDv7 dùng Node crypto (zero external deps)
├── inventory/
│   └── inventory-invariants.ts          # assertInventoryInvariants + stack/slot math
└── contracts/
    └── inventory-loot.dto.ts            # Strict Zod REST & WS schemas (qty >= 1)
apps/game-server/src/modules/
├── economy/
│   ├── economy.module.ts
│   ├── economy.service.ts               # applyLedgerDeltaInTx cho 5 currencies + reconciliation
│   ├── currency-ledger.repository.ts    # Append-only data/db/ledgers/currency-ledger-YYYY-MM.json
│   └── economy.controller.ts            # GET /economy/ledger
├── inventory/
│   ├── inventory.module.ts
│   ├── inventory.service.ts             # move, swap, split, sort, bag<->storage, quick-use, NPC sell
│   ├── inventory.repository.ts          # data/db/inventories/<charId>.json
│   └── inventory.controller.ts          # REST endpoints + OwnershipGuard + Idempotency
└── loot/
    ├── loot.module.ts
    ├── loot-roller.service.ts           # CSPRNG 4-step roll + LUK cap +25%
    ├── ground-loot.manager.ts           # RAM TTL 120s, atomic claimed flag, <= 96px check
    └── loot.gateway.ts                  # WS LOOT_PICKUP_REQ & INVENTORY_QUICK_USE
apps/client/src/
├── game/systems/
│   └── GroundLootPool.ts                # Object-pooled pixel loot drops + rarity glow
├── stores/
│   └── useInventoryStore.ts             # Áp INVENTORY_PATCH vào Bag/Storage/Currencies
└── ui/modals/
    └── InventoryModal.tsx               # Drag/click move, split, sort, quick-use, storage tab
```

**Structure Decision**: Chia rõ 3 owning modules (`economy`, `inventory`, `loot`) theo đúng `docs/architecture/backend-architecture.md` để mọi feature kinh tế phía sau (`006`–`011`) tái sử dụng chung `IEconomyService` và `IInventoryService` trong cùng `JsonTxContext`.

## Complexity Tracking

*Không có vi phạm Hiến pháp nào cần giải trình ngoại lệ.*
