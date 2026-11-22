# Bố cục thành phố lớn Gen 3 (RSE + FRLG): đo từ dữ liệu pret để dựng city có Gym cho Mons

Mục đích: rút ra **luật cấu trúc** của các thành phố lớn Gen 3 (kích thước, lối ra, trục phố, quận, vị trí Gym, Center, Mart, mật độ) để dựng các city lớn của Mons, mỗi city có ít nhất một Gym và nối với nhau bằng route.

Tài liệu này nối tiếp [gen3-map-composition.md](./gen3-map-composition.md) (ký hiệu **MC§n**). Những gì MC đã có thì không nhắc lại, chỉ dẫn link:
- cấu trúc dữ liệu tileset / layout / header, border, connection, warp: MC§1;
- phương pháp giải mã `map.bin` và ký hiệu ASCII: MC§2.0;
- town nhỏ (Littleroot, Oldale, Pallet, Petalburg, Viridian): MC§2.10;
- biển báo, ledge, trainer trên route: MC§2.6, MC§2.7, MC§2.9;
- thứ tự ghép một thị trấn: MC§5.3.

Kích thước ngoại thất từng công trình (Center 4x4 ở RSE và 5x5 ở FRLG, Mart 4x4, Gym 6x5, toà mốc 9-10 ô ngang, ...) nằm ở [gen3-civic-buildings.md](./gen3-civic-buildings.md) (ký hiệu **CB§n**).

Quy ước độ tin cậy giống MC:
- **[PRET]**: đọc thẳng từ `map.json` / `layouts.json` của pret.
- **[ĐO]**: tôi giải mã `map.bin` + `metatile_attributes.bin` rồi đếm hoặc chạy tìm đường.
- **[ĐO-ẢNH]**: tôi dựng lại ảnh map từ `tiles.png` + `metatiles.bin` + palette rồi đếm bằng mắt trên ảnh. Có thể lệch ±1 ô.
- **[SUY RA]**: suy luận từ số liệu, không có nguồn nói thẳng.
- **[PHỎNG VẤN]**, **[CỘNG ĐỒNG]**: như MC.
- **chưa xác minh**: chưa kiểm chứng được.

Ngày truy cập: 2026-11-18. Mọi file pret tải được (HTTP 200) từ `raw.githubusercontent.com/pret/{pokeemerald,pokefirered}/master/`. Lần này không dùng nguồn cộng đồng hay phỏng vấn mới.

---

## 0. Nguồn và phương pháp

### 0.1. File đã tải [PRET]

| Loại | Emerald | FireRed |
|---|---|---|
| layout | `data/layouts/layouts.json`, `data/layouts/<City>/map.bin` | như EM |
| header + events | `data/maps/<City>/map.json` | như EM |
| tileset (thuộc tính) | `data/tilesets/primary/general/metatile_attributes.bin`; secondary `rustboro, slateport, mauville, lilycove, mossdeep, fortree, sootopolis` | primary `general`; secondary `cerulean_city, vermilion_city, celadon_city, saffron_city, fuchsia_city` |
| tileset (hình, để dựng ảnh) | `tiles.png`, `metatiles.bin`, `palettes/00-12.pal` của các tileset trên | như EM |
| tên behaviour | `include/constants/metatile_behaviors.h` | như FR |

Thành phố đã giải mã:
- **Emerald (7)**: Rustboro, Slateport, Mauville, Lilycove, Mossdeep, Fortree, Sootopolis.
- **FireRed (5)**: Cerulean, Vermilion, Celadon, Saffron, Fuchsia.

### 0.2. Cách đo (ngoài MC§2.0)

- **Phân loại ô**: giống MC§2.0. Riêng primary tileset của FR có 640 metatile (EM có 512), nên id ≥ 640 thuộc secondary.
- **Toà nhà**: mỗi `dest_map` khác nhau trong `warp_events` là một toà. Loại toà lấy theo tên đích: `GYM`, `POKEMON_CENTER`, `MART`, `HOUSE`/`FLAT` = nhà; gate/hang/Safari = lối đi; còn lại là "đặc biệt".
- **Bước đi từ lối vào chính**: Dijkstra 4 hướng từ các ô lối ra trên mép map tới ô cửa.
  - Ledge chỉ nhảy theo chiều của nó.
  - NPC được coi là đi qua được (phần lớn NPC trong city đứng ở chỗ rộng hoặc có cờ ẩn). Vì vậy số bước là **cận dưới**.
  - Cây Cut (`OBJ_EVENT_GFX_CUT_TREE`) được coi là đi qua được nhưng có đếm số cây Cut trên đường.
- **Lối vào chính** là lối người chơi tới lần đầu theo cốt truyện [SUY RA từ connection + thứ tự game]:
  - Rustboro, Slateport, Mauville: từ phía Nam.
  - Lilycove, Mossdeep (bãi biển), Fortree, Cerulean, Fuchsia: từ phía Tây.
  - Vermilion: từ phía Bắc.
  - Celadon: từ phía Đông.
  - Saffron: cổng Bắc.
- **Lối ra**: các đoạn ô ở mép map **đến được từ cửa Center**. Ô đi được ở mép mà không đến được thì không tính (ví dụ ngọn cây có collision 0).
- **Độ rộng cục bộ** của một ô đi được = min(chiều dài đoạn ngang, chiều dài đoạn dọc chứa ô đó), cắt ở 9.
  - 1 = ngõ một ô.
  - 2-4 = phố.
  - ≥ 5 = sân hoặc quảng trường.
- **d** = khoảng cách Chebyshev từ một ô đi được tới ô không đi được gần nhất (d = 1 nghĩa là sát vật cản). Dùng để đo "khoảng trống".
- **Phố dài nhất theo bề dày t**: dải thẳng dài nhất mà t hàng (hoặc cột) liền nhau đều đi được.
- **Vật trang trí đứng riêng**: thành phần liên thông của ô chặn có ≤ 4 ô và không chạm mép map (đèn, biển, đá, bụi, đài phun). Chỉ số này **bỏ sót** hoa và trang trí đi được, nên chỉ dùng để so sánh tương đối.

Script nằm ở scratchpad của phiên này (`scripts/city.py`, `render.py`, `metrics.py`, `streets.py`, `exits.py`), không commit. Muốn chạy lại thì viết lại theo mô tả trên.

---

## 1. Bảng tổng quan [PRET kích thước + ĐO phần còn lại]

Một màn hình GBA = 15x10 metatile (MC§2.1). Các cột:
- "Chặn / Đi / Nước" = % ô chặn / đi được (gồm cả ô nền nâng) / nước.
- "Toà": số toà có cửa (không tính gate).
- "C / M / G": số bước từ lối vào chính tới cửa Center / Mart / Gym.

