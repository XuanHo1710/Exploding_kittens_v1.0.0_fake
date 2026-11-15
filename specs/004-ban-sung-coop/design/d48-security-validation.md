# d48: Security, Anti-Cheat Validation & Static Path Guard (`ban_sung`)

## Scope & Wave-2 Target Files
- `server/src/game/bansung/validate.ts` (new): token-bucket rate limiter, prototype-safe envelope guard, `BansungCommand` / `BansungConfig` sanitizers.
- `server/src/game/bansung/static-guard.ts` (new): Express/Nest middleware blocking traversal, double-encoding, dotfiles, and symlink escapes on `/database-ban-sung`.
- `server/src/game/bansung/world.ts`: server-clock cooldown locks, per-tick command cap & coalescing, atomic pickup/perk claim locks.
- `server/src/game/game.gateway.ts`: register `bansung:cmd` and `bansung:config`, apply socket burst caps & byte/key ceilings before `handle()`.
- `server/src/game/game.ts`: phase/spectator/host assertions for `bansungCommand` and `setBansungConfig`.
- `server/src/app.module.ts`: mount `/database-ban-sung` with hardened `ServeStaticModule` options, `exclude` entry on `client/dist`, and `BanSungStaticGuard`.

---

## 1. Authoritative Boundary & Identity Checks
1. **Intent-only protocol**: Client commands carry only movement direction, aim angle, button toggles, slot index, target/perk ID, and input sequence `seq`. Server ignores or rejects any client-supplied `x`, `y`, `hp`, `armor`, `energy`, `ammo`, `damage`, `weaponId`, `dt`, `timestamp`, or `coins`.
2. **Gateway identity**: Reuse `GameGateway.handle()` (`this.accounts.verify(me.playerId, me.token)`) on every `bansung:*` message; reject unverified sockets with `disconnect(true)`.
3. **Participant checks** (`game.ts` / `world.ts`):
   - `bansung:config`: `this.phase === 'lobby'` AND `byId === this.hostId` (else throw `GameError`).
   - `bansung:cmd`: `this.gameMode === 'bansung'` AND `this.phase === 'playing'` AND sender is an active non-spectator `Player` (`!p.left`). Spectators calling `bansung:cmd` get `GameError`; dead/downed players may only send `aim`, `ping`, or `perkPick` (all movement/combat commands dropped).

---

## 2. Socket Burst Caps & Anti-Flood (`validate.ts` + `game.gateway.ts`)

### Constants
```ts
export const BANSUNG_SEC_LIMITS = {
  CMD_BUCKET_CAP: 30,          // burst allowance per socket
  CMD_REFILL_PER_SEC: 60,      // sustained 60 msg/s (30Hz move + aim/fire)
  CONFIG_BUCKET_CAP: 5,
  CONFIG_REFILL_PER_SEC: 2,
  PING_BUCKET_CAP: 3,
  PING_REFILL_PER_SEC: 0.5,    // 1 ping per 2s
  MAX_CMD_KEYS: 8,
  MAX_CMD_JSON_BYTES: 512,
  MAX_CONFIG_JSON_BYTES: 1024,
  MAX_CMDS_PER_TICK: 8,        // per playerId inside 30Hz world tick
  VIOLATION_WINDOW_MS: 5_000,
  VIOLATION_KICK_COUNT: 20,
} as const;
```

### Algorithms
1. **Envelope pre-check** (runs before routing to `BansungWorld`):
   - Verify `isPlainObject(body)`: `body !== null && typeof body === 'object' && !Array.isArray(body)` and `Object.getPrototypeOf(body)` is `Object.prototype` or `null`. Reject keys `__proto__`, `constructor`, `prototype`.
   - Reject if `Object.keys(body).length > MAX_CMD_KEYS` or `Buffer.byteLength(JSON.stringify(body)) > MAX_CMD_JSON_BYTES` (wrapped in `try/catch`).
2. **Per-socket Token Bucket** (`SocketRateLimiter` keyed by `socket.id`, cleaned on `handleDisconnect`):
   - Refill `tokens = Math.min(cap, tokens + ((nowMs - lastMs) / 1000) * refillPerSec)`.
   - If `tokens < 1`: increment `violations` in `[nowMs - 5000, nowMs]`. Return `{ ok: false, error: 'rate_limited' }` **without** emitting `toast` (prevents outbound amplification).
   - If `violations >= VIOLATION_KICK_COUNT`: log `Logger.warn`, emit one `toast`, and call `client.disconnect(true)`.
