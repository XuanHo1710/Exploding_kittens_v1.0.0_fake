# Cảnh quan Đồng Cỏ và trạm lửa

Đồng Cỏ dùng chín mảnh cảnh quan tại 82 vị trí trên bản đồ 120×76 ô. Cầu đá đánh dấu ba chốt bắc qua sông. Bến gỗ và lau sậy bám bờ, thác và lá súng nằm trên nước, tường phế tích nằm trên vách đá. Dòng nước có gợn sáng theo nhịp khi khám phá.

Lớp `landscape` của Tiled lưu vị trí các mảnh cảnh quan. Renderer dùng tọa độ chân để sắp cỏ, lau, thân gỗ và tường cùng nhân vật. Ô cỏ cao có lớp tiền cảnh che chân cả đội trưởng và quái đang đi trên cỏ. Va chạm và tương tác dùng các lớp gameplay hiện có của map.

Trạm lửa dùng bệ bát giác ba bậc, ấn vàng, chậu than và hai cột đuốc. Mỗi lửa có pha riêng trên cùng một dải tám khung 128×128 px. Gốc sprite ổn định suốt vòng lặp để vị trí bấm nghỉ khớp công trình. Dải chung được dùng bởi cả bảy vùng.

- File game nằm tại `structures/meadow/waterworks.png` và `structures/rest-bonfire/rest-bonfire.png` trong `database-astral-expedition`.
- Ảnh nguồn vẽ bằng ImageGen được lưu trong `art-source/structures`. [Prompt và lệnh xuất](../../../prompts/structure/README.md)
- Trình dựng map đọc tọa độ đàn quái từ bảng `WILD_SPOTS`. BFS kiểm tra có đường tới các bãi quái và không thể đi vòng qua chốt đang đóng. Túi địa hình đi bộ tách rời được tô thành mép rừng.
- Hai atlas đạt kiểm tra BGR555 và alpha nhị phân với giới hạn 6 palette. Build client và server đạt. Kiểm thử Expedition đạt 27/27.
- Edge ở 1440×900 xác nhận vẽ gợn nước, hai lan can cầu, cỏ phủ chân và lửa trại. Đi từ cỏ tới trạm rồi bấm E mở màn nghỉ có dùng đúng atlas mới. [Cảnh trong game](meadow-waterworks-preview.jpg) · [Màn nghỉ](meadow-rest-preview.png)
