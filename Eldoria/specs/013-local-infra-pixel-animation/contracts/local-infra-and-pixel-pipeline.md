# Contracts: Local Docker Infrastructure, Unified Healthcheck, Asset Manifest & 2D Pixel Animation Engine

**Feature**: `013-local-infra-pixel-animation`  
**Protocol Version**: `1.0.0`

---

## 1. Local Docker Compose Service Contract (`docker-compose.yml` Blueprint)

Toàn bộ stack chạy **100% cục bộ** trên 1 mạng bridge nội bộ (`eldoria_local_net`) không kết nối ra dịch vụ đám mây ngoài:

| Service Name | Image / Build | Internal Port | Host Bind (Local Only) | Persistent Volume | Healthcheck |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **`redis`** | `redis:7-alpine` | `6379` | `127.0.0.1:6379` | `eldoria_redis_data` (tùy chọn ephemeral) | `redis-cli ping` → `PONG` |
| **`minio`** | `minio/minio:RELEASE.2025-xx` | `9000` (S3 API), `9001` (Console) | `127.0.0.1:9000`, `127.0.0.1:9001` | `./data/minio:/data` | `curl -f http://localhost:9000/minio/health/live` |
| **`minio-init`** | `minio/mc:latest` (one-shot init) | — | — | Mount `./assets:/seed-assets:ro` | Exit `0` sau khi tạo bucket `eldoria-assets` (public download + CORS), `eldoria-backups` (private) và đồng bộ `v1/` |
| **`eldoria-server`** | Local Dockerfile (Node.js 22 Alpine) | `3000` | `127.0.0.1:3000` | `./data/db:/app/data/db`, `./data/backups:/app/data/backups`, `./game-data:/app/game-data:ro` | `GET http://localhost:3000/api/v1/health` → `200 OK` |

### Biến Môi trường Chuẩn (`.env.example` — Tuyệt đối không chứa mật khẩu production)
- `DATA_DB_DIR=/app/data/db` (100% JSON Primary DB)
- `REDIS_ENABLED=true`, `REDIS_URL=redis://redis:6379`, `REDIS_KEY_PREFIX=eldoria:`
- `ASSET_STORAGE_MODE=minio` (`minio | local_fs`)
- `MINIO_ENDPOINT=http://minio:9000`
- `MINIO_PUBLIC_URL=http://localhost:9000`
- `MINIO_ACCESS_KEY=eldoria_local_admin` (chỉ dùng dev/local)
- `MINIO_SECRET_KEY=<local-secret-min-16-chars>`
- `MINIO_BUCKET_ASSETS=eldoria-assets`
- `MINIO_BUCKET_BACKUPS=eldoria-backups`

---

## 2. Unified Health & Asset Manifest REST Contracts

### 2.1 `GET /api/v1/health` (Mở rộng tương thích ngược từ `specs/001`)
```json
{
  "status": "OK",
  "protocolVersion": "1.0.0",
  "constitutionVersion": "2.0.0",
  "serverTime": "2026-11-19T16:30:00.000Z",
  "components": {
    "jsonPrimaryDb": { "status": "UP", "walPending": 0, "schemaVersion": "1.0.0" },
    "gameCatalog": { "status": "UP", "filesLoaded": 12, "manifestHash": "<sha256>" },
    "localRedis": { "status": "UP", "mode": "CONNECTED", "latencyMs": 1 },
    "localMinio": { "status": "UP", "assetsBucket": "eldoria-assets", "backupsBucket": "eldoria-backups", "assetManifestVersion": "1.0.0" }
  }
}
```
- **Quy tắc Degraded Mode**:
  - Nếu `jsonPrimaryDb` hoặc `gameCatalog` là `DOWN` → trả HTTP `503` (chặn đăng nhập/ghi dữ liệu).
  - Nếu `localRedis` tạm `DOWN` → trả HTTP `200` với `"status": "DEGRADED"`, `"localRedis.mode": "RAM_FALLBACK"` — trò chơi vẫn duy trì an toàn trên JSON DB + RAM nội bộ!
  - Nếu `localMinio` tạm `DOWN` → trả `"status": "DEGRADED"` và client tự fallback sang `/assets/` tĩnh dự phòng hoặc retry có giới hạn.

