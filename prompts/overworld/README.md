# Living Overworld Tile & Prop Prompt (`prompts/overworld/README.md`)

Được sử dụng bởi `.agents/skills/expedition-overworld-generator` để tạo bộ địa hình nối `47-tile blob autotile` và **dải địa hình/vật thể động `8 frame`** cho **7 vùng bản đồ (`RealmMap`)** của **Astral Expedition Pixel**.

## 7 Chủ Đề Vùng Đất (`Realm Themes`)

1. `meadow` (**Đồng Cỏ Khởi Nguyên**): Thảm cỏ ấm, suối trong 8 frame, hoa gió lay, tượng đá rêu.
2. `snow` (**Đỉnh Tuyết Vĩnh Cửu**): Tuyết trắng ánh lam, mặt băng phản chiếu 8 frame, tùng tuyết, tinh thể băng.
3. `desert` (**Sa Mạc Lãng Quên**): Cát vàng gợn sóng gió 8 frame, hồ ốc đảo ngọc, cột đá khắc cổ ngữ.
4. `underwater` (**Thủy Cung Thẳm Sâu**): Thềm đá đại dương, rặng san hô phát quang & bong bóng nước bay lên 8 frame.
5. `volcano` (**Miệng Núi Lửa Rực Cháy**): Đá bazan đen, dòng dung nham sôi 8 frame, khe hơi lửa phun nhịp nhàng.
6. `night` (**Vùng Ban Đêm Huyền Ảo**): Thảm cỏ đêm tím sẫm, hoa dạ quang nở sáng & đom đóm bay 8 frame.
7. `aurora` (**Quang Phổ Mây Trời Ban Đêm**): Thềm mây sao pha lê, cầu ánh sáng và dải cực quang 7 màu trôi mượt 8–12 frame.

## Quy chuẩn Pixel Gen 3

Các map Astral Expedition hiện hành dùng cùng tám ID địa hình trên mọi vùng. Mỗi vùng tự vẽ vật cản, nền và đường đi theo chủ đề. Atlas Tiled chứa thêm tám ô chuyển động cho nước, băng, dung nham hoặc vực mây. Đường chính uốn qua các chốt có sẵn, nhánh ngắn mở tới rương và Cờ Trạm Nghỉ.

Thêm chi tiết trên ô nền biến thể bằng cụm pixel nhỏ riêng cho mỗi chất liệu. Đường ván và đường lát đá đặt mạch lệch giữa các hàng. Giữ viền tile cùng nền để họa tiết nối liền trong game.

Với dốc và bậc, tách mặt trên sáng và mặt đứng tối để đọc được độ cao. Điểm bám dùng ba gờ ngang, điểm lao dùng ấn hình thoi và chỗ đáp dùng khung vuông. Lặp bộ ký hiệu ở bốn hướng và dùng chất liệu riêng theo vùng.

- Ô gốc `16×16 px` xuất `×2` (`32×32 px`), màu `BGR555`, alpha nhị phân `0/255`, `≤ 15` màu mỗi ô `8×8`, ánh sáng trên-trái, viền màu chọn lọc theo chất liệu (không viền đen cứng trên cỏ/cát).
- Các mảnh động xuất dải ngang **`8 frame`** (`200 ms/frame`) lặp hoàn hảo giữa frame 8 về frame 1.
