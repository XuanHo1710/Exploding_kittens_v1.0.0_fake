# Quickstart Validation Guide: World & Movement

**Feature**: `003-world-movement` | **Prerequisites**: `001-foundation-game-engine`, `002-auth-character`.

## Validation Scenarios (Implementation Phase)
1. **Two-Client Movement & Interpolation**: Đăng nhập 2 nhân vật vào `zon_greenhaven_square`, di chuyển đồng thời dưới giả lập ping `80 ms` → xác nhận dự đoán mượt cho local player, nội suy `100 ms` cho remote player, sai lệch `< 6 px`.
2. **Speed & Wall Collision Anti-Cheat**: Gửi 80 `MOVE_INPUT`/s hoặc ép đi xuyên tile collision → server giữ ngoài tường, kẹp vận tốc tối đa và tăng `suspicionScore`.
3. **Spatial Grid Culling**: Đưa 2 nhân vật cách nhau `> 1500 px` trong `reg_whispering_forest` → xác nhận snapshot không gửi thực thể ngoài cụm `5x5` ô.
4. **Zone Portal, Homestead Idle Unload & Dirty Checkpoint**: Qua cổng Village → Homestead → Forest → Fast Travel về Village; rời Homestead `60s` xác nhận flush JSON & unload RAM; kiểm tra tọa độ không ghi JSON trong tick 20 Hz mà chỉ flush sau `30s` hoặc khi đổi zone.
