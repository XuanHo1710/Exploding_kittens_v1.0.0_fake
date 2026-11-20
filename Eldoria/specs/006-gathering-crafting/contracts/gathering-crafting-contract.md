# Interface Contracts: Resource Gathering & Multi-Station Crafting System

**Feature**: `006-gathering-crafting`  
**Transport**: WebSocket Namespace `/game` (Realtime Gathering & Node Sync) + Self-Hosted NestJS REST `/api/v1` (Atomic Crafting & Queue Management)

---

## 1. WebSocket Realtime Contracts (Gathering & Resource Nodes)

### 1.1 Client → Server: `INTERACT_REQ` (`targetType: "NODE"`)
- **Rate Limit**: Tối đa `4 / s`
- **Payload**:
  ```json
  {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "targetType": "NODE",
    "targetId": "nod_gh_copper_01"
  }
  ```
- **Server Validation**:
  1. Nhân vật sống, không `STUN`/`DEATH`/`CAST`, thuộc đúng `zoneId` chứa `nodeId`.
  2. Khoảng cách Euclidean giữa `(player.x, player.y)` và tâm `(tileX * 32 + 16, tileY * 32 + 16)` `<= 96 px`.
  3. `node.remainingCharges >= 1`.
  4. `playerEffectiveToolTier >= node.requiredToolTier`.
  5. `player.stamina >= requiredStamina` (`8` cho `TREE|STONE|ORE_VEIN`; `4` cho `HERB_PATCH|FISHING_SPOT`).
  6. Kiểm tra sức chứa túi đồ cho kết quả rơi trước khi trừ `remainingCharges` và `stamina`.

### 1.2 Server → Client: `RESOURCE_NODE_UPDATED` & `INVENTORY_PATCH`
- Broadcast trong tầm spatial grid của zone khi node đổi `remainingCharges` hoặc hồi sinh:
  ```json
  {
    "v": 1,
    "type": "RESOURCE_NODE_UPDATED",
    "payload": {
      "zoneId": "zon_greenhaven_square",
      "nodeId": "nod_gh_copper_01",
      "remainingCharges": 0,
      "maxCharges": 3,
      "respawnAt": "2026-11-19T16:05:00.000Z",
      "gatheredByCharId": "chr_01..."
    }
  }
  ```
- Đồng thời gửi riêng `INVENTORY_PATCH` cho người khai thác và phát `animState` (`MINING` | `WOODCUTTING` | `FISHING` | `INTERACT`) trong `WORLD_SNAPSHOT`.

### 1.3 Gathering Error Codes (`ACTION_ERROR`)
- `ERR_NODE_NOT_FOUND`
- `ERR_NODE_OUT_OF_RANGE` (`distancePx > 96`)
- `ERR_NODE_DEPLETED` (`remainingCharges === 0`, không trừ Stamina)
- `ERR_TOOL_TIER_TOO_LOW` (`toolTierUsed < requiredToolTier`)
- `ERR_INSUFFICIENT_STAMINA`
- `ERR_INVENTORY_FULL`

---

## 2. REST API Contracts (Crafting & Queue Management)

Mọi endpoint `POST` đều yêu cầu `Authorization: Bearer <accessToken>` (Ownership Guard) và `X-Idempotency-Key: <UUIDv4>`.

### 2.1 `GET /api/v1/characters/:charId/crafting/state`
- **Response `200 OK`**: Trả danh sách `craftingQueue[]` (đã cập nhật trạng thái `READY_TO_CLAIM` nếu `serverNow >= completesAt`), danh sách `unlockedRecipeIds`, và thông tin trạm hiện khả dụng theo vị trí nhân vật.

### 2.2 `POST /api/v1/characters/:charId/crafting/execute`
- **Request Body**:
  ```json
  {
    "recipeId": "rcp_smelt_steel_ingot",
    "count": 2,
    "stationType": "HOMESTEAD_BUILDING",
    "stationBuildingInstanceId": "binst_smith_01"
  }
  ```
