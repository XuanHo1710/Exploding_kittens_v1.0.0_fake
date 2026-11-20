# Feature Specification: Fair In-Game Gacha, Pity & Hero/Weapon Collection System

**Feature Branch**: `009-gacha-collection`

**Created**: 2026-11-19

**Status**: Reviewed (Autonomous Design Baseline — Chờ phê duyệt chuyển sang Implementation)

**Input**: User description: "Fair 100% in-game currency Starlight Shard character and weapon gacha banners (permanent MVP + limited banner architecture), full public rate disclosure summing to 1.000000, soft/hard pity, 10-pull EPIC+ guarantee, transparent duplicate conversion to Constellation and Star Essence shop, hero/weapon collection codex, and atomic anti-concurrent-pull execution"

## Clarifications

### Session 2026-11-19 *(Autonomous Design Decisions — Proposed, Chưa có phê duyệt triển khai của người dùng)*

- Q: Nguồn tiền tệ quay Gacha trong phiên bản MVP có tích hợp thanh toán tiền thật hoặc cơ chế quy đổi ra tiền hay không? → A: Tuyệt đối KHÔNG. Toàn bộ hệ thống Gacha trong MVP chỉ sử dụng `100%` tiền tệ nội tệ **`STARLIGHT_SHARD`** kiếm trực tiếp qua nhiệm vụ, khám phá bản đồ, thành tựu và hạ Boss lần đầu/hàng tuần (`160 STARLIGHT_SHARD` mỗi lượt đơn, `1,600 STARLIGHT_SHARD` mỗi gói 10 lượt); không có thanh toán tiền thật và không có cơ chế đổi thưởng thành tiền *(Mandated by Constitution Principle VI & ADR-005)*.
- Q: Chính sách bảo vệ người chơi không may mắn (Pity) và phân bổ xác suất tại ngưỡng Soft/Hard Pity được tính chính xác như thế nào? → A: Banner Nhân vật Thường trực (`bnr_perm_heroes`) áp dụng **Soft Pity** từ lượt `65` (`+6.0%`/lượt) và **Hard Pity** bảo đảm tại lượt **`80`**; Banner Vũ khí Thường trực (`bnr_perm_arsenal`) áp dụng **Soft Pity** từ lượt `55` (`+6.5%`/lượt) và **Hard Pity** bảo đảm tại lượt **`70`**. Phần xác suất nhóm trên cùng phân bổ nội bộ `25% MYTHIC` / `75% LEGENDARY`, các bậc dưới co tỷ lệ đều để tổng xác suất luôn bằng đúng `1.000000`; ngoài ra bộ đếm `epicPity = 10` bảo đảm tối đa mỗi `10` lượt nhận ít nhất `1` kết quả bậc `EPIC` trở lên *(Proposed Decision — ASM-009, khớp `game-data/gacha-banners.json`)*.
- Q: Khi túi đồ gần đầy (ví dụ chỉ còn `4` ô trống) nhưng người chơi bấm quay `10` lượt trên Banner Vũ khí, hệ thống xử lý thế nào? → A: Máy chủ kiểm tra sức chứa tối thiểu trước khi quay (`10` ô trống cho gói 10 lượt trên Banner Vũ khí, `1` ô trống cho lượt đơn); nếu không đủ ô trống, từ chối giao dịch nguyên tử trước khi trừ `STARLIGHT_SHARD` để bảo đảm không bao giờ mất vũ khí vừa quay ra *(Proposed Decision)*.
- Q: Trạng thái Pity của các Banner Giới hạn (Limited Banner ở giai đoạn mở rộng) có bị xóa trắng khi hết mùa 21 ngày không? → A: KHÔNG. Mọi banner chia sẻ chung một `sharedPityGroup` (`LIMITED_CHARACTER` hoặc `LIMITED_WEAPON`) tự động bảo lưu vĩnh viễn cả `pityCounter`, `epicPityCounter` và cờ bảo đảm `50/50` (`guaranteedFeatured`) sang chu kỳ Limited Banner kế tiếp *(Proposed Decision — khớp `game-data/gacha-banners.json`)*.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Quay Banner Nhân vật & Vũ khí Thường trực Công bằng 100% Nội tệ (Priority: P1)

