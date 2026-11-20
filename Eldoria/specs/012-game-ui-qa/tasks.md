# Tasks: Classic 16-Bit Pixel Fantasy Game UI (24 Screens), Accessibility & Automated UI/UX QA Harness

**Input**: Design documents from `/specs/012-game-ui-qa/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/game-ui-qa-contract.md`, `quickstart.md`

**Tests**: Bao gồm kiểm thử đơn vị Vitest/RTL cho bộ primitives 8 trạng thái, cầu nối `<= 10 Hz` & bảo vệ IME tiếng Việt, và bộ kiểm toán Playwright cục bộ 24 màn hình × đa độ phân giải + `axe-core` + trình sinh báo cáo lỗi tiếng Việt.

## Phase 1: Setup (Local Typography, Design Tokens, 9-Slice & Shared Contracts)

**Purpose**: Đóng gói 100% phông tiếng Việt cục bộ (0 CDN), bảng token WCAG 2.1 AA, 5 khung pixel 9-slice và lược đồ dùng chung.

- [ ] T001 Define Zod schemas and TypeScript contracts enforcing `UiPreferencesProfile.canvasScaleMode`, `UiPreferencesProfile.uiTextScale`, `UiPreferencesProfile.cameraShakePercent`, `UiPreferencesProfile.reducedVfxFlash`, `UiPreferencesProfile.colorblindMode`, `UiPreferencesProfile.bossCaptionsEnabled`, `UiPreferencesProfile.audioChannels`, and `UiPreferencesProfile.keyBindings` per `data-model.md` in `packages/shared/src/contracts/ui-preferences-contracts.ts`
- [ ] T002 [P] Configure local SIL OFL 1.1 `@font-face` rules (`Press Start 2P`, `Silkscreen`, `Fusion Pixel 12px`, `Pixelify Sans` from `assets/fonts/*.woff2`, zero external URLs) with Vietnamese diacritic protection (`line-height >= 1.35` headings / `>= 1.45` body, `tabular-nums`) in `apps/client/src/styles/fonts.css`
- [ ] T003 [P] Implement verified WCAG 2.1 AA color, 6-rarity, 9-element, spacing (`4px/8px`), and Z-Index tokens plus 5 pixel 9-slice `border-image` classes (`image-rendering: pixelated`) and `#FBBF24`/`#140F1C` `:focus-visible` ring in `apps/client/src/styles/tokens.css` and `apps/client/src/styles/nine-slice.css`
- [ ] T004 [P] Define canonical 24-screen registry (`SCR-01`..`SCR-24`) enforcing `UiScreenRegistryEntry.screenId`, `UiScreenRegistryEntry.testId`, `UiScreenRegistryEntry.layerToken`, `UiScreenRegistryEntry.requiredStates`, and `UiScreenRegistryEntry.primaryStores` per `data-model.md` in `apps/client/src/ui/screen-registry.ts`

---

## Phase 2: Foundational (Decoupled Bridge, 5-Tier Input Focus & Preferences Persistence)

**Purpose**: Xây dựng cầu nối tách biệt Phaser 60 FPS ↔ Zustand (`<= 10 Hz`), bộ điều phối đầu vào 5 tầng bảo vệ bộ gõ tiếng Việt IME và đồng bộ tùy chọn về JSON tài khoản.

- [ ] T005 Implement `GameUiBridge` and `InputFocusManager` enforcing `InputFocusStateSnapshot.activeLayer`, `InputFocusStateSnapshot.modalStack` (LIFO `ESC`), `InputFocusStateSnapshot.isImeComposing` (`event.isComposing || keyCode === 229`), and `InputFocusStateSnapshot.hudSyncMaxHz` (`<= 10 Hz` HUD / `<= 5 Hz` Minimap, zero per-frame React world updates, auto-stop movement on modal open) per `data-model.md` in `apps/client/src/bridge/GameUiBridge.ts` and `apps/client/src/bridge/InputFocusManager.ts`
- [ ] T006 [P] Implement `useUiModalStore`, `useHudStore`, and `AccountPreferencesController` (`GET`/`PUT /api/v1/account/preferences` persisting `UiPreferencesProfile` to `data/db/accounts/<accountId>.json` via `JsonDatabaseEngine` with `localStorage` fallback and `prefers-reduced-motion` initial auto-detection) in `apps/client/src/stores/useUiModalStore.ts`, `apps/client/src/stores/useHudStore.ts`, and `apps/game-server/src/modules/account/AccountPreferencesController.ts`

**Checkpoint**: Local fonts, WCAG AA tokens, 24-screen registry, decoupled bridge, IME guard, and preferences persistence ready.

