# Thiết kế động tác nhân vật và boss

Feature đang hoạt động là `006-astral-expedition-pixel`. Các sheet trong thư mục thiết kế dùng để duyệt động tác trước khi đóng gói. [Plan](../plan.md) · [Hợp đồng asset](../contracts/asset-pipeline.md) · [Đầu việc T015, T027, T034 và T040](../tasks.md)

## Đối chiếu với hình hiện tại

Trong `render_boss_battle_sheet`, Seraphina có cọ kiếm vẽ bằng một đoạn thẳng xuất phát từ thân áo. Khi góc đoạn thẳng thay đổi, người xem thiếu dấu hiệu cho biết vai nào đang chịu lực hoặc bàn tay nào đang giữ cán. Trong `render_gatekeeper_sheets`, sói dùng cùng khối ngực và hai chân chữ nhật với các loài khác. Ở bản di chuyển, vòng lặp đọc hướng nhưng phần vẽ không sử dụng hướng ấy. Đây là ba điểm cần kiểm tra bằng mắt khi so bản mới với bản đang dùng. [Bộ dựng sprite](../../../tools/expedition/pixel_sprites.py)

| Nhân vật | Góc máy và vùng an toàn | Dấu hiệu nhận diện khi tắt hiệu ứng |
|---|---|---|
| Lâm Phong · `gustave_blade` | Lưng chéo lên phải, 160 trong ô 192 px | Kiếm mảnh, súng ma đạo ở hông, tà áo xanh tách khỏi chân. Vai xa vẫn hiện khi cánh tay gần duỗi ra. |
| Seraphina · `astral_painter_seraphina` | Mặt chéo xuống trái, 216 trong ô 256 px | Dáng người trưởng thành khổng lồ, vương miện bảy sao, cánh lăng kính và cọ kiếm. Chừa khoảng âm giữa khuỷu và eo. |
| Phong Lang · `gale_wolf` | Mặt chéo xuống trái, 160 trong ô 192 px | Mõm dài, ngực sâu, hông hẹp, khuỷu chân trước và cổ chân sau phân biệt được. Đuôi cân bằng thân khi tiếp đất. |

Kích thước đầu, chiều dài cẳng tay, hình cán và trang phục phải nhất quán suốt một hàng. Với Seraphina, thể hiện tầm vóc bằng tương quan với platform, thời gian dừng ở điểm thấp và độ trễ của vạt áo. Hai ảnh orientation trong prompt chỉ xác định hướng sân khấu. [Prompt chiến đấu](../../../prompts/battle/README.md) · [Dữ liệu nhân vật](../../../data/expedition/heroes.json) · [Dữ liệu boss](../../../data/expedition/bosses.json)

## Sáu hình khóa để duyệt

| Frame | Lâm Phong · động tác lao kiếm | Seraphina · một nét cọ kiếm | Phong Lang · bật nhảy |
|---|---|---|---|
| 1 | Đứng thủ, thấy cổ tay bên kiếm và khoảng hở dưới khuỷu | Hai bàn tay hiện trên cán, mũi cọ tạo đường chéo dễ đọc | Hạ vai và hướng mõm nhìn vào điểm đáp |
| 2 | Hạ hông, chân sau chịu lực, vai trước hạ nhẹ | Hông hạ xuống, hai khuỷu gập với góc khác nhau | Thu chân sau dưới hông, đuôi nâng |
| 3 | Bước mở, tà áo còn trễ sau lưng | Nâng cọ, cổ tay đi cùng cán, vạt áo theo sau | Thân duỗi, cả bốn chân rời đất |
| 4 | Chân trước nhận lực, đường vai theo tay kiếm | Vai xoay theo hông, mũi cọ đi qua điểm phát sao | Một chân trước chạm trước, vai bên ấy hạ |
| 5 | Hãm đà, khuỷu mềm trở lại | Thân thấp, cọ đi quá điểm phát, đầu vẫn nhìn mục tiêu | Chân sau thu về dưới bụng, lưng co |
| 6 | Thu chân về thế có thể nối sang thủ | Nâng ngực, đưa cán về gần thân, áo lắng sau | Trọng lượng phân bố lại trên bốn chân |

