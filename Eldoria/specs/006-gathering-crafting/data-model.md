# Data Model: Resource Gathering & Multi-Station Crafting System

**Feature**: `006-gathering-crafting`  
**Storage**: 100% Local JSON Files (`data/db/world/<regionId>.json`, `data/db/characters/<characterId>.json`, `data/db/inventories/<characterId>.json`, `data/db/houses/<characterId>.json`, `data/db/ledgers/currency-ledger-<YYYY-MM>.json`) & Static Read-Only Catalog (`game-data/recipes.json`, `game-data/items.json`, `game-data/buildings.json`) — Zero External DBMS / Zero Third-Party Services.

---

## 1. `ResourceNodeState` (Nhúng trong `data/db/world/<regionId>.json` → `zones[].resourceNodes[]`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `ResourceNodeState.nodeId` | `string` | Required; `^nod_[a-z0-9_]{3,48}$`; duy nhất trong `zoneId` | Mã định danh điểm tài nguyên |
| `ResourceNodeState.zoneId` | `string` | Required; khớp `WorldZone.zoneId` (`zon_*`) | Zone chứa điểm tài nguyên |
| `ResourceNodeState.nodeType` | `string` | Required; Enum `TREE \| STONE \| ORE_VEIN \| HERB_PATCH \| FISHING_SPOT` | Chủng loại tài nguyên khai thác |
| `ResourceNodeState.tileX` | `integer` | Required; `>= 0`, nằm trong biên chiều rộng bản đồ Tiled | Tọa độ ô X (lưới `32x32 px`) |
| `ResourceNodeState.tileY` | `integer` | Required; `>= 0`, nằm trong biên chiều cao bản đồ Tiled | Tọa độ ô Y (lưới `32x32 px`) |
| `ResourceNodeState.requiredToolTier` | `integer` | Required; `0..4` (`0` = tay không/cơ bản, `1..4` = bậc công cụ) | Bậc công cụ tối thiểu để khai thác |
| `ResourceNodeState.maxCharges` | `integer` | Required; `1..10` | Tổng số lượt khai thác trước khi cạn |
| `ResourceNodeState.remainingCharges` | `integer` | Required; `0..maxCharges` | Số lượt khai thác còn lại hiện tại |
| `ResourceNodeState.respawnSeconds` | `integer` | Required; `180..900` (làng `180..300`, rừng `300..480`, vùng cao `600..900`) | Thời lượng tái sinh sau khi cạn |
| `ResourceNodeState.respawnAt` | `string \| null` | Nullable; ISO-8601 UTC từ đồng hồ server; khác `null` khi và chỉ khi `remainingCharges === 0` | Mốc thời gian phục hồi trữ lượng |
| `ResourceNodeState.lootTableId` | `string` | Required; phải tồn tại trong catalog bảng rơi tài nguyên tĩnh | Mã bảng vật phẩm rơi theo mỗi lượt khai thác |

**State Transitions (`ResourceNodeState`)**:
`AVAILABLE (remainingCharges > 0, respawnAt = null)` → `[Valid Gather reduces remainingCharges to 0]` → `DEPLETED (remainingCharges = 0, respawnAt = serverNow + respawnSeconds)` → `[serverNow >= respawnAt]` → `AVAILABLE (remainingCharges = maxCharges, respawnAt = null)`.

---

## 2. `GatheringAttempt` (Ephemeral RAM Validation & Anti-Bot Telemetry Record)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `GatheringAttempt.requestId` | `string` | Required; UUIDv4 duy nhất theo yêu cầu | Mã tương quan cho `INTERACT_REQ` và `ACTION_ERROR` |
| `GatheringAttempt.characterId` | `string` | Required; UUIDv7 khớp `Character.characterId` | Nhân vật thực hiện khai thác |
| `GatheringAttempt.nodeId` | `string` | Required; khớp `ResourceNodeState.nodeId` trong zone hiện tại | Điểm tài nguyên mục tiêu |
| `GatheringAttempt.toolTierUsed` | `integer` | Required; `0..4`, tính từ trang bị/công cụ sở hữu trên server (không nhận từ client) | Bậc công cụ hiệu lực khi kiểm định |
| `GatheringAttempt.staminaSpent` | `integer` | Required; `8` cho `TREE \| STONE \| ORE_VEIN`, `4` cho `HERB_PATCH \| FISHING_SPOT` | Stamina tiêu hao khi lượt khai thác hợp lệ |
| `GatheringAttempt.distancePx` | `number` | Required; `>= 0` và `<= 96.0` (Euclidean từ tâm nhân vật đến tâm tile node) | Khoảng cách thực tế đo trên server |
| `GatheringAttempt.serverTimestamp` | `integer` | Required; Unix epoch milliseconds từ đồng hồ server | Mốc thời gian phục vụ phân tích nhịp khai thác bất thường |

