# Phase 0 Research: Online Multiplayer Presence, Safe Chat, Friends, Co-op Party & Reconnect Recovery

**Feature**: `010-multiplayer-social`  
**Date**: 2026-11-19

---

## 1. Quản lý Presence, Chat Ring-Buffer & Party Runtime In-Process (Zero External Broker)

- **Decision**: Duy trì `PresenceRegistry`, `ChatRingBufferStore` (`50` tin/Zone & `50` tin/Party), `PendingPartyInviteStore` (`30s` TTL) và `ReconnectHoldStore` (`5s` / `120s`) hoàn toàn trong cấu trúc `Map` của tiến trình Modular Monolith NestJS. Chỉ lưu ảnh chụp bền vững `PartyAggregate` tại `data/db/parties/<partyId>.json` khi thành viên/Đội trưởng/luật loot thay đổi, và chỉ ghi nhật ký kiểm toán JSON (`data/db/audit/security-audit-YYYY-MM-DD.json`) khi có báo cáo `/report` hoặc vi phạm bảo mật.
- **Rationale**: Tuân thủ tuyệt đối Nguyên tắc I (JSON-Only Local Database & Zero Third-Party Services) và Nguyên tắc IV (không ghi tệp JSON xuống đĩa ở tần suất cao). Việc giữ lịch sử chat bình thường trong ring-buffer RAM loại bỏ hoàn toàn áp lực `fsync` đĩa trong lúc vẫn cung cấp đủ ngữ cảnh 10 dòng gần nhất khi có `/report`.
- **Alternatives considered (Rejected)**:
  - **Redis Pub/Sub / Redis Streams** cho Presence và Chat: Bị từ chối nghiêm ngặt vì vi phạm Nguyên tắc I (cấm Redis và broker bên ngoài) và không cần thiết cho kiến trúc đơn nút mục tiêu `20–50` CCU của MVP.
  - **Dịch vụ Chat SaaS bên thứ ba (Sendbird, Stream, Firebase Realtime)**: Bị từ chối tuyệt đối theo Nguyên tắc I.
  - **Ghi mọi dòng chat vào tệp JSON**: Bị từ chối vì tạo bão ghi I/O ổ đĩa không cần thiết và làm phình nhanh `data/db/`.

## 2. Chống XSS & Chống Spam Trò chuyện Hai Tầng (Plain-Text Enforcement + Token Bucket)

- **Decision**: Ở máy chủ (`ChatModerationService`), chuẩn hóa Unicode NFC, cắt bỏ mọi ký tự điều khiển `\u0000-\u001F` & `\u007F`, chuẩn hóa khoảng trắng, giới hạn cứng `1..250` code points UTF-8, và escape/từ chối thẻ HTML `<script>`, `<img ...>` thành văn bản thuần. Kết hợp bộ giới hạn `InMemoryTokenBucket` (`capacity: 5`, `refillWindowMs: 10000`) và bộ đếm vi phạm trượt `60s` (vi phạm `3 lần` → tự động mute `60s`). Ở client React, render 100% qua text node JSX thuần, áp dụng quy tắc lint cấm tuyệt đối `dangerouslySetInnerHTML`.
- **Rationale**: Bảo vệ theo chiều sâu (defense-in-depth) chống XSS, spam flood và từ chối dịch vụ cục bộ mà không phụ thuộc thư viện hay API kiểm duyệt ngoài.
- **Alternatives considered**: Chỉ lọc ở client (bị từ chối vì kẻ tấn công có thể gửi gói WebSocket trực tiếp); dùng thư viện HTML sanitizer phức tạp cho phép rich-text (không cần thiết vì game RPG 16-bit dùng plain-text + token màu hệ thống cố định).

## 3. Khóa Tuần tự Nguyên tử Cho Friends Hai Chiều, Party `3/4` Race & Atomic Loot Pickup

