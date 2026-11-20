# Data Model: Instanced Dungeons, 10-State Monster AI & Multi-Phase Boss Encounters

**Feature**: `011-dungeon-boss`  
**Storage**: Ephemeral In-Process RAM (20 Hz Simulation Loop — Zero Disk Writes Per Tick) + 100% Local JSON Persistent Files (`data/db/world/<regionId>.json`, `data/db/characters/<characterId>.json`, `data/db/accounts/<accountId>.json`, `data/db/inventories/<characterId>.json`, `data/db/ledgers/currency-ledger-<YYYY-MM>.json`) + Read-Only Catalog (`game-data/monsters.json`, `game-data/bosses.json`, `game-data/loot-tables.json`).

---

## 1. `DungeonInstanceRuntime` (Ephemeral RAM Only trong `DungeonInstanceManager`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `DungeonInstanceRuntime.instanceId` | `string` | Required; khớp `^dngi_[a-zA-Z0-9_-]{8,48}$` | Mã định danh duy nhất của phiên bản Hầm ngục |
| `DungeonInstanceRuntime.dungeonId` | `string` | Required; canonical `dng_*` tồn tại trong `game-data/bosses.json` (MVP: `dng_mossroot_hollow`) | Loại Hầm ngục đang chạy |
| `DungeonInstanceRuntime.partyId` | `string \| null` | Optional; tham chiếu `PartyAggregate.partyId` hoặc `null` khi đi Solo | Tổ đội sở hữu phiên bản |
| `DungeonInstanceRuntime.lockedMemberIds` | `string[]` | Required; độ dài `1..4`; đóng băng ngay khi `state` chuyển sang `BOSS_LOCKED` | Tập thành viên đủ quyền hiện diện và nhận thưởng trong trận |
| `DungeonInstanceRuntime.state` | `string` | Required; Enum `OPEN \| BOSS_LOCKED \| CLEARED \| RESETTING \| CLOSED` | Trạng thái vòng đời Hầm ngục |
| `DungeonInstanceRuntime.entryLockedAtMs` | `integer \| null` | Optional; bằng `aggroStartedAtMs + 5000` (`arena.entryLockRule.lockDelayMs`) | Mốc niêm phong cửa phòng Boss (`allowLateJoin: false`) |
| `DungeonInstanceRuntime.reviveCountsByChar` | `Record<string, integer>` | Required; mỗi giá trị nằm trong `0..2` | Giới hạn tối đa `2` lần hồi sinh/người/trận bằng `csm_revive_feather` |
| `DungeonInstanceRuntime.expiresAtMs` | `integer` | Required; tự đóng sau `120000 ms` khi `0` người bên trong hoặc `300000 ms` sau `CLEARED` | Mốc thu hồi RAM chống rò rỉ bộ nhớ |

**State Transitions (`DungeonInstanceRuntime.state`)**:
`OPEN` → `BOSS_LOCKED` (5s sau aggro Boss) → `RESETTING` (khi Party Wipe → hồi 100% Boss/trụ → quay về `OPEN`) | `CLEARED` (Boss HP = 0 → phát thưởng nguyên tử) → `CLOSED` (mọi thành viên rời đi hoặc chạm `expiresAtMs`).

---

