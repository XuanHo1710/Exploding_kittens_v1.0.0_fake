# Interface Contracts: 10-Slot Equipment, Set Bonuses, Durability & Deterministic +0 to +10 Weapon Enhancement

**Feature**: `007-equipment-enhancement`  
**References**: [`docs/architecture/api-contracts.md`](../../../docs/architecture/api-contracts.md), [`docs/architecture/backend-architecture.md`](../../../docs/architecture/backend-architecture.md), [`docs/balancing/weapon-upgrade-costs.csv`](../../../docs/balancing/weapon-upgrade-costs.csv)

---

## 1. REST API Contracts (`/api/v1`)

Mọi endpoint `POST` BẮT BUỘC header `Authorization: Bearer <accessToken>` (kiểm tra chủ sở hữu `characterId`) và `X-Idempotency-Key: <UUIDv4>`.

| Method | Path | Request Body | Behavior, Locks & WAL Files |
| :---: | :--- | :--- | :--- |
| `POST` | `/api/v1/characters/:charId/equipment/equip` | `{ itemInstanceId: uuid, slot: EquipmentSlot }` | Kiểm tra `ownerCharacterId`, `levelReq <= Character.level`, `allowedClasses`, tương thích `slot`, quy tắc vũ khí 2 tay tự tháo `OFF_HAND` về ô trống túi, không trùng `RING_1`/`RING_2`; tính lại `ActiveSetBonusState`, `DerivedCombatStats` & `combatRating`. Locks: `["character:<id>", "inventory:<id>"]` → WAL |
| `POST` | `/api/v1/characters/:charId/equipment/unequip` | `{ slot: EquipmentSlot }` | Kiểm tra túi còn `>= 1` ô trống (`ERR_INVENTORY_FULL`), trả bản thể về túi, tính lại chỉ số & thưởng bộ set. Locks: `["character:<id>", "inventory:<id>"]` → WAL |
| `POST` | `/api/v1/characters/:charId/enhancement/upgrade` | `{ itemInstanceId: uuid }` | Kiểm tra bản thể là `WEAPON` thuộc chủ sở hữu, `enhancementLevel < 10` (`ERR_MAX_ENHANCEMENT_REACHED`), `bld_blacksmith.level >= tierRule.blacksmithLevelReq` (`ERR_BLACKSMITH_LEVEL_REQUIRED`), đủ `GOLD` & nguyên liệu (tự rút rương nếu `bld_storage >= Lv 2`), nâng chắc chắn `100%` `+N → +(N+1)`, kích hoạt mốc `+5`/`+10`, tính lại `WeaponATK` & `combatRating`. Locks: `["character:<id>", "house:<id>", "inventory:<id>", "ledger:<YYYY-MM>"]` → 1 WAL commit ghi 4 tệp (`characters`, `inventories`, `history/upgrade-history`, `ledgers/currency-ledger`) |
| `GET` | `/api/v1/characters/:charId/enhancement/history` | `?limit=50` | Đọc lịch sử cường hóa bất biến từ `data/db/history/upgrade-history-<charId>.json` |
| `POST` | `/api/v1/characters/:charId/equipment/repair` | `{ itemInstanceId: uuid, method: "GOLD_BLACKSMITH" \| "REPAIR_KIT" }` | Nếu `REPAIR_KIT`: tiêu `1` `csm_repair_kit`, hồi `+50% durabilityMax`. Nếu `GOLD_BLACKSMITH`: đứng trong `<= 96 px` của `bld_blacksmith` hoặc `npc_smith_garrik`, áp chiết khấu `0%/10%/20%/30%` (Lv 1..4), trừ `GOLD` qua `CurrencyLedger` (`EQUIPMENT_REPAIR`), hồi `100% durabilityMax`, gỡ trạng thái `WORN` nếu đang ở `0` |
| `POST` | `/api/v1/characters/:charId/equipment/dismantle` | `{ itemInstanceId: uuid, confirmHighValue?: boolean }` | Chặn vật phẩm đang mặc (`ERR_ITEM_EQUIPPED_CANNOT_DISMANTLE`), chặn vật phẩm không phải `WEAPON`/`EQUIPMENT`, yêu cầu `confirmHighValue: true` nếu `enhancementLevel >= 1` hoặc `rarity >= RARE`, kiểm tra chỗ trống túi cho nguyên liệu hoàn trả (`30%–50%`), xóa bản thể & cộng nguyên liệu qua WAL |
| `POST` | `/api/v1/characters/:charId/equipment/socket` | `{ itemInstanceId: uuid, gemInstanceId: uuid, socketIndex: 0\|1 }` | Hợp đồng lộ trình M2+: trong MVP trả `409 ERR_FEATURE_LOCKED_ROADMAP` trong khi bảo toàn `ItemInstance.sockets[]` |

