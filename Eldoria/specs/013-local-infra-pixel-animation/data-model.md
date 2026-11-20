# Data Model: Local Redis Ephemeral Keys, MinIO Buckets & 2D Pixel Animation Manifest

**Feature**: `013-local-infra-pixel-animation`  
**Primary Persistent DB**: 100% Local JSON (`data/db/**/*.json`)  
**Ephemeral Runtime Store**: Local Docker Redis (`redis:7-alpine`)  
**Object Storage**: Local Docker MinIO (`eldoria-assets` + `eldoria-backups`)

---

## 1. Local Redis Ephemeral Keyspace (`EphemeralRuntimeState` — `redis:7-alpine`, 100% Rebuildable)

> **Bất biến Bắt buộc**: Mọi khóa dưới đây đều có TTL hữu hạn hoặc tái tạo được hoàn toàn từ RAM / `data/db/**/*.json`. TUYỆT ĐỐI KHÔNG lưu Inventory, Gold, Pity, Character Stats hay Quest Progress chỉ trong Redis! Instance Redis chạy chính sách toàn cục duy nhất `maxmemory 256mb` + `maxmemory-policy volatile-lru` kèm cảnh báo khi RAM > 80%.

| Key Pattern | Redis Data Type | TTL | Chủ sở hữu Module | Mục đích & Hành vi Degraded Fallback |
| :--- | :---: | :---: | :--- | :--- |
| `eldoria:sess:<sha256TokenHash>` | `STRING` (JSON) | Khớp `expiresAt` (`15m–7d`) | `IdentityModule` | Hot read-through cache cho `data/db/sessions/<id>.json`. Mất Redis → đọc trực tiếp từ `InMemoryAggregateCache` / JSON DB. |
| `eldoria:auth:lockout:<accountOrIp>` | `STRING` (int) | `900s` (15 phút) | `IdentityModule` | Đếm số lần đăng nhập sai chống brute-force (`>= 5` khóa). Fallback: in-memory Map. |
| `eldoria:rl:<scope>:<actorId>` | `ZSET` / `STRING` | `1s–60s` | `SecurityGuard` | Sliding-window rate limit (WS inputs, chat, Gacha/Enhance requests). Fallback: in-memory token bucket. |
| `eldoria:presence:zone:<zoneId>` | `HASH` (`charId -> JSON`) | Refresh `30s`, expire `90s` | `WorldModule` | Danh sách nhân vật online trong vùng & trạng thái nhanh. Fallback: đọc từ `ZoneInstance` RAM. |
| `eldoria:presence:char:<charId>` | `HASH` | `90s` | `SocialModule` | Trạng thái online/zone hiện tại của bạn bè. |
| `eldoria:party:invite:<inviteId>` | `STRING` (JSON) | `60s` | `PartyModule` | Lời mời Party tạm thời tự hủy sau 60s. |
| `eldoria:idem:<accountId>:<action>:<key>` | `STRING` (JSON) | `86400s` (24h) | `JsonDatabaseEngine` | Lớp chặn replay nhanh (`IN_FLIGHT \| COMPLETED`) song song với bản ghi bền vững tại `data/db/indexes/idempotency/<accountId>.json`. |
| `eldoria:pubsub:zone:<zoneId>` | `PUB/SUB` | Ephemeral | `RealtimeGateway` | Kênh phát tán sự kiện chat/party/boss announcement (sẵn sàng mở rộng multi-worker). |

---

## 2. Local MinIO Bucket & Object Schemas (`minio/minio`)

### 2.1 `AssetManifest` & `AssetEntry` — Bucket `eldoria-assets` (Public Read-Only, Immutable Versioned Prefix)
- **Object Key**: `v<major>/manifest.json`

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `AssetManifest.manifestVersion` | `string` | Required; SemVer `^\d+\.\d+\.\d+$` | Phiên bản gói tài nguyên toàn cục |
| `AssetManifest.generatedAt` | `string` | Required; ISO-8601 UTC | Thời điểm đóng gói atlas |
| `AssetManifest.pixelStandard` | `object` | Required; `{ baseTilePx: 32, heroFramePx: [48, 64], vfxMicroFramePx: [16, 16], viewportPx: [640, 360], paddingPx: 2, extrudePx: 1 }` (`Q1-A`) | Hằng số chuẩn pixel dùng để tự kiểm chứng phía client |
| `AssetManifest.entries` | `AssetEntry[]` | Required; `length >= 1`; không trùng `AssetEntry.assetKey` | Danh sách toàn bộ atlas, tileset, map, audio, font |
| `AssetEntry.assetKey` | `string` | Required; `^[a-z0-9_.-]+$` | Khóa nạp trong Phaser Loader |
| `AssetEntry.objectKey` | `string` | Required; `^v\d+/[a-z0-9/_.-]+$` | Đường dẫn đối tượng trong bucket `eldoria-assets` |
| `AssetEntry.kind` | `string` | Required; Enum `ATLAS_PNG \| ATLAS_JSON \| TILESET_EXTRUDED \| TILED_MAP \| AUDIO \| FONT` | Phân loại tệp |
| `AssetEntry.loadingGroup` | `string` | Required; Enum `core_ui \| region_mvp \| hero_on_demand \| boss_instance` | Nhóm nạp theo vòng đời cảnh |
| `AssetEntry.sha256` | `string` | Required; `^[0-9a-f]{64}$` | Mã kiểm tra toàn vẹn |
| `AssetEntry.sizeBytes` | `integer` | Required; `>= 1` | Dung lượng phục vụ thanh tiến độ tải |

