# Màn hình trận đấu Gen 3 (RSE + FRLG): nền, bố cục và đề xuất Battle Scene cho Mons

Mục đích: đo cách Gen 3 dựng nền trận đấu để thiết kế **Battle Scene** của Mons ([GLOSSARY.md](../../../GLOSSARY.md), [ADR 0001](../../adr/0001-gen3-battle-screen.md)): khung 240x160, nền, mặt đất, bệ đối thủ, bệ người chơi, và chừa dải dưới cho khung chữ.

Quy ước độ tin cậy (giữ theo [gen3-visual-style.md](./gen3-visual-style.md) và [gen3-map-composition.md](./gen3-map-composition.md)):
- **[PRET]**: đọc thẳng từ mã nguồn hoặc dữ liệu pret.
- **[ĐO]**: tôi tự render `tiles.png` + `map.bin` + `.pal` của pret thành PNG rồi đếm pixel hoặc màu. Đây là số liệu cứng nhưng đã qua xử lý của tôi.
- **[SUY RA]**: suy luận từ số liệu cứng, không có dòng nguồn nào nói thẳng.
- **chưa xác minh**: chưa kiểm chứng được trong lần nghiên cứu này.

Ngày truy cập: 2026-11-18. Nguồn: `raw.githubusercontent.com/pret/pokeemerald/master` (EM) và `.../pret/pokefirered/master` (FR), cùng GitHub API để liệt kê thư mục.
- **Đổi tên trong pret**: bản master của pokeemerald đã đổi "terrain" thành "environment". Tên cũ `sBattleTerrainTable`, `BattleSetup_GetTerrainId`, `graphics/battle_terrain/` nay là `sBattleEnvironmentTable`, `BattleSetup_GetEnvironmentId`, `graphics/battle_environment/`. pokefirered vẫn giữ tên "terrain".
- **Không truy cập**: Bulbapedia (403 ở các lần trước, lần này không thử). Không chạy emulator. Mọi thời lượng đều tính từ mã, không quan sát trên máy thật.
- **Ảnh Nintendo**: các PNG render chỉ nằm trong scratchpad, **không chép vào repo**. Script dựng lại: `render.py`, `render_fr.py`, `measure.py`, `compose.py` trong `/tmp/claude-1000/-home-hoanggv-orca-Mons/e665f361-2b2f-4d8b-a6ae-f05f831bfedc/scratchpad/battle/scripts/` (thư mục tạm, có thể bị xoá).

---

## 1. Hệ thống nền trận đấu Gen 3

### 1.1. Bốn lớp BG và vai trò

