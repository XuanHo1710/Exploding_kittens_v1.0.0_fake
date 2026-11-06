# Tasks: Nối Thú – 3 Boss liên hoàn, Đảo Bàn cứu trợ

**Input**: "thêm 2 con boss ngầu lòi solo nữa: 1 con boss nhện, boss bạo chúa có nhiều skill hơn. Bỏ skill đảo pikachu. Đảo pikachu là phúc lợi của người chơi, có khi bí quá sau 2 phút."
**Nền**: `specs/002-noi-thu-dai-chien/` (Nối Thú Đại Chiến, đã xong). Không có `.specify/`.

**Đã chốt với người dùng**
1. Đánh **lần lượt cả 3 Boss**: Màn 1 đua nối → Vua Sấm Sét → Nữ Hoàng Nhện → Bạo Chúa (trùm cuối).
2. **Đảo Bàn** (tự đảo bàn của mình, miễn phí) mở khi **2 phút liền không nối được cặp nào**; dùng xong đếm lại từ đầu.
3. **Bỏ mọi chiêu đảo bàn dùng để tấn công**: Boss không còn "Lốc Xáo"; chiêu Bão Xáo của người chơi đổi thành **Mây Mù** (che bàn 1 đối thủ 4 giây).

## Luật mới

| Boss | Máu (× máu gốc theo số người) | Thời gian | Chiêu (xoay vòng) | Giây giữa 2 đòn (giai đoạn 1/2/3) |
|---|---|---|---|---|
| ⚡ Vua Sấm Sét | ×0.8 | 120 s | Mưa Băng, Bóng Tối | 12 / 9 / 6 |
| 🕷️ Nữ Hoàng Nhện | ×1.0 | 130 s | Lưới Tơ, Nọc Độc, Kén Tơ | 11 / 8 / 6 |
| 👹 Bạo Chúa | ×1.3 | 150 s | Thiên Thạch, Động Đất, Mưa Băng, Khiên Đá, Bóng Tối, Nọc Độc | 10 / 7 / 5 |

- Hạ một Boss → người kết liễu +500 (mỗi Boss) → nghỉ 5 giây → Boss kế, bàn mới, giữ Sấm.
- Hết giờ mà Boss chưa gục → Boss thoát, trận kết thúc, tính điểm như cũ.
- Hạ Bạo Chúa → "phá đảo", trận kết thúc.
- Chiêu mới: **Lưới Tơ** khoá 5 ô 7 s · **Nọc Độc** 6 s: mất combo, sát thương giảm một nửa · **Kén Tơ** khoá 12 ô 8 s của người đang gây sát thương nhiều nhất · **Thiên Thạch** thiêu 6 ô 5 s · **Động Đất** mất combo, mất 25 Sấm · **Khiên Đá** Boss có khiên 6% máu tối đa, hút sát thương trước.

## Phase 1: Shared

- [X] T001 `shared/src/link.ts`: `LinkBossId`, `LINK_BOSSES` (tên, máu, thời gian, chiêu, nhịp), bỏ `'shuffle'` khỏi `LinkBossSkill`, thêm các chiêu mới; `LinkSkill` = `'freeze' | 'fog'`; lệnh `{ t: 'shuffle' }`; `LINK_SELF_SHUFFLE_S = 120`; `LinkMe.shuffleIn`, `LinkMe.venom`; `LinkFoe.kos`; `LinkBossView.id/no/shield/maxShield`; ô khoá có loại (băng / tơ / lửa); fx `boss` mang `boss` id, fx `shuffle`.

## Phase 2: Tests (viết trước)

- [X] T002 `server/test/link-duel.test.cjs`: sửa test cũ (Bão Xáo → Mây Mù, Boss không còn Lốc Xáo, KO chuyển Boss kế, hết giờ Boss thoát) và thêm test:
  - 3 Boss lần lượt, máu/thời gian đúng bảng, KO mỗi Boss +500, hạ Bạo Chúa thì kết thúc.
  - Chiêu Nhện: Lưới Tơ, Nọc Độc (giảm nửa sát thương), Kén Tơ nhắm người sát thương cao nhất.
  - Chiêu Bạo Chúa: đủ 6 chiêu, Khiên Đá hút sát thương, Động Đất mất combo + Sấm.
  - Đảo Bàn: chưa đủ 2 phút thì từ chối; đủ thì đảo được, đếm lại; nối được cặp thì đếm lại.
  - Không còn chiêu nào của Boss hay người chơi đảo bàn người khác.

