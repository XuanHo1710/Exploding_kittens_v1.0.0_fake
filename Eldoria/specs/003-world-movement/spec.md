# Feature Specification: Open World Maps, Partitioning, Movement & Sync

**Feature Branch**: `003-world-movement`

**Created**: 2026-11-19

**Status**: Reviewed (Autonomous Design Baseline — Chờ phê duyệt chuyển sang Implementation)

**Input**: User description: "Open world Tiled maps, zone partitioning, 20Hz server-authoritative movement, prediction, reconciliation and spatial interest management"

## Clarifications

### Session 2026-11-19 *(Autonomous Design Decisions — Proposed)*

- Q: Nhịp thời gian ngày/đêm và mùa vụ mặc định trong thế giới mở là bao nhiêu? → A: 1 ngày trong game = `24 phút` thực tế (14p ngày, 3p hoàng hôn, 6p đêm, 1p bình minh); 1 mùa = `14 ngày` trong game *(Proposed Decision — ASM-007)*.
- Q: Khi người chơi đứng gần cổng chuyển vùng giữa `Greenhaven Village` và `Whispering Forest`, trải nghiệm chuyển vùng diễn ra ra sao? → A: Tải trước tài nguyên vùng kế tiếp trong vùng đệm `6 tiles` trước cổng, chuyển vùng kèm hiệu ứng chuyển cảnh mượt `< 250 ms` và nạp ảnh chụp đầy đủ vùng mới *(Proposed Decision — ADR-006)*.
- Q: Bán kính lọc thực thể quan tâm (Interest Management) trên bản đồ mở là bao nhiêu? → A: Chia lưới không gian ô `256x256 px` (`8x8 tiles`), gửi cập nhật cho các thực thể trong cụm `5x5` ô lân cận (`~1280x1280 px`), đảm bảo đủ vùng đệm chống giật hiện trên màn hình logic `640x360 px` *(Proposed Decision — ADR-006)*.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Di chuyển Mượt mà Có Xác thực Máy chủ & Đồng bộ Đa người chơi (Priority: P1)

Với tư cách là người chơi, tôi muốn điều khiển nhân vật đi lại, chạy nhanh (sprint) qua `Greenhaven Village` và `Whispering Forest` với cảm giác phản hồi tức thì không bị trễ khó chịu, đồng thời nhìn thấy người chơi khác di chuyển mượt mà và không ai có thể gian lận tăng tốc hay đi xuyên tường.

**Why this priority**: Di chuyển và hiện diện không gian là nền tảng vật lý cho mọi hoạt động khám phá, thu thập, nông trại và chiến đấu.

**Independent Test**: Mở 2 trình duyệt đăng nhập 2 nhân vật vào cùng `zon_greenhaven_square`, di chuyển đồng thời (kể cả dưới độ trễ giả lập 80 ms), xác nhận cả 2 thấy nhau mượt mà; thử gửi gói đi xuyên tường hoặc chạy quá tốc độ bị máy chủ kéo lùi về vị trí hợp lệ.

**Acceptance Scenarios**:

1. **Given** người chơi đang đứng tại `zon_greenhaven_square`, **When** nhấn giữ phím di chuyển hoặc chạy nhanh (`Shift`), **Then** nhân vật phản hồi tức thì trên màn hình, tiêu hao stamina đúng quy tắc khi sprint và đồng bộ tọa độ chuẩn theo xác thực máy chủ.
2. **Given** hai người chơi đứng trong vùng quan tâm (`5x5` ô không gian), **When** người chơi A di chuyển, **Then** người chơi B nhìn thấy chuyển động mượt qua nội suy và đúng hướng nhìn 4 chiều (`UP`, `DOWN`, `LEFT`, `RIGHT`).
3. **Given** một client gửi chuỗi tín hiệu di chuyển vượt vận tốc cho phép hoặc đâm vào ô va chạm tường/nước, **When** máy chủ xử lý tick mô phỏng, **Then** máy chủ giới hạn tốc độ chuẩn, chặn va chạm và gửi tín hiệu hiệu chỉnh vị trí về client.

---

### User Story 2 - Chuyển vùng Thế giới, Lãnh địa Riêng & Điểm Dịch chuyển Nhanh (Priority: P1)

Với tư cách là nhà thám hiểm, tôi muốn đi qua cổng giữa `Greenhaven Village`, lãnh địa nhà riêng (`Homestead`), `Whispering Forest` và cổng vào `Mossroot Hollow`, đồng thời mở khóa cột mốc dịch chuyển nhanh (Fast Travel) và khám phá sương mù bản đồ (Fog of War).

**Why this priority**: Thiết lập cấu trúc phân vùng thế giới (Open-World Zone vs Private Homestead vs Dungeon Entrance) để tránh tải toàn thế giới trong một không gian phẳng duy nhất.