## 2. `ActiveMonsterRuntime` (Ephemeral RAM Only, nạp từ `game-data/monsters.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `ActiveMonsterRuntime.instanceId` | `string` | Required; UUIDv7 | Mã cá thể quái đang chạy trong Zone/Dungeon |
| `ActiveMonsterRuntime.monsterId` | `string` | Required; canonical `mob_*` hoặc `mob_elite_*` thuộc 38 loài trong `game-data/monsters.json` | Khóa tra cứu chỉ số, `aiProfile`, `attackPatterns` |
| `ActiveMonsterRuntime.aiState` | `string` | Required; Enum `IDLE \| PATROL \| DETECT \| CHASE \| ATTACK \| RETURN \| FLEE \| STUNNED \| DEATH \| RESPAWN` | Trạng thái hiện hành của 10-state FSM |
| `ActiveMonsterRuntime.hp` | `integer` | Required; `0..maxHp` (tỷ lệ `% HP` bảo toàn khi `multiplayerScaling` thay đổi) | Sinh lực hiện tại trên server |
| `ActiveMonsterRuntime.poise` | `integer` | Required; `0..maxPoise`; giảm về `0` kích hoạt `STUNNED` (`2.5s` Regular, `4.0s` Elite, `+25%` sát thương) | Thanh cân bằng phá giáp |
| `ActiveMonsterRuntime.threatTable` | `Record<string, ThreatEntry>` | Required; mỗi mục gồm `{ threat >= 0, damageDealt >= 0, healContribution >= 0, mitigationContribution >= 0 }` | Bảng đe dọa & đóng góp xét thưởng `>= 5%` |
| `ActiveMonsterRuntime.fleeCooldownUntilMs` | `integer` | Required; `>= 0`; tối thiểu `now + 20000` sau mỗi lần `FLEE` (`<= 4000 ms`) | Ngăn bỏ chạy lặp vô hạn |
| `ActiveMonsterRuntime.isSummonedMinion` | `boolean` | Required; nếu `true` → `yieldsLoot = false`, TTL `30000 ms`, trần `2` cá thể/Elite | Chống farm đệ tử triệu hồi |

---

## 3. `ActiveBossRuntime` (Ephemeral RAM Only, nạp từ `game-data/bosses.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `ActiveBossRuntime.bossEntityId` | `string` | Required; UUIDv7 | Mã thực thể Boss trong `DungeonInstanceRuntime` |
| `ActiveBossRuntime.bossId` | `string` | Required; canonical `boss_*` thuộc 5 Boss trong `game-data/bosses.json` (MVP: `boss_thornback_elder`) | Khóa tra cứu Phase, Stagger, Enrage, PartyScaling |
| `ActiveBossRuntime.scaledPartySize` | `integer` | Required; `1..4`; chốt cố định tại `entryLockedAtMs` (không giảm khi có người disconnect) | Quy mô áp hệ số `partyScaling` (`1.00x..3.10x` HP) |
| `ActiveBossRuntime.currentPhase` | `integer` | Required; `1..phases.length` (Thornback: `1..3` tại `100%/65%/30%`; Malakor: `1..4` tại `100%/70%/40%/15%` có khóa chuyển pha `1.5s`) | Giai đoạn chiến đấu hiện tại |
| `ActiveBossRuntime.encounterState` | `string` | Required; Enum `IDLE \| NORMAL \| PHASE_SHIFT \| STAGGERED \| ENRAGED \| DEFEATED` | Trạng thái chiến đấu tổng thể của Boss |
| `ActiveBossRuntime.staggerEndsAtMs` | `integer \| null` | Optional; bằng `staggerStartedAtMs + staggerMechanic.poiseBreakDurationMs` (`6000 ms` cho Thornback Elder) | Thời điểm hết choáng Phá giáp (`x1.40` dmg) |
| `ActiveBossRuntime.enrageAtMs` | `integer \| null` | Optional; bằng `encounterStartedAtMs + enrageMechanic.enrageTimerSeconds * 1000` (`360000 ms` cho Thornback Elder) | Mốc kích hoạt `ENRAGED` (`x1.65` ATK, `x1.30` speed) |
| `ActiveBossRuntime.pillarStates` | `Record<string, PillarRuntimeState>` | Required; khóa khớp `arena.safePillars[].id`, mỗi mục `{ intact: boolean, cooldownUntilMs: integer }` | Trạng thái 4 trụ môi trường (reset toàn bộ khi Wipe) |

---

