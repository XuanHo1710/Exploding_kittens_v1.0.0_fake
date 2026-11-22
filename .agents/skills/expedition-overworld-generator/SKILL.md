---
name: expedition-overworld-generator
description: >-
  Sinh các mảnh địa hình Overworld chuẩn pixel Gen 3 (47-tile blob autotile, vách đá, bờ nước, cầu cổ, vật thể Prop) kèm dải hoạt ảnh môi trường 8 frame cho đủ 7 vùng bản đồ của Astral Expedition Pixel (Đồng Cỏ, Tuyết, Sa Mạc, Dưới Nước, Núi Lửa, Ban Đêm, Quang Phổ Mây Trời Ban Đêm). Kích hoạt khi yêu cầu vẽ tile, địa hình, cây cối, băng tuyết, cát, san hô, dung nham hoặc cực quang.
---

# Expedition 7-Realm Overworld Piece Generator

Tham chiếu chi tiết: [references/catalog.md](./references/catalog.md), [references/research.md](./references/research.md), [prompts/overworld/README.md](../../../prompts/overworld/README.md) và [GLOSSARY.md](../../../GLOSSARY.md).

## Đầu Ra (`database-astral-expedition/overworld/`)

- Ô gốc `16×16 px` xuất `×2` (`32×32 px`), màu `BGR555`, alpha nhị phân `0/255`, `≤ 15` màu mỗi ô `8×8`.
- Đầy đủ 7 bộ chủ đề (`meadow`, `snow`, `desert`, `underwater`, `volcano`, `night`, `aurora`), mỗi chủ đề gồm:
  - Địa hình nền (`fill` 4 biến thể không lộ lưới), địa hình nối `47-tile blob autotile` + tệp `.tsj` (Tiled wangset).
  - **Dải địa hình & vật thể động `8 frame`** (`*-anim.png`, `200 ms/frame`): nước suối, băng lấp lánh, cát bay, bọt san hô, dung nham sôi, đom đóm đêm và dải mây cực quang 7 màu.
- Kiểm định bắt buộc: `py tools/gen3/check_gen3.py --quiet database-astral-expedition/overworld` đạt `0 failed`.

Atlas đang dùng của 7 map do `tools/expedition/pixel_worlds.py` xuất. Tám ô đầu giữ ID tương thích với renderer, tám ô tiếp theo dùng cho hoạt ảnh trong Tiled. Game đọc dải động riêng có cùng tám frame.

Kiểm tra texture trên cả ô nền cơ bản và ô nền biến thể. Ô biến thể giữ cùng ID địa hình và thêm cụm chất liệu theo vùng. Mạch ván hoặc đá nên lệch giữa các hàng để đọc được vật liệu ở kích thước chơi.

Bộ dốc, bậc, mép bám và ấn lao ở `database-astral-expedition/overworld/traversal/` được xuất bằng [export_traversal_tiles.py](../../../tools/expedition/export_traversal_tiles.py).

Ở Đồng Cỏ, gợn nước nằm trên các ô nước. Cỏ cao và bờ lau từ `structures/meadow/waterworks.png` vẽ theo thứ tự chân nhân vật. Khi nhân vật ở ô cỏ cao, lớp cỏ che một phần thân dưới và vẫn để lộ phần trên.
