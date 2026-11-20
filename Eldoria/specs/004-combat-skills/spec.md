# Feature Specification: Real-Time Action Combat & 60-Skill Data-Driven Engine

**Feature Branch**: `004-combat-skills`

**Created**: 2026-11-19

**Status**: Reviewed (Autonomous Design Baseline — Chờ phê duyệt chuyển sang Implementation)

**Input**: User description: "Real-time 20Hz server-authoritative action combat, hitboxes, basic combos, dodge i-frame, block/perfect parry, 9-element synergy, CC diminishing returns, stat hard caps, and 60-skill (15 MVP) data-driven execution engine"

## Clarifications

### Session 2026-11-19 *(Autonomous Design Decisions — Proposed, Chưa có phê duyệt triển khai của người dùng)*

- Q: Khi người chơi nhấn Dodge hoặc Block trong lúc đang ở pha thu chiêu (Recovery) của đòn đánh thường hay kỹ năng, hệ thống có cho phép hủy hoạt ảnh không? → A: Có, trong **`40%` cuối của pha Recovery**, người chơi được phép hủy Recovery bằng Dodge hoặc Block/Parry (và bộ đệm đầu vào `150 ms` giữ lệnh kỹ năng tiếp theo), nhưng tuyệt đối không cho phép hủy pha Startup/Active để spam sát thương *(Proposed Decision — `07-skill-system.md`)*.
- Q: Thời gian giữ nhân vật trong thế giới khi người chơi ngắt kết nối đột ngột giữa giao tranh (Combat Logout Grace) là bao nhiêu? → A: Chuẩn hóa **`5 giây`** giữ nhân vật trong vùng chiến đấu trước khi ngắt khỏi bản đồ và lưu checkpoint JSON, ngăn hành vi tắt đột ngột né chết mà không gây bất lợi quá lâu khi mất mạng thật *(Proposed Decision — thống nhất theo `anti-cheat-design.md` & `SEC-013`)*.
- Q: Làm sao cân bằng độ hoành tráng của Ultimate 4 người chơi Co-op mà vẫn bảo vệ khả năng quan sát đòn nguy hiểm của Boss? → A: Mọi VFX vùng mặt đất của người chơi bắt buộc hiển thị bên dưới lớp cảnh báo đòn Boss với độ mờ tối đa `45%` (`alpha <= 0.45`), không nhấp nháy toàn màn hình vượt quá `3 Hz`, hỗ trợ giảm độ đậm hiệu ứng đồng đội và cho phép tắt hoàn toàn rung màn hình (`Camera Shake 0%–100%`) *(Mandated by Constitution Principle V / Proposed Parameters)*.
- Q: Làm sao phân bổ 60 kỹ năng trên 12 nhân vật và phạm vi MVP? → A: Mỗi nhân vật sở hữu 1 chuỗi đánh thường đặc trưng (`Basic Attack`) kèm đúng 5 kỹ năng độc bản (1 Passive, 3 Active, 1 Ultimate → `12 × 5 = 60` kỹ năng); MVP triển khai trọn vẹn `15` kỹ năng của 3 nhân vật khởi đầu (`chr_kael_vanguard`, `chr_lyra_windrunner`, `chr_seraphina_dawn`) trên cùng một động cơ dữ liệu chung *(Proposed Decision — ASM-011)*.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Chiến đấu Hành động Thời gian thực: Combo, Né đòn Bất tử & Phản đòn Chuẩn (Priority: P1)

Với tư cách là người chơi hành động, tôi muốn thực hiện chuỗi đánh thường 3 đòn mượt mà, né đòn với khung bất tử chính xác (`300 ms`), đỡ đòn thường hoặc canh phản đòn chuẩn (`Perfect Parry` `200 ms`) trước các đòn đánh của quái vật và Boss, trong khi mọi kết quả trúng đích và sát thương đều được máy chủ xác thực công bằng.

**Why this priority**: Cảm giác đánh, né, đỡ và xác thực sát thương tại máy chủ là trái tim của trụ cột "Chiến đấu phản hồi tốt, có chiều sâu kỹ năng" và "Multiplayer công bằng, chống gian lận".

