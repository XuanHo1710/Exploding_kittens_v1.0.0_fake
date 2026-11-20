# Interface Contracts: Online Multiplayer Presence, Safe Chat, Friends, Co-op Party & Reconnect Recovery

**Feature**: `010-multiplayer-social`  
**Transport**: Self-Hosted NestJS REST (`/api/v1`) & WebSocket (`/game`, `protocolVersion: "1.0"`) — Zero Third-Party Chat/Presence/DB Services.

---

## 1. WebSocket Contracts (`C2S_*` ↔ `S2C_*` trên Namespace `/game`)

### 1.1 Chat & Moderation (`ZONE`, `PARTY`, `SYSTEM`)
- **`C2S: CHAT_SEND`** (Rate limit: `5 msg / 10s`; auto-mute `60s` sau `3` vi phạm trong `1 phút`):
  ```json
  { "channel": "ZONE", "message": "Có ai đi Mossroot Hollow cùng mình không?" }
  ```
  - Server validation: `channel ∈ ["ZONE", "PARTY"]`, length `1..250` UTF-8, strip `\x00-\x1F`, HTML escape/plain-text sanitize, verify membership if `PARTY`, reject muted senders.
- **`S2C: CHAT_MESSAGE`**:
  ```json
  {
    "msgId": "01J9Z4...",
    "channel": "ZONE",
    "senderId": "chr_01...",
    "senderName": "Kaelen",
    "text": "Có ai đi Mossroot Hollow cùng mình không?",
    "serverTs": 1795104205000
  }
  ```
  *(Client không hiển thị tin nhắn có `senderId ∈ blockedCharacterIds`; server lọc phía phát nếu cần và luôn render text node thuần).*

### 1.2 Party Lifecycle & Dungeon Ready Check (`1..4` Players)
- **`C2S: PARTY_ACTION`** (Rate limit: `3 / 5s`):
  ```json
  {
    "action": "CREATE | INVITE | ACCEPT | DECLINE | LEAVE | KICK | TRANSFER_LEADER | SET_LOOT_RULE | START_DUNGEON | READY_CHECK_RESPONSE",
    "targetId": "chr_02...",
    "lootRule": "PERSONAL_INSTANCED | ROUND_ROBIN",
    "dungeonId": "dng_mossroot_hollow",
    "ready": true
  }
  ```
  - Rules enforced server-side:
    - `INVITE`: Leader-only, target online, not in another party, not blocking sender, `15s` cooldown after target `DECLINE`, invite TTL `30s`.
    - `KICK` & `SET_LOOT_RULE`: Rejected with `ERR_PARTY_BOSS_LOCKED` during active Boss combat.
    - `START_DUNGEON`: Triggers `30s` Ready Check (`readyCheckExpiresAt = serverNow + 30000`).
- **`S2C: PARTY_INVITE`**: `{ inviteId, partyId, leaderId, leaderName, expiresAtMs }`
- **`S2C: PARTY_UPDATE`**:
  ```json
  {
    "partyId": "pty_01...",
    "leaderCharacterId": "chr_01...",
    "lootRule": "PERSONAL_INSTANCED",
    "activeDungeonInstanceId": null,
    "members": [
      { "characterId": "chr_01...", "name": "Kaelen", "heroId": "chr_kael_vanguard", "hp": 420, "maxHp": 465, "mp": 85, "maxMp": 120, "zoneId": "zon_greenhaven_square", "presenceStatus": "ONLINE", "reconnectExpiresAtMs": null }
    ]
  }
  ```
- **`S2C: DUNGEON_READY_CHECK` / `DUNGEON_READY_CANCELLED`**: `{ dungeonId, initiatedBy, readyCheckExpiresAtMs, memberStates: Record<string, "PENDING"|"READY"|"DECLINED"> }`.