**Independent Test**: Đi từ quảng trường làng qua cổng sang rừng rồi vào lãnh địa riêng và quay về bằng Fast Travel đã mở khóa; kiểm chứng chuyển cảnh sạch không sót thực thể vùng cũ và lưu checkpoint vị trí sau 30 giây hoặc khi chuyển vùng.

**Acceptance Scenarios**:

1. **Given** nhân vật tiến vào vùng cổng chuyển từ `zon_greenhaven_square` sang `zon_forest_west`, **When** máy chủ xác nhận điều kiện cấp độ/khu vực hợp lệ, **Then** nhân vật được chuyển sang vùng đích tại đúng điểm xuất hiện an toàn và client nhận ảnh chụp đầy đủ thực thể vùng mới.
2. **Given** người chơi rời khỏi lãnh địa riêng và không còn ai bên trong sau `60 giây`, **When** bộ quản lý vùng kiểm tra, **Then** máy chủ lưu trạng thái lãnh địa xuống tệp JSON và giải phóng bộ nhớ vùng đó.

---

### User Story 3 - Bản đồ Thế giới, Minimap, Chu kỳ Ngày/Đêm & Thời tiết (Priority: P2)

Với tư cách là người chơi, tôi muốn quan sát vị trí bản thân, đồng đội, NPC và điểm mốc trên Minimap & World Map (có Fog of War), đồng thời trải nghiệm chu kỳ ngày/đêm, 4 mùa và thời tiết đồng bộ chung cho toàn vùng.

**Why this priority**: Tạo nên trụ cột "Thế giới sống động và có thể khám phá" và gắn kết thời tiết mưa với cơ chế tưới nông trại.

**Independent Test**: Bật World Map và Minimap, di chuyển vào vùng chưa mở thấy Fog of War sáng dần; quan sát toàn bộ người chơi trong cùng vùng nhận cùng thời điểm ngày/đêm và sự kiện chuyển thời tiết `CLEAR → RAIN`.

**Acceptance Scenarios**:

1. **Given** nhiều người chơi đang ở trong `reg_whispering_forest`, **When** đồng hồ thế giới chuyển từ ban ngày sang hoàng hôn hoặc thời tiết chuyển sang mưa (`RAIN`), **Then** tất cả người chơi trong vùng nhận cùng trạng thái thời gian và thời tiết đồng bộ từ máy chủ.
2. **Given** người chơi mở World Map, **When** chọn một điểm dịch chuyển nhanh đã mở khóa ngoài trạng thái chiến đấu, **Then** nhân vật được dịch chuyển an toàn sau thời gian niệm ngắn và cập nhật vùng hiện tại.

---

### Edge Cases

