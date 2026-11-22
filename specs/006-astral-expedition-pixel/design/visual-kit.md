# Công trình, HUD và hiệu ứng kỹ năng

Đợt vẽ này dùng nền mực tím, đồng xước, đá và ánh sáng theo từng vùng để nối với texture của đấu trường. [Công trình](landmarks-preview.png) · [HUD và tinh cầu](hud-preview.png) · [VFX trên nền trận](skill-vfx-preview.png)

## Công trình

Bộ ảnh có 7 cặp cờ trạm nghỉ và cổng. Mỗi sprite xuất 4 ô 128×128 px, nền trong suốt, điểm tiếp đất ổn định. Cờ dùng cùng dáng trụ qua các frame và đổi điểm sáng. Cổng dùng một ô đóng và ba ô mở, phần năng lượng nằm trong lòng vòm.

| Vùng | Trạm nghỉ | Cổng |
|---|---|---|
| Đồng Cỏ | Tượng đá phủ rêu, cờ xanh | Vòm đá cổ có phù điêu |
| Tuyết | Tuyết đọng trên mái và bậc đá | Vòm đá lam có tinh thể băng |
| Sa Mạc | Cờ mặt trời và bình đất | Trụ sa thạch chạm khắc |
| Thủy Cung | Bệ xanh với san hô hồng | Cổng đền chìm có huy hiệu vỏ sò |
| Núi Lửa | Bậc bazan và hai chậu lửa | Vòm nứt rực cạnh đá |
| Ban Đêm | Cờ tím, rễ tối và nấm lam | Vòm nguyệt có rễ quấn |
| Quang Phổ | Bệ cao có thạch anh và cờ lam | Cổng pha lê tím viền vàng |

Game hiện dùng hai đường dẫn công trình chung, được xuất từ bộ Đồng Cỏ. Các biến thể đặt tại `structures/<theme>/` có thể duyệt riêng theo vùng. Atlas nguồn ImageGen được lưu trong database. [Atlas nguồn](../../../database-astral-expedition/art-source/structures/landmark-atlas-source.png)

## Bộ giao diện

`hud-kit.png` giữ kích thước 256×64 px gồm khung vát góc, ngọc AP đầy, ngọc AP rỗng và vòng nhịp. `combat-kit.png` 288×192 px bổ sung sáu icon hệ, bốn thanh trạng thái phân đoạn, thẻ kỹ năng thường/đang chọn/bị khóa và huy hiệu phản xạ. Tinh cầu có mặt cắt pha lê, lõi phát sáng và vòng đồng xoay, giữ atlas gacha 1024×768 px. Khung là asset giao diện. Các thành phần React hiện có vẫn tự vẽ menu và bố cục.

Tọa độ dưới đây tính tại độ phân giải PNG, từ góc trên trái.

| Thành phần | Vị trí cắt |
|---|---|
| Khung, AP đầy, AP rỗng, vòng nhịp | 4 ô 64×64 px theo chiều ngang trong `hud-kit.png` |
| Sáu icon nguyên tố | 6 ô 48×48 px tại hàng 0, theo thứ tự Verdant, Frost, Solar, Tide, Pyre, Astral |
| Thanh trạng thái | Dải x 0–109 px, bốn hàng bắt đầu ở y 52, 84, 116, 148 px |
| Thẻ kỹ năng | Dải x 118–287 px, ba hàng bắt đầu ở y 52, 84, 116 px |
| Huy hiệu phản xạ | Tâm x 152, 206, 258 px, hàng y 152–189 px |

## VFX

Các đường dẫn hiện có giữ cấu trúc `<element>_<style>-cast.png` và `-effect.png`. Ba mươi cặp bao phủ sáu hệ nhân năm kiểu đòn. Mỗi strip gồm tám ô 96×96 px theo thứ tự ngang.

- **CAST** — Vệt ấn ngắt đoạn và hạt nguyên tố tụ vào nhân vật. Gió dùng lá, băng dùng mảnh tinh thể, quang dùng tia sao, nước dùng bọt, lửa dùng tàn và tinh tú dùng giao điểm sao.
- **EFFECT** — Bốn frame đầu cho hướng chém, tia, thiên thạch, sóng hoặc ấn. Bốn frame sau có hình va chạm đặc trưng và thưa dần. Mép hiệu ứng có vùng đệm từ 2 px. Nét mảnh và khoảng hở giúp đọc hình nhân vật.
- **Đối chiếu** — Bản ghép đặt CAST và EFFECT trên nền thật, lật ngang EFFECT để kiểm tra chiều còn lại. Trình render hiện vẽ lớp chữ báo đòn trên lớp skill. Các ảnh ghép không đo tỷ lệ che lấp trực tiếp trong trận.

Lệnh xuất riêng là `py tools/expedition/export_visual_kit.py --preview specs/006-astral-expedition-pixel/design`. Chạy kiểm định kích thước, khung an toàn từng frame và Gen 3 cho cả ba nhóm asset khi xuất.
