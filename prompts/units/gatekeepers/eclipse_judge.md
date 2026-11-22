# Phán Quan Bóng Nguyệt · `eclipse_judge`

Nhóm `gatekeepers` · nguyên tố Astral · rig `humanoid` · vùng `06-nocturne-veil`

## Ảnh đính kèm (theo thứ tự)

1. FIRST: `database-astral-expedition/art-source/motion/redraw/vulcan_titan-battle.png` — chuẩn phong cách, mật độ pixel và cách tô.
2. SECOND: `database-astral-expedition/art-source/units/gatekeepers/eclipse_judge-battle-source.png` — chỉ lấy bố cục lưới, tư thế từng hàng và tỷ lệ trong ô; không chép cách tô.
3. THIRD: `prompts/battle/orientation-front.png` — chỉ lấy góc xoay 3/4 FRONT.
4. FOURTH (tùy chọn): `database-astral-expedition/art-source/motion/redraw/boreal_chevalier-battle.png` — chuẩn phong cách boss thứ hai, mật độ chi tiết.

## Thiết kế

a tall faceless judge in a midnight hooded robe, a void-black face with two glowing pale eyes, a golden eclipse halo (black disc ringed with gold) behind the head, a crimson stole, a hooked judge's crook, a heavy chained tome hanging at the hip.

## Prompt · battle (FRONT, 6 × 4 ô 192 px)

```text
High-density hand-painted 16-bit fantasy pixel art sprite sheet, the same rendering as the FIRST attached image: realistic adult proportions (never chibi, never an enlarged head), rich cloth folds and fur strands built from small pixel clusters, 4-6 hue-shifted tones per material, warm muted palette, top-left light, crisp 1-pixel dark outline (#1b1726), strict square pixels, no blur, no anti-aliasing, no soft glow, no text, no grid lines, no ground platform. Background: flat solid pure magenta #FF00FF everywhere (use #00FF00 only if the character itself is magenta or purple). Original character of the Astral Expedition world: do not copy any character, costume, emblem or logo from an existing game.
Subject: a tall faceless judge in a midnight hooded robe, a void-black face with two glowing pale eyes, a golden eclipse halo (black disc ringed with gold) behind the head, a crimson stole, a hooked judge's crook, a heavy chained tome hanging at the hip.
Gatekeeper mini-boss presence: imposing, menacing silhouette that fills the cell, dense surface detail (engraved armour, scales, fur, cracks, runes), small saturated elemental accents (glowing eyes, seams or runes) against a darker body, strong readable pose with weight and momentum, the same detail level and finish as the attached boss sprite sheets.
View: 3/4 facing down-left toward the heroes (like the THIRD image), attacks swing toward the bottom-left.
Layout: 6 columns x 4 rows of equal square cells, keep the whole figure inside the central 85% of every cell, feet on the same baseline.
ROW 1 IDLE_BREATHE: 6-frame menacing breathing loop, body rising and settling, glowing details pulsing.
ROW 2 ATTACK_COMBO: heavy anticipation wind-up, explosive strike toward the bottom-left with a short elemental arc, follow-through, second wind-up, finishing blow, recover.
ROW 3 HURT_STAGGER: violent flinch, knocked back, armour or scales chipping, stagger, regain an angry footing.
ROW 4 FAINT: buckle, collapse heavily, glow fading, lie still inside the cell.
```

## Prompt · movement (6 × 4 ô 64 px, top-down 3/4)

```text
High-density hand-painted 16-bit fantasy pixel art sprite sheet, the same rendering as the FIRST attached image: realistic adult proportions (never chibi, never an enlarged head), rich cloth folds and fur strands built from small pixel clusters, 4-6 hue-shifted tones per material, warm muted palette, top-left light, crisp 1-pixel dark outline (#1b1726), strict square pixels, no blur, no anti-aliasing, no soft glow, no text, no grid lines, no ground platform. Background: flat solid pure magenta #FF00FF everywhere (use #00FF00 only if the character itself is magenta or purple). Original character of the Astral Expedition world: do not copy any character, costume, emblem or logo from an existing game.
Subject: a tall faceless judge in a midnight hooded robe, a void-black face with two glowing pale eyes, a golden eclipse halo (black disc ringed with gold) behind the head, a crimson stole, a hooked judge's crook, a heavy chained tome hanging at the hip.
Layout: 6 columns x 4 rows: walk DOWN, LEFT, RIGHT, UP; 6 distinct frames per loop, same height in every direction (like `art-source/motion/gustave-movement-source.png`).
```

## Lưu và xuất

- Battle: lưu đè `database-astral-expedition/art-source/units/gatekeepers/eclipse_judge-battle-source.png`.
- Movement: lưu đè `database-astral-expedition/art-source/units/gatekeepers/eclipse_judge-movement-source.png`.
- Chuẩn hóa từng hàng nếu bản vẽ lệch lưới: `py tools/units/normalize_sheet.py --mode move4 --layout loop --frames 6 --keep-x --input <bản vẽ> --output <file -source.png>`.
- Xuất 1-1 sang game: `py tools/expedition/art_source.py --domain units`.
- Không chạy lại `build_units.py --only eclipse_judge` sau khi đã có bản vẽ tay: lệnh đó dựng lại bản gốc từ rig. Muốn giữ bản vẽ, khai báo trường `art` cho unit trong `tools/expedition/roster.py`.
