<!--
Sync Impact Report
==================
- Version change: 1.0.0 → 2.0.0 (MAJOR — User-authorized amendment to Principle I permitting self-hosted local Docker Redis & MinIO S3-compatible storage alongside 100% JSON-Only Primary Persistent Database, plus Principle V anti-glitch 2D multi-animation invariants)
- Modified principles:
  - Principle I: "JSON-Only Primary Database & Zero Third-Party Services" → "JSON-Only Primary Persistent Database + Self-Hosted Local Docker Redis & MinIO (Zero External Cloud/Third-Party Services)" (NON-NEGOTIABLE)
  - Principle V: "Classic 16-Bit Pixel-Perfect Visual Cohesion" → "Classic 16-Bit Pixel-Perfect Visual Cohesion & Glitch-Free 2D Multi-Animation Pipeline"
- Modified sections:
  - Technical Stack & Storage Constraints (added Local Docker Redis for ephemeral runtime cache/coordination & Local Docker MinIO S3-compatible storage for static pixel assets/backups; kept 100% JSON Primary Persistent DB and strict prohibition on SQL/NoSQL DBMS & external cloud SaaS)
  - Development Workflow & Quality Gates (updated feature count to 13+ independent Spec Kit features)
- Templates & Artifacts Propagated:
  - ✅ .specify/memory/constitution.md (v2.0.0)
  - ✅ docs/architecture/architecture-decisions/ADR-001-json-only-local-database.md & ADR-007-local-docker-redis-minio-and-glitch-free-2d-pipeline.md
  - ✅ docs/architecture/system-architecture.md, database-design.md, backend-architecture.md, deployment-design.md, diagrams/architecture-diagrams.md
  - ✅ docs/art-direction/asset-manifest.md
  - ✅ specs/001..013 plans & cross-check analysis
  - ✅ tools/design-validation/audit-workspace.mjs (v2.0.0 policy scanner)
- Follow-up TODOs: None
-->

# Eldoria: Forgotten Wilds Constitution

## Core Principles

### I. JSON-Only Primary Persistent Database + Self-Hosted Local Docker Redis & MinIO (Zero External Cloud/Third-Party Services — NON-NEGOTIABLE)
Toàn bộ dữ liệu lưu trữ bền vững (primary persistent database) của dự án — bao gồm Account, Session audit, Character, Inventory, Equipment, World state, Housing/Building, Farming/Crop, Animal, Quest progress, Party snapshot, Gacha history, CurrencyLedger, audit logs và chỉ mục tìm kiếm — MUST được lưu trữ **100% dưới dạng tệp JSON cục bộ** trong cấu trúc `data/db/**/*.json`, được quản lý bởi **`JsonDatabaseEngine`** nội bộ.

Dự án **TUYỆT ĐỐI KHÔNG** sử dụng hệ quản trị cơ sở dữ liệu truyền thống hoặc NoSQL làm kho lưu trữ chính (PostgreSQL, MySQL, MariaDB, MongoDB, SQLite, TypeORM, Prisma) và **KHÔNG** phụ thuộc bất kỳ dịch vụ đám mây hay bên thứ ba nào (AWS S3 Cloud, Cloudflare R2, Firebase, Supabase, Auth0, Redis Cloud, Upstash, SaaS CDN).

Theo ủy quyền kiến trúc `v2.0.0` từ chủ dự án, hai thành phần hạ tầng mã nguồn mở chạy **100% tự chủ trong Docker cục bộ (Local Docker Compose)** được phép tham gia với ranh giới vai trò nghiêm ngặt:
1. **Local Redis (Docker container nội bộ)**: CHỈ dùng cho trạng thái runtime tạm thời có thể tái tạo (ephemeral runtime cache), phiên nóng (hot session/presence), điều phối zone/party pub-sub, rate-limit trượt và fast-path khóa/idempotency ngắn hạn. Redis **KHÔNG BAO GIỜ** là nguồn lưu trữ bền vững duy nhất — nếu Redis khởi động lại hoặc mất toàn bộ bộ nhớ, `100%` dữ liệu nhân vật, kho đồ, tiền tệ, lãnh địa và pity gacha MUST vẫn toàn vẹn tuyệt đối trong `data/db/**/*.json`.
2. **Local MinIO (S3-compatible Object Storage chạy trong Docker cục bộ)**: Dùng để lưu trữ, đánh phiên bản và phân phát tài nguyên tĩnh 2D pixel art (sprite sheets, texture atlases, Tiled maps `.tmj`, âm thanh, font nội bộ tại bucket `eldoria-assets`) và lưu bản sao lưu nén xoay vòng của `data/db/` (tại bucket `eldoria-backups`, song song với bản địa `data/backups/`). MinIO MUST chỉ chạy bằng container cục bộ gắn volume đĩa nội bộ, không kết nối AWS hay đám mây ngoài.

