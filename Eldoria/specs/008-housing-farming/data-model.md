# Data Model: Survival, Farming, Animal Husbandry & Homestead Building System

**Feature**: `008-housing-farming`  
**Storage**: 100% Local JSON Files (`data/db/houses/<characterId>.json`, `data/db/characters/<characterId>.json`, `data/db/inventories/<characterId>.json`, `data/db/world/world-clock.json`, `data/db/ledgers/currency-ledger-<YYYY-MM>.json`) & Static Read-Only Catalog (`game-data/crops.json`, `game-data/animals.json`, `game-data/buildings.json`, `game-data/items.json`) — Zero External DBMS / Zero Third-Party Services.

---

## 1. `SurvivalState` (Nhúng trong `data/db/characters/<characterId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `SurvivalState.hunger` | `number` | Required; `0..100` (khởi tạo `100`, đóng băng khi offline, không trừ HP về `0`) | Chỉ số độ no sinh tồn |
| `SurvivalState.hungerState` | `string` | Required; Enum `WELL_FED \| NORMAL \| HUNGRY \| STARVING \| EXHAUSTED` (suy ra từ `hunger`) | Ngưỡng trạng thái ảnh hưởng Stamina/HP |
| `SurvivalState.stamina` | `number` | Required; `0..maxStamina` | Thể lực hiện tại |
| `SurvivalState.maxStamina` | `integer` | Required; `>= 60` (giảm tạm còn `60%` khi `hunger === 0`) | Trần thể lực hiệu lực |
| `SurvivalState.farmingLevel` | `integer` | Required; `1..100` (khởi tạo `1`) | Cấp độ canh tác kiểm tra `unlockFarmingLevel` của 15 giống cây |
| `SurvivalState.farmingExp` | `integer` | Required; `>= 0` | Kinh nghiệm canh tác tích lũy |
| `SurvivalState.activeFoodBuffs` | `FoodBuffSlot[]` | Required; độ dài `0..2`; tối đa `1` phần tử mỗi `channel` (`FOOD_COMBAT \| FOOD_UTILITY`), mỗi phần tử gồm `{ channel, itemId, qualityTier, modifiers, expiresAt }` | Hiệu ứng thức ăn đang hoạt động |
| `SurvivalState.lastFoodConsumedAt` | `string \| null` | Nullable; ISO-8601 UTC từ đồng hồ server; kiểm tra hồi chiêu tiêu thụ `5–12s` | Mốc chống spam ăn thực phẩm |

---

## 2. `WorldClockState` (`data/db/world/world-clock.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `WorldClockState.epochStartMs` | `integer` | Required; Unix epoch ms cố định khi khởi tạo thế giới | Gốc tính ngày và mùa |
| `WorldClockState.currentDay` | `integer` | Required; `1..14` (14 ngày trong game mỗi mùa) | Ngày hiện tại trong mùa |
| `WorldClockState.currentSeason` | `string` | Required; Enum `SPRING \| SUMMER \| AUTUMN \| WINTER` | Mùa hiện hành toàn thế giới |
| `WorldClockState.dayPhase` | `string` | Required; Enum `DAWN \| DAY \| DUSK \| NIGHT` (chu kỳ `24 phút` thực = 1 ngày game) | Pha thời gian trong ngày |
| `WorldClockState.minuteOfDay` | `number` | Required; `0 <= minuteOfDay < 24` | Phút thực trôi qua trong ngày game hiện tại |
| `WorldClockState.weatherHistory24h` | `WeatherDayRecord[]` | Required; độ dài `1..60` (60 ngày game = 24 giờ thực); mỗi bản ghi `{ dayNumber, season, startedAtMs, endedAtMs, regionWeather: Record<RegionId, WeatherType> }` với `WeatherType` ∈ `CLEAR \| RAIN \| STORM \| FOG \| SNOW \| HEATWAVE` | Lịch sử thời tiết phục vụ mô phỏng offline chính xác |

---

