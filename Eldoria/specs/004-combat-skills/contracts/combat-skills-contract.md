# Interface Contracts: Real-Time Action Combat & 60-Skill Data-Driven Engine

**Feature**: `004-combat-skills`  
**References**: [`docs/architecture/websocket-contracts.md`](../../../docs/architecture/websocket-contracts.md), [`docs/architecture/api-contracts.md`](../../../docs/architecture/api-contracts.md), [`docs/architecture/backend-architecture.md`](../../../docs/architecture/backend-architecture.md)

---

## 1. WebSocket Realtime Contracts (Namespace `/game`, `protocolVersion: "1.0"`)

### 1.1 Client → Server (`C2S_*`)
| Event Type | Rate Limit | Payload Schema | Server Validation Bắt buộc |
| :--- | :---: | :--- | :--- |
| `BASIC_ATTACK_REQ` | `5 / s` | `{ seq: int, aimAngle: number, comboStep: 1..4 }` | `seq > lastProcessedSeq`, sống & không `STUN`/`FREEZE`/`KNOCKDOWN`, không ở Safe Zone (hoặc chặn gây sát thương), hết khoảng đánh tối thiểu `>= 280 ms`, kiểm tra stamina & combo window `750 ms` |
| `SKILL_CAST_REQ` | `5 / s` | `{ seq: int, requestId: uuid, skillId: string, aimAngle: number, targetX?: number, targetY?: number }` | Nhân vật sở hữu `skillId` đúng `activeHeroId`, khớp `requiresWeaponTypes`, không dính CC trong `blockedWhileCrowdControlled`, đủ `manaCost`/`staminaCost`, hết cooldown server (`cooldownToleranceMs: 100 ms` cho Input Buffer), đích trong `rangePx + maxRangeTolerancePx` & `lineOfSightRequired` |
| `DODGE_REQ` | `3 / s` | `{ seq: int, dx: number, dy: number }` | Không `EXHAUSTED`, đủ `20` Stamina, hết cooldown `1,200 ms` (không giảm bởi CDR), chuẩn hóa `(dx, dy)`, lướt `112 px` qua swept tile collision, cấp `300 ms` i-frame (`+6 ticks`) |
| `BLOCK_STATE` | `5 / s` | `{ seq: int, active: boolean, facing: Direction }` | Cầm vũ khí cận chiến hợp lệ; khi `active: true`, mở cửa sổ `Perfect Parry` `200 ms` (`+4 ticks`) từ tick server |
| `RESPAWN_REQ` | `1 / 2s` | `{ choice: "VILLAGE" \| "DUNGEON_ENTRANCE" }` | Chỉ hợp lệ khi `combatState === "DEAD"`; hồi đầy HP/MP/Stamina, giữ nguyên `100%` trang bị |

> **Cấm tuyệt đối (Zero Client Combat Trust)**: Mọi trường `damage`, `isCrit`, `hitEntityIds`, `iFrame`, `bypassCooldown` nếu bị tiêm vào payload đều bị Zod strict schema loại bỏ và tăng `suspicionScore` (`+35` với hành vi giả mạo nghiêm trọng).

