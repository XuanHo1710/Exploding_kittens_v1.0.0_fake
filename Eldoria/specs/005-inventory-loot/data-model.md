# Data Model: Authoritative Inventory, Ground Loot & Atomic Currency Ledger

**Feature**: `005-inventory-loot`  
**Storage**: 100% Local JSON Files (`data/db/inventories/<characterId>.json`, `data/db/ledgers/currency-ledger-<characterId>-<YYYY-MM>.json`, `Character.currencies` trong `data/db/characters/<characterId>.json`) + Ephemeral RAM `GroundLoot` trong `ZoneInstance` + Static Read-Only Catalog `game-data/items.json` & `game-data/loot-tables.json` — Zero External DBMS / Zero Redis.

---

## 1. `InventoryAggregate` (`data/db/inventories/<characterId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `InventoryAggregate.characterId` | `string` | Required; UUIDv7 khớp `Character.characterId`; immutable | Chủ sở hữu duy nhất của kho đồ |
| `InventoryAggregate.bagCapacity` | `integer` | Required; `40..120`; mặc định `40` | Số ô túi đồ mang theo |
| `InventoryAggregate.storageCapacity` | `integer` | Required; `0..200`; mặc định `0` (mở khóa qua `bld_storage`) | Số ô rương cá nhân tại căn cứ |
| `InventoryAggregate.bagItems` | `ItemInstance[]` | Required; `length <= bagCapacity`; `slotIndex` không trùng trong `0..(bagCapacity-1)`; mọi `instanceId` duy nhất | Danh sách vật phẩm trong túi |
| `InventoryAggregate.storageItems` | `ItemInstance[]` | Required; `length <= storageCapacity`; `slotIndex` không trùng trong `0..(storageCapacity-1)`; tập `instanceId` rời rạc hoàn toàn với `bagItems` | Danh sách vật phẩm trong rương |

---

## 2. `ItemInstance` (Nhúng trong `InventoryAggregate.bagItems[]` & `InventoryAggregate.storageItems[]`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `ItemInstance.instanceId` | `string` | Required; UUIDv7 duy nhất toàn hệ thống; bất biến, không bao giờ tái sử dụng | Khóa định danh từng bản thể vật phẩm |
| `ItemInstance.itemId` | `string` | Required; khớp `game-data/items.json[].id` (`157` vật phẩm chuẩn) | Mã định nghĩa catalog |
| `ItemInstance.ownerCharacterId` | `string` | Required; PHẢI bằng `InventoryAggregate.characterId` | Ràng buộc quyền sở hữu chống cướp/IDOR |
| `ItemInstance.quantity` | `integer` | Required; `1..itemDef.maxStack` (bắt buộc `1` với `WEAPON` và `EQUIPMENT`; cấm `<= 0`) | Số lượng chồng hiện tại |
| `ItemInstance.slotIndex` | `integer` | Required; `0..(containerCapacity - 1)`; duy nhất trong cùng container | Vị trí ô lưới hiển thị |
| `ItemInstance.enhancementLevel` | `integer` | Required; `0..10` (mặc định `0`; bắt buộc `0` với vật phẩm không phải `WEAPON`) | Cấp cường hóa vũ khí |
| `ItemInstance.durability` | `integer \| null` | Optional; `0..itemDef.durabilityMax` với `WEAPON`/`EQUIPMENT`; `null` với vật phẩm khác | Độ bền hiện tại |
| `ItemInstance.bonusRolls` | `object[]` | Required; độ dài `0..4` theo độ hiếm | Danh sách dòng chỉ số cộng thêm |
| `ItemInstance.sockets` | `string[]` | Required; độ dài `0..2` (chuẩn bị cho M2+ socketing) | Danh sách ID ngọc đã khảm |
| `ItemInstance.quality` | `string` | Required; Enum `NORMAL \| SILVER \| GOLD`; mặc định `NORMAL` | Chất lượng nông sản/thực phẩm |
| `ItemInstance.bound` | `boolean` | Required; mặc định `true` trong MVP | Cờ khóa nhân vật |
| `ItemInstance.acquiredAt` | `string` | Required; ISO-8601 UTC từ đồng hồ server | Thời điểm tạo/nhận bản thể |

---

