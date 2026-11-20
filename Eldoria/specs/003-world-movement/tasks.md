# Tasks: Open World Maps, Partitioning, Movement & Sync

**Input**: Design documents from `/specs/003-world-movement/`
**Prerequisites**: `001-foundation-game-engine`, `002-auth-character`, `plan.md`, `spec.md`, `data-model.md`, `contracts/world-movement-contract.md`

## Phase 1: Setup & Shared Collision Math

- [ ] T001 Define WebSocket movement, snapshot, portal, clock, and fast-travel DTOs in `packages/shared/src/contracts/world-movement.dto.ts`
- [ ] T002 [P] Implement shared AABB-vs-tilemap collision solver (`resolveCircleTileCollision`, `20x14` footbox on `32x32` grid) in `packages/shared/src/math/collision.ts`

## Phase 2: Foundational Map & Spatial Infrastructure

- [ ] T003 Implement `TiledMapLoader` reading `.tmj` JSON maps enforcing `WorldZone.zoneId`, `WorldZone.tiledMapPath`, `WorldZone.isSafeZone`, `WorldZone.widthTiles`, `WorldZone.heightTiles`, and `WorldZone.portals` per `data-model.md` in `apps/game-server/src/modules/world/tiled-map.loader.ts`
- [ ] T004 [P] Implement `SpatialHashGrid` (`256x256 px` cells, `5x5` cell interest query) in `apps/game-server/src/modules/world/spatial-hash-grid.ts`
- [ ] T005 [P] Implement `WorldRepository` persisting `WorldRegionState.regionId`, `WorldRegionState.currentSeason`, `WorldRegionState.seasonDay`, `WorldRegionState.dayTimeMinutes`, `WorldRegionState.currentWeather`, `WorldRegionState.weatherChangesAt`, and `WorldRegionState.zones` per `data-model.md` in `apps/game-server/src/modules/world/world.repository.ts`

## Phase 3: User Story 1 - Di chuyển Server-Authoritative & Đồng bộ Đa người chơi (Priority: P1) 🎯 MVP

**Goal**: Di chuyển 20 Hz server-authoritative với prediction/reconciliation 60 FPS và delta snapshot 10 Hz.
**Independent Test**: Pass `TS-WLD-001`, `TS-WLD-002`, `TS-WLD-003`, `SEC-009` với 2 kết nối WS đồng thời.

- [ ] T006 [US1] Implement `MovementService` validating `MOVE_INPUT` (`seq`, speed cap, sprint stamina, shared tile collision, violation scoring) and updating `PlayerPosition.x`, `PlayerPosition.y`, `PlayerPosition.facing` (dirty-marked, zero tick disk IO) per `data-model.md` in `apps/game-server/src/modules/movement/movement.service.ts`
- [ ] T007 [US1] Implement `SnapshotBroadcasterService` (`10 Hz` delta `entered/updated/left` via `SpatialHashGrid` + `SNAPSHOT_RESYNC_REQ` full fallback) in `apps/game-server/src/modules/movement/snapshot-broadcaster.service.ts`
- [ ] T008 [US1] Implement `MovementGateway` handling WS handshake auth, `PING/PONG`, `MOVE_INPUT`, `SNAPSHOT_RESYNC_REQ` in `apps/game-server/src/modules/movement/movement.gateway.ts`
- [ ] T009 [P] [US1] Implement Phaser `WorldScene`, `PredictionSystem` (`<6px` ignore / `6-48px` lerp / `>48px` snap), `InterpolationSystem` (`100ms` buffer), and `YSortDepthSystem` in `apps/client/src/game/scenes/WorldScene.ts` and `apps/client/src/game/systems/PredictionSystem.ts`
- [ ] T010 [US1] Add WebSocket movement, anti-speed/wall-hack, and spatial culling tests (`TS-WLD-001..003`, `SEC-009`) in `apps/game-server/tests/movement/movement.e2e-spec.ts`

## Phase 4: User Story 2 - Chuyển vùng Thế giới, Lãnh địa Riêng & Fast Travel (Priority: P1)

**Goal**: Chuyển Zone qua `ZonePortal`, quản lý `HomesteadInstance` tự flush/unload sau `60s` trống, và mở khóa Waypoint.
**Independent Test**: Di chuyển qua Village ↔ Homestead ↔ Forest, kiểm tra unload `60s` và flush JSON không mất tọa độ.

- [ ] T011 [US2] Implement `ZoneManagerService` validating `ZonePortal.portalId`, `ZonePortal.triggerRect`, `ZonePortal.targetZoneId`, `ZonePortal.targetSpawnX`, `ZonePortal.targetSpawnY`, and `ZonePortal.minLevelReq` per `data-model.md`, plus `60s` idle Homestead flush/unload in `apps/game-server/src/modules/world/zone-manager.service.ts`
- [ ] T012 [US2] Implement `PlayerPosition` transition persistence & safe fallback enforcing `PlayerPosition.regionId`, `PlayerPosition.zoneId`, `PlayerPosition.lastSafeZoneId`, `PlayerPosition.lastSafeX`, `PlayerPosition.lastSafeY`, and `PlayerPosition.unlockedWaypoints` per `data-model.md` in `apps/game-server/src/modules/world/zone-transition.service.ts`
- [ ] T013 [P] [US2] Implement client portal prefetch (`6 tiles` buffer) and `< 250 ms` transition fade handler in `apps/client/src/game/systems/ZoneTransitionClient.ts`
- [ ] T014 [US2] Add integration tests for portal transitions, safe-spawn fallback, and Homestead `60s` unload (`TS-WLD-004`) in `apps/game-server/tests/world/zone-partitioning.spec.ts`

## Phase 5: User Story 3 - Bản đồ Thế giới, Minimap, Ngày/Đêm & Thời tiết (Priority: P2)

**Goal**: Đồng bộ đồng hồ ngày/đêm 24 phút, 4 mùa 14 ngày, thời tiết khu vực và Fog of War bền vững.
**Independent Test**: 2 client cùng vùng nhận đồng bộ thời tiết `RAIN` và lưu đúng `discoveredFogCells` vào JSON nhân vật.

- [ ] T015 [US3] Implement `WorldClockService` (24-min day/night cycle, 14-day season rollover, regional weather transitions) emitting `WORLD_CLOCK_WEATHER` in `apps/game-server/src/modules/world/world-clock.service.ts`
- [ ] T016 [US3] Implement Fog of War discovery tracker updating `PlayerPosition.discoveredFogCells` per `data-model.md` and `POST /characters/:charId/fast-travel` endpoint in `apps/game-server/src/modules/world/world.controller.ts`
- [ ] T017 [P] [US3] Implement client Day/Night LUT tint, weather particle overlays, and Minimap/World Map Fog of War renderer in `apps/client/src/game/systems/FogOfWarSystem.ts`

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T018 Verify `StaggeredDirtyFlusher` persists `PlayerPosition` every `30s` and immediately on transition/disconnect without touching disk inside 20 Hz ticks
- [ ] T019 Run `quickstart.md` validation scenarios across `reg_greenhaven_village` and `reg_whispering_forest`
