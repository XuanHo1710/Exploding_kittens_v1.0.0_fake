# Vũ khí Trấn và Bùa Hộ Mệnh

## Ô bùa và hiệu ứng

| Cấp mở | 1 | 6 | 14 | 24 | 40 |
| --- | --- | --- | --- | --- | --- |
| Tổng số ô mỗi nhân vật | 1 | 2 | 3 | 4 | 5 |

Game kiểm tra giới hạn khi trang bị, khi đọc hồ sơ cũ và khi tính chỉ số. Atlas dùng 60 hình bùa và 3 hình vật phẩm chiến đấu. Bùa được trỏ chuột, bùa đang xem và bùa trong ô chọn có hoạt ảnh nhẹ theo thiết lập giảm chuyển động của hệ điều hành.

- **Tên Dội** thêm một Cộng Hưởng ở lần Đỡ đầu tiên trong lượt địch. **Khiên Gió** cấp giáp bằng 6% HP tối đa ở lần Né chủ động đầu tiên.
- **Mạch Nứt** và **Mạch Sét** cho 1 AP khi đánh mục tiêu đang Choáng Phá Thế hoặc trúng điểm yếu tương ứng. Mỗi hiệu ứng kích hoạt tối đa một lần mỗi hành động. **Bẻ Xích** hồi 6% HP tối đa khi gây Choáng Phá Thế, một lần mỗi hành động.
- **Dấu Mây** tăng tốc độ và Né tránh. **Đá Huyết** tăng HP và phản sát thương. **Cánh Tro** tăng sát thương lên địch đang Thiêu Đốt. **Nút Tâm** thêm phòng thủ và Tái Sinh đầu trận.

## Triệu hồi và nâng bậc

Mỗi nhân vật có một vũ khí Trấn khớp ID và loại vũ khí trong bộ hoạt ảnh. Vũ khí Trấn luôn vào ô `weapon` của chủ nhân. Chỉ số tấn công của vũ khí tăng theo cấp chủ nhân. Mỗi bậc tinh luyện thêm 8% chỉ số vũ khí.

Banner Vũ khí Trấn dùng 120 Ấn Tinh Tú/lượt và 1.200 Ấn/10 lượt. Tỷ lệ cơ bản là 70% Hiếm, 25% Sử Thi và 5% Huyền Thoại. Bảo hiểm riêng của banner là 10 lượt cho Sử Thi trở lên và 40 lượt cho Huyền Thoại. Trong mỗi độ hiếm, các món có xác suất bằng nhau.

- Bản trùng nhân vật cấp một mảnh riêng. Dùng một mảnh trong hồ sơ để lên một bậc Thức tỉnh tới A6. Bậc đã đạt trước bản cập nhật được giữ trong hồ sơ.
- Bản trùng vũ khí cấp một mảnh của món đó. Túi đồ và chi tiết trang bị có nút tinh luyện. Chi phí từ T1 lên T5 lần lượt là 1, 1, 2 và 2 mảnh. Bản trùng vượt số mảnh còn cần chuyển thành Tinh Huy.
- Server xử lý quay và nâng bậc theo hàng đợi của hồ sơ người chơi. Yêu cầu quay được ghi nhận cùng lần lưu kết quả. Nâng bậc kiểm tra bậc hiện tại và trừ mảnh trong cùng lần lưu.

## Hình và kiểm chứng

Ảnh bùa mới được đóng vào `database-astral-expedition/ui/charm-icons.png`. 24 ảnh vũ khí nằm trong `database-astral-expedition/ui/weapons`, gồm 12 vũ khí Trấn và 12 mẫu vũ khí thường. Ảnh nguồn ImageGen nằm trong `database-astral-expedition/art-source/ui`. Lệnh xuất được lưu trong [README công cụ](../../../tools/README.md).

Build client và server thành công, kiểm thử Expedition đạt 30/30. Kiểm thử Edge đã quay trong banner, dùng mảnh để tinh luyện, trang bị đúng chủ nhân, nâng Park lên A1 và kiểm tra năm ô bùa ở cấp 40. [Banner Vũ khí Trấn](weapon-banner-preview.png) · [Năm ô bùa](charm-slots-preview.png)
