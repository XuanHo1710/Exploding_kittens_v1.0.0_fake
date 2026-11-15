# d44 — PC & Mobile Controls (`ban_sung`)

## 1. Wave-2 Target Files
- `shared/src/bansung.ts`: `BansungCommand`, `BANSUNG_BTN_*` bitmask, `BANSUNG_INPUT_HZ`, `BANSUNG_CMD_BURST`, `BANSUNG_CMD_REFILL`.
- `client/src/bansung/input.ts`: Unified PC + Mobile `BansungInputController` (keyboard state, mouse `toWorld` aim, pointer-captured twin-stick touch manager, smart auto-aim fallback, 30Hz coalesced emitter).
- `client/src/components/BansungBoard.tsx`: Mounts `<canvas>` + touch overlay sticks/action buttons + 5-slot touch hotbar; syncs cursor/crosshair mode & spectator camera switch.
- `client/src/bansung/bansung.css`: `touch-action: none`, `env(safe-area-inset-*)`, mobile landscape/portrait joystick & hotbar positioning (extending patterns from `client/src/thap/thap.css`).
- `client/src/bansung/render.ts`: Renders pixel crosshair + spread cone + auto-aim lock diamond + hitmarker ticks + optional touch stick rings.

## 2. Shared Command Schema & Constants (`shared/src/bansung.ts`)
```ts
export const BANSUNG_INPUT_HZ = 30;            // matches 30Hz server tick (33.3ms)
export const BANSUNG_HEARTBEAT_MS = 100;       // resend while movement/fire held
export const BANSUNG_CMD_BURST = 60;           // token bucket burst (vs THAP_CMD_BURST=40)
export const BANSUNG_CMD_REFILL = 40;          // tokens/sec refill for 30Hz + discrete cmds

export const BANSUNG_BTN_FIRE = 1 << 0;        // 1: LMB / Right-stick fire
export const BANSUNG_BTN_DASH = 1 << 1;        // 2: RMB / Space / Dash button
export const BANSUNG_BTN_SKILL = 1 << 2;       // 4: Q / Skill button
export const BANSUNG_BTN_INTERACT = 1 << 3;    // 8: E / Revive / Crate / Swap pickup
export const BANSUNG_BTN_RELOAD = 1 << 4;      // 16: R / Active-reload check

export type BansungCommand =
  /** Coalesced continuous state @ <=30Hz: mx/my in [-100..100], aim in milliradians [-3142..3142] */
  | { t: 'in'; seq: number; mx: number; my: number; aim: number; btn: number }
  /** Immediate discrete commands (never coalesced/dropped) */
  | { t: 'slot'; slot: 0 | 1 | 2 | 3 | 4 }
  | { t: 'ping'; kind: 'here' | 'danger' | 'help'; x: number; y: number }
  | { t: 'perk'; idx: 0 | 1 | 2 };
```
Server validation in `server/src/game/bansung/world.ts`: discard stale `seq <= player.lastSeq`, clamp `mx, my` so `Math.hypot(mx, my) <= 100`, wrap `aim` into `[-3142, 3142]`, and detect `DASH`/`SKILL`/`RELOAD` on rising edge (`(btn & mask) && !(prevBtn & mask)`) while `FIRE` & `INTERACT` act while held.

