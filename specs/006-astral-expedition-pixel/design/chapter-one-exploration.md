# Chapter 1 · Trạm lửa, đường nhánh và chỉ định đòn

Map 120×76 ô, tương đương 3.840×2.432 px. Bốn khu có lối vòng theo hướng bắc, nam và qua hồ. Ba chốt cắt các khu theo thứ tự. Có bốn trạm nghỉ, sáu rương, tám đàn quái và sáu lối vượt địa hình hai chiều.

- **Leo thang** dùng hai ray gỗ bậc ngang và dấu nâu sáng. **Đu dây** dùng dây võng và trụ đầu mút màu lục. Cả hai dùng phím tương tác, mặc định là E.
- **Nhảy bám** dùng các gờ đá viền lam. Phím mặc định Space. Nhân vật đáp vào đầu còn lại theo link đã định trong Tiled.
- **Trạm nghỉ** có bếp lửa trung tâm và hai cột đuốc chuyển động tám frame. Minimap dùng dấu cam cho trạm và dấu xanh cho lối vượt địa hình.
- **Gặp quái** bắt đầu trận khi tiếp xúc trực tiếp. Va chạm kiểm tra địa hình giữa hai nhân vật, giữ chờ an toàn sau khi xuống đất hoặc vừa thoát trận.
- **Chọn người đánh** bằng chân dung hoặc phím Tab. Có thể chọn đồng đội còn sống có lượt trước đối thủ kế tiếp. Engine hoán đổi vị trí hai lượt và kiểm tra lại khi server replay. Chọn mục tiêu địch ở các thanh máu. Nếu đang mở Túi đồ, bấm chân dung để chọn người nhận.
- **Setting** cho đổi riêng bốn hướng, chạy, tương tác, nhảy bám, đỡ, né, đánh thường và chọn đồng đội kế tiếp. Có chặn phím trùng trong cùng ngữ cảnh và nút về mặc định. Lựa chọn lưu trên trình duyệt.

Bộ sinh map xác nhận tới được trạm, rương, boss, đàn quái và hai đầu của các link. Mô phỏng đóng từng chốt với cả đường bộ lẫn các link để kiểm tra không bỏ qua tiến trình.

Kiểm thử Edge xác nhận đổi Đỡ/Né thành F/K và thấy phím mới trong trận, chạm quái vào trận mà không bấm tương tác, chọn được đồng đội ra đòn và dùng thành công cả ba cách vượt địa hình với điểm đáp đúng trên minimap. Kiểm thử server cũng xác nhận từ chối chọn đồng đội sau lượt địch và vẫn cho phép tạo phòng Expedition một người. [Trạm lửa](exploration-evidence/10-bonfire-wide.png) · [Setting](exploration-evidence/11-new-bindings.png) · [Chọn người đánh](exploration-evidence/12-attacker-selected.png) · [Thang](exploration-evidence/crossing-ladder.png) · [Bám](exploration-evidence/crossing-grip.png) · [Dây](exploration-evidence/crossing-rope.png)
