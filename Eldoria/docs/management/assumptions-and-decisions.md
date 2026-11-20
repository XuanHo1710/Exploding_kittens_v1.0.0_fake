# Assumptions, Design Decisions & Unverified Hypotheses Log

**Trạng thái**: Sống (cập nhật xuyên suốt các phase)  
**Cập nhật lần cuối**: 2026-11-19

---

## 1. Quyết định Tối thượng do Chủ dự án Chỉ định (Mandated Overrides)

| ID | Quyết định | Nguồn | Tác động & Ràng buộc |
| :--- | :--- | :--- | :--- |
| **DEC-001** | **TUYỆT ĐỐI KHÔNG dùng database truyền thống hay dịch vụ đám mây bên thứ 3; dùng 100% file JSON làm Database bền vững chính** | Chỉ thị trực tiếp của người dùng (2026-11-19) | Thay thế hoàn toàn PostgreSQL, TypeORM, SQLite, MongoDB và mọi Cloud SaaS bằng `JsonDatabaseEngine` cục bộ (`data/db/**/*.json`). Được hiến định là Nguyên tắc I (NON-NEGOTIABLE) trong `.specify/memory/constitution.md`. |
| **DEC-002** | **Chế độ DESIGN_AND_PLANNING_ONLY** | `AGENTS.md` & `GAME_DESIGN_BRIEF.md` | Không viết mã nguồn production trong `apps/*` hay `packages/*`; không chạy `/speckit-implement` hay `/speckit-converge`. Cho phép viết công cụ kiểm chứng/mô phỏng thiết kế (`tools/design-validation/`), mockup HTML/SVG tĩnh/tương tác và dữ liệu JSON mẫu (`game-data/*.json`). |
| **DEC-003** | **Cho phép Local Docker Redis + Local Docker MinIO (S3-compatible) song song JSON Primary DB & Pipeline Hoạt ảnh 2D Pixel Không Lỗi** | Chỉ thị bổ sung của người dùng (2026-11-19 — Constitution `v2.0.0` & `ADR-007`) | Cho phép chạy **Local Redis** (chỉ lưu ephemeral cache/presence/rate-limit/pub-sub, 0 dữ liệu bền vững độc quyền) và **Local MinIO S3-compatible** (bucket `eldoria-assets` cho sprite/atlas/map/audio và `eldoria-backups` cho backup JSON) trong Local Docker Compose; đặc tả trọn bộ pipeline hoạt ảnh 2D không lỗi tại `specs/013-local-infra-pixel-animation` & `docs/ui-ux/mockups/pixel-animation-showcase.html`. |
| **DEC-004** | **Chốt Chuẩn Pixel `Q1-A`, Phạm vi E2E Toàn Phần `Q2-C` & Phê duyệt Chuyển sang `IMPLEMENTATION MODE` (`Q3-1&2`)** | Phê duyệt trực tiếp của chủ dự án (2026-11-19) | (1) `Q1-A`: Giữ `32×32` tile / `48×64` hero / `128..256` boss + dùng **`16×16`** cho VFX hạt, đạn đạo nhỏ, icon động & hiệu ứng môi trường (0 mixel); (2) `Q2-C`: Triển khai đủ 13 specs + 24/24 màn hình theo 2 đợt checkpoint (Run 1 6–8h Core E2E + toàn bộ PNG 4 hướng/ra chiêu/VFX/`16×16`; Run 2 24/24 màn hình & QA đầy đủ); (3) Chính thức mở khóa `IMPLEMENTATION MODE` sau khi hoàn tất `/speckit-tasks`. |

---

## 2. Giả định & Quyết định Thiết kế Tự vận hành Có thể Đảo ngược (Proposed Autonomous Decisions)

*Lưu ý minh bạch*: Các quyết định dưới đây được đội ngũ thiết kế tự vận hành lựa chọn hợp lý dựa trên chuẩn công nghiệp để tránh tắc nghẽn; **CHƯA được xem là phê duyệt cuối cùng của người dùng** và có thể điều chỉnh trước khi bước sang `IMPLEMENTATION MODE`.

