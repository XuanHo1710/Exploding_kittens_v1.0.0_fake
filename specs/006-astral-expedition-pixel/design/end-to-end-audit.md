# Kiểm định luồng chơi Astral Expedition

## Kết quả và sửa chữa

| Luồng | Kết quả đối chiếu |
|---|---|
| Hình nhân vật | Đối chiếu 12 ID Anh Hùng, ba bộ trang phục và bảy boss với file thực tế, kích thước atlas và SHA-256. Renderer đọc đường dẫn sprite của từng combatant. Ba bộ trang phục có thể chọn trong Đội Hình và dùng ảnh riêng trong di chuyển lẫn chiến đấu. Chọn trang phục áp dụng trong phiên hiện tại. |
| Quái nhỏ | Màn hình chính xử lý tín hiệu chạm đàn quái, nạp ảnh di chuyển và ảnh chiến đấu theo đúng thư mục. Cả 12 mẫu trong thư mục tương thích `animals` xuất hiện trong các đàn quái. Mỗi đàn có ô xuất phát đi được trên Tiled. Sau trận thắng, đàn ẩn theo thời gian hồi đã khai báo ở client. |
| Chiến đấu | Hàng đợi theo tốc độ, AP, phá thế, khắc hệ, hiệu ứng cộng dồn, Cộng Hưởng và hành vi đối thủ đã có trong engine. Giao diện dùng chi phí AP, hệ và số nhịp thực tế sau khi áp Cây Kỹ Năng hoặc bùa. Đòn hỗ trợ của địch không mở vòng Đỡ/Né. Hướng và màu VFX đọc từ bên thi triển. |
| Tiến trình | Đội Hình mở Cây Kỹ Năng, chọn nhánh theo cấp và điểm SP, trang bị Bùa Hộ Mệnh và tính chỉ số đã cộng bùa. Có màn bộ sưu tập và phần thưởng bùa ở bảng kết quả. Phụ kiện thường dùng nhãn riêng. |
| Cốt truyện | Nối mở đầu, cảnh vào vùng, trước boss, sau boss và hồi kết vào màn hình chơi. Nhật ký cho xem lại cảnh đã mở. Server kiểm tra điều kiện của cảnh. Cổng chỉ đi tới vùng liền kề theo catalog và theo boss đã hạ. |
| Khôi phục trận | Server giữ cùng trận khi gửi lại yêu cầu mở một trận đang diễn ra. Client tải lại phiên đang có sau mất kết nối. Khi quyết toán, lưu biên nhận cùng hồ sơ trước khi xóa phiên và trả cùng biên nhận khi retry, tránh cộng lại phần thưởng. |

## Bằng chứng

Kiểm thử service bắt đầu từ hồ sơ mới, vượt 20 chốt và 7 boss theo thứ tự, qua cổng và ghi nhận đủ 22 cảnh. Phần mở lại trận và gửi lại kết quả dùng cùng mã trận. Mô phỏng dùng QTE chuẩn và chọn kỹ năng theo AP cùng hệ khắc chế. Đây là xác nhận luồng replay và tiến trình qua bảy vùng.

Kiểm thử Edge 1440×900 dùng backend tài khoản và hồ sơ riêng. Qua luồng đăng ký, vào phòng, mở đầu, hiện chương Đồng Cỏ, lên Lv.2 và dùng SP mở nút, mở bộ bùa, xem nhật ký, đổi trang phục Vệ Binh Than, chạm quái và nhận kết quả trận được server xác nhận. [Mở đầu](audit-evidence/01-prologue.png) · [Cây kỹ năng](audit-evidence/02-skill-tree.png) · [Kết quả trận](audit-evidence/04-battle-reward.png)

## Giới hạn xác nhận

Phạm vi trình duyệt đi đến trận quái đầu ở Đồng Cỏ. Phần còn lại của chiến dịch được xác nhận ở service bằng bộ chơi theo luật. Tỷ lệ thắng của người chơi thật cần playtest thêm. Engine server hiện phát lại nhật ký hành động và xác thực kết quả, còn thời điểm nhấn QTE được chấm tại trình duyệt. Chọn trang phục hiện theo phiên trên client. Dốc, bám và lao vẫn nằm ở sân thử riêng.
