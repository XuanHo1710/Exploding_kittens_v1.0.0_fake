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

### Client nối tới backend ở chỗ khác

Copy `client/.env.example` thành `client/.env` (hoặc đặt biến môi trường trên hosting):

| Biến | Dùng khi | Ý nghĩa |
|---|---|---|
| `BACKEND_URL` | `npm run dev` / `npm run preview` | Proxy `/api`, `/avatars`, `/socket.io` tới đây (mặc định `http://localhost:3001`) |
| `VITE_SERVER_URL` | `npm run build` rồi deploy `client/dist` lên host tĩnh | Trình duyệt gọi thẳng backend này; nhúng vào bundle lúc build nên đổi xong phải build lại |
| `ALLOWED_HOSTS` | dev / preview | Thêm domain public, ngăn cách bằng dấu phẩy |

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

## 🐜 Đế Chế Kiến (chiến thuật 2D thời gian thực)

Chọn **Đế Chế Kiến** khi tạo phòng. Tối đa 10 đế chế (người + máy), bản đồ 2D rộng theo số đế chế, sáng toàn bộ (ai cũng thấy hết căn cứ, trụ và kiến).
Chủ phòng chỉnh số máy, độ khó và thời gian trận trong phòng chờ.

- **Vàng:** khởi đầu 500, mỗi 1 phút được cấp thêm (225 → 300 → 375 …).
- **Tự ra quân:** bấm 1 ô trong danh sách 10 loại kiến – trại tự nở loại đó liên tục, từng con một (hiện "+1" mỗi con).
  Mỗi con trừ vàng lúc bắt đầu nở; hết vàng thì chờ lần cấp vàng kế tiếp rồi tự ra tiếp. Bấm lại ô đó / chuột phải: dừng.
- **3 trụ mỗi đế chế:** 2 Trụ Phụ (tầm 320) + 1 Trụ Chính (tầm 360), tự bắn kiến địch tới gần – ưu tiên con đang đánh trụ.
  Mỗi phát đạn hạ gọn 1 kiến, nạp đạn 5 giây; không loại kiến nào đánh được trụ từ ngoài tầm bắn. Mất Trụ Chính là bị loại.
- **Lệnh chung:** nút **⚔️ Tổng tấn công** (chọn đế chế gần nhất hoặc một đế chế cụ thể) – cả đạo quân tự hành quân,
  phá Trụ Phụ rồi Trụ Chính, đổ trụ này tự sang trụ kế. Nút **🛡️ Phòng thủ** – cả đạo quân về giữ căn cứ. Quân mới nở tự theo lệnh đang chọn.
- **Bản đồ chỉ để xem:** kéo chuột / 1 ngón để di chuyển, lăn chuột / chụm 2 ngón để phóng to, bấm bản đồ nhỏ để nhìn tới đó.
- Phím tắt: `1–9, 0` chọn loại tự ra quân · `T` tổng tấn công · `P` phòng thủ · `WASD` di chuyển · `Space` về căn cứ.

| Muốn đổi | Sửa ở |
|---|---|
| Giá, máu, sát thương kiến · trụ · vàng | `shared/src/ants.ts` |
| Bản đồ, luật mô phỏng | `server/src/game/ants/world.ts` |
| Cách máy chơi | `server/src/game/ants/bot.ts` |
| Hình vẽ kiến / trụ / đạn / bản đồ | `client/src/ants/render.ts` |

## ⚔️🔮 Miragine War (Solo 10 Người / Co-op / Lập Đội trên bản đồ rộng)

Chọn **Miragine War (Solo 10 Người)** khi tạo phòng. Tối đa 10 phe (người + máy) cùng chiến đấu thời gian thực trên bản đồ rộng, sáng toàn bộ, sử dụng **100% tài nguyên đồ họa, sprite sheet, công trình, đạn phép, âm thanh và thông số lính trích xuất từ Miragine War gốc** trong thư mục `database-miraginewar/*`:

- **Chế độ chơi:**
  - **Solo 10 người (Hỗn chiến):** Mỗi người một phe (tối đa 10 người/máy trong phòng), tất cả cùng đánh nhau tự do.
  - **Co-op 10 người (Cùng đánh máy):** Tất cả người chơi hợp lực chung 1 liên quân chống lại toàn bộ máy.
  - **Lập đội (Chia phe):** Tự chọn 1 trong 5 đội ở phòng chờ; máy tự vào đội ít người nhất.