Mọi giao dịch thay đổi trạng thái bền vững quan trọng (tiền tệ, kho đồ, cường hóa vũ khí, chế tạo, quay gacha, xây dựng) MUST sử dụng khóa bất đồng bộ theo aggregate key (`AsyncLockManager`, hỗ trợ mở rộng khóa phối hợp qua Local Redis khi đa tiến trình), ghi nguyên tử (`write temp → fsync → atomic rename`), kèm JSON Write-Ahead Log (WAL) và cơ chế khôi phục lũy đẳng sau sự cố khi khởi động.

*Rationale*: Kết hợp sự minh bạch, tự chủ dữ liệu 100% JSON (không SQL/NoSQL ngoài, không lệ thuộc dịch vụ đám mây trả phí) với khả năng tăng tốc runtime chuyên nghiệp của Local Redis và pipeline phân phát asset 2D/backup chuẩn S3 cục bộ của Local MinIO trong cùng một file `docker-compose.yml` chạy ngay trên máy cục bộ.

### II. Server-Authoritative Simulation & Anti-Cheat Integrity (NON-NEGOTIABLE)
Game server NestJS là nguồn chân lý duy nhất (single source of truth) cho mọi trạng thái gameplay: di chuyển, va chạm, tính toán sát thương, trúng đích, cooldown, tiêu hao mana/stamina, rơi vật phẩm (loot), nâng cấp, chế tạo, đặt công trình, quay gacha và tiến trình offline theo đồng hồ server. Client chỉ được phép gửi input/intent và chạy prediction/interpolation phục vụ cảm giác mượt mà; server MUST bác bỏ mọi giá trị damage, vị trí đích, hit event từ animation client, lượng tiền hoặc cooldown do client tự khai báo.

Mọi giao dịch kinh tế và kho đồ MUST có `idempotencyKey`, ghi nhận bất biến trong sổ cái JSON (`data/db/ledgers/currency-ledger-<characterId>-<YYYY-MM>.json`) và kiểm tra quyền sở hữu trước khi thực thi. Dự án KHÔNG được tuyên bố chống gian lận tuyệt đối; mọi bề mặt tấn công phải có phân tích rủi ro và lớp giảm thiểu cụ thể.

*Rationale*: Bảo vệ công bằng multiplayer và tính toàn vẹn kinh tế trước các hình thức nhân bản vật phẩm, speed hack, teleport, giả mạo sát thương và tấn công gửi lặp (replay/concurrent requests).

### III. Data-Driven Single Source of Truth
Toàn bộ danh mục nội dung và thông số cân bằng (nhân vật, kỹ năng, quái vật, elite, boss, vũ khí, trang bị, nguyên liệu, công thức chế tạo, cây trồng, động vật, công trình, nhiệm vụ, bảng rơi đồ và banner gacha) MUST được lưu trong nguồn chuẩn duy nhất `game-data/*.json` tuân thủ schema JSON có thể kiểm chứng tự động. Tài liệu thiết kế, bảng cân bằng, đặc tả Spec Kit và logic runtime MUST tham chiếu đúng ID, enum và công thức từ nguồn chuẩn này; CẤM sao chép lệch số liệu hoặc hardcode bảng chỉ số rải rác trong mã nguồn.

*Rationale*: Loại bỏ sai lệch giữa GDD, thiết kế cân bằng, dữ liệu game và mã nguồn triển khai khi dự án mở rộng qua nhiều milestone.

