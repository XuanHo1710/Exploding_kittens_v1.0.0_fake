# Data Model: Foundation, JSON-Only Database Engine & Game Loop Shell

**Feature**: `001-foundation-game-engine`  
**Storage**: 100% Local JSON Files (`data/db/**/*.json`) & Static Read-Only Catalog (`game-data/*.json`) — Zero External DBMS / Zero Third-Party Services.

---

## 1. `JsonEnvelope<T>` (Áp dụng cho mọi tệp trong `data/db/`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `JsonEnvelope.$schemaVersion` | `string` | Required; SemVer `^\d+\.\d+\.\d+$`; khởi tạo `"1.0.0"` | Phiên bản lược đồ phục vụ migration JSON |
| `JsonEnvelope.entityType` | `string` | Required; Enum whitelist (`Account`, `Session`, `Character`, `Inventory`, `Homestead`, `WorldRegion`, `Party`, `UpgradeHistory`, `GachaHistory`, `CurrencyLedger`, `SecurityAudit`, `IndexMap`, `SchemaManifest`) | Phân loại tập hợp dữ liệu |
| `JsonEnvelope.entityId` | `string` | Required; UUIDv7 hoặc Canonical ID khớp `^[a-zA-Z0-9_-]{3,64}$` (cấm `..`, `/`, `\`) | Khóa định danh an toàn đường dẫn |
| `JsonEnvelope.revision` | `integer` | Required; `>= 1`; tăng đúng `+1` mỗi lần ghi thành công | Kiểm soát đồng thời lạc quan (OCC) |
| `JsonEnvelope.updatedAt` | `string` | Required; ISO-8601 UTC string từ đồng hồ server | Thời điểm ghi cuối |
| `JsonEnvelope.checksumSha256` | `string` | Required; 64 ký tự hex chữ thường (`^[0-9a-f]{64}$`); SHA-256 của canonical JSON `data` | Phát hiện hỏng tệp hoặc sửa tay trái phép |
| `JsonEnvelope.data` | `T` | Required; phải hợp lệ theo Zod schema của `entityType` | Nội dung bản ghi nghiệp vụ |

---

## 2. `WalTransaction` (`data/db/wal/tx-<txId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `WalTransaction.txId` | `string` | Required; UUIDv7 | Định danh duy nhất của giao dịch đa tệp |
| `WalTransaction.idempotencyKey` | `string \| null` | Optional; max 128 ký tự; duy nhất trong 24h nếu khác `null` | Khóa chống thực thi lặp |
| `WalTransaction.status` | `string` | Required; Enum `PREPARED \| COMMITTED` | Trạng thái pha WAL |
| `WalTransaction.lockKeys` | `string[]` | Required; mảng đã sắp xếp tăng dần theo bảng chữ cái, độ dài `1..16` | Danh sách khóa aggregate đã giữ |
| `WalTransaction.operations` | `WalOperation[]` | Required; độ dài `1..20`; mỗi phần tử gồm `relativePath` (đã qua guard), `expectedRevision` (`>= 0`), `afterEnvelope` (`JsonEnvelope`) | Toàn bộ ảnh đích cho roll-forward lũy đẳng |
| `WalTransaction.checksumSha256` | `string` | Required; `^[0-9a-f]{64}$` | Bảo vệ tính nguyên vẹn của chính tệp WAL |
| `WalTransaction.createdAt` | `string` | Required; ISO-8601 UTC | Dấu thời gian bắt đầu giao dịch |

**State Transitions (`WalTransaction.status`)**:
`[Created in RAM]` → `PREPARED` (written + `fsync` to `data/db/wal/tx-<txId>.json`) → `[Apply all target atomic renames]` → `COMMITTED` (written + `fsync`) → `[Delete WAL file]`.

---

## 3. `SchemaManifest` (`data/db/meta/schema-manifest.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `SchemaManifest.currentVersion` | `string` | Required; SemVer `^\d+\.\d+\.\d+$` | Phiên bản schema tổng thể hiện tại |
| `SchemaManifest.initializedAt` | `string` | Required; ISO-8601 UTC | Thời điểm khởi tạo database JSON |
| `SchemaManifest.migrationsApplied` | `MigrationRecord[]` | Required; mảng đối tượng `{ id, fromVersion, toVersion, appliedAt, backupPath }` | Lịch sử nâng cấp lược đồ |

---

## 4. `BackupManifest` (`data/backups/<YYYYMMDD-HHMMSS>/backup-manifest.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `BackupManifest.backupId` | `string` | Required; `^\d{8}-\d{6}$` | Mã định danh thư mục bản chụp |
| `BackupManifest.reason` | `string` | Required; Enum `SCHEDULED_6H \| PRE_MIGRATION \| MANUAL_ADMIN` | Nguyên nhân tạo bản sao lưu |
| `BackupManifest.fileCount` | `integer` | Required; `>= 1` | Tổng số tệp JSON đã sao lưu |
| `BackupManifest.totalBytes` | `integer` | Required; `>= 0` | Tổng dung lượng bản sao lưu |
| `BackupManifest.rootChecksumSha256` | `string` | Required; `^[0-9a-f]{64}$` | Hash tổng hợp danh sách checksum từng tệp |
| `BackupManifest.createdAt` | `string` | Required; ISO-8601 UTC | Thời điểm tạo bản chụp |

---

## 5. `IdempotencyRecord` (`data/db/indexes/idempotency/<accountId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `IdempotencyRecord.compositeKey` | `string` | Required; `<action>:<key>`, max 180 ký tự (phân mảnh tệp theo `<accountId>` để tránh khóa toàn cục) | Khóa duy nhất theo tài khoản và hành động |
| `IdempotencyRecord.status` | `string` | Required; Enum `IN_FLIGHT \| COMPLETED` | Chặn xử lý song song và trả kết quả cũ |
| `IdempotencyRecord.responseSnapshot` | `object \| null` | Optional; kích thước tối đa `16 KB` | Phản hồi đã lưu để trả lại khi replay |
| `IdempotencyRecord.expiresAt` | `string` | Required; ISO-8601 UTC (`createdAt + 24h`) | Thời điểm tự dọn dẹp |

---

## 6. `CatalogBundle` (Read-Only RAM nạp từ `game-data/*.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `CatalogBundle.manifestHash` | `string` | Required; `^[0-9a-f]{64}$` | Hash tổng của 12 tệp JSON trong `game-data/` |
| `CatalogBundle.loadedAt` | `string` | Required; ISO-8601 UTC | Thời điểm nạp thành công khi boot |
| `CatalogBundle.files` | `Record<CatalogName, object>` | Required; phải đủ đúng 12 khóa (`characters`, `skills`, `monsters`, `bosses`, `items`, `recipes`, `crops`, `animals`, `buildings`, `quests`, `loot-tables`, `gacha-banners`) | Bảng tra cứu `Map` chỉ đọc (`Object.freeze`) |
