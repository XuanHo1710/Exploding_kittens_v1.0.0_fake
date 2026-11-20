# Feature Specification: 10-Slot Equipment, Set Bonuses, Durability & Deterministic +0 to +10 Weapon Enhancement

**Feature Branch**: `007-equipment-enhancement`

**Created**: 2026-11-19

**Status**: Reviewed (Autonomous Design Baseline — Chờ phê duyệt chuyển sang Implementation)

**Input**: User description: "10-slot equipment loadout, 6 equipment sets (2-pc & 4-pc), durability/repair, dismantling, socketing roadmap, and deterministic 100% success weapon enhancement +0 to +10 gated by Blacksmith level 1-4 with atomic WAL history"

## Clarifications

### Session 2026-11-19 *(Autonomous Design Decisions — Proposed, Chưa có phê duyệt triển khai của người dùng)*

- Q: Khi độ bền (`durability`) của vũ khí hoặc giáp tụt về `0`, trang bị có bị vỡ mất vĩnh viễn không? → A: **Tuyệt đối không vỡ mất**. Trang bị ở `durability = 0` chuyển sang trạng thái Hao mòn (`WORN`), tạm thời chỉ cung cấp `50%` chỉ số gốc (giữ nguyên hiệu ứng bộ set) cho tới khi người chơi sửa lại bằng `csm_repair_kit` (hồi `50%` độ bền tối đa) hoặc bằng `GOLD` tại Lò Rèn/Thợ rèn (hồi `100%`, giảm phí `0%/10%/20%/30%` theo cấp `bld_blacksmith` Lv 1..4) *(Proposed Decision)*.
- Q: Khi trang bị vũ khí hai tay (`GREATSWORD`, `BOW`, `CROSSBOW`, `STAFF`) vào ô `MAIN_HAND` trong lúc ô `OFF_HAND` đang cầm khiên, hệ thống xử lý thế nào? → A: Hệ thống tự động tháo trang bị ở `OFF_HAND` trả về một ô trống trong túi đồ trong cùng một giao dịch nguyên tử; nếu túi đồ không còn ô trống, lệnh trang bị bị từ chối sạch sẽ để tránh mất vật phẩm *(Proposed Decision)*.
- Q: Cơ chế cường hóa vũ khí ở giai đoạn MVP có yếu tố rủi ro thất bại, vỡ đồ hay tụt cấp không? → A: **KHÔNG**. Tuân thủ Nguyên tắc VI của Hiến pháp và `ASM-010`, cường hóa từ `+0` lên tối đa `+10` đạt tỷ lệ thành công chắc chắn **`100%`**, `0%` vỡ đồ, `0%` tụt cấp; độ danh giá của `+10` đến từ chuỗi nguyên liệu phân tầng và cổng cấp độ công trình `bld_blacksmith` Lv 1..4 (`+1..+3`, `+4..+6`, `+7..+8`, `+9..+10`). Khả năng nghiên cứu cường hóa xác suất có bảo vệ cho nội dung hậu MVP nằm ngoài phạm vi MVP *(Mandated by Constitution Principle VI / ASM-010)*.
- Q: Tách trang bị (Dismantling) và Khảm ngọc (Socketing) có phạm vi như thế nào trong MVP? → A: Dismantling khả dụng ngay trong MVP đối với trang bị/vũ khí không đang mặc (hoàn trả `30%–50%` nguyên liệu cơ bản theo bậc độ hiếm, yêu cầu xác nhận kép đối với đồ đã cường hóa `>= +1` hoặc `RARE+`); Socketing được đặt sẵn cấu trúc dữ liệu `0..2` lỗ ngọc trên bản thể vật phẩm và mở khóa lối chơi ở cột mốc M2 *(Proposed Decision)*.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trang bị 10 Ô, Kích hoạt 6 Bộ Set & Tính lại Sức mạnh Chiến đấu (Priority: P1)

