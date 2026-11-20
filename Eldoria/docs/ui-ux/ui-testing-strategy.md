# UI/UX Testing & Visual Regression Strategy — Eldoria: Forgotten Wilds

**Trạng thái**: Design Baseline v1.0 (`DESIGN_AND_PLANNING_ONLY` — Chưa chạy production Playwright suite)  
**Cập nhật lần cuối**: 2026-11-19  
**Tham chiếu**: [Constitution Nguyên tắc I, V & VIII](../../.specify/memory/constitution.md), [test-strategy.md](../testing/test-strategy.md), [screen-inventory.md](./screen-inventory.md), [responsive-design.md](./responsive-design.md), [accessibility.md](./accessibility.md)

---

## 1. Cam kết Trung thực Bằng chứng Kiểm thử (Evidence Integrity Policy)

> **TUYÊN BỐ BẮT BUỘC (Constitution Nguyên tắc VIII)**:  
> Dự án đang ở chế độ **`DESIGN_AND_PLANNING_ONLY`**. Không một bộ test Playwright production nào được đánh dấu `PASSED` trong tài liệu này. Toàn bộ chính sách chụp ảnh, ma trận kiểm tra 24 màn hình và kịch bản kiểm toán dưới đây là **chuẩn nghiệm thu bắt buộc** cho:
> 1. Các mockup HTML tĩnh/tương tác trong `docs/ui-ux/mockups/` (nếu chạy kiểm toán trình duyệt thực tế cục bộ).
> 2. Bản dựng Frontend React + Phaser 3 (`apps/client`) khi dự án chuyển sang `IMPLEMENTATION MODE`.
>
> **CẤM TUYỆT ĐỐI** giả mạo ảnh chụp màn hình, bịa đặt kết quả diff pixel hay kết luận `PASS` cho màn hình chưa từng được render thật trên trình duyệt cục bộ.

---

## 2. Kiến trúc Kiểm thử UI 100% Cục bộ (Zero Third-Party Testing Stack)

Phù hợp **Nguyên tắc I Hiến pháp (Zero Third-Party Services)**, toàn bộ quy trình kiểm thử giao diện, chụp ảnh đối chiếu (Visual Regression) và kiểm toán trợ năng chạy **100% cục bộ** — **KHÔNG** dùng dịch vụ đám mây bên thứ ba (từ chối Percy, Chromatic, BrowserStack hay Applitools):

| Lớp Kiểm thử UI | Công cụ Cục bộ (Open-Source) | Mục tiêu Xác minh | Ngưỡng Đạt (Gate) |
| :--- | :--- | :--- | :--- |
| **Component Unit / State** | Vitest + React Testing Library | Kiểm tra đủ 8 trạng thái (`default`, `hover`, `active`, `focus`, `disabled`, `loading`, `empty`, `error`) của toàn bộ primitives (`PixelButton`, `ItemSlot`, `StatBar`, `PixelModal`...) | 100% PASS |
| **Visual Regression** | **Playwright Test** (`toHaveScreenshot()` cục bộ, lưu baseline PNG trong repo test) | Phát hiện lệch khung 9-slice, vỡ lưới pixel, lệch HUD che tâm combat, thay đổi màu không mong muốn | Diff pixel `<= 0.5%` cho Modal/HUD; `0%` sai lệch trên khung tiêu đề & số tiền |
| **Responsive & Overflow** | Playwright Multi-Viewport Script | Kiểm tra 5 viewport desktop × 2 cỡ chữ (`100%`, `130%`), đo tràn ngang/dọc văn bản tiếng Việt | `0` phần tử bị tràn `scrollWidth > clientWidth` hoặc che khuất |
| **Accessibility Audit** | Playwright + `axe-core` (npm cục bộ) + Keyboard-Only Walker | Kiểm tra WCAG 2.1 AA contrast, ARIA roles, Focus Trap, vòng focus `#FBBF24`, không kẹt bàn phím | `0` lỗi `critical`/`serious` từ `axe-core` |
| **Network & Asset Purity** | Playwright Request Interceptor | Xác minh `0` request đi tới tên miền bên thứ ba (không Google Fonts CDN, không CDN icon/ảnh ngoài) | `0` external network requests |

