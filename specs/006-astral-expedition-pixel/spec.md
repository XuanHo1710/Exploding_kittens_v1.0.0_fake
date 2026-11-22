# Feature Specification: Astral Expedition Pixel — Game 2D Pixel Turn-Based Gacha Phong Cách Expedition 33

**Feature Branch**: `006-astral-expedition-pixel`

**Created**: 2026-11-21

**Status**: Draft

**Input**: User description: "Thiết kế và lập kế hoạch làm game 2D Pixel Turn-Based Gacha lấy cảm hứng từ Expedition 33: giao diện chọn kỹ năng đánh dạng dọc, thiết kế nhân vật + bộ kỹ năng chiến đấu + dàn trùm ngầu lòi, bản đồ pixel khám phá thế giới gồm Đồng cỏ, Tuyết, Sa mạc, Dưới nước, Núi lửa, Ban đêm và cuối cùng là Quang phổ mây trời ban đêm để đánh trùm cuối, thả quái gác cổng trên mỗi map khi người chơi đi qua; chỉnh sửa lại toàn bộ bộ quy trình tạo tài nguyên pixel kế thừa cho khớp bài toán nghiệp vụ; cho phép dùng các công cụ phụ trợ bên ngoài miễn là miễn phí và chạy cục bộ bằng container."

## Clarifications

### Session 2026-11-21

- Q: Hành trình khám phá thế giới gồm 7 bản đồ riêng biệt nối tiếp nhau hay gồm 5 bản đồ địa hình có trạng thái ban đêm cộng với 1 đấu trường Trùm Cuối? (FR-001) → A: 7 bản đồ độc lập nối tiếp nhau theo thứ tự (1) Đồng Cỏ → (2) Tuyết → (3) Sa Mạc → (4) Dưới Nước → (5) Núi Lửa → (6) Vùng Ban Đêm → (7) Quang Phổ Mây Trời Ban Đêm (đấu trường Trùm Cuối).
- Q: Trong trận đấu theo lượt, thao tác bấm phím đúng nhịp thời gian thực sẽ áp dụng cho cả lúc người chơi tung chiêu lẫn lúc kẻ địch tấn công, hay chỉ áp dụng Né/Đỡ khi kẻ địch ra đòn? (FR-009) → A: Chủ động 2 chiều chuẩn Expedition 33 — vừa có vòng bấm nhịp chuẩn (Timed Hit) để cường hóa chiêu thức khi tấn công, vừa có Né (Dodge) và Đỡ Phản Đòn (Parry) khi kẻ địch/trùm ra đòn.
- Q: Phiên bản hoàn chỉnh đầu tiên sẽ bao gồm bao nhiêu Anh Hùng có thể sưu tầm qua Gacha và chia thành mấy bậc độ hiếm kèm mốc bảo hiểm (Pity)? (FR-011) → A: 12 Anh Hùng chia thành 3 bậc độ hiếm (R / SR / SSR) với mốc bảo hiểm cứng (Hard Pity) 80 lượt triệu hồi (trong đó cấp sẵn đội hình 3 Anh Hùng khởi đầu cho người chơi mới).
- Q: Khi chỉnh sửa 11 bộ quy trình tạo tài nguyên kế thừa cho khớp bài toán mới, bạn muốn đổi luôn tên các bộ quy trình sang tên nghiệp vụ mới hay giữ nguyên tên thư mục cũ và chỉ sửa nội dung bên trong? (FR-019) → A: Đổi tên đồng bộ toàn bộ 11 bộ quy trình, mẫu câu lệnh sinh ảnh, công cụ liên quan và bảng thuật ngữ sang tên miền nghiệp vụ mới (xóa hẳn tên bắt thú cũ) kèm cập nhật 100% đường dẫn liên kết nội bộ.
- Q: Người chơi sẽ truy cập và trải nghiệm chiến dịch 7 bản đồ theo hình thức chơi đơn tích hợp trên sảnh chung hiện có, hay đi chung bản đồ trực tuyến nhiều người nhìn thấy nhau, hay tách thành một trang trò chơi riêng biệt? (FR-020) → A: Chiến dịch 1 người chơi tích hợp ngay trên sảnh chọn chế độ chơi hiện có, tự khám phá 7 bản đồ bằng đội hình 3 Anh Hùng của riêng mình và lưu bền vững hồ sơ tiến trình/Gacha trên máy chủ theo tài khoản.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Chiến Đấu Theo Lượt Phong Cách Expedition Với Menu Kỹ Năng Dọc & Phản Xạ Né/Đỡ (Priority: P1)

Người chơi điều khiển đội hình tối đa 3 Anh Hùng bước vào màn hình trận đấu 2D pixel tách biệt có góc nhìn chéo đối kháng (đội người chơi đứng phía dưới-trái nhìn lên, kẻ địch/trùm đứng phía trên-phải nhìn xuống). Khi tới lượt nhân vật, người chơi chọn hành động từ **danh sách kỹ năng xếp dọc** giống phong cách *Expedition 33*, quản lý Điểm Hành Động (AP), kết hợp kỹ năng phá giáp/phá thế (Break), và chủ động bấm **Né (Dodge)** hoặc **Đỡ Phản Đòn (Parry)** đúng nhịp khi kẻ địch tung chiêu.

