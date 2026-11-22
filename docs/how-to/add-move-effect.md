# Thêm hiệu ứng chiêu (kỹ năng)

Mỗi chiêu gồm 2 ảnh: `-cast` (trên Pokémon dùng chiêu) và `-effect` (chiêu). Chúng nằm trong `assets/skills/<GenX-Region>/<English Move Name>/`, cùng `-vfx.json`. Danh sách 919 chiêu và archetype: `data/battle/moves.json`. Chi tiết: [move-vfx SKILL.md](../../.agents/skills/pokemon-move-vfx/SKILL.md).

```bash
python3 tools/skills/start_move.py "Eruption"      # tìm hoặc tạo assets/skills/<Gen>/Eruption/eruption-prompt.md
```
Mở file prompt đó và làm theo (sinh ảnh → `normalize_move.py` → xem bằng `battle_preview.py` / `battle_demo.py`).

Kiểm tra trên cả hai phía (kích thước, vị trí, hiệu ứng trúng đòn): [move-review SKILL.md](../../.agents/skills/pokemon-move-review/SKILL.md), `python3 tools/skills/review_move.py "Eruption"` → `tmp/moves/review/<id>/report.md` + `sheet.png`. Tinh chỉnh bằng `<id>-vfx.json`.
