# Multi-Frame Diagonal Battle Sheet Prompt (`prompts/battle/README.md`)

Được sử dụng bởi `.agents/skills/expedition-battle-poses` và phát trong trận đấu 60 FPS của **Astral Expedition Pixel**.

Lưu bản vẽ theo prompt và atlas đã chuẩn hóa tại `database-astral-expedition/art-source/motion/` cho các nhân vật có atlas vẽ riêng.

Prompt theo từng nhân vật nằm ở `prompts/units/`. Khi dùng `agy_units.py`, ảnh thô được lưu theo từng phiên trong `database-astral-expedition/art-source/agy-units/`.

Bản vẽ lại giữ nguyên đường dẫn game và dùng ảnh Lâm Phong làm tham chiếu chất liệu, bảng màu và độ rõ động tác. Boss đổi sang góc trước chéo xuống trái. [Thiết kế từng boss và quái](../../specs/006-astral-expedition-pixel/design/boss-and-monster-redraw.md)

Thiết kế theo từng Anh Hùng và ba phương án trang phục nằm trong [Đội viễn chinh](../../specs/006-astral-expedition-pixel/design/hero-roster-redesign.md). Trong lượt vẽ Cast, giữ hai tay gắn đúng cổ tay, tay giữ vũ khí luôn ôm cán.

## Quy chuẩn Nhiều Frame Chân Thực (High-Frame Battle Standard)

Mỗi thực thể chiến đấu KHÔNG đứng đơ như tượng khi chờ người chơi chọn lệnh trên `VerticalSkillMenu`: hàng đầu tiên luôn là vòng lặp **`IDLE_BREATHE` 6 frame** (nhịp thở, áo choàng, tóc, vũ khí, hào quang lay động liên tục).

| Loại Thực Thể | Góc Nhìn | Kích Thước Ô | Bố Cục Lưới (`Cột × Hàng`) | Các Hàng Hoạt Ảnh (`6 Frame / Hàng`) |
|---------------|----------|--------------|----------------------------|--------------------------------------|
| **Anh Hùng (`Hero`)** | `BACK` (dưới-trái nhìn chéo lên phải như `orientation-back.png`) | `192×192 px` (safe `160×160`) | **`6 × 6 = 36 frame`** (`1152×1152 px`) | `1: IDLE_BREATHE` · `2: ATTACK_STRIKE` · `3: SKILL_CAST` · `4: PARRY_COUNTER` · `5: DODGE` · `6: HURT_FAINT` |
| **Quái Gác Cổng (`Gatekeeper`)** | `FRONT` (trên-phải nhìn chéo xuống trái như `orientation-front.png`) | `192×192 px` (safe `160×160`) | **`6 × 4 = 24 frame`** (`1152×768 px`) | `1: IDLE_BREATHE` · `2: ATTACK_COMBO` · `3: HURT_STAGGER` · `4: FAINT` |
| **Đại Trùm (`Boss`)** | `FRONT` (trên-phải nhìn chéo xuống trái, uy áp đại hình) | **`256×256 px`** (safe `216×216`) | **`6 × 6 = 36 frame`** (`1536×1536 px`) | `1: IDLE_BREATHE` · `2: COMBO_ATTACK` · `3: HEAVY_SWEEP` · `4: PHASE_AWAKEN` · `5: STAGGER_BREAK` · `6: DEFEAT` |

Đính kèm ảnh tham chiếu theo thứ tự:
1. `FIRST`: Ảnh thiết kế chuẩn của nhân vật / quái / trùm (khóa tỷ lệ cơ thể thật, tuyệt đối không vẽ chibi).
2. `SECOND`: Sheet di chuyển/thiết kế đã chuẩn hóa của cùng nhân vật (design lock — giữ nguyên trang phục, vũ khí, bảng màu).
3. `THIRD`: `prompts/battle/orientation-back.png` (cho phe người chơi `BACK`) hoặc `prompts/battle/orientation-front.png` (cho phe địch/Trùm `FRONT`) — chỉ sao chép góc xoay 3/4 đường chéo chiến trường, không sao chép hình dáng mẫu.

## COMMON Block (Battle)

```text
High-density 16-bit / Gen-3 fantasy pixel art battle animation sprite sheet of the warrior/entity in the FIRST attached image:
6 columns x <ROWS> rows of equal square cells, read left to right per row.
True heroic proportions (NEVER chibi, NEVER enlarged head): match the exact weapon, silhouette, armor, cape and palette of the FIRST/SECOND image.
Crisp 1-pixel dark navy outline (#1b1726), 4-5 hue-shifted shading tones, top-left lighting, strict square pixels, BGR555-clean palette, binary alpha after keying, NO blur, NO anti-aliasing, NO soft glow.
Background: flat solid pure magenta #FF00FF everywhere (or #00FF00 for magenta/purple characters); no grid lines, no text, no ground platform.
```

## VIEW Block

- **`BACK` (Hero — Góc Dưới-Trái)**: Nhìn từ phía sau-bên phải hướng lên mục tiêu ở góc trên-phải (thấy rõ lưng, vai phải, vũ khí và góc nghiêng khuôn mặt như `orientation-back.png` — không vẽ lưng thẳng đứng che kín mặt).
- **`FRONT` (Gatekeeper / Boss — Góc Trên-Phải)**: Xoay 3/4 hướng xuống mục tiêu ở góc dưới-trái như `orientation-front.png`; đòn đánh vung chéo xuống dưới-trái, trúng đòn giật lùi về trên-phải.

## ROWS Block (Hero `6×6 = 36 Frames`)

- **ROW 1 `IDLE_BREATHE`**: 6-frame seamless combat breathing loop — poised weapon, cape/hair gently billowing, subtle knee/shoulder rhythm.
- **ROW 2 `ATTACK_STRIKE`**: 1 stance → 2 deep wind-up → 3 forward lunge → 4 full-reach weapon slash/thrust (Timed Hit climax) → 5 follow-through → 6 return to stance.
- **ROW 3 `SKILL_CAST`**: 1 stance → 2 gather elemental energy on weapon → 3 raise crest/sigil → 4 unleash active/ultimate burst → 5 recoil → 6 stance.
- **ROW 4 `PARRY_COUNTER`**: 1 guard brace → 2 crisp weapon deflection stance → 3 spin-step momentum → 4 explosive Expedition Counter riposte → 5 recovery → 6 stance.
- **ROW 5 `DODGE`**: 1 stance → 2 quick crouch → 3–4 clear lateral dash/sidestep (~25% cell shift) → 5 landing → 6 stance.
- **ROW 6 `HURT_FAINT`**: 1–3 flinch & knockback (`HURT`); 4–6 knees buckle and fall defeated inside safe box (`FAINT`).

## Sau khi sinh ảnh

```powershell
py tools/units/normalize_sheet.py --mode move4 --layout loop --frames 6 --keep-x --input tmp/raw-battle.jpg --output database-astral-expedition/units/heroes/<hero_id>-battle.png
py tools/gen3/check_gen3.py --quiet database-astral-expedition/units
```