---

## 3. Ma trận Viewport & Cấu hình Kiểm toán (Playwright Audit Matrix)

Mọi đợt kiểm toán UI/UX trước Milestone Release PHẢI chạy Playwright Chromium cục bộ trên đủ tổ hợp sau:

| ID Cấu hình | Độ phân giải Viewport | Tỷ lệ Cỡ Chữ (`--ui-text-scale`) | Chế độ Scale Phaser | Cấu hình Trợ năng Kiểm tra | Vai trò Trong CI |
| :---: | :---: | :---: | :---: | :--- | :---: |
| **`VP-FHD`** | `1920×1080` | `100%` | `INTEGER_FIT (3×)` | Mặc định | Bắt buộc mọi PR UI |
| **`VP-WXGA`** | `1440×900` | `100%` | `INTEGER_FIT (2×)` | Mặc định (kiểm tra HUD trên viền letterbox) | Release Candidate |
| **`VP-LAP`** | `1366×768` | `100%` | `INTEGER_FIT (2×)` | Mặc định (laptop phổ biến nhất) | Bắt buộc mọi PR UI |
| **`VP-HD`** | `1280×720` | `100%` | `INTEGER_FIT (2×)` | Mặc định + Kiểm tra Safe-Area Combat `>= 70%` | Bắt buộc mọi PR UI |
| **`VP-MIN`** | `1024×768` | `100%` | `FILL_PIXELATED` (Compact HUD) | Kiểm tra Reflow lưới Inventory 6 cột & Party 2×2 | Bắt buộc mọi PR UI |
| **`VP-A11Y`** | `1280×720` | **`130%` (Lớn)** | `INTEGER_FIT (2×)` | `Reduced VFX Flash = ON`, `Camera Shake = 0%`, `Colorblind Badges = ON` | Bắt buộc mọi PR UI |

---

## 4. Chính sách Chụp ảnh & Kiểm tra Độ Sắc nét Pixel (Screenshot Capture Policy)

1. **Dữ liệu Seed Xác định (Deterministic Fixture State)**:
   - Trước khi chụp ảnh kiểm thử, nạp bản sao tệp JSON fixture cố định (`fixtures/ui-audit-db/*.json`) với đồng hồ đóng băng (`2026-11-19T14:20:00Z`, Mùa Xuân Ngày 4, `1420 Gold`, `960 STARLIGHT_SHARD`, vũ khí `wpn_iron_longsword +3`, `bld_blacksmith Lv.2`) để ảnh chụp luôn lặp lại chính xác 100%.
2. **Đóng băng Hoạt ảnh Chống Flaky Test**:
   - Playwright chạy với tùy chọn `animations: 'disabled'` khi chụp ảnh đối chiếu bố cục tĩnh, và có bài test riêng đo khung hình thực tế cho hoạt ảnh cooldown/hit-flash để đảm bảo tần suất nháy `<= 3 flashes/s`.
3. **Kiểm tra Tự động `image-rendering: pixelated` & Chống Mờ Sprite**:
   - Script kiểm tra computed CSS của `<canvas>` và toàn bộ `img[data-pixel-asset="true"]` phải có `imageRendering === 'pixelated' || 'crisp-edges'`, kích thước render là bội số chẵn của kích thước gốc khi ở `INTEGER_FIT`.
4. **Kiểm tra Tự động An toàn Vùng Combat (`Boss Telegraph Visibility Check`)**:
   - Trên `SCR-05 Main Game HUD` tại `1280×720` và `1920×1080`, script Playwright lấy `boundingBox()` của toàn bộ widget HUD (Unit Frame, Party, Boss Bar, Minimap, Quest Tracker, Chat, Hotbar, Menu) và xác minh **KHÔNG có widget nào cắt vào hình chữ nhật trung tâm** `[22%..78% width] × [16%..82% height]`.
5. **Quy ước Lưu trữ Ảnh Thực tế**:
   - Ảnh chụp thật lưu tại `artifacts/ui-audit/<YYYY-MM-DD>/<viewport>/<screenId>-<state>.png`.
   - Khi phát hiện lỗi thị giác, công cụ kiểm toán lưu kèm ảnh chú thích khoanh khung đỏ (`<screenId>-<state>-annotated.png`) để đính kèm vào báo cáo lỗi tiếng Việt.

