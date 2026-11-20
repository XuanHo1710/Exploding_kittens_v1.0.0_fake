# Feature Specification: Survival, Farming, Animal Husbandry & Homestead Building System

**Feature Branch**: `008-housing-farming`

**Created**: 2026-11-19

**Status**: Reviewed (Autonomous Design Baseline — Chờ phê duyệt chuyển sang Implementation)

**Input**: User description: "Survival hunger/stamina/food buffs, 15-crop farming with seasonal and quality rules, 6-species animal husbandry without permanent offline death, 100% server-timestamp 24-hour capped offline simulation, and 13-building homestead placement with 32x32 grid snapping, BFS reachability validation, and OWNER_ONLY/PARTY_ACCESS permissions"

## Clarifications

### Session 2026-11-19 *(Autonomous Design Decisions — Proposed, Chưa có phê duyệt triển khai của người dùng)*

- Q: Nhịp thời gian trong thế giới và trần mô phỏng tiến trình ngoại tuyến (offline) được quy định ra sao để vừa tôn trọng người chơi bận rộn vừa chống chỉnh đồng hồ máy khách? → A: Một ngày trong trò chơi kéo dài `24 phút` thời gian thực (`1 phút` Bình minh, `14 phút` Ban ngày, `3 phút` Hoàng hôn, `6 phút` Ban đêm), mỗi mùa gồm `14 ngày trong game` (`SPRING → SUMMER → AUTUMN → WINTER`). Mọi tiến trình sinh trưởng cây trồng, sản xuất chăn nuôi và hoàn tất xây dựng tính `100%` theo chênh lệch đồng hồ máy chủ và giới hạn trần tích lũy tối đa **`24 giờ offline`** *(Proposed Decision — ASM-007 & ASM-008)*.
- Q: Nhân vật hoặc động vật có thể chết vĩnh viễn khi bỏ đói hoặc không đăng nhập nhiều ngày hay không? → A: Tuyệt đối KHÔNG. Khi `Hunger = 0`, nhân vật chỉ bị giảm trần Stamina tạm thời còn `60%` và không bị trừ HP về `0`; `Hunger` đóng băng hoàn toàn khi offline. Đối với động vật, sức khỏe (`health`) luôn bị chặn sàn tối thiểu tại `20` (`permanentDeathAllowed = false`): bị bỏ đói chỉ làm tạm dừng lớn/sản xuất và giảm Hạnh phúc, không bao giờ xóa mất động vật *(Proposed Decision — khớp `game-data/animals.json`)*.
- Q: Trong phạm vi MVP chưa mở Chuồng Gia Súc (`bld_barn`), người chơi nuôi loài bò sữa (`anm_clover_cow`) ở đâu? → A: Người chơi có thể nuôi tối đa `2` con `anm_clover_cow` ngay tại Bãi Chăn Thả Khởi Đầu mở khóa khi nâng `bld_farm_plot` lên cấp `2`, và ở giai đoạn hậu MVP có thể di dời miễn phí sang `bld_barn` mà vẫn giữ nguyên giai đoạn trưởng thành, tên gọi và điểm Hạnh phúc *(Proposed Decision — khớp `game-data/animals.json` & `game-data/buildings.json`)*.
- Q: Phạm vi quyền truy cập `PARTY_ACCESS` giữa thành viên tổ đội và chủ lãnh địa phân định ranh giới chống gian lận/trộm cắp ra sao? → A: Trên công trình `PARTY_ACCESS` (`bld_farm_plot`, `bld_chicken_coop`, `bld_kitchen`, `bld_barn`, `bld_training_ground`), thành viên cùng party chỉ được thực hiện hành động hỗ trợ (tưới nước hộ, vuốt ve và cho thú ăn bằng vật phẩm của chính mình, dùng bếp/tiệc tổ đội, luyện tập), tuyệt đối KHÔNG được thu hoạch nông sản, gom trứng/sữa, mua/bán động vật, xây/di dời/nâng cấp/phá dỡ công trình hay mở kho lưu trữ (`bld_storage` và `bld_blacksmith` luôn khóa cứng `OWNER_ONLY`) *(Proposed Decision)*.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sinh tồn Ấm áp & Canh tác Nông trại 15 Giống Cây Chuẩn Đồng hồ Máy chủ (Priority: P1)

