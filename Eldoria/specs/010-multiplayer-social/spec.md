# Feature Specification: Online Multiplayer Presence, Safe Chat, Friends, Co-op Party & Reconnect Recovery

**Feature Branch**: `010-multiplayer-social`

**Created**: 2026-11-19

**Status**: Reviewed (Autonomous Design Baseline — Chờ phê duyệt chuyển sang Implementation)

**Input**: User description: "Online multiplayer presence, safe zone and party chat, friends and block list, co-op party 1-4 with fair loot rules, co-op homestead anti-griefing permissions, and disconnect/reconnect session recovery"

## Clarifications

### Session 2026-11-19 *(Autonomous Design Decisions — Proposed, Chưa có phê duyệt triển khai của người dùng)*

- Q: Trạng thái hiện diện trực tuyến (Presence), hàng đợi lời mời Tổ đội và bộ đệm lịch sử trò chuyện lưu ở đâu để tuân thủ kiến trúc tự chủ? → A: Duy trì hoàn toàn trong bộ nhớ tiến trình máy chủ (in-process) với bộ đệm vòng `50` tin nhắn gần nhất cho mỗi Khu vực và mỗi Tổ đội; ảnh chụp trạng thái Tổ đội bền vững lưu tại tệp JSON cục bộ (`data/db/parties/<partyId>.json`) và chỉ ghi bằng chứng trò chuyện vào nhật ký kiểm toán JSON khi có báo cáo vi phạm hoặc cảnh báo bảo mật *(Mandated by Constitution Principle I / DEC-001 & Proposed Decision)*.
- Q: Thời lượng chờ xác nhận Sẵn sàng (Ready Check) khi Đội trưởng kích hoạt vào Hầm ngục là bao nhiêu giây? → A: Chuẩn hóa ở `30 giây` theo đồng hồ máy chủ (mọi giao diện hiển thị đếm ngược theo mốc thời gian hết hạn do máy chủ phát, tự động hủy sạch nếu có thành viên từ chối hoặc mất kết nối trước khi đủ đồng thuận) *(Proposed Decision)*.
- Q: Luật chia chiến lợi phẩm `ROUND_ROBIN` trong Tổ đội có áp dụng cho trang bị hiếm và phần thưởng Boss hay không? → A: Không; `ROUND_ROBIN` chỉ luân phiên phân bổ nguyên liệu thông thường từ quái thế giới mở, trong khi mọi vật phẩm từ bậc `RARE` trở lên, `BOSS_TOKEN` và rương Boss luôn ép buộc dùng chế độ cá nhân hóa `PERSONAL_INSTANCED` để loại bỏ hoàn toàn tranh giành cướp đồ *(Proposed Decision)*.
- Q: Khách trong Tổ đội được phép làm gì khi chủ lãnh địa bật chế độ `PARTY_ACCESS`? → A: Chỉ được phép tham quan, tưới nước, bón phân trên ô đất trồng, cho ăn/vuốt ve vật nuôi, nấu ăn tại Bếp bằng nguyên liệu trong túi riêng và tập luyện tại Bãi tập; TUYỆT ĐỐI CẤM thu hoạch nông sản, thu sản phẩm vật nuôi, xây/di chuyển/nâng cấp/phá công trình, mở Kho chứa hoặc cường hóa vũ khí tại Lò rèn của chủ nhà *(Proposed Decision)*.
- Q: Điều gì xảy ra khi người chơi bị ngắt kết nối đột ngột giữa giao chiến hoặc trong Tổ đội/Hầm ngục? → A: Nếu đang trong trạng thái giao chiến, nhân vật vẫn lưu lại trên bản đồ suốt `5 giây` (Combat Logout Grace) và vẫn có thể chịu sát thương để chống thoát nóng né chết; sau đó máy chủ lưu ngay trạng thái thay đổi xuống tệp JSON cục bộ và giữ nguyên vị trí trong Tổ đội cùng Hầm ngục suốt `120 giây` để người chơi kết nối lại liền mạch *(Proposed Decision)*.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gặp gỡ Trực tuyến, Hiện diện, Kết bạn & Trò chuyện An toàn (Priority: P1)

