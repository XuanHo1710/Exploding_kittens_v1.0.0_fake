# Chuẩn pixel cho Quần đảo Chuông Gió

Nền theo góc nhìn nhích xuống khoảng 18°. Kịch tính đến từ khoảng cách, ánh sáng và màu đồng ở cảnh xa. Vùng đặt chân thấp hơn các landmark, dùng tương phản vừa phải để viền sprite nổi rõ. Đảo Đồng cỏ xanh xám, Sa mạc cam đất, Ban đêm chàm bạc, Dưới nước lam lục và Núi lửa tím tro. Tất cả ảnh nền là tranh concept 16:9. Dữ liệu lane, cửa và điểm xuất phát trong catalog là lớp layout của bản duyệt.

## Sprite, kỹ năng và hiệu ứng

- Nhân vật và quái dùng ô 48×48, chân 24,44. Boss dùng ô 80×80, chân 40,74. Viền một pixel màu `#181423`, source alpha nhị phân, nearest-neighbor. Dùng dải ngang không padding giữa ô. Trang duyệt thấy mặt phải và runtime dự kiến lật quanh chân cho mặt trái.
- Tướng có 15 pose theo thứ tự `idle, idle-rise, walk-a, walk-b, walk-c, windup, strike-a, strike-b, strike-c, cast, release, dash, guard, hit, down`. Boss dùng cùng danh sách. Quái 11 pose theo thứ tự `idle, idle-rise, walk-a, walk-b, windup, strike-a, release, dash, guard, hit, down`.
- Idle luân phiên 260/240 ms, walk 3 pose ở 90 ms/pose (quái 2 pose 120 ms/pose), combo dùng windup 140 ms, strike 100 ms, recovery 220 ms theo từng đòn. Skill dùng `phasesMs` của actor, vị trí VFX khởi phát ở tay hoặc chân theo mẫu và release phát cùng timing active phía server. Hit dùng pose hit tối đa 120 ms. Down giữ pose đến hết attempt. Chuyển động ở trang duyệt dùng 140 ms/pose để dễ soi.
- Arden dùng cung kiếm vàng đồng, Linnet vệt mũi tên sắc, Vesper nhát cắt tím, Brann đất vỡ, Maëlle vòng lục lam, Solen ngọn giáo chẻ. Các hiệu ứng có 8 frame trong strip 64×64, alpha nhị phân, dùng lại với nhịp và hồi kết khác nhau cho ứng dụng tuyệt kỹ. Hỗ trợ giảm chuyển động, tránh flash toàn màn hình và giữ telegraph hoa văn ở layer trên. Preview có ba sơ đồ telegraph của trùm.
- SFX định hướng bằng âm kiếm khô, nốt dây cung cao, tiếng nước thoáng, tiếng búa trầm và chuông mỗi lần trùm đổi pha. Nhạc nền để khoảng trống cho âm khóa làn. Bản duyệt phát hình, SFX thuộc pha sản xuất.

## Prompt nền đã dùng

Công cụ tích hợp ImageGen. Prompt chung cho Đồng cỏ và Sa mạc yêu cầu sân beat-em-up 2.5D pixel fantasy nguyên bản, khung ngang 16:9, camera nhìn xuống ~18°, nền phân lớp, sàn combat phẳng tương đối dịu chi tiết chiếm 61–92% chiều cao, hai mép sàn thoáng, hậu cảnh có đồng cổ và ánh sáng sân khấu. Ảnh chỉ gồm cảnh.

- **Đồng cỏ** · Bình minh trên vách đá ven biển, xanh sage và pine. Cổ thụ uốn bên trái, cổng gió bằng đồng đổ bên phải, thềm sandstone phẳng phủ rêu nhẹ. Hồ sơ yêu cầu hoa hồng dại sau sân, đảo xa tím và biển tĩnh.
- **Sa mạc** · Bờ mesa cát đỏ, dãy tháp sandstone bậc xa, đồng hồ nước cao bằng đá vỡ bên phải, ánh chiều màu sienna và mauve, thềm cát cứng thoáng.

Prompt chung cho ba ảnh sau yêu cầu sân 16:9 full bleed, brawler nhìn chéo 18°, đá và đồng thiên văn cổ làm mô-típ nối đảo, sàn mờ từ 66–91% chiều cao và chi tiết tiền cảnh dưới 92%.

- **Ban đêm** · Rừng chàm dưới trăng lưỡi liềm, đài quan sát bằng đồng vỡ, đèn hổ phách ngoài sân và lối đá phiến ít chi tiết.
- **Dưới nước** · Đài chìm dưới mặt biển, tia sáng ngọc lam, vành kinh tuyến giữa vỏ sò và san hô hậu cảnh, thềm đá vôi phẳng và thoáng.
- **Núi lửa** · Miệng chảo núi lửa ven biển, dãy bazan bậc, cổng lò đồng sụp, thác dung nham đỏ ở hậu cảnh, mặt sàn xám lạnh pha tím.

Các sprite và VFX được vẽ theo hình học raster gốc bằng [build-art.py](build-art.py).
