# Data Model: Classic 16-Bit Pixel Fantasy Game UI (24 Screens), Accessibility & Automated UI/UX QA Harness

**Feature**: `012-game-ui-qa`  
**Storage**: Browser `localStorage` + Local Account JSON Sync (`data/db/accounts/<accountId>.json` `preferences`) + Local Static Assets (`assets/fonts/`, `assets/ui/`) + Local QA Audit Artifacts (`artifacts/ui-audit/`, `fixtures/ui-audit-db/*.json`) — Zero External CDN / Zero Third-Party QA SaaS.

---

## 1. `UiPreferencesProfile` (Persisted cục bộ `localStorage` & đồng bộ `data/db/accounts/<accountId>.json`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `UiPreferencesProfile.canvasScaleMode` | `string` | Required; Enum `INTEGER_FIT \| FILL_PIXELATED`; mặc định `INTEGER_FIT` | Chế độ phóng khung pixel gốc `640×360` |
| `UiPreferencesProfile.uiTextScale` | `number` | Required; Enum `1.0 \| 1.15 \| 1.3`; mặc định `1.0` | Hệ số cỡ chữ giao diện React (`--ui-text-scale`) |
| `UiPreferencesProfile.cameraShakePercent` | `integer` | Required; Enum `0 \| 50 \| 100`; mặc định `100` (tự động `0` khi hệ điều hành bật `prefers-reduced-motion`) | Cường độ rung màn hình trong combat và lỗi UI |
| `UiPreferencesProfile.reducedVfxFlash` | `boolean` | Required; mặc định `false` (tự động `true` khi `prefers-reduced-motion`); luôn giữ trần hệ thống `<= 3 Hz` | Công tắc giảm lóe sáng hit-flash/VFX/Gacha |
| `UiPreferencesProfile.colorblindMode` | `object` | Required; `{ alwaysShowRarityLabels: boolean, telegraphPalette: "RED_DEFAULT" \| "BLUE_YELLOW_HIGH_CONTRAST" }` | Tùy chọn trợ năng mù màu toàn hệ thống |
| `UiPreferencesProfile.bossCaptionsEnabled` | `boolean` | Required; mặc định `true` | Bật/tắt Thanh Phụ đề Cảnh báo Boss & Sự kiện |
| `UiPreferencesProfile.audioChannels` | `object` | Required; 5 số nguyên `0..100` cho `{ master, bgm, combatSfx, uiSfx, ambience }` | Tách 5 kênh âm lượng độc lập |
| `UiPreferencesProfile.keyBindings` | `Record<string, string>` | Required; mọi phím trong cùng ngữ cảnh (`WORLD_GAMEPLAY` / `MODAL_OVERLAY`) phải duy nhất (tự phát hiện xung đột & hoán đổi) | Bảng tùy biến phím tắt người chơi |

---

## 2. `UiScreenRegistryEntry` (Danh mục chuẩn cho `24` màn hình `SCR-01`..`SCR-24`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `UiScreenRegistryEntry.screenId` | `string` | Required; khớp `^SCR-(0[1-9]\|1[0-9]\|2[0-4])$`; danh mục phải có đủ chính xác `24` màn hình duy nhất | Mã chuẩn màn hình theo `screen-inventory.md` |
| `UiScreenRegistryEntry.testId` | `string` | Required; khớp `^scr-(0[1-9]\|1[0-9]\|2[0-4])-[a-z0-9-]+$` | Thuộc tính `data-testid` cố định cho Playwright |
| `UiScreenRegistryEntry.layerToken` | `string` | Required; Enum `--z-hud \| --z-modal \| --z-disconnect` | Thứ tự lớp Z-Index chuẩn theo `design-system.md` |
| `UiScreenRegistryEntry.requiredStates` | `string[]` | Required; phần tử thuộc `default \| hover \| active \| focus \| disabled \| loading \| empty \| error \| disconnected` khớp ma trận `ui-testing-strategy.md` | Danh sách trạng thái bắt buộc kiểm thử cho màn hình |
| `UiScreenRegistryEntry.primaryStores` | `string[]` | Required; tối thiểu `1` store thuộc whitelist `useAuthStore \| useHudStore \| useInventoryStore \| useProgressionStore \| useHomesteadStore \| useSocialStore \| useUiModalStore` | Kho Zustand điều khiển màn hình |

---

