# Interface Contracts: Survival, Farming, Animal Husbandry & Homestead Building System

**Feature**: `008-housing-farming`  
**Transport**: Self-Hosted NestJS REST `/api/v1` (Homestead Load, Building Lifecycle, Animal Buy/Reassign/Sell, Farming/Animal Actions) + WebSocket Namespace `/game` (Realtime Sync & World Clock)

---

## 1. REST API Contracts (`houses/<characterId>.json`)

Mọi yêu cầu `POST`/`PATCH`/`DELETE` yêu cầu `Authorization: Bearer <accessToken>` và `X-Idempotency-Key: <UUIDv4>`.

### 1.1 `GET /api/v1/characters/:charId/homestead`
- **Authorization**: `ownerCharacterId === callerCharId` HOẶC thành viên cùng `Party` đang có mặt trong lãnh địa.
- **Behavior**: Tự động kích hoạt `OfflineHomesteadSimulator.catchUp(charId, Date.now())` (cap `24 giờ`), ghi nguyên tử nếu trạng thái thay đổi, rồi trả toàn bộ `HomesteadAggregate` + `WorldClockState` hiện tại.

### 1.2 `POST /api/v1/characters/:charId/buildings/place`
- **Authorization**: `OWNER_ONLY`.
- **Request Body**:
  ```json
  {
    "buildingId": "bld_blacksmith",
    "originTileX": 20,
    "originTileY": 7,
    "rotation": 0
  }
  ```
- **Server Validation (7 Layers)**: Ownership → Allowed Zone & `maxHomesteadBuildings` & `unlockPlayerLevel` → Static Forbidden/Road/Spawn/Quest Mask → Existing Footprint Overlap → BFS Flood-Fill Reachability to all `interactionPoints` → Atomic WAL deduction (Gold + Materials, hỗ trợ `autoCraftPull` khi `bld_storage.level >= 2`) → Set `UNDER_CONSTRUCTION` & `completesAt`.
- **Response `201 Created`**: `{ ok: true, data: { buildingInstance, currencies, inventoryRevision }, serverTime }`.

### 1.3 `POST /api/v1/characters/:charId/buildings/:bldInstId/upgrade`
- **Authorization**: `OWNER_ONLY`.
- **Validation**: `status === "ACTIVE"`, `level < maxLevel`, đủ `unlockPlayerLevel`, đủ Gold & nguyên liệu (kể cả `bld_storage` Lv 2+).
- **Response `200 OK`**: Chuyển `status = "UPGRADING"`, cập nhật `completesAt`, ghi WAL + `CurrencyLedger` (`BUILDING_UPGRADE`).

### 1.4 `POST /api/v1/characters/:charId/buildings/:bldInstId/move` & `PATCH .../permission` & `DELETE .../:bldInstId`
- `move`: `{ originTileX, originTileY, rotation }` — chạy lại đủ 7 lớp kiểm định + đẩy nhẹ thực thể đang đứng trên ô đích sang ô an toàn gần nhất.
- `permission`: `{ permissionMode: "OWNER_ONLY" | "PARTY_ACCESS" | "GUILD_ACCESS" }` — từ chối nếu công trình khóa cứng `OWNER_ONLY` (`bld_player_house`, `bld_storage`, `bld_blacksmith`).
- `DELETE` (`?mode=CANCEL|DEMOLISH`): `CANCEL` hoàn `80%` khi `UNDER_CONSTRUCTION`/`UPGRADING`; `DEMOLISH` hoàn `50%` khi `ACTIVE` và rỗng tài sản; cấm phá `bld_player_house`.

### 1.5 `POST /api/v1/characters/:charId/farming/action`
- **Authorization**: `OWNER_ONLY` cho `TILL | PLANT | FERTILIZE | HARVEST | CLEAR`; cho phép `PARTY_ACCESS` đối với `WATER`.
- **Request Body**:
  ```json
  {
    "buildingInstanceId": "binst_farm_01",
    "action": "TILL | PLANT | WATER | FERTILIZE | HARVEST | CLEAR",
    "tileX": 0,
    "tileY": 0,
    "itemId": "sed_sunwheat"
  }
  ```
- **Response `200 OK`**: `{ ok: true, data: { tile, staminaLeft, hunger, farmingExpDelta, inventoryDelta } }`.
- **Extra Toggle**: `PATCH /api/v1/characters/:charId/farming/:bldInstId/automation` (`OWNER_ONLY`) bật/tắt `autoIrrigationEnabled` (Lv 3+) hoặc `autoHarvestEnabled` (Lv 4+).

