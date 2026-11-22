# HUD hiệu ứng, bộ sưu tập và Triệu hồi

**Hiệu ứng chiến đấu.** Atlas `ui/status-icons.png` chứa 15 glyph pixel cho sáu hiệu ứng có lợi và chín hiệu ứng bất lợi. Thanh trên màu lục chỉ hiệu ứng có lợi. Thanh dưới màu hồng đỏ chỉ hiệu ứng bất lợi. Mỗi trạng thái có hình riêng. HUD hiển thị số lượt còn lại. Khi có nhiều tầng, số tầng nằm trước số lượt. Tooltip lấy tên và mô tả từ `STATUS_DEFS`. Sân đấu giữ một hàng ngắn cho từng đơn vị, còn HUD của mục tiêu và nhân vật đang hành động cho phép xem đầy đủ.

**Bùa Hộ Mệnh.** Bộ sưu tập giữ ảnh, tên và bậc trên từng ô. Bùa đã có đứng trước và có bộ lọc riêng. Chọn một ô để mở khung mô tả, vùng rơi, bậc và nhân vật đang đeo. Tỷ lệ rơi mở riêng trong khung. Tên dài có tối đa hai dòng trong ô và hiện đầy đủ ở khung đã chọn.

**Triệu hồi.** Header giữ Ấn Tinh Tú, Tinh Huy và Tinh Thể EXP trên cả banner lẫn trang công khai tỷ lệ. Số dư lấy từ hồ sơ hiện tại sau mỗi giao dịch. Người chơi chọn một trong ba banner Anh Hùng, Vũ Khí Trấn và Rương Thiên Văn. Banner giữ ảnh, đếm bảo hiểm và giá quay ngay cạnh thao tác. Lịch sử Anh Hùng có thể mở riêng.

**Kiểm chứng.** Edge WebGL hiển thị Tái Sinh từ bùa và Thiêu Đốt sau đòn thường. Bộ sưu tập chạy ở chiều rộng 700 và 1440 px. Header giảm đúng 120 Ấn Tinh Tú sau lượt quay Vũ Khí Trấn và giữ số dư khi mở tỷ lệ công khai. Kiểm thử Expedition đạt 30/30. [Chiến đấu](battle-status-refresh.png) · [Bộ sưu tập](charm-collection-refresh.png) · [Triệu hồi](summon-refresh.png)