## 3. `GroundLoot` (Ephemeral RAM Only trong `ZoneInstance` / `DungeonInstance` — Không ghi đĩa)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `GroundLoot.lootId` | `string` | Required; UUIDv7 | Mã định danh vật phẩm rơi tạm thời |
| `GroundLoot.zoneId` | `string` | Required; khớp ID zone hoặc dungeon instance đang hoạt động | Vùng chứa vật phẩm rơi |
| `GroundLoot.x` | `number` | Required; trong biên bản đồ zone | Tọa độ X pixel |
| `GroundLoot.y` | `number` | Required; trong biên bản đồ zone | Tọa độ Y pixel |
| `GroundLoot.lootKind` | `string` | Required; Enum `ITEM \| GOLD` | Phân loại vật phẩm rơi hay tiền vàng |
| `GroundLoot.itemId` | `string \| null` | Conditional; bắt buộc khớp `game-data/items.json[].id` khi `lootKind === "ITEM"`, `null` khi `GOLD` | Mã vật phẩm rơi |
| `GroundLoot.quantity` | `integer` | Required; `>= 1` (`<= maxStack` nếu là `ITEM`) | Số lượng vật phẩm hoặc lượng Gold |
| `GroundLoot.rarity` | `string` | Required; Enum `COMMON \| UNCOMMON \| RARE \| EPIC \| LEGENDARY \| MYTHIC` | Độ hiếm phục vụ màu phát sáng trên mặt đất |
| `GroundLoot.eligibleCharacterIds` | `string[]` | Required; tối thiểu `1` UUIDv7 (đúng `1` phần tử ở chế độ `PERSONAL_INSTANCED`) | Danh sách nhân vật có quyền nhặt |
| `GroundLoot.lootRule` | `string` | Required; Enum `PERSONAL_INSTANCED \| ROUND_ROBIN`; mặc định `PERSONAL_INSTANCED` | Quy tắc phân phối chống cướp đồ |
| `GroundLoot.expiresAt` | `string` | Required; ISO-8601 UTC (`spawnedAt + 120,000 ms`) | Hạn tự hủy giải phóng RAM sau `120s` |
| `GroundLoot.claimed` | `boolean` | Required; mặc định `false`; chuyển sang `true` nguyên tử trước khi ghi JSON | Khóa RAM chống 2 lệnh nhặt đồng thời |

**State Transitions (`GroundLoot`)**:
`[MonsterKilled / BossDefeated CSPRNG Roll]` → `SPAWNED (claimed: false, TTL 120s)` → `CLAIMING (claimed: true)` → `PICKED_UP (removed from RAM + WAL committed to JSON)` *(hoặc rollback về `claimed: false` nếu `ERR_INVENTORY_FULL`)*; hoặc `SPAWNED` → `EXPIRED (now >= expiresAt → removed from RAM, emit LOOT_REMOVED)`.

---

## 4. `CurrencyWallet` (Nhúng trong `data/db/characters/<characterId>.json` tại `Character.currencies`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `CurrencyWallet.gold` | `integer` | Required; `>= 0`; chỉ thay đổi qua `EconomyService` | Tiền tệ giao dịch, rèn, cường hóa, xây dựng |
| `CurrencyWallet.starlightShard` | `integer` | Required; `>= 0`; chỉ thay đổi qua `EconomyService` | Tiền tệ quay Gacha nội tệ kiếm qua gameplay |
| `CurrencyWallet.craftingToken` | `integer` | Required; `>= 0`; chỉ thay đổi qua `EconomyService` | Huy hiệu chế tạo |
| `CurrencyWallet.bossToken` | `integer` | Required; `>= 0`; chỉ thay đổi qua `EconomyService` | Huy hiệu hạ Boss |
| `CurrencyWallet.starEssence` | `integer` | Required; `>= 0`; chỉ thay đổi qua `EconomyService` | Tinh hoa đổi từ Gacha trùng lặp |

---

## 5. `CurrencyLedgerEntry` (Append-Only phân mảnh theo nhân vật tại `data/db/ledgers/currency-ledger-<characterId>-<YYYY-MM>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `CurrencyLedgerEntry.ledgerEntryId` | `string` | Required; UUIDv7 | Mã bút toán kế toán bất biến |
| `CurrencyLedgerEntry.txId` | `string` | Required; UUIDv7 khớp `WalTransaction.txId` | Liên kết giao dịch WAL đa tệp |
| `CurrencyLedgerEntry.idempotencyKey` | `string` | Required; duy nhất trong cửa sổ `24h` | Chống ghi sổ lặp khi replay |
| `CurrencyLedgerEntry.characterId` | `string` | Required; UUIDv7 | Nhân vật biến động số dư |
| `CurrencyLedgerEntry.currencyType` | `string` | Required; Enum `GOLD \| STARLIGHT_SHARD \| CRAFTING_TOKEN \| BOSS_TOKEN \| STAR_ESSENCE` | Loại tiền tệ biến động |
| `CurrencyLedgerEntry.delta` | `integer` | Required; `!= 0` (dương = faucet, âm = sink) | Mức tăng/giảm nguyên tử |
| `CurrencyLedgerEntry.balanceBefore` | `integer` | Required; `>= 0` | Số dư ngay trước giao dịch |
| `CurrencyLedgerEntry.balanceAfter` | `integer` | Required; `balanceAfter === balanceBefore + delta` VÀ `balanceAfter >= 0` | Bất biến chống số dư âm |
| `CurrencyLedgerEntry.reasonCode` | `string` | Required; Enum `MONSTER_LOOT \| BOSS_REWARD \| QUEST_REWARD \| NPC_SELL \| NPC_BUY \| WEAPON_ENHANCE \| EQUIPMENT_REPAIR \| CRAFT_FEE \| BUILDING_UPGRADE \| GACHA_PULL \| GACHA_EXCHANGE \| ADMIN_ADJUST` | Phân loại nguồn/đích phục vụ kiểm toán kinh tế |
| `CurrencyLedgerEntry.metadata` | `object` | Required; đối tượng JSON chứa tham chiếu nguồn (`itemId`, `lootId`, `questId`, `recipeId`, `bannerId`...) | Dữ liệu kiểm toán chi tiết |
| `CurrencyLedgerEntry.createdAt` | `string` | Required; ISO-8601 UTC từ đồng hồ server | Thời điểm ghi sổ |