## 3. `HomesteadAggregate` (`data/db/houses/<characterId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `HomesteadAggregate.houseId` | `string` | Required; `^hse_[a-zA-Z0-9_-]{3,56}$`, duy nhất 1:1 theo nhân vật | Khóa định danh lãnh địa |
| `HomesteadAggregate.ownerCharacterId` | `string` | Required; UUIDv7 khớp `Character.characterId` | Chủ sở hữu duy nhất của lãnh địa |
| `HomesteadAggregate.regionId` | `string` | Required; mặc định `reg_greenhaven_village` | Vùng đất chứa lãnh địa |
| `HomesteadAggregate.zoneId` | `string` | Required; mặc định `zon_player_homestead` | Zone định vị lãnh địa |
| `HomesteadAggregate.gridWidth` | `integer` | Required; cố định `32` trong MVP (tương ứng `1024 px` với tile `32x32`) | Chiều rộng lưới đặt công trình |
| `HomesteadAggregate.gridHeight` | `integer` | Required; cố định `24` trong MVP (tương ứng `768 px` với tile `32x32`) | Chiều cao lưới đặt công trình |
| `HomesteadAggregate.buildings` | `BuildingInstance[]` | Required; luôn chứa đúng `1` `bld_player_house`; số công trình phụ `<= playerHouse.maxHomesteadBuildings` (`5..13`) | Danh sách công trình trong lãnh địa |
| `HomesteadAggregate.farmPlots` | `FarmPlotGroup[]` | Required; mỗi phần tử gắn `1:1` với 1 `bld_farm_plot` (`12..36` `CropPlotTile`, cờ `autoIrrigationEnabled`, `autoHarvestEnabled`) | Nhóm luống trồng theo công trình ruộng |
| `HomesteadAggregate.animals` | `AnimalInstance[]` | Required; tổng số động vật mỗi chuồng không vượt sức chứa (`bld_chicken_coop`: `4/8/12`, `bld_farm_plot` Lv 2–4: `2/2/3`, `bld_barn`: `4/8/12`) | Đàn vật nuôi của lãnh địa |

---

## 4. `BuildingInstance` (Nhúng trong `HomesteadAggregate.buildings[]`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `BuildingInstance.buildingInstanceId` | `string` | Required; UUIDv7 duy nhất | Mã công trình đã xây |
| `BuildingInstance.buildingId` | `string` | Required; khớp 1 trong 13 ID `game-data/buildings.json[].id` (`bld_*`) | Chủng loại công trình |
| `BuildingInstance.level` | `integer` | Required; `1..maxLevel` (`bld_player_house`/`bld_storage`/`bld_farm_plot`/`bld_blacksmith`: `1..4`; các công trình còn lại: `1..3`) | Cấp hiện tại đã hoàn thành |
| `BuildingInstance.originTileX` | `integer` | Required; `0..(gridWidth - effectiveWidth)`, đã qua kiểm định 7 lớp & BFS | Tọa độ X góc trên-trái trên lưới `32x32` |
| `BuildingInstance.originTileY` | `integer` | Required; `0..(gridHeight - effectiveHeight)`, đã qua kiểm định 7 lớp & BFS | Tọa độ Y góc trên-trái trên lưới `32x32` |
| `BuildingInstance.rotation` | `integer` | Required; Enum `0 \| 90` (`0` cố định nếu `rotatable === false`) | Góc xoay footprint & `interactionPoints` |
| `BuildingInstance.status` | `string` | Required; Enum `UNDER_CONSTRUCTION \| ACTIVE \| UPGRADING` | Trạng thái vận hành công trình |
| `BuildingInstance.permissionMode` | `string` | Required; Enum `OWNER_ONLY \| PARTY_ACCESS \| GUILD_ACCESS` (`bld_player_house`/`bld_storage`/`bld_blacksmith` ép cứng `OWNER_ONLY`) | Phân quyền truy cập lãnh địa |
| `BuildingInstance.assetVariantKey` | `string` | Required; khớp `levels[level-1].assetVariantKey` trong `game-data/buildings.json` | Khóa đồ họa pixel 16-bit theo cấp |
| `BuildingInstance.constructionStartedAt` | `string` | Required; ISO-8601 UTC từ đồng hồ server | Mốc bắt đầu xây hoặc nâng cấp |
| `BuildingInstance.completesAt` | `string \| null` | Nullable; ISO-8601 UTC (`>= constructionStartedAt`), khác `null` khi `UNDER_CONSTRUCTION \| UPGRADING` | Mốc hoàn tất xây/nâng cấp theo đồng hồ server |

**State Transitions (`BuildingInstance.status`)**:
`[Place + 7-Layer Validated + WAL]` → `UNDER_CONSTRUCTION` (hoặc `ACTIVE` nếu `constructionSeconds === 0`) → `[serverNow >= completesAt]` → `ACTIVE` → `[Upgrade + WAL]` → `UPGRADING` → `[serverNow >= completesAt]` → `ACTIVE (level + 1)`; hủy `UNDER_CONSTRUCTION` xóa công trình (hoàn 80%), hủy `UPGRADING` quay về `ACTIVE` giữ nguyên cấp cũ (hoàn 80%).

---

