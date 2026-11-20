# WebSocket Realtime Contracts — Eldoria: Forgotten Wilds

**Trạng thái**: Design Baseline v1.0  
**Cập nhật lần cuối**: 2026-11-19  
**Namespace**: `/game` (`protocolVersion: "1.0"`)

---

## 1. Quy ước Bắt tay & Kết nối

- **Handshake Auth**: `{ auth: { token: "<accessToken>", characterId: "<uuid>", protocolVersion: "1.0" } }`.
- **Server Chào đón (`WS_WELCOME`)**: Trả về ngay sau khi xác thực thành công và nạp nhân vật vào `ZoneInstance`:
  ```json
  {
    "v": 1,
    "type": "WS_WELCOME",
    "payload": {
      "serverTick": 102400,
      "serverTime": 1795104200000,
      "tickRateHz": 20,
      "snapshotRateHz": 10,
      "zone": { "regionId": "reg_greenhaven_village", "zoneId": "zon_greenhaven_square", "weather": "CLEAR", "dayTimeMinutes": 540 },
      "selfEntity": { "id": "chr_01...", "x": 320, "y": 288, "facing": "DOWN", "hp": 220, "maxHp": 220, "mp": 80, "maxMp": 80, "stamina": 100, "maxStamina": 100 },
      "initialEntities": []
    }
  }
  ```

---

## 2. Gói tin Client → Server (`C2S_*`)

| Event Type | Tần suất tối đa | Payload Schema | Server Validation Bắt buộc |
| :--- | :---: | :--- | :--- |
| `PING` | 1 / 5s | `{ clientTs: number }` | Không |
| `MOVE_INPUT` | 20–25 / s | `{ seq: int, dx: -1..1, dy: -1..1, sprint: bool, facing: Direction }` | Kiểm tra `seq > lastSeq`, chuẩn hóa vector `hypot(dx, dy) <= 1.01`, kiểm tra stamina nếu `sprint`, kiểm tra collision Tiled & tốc độ tối đa |
| `BASIC_ATTACK_REQ` | 5 / s | `{ seq: int, aimAngle: number, comboStep: 1..3 }` | Kiểm tra không stun/chết, không đang recovery, kiểm tra tầm vũ khí & stamina trên server |
| `SKILL_CAST_REQ` | 5 / s | `{ seq: int, requestId: uuid, skillId: string, aimAngle: number, targetX?: number, targetY?: number }` | Kiểm tra nhân vật sở hữu `skillId`, đủ MP/Stamina, hết cooldown trên server, `target` trong `rangePx` |
| `DODGE_REQ` | 3 / s | `{ seq: int, dx: number, dy: number }` | Kiểm tra đủ Stamina (20), hết cooldown dodge (`1200 ms`), cấp i-frame chuẩn server (`300 ms`) |
| `BLOCK_STATE` | 5 / s | `{ seq: int, active: bool, facing: Direction }` | Kiểm tra trang bị hỗ trợ Block/Parry, cửa sổ Perfect Parry `200 ms` tính từ tick server bật |
| `INTERACT_REQ` | 4 / s | `{ requestId: uuid, targetType: "NPC"|"NODE"|"PORTAL"|"BUILDING"|"CROP", targetId: string }` | Kiểm tra khoảng cách Euclidean `<= 96 px` tới `targetId` trên server |
| `LOOT_PICKUP_REQ` | 6 / s | `{ requestId: uuid, lootId: string }` | Kiểm tra `lootId` tồn tại, `characterId in eligibleCharacterIds`, khoảng cách `<= 96 px`, túi còn ô trống |
| `INVENTORY_QUICK_USE` | 3 / s | `{ idempotencyKey: uuid, itemInstanceId: uuid }` | Kiểm tra sở hữu, loại `CONSUMABLE`, cooldown bình máu (`5000 ms`) |
| `CHAT_SEND` | 5 / 10s | `{ channel: "ZONE"|"PARTY", message: string }` | Độ dài `1..250`, sanitize plain-text, kiểm tra tư cách thành viên nếu `PARTY` |
| `PARTY_ACTION` | 3 / 5s | `{ action: "CREATE"|"INVITE"|"ACCEPT"|"DECLINE"|"LEAVE"|"KICK"|"START_DUNGEON", targetId?: string, dungeonId?: string }` | Kiểm tra quyền đội trưởng, giới hạn `4` thành viên, cấp độ mở khóa dungeon |
| `SNAPSHOT_RESYNC_REQ` | 1 / 2s | `{ lastTick: int }` | Trả `WORLD_SNAPSHOT` với `isFull: true` |
| `SESSION_RESUME` | Khi reconnect | `{ token: string, characterId: uuid, lastProcessedSeq: int }` | Xác thực lại JWT + nạp trạng thái phiên còn sống hoặc khôi phục từ JSON |