---

## Phase 3: User Story 3 & Core Primitives — Bộ Primitives 8 Trạng thái + `disconnected` (Priority: P2 / Prerequisite for 24 Screens)

**Goal**: Xây dựng trọn bộ 7 nhóm component UI lõi phủ đủ `default`, `hover`, `active`, `focus`, `disabled`, `loading`, `empty`, `error` và `disconnected` làm nền xây dựng đồng nhất cả 24 màn hình.

**Independent Test**: Chạy Vitest + React Testing Library xác minh cả 7 nhóm primitives render đúng toàn bộ 8 trạng thái, khóa double-submit khi `loading`, giữ dấu tiếng Việt và mã hóa 3 lớp độ hiếm + 9 nguyên tố.

### Implementation for Core Primitives & State Coverage (US3)

- [ ] T007 [P] [US3] Implement `PixelButton` (6 variants, `sm/md/lg`, 8 states, double-submit lock) and `PixelFormControls` (`PixelInput` IME-safe, `PixelSelect`, `PixelToggle`, 8 states) in `apps/client/src/ui/primitives/PixelButton.tsx` and `apps/client/src/ui/primitives/PixelFormControls.tsx`
- [ ] T008 [P] [US3] Implement `ItemSlot` (6-rarity corner shapes + `C..M`/star badges, 9-element silhouettes, dark pill `#1B1624` contrast guard, durability bar, 8 states) and `StatBar` (delayed damage trail, `tabular-nums`, `role="progressbar"`, 8 states) in `apps/client/src/ui/primitives/ItemSlot.tsx` and `apps/client/src/ui/primitives/StatBar.tsx`
- [ ] T009 [P] [US3] Implement `PixelTooltip` (▲/▼ stat diff, auto viewport flip, 8 states), `PixelModal` (9-slice dialog, Focus Trap, focus restoration, ARIA `role="dialog"`, 8 states), and `PixelToast` + `ReconnectBanner` (`--z-disconnect`, `aria-live`) in `apps/client/src/ui/primitives/PixelTooltip.tsx`, `apps/client/src/ui/primitives/PixelModal.tsx`, and `apps/client/src/ui/primitives/PixelToast.tsx`
- [ ] T010 [US3] Add Vitest + RTL unit tests validating all 8 states across primitives, `GameUiBridge` `<= 10 Hz` throttle, and `InputFocusManager` LIFO `ESC` + Telex/VNI IME guard in `apps/client/tests/unit/primitives-states.spec.tsx` and `apps/client/tests/unit/bridge-and-ime.spec.ts`

**Checkpoint**: All 7 primitive families pass 8-state & IME/throttle unit tests independently.

---

## Phase 4: User Story 1 - Triển khai Đầy đủ 24 Màn hình Pixel Fantasy RPG (`SCR-01`..`SCR-24`) (Priority: P1) 🎯 MVP

**Goal**: Dựng hoàn chỉnh cả 24 màn hình bắt buộc theo `screen-inventory.md`, bảo đảm vùng an toàn chiến đấu trung tâm `>= 68%–76%`, responsive `1024×768..2560×1440`, không có dark pattern và bảo toàn quy tắc `No-Ellipsis`.

**Independent Test**: Duyệt đủ `24/24` màn hình ở `1920×1080`, `1280×720` và `1024×768`; xác minh Safe-Area Combat Box sạch trên `SCR-05`, reflow lưới `8→6` cột ở `SCR-06` và `1×4→2×2` ở `SCR-21`, Gacha công khai tỷ lệ không nạp tiền thật và Enhancement `+0..+10` `100%` không vỡ đồ.

### Implementation for User Story 1 (24 Mandatory Screens)

