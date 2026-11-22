# Jung SSS · Mẫu tóc gợn chạm vai

Jung có tóc đen gợn xoăn chạm vai, mái rủ nhẹ, áo khoác đen để mở, sơ mi trắng trơn và bốt đen. Chân dung dùng ánh sáng hổ phách trên tóc và giữ tông lạnh ở áo. Ba bộ ảnh dùng cùng một trang phục và thanh Hanbit Katana. ID trong game là `jung_afterglow`.

| Tài nguyên trong `database-astral-expedition/units/heroes/` | Kích thước | Bố cục |
| --- | --- | --- |
| `jung_afterglow-battle.png` | 1152×1152 | 36 frame. Chờ, đánh, thi triển, đỡ phản công, né, trúng đòn và gục. |
| `jung_afterglow-movement.png` | 384×512 | 48 frame chờ và đi. Thứ tự mỗi vòng là xuống, trái, phải, lên. |
| `jung_afterglow-portrait.png` | 128×128 | Chân dung có bảng màu BGR555 giữ riêng tông da, áo và tóc. |

Khi di chuyển, Jung được vẽ ở kích thước 72×72 thay cho 64×64. Sân chiến đấu phóng tạo hình thêm 12%. Điểm chân giữ nguyên để khớp bóng đổ và mặt sàn. Khung ảnh nguồn giữ đúng kích thước mà game dùng để cắt frame.

## Nguồn ảnh và cách xuất

Dùng ImageGen tích hợp với hai ảnh đời thực làm mẫu cho tóc và nét mặt. Chân dung cũ và chân dung Lyra làm mẫu về phong cách pixel, ánh sáng và cỡ khung. Atlas chiến đấu cũ làm mẫu cho hướng camera và thứ tự động tác. Các prompt theo từng loại ảnh nằm trong [gói prompt của Jung](../../../prompts/units/heroes/jung-afterglow-wavy.md).

Bản gốc và bản chuẩn hóa nằm ở `database-astral-expedition/art-source/motion/redraw`. Bản `art-source/units/heroes` đồng bộ qua importer. Dùng `py tools/expedition/import_unit_art.py jung_afterglow <battle|movement|portrait> <ảnh nguồn> --metadata` để thay từng loại và cập nhật manifest.

## Kiểm chứng

Kiểm đủ 84 frame với đúng lưới, alpha nhị phân và bảng màu BGR555. Edge WebGL đã mở hồ sơ, vẽ Jung 72×72 khi chờ và đi, rồi tải atlas mới vào trận gặp Lộc Giác. Build client và server đạt. Kiểm thử Expedition đạt 30/30. Kiểm tra toàn gói còn báo màu và alpha ở asset công trình Aurora `structures/aurora/monuments.png`. [Xem trọn bộ ảnh](jung-afterglow-art-preview.png) · [Xem trong trận](jung-afterglow-in-battle.png)