| City (game, thứ tự Gym) | W x H | Màn hình | Chặn / Đi / Nước % | Toà | Lối ra đất liền (rộng, ô) | C / M / G (bước) |
|---|---|---|---|---|---|---|
| Rustboro (EM, Gym 1) | 40x60 | 2.7 x 6.0 | 45 / 48 / 6 | 11 | N 5, S 8, E 6 (mép city 7 ô, Route 116 chỉ mở hàng 8-13) (kiểm chéo 2026-11-18) | 24 / 14 / 48 |
| Slateport (EM, không Gym) | 40x60 | 2.7 x 6.0 | 37 / 47 / 16 | 9 | N 5, S 28 (bãi cát); E là biển | 40 / 37 / – |
| Mauville (EM, Gym 3) | 40x20 | 2.7 x 2.0 | 40 / 59 / 1 | 7 | N 7, S 7 + 1 (mép city mở cột 27-33 nhưng Route 110 chỉ mở cột 28) (kiểm chéo 2026-11-18), W 4, E 5 | 25 / 10 / 39 |
| Fortree (EM, Gym 6) | 40x20 | 2.7 x 2.0 | 68 / 31 / 0 | 9 | W 5, E 4 | 6 / 16 / 35 |
| Lilycove (EM, không Gym) | 80x40 | 5.3 x 4.0 | 32 / 45 / 21 | 13 | W 3; E là biển | 26 / (Dept 45) / – |
| Mossdeep (EM, Gym 7) | 80x40 | 5.3 x 4.0 | 32 / 40 / 27 | 10 | W 8 (bãi đổ bộ); N, S là biển | 38 / 45 / 55 |
| Sootopolis (EM, Gym 8) | 60x60 | 4.0 x 6.0 | 57 / 25 / 18 | 12 | không có (Dive / Fly) | – |
| Cerulean (FR, Gym 2) | 48x40 | 3.2 x 4.0 | 44 / 45 / 10 | 9 + hang | N 3+3 (cầu), S 4+8+4, W 3, E 2 (Cut) | 23 / 37 / 32 |
| Vermilion (FR, Gym 3) | 48x40 | 3.2 x 4.0 | 22 / 32 / 47 | 8 | N 3, E 3; S là cảng | 15 / 24 / 35 (+1 Cut) |
| Celadon (FR, Gym 4) | 60x40 | 4.0 x 4.0 | 52 / 46 / 1 | 9 | W 3, E 4 | 12 / (Dept 45) / 93 (+1 Cut) |
| Fuchsia (FR, Gym 5) | 48x40 | 3.2 x 4.0 | 48 / 48 / 2 | 7 + 2 Safari | S 10 (bãi), W 3, E 3 (mép city 4 ô hàng 20-23, Route 15 chỉ mở hàng 20-22) (kiểm chéo 2026-11-18) | 46 / 45 / 29 (từ W) |
| Saffron (FR, Gym 6) | 66x55 | 4.4 x 5.5 | 74 / 25 / 0 | 9 + 4 gate | 4 gatehouse (N, S, W, E) | 29 / 45 / 20 (từ cổng N) |

Ghi chú:
- **Sootopolis**: không có connection nào [PRET]. Người chơi lặn (Dive) từ Route 126 rồi trồi lên hồ giữa miệng núi, hoặc bay tới. Vì vậy không tính được bước đi bộ.
- **Saffron**: mọi lối vào là gatehouse (warp), không có lối đi thẳng qua mép map.
- **Fortree**: có 2 đoạn đi được chạm mép Nam (4 và 3 ô) nhưng **không có connection** phía Nam [PRET]. Đó là ngõ cụt chạm border.
- **`map_type`** [PRET]: city EM dùng `MAP_TYPE_CITY`. Cả 5 city FR (và Viridian, MC§1.4) đều dùng `MAP_TYPE_TOWN`. FRLG không phân biệt town và city ở trường này.
- **Nhạc dùng chung** [PRET]:
  - Mauville và Mossdeep dùng `MUS_RUSTBORO`.
  - Cerulean dùng `MUS_FUCHSIA`, Saffron dùng `MUS_PEWTER`.
  - Nhạc là theo "nhóm thành phố", không phải mỗi city một bài.

---

## 2. Từng thành phố

Toạ độ là (x, y) theo ô. Vị trí tương đối so với tâm map được chuẩn hoá về [-1, 1] (âm = Tây / Bắc).

### 2.1. Rustboro (EM, 40x60, Gym 1): "đại lộ thẳng Nam-Bắc"

- **Toà** [PRET]: Gym, Center, Mart, Devon Corp (2 cửa (11,15)(12,15)), Trainer's School, 6 nhà (Flat1, Flat2, House1-3, Cutter's House).
- **Trục chính** [ĐO]:
  - Một dải đi được rộng 2 ô chạy thẳng **54 ô** ở cột 20-21, từ mép Bắc (hàng 0) xuống hàng 53. Trên ảnh [ĐO-ẢNH], đây là dải lát đá sáng giữa phố.
  - Phố quanh dải đó rộng 5-9 ô.
  - Dải ngang lớn nhất là 22x4 ở hàng 9-12. Đó là sân trước Devon, ngay dưới lối Bắc.
- **Gym**:
  - Cửa (27,19), góc Đông Bắc (+0.35, -0.37).
  - Cách lối Nam (lối vào chính) **48 bước**, cách lối Bắc 27 bước.
  - Lệch khỏi đại lộ khoảng 4-6 cột về phía Đông, ở **nửa xa** của thành phố.
  - Biển Gym ở (23,19), cách cửa 4 ô, nằm ngay mép đại lộ.
- **Center / Mart** [PRET + ĐO]:
  - Center (16,38) và Mart (16,45) xếp chồng thẳng hàng cùng cột, cách nhau 7 hàng.
  - Cả hai nằm ở nửa Nam, cách lối Nam 24 và 14 bước.
- **Quận** [ĐO-ẢNH]:
  - Bắc: Devon, Gym, nhà.
  - Nam: Center, Mart, flat.
  - Mỗi khối có hàng rào sắt bao quanh, cổng mở ra đại lộ.
  - Biển ở mép Tây (30 ô nước ở mép trái), rừng ở mép Đông.
- **Mốc**: toà Devon (khối lớn nhất, góc Tây Bắc) và đài phun nước ở phía Đông Nam [ĐO-ẢNH].
- **Trang trí** [ĐO]: 21 vật đứng riêng (1.3 mỗi màn hình), cao nhất trong 12 city. Chủ yếu là **đèn đường đặt thành cặp** hai bên đại lộ [ĐO-ẢNH], cùng 10 biển.

### 2.2. Slateport (EM, 40x60, không Gym): "phố chợ + bến cảng"

- **Toà**: Center, Mart, Battle Tent, Fan Club, Oceanic Museum (2 cửa), Name Rater, Stern's Shipyard, Harbor, 1 nhà. **5/9 toà là "đặc biệt"**.
- **Trục**:
  - Phố chợ Nam-Bắc rộng **5 ô, dài 30 ô** (cột 15-19, hàng 27-56).
  - Dải rộng 3 ô chạy 40 ô (cột 17-19, hàng 20-59).
  - Phố ngang rộng 3 ô, dài 30 ô ở hàng 13-15 [ĐO].
