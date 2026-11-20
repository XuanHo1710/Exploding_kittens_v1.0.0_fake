# Pixel Fantasy UI Design System — Eldoria: Forgotten Wilds

**Trạng thái**: Design Baseline v1.0 (`DESIGN_AND_PLANNING_ONLY`)  
**Cập nhật lần cuối**: 2026-11-19  
**Tham chiếu gốc**: [Constitution Nguyên tắc I, IV, V & VIII](../../.specify/memory/constitution.md), [00-game-vision.md](../game-design/00-game-vision.md), [frontend-architecture.md](../architecture/frontend-architecture.md), [sources-and-licenses.md](../management/sources-and-licenses.md)

---

## 1. Triết lý Mỹ thuật Giao diện (Classic 16-Bit Pixel Fantasy RPG UI)

Giao diện người dùng (UI) của **Eldoria: Forgotten Wilds** là phần mở rộng tự nhiên của thế giới pixel art 16-bit ấm áp — mang cảm giác sổ ghi chép da thuộc, khung gỗ sồi chạm đồng và giấy da cổ điển của các RPG kinh điển, kết hợp độ sắc nét và tính phản hồi hiện đại của game hành động co-op.

### 1.1 Năm Nguyên tắc Bất biến của UI Eldoria
1. **Không bao giờ mang dáng dấp Corporate SaaS / Admin Dashboard**: Cấm sử dụng thẻ trắng phẳng bóng mờ mềm (`box-shadow: 0 10px 25px rgba(0,0,0,0.1)`), bo góc tròn lớn (`border-radius: 12px`), font sans-serif hiện đại mảnh mai hoặc bảng biểu quản trị khô khan. Mọi khung cửa sổ đều dùng viền **pixel 9-slice sắc cạnh** (bậc góc pixel 2px/4px), chất liệu gỗ tối (`Dark Oak`), đồng rèn (`Forged Bronze`), vàng cổ (`Ornate Gold`) và giấy da (`Warm Parchment`).
2. **Thứ bậc Thị giác Rõ ràng (Clear Visual Hierarchy)**:
   - **Tầng 0 (World Canvas — Phaser 3)**: Luôn là nhân vật chính. HUD chỉ chiếm biên màn hình để nhường tối thiểu `68%–75%` vùng trung tâm cho combat và Boss telegraph.
   - **Tầng 1 (Dark Wood / Obsidian Chrome)**: Khung HUD, thanh kỹ năng, túi đồ, lò rèn dùng nền gỗ tối (`#241B17`) và obsidian (`#161320`) giúp các màu hiếm (Rarity), nguyên tố (Element) và icon vật phẩm bật nổi tức thì.
   - **Tầng 2 (Warm Parchment Content)**: Sổ nhiệm vụ, lời thoại NPC, công thức nấu ăn/chế tạo dùng giấy da ấm (`#F3E6CC`) với mực nâu đậm (`#1E1410`) tạo cảm giác phiêu lưu nhập vai và dễ đọc văn bản tiếng Việt dài.
3. **Pixel-Perfect & Zero Anti-Aliasing Blur**: Mọi sprite icon, 9-slice panel và chân dung nhân vật đều render với `image-rendering: pixelated; image-rendering: crisp-edges;`, bước kích thước tuân theo lưới `4px / 8px`.
4. **100% Tài nguyên Cục bộ (Zero Third-Party Services)**: Toàn bộ font pixel (`.woff2` / `.ttf` giấy phép SIL OFL 1.1), 9-slice PNG atlas và UI icons được đóng gói trực tiếp trong `assets/fonts/` và `assets/ui/` phục vụ từ máy chủ tĩnh nội bộ. **TUYỆT ĐỐI KHÔNG** nhúng Google Fonts CDN, FontAwesome CDN hay dịch vụ bên thứ ba.
5. **Trung thực với Trạng thái Server**: Mọi giao dịch kinh tế (Cường hóa, Chế tạo, Gacha, Mua/Xây công trình) phải thể hiện rõ trạng thái chờ xác thực server (`loading` + khóa double-submit bằng `X-Idempotency-Key`) và phản hồi lỗi nguyên bản từ `api-contracts.md` / `websocket-contracts.md`.

---

## 2. Hệ thống Màu sắc & Tỷ lệ Tương phản WCAG 2.1 AA (Color Tokens)

Toàn bộ cặp màu chữ/nền dưới đây đã được tính toán xác minh bằng công thức độ chói tương đối WCAG 2.1 (yêu cầu `>= 4.5:1` cho văn bản thường, `>= 3.0:1` cho chữ lớn / thành phần UI đồ họa).

### 2.1 Bảng Màu Bề mặt & Khung Viền (Surface, Chrome & Text)

