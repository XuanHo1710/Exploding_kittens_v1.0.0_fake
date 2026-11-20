# Interface Contracts: Authoritative Inventory, Ground Loot & Atomic Currency Ledger

**Feature**: `005-inventory-loot`  
**References**: [`docs/architecture/api-contracts.md`](../../../docs/architecture/api-contracts.md), [`docs/architecture/websocket-contracts.md`](../../../docs/architecture/websocket-contracts.md), [`docs/architecture/backend-architecture.md`](../../../docs/architecture/backend-architecture.md)

---

## 1. REST API Contracts (`/api/v1`)

Mọi endpoint `POST` thay đổi kho đồ hoặc tiền tệ BẮT BUỘC header `Authorization: Bearer <accessToken>` (kiểm tra sở hữu `characterId`) và `X-Idempotency-Key: <UUIDv4>`.

| Method | Path | Request Body | Behavior & WAL Locks |
| :---: | :--- | :--- | :--- |
| `GET` | `/api/v1/characters/:charId/inventory` | — | Trả `{ revision, bagCapacity, storageCapacity, bagItems, storageItems, equipment, currencies }` (`403 ERR_FORBIDDEN_OWNERSHIP` nếu khác chủ) |
| `POST` | `/api/v1/characters/:charId/inventory/move` | `{ fromContainer: "BAG"\|"STORAGE", fromSlot: int, toContainer: "BAG"\|"STORAGE", toSlot: int }` | Di chuyển, hoán đổi hoặc gộp chồng (`<= maxStack`). Nếu chạm `STORAGE`, kiểm tra nhân vật đứng trong `<= 96 px` của `bld_storage` thuộc sở hữu. Lock: `["inventory:<charId>"]` |
| `POST` | `/api/v1/characters/:charId/inventory/split` | `{ container: "BAG"\|"STORAGE", sourceInstanceId: uuid, splitQty: int, targetSlot: int }` | Kiểm tra `1 <= splitQty < source.quantity`, ô đích trống, cấp `UUIDv7` mới, bảo toàn tổng số lượng. Lock: `["inventory:<charId>"]` |
| `POST` | `/api/v1/characters/:charId/inventory/sort` | `{ container: "BAG"\|"STORAGE" }` | Gộp các chồng cùng `itemId` + `quality` và sắp xếp theo category/rarity; kiểm tra bất biến bảo toàn trước khi ghi |
| `POST` | `/api/v1/characters/:charId/shop/sell` | `{ npcId: string, itemInstanceId: uuid, quantity: int }` | Kiểm tra NPC hợp lệ trong tầm `<= 96 px`, vật phẩm không đang mặc trong `Character.equipment`, không khóa nhiệm vụ, `1 <= quantity <= instance.quantity`. Lock: `["character:<charId>", "inventory:<charId>", "ledger:<YYYY-MM>"]` → WAL trừ vật phẩm + cộng `GOLD` + ghi `CurrencyLedgerEntry` (`NPC_SELL`) |
| `GET` | `/api/v1/characters/:charId/economy/ledger` | `?currencyType=&month=YYYY-MM&limit=50` | Truy vấn lịch sử biến động 5 loại tiền tệ của chính nhân vật từ `data/db/ledgers/currency-ledger-<YYYY-MM>.json` |

### Canonical Error Codes
- `403 ERR_FORBIDDEN_OWNERSHIP`
- `400 ERR_VALIDATION_FAILED` (số lượng `<= 0`, vượt `maxStack`, sai slot)
- `409 ERR_INVENTORY_FULL`
- `409 ERR_ITEM_EQUIPPED_CANNOT_SELL`
- `409 ERR_OUT_OF_RANGE` (cách `bld_storage` hoặc NPC quá `96 px`)
- `409 ERR_INSUFFICIENT_FUNDS` (`balanceBefore + delta < 0`)
- `409 ERR_DUPLICATE_IDEMPOTENCY_KEY` (hoặc `200` trả `responseSnapshot` nếu đã hoàn tất)
- `503 ERR_CONCURRENT_LOCK_TIMEOUT`

---

## 2. WebSocket Realtime Contracts (Namespace `/game`)

### 2.1 Client → Server (`C2S_*`)
| Event Type | Rate Limit | Payload Schema | Server Validation Bắt buộc |
| :--- | :---: | :--- | :--- |
| `LOOT_PICKUP_REQ` | `6 / s` | `{ requestId: uuid, lootId: uuid }` | `lootId` tồn tại trong zone hiện tại, `!loot.claimed`, `characterId ∈ eligibleCharacterIds`, khoảng cách Euclidean `<= 96 px`, đủ ô trống túi đồ (nếu là `ITEM`). Ghi `claimed = true` nguyên tử trước khi chạy WAL |
| `INVENTORY_QUICK_USE` | `3 / s` | `{ idempotencyKey: uuid, itemInstanceId: uuid }` | Kiểm tra `ownerCharacterId === characterId`, `category === "CONSUMABLE"`, hồi chiêu bình `5,000 ms`, giới hạn `<= 2` food buffs đang chạy |

### 2.2 Server → Client (`S2C_*`)
- `LOOT_SPAWNED`: `{ lootId, x, y, lootKind, itemId?, quantity, rarity, eligibleCharacterIds[], expiresAt }` *(Chỉ gửi cho người chơi nằm trong `eligibleCharacterIds` ở chế độ `PERSONAL_INSTANCED`)*
- `LOOT_REMOVED`: `{ lootId, reason: "PICKED_UP" \| "EXPIRED", pickedByCharacterId? }`
- `INVENTORY_PATCH`: `{ revision, bagCapacity, storageCapacity, added[], updated[], removed[], currencies: { gold, starlightShard, craftingToken, bossToken, starEssence } }`
- `ACTION_ERROR`: `{ requestId?, code: "ERR_LOOT_NOT_ELIGIBLE"|"ERR_LOOT_EXPIRED"|"ERR_OUT_OF_RANGE"|"ERR_INVENTORY_FULL"|"ERR_CONSUMABLE_ON_COOLDOWN", messageVi }`

---

## 3. Internal Service Contracts (Dùng chung cho Features `006`–`011`)

```ts
export interface IEconomyService {
  applyLedgerDeltaInTx(
    tx: JsonTxContext,
    params: {
      characterId: string;
      idempotencyKey: string;
      currencyType: 'GOLD' | 'STARLIGHT_SHARD' | 'CRAFTING_TOKEN' | 'BOSS_TOKEN' | 'STAR_ESSENCE';
      delta: number; // non-zero integer
      reasonCode: CurrencyReasonCode;
      metadata: Record<string, unknown>;
    },
  ): Promise<{ walletAfter: CurrencyWallet; entry: CurrencyLedgerEntry }>;
}

export interface IInventoryService {
  addItemInTx(tx: JsonTxContext, characterId: string, itemId: string, qty: number, opts?: Partial<ItemInstance>): Promise<ItemInstance[]>;
  consumeMaterialsInTx(tx: JsonTxContext, characterId: string, reqs: Array<{ itemId: string; qty: number }>, allowStoragePull: boolean): Promise<void>;
  assertInventoryInvariants(agg: InventoryAggregate): void;
}
```

### Internal Domain Events (`InternalEventBus`)
- Lắng nghe `MonsterKilled` / `BossDefeated` (từ `combat` / `boss`) → `LootService` quay bảng rơi đồ và sinh `GroundLoot`.
- Phát `InventoryUpdated`, `ItemAcquired`, `LootDropped`, `LootPickedUp`, `CurrencyChanged` → lắng nghe bởi `quest` và WebSocket notifier.
