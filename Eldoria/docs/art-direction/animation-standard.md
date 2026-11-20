# Animation Design Standard — Eldoria: Forgotten Wilds

**Trạng thái**: Design Baseline v1.0  
**Chế độ**: `DESIGN_AND_PLANNING_ONLY`  
**Cập nhật lần cuối**: 2026-11-19  
**Tài liệu liên kết**: [Art Bible](./art-bible.md), [Character Design Standard](./character-design-standard.md), [Animation State Machine](./animation-state-machine.md), [Sprite Sheet Standard](./sprite-sheet-standard.md), [WebSocket Contracts](../architecture/websocket-contracts.md)

---

## 1. Tổng quan Animation Pipeline

Hệ thống hoạt ảnh của **Eldoria: Forgotten Wilds** được thiết kế cho 6 nhóm thực thể cốt lõi: **Humanoid (Nhân vật & NPC)**, **Monster (Quái thường & Elite)**, **Animal (Động vật chăn nuôi)**, **Boss**, **Projectile (Đạn đạo)** và **Interactive Object (Tài nguyên, Cửa, Rương, Cây trồng)**.

### Nguyên lý Chuyển động 16-Bit Action RPG
- **Anticipation — Impact — Follow-Through**: Mọi đòn đánh và kỹ năng đều tuân thủ cấu trúc 3 pha rõ ràng khớp với đồng hồ chiến đấu trên server (`startupMs` → `activeMs` → `recoveryMs`). Khung nén lực (`Anticipation`) giúp người chơi và đồng đội đọc được nhịp đánh; khung tác động (`Impact`) sử dụng kỹ thuật **smear frame** 1–2 khung hình sắc nét (không blur) để tăng uy lực.
- **Tách nhịp Animation khỏi Tốc độ Render**: Client render ở mục tiêu **60 FPS (`proposed/unverified`)**, trong khi mỗi frame pixel art được giữ từ `50 ms` đến `220 ms` (tương đương 4.5–20 FPS hoạt ảnh) để bảo toàn cảm giác dứt khoát đặc trưng 16-bit.
- **Tốc độ Biến thiên theo Chỉ số (Attack Speed & Move Speed Scaling)**: Chỉ số `attackSpeed` (từ trang bị hoặc Passive như `skl_kael_pas_forged_resolve`) và `moveSpeed` điều chỉnh hệ số `animSpeedScale` trên client theo công thức giới hạn an toàn `clamp(animSpeedScale, 0.5, 2.0)` — luôn do server truyền xuống, không bao giờ để client tự tăng tốc gây lỗi đồng bộ.

---

## 2. Chiến lược Hướng (4-Direction MVP & 8-Direction Extension Architecture)

### 2.1 Chuẩn 4 Hướng cho MVP (`Direction4`)
| Enum `Direction4` | Góc Aim `aimAngle` (Độ) | Quy ước Vẽ Pixel | Quy tắc Mirror Ngang (Horizontal Flip) |
| :---: | :---: | :--- | :--- |
| **`DOWN`** (Nam) | `45° .. 135°` | Mặt hướng về camera (góc 3/4 nhìn từ trên). | Không flip. |
| **`UP`** (Bắc) | `-135° .. -45°` | Quay lưng về camera, nổi bật áo choàng/ống tên/vũ khí sau lưng. | Không flip. |
| **`RIGHT`** (Đông) | `-45° .. 45°` | Nghiêng 3/4 sang phải, lộ rõ tay thuận cầm vũ khí. | Không flip (hướng gốc vẽ tay chuẩn). |
| **`LEFT`** (Tây) | `135° .. 180°` hoặc `-180° .. -135°` | Nghiêng 3/4 sang trái. | **Nhân vật chính bất đối xứng (Kael, Bram...)**: Vẽ tay riêng cả `LEFT` và `RIGHT` cho Combat/Locomotion để tránh lỗi đảo tay cầm khiên/kiếm. **Quái đối xứng, động vật & anim phụ (`EMOTE`, `CRAFTING`)**: Cho phép mirror từ `RIGHT` khi cờ `allowHorizontalFlip: true` được bật rõ trong metadata. |

### 2.2 Kiến trúc Mở rộng 8 Hướng (Post-MVP Roadmap — M3+)
Để không phá vỡ giao thức mạng hay cấu trúc JSON khi nâng cấp lên 8 hướng cho bản đồ rộng và hành động chéo mượt hơn:
- Kiểu dữ liệu `FacingDirection` trong `packages/shared` chấp nhận sẵn cả 4 hướng chuẩn lẫn 4 hướng chéo phụ: `DOWN`, `UP`, `LEFT`, `RIGHT`, `DOWN_RIGHT`, `DOWN_LEFT`, `UP_RIGHT`, `UP_LEFT`.
- Trong **MVP**, `AnimationController.ts` chạy bộ phân giải fallback tự động (`resolveDirectionKey`):
  - `DOWN_RIGHT` / `UP_RIGHT` → fallback sang `RIGHT` nếu atlas chưa có key chéo tương ứng.
  - `DOWN_LEFT` / `UP_LEFT` → fallback sang `LEFT`.
- Khi họa sĩ bổ sung thêm frame 8 hướng cho một nhân vật cụ thể sau MVP, chỉ cần đóng gói thêm key `<dir8>` vào atlas và đặt `directionalMode: "8_DIR"` trong sidecar JSON — **không cần sửa logic game server hay WebSocket contract**.

---

## 3. Phân tách Tuyệt đối: Client Visual Animation vs Server-Authoritative Combat State

> **QUY TẮC BẮT BUỘC (Constitution Principle II — NON-NEGOTIABLE)**:  
> **Client animation event (`hitFrame`, `projectileSpawnFrame`, `onAnimationComplete`) TUYỆT ĐỐI KHÔNG BAO GIỜ được gửi lên server làm căn cứ xác nhận sát thương, hồi chiêu hay hoàn tất hành động.**

