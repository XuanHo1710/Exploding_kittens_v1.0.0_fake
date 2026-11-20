# Data Dictionary — Toàn bộ Thực thể & Schema JSON (`data/db/` và `game-data/`)

**Trạng thái**: Design Baseline v1.0  
**Cập nhật lần cuối**: 2026-11-19  
**Tham chiếu**: [`database-design.md`](./database-design.md), [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md)

---

## 1. Quy ước Chung

- **100% lưu trữ bằng JSON**: Mọi thực thể persistent dưới đây đều là đối tượng JSON nằm trong `data/db/**/*.json` (không có bảng SQL). Mọi thực thể catalog tĩnh nằm trong `game-data/*.json`.
- **Kiểu dữ liệu chuẩn JSON**: `string` (UUIDv7 / Canonical ID / ISO-8601 UTC timestamp), `integer`, `number` (float giới hạn 4 chữ số thập phân), `boolean`, `array`, `object`, `null`.
- **Vỏ chuẩn (Envelope)**: Mọi tệp trong `data/db/` đều chứa `{ "$schemaVersion", "entityType", "entityId", "revision", "updatedAt", "checksumSha256", "data": { ... } }`. Bảng dưới đây mô tả các trường bên trong `data`.

---

## 2. Danh mục 26 Thực thể Cốt lõi (Theo Yêu cầu Mục 21)

### 2.1 `Account` — Lưu tại `data/db/accounts/<accountId>.json` (Persistent JSON)
| Trường | Kiểu JSON | Bắt buộc | Ràng buộc / Miền giá trị | Mô tả |
| :--- | :--- | :---: | :--- | :--- |
| `accountId` | `string` | Có | UUIDv7, duy nhất | Khóa chính tài khoản |
| `username` | `string` | Có | `^[a-zA-Z0-9_]{3,24}$`, duy nhất (case-insensitive) | Tên đăng nhập |
| `email` | `string` | Có | Chuẩn RFC email, max 120 ký tự, duy nhất | Địa chỉ email phục vụ khôi phục |
| `passwordHash` | `string` | Có | Định dạng `scrypt$N$r$p$saltHex$derivedHex` | Mật khẩu băm cục bộ (không lưu plain-text) |
| `role` | `string` | Có | `PLAYER` \| `MODERATOR` \| `ADMIN` | Vai trò phân quyền |
| `status` | `string` | Có | `ACTIVE` \| `SUSPENDED` \| `BANNED` | Trạng thái tài khoản |
| `banReason` | `string \| null` | Không | Max 300 ký tự | Lý do khóa nếu bị đình chỉ |
| `banExpiresAt` | `string \| null` | Không | ISO-8601 UTC | Thời điểm hết hạn tạm khóa |
| `failedLoginAttempts` | `integer` | Có | `0..20` | Số lần đăng nhập sai liên tiếp (rate-limit/lockout) |
| `lockedUntil` | `string \| null` | Không | ISO-8601 UTC | Thời điểm mở khóa tạm sau brute-force |
| `characterIds` | `string[]` | Có | Tối đa 4 nhân vật/tài khoản | Danh sách nhân vật sở hữu |
| `createdAt` | `string` | Có | ISO-8601 UTC | Thời điểm tạo tài khoản |
| `lastLoginAt` | `string \| null` | Không | ISO-8601 UTC | Lần đăng nhập thành công gần nhất |

