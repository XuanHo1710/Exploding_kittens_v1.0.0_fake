# Data Model: Fair In-Game Gacha, Pity & Hero/Weapon Collection System

**Feature**: `009-gacha-collection`  
**Storage**: 100% Local JSON Files (`data/db/characters/<characterId>.json`, `data/db/inventories/<characterId>.json`, `data/db/history/gacha-history-<characterId>.json`, `data/db/ledgers/currency-ledger-<YYYY-MM>.json`) & Static Read-Only Catalog (`game-data/gacha-banners.json`, `game-data/characters.json`, `game-data/items.json`) — Zero External DBMS / Zero Third-Party Services.

---

## 1. `GachaBannerConfig` (Read-Only RAM nạp từ `game-data/gacha-banners.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `GachaBannerConfig.id` | `string` | Required; `^bnr_(perm\|lim)_[a-z0-9_]{3,48}$`; duy nhất (`bnr_perm_heroes`, `bnr_perm_arsenal`, `bnr_lim_storm_sovereign`, `bnr_lim_dragonforge`) | Mã định danh banner |
| `GachaBannerConfig.bannerType` | `string` | Required; Enum `PERMANENT_CHARACTER \| PERMANENT_WEAPON \| LIMITED_CHARACTER \| LIMITED_WEAPON` | Phân loại banner |
| `GachaBannerConfig.rewardCategory` | `string` | Required; Enum `CHARACTER \| WEAPON` | Loại phần thưởng chính của bể quay |
| `GachaBannerConfig.sharedPityGroup` | `string` | Required; Enum `PERMANENT_CHARACTER \| PERMANENT_WEAPON \| LIMITED_CHARACTER \| LIMITED_WEAPON` | Nhóm chia sẻ và bảo lưu Pity |
| `GachaBannerConfig.active` | `boolean` | Required; chỉ `bnr_perm_heroes` & `bnr_perm_arsenal` bật `true` trong MVP | Trạng thái mở quay hiện hành |
| `GachaBannerConfig.schedule` | `object` | Required; `{ mode: "PERMANENT" \| "SEASONAL_LIMITED", durationDays?: integer (21), startAt: ISO-8601 \| null, endAt: ISO-8601 \| null }` | Lịch hoạt động kiểm định theo đồng hồ server |
| `GachaBannerConfig.cost` | `object` | Required; `{ currencyType: "STARLIGHT_SHARD", singlePull: 160, tenPull: 1600 }` (bắt buộc nội tệ trong MVP) | Chi phí quay 1 và 10 lượt |
| `GachaBannerConfig.pity` | `object` | Required; `{ hardPity: 80 \| 70, softPityStart: 65 \| 55, softPitySlope: 0.06 \| 0.065, epicPity: 10, pityTargetRarities: ["MYTHIC", "LEGENDARY"], pityConditionalSplit: { MYTHIC: 0.25, LEGENDARY: 0.75 }, featuredGuarantee: object \| null }` | Thông số Soft/Hard/Epic Pity & 50/50 |
| `GachaBannerConfig.baseRates` | `Record<Rarity, number>` | Required; đủ 6 khóa (`MYTHIC`, `LEGENDARY`, `EPIC`, `RARE`, `UNCOMMON`, `COMMON`), mọi giá trị `> 0`, **tổng `=== 1.000000` (sai số `<= 1e-6`)** | Bảng xác suất nền công khai |
| `GachaBannerConfig.featured` | `Record<"MYTHIC"\|"LEGENDARY"\|"EPIC", string[]>` | Required; mỗi ID phải nằm trong `pool` tương ứng; mảng rỗng với Permanent Banner | Danh sách nhân vật/vũ khí tăng tỷ lệ Featured |
| `GachaBannerConfig.pool` | `Record<Rarity, string[]>` | Required; mọi bậc có `baseRates > 0` phải có ít nhất `1` ID hợp lệ khớp `characters.json` hoặc `items.json` (`WEAPON`) | Bể phần thưởng theo độ hiếm |

---