Với tư cách là người chơi nhập vai, tôi muốn mặc và tháo vũ khí, giáp và phụ kiện trên đầy đủ 10 ô trang bị (`MAIN_HAND`, `OFF_HAND`, `HELMET`, `CHEST_ARMOR`, `GLOVES`, `BOOTS`, `RING_1`, `RING_2`, `NECKLACE`, `ACCESSORY`), thấy ngay thưởng 2 món và 4 món của các bộ trang bị (6 bộ set tổng thể, 2 bộ MVP) cũng như chỉ số thực chiến và điểm sức mạnh (`Combat Rating`) được máy chủ cập nhật chính xác.

**Why this priority**: Trang bị và bộ set chiếm khoảng `45%` tổng sức mạnh nhân vật và quyết định trực tiếp lối xây dựng đội hình chiến thuật.

**Independent Test**: Có thể kiểm thử độc lập bằng cách trang bị dần 4 món thuộc `set_greenhaven_novice` và `set_mossroot_guard` lên nhân vật mẫu, thử mặc vũ khí vượt cấp hoặc sai class, thử mặc trùng 1 chiếc nhẫn vào cả `RING_1` và `RING_2`, và xác nhận thưởng 2 món/4 món + chỉ số tổng hợp thay đổi chính xác trong hồ sơ JSON nhân vật.

**Acceptance Scenarios**:

1. **Given** nhân vật sở hữu vũ khí và 4 món giáp thuộc bộ `set_mossroot_guard` đạt đủ cấp độ yêu cầu (`levelReq <= Character.level`) và đúng lớp nhân vật, **When** người chơi mặc 2 món rồi mặc đủ 4 món, **Then** máy chủ xác thực quyền sở hữu từng bản thể vật phẩm, gắn vào đúng ô `HELMET`/`CHEST_ARMOR`/`GLOVES`/`BOOTS`, kích hoạt lần lượt thưởng 2 món (`+24 DEF`, `+12% EarthRes`) và thưởng 4 món (`+140 HP`, `+20 Poise`, `+3 HP/s`) rồi tính lại toàn bộ chỉ số tổng hợp và `Combat Rating`.
2. **Given** nhân vật cố mặc vũ khí vượt quá cấp độ hiện tại, không khớp nhóm vũ khí của lớp nhân vật đang chọn hoặc thuộc sở hữu của nhân vật khác, **When** yêu cầu trang bị được gửi tới máy chủ, **Then** hệ thống từ chối sạch sẽ với mã lỗi rõ ràng và không thay đổi bất kỳ ô trang bị nào.
3. **Given** nhân vật tháo một món trang bị đang mặc khi túi đồ đã đầy `100%`, **When** yêu cầu tháo trang bị được gửi, **Then** máy chủ từ chối với lỗi túi đầy và giữ nguyên món đồ trên người để bảo đảm không thất lạc vật phẩm.

---

### User Story 2 - Cường hóa Vũ khí Chắc chắn `100%` Từ `+0` Đến `+10` Gắn Cấp Lò Rèn (Priority: P1)

Với tư cách là chiến binh muốn phát triển sức mạnh dài hạn mà không sợ mất trắng công sức cày cuốc, tôi muốn cường hóa vũ khí chủ lực từ `+0` đến trần tối đa `+10` với tỷ lệ thành công chắc chắn `100%` (không vỡ đồ, không tụt cấp) theo đúng cổng mở khóa của `bld_blacksmith` cấp 1 đến 4, mở khóa cột mốc đặc biệt ở `+5` và `+10`, và lưu lịch sử cường hóa minh bạch cùng sổ cái tiền tệ trong một giao dịch nguyên tử.

**Why this priority**: Đây là một trong những cam kết cốt lõi của Nguyên tắc VI (Fair Progression), kết nối chặt chẽ chuỗi vòng lặp Khai khoáng → Săn quái → Boss Raid → Xây Lò Rèn → Cường hóa `+10`.

