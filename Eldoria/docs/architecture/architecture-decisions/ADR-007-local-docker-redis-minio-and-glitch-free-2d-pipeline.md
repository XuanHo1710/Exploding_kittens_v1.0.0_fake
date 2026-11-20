# ADR-007: Local Docker Redis + MinIO (S3-Compatible) Infrastructure & Glitch-Free 2D Pixel Multi-Animation Pipeline

- **Trạng thái**: Accepted (Mandated by User Directive `DEC-003` & Constitution `v2.0.0`)
- **Ngày quyết định**: 2026-11-19
- **Người ra quyết định**: Chủ dự án (Project Owner), System Architect & Pixel Art Director
- **Sửa đổi / Bổ sung cho**: [`ADR-001`](./ADR-001-json-only-local-database.md), [`constitution.md`](../../../.specify/memory/constitution.md) (`v2.0.0`)
- **Spec Liên quan**: [`specs/013-local-infra-pixel-animation/spec.md`](../../../specs/013-local-infra-pixel-animation/spec.md)

---

## 1. Bối cảnh (Context)

Sau khi hoàn thiện bản thiết kế `v1.0` trên nền 100% tệp JSON cục bộ không dịch vụ phụ trợ, chủ dự án đã ban hành chỉ thị mở rộng có kiểm soát (`DEC-003`):
1. **Cho phép sử dụng Local Redis và Local MinIO (chuẩn S3-compatible) chạy hoàn toàn trong Docker cục bộ (`docker-compose.yml`)** — trong khi **vẫn giữ tuyệt đối tệp JSON (`data/db/**/*.json`) làm cơ sở dữ liệu chính duy nhất** (KHÔNG dùng PostgreSQL/MySQL/MongoDB/SQLite/TypeORM/Prisma và KHÔNG dùng AWS S3 Cloud/Redis Cloud/Firebase/Auth0).
2. **Đảm bảo chất lượng đồ họa pixel 2D giàu hoạt ảnh, không bị lỗi hiển thị**: triệt tiêu hoàn toàn các lỗi kinh điển của game 2D pixel (rách đường nối ô gạch, nhòe pixel, lem khung sprite sheet, kẹt trạng thái hoạt ảnh, cắt lệch chiều sâu Y-sort và crash do thiếu khóa animation).

---

## 2. Quyết định (Decision)

### 2.1 Kiến trúc Lưu trữ & Hạ tầng 3 Tầng Chạy 100% Local Docker
1. **Primary Persistent Database (`data/db/**/*.json` — Bất biến 100% JSON)**:
   - Không thay đổi nguồn chân lý bền vững: mọi thực thể tài khoản, nhân vật, kho đồ, tiền tệ (`currency-ledger-<characterId>-<YYYY-MM>.json`), cường hóa `+0 → +10`, gacha pity, lãnh địa và audit vẫn ghi nguyên tử (`tmp → fsync → rename`) + WAL 2PC trên hệ thống tệp JSON cục bộ.
2. **Ephemeral Runtime Cache & Coordination (`redis:7-alpine` trong Docker local)**:
   - Bind nội bộ (`127.0.0.1:6379` / mạng bridge Docker `eldoria_local_net`).
   - Đảm nhận: hot session lookup (`eldoria:sess:*`), brute-force lockout, sliding-window rate limit (WS/REST/Chat/Gacha), online zone/friend presence (`eldoria:presence:*`), Party invite TTL `60s`, idempotency fast-path và pub/sub sự kiện vùng.
   - **Bất biến Zero-Data-Loss**: Nếu Redis bị `FLUSHALL` hoặc restart, server tự chuyển sang chế độ `RAM_FALLBACK` (HTTP 200 `DEGRADED`) và tái đồng bộ mà không mất 1 byte dữ liệu nào của người chơi trên `data/db/**/*.json`.
3. **Local S3-Compatible Asset & Backup Storage (`minio/minio` + `minio-init` trong Docker local)**:
   - Bind nội bộ (`127.0.0.1:9000` S3 API, `127.0.0.1:9001` Console) gắn volume cục bộ `./data/minio:/data`.
   - Bucket `eldoria-assets` (public read-only, bật CORS localhost/LAN, immutable `v1/` prefix): lưu và phân phát toàn bộ sprite sheets, texture atlases, extruded tilesets, Tiled `.tmj`, âm thanh `.ogg/.mp3`, phông chữ pixel Việt hóa và `manifest.json` kèm SHA-256.
   - Bucket `eldoria-backups` (private, chỉ `eldoria-server` có quyền ghi): nhận bản chụp nén định kỳ 6 giờ & trước migration của `data/db/` song song với `data/backups/`.

### 2.2 Kiến trúc Đồ họa 2D Pixel Giàu Hoạt ảnh & Không Lỗi (Glitch-Free 2D Invariants)
1. **Integer Pixel Pipeline**: Phaser 3 khóa cứng `640×360` logical viewport, `pixelArt: true`, `antialias: false`, `roundPixels: true`, `Math.round` camera scroll và phóng tỷ lệ nguyên (`2x/3x/4x`).
2. **Zero-Bleed Atlas & Tileset Policy**: Mọi tileset bắt buộc `extrude: 1px` + `padding: 2px`; mọi sprite atlas POT `<= 2048×2048` bắt buộc `shapePadding: 2px`, `borderPadding: 2px`, `allowRotation: false`.
3. **4-Box Spatial Contract & Unified Y-Sort**: Tách rạch ròi Sprite Frame, Hurtbox, Foot Collision Box và Interaction Box; neo gốc tại bàn chân (`pivotY = 0.875` humanoid / `0.85` boss) với `Depth = 1000 + Math.round(footY)`, tán cây mờ `alpha 0.55` tại `Depth 101000`, và Boss Telegraph khóa cứng `Depth 180–199` + `Telegraph Rim Echo 109500`.
4. **25-State Multi-Animation HFSM + `AnimationStuckWatchdog`**: Đủ 25 trạng thái × 4 hướng (mở rộng 8 hướng) cho nhân vật, cộng hoạt ảnh quái/boss/động vật/cây trồng/môi trường (nước, cây đung đưa, lửa lò rèn). Watchdog tự hồi về `idle/walk` sau `sum(frameDurations) + 150ms`, kết hợp `playSafe()` fallback chain và công cụ kiểm định tự động `tools/design-validation/validate-animation-pipeline.mjs`.

---

## 3. Hệ quả & Đánh đổi (Consequences)

- **Tích cực**:
  - Giảm tải phục vụ ảnh/âm thanh cho tiến trình Node.js 20 Hz, sẵn sàng quản lý hàng trăm sprite atlas/animation theo chuẩn S3 cục bộ.
  - Tăng tốc kiểm tra phiên, chống spam và mở đường chia worker/kênh mượt mà ở M5 bằng Local Redis mà không cần bỏ kho JSON minh bạch.
  - Triệt tiêu tận gốc 7 lỗi kinh điển của game pixel 2D ngay từ tầng kiến trúc và kiểm chứng tự động.
- **Đánh đổi được chấp nhận**:
  - Môi trường chạy chuẩn cần Docker Desktop / Docker Engine cục bộ (tốn thêm ~250–400 MB RAM cho container Redis + MinIO). Vẫn duy trì cờ dự phòng `REDIS_ENABLED=false` và `ASSET_STORAGE_MODE=local_fs` cho chạy unit test nhẹ không cần Docker.
