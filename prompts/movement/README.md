# Multi-Frame Overworld Movement Sheet Prompt (`prompts/movement/README.md`)

Được sử dụng bởi `.agents/skills/expedition-sprite-generator` cho **Anh Hùng đại diện trên bản đồ** và **Quái Gác Cổng tuần tra** trong **Astral Expedition Pixel**.

Atlas di chuyển vẽ riêng của Lâm Phong nằm tại `database-astral-expedition/art-source/motion/gustave-movement.png`.

Các yêu cầu vẽ theo roster dùng prompt trong `prompts/units/` và lưu bản gốc từ AGY trong `database-astral-expedition/art-source/agy-units/`.

Khi vẽ lại đội viễn chinh, dùng sheet chiến đấu đã duyệt làm tham chiếu trang phục, tóc và bảng màu. Các lựa chọn trang phục giữ thứ tự đứng trước, đi sau và thứ tự bốn hướng.

## Bố cục Chuẩn Nhiều Frame (`6 Frame × 4 Hướng / Loop`)

- Mỗi vòng chuyển động (`idle` đứng thở tại chỗ, `walk` bước đi tuần tra/khám phá) là lưới **6 cột × 4 hàng = 24 frame**; ghép `idle` + `walk` tạo thành **48 frame** mượt mà cho mỗi Anh Hùng.
- Thứ tự 4 hàng hướng nhìn cố định:
  - `Row 1 (DOWN)`: Nhìn thẳng về phía người chơi.
  - `Row 2 (LEFT)`: Nhìn ngang sang trái.
  - `Row 3 (RIGHT)`: Nhìn ngang sang phải (giữ đúng bên cầm vũ khí bất đối xứng).
  - `Row 4 (UP)`: Nhìn từ phía sau bước lên trên.

## COMMON + LOOP Prompt Block

```text
Pixel art overworld movement sprite sheet of the Expedition Hero / Gatekeeper Monster shown in the FIRST attached image, seen in a top-down 3/4 RPG camera.
LAYOUT: 6 columns x 4 rows of equal square cells (Row 1 DOWN, Row 2 LEFT, Row 3 RIGHT, Row 4 UP).
PROPORTIONS: True RPG proportions matching the reference design — NEVER chibi, NEVER oversized head. Crisp 1-pixel dark outline (#1b1726), 4-5 tone shading, top-left light, strict square pixel grid, NO blur, NO anti-aliasing.
<LOOP = idle>: 6-frame continuous breathing, cloak/hair sway and weapon poise planted on a steady baseline.
<LOOP = walk>: 6-frame smooth stride cycle (left contact -> passing -> right contact -> passing -> subtle secondary cloak/weapon follow-through), clearly distinct in every frame.
BACKGROUND: Pure flat #FF00FF everywhere with generous margin inside the 80% centred safe box; no text, no grid lines.
```

## Chuẩn hóa sau khi vẽ

```powershell
py tools/units/normalize_sheet.py --mode move4 --layout loop --frames 6 --input tmp/raw-move.jpg --output database-astral-expedition/units/heroes/<hero_id>-movement.png
```
