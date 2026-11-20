# Phase 0 Research: 10-Slot Equipment, Set Bonuses, Durability & Deterministic +0 to +10 Weapon Enhancement

**Feature**: `007-equipment-enhancement`  
**Date**: 2026-11-19

---

## 1. Nguồn Dữ liệu Duy nhất cho Bảng Cường hóa `+0..+10` (`weapon-upgrade-costs.csv` → `packages/game-config`)

- **Decision**: Đóng gói bảng cường hóa 10 bậc từ `docs/balancing/weapon-upgrade-costs.csv` thành dữ liệu chuẩn đọc khi khởi động trong `packages/game-config` (có kiểm chứng tự động khớp từng dòng với `weapon-upgrade-costs.csv` và kiểm tra mọi `mat_*` tồn tại trong `game-data/items.json`), kèm kiểm tra bất biến `successRateMvp === 1.00`, `breakRiskMvp === false`, `downgradeRiskMvp === false`, `maxLevel === 10`.
- **Rationale**: Tuân thủ Nguyên tắc III (Single Source of Truth) và Nguyên tắc VI (Fair Progression): không bao giờ có sai lệch giữa tài liệu cân bằng CSV, giao diện hiển thị chi phí trên Blacksmith Modal và logic trừ nguyên liệu trên server.
- **Alternatives considered (Rejected)**: Hardcode 10 câu lệnh `if/switch` trong `EnhancementService` (dễ lệch số với CSV và khó kiểm chứng tự động).

## 2. Khóa 4 Aggregate Theo Thứ tự Từ điển cho Giao dịch Cường hóa Đa Tệp (Zero Deadlock, Zero External DB)

- **Decision**: Giao dịch `POST /api/v1/characters/:charId/enhancement/upgrade` lấy danh sách khóa đã sắp xếp từ điển: `["character:<charId>", "house:<charId>", "inventory:<charId>", "ledger:<YYYY-MM>"]` (sử dụng khóa `character:<charId>` để bao luôn quyền ghi tuần tự vào `history/upgrade-history-<charId>.json`), sau đó thực thi **1 `WalTransaction` duy nhất** ghi nguyên tử 4 tệp đích:
  1. `data/db/characters/<charId>.json` (trừ `GOLD`, cập nhật `derivedSnapshot` & `combatRating`)
  2. `data/db/inventories/<charId>.json` (trừ nguyên liệu từ túi + rương nếu `bld_storage >= Lv 2`, tăng `weapon.enhancementLevel` thêm `+1`)
  3. `data/db/history/upgrade-history-<charId>.json` (append `UpgradeHistoryRecord`)
  4. `data/db/ledgers/currency-ledger-<YYYY-MM>.json` (append `CurrencyLedgerEntry` với `reasonCode: "WEAPON_ENHANCE"`)
- **Rationale**: Loại trừ hoàn toàn race condition khi người chơi spam 10 request cường hóa hoặc vừa cường hóa vừa bán đồ/nâng cấp Lò Rèn, đồng thời bảo đảm roll-forward nguyên vẹn nếu sập máy chủ giữa chừng — 100% trên tệp JSON cục bộ không cần PostgreSQL hay Redis.
- **Alternatives considered (Rejected)**: Ghi tuần tự 4 tệp không có WAL (rủi ro mất `mat_thornback_heart` mà vũ khí không tăng cấp); dùng PostgreSQL transaction (bị cấm tuyệt đối theo Nguyên tắc I).

## 3. Lưu Trạng thái `EquipmentLoadout` Bằng Con trỏ `instanceId` Thay vì Tách Bản thể Khỏi Kho

- **Decision**: Giữ toàn bộ bản thể `ItemInstance` đang sở hữu trong `InventoryAggregate` hoặc liên kết nhất quán qua `Character.equipment[slot] = ItemInstance.instanceId` với quy tắc tham chiếu chặt: mọi `instanceId` đang xuất hiện trong `Character.equipment` đều thuộc quyền sở hữu `ownerCharacterId === characterId`, được đánh dấu không thể bán (`ERR_ITEM_EQUIPPED_CANNOT_SELL`) và không thể tách (`ERR_ITEM_EQUIPPED_CANNOT_DISMANTLE`), đồng thời khi mặc đồ thì giải phóng ô túi để túi đồ phản ánh chính xác số ô trống mang theo.
- **Rationale**: Tránh trùng lặp dữ liệu `ItemInstance` ở hai nơi có thể lệch `enhancementLevel`/`durability`, giữ kiểm chứng `instanceId` duy nhất toàn cục đơn giản và an toàn tuyệt đối khi cường hóa vũ khí đang cầm trên tay (`MAIN_HAND`) mà không bắt người chơi phải tháo ra khỏi tay.
- **Alternatives considered (Rejected)**: Sao chép toàn bộ object `ItemInstance` vào cả `characters/<id>.json` lẫn `inventories/<id>.json` (rủi ro đồng bộ 2 bản ghi khi cường hóa hoặc giảm độ bền).

## 4. Kiến trúc Mở rộng Khảm Ngọc (Socketing Strategy Hook cho M2+)

- **Decision**: Duy trì trường `ItemInstance.sockets: string[]` (`0..2` phần tử theo độ hiếm: `RARE = 1`, `EPIC/LEGENDARY/MYTHIC = 2`, `COMMON/UNCOMMON = 0`) ngay từ schema v1.0.0 và định nghĩa giao diện `ISocketingService` có bản cài đặt MVP trả `501/409 ERR_FEATURE_LOCKED_ROADMAP`.
- **Rationale**: Khi mở khóa tính năng khảm ngọc ở M2, các vũ khí/giáp người chơi đã rèn và cường hóa `+10` ở MVP hoàn toàn tương thích mà không cần phá vỡ cấu trúc lưu trữ JSON hiện có.
- **Alternatives considered (Rejected)**: Bỏ qua hoàn toàn trường `sockets` rồi phải viết migration lớn cho toàn bộ `ItemInstance` ở M2.
