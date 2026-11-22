# TRÙM CUỐI — Vĩnh Dạ Quang Phổ Vương · `astral_painter_seraphina`

Nhóm `bosses` · nguyên tố Astral · rig `humanoid` · vùng `07-aurora-zenith`

## Ảnh đính kèm (theo thứ tự)

1. FIRST: `database-astral-expedition/art-source/motion/seraphina-battle.png` — chuẩn phong cách, mật độ pixel và cách tô.
2. SECOND: `database-astral-expedition/art-source/units/bosses/astral_painter_seraphina-battle-source.png` — chỉ lấy bố cục lưới, tư thế từng hàng và tỷ lệ trong ô; không chép cách tô.
3. THIRD: `prompts/battle/orientation-front.png` — chỉ lấy góc xoay 3/4 FRONT.

## Thiết kế

adult woman, realistic heroic proportions (about 8 heads tall), long silver hair, charcoal upper garment, charcoal floor-length robe, charcoal boots, wields a staff-length painter's brush with a glowing bristle tip, crystal prism wings, a thin light halo.

## Prompt · battle (FRONT, 6 × 6 ô 256 px)

```text
High-density hand-painted 16-bit fantasy pixel art sprite sheet, the same rendering as the FIRST attached image: realistic adult proportions (never chibi, never an enlarged head), rich cloth folds and fur strands built from small pixel clusters, 4-6 hue-shifted tones per material, warm muted palette, top-left light, crisp 1-pixel dark outline (#1b1726), strict square pixels, no blur, no anti-aliasing, no soft glow, no text, no grid lines, no ground platform. Background: flat solid pure magenta #FF00FF everywhere (use #00FF00 only if the character itself is magenta or purple). Original character of the Astral Expedition world: do not copy any character, costume, emblem or logo from an existing game.
Subject: adult woman, realistic heroic proportions (about 8 heads tall), long silver hair, charcoal upper garment, charcoal floor-length robe, charcoal boots, wields a staff-length painter's brush with a glowing bristle tip, crystal prism wings, a thin light halo.
View: 3/4 facing down-left toward the heroes (like the THIRD image), attacks swing toward the bottom-left.
Layout: 6 columns x 6 rows of equal square cells, keep the whole figure inside the central 85% of every cell, feet on the same baseline.
ROW 1 IDLE_BREATHE.
ROW 2 COMBO_ATTACK: three-beat combo.
ROW 3 HEAVY_SWEEP: huge wind-up then a wide sweep.
ROW 4 PHASE_AWAKEN: rising power, aura and roar.
ROW 5 STAGGER_BREAK: armour cracks, dazed sway.
ROW 6 DEFEAT: kneel, collapse, lie still inside the cell.
```

## Lưu và xuất

- Battle: lưu đè `database-astral-expedition/art-source/units/bosses/astral_painter_seraphina-battle-source.png`.
- Chuẩn hóa từng hàng nếu bản vẽ lệch lưới: `py tools/units/normalize_sheet.py --mode move4 --layout loop --frames 6 --keep-x --input <bản vẽ> --output <file -source.png>`.
- Xuất 1-1 sang game: `py tools/expedition/art_source.py --domain units`.
- Không chạy lại `build_units.py --only astral_painter_seraphina` sau khi đã có bản vẽ tay: lệnh đó dựng lại bản gốc từ rig. Muốn giữ bản vẽ, khai báo trường `art` cho unit trong `tools/expedition/roster.py`.