- **Vàng & Lương Hiệp 30 giây:** Khởi đầu 300 vàng, thu đều mỗi giây (`6 + 2 × cấp Kho Lương` + mỗi **Mỏ Vàng** đang giữ `+4/s`, Mỏ Lớn giữa bản đồ `+9/s`) **cộng thêm Lương Hiệp mỗi 30 giây** chuẩn Miragine War (khởi đầu `+100 vàng/30s`, mỗi lần mua lính được cộng thêm `+incomeBonus` từ `+4` đến `+160` vàng/30s).
- **16 Binh Chủng Nguyên Bản Miragine War (Lưới 2×8):**
  `Newbie (Tân Binh)`, `Veteran (Cựu Binh)`, `Zombie (Xác Sống)`, `Samurai (Võ Sĩ)`, `Sword Man (Kiếm Sĩ)`, `Ninja`, `Novice (Pháp Đồ)`, `Heavy Sword Man (Trọng Kiếm)`, `Monk (Võ Tăng)`, `Vampire (Ma Cà Rồng)`, `Cavalry (Kỵ Binh)`, `Immortal (Bất Tử Quân)`, `Mage (Đại Pháp Sư)`, `Iron Knight (Thiết Kỵ Sĩ)`, `Dread Lord (Chúa Tể Hắc Ám)`, `High Lord (Thánh Chiến Vương)`.
- **Hệ thống Giáp Nhẹ (`Light`) / Giáp Nặng (`Armored`) & Giáp Trừ Thẳng:** Công thức sát thương chuẩn 100% Miragine War: `damage[victim.armorTypeID] - victim.armor`. Giới hạn dân số 60. Bật **↻ tự mua** một loại lính để tự xuất quân liên tục.
- **Lệnh Điều Khiển Đạo Quân:**
  - **🎯 Hành Quân Tấn Công Chỉ Định (`T`):** Chọn 1 Thành địch trong danh sách (hoặc bấm nút `🎯 Đánh` trên bảng xếp hạng, hoặc chạm thẳng vào Thành địch trên bản đồ) để toàn quân hành quân tấn công tổng lực vào đúng mục tiêu đó.
  - **🛡️ Phòng Thủ (`P`):** Rút toàn bộ đạo quân về giữ quanh Pha Lê Thành.
  - **⚔️ Tự Hành Quân (`H`):** Tự đi chiếm Mỏ Vàng gần nhất rồi đánh Thành địch gần nhất.
  - **🚩 Tập Kết (`R`):** Chạm bản đồ để cắm cờ tập kết quân.
- **Pha Lê Chính (`A_crystal.png` / `B_crystal.png` + `door.png`):** 3500 máu, 100 sát thương bảo vệ tầm gần. Pha Lê vỡ = bị loại.

| Muốn đổi | Sửa ở |
|---|---|
| Kho đồ họa, sprite sheet, chân dung, âm thanh gốc Miragine War | `database-miraginewar/*`, `database-miraginewar/mapping.json` |
| 16 binh chủng, Giáp Nhẹ/Nặng, lương 30s, bản đồ 10 người | `shared/src/thap.ts` |
| Luật mô phỏng, lệnh Hành Quân Tấn Công Chỉ Định / Phòng Thủ | `server/src/game/thap/world.ts`, `server/src/game/thap/bot.ts` |
| Nạp sprite sheet & vẽ Pha Lê / 16 lính / đạn phép / âm thanh | `client/src/thap/sprites.ts`, `client/src/thap/render.ts`, `client/src/thap/sound.ts`, `client/src/components/ThapBoard.tsx` |

## 🎱 Lô Tô Cân Đồ (1–10 người)

Chọn **Lô Tô Cân Đồ** khi tạo phòng. Ở phòng chờ mỗi người tự chọn mua **1 tờ (50 xu)** hoặc **2 tờ (100 xu)**; hũ = tổng tiền mua tờ của cả bàn.