**Independent Test**: Có thể kiểm thử độc lập bằng cách đưa một nhân vật MVP (`chr_kael_vanguard`) vào vùng chiến đấu với quái vật/Boss mô phỏng, thực hiện chuỗi combo 3 đòn, né đòn đúng cửa sổ `300 ms`, đỡ thường vs phản đòn trong `200 ms`, và thử gửi gói sát thương giả mạo từ client để xác nhận máy chủ tính đúng sát thương/Poise và bác bỏ `100%` giá trị gian lận.

**Acceptance Scenarios**:

1. **Given** nhân vật đang cầm vũ khí hợp lệ trong vùng chiến đấu (`isSafeZone = false`), **When** người chơi thực hiện 3 đòn đánh thường liên tiếp trong cửa sổ nối combo `750 ms`, **Then** máy chủ kiểm tra hình học trúng đích, áp dụng hệ số từng đòn, hồi `3–6 MP/hit` khi trúng mục tiêu và trừ HP/Poise mục tiêu theo công thức 5 bước.
2. **Given** nhân vật còn ít nhất `20` Stamina và đã hết hồi chiêu Dodge (`1,200 ms`), **When** người chơi kích hoạt Dodge `100 ms` trước khi đòn đánh thường của Boss chạm tới, **Then** máy chủ trừ `20` Stamina, kích hoạt `300 ms` bất tử (`i-frame`), nhân vật lướt `112 px` không xuyên tường và nhận `0` sát thương lẫn `0` hiệu ứng khống chế thường.
3. **Given** nhân vật cầm vũ khí cận chiến kích hoạt thế đỡ đòn (`Block`), **When** đòn đánh trực diện (góc `120°`) chạm vào trong `200 ms` đầu tiên, **Then** máy chủ kích hoạt `Perfect Parry` giảm `100%` sát thương, không tốn Stamina, hồi `+15` Stamina và phản ngược `25%` sát thương Poise (tối thiểu `25` Poise) lên kẻ tấn công; nếu chạm sau `200 ms`, Block thường giảm `60%` sát thương, trừ `12` Stamina và gây `Guard Break` choáng `1.0 giây` nếu Stamina về `0`.

---

### User Story 2 - Động cơ 60 Kỹ năng Hướng dữ liệu, Cộng hưởng 9 Nguyên tố & Khống chế Công bằng (Priority: P1)

Với tư cách là người chơi và nhà thiết kế cân bằng, tôi muốn toàn bộ 60 kỹ năng (15 kỹ năng MVP) vận hành trực tiếp từ tệp danh mục kỹ năng chuẩn theo chu kỳ thời gian chính xác trên máy chủ (`cast → startup → active → recovery`), kết hợp cộng hưởng 9 nguyên tố và cơ chế giảm dần hiệu lực khống chế (CC Diminishing Returns) để không tồn tại lỗi đánh lặp vô hạn hay phá vỡ cân bằng.

**Why this priority**: Bảo đảm mọi nhân vật có bản sắc chiến thuật rõ ràng, phối hợp tổ đội có chiều sâu và thực thi nguyên tắc "Một nguồn dữ liệu chuẩn" + chống power creep.

**Independent Test**: Kiểm thử độc lập bằng cách thi triển 15 kỹ năng MVP (gồm cận chiến hình quạt/đường thẳng, đạn đạo/boomerang, vùng AoE mặt đất, hồi máu/khiên và 3 Ultimate), kiểm tra chuỗi phản ứng nguyên tố (`Melt`, `Swirl`, `Eclipse Burst`) có ICD `2,000 ms`, và dồn 4 kỹ năng choáng liên tiếp trong `20 giây` vào một mục tiêu để xác nhận giảm dần `100% → 50% → 25% → Miễn nhiễm`.

**Acceptance Scenarios**:

1. **Given** nhân vật có đủ MP/Stamina, đúng loại vũ khí và kỹ năng đã hết hồi chiêu trên máy chủ, **When** người chơi thi triển một kỹ năng Active hoặc Ultimate từ danh mục chuẩn, **Then** máy chủ thực thi lần lượt các pha `castTimeMs → startupMs → activeMs → recoveryMs`, trừ tài nguyên và bật hồi chiêu ở pha khởi động, và chỉ gây sát thương hoặc sinh đạn đạo/vùng hiệu ứng trong pha `activeMs`.
2. **Given** kẻ địch đang mang hiệu ứng nền của một nguyên tố (ví dụ `Chill` hệ Băng), **When** đòn tấn công nguyên tố tương hợp (ví dụ hệ Lửa) đánh trúng ngoài thời gian chờ nội tại `2,000 ms` (ICD), **Then** máy chủ kích hoạt phản ứng tương ứng (`Melt x1.35`, `Overload x1.35`, `Eclipse Burst x1.35`, `Electro-Shock x1.25`, `Vaporize x1.25`, `Swirl x1.20`...) và áp dụng hiệu ứng chiến thuật đi kèm.
3. **Given** một mục tiêu đã chịu 3 lần hiệu ứng khống chế cứng (`STUN`/`FREEZE`/`KNOCKDOWN`/`SILENCE`) trong cửa sổ `20 giây`, **When** đòn khống chế cứng thứ 4 đánh trúng, **Then** thời lượng bị giảm đúng `100% → 50% → 25% → 0% (IMMUNE)` và Boss luôn chuyển hóa khống chế cứng thành thưởng Poise thay vì bị đóng băng/choáng mất cơ chế.

---

### User Story 3 - Khả năng Đọc Chiến trường của Ultimate, Giới hạn Chỉ số & Vòng đời Tử trận/Hồi sinh (Priority: P2)

Với tư cách là thành viên tổ đội 4 người trong hầm ngục, tôi muốn khi cả đội tung Ultimate cùng lúc thì vòng cảnh báo đòn nguy hiểm của Boss vẫn hiện rõ nét không bị che lấp, các chỉ số nhân vật luôn tuân thủ trần cân bằng cứng, và khi tử trận tôi được hồi sinh an toàn mà không bị mất vĩnh viễn trang bị đã dày công rèn.

**Why this priority**: Ngăn hiện tượng "mù màn hình" phổ biến ở game Action RPG Co-op và bảo vệ tính công bằng dài hạn của nền kinh tế chiến đấu.

**Independent Test**: Mô phỏng 4 nhân vật đồng thời thi triển Ultimate trong khi Boss kích hoạt vùng cảnh báo đòn đỏ; kiểm tra thứ tự lớp hiển thị, độ mờ VFX và tùy chọn tắt rung màn hình; kiểm thử nhân vật mang trang bị/buff vượt ngưỡng vẫn bị kẹp cứng dưới trần chỉ số và kiểm thử hồi sinh giữ nguyên 100% trang bị.

**Acceptance Scenarios**:

1. **Given** Boss đang hiển thị vùng cảnh báo đòn tấn công trên sàn đấu, **When** từ 1 đến 4 người chơi cùng kích hoạt Ultimate (`Crimson Crescent`, `Tempest Arrowstorm`, `Solar Judgment`...), **Then** toàn bộ hiệu ứng vùng mặt đất của người chơi luôn hiển thị bên dưới lớp cảnh báo Boss với độ mờ không vượt `45%` và không tạo chớp sáng toàn màn hình vượt `3 Hz`.
2. **Given** nhân vật sở hữu tổng chỉ số từ cấp độ, điểm thuộc tính, trang bị và món ăn vượt quá giới hạn cân bằng, **When** máy chủ tính toán chỉ số thực chiến, **Then** hệ thống áp trần cứng `CritRate <= 75%`, `CritDamage <= 250%`, `CDR <= 40%`, `AttackSpeedMult <= 1.60x`, `DefPenPct <= 50%`, `ElementalRes ∈ [-35%, +70%]` và `MaxStamina <= 260`.
3. **Given** lượng HP của nhân vật tụt về `0`, **When** máy chủ xác nhận trạng thái tử trận, **Then** nhân vật dừng toàn bộ hành động chiến đấu, xóa buff/debuff tạm thời, hiển thị lựa chọn hồi sinh an toàn tại làng hoặc cửa hầm ngục và **giữ nguyên 100% trang bị cũng như cấp độ**.

