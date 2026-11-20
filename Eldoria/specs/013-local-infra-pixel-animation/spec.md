# Feature Specification: Local Containerized Runtime Cache, Object Asset Storage & Glitch-Free 2D Pixel Multi-Animation Pipeline

**Feature Branch**: `013-local-infra-pixel-animation`

**Created**: 2026-11-19

**Status**: Approved — Implementation Mode Authorized (`Q1-A`, `Q2-C`, `Q3-1&2`)

**Input**: User description: "Hiện tại cho phép redis + s3/mino can thiệp vô nhé chạy trong docker local cho tôi nhé. Ngoài ra Update plan check chéo lại cho tôi. Tôi muốn làm game pixel độ họa nhiều hoạt ảnh do bạn thiết kế dạng 2d ko bị lỗi"

## Clarifications

### Session 2026-11-19 (User-Ratified Decisions `DEC-004`)
- **Q1-A (Pixel Resolution Standard — RATIFIED)**: Giữ chuẩn `32×32 px` base world tile, `48×64 px` humanoid character và `128×128..256×256 px` boss theo `Constitution §V`, đồng thời dùng chuẩn **`16×16 px`** cho **hiệu ứng VFX động, tia lửa trúng đòn, đạn đạo nhỏ, icon trạng thái, vật phẩm rơi lấp lánh và hạt môi trường** ở mật độ điểm ảnh `1:1` thống nhất (không mixel).
- **Q2-C (End-to-End Scope — RATIFIED)**: Hướng tới triển khai đầy đủ **toàn bộ 13 Spec Kit features (`001..013`) và đủ 24/24 màn hình UI** theo kiến trúc **Multi-Run Checkpoints** (Đợt 1 6–8 tiếng: hoàn chỉnh toàn bộ bộ PNG 4 hướng/ra chiêu/VFX/`16×16` + Docker JSON/Redis/MinIO + lát cắt dọc E2E chơi được từ đầu đến cuối; Đợt 2: hoàn thiện nốt toàn bộ 24/24 màn hình, các module phụ trợ và kiểm thử tải/trợ năng).
- **Q3-1 & 2 (Task & Mode Gate — RATIFIED)**: Cập nhật đồng bộ `spec.md`, `plan.md`, `data-model.md`, `tasks.md` kèm pipeline sinh ảnh `.png` pixel 4 hướng/ra chiêu/VFX/`16×16` + ghép nối người dùng E2E, và chính thức phê duyệt chuyển sang **`IMPLEMENTATION MODE`** ngay sau khi hoàn tất bước `/speckit-tasks`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trải nghiệm Hoạt ảnh Pixel 2D Phong phú, Sắc nét & Không Lỗi Đồ họa (Priority: P1)

Là người chơi trong thế giới pixel 2D **Eldoria: Forgotten Wilds**, tôi muốn mọi nhân vật, quái vật, boss, động vật, cây trồng và môi trường đều có nhiều hoạt ảnh 2D phong phú (đứng thở, đi bộ, chạy, combo chém 3 nhịp, tung kỹ năng, tuyệt kỹ, né đòn, đỡ đòn, trúng đòn, ngã gục, chặt cây, đào quặng, làm ruộng, câu cá, gió thổi cây/nước, lửa lò rèn) hiển thị sắc nét tuyệt đối từng điểm ảnh mà không bị nhòe hình, không bị rách viền ô đất (seam bleeding), không bị kẹt trạng thái hoạt ảnh và không bị xuyên cắt chiều sâu khi đi qua sau tán cây hoặc công trình.

**Why this priority**: Cảm giác thị giác và độ mượt của hoạt ảnh 2D là ấn tượng đầu tiên và xuyên suốt mọi giây phút chơi game Action RPG; lỗi rách ô đất, nhòe pixel hoặc kẹt hoạt ảnh khi tung chiêu phá hỏng trải nghiệm ngay lập tức.

**Independent Test**: Có thể kiểm chứng độc lập bằng cách nạp cảnh thử nghiệm chứa 3 nhân vật khởi đầu, 1 quái vật, 1 boss, cây cối và ô đất nước/cỏ, sau đó kích hoạt tuần tự toàn bộ 25 trạng thái hoạt ảnh theo đủ 4 hướng, di chuyển nhân vật băng qua phía trước và phía sau thân cây/trụ đá, và phóng to màn hình ở các độ phân giải desktop khác nhau để kiểm tra không có nhòe điểm ảnh, không có khe hở giữa ô gạch và không có trạng thái nào bị kẹt vĩnh viễn.

