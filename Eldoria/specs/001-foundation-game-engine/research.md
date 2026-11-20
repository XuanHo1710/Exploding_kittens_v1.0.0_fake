# Phase 0 Research: Foundation, JSON-Only Database Engine & Game Loop Shell

**Feature**: `001-foundation-game-engine`  
**Date**: 2026-11-19

---

## 1. Atomic File Replacement trên Windows (NTFS) & Linux (ext4) cho `JsonDatabaseEngine`

- **Decision**: Thực hiện ghi tệp nguyên tử 3 pha: ghi tệp tạm cùng thư mục `<target>.json.tmp.<txId>` → `fileHandle.sync()` (`fsync`) → `fs.promises.rename(tmpPath, targetPath)`. Trên Windows NTFS, thêm lớp retry nhỏ có backoff (`3 lần`, `10–30 ms`) chỉ cho mã lỗi hệ điều hành `EPERM`/`EBUSY` (do Windows Defender/indexer tạm giữ handle file trong vài mili-giây) trong khi vẫn giữ giữ nguyên khóa `AsyncLockManager`.
- **Rationale**: `rename` trên cùng volume là nguyên tử ở mức hệ thống tệp; retry ngắn xử lý đặc thù NTFS mà không làm mất tính nguyên tử vì khóa aggregate đảm bảo chỉ có 1 writer duy nhất cho tệp đó.
- **Alternatives considered**: Ghi trực tiếp `fs.writeFile` vào tệp đích (bị từ chối vì sẽ gây tệp bị cắt cụt/hỏng JSON nếu mất điện giữa chừng); dùng SQLite (bị cấm tuyệt đối theo Nguyên tắc I của Hiến pháp).

## 2. Giao dịch Đa Tệp bằng JSON Write-Ahead Log (WAL) & Khôi phục Sau Sự cố

- **Decision**: Mọi giao dịch động chạm `>= 2` tệp JSON ghi trước 1 tệp `data/db/wal/tx-<txId>.json` chứa `{ txId, idempotencyKey, status: "PREPARED", checksumSha256, operations: [{ targetPath, expectedRevision, afterEnvelope }] }`, `fsync` tệp WAL, áp dụng atomic write lần lượt cho từng tệp đích, cập nhật WAL thành `COMMITTED`, cập nhật cache/index rồi xóa tệp WAL. Khi boot, `CrashRecoveryService` kiểm tra checksum WAL: nếu hợp lệ và ở trạng thái `PREPARED` thì thực hiện roll-forward (idempotent do ghi toàn bộ `afterEnvelope`), nếu WAL bị cắt cụt thì xóa WAL an toàn.
- **Rationale**: Thiết kế Roll-Forward bằng toàn bộ ảnh đích (`afterEnvelope`) đảm bảo tính lũy đẳng (idempotent): ngay cả khi máy chủ sập tiếp giữa quá trình recovery, chạy lại recovery lần nữa vẫn ra cùng trạng thái chính xác 100%.
- **Alternatives considered**: Undo-log lưu diff JSON (phức tạp hơn, dễ lỗi khi áp dụng một phần); bỏ WAL và ghi tuần tự từng tệp (bị từ chối vì có thể trừ tiền mà không cộng vật phẩm khi crash).

## 3. Chiến lược Tránh Nghẽn Event Loop Khi Flush 30 Giây (`Staggered Dirty Flusher`)

- **Decision**: Thay vì ghi đồng loạt toàn bộ nhân vật dirty vào đúng giây thứ 30 (gây spike `fsync` ảnh hưởng tick 20 Hz), gán cho mỗi nhân vật một `flushOffsetMs = hash(characterId) % 30000` để rải đều thao tác flush nền trong suốt cửa sổ 30 giây, giới hạn đồng thời tối đa `4` concurrent background flushes.
- **Rationale**: Làm phẳng tải I/O ổ đĩa, giữ Event Loop lag thấp cho vòng lặp mô phỏng 20 Hz.
- **Alternatives considered**: Ghi JSON theo từng tick 20 Hz (vi phạm Nguyên tắc IV); chỉ ghi khi thoát game (rủi ro mất nhiều giờ chơi nếu crash).

## 4. Cầu nối Phaser 3 (60 FPS) ↔ React/Zustand & Logical Viewport `640x360`

- **Decision**: Sử dụng Phaser 3 với cấu hình `width: 640`, `height: 360`, `pixelArt: true`, `roundPixels: true`, `antialias: false`, scale mode `Phaser.Scale.FIT` kết hợp bộ tính integer zoom trong CSS container. Tách hoàn toàn trạng thái thế giới 60 FPS vào `WorldStateBuffer` thuần TypeScript bên trong Phaser và giao tiếp với Zustand thông qua `GameUiBridge` (typed EventEmitter).
- **Rationale**: Đáp ứng đồng thời yêu cầu pixel-perfect 16-bit (Nguyên tắc V) và cấm cập nhật world state vào React mỗi frame (Nguyên tắc IV).
- **Alternatives considered**: Vẽ toàn bộ UI bằng Phaser (kém hỗ trợ tiếng Việt IME, accessibility, responsive); dùng React canvas wrapper render từng entity (sụt FPS nghiêm trọng).

## 5. Công cụ Kiểm chứng Lược đồ JSON (`game-data/*.json` & `data/db/`)

- **Decision**: Dùng **Zod** trong `packages/game-config` và `packages/shared` để vừa sinh kiểu TypeScript tĩnh vừa kiểm chứng runtime cho cả 12 tệp catalog `game-data/*.json`, các tệp `data/db/**/*.json` và payload REST/WebSocket.
- **Rationale**: Một nguồn định nghĩa schema duy nhất cho compile-time và runtime, không sinh mã ngoài phức tạp, zero third-party network call.
- **Alternatives considered**: Ajv + JSON Schema riêng (phải duy trì song song interface TypeScript và JSON schema dễ lệch nhau).
