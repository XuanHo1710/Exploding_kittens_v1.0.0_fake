# Screen Inventory — Đặc tả Chi tiết 24 Màn hình Bắt buộc

**Trạng thái**: Design Baseline v1.0 (`DESIGN_AND_PLANNING_ONLY`)  
**Cập nhật lần cuối**: 2026-11-19  
**Tham chiếu**: [GAME_DESIGN_BRIEF.md Mục 18](../../GAME_DESIGN_BRIEF.md), [design-system.md](./design-system.md), [api-contracts.md](../architecture/api-contracts.md), [websocket-contracts.md](../architecture/websocket-contracts.md)

---

## 1. Bảng Tổng mục 24 Màn hình Chuẩn (Master Index)

Mọi màn hình tuân thủ phong cách **Classic 16-bit Pixel Fantasy RPG UI** (khung gỗ/đồng/giấy da 9-slice, không mang dáng dấp dashboard quản trị) và đọc/ghi 100% thông qua máy chủ NestJS cục bộ lưu trên `data/db/**/*.json`.

| Mã | Tên Màn hình | Lớp Hiển thị | Phím tắt Mặc định | Zustand Store Chính | Mốc |
| :---: | :--- | :--- | :---: | :--- | :---: |
| `SCR-01` | Login & Register | Full Screen Route (`/auth`) | — | `useAuthStore` | M1 |
| `SCR-02` | Character Selection | Full Screen Route (`/characters`) | — | `useAuthStore` | M1 |
| `SCR-03` | Character Creation / Starter Selection | Full Screen Route (`/characters/new`) | — | `useAuthStore` | M1 |
| `SCR-04` | Loading Screen | Full Screen Transition Overlay | — | `useUiModalStore` | M1 |
| `SCR-05` | Main Game HUD | Persistent Overlay (`--z-hud`) | `Alt+H` (ẩn/hiện HUD chụp ảnh) | `useHudStore`, `useSocialStore` | M1 |
| `SCR-06` | Inventory | Modal (`--z-modal`) | `I` | `useInventoryStore` | M1 |
| `SCR-07` | Equipment | Modal / Tab liên thông Inventory | `U` (hoặc Tab trong `I`) | `useInventoryStore`, `useProgressionStore` | M1 |
| `SCR-08` | Character Stats | Modal (`--z-modal`) | `C` | `useProgressionStore` | M1 |
| `SCR-09` | Skill Tree | Modal (`--z-modal`) | `K` | `useProgressionStore` | M1 |
| `SCR-10` | Character Collection | Modal (`--z-modal`) | `H` | `useProgressionStore` | M1 |
| `SCR-11` | Gacha | Full-Canvas Ornate Modal | `G` | `useInventoryStore`, `useProgressionStore` | M1 |
| `SCR-12` | Blacksmith | NPC / Building Modal (`bld_blacksmith`) | `F` gần Lò Rèn / `npc_smith_garrik` | `useInventoryStore`, `useHomesteadStore` | M1 |
| `SCR-13` | Weapon Enhancement (`+0 → +10`) | Sub-screen / Tab trọng tâm Blacksmith | `F` (chọn Cường Hóa) | `useInventoryStore`, `useHomesteadStore` | M1 |
| `SCR-14` | Crafting | Station Modal (Bếp, Lò nung, Xưởng) | `F` tại trạm / `N` xem công thức | `useInventoryStore`, `useHomesteadStore` | M1 |
| `SCR-15` | Building | Modal + Ghost Placement Mode | `B` (trong `zon_player_homestead`) | `useHomesteadStore` | M1 |
| `SCR-16` | Farming | Contextual HUD Bar + Plot Inspector | `F` trên ô đất / `O` Sổ Nông Trại | `useHomesteadStore`, `useInventoryStore` | M1 |
| `SCR-17` | World Map | Large Map Overlay Modal | `M` | `useHudStore`, `useProgressionStore` | M1 |
| `SCR-18` | Minimap | HUD Widget góc trên-phải (`--z-hud`) | `]` / `Alt+M` (phóng vừa) / Click mở `M` | `useHudStore` | M1 |
| `SCR-19` | Quest Journal | Parchment Book Modal | `L` | `useProgressionStore` | M1 |
| `SCR-20` | NPC Dialogue | Bottom Parchment Dialogue Box | `F` gần NPC (`<= 96 px`) | `useProgressionStore`, `useUiModalStore` | M1 |
| `SCR-21` | Party | Social Modal + Left HUD Mini-List | `P` | `useSocialStore` | M1 |
| `SCR-22` | Boss Reward | Victory Ornate Modal | Tự mở sau `BOSS_STATE_EVENT: DEFEATED` | `useHudStore`, `useInventoryStore` | M1 |
| `SCR-23` | Settings | Modal (`--z-modal`) | `ESC` (khi không có modal khác) | `useUiModalStore` | M1 |
| `SCR-24` | Death & Respawn | Mandatory Overlay (`--z-modal`) | Tự mở khi nhận `PLAYER_DEATH` | `useHudStore` | M1 |

---

## 2. Đặc tả Chi tiết Từng Màn hình (`SCR-01` → `SCR-24`)

---

### `SCR-01` — Login & Register (Đăng nhập & Đăng ký Nội bộ)

- **Mục đích**: Cổng vào trò chơi mang khí chất thế giới Eldoria với nền cảnh làng `reg_greenhaven_village` hoạt ảnh pixel nhẹ phía sau (mây trôi, khói ống khói). Xác thực 100% cục bộ bằng tài khoản lưu JSON (`accounts/*.json`), không dùng dịch vụ OAuth bên thứ 3.
- **Phím tắt**: `Tab` di chuyển ô nhập, `Enter` gửi form, `Alt+1` / `Alt+2` chuyển tab Đăng nhập / Đăng ký.
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
|  [Nền Pixel Art Animated: Greenhaven Village Hoàng Hôn — 640x360] |
|                                                                   |
|                 ==============================                    |
|                   ELDORIA: FORGOTTEN WILDS                        |
|                 ==============================                    |
|                                                                   |
|             +-----------------------------------+                 |
|             | [ ĐĂNG NHẬP ]  |  [ ĐĂNG KÝ MỚI ] |  <- Wood 9-slice|
|             +-----------------------------------+                 |
|             | Tên tài khoản / Email             |                 |
|             | [_______________________________] |                 |
|             | Mật khẩu                          |                 |
|             | [_______________________] [Hiện]  |                 |
|             | [x] Ghi nhớ tên đăng nhập         |                 |
|             |                                   |                 |
|             |    [  BƯỚC VÀO ELDORIA  ] (Gold)  |                 |
|             +-----------------------------------+                 |
|  Trạng thái Máy chủ: (*) Cục bộ Trực tuyến (v1.0)    [Cài đặt]    |
+-------------------------------------------------------------------+
```
- **Trường dữ liệu & API**:
  - `GET /api/v1/health` → `protocolVersion`, trạng thái server cục bộ.
  - Đăng nhập: `POST /api/v1/auth/login` (`{ identifier, password }`) → `accessToken`, HttpOnly refresh cookie.
  - Đăng ký: `POST /api/v1/auth/register` (`{ username, email, password }`) → kiểm tra mật khẩu mạnh ngay tại client + server.
- **Hành động**: Đăng nhập, chuyển tab Đăng ký, bật/tắt hiện mật khẩu, mở `SCR-23 Settings` (chỉnh âm lượng/phóng chữ trước khi vào game).
- **Ma trận Trạng thái**:
  - `loading`: Nút bấm chuyển đồng hồ cát pixel `"Đang xác thực..."`, khóa 2 ô nhập.
  - `empty`: Placeholder hướng dẫn định dạng (username `3–24` ký tự chữ/số/gạch dưới `[a-zA-Z0-9_]`; mật khẩu `>= 10` ký tự gồm chữ hoa, chữ thường, số và ký tự đặc biệt khớp `specs/002-auth-character`).
  - `error`: Hiển thị hộp lỗi viền đỏ tiếng Việt ánh xạ chuẩn mã lỗi: `ERR_INVALID_CREDENTIALS`, `ERR_USERNAME_EXISTS`, `ERR_EMAIL_EXISTS`, `ERR_WEAK_PASSWORD`, `ERR_ACCOUNT_LOCKED` (kèm thời gian mở khóa).
  - `disconnected`: Đèn trạng thái góc dưới trái chuyển đỏ `"Không kết nối được máy chủ cục bộ"` + nút `"Kiểm tra lại"` gọi `/api/v1/health`.

---

### `SCR-02` — Character Selection (Chọn Nhân vật)

- **Mục đích**: Cho phép người chơi chọn 1 trong tối đa **4 ô nhân vật** của tài khoản để vào thế giới, xem nhanh cấp độ, vùng đang đứng, vũ khí đang cầm và tổng quan anh hùng chủ lực.
- **Phím tắt**: `Up`/`Down` chọn nhân vật, `Enter` vào game, `N` tạo nhân vật mới, `Esc` đăng xuất.
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
|  CHỌN NHÀ THÁM HIỂM                       [Đăng xuất] [Cài đặt]   |
+-------------------------------------------------------------------+
| +-------------------------+  +----------------------------------+ |
| | Ô 1 (Đang chọn - Gold)  |  |  [Preview Sprite 48x64 Idle x3]  | |
| | [Icon] Kaelen • Lv.12   |  |       KAELEN • Kael Ironbound    | |
| | Kael Ironbound (FIRE)   |  |  [FIRE] WARRIOR • RARE (★★★)     | |
| | Greenhaven Village      |  |  ------------------------------- | |
| +-------------------------+  |  Chỉ số: HP 465 | ATK 84 | CR 312| |
| | Ô 2: LyraTest • Lv.4    |  |  Vũ khí: Iron Longsword (+3)     | |
| +-------------------------+  |  Vàng: 1,420 G | Mảnh Sao: 960   | |
| | Ô 3: (+ Tạo mới)        |  |  Lần chơi cuối: 19/11 21:40      | |
| +-------------------------+  |                                  | |
| | Ô 4: (+ Tạo mới)        |  |  [    VÀO THẾ GIỚI ELDORIA    ]  | |
| +-------------------------+  +----------------------------------+ |
+-------------------------------------------------------------------+
```
- **Trường dữ liệu & API**: `GET /api/v1/characters` (danh sách `charId`, `name`, `activeHeroId`, `level`, `currentRegionId`, `combatRating`, `equippedMainWeapon`, `currencies`, `lastPlayedAt`).
- **Hành động**: Chọn ô nhân vật, bấm *"Vào Thế Giới Eldoria"* (khởi chạy handshake WebSocket `/game` + chuyển `SCR-04`), bấm ô trống sang `SCR-03`, bấm Đăng xuất (`POST /api/v1/auth/logout`).
- **Ma trận Trạng thái**:
  - `loading`: Khung danh sách hiển thị 4 thẻ gỗ shimmer pixel; nút Vào Game khóa.
  - `empty`: Khi tài khoản mới có `0` nhân vật → hiển thị minh họa ngôi nhà gỗ nhỏ ở Greenhaven + nút lớn `"Bắt đầu hành trình — Tạo nhân vật đầu tiên"` (nhảy thẳng `SCR-03`).
  - `error`: Thông báo lỗi tải danh sách + nút `"Tải lại danh sách"`.
  - `disconnected`: Banner mất kết nối + khóa nút Vào Game cho tới khi máy chủ sẵn sàng.

