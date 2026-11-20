# Data Model: Real-Time Action Combat & 60-Skill Data-Driven Engine

**Feature**: `004-combat-skills`  
**Storage**: Ephemeral In-Process RAM trong `ZoneInstance`/`DungeonInstance` (20 Hz simulation, zero per-tick disk I/O) + Persistent Local JSON nhúng trong `data/db/characters/<characterId>.json` (`Character.skills[]`, `Character.stats.currentHp/Mp/Stamina`, `Character.stats.derivedSnapshot`) + Static Read-Only Catalog `game-data/skills.json` & `game-data/characters.json` — Zero External DBMS / Zero Redis.

---

## 1. `CombatActorRuntime` (Ephemeral RAM — Quản lý bởi `CombatService` trên mỗi `ZoneInstance`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `CombatActorRuntime.entityId` | `string` | Required; UUIDv7 (player) hoặc runtime spawn ID hợp lệ | Định danh thực thể đang tham chiến |
| `CombatActorRuntime.actorType` | `string` | Required; Enum `PLAYER \| MONSTER \| ELITE \| BOSS \| SUMMON` | Phân loại áp dụng quy tắc CC, Poise và Friendly-Fire |
| `CombatActorRuntime.combatState` | `string` | Required; Enum `IDLE \| MOVING \| ATTACK_STARTUP \| ATTACK_ACTIVE \| ATTACK_RECOVERY \| CASTING \| SKILL_STARTUP \| SKILL_ACTIVE \| SKILL_RECOVERY \| DODGE_IFRAME \| BLOCKING \| PERFECT_PARRY \| GUARD_BROKEN \| STUNNED \| DEAD` | Trạng thái máy trạng thái chiến đấu trên server |
| `CombatActorRuntime.hp` | `integer` | Required; `0..DerivedCombatStats.maxHp`; `0` chuyển sang `DEAD` | Sinh lực hiện tại |
| `CombatActorRuntime.mp` | `integer` | Required; `0..DerivedCombatStats.maxMp` | Năng lượng hiện tại |
| `CombatActorRuntime.stamina` | `number` | Required; `0..260` (kẹp theo `maxStamina <= 260`); chạm `0` kích `exhaustedUntilTick` | Thể lực hành động hiện tại |
| `CombatActorRuntime.poise` | `number` | Required; `0..maxPoise`; `<= 0` kích `STAGGERED` trên Elite/Boss (tối đa 3 lần/phase) | Thanh cân bằng phá giáp |
| `CombatActorRuntime.iFrameUntilTick` | `integer` | Required; `>= 0`; cấp `+6 ticks` (`300 ms` tại `20 Hz`) khi Dodge hợp lệ | Mốc tick kết thúc miễn sát thương |
| `CombatActorRuntime.dodgeCooldownUntilTick` | `integer` | Required; `>= 0`; cố định `+24 ticks` (`1,200 ms`), bất biến với `CDR` | Mốc tick kết thúc hồi chiêu Né |
| `CombatActorRuntime.parryWindowUntilTick` | `integer` | Required; `>= 0`; cấp `+4 ticks` (`200 ms`) từ tick kích `BLOCKING` | Cửa sổ kích hoạt `Perfect Parry` |
| `CombatActorRuntime.exhaustedUntilTick` | `integer` | Required; `>= 0`; `+30 ticks` (`1,500 ms`) khi `stamina === 0`, khóa Sprint/Dodge | Mốc hết trạng thái Kiệt sức |
| `CombatActorRuntime.comboStep` | `integer` | Required; `0..4`; đặt lại `0` nếu vượt quá `comboWindowMs` (`750 ms`) | Bước hiện tại trong chuỗi Basic Attack |
| `CombatActorRuntime.lastProcessedSeq` | `integer` | Required; `>= 0`; chỉ chấp nhận gói tin có `seq > lastProcessedSeq` | Chống Replay Attack cho input combat |

