# Quickstart Verification Guide: Local Docker Redis/MinIO & Glitch-Free 2D Pixel Multi-Animation Pipeline

**Feature**: `013-local-infra-pixel-animation`  
**Mode**: Design Verification (`DESIGN_AND_PLANNING_ONLY`) + Future Implementation Smoke Runbook

---

## 1. Kiểm chứng Thiết kế Ngay lập tức (Không cần Docker / Chạy được Ngay Bây giờ)

1. **Kiểm chứng toàn vẹn Catalog & Pipeline Hoạt ảnh 2D**:
   ```powershell
   node tools/design-validation/validate-catalog.mjs
   node tools/design-validation/validate-animation-pipeline.mjs
   node tools/design-validation/audit-workspace.mjs
   ```
   - Kỳ vọng: Cả 3 script trả về `PASS` (`0 errors`, `0 P0`, `0 P1`, `0` vi phạm Hiến pháp v2.0.0).
2. **Kiểm tra Trực quan Bộ Hoạt ảnh 2D Không Lỗi Ngoại tuyến**:
   - Mở tệp [`docs/ui-ux/mockups/pixel-animation-showcase.html`](../../docs/ui-ux/mockups/pixel-animation-showcase.html) trực tiếp trong trình duyệt (0 CDN ngoài).
   - Bấm đổi giữa 3 Anh hùng MVP (`Kael`, `Lyra`, `Seraphina`), Quái `Moss Slime` và Boss `Thornback Elder`; thử chuyển đủ các trạng thái (`Idle`, `Walk`, `Run`, `Attack 3-Combo`, `Crimson Crescent Ultimate`, `Dodge`, `Hit`, `Death`, `Mining`, `Farming`, `Fishing`) theo 4 hướng.
   - Bật các lớp kiểm tra chống lỗi: **4-Box Spatial Overlay**, **Pivot Crosshair**, **32×32 Tile Grid**, **Y-Sort Live Walk Test** (đi vòng sau cây/trụ đá) và **Atlas Extrude 1px / Padding 2px Inspector** để xác nhận độ sắc nét pixel và không có lỗi kẹt trạng thái.

---

## 2. Kịch bản Nghiệm thu Khi Bước vào `IMPLEMENTATION MODE` (Local Docker Compose)

1. **Khởi chạy toàn stack cục bộ 1 lệnh** (không cần Internet/Cloud ngoài):
   ```powershell
   docker compose up -d --build
   ```
   - Xác minh trong `< 60s`: `redis` (`PONG`), `minio` (`/minio/health/live`), `minio-init` (exit `0`, đã tạo `eldoria-assets` & `eldoria-backups`), `eldoria-server` (`GET http://localhost:3000/api/v1/health` → `200 OK`, cả 4 thành phần `UP`).
2. **Kiểm thử Bất biến Zero-Data-Loss Khi Redis Khởi động lại (`SC-005`)**:
   - Thực hiện 50 giao dịch kho đồ/cường hóa/gacha liên tiếp → chạy `docker compose exec redis redis-cli FLUSHALL` và `docker compose restart redis`.
   - Tải lại nhân vật và gọi `verify-json-db` → xác nhận **100%** vật phẩm, tiền tệ và lịch sử trong `data/db/**/*.json` còn nguyên vẹn (`0%` mất/nhân bản) và server tự hồi kết nối Redis sạch sẽ.
3. **Kiểm thử Chống Lỗi Hoạt ảnh 2D & Tải Tài nguyên MinIO (`SC-002`, `SC-003`, `SC-004`)**:
   - Kiểm tra trình duyệt tải toàn bộ sprite atlas & extruded tileset từ `http://localhost:9000/eldoria-assets/v1/...` (0 lỗi 404/CORS).
   - Chạy bài stress test Playwright `1,000` chuyển trạng thái hoạt ảnh liên tiếp + chụp màn hình 3 độ phân giải (`1280×720`, `1920×1080`, `2560×1440`) xác nhận `0` tile seam bleed, `0` sub-pixel blur, `0` stuck state và Boss Telegraph `#FF3B3B` luôn nhìn rõ.
4. **Kiểm thử Khôi phục Backup JSON từ MinIO `eldoria-backups` (`SC-006`)**:
   - Kích hoạt `POST /internal/backup` → kiểm tra snapshot xuất hiện trong bucket `eldoria-backups` kèm `backup-manifest.json` đúng `archiveSha256` → khôi phục sang thư mục kiểm thử trong `< 5 phút`.
