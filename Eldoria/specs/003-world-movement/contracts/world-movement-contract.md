# Interface Contracts: Open World Maps, Partitioning, Movement & Sync

**Feature**: `003-world-movement` | **Reference**: [`docs/architecture/websocket-contracts.md`](../../../docs/architecture/websocket-contracts.md)

## 1. WebSocket Events (`C2S` / `S2C`)
- `C2S PING { clientTs }` → `S2C PONG { clientTs, serverTs, serverTick }`
- `C2S MOVE_INPUT { seq, dx, dy, sprint, facing }` (max 25/s) → validated 20 Hz, acknowledged via `WORLD_SNAPSHOT.ackSeq`
- `C2S INTERACT_REQ { requestId, targetType: "PORTAL"|"WAYPOINT", targetId }` → `S2C ZONE_TRANSITION { regionId, zoneId, instanceId?, spawnX, spawnY, tiledMapKey }`
- `C2S SNAPSHOT_RESYNC_REQ { lastTick }` → `S2C WORLD_SNAPSHOT { isFull: true, ... }`
- `S2C WORLD_SNAPSHOT` (10 Hz delta): `{ tick, deltaBaseTick, isFull, ackSeq, self: { x, y, vx, vy, stamina, state }, entered[], updated[], left[] }`
- `S2C WORLD_CLOCK_WEATHER { regionId, currentSeason, seasonDay, dayTimeMinutes, currentWeather }`

## 2. REST Endpoints
- `GET /api/v1/world/regions` → Trả trạng thái công khai các khu vực đã mở khóa, mùa và thời tiết hiện tại.
- `POST /api/v1/characters/:charId/fast-travel` (Bearer + Owner) `{ waypointId }` → Kiểm tra đã mở trong `PlayerPosition.unlockedWaypoints` và ngoài combat → phát `ZONE_TRANSITION`.
