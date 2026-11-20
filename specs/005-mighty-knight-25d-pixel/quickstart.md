# Phase 1 Quickstart: Hướng dẫn Kiểm chứng Mighty Knight 2.5D Pixel

Tài liệu này mô tả quy trình tạo tài nguyên pixel, kiểm thử tự động và kiểm chứng trực quan từ A–Z sau khi triển khai theo `plan.md`. Mọi chi tiết cấu trúc thực thể xem tại [data-model.md](data-model.md), chuẩn 10–15 ảnh xem tại [contracts/asset-atlas.md](contracts/asset-atlas.md), và giao thức mạng xem tại [contracts/socket.md](contracts/socket.md).

---

## 1. Điều kiện tiên quyết & Môi trường

- **Node.js 20+** và **Python 3.10+ kèm Pillow (`PIL`)** để chạy pipeline sinh tài nguyên pixel.
- Cài đặt phụ thuộc monorepo:
  ```bash
  npm run install:all
  ```
- **Quy tắc an toàn dữ liệu**: Khi kiểm thử trên trình duyệt, luôn chạy server trên cổng test riêng với `ACCOUNT_STORAGE=local` ở thư mục cô lập; không đụng vào `server/data/db.json`. Tắt tiến trình bằng `ps` rồi `kill <pid>`.

---

## 2. Bước 1 — Sinh & Kiểm định Tài nguyên 2.5D Pixel (10–15 ảnh/nhân vật)

```bash
python3 scripts/mightyknight-pixel/build_pixel_sprites.py   # Sinh 18 Master Atlas (11..15 frame) + 6 chân dung 32x32
python3 scripts/mightyknight-pixel/build_pixel_vfx_ui.py    # Sinh 18 Pixel VFX + 4 Biome x 5 lớp + Icon Skill/Relic
node    scripts/mightyknight-pixel/build_audio.mjs          # Sinh 4 BGM + 42 SFX 16-bit WAV (-1.0 dBFS)
node    scripts/mightyknight-pixel/build_manifest.mjs       # Xuất manifest.json và kiểm tra ràng buộc 10..15 ảnh
```

**Kết quả kỳ vọng**:
- `database-mighty-knight-pixel/manifest.json` được tạo không có cảnh báo.
- Toàn bộ 6 Hero = **15 frame** (`720×48`), 6 quái thường = **11 frame** (`528×48`), 2 tinh anh = **12 frame** (`576×48`), 4 Đại Boss = **15 frame** (`1200×80`).

---

## 3. Bước 2 — Build & Bộ Test Tự Động (`node:test`)

```bash
npm run build
cd server && npm test
cd ../client && npx tsc --noEmit
```

### Ma trận kiểm chứng bắt buộc trong `server/test/`

| Test Suite | Kịch bản chính cần vượt qua | Kết quả kỳ vọng |
|---|---|---|
| `mk-pixel-assets.test.cjs` | Kiểm tra ngân sách frame cho 100% Hero/Enemy/Boss | Mọi nhân vật thỏa cứng `10 <= frames <= 15`; đúng kích thước `cellW * frames × cellH` |
| `mk-pixel-assets.test.cjs` | Kiểm tra độ sắc nét pixel (không anti-alias mờ) | 100% pixel sprite nhân vật có alpha nhị phân (`0` hoặc `255`) |
| `mk-pixel-assets.test.cjs` | Kiểm tra tham chiếu Choreography Timeline | 100% `step.frame` trong 60+ động tác nằm gọn trong `0 .. frames - 1` |
| `mk-mechanics.test.cjs` | 3-Hit Combo + Animation Cancel + Dash-Attack | Nối chuỗi `combo1 → combo2 → combo3` đúng cửa sổ `900 ms`, kết liễu đẩy lùi |
| `mk-mechanics.test.cjs` | Đủ 30 kỹ năng chủ động + Ultimate (6 Hero × 5) | Tất cả 30 skill thực thi sát thương, trạng thái (`stun`, `slow`, `burn`, `pull`, `counter`), đúng hồi chiêu & ngưỡng `100 Fury` |
| `mk-mechanics.test.cjs` | Tiến hóa VFX kỹ năng Lv3 / Lv5 | Nâng skill lên Lv3 & Lv5 phát sự kiện `fx` với `skillLevel = 3 | 5` và tăng số tia/đợt |
| `mk-mechanics.test.cjs` | Guard & Perfect Parry | Đỡ trong `180 ms` đầu kích hoạt `parry_ok`, chặn 100% sát thương, phản đòn + `+20 Fury` + giảm 30% CD |
| `mk-mechanics.test.cjs` | Boss 3 giai đoạn & Relic Draft | Boss chuyển Phase ở 66% / 33% HP; hạ Boss mở `relic_draft` 3 lựa chọn hợp lệ; chọn đúng cộng dồn Relic |
| `mk-mechanics.test.cjs` | Co-op Revive & Switch COM | Đứng gần đồng đội gục 2.5s hồi sinh 50% HP; `switch_com` đổi quyền điều khiển sang COM an toàn |
| `mk-e2e-socket.test.cjs` | Phòng 2 người + 1 COM qua Socket.IO thật | Nhận `mk:frame` 30 Hz, rate-limit chặn spam >24 lệnh/s, khán giả bị từ chối lệnh, reconnect đồng bộ lại |
| `mk-static-security.test.cjs` | Path traversal & phương thức HTTP lạ trên `/database-mighty-knight-pixel` | Trả về `400/403/405` cho `..`, `%00`, symlink thoát thư mục, file ngoài danh sách cho phép |