Với tư cách là người chơi kiếm được `STARLIGHT_SHARD` từ nhiệm vụ, khám phá và đánh Boss, tôi muốn xem đầy đủ bảng tỷ lệ xác suất công khai và tiến độ Pity hiện tại của mình trên 2 banner thường trực (`bnr_perm_heroes` và `bnr_perm_arsenal`), sau đó thực hiện quay `1` lần (`160`) hoặc `10` lần (`1,600`) với kết quả ngẫu nhiên công bằng từ máy chủ, bảo đảm ít nhất 1 `EPIC+` mỗi 10 lượt và không bao giờ bị mất tiền oan khi bấm nhanh nhiều lần.

**Why this priority**: Thực thi trực tiếp Nguyên tắc VI (Fair Progression & Non-Predatory Gacha) và cung cấp động lực sưu tầm dài hạn lành mạnh từ nguồn tiền tệ kiếm qua gameplay.

**Independent Test**: Có thể kiểm thử độc lập bằng cách kiểm tra màn hình công khai xác suất (tổng xác suất bằng đúng `1.000000`), thực hiện quay 1 lượt và 10 lượt với đủ `STARLIGHT_SHARD`, xác nhận Hard Pity nổ chắc chắn ở lượt `80` (nhân vật) / `70` (vũ khí), Soft Pity tăng tuyến tính từ `65` / `55`, mỗi 10 lượt có ít nhất 1 `EPIC+`, và bắn `20` yêu cầu quay 10 lượt đồng thời khi chỉ đủ `1,600 STARLIGHT_SHARD` (chỉ đúng `1` yêu cầu thành công, số dư cuối `= 0`).

**Acceptance Scenarios**:

1. **Given** nhân vật sở hữu `1,600 STARLIGHT_SHARD` và `pityCounter = 0` trên `bnr_perm_heroes`, **When** người chơi thực hiện lệnh quay `10` lần, **Then** máy chủ trừ đúng `1,600 STARLIGHT_SHARD`, sinh `10` kết quả bằng bộ sinh số ngẫu nhiên an toàn mật mã trên máy chủ, bảo đảm có tối thiểu `1` nhân vật bậc `EPIC` trở lên, cập nhật chính xác `pityCounter`, ghi lịch sử quay và bút toán sổ cái tiền tệ trong cùng một giao dịch nguyên tử.
2. **Given** nhân vật đang có `pityCounter = 79` trên `bnr_perm_heroes` (hoặc `69` trên `bnr_perm_arsenal`), **When** người chơi thực hiện `1` lượt quay kế tiếp, **Then** lượt thứ `80` (hoặc `70`) chắc chắn trả về phần thưởng bậc `LEGENDARY` (`75%`) hoặc `MYTHIC` (`25%`) và đặt lại `pityCounter = 0`.
3. **Given** người chơi mở giao diện bất kỳ banner nào đang hoạt động, **When** xem bảng chi tiết xác suất, **Then** hệ thống hiển thị công khai đầy đủ xác suất nền của cả 6 bậc độ hiếm (tổng bằng `100.00%`), mốc Soft/Hard Pity, tiến độ `pityCounter / hardPity` hiện tại của chính nhân vật, quy tắc chuyển đổi trùng lặp và danh sách toàn bộ phần thưởng trong bể quay mà không che giấu thông số nào.

---

### User Story 2 - Chuyển đổi Trùng lặp Minh bạch, Cửa hàng `STAR_ESSENCE` & Sổ tay Bộ sưu tập (Priority: P1)

Với tư cách là người chơi sưu tầm nhân vật và binh khí, tôi muốn mỗi nhân vật hoặc vũ khí quay trùng đều chuyển hóa thành giá trị phát triển rõ ràng (tăng bậc `Constellation 0..6`, tích lũy `STAR_ESSENCE`, giữ vũ khí trùng để trang bị/tinh luyện/phân rã), cho phép tôi đổi trực tiếp nhân vật hoặc vũ khí mục tiêu trong Cửa hàng `STAR_ESSENCE` và theo dõi toàn bộ tiến độ sưu tầm trong Sổ tay (Codex).

