# Feature Specification: Classic 16-Bit Pixel Fantasy Game UI (24 Screens), Accessibility & Automated UI/UX QA Harness

**Feature Branch**: `012-game-ui-qa`

**Created**: 2026-11-19

**Status**: Reviewed (Autonomous Design Baseline — Chờ phê duyệt chuyển sang Implementation)

**Input**: User description: "Classic 16-bit pixel fantasy RPG UI covering all 24 mandatory screens, decoupled high-frequency world bridge, local Vietnamese pixel typography, WCAG AA contrast and colorblind/motion accessibility, full component state coverage, and automated multi-viewport visual regression and Vietnamese UI bug reporting QA harness"

## Clarifications

### Session 2026-11-19 *(Autonomous Design Decisions — Proposed, Chưa có phê duyệt triển khai của người dùng)*

- Q: Toàn bộ phông chữ tiếng Việt, khung ảnh, biểu tượng giao diện và công cụ kiểm thử đối chiếu hình ảnh được phục vụ từ đâu? → A: 100% đóng gói và chạy cục bộ (phông chữ pixel hỗ trợ đầy đủ dấu tiếng Việt theo giấy phép mở lưu nội bộ, tài nguyên hình ảnh phục vụ từ máy chủ tĩnh nội bộ, và bộ kiểm thử trình duyệt đối chiếu ảnh chụp chạy hoàn toàn trên máy cục bộ); TUYỆT ĐỐI KHÔNG gọi mạng phân phối phông chữ ngoài hay dịch vụ kiểm thử hình ảnh đám mây bên thứ ba *(Mandated by Constitution Principle I / DEC-001)*.
- Q: Làm thế nào đảm bảo giao diện HUD phong phú không gây tụt khung hình khi thế giới chạy 60 khung hình/giây và không che khuất vùng cảnh báo đòn Boss? → A: Tách biệt hoàn toàn trạng thái thế giới tần suất cao khỏi lớp giao diện người dùng (chỉ đồng bộ cập nhật HUD khi giá trị thực sự thay đổi ở tần suất tối đa `10 Hz` và bản đồ nhỏ `<= 5 Hz`), đồng thời khóa cứng vùng an toàn chiến đấu trung tâm chiếm tối thiểu `68%–76%` màn hình (`[22%..78%]` ngang × `[16%..82%]` dọc) cấm mọi thành phần HUD lấn vào *(Mandated by Constitution Principles IV & V)*.
- Q: Khi người chơi gõ tiếng Việt có dấu (bộ gõ Telex/VNI) trong ô trò chuyện, tìm kiếm túi đồ hoặc đặt tên nhân vật thì hệ thống ngăn kích hoạt nhầm phím chiến đấu và phím tắt cửa sổ như thế nào? → A: Bộ điều phối tiêu điểm đầu vào 5 tầng ưu tiên khóa toàn bộ phím điều khiển thế giới và phím tắt toàn cục bất cứ khi nào người chơi đang mở cửa sổ hay đang tổ hợp dấu tiếng Việt, đồng thời dừng trôi nhân vật ngay khi mở cửa sổ *(Proposed Decision)*.
- Q: Các con số quan trọng về kinh tế và chiến đấu có được phép cắt gọn dấu ba chấm (`...`) ở độ phân giải tối thiểu `1024×768` hoặc cỡ chữ `130%` không? → A: TUYỆT ĐỐI CẤM cắt gọn trên giá tiền tệ, số lượng nguyên liệu (`5/4`), tỷ lệ xác suất Gacha công khai, bộ đếm Pity, mốc cường hóa (`+10`), tỷ lệ thành công (`100%`) và mã lỗi máy chủ; mọi nút/nhãn đều áp dụng ngân sách giãn nở chiều rộng `+25%` cho tiếng Việt và xuống dòng/cuộn hợp lý *(Proposed Decision)*.
- Q: Đồng hồ đếm ngược Xác nhận Sẵn sàng (Ready Check) trên màn hình Tổ đội hiển thị bao nhiêu giây để đồng bộ với đặc tả Tổ đội? → A: Hiển thị chính xác theo mốc hết hạn do máy chủ gửi (mặc định chuẩn hóa `30 giây` từ đặc tả `010-multiplayer-social`), không cố định cứng con số khác trên giao diện *(Proposed Decision)*.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trải nghiệm 24 Màn hình Pixel Fantasy Cổ điển Thống nhất & Chống Chồng lấn Chiến đấu (Priority: P1)

