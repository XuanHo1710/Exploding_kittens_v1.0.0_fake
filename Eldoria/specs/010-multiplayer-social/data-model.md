# Data Model: Online Multiplayer Presence, Safe Chat, Friends, Co-op Party & Reconnect Recovery

**Feature**: `010-multiplayer-social`  
**Storage**: 100% Local JSON Files (`data/db/parties/*.json`, `data/db/characters/*.json`, `data/db/houses/*.json`, `data/db/audit/*.json`) + In-Process Node.js Ephemeral RAM — Zero External DBMS / Zero Redis / Zero Third-Party Services.

---

## 1. `PartyAggregate` (Persistent Snapshot `data/db/parties/<partyId>.json` trong `JsonEnvelope`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `PartyAggregate.partyId` | `string` | Required; khớp `^pty_[a-zA-Z0-9_-]{8,48}$` | Mã định danh tổ đội duy nhất |
| `PartyAggregate.leaderCharacterId` | `string` | Required; PHẢI nằm trong `PartyAggregate.memberIds` | Đội trưởng có quyền mời, đổi luật loot, khởi chạy Hầm ngục |
| `PartyAggregate.memberIds` | `string[]` | Required; độ dài `1..4`; các phần tử duy nhất | Danh sách thành viên theo thứ tự gia nhập (phục vụ tự chuyển Leader) |
| `PartyAggregate.lootRule` | `string` | Required; Enum `PERSONAL_INSTANCED \| ROUND_ROBIN`; mặc định `PERSONAL_INSTANCED`; chỉ đổi khi ngoài combat & ngoài phòng Boss | Quy tắc chia chiến lợi phẩm (`RARE`+/Boss luôn ép `PERSONAL_INSTANCED`) |
| `PartyAggregate.activeDungeonInstanceId` | `string \| null` | Optional; `null` hoặc khớp `^dngi_[a-zA-Z0-9_-]{8,48}$` | Phiên bản Hầm ngục tổ đội đang chinh phục |
| `PartyAggregate.createdAt` | `string` | Required; ISO-8601 UTC từ đồng hồ server | Thời điểm thành lập tổ đội |

**State Transitions (`PartyAggregate`)**:
`[CREATE (1/4)]` → `[ACTIVE (1..4)]` ↔ `[READY_CHECK (30s in RAM)]` → `[IN_DUNGEON (`activeDungeonInstanceId != null`, cấm `KICK` khi Boss active)]` → `[DISBANDED (0 thành viên → xóa tệp `parties/<partyId>.json`)]`.

---

## 2. `CharacterSocialExtension` (Embedded trong `data/db/characters/<characterId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `CharacterSocialExtension.partyId` | `string \| null` | Optional; tham chiếu `PartyAggregate.partyId` hợp lệ hoặc `null` | Tổ đội hiện tại của nhân vật |
| `CharacterSocialExtension.friendCharacterIds` | `string[]` | Required; độ dài `0..50`; duy nhất; cấm chứa chính mình; không giao với `blockedCharacterIds` | Danh sách bạn bè đã xác nhận hai chiều |
| `CharacterSocialExtension.pendingFriendRequests` | `FriendRequestEntry[]` | Required; độ dài `0..20`; mỗi mục `{ fromCharacterId, createdAt, expiresAt }` với `expiresAt = createdAt + 7 days` | Lời mời kết bạn chờ xử lý |
| `CharacterSocialExtension.blockedCharacterIds` | `string[]` | Required; độ dài `0..100`; duy nhất; cấm chứa chính mình | Danh sách người bị chặn (ẩn chat, từ chối lời mời Party & kết bạn) |

---

## 3. `HomesteadAccessPolicy` (Embedded trong `data/db/houses/<characterId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `HomesteadAccessPolicy.ownerCharacterId` | `string` | Required; khớp chính xác `JsonEnvelope.entityId` của `houses/<characterId>.json` | Chủ sở hữu duy nhất toàn quyền trên lãnh địa |
| `HomesteadAccessPolicy.homesteadPermissionMode` | `string` | Required; Enum `OWNER_ONLY \| PARTY_ACCESS`; mặc định `OWNER_ONLY` | Chế độ mở cửa cho đồng đội cùng Tổ đội |
| `HomesteadAccessPolicy.allowedCoopActions` | `string[]` | Required; whitelist cứng `["VISIT", "WATER", "FERTILIZE", "FEED", "PET", "COOK", "TRAIN"]`; cấm cứng `HARVEST`, `COLLECT`, `BUILD`, `DEMOLISH`, `UPGRADE`, `STORAGE_ACCESS`, `ENHANCE` | Tập hành động hợp tác được phép cho khách khi `PARTY_ACCESS` |

---

