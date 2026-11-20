# Quickstart Validation Guide: Auth & Character Management

**Feature**: `002-auth-character` | **Prerequisites**: Feature `001-foundation-game-engine` operational.

## Validation Scenarios (Implementation Phase)
1. **Register & Login Flow**: Đăng ký 1 tài khoản mới qua `POST /api/v1/auth/register`, xác nhận tệp `data/db/accounts/<id>.json` chứa `scrypt$...` (không plain-text) và hai chỉ mục `accounts-by-email.json`, `accounts-by-username.json` được cập nhật nguyên tử.
2. **Brute-Force Lockout & Token Reuse Detection**: Thử sai mật khẩu 8 lần liên tiếp → xác minh lần 9 trả `423 ERR_ACCOUNT_LOCKED`; xoay vòng refresh token rồi phát lại token cũ → xác minh `401 ERR_TOKEN_REUSED` và toàn bộ phiên bị `revoked: true`.
3. **Atomic Starter Character Creation**: Gọi `POST /api/v1/characters` chọn `chr_kael_vanguard` → xác nhận tồn tại đồng thời `characters/<id>.json`, `inventories/<id>.json` (có `wpn_iron_longsword`), `houses/<id>.json` (có `bld_player_house` Lv 1). Tạo tới nhân vật thứ 5 bị từ chối `409 ERR_MAX_CHARACTERS_REACHED`.
4. **Ownership & Stat Allocation**: Tài khoản B gọi `/characters/<charA>/allocate-stats` bị chặn `403`; tài khoản A phân bổ điểm hợp lệ nhận `derivedSnapshot` và `combatRating` khớp `docs/balancing/combat-formulas.md`.