## 2. `GachaPityState` (Nhúng trong `data/db/characters/<characterId>.json` → `gachaPity[sharedPityGroup]`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `GachaPityState.sharedPityGroup` | `string` | Required; Enum `PERMANENT_CHARACTER \| PERMANENT_WEAPON \| LIMITED_CHARACTER \| LIMITED_WEAPON` | Khóa nhóm Pity tương ứng |
| `GachaPityState.totalPulls` | `integer` | Required; `>= 0`, tăng đơn điệu theo số lượt quay đã thực hiện | Tổng lượt quay lịch sử trên nhóm banner |
| `GachaPityState.pityCounter` | `integer` | Required; `0..(hardPity - 1)` (`0..79` cho Character, `0..69` cho Weapon; reset về `0` khi trúng `LEGENDARY`/`MYTHIC`) | Số lượt liên tiếp kể từ lần trúng top-tier gần nhất |
| `GachaPityState.epicPityCounter` | `integer` | Required; `0..9` (reset về `0` khi trúng `EPIC` trở lên) | Bộ đếm bảo đảm `EPIC+` mỗi `10` lượt |
| `GachaPityState.guaranteedFeatured` | `boolean` | Required; `false` với Permanent Banner; chuyển `true` nếu lệch `50/50` trên Limited Banner và reset `false` sau khi trúng Featured | Cờ bảo đảm 100% trúng Featured lần kế tiếp |
| `GachaPityState.lastPullAt` | `string \| null` | Nullable; ISO-8601 UTC từ đồng hồ server | Thời điểm quay gần nhất |

**State Transitions (`GachaPityState`)**:
Mỗi lượt quay tăng `totalPulls += 1`:
- Nếu kết quả là `LEGENDARY` hoặc `MYTHIC`: `pityCounter = 0`, `epicPityCounter = 0`; trên Limited Banner nếu `isFeatured` → `guaranteedFeatured = false`, ngược lại `guaranteedFeatured = true`.
- Else nếu kết quả là `EPIC`: `pityCounter += 1`, `epicPityCounter = 0`.
- Else (`RARE | UNCOMMON | COMMON`): `pityCounter += 1`, `epicPityCounter += 1`.

---

## 3. `GachaHistoryRecord` (`data/db/history/gacha-history-<characterId>.json` → `records[]`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `GachaHistoryRecord.pullTxId` | `string` | Required; UUIDv7 duy nhất khớp `WalTransaction.txId` | Định danh bất biến của giao dịch quay |
| `GachaHistoryRecord.idempotencyKey` | `string` | Required; UUIDv4 duy nhất trong 24h theo `<accountId>:GACHA_PULL:<key>` | Khóa chống gửi lặp |
| `GachaHistoryRecord.characterId` | `string` | Required; UUIDv7 khớp `Character.characterId` | Nhân vật thực hiện quay |
| `GachaHistoryRecord.bannerId` | `string` | Required; khớp `GachaBannerConfig.id` | Banner được quay |
| `GachaHistoryRecord.sharedPityGroup` | `string` | Required; khớp `GachaBannerConfig.sharedPityGroup` | Nhóm Pity chịu tác động |
| `GachaHistoryRecord.pullCount` | `integer` | Required; chỉ chấp nhận `1` hoặc `10` | Số lượt quay trong giao dịch |
| `GachaHistoryRecord.currencySpent` | `integer` | Required; `160` (nếu `pullCount === 1`) hoặc `1600` (nếu `pullCount === 10`) `STARLIGHT_SHARD` | Tổng nội tệ đã trừ |
| `GachaHistoryRecord.pityBefore` | `integer` | Required; `0..(hardPity - 1)` | Giá trị `pityCounter` trước giao dịch |
| `GachaHistoryRecord.pityAfter` | `integer` | Required; `0..(hardPity - 1)` | Giá trị `pityCounter` sau giao dịch |
| `GachaHistoryRecord.results` | `GachaPullItemResult[]` | Required; độ dài bằng chính xác `pullCount` (`1` hoặc `10`) | Danh sách kết quả từng lượt theo đúng thứ tự sinh |
| `GachaHistoryRecord.rngAuditSeedHash` | `string` | Required; `^[0-9a-f]{64}$` (SHA-256 kiểm toán nội bộ) | Mã băm truy vết phiên CSPRNG server |
| `GachaHistoryRecord.createdAt` | `string` | Required; ISO-8601 UTC từ đồng hồ server | Thời điểm hoàn tất giao dịch |

---