### IV. Modular Monolith & Decoupled Simulation Architecture
Hệ thống MUST bắt đầu với kiến trúc Modular Monolith trong monorepo (`apps/client`, `apps/game-server`, `packages/shared`, `packages/game-config`, `game-data`, `assets`, `docs`, `specs`, `tools`) với ranh giới domain rõ ràng giữa các module NestJS và hợp đồng giao thức dùng chung. CẤM chia tách microservices sớm khi chưa có bằng chứng tải thực tế.

Hệ thống MUST tách biệt hoàn toàn 3 vòng đời: vòng lặp mô phỏng server (mục tiêu 20 Hz, trạng thái tạm thời trong RAM/Local Redis), tầng render Phaser 2D/2.5D trên client (mục tiêu 60 FPS) và lớp giao diện React/Zustand. CẤM dùng React state để cập nhật toàn bộ game world mỗi frame và CẤM ghi tệp JSON xuống đĩa cứng theo từng server tick; trạng thái vị trí/tạm thời MUST dùng cơ chế in-memory dirty-flag flush định kỳ (30s rải đều) và flush ngay khi ngắt kết nối/tắt server.

*Rationale*: Giữ độ phức tạp phù hợp đội ngũ nhỏ, bảo vệ hiệu năng I/O của hệ thống lưu trữ JSON cục bộ và duy trì phản hồi chiến đấu mượt mà.

### V. Classic 16-Bit Pixel-Perfect Visual Cohesion & Glitch-Free 2D Multi-Animation Pipeline
Đồ họa game MUST tuân thủ phong cách Classic 16-bit Fantasy Pixel Art 2D góc nhìn top-down / three-quarter top-down, tạo chiều sâu 2.5D bằng Y-sorting (`Depth 1000 + Math.round(footY)`), occlusion, layering, elevation và bóng đổ nhất quán. Tiêu chuẩn gốc: base tile `32x32 px`, base humanoid `48x64 px`, large character `96x96 px`, boss `128x128 px` đến `256x256 px`, sử dụng nearest-neighbor texture filtering (`pixelArt: true`, `antialias: false`, `roundPixels: true`) và viewport logic `640x360` phóng tỷ lệ nguyên (integer scaling).

Mọi sprite sheet, texture atlas và hoạt ảnh 2D MUST đáp ứng bộ bất biến chống lỗi hình ảnh (Anti-Glitch 2D Invariants):
- Bắt buộc `padding: 2px` và `extrude: 1px` cho mọi tileset/atlas nhằm triệt tiêu 100% lỗi hở đường nối ô đất (tile seam bleeding) và lem khung hình lân cận.
- Tách bạch 4 hộp không gian (Sprite Frame ≠ Hurtbox ≠ Foot Collision Box ≠ Interaction Box) để loại bỏ lỗi kẹt tường hoặc chồng hình bất thường.
- Bộ máy trạng thái hoạt ảnh (HFSM 25 trạng thái × 4 hướng, mở rộng 8 hướng) MUST có cơ chế **Anti-Stuck Watchdog** (tự động hồi về `idle_<dir>` khi vượt quá thời lượng tối đa của trạng thái không lặp), kiểm chứng 100% khóa animation/frame khi khởi động (fail-fast hoặc fallback sprite chuẩn không crash màn hình đen/ô vuông thiếu texture).
- Hỗ trợ phong phú hoạt ảnh 2D cho nhân vật, vũ khí, quái, boss, động vật, cây trồng theo giai đoạn, nước/cây/lửa môi trường và VFX chiến đấu.

CẤM sử dụng ảnh photorealistic, mixel (tỉ lệ pixel không đồng nhất), làm mờ sprite, hiệu ứng nhấp nháy `> 3 Hz` gây hại thị giác hoặc asset lấy từ Internet không rõ bản quyền. VFX của kỹ năng và Ultimate MUST giữ nguyên khả năng đọc chiến trường (combat readability) và KHÔNG được che khuất tín hiệu báo đòn (`Depth 180–199` + `Telegraph Rim Echo 109500`) của boss.

*Rationale*: Bảo đảm trải nghiệm game pixel 2D giàu hoạt ảnh, mượt mà, sắc nét, không lỗi đồ họa/kẹt hoạt ảnh trong chiến đấu multiplayer thời gian thực và an toàn bản quyền 100%.

