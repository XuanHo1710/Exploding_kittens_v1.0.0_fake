# Đánh giá asset hiện tại so với chuẩn Gen 3

Thước đo: [gen3-visual-style.md](gen3-visual-style.md) (mục 8: checklist).
Ngày đo: 2026-11-17, commit `bbc9ad3`.
Cách đo: dùng Pillow thu mọi PNG về kích thước gốc (asset đang phóng to ×2 bằng nearest neighbour), rồi kiểm từng ô 8×8. Bỏ qua các file preview, overview và route.

## Kết quả đo tự động

| Nhóm | Số file | Lưới 16 px | ≤15 màu mỗi ô 8×8 | Màu nằm trên lưới BGR555 | Không có alpha bán trong suốt | Có biến thể `-night` |
|---|---|---|---|---|---|---|
| Overworld tiles (`Terrain/`) | 5108 | ✅ (×2) | ✅ 98 664/98 716 ô (52 ô vượt) | ❌ 5107/5108 file lệch | ⚠️ 72 file vi phạm | ❌ 2549 file |
| Overworld props (`Props/`) | 335 | ✅ (×2) | ✅ 0 ô vượt | ❌ 324/335 file lệch | ❌ 299/335 file vi phạm (bóng/viền mờ) | ❌ 162 file |
| Structures (gym) | 48 | ✅ (×2) | ✅ 63 510/63 530 ô (20 ô vượt) | ❌ 40/48 file lệch | ⚠️ 8 file vi phạm (layer `-ground`) | Day + Night trên cùng sheet |
| Sprite Pokémon (Arceus, mẫu duy nhất) | 2 | ❌ 192 px, không phải pixel art | ❌ khoảng 140 000 màu mỗi sheet | ❌ | ✅ (nền magenta) | — |

Ghi chú:
- Lỗi lệch BGR555 rất dễ sửa: chỉ cần snap mỗi kênh về `v & 0xF8`. Mắt gần như không thấy khác biệt.
- Alpha bán trong suốt trên props chủ yếu nằm ở bóng đổ mờ. Gen 3 vẽ bóng bằng pixel đặc, hoặc dùng sprite bóng riêng (`SHADOW_S/M/L`).

## Đánh giá theo nhóm (kết hợp đo và nhìn)

### 1. Sprite Pokémon: lệch nặng nhất ❌
- Asset hiện tại là sheet 192 px, 8 hướng, đi bộ và đứng. Hình là ảnh vẽ/render mịn, không phải pixel art, và có hàng trăm nghìn màu.
- Gen 3 dùng battle sprite front/back **64×64**, tối đa **15 màu + 1 màu trong suốt**, và icon **32×32** 2 frame. Pokémon không đi theo trên overworld; chỉ một vài con xuất hiện như object event 32×32.
- Kết luận: cần pipeline mới (64×64 front/back, 32×32 icon), chứ không phải chỉnh lại sheet hiện có.

### 2. Công trình (gym): sai tỷ lệ và sai triết lý thiết kế ❌
- Ngoại thất gym ở kích thước gốc là **192×192 px = 12×12 metatile** mỗi phiên bản. Màn hình Gen 3 chỉ có 15×10 metatile, nên một gym sẽ chiếm gần trọn màn hình.
- Phong cách đang dùng (núi lửa trên mái, dung nham, ống khói, nhiều đạo cụ, nhiều tông tối) đến từ quy tắc "Signature Silhouette Rule" trong `AGENTS.md`. Gym Gen 3 thì ngược lại: hộp đơn giản, mái phẳng, biển hiệu, và chủ đề hệ chỉ thể hiện ở **nội thất**. *(Mô tả bằng mắt, nguồn văn bản chưa xác minh. Footprint chuẩn chưa xác minh.)*
- Nội thất (lưới 16 px, top-down, mỗi ô ≤15 màu) **gần Gen 3 nhất** trong cả repo. Chỉ cần snap BGR555 và giảm độ chi tiết của sàn.
- Cửa 4 frame khớp với chuẩn Gen 3 (1 frame đóng + 3 frame mở).

### 3. Overworld tiles và props: gần đúng về kỹ thuật, lệch về cảm giác ⚠️
- Đạt: lưới 16 px, ít màu, viền tối 1 px, autotile nước/bờ/vách. Nước 8 frame, hoa động.
- Lệch:
  - Bản đêm `-night` và đèn phát sáng: Gen 3 **không có ngày/đêm**.
  - Bóng mờ alpha trên props.
  - Màu chưa snap BGR555.
  - Bảng màu và hình khối mang chất "indie pixel art" hiện đại: cây tròn một khối, cỏ phẳng ít hoa văn. Cây Gen 3 có tán nhiều tầng, cỏ có chùm lá lặp. *(Mục này đánh giá bằng mắt, nên đối chiếu `tiles.png` trong `pret/pokeemerald/data/tilesets/primary/general/`.)*
  - Chưa ghép thành tileset thật với giới hạn **≤13 palette, ≤1024 tile**. Hiện tại mỗi autotile là một sheet riêng.

## Cập nhật 2026-11-17: structure đã chuyển sang chuẩn Gen 3

Skill `pokemon-structure-generator` đã được làm lại theo chuẩn Gen 3 và 8 gym đã render lại.

| Hạng mục | Trước | Sau |
|---|---|---|
| Kích thước | ~9.5×10 metatile | canvas 8×8, thân rộng 6 metatile như gym Emerald 6×5 |
| Số màu | 39–52 | 19–28 |
| Palette | ~59 | 5–6 |
| Màu theo BGR555 | ❌ | ✅ |
| Alpha | có bán trong suốt | chỉ 0 hoặc 255 |
| Cửa | 8 ảnh nguyên tòa nhà | dải cửa kiểu pret |
| Bản đêm | luôn có | tùy chọn (`--night`) |

`check_gen3.py` cho kết quả `ok` trên toàn bộ ngoại thất và nội thất.

Các mục 2 (sprite Pokémon) và 5 (overworld) bên dưới chưa làm.

## Thứ tự ưu tiên đề xuất

1. **Quyết định chọn RSE hay FRLG.** Hai bản khác nhau về giới hạn tileset (512/6 so với 640/7) và về tông màu. Mọi chỉnh sửa tiếp theo đều phụ thuộc vào lựa chọn này.
2. **Sprite Pokémon:** làm pipeline mới 64×64 / 32×32, ≤15 màu.
3. **Gym exterior:** viết lại quy tắc trong `AGENTS.md` và skill structure theo kiểu nhà hộp Gen 3. Thu footprint về khoảng 6–8 metatile (ước tính, cần đối chiếu).
4. **Hậu xử lý hàng loạt cho mọi PNG:**
   - Snap về BGR555.
   - Alpha nhị phân (0 hoặc 255).
   - Bỏ toàn bộ `-night` và glow.
5. **Restyle overworld bằng mắt:** cây, cỏ và bảng màu, theo tileset pret làm mẫu.
