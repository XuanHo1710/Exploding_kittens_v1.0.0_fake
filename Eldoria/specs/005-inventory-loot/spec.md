# Feature Specification: Authoritative Inventory, Ground Loot & Atomic Currency Ledger

**Feature Branch**: `005-inventory-loot`

**Created**: 2026-11-19

**Status**: Reviewed (Autonomous Design Baseline — Chờ phê duyệt chuyển sang Implementation)

**Input**: User description: "Per-character JSON inventory (40-120 bag slots, 0-200 storage slots), globally unique item instances with ownership verification, RAM ground loot with 120s TTL and anti-ninja-loot protection, and atomic WAL 5-currency ledger"

## Clarifications

### Session 2026-11-19 *(Autonomous Design Decisions — Proposed, Chưa có phê duyệt triển khai của người dùng)*

- Q: Quy tắc chia chiến lợi phẩm mặc định khi nhiều người chơi đánh quái hoặc Boss trong Co-op là gì? → A: Mặc định **`PERSONAL_INSTANCED`** (mỗi người chơi đủ điều kiện đóng góp nhận bản thể vật phẩm rơi riêng không bị người khác cướp); chế độ tổ đội `ROUND_ROBIN` là tùy chọn phụ khi cả tổ đội đồng ý *(Proposed Decision — `data-dictionary.md`, `loot-tables.json`)*.
- Q: Sức chứa kho rương cá nhân (`storageCapacity`) được mở rộng như thế nào khi nâng cấp nhà kho? → A: Khởi đầu `0` ô rương (chỉ có `40` ô túi đồ mang theo); xây và nâng cấp `bld_storage` mở rộng sức chứa rương cá nhân trong khoảng `40..200` ô (và túi đồ mang theo mở rộng tối đa `120` ô qua các cột mốc nâng cấp) *(Proposed Decision — đồng bộ `data-dictionary.md` & `buildings.json`; phần ô dùng chung tài khoản để dành cho giai đoạn mở rộng M3+)*.
- Q: Điều gì xảy ra khi người chơi bấm nhặt vật phẩm rơi dưới đất nhưng túi đồ đã đầy `100%`? → A: Hệ thống từ chối nhặt với thông báo túi đầy, **giữ nguyên vật phẩm trên mặt đất** (không xóa mất và không tự động hủy) trong phần thời gian còn lại của `120 giây` để người chơi dọn túi hoặc bán bớt đồ rồi nhặt lại *(Proposed Decision)*.
- Q: Người chơi có thể bán hoặc chuyển vật phẩm sang người chơi khác trong MVP không? → A: Trong MVP, mọi vật phẩm đều mặc định khóa nhân vật (`bound = true`), người chơi có thể bán vật phẩm không khóa nhiệm vụ cho NPC để nhận Gold (ghi nhận qua sổ cái bất biến); giao dịch giữa người chơi (Player-to-Player Trade / Marketplace) thuộc lộ trình giai đoạn sau *(Proposed Decision — `data-dictionary.md` & `GAME_DESIGN_BRIEF`)*.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Quản lý Kho đồ Túi/Rương An toàn & Chống Nhân bản Vật phẩm (Priority: P1)

Với tư cách là người chơi, tôi muốn quản lý túi đồ mang theo (`40–120` ô) và rương chứa tại căn cứ (`0–200` ô) bằng các thao tác di chuyển, gộp chồng, tách chồng, sắp xếp, cất/lấy đồ và sử dụng nhanh vật phẩm tiêu hao mà không bao giờ xảy ra lỗi mất đồ, nhân bản vật phẩm hay bị người khác truy cập trái phép kho của tôi.

**Why this priority**: Toàn vẹn vật phẩm là xương sống của mọi hệ thống thu thập, chế tạo, cường hóa và kinh tế; chỉ một lỗ hổng nhân bản vật phẩm sẽ phá hỏng hoàn toàn nền kinh tế multiplayer.

**Independent Test**: Có thể kiểm thử độc lập bằng cách tạo một nhân vật có kho đồ mẫu trong tệp JSON cục bộ, thực hiện hàng loạt thao tác di chuyển, tách chồng, gộp chồng, cất rương, dùng bình máu và bắn đồng thời 20 yêu cầu tách/cất trên cùng một món đồ để xác nhận tổng số lượng bảo toàn `100%`, không xuất hiện mã định danh vật phẩm trùng lặp và tài khoản khác bị chặn tuyệt đối.

**Acceptance Scenarios**:

