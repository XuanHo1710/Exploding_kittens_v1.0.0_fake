# Nguồn hình giao diện · Astral Expedition Pixel

Mỗi atlas trong `ui/` có một bản gốc `*-source.png` trên nền `#FF00FF`, vẽ ở mật độ 1:1 theo chất liệu của `art-source/structures/`: đá xám khắc, viền đồng, chỉ vàng, đá quý nhiều mặt, ánh sáng trên-trái. Giữ nguyên vị trí từng ô vì game cắt theo tọa độ cố định (xem bảng). Dựng lại bằng `py tools/expedition/pixel_ui.py`, xuất bằng `py tools/expedition/art_source.py --domain ui`.

| Bản gốc (`art-source/`) | Ảnh game | Kích thước | Mô tả |
|---|---|---|---|
| `ui/hud-kit-source.png` | `ui/hud-kit.png` | 256×64 | Khung chân dung 64×64, viên AP đầy và rỗng, vòng hồi chiêu. Đá khắc viền đồng, chỉ vàng. |
| `ui/combat-kit-source.png` | `ui/combat-kit.png` | 288×192 | Sáu ô huy hiệu nguyên tố, bốn thanh HP/AP/Break/Phase, ba trạng thái nút, ba biểu tượng trạng thái. |
| `ui/gacha/astral-orb-source.png` | `ui/gacha/astral-orb.png` | 1024×768 | Tinh Cầu Triệu Hồi 8×6 ô 128 px: xoay 8, tụ lực 4, rung 5, đổi hạng 4, vỡ sao 4, lắng 3. |
| `ui/charm-icons/panel-01-source.png` đến `panel-07-source.png` | `ui/charm-icons.png` và `ui/charm-icons.json` | 512×512 | 60 bùa và 3 vật phẩm, một ô 64×64 xuất ×2 cho mỗi ID. |
| `ui/weapons/*-source.png` | `ui/weapons/*.png` | 128×128 | Bốn panel ImageGen 3×2 cho 12 vũ khí Trấn và 12 mẫu dùng với vũ khí thường. |

Atlas bùa dùng bảy panel 3×3 tạo bằng ImageGen tích hợp. Motif và thứ tự từng panel được ghi trong [layout.json](charm-icons/layout.json). Chạy `py tools/expedition/export_charm_icons.py` để tách nền, đóng ô và cập nhật bảng ID. Bộ dựng bundle gọi lại bước này khi chạy toàn bộ pipeline.

Đã kiểm trên Edge 51 ô bùa và 3 ô vật phẩm, gồm gắn Gió Lành và đổi sang Mầm Xanh qua giao diện game. [Ảnh chụp trang bị](../../../specs/006-astral-expedition-pixel/design/charm-icons-in-game.png)

## Tọa độ cắt (px trên ảnh game)

| Atlas | Ô | Vùng |
|---|---|---|
| hud-kit | Khung chân dung | 0,0 – 63,63 |
| hud-kit | Viên AP đầy | 80,8 – 111,55 |
| hud-kit | Viên AP rỗng | 128,8 – 159,55 |
| hud-kit | Vòng hồi chiêu | 200,6 – 249,57 |
| combat-kit | Huy hiệu nguyên tố (Verdant, Frost, Solar, Tide, Pyre, Astral) | x = 48·i + 2 … 48·i + 45, y = 2 … 45 |
| combat-kit | Thanh HP, AP, Break, Phase | 0,52+32·i – 109,79+32·i |
| combat-kit | Nút normal, active, disabled | 118,52+32·i – 287,79+32·i |
| combat-kit | Biểu tượng trạng thái | tâm 152, 206, 258; y 152 – 188 |
| astral-orb | Hàng 1–6 | 8, 4, 5, 4, 4, 3 frame × 128 px |
