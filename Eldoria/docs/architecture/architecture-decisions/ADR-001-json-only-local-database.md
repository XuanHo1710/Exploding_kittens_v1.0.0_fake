# ADR-001: 100% JSON-Only Local Primary Database & Zero Third-Party Services

- **Trạng thái**: Accepted & Amended by [`ADR-007`](./ADR-007-local-docker-redis-minio-and-glitch-free-2d-pipeline.md) (Constitution `v2.0.0` Principle I — NON-NEGOTIABLE)
- **Ngày quyết định**: 2026-11-19 (Sửa đổi bổ sung Local Docker Redis + MinIO cùng ngày theo `DEC-003`)
- **Người ra quyết định**: Chủ dự án (Project Owner) & Database/System Architect
- **Liên kết**: [`.specify/memory/constitution.md`](../../../.specify/memory/constitution.md), [`docs/architecture/database-design.md`](../database-design.md), [`ADR-007`](./ADR-007-local-docker-redis-minio-and-glitch-free-2d-pipeline.md)

---

## 1. Bối cảnh (Context)

Ban đầu, `GAME_DESIGN_BRIEF.md` gợi ý PostgreSQL + TypeORM cho dữ liệu bền vững, Redis cho trạng thái runtime và S3-compatible object storage cho tài nguyên tĩnh. Tuy nhiên, chủ dự án đã ban hành chỉ thị bắt buộc tối thượng (`DEC-001`):

> **TUYỆT ĐỐI KHÔNG lưu vào database truyền thống (SQL/NoSQL ngoài). Toàn bộ database phải ở dạng tệp JSON cục bộ làm cơ sở dữ liệu chính, và tuyệt đối không sử dụng dịch vụ bên thứ ba.**

Một game Online Multiplayer RPG có nhiều yêu cầu khắt khe về tính nhất quán giao dịch (tránh nhân bản vật phẩm khi cường hóa +1..+10, tránh double-spend khi quay gacha, tránh mất đồ khi sập máy chủ, bảo mật tài khoản và ghi sổ cái tiền tệ) mà thông thường các hệ thống dựa vào ACID của RDBMS. Do đó cần thiết kế một kiến trúc lưu trữ **100% JSON cục bộ** đủ chặt chẽ để đảm bảo tính nguyên tử, khả năng khôi phục và hiệu năng hợp lý trong phạm vi MVP và trung hạn.

---

## 2. Quyết định (Decision)

Áp dụng kiến trúc **`JsonDatabaseEngine` cục bộ tự chủ 100%**, lưu toàn bộ dữ liệu bền vững dưới `data/db/**/*.json` và dữ liệu cấu hình game tại `game-data/*.json`:

1. **Phân mảnh theo Aggregate (Aggregate-Sharded JSON Files)**:
   - Không gom toàn bộ cơ sở dữ liệu vào 1 tệp JSON khổng lồ.
   - Mỗi thực thể chính có tệp JSON riêng theo khóa chính (`accounts/<accountId>.json`, `characters/<characterId>.json`, `inventories/<characterId>.json`, `houses/<characterId>.json`, `world/<regionId>.json`, `parties/<partyId>.json`).
   - Dữ liệu lịch sử và sổ cái phân mảnh theo nhân vật hoặc tháng (`ledgers/currency-ledger-<YYYY-MM>.json`, `history/gacha-history-<characterId>.json`, `history/upgrade-history-<characterId>.json`, `audit/security-audit-<YYYY-MM-DD>.json`).
   - Chỉ mục tra cứu nhanh (`indexes/accounts-by-email.json`, `indexes/accounts-by-username.json`, `indexes/characters-by-name.json`, `indexes/characters-by-account.json`) nạp vào RAM khi khởi động và ghi nguyên tử khi thay đổi.
2. **Bảo đảm Tính nguyên tử & Chống hỏng tệp (Atomic Write + WAL)**:
   - Mọi thao tác ghi đơn tệp thực hiện theo quy trình 3 bước: `write <file>.tmp.<txId>` → `fileHandle.sync()` (`fsync`) → `fs.rename(<file>.tmp.<txId>, <file>.json)`.
   - Mọi giao dịch liên tệp (ví dụ: trừ vàng + trừ nguyên liệu trong `inventories/<id>.json` + cập nhật vũ khí + ghi `upgrade-history` + ghi `currency-ledger`) đi qua **JSON Write-Ahead Log (`data/db/wal/tx-<txId>.json`)** ở trạng thái `PREPARED` → ghi các tệp đích → đánh dấu `COMMITTED` → dọn dẹp WAL. Khi server khởi động sau sự cố đột ngột, `CrashRecoveryService` đọc thư mục `wal/` để hoàn tất hoặc rollback sạch sẽ.
3. **Kiểm soát Đồng thời (In-Process Concurrency Control)**:
   - Quản lý khóa bất đồng bộ theo từng aggregate key (`AsyncLockManager`) theo thứ tự sắp xếp từ điển khóa (lock ordering) để loại bỏ deadlock.
   - Mọi bản ghi JSON mang trường `revision` (Optimistic Concurrency Control) và `checksumSha256` để phát hiện sửa đổi bất hợp pháp hoặc lỗi ghi.
