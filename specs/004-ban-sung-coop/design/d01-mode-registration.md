# d01 — Mode Registration & Static Asset Serving (`bansung`)

## 1. Canonical Naming & Scope
- **Canonical `GameMode` literal**: `'bansung'` (matches `shared/src/bansung.ts`, `server/src/game/bansung/`, `client/src/bansung/`, `BansungBoard.tsx`). Prose references to `ban_sung` map to `'bansung'` in TS types and `database-ban-sung/` for static assets.
- **Static URL root**: `/database-ban-sung` -> repo root `database-ban-sung/`.
- **Boundaries**: `d01` owns mode ID registration, `RoomView` slot, `Home`/`Lobby`/`App` routing hooks, and `/database-ban-sung` serving. Type internals belong to `d02`; lobby config UI/handlers belong to `d03`; `BansungBoard` belongs to `d45`.

## 2. Exact Wave-2 Target Files
| File | Change Summary |
| :--- | :--- |
| `shared/src/protocol.ts` | Add `'bansung'` to `GameMode`, add `GAME_MODES.bansung`, add `RoomView.bansung?: BansungRoomView`. |
| `shared/src/index.ts` | Re-export `./bansung` alongside existing mode modules (`./thap`, `./ants`, `./link`, `./loto`). |
| `client/src/components/Home.tsx` | Verify `GAME_MODES.bansung` card renders cleanly; optional badge/label tweak (already loops `Object.keys(GAME_MODES)`). |
| `client/src/components/Lobby.tsx` | Add `isBansung`, `canStart` / `startProblem` branch, audio cleanup on mode switch, and mount `d03` config block. |
| `client/src/App.tsx` | Lazy/direct import `BansungBoard` and add `view.gameMode === 'bansung' && view.bansung` render branch. |
| `server/src/game/rooms.service.ts` | Fix `create()` (L387) and `setGameMode()` (L344–348) whitelist so `'bansung'` does not fall back to `'exploding_kittens'`. |
| `server/src/game/game.ts` | Wire `this.gameMode === 'bansung'` hooks (L332, L567, L1399, L1444, L2481) with `d03`/`d04`. |
| `client/vite.config.ts` | Serve `/database-ban-sung` in dev/preview and copy `database-ban-sung/` -> `client/dist/database-ban-sung` in `closeBundle()`. |
| `server/src/app.module.ts` | Add `ServeStaticModule` mount for `/database-ban-sung` and exclude it from the SPA fallback entry. |

## 3. `shared/src/protocol.ts` & `shared/src/index.ts`
1. Import view type near L7:
   ```ts
   import type { BansungRoomView } from './bansung';
   ```
2. Extend `GameMode` union (L11):
   ```ts
   export type GameMode =
     | 'exploding_kittens' | 'blackjack_21' | 'tien_len'
     | 'ant_empire' | 'link_duel' | 'loto' | 'thap_hung' | 'bansung';
   ```
3. Add `GAME_MODES.bansung` entry (L13–73):
   ```ts
   bansung: {
     name: 'Bắn Súng Co-op (Soul & Steel)',
     shortName: 'Bắn Súng',
     emoji: '🔫💥',
     minPlayers: 1,
     maxPlayers: 4,
     desc: 'Co-op bắn súng pixel 2.5D kiểu Soul Knight × Miragine War: 4 lớp nhân vật, 10 đợt quái & 3 Boss, lướt né, choáng & hồi sinh đồng đội.',
   },
   ```
   - `minPlayers: 1` permits solo play with AI co-op bots (`d07`); `maxPlayers: 4` aligns with 4-class co-op squad & <12 KB/s net budget (`d47`).
4. Add `bansung?: BansungRoomView;` on `RoomView` right after `thap?: ThapRoomView;` (L263).
5. In `shared/src/index.ts`, add `export * from './bansung';` so `client` and `server` resolve all `bansung` exports via `../../../shared/src`.

## 4. Client Registration (`Home.tsx`, `Lobby.tsx`, `App.tsx`)
- **`client/src/components/Home.tsx`**:
  - L47 already maps `(Object.keys(GAME_MODES) as GameMode[])` and L67 prints `GAME_MODES[gameMode].shortName`. Adding `GAME_MODES.bansung` automatically creates the mode card and quick-create action (`onCreate(rules, 'bansung')`). No hardcoded switch is required unless adding a custom card theme class.