## 4. `ActiveTelegraphRuntime` (Ephemeral RAM Only — Đồng bộ `SKILL_TELEGRAPH_EVENT` tới Layer `180–199`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `ActiveTelegraphRuntime.telegraphId` | `string` | Required; UUIDv7 | Mã vùng cảnh báo để hủy nếu Boss bị Stagger/Chết |
| `ActiveTelegraphRuntime.casterId` | `string` | Required; mã quái vật hoặc Boss | Chủ thể đang niệm chiêu |
| `ActiveTelegraphRuntime.hitboxShape` | `string` | Required; Enum `CIRCLE \| CONE \| RECTANGLE \| LINE_PROJECTILE \| SELF_AOE \| MULTI_CIRCLE \| RING \| CROSS_LINE \| ARENA_WAVE` | Hình học vùng ảnh hưởng xác thực server |
| `ActiveTelegraphRuntime.durationMs` | `integer` | Required; `400..3000`; đọc từ `telegraphMs` trong catalog | Thời gian cảnh báo trước khi nổ |
| `ActiveTelegraphRuntime.executesAtMs` | `integer` | Required; `serverStartTs + durationMs`; server chỉ tính va chạm đúng mốc này | Thời điểm kích hoạt sát thương chuẩn server |
| `ActiveTelegraphRuntime.renderDepthBand` | `string` | Required; hằng `"180-199"` (unlit ground layer, không bị VFX tầng `100000+` che) | Quy ước hiển thị đọc rõ chiến trường |

---

## 5. `EliteRespawnTimerRecord` (Persistent JSON trong `data/db/world/<regionId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `EliteRespawnTimerRecord.spawnPointId` | `string` | Required; khớp `SpawnPoint.id` của vùng | Điểm sinh của quái Elite thế giới mở |
| `EliteRespawnTimerRecord.monsterId` | `string` | Required; canonical `mob_elite_*` | Mã loài Elite (MVP: `mob_elite_alpha_direwolf`) |
| `EliteRespawnTimerRecord.lastKilledAtMs` | `integer` | Required; Unix ms server (`>= 0`) | Thời điểm bị tiêu diệt gần nhất |
| `EliteRespawnTimerRecord.nextRespawnAtMs` | `integer` | Required; `>= lastKilledAtMs + respawnSeconds * 1000` | Mốc tái sinh bền vững qua restart server |

---

## 6. `BossRewardLockoutRecord` (Persistent JSON trong `data/db/characters/<characterId>.json` & `data/db/accounts/<accountId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `BossRewardLockoutRecord.bossId` | `string` | Required; canonical `boss_*` | Mã Boss theo dõi giới hạn thưởng |
| `BossRewardLockoutRecord.accountFirstClearClaimed` | `boolean` | Required; lưu bất biến trong `accounts/<accountId>.json` (một khi `true` không bao giờ hoàn ngược) | Ngăn tạo nhân vật phụ cày lặp `starlightShardsFirstClear` |
| `BossRewardLockoutRecord.weeklyResetIsoWeek` | `string` | Required; khớp `^\d{4}-W\d{2}$` theo chuẩn UTC Thứ Hai `00:00` | Tuần khóa thưởng hiện hành |
| `BossRewardLockoutRecord.weeklyStarlightClaimed` | `boolean` | Required; tối đa `1` lần `starlightShardsWeekly`/Boss/tuần | Chặn cày vô hạn nội tệ Gacha tuần |
| `BossRewardLockoutRecord.weeklyBossTokensEarned` | `integer` | Required; `0..weeklyTokenCap` (`<= 25` cho `boss_thornback_elder` / tuần) | Trần lạm phát `BOSS_TOKEN` hàng tuần |
| `BossRewardLockoutRecord.instanceCooldownUntilMs` | `integer` | Required; `>= 0`; bằng `clearedAtMs + respawnSchedule.instanceCooldownMinutes * 60000` | Thời gian chờ lượt thưởng phụ bản kế tiếp (`15 phút` cho MVP) |