- **Decision**:
  - **Kết bạn hai chiều**: Sắp xếp khóa `["character:<idA>", "character:<idB>"]` theo thứ tự từ điển trong `AsyncLockManager` rồi thực thi Multi-File JSON WAL cập nhật đồng thời `friendCharacterIds` và xóa `pendingFriendRequests` của cả hai phía.
  - **Party Race (`ACCEPT` tại `3/4`)**: Khóa `["character:<joinerId>", "party:<partyId>"]` theo thứ tự từ điển để tuần tự hóa kiểm tra `memberIds.length < 4`.
  - **Atomic Loot Pickup**: Kiểm tra `ownerCharIds`, khoảng cách `<= 96 px` và xóa nguyên tử `GroundLootEntity` khỏi `ZoneInstance` RAM **trước** khi mở WAL ghi vào `data/db/inventories/<charId>.json`; nếu WAL báo `ERR_INVENTORY_FULL`, khôi phục lại `GroundLootEntity` vào RAM với phần `TTL` còn lại.
- **Rationale**: Triệt tiêu deadlock theo chứng minh thứ tự khóa cố định, chống vượt trần 4 người chơi và chống nhân bản vật phẩm khi 2 gói nhặt đồ đến đồng thời (Nguyên tắc II).
- **Alternatives considered**: Cập nhật từng tệp riêng lẻ không WAL (bị từ chối vì có thể tạo quan hệ bạn bè một chiều lệch nhau hoặc nhân bản đồ khi crash).

## 4. Chính sách Phiên Duy nhất & Điều phối Ngắt kết nối (`5s` Combat Grace + `120s` Slot Hold)

- **Decision**: `SessionReconnectCoordinator` gắn mỗi `characterId` với tối đa 1 `socketId`. Khi socket đóng:
  1. Nếu `inCombat === true`: giữ `PlayerEntity` đứng trong `ZoneInstance`/`DungeonInstance` suốt `5000 ms` (không có i-frame miễn sát thương) để chống Alt+F4 né chết; nếu tử vong trong 5 giây này, ghi nhận chết chuẩn và chuyển điểm hồi sinh về `lastSafeZoneId`.
  2. Hết `5s` (hoặc ngay lập tức nếu ngoài combat): ép `JsonDatabaseEngine` flush ngay bản ghi dirty của nhân vật, rút entity khỏi lưới hiển thị và mở bộ đếm `slotHoldExpiresAtMs = now + 120000` giữ nguyên suất `Party` và `DungeonInstance`.
  3. Khi client gửi `SESSION_RESUME` hợp lệ (xác thực lại JWT + `Session.revoked === false` + `Account.status === "ACTIVE"`): hủy timer `120s`, đưa nhân vật quay lại đúng instance đang sống (hoặc `lastSafeZoneId` nếu đã chết/instance đã đóng) và gửi `WORLD_SNAPSHOT (isFull: true)`.
- **Rationale**: Cân bằng hoàn hảo giữa chống gian lận thoát nóng (combat logging) và bảo vệ trải nghiệm người chơi rớt Wi-Fi trong Co-op Dungeon.
- **Alternatives considered**: Ngắt entity ngay lập tức khi đóng socket (bị lợi dụng Alt+F4 né chết); giữ suất vô thời hạn (gây kẹt slot Party và rò rỉ bộ nhớ DungeonInstance).

## 5. Phân quyền Co-op Homestead Theo Whitelist Cứng (`PARTY_ACCESS`)

- **Decision**: Áp dụng `HomesteadAuthorizationGuard` kiểm tra trực tiếp trạng thái Party trên server và đối chiếu hành động với whitelist hằng số `["VISIT", "WATER", "FERTILIZE", "FEED", "PET", "COOK", "TRAIN"]`. Mọi hành động ngoài whitelist (`HARVEST`, `COLLECT`, `BUILD`, `DEMOLISH`, `UPGRADE`, `STORAGE_ACCESS`, `ENHANCE`) chỉ chấp nhận khi `actorCharacterId === homestead.ownerCharacterId`. Khi chủ nhà đổi chế độ về `OWNER_ONLY` hoặc đá/rời Party, `HomesteadEjectionService` lập tức gửi `ZONE_TRANSITION` đưa mọi khách không còn quyền về `zon_greenhaven_square`.
- **Rationale**: Mô hình deny-by-default whitelist đảm bảo tính năng mới thêm vào Homestead sau này không bao giờ vô tình hở quyền phá hoại.
- **Alternatives considered**: Blacklist cấm vài hành động cụ thể (dễ sót quyền khi thêm công trình/thao tác mới ở M2–M5).
