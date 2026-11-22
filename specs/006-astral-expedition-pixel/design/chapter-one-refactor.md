# Chapter 1 · Map và chiến đấu

Bản chơi mở toàn màn. Bản đồ nhỏ ở dưới trái. Khi đứng đủ gần một điểm tương tác hoặc đàn quái, phím E thực hiện hành động tại đó. Đường chính của Chapter 1 dài qua ba chốt và đến cổng Sylvan Warden. Bản đồ 72×38 ô dùng chung dữ liệu va chạm Tiled. Có ba rương, hai trạm nghỉ và năm đàn quái tùy chọn. Mục tiêu thời lượng 10–15 phút tính cả khám phá, chọn kỹ năng và các trận. Mốc này cần đo thêm với người chơi.

Esc mở Sảnh, Túi đồ, Bản đồ, Triệu Hồi và Setting. Sảnh xếp tối đa bốn nhân vật chính và bốn dự bị. Tab Bản đồ chứa Nhật ký trong phần có thể mở. Tab Túi đồ có bộ sưu tập bùa và số lượng vật phẩm dùng trong trận. Setting áp dụng bố cục phím, âm thanh và độ khó.

Trong trận, chọn Đánh thường, Kỹ năng hoặc Túi đồ. Đòn thường trả một AP. Kỹ năng dùng tối đa sáu ô đã cấu hình, có ảnh cắt từ hiệu ứng nguyên tố và màu theo chi phí AP. Dùng E để đỡ và Space để né trong lúc xem động tác của địch. Đòn cận chiến áp sát mục tiêu theo nhịp. Đỡ đủ nhịp mới phản kích, tính theo ATK. Lượt địch có đòn bốn và năm nhịp bên cạnh buff, hồi và đánh mục tiêu riêng.

Vật phẩm trong trận là bình máu, tinh thể +3 AP và ấn hồi sinh. Số lượng và mục tiêu được xác thực lúc replay. Server chỉ cấp thưởng sau khi xác nhận kết quả. Khi cả đội chính ngã, đội dự bị vào sân một lần.

Icon bùa và vật phẩm dùng atlas `ui/charm-icons.png`. Bùa có bảo hiểm rơi ở quái nhỏ và ngưỡng hiếm cao hơn ở boss. Tàn Quang chỉ thuộc pool boss. Cơ chế khiên một đòn và hồi sinh có trạng thái riêng với giáp theo HP. Tên ngắn thay phần hiển thị. ID và đường dẫn hình giữ nguyên.

Ảnh vật liệu ImageGen nguồn nằm trong `database-astral-expedition/art-source/overworld/material-atlas-source.png`. Bản nền được ghép theo Tiled bằng `py tools/expedition/export_overworld_terrain.py`. Dùng `py tools/expedition/export_charm_icons.py` để xuất lại icon.

Kiểm thử Edge 1440×900 tạo hồ sơ mới, mở năm tab bằng Esc, mở một nút cây kỹ năng, tới đàn quái, bấm E để vào trận, mở kỹ năng có icon, dùng tinh thể AP và thắng trận có phản ứng qua E/Space. Kiểm thử engine xác nhận đội dự bị, hồi sinh, sáu ô kỹ năng, phản kích theo ATK và chỉ phản kích sau đủ năm nhịp đỡ. [Toàn cảnh map](chapter-one-evidence/06-field-fullscreen.png) · [Giao diện chiến đấu](chapter-one-evidence/07-battle-fullscreen.png) · [Đỡ và né](chapter-one-evidence/08-defense-no-ring.png) · [Kết quả](chapter-one-evidence/09-battle-reward.png)