- [ ] T011 [P] [US1] Implement Entry & Lifecycle full-screen routes: `SCR-01` Login/Register (`scr-01-auth`), `SCR-02` Character Selection (`scr-02-char-select`), `SCR-03` Starter Selection (`scr-03-char-create`, 3 MVP heroes), `SCR-04` Loading Screen (`scr-04-loading`), and `SCR-24` Death & Respawn (`scr-24-death`, `1.5s` anti-accidental-click lock + 100% gear preservation notice) in `apps/client/src/ui/screens/`
- [ ] T012 [P] [US1] Implement persistent HUD & Map widgets: `SCR-05` Main Game HUD (`scr-05-hud`, Safe-Area `[22%..78%] x [16%..82%]`, Unit Frame, Skill Hotbar, Contextual `[F]` hint, Quest Tracker, Currency/Menu dock) and `SCR-18` Minimap (`scr-18-minimap`, `<= 5 Hz` update, 2 zoom levels, Day/Season/Weather clock) in `apps/client/src/ui/hud/MainGameHud.tsx` and `apps/client/src/ui/hud/MinimapWidget.tsx`
- [ ] T013 [P] [US1] Implement Character & Progression RPG modals: `SCR-06` Inventory (`scr-06-inventory`, 8→6 col reflow, drag/keyboard move, stack split), `SCR-07` Equipment (`scr-07-equipment`, 10-slot paperdoll + Set Bonus), `SCR-08` Character Stats (`scr-08-stats`, 17 stats + 9 elemental res + draft preview), `SCR-09` Skill Tree (`scr-09-skills`, 5 skills + unlock gate), and `SCR-10` Character Collection (`scr-10-collection`, 12 heroes + Safe-Zone hero switch) in `apps/client/src/ui/modals/`
- [ ] T014 [P] [US1] Implement Economy, Blacksmith, Crafting & Gacha modals: `SCR-11` Gacha (`scr-11-gacha`, public odds modal, live Pity `X/80` & `X/70`, history, `STAR_ESSENCE` exchange, 0 real-money buttons, `X-Idempotency-Key` lock), `SCR-12` Blacksmith (`scr-12-blacksmith`, 4 tabs), `SCR-13` Weapon Enhancement (`scr-13-enhance`, deterministic `+0..+10` `100%` preview, `bld_blacksmith` tier check, `+10` pinnacle badge), and `SCR-14` Crafting (`scr-14-crafting`, 4 stations, batch `1..Max`) in `apps/client/src/ui/modals/`
- [ ] T015 [P] [US1] Implement World, Homestead, Quest & Co-op modals: `SCR-15` Building (`scr-15-building` + Ghost Placement overlay), `SCR-16` Farming (`scr-16-farming`, 4 seasons + 24h offline log), `SCR-17` World Map (`scr-17-world-map`, 8 regions + Fog of War + combat Fast Travel block), `SCR-19` Quest Journal (`scr-19-quests`, 2-page parchment + 3 pins), `SCR-20` NPC Dialogue (`scr-20-dialogue`, `96×96` portrait + skippable typewriter), `SCR-21` Party (`scr-21-party`, 1×4→2×2 reflow + server-timed `30s` Ready Check), and `SCR-22` Boss Reward (`scr-22-boss-reward`, storage overflow notice) in `apps/client/src/ui/modals/`

**Checkpoint**: All 24 mandatory screens (with `SCR-23` completed in Phase 5) adhere to 16-bit Pixel Fantasy tokens, No-Ellipsis rules, and responsive breakpoints.

---

## Phase 5: User Story 2 - Cài đặt (`SCR-23`) & Trợ năng Toàn diện (Priority: P1) 🎯 MVP

**Goal**: Hoàn thiện màn hình `SCR-23 Settings` và kích hoạt live toàn bộ tính năng trợ năng (WCAG AA, Colorblind triple-coding, `Camera Shake 0%/50%/100%`, `Reduced VFX Flash <= 3 Hz`, Text Scale `100%/115%/130%`, Boss Captions, 5-channel audio, Key Remapping conflict swap).

**Independent Test**: Đổi đồng thời mọi tùy chọn trợ năng trên `SCR-23` áp dụng tức thì không reload, lưu vào `localStorage` + `PUT /api/v1/account/preferences`, và vượt qua kiểm tra `VP-A11Y` (`1280×720 @ 130%`).

### Implementation for User Story 2

- [ ] T016 [US2] Implement `SCR-23` Settings modal (`scr-23-settings`, 5 tabs: Display `INTEGER_FIT`/`FILL_PIXELATED` + live `--ui-text-scale` `100%/115%/130%`, 5-channel Audio + `Alt+M` mute, Key Remapping with conflict swap, Accessibility `Camera Shake 0/50/100%` + `Reduced VFX Flash <= 3 Hz` + `Colorblind Mode` + `Boss Captions`, Account) syncing `UiPreferencesProfile` live via `GameUiBridge` in `apps/client/src/ui/modals/SettingsModal.tsx`
- [ ] T017 [P] [US2] Implement `BossCaptionBar` (closed-caption cue bar below Boss Bar, max 2 lines, directional arrows, never intruding on combat safe area), global `<= 3 Hz` flash frequency guard in `CombatVfxSystem`, and ultrawide `16:9` centered viewport clamping in `apps/client/src/ui/hud/BossCaptionBar.tsx` and `apps/client/src/game/systems/CombatVfxSystem.ts`

**Checkpoint**: Complete 24/24 screens and full WCAG AA + motion/colorblind/IME accessibility operational.