---

## 4. Bước 3 — Chơi Thử End-to-End Trên Trình Duyệt (PC & Mobile)

Khởi động môi trường dev (`npm run dev:server` & `npm run dev:client`) hoặc server test cô lập, mở trình duyệt kiểm tra lần lượt:

1. **Sảnh chờ (Lobby)**:
   - Tạo phòng **Mighty Knight 2.5D Pixel**, chuyển qua lại cả 6 anh hùng thấy chân dung pixel sắc nét và danh sách 4 Skill + Ultimate.
   - Thử tạo phòng ở cả 2 chế độ: **Endless Challenge** (1P + 2 COM) và **Boss Rush** (mở sẵn 4 skill từ đầu).
2. **Độ sắc nét 2.5D Pixel Art**:
   - Quan sát viền nhân vật ở màn hình `1280×720` và `1920×1080`: từng ô pixel sắc cạnh, không nhòe; di chuyển lên/xuống trục `Y` thấy nhân vật phía trước che nhân vật phía sau đúng Y-sort; nhảy/hất tung `Z > 0` thấy bóng elip pixel giữ nguyên trên mặt sàn và thu nhỏ theo độ cao.
   - Cuộn ngang bản đồ `1280×360` thấy 5 lớp parallax (Trời → Núi xa → Cây/Tàn tích → Sàn 2.5D → Bụi tiền cảnh) trượt mượt.
3. **Trải nghiệm "Nhiều Skill Animation" từ 15 ảnh**:
   - Đánh `J` liên tiếp 3 nhịp thấy 3 thế đánh khác nhau kèm vệt chém pixel và micro-hitstop khi trúng quái.
   - Bấm `K / L / I / O` (4 kỹ năng) thấy nhân vật đổi nhịp pose + nhảy/lướt + bóng dư ảnh màu hệ + hiệu ứng VFX pixel bùng nổ phía trước và dưới chân.
   - Canh quái vung đòn bấm `E` kích hoạt **PERFECT PARRY**: nghe tiếng *CLANG!* chói, vòng vàng nổ tung, thanh Fury nhảy vọt.
   - Đầy 100% Fury bấm `R`: thấy **Banner Chân Dung Pixel Cut-In** gọn góc trên-trái 0.45s và Ultimate quét sạch chiến trường.
   - Bấm `Q` đổi sang đồng đội COM điều khiển mượt ngay lập tức; nâng cấp kỹ năng lên Lv3 thấy hiệu ứng tiến hóa.
4. **Điện thoại ngang (`844×390`) & Không lỗi Console**:
   - Kiểm tra bố cục cảm ứng: Joystick trái, cụm đánh + 4 Skill + Ultimate + Dash + Parry bên phải không chồng chéo, dễ bấm bằng ngón cái.
   - Mở DevTools Console: **0 lỗi runtime**, **0 lỗi 404 ảnh/âm thanh**, FPS ổn định ~60 FPS.