**Why this priority**: Đây là linh hồn gameplay tạo nên sự khác biệt của trò chơi — nếu vòng lặp chiến đấu theo lượt dọc + phản xạ Né/Đỡ chưa cuốn hút và mượt mà thì toàn bộ hệ thống bản đồ và triệu hồi phía sau sẽ mất giá trị cốt lõi.

**Independent Test**: Có thể kiểm thử độc lập bằng cách khởi chạy trực tiếp một trận đấu mẫu giữa đội hình 3 Anh Hùng và 1 nhóm quái/trùm thử nghiệm, thực hiện đầy đủ chọn kỹ năng trên menu dọc, tích/tiêu AP, Né, Đỡ Phản Đòn, làm đầy thanh Phá Thế (Break) và kết thúc trận đấu nhận thưởng.

**Acceptance Scenarios**:

1. **Given** trận đấu theo lượt bắt đầu và tới lượt một Anh Hùng của người chơi, **When** giao diện lệnh mở ra, **Then** danh sách kỹ năng của nhân vật hiển thị theo **trục dọc** rõ ràng (tên kỹ năng tiếng Việt, chi phí AP, nguyên tố/vai trò, mô tả ngắn gọn) cùng thanh thứ tự lượt (Turn Timeline) mà không che khuất nhân vật hay kẻ địch.
2. **Given** Anh Hùng đang có `0` AP khi tới lượt, **When** người chơi chọn Đánh Thường ở đầu danh sách dọc, **Then** nhân vật thực hiện đòn tấn công không tốn AP và hồi lại lượng AP quy định để các lượt kế tiếp tung được kỹ năng chủ động.
3. **Given** kẻ địch hoặc trùm thực hiện hoạt ảnh báo đòn và lao tới tấn công, **When** người chơi nhấn phím/nút **Né** trong khung thời gian cho phép hoặc **Đỡ** trong khung thời gian chuẩn xác hẹp hơn, **Then** nhân vật thực hiện hoạt ảnh né tránh sát thương (với Né) hoặc hóa giải đòn đánh kèm đòn phản kích và cộng thêm AP/điểm Phá Thế (với Đỡ Phản Đòn).
4. **Given** thanh Phá Thế (Break Gauge) của kẻ địch đã tích đầy sau các đòn đánh đúng điểm yếu/phản đòn, **When** người chơi tung kỹ năng có thuộc tính Kích Nổ Phá Thế, **Then** kẻ địch rơi vào trạng thái Choáng (Staggered), bị mất lượt hành động kế tiếp và nhận sát thương khuếch đại rõ rệt.

---

### User Story 2 - Khám Phá Thế Giới 2D Pixel Qua 7 Vùng Đất & Vượt Quái Gác Cổng (Priority: P1)

Người chơi điều khiển nhân vật đại diện đội thám hiểm đi khám phá thế giới 2D pixel qua chuỗi **7 vùng bản đồ chủ đề** nối tiếp nhau: **Đồng Cỏ** → **Tuyết** → **Sa Mạc** → **Dưới Nước** → **Núi Lửa** → **Vùng Ban Đêm** → **Quang Phổ Mây Trời Ban Đêm**. Trên mỗi bản đồ đều có các **Quái Gác Cổng (Gatekeeper Monsters)** hiện diện trực tiếp tại các cây cầu, hẻm núi, phế tích hoặc cổng chuyển vùng; khi người chơi tiến vào tầm canh gác, Quái Gác Cổng lập tức chặn đường và kéo đội hình vào trận đấu theo lượt trên nền cảnh chiến đấu đúng địa hình đó.

**Why this priority**: Kết nối trực tiếp trải nghiệm phiêu lưu khám phá thế giới pixel với hệ thống chiến đấu theo lượt, tạo cảm giác chinh phục từng vùng đất rõ ràng đúng yêu cầu trọng tâm của người dùng.

**Independent Test**: Có thể kiểm thử độc lập bằng cách cho nhân vật di chuyển từ điểm xuất phát của một vùng bản đồ tới lối sang vùng tiếp theo, xác nhận Quái Gác Cổng chặn đường khi đi ngang qua, thắng trận để mở thông chốt gác và bước qua cổng chuyển sang vùng bản đồ kế tiếp.

**Acceptance Scenarios**:

1. **Given** người chơi đang khám phá một trong các vùng bản đồ (Đồng cỏ, Tuyết, Sa mạc, Dưới nước, Núi lửa, Ban đêm), **When** nhân vật đi vào vùng phát hiện hoặc chạm trán một Quái Gác Cổng đang canh giữ lối đi chính, **Then** nhân vật dừng lại, hiển thị tín hiệu chạm trán và chuyển mượt sang màn hình trận đấu có phông nền khớp đúng chủ đề vùng bản đồ hiện tại.
2. **Given** người chơi vừa đánh bại một Quái Gác Cổng đang chặn lối qua cổng vùng đất, **When** màn hình quay trở lại bản đồ khám phá, **Then** chốt chặn của Quái Gác Cổng đó được mở thông, trạng thái đã hạ gục được lưu giữ và người chơi đi qua được sang khu vực tiếp theo.
3. **Given** người chơi thất bại trong trận đấu với Quái Gác Cổng, **When** chọn hồi sinh/thử lại, **Then** đội hình được đưa về trạm nghỉ an toàn gần nhất trên bản đồ hiện tại với đầy đủ sinh lực mà không bị kẹt lặp vô hạn ngay trong vùng kích hoạt của quái.

