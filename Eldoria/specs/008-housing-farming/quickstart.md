# Quickstart Validation Guide: Survival, Farming, Animal Husbandry & Homestead Building System

**Feature**: `008-housing-farming`  
**Mode Note**: Đây là hướng dẫn kiểm chứng dành cho giai đoạn triển khai (`IMPLEMENTATION MODE`), không chạy trên mã nguồn production chưa tồn tại.

---

## 1. Prerequisites
- Các feature nền tảng đã sẵn sàng: `001-foundation-game-engine` (`JsonDatabaseEngine`, `GameCatalogLoader`), `002-auth-character`, `003-world-movement`, `005-inventory-loot`.
- Các tệp catalog chuẩn trong `game-data/`: `crops.json` (15/5 MVP), `animals.json` (6/2 MVP), `buildings.json` (13/6 MVP), `items.json`.
- Bản đồ Tiled lãnh địa `assets/maps/zon_player_homestead.tmj` (`32×24 tiles`) kèm `no_build_mask`, `mandatory_road_tiles`, `spawn_points`, `quest_corridor_mask`.

---

## 2. End-to-End Validation Scenarios (Khi đã Triển khai)

1. **Sinh tồn & 2 Kênh Food Buff**:
   - Cho nhân vật tiêu hao `Hunger` xuống `0` → xác nhận trạng thái `EXHAUSTED` (`maxStamina = 60%`), HP không tụt về `0`.
   - Ăn `csm_golden_roast` (`FOOD_COMBAT`), `csm_berry_pie` (`FOOD_UTILITY`), sau đó ăn `csm_ember_curry` (`FOOD_COMBAT`) → xác nhận giữ đúng `2` buff và ghi đè đúng kênh `FOOD_COMBAT`.
2. **Nông trại 15 Giống & Chống Chỉnh Đồng hồ Client (`TS-FRM-001`, `TS-FRM-002`)**:
   - Cuốc đất, gieo `sed_sunwheat`, bón `csm_fertilizer_basic`, tưới nước; chỉnh đồng hồ hệ điều hành máy khách tiến `+10 giờ` và tải lại → xác nhận tiến trình không đổi.
   - Tiến đồng hồ server ảo đủ `12 phút` ẩm → thu hoạch nhận `2–4` (+1 bonus) `mat_sunwheat_grain` với chất lượng `NORMAL`/`SILVER`/`GOLD`.
3. **Chăn nuôi 6 Loài & Trần Offline 24 Giờ Không Chết (`TS-FRM-003`, `TS-ANM-02`)**:
   - Mua `anm_meadow_chicken` vào `bld_chicken_coop` Lv 1 và `anm_clover_cow` vào `bld_farm_plot` Lv 2.
   - Mô phỏng offline `72 giờ` không `autoFeeder` → gọi `GET /homestead` xác nhận mô phỏng bị chặn ở `24 giờ`, `health === 20` (không chết), `pendingProduce.length <= 3`.
   - Kiểm tra chống spam: `FEED` khi `hunger >= 90` trả `ERR_ANIMAL_ALREADY_FULL`; `PET` lần 2 trong cùng ngày game không cộng thêm `Happiness`.
4. **Đặt Công trình `32×32`, BFS Reachability & Cổng `bld_blacksmith` (`TS-FRM-004`, `TS-BLD-01`..`05`)**:
   - Đặt `bld_blacksmith` đè `mandatory_road_tiles` hoặc quây kín `OPEN_STORAGE` → xác nhận nhận `409 ERR_PLACEMENT_FORBIDDEN_ZONE` / `ERR_INTERACTION_POINT_UNREACHABLE`.
   - Nâng `bld_blacksmith` từ Lv 1 đến Lv 4 theo thời gian server → xác nhận `assetVariantKey` đổi tuần tự `lv1 → lv4` và cấp độ lưu bền vững trong `data/db/houses/<charId>.json`.
5. **Phân quyền `OWNER_ONLY` vs `PARTY_ACCESS` & Concurrency**:
   - Thành viên Party tưới nước `bld_farm_plot` & vuốt ve gà thành công; gửi `HARVEST`, `COLLECT`, `OPEN_STORAGE` hoặc `UPGRADE` bị từ chối `403 ERR_FORBIDDEN_NOT_OWNER` + ghi `security-audit`.
   - Bắn 5 lệnh `POST /buildings/place` song song khi chỉ đủ tài nguyên xây 1 cái → đúng 1 lệnh thành công, 4 lệnh thất bại sạch.

---

## 3. Tham chiếu
- Tài liệu thiết kế chi tiết: [`12-farming-system.md`](../../docs/game-design/12-farming-system.md), [`13-animal-husbandry.md`](../../docs/game-design/13-animal-husbandry.md), [`14-building-system.md`](../../docs/game-design/14-building-system.md)
- Lược đồ dữ liệu & ràng buộc trường: [`data-model.md`](./data-model.md)
- Hợp đồng giao diện: [`contracts/housing-farming-contract.md`](./contracts/housing-farming-contract.md)
