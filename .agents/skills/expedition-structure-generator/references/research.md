# Structure Grid & Portal Timing Research (`expedition-structure-generator`)

Tham chiếu nền: [gen3-visual-style.md](../../../../docs/explanation/research/gen3-visual-style.md).

- **Đường chân công trình (`Ground Line`)**: Đặt tại hàng pixel cuối của hàng metatile áp chót (`y = canvas - 17` ở tỷ lệ gốc `1×`), dành hàng metatile dưới cùng cho bậc thềm và điểm đứng tương tác của người chơi.
- **Cổng động `4 Frame`**: Giữ mỗi frame `83 ms` (`0 → 1 → 2 → 3`) trước khi kích hoạt chuyển vùng `exp:warp_realm` hoặc bước vào đấu trường `Boss`.
- **Không gian màu & Silhouette**: Mọi công trình phải nhận diện được ngay bằng hình khối vương miện mái (crown silhouette) mà không cần treo biển chữ viết.