- Người chơi bị mất kết nối khi đang đứng trong khu vực nguy hiểm hoặc khi đang chuyển vùng: máy chủ lưu `lastSafeZoneId/X/Y` làm điểm hồi phục dự phòng nếu vùng cũ không còn khả dụng; nếu kết nối lại trong `120 giây`, khôi phục đúng vị trí hợp lệ.
- Gói cập nhật delta bị rơi do mất gói mạng (khuyết `deltaBaseTick`): client tự động yêu cầu một ảnh chụp đầy đủ (`SNAPSHOT_RESYNC_REQ`) để tái đồng bộ toàn bộ thực thể lân cận.
- Tọa độ sai lệch do va chạm góc chéo hoặc lag spike: sai lệch `< 6 px` giữ nguyên để tránh rung màn hình; `6–48 px` nội suy hiệu chỉnh mượt trong `100 ms`; `> 48 px` kéo về vị trí máy chủ tức thời.
- Hàng chục người chơi tụ tập cùng một quảng trường làng: bộ lọc lưới không gian vẫn giữ gói tin gọn bằng delta chỉ gửi các trường thay đổi và áp giới hạn tần suất gói đầu vào.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống PHẢI tải dữ liệu bản đồ phân tầng (địa hình, va chạm, cổng chuyển, điểm hồi sinh, điểm tài nguyên, vùng an toàn) từ định dạng bản đồ JSON chuẩn (Tiled `.tmj`) dùng chung quy tắc va chạm giữa máy chủ và client.
- **FR-002**: Hệ thống PHẢI phân vùng thế giới thành các `ZoneInstance` mở (`reg_greenhaven_village`, `reg_whispering_forest` trong MVP; kiến trúc hỗ trợ đủ 8 khu vực), `HomesteadInstance` riêng tư tải/dỡ linh hoạt theo người hiện diện và cổng nối `DungeonInstance`.
- **FR-003**: Hệ thống PHẢI xử lý toàn bộ di chuyển theo mô hình máy chủ quyết định ở chu kỳ 20 Hz: chỉ nhận vector hướng chuẩn hóa và trạng thái chạy nhanh kèm số thứ tự tăng dần (`seq`), tự kiểm tra vận tốc tối đa, tiêu hao stamina và va chạm bản đồ.
- **FR-004**: Client PHẢI thực hiện dự đoán di chuyển cục bộ (client-side prediction) kèm đối soát máy chủ (reconciliation theo `ackSeq`) cho nhân vật bản thân và nội suy (`100 ms` buffer) cho các thực thể khác.
- **FR-005**: Hệ thống PHẢI áp dụng quản lý vùng quan tâm theo lưới không gian (`256x256 px` mỗi ô, tầm nhìn `5x5` ô) và phát ảnh chụp sai khác (delta snapshot) ở tần suất cấu hình độc lập (mặc định `10 Hz`) gồm danh sách `entered`, `updated`, `left`.
- **FR-006**: Hệ thống PHẢI đồng bộ đồng hồ thế giới (chu kỳ 24 phút/ngày, 4 mùa 14 ngày) và thời tiết theo khu vực từ máy chủ, đồng thời hỗ trợ mở khóa điểm dịch chuyển nhanh (Fast Travel) và sương mù bản đồ (Fog of War) lưu bền vững trên hồ sơ nhân vật.
- **FR-007**: Hệ thống PHẢI lưu vị trí nhân vật theo cơ chế cờ đánh dấu bẩn (dirty flag) định kỳ 30 giây và lưu ngay lập tức khi chuyển vùng, ngắt kết nối hoặc tắt máy chủ, tuyệt đối không ghi tệp JSON theo từng tick 20 Hz.
- **FR-008**: Hệ thống PHẢI hỗ trợ đồng bộ đồng hồ mạng (`PING/PONG`), khôi phục ảnh chụp đầy đủ khi mất gói delta và chấm điểm nghi vấn chống gian lận tốc độ/dịch chuyển.

### Key Entities *(include if feature involves data)*

- **WorldRegionState**: Trạng thái bền vững cấp khu vực lưu trong `data/db/world/<regionId>.json` gồm mùa, ngày trong mùa, thời tiết hiện tại, thời điểm đổi thời tiết và danh sách phân vùng.
- **WorldZone**: Phân vùng bản đồ gắn với tệp `.tmj`, cờ vùng an toàn, cổng chuyển vùng, điểm tài nguyên và điểm sinh quái.
- **PlayerPosition**: Tọa độ nhân vật nhúng trong `characters/<characterId>.json` gồm vùng/zone hiện tại, tọa độ `(x, y)`, hướng 4 chiều, điểm an toàn gần nhất và danh sách điểm Fast Travel / ô Fog of War đã mở.
- **ZonePortal**: Cổng kết nối giữa hai zone gồm vùng kích hoạt, zone đích, tọa độ xuất hiện đích và điều kiện cấp độ mở khóa.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Di chuyển nhân vật trên kết nối có độ trễ `80 ms` đạt phản hồi cục bộ tức thì và sai lệch hiệu chỉnh dưới `6 px` trong `>= 98%` khung hình di chuyển bình thường (`proposed / unverified`).
- **SC-002**: `100%` nỗ lực đi xuyên tường, vượt tốc độ tối đa hoặc gửi tọa độ đích giả mạo bị máy chủ chặn và hiệu chỉnh về tọa độ hợp lệ.
- **SC-003**: Bộ lọc lưới không gian loại bỏ `100%` cập nhật của thực thể nằm ngoài cụm `5x5` ô lân cận, giữ kích thước gói delta snapshot trung bình `<= 2 KB` ở mật độ 20 thực thể lân cận (`proposed / unverified`).
- **SC-004**: Chuyển vùng giữa `Greenhaven Village`, `Homestead` và `Whispering Forest` hoàn tất trong `< 500 ms` trên mạng nội bộ mà không rò rỉ thực thể vùng cũ hoặc mất đồng bộ vị trí lưu JSON.

## Assumptions

- Bản đồ MVP bao gồm `reg_greenhaven_village` (Quảng trường + Cổng Homestead) và `reg_whispering_forest` (Rừng Tây + Rừng Sâu + Cổng `dng_mossroot_hollow`); 6 khu vực còn lại dùng chung định dạng `.tmj` và cơ chế nạp để bổ sung ở M2–M5.
- Hệ thống hướng di chuyển sử dụng vector 2D mượt cho chuyển động, ánh xạ về 4 hướng animation chuẩn (`UP`, `DOWN`, `LEFT`, `RIGHT`) trong MVP và mở rộng 8 hướng sau này.