- **Quận** [ĐO-ẢNH]:
  - Tây Nam: chợ có rào, có lều.
  - Đông: cảng trên các bến nổi, ngăn bằng kênh nước.
  - Bắc: Battle Tent và Center.
  - Nam: bãi cát rộng 28 ô nối Route 109.
- 35 NPC (2.2 mỗi màn hình), đông nhất. 10 trong số đó là Team Aqua (sự kiện).

### 2.3. Mauville (EM, 40x20, Gym 3): "ngã tư"

```
    0000000000111111111122222222223333333333
    0123456789012345678901234567890123456789
  0 ##..........#.......####################   lối Bắc thật: cột 13-19 (7 ô)
  5 #......#D#...........#DSS#.......##D####   Gym (8,5)   Center (22,5)   Bike (35,5)
  7 .............N.....S....................   lối Tây (hàng 7-10) / lối Đông (hàng 7-11)
  8 ........................................   đại lộ Đông-Tây: 40x3, xuyên suốt map
 10 ........................N...............
 13 #....###D###..#...########.....#########   Game Corner (8,13)
 14 #######.....N.#..N#D###DSS.....#D#######   nhà (19,14), Mart (23,14), nhà (32,14)
 19 #########.##.......########.o.....##~~~~   lối Nam: cột 12-18 và 27-33
```

- **4 lối ra ở 4 phía** [PRET]. Phía Nam, mép Mauville mở hai đoạn 7 ô (cột 12-18 và 27-33). Nhưng hàng 0 của Route 110 chỉ mở cột 12-18 và **một ô cột 28** ở đoạn thứ hai, nên lối thật là 7 + 1 ô [ĐO collision `map.bin`] (kiểm chéo 2026-11-18).
- **Đại lộ Đông-Tây** dài **40 ô** (toàn bề ngang), rộng 3-4 ô, nối thẳng lối Tây và lối Đông [ĐO].
- **Bốn khối quanh đại lộ**: Gym ở Tây Bắc, Center ở giữa phía Bắc, Bike Shop ở Đông Bắc, Game Corner ở Tây Nam, Mart và 2 nhà ở giữa và Đông Nam.
- **Gym** (8,5): cách lối Nam 39 bước, nhưng chỉ cách lối Tây 10 và lối Bắc 12. Mặt tiền quay ra đại lộ.
- 59 % ô đi được, cao nhất. Đây là city nhỏ, mở, kiểu "điểm trung chuyển".

### 2.4. Fortree (EM, 40x20, Gym 6): "làng trên cây"

- **68 % ô bị chặn** (rừng). Các nhà là nhà sàn trên cây: ô nền nâng `:` (6.5 %) nối bằng cầu treo và thang [ĐO-ẢNH].
- Không có phố. Dải 2 ô dài nhất chỉ 11 ô [ĐO].
- **Center (5,6) và Mart (4,14) nằm sát lối Tây**: 6 và 16 bước.
- **Gym (22,11) ở chính giữa map** (+0.1, +0.1), dưới đất, cách lối Tây 35 bước.
  - Lối vào Gym bị chặn bởi Kecleon tàng hình ở (25,8) (`FLAG_HIDE_FORTREE_CITY_KECLEON`) [PRET].
  - Gym bị chặn bằng **cốt truyện**, không phải bằng HM.

### 2.5. Lilycove (EM, 80x40, không Gym): "bậc thang ven biển"

- **Toà**: Department Store, Museum (2 cửa), Contest Hall, Motel, Trainer Fan Club, Move Deleter, 4 nhà, Center, Harbor, Aqua Hideout (hang bên kia nước).
- **Ba tầng đất** ngăn bằng vách đá có cầu thang [ĐO-ẢNH], cộng 32 ô ledge [ĐO]:
  - Trên: Museum, Department Store.
  - Giữa: Center, nhà.
  - Dưới: Contest Hall, Motel.
- **Phố chính** Đông-Tây rộng 4 ô, dài 35 ô (hàng 15-18) [ĐO].
- Chỉ có **một lối đất liền rộng 3 ô** (Route 121, Tây). Phía Đông là bãi cát và biển (Route 124).
- d lớn nhất = 6 ở bãi cát. Đây là khoảng trống lớn nhất trong 12 city, và nó nằm ngoài khu phố.

### 2.6. Mossdeep (EM, 80x40, Gym 7): "đảo, đường đất hữu cơ"

- Đảo cao nguyên. Ô nền nâng `:` chiếm 28 % [ĐO].
- **Đường cát uốn lượn**, không có phố thẳng dài hơn 25 ô (bề rộng 2) [ĐO, ĐO-ẢNH].
- **Gym (38,9)** ở chính Bắc (-0.05, -0.55), cuối con đường cát chạy lên phía Bắc. Cách bãi đổ bộ phía Tây 55 bước.
- **Center (28,16) và Mart (37,18)** ở giữa phía Tây, cách nhau 11 ô (Manhattan).
- **Mốc**: Space Center (9x8, CB§2) trên một cao nguyên riêng ở phía Đông, lên bằng 2 bậc cầu thang [ĐO-ẢNH].
- Cây mọc thành cụm 2-6 cây rải khắp đảo, thay cho hàng rào [ĐO-ẢNH].

### 2.7. Sootopolis (EM, 60x60, Gym 8): "miệng núi lửa"

- Nhà nằm trên các bậc vách miệng núi, nối bằng cầu thang. 57 % ô chặn. 21 % ô đi được là ngõ 1 ô [ĐO].
- **Hồ ở giữa** (18 % nước). **Gym (31,32) trên đảo giữa hồ**, gần như đúng tâm (+0.03, +0.07). Muốn vào phải Surf [PRET + ĐO-ẢNH].
- Cave of Origin ở chính Bắc (31,16), thẳng trục với Gym.
- **Center (43,31) và Mart (17,29) đặt đối xứng hai bên hồ**, cách nhau 28 ô [ĐO]. Đây là city duy nhất trong mẫu mà Center và Mart xa nhau.

### 2.8. Cerulean (FR, 48x40, Gym 2): "lưới nhỏ quanh cụm trung tâm"

- **Toà**: 5 nhà, Center, Gym, Bike Shop (2 cửa), Mart, Cerulean Cave (ở Tây Bắc, bên kia nước).
- **Center (22,19) và Gym (31,21) đứng cạnh nhau** ở giữa map, cách nhau 11 ô. Từ lối Tây: 23 và 32 bước.
- **Phố**:
  - Các phố Đông-Tây ở hàng 12-14, 20-22 và 29-31. Phố dài nhất rộng 3 ô, dài 31 ô (hàng 29-31).
  - Đường Nam-Bắc rộng 2 ô, dài 24 ô.
  - Độ rộng cục bộ: 50 % ô ở mức 2-4 [ĐO].