## 5. `CropPlotTile` (Nhúng trong `HomesteadAggregate.farmPlots[].tiles[]`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `CropPlotTile.plotId` | `string` | Required; UUIDv7 duy nhất | Mã định danh ô đất canh tác |
| `CropPlotTile.buildingInstanceId` | `string` | Required; khớp `BuildingInstance.buildingInstanceId` của `bld_farm_plot` | Công trình ruộng sở hữu ô đất |
| `CropPlotTile.tileX` | `integer` | Required; tọa độ cục bộ hợp lệ trong giới hạn ô của `bld_farm_plot` | Tọa độ X ô đất |
| `CropPlotTile.tileY` | `integer` | Required; tọa độ cục bộ hợp lệ trong giới hạn ô của `bld_farm_plot` | Tọa độ Y ô đất |
| `CropPlotTile.state` | `string` | Required; Enum `UNTILLED \| TILLED \| PLANTED_DRY \| PLANTED_WATERED \| MATURE \| WITHERED` | Trạng thái vòng đời ô đất |
| `CropPlotTile.cropId` | `string \| null` | Nullable; khớp 1 trong 15 ID `game-data/crops.json[].id` (`crp_*`) khi có cây, `null` khi `UNTILLED \| TILLED` | Giống cây đang trồng |
| `CropPlotTile.stage` | `integer` | Required; `0..4` (`0` = `SEED` hoặc đất trống, `maxStage` = `MATURE` theo `growthStages.length - 1`) | Giai đoạn sinh trưởng hiển thị sprite |
| `CropPlotTile.growthProgressMinutes` | `number` | Required; `0..totalGrowthMinutes` | Số phút sinh trưởng ẩm đã tích lũy |
| `CropPlotTile.wateredUntil` | `string \| null` | Nullable; ISO-8601 UTC từ đồng hồ server | Thời điểm hết ẩm cần tưới lại |
| `CropPlotTile.fertilizerType` | `string` | Required; Enum `NONE \| BASIC \| RICH` (chỉ áp dụng 1 lần mỗi chu kỳ trồng) | Loại phân bón đang có hiệu lực |
| `CropPlotTile.regrowCount` | `integer` | Required; `>= 0` (giới hạn `<= 10` chu kỳ tự động/24h offline) | Số lần đã tái sinh đối với cây đa vụ |
| `CropPlotTile.lastSimulatedAt` | `string` | Required; ISO-8601 UTC từ đồng hồ server (offline catch-up cap `24h`) | Mốc đồng hồ server mô phỏng gần nhất |

---

## 6. `AnimalInstance` (Nhúng trong `HomesteadAggregate.animals[]`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `AnimalInstance.animalInstanceId` | `string` | Required; UUIDv7 duy nhất | Mã cá thể động vật |
| `AnimalInstance.animalId` | `string` | Required; khớp 1 trong 6 ID `game-data/animals.json[].id` (`anm_*`) | Loài vật nuôi |
| `AnimalInstance.buildingInstanceId` | `string` | Required; khớp `BuildingInstance.buildingInstanceId` của chuồng hợp lệ (`bld_chicken_coop`, `bld_farm_plot` Lv 2+, hoặc `bld_barn`) | Công trình đang nuôi nhốt |
| `AnimalInstance.nickname` | `string` | Required; `1..20` ký tự Unicode hợp lệ | Tên gọi cá thể |
| `AnimalInstance.growthStage` | `string` | Required; Enum `BABY \| ADULT` | Giai đoạn trưởng thành |
| `AnimalInstance.ageHours` | `number` | Required; `>= 0` (chỉ tăng khi `hunger > 0`) | Số giờ tuổi đã lớn |
| `AnimalInstance.happiness` | `number` | Required; `0..100` (khởi tạo `50`, quyết định ma trận chất lượng `LOW/MEDIUM/HIGH`) | Chỉ số hạnh phúc |
| `AnimalInstance.hunger` | `number` | Required; `0..100` (khởi tạo `80`, chặn cho ăn khi `>= 90`) | Độ no hiện tại |
| `AnimalInstance.health` | `number` | Required; `20..100` (khởi tạo `100`, **sàn cứng `20`**, `permanentDeathAllowed = false`) | Sức khỏe (không bao giờ về `0`) |
| `AnimalInstance.productionProgressMinutes` | `number` | Required; `>= 0` | Tiến độ tích lũy chu kỳ tạo sản phẩm |
| `AnimalInstance.pendingProduce` | `PendingProduceItem[]` | Required; độ dài `0..3` (`MAX_PENDING_PER_ANIMAL = 3`); mỗi phần tử `{ itemId, qty, qualityTier: "NORMAL" \| "SILVER" \| "GOLD" }` | Khay sản phẩm chờ chủ nhà gom |
| `AnimalInstance.lastPettedGameDay` | `integer` | Required; `>= 0` (tối đa 1 lần nhận `+10 Happiness` mỗi ngày trong game `24 phút`) | Ngày trong game được vuốt ve gần nhất |
| `AnimalInstance.lastSimulatedAt` | `string` | Required; ISO-8601 UTC từ đồng hồ server (offline catch-up cap `24h`) | Mốc đồng hồ server mô phỏng gần nhất |
