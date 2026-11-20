# Interface Contracts: Classic 16-Bit Pixel Fantasy Game UI (24 Screens), Accessibility & Automated UI/UX QA Harness

**Feature**: `012-game-ui-qa`  
**Scope**: Phaser 3 ↔ React/Zustand Typed Bridge, Account UI Preferences Sync REST API, 24-Screen Registry Contract & Local Playwright QA Audit Harness Contract — Zero External CDN / Zero Cloud QA SaaS.

---

## 1. Frontend Bridge & Input Focus Contract (`GameUiBridge` & `InputFocusManager`)

```ts
export type InputPriorityLayer =
  | 'WORLD_GAMEPLAY'
  | 'BUILDING_GHOST'
  | 'MODAL_OVERLAY'
  | 'TEXT_IME_INPUT'
  | 'DISCONNECTED_LOCK';

export interface IGameUiBridge {
  // Phaser -> Zustand (Strictly throttled <= 10 Hz HUD, <= 5 Hz Minimap, shallow-diff only)
  emitHudPatch(patch: Partial<HudStateSlice>): void;
  emitMinimapPatch(patch: MinimapFrameSlice): void;
  emitBossCaptionCue(cue: { source: 'BOSS' | 'PARTY' | 'WORLD'; textVi: string; directionHint?: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' }): void;
  emitContextInteractHint(hint: { targetType: string; targetId: string; labelVi: string; candidatesCount: number } | null): void;

  // React -> Phaser (Intent & Accessibility propagation)
  emitPreferencesUpdated(prefs: UiPreferencesProfile): void; // live updates CameraShake, ReducedVfxFlash, IntegerFit, TelegraphPalette
  emitBuildingGhostStart(payload: { buildingId: string; footprintTiles: [number, number]; rotatable: boolean }): void;
  emitForceStopMovement(): void; // called immediately on MODAL_OVERLAY entry so character never drifts into mobs
}

export interface IInputFocusManager {
  getSnapshot(): InputFocusStateSnapshot;
  pushModal(screenId: string): void;
  popTopLayerOnEsc(): { closed: string | 'OPEN_SETTINGS' }; // LIFO: Tooltip -> DragGhost -> BuildingGhost -> TopModal -> SCR-23
  setImeComposing(composing: boolean): void; // blocks all global shortcuts while event.isComposing || keyCode === 229
  canDispatchWorldInput(): boolean; // true ONLY when activeLayer === 'WORLD_GAMEPLAY' && !isImeComposing
}
```

---

## 2. REST API Contract: Account UI & Accessibility Preferences Sync (`accounts/<accountId>.json`)

### `GET /api/v1/account/preferences` (Auth: Bearer JWT)
- **Response `200 OK`**: Trả `UiPreferencesProfile` lưu trong `data/db/accounts/<accountId>.json` (client fallback sang `localStorage` nếu chưa đăng nhập hoặc ngoại tuyến).

### `PUT /api/v1/account/preferences` (Auth: Bearer JWT + `X-Idempotency-Key`)
- **Request**: `UiPreferencesProfile` (đã validate bằng Zod: `canvasScaleMode`, `uiTextScale ∈ {1.0, 1.15, 1.3}`, `cameraShakePercent ∈ {0, 50, 100}`, `reducedVfxFlash`, `colorblindMode`, `bossCaptionsEnabled`, `audioChannels 0..100`, `keyBindings` không trùng phím cùng ngữ cảnh).
- **Response `200 OK`**: `{ preferences: UiPreferencesProfile, revision: number }`.
- **Error `400 ERR_VALIDATION_FAILED`**: Nếu `keyBindings` có hai hành động cùng ngữ cảnh gán trùng phím hoặc giá trị ngoài miền.

---

## 3. 24-Screen UI Contract (`data-testid` & State Fixture Injection for Local QA)