Với tư cách là người chơi tại làng khởi đầu, tôi muốn quản lý độ no, thể lực và hiệu ứng món ăn, đồng thời cuốc đất, gieo hạt, tưới nước, bón phân và thu hoạch nông sản phẩm chất `NORMAL`/`SILVER`/`GOLD` theo mùa vụ để phục vụ nấu ăn tăng sức mạnh trước khi vào hầm ngục, và yên tâm rằng tiến độ cây lớn khi offline được máy chủ tính công bằng tối đa 24 giờ.

**Why this priority**: Liên kết trực tiếp trụ cột "Mọi hoạt động farm đều có giá trị đối với tiến trình phát triển", cung cấp nguồn thực phẩm buff chiến đấu và thức ăn chăn nuôi cho toàn bộ vòng lặp MVP.

**Independent Test**: Có thể kiểm thử độc lập bằng cách cho nhân vật thao tác đủ chu kỳ canh tác (`TILL → PLANT → WATER → FERTILIZE → HARVEST`) trên 5 giống cây MVP (`crp_sunwheat`, `crp_berry_bush`, `crp_moon_herb`, `crp_golden_carrot`, `crp_ember_pepper`), kiểm chứng trạng thái `Hunger`/`FoodBuff` (tối đa `2` kênh), đổi thời gian đồng hồ phía người chơi tiến trước `10 giờ` (xác nhận không làm cây lớn), và tiến đồng hồ máy chủ `30 giờ` (xác nhận mô phỏng offline bị chặn chính xác ở `24 giờ`).

**Acceptance Scenarios**:

1. **Given** nhân vật đang đứng trong khu ruộng (`bld_farm_plot` Lv 1, `12` ô) vào mùa `SPRING`, có `sed_sunwheat`, `csm_fertilizer_basic` và đủ Stamina, **When** người chơi cuốc đất, gieo hạt, bón phân và tưới nước, **Then** ô đất chuyển tuần tự qua các giai đoạn sinh trưởng theo đồng hồ máy chủ (được tăng tốc `1.25x` nhờ phân bón), tự tạm dừng nếu hết ẩm (không chết khô) và khi chín cho phép thu hoạch `2–4` (có cơ hội `+1`) `mat_sunwheat_grain` với phẩm chất `NORMAL`/`SILVER`/`GOLD` cùng điểm kinh nghiệm Farming.
2. **Given** nhân vật ăn lần lượt `csm_golden_roast` (kênh `FOOD_COMBAT`) và `csm_berry_pie` (kênh `FOOD_UTILITY`), sau đó ăn thêm `csm_ember_curry` (kênh `FOOD_COMBAT`), **When** kiểm tra trạng thái sinh tồn, **Then** nhân vật luôn giữ tối đa `2` Food Buff đồng thời, trong đó `csm_ember_curry` ghi đè `csm_golden_roast` trên kênh `FOOD_COMBAT` còn `csm_berry_pie` trên kênh `FOOD_UTILITY` vẫn giữ nguyên.
3. **Given** trời chuyển sang `RAIN` hoặc `bld_farm_plot` đạt cấp `3` đang bật `autoIrrigation`, và người chơi offline `48 giờ`, **When** người chơi đăng nhập lại và vào lãnh địa, **Then** máy chủ mô phỏng tối đa `24 giờ` dựa trên lịch sử thời tiết và chuyển mùa thực tế trên máy chủ; các cây đúng mùa đạt trạng thái chín, các cây trái mùa ở `bld_farm_plot` Lv 1–3 chuyển sang héo (`WITHERED`) còn ở Lv 4 (nhà kính) vẫn sống với tốc độ `0.75x`.

---

### User Story 2 - Xây dựng & Nâng cấp 13 Công trình Lãnh địa An toàn Theo Lưới (Priority: P1)

Với tư cách là chủ sở hữu một khu lãnh địa riêng liền kề làng khởi đầu, tôi muốn xem bóng mờ công trình bám lưới `32×32 px`, xoay hướng các công trình cho phép, đặt và nâng cấp từ 6 công trình cốt lõi MVP (gồm Nhà Chính, Kho, Ruộng, Chuồng Gà, Lò Rèn cấp 1–4 mở khóa cường hóa vũ khí `+1..+10`, và Bếp) đến đầy đủ 13 công trình dài hạn mà không thể vô tình bít kín lối đi hay xâm phạm vùng cấm.