**Acceptance Scenarios**:

1. **Given** người chơi đang đứng trong làng khởi đầu hoặc rừng trên màn hình desktop có độ phân giải phổ biến (720p, 1080p, 1440p), **When** nhân vật di chuyển chéo, chạy nhanh và chuyển đổi hướng liên tục trên bản đồ có nước, đường mòn và thảm cỏ động, **Then** hình ảnh giữ sắc nét pixel tuyệt đối (không làm mờ cạnh, không xuất hiện khe hở 1 pixel giữa các ô đất và không rung giật viền ảnh khi camera di chuyển).
2. **Given** người chơi đang thực hiện chuỗi hành động chiến đấu nhanh (Đòn thường 3 nhịp → Né đòn → Kỹ năng → Tuyệt kỹ → Bị quái đánh ngắt chiêu), **When** các tín hiệu chuyển trạng thái đến dồn dập trong thời gian ngắn, **Then** nhân vật chuyển hoạt ảnh đúng quy tắc ưu tiên, kết thúc hoạt ảnh đúng thời hạn và tự động trở về trạng thái đứng thở sau khi hoàn tất mà không bao giờ bị đơ ở khung hình giữa chừng.
3. **Given** nhân vật đi vòng phía sau thân cây, mái nhà hoặc trụ đá đấu trường rồi quay ra phía trước, **When** vị trí bàn chân của nhân vật thay đổi tương đối so với gốc vật thể, **Then** thứ tự hiển thị trước-sau cập nhật tức thời chính xác, đồng thời mái nhà/tán cây tự mờ nhẹ khi che người chơi để luôn nhìn thấy vị trí nhân vật và dấu báo đòn của boss.
4. **Given** người chơi thực hiện các hoạt động đời sống (đào quặng, chặt gỗ, cuốc/tưới ruộng, câu cá, rèn đồ) và quan sát động vật/cây trồng, **When** mỗi hoạt động diễn ra, **Then** hệ thống hiển thị đầy đủ bộ hoạt ảnh chuyên biệt tương ứng với hướng nhân vật và tiến độ phát triển của đối tượng thế giới.

---

### User Story 2 - Vận hành Hạ tầng Tự chủ Một Lệnh với Bộ nhớ Đệm Nóng & Kho Tài nguyên Đóng gói Cục bộ (Priority: P1)

Là quản trị viên hoặc người phát triển tự vận hành trò chơi trên máy cá nhân, tôi muốn khởi động toàn bộ môi trường trò chơi bằng một quy trình đóng gói cục bộ duy nhất gồm máy chủ trò chơi, kho lưu trữ dữ liệu chính dạng tệp JSON, dịch vụ bộ nhớ đệm/điều phối thời gian thực cục bộ và kho lưu trữ đối tượng tương thích S3 cục bộ chứa toàn bộ hình ảnh hoạt ảnh 2D, bản đồ, âm thanh và bản sao lưu — hoàn toàn không cần tài khoản hay kết nối dịch vụ đám mây bên thứ ba.

**Why this priority**: Cho phép đội phát triển và người chơi tự chủ vận hành môi trường đồng bộ, tăng tốc xử lý phiên/hiện diện/giới hạn tần suất và phân phát khối lượng lớn sprite sheet 2D chuyên nghiệp mà vẫn bảo toàn 100% dữ liệu gốc ở định dạng JSON dễ kiểm soát.

**Independent Test**: Có thể kiểm chứng độc lập bằng cách khởi chạy bộ dịch vụ cục bộ trên một máy sạch không kết nối Internet bên ngoài, xác nhận toàn bộ dịch vụ đạt trạng thái sẵn sàng, kho tài nguyên tự động khởi tạo đủ các ngăn chứa tài sản game và bản sao lưu, trò chơi nạp toàn bộ hoạt ảnh từ kho đối tượng cục bộ và dữ liệu người chơi vẫn được ghi bền vững hoàn toàn vào tệp JSON cục bộ.

**Acceptance Scenarios**:

1. **Given** máy chủ cục bộ chưa từng khởi tạo trước đó và không có kết nối ra các dịch vụ đám mây bên ngoài, **When** quản trị viên kích hoạt khởi chạy môi trường đóng gói cục bộ, **Then** toàn bộ thành phần (máy chủ trò chơi, bộ nhớ đệm thời gian thực cục bộ, kho tài nguyên đối tượng cục bộ và quy trình khởi tạo ngăn chứa) tự động lên trạng thái khỏe mạnh trong vòng 60 giây.
2. **Given** môi trường đóng gói cục bộ đang hoạt động và nhiều người chơi đăng nhập đồng thời, **When** người chơi di chuyển, gửi tin nhắn vùng, kiểm tra trạng thái trực tuyến của bạn bè và thực hiện giao dịch, **Then** trạng thái tạm thời (trực tuyến, phiên nóng, giới hạn chống spam, đồng bộ sự kiện vùng) được phục vụ tức thì qua dịch vụ đệm cục bộ, trong khi toàn bộ thay đổi tài sản, kho đồ, tiền tệ và tiến trình vẫn được ghi bền vững nguyên tử vào cơ sở dữ liệu tệp JSON chính.
3. **Given** đến chu kỳ sao lưu định kỳ hoặc trước khi nâng cấp lược đồ dữ liệu, **When** hệ thống thực hiện sao lưu, **Then** bản chụp toàn vẹn kèm mã kiểm tra của toàn bộ cơ sở dữ liệu JSON được lưu an toàn vào ngăn chứa sao lưu của kho đối tượng cục bộ và xoay vòng đúng chính sách lưu giữ.

---

### User Story 3 - Kiểm chứng Tự động Toàn vẹn Bộ Hoạt ảnh & Tài nguyên 2D Trước Khi Chơi (Priority: P2)

Là nhà thiết kế đồ họa 2D và kỹ sư kiểm thử, tôi muốn hệ thống tự động rà soát chéo toàn bộ bảng hình ảnh (sprite atlas), danh mục hoạt ảnh, bản đồ và nội dung trò chơi trước khi xuất bản lên kho đối tượng cục bộ và trước khi máy chủ mở cửa, nhằm phát hiện 100% lỗi thiếu khung hình, sai tên khóa hoạt ảnh, lệch điểm neo (pivot), thiếu viền chống lem hoặc lệch phiên bản tài nguyên trước khi người chơi gặp lỗi hiển thị.

**Why this priority**: Với hàng chục trạng thái hoạt ảnh cho nhiều nhân vật, quái vật, boss và hiệu ứng, kiểm tra thủ công bằng mắt thường rất dễ bỏ sót khóa thiếu dẫn đến nhân vật tàng hình hoặc ô vuông hồng/đen khi đang chơi.

**Independent Test**: Có thể kiểm chứng độc lập bằng cách đưa một gói tài nguyên mẫu cố tình bị thiếu 1 khóa hoạt ảnh hoặc thiếu viền chống lem qua bộ công cụ kiểm định tự động và xác nhận công cụ chặn xuất bản với báo cáo chỉ rõ tên thực thể, trạng thái và khung hình bị lỗi; khi sửa đủ thì báo cáo đạt chuẩn 100%.

**Acceptance Scenarios**:

1. **Given** bộ tài nguyên 2D hoàn chỉnh cho phạm vi MVP được chuẩn bị để đóng gói, **When** quy trình kiểm chứng tự động chạy đối chiếu giữa danh mục nội dung trò chơi, đặc tả hoạt ảnh và gói ảnh đầu ra, **Then** hệ thống xác nhận 100% nhân vật, quái vật, boss, vũ khí và vật thể MVP đều có đủ trạng thái hoạt ảnh bắt buộc, đúng kích thước khung chuẩn và có mã kiểm tra toàn vẹn.
2. **Given** một bản cập nhật tài nguyên vô tình thiếu hoạt ảnh đánh hoặc sai tên khóa trạng thái của một nhân vật, **When** chạy kiểm định trước khi tải lên kho đối tượng cục bộ, **Then** quá trình xuất bản dừng ngay lập tức và liệt kê chính xác danh sách khóa bị thiếu hoặc không khớp.
3. **Given** trình duyệt người chơi đang tải tài nguyên trong màn hình chờ vào vùng mới, **When** một gói ảnh riêng lẻ gặp sự cố truyền tải cục bộ thoáng qua, **Then** hệ thống tự động thử tải lại có giới hạn và nếu vẫn thất bại thì hiển thị hình thay thế an toàn chuẩn pixel (không gây treo màn hình hay đứng nhân vật) kèm thông báo rõ ràng.