Mọi màn hình trong `apps/client/src/ui/screen-registry.ts` PHẢI gắn `data-testid` cố định khớp bảng chuẩn `docs/ui-ux/ui-testing-strategy.md`:
- Full-Screen Routes: `scr-01-auth`, `scr-02-char-select`, `scr-03-char-create`, `scr-04-loading`
- Persistent HUD Widgets: `scr-05-hud`, `scr-18-minimap`
- RPG Modals & Context Overlays: `scr-06-inventory`, `scr-07-equipment`, `scr-08-stats`, `scr-09-skills`, `scr-10-collection`, `scr-11-gacha`, `scr-12-blacksmith`, `scr-13-enhance`, `scr-14-crafting`, `scr-15-building`, `scr-16-farming`, `scr-17-world-map`, `scr-19-quests`, `scr-20-dialogue`, `scr-21-party`, `scr-22-boss-reward`, `scr-23-settings`, `scr-24-death`
- **No-Ellipsis Attribute**: Mọi phần tử hiển thị giá Gold, `STARLIGHT_SHARD`, số nguyên liệu `5/4`, tỷ lệ Gacha `%`, Pity `X/80`, mức cường hóa `+10`, tỷ lệ `100%` và mã lỗi `ERR_*` PHẢI gắn `data-no-truncate="true"`.
- **Pixel Asset Attribute**: Mọi `<img>` icon/sprite/portrait 16-bit PHẢI gắn `data-pixel-asset="true"` để kiểm tra `image-rendering: pixelated | crisp-edges`.

---

## 4. Local Playwright UI/UX & Visual Regression QA Harness Contract (`tools/ui-qa/`)

```ts
export interface ILocalUiAuditHarness {
  runAudit(config: UiAuditRunConfig): Promise<{
    runId: string;
    totalChecks: number;
    passedChecks: number;
    bugs: UiBugReportEntry[];
    markdownReportPath: string; // artifacts/ui-audit/<date>/ui-audit-report-vi.md
    jsonReportPath: string;     // artifacts/ui-audit/<date>/ui-audit-report.json
  }>;
}
```

### Mandatory Automated Assertion Gates (Zero Third-Party Network Calls)
1. **Network Purity Gate (`P0`)**: Chặn mọi HTTP request ngoài `http://localhost:*` / `http://127.0.0.1:*` (phát hiện Google Fonts/CDN ngoài lập tức sinh `UiBugReportEntry` mức `P0`).
2. **Combat Safe-Area Gate (`P0`)**: Trên `scr-05-hud`, đo `boundingBox()` của toàn bộ HUD widgets; giao với `[0.22..0.78] x [0.16..0.82]` sinh lỗi `P0`.
3. **Pixel Crispness Gate (`P1`)**: Kiểm tra `<canvas>` và toàn bộ `img[data-pixel-asset="true"]` đạt `imageRendering ∈ ["pixelated", "crisp-edges"]` và không có ảnh hỏng (`naturalWidth === 0`).
4. **Vietnamese Diacritic & Overflow Gate (`P1`/`P2`)**: Kiểm tra `scrollWidth <= clientWidth + 1`, `scrollHeight <= clientHeight + 1`, `lineHeight / fontSize >= 1.35` (heading/button) / `>= 1.45` (body), `textOverflow !== 'ellipsis'` trên `data-no-truncate="true"`, `document.fonts.check(...)` cho font cục bộ, và mô phỏng IME `compositionstart -> s/f/r/j/i/b/g -> compositionend` sinh `0` sự kiện gameplay/modal.
5. **WCAG 2.1 AA & Keyboard Gate (`P1`)**: Chạy `@axe-core/playwright` cục bộ (`0` critical/serious) + Keyboard-Only focus walker kiểm chứng Focus Trap & vòng focus `#FBBF24`.
6. **Visual Regression & Vietnamese Reporter**: `toHaveScreenshot({ maxDiffPixelRatio: config.maxPixelDiffRatio, animations: 'disabled' })`; với mọi lỗi thị giác, vẽ khung đỏ bounding box ra `<file>-annotated.png` và xuất báo cáo tiếng Việt theo mẫu `UI-BUG-XXX`.
