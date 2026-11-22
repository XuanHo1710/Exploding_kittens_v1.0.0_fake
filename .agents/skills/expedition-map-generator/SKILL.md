---
name: expedition-map-generator
description: >-
  Lắp ghép, kiểm lỗi đường đi (BFS solver) và xuất bản đồ Tiled .tmj cho 7 vùng đất khám phá nối tiếp của Astral Expedition Pixel (Đồng Cỏ -> Tuyết -> Sa Mạc -> Dưới Nước -> Núi Lửa -> Ban Đêm -> Quang Phổ Mây Trời Ban Đêm) kèm vị trí Cờ Trạm Nghỉ, rương báu, 20 chốt Quái Gác Cổng và cổng Đại Trùm. Kích hoạt khi yêu cầu tạo map, ghép map, kiểm tra lỗi kẹt đường hoặc xuất .tmj.
---

# Expedition 7-Realm Map Assembler & Gatekeeper Path Linter

Định dạng đặc tả bản đồ: [references/spec.md](./references/spec.md). Từ điển: [GLOSSARY.md](../../../GLOSSARY.md) (`RealmMap`, `RestAnchor`, `Gatekeeper`, `Boss`).

## Quy Trình 4 Bước

1. **Xác định `RealmMap` & Chủ đề**: Chọn 1 trong 7 mã bản đồ chính thức (`01-dawn-meadow` đến `07-aurora-zenith`) cùng bộ mảnh từ [expedition-overworld-generator](../expedition-overworld-generator/SKILL.md) và công trình từ [expedition-structure-generator](../expedition-structure-generator/SKILL.md).
2. **Thiết kế Bố cục & Chốt Gác Cổng**:
   - Đặt điểm xuất phát (`spawn`), các Cờ Trạm Nghỉ (`RestAnchor`), rương `astralSeal`, `2–3` chốt `Gatekeeper` chặn đúng nút cổ chai dẫn tới bệ `Boss` và cổng sang vùng tiếp theo.
   - Đảm bảo mọi `RestAnchor` cách vùng `aggroRadius` của `Gatekeeper` tối thiểu **`6 ô`** để không bao giờ gây kẹt lặp khi hồi sinh.
3. **Xuất `.tmj` & Kiểm Định Tự Động**:
   - Xuất tệp `.tmj` kèm lớp địa hình động `8 frame` vào `database-astral-expedition/maps/<map_id>/`.
   - Chạy bộ giải đường đi BFS xác nhận: từ `spawn` đi tới được mọi `RestAnchor`, mọi rương, mọi chốt `Gatekeeper`, bệ `Boss` và cổng kết thúc với **`0` điểm kẹt địa hình** và **`0` lỗi hở mép nối**.
4. **Báo cáo**: Liệt kê kích thước bản đồ, số lượng `Gatekeeper`, số rương và kết quả kiểm định.

Với bundle hiện hành, `tools/expedition/pixel_worlds.py` xuất địa hình thành lớp đầu tiên của TMJ, kèm lớp điểm mốc cho Tiled. Kiểm tra cả đường đi khi mở hết cổng và từng trường hợp chỉ đóng một chốt để phát hiện đường lách qua địa hình.

Lớp `traversal` của Chapter 1 dùng đối tượng điểm với loại `ladder`, `grip` hoặc `rope` và tọa độ đáp `toX`, `toY`. Bộ giải đường kiểm tra luôn liên kết này khi đóng từng chốt.

Bộ giải kiểm tra kết nối đường bộ khi đã mở chốt trước khi kiểm tra liên kết vượt địa hình. Trạm nghỉ cần bốn ô liền kề đi được và mọi đầu đáp cần có lối đi bộ. Các mảng nền lẻ chưa nối đường được đổi thành địa hình chắn.

Đồng Cỏ có lớp điểm `landscape` do `tools/expedition/meadow_landscape.py` đặt dựa trên ô đi được, bờ nước và vách đá của TMJ. Cầu đá đặt tại ô chốt hiện hữu. Lớp này dùng để vẽ cảnh quan; kiểm tra va chạm đọc lớp `ground`.
