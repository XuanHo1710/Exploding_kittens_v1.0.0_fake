# Phase 0 Research: Survival, Farming, Animal Husbandry & Homestead Building System

**Feature**: `008-housing-farming`  
**Date**: 2026-11-19

---

## 1. Kiến trúc Mô phỏng Offline Theo Đồng hồ Máy chủ (Lazy Catch-Up, Trần 24 Giờ)

- **Decision**: Không chạy timer hay simulation tick trong RAM cho các lãnh địa đang offline. Khi chủ sở hữu hoặc thành viên Party truy cập `GET /api/v1/characters/:charId/homestead` hoặc bước vào `zon_player_homestead`, `OfflineHomesteadSimulator` chạy một lượt mô phỏng xác định (deterministic catch-up) trong khóa `house:<ownerId>`:
  1. Đọc `serverNow = Date.now()`, tính `cappedMs = Math.min(Math.max(0, serverNow - lastSimulatedAtMs), 86_400_000)`.
  2. Hoàn tất mọi `BuildingInstance` có `completesAt <= serverNow` (chuyển sang `ACTIVE`, cập nhật `level` & `assetVariantKey`).
  3. Chia khoảng `[lastSimulatedAtMs, lastSimulatedAtMs + cappedMs]` theo các đoạn ranh giới ngày/mùa/thời tiết lưu trong `data/db/world/world-clock.json` (`weatherHistory24h`, tối đa 60 ngày game = `< 18 KB`) để mô phỏng chính xác mưa tự tưới, `autoIrrigation`, đổi mùa héo (`Lv < 4`) hoặc nhà kính `0.75x` (`Lv 4`), và `autoHarvest` (giới hạn `<= 10` chu kỳ regrow/24h nếu `bld_storage` còn chỗ).
  4. Mô phỏng đàn động vật theo bước `dt = 0.25 giờ` (15 phút) trong `cappedHours <= 24`: xử lý `autoFeeder` rút từ `bld_storage` khi `hunger <= 30`, giảm `hunger`, kẹp sàn `health >= 20`, chuyển `BABY → ADULT`, và tạo sản phẩm (`autoCollector` giới hạn 12 lượt/24h hoặc `pendingProduce` tối đa `3` lượt/con).
  5. Ghi cập nhật kết quả (kèm `storageItems` nếu auto-pull/auto-collect có biến động) trong 1 giao dịch WAL nguyên tử.
- **Rationale**: Giữ chi phí RAM/CPU bằng `0` cho người chơi offline, bảo vệ tuyệt đối trước hành vi chỉnh đồng hồ client (Nguyên tắc II) và ngăn lạm phát tài nguyên khi bỏ game nhiều tuần.
- **Alternatives considered**: Chạy cron nền mỗi phút quét toàn bộ thư mục `data/db/houses/*.json` (bị từ chối vì tạo bão I/O đĩa khi có hàng nghìn tài khoản đã tạo); để client tự tính thời gian chín (bị từ chối vì dễ chỉnh giờ hệ điều hành gian lận); dùng Redis sorted sets cho timers (bị cấm tuyệt đối theo Hiến pháp Nguyên tắc I).

## 2. Kiểm định Đặt Công trình 7 Lớp & Thuật toán BFS Flood-Fill Reachability

- **Decision**: Trên lưới lãnh địa `32×24 tiles` (`768` ô), `BuildingPlacementValidator` dựng mảng byte `Uint8Array(768)` kết hợp tĩnh từ Tiled map (`no_build_mask`, `mandatory_road_tiles`, `spawn_points`, `quest_corridor_mask`) và động từ toàn bộ `BuildingInstance` đang có + công trình mới (đã xoay footprint `W×H` hoặc `H×W` cùng tọa độ tương đối `interactionPoints`). Sau khi xác minh không trùng bất kỳ ô cấm hay ô footprint nào, chạy BFS từ `homesteadEntranceSpawnTile (16, 23)` đi 4 hướng (`UP/DOWN/LEFT/RIGHT`). Công trình hợp lệ khi và chỉ khi toàn bộ `interactionPoints` của MỌI công trình (cũ và mới) và vị trí hiện tại của mọi nhân vật trong homestead đều thuộc tập ô reachable của BFS.
- **Rationale**: `Uint8Array(768)` BFS duyệt tối đa `768` ô chỉ tốn `< 0.1 ms` trong V8 (`proposed / unverified`), loại bỏ 100% lỗi tự nhốt mình, bít cửa kho hay xoay công trình quay mặt vào tường rào mà không cần thư viện bản đồ ngoài.
- **Alternatives considered**: Chỉ kiểm tra AABB overlap mà không kiểm tra BFS (bị từ chối vì người chơi có thể xếp 4 công trình quây kín cổng ra vào hoặc điểm tương tác `OPEN_STORAGE`).

## 3. Ràng buộc Phối hợp Giữa `houses/<id>.json`, `characters/<id>.json` và `inventories/<id>.json`

- **Decision**: Mọi thao tác làm thay đổi đồng thời tiền/nguyên liệu và trạng thái lãnh địa (đặt/nâng cấp/hủy/phá dỡ công trình, mua/bán động vật, gieo hạt/bón phân/thu hoạch, thu gom sản phẩm động vật, ăn món ăn) đều dùng chung quy ước khóa thứ tự từ điển của `AsyncLockManager`: `["character:<id>", "house:<id>", "inventory:<id>", "ledger:<YYYY-MM>"]` và ghi nguyên tử qua JSON WAL hai pha + `IdempotencyStore` 24 giờ.
- **Rationale**: Loại bỏ hoàn toàn deadlock và các lỗi race condition (`TS-ANM-04` mua vượt sức chứa chuồng, `TS-BLD-04` đặt trùng vị trí/chi tiêu hai lần, `TS-FRM` nhân bản thu hoạch).
- **Alternatives considered**: Ghi riêng từng tệp tuần tự không có WAL (bị từ chối vì dễ gây mất Gold khi crash trước khi tạo công trình/động vật).

## 4. Đồng bộ Hóa Trạng thái Lãnh địa `PARTY_ACCESS` & Tách Rời Render 60 FPS

- **Decision**: Khi thành viên Party đang ở trong cùng `zon_player_homestead`, mọi cập nhật công trình/ô đất/động vật được broadcast qua WebSocket sự kiện nhẹ (`building.updated`, `farm.tile.updated`, `animal.state.updated`) vào `WorldStateBuffer` của Phaser (render Y-sorted `32x32` sprite, bóng mờ `BuildingGhostSystem`, bong bóng trạng thái trên đầu động vật) và chỉ đẩy bản tóm tắt sang `useHomesteadStore` / `useHudStore` (React) khi người chơi mở bảng quản lý hoặc giá trị HUD thay đổi.
- **Rationale**: Tuân thủ Nguyên tắc IV & V (tách vòng render 60 FPS khỏi React state, đảm bảo pixel-perfect `32x32` snapping không lệch nửa pixel).
- **Alternatives considered**: Đồng bộ lại toàn bộ tệp `houses/<id>.json` 10 lần/giây vào React state (bị từ chối vì gây re-render nặng và tốn băng thông).