**Why this priority**: Công trình lãnh địa (đặc biệt `bld_blacksmith` Lv 1..4 mở khóa cường hóa `+3/+6/+8/+10` và `bld_storage` Lv 2 mở tự rút nguyên liệu) là trục xương sống nối Housing với toàn bộ Combat & Progression.

**Independent Test**: Có thể kiểm thử độc lập bằng cách đặt, xoay, di dời, nâng cấp và thử hủy/phá dỡ các công trình MVP trên bản đồ lãnh địa `32×24 tiles`, xác nhận máy chủ từ chối mọi vị trí đè đường đi bắt buộc, đè điểm spawn, chồng chéo footprint, hoặc quây kín điểm tương tác (kiểm tra đường đi khả thông), đồng thời xác nhận trừ tài nguyên/Gold nguyên tử và nâng cấp cấp bậc Lò Rèn đúng bảng thông số.

**Acceptance Scenarios**:

1. **Given** nhân vật sở hữu `bld_player_house` Lv 1 (giới hạn `5` công trình phụ), đạt cấp `3`, có đủ `250 Gold` và nguyên liệu xây `bld_blacksmith` Lv 1 (`4×3 tiles`), **When** người chơi chọn vị trí hợp lệ bám lưới `32×32 px` và xác nhận đặt, **Then** máy chủ vượt qua 7 lớp kiểm định (quyền sở hữu, vùng cho phép, không đè vùng cấm/spawn/đường đi, không chồng footprint, đường đi thông suốt tới mọi điểm tương tác), trừ Gold và nguyên liệu nguyên tử kèm bút toán sổ cái, và khởi tạo công trình với thời gian hoàn tất `45 giây` theo đồng hồ máy chủ.
2. **Given** người chơi cố đặt một công trình chồng `1` ô lên đường đi bắt buộc, đè lên cổng spawn, đè lên công trình khác, hoặc xoay `bld_storage` sát rào khiến điểm tương tác `OPEN_STORAGE` bị cô lập không thể đi tới từ cổng lãnh địa, **When** gửi yêu cầu đặt công trình, **Then** máy chủ từ chối ngay với mã lỗi cụ thể và không trừ bất kỳ nguyên liệu hay Gold nào.
3. **Given** chủ nhà mời đồng đội trong Party vào thăm lãnh địa có `bld_farm_plot` (`PARTY_ACCESS`) và `bld_storage` (`OWNER_ONLY`), **When** thành viên Party thử tưới nước trên luống cây và thử mở `bld_storage`, **Then** thao tác tưới nước thành công, còn thao tác mở `bld_storage` hoặc nâng cấp công trình bị từ chối rõ ràng và ghi nhật ký bảo mật.

---

### User Story 3 - Chăn nuôi 6 Loài Động vật & Mô phỏng Ngoại tuyến Nhân văn (Priority: P2)

Với tư cách là chủ trang trại, tôi muốn mua, đặt tên, cho ăn, vuốt ve và thu hoạch sản phẩm (trứng, sữa, len, nấm cục, tơ ánh trăng) từ 2 loài MVP (`anm_meadow_chicken`, `anm_clover_cow`) và mở rộng sang 4 loài hậu MVP (gồm cả linh thú `anm_lunar_moth_hare`), tận dụng hệ thống tự cho ăn và tự gom ở cấp chuồng cao mà không lo mất trắng đàn thú nếu bận vài ngày không vào game.

**Why this priority**: Hoàn thiện chuỗi sản xuất Nông trại → Chăn nuôi → Bếp/Xưởng → Boss Raid, mang lại chiều sâu nuôi dưỡng lâu dài mà vẫn giữ nguyên triết lý không trừng phạt độc hại.

**Independent Test**: Có thể kiểm thử độc lập bằng cách mua `anm_meadow_chicken` (vào `bld_chicken_coop` Lv 1) và `anm_clover_cow` (vào bãi chăn thả `bld_farm_plot` Lv 2), cho ăn thức ăn yêu thích và vuốt ve để đẩy `Happiness >= 80`, mô phỏng 12 giờ no (trưởng thành `BABY → ADULT` và sinh sản phẩm) và 72 giờ bỏ đói (xác nhận `health` dừng ở sàn `20`, không chết, sản lượng tích tối đa trong trần `24 giờ` / `<= 3` lượt khay chờ).