| Token CSS | Tên Tiếng Việt | Mã Hex | Vai trò Sử dụng | Tỷ lệ Tương phản Đã xác minh |
| :--- | :--- | :---: | :--- | :--- |
| `--color-bg-obsidian` | Đá Hắc Diện Tối | `#161320` | Nền rãnh thanh máu, khung tooltip, viền letterbox canvas | Nền gốc (tối nhất) |
| `--color-bg-wood-dark` | Gỗ Sồi Đêm | `#241B17` | Nền chính HUD, khung modal ngoài, nền banner gacha | Nền bề mặt cấp 1 |
| `--color-bg-wood-panel` | Gỗ Sồi Ấm | `#33251E` | Nền panel phụ, thanh tiêu đề modal, nền tab chưa chọn | Nền bề mặt cấp 2 |
| `--color-bg-slot` | Ô Chứa Khắc Chìm | `#1B1624` | Nền bên trong ô kho đồ, ô kỹ năng, nền pill Rarity/Element trên giấy da | Nền ô chứa chuẩn |
| `--color-bg-parchment` | Giấy Da Cổ | `#F3E6CC` | Nền đọc văn bản dài: Quest Journal, NPC Dialogue, Lore nhân vật | Nền sáng chính |
| `--color-bg-parchment-dim` | Giấy Da Sẫm | `#E4D1AC` | Nền khối trích dẫn/phần thưởng bên trong trang giấy da | Nền sáng phụ |
| `--color-border-bronze` | Đồng Rèn Cổ | `#B5894C` | Viền chính của panel 9-slice, đường phân tách nội dung | `5.79:1` trên `#161320` (Đạt AA UI) |
| `--color-border-bronze-dark` | Đồng Khắc Bóng | `#6B4C2A` | Cạnh bóng dưới (bevel shadow) tạo hiệu ứng nổi 16-bit | Tạo khối pixel |
| `--color-border-gold` | Vàng Hoàng Kim | `#FBBF24` | Viền panel đặc biệt (Boss, Gacha, Focus ring 2px) | `10.96:1` trên `#161320` (Đạt AAA) |
| `--color-text-cream` | Chữ Kem Sáng | `#F7EFE0` | Chữ chính trên nền gỗ tối / obsidian / tooltip | `16.01:1` trên `#161320`; `14.77:1` trên `#241B17` (AAA) |
| `--color-text-muted-warm` | Chữ Trầm Ấm | `#C9BBA6` | Chữ mô tả phụ, timestamp, shortcut hint trên nền tối | `9.70:1` trên `#161320`; `7.82:1` trên `#33251E` (AAA) |
| `--color-text-ink` | Mực Nâu Đậm | `#1E1410` | Chữ chính trên giấy da (`parchment`) và nút Vàng chính | `14.62:1` trên `#F3E6CC`; `12.05:1` trên `#E4D1AC` (AAA) |
| `--color-text-ink-muted` | Mực Nâu Nhạt | `#4D392C` | Chú thích phụ, tên khu vực, lore phụ trên giấy da | `8.78:1` trên `#F3E6CC`; `7.23:1` trên `#E4D1AC` (AAA) |
| `--color-text-gold-parch` | Vàng Mực Nâu | `#7C4D00` | Nhấn mạnh số Gold/tiêu đề phụ trên nền giấy da sáng | `5.83:1` trên `#F3E6CC`; `4.80:1` trên `#E4D1AC` (AA) |

### 2.2 Thang Màu Độ Hiếm (Rarity Color Ladder — Bắt buộc Khớp Canonical Enum)

> **Quy tắc Tương phản Quan trọng**: Các màu Rarity sáng dưới đây đạt tương phản từ `5.48:1` đến `10.96:1` trên nền tối (`#161320`, `#1B1624`, `#241B17`, `#33251E`). Khi hiển thị trên nền giấy da sáng (`#F3E6CC`), badge Rarity **BẮT BUỘC** bọc trong pill nền tối `#1B1624` viền 2px đồng để bảo toàn tỷ lệ tương phản `>= 6.57:1` và giúp người mù màu nhận diện đồng nhất qua biểu tượng + số sao + chữ cái.

| Enum `Rarity` | Token CSS | Mã Hex | Tương phản trên `#1B1624` (Slot/Pill) | Tương phản trên `#241B17` (Wood) | Biểu tượng Phụ (Colorblind-Safe) | Mã Chữ & Số Sao |
| :--- | :--- | :---: | :---: | :---: | :--- | :---: |
| `COMMON` | `--color-rarity-common` | `#B8C0CC` | `9.65:1` (AAA) | `9.20:1` (AAA) | Góc vát đơn 1px trơn | `C` • `★` |
| `UNCOMMON` | `--color-rarity-uncommon` | `#4ADE80` | `10.15:1` (AAA) | `9.69:1` (AAA) | 2 chấm đinh tán góc trên | `U` • `★★` |
| `RARE` | `--color-rarity-rare` | `#38BDF8` | `8.26:1` (AAA) | `7.88:1` (AAA) | Đá góc hình thoi (Diamond) | `R` • `★★★` |
| `EPIC` | `--color-rarity-epic` | `#C084FC` | `6.70:1` (AA+) | `6.39:1` (AA+) | Góc chữ L khắc cánh dơi | `E` • `★★★★` |
| `LEGENDARY` | `--color-rarity-legendary` | `#FBBF24` | `10.60:1` (AAA) | `10.11:1` (AAA) | Vương miện nhỏ góc trên + ánh lấp lánh chậm (<= 1 Hz) | `L` • `★★★★★` |
| `MYTHIC` | `--color-rarity-mythic` | `#FB7185` | `6.57:1` (AA+) | `6.27:1` (AA+) | Viền đôi hoa văn cổ ngữ + tinh thể 8 cánh | `M` • `★★★★★★` |

### 2.3 Bảng 9 Huy hiệu Nguyên tố (Element Badges — Canonical `Element` Enum)

Mỗi huy hiệu nguyên tố kích thước chuẩn `16×16 px` (inline/tooltip) hoặc `24×24 px` (Character Card/Boss Bar), luôn hiển thị trên nền khiên tối `#1B1624` để giữ tương phản `>= 6.70:1` và có hình khối silhouette riêng biệt hoàn toàn:

| Enum `Element` | Tên Tiếng Việt | Token CSS | Mã Hex | Tương phản trên `#1B1624` | Hình khối Silhouette (`16×16 px`) | Icon Asset Key |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| `FIRE` | Hỏa | `--color-elem-fire` | `#FB923C` | `7.82:1` | Ngọn lửa 3 lưỡi hướng lên | `ico_elem_fire` |
| `WATER` | Thủy | `--color-elem-water` | `#38BDF8` | `8.26:1` | Giọt nước nhọn có sóng nhỏ bên trong | `ico_elem_water` |
| `EARTH` | Thổ | `--color-elem-earth` | `#A3C46C` | `8.99:1` | Khối đá lục giác chồng đỉnh núi | `ico_elem_earth` |
| `WIND` | Phong | `--color-elem-wind` | `#34D399` | `9.20:1` | 2 dải xoáy gió song song uốn cong | `ico_elem_wind` |
| `LIGHTNING` | Lôi | `--color-elem-lightning` | `#FACC15` | `11.55:1` | Tia sét zích-zắc sắc góc 3 đoạn | `ico_elem_lightning` |
| `FROST` | Băng | `--color-elem-frost` | `#67E8F9` | `12.21:1` | Tinh thể tuyết 6 cánh đối xứng | `ico_elem_frost` |
| `LIGHT` | Quang | `--color-elem-light` | `#FDE68A` | `14.21:1` | Mặt trời 4 tia chính + 4 tia phụ | `ico_elem_light` |
| `SHADOW` | Ám | `--color-elem-shadow` | `#C084FC` | `6.70:1` | Trăng lưỡi liềm ôm chấm tinh vân | `ico_elem_shadow` |
| `NEUTRAL` | Vô Hệ | `--color-elem-neutral` | `#CBD5E1` | `11.92:1` | Hình thoi kim loại rỗng tâm | `ico_elem_neutral` |