| Khía cạnh | Client Phaser (`AnimationController.ts` — 60 FPS) | Game Server NestJS (`CombatSimulation` — 20 Hz / 50 ms tick) |
| :--- | :--- | :--- |
| **Nguồn chân lý** | Chỉ là **tầng trình diễn hình ảnh & âm thanh** (Visual Presentation Layer). | **Nguồn chân lý duy nhất (Single Source of Truth)** cho toàn bộ trạng thái chiến đấu. |
| **Thời điểm Gây sát thương** | `hitFrame` kích hoạt vệt chém (slash VFX), tiếng vung kiếm (SFX) và dự đoán tia lửa chạm nhẹ (nếu bật). Số damage, hit-flash và hit-stop **chỉ chạy khi nhận `COMBAT_DAMAGE_EVENT` từ Server**. | Server đếm chính xác cửa sổ `startupMs` → `activeMs` → `recoveryMs` đọc từ `game-data/skills.json` và `game-data/characters.json`, tự tính giao cắt hình học (Arc / Circle / Line / Cone / Projectile ray) với Server Hurtbox (`24×34 px`). |
| **Chống Gian lận (Animation Speed Hack)** | Nếu kẻ gian dùng DevTools/Cheat Engine tăng `timeScale` animation Phaser lên 10x để chạy `hitFrame` liên tục... | ...Server **hoàn toàn bỏ qua**, vì server không hề nghe sự kiện `hitFrame` từ client; cooldown, stamina và cửa sổ `activeMs` bị khóa cứng theo `serverTick` 20 Hz. |
| **Thời điểm Sinh Đạn đạo** | `projectileSpawnFrame` hiển thị hoạt ảnh mũi tên/quả cầu rời cung/trượng mượt mắt. | Server tự khởi tạo `ServerProjectileEntity` đúng tại tick `castTick + Math.round(startupMs / 50)` và đồng bộ vị trí thực qua snapshot. |
| **Cancel Window** | Khung hình `cancelWindow` cho phép client xóa khóa input cục bộ và chuyển animation sớm để người chơi cảm thấy phản hồi tức thì. | Server kiểm tra độc lập điều kiện `elapsedActionMs >= cancelableFromMs` trước khi chấp nhận gói tin `DODGE_REQ` hoặc `BASIC_ATTACK_REQ` kế tiếp. |

---

## 4. Đặc tả Đầy đủ Toàn bộ 25 Trạng thái Animation Chuẩn (Master 25-State Humanoid Matrix)

Bảng dưới đây quy định chuẩn cho toàn bộ **25 trạng thái animation bắt buộc** (Humanoid `48×64 px`, Pivot `(24, 58)` px, 4 hướng MVP `DOWN/UP/LEFT/RIGHT`, mở rộng 8 hướng qua fallback `resolveDirectionKey`).  
*Quy ước đường dẫn*: `<hero>` là `characterId` (ví dụ `chr_kael_vanguard`), `<dir>` là `down | up | left | right`. Các thông số Combat khớp đồng bộ với mẫu `chr_kael_vanguard` (`game-data/characters.json` & `skills.json`).

### 4.1 Nhóm A — Di chuyển (Locomotion: States 1–4)

| # | State & `animationKey` | Directions (MVP / Ext) | `frameCount` | `frameDurationMs` (Tổng) | `loop` | `spriteSize` & `pivotPoint` | `cancelWindow` | `transitionCondition` | `hitFrame` / `projectileSpawnFrame` | `vfxAttachmentPoint` | `sfxTrigger` | `assetPath` |
| :-: | :--- | :---: | :-: | :---: | :-: | :---: | :--- | :--- | :---: | :--- | :--- | :--- |
| **1** | **Idle**<br>`<hero>_idle_<dir>` | 4-dir MVP<br>*(8-dir fallback)* | `4` | `[220, 220, 220, 220]`<br>*(880 ms)* | `LOOP` | `48×64`<br>`(24, 58)` | Mọi frame (`0..3`) | **Vào**: Tốc độ = 0 và không có hành động ưu tiên cao hơn.<br>**Thoát**: Bất kỳ input hợp lệ nào. | `N/A` / `N/A` | `feet_center (24,58)`, `weapon_anchor` | Không phát SFX | `assets/atlases/characters/atlas_<hero>.json#<hero>/idle/<dir>_00..03` |
| **2** | **Walk**<br>`<hero>_walk_<dir>` | 4-dir MVP<br>*(8-dir planned)* | `6` | `[130, 130, 130, 130, 130, 130]`<br>*(780 ms)* | `LOOP` | `48×64`<br>`(24, 58)` | Mọi frame (`0..5`) | **Vào**: Di chuyển chậm (vùng an toàn/nông trại, `speed <= 95 px/s` hoặc phím Walk toggle).<br>**Thoát**: Dừng → `IDLE`; tăng tốc → `RUN`/`SPRINT`; Combat/Gather. | `N/A` / `N/A` | `feet_dust (24,58)` (nhẹ) | F1, F4: `sfx_step_<surface>_soft` | `assets/atlases/characters/atlas_<hero>.json#<hero>/walk/<dir>_00..05` |
| **3** | **Run**<br>`<hero>_run_<dir>` | 4-dir MVP<br>*(8-dir planned)* | `6` | `[90, 90, 90, 90, 90, 90]`<br>*(540 ms)* | `LOOP` | `48×64`<br>`(24, 58)` | Mọi frame (`0..5`) | **Vào**: Di chuyển chuẩn (`95 < speed <= baseMoveSpeed`, ví dụ `152 px/s` của Kael).<br>**Thoát**: Dừng → `IDLE`; giữ Shift + còn Stamina → `SPRINT`; Combat/Dodge. | `N/A` / `N/A` | `feet_dust (24,58)` (bụi nhỏ F1, F4) | F1, F4: `sfx_step_<surface>_run` | `assets/atlases/characters/atlas_<hero>.json#<hero>/run/<dir>_00..05` |
| **4** | **Sprint**<br>`<hero>_sprint_<dir>` | 4-dir MVP<br>*(8-dir planned)* | `6` | `[70, 70, 70, 70, 70, 70]`<br>*(420 ms)* | `LOOP` | `48×64`<br>`(24, 58)` | Mọi frame (`0..5`) | **Vào**: Giữ phím Sprint + `stamina > 0` (`1.35x moveSpeed`, nghiêng thân 15° về trước).<br>**Thoát**: Thả Sprint hoặc `stamina == 0` → `RUN`; dừng → `IDLE`; Dodge/Attack. | `N/A` / `N/A` | `feet_dust (24,58)` + `cloak_trail (24,36)` | F0, F3: `sfx_step_<surface>_sprint` | `assets/atlases/characters/atlas_<hero>.json#<hero>/sprint/<dir>_00..05` |

