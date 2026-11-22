# Lâm Phong · `gustave_blade`

Nhóm `heroes` · nguyên tố Verdant · rig `humanoid`

## Ảnh đính kèm (theo thứ tự)

1. FIRST: `database-astral-expedition/art-source/motion/gustave-battle.png` — chuẩn phong cách, mật độ pixel và cách tô.
2. SECOND: `database-astral-expedition/art-source/units/heroes/gustave_blade-battle-source.png` — chỉ lấy bố cục lưới, tư thế từng hàng và tỷ lệ trong ô; không chép cách tô.
3. THIRD: `prompts/battle/orientation-back.png` — chỉ lấy góc xoay 3/4 BACK.
4. FOURTH (tùy chọn): `database-astral-expedition/art-source/motion/gustave-movement-source.png` — tham khảo thêm chuyển động.

## Thiết kế

adult man, realistic heroic proportions (about 8 heads tall), short dark brown hair, forest green upper garment, forest green long travelling coat with split tails, dark brown boots, wields a slender rapier with a swept guard, off-hand a small arcane flintlock.

## Prompt · battle (BACK, 6 × 6 ô 192 px)

```text
High-density hand-painted 16-bit fantasy pixel art sprite sheet, the same rendering as the FIRST attached image: realistic adult proportions (never chibi, never an enlarged head), rich cloth folds and fur strands built from small pixel clusters, 4-6 hue-shifted tones per material, warm muted palette, top-left light, crisp 1-pixel dark outline (#1b1726), strict square pixels, no blur, no anti-aliasing, no soft glow, no text, no grid lines, no ground platform. Background: flat solid pure magenta #FF00FF everywhere (use #00FF00 only if the character itself is magenta or purple). Original character of the Astral Expedition world: do not copy any character, costume, emblem or logo from an existing game.
Subject: adult man, realistic heroic proportions (about 8 heads tall), short dark brown hair, forest green upper garment, forest green long travelling coat with split tails, dark brown boots, wields a slender rapier with a swept guard, off-hand a small arcane flintlock.
View: 3/4 from behind-right, looking up-right at the enemy (like the THIRD image).
Layout: 6 columns x 6 rows of equal square cells, keep the whole figure inside the central 85% of every cell, feet on the same baseline.
ROW 1 IDLE_BREATHE: 6-frame seamless combat breathing, cape and hair moving.
ROW 2 ATTACK_STRIKE: stance, deep wind-up, lunge, full-reach strike (impact), follow-through, return.
ROW 3 SKILL_CAST: stance, gather elemental energy, raise the weapon, unleash the burst, recoil, stance.
ROW 4 PARRY_COUNTER: guard brace, crisp deflection, spin-step, explosive riposte, recovery, stance.
ROW 5 DODGE: stance, crouch, clear lateral dash (~25% of the cell), dash end, landing, stance.
ROW 6 HURT_FAINT: frames 1-3 flinch and knockback, frames 4-6 knees buckle and fall inside the cell.
```

## Prompt · movement (6 × 8 ô 64 px, top-down 3/4)

```text
High-density hand-painted 16-bit fantasy pixel art sprite sheet, the same rendering as the FIRST attached image: realistic adult proportions (never chibi, never an enlarged head), rich cloth folds and fur strands built from small pixel clusters, 4-6 hue-shifted tones per material, warm muted palette, top-left light, crisp 1-pixel dark outline (#1b1726), strict square pixels, no blur, no anti-aliasing, no soft glow, no text, no grid lines, no ground platform. Background: flat solid pure magenta #FF00FF everywhere (use #00FF00 only if the character itself is magenta or purple). Original character of the Astral Expedition world: do not copy any character, costume, emblem or logo from an existing game.
Subject: adult man, realistic heroic proportions (about 8 heads tall), short dark brown hair, forest green upper garment, forest green long travelling coat with split tails, dark brown boots, wields a slender rapier with a swept guard, off-hand a small arcane flintlock.
Layout: 6 columns x 8 rows: idle DOWN, LEFT, RIGHT, UP then walk DOWN, LEFT, RIGHT, UP; 6 distinct frames per loop, same height in every direction (like `art-source/motion/gustave-movement-source.png`).
```

## Lưu và xuất

- Battle: lưu đè `database-astral-expedition/art-source/units/heroes/gustave_blade-battle-source.png`.
- Movement: lưu đè `database-astral-expedition/art-source/units/heroes/gustave_blade-movement-source.png`.
- Chuẩn hóa từng hàng nếu bản vẽ lệch lưới: `py tools/units/normalize_sheet.py --mode move4 --layout loop --frames 6 --keep-x --input <bản vẽ> --output <file -source.png>`.
- Xuất 1-1 sang game: `py tools/expedition/art_source.py --domain units`.
- Không chạy lại `build_units.py --only gustave_blade` sau khi đã có bản vẽ tay: lệnh đó dựng lại bản gốc từ rig. Muốn giữ bản vẽ, khai báo trường `art` cho unit trong `tools/expedition/roster.py`.
