# REST API Contracts — Eldoria: Forgotten Wilds

**Trạng thái**: Design Baseline v1.0  
**Cập nhật lần cuối**: 2026-11-19  
**Base URL**: `/api/v1` (Self-hosted NestJS, JSON UTF-8)

---

## 1. Quy ước Chung cho REST API

- **Authentication**: Header `Authorization: Bearer <accessToken>` (trừ `/auth/register`, `/auth/login`, `/auth/refresh`, `/health`).
- **Idempotency**: Mọi endpoint `POST`/`PUT`/`PATCH` làm biến đổi kinh tế, kho đồ, cường hóa, chế tạo, xây dựng hoặc gacha **BẮT BUỘC** truyền header `X-Idempotency-Key: <UUIDv4>`.
- **Chuẩn Phản hồi Thành công**:
  ```json
  { "ok": true, "data": { }, "serverTime": "2026-11-19T15:20:00.000Z" }
  ```
- **Chuẩn Phản hồi Lỗi**:
  ```json
  {
    "ok": false,
    "error": { "code": "ERR_INSUFFICIENT_MATERIALS", "message": "Thiếu nguyên liệu mat_iron_ingot", "details": {} },
    "serverTime": "2026-11-19T15:20:00.000Z"
  }
  ```

---

## 2. Danh mục Endpoint Theo Domain

### 2.1 System & Catalog (Read-Only từ `game-data/*.json`)
| Method | Path | Auth | Mô tả |
| :---: | :--- | :---: | :--- |
| `GET` | `/api/v1/health` | Không | Trạng thái server, `protocolVersion`, trạng thái `JsonDatabaseEngine` (chỉ thông tin non-sensitive) |
| `GET` | `/api/v1/catalog/manifest` | Không | Phiên bản hash của 12 tệp `game-data/*.json` phục vụ cache client |
| `GET` | `/api/v1/catalog/:bundle` | Không | Tải catalog tĩnh (`characters`, `skills`, `items`, `recipes`, `crops`, `animals`, `buildings`, `quests`, `gacha-banners`) |

### 2.2 Identity & Session (`accounts/*.json`, `sessions/*.json`)
| Method | Path | Auth | Request Body (Tóm tắt) | Response / Mã lỗi chính |
| :---: | :--- | :---: | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Không | `{ username, email, password }` | `201 { accountId, accessToken }` + HttpOnly refresh cookie; lỗi `409 ERR_USERNAME_EXISTS`, `409 ERR_EMAIL_EXISTS`, `400 ERR_WEAK_PASSWORD` |
| `POST` | `/api/v1/auth/login` | Không | `{ identifier, password }` | `200 { account, accessToken }` + cookie; lỗi `401 ERR_INVALID_CREDENTIALS`, `423 ERR_ACCOUNT_LOCKED`, `403 ERR_ACCOUNT_BANNED` |
| `POST` | `/api/v1/auth/refresh` | Cookie | *(Refresh token từ HttpOnly cookie)* | `200 { accessToken }` (xoay vòng token mới); `401 ERR_TOKEN_REUSED` nếu bị đánh cắp |
| `POST` | `/api/v1/auth/logout` | Có | `{}` | `200` (thu hồi phiên trong `sessions/<id>.json`) |

