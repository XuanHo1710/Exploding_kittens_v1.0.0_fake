# Accessibility Specification (Trợ năng & An toàn Thị giác) — Eldoria: Forgotten Wilds

**Trạng thái**: Design Baseline v1.0 (`DESIGN_AND_PLANNING_ONLY`)  
**Cập nhật lần cuối**: 2026-11-19  
**Tiêu chuẩn mục tiêu**: **WCAG 2.1 Level AA** & **Game Accessibility Guidelines (Silver/Gold Baseline)**  
**Tham chiếu**: [Constitution Nguyên tắc V & VIII](../../.specify/memory/constitution.md), [design-system.md](./design-system.md), [interaction-design.md](./interaction-design.md)

---

## 1. Mục tiêu Trợ năng Cốt lõi

**Eldoria: Forgotten Wilds** hướng tới trải nghiệm RPG công bằng và thoải mái cho mọi người chơi — bao gồm người khiếm thị màu (mù màu đỏ-lục / xanh-vàng), người nhạy cảm ánh sáng nhấp nháy/chuyển động, người chơi chỉ dùng bàn phím và người khiếm thính. Toàn bộ tính năng trợ năng được cài đặt tập trung tại tab **`Trợ năng`** trong `SCR-23 Settings` và lưu ngay trong hồ sơ cục bộ (không cần dịch vụ ngoài).

---

## 2. Tuân thủ Độ Tương phản Màu WCAG 2.1 Level AA

Mọi cặp màu văn bản và thành phần giao diện tương tác đều phải đạt ngưỡng tối thiểu WCAG 2.1 AA (đã kiểm chứng bằng công thức độ chói tương đối tại [`design-system.md`](./design-system.md)):

| Hạng mục WCAG 2.1 AA | Ngưỡng Bắt buộc | Giá trị Đạt được trong Eldoria | Ghi chú Thiết kế |
| :--- | :---: | :---: | :--- |
| **Văn bản thường (Body / Small `< 24px`)** | `>= 4.5:1` | `7.82:1` – `16.01:1` (nền tối); `5.77:1` – `14.62:1` (nền giấy da) | Vượt chuẩn AA (đa số đạt AAA `>= 7:1`) |
| **Nhãn Nút bấm (Button Labels)** | `>= 4.5:1` | `5.67:1` (Emerald) đến `10.82:1` (Gold Hover); Disabled `4.71:1` | Kể cả nút bị khóa vẫn đọc được lý do rõ ràng |
| **Thanh HP / MP / Stamina / Boss Poise** | `>= 3.0:1` (UI Graphical) | `3.98:1` (HP Fill vs rãnh) đến `8.52:1` (Poise); chữ số trên thanh `6.23:1` – `7.43:1` | Luôn có nền rãnh `#161320` + bóng chữ 1px sắc nét |
| **Vòng Focus Bàn phím & Viền Khung** | `>= 3.0:1` | Viền đồng `5.79:1`; Vòng Focus Vàng `#FBBF24` đạt `10.96:1` trên `#161320` | Dễ thấy lập tức trên cả nền tối lẫn nền giấy da nhờ viền kép |
| **Badge Rarity & Element trên Giấy da sáng** | `>= 4.5:1` | `6.57:1` – `14.21:1` | **Bắt buộc** đặt trên nền pill tối `#1B1624` khi nằm trên `#F3E6CC` |

---

## 3. Thiết kế An toàn Cho Người Mù Màu (Colorblind-Safe Coding)

Tuân thủ nguyên tắc **WCAG 1.4.1 (Use of Color)**: **KHÔNG BAO GIỜ** truyền đạt thông tin gameplay quan trọng chỉ bằng màu sắc đơn lẻ. Toàn bộ hệ thống được kiểm tra cho 3 dạng mù màu phổ biến: **Protanopia** (mù đỏ), **Deuteranopia** (mù lục) và **Tritanopia** (mù xanh dương-vàng).

