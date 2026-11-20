# Feature Specification: Foundation, JSON-Only Database Engine & Game Loop Shell

**Feature Branch**: `001-foundation-game-engine`

**Created**: 2026-11-19

**Status**: Reviewed (Autonomous Design Baseline — Chờ phê duyệt chuyển sang Implementation)

**Input**: User description: "Foundation monorepo, JSON-only local database engine, catalog loader, Phaser 3 and NestJS 20Hz simulation shell"

## Clarifications

### Session 2026-11-19 *(Autonomous Design Decisions — Proposed, Chưa có phê duyệt triển khai của người dùng)*

- Q: Nền tảng lưu trữ bền vững chính cho toàn bộ dữ liệu game là gì? → A: 100% tệp JSON cục bộ (`data/db/**/*.json`) quản lý bởi động cơ lưu trữ nội bộ; tuyệt đối không dùng cơ sở dữ liệu truyền thống hay dịch vụ bên thứ ba *(Mandated by Constitution Principle I / DEC-001)*.
- Q: Khi máy chủ bị tắt đột ngột giữa giao dịch đa thực thể, dữ liệu phải được khôi phục như thế nào? → A: Tự động dọn tệp tạm mồ côi và phát lại (roll-forward) hoặc hoàn tác sạch các bản ghi nhật ký ghi trước (WAL JSON) trước khi mở nhận kết nối mới *(Proposed Decision — ASM-002)*.
- Q: Chính sách sao lưu cục bộ mặc định là gì? → A: Tự động tạo bản chụp toàn bộ thư mục dữ liệu mỗi 6 giờ và trước mọi nâng cấp schema, giữ xoay vòng 4 bản 6-giờ gần nhất và 7 bản cuối ngày gần nhất *(Proposed Decision)*.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bảo toàn Dữ liệu Người chơi 100% trên Tệp JSON Cục bộ (Priority: P1)

Với tư cách là chủ vận hành trò chơi và người chơi, tôi muốn mọi dữ liệu bền vững (tài khoản, nhân vật, kho đồ, nhà cửa, lịch sử giao dịch) được lưu trữ hoàn toàn bằng tệp JSON cục bộ mà không cần cài đặt máy chủ cơ sở dữ liệu ngoài hay dịch vụ đám mây bên thứ ba, đồng thời không bao giờ bị hỏng tệp hoặc mất đồng bộ khi nhiều thao tác diễn ra cùng lúc hoặc khi máy chủ gặp sự cố đột ngột.

**Why this priority**: Đây là nguyên tắc nền móng bất khả xâm phạm (Nguyên tắc I của Hiến pháp) và là điều kiện tiên quyết chặn toàn bộ 11 feature còn lại.

**Independent Test**: Có thể kiểm thử độc lập bằng cách khởi chạy động cơ lưu trữ cục bộ trên một thư mục dữ liệu trống, thực hiện 50 giao dịch đa thực thể đồng thời, mô phỏng tắt máy chủ giữa chừng ở giai đoạn ghi WAL rồi khởi động lại và xác nhận 100% tệp JSON đọc được, checksum hợp lệ, không mất bản ghi và không tồn tại bất kỳ kết nối mạng ra ngoài nào.

**Acceptance Scenarios**:

1. **Given** máy chủ khởi động lần đầu với thư mục dữ liệu trống, **When** quá trình khởi tạo hoàn tất, **Then** hệ thống tự động tạo cấu trúc thư mục JSON chuẩn, tệp mô tả phiên bản dữ liệu và các tệp chỉ mục rỗng hợp lệ mà không cần dịch vụ cơ sở dữ liệu ngoài.
2. **Given** hai thao tác đồng thời cần cập nhật cùng một nhóm bản ghi JSON, **When** cả hai yêu cầu được gửi cùng thời điểm, **Then** hệ thống tuần tự hóa an toàn không gây khóa chết (deadlock), tăng số phiên bản bản ghi chính xác và giữ toàn vẹn checksum.
3. **Given** một giao dịch đa tệp vừa ghi xong nhật ký ghi trước ở trạng thái chuẩn bị thì tiến trình bị dừng đột ngột, **When** máy chủ khởi động lại, **Then** bộ khôi phục tự động hoàn tất đồng bộ các tệp đích, xóa tệp tạm dang dở và chỉ mở nhận kết nối sau khi dữ liệu nhất quán 100%.

