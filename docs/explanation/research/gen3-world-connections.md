# Gen 3 ghép map thành thế giới: connection, đồ thị vùng và luật cho Mons

Mục đích: Mons cần vài thành phố lớn và các route nối chúng, đi liền mạch như Gen 3. Tài liệu này đo luật ghép thế giới trực tiếp từ dữ liệu và mã nguồn pret: offset căn mép thế nào, engine vẽ gì qua đường nối, thành phố có bao nhiêu lối ra, route dài bao nhiêu, khi nào Gen 3 dùng nhà cổng (gate) thay cho đường nối liền. Cuối tài liệu là checklist cho engine Mons và một mini-world đề xuất.

Tài liệu không lặp lại phần đã viết ở [gen3-map-composition.md](./gen3-map-composition.md) (ký hiệu **MC§n**): ba tầng dữ liệu tileset/layout/header (MC§1.1), border 2x2 và connection cơ bản (MC§1.3), trường header như `music`, `weather`, `region_map_section` (MC§1.4), độ rộng lối ra trong một map (MC§2.4). Phần cơ chế offset ngắn gọn đã có ở [research.md §3](../../../.agents/skills/pokemon-overworld-generator/references/research.md) (ký hiệu **R§3**). Ở đây đi sâu hơn và đo trên toàn bộ vùng.

Quy ước độ tin cậy (giữ như MC):
- **[PRET]**: đọc trực tiếp từ mã nguồn hoặc dữ liệu pret.
- **[ĐO]**: tôi tự chạy script trên dữ liệu pret rồi đếm. Số liệu cứng nhưng qua tay tôi xử lý (phương pháp ở §0).
- **[SUY RA]**: suy luận từ số liệu cứng, không có dòng nguồn nào nói thẳng.
- **chưa xác minh**: chưa kiểm chứng được trong lần nghiên cứu này.