**Independent Test**: Nâng cấp một vũ khí MVP (`wpn_iron_longsword`) xuyên suốt 10 cấp `+0 → +10` theo từng bậc nâng của `bld_blacksmith` Lv 1→4; thử cường hóa vượt cấp Lò Rèn (`+3 → +4` khi Lò Rèn Lv 1), thử cường hóa vượt trần `+10`, và bắn đồng thời 10 yêu cầu nâng cấp song song để xác nhận `100%` tuân thủ quy tắc, không trừ tiền sai và ghi đủ 10 dòng lịch sử + sổ cái tiền tệ khớp nhau.

**Acceptance Scenarios**:

1. **Given** nhân vật có `bld_blacksmith` ở cấp tương ứng (Lv 1 cho `+1..+3`, Lv 2 cho `+4..+6`, Lv 3 cho `+7..+8`, Lv 4 cho `+9..+10`), đủ `GOLD` và đủ nguyên liệu chuẩn (hỗ trợ tự động rút từ rương nhà khi `bld_storage >= Lv 2`), **When** người chơi cường hóa vũ khí từ `+N` lên `+(N+1)`, **Then** nâng cấp thành công chắc chắn `100%`, cộng chính xác phần trăm và chỉ số ATK cộng thẳng theo bảng chuẩn, đồng thời trừ tiền/nguyên liệu, cập nhật chỉ số nhân vật, ghi 1 dòng lịch sử cường hóa và 1 bút toán sổ cái tiền tệ trong cùng một giao dịch nguyên tử.
2. **Given** vũ khí đạt cột mốc **`+5`** hoặc **`+10`**, **When** giao dịch cường hóa hoàn tất, **Then** máy chủ tự động kích hoạt đặc quyền cột mốc (`+5`: hiệu ứng ánh sáng `Weapon Glow I` & `+3% Crit Rate`; `+10`: hào quang `Radiant Aura II`, `+8% Boss Poise Damage` & `+5% Skill Scaling`) trong khi vẫn giữ mọi chỉ số dưới trần cân bằng cứng.
3. **Given** `bld_blacksmith` mới ở Lv 1 và vũ khí đang ở `+3`, hoặc vũ khí đã đạt trần tối đa `+10`, **When** người chơi gửi lệnh cường hóa tiếp, **Then** máy chủ từ chối với lỗi thiếu cấp Lò Rèn hoặc đã đạt trần `+10` và hoàn toàn không trừ `GOLD` hay nguyên liệu.

---

### User Story 3 - Độ bền, Sửa chữa, Tách Trang bị (Dismantle) & Lộ trình Khảm ngọc (Priority: P2)

Với tư cách là người chơi thám hiểm lâu dài, tôi muốn theo dõi độ bền của vũ khí và giáp, sửa nhanh giữa trận bằng `csm_repair_kit` hoặc sửa đầy `100%` có ưu đãi giá tại Lò Rèn, tách các trang bị thừa thành nguyên liệu hữu ích thay vì bỏ phí, và giữ sẵn lỗ khảm ngọc cho bản mở rộng tương lai.

**Why this priority**: Tạo nguồn tiêu thụ Gold lành mạnh (currency sink), mang lại giá trị kinh tế cho mọi món đồ nhặt thừa và chuẩn bị nền dữ liệu tương thích ngược cho tính năng khảm ngọc M2+.

**Independent Test**: Giảm độ bền một thanh kiếm về `0` kiểm tra trạng thái `WORN` (`50%` base stats, không mất đồ), sửa `+50%` bằng `csm_repair_kit`, sửa đầy `100%` bằng Gold tại `bld_blacksmith` Lv 3 (kiểm tra giảm giá `20%`), và tách một trang bị không mặc thành nguyên liệu (trong khi chặn tách trang bị đang mặc).

**Acceptance Scenarios**:

1. **Given** một vũ khí hoặc áo giáp bị giảm độ bền xuống dưới mức tối đa (kể cả về `0`), **When** người chơi dùng `csm_repair_kit` ngoài thực địa hoặc chọn sửa tại Lò Rèn bằng `GOLD`, **Then** độ bền phục hồi tương ứng (`+50%` tối đa cho bộ sửa nhanh, `100%` tối đa cho Lò Rèn kèm chiết khấu `0%/10%/20%/30%` theo cấp Lò Rèn), giao dịch trừ đồ/tiền ghi nguyên tử vào kho và sổ cái tiền tệ.
2. **Given** người chơi có một trang bị thừa không đang mặc trên bất kỳ ô nào, **When** người chơi thực hiện tách trang bị (kèm xác nhận nếu đã cường hóa `>= +1` hoặc độ hiếm `RARE+`), **Then** hệ thống xóa bản thể trang bị đó và hoàn trả `30%–50%` nguyên liệu tinh luyện chuẩn vào túi đồ trong cùng một giao dịch nguyên tử (hoặc từ chối nếu túi không đủ chỗ chứa nguyên liệu hoàn trả).

---

### Edge Cases

- **Bắn đồng thời 10 yêu cầu cường hóa lên cùng một vũ khí**: Khóa tuần tự theo nhân vật/kho đồ và khóa chống trùng lặp (`idempotencyKey`) bảo đảm các yêu cầu trùng key chỉ chạy đúng `1` lần; các yêu cầu khác key chạy tuần tự theo cấp hiện hành mới nhất, không bao giờ trừ nguyên liệu hai lần cho cùng một cấp hay nâng vượt cấp Lò Rèn / vượt `+10`.
- **Cố trang bị cùng một bản thể nhẫn (`instanceId`) vào cả `RING_1` và `RING_2`**: Máy chủ kiểm tra tính duy nhất của mọi `instanceId` trên toàn bộ 10 ô; nếu món đó đang ở `RING_1` mà gán vào `RING_2` sẽ thực hiện hoán đổi sạch giữa hai ô chứ không tạo bản sao.
- **Đổi Hero đang điều khiển (`activeHeroId`) sang lớp nhân vật không dùng được vũ khí đang mặc**: Hệ thống tự động kiểm tra tương thích lớp nhân vật; vũ khí không hợp lệ ở `MAIN_HAND` được tự động tháo an toàn về túi đồ (hoặc chặn đổi hero nếu túi đầy) để không thể dùng kỹ năng sai loại vũ khí.
- **Cố tách (`dismantle`) trang bị đang mặc hoặc vật phẩm không phải trang bị/vũ khí**: Máy chủ từ chối tức thì, yêu cầu tháo trang bị trước khi tách.
- **Sập máy chủ giữa giao dịch cường hóa `+9 → +10`**: Giao dịch ghi trước cục bộ (WAL JSON) chứa trọn vẹn 4 tệp đích (`character`, `inventory`, `upgrade-history`, `currency-ledger`), bảo đảm sau khi khởi động lại không bao giờ xảy ra tình trạng mất `4` `mat_thornback_heart` và `8,000 GOLD` mà vũ khí vẫn ở `+9`.
- **Cố dùng tính năng Khảm ngọc trong giai đoạn MVP**: Trường lỗ khảm (`sockets`) được bảo toàn hợp lệ trên bản thể trang bị, nhưng thao tác gắn/gỡ ngọc trả mã thông báo lộ trình M2 chưa mở khóa thay vì lỗi hệ thống.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI quản lý đầy đủ `10` ô trang bị cho mỗi nhân vật (`MAIN_HAND`, `OFF_HAND`, `HELMET`, `CHEST_ARMOR`, `GLOVES`, `BOOTS`, `RING_1`, `RING_2`, `NECKLACE`, `ACCESSORY`), xác thực quyền sở hữu (`ownerCharacterId`), cấp độ yêu cầu (`levelReq`), lớp nhân vật hợp lệ (`allowedClasses`), quy tắc vũ khí hai tay với `OFF_HAND`, tính duy nhất không trùng bản thể giữa các ô và chỗ trống túi khi tháo đồ.
- **FR-002**: Hệ thống PHẢI tự động tính kích hoạt thưởng **2 món** và **4 món** cho toàn bộ `6` bộ trang bị chuẩn (`set_greenhaven_novice`, `set_mossroot_guard`, `set_ironpeak_forge`, `set_crystal_arcanist`, `set_frostbound_warden`, `set_abyssal_sovereign`) và tái tính tức thì chỉ số tổng hợp + `Combat Rating` trên máy chủ sau mỗi thay đổi trang bị, độ bền hay cường hóa.
- **FR-003**: Hệ thống PHẢI triển khai cơ chế cường hóa vũ khí chắc chắn **`100%` thành công** từ **`+0` đến trần cứng `+10`** (`0 <= enhancementLevel <= 10`, tuyệt đối không vượt `+10`, `0%` vỡ đồ, `0%` tụt cấp trong MVP), đọc chi phí Gold, nguyên liệu 2–3 loại và chỉ số cộng thêm (`+8%..+130%` & `+4..+96` ATK) trực tiếp từ bảng cấu hình chuẩn duy nhất.
- **FR-004**: Hệ thống PHẢI cưỡng chế cổng mở khóa theo cấp độ công trình Lò Rèn (`bld_blacksmith`) thực tế trong dữ liệu lãnh địa của chính nhân vật: cấp `1` mở `+1..+3`, cấp `2` mở `+4..+6`, cấp `3` mở `+7..+8`, cấp `4` mở `+9..+10` (hỗ trợ tự động lấy nguyên liệu từ rương nhà khi `bld_storage >= Lv 2`).
- **FR-005**: Hệ thống PHẢI kích hoạt chính xác hai cột mốc đặc quyền cường hóa tại **`+5`** (`Weapon Glow I` + `+3% Crit Rate`) và **`+10`** (`Radiant Aura II` + `+8% Boss Poise Damage` + `+5% Skill Scaling`) trên máy chủ và đồng bộ hiển thị hào quang pixel tương ứng.
- **FR-006**: Mọi giao dịch cường hóa vũ khí PHẢI thực thi nguyên tử trong một cam kết nhật ký ghi trước cục bộ (WAL JSON) duy nhất với khóa tuần tự và `idempotencyKey`, đồng bộ ghi cả hồ sơ nhân vật (Gold + chỉ số mới), kho đồ (trừ nguyên liệu + tăng `enhancementLevel`), lịch sử cường hóa cá nhân (`upgrade-history-<charId>.json`) và sổ cái tiền tệ (`currency-ledger-YYYY-MM.json`).
- **FR-007**: Hệ thống PHẢI theo dõi độ bền (`0..durabilityMax`) cho vũ khí và giáp với trạng thái `WORN` (`50%` chỉ số gốc khi về `0`, không phá hủy vật phẩm), hỗ trợ sửa nhanh `+50%` bằng `csm_repair_kit` và sửa đầy `100%` bằng `GOLD` kèm chiết khấu `0%/10%/20%/30%` theo cấp `bld_blacksmith` Lv 1..4 (ghi nhận sổ cái tiền tệ).
- **FR-008**: Hệ thống PHẢI hỗ trợ tách trang bị/vũ khí không đang mặc (Dismantling) hoàn trả `30%–50%` nguyên liệu cơ bản trong giao dịch nguyên tử (có cờ xác nhận cho vật phẩm `>= +1` hoặc `RARE+`), đồng thời giữ tương thích ngược cấu trúc `0..2` lỗ khảm ngọc (`sockets`) cho lộ trình M2+.

