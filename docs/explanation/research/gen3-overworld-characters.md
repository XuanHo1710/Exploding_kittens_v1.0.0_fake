# Nhân vật overworld Gen 3 (RSE + FRLG): Player, NPC, Trainer

Mục đích: ghi lại số liệu cứng về sprite nhân vật đi trên Map (pret gọi là "object event"), cộng với sprite trận đấu của Trainer (front pic) và Player (back pic), để làm khuôn cho bộ asset Character gốc của Mons. Thuật ngữ Character / Player / NPC / Trainer theo `GLOSSARY.md`.

Quy ước độ tin cậy:
- **[PRET]** = đọc trực tiếp từ mã nguồn pret (số liệu cứng).
- **[ĐO]** = tôi tự đo trên PNG gốc của pret (bounding box, số index màu). Mẫu đo ghi rõ bên cạnh.
- **[SUY RA]** = suy ra từ số liệu cứng, không có dòng nào nói thẳng.
- **chưa xác minh** = không kiểm chứng được bằng nguồn tin cậy trong lần này.

Ngày truy cập: 2026-11-18. Nhánh `master` của pret/pokeemerald và pret/pokefirered.

## 0. Nguồn

| Mã | URL | Dùng cho |
|---|---|---|
| E1 | https://raw.githubusercontent.com/pret/pokeemerald/master/src/data/object_events/object_event_graphics_info.h | Kích thước, palette tag/slot, shadow, anim table của 245 struct graphics info |
| E2 | https://raw.githubusercontent.com/pret/pokeemerald/master/src/data/object_events/object_event_pic_tables.h | Thứ tự frame trong mỗi sheet |
| E3 | https://raw.githubusercontent.com/pret/pokeemerald/master/src/data/object_events/object_event_anims.h | Chuỗi animation, số tick mỗi frame, lật ngang |
| E4 | https://raw.githubusercontent.com/pret/pokeemerald/master/src/data/object_events/object_event_graphics.h | Đường dẫn PNG và file palette |
| E5 | https://raw.githubusercontent.com/pret/pokeemerald/master/include/constants/event_objects.h | Danh sách 239 graphics ID |
| E6 | https://raw.githubusercontent.com/pret/pokeemerald/master/src/event_object_movement.c | Tốc độ bước, nạp palette, neo sprite, bóng, movement type |
| E7 | https://raw.githubusercontent.com/pret/pokeemerald/master/include/event_object_movement.h | Enum `PALSLOT_*` |
| E8 | https://raw.githubusercontent.com/pret/pokeemerald/master/src/field_effect_helpers.c và https://raw.githubusercontent.com/pret/pokeemerald/master/src/data/field_effects/field_effect_objects.h | Sprite bóng |
| E9 | https://raw.githubusercontent.com/pret/pokeemerald/master/src/trainer_see.c | Icon "!" / "?" / tim |
| E10 | https://raw.githubusercontent.com/pret/pokeemerald/master/src/field_player_avatar.c và https://raw.githubusercontent.com/pret/pokeemerald/master/src/bike.c | Tốc độ chạy, lướt, xe đạp |
| E11 | https://raw.githubusercontent.com/pret/pokeemerald/master/src/data/graphics/trainers.h, `src/data/trainer_graphics/front_pic_tables.h`, `back_pic_anims.h`, `include/constants/trainers.h` | Front pic / back pic |
| E12 | `https://raw.githubusercontent.com/pret/pokeemerald/master/graphics/object_events/pics/people/<tên>.png` và `graphics/object_events/palettes/npc_1.pal` … `npc_4.pal`, `brendan.pal`, `*_reflection.pal`; `graphics/trainers/front_pics/*.png`, `back_pics/*.png` | PNG và palette để đo |
| F1 | Các file tương ứng trong https://raw.githubusercontent.com/pret/pokefirered/master/ (cùng đường dẫn E1–E7, `include/constants/trainers.h`) | Số liệu FRLG |