- **WAL Transaction Locks (Sorted)**: `["character:<id>", "house:<id>", "inventory:<id>", "ledger:<YYYY-MM>"]` (bỏ `house:<id>` khi `stationType === "PUBLIC_NPC"`).
- **Response `201 Created`**:
  ```json
  {
    "ok": true,
    "data": {
      "job": {
        "jobId": "cjob_01...",
        "recipeId": "rcp_smelt_steel_ingot",
        "batchCount": 2,
        "status": "IN_PROGRESS",
        "startedAt": "2026-11-19T16:00:00.000Z",
        "completesAt": "2026-11-19T16:00:24.000Z",
        "goldSpent": 160
      },
      "inventoryRevision": 45,
      "currencies": { "gold": 840, "craftingToken": 3 }
    },
    "serverTime": "2026-11-19T16:00:00.000Z"
  }
  ```

### 2.3 `POST /api/v1/characters/:charId/crafting/jobs/:jobId/claim`
- **Request Body**: `{}`
- **Validation**: `job.status === "READY_TO_CLAIM"` (hoặc `IN_PROGRESS` với `serverNow >= completesAt`), túi đồ còn đủ ô trống cho tổng sản phẩm (bao gồm phần bonus sản lượng nếu kích hoạt thưởng trạm).
- **Response `200 OK`**: Trả `grantedItems[]` (`itemId`, `qty`, `bonusQty`), `expGained`, `craftingTokenGained`, `inventoryRevision`, `currencies`.

### 2.4 `POST /api/v1/characters/:charId/crafting/jobs/:jobId/cancel`
- **Request Body**: `{}`
- **Validation**: Chỉ cho hủy khi `job.status === "IN_PROGRESS"` và `serverNow < completesAt`.
- **Response `200 OK`**: Hoàn nguyên tử `Math.floor(qty * 0.8)` cho từng nguyên liệu và `Math.floor(goldSpent * 0.8)` Gold + ghi `CRAFT_CANCEL_REFUND` vào `CurrencyLedger`.

### 2.5 Crafting Error Codes
- `400 ERR_VALIDATION_FAILED`: `count` ngoài `1..50` hoặc `recipeId` không tồn tại.
- `403 ERR_FORBIDDEN_OWNERSHIP`: Nhân vật hoặc trạm lãnh địa không thuộc tài khoản hiện tại.
- `409 ERR_STATION_OUT_OF_RANGE`: Khoảng cách tới trạm/NPC `> 96 px`.
- `409 ERR_STATION_LEVEL_REQUIRED`: Cấp công trình `< stationLevelReq` hoặc công trình không ở trạng thái `ACTIVE`.
- `409 ERR_RECIPE_LOCKED`: Chưa đạt `PLAYER_LEVEL` hoặc chưa hạ Boss trong `unlockCondition`.
- `409 ERR_CRAFT_QUEUE_FULL`: Đạt trần hàng đợi của trạm (`forgeQueueSlots`/`cookQueueSlots`/`parallelSmeltSlots`/`brewQueueSlots`/`craftQueueSlots`).
- `409 ERR_INSUFFICIENT_MATERIALS` / `ERR_INSUFFICIENT_FUNDS`.
- `409 ERR_JOB_NOT_READY` (`claim` trước `completesAt`) / `ERR_JOB_ALREADY_FINISHED` (`cancel` sau `completesAt`).
- `409 ERR_INVENTORY_FULL`.

---

## 3. Frontend Bridge Events (`GameUiBridge`)

- `bridge.emit('world:node_prompt', { nodeId, nodeType, requiredToolTier, inRange, remainingCharges })` → Hiển thị gợi ý tương tác phím `E` trên HUD.
- `bridge.emit('ui:open_crafting_modal', { stationType, stationBuildingInstanceId?, npcId?, allowedCategories[] })` → Mở React `CraftingModal` và khóa phím di chuyển Phaser qua `InputFocusManager`.
- `bridge.emit('vfx:gather_hit', { nodeId, nodeType, x, y, depleted })` → Phát hiệu ứng tia lửa/vụn gỗ/nước bắn 16-bit tại vị trí node.
