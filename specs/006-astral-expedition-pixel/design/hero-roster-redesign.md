# Đội viễn chinh và phiên bản trang phục

Đội hình dùng pixel fantasy 16-bit, giải phẫu người trưởng thành, vải dệt cũ, da và kim loại khắc. Giữ silhouette đủ rõ khi thu xuống ô overworld 64×64. Tên và ID bên dưới là khóa hiện hành của game.

| ID | Anh hùng | Dấu hiệu nhận diện | Chuyển động chính |
|---|---|---|---|
| `gustave_blade` | Lâm Phong | Áo dầu xanh ô-liu, khăn màu hổ phách, kiếm mảnh và súng holster | Chân sau tạo đà, lưỡi kiếm theo cẳng tay khi đâm |
| `celine_prism` | Minh Châu | Tóc hung buộc, áo ngà cổ vàng và túi đựng dụng cụ vẽ | Xoay cọ và cổ tay, tay trống đỡ thế |
| `bastian_aegis` | Thạch Sơn | Giáp chì xếp đốt và áo khoác đỏ gạch, khiên trụ | Hạ vai sau khi đón đòn, búa theo đà vai |
| `lyra_frostbow` | Băng Tâm | Tóc trắng bạc xõa dài tới giữa lưng, áo lam than, khăn tro và cung băng | Tay trái giữ cung, tay phải kéo dây, tóc theo quán tính ở nhịp thả |
| `kestrel_dune` | Sa Vũ | Tóc xoăn ngắn, áo vàng nghệ, thắt dải lam, đôi đao cong | Hai tay giao nhau khi chuyển thế rồi tách khi thu đòn |
| `nereus_tide` | Hải Đăng | Áo nhung xanh dầu, cổ khâu bạc, trượng kính biển | Đặt gót khi đổi lực, trượng đỡ khi chùng gối |
| `corvus_night` | Dạ Vũ | Mũ tím mực, đường khâu bạc, lưỡi hái thép | Đổi lực giữa hai tay dọc cán khi quét |
| `ignis_valkyrie` | Hồng Liên | Bím đồng, áo kỵ binh đỏ gụ, vai giáp vảy đồng | Hạ trọng tâm và duỗi thương theo bước |
| `marina_abyss` | Lam Ngọc | Tóc xanh đêm, áo hải hành và đai roi thép | Cổ tay dẫn quỹ đạo roi, thân chùng khi thu dây |
| `aurelia_eclipse` | Nhật Hạ | Tóc vàng, giáp đen viền cổ kim, dải vai đỏ garnet | Giữ hai tay trên đại kiếm, xoay hông trước vai |
| `seraph_glacier` | Hàn Thiên | Tóc trắng ngắn, giáp thép sáng trên áo xanh xám, khiên nhỏ | Che người bằng khiên trái rồi phản công bằng kiếm phải |
| `lumina_chrono` | Tinh Hà | Tóc nâu hồng, áo mận, vai đồng lệch và trượng tinh bàn | Chuyển trượng khi khóa thế, áo lắng sau khi dừng |

Băng Tâm dùng tóc màu trắng ngà, phần bóng tro lam. Tóc xõa dài tới giữa lưng để nhìn thấy ở góc chiến đấu từ phía sau. Áo nền xanh đậm tách silhouette, ống tên lệch một bên để vẫn đọc được chiều dài tóc.

## Trang phục thay thế

| Khóa | Nhân vật | Tạo hình |
|---|---|---|
| `charcoal-watch` | Lâm Phong | Áo khoác than hai hàng khuy, nẹp vai bạc, khăn đỏ rượu và lớp lót kẻ xám |
| `ivory-recon` | Băng Tâm | Áo dạ ngà, da vai xám lam, găng xanh ngọc và tóc trắng có lớp bóng tro để tách khỏi áo |
| `violet-atelier` | Minh Châu | Áo tím mận phối hồng cổ, cổ tay đồng và đai dụng cụ sẫm |

Khóa trang phục tham chiếu ID nhân vật gốc. Danh sách chiêu, vũ khí, nhịp và chỉ số lấy từ nhân vật gốc. Game có thể đọc riêng tài sản trang phục từ `units/heroes/variants/` khi tích hợp lựa chọn ngoại hình.

## Quy cách vẽ

ImageGen dùng ảnh chiến đấu Lâm Phong làm tham chiếu độ sắc nét, mật độ texture, góc lưng chéo lên phải và lực ở tư thế. Battle là lưới 6×6 đúng thứ tự thở, đánh, dùng kỹ năng, phản đòn, né và ngã. Movement là 6×8, bốn hàng đứng và bốn hàng đi theo hướng xuống, trái, phải, lên. Portrait cắt ô riêng 128 px. Prompt trang phục giữ mặt, tóc, vũ khí và thứ tự frame, chỉ thay quần áo và phụ kiện đã khai báo. Bản gốc đặt trong `database-astral-expedition/art-source/motion/redraw/`.