Với tư cách là người chơi phiêu lưu tại `reg_greenhaven_village` và `reg_whispering_forest`, tôi muốn nhìn thấy trạng thái hiện diện trực tuyến của bạn bè, kết bạn hoặc chặn người gây phiền nhiễu, và trò chuyện mượt mà trong kênh Khu vực (`ZONE`) hoặc Tổ đội (`PARTY`) mà không bao giờ bị chèn mã độc, tin nhắn rác tràn màn hình hay độ trễ lưu trữ làm khựng trò chơi.

**Why this priority**: Sự hiện diện sống động và giao tiếp an toàn là nền tảng biến trò chơi thành thế giới nhiều người chơi thực thụ, là tiền đề bắt buộc trước khi người chơi rủ nhau lập Tổ đội hoặc đi Hầm ngục.

**Independent Test**: Có thể kiểm thử độc lập với hai người chơi trong cùng Khu vực: xác nhận trạng thái hiện diện (`ONLINE`, `IN_HOMESTEAD`, `IN_DUNGEON`, `AWAY`, `OFFLINE`) cập nhật tức thời cho bạn bè; thử kết bạn (đến giới hạn `50`), thử chặn người chơi (ẩn toàn bộ tin nhắn và lời mời); gửi chuỗi chứa thẻ mã độc, gửi tin vượt `250` ký tự và gửi liên tiếp `8` tin trong `2 giây` để xác nhận lọc văn bản thuần, giới hạn tốc độ `5 tin / 10 giây` và tự động tạm cấm chat `60 giây` khi tái phạm.

**Acceptance Scenarios**:

1. **Given** hai người chơi đang đứng cùng khu vực `zon_greenhaven_square`, **When** người chơi A gửi tin nhắn văn bản hợp lệ dài tối đa `250` ký tự vào kênh `ZONE`, **Then** cả hai người chơi trong cùng khu vực nhận được tin nhắn nguyên vẹn kèm tên người gửi và dấu thời gian máy chủ, đồng thời tin nhắn được lưu vào bộ đệm vòng `50` tin gần nhất trong bộ nhớ mà không ghi đĩa.
2. **Given** một người chơi cố gửi nội dung chứa thẻ kịch bản hoặc ký tự điều khiển vào kênh trò chuyện, **When** máy chủ tiếp nhận yêu cầu, **Then** máy chủ loại bỏ ký tự điều khiển, vô hiệu hóa hoàn toàn thẻ đánh dấu để chỉ phát văn bản thuần an toàn và khách hàng không bao giờ thực thi mã chèn.
3. **Given** một người chơi gửi `6` tin nhắn liên tiếp trong vòng `10 giây`, **When** tin nhắn thứ `6` đến máy chủ, **Then** máy chủ từ chối kèm thời gian chờ thử lại; nếu vi phạm giới hạn tốc độ `3 lần` liên tiếp trong `1 phút`, máy chủ tự động tạm khóa quyền trò chuyện trong `60 giây` và ghi nhật ký bảo mật.
4. **Given** hai người chơi chưa kết bạn và chưa đạt giới hạn `50` bạn bè, **When** người chơi A gửi lời mời kết bạn và người chơi B chấp nhận, **Then** cả hai hồ sơ nhân vật được cập nhật đồng thời một cách nguyên tử để hiển thị trạng thái hiện diện và khu vực hiện tại của nhau; nếu một người chặn người kia, mọi tin nhắn và lời mời Tổ đội từ người bị chặn đều bị ẩn và từ chối.

---

### User Story 2 - Lập Tổ đội 1–4 Người, Quy tắc Chia Chiến lợi phẩm Công bằng & Khởi chạy Hầm ngục (Priority: P1)

Với tư cách là người chơi muốn hợp tác săn quái Elite và chinh phục Boss, tôi muốn tạo Tổ đội tối đa `4` người, mời bạn bè, chuyển quyền Đội trưởng, chọn luật chia chiến lợi phẩm minh bạch, chia sẻ kinh nghiệm chống ăn bám, và cùng nhau xác nhận Sẵn sàng để bước vào Hầm ngục riêng biệt mà không bị cướp đồ hay bị đá oan giữa trận Boss.

**Why this priority**: Hợp tác Tổ đội 1–4 người đánh Boss và phân chia chiến lợi phẩm công bằng là trải nghiệm xã hội cốt lõi của giai đoạn MVP (Trụ cột Thiết kế số 6).