| ID | Hạng mục | Phương án Đề xuất | Lý do lựa chọn | Khả năng đảo ngược |
| :--- | :--- | :--- | :--- | :---: |
| **ASM-001** | **Kiến trúc lưu trữ JSON** | Phân mảnh theo aggregate (`accounts/<id>.json`, `characters/<id>.json`, `inventories/<id>.json`, `houses/<id>.json`, `world/<regionId>.json`) kèm `wal/tx-journal.json` và `indexes/*.json` | Tránh tệp JSON đơn lẻ phình to gây nghẽn `JSON.parse`/`JSON.stringify` và giảm lock contention giữa các người chơi | Cao (trước khi có dữ liệu live) |
| **ASM-002** | **Cơ chế khóa & nguyên tử trên JSON DB** | Per-aggregate async mutex trong tiến trình NestJS + ghi tệp tạm `.tmp` → `fsync` → `fs.rename` (atomic POSIX/NTFS) + WAL hai pha cho giao dịch đa tệp | Ngăn lỗi corrupt file khi sập điện/crash và chống race condition (double spending, concurrent gacha, item duplication) mà không cần DBMS ngoài | Trung bình |
| **ASM-003** | **Chính sách Flush dữ liệu Realtime** | Giao dịch kinh tế/kho đồ/gacha/cường hóa: flush tức thì kèm WAL. Vị trí nhân vật & HP/MP: giữ trong RAM theo tick 20 Hz, flush định kỳ mỗi 30 giây (dirty flag) + khi chuyển vùng/ngắt kết nối/shutdown | Đáp ứng nguyên tắc không ghi đĩa theo tick 20 Hz, bảo vệ ổ cứng và giữ độ trễ server ổn định | Cao |
| **ASM-004** | **Giao thức Realtime** | WebSocket chuẩn (Socket.IO hoặc `ws` thuần gói trong adapter NestJS) với payload JSON có schema version & nén delta cho snapshot | Thống nhất TypeScript full-stack, hỗ trợ reconnect, heartbeat và dễ debug trong MVP; có thể chuyển sang binary pack ở M3+ nếu cần | Cao |
| **ASM-005** | **Môi trường phát triển / ngôn ngữ kiểm chứng** | Phát hiện môi trường hiện tại có **Node.js v22.20.0** (không cài Python) → dùng Node.js `.mjs` cho toàn bộ script mô phỏng cân bằng và kiểm chứng cross-reference `tools/design-validation/` | Chạy thực tế được ngay trong workspace mà không cần cài thêm phần mềm bên ngoài | Cao |
| **ASM-006** | **Ngôn ngữ & Tỷ lệ khung hình Client** | Logical viewport `640x360 px` (tỉ lệ 16:9, khớp integer scaling 2x=`1280x720`, 3x=`1920x1080`, 4x=`2560x1440`) với base tile `32x32 px` (hiển thị 20×11.25 tile) | Đảm bảo pixel-perfect 100% trên mọi màn hình 720p/1080p/1440p/4K phổ biến | Cao |
| **ASM-007** | **Nhịp thời gian trong game** | 1 ngày trong game = 24 phút thời gian thực (14 phút ban ngày, 3 phút hoàng hôn, 6 phút ban đêm, 1 phút bình minh); 1 mùa = 14 ngày trong game | Đủ dài để đi 1 vòng nông trại + 1 lượt dungeon trong ngày mà không quá gấp gáp trong môi trường online | Cao |
| **ASM-008** | **Giới hạn Offline Progression** | Nông trại và chăn nuôi tính theo server timestamp khi quay lại, tối đa tích lũy **24 giờ offline** (cây cần tưới tự động/mưa mới qua giai đoạn thiếu nước; động vật dừng sản xuất nếu đói quá 24h nhưng không chết vĩnh viễn) | Tôn trọng người chơi casual, tránh trừng phạt nặng nhưng vẫn khuyến khích đăng nhập chăm sóc | Cao |
| **ASM-009** | **Hệ thống Gacha Pity** | Hard pity `80` lượt (Character Banner) và `70` lượt (Weapon Banner); Soft pity tăng dần từ lượt `65` (Character) / `55` (Weapon); 50/50 Featured guarantee trên Limited Banner; 10-pull bảo đảm ít nhất 1 `EPIC` trở lên; 160 `STARLIGHT_SHARD`/pull | Quen thuộc, công bằng, dễ dự đoán chi phí kỳ vọng và đã được kiểm chứng bằng mô phỏng Monte Carlo 100.000 lượt | Cao |
| **ASM-010** | **Cường hóa Vũ khí +0 đến +10 (MVP)** | Tỷ lệ thành công `100%` (deterministic) ở toàn bộ 10 cấp; không vỡ đồ, không tụt cấp; giới hạn mở khóa mốc nâng cấp gắn với cấp Lò Rèn (`bld_blacksmith` Lv 1: +1..+3, Lv 2: +4..+6, Lv 3: +7..+8, Lv 4: +9..+10) | Gắn chặt Housing/Building với Combat Progression, loại bỏ ức chế RNG phá hủy công sức farm | Cao |
| **ASM-011** | **Bố trí 60 Kỹ năng trên 12 Nhân vật** | Mỗi nhân vật có `basicAttack` riêng (`atk_*` nhúng trên nhân vật) cộng đúng 5 kỹ năng độc bản trong `skills.json` (1 Passive, 3 Active, 1 Ultimate → `skl_*`) → `12 × 5 = 60` kỹ năng; 3 nhân vật MVP = đúng `15` kỹ năng | Khớp chính xác cả yêu cầu Mục 6 (Basic + Passive + 3 Active + Ultimate) lẫn tổng 15 kỹ năng MVP / 60 kỹ năng dài hạn | Cao |
| **ASM-012** | **Số lượng Công trình** | Thiết kế đầy đủ **13 công trình** (12 công trình theo Mục 16 + `bld_stable` từ danh sách 13 công trình tại Mục 13) | Thỏa mãn 100% cả Mục 13 và Mục 16 không bỏ sót hạng mục nào | Cao |