Với tư cách là người chơi nhập vai trên máy tính, tôi muốn toàn bộ 24 màn hình từ đăng nhập, chọn anh hùng khởi đầu, HUD chiến đấu, kho đồ, trang bị, lò rèn cường hóa `+0..+10`, chế tạo, xây dựng, nông trại, bản đồ thế giới, nhật ký nhiệm vụ, gacha nội tệ, tổ đội đến tổng kết Boss và hồi sinh đều mang thẩm mỹ Pixel Fantasy 16-bit sắc nét bằng tiếng Việt rõ ràng, không giống bảng quản trị phần mềm và không bao giờ che khuất vùng chiến đấu trung tâm.

**Why this priority**: Giao diện là toàn bộ bề mặt tương tác giúp người chơi hiểu vòng lặp cốt lõi không cần đọc sách hướng dẫn dài, đồng thời trực tiếp bảo vệ khả năng đọc chiến trường trong combat hành động.

**Independent Test**: Có thể kiểm thử độc lập bằng cách duyệt đủ cả `24` màn hình (`SCR-01` đến `SCR-24`) trên các kích thước màn hình `1920×1080`, `1280×720` và `1024×768`, xác nhận phông chữ tiếng Việt có dấu hiển thị đầy đủ không mất dấu/không chữ lỗi ô vuông, vùng chiến đấu trung tâm HUD trống tối thiểu `68%–76%`, các màn hình kinh tế hiển thị minh bạch tỷ lệ Gacha và quy tắc cường hóa `100%` không vỡ đồ, và không có bất kỳ kết nối tải tài nguyên nào ra tên miền bên ngoài.

**Acceptance Scenarios**:

1. **Given** người chơi mở trò chơi ở độ phân giải `1920×1080`, `1280×720` hoặc `1024×768`, **When** vào màn hình HUD chính (`SCR-05`) kèm thanh máu Boss và danh sách Tổ đội, **Then** mọi thành phần HUD neo sát rìa màn hình, giữ hoàn toàn sạch vùng chiến đấu trung tâm (`[22%..78%]` ngang × `[16%..82%]` dọc), và lớp thế giới hiển thị sắc nét từng điểm ảnh không bị làm mờ.
2. **Given** người chơi mở lần lượt các cửa sổ cốt lõi (`SCR-01`..`SCR-24`), **When** kiểm tra màn hình Gacha (`SCR-11`), Lò Rèn & Cường hóa (`SCR-12`/`SCR-13`), Xây dựng (`SCR-15`), Nông trại (`SCR-16`) và Hồi sinh (`SCR-24`), **Then** Gacha công khai đầy đủ bảng xác suất, Pity Counter và hoàn toàn không có nút nạp tiền thật; Cường hóa hiển thị rõ lộ trình `+0 → +10` `100%` không vỡ đồ và điều kiện cấp Lò Rèn; Hồi sinh có độ trễ khóa `1.5 giây` chống bấm nhầm và khẳng định bảo toàn `100%` trang bị.
3. **Given** trạng thái thế giới thay đổi liên tục `60` lần mỗi giây khi nhân vật chạy và chiến đấu, **When** lớp hiển thị thế giới nhận dữ liệu mới, **Then** lớp giao diện người dùng không bị vẽ lại theo từng khung hình thế giới mà chỉ cập nhật theo sự kiện thay đổi thực sự ở nhịp giới hạn (`<= 10 Hz` cho HUD, `<= 5 Hz` cho bản đồ thu nhỏ).

---

### User Story 2 - Trợ năng Toàn diện (Tương phản, Mù màu, An toàn Ánh sáng, Bàn phím & Bộ gõ Tiếng Việt) (Priority: P1)