Nguồn [PRET]: `gBattleBgTemplates`, `DrawMainBattleBackground`, `DrawBattleEntryBackground` trong [EM battle_bg.c](https://raw.githubusercontent.com/pret/pokeemerald/master/src/battle_bg.c). FR làm giống hệt, xem [FR battle_bg.c](https://raw.githubusercontent.com/pret/pokefirered/master/src/battle_bg.c).

| BG | charBase / mapBase | Kích thước tilemap | Ưu tiên | Chứa gì |
|---|---|---|---|---|
| BG0 | 0 / 24 | 256x512 | 0 (trên cùng) | Khung chữ và mọi menu (`gBattleTextboxTilemap`). Palette 0-1 |
| BG1 | 1 / 28 | 256x512 | 0 | **Entry**: dải tiền cảnh (cỏ, sóng, cát...) chạy qua màn hình lúc mở trận. Sau intro, lớp này bị xoá và dùng cho hiệu ứng chiêu |
| BG2 | 1 / 30 | 512x256 | 1 | Giống BG1: dùng khi intro và khi diễn hiệu ứng chiêu |
| BG3 | 2 / 26 | 512x256 | 3 (dưới cùng) | **Nền trận đấu**: phông, "mặt đất" và cả hai bệ, vẽ chung trong **một** tilemap |

- Pokémon, huấn luyện viên, hộp HP và bóng đều là sprite (OBJ). [PRET]
- Mỗi scene nạp **3 palette BG liên tiếp** vào slot 2, 3, 4: `LoadCompressedPalette(..., BG_PLTT_ID(2), 3 * PLTT_SIZE_4BPP)`. [PRET]
- [ĐO] Trong tilemap của BG3, palette 2 dùng cho phông và bệ đối thủ, palette 3 dùng cho bệ người chơi (một số nền như sand, building, sky, stadium thì cả hai bệ cùng palette 2). Palette 4 thuộc lớp entry.
- Ngân sách màu của cả scene là **3 x 15 = 45 màu**. [SUY RA]

### 1.2. Bảng môi trường và kích thước file

`sBattleEnvironmentTable` (EM) có 10 mục, mỗi mục gồm 5 con trỏ: `tileset, tilemap, entryTileset, entryTilemap, palette`. [PRET]

| File (EM, mỗi môi trường) | Kích thước | Ý nghĩa |
|---|---|---|
| `tiles.png` | 128x128 = 256 ô 8x8 | ô của BG3 |
| `map.bin` | 4096 B = 64x32 ô = **512x256 px** | tilemap BG3: hai screenblock 32x32 nằm cạnh nhau |
| `anim_tiles.png` | 128x128 | ô của lớp entry |
| `anim_map.bin` | 2048 B = 32x32 ô = 256x256 | tilemap của entry |
| `palette.pal` | 48 màu (3 x 16) | palette 2-4 |

[ĐO] Mọi `map.bin` của EM dùng đúng **99 ô**: 64 ô cho bệ đối thủ, 32 ô cho bệ người chơi, 3 ô cho phông (một ô thân lặp và hai ô hàng trên cùng). Từ hàng ô 14 trở xuống (y ≥ 112) là ô rỗng, palette 0, vì khung chữ che phần đó. Nửa phải của tilemap (cột 32-63) chỉ có phông trơn; nó tồn tại để phục vụ cú trượt intro (§1.6).

[ĐO] FR có thư mục [`graphics/battle_terrain/`](https://github.com/pret/pokefirered/tree/master/graphics/battle_terrain): `terrain.png` rộng 64 px, cao 80-104 px; `terrain.bin` 4096 B; `anim.bin` 896 B (32x14 ô); `terrain.pal` 48 màu. Mỗi nền FR dùng 75-98 ô. FR dùng lại ô bằng cách lật và lặp, nên tiết kiệm hơn EM.

### 1.3. Chọn môi trường

[PRET] `BattleSetup_GetEnvironmentId` trong [EM battle_setup.c](https://raw.githubusercontent.com/pret/pokeemerald/master/src/battle_setup.c) xét theo thứ tự sau, dựa trên ô người chơi sắp bước tới (`PlayerGetDestCoords`):
1. Behaviour của ô: `MB_TALL_GRASS` → GRASS; `MB_LONG_GRASS` → LONG_GRASS; `MB_SAND` hoặc `MB_DEEP_SAND` → SAND.
2. `map_type`:
   - `UNDERGROUND`: ô `MB_INDOOR_ENCOUNTER` → BUILDING; nước lướt được → POND; còn lại → CAVE.
   - `INDOOR` và `SECRET_BASE` → BUILDING.
   - `UNDERWATER` → UNDERWATER.
   - `OCEAN_ROUTE`: đang ở trên nước → WATER, còn lại → PLAIN.
   - TOWN, CITY, ROUTE: đi tiếp bước 3.
3. Nước sâu hoặc nước biển → WATER; nước lướt được → POND; `MB_MOUNTAIN_TOP` → MOUNTAIN; đang Surf trên cầu → POND hoặc WATER tuỳ loại cầu.
4. Trường hợp đặc biệt của EM: map Route 113 (tro núi lửa) → SAND; thời tiết đã lưu là `WEATHER_SANDSTORM` → SAND.
5. Còn lại → **PLAIN**. Đường đất, thị trấn và bãi cỏ thấp đều rơi vào đây.

[PRET] `DrawMainBattleBackground` ghi đè kết quả trên theo thứ tự ưu tiên:
- Trận link, Battle Frontier, e-Reader → ô Building + palette `battle_frontier`.
- Groudon → ô Cave + `groudon.pal`. Kyogre → ô Water + `kyogre.pal`. Rayquaza → ô và palette `sky`.
- Lớp huấn luyện viên `TRAINER_CLASS_LEADER` → Building + `leader.pal`, ở bất kỳ map nào. `TRAINER_CLASS_CHAMPION` → Stadium + `wallace.pal`.
- Trường `battle_scene` trong `map.json`: `MAP_BATTLE_SCENE_GYM` → Building + `gym.pal` (dùng cho thành viên gym). `MAGMA`, `AQUA`, `SIDNEY`, `PHOEBE`, `GLACIA`, `DRAKE` → Stadium + palette riêng. `FRONTIER` → Building + `battle_frontier`.
- Ví dụ: `RustboroCity_Gym` và `MossdeepCity_Gym` dùng `MAP_BATTLE_SCENE_GYM`; `EverGrandeCity_SidneysRoom` dùng `MAP_BATTLE_SCENE_SIDNEY`; Route 119, Granite Cave và Mt Pyre Summit dùng `NORMAL` ([PRET] `map.json`).
- Map nào dùng `MAGMA` và `AQUA`: chưa xác minh. `MagmaHideout_1F` là `NORMAL`.
- Trận ghi lại (`BATTLE_TYPE_RECORDED`) luôn là BUILDING (`battle_main.c`).

**Kết luận thiết kế** [SUY RA]: Gen 3 chọn nền theo **(ô dưới chân → loại map → đặc biệt)**, rồi để **loại trận** (leader, champion, gym, E4) ghi đè. Không có lớp "khu vực": một ô cỏ ở Hoenn nào cũng ra cùng một nền GRASS. Đây chính là chiều mà Mons muốn thêm (District).

### 1.4. Vị trí trên màn hình (trận đơn)

| Thành phần | Toạ độ (px, khung 240x160) | Nguồn |
|---|---|---|
| Vùng nhìn thấy của nền BG3 | x 0-239, **y 0-111** (14 hàng ô) | [ĐO] map.bin |
| Khung chữ (BG0) | x 0-239, **y 112-159** (hàng ô 14-19, cao 48 px) | [ĐO] `textbox_map.bin` |
| Ô thông điệp `B_WIN_MSG` | EM: ô (2,15), 26x4 → x 16-223, y 120-151. FR: ô (1,15), 28x4 → x 8-231 | [PRET] `sStandardBattleWindowTemplates` |
| Menu hành động, bảng chiêu, PP, hệ | đều ở hàng ô 35 và 55 của BG0. BG0 cuộn dọc để các hàng này hiện ra trong cùng dải y 112-159 | [PRET] toạ độ; việc cuộn là [SUY RA] |
| Pokémon đối thủ (tâm sprite 64x64) | (176, 40) → hộp x 144-207, y 8-71 | [PRET] `sBattlerCoords` trong `battle_anim_mons.c`, EM = FR |
| Pokémon người chơi (tâm 64x64) | (72, 80) → hộp x 40-103, y 48-111 | cùng nguồn |
| Bóng của Pokémon bay (chỉ đối thủ, EM) | sprite 32x8, tâm (176, 69) → x 160-191, y 65-72 | [PRET] `LoadAndCreateEnemyShadowSprites`: Y + 29 |
| Hộp HP đối thủ | phần nhìn thấy x 13-112, y 16-43 (100x28) | [PRET] tâm (44,30) + [ĐO] PNG |
| Hộp HP người chơi (gồm thanh EXP) | phần nhìn thấy x 127-229, y 74-109 (103x36) | [PRET] tâm (158,88) + [ĐO] PNG + [SUY RA] bên dưới |

Ghi chú cách tính:
- **Hộp HP người chơi**: sprite được tạo theo template 64x32 rồi mới đổi sang hình vuông 64x64. `centerToCornerVec` đã tính lúc tạo ([PRET] `CalcCenterToCornerVec` trong `sprite.c`), nên góc trên-trái nằm ở (158-32, 88-16) = (126, 72). Đối chiếu bằng ảnh ghép thử: khớp bố cục Emerald quen thuộc. [SUY RA]
- **Chân Pokémon**:
  - [PRET] `y = baseY + y_offset (- elevation)`. `y_offset` bằng số hàng trống phía trên trong ảnh 64x64. Ví dụ Bulbasaur front y_offset 14, nội dung bắt đầu ở hàng 14 [ĐO]. Ảnh được căn giữa theo chiều dọc.
  - Hệ quả [ĐO trên Bulbasaur, Zigzagoon, Charizard]: **đáy front sprite luôn ở y ≈ 71**, **đáy back sprite luôn ở y ≈ 111**, tức sát mép trên khung chữ.
  - Loài bay được nâng lên theo `gEnemyMonElevation` (61 loài trong EM có giá trị khác 0, ví dụ Butterfree 8) và có bóng riêng.
- Trận đôi dùng toạ độ khác (đối thủ (200,40) và (152,32); người chơi (32,80) và (90,88)). Tài liệu này không đi sâu.

### 1.5. Hình dạng bệ (platform)

Đo trên GRASS của EM, mọi nền EM khác cùng khung [ĐO]:

| Bệ | Ô trong tilemap | Elip nhìn thấy | Tâm |
|---|---|---|---|
| Đối thủ | cột 14-29, hàng 6-9 → x 112-239, y 48-79 (128x32, 64 ô) | **128x32** trọn vẹn, tỉ lệ 4:1. Độ rộng theo hàng: 58 (y49), 92, 108, 120, 126, 128 (y64), 124, 116, 104, 82, 40 (y79) | (175.5, 63.5) |
| Người chơi | cột 0-15, hàng 12-13 → x 0-127, y 96-111 (128x16, 32 ô) | chỉ thấy **11 hàng trên** (y 101-111), rộng 40 → 120 | x 63.5 |

- Khớp elip với độ rộng đo được cho thấy bệ người chơi cũng là elip khoảng **128x33, tâm y ≈ 117**, tức nằm dưới mép khung chữ. Chỉ ~1/3 trên của nó hiện ra. [SUY RA]
- **Hai bệ cùng kích thước**: Gen 3 không phóng to bệ gần để tạo phối cảnh. Phối cảnh chỉ đến từ chỗ bệ gần bị cắt và back sprite to hơn (back sprite thường lấp kín 64 px). [SUY RA]
- Tâm bệ và tâm sprite gần trùng nhau:
  - Bệ đối thủ: tâm x 175.5, Pokémon x 176. Chân y ≈ 71, tức **8 px dưới tâm elip** (nửa gần của bệ).
  - Bệ người chơi: tâm x 63.5, Pokémon x 72, lệch 8 px sang phải.
- FR dùng cùng khung ô, nhưng hình vẽ "nổi khối" hơn:
  - Bệ cỏ có búi cỏ nhô lên một hàng ô phía trên elip (hàng 5, x 144-207, y 40-47).
  - Bệ hang có khối đá.
  - [ĐO] trên `grass`, `cave` và `indoor`.

### 1.6. Intro: bệ trượt vào

[PRET] `CB2_InitBattleInternal` trong `battle_main.c` và `BattleIntroSlide1/2/3` trong [EM battle_intro.c](https://raw.githubusercontent.com/pret/pokeemerald/master/src/battle_intro.c):
- **BG3 bị tách làm đôi theo scanline**: 80 dòng trên bắt đầu với `HOFS = 240`, 80 dòng dưới với `HOFS = -240`. Mỗi frame cả hai tiến về 0 thêm 2 px, tức **120 frame**.
- Trên màn hình, nửa trên (phông + bệ đối thủ) trượt từ **trái sang phải**, nửa dưới (bệ người chơi) trượt từ **phải sang trái**. [SUY RA từ dấu của HOFS]
- **Cửa sổ WIN0** mở từ một dòng ở y 80:
  - Mỗi frame mở thêm 1 px lên và 1 px xuống, cho tới khi mép trên tới y 48 (**32 frame**).
  - Sau đó mở 4 px mỗi frame cho tới hết (~12 frame), chạy song song với cú trượt.
  - Ngoài cửa sổ không vẽ lớp nào (`WINOUT = 0`).
- **Lớp entry (BG1)** cuộn ngang trong lúc intro: 6 px/frame (Slide1: cỏ, hang, núi, ao), 8 px/frame (Slide2: cát, nước; Slide3: building, plain).
  - Slide1: sau 32 frame, dải cỏ chìm xuống 1 px/frame tới 56 px (cỏ dài: 2 px/frame tới 80 px).
  - Slide2: dải tiền cảnh được blend rồi mờ dần (alpha giảm 1 mỗi 4 frame). Nước còn nhấp nhô theo cos.
  - Slide3: blend 8/8, tức bán trong suốt.
- [ĐO] Phần nhìn thấy của dải entry nằm ở y 32-111 (cỏ dài), 65-111 (cỏ, nước), 82-111 (đá) v.v. Tức nó là **tiền cảnh che nửa dưới cảnh lúc mở màn**.
- Tổng thời gian ≈ 1 + 1 + 32 + 120 frame ≈ **154 frame ≈ 2,6 giây**. [SUY RA, chưa đo trên máy]
- Trận link chờ thêm 16 frame.
- FR dùng cùng cơ chế: `BG1_X += 6/8`, chìm tới `0xFFC8` (-56) hoặc `0xFFB0` (-80). [PRET]
- Sprite Pokémon và trainer trượt theo BG3 như thế nào: chưa xác minh (không đọc controller).

---

## 2. Danh mục nền

### 2.1. Emerald: mô tả từ ảnh render [ĐO]

Mọi nền EM có chung một "ngữ pháp":
- **Phông là một mặt phẳng nhạt có sọc ngang chu kỳ 4 px**: 1 dòng sáng xen 3 dòng nền.
- 16 px trên cùng (4 sọc) đậm dần lên phía trên, như một dải trời mỏng.
- Không có đường chân trời rõ, không có cây hay núi.
- Hai bệ là elip phẳng có viền 2-3 px và hoa văn chấm hoặc gạch.
- Mỗi scene dùng **12-15 màu** (vùng y 0-111).

| Môi trường | Khi nào (EM) | Phông (màu chính, độ sáng L) | Bệ | Entry (tiền cảnh lúc intro) |
|---|---|---|---|---|
| GRASS | cỏ cao | xanh lá rất nhạt `#d5f6d5`, L 232 | elip xanh lá `#7bd583` (L 177), viền xanh chanh, chấm cỏ | dải cỏ nhọn thấp |
| LONG_GRASS | cỏ dài | xanh lá đậm hơn `#ace6b4`, L 207 | xanh đậm `#4aac62` (L 134), nhiều vạch cỏ | cỏ cao lá dài (che tới y 32) |
| SAND | cát, Route 113, bão cát | vàng kem `#f6f6c5`, L 240 | vàng ô liu `#d5d55a`, rải hạt | cát gợn sóng và hạt bay |
| WATER | biển, nước sâu, Surf | trắng xanh `#f6f6ff`, L 247 | xanh dương `#5a94de` (L 139), viền xanh nhạt, ánh sóng chữ V | sóng bạc đầu |
| POND | nước lướt được trong đất liền | trắng xanh, L 247 | xanh dương, **viền xanh lá** (bờ cỏ), chấm sáng | gợn sóng thấp (y 88-111) |
| UNDERWATER | lặn | xanh nhạt `#c5deff`, L 218 | tím xanh `#838bc5`, bong bóng | bong bóng |
| MOUNTAIN | đỉnh núi | trắng, L 247 | nâu xám `#bdac8b`, sỏi | các mỏm đá |
| CAVE | hang | **nâu cát `#c5ac73`, L 173** (tối nhất) | vàng đất, viền nâu đậm, sỏi | trụ đá cao |
| BUILDING | trong nhà, hang có ô indoor | trắng `#f6f6f6`, dải trên vàng nhạt | be `#dec5a4` (L 201), chấm | vệt sáng ngang (bán trong suốt) |
| PLAIN | mọi chỗ khác: đường đất, thị trấn | trời xanh mỏng 16 px rồi xanh chanh `#e6ffcd` | xanh lá `#9ce69c`, viền vàng | như BUILDING |

Nền đặc biệt (cùng tileset, đổi palette):

| Nền | Mô tả |
|---|---|
| Gym, Leader | Building, bệ be-nâu, phông trắng, dải trên nâu |
| Frontier / link | Building, bệ xám ô liu |
| Stadium (Magma) | phông tím xám, bệ cam lát ô vuông |
| Stadium (Aqua, Wallace) | xanh dương / ngọc, lát ô |
| Stadium (Sidney...) | be, lát ô |
| Groudon | phông vàng, bệ hang vàng-cam |
| Kyogre | phông vàng, bệ nước |
| Sky (Rayquaza) | phông xanh trời, bệ là mây trắng |

Ghi chú: Emerald **không có** nền "đường đất" riêng. Đất, đường và thị trấn đều ra PLAIN, tức ô Building tô palette xanh. [PRET + ĐO]

### 2.2. FRLG khác gì [PRET + ĐO]

- **20 nền** thay vì 10. FR thêm `LINK, GYM, LEADER, INDOOR_1, INDOOR_2, LORELEI, BRUNO, AGATHA, LANCE, CHAMPION`. Tất cả dùng chung **một tileset `indoor`**, chỉ đổi palette. FR không có Stadium.
- Chọn nền giống EM, khác ở mấy điểm:
  - SAND gồm cả `ShallowFlowingWater`.
  - Không có ngoại lệ Route 113 hay bão cát.
  - Trận Pokédude luôn là GRASS.
  - `battle_scene` của map ánh xạ qua `sMapBattleSceneMapping`.
  - Leader và Champion vẫn ghi đè theo lớp huấn luyện viên.
- Phông FR có **đường chân trời mờ**:
  - y 0-15: 4 sọc đậm dần (giống EM).
  - y 16-30: một dải sáng không sọc, như sương ở chân trời.
  - Từ y ~31: mặt "đất" có sọc.
  - Ví dụ: cỏ có dải trời xanh nhạt `#deeef6`, đất xanh lá `#def6de`; hang có dải tối nhất `#a48b52` ở y 16-31.
  - EM chỉ có điều này ở PLAIN (trời xanh 16 px).
- Bệ FR nổi khối hơn:
  - Cỏ có búi lá nhô qua viền.
  - Hang có tảng đá.
  - Ao có viền cỏ.
  - Bệ trong nhà màu trắng có vạch kẻ.
- Số màu mỗi scene FR cao hơn: **13-23 màu** (EM 12-15).
- Ô thông điệp FR rộng hơn (x 8-231).
- Toạ độ sprite và hộp HP **giống EM** (`sBattlerCoords`, `InitBattlerHealthboxCoords` trùng số).
- Dải entry FR có cùng vùng hàng như EM. Hình vẽ của entry FR chưa xem kỹ.

---

## 3. Quy tắc bố cục rút ra

| Quy tắc | Gen 3 | Nhãn |
|---|---|---|
| Vùng cảnh | 240x112, khung chữ chiếm 30 % dưới (48/160) | [ĐO] |
| Chân trời | EM: không có, hoặc ở y 16 (PLAIN). FR: chuyển ở y ~16-31. **"Trời" ≤ 28 % chiều cao cảnh**, phần còn lại là mặt đất nhìn gần từ trên xuống | [ĐO] |
| Bệ | elip 128x32 (4:1), hai bệ cùng cỡ. Bệ xa: góc phải-trên, trọn vẹn. Bệ gần: góc trái-dưới, bị khung chữ cắt còn ~1/3 | [ĐO] |
| Đường chéo | tâm bệ (64, ~117) → (176, 64): đường chéo từ trái-dưới lên phải-trên. Hộp HP nằm trên đường chéo ngược (trái-trên, phải-dưới) | [ĐO], ý đồ là [SUY RA] |
| Độ sáng | phông rất sáng (L 200-247; hang 160-173). Bệ trung tính (L 130-200). Viền bệ chỉ một bậc sáng hoặc tối. **Không có màu đen trong cảnh**, viền đen là "đặc quyền" của sprite | [ĐO] |
| Tương phản bệ/phông | chênh L ≥ ~30 ở nền ngoài trời (GRASS 232/177, WATER 247/139, BUILDING 246/201). FR trong nhà thì gần bằng nhau (bệ trắng trên nền trắng) | [ĐO] |
| Độ bão hoà | phông gần như không màu. Màu "định danh" của môi trường nằm ở bệ | [ĐO], ý đồ là [SUY RA] |
| Chi tiết | phông chỉ có sọc 4 px (một dạng dither bằng scanline). Toàn bộ chi tiết dồn vào bệ | [ĐO] |
| Màu | 3 palette (45 màu); thực tế EM dùng 12-15, FR 13-23 | [PRET] + [ĐO] |
| Ô | ~99 ô 8x8 cho cả cảnh, lặp tối đa | [ĐO] |

Vì sao Pokémon nổi rõ [SUY RA]: sprite có viền tối, 15 màu bão hoà, đặt trên nền sáng gần trắng. Bệ có độ sáng trung bình làm "bóng đổ" dưới chân. Hộp HP và Pokémon không chồng lên nhau: hộp HP đối thủ nằm trái-trên, Pokémon đối thủ phải-trên.

---

## 4. Đề xuất spec Battle Scene cho Mons

Phần này là **đề xuất** dựa trên §1-3 và quyết định trong ADR 0001, không phải sự thật của Gen 3.

### 4.1. Khung và các lớp

- Khung gốc **240x160**, xuất **x2 = 480x320** bằng nearest neighbour. Mọi toạ độ dưới đây tính ở khung gốc; nhân 2 để ra khung xuất.
- Chỉ vẽ ban ngày.

| Lớp | Hình chữ nhật (x, y, w, h) | Nội dung | Ghi chú |
|---|---|---|---|
| `backdrop` | 0, 0, 240, 112 | trời mỏng + dải cảnh xa của District (núi, rặng cây, mái nhà, tường gym) | đục hoàn toàn. Cảnh xa nằm trong dải y 8-44 |
| `ground` | 0, 24, 240, 88 | mặt đất theo địa hình (cỏ, đất, cát, nước, sàn hang, sàn nhà) | trong suốt phía trên mép chân trời (lượn trong dải y 24-40). Có thể giữ sọc 4 px kiểu Gen 3 |
| `opponent-platform` | 112, 40, 128, 40 | elip **128x32 tâm (176, 64)** (bbox y 48-79), cộng 8 px khoảng trống phía trên cho búi cỏ, đá, mép sàn | giống ô EM, thêm khoảng trống như FR |
| `player-platform` | 0, 96, 128, 32 | elip **128x32 tâm (64, 116)**. Chỉ phần y ≤ 111 hiện ra | vẽ đủ elip để sau này đổi UI vẫn dùng được |
| `props` (chỉ trainer) | xem §4.3 | 2-4 đồ vật District | lớp riêng, bật hoặc tắt |
| (để trống) | 0, 112, 240, 48 | dải khung chữ | scene **không vẽ gì** ở đây |

- Tên file gợi ý: `<scene>-backdrop.png`, `-ground.png`, `-platform-opp.png`, `-platform-player.png`, `-props.png`, cộng một ảnh ghép `<scene>.png` 240x160 (dải dưới trong suốt).
- Mọi lớp đều qua `check_gen3.py` ([structure skill](../../../tools/gen3/check_gen3.py)): BGR555, alpha 0/255, ≤ 15 màu mỗi ô 8x8.

### 4.2. Đặt Pokémon tạm bằng sheet `posses`

- Sheet `posses`: 8 hướng x 5 hàng, ô 192 px, safe box 160, lề đáy ≥ 16 ([sprite skill](../../../.agents/skills/pokemon-sprite-generator/SKILL.md)). Đối thủ dùng cột 1 (down, mặt trước); người chơi dùng cột 5 (up, lưng).
- **Tỉ lệ đề xuất ÷3** (192 → 64), đúng bằng ô 64x64 của Gen 3. Safe box còn ~53 px, lề đáy ~5 px.
  - Ở khung xuất x2, ô thành 128 px, tức tỉ lệ 2/3 so với 192. Tỉ lệ này không nguyên, nên phải scale bằng bộ lọc rồi lượng tử hoá lại, hoặc dùng sheet 128 (Small Mode, safe box 104). [SUY RA]
- **Neo theo chân** thay vì theo tâm, vì sheet posses không có bảng `y_offset`:
  - Đối thủ: chân ở **(176, 71)**, ô 64x64 khoảng x 144-207, y 12-75.
  - Người chơi: chân ở **(72, 111)**, ô x 40-103, y 52-115. Phần dưới 111 bị khung chữ che, giống back sprite Gen 3.
- Pokémon bay (sheet có Fly): nâng 8-16 px và thêm bóng 32x8 ở (176, 69), như `gEnemyMonElevation`.
- Hàng Attack, Hit, Faint của posses dùng được ngay cho hiệu ứng (giật, nháy, ngã) mà không cần khung riêng.

### 4.3. Vùng an toàn

| Vùng | Hình chữ nhật | Luật |
|---|---|---|
| Ô Pokémon đối thủ | x 144-207, y 8-75 | phông và đất phía sau phải **trơn, sáng**. Không đặt prop. Tương phản thấp |
| Ô Pokémon người chơi | x 40-103, y 48-111 | như trên |
| Hộp HP đối thủ (sau này) | x 13-112, y 16-43 (đề xuất chừa x 8-116, y 12-47) | được phép có cảnh xa nhưng chênh độ sáng ≤ 2 bậc |
| Hộp HP người chơi (sau này) | x 127-229, y 74-109 (đề xuất chừa x 122-234, y 70-111) | không đặt prop. Mép phải của bệ đối thủ (y ≤ 79) có thể nằm dưới hộp |
| Khung chữ, menu | y 112-159 | không vẽ cảnh |
| **Ô đặt prop** (trainer) | A: x 0-36, y 40-95 (trái-giữa, chỗ Gen 3 bỏ trống). B: x 208-239, y 8-44 (phải-trên, cạnh đối thủ). C: dải chân trời y 8-40, ngoài vùng hộp HP | prop cao ≤ 32 px. Tối đa 1-2 cái mỗi ô. Không đè lên bệ |

### 4.4. Ngân sách màu

Theo Gen 3 (3 palette ở slot 2-4), dùng tối đa **3 palette x 15 màu = 45 màu** mỗi scene:
- **P1**: trời, cảnh xa, đất. Dùng ramp District (cùng `MONS_PALETTE=gym` như overworld).
- **P2**: hai bệ, dùng chung vì cùng địa hình.
- **P3**: prop District (trainer), hoa văn gym, hoặc lớp tiền cảnh intro nếu sau này làm.

Giá trị độ sáng:
- Phông và trời L ≥ 190 (hang và phòng gym tối được phép xuống ~150).
- Mặt đất thấp hơn phông 10-30 L.
- Bệ L 120-200 và thấp hơn mặt đất ≥ 30 L.
- Không dùng màu tối hơn L ~60 trong cảnh. Màu tối nhất để dành cho viền sprite.
- Màu đậm (bão hoà cao) chỉ đặt trên bệ và prop. Phông gần trung tính.

### 4.5. Wild, trainer, gym khác nhau thế nào

| | Wild | Trainer | Gym |
|---|---|---|---|
| Ý nghĩa | thiên nhiên thuần, chưa ai đặt chân | bãi đấu đã dùng | sàn đấu trong gym |
| Phông | cảnh xa District, không có đồ nhân tạo | cùng cảnh xa, thêm 2-4 prop District (đèn, rào, biển, cờ) ở ô A/B/C | tường nội thất gym (dải trên 24-40 px) với motif hệ, lấy từ `assets/structures/Battle/gym-<type>/*-interior-*.png` |
| Mặt đất | địa hình tự nhiên (cỏ dày, cát gợn, nước) | địa hình bị giẫm: lối mòn, cỏ thưa, dấu chân | sàn gạch hoặc sàn hệ của gym (ô 16 px của nội thất) |
| Bệ đối thủ / người chơi | gò tự nhiên: búi cỏ, gò đất, bãi cát, vòng sóng, tảng đá phẳng (kiểu FR) | vòng tròn mờ vạch trên đất giẫm; bệ lát đá, sàn gỗ, bè gỗ trên nước | đĩa đấu có viền theo màu hệ, kiểu Stadium lát ô của EM. Biến thể **leader** đổi palette viền (EM có `gym.pal` và `leader.pal`) |
| Màu | ramp District thuần | ramp District + màu gỗ, đá nhân tạo (P3) | ramp của chính gym đó |

### 4.6. Bảng scene (District x địa hình x loại)

Ký hiệu:
- **W** = wild, **T** = trainer.
- ● = tồn tại theo luật **và** địa hình này đã xuất hiện trên map hiện có của theme đó.
- ○ = tồn tại theo luật nhưng chưa thấy trên map (làm sau).
- — = không có (trong nhà không có wild).
- Cột "đã thấy" là [ĐO thô]: tôi grep chuỗi `water`, `sand`, `cave`, `grass` trong `assets/maps/*/*.map.json` và nhóm theo `theme`. Không có map nào chứa `cave`. Coi như mọi map đều có đường đất.

| District (theme) | Cỏ cao | Đất / đường | Cát | Mặt nước (Surf) | Hang | Trong nhà |
|---|---|---|---|---|---|---|
| start (meadow) | W● T● | W● T● | W● T● | W● T● | W○ T○ | T● |
| garden (grass) | W● T● | W● T● | W○ T○ | W○ T○ | W○ T○ | T● |
| powerplant (electric) | W● T● | W● T● | W○ T○ | W● T● | W○ T○ | T● |
| mystic (psychic) | W● T● | W● T● | W○ T○ | W● T● | W○ T○ | T● |
| lagoon (water) | W● T● | W● T● | W● T● | W● T● | W○ T○ | T● |
| volcano (fire) | W● T● | W● T● | W○ T○ | W● T● | W○ T○ | T● |
| quarry (rock) | W● T● | W● T● | W○ T○ | W○ T○ | W○ T○ | T● |
| canyon (ground) | W● T● | W● T● | W● T● | W● T● | W○ T○ | T● |
| marsh (poison) | W● T● | W● T● | W● T● | W● T● | W○ T○ | T● |

- Tổng cộng: 9 x (5 x 2 + 1) = **99 scene** + **8 gym** = **107**. Trong đó ● = 67 (kể cả 9 scene trong nhà) + 8 gym; ○ = 32.
- Các theme `coast` (route-7, 10, 16) và `woods` (route-3) không phải District, nên chưa có dòng riêng. Xem câu hỏi mở.

**Ghép từ các lớp dùng chung** (mỗi scene = backdrop + ground + 2 bệ [+ prop]):

| Lớp dùng chung | Số bản vẽ (hình) | Biến thể màu | Dùng cho |
|---|---|---|---|
| `backdrop/<district>-outdoor` | 9 | — | cỏ, đất, cát, nước của District đó |
| `backdrop/<district>-cave` | 1 hình (vách đá) | 9 ramp | hang |
| `backdrop/<district>-indoor` | 1-2 hình (tường + cửa sổ) | 9 ramp | trong nhà |
| `ground/<terrain>` | 6 (grass, dirt, sand, water, cave, indoor) | 9 ramp | mọi scene |
| `platform/wild-<terrain>` | 5 hình x {opp, player} | 9 ramp | wild |
| `platform/trainer-<terrain>` | 6 hình x {opp, player} | 9 ramp | trainer |
| `props/<district>` | 9 bộ (2-4 prop) | — | trainer |
| `gym/<type>` | 8 bộ riêng (backdrop + floor + 2 bệ, có biến thể leader) | — | gym |

- Tức là khoảng **9 phông ngoài trời + 3 hình phông chung + 6 mặt đất + 22 bệ + 9 bộ prop + 8 gym** là đủ để sinh 107 scene bằng code.
- Phần riêng theo District chủ yếu là phông ngoài trời và prop. Phần còn lại là đổi ramp.

---

## 5. Câu hỏi mở cho người dùng

1. **Chân trời**: Gen 3 gần như không có trời (EM ≤ 16 px, FR ~30 px). Mons muốn cảnh xa của District. Đặt chân trời ở y 24-40 (đề xuất) có đủ không, hay muốn nhiều trời hơn (y 48+, lệch khỏi Gen 3 và đẩy cảnh ra sau hộp HP)?
2. **Sọc scanline 4 px** (dấu hiệu nhận diện của cả RSE và FRLG): giữ trên phông và đất, chỉ giữ trên trời, hay bỏ?
3. **Bệ người chơi**: giữ kiểu Gen 3 (tâm y ≈ 116, chỉ thấy 1/3 trên), hay nâng lên để thấy chân của sheet posses (sheet posses vẽ cả thân)?
4. **Tỉ lệ Pokémon**: cả hai cùng ÷3 (64 px, như Gen 3), hay người chơi to hơn (ví dụ ÷2.4 ≈ 80 px) để giả phối cảnh? Loài to và nhỏ có chia hạng kích thước không?
5. **Lớp tiền cảnh intro** (dải cỏ, sóng, cát quét ngang rồi chìm): có làm không? Nếu làm thì tốn palette P3, cạnh tranh với prop.
6. **Cỏ dài và núi**: Gen 3 có LONG_GRASS và MOUNTAIN. Mons có cần biến thể "cỏ rậm" (marsh, garden) hay "đá trên núi" (quarry, canyon) không, hay gộp vào cỏ cao và hang?
7. **Gym**: một scene cho cả gym, hay tách thành viên gym và leader (EM tách bằng `gym.pal` và `leader.pal`)? Gym nhiều tầng: một scene cho mọi tầng, hay mỗi tầng một scene?
8. **Theme `coast` và `woods`** thuộc District nào? Hay thêm dòng riêng cho chúng?
9. **Hang theo District**: làm đủ 9 bộ (đều ○ vì chưa có map hang), hay chỉ District nào có hang?
10. **Trong nhà có wild không** (EM có `MB_INDOOR_ENCOUNTER`, ví dụ nhà máy bỏ hoang)? Đề xuất hiện tại: không.
11. **Trận đôi**: có dự kiến không? Toạ độ Gen 3 khác hẳn (§1.4), bệ có lẽ phải rộng hơn.
12. **Đặc biệt**: huyền thoại, đối thủ (rival) hay boss có scene riêng như Groudon, Kyogre, Rayquaza, Stadium không?

---

## Phụ lục: chưa xác minh và giới hạn

- Thời lượng intro (~154 frame) tính từ mã. Chưa quan sát trên máy thật hay emulator. Chưa đọc cách sprite trượt cùng bệ.
- Vị trí hộp HP người chơi dựa vào suy luận `centerToCornerVec` (§1.4), đã khớp bằng ảnh ghép thử nhưng chưa so với ảnh chụp game.
- Cách BG0 cuộn để hiện menu ở hàng ô 35 và 55: chỉ suy ra.
- Hình vẽ lớp entry của FR: chỉ đo vùng hàng, chưa xem kỹ. Map nào dùng `MAP_BATTLE_SCENE_MAGMA` và `AQUA`: chưa xác minh.
- Elip bệ người chơi (128x33, tâm y ≈ 117) là kết quả khớp đường cong, không phải số trong nguồn.
- Bảng ●/○ ở §4.6 dựa trên grep chuỗi, có thể sót (ví dụ ao vẽ bằng piece khác tên) hoặc nhầm.
- Không dùng Bulbapedia hay The Spriters Resource. Không chép đồ hoạ Nintendo vào repo.