1. **Given** nhân vật sở hữu `40` ô túi đồ và một chồng `20` `mat_oak_wood`, **When** người chơi tách `8` đơn vị sang một ô trống hợp lệ, **Then** máy chủ tạo một bản thể vật phẩm mới có mã định danh toàn cục duy nhất (`UUIDv7`), ô cũ còn đúng `12`, ô mới có đúng `8`, tổng số lượng bảo toàn chính xác `20` và lưu nguyên tử vào tệp JSON kho đồ của nhân vật.
2. **Given** nhân vật đang đứng trong tầm tương tác `<= 96 px` của `bld_storage` thuộc căn cứ riêng mình, **When** người chơi chuyển vật phẩm giữa túi đồ và rương chứa (kể cả khi gửi 20 yêu cầu song song), **Then** máy chủ khóa tuần tự kho nhân vật, giữ nguyên quyền sở hữu và bảo toàn chính xác tổng số vật phẩm với `0` bản sao trùng mã định danh.
3. **Given** nhân vật mang bình hồi máu `csm_hp_potion_small` và hết thời gian chờ bình (`5,000 ms`), **When** người chơi kích hoạt dùng nhanh, **Then** máy chủ trừ đúng `1` đơn vị nguyên tử, áp dụng hồi HP và khóa hồi chiêu bình `5,000 ms` (từ chối nếu gửi lặp sớm hơn hoặc với mã trùng lặp).

---

### User Story 2 - Rơi Chiến lợi phẩm Công bằng & Nhặt đồ Chống Cướp (Anti-Ninja-Loot) (Priority: P1)

Với tư cách là người chơi thám hiểm một mình hoặc đi tổ đội Co-op, tôi muốn khi hạ quái vật, tinh anh hoặc Boss, máy chủ tự quay thưởng minh bạch từ bảng rơi đồ chuẩn, tạo vật phẩm rơi riêng thuộc quyền nhặt của tôi (`PERSONAL_INSTANCED`) tồn tại `120 giây`, và chỉ cho phép tôi nhặt khi đứng trong tầm `<= 96 px`.

**Why this priority**: Khép kín vòng lặp `Combat → Loot → Craft/Upgrade` một cách công bằng, loại bỏ hoàn toàn xung đột cướp đồ và gian lận nhặt xuyên bản đồ trong multiplayer.

**Independent Test**: Mô phỏng hạ gục `mob_moss_slime`, `mob_timber_wolf` và `boss_thornback_elder` với tổ đội 2 người; kiểm tra bảng rơi đồ tuân theo đúng thứ tự 4 bước (Gold → Guaranteed → Independent → Exclusive Pool), người chơi A không thể nhặt vật phẩm rơi thuộc quyền người chơi B, nhặt từ khoảng cách `> 96 px` bị từ chối và vật phẩm tự biến mất sau `120 giây`.

**Acceptance Scenarios**:

1. **Given** quái vật hoặc Boss vừa bị hạ gục với danh sách nhân vật đóng góp hợp lệ, **When** máy chủ quay bảng rơi đồ chuẩn (`game-data/loot-tables.json`), **Then** hệ thống tạo các vật phẩm rơi tạm thời trong bộ nhớ vùng với quyền `PERSONAL_INSTANCED` riêng cho từng nhân vật đủ điều kiện và hạn tồn tại đúng `120 giây` (tuyệt đối không ghi đĩa khi đồ còn nằm trên đất).
2. **Given** một vật phẩm rơi thuộc quyền của nhân vật A đang nằm ở khoảng cách `<= 96 px`, **When** nhân vật A gửi lệnh nhặt đồ (và túi còn chỗ), **Then** máy chủ đánh dấu đã nhặt nguyên tử để chống nhặt 2 lần, cộng vật phẩm (hoặc cộng Gold qua sổ cái tiền tệ) vào tệp JSON bền vững của A và gỡ vật phẩm khỏi mặt đất.
3. **Given** nhân vật B cố gửi lệnh nhặt vật phẩm thuộc quyền riêng của A hoặc nhân vật A gửi lệnh nhặt khi đang đứng cách `300 px`, **When** máy chủ xác thực, **Then** lệnh bị bác bỏ hoàn toàn, vật phẩm giữ nguyên trên mặt đất và ghi nhận cảnh báo chống gian lận.

---

### User Story 3 - Sổ cái 5 Loại Tiền tệ Nguyên tử Bất biến & Giao dịch NPC Minh bạch (Priority: P2)

