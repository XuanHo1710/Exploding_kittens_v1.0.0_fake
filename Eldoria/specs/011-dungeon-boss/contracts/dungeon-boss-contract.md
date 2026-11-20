# Interface Contracts: Instanced Dungeons, 10-State Monster AI & Multi-Phase Boss Encounters

**Feature**: `011-dungeon-boss`  
**Transport**: Self-Hosted NestJS WebSocket (`/game`, `protocolVersion: "1.0"`) + REST (`/api/v1/dungeons/*`) + Internal Service Contracts — Zero Third-Party Services.

---

## 1. Internal Server Contracts (`DungeonInstanceManager`, `MonsterAiEngine`, `BossEncounterController`)

```ts
export interface IDungeonInstanceManager {
  createInstance(dungeonId: string, partyId: string | null, memberIds: string[]): DungeonInstanceRuntime;
  lockBossArena(instanceId: string, aggroStartedAtMs: number): void; // locks after 5000 ms, freezes scaledPartySize (1..4)
  attemptAllyRevive(instanceId: string, reviverCharId: string, downedCharId: string): { ok: boolean; errorCode?: string };
  handlePartyWipe(instanceId: string): void; // resets boss HP 100%, Phase 1, restores all safePillars
  destroyExpiredInstances(serverNowMs: number): number; // 120s empty / 300s post-clear RAM cleanup
}

export interface IMonsterAiEngine {
  tickZoneMonsters(zone: SimulationZoneContext, dtMs: number, serverNowMs: number): void;
  applyDamageAndThreat(monster: ActiveMonsterRuntime, sourceCharId: string, damage: number, poiseDmg: number, roleMultiplier: number, skillMultiplier: number, tauntDurationMs?: number): void;
  applyHealThreat(zone: SimulationZoneContext, healerCharId: string, effectiveHealing: number): void; // overheal = 0 threat
}
```

---

## 2. WebSocket Realtime Contracts (`C2S_*` ↔ `S2C_*` trên Namespace `/game`)

### 2.1 Client → Server (`C2S_*`)
- **`C2S: DUNGEON_LEAVE_REQ`**: `{ instanceId: string }` → Rút nhân vật an toàn về cửa Hầm ngục (`wp_mossroot_camp` / `lastSafeZoneId`); nếu là người cuối cùng rời phòng đang giao chiến Boss sẽ đánh dấu wipe/reset hoặc kích hoạt đồng hồ dọn `120s`.
- **`C2S: ALLY_REVIVE_REQ`**: `{ requestId: uuid, targetCharacterId: string }` → Server xác thực nạn nhân ở trạng thái `DOWNED` (`<= 30s`), khoảng cách `<= 64 px`, người cứu sở hữu `csm_revive_feather`, và `reviveCountsByChar[target] < 2`; bắt đầu tụ lực `2.0 giây` rồi trừ 1 `csm_revive_feather` qua WAL khi hoàn tất.
- **`C2S: PILLAR_INTERACT_REQ`** (cho trụ cơ chế hậu MVP như van nước `pil_coolant_*` hoặc cột ấn `pil_sunseal_*`): `{ requestId: uuid, pillarId: string }` → Server kiểm tra cooldown trụ & khoảng cách `<= 96 px`.

### 2.2 Server → Client (`S2C_*`)
- **`S2C: SKILL_TELEGRAPH_EVENT`** (Phát ngay tại pha `STARTUP` đúng `telegraphMs` trước `ACTIVE`, client vẽ trên **Layer `Depth 180–199` unlit**):
  ```json
  {
    "telegraphId": "01J9Z8...",
    "casterId": "boss_inst_01",
    "skillKey": "thorn_heartwood_charge",
    "hitboxShape": "RECTANGLE",
    "x": 416,
    "y": 320,
    "angle": 1.57,
    "radius": null,
    "width": 96,
    "height": 480,
    "durationMs": 1200,
    "serverStartTs": 1795104500000,
    "executesAtMs": 1795104501200,
    "renderDepthBand": "180-199",
    "dangerLevel": "HIGH"
  }
  ```