### Key Entities *(include if feature involves data)*

- **EquipmentLoadout**: Bản đồ `10` ô trang bị gắn trên hồ sơ nhân vật JSON cục bộ, ánh xạ từng ô tới mã bản thể vật phẩm (`instanceId`) duy nhất thuộc sở hữu của nhân vật hoặc `null`.
- **ActiveSetBonusState**: Trạng thái tính toán động số mảnh đang mặc của từng bộ trong `6` bộ trang bị và cờ kích hoạt mốc `2` món / `4` món.
- **EnhancementTierRule**: Cấu hình chuẩn bất biến cho `10` bậc cường hóa `+0 → +10` gồm cấp Lò Rèn yêu cầu, tỷ lệ thành công `100%`, không vỡ/tụt, thưởng chỉ số cộng dồn, đặc quyền mốc `+5`/`+10`, chi phí Gold và danh sách nguyên liệu.
- **UpgradeHistoryRecord**: Bản ghi bất biến trong tệp lịch sử cường hóa cá nhân lưu chi tiết từng lần nâng cấp `+N → +(N+1)`, khóa chống lặp, Gold tiêu tốn, nguyên liệu tiêu thụ và cấp Lò Rèn tại thời điểm nâng.
- **DurabilityRepairRecord**: Dữ liệu kiểm toán cho thao tác sửa chữa độ bền gồm phương thức sửa (`GOLD` tại Lò Rèn hoặc `csm_repair_kit`), độ bền trước/sau và phần trăm chiết khấu Lò Rèn đã áp dụng.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Toàn bộ chuỗi cường hóa `+0 → +10` trên vũ khí MVP đạt tỷ lệ thành công chính xác `100%` (`0` vỡ đồ, `0` tụt cấp), khớp `100%` công thức ATK, chi phí `26,400 GOLD` tổng cộng, đặc quyền mốc `+5`/`+10` và cổng `bld_blacksmith` Lv 1..4 theo bảng cân bằng chuẩn.
- **SC-002**: `100%` yêu cầu cường hóa vượt `+10`, thiếu cấp Lò Rèn, thiếu nguyên liệu/Gold, hoặc gửi đồng thời 10 yêu cầu song song đều được xử lý an toàn với `0` nhân bản vật phẩm, `0` số dư âm và `100%` khớp đối soát giữa `UpgradeHistory` và `CurrencyLedger`.
- **SC-003**: `100%` kịch bản mặc/tháo 10 ô trang bị, đổi vũ khí 2 tay, kích hoạt thưởng 2 món/4 món của cả 6 bộ set, trạng thái `WORN` ở `durability = 0`, sửa chữa có chiết khấu và tách trang bị hoạt động đúng quy tắc không làm mất bất kỳ vật phẩm nào.
- **SC-004**: Trong `50` bài kiểm thử giả lập ngắt tiến trình đột ngột giữa giao dịch WAL 4 tệp của cường hóa vũ khí, tỷ lệ khôi phục đồng nhất giữa tiền tệ, nguyên liệu, cấp vũ khí và lịch sử cường hóa đạt `100%`; thời gian hoàn tất giao dịch cường hóa đạt mục tiêu `p95 < 20 ms` trên ổ đĩa cục bộ (`proposed / unverified`).

