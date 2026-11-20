# Phase 0 Research: Self-Hosted Local Authentication & Character Management

**Feature**: `002-auth-character` | **Date**: 2026-11-19

---

## 1. Local Password Hashing without Native Build Friction

- **Decision**: Sử dụng hàm **`crypto.scrypt`** có sẵn trong thư viện chuẩn Node.js 22 (`N = 16384`, `r = 8`, `p = 1`, `keylen = 64`, `salt = 16 bytes` ngẫu nhiên) kết hợp `crypto.timingSafeEqual`.
- **Rationale**: Không cần biên dịch C++ native addon trên Windows (tránh lỗi `node-gyp` của `argon2`/`bcrypt`), hoàn toàn không phụ thuộc dịch vụ bên thứ ba và đủ chuẩn chống brute-force thương mại.
- **Alternatives considered**: `argon2` native binding (mạnh hơn nhưng dễ gặp lỗi toolchain khi setup máy dev Windows); `bcryptjs` thuần JS (chậm hơn trên event loop).

## 2. Session Storage & Token Rotation on JSON Local Database

- **Decision**: Access Token là JWT `HS256` stateless ngắn hạn (`15 phút`); Refresh Token là chuỗi 32-byte random gửi qua `HttpOnly; SameSite=Strict; Secure` cookie và chỉ lưu bản băm `sha256` vào `data/db/sessions/<sessionId>.json` + `indexes/sessions-by-token-hash.json`. Mỗi lần `/auth/refresh` xoay vòng lưu `rotatedToSessionId` để phát hiện tức thì replay token cũ.
- **Rationale**: Giữ truy cập API/WS nhanh không cần đọc đĩa mỗi request (Access Token kiểm tra chữ ký trong RAM + kiểm tra tập `revokedAccountIds` trong RAM), đồng thời vẫn có khả năng thu hồi tức thì và chống đánh cắp phiên 100% cục bộ không cần Redis.
- **Alternatives considered**: Lưu mọi Access Token và đọc tệp JSON ở từng HTTP request (tốn I/O không cần thiết); dùng Redis session store (bị cấm theo Nguyên tắc I).

## 3. Atomic Multi-File Character Creation via WAL

- **Decision**: Khi tạo nhân vật mới, `CharacterService` lấy khóa sắp xếp theo từ điển `["account:<accId>", "index:characters-by-account", "index:characters-by-name"]`, xác minh trùng tên và giới hạn 4 nhân vật, rồi thực thi một giao dịch WAL duy nhất ghi: `accounts/<accId>.json`, `characters/<charId>.json`, `inventories/<charId>.json` (chứa vũ khí khởi đầu tương ứng hero + 5 `sed_sunwheat` + 2 `csm_hp_potion_small`), `houses/<charId>.json` (chứa `bld_player_house` Lv 1 + `bld_farm_plot` Lv 1) và hai tệp chỉ mục.
- **Rationale**: Đảm bảo 100% không tồn tại nhân vật thiếu túi đồ hay thiếu căn nhà khởi đầu nếu server crash giữa chừng.
- **Alternatives considered**: Tạo lười (lazy-create) túi đồ/nhà khi người chơi truy cập lần đầu (dễ gây lỗi null-pointer rải rác ở các feature khác).