---

### User Story 2 - Nạp Danh mục Nội dung Trò chơi Chuẩn từ Nguồn Duy nhất (Priority: P1)

Với tư cách là nhà thiết kế game và lập trình viên, tôi muốn hệ thống tự động nạp và kiểm tra chéo toàn bộ 12 tệp danh mục nội dung trò chơi ngay khi khởi động để ngăn chặn mọi sai lệch chỉ số, mã định danh bị gãy hoặc cấu hình xác suất sai lọt vào môi trường chạy thật.

**Why this priority**: Nguyên tắc III của Hiến pháp quy định `game-data/*.json` là nguồn chân lý duy nhất; mọi tính năng gameplay phụ thuộc trực tiếp vào lớp nạp dữ liệu này.

**Independent Test**: Có thể kiểm thử độc lập bằng cách cho bộ nạp đọc bộ 12 tệp catalog hợp lệ (khởi động thành công) và thử tiêm 1 tệp bị lỗi cú pháp hoặc sai tham chiếu ID (hệ thống từ chối khởi động ngay lập tức và báo rõ tệp, trường và dòng lỗi).

**Acceptance Scenarios**:

1. **Given** đầy đủ 12 tệp catalog hợp lệ trong thư mục dữ liệu trò chơi, **When** máy chủ khởi động, **Then** toàn bộ danh mục được nạp vào bộ nhớ chỉ đọc, sinh mã kiểm tra phiên bản (manifest hash) để client đồng bộ bộ đệm.
2. **Given** một tệp catalog chứa mã vật phẩm không tồn tại trong bảng vật phẩm gốc hoặc tổng tỷ lệ xác suất banner khác `1.0`, **When** máy chủ khởi động, **Then** hệ thống dừng khởi động ngay (fail-fast) và xuất báo cáo lỗi chỉ rõ định danh bị sai.

---

### User Story 3 - Khung Vòng lặp Mô phỏng Thời gian thực & Màn hình Trình diễn Pixel-Perfect (Priority: P2)

Với tư cách là người chơi, tôi muốn trò chơi mở lên hiển thị khung cảnh pixel sắc nét không bị mờ trên màn hình máy tính, kết nối mượt với máy chủ mô phỏng thời gian thực và vẫn giữ giao diện phản hồi ổn định khi kết nối tạm gián đoạn.

**Why this priority**: Thiết lập bộ khung vận hành tách biệt vòng lặp mô phỏng máy chủ (20 Hz), khung hiển thị pixel (60 FPS) và lớp giao diện (UI) làm nền cho mọi feature di chuyển, chiến đấu và UI phía sau.

**Independent Test**: Khởi chạy máy chủ và giao diện client tối giản trên máy cục bộ; xác nhận vòng lặp mô phỏng chạy ổn định, client hiển thị khung pixel không mờ ở cả `1280x720` và `1920x1080`, giao diện overlay không bị re-render theo từng khung hình thế giới, và trạng thái sức khỏe hệ thống trả về hợp lệ.

**Acceptance Scenarios**:

1. **Given** máy chủ đang chạy vòng lặp mô phỏng thời gian thực, **When** một trạng thái tạm thời thay đổi 20 lần mỗi giây, **Then** hệ thống không ghi tệp JSON xuống ổ đĩa theo từng chu kỳ mô phỏng mà chỉ đánh dấu cần lưu theo chu kỳ nền định kỳ hoặc khi tắt an toàn.
2. **Given** người chơi mở trò chơi ở độ phân giải `1280x720` hoặc `1920x1080`, **When** màn hình khung nền pixel được dựng lên, **Then** hình ảnh giữ nguyên sắc nét từng điểm ảnh theo tỷ lệ nguyên hợp lý và lớp giao diện hiển thị nổi phía trên không bị nhòe.

---

### Edge Cases

