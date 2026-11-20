# Acceptance Criteria — Eldoria: Forgotten Wilds (MVP & Quality Sign-Off)

**Trạng thái**: Design Baseline v1.0  
**Cập nhật lần cuối**: 2026-11-19

---

## 1. Tiêu chí Nghiệm thu Cấp Dự án (Project-Wide Acceptance Criteria)

| Mã AC | Hạng mục | Tiêu chí Đo lường Khách quan (Given / When / Then) | Trạng thái |
| :--- | :--- | :--- | :---: |
| **AC-001** | **JSON-Only Persistence** | **Given** hệ thống đang chạy, **When** kiểm tra toàn bộ gói phụ thuộc (`package.json`), cấu hình Docker và mã nguồn, **Then** có `0` kết nối đến PostgreSQL/MySQL/MongoDB/SQLite/Redis/S3 hoặc dịch vụ bên thứ ba; 100% dữ liệu lưu tại `data/db/**/*.json`. | `DESIGNED` |
| **AC-002** | **WAL Atomic Integrity** | **Given** 100 kịch bản ngắt tiến trình đột ngột giữa các giao dịch cường hóa/gacha/chế tạo, **When** khởi động lại server, **Then** tỷ lệ hỏng tệp JSON = `0%`, sai lệch giữa số dư và `CurrencyLedger` = `0`, số vật phẩm bị nhân bản = `0`. | `DESIGNED` |
| **AC-003** | **Server-Authoritative Combat** | **Given** client gửi gói tin giả mạo sát thương, tọa độ nhảy cóc hoặc spam cooldown, **When** server xử lý, **Then** `100%` gói gian lận bị bác bỏ và ghi vào `security-audit-YYYY-MM-DD.json`. | `DESIGNED` |
| **AC-004** | **Onboarding 5 Phút** | **Given** người chơi mới vào lần đầu không đọc tài liệu ngoài, **When** chơi theo chuỗi nhiệm vụ khởi đầu tại `reg_greenhaven_village`, **Then** hoàn thành chặt cây, gặt lúa, đánh quái đầu tiên và mở giao diện túi đồ trong vòng `<= 5 phút`. | `DESIGNED` |
| **AC-005** | **Weapon Enhancement +1..+10** | **Given** người chơi có đủ nguyên liệu và cấp `bld_blacksmith` tương ứng, **When** cường hóa bất kỳ vũ khí MVP nào từ `+0` lên `+10`, **Then** 10/10 bước thành công chắc chắn (0% vỡ đồ/tụt cấp), chỉ số ATK tăng đúng công thức bảng `weapon-upgrade-costs.csv`, và chặn cứng nâng lên `+11`. | `DESIGNED` |
| **AC-006** | **Fair In-Game Gacha** | **Given** màn hình Gacha mở lên, **When** người chơi xem thông tin banner và quay 1x/10x, **Then** 100% dùng `STARLIGHT_SHARD` kiếm từ gameplay (không có nút nạp tiền thật), hiển thị bảng xác suất tổng bằng `100.00%`, hiển thị chính xác bộ đếm Pity và thực thi đúng Hard Pity 80/70. | `DESIGNED` |
| **AC-007** | **Meaningful Farming Loop** | **Given** người chơi trồng cây & nuôi gà/bò tại lãnh địa, **When** nấu món ăn tại `bld_kitchen` và mang vào `dng_mossroot_hollow`, **Then** buff thực phẩm cải thiện thực tế tốc độ hồi stamina/ATK/HP trong trận Boss và tiến trình offline luôn tính đúng theo đồng hồ server (trần 24h). | `DESIGNED` |
| **AC-008** | **Co-op Boss Raid 3 Phase** | **Given** tổ đội 2–4 người vào `dng_mossroot_hollow`, **When** giao chiến `boss_thornback_elder`, **Then** Boss chuyển đủ 3 phase rõ rệt (65%, 30% HP theo `bosses.json`), telegraph đỏ luôn nhìn rõ kể cả khi đang tung Ultimate, cơ chế Stagger (`6.0s / x1.40`) hoạt động khi Poise về 0 và mọi thành viên đủ điều kiện đều nhận chiến lợi phẩm cá nhân. | `DESIGNED` |
| **AC-009** | **Pixel-Perfect Visual & 60 FPS** | **Given** trình duyệt Desktop ở độ phân giải `1280x720` và `1920x1080`, **When** chạy cảnh làng & chiến đấu rừng, **Then** canvas dùng `nearest-neighbor` sắc nét không mờ, Y-sorting đúng chiều sâu 2.5D và FPS trung bình `>= 55 FPS` (mục tiêu `60 FPS` — `proposed/unverified`). | `DESIGNED` |
| **AC-010** | **Zero-Loss Reconnect** | **Given** kết nối WebSocket bị ngắt đột ngột 15 giây, **When** mạng khôi phục trong cửa sổ 120 giây, **Then** client tự động kết nối lại không cần đăng nhập lại và khôi phục chính xác trạng thái nhân vật, kho đồ và Party. | `DESIGNED` |
| **AC-011** | **UI/UX Accessibility & Vietnamese** | **Given** toàn bộ 24 màn hình UI ở `1280x720`, `1920x1080`, `1024x768`, **When** chạy kiểm toán Playwright, **Then** không tràn chữ tiếng Việt có dấu, có đủ trạng thái `loading/empty/error/disconnected`, hỗ trợ tắt Camera Shake và tuân thủ tương phản chữ WCAG AA (`>= 4.5:1`). | `DESIGNED` |

---

## 2. Tiêu chí Nghiệm thu Riêng cho Giai đoạn Thiết kế Hiện tại (`DESIGN_AND_PLANNING_ONLY`)

Tiêu chí để chốt `FINAL-DESIGN-REPORT.md` và sẵn sàng xin phép người dùng bước sang `IMPLEMENTATION MODE`:
1. 100% danh mục tệp bắt buộc tại `GAME_DESIGN_BRIEF.md` (Mục 24) tồn tại đầy đủ nội dung thực chất, không có placeholder/stub.
2. Toàn bộ 12 tệp `game-data/*.json` vượt qua script kiểm chứng cú pháp và tham chiếu chéo (`0` lỗi P0/P1).
3. Chạy thực tế mô phỏng Node.js cho Gacha (100.000 lượt), Weapon Enhancement (+0→+10 cho 3 nhóm người chơi), Combat DPS/TTK và Economy 30 ngày với kết quả ghi nhận minh bạch tại `docs/balancing/simulation-results.md`.
4. Toàn bộ 12 thư mục feature trong `specs/001..012` hoàn tất đầy đủ quy trình Spec Kit (`spec.md`, `checklists/`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `tasks.md`, `analysis-report.md`) với `0` vi phạm Hiến pháp.
5. Hoàn thành đánh giá độc lập từ 5 góc nhìn (Game Director, Lead Engineer, Art Director, Economy Designer, QA Lead) trong `docs/management/FINAL-DESIGN-REPORT.md`.