## Phase 3: Server

- [X] T003 `server/src/game/link/board.ts`: ô khoá có loại (`freeze(n, ms, now, kind)`, `iceList` trả loại).
- [X] T004 `server/src/game/link/duel.ts`: chuỗi 3 Boss, chiêu mới, khiên, độc, Đảo Bàn, đếm K.O. theo người.
- [X] T005 `server/src/game/link/bot.ts`: máy dùng Mây Mù thay Bão Xáo, tự Đảo Bàn khi được.
- [X] T006 `server/src/game/game.ts`: log khi mở trận nói rõ 3 Boss.

## Phase 4: Client

- [X] T007 `client/src/link/fx.ts`: vẽ Nữ Hoàng Nhện và Bạo Chúa (canvas, thiết kế riêng), hiệu ứng chiêu mới, Mây Mù, Đảo Bàn.
- [X] T008 `client/src/components/LinkBoard.tsx`: tên/thanh máu/khiên theo Boss, "Boss 2/3", nút Đảo Bàn (đếm ngược), nút Mây Mù, vẽ ô tơ/lửa, màn nghỉ giữa các Boss, bảng điểm cột K.O. theo số Boss hạ.
- [X] T009 `client/src/link/link.css`: kiểu cho khiên, nút Đảo Bàn, trạng thái độc.
- [X] T010 `client/src/components/Lobby.tsx`: luật tóm tắt trong phòng chờ.

## Phase 5: Polish

- [X] T011 `README.md` mục Nối Thú.
- [X] T012 `cd server && npm test` qua hết; `cd client && npx tsc --noEmit`; chơi thử trên server cô lập, chụp màn hình 3 Boss.

## Phase 6: Phản hồi sau khi chơi thử

**Input**: "sao có 1 boss vậy… boss 1 hết máu rồi thì xuất hiện boss 2 => boss 2 chết thì boss 3. Thêm hiệu ứng sấm sét… Nhiều skill đa dạng hơn. Màn đấu boss để bàn pikachu to ra hơn."

- [X] T013 Đồng hồ chung `LINK_RAID_S = 360` cho cả 3 Boss (dừng lúc nghỉ), bỏ thời gian riêng từng Boss; giảm máu (3000 + 900/người, hệ số 0.7 / 1.0 / 1.4). Mô phỏng: 2 máy Thường hạ đủ 3 Boss.
- [X] T014 Chiêu mới: Sét Đánh, Sét Lan (Vua Sấm Sét, 4 chiêu), Hút Sinh Lực (Nhện, 4 chiêu), Gầm Thét gây choáng (Bạo Chúa, 8 chiêu); ô điện giật (khoá loại 3). Test trước, rồi code.
- [X] T015 Hiệu ứng sấm sét: sét đánh xuống bàn, sét lan nhảy qua các ô, sét giáng khắp màn khi Vua Sấm Sét xuất hiện / nổi giận, tia chớp quanh thân Boss, sét toả khi K.O.
- [X] T016 Bàn nối to hơn khi đánh Boss: dải Boss 168 → 112px (điện thoại 110 → 80px), thanh 3 biểu tượng Boss cho biết đang ở Boss mấy.

## Phase 7: Phản hồi lần 2

**Input**: "bỏ rung đánh boss đi chỉ rung khi boss xài skill rung thôi. Tự xoay bài thêm skill cho người chơi hồi chiêu 1p + đổi hình cho dễ nhìn tối màu tí đừng sáng quá và dễ phân biệt."

- [X] T017 Bỏ rung màn hình khi đánh Boss (đòn thường, Siêu Đấm, K.O.), khi bị chiêu người chơi, khi Boss nổi giận và khi sét đánh; chỉ còn rung ở Động Đất, Gầm Thét, Thiên Thạch.
- [X] T018 Đảo Bàn thành chiêu người chơi: hồi chiêu `LINK_SHUFFLE_CD_S = 60` giây (đầu trận cũng chờ 1 phút), không còn điều kiện "bí 2 phút". Test trước rồi code.
- [X] T019 Ô hình nền xanh than tối, mỗi con có quầng + viền + vạch màu riêng (màu quá tối thì tự nâng sáng); bàn nhỏ đối thủ màu dịu hơn.
