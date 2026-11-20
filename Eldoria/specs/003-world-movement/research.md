# Phase 0 Research: Open World Maps, Partitioning, Movement & Sync

**Feature**: `003-world-movement` | **Date**: 2026-11-19

---

## 1. Shared Collision Math (`packages/shared`) cho Tiled `.tmj` Maps

- **Decision**: Cả `apps/game-server` (MovementModule) và `apps/client` (PredictionSystem) nạp cùng tệp collision grid trích xuất từ lớp `collision` của Tiled `.tmj` (`32x32 px` tiles) và chạy chung hàm `resolveCircleTileCollision(x, y, footboxW=20, footboxH=14, dx, dy, speed, dt)` trong `packages/shared/src/math/collision.ts`.
- **Rationale**: Khi server và client dùng chung đúng một thuật toán va chạm có trượt tường (axis-separated AABB slide), sai lệch prediction giảm xuống gần như `0 px` trên kết nối bình thường.
- **Alternatives considered**: Dùng Phaser Arcade Physics chỉ trên client và viết tay logic khác trên server (bị từ chối vì gây lệch va chạm góc tường liên tục).

## 2. Spatial Hash Grid & Delta Encoding (Zero Redis)

- **Decision**: Mỗi `ZoneInstance` quản lý `SpatialHashGrid` nội bộ trong RAM (`Map<string, Set<EntityId>>`, cell `256x256 px`). Ở chu kỳ `10 Hz`, `SnapshotBroadcaster` lưu `lastSentEntityState` cho từng socket để chỉ gửi các trường thay đổi (`x`, `y`, `facing`, `animState`, `hp`).
- **Rationale**: Giảm băng thông 60–80% ở khu đông người và đạt `O(1)` cập nhật ô lưới mà không cần Redis hay thư viện không gian ngoài.
- **Alternatives considered**: Quadtree động (chi phí tái cân bằng cao hơn với thực thể di chuyển liên tục so với Spatial Hash Grid trên bản đồ giới hạn `<= 100x100` tiles).

## 3. Lazy-Loaded Private Homestead Instances

- **Decision**: Homestead của mỗi người chơi (`homestead:<charId>`) được tạo `ZoneInstance` trong RAM khi chủ sở hữu hoặc thành viên Party được phép bước vào; bộ hẹn giờ dọn dẹp tự động chạy flush JSON và dỡ khỏi RAM sau `60 giây` khi `playerCount === 0`.
- **Rationale**: Giữ bộ nhớ server thấp ngay cả khi có hàng nghìn tài khoản đã tạo nhà trong `data/db/houses/*.json`.
- **Alternatives considered**: Giữ toàn bộ Homestead thường trực trong RAM (lãng phí bộ nhớ lớn).