---

### User Story 3 - Chinh Phục Trùm Khu Vực & Trùm Cuối Quang Phổ Mây Trời Ban Đêm (Priority: P2)

Tại điểm kết của mỗi vùng hành trình và đặc biệt tại vùng cuối **Quang Phổ Mây Trời Ban Đêm**, người chơi đối đầu với những **Trùm (Boss)** có tạo hình pixel đồ sộ, ngầu và uy áp. Mỗi Trùm sở hữu đấu trường riêng, thanh máu lớn kèm thanh Phá Thế, ít nhất 2–3 giai đoạn (phase) biến đổi chiêu thức/nhịp đòn và tín hiệu báo đòn rõ ràng để người chơi đọc bài, Né/Đỡ và tung chuỗi kỹ năng kết liễu.

**Why this priority**: Các trận đánh Trùm đặc sắc và đỉnh cao tại vùng *Quang Phổ Mây Trời Ban Đêm* là đích đến cảm xúc lớn nhất của toàn bộ cuộc hành trình thám hiểm và nâng cấp đội hình.

**Independent Test**: Có thể kiểm thử độc lập bằng cách vào thẳng đấu trường Trùm (bao gồm đấu trường *Quang Phổ Mây Trời Ban Đêm*), đánh xuyên qua các mốc chuyển phase của Trùm, kiểm tra tín hiệu báo đòn không bị hiệu ứng kỹ năng che khuất và xác nhận phần thưởng chiến thắng cuối cùng.

**Acceptance Scenarios**:

1. **Given** người chơi đã vượt qua các Quái Gác Cổng và tiến vào khu vực cuối của vùng **Quang Phổ Mây Trời Ban Đêm**, **When** kích hoạt trận chiến Trùm Cuối, **Then** màn hình mở ra đấu trường mây trời đêm rực dải quang phổ phân lớp với tạo hình Trùm kích thước lớn, nhạc/hiệu ứng mở màn và bộ chiêu thức riêng biệt.
2. **Given** máu của Trùm giảm xuống dưới ngưỡng chuyển giai đoạn (ví dụ `60%` và `25%`), **When** kết thúc lượt hiện tại, **Then** Trùm kích hoạt chuyển phase với thay đổi thế đứng/hào quang và mở khóa chuỗi đòn đánh đa nhịp mới buộc người chơi điều chỉnh chiến thuật chọn kỹ năng dọc và nhịp Đỡ Phản Đòn.
3. **Given** người chơi sử dụng kỹ năng tối thượng (Ultimate) có hiệu ứng toàn màn hình trong lúc Trùm đang tích tụ đòn sát thương lớn, **When** hiệu ứng kết thúc và tới nhịp Trùm ra đòn, **Then** mọi chỉ báo nguy hiểm và nhịp ra đòn của Trùm vẫn hiển thị rõ ràng, không bị che mờ gây mất công bằng.

---

### User Story 4 - Triệu Hồi Anh Hùng (Gacha), Sắp Xếp Đội Hình & Phát Triển Sức Mạnh (Priority: P2)

Người chơi thu thập ấn thạch/tiền tệ triệu hồi từ việc khám phá 7 vùng đất, hạ Quái Gác Cổng và diệt Trùm để thực hiện **Triệu Hồi (Gacha)** mở khóa các Anh Hùng mới có ngoại hình pixel, nguyên tố, vai trò và bộ kỹ năng dọc đặc trưng. Người chơi tùy biến đội hình 3 người ra trận, nâng cấp cấp độ/bậc thức tỉnh và mở rộng chiến thuật khắc chế cho từng vùng đất.

**Why this priority**: Cung cấp động lực sưu tầm và chiều sâu xây dựng đội hình dài hạn của dòng game Turn-Based Gacha mà vẫn giữ sự công bằng cho người chơi cày cuốc.

**Independent Test**: Có thể kiểm thử độc lập bằng cách mở giao diện Triệu Hồi, kiểm tra bảng công khai tỷ lệ & bộ đếm bảo hiểm (Pity), thực hiện quay 1 lần / 10 lần, nhận Anh Hùng mới hoặc mảnh trùng lặp, đưa Anh Hùng vào đội hình 3 người và mang vào trận đấu thực tế.

**Acceptance Scenarios**:

1. **Given** người chơi sở hữu đủ tiền tệ triệu hồi kiếm được trong quá trình chơi, **When** thực hiện Triệu Hồi 1 lần hoặc 10 lần trên Banner, **Then** hệ thống trình diễn hoạt ảnh mở cầu triệu hồi pixel, cộng nhân vật vào bộ sưu tập (hoặc tự động quy đổi thành mảnh thức tỉnh nếu trùng) và cập nhật chính xác bộ đếm bảo hiểm (Pity).
2. **Given** bộ đếm Pity của người chơi chạm mốc bảo hiểm tối đa của Banner mà chưa nhận được Anh Hùng bậc hiếm cao nhất trong chuỗi trước đó, **When** thực hiện lượt triệu hồi tại mốc bảo hiểm, **Then** kết quả bắt buộc trả về đúng bậc độ hiếm được cam kết công khai trên bảng tỷ lệ.
3. **Given** người chơi mở màn hình Đội Hình tại trạm nghỉ hoặc ngoài giao tranh, **When** thay đổi vị trí 3 Anh Hùng ra trận và nâng cấp kỹ năng, **Then** chỉ số và danh sách kỹ năng dọc trong trận chiến kế tiếp phản ánh tức thì cấu hình mới.