## 4. `GachaPullItemResult` (Phần tử trong `GachaHistoryRecord.results[]`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `GachaPullItemResult.pullIndex` | `integer` | Required; `1..pullCount` tăng liên tiếp | Số thứ tự lượt trong gói quay |
| `GachaPullItemResult.rewardType` | `string` | Required; Enum `CHARACTER \| WEAPON` | Phân loại phần thưởng |
| `GachaPullItemResult.rewardId` | `string` | Required; khớp `chr_*` hoặc `wpn_*` trong bể của banner | Mã nhân vật hoặc vũ khí nhận được |
| `GachaPullItemResult.rarity` | `string` | Required; Enum `COMMON \| UNCOMMON \| RARE \| EPIC \| LEGENDARY \| MYTHIC` | Bậc độ hiếm kết quả |
| `GachaPullItemResult.isFeatured` | `boolean` | Required; `true` nếu thuộc `banner.featured[rarity]`, luôn `false` với Permanent Banner | Đánh dấu trúng mục tiêu Featured |
| `GachaPullItemResult.isDuplicate` | `boolean` | Required; `true` nếu đã sở hữu trước lượt quay này (`unlockedHeroIds` hoặc `unlockedWeaponIds`) | Đánh dấu kích hoạt chuyển đổi trùng lặp |
| `GachaPullItemResult.conversionReward` | `object \| null` | Nullable; `{ constellationAdded: 0\|1, starEssence: int >= 0, craftingToken: int >= 0, bonusItemId: "mat_starlight_dust" \| null, bonusItemQty: int >= 0, itemInstanceId?: UUIDv7 }` | Chi tiết phần thưởng chuyển đổi minh bạch |

---

## 5. `CollectionProgress` (Nhúng trong `data/db/characters/<characterId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `CollectionProgress.unlockedHeroIds` | `string[]` | Required; tối thiểu `1` phần tử (`chr_*`), không trùng lặp, độ dài `1..12` | Danh sách nhân vật đã mở khóa trong Codex |
| `CollectionProgress.heroConstellations` | `Record<string, integer>` | Required; giá trị `0..6` cho từng `heroId` đã mở khóa (`maxCharacterConstellation = 6`) | Cấp Constellation hiện tại của từng nhân vật |
| `CollectionProgress.unlockedWeaponIds` | `string[]` | Required; tập không trùng lặp các `wpn_*` từng sở hữu (`0..40`) dùng cho Codex | Tiến độ Sổ tay Vũ khí (giữ nguyên kể cả sau khi phân rã) |
| `CollectionProgress.starEssenceMonthlyPurchases` | `Record<string, Record<string, integer>>` | Required; khóa ngoài `^\d{4}-\d{2}$` (UTC month), khóa trong `shop_ess_*`, giá trị `1..offer.limitPerMonth` | Bộ đếm chống vượt hạn mức tháng Cửa hàng `STAR_ESSENCE` |

---

## 6. `StarEssenceExchangeTx` (Bút toán đổi thưởng trong `CurrencyLedger` & response kiểm toán)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `StarEssenceExchangeTx.exchangeTxId` | `string` | Required; UUIDv7 duy nhất khớp `WalTransaction.txId` | Mã giao dịch đổi Cửa hàng `STAR_ESSENCE` |
| `StarEssenceExchangeTx.idempotencyKey` | `string` | Required; UUIDv4 duy nhất trong 24h theo `<accountId>:GACHA_EXCHANGE:<key>` | Khóa chống đổi lặp |
| `StarEssenceExchangeTx.offerId` | `string` | Required; khớp 1 trong 16 `starEssenceShop.offers[].offerId` (`shop_ess_*`) | Mã ưu đãi được đổi |
| `StarEssenceExchangeTx.monthKey` | `string` | Required; `^\d{4}-\d{2}$` tính từ đồng hồ UTC server | Tháng áp dụng hạn mức |
| `StarEssenceExchangeTx.costStarEssence` | `integer` | Required; `> 0`, khớp chính xác `offer.costStarEssence` trong catalog | Số `STAR_ESSENCE` đã trừ |
| `StarEssenceExchangeTx.purchasedCountInMonth` | `integer` | Required; `1..offer.limitPerMonth` | Tổng số lần đã đổi ưu đãi này trong tháng sau giao dịch |