### Canonical Error Codes
- `403 ERR_FORBIDDEN_OWNERSHIP`
- `409 ERR_MAX_ENHANCEMENT_REACHED` (`enhancementLevel === 10`)
- `409 ERR_BLACKSMITH_LEVEL_REQUIRED` (`bld_blacksmith.level < tierRule.blacksmithLevelReq`)
- `409 ERR_INSUFFICIENT_FUNDS` / `409 ERR_INSUFFICIENT_MATERIALS`
- `409 ERR_LEVEL_REQUIREMENT_NOT_MET` / `409 ERR_CLASS_PROFICIENCY_MISMATCH`
- `409 ERR_INVENTORY_FULL`
- `409 ERR_ITEM_EQUIPPED_CANNOT_DISMANTLE` / `409 ERR_CONFIRMATION_REQUIRED`
- `409 ERR_DURABILITY_ALREADY_FULL`
- `409 ERR_FEATURE_LOCKED_ROADMAP` (M2+ Socketing)
- `503 ERR_CONCURRENT_LOCK_TIMEOUT`

---

## 2. Enhancement Response Contract (`POST /enhancement/upgrade` `200 OK`)

```json
{
  "ok": true,
  "data": {
    "upgradeRecord": {
      "upgradeId": "01J9...",
      "itemInstanceId": "01J8...",
      "itemId": "wpn_iron_longsword",
      "fromLevel": 4,
      "toLevel": 5,
      "goldSpent": 1400,
      "materialsConsumed": [
        { "itemId": "mat_iron_ingot", "qty": 10 },
        { "itemId": "mat_spore_cap_dust", "qty": 8 },
        { "itemId": "mat_boar_tusk", "qty": 6 }
      ],
      "blacksmithLevel": 2,
      "result": "SUCCESS",
      "createdAt": "2026-11-19T16:00:00.000Z"
    },
    "milestoneUnlocked": "MILESTONE_PLUS_5",
    "weaponAtkAfter": 65,
    "combatRatingAfter": 1480,
    "currencies": { "gold": 3250, "starlightShard": 1600, "craftingToken": 4, "bossToken": 1, "starEssence": 0 }
  },
  "serverTime": "2026-11-19T16:00:00.000Z"
}
```

---

## 3. Internal Domain Events & Client Bridge

- **Backend `InternalEventBus`**:
  - `EquipmentChanged { characterId, equipment, activeSets[], derivedStats, combatRating }` → đồng bộ nóng `CombatActorRuntime` nếu nhân vật đang online trong `ZoneInstance`.
  - `WeaponEnhanced { characterId, itemInstanceId, itemId, toLevel, milestonePerk }` → lắng nghe bởi `quest` (hoàn thành nhiệm vụ rèn `+3`/`+5`/`+10`) và kích hoạt hào quang vũ khí `+5`/`+10` trên `WORLD_SNAPSHOT`.
- **Frontend `GameUiBridge`**:
  - `vfx:enhance_success` (`{ toLevel, milestonePerk }`) → phát tia lửa pixel và cập nhật shader/sprite hào quang `Weapon Glow I` (`+5`) / `Radiant Aura II` (`+10`) trong Phaser mà không che Boss Telegraph.