---

### User Story 5 - Chuẩn Hóa Bộ Quy Trình Tạo Tài Nguyên Pixel Art Cho Đúng Nghiệp Vụ Game Mới (Priority: P3)

Đội ngũ thiết kế/phát triển sử dụng bộ quy trình hướng dẫn tạo tài nguyên đồ họa, mẫu câu lệnh sinh ảnh, công cụ chuẩn hóa khung hình và bảng thuật ngữ đã được **chỉnh sửa hoàn toàn** từ ngữ cảnh trò chơi bắt thú cũ sang nghiệp vụ **Thám Hiểm Theo Lượt & Triệu Hồi Anh Hùng** để sản xuất đồng bộ nhân vật, quái gác cổng, trùm, 7 vùng bản đồ, cầu triệu hồi và giao diện kỹ năng dọc.

**Why this priority**: Đảm bảo mọi nhân vật, bản đồ, hiệu ứng chiêu thức và giao diện tạo ra về sau đều tuân thủ đúng một chuẩn mỹ thuật 2D pixel sắc nét và đúng ngôn ngữ thiết kế của dự án mới, tránh lẫn lộn khái niệm từ dự án cũ.

**Independent Test**: Có thể kiểm thử độc lập bằng cách rà soát toàn bộ tài liệu hướng dẫn quy trình, mẫu mô tả tạo ảnh và bảng thuật ngữ của dự án mới, xác nhận 100% mô tả đã chuyển sang thực thể của trò chơi mới và dùng quy trình đó tạo thử 1 mẫu tài nguyên đạt chuẩn kiểm định hình ảnh.

**Acceptance Scenarios**:

1. **Given** người thiết kế mở bất kỳ quy trình tạo tài nguyên nào của dự án (nhân vật, tư thế chiến đấu, hiệu ứng chiêu thức, cảnh chiến đấu, mảnh bản đồ, công trình, bản đồ, giao diện, cầu triệu hồi), **When** đọc phần mô tả kích hoạt, quy ước đầu ra và mẫu câu lệnh sinh ảnh, **Then** toàn bộ thuật ngữ, ví dụ và bố cục đều mô tả đúng Anh Hùng, Quái Gác Cổng, Trùm, 7 Vùng Bản Đồ và Giao Diện Chọn Kỹ Năng Dọc (không còn tham chiếu sai sang bối cảnh bắt thú cũ).
2. **Given** một tài nguyên hình ảnh mới (nhân vật, quái gác cổng, mảnh địa hình hoặc hiệu ứng kỹ năng) được tạo theo bộ quy trình đã cập nhật, **When** đưa qua bước kiểm định chất lượng hình ảnh của dự án, **Then** tài nguyên đạt chuẩn lưới điểm ảnh sắc nét, sạch nền nháp, không vỡ tỷ lệ và khớp ngay vào màn hình bản đồ hoặc màn hình trận đấu.

---

### Edge Cases

- **Thua trận trước Quái Gác Cổng hoặc Trùm**: Đội hình hồi phục tại điểm neo an toàn gần nhất của vùng hiện tại, giữ nguyên kinh nghiệm/vật phẩm đã nhặt trước trận; Quái Gác Cổng hoặc Trùm khôi phục trạng thái ban đầu và lùi khoảng cách an toàn để không tự động kéo người chơi vào lại trận ngay lập tức khi vừa hồi sinh.
- **Mất kết nối hoặc tải lại trang giữa trận đấu / giữa lúc Triệu Hồi**: Mọi lượt Triệu Hồi và phần thưởng hạ Trùm được ghi nhận nguyên tử (không bao giờ trừ tiền tệ triệu hồi mà mất nhân vật); khi đăng nhập lại, tiến trình vùng đất và các Quái Gác Cổng đã hạ được khôi phục nguyên vẹn.
- **Nhân vật cạn sạch AP (`0 AP`) hoặc bị khống chế**: Đánh Thường (`0 AP`) luôn khả dụng khi nhân vật còn quyền hành động để hồi AP, ngăn chặn triệt để tình trạng kẹt lượt không thể bấm lệnh; nếu nhân vật bị Choáng/Đóng Băng thì lượt tự động chuyển mượt sang đơn vị kế tiếp trên thanh thứ tự lượt.
- **Trùng lặp Anh Hùng đã đạt bậc thức tỉnh tối đa**: Khi người chơi triệu hồi trúng một Anh Hùng đã nâng tối đa bậc sao/thức tỉnh, bản sao dư thừa tự động quy đổi sang huy hiệu quy đổi chung để đổi vật phẩm/vé triệu hồi khác, không làm mất giá trị lượt quay.
- **Hiệu ứng kỹ năng lớn trên màn hình kích thước nhỏ / di động xoay ngang**: Menu chọn kỹ năng dọc tự động giữ vùng hiển thị gọn bên cạnh đội hình, còn hiệu ứng chiêu thức tự co giãn theo kích thước mục tiêu để không tràn lấp thanh máu, thanh Phá Thế hoặc báo hiệu đòn đánh của Trùm.
- **Khởi động lại dịch vụ bộ nhớ đệm phụ trợ cục bộ**: Dữ liệu bền vững của người chơi (danh sách Anh Hùng, cấp độ, bộ đếm Pity, bản đồ đã mở, Quái Gác Cổng đã diệt) vẫn bảo toàn 100%, không xảy ra mất mát tiến trình.

