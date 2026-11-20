# Implementation Plan: 10-Slot Equipment, Set Bonuses, Durability & Deterministic +0 to +10 Weapon Enhancement

**Branch**: `007-equipment-enhancement` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-equipment-enhancement/spec.md`

## Summary

Xây dựng `EquipmentModule` và `EnhancementModule` trên NestJS Modular Monolith cùng giao diện Equipment & Blacksmith Enhancement trên React/Phaser: (1) quản lý `10` ô trang bị (`MAIN_HAND`..`ACCESSORY`), kích hoạt động `6` bộ set (2-pc & 4-pc) và đồng bộ tức thì `DerivedCombatStats` + `combatRating`; (2) quản lý độ bền (`WORN` `50%` ở `0` không vỡ đồ), sửa chữa (`csm_repair_kit` `+50%` và `GOLD` tại Lò Rèn chiết khấu `0%/10%/20%/30%`), tách trang bị (Dismantling) và hook mở rộng Khảm ngọc M2+; và (3) động cơ **Cường hóa Vũ khí Chắc chắn `100%` `+0 → +10`** (trần cứng `+10`, `0%` vỡ/tụt cấp) khóa theo `bld_blacksmith` Lv 1..4, đặc quyền mốc `+5`/`+10` và cam kết đa tệp nguyên tử qua 1 JSON WAL ghi `characters`, `inventories`, `history/upgrade-history-<charId>.json` và `ledgers/currency-ledger-<YYYY-MM>.json`.

## Technical Context

**Language/Version**: TypeScript 5.x trên Node.js 22 LTS

**Primary Dependencies**: NestJS (`EquipmentModule`, `EnhancementModule`), Zod strict validation, `JsonDatabaseEngine` (`001`), `StatCalculator` (`004`), `InventoryService` & `EconomyService` (`005`), `GameCatalogLoader` (`game-data/items.json`, `game-data/buildings.json`, `weapon-upgrade-costs.csv`), React + Zustand (`useInventoryStore`, `EquipmentModal`, `BlacksmithEnhanceModal`), Phaser 3 (`WeaponAuraOverlay`)

**Storage**: 100% Local JSON Files (`data/db/characters/<charId>.json`, `data/db/inventories/<charId>.json`, `data/db/history/upgrade-history-<charId>.json`, `data/db/ledgers/currency-ledger-<YYYY-MM>.json`, read `data/db/houses/<charId>.json`) — ZERO PostgreSQL/TypeORM/SQLite/Redis/S3/Third-Party Services

**Testing**: Jest unit, concurrency & WAL crash-recovery integration tests (`TS-ENH-001..004`, `SEC-005`, `SEC-006`, `SEC-007`, `SEC-008`), Vitest CSV-vs-config parity tests

**Target Platform**: Desktop Web Browser + Self-Hosted NestJS Single-Node Server

**Project Type**: Monorepo Authoritative Progression & Blacksmith Feature

**Performance Goals**: Multi-file Enhancement WAL commit `p95 < 20 ms` ở 50 CCU (`proposed / unverified`); instant stat recalculation `< 1 ms` in RAM

**Constraints**: Hard cap `+10` (`0 <= enhancementLevel <= 10`); `100%` success rate, `false` break/downgrade risk in MVP; sorted 4-aggregate lock ordering; `idempotencyKey` `>= 24h`; zero item loss on full-bag unequip or `0` durability

**Scale/Scope**: All 40 weapons, 40 armor/accessories, 6 equipment sets (MVP 10 weapons, 12 equipment, 2 sets), full 10 enhancement tiers `+1..+10`, Blacksmith Lv 1–4 gates

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Nguyên tắc Hiến pháp | Pre-Design | Post-Design | Ghi chú |
| :--- | :---: | :---: | :--- |
| **I. JSON-Only Primary Database & Zero Third-Party Services** | PASS | PASS | 100% JSON WAL 4 tệp cục bộ (`characters`, `inventories`, `upgrade-history`, `currency-ledger`); 0 DB ngoài, 0 Redis |
| **II. Server-Authoritative & Anti-Cheat** | PASS | PASS | Server kiểm tra chủ sở hữu, `levelReq`, class, `bld_blacksmith` level, khóa 4 aggregate, `idempotencyKey` chống spam |
| **III. Data-Driven Single Source of Truth** | PASS | PASS | Đọc chuẩn `items.json` (6 sets), `buildings.json` (`bld_blacksmith` Lv 1–4) và `weapon-upgrade-costs.csv` |
| **IV. Modular Monolith & Decoupled Simulation** | PASS | PASS | Owning modules rõ ràng (`equipment`, `enhancement`); cập nhật nóng RAM combat qua `InternalEventBus` |
| **V. Classic 16-Bit Pixel-Perfect Visual Cohesion** | PASS | PASS | Hào quang `+5` (`Weapon Glow I`) và `+10` (`Radiant Aura II`) sắc nét pixel, không che Boss Telegraph |
| **VI. Fair Progression & Meaningful Loops** | PASS | PASS | Cam kết tuyệt đối `+0..+10` thành công `100%`, không vỡ, không tụt cấp; gắn kết Lò Rèn, Khai khoáng & Boss |
| **VII. Spec-Driven & Vertical-Slice MVP** | PASS | PASS | Hoàn thiện đầy đủ `+0..+10` ở MVP; khảm ngọc đặt hook sạch cho M2+ |
| **VIII. Verifiable Quality Gates & Evidence Integrity** | PASS | PASS | Mục tiêu độ trễ `p95 < 20 ms` và giờ cày gắn nhãn `proposed / unverified` |

## Project Structure

### Documentation (this feature)

```text
specs/007-equipment-enhancement/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── equipment-enhancement-contract.md
├── checklists/
│   ├── requirements.md
│   └── enhancement-rules.md
├── tasks.md
└── analysis-report.md
```

### Source Code (repository root — Planned Layout for Implementation Phase)

```text
packages/game-config/src/
└── enhancement-tiers.config.ts           # Nạp & kiểm chứng 10 bậc khớp weapon-upgrade-costs.csv
packages/shared/src/
├── equipment/
│   ├── set-bonus-calculator.ts           # Tính 2-pc & 4-pc cho 6 Equipment Sets + WORN 50% rule
│   └── weapon-enhancement-math.ts        # WeaponATK(e) + milestone +5/+10 perks
└── contracts/
    └── equipment-enhancement.dto.ts      # Strict Zod REST DTOs