**Why this priority**: Loại bỏ cảm giác "quay trùng vô nghĩa", cung cấp lưới an toàn tuyệt đối chống xui xẻo và kết nối hệ thống Gacha với hành trình phát triển nhân vật & rèn vũ khí.

**Independent Test**: Có thể kiểm thử độc lập bằng cách mô phỏng quay ra nhân vật đã sở hữu ở mốc `Constellation < 6` (tăng `+1` Constellation + cộng `STAR_ESSENCE`), quay trùng vượt `C6` (nhận gấp đôi `STAR_ESSENCE` + `mat_starlight_dust`), quay ra vũ khí trùng (vẫn giữ nguyên bản thể vũ khí trong kho + cộng `STAR_ESSENCE` & `CRAFTING_TOKEN`), dùng `STAR_ESSENCE` đổi mục tiêu hợp lệ trong cửa hàng cố định (tôn trọng giới hạn tháng `limitPerMonth`), và kiểm tra Sổ tay cập nhật chính xác trạng thái đã mở khóa.

**Acceptance Scenarios**:

1. **Given** nhân vật đã sở hữu `chr_kael_vanguard` ở bậc `Constellation = 2`, **When** lượt quay trả ra thêm `chr_kael_vanguard` (`RARE`), **Then** hệ thống tăng `Constellation` lên `3` (trần `6`) và cộng ngay `12 STAR_ESSENCE` kèm bút toán sổ cái.
2. **Given** nhân vật đã đạt trần `Constellation = 6` cho `chr_mira_ironfist` (`COMMON`), **When** quay ra thêm bản sao `chr_mira_ironfist`, **Then** hệ thống giữ nguyên `Constellation = 6`, cộng gấp đôi `4 STAR_ESSENCE` và cấp thêm `1 mat_starlight_dust` vào túi đồ.
3. **Given** nhân vật tích lũy đủ `200 STAR_ESSENCE` và chưa chạm `limitPerMonth = 1` của ưu đãi `shop_ess_elderwood_cleaver`, **When** người chơi chọn đổi trong Cửa hàng `STAR_ESSENCE`, **Then** máy chủ trừ nguyên tử `200 STAR_ESSENCE`, cấp vũ khí `wpn_elderwood_cleaver` (`+0`) vào túi đồ, ghi sổ cái tiền tệ và đánh dấu đã đạt hạn mức tháng cho ưu đãi đó.

---

### User Story 3 - Kiến trúc Banner Giới hạn (Limited Banner), Lịch sử Quay Minh bạch & Chống Gian lận Đồng thời (Priority: P2)

Với tư cách là người chơi gắn bó lâu dài và người kiểm toán hệ thống, tôi muốn xem lại toàn bộ lịch sử các lượt quay đã thực hiện (thời điểm, banner, phần thưởng, trạng thái pity trước/sau), yên tâm rằng các Banner Giới hạn theo mùa ở giai đoạn mở rộng bảo lưu Pity cùng quy tắc bảo đảm `50/50`, và mọi thao tác gửi trùng hay gửi song song đều được bảo vệ tuyệt đối.

**Why this priority**: Xây dựng niềm tin lâu dài thông qua tính minh bạch có thể kiểm chứng và thiết kế sẵn khung mở rộng Banner Giới hạn (`bnr_lim_*`) mà không cần viết lại lõi Gacha ở Milestone 2+.

**Independent Test**: Có thể kiểm thử độc lập bằng cách kiểm tra phân trang lịch sử quay khớp 100% sổ cái, kích hoạt banner giới hạn mẫu (`bnr_lim_storm_sovereign`) kiểm chứng lệch `50/50` bật cờ `guaranteedFeatured = true` và lần trúng `MYTHIC/LEGENDARY` tiếp theo (kể cả trên banner giới hạn kế tiếp cùng `sharedPityGroup`) đạt `100%` Featured, đồng thời chạy bài test ngắt máy chủ giữa pha ghi dữ liệu để xác nhận phục hồi nguyên vẹn.