---

### User Story 4 - Khôi phục An toàn Khi Dịch vụ Phụ trợ Khởi động lại Không Mất Dữ liệu Người chơi (Priority: P2)

Là người chơi đang chiến đấu hoặc quản trị viên xử lý sự cố nguồn điện, tôi muốn ngay cả khi dịch vụ bộ nhớ đệm tạm thời bị xóa sạch hoặc khởi động lại đột ngột, dữ liệu tài khoản, nhân vật, vũ khí cường hóa, kho đồ và nông trại của tôi hoàn toàn không bị mất, và trò chơi tự động tái đồng bộ trạng thái hoạt động ổn định.

**Why this priority**: Bảo vệ ranh giới kiến trúc bất biến rằng kho dữ liệu JSON là nguồn chân lý bền vững duy nhất, ngăn chặn rủi ro mất đồ hoặc sập hoàn toàn trò chơi chỉ vì bộ nhớ đệm tạm thời khởi động lại.

**Independent Test**: Có thể kiểm chứng độc lập bằng cách cho người chơi hoàn tất một giao dịch nâng cấp hoặc nhặt đồ, sau đó xóa trắng và khởi động lại dịch vụ bộ nhớ đệm cục bộ, rồi đăng nhập lại để xác nhận 100% vật phẩm và tiền tệ giữ nguyên vẹn và phiên chơi mới hoạt động bình thường.

**Acceptance Scenarios**:

1. **Given** người chơi vừa hoàn tất cường hóa vũ khí hoặc quay nhận nhân vật mới thành công, **When** dịch vụ bộ nhớ đệm tạm thời cục bộ bị khởi động lại và mất toàn bộ dữ liệu trong bộ nhớ, **Then** toàn bộ vũ khí, nhân vật mới, chỉ số pity và số dư tiền tệ vẫn nguyên vẹn 100% khi tải lại từ cơ sở dữ liệu tệp JSON chính.
2. **Given** dịch vụ bộ nhớ đệm cục bộ tạm gián đoạn trong vài giây khi đang có người chơi kết nối, **When** người chơi tiếp tục di chuyển hoặc lưu tiến trình, **Then** máy chủ chuyển sang chế độ dự phòng bằng bộ nhớ nội bộ cho các tác vụ tạm thời, ghi nhật ký cảnh báo rõ ràng cho quản trị viên và tự động kết nối lại khi dịch vụ sẵn sàng mà không làm hỏng tệp JSON.

---

### Edge Cases