---

## 3. `CraftingRecipeRef` (Read-Only RAM nạp từ `game-data/recipes.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `CraftingRecipeRef.id` | `string` | Required; `^rcp_[a-z0-9_]{3,56}$`; duy nhất trong 36 bản ghi (`22` MVP) | Định danh công thức chế tạo |
| `CraftingRecipeRef.category` | `string` | Required; Enum `SMELTING \| REFINING \| COOKING \| ALCHEMY \| UTILITY \| WEAPON_FORGING \| ARMOR_CRAFTING \| ACCESSORY_CRAFTING` | Phân loại nhóm công thức |
| `CraftingRecipeRef.stationBuildingId` | `string` | Required; khớp `game-data/buildings.json[].id` (`bld_*`) | Công trình chế tạo chính |
| `CraftingRecipeRef.stationLevelReq` | `integer` | Required; `1..4` | Cấp tối thiểu của công trình trạm |
| `CraftingRecipeRef.altStationBuildingIds` | `string[]` | Required; mảng 0..3 `bld_*` hợp lệ | Công trình thay thế hợp lệ (ví dụ `bld_furnace`, `bld_alchemy_lab`, `bld_workshop`) |
| `CraftingRecipeRef.publicStationNpcId` | `string \| null` | Nullable; `npc_*` hợp lệ (`npc_smith_garrik`, `npc_village_herbalist`, `npc_village_tailor`) hoặc `null` | Trạm công cộng NPC được phép chế tạo ở làng |
| `CraftingRecipeRef.craftTimeSeconds` | `integer` | Required; `0..300` | Thời gian cơ bản để chế tạo 1 đơn vị |
| `CraftingRecipeRef.goldCost` | `integer` | Required; `>= 0` | Phí Gold cơ bản cho 1 đơn vị |
| `CraftingRecipeRef.ingredients` | `IngredientReq[]` | Required; độ dài `1..6`; mỗi phần tử `{ itemId: string (tồn tại trong items.json), qty: integer >= 1 }` | Nguyên liệu cần cho 1 đơn vị |
| `CraftingRecipeRef.outputItemId` | `string` | Required; phải tồn tại trong `game-data/items.json` | Vật phẩm thành phẩm tạo ra |
| `CraftingRecipeRef.outputQty` | `integer` | Required; `>= 1` | Số lượng thành phẩm mỗi mẻ |
| `CraftingRecipeRef.unlockCondition` | `object` | Required; `{ type: "DEFAULT" \| "PLAYER_LEVEL" \| "BOSS_CLEAR", value: number \| string \| null }` | Điều kiện mở khóa công thức |
| `CraftingRecipeRef.expReward` | `integer` | Required; `>= 0` | Điểm kinh nghiệm nhận khi hoàn tất 1 mẻ |
| `CraftingRecipeRef.craftingTokenReward` | `integer` | Required; `>= 0` | Số `CRAFTING_TOKEN` thưởng cho mỗi mẻ |

---

