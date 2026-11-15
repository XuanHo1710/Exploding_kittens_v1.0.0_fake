# d21 — Recoil, Camera Impulse, 30ms Hitstop & Dynamic Crosshair Bloom

Client-side tactile weapon juice for `ban_sung` (`client/src/bansung/`). Purely visual/local feedback—never alters authoritative 30Hz server trajectories (`d04`), keeping hitboxes deterministic while delivering Soul Knight / Nuclear Throne punchiness atop Miragine-style frame animation.

## Wave-2 Target Files

| File | Role |
|---|---|
| `client/src/bansung/recoil.ts` *(new)* | Owns `WeaponRecoilProfile` presets, per-shooter `GunSpringMap`, `CameraJuiceState`, `CrosshairState`, `HitstopState`, and `stepJuice(rawDtMs, now)` |
| `client/src/bansung/store.ts` | Calls `triggerShotJuice()` on local fire / remote shot FX, `triggerHitstop()` on crit/explosion deltas, exposes `visualNow(now)` |
| `client/src/bansung/render.ts` | Applies `camOffset` in world `ctx.setTransform` (matching `thap/render.ts` pattern), feeds `kickPx` + `snapRad` to `d19` gun pivot, draws pixel crosshair |

---

## 1. Schemas & Constants

```ts
export type RecoilPresetId = 'pistol' | 'rifle' | 'smg' | 'shotgun' | 'railgun' | 'launcher' | 'melee';

export interface WeaponRecoilProfile {
  kickPx: number;        // linear barrel kickback along -aimDir (negative = melee lunge)
  muzzleSnapRad: number; // upward rotational kick in radians (screen-up, mirrored by facing)
  camKickPx: number;     // directional camera impulse opposite aimDir (local player only)
  traumaAdd: number;     // [0..1] additive trauma for decaying shake
  bloomAdd: number;      // crosshair gap added per shot (CSS px)
  bloomBase: number;     // resting crosshair half-gap (CSS px)
  bloomMax: number;      // max crosshair half-gap (CSS px)
  bloomDecay: number;    // exponential decay rate (1/s)
}

export interface GunSpringState {
  kickPos: number;   kickVel: number;   // px along -aimDir
  snapAngle: number; snapVel: number;   // rad offset around shoulder pivot
  lastActiveMs: number;
}

export interface CameraJuiceState {
  rx: number; ry: number; rvx: number; rvy: number; // directional recoil spring (world px)
  trauma: number;                                   // [0..1], shake = trauma^2 * MAX_SHAKE_PX
  hitstopRemMs: number;
  lastHitstopAt: number;                            // anti-stack cooldown gate
  visualTimeMs: number;                             // frozen during hitstop; feeds anims/particles
}

export interface CrosshairState {
  bloomPx: number;
  hitMarkerMs: number;    // >0 draws diagonal X ticks
  hitCrit: boolean;       // gold/red tint when hitCrit=true
  reloadRatio: number;    // 0 = idle, (0..1] = active reload arc/bar
}
```

### Weapon Preset Table (`RECOIL_PROFILES`)

| Preset | `kickPx` | `muzzleSnapRad` | `camKickPx` | `traumaAdd` | `bloomAdd` | `bloomBase` | `bloomMax` | `bloomDecay` |
|---|---|---|---|---|---|---|---|---|
| `pistol` | `4.0` | `0.14` | `3.0` | `0.06` | `4.5` | `5` | `20` | `12.0` |
| `rifle` | `5.5` | `0.11` | `4.5` | `0.07` | `3.2` | `6` | `22` | `11.0` |
| `smg` | `3.0` | `0.08` | `2.2` | `0.04` | `2.6` | `7` | `24` | `12.5` |
| `shotgun` | `11.0` | `0.32` | `11.0` | `0.24` | `10.0` | `11` | `28` | `8.5` |
| `railgun` | `13.0` | `0.28` | `14.0` | `0.30` | `8.0` | `4` | `22` | `7.5` |
| `launcher` | `12.0` | `0.35` | `12.0` | `0.28` | `9.0` | `8` | `26` | `7.5` |
| `melee` | `-6.0` | `0.00` | `2.5` | `0.05` | `0.0` | `4` | `10` | `14.0` |