---

## 3. Gói tin Server → Client (`S2C_*`)

| Event Type | Tần suất / Trigger | Payload Schema (Tóm tắt) | Mục đích trên Client |
| :--- | :---: | :--- | :--- |
| `PONG` | Theo `PING` | `{ clientTs, serverTs, serverTick }` | Tính RTT & đồng bộ đồng hồ |
| `WORLD_SNAPSHOT` | 10 Hz (Delta) | `{ tick, isFull, ackSeq, self: { x, y, vx, vy, hp, mp, stamina, state }, entered[], updated[], left[] }` | Cập nhật `WorldStateBuffer` trong Phaser (KHÔNG đẩy toàn bộ vào React!) |
| `COMBAT_DAMAGE_EVENT` | Khi trúng đòn | `{ tick, attackerId, targetId, skillId, damage, isCrit, element, reaction?, targetHpAfter, targetPoiseAfter, knockback? }` | Hiển thị số damage bay, hit flash, hit-stop, thanh máu/poise Boss |
| `SKILL_TELEGRAPH_EVENT` | Khi quái/Boss bắt đầu cast | `{ telegraphId, casterId, shape, x, y, angle, radius, width, height, durationMs, serverStartTs, dangerLevel }` | Vẽ vùng cảnh báo đỏ sắc nét dưới chân nhân vật (Layer 100–199, không bị VFX che) |
| `BOSS_STATE_EVENT` | Khi Boss đổi phase / Stagger / Enrage | `{ bossEntityId, phaseNumber, state: "NORMAL"|"STAGGERED"|"ENRAGED"|"DEFEATED", staggerRemainingMs?, bannerTextVi }` | Cập nhật Boss Bar, phát nhạc/VFX chuyển phase |
| `LOOT_SPAWNED` / `LOOT_REMOVED` | Khi rớt / nhặt / hết hạn | `{ lootId, x, y, itemId, qty, rarity, ownerCharIds[] }` | Vẽ icon vật phẩm rơi phát sáng theo độ hiếm trên bản đồ |
| `INVENTORY_PATCH` | Sau mọi thay đổi kho/tiền | `{ revision, added[], updated[], removed[], currencies }` | Đồng bộ trực tiếp vào `useInventoryStore` |
| `ZONE_TRANSITION` | Khi qua cổng / vào Dungeon / về Nhà | `{ regionId, zoneId, instanceId?, spawnX, spawnY, tiledMapKey }` | Phaser tải/chuyển bản đồ, hiển thị fade ngắn `< 250 ms` |
| `PLAYER_DEATH` / `PLAYER_RESPAWN` | Khi HP = 0 / hồi sinh | `{ killerName, respawnOptions: ["VILLAGE", "DUNGEON_ENTRANCE"], penaltySummaryVi }` | Mở màn hình Death & Respawn; giữ nguyên trang bị (không rớt đồ mất vĩnh viễn) |
| `PARTY_UPDATE` / `PARTY_INVITE` | Khi tổ đội thay đổi | `{ partyId, leaderId, members[{ charId, name, heroId, hp, maxHp, zoneId }] }` | Cập nhật HUD tổ đội góc trái màn hình |
| `CHAT_MESSAGE` | Khi có tin nhắn hợp lệ | `{ msgId, channel, senderId, senderName, text, serverTs }` | Đẩy vào `useSocialStore` hiển thị khung chat |
| `ACTION_ERROR` | Khi lệnh bị từ chối | `{ requestId?, code, messageVi }` | Hiển thị toast lỗi rõ ràng, hoàn tác hiệu ứng dự đoán nếu có |

---

## 4. Hợp đồng Đồng bộ Animation (Client Visual vs Server State)

Server **KHÔNG** truyền số thứ tự từng khung hình pixel (frame 0..5). Server chỉ truyền **`animState`** (`IDLE`, `WALK`, `RUN`, `ATTACK_1`, `CAST`, `SKILL`, `ULTIMATE`, `DODGE`, `HIT`, `STUN`, `BLOCK`, `DEATH`, `MINING`, `FARMING`...), `facing` và `stateStartedAtTick`. Client Phaser tự phát chuỗi frame tương ứng từ `animation-standard.md` bắt đầu từ độ lệch thời gian thực để toàn bộ người chơi nhìn thấy cùng pha động tác mà không tốn băng thông.
