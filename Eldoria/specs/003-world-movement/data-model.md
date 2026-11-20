# Data Model: Open World Maps, Partitioning, Movement & Sync

**Feature**: `003-world-movement`  
**Storage**: `data/db/world/<regionId>.json`, nhúng `PlayerPosition` trong `data/db/characters/<characterId>.json` (100% Local JSON) + Ephemeral RAM `ZoneInstance`

---

## 1. `WorldRegionState` (`data/db/world/<regionId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `WorldRegionState.regionId` | `string` | Required; whitelist `reg_*` khớp `00-game-vision.md` | Mã khu vực |
| `WorldRegionState.currentSeason` | `string` | Required; Enum `SPRING \| SUMMER \| AUTUMN \| WINTER` | Mùa hiện tại |
| `WorldRegionState.seasonDay` | `integer` | Required; `1..14` | Ngày hiện tại trong mùa |
| `WorldRegionState.dayTimeMinutes` | `number` | Required; `[0, 1440)` (chu kỳ 24 phút thực = 1440 phút game) | Thời điểm ngày/đêm |
| `WorldRegionState.currentWeather` | `string` | Required; Enum `CLEAR \| RAIN \| STORM \| FOG \| SNOW \| HEATWAVE` | Thời tiết khu vực |
| `WorldRegionState.weatherChangesAt` | `string` | Required; ISO-8601 UTC | Mốc đổi thời tiết kế tiếp |
| `WorldRegionState.zones` | `WorldZone[]` | Required; tối thiểu `1` phân vùng | Danh sách phân vùng trực thuộc |

---

## 2. `WorldZone` (Nhúng trong `WorldRegionState.zones[]`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `WorldZone.zoneId` | `string` | Required; `^zon_[a-z0-9_]{3,40}$`; duy nhất | Mã phân vùng |
| `WorldZone.tiledMapPath` | `string` | Required; đường dẫn tương đối an toàn dưới `assets/maps/*.tmj` | Bản đồ Tiled chuẩn |
| `WorldZone.isSafeZone` | `boolean` | Required | Vùng an toàn (cấm sát thương/chết, cho đổi hero) |
| `WorldZone.widthTiles` | `integer` | Required; `16..160` | Chiều rộng bản đồ theo tile `32px` |
| `WorldZone.heightTiles` | `integer` | Required; `16..160` | Chiều cao bản đồ theo tile `32px` |
| `WorldZone.portals` | `ZonePortal[]` | Required; mảng cổng chuyển vùng | Danh sách cổng hợp lệ |

---

## 3. `ZonePortal` (Nhúng trong `WorldZone.portals[]`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `ZonePortal.portalId` | `string` | Required; `^prt_[a-z0-9_]{3,40}$` | Mã cổng |
| `ZonePortal.triggerRect` | `object` | Required; `{ x, y, w, h }` trong biên bản đồ | Vùng kích hoạt qua cổng |
| `ZonePortal.targetZoneId` | `string` | Required; `zon_*` hoặc `HOMESTEAD_SELF` hoặc `dng_*` | Zone đích |
| `ZonePortal.targetSpawnX` | `number` | Required; `>= 0` và không trùng ô collision | Tọa độ xuất hiện X đích |
| `ZonePortal.targetSpawnY` | `number` | Required; `>= 0` và không trùng ô collision | Tọa độ xuất hiện Y đích |
| `ZonePortal.minLevelReq` | `integer` | Required; `1..100` | Cấp tối thiểu để đi qua |

---

## 4. `PlayerPosition` (Nhúng trong `data/db/characters/<characterId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `PlayerPosition.regionId` | `string` | Required; `reg_*` | Khu vực hiện tại |
| `PlayerPosition.zoneId` | `string` | Required; `zon_*` hoặc `homestead:<charId>` | Zone bền vững gần nhất |
| `PlayerPosition.x` | `number` | Required; trong biên bản đồ, ngoài ô collision | Tọa độ X pixel |
| `PlayerPosition.y` | `number` | Required; trong biên bản đồ, ngoài ô collision | Tọa độ Y pixel |
| `PlayerPosition.facing` | `string` | Required; Enum `UP \| DOWN \| LEFT \| RIGHT` | Hướng nhìn 4 chiều MVP |
| `PlayerPosition.lastSafeZoneId` | `string` | Required; luôn trỏ tới một Safe Zone hợp lệ | Zone hồi sinh dự phòng |
| `PlayerPosition.lastSafeX` | `number` | Required; hợp lệ trong `lastSafeZoneId` | Tọa độ an toàn X |
| `PlayerPosition.lastSafeY` | `number` | Required; hợp lệ trong `lastSafeZoneId` | Tọa độ an toàn Y |
| `PlayerPosition.unlockedWaypoints` | `string[]` | Required; mảng mã waypoint `wp_*` không trùng | Điểm Fast Travel đã mở |
| `PlayerPosition.discoveredFogCells` | `string[]` | Required; mảng khóa ô bản đồ đã khám phá (`<zoneId>:<cx>:<cy>`) | Trạng thái Fog of War |