- **Lối ra**:
  - Phía Bắc: 2 làn 3 ô (cầu Nugget và lối cỏ bên cạnh) [ĐO-ẢNH].
  - Phía Nam: 3 làn ra Route 5, làn giữa có dải ledge 8 ô.
  - Lối Đông bị chặn bằng cây Cut ở (50,18). Object này nằm ngoài mép Đông 3 ô, tức phía bên Route 9 [PRET].
- **Ngăn quận**: sông và hồ ở Tây Bắc, 19 ô ledge, hàng rào và hàng bụi ở phía Nam [ĐO-ẢNH].

### 2.9. Vermilion (FR, 48x40, Gym 3): "cảng"

- **47 % là nước** [ĐO]. Đất là một bán đảo hình chữ L, ven biển có cát (7 %).
- Toà xếp thành **hàng dọc mép nước phía Tây**. Center ở trên cùng, cách lối Bắc 15 bước [ĐO-ẢNH].
- **Gym (14,25)** ở Tây Nam. Phải qua cây Cut (19,24) [PRET], tổng 35 bước từ lối Bắc.
- Cầu tàu lát gỗ dẫn xuống S.S. Anne ở phía Nam. Cửa tàu là 3 ô warp liền nhau (22-24,34).
- Phố lớn nhất là khoảng sân 21x8 ở giữa [ĐO]. Ở đó có một khu đất trống có rào [ĐO-ẢNH].

### 2.10. Celadon (FR, 60x40, Gym 4): "đại lộ đô thị"

- **Toà**: Department Store (2 cửa), Condominiums / Mansion (4 cửa), Game Corner, Prize Room, Restaurant, Hotel, 1 nhà, Center, Gym.
- **Hai đại lộ Đông-Tây song song**:
  - Hàng 12-15: rộng 3-4 ô, dài 41 ô.
  - Hàng 22-25.
  - Nối nhau bằng các phố ngắn Nam-Bắc rộng 2 ô [ĐO].
- **Center ở ngay lối Đông** (Route 7): chỉ 12 bước.
- **Gym (11,30) giấu ở góc Tây Nam**, sau cây Cut (40,35). Tổng **93 bước**, xa nhất trong mẫu.
- Khu Gym là một vườn rào kín, có hoa và cây [ĐO-ẢNH].
- **Mốc** [ĐO-ẢNH]:
  - Department Store: khối lớn nhất, góc Tây Bắc.
  - Quảng trường đài phun có 4 bồn hoa ở phía Tây.
  - Ao vuông giữa khu Game Corner.
- **Mặt nhà không cửa**: theo ảnh có khoảng 18 mặt nhà nhưng chỉ 9 toà có cửa [ĐO-ẢNH]. Các dãy chung cư liền tường dùng để lấp kín mép phố.

### 2.11. Fuchsia (FR, 48x40, Gym 5): "vườn thú"

- **Mốc ở chính Bắc**: cổng Safari Zone (24,5), toà lớn nằm thẳng trục.
- **Các chuồng thú** rào bằng hàng rào cây, có ao hoặc cát [ĐO-ẢNH]. Có 6 biển tên Pokémon (Voltorb, Slowpoke, Chansey, Kangaskhan, Lapras, Fossil) [PRET bg_events].
- **Hàng toà phía Nam** (Gym, nhà, Center, nhà) dựng trên một gờ đá, ngăn với nửa Bắc bằng vách đá và 20 ô ledge [ĐO].
- **Gym (9,32)** ở Tây Nam, cuối dãy. Từ lối Tây 29 bước, từ bãi phía Nam 17 bước.
- 4 cây Cut nằm rải trong city, chặn các lối tắt [PRET].

### 2.12. Saffron (FR, 66x55, Gym 6): "thành phố tường bao, lưới đối xứng"

- Phần đô thị là một **ô vuông có hàng rào bao quanh**, đi được trong khoảng cột 15-52 và hàng 10-44 (38x35 ô) [ĐO].
- Bên ngoài là rừng dày tới 15 ô.
- **Bốn gatehouse ở bốn phía**: N (34-35,5), S (34-35,46), W (8,27), E (58,27). Đây là lối duy nhất vào thành phố [PRET].
- **Silph Co. ở đúng tâm** (33,30), trên trục Nam-Bắc nối cổng N và cổng S [PRET + ĐO-ẢNH].
- **Gym (46,12) và Dojo (40,12) đứng cạnh nhau** ở Đông Bắc. Từ cổng Bắc tới Gym chỉ 20 bước.
- **Phố**:
  - Vành đai trong rộng 3 ô (cột 15-17 và 50-52).
  - Phố ngang ở hàng 15-16, 22-24, 31-34, 39-41, rộng 2-4 ô, dài tới 38 ô [ĐO].
  - 57 % ô đi được có độ rộng cục bộ 2-4.
- **Mặt nhà không cửa**: theo ảnh có khoảng 30 mặt nhà nhưng chỉ 9 toà có cửa, không tính gate [ĐO-ẢNH]. Các dãy nhà liền tường xếp thành hàng phố.
- 8 Rocket đứng chặn phố có cờ `FLAG_HIDE_SAFFRON_ROCKETS`, tức là chặn bằng cốt truyện [PRET].

---

## 3. Đo xuyên các thành phố

### 3.1. Kích thước theo tiến trình [PRET + SUY RA]

Kích thước mọi town và city trong `layouts.json`:
- **EM**:
  - Mọi *Town* đều 20x20 (Littleroot, Oldale, Dewford, Lavaridge, Fallarbor, Verdanturf). Riêng Pacifidlog 20x40.
  - *City*: Petalburg 30x30, Mauville và Fortree 40x20, Rustboro và Slateport 40x60, Lilycove và Mossdeep 80x40, Sootopolis 60x60, Ever Grande 40x80.
- **FR**:
  - Town 24x20 (Pallet, Lavender, Cinnabar).
  - City **48x40 là khung chuẩn** (Viridian, Pewter, Cerulean, Vermilion, Fuchsia). Celadon 60x40, Saffron 66x55.

Đọc số liệu [SUY RA]:
- **FR dùng một khung chuẩn 48x40 (3.2 x 4 màn hình)** và chỉ phóng to cho hai "đô thị lớn" (Celadon +25 % diện tích, Saffron +89 %).
- **EM chọn kích thước theo chủ đề**, không theo thứ tự Gym:
  - city trung chuyển (Mauville, Fortree) nhỏ, 800 ô;
  - city cảng hoặc ven biển (Slateport, Lilycove, Mossdeep) và city cuối game (Sootopolis) lớn, 2400-3600 ô.
- **Kích thước tăng dần theo tiến trình nhưng không đều**:
  - EM: Gym 1 có 2400 ô, Gym 3 có 800, Gym 6 có 800, Gym 7 có 3200, Gym 8 có 3600.
  - FR: Gym 2, 3, 5 có 1920 ô; Gym 4 có 2400; Gym 6 có 3630.
  - Thành phố lớn nhất là thành phố "trung tâm vùng" hoặc gần cuối game.