### 2.4 Bảng Màu Ngữ nghĩa Chiến đấu, Tài nguyên & Hành động (Semantic Tokens)

| Nhóm | Token CSS | Mã Hex | Chữ đi kèm / Nền | Tương phản Đã xác minh | Mục đích |
| :--- | :--- | :---: | :--- | :---: | :--- |
| **HP Bar** | `--color-stat-hp` | `#D93838` | Chữ `#F7EFE0` trên nền thanh đậm `#A82424` | `6.25:1` (Fill vs rãnh: `3.98:1`) | Thanh Sinh Lực nhân vật, quái vật, Boss |
| **MP Bar** | `--color-stat-mp` | `#2563EB` | Chữ `#F7EFE0` trên `#1D56A8` | `6.23:1` | Thanh Năng Lượng / Mana dùng kỹ năng |
| **Stamina Bar** | `--color-stat-stamina` | `#EAB308` | Chữ `#1E1410` trên `#D99B07` | `7.43:1` | Thể lực Sprint, Dodge, Chặt gỗ, Đào quặng, Nông trại |
| **Hunger Bar** | `--color-stat-hunger` | `#D97706` | Icon đùi thịt + chữ `#F7EFE0` trên `#161320` | `5.92:1` | Độ no sinh tồn & trạng thái Food Buff |
| **EXP Bar** | `--color-stat-exp` | `#22C55E` | Chữ `#F7EFE0` trên rãnh `#161320` | `8.03:1` (Fill vs rãnh) | Thanh kinh nghiệm cấp 1–100 (MVP 1–30) |
| **Boss Poise** | `--color-stat-poise` | `#F59E0B` | Nền rãnh `#161320` + viền đốt nứt | `8.52:1` | Thanh cân bằng / phá giáp (Stagger) của Boss |
| **Success (Dark)** | `--color-semantic-success` | `#4ADE80` | Trên `#161320` / `#241B17` | `10.50:1` / `9.69:1` | Chỉ số tăng (+ATK), đủ nguyên liệu, đặt nhà hợp lệ |
| **Success (Parch)** | `--color-semantic-success-parch` | `#166534` | Trên `#F3E6CC` | `5.77:1` | Nhiệm vụ hoàn thành trên sổ giấy da |
| **Danger (Dark)** | `--color-semantic-danger` | `#F87171` | Trên `#161320` / `#241B17` | `6.61:1` / `6.10:1` | Thiếu nguyên liệu, lỗi mạng, sát thương nhận vào |
| **Danger (Parch)** | `--color-semantic-danger-parch` | `#991B1B` | Trên `#F3E6CC` | `6.73:1` | Cảnh báo hết mùa vụ, lỗi form trên nền sáng |
| **Info (Parch)** | `--color-semantic-info-parch` | `#1E40AF` | Trên `#F3E6CC` | `7.06:1` | Ghi chú cơ chế, mẹo hướng dẫn |
| **Action Gold** | `--color-btn-primary` | `#E5A91A` | Chữ `#1E1410` (Hover `#FBBF24`) | `8.62:1` (Hover `10.82:1`) | Nút hành động chính (Cường hóa, Xác nhận, Vào Game) |
| **Action Wood** | `--color-btn-secondary` | `#4A3528` | Chữ `#F7EFE0` | `10.04:1` | Nút phụ (Đóng, Quay lại, Xem chi tiết) |
| **Action Emerald** | `--color-btn-confirm` | `#1E6B43` | Chữ `#F7EFE0` | `5.67:1` | Nút Chế tạo, Trồng cây, Chấp nhận lời mời Party |
| **Action Crimson** | `--color-btn-danger` | `#9E2626` | Chữ `#F7EFE0` | `6.66:1` | Nút Xóa nhân vật, Rời tổ đội, Hủy xây dựng |
| **Action Arcane** | `--color-btn-gacha` | `#5B2B82` | Chữ `#F7EFE0` | `8.70:1` | Nút Quay Gacha x1 / x10 (`STARLIGHT_SHARD`) |

---

## 3. Hệ thống Kiểu chữ Hỗ trợ Đầy đủ Tiếng Việt (Local Typography System)

### 3.1 Đóng gói Font Cục bộ (Zero External CDN — SIL OFL 1.1)
Mọi tệp font đều lưu trực tiếp tại `assets/fonts/` và nạp qua `@font-face` nội bộ trong `apps/client/src/styles/fonts.css`. Không bao giờ dùng `https://fonts.googleapis.com`.

