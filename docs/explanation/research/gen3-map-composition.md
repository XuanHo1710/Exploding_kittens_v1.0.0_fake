# Tư duy bố cục bản đồ Gen 3 (RSE + FRLG): từ dữ liệu pret đến cách ghép map bằng piece của repo

Mục đích: giúp người tự tay ghép map overworld (town, route) từ piece của repo (autotile blob 47 ô, connector Prop như fence/ledge, Prop đứng riêng; xem [GLOSSARY.md](../../../GLOSSARY.md)) **nghĩ** như người làm map Gen 3. Tài liệu này dạy cách đọc một map, không chỉ liệt kê số liệu.

Tài liệu không lặp lại các số liệu đã ghi ở [`.agents/skills/pokemon-overworld-generator/references/research.md`](../../../.agents/skills/pokemon-overworld-generator/references/research.md) (behaviour, elevation, border 2x2, offset connection, tỉ lệ cỏ của Route 101-103, quy ước tường cây 2 ô). Chỗ nào cần thì chỉ dẫn link sang đó, ký hiệu **R§n**.

Quy ước độ tin cậy (giữ theo [gen3-visual-style.md](./gen3-visual-style.md), thêm ba nhãn):
- **[PRET]**: đọc trực tiếp từ mã nguồn hoặc dữ liệu pret (`map.json`, `layouts.json`, header C).
- **[ĐO]**: tôi tự giải mã `map.bin` của pret theo `metatile_attributes.bin` rồi đếm hoặc mô phỏng (phương pháp ở §2.0). Đây là số liệu cứng nhưng qua tay tôi xử lý.
- **[SUY RA]**: suy luận từ số liệu cứng, không có dòng nguồn nào nói thẳng.
- **[PHỎNG VẤN]**: lời nhà phát triển (Game Freak), có ghi nguồn và người dịch.
- **[CỘNG ĐỒNG]**: ý kiến của người làm fangame hoặc hack. Đây là kinh nghiệm, không phải sự thật về game gốc.
- **chưa xác minh**: chưa kiểm chứng được trong lần nghiên cứu này.

Ngày truy cập: 2026-11-18. Không truy cập được (nên chỉ dùng snippet tìm kiếm, ghi rõ ở từng chỗ):
- Essentials Docs wiki trên Fandom: HTTP 402.
- daily.pokecommunity.com và pokecommunity.com: HTTP 403.
- Bulbapedia: không dùng (403 ở các lần trước, xem R mở đầu).

---

## 1. Map Gen 3 được dựng thế nào về kỹ thuật

### 1.1. Ba tầng dữ liệu