Với tư cách là người chơi có nhu cầu trợ năng (khiếm thị màu, nhạy cảm ánh sáng nhấp nháy/rung lắc, chỉ dùng bàn phím, khiếm thính hoặc cần phóng to chữ tiếng Việt), tôi muốn tùy chỉnh ngay trong Cài đặt (`SCR-23`) để phân biệt 100% độ hiếm/nguyên tố/vùng báo đòn không phụ thuộc màu đơn lẻ, tắt hoàn toàn rung màn hình, giới hạn chớp sáng an toàn, phóng to chữ đến `130%` mà không tràn chữ và gõ tiếng Việt thoải mái không bị nhảy kỹ năng nhầm.

**Why this priority**: An toàn thị giác (`<= 3` nháy/giây, tắt Camera Shake), tương phản WCAG AA và hỗ trợ bộ gõ tiếng Việt là tiêu chuẩn đạo đức và chất lượng bắt buộc của một sản phẩm thương mại (Nguyên tắc V).

**Independent Test**: Có thể kiểm thử độc lập bằng cách bật đồng thời cỡ chữ `130%`, `Camera Shake = 0%`, `Reduced VFX Flash = ON`, chế độ Hỗ trợ Mù màu và Phụ đề Cảnh báo Boss trên màn hình `1280×720`; xác nhận `100%` cặp màu văn bản đạt tương phản `>= 4.5:1`, duyệt toàn bộ cửa sổ chỉ bằng bàn phím không bị kẹt tiêu điểm, gõ tổ hợp tiếng Việt trong ô Trò chuyện/Tìm kiếm với `0` phím kỹ năng bị kích hoạt nhầm, và không có phần tử nào tràn khung hay cắt dấu tiếng Việt.

**Acceptance Scenarios**:

1. **Given** người chơi mở bảng Cài đặt (`SCR-23`), **When** thay đổi mức Rung màn hình (`0% / 50% / 100%`), bật Giảm lóe sáng VFX, đổi cỡ chữ (`100% / 115% / 130%`), bật Phụ đề Cảnh báo Boss hoặc gán lại phím tắt bị trùng, **Then** mọi thay đổi áp dụng tức thì mà không cần tải lại trò chơi, tùy chọn cài đặt được lưu bền vững, xung đột phím được cảnh báo kèm đề xuất hoán đổi 1 bước, và hệ thống tự động tôn trọng thiết lập giảm chuyển động của hệ điều hành trong lần mở đầu tiên.
2. **Given** người chơi chuyển màn hình sang đơn sắc mô phỏng mù màu, **When** quan sát Túi đồ (`SCR-06`), Bộ sưu tập (`SCR-10`), Bóng đặt công trình (`SCR-15`) và Vùng báo đòn Boss, **Then** cả `6` bậc độ hiếm vẫn phân biệt hoàn toàn qua hình dáng góc khung + mã chữ (`C..M`) + số sao (`1..6`), cả `9` nguyên tố phân biệt qua hình bóng độc nhất, bóng đặt nhà phân biệt bằng dấu `✓` so với gạch chéo `✕`, và so sánh chỉ số luôn đi kèm mũi tên `▲`/`▼`.
3. **Given** người chơi mở khung Trò chuyện hoặc ô Tìm kiếm Kho đồ và gõ tiếng Việt bằng bộ gõ Telex/VNI, **When** gõ các phím trùng phím tắt (`s`, `f`, `r`, `j`, `i`, `b`, `1..3`), **Then** hệ thống nhận diện phiên tổ hợp dấu tiếng Việt và chặn tuyệt đối mọi lệnh chiến đấu hoặc mở cửa sổ nhầm lẫn.

---

### User Story 3 - Bao phủ Đầy đủ Trạng thái Tương tác & Kiên cường Trước Lỗi Mạng (Priority: P2)

Với tư cách là người chơi, tôi muốn mọi nút bấm, ô vật phẩm, thanh chỉ số, cửa sổ và hộp nhập liệu trên cả 24 màn hình đều phản hồi rõ ràng ở đủ mọi trạng thái (`default`, `hover`, `active`, `focus`, `disabled`, `loading`, `empty`, `error` và `disconnected`) để tôi luôn biết hệ thống đang chờ xác thực máy chủ, thiếu điều kiện gì, trống dữ liệu hay đang kết nối lại mà không bao giờ bấm trùng giao dịch.

