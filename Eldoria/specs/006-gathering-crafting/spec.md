# Feature Specification: Resource Gathering & Multi-Station Crafting System

**Feature Branch**: `006-gathering-crafting`

**Created**: 2026-11-19

**Status**: Reviewed (Autonomous Design Baseline — Chờ phê duyệt chuyển sang Implementation)

**Input**: User description: "World resource gathering nodes (trees, stone, ore veins, herb patches, fishing spots) with tool-tier/range/stamina/respawn validation and multi-station atomic crafting (smelting, refining, cooking, alchemy, weapon/armor/accessory forging) backed by local JSON storage"

## Clarifications

### Session 2026-11-19 *(Autonomous Design Decisions — Proposed, Chưa có phê duyệt triển khai của người dùng)*

- Q: Tổng số công thức chế tạo chuẩn áp dụng cho cả tầm nhìn dài hạn và giai đoạn MVP là bao nhiêu? → A: Nguồn dữ liệu chuẩn `game-data/recipes.json` định nghĩa **36 công thức** (trong đó **22 công thức MVP** và 14 công thức hậu MVP), trải rộng trên 8 danh mục (`SMELTING`, `REFINING`, `COOKING`, `ALCHEMY`, `UTILITY`, `WEAPON_FORGING`, `ARMOR_CRAFTING`, `ACCESSORY_CRAFTING`), vượt và bao phủ trọn vẹn mức tối thiểu `>= 30` công thức tổng / `>= 14` công thức MVP của tầm nhìn ban đầu để khép kín vòng lặp nấu ăn, giả kim, nung luyện, chế đá granite và rèn trang bị *(Proposed Decision — Constitution Principle III)*.
- Q: Khi hai người chơi cùng khai thác một điểm tài nguyên (`ResourceNode`) chỉ còn đúng `1` lượt trữ lượng, hệ thống xử lý xung đột như thế nào? → A: Máy chủ tuần tự hóa từng yêu cầu theo thứ tự đến trên điểm tài nguyên đó; người chơi được xử lý trước nhận tài nguyên và làm node chuyển sang trạng thái cạn kiệt (`DEPLETED`), người chơi đến sau bị từ chối sạch sẽ với thông báo điểm tài nguyên đã cạn và **không bị trừ Stamina** *(Proposed Decision)*.
- Q: Việc chế tạo có thời gian hoàn thành (`craftTimeSeconds > 0`) hoạt động ra sao để vừa bảo vệ tính nguyên tử dữ liệu vừa giữ trải nghiệm mượt mà? → A: Khi bắt đầu chế tạo một mẻ (`1..50` đơn vị), máy chủ trừ nguyên liệu và Gold nguyên tử ngay lập tức và tạo một lệnh chế tạo (`CraftingJob`) ghi nhận mốc hoàn thành theo đồng hồ máy chủ; người chơi có thể nhận thành phẩm ngay khi đồng hồ máy chủ đạt mốc hoàn thành (các công thức `craftTimeSeconds = 0` hoàn tất tức thì trong một bước). Nếu người chơi hủy lệnh đang chờ chưa hoàn thành, hệ thống hoàn trả `80%` nguyên liệu (làm tròn xuống) và `80%` Gold để tránh lạm dụng hàng đợi chế tạo làm kho đồ phụ *(Proposed Decision)*.
- Q: Rút nguyên liệu tự động từ kho lãnh địa khi chế tạo hoạt động ở điều kiện nào? → A: Khi nhân vật đứng chế tạo tại trạm thuộc lãnh địa riêng và công trình kho lưu trữ (`bld_storage`) đạt từ cấp `2` trở lên, máy chủ tự động ưu tiên trừ nguyên liệu trong túi đồ trước rồi rút phần thiếu từ kho lưu trữ trong cùng một giao dịch nguyên tử; tại trạm công cộng của NPC trong làng chỉ sử dụng nguyên liệu có sẵn trong túi đồ *(Proposed Decision — khớp `game-data/recipes.json` & `game-data/buildings.json`)*.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Khai thác Tài nguyên Thế giới Công bằng và Xác thực Máy chủ (Priority: P1)

