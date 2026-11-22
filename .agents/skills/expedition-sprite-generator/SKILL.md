---
name: expedition-sprite-generator
description: >-
  Pipeline tạo sprite sheet chuyển động nhiều frame (192x192 hoặc 64x64 pixel art, 6 frame x 4 hướng = 24 frame mỗi vòng idle / walk, tổng 48 frame) cho Anh Hùng (Hero), Quái Gác Cổng (Gatekeeper) và Tinh Linh trong Astral Expedition Pixel. Kích hoạt khi người dùng yêu cầu vẽ, tạo hoặc xuất sprite sheet di chuyển nhân vật/quái overworld. Không dùng cho hoạt ảnh chiến đấu (hãy dùng expedition-battle-poses).
---

# Expedition Multi-Frame Movement Sprite Generator

> **Hoạt ảnh chiến đấu góc chéo (`IDLE_BREATHE`, `ATTACK`, `SKILL_CAST`, `PARRY_COUNTER`, `DODGE`, `HURT_FAINT`) thuộc quy trình riêng:** sử dụng [expedition-battle-poses](../expedition-battle-poses/SKILL.md).

## Quy Chuẩn Cốt Lõi

- **Đường dẫn đầu ra**: `database-astral-expedition/units/{heroes,gatekeepers,monsters,animals}/<unit_id>-movement.png`. Anh hùng dùng 6×8 (idle và walk); các nhóm còn lại dùng 6×4 walk. Danh mục: `data/expedition/units.json`.
- **Dựng từ rig**: `py tools/expedition/build_units.py --only <unit_id>` dựng sheet theo thiết kế trong `tools/expedition/roster.py`. Sheet vẽ tay trong `art-source/motion/` (trường `art`) luôn thắng bản dựng.
- **Tỷ lệ cơ thể thật (True Heroic Proportions)**: Giữ nguyên giải phẫu, vũ khí, áo choàng theo thiết kế gốc — **TUYỆT ĐỐI KHÔNG vẽ chibi đầu to**.
- **Bố cục Nhiều Frame Mượt Mà**:
  - Mỗi vòng chuyển động (`idle` thở tại chỗ, `walk` bước đi tuần tra/khám phá) gồm **6 cột × 4 hàng = 24 frame**; ghép 2 vòng tạo thành **48 frame/đơn vị**.
  - Thứ tự 4 hàng hướng nhìn: `1: down`, `2: left`, `3: right`, `4: up`.
- **Chuẩn Pixel Gen 3**: Màu `BGR555`, alpha nhị phân `0/255`, viền `#1b1726` sắc nét `1 px`, tách sạch nền `#FF00FF` qua [normalize_sheet.py](../../../tools/units/normalize_sheet.py).
- **Mẫu câu lệnh sinh ảnh**: [prompts/movement/README.md](../../../prompts/movement/README.md). Thuật ngữ chuẩn: [GLOSSARY.md](../../../GLOSSARY.md).

## Quy Trình Thực Thi

1. Chuẩn bị prompt từ [prompts/movement/README.md](../../../prompts/movement/README.md) và sinh vòng `idle` trước (làm design lock), sau đó sinh vòng `walk`.
2. Chuẩn hóa từng vòng bằng `tools/units/normalize_sheet.py --mode move4 --layout loop --frames 6` và kiểm tra độ khác biệt giữa các frame liên tiếp (`tools/units/loop_check.py`).
3. Kiểm tra không sót viền hồng (`tools/units/check_magenta.py`) và chạy kiểm định phần cứng `tools/gen3/check_gen3.py`.
4. Atlas di chuyển Lâm Phong lấy từ `database-astral-expedition/art-source/motion/gustave-movement.png` khi đóng gói.

`tools/expedition/agy_units.py run --sheets movement --jobs 3` chạy theo từng đơn vị. Ảnh thô lưu trong database trước bước chuẩn hóa.

Trang phục mới có atlas di chuyển 6×8 riêng, dùng khóa của Anh Hùng gốc và một khóa trang phục. Giữ tóc, vũ khí và thứ tự hướng như atlas chiến đấu của cùng trang phục.