### 4.2 Nhóm B — Chiến đấu & Kỹ năng (Combat & Skills: States 5–9)

| # | State & `animationKey` | Directions (MVP / Ext) | `frameCount` | `frameDurationMs` (Tổng) | `loop` | `spriteSize` & `pivotPoint` | `cancelWindow` | `transitionCondition` | `hitFrame` / `projectileSpawnFrame` | `vfxAttachmentPoint` | `sfxTrigger` | `assetPath` |
| :-: | :--- | :---: | :-: | :---: | :-: | :---: | :--- | :--- | :---: | :--- | :--- | :--- |
| **5** | **Attack** *(Đòn cơ bản đơn / Nhịp 1)*<br>`<hero>_atk_combo_1_<dir>` | 4-dir MVP<br>*(8-dir aim VFX)* | `5` | `[60, 60, 55, 55, 170]`<br>*(400 ms; Startup 120 / Active 110 / Rec 170)* | `ONCE` | `48×64`<br>`(24, 58)` | **F4 (`230–400 ms`)**: Cancel sang `COMBO_2`, `DODGE`, `SKILL`, `BLOCK`. | **Vào**: `BASIC_ATTACK_REQ` (đủ Stamina, không CC).<br>**Thoát**: Bấm tiếp trong cancel window → `ATTACK_COMBO`; hết F4 → `IDLE`/`RUN`. | **Hit**: `F2` (Melee)<br>**Proj**: `F2` (Ranged như Lyra `lyra_atk_shot_1`) | `weapon_arc_origin (24,40)` hoặc `bow_tip` | F1: `sfx_wpn_<type>_swing_1`<br>F2: `sfx_hit_confirm` *(chỉ khi server xác nhận)* | `assets/atlases/characters/atlas_<hero>.json#<hero>/atk_combo_1/<dir>_00..04` |
| **6** | **Attack Combo** *(Nhịp 2 & Nhịp 3 Finisher)*<br>`<hero>_atk_combo_2_<dir>`<br>`<hero>_atk_combo_3_<dir>` | 4-dir MVP<br>*(8-dir aim VFX)* | Hit 2: `5`<br>Hit 3: `6` | Hit 2: `[55, 55, 55, 55, 180]` *(400 ms)*<br>Hit 3: `[65, 65, 55, 55, 95, 115]` *(450 ms)* | `ONCE` | `48×64`<br>`(24, 58)` | Hit 2: **F4 (`220–400 ms`)** → Hit 3 / Dodge / Skill.<br>Hit 3: **F5 (`335–450 ms`)** → Dodge / Skill / Move. | **Vào**: Chuỗi `BASIC_ATTACK_REQ` trong cửa sổ combo (`<= 600 ms` sau hit trước).<br>**Thoát**: Hết Hit 3 → `IDLE`/`RUN`; đổi hướng được phép tại đầu mỗi hit. | Hit 2: `F2` / `F2`<br>Hit 3: `F2–F3` / `F2` | `weapon_arc_origin (24,40)` + `ground_impact` (Hit 3) | Hit 2 F1: `sfx_wpn_swing_2`<br>Hit 3 F1: `sfx_wpn_heavy_3` + `sfx_elem_<el>_burst` | `assets/atlases/characters/atlas_<hero>.json#<hero>/atk_combo_2/<dir>_00..04` & `.../atk_combo_3/<dir>_00..05` |
| **7** | **Cast** *(Niệm chú / Tụ lực trước Skill hoặc Ultimate)*<br>`<hero>_cast_<dir>` | 4-dir MVP<br>*(8-dir fallback)* | `4` | `[60, 60, 60, 60]`<br>*(240 ms/loop; kéo dài theo `castTimeMs` kỹ năng)* | `LOOP` *(trong suốt `castTimeMs`)* | `48×64`<br>`(24, 58)` | `0–100 ms` đầu có thể tự hủy bằng `DODGE` (nếu skill cho phép `cancelableCast`). | **Vào**: `SKILL_CAST_REQ` với skill có `castTimeMs > 0` (ví dụ `skl_kael_ult_crimson_crescent` `240 ms`, phép Mage/Healer).<br>**Thoát**: Hết `castTimeMs` → `SKILL` hoặc `ULTIMATE`; bị CC → `STUN`/`KNOCKBACK`. | `N/A` / `N/A` | `cast_circle_feet (24,58)` + `hand_focus (24,34)` | F0: `sfx_cast_charge_<element>` | `assets/atlases/characters/atlas_<hero>.json#<hero>/cast/<dir>_00..03` |
| **8** | **Skill** *(Thực thi Active Skill 1/2/3)*<br>`<hero>_skill_<slot>_<dir>`<br>*(VD: `kael_skill_blazing_lunge`)* | 4-dir MVP<br>*(8-dir VFX rotate)* | `6` | Biến thiên theo `skills.json`: VD `Blazing Lunge` `[70, 70, 75, 75, 70, 180]` *(540 ms: Start 140 / Act 220 / Rec 180)* | `ONCE` | `48×64`<br>`(24, 58)` | **F5 (Recovery `>= 65%` cuối)** → `DODGE`, `BLOCK`, `ULTIMATE`. | **Vào**: Server xác nhận `SKILL_CAST_ACK` (hoặc sau pha `CAST`).<br>**Thoát**: Hoàn tất recovery → `IDLE`/`RUN`. | **Hit**: `F2–F3`<br>**Proj**: `F2` (nếu skill projectile) | `weapon_tip` + `body_center (24,38)` + `ground_trail (24,58)` | F0: `sfx_voice_effort`<br>F2: `<skill.sfxKey>` (từ `skills.json`) | `assets/atlases/characters/atlas_<hero>.json#<hero>/skill_<slot>/<dir>_00..05` |
| **9** | **Ultimate** *(Kỹ năng Tối thượng)*<br>`<hero>_ult_<slug>_<dir>`<br>*(VD: `kael_ult_crimson_crescent`)* | 4-dir MVP<br>*(8-dir VFX rotate)* | `8` | VD `Crimson Crescent` (sau 240 ms `CAST`): `[85, 85, 90, 120, 150, 165, 165, 260]` *(1120 ms: Start 260 / Act 600 / Rec 260)* | `ONCE` | `48×64`<br>`(24, 58)` | **F7 (`130 ms` cuối Recovery)** → `DODGE` / Move. Miễn ngắt bởi `HIT` nhẹ (Super Armor). | **Vào**: Ultimate đủ năng lượng/cooldown, sau pha `CAST` (nếu có).<br>**Thoát**: Hoàn tất F7 → `IDLE`/`RUN`; bị gián đoạn duy nhất bởi `DEATH` hoặc Boss Wipe CC đặc biệt. | **Hit**: `F3–F6`<br>**Proj**: `F3` (sóng kiếm khí / mưa tên) | `chest_core (24,36)` + `ground_sigil (24,58)` + `weapon_tip` | F0: `sfx_ult_activate`<br>F3: `<ult.sfxKey>` (`sfx_kael_crimson_crescent_slash`) | `assets/atlases/characters/atlas_<hero>.json#<hero>/ult/<dir>_00..07` |