Với tư cách là người chơi khám phá làng khởi đầu và khu rừng lân cận, tôi muốn chặt cây, đập đá, đào quặng, hái thảo mộc và câu cá tại các điểm tài nguyên xuất hiện tự nhiên trong thế giới, nhận đúng nguyên liệu tương ứng với bậc công cụ và khu vực để làm đầu vào cho xây dựng, nấu ăn và rèn vũ khí.

**Why this priority**: Khai thác tài nguyên là bước thứ hai trong vòng lặp cốt lõi (`Explore → Gather → Combat → Loot → Craft`), tạo dòng nguyên liệu sơ cấp cho cả chế tạo, nâng cấp nhà cửa và cường hóa vũ khí.

**Independent Test**: Có thể kiểm thử độc lập bằng cách đưa một nhân vật vào khu vực có đủ 5 loại điểm tài nguyên (`TREE`, `STONE`, `ORE_VEIN`, `HERB_PATCH`, `FISHING_SPOT`), thử khai thác ở khoảng cách hợp lệ (`<= 96 px`) với đủ Stamina và đúng bậc công cụ (nhận nguyên liệu, trừ Stamina, giảm lượt trữ lượng và kích hoạt đếm ngược tái sinh khi cạn), đồng thời thử đứng xa `> 96 px` hoặc dùng công cụ cấp thấp hơn yêu cầu (bị máy chủ từ chối mà không mất Stamina hay thay đổi node).

**Acceptance Scenarios**:

1. **Given** nhân vật đang đứng trong khoảng cách `<= 96 px` tới một mỏ quặng đồng (`ORE_VEIN`, `requiredToolTier = 1`, `remainingCharges = 3`), có công cụ bậc `>= 1`, đủ `8 Stamina` và túi đồ còn ô trống, **When** người chơi thực hiện hành động khai thác, **Then** máy chủ trừ đúng `8 Stamina`, giảm `remainingCharges` xuống `2`, cấp nguyên liệu quặng vào túi đồ và cập nhật trạng thái điểm tài nguyên cho mọi người chơi lân cận.
2. **Given** điểm tài nguyên chỉ còn `remainingCharges = 1`, **When** lượt khai thác cuối hoàn tất, **Then** máy chủ đặt `remainingCharges = 0`, đánh dấu trạng thái cạn kiệt với mốc tái sinh theo đồng hồ máy chủ (`180–300 giây` ở làng khởi đầu, `300–480 giây` ở rừng, `600–900 giây` ở vùng cấp cao) và tự động khôi phục khi đến hạn.
3. **Given** nhân vật cố đào mỏ quặng yêu cầu công cụ bậc `2` nhưng chỉ sở hữu công cụ bậc `1`, hoặc đứng cách điểm tài nguyên `150 px`, **When** gửi lệnh khai thác, **Then** máy chủ từ chối với lý do rõ ràng, không trừ Stamina và không giảm trữ lượng của điểm tài nguyên.

---

### User Story 2 - Chế tạo, Luyện kim, Nấu ăn & Giả kim Nguyên tử qua Đa Trạm (Priority: P1)

Với tư cách là người chơi đã thu thập quặng, gỗ, đá, nông sản và chiến lợi phẩm từ quái vật, tôi muốn luyện thỏi kim loại, chế khối đá, nấu món ăn hồi phục/tăng chỉ số, pha thuốc và rèn vũ khí/giáp tại đúng trạm công trình của mình (hoặc trạm NPC công cộng cơ bản) với giao dịch minh bạch, không bao giờ mất oan nguyên liệu hay nhân bản thành phẩm.

**Why this priority**: Chế tạo là mắt xích biến mọi hoạt động thu thập, trồng trọt, chăn nuôi và săn quái thành sức mạnh thực chất (thỏi kim loại cho cường hóa `+1..+10`, thực phẩm buff cho Boss Raid, trang bị hoàn chỉnh).

**Independent Test**: Có thể kiểm thử độc lập bằng cách cung cấp cho nhân vật đủ nguyên liệu và Gold cho các công thức thuộc 8 danh mục trong danh mục công thức chuẩn, đứng trong tầm tương tác `<= 96 px` của trạm tương ứng (hoặc trạm công cộng NPC hợp lệ), thực hiện chế tạo đơn và theo mẻ (`count` từ `1` đến `50`), sau đó kiểm chứng nguyên liệu/Gold bị trừ đúng một lần, sổ cái tiền tệ ghi nhận chính xác, thành phẩm và điểm kinh nghiệm chế tạo được cấp đủ và yêu cầu gửi trùng khóa chống lặp không bao giờ chế tạo hai lần.