### 2.2 `Character` — Lưu tại `data/db/characters/<characterId>.json` (Persistent JSON)
| Trường | Kiểu JSON | Bắt buộc | Ràng buộc / Miền giá trị | Mô tả |
| :--- | :--- | :---: | :--- | :--- |
| `characterId` | `string` | Có | UUIDv7, duy nhất | Khóa chính nhân vật người chơi |
| `accountId` | `string` | Có | Khớp `Account.accountId` | Tài khoản sở hữu |
| `name` | `string` | Có | 3–20 ký tự Unicode chữ/số/khoảng trắng đơn, duy nhất | Tên hiển thị nhân vật |
| `activeHeroId` | `string` | Có | Khớp `game-data/characters.json[].id` (`chr_*`) | Nhân vật hero đang điều khiển |
| `unlockedHeroIds` | `string[]` | Có | Tối thiểu 1 phần tử (`chr_*`) | Bộ sưu tập hero đã mở khóa |
| `heroConstellations` | `object` | Có | Map `{ [heroId]: integer (0..6) }` | Cấp độ trùng lặp đã nâng cho từng hero |
| `level` | `integer` | Có | `1..100` (MVP cap: `30`) | Cấp độ hiện tại |
| `exp` | `integer` | Có | `>= 0` | Kinh nghiệm hiện có trong cấp |
| `ascensionTier` | `integer` | Có | `0..5` | Bậc đột phá nhân vật |
| `attributePointsFree` | `integer` | Có | `>= 0` | Điểm thuộc tính chưa phân bổ |
| `skillPointsFree` | `integer` | Có | `>= 0` | Điểm kỹ năng chưa phân bổ |
| `currencies` | `object` | Có | `{ gold, starlightShard, craftingToken, bossToken, starEssence }` (tất cả `integer >= 0`) | Số dư tiền tệ hiện tại (đối chiếu được với `CurrencyLedger`) |
| `hunger` | `number` | Có | `0..100` | Độ no sinh tồn hiện tại |
| `activeFoodBuffs` | `array` | Có | Tối đa 2 buff món ăn cùng lúc | Danh sách buff thực phẩm kèm `expiresAt` |
| `gachaPity` | `object` | Có | `{ [bannerType]: { totalPulls, pityCounter, guaranteedFeatured, epicPityCounter } }` | Trạng thái Pity từng loại banner |
| `partyId` | `string \| null` | Không | Khớp `Party.partyId` | Party hiện tại nếu đang tham gia |
| `stats` | `CharacterStat` | Có | Object nhúng (xem 2.3) | Chỉ số cơ bản & phân bổ thuộc tính |
| `skills` | `CharacterSkill[]` | Có | Array nhúng (xem 2.5) | Kỹ năng đã mở & cấp nâng |
| `equipment` | `Equipment` | Có | Object nhúng (xem 2.9) | Các slot trang bị đang mặc |
| `position` | `PlayerPosition` | Có | Object nhúng (xem 2.15) | Vị trí lưu checkpoint gần nhất |
| `quests` | `CharacterQuestState[]` | Có | Array nhúng | Tiến độ nhiệm vụ đang làm/đã xong |
| `combatRating` | `integer` | Có | `>= 0` | Điểm sức mạnh tổng hợp tính bởi server |

### 2.3 `CharacterStat` — Nhúng trong `characters/<characterId>.json` (Persistent JSON)
| Trường | Kiểu JSON | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :---: | :--- | :--- |
| `allocatedStr` | `integer` | Có | `0..500` | Điểm STR người chơi đã cộng |
| `allocatedAgi` | `integer` | Có | `0..500` | Điểm AGI đã cộng |
| `allocatedInt` | `integer` | Có | `0..500` | Điểm INT đã cộng |
| `allocatedVit` | `integer` | Có | `0..500` | Điểm VIT đã cộng |
| `allocatedDex` | `integer` | Có | `0..500` | Điểm DEX đã cộng |
| `allocatedLuk` | `integer` | Có | `0..500` | Điểm LUK đã cộng |
| `currentHp` | `integer` | Có | `0..maxHp` | Máu tại lần checkpoint gần nhất |
| `currentMp` | `integer` | Có | `0..maxMp` | Mana tại lần checkpoint gần nhất |
| `currentStamina` | `integer` | Có | `0..maxStamina` | Thể lực tại lần checkpoint gần nhất |
| `derivedSnapshot` | `object` | Có | `{ maxHp, maxMp, maxStamina, atk, def, critRate, critDamage, attackSpeed, moveSpeed, cdr, elementalRes }` | Chỉ số tổng hợp server tính lại khi load (không tin dữ liệu cũ nếu config đổi) |

### 2.4 `Skill` — Static Catalog tại `game-data/skills.json` (Read-Only JSON)
Gồm 60 bản ghi với đầy đủ các trường: `id`, `name`, `characterId`, `class`, `element`, `skillType`, `mvp`, `unlockLevel`, `maxRank`, `descriptionVi`, `baseDamage`, `scalingStat`, `scalingRatio`, `poiseDamage`, `manaCost`, `staminaCost`, `cooldownMs`, `castTimeMs`, `startupMs`, `activeMs`, `recoveryMs`, `rangePx`, `hitboxShape`, `hitboxDimensions`, `targetingMode`, `statusEffects`, `animationKey`, `vfxKey`, `sfxKey`, `upgradeScalingPerRank`, `pveModifier`, `pvpModifier`, `validationRules`, `counterplayVi`.