---

## 5. Bộ Kiểm tra Chuyên sâu Tiếng Việt (Vietnamese Diacritic & Overflow Checks)

Chạy tự động trên mọi màn hình và đặc biệt khắt khe ở cấu hình `VP-A11Y` (`1280×720`, cỡ chữ `130%`):

1. **Kiểm tra Tràn Ngang & Cắt Xén (Horizontal Overflow & Forbidden Ellipsis)**:
   - Duyệt toàn bộ phần tử văn bản bên trong `.pixel-modal`, `.pixel-hud`, `.pixel-btn`, `.pixel-tab`: xác minh `el.scrollWidth <= el.clientWidth + 1`.
   - Với các phần tử mang thuộc tính `data-no-truncate="true"` (giá Gold, `STARLIGHT_SHARD`, tỷ lệ Gacha `%`, mức `+10`, mã lỗi `ERR_*`, số nguyên liệu `5/4`): xác minh `textOverflow !== 'ellipsis'` và toàn bộ chuỗi hiển thị nguyên vẹn trong viewport.
2. **Kiểm tra Cắt Dấu Kép Tiếng Việt (Vertical Diacritic Clipping Check)**:
   - Bơm chuỗi kiểm tra áp lực (stress string): `"Cường Hóa Đỉnh Phong — Ắ Ằ Ẳ Ẵ Ặ Ế Ệ Ổ Ộ Ử Ữ Đ"` vào tiêu đề, nút, tab và ô hội thoại NPC.
   - Kiểm tra `computedStyle.lineHeight / fontSize >= 1.35` (tiêu đề/nút) và `>= 1.45` (thân bài), đồng thời xác minh `el.scrollHeight <= el.clientHeight + 1` trên mọi phần tử đặt `overflow: hidden`.
3. **Kiểm tra Nạp Font Cục bộ & Không Vỡ Ký tự (Zero Tofu Check)**:
   - Xác minh `document.fonts.check('14px "Fusion Pixel 12px"')` hoặc `'14px "Pixelify Sans"'` trả về `true` từ nguồn cục bộ `/assets/fonts/*.woff2` (không có lỗi HTTP 404 và không có request ngoài localhost).
4. **Kiểm tra Bộ gõ IME Tiếng Việt (`compositionstart` / `compositionend`)**:
   - Giả lập sự kiện `compositionstart` → gõ `s, f, r, j, i, b, g` → `compositionend` bên trong ô Chat (`SCR-05`) và ô Tìm kiếm Túi đồ (`SCR-06`) → xác minh `0` lệnh tấn công/kỹ năng/mở modal bị kích hoạt nhầm.

---

## 6. Ma trận Kiểm chứng 24 Màn hình × 8 Trạng thái (`SCR-01` → `SCR-24`)

Mỗi màn hình gắn 1 gốc `data-testid="scr-XX-..."` và phải vượt qua đủ ma trận trạng thái tương ứng trong Playwright (`✓` = Bắt buộc kiểm thử & chụp ảnh, `N/A` = Không tồn tại về mặt nghiệp vụ):