---

### Edge Cases

- **Hai đòn kết liễu chạm cùng một chu kỳ mô phỏng**: Máy chủ xử lý theo thứ tự xác định trong hàng đợi; mục tiêu chỉ bị hạ gục đúng 1 lần, không kích hoạt trùng sự kiện hạ gục hay nhân đôi chiến lợi phẩm.
- **Đạn tốc độ cao xuyên qua mục tiêu mỏng (Tunneling)**: Máy chủ kiểm tra va chạm dọc toàn bộ đoạn đường di chuyển trong chu kỳ tick (swept collision) để đạn nhanh (`<= 640 px/s`) không bao giờ bỏ sót mục tiêu.
- **Hết Stamina về `0` (Exhaustion)**: Nhân vật rơi vào trạng thái Kiệt sức trong `1,500 ms` (không thể Sprint hay Dodge, tốc độ hồi Stamina giảm `50%` cho tới khi vượt `25` Stamina).
- **Lạm dụng ngắt kết nối khi sắp chết**: Nhân vật vẫn tồn tại trong vùng chiến đấu `5 giây` (Combat Logout Grace) trước khi rời bản đồ và lưu checkpoint tệp JSON cục bộ; mọi tiêu hao MP/Stamina/bình thuốc đã sử dụng không bị hoàn tác.
- **Một đòn sát thương lớn vượt ngưỡng chuyển Phase Boss**: Cơ chế bảo vệ sàn HP theo giai đoạn (Phase HP Floor Guard) chặn lượng máu Boss dừng đúng ngưỡng chuyển Phase để đảm bảo cơ chế chiến đấu không bị bỏ qua, đồng thời giới hạn tối đa `3` lần phá giáp (`STAGGERED`) mỗi Phase.
- **Kỹ năng bị ngắt khi đang niệm (`CASTING`)**: Nếu nhân vật chịu khống chế cứng hoặc hiệu ứng Interrupt trong pha `castTimeMs`, kỹ năng bị hủy trước khi gây sát thương, hoàn trả `50%` MP và áp hồi chiêu phạt ngắn `2,000 ms`.
- **Chiến đấu trong vùng an toàn (`isSafeZone = true`)**: Mọi hành vi gây sát thương lên người chơi hoặc NPC tại Greenhaven Village bị vô hiệu hóa hoàn toàn ở cấp máy chủ.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI mô phỏng toàn bộ chiến đấu theo mô hình máy chủ quyết định (server-authoritative) ở chu kỳ cố định mục tiêu `20 Hz` trong bộ nhớ vận hành, tuyệt đối không tin tưởng sát thương, kết quả trúng đích, chí mạng, i-frame hay thời gian hồi chiêu do phía người chơi gửi lên.
- **FR-002**: Hệ thống PHẢI hỗ trợ chuỗi đánh thường (`Basic Attack` 3 đòn chuẩn / 4 đòn cho lớp nhanh) với cửa sổ nối combo `750 ms`, bộ đệm đầu vào `150 ms`, phục hồi `3–6 MP/hit` khi trúng mục tiêu, và kiểm tra hình học trúng đích 6 dạng (`ARC`, `CIRCLE`, `LINE`, `RECT`, `PROJECTILE` chống xuyên đạn, `SELF`) kèm giới hạn số mục tiêu tối đa mỗi lượt.
- **FR-003**: Hệ thống PHẢI triển khai đầy đủ cơ chế phòng thủ chủ động trên máy chủ gồm: `Dodge` (`20` Stamina, `1,200 ms` hồi chiêu không chịu ảnh hưởng bởi CDR, `300 ms` i-frame, lướt `112 px` kiểm tra va chạm tường), `Block` (giảm `60%` sát thương trong góc `120°` phía trước, tốn `12` Stamina/đòn, `Guard Break` choáng `1.0s` khi Stamina chạm `0`), `Perfect Parry` (cửa sổ `200 ms` đầu tiên, giảm `100%` sát thương, tốn `0` Stamina, hồi `+15` Stamina và phản `25%` Poise, tối thiểu `25` Poise) và trạng thái Kiệt sức (`1,500 ms` khi Stamina chạm `0`).
- **FR-004**: Hệ thống PHẢI áp dụng chính xác công thức sát thương 5 bước và toàn bộ trần cân bằng cứng (`CritRate <= 75%`, `CritDamage <= 250%`, `CDR <= 40%`, `AttackSpeedMult <= 1.60x`, `DefPenPct <= 50%`, `ElementalRes ∈ [-35%, +70%]`, `MaxStamina <= 260`, hồi chiêu tối thiểu `400 ms`, nhịp đánh tối thiểu `280 ms`).
- **FR-005**: Hệ thống PHẢI vận hành ma trận khắc hệ 9 nguyên tố (`FIRE`, `WATER`, `EARTH`, `WIND`, `LIGHTNING`, `FROST`, `LIGHT`, `SHADOW`, `NEUTRAL` với hệ số `1.25x / 1.20x / 0.85x / 1.00x`) và 9 phản ứng nguyên tố có thời gian chờ nội tại `2,000 ms` mỗi cặp/mục tiêu cùng trần hệ số phản ứng `<= 1.35x`.
- **FR-006**: Hệ thống PHẢI thực thi bộ đếm giảm dần hiệu lực khống chế (CC Diminishing Returns) trong cửa sổ trượt `20 giây` (`100% → 50% → 25% → Miễn nhiễm`), quy tắc cộng dồn Buff/Debuff/Shield (FIFO theo thời điểm hết hạn)/DoT (`1,000 ms`/nhịp), và cơ chế Boss Poise/Stagger + Phase HP Floor Guard.
- **FR-007**: Hệ thống PHẢI thực thi trọn vẹn động cơ kỹ năng hướng dữ liệu đọc trực tiếp từ danh mục 60 kỹ năng chuẩn (15 kỹ năng MVP thuộc 3 nhân vật khởi đầu) theo đúng máy trạng thái thời gian `castTimeMs → startupMs → activeMs → recoveryMs`, hỗ trợ hủy `40%` cuối pha Recovery bằng Dodge/Block, tăng bậc tuyến tính `Rank 1..maxRank`, hệ số tách biệt PvE/PvP và lưu cấp kỹ năng/thông thạo bền vững trên tệp JSON nhân vật cục bộ.
- **FR-008**: Hệ thống PHẢI bảo đảm khả năng đọc chiến trường cho mọi kỹ năng và Ultimate: cảnh báo đòn Boss luôn hiển thị trên lớp hiệu ứng mặt đất của người chơi (`alpha <= 0.45`), cấm nhấp nháy toàn màn hình quá `3 Hz`, hỗ trợ giảm đậm hiệu ứng đồng đội, tắt/giảm `Camera Shake` (`0%–100%`), hit-stop cục bộ (`40–65 ms`) không bao giờ làm chậm đồng hồ máy chủ, và quy trình tử trận/hồi sinh an toàn không làm mất trang bị.
- **FR-009**: Hệ thống PHẢI áp dụng giới hạn tần suất lệnh chiến đấu, kiểm tra số thứ tự gói tin tăng dần (`seq`) chống phát lại, xác thực tầm đánh/góc nhìn và duy trì thời gian chờ ngắt kết nối trong giao tranh (`5 giây`) trước khi lưu checkpoint trạng thái HP/MP/Stamina xuống tệp JSON nhân vật theo chính sách đánh dấu thay đổi (`30 giây` định kỳ, tuyệt đối không ghi đĩa trong từng tick chiến đấu).