### 2.5 `CharacterSkill` — Nhúng trong `characters/<characterId>.json` (Persistent JSON)
| Trường | Kiểu JSON | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :---: | :--- | :--- |
| `skillId` | `string` | Có | Khớp `game-data/skills.json[].id` | Mã kỹ năng |
| `rank` | `integer` | Có | `1..10` | Cấp kỹ năng đã nâng |
| `masteryExp` | `integer` | Có | `>= 0` | Kinh nghiệm thông thạo qua sử dụng |
| `hotbarSlot` | `integer \| null` | Không | `1..4` hoặc `null` | Vị trí phím tắt trên thanh HUD |

### 2.6 `Inventory` — Lưu tại `data/db/inventories/<characterId>.json` (Persistent JSON)
| Trường | Kiểu JSON | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :---: | :--- | :--- |
| `characterId` | `string` | Có | Khớp `Character.characterId` | Chủ sở hữu kho đồ |
| `bagCapacity` | `integer` | Có | Mặc định `40`, tối đa `120` (mở rộng qua `bld_storage`) | Số ô túi đồ mang theo |
| `storageCapacity` | `integer` | Có | Mặc định `0`, mở `40..200` khi xây `bld_storage` | Số ô rương chứa tại nhà |
| `bagItems` | `ItemInstance[]` | Có | Độ dài `<= bagCapacity` | Các vật phẩm trong túi |
| `storageItems` | `ItemInstance[]` | Có | Độ dài `<= storageCapacity` | Các vật phẩm trong rương nhà |

### 2.7 `ItemDefinition` — Static Catalog tại `game-data/items.json` (Read-Only JSON)
Gồm 157 bản ghi (`40 WEAPON`, `40 EQUIPMENT`, `50 MATERIAL`, `12 CONSUMABLE`, `15 SEED`) với trường: `id`, `name`, `category`, `rarity`, `levelReq`, `mvp`, `stackable`, `maxStack`, `sellPriceGold`, `iconKey`, `descriptionVi`, kèm trường chuyên biệt (`weaponType`, `slot`, `maxEnhancement`, `baseStats`, `setId`, `durabilityMax`, `buffEffect`).

### 2.8 `ItemInstance` — Nhúng trong `inventories/<characterId>.json` (Persistent JSON)
| Trường | Kiểu JSON | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :---: | :--- | :--- |
| `instanceId` | `string` | Có | UUIDv7, duy nhất toàn hệ thống | Định danh duy nhất của từng ô/món đồ |
| `itemId` | `string` | Có | Khớp `game-data/items.json[].id` | Mã định nghĩa vật phẩm |
| `ownerCharacterId` | `string` | Có | Khớp `Character.characterId` | Quyền sở hữu chống cướp/nhân bản |
| `quantity` | `integer` | Có | `1..maxStack` (`1` với trang bị/vũ khí) | Số lượng chồng |
| `slotIndex` | `integer` | Có | `0..(capacity-1)`, không trùng trong cùng container | Vị trí ô hiển thị |
| `enhancementLevel` | `integer` | Có | `0..10` (mặc định `0`; `0` với non-weapon) | Cấp cường hóa vũ khí (trần cứng `+10`) |
| `durability` | `integer \| null` | Không | `0..durabilityMax` | Độ bền hiện tại |
| `bonusRolls` | `object[]` | Có | Tối đa 4 dòng phụ theo rarity | Dòng thuộc tính cộng thêm |
| `sockets` | `string[]` | Có | Tối đa 2 ngọc khảm (M2+) | Danh sách ID ngọc khảm |
| `quality` | `string` | Có | `NORMAL` \| `SILVER` \| `GOLD` | Chất lượng (áp dụng cho nông sản/thực phẩm) |
| `bound` | `boolean` | Có | `true` trong MVP (chưa mở trade) | Đánh dấu khóa nhân vật |
| `acquiredAt` | `string` | Có | ISO-8601 UTC | Thời điểm nhận vật phẩm |

### 2.9 `Equipment` — Nhúng trong `characters/<characterId>.json` (Persistent JSON)
Object ánh xạ 10 slot (`MAIN_HAND`, `OFF_HAND`, `HELMET`, `CHEST_ARMOR`, `GLOVES`, `BOOTS`, `RING_1`, `RING_2`, `NECKLACE`, `ACCESSORY`) sang `ItemInstance.instanceId | null`. Mọi `instanceId` đang trang bị PHẢI tồn tại hợp lệ và thuộc `ownerCharacterId`.