### 4.3 Nhóm C — Cơ động, Phòng thủ & Phản ứng Trúng đòn (Mobility, Defense & Reactions: States 10–17)

| # | State & `animationKey` | Directions (MVP / Ext) | `frameCount` | `frameDurationMs` (Tổng) | `loop` | `spriteSize` & `pivotPoint` | `cancelWindow` | `transitionCondition` | `hitFrame` / `projectileSpawnFrame` | `vfxAttachmentPoint` | `sfxTrigger` | `assetPath` |
| :-: | :--- | :---: | :-: | :---: | :-: | :---: | :--- | :--- | :---: | :--- | :--- | :--- |
| **10** | **Dodge** *(Né tránh có i-frame 300 ms)*<br>`<hero>_dodge_<dir>` | 4-dir MVP<br>*(8-dir vector move)* | `5` | `[50, 75, 75, 100, 100]`<br>*(400 ms; Server i-frame `0–300 ms` = F0..F3)* | `ONCE` | `48×64`<br>`(24, 58)` | **F4 (`300–400 ms`)**: Cancel sang `ATTACK`, `SKILL`, `RUN`, `BLOCK`. | **Vào**: `DODGE_REQ` (tốn 20 Stamina, CD 1200 ms; có thể cancel Recovery của Attack/Skill/Gather).<br>**Thoát**: Hết F4 → `RUN`/`IDLE`. | `N/A` / `N/A` | `feet_dust (24,58)` + `afterimage_ghost` (alpha 0.35 ở F1–F2) | F0: `sfx_dodge_whoosh` | `assets/atlases/characters/atlas_<hero>.json#<hero>/dodge/<dir>_00..04` |
| **11** | **Dash** *(Lướt tốc độ cao / Áp sát kỹ năng)*<br>`<hero>_dash_<dir>` | 4-dir MVP<br>*(8-dir vector move)* | `4` | `[55, 65, 65, 65]`<br>*(250 ms; lặp F1–F2 nếu quãng lướt dài)* | `ONCE` *(hoặc `LOOP` trong lúc đang dịch chuyển)* | `48×64`<br>`(24, 58)` | **F3 (65 ms cuối)**: Cancel sang `ATTACK` / `SKILL` / `DODGE`. | **Vào**: Kỹ năng cơ động (VD `Zephyr Vault`, `Blazing Lunge` giai đoạn di chuyển, `Phantom Sever`).<br>**Thoát**: Đạt điểm đích hoặc va tường → `SKILL` follow-up / `IDLE`. | `N/A` *(trừ skill có hitbox thân)* / `N/A` | `body_center (24,38)` + `wind_streak` phía sau lưng | F0: `sfx_dash_burst` | `assets/atlases/characters/atlas_<hero>.json#<hero>/dash/<dir>_00..03` |
| **12** | **Hit** *(Khựng nhẹ khi trúng đòn)*<br>`<hero>_hit_<dir>` | 4-dir MVP<br>*(8-dir fallback)* | `3` | `[50, 70, 80]`<br>*(200 ms)* | `ONCE` | `48×64`<br>`(24, 58)` | **F2 (`120–200 ms`)**: Cancel sang `DODGE` hoặc `BLOCK`. | **Vào**: `COMBAT_DAMAGE_EVENT` (không có i-frame, không Block thành công, không Ultimate Super Armor).<br>**Thoát**: Hết F2 → `IDLE`/`RUN`; HP về 0 → `DEATH`. | `N/A` / `N/A` | `chest_core (24,36)` (tia trúng đòn + hit flash 50 ms `#FFF8E7`) | F0: `sfx_char_hurt` + `sfx_armor_hit` | `assets/atlases/characters/atlas_<hero>.json#<hero>/hit/<dir>_00..02` |
| **13** | **Knockback** *(Bị hất văng / Đẩy lùi)*<br>`<hero>_knockback_<dir>` | 4-dir MVP<br>*(8-dir fallback)* | `4` | `[60, 100, 120, 120]`<br>*(400 ms; đồng bộ thời gian đẩy từ Server)* | `HOLD_LAST` *(đến khi chạm đất ổn định)* | `48×64`<br>`(24, 58)` | **Không thể cancel** (trừ kỹ năng Giải Khống chế đặc biệt nếu có ở Post-MVP). | **Vào**: `COMBAT_DAMAGE_EVENT` kèm trường `knockback` (VD `Heartwood Charge`, đòn đập Boss).<br>**Thoát**: Hết thời gian đẩy → `IDLE` (hoặc `STUN` nếu va tường/trạng thái kèm theo). | `N/A` / `N/A` | `feet_skid_dust (24,58)` | F0: `sfx_knockback_impact`<br>F2: `sfx_body_slide` | `assets/atlases/characters/atlas_<hero>.json#<hero>/knockback/<dir>_00..03` |
| **14** | **Stun** *(Choáng / Trói cứng / Đóng băng)*<br>`<hero>_stun_<dir>` | 4-dir MVP<br>*(8-dir fallback)* | `4` | `[140, 140, 140, 140]`<br>*(560 ms/loop)* | `LOOP` *(suốt `stunDurationMs`)* | `48×64`<br>`(24, 58)` | **Không thể cancel** bằng phím di chuyển hay đánh. | **Vào**: Nhận hiệu ứng CC cứng (`STUN`, `FREEZE`, `PETRIFY`) từ Server.<br>**Thoát**: Hết hiệu ứng hoặc được đồng đội thanh tẩy (`Cleanse`) → `IDLE`; HP = 0 → `DEATH`. | `N/A` / `N/A` | `overhead_status (24,10)` (vòng sao choáng quay chậm) | F0: `sfx_status_stun_start` | `assets/atlases/characters/atlas_<hero>.json#<hero>/stun/<dir>_00..03` |
| **15** | **Block** *(Đỡ đòn & Cửa sổ Perfect Parry 200 ms)*<br>`<hero>_block_<dir>` | 4-dir MVP<br>*(8-dir fallback)* | `3` | `[50, 150, 120]`<br>*(F0–F1 = 200 ms Perfect Parry stance; F2 = Hold Guard)* | `HOLD_LAST` *(F2 giữ đến khi thả phím)* | `48×64`<br>`(24, 58)` | Mọi thời điểm sau `100 ms`: Thả Block → `IDLE`; bấm `DODGE` → `DODGE`. | **Vào**: `BLOCK_STATE { active: true }` (vũ khí hỗ trợ Block/Parry).<br>**Thoát**: Thả phím Block, cạn Stamina (Guard Break → `STUN` 1000 ms), hoặc phản công thành công (`Parry Flash`). | `N/A` / `N/A` | `front_guard (24±10, 38)` (vòng sáng mảnh 200 ms đầu cho Parry) | F0: `sfx_guard_raise`<br>On Block: `sfx_block_clang` / `sfx_perfect_parry_ring` | `assets/atlases/characters/atlas_<hero>.json#<hero>/block/<dir>_00..02` |
| **16** | **Death** *(Gục ngã)*<br>`<hero>_death_<dir>` | 2-dir (`LEFT`/`RIGHT` hoặc 4-dir MVP) | `6` | `[90, 90, 100, 110, 130, 180]`<br>*(700 ms)* | `HOLD_LAST` | `48×64`<br>`(24, 58)` | **Không thể cancel** (Priority tối thượng Tier 10). | **Vào**: Server gửi `PLAYER_DEATH` (`hp <= 0`).<br>**Thoát**: Chỉ thoát khi nhận `PLAYER_RESPAWN` từ Server. | `N/A` / `N/A` | `body_center (24,46)` (hạt sáng mờ tan nhẹ) | F0: `sfx_char_defeat`<br>F4: `sfx_body_fall` | `assets/atlases/characters/atlas_<hero>.json#<hero>/death/<dir>_00..05` |
| **17** | **Respawn** *(Hồi sinh tại Làng / Cổng Dungeon)*<br>`<hero>_respawn_down` | `DOWN` *(chuẩn mặc định sau hồi sinh)* | `6` | `[100, 100, 100, 100, 100, 100]`<br>*(600 ms)* | `ONCE` | `48×64`<br>`(24, 58)` | **F5 (`500–600 ms`)**: Cancel sang `RUN`/`IDLE`. | **Vào**: Server gửi `PLAYER_RESPAWN` sau khi chọn điểm hồi sinh hoặc được Healer cứu.<br>**Thoát**: Hết F5 → `IDLE` (kèm khiên bảo hộ hồi sinh 3s bán trong suốt). | `N/A` / `N/A` | `feet_center (24,58)` (cột sáng vàng dịu không strobe) | F0: `sfx_respawn_chime` | `assets/atlases/characters/atlas_<hero>.json#<hero>/respawn/down_00..05` |