**Why this priority**: Bao phủ đầy đủ trạng thái ngăn cảm giác giao diện bị "đơ", tránh double-submit trên giao dịch Gacha/Cường hóa và giữ trải nghiệm liền mạch khi rớt mạng.

**Independent Test**: Có thể kiểm thử độc lập bằng cách ép từng màn hình và thành phần lõi đi qua đủ bộ trạng thái `loading`, `empty`, `error`, `disconnected`, `disabled`, `hover`, `focus`; xác nhận nút hành động kinh tế bị khóa ngay khi gửi yêu cầu chống bấm đúp, màn hình ngoại tuyến chuyển sang chế độ chỉ đọc an toàn với thanh kết nối lại không che tâm, và trạng thái trống luôn có hướng dẫn hành động tiếng Việt hữu ích.

**Acceptance Scenarios**:

1. **Given** người chơi bấm nút Quay Gacha (`SCR-11`), Cường hóa (`SCR-13`) hoặc Chế tạo (`SCR-14`), **When** yêu cầu đang chờ máy chủ xác thực giao dịch, **Then** nút lập tức chuyển trạng thái `loading` khóa bấm lặp cho đến khi có phản hồi; nếu nhận mã lỗi từ máy chủ (`ERR_INSUFFICIENT_MATERIALS`, `ERR_BLACKSMITH_LEVEL_REQUIRED`, `ERR_INVENTORY_FULL`), màn hình hiển thị đúng thông báo tiếng Việt dễ hiểu cùng chỉ dẫn khắc phục.
2. **Given** kết nối mạng tạm thời gián đoạn trong khi người chơi đang mở một cửa sổ hoặc chiến đấu, **When** trạng thái mạng chuyển `disconnected`, **Then** thanh trạng thái mất kết nối hiện nổi gọn trên mép màn hình (không văng ra màn hình đăng nhập), chế độ đặt công trình tự hủy an toàn, mọi nút gửi giao dịch chuyển `disabled`, nhưng người chơi vẫn đọc được túi đồ, nhiệm vụ và cài đặt cục bộ.

---

### User Story 4 - Bộ Kiểm thử Tự động UI/UX, Đối chiếu Hình ảnh & Sinh Báo cáo Lỗi Tiếng Việt (Priority: P2)

Với tư cách là kỹ sư kiểm thử chất lượng và trưởng thiết kế, tôi muốn một bộ kiểm thử trình duyệt tự động chạy 100% cục bộ có khả năng quét cả 24 màn hình trên nhiều độ phân giải (`1920×1080`, `1280×720`, `1024×768` và cấu hình trợ năng `130%`), kiểm tra tương phản, tràn chữ tiếng Việt, độ sắc nét pixel, an toàn vùng chiến đấu, độ thuần sạch mạng nội bộ, đối chiếu ảnh chụp màn hình và tự động xuất báo cáo lỗi bằng tiếng Việt kèm ảnh thực tế có khoanh vùng lỗi.

**Why this priority**: Biến toàn bộ chuẩn mực mỹ thuật, trợ năng và hỗ trợ tiếng Việt thành cổng kiểm soát tự động lặp lại được (Nguyên tắc VIII), triệt tiêu lỗi vỡ giao diện khi phát triển nhanh.

**Independent Test**: Có thể kiểm thử độc lập bằng cách chạy bộ kiểm thử tự động trên bộ dữ liệu mẫu cố định (deterministic JSON fixtures) ở 3 độ phân giải bắt buộc (`1920×1080`, `1280×720`, `1024×768`) và cấu hình `130%`; xác nhận kịch bản tự động bắt được một lỗi tràn chữ tiếng Việt hoặc lỗi gọi tài nguyên ngoài cố tình tiêm vào, lưu ảnh chụp thật kèm khung đỏ đánh dấu vùng lỗi và xuất đúng mẫu báo cáo lỗi tiếng Việt có mức độ nghiêm trọng `P0–P3`.