- **Kích thước gần như luôn chẵn**: EM luôn là bội số của 10; FR chủ yếu là 24 hoặc 48 x 20 hoặc 40. Ngoại lệ duy nhất là Saffron 66x55. Kích thước chẵn giúp rừng 2x2 ăn khớp lưới (MC§2.3).

### 3.2. Tỉ lệ đi được và cách lấp đầy [ĐO]

| City | Đi % | Ô có d ≥ 3 % | d lớn nhất | Độ rộng cục bộ 1 / 2-4 / ≥5 (%) | Vật đứng riêng / màn hình | NPC / màn hình |
|---|---|---|---|---|---|---|
| Rustboro | 48 | 10 | 4 | 10 / 23 / 65 | 1.3 | 1.0 |
| Slateport | 47 | 13 | 5 | 6 / 31 / 62 | 0.7 | 2.2 |
| Mauville | 59 | 16 | 4 | 4 / 25 / 69 | 0.6 | 2.1 |
| Lilycove | 45 | 13 | 6 | 6 / 38 / 54 | 0.9 | 1.0 |
| Mossdeep | 40 | 6 | 3 | 10 / 38 / 50 | 0.7 | 0.8 |
| Fortree | 31 | 0 | 3 | 22 / 46 / 30 | 0.2 | 1.3 |
| Sootopolis | 25 | 0 | 3 | 21 / 57 / 21 | 0.1 | 0.8 |
| Cerulean | 45 | 7 | 3 | 2 / 50 / 47 | 0.2 | 0.9 |
| Vermilion | 32 | 17 | 5 | 3 / 37 / 58 | 0.0 | 0.6 |
| Celadon | 46 | 11 | 4 | 3 / 48 / 47 | 0.1 | 0.9 |
| Fuchsia | 48 | 4 | 4 | 4 / 62 / 33 | 0.5 | 1.2 |
| Saffron | 25 | 3 | 3 | 11 / 57 / 31 | 0.0 | 0.6 |

Rút ra:
- **Không có ô đi được nào cách vật cản quá 5 ô** [ĐO]. Ngoại lệ duy nhất là bãi cát Lilycove (d = 6).
- **83-100 % ô đi được nằm trong 2 ô quanh một vật cản** [ĐO].
- "Quảng trường" lớn nhất của mọi city là **một dải dài 3-4 ô bề dày** (Rustboro 22x4, Mauville 40x3, Lilycove 35x4, Celadon 41x4, Saffron 38x3), không phải một sân vuông [ĐO].
- Sân vuông lớn nhất: Vermilion 21x8 và Mossdeep 13x6.
- [SUY RA] Gen 3 tránh khoảng trống bằng cách **cho phố hẹp chạy dài**, không làm sân rộng.
- Nhóm FR có nhiều ô rộng 2-4 hơn (47-62 %). Nhóm EM có nhiều ô rộng ≥ 5 hơn, vì EM để vỉa hè rộng quanh toà nhà [ĐO].
- Số vật trang trí đứng riêng thấp ở FR (0-0.5 mỗi màn hình). FR lấp chỗ trống bằng **dãy nhà liền tường không cửa, hàng rào và hàng cây** [ĐO-ẢNH]. EM dùng đèn, biển và cụm cây.
- Không city nào có trainer [PRET]. Mỗi city có 0-1 item ball và 0-3 hidden item. Nội dung tuỳ chọn trong city là NPC và toà đặc biệt, không phải item.

### 3.3. Toà nhà: số lượng, loại, khoảng cách [PRET + ĐO]

- **Số toà có cửa: 7-13 mỗi city.** Mật độ:
  - 0.4-0.7 toà mỗi màn hình ở city lớn;
  - 1.3-1.7 toà mỗi màn hình ở city nhỏ 40x20 (Mauville, Fortree).
- **Cơ cấu** [SUY RA từ bảng §1]: 1 Center + 1 Mart (hoặc Department Store) + 0-1 Gym + **0-7 toà đặc biệt** + 1-9 nhà.
  - City không có Gym (Slateport, Lilycove) bù bằng nhiều toà đặc biệt nhất (5-7).
- **Khoảng cách giữa các cửa** (Manhattan tới cửa gần nhất): nhỏ nhất 4-8, **trung vị 5-12**, lớn nhất 11-25.
- **Center ↔ Mart** (Manhattan):
  - EM 7-13, trừ Sootopolis 28;
  - FR 16-40 (Cerulean 16, Vermilion 25, Fuchsia 30, Saffron 33, Celadon 40). FR không gom Center và Mart thành cụm.
- **Center ↔ Gym** (Manhattan): 11, 13, 14, 17, 17, 20, 22, 30, 48, 56. **Trung vị 18.5.**
- Biển báo [PRET]:
  - EM có 2 bg_event biển cạnh cửa Center và Mart (x+1 và x+2 cùng hàng cửa, MC§2.9).
  - **FR không có bg_event biển Center và Mart nào** trong 5 city đã đo; chữ chỉ nằm trên mái.
  - **Biển Gym** đứng riêng, cách cửa 2-5 ô theo chiều ngang, cùng hàng cửa hoặc lệch 1-2 hàng (Rustboro 4 ô, Mauville 3, Fortree 4, Mossdeep 4, Sootopolis 2, Cerulean 4, Vermilion 4, Celadon 5, Saffron 4, Fuchsia 4).
  - **Biển thành phố** cách lối vào chính tối đa khoảng 1 màn hình (Rustboro 10 hàng, Lilycove 6 cột, Fortree 6 cột).

### 3.4. Lối ra [PRET + ĐO]

- **Số lối đất liền: 1-4** (trung vị 2-3). Lối ra phụ thường là nước (Surf) hoặc warp (cảng, gate, hang).
- **Bề rộng lối đất liền**:
  - **3-5 ô** là phổ biến (W/E của Celadon, Fuchsia, Vermilion, Cerulean, Mauville, Fortree);
  - lối chính hướng về route lớn rộng 5-8 ô (Rustboro 5/6/8, Mauville 7) (kiểm chéo 2026-11-18);
  - bãi cát rộng 10-28 ô (Fuchsia S 10, Slateport S 28).
- **FR đặt lối ra giữa mép**: offset connection 10 hoặc 12 cho route 24 ô trên city 48 ô. Lối W/E của Celadon, Cerulean, Fuchsia đều nằm quanh hàng 12-24. EM dùng offset 0 và lối lệch theo địa hình (Rustboro lối N ở cột 19-23, lối S ở cột 12-19).
- **Lối có thể tách làn**: Mauville S có hai lối, 7 ô và 1 ô sau khi giao với Route 110 (kiểm chéo 2026-11-18); Cerulean S có 3 làn ngăn bằng ledge; Cerulean N là cầu 2 làn.
- **Chặn lối bằng HM hoặc cốt truyện**: Cerulean E (Cut), Saffron (Rocket chặn bằng cờ), Sootopolis (Dive).

### 3.5. Trục phố [ĐO]