### VI. Fair Progression, Non-Predatory Gacha & Meaningful Gameplay Loops
Vòng lặp cốt lõi `Explore → Gather → Combat → Loot → Craft → Upgrade → Build → Unlock → Boss Battle → New Region` MUST đảm bảo mọi hoạt động (nông trại, chăn nuôi, khai khoáng, chế tạo, xây dựng, chiến đấu) đều đóng góp có ý nghĩa vào tiến trình sức mạnh và kinh tế.

Cường hóa vũ khí MUST đi từ `+0` đến tối đa `+10` (không vượt `+10` theo thiết kế mặc định); trong MVP MUST là nâng cấp chắc chắn khi đủ nguyên liệu, TUYỆT ĐỐI KHÔNG tự động phá hủy hoặc giảm cấp vũ khí. Hệ thống Gacha trong MVP MUST chỉ sử dụng tiền tệ kiếm được qua gameplay (không thanh toán tiền thật, không đổi thưởng thành tiền), công khai toàn bộ tỷ lệ xác suất, có cơ chế pity và bảo đảm (guaranteed), chuyển đổi vật phẩm trùng lặp minh bạch, không dùng dark pattern và không yêu cầu gacha mới vượt qua được nội dung cốt lõi. Nhân vật Legendary/Mythic KHÔNG được làm vô hiệu hóa vai trò chiến thuật của nhân vật độ hiếm thấp hơn.

*Rationale*: Tạo động lực chơi lâu dài lành mạnh, tránh grind vô nghĩa hoặc cảm giác trả tiền để thắng (pay-to-win), đồng thời bảo đảm giá trị chiến thuật đa dạng giữa các class và nguyên tố.

### VII. Spec-Driven Development & Vertical-Slice MVP Scope
Mọi yêu cầu phát triển MUST tuân thủ quy trình Spec Kit chính thức (`constitution → specify → clarify → plan → checklist → tasks → analyze`) trên các thư mục feature độc lập theo thứ tự phụ thuộc; CẤM gộp toàn bộ game thành một đặc tả đơn lẻ khổng lồ. Trong giai đoạn `DESIGN_AND_PLANNING_ONLY`, CẤM triển khai mã nguồn production, CẤM chạy `/speckit-implement` và CẤM chạy `/speckit-converge` để giả định đã hoàn tất mã nguồn.

Thiết kế bao quát tầm nhìn dài hạn (8 khu vực, level 100, 12 nhân vật, 60 kỹ năng) nhưng kế hoạch triển khai MUST ưu tiên Vertical Slice MVP hoàn chỉnh (1 village, 1 forest, 1 dungeon, 3 nhân vật, 15 kỹ năng, 8 monster, 1 elite, 1 boss, 10 vũ khí, cường hóa +1 đến +10, farming/housing cơ bản, gacha nội tệ, co-op multiplayer, hệ thống hoạt ảnh 2D không lỗi và hạ tầng Docker cục bộ JSON + Redis + MinIO) trước khi mở rộng quy mô.

*Rationale*: Kiểm soát phạm vi rủi ro cao của game online RPG, đảm bảo mỗi milestone đều kiểm thử độc lập và bàn giao được giá trị chơi thực tế.

### VIII. Verifiable Quality Gates & Evidence Integrity
Không một hệ thống thiết kế nào được đánh dấu hoàn thành nếu chưa đáp ứng đủ 14 tiêu chí Quality Gate (mục tiêu gameplay, user stories, functional requirements, business rules, I/O, state transitions, JSON data model, dependencies, UI interactions, edge cases, failure behavior, security requirements, acceptance criteria và test scenarios). Toàn bộ cross-reference ID, cú pháp JSON, công thức combat, chi phí nâng cấp, phân phối gacha và tính toàn vẹn khóa animation/atlas MUST được kiểm chứng bằng công cụ tự động và mô phỏng thực tế.

Mọi chỉ số tải, hiệu năng hoặc capacity chưa đo trên hệ thống thực MUST được gắn nhãn rõ ràng là `proposed` hoặc `unverified`. TUYỆT ĐỐI KHÔNG giả mạo kết quả test, số liệu benchmark, ảnh chụp kiểm thử, giấy phép tài nguyên hay câu trả lời phê duyệt của người dùng. Ngôn ngữ tài liệu giải thích MUST là tiếng Việt; tên file, API, field JSON, class, enum, biến, thuật ngữ kỹ thuật và định danh game content MUST dùng tiếng Anh.

