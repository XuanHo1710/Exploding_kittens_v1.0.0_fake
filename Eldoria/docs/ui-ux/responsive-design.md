# Responsive Design & Pixel-Perfect Layout — Eldoria: Forgotten Wilds

**Trạng thái**: Design Baseline v1.0 (`DESIGN_AND_PLANNING_ONLY`)  
**Cập nhật lần cuối**: 2026-11-19  
**Tham chiếu**: [Constitution Nguyên tắc V](../../.specify/memory/constitution.md), [ASM-006](../management/assumptions-and-decisions.md), [frontend-architecture.md](../architecture/frontend-architecture.md), [design-system.md](./design-system.md)

---

## 1. Chiến lược Desktop-First & Tỷ lệ Khung hình Gốc (`640×360`)

Trong **Milestone 1 (MVP)**, Eldoria: Forgotten Wilds ưu tiên tuyệt đối trải nghiệm **Desktop Browser** (`Chrome`, `Edge`, `Firefox` mới nhất) với độ phân giải chơi tối thiểu **`1024×768`**. Lớp đồ họa thế giới Phaser 3 chạy ở độ phân giải logic cố định **`640×360 px`** (tỷ lệ `16:9`, tương ứng `20 × 11.25` base tile `32×32 px`), trong khi lớp giao diện React/Tailwind neo độc lập theo kích thước viewport thực để chữ tiếng Việt và biểu tượng 9-slice luôn sắc nét, không bị bể hình hay thu quá nhỏ.

### 1.1 Ma trận Breakpoint Desktop Chính thức

