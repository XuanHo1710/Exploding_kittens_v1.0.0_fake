# d45 — Pixel HUD, Boss Bar, 5-Slot Hotbar, Radar Minimap & Co-op Pings

## 1. Exact Wave-2 Target Files
- `client/src/components/BansungBoard.tsx` — Fullscreen board (`{ view, meId, emit, chat, dock }` matching `ThapBoard.tsx`), RAF canvas+minimap loop, 15Hz throttled React HUD sync, hotbar/ping/modal UI.
- `client/src/bansung/bansung.css` — Pixel-art HUD layout, stepped pixel borders, bar trails, responsive desktop/mobile safe-area rules.
- Consumes from peer slices: `BansungFrame` / `BansungCommand` (`d02`), `bansungStore` (`d08`), `renderScene` + `renderMinimap` (`d41`), `playBansung` (`d43`), PC/touch input hooks (`d44`).

## 2. Z-Index Layering & Viewport Grid (`bansung.css`)
```css
.bs-game {
  --bs-bg: #141013; --bs-panel: rgba(16, 19, 28, 0.90);
  --bs-border: #3b4254; --bs-gold: #ffd43b; --bs-hp: #fa5252;
  --bs-shield: #ced4da; --bs-energy: #339af0; --bs-text: #f3f1ea;
  position: fixed; inset: 0; z-index: 20; overflow: hidden;
  background: var(--bs-bg); color: var(--bs-text);
  user-select: none; -webkit-user-select: none; touch-action: none;
  image-rendering: pixelated;
}
```
- **Layer stack**: `z:1` Main `<canvas className="bs-canvas">` | `z:3` Edge off-screen ping/ally arrows | `z:4` Top-left bars, Top-center Boss bar, Top-right icons + Radar minimap, Bottom-center 5-slot hotbar | `z:5` Mobile twin-sticks (`d44`) | `z:6` Chat drawer (`ChatPanel`) & Ping wheel | `z:8` Post-game / Leave / Guide `Modal`.
- **Pixel Bevel Border**: `border: 2px solid #0b0e14; box-shadow: inset 0 0 0 2px var(--bs-border), 0 4px 0 rgba(0,0,0,0.45); border-radius: 4px;` (crisp Soul Knight style).

## 3. Top-Left Status Panel (`.bs-hud-tl`)
Anchored `top: max(8px, env(safe-area-inset-top)); left: max(10px, env(safe-area-inset-left));`.
1. **Hero Card (`.bs-hero-card`)**:
   - **Portrait (`44x44px`)**: Hero pixel portrait (`<img>` from `/database-ban-sung/portraits/`), colored team ring, red pulse border when `downed` (`bleedPct` overlay), cyan glint when `invulnMs > 0`.
   - **3 Stacked Resource Bars (`164px × 12px` each, `3px` gap, `font-variant-numeric: tabular-nums`)**:
     - **HP**: `#fa5252 → #c92a2a` fill on `#2b1116` track + white delayed-damage trail (`transition: width 260ms ease-out`), text `❤️ {hp}/{maxHp}`.
     - **Shield / Armor**: `#dee2e6 → #868e96` fill on `#1b202b` track + `#74c0fc` shimmer border while regenerating, text `🛡️ {shield}/{maxShield}`.
     - **Energy**: `#339af0 → #1864ab` fill on `#0e1b2e` track, flashes `#ff6b6b` for `300ms` on empty-energy trigger pull, text `⚡ {energy}/{maxEnergy}`.
2. **Match Micro-Pills**: `WAVE {wave}/10` (amber border on boss/siege waves), `🪙 {coins}`, `💀 {kills}`, `⏱ {mm:ss}`, plus `view.pot > 0` pot badge.
3. **Co-op Squad Strip (`.bs-squad`)**: Up to 3 teammate rows (`22x22` mini portrait, player color dot, `56x5px` HP + `56x3px` Shield bar, `DOWN {sec}s` / `BOT` / `DEAD` tag). Clicking a live teammate while dead/spectating calls `bansungStore.setSpectate(idx)` (`d08`).