Với tư cách là người chơi và nhà vận hành kinh tế trò chơi, tôi muốn mọi biến động của cả 5 loại tiền tệ (`GOLD`, `STARLIGHT_SHARD`, `CRAFTING_TOKEN`, `BOSS_TOKEN`, `STAR_ESSENCE`) — từ nhặt Gold, bán vật phẩm cho NPC, thưởng nhiệm vụ cho đến chi tiêu chế tạo, cường hóa, xây dựng và quay gacha — đều được ghi nhận nguyên tử cùng lúc vào số dư nhân vật và sổ cái chỉ ghi thêm theo tháng để đảm bảo số dư không bao giờ âm và truy vết đối soát được 100%.

**Why this priority**: Ngăn triệt để lỗi chi tiêu hai lần (double spending), số dư âm và thất thoát tiền tệ, đồng thời cung cấp dữ liệu thực để theo dõi lạm phát nền kinh tế.

**Independent Test**: Thực hiện chuỗi giao dịch cộng/trừ trên cả 5 loại tiền tệ (nhặt Gold, bán đồ cho NPC, chi tiêu song song vượt số dư hiện có, phát lại cùng khóa chống trùng lặp và mô phỏng sập máy chủ giữa giao dịch); xác nhận không bao giờ phát sinh số dư âm, mọi bút toán thỏa `balanceBefore + delta === balanceAfter >= 0` và tổng delta trên sổ cái khớp tuyệt đối với số dư hiện tại.

**Acceptance Scenarios**:

1. **Given** nhân vật có `500 GOLD` và bán `10` `mat_slime_gel` cho NPC hợp lệ trong tầm tương tác, **When** giao dịch bán được thực thi kèm khóa chống trùng lặp (`idempotencyKey`), **Then** hệ thống đồng thời trừ vật phẩm trong tệp kho đồ, cộng đúng `10 × sellPriceGold` vào số dư nhân vật và ghi thêm đúng 1 bút toán vào sổ cái tháng hiện hành trong cùng một giao dịch nguyên tử.
2. **Given** nhân vật có `500 GOLD`, **When** hai yêu cầu chi tiêu `400 GOLD` khác nhau gửi tới cùng thời điểm, **Then** khóa tuần tự chỉ cho phép đúng 1 giao dịch thành công (số dư còn `100 GOLD`), giao dịch thứ hai thất bại sạch sẽ với lỗi không đủ tiền và số dư không bao giờ âm.
3. **Given** một yêu cầu cộng hoặc trừ tiền đã hoàn tất với một `idempotencyKey` cụ thể, **When** cùng yêu cầu đó được phát lại nhiều lần trong vòng `24 giờ`, **Then** hệ thống trả lại kết quả giao dịch ban đầu mà không thay đổi số dư hay ghi thêm bút toán lần thứ hai.

---

### Edge Cases