**Independent Test**: Có thể kiểm thử độc lập bằng 4 phiên người chơi: lập Tổ đội, gửi đồng thời 2 lời chấp nhận khi Tổ đội đang `3/4` (chỉ 1 người vào thành công, người kia nhận lỗi đầy đội), kiểm tra cấm đuổi thành viên khi đang giao chiến Boss, kiểm tra chia kinh nghiệm cộng thêm tối đa `+30%` trong bán kính `800 px` (người đứng ngoài không hưởng), và kiểm tra chiến lợi phẩm cá nhân chỉ người đủ ngưỡng đóng góp `>= 5%` mới nhìn thấy và nhặt được.

**Acceptance Scenarios**:

1. **Given** người chơi A tạo Tổ đội mới, **When** Đội trưởng mời người chơi B, C, D và cả ba chấp nhận trong thời hạn hiệu lực `30 giây` của lời mời, **Then** Tổ đội có `4/4` thành viên được lưu bền vững vào ảnh chụp Tổ đội JSON cục bộ với luật mặc định `PERSONAL_INSTANCED`; mọi nỗ lực mời thêm thành viên thứ 5 đều bị từ chối rõ ràng.
2. **Given** Tổ đội đang giao chiến bên trong phòng Boss, **When** Đội trưởng gửi lệnh đuổi một thành viên ra khỏi Tổ đội, **Then** máy chủ từ chối tuyệt đối để bảo vệ công sức chiến đấu của đồng đội.
3. **Given** một quái vật hoặc Boss bị hạ trong lúc Tổ đội 4 người cùng tham chiến (gồm sát thương, hồi máu và chống chịu), **When** máy chủ phân phát chiến lợi phẩm, **Then** mọi thành viên đứng trong phạm vi chiến đấu và đạt tối thiểu `5%` đóng góp (sát thương, hồi máu hiệu dụng hoặc chắn đòn/hút đe dọa) nhận gói chiến lợi phẩm cá nhân riêng biệt; bất kỳ ai cố nhặt gói chiến lợi phẩm thuộc quyền sở hữu của người khác đều bị từ chối và ghi nhận kiểm toán bảo mật.
4. **Given** Đội trưởng đứng gần cổng Hầm ngục và kích hoạt Bắt đầu Hầm ngục, **When** toàn bộ thành viên đủ cấp độ xác nhận Sẵn sàng trong cửa sổ `30 giây`, **Then** máy chủ dịch chuyển đồng thời cả Tổ đội vào một phiên bản Hầm ngục riêng; nếu Đội trưởng rời đội hoặc mất kết nối quá `120 giây`, quyền Đội trưởng tự động chuyển cho thành viên gia nhập sớm nhất còn trực tuyến.

---

### User Story 3 - Hợp tác Canh tác tại Lãnh địa Có Chống Phá hoại (Priority: P2)

Với tư cách là chủ sở hữu Lãnh địa, tôi muốn bật chế độ `PARTY_ACCESS` để đồng đội trong Tổ đội ghé thăm, phụ tưới cây, bón phân, chăm sóc vật nuôi và nấu ăn chung, nhưng luôn đảm bảo an toàn tuyệt đối để không ai có thể thu hoạch trộm nông sản, phá nhà hay lấy đồ trong kho của tôi.

**Why this priority**: Kết nối vòng lặp nông trại/xây dựng ấm áp với tính năng chơi chung Co-op trong khi vẫn triệt tiêu rủi ro phá hoại tài sản (griefing).

**Independent Test**: Có thể kiểm thử độc lập bằng 2 thành viên cùng Tổ đội: chủ nhà bật `PARTY_ACCESS`, khách bước vào lãnh địa thực hiện thành công tưới cây (`+5 EXP` hỗ trợ), cho vật nuôi ăn/vuốt ve và nấu ăn (trừ nguyên liệu từ túi riêng của khách), trong khi mọi lệnh thu hoạch cây, thu trứng/sữa, đặt/phá công trình, mở kho chứa hoặc cường hóa đều bị máy chủ từ chối; khi chủ nhà tắt về `OWNER_ONLY`, khách lập tức được đưa an toàn ra quảng trường làng.

**Acceptance Scenarios**:

1. **Given** chủ Lãnh địa bật chế độ `PARTY_ACCESS`, **When** đồng đội cùng Tổ đội bước vào lãnh địa và thực hiện tưới nước/bón phân trên ô ruộng, cho ăn/vuốt ve vật nuôi hoặc nấu ăn tại Bếp, **Then** máy chủ cho phép thực thi, cộng phần thưởng hỗ trợ nông trại cho khách và tiêu hao nguyên liệu nấu ăn từ chính túi đồ của khách.
2. **Given** đồng đội cùng Tổ đội đang đứng trong lãnh địa của chủ nhà, **When** đồng đội cố thực hiện thu hoạch cây trồng, thu sản phẩm vật nuôi, xây mới/di chuyển/phá hủy công trình hoặc mở Kho chứa, **Then** máy chủ từ chối nghiêm ngặt với lỗi phân quyền sở hữu và ghi nhận sự kiện kiểm toán.
3. **Given** đồng đội đang đứng trong lãnh địa của chủ nhà, **When** chủ nhà chuyển quyền truy cập về `OWNER_ONLY` hoặc khách rời khỏi Tổ đội, **Then** máy chủ ngay lập tức dịch chuyển khách ra khu vực an toàn `zon_greenhaven_square` mà không làm mất dữ liệu hay kẹt nhân vật.

---

### User Story 4 - Kiên cường Khi Ngắt kết nối, Bảo vệ Công bằng Giao chiến & Khôi phục Phiên 120 Giây (Priority: P2)

Với tư cách là người chơi gặp sự cố đường truyền đột ngột, tôi muốn phiên chơi, vị trí Tổ đội và suất trong Hầm ngục của mình được giữ suốt `120 giây` để khi kết nối lại tôi tiếp tục ngay cuộc phiêu lưu mà không mất vật phẩm, đồng thời hệ thống phải ngăn người chơi cố tình rút mạng để né đòn kết liễu.

**Why this priority**: Trải nghiệm mạng ổn định, không mất công sức khi rớt Wi-Fi và ngăn gian lận thoát nóng là yếu tố sống còn cho sự công bằng của trò chơi trực tuyến.

**Independent Test**: Có thể kiểm thử độc lập bằng cách mô phỏng ngắt kết nối đột ngột trong hai tình huống: (a) đang giao chiến (xác minh nhân vật vẫn đứng chịu sát thương trong `5 giây` rồi mới lưu trạng thái và chuyển sang giữ slot `120 giây`); (b) kết nối lại sau `30 giây` (xác minh khôi phục đúng Tổ đội/Hầm ngục và toàn vẹn kho đồ JSON) vs sau `125 giây` (xác minh giải phóng slot và tự chuyển quyền Đội trưởng nếu cần).

**Acceptance Scenarios**:

1. **Given** người chơi đang trong trạng thái giao chiến với quái vật hoặc Boss và kết nối mạng bị ngắt đột ngột, **When** máy chủ phát hiện mất kết nối, **Then** nhân vật vẫn tồn tại và tiếp tục nhận sát thương hợp lệ trong `5 giây` Combat Logout Grace trước khi được lưu trạng thái xuống tệp JSON cục bộ và chuyển sang trạng thái giữ suất `120 giây`.
2. **Given** người chơi bị ngắt kết nối và đang ở trong Tổ đội/Hầm ngục còn hoạt động, **When** người chơi xác thực và gửi yêu cầu khôi phục phiên trong vòng `<= 120 giây`, **Then** máy chủ khôi phục trạng thái trực tuyến vào đúng Tổ đội và phiên bản Hầm ngục (hoặc điểm an toàn gần nhất nếu nhân vật đã gục ngã trong `5 giây` grace hoặc Hầm ngục đã kết thúc) kèm ảnh chụp đồng bộ đầy đủ.
3. **Given** người chơi bị ngắt kết nối và không quay lại sau `120 giây`, **When** đồng hồ giữ suất hết hạn, **Then** máy chủ giải phóng suất khỏi Hầm ngục, cập nhật trạng thái ngoại tuyến, chuyển quyền Đội trưởng cho thành viên tiếp theo nếu người mất kết nối là Đội trưởng và đồng bộ lại cho toàn đội.
4. **Given** một nhân vật đang có kết nối hoạt động, **When** phiên đăng nhập hợp lệ thứ hai cố kết nối vào cùng nhân vật đó, **Then** máy chủ lưu ngay trạng thái phiên cũ, đóng kết nối cũ với thông báo bị thay thế và chỉ cho phép duy nhất một phiên hoạt động tại một thời điểm.