**Acceptance Scenarios**:

1. **Given** nhân vật có `bld_chicken_coop` Lv 1 (`4` ô trống) và `150 Gold`, **When** mua `anm_meadow_chicken`, cho ăn `mat_sunwheat_grain` (thức ăn yêu thích) và vuốt ve hằng ngày, **Then** máy chủ trừ `150 Gold` nguyên tử, khởi tạo gà con (`BABY`, `hunger = 80`, `happiness = 50`, `health = 100`), sau `6 giờ` no theo đồng hồ máy chủ gà chuyển `ADULT` và cứ mỗi `48 phút` sinh `1–2 mat_fresh_egg` với tỷ lệ `GOLD` tăng từ `0%` lên `22%` khi `Happiness` đạt `80–100`.
2. **Given** chủ nhà rời game `72 giờ` mà không bật `autoFeeder`, **When** chủ nhà quay lại mở chuồng, **Then** mô phỏng offline chỉ tính tối đa `24 giờ` theo đồng hồ máy chủ: `hunger` tụt về `0`, động vật tạm dừng sinh sản phẩm, `happiness` giảm dần và `health` bị chặn sàn tại `20` (tuyệt đối không chết vĩnh viễn); phần sản phẩm đã tạo trước lúc đói vẫn nằm nguyên trong khay chờ thu.
3. **Given** nhân vật sở hữu `anm_clover_cow` trong bãi chăn thả `bld_farm_plot` Lv 2 và sau đó xây `bld_barn` Lv 1, **When** người chơi chọn di dời bò sang `bld_barn`, **Then** bò chuyển chuồng miễn phí mà giữ nguyên `growthStage`, `happiness`, `nickname` và trạng thái sức khỏe.

---

### Edge Cases

