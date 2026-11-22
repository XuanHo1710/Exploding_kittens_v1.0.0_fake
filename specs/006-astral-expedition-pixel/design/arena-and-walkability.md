# Đường đi và bộ cảnh Arena 3D

Bộ kiểm tra đường đi xác nhận cả bảy map nối được mọi ô đi bộ khi mở chốt và mỗi trạm có bốn hướng thoát. Điểm đáp của lối thang, bám và dây đều nằm trên đường bộ. Điểm lưu rơi vào địa hình chắn hoặc vùng bị cô lập được đưa về trạm đã mở có thể đi tới. Nếu trạm lưu nằm sau chốt chưa mở, nhân vật về điểm xuất phát của vùng và giữ tiến trình đã có.

| Tệp game | Kích thước | Dùng trong sân 3D |
|---|---:|---|
| `ground.png` | 256×256 | Ô đất lặp |
| `floor.png` | 512×512 | Lớp sàn trung tâm có viền trong suốt |
| `panorama.png` | 2048×512 | Cảnh xa quấn 360°, nối màu ở hai mép |
| `props.png` | 1024×768 | Sáu đạo cụ theo từng vùng |
| `props.json` | — | Khung cắt và chiều cao thế giới |

Đồng Cỏ giữ phần tranh đã có và đóng lại ảnh theo chuẩn. Sáu vùng mới dùng atlas ImageGen riêng cho panorama và đạo cụ. Mặt đất và sàn lấy chất liệu của từng vùng. Các PNG đã qua kiểm tra Gen 3 với alpha nhị phân. Kiểm tra Edge dùng một hồ sơ thử nghiệm có vị trí lưu ngay trong vách để xác nhận về được trạm và di chuyển tiếp. Trận Tuyết chạy WebGL và tải thành công cả năm tệp.

[Xem bảy bộ texture](arena-texture-preview.png) · [Phục hồi điểm kẹt trên Edge](arena-recovery-evidence/stuck-recovered.png) · [Sân Tuyết trong game](arena-recovery-evidence/snow-arena-3d.png)