---

### Edge Cases

- Hai người chơi đồng thời bấm Chấp nhận lời mời khi Tổ đội đang có `3/4` thành viên: cơ chế khóa tuần tự hóa trên Tổ đội chỉ cho phép đúng `1` người gia nhập (`4/4`), người còn lại nhận thông báo Tổ đội đã đầy.
- Đội trưởng bị mất kết nối đúng lúc bảng Xác nhận Sẵn sàng (`30 giây`) đang chạy: cuộc xác nhận bị hủy sạch ngay lập tức, không khóa thời gian chờ hay tiêu hao tài nguyên của bất kỳ thành viên nào.
- Người chơi đứng tại lãnh địa của đồng đội đúng lúc chủ nhà bị ngắt kết nối: phiên lãnh địa vẫn duy trì hoạt động an toàn cho khách tới khi mọi người rời đi rồi tự lưu dữ liệu sạch.
- Đồng đội có đóng góp sát thương chỉ `4%` nhưng đóng góp `15%` tổng lượng hồi máu hiệu dụng cho Tổ đội trong trận Boss: vẫn đạt tư cách nhận chiến lợi phẩm cá nhân vì thỏa mãn ngưỡng `>= 5%` trên tiêu chí hồi máu.
- Người chơi gửi liên tiếp lời mời Tổ đội tới người vừa bấm Từ chối để làm phiền: hệ thống áp dụng thời gian chờ `15 giây` giữa các lời mời tới cùng một người sau khi bị từ chối và chặn vĩnh viễn nếu người nhận đã thêm vào danh sách chặn.
- Người chơi báo cáo hành vi xúc phạm trong trò chuyện (`/report`): máy chủ chụp tối đa `10` dòng tin nhắn gần nhất từ bộ đệm vòng trong bộ nhớ vào nhật ký kiểm toán bảo mật JSON cục bộ để phục vụ xem xét mà không phải lưu toàn bộ lịch sử trò chuyện thường nhật xuống đĩa.
- Người chơi mất chuỗi cập nhật trạng thái liên tiếp do nghẽn mạng tạm thời: yêu cầu đồng bộ toàn phần bị giới hạn tốc độ tối đa `1 lần / 2 giây` để tránh bị lạm dụng khuếch đại lưu lượng.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI duy trì bảng trạng thái hiện diện trực tuyến hoàn toàn trong bộ nhớ máy chủ với các trạng thái `ONLINE`, `IN_HOMESTEAD`, `IN_DUNGEON`, `AWAY` (tự chuyển sau `5 phút` không có thao tác), `DISCONNECTED_HOLD` và `OFFLINE`, đồng thời thông báo thay đổi trạng thái tới bạn bè và thành viên Tổ đội đang trực tuyến.
- **FR-002**: Hệ thống PHẢI cung cấp trò chuyện thời gian thực cho các kênh `ZONE`, `PARTY` và thông báo `SYSTEM` với bộ đệm vòng tối đa `50` tin nhắn gần nhất cho mỗi khu vực và mỗi Tổ đội trong bộ nhớ (không ghi đĩa thường xuyên); giới hạn độ dài `1..250` ký tự UTF-8, lọc sạch ký tự điều khiển và vô hiệu hóa toàn bộ thẻ mã đánh dấu để đảm bảo hiển thị văn bản thuần an toàn chống chèn mã.
- **FR-003**: Hệ thống PHẢI giới hạn tốc độ gửi tin nhắn ở mức tối đa `5 tin nhắn / 10 giây` cho mỗi phiên kết nối; tự động tạm khóa quyền gửi tin `60 giây` nếu người chơi vượt ngưỡng `3 lần` trong `1 phút`, hỗ trợ lệnh báo cáo vi phạm lưu bằng chứng `10` tin gần nhất vào nhật ký kiểm toán JSON cục bộ và áp dụng danh sách chặn tối đa `100` nhân vật.
- **FR-004**: Hệ thống PHẢI hỗ trợ danh sách bạn bè tối đa `50` người và tối đa `20` lời mời kết bạn đang chờ (tự hết hạn sau `7 ngày`), thực hiện kết bạn hai chiều một cách nguyên tử trong cơ sở dữ liệu JSON cục bộ với thứ tự khóa cố định chống khóa chết.
- **FR-005**: Hệ thống PHẢI hỗ trợ Tổ đội quy mô `1..4` thành viên được lưu bền vững thành ảnh chụp JSON cục bộ (`data/db/parties/<partyId>.json`), bao gồm các thao tác tạo đội, mời (hiệu lực `30 giây`, thời gian chờ `15 giây` sau khi bị từ chối), chấp nhận, từ chối, rời đội, đuổi thành viên, chuyển quyền Đội trưởng (thủ công hoặc tự động khi Đội trưởng rời đội/mất kết nối quá `120 giây`) và tự giải tán khi không còn thành viên nào.
- **FR-006**: Hệ thống PHẢI cấm hành động đuổi thành viên (`KICK`) và cấm thay đổi luật chia chiến lợi phẩm trong thời gian Tổ đội đang giao chiến Boss; đồng thời hỗ trợ quy trình Xác nhận Sẵn sàng (`30 giây`) kiểm tra đủ điều kiện cấp độ trước khi đưa cả Tổ đội vào Hầm ngục.
- **FR-007**: Hệ thống PHẢI hỗ trợ hai chế độ chia chiến lợi phẩm `PERSONAL_INSTANCED` (mặc định) và `ROUND_ROBIN` (chỉ áp dụng cho vật phẩm thường ngoài thế giới mở; vật phẩm bậc `RARE` trở lên, `BOSS_TOKEN` và rương Boss luôn ép về `PERSONAL_INSTANCED`), chỉ cấp quyền nhặt và chia thưởng khi người chơi ở trong phạm vi chiến đấu và đạt tối thiểu `5%` đóng góp (sát thương, hồi máu hiệu dụng hoặc chắn đòn/hút đe dọa), kèm kiểm tra sở hữu, khoảng cách `<= 96 px`, thời hạn tồn tại `120 giây` và xóa nguyên tử vật phẩm rơi trước khi ghi vào kho đồ.
- **FR-008**: Hệ thống PHẢI áp dụng thưởng chia sẻ kinh nghiệm Tổ đội ngoài thế giới mở cho các đồng đội đứng trong phạm vi `<= 800 px` (`+10%` mỗi đồng đội gần kề, tối đa `+30%` ở 4 người) và không chia kinh nghiệm cho thành viên đứng xa hoặc AFK ở làng; đồng thời tắt va chạm chặn đường giữa người chơi với người chơi để chống phá hoại.
- **FR-009**: Hệ thống PHẢI thực thi ma trận phân quyền Lãnh địa (`OWNER_ONLY` mặc định và `PARTY_ACCESS` tùy chọn) tại máy chủ: khi bật `PARTY_ACCESS`, đồng đội được phép tham quan, tưới nước, bón phân, cho vật nuôi ăn/vuốt ve, nấu ăn bằng nguyên liệu cá nhân và tập luyện, nhưng bị cấm tuyệt đối thu hoạch nông sản, thu sản phẩm vật nuôi, xây/sửa/phá công trình, mở kho chứa hoặc cường hóa; thu hồi quyền hoặc rời Tổ đội lập tức đưa khách an toàn về khu vực làng.
- **FR-010**: Hệ thống PHẢI cưỡng chế tối đa một phiên hoạt động cho mỗi nhân vật, áp dụng `5 giây` Combat Logout Grace khi ngắt kết nối giữa chiến đấu, lưu ngay trạng thái thay đổi xuống tệp JSON cục bộ khi ngắt kết nối, giữ suất Tổ đội và Hầm ngục suốt `120 giây`, và hỗ trợ khôi phục phiên an toàn kèm kiểm tra danh sách khóa/phiên hợp lệ.

