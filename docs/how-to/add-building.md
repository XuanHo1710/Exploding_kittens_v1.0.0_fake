# Thêm một công trình (nhà, Center, Mart, Gym…)

Ra `assets/structures/<Category>/<slug>/`: `-structure.png`, `-ground.png`, `-door.png` + `.json`, `-interior*.png`. Luật Gen 3, Signature Silhouette, kích thước: [structure SKILL.md](../../.agents/skills/pokemon-structure-generator/SKILL.md).

| Loại | Nguồn | Lệnh |
|---|---|---|
| Công trình dân sự (Center, Mart, nhà, shop, lab…) | một spec mỗi công trình trong `tools/structures/civic/*.py` (engine `civickit.py`) | `python3 tools/structures/draw_civic.py <slug>` (hoặc `all`) |
| Gym | một thiết kế mỗi hệ trong `tools/structures/gyms/<type>.py` (engine `gymkit.py`; mẫu: `gyms/fire.py`) | `python3 tools/structures/draw_gym.py <type>` (hoặc `all`) |
| Một lần, chưa có spec | khung mới | `bash tools/structures/new_structure.sh "<slug>" [S\|M\|L\|XL] [Category]` |

Kiểm tra:
```bash
python3 tools/gen3/check_gen3.py --max-palettes 6 --max-footprint 8x8 assets/structures/<Category>/<slug>/<slug>-{structure,door,ground}.png
python3 tools/gen3/check_gen3.py assets/structures/<Category>/<slug>/<slug>-interior-*.png
```
Đặt công trình lên map bằng op `structure` trong spec ([edit-map.md](edit-map.md)), rồi `npm run maps && npm run assets`.