*Rationale*: Duy trì tính trung thực kỹ thuật chuẩn studio thương mại, ngăn chặn lỗi dây chuyền trước khi đội kỹ thuật bước vào giai đoạn lập trình.

## Technical Stack & Storage Constraints

- **Frontend**: React, Vite, TypeScript, Phaser 3 (`pixelArt: true`, `roundPixels: true`, `640x360` integer scaling), Zustand, Tailwind CSS (ưu tiên desktop trong MVP, responsive hợp lý, roadmap gamepad và mobile touch).
- **Backend & Realtime Server**: NestJS, TypeScript, Socket.IO / WebSocket adapter tự chủ, chạy Modular Monolith trong Local Docker Compose.
- **Primary Persistent Database (BẮT BUỘC — 100% JSON)**: 100% Local JSON File Database (`data/db/**/*.json`) với `JsonDatabaseEngine` nội bộ (phân mảnh per-character/per-account, schema validation, per-aggregate async locks, atomic `tmp → fsync → rename`, JSON WAL crash recovery lũy đẳng, periodic dirty-state flush, local rotating backups). **TUYỆT ĐỐI KHÔNG** dùng PostgreSQL, MySQL, MongoDB, SQLite, TypeORM, Prisma hay bất kỳ DBMS truyền thống/cloud DB nào.
- **Runtime Coordination & Ephemeral Cache (Local Docker)**: **Local Redis (`redis:7-alpine`)** chạy trong Docker Compose cục bộ phục vụ presence online, hot session lookup, rate-limit trượt, zone/party pub-sub và hàng đợi sự kiện ngắn hạn. Hệ thống hỗ trợ degraded fallback về RAM nội bộ nếu Redis khởi động lại mà không mất dữ liệu bền vững trên JSON.
- **Static Pixel Assets & Backup Object Storage (Local Docker)**: **Local MinIO (`minio/minio`, chuẩn S3 API)** chạy trong Docker Compose cục bộ với 2 bucket chính: `eldoria-assets` (sprite sheets, texture atlases có `extrude:1px/padding:2px`, Tiled maps `.tmj`, âm thanh `.ogg/.mp3`, font pixel Việt hóa) và `eldoria-backups` (bản sao lưu xoay vòng nén kèm manifest SHA-256 của `data/db/`). KHÔNG dùng AWS S3 cloud hay CDN trả phí ngoài.
- **Authentication & Security**: Xác thực nội bộ hoàn toàn (password hash bằng `crypto.scrypt` chuẩn Node, JWT ký cục bộ lưu bản ghi phiên bền vững trong `data/db/sessions/*.json` và cache phiên nóng trên Local Redis); KHÔNG tích hợp nhà cung cấp danh tính bên thứ ba (Auth0/Firebase).
- **Infrastructure & Testing**: Local Docker Compose (`eldoria-server`, `eldoria-client`/static serve, `redis`, `minio`, `minio-init`, tùy chọn `traefik`); kiểm thử tự động với Vitest, Jest, Playwright, `validate-catalog.mjs`, `validate-animation-pipeline.mjs` và công cụ load test giao thức realtime chạy cục bộ.
- **Capacity Honesty**: Kế hoạch kiểm thử tải phải đánh giá các mốc 20, 50, 100 và 500 người chơi đồng thời; mọi nhận định chịu tải của kiến trúc JSON DB + Local Redis + Local MinIO phải nêu rõ giới hạn I/O ổ đĩa, lock contention và RAM dưới dạng giả thuyết `proposed/unverified` cho đến khi có kết quả đo thực tế.

## Development Workflow & Quality Gates