**State Transitions (`CombatActorRuntime.combatState`)**:
`IDLE / MOVING` → `ATTACK_STARTUP` → `ATTACK_ACTIVE` → `ATTACK_RECOVERY` (cho phép nối combo trong `750 ms` hoặc Dodge/Block cancel ở `40%` cuối Recovery) → `IDLE`;
`IDLE / MOVING` → `CASTING` (có thể bị ngắt sang `STUNNED` kèm hoàn `50%` MP + `2,000 ms` penalty CD) → `SKILL_STARTUP` → `SKILL_ACTIVE` → `SKILL_RECOVERY` → `IDLE`;
`IDLE / MOVING / ATTACK_RECOVERY / SKILL_RECOVERY` → `DODGE_IFRAME` (`300 ms`) → `IDLE`;
`IDLE / MOVING` → `BLOCKING` → `PERFECT_PARRY` (nếu trúng đòn trong `200 ms` đầu) hoặc `GUARD_BROKEN` (`1,000 ms` stun nếu `stamina === 0`);
`[Any alive state]` → `DEAD` (khi `hp === 0`, xóa buff/debuff tạm) → `IDLE` (khi `PLAYER_RESPAWN`).

---

## 2. `DerivedCombatStats` (Computed RAM + Cached Snapshot trong `data/db/characters/<characterId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `DerivedCombatStats.totalAtk` | `number` | Required; `>= 1`; tính theo `combat-formulas.md §2` | Tổng công lực sau cấp độ, thuộc tính, vũ khí `+0..+10`, ascension & food buff |
| `DerivedCombatStats.totalDef` | `number` | Required; `>= 0`; áp công thức giảm trừ hyperbolic chống giáp bất tử | Tổng phòng thủ |
| `DerivedCombatStats.critRate` | `number` | Required; `[0.00, 0.75]` (**Hard Cap `75%`**) | Xác suất chí mạng |
| `DerivedCombatStats.critDamage` | `number` | Required; `[1.50, 2.50]` (**Hard Cap `250%`**) | Hệ số nhân sát thương chí mạng |
| `DerivedCombatStats.cooldownReduction` | `number` | Required; `[0.00, 0.40]` (**Hard Cap `40%`**); không áp dụng cho Dodge | Giảm hồi chiêu kỹ năng |
| `DerivedCombatStats.attackSpeedMult` | `number` | Required; `[1.00, 1.60]` (**Hard Cap `1.60x`**); khoảng đánh tối thiểu `280 ms` | Hệ số tốc độ đánh |
| `DerivedCombatStats.defPenPct` | `number` | Required; `[0.00, 0.50]` (**Hard Cap `50%`**) | Tỷ lệ xuyên giáp phần trăm |
| `DerivedCombatStats.elementalRes` | `Record<Element, number>` | Required; đủ 9 khóa nguyên tố (`FIRE..NEUTRAL`), mỗi giá trị kẹp `[-0.35, 0.70]` | Bảng kháng 9 nguyên tố |

---

## 3. `SkillRuntimeExecution` (Ephemeral RAM — Đọc chuẩn từ `game-data/skills.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `SkillRuntimeExecution.executionId` | `string` | Required; UUIDv7 | Mã định danh lượt thi triển kỹ năng |
| `SkillRuntimeExecution.casterEntityId` | `string` | Required; phải khớp thực thể còn sống trong cùng zone | Chủ thể tung chiêu |
| `SkillRuntimeExecution.skillId` | `string` | Required; khớp `game-data/skills.json[].id` (60 kỹ năng / 15 MVP) | Mã kỹ năng trong catalog |
| `SkillRuntimeExecution.skillRank` | `integer` | Required; `1..maxRank` (`1..5` Passive/Ultimate, `1..10` Active) | Bậc kỹ năng tính `upgradeScalingPerRank` |
| `SkillRuntimeExecution.phase` | `string` | Required; Enum `CASTING \| STARTUP \| ACTIVE \| RECOVERY \| COMPLETED \| INTERRUPTED` | Pha thực thi thời gian thực trên server |
| `SkillRuntimeExecution.castTimeMs` | `integer` | Required; `>= 0` (lấy từ `skills.json`) | Thời lượng niệm phép có thể bị Interrupt |
| `SkillRuntimeExecution.startupMs` | `integer` | Required; `>= 0` (lấy từ `skills.json`) | Thời lượng lấy đà và khóa hướng |
| `SkillRuntimeExecution.activeMs` | `integer` | Required; `>= 0` (lấy từ `skills.json`) | Thời lượng kích hoạt hitbox / projectile / zone |
| `SkillRuntimeExecution.recoveryMs` | `integer` | Required; `>= 0`; cho phép cancel ở `40%` cuối | Thời lượng thu chiêu |
| `SkillRuntimeExecution.hitboxShape` | `string` | Required; Enum `ARC \| CIRCLE \| LINE \| RECT \| PROJECTILE \| SELF \| NONE` | Hình học kiểm tra va chạm 2D |
| `SkillRuntimeExecution.aimAngle` | `number` | Required; số thực hữu hạn trong `[-Math.PI, Math.PI]` | Góc ngắm đã chuẩn hóa tại server |
| `SkillRuntimeExecution.hitTargetCounts` | `Record<string, integer>` | Required; mỗi giá trị `<= maxHitsPerSingleTarget` và số khóa `<= maxTargetsPerCast` | Theo dõi chống đánh vượt số mục tiêu / số hit tối đa |

