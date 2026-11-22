# Thêm tile, autotile hoặc prop overworld

Piece được định nghĩa bằng code trong `tools/overworld/pieces/*.py` và xuất ra `assets/overworld/` (PNG trong suốt, `-anim`, Tiled `.tsj`, `index.json`). Quy trình, luật Gen 3, catalog: [overworld SKILL.md](../../.agents/skills/pokemon-overworld-generator/SKILL.md), [`references/catalog.md`](../../.agents/skills/pokemon-overworld-generator/references/catalog.md).

1. Thêm hoặc sửa định nghĩa trong `tools/overworld/pieces/` (`terrain.py`, `props.py`, `gym_<type>.py`…). Ramp màu lấy từ sheet gym (`MONS_PALETTE=gym`).
2. Sinh piece:
   ```bash
   python3 tools/overworld/gen_overworld.py <slug> [<slug> …]    # hoặc all; --gym <type> cho piece của một gym
   python3 tools/gen3/check_gen3.py --quiet assets/overworld       # 0 failed
   ```
3. Xem `assets/overworld/_preview/` (không vào git). Nếu piece là role của theme (`@tree`, `@path`…), thêm nó vào `tools/maps/themes.json`, rồi build lại map dùng nó (`npm run maps`).