## Assumptions

- Tính năng này phụ thuộc vào hạ tầng giao dịch tệp JSON cục bộ của `001-foundation-game-engine`, hồ sơ nhân vật của `002-auth-character`, bộ quy tắc tính chỉ số chiến đấu của `004-combat-skills` (áp thưởng bộ set, đặc quyền mốc `+5`/`+10` và trạng thái hao mòn `WORN`), kho đồ & sổ cái tiền tệ nguyên tử của `005-inventory-loot`, và đọc cấp độ `bld_blacksmith`/`bld_storage` từ dữ liệu lãnh địa nhân vật (được quản lý xây dựng đầy đủ ở `008-housing-farming`, hỗ trợ dữ liệu lãnh địa mẫu hoặc NPC Thợ rèn Garrik khi kiểm thử độc lập).
- Nhịp cày nguyên liệu nâng cấp `+0 → +10` ước tính khoảng `22.35 giờ` (Casual), `13.74 giờ` (Regular) và `8.90 giờ` (Hardcore) từ `docs/balancing/weapon-upgrade-costs.csv` là mô hình cân bằng dự kiến và sẽ được tinh chỉnh qua playtest thực tế.
- Mọi chỉ số hiệu năng ghi giao dịch (`p95 < 20 ms`) mang nhãn `proposed / unverified` cho đến khi chạy kiểm thử hiệu năng ở giai đoạn triển khai.