Với `sera_starblade`, ba luồng sao có mốc 390, 680 và 970 ms tính từ đầu chiêu. Khi dựng thử, đọc hình chuẩn bị trước mốc đầu, dùng ba lần nhấn nét cọ để phát sao và giữ hình thu về sau mốc cuối. Một hàng động tác có sáu hình nguồn có thể giữ hoặc phát lại đoạn hình theo timeline. Đặt điểm phát hiệu ứng ở đầu cọ tại từng nhịp. Xem lại cả khi tắt VFX lẫn khi ghép CAST/EFFECT, giữ cổ tay và hướng cọ rõ ở thời điểm người chơi cần phản ứng.

## Từ hình khóa đến sheet đầy đủ

- **Anh hùng** có sáu hàng chiến đấu theo thứ tự thở, đánh, dùng kỹ năng, đỡ phản kích, né, trúng đòn/ngã. Mỗi hàng sáu frame. Ở overworld, tách idle và walk, mỗi vòng có bốn hướng xuống, trái, phải, lên. Khi đổi hướng, kiếm vẫn nằm đúng tay. [Skill chiến đấu](../../../.agents/skills/expedition-battle-poses/SKILL.md) · [Skill di chuyển](../../../.agents/skills/expedition-sprite-generator/SKILL.md)
- **Boss** có sáu hàng thở, liên kích, quét nặng, chuyển phase, vỡ thế và gục. Hàng gục cần ba điểm tựa liên tiếp có thể thấy được, từ hai bàn chân xuống đầu gối rồi xuống hông. Khi vỡ thế, cánh và vương miện nghiêng theo thân, cọ vẫn nối với tay đến frame buông.
- **Quái gác cổng** có bốn hàng chiến đấu, sáu frame mỗi hàng. Với sói, dựng bốn chân ở khung nghiêng trước khi tô lông. Trong vòng tuần tra, kiểm tra cặp chân bị khuất riêng ở cả hai hướng ngang. [Prompt di chuyển](../../../prompts/movement/README.md)
- **VFX** dùng tám frame CAST và tám frame EFFECT. Duyệt hai chiều trên nền trận, giữ lề trong ô ít nhất 2 px và kết thúc hiệu ứng đúng khi sang lượt báo đòn. [Skill VFX](../../../.agents/skills/expedition-skill-vfx/SKILL.md) · [Skill review](../../../.agents/skills/expedition-skill-review/SKILL.md)

## Kiểm tra khi xuất

Đặt cạnh nhau silhouette của sáu frame ở kích thước chơi thật. Đánh dấu gót chân chịu tải, khuỷu, cổ tay và điểm bàn tay gặp cán. Khi bàn chân đã đặt xuống, xem riêng đường gót để phát hiện trượt. So tỷ lệ đầu với thân qua các hình cúi và đứng. Duyệt nhịp thật, sau đó xem chậm để tìm frame bị đổi tay, cọ xuyên áo, chi bị thừa hoặc mất. Bảng màu BGR555, alpha nhị phân, nearest-neighbor và vùng an toàn được kiểm riêng. [Công cụ Gen 3](../../../tools/gen3/check_gen3.py)

CLI hiện tại của `normalize_sheet.py` áp dụng `--frames` và `--keep-x` cho chế độ `move4 --layout loop`. Chế độ `posses` đọc tám cột. Cần kiểm tra cách tách hàng trước khi đưa sheet boss sáu cột vào công cụ này. `build_bundle.py` dựng lại sprite, vì vậy chỉ đưa bản mỹ thuật vào bundle khi pipeline đã nhận đúng nguồn hình được duyệt. [Normalizer](../../../tools/units/normalize_sheet.py) · [Công cụ đóng gói](../../../tools/expedition/build_bundle.py)
