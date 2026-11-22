# Phong cách hình ảnh Pokémon Gen 3 (RSE + FRLG, GBA)

Mục đích: làm thước đo để kiểm tra asset của repo (sprite Pokémon, tile/prop overworld, công trình) có khớp "look" Gen 3 hay không.

Quy ước độ tin cậy:
- **[PRET]** = đọc trực tiếp từ mã nguồn pret (số liệu cứng).
- **[GBATEK]** = tài liệu phần cứng.
- **[SUY RA]** = suy ra từ số liệu cứng (ví dụ 4bpp => tối đa 16 màu), không có dòng nào nói thẳng.
- **chưa xác minh** = không kiểm chứng được bằng nguồn tin cậy trong lần nghiên cứu này (thường là các nhận định thuần thị giác như hướng sáng, màu viền).

Ngày truy cập: 2026-11-17. Bulbapedia trả về 403 cho fetch trực tiếp nên chỉ dùng được bản tóm tắt từ kết quả tìm kiếm; The Spriters Resource không được truy cập.

---

## 1. Phần cứng GBA

| Hạng mục | Giá trị | Nguồn |
|---|---|---|
| Độ phân giải màn hình | 240 x 160 px | [GBATEK](https://problemkaputt.de/gbatek.htm) |
| Màu | 15-bit BGR555: 5 bit mỗi kênh, bit 15 không dùng (32 mức/kênh) | [GBATEK](https://problemkaputt.de/gbatek.htm), [pret rgb.h](https://raw.githubusercontent.com/pret/pokeemerald/master/include/constants/rgb.h): `RGB(r,g,b) = r \| g<<5 \| b<<10` |
| Palette RAM | 1 KB: vùng BG 256 màu + vùng OBJ 256 màu; mỗi vùng dùng được như 16 palette x 16 màu (4bpp) | [GBATEK](https://problemkaputt.de/gbatek.htm) |
| Màu index 0 | Trong suốt ở mọi palette BG và OBJ => mỗi palette 4bpp chỉ còn 15 màu hiển thị | [GBATEK](https://problemkaputt.de/gbatek.htm) |
| Tile phần cứng | 8x8 px, 4bpp = 32 byte/tile | [GBATEK](https://problemkaputt.de/gbatek.htm); `TILE_SIZE_4BPP` trong [field_door.c](https://raw.githubusercontent.com/pret/pokeemerald/master/src/field_door.c) |
| Kích thước OBJ | Vuông 8/16/32/64; ngang 16x8, 32x8, 32x16, 64x32; dọc 8x16, 8x32, 16x32, 32x64 | [GBATEK](https://problemkaputt.de/gbatek.htm) |

Hệ quả: mọi màu phải nằm trên lưới 32 mức/kênh (giá trị 8-bit sau quy đổi `v>>3` rồi `<<3`); khi xuất cần lượng tử hóa về BGR555.

Số palette OBJ cho sprite overworld: mỗi loại gắn tag palette riêng (ví dụ `OBJ_EVENT_PAL_TAG_BRENDAN`, `OBJ_EVENT_PAL_TAG_NPC_3`) trong [object_event_graphics_info.h](https://raw.githubusercontent.com/pret/pokeemerald/master/src/data/object_events/object_event_graphics_info.h). Phần cứng có 16 palette OBJ; số game thực sự cấp phát đồng thời: chưa xác minh.

## 2. Bản đồ overworld

**Cấu trúc metatile** [PRET]:
- Metatile 16x16 px = 8 tile 8x8: 4 tile lớp dưới (`tiles[0..3]`) + 4 tile lớp trên (`tiles[4..7]`), mỗi nhóm là khối 2x2. [field_camera.c](https://raw.githubusercontent.com/pret/pokeemerald/master/src/field_camera.c)
- Ba kiểu layer quyết định lớp trên nằm trước hay sau sprite nhân vật ([global.fieldmap.h](https://raw.githubusercontent.com/pret/pokeemerald/master/include/global.fieldmap.h)):
  - `NORMAL`: dùng BG giữa + BG trên (lớp trên che sprite, ví dụ tán cây);
  - `COVERED`: dùng BG dưới + BG giữa (ví dụ cửa);
  - `SPLIT`: dùng BG dưới + BG trên.
- Thuộc tính metatile: behavior 8 bit (bits 0-7), layer type (bits 12-15). Cùng nguồn.
- Mỗi map có 1 tileset **primary** + 1 tileset **secondary**. Cùng nguồn.

**Giới hạn tileset**:

| | Emerald | FireRed |
|---|---|---|
| Tile primary | 512 | 640 |
| Tile tổng | 1024 | 1024 |
| Tile secondary tối đa [SUY RA] | 512 | 384 |
| Metatile primary | 512 | 640 |
| Metatile tổng | 1024 | 1024 |
| Palette primary | 6 | 7 |
| Palette tổng | 13 | 13 |

Nguồn: [pokeemerald fieldmap.h](https://raw.githubusercontent.com/pret/pokeemerald/master/include/fieldmap.h), [pokefirered fieldmap.h](https://raw.githubusercontent.com/pret/pokefirered/master/include/fieldmap.h). 13 palette BG cho tileset (3 palette còn lại trong 16 cho UI/văn bản: [SUY RA], chưa xác minh).

**Tile nhìn thấy trên màn hình**: 240/16 x 160/16 = **15 x 10 metatile** [SUY RA] (không có hằng số pret nào xác nhận trực tiếp).

**Tile động** (Emerald, [tileset_anims.c](https://raw.githubusercontent.com/pret/pokeemerald/master/src/tileset_anims.c)):

| Hiệu ứng | Số frame | Tile 8x8 mỗi lần cập nhật | Nhịp |
|---|---|---|---|
| Hoa | 4 (thứ tự 0,1,0,2) | 4 | mỗi 16 tick |
| Nước | 8 | 30 | mỗi 16 tick |
| Bờ cát-nước | 8 (7 khác nhau) | 10 | mỗi 16 tick |
| Thác | 4 | 6 | mỗi 16 tick |
| Bờ đất-nước | 4 | 10 | mỗi 16 tick |

Tile động nằm ở vùng cuối VRAM của primary tileset (offset 432-511). Frame động của FRLG: chưa xác minh.

**Kích thước map tham khảo** ([layouts.json](https://raw.githubusercontent.com/pret/pokeemerald/master/data/layouts/layouts.json)): Petalburg City 30x30 metatile; nội thất Pokémon Center 1F 14x9; nhà Brendan 1F 11x9 (tileset Building + tileset riêng).

## 3. Sprite đối tượng overworld

Nguồn: [graphics_info](https://raw.githubusercontent.com/pret/pokeemerald/master/src/data/object_events/object_event_graphics_info.h), [pic_tables](https://raw.githubusercontent.com/pret/pokeemerald/master/src/data/object_events/object_event_pic_tables.h), [anims](https://raw.githubusercontent.com/pret/pokeemerald/master/src/data/object_events/object_event_anims.h).

- Người chơi/NPC thường: **16x32 px**, shadow size M, `TRACKS_FOOT`.
- Item ball: **16x16**, shadow S.
- Sprite lớn: **32x32** (ví dụ Poochyena), Truck 48x48, Rayquaza 64x64.
- Bảng ảnh người đi bộ: **9 frame** (chỉ số 0-8), mỗi frame 2x4 tile = 16x32; sheet Running cũng 9 frame.
- Animation chuẩn:
  - Đứng: South = frame 0, North = 1, West = 2, **East = frame 2 lật ngang**.
  - Đi: South = 3,0,4,0; West = 7,2,8,2; **East = West lật ngang**; mỗi frame 8 tick. Tức 3 hướng vẽ thật (down/up/left), right là mirror.
- Bóng: `SHADOW_S/M/L/XL`; phản chiếu: có `FLDEFFOBJ_REFLECTION_DISTORTION` ([field_effects.h](https://raw.githubusercontent.com/pret/pokeemerald/master/include/constants/field_effects.h)). Hình dạng pixel của bóng: chưa xác minh.
- Palette: mỗi sprite một palette 16 màu => <= 15 màu + trong suốt [SUY RA].

## 4. Sprite chiến đấu

- Mọi ảnh Pokémon **64x64**, kèm bảng bounding-box thực + `y_offset` tính từ đáy ([front_pic_coordinates.h](https://raw.githubusercontent.com/pret/pokeemerald/master/src/data/pokemon_graphics/front_pic_coordinates.h)). Ví dụ Bulbasaur 32x40, y_offset 14; Charizard 64x64.
- Back sprite 64x64: chưa xác minh trực tiếp.
- Màu: tối đa 16 gồm index 0 trong suốt [SUY RA]; palette riêng cho thường/shiny: chưa đọc trực tiếp (chưa xác minh).
- Icon: **32x32**, 2 frame xen kẽ mỗi 6 tick, chỉ **3 palette icon** dùng chung ([pokemon_icon.c](https://raw.githubusercontent.com/pret/pokeemerald/master/src/pokemon_icon.c)). Sheet 32x64 là [SUY RA].
- Front sprite 2 frame của Emerald: chưa xác minh bằng nguồn trong lần này.
- Viền/shading: **chưa xác minh bằng nguồn văn bản** (cần đối chiếu The Spriters Resource bằng mắt). Quan sát phổ biến: viền tối (không nhất thiết đen tuyền), 3-4 tông mỗi vùng, sáng từ trên-trái. Chỉ dùng như kiểm tra bằng mắt.

## 5. Công trình

- Góc nhìn: top-down 3/4, mặt tiền đối diện người xem, mái thấy được, tường nhìn thẳng. Mô tả thị giác, **chưa xác minh bằng nguồn văn bản**.
- Công trình là tập hợp metatile 16x16 trên bản đồ, không phải sprite riêng.
- **Footprint ngoại thất (đã đo, 2026-11-17):** gym Petalburg và Rustboro đều **6x5 metatile**, Pokémon Center **4x4** [PRET]. Cách đo: render lại `map.bin` của PetalburgCity/RustboroCity với tileset `general` + `petalburg`/`rustboro`, rồi đối chiếu warp cửa trong `map.json` (Petalburg Gym ở (15,8), Rustboro Gym ở (27,19)).
  - Mỗi tòa dùng 15–21 màu, 3–6 palette BG.
  - Chi tiết: `.agents/skills/pokemon-structure-generator/references/research.md` §1.
- Cửa là metatile (layer `COVERED`), animation vẽ đè bằng tile động:
  - Emerald: `sDoorOpenAnimFrames` có 4 mục (frame đóng sentinel + 3 frame mở), **mỗi frame 4 tick**; mỗi frame copy 8 tile = 2 metatile chồng (16x32); cửa size 2 copy 16 tile (2x2 metatile). Cửa trượt khác cửa thường chỉ ở âm thanh. [pokeemerald field_door.c](https://raw.githubusercontent.com/pret/pokeemerald/master/src/field_door.c)
  - FRLG: 4 mục (sentinel + 3 frame), mỗi frame 4 tick, 8 tile/frame; cửa 1x2 (thang máy...) vẽ 2 metatile. [pokefirered field_door.c](https://raw.githubusercontent.com/pret/pokefirered/master/src/field_door.c)
- Màu mái/tường từng loại công trình và khác biệt thẩm mỹ RSE vs FRLG: chưa xác minh. Chỉ biết FRLG có tileset primary lớn hơn (640 so với 512 tile).

## 6. Ngày/đêm và palette

- Gen 3 **không có chu kỳ ngày/đêm hiển thị**: tông màu không đổi giữa ngày và đêm ([Bulbapedia Time of day](https://bulbapedia.bulbagarden.net/wiki/Time_of_day), chỉ đọc qua bản tóm tắt tìm kiếm vì 403). Xác nhận phụ: [field_weather.h](https://raw.githubusercontent.com/pret/pokeemerald/master/include/constants/field_weather.h) chỉ có trạng thái palette cho thời tiết/fade, không có hằng số time-of-day.
- RSE có đồng hồ thực dùng cho cơ chế (thủy triều Shoal Cave, tiến hóa theo giờ) nhưng không đổi màu overworld; FRLG không có chức năng thời gian (cùng nguồn Bulbapedia, kiểm chứng không đầy đủ).
- Hệ quả: biến thể `-night` của repo là tính năng riêng của fan game, không phải Gen 3 chuẩn.
- Thời tiết dùng đổi palette + sprite phụ (tối đa 24 sprite mưa, 20 bão cát, 16 bông tuyết; field_weather.h).
- So sánh palette RSE/FRLG bằng số: chưa xác minh.

## 7. Quy ước tile (viền, shading, dithering)

Toàn bộ mục này là nhận định thị giác, **chưa xác minh** bằng nguồn văn bản. Cách kiểm chứng: so với ảnh tileset trên The Spriters Resource hoặc `tiles.png` trong `data/tilesets/primary/general/` của pret.
- Cây/đá: viền tối cục bộ; tán cây là top-layer che sprite.
- Hướng sáng: thường trên-trái; không có cơ chế mã ép buộc.
- Dithering: ít, kiểu chấm/bàn cờ nhẹ; không gradient mượt.
- Cỏ cao: tile 16x16 lặp; hiệu ứng khi bước qua là field effect riêng, không phải tile động.
- Nước: tile động 8 frame, 30 tile (mục 2); bờ nước theo mục 2.
- Ledge: metatile có behavior riêng (nhảy một chiều).

## 8. Checklist tuân thủ Gen 3

Ký hiệu: **[H]** ràng buộc cứng từ nguồn; **[S]** suy ra; **[V]** thị giác, cần người duyệt (chưa xác minh).

### Chung
1. [H] Canvas và lưới là bội của 8 px; metatile/tile overworld 16x16.
2. [H] Mọi kênh RGB 8-bit khi quy đổi `v -> (v>>3)` rồi mở rộng lại không đổi giá trị đã chọn: script lượng tử hóa về 5 bit/kênh và so với ảnh gốc (khác = vi phạm hoặc cần snap).
3. [S] Alpha chỉ 0 hoặc 255 (không bán trong suốt); nền magenta #FF00FF theo quy ước repo sẽ chuyển thành alpha 0 khi kiểm.
4. [S] Không anti-aliasing: không có pixel màu trung gian tại biên ngoài số màu cho phép ở mục dưới.
5. [S] Không gradient mượt (heuristic: không có dải >= 4 pixel liên tiếp đổi màu từng bước nhỏ).

### Sprite Pokémon chiến đấu
6. [H] Canvas 64x64 (sprite 128/192 của repo dùng cho overworld/HD, không phải kích thước chiến đấu Gen 3).
7. [S] Số màu duy nhất (không tính trong suốt) <= 15.
8. [V] Vùng vẽ không chạm biên trừ loài lớn.
9. [V] Viền tối khép kín 1 px, 3-4 tông/vùng, sáng từ trên-trái.
10. [H] Icon 32x32, 2 frame (sheet 32x64), <= 15 màu, tối đa 3 palette dùng chung.

### Sprite đối tượng overworld
11. [H] Frame 16x32 (mặc định), 16x16 hoặc 32x32 (đặc biệt).
12. [H] Sheet đi bộ 9 frame; hướng vẽ thật: South, North, West; East = lật ngang West.
13. [S] <= 15 màu + trong suốt / sprite.
14. [H] Chu kỳ đi 4 bước, mỗi frame 8 tick.

### Tile / Props overworld
15. [H] Metatile 16x16 = 2 lớp x 4 tile 8x8; mỗi tile 8x8 dùng đúng 1 palette 16 màu.
16. [H] Mỗi tileset: tổng palette <= 13; primary <= 6 (RSE) / 7 (FRLG); tile tổng <= 1024; tile primary <= 512 (RSE) / 640 (FRLG); metatile tổng <= 1024.
17. [S] Mỗi ô 8x8: <= 15 màu + trong suốt (kiểm từng ô 8x8, không chỉ cả ảnh).
18. [S] Mỗi ô 16x16: <= 30 màu nếu dùng 2 palette; nên <= 15 cho một lớp.
19. [H] Tile động: hoa 4 frame, nước 8, bờ cát-nước 8, thác 4, bờ đất-nước 4; nhịp 16 tick.
20. [H] Không có ánh sáng động/tint theo giờ: `-night` không thuộc Gen 3.

### Công trình
21. [H] Kích thước ngoại thất là bội của 16 px. Gym Emerald 6x5 metatile, Pokémon Center 4x4 (đo từ pret).
22. [H] Cửa: frame đóng + 3 frame mở, mỗi frame 8 tile (16x32), 4 tick/frame.
23. [V] Mặt tiền 3/4 top-down, mái thấy được, tường nhìn thẳng.
24. [V] Màu nhận diện từng loại công trình: chưa xác minh.

### Chấm điểm gợi ý
- Cứng (fail = sai Gen 3): mục 1, 2, 3, 6, 7, 10-13, 15-17.
- Mềm/thị giác: mục 8, 9, 23, 24.
- Script: Pillow, đếm màu duy nhất theo ô 8x8 / 16x16 / cả ảnh; kiểm alpha {0,255}; kiểm lưới BGR555; kiểm kích thước canvas.

## Chưa xác minh (tóm tắt)
- Màu viền, hướng sáng, dithering, cách vẽ cỏ/gờ/nước/bờ (mục 4, 7).
- Màu mái từng loại công trình (mục 5). Footprint đã đo xong (gym 6x5, Center 4x4).
- Khác biệt thẩm mỹ RSE vs FRLG (mục 5, 6).
- Back sprite 64x64, front 2 frame Emerald, nội dung file palette Pokémon (mục 4).
- Số palette OBJ thực dùng đồng thời (mục 1); frame tile động FRLG (mục 2).
- Bulbapedia chỉ đọc qua tóm tắt tìm kiếm; The Spriters Resource chưa truy cập.