**Acceptance Scenarios**:

1. **Given** một Banner Giới hạn (`bnr_lim_storm_sovereign`, nhóm `LIMITED_CHARACTER`) đang mở và nhân vật có `guaranteedFeatured = false`, **When** lần nhận `LEGENDARY`/`MYTHIC` đầu tiên ra nhân vật không phải Featured, **Then** máy chủ đặt `guaranteedFeatured = true` cho nhóm `LIMITED_CHARACTER`; ở lần nhận `LEGENDARY`/`MYTHIC` kế tiếp trong cùng nhóm, máy chủ bảo đảm `100%` trả về nhân vật Featured và đặt lại `guaranteedFeatured = false`.
2. **Given** người chơi đã thực hiện `35` lượt quay trên nhiều banner, **When** mở trang Lịch sử Quay lọc theo `bnr_perm_heroes`, **Then** hệ thống hiển thị danh sách phân trang theo thứ tự mới nhất gồm đầy đủ thời gian máy chủ, mã phần thưởng, độ hiếm, `pityBefore → pityAfter` và dấu hiệu trùng lặp/chuyển đổi.
3. **Given** một nhân vật chỉ còn `1,600 STARLIGHT_SHARD` nhưng thiết bị gửi đồng thời `20` lệnh quay `10` lượt (kể cả khác khóa chống trùng lặp), **When** máy chủ xử lý toàn bộ loạt yêu cầu, **Then** chỉ duy nhất `1` yêu cầu thành công, `19` yêu cầu còn lại bị từ chối do không đủ số dư, số dư cuối bằng đúng `0` và chỉ có đúng `10` bản ghi được thêm vào lịch sử quay.

---

### Edge Cases