- **Túi đồ đầy khi nhặt GroundLoot hoặc rút đồ từ rương**: Hệ thống trả mã lỗi túi đầy, giữ nguyên vật phẩm ở vị trí gốc (trên mặt đất hoặc trong rương) để không bao giờ làm mất đồ của người chơi.
- **Hai lệnh nhặt cùng một `GroundLoot` đến đồng thời trong cùng 1 mili-giây**: Cờ chiếm quyền nguyên tử trong bộ nhớ (`claimed`) bảo đảm tối đa đúng 1 lệnh vượt qua bước kiểm tra trước khi thực hiện giao dịch ghi tệp JSON; lệnh còn lại nhận thông báo vật phẩm không còn tồn tại.
- **Số lượng yêu cầu bằng `0`, số âm hoặc vượt `maxStack`**: Mọi thao tác tách chồng, bán NPC, cộng/trừ vật phẩm đều từ chối số nguyên ngoài khoảng `[1..maxStack]` ngay tại cửa kiểm tra đầu vào chống gian lận đảo dấu tiền tệ.
- **Cố bán hoặc vứt vật phẩm đang mặc trên người hoặc vật phẩm nhiệm vụ khóa**: Hệ thống chặn bán/xóa vật phẩm đang gắn ở bất kỳ ô trang bị nào (yêu cầu tháo trước) và chặn bán các vật phẩm có cờ không thể bán.
- **Vật phẩm rơi trên mặt đất quá `120 giây` không có người nhặt**: Bộ dọn dẹp chu kỳ của vùng tự động gỡ bỏ khỏi bộ nhớ vùng và phát tín hiệu xóa hiển thị cho người chơi trong khu vực để tránh rò rỉ bộ nhớ.
- **Ngắt tiến trình giữa giao dịch bán đồ hoặc nhặt Gold (đa tệp `inventory` + `character` + `currency-ledger`)**: Nhờ nhật ký ghi trước cục bộ (WAL JSON), khi khởi động lại hệ thống khôi phục nhất quán cả 3 tệp đích — không bao giờ xảy ra tình trạng mất vật phẩm mà chưa nhận Gold hoặc ngược lại.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI lưu trữ kho đồ riêng của từng nhân vật dưới dạng tệp JSON cục bộ phân mảnh (`inventories/<characterId>.json`), hỗ trợ sức chứa túi đồ từ `40` đến `120` ô và sức chứa rương nhà từ `0` đến `200` ô (mở khóa qua `bld_storage`), tách biệt với hồ sơ nhân vật để giảm tranh chấp khóa.
- **FR-002**: Hệ thống PHẢI cấp phát mã định danh duy nhất toàn cục không bao giờ tái sử dụng (`UUIDv7`) cho mỗi bản thể vật phẩm (`ItemInstance`), gán chặt quyền sở hữu (`ownerCharacterId`), xác thực mã vật phẩm đối chiếu danh mục chuẩn (`157` vật phẩm) và bảo đảm không tồn tại trùng `slotIndex` hay trùng `instanceId` trong toàn bộ túi và rương.
- **FR-003**: Hệ thống PHẢI hỗ trợ đầy đủ thao tác kho đồ an toàn tại máy chủ: di chuyển/hoán đổi ô, gộp chồng (theo `stackable` và `maxStack`), tách chồng, sắp xếp gọn, chuyển túi ↔ rương (kiểm tra quyền chủ sở hữu và khoảng cách `<= 96 px` tới `bld_storage`), sử dụng vật phẩm tiêu hao (áp cooldown bình `5,000 ms`, tối đa `2` buff món ăn) và bán vật phẩm cho NPC.
- **FR-004**: Hệ thống PHẢI quản lý vật phẩm rơi trên mặt đất (`GroundLoot`) hoàn toàn trong bộ nhớ vùng với hạn tồn tại `120 giây`, mặc định chế độ chống cướp đồ `PERSONAL_INSTANCED` (hỗ trợ tùy chọn tổ đội `ROUND_ROBIN`), quay rơi đồ bằng bộ sinh ngẫu nhiên an toàn trên máy chủ theo đúng trình tự 4 bước từ `62` bảng rơi đồ chuẩn (`18` bảng MVP) và trần thưởng `LUK` tối đa `+25%`.
- **FR-005**: Hệ thống PHẢI xác thực nghiêm ngặt mọi lệnh nhặt đồ tại máy chủ: kiểm tra `lootId` tồn tại và chưa bị chiếm quyền (`claimed = false`), kiểm tra người nhặt nằm trong danh sách đủ điều kiện (`eligibleCharacterIds`), kiểm tra khoảng cách Euclidean `<= 96 px` và kiểm tra chỗ trống túi đồ trước khi ghi nguyên tử vào kho JSON.
- **FR-006**: Hệ thống PHẢI cung cấp dịch vụ ví và sổ cái tiền tệ nguyên tử cho đủ 5 loại tiền tệ chuẩn (`GOLD`, `STARLIGHT_SHARD`, `CRAFTING_TOKEN`, `BOSS_TOKEN`, `STAR_ESSENCE`), lưu sổ cái chỉ ghi thêm theo tháng (`ledgers/currency-ledger-YYYY-MM.json`) với bất biến bắt buộc `delta != 0`, `balanceBefore >= 0` và `balanceAfter === balanceBefore + delta >= 0`.
- **FR-007**: Mọi giao dịch làm thay đổi kho đồ và/hoặc tiền tệ PHẢI thực thi bên trong khóa tuần tự theo thứ tự cố định, kiểm tra khóa chống trùng lặp (`idempotencyKey`, lưu tối thiểu `24 giờ`), cập nhật số phiên bản chống ghi đè đồng thời và cam kết đa tệp qua nhật ký ghi trước JSON cục bộ (WAL) để chặn tuyệt đối nhân bản vật phẩm và chi tiêu hai lần.
- **FR-008**: Hệ thống PHẢI đồng bộ thay đổi kho đồ và số dư tiền tệ về client theo dạng bản vá gọn (patch gồm `added`, `updated`, `removed`, `currencies` và `revision`) sau mỗi giao dịch hợp lệ, đồng thời ghi nhật ký bảo mật đối với mọi hành vi truy cập trái chủ sở hữu, nhặt đồ quá tầm hoặc truyền số lượng âm.

