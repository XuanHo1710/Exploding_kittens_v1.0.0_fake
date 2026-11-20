# Quickstart Validation Guide: 10-Slot Equipment, Set Bonuses & Deterministic +0 to +10 Enhancement

**Feature**: `007-equipment-enhancement`  
**Prerequisites**: `001-foundation-game-engine`, `002-auth-character`, `004-combat-skills`, `005-inventory-loot`.  
**Mode Note**: Hướng dẫn kiểm chứng áp dụng khi chuyển sang `IMPLEMENTATION MODE`; trong `DESIGN_AND_PLANNING_ONLY` không tạo mã nguồn production.

---

## 1. End-to-End Validation Scenarios (Khi đã Triển khai)

1. **10-Slot Loadout, Two-Handed Rule & 6-Set Activation**:
   - Trang bị đủ 10 ô lên `chr_kael_vanguard`, bao gồm 4 món `set_mossroot_guard` → xác nhận kích hoạt chính xác 2-pc (`+24 DEF`, `+12% EarthRes`) và 4-pc (`+140 HP`, `+20 Poise`, `+3 HP/s`).
   - Thử mặc vũ khí hai tay khi đang đeo khiên ở `OFF_HAND` → khiên tự trả về ô trống túi; thử tháo khi túi đầy → bị từ chối `409 ERR_INVENTORY_FULL`.
   - Thử mặc vũ khí sai class hoặc vượt `levelReq` → bị từ chối sạch sẽ; thử mặc cùng 1 `instanceId` nhẫn vào `RING_1` và `RING_2` → chỉ hoán đổi ô, không tạo bản sao.
2. **Deterministic `+0 → +10` Enhancement & Blacksmith Gates (`TS-ENH-001`, `TS-ENH-002`, `TS-ENH-003`)**:
   - Đặt `bld_blacksmith` Lv 1, nâng `wpn_iron_longsword` từ `+0 → +3` (`100%` thành công); thử nâng `+3 → +4` → bị chặn `409 ERR_BLACKSMITH_LEVEL_REQUIRED`.
   - Nâng dần `bld_blacksmith` lên Lv 2 (`+4..+6`, kiểm chứng đặc quyền mốc `+5`: `+3% CritRate` & `Weapon Glow I`), Lv 3 (`+7..+8`) và Lv 4 (`+9..+10`, kiểm chứng đặc quyền mốc `+10`: `+8% Boss Poise` & `+5% Skill Scaling` & `Radiant Aura II`).
   - Thử nâng `+10 → +11` → bị chặn `409 ERR_MAX_ENHANCEMENT_REACHED`, không trừ tiền/nguyên liệu.
   - Kiểm tra `data/db/history/upgrade-history-<charId>.json` có đủ `10` bản ghi và khớp tổng `26,400 GOLD` trên `data/db/ledgers/currency-ledger-<YYYY-MM>.json`.
3. **Concurrent Enhancement Spam & WAL Crash Recovery (`TS-ENH-004`)**:
   - Bắn `10` HTTP POST song song vào `POST /enhancement/upgrade` (cả trùng và khác `X-Idempotency-Key`) và mô phỏng ngắt tiến trình ngay sau pha `WAL PREPARED` → xác nhận `0` trùng `instanceId`, `0` trừ tiền sai, `100%` khôi phục đồng nhất 4 tệp JSON.
4. **Durability `WORN`, Field/Blacksmith Repair & Dismantling**:
   - Đưa độ bền `wpn_iron_longsword` về `0` → xác nhận không vỡ mất, chỉ còn `50%` base stats; dùng `csm_repair_kit` hồi `+50%`; dùng `GOLD_BLACKSMITH` tại `bld_blacksmith` Lv 3 hồi `100%` với đúng chiết khấu `20%`.
   - Tách 1 `eqp_hunter_tunic` không mặc → nhận nguyên liệu vào túi; thử tách `eqp_mossroot_helm` đang mặc → chặn `409 ERR_ITEM_EQUIPPED_CANNOT_DISMANTLE`.

---

## 2. Tham chiếu
- Bảng chi phí cường hóa chuẩn 10 cấp: [`docs/balancing/weapon-upgrade-costs.csv`](../../docs/balancing/weapon-upgrade-costs.csv)
- Danh mục trang bị & 6 bộ set: [`game-data/items.json`](../../game-data/items.json)
- Cấu hình cấp Lò Rèn & Rương: [`game-data/buildings.json`](../../game-data/buildings.json)