## 3. Desktop Controls (Mouse + Keyboard)
- **Movement (`WASD` / `Arrow*`)**: Held key set tracks `w,a,s,d,arrowup,arrowdown,arrowleft,arrowright`. Raw vector `(dx, dy)` is normalized by `len = Math.hypot(dx, dy)` when `len > 1` so diagonals equal `0.7071` (`mx/my = Math.round((dx/len)*100)`), preventing 1.414x diagonal speed advantage.
- **Aim (Mouse)**: Convert viewport pointer `(clientX, clientY)` to world `(wx, wy)` via `cam.x + (sx - rect.left - rect.width / 2) / cam.zoom` (matching `ThapBoard.tsx` `toWorld`). Local hero gun/sprite rotates immediately at 60fps via `atan2(wy - localY, wx - localX)` for zero-lag feel; quantized to `Math.round(rad * 1000)` on wire.
- **Shoot (`LMB`, `e.button === 0`)**: Sets `BANSUNG_BTN_FIRE` while held (supports tap semi-auto & hold auto-fire). Suppress `contextmenu` on `<canvas>`.
- **Dash (`RMB`, `e.button === 2` OR `Space`)**: Rising edge sets `BANSUNG_BTN_DASH` (client predicts dash impulse along move vector if `|mx|+|my|>0`, else aim vector; server validates dash cooldown/charges).
- **Hotbar (`1`-`5` / Mouse Wheel)**: `Digit1..5` & `Numpad1..5` emit `{ t: 'slot', slot: 0..4 }` (slots `0..2` equip weapons; slots `3..4` trigger/equip consumables or deployables). `wheel` cycles weapon slots `0..2` with `90ms` debounce (`Ctrl+Wheel` or spectator `wheel` adjusts camera zoom).
- **Actions**: `Q` = Hero Skill (`BTN_SKILL`), `E` = Interact / Hold-Revive / Pickup (`BTN_INTERACT`), `R` = Manual / Active-Reload (`BTN_RELOAD`), `G` or `Middle Click (button === 1)` = Tactical Ping at `(wx, wy)`, `Tab` = Hold Scoreboard, `Enter` = Focus Chat, `Escape` = Close modal.
- **Downed / Spectator Controls**: When downed, movement slows to crawl (`server` clamp), firing disabled, `ping` (`help`) allowed; when dead/spectator, `Space` or `LMB` cycles followed alive teammate (`followIdx`), `WASD` detaches into free camera pan.
- **Focus & Blur Guard**: Ignore hotkeys when `(e.target as HTMLElement)?.tagName` is `'INPUT' | 'TEXTAREA' | 'SELECT'` (per `ThapBoard.tsx`). On `window.blur`, `visibilitychange (hidden)`, or chat focus, clear held keys/pointers and flush `{ t: 'in', seq, mx: 0, my: 0, aim, btn: 0 }`.

## 4. Mobile Twin-Stick & Touch Hotbar (Soul Knight Layout)
Auto-enabled when `window.matchMedia('(pointer: coarse)').matches` or on first `e.pointerType === 'touch'`; manual override (`auto | touch | desktop`) saved in settings. Multi-touch binds `setPointerCapture(e.pointerId)` on the touch layer and tracks `Map<number, TouchSlot>`.

| Zone / Control | Position & Geometry | Behavior & Constants |
| :--- | :--- | :--- |
| **Left Move Stick** | Left zone (`x < 0.45 * W`), floating anchor clamped inside safe area | Outer `R_MOVE = 56px`, knob `22px`, deadzone `DZ_MOVE = 0.14` (`~8px`). If drag exceeds `1.6 * R_MOVE`, anchor slides toward thumb (`softFollow`). Output magnitude `0.14..1.0` remaps to `[0..1]`. |
| **Right Fire / Aim Pad** | Bottom-right (`right: 26px, bottom: 28px`), base `84px` (`R_AIM = 58px`) | Dual-mode Soul Knight pad: **Tap/Hold (`drag < DZ_AIM = 10px`)** sets `BTN_FIRE` + **Smart Auto-Aim**; **Hold+Drag (`drag >= 10px`)** sets `BTN_FIRE` + manual twin-stick aim `atan2(dy, dx)`. |
| **Skill Button (`Q`)** | Arc top-left of Fire Pad (`right: 102px, bottom: 106px`, `52px`) | Tapping sets `BTN_SKILL` on rising edge; renders circular cooldown sweep + pulse when ready. |
| **Dash Button (`Space`)** | Arc left of Fire Pad (`right: 124px, bottom: 24px`, `52px`) | Sets `BTN_DASH`; consumes dash charge along move stick (or aim dir if stationary). |
| **Interact / Reload (`E/R`)** | Above Fire Pad (`right: 26px, bottom: 126px`, `48px`) | Contextual badge: shows Revive / Open / Swap icon when `me.nearInteract` is set, else acts as Reload / Active-Reload trigger. |
| **Bottom 5-Slot Hotbar** | Bottom-center (`left: 50%`, `bottom: max(10px, safe-bottom)`) | 5 pixel slots (`44x44px` min tap target, `gap: 6px`). `onPointerDown` calls `e.stopPropagation()` so taps emit `{ t: 'slot', slot }` without spawning sticks. Re-tapping active slot reloads. |