- Mỗi tờ **9 hàng × 9 cột** (3 khối × 3 hàng), mỗi hàng **5 số**; cột theo chục: 1–9, 10–19 … 80–90. Mua 2 tờ thì 2 tờ ghép lại chứa **đủ 1–90**, mỗi số đúng 1 lần, rải đều giữa 2 tờ. Mỗi người tự chọn màu từng tờ (xanh, đỏ, tím, xanh lá, cam, vàng, hồng) – mua 2 tờ thì trùng màu hay khác màu đều được.
- Máy gọi ngẫu nhiên **1 số mỗi 5 giây** (trình duyệt đọc số bằng giọng tiếng Việt nếu có); số trúng tự đóng dấu trên tờ của mình, hàng còn thiếu 1 số sáng **CHỜ**.
- Ai đủ **5 số trên một hàng ngang** trước là **KINH** – ăn cả hũ. Nhiều người KINH cùng một số thì chia đều. Rời ván giữa chừng thì tờ không được tính nữa.

## ⚡ Nối Thú Đại Chiến (nối hình 1–10 người realtime, liên hoàn 6 Boss, Trùm Cuối Cự Thần đánh trên 2 bàn)

Chọn **Nối Thú Đại Chiến** khi tạo phòng. **1–10 người** (2 người là solo 1v1); chủ phòng thêm **máy** cho đủ chỗ và chọn độ khó Dễ / Thường / Khó
(phòng 1 người để **0 máy** là chơi một mình: tự nối, tự đánh Boss, không có chiêu Đóng Băng/Mây Mù vì không có đối thủ).
Ô dùng 36 emoji con vật khác hẳn nhau (chó, mèo, gấu trúc, voi, cua…) cho dễ nhìn; máy không có font emoji thì dùng bộ thú vẽ tay.

- **Luật nối:** bấm 2 ô cùng con thú; nối được nếu có đường đi qua ô trống, **gấp khúc tối đa 2 lần**, được vòng ra ngoài mép bàn.
  Bàn 16×9, mọi người cùng một đề. Hết nước đi thì bàn tự xáo. Gợi ý (phím `H`) hồi 15 giây, trừ 5 điểm.
- **🔀 Đảo Bàn:** chiêu tự đảo bàn mình cho dễ nối, miễn phí, **hồi chiêu 1 phút** (phím `R`; đầu trận cũng chờ 1 phút).
  Không chiêu nào của Boss hay đối thủ đảo bàn của bạn.
- **Màn 1 – Đua Nối (150 giây):** mỗi cặp 10 điểm, nối liên tiếp trong 3 giây thì combo (+5 mỗi bậc). Combo nạp ⚡ Sấm;
  đầy Sấm tung **❄️ Đóng Băng** (6 ô đối thủ, 8 giây – phím `1`) hoặc **🌫️ Mây Mù** (che bàn đối thủ 4 giây – phím `2`).
  Chiêu mặc định đánh **người đang dẫn đầu**; bấm vào bàn nhỏ của một đối thủ để nhắm người đó (bấm lại để bỏ chọn).
  Dọn sạch bàn trước: +300 và +20 mỗi giây còn lại. Người dẫn trước vào Boss đầu với 50% Sấm.
