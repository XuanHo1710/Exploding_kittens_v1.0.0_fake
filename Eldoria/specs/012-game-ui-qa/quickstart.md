# Quickstart Validation Guide: Classic 16-Bit Pixel Fantasy Game UI (24 Screens), Accessibility & Automated UI/UX QA Harness

**Feature**: `012-game-ui-qa`  
**Mode Note**: Hướng dẫn kiểm chứng dành cho giai đoạn triển khai (`IMPLEMENTATION MODE`). Trong giai đoạn `DESIGN_AND_PLANNING_ONLY`, không một bộ test Playwright production nào được đánh dấu `PASSED` và tuyệt đối không tạo ảnh chụp giả mạo (Nguyên tắc VIII).

---

## 1. Prerequisites
- Node.js 22 LTS + Playwright Chromium cài cục bộ (`npx playwright install chromium`) — **KHÔNG** dùng Percy, Chromatic, BrowserStack, Google Fonts CDN hay dịch vụ bên thứ ba.
- Bộ phông pixel tiếng Việt SIL OFL 1.1 đóng gói cục bộ trong `assets/fonts/` và bộ khung 9-slice trong `assets/ui/frames/`.
- Bộ dữ liệu JSON fixture xác định trong `fixtures/ui-audit-db/` (đồng hồ đóng băng `2026-11-19T14:20:00Z`).

---

## 2. End-to-End Validation Scenarios (Khi đã Triển khai)

1. **Kiểm chứng 24 Màn hình & Mỹ thuật 16-Bit (Zero External Network)**:
   - Khởi chạy `apps/game-server` với `DATA_DB_DIR=./fixtures/ui-audit-db` và `apps/client` cục bộ.
   - Chạy Playwright request interceptor duyệt qua đủ 24 màn hình (`SCR-01`..`SCR-24`).
   - Kỳ vọng: `0` HTTP request tới tên miền bên ngoài, đủ `24/24` `data-testid`, 5 khung 9-slice + font pixel cục bộ hiển thị sắc nét (`image-rendering: pixelated`), không có nút nạp tiền thật trên `SCR-11 Gacha`, `SCR-13 Enhancement` hiển thị rõ `+0..+10` `100%` không vỡ đồ, `SCR-21 Party` dùng đếm ngược `30s` theo server.
2. **Kiểm chứng Vùng An toàn Chiến đấu & Cầu nối Tách biệt Phaser ↔ Zustand**:
   - Mở `SCR-05 Main Game HUD` ở `1920×1080`, `1280×720` và `1024×768` với Boss Bar + Party + Quest Tracker + Chat đang bật.
   - Kỳ vọng: `0` widget cắt vào vùng trung tâm `[22%..78%] x [16%..82%]`; React Profiler xác nhận `0` lần re-render toàn cây UI ở nhịp `60 FPS` của Phaser (`useHudStore <= 10 Hz`, `MinimapCanvas <= 5 Hz`).
3. **Kiểm chứng Trợ năng WCAG 2.1 AA, Mù màu, Ánh sáng & Bộ gõ Tiếng Việt IME**:
   - Bật `VP-A11Y` (`1280×720`, Text Scale `130%`, `Camera Shake = 0%`, `Reduced VFX Flash = ON`, `Colorblind Badges = ON`, `Boss Captions = ON`).
   - Chạy `@axe-core/playwright` (`0` critical/serious), kiểm tra bơm chuỗi áp lực `"Cường Hóa Đỉnh Phong — Ắ Ằ Ẳ Ẵ Ặ Ế Ệ Ổ Ộ Ử Ữ Đ"` (`0` tràn ngang, `0` cắt dấu), kiểm tra mô phỏng Telex IME `compositionstart -> s/f/r/j/i/b/g -> compositionend` (`0` kỹ năng/modal kích hoạt nhầm), và kiểm tra duyệt bàn phím thuần không kẹt Focus Trap.
4. **Kiểm chứng Ma trận 8 Trạng thái + `disconnected`**:
   - Chạy Vitest + React Testing Library cho toàn bộ primitives (`PixelButton`, `ItemSlot`, `StatBar`, `PixelTooltip`, `PixelModal`, `PixelToast`, `PixelInput`) và Playwright kiểm tra `loading` (khóa double-submit Gacha/Enhance), `empty`, `error` và `disconnected` trên cả 24 màn hình.
5. **Kiểm chứng Visual Regression & Trình Sinh Báo cáo Lỗi Tiếng Việt**:
   - Chạy `npm run qa:ui-audit` trên 3 độ phân giải bắt buộc (`1920×1080`, `1280×720`, `1024×768`) + `VP-A11Y`.
   - Thử tiêm 1 lỗi tràn chữ cố ý ở `1024×768` → xác nhận harness tự chụp ảnh gốc + ảnh khung đỏ `-annotated.png` trong `artifacts/ui-audit/` và sinh đúng báo cáo tiếng Việt `UI-BUG-001` đủ mức `P1`, Expected/Actual Behavior và bước tái hiện.

---

## 3. Tham chiếu
- Hệ thống Thiết kế UI: [`docs/ui-ux/design-system.md`](../../docs/ui-ux/design-system.md)
- Danh mục 24 Màn hình: [`docs/ui-ux/screen-inventory.md`](../../docs/ui-ux/screen-inventory.md)
- Thiết kế Tương tác & Responsive & Trợ năng: [`docs/ui-ux/interaction-design.md`](../../docs/ui-ux/interaction-design.md), [`docs/ui-ux/responsive-design.md`](../../docs/ui-ux/responsive-design.md), [`docs/ui-ux/accessibility.md`](../../docs/ui-ux/accessibility.md)
- Chiến lược Kiểm thử UI: [`docs/ui-ux/ui-testing-strategy.md`](../../docs/ui-ux/ui-testing-strategy.md), [`docs/testing/test-strategy.md`](../../docs/testing/test-strategy.md)