### Smart Auto-Aim Fallback Algorithm (Mobile Hold-Fire)
Runs client-side at 60fps only when `touchMode && fireHeld && !aimDragManual`:
1. Scan visible enemies in `bansungStore` within `AUTO_AIM_RANGE = 620px` (or `weapon.range + 80px`).
2. Reject candidates blocked by wall AABBs (tile/grid LOS raymarch shared with `d05`).
3. Score each candidate `s = dist - (isBoss ? 140 : 0) - (hpPct < 0.25 ? 80 : 0)`; select minimum `s`.
4. If found, slew local `aim` toward `atan2(ty - py, tx - px)` and render target-lock diamond beneath enemy; if none found, align `aim` to move stick direction (or retain last valid `aim` when idle).

## 5. `BansungInputController` Interface & Loop (`client/src/bansung/input.ts`)
```ts
export interface InputViewState {
  touchUi: boolean;
  moveStick: { active: boolean; ox: number; oy: number; kx: number; ky: number };
  aimStick: { active: boolean; ox: number; oy: number; kx: number; ky: number; manual: boolean };
  aimRad: number;            // 60fps local aim for zero-latency hero gun & crosshair
  autoAimTargetId: number | null;
}

export class BansungInputController {
  attach(canvas: HTMLCanvasElement, emit: (cmd: BansungCommand) => void): () => void;
  setLocalOrigin(worldX: number, worldY: number, cam: { x: number; y: number; zoom: number }): void;
  setAlive(alive: boolean, downed: boolean): void;
  flush(nowMs: number): void; // called every rAF from BansungBoard
  resetAll(): void;           // called on blur, chat focus, or phase end
}
```
- **Coalescing & Edge Priority**: `flush(nowMs)` compares current `(mx, my, aim, btn)` against last sent frame:
  - Button rising/falling edge (`btn !== last.btn`): emit immediately (bypass 33ms gate so click-shots, dashes, and active-reloads never drop).
  - Continuous analog/aim delta (`mx !== last.mx || my !== last.my || Math.abs(aim - last.aim) >= 18`): emit when `nowMs - lastSentAt >= 33` (30Hz cap).
  - Active hold heartbeat (`mx !== 0 || my !== 0 || btn !== 0`): emit when `nowMs - lastSentAt >= 100` (10Hz keepalive).
- **Desktop Crosshair**: Hide OS cursor (`cursor: none`) over `<canvas>` while alive; `render.ts` draws a crisp 16x16 pixel reticle expanding by `weapon.spreadDeg`, cyan/gold tick arc during active-reload window, and `120ms` red X hitmarker on hit events.

## 6. Responsive CSS (`client/src/bansung/bansung.css`)
- Root `.bansung-game` & `.bansung-canvas`: `position: fixed; inset: 0; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;`
- Safe-area insets: apply `env(safe-area-inset-left/right/bottom)` to `.bansung-touch-layer` and `.bansung-hotbar`.
- `@media (pointer: fine)`: hide `.bansung-touch-layer` unless manual touch override is enabled.
- `@media (max-height: 520px)` (mobile landscape): scale `R_MOVE`/`R_AIM` to `46px`, Fire Pad to `72px`, action buttons to `44px`, and hotbar slots to `38x38px` so sticks and 5-slot hotbar stay unobstructed.
- `@media (max-width: 640px)` (narrow portrait): elevate `.bansung-hotbar` to `bottom: calc(max(10px, env(safe-area-inset-bottom)) + 104px)` above the twin sticks.
