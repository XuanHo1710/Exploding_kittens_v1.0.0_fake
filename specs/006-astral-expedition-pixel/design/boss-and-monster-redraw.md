# Vẽ lại boss và quái trong các slot cũ

Atlas dùng ảnh chiến đấu Lâm Phong làm tham chiếu mật độ pixel, chất liệu và độ rõ của tư thế. Boss và quái nhìn chéo từ trước xuống trái. Giữ nguyên ID, đường dẫn, số hàng, số cột và kích thước ô để khâu ghép end-to-end đọc đúng các frame hiện có.

| ID boss | Tạo hình và động tác đặc trưng |
|---|---|
| `sylvan_warden` | Hộ vệ cổ mộc với thân người khổng lồ bằng gỗ. Rễ và lá theo chuyển động hông. Hai bàn tay mở rõ khi quét. |
| `boreal_chevalier` | Kỵ sĩ băng, giáp lam, hai tay bám cán thương ở hai điểm thấy được khi lấy đà và quét. |
| `chronos_khepri` | Pharaoh trưởng thành, vai khoác vải chàm, tay nắm trượng thời gian và tay kia tạo ấn. |
| `leviathan_sovereign` | Hải xà với vảy xếp lớp và mào san hô. Thân cuộn tạo lực cho cú cắn, đuôi quét theo sau. |
| `vulcan_titan` | Người khổng lồ mặc giáp rèn, hai tay giữ búa nặng, gối và hông hạ khi búa chạm xuống. |
| `nocturne_weaver` | Thân trên người trưởng thành kết hợp bụng và chân nhện có khớp. Tua trước thăm dò trước khi quét. |
| `astral_painter_seraphina` | Nữ vương tầm vóc lớn với cánh lăng kính và cọ kiếm. Giữ cọ trong tay trước khi đổi lực và thu thế. |

Cột trái qua phải là sáu frame theo thời gian. Sáu hàng boss lần lượt là thở, liên kích, quét nặng, thức tỉnh, vỡ thế và gục. Ô 256×256 px. Rà lại tay, khớp, điểm tựa, toàn bộ đầu vũ khí và chân ở các khung xoay mạnh.

| Slot giữ nguyên | Tạo hình quái chiến đấu |
|---|---|
| `chicken` | Cockatrice gai, mỏ móc, vuốt chân sau và đuôi bò sát. |
| `cow` | Mãnh thú sừng lưng bazan, vai lớn, phiến đá phủ rêu. |
| `desert_camel` | Quái cát cổ dài, hàm bò sát và chitin vàng dọc lưng. |
| `horse` | Kỵ thú bóng đêm bốn chân, đầu xương sẫm, giáp obsidian. |
| `mountain_goat` | Ma thú sừng băng, chân móng chịu lực khi húc. |
| `rabbit` | Thú gai chân dài, nanh và tai kéo dài như gai rễ. |
| `red_fox` | Hồ ly lửa, mảng vảy cam ở đuôi, lao bằng bốn chân. |
| `reef_crab` | Quái giáp san hô, càng móc và chân khớp rõ. |
| `sea_turtle` | Quái mai nhọn có hàm ngoạm, cổ vươn trước khi tấn công. |
| `sheep` | Quái sừng cuộn, lông sẫm cài gai rêu, đòn húc nén vai trước. |
| `snow_owl` | Quái điểu băng, cánh có khớp và vuốt dưới đà vồ. |
| `wild_boar` | Quái nanh dài với bờm dựng và giáp xương dọc vai. |

Các slot trong `units/animals/` mang loại `monster` ở catalog hình. Sheet chiến đấu có bốn hàng thở, vồ, choáng và gục, mỗi hàng sáu ô 192×192 px. Sheet di chuyển có sáu ô 64×64 px theo bốn hướng xuống, trái, phải, lên. Dùng bảng màu và đặc điểm nhận diện chung giữa hai sheet.

Ảnh ImageGen gốc và sheet đã chuẩn hóa nằm trong `database-astral-expedition/art-source/motion/redraw/`. Bước nhập kiểm tra đủ frame, vùng trong suốt và đường biên trước khi ghi vào tên file đã có. Bản dựng tiếp theo ưu tiên sheet đã nhập. Khi thêm sheet khác, dùng `py tools/expedition/import_unit_art.py <id> <battle|movement> <raw.png> --metadata`.

## Prompt ImageGen tích hợp

- **Boss** dùng chi tiết riêng trong bảng kèm quy tắc “Strict 6 columns × 6 rows, 36 isolated full-body sprites, flat chroma magenta #FF00FF, FRONT three-quarter facing lower-left, locked design and scale. Rows breathing guard, timed combo, heavy sweep, phase awakening, stagger, defeat. Keep hands, weapons and extremities inside each cell. No labels, floor or VFX.” Bản Boreal dùng góc thu ngắn hình chiếu của cây thương để chứa nguyên đầu và cán trong frame quét.
- **Quái chiến đấu** dùng “Strict 6 columns × 4 rows of the same creature, full body, classic textured 16-bit pixel art, lower-left front three-quarter, chroma magenta. Rows idle breathing, crouch and lunge, recoil, collapse. Show anatomy and weight through consecutive poses.”
- **Quái di chuyển** tham chiếu sheet chiến đấu đã tạo và dùng “Exact six columns × four rows, six sequential locomotion drawings per direction, DOWN front, LEFT profile, RIGHT profile, UP rear. Lock silhouette, material and creature anatomy from the reference. Clean chroma magenta and padding around all poses.”