1. **Chế độ hoạt động hiện tại**: `DESIGN_AND_PLANNING_ONLY` — chỉ tạo tài liệu thiết kế, dữ liệu mẫu `game-data/*.json`, sơ đồ kiến trúc, mockup tĩnh/tương tác (kể cả showcase hoạt ảnh 2D pixel offline), công cụ kiểm chứng/mô phỏng thiết kế và bộ đặc tả Spec Kit (`specs/`). Chuyển sang `IMPLEMENTATION MODE` chỉ khi người dùng rà soát xong `FINAL-DESIGN-REPORT.md` và phê duyệt rõ ràng.
2. **Thứ tự Spec Kit chuẩn**: Áp dụng tuần tự `constitution` → `specify` → `clarify` → `plan` → `checklist` → `tasks` → `analyze` cho từng feature độc lập (`specs/001..013+`). Trong quá trình `clarify` tự vận hành, các quyết định có thể đảo ngược được ghi nhận rõ là *Đề xuất/Giả định tự chọn (Proposed Autonomous Decision)* và KHÔNG được ghi nhận như phê duyệt của người dùng.
3. **Phân loại và xử lý lỗi**: Mọi vấn đề phát hiện trong rà soát phải được phân loại `P0` (nghiêm trọng/vi phạm Hiến pháp), `P1` (cao/mâu thuẫn logic hoặc thiếu coverage lõi), `P2` (trung bình), `P3` (thấp). Không được bỏ sót hoặc che giấu bất kỳ vấn đề `P0` hoặc `P1` nào.
4. **Duy trì trạng thái liên tục**: Sau mỗi giai đoạn thiết kế hoặc sửa đổi Hiến pháp, MUST cập nhật đồng bộ `docs/management/PROGRESS.md`, `docs/management/HANDOFF.md` và `docs/management/FINAL-DESIGN-REPORT.md` kèm chạy kiểm toán chéo tự động.
5. **Quy tắc an toàn vận hành**: Không xóa dữ liệu người dùng, không deploy production, không mua dịch vụ, không gọi API trả phí, không tải tài nguyên chưa xác minh bản quyền và không vô hiệu hóa cơ chế bảo mật.

## Governance

Hiến pháp này có hiệu lực cao nhất, vượt trên mọi thực hành, đặc tả hoặc kế hoạch phát triển khác trong dự án **Eldoria: Forgotten Wilds**. Mọi tài liệu thiết kế, `spec.md`, `plan.md`, `tasks.md`, phân tích `/speckit-analyze` và Pull Request trong tương lai MUST được kiểm tra tuân thủ trực tiếp với các nguyên tắc `NON-NEGOTIABLE` của Hiến pháp này, đặc biệt là Nguyên tắc I (JSON-Only Primary Persistent Database + Self-Hosted Local Docker Redis & MinIO), Nguyên tắc II (Server-Authoritative Simulation) và Nguyên tắc V (Glitch-Free 16-Bit Pixel Art & Multi-Animation Pipeline).

- **Quy trình sửa đổi (Amendment Procedure)**: Mọi thay đổi Hiến pháp MUST được đề xuất kèm lý do kỹ thuật/kinh doanh, phân tích tác động lên các tài liệu và feature đang tồn tại, kế hoạch chuyển đổi (migration plan) và sự phê duyệt rõ ràng của chủ dự án (người dùng) đối với các thay đổi tác động lớn (như kiến trúc lưu trữ, hạ tầng cục bộ, mô hình doanh thu/gacha hoặc bảo mật).
- **Chính sách đánh phiên bản (Versioning Policy)**: Tuân thủ Semantic Versioning (`MAJOR.MINOR.PATCH`):
  - `MAJOR`: Xóa bỏ, thay thế hoặc định nghĩa lại không tương thích ngược các nguyên tắc quản trị/kiến trúc cốt lõi.
  - `MINOR`: Thêm nguyên tắc hoặc mục quản trị mới, hoặc mở rộng đáng kể hướng dẫn bắt buộc.
  - `PATCH`: Làm rõ diễn đạt, sửa lỗi chính tả hoặc tinh chỉnh không thay đổi ngữ nghĩa quy tắc.
- **Kiểm tra tuân thủ (Compliance Review)**: Mọi chu kỳ `/speckit-plan` (Constitution Check gate), `/speckit-analyze` và Final Design Review đều MUST đối chiếu tường minh với Hiến pháp; mọi vi phạm nguyên tắc `MUST` tự động bị xếp hạng `CRITICAL` (`P0`) và chặn chuyển bước cho đến khi được khắc phục.

**Version**: 2.0.0 | **Ratified**: 2026-11-19 | **Last Amended**: 2026-11-19
