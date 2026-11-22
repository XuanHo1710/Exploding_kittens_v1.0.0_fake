---
name: expedition-npc-generator
description: >-
  Pipeline tạo sprite nhân vật phụ overworld chuẩn pixel Gen 3 (NPC trạm nghỉ, thương nhân di tích, học giả đoàn viễn chinh, lính gác cổng thành) trên lưới 4 hướng x 4-6 frame với bảng màu BGR555 gọn sạch. Kích hoạt khi cần tạo NPC đứng tại Cờ Trạm Nghỉ hoặc điểm giao nhiệm vụ trên 7 bản đồ.
---

# Expedition Overworld NPC Generator

Tham khảo đo đạc tỷ lệ pixel: [gen3-overworld-characters.md](../../../docs/explanation/research/gen3-overworld-characters.md) và [GLOSSARY.md](../../../GLOSSARY.md).

## Đầu Ra (`database-astral-expedition/units/npcs/<npc_id>/`)

- `<npc_id>-overworld.png` + `.json`: Lưới 4 hướng (`down`, `left`, `right`, `up`), viền màu chọn lọc hoặc `#1b1726`, màu `BGR555`, alpha `0/255`, `≤ 15` màu mỗi bảng màu.
- Dùng `tools/characters/charkit.py` + `tools/gen3/check_gen3.py --grid 8 --max-palettes 1` để sinh và kiểm định tự động.
