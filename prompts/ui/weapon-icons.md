# Prompt ảnh vũ khí

Dùng ImageGen tích hợp với mỗi panel 3 cột, 2 hàng. Mỗi ô chứa đúng một vũ khí hoàn chỉnh, chừa mép trong suốt hoặc dùng màu khóa `#FF00FF` đồng nhất. Góc chéo hướng lên phải. Giữ rõ chất liệu thép, gỗ và dây quấn ở kích thước 64 px gốc. Dùng cụm pixel 16-bit, ánh sáng trên trái và đường viền rõ. Để phần đệm giữa các ô trống.

| Panel | Hàng trên | Hàng dưới |
| --- | --- | --- |
| `guards` | Kiếm mảnh chuôi dây leo, bút sơn vàng, búa than hồng | Cung băng, hai đao lưỡi liềm đồng, trượng san hô ngọc trai |
| `legends` | Liềm sao tím, thương cánh lửa, roi xích biển sâu | Đại kiếm mặt trời, kiếm băng lam, trượng quỹ đạo |
| `field` | Kiếm sắt thô, kiếm thép răng cưa, kiếm vàng cong | Thương xanh, đao tím, kiếm sẫm khắc ấn |
| `families` | Cung gỗ, trượng thạch anh, hai dao đồng | Rìu nâu cán gỗ, lưỡi hái thép, thương sắt |

Bản nguồn nằm ở `database-astral-expedition/art-source/ui/weapons/`. Chạy `py tools/expedition/export_weapon_icons.py` để xuất hình đúng ID và ghi manifest.