## 4. Top-Center Boss Health Bar (`.bs-boss-bar`)
Rendered only when `frame.boss != null` at `top: max(8px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); width: min(440px, calc(100vw - 420px));` (on `<=760px` drops to `top: 66px; width: min(360px, calc(100vw - 24px));`).
- **Header**: Boss icon + uppercase pixel title (e.g. `SAND BEHOLDER`) + phase badge (`P1` / `P2` crimson).
- **Primary HP Bar (`16px` tall)**: `#e03131` fill, `#ffe066` 250ms lag trail, phase-threshold tick marks (`50%`, optional `25%`), centered `{hp} / {maxHp}` text.
- **Stagger / Armor-Break Sub-Bar (`5px` tall)**: `#fcc419` gauge (`0..100%`); switches to pulsing `#ff922b` + `⚡ STUNNED {sec}s` pill during stun/weak-point window (`d37-d39`).
- **Telegraph Toast**: Compact pill under bar during boss windups (`⚠️ EYE-BEAM SWEEP`).

## 5. Top-Right Utility Row & Radar Minimap (`.bs-hud-tr`, `.bs-minimap`)
- **Utility Row**: Sound/Guide (`BookOpen`), Chat (`MessageSquare` + unread badge), `<div className="bs-dock">{dock}</div>` (hidden `<=760px`), Leave (`LogOut`, opens confirm modal if alive & `!ended`).
- **Radar Minimap (`<canvas ref={miniRef}>`)** positioned directly below utility row (`top: 52px; right: max(10px, env(safe-area-inset-right));`, `154×98px` desktop matching `2112×1344` 44×28 tile arena from `d06` / `114×72px` mobile, hidden if `chatOpen` on narrow mobile):
  - **Modes** (toggle via `M` or tap minimap header pill): `ARENA` (full `2112×1344` fit `k = miniW / mapW`) or `RADAR` (`900px` world-radius centered on `me`, clipping off-radar targets to perimeter arrows).
  - **Draw Order (`renderMinimap`, `dpr = Math.min(2, devicePixelRatio)`)**:
    1. Dark biome floor (`#1c1714` desert / `#1b1018` crypt / `#0f1722` lab) + wall/cover AABBs (`#495057`).
    2. Pickups/crates: explosive barrels (`#ff6b6b` 2px), weapon pedestals (`#ffd43b` 3px diamond), ammo/HP orbs (`#69db7c` 2px).
    3. Enemies (`#ff4d4f` 2.5px dots), Boss (`#ffd43b` 6px crown/skull), Teammates (`#51cf66` 3.5px; pulsing red `+` when `downed`), Local player (`#ffffff` 4px + FOV aim wedge).
    4. Active pings (expanding ring) + camera viewport box (`1px rgba(255,255,255,0.45)`).
  - **Click/Alt-Click**: Alt-click (or Ping mode tap) sends a ping at converted world coords `(wx, wy)`.

## 6. Bottom 5-Slot Hotbar & Active Prompts (`.bs-hotbar-wrap`)
Anchored `bottom: max(10px, env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%);`.
- **Context Prompt (above bar)**: `[E] Pick up {Weapon}` (pedestal `d32`) or `💚 Reviving {Name} ({pct}%)` when inside a downed teammate's `r=72px` rescue ring (`d07`).
- **Active Reload Bar (above active slot while `reloading`)**: `120×10px` track, sliding needle `t ∈ [0..1]`, green sweet-spot `[0.45..0.65]` (`d31`); hitting `R` inside window flashes gold `FAST RELOAD!`.
- **5 Slots (`48×48px` desktop, `40×40px` mobile, `gap: 5px`, keys `1`-`5`, cycle `Q`/wheel per `d44`)**:
  - **Slots `1–3` (Weapons)**: Pixel weapon sprite, top-left `<kbd>1..3</kbd>`, top-right energy cost `⚡2`, bottom clip counter `12/12` (or `∞` melee). Selected slot gets `#ffd43b` border + `transform: translateY(-4px)` + weapon title pill above.
  - **Slot `4` (Gadget / Throwable)**: Flashbang / Cluster Bomb / Auto-Turret / Heal Drone (`d30`, `x{charges}` + cooldown curtain overlay).
  - **Slot `5` (Support / Consumable)**: Med-Patch / Shield Cell / Energy Vial (`x{charges}`, instant use on `5` / tap).