| Tầng | Nằm ở đâu | Chứa gì | Nguồn |
|---|---|---|---|
| **Tileset** | `data/tilesets/{primary,secondary}/<tên>/` | ô 8x8 (`tiles.png`), palette, `metatiles.bin` (mỗi metatile 8 ô 8x8 = 2 lớp x 2x2), `metatile_attributes.bin` | [PRET] [EM fieldmap.h](https://raw.githubusercontent.com/pret/pokeemerald/master/include/fieldmap.h), R§1 |
| **Layout** | `data/layouts/layouts.json` + `map.bin` + `border.bin` | `width, height`, lưới metatile (u16/ô: id 10 bit, collision 2 bit, elevation 4 bit), border, cặp tileset primary + secondary | [PRET] [EM layouts.json](https://raw.githubusercontent.com/pret/pokeemerald/master/data/layouts/layouts.json), R§2 |
| **Map (header + events)** | `data/maps/<Tên>/map.json` | layout dùng, nhạc, thời tiết, loại map, vùng trên bản đồ khu vực, connection, object/warp/coord/bg events | [PRET] ví dụ [Route1 map.json (FR)](https://raw.githubusercontent.com/pret/pokefirered/master/data/maps/Route1/map.json) |

Hệ quả tư duy [SUY RA]: **hình (layout) tách khỏi nghĩa (header + events)**. Một layout có thể được nhiều map dùng chung. Emerald có 518 map trong 34 nhóm nhưng chỉ có 441 layout [PRET, tôi đếm từ [map_groups.json](https://raw.githubusercontent.com/pret/pokeemerald/master/data/maps/map_groups.json) và layouts.json]. Phần dùng chung chủ yếu là nội thất (Pokémon Center, Mart). Overworld thì mỗi map một layout riêng.

### 1.2. Metatile: đơn vị thật của người vẽ map

- Mỗi metatile 16x16 gồm 2 lớp, mỗi lớp 2x2 ô 8x8. Layer type `NORMAL / COVERED / SPLIT` quyết định lớp nào vẽ đè lên sprite. Ví dụ: tán cây và mái nhà che người chơi. [PRET] R§1, [gen3-visual-style §2](./gen3-visual-style.md).
- Thuộc tính khác nhau giữa hai game:
  - **Emerald**: u16 = behaviour 8 bit + layer type 4 bit.
  - **FireRed**: u32 = behaviour 9 bit (bit 0-8), terrain 5 bit (9-13), **encounter type** 3 bit (24-26), layer type 2 bit (29-30). Nguồn: [PRET] `sMetatileAttrMasks` trong [FR fieldmap.c](https://raw.githubusercontent.com/pret/pokefirered/master/src/fieldmap.c).
  - Tức là FRLG ghi cả "ô này có gặp Pokémon không" vào chính metatile.
- **Collision và elevation nằm trên lưới map, không nằm trong tileset**. Behaviour thì nằm trong tileset. Cùng một metatile cỏ có thể bị chặn ở chỗ này mà đi được ở chỗ khác. [PRET] `MAPGRID_*_MASK` trong [FR global.fieldmap.h](https://raw.githubusercontent.com/pret/pokefirered/master/include/global.fieldmap.h). Chi tiết elevation (3 = mặt đất, 1 = nước, 0 = cầu thang, 15 = cầu) ở R§4.
- **Primary và secondary tileset**:
  - Primary (`gTileset_General`) chứa cỏ, cây, nước, ledge, tức đồ dùng toàn vùng.
  - Secondary chứa đặc sản của khu vực (`gTileset_Petalburg`, `gTileset_Rustboro`, `gTileset_Mauville`; FR: `gTileset_PalletTown`, `gTileset_ViridianCity`).
  - Route dùng secondary của thị trấn gần nhất. Route 101-103 dùng Petalburg, Route 104 dùng Rustboro, Route 110 dùng Mauville; FR Route 1 dùng PalletTown, Route 2 và Route 22 dùng ViridianCity. [PRET] layouts.json của hai game.
  - Đây là cách Gen 3 cho mỗi khu một "giọng" riêng mà vẫn giữ nền chung [SUY RA].

### 1.3. Border, connection, warp

- **Border**: một khối 2x2 metatile lặp vô hạn ngoài mép map, luôn bị ép impassable. Camera đệm 7 ô mỗi bên (`MAP_OFFSET 7`, `MAP_OFFSET_W = 15`). [PRET] [EM fieldmap.h](https://raw.githubusercontent.com/pret/pokeemerald/master/include/fieldmap.h), R§2.
  - Ý nghĩa thiết kế [SUY RA]: thế giới **không có mép đen**. Rừng tiếp tục mãi ra ngoài, nên người chơi không bao giờ thấy "cạnh bàn cờ".
- **Connection**: tối đa 1 connection mỗi hướng (up/down/left/right) kèm `offset`, và phải ghi đối xứng ở cả hai map. [PRET] R§3, [Porymap connections](https://huderlem.github.io/porymap/manual/editing-map-connections.html).
  - Ví dụ mới (ngoài R§3) [PRET]:
    - Petalburg `left → Route104 offset -50`, Route 104 `right → Petalburg offset 50`.
    - Route 103 `right → Route110 offset -60`.
    - Viridian (FR) `up → Route2 offset 12`, `down → Route1 offset 12`, `left → Route22 offset 10`.
  - Viridian rộng 48 còn các route nối vào chỉ rộng 24, nên offset 12 đặt route vào **giữa** mép thành phố [ĐO]: lối Bắc của Viridian ở cột 19-23, lối Nam ở cột 22-25.
- **Warp** nằm trên ô cửa. Cửa hang và cửa rừng thường là **cặp 2 ô** (Route 104 → Petalburg Woods: (10,30)(11,30), (10,38)(11,38), (32,42)(33,42); FR Route 2 → Viridian Forest: (5,51)(6,51)) [PRET] warp_events. Cửa nhà là 1 ô.

### 1.4. Header: map còn mang "nghĩa" gì

| Trường `map.json` | Giá trị ví dụ | Ý nghĩa | Nguồn |
|---|---|---|---|
| `map_type` | `MAP_TYPE_TOWN` (Littleroot, Oldale, Pallet, **Viridian**), `MAP_TYPE_CITY` (Petalburg), `MAP_TYPE_ROUTE` | `IsMapTypeOutdoors` coi TOWN/CITY/ROUTE/OCEAN_ROUTE/UNDERWATER là ngoài trời (dùng cho Fly, thời tiết) | [PRET] [map_types.h](https://raw.githubusercontent.com/pret/pokeemerald/master/include/constants/map_types.h), [overworld.c](https://raw.githubusercontent.com/pret/pokeemerald/master/src/overworld.c) |
| `weather` | `WEATHER_SUNNY` ở mọi map đã đọc | Emerald có 16+ kiểu: mưa, sương, tro núi lửa, bão cát, hạn hán... | [PRET] [weather.h](https://raw.githubusercontent.com/pret/pokeemerald/master/include/constants/weather.h) |
| `music` | Route 101/102/103 cùng `MUS_ROUTE101`; FR Viridian dùng `MUS_PEWTER` | nhạc dùng chung theo **chặng**, không theo map | [PRET] |
| `region_map_section` | `MAPSEC_ROUTE_101` | ô trên Town Map và tên hiện khi vào map (`show_map_name: true`) | [PRET] |
| `allow_cycling/running/escaping`, `battle_scene`, `requires_flash` | | luật chơi theo map | [PRET] |

Ở các map đã xem, nhạc đổi theo chặng chứ không theo từng map [SUY RA]. Route 101→103 là một "chặng mở đầu" dùng một bài nhạc. Khi ghép map, hãy nghĩ theo **chặng** (vài map liền nhau chung không khí), không nghĩ theo từng map lẻ.

### 1.5. Công cụ: Porymap làm gì cho người vẽ

[PRET-tool] [Porymap: editing map tiles](https://huderlem.github.io/porymap/manual/editing-map-tiles.html):
- **Border** vẽ trực tiếp trên ảnh Border. FRLG có `border_width/height` riêng. Emerald phải bật tuỳ chọn mới đổi được kích thước border.
- **Prefab** ("prefabricated selections") là vùng metatile lưu lại để tái dùng cho vật lớn (ví dụ Poké Mart). Prefab gắn với tileset đã tạo ra nó và được lưu ở `prefabs.json`.
- **Smart Paths** cần một vùng chọn 3x3 metatile (viền + giữa) để vẽ đường, ao, núi. Đây là "autotile" phiên bản GBA. Pencil khi kéo sẽ **snap theo lưới của vùng chọn**, có ích để đặt cây 2x2 thẳng hàng.
- Giữ Ctrl khi vẽ để khoá theo đường thẳng ngang hoặc dọc.

Tương ứng với repo [SUY RA]:
- Autotile blob 47 ô của repo là bản mạnh hơn Smart Paths: tự nối được góc trong và nhánh chéo.
- `tree-wall` 2x2 "stamp on even cells" chính là thói quen snap lưới 2 ô của Pencil.

---

## 2. Đo bố cục trên map thật

### 2.0. Phương pháp [ĐO]

1. Tải `map.bin`, `map.json`, `layouts.json` và `metatile_attributes.bin` của các tileset liên quan (EM: general, petalburg, rustboro, mauville; FR: general, pallet_town, viridian_city) từ `raw.githubusercontent.com/pret/<repo>/master/`.
2. Mỗi ô được phân loại theo thứ tự ưu tiên:
   - behaviour `TALL_GRASS`/`LONG_GRASS` → `"`;
   - `JUMP_SOUTH/EAST/WEST` → `v > <`;
   - water → `~`;
   - door/warp → `D`;
   - collision ≠ 0 → `#`;
   - đi được nhưng elevation khác 0/3/15 → `:` (ví dụ đường xe đạp nâng cao ở Route 110);
   - sand → `,`;
   - còn lại → `.`.
   - Lớp phủ event: `T` trainer, `N` NPC, `o` item ball, `h` hidden item, `S` biển (bg sign).
3. **Mô phỏng đường đi**: chạy Dijkstra 4 hướng. Ledge chỉ nhảy được theo hướng của nó và nhảy 2 ô (R§4). NPC và item ball chặn đường. Object có cờ `FLAG_HIDE_*` (NPC cốt truyện tạm thời) được bỏ qua. Cây Cut tính là chặn.
   - Tầm nhìn trainer: tia thẳng theo các hướng mà `movement_type` cho phép, dài bằng `trainer_sight_or_berry_tree_id`, dừng ở ô chặn.
   - Giới hạn: bỏ qua elevation (trừ `:`), coi trainer đi tuần là đứng yên, không mô phỏng Surf hay xe đạp. Các con số đường đi vì vậy là **xấp xỉ**.

### 2.1. Kích thước và số "màn hình"

Màn hình GBA 240x160 = **15x10 metatile** [SUY RA] ([gen3-visual-style §2](./gen3-visual-style.md)).

| Map | W x H (ô) [PRET] | Số màn hình (W/15 x H/10) [SUY RA] | Ô chặn % | Đi được % | Cỏ cao % | Nước % [ĐO] |
|---|---|---|---|---|---|---|
| Littleroot Town | 20x20 | 1.3 x 2.0 | 32 | 67 | 0 | 0 |
| Oldale Town | 20x20 | 1.3 x 2.0 | 39 | 59 | 0 | 0 |
| Petalburg City | 30x30 | 2.0 x 3.0 | 47 | 36 | 0 | 15 |
| Route 101 | 20x20 | 1.3 x 2.0 | 37 | 59 | 22 | 0 |
| Route 102 | 50x20 | 3.3 x 2.0 | 46 | 48 | 14 | 2 |
| Route 103 | 80x22 | 5.3 x 2.2 | 51 | 27 | 5 | 19 |
| Route 104 | 40x80 | 2.7 x 8.0 | 41 | 33 | 3 | 24 |
| Route 110 | 40x100 | 2.7 x 10.0 | 32 | 27 | 5 | 31 |
| Pallet Town (FR) | 24x20 | 1.6 x 2.0 | 40 | 56 | 0 | 2 |
| Route 1 (FR) | 24x40 | 1.6 x 4.0 | 31 | 62 | 18 | 0 |
| Route 2 (FR) | 24x80 | 1.6 x 8.0 | 56 | 40 | 4 | 0 |
| Route 22 (FR) | 48x24 | 3.2 x 2.4 | 51 | 40 | 5 | 2 |
| Viridian City (FR) | 48x40 | 3.2 x 4.0 | 52 | 43 | 0 | 1 |

"Ô chặn" gồm tường cây, nhà, hàng rào, đá. "Đi được" gồm `.`, `,` và `"` (ledge tính riêng nên các cột không cộng đủ 100).

Đọc bảng [SUY RA]:
- **Map đầu game nhỏ, mở và thoáng.** Littleroot, Route 101 và Route 1 có ~60-67 % ô đi được.
- **Càng xa nhà, tỉ lệ đi được càng thấp** vì nước, vách và đường nhánh chiếm chỗ. Route 103, 104 và 110 chỉ còn ~27-33 % ô đi được.
- **Chiều ngắn của route gần đúng 1.5-2.7 màn hình** (FR là 24 ô, khoảng 1.6 màn hình). Người chơi luôn thấy cả hai bờ hoặc ít nhất một bờ của con đường. Chiều dài thì tính bằng nhiều màn hình (route dài nhất đã đo là 10 màn hình).

### 2.2. Ba bản đồ mẫu (ASCII, [ĐO])

**FR Route 1 (24x40), hướng từ Pallet ở dưới lên Viridian ở trên** (rút gọn hàng 0-36):

```
    000000000011111111112222
    012345678901234567890123
  0 ##########....##########   <- lối lên Viridian (4 ô, cột 10-13)
  2 ##....................##
  5 ##vvvvvv##vvvvvv......##   ledge hàng 5
  6 ##......##""""""""""""##   khối cỏ 12x5 sát tường phải
 10 ##vvvvvv##""""""""""""##   ledge hàng 10
 13 ##..............""""""##
 15 ####vvvvvv######""""""##   ledge hàng 15
 17 ##..............""""""##
 20 ##vv.vvvv..vvvvvvvvvvv##   ledge hàng 20 (2 khe ở cột 4 và 9-10)
 24 ##..........""""""....##
 26 ############""""""vvvv##   ledge hàng 26
 28 ##....N.....""""""....##
 31 ##vvvv...Svvvvvvvvvvvv##   ledge hàng 31, biển route ở (9,31)
 32 ##.."""""""......"""""##
 35 ##"""""""...""."""""..##
 36 ############""##########   <- lối xuống Pallet (2 ô, cột 12-13) là CỎ CAO
```

**EM Route 102 (50x20), hướng từ Oldale ở phải sang Petalburg ở trái** (rút gọn):

```
    00000000001111111111222222222233333333334444444444
    01234567890123456789012345678901234567890123456789
  2 ########"""......S......NN..########""""~~~~######
  4 ##"""""""""........T..............>."N""~~~~~~####
  6 ..."""""""....##vv..vvvvvv....##..>...""~~~~~~####   <- lối Petalburg (trái)
  8 ............####..""""""".########v.............##
 10 ########....####""""""....##########..............   <- lối Oldale (phải)
 13 ######""vvvv####""...##.....""""####............##
 14 ######"""...######...####..."""""T..........######
 16 ######""""########."""""""..............##########
```

**EM Oldale Town (20x20)**: 3 lối ra (Bắc, Tây, Nam). Đây là thị trấn "ngã ba".

```
  0 ########....########   lối Route 103 (4 ô)
  4 ##...........####.##
  5 ##..####.....####.##   nhà 4x3, Mart 4x3
  6 ##..####.....#DSS.##   cửa Mart (14,6), 2 biển Mart (15,6)(16,6)
  7 ##..#D##.....N....##
  9 ##......N..S........   biển thị trấn (11,9) ở giữa quảng trường
 10 ....................   lối Route 102 (Tây) và đường thông sang Đông
 14 ##...####.....######
 16 ####.#DSS.....#D####   cửa Center (6,16) và 2 biển (7,16)(8,16)
 19 ####.......N....####   lối Route 101 (4 ô)
```

### 2.3. Tường cây đóng khung playfield

Một số quan sát [ĐO]:
- Mọi town và route đã đo đều có **khung chặn 2 ô** ở các mép không phải lối ra (Pallet, Route 1, Viridian, Route 2 đều có cột 0-1 và cột W-2..W-1 là `#`).
- Khung dày lên tới 4-16 ô khi map rộng hơn phần chơi. Ví dụ Route 104 có hàng 31-37 là một dải rừng đặc rộng 40 ô, ngăn đôi map. Đó là chỗ Petalburg Woods "chui vào" qua warp.
- Route 2 (FR) có hàng 42-44 kín hoàn toàn: map tự cắt thành hai nửa, nửa phía Bắc chỉ vào được qua Viridian Forest.

Ý nghĩa [SUY RA]: **tường cây không phải viền trang trí mà là cái khuôn của nội dung**. Nó quyết định map có mấy làn và mấy ngõ cụt. Dải rừng đặc ngang map còn là cách "nhét" một map nội thất (rừng, hang) vào giữa một route.

### 2.4. Độ rộng đường và lối ra

[ĐO]:
- Lối ra ở mép rộng **2-5 ô**:
  - Pallet↔Route 1: 2 ô.
  - Route 1↔Viridian: 4 ô.
  - Viridian Bắc: 5 ô, Tây: 4 ô.
  - Route 101/103↔Oldale: 4 ô.
  - Littleroot↔Route 101: 2 ô.
- Làn đi trong route: FR Route 2 có hành lang đông rộng đúng **6 ô** chạy suốt ~60 hàng. Route 1 mở toàn bề ngang 20 ô nhưng bị các hàng ledge chia nhỏ. Route 110 có hành lang cỏ rộng 3 ô (cột 3-5, hàng 22-37 và cột 33-35, hàng 43-65).

Ý nghĩa [SUY RA]:
- Lối ra hẹp hơn hẳn phần thân map. Lối ra là "cổ chai" để camera và người chơi biết đây là cửa.
- Phần thân rộng 6-20 ô thì có chỗ để rẽ, né cỏ, đi vòng.

### 2.5. Cỏ cao: kích thước, vị trí, bắt buộc hay tuỳ chọn

**Kích thước khối cỏ** (thành phần liên thông, rộng x cao theo bbox) [ĐO]:

| Map | Các khối lớn nhất (số ô, w x h) |
|---|---|
| Route 101 | 28 (6x7), 23 (6x5), 20 (6x5), 20 (6x5) |
| Route 102 | 34 (9x7), 34 (9x6), 26 (9x5), 18 (4x6), 17 (4x5), 14 (5x4) |
| Route 103 (phía Tây) | 42 (7x8), 30 (8x5), 20 (8x4) |
| Route 104 | 51 (10x8), 34 (8x7), 29 (12x6) |
| Route 110 | 62 (16x10), 49 (12x9), 38 (7x13), 20 (6x5), **và 24 bụi lẻ 1-2 ô** |
| FR Route 1 | 60 (12x5), 30 (6x5) x 2, 28 (9x4), 20 (7x4), 10 (2x5) |
| FR Route 2 / 22 | 49 (7x7), 35 (7x5) / 35 (7x5), 30 (6x5) |

Đọc bảng [SUY RA]:
- Khối cỏ điển hình **cao 4-7 ô, rộng 6-12 ô**, tức nửa đến một màn hình.
- Khối cỏ gần như luôn **dựa lưng vào tường cây hoặc vách**, không trôi giữa đồng.
- Route 110 (giữa game) bắt đầu rải bụi cỏ 1-2 ô xen kẽ trong hành lang, tạo kiểu "da báo" thay vì khối chữ nhật.

**Cỏ bắt buộc hay tuỳ chọn** (đường ngắn nhất và đường ít cỏ nhất; số bước, số ô cỏ) [ĐO]:

| Map, hướng đi | Ngắn nhất | Ít cỏ nhất | Tránh hẳn cỏ được? |
|---|---|---|---|
| Route 101 Littleroot → Oldale (lên) | 34 bước, 10 cỏ | 10 cỏ | **không** |
| Route 101 Oldale → Littleroot (xuống) | 19 bước, 0 cỏ | 0 | có (nhảy ledge) |
| Route 102 Oldale → Petalburg (đi tới) | 64 bước, 14 cỏ | 68 bước, 4 cỏ | **không** |
| Route 102 Petalburg → Oldale (về) | 55 bước, 7 cỏ | 57 bước, 0 cỏ | có |
| FR Route 1 Pallet → Viridian (lên) | 58 bước, 22 cỏ | 74 bước, 20 cỏ | **không** (lối Pallet là cỏ) |
| FR Route 1 Viridian → Pallet (xuống) | 43 bước, 15 cỏ | 58 bước, 5 cỏ | không |
| Route 104 Petalburg → cửa Nam rừng | 50 bước, 5 cỏ | 76 bước, 0 cỏ | có |
| Route 104 cửa rừng (32,42) → Petalburg | 27 bước, 0 cỏ | 0 | có, một chiều qua ledge `<`/`v` |
| Route 110 Slateport ↔ Mauville (đi bộ, không đường xe đạp) | 164 bước, 45 cỏ | 172 bước, 38 cỏ | không |

Rút ra [SUY RA]:
1. **Chiều đi tới thì ép nội dung, chiều về thì cho lối tắt.** Ledge xoay về phía thị trấn xuất phát, nên lượt về ngắn hơn và ít cỏ hơn (Route 101: 34 → 19 bước; Route 102: 14 → 0 cỏ; Route 1: 58 → 43 bước).
2. **Ép cỏ ít, không ép nhiều.** Ở Route 102, người chơi chịu được với chỉ 4 ô cỏ bắt buộc nếu đi khéo; còn 14 ô nếu đi thẳng. Đó là phần thưởng nhỏ cho người đọc map.
3. **Cửa đầu tiên của game là cỏ** (lối Pallet→Route 1 là 2 ô cỏ cao). Đây chính là chỗ kịch bản chặn người chơi, nên hình và cốt truyện trùng nhau.

### 2.6. Ledge: "bậc thang một chiều"

[ĐO] (độ dài từng dải ledge; `S` = nhảy xuống Nam, `W` = nhảy sang Tây):
- **FR Route 1**: 6 hàng ledge ở y = 5, 10, 15, 20, 26, 31, cách nhau **5-6 hàng (khoảng nửa màn hình)**, dài 2-12 ô. Hàng 20 có hai khe (cột 4 và 9-10) để đi lên. Không có ledge nào hướng Bắc.
- **FR Route 2**: hành lang đông 6 ô có ledge `vvv.vv` ở y = 32, 37, 51, 57, 70. Mỗi dải chừa đúng **1 ô khe** để đi ngược lên.
- **EM Route 101**: 3 dải (4, 5, 4 ô). **Route 102**: 2-6 ô hướng Nam và một dải 4 ô hướng Đông (cột 34, hàng 4-7). **Route 103**: 7, 7, 10 ô. **Route 104**: dải 6 ô hướng Tây dọc cột 28 cộng các dải `v` ngắn, tạo thành "máng trượt" từ cửa rừng về Petalburg.
- **Thành phố cũng dùng ledge**: Viridian có dải 13 ô trước khu Gym (y = 12) và dải dài 19 ô ở y = 30, cắt ngang nửa Nam thành phố.

Bài học [SUY RA]:
- Ledge là **van một chiều** điều khiển nhịp đi và về.
- Ledge chừa **khe** là câu đố nhẹ: thấy đích nhưng phải tìm đường.
- Hàng ledge cách nhau khoảng nửa màn hình nên trong một khung hình luôn thấy 1-2 hàng ledge. Người chơi đọc được "đất dốc xuống về phía Nam".

### 2.7. Trainer: vị trí và tầm nhìn

[PRET] (từ `object_events`):
- **Route 101 và FR Route 1 không có trainer nào** (FR Route 1 chỉ có nhân viên Mart và một cậu bé).
- Route 102 có 4 trainer (tầm 2-3). Route 103 có 9, Route 104 có 8, Route 110 có 14 (tầm 1-7).
- **Cặp đối mặt**:
  - Route 110 (3,39) `FACE_RIGHT` tầm 6 và (10,39) `FACE_LEFT` tầm 6 đứng hai đầu một làn.
  - Route 110 (7,76) `FACE_RIGHT` tầm 2 và (10,76) `FACE_LEFT` tầm 2 kẹp một hành lang 2 ô.
  - Cặp đôi đứng cạnh nhau (double battle): Route 103 (64,12)(65,12) và Route 104 (27,15)(28,15) trên cầu.

[ĐO] **Trainer né được hay không** (chặn tầm nhìn của từng trainer rồi xem còn đường không):
- Route 102 chiều đi tới: trainer (33,14) không thể né.
- Route 104 đoạn từ rừng lên Rustboro: 3 trainer (cặp đôi trên cầu và (21,25)) không thể né.
- Route 110 đi bộ: 5 trainer không thể né, trong đó có cả hai cặp đối mặt.
- Các trainer còn lại đều né được. **Trainer bắt buộc thường đứng ở chỗ hẹp (cầu, hành lang), còn trainer tuỳ chọn đứng bên cạnh làn rộng.**

**Tầm nhìn theo trục** [ĐO], đếm trên 34 map route của Emerald (Route 101-134), chỉ tính trainer quay đúng một trục:
- Trainer nhìn ngang (TRÁI/PHẢI): 89 trainer, tầm 0-7, trung bình ~3.7, **12 trainer có tầm 7**.
- Trainer nhìn dọc (LÊN/XUỐNG): 106 trainer, tầm 0-6, trung bình ~2.7.

Liên hệ phỏng vấn:
- Masuda nói màn GBA rộng hơn, nên nếu giấu trainer ở góc màn hình thì người chơi vẫn thấy, "so instead we took advantage of the screen's width…" [PHỎNG VẤN] (Nintendo Dream #84, 2003; bản dịch của Jacob Newcomb trên [Lava Cut Content](https://lavacutcontent.com/sugimori-masuda-gen-3-interview/). Đoạn giữa câu là tóm tắt của trang dịch, không phải nguyên văn.)
- [SUY RA] Nửa bề ngang màn hình là 7 ô (`MAP_OFFSET 7`), đúng bằng tầm ngang lớn nhất. Nửa bề cao chỉ ~5 ô, và tầm dọc cũng ngắn hơn. Tức là **người chơi hầu như luôn thấy trainer trên màn hình trước khi bị phát hiện**.

### 2.8. Item: phần thưởng cho việc rẽ ngang

[PRET] vị trí item, [SUY RA] vai trò:
- **Item ball đặt ở ngõ cụt hoặc sau chướng ngại**:
  - Route 102 (11,15): trong túi đất dưới dải ledge (8-11,13), phải nhảy xuống mới lấy được.
  - Route 104 (37,22): sau cây Cut (35,22).
  - Route 104 (5,8): trong khối cỏ góc Tây Bắc.
  - Route 110 (26,47): trên đảo nhỏ giữa nước, cần Surf.
  - Petalburg (19,2) và (3,28): ở hai góc ao, cần Surf.
  - FR Viridian (17,5): ngay sau cây Cut (18,5).
- **Hidden item gom cụm hoặc nằm ở mép**:
  - Route 104 có (7,6) và (3,9) cùng khối cỏ với item ball (5,8), tức cả một "ổ thưởng" ở góc. Ngoài ra (14,55), (16,64), (16,72) nằm dọc bờ cát sát nước.
  - Route 110: (4,35) trong hành lang cỏ, (35,39) ở cuối làn cạnh biển Trainer Tips, (37,67) ở góc tường.
  - Petalburg (11,29): khe 1 ô ở mép dưới map.
- Bài học: **ngõ cụt không bao giờ trống**. Mỗi nhánh rẽ có ít nhất một item, berry tree hoặc NPC (Route 102 có 2 berry tree ở (24,2)(25,2) cạnh biển; Route 104 có 4 cụm berry tree).

### 2.9. Biển báo và lối vào

[PRET] vị trí `bg_events` loại sign:
- **Mỗi lối vào route có biển trong khoảng ~1 màn hình**:
  - Route 102 có biển ở đầu Oldale (40,9), cách mép Đông 9 ô, và biển ở đầu Petalburg (17,2).
  - Route 104 có biển Rustboro (23,5), cách mép trên 5 ô, và biển Petalburg (27,66), gần lối Đông ở hàng 61-63.
  - Route 110 có biển Slateport (20,94), biển Mauville (3,17) và biển Route 103 (7,79).
  - FR Route 1 có biển (9,31), ~5 hàng trên lối Pallet.
- **Biển cửa hiệu đặt cạnh cửa, trên hàng đáy của toà nhà**: Oldale Center có cửa (6,16) và biển (7,16)(8,16); Mart có cửa (14,6) và biển (15,6)(16,6).
- Nhà riêng có biển cách cửa 2 ô: Littleroot (5,8)→(7,8), (14,8)→(12,8); Pallet (6,7)→(4,7), (15,7)→(13,7).
- **Biển "Trainer Tips"** là kiểu biển dạy chơi, đặt ở lối vào thành phố hoặc giữa route (Viridian (23,1) ngay lối Bắc, (20,31) gần lối Nam; Route 104 (17,23); Route 110 hai biển).

### 2.10. Thị trấn: khoảng cách nhà và khoảng trống

[ĐO] từ ASCII:
- **Littleroot (20x20)**:
  - Hai nhà 5x4 ở hàng 5-8, đặt đối xứng tại cột 2-6 và 13-17, cách nhau 6 cột.
  - Lab 7x4 ở hàng 13-16.
  - Giữa hai hàng nhà là con phố rộng 4 hàng (y = 9-12).
- **Oldale (20x20)**:
  - 4 công trình 4x3 xếp thành hai cặp chéo nhau.
  - Khoảng trống giữa hàng 8 và 13 rộng 6 hàng, là trục Đông-Tây nối lối Route 102.
- **Pallet (24x20)**:
  - Hai nhà 5x4 cách nhau 4 cột, Lab ở dưới bên phải.
  - Có một ao nhỏ 4x3 ở mép Nam (lối Surf ra Route 21).
  - Có hai đoạn hàng rào ngắn (4 và 6 ô) gắn biển.
- **Petalburg (30x30)**:
  - **15 % là nước**: ao lớn ở phía Tây (10x14) và ao ở góc Đông Bắc (7x7).
  - Gym nằm ở giữa phía Bắc với biển (17,10), Center ở (20,16), Mart ở (25,12).
- **Viridian (48x40)**:
  - Rộng bằng 2.3 lần Littleroot nhưng 52 % ô chặn.
  - Phần lớn diện tích là khung rừng dày 6-8 ô ở bên phải, và dải ledge chia khu Nam.

Bài học [SUY RA]:
- Thị trấn đầu game có **trục rõ ràng** (một phố chính) và **ít nhà** (3-5).
- Không có nhà nào sát lối ra. Lối ra luôn mở ra một khoảng sân trống 2+ hàng.
- Mọi cửa đều có ô đi được ngay bên dưới.
- Thành phố lớn không nhét thêm nhà mà **dùng nước, ledge và tường dày** để chia khu.

---

## 3. Nguyên tắc thiết kế và nhịp độ

### 3.1. Lời nhà phát triển (ít nhưng có)

Nguồn chính là phỏng vấn Sugimori và Masuda trên Nintendo Dream #84 (02-03/2003), bản dịch tiếng Anh của Jacob Newcomb trên [Lava Cut Content](https://lavacutcontent.com/sugimori-masuda-gen-3-interview/) [PHỎNG VẤN]:
- **Không tuyến tính có chủ đích**:
  - Sugimori: "it's a bit different than previous regions. It's not as linear."
  - Masuda: "like a parent letting go of their child's hand" và "'now go wherever you want.'"
  - Ông nói trước giai đoạn đó có dẫn dắt nên người chơi sẽ hiểu. Đây là lời tóm tắt của trang dịch, không phải nguyên văn.
- **Nhánh rẽ phải có nội dung**: "no matter where you venture off on a side trip, there's always lots to do."
- **Khu Mauville và Lilycove "kind of tricky to understand"** là cố ý, để có cảm giác hành trình.
- **Địa lý lấy cảm hứng rồi nén lại**: Hoenn dựa trên Kyushu nhưng "we condensed it down to make everything closer together".
- **Bối cảnh phải "interesting"**, ví dụ núi lửa (Sugimori). Đây là lý do mỗi chặng có một địa hình đặc trưng.
- **Màn hình rộng ảnh hưởng cách đặt trainer** (§2.7).

Tôi chưa tìm thấy tài liệu chính thức nào của Game Freak về quy tắc vẽ map ở mức ô (độ rộng đường, kích thước cỏ). Mọi quy tắc ở mức ô trong tài liệu này là [ĐO] hoặc [SUY RA]. Iwata Asks cho HGSS và BW có tồn tại ([iwataasks.nintendo.com/interviews/ds/pokemon](https://iwataasks.nintendo.com/interviews/ds/pokemon/0/0)) nhưng tôi chưa đọc được đoạn nào về thiết kế map: chưa xác minh.

### 3.2. Nguyên tắc rút ra (tổng hợp [SUY RA] từ §2 và phỏng vấn)

| Nguyên tắc | Gen 3 làm thế nào | Bằng chứng |
|---|---|---|
| **Mốc (landmark)** | Mỗi map có 1 thứ khó quên: ao Petalburg, cầu và bãi biển Route 104, đường xe đạp trên cao Route 110, dải rừng chứa Petalburg Woods | §2.3, §2.10 |
| **Dễ đọc** | Ô đi được và ô chặn khác nhau rõ: tường cây 2x2 là "tường", cỏ là "vùng nguy hiểm", ledge là "bậc" | R§7 |
| **Dẫn đường** | Lối ra hẹp hơn thân map, biển ở lối vào, item ball đặt ở cuối tầm nhìn để kéo người chơi rẽ | §2.4, §2.8, §2.9 |
| **Chặn có lý do (gating)** | Cây Cut (Route 104, FR Route 2, Viridian), nước cần Surf (Route 103 phía Đông, Petalburg), NPC cốt truyện có cờ `FLAG_HIDE_*` (Team Aqua chặn hành lang Route 110 hàng 82-83) | [PRET] object_events |
| **Một chiều để về nhanh** | Ledge xoay về thị trấn trước | §2.5, §2.6 |
| **Vòng lặp và tuyến thẳng** | Route 101/1 gần như thẳng. Route 104 là vòng: Petalburg → bãi biển → rừng → Rustboro, cộng máng ledge quay về. Route 110 có hai tầng đi song song (đường bộ và đường xe đạp) | §2.2, §2.5 |
| **Mép và biên** | Không có mép đen: border 2x2 lặp vô hạn, tường cây khớp lưới 2 ô xuyên qua connection | R§2, R§3 |
| **Mật độ trang trí** | Trang trí tăng dần: town đầu thưa, Route 110 có bụi cỏ lẻ, hidden item, 2 biển Tips, berry | §2.5, §2.8 |
| **Nhịp chặng** | Một bài nhạc và một secondary tileset cho cả chặng (Route 101-103 cùng `MUS_ROUTE101` và `gTileset_Petalburg`) | §1.2, §1.4 |
| **Độ khó leo thang** | Route 101 và Route 1 không có trainer, Route 102 có 4, Route 103/104 có 8-9, Route 110 có 14 | §2.7 |

---

## 4. Thực hành của cộng đồng

### 4.1. Pokémon Essentials (RPG Maker XP)

Không đọc được trực tiếp: Fandom trả 402. Các thông tin dưới đây lấy từ snippet tìm kiếm của trang [Tilesets (oldid 223)](https://essentialsdocs.fandom.com/wiki/Tilesets?oldid=223) và một số thread PokéCommunity. Trang đó tự ghi là đã chuyển sang wiki Essentials Engine và không còn cập nhật [CỘNG ĐỒNG, chưa xác minh trên trang gốc]:
- Mỗi ô tileset có **passability** theo 4 hướng, **priority** (vẽ trên người chơi), cờ **Bush** (ẩn nửa dưới người chơi khi đứng trong cỏ) và **terrain tag**.
  - Tag 1 = Ledge: chỉ đi qua được từ một hướng.
  - Tag 2 = Grass: có encounter và cần cờ Bush.
  - Tag 10 = cỏ cao 2 ô: ô trên mang Bush, priority 1 và tag; ô dưới priority 0. Không đạp xe vào được.
  - Snippet thread diễn đàn còn nói cầu dùng tag 15. Đây là thông tin cũ.
- Essentials ghép map bằng **connection** giữa các map RMXP, tương tự Gen 3. Trang [Connecting maps](https://essentialsdocs.fandom.com/wiki/Connecting_maps) bị 402: chưa xác minh chi tiết offset.
- So với repo [SUY RA]: Essentials tách "hình" khỏi "luật" giống pret (behaviour ≈ terrain tag, layer type ≈ priority). Repo đã ghi behaviour vào `.tsj`, nhưng **cờ "Bush" (ẩn nửa dưới) chưa có tương đương trong repo**: chưa xác minh.

### 4.2. Porymap và decomp

Xem §1.5:
- Prefab dùng cho vật lớn tái dùng.
- Smart Paths 3x3 dùng cho đường, ao, núi.
- Snap lưới khi đặt cây.
- "Mirror to Connecting Maps" giữ connection đối xứng ([Porymap connections](https://huderlem.github.io/porymap/manual/editing-map-connections.html)).
- Collision và elevation vẽ ở tab riêng (R§4).

### 4.3. Kinh nghiệm mapping trên PokéCommunity

Mọi mục dưới đây là [CỘNG ĐỒNG]. Các trang đều trả 403, nên nội dung lấy từ snippet tìm kiếm, chưa đọc nguyên bài:
- **Giữ độ rộng làn tương đối đều.** Đừng cho người chơi một đoạn rộng 7 ô rồi ép qua một lỗ 1 ô ([Fangame Tutorials: Mapping Routes, Daily PokéCommunity 2017-09-14](https://daily.pokecommunity.com/2017/09/14/fangame-tutorials-mapping-routes)).
- **Hàng cây và hàng cỏ thẳng nhanh gây nhàm.** Nên phá bằng độ cao, cây nhỏ, nhánh rẽ, luống hoa (cùng nguồn). Sông, núi và đường đất không nên thẳng tuyệt đối (cùng loạt bài).
- **Khoảng trống là kẻ thù** ("Empty space is your enemy"). Map to và trống là lỗi phổ biến của người mới. Góc màn hình nên có chi tiết (các thread [any tips for a new mapper](https://www.pokecommunity.com/threads/any-tips-for-a-new-mapper.306292), [Neti's natural mapping tutorial](https://www.pokecommunity.com/threads/netis-natural-mapping-tutorial.170454/)).
- **Đặt cây ngẫu nhiên không có kế hoạch** sẽ sinh lỗi ở mép cây, mất công sửa. Một vài cây lẻ thì lại tạo cảm giác tự nhiên (Neti, cùng nguồn).

Lỗi người mới hay gặp, đối chiếu với dữ liệu Gen 3:

| Lỗi | Vì sao sai (Gen 3 làm khác thế nào) |
|---|---|
| Tường cây là một đường thẳng 1 ô | Gen 3 dày ≥ 2 ô, lồi lõm theo bước 2 ô, có chỗ dày 4-16 ô (§2.3) |
| Đồ trang trí rải đều theo lưới | Gen 3 gom theo cụm (ổ thưởng ở góc, berry thành hàng 3-4 cây cạnh biển) (§2.8) |
| Đường quá rộng, cả map là đường | Lối ra 2-5 ô, làn chính 4-8 ô, phần còn lại là cỏ, nước, vách (§2.4) |
| Không có gì dẫn mắt | Biển ở lối vào, item ở cuối tầm nhìn, lối ra hẹp (§2.9) |
| Quên border | Ngoài mép map hiện ra ô trống hoặc màu đen. Gen 3 lặp khối cây 2x2 vô hạn (R§2) |
| Connection lệch 1 ô | Lối ra hai map phải trùng từng ô sau khi cộng offset (R§3) |
| Cỏ bắt buộc dày đặc ngay route đầu | Route 102: chỉ 4 ô cỏ bắt buộc nếu đi khéo (§2.5) |
| Trainer phát hiện người chơi từ ngoài màn hình | Tầm nhìn ngang ≤ 7, dọc ngắn hơn (§2.7) |

---

## 5. Checklist và cách nghĩ khi ghép map bằng piece của repo

### 5.1. Quy đổi đơn vị

- 1 ô map = 16 px theo chuẩn Gen 3. Piece của repo xuất 32 px (x2; [catalog](../../../.agents/skills/pokemon-overworld-generator/references/catalog.md)).
- "Một màn hình" Gen 3 = 15x10 ô = 480x320 px ở bản xuất x2 [SUY RA]. Nếu game Mons dùng viewport khác thì nhịp "nửa màn hình" ở §2 cần quy đổi lại (xem §6).

### 5.2. Thứ tự ghép một route (đề xuất [SUY RA])

1. **Chốt hai đầu trước.** Đặt lối ra 2-4 ô ở hai mép, khớp từng ô với map hàng xóm, rồi ghi connection và offset ở **cả hai** map.
2. **Vẽ khung bằng `tree-wall`** (2x2, đặt ở ô chẵn), dày ≥ 2 ô. Chỗ lệch lẻ thì dùng autotile `forest`. Chọn khối border 2x2 bằng chính `tree-wall` để mép map liền với rừng ngoài.
3. **Vạch làn chính** bằng autotile `dirt-path`, rộng 2-4 ô, uốn ít nhất một lần, không chạy thẳng tuột từ cửa này sang cửa kia.
4. **Đặt "dốc"**: quyết định hướng về nhà, rồi đặt 1-3 dải `ledge` (connector single/start/middle/end; `ledge-east`/`ledge-west` cho dải dọc) dài 4-10 ô, quay về thị trấn trước, chừa khe 1 ô. Repo không có ledge hướng Bắc và Gen 3 cũng không dùng (R§1).
5. **Đặt cỏ** bằng autotile `tall-grass`, khối 4-7 x 6-12 ô dựa lưng vào khung. Với route đầu, kiểm tra còn một đường gần như không cỏ, hoặc chỉ vài ô bắt buộc.
6. **Đặt chướng ngại có ý nghĩa**: `water`/`shore` (cần Surf), `cliff` (đổi elevation), `cut-tree` và `smash-rock` (Prop) chặn một **nhánh có thưởng**, không chặn làn chính trước khi người chơi có HM.
7. **Đặt thưởng**: mỗi ngõ cụt một `item-ball` hoặc NPC. Hidden item (không có piece, chỉ là dữ liệu) đặt ở góc hoặc mép nước.
8. **Đặt biển** (`sign`) trong ~1 màn hình kể từ mỗi lối vào, trên ô chặn cạnh làn.
9. **Đặt trainer** (dữ liệu, không phải piece): tầm ngang ≤ 7, tầm dọc ≤ 5. Trainer bắt buộc đặt ở chỗ hẹp (cầu, hành lang), trainer tuỳ chọn đặt cạnh làn rộng.
10. **Trang trí sau cùng**: `flowers`, `bush`/`hedge`, `rock`, `rock-big` gom 2-5 cái thành cụm ở góc màn hình và cạnh lối ra, không rải đều.
11. **Kiểm tra**:
    - Đi thử hai chiều. Chiều về có ngắn hơn không?
    - Mỗi khung 15x10 có ít nhất một thứ để nhìn (mốc, cụm trang trí, item)?

### 5.3. Thứ tự ghép một thị trấn

1. Khung `tree-wall` và các lối ra (2-5 ô). Mỗi lối ra mở vào một khoảng sân ≥ 2 hàng.
2. **Một trục chính** bằng `paved-path` (town) hoặc `dirt-path` (làng), rộng 2-4 ô, nối các lối ra.
3. Đặt Structure (xem skill structure): cửa ở hàng đáy, có ô đi được ngay dưới cửa nối vào trục. Đặt 3-5 công trình ở town đầu, cách nhau 4-6 cột.
4. `sign` cạnh cửa Center và Mart (trên hàng đáy toà nhà), biển nhà riêng cách cửa 2 ô, biển thị trấn ở quảng trường.
5. Một mốc riêng: ao (`water`), quảng trường hoặc hàng rào `fence` có cổng (`gate-*`). Petalburg dùng nước, Pallet dùng ao và hàng rào ngắn.
6. Town không có `tall-grass` (R§7). `street-lamp` và `mailbox` đặt cạnh nhà, không đặt giữa đường.

### 5.4. Bảng tra: nguyên tắc → piece

| Nguyên tắc | Piece repo | Ghi chú |
|---|---|---|
| Khung, biên, border | `tree-wall` (2x2), `forest` (autotile), `hedge` cho khu vườn | Border = 1 khối `tree-wall` 2x2 |
| Làn đi | `dirt-path`, `paved-path`, `sand` | Viền mờ vào `grass`, không có nét viền cứng |
| Vùng nguy hiểm | `tall-grass` | Behaviour `TALL_GRASS` |
| Van một chiều | `ledge`, `ledge-east`, `ledge-west` | `JUMP_*`. Ô đáp xuống phải trống (R§4) |
| Tầng địa hình | `cliff` (mặt đá ở phía S/SW/SE), `cave-mouth` | Đổi elevation 3 ↔ 4 thay vì dùng tile đặc biệt (R§4) |
| Chặn bằng HM | `cut-tree`, `smash-rock`, `water`, `shore` | Chặn nhánh có thưởng |
| Rào nhân tạo | `fence` (4-way, có cổng) | Dùng trong town hoặc trang trại. Ở route thì dùng tường cây |
| Dẫn đường | `sign`, `item-ball`, `flowers` dọc lối | Biển không có chữ trong piece, nội dung là dữ liệu |
| Mốc | `rock-big`, cụm `tree`, ao `water`, Prop của Gym (ví dụ `fountain`, `obelisk`) | 1 mốc cho mỗi khoảng 1-2 màn hình |
| Trang trí | `flowers` (động 0,1,0,2), `bush`, `rock`, `mailbox`, `street-lamp` | Gom cụm, không đặt theo lưới |

### 5.5. Checklist nhanh (dán cạnh màn hình)

- [ ] Lối ra 2-5 ô, khớp từng ô với map kề, connection ghi ở cả hai phía.
- [ ] Border 2x2 đã đặt. Không chỗ nào lộ nền trống khi camera ở sát mép (7 ô ngang).
- [ ] Tường cây ≥ 2 ô, trên lưới chẵn, có lồi lõm.
- [ ] Làn chính 2-4 ô (town) hoặc 4-8 ô (route), uốn ít nhất một lần.
- [ ] Ledge quay về thị trấn trước, chừa khe, ô đáp trống. Chiều về ngắn hơn.
- [ ] Cỏ: khối 4-7 x 6-12, dựa vào khung. Route đầu có lối gần như không cỏ.
- [ ] Mỗi ngõ cụt có thưởng. Mỗi HM-block che một nhánh, không che làn chính.
- [ ] Biển trong ~1 màn hình từ lối vào. Biển hiệu cạnh cửa Center và Mart.
- [ ] Trainer: tầm ngang ≤ 7, dọc ≤ 5. Trainer bắt buộc ở chỗ hẹp.
- [ ] Mỗi khung 15x10 có ít nhất một điểm nhìn. Không có khung nào chỉ là cỏ trơn.
- [ ] Cửa nào cũng có ô đi được ngay dưới.

---

## 6. Câu hỏi mở để thảo luận

Đây là các lựa chọn thiết kế, không phải sự thật cần tra:

1. **Viewport của Mons** là bao nhiêu? Nếu không phải 15x10 ô, các con số "nửa màn hình" (khoảng cách ledge, tầm trainer, chiều ngắn route) cần quy đổi theo tỉ lệ.
2. **Hướng "về nhà"** của thế giới Mons: ledge luôn quay về Nam như Gen 3, hay theo từng chặng? Repo chưa có ledge hướng Bắc. Có cần thêm không?
3. **Mức độ ép cỏ ở route đầu**: theo Route 101 (không né được 10 ô) hay Route 102 (né gần hết)?
4. **Tuyến tính hay mở**: Mons muốn bám nhịp Hoenn ("thả tay con", nhiều nhánh) hay Kanto (thẳng hơn)? Điều này quyết định có bao nhiêu vòng lặp và HM-block.
5. **Chặn bằng gì**: HM (Cut, Surf, Rock Smash) như Gen 3, hay item hoặc cốt truyện (NPC có cờ ẩn)?
6. **Mật độ**: chấp nhận ~60 % ô đi được ở map đầu và giảm dần, hay giữ đều?
7. **Thị trấn theo Gym**: thị trấn có Gym hệ Lửa dùng toàn bộ Prop `fire-*` thay cho `tree-wall`, hay chỉ quanh Gym còn khung vẫn là rừng chung (giống primary + secondary tileset của Gen 3)?
8. **Kích thước map**: giữ khuôn Gen 3 (town 20-30, route 20-24 x 40-100) hay chia nhỏ hơn để dễ ghép tay?
9. **Hidden item và trainer** ghi ở đâu: object layer của Tiled (`.tmj`) hay một file dữ liệu riêng? Repo hiện chỉ làm piece.
10. **Cờ "Bush"** (ẩn nửa dưới người chơi trong cỏ): cần ở engine của Mons không? Nếu cần thì có phải thêm thuộc tính vào `.tsj` của `tall-grass` không?

---

## Phụ lục: chưa xác minh

- Đường đi ở §2.5 là xấp xỉ: bỏ qua elevation, coi trainer tuần tra là đứng yên, bỏ NPC có cờ `FLAG_HIDE_*`.
- Ledge có chặn đi ngang (từ cạnh bên) hay không: mô phỏng coi là chặn, nhưng chưa đọc collision của từng ô ledge.
- Vị trí màn hình chính xác của người chơi (tâm camera) chỉ suy ra từ `MAP_OFFSET 7`.
- Toàn bộ nội dung Essentials Docs và PokéCommunity chỉ lấy từ snippet tìm kiếm (402/403).
- Không tìm thấy tài liệu chính thức của Game Freak về quy tắc map ở mức ô.
