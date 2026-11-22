---
name: expedition-battle-poses
description: >-
  Tạo sprite sheet hoạt ảnh chiến đấu góc chéo nhiều frame chân thực cho Astral Expedition Pixel: Anh Hùng góc BACK (192x192, 6 cột x 6 hàng = 36 frame: IDLE_BREATHE, ATTACK, SKILL_CAST, PARRY_COUNTER, DODGE, HURT_FAINT), Quái Gác Cổng góc FRONT (192x192, 6x4 = 24 frame) và Đại Trùm góc FRONT (256x256, 6x6 = 36 frame). Kích hoạt khi cần vẽ tư thế chiến đấu, đỡ phản đòn Parry, né Dodge hoặc chuyển phase Trùm.
---

# Expedition Multi-Frame Diagonal Battle Poses (`36-Frame` Heroes & Bosses)

Tham chiếu góc nhìn chuẩn: [prompts/battle/README.md](../../../prompts/battle/README.md), ảnh mẫu góc [orientation-back.png](../../../prompts/battle/orientation-back.png) và [orientation-front.png](../../../prompts/battle/orientation-front.png). Thuật ngữ: [GLOSSARY.md](../../../GLOSSARY.md).

## Đầu Ra Chuẩn

- **12 Anh Hùng (`Hero` — Góc `BACK` dưới-trái nhìn chéo lên phải)**:
  `database-astral-expedition/units/heroes/<hero_id>-battle.png` (`192×192 px` × `6 cột × 6 hàng = 36 frame`, `1152×1152 px`):
  1. `IDLE_BREATHE` (6f): Nhịp thở, áo choàng và vũ khí chuyển động liên tục ngay cả khi mở `VerticalSkillMenu`.
  2. `ATTACK_STRIKE` (6f): Thế thủ → lấy đà → lao tới → chém cực đại khớp `TimedHit` → thu chiêu → thế thủ.
  3. `SKILL_CAST` (6f): Tụ ấn nguyên tố trên vũ khí → phóng kỹ năng chủ động / Chiêu Cuối.
  4. `PARRY_COUNTER` (6f): Đỡ keng tia lửa → xoay người phản kích (`ParryCounter`) chuẩn chất *Expedition 33*.
  5. `DODGE` (6f): Khuỵu gối → lướt ngang né đòn rõ rệt → về vị trí.
  6. `HURT_FAINT` (6f): Frame `1–3` trúng đòn giật lùi; Frame `4–6` gục ngã trong vùng an toàn.
- **Quái Gác Cổng (`Gatekeeper` — Góc `FRONT` trên-phải nhìn chéo xuống trái)**:
  `database-astral-expedition/units/gatekeepers/<gk_id>-battle.png` (`192×192 px` × `6×4 = 24 frame`: `IDLE_BREATHE`, `ATTACK_COMBO`, `HURT_STAGGER`, `FAINT`).
- **7 Đại Trùm (`Boss` — Góc `FRONT` khổng lồ)**:
  `database-astral-expedition/units/bosses/<boss_id>-battle.png` (`256×256 px` × `6×6 = 36 frame`, `1536×1536 px`: `IDLE_BREATHE`, `COMBO_ATTACK`, `HEAVY_SWEEP`, `PHASE_AWAKEN`, `STAGGER_BREAK`, `DEFEAT`).

- **Quái hoang dã và người địch (`monsters/`)**, **Động vật (`animals/`)**: cùng chuẩn với Quái Gác Cổng (`192×192`, FRONT, `6×4 = 24 frame`) cộng `-movement.png` `6×4` walk ở 64 px.

## Dựng Từ Rig (Không Cần Công Cụ Vẽ)

`py tools/expedition/build_units.py --only <unit_id> --preview tmp/units-review` dựng các hàng đúng thứ tự trên từ thiết kế trong `tools/expedition/roster.py`, tự scale và căn sprite để không tràn ô, rồi kiểm Gen 3. Khi có bản vẽ tay đạt chuẩn, lưu vào `art-source/motion/` và khai báo trong trường `art` của unit; bản vẽ tay sẽ thay bản dựng. Trang duyệt: `specs/006-astral-expedition-pixel/design/units-review.html`.

## Quy Trình Thực Thi & Kiểm Chứng

1. Dùng [prompts/battle/README.md](../../../prompts/battle/README.md) kèm ảnh thiết kế gốc + `orientation-back.png` (Hero) hoặc `orientation-front.png` (Gatekeeper/Boss).
2. Chuẩn hóa bằng `tools/units/normalize_sheet.py --frames 6 --keep-x` (tách sạch nền `#FF00FF`/`#00FF00`, căn baseline chân).
3. Kiểm định bắt buộc với `tools/gen3/check_gen3.py` và `tools/expedition/verify_bundle.py`.
4. Lưu bản nguồn và atlas đã chuẩn hóa trong `database-astral-expedition/art-source/motion/` khi dùng bước xuất atlas trong `tools/expedition/build_bundle.py`.

`tools/expedition/agy_units.py run --sheets battle --jobs 3` dựng ba sheet song song khi dịch vụ còn hạn mức. Xuất từng sheet nối tiếp sau khi kiểm tra đủ frame.

Để thử bản vẽ lại tại tên game cũ, nhập bằng `tools/expedition/import_unit_art.py`. Các slot tương thích trong `units/animals/` có thể dùng thiết kế quái chiến đấu và vẫn giữ lưới 6×4.

Trang phục Anh Hùng dùng cùng hợp đồng frame. Nhập riêng với `--variant`. Khi cần sửa động tác thi triển, dùng ảnh sáu ô 3×2 với `--cast-source` để cập nhật hàng Cast.