### 4.4 Nhóm D — Thu thập, Nông trại, Chế tạo & Tương tác (Life-Sim & Social: States 18–25)

| # | State & `animationKey` | Directions (MVP / Ext) | `frameCount` | `frameDurationMs` (Tổng) | `loop` | `spriteSize` & `pivotPoint` | `cancelWindow` | `transitionCondition` | `hitFrame` / `projectileSpawnFrame` | `vfxAttachmentPoint` | `sfxTrigger` | `assetPath` |
| :-: | :--- | :---: | :-: | :---: | :-: | :---: | :--- | :--- | :---: | :--- | :--- | :--- |
| **18** | **Mining** *(Đào quặng / Đập đá)*<br>`<hero>_mining_<dir>` | 4-dir MVP<br>*(8-dir fallback)* | `5` | `[110, 110, 70, 90, 120]`<br>*(500 ms/nhịp)* | `LOOP` *(đến khi node vỡ hoặc hủy)* | `48×64`<br>`(24, 58)` | Mọi frame (`0..4`): Di chuyển / `DODGE` / `HIT` ngắt tức thì. | **Vào**: `INTERACT_REQ` vào `ORE`/`STONE` node (còn Stamina).<br>**Thoát**: Node vỡ (rơi quặng) → `IDLE`; bấm di chuyển/né → hủy. | **Impact Visual**: `F2` (tia lửa quặng) / `N/A` | `tool_tip` (tọa độ đầu cuốc chim theo hướng) | F2: `sfx_mine_pickaxe_clink` | `assets/atlases/characters/atlas_<hero>.json#<hero>/mining/<dir>_00..04` |
| **19** | **Woodcutting** *(Chặt cây lấy gỗ)*<br>`<hero>_woodcut_<dir>` | 4-dir MVP<br>*(8-dir fallback)* | `5` | `[110, 100, 70, 100, 120]`<br>*(500 ms/nhịp)* | `LOOP` | `48×64`<br>`(24, 58)` | Mọi frame (`0..4`): Di chuyển / `DODGE` / `HIT` ngắt tức thì. | **Vào**: `INTERACT_REQ` vào `TREE` node.<br>**Thoát**: Cây đổ (rơi gỗ) → `IDLE`; hủy bằng di chuyển/né. | **Impact Visual**: `F2` (mảnh vỏ gỗ + rung tán cây) / `N/A` | `tool_tip` (đầu lưỡi rìu) | F2: `sfx_woodcut_chop` | `assets/atlases/characters/atlas_<hero>.json#<hero>/woodcut/<dir>_00..04` |
| **20** | **Farming** *(Cuốc đất / Gieo hạt / Tưới nước)*<br>`<hero>_farm_hoe_<dir>`<br>`<hero>_farm_water_<dir>` | 4-dir MVP<br>*(8-dir fallback)* | `4` *(mỗi biến thể)* | `[90, 90, 110, 110]`<br>*(400 ms)* | `ONCE` | `48×64`<br>`(24, 58)` | **F3 (`290–400 ms`)** hoặc ngắt ngay bằng `DODGE`/`HIT`. | **Vào**: Tương tác ô đất nông trại (cuốc đất, gieo `sed_*`, tưới nước, thu hoạch `crp_*`).<br>**Thoát**: Hết F3 → `IDLE`. | **Soil/Water Visual**: `F2` (văng đất hoặc giọt nước) / `N/A` | `front_tile (24±16, 56)` | F2: `sfx_farm_hoe` / `sfx_farm_water_pour` / `sfx_farm_harvest` | `assets/atlases/characters/atlas_<hero>.json#<hero>/farm_hoe/<dir>_00..03` & `.../farm_water/<dir>_00..03` |
| **21** | **Fishing** *(Quăng cần / Chờ cá / Kéo cần)*<br>`<hero>_fish_cast_<dir>`<br>`<hero>_fish_idle_<dir>`<br>`<hero>_fish_reel_<dir>` | 4-dir MVP<br>*(ưu tiên hướng mặt nước)* | Cast: `4`<br>Idle: `2`<br>Reel: `4` | Cast: `[90×4]` *(360 ms)*<br>Idle: `[400×2]` *(800 ms)*<br>Reel: `[90×4]` *(360 ms)* | Cast: `ONCE`<br>Idle/Reel: `LOOP` | `48×64`<br>`(24, 58)` | Mọi frame trong `Idle`: Bấm di chuyển/ESC thu cần về `IDLE`. | **Vào**: Dùng cần câu bên bờ nước (`zon_*` water tile).<br>**Thoát**: Kéo xong cá (nhận item) hoặc hủy câu → `IDLE`. | `N/A` / **Bobber Spawn**: Cast `F2` | `rod_tip` + `water_bobber` | Cast F2: `sfx_fish_cast_splash`<br>Reel F0: `sfx_fish_reel_tick` | `assets/atlases/characters/atlas_<hero>.json#<hero>/fishing/<substate>_<dir>_00..03` |
| **22** | **Crafting** *(Rèn lò / Nấu ăn / Chế tạo bàn xưởng)*<br>`<hero>_craft_<dir>` | `UP` & `RIGHT` *(mirror `LEFT` hợp lệ)* | `4` | `[130, 120, 100, 150]`<br>*(500 ms/nhịp)* | `LOOP` *(trong khi mở bàn chế tạo / rèn)* | `48×64`<br>`(24, 58)` | Mọi frame: Đóng modal hoặc di chuyển → `IDLE`. | **Vào**: Mở/xác nhận chế tạo tại `bld_blacksmith`, `bld_kitchen`, `bld_workshop`, `bld_alchemy_lab`.<br>**Thoát**: Hoàn thành công thức hoặc đóng UI → `IDLE`. | `N/A` / `N/A` | `front_station (24,42)` (tia lửa đe rèn hoặc hơi khói nồi nấu) | F2: `sfx_craft_anvil_tap` / `sfx_cook_sizzle` | `assets/atlases/characters/atlas_<hero>.json#<hero>/craft/<dir>_00..03` |
| **23** | **Building** *(Dựng & Nâng cấp Công trình)*<br>`<hero>_build_<dir>` | 4-dir MVP<br>*(mirror `LEFT` hợp lệ)* | `4` | `[100, 90, 90, 120]`<br>*(400 ms/nhịp)* | `LOOP` *(trong 1.2s hiệu ứng đặt công trình)* | `48×64`<br>`(24, 58)` | Mọi frame: Di chuyển hoặc `DODGE` hủy hoạt ảnh (công trình đã đặt vẫn hoàn tất theo server). | **Vào**: Server xác nhận `BUILDING_PLACE_OK` / `BUILDING_UPGRADE_OK`.<br>**Thoát**: Sau 3 chu kỳ (`1200 ms`) → `IDLE`. | `N/A` / `N/A` | `front_tile` (khói bụi gỗ & tia sao hoàn công) | F2: `sfx_build_hammer_wood` | `assets/atlases/characters/atlas_<hero>.json#<hero>/build/<dir>_00..03` |
| **24** | **Interact** *(Nhặt đồ / Mở rương / Vuốt ve động vật / Nói chuyện)*<br>`<hero>_interact_<dir>` | 4-dir MVP<br>*(8-dir fallback)* | `3` | `[80, 100, 90]`<br>*(270 ms)* | `ONCE` | `48×64`<br>`(24, 58)` | **F2 (`180–270 ms`)** hoặc cancel tức thì bằng `DODGE`/`RUN`. | **Vào**: `INTERACT_REQ` / `LOOT_PICKUP_REQ` (nhặt loot, mở cửa, cho gà/bò ăn, vuốt ve).<br>**Thoát**: Hết F2 → `IDLE`. | `N/A` / `N/A` | `hand_front (24±10, 42)` (tim nhỏ khi vuốt ve động vật) | F1: `sfx_interact_pickup` / `sfx_animal_pet` | `assets/atlases/characters/atlas_<hero>.json#<hero>/interact/<dir>_00..02` |
| **25** | **Emote** *(Biểu cảm xã hội: Vẫy tay, Ăn mừng, Ngồi nghỉ)*<br>`<hero>_emote_<type>_down` | `DOWN` *(quay về phía camera cho rõ nét)* | `4` *(Wave/Cheer)*<br>`2` *(Sit)* | Wave/Cheer: `[140×4]` *(560 ms)*<br>Sit: `[350×2]` *(700 ms)* | Wave/Cheer: `ONCE` (lặp 2 lần)<br>Sit: `LOOP` | `48×64`<br>`(24, 58)` | Mọi frame (`0..3`): Bất kỳ input di chuyển, combat hay trúng đòn đều hủy ngay lập tức. | **Vào**: Người chơi chọn Emote Wheel hoặc lệnh `/wave`, `/cheer`, `/sit` khi đang `IDLE`.<br>**Thoát**: Hết chu kỳ hoặc bất kỳ hành động nào → `IDLE`/`RUN`. | `N/A` / `N/A` | `overhead_bubble (24,8)` (khung bong bóng pixel `16×16`) | F0: `sfx_emote_<type>` | `assets/atlases/characters/atlas_<hero>.json#<hero>/emote/<type>_down_00..03` |