## 4. `PresenceRecord` (Ephemeral RAM Only trong `PresenceRegistry` — Không ghi đĩa theo tick)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `PresenceRecord.characterId` | `string` | Required; khóa duy nhất trong `Map<characterId, PresenceRecord>` | Nhân vật đang theo dõi hiện diện |
| `PresenceRecord.socketId` | `string \| null` | Optional; tối đa `1` active socket/nhân vật (Single Active Session) | Kết nối WebSocket hiện hành |
| `PresenceRecord.status` | `string` | Required; Enum `ONLINE \| IN_HOMESTEAD \| IN_DUNGEON \| AWAY \| DISCONNECTED_HOLD \| OFFLINE` | Trạng thái hiện diện thời gian thực |
| `PresenceRecord.zoneId` | `string` | Required; mã `zon_*`, `homestead:<ownerId>` hoặc `dngi_*` | Vị trí vùng hiển thị cho bạn bè/tổ đội |
| `PresenceRecord.lastInputAtMs` | `integer` | Required; `>= 0` (Unix ms server); tự chuyển `AWAY` sau `300000 ms` không nhận input | Mốc phát hiện AFK |

---

## 5. `ChatMessageRecord` (Ephemeral RAM Ring-Buffer: tối đa `50` tin/Zone & `50` tin/Party)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `ChatMessageRecord.msgId` | `string` | Required; UUIDv7 | Định danh duy nhất của tin nhắn |
| `ChatMessageRecord.channel` | `string` | Required; Enum `ZONE \| PARTY \| SYSTEM` | Kênh phát sóng hợp lệ của MVP |
| `ChatMessageRecord.senderCharacterId` | `string \| null` | Optional; `null` cho `SYSTEM`; bắt buộc khớp nhân vật xác thực cho `ZONE`/`PARTY` | Người gửi tin nhắn |
| `ChatMessageRecord.senderName` | `string` | Required; `1..24` ký tự plain-text đã sanitize | Tên hiển thị nhân vật hoặc `"Hệ thống"` |
| `ChatMessageRecord.text` | `string` | Required; `1..250` ký tự UTF-8; loại `\x00-\x1F`, cắt khoảng trắng thừa, vô hiệu hóa thẻ HTML | Nội dung văn bản thuần an toàn chống XSS |
| `ChatMessageRecord.serverTs` | `integer` | Required; Unix ms từ đồng hồ server | Dấu thời gian chuẩn hóa máy chủ |

---

## 6. `SessionReconnectHold` (Ephemeral RAM Only trong `SessionReconnectCoordinator`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `SessionReconnectHold.characterId` | `string` | Required; khóa duy nhất | Nhân vật đang trong cửa sổ ngắt kết nối |
| `SessionReconnectHold.inCombatAtDisconnect` | `boolean` | Required | Cờ kích hoạt `5s` Combat Logout Grace |
| `SessionReconnectHold.combatGraceEndsAtMs` | `integer \| null` | Optional; bằng `disconnectedAtMs + 5000` nếu `inCombatAtDisconnect === true`, ngược lại `null` | Thời điểm kết thúc chịu đòn sau khi rớt mạng |
| `SessionReconnectHold.slotHoldExpiresAtMs` | `integer` | Required; bằng `disconnectedAtMs + 120000` | Mốc hết hạn giữ suất Party & Dungeon |
| `SessionReconnectHold.reservedPartyId` | `string \| null` | Optional; tham chiếu `PartyAggregate.partyId` đang giữ chỗ | Tổ đội đang bảo lưu suất |
| `SessionReconnectHold.reservedDungeonInstanceId` | `string \| null` | Optional; tham chiếu `DungeonInstance` đang bảo lưu suất | Hầm ngục đang bảo lưu suất |
| `SessionReconnectHold.lastProcessedSeq` | `integer` | Required; `>= 0` | Số thứ tự gói input cuối cùng đã xử lý phục vụ `SESSION_RESUME` |

---

## 7. `SocialSecurityAuditEvent` (Append-Only JSON `data/db/audit/security-audit-<YYYY-MM-DD>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `SocialSecurityAuditEvent.eventId` | `string` | Required; UUIDv7 | Mã sự kiện kiểm toán |
| `SocialSecurityAuditEvent.eventType` | `string` | Required; Enum `CHAT_REPORT \| CHAT_RATE_MUTE \| UNAUTHORIZED_LOOT_PICKUP \| HOMESTEAD_GRIEF_ATTEMPT \| SESSION_REPLACED \| WS_FLOOD_DISCONNECT` | Phân loại sự cố an toàn/xã hội |
| `SocialSecurityAuditEvent.actorCharacterId` | `string` | Required; mã nhân vật liên quan | Nhân vật thực hiện hoặc bị báo cáo |
| `SocialSecurityAuditEvent.evidenceSnapshot` | `object` | Required; tối đa `10` tin nhắn gần nhất từ RAM ring-buffer hoặc ngữ cảnh vi phạm; kích thước `<= 8 KB` | Bằng chứng phục vụ kiểm toán nội bộ |
| `SocialSecurityAuditEvent.createdAt` | `string` | Required; ISO-8601 UTC từ đồng hồ server | Thời điểm ghi nhận sự kiện |
