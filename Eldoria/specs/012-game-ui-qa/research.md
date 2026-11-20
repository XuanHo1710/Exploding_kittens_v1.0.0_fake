# Phase 0 Research: Classic 16-Bit Pixel Fantasy Game UI (24 Screens), Accessibility & Automated UI/UX QA Harness

**Feature**: `012-game-ui-qa`  
**Date**: 2026-11-19

---

## 1. Kiến trúc Phông chữ Pixel Tiếng Việt 100% Cục bộ (Zero CDN)

- **Decision**: Đóng gói trực tiếp các tệp `.woff2` theo giấy phép mở **SIL OFL 1.1** trong `assets/fonts/` phục vụ từ máy chủ tĩnh nội bộ: `Press Start 2P` + fallback tiếng Việt `Pixelify Sans Bold` (`--font-pixel-display`), `Silkscreen` + `Pixelify Sans Medium` (`--font-pixel-ui`), và `Fusion Pixel 12px Proportional` + `Pixelify Sans Regular` (`--font-pixel-body`). Nạp qua `@font-face` nội bộ kèm `font-display: swap`, `font-variant-numeric: tabular-nums`, `line-height >= 1.45` (thân bài) / `>= 1.35` (tiêu đề) và `padding-block >= 6px`.
- **Rationale**: Đáp ứng tuyệt đối Nguyên tắc I (0 Google Fonts CDN), hiển thị rõ dấu kép tiếng Việt (`Ắ, Ằ, Ẳ, Ẵ, Ặ, Ế, Ệ, Ổ, Ộ, Ử, Ữ`) ở kích thước nhỏ `12px–18px` mà không dính nét hay mất dấu.
- **Alternatives considered (Rejected)**: Nhúng Google Fonts CDN (vi phạm tuyệt đối Nguyên tắc I); chỉ dùng `Press Start 2P` (thiếu bộ dấu tiếng Việt gây vỡ ký tự tofu).

## 2. Cầu nối Tách biệt Phaser 3 (60 FPS) ↔ React/Zustand (`<= 10 Hz`) & Bảo vệ IME Tiếng Việt

- **Decision**: Giữ toàn bộ trạng thái chuyển động/tọa độ/hoạt ảnh 60 FPS trong `WorldStateBuffer` thuần TypeScript bên trong Phaser 3 (CẤM import React trong `apps/client/src/game/`). `GameUiBridge` sử dụng bộ đệm throttle + shallow-equality diff đẩy cập nhật vào `useHudStore` tối đa **`10 Hz`** (và `MinimapCanvas` tối đa **`5 Hz`**), chỉ bắn khi số HP/MP/Stamina/Cooldown thực sự đổi. Toàn bộ phím/chuột đi qua `InputFocusManager` 5 tầng (`WORLD_GAMEPLAY`, `BUILDING_GHOST`, `MODAL_OVERLAY`, `TEXT_IME_INPUT`, `DISCONNECTED_LOCK`) kiểm tra `event.isComposing || event.keyCode === 229` để chặn phím tắt khi gõ Telex/VNI và tự phát `MOVE_INPUT (dx:0, dy:0)` khi mở modal.
- **Rationale**: Tuân thủ nghiêm ngặt Nguyên tắc IV (tránh React re-render 60 FPS gây tụt khung hình), đồng thời triệt tiêu lỗi kinh điển của game web tại Việt Nam khi gõ dấu `s/f/r/x/j` kích hoạt nhầm kỹ năng.
- **Alternatives considered**: Đẩy `WORLD_SNAPSHOT` trực tiếp vào React Context/Zustand mỗi frame (gây sụt FPS nặng khi raid Boss 4 người); vẽ toàn bộ 24 màn hình RPG bên trong Canvas Phaser (kém hỗ trợ IME tiếng Việt, screen-reader ARIA, focus trap và responsive).

## 3. Khung 9-Slice Pixel 16-Bit & Mã hóa Kép Chống Mù màu (WCAG 2.1 AA)

- **Decision**: Sử dụng 5 tấm khung 9-slice pixel vẽ tay cục bộ trong `assets/ui/frames/` (`ui_frame_wood_9s.png`, `ui_frame_parchment_9s.png`, `ui_frame_gold_ornate_9s.png`, `ui_frame_stone_dark_9s.png`, `ui_frame_boss_bar_9s.png`) áp dụng CSS `border-image` kèm `image-rendering: pixelated`. Bắt buộc áp dụng mã hóa 3 lớp cho `6` độ hiếm (màu + họa tiết góc + mã chữ/sao `C★..M★★★★★★`), `9` hình bóng nguyên tố độc nhất, bọc pill nền tối `#1B1624` khi đặt badge sáng lên giấy da `#F3E6CC`, và giới hạn cứng mọi hiệu ứng nhấp nháy `<= 3 Hz` (`Camera Shake 0%/50%/100%`, tự đọc `prefers-reduced-motion`).
- **Rationale**: Loại bỏ hoàn toàn diện mạo Corporate SaaS Dashboard, đảm bảo mọi cặp màu đạt `>= 4.5:1` (nhiều cặp đạt AAA `> 9:1`) và bảo vệ người chơi mù màu hoặc nhạy cảm ánh sáng (Nguyên tắc V).
- **Alternatives considered**: Dùng thẻ CSS phẳng bo góc mềm Tailwind mặc định (sai bản sắc 16-bit Pixel Fantasy); phân biệt độ hiếm/telegraph chỉ bằng màu sắc đơn lẻ (vi phạm WCAG 1.4.1).

## 4. Bộ Kiểm toán Tự động Playwright + `axe-core` 100% Cục bộ (Zero Cloud Visual SaaS)

- **Decision**: Xây dựng harness kiểm thử tự động hoàn toàn cục bộ trong `apps/client/tests/ui-qa/` sử dụng **Playwright Test (Chromium cục bộ)** + **`@axe-core/playwright` (npm cục bộ)** + **Vitest / React Testing Library**. Nạp cơ sở dữ liệu mẫu xác định `fixtures/ui-audit-db/*.json` (đồng hồ đóng băng), tắt animation khi đối chiếu layout tĩnh (`animations: 'disabled'`), sử dụng `toHaveScreenshot({ maxDiffPixelRatio: 0.005 })` lưu baseline PNG ngay trong repo, chặn & báo lỗi `P0` mọi request tới tên miền ngoài `localhost`, và dùng trình tạo báo cáo Node.js vẽ bounding-box đỏ (Canvas/PNG nội bộ) xuất báo cáo tiếng Việt chuẩn `UI-BUG-XXX` (`P0..P3`).
- **Rationale**: Tuân thủ 100% Nguyên tắc I (Zero Third-Party Services) và Nguyên tắc VIII (bằng chứng ảnh chụp thực tế, không giả mạo).
- **Alternatives considered (Rejected)**: **Percy, Chromatic, Applitools, BrowserStack** (bị từ chối tuyệt đối theo Nguyên tắc I vì là dịch vụ đám mây bên thứ ba có phí và đẩy dữ liệu ra ngoài).
