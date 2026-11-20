# Quickstart Validation Guide: Real-Time Action Combat & 60-Skill Engine

**Feature**: `004-combat-skills`  
**Prerequisites**: `001-foundation-game-engine`, `002-auth-character`, `003-world-movement`.  
**Mode Note**: Hướng dẫn kiểm chứng áp dụng khi chuyển sang `IMPLEMENTATION MODE`; trong `DESIGN_AND_PLANNING_ONLY` không tạo mã nguồn production.

---

## 1. End-to-End Validation Scenarios (Khi đã Triển khai)

1. **Basic 3-Hit Combo, MP Restore & Server Damage Formula (`TS-CMB-001`)**:
   - Đưa `chr_kael_vanguard` vào `reg_whispering_forest`, thực hiện 3 `BASIC_ATTACK_REQ` trong cửa sổ `750 ms` và tung `skl_kael_act_blazing_lunge` + `skl_kael_ult_crimson_crescent` vào `mob_moss_slime` / `boss_thornback_elder`.
   - Kỳ vọng: Máy chủ xác thực hình học `ARC`/`LINE`/`PROJECTILE`, hồi `4 MP/hit` khi đánh trúng, áp dụng đúng khắc hệ `FIRE > EARTH (x1.25)` và phát `COMBAT_DAMAGE_EVENT` khớp `docs/balancing/combat-formulas.md`.
2. **Dodge `300 ms` i-Frame & Perfect Parry `200 ms` vs Regular Block (`TS-CMB-002`)**:
   - Gửi `DODGE_REQ` `100 ms` trước đòn tấn công quái: kỳ vọng trừ `20` Stamina, khóa CD `1,200 ms` (không giảm bởi CDR), nhận `0` sát thương và lướt `112 px` không xuyên tường.
   - Bật `BLOCK_STATE` `120 ms` trước đòn chạm: kích `Perfect Parry` (`0` damage, `+15` Stamina, phản `25%` Poise); bật `350 ms` trước đòn chạm: kích `Block` thường (giảm `60%` damage, `-12` Stamina, `1.0s` Guard Break khi Stamina về `0`).
3. **9-Element Reactions (ICD `2,000 ms`) & CC Diminishing Returns (`20s`)**:
   - Gắn `Chill` rồi đánh `FIRE` 2 lần trong `0.8s` → lần 1 kích `MELT (x1.35)`, lần 2 bị chặn bởi ICD `2,000 ms`.
   - Đánh `4` kỹ năng `STUN` (`1,200 ms`) liên tiếp vào 1 Elite trong `15s` → thời lượng thực tế giảm đúng `1,200 → 600 → 300 → 0 ms (IMMUNE)`.
4. **Hard Stat Caps & Anti-Cheat Rejection (`TS-CMB-003`, `SEC-010`, `SEC-013`)**:
   - Nạp trang bị/buff test vượt trần → xác nhận `StatCalculator` kẹp cứng `CritRate <= 75%`, `CritDamage <= 250%`, `CDR <= 40%`, `AttackSpeedMult <= 1.60x`, `DefPenPct <= 50%`, `ElementalRes ∈ [-35%, +70%]`.
   - Gửi payload chứa `damage: 999999`, bắn `SKILL_CAST_REQ` mỗi `100 ms` khi đang cooldown, và rút socket khi HP `5%` → xác nhận máy chủ bác bỏ gian lận, trả `ERR_SKILL_ON_COOLDOWN`, tăng `suspicionScore` và giữ nhân vật `5 giây` Combat Logout Grace.
5. **Ultimate Visual Readability (`TS-CMB-004`) & Death/Respawn Safety**:
   - Kích hoạt đồng thời 4 Ultimate khi `boss_thornback_elder` đang vẽ `SKILL_TELEGRAPH_EVENT` → xác nhận Layer `150–199` luôn đè lên Layer `100–149` (`alpha <= 0.45`), tắt được `Camera Shake = 0%` trong Settings, và khi tử trận/hồi sinh giữ nguyên `100%` trang bị.

---

## 2. Tham chiếu
- Công thức chiến đấu chuẩn: [`docs/balancing/combat-formulas.md`](../../docs/balancing/combat-formulas.md)
- Thiết kế combat & 60 kỹ năng: [`docs/game-design/06-combat-system.md`](../../docs/game-design/06-combat-system.md), [`docs/game-design/07-skill-system.md`](../../docs/game-design/07-skill-system.md)
- Danh mục 60 kỹ năng chuẩn: [`game-data/skills.json`](../../game-data/skills.json)