### 2.10 `UpgradeHistory` — Lưu tại `data/db/history/upgrade-history-<characterId>.json` (Persistent JSON)
| Trường | Kiểu JSON | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :---: | :--- | :--- |
| `upgradeId` | `string` | Có | UUIDv7 | Mã lịch sử cường hóa |
| `idempotencyKey` | `string` | Có | Duy nhất | Chống gửi trùng lệnh cường hóa |
| `characterId` | `string` | Có | UUIDv7 | Người thực hiện |
| `itemInstanceId` | `string` | Có | Khớp `ItemInstance.instanceId` | Vũ khí được nâng |
| `itemId` | `string` | Có | `wpn_*` | Mã vũ khí |
| `fromLevel` | `integer` | Có | `0..9` | Cấp trước nâng |
| `toLevel` | `integer` | Có | `fromLevel + 1` (`1..10`) | Cấp sau nâng |
| `goldSpent` | `integer` | Có | `> 0` | Vàng tiêu tốn |
| `materialsConsumed` | `array` | Có | `[{ itemId, qty }]` | Nguyên liệu đã trừ |
| `blacksmithLevel` | `integer` | Có | `1..4` | Cấp lò rèn tại thời điểm nâng |
| `result` | `string` | Có | `SUCCESS` (100% ở MVP) | Kết quả |
| `createdAt` | `string` | Có | ISO-8601 UTC | Thời điểm hoàn tất |

### 2.11 `CraftingRecipe` — Static Catalog tại `game-data/recipes.json` (Read-Only JSON)
Gồm 36 công thức (`22` MVP, `14` Post-MVP; vượt chuẩn tối thiểu 30 công thức) với trường: `id`, `name`, `stationBuildingId`, `stationLevelReq`, `category`, `mvp`, `craftTimeSeconds`, `goldCost`, `ingredients`, `outputItemId`, `outputQty`, `unlockCondition`, `expReward`.

### 2.12 `ResourceNode` — Nhúng trong `data/db/world/<regionId>.json` (Persistent JSON + RAM Cache)
| Trường | Kiểu JSON | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :---: | :--- | :--- |
| `nodeId` | `string` | Có | Duy nhất theo zone | Định danh điểm tài nguyên (cây/mỏ đá/quặng) |
| `zoneId` | `string` | Có | `zon_*` | Zone chứa điểm khai thác |
| `nodeType` | `string` | Có | `TREE` \| `STONE` \| `ORE_VEIN` \| `HERB_PATCH` \| `FISHING_SPOT` | Loại tài nguyên |
| `tileX`, `tileY` | `integer` | Có | Trong biên bản đồ | Tọa độ ô |
| `requiredToolTier` | `integer` | Có | `0..4` | Cấp công cụ tối thiểu |
| `remainingCharges` | `integer` | Có | `0..maxCharges` | Số lần chặt/đào còn lại |
| `respawnAt` | `string \| null` | Không | ISO-8601 UTC | Thời điểm tái sinh tài nguyên |
| `lootTableId` | `string` | Có | Khớp `game-data/loot-tables.json` | Bảng rơi tài nguyên |

### 2.13 `WorldRegion` & 2.14 `WorldZone` — Lưu tại `data/db/world/<regionId>.json` (Persistent JSON)
- `WorldRegion`: `regionId` (`reg_*`), `name`, `recommendedLevelMin`, `recommendedLevelMax`, `currentWeather`, `weatherChangesAt`, `currentSeason`, `seasonDay`, `zones[]`, `bossRespawnSchedules[]`.
- `WorldZone`: `zoneId` (`zon_*`), `tiledMapPath`, `isSafeZone`, `maxSoftPlayers`, `portals[]`, `resourceNodes[]`, `spawnPoints[]`.

### 2.15 `PlayerPosition` — Nhúng trong `characters/<characterId>.json` (RAM 20 Hz + Checkpoint JSON 30s)
| Trường | Kiểu JSON | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :---: | :--- | :--- |
| `regionId` | `string` | Có | `reg_*` | Khu vực hiện tại |
| `zoneId` | `string` | Có | `zon_*` hoặc `homestead:<id>` | Zone hiện tại (nếu đang trong dungeon bị disconnect → trả về cổng vào dungeon hoặc làng an toàn theo chính sách reconnect) |
| `x`, `y` | `number` | Có | Trong biên hợp lệ không kẹt collision | Tọa độ pixel thế giới |
| `facing` | `string` | Có | `UP` \| `DOWN` \| `LEFT` \| `RIGHT` | Hướng nhìn 4 chiều MVP |
| `lastSafeZoneId`, `lastSafeX`, `lastSafeY` | `string` / `number` | Có | Luôn trỏ điểm hồi sinh hợp lệ | Điểm hồi sinh khi chết hoặc kẹt map |