Global tuning constants:
- `GUN_STIFFNESS = 420`, `GUN_DAMPING = 28` (ζ ≈ 0.68: crisp snap with tiny settle)
- `SNAP_STIFFNESS = 360`, `SNAP_DAMPING = 26`, `MAX_SNAP_RAD = 0.52` (~30°), `MAX_KICK_PX = 16`
- `CAM_STIFFNESS = 260`, `CAM_DAMPING = 24`, `MAX_CAM_KICK_PX = 22`, `MAX_SHAKE_PX = 14`, `TRAUMA_DECAY = 2.4`
- `HITSTOP_CRIT_MS = 30`, `HITSTOP_EXPLOSION_MS = 30`, `HITSTOP_BOSS_MS = 45`, `HITSTOP_COOLDOWN_MS = 140`
- `MOVE_BLOOM_PX = 3.5`, `DASH_BLOOM_PX = 4.0`, `HIT_MARKER_MS = 110`, `SPRING_DT_CAP = 0.05`

---

## 2. Gun Kickback Spring & Rotational Muzzle Snap

Runs for **all visible heroes** (`Map<entityId, GunSpringState>`, pruned if idle > `2000ms`):
- **On shot trigger** (`aimAngle`, `profile`):
  - `facing = Math.cos(aimAngle) >= 0 ? 1 : -1`
  - Linear kickback: `s.kickPos = clamp(s.kickPos + p.kickPx * 0.65, -8, MAX_KICK_PX); s.kickVel += p.kickPx * 18;`
  - Upward screen-space muzzle snap: `s.snapAngle = clamp(s.snapAngle - facing * p.muzzleSnapRad * 0.7, -MAX_SNAP_RAD, MAX_SNAP_RAD); s.snapVel -= facing * p.muzzleSnapRad * 14;`
- **Per-frame step** (`dt = Math.min(SPRING_DT_CAP, rawDtMs / 1000)` during non-hitstop frames):
  - `s.kickVel += (-GUN_STIFFNESS * s.kickPos - GUN_DAMPING * s.kickVel) * dt; s.kickPos += s.kickVel * dt;`
  - `s.snapVel += (-SNAP_STIFFNESS * s.snapAngle - SNAP_DAMPING * s.snapVel) * dt; s.snapAngle += s.snapVel * dt;`
  - Zero-snap deadzone when `|pos| < 0.05 && |vel| < 0.5` (`0.002 rad` for snap).
- **Handoff to `d19` (`render.ts`)**: offset gun shoulder-pivot by `(-Math.cos(aimAngle) * s.kickPos, -Math.sin(aimAngle) * s.kickPos)` and draw sprite at `aimAngle + s.snapAngle`. Bullet/tracer origins (`d22`) still spawn along true `aimAngle`.

---

## 3. Directional Camera Recoil & Trauma Shake

Runs for **local hero only** (halved amplitude when spectating a teammate per `d08`):
- **Directional shot kick**: on local fire along `(dx, dy) = (cos(aim), sin(aim))`:
  `rvx -= dx * p.camKickPx * 15; rvy -= dy * p.camKickPx * 15;`
- **Blast / damage impulse**: on explosion at `(bx, by)` within `480px` of camera:
  `falloff = clamp(1 - dist / 480, 0.15, 1);` push `(rvx, rvy)` away from `(bx, by)` by `320 * falloff` + add `trauma = min(1, trauma + 0.45 * falloff)`.
