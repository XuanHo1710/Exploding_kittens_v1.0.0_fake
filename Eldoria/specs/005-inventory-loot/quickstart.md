# Quickstart Validation Guide: Authoritative Inventory, Ground Loot & Atomic Currency Ledger

**Feature**: `005-inventory-loot`  
**Prerequisites**: `001-foundation-game-engine`, `002-auth-character`, `003-world-movement`, `004-combat-skills`.  
**Mode Note**: Hướng dẫn kiểm chứng áp dụng khi chuyển sang `IMPLEMENTATION MODE`; trong `DESIGN_AND_PLANNING_ONLY` không tạo mã nguồn production.

---

## 1. End-to-End Validation Scenarios (Khi đã Triển khai)

1. **Inventory CRUD, Split/Merge & Anti-Duplication Stress (`SEC-006`)**:
   - Khởi tạo nhân vật với `40` ô túi đồ và `bld_storage` Lv 1 (`40` ô rương), đặt chồng `20` `mat_oak_wood`.
   - Bắn đồng thời `20` request `split`, `move` và `transfer` vào cùng `itemInstanceId`.
   - Kỳ vọng: Tổng số lượng `mat_oak_wood` bảo toàn chính xác `20`, `0` bản thể trùng `instanceId`, `0` ô trùng `slotIndex` trong `data/db/inventories/<charId>.json`.
2. **GroundLoot `PERSONAL_INSTANCED` Anti-Ninja-Loot & `120s` TTL (`SEC-011`)**:
   - Party 2 người (A và B) hạ `mob_timber_wolf` → xác nhận `LootService` chạy 4 bước roll từ `ltb_mob_timber_wolf` và tạo bản thể rơi riêng cho A và B (`0` lượt ghi đĩa khi đồ nằm trên đất).
   - Cho B gửi `LOOT_PICKUP_REQ` vào `lootId` của A → bị chặn `ERR_LOOT_NOT_ELIGIBLE` + ghi audit.
   - Cho A gửi `LOOT_PICKUP_REQ` từ khoảng cách `300 px` → bị chặn `ERR_OUT_OF_RANGE`.
   - Cho A đi lại `<= 96 px` khi túi đầy → bị chặn `ERR_INVENTORY_FULL` nhưng đồ vẫn nằm nguyên trên đất; dọn 1 ô rồi nhặt lại → thành công và gửi `INVENTORY_PATCH`.
   - Để 1 món rơi quá `120s` → tự hủy khỏi RAM và phát `LOOT_REMOVED { reason: "EXPIRED" }`.
3. **Atomic 5-Currency Ledger, Double-Spending & Replay Protection (`SEC-007`, `SEC-008`)**:
   - Bắn song song `10` request trừ `400 GOLD` trên tài khoản có `500 GOLD` → đúng `1` lệnh thành công (`balanceAfter = 100`), `9` lệnh nhận `409 ERR_INSUFFICIENT_FUNDS`, số dư không bao giờ âm.
   - Phát lại `5` lần lệnh `POST /shop/sell` với cùng `X-Idempotency-Key` → chỉ thực thi đúng `1` lần, `data/db/ledgers/currency-ledger-<YYYY-MM>.json` chỉ có `1` bút toán và tổng delta khớp `100%` `CurrencyWallet`.
4. **Cross-Account IDOR & Negative Quantity Injection (`SEC-005`)**:
   - Dùng token Account B gọi `GET /characters/<charA>/inventory` và `POST /shop/sell` với `quantity: -50` → chặn `403 ERR_FORBIDDEN_OWNERSHIP` và `400 ERR_VALIDATION_FAILED`.

---

## 2. Tham chiếu
- Thiết kế JSON DB & WAL: [`docs/architecture/database-design.md`](../../docs/architecture/database-design.md)
- Danh mục vật phẩm & bảng rơi đồ chuẩn: [`game-data/items.json`](../../game-data/items.json), [`game-data/loot-tables.json`](../../game-data/loot-tables.json)
- Kế hoạch kiểm thử bảo mật: [`docs/testing/security-test-plan.md`](../../docs/testing/security-test-plan.md)