Mẫu PNG đã đo [ĐO]: 29 sheet người của Emerald (brendan/* 10 sheet, may/walking, boy_1, youngster, lass, hiker, fat_man, old_man, nurse, little_boy, woman_1, black_belt, beauty, swimmer_m, fisherman, gentleman, psychic_m, bug_catcher, mart_employee, scientist_1), 5 front pic, 6 back pic.

---

## 1. Kích thước khung sprite

Mọi kích thước là kích thước OBJ phần cứng (bội của tile 8x8) [PRET E1].

| Kích thước | Emerald (số graphics info / 245) | FRLG (số / 154) | Dùng cho |
|---|---|---|---|
| **16x16** | 65 | 50 | Trẻ nhỏ (`LittleBoy`, `LittleGirl`, `NinjaBoy`, `TuberF/M`, `TuberMSwimming`, `RubySapphireLittleBoy`), Pokémon nhỏ đi theo (Zigzagoon, Pikachu, Azurill, Wingull, Skitty, Kecleon), item ball, cây Cut, đá Rock Smash, tảng Strength, búp bê, gối, berry tree giai đoạn đầu |
| **16x32** | 119 | 81 | **Gần như mọi người**: Player đi bộ/chạy, mọi NPC và Trainer người lớn hoặc thiếu niên, gym leader, E4, villain, Pokémon dáng đứng (Kirlia, Dusclops, Sudowoodo, Mew) |
| **32x32** | 55 | 20 | Player khi đạp xe (Mach/Acro), lướt (Emerald), câu cá, field move (Emerald), tưới cây, dưới nước; Cycling Triathlete; Biker và Old Man nằm (FRLG); Pokémon to (Latias/Latios, Regi, Kyogre/Groudon, Lugia, Ho-Oh, Deoxys); búp bê to |
| **64x64** | 3 | 1 | Rayquaza (2), Cable Car (Emerald) |
| Khác | 48x48 Truck; 96x40 S.S. Tidal; 88x32 bóng tàu ngầm | 32x16 Town Map; 128x64 S.S. Anne | Vật thể đặc biệt |

**Neo (anchor) [PRET E6].** Khi tạo sprite, game đặt toạ độ tại `(ô_x*16 + 8, ô_y*16 + 16)` (giữa cạnh dưới của ô), rồi đặt `centerToCornerVec = (-w/2, -h/2)` và dịch `y += -h/2`. Kết quả: **khung sprite canh giữa theo chiều ngang và đáy khung trùng đáy ô đang đứng**. Với 16x32, nửa dưới phủ ô của nhân vật, nửa trên phủ ô phía trên (đầu nhô lên ô trên).

**Chân [ĐO, 23 sheet 16x32].** Ở khung đứng yên, pixel thấp nhất nằm ở hàng 30 (hàng 31 trống), tức bàn chân cách đáy khung 1 px. Ở khung bước, toàn thân thấp xuống 1 px (đỉnh đầu từ hàng 10–12 xuống 11–13, chân chạm hàng 31): đây là nhịp "nhún" khi bước, vẽ sẵn trong frame, không do code.

**Chiều cao nhân vật thật trong khung 16x32 [ĐO].** Đỉnh đầu ở hàng 10–12, nên nhân vật cao **19–21 px**; 10–12 hàng trên cùng để trống. Bề ngang dùng 12–16 px (cột 0–15 với người to như Hiker, Fat Man, Beauty; cột 1–14 với dáng gầy).

**Bóng [PRET E6, E8].** `shadowSize` S/M/L/XL tương ứng sprite bóng 8x8 / 16x8 / 32x8 / 64x32. Người đều là `SHADOW_SIZE_M` (16x8); vật nhỏ là S; Quinty Plump là L. Bóng **chỉ hiện khi nhảy** (`DoShadowFieldEffect` chỉ được gọi từ `InitJumpRegular` và `InitAcroWheelieJump`), đặt dưới tâm sprite một đoạn `h/2 − 4` px, tức tâm bóng cao hơn đáy khung 4 px. Khi đứng hay đi, nhân vật **không có bóng đổ riêng**.

**Dấu chân [PRET E1].** Trường `tracks`: người dùng `TRACKS_FOOT`, xe đạp dùng `TRACKS_BIKE_TIRE` (vết trên cát).

---

## 2. Bố cục frame và animation

### 2.1. Sheet người chuẩn (9 frame)

Sheet là một dải ngang các frame 16x32 (PNG 144x32) [PRET E2, ĐO]. Thứ tự [PRET E3, `sAnim_FaceSouth` … `sAnim_GoWest`]:

| Index | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|---|
| Nội dung | đứng, mặt xuống (S) | đứng, quay lưng (N) | đứng, nhìn trái (W) | bước S chân A | bước S chân B | bước N chân A | bước N chân B | bước W chân A | bước W chân B |

- **Hướng phải (E) = lật ngang hướng trái**: mọi anim East dùng frame 2/7/8 với `.hFlip = TRUE` [PRET E3]. Không vẽ riêng hướng phải.
- Chu kỳ đi bộ: `3, 0, 4, 0` (S), `5, 1, 6, 1` (N), `7, 2, 8, 2` (W), mỗi frame 8 tick ở tốc độ thường → 32 tick cho một vòng = **2 bước** [PRET E3].
- Mỗi bước 16 px (một ô) mất **16 frame** ở tốc độ thường (`sStep1Funcs` có 16 lần `Step1`, 1 px/frame) [PRET E6]. Hàm `SetStepAnimHandleAlternation` cho mỗi bước bắt đầu từ chân khác nhau, nên một bước = 1 frame bước (8 tick) + 1 frame đứng (8 tick) [PRET E6, SUY RA].
- Đổi hướng tại chỗ: frame đứng giữ 16 tick [PRET E3].

**Sheet rút gọn 3 frame.** 17 NPC 16x32 của Emerald chỉ có 3 frame đứng (S, N, W); bảng pic lặp lại 0/1/2 thay cho frame bước nên nếu bị cho đi, chúng trượt mà không động chân [PRET E2]: Cook, Old Man, 4 E4 (Sidney, Phoebe, Glacia, Drake), 7 gym leader (Roxanne, Brawly, Wattson, Flannery, Winona, Liza, Tate; Norman, Juan và Wallace có đủ 9), GameBoy Kid, Mystery Event Deliveryman, Union Room Attendant, Sudowoodo. Pokémon 16x16 đi theo (Zigzagoon, Pikachu …) cũng 3 frame.

**Frame thêm.** Nurse có frame thứ 4 = cúi chào (`sAnim_NurseBow`: 0 (8) → 9 (32) → 0 (8)) [PRET E3]. FRLG: **37 NPC có frame thứ 10 = giơ tay** (`ANIM_RAISE_HAND`, frame 9, báo hiệu tái đấu bằng VS Seeker), gồm hầu hết lớp Trainer (Lass, Youngster, Bug Catcher, Camper, Picnicker, Cooltrainer M/F, Black Belt, Hiker, Swimmer, Fisher, Gentleman, Sailor, Beauty, Biker, Rocker, Channeler …) [PRET F1].

### 2.2. Tốc độ di chuyển

| Speed (`MOVE_SPEED_*`) | Px/frame | Frame/ô 16 px | Dùng cho | Tick/frame anim |
|---|---|---|---|---|
| NORMAL | 1 | 16 | Đi bộ (Player, NPC) | 8 (`GoX`) |
| FAST_1 | 2 | 8 | Chạy (B-dash), lướt nước, trượt băng | chạy: 5+3 (`RunX`); khác: 4 (`GoFastX`) |
| FAST_2 | 2,3,3,2,3,3 | 6 | Dòng nước, Acro Bike | |
| FASTER | 4 | 4 | Tốc độ tối đa Mach Bike | 2 (`GoFasterX`) |
| FASTEST | 8 | 2 | Một số chuyển động script | 1 (`GoFastestX`) |

Nguồn: `sStep1Funcs`…`sStep8Funcs`, `sStepTimes` và chú thích enum trong E6; `PlayerWalkFast` khi lướt ("same speed as running") và `PlayerRun` → `StartRunningAnim(... MOVE_SPEED_FAST_1)` trong E10; Mach Bike tăng dần Normal → Fast → Faster (`sMachBikeSpeedCallbacks`, E10). Đổi ra giây: GBA chạy khoảng 59,73 frame/s ([GBATEK](https://problemkaputt.de/gbatek.htm), chưa xác minh lại lần này), nên một bước đi bộ ≈ 0,27 s và một bước chạy ≈ 0,13 s [SUY RA].

### 2.3. Sheet riêng của Player

**Emerald, mỗi giới tính (Brendan / May)** [PRET E1, E2, E3; ĐO kích thước PNG]:

| Sheet | Khung | Frame vẽ | Bố cục / ghi chú |
|---|---|---|---|
| walking | 16x32 | 9 | Như sheet chuẩn |
| running | 16x32 | 9 | Ghép sau walking thành bảng 18 frame; 9–11 đứng-chạy S/N/W, 12–17 bước chạy; anim chạy `12(5) 9(3) 13(5) 9(3)` |
| mach_bike | 32x32 | 9 | Bố cục như sheet chuẩn |
| acro_bike | 32x32 | 27 | 9 frame chuẩn + 18 frame bốc đầu (wheelie), nhảy bunny hop, wheelie di chuyển |
| surfing | 32x32 | 6 | Ngồi trên lưng Pokémon S/N/W (0, 2, 4) và tư thế nhảy lên/xuống (1, 3, 5); khối nước "surf blob" là sprite riêng |
| field_move | 32x32 | 5 | Giơ Poké Ball dùng HM: `0(4) 1(4) 2(4) 3(4) 4(8)` |
| fishing | 32x32 | 12 | 4 frame mỗi hướng W/N/S: rút cần, cất cần, giật khi cắn câu |
| watering | 32x32 | 6 | 2 frame mỗi hướng S/N/W (tưới Berry) |
| decorating | 16x32 | 1 | Tư thế đứng khi trang trí Secret Base |
| underwater | 32x32 | 3 | Lặn (Dive) S/N/W; palette riêng `player_underwater` 6 màu [ĐO] |

Emerald còn giữ walking + running của Brendan/May bản Ruby/Sapphire (`ruby_sapphire_brendan/`, `ruby_sapphire_may/`) cho link với RS [PRET E4]. Rival dùng chính các sheet này (10 graphics ID `RIVAL_*`) [PRET E5].

**FRLG, mỗi giới tính (Red / Green)** [PRET F1]: `red_normal` 16x32 9 frame; `red_surf_run` 16x32 14 frame (0–2 ngồi lướt S/N/W, 3–11 chạy, 12–13 lắc đầu / quay); `red_bike` 32x32 9 frame; `red_item` 16x32 9 frame (dùng cho field move và VS Seeker đi bộ); `red_vs_seeker_bike` 32x32 6 frame; `red_fish` 32x32 12 frame. Khác Emerald: lướt nước ở FRLG dùng khung **16x32**, không có Acro Bike, dưới nước, tưới cây.

**NPC có gì trong số đó [PRET E1].** NPC thường chỉ có sheet 9 frame (hoặc 3). Riêng Cycling Triathlete M/F dùng khung 32x32 với `sAnimTable_AcroBike` (9 frame), Swimmer M/F của Emerald dùng sheet 16x32 thường (đầu nhô khỏi nước, đo thấy hình chỉ cao 13–17 px), Tuber M có thêm bản `TUBER_M_SWIMMING`. FRLG tách Swimmer và Tuber thành bản "water" và "land". Không NPC nào có sheet chạy, câu cá, field move.

---

## 3. Palette

### 3.1. Số màu

- Mọi sprite overworld là 4bpp: 1 palette 16 màu, index 0 trong suốt → **tối đa 15 màu hiển thị** [PRET E4: `.4bpp`].
- Đo thực tế: một sheet người dùng **10–15 index khác 0**; một frame đơn lẻ dùng **9–15** [ĐO, 23 sheet]. Player gần dùng hết (Brendan walking 14, May 15, Mach Bike 15).

### 3.2. Cấu trúc palette NPC dùng chung (Emerald) [PRET E12, đọc `npc_1.pal`…`npc_4.pal`]

Bốn palette NPC có **cùng khung**:

| Index | Vai trò | Giá trị (RGB 8 bit) |
|---|---|---|
| 0 | Trong suốt (màu nền mint) | 115 197 164 |
| 1–4 | **Ramp da, giống hệt ở cả 4 palette**: sáng → tối, index 4 là viền da | 255 213 180 · 255 197 148 · 222 148 115 · 123 65 65 |
| 5–7 | Ramp A (3 sắc) | NPC1 hồng · NPC2 vàng cam · NPC3 xám tím · NPC4 xanh xám |
| 8–10 | Ramp B (3 sắc) | NPC1 xanh dương · NPC2 đỏ · NPC3 xanh lá · NPC4 tím hồng |
| 11–13 | Ramp C (3 sắc) | NPC1 vàng đất · NPC2 nâu đỏ · NPC3 đỏ cam · NPC4 xám |
| 14 | Trắng | 255 255 255 |
| 15 | Đen | 0 0 0 |

Nghĩa là mỗi palette NPC = 1 trong suốt + 4 da + **3 ramp 3 sắc** + trắng + đen. Một NPC được vẽ bằng da + tối đa 3 vật liệu (tóc, áo, quần/mũ) trong một trong bốn bộ màu đó.

Palette Brendan khác khung: 1–4 da (giống NPC), 5–8 ramp xanh navy 4 sắc, 9 trắng xám, 10–11 xanh lá, 12–13 đỏ, 14 trắng, 15 đen [PRET E12, `brendan.pal`].

### 3.3. Ô palette OBJ dành cho object event [PRET E6, E7]

Enum `PALSLOT_*` chiếm **12 trong 16 palette OBJ** (`OBJ_PALSLOT_COUNT` = 12, `gReservedSpritePaletteCount = OBJ_PALSLOT_COUNT`):

| Slot | Nội dung |
|---|---|
| 0 | Player |
| 1 | Phản chiếu của Player |
| 2–5 | **NPC 1–4 (dùng chung cho mọi NPC trên map)** |
| 6–9 | Phản chiếu NPC 1–4 |
| 10 | NPC đặc biệt (palette riêng một lần: Quinty Plump, Truck, Kyogre, Groudon, S.S. Tidal …) |
| 11 | Phản chiếu NPC đặc biệt |

`InitObjectEventPalettes` nạp sẵn bộ tag cố định vào slot 0–9 khi vào map; khi map không có mặt nước phản chiếu (`reflectionType == 1`) chỉ nạp slot 0–5 và giữ lại 8 slot [PRET E6]. Phân bố trong 245 graphics info Emerald: NPC_1 65, NPC_2 36, NPC_3 51, NPC_4 42, đặc biệt 36, Player 15 [PRET E1]. Mỗi graphics info gán **cứng** vào một trong 4 palette; không có palette riêng cho từng NPC.

FRLG giữ cùng cấu trúc 12 slot nhưng đặt tên 4 palette NPC theo màu: `NPC_BLUE` (39 info), `NPC_PINK` (28), `NPC_GREEN` (18), `NPC_WHITE` (51); Player có `PLAYER_RED`, `PLAYER_GREEN` [PRET F1].

### 3.4. Palette phản chiếu [PRET E6, E12]

Đứng cạnh mặt nước, game vẽ bản lật dọc của sprite bằng palette phản chiếu ở slot tương ứng (`gReflectionEffectPaletteMap`). Palette phản chiếu là bản **nhạt và ngả xanh** của palette gốc (ví dụ `npc_1_reflection.pal`: da 255 255 255 / 255 255 230 / 255 230 197 / 205 148 148, đen thành 115 131 148). Trên cầu, game dùng `bridge_reflection.pal`: **cả 16 màu cùng một màu** 74 115 172, tức bóng phản chiếu một màu.

---

## 4. Danh sách graphics ID của Emerald

`NUM_OBJ_EVENT_GFX = 239` (ID 0–238), cộng 16 ID động `OBJ_EVENT_GFX_VAR_0…F` (240–255) để script đổi hình [PRET E5]. Có 245 struct graphics info vì 6 info chỉ dùng qua biến (người kể chuyện ở Mauville: Hipster, Trader, Storyteller, Giddy, 2 bản không dùng) [PRET E1].

### 4.1. Đếm theo loại [PRET E5, tôi phân loại]

| Loại | Số ID |
|---|---|
| Người (mọi loại) | **139** |
| trong đó biến thể Player/Rival/Link (Brendan, May ở mọi sheet) | 32 |
| trong đó **người không phải Player** | **107** |
| Pokémon | 31 |
| Búp bê và gối (đồ trang trí Secret Base) | 51 |
| Vật thể (item ball, berry tree ×3, cây Cut, đá, tảng đá, thuyền, xe tải, túi, thùng, cáp treo, tàu, hoá thạch, tượng …) | 18 |

Số PNG trong `graphics/object_events/pics/people/` của Emerald: **133**, trong đó 24 là sheet Player (Brendan 10, May 10, Brendan/May RS 2 + 2) và **109** sheet người khác [PRET E4]. Ở FRLG: 152 ID, trong đó 92 là người (14 biến thể Player Red/Green), 17 vật thể, 43 Pokémon/tàu; 96 PNG người [PRET F1].

### 4.2. 107 ID người (không phải Player) của Emerald, theo nhóm

- **Dân thường (townsfolk), 31**: `BOY_1`, `BOY_2`, `BOY_3`, `GIRL_1`, `GIRL_2`, `GIRL_3`, `LITTLE_BOY`, `LITTLE_GIRL`, `LITTLE_BOY_3` (bản RS), `TWIN`, `RICH_BOY`, `MAN_1`…`MAN_5`, `WOMAN_1`…`WOMAN_5`, `FAT_MAN`, `OLD_MAN`, `OLD_WOMAN`, `HOT_SPRINGS_OLD_WOMAN`, `GAMEBOY_KID`, `SCHOOL_KID_M`, `ARTIST`, `BARD`, `QUINTY_PLUMP` (32x32, khổ to), `MOM`.
- **Lớp Trainer, 30**: `YOUNGSTER`, `BUG_CATCHER`, `LASS`, `CAMPER`, `PICNICKER`, `HIKER`, `FISHERMAN`, `SAILOR`, `SWIMMER_M`, `SWIMMER_F`, `TUBER_M`, `TUBER_F`, `TUBER_M_SWIMMING`, `BLACK_BELT`, `BEAUTY`, `GENTLEMAN`, `PSYCHIC_M`, `HEX_MANIAC`, `MANIAC`, `NINJA_BOY`, `EXPERT_M`, `EXPERT_F`, `POKEFAN_M`, `POKEFAN_F`, `RUNNING_TRIATHLETE_M/F`, `CYCLING_TRIATHLETE_M/F`, `REPORTER_M`, `REPORTER_F`. Lưu ý: Emerald **không có sprite overworld Ace Trainer/Cooltrainer**; các Cooltrainer trên map dùng sprite khác (`MAN_3`, `WOMAN_5` …) [chưa xác minh từng map]. FRLG có `COOLTRAINER_M/F` riêng.
- **Dịch vụ, 13**: `NURSE`, `UNION_ROOM_NURSE`, `MART_EMPLOYEE`, `ROOFTOP_SALE_WOMAN`, `LINK_RECEPTIONIST`, `MYSTERY_GIFT_MAN`, `CONTEST_JUDGE`, `SCIENTIST_1`, `SCIENTIST_2`, `DEVON_EMPLOYEE`, `COOK`, `CAMERAMAN`, `TEALA`.
- **Gym leader, 10**: `ROXANNE`, `BRAWLY`, `WATTSON`, `FLANNERY`, `NORMAN`, `WINONA`, `TATE`, `LIZA`, `JUAN`, `WALLACE` (Wallace cũng là Champion).
- **Elite Four, 4**: `SIDNEY`, `PHOEBE`, `GLACIA`, `DRAKE`.
- **Frontier Brain, 7**: `ANABEL`, `TUCKER`, `GRETA`, `SPENSER`, `NOLAND`, `LUCY`, `BRANDON`.
- **Villain, 6**: `AQUA_MEMBER_M/F`, `MAGMA_MEMBER_M/F`, `ARCHIE`, `MAXIE`.
- **Nhân vật cốt truyện, 6**: `PROF_BIRCH`, `STEVEN`, `WALLY`, `SCOTT`, `RED`, `LEAF` (Red/Leaf để link với FRLG).

Tổng 31 + 30 + 13 + 10 + 4 + 7 + 6 + 6 = 107.

FRLG bổ sung các kiểu không có ở Emerald: `POLICEMAN`, `ROCKER`, `BIKER` (32x32), `CHANNELER`, `WORKER_M/F`, `ROCKET_M/F`, `BALDING_MAN`, `CRUSH_GIRL`, `SITTING_BOY`, `OLD_MAN_LYING_DOWN` (32x32), `CAPTAIN`, `CHEF`, `CLERK`, `GYM_GUY`, `TEACHY_TV_HOST`, 8 gym leader Kanto, 5 E4/Champion (Lorelei, Bruno, Agatha, Lance, Blue), `PROF_OAK`, `BILL`, `DAISY`, `MR_FUJI`, `CELIO`, `GIOVANNI` [PRET F1].

---

## 5. Sprite trận đấu: Trainer front pic và Player back pic

| Hạng mục | Emerald | FRLG | Nguồn |
|---|---|---|---|
| Kích thước front pic | **64x64**, 1 frame tĩnh | 64x64 | [PRET E11] `gTrainerFrontPicCoords[...] = {.size = 8, ...}` (8 tile = 64 px); PNG đo 64x64 |
| Số front pic | **93** (`TRAINER_PIC_*` 0–92), 93 palette riêng (`gTrainerPalette_*`) | 148 (`TRAINER_PIC_*` 0–147) | [PRET E11, F1] |
| Màu front pic | 1 palette riêng 16 màu/pic; đo 13–15 màu hiển thị | | [ĐO 5 pic] |
| Vùng hình trong 64x64 | Người chiếm khoảng 33–47 px ngang, 48–63 px dọc, chân chạm hoặc sát đáy (y tối đa 62–63) | | [ĐO: Brendan x14–49 y8–62, Hiker x10–56 y1–63, Youngster x18–52 y15–62] |
| Back pic Player | **64x64 × 4 frame** (PNG 64x256, xếp dọc) cho Brendan, May, Brendan/May RS, Wally, Steven | Red/Leaf **64x64 × 5 frame** (PNG 64x320); FRLG còn back pic Poké Dude, Old Man | [PRET E11, ĐO] |
| Anim ném bóng | `0 (24) → 1 (9) → 2 (24) → 0 (9) → 3 (50)` tick | Red/Leaf: `1 (20) → 2 (6) → 3 (6) → 4 (24) → 0 (1)` | [PRET `back_pic_anims.h`] |
| Màu back pic | 11–15 màu hiển thị | 13–14 | [ĐO 6 back pic] |

Ý nghĩa từng frame back pic (frame nào là vung tay, frame nào là sau khi ném): chưa xác minh, tôi không mở xem bằng mắt.

---

## 6. Movement type và hiệu ứng liên quan tới asset

- Emerald có **81** hằng `MOVEMENT_TYPE_*` [PRET `include/constants/event_object_movement.h`]. Nhóm chính: đứng nhìn một hướng (`FACE_UP/DOWN/LEFT/RIGHT`), nhìn luân phiên 2–3 hướng (`FACE_DOWN_AND_UP`, `FACE_UP_LEFT_AND_RIGHT` …), xoay (`ROTATE_CLOCKWISE/COUNTERCLOCKWISE`), lang thang (`WANDER_AROUND`, `WANDER_UP_AND_DOWN`, `WANDER_LEFT_AND_RIGHT`), đi theo tuyến (`WALK_UP_AND_DOWN`, 24 kiểu `WALK_SEQUENCE_*`), bắt chước Player (`COPY_PLAYER*`), nguỵ trang (`TREE_DISGUISE`, `MOUNTAIN_DISGUISE`, `BURIED`), đi/chạy tại chỗ (`WALK_IN_PLACE_*`, `JOG_IN_PLACE_*`, `RUN_IN_PLACE_*`), `INVISIBLE`.
- Mọi kiểu trên chỉ cần **4 hướng đứng + chu kỳ bước** của sheet 9 frame. Không có tư thế idle thở.
- Khoảng chờ giữa hai bước khi lang thang: ngẫu nhiên 32/64/96/128 frame (`sMovementDelaysMedium`); một số kiểu nhìn quanh dùng 32/48/64/80 (`sMovementDelaysShort`) [PRET E6].
- **Trainer phát hiện Player [PRET E9]**: trainer nhìn theo hướng mặt, tầm nhìn tính bằng ô (`trainerRange_berryTreeId`, đặt trong map). Khi thấy, icon "!" hiện ra rồi trainer đi tới. Icon "!" và "?" là OBJ **16x16** 4bpp, dùng palette slot 0 (palette của Player); icon tim dùng palette field-effect `GENERAL_0`. Icon đặt cao hơn sprite trainer 16 px, nảy lên với vận tốc ban đầu −5 px/frame rồi +1 mỗi frame, hiện **60 frame**.

---

## 7. Phong cách pixel art

- **Tỷ lệ đầu : thân ≈ 1 : 1** [ĐO]. Trong nhân vật cao 19–21 px, đầu (tóc/mũ tới cằm) chiếm 10–12 px, từ cổ xuống chân 9–11 px. Ví dụ Boy 1: đầu hàng 12–21, thân 22–30; Brendan: đầu (cả mũ) 10–21, thân 22–30; Hiker: đầu 10–19, thân 20–30; Beauty: đầu 11–20, thân 21–30. Trẻ nhỏ 16x16: cao 14 px, đầu ~8 px, thân ~6 px. Đây là dáng "2 đầu" kiểu SD; khác với quy tắc "không chibi" của sprite Pokémon trong `AGENTS.md`, vốn chỉ áp cho Pokémon.
- **Viền**: viền ngoài phần lớn là **sắc tối nhất của từng vật liệu**, không phải đen tuyền. Đo trên pixel biên bóng của 20 sheet 16x32: 48 % là màu tối (độ sáng < 80, ví dụ index 13 của ramp tóc), 35 % là sắc tối vừa (ví dụ viền da 123 65 65), chỉ **18 % là đen 0 0 0** [ĐO]. Player dùng đen nhiều hơn (Brendan 50 %, May 61 %) để nổi bật hơn NPC [ĐO].
- **Đổ bóng**: mỗi vật liệu là một ramp 3 sắc (da 4 sắc) theo cấu trúc palette ở mục 3.2, nên mỗi vùng có sáng / trung / tối. Hướng sáng: chưa xác minh.
- **Mắt**: hai chấm đen 1x2 px cách nhau 2 px ở khung nhìn xuống (Boy 1, Brendan) [ĐO, 2 mẫu, chưa đủ để khái quát].
- **Số màu điển hình**: 10–15 index mỗi sheet (gồm 4 da + trắng + đen + 2–3 ramp) [ĐO].

---

## Ý nghĩa cho Mons

Bộ asset Character gốc tối thiểu, bám đúng khuôn Gen 3:

1. **Sheet chuẩn cho mọi NPC/Trainer**: dải ngang **9 frame 16x32** (PNG 144x32), thứ tự `S, N, W, S-bước-A, S-bước-B, N-bước-A, N-bước-B, W-bước-A, W-bước-B`; E = lật W. Chân ở hàng 30 khi đứng, frame bước thấp xuống 1 px. Nhân vật cao 19–21 px, đầu : thân ≈ 1 : 1. Bản "đứng yên" cho gym leader/nhân viên quầy chỉ cần 3 frame.
2. **Trẻ nhỏ**: cùng bố cục, khung 16x16 (PNG 144x16).
3. **Player**: walking 9 + running 9 (16x32) là bắt buộc. Thêm khi game có tính năng tương ứng: bike 9 frame 32x32, surf 6 frame 32x32 (cộng sprite surf blob riêng), field move 5 frame 32x32, fishing 12 frame 32x32.
4. **Palette**: 4 palette NPC dùng chung, mỗi palette = trong suốt + 4 da (giống nhau ở cả 4) + 3 ramp 3 sắc + trắng + đen; Player có palette riêng. Giới hạn 15 màu/sprite, BGR555, alpha 0/255, khớp pass Gen 3 đã có trong repo (`check_gen3.py`). Cần quyết định 4 bộ ramp lấy từ palette gym của Mons hay làm mới.
5. **Phụ trợ**: bóng 16x8 (chỉ khi nhảy), icon "!" 16x16, palette phản chiếu nếu có mặt nước phản chiếu.
6. **Trận đấu**: front pic 64x64 một frame, palette riêng 15 màu, cho mỗi lớp Trainer; back pic Player 64x64 × 4 frame (ném bóng).

Câu hỏi mở:
- Mons có cần chạy (B-dash), xe đạp, lướt nước, câu cá không? Mỗi tính năng thêm một sheet Player.
- Có giữ frame "giơ tay" thứ 10 (kiểu VS Seeker FRLG) để báo tái đấu không?
- Có cần phản chiếu nước và icon "?"/tim không?
- Bao nhiêu lớp Trainer và kiểu dân thường cho bản đầu? Emerald dùng 107 ID người không phải Player, nhưng chỉ khoảng 30 lớp Trainer + 31 dân thường; một bộ nhỏ ~20 sheet có lẽ đủ cho demo (ước lượng, cần chốt).
- Front pic: Mons cần cho mọi Trainer hay chỉ gym leader? Phong cách front pic (tỷ lệ người thật hơn, cao ~55 px trong 64x64) khác hẳn sprite overworld 2 đầu.
- Ý nghĩa từng frame back pic và hướng sáng của sprite người: chưa xác minh, cần xem tận mắt.
