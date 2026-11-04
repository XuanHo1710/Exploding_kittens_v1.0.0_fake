# Research: Nối Thú Đại Chiến

Các điểm chưa rõ trong yêu cầu, kèm quyết định đã chọn.

## R1. Hình ô: dùng Pokémon như ảnh mẫu?

- **Decision**: Không dùng. Tự vẽ **36 con thú hoạt hình riêng** bằng canvas, mỗi con có màu chủ đạo dễ phân biệt. Ví dụ: Chuột Điện, Mèo Lửa, Ếch Lá, Cá Nước, Cú Đêm, Rùa Đá, Bướm Gió, Gấu Băng … Ô có nền kem, viền nâu và bóng nổi, giống cảm giác của ảnh mẫu.
- **Rationale**: Nhân vật, hình và tên Pokémon thuộc bản quyền. Chữ "Pikachu" người Việt hay dùng để gọi cả thể loại nối hình, nên giữ đúng thể loại và lối chơi là đủ. Vẽ bằng code thì không cần file ảnh, phóng to nhỏ vẫn nét, và cùng cách với kiến bên Đế Chế Kiến.
- **Alternatives considered**:
  - Dùng emoji động vật: nhanh làm, nhưng mỗi máy hiện một kiểu và khó đủ 36 con dễ phân biệt.
  - Dùng ảnh sprite tải về: vướng bản quyền và tốn thời gian làm asset.

> **Cập nhật (2026-11-04, theo phản hồi "khó phân biệt quá"):** bộ thú vẽ tay nhìn na ná nhau (cùng thân tròn, cùng mặt).
> Đã đổi sang **36 emoji con vật của hệ thống** (chó, mèo, gấu trúc, voi, cua, cá mập…), chọn sao cho không có 2 con cùng dáng / cùng màu,
> thêm vệt màu riêng ở đáy ô. Máy không có font emoji màu thì tự quay về bộ vẽ tay. Emoji là ký tự Unicode, không phải nhân vật có bản quyền.

## R2. Kích thước bàn và luật nối

- **Decision**:
  - Bàn **16 cột × 9 hàng = 144 ô**, tức 72 cặp, giống ảnh mẫu.
  - Có 36 loại thú, mỗi loại 4 ô (2 cặp). Màn 2 dùng 36 loại × 4 ô trên bàn mới.
  - Nối khi 2 ô cùng loại và có đường đi qua ô trống, **gấp khúc tối đa 2 lần**. Đường được đi ra ngoài mép bàn qua viền 1 ô.
- **Rationale**: Đây là luật chuẩn của thể loại này, người chơi Việt đã quen.
- **Alternatives considered**:
  - Bàn 12×7: chơi nhanh hơn nhưng kém "đã".
  - Cho gấp 3 lần: dễ quá.

## R3. Thuật toán tìm đường

- **Decision**: Lưới có viền, kích thước (W+2)×(H+2). Chạy **BFS 0-1 trên trạng thái (ô, hướng)**, chi phí là số lần rẽ. Bỏ những nhánh có quá 2 lần rẽ. Kết quả trả về danh sách điểm gấp khúc để client vẽ đường sáng.
- **Rationale**: Luôn đúng, chạy dưới 1 ms cho 198 ô. Cùng hàm này dùng được cho gợi ý, cho máy chơi và để kiểm tra bàn còn nước đi hay không.
- **Alternatives considered**: Cách quét "chữ L, chữ U": nhanh nhưng dễ sót trường hợp khi tự code.

## R4. Bàn luôn giải được và xáo bàn

- **Decision**:
  - Sinh bàn bằng cách **xếp ngược**: lần lượt đặt từng cặp vào 2 ô trống nối được với nhau theo luật. Nếu kẹt thì làm lại, tối đa 50 lần; quá 50 lần thì xếp ngẫu nhiên rồi dựa vào xáo bàn.
  - Hết nước đi thì **tự xáo** các ô còn lại, đến khi có ít nhất 1 cặp nối được.
  - Cả hai người dùng **cùng seed**, nên bàn xuất phát giống hệt nhau và công bằng.