**Acceptance Scenarios**:

1. **Given** bộ dữ liệu mẫu cố định cục bộ và bản dựng giao diện đang chạy nội bộ, **When** chạy bộ kiểm thử trình duyệt tự động qua các độ phân giải `1920×1080`, `1280×720`, `1024×768` và cấu hình trợ năng `1280×720 @ 130%`, **Then** hệ thống chụp ảnh thật toàn bộ màn hình/trạng thái, kiểm chứng sai lệch điểm ảnh (`<= 0.5%`), kiểm chứng `0` yêu cầu mạng ra bên ngoài, `0` lỗi tương phản nghiêm trọng, `0` phần tử HUD cắt vùng chiến đấu trung tâm và `0` phần tử tràn ngang/cắt dấu tiếng Việt.
2. **Given** một lỗi giao diện xuất hiện trong đợt quét tự động (ví dụ tràn chữ tiếng Việt hoặc nút bị che ở `1024×768`), **When** trình tạo báo cáo hoàn tất, **Then** hệ thống lưu ảnh gốc kèm ảnh khoanh khung đỏ vùng lỗi thực tế và sinh báo cáo bằng tiếng Việt chứa đầy đủ: Mã lỗi, Mức độ (`P0–P3`), Màn hình/Trạng thái, Độ phân giải, Đường dẫn ảnh thật, Bước tái hiện, Hành vi Kỳ vọng và Hành vi Thực tế.

---

### Edge Cases