### Key Entities *(include if feature involves data)*

- **CombatActorRuntime**: Trạng thái chiến đấu thời gian thực trong bộ nhớ của một thực thể (người chơi, quái vật, Boss, vật triệu hồi) gồm HP, MP, Stamina, Poise, trạng thái hành động hiện hành, mốc hết hạn i-frame/parry/dodge/kiệt sức, bước combo và số thứ tự lệnh gần nhất.
- **DerivedCombatStats**: Bộ chỉ số chiến đấu tổng hợp đã áp toàn bộ trần cứng (`ATK`, `DEF`, `CritRate`, `CritDamage`, `CDR`, `AttackSpeedMult`, `DefPenPct`, `ElementalRes`) được máy chủ tính lại mỗi khi cấp độ, điểm thuộc tính, trang bị hoặc món ăn thay đổi.
- **SkillRuntimeExecution**: Phiên thực thi của một kỹ năng đang diễn ra trong thế giới gồm người tung chiêu, mã kỹ năng, bậc kỹ năng, pha hiện hành (`CASTING`/`STARTUP`/`ACTIVE`/`RECOVERY`), hình học vùng đánh, hướng ngắm và danh sách mục tiêu đã trúng.
- **ActiveStatusEffect**: Hiệu ứng trạng thái đang gắn trên thực thể (Buff, Debuff, Shield, DoT, CC, Zone) kèm số tầng cộng dồn, thời lượng còn lại và nhịp kích hoạt kế tiếp.
- **CcDiminishingTracker**: Bộ theo dõi giảm dần hiệu lực khống chế theo từng nhóm CC trên mỗi mục tiêu trong cửa sổ trượt `20 giây`.
- **CharacterSkill**: Dữ liệu bền vững lưu trong hồ sơ nhân vật JSON cục bộ gồm mã kỹ năng đã mở khóa, bậc nâng cấp hiện tại, điểm thông thạo và vị trí phím tắt trên thanh kỹ năng.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `100%` các kịch bản tính toán công thức 5 bước, 9 nguyên tố/phản ứng (ICD `2,000 ms`), trần cứng chỉ số, Dodge `300 ms` i-frame, Block `60%` và Perfect Parry `200 ms` khớp chính xác với bảng thông số cân bằng chuẩn không có sai số ngoài biến thiên `U(0.96, 1.04)` được kiểm soát.
- **SC-002**: `100%` nỗ lực gian lận từ phía client (gửi sát thương giả, gọi kỹ năng sớm hơn hồi chiêu, tấn công ngoài tầm/xuyên tường, spam vượt tần suất, phát lại gói cũ) bị máy chủ bác bỏ với mã lỗi rõ ràng và ghi nhận điểm nghi vấn.
- **SC-003**: Toàn bộ `15/15` kỹ năng MVP (và kiểm chứng nạp `60/60` kỹ năng catalog) thực thi đúng chu kỳ `castTimeMs → startupMs → activeMs → recoveryMs` và giảm dần CC `100% → 50% → 25% → Miễn nhiễm` ngăn triệt để lỗi khóa chết mục tiêu.
- **SC-004**: Trong tình huống 4 người chơi kích hoạt Ultimate đồng thời khi Boss đang báo đòn nguy hiểm, `100%` vùng cảnh báo Boss vẫn hiển thị rõ phía trên hiệu ứng mặt đất người chơi và thời gian xử lý chu kỳ mô phỏng chiến đấu máy chủ giữ mục tiêu `p99 < 25 ms` ở `20 Hz` (`proposed / unverified`).

## Assumptions

- Tính năng này phụ thuộc vào nền tảng lưu trữ JSON cục bộ & vòng lặp mô phỏng `20 Hz` của `001-foundation-game-engine`, hồ sơ nhân vật & phân bổ điểm của `002-auth-character`, và bản đồ va chạm + vùng không gian của `003-world-movement`.
- Phạm vi MVP tập trung PvE và Co-op với 15 kỹ năng của 3 nhân vật khởi đầu; cấu trúc hệ số `pvpModifier` và giới hạn CC PvP được tích hợp sẵn trong động cơ để phục vụ PvP Arena ở giai đoạn sau (M4+).
- Các chỉ tiêu hiệu năng (`20 Hz`, `p99 < 25 ms`, `60 FPS` client với 4 Ultimate đồng thời) là giá trị thiết kế đề xuất (`proposed / unverified`) và sẽ được xác minh thực tế qua bài đo tải ở giai đoạn triển khai.
