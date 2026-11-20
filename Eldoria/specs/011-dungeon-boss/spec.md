# Feature Specification: Instanced Dungeons, 10-State Monster AI & Multi-Phase Boss Encounters

**Feature Branch**: `011-dungeon-boss`

**Created**: 2026-11-19

**Status**: Reviewed (Autonomous Design Baseline — Chờ phê duyệt chuyển sang Implementation)

**Input**: User description: "Instanced dungeon lifecycle, 10-state monster AI FSM with aggro, leash, threat table and pathfinding, 30 regular + 8 elite roster loader, and 5 multi-phase boss encounters with telegraphs, poise stagger, enrage, 1-4 player scaling, anti-exploit rules, and fair rewards"

## Clarifications

### Session 2026-11-19 *(Autonomous Design Decisions — Proposed, Chưa có phê duyệt triển khai của người dùng)*

- Q: Các ngưỡng chuyển giai đoạn (Phase), thời lượng Choáng phá giáp (Poise Stagger) và hệ số sát thương của Boss (`boss_thornback_elder` và 4 Boss hậu MVP) được xác định theo số cố định hay đọc từ danh mục chuẩn? → A: Toàn bộ ngưỡng Phase, thời lượng Poise Break, hệ số sát thương, thời gian Enrage và bảng thưởng PHẢI đọc trực tiếp từ nguồn chân lý duy nhất `game-data/bosses.json` (Nguyên tắc III). Cụ thể với Boss MVP `boss_thornback_elder`: 3 giai đoạn tại `100% / 65% / 30%` HP, Poise Break kéo dài `6.0 giây` kèm nhân `x1.40` sát thương nhận vào (`x1.50` sát thương Poise từ hệ `FIRE`), và Enrage sau `360 giây` (`x1.65` ATK, `x1.30` tốc độ đánh); các con số phác thảo sơ bộ trước đây (`70%/35%`, `5s / x1.35`) không được ghi đè cứng để tránh lệch dữ liệu *(Mandated by Constitution Principle III)*.
- Q: Làm thế nào để đảm bảo tín hiệu cảnh báo đòn đánh (Telegraph) của Boss luôn đọc rõ ngay cả khi 4 người chơi tung Tuyệt chiêu (Ultimate) đồng thời? → A: Toàn bộ vùng cảnh báo mặt đất của Boss được xếp trên tầng hiển thị mặt đất chuyên biệt (`180–199` nằm ngay trên họa tiết nền đất, dưới bóng đổ và nhân vật, không bị ánh sáng tối/hiệu ứng kỹ năng phía trên che lấp), đồng thời kết hợp viền nét đứt sáng và họa tiết tương phản cao thân thiện với người khiếm thị màu *(Mandated by Constitution Principle V & Proposed Decision)*.
- Q: Giới hạn nhận thưởng `STARLIGHT_SHARD` và `BOSS_TOKEN` hàng tuần được đặt lại khi nào và chống cày lại bằng nhân vật phụ ra sao? → A: Chu kỳ tuần đặt lại vào `00:00 UTC Thứ Hai` hàng tuần theo đồng hồ máy chủ; phần thưởng `STARLIGHT_SHARD` lần đầu vượt ải (`First Clear`) được ghi nhận bất biến ở cấp tài khoản trong tệp JSON cục bộ nhằm ngăn tạo nhân vật mới cày lặp vô hạn, trong khi `STARLIGHT_SHARD` hàng tuần nhận tối đa `1 lần/Boss/tuần` và `BOSS_TOKEN` áp trần tuần kết hợp thời gian hồi phụ bản (`15 phút` với `dng_mossroot_hollow`) *(Proposed Decision)*.
- Q: Khi túi đồ của người chơi đầy tại khoảnh khắc đánh bại Boss, chiến lợi phẩm sẽ đi đâu? → A: Không bao giờ bị mất; máy chủ ghi nguyên tử phần thưởng tràn túi trực tiếp vào Kho Lưu trữ (`bld_storage`) của người chơi kèm thông báo rõ ràng trên bảng Chiến lợi phẩm Boss *(Proposed Decision)*.
- Q: Dữ liệu trạng thái AI quái vật và Hầm ngục lưu ở đâu để không làm nghẽn ổ đĩa cục bộ? → A: Toàn bộ trạng thái mô phỏng thời gian thực (`DungeonInstance`, FSM 10 trạng thái, bảng đe dọa, đường tìm đường, thanh Poise, bộ đếm Enrage) chạy 100% trong bộ nhớ máy chủ ở nhịp mô phỏng; chỉ bộ đếm hồi sinh Elite thế giới mở (`data/db/world/<regionId>.json`), mốc khóa thưởng Boss (`accounts/`, `characters/`) và giao dịch phát thưởng kho/tiền (`inventories/`, `ledgers/`) được lưu bền vững vào tệp JSON cục bộ *(Mandated by Constitution Principles I & IV)*.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hành vi Quái vật 10 Trạng thái Sống động, Bảng Đe dọa & Chống Lợi dụng Địa hình (Priority: P1)