### 2.2 `BackupObjectSnapshot` — Bucket `eldoria-backups` (Private Read/Write — Chỉ Server Truy cập)
- **Object Key**: `snapshots/<YYYYMMDD-HHMMSS>/db-snapshot.tar.gz` + `snapshots/<YYYYMMDD-HHMMSS>/backup-manifest.json`

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `BackupObjectSnapshot.backupId` | `string` | Required; `^\d{8}-\d{6}$` | Mã định danh bản chụp |
| `BackupObjectSnapshot.reason` | `string` | Required; Enum `SCHEDULED_6H \| PRE_MIGRATION \| MANUAL_ADMIN` | Nguyên nhân sao lưu |
| `BackupObjectSnapshot.sourceJsonFileCount` | `integer` | Required; `>= 1` | Tổng số tệp JSON trong `data/db/` đã đóng gói |
| `BackupObjectSnapshot.archiveSha256` | `string` | Required; `^[0-9a-f]{64}$` | Checksum toàn vẹn tệp nén `db-snapshot.tar.gz` |
| `BackupObjectSnapshot.retentionTier` | `string` | Required; Enum `HOURLY_6H \| DAILY_7D` | Quy tắc xoay vòng (giữ 4 bản 6h + 7 bản ngày) |
| `BackupObjectSnapshot.createdAt` | `string` | Required; ISO-8601 UTC | Dấu thời gian tạo bản chụp |

---

## 3. `AnimationClipDefinition` — 2D Pixel Animation Registry & Anti-Glitch Metadata

Mọi đoạn hoạt ảnh 2D được khai báo chuẩn hóa và kiểm chứng chéo trước khi khởi chạy:

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `AnimationClipDefinition.clipKey` | `string` | Required; `<entityId>_<state>[_<subIndex>]_<dir>` (VD: `chr_kael_vanguard_attack_combo_1_down`) | Khóa đăng ký duy nhất trong Phaser Animation Manager |
| `AnimationClipDefinition.entityId` | `string` | Required; khớp canonical ID trong `game-data/{characters,monsters,bosses,animals,crops,buildings}.json` | Ràng buộc khóa ngoại với catalog |
| `AnimationClipDefinition.state` | `string` | Required; Enum đúng 25 trạng thái chuẩn (`idle`, `walk`, `run`, `sprint`, `attack`, `attack_combo` [hỗ trợ 3 sub-clips `subIndex 1..3`], `cast`, `skill`, `ultimate`, `dodge`, `dash`, `hit`, `knockback`, `stun`, `block`, `death`, `respawn`, `mining`, `woodcutting`, `farming`, `fishing`, `crafting`, `building`, `interact`, `emote`) | Trạng thái HFSM chuẩn hóa |
| `AnimationClipDefinition.direction` | `string` | Required; Enum `down \| up \| left \| right` (mở rộng 8 hướng: `down_left`, `down_right`, `up_left`, `up_right`) | Hướng nhìn |
| `AnimationClipDefinition.atlasKey` | `string` | Required; phải tồn tại trong `AssetManifest.entries[].assetKey` | Atlas nguồn |
| `AnimationClipDefinition.frameCount` | `integer` | Required; `>= 1` (tối thiểu `4` cho `idle`/`walk`/`run`, `>= 6` cho `ultimate`/`boss`) | Số khung hình thực |
| `AnimationClipDefinition.frameDurationMs` | `integer[]` | Required; `length === AnimationClipDefinition.frameCount`; mỗi phần tử `33..500 ms` | Thời lượng từng khung hình |
| `AnimationClipDefinition.loop` | `boolean` | Required; `true` cho `idle`/`walk`/`run`/`sprint`/`block`/`stun`/`mining`/`woodcutting`/`farming`/`fishing`; `false` cho đòn đánh/dodge/hit/knockback/death/respawn | Chế độ lặp |
| `AnimationClipDefinition.priority` | `integer` | Required; `1..11` khớp `animation-state-machine.md` | Độ ưu tiên ngắt trạng thái |
| `AnimationClipDefinition.pivotNorm` | `{ x: number, y: number }` | Required; `x = 0.5`; `y = 0.875` (humanoid `48×64`), `0.85` (boss `128..256`, `mob_*`, `anm_*`), `0.90` (`crp_*`, `bld_*`) | Điểm neo gót chân phục vụ Y-Sorting chính xác |
| `AnimationClipDefinition.hitFrameIndex` | `integer \| null` | Optional; `0 <= idx < AnimationClipDefinition.frameCount` khi là đòn đánh/kỹ năng, `null` nếu không phải | Khung tạo Hit-Stop/VFX/SFX (chỉ hiển thị client) |
| `AnimationClipDefinition.cancelWindowStartFrame` | `integer \| null` | Optional; `0 <= idx < AnimationClipDefinition.frameCount` nếu cho phép hủy chiêu, `null` nếu khóa | Khung cho phép hủy sang Dodge/Combo tiếp theo |
| `AnimationClipDefinition.watchdogMaxDurationMs` | `integer` | Required; `sum(frameDurationMs) + 150` khi `loop === false`; `0` khi `loop === true` | Trần cứng chống kẹt hoạt ảnh vĩnh viễn |
| `AnimationClipDefinition.fallbackState` | `string` | Required; thuộc `AnimationClipDefinition.state`, mặc định `"idle"` | Trạng thái an toàn khi Watchdog kích hoạt |
