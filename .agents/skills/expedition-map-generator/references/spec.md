# RealmMap JSON Specification Format (`expedition-map-generator`)

Mỗi bản đồ trong 7 vùng của **Astral Expedition Pixel** được mô tả bằng một tệp đặc tả nguồn chứa:

```json
{
  "mapId": "01-dawn-meadow",
  "theme": "meadow",
  "width": 56,
  "height": 40,
  "spawn": { "x": 6, "y": 20 },
  "exitPortal": { "x": 51, "y": 20, "toMapId": "02-everfrost-peaks", "requiresBossId": "sylvan_warden" },
  "restAnchors": [
    { "anchorId": "meadow_camp_1", "x": 10, "y": 20 },
    { "anchorId": "meadow_camp_2", "x": 36, "y": 18 }
  ],
  "gatekeepers": [
    { "gkId": "meadow_gk_1", "archetype": "thorn_stag", "patrolWaypoints": [[20, 18], [20, 22]], "aggroRadius": 3, "gateBarrierTiles": [[22, 19], [22, 20], [22, 21]] }
  ],
  "bossAltar": { "bossId": "sylvan_warden", "x": 46, "y": 20 }
}
```

## Các Luật Kiểm Lỗi Bắt Buộc (`0 Errors`)

- `spawn`, mọi `restAnchors`, mọi rương và `exitPortal` đều phải nằm trên ô đi bộ hợp lệ.
- Khoảng cách Manhattan từ bất kỳ `restAnchors` nào tới tâm tuần tra của mọi `gatekeepers` phải `>= aggroRadius + 6`.
- Khi mở toàn bộ `gateBarrierTiles`, thuật toán tìm đường BFS từ `spawn` phải đi tới được `100%` điểm mốc và `bossAltar`.