Với tư cách là người chơi chiến đấu tại `reg_greenhaven_village` và `reg_whispering_forest`, tôi muốn 8 loài quái thường và 1 quái Elite MVP (cùng toàn bộ danh mục 30 quái thường + 8 Elite dài hạn) có hành vi đặc trưng theo sinh thái, đọc đòn rõ ràng qua vùng cảnh báo mặt đất, phản ứng chính xác với vai trò Tank/DPS/Healer và tự động quay về tổ khi bị kéo quá xa hoặc sát Vùng An Toàn.

**Why this priority**: Chiến đấu với quái vật thế giới mở và tiền sảnh Hầm ngục chiếm phần lớn thời lượng trải nghiệm Action RPG cốt lõi và là nền tảng kỹ thuật trực tiếp cho AI Boss.

**Independent Test**: Có thể kiểm thử độc lập bằng cách nạp toàn bộ danh mục `30` quái thường + `8` Elite từ nguồn chuẩn, kiểm tra đủ `10` chuyển trạng thái FSM (bao gồm `mob_forest_goblin` bỏ chạy `FLEE` dưới `20%` HP tối đa `4 giây` và không lặp trong `20 giây`; `mob_briar_boar` quay về `RETURN` miễn sát thương khi vượt `leashDistancePx` hoặc chạm Vùng An Toàn; Tank giữ đầu bảng Đe dọa khi dùng kỹ năng khiêu khích; và `mob_elite_alpha_direwolf` giới hạn tối đa `2` đệ tử `mob_timber_wolf` không rơi đồ).

**Acceptance Scenarios**:

1. **Given** danh mục nội dung quái vật hợp lệ gồm `30` Regular và `8` Elite (`8 + 1` đánh dấu MVP), **When** một khu vực trò chơi khởi động, **Then** mọi chỉ số, tầm phát hiện, dây buộc lãnh thổ, ưu tiên mục tiêu và chuỗi đòn đánh được nạp hoàn toàn từ danh mục chuẩn mà không cần giá trị cố định rời rạc.
2. **Given** một quái vật đang truy đuổi người chơi (`CHASE`), **When** khoảng cách tới điểm sinh vượt `leashDistancePx` hoặc người chơi bước vào Vùng An Toàn, **Then** quái vật lập tức chuyển sang trạng thái `RETURN`, xóa bảng đe dọa, miễn mọi sát thương/khống chế, chạy nhanh về điểm sinh và hồi đầy `100%` sinh lực cùng Poise.
3. **Given** Tổ đội 3 người gồm Tank, DPS và Healer giao chiến với `mob_elite_alpha_direwolf`, **When** Tank sử dụng kỹ năng Khiêu khích trong khi Healer hồi máu (bao gồm hồi máu dư không gây đe dọa), **Then** Tank giữ vững mục tiêu của Elite theo quy tắc hệ số đe dọa vai trò (`1.6x`) và độ trễ chống giật mục tiêu (`+10%` cận chiến / `+20%` tầm xa), đồng thời sinh lực và Poise của Elite tự điều chỉnh theo số người tham chiến mà giữ nguyên tỷ lệ phần trăm máu hiện tại.
4. **Given** một quái Elite ngoài thế giới mở bị hạ gục, **When** máy chủ khởi động lại trước khi hết thời gian chờ hồi sinh (`300 giây` với `mob_elite_alpha_direwolf`), **Then** đồng hồ hồi sinh được khôi phục chính xác từ tệp JSON vùng cục bộ để ngăn khởi động lại máy chủ hòng cày Elite liên tục.