| Mã | Tên Màn hình (`data-testid`) | `default` | `hover` | `active` | `focus` | `disabled` | `loading` | `empty` | `error` | `disconnected` | Trọng tâm Kiểm tra Đặc thù |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `SCR-01` | Login & Register (`scr-01-auth`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Kiểm tra `ERR_INVALID_CREDENTIALS`, hiện/ẩn mật khẩu, không có nút OAuth ngoài |
| `SCR-02` | Character Selection (`scr-02-char-select`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Trạng thái 0 nhân vật vs 4/4 nhân vật, preview sprite 48x64 sắc cạnh |
| `SCR-03` | Starter Selection (`scr-03-char-create`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Chuyển 3 Starter Hero MVP, nhập tên tiếng Việt có dấu, nút khóa khi trống tên |
| `SCR-04` | Loading Screen (`scr-04-loading`) | ✓ | N/A | N/A | ✓ | N/A | ✓ | ✓ | ✓ | ✓ | Tiến độ 0–100%, nút thoát an toàn sau timeout 15s |
| `SCR-05` | Main Game HUD (`scr-05-hud`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Vùng combat trung tâm trống `>= 68%`, Boss Bar không đè tâm, Reconnect Banner gọn |
| `SCR-06` | Inventory (`scr-06-inventory`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Kéo-thả chuột & bàn phím, tách stack, lọc 6 tab, reflow 8→6 cột ở `1024×768` |
| `SCR-07` | Equipment (`scr-07-equipment`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Đủ 10 slot, hiển thị Set Bonus `2/4` & `4/4`, cảnh báo độ bền `< 20%` |
| `SCR-08` | Character Stats (`scr-08-stats`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Xem trước chỉ số phái sinh khi tăng STR/VIT, hiển thị đủ 9 kháng nguyên tố |
| `SCR-09` | Skill Tree (`scr-09-skills`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Đủ 5 kỹ năng của Hero, khóa cấp `unlockLevel`, so sánh bậc hiện tại → bậc kế |
| `SCR-10` | Character Collection (`scr-10-collection`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 12 Hero (3 mở, 9 silhouette), khóa đổi Hero khi đang trong combat |
| `SCR-11` | Gacha (`scr-11-gacha`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Hiện công khai tỷ lệ `%`, Pity `X/80`, 0 nút nạp tiền thật, chống click đúp khi quay |
| `SCR-12` | Blacksmith (`scr-12-blacksmith`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Hiển thị cấp `bld_blacksmith`, đủ 4 tab (Rèn/Cường hóa/Sửa/Tách) |
| `SCR-13` | Weapon Enhancement (`scr-13-enhance`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Xem trước `+0 → +10`, dòng `100% Không vỡ đồ`, chặn cấp Lò Rèn, huy hiệu `+10` |
| `SCR-14` | Crafting (`scr-14-crafting`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Lọc đủ NL, bộ chọn số lượng `1..Max`, khóa nút khi xem từ xa không đứng tại trạm |
| `SCR-15` | Building (`scr-15-building`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Ghost Preview xanh `✓` / đỏ crosshatch `✕`, xoay phím `R`, lỗi `ERR_PLACEMENT_COLLISION` |
| `SCR-16` | Farming (`scr-16-farming`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Mùa vụ & cảnh báo trái mùa, tóm tắt Offline 24h, trạng thái vật nuôi |
| `SCR-17` | World Map (`scr-17-world-map`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 8 khu vực + Fog of War, vị trí Party, chặn Fast Travel khi đang combat |
| `SCR-18` | Minimap (`scr-18-minimap`) | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | ✓ | ✓ | ✓ | Phóng 2 mức, đồng hồ ngày/mùa/thời tiết rõ, chấm đỏ khi mất kết nối |
| `SCR-19` | Quest Journal (`scr-19-quests`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Sổ 2 trang giấy da (tương phản mực nâu `>= 8.78:1`), ghim tối đa 3 nhiệm vụ |
| `SCR-20` | NPC Dialogue (`scr-20-dialogue`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Chân dung `96×96` pixel sắc cạnh, phím `1..4` & `F` bỏ qua typewriter |
| `SCR-21` | Party (`scr-21-party`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 4 thẻ thành viên (reflow 2×2 ở `1024×768`), Ready Check 15s vào Dungeon |
| `SCR-22` | Boss Reward (`scr-22-boss-reward`) | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | ✓ | ✓ | ✓ | Loot cá nhân hóa, thông báo chuyển vào Rương khi túi đầy, nút Về làng |
| `SCR-23` | Settings (`scr-23-settings`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | ✓ | Live text scale `100/115/130%`, Camera Shake `0/50/100%`, Remap phát hiện trùng phím |
| `SCR-24` | Death & Respawn (`scr-24-death`) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Khóa nút `1.5s` chống bấm nhầm, ghi rõ *"Bảo toàn 100% trang bị"*, nút Quan sát |

---

## 7. Phân loại Mức độ Nghiêm trọng & Mẫu Báo cáo Lỗi UI/UX (Tiếng Việt)

### 7.1 Bảng Phân loại Lỗi `P0 – P3` (Đồng bộ `test-strategy.md`)
- **`P0 — Blocker (Chặn phát hành / Vi phạm Hiến pháp)`**: Treo màn hình, mất dữ liệu hiển thị, không bấm được nút hành động chính, HUD/VFX che khuất Boss Telegraph, lỗi nhấp nháy vượt quá `3 flashes/s`, phát hiện tài nguyên tải từ CDN bên thứ ba, lỗi XSS trong khung Chat.
- **`P1 — Critical (Nghiêm trọng)`**: Tràn chữ hoặc lệch nút ở `1280×720` hoặc `1024×768`, bị cắt mất thông tin tỷ lệ Gacha / chi phí cường hóa / điều kiện cấp Lò Rèn, tương phản WCAG AA `< 4.5:1`, kẹt Focus Trap bàn phím, không hỗ trợ gõ tiếng Việt IME (gõ dấu nhảy kỹ năng).
- **`P2 — Major (Trung bình)`**: Mất dấu phụ tiếng Việt nhẹ ở cỡ chữ `130%`, thiếu trạng thái `empty` / `loading`, tooltip bị khuất một phần cạnh màn hình, lệch căn lưới pixel `1–2px`.
- **`P3 — Minor (Nhẹ)`**: Tinh chỉnh khoảng cách đệm, thứ tự tab chưa tối ưu, sắc độ màu phụ chưa đồng đều.

### 7.2 Mẫu Báo cáo Kiểm toán Lỗi UI/UX Chuẩn (Vietnamese Bug Report Template)

Mọi lỗi phát hiện trong quá trình kiểm toán trình duyệt Playwright PHẢI được ghi nhận theo đúng mẫu sau:

```markdown
### [UI-BUG-XXX] <Tiêu đề ngắn gọn mô tả lỗi bằng tiếng Việt>

- **Mức độ nghiêm trọng**: `P0` | `P1` | `P2` | `P3`
- **Màn hình ảnh hưởng**: `SCR-XX` (`<Tên màn hình>`) — Trạng thái: `<default|loading|empty|error|disconnected|focus>`
- **Viewport & Cấu hình**: `<1920x1080 | 1440x900 | 1366x768 | 1280x720 | 1024x768>` | Text Scale: `<100% | 130%>` | Trợ năng: `<Mặc định / Reduced Flash / Colorblind>`
- **Trình duyệt & Bản dựng**: Chromium `<version>` (Local Playwright) | Commit/Mockup: `<path hoặc hash>`
- **Bằng chứng Ảnh chụp Thực tế**:
  - Ảnh gốc: `artifacts/ui-audit/<date>/<viewport>/<file>.png`
  - Ảnh khoanh vùng lỗi: `artifacts/ui-audit/<date>/<viewport>/<file>-annotated.png` *(Không được để trống nếu là lỗi thị giác)*

#### Bước tái hiện (Steps to Reproduce)
1. Mở `<màn hình / route>` với bộ dữ liệu fixture `<tên fixture>`.
2. Thiết lập viewport `<WxH>` và cỡ chữ `<100% / 130%>`.
3. Thực hiện thao tác `<click / gõ tiếng Việt / đổi tab / giả lập rớt mạng>`.

#### Hành vi Kỳ vọng (Expected Behavior)
- Mô tả chính xác hành vi chuẩn theo `design-system.md`, `screen-inventory.md`, `responsive-design.md` hoặc `accessibility.md`.

#### Hành vi Thực tế (Actual Behavior)
- Mô tả khách quan sự cố quan sát được kèm giá trị đo thực tế (vd: `scrollWidth = 342px > clientWidth = 280px`, tỷ lệ tương phản đo được `3.12:1 < 4.5:1`).

#### Tác động Quality Gate & Đề xuất Khắc phục
- **Quality Gate vi phạm**: `<Số thứ tự tiêu chí trong 14 Quality Gates / WCAG 2.1 AA / Constitution Principle>`.
- **Hướng xử lý đề xuất**: `<Thay đổi CSS token / reflow grid / sửa InputFocusManager cụ thể>`.
```