- **Camera spring & trauma decay**:
  - `rvx += (-CAM_STIFFNESS * rx - CAM_DAMPING * rvx) * dt; rx = clamp(rx + rvx * dt, -MAX_CAM_KICK_PX, MAX_CAM_KICK_PX);` (same for `ry`).
  - `trauma = max(0, trauma - TRAUMA_DECAY * dt);`
  - Deterministic shake (no `Math.random()` jitter flicker): `amp = trauma * trauma * MAX_SHAKE_PX`, `sx = amp * Math.sin(t * 73) * Math.cos(t * 41)`, `sy = amp * Math.cos(t * 67) * Math.sin(t * 53)`.
- **Render integration**: `effectiveCam = { x: cam.x + rx + sx, y: cam.y + ry + sy, zoom: cam.zoom }` passed into `ctx.setTransform(dpr * z, ...)`.

---

## 4. 30ms Hitstop on Crits & Explosions (Netcode-Safe)

1. **Trigger conditions**:
   - Local player deals a **Crit** (`crit` flag in `BansungFrame` FX delta) → `HITSTOP_CRIT_MS` (`30ms`).
   - **Explosion** (rocket, grenade, barrel, boss slam) within `420px` of camera center → `HITSTOP_EXPLOSION_MS` (`30ms`); boss phase-break/kill → `HITSTOP_BOSS_MS` (`45ms`).
2. **Non-stacking cooldown gate**:
   - Trigger only if `now - state.lastHitstopAt >= HITSTOP_COOLDOWN_MS` (`140ms`); prevents rapid-fire SMG crits from locking the screen.
   - `state.hitstopRemMs = Math.max(state.hitstopRemMs, durMs); state.lastHitstopAt = now;`
3. **Simulation vs Visual isolation**:
   - WebSocket frame ingestion (`store.ts` ring buffer) and server tick interpolation target timestamps **never pause**.
   - `stepJuice(rawDtMs, now)` decrements `hitstopRemMs` first. While `hitstopRemMs > 0`, `visualTimeMs` freezes (pausing sprite frame progression, pooled particles `d42`, and recoil spring decay), while adding a `±1.5px` high-frequency micro-tremor to `camOffset` and flashing the struck enemy's white tint (`d17`). Since `30ms < 33.3ms` (1 server tick), resuming `visualTimeMs` catches up smoothly without teleporting.

---

## 5. Dynamic Crosshair Bloom & Pixel Reticle

- **Bloom update** (every frame, unaffected by hitstop so aiming always feels responsive):
  - `targetFloor = profile.bloomBase + speedNorm * MOVE_BLOOM_PX + (isDashing ? DASH_BLOOM_PX : 0)`
  - On shot: `bloomPx = Math.min(profile.bloomMax, bloomPx + profile.bloomAdd)`
  - Exponential settle: `bloomPx += (targetFloor - bloomPx) * (1 - Math.exp(-profile.bloomDecay * dt))`
- **Pixel-art canvas draw** (screen-space overlay at `Math.round(cursorX), Math.round(cursorY)`):
  - **4 cardinal ticks** (`5x2px` horiz, `2x5px` vert) offset by `gap = Math.round(bloomPx)` from center, `#ffffff` fill with `1px` `#000000` outline (`#ff6b6b` pulse when magazine empty or energy < weapon cost).
  - **2x2px center dot** (`#ffffff` + `1px` black border).
  - **Hit marker (`hitMarkerMs > 0`)**: four `4px` diagonal ticks at `(±(gap+2), ±(gap+2))`, `#ffffff` normal or `#ffd43b` on crit.
  - **Active reload bar**: `20x3px` pixel progress strip `14px` below reticle when `reloadRatio > 0` (highlighting active-reload sweet spot per `d31`).
  - **Mobile touch (`d44`)**: when twin-stick aiming without mouse, project reticle at `heroScreenPos + aimDir * 140px`.

---

## 6. Accessibility & Constraints

- `reducedScreenShake` client toggle: scales `camKickPx`, `traumaAdd`, and micro-tremor by `0.25`, disables `hitstopRemMs` (`0ms`), while preserving gun kickback springs and crosshair bloom.
- Zero per-frame object allocations in `stepJuice()` / `drawCrosshair()`.