---

### User Story 2 - Vòng đời Hầm ngục Riêng biệt & Chiến đấu Boss 3 Giai đoạn Có Cơ chế Rõ ràng (Priority: P1)

Với tư cách là người chơi đơn lẻ hoặc Tổ đội `1–4` người tiến vào `dng_mossroot_hollow`, tôi muốn trải nghiệm một Hầm ngục tách biệt hoàn toàn với người lạ, đối đầu Boss `boss_thornback_elder` qua đủ 3 giai đoạn hành vi khác biệt, đọc rõ mọi vùng báo đòn, tương tác với 4 trụ đá môi trường, tận dụng điểm yếu hệ `FIRE` để phá giáp Poise và vượt qua thử thách kỹ năng thực sự trước mốc Cuồng nộ (`Enrage`).

**Why this priority**: Hạ gục `boss_thornback_elder` trong `dng_mossroot_hollow` là đỉnh cao của vòng lặp cốt lõi MVP và là điều kiện mở khóa khu vực kế tiếp (`reg_ironpeak_mountains`).

**Independent Test**: Có thể kiểm thử độc lập bằng cách mở một `DungeonInstance` cho `dng_mossroot_hollow` với 1 và 4 người chơi: xác nhận niêm phong cửa phòng Boss sau `5 giây` kích hoạt aggro, xác nhận hệ số nhân HP/ATK/Poise khóa cứng theo bảng `1..4` người chơi, xác nhận chuyển đủ 3 giai đoạn tại `100% / 65% / 30%` HP, xác nhận đòn húc `Heartwood Charge` đập vỡ trụ đá làm Boss tự choáng `2.5 giây`, xác nhận vỡ Poise làm Boss bất động `6.0 giây` nhận `x1.40` sát thương, và xác nhận Enrage kích hoạt đúng ở giây `360`.

**Acceptance Scenarios**:

1. **Given** Tổ đội `1–4` người hoàn tất Xác nhận Sẵn sàng tại cổng `dng_mossroot_hollow`, **When** cả đội vào phòng Boss và thành viên đầu tiên kích hoạt giao chiến, **Then** sau đúng `5 giây`, rào chắn phòng Boss niêm phong hoàn toàn (không cho người ngoài bước vào hay tấn công xuyên biên), và hệ số HP/ATK/Poise của Boss được khóa cố định theo quy mô đội tại thời điểm đó (`1.00x / 1.75x / 2.45x / 3.10x` HP).
2. **Given** `boss_thornback_elder` đang trong trận chiến, **When** sinh lực Boss giảm qua mốc `65%` (Phase 2) và `30%` (Phase 3), **Then** Boss kích hoạt thay đổi hành vi tương ứng (bật hiểm họa `hz_briar_perimeter`, kỹ năng trói/hồi máu có thể ngắt, `hz_toxic_sap_pool` và cú húc `Heartwood Charge` tương tác phá hủy 4 trụ đá `safePillars`), kèm tín hiệu cảnh báo mặt đất hiển thị sắc nét không bị che bởi hiệu ứng kỹ năng người chơi.
3. **Given** người chơi dồn sát thương hệ `FIRE` (điểm yếu của `boss_thornback_elder`, nhân `1.5x` sát thương Poise) hoặc kỹ năng nặng làm thanh Poise giảm về `0`, **When** trạng thái Phá giáp (`STAGGERED`) kích hoạt, **Then** Boss lập tức hủy chiêu đang niệm (bao gồm chiêu hồi máu `Regrowth Sap Channel`), bất động trong `6.0 giây`, nhận thêm `+40%` sát thương (`x1.40`), xóa kháng `EARTH`, sau đó khôi phục `100%` Poise.
4. **Given** trận đấu kéo dài chạm mốc `360 giây` mà Boss chưa bị đánh bại, **When** đồng hồ Cuồng nộ (`Enrage`) kích hoạt, **Then** Boss chuyển trạng thái `ENRAGED` (`x1.65` ATK, `x1.30` tốc độ đánh) với tín hiệu thị giác ổn định không nhấp nháy quá ngưỡng an toàn.

