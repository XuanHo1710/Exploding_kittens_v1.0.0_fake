---
name: expedition-ui-generator
description: >-
  Tạo bộ giao diện Pixel Fantasy tiếng Việt cho Astral Expedition Pixel: Menu Chọn Kỹ Năng Dạng Dọc (VerticalSkillMenu) phong cách Expedition 33, Thanh Thứ Tự Lượt (Turn Timeline), Ngọc AP (0..9), Vòng Bấm Nhịp (TimedHit), Huy hiệu Né/Đỡ Phản Đòn, Thanh Phá Thế (BreakGauge), khung Gacha và điều khiển cảm ứng xoay ngang. Kích hoạt khi yêu cầu thiết kế UI, HUD, menu dọc, thanh máu, thanh AP hoặc font tiếng Việt.
---

# Expedition 33-Style Pixel UI Kit (`VerticalSkillMenu` & Active Combat HUD)

Hợp đồng giao diện: [vertical-battle-ui.md](../../../specs/006-astral-expedition-pixel/contracts/vertical-battle-ui.md). Thuật ngữ: [GLOSSARY.md](../../../GLOSSARY.md).

## Đầu Ra (`database-astral-expedition/ui/`)

- `Font/expedition-font.png` + `.json`: Bộ ký tự pixel tiếng Việt đầy đủ dấu sắc nét.
- `Windows/`: Khung cửa sổ vát góc 45° nền mực đêm viền vàng đồng cổ điển (`9-slice`), thẻ dòng kỹ năng dọc (`skill-row`, `skill-row-active`, `skill-row-disabled`).
- `HUD/`: Thanh máu phân đoạn, dải 9 viên Ngọc `ActionPoints` (`AP`), thanh vàng/vỡ của `BreakGauge`, khung chân dung trên `Turn Order Timeline`, vòng thu tâm `TimedHit` và huy hiệu phản xạ `Dodge` / `ParryCounter`.
- `Icons/` & `Elements/`: Biểu tượng 6 hệ nguyên tố (`Verdant`, `Frost`, `Solar`, `Tide`, `Pyre`, `Astral`), 4 vai trò và bộ nút cảm ứng D-pad / Tương tác cho điện thoại xoay ngang (`390×180`).
- `charm-icons.png` và `charm-icons.json` chứa ảnh riêng cho từng `charmId` và vật phẩm chiến đấu. Mỗi ô là 32×32 px gốc xuất ×2. `tools/expedition/export_charm_icons.py` đóng ảnh từ các panel 3×3, đồng thời đối chiếu toàn bộ danh mục.
- `weapons/<heroId>.png` dùng ảnh riêng cho vũ khí Trấn ở menu trang bị, túi đồ và banner. `tools/expedition/export_weapon_icons.py` xuất ảnh 128×128 từ panel 3×2.
- `status-icons.png` dùng chung cho Canvas và HUD. `tools/expedition/export_status_icons.py` đặt hình 48×48 theo thứ tự `STATUS_IDS`, mỗi hàng năm ô.

## Quy Tắc Hiển Thị

- Mọi văn bản hiển thị cho người chơi đều bằng **tiếng Việt** tự nhiên, rõ dấu.

Các vùng cắt của `hud-kit.png` và `combat-kit.png` được ghi trong [bộ đồ họa feature 006](../../../specs/006-astral-expedition-pixel/design/visual-kit.md).
- `VerticalSkillMenu` chiếm không quá `32%` chiều ngang khung hình, hiển thị trọn bộ kỹ năng theo cột dọc không cuộn ngang và tự thu gọn ngay khi nhân vật bắt đầu ra đòn.