---

## 3. Các Giả thuyết Hiệu năng & Chịu tải Chưa Kiểm chứng (`unverified` / `proposed`)

Theo Nguyên tắc VIII của Hiến pháp, các con số sau là **mục tiêu đề xuất (`proposed`) và CHƯA được đo thực tế (`unverified`)** cho đến khi triển khai mã nguồn và chạy load test:

| Chỉ số | Mục tiêu đề xuất (`proposed`) | Trạng thái | Rủi ro chính cần đo khi Load Test |
| :--- | :--- | :---: | :--- |
| Server Simulation Tick | 20 Hz (50 ms/tick), thời gian xử lý tick p99 < 25 ms | `unverified` | Số lượng quái AI + pathfinding + hitbox đồng thời |
| Snapshot Broadcast Rate | 10 Hz (100 ms/snapshot) với interest management spatial grid | `unverified` | Băng thông WebSocket và CPU serialize JSON khi tụ tập đông ở làng |
| JSON DB Throughput (Single Node NVMe SSD) | 20–100 concurrent players ổn định; 500 concurrent players là bài test giới hạn (stress ceiling) | `unverified` | Độ trễ `fsync` trên NTFS/ext4 khi có bão ghi (mass gacha/crafting/save) |
| Client Render Frame Rate | 60 FPS ổn định trên máy cấu hình tầm trung (i5/Ryzen 5, iGPU, 8 GB RAM, Chrome/Edge mới nhất) | `unverified` | Draw calls Phaser khi đông người chơi + particle VFX trong boss raid |
| Memory Footprint Server | < 512 MB cho 50 CCU; < 1.5 GB cho 500 CCU | `unverified` | Bộ nhớ đệm JSON aggregate cache + spatial grid + ledger buffer |
