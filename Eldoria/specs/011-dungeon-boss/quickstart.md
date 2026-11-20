# Quickstart Validation Guide: Instanced Dungeons, 10-State Monster AI & Multi-Phase Boss Encounters

**Feature**: `011-dungeon-boss`  
**Mode Note**: Hướng dẫn kiểm chứng dành cho giai đoạn triển khai (`IMPLEMENTATION MODE`), không chạy trên mã nguồn production chưa tồn tại.

---

## 1. Prerequisites
- Đã hoàn tất các feature phụ thuộc `001-foundation-game-engine`, `003-world-movement`, `004-combat-skills`, `005-inventory-loot`, `010-multiplayer-social`.
- Tồn tại đầy đủ dữ liệu chuẩn `game-data/monsters.json` (`30` Regular + `8` Elite), `game-data/bosses.json` (`5` Bosses) và `game-data/loot-tables.json`.

---

## 2. End-to-End Validation Scenarios (Khi đã Triển khai)

1. **Roster Loader & 10-State Monster AI FSM**:
   - Khởi động server và xác nhận nạp đủ `38` quái (`8 + 1` MVP) từ `game-data/monsters.json` mà không hardcode thông số.
   - Chạy kịch bản `TS-AI-01`..`TS-AI-06`: kéo `mob_briar_boar` vượt `480 px` hoặc chạm Safe Zone → chuyển `RETURN` miễn sát thương hồi `100% HP`; đánh `mob_forest_goblin` xuống `< 20%` → `FLEE` tối đa `4s` không lặp trong `20s`; Tank Taunt giữ aggro `mob_elite_alpha_direwolf`; Elite gọi tối đa `2` `mob_timber_wolf` không rơi loot; restart server giữ nguyên đồng hồ respawn Elite từ `data/db/world/reg_whispering_forest.json`.
2. **Instanced `dng_mossroot_hollow` & 1–4 Player Boss Scaling**:
   - Tạo hai `DungeonInstance` độc lập (Solo vs Party 4 người) cho `dng_mossroot_hollow`.
   - Xác nhận sau `5 giây` kích hoạt aggro, cửa phòng Boss niêm phong (`BOSS_LOCKED`), `boss_thornback_elder` khóa cứng `1.00x` HP (Solo: `10,500`) vs `3.10x` HP (4 người: `32,550`), đòn đánh bắn từ ngoài tọa độ phòng bị hủy (`ERR_OUT_OF_ARENA_BOUNDS`).
3. **3-Phase Transitions, Pillar Interaction, Poise Stagger & Enrage**:
   - Kéo HP `boss_thornback_elder` qua `65%` (Phase 2: bật `hz_briar_perimeter` & `thorn_regrowth_sap`) và `30%` (Phase 3: bật `hz_toxic_sap_pool` & `thorn_heartwood_charge`).
   - Dẫn `Heartwood Charge` đâm trúng trụ đá `pil_moss_nw` → trụ vỡ, Boss tự choáng `2.5s` nhận `+25%` Poise dmg.
   - Dùng kỹ năng hệ `FIRE` phá thanh Poise về `0` khi Boss đang niệm `Regrowth Sap Channel` → chiêu bị hủy (`SKILL_TELEGRAPH_CANCELLED`), Boss `STAGGERED` `6.0s` nhận `x1.40` sát thương.
   - Kiểm chứng đồng hồ chạm `360s` kích hoạt `ENRAGED` (`x1.65` ATK, `x1.30` speed) và vùng telegraph luôn hiển thị trên Layer `180–199` không bị Ultimate VFX che khuất.
4. **Revive Limit, Party Wipe Reset & Fair Reward Distribution**:
   - Thử hồi sinh 1 thành viên `2` lần bằng `csm_revive_feather` (thành công), lần thứ `3` bị chặn (`ERR_REVIVE_LIMIT_REACHED`); để cả đội chết → Boss reset `100% HP`, phục hồi 4 trụ đá, về Phase 1.
   - Hạ Boss khi túi đồ 1 người chơi đầy `40/40`: xác nhận vật phẩm tự chuyển nguyên tử sang `storageItems` (`bld_storage`), `accountFirstClearClaimed` khóa vĩnh viễn trên `accounts/<id>.json` (nhân vật thứ 2 cùng tài khoản không nhận lại `480 STARLIGHT_SHARD`), và giới hạn tuần đặt lại theo ISO week UTC Thứ Hai `00:00`.
5. **Post-MVP 5-Boss Data-Driven Verification**:
   - Chạy headless simulation harness kiểm chứng đủ 5 Boss (`boss_thornback_elder`, `boss_ignis_forgelord`, `boss_prism_leviathan`, `boss_boreas_frostking`, `boss_malakor_abyss` 4 phase có khóa `15%` HP `1.5s`).

---

## 3. Tham chiếu
- Thiết kế AI Quái vật: [`docs/game-design/15-monster-ai.md`](../../docs/game-design/15-monster-ai.md)
- Nguồn dữ liệu chuẩn: [`game-data/monsters.json`](../../game-data/monsters.json), [`game-data/bosses.json`](../../game-data/bosses.json)
- Lược đồ & Hợp đồng feature: [`data-model.md`](./data-model.md), [`contracts/dungeon-boss-contract.md`](./contracts/dungeon-boss-contract.md)
