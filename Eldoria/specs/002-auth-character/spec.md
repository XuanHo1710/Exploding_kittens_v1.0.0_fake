# Feature Specification: Self-Hosted Local Authentication & Character Management

**Feature Branch**: `002-auth-character`

**Created**: 2026-11-19

**Status**: Reviewed (Autonomous Design Baseline — Chờ phê duyệt chuyển sang Implementation)

**Input**: User description: "Self-hosted local authentication with scrypt and JWT sessions plus character creation and hero roster management"

## Clarifications

### Session 2026-11-19 *(Autonomous Design Decisions — Proposed)*

- Q: Số lượng nhân vật tối đa mỗi tài khoản được tạo là bao nhiêu? → A: Tối đa **4 nhân vật** trên mỗi tài khoản để người chơi trải nghiệm đủ 3 starter hero và 1 slot dự phòng mà không tạo rác dữ liệu JSON *(Proposed Decision)*.
- Q: Người chơi có được đổi hero đang điều khiển (`switch-hero`) khi đang ở giữa trận Boss hoặc ngoài rừng không? → A: Không — chỉ cho phép đổi hero trong `unlockedHeroIds` khi ở Safe Zone (`reg_greenhaven_village` hoặc Homestead) và không ở trạng thái chiến đấu *(Proposed Decision)*.
- Q: Chính sách khóa tài khoản khi đăng nhập sai nhiều lần là gì? → A: Giới hạn 5 lượt/phút theo IP và tự động khóa tạm 15 phút sau 8 lần nhập sai mật khẩu liên tiếp *(Proposed Decision)*.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Đăng ký, Đăng nhập & Duy trì Phiên Cục bộ An toàn (Priority: P1)

Với tư cách là người chơi mới hoặc quay lại, tôi muốn tạo tài khoản, đăng nhập và duy trì phiên an toàn hoàn toàn trên máy chủ nội bộ (không cần tài khoản Google/Facebook hay dịch vụ xác thực bên thứ ba) để bảo vệ tiến trình lâu dài của mình.

**Why this priority**: Không có xác thực và danh tính tài khoản đáng tin cậy thì mọi dữ liệu nhân vật, kho đồ và multiplayer đều không có chủ sở hữu.

**Independent Test**: Có thể kiểm thử độc lập bằng cách đăng ký tài khoản mới, đăng nhập thành công, làm mới phiên tự động (token rotation), kiểm tra chặn brute-force sau 8 lần sai và đăng xuất thu hồi phiên trên tệp JSON cục bộ.

**Acceptance Scenarios**:

1. **Given** người chơi nhập tên đăng nhập, email duy nhất và mật khẩu đạt tối thiểu 10 ký tự, **When** gửi yêu cầu đăng ký, **Then** tài khoản được lưu với mật khẩu đã băm một chiều an toàn, chỉ mục duy nhất được cập nhật và phiên đăng nhập đầu tiên được cấp hợp lệ.
2. **Given** người chơi đăng nhập đúng thông tin, **When** mã truy cập ngắn hạn hết hạn sau 15 phút, **Then** hệ thống tự làm mới phiên bằng cơ chế xoay vòng mã phiên mới và vô hiệu hóa mã cũ.
3. **Given** kẻ tấn công sử dụng lại một mã làm mới đã bị xoay vòng, **When** yêu cầu làm mới được gửi đến máy chủ, **Then** hệ thống từ chối ngay, thu hồi toàn bộ phiên đang mở của tài khoản và ghi nhận sự kiện bảo mật.

---

### User Story 2 - Tạo Nhân vật Khởi đầu (Starter Hero Selection) & Chọn Nhân vật (Priority: P1)

Với tư cách là người chơi đã đăng nhập, tôi muốn chọn 1 trong 3 nhân vật khởi đầu miễn phí của MVP (`Kael Ironbound`, `Lyra Galeweaver`, hoặc `Seraphina Solis`), đặt tên nhân vật duy nhất và bước ngay vào `Greenhaven Village` với căn nhà gỗ và trang bị cơ bản sẵn sàng.

**Why this priority**: Đây là cầu nối bắt buộc từ màn hình đăng nhập sang trải nghiệm 5 phút đầu tiên trong thế giới game.