- Người chơi chỉnh đồng hồ hệ điều hành tiến trước 10 giờ hoặc lùi về quá khứ: máy chủ hoàn toàn bỏ qua đồng hồ máy khách; mọi phép tính chênh lệch âm bị kẹp về `0` và mọi tiến trình offline bị kẹp cứng tối đa `24 giờ` theo đồng hồ máy chủ.
- Phá dỡ công trình đang chứa tài sản bên trong (`bld_storage` còn đồ, `bld_farm_plot` còn cây sống/chín, `bld_chicken_coop`/`bld_barn` còn động vật) hoặc cố phá dỡ `bld_player_house`: máy chủ chặn tuyệt đối và yêu cầu dọn/di dời trước; `bld_player_house` không bao giờ được phép phá dỡ.
- Gửi đồng thời 3 lệnh mua động vật khi chuồng chỉ còn `1` chỗ trống hoặc 5 lệnh đặt công trình khi nguyên liệu chỉ đủ cho `1` công trình: khóa đồng thời trên dữ liệu lãnh địa, nhân vật và kho đồ đảm bảo chỉ đúng `1` lệnh thành công, các lệnh còn lại thất bại sạch không trừ Gold/nguyên liệu.
- Thu hoạch cây hoặc bấm gom sản phẩm động vật (`COLLECT_PRODUCE`) khi túi đồ không đủ ô trống cho các bậc phẩm chất khác nhau (`NORMAL`/`SILVER`/`GOLD`): giao dịch bị từ chối nguyên tử toàn phần trước khi xóa trạng thái chín hoặc khay chờ để không bao giờ mất nông sản.
- Ép cho động vật ăn liên tục khi đã no (`hunger >= 90`) hoặc vuốt ve nhiều lần trong cùng một ngày trong game (`24 phút` thực) để cày `Happiness`: máy chủ chặn cho ăn khi `hunger >= 90` và chỉ cộng `+10 Happiness` cho lượt vuốt ve đầu tiên của mỗi ngày trong game.
- Di dời công trình (`MOVE_BUILDING`) vào ô có thành viên Party đang đứng: máy chủ tự kiểm tra va chạm thực thể sống và đẩy nhẹ nhân vật sang ô trống an toàn gần nhất bên ngoài footprint mới (hoặc từ chối nếu không có ô trống hợp lệ).
- Máng ăn tự động (`autoFeeder`) hoạt động khi `bld_storage` đã cạn thức ăn, hoặc `autoHarvest`/`autoCollector` chạy khi `bld_storage` đã đầy: hệ thống chuyển sang trạng thái cảnh báo sạch (`FEED_EMPTY` / `STORAGE_FULL`), không phát sinh lỗi sập dịch vụ và giữ nguyên vật phẩm chờ thu thủ công.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI duy trì trạng thái sinh tồn của nhân vật gồm `Hunger` (`0..100`, 5 ngưỡng trạng thái `WELL_FED`..`EXHAUSTED`, không trừ HP về 0, đóng băng khi offline), liên kết tiêu hao/phục hồi `Stamina`, và tối đa `2` Food Buff đồng thời qua 2 kênh (`FOOD_COMBAT`, `FOOD_UTILITY`) với quy tắc ghi đè cùng kênh, hồi chiêu tiêu thụ trên máy chủ và cộng thưởng từ cấp `bld_kitchen` cùng phẩm chất `SILVER`/`GOLD`.
- **FR-002**: Hệ thống PHẢI vận hành đồng hồ thế giới toàn cục theo chuẩn `24 phút` thực mỗi ngày trong game (`DAWN`, `DAY`, `DUSK`, `NIGHT`), `14 ngày` mỗi mùa (`SPRING`, `SUMMER`, `AUTUMN`, `WINTER`) và lưu lịch sử thời tiết (`CLEAR`, `RAIN`, `STORM`, `FOG`, `SNOW`, `HEATWAVE`) trong tối thiểu 24 giờ gần nhất tại tệp JSON cục bộ phục vụ mô phỏng ngoại tuyến.
- **FR-003**: Hệ thống PHẢI hỗ trợ đầy đủ 15 giống cây trồng (`5` MVP) đọc từ nguồn chuẩn duy nhất `game-data/crops.json`, bao gồm 6 thao tác canh tác xác thực máy chủ (`TILL_SOIL`, `PLANT_SEED`, `WATER_TILE`, `APPLY_FERTILIZER`, `HARVEST_CROP`, `CLEAR_WITHERED`), sinh trưởng theo giai đoạn (`4–5` giai đoạn), bón phân (`csm_fertilizer_basic`, `csm_fertilizer_rich`), tạm dừng khi khô (`PAUSED_UNTIL_WATERED`), quy tắc héo đổi mùa (được miễn trừ ở `bld_farm_plot` Lv 4 tốc độ `0.75x`), tái sinh nhiều vụ (`regrowMinutes`), phẩm chất `NORMAL`/`SILVER`/`GOLD`, và tự động tưới/thu hoạch ở Lv 3–4.
- **FR-004**: Hệ thống PHẢI hỗ trợ đầy đủ 6 loài động vật (`2` MVP: `anm_meadow_chicken` trong `bld_chicken_coop` Lv 1+, `anm_clover_cow` tại `bld_farm_plot` Lv 2 hoặc `bld_barn`; `4` hậu MVP trong `bld_barn` Lv 1..3 gồm cả linh thú `anm_lunar_moth_hare`) đọc từ `game-data/animals.json`, quản lý `hunger (0..100)`, `happiness (0..100)`, `health (20..100)` với quy tắc bất biến không chết vĩnh viễn (`permanentDeathAllowed = false`), tiến hóa `BABY → ADULT`, bảng tỷ lệ chất lượng theo hạnh phúc, di dời chuồng miễn phí, tự cho ăn/gom đồ (`autoFeeder`/`autoCollector`) và các thao tác `BUY`, `FEED`, `PET`, `COLLECT`, `HEAL`, `RENAME`, `REASSIGN`, `SELL`.
- **FR-005**: Hệ thống PHẢI thực hiện mô phỏng tiến trình ngoại tuyến (Offline Catch-up Simulation) cho cả cây trồng, động vật và công trình đang xây hoàn toàn bằng chênh lệch đồng hồ máy chủ, áp dụng trần tích lũy tối đa **`24 giờ`** (`86,400,000 ms`), giới hạn khay chờ thủ công `<= 3` lượt/con vật, và tuyệt đối từ chối tin tưởng mốc thời gian phía người chơi.
- **FR-006**: Hệ thống PHẢI lưu trữ bền vững toàn bộ lãnh địa (công trình, ô đất canh tác, động vật) trong tệp JSON cục bộ phân mảnh theo chủ sở hữu (`houses/<characterId>.json`), hỗ trợ đầy đủ 13 công trình (`6` MVP gồm `bld_player_house`, `bld_storage`, `bld_farm_plot`, `bld_chicken_coop`, `bld_blacksmith` Lv 1..4 mở khóa cường hóa `+3/+6/+8/+10`, `bld_kitchen`; `7` hậu MVP) đọc từ `game-data/buildings.json` với biến thể hình ảnh theo từng cấp (`assetVariantKey`).
- **FR-007**: Hệ thống PHẢI cung cấp trải nghiệm đặt công trình với bóng mờ trực quan (Ghost Preview), bám lưới cứng `32×32 px` và xoay hướng (`0°`/`90°` cho công trình `rotatable = true`), đồng thời thực thi 7 lớp kiểm định bắt buộc trên máy chủ trước khi đặt hoặc di dời: quyền sở hữu, vùng cho phép & giới hạn số công trình theo cấp `bld_player_house`, cấm đè đường đi bắt buộc/điểm spawn/vùng quest/đất người khác, cấm chồng chéo footprint, kiểm tra khả năng đi tới mọi điểm tương tác từ cổng vào bằng thuật toán tìm đường tràn lưới (BFS Flood-Fill Reachability), trừ tài nguyên/Gold nguyên tử (hỗ trợ rút tự động từ `bld_storage` Lv 2+), và đếm giờ hoàn tất theo đồng hồ máy chủ.
- **FR-008**: Hệ thống PHẢI hỗ trợ đầy đủ vòng đời quản lý công trình (`PLACE`, `UPGRADE` tuần tự không vượt cấp, `MOVE`, `CANCEL` hoàn `80%` khi đang xây/nâng cấp, `DEMOLISH` hoàn `50%` khi rỗng tài sản và cấm phá `bld_player_house`, `SET_PERMISSION`) với giao dịch đa tệp nguyên tử qua nhật ký ghi trước JSON (WAL), khóa chống trùng lặp (`idempotencyKey`) và sổ cái `CurrencyLedger`.
- **FR-009**: Hệ thống PHẢI thực thi phân quyền công trình nghiêm ngặt trên máy chủ giữa `OWNER_ONLY` (cố định cho `bld_player_house`, `bld_storage`, `bld_blacksmith` và các xưởng cá nhân) và `PARTY_ACCESS` (`bld_farm_plot`, `bld_chicken_coop`, `bld_kitchen`, `bld_barn`, `bld_training_ground`), bảo đảm thành viên Party chỉ được thực hiện hành động hỗ trợ (tưới nước, vuốt ve, cho ăn, nấu tiệc, luyện tập) mà không bao giờ lấy được nông sản, sản phẩm chăn nuôi, đồ trong kho hoặc chỉnh sửa công trình của chủ nhà.
- **FR-010**: Hệ thống PHẢI cung cấp phản hồi giao diện rõ ràng trong thế giới và bảng quản lý (ô lưới xanh/đỏ kèm lý do từ chối khi đặt nhà/canh tác, biểu tượng trạng thái trên đầu động vật và giàn giáo xây dựng, HUD đồng hồ/mùa/thời tiết/độ no/2 ô Food Buff) đồng bộ trạng thái tức thì tới mọi người chơi đang ở trong cùng lãnh địa.