## 4. `CraftingJob` (Nhúng trong `data/db/characters/<characterId>.json` → `craftingQueue[]`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `CraftingJob.jobId` | `string` | Required; UUIDv7 duy nhất | Định danh lệnh chế tạo |
| `CraftingJob.idempotencyKey` | `string` | Required; UUIDv4, duy nhất trong 24h theo `<accountId>:CRAFT_EXEC:<key>` | Chống tạo trùng lệnh chế tạo |
| `CraftingJob.characterId` | `string` | Required; UUIDv7 khớp `Character.characterId` | Nhân vật sở hữu lệnh chế tạo |
| `CraftingJob.recipeId` | `string` | Required; khớp `CraftingRecipeRef.id` | Công thức đang thực thi |
| `CraftingJob.stationType` | `string` | Required; Enum `HOMESTEAD_BUILDING \| PUBLIC_NPC` | Loại trạm nơi khởi tạo lệnh |
| `CraftingJob.stationBuildingInstanceId` | `string \| null` | Nullable; UUIDv7 khớp `BuildingInstance.buildingInstanceId` khi `stationType === "HOMESTEAD_BUILDING"`, ngược lại `null` | Trạm công trình cụ thể dùng để đếm giới hạn hàng đợi |
| `CraftingJob.batchCount` | `integer` | Required; `1..50` (trần `maxBatchCountPerRequest = 50`) | Số mẻ trong một yêu cầu |
| `CraftingJob.status` | `string` | Required; Enum `IN_PROGRESS \| READY_TO_CLAIM \| CLAIMED \| CANCELLED` | Trạng thái vòng đời lệnh chế tạo |
| `CraftingJob.materialsConsumed` | `ConsumedItem[]` | Required; độ dài `1..6`; `{ itemId, qty (> 0), source: "BAG" \| "STORAGE" }` | Ghi nhận chính xác nguồn trừ nguyên liệu để hoàn `80%` nếu hủy |
| `CraftingJob.goldSpent` | `integer` | Required; `>= 0` | Tổng Gold đã khấu trừ cho mẻ |
| `CraftingJob.startedAt` | `string` | Required; ISO-8601 UTC từ đồng hồ server | Thời điểm bắt đầu chế tạo |
| `CraftingJob.completesAt` | `string` | Required; ISO-8601 UTC (`>= startedAt`) đã áp dụng thưởng tốc độ trạm | Mốc đồng hồ server cho phép nhận thành phẩm |

**State Transitions (`CraftingJob.status`)**:
`[Validated Execute + WAL]` → `IN_PROGRESS` (hoặc thẳng `READY_TO_CLAIM` nếu `completesAt === startedAt`) → `[serverNow >= completesAt]` → `READY_TO_CLAIM` → `[Claim + WAL]` → `CLAIMED`; hoặc `IN_PROGRESS` → `[Cancel + WAL Refund 80%]` → `CANCELLED`.

---

## 5. `CraftingLedgerLink` (Bút toán ghi vào `data/db/ledgers/currency-ledger-<YYYY-MM>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `CraftingLedgerLink.ledgerEntryId` | `string` | Required; UUIDv7 duy nhất | Mã bút toán sổ cái bất biến |
| `CraftingLedgerLink.txId` | `string` | Required; UUIDv7 khớp `WalTransaction.txId` | Liên kết giao dịch WAL nguyên tử |
| `CraftingLedgerLink.idempotencyKey` | `string` | Required; khớp `CraftingJob.idempotencyKey` (hoặc khóa của thao tác claim/cancel) | Chống ghi sổ lặp |
| `CraftingLedgerLink.characterId` | `string` | Required; UUIDv7 | Nhân vật biến động tiền tệ |
| `CraftingLedgerLink.currencyType` | `string` | Required; Enum `GOLD \| CRAFTING_TOKEN` | Loại tiền tệ liên quan chế tạo |
| `CraftingLedgerLink.delta` | `integer` | Required; `!= 0` (âm cho `CRAFT_FEE`, dương cho `CRAFT_CANCEL_REFUND` / `CRAFT_TOKEN_REWARD`) | Mức biến động số dư |
| `CraftingLedgerLink.reasonCode` | `string` | Required; Enum `CRAFT_FEE \| CRAFT_CANCEL_REFUND \| CRAFT_TOKEN_REWARD` | Phân loại kinh tế phục vụ phân tích sink/faucet |
| `CraftingLedgerLink.recipeId` | `string` | Required; khớp `CraftingRecipeRef.id` | Dữ liệu kiểm toán truy vết công thức |
