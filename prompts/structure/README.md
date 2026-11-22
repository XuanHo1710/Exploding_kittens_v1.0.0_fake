# Expedition Landmark & Rest Anchor Structure Prompt (`prompts/structure/README.md`)

Được sử dụng bởi `.agents/skills/expedition-structure-generator` để tạo các công trình **Signature Silhouette** trên 7 vùng bản đồ của **Astral Expedition Pixel**.

## Các Công Trình Cốt Lõi

- **RestAnchor (`expedition-flag-shrine`, `4×4` metatiles)**: Đài đá khắc số hiệu đoàn viễn chinh kèm lá cờ thám hiểm tung bay và ngọn đèn tinh tú sáng ấm.
- **Realm Warp Gate (`astral-archway`, `6×6` metatiles)**: Cổng vòm cổ đại chuyển tiếp giữa 7 vùng bản đồ, có lõi năng lượng mở sáng 4 frame khi hạ xong Trùm Khu Vực.
- **Boss Sanctum Entrance (`8×8` metatiles)**: Đài tế/cổng đại điện riêng cho từng vùng (Vòm Cổ Mộc, Điện Băng, Kim Tự Tháp Đồng Hồ Cát, Cổng Vực Thẳm, Lò Rèn Titan, Tháp Nguyệt Ảnh, Ngai Vàng Quang Phổ Đêm).

## Quy tắc Thiết kế

- Góc nhìn trực diện trên-xuống 3/4 đối xứng (`16×16` metatile xuất `×2`), vát cạnh 45°, ánh sáng trên-trái, viền `#1b1726`, màu `BGR555`, `≤ 6` bảng màu mỗi công trình, nền nháp `#FF00FF`, tuyệt đối không chứa chữ viết hay biểu tượng sao chép từ game khác.
Atlas cờ và cổng của bảy vùng dùng góc 3/4 từ trên cao. Giữ ổn định điểm tiếp đất và lòng vòm, xuất một khung đóng và ba khung sáng cho cổng.
Trạm nghỉ dùng hai cột lửa hổ phách đặt hai bên bếp lửa trung tâm. Giữ chân cột cố định, thay hình ngọn lửa theo tám frame và vẽ quầng sáng ấm gần mặt đất.

## Bờ suối Đồng Cỏ và trạm lửa mới

- **Prompt ImageGen cho trạm lửa** dùng atlas trạm cũ làm tham chiếu bố cục. Vẽ một bệ đá bát giác, ba bậc lát nứt, rêu, ấn vàng và ba chén than đỏ. Chừa vùng trời phía trên cho lửa. Góc nhìn 3/4, chất liệu pixel 16-bit, các mép trong suốt. Vẽ thân bệ và than, để exporter vẽ riêng tám nhịp lửa và tàn than.
- **Prompt ImageGen cho cảnh quan** dùng atlas 3×3 nền trong suốt. Hàng một gồm cầu đá phủ rêu, bến gỗ, cỏ cao. Hàng hai gồm lau sậy, đá suối, tường phế tích. Hàng ba gồm lá súng, thân gỗ đổ, thác nhỏ. Các mảnh tách nhau và cùng góc nhìn 3/4.
- Ảnh nguồn đặt tại `art-source/structures/rest-bonfire-v2-source.png` và `art-source/structures/meadow-waterworks-source.png`. Xuất bằng `export_bonfire.py` và `export_meadow_landscape.py` trong `tools/expedition/`.