- Tệp JSON dữ liệu người chơi bị sửa tay trái phép dẫn đến sai checksum: hệ thống từ chối nạp bản ghi hỏng, ghi sự kiện kiểm toán mức nghiêm trọng, KHÔNG ghi đè mù lên tệp lỗi và giữ nguyên bản sao lưu gần nhất để quản trị viên phục hồi.
- Ổ đĩa cục bộ đầy hoặc mất quyền ghi khi thực hiện giao dịch WAL: hệ thống từ chối giao dịch an toàn, hoàn trả mã lỗi tạm ngừng ghi và chuyển sang chế độ chỉ đọc bảo vệ dữ liệu hiện có.
- Khóa yêu cầu giao dịch bị treo quá thời gian chờ (`3000 ms`): hệ thống hủy yêu cầu đến sau với mã lỗi tạm thời rõ ràng để người dùng thử lại mà không làm treo toàn bộ máy chủ.
- Chuỗi định danh truy vấn chứa ký tự duyệt thư mục (`../`, `\`, ký tự rỗng): hệ thống từ chối tuyệt đối trước khi chạm hệ thống tệp và ghi nhật ký bảo mật.
- Tín hiệu tắt máy chủ (`SIGINT` / `SIGTERM`) đến giữa lúc còn dữ liệu đánh dấu chưa lưu: hệ thống ngừng nhận kết nối mới, hoàn tất chu kỳ mô phỏng đang chạy, lưu hết dữ liệu tồn đọng rồi mới thoát.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI khởi tạo cấu trúc không gian làm việc chia tách rõ phần giao diện người chơi, máy chủ trò chơi, hợp đồng dùng chung, bộ đọc cấu hình và thư mục dữ liệu cục bộ.
- **FR-002**: Hệ thống PHẢI cung cấp động cơ lưu trữ bền vững 100% bằng tệp JSON cục bộ phân mảnh theo thực thể chính (aggregate), kèm vỏ chuẩn chứa phiên bản schema, số phiên bản tăng đơn điệu, dấu thời gian UTC và mã kiểm tra toàn vẹn (checksum).
- **FR-003**: Hệ thống PHẢI thực thi ghi đơn tệp nguyên tử (ghi tệp tạm, ép đồng bộ đĩa, đổi tên nguyên tử) và giao dịch đa tệp qua nhật ký ghi trước bằng JSON (WAL) kèm quy trình tự động phục hồi sau sự cố khi khởi động.
- **FR-004**: Hệ thống PHẢI điều phối truy cập đồng thời bằng khóa bất đồng bộ theo khóa thực thể có sắp xếp thứ tự khóa cố định để loại trừ khóa chết (deadlock), và hỗ trợ kiểm tra khóa chống thực thi lặp (`idempotencyKey`) trong tối thiểu 24 giờ.
- **FR-005**: Hệ thống PHẢI duy trì các tệp chỉ mục phụ bằng JSON phục vụ tra cứu nhanh và tự động tái tạo chỉ mục từ dữ liệu gốc nếu phát hiện lệch đồng bộ khi khởi động.
- **FR-006**: Hệ thống PHẢI cung cấp dịch vụ sao lưu cục bộ xoay vòng theo chu kỳ mặc định 6 giờ và trước mọi nâng cấp phiên bản schema, lưu hoàn toàn trên ổ đĩa cục bộ không dùng dịch vụ đám mây.
- **FR-007**: Hệ thống PHẢI nạp toàn bộ 12 tệp danh mục trò chơi (`game-data/*.json`) khi khởi động, kiểm chứng lược đồ và toàn vẹn tham chiếu chéo, dừng khởi động ngay nếu phát hiện lỗi và cung cấp điểm truy cập đọc danh mục kèm mã băm phiên bản cho client.
- **FR-008**: Hệ thống PHẢI vận hành vòng lặp mô phỏng máy chủ chu kỳ cố định mục tiêu 20 Hz với cơ chế chống trượt thời gian (drift clamp), tách biệt hoàn toàn với chu kỳ lưu dữ liệu nền định kỳ (30 giây cho trạng thái đánh dấu thay đổi) và không bao giờ ghi đĩa trực tiếp bên trong chu kỳ mô phỏng.
- **FR-009**: Hệ thống PHẢI cung cấp vỏ giao diện client dựng hình pixel sắc nét theo độ phân giải logic `640x360`, tách biệt trạng thái khung hình cao tần của thế giới khỏi lớp quản lý trạng thái giao diện UI thông qua cầu nối sự kiện có kiểu chặt.
- **FR-010**: Hệ thống PHẢI phục vụ toàn bộ tài nguyên tĩnh (hình ảnh, bản đồ, âm thanh, phông chữ) hoàn toàn từ máy chủ cục bộ và cung cấp điểm kiểm tra sức khỏe dịch vụ cùng quy trình tắt máy chủ an toàn không mất dữ liệu.

### Key Entities *(include if feature involves data)*

- **JsonEnvelope**: Lớp bọc chuẩn cho mọi bản ghi JSON bền vững gồm phiên bản lược đồ, loại thực thể, mã thực thể, số phiên bản tăng dần, thời điểm cập nhật máy chủ và mã băm toàn vẹn dữ liệu.
- **WalTransaction**: Bản ghi nhật ký giao dịch đa tệp gồm mã giao dịch, khóa chống trùng lặp, trạng thái chuẩn bị/hoàn tất, danh sách thao tác tệp đích kèm phiên bản trước và dữ liệu sau.
- **SchemaManifest**: Tệp siêu dữ liệu quản lý phiên bản hiện hành của cơ sở dữ liệu JSON cục bộ và lịch sử các đợt chuyển đổi lược đồ.
- **BackupManifest**: Tệp mô tả một bản chụp sao lưu cục bộ gồm dấu thời gian, số lượng tệp, tổng dung lượng và mã băm kiểm chứng.
- **CatalogBundle**: Tập hợp chỉ đọc của 12 tệp nội dung trò chơi trong bộ nhớ kèm mã phiên bản tổng thể.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Hệ thống khởi động hoàn chỉnh trên máy mới chỉ cần môi trường chạy chuẩn mà không cần cài bất kỳ hệ quản trị cơ sở dữ liệu hay dịch vụ bên thứ ba nào (`0` phụ thuộc ngoài).
- **SC-002**: Trong 100 lượt kiểm thử mô phỏng ngắt tiến trình đột ngột giữa giao dịch đa tệp, tỷ lệ phục hồi nhất quán toàn vẹn dữ liệu đạt `100%` (`0` tệp JSON hỏng, `0` bản ghi mất đồng bộ).
- **SC-003**: Trong 50 thao tác đồng thời vào cùng tập thực thể, tỷ lệ phát sinh khóa chết là `0%` và mọi yêu cầu trùng `idempotencyKey` đều chỉ thực thi đúng `1` lần.
- **SC-004**: Toàn bộ 12 tệp danh mục trò chơi được kiểm chứng cú pháp và tham chiếu chéo trong vòng `< 2 giây` khi khởi động; mọi lỗi sai tham chiếu được phát hiện `100%` trước khi máy chủ nhận kết nối.
- **SC-005**: Vòng lặp mô phỏng giữ chu kỳ ổn định (mục tiêu `20 Hz`, thời gian xử lý p99 `< 25 ms` — `proposed/unverified`) và giao diện dựng hình pixel hiển thị sắc nét không mờ trên cả `1280x720` và `1920x1080` (mục tiêu `60 FPS` — `proposed/unverified`).

## Assumptions

- Môi trường chạy chuẩn của máy chủ là máy tính cá nhân hoặc máy chủ độc lập có ổ đĩa SSD/NVMe cục bộ và quyền đọc/ghi trên thư mục `data/`.
- Quy mô giai đoạn MVP vận hành trên một nút máy chủ duy nhất (single-node modular monolith); mở rộng đa nút chỉ được đánh giá sau kết quả kiểm thử tải ở các cột mốc sau.
- Các mục tiêu hiệu năng (`20 Hz`, `60 FPS`, độ trễ ghi `fsync`) là giá trị thiết kế đề xuất (`proposed / unverified`) và sẽ được đo thực tế khi triển khai bộ kiểm thử hiệu năng.
