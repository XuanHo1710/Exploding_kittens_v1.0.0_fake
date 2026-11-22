# Camera chiến đấu và Quái Gác Cổng

## Camera chiến đấu

| Trạng thái | Góc nhìn |
| --- | --- |
| Vào trận | Góc rộng lấy cả đội và đội hình quái. |
| Chọn lệnh, kỹ năng, vật phẩm và mục tiêu | Camera từ sau vai nhân vật được chọn, thay đổi khoảng cách theo thao tác và giữ quái trong khung. |
| Ra đòn và phản kích | Camera bám chuyển động, dịch ngang ở cự ly gần để thấy tư thế ra đòn và phản ứng của mục tiêu. Độ cao nhảy tách khỏi chuyển động trên sàn. |
| Địch ra đòn | Camera nhìn qua nhân vật bị nhắm về phía kẻ tấn công. Tia lóe báo nhịp từng đòn; hiệu ứng vệt chém theo thời điểm va chạm. |

Camera Three.js dùng các sprite pixel đặt trong không gian 3D. Màn chiến đấu lấp đầy viewport desktop từ tỷ lệ 4:3. Chế độ giảm chuyển động dùng góc rộng cố định và tắt rung camera. Canvas 2D tiếp tục hoạt động nếu WebGL khởi tạo thất bại.

Three.js được nạp khi có trận 3D. Metadata atlas dùng chung với bước nạp texture sân đấu. Bộ đệm hiển thị giới hạn ở khoảng 2,35 triệu pixel. Các đạo cụ cùng frame dùng chung material.

## Tài nguyên

- Panorama Đồng Cỏ 2048×512 có tán cổ thụ, địa hình xa và tàn tích phủ rêu. Vùng nối hai mép được pha màu để chiếu quanh sân hình trụ.
- 20 Quái Gác Cổng khớp 7 biome. Mỗi quái có 24 frame chiến đấu (chờ, đánh, trúng đòn, gục) và 24 frame di chuyển (xuống, trái, phải, lên). Game dùng lại đường dẫn và kích thước 192×192 và 64×64 cho từng frame.
- Bản gốc nằm trong `art-source/battle-scenes/arena-meadow/` và `art-source/motion/gatekeeper-redraw/` của `database-astral-expedition/`.

[Xem các dáng của 20 Quái Gác Cổng](gatekeeper-redraw-preview.png)

## Kiểm chứng

- Edge WebGL ở 1440×900 đã vào trận Đồng Cỏ, tải panorama và sprite Lộc Giác, đổi qua chọn lệnh, kỹ năng, vật phẩm, ra đòn và phòng thủ. Đã chạy lại với tùy chọn giảm chuyển động. [Xem ảnh chụp trận đấu](combat-camera-preview.jpg)
- Kiểm đủ 960 frame, xác thực kích thước, BGR555, alpha nhị phân, mép ô và mã băm 40 sprite sheet. Trình kiểm gói tài nguyên xác nhận đủ 329 file.
- Build client và server thành công. Bộ kiểm thử Expedition chạy đạt 27/27.
