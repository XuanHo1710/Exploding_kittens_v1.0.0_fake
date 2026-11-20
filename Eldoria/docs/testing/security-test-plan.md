# Security & Anti-Cheat Test Plan — Eldoria: Forgotten Wilds

**Trạng thái**: Design Baseline v1.0 (`NOT EXECUTED — DESIGN_AND_PLANNING_ONLY`)  
**Cập nhật lần cuối**: 2026-11-19  
**Tham chiếu**: [`security-design.md`](../architecture/security-design.md), [`anti-cheat-design.md`](../architecture/anti-cheat-design.md)

---

## 1. Phạm vi Kiểm thử Bảo mật

Toàn bộ các bài test được thiết kế để chạy cục bộ (Jest + Supertest + Custom WS Exploit Harness) trên môi trường staging nội bộ trước khi phát hành từng Milestone. Mục tiêu là kiểm chứng toàn bộ **14 nguy cơ gian lận** (Mục 21) và các rủi ro đặc thù của **JSON Local Database**.

---

## 2. Bộ Kịch bản Kiểm thử Xâm nhập & Anti-Cheat (Automated Security Test Cases)

| Mã Test | Hạng mục Tấn công | Kỹ thuật Giả lập Tấn công | Kết quả Chặn Bắt buộc |
| :--- | :--- | :--- | :--- |
| `SEC-001` | **JSON Path Traversal** | Truyền `characterId = "../../accounts/admin"` hoặc `%2e%2e%2f` vào REST/WS | `400 ERR_VALIDATION_FAILED`, `JsonDatabaseEngine` không mở tệp ngoài `baseDir`, ghi `SECURITY_PATH_TRAVERSAL_ATTEMPT` |
| `SEC-002` | **Prototype Pollution** | Gửi JSON payload chứa `"__proto__": {"role": "ADMIN"}` hoặc `"constructor"` | Parser từ chối / loại bỏ khóa nguy hiểm; thuộc tính `Object.prototype` không đổi |
| `SEC-003` | **Password Brute Force & Timing** | Gửi 15 request login sai mật khẩu/phút từ 1 IP và đo thời gian phản hồi user tồn tại vs không tồn tại | Rate limiter chặn ở lần 6 (`429`), khóa tài khoản tạm ở lần 8 (`423`), chênh lệch thời gian phản hồi < 5ms |
| `SEC-004` | **Refresh Token Theft & Replay** | Dùng Refresh Token `R1` lấy `R2`, sau đó kẻ tấn công gửi lại `R1` | Server phát hiện reuse → thu hồi toàn bộ phiên trong `sessions/*.json`, ghi audit `HIGH` |
| `SEC-005` | **Cross-Account IDOR** | Dùng JWT của Account A gửi lệnh `equip`, `enhance`, `gacha/pull`, `buildings/place` với `characterId` của Account B | 100% trả `403 ERR_FORBIDDEN_OWNERSHIP`, không thay đổi tệp JSON của Account B |
| `SEC-006` | **Item Duplication (Race)** | Gửi đồng thời 20 request tách chồng, cất rương và cường hóa cùng `itemInstanceId` | Số lượng tổng vật phẩm trước và sau không đổi, `0` trùng `instanceId` trong `inventories/<id>.json` |
| `SEC-007` | **Double Spending (Gacha + Craft)** | Tài khoản có `1600` Starlight Shard & `500` Gold; bắn song song 10x Gacha + Build + Enhance | Không bao giờ sinh số dư âm; tổng delta `CurrencyLedger` khớp chính xác `balanceAfter - balanceBefore` |
| `SEC-008` | **Replay Attack** | Bắt gói `POST /gacha/pull` hoặc `POST /quests/:id/claim` hợp lệ và phát lại 5 lần cùng `X-Idempotency-Key` | Server chỉ thực thi đúng 1 lần; 4 lần sau trả kết quả đã lưu mà không cấp thêm thưởng/trừ thêm tiền |
| `SEC-009` | **Speed & Teleport Hack** | Bắn 80 gói `MOVE_INPUT` / giây hoặc sửa gói tin chèn tọa độ `x: 9999` xuyên tường | Server bỏ qua tọa độ client, giới hạn vận tốc theo `dt` server, giữ nhân vật trước tường collision và tăng `suspicionScore` |
| `SEC-010` | **Fake Damage & Cooldown Bypass** | Gửi `SKILL_CAST_REQ` liên tục mỗi 100 ms cho Ultimate cooldown 25s; tiêm trường `damage: 999999` vào payload | Server loại bỏ trường thừa, trả `ERR_SKILL_ON_COOLDOWN` cho các lệnh sớm |
| `SEC-011` | **Unauthorized Loot & Building** | Gửi `LOOT_PICKUP_REQ` từ khoảng cách `500 px` hoặc loot của người khác; đặt `bld_blacksmith` đè lên spawn point | Từ chối với `ERR_LOOT_NOT_ELIGIBLE` / `ERR_OUT_OF_RANGE` / `ERR_PLACEMENT_COLLISION` |
| `SEC-012` | **Client Clock Manipulation** | Giả lập client chỉnh thời gian hệ thống +48h trước khi gọi `GET /homestead` và `farming/action` | Cây trồng và động vật tiến triển `0` giây giả mạo vì server dùng `Date.now()` nội bộ |
| `SEC-013` | **Combat Disconnect Exploit** | Rút kết nối WebSocket khi HP còn 5% trước đòn đánh chết của Boss | Nhân vật giữ trạng thái chiến đấu 5s (vẫn nhận đòn kết liễu hợp lệ), không hoàn tác bình máu/tài nguyên đã dùng |
| `SEC-014` | **XSS & Chat Injection** | Gửi tin nhắn chat chứa `<script>alert(1)</script>`, `<img onerror=...>`, chuỗi 5000 ký tự | Server từ chối chuỗi > 250 ký tự; chuỗi HTML bị render thuần văn bản (escaped), không thực thi script |
| `SEC-015` | **Static Exposure of `data/db/`** | Thử truy cập HTTP `GET /data/db/accounts/...` hoặc `GET /../data/db/indexes/accounts-by-email.json` | 100% trả `404` / `403`; thư mục `data/` tách biệt hoàn toàn khỏi static asset root |

---

## 3. Quy trình Xử lý Sự cố Bảo mật (Security Gate trước Release)

- Bất kỳ lỗi nào thuộc nhóm `SEC-001` đến `SEC-015` thất bại đều tự động xếp loại **`P0 (Release Blocker)`**.
- Báo cáo bảo mật ghi rõ các giả định còn lại (ví dụ: bot farming tinh vi ở mức input giống người thật chỉ giảm thiểu bằng phân tích hành vi và rà soát Moderator, không tuyên bố miễn nhiễm 100%).