---

### `SCR-03` — Character Creation / Starter Selection (Khởi tạo & Chọn Anh hùng Khởi đầu)

- **Mục đích**: Chọn 1 trong **3 Starter Hero miễn phí của MVP** (`chr_kael_vanguard`, `chr_lyra_windrunner`, `chr_seraphina_dawn`), xem hoạt ảnh chiến đấu mẫu, bộ 5 kỹ năng, nguyên tố, điểm mạnh/yếu và đặt tên hiển thị.
- **Phím tắt**: `Left`/`Right` đổi Starter Hero, `1..3` xem thử mô tả kỹ năng, `Enter` xác nhận tạo, `Esc` quay về `SCR-02`.
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
|  [< Quay lại]       CHỌN ANH HÙNG KHỞI ĐẦU                        |
+-------------------------------------------------------------------+
| [ Kael Ironbound ]   [ Lyra Galeweaver ]   [ Seraphina Solis ]    |
|  FIRE • WARRIOR       WIND • ARCHER         LIGHT • HEALER        |
+------------------------------------+------------------------------+
|  [Portrait 96x96] + [Sprite Idle]  |  HỒ SƠ CHIẾN ĐẤU (Parchment) |
|                                    |  Vai trò: MELEE_DPS • RARE   |
|  Kael Ironbound                    |  Vũ khí chính: SWORD         |
|  "Vanguard of the Ashen Hearth"    |  Điểm mạnh: Cân bằng công/thủ|
|                                    |  Bộ kỹ năng (5):             |
|  [HP  ████░░] [ATK █████░]         |  • [PAS] Forged Resolve      |
|  [DEF ████░░] [SPD ████░░]         |  • [1] Blazing Lunge         |
|                                    |  • [2] Cinder Parry          |
|  Tên nhân vật (3–16 ký tự):        |  • [3] Sunder Cleave         |
|  [____________________________]    |  • [R] Crimson Crescent      |
|  [ TẠO NHÂN VẬT & KHỞI HÀNH ]      |  *Miễn phí — Mở đủ 3 ở Gacha |
+------------------------------------+------------------------------+
```
- **Trường dữ liệu & API**: Đọc từ catalog `GET /api/v1/catalog/characters` + `skills`; tạo mới qua `POST /api/v1/characters` kèm `X-Idempotency-Key` (`{ name, starterHeroId }`).
- **Hành động**: Chuyển 3 anh hùng khởi đầu, bấm nút xem trước hoạt ảnh đánh cơ bản trên preview canvas nhỏ, nhập tên hỗ trợ tiếng Việt có dấu (hoặc ký tự hợp lệ theo rule server), xác nhận khởi tạo nhà gỗ + kho đồ ban đầu.
- **Ma trận Trạng thái**:
  - `loading`: `"Đang dựng căn nhà gỗ tại Greenhaven Village..."` (vì server khởi tạo atomic `characters`, `inventories`, `houses` qua WAL).
  - `empty`: Nút Tạo ở trạng thái `disabled` kèm gợi ý `"Nhập tên nhân vật (3–16 ký tự)"`.
  - `error`: Lỗi trùng tên, ký tự cấm (`ERR_VALIDATION_FAILED`), hoặc đã đạt giới hạn `4/4` nhân vật.
  - `disconnected`: Giữ nguyên dữ liệu form đã nhập, báo mất kết nối và cho gửi lại cùng `X-Idempotency-Key`.

---

### `SCR-04` — Loading Screen (Màn hình Nạp Vùng & Đồng bộ Dữ liệu)

- **Mục đích**: Che mượt quá trình nạp Texture Atlas Phaser theo vùng (`BootScene` / `ZONE_TRANSITION`), xác thực `WS_WELCOME` và nạp `game-data/*.json` manifest mà vẫn tạo cảm xúc phiêu lưu.
- **Phím tắt**: Không nhận phím gameplay (khóa hoàn toàn `InputFocusManager`).
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
|  [Minh họa Pixel Art Vùng Đích: Greenhaven / Forest / Hollow]     |
|                                                                   |
|                   ĐANG TIẾN VÀO: WHISPERING FOREST                |
|                       Cấp đề xuất: 1 – 15                         |
|                                                                   |
|   [████████████████████░░░░░░░░░░]  68%                           |
|   Đang tải bản đồ & đồng bộ máy chủ (atlas_mobs_forest)...        |
|                                                                   |
|   [Mẹo Eldoria]: Rèn Lò Rèn cấp 2 để nâng vũ khí lên +4 đến +6    |
|   mà không bao giờ lo vỡ đồ!                                      |
+-------------------------------------------------------------------+
```
- **Trường dữ liệu**: `regionId`, `zoneId`, tiến độ nạp Phaser (`0..100%`), bước đồng bộ (`Catalog → Atlas → WebSocket Auth → World Snapshot`), mẹo tiếng Việt xoay vòng.
- **Hành động**: Chỉ tự động chuyển tiếp; hiện nút `"Quay về Chọn Nhân Vật"` nếu chờ quá `15 giây`.
- **Ma trận Trạng thái**:
  - `loading`: Thanh tiến trình pixel 2 màu vàng-đồng kèm nhân vật nhỏ chạy bước pixel phía trên đầu thanh.
  - `empty`: Nếu chưa có ảnh minh họa vùng riêng, hiển thị nền bản đồ cổ giấy da tối có la bàn pixel.
  - `error`: Lỗi nạp atlas cục bộ hoặc server từ chối vào Dungeon (`ERR_DUNGEON_LOCKED`) → hiện hộp lỗi + nút `"Thử lại"` / `"Về làng an toàn"`.
  - `disconnected`: Tự động chuyển luồng reconnect 5 lần; nếu thất bại cho quay về `SCR-01`.

---

### `SCR-05` — Main Game HUD (Giao diện Chiến đấu & Phiêu lưu Chính)

- **Mục đích**: Cung cấp thông tin sinh tồn, chiến đấu, kỹ năng, tổ đội, nhiệm vụ và bản đồ nhỏ trong tầm liếc mắt `< 0.5 giây`, đồng thời để trống tuyệt đối **>= 68%–75% tâm màn hình** cho gameplay 2.5D và Boss telegraph.
- **Phím tắt**: Toàn bộ phím combat (`WASD`, `1..3`, `R`, `Q`, `Space`, `F`) và phím mở cửa sổ (`I, C, K, B, M, L, P, G, Enter, Esc`).
- **Wireframe Bố cục (`1280×720` / `1920×1080`)**:
```text
+-------------------------------------------------------------------------+
| [Portrait][Kael Lv.12]      [BOSS: THORNBACK ELDER — Phase 2] [MINIMAP] |
| HP [████████░░ 420/465]     HP [██████████░░░░░ 62%]  [EARTH] | [N] 14:20|
| MP [██████░░░░  85/120]     Poise [████░░░░░░] (Yếu: FIRE)    | Xuân • ☀ |
| ST [█████████░ 110/120]                                       +---------+
| 🍖 88% [Buff: +15% ATK 12m]                                   | NHIỆM VỤ|
|                                                               | • Gặt 3 |
| [PARTY (2/4)]                                                 |   lúa mì|
| • Lyra  [██████░░]                                            | • Hạ 5  |
| • Sera  [████████]                                            |   Slime |
|                                                                         |
|                      (VÙNG COMBAT TRUNG TÂM SẠCH)                       |
|                            [F] Chặt Cây Sồi                             |
|                                                                         |
| +----------------------+  +---------------------------------+  [💰1420] |
| | [Zone] Lyra: Vào     |  | [LMB] [1]  [2]  [3]  [R] | [Q] |  [★ 960 ] |
| |        boss nhé!     |  |  Atk  Lung Parr Clea ULT | Stew|  [I][C][K] |
| | [Enter để chat...]   |  | [EXP ████████████░░░░░░ 64%]   |  [B][G][M] |
| +----------------------+  +---------------------------------+-----------+
+-------------------------------------------------------------------------+
```
- **Trường dữ liệu & Sự kiện**: `useHudStore` (cập nhật throttle `<= 10 Hz` từ `WORLD_SNAPSHOT`, `COMBAT_DAMAGE_EVENT`, `BOSS_STATE_EVENT`), `useSocialStore` (`PARTY_UPDATE`, `CHAT_MESSAGE`), `useProgressionStore` (tối đa 3 nhiệm vụ ghim).
- **Hành động**: Click ô kỹ năng/bình máu, click biểu tượng menu góc dưới-phải, gõ Chat (`Enter`), click Minimap mở `SCR-17`, tương tác ngữ cảnh (`F`).
- **Ma trận Trạng thái**:
  - `loading`: Hiện khung HUD với thanh chỉ số shimmer cho tới khi nhận gói `WS_WELCOME` đầu tiên.
  - `empty`: Ẩn hoàn toàn khung Party nếu chơi solo; ẩn Boss Bar khi ngoài trận Boss; khung Quest Tracker hiển thị *"Nhấn [L] để xem nhiệm vụ mới"* nếu chưa ghim nhiệm vụ nào.
  - `error`: Toast đỏ góc trên-phải cho `ACTION_ERROR` (vd: *"Không đủ MP"*, *"Khoảng cách quá xa"*), nháy nhẹ ô tài nguyên thiếu.
  - `disconnected`: Thanh `ReconnectBanner` cố định mép trên cùng (`--z-disconnect`) không che tâm màn hình: *"Mất kết nối máy chủ — Đang thử kết nối lại (Lần 2/5)..."*, khóa tạm input combat nhưng giữ nguyên canvas.

---

### `SCR-06` — Inventory (Túi Đồ & Rương Lưu trữ)

- **Mục đích**: Quản lý vật phẩm trong Túi (`40` ô mở rộng dần) và Rương `bld_storage` (khi đứng gần Rương), sắp xếp lọc nhanh, tiêu dùng vật phẩm, tách chồng và so sánh trang bị.
- **Phím tắt**: `I` mở/đóng, `1..5` đổi tab lọc, `Click phải` dùng/trang bị nhanh, `Shift+Click` tách stack, `S` sắp xếp tự động.
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
| [Icon] TÚI ĐỒ (28 / 40 ô)   [Tiền tệ: 💰1,420 | ★960 | ⚒12]   [X] |
+-------------------------------------------------------------------+
| [Tất cả] [Vũ khí] [Trang bị] [Nguyên liệu] [Thực phẩm] [Nhiệm vụ] |
| Tìm kiếm: [_______________]   [Sắp xếp: Độ hiếm v]   [Dọn gọn]   |
+-----------------------------------------+-------------------------+
| [Slot][Slot][Slot][Slot][Slot][Slot]    | CHI TIẾT VẬT PHẨM       |
| [Slot][Slot][Slot][Slot][Slot][Slot]    | [Icon 64x64] (+3)       |
| [Slot][Slot][Slot][Slot][Slot][Slot]    | Iron Longsword [RARE R] |
| [Slot][Slot][Slot][Slot][Slot][Slot]    | ATK +48 (▲ +14)         |
| [Slot][Slot][Slot][Slot][Slot][Slot]    | Độ bền: 92/100          |
| (Cuộn mượt bằng thanh cuộn gỗ pixel)    |                         |
|                                         | [Trang bị] [Tách] [Bỏ]  |
+-----------------------------------------+-------------------------+
```
- **Trường dữ liệu & API**: `GET /api/v1/characters/:charId/inventory`, `INVENTORY_PATCH`, `INVENTORY_QUICK_USE`, `POST /api/v1/characters/:charId/equipment/equip`.
- **Hành động**: Kéo-thả sắp xếp, trang bị nhanh, sử dụng thức ăn/thuốc, chuyển qua lại Rương khi ở nhà, lọc theo danh mục & từ khóa tiếng Việt.
- **Ma trận Trạng thái**:
  - `loading`: Lưới ô hiển thị trạng thái khóa shimmer khi giao dịch WAL đang chạy.
  - `empty`: Khi tab lọc rỗng (vd tab Thực phẩm trống) → minh họa giỏ trống + *"Chưa có món ăn nào — Thu hoạch nông sản và nấu tại Bếp (`bld_kitchen`)"*.
  - `error`: Toast + viền đỏ khi `ERR_INVENTORY_FULL` hoặc kéo vật phẩm không tương thích.
  - `disconnected`: Cho xem danh sách vật phẩm đã cache ở chế độ chỉ đọc; mọi nút hành động `disabled` với tooltip *"Đang ngoại tuyến"*.

---

### `SCR-07` — Equipment (Trang bị & Bộ Giáp — Paperdoll)

- **Mục đích**: Hiển thị trực quan **10 ô trang bị chuẩn** (`MAIN_HAND`, `OFF_HAND`, `HELMET`, `CHEST_ARMOR`, `GLOVES`, `BOOTS`, `RING_1`, `RING_2`, `NECKLACE`, `ACCESSORY`), hiệu ứng Bộ Trang bị (Set Bonus `2/4`, `4/4`), độ bền và chỉ số Combat Rating tổng hợp.
- **Phím tắt**: `U` mở trực tiếp (hoặc chuyển Tab từ `SCR-06`), `Click phải` tháo trang bị về túi.
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
| [Icon] TRANG BỊ ANH HÙNG — Kael Ironbound    Combat Rating: 312[X]|
+-------------------------------------------------------------------+
| [HELMET]     +---------------------+     [MAIN_HAND +3]           |
| [CHEST]      |  Sprite 48x64 x3    |     [OFF_HAND]               |
| [GLOVES]     |  (Xoay 4 hướng)     |     [NECKLACE]               |
| [BOOTS]      |  [<]  [>]           |     [RING_1] [RING_2]        |
|              +---------------------+     [ACCESSORY]              |
+-------------------------------------------------------------------+
| BỘ TRANG BỊ ĐANG KÍCH HOẠT:                                       |
| • Mossroot Guard Regalia (2/4): [✓] +24 DEF, +12% Kháng EARTH     |
|   (4/4 chưa mở): +140 HP, +20 Poise, hồi +3 HP/s                  |
| [Mở Túi Đồ (I)]      [Đi tới Lò Rèn Sửa Độ Bền]                   |
+-------------------------------------------------------------------+
```
- **Trường dữ liệu & API**: `equipment` map từ `useInventoryStore`, `equipmentSets` từ `game-data/items.json`; `POST /api/v1/characters/:charId/equipment/equip` & `/unequip` kèm `X-Idempotency-Key`.
- **Hành động**: Click ô trống lọc ngay món phù hợp trong túi, tháo đồ, xoay sprite 4 hướng, xem nhanh Set Bonus, cảnh báo vàng/đỏ nếu có món độ bền `< 20%`.
- **Ma trận Trạng thái**:
  - `loading`: Khóa ô trang bị đang thay đổi với đồng hồ cát nhỏ cho tới khi nhận `INVENTORY_PATCH`.
  - `empty`: Ô chưa mặc hiện bóng mờ biểu tượng loại trang bị (`ico_slot_helmet`, `ico_slot_ring`...) + tooltip *"Nhấn để chọn trang bị từ Túi Đồ"*.
  - `error`: Báo lỗi `ERR_INVENTORY_FULL` khi tháo đồ mà túi 40/40, hoặc sai `levelReq` / `weaponProficiencies`.
  - `disconnected`: Chỉ đọc, vô hiệu hóa thay đổi trang bị.

---

### `SCR-08` — Character Stats (Chỉ số & Phân bổ Điểm Thuộc tính)

- **Mục đích**: Trình bày minh bạch toàn bộ 17 chỉ số chiến đấu/sinh tồn, kháng 9 nguyên tố và cho phép người chơi tự do phân bổ điểm thuộc tính (`STR, AGI, INT, VIT, DEX, LUK`) có xem trước thay đổi chỉ số phái sinh trước khi xác nhận lên server.
- **Phím tắt**: `C` mở/đóng, `+`/`-` điều chỉnh điểm đang focus.
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
| [Icon] CHỈ SỐ NHÂN VẬT — Kael Ironbound • Lv.12 (EXP 64%)     [X] |
+----------------------------------+--------------------------------+
| THUỘC TÍNH CƠ BẢN (Điểm dư: 6)   | CHỈ SỐ PHÁI SINH (Xem trước)   |
| STR: 29  [-] [+] (+2 → 31)       | HP Tối đa : 465  → 490 (+25)   |
| AGI: 21  [-] [+]                 | MP Tối đa : 120                |
| INT: 13  [-] [+]                 | Stamina   : 135                |
| VIT: 26  [-] [+] (+1 → 27)       | ATK       : 84   → 89  (+5)    |
| DEX: 20  [-] [+]                 | DEF       : 42   → 44  (+2)    |
| LUK: 16  [-] [+]                 | Crit Rate : 14.5% | CritD 162% |
| [Đặt lại nháp] [XÁC NHẬN (Gold)] | AtkSpd: 1.12x | CDR: 6%        |
+----------------------------------+--------------------------------+
| KHÁNG 9 NGUYÊN TỐ: [🔥+12%][💧-5%][🪨+14%][🍃+4%][⚡0%][❄+5%]...   |
+-------------------------------------------------------------------+
```
- **Trường dữ liệu & API**: `GET /api/v1/characters/:charId/summary`, `POST /api/v1/characters/:charId/allocate-stats` kèm `X-Idempotency-Key`.
- **Hành động**: Tăng/giảm điểm nháp (chưa gửi server), xem công thức giải thích khi hover tên chỉ số (vd: *"1 STR = +2.5 ATK vật lý, +0.4% Stagger"*), xác nhận lưu lên JSON DB.
- **Ma trận Trạng thái**:
  - `loading`: Khóa nút Xác nhận khi server tính lại `derivedSnapshot` & `combatRating`.
  - `empty`: Khi `attributePointsFree === 0`, ẩn cụm nút `[-][+]` và hiện dòng *"Tăng cấp để nhận thêm 3 điểm thuộc tính mỗi cấp"*.
  - `error`: Nếu điểm gửi vượt quá điểm khả dụng (`ERR_VALIDATION_FAILED`), hoàn tác nháp về số liệu server.
  - `disconnected`: Khóa nút Xác nhận; giữ nguyên bảng chỉ số đọc được.

---

### `SCR-09` — Skill Tree (Cây Kỹ năng & Nâng cấp Bậc Kỹ năng)

- **Mục đích**: Hiển thị bộ 5 kỹ năng độc bản của anh hùng hiện tại (`Basic`, `Passive`, `3 Active`, `Ultimate`), bậc nâng cấp (`Rank 1..5`), tiêu hao MP/Stamina, Cooldown, hiệu ứng trạng thái và thông tin nâng cấp bậc kế tiếp.
- **Phím tắt**: `K` mở/đóng, `1..5` chọn kỹ năng, `Enter` nâng cấp bậc.
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
| [Icon] KỸ NĂNG — Kael Ironbound   Điểm Kỹ Năng Dư: 2          [X] |
+----------------------------------+--------------------------------+
|       [PAS: Forged Resolve]      | CHI TIẾT KỸ NĂNG (Parchment)   |
|             Lv.2/5               | [Icon 48x48] Crimson Crescent  |
|                |                 | [ULTIMATE] • [FIRE] • Phím [R] |
|  [1: Blazing] [2: Cinder] [3: Sun| Hồi chiêu: 28s | MP: 45        |
|   Lv.3/5       Lv.2/5      Lv.1/5|                                |
|                |                 | Mô tả: Vung kiếm khí lưỡi liềm |
|      [R: Crimson Crescent]       | đỏ rực cắt xuyên kẻ địch...    |
|             Lv.1/5               |                                |
|  --------------------------------| Bậc hiện tại → Bậc 2:          |
|  [BASIC] Ember Blade Combo       | Sát thương: 280% → 315% ATK    |
|  (Chuỗi 3 đòn tự mở khóa)        | [ NÂNG CẤP (1 Điểm KN) ]       |
+----------------------------------+--------------------------------+
```
- **Trường dữ liệu & API**: `game-data/skills.json`, trạng thái rank từ `useProgressionStore`; `POST /api/v1/characters/:charId/skills/upgrade` kèm `X-Idempotency-Key`.
- **Hành động**: Chọn kỹ năng xem chỉ số hiện tại vs bậc tiếp theo (tuyến tính chống power creep), nâng cấp bằng `skillPointsFree`, xem điều kiện cấp mở khóa (`unlockLevel`).
- **Ma trận Trạng thái**:
  - `loading`: Nút Nâng cấp quay đồng hồ cát cho tới khi server xác nhận.
  - `empty`: Kỹ năng chưa mở khóa theo cấp độ hiển thị ổ khóa + *"Mở khóa ở Cấp 10"*.
  - `error`: Thông báo lỗi khi thiếu điểm kỹ năng hoặc đã đạt bậc tối đa (`5/5`).
  - `disconnected`: Chỉ cho xem mô tả kỹ năng; khóa nút Nâng cấp.

---

### `SCR-10` — Character Collection (Bộ Sưu tập 12 Anh hùng & Đổi Anh hùng)

- **Mục đích**: Khám phá toàn bộ **12 Anh hùng** của Eldoria (hiển thị anh hùng đã sở hữu ở trạng thái màu rực rỡ, anh hùng chưa mở ở dạng silhouette bí ẩn có thể xem trước bộ kỹ năng), theo dõi bậc Constellation (từ trùng lặp Gacha) và chuyển đổi anh hùng đang điều khiển khi ở Safe Zone.
- **Phím tắt**: `H` mở/đóng, bộ lọc theo `Element` và `CharacterClass`.
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
| [Icon] BỘ SƯU TẬP ANH HÙNG (4 / 12 Đã mở khóa)                [X] |
+-------------------------------------------------------------------+
| Lọc: [Tất cả] [WARRIOR][ARCHER][HEALER][KNIGHT][MAGE]... [Nguyên tố]|
+--------------------------------------+----------------------------+
| [Card: Kael]  [Card: Lyra]  [Card]   |  [Portrait 96x96]          |
|  ★RARE (Đang)  ★RARE (Mở)   Sera(Mở) |  Lyra Galeweaver           |
| [Card: Bram]  [Card: Vex]   [Card]   |  WIND • ARCHER • RARE ★★★  |
|  🔒 Chưa mở    🔒 Chưa mở   Orin 🔒  |  Constellation: C1 / C6    |
| (Cuộn 12 thẻ 3 cột)                  |  Nguồn mở: Starter / Gacha |
|                                      |  [Lore & Synergy]          |
|                                      |  [ĐỔI SANG ANH HÙNG NÀY]   |
+--------------------------------------+----------------------------+
```
- **Trường dữ liệu & API**: `game-data/characters.json`, `unlockedHeroIds` & `constellations` từ `useProgressionStore`; `POST /api/v1/characters/:charId/switch-hero`.
- **Hành động**: Lọc theo class/nguyên tố, đọc Lore & điểm cộng hưởng đội hình (`synergies`), đổi anh hùng đang điều khiển (chỉ cho phép khi đang ở Safe Zone và ngoài combat).
- **Ma trận Trạng thái**:
  - `loading`: Thẻ anh hùng shimmer khi tải chi tiết; nút Đổi Anh Hùng xoay khi gửi lệnh đổi.
  - `empty`: Nếu lọc không khớp anh hùng nào → *"Không có anh hùng khớp bộ lọc hiện tại — [Xóa bộ lọc]"*.
  - `error`: Nếu người chơi bấm Đổi Anh Hùng khi đang trong combat/dungeon → hiện thông báo rõ *"Chỉ có thể đổi anh hùng tại Vùng An Toàn (Greenhaven Village) ngoài chiến đấu"*.
  - `disconnected`: Xem bộ sưu tập chỉ đọc; khóa nút Đổi Anh Hùng.

---

### `SCR-11` — Gacha (Triệu Hồi Minh Bạch Bằng Nội Tệ Trong Game)

- **Mục đích**: Triệu hồi Anh hùng (`bnr_perm_heroes`) và Vũ khí (`bnr_perm_arsenal`) **100% bằng `STARLIGHT_SHARD` kiếm qua gameplay** (không IAP tiền thật, không dark pattern). Bắt buộc hiển thị công khai tỷ lệ, Pity Counter trực tiếp, lịch sử quay và Cửa hàng đổi `STAR_ESSENCE`.
- **Phím tắt**: `G` mở/đóng, `Space` bỏ qua hoạt ảnh quay (khi người chơi muốn nhanh hoặc bật Reduced Flash).
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
| [Banner Tabs: Anh Hùng Vĩnh Viễn | Kho Vũ Khí]  ★ 1,920 | ✦ 45 [X]|
+-------------------------------------------------------------------+
|  +-------------------------------------------------------------+  |
|  |  [Ornate Gold Frame — Artwork Pixel Anh Hùng Tiêu Biểu]     |  |
|  |  BANNER ANH HÙNG VĨNH VIỄN (100% Nội Tệ Trong Game)         |  |
|  |  • Bảo đảm 1 EPIC+ mỗi 10 lượt  • Soft Pity từ lượt 65      |  |
|  |  • Pity hiện tại: [ 42 / 80 ] (Chắc chắn LEGENDARY/MYTHIC)  |  |
|  +-------------------------------------------------------------+  |
|  [Công khai Tỷ lệ %]  [Lịch sử Quay]  [Đổi Tinh Chất Sao (✦)]     |
|                                                                   |
|       [ TRIỆU HỒI x1 (★ 160) ]    [ TRIỆU HỒI x10 (★ 1,600) ]     |
+-------------------------------------------------------------------+
```
- **Trường dữ liệu & API**:
  - `GET /api/v1/gacha/banners` (banner đang mở, bảng tỷ lệ công khai từng Rarity, `pityCounter`, ngưỡng soft/hard pity: `65/80` Character, `55/70` Weapon).
  - `POST /api/v1/characters/:charId/gacha/pull` (`{ bannerId, count: 1 | 10 }`) + `X-Idempotency-Key`.
  - `GET /api/v1/characters/:charId/gacha/history` (phân trang từ `history/gacha-history-<charId>.json`).
  - `POST /api/v1/characters/:charId/gacha/exchange` (đổi `STAR_ESSENCE` lấy mục tiêu cố định).
- **Hành động**: Chuyển banner, xem bảng tỷ lệ chi tiết (modal con 100% minh bạch), xem lịch sử có timestamp server, quay x1/x10, bỏ qua hoạt ảnh reveal (`<= 3 flashes/s`), xem chuyển đổi trùng lặp sang Constellation + `STAR_ESSENCE`.
- **Ma trận Trạng thái**:
  - `loading`: Khóa tuyệt đối cả 2 nút quay ngay sau lần bấm đầu (kèm `X-Idempotency-Key` chống click đúp gây race condition) với biểu tượng tinh cầu xoay.
  - `empty`: Tab Lịch sử khi chưa quay lần nào → *"Chưa có lịch sử triệu hồi — Hoàn thành nhiệm vụ & hạ Boss để nhận Mảnh Sao (`STARLIGHT_SHARD`)"*.
  - `error`: Khi không đủ `STARLIGHT_SHARD` (`ERR_INSUFFICIENT_FUNDS`), hiển thị số thiếu và gợi ý các nguồn kiếm trong game (Nhiệm vụ, Boss `boss_thornback_elder`, Thành tựu) — **TUYỆT ĐỐI KHÔNG** có nút nạp tiền.
  - `disconnected`: Khóa hoàn toàn 2 nút Triệu Hồi và Đổi Tinh Chất.

---

### `SCR-12` — Blacksmith (Lò Rèn Tổng hợp — Rèn, Cường hóa, Sửa chữa, Tách đồ)

- **Mục đích**: Cửa sổ trung tâm khi tương tác với `npc_smith_garrik` hoặc công trình `bld_blacksmith` trong lãnh địa; kết nối 4 nghiệp vụ cốt lõi: **Rèn vũ khí/giáp**, **Cường hóa (`SCR-13`)**, **Sửa độ bền** và **Tách trang bị lấy nguyên liệu**.
- **Phím tắt**: `F` gần Lò Rèn, `1..4` đổi 4 tab nghiệp vụ, `Esc` đóng.
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
| [Icon] LÒ RÈN (bld_blacksmith — Cấp 2: Mở khóa cường hóa +6)  [X] |
+-------------------------------------------------------------------+
| [ RÈN TRANG BỊ ] | [ CƯỜNG HÓA +1..+10 ] | [ SỬA CHỮA ] | [ TÁCH ]|
+---------------------------------+---------------------------------+
| DANH SÁCH BẢN VẼ RÈN:           | XEM TRƯỚC THÀNH PHẨM            |
| > Iron Longsword [RARE] (Đủ NL) | [Icon 64x64] Iron Longsword +0  |
|   Hunter Bow [RARE] (Thiếu 2)   | ATK: 34 | Crit +3% | Lv.5       |
|   Mossroot Helm [RARE] (Đủ NL)  |                                 |
|   Steel Greatsword 🔒 (Lò Lv.3) | Nguyên liệu yêu cầu:            |
|                                 | • Iron Ingot: 6 / 4 [✓ Đủ]      |
|                                 | • Oak Wood  : 12 / 2 [✓ Đủ]     |
|                                 | • Vàng      : 120 G [✓ Đủ]      |
|                                 |    [   RÈN NGAY (100%)   ]      |
+---------------------------------+---------------------------------+
```
- **Trường dữ liệu & API**: `game-data/recipes.json`, `useHomesteadStore` (cấp `bld_blacksmith`), `POST /api/v1/characters/:charId/crafting/execute`, `POST /api/v1/characters/:charId/equipment/repair`.
- **Hành động**: Chọn bản vẽ rèn, xem nhanh cấp Lò Rèn hiện tại và mốc nâng cấp tiếp theo, sửa từng món hoặc *"Sửa tất cả trang bị đang mặc"*, chuyển tab sang `SCR-13`.
- **Ma trận Trạng thái**:
  - `loading`: Khóa nút Rèn/Sửa + chạy âm thanh búa đe nhẹ khi server commit WAL.
  - `empty`: Tab Sửa chữa khi mọi đồ đều `100%` độ bền → *"Toàn bộ trang bị đang ở trạng thái hoàn hảo!"*.
  - `error`: `ERR_INSUFFICIENT_MATERIALS`, `ERR_INSUFFICIENT_FUNDS`, `ERR_INVENTORY_FULL`.
  - `disconnected`: Khóa mọi nút thực thi; chỉ cho tra cứu công thức rèn.

---

### `SCR-13` — Weapon Enhancement (`+0 → +10` Deterministic Preview)

- **Mục đích**: Mang lại khoảnh khắc tiến trình sức mạnh thỏa mãn nhất của Eldoria: **Cường hóa chắc chắn 100% thành công trong MVP từ `+0` lên tối đa `+10`**, không vỡ đồ, không tụt cấp, hiển thị rõ ràng mối liên kết giữa mốc nâng cấp và cấp `bld_blacksmith` (`Lv1: +1..+3`, `Lv2: +4..+6`, `Lv3: +7..+8`, `Lv4: +9..+10`).
- **Phím tắt**: Mở từ Tab 2 của `SCR-12`, `Space`/`Enter` xác nhận cường hóa (có guard chống spam).
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
| [Icon] CƯỜNG HÓA VŨ KHÍ (Tối đa +10 • Tỷ lệ MVP: 100% Chắc chắn)  |
+---------------------------+---------------------------------------+
| CHỌN VŨ KHÍ (Túi & Mặc):  |    [Icon +3]  ===>  [Icon +4]         |
| > [Mặc] Iron Longsword +3 |    Iron Longsword (+3 → +4)           |
|   Oak Bow +1              |    Tỷ lệ thành công: 100% (Không vỡ!) |
|   Dawn Staff +0           |    Yêu cầu: bld_blacksmith Cấp 2 [✓]  |
|                           |  -----------------------------------  |
|  [Xem Lịch sử Cường hóa]  |  CHỈ SỐ THAY ĐỔI:                     |
|                           |  • ATK Cơ bản : 48  →  56  (▲ +8)     |
|  MỐC LÒ RÈN:              |  • Bonus +4   : +4% Sát thương Kỹ năng|
|  Lv1:+3 | Lv2:+6 | Lv3:+8 |  NGUYÊN LIỆU & CHI PHÍ:               |
|  Lv4:+10 (Hào quang vàng) |  • Iron Ingot: 8/5 [✓]                |
|                           |  • Forest Core: 3/2 [✓]               |
|                           |  • Gold: 450 G [✓]                    |
|                           |    [  CƯỜNG HÓA LÊN +4 (Gold)  ]      |
+---------------------------+---------------------------------------+
```
- **Trường dữ liệu & API**: `POST /api/v1/characters/:charId/enhancement/upgrade` (`{ itemInstanceId }` + `X-Idempotency-Key`), `GET /api/v1/characters/:charId/enhancement/history`.
- **Hành động**: Chọn vũ khí từ danh sách, đối chiếu chỉ số trước/sau, xem nguyên liệu thiếu kèm tooltip nguồn farm (vd: *"Forest Core rơi từ Quái Rừng / `dng_mossroot_hollow`"*), bấm Cường Hóa, mở xem lịch sử nâng cấp lưu trong `history/upgrade-history-<charId>.json`.
- **Ma trận Trạng thái**:
  - `loading`: Hoạt ảnh búa rèn đập 1 nhịp (khóa nút `800ms` hoặc tới khi server trả kết quả WAL).
  - `empty`: Khi chưa chọn vũ khí → khung phải hiện bệ đe trống *"Chọn một vũ khí bên trái để xem công thức cường hóa"*.
  - `error`:
    - `ERR_BLACKSMITH_LEVEL_REQUIRED`: Hiện thanh cảnh báo vàng-đỏ + nút dẫn nhanh *"Nâng cấp Lò Rèn (`bld_blacksmith`)"*.
    - `ERR_MAX_ENHANCEMENT_REACHED`: Khi vũ khí đạt `+10`, thay nút Cường Hóa bằng huy hiệu vàng phát sáng **"ĐÃ ĐẠT ĐỈNH PHONG (+10 TỐI ĐA)"** (trạng thái hoàn mỹ, không hiện lỗi đỏ).
    - `ERR_INSUFFICIENT_MATERIALS` / `ERR_INSUFFICIENT_FUNDS`: Đánh dấu đỏ chính xác nguyên liệu thiếu.
  - `disconnected`: Khóa nút Cường Hóa, giữ hiển thị công thức để người chơi ghi nhớ mục tiêu farm.

---

### `SCR-14` — Crafting (Chế tạo, Nấu ăn, Luyện kim & Lò nung)

- **Mục đích**: Chế tạo xuyên suốt 4 nhóm nghề (`Smelting`, `Cooking`, `Alchemy`, `Workshop`), liên kết trực tiếp nông sản & khoáng sản thành thực phẩm buff combat, thuốc hồi phục và phôi kim loại.
- **Phím tắt**: `F` tại `bld_kitchen` / `bld_furnace` / `bld_alchemy_lab` / `bld_workshop`; `N` mở sổ công thức ở chế độ xem mọi nơi.
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
| [Icon] CHẾ TẠO — Bếp Lửa (bld_kitchen Cấp 1)                  [X] |
+-------------------------------------------------------------------+
| [Tất cả] [Nấu ăn] [Luyện kim] [Lò nung] [Thủ công]  [x] Chỉ đủ NL |
+---------------------------------+---------------------------------+
| CÔNG THỨC (14 MVP / 30 Full):   | CHI TIẾT CÔNG THỨC (Parchment)  |
| > Herb Stew (x3 làm được)       | [Icon] Herb Stew (csm_herb_stew)|
|   Sunwheat Bread (x5)           | Hiệu ứng: Hồi 65% Đói, +12% ATK |
|   Minor HP Potion (x2)          | và +15% Stamina Regen (15 phút) |
|   Iron Ingot [Cần Lò nung]      |                                 |
|                                 | Nguyên liệu (1 phần):           |
|                                 | • Moon Herb: 5/2 [✓]            |
|                                 | • Wild Berry: 8/3 [✓]           |
|                                 | Số lượng: [-] [ 1 ] [+] [Tối đa]|
|                                 |    [  CHẾ TẠO x1 (Emerald)  ]   |
+---------------------------------+---------------------------------+
```
- **Trường dữ liệu & API**: `game-data/recipes.json`, `POST /api/v1/characters/:charId/crafting/execute` (`{ recipeId, count }` + `X-Idempotency-Key`).
- **Hành động**: Chọn trạm/danh mục, lọc *"Chỉ hiện công thức đủ nguyên liệu"*, chọn số lượng chế tạo hàng loạt (`1..MaxCraftable`), xác nhận chế tạo atomic.
- **Ma trận Trạng thái**:
  - `loading`: Thanh tiến trình rèn/nấu ngắn (`600ms`) đồng bộ kết quả server.
  - `empty`: Nếu bật lọc *"Chỉ đủ NL"* mà không có món nào → *"Chưa đủ nguyên liệu — Tắt bộ lọc để xem nguồn thu hoạch"*.
  - `error`: Báo lỗi nếu mở sổ từ xa (không đứng gần trạm) → nút đổi thành *"Cần đứng tại Bếp (`bld_kitchen`) để nấu"* (chỉ cho xem công thức).
  - `disconnected`: Chỉ cho xem công thức, khóa nút Chế Tạo.

---

### `SCR-15` — Building (Xây dựng & Nâng cấp Công trình Lãnh địa)

- **Mục đích**: Cho phép người chơi xây mới và nâng cấp **13 công trình** (6 công trình MVP: `bld_player_house`, `bld_storage`, `bld_farm_plot`, `bld_chicken_coop`, `bld_blacksmith`, `bld_kitchen`), chọn vị trí đặt bằng **Building Ghost Preview** trên lưới `32×32 px` và quản lý quyền truy cập (`OWNER_ONLY`, `PARTY_ACCESS`).
- **Phím tắt**: `B` mở danh mục xây dựng (khi ở `zon_player_homestead`), `R` xoay hướng Ghost Preview (`0°/90°/180°/270°` nếu `rotatable: true`), `LMB` đặt, `RMB`/`Esc` hủy chế độ đặt.
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
| [Icon] XÂY DỰNG LÃNH ĐỊA (Công trình: 3 / 5 tối đa Nhà Cấp 1) [X] |
+-------------------------------------------------------------------+
| [ Xây Mới ]  |  [ Đã Xây & Nâng Cấp (3) ]  |  [ Quyền Truy Cập ]  |
+---------------------------------+---------------------------------+
| DANH MỤC CÔNG TRÌNH:            | THÔNG TIN CÔNG TRÌNH            |
| > Blacksmith (Lò Rèn) • 4x3 ô   | [Preview Sprite bld_blacksmith] |
|   Storage (Kho Chứa)  • 2x2 ô   | Mở khóa rèn & cường hóa vũ khí. |
|   Chicken Coop        • 3x3 ô   | Lợi ích Cấp 1: Cường hóa +1..+3 |
|   Kitchen (Bếp)       • 3x2 ô   | Thời gian xây: 30 giây          |
|   Barn [M2 Roadmap] 🔒          | Chi phí:                        |
|                                 | • Oak Wood: 35/25 [✓]           |
|                                 | • Rough Stone: 22/20 [✓]        |
|                                 | • Gold: 250 G [✓]               |
|                                 |  [ CHỌN VỊ TRÍ ĐẶT TRÊN BẢN ĐỒ ]|
+---------------------------------+---------------------------------+
```
- **Chế độ Ghost Placement (Overlay tối giản khi modal đóng tạm)**: Thanh banner nhỏ mép dưới: *"Đang đặt: Lò Rèn (4×3) • [LMB] Đặt • [R] Xoay • [ESC] Hủy"*. Ô lưới xanh + `✓` (hợp lệ), ô đỏ + gạch chéo `✕` + lý do (*"Trùng lối đi bắt buộc"* / *"Đè spawn point"*).
- **Trường dữ liệu & API**: `game-data/buildings.json`, `GET /api/v1/characters/:charId/homestead`, `POST /api/v1/characters/:charId/buildings/place`, `POST /api/v1/characters/:charId/buildings/:bldInstId/upgrade`.
- **Ma trận Trạng thái**:
  - `loading`: Sau khi click đặt, hiển thị khung cọc gỗ đang chờ server xác thực footprint + collision + WAL.
  - `empty`: Tab *"Đã xây"* luôn có sẵn ít nhất `bld_player_house` Lv1; nếu chưa xây công trình phụ hiện gợi ý *"Hãy xây Lò Rèn hoặc Bếp đầu tiên!"*.
  - `error`: `ERR_PLACEMENT_COLLISION`, `ERR_INSUFFICIENT_MATERIALS`, vượt giới hạn `maxHomesteadBuildings` (hướng dẫn nâng cấp `bld_player_house`).
  - `disconnected`: Thoát ngay chế độ Ghost Placement để tránh mất đồng bộ vị trí, khóa nút Xây/Nâng cấp.

---

### `SCR-16` — Farming (Canh tác Nông trại & Chăm sóc Vật nuôi)

- **Mục đích**: Cung cấp thao tác nông trại & chăn nuôi trực quan ngay tại ruộng (không bắt mở modal rườm rà cho từng ô đất), đồng thời có Sổ Nông Trại tổng hợp tiến trình mùa vụ (`SPRING/SUMMER/AUTUMN/WINTER`), độ ẩm đất, phân bón, hạnh phúc vật nuôi và tóm tắt **tiến trình offline (trần 24 giờ server)**.
- **Phím tắt**: `O` mở Sổ Nông Trại & Chăn Nuôi; khi đứng trên `bld_farm_plot` hiện thanh công cụ nông cụ nhanh (`F` tự chọn hành động thông minh: Cuốc → Gieo → Tưới → Thu hoạch).
- **Wireframe Bố cục (Modal Sổ Nông Trại + Thanh Ngữ cảnh Ruộng)**:
```text
+-------------------------------------------------------------------+
| [Icon] NÔNG TRẠI & CHĂN NUÔI • Mùa Xuân (Ngày 4/14) • Thời tiết ☀ |
+-------------------------------------------------------------------+
| [ Ô Đất Trồng (12/16) ]  |  [ Vật Nuôi (3/4) ]  |  [ Offline Log ]|
+---------------------------------+---------------------------------+
| TỔNG QUAN CÂY TRỒNG:            | CHỌN HẠT GIỐNG GIEO NHANH:      |
| • Sunwheat (6 ô): 4 Chín vàng!  | [sed_sunwheat x12] Xuân/Hạ/Thu  |
|   2 ô đang lớn (còn 4 phút)     | [sed_moon_herb x4] Xuân/Thu     |
| • Berry Bush (4 ô): Đã tưới 💧  | [Phân bón hữu cơ x6] +25% tốc độ|
| • Golden Carrot (2 ô): KHÔ ⚠   |                                 |
|                                 | VẬT NUÔI (anm_meadow_chicken):  |
| [Cảnh báo mùa]: Hạt giống trái  | • Gà Bông #1: ❤ 92% • Đã cho ăn |
| mùa sẽ bị khóa gieo tự động.    |   [Thu thập Trứng Tươi x2]      |
+---------------------------------+---------------------------------+
```
- **Trường dữ liệu & API**: `game-data/crops.json`, `game-data/animals.json`, `GET /api/v1/characters/:charId/homestead`, `POST /api/v1/characters/:charId/farming/action`, `POST /api/v1/characters/:charId/animals/action`.
- **Hành động**: Cuốc/Gieo/Tưới/Bón phân/Thu hoạch trực tiếp trên ô đất hoặc xem tổng quan; mua/cho ăn/vuốt ve/thu hoạch sản phẩm từ `anm_meadow_chicken`, `anm_clover_cow`; xem tóm tắt tiến trình sau khi offline (tối đa 24h).
- **Ma trận Trạng thái**:
  - `loading`: Chạy hoạt ảnh cuốc/tưới trên Phaser trong khi chờ phản hồi server.
  - `empty`: Khi chưa xây `bld_chicken_coop` hoặc chưa gieo hạt → hiện lời khuyên *"Xây Chuồng Gà (`bld_chicken_coop`) để bắt đầu nuôi Meadow Chicken"*.
  - `error`: Báo lỗi trái mùa vụ (*"Sunwheat không trồng được vào Mùa Đông"*), hết Stamina, hoặc túi đầy khi thu hoạch (`ERR_INVENTORY_FULL`).
  - `disconnected`: Khóa thao tác ruộng/vật nuôi; đồng hồ sinh trưởng tạm ngừng hiển thị đếm ngược cho đến khi đồng bộ lại `serverTime`.

---

### `SCR-17` — World Map (Bản đồ Thế giới 8 Khu vực & Dịch chuyển Nhanh)

- **Mục đích**: Quan sát toàn cảnh 8 vùng đất Eldoria (từ `reg_greenhaven_village` tới `reg_abyssal_kingdom`), vùng sương mù chưa khám phá (Fog of War), cấp độ đề xuất, vị trí đồng đội trong Party, cửa hầm ngục (`dng_mossroot_hollow`) và thực hiện Fast Travel tới Waypoint đã mở khóa.
- **Phím tắt**: `M` mở/đóng, lăn chuột phóng to/nhỏ (bước pixel), kéo chuột di chuyển bản đồ.
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
| [Icon] BẢN ĐỒ THẾ GIỚI ELDORIA  [Hiện: Greenhaven Village]    [X] |
+---------------------------------------------+---------------------+
|  [Bản đồ giấy da vẽ tay pixel 8 khu vực]    | THÔNG TIN KHU VỰC   |
|                                             | Whispering Forest   |
|  [🏠 Greenhaven]---[🌲 Whispering Forest]   | Cấp đề xuất: 1 – 15 |
|     (An toàn)         ├── ☠ Mossroot Hollow | Thời tiết: Mưa nhẹ  |
|                       └── ⛰ Ironpeak [M2]  | Boss: Thornback     |
|  [❄ Frostbound]   [💎 Crystal Caverns]      |                     |
|    (Sương mù)        (Sương mù)             | Tài nguyên chính:   |
|                                             | Gỗ sồi, Quặng sắt   |
|  Chú giải: [●] Bạn [◆] Party [✦] Waypoint   | [DỊCH CHUYỂN NHANH] |
+---------------------------------------------+---------------------+
```
- **Trường dữ liệu & API**: Dữ liệu vùng từ catalog, trạng thái mở khóa & Fog of War từ `useProgressionStore`, tọa độ đồng đội từ `PARTY_UPDATE`; gửi `INTERACT_REQ` / dịch chuyển Waypoint nhận `ZONE_TRANSITION`.
- **Hành động**: Click vùng/Waypoint để xem chi tiết tài nguyên, quái, Boss; thực hiện Fast Travel (yêu cầu ngoài combat, không đang trong trận Boss bị khóa cửa).
- **Ma trận Trạng thái**:
  - `loading`: Chuyển sang `SCR-04` khi lệnh dịch chuyển được server chấp thuận.
  - `empty`: Vùng chưa khám phá phủ sương mù cổ điển có viền đứt và nhãn *"Chưa khám phá — Hạ Boss vùng trước để mở đường"*.
  - `error`: Từ chối dịch chuyển khi đang trong combat (*"Không thể dịch chuyển nhanh khi đang giao chiến"*).
  - `disconnected`: Xem bản đồ chỉ đọc, khóa nút Dịch Chuyển Nhanh.

---

### `SCR-18` — Minimap (Bản đồ Thu nhỏ Góc Trên-Phải)

- **Mục đích**: Định hướng tức thì trong zone hiện tại (`152×152 px` ở `1280×720`, `184×184 px` ở `1920×1080`), hiển thị địa hình chính, NPC (chấm vàng), đồng đội Party (chấm xanh dương), mục tiêu nhiệm vụ (dấu `!`/`?` vàng), cổng chuyển vùng và đồng hồ ngày/đêm + mùa vụ + thời tiết.
- **Phím tắt**: Click mở `SCR-17`, phím `+`/`-` thu phóng 2 mức (`1x` / `1.5x`).
- **Wireframe Bố cục**:
```text
+-----------------------+
| Greenhaven Square  [M]|
+-----------------------+
|   ... [🏠] ...        |
|  ..  (!)   [▲ Bạn] .. |  <- Khung đá 9-slice + la bàn [N]
|  ... [◆ Party]  [🚪]  |
+-----------------------+
| ☀ Xuân N4 • 14:20 [+-]|
+-----------------------+
```
- **Trường dữ liệu**: Cập nhật ở tần suất `5 Hz` từ `useHudStore` (không render 60 FPS qua React), thời tiết & `dayTimeMinutes` đồng bộ từ server (`1 ngày = 24 phút thực`).
- **Hành động**: Click mở World Map, thu phóng 2 bậc, hover biểu tượng xem tên NPC/cổng.
- **Ma trận Trạng thái**:
  - `loading`: Nền giấy da tối mờ trong khi chuyển map.
  - `empty`: Trong đấu trường Boss nhỏ (`dng_mossroot_hollow`), hiển thị sơ đồ đấu trường gọn gồm vị trí 4 trụ đá `safePillars` và đồng đội.
  - `error`: Nếu thiếu texture minimap của map thử nghiệm, fallback vẽ khung lưới tọa độ + chấm nhân vật.
  - `disconnected`: Chấm trạng thái mạng góc trên khung chuyển đỏ kèm nhãn `"Mất đồng bộ"`.

---

### `SCR-19` — Quest Journal (Nhật ký Nhiệm vụ — Sổ Giấy Da)

- **Mục đích**: Theo dõi chuỗi nhiệm vụ Cốt truyện (Main), Phụ (Side), Hàng ngày (Daily) và Thành tựu kiếm `STARLIGHT_SHARD`; cho phép ghim tối đa 3 nhiệm vụ lên HUD.
- **Phím tắt**: `L` mở/đóng, `Up`/`Down` duyệt nhiệm vụ, `T` ghim/bỏ ghim lên HUD.
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
| [Icon] NHẬT KÝ NHIỆM VỤ (Parchment 2-Page Book)               [X] |
+---------------------------------+---------------------------------+
| [Đang làm (4)] [Hoàn thành (8)] | VỤ MÙA ĐẦU TIÊN                 |
| ─────────────────────────────── | (qst_001_first_harvest • Chính) |
| ★ [Ghim] Vụ Mùa Đầu Tiên  [2/3] | Người giao: Trưởng Làng Rowan   |
|   Bóng Đêm Rừng Thì Thầm  [0/1] |                                 |
|   Thợ Rèn Tập Sự          [1/2] | Mục tiêu:                       |
|   Săn Bầy Sói Đầu Đàn     [0/1] | [✓] Chặt 3 Gỗ Sồi (3/3)         |
|                                 | [✓] Gặt 1 Lúa Mì Mặt Trời (1/1) |
|                                 | [ ] Hạ 1 Moss Slime (0/1)       |
|                                 |                                 |
|                                 | Phần thưởng:                    |
|                                 | [EXP +120] [💰 150G] [★ 160]    |
|                                 | [Bỏ ghim HUD] [Định vị Bản đồ]  |
+---------------------------------+---------------------------------+
```
- **Trường dữ liệu & API**: `game-data/quests.json`, tiến độ từ `useProgressionStore`; nhận/trả qua `POST /api/v1/characters/:charId/quests/:questId/accept` & `/claim`.
- **Hành động**: Chuyển tab Đang làm / Hoàn thành, Ghim lên HUD, bấm *"Định vị Bản đồ"* mở `SCR-17` và nháy vùng mục tiêu.
- **Ma trận Trạng thái**:
  - `loading`: Trang giấy da hiển thị dấu mực đồng bộ.
  - `empty`: Khi hoàn tất hết nhiệm vụ đang nhận → *"Nhật ký đã gọn gàng! Hãy trò chuyện với Trưởng làng Rowan hoặc khám phá Whispering Forest để nhận nhiệm vụ mới"*.
  - `error`: Lỗi nhận thưởng khi túi đồ đầy (`ERR_INVENTORY_FULL`) → nhắc dọn tối thiểu 1 ô túi.
  - `disconnected`: Đọc nhật ký bình thường ở chế độ ngoại tuyến.

---

### `SCR-20` — NPC Dialogue (Hộp thoại NPC & Nhận/Trả Nhiệm vụ)

- **Mục đích**: Tạo chiều sâu thế giới Eldoria thông qua các cuộc trò chuyện sống động với chân dung pixel lớn (`96×96 px`), hiệu ứng chữ chạy typewriter (có thể bấm bỏ qua ngay), và nút hành động trực tiếp (Nhận/Trả nhiệm vụ, Mở Lò Rèn, Mua hạt giống).
- **Phím tắt**: `F` / `Space` hoàn tất dòng chữ hoặc sang câu tiếp theo, `1..4` chọn nhánh hội thoại, `Esc` kết thúc đối thoại.
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
|  [Thế giới Phaser vẫn hiển thị rõ NPC & Nhân vật phía trên]       |
|                                                                   |
| +----------+----------------------------------------------------+ |
| | Portrait | TRƯỞNG LÀNG ROWAN (npc_elder_rowan)                | |
| | 96 x 96  | "Chào mừng nhà thám hiểm trẻ đến với Greenhaven!   | |
| | (Biểu    | Rừng Thì Thầm gần đây có nhiều Moss Slime kéo ra   | |
| |  cảm)    | gần ruộng lúa. Cháu giúp ta thu hoạch và dọn       | |
| |          | dẹp chúng nhé?"                                    | |
| +----------+----------------------------------------------------+ |
|  [1] Nhận nhiệm vụ: Vụ Mùa Đầu Tiên (Thưởng: ★160, 💰150G)        |
|  [2] Kể cho cháu nghe về Thornback Elder                          |
|  [3] Tạm biệt [ESC]                                               |
+-------------------------------------------------------------------+
```
- **Trường dữ liệu & API**: `INTERACT_REQ (targetType: "NPC")`, `POST /api/v1/characters/:charId/quests/:questId/accept` & `/claim` kèm `X-Idempotency-Key`.
- **Hành động**: Tiếp tục hội thoại, chọn nhánh trả lời, nhận/trả nhiệm vụ, mở nhanh `SCR-12 Blacksmith` từ `npc_smith_garrik`.
- **Ma trận Trạng thái**:
  - `loading`: Khóa lựa chọn nhận/trả nhiệm vụ cho tới khi server xác nhận trả thưởng WAL.
  - `empty`: NPC không còn nhiệm vụ mới sẽ phát câu chào theo thời tiết/thời gian trong ngày (sáng/tối/mưa).
  - `error`: Nếu người chơi bị đẩy xa quá `96 px` hoặc túi đầy khi trả nhiệm vụ → hiển thị lời thoại cảnh báo rõ ràng.
  - `disconnected`: Đóng hộp thoại an toàn và hiện Banner Reconnect.

---

### `SCR-21` — Party (Tổ đội Co-op 2–4 Người & Vào Hầm Ngục)

- **Mục đích**: Thành lập tổ đội 2–4 người chơi, mời bạn bè hoặc người chơi gần đó, kiểm tra vai trò/nguyên tố đội hình (`TANK`, `MELEE_DPS`, `RANGED_DPS`, `SUPPORT`) và khởi động bước vào phụ bản Boss (`dng_mossroot_hollow`) với biểu quyết sẵn sàng (Ready Check).
- **Phím tắt**: `P` mở/đóng, `Y`/`N` chấp nhận/từ chối lời mời Party nhanh từ Toast.
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
| [Icon] TỔ ĐỘI THÁM HIỂM (2 / 4 Thành viên)  [Trưởng nhóm: Kaelen] |
+-------------------------------------------------------------------+
|  +--------------+  +--------------+  +-----------+  +-----------+ |
|  | ★ Kaelen     |  | LyraTest     |  |  + MỜI    |  |  + MỜI    | |
|  | Kael [FIRE]  |  | Lyra [WIND]  |  |  NGƯỜI    |  |  NGƯỜI    | |
|  | Lv.12 • DPS  |  | Lv.11 • RDPS |  |  CHƠI     |  |  CHƠI     | |
|  | Greenhaven   |  | Greenhaven   |  |  (Trống)  |  |  (Trống)  | |
|  | [Sẵn sàng ✓] |  | [Sẵn sàng ✓] |  |           |  |           | |
|  +--------------+  +--------------+  +-----------+  +-----------+ |
|  Mời nhanh theo tên: [_________________] [Gửi lời mời]            |
|  Phụ bản chọn: [Mossroot Hollow (Lv.10–15) v]                     |
|  [Rời Tổ Đội (Danger)]           [ BẮT ĐẦU HẦM NGỤC (Gold) ]      |
+-------------------------------------------------------------------+
```
- **Trường dữ liệu & Sự kiện**: `useSocialStore`, gửi `PARTY_ACTION` (`CREATE`, `INVITE`, `ACCEPT`, `DECLINE`, `LEAVE`, `KICK`, `START_DUNGEON`), nhận `PARTY_UPDATE` & `PARTY_INVITE`.
- **Hành động**: Tạo tổ đội, mời người chơi cùng zone/bạn bè, chuyển quyền trưởng nhóm, kích thành viên (chỉ trưởng nhóm), khởi chạy Ready Check 15 giây vào `dng_mossroot_hollow`.
- **Ma trận Trạng thái**:
  - `loading`: Hiển thị trạng thái *"Đang chờ đồng đội xác nhận sẵn sàng (1/2)..."* kèm đồng hồ đếm ngược 15 giây.
  - `empty`: Khi chưa có tổ đội → hiển thị giải thích lợi ích co-op (chia sẻ cộng hưởng nguyên tố, loot cá nhân công bằng không tranh giành) + nút lớn `"Tạo Tổ Đội Mới"`.
  - `error`: Báo lỗi nếu tổ đội đã đủ 4 người, thành viên chưa đủ cấp mở khóa dungeon hoặc có người đang ngoại tuyến.
  - `disconnected`: Hiển thị badge đỏ `"Mất kết nối"` trên thẻ thành viên rớt mạng (giữ slot trong 120 giây reconnect grace window).

---

### `SCR-22` — Boss Reward (Bảng Chiến Lợi Phẩm Hạ Boss)

- **Mục đích**: Tôn vinh khoảnh khắc chiến thắng Boss nhiều giai đoạn (`boss_thornback_elder`), hiển thị thành tích tổ đội (thời gian hạ gục, số lần phá giáp Stagger, đóng góp sát thương/hồi máu) và phần thưởng **cá nhân hóa công bằng (`eligibleCharacterIds`)** để không ai bị cướp đồ.
- **Phím tắt**: `Space`/`Enter` nhận toàn bộ & rời phụ bản khi sẵn sàng, `Esc` đóng sau khi đã nhận.
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
|  === CHIẾN THẮNG! THORNBACK ELDER ĐÃ BỊ ĐÁNH BẠI === (Gold Ornate)|
+-------------------------------------------------------------------+
|  Thời gian hạ gục: 04:18  |  Phá giáp (Stagger): 3 lần  | Hạng: S |
+----------------------------------+--------------------------------+
| THÀNH TÍCH TỔ ĐỘI:               | CHIẾN LỢI PHẨM CỦA BẠN:        |
| • Kaelen (FIRE):  58% ST | 2 Phá | [EXP +850] [💰 600G] [★ 240]   |
| • LyraTest(WIND): 42% ST | 1 Phá | [Boss Token x2]                |
|                                  | +----------------------------+ |
|                                  | | [Mossroot] [Ancient] [Core]| |
|                                  | |  Breastpl.  Heartw.  x3    | |
|                                  | |   RARE ★★★  EPIC ★★★★      | |
|                                  | +----------------------------+ |
|                                  | [Về Làng Greenhaven] [Chơi lại]|
+----------------------------------+--------------------------------+
```
- **Trường dữ liệu & Sự kiện**: Kích hoạt từ `BOSS_STATE_EVENT (state: "DEFEATED")` + `INVENTORY_PATCH` / `LOOT_SPAWNED`.
- **Hành động**: Xem tooltip từng món chiến lợi phẩm, quay về `reg_greenhaven_village` hoặc bỏ phiếu tổ đội đi lại phụ bản.
- **Ma trận Trạng thái**:
  - `loading`: Đang chờ server chốt sổ WAL phân phát phần thưởng (`"Đang tổng kết chiến lợi phẩm..."`).
  - `empty`: Nếu túi đồ đã đầy tại thời điểm hạ Boss, đồ tự động gửi vào **Rương Lưu trữ (`bld_storage`)** và hiện thông báo rõ ràng (tuyệt đối không làm mất loot Boss!).
  - `error`: Lỗi đồng bộ thưởng → nút `"Đồng bộ lại kho đồ"` gọi `GET /api/v1/characters/:charId/inventory`.
  - `disconnected`: Lưu thưởng an toàn trên server JSON DB trước khi phát sự kiện; khi reconnect hiển thị thông báo đã nhận thưởng trong Kho/Rương.

---

### `SCR-23` — Settings (Cài đặt Đồ họa, Âm thanh, Phím tắt & Trợ năng)

- **Mục đích**: Cung cấp quyền kiểm soát toàn diện cho trải nghiệm pixel-perfect, âm thanh tách kênh, tùy biến phím tắt và toàn bộ công cụ **Trợ năng (Accessibility)** bắt buộc.
- **Phím tắt**: `ESC` mở/đóng (khi không có modal nào khác đang mở).
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
| [Icon] CÀI ĐẶT HỆ THỐNG                                       [X] |
+-------------------------------------------------------------------+
| [ Đồ họa ] | [ Âm thanh ] | [ Điều khiển ] | [ Trợ năng ] | [TK]  |
+-------------------------------------------------------------------+
|  HIỂN THỊ PIXEL-PERFECT:                                          |
|  • Chế độ Scale Canvas : (●) Integer Fit (Chuẩn)  ( ) Fill Pixel  |
|  • Cỡ chữ Giao diện    : [ 100% ] [ 115% ] [ 130% ]               |
|  TRỢ NĂNG & AN TOÀN THỊ GIÁC:                                     |
|  • Rung màn hình (Shake): [ 0% Tắt ] [ 50% Nhẹ ] [● 100% Chuẩn ]  |
|  • Giảm lóe sáng VFX    : [✓] Bật (Giới hạn <= 3 nháy/giây)       |
|  • Phụ đề Cảnh báo Boss : [✓] Bật (Hiển thị âm thanh Boss)        |
|  • Chế độ Hỗ trợ Mù màu : [✓] Luôn hiện Chữ/Sao Độ Hiếm           |
|  ---------------------------------------------------------------  |
|  [Khôi phục mặc định]  [Về Chọn Nhân Vật]     [ LƯU CÀI ĐẶT ]     |
+-------------------------------------------------------------------+
```
- **Trường dữ liệu**: Lưu cục bộ trong `localStorage` + đồng bộ hồ sơ tài khoản JSON (`preferences` trên server nếu đã đăng nhập).
- **Hành động**: Chỉnh âm lượng 5 kênh (Tổng, Nhạc nền, SFX Chiến đấu, SFX UI, Môi trường), gán lại phím tắt (kiểm tra trùng phím ngay lập tức), đổi cỡ chữ áp dụng live không cần reload trang, quay về `SCR-02` hoặc đăng xuất.
- **Ma trận Trạng thái**:
  - `loading`: Trạng thái chờ nhấn phím mới khi đang Remap (`"Nhấn phím bất kỳ để gán... (ESC để hủy)"`).
  - `empty`: Không áp dụng (luôn có giá trị mặc định hợp lệ).
  - `error`: Cảnh báo màu vàng-đỏ ngay khi gán phím trùng với phím đã dùng và đề xuất *"Hoán đổi phím"* hoặc *"Hủy"*.
  - `disconnected`: Mọi tùy chỉnh cục bộ (đồ họa/âm thanh/trợ năng) vẫn áp dụng tức thì không phụ thuộc mạng.

---

### `SCR-24` — Death & Respawn (Gục ngã & Hồi sinh An toàn)

- **Mục đích**: Xử lý khoảnh khắc nhân vật hết HP (`HP = 0`) một cách công bằng, minh bạch nguyên nhân gục ngã (tên quái/kỹ năng Boss), trấn an người chơi (**KHÔNG mất trang bị vĩnh viễn**) và cung cấp lựa chọn hồi sinh rõ ràng.
- **Phím tắt**: `Enter` xác nhận lựa chọn hồi sinh mặc định (sau độ trễ an toàn `1.5s` để tránh bấm nhầm khi đang spam phím combat).
- **Wireframe Bố cục**:
```text
+-------------------------------------------------------------------+
|                === BẠN ĐÃ GỤC NGÃ === (Dark Crimson Stone)        |
+-------------------------------------------------------------------+
|  Kẻ hạ gục: Thornback Elder (Đòn: Canopy Thorn Rain — Phase 3)    |
|  Trạng thái Tổ đội: 1 / 2 đồng đội vẫn đang chiến đấu!            |
|                                                                   |
|  • Trang bị & Vũ khí: ĐƯỢC BẢO TOÀN 100% (Giảm nhẹ 5% độ bền)     |
|  • Gợi ý chiến thuật: Dùng kỹ năng hệ Hỏa (FIRE) để phá giáp Boss.|
|                                                                   |
|  [ QUAN SÁT ĐỒNG ĐỘI ]                                            |
|  [ HỒI SINH TẠI CỬA HẦM NGỤC ]   [ HỒI SINH TẠI LÀNG GREENHAVEN ] |
+-------------------------------------------------------------------+
```
- **Trường dữ liệu & Sự kiện**: Nhận từ `PLAYER_DEATH` (`killerName`, `respawnOptions`, `penaltySummaryVi`); gửi lựa chọn hồi sinh nhận `PLAYER_RESPAWN` + `ZONE_TRANSITION` (nếu về làng).
- **Hành động**: Quan sát đồng đội (nếu còn đồng đội sống trong Boss Arena bị khóa cửa), hồi sinh tại cửa hầm ngục (khi cả đội đã wipe và Boss reset về Phase 1), hoặc hồi sinh ngay về `bld_player_house` / quảng trường `reg_greenhaven_village` với `100% HP/MP`.
- **Ma trận Trạng thái**:
  - `loading`: Đếm ngược `1.5s` mở khóa nút chống bấm nhầm + trạng thái `"Đang hồi sinh..."` chờ `PLAYER_RESPAWN`.
  - `empty`: Trong trường hợp chơi solo, ẩn nút *"Quan sát đồng đội"*.
  - `error`: Nếu chọn hồi sinh cửa hầm ngục nhưng instance đã đóng → tự chuyển đề xuất *"Hồi sinh tại Làng Greenhaven"*.
  - `disconnected`: Giữ overlay mở với Banner Reconnect; khi kết nối lại nhận đúng trạng thái sống/chết chuẩn từ server.

---

## 3. Liên kết Chéo Kiểm soát Quality Gate
- Toàn bộ 24 màn hình trên đều có **luồng chuyển màn hình** tại [`user-flows.md`](./user-flows.md), **phím tắt & focus arbitration** tại [`interaction-design.md`](./interaction-design.md), **bố cục 5 breakpoint desktop** tại [`responsive-design.md`](./responsive-design.md) và **kịch bản kiểm thử Playwright 24 × 8 trạng thái** tại [`ui-testing-strategy.md`](./ui-testing-strategy.md).
