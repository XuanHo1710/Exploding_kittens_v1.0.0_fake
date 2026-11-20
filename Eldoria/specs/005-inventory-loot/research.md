# Phase 0 Research: Authoritative Inventory, Ground Loot & Atomic Currency Ledger

**Feature**: `005-inventory-loot`  
**Date**: 2026-11-19

---

## 1. Phân mảnh `inventories/<characterId>.json` Tách khỏi `characters/<characterId>.json`

- **Decision**: Lưu toàn bộ `bagItems[]` và `storageItems[]` trong tệp riêng `data/db/inventories/<characterId>.json` do `InventoryModule` sở hữu, tách khỏi `data/db/characters/<characterId>.json`. Khi thực hiện thao tác chỉ liên quan túi/rương (move, swap, split, sort, cất/lấy rương), chỉ cần giữ duy nhất 1 khóa `inventory:<charId>`. Khi giao dịch động chạm cả vật phẩm lẫn tiền tệ (NPC sell, loot Gold + Item, crafting, enhancement, gacha), lấy bộ khóa đã sắp xếp từ điển `["character:<charId>", "inventory:<charId>", "ledger:<YYYY-MM>"]` và chạy 1 WAL commit duy nhất.
- **Rationale**: Ngăn flush checkpoint vị trí mỗi `30 giây` (trên `characters/<charId>.json`) xung đột khóa hoặc ghi lại hàng trăm món đồ không đổi trong túi/rương, đồng thời loại bỏ toán học nguy cơ deadlock nhờ canonical lock ordering.
- **Alternatives considered (Rejected)**:
  - Nhúng toàn bộ 320 ô đồ vào `characters/<charId>.json` (tăng dung lượng JSON ghi mỗi 30 giây và gây tranh chấp khóa với checkpoint).
  - Dùng bảng quan hệ PostgreSQL/SQLite hoặc Redis Lua lock (bị cấm tuyệt đối theo Nguyên tắc I của Hiến pháp).

## 2. Cơ chế Chống Nhân bản Vật phẩm & Chống Nhặt Trùng (`GroundLoot` RAM Claim + JSON WAL)

- **Decision**: `GroundLoot` tồn tại hoàn toàn trong `Map<lootId, GroundLoot>` của `ZoneInstance` (`TTL = 120s`, dọn định kỳ mỗi `5s` không chạm đĩa). Khi xử lý `LOOT_PICKUP_REQ`:
  1. Kiểm tra đồng bộ trong RAM (`lootExists && !loot.claimed && eligible && dist <= 96 px`) rồi đặt ngay `loot.claimed = true` (atomic single-threaded JS turn) **trước** bất kỳ `await` nào.
  2. Lấy khóa `AsyncLockManager` (`["character:<id>", "inventory:<id>", "ledger:<YYYY-MM>"]` nếu là Gold, hoặc `["inventory:<id>"]` nếu là Item) và ghi nguyên tử qua `JsonDatabaseEngine`.
  3. Nếu thất bại do túi đầy (`ERR_INVENTORY_FULL`) hoặc lỗi tạm thời, đặt lại `loot.claimed = false` để vật phẩm vẫn nguyên vẹn trên đất; nếu thành công, xóa khỏi `ZoneInstance` và phát `LOOT_REMOVED` + `INVENTORY_PATCH`.
- **Rationale**: Loại bỏ triệt để cửa sổ race condition `TOCTOU` (Time-Of-Check-to-Time-Of-Use) khi 2 gói `LOOT_PICKUP_REQ` đến liên tiếp trong lúc giao dịch ghi JSON đang `await fsync`.
- **Alternatives considered (Rejected)**: Lưu vật phẩm rơi xuống đĩa JSON (gây hàng trăm lượt `fsync` vô ích khi đánh đàn quái, vi phạm Nguyên tắc IV); xóa loot trước khi kiểm tra túi đầy (gây mất đồ oan khi đầy túi).

## 3. Chiến lược Mở rộng Sổ cái Tiền tệ (`CurrencyLedger`) trên Tệp JSON Cục bộ

- **Decision**: Mọi module kinh tế (`loot`, `crafting`, `enhancement`, `building`, `gacha`, `quest`, `equipment`) PHẢI gọi duy nhất `EconomyService.applyLedgerDeltaInTx(tx, ...)` thay vì tự cộng trừ `Character.currencies`. Mặc định phân mảnh sổ cái theo tháng `data/db/ledgers/currency-ledger-YYYY-MM.json`, được kiểm soát bằng khóa `ledger:<YYYY-MM>`. Nếu đo tải ở mốc `100–500 CCU` cho thấy độ trễ chờ khóa `ledger:<YYYY-MM>` vượt `20 ms`, kiến trúc hỗ trợ chuyển cấu hình khóa phân mảnh sang theo ngày (`YYYY-MM-DD`) hoặc theo nhân vật (`ledgers/<charId>-YYYY-MM.json`) mà không đổi schema `CurrencyLedgerEntry`.
- **Rationale**: Vừa dễ đối soát tổng cung/cầu kinh tế toàn server ở quy mô MVP (20–50 CCU), vừa có lộ trình xử lý điểm nghẽn `fsync` trung thực theo Nguyên tắc VIII (`database-design.md §7`).
- **Alternatives considered (Rejected)**: Không ghi sổ cái và chỉ cập nhật số nguyên `gold` trên nhân vật (không thể điều tra lỗi lạm phát hay chứng minh không xảy ra double-spending).

## 4. Quy tắc `UUIDv7` & Kiểm chứng Bất biến Bảo toàn Vật phẩm (`Conservation Invariant`)

- **Decision**: Sử dụng hàm sinh `UUIDv7` thuần Node.js `crypto.randomBytes` (timestamp 48-bit monotonic + random 74-bit, zero third-party API) trong `packages/shared` cho mọi `ItemInstance.instanceId`, `GroundLoot.lootId`, `CurrencyLedgerEntry.ledgerEntryId`. Trước mỗi lần ghi `InventoryAggregate`, chạy hàm `assertInventoryInvariants()` kiểm tra: (a) không trùng `instanceId` giữa `bagItems` và `storageItems`, (b) không trùng `slotIndex` trong cùng container, (c) `ownerCharacterId === characterId`, (d) `1 <= quantity <= maxStack`.
- **Rationale**: Biến mọi lỗi logic tiềm ẩn thành lỗi fail-fast trước khi ghi đĩa, ngăn dữ liệu hỏng hoặc nhân bản lọt vào tệp JSON bền vững.
- **Alternatives considered (Rejected)**: Dùng số tự tăng cục bộ theo từng mảng (dễ trùng mã khi tách/gộp/xóa đồ và khó truy vết lịch sử cường hóa).