Bề rộng và chiều dài phố thẳng dài nhất:

| City | Trục chính | Trục phụ | Kiểu |
|---|---|---|---|
| Rustboro | N-S rộng 2 (lõi lát đá), dài 54; phố 5-9 ô quanh lõi | E-W 4x22 | 1 trục dọc + nhánh |
| Slateport | N-S 5x30 (chợ), 3x40 | E-W 3x30 | chữ T |
| Mauville | E-W 3x40 (toàn bề ngang) | N-S x13 | ngã tư |
| Lilycove | E-W 4x35 | N-S 3x22 | bậc thang |
| Celadon | E-W 3-4x41, hai đại lộ song song | N-S 2x16 | lưới |
| Saffron | E-W 3x38 (4 phố) | vành đai 3 ô, N-S 2-3x33 | lưới đối xứng |
| Cerulean | E-W 3x31 | N-S 2x24 | lưới nhỏ |
| Vermilion | E-W 3x33 | N-S 2-3x23 | chữ L |
| Fuchsia | E-W 3x29 | N-S 2x20 | lưới thưa |
| Mossdeep | đường cong 2x25 | – | hữu cơ |
| Fortree, Sootopolis | không có phố > 14 ô | – | sàn hoặc bậc nối cầu |

Quy luật [SUY RA]:
- **Phố chính rộng 3-4 ô, dài 30-41 ô (2-3 màn hình)**, luôn nối ít nhất hai lối ra.
- Phố phụ rộng 2-3 ô.
- City dài theo chiều dọc (40x60) dùng **một trục dọc** gần như xuyên map.
- City rộng ngang (60-80) dùng **1-2 đại lộ ngang**.
- **Lưới vuông là đặc trưng FR** (Celadon, Saffron, Cerulean). **EM chuộng trục đơn hoặc địa hình hữu cơ** (Mossdeep, Lilycove, Fortree, Sootopolis).

### 3.6. Quận và vật ngăn [ĐO-ẢNH + ĐO]

| Vật ngăn | Thấy ở | Vai trò |
|---|---|---|
| **Hàng rào** (sắt, gỗ, hàng cây thấp) | Rustboro, Celadon, Saffron, Fuchsia, Cerulean, Mauville | bao từng khối nhà, chừa cổng ra phố |
| **Nước** (biển, sông, hồ, kênh) | Slateport, Lilycove, Mossdeep, Vermilion, Cerulean, Sootopolis | tách cảng / đảo / hang; lối tuỳ chọn cần Surf |
| **Vách đá + cầu thang** (đổi elevation) | Lilycove (3 tầng), Mossdeep (cao nguyên), Sootopolis (vòng bậc), Fuchsia (gờ Nam) | tách tầng, tạo mốc nhìn từ xa |
| **Ledge** | Cerulean 19 ô, Celadon 14, Fuchsia 20, Lilycove 32 | lối tắt một chiều quay về phố chính hoặc lối ra |
| **Rừng hoặc cụm cây** | Celadon (khu Gym), Saffron (vành ngoài), Fortree (toàn city), Mossdeep (cụm 2-6 cây) | khung và vách ngăn mềm |
| **Cây Cut** | Vermilion (Gym), Celadon (Gym), Cerulean (lối E), Fuchsia (4 lối tắt) | khoá một quận cho lần quay lại |

- Số quận nhìn thấy được: **3-4** ở city 48x40 trở lên, 2 ở city 40x20 [ĐO-ẢNH].
- Mỗi quận có 2-5 toà.

### 3.7. Vị trí Gym [ĐO + SUY RA]

| City | Vị trí (chuẩn hoá) | Bước từ lối chính | Bước tới Center (từ cùng lối) | Gym / Center | Trên trục chính? | Chặn |
|---|---|---|---|---|---|---|
| Rustboro | Đông Bắc (+.35, -.37) | 48 | 24 | 2.0 | cạnh trục, cuối trục | không |
| Mauville | Tây Bắc (-.6, -.5) | 39 | 25 | 1.6 | mặt tiền ra đại lộ, đầu Tây | không |
| Fortree | tâm (+.1, +.1) | 35 | 6 | 5.8 | giữa, dưới đất | cốt truyện (Kecleon) |
| Mossdeep | chính Bắc (-.05, -.55) | 55 | 38 | 1.4 | cuối đường cát Bắc | không |
| Sootopolis | tâm, trên đảo | – | – | – | tâm hồ, thẳng trục với Cave of Origin | Surf |
| Cerulean | Đông tâm (+.29, +.05) | 32 | 23 | 1.4 | trên phố ngang giữa, cạnh Center | không |
| Vermilion | Tây Nam (-.42, +.25) | 35 | 15 | 2.3 | khuất | Cut |
| Celadon | Tây Nam (-.63, +.5) | 93 | 12 | 7.8 | khuất, vườn kín | Cut |
| Fuchsia | Tây Nam (-.62, +.6) | 29 | 46 | 0.6 | cuối dãy Nam | không |
| Saffron | Đông Bắc (+.39, -.56) | 20 | 29 | 0.7 | phố Bắc, cạnh Dojo | cốt truyện (Rocket) |

Rút ra [SUY RA]:
- **Ở 7/9 city đo được, Gym xa lối vào chính hơn Center**: 1.4-7.8 lần. Trung vị của cả 9 tỉ lệ là 1.6.
- Gym **lệch xa tâm** (|toạ độ chuẩn hoá| ≥ 0.35 theo ít nhất một trục) ở 7/10 city.
  - Ngoại lệ là các Gym "trung tâm biểu tượng": Fortree, Sootopolis, Cerulean.
- **EM**: Gym nằm ở cuối hoặc cạnh trục chính, nhìn thấy được; nếu chặn thì chặn bằng cốt truyện hoặc Surf.
- **FR**: Gym thường **khuất ở góc** (Vermilion, Celadon và Fuchsia đều ở Tây Nam), hai trong số đó cần Cut. Đây là di sản của Gen 1 mà bản remake giữ nguyên [SUY RA].
- **Gym chưa bao giờ sát lối ra**: ít nhất 20 bước (Saffron), thường 30-55.
- Center luôn được đặt trước Gym trên đường đi, trừ Fuchsia và Saffron (city có nhiều lối vào ngang hàng).

### 3.8. Center và Mart so với lối vào [ĐO]

- Bước từ lối chính tới Center: 6, 12, 15, 23, 24, 25, 26, 29, 38, 40, 46. **Trung vị 25** (khoảng 1.5-2.5 màn hình).
- Khi tính lối gần nhất, Center **cách ít nhất một lối đất liền ≤ 26 bước** (Fortree 6, Fuchsia 12 từ lối Nam, Slateport 23 từ lối Bắc).
  - Ngoại lệ: Saffron 29 (từ cổng Bắc) và Mossdeep 38 (từ bãi đổ bộ, vì đó là đảo).
- Mart thường cách Center 7-13 ô (EM). Ở city có Department Store thì Mart nhỏ không còn (Lilycove) hoặc đặt ở quận khác (Celadon).