### Key Entities *(include if feature involves data)*

- **PartyAggregate**: Ảnh chụp tổ đội bền vững gồm mã tổ đội, Đội trưởng, danh sách `1..4` thành viên, quy tắc chia chiến lợi phẩm, mã Hầm ngục đang hoạt động (nếu có) và thời điểm tạo.
- **CharacterSocialExtension**: Phần mở rộng xã hội của nhân vật gồm mã tổ đội hiện tại, danh sách bạn bè (tối đa 50), lời mời kết bạn đang chờ (tối đa 20, hạn 7 ngày) và danh sách chặn (tối đa 100).
- **HomesteadAccessPolicy**: Chính sách phân quyền lãnh địa gồm chủ sở hữu, chế độ truy cập (`OWNER_ONLY` hoặc `PARTY_ACCESS`) và tập hành động hợp tác được phép cho khách.
- **PresenceRecord**: Bản ghi hiện diện trực tuyến tạm thời trong bộ nhớ gồm mã nhân vật, trạng thái hiện diện, khu vực hiện tại và mốc thời gian tương tác cuối.
- **ChatMessageRecord**: Bản ghi tin nhắn văn bản thuần trong bộ đệm vòng 50 tin của khu vực hoặc tổ đội gồm mã tin, kênh, người gửi, nội dung đã lọc sạch và dấu thời gian máy chủ.
- **SessionReconnectHold**: Bản ghi tạm thời quản lý thời gian ân hạn giao chiến `5 giây` và thời gian giữ suất Tổ đội/Hầm ngục `120 giây` khi người chơi mất kết nối.
- **SocialSecurityAuditEvent**: Bản ghi kiểm toán bảo mật chỉ nối thêm cho các sự kiện báo cáo trò chuyện, khóa chat do spam, thử nhặt chiến lợi phẩm trái phép, vi phạm quyền lãnh địa hoặc thay thế phiên.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Hai người chơi trong cùng khu vực gửi và nhận tin nhắn trò chuyện với độ trễ hiển thị dưới `200 ms` trên mạng nội bộ (`proposed / unverified`), với `100%` chuỗi chứa thẻ mã đánh dấu được vô hiệu hóa hoàn toàn thành văn bản thuần và `100%` tin vượt ngưỡng `5 tin / 10 giây` bị chặn.
- **SC-002**: Trong `100%` kịch bản cạnh tranh gia nhập khi Tổ đội đạt `3/4` thành viên hoặc kết bạn hai chiều đồng thời, không phát sinh vượt trần `4` thành viên, không xuất hiện khóa chết (deadlock) và không làm lệch dữ liệu JSON.
- **SC-003**: `100%` nỗ lực nhặt chiến lợi phẩm thuộc quyền sở hữu của người chơi khác, đuổi thành viên giữa trận Boss, hoặc thực hiện hành vi cấm (`HARVEST`, `COLLECT`, `BUILD`, `DEMOLISH`, mở Kho chứa) bởi khách trên Lãnh địa bật `PARTY_ACCESS` bị máy chủ từ chối và ghi nhận kiểm toán.
- **SC-004**: `100%` phiên ngắt kết nối đột ngột giữa giao chiến duy trì khả năng nhận sát thương đủ `5 giây` trước khi lưu trạng thái, và `100%` yêu cầu khôi phục phiên hợp lệ trong vòng `120 giây` trả người chơi về đúng Tổ đội/Hầm ngục (hoặc điểm an toàn nếu đã gục ngã) với `0` vật phẩm bị nhân bản hoặc mất mát.
- **SC-005**: Hệ thống xã hội và hiện diện vận hành hoàn toàn bằng bộ nhớ nội bộ và tệp JSON cục bộ với `0` phụ thuộc dịch vụ trò chuyện, bộ nhớ đệm hoặc cơ sở dữ liệu bên thứ ba; duy trì mục tiêu `50` người chơi đồng thời ổn định cho MVP (`proposed / unverified`).

## Assumptions

- Giai đoạn MVP tập trung hoàn toàn vào trải nghiệm PvE và hợp tác Co-op (`ZONE`, `PARTY`, `SYSTEM` chat; Bạn bè; Tổ đội `1–4` người; Co-op Homestead). Các tính năng nhắn riêng (`WHISPER`), Bang hội (`GUILD`), Giao dịch trực tiếp 2 bước (`Trade`) và Đấu trường PvP tự nguyện thuộc lộ trình hậu MVP (M2–M4).
- Mọi tính năng xác thực phiên đăng nhập, phân vùng bản đồ theo lưới không gian, và cơ sở dữ liệu JSON cục bộ với khóa tuần tự và WAL được cung cấp bởi các nền tảng trước đó (`001`–`005`, `008`).
- Hệ thống vận hành trên một tiến trình máy chủ đơn nút ở MVP; các mục tiêu độ trễ và số lượng người chơi đồng thời (`20–50` CCU MVP, `100–500` CCU stress test) là giả thuyết `proposed / unverified` cần đo đạc thực tế khi triển khai.
