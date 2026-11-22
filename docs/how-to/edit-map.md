# Thêm hoặc sửa một Map

Spec `assets/maps/<slug>/<slug>.map.json` là nguồn. PNG, TMJ và TSJ đều sinh ra từ nó. Định dạng spec: [file-formats.md](../reference/file-formats.md#map-spec-assetsmapsslugslugmapjson) và [`references/spec.md`](../../.agents/skills/pokemon-map-generator/references/spec.md). Luật bố cục: [map SKILL.md](../../.agents/skills/pokemon-map-generator/SKILL.md). Lần đầu thì làm theo [tutorial sửa map](../tutorials/02-first-map-edit.md).

**Sửa map có sẵn**
```bash
$EDITOR assets/maps/route-1/route-1.map.json
python3 tools/maps/mapgen.py build assets/maps/route-1/route-1.map.json --debug   # phải "0 errors"
# xem route-1.png, route-1-debug.png, route-1-report.md (hai file sau không vào git)
npm run maps            # build lại cả world: 0 seam/link errors; ghi lại connections vào mọi .tmj
npm run assets && npm run dev
```
`mapgen.py build` một map ghi `.tmj` chưa có `connections`. Luôn chạy `npm run maps` trước khi commit.

**Map mới**
1. Chọn theme: `python3 tools/maps/mapgen.py themes`, rồi `python3 tools/maps/mapgen.py inventory <theme>`. Piece nào còn thiếu thì tạo trước ([add-overworld-pieces.md](add-overworld-pieces.md), [add-building.md](add-building.md)).
2. Đặt map vào `assets/maps/world.json` (dạng `{"at", "size", "kind", "theme"}`), rồi dựng khung bằng `python3 tools/maps/scaffold.py assets/maps/world.json <slug>`.
3. Sửa spec, `build`, `npm run maps` như trên.
4. Game hiển thị tên địa điểm và thoại NPC từ `game/src/scenes/World.ts` (`PLACE`, `TALK`), viết bằng tiếng Việt.