---

## 4. Tổng hợp

### 4.1. Bộ khung chung của city lớn Gen 3 [SUY RA từ §2-3]

```
lối vào chính (3-8 ô, có biển thành phố trong ~1 màn hình)
   │  12-26 bước
   ▼
cụm dịch vụ: Center (+ Mart trong 7-13 ô)       ← quận "đón khách"
   │  phố chính 3-4 ô, dài 2-3 màn hình, nối ≥ 2 lối ra
   ▼
mốc (toà đặc biệt lớn nhất / đài phun / chợ / tháp) ← thường ở giữa hoặc cuối trục
   │  rẽ khỏi trục 0-6 ô, hoặc qua một vật ngăn (nước / Cut / vách)
   ▼
Gym: nửa xa của map, 30-55 bước từ lối chính, biển Gym cách cửa 2-5 ô
   │
   ▼
lối ra tiếp theo (route kế tiếp), thường gần Gym hơn lối vào
```

Ví dụ khớp với khung:
- **Rustboro**: Nam → Mart, Center → đại lộ → Devon (mốc) → Gym → Bắc.
- **Mauville**: Nam → Mart → đại lộ → Center → Gym → Tây / Bắc.
- **Mossdeep**: bãi Tây → Center, Mart → đường cát → Gym ở Bắc; Space Center là mốc ở Đông.
- **Cerulean**: Tây → Center cạnh Gym (cụm dịch vụ trùng với mốc).
- **Celadon**: Đông → Center ngay cổng → đại lộ → Department Store, Game Corner → Gym khuất sau Cut.

Không khớp: Saffron và Fuchsia. Hai city này có nhiều lối vào ngang hàng, nên "lối chính" không rõ.

### 4.2. Emerald khác FRLG ở đâu [ĐO + SUY RA]

| Khía cạnh | Emerald | FRLG |
|---|---|---|
| Kích thước | theo chủ đề: 40x20 đến 80x40 | khung chuẩn 48x40; 60x40 và 66x55 cho đô thị lớn |
| `map_type` | `CITY` | `TOWN` |
| Bố cục | trục đơn, ngã tư, địa hình nhiều tầng (vách, cầu thang, nhà sàn) | lưới vuông, hàng rào bao khối |
| Lấp chỗ trống | vỉa hè rộng, đèn đường thành cặp, cụm cây, hoa | dãy nhà liền tường không cửa, hàng rào, hàng cây |
| Gym | trên hoặc cạnh trục; chặn bằng cốt truyện hoặc Surf | hay khuất ở góc; Cut chặn Vermilion và Celadon |
| Biển Center / Mart | 2 bg_event cạnh cửa | không có |
| Ledge trong city | Lilycove | phổ biến (Cerulean, Celadon, Fuchsia, Viridian) |

### 4.3. Template đề xuất cho city Mons 40x40 đến 60x50, 1-2 Gym [SUY RA, số lấy từ §1-3]

**Khung và lối ra**

| Thông số | 1 Gym | 2 Gym | Căn cứ |
|---|---|---|---|
| Kích thước (ô) | 48x40 (3.2 x 4 màn hình) | 60x48 đến 60x50 (4 x 5 màn hình) | FR chuẩn 48x40; Celadon 60x40; Saffron 66x55 |
| Kích thước chẵn, khung rừng | dày 2-4 ô, chỗ phình 6-15 ô | như cột trái | MC§2.3, Saffron vành 15 ô |
| Đi được | 40-50 % | 40-50 % | trung vị 12 city khoảng 45 % |
| Nước / vách / nền nâng | 0-25 % | 0-25 % | dùng làm vật ngăn quận |
| Lối ra đất liền | 2-3 | 3-4 | §3.4 |
| Bề rộng lối ra | 3-5 ô; lối chính 5-8 ô | như cột trái | §3.4 |
| Vị trí lối ra | giữa mép (offset sao cho route nằm giữa) | như cột trái | FR offset 10/12 |

**Phố, quận, toà**

| Thông số | 1 Gym | 2 Gym | Căn cứ |
|---|---|---|---|
| Phố chính | 1 phố, rộng 3-4 ô, dài 30-40 ô, nối 2 lối ra | 2 phố song song hoặc chữ T, cách nhau 8-12 hàng | Celadon (hàng 12-15 và 22-25) |
| Phố phụ | 2-3 phố, rộng 2-3 ô | 3-5 phố | §3.5 |
| Ô có độ rộng cục bộ 2-4 | 30-60 % | 30-60 % | §3.2 |
| Khoảng trống | d ≤ 4 mọi nơi; ≥ 85 % ô đi được có d ≤ 2 | như cột trái | §3.2 |
| Quận | 3 | 4 | §3.6 |
| Toà có cửa | 8-11 | 11-14 | §3.3 |
| Cơ cấu toà | 1 Center, 1 Mart, 1 Gym, 2-3 đặc biệt (1 là mốc lớn), 3-5 nhà | 1 Center, 1 Mart hoặc Department Store, 2 Gym, 3-4 đặc biệt, 4-6 nhà | §3.3 |
| Mặt nhà không cửa (tuỳ chọn) | 0-6 | 5-15 | Saffron, Celadon |

**Vị trí Center, Mart, Gym, mốc**

| Thông số | 1 Gym | 2 Gym | Căn cứ |
|---|---|---|---|
| Center | 12-26 bước từ lối chính, trên phố chính | như cột trái | §3.8 |
| Mart | cách Center 7-13 ô | như cột trái | §3.3 |
| Gym 1 | 30-55 bước từ lối chính (≥ 1.4 lần bước tới Center); nửa xa; cuối trục hoặc lệch ≤ 6 ô | như cột trái | §3.7 |
| Gym 2 | – | khác quận Gym 1, cách Gym 1 ≥ 20 ô; có thể sau vật ngăn (nước, vách, cây chặt được) dành cho lần quay lại | Celadon, Vermilion, Sootopolis |
| Mốc | 1 toà lớn 9-10 ô ngang hoặc 1 quảng trường đài phun, ở giữa hoặc cuối trục | 1-2 | Devon 10x9, Department Store 9x10, Space Center 9x8, Silph (CB§2) |

**Trang trí, NPC, biển báo**

| Thông số | 1 Gym | 2 Gym | Căn cứ |
|---|---|---|---|
| Trang trí đứng riêng | 0.5-1.3 mỗi màn hình (đèn thành cặp dọc phố chính, đài phun, cụm cây 2-6) | như cột trái | §3.2 |
| NPC | khoảng 1 mỗi màn hình (0.6-2.2) | như cột trái | §3.2 |
| Trainer | 0 | 0 | [PRET] |
| Item | 0-1 item ball, 0-3 hidden | như cột trái | [PRET] |
| Biển báo | biển thành phố trong khoảng 1 màn hình từ lối chính; biển Gym cách cửa 2-5 ô; biển cạnh cửa Center và Mart (kiểu EM) | như cột trái | §3.3 |
| Ledge | 0-20 ô, hướng về phố chính hoặc lối vào | như cột trái | §3.6 |