## Requirements *(mandatory)*

### Functional Requirements

#### Thế Giới Khám Phá 7 Vùng Đất & Quái Gác Cổng

- **FR-001**: Hệ thống MUST cung cấp hành trình khám phá thế giới 2D pixel gồm đầy đủ **7 vùng bản đồ chủ đề** theo lộ trình tiến triển:
  1. **Đồng Cỏ (Meadow)** — vùng khởi đầu tươi sáng, dẫn nhập cơ chế di chuyển và chiến đấu.
  2. **Tuyết (Snow/Frost)** — vùng băng giá với hẻm núi tuyết và phế tích đóng băng.
  3. **Sa Mạc (Desert)** — vùng cồn cát, ốc đảo và đền đài cổ.
  4. **Dưới Nước (Underwater/Abyss)** — vùng thềm san hô, rãnh sâu và di tích thủy cung.
  5. **Núi Lửa (Volcano)** — vùng nham thạch, cầu đá bazan và lò rèn cổ đại.
  6. **Ban Đêm (Night Realm)** — vùng rừng/thung lũng bóng đêm huyền ảo dẫn lối lên tầng trời.
  7. **Quang Phổ Mây Trời Ban Đêm (Aurora Night-Sky Spectrum)** — thánh địa tầng mây đêm rực dải cực quang/quang phổ dành cho cuộc đụng độ Trùm Cuối.
- **FR-002**: Mỗi vùng bản đồ từ vùng 1 đến vùng 6 MUST bố trí ít nhất 2–4 **Quái Gác Cổng (Gatekeeper Monsters)** hiển thị trực tiếp trên bản đồ tại các nút thắt đường đi hoặc trước cổng chuyển vùng, kèm hành vi đứng canh hoặc tuần tra trong phạm vi xác định.
- **FR-003**: Khi người chơi di chuyển vào vùng canh gác của Quái Gác Cổng chưa bị đánh bại, hệ thống MUST chặn lối đi qua chốt đó và khởi tạo trận đấu theo lượt tương ứng với đội hình quái của chốt gác.
- **FR-004**: Hệ thống MUST lưu giữ trạng thái các Quái Gác Cổng đã bị đánh bại, các điểm neo nghỉ ngơi (Rest Anchors) đã kích hoạt và các cổng vùng đất đã mở khóa để người chơi tự do di chuyển qua lại giữa các vùng đã chinh phục.

#### Chiến Đấu Theo Lượt Dạng Dọc Phong Cách Expedition

- **FR-005**: Màn hình trận đấu MUST tách biệt khỏi màn hình khám phá, sử dụng phông nền 2D pixel phân lớp khớp với vùng đất/đấu trường hiện tại và bố trí góc nhìn chéo đối kháng (đội hình tối đa 3 Anh Hùng của người chơi ở góc dưới-trái, kẻ địch/trùm ở góc trên-phải).
- **FR-006**: Khi tới lượt của một Anh Hùng, giao diện MUST hiển thị **Menu Chọn Kỹ Năng Dạng Dọc (Vertical Skill Menu)** liệt kê theo cột dọc các hành động/kỹ năng của nhân vật đó, hiển thị rõ tên tiếng Việt, chi phí Điểm Hành Động (AP), nhãn nguyên tố/loại đòn, phạm vi mục tiêu và mô tả tóm tắt hiệu ứng khi di chuyển con trỏ chọn.
- **FR-007**: Hệ thống trận đấu MUST hiển thị **Thanh Thứ Tự Lượt (Turn Order Timeline)** tính theo chỉ số Tốc Độ và hiệu ứng tăng/giảm tốc, cho phép người chơi biết chính xác thứ tự hành động của đồng minh và kẻ địch trong các lượt sắp tới.
- **FR-008**: Hệ thống MUST vận hành cơ chế kinh tế **Điểm Hành Động (AP)** kết hợp **Bấm Nhịp Tấn Công (Offensive Timed Hit)** trong trận: mỗi Anh Hùng có Đánh Thường tốn `0 AP` giúp hồi AP, còn các Kỹ Năng Chủ Động / Chiêu Cuối tiêu hao AP và hiển thị vòng nhịp bấm chuẩn ngay trong hoạt ảnh ra đòn để người chơi bấm đúng thời điểm nhằm gia tăng sát thương/hiệu ứng phụ (nếu bấm trượt chiêu thức vẫn gây sát thương cơ bản, không bị hủy đòn).
- **FR-009**: Trong lượt tấn công của kẻ địch hoặc Trùm, hệ thống MUST cung cấp cơ chế phản xạ phòng thủ thời gian thực **Né (Dodge)** và **Đỡ Phản Đòn (Parry/Counter)** với tín hiệu báo đòn trực quan trước nhịp va chạm; Né thành công giúp tránh sát thương, còn Đỡ chuẩn xác giúp triệt tiêu sát thương, hồi thêm AP và giáng đòn phản kích làm tăng mạnh thanh Phá Thế của địch.
- **FR-010**: Mọi Quái Gác Cổng tinh anh và Trùm MUST có **Thanh Phá Thế (Break/Stagger Gauge)**; khi thanh này đầy và bị kích hoạt Phá Thế, mục tiêu rơi vào trạng thái Choáng (mất lượt kế tiếp và chịu thêm sát thương).