- Tên nhân vật hoặc tên vật phẩm tiếng Việt dài hơn tiếng Anh `+25%` kết hợp cỡ chữ phóng to `130%` trên màn hình tối thiểu `1024×768`: lưới Túi đồ tự thu từ `8` cột về `6` cột, thẻ Tổ đội tự chuyển từ `1×4` sang `2×2`, nút cuối cửa sổ tự xuống hàng gọn gàng mà không cắt mất giá tiền hay tỷ lệ xác suất.
- Chuỗi dấu kép tiếng Việt cực đại (`"Cường Hóa Đỉnh Phong — Ắ Ằ Ẳ Ẵ Ặ Ế Ệ Ổ Ộ Ử Ữ Đ"`) xuất hiện trong tiêu đề, nút và hộp thoại NPC: chiều cao dòng (`>= 1.35` tiêu đề, `>= 1.45` thân bài) và khoảng đệm dọc tối thiểu bảo đảm không bị cắt mất dấu phía trên hay dưới.
- Người chơi dùng màn hình siêu rộng (`2560×1080` hoặc `3440×1440`): khung cảnh thế giới giữ nguyên tỷ lệ `16:9` căn giữa để không tạo lợi thế tầm nhìn bất công trong chơi mạng, và HUD giới hạn trong chiều rộng tối đa `1920 px` tránh phải xoay mắt quá xa.
- Tệp phông chữ pixel chính bị thiếu hoặc lỗi tải cục bộ: hệ thống rơi về phông dự phòng cục bộ vẫn giữ trọn dấu tiếng Việt (không gọi phông từ Internet); thiếu ảnh biểu tượng vật phẩm hiển thị ảnh giữ chỗ dấu hỏi pixel sắc nét thay vì khung vỡ.
- Người chơi bấm `ESC` khi đang mở chồng nhiều lớp (Tooltip ghim → Kéo đồ → Cửa sổ con → Cửa sổ chính): phím `ESC` đóng tuần tự theo thứ tự vào sau ra trước (LIFO), chỉ mở `SCR-23 Settings` khi mọi lớp phủ khác đã đóng sạch.
- Người chơi mở cửa sổ khi đang giữ phím di chuyển: hệ thống lập tức gửi lệnh dừng di chuyển để nhân vật không tiếp tục trôi thẳng vào vùng nguy hiểm hay quái vật.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống giao diện PHẢI cung cấp đầy đủ `24` màn hình bắt buộc (`SCR-01` đến `SCR-24`: Đăng nhập/Đăng ký, Chọn nhân vật, Tạo/Chọn anh hùng khởi đầu, Nạp vùng, HUD chính, Túi đồ, Trang bị 10 ô, Chỉ số nhân vật, Cây kỹ năng, Bộ sưu tập 12 anh hùng, Gacha nội tệ, Lò rèn, Cường hóa vũ khí `+0..+10`, Chế tạo, Xây dựng, Nông trại, Bản đồ thế giới, Bản đồ thu nhỏ, Nhật ký nhiệm vụ, Hộp thoại NPC, Tổ đội, Thưởng Boss, Cài đặt, Gục ngã/Hồi sinh) tuân thủ mỹ thuật Classic 16-bit Pixel Fantasy với khung gỗ/đồng/giấy da sắc cạnh, tuyệt đối không mang dáng dấp bảng quản trị phẳng.
- **FR-002**: Hệ thống giao diện PHẢI tách biệt vòng đời cập nhật khỏi vòng lặp hiển thị thế giới `60 FPS`, chỉ nhận cập nhật HUD theo sự kiện thay đổi thực tế ở tần suất tối đa `10 Hz` (và bản đồ thu nhỏ `<= 5 Hz`), đồng thời giữ vùng an toàn chiến đấu trung tâm HUD (`[22%..78%]` ngang × `[16%..82%]` dọc, chiếm `68%–76%` màn hình) hoàn toàn sạch để không che khuất vùng cảnh báo đòn Boss.
- **FR-003**: Hệ thống giao diện PHẢI sử dụng `100%` tài nguyên cục bộ (phông chữ pixel hỗ trợ đầy đủ dấu tiếng Việt giấy phép mở, khung hình 9-slice, biểu tượng, con trỏ pixel), tuyệt đối không gửi bất kỳ yêu cầu mạng nào tới CDN hay dịch vụ bên thứ ba; áp dụng quy tắc bảo vệ dấu tiếng Việt (`line-height >= 1.35` tiêu đề / `>= 1.45` thân bài, ngân sách giãn nở `+25%`, chữ số căn đều cột và cấm cắt dấu ba chấm trên số liệu kinh tế/tỷ lệ/mã lỗi).
- **FR-004**: Hệ thống giao diện PHẢI đạt chuẩn tương phản màu tối thiểu **WCAG 2.1 Level AA** (`>= 4.5:1` cho văn bản thường và nút bấm, `>= 3.0:1` cho thành phần đồ họa và vòng tiêu điểm; huy hiệu độ hiếm/nguyên tố trên giấy da sáng bắt buộc đặt trên nền tối), đồng thời mã hóa kép an toàn cho người mù màu trên cả `6` bậc độ hiếm (khung + chữ + sao), `9` nguyên tố (hình bóng riêng), bóng đặt công trình (`✓` vs gạch chéo `✕`), so sánh chỉ số (`▲`/`▼`) và vùng cảnh báo Boss.
- **FR-005**: Hệ thống giao diện PHẢI tuân thủ giới hạn an toàn nhạy cảm ánh sáng và chuyển động: trần nhấp nháy cứng toàn hệ thống `<= 3` lần/giây, cấm chớp toàn màn hình tương phản cao, cung cấp tùy chọn Rung màn hình (`0% / 50% / 100%`), Giảm lóe sáng VFX, Phóng to cỡ chữ (`100% / 115% / 130%`), Phụ đề Cảnh báo Boss, âm lượng tách `5` kênh, tùy biến phím tắt có phát hiện/hoán đổi trùng phím, và tự động tôn trọng thiết lập giảm chuyển động của hệ điều hành; toàn bộ cài đặt lưu cục bộ và đồng bộ vào hồ sơ tài khoản JSON.
- **FR-006**: Hệ thống giao diện PHẢI cài đặt bộ điều phối tiêu điểm đầu vào 5 tầng ưu tiên (`WORLD_GAMEPLAY`, `BUILDING_GHOST`, `MODAL_OVERLAY`, `TEXT_IME_INPUT`, `DISCONNECTED_LOCK`), bảo vệ hoàn toàn phiên tổ hợp dấu bộ gõ tiếng Việt (Telex/VNI) khỏi kích hoạt nhầm phím tắt/kỹ năng, hỗ trợ điều hướng toàn bộ bằng bàn phím kèm vòng tiêu điểm tương phản cao, bẫy tiêu điểm trong cửa sổ (Focus Trap) và khôi phục tiêu điểm khi đóng.
- **FR-007**: Mọi thành phần giao diện cốt lõi và các màn hình tương ứng PHẢI cài đặt đầy đủ ma trận trạng thái (`default`, `hover`, `active`, `focus`, `disabled`, `loading`, `empty`, `error`, `disconnected`), khóa chống bấm đúp giao dịch kinh tế/Gacha/Cường hóa, hiển thị thông báo lỗi tiếng Việt ánh xạ chuẩn mã lỗi máy chủ, và duy trì khả năng đọc dữ liệu an toàn khi ngoại tuyến kèm thanh tự động kết nối lại.
- **FR-008**: Hệ thống giao diện PHẢI đáp ứng linh hoạt các độ phân giải máy tính từ `1024×768` đến `2560×1440` (ưu tiên hiển thị tỷ lệ nguyên `INTEGER_FIT` trên khung gốc `640×360` với tùy chọn `FILL_PIXELATED`, bảo toàn tỷ lệ `16:9` công bằng trên màn hình siêu rộng, co giãn lưới `8 → 6` cột ở Túi đồ và `1×4 → 2×2` ở Tổ đội tại `1024×768`) và giữ sẵn thiết kế mở rộng điều khiển tay cầm (M4) cùng cảm ứng di động (M5).
- **FR-009**: Hệ thống kiểm thử chất lượng tự động PHẢI chạy hoàn toàn cục bộ trên trình duyệt thật (không dùng dịch vụ đối chiếu ảnh đám mây bên thứ ba) với bộ dữ liệu mẫu JSON cố định, quét đủ `24` màn hình và ma trận trạng thái ở tối thiểu `1920×1080`, `1280×720`, `1024×768` và cấu hình trợ năng `1280×720 @ 130%`, kiểm tra tự động: đối chiếu sai lệch ảnh chụp (`<= 0.5%`), độ sắc nét pixel, vùng an toàn chiến đấu, tương phản/trợ năng bàn phím, tràn chữ/cắt dấu tiếng Việt, an toàn bộ gõ IME và `0` yêu cầu mạng ra bên ngoài.
- **FR-010**: Hệ thống kiểm thử tự động PHẢI chụp và lưu bằng chứng ảnh thực tế (kèm ảnh khoanh khung đỏ vùng lỗi cho mọi lỗi thị giác) và tự động xuất báo cáo kiểm toán lỗi bằng tiếng Việt phân loại `P0–P3` theo chuẩn gồm Mã lỗi, Màn hình/Trạng thái, Độ phân giải, Đường dẫn ảnh thật, Bước tái hiện, Hành vi Kỳ vọng và Hành vi Thực tế, tuân thủ tuyệt đối nguyên tắc không giả mạo kết quả hay ảnh chụp.