**Acceptance Scenarios**:

1. **Given** nhân vật đứng cạnh Lò Rèn cấp `2` (`bld_blacksmith`, khoảng cách `<= 96 px`), đạt cấp nhân vật `>= 10`, có đủ `mat_iron_ingot ×2`, `mat_coal ×3`, `mat_rough_stone ×2` và `80 Gold`, **When** người chơi thực hiện công thức luyện thép (`rcp_smelt_steel_ingot`, `count = 1`), **Then** máy chủ trừ nguyên liệu và `80 Gold` nguyên tử kèm bút toán sổ cái, khởi tạo lệnh chế tạo với thời lượng chuẩn (`12 giây` theo đồng hồ máy chủ) và khi nhận thành phẩm cấp `1 mat_steel_ingot`, `55 EXP` và `1 Crafting Token`.
2. **Given** nhân vật đã nâng cấp Kho lưu trữ (`bld_storage`) lên cấp `2` và đang đứng tại Bếp (`bld_kitchen`) trong lãnh địa, túi đồ trống nhưng kho chứa đủ nguyên liệu nấu `rcp_cook_herb_stew`, **When** người chơi đặt lệnh nấu `2` mẻ, **Then** máy chủ tự động rút đủ nguyên liệu từ kho lưu trữ và trừ `40 Gold` nguyên tử mà không cần chuyển đồ thủ công vào túi.
3. **Given** nhân vật đứng ngoài tầm tương tác (`> 96 px`) của trạm, hoặc trạm chưa đạt `stationLevelReq`, hoặc chưa hoàn thành điều kiện mở khóa công thức (ví dụ chưa hạ `boss_thornback_elder` cho `rcp_forge_elderwood_cleaver`), **When** gửi lệnh chế tạo, **Then** máy chủ từ chối hoàn toàn mà không trừ bất kỳ nguyên liệu hay tiền tệ nào.

---

### User Story 3 - Hàng đợi Chế tạo Nền, Hiệu suất Trạm Lãnh địa & Hỗ trợ Hủy An toàn (Priority: P2)

Với tư cách là người chơi phát triển căn cứ và chế tạo nhiều mẻ nguyên liệu, tôi muốn tận dụng hàng đợi chế tạo của từng công trình, nhận lợi ích tăng tốc/tiết kiệm/thưởng sản lượng từ các công trình chuyên biệt (`bld_furnace`, `bld_kitchen`, `bld_workshop`, `bld_alchemy_lab`) và có thể hủy mẻ đang chờ một cách công bằng nếu đổi ý.

**Why this priority**: Khuyến khích người chơi đầu tư xây dựng và nâng cấp công trình chuyên sâu hậu MVP, đồng thời giữ tính liên tục khi người chơi offline hoặc chuyển khu vực trong lúc lò đang nung.

**Independent Test**: Có thể kiểm thử độc lập bằng cách đặt nhiều mẻ chế tạo tới ngưỡng giới hạn hàng đợi của công trình, mô phỏng tiến thời gian đồng hồ máy chủ (kể cả khi người chơi rời khỏi lãnh địa), xác nhận thưởng tốc độ của lò nung và thưởng sản lượng/tiết kiệm nguyên liệu hoạt động đúng thông số công trình, đồng thời kiểm thử hủy một lệnh đang chờ hoàn trả đúng `80%` nguyên liệu và Gold.

**Acceptance Scenarios**:

1. **Given** nhân vật sở hữu Lò Nung (`bld_furnace`) cấp `1` (`parallelSmeltSlots = 3`, `+20%` tốc độ nung) và đặt `3` mẻ nung đồng song song, **When** nhân vật đặt thêm mẻ thứ `4` khi chưa có mẻ nào hoàn tất, **Then** máy chủ từ chối vượt giới hạn hàng đợi; trong khi `3` mẻ hợp lệ có thời gian hoàn thành rút ngắn đúng `20%` theo đồng hồ máy chủ.
2. **Given** một lệnh chế tạo đang chạy chưa đến mốc hoàn thành theo đồng hồ máy chủ, **When** người chơi chọn hủy lệnh, **Then** máy chủ hoàn trả nguyên tử `80%` nguyên liệu (làm tròn xuống từng loại) và `80%` Gold vào kho/túi, ghi sổ cái hoàn tiền và giải phóng ngay vị trí hàng đợi.
3. **Given** người chơi thoát trò chơi ngay sau khi đặt lệnh nung thép (`12 giây`) và đăng nhập lại sau `5 phút`, **When** người chơi mở lại trạm chế tạo, **Then** lệnh chế tạo đã ở trạng thái sẵn sàng nhận thành phẩm theo đồng hồ máy chủ mà không cần treo máy.

