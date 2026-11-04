# Quickstart: kiểm chứng Nối Thú Đại Chiến

## Chuẩn bị

- Đã cài dependency: `npm run install:all`.
- **Không** dùng dữ liệu thật. Chạy server test cô lập: copy `server/dist`, `server/package.json` (và symlink `node_modules`) vào thư mục nháp, build client vào `<nháp>/client/dist`, rồi chạy với `ACCOUNT_STORAGE=local PORT=<cổng riêng>`.
- Tắt tiến trình bằng `ps` rồi `kill <pid>`, không dùng `pkill -f`.

## 1. Test tự động

```bash
cd server && npm test        # toàn bộ phải qua, gồm test/link-duel.test.cjs
cd ../client && npx tsc --noEmit
```

`link-duel.test.cjs` phải chứng minh được:

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 1 | Tìm đường: thẳng, chữ L, chữ Z/U, vòng ra mép bàn, 3 lần rẽ | ≤2 lần rẽ thì nối được, 3 lần rẽ thì không |
| 2 | Sinh bàn 200 lần với seed khác nhau | 144 ô, mỗi loại 4 ô, luôn có ít nhất 1 cặp nối được |
| 3 | Cùng seed, 2 người | bàn giống hệt nhau |
| 4 | `match` sai (khác loại / bị chặn / ô băng) | báo lỗi, combo về 0, bàn không đổi |
| 5 | Nối 3 cặp trong 3 giây | combo = 3, điểm 10 + 15 + 20 |
| 6 | Hết nước đi | tự xáo, lại có nước đi |
| 7 | Sấm đầy rồi dùng `skill freeze` | 6 ô của đối thủ bị băng, tự hết sau 8 giây |
| 8 | Dọn sạch Màn 1 | sang `intermission`, rồi `stage2`; người dọn được thưởng điểm và buff 50 Sấm |
| 9 | Màn 2: nối cặp | boss mất ≥25 máu; `super` gây 400 |
| 10 | Boss đổi giai đoạn ở 66% / 33% | có `fx boss rage`; chu kỳ đòn 12 → 9 → 6 giây |
| 11 | Ai đánh boss về 0 máu | người đó có `ko`, trận `ended`, tổng điểm cao hơn thì thắng |
| 12 | Gửi 20 lệnh trong 1 giây | từ lệnh thứ 9 bị báo "Thao tác nhanh quá." |
| 13 | `link:state` gửi cho người chơi | không chứa loại thú trên bàn đối thủ |
| 14 | 1 người + máy (Khó), chạy giả lập 330 giây | máy tự nối, trận kết thúc có kết quả |

## 2. Chơi thử bằng trình duyệt

1. Tạo tài khoản test qua `/api/account/register` trên server cô lập, rồi nạp `meono.identity` vào localStorage.
2. Tạo phòng **Nối Thú Đại Chiến**, chọn máy mức **Dễ**, bấm Bắt đầu.
3. Kiểm tra lần lượt:
   - Bàn 16×9 với thú tự vẽ, ô màu kem (không có hình Pokémon).
   - Chọn 2 ô cùng loại thì thấy đường nối sáng và 2 ô nổ, có "+10". Chọn sai thì ô rung đỏ.
   - Bàn nhỏ của đối thủ cập nhật realtime, máy nối dần dần.
   - Thanh Sấm đầy thì nút ⚡ sáng. Tung Đóng Băng thì bàn nhỏ đối thủ hiện băng.
   - Hết Màn 1 thì có màn "BOSS XUẤT HIỆN" 5 giây.
   - Màn 2: boss to ở trên, có thanh máu. Mỗi cặp nối thì sét bay lên, boss giật lùi và hiện số sát thương. Siêu Đấm làm lóe trắng và rung màn hình.
   - Boss đổi giai đoạn thì có hiệu ứng gầm. Thấy được Mưa Băng, Bóng Tối và Lốc Xáo trên bàn mình.
   - Boss hết máu thì hiện "K.O.!", rồi bảng kết quả với tổng điểm và nút chơi lại.
4. Thử ở khung 1600×900 và 390×844: trên điện thoại bàn xoay thành 9×16, không bị cuộn ngang.
5. Console không có lỗi.
