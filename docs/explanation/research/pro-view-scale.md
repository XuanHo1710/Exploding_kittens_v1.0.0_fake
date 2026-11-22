# Kích thước hiển thị của Pokémon Revolution Online (PRO): tile, nhân vật, zoom, PC và điện thoại

Mục đích: đo xem PRO (MMO Pokémon do fan làm, pokemonrevolution.net) hiển thị tile và nhân vật to cỡ nào trên màn hình, để so với Mons hiện tại (tile 16 px, nhân vật khung 16×32, màn logic 320×180 / 390×180, ×6 trên 1080p, `WORLD_ZOOM = 1` trong `game/src/screen.ts`) và đề xuất cách cho Mons "nhỏ, dễ nhìn" giống PRO. Ghi chú này **không** đổi code hay quyết định nào ([decisions.md §10](../../agents/decisions.md) giữ nguyên). Phần RPG Maker và tỉ lệ màn hình điện thoại đã có ở [rpgmaker-screen-resolution.md](./rpgmaker-screen-resolution.md), không nhắc lại.

Quy ước độ tin cậy (cùng tinh thần [gen3-visual-style.md](./gen3-visual-style.md)):
- **[DEV]** = bài của developer / staff PRO trên forum chính thức (changelog, trả lời hỗ trợ).
- **[ĐO]** = tự đo trên ảnh chụp màn hình bằng Pillow (`python3 -I`); ghi rõ ảnh, độ phân giải, cách đếm.
- **[2ND]** = nguồn thứ cấp (Bulbapedia, trang review, store).
- **[TÍNH]** = phép tính trên các số ở trên.
- **[SUY RA]** = suy luận từ nhiều dữ kiện, không có dòng nào nói thẳng.
- **chưa xác minh** = không tìm được nguồn tin cậy trong lần này.

Ngày truy cập: 2026-11-19. Bulbapedia trả 403 khi fetch trực tiếp nên chỉ dùng được đoạn tóm tắt từ kết quả tìm kiếm. Không tìm thấy ảnh chụp chính thức nào của client điện thoại trên site PRO; trang tải về không có iOS.

---

## 0. Tóm tắt