| Vai trò Font | Tên Font & File Cục bộ (`assets/fonts/`) | Giấy phép | Phạm vi Ký tự & Lý do Chọn |
| :--- | :--- | :---: | :--- |
| **`--font-pixel-display`** | `Press Start 2P` (`press-start-2p-latin.woff2`) + fallback liền mạch `Pixelify Sans Bold` (`pixelify-sans-vi-bold.woff2`) | SIL OFL 1.1 | Tiêu đề lớn tiếng Anh, logo game, chữ số LV, damage number, `+10` enhancement; tự động rơi sang `Pixelify Sans Bold` khi gặp ký tự tiếng Việt có dấu (`Ă, Â, Đ, Ê, Ô, Ơ, Ư`). |
| **`--font-pixel-ui`** | `Silkscreen` (`silkscreen-latin.woff2`) + `Pixelify Sans Medium` (`pixelify-sans-vi-medium.woff2`) | SIL OFL 1.1 | Nhãn nút bấm, tên tab, phím tắt (`[F]`, `[ESC]`), tên chỉ số (`ATK`, `DEF`, `CRIT`). |
| **`--font-pixel-body`** | `Fusion Pixel 12px Proportional` (`fusion-pixel-12px-vi.woff2`) + `Pixelify Sans Regular` (`pixelify-sans-vi-regular.woff2`) + `monospace` | SIL OFL 1.1 | Toàn bộ văn bản tiếng Việt: mô tả kỹ năng, lore nhân vật, lời thoại NPC, nhiệm vụ, khung chat, bảng lỗi. Hiển thị rõ nét đầy đủ dấu kép tiếng Việt (`Ắ, Ằ, Ẳ, Ẵ, Ặ, Ế, Ệ, Ổ, Ộ, Ử, Ữ`) ở cỡ 12px–18px mà không dính nét hay mất dấu. |

### 3.2 Quy tắc Bảo vệ Dấu Tiếng Việt (Vietnamese Diacritic Protection Rules)
1. **Chiều cao dòng (`line-height`) bắt buộc `>= 1.45`** cho thân bài tiếng Việt và `>= 1.35` cho tiêu đề in hoa có dấu (vì dấu phụ tiếng Việt xếp chồng phía trên `Â + ´ = Ấ` tăng chiều cao glyph ~22% so với Latin không dấu).
2. **Padding dọc tối thiểu cho nút & badge**: Tối thiểu `6px` trên/dưới (`padding-block: 6px`) và **CẤM** đặt `height` cứng quá khít kèm `overflow: hidden` trên thẻ chứa chữ có dấu.
3. **Ngăn chữ số nhảy giật (Tabular Numerals)**: Mọi bộ đếm HP, MP, Cooldown, Gold, `STARLIGHT_SHARD`, đồng hồ ngày/đêm và Pity Counter bắt buộc áp dụng `font-variant-numeric: tabular-nums;`.

### 3.3 Thang Cỡ chữ Chuẩn (Typography Scale — Hỗ trợ Phóng to `100% / 115% / 130%`)

Toàn bộ cỡ chữ nhân với biến gốc `--ui-text-scale` (mặc định `1.0`, có thể chỉnh trong `SCR-23 Settings` thành `1.15` hoặc `1.30`):

| Token | Cỡ gốc (`100%`) | Cỡ `130%` | Line-Height | Font Family | Nơi áp dụng |
| :--- | :---: | :---: | :---: | :--- | :--- |
| `--text-hero` | `28px` | `36px` | `1.30` | `--font-pixel-display` | Tiêu đề màn hình Login, thông báo VICTORY / PHASE TRANSITION |
| `--text-h1` | `20px` | `26px` | `1.35` | `--font-pixel-display` | Tiêu đề Modal (Lò Rèn, Kho Đồ, Nhật Ký Nhiệm Vụ), Tên Boss |
| `--text-h2` | `16px` | `21px` | `1.40` | `--font-pixel-ui` | Tên mục con, tên nhân vật, tên vũ khí đang cường hóa |
| `--text-body` | `14px` | `18px` | `1.50` | `--font-pixel-body` | Mô tả kỹ năng, lời thoại NPC, danh sách nguyên liệu, nội dung Chat |
| `--text-small` | `12px` | `16px` | `1.45` | `--font-pixel-body` | Nhãn chỉ số phụ, trạng thái buff, chú thích tooltip, lịch sử Gacha |
| `--text-micro` | `11px` | `14px` | `1.30` | `--font-pixel-ui` | Số lượng stack trong ô (`x99`), nhãn phím tắt (`[1]`, `[Q]`), cấp `+10` *(KHÔNG dùng cho văn bản mô tả dài!)* |

---

## 4. Lưới Khoảng cách Pixel, Viền & Thứ tự Z-Index (Spacing & Layout Tokens)

### 4.1 Thang Khoảng cách Bội số `4px / 8px`
Mọi padding, margin, gap và kích thước ô slot bắt buộc là bội số của `4px` (ưu tiên `8px`) để khớp hoàn hảo lưới pixel trên cả độ phân giải `1x`, `2x` và `3x`:

| Token | Giá trị | Công dụng chuẩn |
| :--- | :---: | :--- |
| `--space-1` | `4px` | Khoảng cách siêu nhỏ giữa icon nguyên tố và tên, viền trong slot |
| `--space-2` | `8px` | Khoảng cách giữa các ô Inventory (`ItemSlot`), khoảng cách nút liền kề |
| `--space-3` | `12px` | Padding trong Tooltip, khoảng cách giữa thanh HP/MP/Stamina |
| `--space-4` | `16px` | Padding chuẩn bên trong Panel 9-slice, khoảng cách giữa các khối thông tin |
| `--space-6` | `24px` | Khoảng cách giữa cột trái/phải của Modal 2 cột (Equipment, Blacksmith) |
| `--space-8` | `32px` | Khoảng trống rìa an toàn (Safe margin) màn hình lớn `1920x1080` |
| `--border-pixel` | `2px` | Đường viền sắc cạnh 1 đơn vị pixel UI (tương đương 1px @ 2x) |
| `--border-frame` | `4px` | Viền khung kép gỗ/đồng của modal và nút chính |

### 4.2 Hệ thống Lớp Chiều sâu Z-Index (UI Overlay Stacking)
Đảm bảo không xảy ra xung đột che khuất giữa thế giới Phaser, HUD và Modal:

| Token | Z-Index | Thành phần | Ghi chú tương tác |
| :--- | :---: | :--- | :--- |
| `--z-canvas` | `0` | Phaser 3 Game Canvas (`640×360` scaled) | Nhận input chuột/phím khi `InputFocusManager` ở `WORLD_GAMEPLAY` |
| `--z-hud` | `100` | Main Game HUD (Unit Frame, Hotbar, Minimap, Quest Tracker, Boss Bar) | `pointer-events: none` trên container bọc ngoài; chỉ `pointer-events: auto` trên nút/ô tương tác |
| `--z-context-hint` | `150` | Nhắc tương tác nổi `[F] Chặt gỗ`, nhãn hướng đi, phụ đề cảnh báo Boss | Không chặn click chiến đấu |
| `--z-modal-backdrop` | `300` | Màn che mờ gỗ tối `rgba(14, 10, 18, 0.72)` | Chặn click xuống world canvas; click nền đóng modal (trừ màn Death/Confirm) |
| `--z-modal` | `350` | Toàn bộ cửa sổ Modal RPG (Inventory, Blacksmith, Gacha, Map, Settings...) | Tập trung focus trap bàn phím |
| `--z-drag-ghost` | `450` | Hình ảnh vật phẩm đang kéo thả theo con trỏ chuột | `pointer-events: none` |
| `--z-tooltip` | `500` | Tooltip so sánh vật phẩm, mô tả kỹ năng, ghi chú chỉ số | Tự đảo chiều nếu chạm mép viewport |
| `--z-toast` | `600` | Thông báo Loot, Nâng cấp thành công, Lỗi API (`ACTION_ERROR`), Lời mời Party | Tối đa 3 toast xếp chồng góc trên-phải |
| `--z-disconnect` | `900` | Banner Reconnect / Mất kết nối khẩn cấp / Fatal Error Overlay | Luôn hiển thị trên mọi lớp khác |

---

## 5. Đặc tả Khung Pixel 9-Slice (9-Slice Pixel Panel Specifications)

Thay vì vẽ CSS phẳng, mọi cửa sổ RPG dùng kỹ thuật **CSS `border-image` 9-slice** từ texture sprite pixel vẽ tay trong `assets/ui/frames/` với `border-image-repeat: stretch` hoặc `repeat` theo đúng nhịp pixel, tắt làm mờ bằng `image-rendering: pixelated`.

```text
+--------+--------------------+--------+
| Top-L  |     Top Edge       | Top-R  |  <- Corner (12px x 12px) không bị kéo dãn
+--------+--------------------+--------+
|        |                    |        |
| Left   |   Center Fill      | Right  |  <- Center lát gỗ/giấy da kéo dãn hoặc lặp
| Edge   |   (Tile/Stretch)   | Edge   |
|        |                    |        |
+--------+--------------------+--------+
| Bot-L  |    Bottom Edge     | Bot-R  |  <- Góc đồng / đinh tán giữ nguyên tỷ lệ 1:1
+--------+--------------------+--------+
```

| Asset Key (`assets/ui/frames/`) | Kích thước Nguồn | Slice Inset (`top right bottom left`) | Border Width Hiển thị | Màu Nền Giữa | Nơi áp dụng |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `ui_frame_wood_9s.png` | `48×48 px` | `12px 12px 12px 12px` | `12px` | `#241B17` | Modal chính (Inventory, Blacksmith, Building, Party, Settings) |
| `ui_frame_parchment_9s.png` | `48×48 px` | `12px 12px 12px 12px` | `12px` | `#F3E6CC` | Sổ nhiệm vụ (`SCR-19`), Hộp thoại NPC (`SCR-20`), Hồ sơ Lore (`SCR-10`) |
| `ui_frame_gold_ornate_9s.png` | `64×64 px` | `16px 16px 16px 16px` | `16px` | `#161320` | Gacha Banner (`SCR-11`), Boss Reward (`SCR-22`), Mốc Cường hóa `+10` |
| `ui_frame_stone_dark_9s.png` | `32×32 px` | `8px 8px 8px 8px` | `8px` | `#1B1624` | Khung HUD gọn nhẹ (Unit Frame, Minimap, Hotbar dock, Tooltip) |
| `ui_frame_boss_bar_9s.png` | `64×32 px` | `10px 20px 10px 20px` | `10px 20px` | `#161320` | Thanh máu & Poise Boss (`boss_thornback_elder` và các Boss M2–M5) |

---

## 6. Danh mục Thành phần & Ma trận Đầy đủ 8 Trạng thái (Component Catalog)

Mọi thành phần cốt lõi trong `apps/client/src/ui/primitives/` BẮT BUỘC cài đặt tường minh cả **8 trạng thái**: `default`, `hover`, `active`, `focus`, `disabled`, `loading`, `empty`, `error`.

### 6.1 `PixelButton` (Nút Bấm 16-Bit Bevel)
- **Biến thể (Variants)**: `primary` (Vàng `#E5A91A`), `secondary` (Gỗ `#4A3528`), `confirm` (Ngọc lục bảo `#1E6B43`), `danger` (Đỏ sẫm `#9E2626`), `gacha` (Tím cổ ngữ `#5B2B82`), `icon` (`36×36 px` / `44×44 px` vuông).
- **Kích thước**: `sm` (cao tối thiểu `32px`), `md` (cao tối thiểu `40px` — mặc định), `lg` (cao tối thiểu `48px` — nút Vào Game, Cường Hóa, Quay x10).