Phác thảo 48x40, 1 Gym, lối chính ở phía Nam [SUY RA]. Chỉ để minh hoạ thứ tự đặt, không phải map:

```
##########################....##########################   lối N 4 ô → route tiếp theo
##  [mốc 10x5]     .....      ....   [GYM 6x5]        ##   Gym: nửa Bắc, cuối trục
##        S        .....      .... S                  ##   biển Gym cách cửa 2-5 ô
##=====rào=====    .....      ..........  [nhà]       ##
##                 .....                                    lối E 4 ô (tuỳ chọn, sau nước hoặc Cut)
##  [nhà] [nhà]    ...... phố chính 3-4 ô ..........  ##
## ~~~~ ao/kênh ~~ .....   [đặc biệt]    [nhà]        ##   vật ngăn quận
##                 .....                              ##
##  [CENTER] S S   .....   [MART] S S     [nhà]       ##   Center 12-26 bước từ lối S
##        S(biển thành phố)                           ##
####################......##############################   lối S 5-8 ô = lối vào chính
```

---

## 5. Áp dụng cho Mons

1. **Chọn khung trước**: 48x40 cho city 1 Gym, 60x48 cho city 2 Gym. Kích thước chẵn, khung rừng 2x2 khớp lưới (MC§5.3 bước 1).
2. **Chốt lối ra và route** (MC§5.2 bước 1):
   - Lối chính 5-8 ô, lối khác 3-5 ô, đặt giữa mép.
   - Ghi rõ đâu là "home" (lối người chơi tới lần đầu). Lối này quyết định khoảng cách Center và Gym.
3. **Vạch phố chính** 3-4 ô bằng `paved-path`, nối lối chính với ít nhất một lối khác. Rồi thêm 2-3 phố phụ 2-3 ô.
4. **Đặt Center** cách lối chính 12-26 bước, ngay trên phố chính. Đặt Mart trong 7-13 ô quanh Center.
5. **Đặt mốc** (toà đặc biệt lớn hoặc quảng trường đài phun) ở giữa hoặc cuối trục.
6. **Đặt Gym** ở nửa xa: 30-55 bước, khoảng 1.5-2 lần đường tới Center, mặt tiền nhìn ra phố.
   - Với Gym thứ hai: đặt ở quận khác, sau một vật ngăn (`water`, `cliff`, `ledge`, `cut-tree`).
   - Kích thước và silhouette Gym theo skill structure (body 6 metatile rộng) và CB§2.
7. **Chia quận** bằng `fence` / `hedge` / `water` / `cliff`, mỗi quận 2-5 toà.
8. **Lấp trống**:
   - Kiểm tra không ô đi được nào cách vật cản quá 4 ô.
   - Lấp bằng đèn (`street-lamp`) đặt thành cặp dọc phố chính, bồn `flowers`, cụm `tree` 2-6 cây.
   - Kiểu FR: dãy nhà liền tường không cửa (Structure không có warp).
9. **Biển và NPC**:
   - `sign` thành phố trong khoảng 1 màn hình từ lối chính, biển Gym cách cửa 2-5 ô.
   - Khoảng 1 NPC mỗi màn hình, 0 trainer, 0-1 `item-ball`.
10. **Lint** [SUY RA, đề xuất cho `pokemon-map-generator`]. Có thể đo tự động các chỉ số sau trên spec:
    - đi được 40-50 %;
    - d lớn nhất ≤ 4-5;
    - bước tới Center ≤ 26;
    - bước tới Gym / bước tới Center ≥ 1.4;
    - mỗi lối ra rộng 3-8;
    - mỗi cửa có ô đi được ngay dưới.

Tôi chưa kiểm tra mapgen hiện có đo được những chỉ số nào.

---

## 6. Câu hỏi mở

- **Viewport của Mons**: nếu Mons không dùng 15x10 ô, các con số "màn hình" (phố dài 2-3 màn hình, biển trong khoảng 1 màn hình) cần quy đổi lại. Số bước và bề rộng theo ô thì giữ nguyên.
- **City 2 Gym không có tiền lệ trong Gen 3.** Mỗi city chỉ có tối đa 1 Gym; Saffron có Gym + Dojo, là cặp gần nhất với "2 Gym". Mọi con số cho Gym thứ hai ở §4.3 là [SUY RA]. Cần chọn:
  - hai Gym cùng quận cạnh nhau (kiểu Saffron Gym + Dojo, cách 6 ô);
  - hay khác quận, khoá bằng vật ngăn (kiểu Celadon).
- **Chặn bằng HM hay bằng cốt truyện?** Mons có HM / cây Cut không? Nếu không, chỉ còn cách chặn bằng cốt truyện (NPC có cờ) như EM.
- **Mặt nhà không cửa**: lấp đầy hiệu quả (Saffron) nhưng có thể làm người chơi thất vọng khi đi tới và không vào được. Mons có muốn dùng không?
- **Tầng cao (elevation)**: Lilycove, Mossdeep và Sootopolis dựa vào vách và cầu thang. Bộ piece của repo đã có `cliff`, nhưng chưa có cầu thang nối hai tầng: chưa xác minh.

## Phụ lục: giới hạn và chưa xác minh

- Số bước là **cận dưới**: tìm đường bỏ qua NPC đứng chặn, không mô phỏng elevation (trừ ô `:`), coi cây Cut là đi qua được (có đếm số cây).
- "Lối vào chính" là do tôi chọn theo thứ tự cốt truyện [SUY RA]. Chọn lối khác thì số bước tới Center và Gym đổi (đã ghi số từ các lối khác ở §2 khi khác biệt lớn).
- Số mặt nhà không cửa ở Celadon (khoảng 18) và Saffron (khoảng 30), số quận, kiểu vật ngăn, đèn thành cặp đều đếm bằng mắt trên ảnh dựng lại [ĐO-ẢNH]. Chưa đếm bằng script.
- Chỉ số "vật trang trí đứng riêng" bỏ sót hoa, bụi đi được và vật dính vào hàng rào, nên chỉ dùng để so sánh tương đối.
- Chưa đo: Pewter, Lavender, Viridian (đã có ở MC), Petalburg (có ở MC§2.10), Ever Grande, Lavaridge, các đảo Sevii.
- Không tìm được tài liệu chính thức nào của Game Freak về luật bố cục city ở mức ô. Mọi quy tắc trên là [ĐO] hoặc [SUY RA].

---

## Phụ lục: ghi chú sau kiểm chéo (2026-11-18)

- §3.4 "FR đặt lối ra giữa mép" nên đọc là: FR căn route vào giữa cạnh bằng offset; ô lối ra thật thường gần giữa, ngoại lệ Celadon E (hàng 12-15 trên 40). Route 5 rộng 48 nối Cerulean với offset 0 (xem gen3-world-connections.md §3.3).
