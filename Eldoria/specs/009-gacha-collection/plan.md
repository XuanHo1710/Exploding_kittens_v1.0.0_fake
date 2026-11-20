# Implementation Plan: Fair In-Game Gacha, Pity & Hero/Weapon Collection System

**Branch**: `009-gacha-collection` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-gacha-collection/spec.md`

## Summary

Triển khai hệ thống **Gacha Nội tệ Công bằng & Sổ tay Bộ sưu tập** cho **Eldoria: Forgotten Wilds** gồm: (1) 2 Permanent Banner MVP (`bnr_perm_heroes` Soft/Hard Pity `65/80`, `bnr_perm_arsenal` Soft/Hard Pity `55/70`) và kiến trúc sẵn sàng cho 2 Limited Banner hậu MVP (`bnr_lim_storm_sovereign`, `bnr_lim_dragonforge`) với `sharedPityGroup` và `50/50 Featured Guarantee`, sử dụng **100% nội tệ `STARLIGHT_SHARD` (`160` đơn / `1,600` 10 lượt, ZERO thanh toán tiền thật trong MVP)**; (2) công cụ tính xác suất CSPRNG `crypto.randomInt` công khai tổng `1.000000` và bảo đảm `EPIC+` mỗi 10 lượt; (3) thực thi nguyên tử trong `AsyncLockManager` + 4-file JSON WAL commit (`characters`, `inventories`, `history/gacha-history-<id>.json`, `ledgers/currency-ledger-<YYYY-MM>.json`) chống 20 request song song; (4) chuyển đổi trùng lặp minh bạch (`Constellation 0..6`, tràn `C6` nhận đôi `STAR_ESSENCE` + `mat_starlight_dust`, vũ khí trùng giữ bản thể + `STAR_ESSENCE` + `CRAFTING_TOKEN`), Cửa hàng `STAR_ESSENCE` 16 ưu đãi theo tháng UTC và Sổ tay Bộ sưu tập React/Zustand không dark pattern.

## Technical Context

**Language/Version**: TypeScript 5.x trên Node.js 22 LTS (sử dụng Node built-in `node:crypto` `randomInt` & `createHash`)

**Primary Dependencies**: NestJS 11 (`gacha`, `character`, `inventory`, `economy` modules), Zod, React 19, Zustand, Tailwind CSS

**Storage**: 100% Local JSON File Database (`data/db/characters/<id>.json`, `data/db/inventories/<id>.json`, `data/db/history/gacha-history-<id>.json`, `data/db/ledgers/currency-ledger-<YYYY-MM>.json`) via `JsonDatabaseEngine` + Read-Only Static Catalog (`game-data/gacha-banners.json`, `game-data/characters.json`, `game-data/items.json`) — ZERO external DBMS / ZERO Redis / ZERO payment gateway / ZERO third-party services

**Testing**: Jest + Supertest (server CSPRNG 100k distribution test, pity 80/70, 50/50 limited guarantee, duplicate C0..C6 + overflow, monthly exchange cap, 20-concurrent pull race & WAL crash recovery tests), Vitest (client gacha modal, rate disclosure & codex tests)

**Target Platform**: Desktop Web Browser + Self-Hosted Localhost/Linux/Windows Node.js Server

**Project Type**: Monorepo Web Game (`apps/game-server`, `apps/client`, `packages/shared`, `packages/game-config`)

**Performance Goals**: Giao dịch quay `10` lượt đa tệp WAL commit `p95 < 60 ms` ở `50` CCU; tải lịch sử phân trang `< 15 ms` (`proposed / unverified`)

**Constraints**: Cấm `Math.random()`; cấm thanh toán tiền thật trong MVP (`realMoneyPurchaseEnabledInMvp: false`); tổng `baseRates === 1.000000`; bắt buộc `AsyncLockManager` sorted keys + WAL + `idempotencyKey`

**Scale/Scope**: 4 banner catalog (2 MVP active, 2 post-MVP limited), 12 heroes & 40 weapons trong Codex, 16 ưu đãi Cửa hàng `STAR_ESSENCE`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Nguyên tắc Hiến pháp | Kiểm tra Trước Thiết kế | Kiểm tra Sau Thiết kế (Phase 1) | Ghi chú |
| :--- | :---: | :---: | :--- |
| **I. JSON-Only Primary Database & Zero Third-Party Services** | PASS | PASS | 100% `data/db/**/*.json`, WAL 4 tệp, CSPRNG `node:crypto` nội bộ; 0 SQL, 0 Redis, 0 payment/VRF thứ ba |
| **II. Server-Authoritative & Anti-Cheat** | PASS | PASS | CSPRNG trên server, sorted `AsyncLockManager`, `idempotencyKey`, `rngAuditSeedHash`, `CurrencyLedger` |
| **III. Data-Driven Single Source of Truth** | PASS | PASS | Nạp 100% từ `game-data/gacha-banners.json`, fail-fast kiểm tra tổng `1.000000` & tham chiếu `chr_*`/`wpn_*` |
| **IV. Modular Monolith & Decoupled Simulation** | PASS | PASS | Module `gacha` độc lập trong NestJS; `GachaModal` & `CollectionCodexModal` React tách biệt khỏi Phaser |
| **V. Classic 16-Bit Pixel-Perfect Visual Cohesion** | PASS | PASS | Hoạt ảnh mở rương pixel 16-bit có nút Skip, không nhấp nháy gây hại thị giác, tôn trọng cài đặt trợ năng |
| **VI. Fair Progression & Meaningful Loops** | PASS | PASS | 100% nội tệ `STARLIGHT_SHARD`, công khai xác suất, pity minh bạch, đổi `STAR_ESSENCE`, không dark pattern, chơi full MVP không cần gacha |
| **VII. Spec-Driven & Vertical-Slice MVP** | PASS | PASS | Kích hoạt 2 Permanent Banner MVP, mở sẵn khung Limited Banner cho M2+; giữ `DESIGN_AND_PLANNING_ONLY` |
| **VIII. Verifiable Quality Gates & Evidence Integrity** | PASS | PASS | Kiểm chứng toán học 100k lượt; mục tiêu `p95 < 60 ms` gắn nhãn `proposed / unverified`; phủ 100% `Entity.field` |

## Project Structure

### Documentation (this feature)

```text
specs/009-gacha-collection/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── gacha-collection-contract.md
├── checklists/
│   ├── requirements.md
│   └── fair-gacha.md
├── tasks.md
└── analysis-report.md
```

### Source Code (repository root — Planned Layout for Implementation Phase)

```text
apps/
├── game-server/
│   ├── src/
│   │   └── modules/
│   │       └── gacha/
│   │           ├── schemas/gacha-state.schema.ts
│   │           ├── GachaHistoryRepository.ts
│   │           ├── GachaProbabilityEngine.ts
│   │           ├── DuplicateConversionService.ts
│   │           ├── StarEssenceShopService.ts
│   │           ├── CollectionCodexService.ts
│   │           ├── GachaService.ts
│   │           ├── GachaController.ts
│   │           └── gacha.module.ts
│   └── tests/
│       ├── gacha/gacha-probability.spec.ts
│       └── gacha/gacha-atomic-concurrency.spec.ts
└── client/
    ├── src/
    │   ├── stores/useGachaStore.ts
    │   └── ui/modals/
    │       ├── GachaModal.tsx
    │       ├── GachaRateDisclosureModal.tsx
    │       ├── GachaHistoryModal.tsx
    │       ├── StarEssenceShopModal.tsx
    │       └── CollectionCodexModal.tsx
    └── tests/gacha-ui.spec.ts
packages/
├── shared/
│   └── src/contracts/gacha-collection-contracts.ts
└── game-config/
    └── src/schemas/gacha-banner-catalog.schema.ts
```

**Structure Decision**: Đóng gói toàn bộ nghiệp vụ Gacha & Sưu tầm trong module domain `apps/game-server/src/modules/gacha/` theo `docs/architecture/backend-architecture.md`, sở hữu duy nhất `data/db/history/gacha-history-<charId>.json` và phối hợp ghi WAL cùng `character`, `inventory`, `economy`.

## Complexity Tracking

*Không có vi phạm Hiến pháp nào cần giải trình ngoại lệ.*
