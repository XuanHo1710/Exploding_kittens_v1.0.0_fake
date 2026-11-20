# QA & Test Strategy — Eldoria: Forgotten Wilds

**Trạng thái**: Design Baseline v1.0 (`DESIGN_AND_PLANNING_ONLY` — Chưa chạy production tests)  
**Cập nhật lần cuối**: 2026-11-19  
**Tham chiếu**: [Constitution Nguyên tắc VIII](../../.specify/memory/constitution.md), [JSON DB Design](../architecture/database-design.md)

---

## 1. Phạm vi & Cam kết Trung thực Kiểm thử

> **LƯU Ý BẮT BUỘC**: Dự án đang ở giai đoạn **`DESIGN_AND_PLANNING_ONLY`**. Toàn bộ chiến lược, kịch bản và tiêu chí nghiệm thu trong thư mục `docs/testing/` được thiết kế sẵn để phục vụ đội lập trình và QA khi chuyển sang `IMPLEMENTATION MODE`. **KHÔNG có bất kỳ bài kiểm thử production nào được đánh dấu `PASSED` trong giai đoạn này.** Duy nhất các công cụ kiểm chứng dữ liệu JSON và mô phỏng cân bằng thiết kế (`tools/design-validation/`) được chạy thực tế và ghi tách biệt tại [`docs/balancing/simulation-results.md`](../balancing/simulation-results.md).

---

## 2. Kim tự tháp Kiểm thử 13 Lớp (Theo Mục 22)

| Lớp kiểm thử | Công cụ Tự chủ (Zero Third-Party) | Phạm vi Trọng tâm | Cổng CI/CD (Khi vào Implementation) |
| :--- | :--- | :--- | :---: |
| **1. Unit Testing** | Vitest / Jest | Công thức sát thương, EXP, phòng thủ, crit, CDR cap, bảng Gacha Pity, tính tiến trình offline crop/animal, JSON schema validator | Bắt buộc PASS 100%, coverage logic lõi >= 85% |
| **2. Integration Testing** | Jest + `JsonDatabaseEngine` trên `tmp` dir | WAL 2-phase commit, Crash Recovery sau giả lập kill giữa chừng, `AsyncLockManager` lock ordering, Index rebuild, Backup & Restore | Bắt buộc PASS 100% |
| **3. API Testing** | Supertest + Jest | Toàn bộ REST endpoints `/api/v1/*`, xác thực JWT/Refresh rotation, `X-Idempotency-Key`, Ownership Guard, mã lỗi chuẩn | Bắt buộc PASS 100% |
| **4. WebSocket Testing** | Socket.IO / `ws` Test Client | Handshake Auth, 20 Hz tick movement & collision, Skill cast validation, Delta Snapshot, Disconnect/Reconnect 120s, Party/Chat | Bắt buộc PASS 100% |
| **5. End-to-End (E2E) Testing** | Playwright (Local Browser) | Luồng vertical slice: Register → Create Char → Move → Farm → Craft → Enhance +10 → Gacha → Party Boss Raid → Reconnect | Chạy trên mỗi Release Candidate |
| **6. Gameplay Simulation** | Headless Node.js Sim Runner | Kiểm tra Boss 3 phase, AI 10 trạng thái, kẹt địa hình (stuck detection), cân bằng TTK giữa các class | Chạy hàng đêm (Nightly) |
| **7. Economy Simulation** | Node.js Monte Carlo (`tools/design-validation/`) | Kiểm chứng 100.000 lượt Gacha, chuỗi nâng cấp +1..+10 cho Casual/Regular/Hardcore, cân đối Faucet vs Sink 30 ngày | Chạy mỗi khi thay đổi `game-data/*.json` |
| **8. Concurrency Testing** | Jest Parallel Promise Stress | 50 request đồng thời cường hóa/quay Gacha/rút kho cùng 1 nhân vật → xác minh 0 item dupe, 0 số dư âm, đúng 1 giao dịch thành công hoặc tuần tự chính xác | Bắt buộc PASS trên mọi PR động chạm kinh tế |
| **9. Network Impairment Testing** | Local Proxy / Artificial Delay Injector | Giả lập ping 150ms/300ms, jitter ±60ms, packet loss 3–5%, rớt mạng đột ngột giữa trận Boss | Trước mỗi Milestone |
| **10. Security Testing** | Automated Security Test Suite | Path traversal JSON, Prototype pollution, Speed/Teleport hack, Fake damage packet, Cooldown bypass, Replay attack, Token reuse | Trước mỗi Milestone |
| **11. Load Testing** | Custom Node.js WS Bot Swarm (cục bộ) | Mốc 20 → 50 → 100 → 500 concurrent bots; đo tick p99, JSON `fsync` latency p95, RAM heap, băng thông | Bắt buộc đo trước khi tuyên bố capacity |
| **12. Visual Regression Testing** | Playwright Screenshot Diff | So sánh pixel screenshot 24 màn hình UI ở `1280x720`, `1920x1080`, `1024x768`, kiểm tra `image-rendering: pixelated` không mờ | Chạy trên PR thay đổi UI |
| **13. Responsive UI Testing** | Playwright Multi-Viewport | Kiểm tra không chồng chéo HUD, không tràn chữ tiếng Việt, modal cuộn mượt, keyboard navigation + Focus ring | Chạy trên PR thay đổi UI |

