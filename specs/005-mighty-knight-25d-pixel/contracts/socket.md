# Contract: Sự kiện WebSocket & Giao thức Thời gian thực (`mighty_knight`)

Dùng chung kết nối Socket.IO, xác thực `{ playerId, name, token }` và cấu trúc ack `{ ok: true } | { ok: false, error: string }` của `GameGateway`.

---

## 1. Client → Server

### 1.1 `room:create` (có sẵn)
- Payload: `{ gameMode: 'mighty_knight', rules? }`
- Giới hạn phòng: `minPlayers = 1`, `maxPlayers = 6`. Nếu chỉ có 1 người chơi và `comBots > 0`, server tự thêm đồng đội AI COM vào đội hình.

### 1.2 `mk:config` (Chủ phòng, chỉ trong `phase === 'lobby'`)
```ts
interface MkConfigPayload {
  config: {
    playMode: 'endless' | 'boss_rush';
    comBots: number;          // 0..3 (mặc định 2 khi phòng 1 người)
    difficulty: 'normal' | 'hard' | 'nightmare';
    biome: 'auto' | 'grasslands' | 'jungle' | 'volcano' | 'citadel';
    allowSwitchCom: boolean;  // mặc định true
  };
}
```
Lỗi chuẩn:
- `'Chỉ chủ phòng mới chỉnh được cấu hình.'`
- `'Trận đấu đã bắt đầu.'`

### 1.3 `mk:hero` (Người chơi, trong `phase === 'lobby'`)
```ts
interface MkHeroSelectPayload {
  heroId: 'knight' | 'archer' | 'rogue' | 'barbarian' | 'mage' | 'lancer';
}
```
- Cho phép nhiều người chọn cùng Hero hoặc khác Hero; cập nhật ngay trong `RoomView.mk.heroPicks`.

### 1.4 `mk:cmd` (Người chơi đang thi đấu, `phase === 'playing'`)
```ts
export type MkCommand =
  | { t: 'move'; mx: number; my: number; dir?: 1 | -1 }     // vector chuẩn hóa [-1..1]
  | { t: 'attack'; hold?: boolean }                         // kích hoạt Combo 1→2→3 hoặc Dash-Attack
  | { t: 'skill'; slot: 1 | 2 | 3 | 4 }                     // 4 Kỹ năng chủ động
  | { t: 'ultimate' }                                       // Tuyệt kỹ Thức Tỉnh (cần fury >= 100)
  | { t: 'dash' }                                           // Lướt né đòn (invuln 280 ms)
  | { t: 'guard' }                                          // Đỡ đòn / Perfect Parry (cửa sổ 180 ms)
  | { t: 'switch_com'; targetId?: string }                  // Đổi điều khiển sang đồng đội COM
  | { t: 'upgrade'; target: 'atk' | 'hp' | 'def' | 'spd' | 's1' | 's2' | 's3' | 's4' | 'p1' | 'p2' }
  | { t: 'pick_relic'; relicId: MkRelicId }                 // Chọn 1/3 Thánh Vật sau khi hạ Boss
  | { t: 'resign' };                                        // Bỏ cuộc rời trận
```

Lỗi & kiểm soát:
- Khán giả gửi `mk:cmd` → `{ ok: false, error: 'Bạn đang xem trận đấu.' }`.
- Vượt quá 24 lệnh/giây (rate limiter token bucket) → drop an toàn hoặc `{ ok: false, error: 'Thao tác quá nhanh.' }`.
- Kỹ năng chưa mở khóa / đang hồi chiêu / chưa đủ 100 Fury → bỏ qua an toàn, không thay đổi trạng thái server.
- `mx`, `my` chứa `NaN`/`Infinity` → kẹp về `0`.

---

## 2. Server → Client

### 2.1 `mk:frame` (Phát theo nhịp 30 Hz tới toàn bộ người chơi & khán giả trong phòng)

```ts
export interface MkFrame {
  tick: number;
  elapsedMs: number;
  phase: 'wave_intro' | 'combat' | 'wave_clear' | 'relic_draft' | 'ended';
  playMode: 'endless' | 'boss_rush';
  wave: number;
  biome: 'grasslands' | 'jungle' | 'volcano' | 'citadel';
  partyScore: number;
  totalKills: number;
  phaseLeftMs: number;              // Thời gian còn lại của wave_intro / relic_draft
  boss?: {
    entityId: number;
    kind: MkBossId;
    nameVi: string;
    hp: number;
    maxHp: number;
    phase: 1 | 2 | 3;               // Đổi ở 66% & 33% HP
    enraged: boolean;
  };
  fighters: MkFighterView[];        // Mang actionId + actionTick khớp 100% MkChoreoTimeline
  enemies: MkEnemyView[];
  zones: MkZoneView[];              // Mưa tên, Hố đen, Bẫy sét, Hồ dung nham, Phân thân
  projectiles: MkProjectileView[];
  pickups: MkPickupView[];
  /** Sự kiện tăng dần theo ID kể từ tick trước (khử trùng lặp ở client) */
  fx: MkFxEvent[];                  // Kèm vfxId, layer, tint, skillLevel (tiến hóa Lv3/Lv5!)
  damages: MkDamageEvent[];         // normal | crit | skill | parry | burn | poison | shock | heal | evade
  ultCutIns: MkUltCutInEvent[];     // { id, fighterId, heroId, skillNameVi } → hiển thị banner 0.45s
  sfx: string[];                    // Mã âm thanh 16-bit
}
```

### 2.2 `room:view` (có sẵn, bổ sung trường `mk`)
```ts
export interface MkRoomView {
  config: MkConfig;
  heroPicks: Record<string, MkHeroId>;
  startedAt?: number;
  result?: MkResultSummary;         // { victory, waveReached, durationMs, partyScore, players[], mvpId }
}
```

---

## 3. Bảo đảm Băng thông & Đồng bộ Hóa

1. **Không gửi frame sprite từ server**: Server chỉ gửi `(actionId, actionTick)` (vài byte). Client tra cứu bảng bất biến `MK_CHOREO_TIMELINES[heroId][actionId]` để tính ra đúng `frame ∈ [0..14]`, `flipX`, `dx`, `dz`, `afterimage`, `vfx`, `hitstop` ở 60 FPS.
2. **Ngân sách băng thông mục tiêu**: Trung bình `18–35 KB/s` mỗi client khi có 6 người chơi và 30 quái trên màn hình (tọa độ `x, y, z` làm tròn về số nguyên trước khi đóng gói JSON).
3. **Kết nối lại (Reconnect)**: Khi người chơi F5 hoặc rớt mạng vào lại, client nhận ngay `room:view` và gói `mk:frame` kế tiếp sau tối đa `33 ms`, tự đồng bộ toàn bộ vị trí, kỹ năng, vàng, Thánh Vật và tư thế nhân vật.
4. **Cơ chế Cược & Thưởng Xu**: Khi `phase === 'ended'`, `MkWorld` gọi `hooks.onEnd(result)` để `Game` xử lý trả thưởng / hoàn cược đúng quy ước các mode Co-op sẵn có (`bansung`, `link_duel`).