Ngày truy cập: 2026-11-18. Nguồn: `pret/pokeemerald` commit `9103e52` (EM) và `pret/pokefirered` commit `ce6406d` (FR), lấy bằng `git clone --sparse` từ GitHub. Mọi đường dẫn file dưới đây tương đối với gốc repo tương ứng, ví dụ [EM src/fieldmap.c](https://github.com/pret/pokeemerald/blob/master/src/fieldmap.c), [FR src/fieldmap.c](https://github.com/pret/pokefirered/blob/master/src/fieldmap.c). Không có nguồn nào bị lỗi tải trong lần này. Không dùng nguồn cộng đồng.

---

## 0. Phương pháp đo [ĐO]

1. Đọc `data/maps/map_groups.json`, mọi `data/maps/*/map.json`, `data/layouts/layouts.json` và `map.bin`. Mỗi ô `map.bin` là u16: metatile id bit 0-9, collision bit 10-11, elevation bit 12-15 (MC§1.2).
2. "Map ngoài trời" = `map_type` thuộc `TOWN / CITY / ROUTE / OCEAN_ROUTE`. EM có 68 map như vậy (trên 518 map), FR có 76 (trên 425 map).
3. **Lối ra trên mép**: ô ở hàng hoặc cột mép có collision = 0. Ô có elevation 1 được đánh dấu là nước. Tôi đổi tọa độ của map B sang tọa độ map A bằng offset, rồi so hai tập trong đoạn chồng nhau. Giới hạn: chỉ xét collision, không xét behaviour. Vì vậy một ô "đi được" theo collision có thể vẫn bị chặn bởi elevation hoặc behaviour.
4. **Đặt toàn cục**: chạy BFS qua connection, gán gốc tọa độ thế giới cho từng map, rồi báo chỗ hai đường đi cho ra hai vị trí khác nhau.
5. **Lối đi gián tiếp**: lấy các nhóm map trong nhà/hang nối với nhau bằng warp. Nhóm nào chạm từ 2 map ngoài trời trở lên là một "passage" (gate, hang, đường hầm).
6. Script nằm ở scratchpad của phiên này (`world.py`, `graph.py`, `cls.py`, `grass.py`), không đưa vào repo.

---

## 1. Cơ chế connection trong engine

### 1.1. Dữ liệu

| Mục | Giá trị | Nguồn |
|---|---|---|
| Struct | `MapConnection { u8 direction; s32 offset; u8 mapGroup; u8 mapNum; }`, một map có `MapConnections { count, *connections }` | [PRET] EM `include/global.fieldmap.h` dòng 157-169 |
| Hướng | `CONNECTION_SOUTH 1, NORTH 2, WEST 3, EAST 4, DIVE 5, EMERGE 6` (JSON: `down/up/left/right/dive/emerge`) | [PRET] EM `include/constants/global.h` dòng 149-154 |
| Lề đệm | `MAP_OFFSET 7`, `MAP_OFFSET_W = 15`, `MAP_OFFSET_H = 14`, `MAX_MAP_DATA_SIZE 10240` (FR `0x2800`, cùng giá trị) | [PRET] EM `include/fieldmap.h` dòng 10-20, FR `include/fieldmap.h` dòng 12-23 |

Cấp phát: buffer "backup" có kích thước `(w+15) x (h+14)`. Buffer được tô `MAPGRID_UNDEFINED`, sau đó chép map vào giữa (lệch 7,7) và chép từng connection vào lề [PRET] EM `fieldmap.c` `InitMapLayoutData` dòng 91-105.

### 1.2. Offset: nghĩa chính xác và quy ước dấu

[PRET] EM `fieldmap.c` `FillNorth/South/West/EastConnection` dòng 178-315 và `SetPositionFromConnection` dòng 578-600:
- **up/down**: `offset` = tọa độ x của **cột 0 của map hàng xóm**, tính trong hệ tọa độ x của map hiện tại. Nó được vẽ ở `x = offset + MAP_OFFSET`.
- **left/right**: `offset` = tọa độ y của **hàng 0 của map hàng xóm**, tính trong hệ y của map hiện tại.
- Khi bước qua đường nối, engine đổi tọa độ người chơi: `pos.x -= offset` (đi lên/xuống) hoặc `pos.y -= offset` (đi trái/phải). Trục còn lại được đặt về mép đối diện của map mới (`pos.y = height` khi đi lên, `pos.x = -x` khi đi sang phải, v.v.).
- **Dấu**: offset dương nghĩa là hàng xóm bắt đầu **lệch về phía +x (phải) hoặc +y (xuống)** so với gốc của map hiện tại. Ví dụ [PRET]: Viridian (48 rộng) `up → Route2 offset 12` nghĩa là Route 2 (24 rộng) bắt đầu ở cột 12 của Viridian, tức nằm chính giữa. Route 2 ghi ngược lại `down → Viridian offset -12`.

Công thức kiểm tra (tọa độ hàng xóm `b` ↔ tọa độ map hiện tại `a`): **`a = b + offset`** trên trục chạy dọc mép nối.

### 1.3. Engine vẽ gì qua đường nối

- Hàng xóm được chép **7 ô sâu** vào lề phía Bắc, Nam, Tây, và **8 ô** ở phía Đông (`MAP_OFFSET + 1`, vì `MAP_OFFSET_W = 2·7 + 1`) [PRET] `FillEastConnection` dòng 314.
- Theo chiều dọc mép, phần được chép bị cắt theo bề rộng buffer: chỉ đoạn hàng xóm nằm trong `[-7, w+7]` của map hiện tại [PRET] `FillSouthConnection` dòng 189-210.
- **Ô lề không có hàng xóm nào phủ vẫn là `MAPGRID_UNDEFINED`. Khi vẽ, các ô này lấy khối border 2x2 của map hiện tại**, và collision luôn = 1 [PRET] `MapGridGetMetatileIdAt` dòng 337-345, `MapGridGetCollisionAt` dòng 327-335, macro `GetBorderBlockAt` dòng 51. Border của hàng xóm **không bao giờ** được vẽ.
- **Chỉ có lưới metatile id của hàng xóm được chép. Tileset thì không.** Lề được vẽ bằng tileset primary và secondary của **map hiện tại**. Khi bước qua, engine mới nạp secondary tileset, palette và animation của map mới (`CopySecondaryTilesetToVramUsingHeap`, `LoadSecondaryTilesetPalette`) [PRET] EM `overworld.c` `LoadMapFromCameraTransition` dòng 784-825, FR `overworld.c` dòng ~757-781.
  - Hệ quả [SUY RA]: nếu hai map dùng secondary tileset khác nhau, metatile secondary (id ≥ 512 ở EM, ≥ 640 ở FR) của hàng xóm trong dải 7 ô sẽ hiện bằng hình của tileset sai.
  - Đo [ĐO]: trong các cặp khác secondary, dải 7 ô của hàng xóm **không có ô secondary nào** ở 24/36 hướng nối (EM) và 22/32 (FR); ≤ 8 ô ở 31/36 (EM) và 25/32 (FR). Người làm map Gen 3 giữ dải gần đường nối bằng tile primary (cây, cỏ, nước, đường).
  - Ngoại lệ lớn [ĐO]: EM Route 112 → Route 113 (145/329 ô), Route 134 → Slateport (92/329); FR Route 5 → Saffron (196/336), Route 22 ↔ Route 23 (~60/168). Hình hiển thị thật ở những chỗ này **chưa xác minh** (có thể metatile id trùng hình, hoặc bị vách hay mái che).
- **Màn hình thấy được bao nhiêu**: viewport 15x10 metatile, người chơi ở cột 7, nên thấy tối đa **7 ô** hàng xóm theo chiều ngang. Theo chiều dọc chỉ khoảng 4-5 ô [SUY RA] từ `MAP_OFFSET_W = 15` và màn 240x160 (MC§2.1). Dải 7 ô được chép đủ cho mọi vị trí camera.

### 1.4. Khi nào người chơi được bước qua

- Chạm mép: `GetMapBorderIdAt` trả hướng khi tọa độ (đã cộng `MAP_OFFSET`) rơi vào lề. Nếu phía đó không có cờ connection, hàm trả `CONNECTION_INVALID` và camera không di chuyển [PRET] dòng 522-560.
- Chọn hàng xóm: `GetIncomingConnection` duyệt **mọi** connection cùng hướng và lấy cái đầu tiên chứa tọa độ người chơi (dòng 634-655). Kiểm tra bằng `IsCoordInIncomingConnectingMap`: `max(0, offset) ≤ coord ≤ min(srcMax, destMax + offset)` (dòng 671-688; cận trên là `≤`).
  - Hệ quả: **một cạnh được chia cho nhiều hàng xóm**. Đo [PRET]:
    - EM Route 111 `left → Route113 offset 0` (hàng 0-19) và `left → Route112 offset 20` (hàng 20-79).
    - EM Route 124 `right → Route125 offset 0` và `right → MossdeepCity offset 40`.
    - FR Six Island Water Path có 3 connection `left`.
  - Câu "tối đa 1 connection mỗi hướng" ở MC§1.3 và R§3 vì thế chỉ đúng với phần lớn map, không phải giới hạn của engine.
- Ô đích có đi được không thì xét bằng collision bình thường trên buffer đã ghép. **Lối đi thật = giao của ô đi được ở hai mép** [SUY RA] từ cách engine chép lưới. Đoạn ô đi được thừa ở một bên chỉ là ngõ cụt sát mép.
- Khi qua đường nối, engine còn chạy:
  - `TransitionMapMusic`: fade 8 frame, hoặc 4/4 nếu đang đi xe đạp; giữ nhạc Surf nếu đang lướt nước [PRET] EM `overworld.c` dòng 1170-1191.
  - `SetSavedWeatherFromCurrMapHeader`, đặt lại bộ đếm miễn gặp Pokémon (`RestartWildEncounterImmunitySteps`), cùng các script `OnTransition`/`OnResume`.
  - `ShowMapNamePopup`: EM hiện mọi lần (trừ Battle Frontier); FR chỉ hiện khi `regionMapSectionId` đổi [PRET] FR `overworld.c` dòng ~783-785.

### 1.5. Đối xứng

- Connection là dữ liệu một chiều: mỗi map tự giữ danh sách của mình. Engine **không** kiểm tra map bên kia có connection ngược hay không.
- Đo [ĐO]:
  - EM: 135 connection ngoài trời, **0 cặp lệch**. Mọi cặp A→B đều có B→A ở hướng ngược với offset đổi dấu (`offset_BA = −offset_AB`).
  - FR: 120 connection, 8 cặp lệch. Gồm Saffron (xem §2.4) và hai map `PROTOTYPE_SEVII_ISLE_6/7` kích thước 1x1 (rác dev).
- Trong một vòng lặp, vị trí toàn cục không bắt buộc phải khớp. EM có một vòng Oldale → Route 103 → Route 110 → … → Route 102 → Oldale **lệch 2 ô theo chiều dọc**, vì Route 103 cao 22 chứ không phải 20 [ĐO]. Engine chỉ ghép từng cặp nên không ai thấy lỗi này. Với engine dùng tọa độ thế giới thì lệch như vậy là lỗi (§4.1).

### 1.6. Dive / Emerge

- `SetDiveWarp` lấy connection `dive` hoặc `emerge` đầu tiên rồi warp sang map đó **ở cùng tọa độ (x, y)**, bỏ qua offset [PRET] EM `overworld.c` dòng 740-782. `GetMapConnectionAtPos` bỏ qua hai hướng này khi xét mép (fieldmap.c dòng 731).
- Đo [ĐO]: 7 cặp EM (Route 105, 124-129 ↔ `UNDERWATER_*`). Mọi cặp có **offset 0 và cùng kích thước** (ví dụ 80x80 ↔ 80x80, 120x40 ↔ 120x40). Chỉ có ô deep-water (behaviour) mới cho lặn; phần này chưa đo. FR không có dive.
- Luật [SUY RA]: map dưới nước là "lớp thứ hai" trùng khít với map mặt nước, không phải hàng xóm.

---

## 2. Đo đồ thị thế giới

### 2.1. Thành phố/thị trấn: số connection và hướng [PRET]

| Game | Settlement | Phân bố số connection (lên/xuống/trái/phải) | Trung bình |
|---|---|---|---|
| EM | 16 (9 CITY, 7 TOWN) | 0: Sootopolis · 1: Littleroot, Lavaridge, Ever Grande · 2: Petalburg, Fortree, Lilycove, Dewford, Fallarbor, Verdanturf, Pacifidlog · 3: Slateport, Rustboro, Mossdeep, **Oldale** · 4: **Mauville** | 2.06 |
| FR Kanto | 11 (`map_type` đều là TOWN) | 1: Indigo · 2: Pallet, Pewter, Vermilion, Celadon, Cinnabar · 3: Viridian, Lavender, Fuchsia · 4: **Cerulean**, **Saffron** (cả 4 đều qua gate) | 2.5 |

- Theo hướng (EM, 33 connection): up 8, down 5, left 9, right 11 [ĐO].
- **Không có settlement nào nối thẳng vào settlement khác**, ở cả hai game. Mọi connection của town/city đều đi tới một ROUTE hoặc OCEAN_ROUTE [ĐO]. Cặp gần nhất vẫn cách một route: Littleroot → Route 101 (20x20, 2 màn hình) → Oldale.
- Map không có connection nào: EM Sootopolis (trong miệng núi lửa, vào bằng Dive/warp), FR Four Island [PRET].

### 2.2. Kích thước route và khoảng cách giữa các thành phố

Kích thước route [PRET] layouts.json. "Màn" = 15x10 ô:
- **EM, route đất 101-123**:
  - Cạnh ngắn gần như luôn 20 (đôi khi 40). Cạnh dài 20-140, trung vị 80 (= 5.3 màn ngang hoặc 8 màn dọc).
  - Ngoại lệ: Route 103 cao 22, Route 109 cao 63. Còn lại là **bội số của 20**.
  - Dài nhất: Route 111 và 119 (40x140), Route 123 (140x20).
- **EM, route biển 124-134**: 60-120 x 40-80. Ít khi nhỏ hơn 80x40.
- **FR Kanto**:
  - Route dọc **gần như luôn rộng 24**, route ngang **luôn cao 20**. Cạnh dài 24-160 (Route 17 và 23: 24x160 = 16 màn). Ngoại lệ: Route 5 rộng **48x40** [PRET] (kiểm chéo 2026-11-18).
  - Town 24x20, city 48x40 (Celadon 60x40, Saffron 66x55).
  - Ô Town Map của FR có trung vị **24x20 metatile** [ĐO] (so `region_map_sections.json` với kích thước layout). Tức **một town = một ô Town Map**, một city = 2x2 ô.
- EM lỏng hơn: trung vị 31.5x26.7 ô mỗi ô Town Map, dao động lớn [ĐO].

Khoảng cách giữa hai settlement liền kề, đo theo **tâm-tới-tâm trên tọa độ thế giới** (§0 bước 4) [ĐO]:

| Cặp (game) | Route ở giữa | dx, dy (ô) | ≈ màn hình |
|---|---|---|---|
| Littleroot → Oldale (EM) | 101 | 0, 40 | 4 dọc |
| Oldale → Petalburg (EM) | 102 | 75, 5 | 5 ngang |
| Petalburg → Rustboro (EM) | 104 | 35, 95 | ~9.5 dọc + 2 ngang |
| Rustboro → Verdanturf (EM) | 116 | 110, 0 | 7 ngang |
| Mauville → Slateport (EM) | 110 | 0, 140 | 14 dọc |
| Mauville → Verdanturf (EM) | 117 | 90, 0 | 6 ngang |
| Lilycove → Mossdeep (EM) | 124 (biển) | 160, 30 | 11 ngang |
| Pallet → Viridian (FR) | 1 | 0, 70 | 7 dọc |
| Viridian → Pewter (FR) | 2 (+ Viridian Forest) | 0, 120 | 12 dọc |
| Cerulean → Saffron (FR) | 5 + gate | 0, 80 | 8 dọc |
| Celadon → Saffron (FR) | 7 + gate | 78, 0 | 5 ngang |
| Lavender → Saffron (FR) | 8 + gate | 108, 0 | 7 ngang |
| Celadon → Fuchsia (FR) | 16/17/18 (Cycling Road) | 6, 180 | 18 dọc |

- Phần lớn cặp liền kề cách nhau **1 route**. Hai đến bốn route chỉ có ở chặng sau: EM Fortree ↔ Mauville (119 + 118), Lilycove ↔ Mauville (121/122/123/118); FR Fuchsia ↔ Lavender (15/14/13/12) [ĐO].
- Kích thước toàn vùng [ĐO]:
  - EM Hoenn: 49 map ngoài trời liền nhau, khung bao **800x383 ô ≈ 53x38 màn**, chỉ 40 % diện tích khung có map. Phần còn lại là "không gian âm" lấp bằng border.
  - FR Kanto: 37 map, **408x400 ô ≈ 27x40 màn**, lấp 36 %.

### 2.3. Lối ra hai bên có khớp nhau không (đo ≥ 10 cặp)

Cột "A" và "B" là các ô đi được (collision 0) trên mép nối, **đổi hết về tọa độ của A** (`a = b + offset`). Cột "B gốc" là tọa độ trong chính map B [ĐO].

| # | A → B (game) | offset | A | B (theo A) | B gốc | Kết luận |
|---|---|---|---|---|---|---|
| 1 | Littleroot ↑ Route 101 (EM) | 0 | 10-11 | 10-11 | 10-11 | khớp, rộng 2 |
| 2 | Oldale ← Route 102 (EM) | 0 | hàng 10-11 | 10-11 | 10-11 | khớp, rộng 2 |
| 3 | Petalburg → Route 102 (EM) | 10 | hàng 16-19 | 16-19 | 6-9 | khớp, rộng 4 |
| 4 | Petalburg ← Route 104 (EM) | -50 | hàng 12-13 | 11-13 | 61-63 | route rộng hơn 1 ô |
| 5 | Route 103 → Route 110 (EM) | -60 | hàng 7-11 | 7-11 | 67-71 | khớp, rộng 5 |
| 6 | Lavaridge → Route 112 (EM) | -40 | hàng 7-13 | 7-13 | 47-53 | khớp, rộng 7 |
| 7 | Mauville ← Route 117 (EM) | 0 | hàng 7-10 | 0-4, 6-12 | 0-4, 6-12 | thành phố là phễu, lối thật 7-10 |
| 8 | Route 118 ↑ Route 119 (EM) | 40 | 57-59 | 56-60 | 16-20 | route trên rộng hơn |
| 9 | Route 111 ← Route 113 (EM) | 0 | hàng 7-10 | 7-10 | 7-10 | khớp, rộng 4 |
| 10 | Viridian ↑ Route 2 (FR) | 12 | 19-23 | 19-23 | 7-11 | khớp, rộng 5 |
| 11 | Viridian ↓ Route 1 (FR) | 12 | 22-25 | 22-25 | 10-13 | khớp, rộng 4 |
| 12 | Pewter → Route 3 (FR) | 10 | hàng 20-23 | 19-22 | 9-12 | **lệch 1 ô**: lối thật 20-22 (3 ô) |
| 13 | Celadon → Route 7 (FR) | 10 | hàng 12-15 | 12-15 | 2-5 | khớp, rộng 4 |
| 14 | Fuchsia ↓ Route 19 (FR) | 12 | 19-28 | 19-28 | 7-16 | khớp, rộng 10 |
| 15 | Route 3 ↑ Route 4 (FR) | 60 | 68-75 | 68-75 | 8-15 | khớp, rộng 8 |
| 16 | Route 22 ↑ Route 23 (FR) | 0 | không | không | không | **chỉ để nhìn**, đi qua gate |
| 17 | Verdanturf ↑ Route 116 (EM) | -80 | không | không | không | **chỉ để nhìn**, đi qua Rusturf Tunnel |

Tổng hợp trên mọi mép đất (bỏ Safari, Frontier, map prototype) [ĐO]:

| | EM (32 mép đất) | FR (48 mép đất) |
|---|---|---|
| Khớp từng ô | 9 | 26 |
| Một bên rộng hơn (tập này chứa tập kia) | 12 | 13 |
| Chồng một phần | 8 | 5 |
| Không có ô đi được chung (connection chỉ để nhìn) | 3 (Verdanturf↔116, 112↔113, 114↔115) | 4 (Route 22↔23 và Saffron) |
| Bề rộng đoạn đi được liền dài nhất, trung vị | **5 ô** (2-10, một ngoại lệ 35 ở bãi biển Slateport: 35 ô collision 0 ở cột 3-37 gồm cả ô nước elevation 1; phần đất (elevation 3) chỉ 28 ô, cột 8-35 (kiểm chéo 2026-11-18)) | **3.5 ô** (1-13) |

- Mép biển (đa số ô là nước): 21/24 ở EM chỉ chồng một phần. Đảo đá và bờ hai bên không cần khớp, vì Surf đi qua bất kỳ ô nước nào trùng nhau [ĐO].
- Đọc kết quả [SUY RA]: FRLG (remake, lưới 24x20 cứng) khớp từng ô ở 54 % mép đất. EM khớp ở 28 %, nhưng gần như luôn có một bên làm "phễu" hẹp hơn. **Không mép đất nào có giao rỗng mà lại cho đi qua.** Mép không có ô chung đều có lối thay thế (gate, hang).
- Cỏ cao trên mép [ĐO, EM]: metatile `General_TallGrass 0x00D` / `LongGrass 0x015` ([PRET] `include/constants/metatile_labels.h`) xuất hiện trên hàng mép ở 2/128 cạnh có connection (Route 119 và 120 phía Đông). Cả hai đều nằm **ngoài** đoạn chồng (hàng 61-125 và 52-59, trong khi đoạn chồng là 0-19 và 80-99). Tức là **0 bãi cỏ nằm vắt qua đường nối**. FR chưa đo, vì encounter type nằm trong attribute chứ không theo id.

### 2.4. Gate và lối đi gián tiếp: khi nào Gen 3 không nối liền

Passage (nhóm map trong nhà/hang chạm ≥ 2 map ngoài trời) [ĐO, từ `warp_events`]:

| Game | Passage | Nối | Lý do (gameplay) |
|---|---|---|---|
| FR | `ROUTE5_SOUTH_ENTRANCE`, `ROUTE6_NORTH_ENTRANCE`, `ROUTE7_EAST_ENTRANCE`, `ROUTE8_WEST_ENTRANCE` | Route 5/6/7/8 ↔ Saffron | lính gác chặn cho tới khi có trà; xem phần kỹ thuật dưới |
| FR | `ROUTE22_NORTH_ENTRANCE` | Route 22 ↔ Route 23 | trạm kiểm tra huy hiệu; mép nối chỉ để nhìn |
| FR | `ROUTE16_NORTH_ENTRANCE_1F`, `ROUTE18_EAST_ENTRANCE_1F` | trong Route 16 / 18 (2 cửa cùng một route) | cổng Cycling Road: script `FLAG_SYS_ON_CYCLING_ROAD`, "NeedBikeTrigger" [PRET] `scripts.inc` |
| FR | `ROUTE11_EAST_ENTRANCE`, `ROUTE12_NORTH_ENTRANCE`, `ROUTE15_WEST_ENTRANCE` (có 2F) | trong cùng route | tầng 2 có ống nhòm và aide; Route 11 ống nhòm nhìn Snorlax [PRET] |
| FR | `ROUTE2_VIRIDIAN_FOREST_{SOUTH,NORTH}_ENTRANCE` | Route 2 ↔ Viridian Forest | đổi tileset và không khí (rừng: `WEATHER_SHADE`) |
| FR | Underground Path N-S, E-W; Diglett's Cave | Route 5↔6, 7↔8, 2↔11 | đường tắt vòng qua Saffron, nối Viridian và Vermilion |
| EM | `ROUTE110_SEASIDE_CYCLING_ROAD_{NORTH,SOUTH}_ENTRANCE` | trong Route 110 (2 cửa) | cổng đường xe đạp |
| EM | `ROUTE121_SAFARI_ZONE_ENTRANCE` | Route 121 ↔ Safari Zone | quầy vé |
| EM | Rusturf Tunnel, Meteor Falls, Terra Cave | Route 116↔Verdanturf, 114↔115, … | hang/HM gate; Verdanturf↔116 có connection để nhìn nhưng không đi được |

- **Hoenn không có nhà cổng nào giữa hai map ngoài trời khác nhau** trên đường chính, chỉ có hang và đường hầm [ĐO]. Gate nằm trong Route 110 chỉ là trạm xe đạp.
- Phát hiện kỹ thuật ở FR Saffron [PRET + ĐO]:
  - `SaffronCity` thật có kích thước **66x55**. Nhưng các route 5/6/7/8 nối vào `SAFFRON_CITY_CONNECTION`, một layout giả **48x40** cùng tileset Saffron, không có event nào.
  - Connection của Saffron thật đi một chiều tới các route (8 cặp lệch ở §1.5). Đặt toàn cục thì gặp 5 xung đột vị trí [ĐO].
  - Nghĩa là thành phố thật **to hơn ô của nó trên lưới thế giới**. Gate là warp nên che được chỗ không khớp đó. Từ route nhìn sang, người chơi thấy bản giả 48x40, vừa ô 2x2 trên lưới 24x20.
  - [SUY RA] Đây là lý do kỹ thuật thứ hai của gate, bên cạnh lý do cốt truyện: **gate cho phép bên trong một thành phố không bị ràng buộc bởi hình học của route**.

### 2.5. Âm nhạc, thời tiết, tileset và Town Map qua đường nối [ĐO]

| Thuộc tính (cặp nối ngoài trời) | EM (64 cặp) | FR (63 cặp) |
|---|---|---|
| Cùng `music` | 23 | 19 |
| Cùng `weather` mặc định | 64 | 63 |
| Cùng cặp tileset (primary + secondary) | 45 | 43 |
| Cùng border 2x2 (so byte `border.bin`) | 42 | 38 |

- **Nhạc đổi ở gần như mọi mép town ↔ route**. Mép route ↔ route cùng chặng thì giữ nhạc. Ví dụ EM: Route 104-109 cùng `MUS_ROUTE104`, Route 124-128 cùng `MUS_ROUTE120`. FR: Route 3-10 và 16-22 cùng `MUS_ROUTE3` [PRET]. Chỗ đổi nhạc được làm mềm bằng fade (§1.4).
- **Thời tiết không đổi ở đường nối.** Mọi map ngoài trời đều để `WEATHER_SUNNY` (hoặc `NONE` ở khu đặc biệt) trong header. Mưa, tro và sương được bật **giữa route** bằng `coord_events` loại `weather`, thường đặt thành dải ô cắt ngang đường [PRET]:
  - Route 113: 11 ô `VOLCANIC_ASH` + 8 ô `SUNNY`;
  - Route 119: 12 ô `ROUTE119_CYCLE` + 9 ô `SUNNY`;
  - Route 120: 4 ô `RAIN`, 12 ô `SUNNY_CLOUDS`;
  - Route 123: 12 + 10 ô.
  - FR không dùng coord weather.
- **Tileset**: 19/64 (EM) và 20/63 (FR) cặp khác secondary. Ở đó dải nhìn thấy bên hàng xóm được giữ bằng tile primary (§1.3).
- **Border**: 1/3 số cặp có border khác nhau. Khi bước qua, lề thay sang border của map mới. Vì border thường là cây 2x2 cùng kiểu nên khó thấy [SUY RA].
- **MAPSEC**: mỗi route có section riêng. Route chia làm hai map dùng chung section (FR `ROUTE21_NORTH/SOUTH`; Safari Zone EM 6 map cùng `MAPSEC_SAFARI_ZONE`). Ở FR, popup tên không hiện khi section không đổi [PRET].

---

## 3. Thiết kế ở quy mô vùng

### 3.1. Thứ tự tiến trình đặt trên bản đồ (tọa độ tâm, ô, gốc ở góc Tây Bắc khung bao) [ĐO]

**Hoenn (EM)**:
- Littleroot (130,290) → Oldale (130,250) → Petalburg (55,245) → Rustboro (20,150) → biển xuống Dewford (70,370) → Slateport (220,290) → **Mauville (220,150)** → Verdanturf (130,150) / Lavaridge (150,70) / Fallarbor (90,10) → Fortree (340,10) → Lilycove (520,90) → Mossdeep (680,120) → Sootopolis → Ever Grande (780,220).
- Đọc [SUY RA]:
  - Nửa đầu game đi một **vòng ngược chiều kim đồng hồ quanh nửa Tây**: lên Bắc, sang Tây, xuống Nam bằng biển, sang Đông. Vòng khép lại ở Mauville.
  - Nửa sau **quét sang Đông**: lên Bắc qua núi, rồi sang Đông bằng route dài và biển.
  - Mauville ở chính giữa về x, và cũng là thành phố duy nhất có 4 lối.

**Kanto (FR)**:
- Pallet (72,270) → Viridian (72,200) → Pewter (72,80): cột Tây đi thẳng lên Bắc. → Route 3/4 sang Đông → **Cerulean (288,60)** → xuống Nam qua **Saffron (288,140)** hoặc đường hầm → Vermilion (288,220) → Lavender (396,140) → Celadon (210,140) → Fuchsia (216,320) → Cinnabar (72,390) → Route 21 về Pallet → Viridian → Indigo (12,20).
- Đọc [SUY RA]:
  - Bản đồ là **vành đai bao quanh một trung tâm khóa kín (Saffron)**.
  - Cerulean, Saffron, Vermilion thẳng hàng trên cùng cột x = 288. Celadon, Saffron, Lavender gần cùng hàng y ≈ 140. Tức là có một **dấu cộng** ở giữa vành đai.
  - Người chơi đi hết vành ngoài trước khi trung tâm mở cửa. Cuối game, Route 21 (biển) khép vòng về điểm xuất phát.

### 3.2. Hub

| Hub | Lối ra | Ghi chú | Nguồn |
|---|---|---|---|
| Mauville (EM, 40x20) | 4: ↑111 ↓110 ←117 →118 | cả 4 offset 0; city chỉ cao 20 = đúng chiều cao route ngang | [PRET] |
| Oldale (EM town 20x20) | 3: ↑103 ↓101 ←102 | hub của chặng mở đầu | [PRET] |
| Cerulean (FR 48x40) | 4: ↑24 ↓5 ←4 →9 | ↑ Route 24 offset 12, ←/→ offset 10: đặt chính giữa; ↓ Route 5 offset 0 vì Route 5 rộng 48 bằng thành phố (kiểm chéo 2026-11-18) | [PRET] |
| Saffron (FR 66x55) | 4, đều qua gate | hub bị khóa; Underground Path vòng quanh nó | [PRET], §2.4 |
| Lilycove (EM 80x40) | chỉ 2 (←121 →124 biển) | thành phố lớn không nhất thiết là hub | [PRET] |

[SUY RA]: hub = thành phố **4 lối** ở tâm hình học của vùng, thường có lối tắt (đường hầm) song song. Thành phố lớn ở rìa (Lilycove, Mossdeep, Slateport) có 2-3 lối, và một trong số đó là biển.

### 3.3. Hình học đặt route quanh thành phố [PRET + ĐO]

- FR quy chuẩn hoá: city 48x40, route dọc 24 rộng nối với offset **±12**, route ngang 20 cao nối với offset **±10**. Kết quả là route luôn ở giữa cạnh thành phố. Ngoại lệ: Route 5 (48x40) nối Cerulean và `SAFFRON_CITY_CONNECTION` với offset 0, vì rộng bằng city (kiểm chéo 2026-11-18).
- EM thường dùng offset 0 (route sát góc Tây hoặc Bắc), vì city 40 rộng và route 40 rộng. EM cũng có căn giữa: Lilycove (cao 40) `left → Route121 offset 10`, `right → Route124 offset -10` [PRET] (kiểm chéo 2026-11-18). Offset âm lớn (−40 … −100) xuất hiện khi một route dài nối vào giữa cạnh dài của route khác (Route 103 → 110 `−60`, Route 122 → 123 `−100`).
- Lối ra trong thành phố thường **không** nằm giữa cạnh map. Lối nằm ở chỗ con đường chạm mép. Ví dụ: lối Đông của Petalburg ở hàng 16-19 trên 30 hàng; lối Nam của Viridian ở cột 22-25 trên 48 cột (MC§1.3).

---

## 4. Luật thực hành cho engine Mons

### 4.1. Checklist ghép hai map làm bằng tay

**Dữ liệu**
- [ ] Ghi connection ở **cả hai** map, hướng ngược nhau, `offset_BA = −offset_AB` (EM: 0/135 lệch). Viết một validator báo lỗi khi thiếu chiều ngược.
- [ ] Quy ước: `a = b + offset` dọc theo mép. Offset dương = hàng xóm lệch sang phải hoặc xuống dưới.
- [ ] Nếu Mons dùng **tọa độ thế giới** (camera liên tục, minimap, streaming), BFS mọi connection và báo lỗi khi một vòng không khép. EM có vòng lệch 2 ô (§1.5); Mons không nên chấp nhận.
- [ ] Cạnh dài được phép có nhiều hàng xóm (EM Route 111, 124). Khi đó các đoạn `[offset, offset+len)` không được chồng lên nhau.
- [ ] Map không có lối đi chung vẫn có thể có connection **chỉ để nhìn** (vách núi, tường gate). Đánh dấu rõ loại này để validator khỏi báo lỗi "không có lối".

**Hình**
- [ ] Ô đi được trên mép A và trên mép B (sau khi cộng offset) **trùng từng ô**. Nếu cố ý làm phễu thì cho bên rộng hơn lùi 1-2 ô vào trong, không để ô thừa sát mép (Pewter ↔ Route 3 lệch 1 ô là lỗi nhỏ có thật, §2.3 #12).
- [ ] Lối đi qua mép rộng 2-5 ô trên đất (trung vị EM 5, FR 3.5); biển rộng tuỳ ý.
- [ ] Tường cây/vách **tiếp tục** qua mép: hai ô ngay cạnh lối ra ở hai bên phải cùng là "tường", và tường cây 2x2 khớp lưới chẵn ở cả hai map (MC§2.3). Map ghép theo bội số 2 ô, offset chẵn.
- [ ] **Không đặt cỏ cao vắt qua đường nối**: EM có 0/128 trường hợp (§2.3). Cỏ nên cách mép ≥ 1 ô để bộ đếm encounter không bị reset ngay giữa bãi.
- [ ] Không đặt NPC, trainer, biển báo hay warp trong 1-2 hàng sát mép [SUY RA]: sau khi qua, object của map cũ biến mất, nên trainer nhìn xuyên mép sẽ không hoạt động.
- [ ] Dải **7 ô** sát mép (8 ở phía Đông nếu bám đúng số GBA) chỉ dùng tile có ở **cả hai** tileset. Với Mons: hoặc render hàng xóm bằng tileset của chính nó (khuyên dùng, engine hiện đại làm được), hoặc giữ dải đó bằng piece chung (cây, cỏ thấp, đường, nước).
- [ ] Dùng **cùng border** (cùng khối cây 2x2) cho hai map liền nhau. Nếu khác thì ô ngoài hàng xóm sẽ "nhảy" hình khi bước qua.
- [ ] Bề ngang route nhỏ hơn cạnh thành phố: phần lề còn lại sẽ hiện border của map đang đứng. Chọn border hợp với rìa thành phố.

**Không khí**
- [ ] Nhạc đổi ở mép town ↔ route, giữ nguyên giữa các route cùng chặng; fade ngắn (~8 frame) khi đổi.
- [ ] Thời tiết **không** đổi ở mép. Đổi bằng dải trigger giữa route (kiểu `coord_events` weather).
- [ ] Popup tên vùng chỉ hiện khi section đổi (cách của FR). Route chia thành 2 map dùng chung section.
- [ ] Dive/tầng dưới: cùng kích thước, offset 0, warp cùng (x, y).

### 4.2. Khi nào dùng gate thay cho đường nối liền

Dùng gate (warp vào nhà cổng 1 màn hình, cửa 2 ô ở mỗi phía) khi:
1. **Thành phố to hơn ô của nó** trên lưới thế giới (FR Saffron 66x55 trong ô 48x40). Gate tách hình học bên trong khỏi hình học route.
2. Cần **chốt kiểm tra** (huy hiệu, vật phẩm, xe đạp, sự kiện).
3. Đổi hẳn tileset hoặc môi trường (rừng, Safari, hang).

Nếu dùng gate, vẫn có thể giữ connection "chỉ để nhìn", để từ route vẫn thấy mái nhà thành phố. Muốn vậy thì phần ngoài cùng của thành phố phải khớp với bản giả hoặc với kích thước ô.

### 4.3. Mini-world đề xuất cho Mons [SUY RA]

Đơn vị lưới theo FR: **1 ô vùng = 24x20 metatile** (1.6 x 2 màn GBA). Town = 1x1 ô, city = 2x2 (48x40), hub hoặc cảng = 3x3 hoặc 3x2 (72x60, 72x40; Saffron 66x55 là tiền lệ). Route dọc rộng 24, route ngang cao 20. Offset căn giữa là ±12 (route dọc vào city 48), ±24 (vào city 72), ±10 (route ngang vào city cao 40), ±20 (vào city cao 60).

Tọa độ thế giới (gốc ở góc Tây Bắc của Hub H). Đã kiểm bằng script [ĐO trên phác thảo]: cả 24 connection cho đúng gốc tọa độ, không có map nào chồng nhau, và vòng H → B → C → H khép kín.

```
 x:  12   60                        156 180
     +----+                          
 -120| B  |==== R5 120x20 ===========+--+   y=-110..-90
     +----+                          |R6|   24x100
       |R3 24x80                     |  |
     0 +--------+                 144+--+-----+
       |   H    |== R7 72x20 ========|   C    |== R8 (biển) →
       | 72x60  |   y=20..40         | 72x40  |
    60 +--------+                    +--------+  y=10..50
       |R2 24x60
   120 +----+
       | A  | 48x40
   160 +----+
       |R1 24x40
   200 [T0 24x20]
```

| Map | Gốc (x,y) | Kích thước | Connection (`offset` theo §1.2) |
|---|---|---|---|
| T0 Start town | (24,200) | 24x20 | ↑ R1 `0` |
| R1 | (24,160) | 24x40, 4 màn, không trainer | ↓ T0 `0`, ↑ A `−12` |
| A City | (12,120) | 48x40 | ↓ R1 `12`, ↑ R2 `12` |
| R2 | (24,60) | 24x60 | ↓ A `−12`, ↑ H `−24` |
| **H Hub** | (0,0) | 72x60, 4 lối | ↓ R2 `24`, ↑ R3 `24`, → R7 `20`, ← dành cho mở rộng |
| R3 | (24,−80) | 24x80 (rừng; có thể thêm hang song song) | ↓ H `−24`, ↑ B `−12` |
| B City Bắc | (12,−120) | 48x40 | ↓ R3 `12`, → R5 `10` |
| R5 | (60,−110) | 120x20 (8 màn, giống FR Route 20) | ← B `−10`, ↓ R6 `96` |
| R6 | (156,−90) | 24x100 | ↑ R5 `−96`, ↓ C `−12` |
| C City cảng | (144,10) | 72x40 | ↑ R6 `12`, ← R7 `10`, → R8 `0` |
| R7 | (72,20) | 72x20 | ← H `−20`, → C `−10` |
| R8 biển | (216,10) | 72x40 | ← C `0` |

Lưu ý thiết kế:
- Vòng **H → B → C → H** cho người chơi một vòng giữa game, kiểu vòng quanh Mauville của EM. Khoảng trống giữa vòng (x 72-156, y −90…20) là "không gian âm": núi, hồ hoặc rừng, không vẽ map. Có thể đặt một hang nối R3 với R7 làm lối tắt, giống Underground Path.
- H có 4 lối như Mauville/Cerulean. Nếu bên trong H cần lớn hơn 72x60 thì dùng gate ở các lối như Saffron (§4.2) và giữ một layout 72x60 "để nhìn" cho route.
- Khoảng cách tâm-tới-tâm: T0 → A 7 màn, A → H 11 màn dọc, H → B 13 màn dọc, H → C ≈ 10 màn ngang. Các số này nằm trong dải Gen 3 (§2.2: 4-14 màn).
- Nhạc: T0 / A / H / B / C mỗi nơi một bài. R1-R2 chung bài "chặng đầu", R3/R5/R6/R7 chung bài "chặng giữa", R8 bài biển.
- Diện tích lấp: 30 % khung bao 216x340 (25 % nếu tính cả R8, khung 288x340). Thưa hơn Hoenn (40 %) và Kanto (36 %) một chút, nên thêm map phụ (hang, khu rừng) vào vùng trống nếu muốn dày hơn.
- Trước khi vẽ map, chạy validator BFS (§4.1). Khi đổi kích thước bất kỳ map nào trong vòng (kiểu Route 103 cao 22 của EM), offset của cả vòng phải được tính lại.

---

## Phụ lục: chưa xác minh

- Hình thật của các dải seam có nhiều metatile secondary khác tileset (EM 112 → 113, 134 → Slateport; FR Route 5/6/7/8 → Saffron giả, Route 22 ↔ 23): chưa chạy emulator.
- Số ô dọc hiển thị qua mép (4-5) suy ra từ màn 240x160, chưa đo vị trí camera chính xác.
- Ô "đi được" ở §2.3 chỉ xét collision; chưa xét behaviour hay elevation (có thể có ô collision 0 nhưng là nước sâu hoặc bậc). Kết quả "phễu" có thể đếm thừa vài ô.
- Cỏ cao vắt qua mép chưa đo ở FR (encounter nằm trong attribute).
- Lý do cốt truyện của từng gate FR (Route 11/12/15) chỉ đọc lướt `scripts.inc`; chưa đọc hết lời thoại.
- Lý do Route 103 cao 22 (gây vòng lệch 2 ô) chưa rõ là cố ý hay lỗi.

---

## Phụ lục: ghi chú sau kiểm chéo (2026-11-18)

- §0 và §2.3 coi một ô là "mở" chỉ theo collision. Vì vậy ô đất đối diện ô nước bên kia mép cũng bị tính là khớp. Hai ví dụ: Rustboro↑Route 115 thực ra là "khớp, 5 ô", và Vermilion↑Route 6 bằng đất chỉ có 3 ô. Các số đếm theo loại trong bảng tóm tắt §2.3 (EM 9/12/8, FR 26/13/5) và trung vị bề rộng (5 và 3.5) có thể lệch vài đơn vị. Cần đo lại với điều kiện hai bên cùng elevation: chưa xác minh.
- Ví dụ rõ cho trường hợp phễu: Mauville↓Route 110. Phía thành phố có hai lối 7 ô, nhưng tại mép chỉ còn 7 + 1 ô (gen3-city-layout.md §2.3).