---

## 3. Quy chuẩn 6 Nhóm Kịch bản Bắt buộc cho Mọi Module

Mỗi module trong 21 NestJS module và 12 Spec Kit feature PHẢI có đủ 6 nhóm test case:
1. **Happy Path**: Luồng chuẩn hoạt động đúng dữ liệu và sinh đúng bản ghi JSON/Ledger.
2. **Edge Cases**: Biên giới (cấp `+10` không lên `+11`, túi đầy 40/40 ô, HP = 1, stamina = 0, offline 72h bị cắt trần đúng 24h, mùa sai không trồng được).
3. **Invalid Input**: Số lượng âm, chuỗi quá dài, ký tự path traversal (`../`), enum không tồn tại, `idempotencyKey` rỗng.
4. **Authorization Test**: Tài khoản A cố thao tác trên nhân vật/vũ khí/nhà/party của tài khoản B → phải trả `403 ERR_FORBIDDEN_OWNERSHIP`.
5. **Concurrent-Operation Test**: Gửi đồng thời nhiều lệnh trừ tiền/vật phẩm/quay gacha → kiểm tra không race condition trên `JsonDatabaseEngine`.
6. **Failure Recovery Test**: Giả lập lỗi ổ đĩa/sập tiến trình giữa bước ghi WAL `PREPARED` và rename đích → khởi động lại xác minh phục hồi nhất quán 100%, không mất dữ liệu hay corrupt JSON.

---

## 4. Quy trình Kiểm toán UI/UX Tự động (UI/UX Audit Protocol)

Khi có bản dựng thực tế hoặc prototype HTML mockup chạy được trên trình duyệt:
1. Khởi chạy **Playwright Browser Automation** cục bộ trên tối thiểu 3 viewport: `1920x1080` (Desktop FHD), `1280x720` (Desktop HD), `1024x768` (Compact Desktop).
2. Chụp ảnh màn hình (`.png`) cho từng màn hình và từng trạng thái (`default`, `loading`, `empty`, `error`, `disconnected`, `hover`, `focus`). **TUYỆT ĐỐI KHÔNG** tạo bằng chứng ảnh giả cho bản dựng chưa chạy.
3. Đánh dấu khoanh vùng lỗi (bounding box / annotation) đối với bất kỳ lỗi tràn chữ tiếng Việt, vỡ lưới pixel, thiếu tương phản (WCAG AA < 4.5:1) hoặc nút bấm che khuất vùng combat.
4. Phân loại mức độ nghiêm trọng:
   - **`P0 (Blocker)`**: Treo màn hình, mất dữ liệu hiển thị, không tương tác được nút chính, Boss Telegraph bị che khuất.
   - **`P1 (Critical)`**: Lệch nút trên 1280x720, mất thông tin xác suất Gacha hoặc chi phí cường hóa, kẹt focus bàn phím.
   - **`P2 (Major)`**: Tràn dòng nhẹ, lệch căn pixel 1–2px, thiếu tooltip/empty state.
   - **`P3 (Minor)`**: Tinh chỉnh khoảng cách, màu sắc phụ.
5. Xuất báo cáo kiểm toán bằng **tiếng Việt**, bắt buộc có: Mã lỗi, Viewport, Đường dẫn ảnh thực tế, **Expected Behavior**, **Actual Behavior** và bước tái hiện.