#### Hệ Thống Anh Hùng, Kỹ Năng & Dàn Trùm Đa Giai Đoạn

- **FR-011**: Hệ thống MUST cung cấp dàn **12 Anh Hùng (Heroes)** chia theo **3 bậc độ hiếm (`R / SR / SSR`)** có thể sưu tầm và đưa vào đội hình (trong đó cấp sẵn 3 Anh Hùng khởi đầu khi bắt đầu hành trình), phân hóa rõ rệt theo 4 vai trò chiến thuật (Tấn Công Chủ Lực, Phá Thế/Khống Chế, Hỗ Trợ/Hồi Phục, Phản Đòn/Phòng Thủ) và các hệ nguyên tố tương khắc gắn liền với 7 vùng đất.
- **FR-012**: Mỗi Anh Hùng MUST sở hữu bộ kỹ năng riêng hiển thị trên menu dọc gồm: 1 Đánh Thường (`0 AP`), ít nhất 2–3 Kỹ Năng Chủ Động tiêu hao AP, 1 Chiêu Cuối (Ultimate) và 1 Nội Tại (Passive), đi kèm bộ hoạt ảnh chiến đấu đầy đủ (`Thế Thủ/Tấn Công`, `Trúng Đòn`, `Né/Đỡ`, `Gục Ngã`) và hiệu ứng chiêu thức 2 giai đoạn (`Tụ Chiêu` + `Phát Chiêu/Va Chạm`).
- **FR-013**: Mỗi vùng trong 6 bản đồ đầu (Đồng Cỏ, Tuyết, Sa Mạc, Dưới Nước, Núi Lửa, Ban Đêm) MUST có 1 **Trùm Khu Vực (Regional Boss)** riêng canh giữ chặng cuối và bản đồ thứ 7 (**Quang Phổ Mây Trời Ban Đêm**) MUST có **Trùm Cuối (Final Boss)** với kích thước khung hình lớn vượt trội, tạo hình ấn tượng, ít nhất 2–3 giai đoạn chiến đấu (phases) biến đổi hành vi/chiêu thức và quy tắc không để hiệu ứng người chơi che khuất tín hiệu báo đòn của Trùm.
- **FR-014**: Đánh bại Trùm Khu Vực lần đầu MUST mở khóa quyền tiến vào vùng bản đồ kế tiếp và trao phần thưởng đột phá lớn (tiền tệ triệu hồi, nguyên liệu nâng cấp hiếm).

#### Hệ Thống Triệu Hồi (Gacha) & Tiến Trình Công Bằng

- **FR-015**: Hệ thống MUST cung cấp tính năng **Triệu Hồi (Gacha)** hỗ trợ quay đơn (1 lần) và quay cụm (10 lần) cho bể 3 bậc độ hiếm (`R / SR / SSR`), hiển thị công khai bảng tỷ lệ xác suất, lịch sử triệu hồi, bảo hiểm cụm 10 lần tối thiểu bậc `SR` trở lên và mốc **Bảo Hiểm Cứng (Hard Pity) 80 lượt** chắc chắn nhận Anh Hùng bậc `SSR`.
- **FR-016**: Toàn bộ tiền tệ dùng để Triệu Hồi và nâng cấp trong phạm vi mặc định MUST kiếm được thông qua hoạt động chơi thực tế (khám phá rương trên 7 bản đồ, hạ Quái Gác Cổng, vượt Trùm, hoàn thành mốc thành tựu); người chơi hoàn toàn có thể vượt qua Trùm Cuối bằng chiến thuật và đội hình mở khóa từ quá trình chơi.
- **FR-017**: Khi triệu hồi ra Anh Hùng đã sở hữu, hệ thống MUST tự động chuyển đổi bản sao trùng lặp thành nguyên liệu thức tỉnh nhân vật đó (hoặc huy hiệu quy đổi chung khi đã đạt bậc thức tỉnh tối đa) và lưu trữ nguyên tử toàn bộ kết quả.

#### Chuẩn Mỹ Thuật 2D Pixel, Việt Hóa & Chuyển Đổi Bộ Quy Trình Tài Nguyên