- **Rationale**: Không ai kẹt vì bàn xấu, và đua tốc độ trên cùng một đề bài.
- **Alternatives considered**: Xếp ngẫu nhiên hoàn toàn rồi trông vào xáo bàn: có lúc kẹt nhiều, cảm giác bất công.

> **Cập nhật khi làm (2026-11-04):** đo thực tế thì cách xếp ngược ngẫu nhiên gần như luôn kẹt ở cuối (bàn kín, ô trống còn lại không nối được),
> kể cả khi lấp từ giữa ra ngoài. Đã đổi sang: **xếp ngẫu nhiên theo seed rồi tự giải thử bằng gợi ý**, lấy bàn đầu tiên dọn sạch được
> (khoảng 1/3 bàn đạt, trung bình ~4 lần thử, ~37 ms/bàn). Vẫn bảo đảm bàn luôn giải được và cùng seed cho cùng bàn.

## R5. Realtime: gửi trạng thái thế nào

- **Decision**:
  - Mỗi khi trạng thái của một trận đổi (có người nối ô, boss ra đòn, đồng hồ nhảy giây), server gửi sự kiện **`link:state` riêng cho từng người**. Gói gồm bàn của mình đầy đủ, bàn đối thủ thu gọn (để vẽ bàn nhỏ), điểm, Sấm, boss và danh sách hiệu ứng mới.
  - Các lần đổi trong 50 ms được gom lại thành một lần gửi.
  - Nhịp boss và đồng hồ chạy bằng `setInterval` 250 ms bên trong `LinkDuel`.
- **Rationale**: Game nối hình chạy theo sự kiện, không cần 10 khung/giây. Một bàn 144 ô là khoảng 300 byte, rất nhẹ. Cách này cùng kiểu đã chạy tốt với `ants:frame`.
- **Alternatives considered**:
  - Nhét vào `RoomView` chung: mỗi lần nối lại dựng lại view cả phòng, phí công.
  - Để client tự kiểm luật: dễ bị ăn gian.

## R6. Luật Màn 1 – Đua Nối

- **Decision**:
  - Màn 1 dài **150 giây**.
  - Mỗi cặp được **10 điểm**. **Combo** là nối cặp tiếp theo trong vòng 3 giây; combo thứ n được 10 + 5×min(n,6) điểm.
  - Mỗi cặp nạp **Sấm** +8, combo được nạp thêm. Đầy 100 thì bấm **⚡ Tung chiêu** để chọn 1 trong 2 chiêu:
    - **Đóng Băng**: 6 ô ngẫu nhiên của đối thủ bị băng 8 giây, không chọn được.
    - **Bão Xáo**: xáo toàn bộ bàn đối thủ.
  - Màn kết thúc khi một người dọn sạch bàn (thưởng **+300** và **+20 điểm mỗi giây còn lại**) hoặc hết giờ.
  - Người thắng Màn 1 được **buff "Khí Thế"**: Màn 2 bắt đầu với 50 Sấm.
- **Rationale**: Có tương tác qua lại giữa hai người, đúng chất "solo realtime", nhưng không ức chế quá.
- **Alternatives considered**:
  - Không có chiêu: thành ra hai người chơi song song, không đấu nhau.
  - Chiêu khóa bàn đối thủ hoàn toàn: gây ức chế.

## R7. Luật Màn 2 – Đấm Boss (ngầu lòi)