### 1.3 Fair Loot Pickup & Disconnect/Reconnect (`5s` Grace / `120s` Hold)
- **`C2S: LOOT_PICKUP_REQ`** (`6 / s`): `{ requestId, lootId }` → Server verifies `lootId` exists in RAM Zone, `characterId ∈ eligibleCharacterIds`, Euclidean distance `<= 96 px`, deletes RAM entity atomically BEFORE writing `inventories/<charId>.json` via WAL (re-inserts RAM entity if `ERR_INVENTORY_FULL`).
- **`C2S: SESSION_RESUME`**: `{ token, characterId, protocolVersion: "1.0", lastProcessedSeq }` → Re-verifies JWT + `Session.revoked === false` + `Account.status === "ACTIVE"`; restores into live Party/DungeonInstance if within `120s` hold and alive, or lands at `lastSafeZoneId`; replies `WS_WELCOME` + `ZONE_TRANSITION` + `WORLD_SNAPSHOT (isFull: true)`.
- **`C2S: SNAPSHOT_RESYNC_REQ`** (`1 / 2s`): `{ lastTick }` → Server responds with `WORLD_SNAPSHOT (isFull: true)`.
- **`S2C: PRESENCE_UPDATE`**: `{ characterId, status, zoneId, serverTs }` (pushed to online friends & party members).

---

## 2. REST API Contracts (`/api/v1/social/*` & Homestead Permissions)

### `GET /api/v1/social/friends` (Auth: Bearer JWT)
- **Response `200 OK`**: `{ friends: [{ characterId, name, status, zoneId }], pendingRequests: [...], blockedCharacterIds: [...] }`.

### `POST /api/v1/social/friends/request` | `/accept` | `/decline` | `/remove` (Auth + `X-Idempotency-Key`)
- **Request**: `{ targetCharacterId: string }`
- **Constraints**: Max `50` friends, max `20` pending requests (7-day expiry); `/accept` acquires sorted locks `["character:<idA>", "character:<idB>"]` via `JsonDatabaseEngine` Multi-File WAL.

### `POST /api/v1/social/block` & `DELETE /api/v1/social/block/:targetCharacterId` (Auth + `X-Idempotency-Key`)
- **Constraints**: Max `100` blocked IDs; blocking automatically removes any existing friendship or pending friend request between the two characters.

### `POST /api/v1/social/chat/report` (Auth + `X-Idempotency-Key`)
- **Request**: `{ targetCharacterId, channel: "ZONE"|"PARTY", reason: string }`
- **Behavior**: Captures up to `10` recent messages from in-memory `ChatRingBufferStore` and appends `SocialSecurityAuditEvent` to `data/db/audit/security-audit-YYYY-MM-DD.json`.

### `PATCH /api/v1/characters/:charId/homestead/permissions` (Auth Owner-Only + `X-Idempotency-Key`)
- **Request**: `{ homesteadPermissionMode: "OWNER_ONLY" | "PARTY_ACCESS" }`
- **Response `200 OK`**: `{ homesteadPermissionMode, ejectedVisitorIds: string[] }` (if switching to `OWNER_ONLY`, immediately emits `ZONE_TRANSITION` moving all visitors to `zon_greenhaven_square`).

---

## 3. Canonical Social & Multiplayer Error Codes

| Code | Channel | Meaning |
| :--- | :---: | :--- |
| `ERR_CHAT_RATE_LIMITED` | WS | Vượt `5 tin / 10 giây` (kèm `retryAfterSec`) |
| `ERR_CHAT_MUTED` | WS | Đang bị tạm khóa chat `60 giây` do tái phạm spam |
| `ERR_PARTY_FULL` | WS | Tổ đội đã đủ `4/4` thành viên |
| `ERR_PARTY_INVITE_EXPIRED` / `ERR_PARTY_INVITE_COOLDOWN` | WS | Lời mời quá hạn `30s` hoặc đang trong `15s` cooldown sau từ chối |
| `ERR_PARTY_BOSS_LOCKED` | WS | Cấm `KICK` hoặc đổi `lootRule` khi đang giao chiến Boss |
| `ERR_FRIEND_LIMIT_REACHED` / `ERR_BLOCK_LIMIT_REACHED` | REST | Vượt trần `50` bạn bè / `20` lời mời / `100` chặn |
| `ERR_FORBIDDEN_OWNERSHIP` | REST/WS | Cố nhặt loot của người khác hoặc thực hiện hành vi cấm trên Homestead người khác |
| `ERR_SESSION_REPLACED` | WS | Đóng socket cũ do cùng `characterId` đăng nhập hợp lệ ở phiên mới |
| `ERR_RECONNECT_EXPIRED` | WS | Quá cửa sổ `120s` giữ suất Dungeon/Party (chuyển về đăng nhập phiên mới tại Safe Zone) |