---

### User Story 3 - Hồi sinh Tổ đội, Reset Công bằng Khi Thất bại & Phân phát Phần thưởng Boss Chống Gian lận (Priority: P2)

Với tư cách là thành viên Tổ đội chinh phục Boss, tôi muốn có cơ hội cứu sống đồng đội gục ngã có giới hạn hợp lý, tự động đặt lại sạch trận đấu nếu cả đội thất bại mà không mất trang bị, và khi chiến thắng nhận đầy đủ phần thưởng cá nhân minh bạch (`EXP`, `Gold`, `BOSS_TOKEN`, `STARLIGHT_SHARD`, trang bị) mà không sợ mất đồ khi túi đầy hay bị gian lận cày lặp.

**Why this priority**: Hoàn thiện trọn vẹn vòng lặp Boss Battle → Upgrade → New Region một cách công bằng, chống mất thưởng và bảo vệ kinh tế `STARLIGHT_SHARD` / `BOSS_TOKEN`.

**Independent Test**: Có thể kiểm thử độc lập bằng cách: (a) để 1 người gục ngã (`DOWNED`) và đồng đội cứu bằng `csm_revive_feather` tối đa 2 lần (lần thứ 3 bị từ chối); (b) để toàn đội gục ngã (xác nhận Boss hồi `100%` HP, phục hồi đủ 4 trụ đá và về Phase 1); (c) hạ Boss với tổ đội có thành viên đủ `>= 5%` đóng góp và thành viên `< 5%` đóng góp (chỉ người đủ ngưỡng nhận thưởng); (d) kiểm tra thưởng First Clear cấp tài khoản chỉ nhận đúng 1 lần duy nhất, thưởng tuần giới hạn 1 lần/tuần và phần thưởng tràn túi tự chuyển sang Kho Lưu trữ.

**Acceptance Scenarios**:

1. **Given** một thành viên hết sinh lực trong phòng Boss nhưng còn đồng đội sống sót, **When** đồng đội đứng trong phạm vi `<= 64 px` dùng `csm_revive_feather` tụ lực `2.0 giây`, **Then** thành viên được hồi sinh tại chỗ tối đa `2 lần` mỗi người trong một trận; nếu toàn bộ thành viên đều gục ngã (Party Wipe), Boss hồi `100%` HP, phục hồi toàn bộ trụ đá/hiểm họa về Phase 1 và đưa cả đội về cửa phòng Boss thử lại mà không mất trang bị.
2. **Given** `boss_thornback_elder` bị đánh bại bởi Tổ đội, **When** máy chủ chốt phần thưởng nguyên tử trong giao dịch JSON đa tệp, **Then** mọi thành viên hiện diện hợp lệ và đạt `>= 5%` đóng góp (sát thương, hồi máu hoặc chống chịu) nhận phần thưởng cá nhân cộng thêm thưởng quy mô tổ đội (`+0%/+10%/+20%/+30%`), `BOSS_TOKEN` (`5`), `STARLIGHT_SHARD` Lần Đầu (`480`, ghi nhận bất biến theo tài khoản) hoặc Hàng Tuần (`160`, tối đa 1 lần/Boss/tuần), và tự động chuyển vật phẩm tràn vào Kho Lưu trữ nếu túi đầy.
3. **Given** một người chơi đã nhận thưởng `First Clear` `boss_thornback_elder` trên nhân vật thứ nhất, **When** người chơi tạo nhân vật thứ hai trong cùng tài khoản và hạ lại `boss_thornback_elder`, **Then** máy chủ chỉ cấp thưởng thông thường/tuần (nếu chưa đạt trần tuần) và KHÔNG phát lặp `starlightShardsFirstClear`.