### 3.1 Mã hóa Kép 3 Lớp Cho Độ Hiếm (Rarity Triple-Coding)
Ngay cả khi màn hình chuyển sang đơn sắc (grayscale 100%), người chơi vẫn phân biệt chính xác 6 bậc độ hiếm của vật phẩm và anh hùng:

| Bậc `Rarity` | Lớp 1: Màu chuẩn | Lớp 2: Hoa văn Khung `ItemSlot` | Lớp 3: Mã Chữ & Số Sao (Luôn hiện khi bật Chế độ Mù màu) |
| :--- | :---: | :--- | :---: |
| `COMMON` | `#B8C0CC` | Viền trơn 2px vuông | `C` • `★` |
| `UNCOMMON` | `#4ADE80` | 2 đinh tán vuông góc trên | `U` • `★★` |
| `RARE` | `#38BDF8` | Viên thoi nhỏ 2 bên cạnh | `R` • `★★★` |
| `EPIC` | `#C084FC` | Góc khắc chữ L đôi sắc cạnh | `E` • `★★★★` |
| `LEGENDARY` | `#FBBF24` | Vương miện nhỏ chính giữa mép trên | `L` • `★★★★★` |
| `MYTHIC` | `#FB7185` | Viền đôi hoa văn cổ ngữ + tinh thể 8 cánh góc trên | `M` • `★★★★★★` |

### 3.2 Mã hóa Cho 9 Nguyên tố, Telegraph Boss & Building Ghost
1. **9 Nguyên tố (`Element`)**: Mỗi nguyên tố sở hữu **silhouette hình học độc nhất** (`Flame`, `Droplet`, `Mountain Hex`, `Wind Swirl`, `Lightning Bolt`, `6-Point Snowflake`, `Sunburst`, `Crescent Moon`, `Hollow Diamond`) kết hợp tên nguyên tố tiếng Việt trong Tooltip (vd: `Yếu điểm: [🔥 HỎA]`).
2. **Boss & Monster Telegraph (`Depth 100–199`)**:
   - Không chỉ tô màu đỏ mờ (người Protanopia/Deuteranopia rất khó phân biệt đỏ trên nền cỏ xanh rừng `reg_whispering_forest`!).
   - Bắt buộc kết hợp **viền nét đứt sáng chạy hướng tâm + họa tiết gạch chéo nội vùng + dấu chấm than `[!]` ở tâm đòn rơi** (và tùy chọn đổi bảng màu Telegraph sang **Xanh Dương Sáng `#38BDF8` / Vàng Sáng `#FACC15`** trong `SCR-23 Settings`).
3. **So sánh Chỉ số (`PixelTooltip` / `SCR-13 Enhancement`)**: Luôn ghép cặp màu với mũi tên hình học: tăng = `▲ +14 ATK`, giảm = `▼ -3 DEF`.
4. **Building Ghost Placement (`SCR-15`)**: Hợp lệ = Xanh + đường viền nét đứt + icon **`✓`**; Vi phạm = Đỏ + **gạch chéo 45° (crosshatch)** + icon **`✕`** + dòng chữ nêu rõ lỗi.

---

## 4. An toàn Nhạy cảm Ánh sáng & Chuyển động (Photosensitivity & Motion Safety)

Tuân thủ nghiêm ngặt **WCAG 2.3.1 (Three Flashes or Below Threshold)** và **Constitution Nguyên tắc V**:

1. **Giới hạn Cứng Toàn Hệ thống (`<= 3 Flashes / Second`)**:
   - Mọi hiệu ứng Hit Flash, Kỹ năng Lôi (`LIGHTNING`), Ultimate (`Crimson Crescent`, `Storm Dominion`, `Solar Judgment`), chuyển Phase Boss và hoạt ảnh triệu hồi Gacha bị **giới hạn cứng ở mức tối đa `<= 3` lần nháy sáng/giây**, và **CẤM TUYỆT ĐỐI** chớp trắng/đỏ toàn khung hình (`>= 25%` diện tích màn hình) có độ tương phản cao.