### Key Entities *(include if feature involves data)*

- **SurvivalState**: Trạng thái sinh tồn gắn với nhân vật gồm độ no (`0..100`), mức trạng thái đói, thể lực, cấp/kinh nghiệm Farming, danh sách tối đa `2` Food Buff đang hoạt động và mốc hồi chiêu tiêu thụ thực phẩm.
- **WorldClockState**: Đồng hồ thế giới dùng chung lưu mốc khởi tạo, ngày hiện tại, mùa hiện tại, pha ngày/đêm, phút trong ngày và lịch sử thời tiết 24 giờ gần nhất cho từng khu vực.
- **HomesteadAggregate**: Bản ghi lãnh địa bền vững của mỗi nhân vật lưu kích thước lưới (`32×24 tiles`), vùng bản đồ, danh sách công trình đã xây, các khu ruộng canh tác và đàn vật nuôi.
- **BuildingInstance**: Thực thể công trình đã đặt trong lãnh địa với mã công trình, cấp hiện tại, tọa độ góc lưới, góc xoay, trạng thái (`UNDER_CONSTRUCTION`, `ACTIVE`, `UPGRADING`), phân quyền, biến thể đồ họa và mốc bắt đầu/hoàn tất theo đồng hồ máy chủ.
- **CropPlotTile**: Ô đất canh tác đơn lẻ thuộc một `bld_farm_plot`, lưu trạng thái vòng đời, giống cây, giai đoạn sinh trưởng, tiến độ phút tích lũy, mốc hết ẩm, loại phân bón, số lần tái sinh và mốc mô phỏng gần nhất.
- **AnimalInstance**: Cá thể động vật thuộc chuồng/bãi chăn thả hợp lệ, lưu loài, tên gọi, giai đoạn `BABY`/`ADULT`, tuổi, độ no, hạnh phúc, sức khỏe (`>= 20`), tiến độ sản xuất, khay sản phẩm chờ thu, ngày vuốt ve gần nhất và mốc mô phỏng gần nhất.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `100%` nỗ lực gian lận thời gian bằng cách chỉnh đồng hồ phía người chơi không làm thay đổi tiến độ cây trồng, động vật hay thời gian xây công trình; `100%` kịch bản offline vượt `24 giờ` (ví dụ `72 giờ`) đều bị chặn đúng trần `24 giờ` và giữ tỷ lệ chết vĩnh viễn của động vật bằng `0%`.
- **SC-002**: `100%` yêu cầu đặt hoặc di dời công trình vi phạm đường đi bắt buộc, điểm spawn, vùng nhiệm vụ, chồng lấn footprint hoặc cô lập điểm tương tác bị máy chủ chặn đứng trước khi khấu trừ tài nguyên.
- **SC-003**: Toàn bộ `15` giống cây (`5` MVP), `6` loài động vật (`2` MVP) và `13` công trình (`6` MVP, kể cả `bld_blacksmith` Lv 1..4) khớp `100%` thông số chi phí, thời lượng, sức chứa và bảng tỷ lệ chất lượng với các tệp danh mục chuẩn.
- **SC-004**: `100%` yêu cầu truy cập trái phép từ thành viên Party (thu hoạch hộ, gom sản phẩm chăn nuôi, mở `bld_storage`, nâng cấp/phá dỡ công trình) bị máy chủ từ chối và ghi nhận kiểm toán bảo mật.
- **SC-005**: Thời gian chạy mô phỏng catch-up offline 24 giờ cho một lãnh địa tối đa (`36` ô đất + `24` động vật) và chạy kiểm tra đường đi BFS trên lưới `32×24` hoàn tất trong `< 10 ms` ở RAM (mục tiêu đề xuất — `proposed / unverified`), và toàn bộ giao dịch kinh tế/kho/lãnh địa đạt `0%` nhân bản hoặc mất đồ khi kiểm thử 20 yêu cầu đồng thời hoặc ngắt máy chủ giữa chừng.

