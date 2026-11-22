---
name: expedition-structure-generator
description: >-
  Tạo công trình kiến trúc Pixel Art chuẩn Gen 3 (Cờ Trạm Nghỉ RestAnchor, Cổng Chuyển Vùng, Đền Di Tích, Đại Điện Trùm của 7 vùng đất) kèm dải cổng/cửa mở sáng 4 frame và lớp tiếp đất cho Astral Expedition Pixel. Kích hoạt khi yêu cầu vẽ công trình, trạm nghỉ, cổng dịch chuyển, đền đài hoặc cổng đấu trường Trùm.
---

# Expedition Landmark & Sanctuary Structure Generator

Tham chiếu: [references/catalog.md](./references/catalog.md), [references/research.md](./references/research.md), [prompts/structure/README.md](../../../prompts/structure/README.md), [door.md](../../../prompts/structure/door.md) và [interior.md](../../../prompts/structure/interior.md).

## Đầu Ra (`database-astral-expedition/structures/<structure_id>/`)

- `<structure_id>-structure.png`: Ngoại thất góc trực diện 3/4 đối xứng trên lưới `16×16` metatile xuất `×2`, màu `BGR555`, alpha `0/255`, `≤ 6` bảng màu.
- `<structure_id>-portal.png` + `.json`: Dải `4 frame` mở sáng ấn ký cổng dịch chuyển vùng / cổng vào đấu trường Đại Trùm.
- Kiểm định bắt buộc: `py tools/gen3/check_gen3.py --max-palettes 6`.

Bộ cờ và cổng đang dùng được xuất từ atlas trong `database-astral-expedition/art-source/structures/`. Dùng `tools/expedition/export_visual_kit.py` để tách nền và xuất dải bốn frame cho từng vùng.

Trạm nghỉ trong game dùng ngọn lửa giữa bệ và hai cột lửa bên cạnh. `tools/expedition/export_bonfire.py` xuất 8 ô 128×128 px cùng điểm tiếp đất.

Trạm lửa dùng thân bệ rêu vẽ sẵn tại `art-source/structures/rest-bonfire-v2-source.png`. Bộ địa vật cạnh nước của Đồng Cỏ có 9 ô 128×128 tại `structures/meadow/waterworks.png`. Dùng `tools/expedition/export_meadow_landscape.py` để xuất atlas và cập nhật lớp `landscape` trong TMJ.