3. **Per-player tick queue & coalescing** (`world.ts`):
   - Cap incoming queue at `MAX_CMDS_PER_TICK = 8` per `playerId` per 30Hz tick; drop overflow.
   - Coalesce `move` and `aim` commands per tick (retain only latest `move` and latest `aim` before physics step) so rapid packet bursts cannot stack movement steps.

---

## 3. Input Validation & Bounds (`validate.ts`)

Every number must pass `typeof n === 'number' && Number.isFinite(n)`. Reject `NaN`, `Infinity`, `-Infinity`, booleans, or numeric strings.

| Command `t` | Validated Fields & Clamps | Rejection Policy |
| :--- | :--- | :--- |
| `move` | `dx, dy` finite; `len = Math.hypot(dx, dy)`; if `len < 1e-4` snap `(0,0)`; if `len > 1` normalize `(dx/len, dy/len)` (blocks diagonal/speedhack). | Drop packet |
| `aim` | `aimRad` finite -> wrap `Math.atan2(Math.sin(aimRad), Math.cos(aimRad))` into `[-PI, PI]`. | Drop packet |
| `fire` | `active` boolean; `aimRad` optional finite (wrapped). Uses server `player.activeSlot`, never client `weaponId`. | Drop packet |
| `switchSlot` | `slot` integer `0 <= slot <= 4`; target slot must hold an owned weapon in `player.weapons[slot]`. | Ignore |
| `reload` | No params; allowed only if `alive && !downed && !reloading && ammo < magSize`. | Ignore |
| `reloadTap` | No params; allowed once per reload (`!reloadTapUsed`). | Ignore |
| `dash` | Optional `dx, dy` normalized as `move`; if zero, falls back to current move dir or `aimRad`. | Ignore |
| `skill` | Optional `aimRad` wrapped to `[-PI, PI]`. | Ignore |
| `interact` | Optional `targetId` matching `/^[a-z0-9_-]{1,32}$/`. | Ignore |
| `revive` | Optional `targetId` matching `/^[a-z0-9_-]{1,32}$/`. | Ignore |
| `perkPick` | `perkId` matching `/^[a-z0-9_]{1,32}$/`; checked against `player.pendingPerkChoices`. | `GameError` |
| `ping` | `kind` in `['danger','assist','ammo','loot']`; `x, y` finite clamped to `[0, ARENA_W]` x `[0, ARENA_H]`; ping bucket checked. | Drop packet |

- **`seq` field** (optional on `move`/`aim`/`fire`): integer `0 <= seq <= Number.MAX_SAFE_INTEGER`, echoed in frame ack only; never drives server cooldowns or physics delta.
- **`bansung:config`**: whitelist keys (`biome`, `difficulty`, `coopBots`, `reviveRule`, `heroId`), clamp `coopBots` integer `[0, 3]` and validate `players.length + coopBots <= maxPlayers`; invalid enums throw `GameError`.

---

## 4. Server Cooldown & Economy Anti-Cheat (`world.ts`)

All timers use deterministic server simulation time `simTimeMs += 1000 / 30` (30Hz fixed step), never client clocks:
1. **Anti rapid-fire & swap-cancel exploit**:
   - Store `nextFireMs[0..4]` **per weapon slot** plus a global `swapLockUntilMs = simTimeMs + 150` (`SWAP_LOCKOUT_MS = 150`) on `switchSlot`.
   - Fire succeeds only when `simTimeMs >= Math.max(nextFireMs[slot], swapLockUntilMs)`, `!reloading`, `!stunned`, `!downed`, `ammo > 0`, and `energy >= weapon.energyCost`.
   - Deduct `ammo` and `energy` atomically before spawning projectiles; clamp `energy` to `[0, maxEnergy]`.
2. **Active reload anti-cheat**:
   - `reloadStartMs` and `reloadEndMs = simTimeMs + weapon.reloadMs` tracked server-side; `reloadTapUsed` starts `false`.
   - `reloadTap` sets `reloadTapUsed = true` immediately (single attempt). If progress `p = (simTimeMs - reloadStartMs) / reloadMs` is in `[0.45, 0.65]`, complete reload immediately; otherwise add `+250ms` jam penalty to `reloadEndMs`.