## Assumptions

- Hệ thống phụ thuộc trực tiếp vào `001-foundation-game-engine` (`JsonDatabaseEngine`, `GameCatalogLoader`), `002-auth-character` (chủ sở hữu nhân vật), `003-world-movement` (tọa độ trong lãnh địa và đồng bộ vùng), `005-inventory-loot` (kho đồ/túi đồ), và cung cấp dữ liệu `bld_blacksmith.level` cho `007-equipment-enhancement` cũng như trạng thái trạm cho `006-gathering-crafting`.
- Khu vực `zon_player_homestead` có kích thước cố định `32×24 tiles` (`1024×768 px`) chạy dưới dạng không gian riêng cho từng chủ sở hữu (hỗ trợ tối đa chủ nhà + 3 thành viên cùng Party truy cập đồng thời); lô đất mở rộng `zon_greenhaven_farmland` và `bld_guild_hall` tại `zon_guild_sanctuary` được thiết kế sẵn cấu trúc dữ liệu nhưng mở khóa ở các cột mốc hậu MVP (`M2–M3`).
- Các ngưỡng hiệu năng (`< 10 ms` catch-up và BFS) là mục tiêu đề xuất (`proposed / unverified`) và sẽ được xác minh bằng kiểm thử đo lường khi chuyển sang giai đoạn triển khai.