---

### User Story 4 - Kiến trúc Mở rộng Cho 4 Hầm ngục & Boss Hậu MVP Đến Cấp 100 (Priority: P3)

Với tư cách là nhà thiết kế và phát triển nội dung dài hạn, tôi muốn khung động cơ Hầm ngục và Boss vận hành hoàn toàn dựa trên dữ liệu danh mục sao cho cả 4 Boss hậu MVP (`boss_ignis_forgelord`, `boss_prism_leviathan`, `boss_boreas_frostking`, `boss_malakor_abyss` 4 giai đoạn) có thể kích hoạt dần theo lộ trình mà không cần viết lại lõi mô phỏng.

**Why this priority**: Bảo đảm thiết kế nhất quán với tầm nhìn dài hạn 8 khu vực / 5 Boss trong khi giữ phạm vi triển khai MVP gọn gàng ở `dng_mossroot_hollow`.

**Independent Test**: Có thể kiểm thử độc lập bằng trình kiểm chứng nạp danh mục và chạy kịch bản mô phỏng không giao diện (headless) trên cả 5 hồ sơ Boss trong `game-data/bosses.json`, xác nhận đủ ngưỡng Phase (3 Phase cho 4 Boss đầu, 4 Phase cho `boss_malakor_abyss` với khóa 15% HP chuyển pha), đủ loại hình dạng hitbox và bảng thưởng khớp danh mục.

**Acceptance Scenarios**:

1. **Given** 5 hồ sơ Boss trong `game-data/bosses.json`, **When** hệ thống nạp danh mục lúc khởi động, **Then** toàn bộ 5 Boss, đấu trường, trụ môi trường, hiểm họa, kỹ năng từng giai đoạn, thông số Poise/Enrage và bảng thưởng đều được kiểm chứng và sẵn sàng kích hoạt theo cờ mở khóa từng cột mốc.
2. **Given** một trận đấu với `boss_malakor_abyss` (4 giai đoạn `100% / 70% / 40% / 15%`), **When** tổ đội dồn sát thương cực lớn ở mốc `16%` HP để thử bỏ qua Phase 4, **Then** máy chủ giữ sàn `15%` HP trong `1.5 giây` chuyển pha để kích hoạt đúng giai đoạn cuối cùng thay vì bị xuyên pha do lỗi sát thương đơn phát.

---

### Edge Cases