- Banner Giới hạn đã hết thời hạn hoạt động (`active = false` hoặc ngoài khoảng `startAt..endAt` theo đồng hồ máy chủ): máy chủ từ chối mọi lượt quay mới với mã lỗi banner không khả dụng mà không trừ `STARLIGHT_SHARD`.
- Gửi yêu cầu quay với số lượng khác `1` và `10` (ví dụ `count = 0`, `-1`, `5`, `100`): máy chủ từ chối ngay ở lớp kiểm định đầu vào.
- Người chơi gửi lại cùng một lệnh quay với cùng khóa chống trùng lặp (`idempotencyKey`) khi rớt mạng lúc đang chạy hoạt ảnh mở rương: máy chủ trả lại đúng danh sách kết quả cũ đã lưu trong cửa sổ tối thiểu 24 giờ, không trừ thêm `STARLIGHT_SHARD` và không quay lại bộ sinh số ngẫu nhiên.
- Túi đồ không đủ ô trống khi quay Banner Vũ khí hoặc khi đổi vật phẩm/vũ khí trong Cửa hàng `STAR_ESSENCE`, hoặc khi nhận `mat_starlight_dust` từ trùng lặp vượt `C6`: máy chủ kiểm tra trước số ô cần thiết (bao gồm cả ô dự phòng cho vật phẩm tràn `C6`) và từ chối sạch trước khi trừ tiền tệ.
- Tệp cấu hình banner có tổng `baseRates` lệch khỏi `1.000000` (vượt sai số `1e-6`), có `pool` rỗng ở một bậc độ hiếm mang xác suất `> 0`, hoặc tham chiếu `chr_*`/`wpn_*` không tồn tại: hệ thống từ chối khởi động ngay từ đầu (fail-fast) để ngăn chặn banner sai tỷ lệ xuất hiện với người chơi.
- Cố đổi ưu đãi trong Cửa hàng `STAR_ESSENCE` vượt quá `limitPerMonth` trong tháng hiện tại theo đồng hồ UTC máy chủ: máy chủ từ chối và hiển thị thời điểm làm mới đầu tháng kế tiếp.
- Nhân vật không hề thực hiện lượt quay Gacha nào vẫn chơi toàn bộ nội dung cốt lõi MVP (nhiệm vụ, rừng, nông trại, cường hóa `+10`, Boss `boss_thornback_elder`): `3` nhân vật khởi đầu và hệ thống rèn/rơi vũ khí bảo đảm người chơi hoàn thành `100%` nội dung cốt lõi mà không bị khóa sau Gacha.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI nạp toàn bộ cấu hình Banner Gacha, bảng chuyển đổi trùng lặp và danh mục Cửa hàng `STAR_ESSENCE` từ nguồn dữ liệu chuẩn duy nhất `game-data/gacha-banners.json` (2 Permanent Banner MVP: `bnr_perm_heroes` và `bnr_perm_arsenal`; 2 Limited Banner hậu MVP: `bnr_lim_storm_sovereign` và `bnr_lim_dragonforge`), kiểm chứng fail-fast tổng `baseRates === 1.000000`, tính hợp lệ của toàn bộ bể phần thưởng `pool` và cấm bật cờ thanh toán tiền thật trong MVP.
- **FR-002**: Hệ thống PHẢI chỉ chấp nhận tiền tệ nội tệ **`STARLIGHT_SHARD`** (`160` cho `1` lượt, `1,600` cho `10` lượt; chỉ chấp nhận `count` ∈ `{1, 10}`), tuyệt đối không tích hợp thanh toán tiền thật hoặc cơ chế đổi thưởng thành tiền trong MVP.
- **FR-003**: Hệ thống PHẢI công khai minh bạch toàn bộ bảng xác suất nền của 6 bậc độ hiếm (`MYTHIC`, `LEGENDARY`, `EPIC`, `RARE`, `UNCOMMON`, `COMMON`), quy tắc Soft/Hard Pity, tiến độ `pityCounter / hardPity` và `epicPityCounter` hiện tại của nhân vật, quy tắc `50/50` (nếu là Limited Banner) và toàn bộ danh sách vật phẩm/nhân vật có thể nhận trong giao diện banner.
- **FR-004**: Hệ thống PHẢI tính toán kết quả quay hoàn toàn trên máy chủ bằng bộ sinh số ngẫu nhiên an toàn mật mã, thực thi chính xác công thức:
  - Soft Pity tăng tuyến tính từ lượt `65` (`+0.06`/lượt) đến Hard Pity `80` cho `bnr_perm_heroes` / `LIMITED_CHARACTER`, và từ lượt `55` (`+0.065`/lượt) đến Hard Pity `70` cho `bnr_perm_arsenal` / `LIMITED_WEAPON`, với phân bổ nội bộ `25% MYTHIC` / `75% LEGENDARY` và co đều các bậc dưới để tổng xác suất từng lượt luôn bằng `1.000000`.
  - Bộ đếm `epicPity = 10` bảo đảm tối đa mỗi `10` lượt quay có ít nhất `1` kết quả bậc `EPIC` trở lên.
  - Trên Limited Banner, thực thi cơ chế `50/50 Featured Guarantee` và bảo lưu đầy đủ trạng thái theo `sharedPityGroup`.
- **FR-005**: Hệ thống PHẢI xử lý mọi giao dịch quay Gacha bên trong khóa đồng thời theo thực thể nhân vật và kho đồ (chống gửi đồng thời) cùng giao dịch đa tệp nguyên tử qua nhật ký ghi trước JSON cục bộ (WAL) kèm khóa chống trùng lặp (`idempotencyKey`), cập nhật đồng bộ `characters/<id>.json`, `inventories/<id>.json`, `history/gacha-history-<id>.json` và `ledgers/currency-ledger-<YYYY-MM>.json` trong cùng một giao dịch.
- **FR-006**: Hệ thống PHẢI thực thi quy tắc chuyển đổi trùng lặp minh bạch:
  - Nhân vật trùng lặp khi `Constellation < 6`: tăng `+1` `Constellation` (trần `6`) và cộng `STAR_ESSENCE` theo độ hiếm (`2/5/12/30/80/150`).
  - Nhân vật trùng lặp khi đã đạt `Constellation = 6`: cộng gấp đôi `STAR_ESSENCE` (`4/10/24/60/160/300`) và cấp thêm `mat_starlight_dust` (`1/1/2/4/8/15`).
  - Vũ khí trùng lặp: giữ nguyên bản thể vũ khí mới trong túi đồ (có thể trang bị, tinh luyện tối đa bậc `5` hoặc phân rã) và cộng ngay `STAR_ESSENCE` (`1/3/8/20/60/120`) cùng `CRAFTING_TOKEN` (`1/2/4/8/20/40`).
