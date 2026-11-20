# Implementation Plan: Classic 16-Bit Pixel Fantasy Game UI (24 Screens), Accessibility & Automated UI/UX QA Harness

**Branch**: `012-game-ui-qa` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-game-ui-qa/spec.md`

## Summary

Triển khai toàn bộ lớp giao diện **Classic 16-bit Pixel Fantasy RPG** cho **24 màn hình bắt buộc (`SCR-01`..`SCR-24`)** trên React 19 + Tailwind CSS + Zustand kết hợp cầu nối tách biệt với Phaser 3, và bộ công cụ kiểm thử tự động UI/UX + Visual Regression + Trợ năng chạy **100% cục bộ**: (1) Design Token System, phông chữ pixel tiếng Việt SIL OFL 1.1 đóng gói tại `assets/fonts/` (0 CDN), 5 khung 9-slice `assets/ui/frames/` và bộ primitives đủ 8 trạng thái + `disconnected`; (2) Cầu nối `GameUiBridge` (`<= 10 Hz` HUD / `<= 5 Hz` Minimap, 0 React re-render theo 60 FPS Phaser) và `InputFocusManager` 5 tầng bảo vệ bộ gõ tiếng Việt IME Telex/VNI; (3) Đầy đủ 24 màn hình RPG đạt chuẩn WCAG 2.1 AA (`>= 4.5:1`), mã hóa 3 lớp chống mù màu, `Camera Shake 0%/50%/100%`, trần chớp sáng `<= 3 Hz`, cỡ chữ `100%/115%/130%`, lưu `UiPreferencesProfile` cục bộ + JSON tài khoản; và (4) Bộ kiểm thử tự động Playwright + `@axe-core/playwright` + Vitest cục bộ đa độ phân giải (`1920×1080`, `1280×720`, `1024×768`, `VP-A11Y 130%`) kèm trình chụp ảnh khoanh khung đỏ và sinh báo cáo lỗi tiếng Việt (`P0–P3`).

## Technical Context

**Language/Version**: TypeScript 5.x (Frontend ESM + Node.js 22 LTS Server Preferences Endpoint & Local QA Runner)

**Primary Dependencies**: React 19, Vite 6, Tailwind CSS, Zustand (`7` domain stores), Phaser 3 (`GameUiBridge` decoupled), Zod, NestJS 11 (`AccountPreferencesController`), Local SIL OFL 1.1 Fonts (`assets/fonts/`), Local 9-Slice Sprites (`assets/ui/frames/`)

**Storage**: Browser `localStorage` + Local Account JSON Sync (`data/db/accounts/<accountId>.json` `preferences` via `JsonDatabaseEngine`) + Local Docker MinIO Assets (`eldoria-assets/v1/`, fallback `/assets/`) + Deterministic QA JSON Fixtures (`fixtures/ui-audit-db/*.json`) + Local Audit Reports (`artifacts/ui-audit/`) — ZERO External CDN / ZERO Percy/Chromatic/Third-Party Cloud Services

**Testing**: Vitest + React Testing Library (8-state primitive coverage, `InputFocusManager` IME & LIFO ESC unit tests, `GameUiBridge` throttle tests), Playwright Test Chromium + `@axe-core/playwright` (24 screens × multi-viewport `1920×1080` / `1280×720` / `1024×768` / `VP-A11Y 130%`, visual diff `<= 0.5%`, network purity `0` external internet requests [chỉ chấp nhận localhost/MinIO nội bộ], Vietnamese diacritic/overflow, **2D pixel zero-seam-bleed & 1,000-transition animation watchdog checks (`013`)**, annotated Vietnamese bug reporter)

**Target Platform**: Desktop Web Browser (`Chrome`, `Edge`, `Firefox` mới nhất, tối thiểu `1024×768`, tham chiếu `1280×720` & `1920×1080`; lộ trình Gamepad M4 & Mobile Touch M5)

**Project Type**: Monorepo Web Game (`apps/client`, `apps/game-server`, `packages/shared`, `assets/`, `fixtures/`)

**Performance Goals**: HUD state sync `<= 10 Hz`, Minimap `<= 5 Hz`, `0` React world-frame re-renders để bảo vệ mục tiêu Phaser `60 FPS` (`proposed / unverified`), modal open transition `120 ms` không blur pixel

**Constraints**: 0 yêu cầu mạng ngoài (no Google Fonts CDN, no cloud visual-regression SaaS); cấm `dangerouslySetInnerHTML`; WCAG 2.1 AA `>= 4.5:1`; trần nháy `<= 3 Hz`; Safe-Area Combat Box `[22%..78%] x [16%..82%]` luôn sạch; `No-Ellipsis Rule` cho giá/tỷ lệ/`+10`/lỗi

**Scale/Scope**: Đủ 24 màn hình (`SCR-01`..`SCR-24`), 7 nhóm UI primitives × 8 trạng thái + `disconnected`, 7 Zustand stores, 5 desktop breakpoints + cấu hình `VP-A11Y`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Nguyên tắc Hiến pháp | Kiểm tra Trước Thiết kế | Kiểm tra Sau Thiết kế (Phase 1) | Ghi chú |
| :--- | :---: | :---: | :--- |
| **I. JSON-Only Primary Persistent DB + Local Docker Redis & MinIO (v2.0.0)** | PASS | PASS | Font & sprite phục vụ từ Local Docker MinIO `eldoria-assets` (fallback `assets/`), Playwright & baseline PNG cục bộ, preferences đồng bộ `accounts/<id>.json`; 0 Google Fonts / Percy / Chromatic / Cloud SaaS |
| **II. Server-Authoritative & Anti-Cheat** | PASS | PASS | UI luôn dùng `X-Idempotency-Key`, khóa double-submit `loading`, không render HTML thô trong Chat, không tin cooldown/giá phía client |
| **III. Data-Driven Single Source of Truth** | PASS | PASS | 24 màn hình đọc trực tiếp catalog `game-data/*.json` (12 anh hùng, 60 kỹ năng, 6 độ hiếm, 9 nguyên tố, 13 công trình, 8 khu vực) |
| **IV. Modular Monolith & Decoupled Simulation** | PASS | PASS | `GameUiBridge` ép `<= 10 Hz` HUD / `<= 5 Hz` Minimap; `apps/client/src/game/` cấm import React |
| **V. Classic 16-Bit Pixel-Perfect Visual Cohesion** | PASS | PASS | 5 khung 9-slice gỗ/đồng/giấy da, `image-rendering: pixelated`, `INTEGER_FIT` `640×360`, Safe-Area Combat Box, `<= 3 Hz` flash cap |
| **VI. Fair Progression & Meaningful Loops** | PASS | PASS | `SCR-11 Gacha` công khai tỷ lệ/Pity (0 nút nạp tiền thật), `SCR-13 Enhancement` rõ `100%` `+0..+10` không vỡ đồ, `SCR-24` rõ không mất đồ |
| **VII. Spec-Driven & Vertical-Slice MVP** | PASS | PASS | Desktop-first MVP trọn bộ 24 màn hình; Gamepad (M4) & Mobile Touch (M5) phân tách lộ trình rõ; giữ `DESIGN_AND_PLANNING_ONLY` |
| **VIII. Verifiable Quality Gates & Evidence Integrity** | PASS | PASS | Playwright chỉ báo lỗi kèm ảnh chụp thật; gắn nhãn `proposed / unverified` cho mục tiêu `60 FPS`; cấm tuyệt đối giả mạo báo cáo |

## Project Structure

### Documentation (this feature)

```text
specs/012-game-ui-qa/
├── spec.md                            # Feature specification + Clarifications
├── plan.md                            # This file
├── research.md                        # Phase 0 research decisions
├── data-model.md                      # Canonical UI preferences, screen registry & QA schemas (33 fields)
├── quickstart.md                      # End-to-end validation guide
├── contracts/
│   └── game-ui-qa-contract.md         # Bridge, Preferences REST, 24-Screen & Local QA Harness contracts
├── checklists/
│   ├── requirements.md                # 16-item spec quality checklist (validated)
│   └── ui-ux-accessibility.md         # 12-item UI/UX & Accessibility review checklist
├── tasks.md                           # Dependency-ordered implementation tasks
└── analysis-report.md                 # Cross-artifact /speckit-analyze audit
```

### Source Code (repository root — Planned Layout for Implementation Phase)

```text
packages/shared/src/
└── contracts/
    └── ui-preferences-contracts.ts    # Zod schema cho UiPreferencesProfile, UiScreenRegistryEntry, UiBugReportEntry

apps/game-server/src/
└── modules/
    └── account/
        └── AccountPreferencesController.ts  # GET/PUT /api/v1/account/preferences -> accounts/<id>.json

apps/client/
├── src/
│   ├── styles/
│   │   ├── fonts.css                  # Local @font-face SIL OFL 1.1 (assets/fonts/*.woff2)
│   │   ├── tokens.css                 # WCAG AA Color, Rarity, Element, Spacing & Z-Index tokens
│   │   └── nine-slice.css             # 5 pixel 9-slice border-image frames & focus-visible rings
│   ├── bridge/
│   │   ├── GameUiBridge.ts            # Throttled <=10Hz HUD / <=5Hz Minimap typed bridge
│   │   └── InputFocusManager.ts       # 5-tier priority stack + Vietnamese IME guard + LIFO ESC
│   ├── stores/
│   │   ├── useUiModalStore.ts         # Modal stack, preferences, toasts, boss captions
│   │   └── useHudStore.ts             # Throttled HUD & Minimap store
│   └── ui/
│       ├── screen-registry.ts         # Canonical 24-screen registry (SCR-01..SCR-24)
│       ├── primitives/
│       │   ├── PixelButton.tsx        # 6 variants x 8 states + tabular/diacritic guards
│       │   ├── ItemSlot.tsx           # Rarity triple-coding + Element silhouette + 8 states
│       │   ├── StatBar.tsx            # Delayed damage trail + 8 states
│       │   ├── PixelTooltip.tsx       # Equipment diff ▲/▼ + auto-flip + 8 states
│       │   ├── PixelModal.tsx         # 9-slice dialog + Focus Trap + ARIA + 8 states
│       │   ├── PixelToast.tsx         # Toast stack + ReconnectBanner (--z-disconnect)
│       │   └── PixelFormControls.tsx  # PixelInput (IME-safe), PixelSelect, PixelToggle
│       ├── screens/                   # SCR-01..SCR-04, SCR-24
│       ├── hud/                       # SCR-05 MainGameHud, SCR-18 Minimap, BossCaptionBar
│       └── modals/                    # SCR-06..SCR-17, SCR-19..SCR-23
└── tests/
    ├── unit/
    │   ├── primitives-states.spec.tsx # Vitest + RTL 8-state verification
    │   └── bridge-and-ime.spec.ts     # GameUiBridge <=10Hz & Telex/VNI IME guard tests
    └── ui-qa/
        ├── playwright.config.ts       # Local Chromium viewports (1920x1080, 1280x720, 1024x768, VP-A11Y)
        ├── fixtures/
        │   └── seed-fixture-loader.ts # Deterministic fixtures/ui-audit-db/*.json loader
        ├── guards/
        │   ├── network-purity.ts      # Forbids any non-localhost request (P0)
        │   ├── vietnamese-overflow.ts # Diacritics, scrollWidth, No-Ellipsis, local font, IME checks
        │   └── combat-safe-area.ts    # Verifies [22%..78%] x [16%..82%] unobstructed
        ├── reporter/
        │   ├── annotate-screenshot.ts # Local PNG red bounding-box annotator
        │   └── vi-bug-reporter.ts     # Generates P0-P3 Vietnamese Markdown + JSON report
        └── audit-24-screens.spec.ts   # Full 24-screen visual regression + axe-core + keyboard suite
```

**Structure Decision**: Tổ chức lớp UI tập trung tại `apps/client/src/ui/` với 1 nguồn token CSS cục bộ, bộ primitives 8 trạng thái, danh mục 24 màn hình có kiểm chứng, endpoint đồng bộ tùy chọn gọn nhẹ tại `apps/game-server/src/modules/account/` và bộ Playwright QA 100% cục bộ tại `apps/client/tests/ui-qa/`.

## Complexity Tracking

*Không có vi phạm Hiến pháp nào cần giải trình ngoại lệ.*
