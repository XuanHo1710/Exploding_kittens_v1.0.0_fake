# Implementation Plan: Open World Maps, Partitioning, Movement & Sync

**Branch**: `003-world-movement` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

## Summary

Xây dựng hạ tầng thế giới mở phân vùng (`WorldModule`, `MovementModule`): nạp bản đồ Tiled `.tmj` và lưới va chạm chia sẻ qua `packages/shared`, quản lý `ZoneInstance` mở và `HomesteadInstance` lazy-unload `60s`, mô phỏng di chuyển server-authoritative `20 Hz`, `SpatialHashGrid` (`256x256 px`, tầm `5x5` ô) phát delta snapshot `10 Hz`, đồng bộ chu kỳ ngày/đêm 24 phút & thời tiết/mùa, Fast Travel, Fog of War và lưu checkpoint JSON định kỳ `30s`.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 22 LTS)
**Primary Dependencies**: NestJS (`WorldModule`, `MovementModule`, WebSocket Gateway), Phaser 3 (`WorldScene`, `PredictionSystem`, `InterpolationSystem`), Tiled `.tmj` JSON parser, `packages/shared` collision math, `JsonDatabaseEngine`
**Storage**: `data/db/world/<regionId>.json` & `PlayerPosition` trong `data/db/characters/<characterId>.json` (100% Local JSON Primary DB, dirty-flag flush `30s`) + Ephemeral Zone Presence cache trong **Local Docker Redis** (`eldoria:presence:zone:<id>`) + Tiled `.tmj` & Extruded Tilesets từ **Local Docker MinIO** (`eldoria-assets/v1/`, fallback `/assets/maps/`) — ZERO External DB/Cloud
**Testing**: Jest WS integration tests (`TS-WLD-001..004`, `SEC-009`), Vitest shared collision tests
**Target Platform**: Desktop Web Browser + Self-Hosted Local Docker Compose Stack
**Project Type**: Monorepo Realtime Multiplayer Feature
**Performance Goals**: Tick `20 Hz` (`p99 < 25 ms`), Snapshot `10 Hz` (`<= 2 KB` avg delta ở 20 thực thể), Client `60 FPS` (`proposed / unverified`)
**Constraints**: Zero disk write inside 20 Hz tick; shared AABB collision between client & server; `extrude: 1px` tilesets & `roundPixels: true` integer camera (`013`) chống rách viền bản đồ
**Scale/Scope**: MVP 2 Regions (`reg_greenhaven_village`, `reg_whispering_forest`) + Private Homestead; kiến trúc sẵn sàng mở rộng đủ 8 Regions

## Constitution Check (Constitution v2.0.0)

| Nguyên tắc | Pre-Design | Post-Design (v2.0.0) | Ghi chú |
| :--- | :---: | :---: | :--- |
| **I. JSON-Only Primary DB + Local Docker Redis & MinIO** | PASS | PASS | `data/db/world/*.json` là primary DB; in-process `SpatialHashGrid` + Local Redis ephemeral presence; extruded maps/tilesets từ Local MinIO `eldoria-assets` |
| **II. Server-Authoritative & Anti-Cheat** | PASS | PASS | Server chỉ nhận vector hướng `dx, dy`, tự bước collision & chống speed/teleport |
| **III. Data-Driven Single Source of Truth** | PASS | PASS | Tiled `.tmj` là nguồn duy nhất cho địa hình, collision, portal, spawn |
| **IV. Modular Monolith & Decoupled Loop** | PASS | PASS | Tách 20 Hz tick, 10 Hz snapshot, 30s dirty flush và 60 FPS Phaser `WorldStateBuffer` |
| **V–VIII. Visual / Fair / Spec / Quality** | PASS | PASS | Y-sorting pixel `32x32` tile; metrics gắn nhãn `proposed/unverified` |

## Project Structure

```text
packages/shared/src/math/collision.ts
apps/game-server/src/modules/
├── world/{world.module.ts,world-clock.service.ts,zone-manager.service.ts,tiled-map.loader.ts,spatial-hash-grid.ts,world.repository.ts}
└── movement/{movement.module.ts,movement.service.ts,snapshot-broadcaster.service.ts,movement.gateway.ts}
apps/client/src/game/
├── scenes/WorldScene.ts
└── systems/{PredictionSystem.ts,InterpolationSystem.ts,YSortDepthSystem.ts,FogOfWarSystem.ts}
```

**Structure Decision**: Dùng chung `collision.ts` tại `packages/shared` giữa `MovementService` và `PredictionSystem`; quản lý `SpatialHashGrid` trong RAM từng `ZoneInstance`.

## Complexity Tracking

*Không có vi phạm Hiến pháp.*
