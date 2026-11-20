# Data Model: Self-Hosted Local Authentication & Character Management

**Feature**: `002-auth-character`  
**Storage**: `data/db/accounts/<accountId>.json`, `data/db/sessions/<sessionId>.json`, `data/db/characters/<characterId>.json`, `data/db/indexes/*.json` (100% Local JSON)

---

## 1. `Account` (`data/db/accounts/<accountId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `Account.accountId` | `string` | Required; UUIDv7; immutable | Khóa chính tài khoản |
| `Account.username` | `string` | Required; `^[a-zA-Z0-9_]{3,24}$`; unique case-insensitive via `indexes/accounts-by-username.json` | Tên đăng nhập |
| `Account.email` | `string` | Required; RFC email format, max `120` chars; unique case-insensitive via `indexes/accounts-by-email.json` | Email người chơi |
| `Account.passwordHash` | `string` | Required; format `scrypt$16384$8$1$<32-hex-salt>$<128-hex-key>` | Mật khẩu băm một chiều cục bộ |
| `Account.role` | `string` | Required; Enum `PLAYER \| MODERATOR \| ADMIN`; default `PLAYER` | Quyền tài khoản |
| `Account.status` | `string` | Required; Enum `ACTIVE \| SUSPENDED \| BANNED`; default `ACTIVE` | Trạng thái hoạt động |
| `Account.failedLoginAttempts` | `integer` | Required; `0..20`; reset về `0` khi login thành công | Bộ đếm chống brute-force |
| `Account.lockedUntil` | `string \| null` | Optional; ISO-8601 UTC (`now + 15m` khi `failedLoginAttempts >= 8`) | Mốc hết hạn khóa tạm |
| `Account.characterIds` | `string[]` | Required; độ dài `0..4`; mỗi phần tử là UUIDv7 hợp lệ | Giới hạn tối đa 4 nhân vật |

---

## 2. `Session` (`data/db/sessions/<sessionId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `Session.sessionId` | `string` | Required; UUIDv7 | Mã phiên |
| `Session.accountId` | `string` | Required; phải khớp `Account.accountId` | Chủ phiên |
| `Session.refreshTokenHash` | `string` | Required; `^[0-9a-f]{64}$` (SHA-256); unique via `indexes/sessions-by-token-hash.json` | Bản băm mã làm mới |
| `Session.revoked` | `boolean` | Required; default `false` | Đánh dấu phiên đã thu hồi hoặc đã xoay vòng |
| `Session.rotatedToSessionId` | `string \| null` | Optional; UUIDv7 khi đã xoay vòng (dùng phát hiện reuse) | Liên kết chuỗi xoay vòng token |
| `Session.expiresAt` | `string` | Required; ISO-8601 UTC (`createdAt + 7 days`) | Thời điểm hết hạn phiên |

---

## 3. `Character` (`data/db/characters/<characterId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `Character.characterId` | `string` | Required; UUIDv7 | Khóa chính nhân vật |
| `Character.accountId` | `string` | Required; khớp `Account.accountId` | Chủ sở hữu |
| `Character.name` | `string` | Required; `3..20` ký tự Unicode chữ/số/khoảng trắng đơn; unique case-insensitive via `indexes/characters-by-name.json` | Tên nhân vật |
| `Character.activeHeroId` | `string` | Required; phải nằm trong `Character.unlockedHeroIds` và tồn tại trong `game-data/characters.json` | Hero đang điều khiển |
| `Character.unlockedHeroIds` | `string[]` | Required; tối thiểu `1` phần tử (`chr_*`); khởi tạo bằng starter MVP (`chr_kael_vanguard` \| `chr_lyra_windrunner` \| `chr_seraphina_dawn`) | Danh sách hero đã mở |
| `Character.level` | `integer` | Required; `1..100` (MVP cap `30`) | Cấp độ nhân vật |
| `Character.exp` | `integer` | Required; `>= 0` | EXP hiện tại |
| `Character.attributePointsFree` | `integer` | Required; `>= 0` | Điểm thuộc tính chưa cộng |
| `Character.skillPointsFree` | `integer` | Required; `>= 0` | Điểm kỹ năng chưa cộng |
| `Character.stats` | `CharacterStat` | Required; `allocatedStr..allocatedLuk` mỗi trường `integer 0..500`; tổng `<= (level - 1) * 5` | Điểm phân bổ + `derivedSnapshot` |
| `Character.combatRating` | `integer` | Required; `>= 0`; chỉ do server tính | Điểm sức mạnh tổng hợp |