| Trạng thái | Đặc tả Thị giác & Tương tác |
| :--- | :--- |
| **`default`** | Nền màu biến thể, viền trên sáng 2px (highlight), viền dưới tối 4px (bevel), chữ sắc nét tương phản `>= 5.67:1`. |
| **`hover`** | Sáng nền thêm 1 bậc pixel (ví dụ `#E5A91A → #FBBF24`), viền ngoài ánh vàng nhạt, con trỏ đổi thành găng tay pixel (`cursor_hand`), phát SFX nhẹ `sfx_ui_hover`. |
| **`active`** | Dịch chuyển xuống `2px` (`transform: translateY(2px)`), rút viền đáy từ `4px → 2px` tạo cảm giác nhấn nút cơ học chắc tay, phát `sfx_ui_click`. |
| **`focus`** | Vòng focus kép sắc cạnh: `2px solid #FBBF24` + khoảng đệm `2px` đen `#140F1C` (không dùng outline mờ mặc định trình duyệt). |
| **`disabled`** | Nền xám gỗ `#2D2622`, chữ `#9B8F82` (`4.71:1` vẫn đọc được lý do!), loại bỏ highlight, `cursor: not-allowed`, kèm tooltip giải thích lý do khóa (vd: *"Cần Lò Rèn cấp 2"*). |
| **`loading`** | Khóa click (tránh gửi lặp request), thay icon bên trái bằng đồng hồ cát pixel 4-frame xoay (4 FPS), nhãn giữ ổn định độ rộng (`"Đang xử lý..."`), gắn `aria-busy="true"`. |
| **`empty`** | Áp dụng cho nút liên kết tài nguyên/slot chưa chọn mục tiêu: hiển thị đường viền nét đứt đồng `#6B4C2A`, nhãn mờ hướng dẫn (`"Chọn vũ khí để rèn"`). |
| **`error`** | Nhấp nháy viền đỏ `#F87171` 2 nhịp ngắn (`<= 2 Hz`, tắt khi bật Reduced Motion), lắc ngang nhẹ `±3px` trong `180ms`, kèm icon `!` đỏ và toast lỗi server. |

### 6.2 `ItemSlot` (Ô Vật phẩm / Trang bị / Kỹ năng)
- **Kích thước chuẩn**: `48×48 px` (Inventory / Crafting grid), `56×56 px` (Equipment paperdoll / Hotbar skill), `64×64 px` (Blacksmith target / Boss Reward showcase).
- **Cấu trúc phân lớp bên trong ô**:
  - Nền lõm `#1B1624` + họa tiết bóng chìm tùy loại slot (vd: hình bóng chiếc mũ khi ô `HELMET` trống).
  - Sprite icon vật phẩm `32×32 px` căn giữa (`image-rendering: pixelated`).
  - Góc trên-trái: Biểu tượng nguyên tố `12×12 px` (nếu có) hoặc nhãn chữ Rarity (`R`, `E`, `L`, `M`).
  - Góc trên-phải: Mức cường hóa (`+1`..`+10`) màu `#FBBF24` trên nền tối `#161320`.
  - Góc dưới-phải: Số lượng stack (`x99`) dùng `--text-micro` `tabular-nums`.
  - Cạnh đáy (cao `3px`): Thanh độ bền (`durabilityPct`) chỉ hiện khi `< 100%` (xanh `> 50%`, vàng `20%–50%`, đỏ `< 20%`).

| Trạng thái | Đặc tả Thị giác & Tương tác |
| :--- | :--- |
| **`default`** | Viền 2px theo màu Rarity + họa tiết góc đặc trưng độ hiếm (xem Mục 2.2). |
| **`hover`** | Nổi viền trắng-vàng `#F7EFE0` phía trong 2px, mở `PixelTooltip` sau `120ms` (không trễ gây khó chịu). |
| **`active`** | Thu nhẹ icon `95%` (pixel-snap) hoặc chuyển sang chế độ kéo thả (`--z-drag-ghost`), ô gốc giảm độ mờ `0.45`. |
| **`focus`** | Viền ngoài 2px `#FBBF24` + 2px `#140F1C`, tự động hiện tooltip ở cạnh không che khuất ô khi di chuyển bằng phím mũi tên. |
| **`disabled`** | Phủ lớp tối chéo 45° (hatch) `rgba(22,19,32,0.68)` + icon khóa/cấm (vd: chưa đủ cấp `levelReq`, sai `WeaponType` của nhân vật, hoặc đang cooldown trên Hotbar kèm đồng hồ đếm ngược giây). |
| **`loading`** | Khung nhấp nháy nhẹ kiểu shimmer pixel 2 bậc màu gỗ (không chớp sáng) khi đang chờ `INVENTORY_PATCH` từ server sau giao dịch. |
| **`empty`** | Hiển thị viền đồng tối `#4A3528`, biểu tượng silhouette mờ (`opacity: 0.35`) của loại ô (kiếm/giáp/nhẫn/túi) hoặc ô lưới trống chuẩn. |
| **`error`** | Viền đỏ `#F87171` kèm dấu `✕` đỏ (vd: kéo vũ khí `STAFF` vào ô của `chr_kael_vanguard` không thành thạo, hoặc nguyên liệu thiếu `3/5` hiển thị chữ đỏ `#F87171`). |

### 6.3 `StatBar` (Thanh Tài nguyên HP / MP / Stamina / Hunger / EXP / Boss Poise)
- **Cấu trúc**: Rãnh đen `#161320`, viền đồng 2px, lõi màu chính có vạch sáng pixel 2px ở cạnh trên, lớp **delayed damage trail** màu trắng-vàng mờ trượt lùi trong `350ms` khi mất máu (giúp đọc sát thương tức thì), lớp text số chính xác căn giữa (`220 / 220`).

| Trạng thái | Đặc tả Thị giác & Tương tác |
| :--- | :--- |
| **`default`** | Hiển thị tỷ lệ đầy chính xác theo `useHudStore`, số rõ ràng có `text-shadow: 1px 1px 0 #161320`. |
| **`hover`** | Hiện tooltip chi tiết tốc độ hồi phục (vd: *"HP: 195/220 • Hồi +3/giây • Buff Mũ Mossroot"*). |
| **`active`** | Hiệu ứng sóng sáng ngang chậm khi nhận hồi máu (HP/MP) hoặc vừa ăn món ăn hồi Stamina/Hunger. |
| **`focus`** | Khung vàng 2px bao quanh thanh (áp dụng khi duyệt thanh chỉ số trong `SCR-08 Character Stats`). |
| **`disabled`** | Nền xám chì khi nhân vật gục ngã (`HP = 0`) hoặc Stamina bị khóa tạm lúc bị Stun. |
| **`loading`** | Thanh nền sọc chéo chạy ngang chậm khi chờ `WS_WELCOME` lần đầu nạp nhân vật. |
| **`empty`** | Thanh cạn `0 / Max`, chữ số đổi sang đỏ `#F87171`, viền chuyển sang cảnh báo rõ (HP <= 25% nhịp tim đỏ nhẹ ở viền khung, tuyệt đối `<= 1.5 Hz`). |
| **`error`** | Nháy viền đỏ + rung nhẹ `±2px` khi người chơi bấm kỹ năng nhưng không đủ MP/Stamina (kèm SFX `sfx_ui_deny`). |