- **`S2C: SKILL_TELEGRAPH_CANCELLED`**: `{ telegraphId, reason: "STAGGERED" | "CASTER_DIED" | "RESET" }` (xóa ngay chỉ thị mặt đất khi Boss bị phá giáp ngắt chiêu).
- **`S2C: BOSS_STATE_EVENT`**:
  ```json
  {
    "bossEntityId": "boss_inst_01",
    "bossId": "boss_thornback_elder",
    "phaseNumber": 2,
    "state": "STAGGERED",
    "hp": 6120,
    "maxHp": 10500,
    "poise": 0,
    "maxPoise": 520,
    "staggerRemainingMs": 6000,
    "enrageRemainingMs": 248000,
    "pillarStates": { "pil_moss_nw": { "intact": false, "cooldownUntilMs": 0 } },
    "bannerTextVi": "PHÁ GIÁP THÀNH CÔNG! Thornback Elder khuỵu gối trong 6.0 giây (+40% sát thương)!"
  }
  ```
- **`S2C: BOSS_REWARD_SUMMARY`** (Phát riêng từng người chơi sau khi giao dịch Multi-File JSON WAL chốt sổ thành công):
  ```json
  {
    "bossId": "boss_thornback_elder",
    "clearDurationSec": 258,
    "staggerCount": 3,
    "partyStats": [{ "characterId": "chr_01", "name": "Kaelen", "damagePercent": 58, "healPercent": 0, "staggers": 2 }],
    "personalRewards": {
      "eligible": true,
      "exp": 1650,
      "gold": 620,
      "bossTokens": 5,
      "starlightShardsAwarded": 480,
      "starlightSource": "FIRST_CLEAR",
      "itemsAddedToBag": [{ "itemId": "mat_ancient_heartwood", "qty": 3, "rarity": "EPIC" }],
      "itemsRoutedToStorage": [],
      "weeklyLockout": { "isoWeek": "2026-W47", "weeklyStarlightClaimed": true, "weeklyBossTokensEarned": 5 }
    }
  }
  ```

---

## 3. REST API Contracts (`/api/v1/dungeons/*`)

### `GET /api/v1/characters/:charId/dungeons/lockouts` (Auth: Owner Bearer JWT)
- **Response `200 OK`**: Trả danh sách `BossRewardLockoutRecord[]` cho 5 Boss (trạng thái `accountFirstClearClaimed`, `weeklyStarlightClaimed`, `weeklyBossTokensEarned`, `instanceCooldownUntilMs`) giúp UI `SCR-17 World Map` và `SCR-21 Party` hiển thị minh bạch trước khi vào Hầm ngục.

---

## 4. Canonical Dungeon & Boss Error Codes

| Code | Channel | Meaning |
| :--- | :---: | :--- |
| `ERR_DUNGEON_LEVEL_REQUIRED` | WS/REST | Thành viên chưa đạt cấp tối thiểu vào Hầm ngục |
| `ERR_DUNGEON_LOCKED` | WS | Phòng Boss đã niêm phong (`allowLateJoin: false`) sau `5 giây` |
| `ERR_OUT_OF_ARENA_BOUNDS` | WS | Đòn đánh/projectile phát ra từ bên ngoài tọa độ phòng Boss bị hủy |
| `ERR_REVIVE_LIMIT_REACHED` | WS | Mục tiêu đã dùng đủ `2/2` lần hồi sinh trong trận Boss này |
| `ERR_DUNGEON_COOLDOWN_ACTIVE` | WS/REST | Nhân vật đang trong thời gian hồi thưởng phụ bản (`instanceCooldownMinutes`) |
| `ERR_BOSS_CONTRIBUTION_TOO_LOW` | WS | Đóng góp `< 5%` — không đủ tư cách nhận thưởng cá nhân |