---

## 5. Tiêu chuẩn Animation cho Non-Humanoid Entities

### 5.1 Monster (Quái thường & Elite — `48×64`, `64×64`, `96×96 px`)
Mọi quái vật ánh xạ trực tiếp từ danh sách `aiStates` trong `game-data/monsters.json`:
- **`IDLE`** (`4 frames @ 200 ms`, Loop): Thở nhẹ hoặc nhún mềm (slime).
- **`PATROL` / `WALK`** (`4–6 frames @ 130 ms`, Loop): Di chuyển tuần tra quanh `patrolRadiusPx`.
- **`DETECT`** (`3 frames @ 90 ms`, Once): Cảnh báo phát hiện người chơi (hú với `mob_timber_wolf`, giật mình nhảy nhẹ với `mob_moss_slime`) kèm icon `!` pixel ở `overhead_status`.
- **`CHASE` / `RUN`** (`4–6 frames @ 85 ms`, Loop): Đuổi theo mục tiêu.
- **`ATTACK_1` & `ATTACK_2`** (`5–6 frames`, Once): Khung wind-up F0–F1 kéo dài khớp chính xác `telegraphMs` trong `monsters.json` (VD `420 ms` cho `fang_bite`, `700 ms` cho `predator_pounce`).
- **`RETURN` / `FLEE`** (dùng lại anim `RUN` với icon mồ hôi/rút lui ở `overhead_status` giúp tiết kiệm 100% công vẽ trùng lặp).
- **`HIT`** (`2 frames @ 75 ms`), **`STUNNED`** (`4 frames @ 140 ms`, Loop), **`DEATH`** (`5 frames @ 110 ms`, Hold Last rồi fade out `500 ms`), **`RESPAWN`** (`4 frames @ 100 ms` trồi lên/hiện hình mượt).