2. **Thanh Chọn Rung Màn hình (`Camera Shake`)**:
   - Có 3 mức rõ ràng trong `SCR-23 Settings`: **`0% (Tắt hoàn toàn)`**, **`50% (Nhẹ)`**, **`100% (Mặc định)`**.
   - Khi chọn `0%`, mọi hiệu ứng rung từ đòn đánh Crit, `Root Slam` của `boss_thornback_elder` hay lỗi nút UI được vô hiệu hóa 100%.
3. **Công tắc Giảm Lóe Sáng (`Reduced VFX Flash`)**:
   - Thay thế mọi hit flash trắng trên sprite bằng viền nổi màu vàng ấm dịu (`opacity 0.55`).
   - Giảm 50% mật độ hạt particle bay trên lớp `Depth 100000–109999`, thay chớp sáng Gacha bằng chuyển cảnh fade êm ái và tắt hiệu ứng rung/lắc ngang của nút báo lỗi.
4. **Tự động Tôn trọng Hệ điều hành**:
   - Ở lần mở game đầu tiên, client đọc CSS media query `window.matchMedia('(prefers-reduced-motion: reduce)')`; nếu bật, tự động đặt sẵn `Camera Shake = 0%` và `Reduced VFX Flash = Bật` (người chơi vẫn có thể chỉnh lại bất kỳ lúc nào).

---

## 5. Điều hướng Toàn bộ Bằng Bàn phím & Ngữ nghĩa ARIA (Keyboard & Focus)

### 5.1 Vòng Focus Chuẩn (High-Visibility Pixel Focus Ring)
- Mọi phần tử tương tác (`PixelButton`, `ItemSlot`, `PixelInput`, Tab, Checkbox, Slider, Thẻ nhân vật, Lựa chọn hội thoại) đều có thể focus qua `Tab` / `Shift+Tab` và điều hướng bên trong lưới ô bằng phím mũi tên (`↑ ↓ ← →`).
- **Đặc tả Thị giác Vòng Focus**:
  ```css
  :focus-visible {
    outline: 2px solid #FBBF24;       /* Vàng sáng: 10.96:1 trên obsidian */
    outline-offset: 2px;
    box-shadow: 0 0 0 2px #140F1C;    /* Viền đệm đen đảm bảo nổi bật cả trên nền giấy da sáng */
  }
  ```
- **CẤM** viết `outline: none` nếu không có vòng focus thay thế đạt chuẩn tương phản trên.

### 5.2 Quản lý Focus Trap & Khôi phục Focus (Focus Lifecycle)
1. **Focus Trap trong Modal**: Khi mở bất kỳ màn hình Modal nào (`SCR-06`..`SCR-24`), nhấn `Tab` ở phần tử cuối cùng sẽ vòng lại phần tử đầu tiên bên trong Modal; không bao giờ để focus lọt xuống HUD hoặc thanh địa chỉ ngoài ý muốn.
2. **Khôi phục Focus (Focus Restoration)**: Khi đóng Modal bằng `ESC` hoặc nút `[X]`, focus tự động trả về phần tử đã kích hoạt nó (hoặc trả quyền về `WORLD_GAMEPLAY` trên Phaser Canvas).
3. **Thứ tự Đọc Logic & ARIA Landmarks**:
   - Modal dùng `role="dialog" aria-modal="true" aria-labelledby="..."`.
   - Thanh Tab dùng `role="tablist"` / `role="tab" aria-selected`.
   - Thanh HP/MP/Boss Poise dùng `role="progressbar" aria-valuenow aria-valuemin aria-valuemax`.
   - Toast thông thường & Loot dùng `aria-live="polite"`; Thông báo lỗi khẩn cấp (`ACTION_ERROR`), `ReconnectBanner` và Cảnh báo Boss dùng `role="alert" aria-live="assertive"`.

