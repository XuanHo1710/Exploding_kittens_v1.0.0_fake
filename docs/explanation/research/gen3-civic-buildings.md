# Công trình dân sự (không phải Gym) trong Gen 3 — RSE và FRLG

Mục đích: giúp chọn catalog công trình dân sự để vẽ cho Mons theo phong cách Gen 3. Tài liệu trả lời bốn câu hỏi: có những loại nào, dùng để làm gì, xuất hiện ở đâu, kích thước và diện mạo ra sao.

Quy ước: kích thước tính bằng **metatile (16x16 px)**. Nhãn **[đo]** nghĩa là tôi tự đo từ dữ liệu pret. **[ước]** là ước lượng. **chưa xác minh** là chưa có nguồn kiểm chứng.

## 0. Nguồn và phương pháp

Mọi số liệu gắn nhãn [S1]..[S6] lấy từ các nguồn sau.

| Mã | URL | Dùng cho |
|---|---|---|
| S1 | https://raw.githubusercontent.com/pret/pokeemerald/master/data/maps/map_groups.json | Danh sách mọi map (kể cả nội thất) của RSE theo từng thị trấn |
| S2 | https://raw.githubusercontent.com/pret/pokeemerald/master/data/layouts/layouts.json | Kích thước nội thất RSE (width x height, metatile) và tileset |
| S3 | https://raw.githubusercontent.com/pret/pokefirered/master/data/maps/map_groups.json | Danh sách map FRLG |
| S4 | https://raw.githubusercontent.com/pret/pokefirered/master/data/layouts/layouts.json | Kích thước nội thất FRLG |
| S5 | `https://raw.githubusercontent.com/pret/pokeemerald/master/data/maps/<Map>/map.json` (ví dụ https://raw.githubusercontent.com/pret/pokeemerald/master/data/maps/OldaleTown/map.json) và bản tương ứng của pokefirered | Vị trí cửa (warp), NPC (object_events) |
| S6 | `https://bulbapedia.bulbagarden.net/wiki/<Tên_trang>` (từng trang được dẫn tên ở bảng dưới) | Mô tả chức năng |

**Cách đo kích thước ngoại thất [đo].** Với mỗi toà nhà, lấy toạ độ cửa từ `warp_events` của map thị trấn (S5). Sau đó đọc `map.bin` của thị trấn (đường dẫn `blockdata_filepath` trong layouts.json). Mỗi ô là 16 bit: 10 bit thấp là metatile id, bit 10-11 là collision. Tôi in lưới id quanh cửa rồi đếm khối chữ nhật các id liền nhau, thường có cột id tăng 8 một hàng (cách tileset xếp ô). Quy ước đếm: hàng trên cùng của mái thường **không có collision** (phần mái chìa ra, người chơi đi "sau" được). Tôi **vẫn tính hàng đó** vào chiều cao, giống cách đếm 4x4 của Pokémon Center đã biết. Kết quả cho Pokémon Center Oldale trùng 4x4 nên phương pháp khớp với số bạn đã có.

Hạn chế: toà nhà chạm mép trên bản đồ có thể bị cắt, nên ghi "≥". Toà nhà có cánh hai bên và ô trang trí liền kề thì tách biên khó hơn, ghi [ước].

## 1. Bảng tổng hợp loại công trình

Cột "số thị trấn" đếm theo các map nội thất có trong S1/S3. "Shell" = vỏ dùng lại được (generic) hay "Điểm nhấn" = một lần duy nhất (landmark).

### 1.1. Lõi dịch vụ (shell dùng lại)

| Loại | Chức năng game | RSE (nơi xuất hiện) | FRLG (nơi xuất hiện) | Độ phổ biến | Dạng |
|---|---|---|---|---|---|
| Pokémon Center (1F + 2F) | Hồi máu miễn phí, PC. Tầng 2 có Union Room và Trade Center/Cable Club qua warp. Dẫn chứng: https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Center và warp 2F `(5,1)>UNION_ROOM (9,1)>TRADE_CENTER` ở [S5 OldaleTown_PokemonCenter_2F](https://raw.githubusercontent.com/pret/pokeemerald/master/data/maps/OldaleTown_PokemonCenter_2F/map.json) | 16 map: Oldale, Petalburg, Rustboro, Dewford, Slateport, Mauville, Verdanturf, Fallarbor, Lavaridge, Fortree, Lilycove, Mossdeep, Sootopolis, Pacifidlog, Ever Grande, Battle Frontier [S1] | 19 map: Viridian, Pewter, Cerulean, Lavender, Vermilion, Celadon, Fuchsia, Cinnabar, Saffron, Indigo Plateau, Route 4, Route 10, và 7 đảo Sevii (One đến Seven) [S3] | Rất cao (gần mọi thị trấn) | **Shell lõi** |
| Poké Mart | Cửa hàng vật phẩm cơ bản, mua/bán lại nửa giá (https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9_Mart). Nhân viên đứng sau quầy phía trên | 12 map: Oldale, Petalburg, Rustboro, Slateport, Mauville, Verdanturf, Fallarbor, Lavaridge, Fortree, Mossdeep, Sootopolis, Battle Frontier [S1]. Lilycove có map `UnusedMart` (không dùng) và thay bằng Department Store. Dewford và Pacifidlog không có Mart | 12 map: Viridian, Pewter, Cerulean, Lavender, Vermilion, Fuchsia, Cinnabar, Saffron, Three/Four/Six/Seven Island [S3]. Celadon dùng Department Store | Rất cao | **Shell lõi** |
| Nhà dân (House) | Nơi NPC, quà, hội thoại, đôi khi là sự kiện (Move Deleter, Name Rater dùng chung layout nhà) | Mỗi thị trấn 1 đến 7 nhà (Pacifidlog 5, Sootopolis 7, Rustboro nhiều nhất do có Flat và House) [S1] | Tương tự, kể cả nhà ở route (Route 2, 12, 16, 25) [S3] | Rất cao | **Shell lõi**, nhiều biến thể |
| Nhà người chơi / đối thủ | Nhà xuất phát, 2 tầng, phòng ngủ có PC/giường | Littleroot: Brendan 1F+2F, May 1F+2F [S1] | Pallet: Player 1F+2F, Rival [S3] | 1 thị trấn đầu | Điểm nhấn, nhưng dùng như shell nhà |
| Phòng thí nghiệm giáo sư | Nhận Pokémon khởi đầu, Pokédex | Birch's Lab, Littleroot [S1] | Oak's Lab, Pallet [S3] | 1 | Điểm nhấn |
| Gatehouse / lối vào route | Cổng nối thị trấn với route (không có chức năng khác) | Cycling Road gate: `Route110_SeasideCyclingRoadNorthEntrance` / `SouthEntrance` [S1]. Ít gatehouse | Rất nhiều: Route 5/6/7/8 entrance của Saffron, Route 11, 12, 15, 16, 18, 22 [S3] | RSE thấp, FRLG cao | **Shell dùng lại** (đặc biệt FRLG) |

### 1.2. Dịch vụ mở rộng (mid)

| Loại | Chức năng game | RSE | FRLG | Độ phổ biến | Dạng |
|---|---|---|---|---|---|
| Department Store (nhiều tầng) | Mua sắm theo tầng, thang máy, sân thượng có máy bán nước. Lilycove cao 5 tầng + Rooftop (https://bulbapedia.bulbagarden.net/wiki/Lilycove_Department_Store). Celadon cao 6 tầng kể cả mái (https://bulbapedia.bulbagarden.net/wiki/Celadon_Department_Store) | Lilycove: `DepartmentStore_1F` đến `5F` + `Rooftop` + `Elevator` [S1] | Celadon: `1F` đến `5F` + `Roof` + `Elevator` [S3] | 1 mỗi vùng | Điểm nhấn |
| Pokémon Contest Hall | Thi Contest 5 hạng (Cool, Beauty, Cute, Smart, Tough). https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Contest | Lilycove: `ContestLobby` + `ContestHall` [S1]. Sân đấu dùng chung `ContestHall*` trong nhóm Dynamic [S1] | Không có | 1 (+ liên kết qua Cable Club) | Điểm nhấn |
| Game Corner | Chơi slot/đổi Xu lấy phần thưởng. https://bulbapedia.bulbagarden.net/wiki/Game_Corner | Mauville (https://bulbapedia.bulbagarden.net/wiki/Mauville_Game_Corner), Mossdeep (`GameCorner_1F` + `B1F`; chức năng cụ thể chưa xác minh) [S1] | Celadon (`GameCorner` + `PrizeRoom`, có lối vào Rocket Hideout), Two Island `JoyfulGameCorner` [S3] | 2 | Điểm nhấn nhưng tái dùng được |
| Day Care | Gửi Pokémon nuôi, ấp trứng. https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Day_Care | Route 117 `Route117_PokemonDayCare` [S1] | Route 5, Four Island [S3] | 1 đến 2 | **Shell dùng lại** (dựa chung kiểu nhà) |
| Museum | Tham quan, vé vào cửa. Oceanic: https://bulbapedia.bulbagarden.net/wiki/Oceanic_Museum. Pewter: https://bulbapedia.bulbagarden.net/wiki/Pewter_Museum_of_Science | Oceanic (Slateport, 1F+2F), Lilycove Museum (1F+2F) [S1] | Pewter (1F+2F) [S3] | 1 đến 2 mỗi vùng | Điểm nhấn |
| Trainer's School | Trường dạy huấn luyện viên (chỉ cốt truyện/hội thoại) | Rustboro `PokemonSchool` [S1] | Viridian `School` [S3] | 1 mỗi vùng | Shell tái dùng được |
| Weather Institute | Nghiên cứu thời tiết, trận với Team Aqua/Magma | Route 119, 1F+2F. https://bulbapedia.bulbagarden.net/wiki/Weather_Institute | Không | 1 | Điểm nhấn |
| Bike Shop | Nhận xe đạp | Mauville `BikeShop` [S1] | Cerulean `BikeShop` [S3] (Bulbapedia: https://bulbapedia.bulbagarden.net/wiki/Bike_Shop) | 1 mỗi vùng | Shell tái dùng được |
| Fan Club | Gặp chủ tịch, NPC, quà | Slateport `PokemonFanClub`, Lilycove `PokemonTrainerFanClub` [S1] | Vermilion `PokemonFanClub`, Saffron `PokemonTrainerFanClub` [S3] (https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Fan_Club) | 2 mỗi vùng | Shell tái dùng được |
| Flower Shop (Pretty Petal) | Mua cây trang trí Secret Base, quà Berry | Route 104 (https://bulbapedia.bulbagarden.net/wiki/Pretty_Petal_Flower_Shop) | Không | 1 | Điểm nhấn |
| Name Rater / Move Deleter / Move Relearner | NPC dịch vụ đặt trong **nhà thường**: Name Rater (Slateport, `LAYOUT_HOUSE_WITH_BED`), Move Deleter (Lilycove, `LAYOUT_HOUSE2`), Move Relearner (Fallarbor, `LAYOUT_HOUSE2`). https://bulbapedia.bulbagarden.net/wiki/Name_Rater và https://bulbapedia.bulbagarden.net/wiki/Move_Deleter | Có [S5] | FRLG: có Name Rater và các tutor, vị trí chưa xác minh | Rải rác | Không cần shell riêng, dùng vỏ nhà |
| Battle Tent | Thi đấu liên tiếp theo luật | Fallarbor, Verdanturf, Slateport (Lobby + Corridor + BattleRoom) [S1] | Không | 3 | Shell tái dùng được |
| Safari Zone entrance | Mua vé, vào khu bắt Pokémon (https://bulbapedia.bulbagarden.net/wiki/Safari_Zone) | Route 121 (`Route121_SafariZoneEntrance`) [S1] | Fuchsia: `SafariZone_Entrance` + `Office`, `WardensHouse` [S3] | 1 | Điểm nhấn |
| Cable Club / Union Room / Trade Center | Đa người chơi, nằm ở tầng 2 của Center qua warp | Dynamic group (`UnionRoom`, `TradeCenter`, `BattleColosseum_2P/4P`) [S1] | Link group [S3] | Mọi Center | Không vẽ ngoại thất |
| Harbor / bến cảng | Nối tàu: Slateport Harbor, Lilycove Harbor; SS Tidal (Dynamic) [S1] | Có | Mỗi đảo Sevii có `Harbor`; SS Anne ở Vermilion [S3] | RSE 2, FRLG 8 | Shell tái dùng được (FRLG: `LAYOUT_ISLAND_HARBOR` dùng chung) |
| Nhà nghỉ / khách sạn / nhà hàng | Chỉ NPC | Cove Lily Motel (Lilycove, 1F+2F) [S1] (https://bulbapedia.bulbagarden.net/wiki/Cove_Lily_Motel) | Celadon: `Hotel`, `Restaurant`, `Condominiums` 1F-3F + Roof [S3] | 1 đến 3 | Điểm nhấn / shell nhà lớn |

### 1.3. Điểm nhấn / cơ sở lớn

| Loại | Chức năng | RSE | FRLG |
|---|---|---|---|
| Devon Corporation | Trụ sở công ty, giao Devon Parts, cốt truyện (https://bulbapedia.bulbagarden.net/wiki/Devon_Corporation) | Rustboro, 3 tầng [S1] | Không |
| Silph Co. | Trụ sở công ty, cốt truyện Team Rocket (https://bulbapedia.bulbagarden.net/wiki/Silph_Co.) | Không | Saffron, 11 tầng + thang máy [S3] |
| Space Center | Trung tâm phóng tên lửa, cốt truyện Team Magma (https://bulbapedia.bulbagarden.net/wiki/Space_Center) | Mossdeep, 2 tầng [S1] | Không |
| Shipyard (Stern) | Xưởng tàu, gắn Oceanic Museum | Slateport `SternsShipyard` 1F+2F [S1] | Không |
| Cable Car Station | Cáp treo lên Mt. Chimney | `Route112_CableCarStation`, `MtChimney_CableCarStation` [S1] | Không |
| Trick House | Mê cung câu đố (https://bulbapedia.bulbagarden.net/wiki/Trick_House) | Route 110, 1 tiền sảnh + 8 phòng puzzle [S1] | Không |
| Battle Frontier | Công viên thi đấu: Tower, Dome, Palace, Pyramid, Arena, Factory, Pike; có Center, Mart riêng (https://bulbapedia.bulbagarden.net/wiki/Battle_Frontier) | Chỉ Emerald, nhóm SpecialArea [S1] | Không (có Trainer Tower ở Seven Island [S3]) |
| Pokémon Tower | Nghĩa địa Pokémon 7 tầng (https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Tower) | Không | Lavender, `PokemonTower_1F`-`7F` [S3] |
| Pokémon Mansion / Power Plant / Cinnabar Lab | Dungeon/cơ sở nghiên cứu | Không | Mansion 1F-3F + B1F; `PowerPlant`; Cinnabar `PokemonLab_*` [S3] |
| Fighting Dojo | Đấu võ, tặng Pokémon | Không | Saffron `Dojo` (layout 13x16, tileset PewterGym) [S3, S4] |
| Lighthouse | Không tìm thấy map nào tên Lighthouse trong cả S1 và S3, nên Gen 3 **không có** loại này (kết luận từ danh sách map, chưa xác minh bằng Bulbapedia) | - | - |

## 2. Kích thước ngoại thất (metatile)

Giá trị đã biết: Gym RSE 6x5, Pokémon Center RSE 4x4 (do bạn cung cấp). Mọi giá trị dưới đây [đo] lấy từ `map.bin` + warp (S5) trừ khi ghi khác.

| Toà nhà | Cửa tại (thị trấn) | Kích thước đo | Ghi chú |
|---|---|---|---|
| Pokémon Center RSE | (6,16) Oldale | **4x4** [đo] | Khớp giá trị đã biết. Ô id 048-049/282-283 ở hàng đầu là mái chìa |
| Poké Mart RSE | (14,6) Oldale | **4x4** [đo] | Cùng khung 4x4 với Center, id mái 028-029 |
| Nhà thường RSE | (5,7) Oldale | **4x4** [đo] | Id 26c-28f, 3 hàng collision + 1 hàng mái |
| Pokémon Center FRLG | (26,26) Viridian | **5x5** [đo] | Rộng hơn Center RSE 1 cột (có cột hông 187/18f/197/19f) |
| Poké Mart FRLG | (36,19) Viridian | **4x4** [đo] | |
| Nhà thường FRLG | (25,11) Viridian | **6x5** [đo] | Rộng hơn nhà RSE |
| Nhà người chơi FRLG | (6,7) Pallet | **5x5** [đo] | |
| Birch's Lab | (7,16) Littleroot | **7x5** [đo] | Rộng hơn nhà thường |
| Oak's Lab | (16,13) Pallet | **7x5** [đo] | Cùng khung Birch |
| Day Care RSE | (51,5) Route 117 | **4x4** [đo] | Nhỏ như nhà thường |
| Day Care FRLG | (23,25) Route 5 | **5x5** [đo] | |
| Game Corner Mauville | (8,13) Mauville | **7x4** [đo] | Thấp và rộng |
| Game Corner Celadon | (34,21) Celadon | **~10x5** [đo, bị cắt khung cột phải, nên ≥10] | |
| Contest Hall (Lobby) | (23,24) Lilycove | **7x7** [đo] | 1 hàng mái + 6 hàng collision, cửa giữa |
| Lilycove Department Store | (27,6) Lilycove | **9x≥7** [đo; chạm mép trên map] | Hàng 2 ô một tầng, lặp ô cửa sổ |
| Celadon Department Store | (11,14) Celadon | **9x10** [đo] | Cao hơn Lilycove |
| Trainer's School Rustboro | (27,34) Rustboro | **7x5** [đo] | |
| Devon Corp | (11,15) Rustboro | **10x9** [đo] | Lớn nhất trong các khối đã đo ở RSE |
| Weather Institute | (6,32) Route 119 | **~11x8** [ước] | Có cánh trái, biên không rõ |
| Space Center | (64,15) Mossdeep | **9x8** [đo] | |
| Safari Zone entrance RSE | (37,5) Route 121 | **5x≥6** [đo; chạm mép trên] | |
| Safari Zone entrance FRLG | (24,5) Fuchsia | **6x≥6** [đo; chạm mép trên] | |
| Pokémon Fan Club (Slateport) | (4,26) Slateport | **5x5** [đo] | |
| Trick House | (11,66) Route 110 | **5x6** [đo] | Mái dốc cao |
| Cycling Road gate (South) | (16,88) Route 110 | **~6x5** [ước] | Hai cửa x=16 và x=19, đường chạy qua giữa |
| Oceanic Museum | (30,26) Slateport | **~11x6 + tháp** [ước] | Lưới lẫn ô trang trí, chưa xác minh biên chính xác |
| Pewter Museum | (17,6) Pewter | **≥11x6** [đo; chạm mép trên] | |
| Fighting Dojo | (40,12) Saffron | **6x5** [đo] | Cùng khung Gym RSE |
| Pokémon Tower | (18,6) Lavender | **7x≥7** [đo; chạm mép trên] | |
| Silph Co. | (33,30) Saffron | **≥9x13 lõi, ~17 rộng cả cánh** [đo, chưa trọn] | Rất cao, đỉnh bị cắt khung quét |
| Pokémon Mansion | (8,3) Cinnabar | chưa xác minh | Cửa nằm trong mảng đất bị che |
| Route 16 gate | (20,6)/(27,6) | chưa xác minh | 4 cửa, nội thất L-shape 13x18 |
| Gym RSE | - | 6x5 | Giá trị bạn cung cấp |

Điểm đáng chú ý: Center/Mart/Nhà/Day Care RSE cùng khung **4x4**. Đây là shell nhỏ nhất. FRLG nới thêm (Center 5x5, nhà 5x5-6x5).

## 3. Nội thất (kích thước từ layouts.json, NPC từ map.json)

Kích thước lấy từ S2/S4 (width x height, metatile). Quầy/NPC lấy từ `object_events` ở S5.

### 3.1. Shell lõi

| Công trình | Kích thước | Tầng | Bố cục chính |
|---|---|---|---|
| Pokémon Center RSE | 1F 14x9, 2F 14x10 (`LAYOUT_POKEMON_CENTER_1F/2F`, tileset PokemonCenter) | 2 | Y tá ở (7,2) trên cùng giữa, NPC phụ rải rác; cửa (7,8),(6,8); cầu thang (1,6). 2F: 3 máy Cable Club NPC ở y=2, warp Union Room (5,1), Trade Center (9,1) [S5 OldaleTown_PokemonCenter_1F/2F] |
| Pokémon Center FRLG | 1F 15x10, 2F 15x10 | 2 | Y tá ở (7,2). Warp 3 ô đáy (6..8,8) [S4, S5 ViridianCity_PokemonCenter_1F] |
| Poké Mart RSE | 11x8 (`LAYOUT_MART`) | 1 | Nhân viên ở (1,3), 2 NPC khách; cửa (3,7),(4,7) [S2, S5 OldaleTown_Mart] |
| Poké Mart FRLG | 11x9 | 1 | Nhân viên ở (2,3); 3 ô cửa [S4, S5 ViridianCity_Mart] |
| Nhà thường | RSE `HOUSE1` 10x9, `HOUSE2` 11x8, `HOUSE3` 10x8; FRLG 11x9 | 1 | 2 ô cửa liền kề đáy [S2, S4] |
| Nhà người chơi | RSE Brendan 1F 11x9, 2F 9x8; FRLG 1F 13x10, 2F 12x9 | 2 | Cầu thang cạnh trên (1F có 2 cửa) [S2, S4] |
| Birch's Lab / Oak's Lab | 13x13 / 13x14 | 1 | Birch ở (6,4), nhà khoa học (9,8); 3 ball chọn Pokémon (6,8) [S2, S4, S5 LittlerootTown_ProfessorBirchsLab] |

### 3.2. Mid

| Công trình | Kích thước | Tầng | Ghi chú |
|---|---|---|---|
| Department Store Lilycove | 18x8 mỗi tầng (1F-5F), Rooftop 18x12, Elevator 5x6 | 5 + mái | Hai lễ tân ở (8,2),(10,2); thang máy ở (2,1); thang bộ ở (16,1)/(13,1) luân phiên mỗi tầng [S2, S5 LilycoveCity_DepartmentStore_1F] |
| Department Store Celadon | 1F 13x16, 5F 13x15, Roof 19x14, Elevator 5x7 | 5 + mái | [S4] |
| Contest | Lobby 31x12; Hall (Lilycove) 51x33; sân dùng chung `ContestHall` 15x11 | 2 lớp | Lobby có nhiều NPC (khoảng 25 object) [S2, S5 LilycoveCity_ContestLobby] |
| Game Corner Mauville | 22x11 | 1 | Dãy máy slot dạng 'sign' tại cột x=2,3,7,8,14,15,18,19; 3 NPC Beauty ở hàng trên (11,2), (13,2), (14,2) [S2, S5 MauvilleCity_GameCorner] |
| Game Corner Celadon | 18x15 + Prize Room 9x10 | 1 + lối ẩn | Cửa bí mật (15,2) dẫn Rocket Hideout B1F [S4] |
| Day Care | RSE 12x9; FRLG 12x9 | 1 | Chỉ 1 NPC bà lão ở (2,2) trong RSE [S2, S5 Route117_PokemonDayCare] |
| Museum | Oceanic 1F 20x9, 2F 20x9; Lilycove 1F 21x14; Pewter 1F 28x11, 2F 19x10 | 2 | Pewter 1F có 5 ô cửa đáy [S2, S4] |
| Trainer's School | Rustboro 12x11; Viridian 10x9 | 1 | [S2, S4] |
| Weather Institute | 1F 20x13, 2F 20x11 (tileset Lab) | 2 | [S2] |
| Bike Shop | RSE 12x9; FRLG 11x10 | 1 | [S2, S4] |
| Fan Club | Slateport 14x11; Vermilion 12x12; Saffron Trainer Fan Club 11x17 | 1 | Tileset FanClubDaycare dùng chung Day Care ở FRLG [S2, S4] |
| Flower Shop (Pretty Petal) | 15x9 | 1 | [S2] |
| Battle Tent Lobby | 13x10 | 1 | + Corridor + BattleRoom [S2] |

### 3.3. Điểm nhấn

| Công trình | Kích thước | Tầng |
|---|---|---|
| Devon Corp | 19x9 mỗi tầng | 3 [S2] |
| Space Center | 16x10 mỗi tầng | 2 [S2] |
| Stern's Shipyard | 1F 21x15, 2F 17x15 | 2 [S2] |
| Safari entrance RSE | 18x14 | 1 [S2] |
| Safari entrance FRLG + Office | 9x9 + 20x11 | 1 [S4] |
| Cycling Road gate (RSE) | 15x6 | 1 [S2] |
| Harbor Slateport | 24x15 | 1 [S2] |
| Island Harbor FRLG (One, Seven, ...) | 17x13 | 1 [S4] |
| Cable Car Station | 13x12 | 1 [S2] |
| Trick House Entrance | 12x8 + 8 puzzle map | n [S2] |
| Fighting Dojo | 13x16 | 1 [S4] |
| Celadon Hotel / Restaurant / Condo | 17x11 / 15x11 / 15x20 (1F) | 1-3 + Roof [S4] |
| Indigo Plateau Center | 25x18 (lớn hơn Center thường) | 1F+2F [S4] |
| Route 16 gatehouse | 1F 13x18, 2F 13x11 | 2 [S4] |

## 4. Diện mạo Gen 3 (nhận dạng bằng mắt)

Nguồn pret chỉ cho id metatile chứ không cho màu, nên phần màu dưới đây là **mô tả trực quan, chưa xác minh bằng văn bản**. Hãy đối chiếu với `docs/explanation/research/gen3-visual-style.md` của repo.

- **Pokémon Center**: mái đỏ cam, biểu tượng Poké Ball trên mặt tiền, cửa tự động trượt. Tileset riêng `PokemonCenter` cho nội thất (S2).
- **Poké Mart**: mái xanh dương, bảng hiệu 'MART'.
- **Nhà thường**: mái màu theo thị trấn (đỏ, xanh, lục) trên cùng khung 4x4. Tileset ngoại thất lấy từ tileset của thị trấn (Building/GenericBuilding ở nội thất).
- **Department Store**: toà nhà cao hơn nhiều so với nhà thường, cửa sổ lặp từng tầng (Lilycove 9 rộng, hàng 2 ô một tầng, quan sát từ lưới id), bảng hiệu lớn, mái phẳng có sân thượng (Rooftop map).
- **Contest Hall**: toà nhà rộng 7x7 với cửa giữa, hai cột ô hông, lối vào đối xứng. Cửa trượt (theo bạn đã biết).
- **Phòng thí nghiệm / Weather Institute / Devon / Space Center**: khối công nghiệp, mặt tiền phẳng, mái bằng, tileset nội thất `Lab`/`Facility`. Space Center có tháp tên lửa/điểm nhấn phía trên (id 3a0-3bd trải 9x8).
- **Gym** khác: bạn đã biết 6x5, không bàn ở đây.

## 5. Gợi ý catalog cho Mons

Quy ước lớp: theo lớp canvas của repo (S = 6x6, M = 8x8, L = 10x10, XL = 12x12). **Giả định của tôi** (repo chưa xác nhận): giữ ít nhất 1 ô lề ngang mỗi bên, nên lớp S chứa thân ≤4x4, M ≤6x6, L ≤8x8, XL ≤10x10. Với cách đó Center 4x4 vào S, Gym 6x5 vào M. Toà nhà rộng hơn 10 cần canvas ngoại lệ hoặc ghép hai sprite.

### Nhóm 1. Lõi (làm trước)

| Ưu tiên | Công trình | Thân (metatile) | Lớp |
|---|---|---|---|
| 1 | Pokémon Center | 4x4 (RSE) hoặc 5x5 (FRLG) | S nếu 4x4, M nếu 5x5 |
| 2 | Poké Mart | 4x4 | S |
| 3 | Nhà dân, 3-4 biến thể màu mái | 4x4 (RSE) hoặc 6x5 (FRLG) | S / M |
| 4 | Nhà người chơi / đối thủ | 5x5 | M |
| 5 | Phòng thí nghiệm giáo sư | 7x5 | L |
| 6 | Gatehouse / Cycling gate | ~6x5 [ước] | M |

### Nhóm 2. Tầm trung

| Ưu tiên | Công trình | Thân | Lớp |
|---|---|---|---|
| 7 | Day Care | 4x4 / 5x5 | S / M |
| 8 | Trainer's School | 7x5 | L |
| 9 | Game Corner | 7x4 (Mauville) | L |
| 10 | Contest Hall | 7x7 | L |
| 11 | Department Store | 9x7 đến 9x10 | XL |
| 12 | Museum | ≥11x6 | XL (cần canvas rộng hơn lớp 10) |
| 13 | Fan Club, Bike Shop, Flower Shop, Name Rater | 5x5 | M (dùng lại vỏ nhà) |
| 14 | Harbor | chưa đo ngoại thất | - |

### Nhóm 3. Điểm nhấn (làm sau)

Weather Institute (~11x8, XL+), Devon Corporation (10x9, XL), Space Center (9x8, XL), Silph Co. (≥9x13, vượt XL, tách làm hai sprite), Pokémon Tower (7x≥7, cao), Safari entrance (5-6 rộng), Trick House (5x6), Fighting Dojo (6x5, M, cùng khung Gym), Shipyard, Cable Car Station, Battle Frontier (nhiều toà).

### Gợi ý thiết kế khác

- **Center và Mart cùng khung 4x4**: dựng một kit thân 4x4 với biến thể mái và biển hiệu. Đây là cách rẻ nhất để có hai công trình phổ biến nhất.
- **Nhà ở RSE (4x4)** có thể đóng vai Day Care, Name Rater, Move Deleter vì chúng dùng chung layout nhà ở nội thất (S5). Chỉ cần đổi bảng hiệu.
- **Department Store** tái dùng được một lớp tầng (1F-5F cùng 18x8) nên chỉ cần vẽ ngoại thất một lần, chi phí nội thất thấp.
- Nội thất tầng 2 Center luôn có warp Union Room và Trade Center. Nếu Mons không có link đa người chơi, 2F có thể bỏ.

## 6. Điều chưa xác minh

- Màu mái cụ thể mọi toà nhà (mục 4): chưa có nguồn văn bản.
- Chức năng tầng B1F của Mossdeep Game Corner.
- Biên chính xác của Oceanic Museum, Weather Institute, Silph Co., Pokémon Mansion, Route 16 gate.
- Vị trí Name Rater, Move Deleter/Tutor trong FRLG.
- Sàn Union Room/Colosseum có warp riêng ở 2F Center hay không: chỉ thấy `UNION_ROOM` và `TRADE_CENTER` trong warp 2F của Oldale [S5].
- Các chiều cao ghi "≥" bị chặn bởi mép trên bản đồ nên chưa biết đỉnh thật.
