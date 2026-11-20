# Feature Specification: Quests, Onboarding Flow (`OB-1..OB-8`) & NPC Dialogue Engine

**Feature Branch**: `014-quests-onboarding`  
**Created**: 2026-11-20  
**Status**: Implemented & Verified (Closes `BLG-QST-001` / `RSK-013`)  
**Constitution**: `.specify/memory/constitution.md` (`v2.0.0` — 100% Local JSON Primary DB)

## 1. Purpose & Gameplay Value
Đóng hạng mục tồn đọng `BLG-QST-001` bằng đặc tả chính thức cho chuỗi hướng dẫn tự nhiên qua gameplay (**Onboarding `OB-1..OB-8`**) và **30 nhiệm vụ** trong `game-data/quests.json` (12 nhiệm vụ MVP), cung cấp nguồn kiếm `GOLD`, `EXP`, `STARLIGHT_SHARD` (cho Fair Gacha không ép nạp) và vật phẩm khởi đầu hoàn toàn xác thực tại server.

## 2. User Stories & Acceptance Criteria
- **US1 (P1 — Onboarding Tự Nhiên `OB-1..OB-8`)**: Người chơi mới tại Greenhaven Village được kích hoạt sẵn `qst_001_first_harvest`, thu hoạch 3 luống Sunwheat chín sẵn, chặt gỗ sồi, gieo hạt mới và nhận thưởng Gold + 160 `STARLIGHT_SHARD` mà không cần đọc tường chữ hướng dẫn dài.
- **US2 (P1 — Tiến Độ Tự Động Đồng Bộ Server & WAL Claim)**: Mọi hành động thu hoạch (`HARVEST_CROP`), gieo hạt (`PLANT_CROP`), khai thác (`GATHER_ITEM`), chế tạo (`CRAFT_ITEM`), cường hóa (`ENHANCE_WEAPON`), tiêu diệt quái (`KILL_MONSTER`) và hạ Boss (`DEFEAT_BOSS`) cập nhật tiến độ nhiệm vụ trực tiếp trên server; nhận thưởng ghi nhận nguyên tử qua WAL 2PC + `CurrencyLedger` chống nhận trùng.
- **US3 (P2 — Hội Thoại NPC & Mở Khóa Chuỗi Nhiệm Vụ)**: Nói chuyện với Elder Rowan, Blacksmith Garrik, Herbalist Mira, Scout Talia qua `GET /api/v1/npcs/:npcId/dialogue` và mở khóa tự động nhiệm vụ kế tiếp khi `prereqQuestIds` hoàn tất.

## 3. Functional Requirements
- **FR-001**: Hệ thống nạp 30 nhiệm vụ từ `game-data/quests.json` qua `CatalogService`, khởi tạo sẵn 12 nhiệm vụ MVP khi tạo nhân vật.
- **FR-002**: `POST /api/v1/characters/:id/quests/:questId/accept` kiểm tra trạng thái `AVAILABLE` trước khi kích hoạt `ACTIVE`.
- **FR-003**: `POST /api/v1/characters/:id/quests/:questId/claim` kiểm tra nghiêm ngặt trạng thái `COMPLETED`, cấm nhận trùng (`CLAIMED`), cộng `GOLD` & `STARLIGHT_SHARD` cùng `CurrencyLedger` trong 1 giao dịch WAL 2PC nguyên tử và tự kích hoạt nhiệm vụ kế tiếp đạt điều kiện tiên quyết.
- **FR-004**: `GET /api/v1/npcs/:npcId/dialogue` cung cấp hội thoại tiếng Việt và gợi ý lối chơi ngắn gọn cho 4 NPC làng Greenhaven (`SCR-20`).