### 2.2 `GET /api/v1/assets/manifest`
Trả về thông tin điểm đầu cuối cục bộ của MinIO cùng `AssetManifest` đã xác minh checksum để `BootScene` trên Phaser 3 nạp toàn bộ atlas/tileset/audio:
```json
{
  "manifestVersion": "1.0.0",
  "assetBaseUrl": "http://localhost:9000/eldoria-assets",
  "fallbackBaseUrl": "/assets",
  "pixelStandard": {
    "baseTilePx": 32,
    "heroFramePx": [48, 64],
    "viewportPx": [640, 360],
    "paddingPx": 2,
    "extrudePx": 1
  },
  "entries": [
    {
      "assetKey": "atlas_hero_kael",
      "objectKey": "v1/atlases/heroes/chr_kael_vanguard.png",
      "atlasJsonKey": "v1/atlases/heroes/chr_kael_vanguard.json",
      "kind": "ATLAS_PNG",
      "loadingGroup": "hero_on_demand",
      "sha256": "<64-hex>",
      "sizeBytes": 184320
    }
  ]
}
```

---

## 3. Client 2D Pixel Rendering & Anti-Glitch Animation Contracts

### 3.1 Phaser 3 Boot Configuration Invariants (Bắt buộc)
```ts
const PIXEL_CONFIG_INVARIANTS = {
  width: 640,
  height: 360,
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scaleMode: 'FIT_INTEGER_PREFERRED', // 2x (1280x720), 3x (1920x1080), 4x (2560x1440)
  cameraScrollRounding: true,         // Math.round(scrollX), Math.round(scrollY)
  maxAtlasTexturePx: 2048,
  requiredPaddingPx: 2,
  requiredTilesetExtrudePx: 1,
  depthStack: {
    ground: [0, 99],
    allyGroundDecals: [100, 119],
    buildGrid: [120, 139],
    hazards: [140, 179],
    bossTelegraphUnlit: [180, 199],      // Depth 180-199 (UNLIT, luôn dưới chân nhân vật & trên Ally Decals)
    groundShadows: [200, 299],
    ySortedEntities: [1000, 99999],      // depth = 1000 + Math.round(footY)
    overheadCanopyAndAirVfx: [100000, 109999],
    telegraphRimEcho: 109500,            // luôn hiện viền Boss Telegraph 2px trên Ultimate VFX
    worldOverlaysAndLighting: [110000, 119999]
  }
} as const;
```

### 3.2 `AnimationStuckWatchdog` & Fallback Contract
- **Input**: `entityId`, `currentClipKey`, `startedAtMs`, `clipDef.watchdogMaxDurationMs`, `velocitySq`.
- **Rule 1 (Zero Stuck State)**: Nếu `!clipDef.loop && (nowMs - startedAtMs) > clipDef.watchdogMaxDurationMs`, ép chuyển sang `velocitySq > 1 ? 'walk' : 'idle'` theo `facingDir`, xóa cờ `isActionLocked`, và tăng bộ đếm `animation_watchdog_recoveries` (mục tiêu kiểm thử: `0` trong điều kiện mạng bình thường, `100%` tự phục hồi trong điều kiện mất gói).
- **Rule 2 (Zero Missing Key Crash)**: `playSafe(entityKey, state, dir)` tìm theo thứ tự:
  1. `<entityKey>_<state>_<dir>`
  2. `<entityKey>_<state>_down` (nếu thiếu hướng phụ)
  3. `<entityKey>_idle_<dir>`
  4. `fallback_pixel_placeholder_idle_down` (không bao giờ ném `TypeError` làm sập vòng lặp 60 FPS).
- **Rule 3 (Strict Server Separation)**: Sự kiện khung hình `hitFrameIndex` trên client chỉ kích hoạt VFX, SFX và Hit-Stop cục bộ (`40–65ms`); sát thương thực tế CHỈ hiển thị số máu/damage sau khi nhận `COMBAT_DAMAGE_EVENT` từ máy chủ 20 Hz.