4. **Phân tách Trạng thái Tạm thời & Chính sách Flush (Hot RAM vs Cold JSON)**:
   - Trạng thái thay đổi ở tần suất 20 Hz (tọa độ, vận tốc, HP/MP đang đánh, AI quái, projectile) **CHỈ sống trong RAM** của NestJS Game Server.
   - Giao dịch kinh tế/kho đồ/gacha/cường hóa/xây dựng: **Immediate Atomic Flush + WAL**.
   - Vị trí người chơi, EXP đánh quái lẻ, độ đói/stamina: đánh dấu `dirty = true`, ghi nền theo chu kỳ **30 giây** (`CheckpointFlusher`) và **ngay lập tức** khi chuyển vùng, thoát game hoặc nhận tín hiệu `SIGTERM/SIGINT`.
5. **Phạm vi Dịch vụ Cục bộ Được phép (Cập nhật theo `ADR-007` / Hiến pháp `v2.0.0`)**:
   - **Cơ sở dữ liệu bền vững chính vẫn 100% là tệp JSON (`data/db/**/*.json`)**: Cấm tuyệt đối PostgreSQL, MySQL, MongoDB, SQLite, TypeORM, Prisma và mọi Cloud SaaS ngoài.
   - **Local Docker Redis (`redis:7-alpine`)**: Được phép chạy trong Docker cục bộ **CHỈ cho tầng runtime tạm thời** (hot session cache, presence, rate-limit trượt, party invites TTL, pub/sub) với cơ chế fallback về RAM nội bộ — KHÔNG lưu dữ liệu bền vững chỉ trên Redis.
   - **Local Docker MinIO (`minio/minio`, S3-compatible)**: Được phép chạy trong Docker cục bộ cho kho tài nguyên tĩnh pixel art (`eldoria-assets`) và gương bản sao lưu JSON xoay vòng (`eldoria-backups`), song song với `assets/` và `data/backups/`.
   - **Xác thực nội bộ hoàn toàn**: Không Auth0/Firebase — băm mật khẩu cục bộ bằng `crypto.scrypt` + JWT ký bằng secret nội bộ + phiên lưu bền vững tại `data/db/sessions/<sessionId>.json`.

---

## 3. Các Phương án Bị từ chối (Rejected Alternatives)

| Phương án bị từ chối | Lý do từ chối |
| :--- | :--- |
| **PostgreSQL + TypeORM** | Vi phạm trực tiếp chỉ thị `DEC-001` và Nguyên tắc I của Hiến pháp (cấm tuyệt đối RDBMS/database ngoài làm CSDL chính). |
| **SQLite / LevelDB / RocksDB / MongoDB** | Vẫn là cơ sở dữ liệu nhị phân/NoSQL truyền thống, không phải định dạng tệp JSON thuần cho primary DB theo yêu cầu. |
| **Redis Cloud / Upstash hoặc dùng Redis làm Primary DB** | Cấm dịch vụ đám mây ngoài và cấm dùng Redis thay thế tệp JSON làm nguồn chân lý bền vững (chỉ cho phép Local Docker Redis làm lớp đệm tạm theo `ADR-007`). |
| **AWS S3 Cloud / Cloudflare R2 / Firebase / Supabase / Auth0** | Vi phạm yêu cầu tuyệt đối không phụ thuộc dịch vụ đám mây bên thứ ba (chỉ cho phép Local Docker MinIO S3-compatible tự vận hành theo `ADR-007`). |
| **Một tệp `database.json` duy nhất cho toàn game** | Nghẽn nghiêm trọng `JSON.parse`/`JSON.stringify` toàn cục, dễ mất toàn bộ dữ liệu khi lỗi ghi và xung đột khóa toàn máy chủ. |

---

## 4. Hệ quả & Rủi ro Được chấp nhận (Consequences & Honest Tradeoffs)

### Tích cực
- Triển khai **zero-infrastructure**: chỉ cần Node.js là chạy trọn vẹn toàn bộ game server, không cần cài hay cấu hình DB server.
- Tính minh bạch cao: quản trị viên và QA có thể đọc, kiểm tra, diff và sao lưu dữ liệu người chơi trực tiếp dưới dạng JSON chuẩn.
- Loại bỏ hoàn toàn chi phí vận hành cloud DB/storage bên thứ ba.

### Giới hạn & Kế hoạch Giảm thiểu (Trung thực kỹ thuật — `proposed / unverified`)
- **Giới hạn đơn nút (Single-Node Scaling)**: Khóa in-process và tệp đĩa cục bộ giới hạn một tiến trình server trên một máy chủ vật lý/VPS (không tự động multi-node active-active). Mục tiêu đo kiểm thực tế ở Phase Load Test: 20 → 50 → 100 → 500 concurrent players trên NVMe SSD.
- **Độ trễ `fsync` khi có bão giao dịch**: Khi nhiều người chơi cùng quay gacha 10 lần hoặc rèn đồ cùng lúc, ổ đĩa có thể là điểm nghẽn I/O. Giảm thiểu bằng phân mảnh tệp theo từng nhân vật, gộp batch ghi sổ cái theo khung 500ms (sau khi WAL đã `fsync`) và đặt ngưỡng rate limit hợp lý.
- **Truy vấn tổng hợp phức tạp**: Không có SQL `JOIN`/`GROUP BY`; mọi truy vấn tra cứu nhanh phải duy trì qua các tệp chỉ mục JSON trong RAM (`indexes/*.json`).