- **`client/src/components/Lobby.tsx`**:
  - L193–199 already maps `Object.keys(GAME_MODES)` to `emit('room:mode', { gameMode: m })`.
  - Add `const isBansung = gameMode === 'bansung';` (near L113 `isThap`).
  - Update `useEffect` on `gameMode` (L83–89) to stop any active mode lobby audio when switching away from `bansung` or `thap_hung`.
  - Update `canStart` (L130–133) and `startProblem` (L583): allow start when `online + bansungBots >= 1 && online + bansungBots <= maxPlayers` (`maxPlayers = GAME_MODES.bansung.maxPlayers`, default 4).
  - Add `} : gameMode === 'bansung' ? (` branch in the mode config container (L368–555) rendering the `d03` co-op lobby config card (biome, difficulty, bots, revive rule, bet) instead of falling through to the Exploding Kittens deck editor.
- **`client/src/App.tsx`**:
  - Import `BansungBoard` from `./components/BansungBoard` (`d45`).
  - In the active game board switch (L218–235), add before fallback:
    ```tsx
    ) : view.gameMode === 'bansung' && view.bansung ? (
      <BansungBoard view={view} meId={meId} />
    ```
    (Exact `BansungBoard` props aligned with `d45`.)

## 5. Server Registration (`rooms.service.ts`, `game.ts`)
- **Critical fix in `server/src/game/rooms.service.ts`**:
  - L387 currently uses a hardcoded `===` chain (`'blackjack_21' || ... || 'thap_hung'`) and silently defaults anything else to `'exploding_kittens'`.
  - Replace L387 and validate `setGameMode` (L344–348) via helper:
    ```ts
    const normalizeGameMode = (raw?: string): GameMode | undefined => {
      const key = raw === 'ban_sung' ? 'bansung' : raw;
      return key && Object.hasOwn(GAME_MODES, key) ? (key as GameMode) : undefined;
    };
    ```
    Use `normalizeGameMode(gameMode) ?? 'exploding_kittens'` in `create()` and throw `GameError` if `normalizeGameMode(mode)` is undefined in `setGameMode()`.
- **Hooks in `server/src/game/game.ts`** (shared with `d03`/`d04`):
  - L332 (`start` setup), L567 (`playing` world init), L1399 (omit `currentPlayerId` for realtime mode), L1444 (`bansung: this.gameMode === 'bansung' ? this.bansungView(id) : undefined`), L2481 (reset/rematch cleanup).

## 6. Static Serve `/database-ban-sung` (`vite.config.ts` & `app.module.ts`)
- **`client/vite.config.ts`**:
  - Refactor duplicated `databasePikachuPlugin` / `databaseMiragineWarPlugin` (or add alongside via a shared `databaseStaticPlugin(route, srcDir, distDir, name)` helper):
    ```ts
    const BANSUNG_DIR = fileURLToPath(new URL('../database-ban-sung', import.meta.url));
    const DIST_BANSUNG_DIR = fileURLToPath(new URL('./dist/database-ban-sung', import.meta.url));
    ```
  - Middleware on `'/database-ban-sung'`:
    - Safely decode URI (`try { decodeURIComponent(...) } catch { return next(); }`), reject `\0`, resolve relative to `BANSUNG_DIR`, enforce `const safeRoot = BANSUNG_DIR.endsWith(sep) ? BANSUNG_DIR : BANSUNG_DIR + sep; if (!file.startsWith(safeRoot)) return next();` (prevents sibling-prefix traversal noted in `d48`), verify `existsSync(file) && statSync(file).isFile()`.
    - Content-Type map: `.png` (`image/png`), `.jpg`/`.jpeg` (`image/jpeg`), `.webp` (`image/webp`), `.mp3` (`audio/mpeg`), `.ogg` (`audio/ogg`), `.wav` (`audio/wav`), `.json` (`application/json; charset=utf-8`).
    - Set `Cache-Control: public, max-age=604800`.
  - `closeBundle()`: if `existsSync(BANSUNG_DIR)`, `cpSync(BANSUNG_DIR, DIST_BANSUNG_DIR, { recursive: true })`.
- **`server/src/app.module.ts`**:
  - Add before the `client/dist` entry (after L20):
    ```ts
    { rootPath: join(__dirname, '..', '..', '..', '..', 'database-ban-sung'), serveRoot: '/database-ban-sung', serveStaticOptions: { maxAge: '7d', fallthrough: false } },
    ```
  - Update `client/dist` `exclude` (L22) to include `'/database-ban-sung/{*path}'` so missing assets never return `index.html` with `200 OK`.

## 7. Verification Criteria
1. `tsc --noEmit` passes across `shared/`, `server/`, `client/`.
2. `room:create` with `gameMode: 'bansung'` (and `room:mode` switching to `'bansung'`) returns `RoomView.gameMode === 'bansung'`.
3. `vite build` copies `database-ban-sung/` into `client/dist/database-ban-sung/`; both Vite dev (`:8801/database-ban-sung/manifest.json`) and Nest static serve (`:3001/database-ban-sung/manifest.json`) return `200`, while `/database-ban-sung/../package.json` and `/database-ban-sung/nonexistent.png` never serve SPA HTML or traverse out of root.