### 1.6 `POST /api/v1/characters/:charId/animals/action`
- **Authorization**: `OWNER_ONLY` cho `BUY | COLLECT | RENAME | REASSIGN | SELL`; cho phép `PARTY_ACCESS` đối với `FEED | PET | HEAL`.
- **Request Body**:
  ```json
  {
    "action": "BUY | FEED | PET | COLLECT | HEAL | RENAME | REASSIGN | SELL",
    "animalId": "anm_meadow_chicken",
    "animalInstanceId": "ainst_01",
    "targetBuildingInstanceId": "binst_coop_01",
    "feedItemId": "mat_sunwheat_grain",
    "nickname": "Bông Vàng"
  }
  ```
- **Response `200 OK`**: `{ ok: true, data: { animalInstance, currencies, inventoryDelta } }`.

### 1.7 `POST /api/v1/characters/:charId/survival/consume`
- **Authorization**: `OWNER_ONLY`.
- **Request Body**: `{ "itemInstanceId": "iinst_01" }`
- **Response `200 OK`**: Cập nhật `hunger`, `hungerState`, `stamina`, `hp/mp`, `activeFoodBuffs[0..2]` (áp dụng bonus cấp `bld_kitchen` & phẩm chất `SILVER`/`GOLD`), `lastFoodConsumedAt`.

### 1.8 Error Codes
- `403 ERR_FORBIDDEN_OWNERSHIP` / `ERR_FORBIDDEN_NOT_OWNER`
- `409 ERR_PLACEMENT_COLLISION` / `ERR_PLACEMENT_FORBIDDEN_ZONE` / `ERR_INTERACTION_POINT_UNREACHABLE` / `ERR_MAX_BUILDINGS_REACHED`
- `409 ERR_CANNOT_DEMOLISH_PLAYER_HOUSE` / `ERR_BUILDING_NOT_EMPTY` (`storage`/`crops`/`animals`)
- `409 ERR_CROP_OUT_OF_SEASON` / `ERR_FARMING_LEVEL_TOO_LOW` / `ERR_TILE_ALREADY_FERTILIZED` / `ERR_TILE_ALREADY_WATERED`
- `409 ERR_HOUSING_FULL` / `ERR_ANIMAL_ALREADY_FULL` (`hunger >= 90`) / `ERR_NO_PENDING_PRODUCE`
- `409 ERR_FOOD_ON_COOLDOWN` / `ERR_INSUFFICIENT_STAMINA` / `ERR_INSUFFICIENT_FUNDS` / `ERR_INSUFFICIENT_MATERIALS` / `ERR_INVENTORY_FULL`

---

## 2. WebSocket Realtime Events (`/game`)

- **Server → Client `WORLD_CLOCK_SYNC`** (mỗi 60s thực hoặc khi chuyển pha/thời tiết/mùa): `{ currentDay, currentSeason, dayPhase, minuteOfDay, weatherByRegion, serverTime }`.
- **Server → Client `HOMESTEAD_BUILDING_UPDATED`** / `HOMESTEAD_BUILDING_REMOVED`: Đồng bộ tới mọi client đang ở trong `zon_player_homestead`.
- **Server → Client `FARM_TILE_UPDATED`** / `ANIMAL_STATE_UPDATED`: Cập nhật sprite giai đoạn cây, độ ẩm, hoặc bong bóng trạng thái trên đầu động vật trong `WorldStateBuffer`.

---

## 3. Frontend Bridge Events (`GameUiBridge`)

- `bridge.emit('building:ghost_start', { buildingId, footprintTiles, rotatable, interactionPoints })` → Kích hoạt Phaser `BuildingGhostSystem` bám lưới `32×32 px`, phím `R` xoay hướng, tô ô xanh/đỏ trực quan.
- `bridge.emit('building:ghost_confirm', { buildingId, originTileX, originTileY, rotation })` → React gửi `POST /buildings/place` kèm `idempotencyKey`.
- `bridge.emit('survival:hud_sync', { hunger, hungerState, activeFoodBuffs, currentDay, currentSeason, dayPhase, weather })` → Cập nhật HUD Sinh tồn & Đồng hồ Thế giới.
