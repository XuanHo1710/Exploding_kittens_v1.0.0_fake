# pkmnmap.com: bản đồ Emerald ghép liền, đo bố cục vĩ mô của Hoenn cho world Mons

Mục đích: dữ liệu pret cho từng map và từng connection rất chi tiết, nhưng không cho thấy **cả vùng Hoenn như một bức tranh**. [pkmnmap.com/Maps/Emerald](https://pkmnmap.com/Maps/Emerald/) có đúng thứ đó: toàn bộ overworld Emerald ghép liền trong một bản đồ Leaflet. Tài liệu này mô tả site cung cấp gì, đo bố cục vĩ mô của Hoenn (khung bao, tỉ lệ đất/biển/khu dân cư/route, khoảng cách, vòng, ngõ cụt, không gian âm, mép thế giới), rồi so với `assets/maps/world.json` hiện tại của Mons và đề xuất layout kế tiếp.

Tài liệu không lặp lại những gì đã có ở:
- [gen3-world-connections.md](./gen3-world-connections.md) (ký hiệu **WC§n**): cơ chế offset (WC§1.2), engine vẽ gì qua đường nối (WC§1.3), kích thước route và khoảng cách giữa các cặp settlement liền kề (WC§2.2), gate (WC§2.4), thứ tự tiến trình trên bản đồ (WC§3.1), hub (WC§3.2), mini-world đề xuất (WC§4.3).
- [gen3-city-layout.md](./gen3-city-layout.md) (ký hiệu **CL§n**): bố cục bên trong từng thành phố.
- [gen3-map-composition.md](./gen3-map-composition.md) (ký hiệu **MC§n**): border 2x2 và connection cơ bản (MC§1.3).

Quy ước độ tin cậy (giữ như WC và CL):
- **[PRET]**: đọc trực tiếp từ mã nguồn hoặc dữ liệu pret.
- **[SITE]**: đọc trực tiếp từ file HTML/JS của pkmnmap.com.
- **[ĐO]**: tôi tự chạy script rồi đếm (trên dữ liệu pret, trên file JS của site, hoặc trên ảnh tile của site). Phương pháp ở §0.
- **[ĐO-ẢNH]**: đếm theo màu pixel trên ảnh tile zoom thấp (2 px mỗi metatile). Phân loại "nước" bằng ngưỡng màu, có thể lệch vài phần trăm.
- **[SUY RA]**: suy luận từ số liệu cứng, không có nguồn nào nói thẳng.
- **chưa xác minh**: chưa kiểm chứng được trong lần nghiên cứu này.

Ngày truy cập: 2026-11-18. Nguồn: trang `https://pkmnmap.com/Maps/Emerald/`, các script `Maps/Emerald/Scripts/{config,maps,vectors,markers,trainers}.js`, `Master/Scripts/pkmn-map-{core,configure,init,renderers,legacy-markers}.js`, trang chủ `https://pkmnmap.com/`, và tile `Content/Tilesets/{OverworldTrainers,Underwater}/3/{x}/{y}.png`. Tất cả trả HTTP 200 qua `curl`. Đối chiếu với `pret/pokeemerald` commit `9103e52` (cùng bản clone dùng cho WC). Không có nguồn nào bị lỗi tải.

---

## 0. Phương pháp [ĐO]

1. Tải HTML của trang và 9 file JS, đọc cấu hình Leaflet, mẫu URL tile và hàm đổi tọa độ.
2. Tải zoom 3 của lớp Overworld (7x3 = 21 tile 256 px, tổng ~0,3 MB) và lớp Underwater (21 tile), ghép thành một ảnh 1792x768 trong scratchpad. Không đưa ảnh nào vào repo.
3. Đặt 49 map ngoài trời của EM bằng BFS qua connection (giống WC§0 bước 4), xuất hình chữ nhật của từng map theo tọa độ thế giới.
4. So hai nguồn: lấy pixel giữa mỗi metatile trên ảnh site (2 px/ô ở zoom 3). Kiểm tra ô nằm trong hình chữ nhật pret thì có màu, ô ngoài thì trong suốt.
5. Phân loại ô: "nước" khi `b > 150`, `b > r + 60`, `b > g + 40` (nước Hoenn trên site có màu khoảng `#546CD0`); "cây tối" khi xanh lá chiếm ưu thế và `r < 130`.
6. Không gian âm: flood-fill các ô không thuộc map nào trong khung bao, tách thành thành phần liên thông, đánh dấu thành phần nào chạm mép khung.
7. Đồ thị: đỉnh = map ngoài trời, cạnh = connection hai chiều. Đếm bậc, số vòng độc lập (`E − V + 1`), liệt kê các vòng cơ sở theo cây BFS từ Littleroot.
8. Script nằm trong scratchpad của phiên (`tools/stitch.py`, `tools/macro.py`, `tools/macro2.py`, `tools/plan.py`), không đưa vào repo.

---

## 1. Site cung cấp gì

### 1.1. Kỹ thuật

| Mục | Giá trị | Nguồn |
|---|---|---|
| Thư viện | Leaflet (`Master/Leaflet/leaflet.js`), `crs: L.CRS.Simple`, `preferCanvas: true` | [SITE] `pkmn-map-core.js` dòng 57-70 |
| Ảnh nền | **Tile pyramid**, không phải một ảnh lớn. Tile 256x256 PNG, URL `Content/Tilesets/{shortname}/{z}/{x}/{y}.png` (tương đối với `Maps/Emerald/`). Tile ngoài vùng trả 404 | [SITE] `pkmn-map-configure.js` dòng 97; [ĐO] |
| Lớp Overworld | `shortname: "OverworldTrainers"`, zoom 3-7 | [SITE] `maps.js` |
| Lớp thay thế | `Underwater` (nút "Overworld / Underwater"), zoom 3-7 | [SITE] `config.js` `alternateMaps`, `maps.js` |
| Map phụ | 16 dungeon riêng, mỗi cái một bộ tile: Abandoned Ship, Aqua Hideout, Fiery Path, Granite Cave, Jagged Pass, Magma Hideout, Meteor Falls, Mt Chimney, Mt Pyre, New Mauville, Petalburg Woods, Rusturf Tunnel, Safari Zone, Shoal Cave, Sootopolis, Victory Road; zoom 4-5 đến 7 | [SITE] `maps.js` |
| Nhà trong thành phố (Center, Mart, nhà dân, Gym) | **không có** trong danh sách map | [SITE] `maps.js` |
| Nút khác | ô tìm kiếm, bộ lọc marker, "Maps List", "Grid On/Off" (lưới ô) | [SITE] `index.html` |
| Tác giả | "Maker: Jaxson Keenes"; trang chủ ghi "Jaxson Keenes ©". Không thấy giấy phép nội dung nào | [SITE] `pkmn-map-configure.js` dòng 93-94, trang chủ |

### 1.2. Hệ tọa độ: trùng với lưới metatile [SITE + ĐO]

- `config.js`: `tile: { x: -95.7421875, y: 199.9921875, size: 0.249990234375, tileSize: 256 }`. Khung bao Leaflet là `[(-95.74, 0), (0, 199.99)]` đơn vị CRS.
- Một metatile = `size` ≈ **0,25 đơn vị CRS**. Với `CRS.Simple`, zoom `z` cho `2^z` px mỗi đơn vị, tức **`2^z / 4` px mỗi metatile**:

| Zoom | px/metatile | Toàn bản đồ (px) | Ghi chú |
|---|---|---|---|
| 3 | 2 | 1600x766 (7x3 tile) | zoom nhỏ nhất, tôi dùng để đo |
| 6 | 16 | 12800x6128 | **độ phân giải gốc GBA** (`focusZoom: 6`) |
| 7 | 32 | 25600x12256 | phóng x2 |

- Khung bao: 199,99 / 0,25 = **800** cột, 95,74 / 0,25 = **383** hàng. Khớp đúng khung bao **800x383** mà WC§2.2 đo từ pret.
- Marker dùng thẳng tọa độ metatile: `markerSet(lat, lng, …)` với `lat = −hàng`, `lng = cột`, gốc ở góc Tây Bắc khung bao. Hàm `getCordfromLoc(lat, lng)` chỉ nhân với `size` rồi lệch nửa ô [SITE] `pkmn-map-legacy-markers.js` dòng 26-31.
  - Kiểm [ĐO]: trainer Route 102 "Youngster Allen" ở `(-246, 89)` → hàng 246, cột 89. Theo BFS pret, Route 102 chiếm cột 70-119, hàng 242-261: nằm trong.
  - Entrance "Aqua Hideout" `(-75, 550)` rơi vào Lilycove (cột 480-559, hàng 70-109); "Abandoned Ship" `(-366, 169)` rơi vào Route 108.
- Map phụ (dungeon) có khung riêng (`bounds: [-48, 100]`), tọa độ của chúng **không** nằm trong hệ tọa độ thế giới.

### 1.3. Dữ liệu đọc được bằng máy [SITE + ĐO]

| File | Nội dung | Đếm |
|---|---|---|
| `markers.js` (32 KB) | `markerSet(lat, lng, tên, mô tả, icon, map, destLat?, destLng?)`. Entrance có tọa độ đích: một **đồ thị warp** giữa overworld và dungeon | Overworld: 81 item, 79 berry, 59 hidden, 28 TM/HM, 22 entrance, 15 trainer. Dungeon: 64 item, 50 hidden, 26 entrance, 16 TM |
| `trainers.js` (82 KB) | đội hình, tiền thưởng, lời thoại của trainer overworld. Dòng đầu: `// Generated from EmeraldDecomp by tools/generate-overworld-trainers.ps1` | 283 trainer |
| `vectors.js` (266 KB) | GeoJSON `FeatureCollection` cho từng lớp: polygon vùng gặp Pokémon theo route, kèm bảng loài theo cách gặp (`Grass`, `Fishing`, `Old/Good/Super Rod`, `Rock Smash`) | `OverworldVector` có 49 feature mang bảng "Pokémon" |

- Nguồn dữ liệu: trainer sinh tự động từ decomp (pret). Item/berry và ảnh tile không ghi nguồn. Ảnh tile có vẻ được dựng từ dữ liệu game, vì trùng từng ô với cách đặt pret (§2.1), nhưng **cách dựng chưa xác minh**.
- Không có JSON hình chữ nhật cho từng map, cũng không có connection. Muốn có ranh giới map thì phải tự đặt từ pret (§0 bước 3).

### 1.4. Bản quyền

- Ảnh tile là đồ họa của game (© Nintendo / Creatures / GAME FREAK). Phần ghép và marker là công của tác giả site, không có giấy phép mở [SITE].
- Lần này tôi chỉ tải ~1,3 MB tile zoom 3 vào scratchpad để đo, không chép ảnh hay dữ liệu marker nào vào repo. Mọi số trong tài liệu là số đo, không phải nội dung site.

---

## 2. Đo bố cục vĩ mô của Hoenn

### 2.1. Ảnh site trùng khít với cách đặt map của pret [ĐO]

- BFS qua connection đặt được 49 map ngoài trời, khung bao 800x383. Ảnh site cũng đúng 800x383 ô.
- Ô thuộc map pret có màu trên ảnh site: **122200/122540 (99,7 %)**. Ô ngoài mọi map mà có màu: **410/183860 (0,2 %)**. Số này là các vệt 1 ô dọc mép Route 114, Route 116 và hàng dưới cùng, do tile bị resample.
- Hệ quả: site **không vẽ border** (WC§1.3, MC§1.3). Chỗ không có map thì để trong suốt. Vì vậy ảnh site là bản "chỉ map", không phải cảnh người chơi thấy ở rìa.
- 19 map ngoài trời không nối bằng connection (Sootopolis, Safari Zone x6, Battle Frontier x2, Mt Chimney, Jagged Pass, Mt Pyre, Sky Pillar, Southern Island, Petalburg Woods…) **không có** trên lớp Overworld. Site đưa vài cái thành dungeon riêng (§1.1). Battle Frontier, Sky Pillar, Southern Island thì vắng hẳn [ĐO].
- Lớp Underwater: 30400 ô có màu, khung cột 560-759, hàng 60-299 [ĐO-ẢNH]. Tức là vùng lặn chỉ nằm dưới cụm biển Đông (Route 124-129).

### 2.2. Diện tích theo loại map [ĐO + ĐO-ẢNH]

Khung bao 800x383 = 306400 ô (≈ 53x38 màn 15x10). Map phủ 122580 ô = **40 %** (khớp WC§2.2).

| Loại (`map_type`) | Số map | Ô | % khung bao | % diện tích có map | % ô là nước [ĐO-ẢNH] |
|---|---|---|---|---|---|
| TOWN | 7 | 3160 | 1,0 | **2,6** | 10 |
| CITY | 8 placed (thiếu Sootopolis) | 16900 | 5,5 | **13,8** | 17 |
| ROUTE (đất, 101-123) | 23 | 56880 | 18,6 | **46,4** | 23 |
| OCEAN_ROUTE (124-134) | 11 | 45600 | 14,9 | **37,2** | 73 |
| Tổng | 49 | 122580 | 40,0 | 100 | **40,4** |

Đọc [SUY RA]:
- **Khu dân cư chỉ chiếm ~16 % diện tích có map.** Hơn 80 % là route. Người chơi ở ngoài trời nhiều hơn trong thành phố khoảng 5 lần theo diện tích.
- Nước chiếm ~40 % diện tích có map. Route biển không phải "toàn nước": 27 % là đảo đá, bãi cát, bãi cạn. Route đất cũng có 23 % nước (ao, sông, bờ biển như Route 104-109).
- Ngay cả trong thành phố, 17 % là nước (Slateport, Lilycove, Mossdeep là thành phố cảng).

### 2.3. Hình dạng tổng thể [ĐO + SUY RA]

Khung bao chia làm hai nửa rõ rệt:
- **Nửa Tây, x 0-400 (đất liền)**: lưới route đất dày, gồm 11/15 settlement có trên ảnh. Kích thước 400x383, phủ 45 % (68580 ô) [ĐO, cộng diện tích map có x < 400]; nửa Đông chỉ phủ 35 %.
- **Nửa Đông, x 400-800 (biển)**: một dải đất mỏng ở trên (Route 121-123, Lilycove), một khối biển 160x240 (Route 124-127 quanh Mossdeep và hồ miệng núi lửa Sootopolis), dải biển 560x40 dọc đáy (Route 129-134), và Ever Grande là "ngõ cuối" ở mép Đông.
- Tọa độ tâm các settlement đã có ở WC§3.1. Littleroot (130,290) ở góc Tây Nam của nửa đất liền. Ever Grande (780,220) ở mép Đông. **Đường tiến trình đi chéo khung bao từ Tây Nam sang Đông**.
- Dải biển phía Nam (Route 105-109 ở Tây, 129-134 ở Đông) khép quanh đáy. Ở nửa Đông, biển còn lên tới tận Route 124. Đây là chỗ Surf mở bản đồ.

### 2.4. Khoảng cách giữa các settlement [ĐO]

Khoảng cách tâm-tới-tâm tới **settlement gần nhất** (đường chim bay, ô). "Màn" quy đổi theo cạnh 15 (ngang):

| Settlement | Gần nhất | Ô | ≈ màn ngang |
|---|---|---|---|
| Littleroot ↔ Oldale | nhau | 40 | 2,7 |
| Petalburg | Oldale | 75 | 5 |
| Verdanturf | Lavaridge | 83 | 5,5 |
| Fallarbor | Lavaridge | 85 | 5,7 |
| Mauville | Verdanturf | 90 | 6 |
| Slateport | Littleroot | 90 | 6 |
| Dewford | Littleroot | 100 | 6,7 |
| Rustboro | Petalburg | 101 | 6,7 |
| Mossdeep ↔ Ever Grande | nhau | 141 | 9,4 |
| Lilycove | Mossdeep | 163 | 10,9 |
| Fortree | Mauville | 184 | 12,3 |
| Pacifidlog | Lilycove | 192 | 12,8 |

- Trung vị **90 ô (6 màn)**, min 40, max 192 [ĐO].
- **Mật độ giảm dần theo tiến trình**: 8 settlement đầu game nằm trong 40-101 ô của nhau. Chặng cuối (Fortree, Lilycove, Mossdeep, Pacifidlog, Ever Grande) cách nhau 141-192 ô. Các khoảng trống lớn của chặng cuối được lấp bằng route biển và route dài 140 ô (Route 119, 123).
- Số **route giữa hai settlement liền kề** (đường ngắn nhất trên đồ thị connection, không đi qua settlement khác) [ĐO], 25 cặp: 1 route ở 7 cặp, 2 ở 9 cặp, 3 ở 4 cặp (đều quanh Dewford/Pacifidlog), 4 ở 3 cặp (Mauville–Lilycove, Lilycove–Ever Grande, Pacifidlog–Ever Grande), 5-7 ở 2 cặp quanh Pacifidlog. Cặp "1 route" Rustboro–Verdanturf chỉ để nhìn (WC§2.4). Khoảng cách theo tọa độ của các cặp này có ở WC§2.2.

### 2.5. Mạng route: vòng, hub, ngõ cụt [ĐO trên đồ thị connection]

- **49 đỉnh, 56 cạnh → 8 vòng độc lập** (cứ ~6 map có 1 vòng).
- Các vòng cơ sở (theo cây BFS từ Littleroot) và kích thước khung của từng vòng:

| Vòng | Map | Khung (ô) | Ghi chú gameplay [SUY RA] |
|---|---|---|---|
| Tam giác núi | 111 – 112 – 113 | 140x140 | vây quanh Mt Chimney; 112 có dốc một chiều/Jagged Pass |
| Vòng Tây Bắc | Rustboro – 116 – Verdanturf – 117 – Mauville – 110 – 103 – Oldale – 102 – Petalburg – 104 | 240x140 | 116 ↔ Verdanturf chỉ "để nhìn", lối thật qua Rusturf Tunnel (WC§2.4) |
| Vòng núi lớn | 114 – 115 – Rustboro – … – Mauville – 111 – 113 – Fallarbor | 240x262 | khép bằng Meteor Falls / Route 115 |
| Vòng biển Tây Nam | 104 – 105 – 106 – Dewford – 107 – 108 – 109 – Slateport – 110 – 103 – … | 240x223 | khép bằng Surf |
| Vòng Fortree | 118 – 119 – Fortree – 120 – 121 – 122 – 123 | 240x160 | 118 cần Surf; 123 có gờ một chiều về 118 |
| Vòng Mossdeep | 124 – 125 – Mossdeep (và 124 – 126 – 127 – Mossdeep) | 160x80, 160x160 | biển, Dive |
| Vòng lớn nhất | Mauville – 110 – Slateport – 134…129 – 128 – 127 – Mossdeep – 124 – Lilycove – 121…123 – 118 | 560x260 | vòng quanh toàn bộ vùng trung tâm, chỉ khép sau Surf/Waterfall |

- **Hub**: Mauville là map duy nhất bậc 4 trong số settlement. Route 124 cũng bậc 4 (biển). Bậc 3: Oldale, Rustboro, Slateport, Mossdeep và 9 route (104, 110, 111, 112, 113, 118, 121, 127, 128) [ĐO]. Tức là nhiều nút giao nằm **trên route**, không trong thành phố.
- **Ngõ cụt theo connection**: chỉ 3 map: Littleroot (nhà), Lavaridge (cuối nhánh núi), Ever Grande (đích). Nhánh cụt khác đều dẫn tới warp (Sootopolis qua Dive, Safari Zone, Battle Frontier qua phà) [ĐO + SUY RA].
- Phần lớn vòng chỉ **khép được sau một HM** (Surf, Waterfall, Dive) hoặc đi qua một hang. Thiết kế dùng vòng để người chơi quay lại vùng cũ bằng lối tắt mới, không phải để chọn đường tự do từ đầu [SUY RA].

### 2.6. Không gian âm [ĐO]

60 % khung bao (183820 ô) không có map. Flood-fill cho ra 10 thành phần:

| Vùng trống | Khung (cột, hàng, rộng x cao) | Ô | Bị vây kín? | Nằm ở đâu |
|---|---|---|---|---|
| 1 | (240, 100, 400x160) | 40400 | **có** | giữa trục Mauville–Slateport, Route 123 và cụm biển Đông: "lục địa giữa" Hoenn |
| 2 | (40, 242, 160x118) | 15360 | có | trong vòng biển Tây Nam (Petalburg–Dewford–Slateport) |
| 3 | (40, 142, 160x100) | 12500 | có | giữa Route 116/117 và 102/103 |
| 4 | (40, 20, 160x120) | 12120 | có | trong vòng 114–113–111–116 (núi lửa) |
| 5 | (320, 20, 100x120) | 7200 | có | trong vòng Fortree |
| 6 | (240, 260, 560x123) | 49680 | không, chạm mép | biển phía Nam dải Route 129-134 |
| 7 | (400, 0, 400x220) | 37600 | không | góc Đông Bắc, trên Route 121-125 |
| 8-10 | | 5600, 1760, 1640 | không | khe giữa 111 và 119, góc Tây Bắc, đáy Tây |

- Vùng bị vây kín cộng lại **87580 ô = 29 % khung bao**. Vùng chạm mép **96280 ô = 31 %**.
- **Vùng trống được dùng cho các nơi chỉ vào được bằng warp**. Đối chiếu ô Town Map [PRET] `src/data/region_map/region_map_sections.json` (lưới 28x15, mỗi ô ≈ 28,6x25,5 metatile thế giới [ĐO]):
  - Mt Chimney ô (6,2) ≈ (171, 51): ngay rìa vùng 4, trên Route 112.
  - Safari Zone ô (16,2) ≈ (457, 51): vùng 7, ngay trên Route 121.
  - Mt Pyre ô (16,4) ≈ (457, 102): đảo trong Route 122, rìa vùng 1.
  - Sky Pillar ô (19,10) ≈ (543, 255), Southern Island ô (12,14) ≈ (343, 357), Battle Frontier ô (22,12) ≈ (629, 306): cả ba trong vùng biển 6.
  - Phép quy đổi tuyến tính này có sai số ±1 ô Town Map. Vị trí "thật" của các map warp không tồn tại trong tọa độ thế giới, vì chúng không có connection [SUY RA].
- Đọc [SUY RA]: Hoenn **không lấp đầy khung bao**. Mỗi vòng route bao quanh một khối "không đi được" mang một chủ đề (núi lửa, rừng Fortree, lục địa giữa). Mốc cảnh quan đặt vào đó bằng warp, và Town Map vẽ chúng vào khoảng trống.

### 2.7. Mép thế giới [ĐO-ẢNH + PRET]

- Trên ảnh site, ô map nằm sát vùng trống được phân loại: **nước 2522 (41 %), cây tối 1817 (30 %), khác 1474 (24 %: vách đá, cát, núi), trong suốt 241 (4 %)** [ĐO-ẢNH].
- Trong game, phần trống được vẽ bằng **border 2x2 của map hiện tại**, collision luôn = 1 (WC§1.3). Vậy mép thế giới Hoenn là ba loại: **biển** (route biển và bờ biển), **rừng cây 2x2** (route đất), **vách núi** (vùng núi lửa, Route 111/112/114/115).
- Không có tường hay rào nhân tạo ở mép vùng. Mép Đông của Ever Grande và mép Nam của Route 129-134 là biển mở. Người chơi thấy biển kéo dài, nhưng chỉ Surf được trong phạm vi route [SUY RA, chưa chạy emulator].

### 2.8. Độ dài route [PRET, tổng hợp từ WC§2.2]

- Route đất: cạnh ngắn 20 (vài cái 40), cạnh dài trung vị 80. Route biển 60-120 x 40-80.
- Trên tổng thể [ĐO]: 23 route đất phủ 56880 ô, trung bình **2473 ô/route ≈ 16 màn**. 11 route biển phủ 45600 ô, trung bình **4145 ô/route ≈ 28 màn**. Route biển "to" gấp ~1,7 route đất nhưng thưa nội dung hơn.

---

## 3. So với world Mons hiện tại

### 3.1. Mons đang có gì [ĐO trên `assets/maps/world.json`, `assets/maps/world-report.md`, `assets/maps/*/*.tmj`, `assets/maps/world.png`]

| Map | Gốc (x,y) | Kích thước |
|---|---|---|
| hub-city | (0,0) | 72x60 |
| route-2 | (24,60) | 24x60 |
| city-a | (12,120) | 48x40 |
| route-3 | (24,−80) | 24x80 |
| city-b | (12,−120) | 48x40 |
| route-7 | (72,20) | 72x20 |
| port-city | (144,10) | 72x40 |

Đây đúng là 7/12 map của mini-world WC§4.3. Chưa có: T0, R1, R5, R6, R8.

| Chỉ số | Hoenn (EM) | Mons hiện tại |
|---|---|---|
| Map ngoài trời | 49 | 7 |
| Khung bao (ô) | 800x383 | 216x280 |
| % khung bao có map | 40 % | 26 % |
| % diện tích có map là khu dân cư | ~16 % | **70 %** (11040/15840) |
| % nước trong diện tích có map | ~40 % [ĐO-ẢNH] | **10 %** [ĐO-ẢNH, cùng ngưỡng màu trên `world.png`] |
| Vòng độc lập | 8 | **0** (cây, 7 đỉnh 6 cạnh) |
| Ngõ cụt theo connection | 3 (nhà, nhánh núi, đích) | 3/4 settlement (city-a, city-b, port-city) |
| Hub bậc 4 | Mauville (giữa khung) | hub-city bậc 3; lối Tây (←) chưa nối |
| Khoảng cách settlement gần nhất | trung vị 90 ô, 40-192 | hub ↔ city-a 110, hub ↔ city-b 130, hub ↔ port 144 |
| Route giữa hai settlement | 1-5 | luôn 1 |
| Lối ra "treo" | 0 | 2 (`city-a` lối S, `city-b` lối E, theo `world-report.md`) |

### 3.2. Mons thiếu gì so với bố cục Hoenn [SUY RA]

1. **Không có vòng.** World là ngôi sao quanh hub. Hoenn có 1 vòng trên ~6 map, và vòng đầu tiên (Tây Bắc) khép ngay giữa game, quanh Mauville.
2. **Quá nhiều thành phố, quá ít route.** 70 % diện tích là settlement, trong khi Hoenn là 16 %. Route là chỗ chứa cỏ cao, trainer và item. Thiếu route nghĩa là thiếu nội dung gameplay giữa các thành phố.
3. **Không có biển như một lớp bản đồ.** Mons chỉ có dải bờ ở route-7 và port-city. Hoenn dùng biển để khép vòng (Surf) và để bao mép thế giới.
4. **Không gian âm chưa có vai trò.** Vùng trống 72-144 x −80…20 giữa route-3 và route-7 chưa thuộc vòng nào, chưa có mốc warp nào.
5. **Mật độ đều.** Mọi khoảng cách 110-144 ô. Hoenn dày ở đầu game (40-100) và thưa ở cuối (140-190).
6. **Không có nhà xuất phát và route nhập môn.** Hoenn mở đầu bằng cặp Littleroot–Oldale cách nhau 40 ô (2,7 màn), Route 101 nhỏ 20x20.

---

## 4. Bài học cho world Mons

### 4.1. Con số để đặt một vùng [lấy từ §2, SUY RA khi áp dụng]

| Luật | Giá trị đề xuất | Căn cứ |
|---|---|---|
| Khoảng cách settlement gần nhất | 40-100 ô ở đầu game, 140-190 ở cuối; trung vị ~90 ô (6 màn) | §2.4 |
| Diện tích settlement / diện tích có map | 15-25 % | §2.2 (Hoenn 16 %) |
| Diện tích có map / khung bao | 30-40 % | §2.2, WC§2.2 (Kanto 36 %) |
| Vòng | 1 vòng trên 6-8 map; vòng đầu khép khi có ~1/3 số settlement | §2.5 |
| Hub | 1 settlement bậc 4 gần tâm khung; các nút bậc 3 khác đặt trên route | §2.5, WC§3.2 |
| Ngõ cụt | chỉ cho nhà, nhánh có điểm đến (Gym, hang, mốc), và đích cuối | §2.5 |
| Route giữa settlement | 1 route ở chặng đầu, 2-3 ở chặng giữa, 3-5 (có biển) ở chặng cuối | §2.4 |
| Biển | ~1/3 diện tích có map; route biển 60-120 x 40-80, dùng để khép vòng và bao mép | §2.2, §2.8 |
| Không gian âm | mỗi vòng bao một khối có chủ đề, đặt một mốc warp vào đó | §2.6 |
| Mép thế giới | border cây 2x2 cho route đất, nước cho bờ biển, vách cho núi; không dùng tường | §2.7 |

### 4.2. Layout kế tiếp đề xuất [SUY RA; hình học đã kiểm bằng script `plan.py`: không chồng, mọi cặp chạm cạnh đều có đoạn chung]

Giữ nguyên 7 map đang có. Thêm 9 map, lấy 5 map còn thiếu của WC§4.3, cộng một vòng biển phía Nam và một town giữa biển:

```
 x:  0  12 24  48  60   72        144 156 180   216      288
-120     +-B--+===== R5 120x20 =========+--+
         |48x40                         |R6|  24x100
         +-R3-+                         |  |
            |24x80   (vùng âm 1: núi/hồ,|  |
            |         mốc warp từ R3/R7)|  |
   0 +-----H 72x60-----+                +--C 72x40--+== R8 biển 72x40 →
     |                 |== R7 72x20 ====|           |
  60 +-----+R2+--------+                +--+R9a+----+
           |24x60          (vùng âm 2:     |24x60
 120     +-A 48x40-+         vịnh, đảo)  [T2 24x20]  town đảo
         +--R1--+                          |R9b 24x70
 200       [T0]=========== R10 biển 132x20 ==+
           24x20
```

| Map mới | Gốc (x,y) | Kích thước | Nối |
|---|---|---|---|
| T0 Start town | (24,200) | 24x20 | ↑ R1 `0`, → R10 `0` |
| R1 | (24,160) | 24x40 | ↓ T0 `0`, ↑ A `−12` |
| R5 | (60,−110) | 120x20 | ← B `−10`, ↓ R6 `96` |
| R6 | (156,−90) | 24x100 | ↑ R5 `−96`, ↓ C `−12` |
| R8 (biển) | (216,10) | 72x40 | ← C `0` |
| R9a (biển/bờ) | (156,50) | 24x60 | ↑ C `12`, ↓ T2 `0` |
| T2 town đảo | (156,110) | 24x20 | ↑ R9a `0`, ↓ R9b `0` |
| R9b (biển) | (156,130) | 24x70 | ↑ T2 `0`, ↓ R10 `−108` |
| R10 (biển) | (48,200) | 132x20 | ← T0 `0`, ↑ R9b `108` |

Offset ghi theo quy ước WC§1.2 (`a = b + offset`). Offset của các connection cũ giữ nguyên. Hai lối treo trong `world-report.md` được nối: lối S của city-a vào R1, lối E của city-b vào R5.

Kết quả [ĐO trên phác thảo]:
- 16 map, 17 cạnh, **2 vòng**: vòng Bắc H → R3 → B → R5 → R6 → C → R7 → H (đất, khép giữa game); vòng Nam H → R2 → A → R1 → T0 → R10 → R9b → T2 → R9a → C → R7 → H (khép sau Surf).
- Khung bao 288x340, phủ **32 %**. Khoảng cách gần nhất: T0 ↔ A 70, C ↔ T2 91, H ↔ A 110, B ↔ H 130. Trung vị ~91, giống Hoenn.
- Settlement còn chiếm **38 %** diện tích, vẫn cao hơn Hoenn (16 %). Muốn giảm thì kéo dài route (R2 và R3 lên 80-100) hoặc thêm một route giữa H và C, thay vì thêm thành phố.
- Vùng âm 1 (x 72-156, y −90…20, ~84x110) nằm trong vòng Bắc: đặt một mốc chủ đề (núi, hồ, tháp) vào bằng warp từ R3 hoặc R7, giống Mt Chimney trong vòng núi lửa. Vùng âm 2 (x 72-156, y 40-200) nằm trong vòng Nam: vịnh có đảo, giống vòng Dewford.
- Lối Tây của H vẫn để dành mở rộng. Theo Hoenn, đó là chỗ cho nhánh núi kết thúc bằng một town ngõ cụt có Gym (kiểu Lavaridge).
- Trước khi vẽ, chạy `python3 $MG world assets/maps/world.json` (SKILL.md Step 4) để kiểm từng ô ở mép nối. Lưu ý WC§1.3: giữ dải 7 ô gần mép nối bằng tile chung giữa route đất và route biển.

---

## 5. Cách dùng lại site cho các lần nghiên cứu sau

- Tile zoom 3 (2 px/ô) đủ để đo bố cục vĩ mô. Zoom 6 là độ phân giải gốc, dùng khi cần nhìn một vùng cụ thể (tile `6/{x}/{y}`, x 0-49, y 0-23).
- Marker trong `markers.js` và `trainers.js` ở **đúng tọa độ metatile thế giới** (§1.2). Có thể đếm mật độ item/trainer trên từng route bằng cách giao điểm marker với hình chữ nhật pret (§0 bước 3). Lần này chưa làm.
- Site còn có FRLG và Platinum (trang chủ). Có thể lặp lại phép đo cho Kanto (WC§2.2 đã có khung 408x400). Lần này chưa làm.

---

## Phụ lục: giới hạn và chưa xác minh

- Phân loại nước theo màu pixel ở 2 px/ô. Đá trong nước, cầu và nước nông có thể bị đếm sai vài phần trăm. Chưa so với behaviour metatile của pret.
- Cách site dựng ảnh tile (từ decomp, emulator hay ảnh chụp ghép) không được ghi; chỉ biết ảnh trùng 99,7 % với cách đặt pret.
- Vị trí các map chỉ vào bằng warp (§2.6) lấy từ Town Map theo phép quy đổi tuyến tính, sai số ±1 ô Town Map (~±28 metatile).
- Phần "mép thế giới trông thế nào trong game" (§2.7) suy từ border và từ ảnh, chưa chạy emulator.
- Vòng ở §2.5 tính theo connection. Có vòng chỉ "để nhìn" (Route 116 ↔ Verdanturf) và có lối nối qua hang (Meteor Falls, Rusturf) không nằm trong đồ thị này. Số vòng đi được thật phụ thuộc HM và chưa đếm riêng.
- Item, berry và hidden item của site chưa được đối chiếu với pret. Không dùng chúng làm số liệu ở đây.
- Layout §4.2 mới kiểm hình học (chồng/chạm). Chưa kiểm lối ra từng ô, vì các map mới chưa có spec.