- PRO là client **Unity (C#)**, server C++ [2ND]; chạy cửa sổ tự do (chọn độ phân giải, fullscreen / fullscreen window), có thanh trượt **Game Zoom** và **GUI Scale** riêng (2026 thêm GUI Scale riêng cho UI trận đấu) [DEV].
- Từ bản 10.04.2020: **mọi người có cùng tầm nhìn tối đa bất kể độ phân giải**; zoom không còn là số tròn nên tỉ lệ pixel không đều [DEV].
- **Tile 16 px**, nhưng nhân vật vẽ với **mật độ pixel gấp đôi** tile (1 pixel nhân vật = ½ pixel tile) [ĐO].
- Trên PC 1920×1080, zoom xa nhất: **1 tile ≈ 70 px màn hình (×4,35)**, thấy **≈ 27,5 × 15,5 tile**; nhân vật cao **≈ 86 px** [ĐO]. Zoom gần nhất: ≈ 270 px/tile, chỉ thấy ≈ 7 × 4 tile [ĐO].
- Mons hôm nay: 1 tile = **96 px**, thấy **20 × 11,25 tile**, nhân vật cao **120 px** (14×20 px nhìn thấy ×6). Tỉ lệ nhân vật / tile của Mons (0,88 × 1,25 tile) **gần như y hệt PRO** (≈ 0,87 × 1,23 tile) [ĐO]. Khác biệt chỉ là **tỉ lệ phóng**: Mons ×6, PRO ≈ ×4,35.
- Đề xuất: PC **480×270 ×4** (tile 64 px, 30 × 16,9 tile, nhân vật 80 px), là phương án nguyên gần PRO nhất. Điện thoại 2340×1080: **585×270 ×4** (36,6 × 16,9 tile) nếu muốn giống PC, hoặc **468×216 ×5** (29,3 × 13,5 tile) nếu cần to hơn cho màn nhỏ. UI 320×180 / 390×180 giữ được ×6 nếu canvas chạy ở 960×540 (PC) / 1170×540 (phone) với camera world zoom 2 và camera UI zoom 3. Xem §5.

---

## 1. Engine, độ phân giải, kích thước asset của PRO

| Hạng mục | Giá trị | Nguồn |
|---|---|---|
| Engine client | Unity, C#; server C++; Windows, Mac, Linux, Android | [2ND] Bulbapedia, [Pokémon Revolution Online](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Revolution_Online) (qua tóm tắt tìm kiếm). Changelog 30.01.2020 và 10.04.2020: "Bumped Unity to latest/newest version" [DEV], [Update Logs trang 20](https://pokemonrevolution.net/forum/topic/3146-update-logs/page/20/) |
| Nền tảng tải về | Windows 64/32-bit, Android, Android Legacy, Mac, Linux; không có iOS | [Trang Download](https://pokemonrevolution.net/en/download) |
| Android | App native từ 07/2018 ("PRO Droid is now a native Android application"); gói `com.PROTeam.PROClient`, Android 4.4+ | [DEV] [Update Logs trang 14](https://pokemonrevolution.net/forum/topic/3146-update-logs/page/14/); [2ND] [QooApp](https://apps.qoo-app.com/en/app/17015) |
| Chế độ hiển thị | Cửa sổ tự do, chọn độ phân giải trong Options (thấy 1920×1080, 2560×1440); "Fullscreen" và "Fullscreen Window"; exclusive fullscreen có từ 2020; **độ phân giải tối thiểu 640×480** | [DEV] trang 20 (2020: "Limited minimum client resolution to 640x480", "Implemented proper exclusive fullscreen mode"); ảnh Options trong [Zoom issue? (2024)](https://pokemonrevolution.net/forum/topic/238841-zoom-issue/) và [More range in "Game Zoom" (2020)](https://pokemonrevolution.net/forum/topic/148313-more-range-in-game-zoom/) |
| Độ phân giải nội bộ cố định? | **Không**. Không có khung logic kiểu 240×160; ảnh render theo cửa sổ rồi camera zoom (không nguyên) | [SUY RA] từ changelog 2020 + lời staff: "The game zoom no longer being a round number also makes the pixel ratio inconsistent" ([DEV] Shizeria, [disabling staffview…](https://pokemonrevolution.net/forum/topic/148328-disabling-staffview-command-is-a-real-mistake/)) |
| Tile | **16 × 16 pixel tile** (diễn hoạ kiểu Gen 3/4, tự vẽ lại) | [ĐO] §2 |
| Nhân vật | Vẽ ở **mật độ gấp đôi tile**: cô "Lass Dessy" ≈ 28 × 39 pixel nhân vật = ≈ 14 × 20 pixel tile ≈ **0,87 × 1,23 tile** | [ĐO] §2 |
| Tùy chọn | Graphics: Resolution, Fullscreen, VSync, Limit FPS, **Game Zoom** (thanh trượt), **GUI Scale** (thanh trượt), Dynamic Lighting, Weather, Frame Buffer Size, Texture Cache Size. 01.05.2026: thêm GUI Scale riêng cho UI trận đấu | [ĐO] ảnh Options; [DEV] [Update Logs trang 26](https://pokemonrevolution.net/forum/topic/3146-update-logs/page/26/) |

### Lịch sử zoom (quan trọng để hiểu số đo)

1. **2015–2020: zoom theo pixel, độ phân giải càng cao càng thấy nhiều.** Có thanh Game Zoom + GUI Scale cả trên Android ([Zooming in Android Version, 2015](https://pokemonrevolution.net/forum/topic/5340-zooming-in-android-version/)). Người chơi PC dùng lệnh console ẩn `staffview 1` (F2) để kéo xa hơn mức cho phép ([PRO Client Zooming-Out Question, 2016](https://pokemonrevolution.net/forum/topic/29413-pro-client-zooming-out-question/)); có người dùng `staffview 40` ([Staffview command, 2019](https://pokemonrevolution.net/forum/topic/124230-staffview-command/)).
2. **10.04.2020: viết lại camera.** Developer Eaty: "Every user will have the same max view next client update, so there won't be any unfair advantages… many users with lower resolution will see more by default" ([DEV], [add an option… staffview 1](https://pokemonrevolution.net/forum/topic/146969-add-an-option-in-menu-grafic-game-to-change-the-view-instead-of-writing-the-command-staffview-1/)). Changelog: "Reworked … game zoom", "Every user has the same max view regardless on resolution on maps now", "Fixed horizontal screen jumping on small maps with certain zoom settings and enabled border alignment on indoor maps" ([DEV] trang 20).
3. Lý do (staff Shizeria, [DEV]): người chơi độ phân giải thấp gần như không thấy gì; người làm script/map cần biết **tầm nhìn cố định** để đặt tầm nhìn Trainer, sự kiện, và để map còn "khám phá" được. Hệ quả staff tự thừa nhận: nội dung cũ giả định tầm nhìn rộng hơn (Trainer gọi từ ngoài màn hình), và zoom không tròn làm pixel không đều.
4. Phản ứng người chơi PC: "quá gần", "đếm được từng pixel trên màn 17 inch" ([More range in "Game Zoom"](https://pokemonrevolution.net/forum/topic/148313-more-range-in-game-zoom/), [disabling staffview…](https://pokemonrevolution.net/forum/topic/148328-disabling-staffview-command-is-a-real-mistake/)). Tức là **ngay cả mức xa nhất của PRO (~27,5 × 15,5 tile) vẫn bị một bộ phận người chơi PC chê là gần**.
5. 2024, staff trả lời người thấy game "xa hơn trước": "Generally, the higher resolution you play on, the more zoomed out it will seem", khuyên chỉnh GUI Scale ([DEV] Codexed, [Zoom issue?](https://pokemonrevolution.net/forum/topic/238841-zoom-issue/)). Câu này có vẻ mâu thuẫn với "same max view" 2020; có thể chỉ đúng với GUI (HUD tính theo pixel màn hình nên trên màn to trông nhỏ đi) — **chưa xác minh**.

---

## 2. Đo trên ảnh chụp PC (1920×1080)

Ảnh tải vào `scratchpad/pro-shots/` (thư mục tạm của phiên), đo bằng hai script: đếm độ dài các đoạn màu đồng nhất theo hàng/cột (cỡ "pixel nghệ thuật" là bước nhỏ nhất lặp lại) và tự tương quan (dịch ảnh tìm độ lệch khớp nhất giữa hai vật giống hệt nhau).

**Ảnh A — zoom xa nhất.** [forum upload 1586505228227.png](https://pokemonrevolution.net/forum/uploads/monthly_2020_04/1586505228227.png.541ca10361061b97010c21d0e35d0e3e.png), 1879×1059, trong thread [More range in "Game Zoom"](https://pokemonrevolution.net/forum/topic/148313-more-range-in-game-zoom/) (10.04.2020, ngay sau bản viết lại camera). Options hiện "1920 x 1080, Fullscreen", thanh Game Zoom ở **tận trái**. Ảnh bị cắt mép (chat bị cắt chữ "Loc"), không bị co: chữ UI đúng kích thước.
- Hai tủ sách giống nhau lệch **139 px**; hai bàn hoa trái/phải lệch **836 px**. Nếu là 2 và 12 tile ⇒ **1 tile ≈ 69,7 px** [ĐO]. Ô gạch sàn hình thoi lặp ≈ 70 px, khớp.
- Bước pixel nhỏ nhất của nền/đồ vật: đoạn 4–5, 9, 13, 17–18, 26, 35 px ⇒ **≈ 4,35 px màn hình / pixel tile** ⇒ 69,7 / 4,35 = **16 pixel/tile** [ĐO].
- Nhân vật: đoạn 2 px chiếm áp đảo ⇒ **≈ 2,2 px / pixel nhân vật**, tức nhân vật vẽ mịn gấp đôi tile [ĐO]. Cô Lass rộng ≈ 61 px, cao ≈ 86 px trên màn hình ⇒ ≈ 0,87 × 1,23 tile.
- Tầm nhìn: 1920 / 69,7 ≈ **27,5 tile** ngang, 1080 / 69,7 ≈ **15,5 tile** dọc [TÍNH]. (Người đăng tự vẽ "25 × 10 cells"; số của họ ước lượng tay.)

**Ảnh B — zoom gần nhất.** [forum upload 1586505005045.png](https://pokemonrevolution.net/forum/uploads/monthly_2020_04/1586505005045.png.7e55308606e38d5de4c16d1a61b79348.png), 1891×1040, cùng thread, cùng chỗ đứng, Game Zoom ở **tận phải**.
- Pixel nhân vật ≈ 8,5 px (đoạn 8/9/17), pixel nền ≈ 17 px. Cô Lass rộng ≈ 236 px (gấp ≈ 3,87 lần ảnh A) ⇒ **1 tile ≈ 270 px** ⇒ chỉ thấy ≈ **7 × 4 tile** [ĐO/TÍNH]. Người đăng ghi "7 cells x 3 cells", khớp.
- ⇒ Dải Game Zoom ≈ **×3,9**, từ ≈ 4,35 đến ≈ 17 px màn hình / pixel tile trên 1080p [ĐO].

**Ảnh C — laptop 2024.** [IMG_5723.jpeg](https://pokemonrevolution.net/forum/uploads/monthly_2024_06/IMG_5723.jpeg.e255e6571c30876653d8435501bf54c4.jpeg), ảnh chụp bằng điện thoại màn hình laptop HP (zoom xa nhất, "resolution at its highest" theo người đăng). Méo phối cảnh, độ phân giải laptop không rõ: ước lượng **≈ 25 tile ngang** (nhân vật ≈ 1/20 bề ngang màn hình). Chỉ dùng như kiểm tra thô: cùng cỡ với ảnh A, hợp với "same max view" [ĐO, thô].

**1366×768 (không có ảnh).** Nếu tầm nhìn tối đa tính theo tile như nhau thì 1 tile ≈ 1366 / 27,5 ≈ 50 px (≈ ×3,1) [SUY RA, chưa xác minh].

Nhận xét thị giác (ảnh A): HUD (party bên trái, nút PvP/Backpack/Pokedex, khung chat) nhỏ so với màn 1080p, vẽ theo pixel màn hình và chỉnh bằng GUI Scale, không bị phóng theo map. Map trong nhà nhỏ hơn tầm nhìn thì phần ngoài là **nền đen** (ảnh A thấy rõ mép phòng Pokémon Center).

---

## 3. Điện thoại (Android)

Không có ảnh chính thức. Số liệu có được:
- **Ảnh D** (2017, trước bản viết lại camera): [Screenshot_2017-09-27-14-47-19-51.png](https://roonby.com/wp-content/uploads/2017/09/Screenshot_2017-09-27-14-47-19-51.png), 1280×720, bài review [roonby.com](https://roonby.com/2017/09/28/pokemon-revolution-review/) [2ND]. Pixel tile đúng **4 px**, pixel nhân vật **2 px** ⇒ 1 tile = 64 px ⇒ **20 × 11,25 tile** [ĐO]. (Trùng khớp tầm nhìn Mons hiện tại.) Không biết điện thoại thật là 720p hay ảnh đã bị co, và không biết mức Game Zoom người chụp chọn.
- Ảnh thứ hai cùng bài (1135×638, trận đấu ở Pallet Town): bước pixel ≈ 3,5 px, phù hợp với cùng mức zoom sau khi ảnh bị co ×0,887 [ĐO, thô].
- Từ 2020, điện thoại chịu **cùng giới hạn tầm nhìn tối đa** với PC; trước đó người chơi điện thoại không dùng được `staffview` để kéo xa ([DEV] Eaty). Vậy tầm nhìn xa nhất trên điện thoại ≈ PC (~27,5 × 15,5 tile) [SUY RA, chưa đo].
- Điều khiển cảm ứng: vuốt / chạm để đi và nói chuyện (2017, [2ND] roonby); từ 2020 có **D-pad** hiện hình khi bấm và tùy chọn **xoay 180°** để tránh tai thỏ ("notch"); vuốt từ trên xuống mở console F2; giữ để xem tooltip ([DEV] trang 17, 18, 20). Game Zoom và GUI Scale có trên Android từ 2015 ([forum](https://pokemonrevolution.net/forum/topic/5340-zooming-in-android-version/)); máy 2K có thể phóng GUI "rất to" — tức người chơi điện thoại thường **kéo gần hơn** PC.

---

## 4. Bảng so sánh

"px/tile @1080p" = số pixel màn hình mà một tile 16 px chiếm khi chạy trên màn cao 1080 px.

| Game | Độ phân giải nội bộ | Tile (px nghệ thuật) | Tile thấy được (ngang × dọc) | px/tile @1080p | Nhân vật cao @1080p | Nguồn |
|---|---|---|---|---|---|---|
| GBA FRLG / Emerald | 240×160 cố định | 16 | 15 × 10 | 96 (×6 = 1440×960, có viền) | ≈ 120 (≈ 20 px ×6) | [TÍNH] từ GBATEK, xem [gen3-visual-style.md](./gen3-visual-style.md) |
| DS HGSS / Platinum | 256×192 mỗi màn | 16 | 16 × 12 | 80 (×5 = 1280×960) | ≈ 100–110 | [TÍNH] |
| PRO PC, zoom xa nhất (2020+) | Cửa sổ tự do, zoom không nguyên | 16 (nhân vật mịn ×2) | ≈ 27,5 × 15,5 | ≈ 70 (×4,35) | ≈ 86 | [ĐO] ảnh A |
| PRO PC, zoom gần nhất | như trên | 16 | ≈ 7 × 4 | ≈ 270 (×17) | ≈ 335 | [ĐO] ảnh B |
| PRO Android 2017 (ảnh 1280×720) | như trên | 16 | 20 × 11,25 | (64 trên màn 720) | (≈ 83 trên 720) | [ĐO] ảnh D |
| PokeMMO | — | — | — | — | — | chưa xác minh (không tìm được nguồn về zoom) |
| **Mons hiện tại** PC | 320×180 ×6 | 16 | 20 × 11,25 | **96** | **120** (14×20 ×6) | `game/src/screen.ts`, `assets/characters/Player/player-boy/*.json` |
| Mons hiện tại phone (2340×1080) | 390×180 ×6 | 16 | 24,4 × 11,25 | 96 | 120 | decisions §10 |
| Mons đề xuất A, PC | **480×270 ×4** | 16 | 30 × 16,9 | **64** | **80** | [TÍNH] |
| Mons đề xuất B, PC | 640×360 ×3 | 16 | 40 × 22,5 | 48 | 60 | [TÍNH] |
| Mons phone A | 585×270 ×4 | 16 | 36,6 × 16,9 | 64 | 80 | [TÍNH] |
| Mons phone A' | 468×216 ×5 | 16 | 29,3 × 13,5 | 80 | 100 | [TÍNH] |
| Mons phone B | 780×360 ×3 | 16 | 48,8 × 22,5 | 48 | 60 | [TÍNH] |

Điểm rút ra:
- Mons ×6 = **đúng cỡ tile của GBA phóng vừa màn 1080p**. PRO ở mức xa nhất cho thấy nhiều hơn GBA ≈ 1,8 lần theo mỗi chiều ngang, 1,55 lần theo chiều dọc.
- Tỉ lệ nhân vật / tile của Mons đã giống PRO; **không cần vẽ lại nhân vật hay tile**, chỉ đổi tỉ lệ phóng. (PRO vẽ nhân vật mịn gấp đôi nên trông chi tiết hơn ở cùng kích thước; đó là chuyện phong cách, không phải chuyện cỡ.)
- PRO không giữ pixel nguyên (×4,35); Mons có thể làm gọn hơn PRO bằng tỉ lệ nguyên.

---

## 5. Đề xuất cho Mons (chưa áp dụng)

### 5.1 Chọn tỉ lệ

- **PC 1920×1080: 480×270 ×4.** Tile 64 px, nhân vật 80 px, 30 × 16,9 tile. Gần PRO nhất (70 px, 27,5 × 15,5) trong các phương án nguyên; xa hơn PRO một chút, nằm giữa "PRO" và "PRO staffview". 640×360 ×3 (48 px, 40 × 22,5 tile) xa hơn hẳn mức xa nhất của PRO: nhân vật 60 px, trên màn laptop dễ thành nhỏ quá; chỉ nên là tùy chọn zoom.
- **Phone 2340×1080:** 585×270 ×4 cho cùng cỡ với PC (36,6 × 16,9 tile). Nhưng màn 6,5" ≈ 400 ppi ⇒ tile 64 px ≈ 4 mm, nhân vật ≈ 5 mm [TÍNH]: rất nhỏ cho ngón tay và mắt. PRO trên điện thoại thường được kéo gần hơn (ảnh D: 20 × 11,25 tile). Đề xuất mặc định **468×216 ×5** (29,3 × 13,5 tile, nhân vật 100 px ≈ 6,4 mm), cho phép chọn ×4.
- **Màn khác (1366×768, 1600×900, 2560×1440):** chọn hệ số nguyên k sao cho chiều cao logic H/k gần 270 nhất (768 → k = 3, 256 px = 16 tile; 900 → k = 3, 300 px = 18,75 tile; 1440 → k = 5, 288 px = 18 tile), rồi chiều rộng logic = W/k. Như vậy không cần viền đen và pixel luôn đều. Nên đặt **trần tầm nhìn** (ví dụ ≤ 30 × 17 tile) giống PRO 2020, để tầm nhìn Trainer, sự kiện và cảm giác khám phá không phụ thuộc màn hình.
- Có thể thêm tùy chọn "Thu phóng" với vài mức nguyên (×3 / ×4 / ×5 trên 1080p), không dùng thanh trượt liên tục (PRO chính họ chê zoom không tròn).

### 5.2 Cách giữ UI 320×180 / 390×180 ở ×6

`World.ts` đã có hai camera: camera world (`WORLD_ZOOM`) và camera UI zoom 1. Hiện canvas = 320×180 và Phaser `Scale.FIT` phóng cả canvas. Nếu chỉ hạ `WORLD_ZOOM` xuống 2/3 trên canvas 320×180 thì tile bị co không nguyên (mất pixel) — không nên.

Cách giữ mọi thứ nguyên [SUY RA]:
- Canvas **960×540** (PC) / **1170×540** (phone), FIT phóng ×2 lên 1920×1080 / 2340×1080.
- Camera world zoom **2** ⇒ thấy 480×270 / 585×270 px world ⇒ ×4 trên màn.
- Camera UI (và camera chính của các scene Battle, Screens, Title, Intro, Evolve) zoom **3** ⇒ vẫn là toạ độ 320×180 / 390×180 ⇒ ×6 trên màn. Asset UI xuất ×1 giữ nguyên; code dùng `SCREEN.w/h` giữ nguyên nghĩa "toạ độ UI".
- Với phone ×5 (468×216): canvas phải là 2340×1080 thật (world zoom 5, UI zoom 6), vì 5 và 6 không có ước chung > 1. Tốn fill-rate hơn nhưng vẫn nhỏ với Phaser.
- Không dùng zoom 1,5 cho UI trên canvas 480×270: 1 pixel UI = 1,5 pixel canvas ⇒ khi FIT ×4 thành 4 và 8 px xen kẽ, méo chữ.

### 5.3 Ảnh hưởng

- **UI / HUD:** giữ ×6 thì HUD to tương đối so với map hơn trước (chiếm cùng diện tích màn hình nhưng map nhỏ đi). PRO thì HUD nhỏ và chỉnh được bằng GUI Scale. Nếu muốn giống PRO hơn: cho UI ×4–×5 trên 1080p (tức UI logic 384×216 hoặc 480×270), nhưng điều đó **đổi decisions §10** và phải dàn lại layout các màn hình 320×180 (Start menu, text box, Summary, Bag, PC box). Đề xuất tách làm hai bước: đổi world trước, UI sau.
- **Battle Scene 390×180:** vẽ ở camera UI ×6 nên không bị ảnh hưởng; cảnh trận không cần làm lại.
- **Map:** 30 × 17 tile lớn hơn nhiều phòng trong nhà và một số khu nhỏ ⇒ cần căn giữa map nhỏ hơn tầm nhìn và tô nền đen ngoài map (PRO làm vậy; PRO cũng từng bị lỗi "screen jumping on small maps"). Map town/route Gen 3 thiết kế cho 15 × 10; với 30 × 17 người chơi thấy gần trọn một town, cần xem lại thiết kế "khám phá" và tầm nhìn Trainer ([gen3-map-composition.md](./gen3-map-composition.md)).
- **Trainer gọi từ ngoài màn hình:** ngược với PRO 2020 — tầm nhìn rộng hơn nên Trainer luôn trong màn; chỉ cần kiểm tra camera bounds.
- **Hiệu năng:** số tile và sprite vẽ mỗi khung tăng ≈ 2,25 lần (30×17 so với 20×11,25) [TÍNH]; với tilemap Phaser là nhỏ.
- **Cảm ứng:** D-pad / A / B trên phone vẽ ở camera UI nên giữ kích thước. Chạm vào map (nếu có) phải đổi toạ độ qua camera world.
- **Ghi chú `screen.ts`:** `WORLD_ZOOM = 4/3` (15 tile) bị chê "quá gần"; hướng PRO là ngược lại (zoom < 1 so với hiện tại), khớp với cảm nhận của người dùng.

---

## Nguồn

Chính thức PRO:
- [pokemonrevolution.net — Features](https://pokemonrevolution.net/en/features), [Download](https://pokemonrevolution.net/en/download)
- [Update Logs](https://pokemonrevolution.net/forum/topic/3146-update-logs/): [trang 1](https://pokemonrevolution.net/forum/topic/3146-update-logs/) (2015, độ phân giải DX11/DX9, Android), [trang 14](https://pokemonrevolution.net/forum/topic/3146-update-logs/page/14/) (Android native 2018), [trang 17](https://pokemonrevolution.net/forum/topic/3146-update-logs/page/17/), [trang 18](https://pokemonrevolution.net/forum/topic/3146-update-logs/page/18/), [trang 20](https://pokemonrevolution.net/forum/topic/3146-update-logs/page/20/) (viết lại camera 10.04.2020, 640×480 tối thiểu), [trang 26](https://pokemonrevolution.net/forum/topic/3146-update-logs/page/26/) (GUI Scale trận đấu, 01.05.2026)
- Forum: [add an option… staffview 1](https://pokemonrevolution.net/forum/topic/146969-add-an-option-in-menu-grafic-game-to-change-the-view-instead-of-writing-the-command-staffview-1/) (Eaty), [disabling staffview command is a real mistake](https://pokemonrevolution.net/forum/topic/148328-disabling-staffview-command-is-a-real-mistake/) (Shizeria), [More range in "Game Zoom"](https://pokemonrevolution.net/forum/topic/148313-more-range-in-game-zoom/) (ảnh A, B), [Wild Suggestion About in-game view](https://pokemonrevolution.net/forum/topic/154447-wild-suggestion-about-in-game-view/), [Zoom issue? (2024)](https://pokemonrevolution.net/forum/topic/238841-zoom-issue/) (ảnh C, Codexed), [PRO Client Zooming-Out Question](https://pokemonrevolution.net/forum/topic/29413-pro-client-zooming-out-question/), [Staffview command](https://pokemonrevolution.net/forum/topic/124230-staffview-command/), [Zooming in Android Version](https://pokemonrevolution.net/forum/topic/5340-zooming-in-android-version/), [So everything has changed](https://pokemonrevolution.net/forum/topic/148304-so-everything-has-changed/)

Thứ cấp:
- [Bulbapedia — Pokémon Revolution Online](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Revolution_Online) (403, dùng tóm tắt tìm kiếm)
- [QooApp — PRO](https://apps.qoo-app.com/en/app/17015)
- [roonby.com — Pokemon Revolution review (2017)](https://roonby.com/2017/09/28/pokemon-revolution-review/) (ảnh D)
- [Snapcraft — pokemonrevolution](https://snapcraft.io/pokemonrevolution) (chỉ có ảnh màn hình đăng nhập "PROClient", 1024×613)