---

### Edge Cases

- Túi đồ đầy khi khai thác tài nguyên hoặc khi bấm nhận thành phẩm chế tạo: máy chủ kiểm tra trước khả năng chứa (tính cả gộp chồng `maxStack` đối với vật phẩm xếp chồng); nếu không đủ chỗ, từ chối an toàn trước khi trừ trữ lượng node hoặc trước khi xóa lệnh chế tạo đang chờ nhận để không bao giờ làm rơi mất vật phẩm.
- Hai yêu cầu chế tạo gửi đồng thời trên cùng nhân vật khi lượng nguyên liệu/Gold chỉ đủ cho đúng 1 mẻ: hệ thống khóa tuần tự trên dữ liệu nhân vật và kho đồ; yêu cầu thứ nhất thành công, yêu cầu thứ hai thất bại do thiếu nguyên liệu/Gold, tuyệt đối không tạo số dư âm hay nhân bản đồ.
- Gửi lại yêu cầu chế tạo với cùng khóa chống trùng lặp (`idempotencyKey`) do mạng chập chờn: hệ thống trả về đúng kết quả đã lưu của giao dịch trước đó trong tối thiểu 24 giờ mà không trừ nguyên liệu hoặc tạo lệnh chế tạo lần thứ hai.
- Số lượng mẻ chế tạo bất hợp lệ (`count <= 0`, `count > 50`, số thập phân) hoặc mã công thức không tồn tại trong danh mục: máy chủ từ chối ngay ở lớp kiểm tra đầu vào và ghi nhận dấu hiệu bất thường nếu lặp lại.
- Công trình trạm chế tạo đang ở trạng thái đang nâng cấp (`UPGRADING`) hoặc chưa hoàn tất xây dựng (`UNDER_CONSTRUCTION`): không cho phép khởi tạo mẻ chế tạo mới cho đến khi công trình trở về trạng thái hoạt động (`ACTIVE`); các mẻ đã hoàn tất trước khi nâng cấp vẫn có thể nhận thành phẩm an toàn.
- Nhân vật bị gián đoạn (nhận sát thương, bị choáng hoặc di chuyển ra ngoài `96 px`) khi đang thực hiện thao tác khai thác: thao tác khai thác bị hủy sạch, không trừ trữ lượng điểm tài nguyên.
- Điểm tài nguyên câu cá (`FISHING_SPOT`) gặp hành vi bấm lặp đều đặn bất thường dạng phần mềm tự động: hệ thống theo dõi thống kê hành vi nội bộ và ghi sự kiện kiểm toán bảo mật để quản trị viên xem xét mà không dùng dịch vụ bên thứ ba.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI lưu trữ bền vững trạng thái các điểm tài nguyên thế giới (`TREE`, `STONE`, `ORE_VEIN`, `HERB_PATCH`, `FISHING_SPOT`) trong tệp dữ liệu JSON cục bộ theo từng khu vực (`world/<regionId>.json`), bao gồm tọa độ ô, bậc công cụ yêu cầu (`0..4`), số lượt trữ lượng còn lại, thời điểm tái sinh theo đồng hồ máy chủ và mã bảng rơi tài nguyên.
- **FR-002**: Hệ thống PHẢI xác thực toàn bộ hành động khai thác tài nguyên trên máy chủ trước khi cấp vật phẩm: nhân vật còn sống và không bị khống chế, khoảng cách Euclidean tới điểm tài nguyên `<= 96 px`, đạt bậc công cụ tối thiểu, đủ Stamina (`8 Stamina` cho chặt cây/đập đá/đào quặng, `4 Stamina` cho hái thảo mộc/câu cá), điểm tài nguyên còn `remainingCharges >= 1`, và túi đồ có đủ chỗ chứa.
- **FR-003**: Hệ thống PHẢI tự động chuyển điểm tài nguyên sang trạng thái cạn kiệt khi `remainingCharges = 0`, thiết lập thời điểm tái sinh theo đồng hồ máy chủ (sơ cấp `180–300 giây`, trung cấp `300–480 giây`, cao cấp `600–900 giây`) và tự động khôi phục đầy trữ lượng khi đến hạn mà không tin thời gian từ phía người chơi.
- **FR-004**: Hệ thống PHẢI nạp toàn bộ danh mục công thức chế tạo từ nguồn dữ liệu chuẩn duy nhất (`game-data/recipes.json` gồm 36 công thức, 22 MVP, 8 danh mục) mà không ghi cứng công thức hay chi phí rải rác trong logic xử lý.
- **FR-005**: Hệ thống PHẢI xác thực đầy đủ điều kiện trước khi cho phép chế tạo: nhân vật đứng trong khoảng cách `<= 96 px` tới trạm công trình thuộc quyền hợp lệ (`stationBuildingId` hoặc `altStationBuildingIds` đạt trạng thái `ACTIVE` với cấp `>= stationLevelReq`) hoặc trạm công cộng NPC hợp lệ (`publicStationNpcId`), đáp ứng điều kiện mở khóa (`DEFAULT`, `PLAYER_LEVEL`, hoặc `BOSS_CLEAR`), số lượng mẻ `count` nguyên dương trong `1..50`, còn vị trí trong hàng đợi trạm, và đủ nguyên liệu lẫn Gold.
- **FR-006**: Hệ thống PHẢI hỗ trợ tự động rút nguyên liệu còn thiếu từ kho lưu trữ lãnh địa (`bld_storage`) khi nhân vật đang chế tạo tại trạm thuộc lãnh địa riêng và `bld_storage` đạt cấp `>= 2`, theo thứ tự ưu tiên trừ từ túi đồ trước rồi mới trừ từ kho lưu trữ.
- **FR-007**: Hệ thống PHẢI thực thi mọi giao dịch chế tạo (khấu trừ nguyên liệu & Gold, khởi tạo lệnh chế tạo, nhận thành phẩm, cộng EXP chế tạo & `CRAFTING_TOKEN`, hủy lệnh hoàn trả `80%`) bên trong khóa đồng thời theo thực thể và giao dịch đa tệp nguyên tử có nhật ký ghi trước bằng JSON cục bộ (WAL), kèm khóa chống trùng lặp (`idempotencyKey`) và bút toán bất biến trong sổ cái tiền tệ (`CurrencyLedger`).
- **FR-008**: Hệ thống PHẢI áp dụng chính xác các hệ số hiệu suất của từng cấp công trình khi chế tạo (tốc độ nung `+20%..+50%` và cơ hội thưởng thỏi của `bld_furnace`, cơ hội khẩu phần đôi của `bld_kitchen`, cơ hội nhân đôi dược phẩm của `bld_alchemy_lab`, tỷ lệ tiết kiệm nguyên liệu `5%..15%` của `bld_workshop`) do máy chủ tính toán 100%.
- **FR-009**: Hệ thống PHẢI cho phép người chơi theo dõi danh sách công thức (lọc theo danh mục/trạm/khả năng chế tạo ngay), tiến độ hàng đợi chế tạo đếm ngược theo đồng hồ máy chủ, và nhận thông báo rõ ràng về nguyên liệu đang thiếu hoặc điều kiện mở khóa chưa đạt.
- **FR-010**: Hệ thống PHẢI phát tín hiệu đồng bộ trạng thái điểm tài nguyên (cạn kiệt/tái sinh) và trạng thái hoạt ảnh thu thập/chế tạo (`MINING`, `WOODCUTTING`, `FISHING`, `CRAFTING`) cho những người chơi trong cùng vùng hiển thị mà không ghi dữ liệu tạm thời xuống đĩa theo từng chu kỳ mô phỏng.

