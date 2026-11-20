# Quickstart Validation Guide: Foundation, JSON-Only Database Engine & Game Loop Shell

**Feature**: `001-foundation-game-engine`  
**Mode Note**: Đây là hướng dẫn kiểm chứng dành cho giai đoạn triển khai (`IMPLEMENTATION MODE`), không chạy trên mã nguồn production chưa tồn tại.

---

## 1. Prerequisites
- Node.js 22 LTS (không cần cài PostgreSQL, Redis, Docker hay tạo tài khoản đám mây).
- Ổ đĩa cục bộ có tối thiểu 1 GB trống cho `data/db/` và `data/backups/`.
- Toàn bộ 12 tệp chuẩn hiện diện trong `game-data/*.json`.

---

## 2. End-to-End Validation Scenarios (Khi đã Triển khai)

1. **Khởi động Zero-Infrastructure**:
   - Chạy lệnh khởi động monorepo server (`apps/game-server`) trỏ `DATA_DB_DIR=./data/db-smoke`.
   - Kỳ vọng: Tự sinh `schema-manifest.json`, thư mục `indexes/`, `wal/`, nạp đủ 12 tệp `game-data/*.json` trong `< 2s`, trả `200 OK` tại `GET /api/v1/health` với `storageMode: "LOCAL_JSON"`.
2. **Kiểm chứng Fail-Fast Catalog**:
   - Tạo bản sao tạm `game-data` có 1 `itemId` không tồn tại trong `recipes.json` và khởi chạy bộ nạp.
   - Kỳ vọng: Server từ chối boot với exit code khác 0 và thông báo rõ tên tệp + ID lỗi.
3. **Kiểm chứng WAL Crash Recovery & Concurrency**:
   - Chạy bộ integration test mô phỏng 50 transaction song song trên cùng cặp khóa `["character:test1", "inventory:test1"]` và 100 kịch bản kill tiến trình sau pha `WAL PREPARED`.
   - Kỳ vọng: `0` deadlock, `0` corrupt JSON, `100%` checksum hợp lệ sau boot recovery, replay cùng `idempotencyKey` trả đúng `responseSnapshot` cũ.
4. **Kiểm chứng Pixel Shell & Decoupled Loop**:
   - Mở `apps/client` trên trình duyệt ở `1280x720` và `1920x1080`.
   - Kỳ vọng: Canvas logic `640x360` scale sắc nét (`image-rendering: pixelated`), `SimulationLoop` chạy 20 Hz mà không sinh lượt ghi đĩa theo tick, React HUD chỉ render lại khi nhận sự kiện đổi giá trị qua `GameUiBridge`.
5. **Kiểm chứng Tắt An toàn & Sao lưu Cục bộ**:
   - Gửi `SIGINT` khi có dữ liệu dirty đang chờ flush → xác nhận tệp JSON đích được flush đủ revision mới trước khi tiến trình thoát và bản chụp `data/backups/<backupId>/backup-manifest.json` vượt qua kiểm tra `verifyIntegrity()`.

---

## 3. Tham chiếu
- Kiến trúc JSON DB chi tiết: [`docs/architecture/database-design.md`](../../docs/architecture/database-design.md)
- Lược đồ dữ liệu & ràng buộc trường: [`data-model.md`](./data-model.md)
- Hợp đồng giao diện: [`contracts/json-db-and-health-contract.md`](./contracts/json-db-and-health-contract.md)
