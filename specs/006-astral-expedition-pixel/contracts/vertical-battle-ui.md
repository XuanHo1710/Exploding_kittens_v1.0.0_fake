# Contract 3: Expedition 33 Vertical Skill UI & Combat Controls (`contracts/vertical-battle-ui.md`)

**Feature**: `006-astral-expedition-pixel` · **Date**: 2026-11-21

---

## 1. Bố cục Khung Hình Trận Đấu 16:9 (`390×180` Logical Pixel × Integer Scale)

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ [TURN TIMELINE]  [Hero1]▸[Boss]▸[Hero2]▸[Hero3]      [BOSS HP + BREAK BAR]   │
│                                                                              │
│                                              ╔═════════════════════════╗     │
│                                              ║  ENEMY / COLOSSAL BOSS  ║     │
│        ┌─────────────────────────┐           ║  (FRONT 3/4, 36 frames) ║     │
│        │ ◆ KỸ NĂNG — LÂM PHONG   │           ╚═════════════════════════╝     │
│        ├─────────────────────────┤                                           │
│        │ [1] ⚔ Trảm Phong   +2AP │ ◄── Cột lệnh xếp DỌC (Vertical Stack)    │
│   ╔════╡ [2] 🌿 Lốc Kiếm    -3AP │     vát góc 45°, viền vàng đồng & mực     │
│   ║HERO│ [3] ⚡ Xuyên Phá   -4AP │     không đè lên nhân vật hay Boss!       │
│   ║BACK│ [4] ✦ Thiên Phong  -7AP │                                           │
│   ║36f │ [Q] 🎒 Vật Phẩm / Đổi   │        ( ◎ TIMED HIT / PARRY RING )       │
│   ╚════┴─────────────────────────┴───────────────────────────────────────────│
│        │ "Chém 2 nhịp gió, gây Phá Thế mạnh lên mục tiêu đang lộ sơ hở."     │
│ ───────┴──────────────────────────────────────────────────────────────────── │
│ [PARTY HUD: 3 Anh Hùng — Thanh HP · Ngọc AP (●●●●○○○○○) · Biểu tượng Buff]  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Quy chuẩn Hiển thị & Tương tác Bắt buộc (`FR-005` – `FR-010`, `SC-003`)

1. **Menu Chọn Kỹ Năng Dạng Dọc (`VerticalSkillMenu`)**:
   - Hiển thị tối đa `5` dòng hành động theo cột dọc ngay bên phải đội hình người chơi (hoặc neo sát mép trái-giữa trên điện thoại) với chiều rộng ≤ `32%` khung hình.
   - Kỹ năng không đủ AP hiển thị mờ rõ trạng thái thiếu AP và khóa chọn; **dòng `[1] Đánh Thường (+2 AP)` luôn sáng khả dụng** khi nhân vật tới lượt.
   - Ngay khi người chơi xác nhận kỹ năng và mục tiêu, **toàn bộ Menu Dọc thu gọn mượt trong `120 ms`** để nhường `100%` tầm nhìn cho hoạt ảnh 36-frame, hiệu ứng chiêu thức và vòng bấm nhịp `Timed Hit`.
2. **Quy tắc Bảo vệ Tầm Nhìn Báo Đòn Trùm (`Anti-Obscuration Rule` — `FR-013`)**:
   - Khi tới lượt kẻ địch hoặc Trùm chuẩn bị ra đòn: ẩn hoàn toàn menu lệnh, hiển thị băng báo tên đòn tiếng Việt ở cạnh trên, vẽ viền cảnh báo sắc nét trên vũ khí Trùm và hiển thị **2 nút phản xạ trực quan (`[E / Space] ĐỠ PHẢN ĐÒN` · `[Shift] NÉ`)**.
   - Mọi hạt hiệu ứng dư âm của lượt trước bắt buộc tắt hoặc hạ độ ưu tiên hiển thị dưới lớp báo đòn của Trùm.
3. **Bảng Điều Khiển Đa Nền Tảng (PC & Điện Thoại Xoay Ngang)**:
   - **Khám phá 7 Bản đồ**: `WASD` / Phím mũi tên (PC) hoặc D-pad ảo góc dưới-trái (Mobile) để đi 4 hướng; `E / Enter` hoặc nút `TƯƠNG TÁC` để mở rương, nghỉ tại Cờ Trạm Nghỉ, bước qua Cổng Vùng Đất; `G` mở Triệu Hồi Gacha; `P` mở Đội Hình.
   - **Trong Trận Đấu**: `W/S` hoặc `↑/↓` duyệt danh sách kỹ năng dọc, `1–4` chọn nhanh kỹ năng, `A/D` hoặc chạm trực tiếp lên quái để đổi mục tiêu, `Space / Enter` xác nhận & bấm nhịp **Timed Hit**, `E / Space` **Đỡ Phản Đòn (Parry)**, `Shift` **Né (Dodge)**.