---

## Phase 6: User Story 4 - Bộ Kiểm toán Tự động Playwright Cục bộ & Sinh Báo cáo Lỗi Tiếng Việt (Priority: P2)

**Goal**: Xây dựng bộ kiểm thử trình duyệt Playwright + `@axe-core/playwright` 100% cục bộ quét đủ 24 màn hình trên `1920×1080`, `1280×720`, `1024×768` và `VP-A11Y 130%`, kiểm tra mạng thuần cục bộ, tiếng Việt, vùng an toàn combat, diff ảnh chụp `<= 0.5%`, vẽ khung đỏ lỗi và sinh báo cáo tiếng Việt `P0–P3`.

**Independent Test**: Chạy `qa:ui-audit` trên bộ dữ liệu mẫu cố định `fixtures/ui-audit-db/`; tiêm 1 lỗi tràn chữ và 1 request URL ngoài để xác nhận harness bắt đủ lỗi, lưu ảnh thật + ảnh `-annotated.png` và xuất báo cáo `UI-BUG-XXX` tiếng Việt hợp lệ.

### Implementation for User Story 4

- [ ] T018 [P] [US4] Configure local Playwright multi-viewport runner enforcing `UiAuditRunConfig.runId`, `UiAuditRunConfig.viewports` (`1920×1080`, `1280×720`, `1024×768`, `1280×720 @ 130%`), `UiAuditRunConfig.fixtureDbPath` (`fixtures/ui-audit-db`), `UiAuditRunConfig.maxPixelDiffRatio` (`0.005`), `UiAuditRunConfig.forbidExternalRequests` (`true`), and `UiAuditRunConfig.combatSafeAreaRect` (`[0.22..0.78] x [0.16..0.82]`) per `data-model.md` in `apps/client/tests/ui-qa/playwright.config.ts` and `apps/client/tests/ui-qa/fixtures/seed-fixture-loader.ts`
- [ ] T019 [P] [US4] Implement automated audit guards: `network-purity.ts` (P0 external request blocker), `combat-safe-area.ts` (P0 HUD overlap detector), and `vietnamese-overflow.ts` (horizontal/vertical diacritic stress string, `data-no-truncate` anti-ellipsis, local `document.fonts.check`, pixel crispness `image-rendering`, and Telex/VNI IME composition test) in `apps/client/tests/ui-qa/guards/`
- [ ] T020 [US4] Implement local PNG red bounding-box annotator (`annotate-screenshot.ts`) and Vietnamese Markdown + JSON bug report generator (`vi-bug-reporter.ts`) enforcing `UiBugReportEntry.bugId`, `UiBugReportEntry.severity`, `UiBugReportEntry.screenId`, `UiBugReportEntry.screenState`, `UiBugReportEntry.viewportLabel`, `UiBugReportEntry.screenshotPath`, `UiBugReportEntry.annotatedScreenshotPath`, `UiBugReportEntry.expectedBehaviorVi`, `UiBugReportEntry.actualBehaviorVi`, and `UiBugReportEntry.reproductionStepsVi` per `data-model.md` (strictly refusing fabricated paths) in `apps/client/tests/ui-qa/reporter/`
- [ ] T021 [US4] Implement full 24-screen Playwright visual regression, `@axe-core/playwright` WCAG AA, and keyboard-only focus-trap suite (`audit-24-screens.spec.ts`) covering every `UiScreenRegistryEntry.requiredStates` matrix entry in `apps/client/tests/ui-qa/audit-24-screens.spec.ts`

**Checkpoint**: 100% local Playwright UI/UX, Visual Regression, and Vietnamese Bug Reporter harness operational.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T022 [P] Add static ESLint/architecture boundary check forbidding React imports inside `apps/client/src/game/` and forbidding `dangerouslySetInnerHTML` across `apps/client/src/ui/` in `apps/client/eslint.config.js`
- [ ] T023 Run full `quickstart.md` validation checklist (when entering `IMPLEMENTATION MODE`), confirming `24/24` screens pass local Playwright multi-viewport checks with `0` external CDN/SaaS requests

---

## Dependencies & Execution Order

- **Phase 1 (Tokens/Fonts/Registry)** → **Phase 2 (Bridge/IME/Preferences)** → blocks Phases 3–6.
- **Phase 3 (Primitives 8 States)** provides reusable building blocks for **Phase 4 (24 Screens)** and **Phase 5 (`SCR-23` Settings & Accessibility)**.
- **Phase 6 (Local Playwright UI QA Harness)** depends on `screen-registry.ts` (Phase 1) and validates all 24 screens produced in Phases 4–5.
