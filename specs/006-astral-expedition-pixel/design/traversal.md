# Dốc, bậc và điểm bám trên 7 vùng

Mỗi vùng có atlas **32 ô**, gồm tám loại ký hiệu ở bốn hướng Bắc, Đông, Nam, Tây. Ô gốc 16×16 xuất 2×. Tệp TSJ ghi tên loại và hướng trên từng ô. Bảy sân thử TMJ đều ghép địa hình đang dùng với atlas mới. [Bản thử điều khiển](traversal-demo.html) · [Atlas và bản đồ Tiled](../../../database-astral-expedition/overworld/traversal/)

| Vùng | Vật liệu dốc và bậc | Viền báo điểm bám |
|---|---|---|
| Đồng Cỏ | Đá sa thạch lẫn rêu | Rêu lục sáng quanh mép đá |
| Tuyết | Băng lam có tuyết bám | Rìa trắng lạnh |
| Sa Mạc | Sa thạch với đường xói mòn | Mép nắng vàng |
| Thủy Cung | Đá chìm màu lam và cụm san hô | Rìa ngọc |
| Núi Lửa | Bazan sẫm xen vết nóng | Vệt cam cạnh bậc |
| Ban Đêm | Phiến đá tím và hạt phát quang | Tím nhạt |
| Quang Phổ | Phiến pha lê nhiều mặt | Lam ngọc và gờ tím |

| Loại ô | Dấu hiệu hình học | Hành vi |
|---|---|---|
| `ramp-up` | Mũi hướng lên dốc, vân nghiêng | Tăng độ cao liên tục theo quãng đi |
| `ramp-down` | Mũi hướng xuống, vân ngược | Hạ độ cao liên tục |
| `stairs` | Bốn mặt bậc sáng và đậm xen nhau | Đổi cao độ từng bậc; mở đường hai chiều |
| `takeoff` | Mũi nhọn tại mép | Space + mũi tên đúng hướng bắt đầu nhảy |
| `grip` | Ba dấu ngang quanh mép bậc | Đáp bàn tay vào mép, dùng Space + mũi tên để leo hoặc quay lại |
| `landing` | Khung vuông | Ô đặt chân sau khi leo |
| `dash-start` | Ấn hình thoi có mũi hướng | E lao theo liên kết đến điểm đã khai báo |
| `dash-target` | Ấn hình thoi có lõi tròn | Điểm đáp và điểm quay lại của đường hai chiều |

## Điều khiển và ràng buộc đề xuất

- Lối đi thường dùng độ cao của ô nền. Phần thân nhô lên theo cao độ, bóng chân ở mặt sàn. Khi bám, chân hạ xuống và hoạt ảnh giữ tay ở mép. Bản thử dùng sprite di chuyển để thử phím và cao độ, tư thế bám riêng thuộc bộ hình động tác tiếp theo.
- Luồng đề xuất gồm `grounded → jumping → hanging → mantling → grounded`. Nhảy bám kéo dài 360 ms, leo mép 260 ms. Lao dài 240 ms theo đích cố định. Nhấn phím trong lúc đang chuyển trạng thái không tạo thêm lần cất cánh.
- Điểm bám có mũi hướng và màu cạnh. Hướng đáp khai báo trên liên kết, cho phép xem từ vị trí xuất phát. Đích bị chiếm hoặc không hợp lệ thì giữ người chơi tại ô xuất phát.
- Dùng E để lao khi đứng trên ấn và liên kết khả dụng. Ở ngoài ấn, E giữ tác dụng tương tác của game. Khi ấn và điểm tương tác gần nhau, gắn nhãn hành động cụ thể và ưu tiên đúng đối tượng ở ngay dưới chân.
- Người chơi không bị phạt khi nhấn sai hướng. Vực, nước sâu và dung nham chặn bước đi thường. Một liên kết vượt địa hình chỉ hoạt động giữa đúng hai ô đã khai báo. Hồi sinh và quay lại luôn có ô nền an toàn.
- Khi đưa vào vùng thật, đánh dấu cặp ô nguồn–đích, hướng, cao độ và khóa vùng. Chạy BFS trên đồ thị có thêm liên kết nhảy, bám và lao. Kiểm tra khi đóng lần lượt từng chốt để xác nhận các liên kết không tạo đường vượt cổng. Kiểm tra đường quay ngược hoặc lối bộ về khi đáp.

Sân thử là bố cục riêng 16×9, có đủ dốc lên, cầu thang, khe nhảy, mép bám, ấn lao và dốc xuống. Có thể đổi vùng để xem cùng một chuỗi với bảy vật liệu. Các điểm tương tác trên bản đồ đang chơi chưa được thay bằng đường vượt địa hình.