- **Thay đổi kích thước cửa sổ trình duyệt hoặc phóng to/thu nhỏ trình duyệt (`125%`, `150%` DPI)**: Tỷ lệ phóng hình pixel tự tính lại theo bội số nguyên hợp lệ gần nhất hoặc giữ bộ lọc điểm ảnh sắc nét không mờ nhòe; thanh giao diện không che khuất khu vực thao tác chính.
- **Kẹt trạng thái hoạt ảnh do mất gói tin mạng trong lúc tung kỹ năng**: Khi máy khách không nhận được tín hiệu kết thúc chiêu trong khoảng thời gian vượt quá thời lượng tối đa của hoạt ảnh cộng ngưỡng an toàn, bộ giám sát hoạt ảnh tự động đưa nhân vật về trạng thái đứng thở hoặc di chuyển hợp lệ, đồng thời đối chiếu lại trạng thái từ bản chụp kế tiếp của máy chủ.
- **Hai thao tác ghi tài sản đồng thời khi dịch vụ đệm cục bộ đang khởi động lại**: Cơ chế khóa nguyên tử theo từng thực thể trên máy chủ và nhật ký ghi trước (WAL) trên hệ thống tệp JSON vẫn đảm bảo không xảy ra nhân bản vật phẩm hay trừ tiền hai lần.
- **Kho lưu trữ đối tượng cục bộ đầy dung lượng hoặc chứa bản tải lên hỏng**: Kiểm tra mã toàn vẹn (checksum) phát hiện và từ chối ngay tệp tài nguyên bị cắt cụt; quy trình sao lưu xoay vòng tự dọn bản cũ quá hạn để không làm tràn đĩa cục bộ và ghi cảnh báo vận hành ngay khi dung lượng ổ đĩa trống xuống dưới **15%**.
- **Hàng chục thực thể hiển thị hoạt ảnh cùng lúc trong Boss Raid 4 người**: Hệ thống áp trần mật độ hạt hiệu ứng tối đa **120 hạt đồng thời trên khung hình**, giữ tần suất nhấp nháy **<= 3 Hz** và giảm độ mờ hiệu ứng đồng minh theo cài đặt người chơi để không che dấu báo đòn của boss và không gây giật khung hình.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống MUST duy trì **100% cơ sở dữ liệu bền vững dạng tệp JSON cục bộ** làm nguồn lưu trữ chính duy nhất cho mọi dữ liệu người chơi, kho đồ, tiền tệ, nông trại, lãnh địa, lịch sử giao dịch và kiểm toán; không lưu trữ dữ liệu bền vững chính vào cơ sở dữ liệu quan hệ hay tài liệu truyền thống bên ngoài.
- **FR-002**: Hệ thống MUST hỗ trợ vận hành tự chủ hoàn toàn trong môi trường đóng gói cục bộ (không phụ thuộc dịch vụ đám mây hay bên thứ ba bên ngoài), bao gồm dịch vụ bộ nhớ đệm/điều phối thời gian thực cục bộ và kho lưu trữ đối tượng tương thích chuẩn S3 cục bộ.
- **FR-003**: Dịch vụ bộ nhớ đệm cục bộ MUST chỉ đảm nhận các trạng thái tạm thời có thể tái tạo (hiện diện trực tuyến, tra cứu phiên nóng, giới hạn tần suất hành động, phát tán sự kiện vùng/nhóm và bộ lọc chống trùng lặp ngắn hạn), đồng thời có cơ chế dự phòng an toàn nếu dịch vụ này tạm gián đoạn mà không gây mất dữ liệu bền vững.
- **FR-004**: Kho lưu trữ đối tượng cục bộ MUST quản lý tách biệt tối thiểu hai ngăn chứa: một ngăn chứa công khai chỉ đọc cho tài nguyên trò chơi phiên bản hóa (bảng ảnh hoạt ảnh 2D, bộ ô bản đồ, âm thanh, phông chữ nội bộ, bảng kê phiên bản) và một ngăn chứa riêng tư cho các bản sao lưu xoay vòng có mã kiểm tra toàn vẹn của cơ sở dữ liệu JSON.
- **FR-005**: Quy trình khởi động môi trường cục bộ MUST tự động khởi tạo các ngăn chứa bắt buộc, thiết lập chính sách truy cập đúng quyền hạn, xác nhận tình trạng sẵn sàng của từng thành phần theo thứ tự phụ thuộc và cung cấp điểm kiểm tra sức khỏe hợp nhất.
- **FR-006**: Hệ thống đồ họa 2D MUST áp dụng dựng hình sắc nét từng điểm ảnh không làm mờ, khóa tọa độ hiển thị theo số nguyên cho mọi thực thể chuyển động và camera, và duy trì chuẩn mật độ điểm ảnh đồng nhất (`32×32` ô địa hình, `48×64` nhân vật, `128×128..256×256` boss và **`16×16` hoạt ảnh hiệu ứng/đạn đạo/icon/hạt môi trường** theo quyết định `Q1-A`) không gây mixel.
- **FR-007**: Mọi bộ ô bản đồ (tileset) và bảng ảnh hoạt ảnh (sprite atlas) MUST có khoảng đệm an toàn và viền lặp chống rách mép, kèm thông tin neo tọa độ chân (pivot) thống nhất và phân tách rạch ròi 4 vùng không gian (khung hình ảnh, vùng trúng đòn, vùng va chạm bàn chân, vùng tương tác).
- **FR-008**: Hệ thống hoạt ảnh nhân vật và thực thể 2D MUST hỗ trợ đầy đủ 25 trạng thái hoạt ảnh chuẩn cho nhân vật chính (từ đứng thở, đi, chạy, đánh combo, dùng kỹ năng, tuyệt kỹ, né, đỡ, trúng đòn, ngã gục đến khai khoáng, chặt gỗ, làm ruộng, câu cá, chế tạo, xây dựng, tương tác và biểu cảm) theo 4 hướng độc lập (sẵn sàng mở rộng 8 hướng), cùng bộ hoạt ảnh chuyên biệt cho quái vật, boss đa giai đoạn, động vật, cây trồng theo cấp độ và vật thể môi trường động.
- **FR-009**: Bộ máy điều phối hoạt ảnh MUST thực thi quy tắc ưu tiên chuyển trạng thái nhất quán, hỗ trợ cửa sổ hủy chiêu mượt mà, đồng bộ trạng thái hiển thị nhiều người chơi mà không phụ thuộc hoạt ảnh máy khách để tính sát thương, và tích hợp cơ chế giám sát chống kẹt hoạt ảnh (tự hồi về trạng thái hợp lệ khi quá thời lượng tối đa).
- **FR-010**: Hệ thống MUST cung cấp quy trình kiểm chứng tự động toàn bộ bảng kê tài nguyên và hoạt ảnh 2D (đối chiếu 100% khóa hoạt ảnh, số lượng khung hình, khung gây sát thương, mã kiểm tra tệp và sự tồn tại trong kho đối tượng cục bộ) trước khi đóng gói và khi máy chủ khởi động.
- **FR-011**: Khi phát hiện một tài nguyên hiển thị bị thiếu hoặc lỗi truyền tải thoáng qua, máy khách MUST thực hiện thử tải lại tối đa **3 lần** theo chu kỳ lùi dần trước khi chuyển sang nguồn dự phòng cục bộ hoặc áp dụng hình thay thế an toàn đúng kích thước lưới mà không làm sập phiên chơi hoặc làm nhân vật biến mất.
- **FR-012**: Hệ thống MUST cung cấp một công cụ trực quan chạy ngoại tuyến cho phép nhà thiết kế và người dùng xem trước trực tiếp các hoạt ảnh 2D nhiều trạng thái, đổi 4 hướng, kiểm tra lớp va chạm/điểm neo, kiểm tra xếp lớp chiều sâu Y-sorting và xác minh không có lỗi nhòe hay rách khung hình trước khi lập trình mã nguồn chính thức.
- **FR-013**: Hệ thống MUST cung cấp quy trình sinh tệp ảnh `.png` pixel 2D trong suốt cục bộ có tính tất định (0 API trả phí, 0 ảnh Internet chưa rõ bản quyền) bao phủ đầy đủ 4 hướng (trước/sau/trái/phải), tư thế ra chiêu/tuyệt kỹ, hiệu ứng VFX, bộ hoạt ảnh `16×16`, quái vật/boss/nông trại/công trình MVP và bộ ô địa hình có viền chống lem để sẵn sàng đồng bộ lên kho đối tượng cục bộ.
- **FR-014**: Hệ thống MUST ghép nối trọn vẹn các tài nguyên `.png` hoạt ảnh 2D và hạ tầng đóng gói cục bộ vào hành trình người chơi đầu-cuối (Đăng nhập → Chọn nhân vật → Di chuyển 4 hướng trên bản đồ → Chiến đấu ra chiêu/VFX → Nhặt đồ/Kho đồ → Chế tạo/Nông trại/Cường hóa/Gacha → Đấu Boss → Lưu/Kết nối lại) với các điểm mốc kiểm chứng độc lập cho lộ trình triển khai đầy đủ 13 feature và 24 màn hình (`Q2-C`).