**Independent Test**: Tạo nhân vật mới chọn `chr_kael_vanguard`, xác nhận khởi tạo nguyên tử đủ hồ sơ nhân vật, túi đồ có vũ khí khởi đầu + hạt giống cơ bản, căn nhà cấp 1 và xuất hiện đúng tọa độ an toàn tại làng; thử tạo nhân vật thứ 5 bị từ chối đúng giới hạn 4 nhân vật.

**Acceptance Scenarios**:

1. **Given** tài khoản có dưới 4 nhân vật và tên nhân vật mới hợp lệ chưa ai sử dụng, **When** người chơi chọn 1 trong 3 starter hero và xác nhận tạo, **Then** hệ thống tạo đồng thời hồ sơ nhân vật, túi đồ khởi đầu và lãnh địa nhà gỗ cấp 1 trong một giao dịch nguyên tử.
2. **Given** người chơi đã có từ 1 đến 4 nhân vật, **When** mở màn hình chọn nhân vật, **Then** hiển thị đầy đủ danh sách nhân vật kèm tên, lớp nhân vật, cấp độ, vùng đang đứng và nút vào game.

---

### User Story 3 - Phân bổ Thuộc tính, Nâng cấp Kỹ năng & Đổi Hero Sưu tầm (Priority: P2)

Với tư cách là người chơi đang phát triển nhân vật, tôi muốn phân bổ điểm thuộc tính tự do (`STR`, `AGI`, `INT`, `VIT`, `DEX`, `LUK`), nâng cấp bậc kỹ năng bằng điểm kỹ năng và chuyển đổi sang hero khác trong bộ sưu tập đã mở khóa khi ở vùng an toàn.

**Why this priority**: Hoàn thiện vòng phát triển cá nhân hóa sức mạnh và tận dụng bộ sưu tập 12 nhân vật từ gameplay & Gacha.

**Independent Test**: Phân bổ 5 điểm thuộc tính vào `STR`/`VIT`, kiểm chứng máy chủ tính lại toàn bộ chỉ số tổng hợp và `Combat Rating`; nâng bậc kỹ năng hợp lệ; đổi hero thành công ở Safe Zone và bị từ chối khi đang trong combat.

**Acceptance Scenarios**:

1. **Given** nhân vật còn 5 điểm thuộc tính chưa dùng, **When** phân bổ +3 `STR` và +2 `VIT`, **Then** hệ thống trừ đúng 5 điểm tự do, tính lại `MaxHP`, `TotalATK`, `TotalDEF`, `CombatRating` trên máy chủ và lưu bền vững.
2. **Given** nhân vật đã mở khóa từ 2 hero trở lên và đang đứng trong vùng an toàn ngoài chiến đấu, **When** chọn chuyển sang hero khác, **Then** hero hoạt động đổi thành công và thanh kỹ năng/chỉ số cập nhật đồng bộ theo hero mới.

---

### Edge Cases