- Quái vật bị hai người chơi đứng hai bên tảng đá kéo qua lại khiến đường đi bị chặn: bộ tìm đường có ngân sách giới hạn tối đa `120` nút và tự phục hồi kẹt sau `1.5 giây` (tìm đường lại) / `3.0 giây` (chuyển đòn tầm xa hoặc `RETURN`).
- Người chơi cố đứng ngoài ranh giới phòng Boss sau khi rào chắn đóng ở giây thứ `5` để bắn đạn tầm xa vào Boss: mọi đòn đánh hoặc vật phóng từ ngoài tọa độ phòng Boss bị máy chủ hủy bỏ hoàn toàn.
- Một thành viên trong Tổ đội 4 người cố tình ngắt kết nối giữa trận Boss với hy vọng làm giảm hệ số HP `3.10x` của Boss: hệ số quy mô tổ đội bị khóa cố định ngay khi niêm phong phòng Boss và KHÔNG giảm xuống giữa trận.
- Người chơi bị ngắt kết nối trong phòng Boss và không kết nối lại sau `120 giây`, trong khi toàn bộ đồng đội khác cũng đã rời đi: `DungeonInstance` tự động dọn dẹp giải phóng toàn bộ bộ nhớ sau `120 giây` trống người để tránh rò rỉ tài nguyên.
- Quái Elite triệu hồi đệ tử (`mob_elite_alpha_direwolf` gọi `mob_timber_wolf`) bị người chơi cố tình để sống nhằm cày đệ tử vô hạn: số đệ tử sống đồng thời khóa trần tối đa `2`, tự tan biến sau `30 giây` hoặc khi Elite chết, và không bao giờ rơi EXP, Gold hay vật phẩm.
- Quái vật đang đứng ở khu vực không có người chơi nào trong phạm vi `1024 px`: tự chuyển sang chế độ ngủ đông tiết kiệm tài nguyên tính toán và thức dậy ngay khi có người chơi tiến gần.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI quản lý vòng đời phiên bản Hầm ngục riêng biệt (`DungeonInstance`) hoàn toàn trong bộ nhớ máy chủ cho Hầm ngục MVP `dng_mossroot_hollow` và hỗ trợ kiến trúc dữ liệu cho 4 Hầm ngục hậu MVP (`dng_slag_foundry`, `dng_prism_sanctum`, `dng_glacial_citadel`, `dng_eclipse_throne`), bao gồm khởi tạo theo Tổ đội `1–4` người, niêm phong phòng Boss sau `5 giây` kích hoạt aggro (`allowLateJoin: false`), đặt lại sạch khi cả đội gục ngã và tự dọn dẹp bộ nhớ sau khi trống người (`120 giây`) hoặc đã hoàn thành (`300 giây`).
- **FR-002**: Hệ thống PHẢI nạp 100% thông số của `30` quái thường và `8` quái Elite (`8` thường + `1` Elite đánh dấu MVP) từ `game-data/monsters.json` và vận hành đầy đủ máy trạng thái AI 10 trạng thái (`IDLE`, `PATROL`, `DETECT`, `CHASE`, `ATTACK`, `RETURN`, `FLEE`, `STUNNED`, `DEATH`, `RESPAWN`) đúng thứ tự ưu tiên ngắt trạng thái (`DEATH > STUNNED > RETURN > FLEE > ATTACK > CHASE > DETECT > PATROL > IDLE`) kèm chế độ ngủ đông khi vắng người chơi trong bán kính `1024 px`.
- **FR-003**: Hệ thống PHẢI thực thi tìm đường theo lưới địa hình có giới hạn ngân sách (`<= 120` nút/lượt, tính lại tối đa `3 lần/giây/quái`, lực tách nhóm `28 px`, khôi phục kẹt `1.5s`/`3.0s`), dây buộc lãnh thổ (`leashDistancePx`) và rào chắn Vùng An Toàn ép quái chuyển `RETURN` miễn sát thương hồi `+20% Max HP/giây`, cùng quy tắc bỏ chạy `FLEE` tối đa `4 giây` với thời gian hồi `20 giây`.
- **FR-004**: Hệ thống PHẢI duy trì Bảng Đe dọa (`Threat Table`) hỗ trợ đủ 6 chế độ ưu tiên mục tiêu (`NEAREST`, `HIGHEST_THREAT`, `LOWEST_HP`, `RANGED_FIRST`, `HEALER_FIRST`, `LAST_ATTACKER`), hệ số vai trò Tank `1.6x`, kỹ năng Khiêu khích `3.0x` kèm trạng thái `TAUNTED` ghi đè trong `4.0 giây`, `0` đe dọa cho hồi máu dư, độ trễ chống giật mục tiêu (`+10%` cận chiến / `+20%` tầm xa), và giới hạn đệ tử triệu hồi tối đa `2` cá thể tồn tại `30 giây` không rơi thưởng.
- **FR-005**: Hệ thống PHẢI áp dụng điều chỉnh độ khó động cho quái thế giới mở theo số người tham chiến (`hpPerExtraPlayer`, `poisePerExtraPlayer`, giữ nguyên `% HP` hiện tại) và lưu bền vững đồng hồ hồi sinh của quái Elite vào tệp JSON vùng cục bộ (`data/db/world/<regionId>.json`) chống khai thác khởi động lại máy chủ.
- **FR-006**: Hệ thống PHẢI nạp toàn bộ 5 hồ sơ Boss nhiều giai đoạn từ `game-data/bosses.json` (triển khai MVP `boss_thornback_elder` 3 giai đoạn `100% / 65% / 30%` HP và sẵn sàng dữ liệu cho 4 Boss hậu MVP gồm `boss_malakor_abyss` 4 giai đoạn có khóa chuyển pha `15%` HP trong `1.5 giây`), đồng thời áp dụng khóa cứng tỷ lệ quy mô `1–4` người chơi từ `partyScaling` ngay khi niêm phong đấu trường.
- **FR-007**: Hệ thống PHẢI tách biệt pha cảnh báo (`STARTUP/TELEGRAPH` đúng `telegraphMs` từ danh mục) trước pha gây sát thương (`ACTIVE`) xác thực 100% tại máy chủ, và phát sự kiện vẽ vùng cảnh báo mặt đất sắc nét trên tầng chuyên biệt `180–199` không bị hiệu ứng kỹ năng/Tuyệt chiêu che khuất kèm mã hóa hình học an toàn cho người mù màu.
- **FR-008**: Hệ thống PHẢI thực thi cơ chế tương tác trụ đấu trường (`safePillars` — bao gồm 4 trụ có thể phá vỡ của `boss_thornback_elder` gây tự choáng `2.5 giây` và `+25%` sát thương Poise khi trúng `Heartwood Charge`), hiểm họa môi trường theo giai đoạn (`hazards`), cơ chế Phá giáp Poise (`STAGGERED` theo `poiseBreakDurationMs`, `damageTakenMultiplier`, `weaknessPoiseBonusMultiplier` từ `bosses.json`, hủy chiêu đang niệm), và cơ chế Cuồng nộ (`ENRAGED` theo `enrageTimerSeconds`, `atkMultiplier`, `attackSpeedMultiplier`).
- **FR-009**: Hệ thống PHẢI thực thi cơ chế chống gian lận đấu trường (hủy mọi đòn đánh/vật phóng ngoài tọa độ phòng Boss, chặn kẹt địa hình chuyển chiêu tầm xa sau `2 giây`, không giảm độ khó khi thành viên rớt mạng) cùng cơ chế hồi sinh đồng đội giới hạn `2 lần/người/trận` (`csm_revive_feather`, tụ lực `2.0 giây`, khoảng cách `<= 64 px`, cửa sổ `30 giây`) và reset toàn phần khi Party Wipe.
- **FR-010**: Hệ thống PHẢI phân phát phần thưởng Boss cá nhân hóa nguyên tử qua giao dịch JSON đa tệp cho thành viên hiện diện hợp lệ đạt `>= 5%` đóng góp (sát thương, hồi máu hoặc chống chịu) kèm thưởng quy mô tổ đội (`+0%..+30%`), thực thi giới hạn `starlightShardsFirstClear` bất biến 1 lần theo tài khoản, giới hạn `starlightShardsWeekly` 1 lần/Boss/tuần (`00:00 UTC Thứ Hai`), trần tuần `BOSS_TOKEN`, thời gian hồi phụ bản (`instanceCooldownMinutes`), và tự động chuyển vật phẩm tràn vào Kho Lưu trữ khi túi đồ đầy.

