# Quickstart Validation Guide: Resource Gathering & Multi-Station Crafting System

**Feature**: `006-gathering-crafting`  
**Mode Note**: Đây là hướng dẫn kiểm chứng cho giai đoạn triển khai (`IMPLEMENTATION MODE`), không chạy trên mã nguồn production chưa tồn tại.

---

## 1. Prerequisites
- Các feature nền tảng đã sẵn sàng: `001-foundation-game-engine` (`JsonDatabaseEngine`, `GameCatalogLoader`), `002-auth-character`, `003-world-movement` (`ZoneInstance`), `005-inventory-loot` (`InventoryService`).
- Các tệp catalog hợp lệ trong `game-data/`: `recipes.json` (36 công thức, 22 MVP), `items.json`, `buildings.json`.
- Tệp thế giới khởi tạo cục bộ `data/db/world/reg_greenhaven_village.json` và `data/db/world/reg_whispering_forest.json` chứa đủ 5 loại `ResourceNodeState`.

---

## 2. End-to-End Validation Scenarios (Khi đã Triển khai)

1. **Khai thác Đủ 5 Loại Node & Tái sinh Theo Đồng hồ Server**:
   - Đưa nhân vật tới trong phạm vi `<= 96 px` của từng loại node (`TREE`, `STONE`, `ORE_VEIN`, `HERB_PATCH`, `FISHING_SPOT`).
   - Gửi `INTERACT_REQ` (`targetType: "NODE"`): xác nhận trừ đúng `8`/`4` Stamina, cộng nguyên liệu vào `data/db/inventories/<charId>.json`, giảm `remainingCharges` về `0` và sinh `respawnAt`.
   - Thử đứng ở `140 px` hoặc hạ bậc công cụ xuống `0` trước node yêu cầu bậc `1`: xác nhận nhận `ERR_NODE_OUT_OF_RANGE` / `ERR_TOOL_TIER_TOO_LOW` và không mất Stamina.
2. **Chế tạo Nguyên tử Tại Trạm Công cộng & Lãnh địa**:
   - Gọi `POST /api/v1/characters/:charId/crafting/execute` với `rcp_smelt_copper_ingot` (`count: 2`) tại `npc_smith_garrik`, kèm `X-Idempotency-Key`.
   - Gửi lặp lại cùng `X-Idempotency-Key`: xác nhận trả lại đúng snapshot `jobId` cũ, không trừ thêm `mat_copper_ore` hay Gold.
   - Đợi đủ `completesAt`, gọi `POST /crafting/jobs/:jobId/claim`: xác nhận nhận `2 mat_copper_ingot`, `30 EXP`, và kiểm tra `data/db/ledgers/currency-ledger-<YYYY-MM>.json` có bút toán `CRAFT_FEE` khớp `txId`.
3. **Tự động Rút Nguyên liệu Từ `bld_storage` Lv 2**:
   - Để túi đồ trống, đặt `mat_sunwheat_grain`, `mat_wild_berry`, `mat_moon_herb_leaf` trong `storageItems` với `bld_storage` Lv 2.
   - Chế tạo `rcp_cook_herb_stew` tại `bld_kitchen` Lv 1: xác nhận nguyên liệu bị trừ từ `storageItems` và thành phẩm vào `bagItems`.
4. **Hàng đợi, Hiệu suất Trạm & Hủy Hoàn 80%**:
   - Đặt `rcp_smelt_steel_ingot` tại `bld_furnace` Lv 1 (`+20%` tốc độ) rồi gọi `POST /crafting/jobs/:jobId/cancel` trước `completesAt`.
   - Xác nhận hoàn trả `Math.floor(qty * 0.8)` nguyên liệu, `Math.floor(goldCost * 0.8)` Gold và có bút toán `CRAFT_CANCEL_REFUND`.
5. **Kiểm chứng Concurrency & WAL Recovery**:
   - Bắn 20 request `POST /crafting/execute` song song với nguyên liệu chỉ đủ cho 1 mẻ và mô phỏng crash sau pha WAL `PREPARED`.
   - Kỳ vọng: Đúng 1 mẻ thành công, 19 mẻ nhận `ERR_INSUFFICIENT_MATERIALS`, `0` số dư âm, `0` tệp JSON hỏng sau boot recovery.

---

## 3. Tham chiếu
- Dữ liệu chuẩn: [`game-data/recipes.json`](../../game-data/recipes.json), [`game-data/buildings.json`](../../game-data/buildings.json)
- Lược đồ & ràng buộc trường: [`data-model.md`](./data-model.md)
- Hợp đồng giao thức: [`contracts/gathering-crafting-contract.md`](./contracts/gathering-crafting-contract.md)