- **FR-018**: Toàn bộ hình ảnh trò chơi (bản đồ 7 vùng, công trình, nhân vật khám phá, tư thế chiến đấu góc chéo, cảnh nền trận đấu, hiệu ứng chiêu thức, cầu triệu hồi, khung giao diện chọn kỹ năng dọc) MUST thống nhất một chuẩn đồ họa **2D Pixel Art sắc nét**, tỷ lệ cơ thể chuẩn (không biến dạng chibi sai lệch), sạch nền nháp và hiển thị đầy đủ tiếng Việt có dấu rõ ràng.
- **FR-019**: Toàn bộ 11 bộ quy trình tạo tài nguyên, mẫu câu lệnh sinh ảnh, công cụ chuẩn hóa/kiểm định hình ảnh và từ điển thuật ngữ kế thừa trong dự án MUST được **đổi tên đồng bộ sang tên miền nghiệp vụ mới** (loại bỏ hoàn toàn tên thư mục/tệp gắn với trò chơi bắt thú cũ), biên tập lại toàn bộ mô tả/cấu trúc đầu ra cho khớp **Game 2D Pixel Turn-Based Gacha phong cách Expedition 33** và cập nhật khớp `100%` các liên kết chéo nội bộ.
- **FR-020**: Trò chơi mới MUST tích hợp trực tiếp vào sảnh chọn chế độ chơi hiện có dưới dạng **chiến dịch 1 người chơi có lưu hồ sơ tài khoản và lịch sử Triệu Hồi bền vững trên máy chủ** (không đồng bộ người chơi khác đi chung trên bản đồ ở phiên bản đầu), đồng thời cô lập hoàn toàn không làm thay đổi hay gây lỗi cho bất kỳ chế độ trò chơi nào đang hoạt động sẵn trong cùng dự án.

### Key Entities *(include if feature involves data)*

- **PlayerProfile (Hồ sơ người chơi)**: Lưu định danh người chơi, vùng bản đồ hiện tại, vị trí điểm neo an toàn, danh sách bản đồ và Quái Gác Cổng/Trùm đã vượt qua, kho tiền tệ triệu hồi, nguyên liệu nâng cấp và cấu hình đội hình 3 Anh Hùng ra trận.
- **Hero (Anh hùng thám hiểm)**: Nhân vật có thể sưu tầm và điều khiển trong trận; gồm mã định danh, tên tiếng Việt, bậc độ hiếm, nguyên tố, vai trò, chỉ số chiến đấu (Máu, Tấn Công, Phòng Thủ, Tốc Độ, Tỷ Lệ/Sát Thương Chí Mạng), cấp độ, bậc thức tỉnh và danh sách kỹ năng.
- **CombatSkill (Kỹ năng chiến đấu)**: Hành động hiển thị trên menu chọn kỹ năng dọc; gồm tên tiếng Việt, loại kỹ năng (Đánh Thường / Chủ Động / Chiêu Cuối / Nội Tại), chi phí AP (hoặc lượng AP hồi lại), hệ số sát thương, điểm Phá Thế gây ra, hiệu ứng trạng thái và liên kết tới bộ hiệu ứng hình ảnh (`Tụ Chiêu` + `Va Chạm`).
- **RealmMap (Bản đồ vùng đất)**: Một trong 7 khu vực khám phá pixel (Đồng cỏ, Tuyết, Sa mạc, Dưới nước, Núi lửa, Ban đêm, Quang phổ mây trời ban đêm); chứa bố cục địa hình, vật cản, điểm xuất phát, điểm neo nghỉ ngơi, vị trí rương, danh sách Quái Gác Cổng, cổng chuyển vùng và liên kết tới cảnh nền trận đấu tương ứng.
- **GatekeeperEncounter (Chốt Quái Gác Cổng)**: Thực thể quái canh giữ đặt trên `RealmMap`; gồm vị trí/lộ trình tuần tra, bán kính phát hiện, đội hình quái bên trong, điều kiện chặn đường và phần thưởng khi bị tiêu diệt.
- **BossEncounter (Trùm khu vực & Trùm cuối)**: Thực thể đối đầu đỉnh cao của mỗi vùng và vùng cuối *Quang Phổ Mây Trời Ban Đêm*; gồm tạo hình kích thước lớn, đấu trường riêng, ngưỡng máu chuyển phase, kịch bản kỹ năng/báo đòn theo từng phase, ngưỡng Phá Thế và bảng thưởng đột phá.
- **BattleSession (Phiên chiến đấu theo lượt)**: Trạng thái của một trận giao tranh đang diễn ra; quản lý danh sách đơn vị hai phe, Thanh Thứ Tự Lượt, lượng AP hiện tại, thanh Phá Thế, cửa sổ phản xạ Né/Đỡ Phản Đòn và kết quả thắng/thua.
- **SummonBanner & PityLedger (Banner Triệu hồi & Sổ bảo hiểm)**: Cấu hình danh sách Anh Hùng/vật phẩm trong bể triệu hồi, bảng xác suất theo độ hiếm, ngưỡng bảo hiểm mềm/cứng và lịch sử lượt quay đảm bảo tính chính xác cho từng người chơi.
- **AssetPipelineGuide (Quy trình sản xuất tài nguyên Pixel)**: Bộ quy tắc hướng dẫn, mẫu câu lệnh sinh ảnh, công cụ chuẩn hóa khung hình và từ điển thuật ngữ đã được chuyển đổi sang miền nghiệp vụ của dự án mới.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Người chơi mới có thể bắt đầu hành trình tại vùng Đồng Cỏ, gặp Quái Gác Cổng đầu tiên và hoàn thành trọn vẹn một trận đấu theo lượt bằng giao diện chọn kỹ năng dọc (bao gồm ít nhất 1 lần dùng kỹ năng tốn AP và 1 thao tác Né/Đỡ) trong vòng dưới 5 phút mà không cần hướng dẫn ngoài trò chơi.
- **SC-002**: Cả 7 vùng bản đồ (Đồng cỏ, Tuyết, Sa mạc, Dưới nước, Núi lửa, Ban đêm, Quang phổ mây trời ban đêm) đều đi thông suốt từ đầu vùng tới cổng kết thúc/đấu trường Trùm với `0` điểm kẹt địa hình không lối thoát và `0` lỗi lệch/hở mép nối bản đồ.
- **SC-003**: 100% danh sách kỹ năng của mỗi Anh Hùng hiển thị rõ ràng theo bố cục cột dọc trên màn hình chuẩn mà không cần cuộn ngang, chữ tiếng Việt sắc nét không tràn khung và không che khuất tín hiệu báo đòn của kẻ địch hay Trùm.
- **SC-004**: Cơ chế chiến đấu chủ động 2 chiều (thứ tự lượt, tích/tiêu AP, vòng bấm nhịp cường hóa chiêu thức Timed Hit khi tấn công, cửa sổ phản xạ Né/Đỡ Phản Đòn khi phòng thủ và kích hoạt Choáng khi đầy thanh Phá Thế) vận hành chính xác `100%` trên toàn bộ kịch bản kiểm thử chuẩn, bao gồm cả các trận Trùm đa giai đoạn.
- **SC-005**: Hệ thống Triệu Hồi đảm bảo `100%` trường hợp chạm ngưỡng bảo hiểm (Pity) trả về đúng bậc độ hiếm cam kết trên tối thiểu `10.000` lượt quay kiểm chứng mô phỏng, đồng thời đạt `0` lỗi thất thoát tiền tệ hoặc nhân vật khi ngắt kết nối đột ngột.
- **SC-006**: `100%` bộ quy trình tạo tài nguyên (11 bộ quy trình), mẫu câu lệnh tạo ảnh và từ điển thuật ngữ của dự án được đổi tên sang tên miền nghiệp vụ mới, cập nhật nội dung khớp thực thể mới, đạt `0` liên kết nội bộ bị đứt và không còn sót tên/mô tả bắt thú cũ.
- **SC-007**: `100%` tài nguyên đồ họa 2D pixel đưa vào trò chơi vượt qua kiểm định tự động về bảng màu, độ sắc nét điểm ảnh, tách sạch nền nháp và không cắt mép khung hiệu ứng; đồng thời `100%` các chế độ trò chơi sẵn có trên nền tảng vẫn hoạt động bình thường không phát sinh lỗi hồi quy.
- **SC-008**: Toàn bộ trò chơi cùng các dịch vụ phụ trợ đi kèm khởi chạy và vận hành hoàn chỉnh ngay trên môi trường máy cục bộ với chi phí thuê bao đám mây hoặc dịch vụ trả phí bên thứ ba bằng `0`.

