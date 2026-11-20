# Phase 0 Research: Instanced Dungeons, 10-State Monster AI & Multi-Phase Boss Encounters

**Feature**: `011-dungeon-boss`  
**Date**: 2026-11-19

---

## 1. Ngân sách CPU cho AI 10 Trạng thái & Budgeted Octile A* trong Tick 20 Hz

- **Decision**: Biên dịch lớp `collision_layer` của bản đồ Tiled (`.tmj`) một lần khi tải Region/Dungeon thành `Uint8Array` phẳng (`1 byte/tile` `32×32 px`). Thực thi **Budgeted Octile A*** với giới hạn cứng tối đa `120 nodes` mở mỗi truy vấn, sử dụng một `BinaryMinHeap` tái sử dụng (object pooling, zero GC allocation mỗi tick), kết hợp **Line-of-Sight raycast** (bỏ qua A* khi đường thẳng thoáng) và phân tán lượt quét aggro/repath so le theo `instanceIndex % 5` (`250 ms` aggro scan, `333 ms` repath). Quái không có người chơi trong bán kính `1024 px` đi vào trạng thái `SLEEPING`.
- **Rationale**: Giữ thời gian xử lý AI phẳng và ổn định dưới ngân sách mục tiêu `< 6 ms` / tick `50 ms` cho `60` quái hoạt động đồng thời (`proposed / unverified`), bảo vệ sự mượt mà của vòng lặp 20 Hz (Nguyên tắc IV).
- **Alternatives considered**: Chạy A* không giới hạn node mỗi tick 20 Hz (bị từ chối vì gây spike CPU khi nhiều quái bị kẹt sau tường); dùng dịch vụ AI worker tách riêng qua Redis/queue (vi phạm Nguyên tắc I & IV).

## 2. Nguồn Chân lý Dữ liệu Duy nhất cho 5 Boss & 38 Quái (`game-data/*.json`)

- **Decision**: Toàn bộ cấu hình Boss (ngưỡng Phase `100/65/30` cho `boss_thornback_elder` và `100/70/40/15` cho `boss_malakor_abyss`, `poiseBreakDurationMs: 6000`, `damageTakenMultiplier: 1.4`, `weaknessPoiseBonusMultiplier: 1.5`, `enrageTimerSeconds: 360`, `partyScaling`, `arena.safePillars`, `arena.hazards`, `rewards`) được nạp trực tiếp từ `GameCatalogLoader` (`game-data/bosses.json` & `game-data/monsters.json`). Tuyệt đối không hardcode ngưỡng Phase hay hệ số Stagger trong mã nguồn service.
- **Rationale**: Tuân thủ nghiêm ngặt Nguyên tắc III; loại bỏ hoàn toàn sai lệch số liệu giữa tài liệu phác thảo ban đầu (từng đề cập 70%/35% hay 5s/x1.35) với thông số cân bằng đã kiểm chứng trong `game-data/bosses.json`.
- **Alternatives considered**: Viết class hardcode riêng từng con số cho mỗi Boss (bị từ chối vì khó bảo trì, gây lệch giữa catalog, UI tooltip và combat server).

## 3. Khả năng Đọc Chiến trường của Boss Telegraph (Layer `180–199` Unlit + Colorblind Geometry)

- **Decision**: Phân bổ dải chiều sâu chuyên biệt **`Depth 180–199`** trong lớp Ground Decals & Telegraphs (`Depth 100–199` của Phaser `DungeonScene`/`WorldScene`) dành riêng cho Boss/Elite Attack Telegraphs với shader/blend không chịu ảnh hưởng tối màn hình ban đêm (unlit), nằm dưới bóng đổ (`200–299`) và nhân vật (`1000..99999`). Đồng thời giới hạn độ đục (`alpha <= 0.65`) của VFX kỹ năng/Ultimate người chơi ở tầng trên (`100000–109999`), và vẽ kết hợp viền nét đứt chuyển động tâm + họa tiết gạch chéo + icon `[!]` (kèm tùy chọn màu Xanh/Vàng cho người mù màu đỏ-lục) với giới hạn cứng `<= 3 flashes/s`.
- **Rationale**: Đáp ứng đồng thời Nguyên tắc V (Ultimate không bao giờ che khuất Boss telegraph) và chuẩn trợ năng WCAG 1.4.1 / 2.3.1.
- **Alternatives considered**: Vẽ telegraph cùng tầng với VFX hạt (`100000+`, sẽ che nhân vật hoặc bị Ultimate đè mất); chỉ dùng vòng tròn đỏ đồng màu (khó nhìn với người Protanopia/Deuteranopia trên nền cỏ xanh của `reg_whispering_forest`).

## 4. Cô lập `DungeonInstance` RAM & Chống Lạm dụng Phần thưởng JSON Cục bộ

- **Decision**: Mỗi lượt chinh phục Hầm ngục cấp phát một `DungeonInstanceRuntime` độc lập trong `DungeonInstanceManager` (RAM) kế thừa cùng pipeline 8 pha của `SimulationLoop` 20 Hz. Khi Boss bị hạ, `BossRewardDistributor` khóa các aggregate đích theo thứ tự từ điển (`["account:<accId>", "character:<charId>", "house:<charId>", "inventory:<charId>", "ledger:<YYYY-MM>"]`) qua `JsonDatabaseEngine` Multi-File WAL để:
  1. Kiểm tra & đánh dấu bất biến `accountFirstClearClaimed` trong `data/db/accounts/<accountId>.json` (chống tạo nhân vật phụ cày lặp `starlightShardsFirstClear`).
  2. Kiểm tra `weeklyResetIsoWeek` (`UTC Monday 00:00`) cho `weeklyStarlightClaimed` và `weeklyBossTokensEarned`.
  3. Ghi chiến lợi phẩm vào túi đồ, tự động chuyển phần dư sang `storageItems` (`bld_storage`) nếu túi đầy `40/40`.
- **Rationale**: Đảm bảo 100% tính nguyên tử, 0 mất loot Boss, 0 lạm phát nội tệ Gacha và 100% lưu trữ JSON cục bộ không dùng PostgreSQL/Redis (Nguyên tắc I, II, VI).
- **Alternatives considered**: Lưu cờ First Clear chỉ trên `characters/<id>.json` (dễ bị khai thác bằng cách tạo-xóa nhân vật phụ cày `480 STARLIGHT_SHARD` liên tục); rơi toàn bộ thưởng Boss xuống đất chờ nhặt (rủi ro rớt mạng/túi đầy làm mất rương hiếm).