- Trùng tên đăng nhập, email hoặc tên nhân vật chỉ khác chữ hoa/thường (ví dụ `Kael` và `kael`): hệ thống chuẩn hóa chữ thường trước khi kiểm tra chỉ mục duy nhất và từ chối đăng ký trùng.
- Tài khoản đang ở trạng thái bị khóa (`SUSPENDED` hoặc `BANNED`): mọi yêu cầu đăng nhập, làm mới phiên hoặc kết nối WebSocket đều bị từ chối kèm lý do và thời hạn khóa nếu tạm thời.
- Tài khoản đăng nhập nhân vật thứ hai từ một thiết bị/tab khác trong khi nhân vật đang online: phiên mới hợp lệ gửi tín hiệu thay thế phiên cũ, lưu trạng thái cũ an toàn rồi mới cho phiên mới vào thế giới.
- Gửi giá trị phân bổ thuộc tính âm hoặc vượt quá `attributePointsFree`: hệ thống bác bỏ hoàn toàn yêu cầu và giữ nguyên điểm.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI cho phép người chơi đăng ký tài khoản cục bộ bằng `username`, `email` duy nhất (không phân biệt hoa thường) và mật khẩu tối thiểu 10 ký tự (tối đa 128 ký tự), lưu mật khẩu băm một chiều với muối ngẫu nhiên riêng biệt trong tệp JSON cục bộ.
- **FR-002**: Hệ thống PHẢI xác thực đăng nhập bằng so sánh mật khẩu hằng thời gian, áp dụng giới hạn tốc độ 5 lượt/phút/IP và tự động khóa tạm 15 phút sau 8 lần nhập sai liên tiếp.
- **FR-003**: Hệ thống PHẢI phát hành mã truy cập ngắn hạn (15 phút) kèm mã làm mới lưu bản băm trong tệp phiên JSON; PHẢI xoay vòng mã làm mới ở mỗi lượt làm mới và thu hồi toàn bộ phiên tài khoản nếu phát hiện tái sử dụng mã cũ.
- **FR-004**: Hệ thống PHẢI áp đặt kiểm soát quyền sở hữu ở mọi thao tác nhân vật, đảm bảo người chơi chỉ được xem hoặc thay đổi nhân vật thuộc chính tài khoản của mình và chỉ duy trì một phiên chơi hoạt động duy nhất cho mỗi nhân vật.
- **FR-005**: Hệ thống PHẢI cho phép mỗi tài khoản tạo tối đa 4 nhân vật với tên duy nhất (3–20 ký tự), chọn từ 3 starter hero MVP (`chr_kael_vanguard`, `chr_lyra_windrunner`, `chr_seraphina_dawn`), và khởi tạo nguyên tử đồng thời hồ sơ nhân vật, kho đồ khởi đầu và lãnh địa nhà gỗ cấp 1.
- **FR-006**: Hệ thống PHẢI tính lại toàn bộ chỉ số tổng hợp (`MaxHP`, `MaxMP`, `MaxStamina`, `TotalATK`, `TotalDEF`, `CritRate`, `CritDamage`, `AttackSpeed`, `CDR`, `MoveSpeed`, `CombatRating`) 100% tại máy chủ theo công thức chuẩn và áp đặt đầy đủ các trần cứng cân bằng.
- **FR-007**: Hệ thống PHẢI cho phép phân bổ điểm thuộc tính tự do, tẩy điểm (respec) có thu phí Gold hợp lý, nâng bậc kỹ năng bằng điểm kỹ năng và chuyển đổi `activeHeroId` trong `unlockedHeroIds` khi ở vùng an toàn ngoài chiến đấu.
- **FR-008**: Hệ thống PHẢI ghi nhận nhật ký kiểm toán bảo mật cho mọi sự kiện đăng nhập thất bại liên tiếp, khóa tạm tài khoản, phát hiện tái sử dụng phiên và vi phạm quyền sở hữu.

### Key Entities *(include if feature involves data)*

- **Account**: Tài khoản người chơi chứa định danh, tên đăng nhập, email, chuỗi băm mật khẩu, vai trò, trạng thái khóa, bộ đếm đăng nhập sai và danh sách nhân vật.
- **Session**: Phiên đăng nhập lưu bản băm mã làm mới, thời điểm hết hạn, trạng thái thu hồi và siêu dữ liệu thiết bị/IP.
- **Character**: Hồ sơ nhân vật gồm tên duy nhất, hero đang kích hoạt, danh sách hero sở hữu, cấp độ, kinh nghiệm, bậc đột phá, thuộc tính đã phân bổ, kỹ năng, tiền tệ và chỉ số sức mạnh tổng hợp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Người chơi mới hoàn tất đăng ký tài khoản, tạo nhân vật khởi đầu và xuất hiện tại `Greenhaven Village` trong dưới `90 giây`.
- **SC-002**: `100%` nỗ lực truy cập nhân vật của tài khoản khác, tái sử dụng mã làm mới đã xoay vòng hoặc gửi điểm thuộc tính âm đều bị chặn đứng tại máy chủ và ghi nhật ký bảo mật.
- **SC-003**: Tạo nhân vật mới đảm bảo tính nguyên tử `100%`: không bao giờ tồn tại nhân vật mồ côi thiếu tệp kho đồ hoặc thiếu tệp lãnh địa ngay cả khi máy chủ tắt đột ngột.
- **SC-004**: `100%` chỉ số tổng hợp và `CombatRating` trả về khớp tuyệt đối với công thức chuẩn trong bảng cân bằng, không vượt trần cứng ở bất kỳ tổ hợp phân bổ nào.

## Assumptions

- Phiên bản MVP không gửi email xác minh qua dịch vụ SMTP bên thứ ba (để tuân thủ Zero Third-Party Services); khôi phục tài khoản do quản trị viên xử lý hoặc mã khôi phục một lần cục bộ sinh lúc đăng ký.
- Xóa nhân vật trong MVP là đánh dấu lưu trữ mềm (`soft-delete` / khóa tên 7 ngày) hoặc xác nhận gõ lại tên nhân vật để tránh mất nhầm dữ liệu.