### 6.4 `PixelTooltip` (Khung Chi tiết & So sánh Trang bị)
- **Chiều rộng**: `min-width: 240px`, `max-width: 340px` (tính sẵn +25% chiều rộng tiếng Việt).
- **Cấu trúc**: Tiêu đề màu Rarity + Badge chữ/sao + Mức `+N` → Loại vật phẩm & Yêu cầu cấp → Chỉ số chính & phụ → **So sánh tự động** với món đang mặc (chữ `#4ADE80` kèm mũi tên `▲ +14 ATK`, chữ `#F87171` kèm `▼ -3 DEF`) → Hiệu ứng bộ (Set Bonus `2/4`, `4/4`) → Nguồn thu thập & Giá bán Gold → Dòng nhắc thao tác đáy (`[Click phải] Trang bị • [Shift+Click] Tách`).
- **8 Trạng thái**: `default` (hiển thị ổn định), `hover` (chốt vị trí khi nhấn giữ `Alt` để cuộn tooltip dài), `active` (chuyển sang chế độ so sánh 2 cột song song), `focus` (hiển thị khi ô được focus bàn phím), `disabled` (ẩn khi đang kéo vật phẩm hoặc đang combat tốc độ cao trong tùy chọn *Tắt Tooltip khi Combat*), `loading` (skeleton 3 dòng khi tải chi tiết item instance hiếm), `empty` (không render DOM khi ô trống không có chú thích), `error` (hiện thông báo *"Không tìm thấy định nghĩa vật phẩm trong catalog"* + mã `itemId` để QA báo lỗi).

### 6.5 `PixelModal` (Cửa sổ RPG 9-Slice)
- **Cấu trúc**: Thanh tiêu đề gỗ chạm đồng (`48px` cao) gồm Icon chức năng `24×24`, Tiêu đề `--text-h1`, Phím tắt gợi ý (`[I]`) và nút đóng `[X]` (`36×36 px`, shortcut `ESC`) → Thanh Tab ngang (nếu có) → Vùng nội dung cuộn dọc bằng thanh cuộn pixel gỗ → Thanh Footer hành động cố định.
- **8 Trạng thái**: `default` (mở mượt trong `120ms`, không phóng to mờ pixel), `hover` (các nút tiêu đề/tab phản hồi), `active` (cửa sổ đang giữ focus hàng đầu trong stack `useUiModalStore`), `focus` (focus trap khép kín trong modal), `disabled` (khóa toàn bộ nút hành động khi mất kết nối mạng nhưng vẫn cho đọc thông tin & đóng bằng `ESC`), `loading` (khung nội dung hiển thị đồng hồ cát pixel + *"Đang đồng bộ từ máy chủ..."*), `empty` (minh họa pixel icon trống + lời gọi hành động tiếng Việt hữu ích, vd: *"Túi đồ chưa có vũ khí — Hãy ghé Lò Rèn hoặc săn quái tại Whispering Forest"*), `error` (banner đỏ sẫm đầu modal hiển thị mã lỗi chuẩn như `ERR_INSUFFICIENT_MATERIALS` + nút *"Thử lại"*).

### 6.6 `PixelToast` & `ReconnectBanner` (Thông báo & Thanh Trạng thái Mạng)
- **Loại Toast**: `info` (viền xanh dương `#38BDF8`), `success` (viền xanh lá `#4ADE80`), `warning` (viền vàng `#FBBF24`), `error` (viền đỏ `#F87171`), `loot` (hiện icon vật phẩm `24×24` + màu Rarity + `+x3`).
- **8 Trạng thái**: `default` (hiển thị `3.5s` cho info/loot, `5s` cho error), `hover` (tạm dừng bộ đếm tự ẩn để người chơi đọc kịp), `active` (click vào toast nhiệm vụ/loot để nhảy tới tab liên quan nếu ngoài combat), `focus` (nút đóng `[X]` có thể focus bằng bàn phím), `disabled` (xếp hàng đợi nếu đang có 3 toast hiển thị), `loading` (toast tiến trình dài như *"Đang sao lưu phiên..."* hoặc Banner *"Đang kết nối lại (Lần 2/5)..."*), `empty` (không chiếm vùng DOM hoặc chiều cao khi hàng đợi rỗng), `error` (Banner đỏ cố định khi hết 5 lần tự kết nối lại, hiện nút *"Thử kết nối lại ngay"* và *"Về màn hình Đăng nhập"*).

### 6.7 `PixelInput`, `PixelSelect` & `PixelToggle` (Điều khiển Form & Cài đặt — An toàn IME Tiếng Việt)
- Mọi ô nhập văn bản (Đăng nhập, Đặt tên nhân vật, Chat, Tìm kiếm kho đồ) dùng nền tối `#161320`, viền đồng 2px, chữ `--color-text-cream` (`16.01:1`), chiều cao tối thiểu `40px`, hỗ trợ hoàn toàn bộ gõ tiếng Việt (`compositionstart` / `compositionend`).
- **8 Trạng thái**: `default` (viền đồng `#B5894C`), `hover` (viền sáng `#E4D1AC`), `active` (con trỏ nháy màu vàng `#FBBF24`), `focus` (viền vàng `#FBBF24` + khóa phím Phaser qua `InputFocusManager`), `disabled` (nền `#2D2622`, không nhận gõ), `loading` (icon kiểm tra tên nhân vật khả dụng đang xoay ở góc phải), `empty` (placeholder màu `#C9BBA6` đạt `9.70:1`, vd: *"Nhập tên hiệp sĩ (3–16 ký tự)..."*), `error` (viền đỏ `#F87171` + dòng báo lỗi ngay bên dưới kèm icon `!` và `aria-invalid="true"`).

---

