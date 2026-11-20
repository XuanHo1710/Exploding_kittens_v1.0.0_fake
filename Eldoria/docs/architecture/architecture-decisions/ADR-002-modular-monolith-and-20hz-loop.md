# ADR-002: Modular Monolith NestJS & Tách biệt Vòng lặp 20 Hz Server Tick

- **Trạng thái**: Accepted
- **Ngày quyết định**: 2026-11-19
- **Liên kết**: [`.specify/memory/constitution.md`](../../../.specify/memory/constitution.md), [`docs/architecture/backend-architecture.md`](../backend-architecture.md), [`docs/architecture/game-server-architecture.md`](../game-server-architecture.md)

---

## 1. Bối cảnh (Context)

Game online multiplayer RPG bao gồm hơn 20 nghiệp vụ (identity, character, world, movement, combat, skill, inventory, loot, equipment, crafting, enhancement, gacha, farming, animal, building, quest, dungeon, boss, party, chat, economy). Nếu chia thành microservices ngay từ đầu sẽ tạo độ phức tạp triển khai khổng lồ, chi phí mạng nội bộ làm tăng độ trễ combat và phá vỡ khả năng quản lý khóa cục bộ của `JsonDatabaseEngine` (ADR-001).

---

## 2. Quyết định (Decision)

1. **Modular Monolith trong Monorepo**:
   - Tổ chức monorepo chuẩn: `apps/client`, `apps/game-server`, `packages/shared`, `packages/game-config`, `game-data`, `assets`, `docs`, `specs`, `tools`.
   - Toàn bộ 21 domain module chạy trong một tiến trình **NestJS** duy nhất (`apps/game-server`), giao tiếp nội bộ qua Dependency Injection có hướng phụ thuộc chặt chẽ (acyclic) và `InternalEventBus` đồng bộ/bất đồng bộ.
2. **Tách biệt Vòng lặp Mô phỏng 20 Hz (Fixed Timestep Simulation)**:
   - `SimulationEngine` chạy vòng lặp cố định `50 ms/tick` (`20 Hz`) xử lý movement queue, hitbox/combat, skill timers, cooldown, regen, monster AI, boss phase và world timers trong bộ nhớ RAM.
   - `SnapshotBroadcaster` phát gói cập nhật độc lập ở tần suất cấu hình được (mặc định `10 Hz` = `100 ms/snapshot`) kèm interest management theo spatial grid.
   - HTTP REST API (đăng nhập, chọn nhân vật, mở gacha, đọc catalog, lịch sử) và WebSocket Realtime Gateway dùng chung tầng Domain Services và `JsonDatabaseEngine`.
3. **Tách biệt Đường nóng (Hot Path) và Đường bền vững (Persistence Path)**:
   - Vòng lặp 20 Hz **TUYỆT ĐỐI KHÔNG** gọi `fs.writeFile` đồng bộ trong tick. Mọi lệnh ghi JSON đẩy qua `PersistenceQueue` bất đồng bộ (hoặc `DirtyCheckpointFlusher` 30 giây cho tọa độ).

---

## 3. Các Phương án Bị từ chối (Rejected Alternatives)

- **Microservices tách riêng Auth/Combat/Inventory/Gacha**: Gây phân tán giao dịch (distributed transactions), tăng độ trễ mạng 10–40ms giữa các dịch vụ và không tương thích với khóa cục bộ của JSON Database đơn nút.
- **Server tick 60 Hz**: Tăng gấp 3 lần tải CPU/băng thông không cần thiết đối với game Action RPG top-down pixel art 2D có client interpolation mượt ở 60 FPS.

---

## 4. Hệ quả (Consequences)

- **Tích cực**: Dễ phát triển, debug và kiểm thử tích hợp cho nhóm nhỏ; độ trễ nội bộ < 1 ms; bảo toàn tính nguyên tử giao dịch JSON DB.
- **Đánh đổi**: Khi tải vượt ngưỡng 1 tiến trình CPU (cần đo ở mốc 500 CCU), chiến lược mở rộng tương lai là tách tiến trình theo World Shard/Region với thư mục JSON riêng biệt cho từng shard.