### Key Entities *(include if feature involves data)*

- **DungeonInstanceRuntime**: Phiên bản Hầm ngục tạm thời trong bộ nhớ gồm mã phiên bản, mã hầm ngục, tổ đội khóa cứng (`1–4` người), trạng thái khóa cửa phòng Boss, số lượt hồi sinh đã dùng và mốc tự dọn dẹp.
- **ActiveMonsterRuntime**: Thực thể quái vật đang hoạt động trong bộ nhớ gồm định danh loài từ danh mục, trạng thái trong 10 trạng thái AI, HP/Poise hiện tại, bảng đe dọa, thời gian hồi bỏ chạy và cờ đệ tử triệu hồi.
- **ActiveBossRuntime**: Thực thể Boss đang hoạt động trong bộ nhớ gồm định danh Boss, quy mô tổ đội đã khóa cứng (`1–4`), giai đoạn hiện tại, trạng thái chiến đấu (`NORMAL/STAGGERED/ENRAGED/DEFEATED`), thời điểm kết thúc choáng/kích hoạt cuồng nộ và trạng thái các trụ đấu trường.
- **ActiveTelegraphRuntime**: Vùng cảnh báo đòn đánh tạm thời đồng bộ giữa máy chủ và tầng hiển thị mặt đất `180–199` gồm hình dạng vùng ảnh hưởng, thời lượng cảnh báo và mốc thực thi sát thương chuẩn máy chủ.
- **EliteRespawnTimerRecord**: Bản ghi bền vững trong tệp JSON vùng lưu thời điểm hạ gục gần nhất và mốc tái sinh kế tiếp của từng quái Elite thế giới mở.
- **BossRewardLockoutRecord**: Bản ghi bền vững ở cấp nhân vật và tài khoản quản lý cờ đã nhận thưởng Lần Đầu theo tài khoản, chu kỳ tuần ISO, giới hạn nhận `STARLIGHT_SHARD` / `BOSS_TOKEN` hàng tuần và thời gian hồi phụ bản.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `100%` danh mục `30` quái thường, `8` quái Elite và `5` Boss nạp thành công từ nguồn dữ liệu chuẩn không có sai lệch tham chiếu hay chỉ số hardcode; toàn bộ `10` trạng thái AI FSM vượt qua kịch bản kiểm thử chuyển trạng thái và rào chắn Vùng An Toàn với `0` trường hợp quái lọt vào khu vực an toàn.
- **SC-002**: Trong trận đấu `boss_thornback_elder` (`1–4` người), `100%` chuyển pha (`65% / 30%`), tương tác phá trụ đá, Phá giáp Poise (`6.0s`, `x1.40` sát thương, `x1.50` điểm yếu `FIRE`) và Cuồng nộ (`360s`) kích hoạt chính xác theo thông số `game-data/bosses.json`, với `0%` vùng cảnh báo mặt đất bị hiệu ứng kỹ năng người chơi che khuất.
- **SC-003**: `100%` nỗ lực khai thác lỗi (tấn công từ ngoài phòng Boss đã niêm phong, cày đệ tử triệu hồi, khởi động lại máy chủ để reset hồi sinh Elite, tạo nhân vật phụ nhận lặp `First Clear` `STARLIGHT_SHARD`, nhận thưởng khi đóng góp `< 5%`) bị chặn tuyệt đối tại máy chủ.
- **SC-004**: `100%` trận thắng Boss khi túi đồ người chơi đã đầy bảo toàn trọn vẹn chiến lợi phẩm bằng cách chuyển nguyên tử vào Kho Lưu trữ (`0` vật phẩm bị mất), và `100%` trường hợp Party Wipe đặt lại sạch phòng Boss về Phase 1 không kẹt trạng thái.
- **SC-005**: Ngân sách tính toán AI và tìm đường cho tối đa `60` quái hoạt động đồng thời trên một khu vực hướng tới mục tiêu `< 6 ms` mỗi chu kỳ mô phỏng `50 ms` (`proposed / unverified`), không phát sinh thao tác ghi tệp JSON nào bên trong vòng lặp mô phỏng.

## Assumptions

- Giai đoạn MVP triển khai hoàn chỉnh 8 quái thường + 1 Elite MVP tại `reg_greenhaven_village` / `reg_whispering_forest` và 1 Hầm ngục Boss `dng_mossroot_hollow` (`boss_thornback_elder`); 22 quái thường, 7 Elite và 4 Hầm ngục/Boss còn lại được nạp sẵn cấu trúc dữ liệu chuẩn và mở khóa theo cột mốc M2–M5.
- Các công thức sát thương lõi, hiệu ứng trạng thái, cộng hưởng nguyên tố, kỹ năng người chơi và tổ đội `1–4` người đã được đặc tả tại `004-combat-skills`, `005-inventory-loot` và `010-multiplayer-social`.
- Ngân sách CPU AI (`< 6 ms` cho `60` quái/khu vực) là mục tiêu thiết kế đề xuất (`proposed / unverified`) sẽ được đo kiểm thực tế khi bước vào giai đoạn triển khai và kiểm thử tải.