## Assumptions

- **Quy ước cấu trúc 7 vùng bản đồ**: Cụm yêu cầu *"5 map đồng cỏ, tuyết, sa mạc, dưới nước, núi lửa, ban đêm, cuối cùng là quang phổ mây trời ban đêm"* được chuẩn hóa thành **5 vùng địa hình tự nhiên chính** (Đồng cỏ, Tuyết, Sa mạc, Dưới nước, Núi lửa) nối tiếp sang **Vùng Ban Đêm (thứ 6)** và khép lại tại đấu trường đỉnh cao **Quang Phổ Mây Trời Ban Đêm (thứ 7)** để đánh Trùm Cuối — đảm bảo không bỏ sót bất kỳ bối cảnh nào người dùng đã nêu.
- **Hạ tầng phụ trợ cục bộ miễn phí 100%**: Dự án được phép sử dụng các dịch vụ phụ trợ mã nguồn mở bên ngoài (như bộ nhớ đệm tốc độ cao, kho lưu trữ tài nguyên tĩnh hoặc cơ sở dữ liệu cục bộ) với điều kiện bắt buộc là hoàn toàn miễn phí và tải/chạy đóng gói tự chủ ngay trên máy cục bộ, không phụ thuộc bất kỳ tài khoản đám mây trả phí nào.
- **Chế độ chơi trọng tâm (Single-Player Tactical Squad)**: Phiên bản đầu tập trung vào trải nghiệm chiến dịch 1 người chơi điều khiển đội hình tối đa 3 Anh Hùng ra trận (cùng bộ sưu tập Anh Hùng dự bị mở khóa qua Gacha), tích hợp trực tiếp vào sảnh chọn chế độ chơi hiện có của dự án; các tính năng đấu đối kháng trực tuyến (PvP) hoặc tổ đội nhiều người thời gian thực sẽ thuộc giai đoạn mở rộng sau nếu có nhu cầu.
- **Phân phối theo lát cắt dọc (Vertical Slice)**: Kế hoạch triển khai sẽ ưu tiên hoàn thiện trọn vẹn chuẩn quy trình tài nguyên + vòng lặp chiến đấu dọc + vùng Đồng Cỏ trước để kiểm chứng chất lượng, sau đó mở rộng đầy đủ sang các vùng Tuyết, Sa mạc, Dưới nước, Núi lửa, Ban đêm và Quang Phổ Mây Trời Ban Đêm.
