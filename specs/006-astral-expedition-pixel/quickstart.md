# Quickstart & Validation Guide: Astral Expedition Pixel (`006-astral-expedition-pixel`)

**Date**: 2026-11-21
**Spec**: [spec.md](./spec.md) · **Data Model**: [data-model.md](./data-model.md) · **Contracts**: [asset-pipeline.md](./contracts/asset-pipeline.md), [socket-and-storage.md](./contracts/socket-and-storage.md), [vertical-battle-ui.md](./contracts/vertical-battle-ui.md)

---

## 1. Điều kiện Tiên quyết (Prerequisites)

- **Node.js**: `20+` (cài đặt dependencies bằng `npm run install:all` tại gốc repo).
- **Python**: `3.10+` (`py` trên Windows) kèm thư viện `pillow` để chạy pipeline tạo/chuẩn hóa ảnh pixel:
  ```powershell
  py -m pip install pillow
  ```
- **Docker Desktop / Docker Engine**: Đã có sẵn (`Docker 29+`) để kéo và chạy `redis:7-alpine` miễn phí cục bộ (`0` chi phí đám mây — `SC-008`).

---

## 2. Khởi chạy Hạ tầng Cục bộ & Pipeline Tài nguyên

### Bước 1 — Bật Local Docker Redis (miễn phí, chạy cục bộ)
```powershell
docker compose -f docker-compose.expedition.yml up -d
```
*(Nếu tạm dừng container Redis, server vẫn tự động chuyển sang bộ nhớ đệm dự phòng nội bộ mà không mất dữ liệu lưu trong `server/data/expedition/`.)*

### Bước 2 — Kiểm định Bộ Quy Trình Kỹ Năng & Xuất Gói Tài Nguyên Pixel Đa Frame
```powershell
# 1. Kiểm tra 11 skills đã đổi sang expedition-*, 0 broken links, 0 thuật ngữ bắt thú cũ (SC-006)
py tools/expedition/verify_skills_and_glossary.py

# 2. Sinh / chuẩn hóa & kiểm tra chuẩn phần cứng Gen 3 + số frame (36f Hero/Boss, 48f Movement, 8f Map/Scene anim)
py tools/gen3/check_gen3.py --quiet database-astral-expedition
py tools/expedition/verify_bundle.py
```
**Kết quả mong đợi**: `0 failed`, đầy đủ `12` Anh Hùng (`36f` chiến đấu + `48f` di chuyển), `7` Đại Trùm (`256×256` × `36f`), `7` bản đồ `.tmj` (`0` lỗi seam) và `manifest.json` hợp lệ.

### Bước 3 — Khởi chạy Server & Client Phát triển
```powershell
npm run dev:server   # NestJS + Socket.IO tại http://localhost:3001
npm run dev:client   # Vite React Client tại http://localhost:8801
```

---

## 3. Kịch bản Kiểm chứng Đầu-Cuối (End-to-End Validation Scenarios)

1. **Kiểm chứng Vòng lặp 5 phút Đầu & Menu Kỹ Năng Dọc (`SC-001`, `SC-003`)**:
   - Đăng nhập tại `http://localhost:8801`, chọn thẻ **Astral Expedition Pixel** trên sảnh chính.
   - Xác nhận nhân vật xuất hiện tại bản đồ `01-dawn-meadow` (**Đồng Cỏ Khởi Nguyên**) với cỏ/nước chuyển động `8 frame` và đội hình 3 Anh Hùng khởi đầu (`Lâm Phong`, `Minh Châu`, `Thạch Sơn`).
   - Đi tới chốt **Quái Gác Cổng** đầu tiên → xác nhận quái chặn đường và chuyển vào màn hình trận đấu góc chéo, cả hai phe đều thở/cử động liên tục (`IDLE_BREATHE` 6f).
   - Xác nhận **Menu Chọn Kỹ Năng Dọc** hiển thị rõ tiếng Việt, bấm `Timed Hit` khi tung chiêu và thực hiện thành công **Né (`Shift`)** + **Đỡ Phản Đòn (`E` → phản kích + hồi `+1 AP`)** + **Phá Thế (`Break`)**.
