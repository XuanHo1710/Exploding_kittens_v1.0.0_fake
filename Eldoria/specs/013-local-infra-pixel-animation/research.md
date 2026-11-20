# Technical Research: Local Docker Redis & MinIO + Glitch-Free 2D Pixel Multi-Animation Architecture

**Feature**: `013-local-infra-pixel-animation`  
**Date**: 2026-11-19  
**Constitution Reference**: v2.0.0 (Principles I, IV, V, VIII)

---

## 1. Phân tích Ranh giới Lưu trữ: JSON Primary DB vs Local Docker Redis vs Local Docker MinIO

### Quyết định Kiến trúc
Sử dụng mô hình **3-Tier Local-Only Storage Topology** chạy trọn gói trong một `docker-compose.yml` cục bộ (0 dịch vụ đám mây ngoài):

| Tầng | Công nghệ Cục bộ | Dữ liệu Đảm nhận | Độ bền & Hành vi Khi Mất/Restart |
| :--- | :--- | :--- | :--- |
| **Primary Persistent DB** | **100% JSON Files (`data/db/**/*.json`)** via `JsonDatabaseEngine` | Accounts, Sessions (gốc), Characters, Inventories, Homesteads, World state, Parties (snapshot), CurrencyLedgers (per-char), Upgrade/Gacha History, Security Audits | **Source of Truth duy nhất**. Ghi nguyên tử `tmp → fsync → rename` + WAL 2PC + SHA-256 checksum. Không bao giờ mất dữ liệu đã commit. |
| **Ephemeral Runtime Layer** | **Local Redis (`redis:7-alpine`)** trong Docker | Hot session cache (`sess:<hash>`), Online presence (`presence:zone:<id>`, `presence:char:<id>`), Party invite TTL `60s`, WS/REST sliding-window rate limits, Zone pub/sub events, Short-lived idempotency fast-path | **Volatile / Rebuildable 100%**. Nếu Redis restart hoặc `FLUSHALL`, server tự tái tạo presence/session cache từ kết nối đang sống và `data/db/sessions/*.json`; fallback sang in-memory `Map` khi mất kết nối thoáng qua. |
| **Object Asset & Backup Layer** | **Local MinIO (`minio/minio`)** chuẩn S3 API trong Docker | Bucket `eldoria-assets` (public-read): versioned sprite sheets, texture atlases, Tiled `.tmj`, audio `.ogg/.mp3`, fonts, `manifest.json`. Bucket `eldoria-backups` (private): bản nén xoay vòng `data/db/` + `backup-manifest.json`. | **Immutable Assets & Backup Mirror**. Assets có nguồn gốc từ thư mục `assets/` và đồng bộ tự động bởi container `minio-init` (`mc mirror`). Backup luôn tồn tại song song trên đĩa cục bộ `data/backups/` và `eldoria-backups`. |

### Lý do Không Dùng Redis Làm Primary DB
- Nếu lưu trực tiếp Inventory/Gold vào Redis AOF/RDB mà không ghi qua `JsonDatabaseEngine`, sẽ vi phạm trực tiếp chỉ thị cốt lõi của chủ dự án (*"Lấy database là JSON làm database chính"*) và làm mất tính minh bạch đọc/diff từng tệp JSON người chơi. Do đó, mọi mutation kinh tế **LUÔN commit WAL xuống `data/db/**/*.json` trước**, rồi mới cập nhật hoặc vô hiệu hóa (invalidate) cache trên Redis.

---

## 2. Chẩn đoán & Triệt tiêu 7 Nguyên nhân Gây Lỗi Phổ biến Nhất ở Game Pixel 2D Nhiều Hoạt ảnh

Dựa trên kinh nghiệm sản xuất game pixel 2D với Phaser 3 / WebGL2, 7 lỗi hay gặp nhất và biện pháp triệt tiêu tận gốc trong thiết kế Eldoria:

| # | Lỗi Game Pixel 2D Phổ biến | Nguyên nhân Kỹ thuật | Giải pháp Bắt buộc trong Eldoria (`013`) |
| :---: | :--- | :--- | :--- |
| **1** | **Tile Seam Bleeding (Đường kẻ sọc 1px chớp nháy giữa các ô cỏ/nước)** | WebGL texture sampling lấy mẫu ở mép sub-pixel khi camera di chuyển tọa độ thập phân hoặc tileset không có extrusion. | Bắt buộc **`extrude: 1 px`** + **`padding: 2 px`** cho mọi tileset (`tile-extruder`) VÀ khóa tọa độ camera & sprite nguyên (`roundPixels: true`, `Math.round(camera.scrollX)`). |
| **2** | **Sprite Blur & Mixel (Hình mờ nhòe hoặc kích thước pixel to nhỏ lẫn lộn)** | Dùng `antialias: true`, `LINEAR` filtering, xoay sprite bằng góc tự do, hoặc scale không đồng nhất giữa UI/VFX/Hero. | Khóa `pixelArt: true`, `antialias: false`, `mipmapFilter: 'NEAREST'`, logical viewport `640×360` integer zoom; mọi sprite tuân thủ `1:1` mật độ pixel gốc, cấm xoay texture mượt trên sprite nhân vật. |
| **3** | **Animation State Stuck (Kẹt mãi ở dáng chém/né/trúng đòn không thoát được)** | Sự kiện `animationcomplete` bị bỏ lỡ khi chuyển state nhanh, mất gói mạng hoặc frame cuối bị gián đoạn. | **`AnimationStuckWatchdog`**: Mọi state không lặp đều đăng ký `maxDurationMs = sum(frameDurations) + 150ms`. Vòng lặp 60 FPS kiểm tra elapsed time mỗi frame; quá ngưỡng tự động ép về `idle_<dir>` hoặc `walk_<dir>` theo velocity hiện tại + ghi debug telemetry. |
| **4** | **Texture Bleeding Giữa Các Frame Trong Sprite Sheet** | Đặt các frame `48×64` sát nhau `0px` làm WebGL rò rỉ 1px từ frame bên cạnh (đầu kiếm hoặc bóng chân thò sang khung kế). | Mọi sprite atlas xuất qua packer bắt buộc `shapePadding: 2px`, `borderPadding: 2px`, `allowRotation: false`, kích thước trang POT `<= 2048×2048`. |
| **5** | **Y-Sort Clipping / Depth Popping (Nhân vật xuyên qua cây, mái nhà che kín nhân vật)** | Sắp xếp theo tâm sprite (`origin 0.5, 0.5`) thay vì gót chân, hoặc đặt Boss Telegraph chung lớp với Entity. | Dùng **4-Box Spatial Contract**: điểm neo gốc luôn là **`footY` (`pivotY = 0.875` cho `48×64`, `0.85` cho Boss)**; `depth = 1000 + Math.round(footY)`; mái nhà/tán cây nằm ở `Depth 101000` tự giảm `alpha = 0.55` khi overlap player; Telegraph khóa cứng `Depth 180–199` + `Telegraph Rim Echo 109500`. |
| **6** | **Missing Frame / Green Box Crash (Ô vuông xanh/đen khi thiếu 1 khóa hoạt ảnh)** | Đổi tên skill hoặc thêm quái mới nhưng quên vẽ 1 hướng/1 trạng thái, gây crash `Cannot read properties of undefined` lúc gọi `sprite.play(key)`. | 2 lớp bảo vệ: (a) **Build-Time & Boot-Time Gate** (`validate-animation-pipeline.mjs`) đối chiếu 100% `game-data/*.json` ↔ `asset-manifest.md` ↔ atlas JSON; (b) **Runtime Safe Fallback** trong `PixelAnimationRegistry` tự hạ cấp `missing_state_<dir>` → `idle_<dir>` → sprite placeholder `48×64` rõ ràng thay vì sập game. |
| **7** | **Nhảy Vị trí / Giật Chân Khi Đổi Kích thước Khung (48×64 sang 96×96 Ultimate)** | Đòn đánh rộng vung kiếm vượt `48×64` bị cắt cụt mũi kiếm hoặc làm lệch tâm nhân vật khi chuyển frame. | Dùng **Consistent Foot Pivot Anchoring** trong Phaser Atlas JSON (`pivot: { x, y }` quy chiếu đúng về vị trí bàn chân) hoặc chuẩn hóa frame rộng có khoảng trống trong suốt được trim kèm `spriteSourceSize` giữ nguyên tâm chân `0px` dịch chuyển! |

---

## 3. Chiến lược Đóng gói & Phân phát Asset Pixel 2D qua Local MinIO

1. **Cấu trúc đường dẫn phiên bản hóa trong bucket `eldoria-assets`**:
   - `v1/manifest.json` (chứa danh sách toàn bộ gói atlas/map/audio + `sha256` + `sizeBytes` + `loadingGroup`)
   - `v1/atlases/heroes/<heroId>.png` & `.json`
   - `v1/atlases/monsters/<packId>.png` & `.json`
   - `v1/atlases/bosses/<bossId>.png` & `.json`
   - `v1/atlases/vfx/<vfxPack>.png` & `.json`
   - `v1/tilesets/<regionId>_extruded.png` & `v1/maps/<regionId>.tmj`
   - `v1/audio/<category>/<track>.ogg`
   - `v1/fonts/<fontName>.woff2`
2. **CORS & Caching Cục bộ**:
   - Container `minio-init` dùng `mc` cấu hình bucket `eldoria-assets` là `download` (public read-only), bật CORS cho origin cục bộ (`http://localhost:5173`, `http://localhost:3000`, LAN origin cấu hình trong `.env`), và đặt header `Cache-Control: public, max-age=31536000, immutable` cho mọi đường dẫn có hash/version prefix (`v1/...`) — ngoại trừ `manifest.json` (`no-cache`).
3. **Offline Fallback Khi Chạy Dev Không Docker (Zero-Docker Dev Mode)**:
   - Biến môi trường `ASSET_STORAGE_MODE=minio|local_fs` cho phép chạy full Docker (`minio`, mặc định khuyến nghị) hoặc fallback về phục vụ trực tiếp từ thư mục `./assets/` nếu đang test unit không khởi động Docker.