---

## 4. `ActiveStatusEffect` (Ephemeral RAM — Gắn trên `CombatActorRuntime`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `ActiveStatusEffect.effectId` | `string` | Required; `^eff_[a-z0-9_]{3,50}$` | Định danh hiệu ứng chuẩn |
| `ActiveStatusEffect.effectType` | `string` | Required; Enum `BUFF \| DEBUFF \| SHIELD \| DOT \| CC \| ZONE \| SUMMON \| HEAL` | Nhóm xử lý hiệu ứng (Shield tiêu thụ FIFO theo hết hạn) |
| `ActiveStatusEffect.sourceEntityId` | `string` | Required; định danh người gây hiệu ứng | Phục vụ ghi nhận Threat và sát thương DoT |
| `ActiveStatusEffect.element` | `string` | Required; Enum 9 nguyên tố (`FIRE \| WATER \| EARTH \| WIND \| LIGHTNING \| FROST \| LIGHT \| SHADOW \| NEUTRAL`) | Nguyên tố kích hoạt phản ứng (`ICD 2000 ms`) |
| `ActiveStatusEffect.stacks` | `integer` | Required; `1..maxStacks` (`1` nếu `stackable === false`) | Số tầng cộng dồn hiện tại |
| `ActiveStatusEffect.remainingMs` | `integer` | Required; `>= 0`; hết `0` tự động gỡ bỏ | Thời lượng còn lại theo đồng hồ server |
| `ActiveStatusEffect.nextTickAtMs` | `integer` | Required; `>= 0`; chu kỳ `1,000 ms` cho DoT hoặc theo `skills.json` cho Zone | Mốc tick hiệu ứng định kỳ kế tiếp |

---

## 5. `CcDiminishingTracker` (Ephemeral RAM — Theo từng mục tiêu & nhóm CC)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `CcDiminishingTracker.ccGroup` | `string` | Required; Enum `HARD_CC \| SOFT_CC_ROOT \| SOFT_CC_TAUNT` | Nhóm khống chế áp dụng DR độc lập |
| `CcDiminishingTracker.applicationCount` | `integer` | Required; `0..4` (`1→100%`, `2→50%`, `3→25%`, `4→0% IMMUNE`) | Số lần dính CC trong cửa sổ hiện tại |
| `CcDiminishingTracker.windowExpiresAtTick` | `integer` | Required; `>= 0`; đặt lại sau `400 ticks` (`20,000 ms`) kể từ lần dính gần nhất | Mốc đặt lại chu kỳ DR về `0` |

---

## 6. `CharacterSkill` (Persistent JSON — Nhúng trong `data/db/characters/<characterId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `CharacterSkill.skillId` | `string` | Required; khớp `game-data/skills.json[].id` thuộc hero đã mở trong `unlockedHeroIds` | Mã kỹ năng đã mở khóa |
| `CharacterSkill.rank` | `integer` | Required; `1..maxRank` (`1..5` Passive/Ultimate, `1..10` Active); nâng bằng `skillPointsFree` | Bậc kỹ năng hiện tại |
| `CharacterSkill.masteryExp` | `integer` | Required; `>= 0`; cộng dồn khi thi triển hợp lệ | Điểm thông thạo kỹ năng |
| `CharacterSkill.hotbarSlot` | `integer \| null` | Optional; `1..4` (không trùng slot cùng nhân vật) hoặc `null` | Vị trí gắn trên thanh kỹ năng HUD |