### Key Entities *(include if feature involves data)*

- **UiPreferencesProfile**: Hồ sơ tùy chọn giao diện và trợ năng của người chơi gồm chế độ tỷ lệ khung hình, cỡ chữ (`100%/115%/130%`), mức rung màn hình (`0/50/100%`), công tắc giảm lóe sáng, chế độ hỗ trợ mù màu, phụ đề cảnh báo Boss, âm lượng 5 kênh và bảng gán phím tùy biến.
- **UiScreenRegistryEntry**: Bản ghi danh mục của từng màn hình trong `24` màn hình chuẩn gồm mã màn hình (`SCR-01`..`SCR-24`), định danh kiểm thử, lớp chiều sâu hiển thị, tập trạng thái bắt buộc phải bao phủ và kho trạng thái liên kết.
- **InputFocusStateSnapshot**: Trạng thái hiện hành của bộ điều phối đầu vào 5 tầng gồm tầng ưu tiên đang hoạt động, ngăn xếp cửa sổ mở theo thứ tự LIFO, cờ đang tổ hợp bộ gõ tiếng Việt và ngưỡng tần suất đồng bộ HUD.
- **UiAuditRunConfig**: Cấu hình một đợt kiểm toán giao diện tự động cục bộ gồm mã đợt chạy, danh sách độ phân giải mục tiêu, đường dẫn dữ liệu mẫu cố định, ngưỡng sai lệch điểm ảnh tối đa, cờ cấm mạng ngoài và hình chữ nhật vùng an toàn chiến đấu.
- **UiBugReportEntry**: Bản ghi lỗi kiểm toán giao diện tiếng Việt gồm mã lỗi, mức độ nghiêm trọng (`P0–P3`), màn hình và trạng thái bị lỗi, độ phân giải, đường dẫn ảnh chụp thật (gốc và khoanh vùng lỗi), hành vi kỳ vọng, hành vi thực tế và các bước tái hiện.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `100%` (`24/24`) màn hình bắt buộc hoạt động hoàn chỉnh qua đủ ma trận trạng thái áp dụng (`default`..`disconnected`) với `0` lỗi màn hình trắng, `0` lỗi cắt xén số liệu kinh tế/tỷ lệ Gacha/cường hóa và `0` kết nối tải tài nguyên tới tên miền bên ngoài.
- **SC-002**: `100%` cặp màu văn bản và thành phần tương tác đạt chuẩn tương phản WCAG 2.1 Level AA (`>= 4.5:1` văn bản, `>= 3.0:1` đồ họa/vòng tiêu điểm), `0` lỗi trợ năng mức nghiêm trọng/nặng, `0` hiệu ứng nhấp nháy vượt quá `3` lần/giây và `100%` thao tác cửa sổ hoàn thành được chỉ bằng bàn phím.
- **SC-003**: Trên tất cả các độ phân giải chuẩn (`1920×1080`, `1280×720`, `1024×768`) kể cả khi bật cỡ chữ `130%`, tỷ lệ phần tử bị tràn ngang hoặc cắt dấu tiếng Việt là `0%`, số phím chiến đấu bị kích hoạt nhầm khi gõ bộ gõ tiếng Việt là `0`, và vùng an toàn chiến đấu trung tâm HUD trống tối thiểu `68%` (tối thiểu `70%` ở `1280×720` và `76%` ở `1920×1080`).
- **SC-004**: Lớp giao diện người dùng giữ tần suất đồng bộ từ thế giới ở mức `<= 10 Hz` (`<= 5 Hz` cho bản đồ nhỏ) và `0` lần vẽ lại toàn bộ cây giao diện theo nhịp khung hình `60 FPS` của thế giới, hỗ trợ mục tiêu khung hình `60 FPS` mượt mà (`proposed / unverified`).
- **SC-005**: Bộ kiểm thử trình duyệt tự động cục bộ quét trọn vẹn `24` màn hình × các độ phân giải bắt buộc, phát hiện chính xác `100%` lỗi tràn chữ/lỗi tương phản/lỗi mạng ngoài được tiêm thử và sinh báo cáo lỗi tiếng Việt kèm ảnh khoanh vùng thật không có bất kỳ bằng chứng giả mạo nào.

## Assumptions

- Giao diện giai đoạn MVP ưu tiên trải nghiệm trình duyệt máy tính (`>= 1024×768`); ánh xạ điều khiển tay cầm (Gamepad) và điều khiển cảm ứng di động (Mobile Touch) được thiết kế lộ trình sẵn cho cột mốc M4 và M5.
- Trong giai đoạn hiện tại (`DESIGN_AND_PLANNING_ONLY`), toàn bộ kế hoạch kiểm thử tự động chỉ thiết lập đặc tả, hợp đồng và bộ tiêu chí nghiệm thu; không có bài kiểm thử production nào được đánh dấu đã vượt qua cho đến khi chuyển sang giai đoạn triển khai và chạy thật trên trình duyệt cục bộ (Nguyên tắc VIII).
- Mọi hợp đồng dữ liệu kho đồ, cường hóa, gacha, tổ đội, nông trại và Boss được cung cấp nhất quán từ các feature `001`–`011`.