2. **Kiểm chứng Lộ trình 7 Bản đồ & Trùm Cuối Quang Phổ Mây Trời Ban Đêm (`SC-002`, `SC-004`)**:
   - Chạy bộ kiểm thử tự động giải đường đi trên cả 7 bản đồ (`01-dawn-meadow` → `07-aurora-zenith`) và kiểm thử kịch bản 3 phase của Trùm Cuối **Astral Painter Seraphina** trên đấu trường dải cực quang đêm động.
3. **Kiểm chứng Gacha 12 Anh Hùng, Hard Pity 80 & Bền vững khi Khởi động lại Redis (`SC-005`)**:
   - Chạy kiểm thử mô phỏng `10.000` lượt quay Gacha xác nhận `100%` chạm mốc `80` nhận `SSR`, `100%` cụm 10 lượt nhận `SR+`, sau đó khởi động lại container `expedition-redis` và xác nhận hồ sơ + Pity giữ nguyên `100%`.
4. **Kiểm chứng Toàn vẹn Workspace & Không Hồi Quy (`SC-007`)**:
   ```powershell
   npm run build
   npm test --prefix server
   ```
   **Kết quả mong đợi**: Toàn bộ bài kiểm thử của các game hiện có và bộ kiểm thử mới `expedition-*.test.cjs` đều `PASS 100%`.

## Chơi ngay (bản ghép end-to-end)

```powershell
npm run install:all                      # lần đầu
cd server; npm run build; npm start      # backend :3001 (Redis Docker không bắt buộc, tự fallback RAM)
cd client; npx vite --port 5173          # mở http://localhost:5173
```

Đăng nhập bằng tên + PIN → chọn thẻ **Astral Expedition Pixel** → Tạo phòng → Bắt đầu.

| Màn | Nội dung |
|---|---|
| Khám Phá | `WASD`/mũi tên di chuyển, `E` tương tác (trạm nghỉ, rương, cổng vùng, bàn thờ Trùm). Chạm Quái Gác Cổng là vào trận. |
| Trận đấu | Menu kỹ năng dọc (AP 0..9). Ra đòn: bấm `SPACE` đúng nhịp vòng tròn (Hoàn Hảo / Tốt / Trượt). Địch đánh: `SPACE` = Đỡ (đỡ đủ mọi nhịp → Phản Kích), `D` = Né. Chỉ số EVA cho tự né. Kết thúc trận, server phát lại nhật ký để xác thực rồi trao thưởng + rớt đồ + EXP. |
| Đội Hình | Lên cấp (Tinh Thể EXP), cộng điểm chỉ số (HP/ATK/DEF/SPD/Chí mạng/ST Chí mạng/Né), tẩy điểm, nâng / mở khóa kỹ năng theo cấp, mặc trang bị, chọn đội 3 người. |
| Túi Đồ | Mặc trang bị, dùng thuốc chỉ số (cộng vĩnh viễn), phân rã đồ lấy Tinh Thể EXP. |
| Triệu Hồi | Gacha anh hùng (bảo hiểm SSR) và Rương Thiên Văn (gacha trang bị + thuốc, bảo hiểm Huyền Thoại). |
| Tỉ Lệ | Bảng tỉ lệ công khai đọc trực tiếp từ file cân bằng. |

## Chỉnh tỉ lệ / con số

Mọi tỉ lệ nằm ở **`shared/src/expedition/balance.ts`** (`EXP_BALANCE`): gacha anh hùng, gacha trang bị, rớt đồ theo loại trận, đường cong EXP, điểm chỉ số mỗi cấp + giá trị mỗi điểm + trần chỉ số, mở khóa kỹ năng theo cấp, chi phí nâng kỹ năng, chỉ số trang bị theo độ hiếm, thuốc chỉ số, kinh tế khởi đầu. Đổi xong chạy lại `npm run build` ở `server/` (client Vite tự nạp lại). Logic dùng chung ở `shared/src/expedition/progression.ts`; kiểm thử ở `server/test/expedition-progression.test.cjs`.