### Key Entities *(include if feature involves data)*

- **ResourceNodeState**: Điểm tài nguyên bền vững gắn với một vùng bản đồ cụ thể, lưu loại tài nguyên, vị trí ô, bậc công cụ tối thiểu, số lượt khai thác tối đa/còn lại, thời lượng và mốc tái sinh, cùng bảng rơi tài nguyên.
- **GatheringAttempt**: Yêu cầu khai thác tạm thời được máy chủ kiểm định theo khoảng cách, bậc công cụ, Stamina và dấu thời gian phục vụ chống gian lận và phát hiện hành vi tự động hóa bất thường.
- **CraftingRecipeRef**: Định nghĩa công thức chỉ đọc nạp từ danh mục chuẩn gồm mã công thức, danh mục, trạm chính/phụ/công cộng, cấp trạm yêu cầu, thời lượng, chi phí Gold, danh sách nguyên liệu, thành phẩm, điều kiện mở khóa và phần thưởng EXP/Token.
- **CraftingJob**: Lệnh chế tạo bền vững thuộc hàng đợi của nhân vật, lưu khóa chống trùng lặp, mã công thức, trạm thực hiện, số lượng mẻ, trạng thái (`IN_PROGRESS`, `READY_TO_CLAIM`, `CLAIMED`, `CANCELLED`), danh sách nguyên liệu & Gold đã khấu trừ, thời điểm bắt đầu và mốc hoàn tất theo đồng hồ máy chủ.
- **CraftingLedgerLink**: Bút toán tài chính bất biến liên kết giao dịch chế tạo hoặc hủy chế tạo với biến động Gold và `CRAFTING_TOKEN` của nhân vật.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `100%` hành động khai thác tài nguyên không hợp lệ (khoảng cách `> 96 px`, thiếu bậc công cụ, thiếu Stamina, node đã cạn hoặc túi đồ đầy) bị máy chủ chặn đứng với `0` thay đổi sai lệch lên túi đồ hoặc trữ lượng node.
- **SC-002**: Toàn bộ `36` công thức trong danh mục chuẩn (`22` công thức MVP) được kiểm chứng tham chiếu nguyên liệu, thành phẩm, trạm và điều kiện mở khóa khớp `100%` với nguồn dữ liệu chuẩn.
- **SC-003**: Trong `50` yêu cầu chế tạo đồng thời khi tài nguyên chỉ đủ cho `1` mẻ, tỷ lệ chi tiêu hai lần hoặc nhân bản thành phẩm là `0%` (đúng `1` giao dịch thành công, số dư Gold/nguyên liệu khớp `100%` sổ cái).
- **SC-004**: Trong kịch bản ngắt máy chủ đột ngột giữa giao dịch chế tạo hoặc nhận thành phẩm, `100%` dữ liệu kho đồ, hàng đợi chế tạo và sổ cái được phục hồi nhất quán sau khi khởi động lại mà không mất nguyên liệu hay tạo thành phẩm trùng lặp.
- **SC-005**: Người chơi mới tại làng khởi đầu có thể tự khai thác gỗ/đá/quặng đồng và hoàn thành mẻ nung đồng đầu tiên cùng món súp thảo mộc đầu tiên trong vòng `< 15 phút` trải nghiệm liền mạch (mục tiêu phản hồi thao tác chế tạo/khai thác p95 `< 100 ms` — `proposed / unverified`).