### 5.2 Animal (Động vật Chăn nuôi — `32×32` đến `48×48 px`)
Mỗi loài trong `game-data/animals.json` có 2 bộ sprite cho 2 giai đoạn `BABY` và `ADULT`:
- `IDLE` (`4 frames @ 240 ms`), `WALK` (`4 frames @ 140 ms`), `EAT` (`4 frames @ 180 ms`), `SLEEP` (`2 frames @ 450 ms`, kèm bong bóng `Zzz` ban đêm), `HAPPY` (`4 frames @ 110 ms`, nhảy nhỏ kèm tim pixel khi được vuốt ve), `PRODUCE` (`3 frames @ 140 ms`, rũ lông/đẻ trứng/tạo sữa).

### 5.3 Boss (`128×128` đến `256×256 px`)
- **Tối ưu hướng cho Boss lớn**: Boss sử dụng chuẩn **3 hướng hình ảnh** (`DOWN`, `RIGHT`, mirror có kiểm soát sang `LEFT` + `UP` nếu quay lưng hoàn toàn), tập trung ngân sách frame vào **tư thế báo đòn (Telegraph Wind-up)** thật rõ ràng để người chơi đọc chiêu bằng mắt thường song song với vòng đỏ dưới sàn.
- **Các State Đặc trưng của Boss**: `IDLE`, `MOVE`, `PHASE_TRANSITION` (gầm vang + đổi màu lõi ngực, không strobe), `TELEGRAPH_WINDUP` (giữ nhịp thở căng lực khớp `telegraphMs`), `SKILL_SLAM` / `SKILL_SWEEP` / `SKILL_CHANNEL` / `SKILL_CHARGE`, `STAGGERED` (khuỵu gối `6000 ms` khi thanh Poise = 0, mở cửa sổ nhận `+40%` sát thương), `ENRAGE_ROAR`, `DEATH` (`10 frames` sụp đổ kịch tính `1400 ms`).

### 5.4 Projectile & Interactive Objects
- **Projectile** (`16×16` đến `32×32 px`): `TRAVEL` (`2–4 frames @ 60 ms`, xoay theo `aimAngle` theo góc bước 15° hoặc hướng nguyên pixel) + `IMPACT` (`4 frames @ 50 ms`, Once rồi trả về Object Pool).
- **Interactive Objects**:
  - Cây cối & Quặng: Trạng thái tĩnh + `SHAKE_HIT` (`3 frames @ 50 ms` rung lệch `±2 px`) + `DEPLETED` (gốc cây/đá vụn).
  - Cây trồng (`crp_*`): 4–5 giai đoạn tăng trưởng tĩnh (`STAGE_0_SEED` → `STAGE_4_MATURE`) kèm 2-frame đung đưa cực nhẹ theo gió (`650 ms/frame`).
  - Rương & Cửa: `CLOSED` → `OPENING` (`3 frames @ 80 ms`) → `OPEN`.

---

## 6. Cấu trúc Dữ liệu Định nghĩa Animation (JSON Sidecar Schema)

Mỗi thực thể sử dụng 1 tệp JSON định nghĩa animation (`anim_<entityId>.json`) nằm cạnh Texture Atlas và được kiểm chứng bằng schema chung trong `packages/shared`:

```json
{
  "schemaVersion": "1.0.0",
  "entityId": "chr_kael_vanguard",
  "atlasKey": "atlas_chr_kael_vanguard",
  "directionalMode": "4_DIR",
  "spriteSizePx": { "width": 48, "height": 64 },
  "defaultPivotPx": { "x": 24, "y": 58 },
  "animations": {
    "kael_atk_combo_1": {
      "state": "ATTACK",
      "directions": ["DOWN", "UP", "LEFT", "RIGHT"],
      "allowHorizontalFlip": false,
      "loopMode": "ONCE",
      "frameCount": 5,
      "frameDurationsMs": [60, 60, 55, 55, 170],
      "cancelWindow": { "fromFrame": 4, "fromMs": 230, "allowedNextStates": ["ATTACK_COMBO", "DODGE", "SKILL", "BLOCK"] },
      "visualHitFrames": [2],
      "visualProjectileSpawnFrames": [],
      "vfxAttachments": {
        "DOWN": { "weapon_tip": { "x": 28, "y": 52 }, "arc_origin": { "x": 24, "y": 42 } },
        "UP": { "weapon_tip": { "x": 20, "y": 20 }, "arc_origin": { "x": 24, "y": 32 } },
        "LEFT": { "weapon_tip": { "x": 8, "y": 40 }, "arc_origin": { "x": 18, "y": 40 } },
        "RIGHT": { "weapon_tip": { "x": 40, "y": 40 }, "arc_origin": { "x": 30, "y": 40 } }
      },
      "sfxTriggers": [
        { "frame": 1, "sfxKey": "sfx_wpn_sword_swing_1" }
      ],
      "framePathPattern": "chr_kael_vanguard/atk_combo_1/{dir}_{index2}"
    }
  }
}
```

---

## 7. Kiểm chứng 14 Tiêu chí Quality Gate (Animation Standard)

| # | Tiêu chí Quality Gate | Định nghĩa Cụ thể cho Animation Pipeline |
| :---: | :--- | :--- |
| 1 | **Mục tiêu Gameplay** | Mang lại cảm giác chiến đấu phản hồi tức thì, đọc rõ tín hiệu tấn công/né đòn và thể hiện đầy đủ mọi hoạt động sống (nông trại, khai khoáng, rèn đúc, xã hội). |
| 2 | **User Stories** | (US-ANIM-01) Người chơi thấy ngay cú vung kiếm 3 nhịp mượt mà và có thể hủy phần recovery để né đòn Boss kịp thời. (US-ANIM-02) Người chơi nhìn vào tư thế nén lực của Boss biết sắp có đòn quét hình quạt để lướt ra sau lưng. |
| 3 | **Functional Requirements** | Đủ 25 trạng thái humanoid, 4 hướng MVP kèm cơ chế mở rộng 8 hướng, đồng bộ thời lượng với `skills.json`/`monsters.json`/`bosses.json` và gắn điểm neo VFX/SFX chính xác từng frame. |
| 4 | **Business Rules** | Client animation CHỈ mang tính hiển thị; không sự kiện animation client nào được phép xác nhận sát thương, tiêu hao tài nguyên hay bỏ qua cooldown server. |
| 5 | **Input & Output** | Input: chuỗi frame `.png` + bảng timing từ `game-data/*.json`. Output: tệp sidecar `anim_<entityId>.json` và cấu hình Phaser `AnimationManager`. |
| 6 | **State Transitions** | Từng state định nghĩa rõ `transitionCondition`, `cancelWindow` và `loopMode`, được điều phối chặt bởi [Animation State Machine](./animation-state-machine.md). |
| 7 | **Data Model (JSON)** | Tuân thủ schema `anim_<entityId>.json` (Mục 6), ánh xạ 1-1 với `animationSetKey`, `basicAttack.animationKeys` (`characters.json`) và `animationKey` (`skills.json`). |
| 8 | **Dependencies** | Phụ thuộc `characters.json`, `skills.json`, `monsters.json`, `animals.json`, `bosses.json`, `sprite-sheet-standard.md` và `websocket-contracts.md`. |
| 9 | **UI Interactions** | Khi đang mở Modal toàn màn hình (`Inventory`, `Gacha`), nhân vật tự dừng ở `IDLE` (hoặc `CRAFTING` nếu mở bàn rèn/bếp); thanh cast bar trên HUD đồng bộ chính xác với state `CAST`. |
| 10 | **Edge Cases** | `attackSpeed` tăng cao tới giới hạn tối đa (`2.0x`) không làm bỏ sót `sfxTriggers` hoặc `vfxAttachments` (phát sự kiện theo kiểm tra khoảng thời gian đã vượt qua thay vì so sánh bằng `frame === 2`). |
| 11 | **Failure Behavior** | Nếu thiếu key animation cho 1 hướng hoặc 1 state không thiết yếu (VD `EMOTE`): `AnimationController` tự động fallback sang hướng mặc định `DOWN` hoặc state `IDLE` và ghi cảnh báo dev — không treo nhân vật. |
| 12 | **Security Requirements** | Miễn nhiễm hoàn toàn với hành vi sửa tốc độ animation client (Animation Speed Hack) hoặc giả mạo gói tin trúng đòn nhờ tách biệt hoàn toàn Server Combat Timer. |
| 13 | **Acceptance Criteria** | 25/25 state humanoid có đủ 14 trường đặc tả; 100% thời lượng `startup+active+recovery` của đòn mẫu khớp `game-data/characters.json` & `skills.json`; 0 đường gọi xác nhận damage từ callback animation client. |
| 14 | **Test Scenarios** | (TS-ANIM-01) Xác minh sửa `timeScale = 5.0` trên Phaser client không làm tăng DPS hay bỏ qua cooldown server. (TS-ANIM-02) Kiểm thử fallback `DOWN_RIGHT → RIGHT` ở chế độ 4-dir. (TS-ANIM-03) Kiểm thử `attackSpeed = 1.8x` vẫn kích hoạt đầy đủ SFX/VFX tại đúng pha đánh. |