## 7. Bộ Token Xuất Chuẩn (CSS Custom Properties Reference)

```css
:root {
  /* Fonts (100% Local Bundled in assets/fonts/ — SIL OFL 1.1) */
  --font-pixel-display: "Press Start 2P", "Pixelify Sans", monospace;
  --font-pixel-ui: "Silkscreen", "Pixelify Sans", monospace;
  --font-pixel-body: "Fusion Pixel 12px", "Pixelify Sans", monospace;
  --ui-text-scale: 1;

  /* Surfaces & Chrome */
  --color-bg-obsidian: #161320;
  --color-bg-wood-dark: #241B17;
  --color-bg-wood-panel: #33251E;
  --color-bg-slot: #1B1624;
  --color-bg-parchment: #F3E6CC;
  --color-bg-parchment-dim: #E4D1AC;
  --color-border-bronze: #B5894C;
  --color-border-bronze-dark: #6B4C2A;
  --color-border-gold: #FBBF24;

  /* Text */
  --color-text-cream: #F7EFE0;
  --color-text-muted-warm: #C9BBA6;
  --color-text-ink: #1E1410;
  --color-text-ink-muted: #4D392C;
  --color-text-gold-parch: #7C4D00;

  /* Rarity Ladder (Canonical) */
  --color-rarity-common: #B8C0CC;
  --color-rarity-uncommon: #4ADE80;
  --color-rarity-rare: #38BDF8;
  --color-rarity-epic: #C084FC;
  --color-rarity-legendary: #FBBF24;
  --color-rarity-mythic: #FB7185;

  /* Elements (Canonical 9) */
  --color-elem-fire: #FB923C;
  --color-elem-water: #38BDF8;
  --color-elem-earth: #A3C46C;
  --color-elem-wind: #34D399;
  --color-elem-lightning: #FACC15;
  --color-elem-frost: #67E8F9;
  --color-elem-light: #FDE68A;
  --color-elem-shadow: #C084FC;
  --color-elem-neutral: #CBD5E1;

  /* Spacing & Z-Index */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --z-canvas: 0;
  --z-hud: 100;
  --z-context-hint: 150;
  --z-modal-backdrop: 300;
  --z-modal: 350;
  --z-drag-ghost: 450;
  --z-tooltip: 500;
  --z-toast: 600;
  --z-disconnect: 900;
}
```

---

## 8. Ma trận Kiểm soát 14 Tiêu chí Quality Gate cho Hệ thống UI

| # | Tiêu chí Quality Gate | Đáp ứng trong Bộ Đặc tả UI/UX Eldoria |
| :---: | :--- | :--- |
| 1 | **Mục tiêu gameplay** | Giữ bầu không khí RPG 16-bit ấm áp, đọc chiến trường trong 0.5 giây, phản hồi rõ mọi vòng lặp nông trại–rèn–boss. |
| 2 | **User stories** | Người chơi mới đọc hiểu ngay công cụ/nhiệm vụ không cần đọc sách hướng dẫn; người chơi tổ đội thấy rõ HP đồng đội & telegraph Boss; người khiếm thị màu phân biệt 100% độ hiếm & nguyên tố. |
| 3 | **Functional requirements** | Đủ 24 màn hình bắt buộc, đầy đủ 8 trạng thái cho mọi primitive, hỗ trợ gõ tiếng Việt IME và hiển thị chuẩn 9 nguyên tố + 6 độ hiếm. |
| 4 | **Business rules** | Không dùng tài nguyên bên thứ 3/CDN; luôn hiển thị xác suất Gacha công khai và mốc khóa cấp Lò Rèn (`+1..+10`); không ẩn chi phí hay dùng dark pattern. |
| 5 | **Input và output** | Đầu vào từ Zustand stores (`useHudStore`, `useInventoryStore`...) và sự kiện `GameUiBridge`; đầu ra là hành động REST kèm `X-Idempotency-Key` hoặc gói tin `C2S_*`. |
| 6 | **State transitions** | Chu kỳ trạng thái `default ↔ hover ↔ active ↔ loading ↔ success/error`, stack modal (`useUiModalStore`), và chuỗi `CONNECTED → RECONNECTING → RESYNCED / DISCONNECTED`. |
| 7 | **Data model** | Tham chiếu trực tiếp tới cấu trúc `game-data/*.json` và payload trong `api-contracts.md` / `websocket-contracts.md` (không định nghĩa kiểu dữ liệu mâu thuẫn). |
| 8 | **Dependencies** | Phụ thuộc `assets/fonts/` cục bộ, `assets/ui/frames/` 9-slice, `GameUiBridge`, `InputFocusManager`, Tailwind CSS và React 18+. |
| 9 | **UI interactions** | Quy chuẩn chi tiết trong [`interaction-design.md`](./interaction-design.md) và [`user-flows.md`](./user-flows.md). |
| 10 | **Edge cases** | Tên tiếng Việt dài +25%, số lượng stack `9999`, túi đầy `40/40`, độ phân giải tối thiểu `1024×768`, bật đồng thời Text Scale `130%` và Reduced Flash. |
| 11 | **Failure behavior** | Thiếu font rơi về fallback cục bộ giữ dấu tiếng Việt; mất ảnh icon hiện sprite placeholder dấu hỏi pixel; lỗi API hiển thị mã lỗi tiếng Việt rõ và cho thử lại an toàn. |
| 12 | **Security requirements** | Không render HTML thô (`dangerouslySetInnerHTML` bị cấm) đối với tin nhắn Chat/tên người chơi để chống XSS; không tin trạng thái giá/cooldown chỉ ở UI. |
| 13 | **Acceptance criteria** | 100% cặp màu đạt WCAG 2.1 AA, 0 lỗi tràn chữ tiếng Việt ở 5 viewport desktop, 0 tài nguyên tải từ tên miền ngoài (verify qua Network tab). |
| 14 | **Test scenarios** | Định nghĩa đầy đủ ma trận kiểm thử tự động Playwright 24 màn hình × 8 trạng thái trong [`ui-testing-strategy.md`](./ui-testing-strategy.md). |
