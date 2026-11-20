# Interface Contracts: Foundation, JSON-Only Database Engine & Game Loop Shell

**Feature**: `001-foundation-game-engine`

---

## 1. Internal Service Contract: `IJsonDatabaseEngine`

```ts
export interface IJsonDatabaseEngine {
  initAndRecover(): Promise<{ replayedWalCount: number; rebuiltIndexes: string[]; readOnlyMode: boolean }>;
  readAggregate<T>(collection: JsonCollection, entityId: string): Promise<JsonEnvelope<T> | null>;
  writeAggregateAtomic<T>(collection: JsonCollection, entityId: string, expectedRevision: number, data: T): Promise<JsonEnvelope<T>>;
  runTransaction<R>(options: {
    lockKeys: string[];
    idempotencyKey?: string;
    accountId?: string;
    action?: string;
    timeoutMs?: number; // default 3000
  }, work: (tx: JsonTxContext) => Promise<R>): Promise<R>;
  markDirtyForCheckpoint(collection: JsonCollection, entityId: string, payloadProvider: () => unknown): void;
  flushAllDirty(): Promise<number>;
  createBackup(reason: 'SCHEDULED_6H' | 'PRE_MIGRATION' | 'MANUAL_ADMIN'): Promise<BackupManifest>;
  verifyIntegrity(): Promise<{ validFiles: number; corruptedFiles: string[] }>;
}
```

### Error Codes Contract
- `ERR_PATH_TRAVERSAL_REJECTED`: `entityId` hoặc `relativePath` vi phạm whitelist.
- `ERR_CHECKSUM_MISMATCH`: Tệp JSON trên đĩa không khớp `checksumSha256`.
- `ERR_REVISION_CONFLICT`: `expectedRevision` khác `revision` hiện tại (OCC conflict).
- `ERR_CONCURRENT_LOCK_TIMEOUT`: Quá `3000 ms` chờ `AsyncLockManager`.
- `ERR_STORAGE_SAFE_READ_ONLY`: Ổ đĩa đầy hoặc mất quyền ghi → từ chối mọi mutation để bảo toàn dữ liệu.
- `ERR_IDEMPOTENCY_IN_FLIGHT`: Cùng `compositeKey` đang được xử lý song song.

---

## 2. REST API Contracts (Read-Only System & Catalog)

### `GET /api/v1/health`
- **Response `200 OK`**:
  ```json
  {
    "ok": true,
    "data": {
      "status": "UP",
      "protocolVersion": "1.0",
      "storageMode": "LOCAL_JSON",
      "readOnlyMode": false,
      "catalogManifestHash": "<sha256>",
      "tickRateHz": 20,
      "uptimeSeconds": 124
    },
    "serverTime": "2026-11-19T15:30:00.000Z"
  }
  ```

### `GET /api/v1/catalog/manifest`
- **Response `200 OK`**: Trả `{ manifestHash, files: { characters: "<sha256>", skills: "<sha256>", ... } }` cho 12 tệp trong `game-data/`.

### `GET /api/v1/catalog/:bundle`
- **Path Param**: `bundle` ∈ whitelist `characters | skills | monsters | bosses | items | recipes | crops | animals | buildings | quests | loot-tables | gacha-banners`.
- **Response `200 OK`**: Trả nội dung JSON của bundle kèm header `ETag: "<fileHash>"` và `Cache-Control: public, max-age=300`.
- **Response `404`**: `ERR_CATALOG_BUNDLE_NOT_FOUND` nếu ngoài whitelist.

---

## 3. Frontend Bridge Contract: `GameUiBridge` (Phaser 3 ↔ React/Zustand)

- `bridge.emit('world:hud_sync', { hp, maxHp, mp, maxMp, stamina, maxStamina, zoneId, pingMs })` (Throttled `<= 10 Hz`, chỉ bắn khi giá trị đổi).
- `bridge.emit('ui:modal_state', { hasOpenModal: boolean, captureKeyboard: boolean })` → `InputFocusManager` tạm khóa phím điều khiển Phaser.
- `bridge.emit('net:connection_state', { status: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED', attempt?: number })`.
