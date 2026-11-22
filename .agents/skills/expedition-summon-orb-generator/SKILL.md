---
name: expedition-summon-orb-generator
description: >-
  Tạo sprite sheet Tinh Cầu Triệu Hồi (SummonOrb, lưới 8x6 = 26+ frame) cho hệ thống Gacha 12 Anh Hùng (R / SR / SSR, Hard Pity 80) của Astral Expedition Pixel: xoay bay vào, nứt sáng cộng hưởng, rung 3 nhịp đổi sắc Lam / Tím / Vàng Cực Quang và nổ hào quang sao mở khóa Anh Hùng. Kích hoạt khi yêu cầu vẽ hiệu ứng Gacha, cầu triệu hồi hoặc đá ấn tinh tú.
---

# Expedition Astral Summon Orb Generator (`8×6` Multi-Frame Gacha Sheet)

Thuật ngữ chuẩn: [GLOSSARY.md](../../../GLOSSARY.md) (`SummonOrb`, `PityLedger`, `Hero`).

## Đầu Ra (`database-astral-expedition/ui/gacha/`)

- `astral-orb.png` + `astral-orb.json`: Lưới `8 cột × 6 hàng` ô vuông `64×64` gốc xuất `×2` (`128×128 px`), màu `BGR555`, alpha `0/255`:
  - `Row 0 (spin, 8f)`: Tinh cầu khắc vòng sao xoay tiến vào tâm đàn tế (`45°/frame`).
  - `Row 1 (resonate, 4f)`: Vỏ tinh cầu tách khe sáng ma đạo.
  - `Row 2 (pulse, 5f)`: Rung cộng hưởng 3 nhịp trái-phải tích tụ năng lượng.
  - `Row 3 (rarity_lock, 4f)`: Lóe ấn ký khóa bậc hiếm (`R` Lam · `SR` Tím · `SSR` Vàng Cực Quang) kèm chùm sao bay ra.
  - `Row 4 (shatter_reveal, 4f)`: Bung vỡ thành cột sáng triệu hồi Anh Hùng.
  - `Row 5 (icon, 3f)`: Biểu tượng Ấn Tinh Tú (`astralSeal`), Tinh Huy Quang Phổ (`starlightToken`) và Tinh Cầu tĩnh.

## Kiểm Chứng

- Không cắt cụt tia sáng ở rìa ô (`≥ 4 px` lề trống), sạch hoàn toàn nền nháp và đạt chuẩn `tools/gen3/check_gen3.py`.