### 2.16 `Building` — Nhúng trong `data/db/houses/<characterId>.json` (Persistent JSON)
| Trường | Kiểu JSON | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :---: | :--- | :--- |
| `buildingInstanceId` | `string` | Có | UUIDv7 | Mã công trình đã xây |
| `buildingId` | `string` | Có | Khớp `game-data/buildings.json[].id` (`bld_*`) | Loại công trình |
| `level` | `integer` | Có | `1..maxLevel` | Cấp hiện tại |
| `originTileX`, `originTileY` | `integer` | Có | Trong lưới đất sở hữu, không chồng lấn | Góc trên-trái footprint |
| `rotation` | `integer` | Có | `0` \| `90` \| `180` \| `270` | Góc xoay (nếu `rotatable: true`) |
| `status` | `string` | Có | `CONSTRUCTING` \| `ACTIVE` \| `UPGRADING` | Trạng thái vận hành |
| `completesAt` | `string \| null` | Không | ISO-8601 UTC | Thời điểm hoàn tất xây/nâng cấp theo đồng hồ server |
| `permissionMode` | `string` | Có | `OWNER_ONLY` \| `PARTY_ACCESS` | Phân quyền tương tác |

### 2.17 `Crop` — Nhúng trong `data/db/houses/<characterId>.json` (Persistent JSON)
| Trường | Kiểu JSON | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :---: | :--- | :--- |
| `plotId` | `string` | Có | UUIDv7 | Mã ô đất canh tác |
| `tileX`, `tileY` | `integer` | Có | Thuộc vùng `bld_farm_plot` | Tọa độ ô đất |
| `cropId` | `string \| null` | Không | Khớp `game-data/crops.json[].id` (`crp_*`) | Loại cây đang trồng |
| `stage` | `integer` | Có | `0..4` (`0`: đất trống, `4`: sẵn sàng thu hoạch) | Giai đoạn sinh trưởng |
| `growthProgressMinutes` | `number` | Có | `>= 0` | Số phút sinh trưởng đã tích lũy theo server time |
| `wateredUntil` | `string \| null` | Không | ISO-8601 UTC | Thời điểm hết ẩm cần tưới lại |
| `fertilizerType` | `string \| null` | Không | `NONE` \| `BASIC` \| `RICH` | Phân bón đang có tác dụng |
| `lastSimulatedAt` | `string` | Có | ISO-8601 UTC | Mốc đồng hồ server tính tiến trình gần nhất (offline cap 24h) |

### 2.18 `Animal` — Nhúng trong `data/db/houses/<characterId>.json` (Persistent JSON)
| Trường | Kiểu JSON | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :---: | :--- | :--- |
| `animalInstanceId` | `string` | Có | UUIDv7 | Mã vật nuôi |
| `animalId` | `string` | Có | Khớp `game-data/animals.json[].id` (`anm_*`) | Loài vật nuôi |
| `buildingInstanceId` | `string` | Có | Thuộc chuồng hợp lệ (`bld_chicken_coop` / `bld_barn`) | Công trình nuôi nhốt |
| `nickname` | `string` | Có | 1–20 ký tự | Tên đặt cho thú |
| `growthStage` | `string` | Có | `BABY` \| `ADULT` | Giai đoạn trưởng thành |
| `ageHours` | `number` | Có | `>= 0` | Số giờ tuổi |
| `happiness` | `number` | Có | `0..100` | Độ hạnh phúc ảnh hưởng chất lượng nông sản |
| `hunger` | `number` | Có | `0..100` | Độ no (giảm theo giờ, tính bằng server time) |
| `health` | `number` | Có | `0..100` | Sức khỏe (không chết vĩnh viễn khi offline, chỉ ngừng sản xuất) |
| `nextProduceAt` | `string \| null` | Không | ISO-8601 UTC | Thời điểm có thể thu hoạch sản phẩm tiếp theo |
| `produceReadyCount` | `integer` | Có | `0..3` (tích tối đa 24h offline) | Số lượt sản phẩm chờ thu |
| `lastSimulatedAt` | `string` | Có | ISO-8601 UTC | Mốc cập nhật đồng hồ server gần nhất |

