# Thêm một nhân vật (Player, NPC, Trainer, Gym Leader)

Nhân vật là paper doll vẽ bằng code: `tools/characters/charkit.py` + `parts.py`, mỗi nhóm một file spec trong `tools/characters/chars/` (`player.py`, `service.py`, `townsfolk.py`, `trainers.py`, `gymleaders.py`, `locals.py`). Ra `assets/characters/<Group>/<slug>/<slug>-overworld.png` + `.json` (4×4 khung 16×32, một palette 15 màu). Chi tiết: [character SKILL.md](../../.agents/skills/pokemon-character-generator/SKILL.md), [decisions.md §9](../agents/decisions.md).

```bash
$EDITOR tools/characters/chars/townsfolk.py                     # thêm spec
python3 tools/characters/draw_chars.py Townsfolk                # một nhóm, vài slug, hoặc all
python3 tools/gen3/check_gen3.py --grid 8 --max-palettes 1 assets/characters
```
Xem `assets/characters/<group>-overview.png`. NPC dùng trong game: đặt bằng `events.npcs` trong spec map. Sprite được ánh xạ trong `NPC_SPRITE` (`game/tools/build_assets.py`), thoại trong `TALK` (`game/src/scenes/World.ts`).
