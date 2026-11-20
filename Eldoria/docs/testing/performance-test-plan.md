# Performance & Load Test Plan — Eldoria: Forgotten Wilds

**Trạng thái**: Design Baseline v1.0 (`PROPOSED / UNVERIFIED` — Chưa chạy đo tải trên production server)  
**Cập nhật lần cuối**: 2026-11-19  
**Ràng buộc Hiến pháp**: Nguyên tắc I (JSON-Only Local DB), Nguyên tắc VIII (Tách biệt rõ giả thuyết với kết quả đo thực tế)

---

## 1. Mục tiêu Kiểm thử Hiệu năng

Kiểm chứng trung thực khả năng chịu tải của kiến trúc **NestJS Modular Monolith + 20 Hz Simulation Loop + 100% Local JSON Database (`data/db/`)** qua 4 mốc người chơi đồng thời (**20, 50, 100 và 500 CCU**), tìm ra chính xác điểm nghẽn CPU, RAM, băng thông WebSocket và độ trễ `fsync` đĩa cứng.

---

## 2. Cấu hình Tham chiếu (Reference Test Environments)

| Thành phần | Cấu hình Tham chiếu | Ghi chú |
| :--- | :--- | :--- |
| **Game Server Host** | 4 vCPU (x64), 8 GB RAM, NVMe SSD cục bộ, Node.js 22 LTS | Chạy đơn nút không dịch vụ ngoài |
| **Client Reference Machine** | CPU tầm trung (Intel i5 / Ryzen 5), iGPU, 8 GB RAM, Chrome/Edge mới nhất, màn hình `1920x1080` | Đo FPS, frame time p99 và WebGL draw calls |
| **Load Generator** | Custom Node.js WebSocket + HTTP Bot Harness chạy cục bộ (`tools/load-test/` ở giai đoạn implementation) | Mỗi bot mô phỏng đầy đủ `MOVE_INPUT` 20 Hz, đánh quái, chế tạo, quay Gacha, chat |

---

## 3. Lộ trình 4 Mốc Load Test & Ngưỡng Đạt Mục tiêu (`proposed / unverified`)

| Mốc tải | Phân bổ Kịch bản Bot (30 phút/mốc) | Tick 20 Hz (p99) | JSON WAL Commit (p95) | WS RTT nội bộ (p95) | RAM Heap Server | Trạng thái |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| **20 CCU** | 6 Village/Farm, 10 Forest Combat, 1 Party (4) Boss Raid | `< 12 ms` (`proposed`) | `< 8 ms` (`proposed`) | `< 40 ms` (`proposed`) | `< 256 MB` | `unverified` |
| **50 CCU (MVP Target)** | 15 Village/Farm, 23 Forest, 3 Parties (12) Boss Raid | `< 25 ms` (`proposed`) | `< 15 ms` (`proposed`) | `< 60 ms` (`proposed`) | `< 512 MB` | `unverified` |
| **100 CCU** | 30 Village/Farm, 46 Open World, 6 Parties (24) Boss Raid | `< 35 ms` (`proposed`) | `< 25 ms` (`proposed`) | `< 90 ms` (`proposed`) | `< 900 MB` | `unverified` |
| **500 CCU (Stress Ceiling)** | 150 Village/Homestead, 230 Open World, 30 Parties (120) Dungeon | Đo thực tế điểm gãy (`target < 50 ms`) | Đo giới hạn `fsync` NVMe (`target < 50 ms`) | `< 150 ms` | `< 1.8 GB` | `unverified` |

---

## 4. Các Bài Test Đặc thù cho `JsonDatabaseEngine`

1. **Bão ghi Kinh tế (Economic Write Storm)**: 50 bot đồng thời bấm cường hóa vũ khí + quay gacha 10x liên tiếp trong 60 giây → đo độ trễ `AsyncLockManager`, tốc độ `fsync` của `currency-ledger` và kích thước hàng đợi WAL.
2. **Checkpoint Flush Spike Test**: 100 bot đang di chuyển liên tục; tại mốc `t = 30s`, `CheckpointFlusher` ghi đồng thời 100 tệp `characters/*.json` → kiểm tra xem Event Loop Lag có vượt `15 ms` làm trễ tick 20 Hz hay không (phương án giảm thiểu: rải đều `staggered flush` theo hash ID trong cửa sổ 30s thay vì ghi dồn tại 1 giây!).
3. **Soak Test 8 Giờ (Memory Leak & Disk Growth)**: Chạy liên tục 50 bot trong 8 giờ → kiểm tra đồ thị Heap RAM không tăng tuyến tính, số file descriptor không rò rỉ, tốc độ xoay vòng `data/backups/` không làm khựng tick chiến đấu.
4. **Crowd Gathering Test (Thử nghiệm Spatial Grid)**: Dồn toàn bộ 50 bot vào cùng quảng trường `zon_greenhaven_square` trong phạm vi `5x5` ô → đo băng thông snapshot `10 Hz` và FPS trên trình duyệt thật.

---

## 5. Bài Test Chịu lỗi Mạng (Network Impairment Scenarios)

- **Profile A (Good Home Wifi)**: Latency `40 ms`, Jitter `±10 ms`, Packet Loss `0%`.
- **Profile B (Mobile 4G / Weak Wifi)**: Latency `140 ms`, Jitter `±40 ms`, Packet Loss `2%`.
- **Profile C (Severe Spike & Drop)**: Latency `300 ms`, Packet Loss `5%`, ngắt kết nối hẳn `15 giây` giữa trận Boss rồi nối lại.
- **Tiêu chí đạt**: Không crash client, không nhân bản đồ/tiền, Boss Telegraph vẫn đọc được và `SESSION_RESUME` thành công 100% trong cửa sổ `120 giây`.