- **Dash Chip**: Adjacent `40×40px` skill box (`Space`/`RMB`) with radial/vertical cooldown fill (`#3bc9db`).

## 7. Tactical Co-op Ping System & Edge Clamp Math
```ts
export type BansungPingKind = 'target' | 'help' | 'loot' | 'warn';
export interface BansungPing {
  id: number; ownerIdx: number; kind: BansungPingKind;
  x: number; y: number; expiresAt: number; // 4000ms TTL
}
export function clampEdgeIndicator(
  wx: number, wy: number, cam: { x: number; y: number; zoom: number }, vw: number, vh: number,
) {
  const sx = (wx - cam.x) * cam.zoom + vw / 2;
  const sy = (wy - cam.y) * cam.zoom + vh / 2;
  const pad = 28;
  if (sx >= pad && sx <= vw - pad && sy >= pad && sy <= vh - pad) return null; // on-screen
  const dx = sx - vw / 2, dy = sy - vh / 2;
  const ang = Math.atan2(dy, dx);
  const tx = (vw / 2 - pad) / Math.max(1e-4, Math.abs(Math.cos(ang)));
  const ty = (vh / 2 - pad) / Math.max(1e-4, Math.abs(Math.sin(ang)));
  const t = Math.min(tx, ty);
  return { x: vw / 2 + Math.cos(ang) * t, y: vh / 2 + Math.sin(ang) * t, ang, distM: Math.round(Math.hypot(wx - cam.x, wy - cam.y) / 32) };
}
```
- **Colors & Icons**: `target` (`#ff6b6b` 🎯), `help` (`#ffd43b` 🆘), `loot` (`#22b8cf` 📦), `warn` (`#ff922b` ⚠️).
- **Trigger**: `G` at cursor world position, Middle-Click (`button === 1`), `Alt+Click` on minimap, or mobile 4-button compact Ping pill (`d44`). Emits `emit('bansung:cmd', { t: 'ping', kind, x, y })`; server throttles (`800ms` cooldown, max `3` live per player, `d48`).
- **Rendering**: (1) World-space pulsing ring + icon (`render.ts`), (2) Minimap ripple (`renderMinimap`), (3) Screen-edge arrow badge from `clampEdgeIndicator` for off-screen pings & `downed` allies.

## 8. HUD Update Cadence, Vignette & Responsive Rules
- **15Hz HUD Snapshot (`BansungBoard.tsx`)**: Subscribe to `bansungStore` with a `66ms` throttle calling `setHud(n => n + 1)` (aligned with `d47` budget). `<canvas>` main scene & `miniRef` minimap draw inside `requestAnimationFrame` (`60Hz`) reading `bansungStore` directly.
- **Low-HP / Downed Vignette, Perks & Draft**: When `hp / maxHp <= 0.25` or `downed`, `.bs-vignette` applies pulsing `box-shadow: inset 0 0 64px rgba(224,49,49,0.55)`. Active wave perks (`d32`) render as `20×20px` pixel badges under `.bs-hud-tr`; wave-2/4/6/8 3-card Perk Draft modal sits at `z:7` with `12s` countdown bar.
- **Chat & End Modals**: `.bs-chat` drawer (`top: 52px; right: 10px; width: min(340px, calc(100vw - 20px)); z: 6`) temporarily hides `.bs-minimap` when open; end-match scoreboard delegates to `d46` inside `.bs-end-card`.
- **Mobile Breakpoints (`bansung.css`)**:
```css
@media (max-width: 760px), (pointer: coarse) {
  .bs-dock, .bs-hotbar kbd, .bs-perk-label { display: none; }
  .bs-hero-bars { width: 124px; }
  .bs-minimap canvas { width: 114px !important; height: 72px !important; }
  .bs-boss-bar { top: 68px; width: min(340px, calc(100vw - 24px)); }
  .bs-hotbar-wrap { bottom: max(8px, env(safe-area-inset-bottom)); transform: translateX(-50%) scale(0.86); transform-origin: bottom center; }
}
@media (max-height: 540px) and (min-width: 761px) {
  .bs-minimap canvas { width: 124px !important; height: 78px !important; }
  .bs-hotbar-slot { width: 42px; height: 42px; }
}
```
