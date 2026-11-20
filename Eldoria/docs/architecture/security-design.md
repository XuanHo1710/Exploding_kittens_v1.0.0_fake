# Security Architecture Design — Eldoria: Forgotten Wilds

**Trạng thái**: Design Baseline v1.0  
**Cập nhật lần cuối**: 2026-11-19  
**Ràng buộc Hiến pháp**: Nguyên tắc I (Zero Third-Party Services & JSON-Only DB), Nguyên tắc II (Server-Authoritative), Nguyên tắc VIII (Trung thực bảo mật)

---

## 1. Triết lý Bảo mật & Khuyến cáo Trung thực

- **Không tuyên bố bất khả xâm phạm**: Không có hệ thống game online nào chống gian lận hay tấn công 100% tuyệt đối. Thiết kế này theo nguyên tắc **Defense in Depth** (phòng thủ nhiều lớp), tối đa hóa chi phí tấn công và đảm bảo khả năng phát hiện — truy vết — khôi phục trên cơ sở dữ liệu JSON cục bộ.
- **100% Tự chủ (Zero Third-Party Auth/Security SaaS)**: Toàn bộ mật mã băm mật khẩu, phát hành phiên, kiểm soát tốc độ (rate limiting) và nhật ký kiểm toán chạy hoàn toàn nội bộ trong tiến trình NestJS và lưu JSON cục bộ tại `data/db/`.

---

## 2. Xác thực & Quản lý Phiên Cục bộ (Self-Hosted Authentication)

### 2.1 Lưu trữ Mật khẩu
- **Thuật toán**: Node.js built-in `crypto.scrypt` với tham số mạnh `N = 16384`, `r = 8`, `p = 1`, độ dài khóa dẫn xuất `64 bytes`, muối ngẫu nhiên (`salt`) `16 bytes` riêng cho từng tài khoản qua `crypto.randomBytes(16)`.
- **So sánh an toàn**: Bắt buộc dùng `crypto.timingSafeEqual` để chống timing attack.
- **Chính sách mật khẩu**: Tối thiểu 10 ký tự (tối đa 128 ký tự để tránh DoS băm mật khẩu), từ chối mật khẩu trùng `username` hoặc nằm trong danh sách mật khẩu yếu phổ biến cục bộ.

### 2.2 Phiên & Token (`data/db/sessions/<sessionId>.json`)
- **Access Token (JWT cục bộ)**: Ký bằng HMAC-SHA256 (`HS256`) với khóa bí mật cục bộ 256-bit lưu trong biến môi trường máy chủ (không commit vào Git), thời hạn ngắn **`15 phút`**. Payload tối giản: `{ sub: accountId, sid: sessionId, role, iat, exp }`.
- **Refresh / Session Token**: Chuỗi ngẫu nhiên 256-bit gửi qua HTTP-only, `SameSite=Strict`, `Secure` cookie (khi chạy HTTPS). Server **KHÔNG** lưu raw token trong JSON — chỉ lưu `sha256(refreshToken)` trong `sessions/<sessionId>.json` và `indexes/sessions-by-token-hash.json`.
- **Token Rotation & Revocation**: Mỗi lần làm mới token sẽ hủy token cũ và cấp token mới; nếu phát hiện dùng lại token đã hủy (reuse detection), server lập tức thu hồi toàn bộ phiên của tài khoản đó và ghi sự kiện `SECURITY_TOKEN_REUSE` vào `data/db/audit/security-audit-YYYY-MM-DD.json`.
- **WebSocket Handshake Auth**: Client truyền `accessToken` hợp lệ qua `auth` payload khi kết nối WebSocket (TUYỆT ĐỐI KHÔNG truyền token trên URL query string để tránh lộ vào access log). Server kiểm tra trạng thái `Account.status === "ACTIVE"` và `Session.revoked === false` trước khi gán kết nối vào `ZoneInstance`.
- **Single Active Session per Character**: Một nhân vật chỉ được phép có 1 kết nối gameplay hoạt động tại một thời điểm; kết nối mới hợp lệ sẽ đá kết nối cũ với mã `ERR_SESSION_REPLACED` sau khi hoàn tất flush an toàn.

---

## 3. Phân quyền (Authorization & Ownership Checks)

Mọi endpoint REST và sự kiện WebSocket đều áp dụng mô hình **RBAC + Ownership Guard**:

| Lớp kiểm tra | Quy tắc bắt buộc |
| :--- | :--- |
| **Account-to-Character Ownership** | Mọi hành động trên `characterId` phải xác minh `character.accountId === session.accountId` từ bộ nhớ/JSON server, KHÔNG tin `characterId` do client gửi. |
| **Inventory & Equipment Ownership** | Mọi thao tác trang bị, sử dụng, bán, rèn, cường hóa `itemInstanceId` phải xác minh `instance.ownerCharacterId === activeCharacterId`. |
| **Homestead & Building Permissions** | Chỉ chủ nhà (`OWNER_ONLY`) được xây mới, nâng cấp, phá bỏ hoặc thu hoạch; thành viên Party chỉ được phép vào thăm hoặc dùng trạm rèn/nấu ăn nếu chủ nhà bật `PARTY_ACCESS`. |
| **Party & Dungeon Authorization** | Chỉ `leaderCharacterId` được đá thành viên hoặc khởi tạo `DungeonInstance`; chỉ thành viên trong `party.memberIds` mới được phép vào instance đó. |
| **Admin / Moderator Separation** | Các công cụ quản trị (xem audit, khóa tài khoản, khôi phục backup) chỉ mở cho `role === "ADMIN"` với nhật ký kiểm toán riêng không thể xóa từ giao diện web. |

---

## 4. Xác thực Đầu vào & Chống Lạm dụng (Input Validation & Rate Limiting)

1. **Strict Schema Validation**: Mọi request HTTP và WebSocket packet đi qua lớp Zod/JSON Schema strict mode (`strip` hoặc `reject` trường thừa). Không bao giờ nối chuỗi input người dùng vào đường dẫn tệp (`path traversal`).
2. **Bảo vệ Đường dẫn Tệp JSON (Path Traversal Immunity)**:
   - Mọi khóa tra cứu tệp (`accountId`, `characterId`, `regionId`) được kiểm tra bằng regex nghiêm ngặt (`^[0-9a-f-]{36}$` cho UUIDv7 hoặc whitelist `^[a-z0-9_]{3,48}$` đối với ID catalog).
   - `JsonDatabaseEngine` luôn kiểm tra `path.resolve(baseDir, relPath).startsWith(path.resolve(baseDir))` trước khi mở tệp; bất kỳ chuỗi chứa `..`, `/`, `\`, null byte đều bị từ chối và ghi cảnh báo `SECURITY_PATH_TRAVERSAL_ATTEMPT`.
3. **Chống Prototype Pollution & JSON Bomb**:
   - Giới hạn kích thước payload HTTP (mặc định `64 KB`) và WebSocket frame (`16 KB`).
   - Từ chối các key nguy hiểm `__proto__`, `constructor`, `prototype` trong mọi JSON payload đầu vào.
4. **In-Process Token Bucket Rate Limiter** (không cần Redis):
   - Đăng nhập/Đăng ký: 5 lượt / phút / IP + khóa tạm tài khoản 15 phút sau 8 lần sai liên tiếp.
   - `MOVE_INPUT`: tối đa 25 gói / giây / socket (trần chuẩn 20 Hz + đệm 25% jitter).
   - `ATTACK` / `SKILL_CAST`: tối đa 10 gói / giây / socket.
   - `CHAT_SEND`: tối đa 5 tin nhắn / 10 giây, lọc XSS bằng escape thuần văn bản (React text node, cấm `dangerouslySetInnerHTML`), độ dài tối đa 250 ký tự.
   - `GACHA_PULL` / `ENHANCE_WEAPON` / `CRAFT_ITEM`: tối đa 2 lệnh / giây + bắt buộc `idempotencyKey`.

---

## 5. Bảo vệ Toàn vẹn Tệp JSON & Nhật ký Kiểm toán (`AuditLog`)

- **Quyền hệ điều hành tối thiểu**: Thư mục `data/db/` và `data/backups/` chỉ cấp quyền đọc/ghi cho user hệ điều hành chạy tiến trình NestJS (`chmod 700` trên Linux, ACL hạn chế trên Windows); **TUYỆT ĐỐI KHÔNG** phục vụ thư mục `data/` qua static file server.
- **Checksum Verification**: Mọi tệp JSON persistent đều mang `checksumSha256`. Nếu quản trị viên phát hiện mismatch khi đọc, hệ thống ghi `SECURITY_FILE_TAMPER_OR_CORRUPT` và từ chối ghi đè mù.
- **Append-Only Audit Log (`data/db/audit/security-audit-YYYY-MM-DD.json`)**:
  - Ghi nhận: đăng nhập thất bại nhiều lần, thu hồi token, cảnh báo speed/teleport hack, yêu cầu nhặt loot trái phép, giao dịch gacha/cường hóa lỗi invariant, khóa tài khoản, thao tác admin.
  - Chuỗi hash liên kết tùy chọn (`prevEntryHash`) giúp phát hiện việc xóa dòng nhật ký trái phép.

---

## 6. Bảo mật Truyền tải & Trình duyệt

- Khuyến nghị chạy sau reverse proxy cục bộ (Traefik/Nginx self-hosted) với TLS 1.3 (`HTTPS` và `WSS`) khi triển khai ra mạng LAN/Internet.
- Bật tiêu đề bảo mật chuẩn: `Content-Security-Policy` (cấm nạp script/font ngoài — hoàn toàn khớp chính sách Zero Third-Party), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `CORS` chỉ cho phép origin của client.
