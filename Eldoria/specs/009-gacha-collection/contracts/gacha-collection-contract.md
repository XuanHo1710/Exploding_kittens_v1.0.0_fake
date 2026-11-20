# Interface Contracts: Fair In-Game Gacha, Pity & Hero/Weapon Collection System

**Feature**: `009-gacha-collection`  
**Transport**: Self-Hosted NestJS REST `/api/v1` (JWT Auth + Ownership Guard + Mandatory `X-Idempotency-Key` trên mọi `POST`)

---

## 1. REST API Contracts

### 1.1 `GET /api/v1/gacha/banners`
- **Authorization**: Bearer JWT (Owner).
- **Query Params**: `?characterId=<charId>`
- **Response `200 OK`**:
  ```json
  {
    "ok": true,
    "data": {
      "realMoneyPurchaseEnabledInMvp": false,
      "currencyType": "STARLIGHT_SHARD",
      "currencies": { "starlightShard": 2240, "starEssence": 45, "craftingToken": 12 },
      "banners": [
        {
          "id": "bnr_perm_heroes",
          "name": "Heroes of Eldoria",
          "bannerType": "PERMANENT_CHARACTER",
          "sharedPityGroup": "PERMANENT_CHARACTER",
          "active": true,
          "cost": { "currencyType": "STARLIGHT_SHARD", "singlePull": 160, "tenPull": 1600 },
          "pityRules": { "hardPity": 80, "softPityStart": 65, "softPitySlope": 0.06, "epicPity": 10, "pityConditionalSplit": { "MYTHIC": 0.25, "LEGENDARY": 0.75 }, "featuredGuarantee": null },
          "baseRates": { "MYTHIC": 0.004, "LEGENDARY": 0.012, "EPIC": 0.084, "RARE": 0.300, "UNCOMMON": 0.350, "COMMON": 0.250 },
          "pool": { },
          "playerPityState": { "totalPulls": 10, "pityCounter": 10, "epicPityCounter": 0, "guaranteedFeatured": false }
        }
      ],
      "duplicateConversionRules": { },
      "starEssenceShop": { "monthKey": "2026-11", "offers": [] }
    },
    "serverTime": "2026-11-19T16:10:00.000Z"
  }
  ```

### 1.2 `POST /api/v1/characters/:charId/gacha/pull`
- **Headers**: `Authorization: Bearer <accessToken>`, `X-Idempotency-Key: <UUIDv4>`.
- **Request Body**:
  ```json
  {
    "bannerId": "bnr_perm_heroes",
    "count": 10
  }
  ```
- **WAL Transaction Locks (Sorted)**: `["character:<charId>", "inventory:<charId>", "ledger:<YYYY-MM>"]`.
- **Files Written in 1 Atomic WAL Commit**:
  1. `data/db/characters/<charId>.json` (`currencies`, `gachaPity`, `unlockedHeroIds`, `heroConstellations`, `unlockedWeaponIds`)
  2. `data/db/inventories/<charId>.json` (vũ khí mới và/hoặc `mat_starlight_dust` tràn `C6`)
  3. `data/db/history/gacha-history-<charId>.json` (thêm `GachaHistoryRecord`)
  4. `data/db/ledgers/currency-ledger-<YYYY-MM>.json` (`GACHA_PULL`, và nếu có: `GACHA_DUPLICATE_ESSENCE`, `GACHA_DUPLICATE_TOKEN`)
- **Response `201 Created`**:
  ```json
  {
    "ok": true,
    "data": {
      "historyRecord": {
        "pullTxId": "gtx_01...",
        "bannerId": "bnr_perm_heroes",
        "pullCount": 10,
        "currencySpent": 1600,
        "pityBefore": 0,
        "pityAfter": 10,
        "results": [],
        "rngAuditSeedHash": "<sha256>"
      },
      "updatedPityState": { "totalPulls": 10, "pityCounter": 10, "epicPityCounter": 0, "guaranteedFeatured": false },
      "currencies": { "starlightShard": 640, "starEssence": 57, "craftingToken": 12 }
    },
    "serverTime": "2026-11-19T16:10:05.000Z"
  }
  ```

### 1.3 `GET /api/v1/characters/:charId/gacha/history`
- **Query Params**: `?bannerId=<optional>&page=1&limit=20` (`limit` capped `1..50`).
- **Response `200 OK`**: `{ ok: true, data: { page, limit, totalRecords, records: GachaHistoryRecord[] }, serverTime }`.

### 1.4 `POST /api/v1/characters/:charId/gacha/exchange`
- **Headers**: `Authorization: Bearer <accessToken>`, `X-Idempotency-Key: <UUIDv4>`.
- **Request Body**: `{ "offerId": "shop_ess_elderwood_cleaver" }`
- **Response `201 Created`**: `{ ok: true, data: { exchangeTx, grantedReward, currencies, inventoryRevision }, serverTime }`.

### 1.5 `GET /api/v1/characters/:charId/collection`
- **Response `200 OK`**: Tổng hợp Hero Codex (`unlockedHeroIds`, `heroConstellations`, danh sách đủ 12 hero với lore/stats/sources) và Weapon Codex (`unlockedWeaponIds`, danh sách đủ 40 vũ khí với rarity/weaponType/sources).

---

## 2. Canonical Error Codes
- `400 ERR_VALIDATION_FAILED`: `count` khác `1 | 10`, `bannerId` hoặc `offerId` không tồn tại.
- `403 ERR_FORBIDDEN_OWNERSHIP`: Nhân vật không thuộc tài khoản đang đăng nhập.
- `409 ERR_BANNER_INACTIVE`: Banner đang tắt (`active: false`) hoặc ngoài khung `startAt..endAt` theo đồng hồ server.
- `409 ERR_INSUFFICIENT_FUNDS`: Thiếu `STARLIGHT_SHARD` (`< 160` hoặc `< 1600`) hoặc thiếu `STAR_ESSENCE`.
- `409 ERR_INVENTORY_FULL`: Túi đồ không đủ ô trống cho vũ khí hoặc vật phẩm tràn `C6` / đổi cửa hàng.
- `409 ERR_EXCHANGE_MONTHLY_LIMIT_REACHED`: Đã đạt `offer.limitPerMonth` trong tháng UTC hiện tại.
- `503 ERR_CONCURRENT_LOCK_TIMEOUT`: Hết thời gian chờ `AsyncLockManager` (`3000 ms`).

---

## 3. Frontend Bridge & Store Contracts

- `useGachaStore`: Giữ danh sách banner, bảng xác suất công khai, `playerPityState`, kết quả quay gần nhất, bộ lọc lịch sử và trạng thái Cửa hàng `STAR_ESSENCE`.
- `bridge.emit('ui:gacha_modal_open', { active: true })` → `InputFocusManager` khóa phím điều khiển nhân vật Phaser khi người chơi mở `GachaModal` hoặc `CollectionCodexModal`.
- `bridge.emit('audio:gacha_reveal', { maxRarity })` → Phát SFX mở rương nhẹ nhàng theo độ hiếm cao nhất (tôn trọng cài đặt tắt hiệu ứng chói/rung màn hình).