3. **Dash / Skill / Revive / Pickup invariants**:
   - `dash`: requires `simTimeMs >= player.nextDashMs` (`1200ms` cooldown) and `!stunned && !downed`; i-frames expire strictly at `simTimeMs >= iFrameEndMs`.
   - `skill`: requires `simTimeMs >= player.nextSkillMs` and `!stunned && !downed`.
   - `interact`: verify `Math.hypot(player.x - obj.x, player.y - obj.y) <= 76` px (`64` base + `12` latency slack) and synchronously set `obj.claimed = true` before granting HP/Energy/Armor/Weapon/Crate loot (blocks double-pickup race).
   - `revive`: progress accrues solely inside `world.tick()` while rescuer is `alive && !downed && !stunned` and within `REVIVE_RADIUS` of downed ally.
   - `perkPick`: allow only during intermission/choice window and only if `player.pendingPerkChoices.has(perkId)`; clear set immediately on selection.
4. **Match payout integrity**: Bet pot and coin payouts go strictly through `Game`/`RoomsService` (`this.paid` + `this.roundId` idempotency); in-arena gold pickups are match-local only.

---

## 5. Static Path Traversal Guard for `/database-ban-sung` (`static-guard.ts` + `app.module.ts`)

### `AppModule` Wiring (`server/src/app.module.ts`)
- Add static mount:
  `{ rootPath: BAN_SUNG_ROOT, serveRoot: '/database-ban-sung', serveStaticOptions: { maxAge: '7d', fallthrough: false, dotfiles: 'deny', index: false, redirect: false } }`
- Add `'/database-ban-sung/{*path}'` to the `exclude` array of the `client/dist` `ServeStaticModule` entry so missing asset paths never fall back to `index.html`.
- Register `BanSungStaticGuard` via `NestModule.configure(consumer)` on `'/database-ban-sung'` and `'/database-ban-sung/{*path}'`.

### `BanSungStaticGuard` Fail-Closed Checklist
Constants:
- `BAN_SUNG_ROOT = path.resolve(__dirname, '..', '..', '..', '..', 'database-ban-sung')`
- `BAN_SUNG_REAL_ROOT = fs.existsSync(BAN_SUNG_ROOT) ? fs.realpathSync(BAN_SUNG_ROOT) : BAN_SUNG_ROOT`
- `ALLOWED_EXT = new Set(['.png', '.webp', '.jpg', '.jpeg', '.ogg', '.mp3', '.wav', '.json'])`

For every incoming request (before `ServeStaticModule` handles it):
1. **Method check**: allow only `GET` and `HEAD` (else `405`).
2. **Raw URL pre-check**: inspect raw `req.originalUrl` before normalization; reject `\0`, `%00`, `\\`, `%5c` (case-insensitive), or `%25` (double-encoding) with `400`.
3. **Single-pass decode**: strip prefix `/database-ban-sung` and query string, run `decodeURIComponent` once inside `try/catch` (`URIError` -> `400`); re-check for `\0` or `\\`.
4. **Segment check**: split by `/`; reject empty relative path (blocks directory listing), `.`, `..`, any segment starting with `.` (dotfiles/hidden dirs), or `:` (Windows drive letters / NTFS alternate data streams) with `403`.
5. **Extension & JSON whitelist**: require `path.extname(relPath).toLowerCase()` in `ALLOWED_EXT` (blocks `.md`, `.ts`, `.js`, `.py`, `.sh`, `.env`). For `.json`, permit only `manifest.json` or paths under `normalized/` (`403` otherwise).
6. **Lexical containment**: `const candidate = path.resolve(BAN_SUNG_ROOT, relPath)`; require `candidate.startsWith(BAN_SUNG_ROOT + path.sep)` (`403` otherwise).
7. **Symlink escape check**: resolve `real = await fs.promises.realpath(candidate)` (catch `ENOENT` -> `404`); require `real.startsWith(BAN_SUNG_REAL_ROOT + path.sep)` (`403` otherwise). Never include filesystem paths in HTTP error responses.