### 2.19 `MonsterDefinition`, 2.20 `SpawnPoint`, 2.21 `BossDefinition`
- **`MonsterDefinition`**: Static catalog tại `game-data/monsters.json` (30 regular + 8 elite).
- **`SpawnPoint`**: Nhúng trong `data/db/world/<regionId>.json` (`spawnId`, `monsterId`, `x`, `y`, `maxAlive`, `patrolRadiusPx`, `respawnSeconds`).
- **`BossDefinition`**: Static catalog tại `game-data/bosses.json` (5 multi-phase bosses).

### 2.22 `Quest`
- **Static Definition**: `game-data/quests.json` (30 nhiệm vụ: `id`, `titleVi`, `type`, `mvp`, `regionId`, `giverNpcId`, `turnInNpcId`, `prereqQuestIds`, `minLevel`, `objectives[]`, `rewards`).
- **Player Progress (`CharacterQuestState`)**: Nhúng trong `characters/<characterId>.json` (`questId`, `status`: `AVAILABLE|ACTIVE|COMPLETED|CLAIMED`, `objectiveProgress[]`, `acceptedAt`, `completedAt`).

### 2.23 `Party` — Lưu tại `data/db/parties/<partyId>.json` (Persistent Snapshot + RAM State)
| Trường | Kiểu JSON | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :---: | :--- | :--- |
| `partyId` | `string` | Có | UUIDv7 | Mã tổ đội |
| `leaderCharacterId` | `string` | Có | Phải nằm trong `memberIds` | Đội trưởng |
| `memberIds` | `string[]` | Có | `1..4` nhân vật | Danh sách thành viên |
| `lootRule` | `string` | Có | `PERSONAL_INSTANCED` (mặc định MVP chống cướp) \| `ROUND_ROBIN` | Quy tắc chia chiến lợi phẩm |
| `activeDungeonInstanceId` | `string \| null` | Không | UUIDv7 | Phụ bản đang chạy nếu có |
| `createdAt` | `string` | Có | ISO-8601 UTC | Thời điểm lập tổ đội |

### 2.24 `GachaBanner` & 2.25 `GachaHistory`
- **`GachaBanner`**: Static catalog tại `game-data/gacha-banners.json` (tỷ lệ công khai, soft/hard pity, pool ID, giá 160 `STARLIGHT_SHARD`/pull).
- **`GachaHistory`**: Lưu tại `data/db/history/gacha-history-<characterId>.json`:
  - `pullTxId` (UUIDv7), `idempotencyKey`, `characterId`, `bannerId`, `pullCount` (`1` | `10`), `currencySpent`, `pityBefore`, `pityAfter`, `results[]` (`{ pullIndex, rewardType, rewardId, rarity, isFeatured, isDuplicate, conversionReward }`), `rngAuditSeedHash`, `createdAt`.

### 2.26 `CurrencyLedger` — Lưu tại `data/db/ledgers/currency-ledger-<YYYY-MM>.json` (Append-Only Persistent JSON)
| Trường | Kiểu JSON | Bắt buộc | Ràng buộc | Mô tả |
| :--- | :--- | :---: | :--- | :--- |
| `ledgerEntryId` | `string` | Có | UUIDv7 | Mã bút toán bất biến |
| `txId` | `string` | Có | Khớp `WAL.txId` | Liên kết giao dịch nguyên tử |
| `idempotencyKey` | `string` | Có | Duy nhất | Chống ghi sổ lặp |
| `characterId` | `string` | Có | UUIDv7 | Nhân vật biến động số dư |
| `currencyType` | `string` | Có | `GOLD` \| `STARLIGHT_SHARD` \| `CRAFTING_TOKEN` \| `BOSS_TOKEN` \| `STAR_ESSENCE` | Loại tiền tệ |
| `delta` | `integer` | Có | `!= 0` (dương = faucet, âm = sink) | Mức thay đổi |
| `balanceBefore` | `integer` | Có | `>= 0` | Số dư trước giao dịch |
| `balanceAfter` | `integer` | Có | `balanceBefore + delta >= 0` | Số dư sau giao dịch |
| `reasonCode` | `string` | Có | `MONSTER_LOOT`, `QUEST_REWARD`, `WEAPON_ENHANCE`, `GACHA_PULL`, `CRAFT_FEE`, `BUILDING_UPGRADE`, `NPC_SELL`, `BOSS_REWARD`, ... | Phân loại nguồn/đích để phân tích lạm phát |
| `metadata` | `object` | Có | Tham chiếu `itemId`/`bannerId`/`questId` | Dữ liệu kiểm toán bổ sung |
| `createdAt` | `string` | Có | ISO-8601 UTC | Dấu thời gian server |