- **FR-007**: Hệ thống PHẢI cung cấp Cửa hàng `STAR_ESSENCE` đọc từ `starEssenceShop.offers` (`16` ưu đãi gồm nhân vật, vũ khí và vật phẩm thiết yếu), kiểm tra giới hạn đổi theo tháng UTC (`limitPerMonth`), kiểm tra sức chứa túi đồ và thực thi trừ `STAR_ESSENCE` + cấp phần thưởng + ghi sổ cái nguyên tử qua WAL.
- **FR-008**: Hệ thống PHẢI lưu trữ bền vững và cho phép người chơi tra cứu phân trang toàn bộ Lịch sử Quay tại `data/db/history/gacha-history-<characterId>.json` (lọc theo `bannerId`), bao gồm `pityBefore`, `pityAfter`, chi tiết từng phần thưởng, chuyển đổi trùng lặp, thời điểm máy chủ và mã băm kiểm toán RNG.
- **FR-009**: Hệ thống PHẢI cung cấp Sổ tay Bộ sưu tập (Hero & Weapon Codex) tổng hợp từ dữ liệu nhân vật và kho đồ của người chơi, hiển thị tỷ lệ sưu tầm (`X/12` nhân vật, `Y/40` vũ khí), bộ lọc theo class/nguyên tố/độ hiếm/loại vũ khí, tiến độ `Constellation`, tiểu sử và nguồn mở khóa (bao gồm cả nguồn chế tạo/rơi hầm ngục ngoài Gacha).
- **FR-010**: Hệ thống PHẢI bảo đảm tính công bằng giao diện không chứa dark pattern (không đồng hồ đếm ngược giả thúc ép, không hiệu ứng nhấp nháy gây hại thị giác, luôn cho phép bỏ qua hoạt ảnh mở rương mượt mà và tắt rung màn hình theo cài đặt trợ năng).

### Key Entities *(include if feature involves data)*