apps/game-server/src/modules/
├── equipment/
│   ├── equipment.module.ts
│   ├── equipment.service.ts              # 10-slot equip/unequip, 2H rule, active hero compat, combatRating
│   ├── durability-repair.service.ts      # Durability decay, WORN 50%, csm_repair_kit, Blacksmith Gold discount
│   ├── dismantle.service.ts              # Salvage 30-50% materials, equipped guard, high-value confirmation
│   ├── socketing.roadmap.service.ts      # ISocketingService hook (M2+ locked in MVP)
│   └── equipment.controller.ts           # REST /equipment/*
└── enhancement/
    ├── enhancement.module.ts
    ├── enhancement.service.ts            # Deterministic +0..+10, bld_blacksmith Lv 1-4 gate, 4-file WAL
    ├── upgrade-history.repository.ts     # Append-only data/db/history/upgrade-history-<charId>.json
    └── enhancement.controller.ts         # REST /enhancement/upgrade & /history
apps/client/src/
├── ui/modals/
│   ├── EquipmentModal.tsx                # 10-slot paperdoll, 2-pc/4-pc set highlight, durability bar
│   └── BlacksmithEnhanceModal.tsx        # Before/After ATK preview, +5/+10 perks, 100% deterministic badge
└── game/systems/
    └── WeaponAuraOverlay.ts              # Pixel glow +5 (Weapon Glow I) & +10 (Radiant Aura II)
```

**Structure Decision**: Tách `EquipmentModule` (10-slot loadout, set bonus, durability/repair, dismantle, socketing hook) và `EnhancementModule` (deterministic `+0..+10` + `upgrade-history-*.json`) đúng theo bản đồ quyền sở hữu của `docs/architecture/backend-architecture.md`.

## Complexity Tracking

*Không có vi phạm Hiến pháp nào cần giải trình ngoại lệ.*
