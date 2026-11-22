# Hang động nhiều tầng Gen 3: số đo từ pret và cách áp dụng cho Mons

Mục đích: trả lời "người ta thiết kế bản đồ dưới lòng đất nhiều tầng như thế nào" bằng số đo trên dữ liệu gốc của Gen 3 (Emerald, FireRed/LeafGreen), rồi rút ra luật cho Mons và ba phương án mock. Tài liệu bổ sung cho [gen3-map-composition.md](./gen3-map-composition.md) (luật overworld) và [gen3-world-connections.md](./gen3-world-connections.md) (Connection, Warp).

Quy ước độ tin cậy, giống [gen3-map-composition.md](./gen3-map-composition.md):
- **[PRET]**: đọc thẳng từ mã nguồn hoặc dữ liệu pret.
- **[ĐO]**: tôi giải mã `map.bin` theo `metatile_attributes.bin` rồi đếm (phương pháp ở §1).
- **[SUY RA]**: suy luận từ số liệu cứng.
- **[NGOÀI]**: tài liệu thiết kế level không thuộc Pokémon.

Ngày truy cập: 2026-11-19. EM = pret/pokeemerald, FR = pret/pokefirered (nhánh `master`).

---

## 1. Phương pháp

- Danh sách map và kích thước: `data/layouts/layouts.json` ([EM](https://github.com/pret/pokeemerald/blob/master/data/layouts/layouts.json), [FR](https://github.com/pret/pokefirered/blob/master/data/layouts/layouts.json)). Đơn vị là metatile 16×16 px. Màn hình GBA rộng 15 × 10 metatile.
- Warp, object và sự kiện ẩn: `data/maps/<Map>/map.json`, ví dụ [EM GraniteCave_B1F](https://github.com/pret/pokeemerald/blob/master/data/maps/GraniteCave_B1F/map.json) và [FR MtMoon_B1F](https://github.com/pret/pokefirered/blob/master/data/maps/MtMoon_B1F/map.json).
- Hành vi ô (behaviour): mỗi u16 của `map.bin` gồm id metatile 10 bit và collision 2 bit. Behaviour lấy theo id từ `metatile_attributes.bin` của tileset primary (`general`) hoặc secondary (`cave`, `meteor_falls`, `rock_tunnel`, `seafoam_islands`, `cerulean_cave`…). Cách mã hoá:
  - EM: u16, behaviour 8 bit. Có 512 metatile primary.
  - FR: u32, behaviour 9 bit, encounter type ở bit 24-26. Có 640 metatile primary.
  - Tên behaviour lấy từ `include/constants/metatile_behaviors.h` ([EM](https://github.com/pret/pokeemerald/blob/master/include/constants/metatile_behaviors.h), [FR](https://github.com/pret/pokefirered/blob/master/include/constants/metatile_behaviors.h)).
- **"Khu" (section)**: vùng ô đi được (collision 0), nối theo 4 hướng, có ít nhất một warp và ≥ 6 ô. Số khu > 1 nghĩa là tầng đó bị chia thành các túi chỉ tới được qua tầng khác. [ĐO]
- **Lệch thang**: với mỗi warp giữa hai tầng, lấy hiệu (x, y) giữa warp và warp đích (`dest_warp_id`). [ĐO]
- Script dùng để đo không nằm trong repo; mọi số ở dưới có thể lặp lại bằng cách tải lại các file trên.

## 2. Số đo từng hang

### 2.1. Bảng tổng hợp [ĐO, PRET]

Cột "màn": diện tích chia cho một màn GBA (15 × 10). "Đi": tỉ lệ ô collision 0. "Warp tầng": số warp sang tầng khác của cùng hang. "Khu": số khu có warp. "TR": Trainer. "Đồ": item hiện + item ẩn.

| Map | Kích thước | Màn | Đi | Warp tầng | Khu | TR | Đồ | Đặc biệt |
|---|---|---|---|---|---|---|---|---|
| EM Granite Cave 1F | 42×15 | 4.2 | 33% | 2 thang ▼ + cửa phòng Steven | 2 | 0 | 1 | 7 ô JUMP_EAST |
| EM Granite Cave B1F | 32×26 | 5.5 | 36% | 7 thang | 2 | 0 | 1 | **tối**; 62 ô CRACKED_FLOOR |
| EM Granite Cave B2F | 32×26 | 5.5 | 43% | 5 thang | 4 | 0 | 2+2 | **tối**; 7 đá Rock Smash |
| EM Meteor Falls 1F_1R | 30×42 | 8.4 | 49% | 4 | 3 | 0 | 4 | 175 ô nước, 58 thác, 34 JUMP_SOUTH |
| EM Meteor Falls 1F_2R | 30×32 | 6.4 | 35% | 4 | 3 | 3 | 0 | 54 JUMP_SOUTH |
| EM Meteor Falls B1F_1R / 2R | 29×38 / 11×18 | 7.3 / 1.3 | 43 / 33% | 6 / 1 | 1 / 1 | 0 | 0 / 1 | phòng 2R là túi cụt chứa đồ |
| EM Victory Road 1F | 46×45 | 13.8 | 33% | 3 thang | 2 | 5 | 2+1 | |
| EM Victory Road B1F | 46×31 | 9.5 | 31% | 7 thang | 3 | 5 | 2 | **tối**; 8 tảng đá Strength, 6 đá Rock Smash |
| EM Victory Road B2F | 46×31 | 9.5 | 46% | 4 thang | 1 | 6 | 1+2 | **tối**; 238 ô nước, 18 thác |
| EM Seafloor Cavern (10 phòng) | 11×14 … 27×46 | 1.0-8.3 | 21-69% | 2-4 mỗi phòng | 1-3 | 0-2 | 0-1 | tảng đá: 2, 6, 7, 4 và **12** (Room8); dòng chảy ở Room6-7 |
| EM Sky Pillar 1F-5F | 14×14 mỗi tầng | 1.3 | 45-62% | 2-3 cửa | 1-2 | 0 | 0 | sàn nứt: 38 ô (2F), 34 ô (4F); Top: 80 hố + 42 sàn nứt |
| EM Cave of Origin Entrance / 1F / B1F | 19×26 / 23×23 / 19×19 | 2.4-3.5 | 15-24% | 1-2 | 1 | 0 | 0 | tuyến thẳng, kết thúc ở phòng huyền thoại |
| EM Shoal Cave (5 phòng, triều thấp) | 20×30 … 46×38 | 2.1-11.7 | 18-52% | 1-8 | 1-3 | 0 | 0-2 | 150 ô ICE (Ice Room); hai bộ layout triều cao/thấp |
| EM Mt. Pyre 1F / 2F-6F | 22×19 / 13×13 | 2.8 / 1.1 | 29-56% | 5-6 | 1-2 | 0-5 | 1 mỗi tầng | 1-2 ô MT_PYRE_HOLE mỗi tầng |
| FR Mt. Moon 1F | 48×40 | 12.8 | 60% | 3 thang | 1 | 7 | 6 | |
| FR Mt. Moon B1F | 49×40 | 13.1 | 16% | 8 thang (1 ra Route 4) | **4** | 0 | 0+6 | tầng chỉ gồm túi nối thang |
| FR Mt. Moon B2F | 48×40 | 12.8 | 46% | 4 thang | 2 | 4 | 4+2 | 2 hoá thạch; 66 ô JUMP_SOUTH |
| FR Rock Tunnel 1F / B1F | 48×40 | 12.8 | 56 / 59% | 4 / 4 | 3 / 2 | 7 / 8 | 3 / 2 | **tối** cả hai tầng; 15 đá Rock Smash ở B1F |
| FR Victory Road 1F / 2F / 3F | 48×22 / 51×22 / 45×22 | 6.6-7.5 | 22 / 69 / 59% | 1 / 5 / 4 | 1 / 3 / 1 | 2 / 5 / 6 | 2+2 / 4 / 2 | tảng đá 3 / 3 / 4; công tắc 1 / 2 / 1; hố đá 3F |
| FR Seafoam Islands 1F-B4F | 38×24 mỗi tầng | 6.1 | 47-63% | 4-11 | 1-4 | 0 | 0-2 | 2 hố mỗi tầng; tảng đá 2-6; dòng chảy B3F-B4F |
| FR Cerulean Cave 1F / 2F / B1F | 40×23 mỗi tầng | 6.1 | 59 / 32 / 54% | 7 / 6 / 1 | 2 / **5** / 1 | 0 | 3+1 / 3 / 2 | đá Rock Smash 6 / 10 / 9 |

### 2.2. Các mẫu đo được

1. **Số tầng.** Hầu hết hang có 2-5 tầng: Rock Tunnel 2, Mt. Moon 3, Granite 3 tầng + 1 phòng, Victory Road 3 (cả EM và FR), Seafoam 5. Tháp có nhiều hơn: Sky Pillar 5 tầng + đỉnh, Mt. Pyre 6. Seafloor Cavern không chia theo tầng mà theo **phòng**: 10 phòng nối bằng cửa. [ĐO]
2. **Kích thước tầng.** Có hai cỡ:
   - hang chính tuyến: 30-48 × 22-45 metatile, tức 6-14 màn GBA mỗi tầng;
   - phòng phụ, túi và tháp: 11-23 metatile mỗi chiều, 1-3.5 màn.
   - FRLG chuộng tầng thấp 22-24 hàng (Victory Road, Seafoam, Cerulean Cave), tức khoảng hai màn chiều cao. [ĐO]
3. **Thang mỗi tầng.** Tầng nối có 4-11 thang. Tầng đầu và tầng cuối có 1-4. Mt. Moon B1F có 8 thang trên 4 túi rời nhau. Seafoam B1F và B2F mỗi tầng có 11 warp (7 thang + 4 hố hoặc chỗ đáp). [ĐO]
4. **Tầng "túi" (connector floor).** Mt. Moon B1F chỉ 16% đi được, gồm 4 khu, không có Trainer. Cerulean Cave 2F có 5 khu. Granite B2F có 4 khu, Seafoam B1F có 4 khu. Người chơi phải đi lên đi xuống qua lại để tiến lên: một tầng có thể chạm tới qua 3-4 thang khác nhau, mỗi thang dẫn vào một túi khác. Đây là kỹ thuật chính tạo cảm giác "mê cung" mà không cần tầng to. [ĐO, SUY RA]
5. **Thang có thẳng hàng giữa các tầng không: tuỳ cỡ tầng.**
   - Hai tầng **cùng kích thước** đặt thang gần như đúng chồng lên nhau:
     - Granite B1F↔B2F: cả 5 cặp lệch (0, 0);
     - Seafoam: mọi cặp lệch ≤ 5, phần lớn ≤ 1;
     - FR Victory Road 2F↔3F: lệch ≤ 3;
     - EM Victory Road B1F↔B2F: lệch 0-4.
   - Hai tầng **khác cỡ hoặc khác bố cục** thì không thẳng hàng: Mt. Moon lệch tới 34 ô, Rock Tunnel tới 43 ô, Meteor Falls tới 19 ô.
   - Tổng: EM có 40 trên 130 liên kết giữa các tầng trùng đúng (x, y); FR có 46 trên 88 liên kết lệch ≤ 2. [ĐO]
6. **Hố luôn rơi đúng (x, y).** Lệnh `warphole MAP_UNDEFINED` lấy toạ độ người chơi rồi gọi `SetWarpDestinationToFixedHoleWarp(x, y)`: người chơi rơi xuống tầng dưới **ở cùng ô**. Nguồn: [PRET] `ScrCmd_warphole` trong [EM scrcmd.c](https://github.com/pret/pokeemerald/blob/master/src/scrcmd.c) và `SetFixedHoleWarp` trong [EM overworld.c](https://github.com/pret/pokeemerald/blob/master/src/overworld.c). Granite B1F đặt `setholewarp MAP_GRANITE_CAVE_B2F` ([scripts.inc](https://github.com/pret/pokeemerald/blob/master/data/maps/GraniteCave_B1F/scripts.inc)). Hệ quả: dưới mỗi ô sàn nứt hay hố phải có sàn, nên hai tầng đó phải cùng cỡ. Seafoam dùng FALL_WARP với chỗ đáp ở cùng toạ độ ±1 [ĐO].
7. **Lối vào và lối ra.**
   - Hang xuyên (Mt. Moon, Rock Tunnel, Victory Road, Meteor Falls, Rusturf) có lối vào và lối ra ở hai đầu xa nhau. Lối ra thường ở **tầng khác**: Mt. Moon ra Route 4 bằng thang ở B1F, Rock Tunnel ra bằng thang ở 1F (17, 2), FR Victory Road ra ở 2F.
   - Hang cụt (Granite, Cerulean Cave, Seafloor, Cave of Origin, Sky Pillar) kết thúc ở một phòng cốt truyện hoặc huyền thoại.
   - Cửa ra overworld là SOUTH_ARROW_WARP ở mép dưới. [ĐO]
8. **Vòng lặp và một chiều.**
   - Gờ nhảy dùng nhiều trong hang: Mt. Moon B2F 66 ô JUMP_SOUTH, Meteor Falls 34-54, Granite 1F 7 ô JUMP_EAST.
   - Một vòng thường là "xuống bằng thang, nhảy gờ, quay về chỗ cũ": vòng một chiều, đường về ngắn hơn đường đi (cùng luật với Route, xem [gen3-map-composition.md](./gen3-map-composition.md)).
   - Victory Road và Seafoam tạo vòng bằng **hai cặp thang** nối cùng hai tầng. [ĐO, SUY RA]
9. **Phần thưởng ở ngõ cụt.**
   - Túi chỉ có đồ: Meteor Falls B1F_2R (11×18, 1 item), Mt. Moon B1F (6 item ẩn trên tầng túi), Mt. Pyre (mỗi tầng đúng 1 item).
   - Mỗi tầng hang có 0-6 item hiện và 0-6 item ẩn. [ĐO]
10. **Trainer.**
    - Hang giữa game có 0-8 Trainer mỗi tầng: Mt. Moon 7 + 0 + 4, Rock Tunnel 7 + 8.
    - Hang cuối game có 5-6 mỗi tầng: EM Victory Road 5 / 5 / 6, FR 2 / 5 / 6.
    - Hang cốt truyện (Granite, Seafloor, Cave of Origin, Seafoam) có 0-2. [ĐO]

### 2.3. Gặp Pokémon trong hang [PRET]

- **Mọi ô sàn hang đều gặp Pokémon.** Trong `sTileBitAttributes`, `MB_CAVE` có cờ `TILE_FLAG_HAS_ENCOUNTERS`, giống `MB_TALL_GRASS`. Nguồn: [EM metatile_behavior.c](https://github.com/pret/pokeemerald/blob/master/src/metatile_behavior.c). Ô thang (`MB_LADDER`) và hố (`MB_CRACKED_FLOOR_HOLE`) thì không.
- **Tỉ lệ thấp hơn cỏ khoảng một nửa** ([EM wild_encounters.json](https://github.com/pret/pokeemerald/blob/master/src/data/wild_encounters.json), [FR wild_encounters.json](https://github.com/pret/pokefirered/blob/master/src/data/wild_encounters.json)):
  - EM: hang 10 (Granite, Meteor Falls, Victory Road, Shoal, Sky Pillar), riêng Seafloor Cavern và Cave of Origin là 4. Route 101 là 20, Route 119 là 15.
  - FR: hang 7 (Mt. Moon B1F là 5), Route 1/3/4 là 21.
  - Đá Rock Smash có bảng riêng: EM 20; FR 50 (Rock Tunnel B1F, Cerulean Cave).
- **Số bước trung bình giữa hai trận** (`WildEncounterCheck`, rate × 16 trên 2880, cộng 4 bước miễn trừ sau mỗi trận, decisions.md §15):
  - EM hang: 2880 / 160 + 4 ≈ **22 bước**;
  - FR hang: 2880 / 112 + 4 ≈ **30 bước**;
  - cỏ rate 20: ≈ 13 bước.
  - Hang thưa trận hơn cỏ trên mỗi ô, nhưng không có chỗ nào "an toàn" để đi vòng.

### 2.4. Bóng tối và Flash [PRET]

- Map có cờ `requires_flash` (header `cave`): EM Granite B1F và B2F, Victory Road B1F và B2F; FR Rock Tunnel 1F và B1F. Tầng tối luôn là tầng sâu: tầng 1F gần cửa hang (Granite 1F, EM Victory Road 1F) vẫn sáng. [ĐO]
- Bán kính vùng sáng: `sFlashLevelToRadius = {200, 72, 64, 56, 48, 40, 32, 24, 0}` px ([field_screen_effect.c](https://github.com/pret/pokeemerald/blob/master/src/field_screen_effect.c)). `SetDefaultFlashLevel` chọn mức 7 (**24 px**, 1.5 metatile) khi chưa dùng Flash và mức 1 (**72 px**, 4.5 metatile) khi đã dùng ([overworld.c](https://github.com/pret/pokeemerald/blob/master/src/overworld.c)). So với màn 240 px, vùng sáng chiếm 10% chiều ngang khi chưa có Flash và 30% khi có Flash.

### 2.5. Câu đố [PRET]

- **Sàn nứt** (Granite B1F, Sky Pillar 2F/4F/Top), theo `CrackedFloorPerStepCallback` trong [field_tasks.c](https://github.com/pret/pokeemerald/blob/master/src/field_tasks.c):
  - đi qua với tốc độ khác `PLAYER_SPEED_FASTEST` (tức không cưỡi Mach Bike) thì rơi;
  - ô đã đi qua thành hố sau 3 nhịp;
  - kịch bản rơi ở [cave_hole.inc](https://github.com/pret/pokeemerald/blob/master/data/scripts/cave_hole.inc).
  - Ở Granite, rơi không phải là thua: tầng B2F bên dưới có đồ và Rock Smash, rồi có thang quay lên. [ĐO]
- **Tảng đá Strength.**
  - EM Victory Road B1F có 8 tảng, Seafloor Room8 có 12 tảng trên 11×14 ô: phòng xếp đá thuần tuý.
  - FR Victory Road: đẩy đá lên công tắc (`MB_STRENGTH_BUTTON`). Script đổi metatile `RockBarrier` thành sàn rồi lưu vị trí đá (`copyobjectxytoperm`) ([VictoryRoad_1F/scripts.inc](https://github.com/pret/pokefirered/blob/master/data/maps/VictoryRoad_1F/scripts.inc)).
  - FR Victory Road 3F: đẩy đá xuống hố (FALL_WARP), đá rơi xuống tầng dưới.
  - Seafoam: đẩy đủ hai tảng xuống B3F thì dòng chảy dừng, map đổi sang layout `CURRENT_STOPPED` ([SeafoamIslands_B3F/scripts.inc](https://github.com/pret/pokefirered/blob/master/data/maps/SeafoamIslands_B3F/scripts.inc)).
- **Rock Smash.** Đá chắn nhánh phụ có phần thưởng: Granite B2F 7, Rock Tunnel B1F 15, Cerulean Cave 6-10 mỗi tầng. Đập đá có thể ra Pokémon (bảng `rock_smash_mons`). [ĐO]
- **Băng.** Shoal Cave Ice Room có 150 ô ICE (trượt tới khi gặp vật cản). [ĐO]
- **Thuỷ triều.** `UpdateShoalTideFlag` theo giờ RTC ([time_events.c](https://github.com/pret/pokeemerald/blob/master/src/time_events.c)):
  - triều cao 00-02, 09-14 và 21-23 giờ; còn lại là triều thấp;
  - chỉ cập nhật khi người chơi bước vào từ ngoài trời;
  - map chọn layout `HIGH_TIDE` hoặc `LOW_TIDE` bằng `setmaplayoutindex` ([ShoalCave_LowTideEntranceRoom/scripts.inc](https://github.com/pret/pokeemerald/blob/master/data/maps/ShoalCave_LowTideEntranceRoom/scripts.inc)).
  - Cùng một hình phòng, hai trạng thái nước. Kỹ thuật "đổi layout theo cờ" này cũng dùng ở Seafoam.

## 3. Nguồn ngoài Pokémon [NGOÀI]

- **Justin Alexander, "Jaquaying the Dungeon" / "Xandering the Dungeon" (The Alexandrian, 2010).**
  - Dungeon tuyến tính bỏ mất sự khám phá. Dungeon nhiều lối vào, nhiều đường và có lối bí mật cho người chơi tự chọn đường. Ví dụ: Caverns of Thracia có ba lối vào tầng 1 ([bài 1](https://thealexandrian.net/wordpress/13085/roleplaying-games/jaquaying-the-dungeon)).
  - Mỗi kết nối thêm giữa hai tầng tạo thêm một vòng lặp. Kết nối "nhảy tầng" (từ tầng 1 xuống thẳng tầng 3) tạo điểm quyết định. Nếu chỉ có một lối xuống tầng sau thì cả tầng hiện tại co lại thành một nút cổ chai ([bài 2: kỹ thuật](https://thealexandrian.net/wordpress/13103/roleplaying-games/xandering-the-dungeon-part-2-xandering-techniques), [phụ lục: kết nối giữa các tầng](https://thealexandrian.net/wordpress/13141/roleplaying-games/xandering-the-dungeon-addendum-dungeon-level-connections); hai link này tóm tắt từ kết quả tìm kiếm, chưa đọc toàn văn).
- **Dan Taylor, "Ten Principles of Good Level Design (Part 1)" (Game Developer, 2013)** ([link](https://www.gamedeveloper.com/design/ten-principles-of-good-level-design-part-1-)):
  - level tốt phải dễ chịu khi định hướng, nói cho người chơi phải làm gì nhưng không nói cách làm, liên tục dạy một điều mới, và có bất ngờ;
  - cảm giác lạc chỉ nên là chủ ý ("to create a sense of dramatic tension");
  - phần thưởng của mỗi mục tiêu nên giúp cho mục tiêu sau (dẫn lời Mark Cerny).

Đối chiếu với Gen 3 [SUY RA]:
- Mt. Moon B1F và Seafoam chính là "nhiều kết nối giữa hai tầng" của Alexander.
- Sàn nứt Granite là "dạy điều mới": rơi một lần là hiểu luật, và rơi vẫn có thưởng.
- Victory Road FR là "nói phải làm gì, không nói cách làm": thấy công tắc và tảng đá, tự tìm thứ tự đẩy.

## 4. Áp dụng cho Mons

### 4.1. Tỉ lệ

- Mons ×2 mỗi chiều so với Gen 3 ([SKILL map](../../../.agents/skills/pokemon-map-generator/SKILL.md), `mapgen.MAP_SCALE`). Camera là 40 × 22.5 ô (decisions.md §10).
- Một tầng Gen 3 rộng 48×40 thành 96×80 ô, tức 8.7 màn Mons, trong khi Gen 3 là 12.8 màn: màn Mons chứa nhiều hơn.
- Khuyến nghị:
  - **tầng chính 64-96 × 44-56 ô** (2.9-5.2 màn), thấp hơn ×2 thuần tuý để mỗi hang chơi xong trong 15-20 phút;
  - **túi và phòng cuối 30-40 × 22-30 ô** (≈ 1-1.4 màn);
  - FRLG dùng tầng 22-24 hàng: ×2 = 44-48 ô, vừa hai màn Mons theo chiều cao.
- Giữ nguyên số Gen 3 (luật cơ chế, không phóng): tầm nhìn Trainer ≤ 7 × 5, tường ≥ 2 ô, gờ nhảy 1 ô, một ô cho một thang.
- Lối đi trong hang rộng 3-4 ô (Gen 3: 1-3).
- Bóng tối: giữ **tỉ lệ so với màn hình** thay vì số px. Chưa có Flash: bán kính 4 ô (64 px trên 640 px, bằng 10% của Gen 3). Có Flash: bán kính 12 ô (30%).

### 4.2. Luật thiết kế (rút từ §2-§3)

1. 3-4 tầng cho một hang chính. Một tầng dưới cùng nhỏ chứa phần thưởng hoặc cốt truyện cho hang cụt.
2. Tầng nối thang có **2-4 túi rời** (16-30% đi được). Ít nhất một túi chỉ chứa đồ hoặc NPC.
3. Tầng cùng cỡ thì đặt thang **trùng (x, y)**. Hố và sàn nứt **bắt buộc** trùng (x, y), nên tầng có hố phải cùng cỡ với tầng dưới và dưới mỗi ô nứt phải có sàn. `cave_mock.py` kiểm tra luật này.
4. Có ít nhất **một vòng**: hai cặp thang nối cùng hai tầng, hoặc thang xuống rồi gờ nhảy quay về.
5. Mỗi ngõ cụt có phần thưởng. HM (Surf, Rock Smash) chỉ chặn **nhánh phụ**; Strength có thể chặn đường chính ở hang cuối game.
6. Tầng gần cửa hang sáng, tầng sâu mới tối. Không để hai câu đố khó trên cùng một tầng tối.
7. Trainer: hang giữa game 3-5 mỗi tầng, hang cuối game 5-6, hang cốt truyện 0-2. Trainer chắn đường đứng ở hành lang hẹp.
8. Gặp Pokémon trên mọi ô sàn, rate 10 (khoảng 22 bước một trận). Chừng 15-20 trận hoang dã cho một hang là trần thoải mái.

### 4.3. Engine và game đang hỗ trợ gì

- **Tầng nhiều lớp đã có, nhưng chỉ cho nội thất.**
  - `game/tools/build_assets.py` (`export_interior` / `export_floor`) đọc `assets/structures/<Dir>/<slug>/<slug>-interior.json`, trong đó có `floors[]` (grid ký tự) và `links[] {type: "stairs" | "hole", a: [floor, x, y], b: [...]}`.
  - Cầu thang là hai chiều. **Hố là một chiều.**
  - `World.ts` đọc `meta.stairs[] {x, y, to, tx, ty, kind}`. Khi tới nơi: cầu thang đặt người chơi ở `ty + 1`, hố đặt đúng `ty`.
  - Gym đá đã dùng 2 hố 1F→B1F và 2 cầu thang (`gym-rock-interior.json`). Hang có thể đi đường này ngay.
- **Chưa có `kind: cave`.**
  - Map spec (`mapgen.py`) chỉ có `town`, `route` và `city`.
  - `kind: "interior"` cho nền đen (hợp với hang) nhưng tắt Surf (không hợp nếu hang có nước).
  - `build_assets.py` đã sinh bảng `<slug>:cave`, nhưng chưa map nào đánh dấu ô hang (decisions.md §15), nên chưa ô nào gặp Pokémon trong hang.
- **Đã có:** gờ nhảy xuống (`v`), Surf, ô `U` chưa nối ("Tầng trên sẽ mở ở bản sau.").
- **Đề xuất cho engine** (chưa làm):
  1. `kind: cave` cho cả spec map lẫn export: behaviour `CAVE` trên mọi ô sàn, nền đen, cho Surf.
  2. Một spec hang `assets/maps/<slug>/<slug>.cave.json` gồm nhiều tầng, cùng dạng `floors` / `links` với nội thất. Thêm `type: "ladder"`, đặt người chơi lên đúng ô thang như Gen 3.
  3. Luật lint lấy từ §4.2. Phần kiểm tra đã có sẵn trong `cave_mock.py`: thang đủ cặp, hố và sàn nứt có chỗ đáp, đá có đường đẩy, mọi đồ đều tới được, câu đố có chặn lối ra.
  4. Cơ chế game: đẩy đá Strength và công tắc, đập đá Rock Smash, mặt nạ tối Flash, sàn nứt. Mons chưa có xe đạp, nên đề xuất sàn nứt chịu được khi **chạy**.

### 4.4. Piece còn thiếu

| Piece | Có chưa | Ghi chú |
|---|---|---|
| sàn hang (đất, sỏi) + 2-3 biến thể `vary` | thiếu | autotile fill, palette đá ấm |
| vách hang (autotile, mặt nam 2 hàng) | thiếu | `mountain` / `cliff` có mặt đá nhưng là ngoại cảnh, đỉnh có cỏ |
| gờ hang (ledge màu đá) | thiếu | `ledge` hiện là đá đỏ trên cỏ |
| thang lên, thang xuống (lỗ có thang) | thiếu | |
| hố, sàn nứt, sàn nứt đã vỡ | thiếu | 3 trạng thái |
| tảng đá Strength, công tắc, rào đá | thiếu | `rock`, `rock-big`, `ground-boulder` chỉ là Prop trang trí |
| đá Rock Smash | **có** | `smash-rock` |
| cửa hang nhìn từ ngoài | **có** | `cave-mouth` (2×2) |
| bậc đá | **có** (ngoại cảnh) | `stairs`, cần bản màu hang |
| măng đá, tinh thể, vũng nước hang | một phần | `rock-crystal-cluster`, `psychic-crystal` (theo gym) |
| lối ra sáng (vệt sáng ở cửa) | thiếu | |
| mặt nạ tối (Flash) | thiếu | hiệu ứng runtime, không phải tile |

## 5. Ba phương án mock

Vẽ bằng `python3 tools/maps/cave_mock.py`. Dữ liệu nằm ở `tools/maps/cave_variants.py`. Ảnh ghi vào `tmp/cave-mocks/variant-{a,b,c}.png` và `overview.png` (gitignore). Mỗi tầng vẽ:
- vách, sàn, nước, sàn nứt, gờ;
- thang ▲▼ đánh số: cùng số và cùng màu là một cặp;
- hố H và chỗ đáp ⊗ ở tầng dưới;
- tảng đá, công tắc, rào, đá Rock Smash, đồ, Trainer kèm tầm nhìn, NPC, lối vào và lối ra;
- lưới màn 40×22 và đường chính ngắn nhất.

Ước lượng thời gian chơi (trong script):
- số bước đi thật = đường chính × 1.6 (nhánh phụ và quay lại);
- đi bộ 3.75 ô/giây;
- một trận hoang dã mỗi 22 bước, 30 giây mỗi trận;
- 75 giây cho mỗi Trainer.

### 5.1. A · Hang Nguyệt Thạch (kiểu Mt. Moon)

- **Kiểu:** hang xuyên núi nối hai Route, giữa game. 3 tầng 88×52 (5.2 màn mỗi tầng). Thang ở mọi tầng trùng (x, y).
- **Luồng:**
  - 1F: sảnh lớn có vòng (sảnh → phòng bắc → hành lang đông bắc → phòng đông → sảnh).
  - Thang 2 xuống B1F. B1F chỉ có 4 túi (13% đi được).
  - Từ túi đó, thang 5 xuống phòng hoá thạch B2F. Trainer "nhà khoa học" đứng trước 2 hoá thạch, chọn 1.
  - Hành lang đông, thang 6 lên túi lối ra ở B1F, ra Route 7.
- **Vòng phụ:** thang 1 (1F tây bắc) → túi 1 → thang 4 → khu tây B2F (đồ hiếm), rồi **gờ một chiều** nhảy xuống phòng hoá thạch.
- **Phần thưởng:**
  - túi 3 ở B1F chỉ có Hiker cho TM và một item;
  - nhánh đông bắc B2F có 2 item, 1 ẩn.
- **Số liệu:** 9 Trainer, 8 item. Đường chính 156 bước, khoảng 11 trận hoang dã, **khoảng 18 phút**.

### 5.2. B · Động Đá Hoa (kiểu Granite Cave)

- **Kiểu:** hang cụt 4 tầng kết thúc ở phòng cổ.
  - 1F 84×30: dài, sáng nhờ cửa hang. Hiker cho Flash.
  - B1F và B2F 64×52: **tối**, cùng cỡ để thang, hố và sàn nứt thẳng hàng.
  - B3F 40×30: phòng tinh thể có hồ nước.
- **Luồng:**
  - 1F có vòng đông bắc kết thúc bằng gờ một chiều. Thang 1 ở tây bắc.
  - B1F: buồng giữa bị cắt bởi **dải sàn nứt** 12 ô.
  - **Đường tắt mạo hiểm:** chạy qua dải nứt để tới thang 2.
  - **Đường an toàn:** hành lang tối vòng phía nam (dài hơn 36 bước: 262 so với 226, có 2 Trainer).
  - Đi chậm trên sàn nứt là rơi vào **túi kín** ở B2F: có item, item ẩn và thang 3 đưa về mép tây của dải nứt để thử lại. Rơi vẫn có thưởng, như Granite.
  - Ngõ cụt tây nam B1F có **hố H1** rơi xuống túi nhỏ có item, rồi thang 5 quay lên.
  - B2F: hành lang chính tới thang 4 xuống B3F. Nhánh phía nam bị **đá Rock Smash** chặn, có item.
- **Số liệu:** 4 Trainer, 9 item. Đường chính an toàn 262 bước, khoảng 19 trận, **khoảng 16 phút**.
- **Cơ chế mới cần có:** mặt nạ tối, sàn nứt, hố một chiều. Hố một chiều đã có trong engine nội thất.

### 5.3. C · Đường Chiến Thắng (kiểu Victory Road)

- **Kiểu:** hang xuyên 3 tầng 96×44 (4.8 màn mỗi tầng), cuối game. Ba tầng cùng cỡ, mọi thang trùng (x, y).
- **Luồng (chuỗi câu đố Strength):**
  - **1F:** đẩy tảng đá 10 ô lên công tắc S1, rào đá giữa hành lang đông mở ra, tới thang 1.
  - **2F:** một **vòng** quanh khối đá giữa. Gờ ở cạnh tây khiến nửa tây chỉ đi được một chiều (xuống). Từ vòng, có thể thấy công tắc S2 nằm trong hốc kín giữa khối đá: không đi bộ tới được. Đây là gợi ý "phải làm gì" mà không nói "làm thế nào".
  - **3F:** lên bằng thang 2 hoặc thang 3. Hai cặp thang nối 2F và 3F tạo **vòng thứ hai**. Đẩy tảng đá xuống **hố H1**: đá rơi đúng ô S2 ở 2F, mở rào R2 ở góc đông bắc 2F. Xuống thang 3, vòng về phía đông, ra Liên Minh.
  - Người chơi rơi vào H1 thì đáp xuống hốc S2, có thang 4 quay lên 3F.
- **Phần thưởng và cổng:**
  - nhánh hồ 3F có item trên đảo (Surf);
  - nhánh 1F đông bắc có item sau đá Rock Smash.
- **Số liệu:** 10 Trainer, 7 item. Đường chính qua cả hai tảng đá 193 bước, khoảng 14 trận, **khoảng 21 phút**. `cave_mock.py` xác nhận: khi chưa giải câu đố thì không tới được lối ra.
- **Cơ chế mới cần có:** đẩy đá, công tắc và rào, đá rơi qua hố.

### 5.4. So sánh nhanh

| | A Mt. Moon | B Granite | C Victory Road |
|---|---|---|---|
| Vị trí trong game | sớm-giữa | giữa (cốt truyện) | cuối |
| Tầng | 3 (88×52) | 4 (84×30, 64×52 ×2, 40×30) | 3 (96×44) |
| Cái mới | tầng túi, hoá thạch | tối, sàn nứt, hố | Strength, đá rơi qua hố |
| Engine cần thêm | chỉ `kind: cave` + thang | + mặt nạ tối, sàn nứt | + đẩy đá, công tắc, rào |
| Thời gian | ~18 phút | ~16 phút | ~21 phút |

Khuyến nghị [SUY RA]: làm **A trước**. A chỉ cần thang và `kind: cave`, nên dùng ngay được engine tầng của nội thất và dạy người chơi luật "thang cùng số". Sau đó làm B rồi C, mỗi hang thêm một cơ chế, đúng nguyên tắc "liên tục dạy điều mới" (§3).

Sáu hang theo vùng (D-I), mỗi hang một cơ chế riêng (dung nham, xe goòng, băng, thuỷ triều, cần gạt, gờ rễ), nằm ở [cave-regions.md](../cave-regions.md).
