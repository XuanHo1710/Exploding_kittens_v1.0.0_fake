# Duyệt bản thiết kế

## Chơi bản đã tích hợp

Đăng nhập Arena Hub và chọn thẻ **Mighty Knight 2.5D Pixel**. Bấm **Chiến dịch · Quần đảo Chuông Gió**. Nếu đang ở lobby Mighty Knight, bấm **Chơi Chiến dịch Quần đảo Chuông Gió** để rời phòng và vào trại cá nhân. Bấm **Bắt đầu wave 1**. WASD di chuyển, J đánh, K kỹ năng, L đỡ, Shift né, Space đổi tướng, R tuyệt kỹ.

Tại trại, chọn tướng để phân điểm chỉ số, nâng rank hoặc dùng Crest. Tướng mở kỹ năng chủ động cấp 2 và tuyệt kỹ cấp 4. Rank 2 của kỹ năng chủ động có thể được nâng từ cấp 5. Có thể chơi lại wave đã thắng để kiếm XP. Tiến trình đã nhận lưu theo tài khoản.

## Duyệt asset riêng

1. Mở [trang duyệt](../../database-mighty-knight-pixel/campaign/index.html) từ hệ thống file.
2. Chọn năm tab đảo và bật **Hiện sơ đồ sân**. Kiểm tra điểm đặt chân chạm sàn, cửa vào nằm trong dải đánh được.
3. Chọn **Wave 1** → **Mô phỏng thắng**, thử nâng cấp với số Crest vừa nhận. Qua từng wave, tướng vừa tuyển xuất hiện trong trại. Dùng **Mô phỏng thua** khi wave mở để kiểm tra luồng thử lại.
4. Chọn tướng, quái và trùm. Chuyển các pose, sau đó bật **Phát chuyển động** để xem chu kỳ thử.
5. Từ repo chạy `python database-mighty-knight-pixel/campaign/validate-design.py` để kiểm tra PNG, vùng sân, đợt quái và tính nhất quán dữ liệu. `python database-mighty-knight-pixel/campaign/build-art.py` tái xuất sprite/VFX bằng Pillow khi workspace cho phép ghi.

Chạy `npm run build --prefix server` rồi `node --test server/test/mk-campaign.test.cjs server/test/mk-campaign-socket.test.cjs` để kiểm tra mô phỏng chiến đấu, nhận thưởng, nâng cấp đồng thời và kết nối lại. Kết quả kiểm định ghi tại [analysis.md](analysis.md).
