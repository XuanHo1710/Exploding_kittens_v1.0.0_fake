# ADR-003: Server-Authoritative Simulation, Client Prediction & Reconciliation

- **Trạng thái**: Accepted (Mandated by Constitution Principle II — NON-NEGOTIABLE)
- **Ngày quyết định**: 2026-11-19
- **Liên kết**: [`docs/architecture/network-protocol.md`](../network-protocol.md), [`docs/architecture/anti-cheat-design.md`](../anti-cheat-design.md)

---

## 1. Bối cảnh (Context)

Trong game online Action RPG, nếu tin tưởng vị trí, tốc độ, cooldown hay hit event từ client, người chơi gian lận có thể dễ dàng sửa bộ nhớ trình duyệt để dịch chuyển tức thời, đánh xuyên tường, vô hạn sát thương hoặc spam skill. Ngược lại, nếu client chờ server xác nhận mọi khung hình di chuyển mới vẽ, trải nghiệm sẽ bị trễ (input lag) rất khó chịu ở mức ping 60–150 ms.

---

## 2. Quyết định (Decision)

1. **Di chuyển: Client-Side Prediction + Server Reconciliation**:
   - Client gửi `MOVE_INPUT { seq, clientTick, dx, dy, sprint, timestamp }` tối đa 20 gói/giây.
   - Client dự đoán ngay vị trí cục bộ của bản thân bằng cùng hàm vận tốc & bản đồ va chạm chia sẻ trong `packages/shared`.
   - Server xác thực tốc độ tối đa, kiểm tra collision tile/building và trả về `WORLD_SNAPSHOT` kèm `lastProcessedSeq` và vị trí chuẩn.
   - Nếu sai lệch nhỏ (< 6 px): giữ mượt; nếu sai lệch vừa (6–48 px): nội suy chỉnh dần trong 100 ms; nếu sai lệch lớn (> 48 px — nghi ngờ teleport/desync): snap cứng về vị trí server và ghi cảnh báo anti-cheat.
2. **Thực thể khác (Người chơi khác, Quái, Boss): Entity Interpolation**:
   - Client lưu buffer 3 snapshot gần nhất và nội suy mượt với độ trễ hiển thị cố định `100 ms` (bằng 1 chu kỳ snapshot 10 Hz) để tránh giật hình khi jitter.
3. **Chiến đấu & Kỹ năng: 100% Server-Validated Hit Detection**:
   - Client gửi `SKILL_CAST_REQ { seq, skillId, aimAngle, targetPoint }` hoặc `BASIC_ATTACK_REQ`.
   - Server kiểm tra quyền sở hữu nhân vật, cooldown, MP/Stamina, trạng thái CC (stun/death), tầm thi triển và khởi chạy bộ đếm thời gian `startupMs → activeMs → recoveryMs` trên simulation server.
   - Khi đến đúng khung `hitFrame` trên server, server tự tính giao cắt hitbox (Arc/Circle/Line/Projectile) với vị trí thực thể trên server và phát `COMBAT_DAMAGE_EVENT`. Animation trên client chỉ có tác dụng hiển thị, **KHÔNG BAO GIỜ** là nguồn xác thực trúng đòn.

---

## 3. Các Phương án Bị từ chối (Rejected Alternatives)

- **Client-Authoritative Hit Reporting ("Favor the Shooter" không kiểm tra)**: Dễ bị khai thác giả mạo sát thương và đánh toàn bản đồ trong game trình duyệt WebSocket.
- **Lockstep Networking**: Không phù hợp với game Open-World Multiplayer có người chơi vào/ra tự do.

---

## 4. Hệ quả (Consequences)

- **Tích cực**: Ngăn chặn hiệu quả speed hack, teleport, cooldown bypass và fake damage; cảm giác di chuyển vẫn tức thì ở 60 FPS.
- **Đánh đổi**: Đòi hỏi chia sẻ dữ liệu bản đồ va chạm (`.tmj`/collision grid) giữa `apps/client` và `apps/game-server` qua `packages/shared` để tránh sai lệch prediction.
