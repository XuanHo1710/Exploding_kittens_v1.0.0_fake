# Data Model: 10-Slot Equipment, Set Bonuses, Durability & Deterministic +0 to +10 Weapon Enhancement

**Feature**: `007-equipment-enhancement`  
**Storage**: 100% Local JSON Files (`Character.equipment` trong `data/db/characters/<characterId>.json`, `ItemInstance` trong `data/db/inventories/<characterId>.json`, `data/db/history/upgrade-history-<characterId>.json`, `data/db/ledgers/currency-ledger-<YYYY-MM>.json`, đọc `bld_blacksmith`/`bld_storage` từ `data/db/houses/<characterId>.json`) + Static Read-Only Catalog `game-data/items.json`, `game-data/buildings.json` & `docs/balancing/weapon-upgrade-costs.csv` — Zero External DBMS / Zero Redis.

---

## 1. `EquipmentLoadout` (Nhúng tại `Character.equipment` trong `data/db/characters/<characterId>.json`)

Mọi giá trị khác `null` PHẢI là `UUIDv7` của một `ItemInstance` hợp lệ thuộc `ownerCharacterId === characterId`, không được lặp lại giữa hai ô bất kỳ.

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `EquipmentLoadout.MAIN_HAND` | `string \| null` | Optional; UUIDv7 của `WEAPON` hợp lệ theo `levelReq` & `allowedClasses` | Vũ khí chính |
| `EquipmentLoadout.OFF_HAND` | `string \| null` | Optional; UUIDv7 của `SHIELD`/phụ tay; bắt buộc `null` khi `MAIN_HAND` là vũ khí hai tay (`GREATSWORD`/`BOW`/`CROSSBOW`/`STAFF`) | Khiên hoặc trang bị tay phụ |
| `EquipmentLoadout.HELMET` | `string \| null` | Optional; UUIDv7 của `EQUIPMENT` có `slot === "HELMET"` | Mũ giáp |
| `EquipmentLoadout.CHEST_ARMOR` | `string \| null` | Optional; UUIDv7 của `EQUIPMENT` có `slot === "CHEST_ARMOR"` | Giáp ngực |
| `EquipmentLoadout.GLOVES` | `string \| null` | Optional; UUIDv7 của `EQUIPMENT` có `slot === "GLOVES"` | Găng tay |
| `EquipmentLoadout.BOOTS` | `string \| null` | Optional; UUIDv7 của `EQUIPMENT` có `slot === "BOOTS"` | Giày |
| `EquipmentLoadout.RING_1` | `string \| null` | Optional; UUIDv7 của `EQUIPMENT` có `slot === "RING"`; bắt buộc `!== RING_2` | Nhẫn ô 1 |
| `EquipmentLoadout.RING_2` | `string \| null` | Optional; UUIDv7 của `EQUIPMENT` có `slot === "RING"`; bắt buộc `!== RING_1` | Nhẫn ô 2 |
| `EquipmentLoadout.NECKLACE` | `string \| null` | Optional; UUIDv7 của `EQUIPMENT` có `slot === "NECKLACE"` | Dây chuyền |
| `EquipmentLoadout.ACCESSORY` | `string \| null` | Optional; UUIDv7 của `EQUIPMENT` có `slot === "ACCESSORY"` | Phụ kiện / Bùa hộ mệnh |

---

## 2. `ActiveSetBonusState` (Computed Server RAM + Snapshot trong `Character.stats.derivedSnapshot`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `ActiveSetBonusState.setId` | `string` | Required; Enum 6 bộ chuẩn (`set_greenhaven_novice \| set_mossroot_guard \| set_ironpeak_forge \| set_crystal_arcanist \| set_frostbound_warden \| set_abyssal_sovereign`) | Mã bộ trang bị khớp `game-data/items.json#equipmentSets` |
| `ActiveSetBonusState.equippedPieceCount` | `integer` | Required; `0..4` (đếm số mảnh khác nhau thuộc `setId` đang mặc) | Số mảnh bộ đã kích hoạt |
| `ActiveSetBonusState.twoPieceActive` | `boolean` | Required; `true` khi và chỉ khi `equippedPieceCount >= 2` | Cờ kích hoạt thưởng 2 món |
| `ActiveSetBonusState.fourPieceActive` | `boolean` | Required; `true` khi và chỉ khi `equippedPieceCount >= 4` | Cờ kích hoạt thưởng 4 món |

---