### Key Entities *(include if feature involves data)*

- **AssetManifest**: Bảng kê phiên bản của toàn bộ tài nguyên 2D lưu trong kho đối tượng cục bộ, gồm mã phiên bản gói, danh sách đường dẫn tương đối trong ngăn chứa, mã kiểm tra toàn vẹn (checksum), kích thước tệp, kích thước khung chuẩn và nhóm tải theo vùng.
- **AnimationClipDefinition**: Đặc tả chuẩn hóa cho từng đoạn hoạt ảnh 2D (mã khóa hoạt ảnh, nhóm thực thể, hướng, số khung, thời lượng mỗi khung, chế độ lặp, điểm neo chân, khung kích hoạt tác động, cửa sổ hủy chiêu, thời lượng tối đa chống kẹt và trạng thái hồi về mặc định).
- **EphemeralRuntimeState**: Tập bản ghi tạm thời lưu trong dịch vụ đệm cục bộ gồm trạng thái hiện diện trực tuyến theo vùng, ánh xạ phiên nóng có thời hạn, bộ đếm giới hạn tần suất hành động và dấu khóa chống gửi lặp ngắn hạn — có thể xóa trắng và tái tạo hoàn toàn mà không ảnh hưởng dữ liệu bền vững.
- **BackupObjectSnapshot**: Bản ghi bản sao lưu cơ sở dữ liệu JSON được lưu trong ngăn chứa riêng tư của kho đối tượng cục bộ, gồm mã thời gian, số lượng tệp JSON, tổng dung lượng, mã kiểm tra gốc và chính sách hết hạn xoay vòng.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Quản trị viên có thể khởi động toàn bộ môi trường đóng gói cục bộ từ trạng thái sạch trên máy cá nhân không cần dịch vụ đám mây ngoài và đạt trạng thái sẵn sàng đầy đủ trong dưới **60 giây** (100% thành phần vượt qua kiểm tra sức khỏe).
- **SC-002**: **100%** nhân vật, quái vật, boss, động vật và công trình thuộc phạm vi MVP vượt qua kiểm chứng tự động về tính đầy đủ khóa hoạt ảnh, khung hình, viền chống lem và mã kiểm tra toàn vẹn với **0** khóa thiếu hoặc lệch chuẩn.
- **SC-003**: Trong kịch bản kiểm thử căng thẳng chuyển trạng thái hoạt ảnh liên tục (1.000 lần chuyển giữa di chuyển, combo, kỹ năng, né đòn, trúng đòn và hoạt động đời sống trong 5 phút), tỷ lệ xảy ra kẹt trạng thái hoạt ảnh, mất hình nhân vật hoặc sập dựng hình là **0%**.
- **SC-004**: Khi kiểm tra hiển thị trực quan trên 3 mốc độ phân giải desktop chuẩn (720p, 1080p, 1440p) với camera di chuyển và 4 người chơi chiến đấu đồng thời trong đấu trường boss, ghi nhận **0** lỗi rách viền ô đất (seam bleeding), **0** lỗi nhòe điểm ảnh và **100%** dấu báo đòn của boss luôn nhìn rõ xuyên qua hiệu ứng chiến đấu.
- **SC-005**: Trong kịch bản mô phỏng xóa sạch và khởi động lại dịch vụ bộ nhớ đệm tạm thời ngay sau 50 giao dịch kho đồ/cường hóa/gacha liên tiếp, **100%** dữ liệu người chơi và số dư tiền tệ được bảo toàn nguyên vẹn từ cơ sở dữ liệu tệp JSON chính (**0%** mất hoặc nhân bản dữ liệu).
- **SC-006**: **100%** bản sao lưu định kỳ tạo ra trên ngăn chứa sao lưu cục bộ vượt qua bước xác minh mã kiểm tra toàn vẹn và có thể khôi phục về trạng thái chơi được trong dưới **5 phút**.

