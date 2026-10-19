# 💣 Mèo Nổ online

Game Mèo Nổ chơi qua trình duyệt cho 2–10 người. Mỗi phòng có thể tùy chỉnh bộ bài và luật nhà.

- `client/`: React + Vite (giao diện)
- `server/`: NestJS + Socket.IO (giữ luật chơi, xáo bài, chia bài)
- `shared/`: danh sách lá bài, số lượng, kiểu dữ liệu dùng chung
- `database/`: ảnh lá bài. Map tên file ↔ loại lá trong `client/src/cardImages.ts`
- `design/`: trang mẫu thiết kế lá bài

Người chơi đăng ký/đăng nhập bằng tên và PIN. Trình duyệt lưu ID cùng token đăng nhập trong localStorage.
Khi kết nối, socket gửi kèm `{ playerId, name, token }`. Tải lại trang hay rớt mạng sẽ tự về đúng chỗ ngồi nếu phòng còn tồn tại.

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
- Từ ngoài internet: https://dev.meo.no (cloudflared tunnel trỏ vào cổng 8801).
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
| Số lượng từng lá, số bài chia, số người tối đa cho phòng | Chọn **Tạo phòng → Luật & bộ bài**, hoặc **Sửa luật** trong phòng chờ |
| Bộ luật mặc định, preset và giới hạn tùy chỉnh | `shared/src/room-rules.ts` |
| Tên, mô tả lá bài | `shared/src/cards.ts` (`CARD_INFO`) |
| Ảnh lá bài | thả ảnh vào `database/`, khai báo tên file trong `client/src/cardImages.ts` |
| Thời gian Nope / lượt / chọn bài | **Luật & bộ bài → Thời gian mỗi hành động** |
| Tranh vector lá bài, avatar mèo | `client/src/art/` |
| Màu nền sáng / tối | đầu file `client/src/styles.css` |

## Luật & bộ bài tùy chỉnh

**Tạo phòng** mở phần chọn luật trước khi tạo mã: Cân bằng, Ván nhanh, Căng thẳng, Luật cũ hoặc tự chỉnh số lượng bài, bom, Gỡ Bom, combo và thời gian. Trong phòng chờ, chủ phòng có thể **Sửa luật**; mọi người phải **Đồng ý luật & sẵn sàng** trước khi bắt đầu. Đổi luật hoặc mức cược sẽ yêu cầu xác nhận lại. Server kiểm tra đủ bài và khóa luật trong ván.

Xem phạm vi tùy chỉnh và cách xử lý các tình huống dễ nhầm tại [docs/room-rules.md](docs/room-rules.md).

## Tài khoản, xu & avatar

- Đăng nhập bằng **tên + mã PIN 4–6 số** (không cần email). PIN được băm (scrypt), sai 5 lần khoá 60 giây.
- Dữ liệu tài khoản có thể lưu chính trong **một file JSON riêng tư trên Google Drive** (`ACCOUNT_STORAGE=google-drive`):
  `accounts[playerId] = { name, avatar, pinHash, pinSalt, tokens, coins, games, wins, lastDaily, … }`.
  Backend tải file trước khi nhận người chơi, xếp tuần tự các thay đổi và đợi Drive xác nhận trước khi báo thành công.
- `server/data/db.json` trong chế độ Drive chỉ là bản sao cục bộ. Backend không tự dùng bản sao nếu Drive lỗi.
  Khi lần đầu tải Drive khác nội dung cục bộ, bản cũ được giữ riêng thành `db.json.before-drive-*.json`.
- Chế độ phát triển `ACCOUNT_STORAGE=local` lưu ở `server/data/db.json`. Chưa có `.env` hay cấu hình Drive thì vẫn chạy local.
  Ảnh lá bài, kho bài và avatar tiếp tục lưu trong project/server; chỉ dữ liệu tài khoản đi lên Drive.
- **Xu ảo** (không phải tiền thật): tài khoản mới 1.000 xu, nhận thêm 500 xu mỗi ngày trong Hồ sơ.
  Chủ phòng chọn mức cược; bắt đầu ván mỗi người góp vào hũ, người thắng ăn cả hũ.

- Thông tin người chơi lưu ở localStorage `meono.identity`: `{ playerId, name, avatar, token, updatedAt }`.
- `avatar` là `cat:<seed>` (mèo vẽ sẵn) hoặc `/avatars/<file>` (ảnh đã tải lên).
- Ảnh tải lên qua `POST /api/avatar` (client tự cắt vuông 256px), lưu ở `server/uploads/avatars/` (đã gitignore), phục vụ tại `/avatars/...`.
- Đổi tên/avatar giữa ván: client gửi `player:update`, cả phòng thấy ngay, không cần kết nối lại.

## Bật lưu tài khoản trên Google Drive

Hướng dẫn đầy đủ: [docs/google-drive-storage.md](docs/google-drive-storage.md).

1. Bật Google Drive API và tạo OAuth client loại **Desktop app** trong Google Cloud.
2. Copy `server/.env.example` thành `server/.env` nếu chưa có, điền `GOOGLE_DRIVE_CLIENT_ID` và `GOOGLE_DRIVE_CLIENT_SECRET` trên máy của bạn.
3. Chạy lệnh dưới đây, mở link trong trình duyệt cùng máy và cấp quyền. Script tạo JSON riêng tư, lưu refresh token và file ID vào `.env`:

```powershell
npm --prefix server run drive:setup -- --create-file
```

Nếu đã có người chơi, **dừng backend, sao lưu JSON cũ và nhập dữ liệu trước lần đầu chạy server ở chế độ Drive**:

```powershell
npm --prefix server run build
npm --prefix server run drive:import
```

Importer mặc định đọc `server/data/db.json`, chỉ ghi vào file Drive có `accounts` còn rỗng, không sửa file nguồn. Có thể chọn bản sao riêng:

```powershell
npm --prefix server run drive:import -- --source "C:\private\meono-accounts-backup.json"
```

Sau đó chạy game bằng các lệnh dev/build/start ở trên. `server/.env` được đọc tự động; biến môi trường hosting được ưu tiên. Không đưa token/secret vào frontend hoặc Git.

Chỉ chạy **một backend** cho một file Drive. Giới hạn JSON hiện tại là 5 MB. Nếu phát hiện file bị chương trình khác sửa hoặc không xác định được kết quả ghi, backend khóa cập nhật tài khoản cho tới khi kiểm tra dữ liệu và khởi động lại. Phòng, ván đang chơi và hũ xu đang giữ vẫn ở RAM; lưu tài khoản trên Drive không khôi phục được ván bị ngắt do server tắt.

Chạy kiểm tra lưu trữ (mock Drive, không dùng tài khoản Google thật):

```powershell
npm --prefix server test
```