- **Liên hoàn 3 Boss:** cả phòng cùng đánh. Mỗi cặp là một cú đấm (25 sát thương, combo nhân thêm, đường dài hơn 10 ô là "Cú Đấm Xa" +20);
  Sấm đầy tung **⚡ Siêu Đấm** 400 (phím `Space`). **Boss trước hết máu thì Boss sau xuất hiện** (nghỉ 5 giây, bàn mới, giữ nguyên Sấm).
  Cả 3 Boss dùng **chung 6 phút** (không tính lúc nghỉ): hạ nhanh thì dư giờ cho Boss sau; hết giờ thì trận kết thúc.
  Mỗi Boss có 3 giai đoạn (66% / 33% máu), càng về sau ra đòn càng dồn dập. Máu gốc: 3000 với 2 người, +900 mỗi người thêm (10 người là 10200), nhân hệ số của từng Boss:

  | Boss | Máu | Chiêu | Nhịp ra đòn |
  |---|---|---|---|
  | ⚡ Vua Sấm Sét | ×0.7 | Sét Đánh (giật điện 4 ô), Mưa Băng (băng 4 ô), Sét Lan (giật 9 ô + mất combo người gây sát thương nhiều nhất), Bóng Tối | 12 / 9 / 6 s |
  | 🕷️ Nữ Hoàng Nhện | ×1.0 | Lưới Tơ (trói 5 ô), Nọc Độc (6 giây: mất combo, sát thương còn một nửa), Kén Tơ (trói 12 ô người gây sát thương nhiều nhất), Hút Sinh Lực (hồi 5% máu) | 11 / 8 / 6 s |
  | 👹 Bạo Chúa | ×1.4 | 8 chiêu: Thiên Thạch (thiêu 6 ô), Động Đất (mất combo, −25 Sấm), Sét Đánh, Khiên Đá (khiên 6% máu), Mưa Băng, Gầm Thét (choáng 2,5 giây), Bóng Tối, Nọc Độc | 10 / 7 / 5 s |
  | 🐉🔥 Song Sát (Co-op 2 Boss, 6 phút riêng) | ×1.6 | Hố Đen Hư Không (khoá 6 ô 5 giây, −15 Sấm), Bão Lửa Địa Ngục (thiêu 6 ô), Xiềng Xích Linh Hồn (khoá 8 ô + choáng 1 giây người dẫn đầu), Niết Bàn Tái Sinh (hồi 4% máu + khiên 5%), Nhật Thực Vĩnh Cửu (tối 3 giây + độc 5 giây), Song Tuyệt Hủy Diệt (khoá 4+4 ô, choáng 1,2 giây, −20 Sấm, khiên 3%) | 13 / 10 / 8 s |
  | 👑 **Đại Ma Vương Hỗn Nguyên** (4 Boss hợp thể, **3 thanh máu**, 7 phút riêng) | ×2.7 | **Ma Nhãn Laze** (choáng 3 / 4 / 5 thú), **Lốc Xoáy Hỗn Nguyên** (đảo lộn bàn, mất combo, −10 Sấm), **Tận Thế Tứ Linh** (4 linh hồn Boss cùng đánh: khoá 2 ô băng + 2 tơ + 2 lửa + 2 điện, −15 Sấm), cùng Sét Đánh, Lưới Tơ, Thiên Thạch, Nọc Độc, Hố Đen, Bão Lửa, Gầm Thét. Vỡ mỗi thanh máu dựng Giáp Hỗn Nguyên (3%) | 12 / 10 / 8 s |
  | 🌌 **Trùm Cuối – Cự Thần Thiên Hà** (**10 thanh máu**, 10 phút riêng) – mỗi người có **2 bàn trái + phải**, nối bên nào cũng đánh Boss, **sát thương x2** | ×10 | **Song Nhãn Diệt Thế** (2 mắt bắn laze, mỗi bàn choáng 2 / 3 / 4 thú), **Bão Sét Thiên Nhãn** (sét từ 2 mắt: mỗi bàn khoá điện 3 / 4 / 5 ô + choáng 0,7 giây), **Song Thủ Pháo Tinh Hà** (2 cánh tay giơ hành tinh bắn tia quét ngang 1 hàng mỗi bàn, thiêu 6 ô), **Xoay Chuyển Càn Khôn** (mỗi bàn bị lật ngang / lật dọc / xoay 180°), **Mưa Sao Băng Thiên Hà** (thiêu 8 ô), **Trọng Lực Đảo Chiều** (2 bàn đổi chỗ), **Siêu Tân Tinh** (chói loá 2,5 giây + khiên 2%), Lốc Xoáy, Tận Thế Tứ Linh, Sét Đánh, Hố Đen, Gầm Thét. Vỡ mỗi thanh máu dựng Khiên Tinh Tú (1%) | 12 / 10 / 8 s |

  Chơi thử bằng máy: 2 máy Thường hạ đủ 3 Boss; 2 máy Dễ hạ 2 Boss và đánh tới Bạo Chúa.
- **Thắng:** tổng = điểm Màn 1 + sát thương lên Boss + **+500 cho mỗi Boss mình kết liễu**. Cao nhất thắng cả hũ; ngang điểm đầu bảng hoặc máy thắng thì hoàn cược.
- Rời trận giữa chừng là bỏ cuộc (không được thắng; trận vẫn tiếp cho người còn lại, chỉ còn 1 người thì người đó thắng). Server kiểm tra mọi nước nối và giới hạn 8 lệnh/giây; bàn của đối thủ chỉ gửi ô còn / trống.

| Muốn đổi | Sửa ở |
|---|---|
| Thời gian, điểm, sát thương, máu Boss, bộ thú | `shared/src/link.ts` |
| Sinh bàn, tìm đường nối | `server/src/game/link/board.ts` |
| Luật trận, Boss | `server/src/game/link/duel.ts` |
| Cách máy chơi | `server/src/game/link/bot.ts` |
| Hình thú / Boss / hiệu ứng | `client/src/link/tiles.ts`, `client/src/link/fx.ts` |

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