## Assumptions

- Hệ thống phụ thuộc trực tiếp vào động cơ lưu trữ JSON cục bộ (`001-foundation-game-engine`), phiên nhân vật (`002-auth-character`), vùng bản đồ và vị trí người chơi (`003-world-movement`), cùng cấu trúc túi đồ/vật phẩm (`005-inventory-loot`).
- Các công trình trạm chế tạo của lãnh địa (`bld_blacksmith`, `bld_kitchen`, `bld_storage`, `bld_furnace`, `bld_workshop`, `bld_alchemy_lab`) tuân theo dữ liệu thuộc quyền sở hữu của `008-housing-farming`; trong trường hợp người chơi chưa xây trạm riêng tại nhà, các công thức MVP có khai báo `publicStationNpcId` (`npc_smith_garrik`, `npc_village_herbalist`, `npc_village_tailor`) vẫn khả dụng tại làng khởi đầu.
- Bảng rơi tài nguyên (`lootTableId`) của từng `ResourceNodeState` nằm trong bộ catalog tĩnh cục bộ và không gọi dịch vụ ngoài.
- Các mục tiêu độ trễ phản hồi `< 100 ms` và mức chịu tải đồng thời là giả định thiết kế đề xuất (`proposed / unverified`) sẽ được đo kiểm ở giai đoạn triển khai.