### Key Entities *(include if feature involves data)*

- **InventoryAggregate**: Kho chứa cá nhân của một nhân vật lưu trong tệp JSON riêng gồm sức chứa túi (`40..120`), sức chứa rương (`0..200`), danh sách vật phẩm trong túi và danh sách vật phẩm trong rương.
- **ItemInstance**: Một ô/bản thể vật phẩm cụ thể mang mã định danh toàn cục `UUIDv7`, mã danh mục vật phẩm, chủ sở hữu, số lượng, vị trí ô, cấp cường hóa, độ bền, dòng phụ, ngọc khảm, chất lượng và cờ khóa nhân vật.
- **GroundLoot**: Thực thể vật phẩm hoặc vàng rơi tạm thời trong bộ nhớ vùng chiến đấu kèm tọa độ, danh sách nhân vật được phép nhặt, quy tắc chia đồ, mốc hết hạn `120 giây` và cờ chống nhặt trùng.
- **CurrencyWallet**: Số dư hiện tại không âm của 5 loại tiền tệ (`GOLD`, `STARLIGHT_SHARD`, `CRAFTING_TOKEN`, `BOSS_TOKEN`, `STAR_ESSENCE`) nhúng trong hồ sơ nhân vật.
- **CurrencyLedgerEntry**: Bút toán kế toán bất biến theo tháng liên kết mã giao dịch WAL, khóa chống lặp, nhân vật, loại tiền tệ, mức biến động, số dư trước/sau, mã lý do và siêu dữ liệu đối soát.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Trong `100` kịch bản bắn `20` yêu cầu đồng thời tách chồng, chuyển túi ↔ rương và bán đồ trên cùng một vật phẩm, tỷ lệ phát sinh nhân bản vật phẩm hoặc lệch tổng số lượng bằng `0%` và có đúng `0` mã `instanceId` bị trùng lặp.
- **SC-002**: `100%` nỗ lực nhặt đồ ngoài phạm vi `96 px`, nhặt vật phẩm thuộc quyền người chơi khác trong chế độ `PERSONAL_INSTANCED` hoặc truy cập kho đồ của tài khoản khác bị máy chủ từ chối và ghi nhận nhật ký bảo mật.
- **SC-003**: Qua `1,000` giao dịch kinh tế hỗn hợp (nhặt Gold, bán NPC, trừ tiền song song, phát lại cùng `idempotencyKey` và mô phỏng ngắt máy chủ giữa chừng), `100%` bút toán thỏa `balanceBefore + delta === balanceAfter >= 0` và tổng delta sổ cái khớp tuyệt đối `100%` với số dư hiện hành của mọi nhân vật.
- **SC-004**: `100%` vật phẩm rơi chưa được nhặt tự động giải phóng khỏi bộ nhớ vùng sau đúng `120 giây` mà không tạo ra lượt ghi ổ đĩa nào trong thời gian nằm trên mặt đất; thời gian hoàn tất một giao dịch nhặt đồ/chuyển kho đơn nhân vật đạt mục tiêu `p95 < 15 ms` trên ổ đĩa NVMe cục bộ (`proposed / unverified`).

## Assumptions

- Tính năng này sử dụng trực tiếp nền tảng lưu trữ tệp JSON cục bộ (nhật ký ghi trước WAL, khóa tuần tự, khóa chống lặp `idempotencyKey`, chỉ mục) của `001-foundation-game-engine`, hồ sơ nhân vật của `002-auth-character`, tọa độ vùng của `003-world-movement` và sự kiện hạ gục quái/Boss từ `004-combat-skills`.
- Cả 5 loại tiền tệ đều được quản lý qua giao diện nghiệp vụ chuẩn duy nhất từ `005-inventory-loot` để các tính năng chế tạo (`006`), cường hóa (`007`), xây dựng (`008`), gacha (`009`) và Boss Raid (`011`) dùng chung một sổ cái thống nhất không tự ý sửa số dư trực tiếp.
- Mục tiêu độ trễ ghi giao dịch JSON (`p95 < 15 ms` ở 50 CCU) là ước tính thiết kế (`proposed / unverified`) và có phương án chuyển phân mảnh sổ cái từ theo tháng sang theo ngày nếu tải đo thực tế vượt ngưỡng.