## 3. `InputFocusStateSnapshot` (Ephemeral Client Runtime trong `InputFocusManager` & `GameUiBridge`)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `InputFocusStateSnapshot.activeLayer` | `string` | Required; Enum `WORLD_GAMEPLAY \| BUILDING_GHOST \| MODAL_OVERLAY \| TEXT_IME_INPUT \| DISCONNECTED_LOCK` | Tầng ưu tiên đầu vào hiện hành |
| `InputFocusStateSnapshot.modalStack` | `string[]` | Required; ngăn xếp LIFO các `screenId` đang mở (đóng lần lượt bằng `ESC`) | Thứ tự quản lý chồng cửa sổ & Focus Trap |
| `InputFocusStateSnapshot.isImeComposing` | `boolean` | Required; phản ánh `compositionstart`/`compositionend` và `event.isComposing \|\| keyCode === 229` | Bảo vệ bộ gõ tiếng Việt Telex/VNI |
| `InputFocusStateSnapshot.hudSyncMaxHz` | `integer` | Required; `<= 10` cho `useHudStore` và `<= 5` cho `MinimapCanvas` (cấm đẩy trạng thái world `60 FPS` vào React) | Trần nhịp đồng bộ cầu nối Phaser → Zustand |

---

## 4. `UiAuditRunConfig` (Cấu hình Bộ Kiểm thử Tự động Playwright Cục bộ)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `UiAuditRunConfig.runId` | `string` | Required; khớp `^uiaudit-\d{8}-\d{6}$` | Mã định danh đợt kiểm toán tự động |
| `UiAuditRunConfig.viewports` | `ViewportProfile[]` | Required; bắt buộc chứa ít nhất `1920x1080` (`VP-FHD`), `1280x720` (`VP-HD`), `1024x768` (`VP-MIN`) và `1280x720 @ 130%` (`VP-A11Y`) | Danh sách cấu hình độ phân giải & trợ năng |
| `UiAuditRunConfig.fixtureDbPath` | `string` | Required; đường dẫn cục bộ an toàn (mặc định `fixtures/ui-audit-db`) chứa dữ liệu JSON cố định & đồng hồ đóng băng | Nguồn dữ liệu xác định chống flaky screenshot |
| `UiAuditRunConfig.maxPixelDiffRatio` | `number` | Required; nằm trong `0.0..0.005` (`<= 0.5%` sai lệch điểm ảnh) | Ngưỡng đạt Visual Regression cục bộ |
| `UiAuditRunConfig.forbidExternalRequests` | `boolean` | Required; luôn là `true`; mọi URL ngoài `localhost`/`127.0.0.1` tự động sinh lỗi `P0` | Cổng bảo vệ Zero Third-Party Services |
| `UiAuditRunConfig.combatSafeAreaRect` | `object` | Required; `{ xMin: 0.22, xMax: 0.78, yMin: 0.16, yMax: 0.82 }`; `0` boundingBox HUD được phép cắt vào | Vùng an toàn đọc Boss Telegraph trên `SCR-05` |

---

## 5. `UiBugReportEntry` (Đầu ra Báo cáo Kiểm toán Tiếng Việt — JSON & Markdown Cục bộ)

| Field (`Entity.field`) | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `UiBugReportEntry.bugId` | `string` | Required; khớp `^UI-BUG-\d{3,}$` | Mã định danh lỗi duy nhất |
| `UiBugReportEntry.severity` | `string` | Required; Enum `P0 \| P1 \| P2 \| P3` khớp `test-strategy.md` & `ui-testing-strategy.md` | Mức độ nghiêm trọng của lỗi UI/UX |
| `UiBugReportEntry.screenId` | `string` | Required; tham chiếu hợp lệ tới `UiScreenRegistryEntry.screenId` | Màn hình xảy ra sự cố |
| `UiBugReportEntry.screenState` | `string` | Required; Enum `default \| hover \| active \| focus \| disabled \| loading \| empty \| error \| disconnected` | Trạng thái kích hoạt sự cố |
| `UiBugReportEntry.viewportLabel` | `string` | Required; ví dụ `"1280x720 @ 130% (VP-A11Y)"` | Độ phân giải & cấu hình cỡ chữ xảy ra lỗi |
| `UiBugReportEntry.screenshotPath` | `string` | Required; đường dẫn `.png` thật tồn tại dưới `artifacts/ui-audit/` (cấm ảnh giả mạo) | Bằng chứng ảnh chụp thực tế từ Playwright |
| `UiBugReportEntry.annotatedScreenshotPath` | `string \| null` | Optional; bắt buộc không `null` với mọi lỗi thị giác (có khung đỏ khoanh vùng phần tử lỗi) | Ảnh khoanh vùng lỗi cho lập trình viên |
| `UiBugReportEntry.expectedBehaviorVi` | `string` | Required; `>= 20` ký tự tiếng Việt chuẩn | Hành vi kỳ vọng theo `design-system.md` / `accessibility.md` |
| `UiBugReportEntry.actualBehaviorVi` | `string` | Required; `>= 20` ký tự tiếng Việt kèm số đo thực tế (`scrollWidth`, contrast ratio...) | Hành vi thực tế quan sát được |
| `UiBugReportEntry.reproductionStepsVi` | `string[]` | Required; tối thiểu `2` bước rõ ràng bằng tiếng Việt | Các bước tái hiện độc lập cho đội phát triển |