### 2.3 Character Management (`characters/*.json`)
| Method | Path | Auth | Request Body / Params | Mô tả |
| :---: | :--- | :---: | :--- | :--- |
| `GET` | `/api/v1/characters` | Có | — | Liệt kê tối đa 4 nhân vật thuộc tài khoản hiện tại |
| `POST` | `/api/v1/characters` | Có + Idemp | `{ name, starterHeroId }` (`chr_kael_vanguard` \| `chr_lyra_windrunner` \| `chr_seraphina_dawn`) | Tạo nhân vật mới, khởi tạo `inventories/<id>.json` & `houses/<id>.json` qua WAL |
| `GET` | `/api/v1/characters/:charId/summary` | Có (Owner) | — | Trả chỉ số tổng hợp, trang bị, kỹ năng, tiền tệ, pity và vị trí hiện tại |
| `POST` | `/api/v1/characters/:charId/allocate-stats` | Có + Idemp | `{ str, agi, int, vit, dex, luk }` | Phân bổ điểm thuộc tính tự do; server tính lại `derivedSnapshot` & `combatRating` |
| `POST` | `/api/v1/characters/:charId/skills/upgrade` | Có + Idemp | `{ skillId }` | Nâng cấp bậc kỹ năng bằng `skillPointsFree` |
| `POST` | `/api/v1/characters/:charId/switch-hero` | Có | `{ heroId }` | Đổi hero đang điều khiển trong số `unlockedHeroIds` (chỉ cho phép ở Safe Zone / ngoài combat) |

### 2.4 Inventory, Equipment, Crafting & Enhancement (`inventories/*.json`, `history/upgrade-*.json`)
| Method | Path | Auth | Request Body | Mô tả |
| :---: | :--- | :---: | :--- | :--- |
| `GET` | `/api/v1/characters/:charId/inventory` | Có (Owner) | — | Toàn bộ `bagItems`, `storageItems`, `equipment`, `currencies` |
| `POST` | `/api/v1/characters/:charId/equipment/equip` | Có + Idemp | `{ itemInstanceId, slot }` | Trang bị vật phẩm, kiểm tra `levelReq`, `weaponProficiencies`, `ownerCharacterId` |
| `POST` | `/api/v1/characters/:charId/equipment/unequip` | Có + Idemp | `{ slot }` | Tháo trang bị trả về túi đồ (từ chối nếu túi đầy) |
| `POST` | `/api/v1/characters/:charId/crafting/execute` | Có + Idemp | `{ recipeId, count }` | Kiểm tra trạm/cấp công trình, trừ nguyên liệu & Gold, tạo thành phẩm qua WAL |
| `POST` | `/api/v1/characters/:charId/enhancement/upgrade` | Có + Idemp | `{ itemInstanceId }` | Cường hóa vũ khí `+N → +N+1` (chắc chắn 100% MVP, trần `+10`), kiểm tra cấp `bld_blacksmith`, ghi `upgrade-history` & `currency-ledger` qua WAL |
| `POST` | `/api/v1/characters/:charId/equipment/repair` | Có + Idemp | `{ itemInstanceId }` | Sửa độ bền bằng Gold hoặc `csm_repair_kit` |
| `GET` | `/api/v1/characters/:charId/enhancement/history` | Có (Owner) | `?limit=50` | Lịch sử cường hóa từ `history/upgrade-history-<charId>.json` |

### 2.5 Gacha & Collection (`history/gacha-*.json`)
| Method | Path | Auth | Request Body | Mô tả |
| :---: | :--- | :---: | :--- | :--- |
| `GET` | `/api/v1/gacha/banners` | Có | — | Danh sách banner đang mở, tỷ lệ công khai đầy đủ và trạng thái `pityCounter` của nhân vật |
| `POST` | `/api/v1/characters/:charId/gacha/pull` | Có + Idemp | `{ bannerId, count: 1 | 10 }` | Trừ `STARLIGHT_SHARD` (`160` hoặc `1600`), roll CSPRNG trong lock, cập nhật pity, chuyển đổi trùng lặp → `STAR_ESSENCE`/Constellation, ghi WAL |
| `GET` | `/api/v1/characters/:charId/gacha/history` | Có (Owner) | `?bannerId=&page=1&limit=20` | Lịch sử quay minh bạch từ `history/gacha-history-<charId>.json` |
| `POST` | `/api/v1/characters/:charId/gacha/exchange` | Có + Idemp | `{ exchangeItemId }` | Đổi `STAR_ESSENCE` lấy nhân vật/vũ khí mục tiêu trong cửa hàng cố định |

