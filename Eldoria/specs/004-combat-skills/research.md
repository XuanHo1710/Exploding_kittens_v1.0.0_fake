# Phase 0 Research: Real-Time Action Combat & 60-Skill Data-Driven Engine

**Feature**: `004-combat-skills`  
**Date**: 2026-11-19

---

## 1. Server-Authoritative 20 Hz Combat State Machine & Swept Hitbox Geometry

- **Decision**: Thực thi toàn bộ kiểm tra trúng đích (`ARC`, `CIRCLE`, `LINE`, `RECT`, `PROJECTILE`, `SELF`), khung `i-frame` (`300 ms` = `6 ticks`), cửa sổ `Perfect Parry` (`200 ms` = `4 ticks`) và vòng đời kỹ năng (`castTimeMs → startupMs → activeMs → recoveryMs`) bên trong vòng lặp `SimulationLoop` 20 Hz của `ZoneInstance`/`DungeonInstance` sử dụng `SpatialHashGrid` trong RAM từ feature `003`. Với đạn bay tốc độ cao (`<= 640 px/s` = `32 px/tick`), áp dụng thuật toán **Swept Segment-vs-Circle Collision** giữa tọa độ tick `t-1` và tick `t`.
- **Rationale**: Loại bỏ hoàn toàn lỗi đạn xuyên qua mục tiêu mỏng (tunneling) ở chu kỳ `50 ms/tick` mà không cần tăng tần số tick lên 60 Hz (giữ CPU budget gọn cho Modular Monolith Node.js), đồng thời đảm bảo `0%` tin cậy hit event từ animation phía client (Nguyên tắc II).
- **Alternatives considered (Rejected)**:
  - Tin cậy collision callback từ Phaser Arcade Physics phía client (bị từ chối tuyệt đối vì vi phạm Nguyên tắc II, dễ bị sửa hitbox/damage bằng DevTools).
  - Dùng Redis pub/sub để đồng bộ cooldown và combat state giữa các worker (bị từ chối theo Nguyên tắc I — 100% in-process RAM + Local JSON, zero Redis).

## 2. Data-Driven 60-Skill Interpreter Thay vì Hardcode 60 Class Kỹ năng

- **Decision**: Thiết kế `SkillExecutionEngine` đọc trực tiếp metadata từ `game-data/skills.json` (đã qua Zod validation khi boot ở feature `001`), kết hợp mẫu **Composable Effect Handler Registry** cho các hiệu ứng đặc thù (`eff_burn`, `eff_cyclone_pull`, `eff_parry_stance`, `eff_phantom_untargetable`, `eff_storm_dominion_zone`, `eff_dragonheart_awakening`...) thay vì viết 60 class lặp lại công thức damage/cooldown/validation.
- **Rationale**: Đáp ứng Nguyên tắc III (Single Source of Truth) — thay đổi chỉ số `cooldownMs`, `scalingRatio` hay `hitboxDimensions` trong `game-data/skills.json` tự động có hiệu lực ở cả server combat lẫn tooltip client mà không cần sửa code lõi; triển khai 15 kỹ năng MVP trước và mở rộng sang 45 kỹ năng còn lại chỉ cần đăng ký thêm effect handler chuyên biệt.
- **Alternatives considered (Rejected)**: Hardcode từng hàm kỹ năng chứa số liệu sát thương trực tiếp trong TypeScript (dễ gây lệch số giữa `skills.json`, `combat-formulas.md` và runtime).

## 3. Chiến lược Đảm bảo Khả năng Đọc Chiến trường (`Layer 150–199` Boss Telegraph) & Client-Only Hit-Stop

- **Decision**: Cố định bảng chiều sâu render trong `CombatVfxSystem` (Phaser 3): VFX vùng mặt đất của người chơi nằm tại `Depth 100–149` với `alpha <= 0.45` (tự động hạ thêm hệ số `0.50` cho đồng đội khi bật `Ally VFX Reduction`), trong khi `SKILL_TELEGRAPH_EVENT` của Boss luôn nằm tại `Depth 150–199` với viền đỏ/vàng pixel sắc nét `1–2 px`. Toàn bộ `hit-stop` (`40–65 ms`) chỉ tạm đóng băng bộ đếm frame của sprite liên quan trên máy client cục bộ, không bao giờ chạm vào `SimulationLoop` 20 Hz trên server.
- **Rationale**: Giữ trọn vẹn cảm giác va chạm mạnh kiểu *Hades* mà không tạo độ trễ/đóng băng cho 3 đồng đội còn lại trong Co-op 4 người và tuyệt đối tuân thủ Nguyên tắc V của Hiến pháp.
- **Alternatives considered (Rejected)**: Dùng global time-scale freeze trên cả scene khi Crit/Parry (gây lệch đồng bộ vị trí với server snapshot trong multiplayer).

## 4. Tách bạch Trạng thái Chiến đấu RAM vs Checkpoint JSON Cục bộ

- **Decision**: `CombatActorRuntime`, `SkillRuntimeExecution`, `ActiveStatusEffect` và `CcDiminishingTracker` tồn tại 100% trong RAM của `ZoneInstance` (`0` lượt ghi đĩa theo tick 20 Hz). Chỉ các trường bền vững (`Character.stats.currentHp/Mp/Stamina` qua `StaggeredDirtyFlusher` mỗi `30s` / khi đổi zone / tử trận / ngắt kết nối; và `Character.skills[]` khi người chơi bấm nâng bậc kỹ năng qua REST atomic write) mới được ghi vào `data/db/characters/<characterId>.json`.
- **Rationale**: Bảo vệ ổ đĩa SSD và giữ p99 tick `< 25 ms` (`proposed/unverified`) theo đúng Nguyên tắc I và Nguyên tắc IV.
- **Alternatives considered (Rejected)**: Lưu cooldown kỹ năng hoặc trạng thái buff từng giây xuống đĩa JSON hoặc Redis (vi phạm Nguyên tắc I & IV).
