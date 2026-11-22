# Expedition Skill VFX Prompts (`prompts/skills/README.md`)

Được sử dụng bởi `.agents/skills/expedition-skill-vfx` cho **60 Kỹ năng Anh Hùng** (trên `VerticalSkillMenu`) và hệ thống đòn đánh đa giai đoạn của **Quái Gác Cổng & 7 Đại Trùm**.

## Cấu trúc 2 Dải Hiệu Ứng (`16 Frame / Kỹ Năng`) + Tia Năng Lượng Code

| # | Dải Ảnh | Nội Dung Hiển Thị | Đường Dẫn Xuất Bản |
|---|---------|-------------------|--------------------|
| 1 | **`CAST` (`8 frame`, lưới `4×2`)** | Hiệu ứng tụ lực, ấn ký nguyên tố, vòng sáng quanh vũ khí người thi triển (khớp thời điểm xuất hiện vòng `TimedHit`). | `database-astral-expedition/vfx/skills/<skill_id>-cast.png` |
| 2 | **`EFFECT` (`8 frame`, lưới `4×2`)** | Frame `1–4`: đường đạn/lưỡi kiếm khí bay sang phải · Frame `5–8`: vụ nổ va chạm trên mục tiêu (tự lật chiều khi phe Địch/Trùm tấn công). | `database-astral-expedition/vfx/skills/<skill_id>-effect.png` |

## 6 Bảng Màu Nguyên Tố Chủ Đạo

Ưu tiên hình hạt dễ nhận ra và hạn chế mảng đục đặc: lá gió, mảnh băng, tia nắng, bọt nước, tàn lửa và giao điểm sao. Mỗi kiểu đòn có đường bay lẫn hình va chạm riêng.

- `Verdant` (Phong/Mộc — Đồng Cỏ): Ngọc lục bảo, lá gió sáng, viền xanh rừng đậm.
- `Frost` (Băng — Tuyết): Lam băng, lục lam sắc cạnh, tâm trắng tinh thể.
- `Solar` (Cát/Quang — Sa Mạc): Vàng kim nhật thực, hổ phách, tia trắng rực.
- `Tide` (Thủy — Dưới Nước): Lam đại dương, bọt ngọc bích, ánh lân tinh sâu thẳm.
- `Pyre` (Hỏa — Núi Lửa): Đỏ dung nham, cam rực, lõi vàng trắng.
- `Astral` (Tinh Tú/Quang Phổ — Ban Đêm & Đỉnh Quang Phổ): Tím vĩnh dạ, lam thiên hà và dải cực quang đa sắc (dùng `#00FF00` làm nền tách thay vì `#FF00FF` cho hiệu ứng tím/hồng).

## COMMON Block (`4×2` = 8 Frames)

```text
16-bit / Gen-3 pixel art combat VFX sprite sheet for Astral Expedition Pixel: 8 animation frames laid out as a 4x2 grid (frames 1-4 top row, 5-8 bottom row), centred in each cell with >= 4px safety margin so NO pixel is clipped at cell borders.
Crisp square pixels, <= 15 BGR555 colours, 1px dark outline (#18182a) on solid shards/slashes, zero blur, zero anti-aliasing, zero soft gradients, readable without obscuring Boss telegraph silhouettes.
Background: solid flat #FF00FF (or #00FF00 for Astral violet/pink VFX), no characters, no UI, no text.
```