### 2.6 Homestead (Housing, Farming, Animals) & Quests (`houses/*.json`)
| Method | Path | Auth | Request Body | Mô tả |
| :---: | :--- | :---: | :--- | :--- |
| `GET` | `/api/v1/characters/:charId/homestead` | Có (Owner/Party) | — | Chạy mô phỏng tiến trình offline theo đồng hồ server (cap 24h) rồi trả trạng thái công trình, cây trồng, động vật |
| `POST` | `/api/v1/characters/:charId/buildings/place` | Có + Idemp | `{ buildingId, originTileX, originTileY, rotation }` | Xác thực footprint, collision, pathfinding, trừ nguyên liệu & Gold, khởi tạo xây dựng |
| `POST` | `/api/v1/characters/:charId/buildings/:bldInstId/upgrade` | Có + Idemp | `{}` | Nâng cấp công trình lên `level + 1` qua WAL |
| `POST` | `/api/v1/characters/:charId/farming/action` | Có + Idemp | `{ action: "TILL"|"PLANT"|"WATER"|"FERTILIZE"|"HARVEST", tileX, tileY, itemId? }` | Thao tác canh tác có kiểm tra mùa vụ, stamina và ô đất |
| `POST` | `/api/v1/characters/:charId/animals/action` | Có + Idemp | `{ action: "BUY"|"FEED"|"PET"|"COLLECT", animalId?, animalInstanceId?, feedItemId? }` | Mua/cho ăn/vuốt ve/thu hoạch sản phẩm động vật |
| `POST` | `/api/v1/characters/:charId/quests/:questId/accept` | Có + Idemp | `{ npcId }` | Nhận nhiệm vụ sau khi kiểm tra điều kiện tiên quyết & tầm tương tác NPC |
| `POST` | `/api/v1/characters/:charId/quests/:questId/claim` | Có + Idemp | `{ npcId }` | Trả nhiệm vụ và cộng EXP/Gold/`STARLIGHT_SHARD`/Item qua WAL |

---

## 3. Bảng Mã Lỗi Chuẩn (Canonical Error Codes)

| Mã lỗi | HTTP | Ý nghĩa |
| :--- | :---: | :--- |
| `ERR_UNAUTHORIZED` / `ERR_TOKEN_EXPIRED` | `401` | Thiếu hoặc hết hạn Access Token |
| `ERR_FORBIDDEN_OWNERSHIP` | `403` | Không có quyền thao tác trên nhân vật/vật phẩm/nhà này |
| `ERR_VALIDATION_FAILED` | `400` | Sai định dạng trường dữ liệu hoặc vi phạm ràng buộc schema |
| `ERR_INSUFFICIENT_FUNDS` | `409` | Không đủ Gold / `STARLIGHT_SHARD` / Token |
| `ERR_INSUFFICIENT_MATERIALS` | `409` | Không đủ nguyên liệu trong túi/rương |
| `ERR_MAX_ENHANCEMENT_REACHED` | `409` | Vũ khí đã đạt trần tối đa `+10` |
| `ERR_BLACKSMITH_LEVEL_REQUIRED` | `409` | Cấp `bld_blacksmith` chưa đủ để mở khóa mốc cường hóa này |
| `ERR_INVENTORY_FULL` | `409` | Hết ô trống trong túi đồ |
| `ERR_PLACEMENT_COLLISION` | `409` | Vị trí đặt công trình chồng lấn hoặc chặn lối đi/spawn |
| `ERR_DUPLICATE_IDEMPOTENCY_KEY` | `200/409` | Trả kết quả cũ đã hoàn tất (hoặc `409` nếu đang xử lý in-flight) |
| `ERR_CONCURRENT_LOCK_TIMEOUT` | `503` | Hết thời gian chờ khóa aggregate JSON, client thử lại an toàn |
| `ERR_RATE_LIMITED` | `429` | Vượt ngưỡng tốc độ gọi API |