### 1.2 Server → Client (`S2C_*`)
- `COMBAT_DAMAGE_EVENT`: `{ tick, attackerId, targetId, skillId, damage, isCrit, element, reaction?, isParried?, isBlocked?, targetHpAfter, targetShieldAfter, targetPoiseAfter, knockback?: { dx, dy } }`
- `SKILL_CAST_ACK`: `{ requestId, executionId, casterId, skillId, phase, aimAngle, targetX?, targetY?, effectiveCooldownMs, manaAfter, staminaAfter, serverStartTs }`
- `SKILL_TELEGRAPH_EVENT`: `{ telegraphId, casterId, shape, x, y, angle, radius?, width?, height?, durationMs, serverStartTs, dangerLevel }` *(Client render bắt buộc tại Depth `150–199`, trên VFX mặt đất người chơi)*
- `STATUS_EFFECT_UPDATE`: `{ entityId, added[], refreshed[], removed[], ccImmune?: boolean }`
- `BOSS_STATE_EVENT`: `{ bossEntityId, phaseNumber, state: "NORMAL"|"STAGGERED"|"ENRAGED"|"DEFEATED", staggerRemainingMs?, bannerTextVi }`
- `PLAYER_DEATH`: `{ characterId, killerName, respawnOptions: ["VILLAGE", "DUNGEON_ENTRANCE"], penaltySummaryVi }`
- `PLAYER_RESPAWN`: `{ characterId, zoneId, x, y, hp, mp, stamina }`
- `ACTION_ERROR`: `{ requestId?, code: "ERR_SKILL_ON_COOLDOWN"|"ERR_INSUFFICIENT_MANA"|"ERR_INSUFFICIENT_STAMINA"|"ERR_OUT_OF_RANGE"|"ERR_CROWD_CONTROLLED"|"ERR_SAFE_ZONE_COMBAT_BLOCKED"|"ERR_INVALID_WEAPON_TYPE", messageVi }`

---

## 2. REST API Contracts (Skill Progression & Hotbar Persistence)

### `POST /api/v1/characters/:charId/skills/upgrade`
- **Auth**: `Bearer <accessToken>` (Owner check) + `X-Idempotency-Key: <UUIDv4>`
- **Request Body**: `{ "skillId": "skl_kael_act_blazing_lunge" }`
- **Validation**: `Character.skillPointsFree >= 1`, `CharacterSkill.rank < skill.maxRank`, nhân vật đã đạt `unlockLevel` của kỹ năng.
- **Persistence**: Atomic write vào `data/db/characters/<charId>.json` trong `AsyncLockManager` trên `character:<charId>`.
- **Response `200 OK`**: `{ "ok": true, "data": { "skill": { "skillId": "...", "rank": 2, "masteryExp": 0, "hotbarSlot": 1 }, "skillPointsFree": 2 }, "serverTime": "..." }`
- **Error Codes**: `403 ERR_FORBIDDEN_OWNERSHIP`, `409 ERR_INSUFFICIENT_SKILL_POINTS`, `409 ERR_SKILL_MAX_RANK_REACHED`, `409 ERR_LEVEL_REQUIREMENT_NOT_MET`.

### `PUT /api/v1/characters/:charId/skills/hotbar`
- **Auth**: `Bearer <accessToken>` (Owner check)
- **Request Body**: `{ "slots": [{ "hotbarSlot": 1, "skillId": "skl_kael_act_blazing_lunge" }, ...] }` (slot `1..4`, không trùng lặp, chỉ gán kỹ năng `ACTIVE` hoặc `ULTIMATE` đã mở của `activeHeroId`).
- **Response `200 OK`**: Trả danh sách `Character.skills[]` đã cập nhật.

---

## 3. Internal Domain Events (`InternalEventBus` & `GameUiBridge`)

- **Backend `InternalEventBus`**:
  - `EntityDamaged { zoneId, attackerId, targetId, damage, poiseDamage, element, reaction? }` → lắng nghe bởi `boss` / `monster` threat table.
  - `MonsterKilled { zoneId, monsterId, killerCharacterId, eligibleCharacterIds[], x, y }` → lắng nghe bởi `loot` (feature `005`) và `quest`.
  - `PlayerDied { zoneId, characterId, killerName }` → kích hoạt flush dirty checkpoint JSON.
  - `SkillCastStarted { zoneId, casterEntityId, skillId }` → cập nhật `CharacterSkill.masteryExp` (dirty-marked) và kích hoạt passive hooks.
- **Frontend `GameUiBridge`**:
  - `combat:damage_number` → Phaser object-pooled floating combat text (`CRIT!`, `MELT!`, `PARRY!`, `IMMUNE`).
  - `combat:cooldown_sync` → `useHudStore` cập nhật bộ đếm quét tròn hotbar mà không đẩy trạng thái thực thể 60 FPS vào React.
  - `settings:combat_vfx_changed` → `{ cameraShakeIntensity: 0..1, allyVfxReduction: boolean }` áp dụng tức thì cho `CombatVfxSystem`.