- **Decision**:
  - Boss **Vua Sấm Sét** (thiết kế riêng: thú khổng lồ có sừng tia chớp) có **4000 máu**. Màn dài **180 giây**. Mỗi người có bàn mới, cùng seed.
  - Sát thương:
    - mỗi cặp: **25**;
    - combo: × (1 + 0,15×min(n,6));
    - cặp cách xa nhau (đường dài trên 10 ô): +20, gọi là "Cú Đấm Xa";
    - trong màn 2, Sấm đầy thì bấm **⚡ Siêu Đấm**: 400 sát thương kèm hiệu ứng toàn màn.
  - Boss có 3 giai đoạn theo máu (100–66%, 66–33%, 33–0%). Mỗi lần sang giai đoạn mới boss **nổi giận**: hiệu ứng gầm và đổi màu. Sau đó cứ 12 / 9 / 6 giây boss ra đòn lên **bàn của cả hai người**, lần lượt theo vòng:
    - Mưa Băng: băng 4 ô, 6 giây;
    - Bóng Tối: che kín bàn 3 giây, chỉ thấy viền ô;
    - Lốc Xáo: xáo bàn.
  - Người đánh phát cuối được thưởng **KO +500**. Dọn sạch bàn trong Màn 2 thì nhận bàn mới, để boss vẫn còn bị đánh tiếp.
  - Hết giờ mà boss còn sống: không ai được thưởng KO, vẫn tính điểm như bình thường.
- **Rationale**: Hai người vừa hợp sức đánh boss, vừa đua nhau xem ai gây nhiều sát thương hơn. Như vậy vẫn là solo, nhưng có trận đánh boss hoành tráng.
- **Alternatives considered**:
  - Mỗi người một boss riêng: không có màn tranh cú kết liễu.
  - Boss đánh trừ máu người chơi: thêm một hệ máu nữa làm rối.

## R8. Thắng thua và cược

- **Decision**:
  - **Điểm chung cuộc** = điểm Màn 1 + sát thương Màn 2 + thưởng KO. Ai cao hơn thắng, nhận toàn bộ tiền cược theo cơ chế payout sẵn có.
  - Hòa điểm thì chia đôi. Nếu thua máy hoặc máy thắng thì hoàn cược cho người, giống luật hiện có ở Đế Chế Kiến.
  - Người rời trận hoặc bỏ cuộc thì bị xử thua.
- **Rationale**: Thống nhất với các chế độ khác trong repo.

## R9. Máy làm đối thủ

- **Decision**: Máy dùng chung hàm tìm cặp nối được.

| Độ khó | Mỗi lần nối cách nhau | Tỉ lệ "nghĩ lâu" | Dùng chiêu |
|---|---|---|---|
| Dễ | 2,8–4,0 s | 20% | ngẫu nhiên |
| Thường | 1,6–2,6 s | 10% | khi đầy |
| Khó | 0,9–1,5 s | 5% | khi đối thủ đang combo |

- **Rationale**: Đủ để luyện tập, và máy không "đọc" được nước nào mà người không thấy.

## R10. Điện thoại

- **Decision**:
  - Màn dọc thì **xoay bàn thành 9 cột × 16 hàng** khi vẽ, server không biết gì về việc này.
  - Ô tối thiểu 38 px. Boss thu nhỏ thành dải trên cùng, bàn đối thủ thành bàn nhỏ ở góc.
  - Chạm 2 ô để nối; chạm lại ô đang chọn để bỏ chọn.
- **Rationale**: Bàn 16×9 nằm ngang không vừa màn điện thoại dọc, xoay lại thì vừa mà không phải đổi luật.

## R11. Chống ăn gian và spam

- **Decision**:
  - Server nhận lệnh `match {a, b}` và tự kiểm tra lại đường nối.
  - Giới hạn **8 lệnh mỗi giây** cho mỗi người, theo kiểu xô token giống Đế Chế Kiến.
  - Nối sai không bị phạt điểm, chỉ ngắt combo.
  - Gợi ý có thời gian hồi 15 giây và trừ 5 điểm.
- **Rationale**: Không cho bot ngoài tự nối nhanh hơn người, mà người bấm nhầm cũng không bị phạt nặng.