## Assumptions

- **Môi trường máy chủ cá nhân**: Người vận hành có cài đặt môi trường container cục bộ tiêu chuẩn trên Windows, macOS hoặc Linux với ổ đĩa SSD và tối thiểu 4 GB RAM trống dành cho các dịch vụ cục bộ.
- **Phạm vi tài nguyên hoạt ảnh 2D đầu tiên (MVP)**: Toàn bộ đặc tả kiến trúc hoạt ảnh và công cụ kiểm định bao phủ toàn bộ catalog dài hạn (12 nhân vật, 38 quái, 5 boss), nhưng đợt sản xuất và nghiệm thu đầu tiên khóa vào phạm vi MVP (3 nhân vật khởi đầu, 8 quái thường, 1 quái tinh anh, 1 boss 3 giai đoạn, 2 động vật, 5 cây trồng, 6 công trình, 2 vùng đất và 1 phụ bản).
- **Quyền sở hữu tài nguyên**: 100% tài nguyên hình ảnh hoạt ảnh 2D và âm thanh đều do dự án tự thiết kế hoặc dùng phông chữ/tài nguyên nguồn mở có giấy phép xác minh rõ ràng lưu cục bộ trong kho đối tượng tự vận hành; không tải nóng từ mạng ngoài.
- **Không thanh toán hay đám mây ngoài**: Dù hỗ trợ giao diện lưu trữ đối tượng chuẩn S3 cục bộ và bộ nhớ đệm cục bộ, toàn bộ hạ tầng vẫn 100% tự vận hành nội bộ, không phát sinh chi phí đám mây bên thứ ba.
- **Trạng thái hiện tại của dự án**: Đặc tả này được hoàn thiện trong chế độ thiết kế và lập kế hoạch; việc tạo tệp cấu hình chạy thực tế và mã nguồn triển khai sẽ diễn ra sau khi người dùng phê duyệt chuyển sang giai đoạn triển khai.
