# Luật và bộ bài riêng cho từng phòng

Bấm **Tạo phòng** để chọn luật trước khi tạo mã phòng. Có bốn bộ mẫu: **Cân bằng**, **Ván nhanh**, **Căng thẳng** và **Luật cũ**. Chỉnh một giá trị bất kỳ sẽ chuyển thành bộ luật tùy chỉnh. Tùy chọn ghi nhớ lưu lựa chọn trên trình duyệt để dùng lần tạo phòng sau.

Trong phòng chờ, mọi người xem cùng bản luật và số lượng bài do server xác nhận. Chỉ chủ phòng được sửa. Người chơi khác bấm **Đồng ý luật & sẵn sàng**; đổi luật hoặc mức cược sẽ hủy xác nhận cũ. Server không cho bắt đầu và không trừ cược khi chưa đủ người xác nhận, bộ bài thiếu bài chia hoặc không đủ xu. Luật được khóa khi ván bắt đầu. Chơi lại giữ bộ luật nhưng yêu cầu xác nhận lại.

## Có thể tùy chỉnh

| Phần | Lựa chọn |
|---|---|
| Người chơi | 2–10 chỗ; chủ phòng hoặc người ngẫu nhiên đi trước |
| Tay bài đầu | 1–12 lá thường và 0–3 Gỡ Bom mỗi người |
| Gỡ Bom trong chồng rút | Thêm 0–20 lá sau khi chia, ngoài số đã phát riêng |
| Mèo Nổ | Số người − 1, bằng số người, hoặc số cố định 1–30 |
| Số lượng từng loại bài | 0–40 lá; 0 để bỏ loại đó; tối đa 300 lá thường |
| Combo | Bật/tắt đôi, ba và 5 lá khác loại; đôi/ba chỉ mèo hoặc mọi loại bài cùng tên |
| Tấn Công | Cộng toàn bộ lượt tấn công còn nợ + 2, hoặc đặt lại đúng 2 lượt |
| Nope | Cho phép hoặc cấm Nope lại Nope |
| Xem Trước | 1–5 lá trên cùng, không vượt số lá còn trong chồng |
| Nhét bom sau gỡ | Người chơi chọn vị trí hoặc server đặt ngẫu nhiên |
| Thời gian | Lượt 15–180 giây, Nope 1–10 giây, chọn bài/nhét bom 10–90 giây |

Các số lượng trên áp dụng cho những loại bài đã có logic trong game: Mèo Nổ, Gỡ Bom, Tấn Công, Bỏ Lượt, Xin Bài, Xáo Bài, Xem Trước, Nope và năm loại mèo thường. Ảnh lá bài không tự bổ sung hiệu ứng mở rộng. Khi mô tả in trên ảnh khác cấu hình, dùng luật phòng đã chốt; phần phóng to lá và **Luật phòng** hiển thị hiệu ứng hiện tại.

## Chia bài và giới hạn

Server xáo các lá thường đã chọn rồi chia đủ số bài thường cho từng người, phát Gỡ Bom riêng, sau đó mới thêm Gỡ Bom dư và Mèo Nổ vào chồng rút. Tay bài đầu không chứa Mèo Nổ.

Phần xem trước tính bộ bài cho số người dự kiến: tổng bài, bài được chia và số lá còn trong chồng rút. Khi người chơi thực tế nhiều hơn, chủ phòng có thể cần tăng bài hoặc giảm tay bài đầu. Server kiểm tra lại ngay trước khi trừ xu và chia bài; không tự tăng số lá ngoài cấu hình đã chốt.

Số bom cố định cần ít nhất **số người chơi − 1** để ván có thể loại đủ người. Ví dụ, 1 bom hợp lệ cho 2 người nhưng không bắt đầu được với 3 người. Không giảm số chỗ thấp hơn số người đang có mặt trong phòng.

## Những tình huống dễ nhầm

- **Bỏ Lượt** kết thúc một lượt. Khi đang nợ nhiều lượt do Tấn Công, vẫn phải chơi số lượt còn lại.
- **Tấn Công cộng dồn:** đang nợ 1 lượt tấn công rồi đánh Tấn Công thì người sau nhận 3 lượt. Một lượt thông thường không tính là lượt nợ.
- **Nope:** mỗi lần Nope hợp lệ mở lại cửa sổ chờ theo thời gian phòng. Nếu cấm Nope lại, hành động chỉ nhận tối đa một Nope. Không Nope Mèo Nổ, Gỡ Bom hoặc việc rút bài.
- **Combo đôi/ba mọi loại:** có thể dùng các lá chức năng, Nope hoặc Gỡ Bom cùng loại thay cho hiệu ứng thông thường của chúng. Mèo Nổ không dùng làm combo.
- **Combo 5 lá:** chọn từ chồng bài bỏ đã có trước khi đánh combo; không lấy lại chính lá vừa dùng trong bộ năm.
- **Hết giờ:** tự rút bài; khi chờ cho bài hoặc chọn chỗ nhét bom thì chọn ngẫu nhiên. Sau khi xử lý hiệu ứng, lượt được giữ ít nhất 20 giây hoặc bằng thời gian lượt nếu phòng đặt thấp hơn 20 giây.
- **Thông tin riêng:** người khác chỉ thấy số lá trên tay; Xem Trước vẫn chỉ gửi cho người dùng lá đó. Vị trí nhét bom không được công khai.

## Chỗ sửa trong source

- `shared/src/room-rules.ts`: cấu hình, preset, giới hạn, tóm tắt và nhận diện combo dùng chung.
- `server/src/game/game.ts`: chia bài, xác nhận và thực thi luật.
- `client/src/components/RoomSettings.tsx`: màn chỉnh luật, xem trước bộ bài và ghi nhớ lựa chọn.
- `room:create`, `room:rules`, `room:ready`: sự kiện tạo phòng, sửa luật và xác nhận phiên bản luật. Server kiểm tra các dữ liệu này, không tin cấu hình chỉ vì giao diện đã kiểm tra.

Luật của phòng nằm trong RAM cùng ván chơi; không lưu vào file tài khoản Google Drive. Sở thích tạo phòng của từng trình duyệt nằm trong localStorage.