### 5.3 Tùy biến Phím tắt Đầy đủ (Full Key Remapping)
- Trong `SCR-23 Settings → Điều khiển`, người chơi có thể gán lại toàn bộ phím di chuyển, chiến đấu (`Attack, Dodge, Block, Skill 1..3, Ult, Quick Use, Interact`) và phím tắt cửa sổ (`I, B, C, K, M, P, G, L...`).
- Hỗ trợ nút **"Khôi phục mặc định"** và tự động phát hiện xung đột phím với đề xuất hoán đổi 1-click.

---

## 6. Phóng to Cỡ Chữ Giao diện (`100% / 115% / 130%`)

- Biến gốc `--ui-text-scale` nhận 3 mức trong `SCR-23 Settings`:
  - **`100%` (Mặc định)**: Thân bài `14px`, Nhỏ `12px`, Tiêu đề `20px`.
  - **`115%` (Trung bình)**: Thân bài `16px`, Nhỏ `14px`, Tiêu đề `23px`.
  - **`130%` (Lớn — Dễ đọc)**: Thân bài `18px`, Nhỏ `16px`, Tiêu đề `26px`.
- Phóng to chữ chỉ áp dụng cho lớp React UI (`--font-pixel-body`, `--font-pixel-ui`, `--font-pixel-display`), **KHÔNG làm lệch lưới pixel `640×360` của Phaser Canvas**. Toàn bộ nút, hộp thoại, bảng chỉ số và tooltip tự động mở rộng chiều cao & wrap dòng nhờ ngân sách giãn nở tiếng Việt trong [`responsive-design.md`](./responsive-design.md).

---

## 7. Trợ năng Âm thanh & Phụ đề Cảnh báo Boss (Audio Accessibility & Visual Cues)

Nhằm giúp người khiếm thính hoặc người chơi tắt tiếng (chơi ban đêm/văn phòng) vẫn đọc chính xác nhịp chiến đấu và không chết oan trước đòn Boss:

1. **Thanh Phụ đề Cảnh báo Boss & Sự kiện Chiến đấu (Closed-Caption Cue Bar)**:
   - Đặt gọn ngay dưới Boss Bar mép trên (không lấn vùng an toàn trung tâm), bật mặc định (có thể tắt trong Settings).
   - Hiển thị tối đa 2 dòng ngắn gọn gắn nhãn nguồn âm thanh + hướng mũi tên nếu ngoài khung nhìn:
     - `[🔊 Cảnh báo Boss] Thornback Elder gầm vang: Bramble Lash phía trước!`
     - `[🔊 Cảnh báo Boss] Trụ đá vỡ — Boss bị Choáng (2.5 giây)!`
     - `[🔊 Tổ đội] Seraphina vừa tung Hào Quang Hồi Máu (◄ bên trái)`
     - `[🔊 Môi trường] Mưa bắt đầu rơi — Ruộng lúa tự động được tưới!`
2. **Tín hiệu Hình ảnh Đi kèm Mọi Âm thanh Quan trọng**:
   - Đủ Mana / Hồi chiêu kỹ năng xong → Quét sáng ô Hotbar.
   - Có tin nhắn Party / Lời mời tổ đội → Nhấp nháy nhẹ biểu tượng Party (<= 1.5 Hz) + huy hiệu số lượng chưa đọc.
   - Đòn Perfect Parry thành công → Tia chớp kim loại + chữ nổi `"PHẢN ĐÒN HOÀN HẢO!"` màu vàng trên đầu nhân vật.
3. **Tách Độc lập 5 Kênh Âm lượng**: `Master (Tổng)`, `BGM (Nhạc nền)`, `Combat SFX (Chiến đấu)`, `UI SFX (Giao diện)`, `Ambience (Môi trường/Thời tiết)` từ `0%` đến `100%`, kèm phím tắt tắt tiếng tức thì (`Alt+M`).