| Tên Breakpoint | Kích thước Viewport | Chế độ Scale Phaser Mặc định (`INTEGER_FIT`) | Kích thước Canvas Thực & Viền Letterbox | Chế độ React HUD | Trạng thái Hỗ trợ |
| :--- | :---: | :---: | :--- | :--- | :---: |
| **`xl-qhd`** | `2560×1440` | `4×` (Nguyên vẹn 100%) | `2560×1440` (`0px` viền) | Rộng rãi (`padding 24px`), Minimap `184px` | M1 (Hỗ trợ đầy đủ) |
| **`lg-fhd`** | `1920×1080` | `3×` (Nguyên vẹn 100%) | `1920×1080` (`0px` viền) | Tiêu chuẩn Full HD (`padding 16px`), Minimap `184px` | M1 (Chuẩn tham chiếu #1) |
| **`md-wxga`** | `1440×900` | `2×` (Nguyên vẹn 100%) | `1280×720` (Viền gỗ tối `80px` trái/phải, `90px` trên/dưới) | Neo sát mép Viewport (tận dụng dải viền để giảm che Canvas!) | M1 (Hỗ trợ đầy đủ) |
| **`md-laptop`** | `1366×768` | `2×` (Nguyên vẹn 100%) | `1280×720` (Viền tối `43px` trái/phải, `24px` trên/dưới) | Neo sát mép Viewport (`padding 8px`), Minimap `152px` | M1 (Hỗ trợ đầy đủ) |
| **`sm-hd`** | `1280×720` | `2×` (Nguyên vẹn 100%) | `1280×720` (`0px` viền) | Tiêu chuẩn HD (`padding 8px`), Minimap `152px` | M1 (Chuẩn tham chiếu #2) |
| **`xs-min`** | `1024×768` | `1.5×` Pixel-Snapped (`FILL_PIXELATED` tự bật) hoặc `1×` (`640×360`) | `960×540` (căn giữa trong khung tối, pixel đều nhờ `nearest-neighbor`) | **Compact HUD** (Thu gọn Chat mặc định, Quest Tracker 2 dòng, Minimap `128px`) | M1 (Ngưỡng chơi tối thiểu) |
| **`unsupported`** | `< 1024×700` | Cảnh báo nhẹ | Hiển thị thông báo không chặn *"Khuyến nghị độ phân giải tối thiểu 1024×768 (hoặc phóng to cửa sổ trình duyệt)"* | Khóa chế độ 1 cột nếu cố tiếp tục | M1 (Fallback); M5 cho Mobile |

### 1.2 So sánh Hai Chế độ Scale Canvas Trong `SCR-23 Settings`
1. **`INTEGER_FIT` (Mặc định — Chuẩn Pixel Art Tuyệt đối)**:
   - Tính hệ số nhân nguyên `scale = Math.max(1, Math.floor(Math.min(vw / 640, vh / 360)))`.
   - Đảm bảo mọi điểm ảnh `1×1` trong thế giới game là hình vuông đồng nhất `2×2`, `3×3` hoặc `4×4` — **0% hiện tượng mixel (pixel méo lệch tỷ lệ)**, tuân thủ tuyệt đối Nguyên tắc V Hiến pháp.
   - Khoảng trống viền (nếu màn hình là `16:10` hoặc `1366×768`) được tô nền obsidian `#161320` với hoa văn khung gỗ mảnh ở rìa canvas; React HUD có thể neo tận dụng một phần dải viền này để giải phóng tối đa diện tích quan sát chiến trường.
2. **`FILL_PIXELATED` (Tùy chọn cho người thích tràn viền)**:
   - Phóng tỷ lệ thực `scale = Math.min(vw / 640, vh / 360)` với `image-rendering: pixelated; antialias: false;` (vẫn giữ sắc cạnh không làm mờ, chấp nhận chênh lệch sub-pixel nhỏ trên màn hình `1366×768` / `1024×768`).

---

## 2. Bảo vệ Vùng An toàn Chiến đấu & Boss Telegraph (Safe-Area HUD Anchoring)

Một lỗi thiết kế nghiêm trọng (`P0`) trong game Action RPG là để thanh kỹ năng, khung chat hoặc thanh máu Boss che lấp vùng trung tâm nơi nhân vật và tín hiệu báo đòn (`Depth 100–199`) xuất hiện. Eldoria áp dụng quy chuẩn **Safe-Area Combat Box** bắt buộc:

```text
+-----------------------------------------------------------------------+
| [TOP-LEFT: Unit Frame]     [TOP-CENTER: Boss Bar]  [TOP-RIGHT: Map]   |
|  (<= 260x104 px)            (<= 480x64 px)          (<= 184x196 px)   |
| [LEFT: Party <= 180px]                              [RIGHT: Quests]   |
|                                                      (<= 220x160 px)  |
|             +-----------------------------------------+               |
|             |                                         |               |
|             |     VÙNG AN TOÀN CHIẾN ĐẤU TRUNG TÂM    |               |
|             |    (Tối thiểu 68% - 75% diện tích)      |               |
|             |    • Nhân vật luôn ở tâm (50%, 50%)     |               |
|             |    • CẤM đặt bất kỳ phần tử HUD nào!    |               |
|             |    • Đảm bảo đọc rõ 100% Boss Telegraph |               |
|             |                                         |               |
|             +-----------------------------------------+               |
|                                                                       |
| [BOT-LEFT: Chat Box]     [BOT-CENTER: Skill Hotbar] [BOT-RIGHT: Menu] |
|  (<= 280x136 px)          (<= 440x84 px)             (<= 200x84 px)   |
+-----------------------------------------------------------------------+
```

### 2.1 Ngân sách Kích thước Widget HUD Theo Breakpoint

| Widget HUD | `1920×1080` (`lg-fhd`) | `1280×720` (`sm-hd`) | `1024×768` (`xs-min` Compact) | Quy tắc Neo (CSS Anchor) |
| :--- | :---: | :---: | :---: | :--- |
| **Unit Frame** (Portrait + HP/MP/ST/Hunger) | `260 × 104 px` | `232 × 92 px` | `208 × 84 px` | `top: 12px; left: 12px;` |
| **Party Mini-List** (tối đa 3 đồng đội) | `200 × 132 px` | `176 × 114 px` | `156 × 96 px` (gọn 1 dòng/người) | Dưới Unit Frame `gap: 8px` |
| **Boss HP & Poise Bar** (chỉ hiện khi đấu Boss) | `520 × 68 px` | `420 × 60 px` | `360 × 56 px` | `top: 12px; left: 50%; translateX(-50%)` |
| **Minimap + Đồng hồ Mùa/Ngày** | `184 × 204 px` | `152 × 176 px` | `128 × 152 px` | `top: 12px; right: 12px;` |
| **Quest Tracker** (tối đa 3 nhiệm vụ) | `220 × 156 px` | `196 × 132 px` | `176 × 92 px` (thu gọn nút mở/đóng) | Dưới Minimap `gap: 8px` |
| **Chat Box** (Zone / Party) | `320 × 156 px` | `268 × 124 px` | Thu gọn thành 1 dòng + nút mở rộng (`220 × 44 px`) | `bottom: 12px; left: 12px;` |
| **Skill Hotbar + Quick Slot + EXP Bar** | `464 × 84 px` (ô `56px`) | `408 × 74 px` (ô `48px`) | `368 × 68 px` (ô `44px`) | `bottom: 12px; left: 50%; translateX(-50%)` |
| **Currency + Quick Menu Icons** | `220 × 84 px` | `192 × 74 px` | `164 × 68 px` (2 hàng icon gọn) | `bottom: 12px; right: 12px;` |
| **Tỷ lệ Vùng Trung tâm Trống (Ước tính)** | **~76% diện tích** | **~70% diện tích** | **~68% diện tích** | Đạt ngưỡng an toàn đọc Boss Telegraph |

### 2.2 Xử lý Màn hình Siêu Rộng (Ultrawide `2560×1080` / `3440×1440`)
- Canvas Phaser giữ nguyên tỷ lệ `16:9` đặt chính giữa (`1920×1080` @ `3×` trên `2560×1080`) để **đảm bảo công bằng tầm nhìn multiplayer** (người dùng màn Ultrawide không nhìn thấy quái/Boss xa hơn người dùng `16:9`).
- Lớp React HUD được giới hạn trong container `max-width: 1920px; margin-inline: auto;` (hoặc neo vào mép khung `16:9`) để người chơi không phải ngoái cổ nhìn Minimap hay Chat quá xa ở rìa màn hình.

---

## 3. Quy tắc Co giãn & Cuộn Modal RPG (Modal Scroll & Grid Reflow Rules)

Tất cả 18 cửa sổ Modal (`SCR-06` → `SCR-23`) tuân thủ quy tắc không bao giờ bị tràn ra ngoài viewport theo cả chiều ngang và chiều dọc:

1. **Khung bao tối đa (Viewport Clamping)**:
   - `max-width: min(960px, calc(100vw - 32px));`
   - `max-height: calc(100vh - 48px);` (trên `1024×768` tối đa `720px` cao; trên `1280×720` tối đa `672px` cao).
   - Header (`48px`) và Footer hành động (`56px`, chứa nút Cường Hóa / Chế Tạo / Lưu Cài Đặt) luôn **cố định (`flex-shrink: 0`)**; chỉ vùng nội dung giữa mới cuộn dọc (`overflow-y: auto`) bằng thanh cuộn gỗ pixel rộng `12px`.
2. **Bảng Reflow Cột & Lưới Theo Breakpoint**:

| Màn hình Modal | `>= 1280px` (`sm-hd`, `lg-fhd`) | `1024px – 1279px` (`xs-min`) |
| :--- | :--- | :--- |
| **`SCR-06 Inventory`** | 2 cột: Lưới `8 cột × 5 hàng` ô `48px` (trái) + Chi tiết `280px` (phải) | 2 cột gọn: Lưới `6 cột` ô `48px` cuộn dọc + Chi tiết `248px` |
| **`SCR-07 Equipment`** | Paperdoll 3 cột (4 ô giáp trái | Sprite giữa | 6 ô vũ khí/phụ kiện phải) | Thu hẹp khung Sprite giữa từ `240px → 188px`, giữ đủ 10 ô không cuộn |
| **`SCR-10 Collection`** | Lưới 3 cột thẻ anh hùng + Panel hồ sơ phải `320px` | Lưới 2 cột thẻ anh hùng + Panel hồ sơ phải `280px` |
| **`SCR-11 Gacha`** | Khung banner lớn tỷ lệ `16:7`, 2 nút Quay x1 & x10 nằm ngang song song | Thu chiều cao artwork banner `260px → 210px`, giữ 2 nút Quay song song rõ ràng |
| **`SCR-12/13 Blacksmith & Enhance`** | 2 cột: Danh sách vũ khí `300px` (trái) + Bệ rèn so sánh `+N → +N+1` (phải) | Cột trái thu `240px`; chỉ số trước/sau xếp gọn không mất thông tin Lò Rèn & tỷ lệ `100%` |
| **`SCR-19 Quest Journal`** | Sổ mở 2 trang giấy da (`340px` + `520px`) | Sổ mở 2 trang gọn (`280px` + `460px`), cuộn độc lập từng trang |
| **`SCR-21 Party`** | 4 thẻ thành viên xếp **1 hàng 4 cột** | 4 thẻ thành viên reflow thành **lưới 2×2** để giữ đủ tên, lớp nhân vật và trạng thái Sẵn sàng |

---

## 4. Ngân sách Giãn Nở Văn Bản Tiếng Việt (+25% Width Tolerance)

So với nhãn tiếng Anh ngắn gọn (vd: `"Craft"`, `"Enhance"`, `"Equipment"`, `"Skills"`), nhãn tiếng Việt tự nhiên thường dài hơn **15%–30%** (vd: `"Chế tạo"`, `"Cường hóa"`, `"Trang bị"`, `"Kỹ năng"`, `"Cài đặt hệ thống"`) và cao hơn do dấu phụ xếp chồng.

### 4.1 Năm Quy tắc Chống Tràn Chữ Tiếng Việt Bắt buộc
1. **Đệm Chiều rộng `+25%` (Width Expansion Budget)**: Mọi nút bấm, thẻ tab và cột nhãn chỉ số được thiết kế `min-width` rộng hơn ít nhất **25%** so với bản nhãn tiếng Anh tương ứng, sử dụng `width: fit-content; min-width: ...; padding-inline: 16px;` thay vì cố định `width: 96px` cứng.
2. **Bảo vệ Khi Phóng to Cỡ Chữ `115%` / `130%`**:
   - Khi người chơi bật `Cỡ chữ Giao diện = 130%` trong `SCR-23 Settings`, các nhóm nút ngang trong Footer Modal tự động áp dụng `flex-wrap: wrap; gap: 8px;` và thanh Tab cho phép cuộn ngang mềm với mũi tên pixel `< >` thay vì đè chữ lên nhau.
3. **Quy tắc Cấm Cắt Xén Thông tin Nhạy cảm (`No-Ellipsis Rule`)**:
   - **CẤM TUYỆT ĐỐI** dùng `text-overflow: ellipsis` (cắt `...`) trên: **Số lượng nguyên liệu (`5/4`)**, **Chi phí Gold / `STARLIGHT_SHARD`**, **Tỷ lệ xác suất Gacha (`0.8%`, `Pity 64/80`)**, **Cấp cường hóa (`+10`)**, **Tỷ lệ thành công (`100%`)** và **Thông báo lỗi server (`ERR_*`)**.
   - Chỉ được phép tối đa 2 dòng (`-webkit-line-clamp: 2`) trên tên vật phẩm rất dài trong ô thẻ bộ sưu tập, và **BẮT BUỘC** hiện tên đầy đủ 100% trong `PixelTooltip` khi hover/focus.
4. **Hàng rào Dấu Kép Tiếng Việt**: Mọi tiêu đề & nút bấm áp dụng `line-height >= 1.35` và `padding-block >= 6px` để dấu của chữ `Ắ, Ằ, Ẳ, Ẵ, Ặ, Ệ, Ử, Ữ` không bao giờ bị xén mất đầu hoặc dính viền khung 9-slice.
5. **Kiểm tra Tự động**: Toàn bộ 5 breakpoint × 2 mức cỡ chữ (`100%` & `130%`) được đưa vào bài kiểm thử phát hiện tràn ngang (`el.scrollWidth > el.clientWidth`) trong [`ui-testing-strategy.md`](./ui-testing-strategy.md).
