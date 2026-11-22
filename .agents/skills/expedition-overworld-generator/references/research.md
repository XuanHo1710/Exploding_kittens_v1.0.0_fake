# Gen 3 Pixel Hardware & Autotile Research (`expedition-overworld-generator`)

Tài liệu nền tảng: [gen3-visual-style.md](../../../../docs/explanation/research/gen3-visual-style.md) và thư viện kiểm chuẩn [gen3.py](../../../../tools/gen3/gen3.py).

- **Metatile**: Tác tạo trên lưới `16×16 px` gốc, xuất `×2` với bộ lọc `NEAREST` thành `32×32 px`.
- **Không gian màu BGR555**: Mỗi kênh RGB lượng tử về 32 bậc cứng, alpha nhị phân `0` hoặc `255`, tối đa `15` màu trên mỗi ô `8×8 px`.
- **47-Tile Blob Autotile**: Sử dụng mặt nạ 8 hướng láng giềng (`N, NE, E, SE, S, SW, W, NW`) kèm hàm biên tuần hoàn `16 px` để mọi đường nối ngang, dọc, chữ T, chữ thập và hốc lõm khớp nhau tuyệt đối từng pixel.
- **Đồng bộ Hoạt ảnh Môi trường**: Toàn bộ dải động sử dụng chung chu kỳ `8 frame` (`200 ms/frame`) giúp mặt nước, dung nham, bong bóng và cực quang chuyển động nhịp nhàng ở `60 FPS`.