## 3. `EnhancementTierRule` (Static Read-Only Config khớp `docs/balancing/weapon-upgrade-costs.csv`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `EnhancementTierRule.fromLevel` | `integer` | Required; `0..9` | Cấp hiện tại trước nâng |
| `EnhancementTierRule.toLevel` | `integer` | Required; `1..10`; bắt buộc `=== fromLevel + 1` (trần cứng `+10`) | Cấp đích sau nâng |
| `EnhancementTierRule.blacksmithLevelReq` | `integer` | Required; `1..4` (`1` cho `+1..+3`, `2` cho `+4..+6`, `3` cho `+7..+8`, `4` cho `+9..+10`) | Cấp `bld_blacksmith` tối thiểu |
| `EnhancementTierRule.successRateMvp` | `number` | Required; bắt buộc `=== 1.00` trong MVP | Tỷ lệ thành công chắc chắn 100% |
| `EnhancementTierRule.breakRiskMvp` | `boolean` | Required; bắt buộc `=== false` trong MVP | Cam kết không vỡ vũ khí |
| `EnhancementTierRule.downgradeRiskMvp` | `boolean` | Required; bắt buộc `=== false` trong MVP | Cam kết không tụt cấp |
| `EnhancementTierRule.atkBonusPctCumulative` | `integer` | Required; `8..130` (`8, 16, 25, 35, 48, 60, 74, 90, 108, 130`) | Phần trăm thưởng ATK cộng dồn |
| `EnhancementTierRule.bonusFlatAtkBase` | `integer` | Required; `4..96` (`4, 8, 13, 19, 27, 36, 47, 60, 76, 96`) | Chỉ số ATK cộng thẳng |
| `EnhancementTierRule.milestonePerk` | `string` | Required; Enum `NONE \| MILESTONE_PLUS_5 \| MILESTONE_PLUS_10` | Đặc quyền mốc `+5` (`+3% CritRate` + `Weapon Glow I`) và `+10` (`+8% Boss Poise` + `+5% Skill Scaling` + `Radiant Aura II`) |
| `EnhancementTierRule.goldCost` | `integer` | Required; `150..8000` (tổng 10 bậc `26,400 GOLD`) | Chi phí Gold mỗi bậc |
| `EnhancementTierRule.requiredMaterials` | `Array<{ itemId, qty }>` | Required; `2..3` phần tử; mọi `itemId` phải tồn tại trong `game-data/items.json` và `qty >= 1` | Danh sách nguyên liệu yêu cầu |

---

## 4. `UpgradeHistoryRecord` (Append-Only tại `data/db/history/upgrade-history-<characterId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `UpgradeHistoryRecord.upgradeId` | `string` | Required; UUIDv7 | Mã lịch sử cường hóa |
| `UpgradeHistoryRecord.idempotencyKey` | `string` | Required; duy nhất trong cửa sổ `24h` | Chống phát lại lệnh nâng cấp |
| `UpgradeHistoryRecord.characterId` | `string` | Required; UUIDv7 | Nhân vật thực hiện |
| `UpgradeHistoryRecord.itemInstanceId` | `string` | Required; UUIDv7 khớp vũ khí thuộc chủ sở hữu | Bản thể vũ khí được nâng |
| `UpgradeHistoryRecord.itemId` | `string` | Required; `^wpn_[a-z0-9_]+$` khớp `game-data/items.json` | Mã định nghĩa vũ khí |
| `UpgradeHistoryRecord.fromLevel` | `integer` | Required; `0..9` | Cấp trước khi nâng |
| `UpgradeHistoryRecord.toLevel` | `integer` | Required; `1..10`; bắt buộc `=== fromLevel + 1` | Cấp sau khi nâng |
| `UpgradeHistoryRecord.goldSpent` | `integer` | Required; `> 0`; khớp `EnhancementTierRule.goldCost` | Vàng tiêu tốn (khớp `CurrencyLedger`) |
| `UpgradeHistoryRecord.materialsConsumed` | `Array<{ itemId, qty }>` | Required; tối thiểu `1` phần tử, mọi `qty >= 1` | Nguyên liệu đã trừ |
| `UpgradeHistoryRecord.blacksmithLevel` | `integer` | Required; `1..4` và `>= EnhancementTierRule.blacksmithLevelReq` | Cấp Lò Rèn thực tế lúc nâng |
| `UpgradeHistoryRecord.result` | `string` | Required; Enum `SUCCESS` (100% deterministic ở MVP) | Kết quả cường hóa |
| `UpgradeHistoryRecord.createdAt` | `string` | Required; ISO-8601 UTC từ đồng hồ server | Thời điểm hoàn tất |

**State Transitions (`ItemInstance.enhancementLevel` trên vũ khí)**:
`+0` → `+1` → `+2` → `+3` *(gate `bld_blacksmith >= 1`)* → `+4` → `+5` *(`MILESTONE_PLUS_5`)* → `+6` *(gate `bld_blacksmith >= 2`)* → `+7` → `+8` *(gate `bld_blacksmith >= 3`)* → `+9` → `+10` *(`MILESTONE_PLUS_10`, gate `bld_blacksmith >= 4`, terminal hard cap)*. Không có chuyển đổi giảm bậc hoặc phá hủy trong MVP.

---

## 5. `DurabilityRepairRecord` (Audit Payload / Metadata của Giao dịch Sửa chữa)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `DurabilityRepairRecord.itemInstanceId` | `string` | Required; UUIDv7 của `WEAPON`/`EQUIPMENT` thuộc chủ sở hữu | Món đồ được sửa |
| `DurabilityRepairRecord.durabilityBefore` | `integer` | Required; `0..(durabilityMax - 1)` (từ chối sửa nếu đã đầy `100%`) | Độ bền trước khi sửa |
| `DurabilityRepairRecord.durabilityAfter` | `integer` | Required; `> durabilityBefore` và `<= durabilityMax` (`min(max, before + floor(0.5*max))` với `REPAIR_KIT`; `=== max` với `GOLD_BLACKSMITH`) | Độ bền sau khi sửa |
| `DurabilityRepairRecord.repairMethod` | `string` | Required; Enum `GOLD_BLACKSMITH \| REPAIR_KIT` | Phương thức sửa chữa |
| `DurabilityRepairRecord.discountPctApplied` | `integer` | Required; Enum `0 \| 10 \| 20 \| 30` (theo `bld_blacksmith` Lv 1..4 khi dùng `GOLD_BLACKSMITH`; `0` với `REPAIR_KIT`) | Mức chiết khấu Lò Rèn áp dụng |