- **GachaBannerConfig**: Cấu hình chỉ đọc của từng banner nạp từ danh mục chuẩn gồm mã banner, loại banner, nhóm chia sẻ Pity, lịch hoạt động, chi phí `STARLIGHT_SHARD`, thông số Soft/Hard/Epic Pity, bảng `baseRates` (tổng `1.000000`), danh sách `featured` và bể phần thưởng `pool`.
- **GachaPityState**: Trạng thái Pity bền vững gắn theo từng `sharedPityGroup` của nhân vật gồm tổng số lượt quay, bộ đếm Pity hiện tại, bộ đếm `epicPityCounter`, cờ `guaranteedFeatured` và thời điểm quay gần nhất.
- **GachaHistoryRecord**: Bản ghi bất biến của một giao dịch quay `1` hoặc `10` lượt gồm mã giao dịch, khóa chống trùng lặp, mã nhân vật/banner/nhóm pity, số lượt, `STARLIGHT_SHARD` đã chi, `pityBefore`, `pityAfter`, mảng kết quả chi tiết, mã băm kiểm toán RNG và dấu thời gian máy chủ.
- **GachaPullItemResult**: Chi tiết một kết quả đơn lẻ trong mảng kết quả quay gồm thứ tự lượt, loại phần thưởng, mã nhân vật/vũ khí, độ hiếm, cờ Featured, cờ trùng lặp và chi tiết phần thưởng chuyển đổi trùng lặp.
- **CollectionProgress**: Trạng thái bộ sưu tập gắn với nhân vật gồm danh sách nhân vật đã mở khóa, bản đồ bậc `Constellation (0..6)`, danh sách mã vũ khí từng sở hữu và bộ đếm số lần đổi ưu đãi theo tháng trong Cửa hàng `STAR_ESSENCE`.
- **StarEssenceExchangeTx**: Giao dịch đổi thưởng minh bạch bằng `STAR_ESSENCE` lưu mã giao dịch, khóa chống trùng lặp, mã ưu đãi, khóa tháng UTC, chi phí và bộ đếm hạn mức tháng sau khi đổi.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `100%` banner trong danh mục chuẩn có tổng xác suất nền bằng đúng `1.000000` (sai số `<= 1e-6`), và trong mô phỏng kiểm chứng `100,000` lượt quay thực tế, tỷ lệ xuất hiện `MYTHIC`/`LEGENDARY` (tính cả Soft/Hard Pity), tỷ lệ `EPIC+` mỗi `10` lượt và cơ chế `50/50` hội tụ khớp lý thuyết toán học trong biên sai số thống kê `<= 0.25%`.
- **SC-002**: Trong bài kiểm tra gửi đồng thời `20` yêu cầu quay `10` lượt khi nhân vật chỉ có `1,600 STARLIGHT_SHARD`, tỷ lệ chi tiêu quá số dư hoặc lệch bộ đếm Pity là `0%` (chính xác `1` yêu cầu thành công, `19` yêu cầu thất bại, số dư cuối `= 0`).
- **SC-003**: `100%` lượt quay đạt mốc `pityCounter = 79` (Character) hoặc `69` (Weapon) đều trả ra `LEGENDARY`/`MYTHIC` ở lượt kế tiếp và reset bộ đếm về `0`; `100%` gói 10 lượt chứa ít nhất `1` kết quả `EPIC+`.
- **SC-004**: Trong kịch bản ngắt máy chủ đột ngột giữa giao dịch quay Gacha hoặc đổi Cửa hàng `STAR_ESSENCE`, `100%` dữ liệu tiền tệ, Pity, kho đồ, lịch sử quay và sổ cái tiền tệ được phục hồi đồng nhất sau khi khởi động lại (`0` giao dịch nửa vời).
- **SC-005**: Hệ thống có `0` tích hợp cổng thanh toán tiền thật hoặc dịch vụ thứ ba trong MVP; thời gian hoàn tất một giao dịch quay `10` lượt trên lưu trữ JSON cục bộ đạt mục tiêu đề xuất `p95 < 60 ms` ở `50` người chơi đồng thời (`proposed / unverified`).

## Assumptions

- Hệ thống phụ thuộc trực tiếp vào `001-foundation-game-engine` (`JsonDatabaseEngine`, `GameCatalogLoader`), `002-auth-character` (`Character`, `unlockedHeroIds`, `heroConstellations`), và `005-inventory-loot` (`InventoryService`, `ItemInstance`).
- Toàn bộ nguồn phát `STARLIGHT_SHARD` miễn phí đến từ chuỗi nhiệm vụ, hạ Boss lần đầu/hàng tuần, khám phá bản đồ và thành tựu (`011-dungeon-boss` và module `quest`/`economy`); nguồn kiểm chứng định lượng chi phí kỳ vọng nằm trong mô phỏng Monte Carlo tại `tools/design-validation/`.
- Hai Banner Giới hạn (`bnr_lim_storm_sovereign`, `bnr_lim_dragonforge`) có `active = false` và `mvp = false` trong giai đoạn MVP, nhưng toàn bộ logic `sharedPityGroup` và `50/50 Featured Guarantee` được xây dựng sẵn để mở khóa không cần sửa mã khi bước sang Milestone 2+.
- Mục tiêu độ trễ giao dịch `p95 < 60 ms` là giá trị thiết kế đề xuất (`proposed / unverified`) sẽ được đo kiểm bằng benchmark thực tế khi triển khai.
