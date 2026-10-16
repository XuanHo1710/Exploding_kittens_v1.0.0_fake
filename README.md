# 💣 Mèo Nổ online

Game Mèo Nổ chơi qua trình duyệt cho 2–10 người. Bộ bài gốc được nhân đôi.

- `client/`: React + Vite (giao diện)
- `server/`: NestJS + Socket.IO (giữ luật chơi, xáo bài, chia bài)
- `shared/`: danh sách lá bài, số lượng, kiểu dữ liệu dùng chung
- `database/`: ảnh lá bài. Map tên file ↔ loại lá trong `client/src/cardImages.ts`
- `design/`: trang mẫu thiết kế lá bài

Không có đăng nhập: người chơi nhập tên, trình duyệt tự sinh ID và lưu localStorage.
Khi kết nối, socket gửi kèm `{ playerId, name }`. Tải lại trang hay rớt mạng sẽ tự về đúng chỗ ngồi.

## Cài đặt

Cần Node.js 20+.

```bash
npm run install:all
```

## Chạy khi phát triển (2 terminal)

```bash
npm run dev:server   # http://localhost:3001
npm run dev:client   # http://localhost:8801  ← mở cái này
```

- Người khác trong cùng mạng LAN mở `http://<IP-máy-bạn>:8801`.
- Từ ngoài internet: https://dev-ho.anai.io.vn (cloudflared tunnel trỏ vào cổng 8801).
- Đổi cổng giao diện: `PORT=xxxx npm run dev:client`. Domain được phép nằm trong `client/vite.config.ts`.

## Chạy thật (1 tiến trình)

```bash
npm run build
npm start            # http://localhost:3001 (đổi cổng bằng biến PORT)
```

Server phục vụ luôn giao diện đã build, chỉ cần mở 1 cổng.

## Chỉnh nhanh

| Muốn đổi | Sửa ở |
|---|---|
| Số lượng từng lá, số bài chia, số người tối đa | `shared/src/cards.ts` |
| Tên, mô tả lá bài | `shared/src/cards.ts` (`CARD_INFO`) |
| Ảnh lá bài | thả ảnh vào `database/`, khai báo tên file trong `client/src/cardImages.ts` |
| Thời gian Nope / lượt / chọn bài | cuối file `shared/src/cards.ts` |
| Tranh vector lá bài, avatar mèo | `client/src/art/` |
| Màu nền sáng / tối | đầu file `client/src/styles.css` |

## Tài khoản, xu & avatar

- Đăng nhập bằng **tên + mã PIN 4–6 số** (không cần email). PIN được băm (scrypt), sai 5 lần khoá 60 giây.
- Dữ liệu tài khoản lưu ở file JSON **`server/data/db.json`** (đã gitignore) – như một database cục bộ:
  `accounts[playerId] = { name, avatar, pinHash, pinSalt, tokens, coins, games, wins, lastDaily, … }`.
  Muốn xem / sao lưu chỉ cần mở hoặc copy file này.
- **Xu ảo** (không phải tiền thật): tài khoản mới 1.000 xu, nhận thêm 500 xu mỗi ngày trong Hồ sơ.
  Chủ phòng chọn mức cược; bắt đầu ván mỗi người góp vào hũ, người thắng ăn cả hũ.

- Thông tin người chơi lưu ở localStorage `meono.identity`: `{ playerId, name, avatar, updatedAt }`.
- `avatar` là `cat:<seed>` (mèo vẽ sẵn) hoặc `/avatars/<file>` (ảnh đã tải lên).
- Ảnh tải lên qua `POST /api/avatar` (client tự cắt vuông 256px), lưu ở `server/uploads/avatars/` (đã gitignore), phục vụ tại `/avatars/...`.
- Đổi tên/avatar giữa ván: client gửi `player:update`, cả phòng thấy ngay, không cần kết nối lại.
