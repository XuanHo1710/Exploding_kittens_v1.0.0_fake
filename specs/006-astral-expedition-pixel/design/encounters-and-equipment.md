# Địa hình, săn quái và trang bị · Astral Expedition Pixel

Bảy atlas overworld đã cập nhật. Bảng tỷ lệ bên dưới thuộc thiết kế đề xuất. Runtime hiện có banner Anh Hùng bằng Ấn Tinh Tú, đội hình chốt cố định và phần thưởng Ấn hoặc EXP. Banner trang bị có tiền tệ, quá trình bảo hiểm và lịch sử riêng. [Thông số JSON](encounter-loot-rates.json) · [Texture 7 vùng](overworld-texture-detail.png) · [Banner hiện tại](../../../data/expedition/banners.json)

## Texture và khả năng đọc bản đồ

| Vùng | Chi tiết nền và đường đi | Mốc địa hình |
|---|---|---|
| Đồng Cỏ | Cụm hoa vàng và mạch ván so le | Tán sồi, bờ suối |
| Tuyết | Gờ tuyết có bóng, vệt xước trên đường tuyết nén | Tùng tuyết, dải băng |
| Sa Mạc | Vân cát hình cung và vệt đường mòn sẫm | Cột sa thạch, ốc đảo |
| Thủy Cung | Nhánh tảo trên nền xanh, đường gạch chìm | San hô, bọt nước |
| Núi Lửa | Lõi cam trong vết đá nứt, mạch bazan | Obsidian, dung nham |
| Ban Đêm | Nụ hoa tím và vệt đá mờ | Nấm xanh, hồ tối |
| Quang Phổ | Điểm sáng bạc hà và đường ghép pha lê | Vực mây, trụ pha lê |

Các biến thể chi tiết dùng ô 16×16 px xuất 2×. Màu điểm nhấn xuất hiện trên biến thể nền để tránh lặp dày đặc. Mỗi atlas giữ tám ô logic và tám ô hoạt ảnh, tương thích với lớp địa hình và va chạm đang dùng. [Bộ dựng tile](../../../tools/expedition/pixel_worlds.py)

## Điểm săn tùy chọn

Mỗi vùng có hai tọa độ ứng viên trên ô nền, cách trạm nghỉ ít nhất 10 ô Manhattan, cách mốc khác ít nhất 4 ô và có bốn ô tiếp cận liền kề. Hạ boss vùng để mở điểm săn. Một tài khoản chỉ có một hợp đồng hoạt động. Chọn mục tiêu, xem bậc và nguyên tố, rồi xác nhận giao chiến. Đội hình chốt trên tuyến chính lấy từ catalog của vùng.

| Vùng | Thường | Elite | Champion | Quái mạnh trung bình với bảo hiểm | Kiểu chiến đấu |
|---|---:|---:|---:|---:|---|
| Đồng Cỏ | 100% | 0% | 0% | 0% | Vồ rồi hồi thế dài |
| Tuyết | 92% | 8% | 0% | 20,32% | Kỵ binh băng giữ nhịp đều |
| Sa Mạc | 88% | 12% | 0% | 22,40% | Chặn rồi phản đòn |
| Thủy Cung | 82% | 16% | 2% | 25,86% | Luồng nước báo đòn toàn đội |
| Núi Lửa | 79% | 18% | 3% | 27,74% | Giáp vỡ lộ điểm yếu |
| Ban Đêm | 74% | 22% | 4% | 31,11% | Đòn giả có tín hiệu riêng |
| Quang Phổ | 70% | 25% | 5% | 34,00% | Chuyển thế sau chuỗi sao |

- **Bảo hiểm** theo tài khoản và vùng. Sau năm hợp đồng ra quái thường ở vùng có Elite, lần thứ sáu giữ xác suất Champion và chuyển toàn bộ phần thường thành Elite. Chốt kết quả Elite hoặc Champion reset chuỗi. Mỗi hợp đồng chỉ quay một lần. Thua có thể đấu lại đúng quái cũ.
- **Mật độ** có tối đa hai lượt nhận thưởng mỗi vùng mỗi ngày và sáu lượt toàn tài khoản theo UTC. Hợp đồng được khóa bằng một lượt trong giới hạn ngày khi xác nhận bậc. Bỏ hợp đồng mất lượt đó. Sau khi thắng hoặc hủy, điểm săn hồi sau 10 phút. Reconnect khôi phục hợp đồng đã khóa.
- **Độ khó** áp vào quái dẫn đội. Elite dùng HP ×1,35 và ATK ×1,12. Champion dùng HP ×1,60 và ATK ×1,20. Quái phụ giữ chỉ số gốc. Cả hai thêm tối đa một nhịp xử lý có báo trước và giữ DEF, SPD gốc. Mục tiêu thử nghiệm cho đội đã hạ boss vùng là thường 30–75 giây, Elite 60–105 giây và Champion 90–150 giây.

## Vật phẩm và vũ khí sau trận săn

Một trận thắng hợp lệ cấp mảnh vùng chắc chắn, quay một phần thưởng cơ bản và quay độc lập cho vũ khí nguyên chiếc. Các tỷ lệ dưới đây tính trên trận thắng của đúng bậc.

| Bậc | Mảnh chắc chắn | Nguyên liệu rèn ×2 | Mảnh thêm ×1 | Hỗ trợ ×1 | Vũ khí R / SR / SSR nguyên chiếc |
|---|---:|---:|---:|---:|---|
| Thường | 1 | 73% | 7% | 20% | 1% / 0% / 0% |
| Elite | 2 | 55% | 30% | 15% | 5% / 1% / 0% |
| Champion | 3 | 40% | 50% | 10% | 10% / 4,5% / 0,5% |

Mỗi vùng mở công thức chọn vũ khí SR với 16 mảnh cùng vùng. Quang Phổ mở công thức SSR với 40 mảnh sau khi hạ boss cuối. Nếu mọi kết quả đều là bậc thường và chơi đủ lượt, mảnh chắc chắn đạt mốc sau 8 hoặc 20 ngày săn tương ứng. Với tỷ lệ Quang Phổ gồm bảo hiểm, vũ khí SR hoặc SSR nguyên chiếc chỉ rơi trung bình 0,54% mỗi trận thắng trong dài hạn nếu mọi hợp đồng đều thắng và nhận thưởng. Mảnh cấp một đường đi có thể dự tính trước.

## Banner Lò Rèn Tinh Tú

Mỗi lượt dùng một **Giấy Rèn**. Gói 10 dùng 10 vé, giải quyết tuần tự để áp dụng đúng từng lần bảo hiểm. Lần hạ mỗi boss vùng đầu tiên cấp một vé. Nguồn lặp đề xuất tối đa 8 vé/tuần qua hai mốc săn 2 và 5 hợp đồng, mỗi mốc 2 vé, và hai thử thách boss tự chọn, mỗi thử thách 2 vé.

| Kết quả cơ bản | Tỷ lệ | Nội dung |
|---|---:|---|
| Gói nguyên liệu | 45% | 4 vật liệu rèn theo tier đã mở lúc mở banner |
| Gói hỗ trợ | 25% | 2 tinh thể kỹ năng hoặc vật tư hỗ trợ theo danh mục công khai |
| Vũ khí R | 18% | Trang bị khởi hành, đạt được qua chế tác |
| Vũ khí SR | 10% | Nội tại theo vai trò, ví dụ tăng Break ở đòn chuẩn nhịp đầu |
| Vũ khí SSR | 2% | Nội tại tình huống trong cùng ngân sách sức mạnh với SR |

1. Tính SSR trước. Từ lượt 45 kể từ SSR gần nhất, tăng 4 điểm phần trăm mỗi lượt, trừ từ hai gói theo tỷ lệ 45:25. Lượt 45 là 6%, lượt 50 là 26%, lượt 59 là 62% và lượt 60 là 100%. R và SR giữ 18% và 10% ở lượt thường trước hard pity.
2. Sau bốn lượt chỉ có gói, lượt tiếp theo bảo đảm vũ khí. Quay SSR trước, sau đó chia xác suất còn lại cho R và SR theo 18:10. Mọi vũ khí reset chuỗi gói. SSR reset bảo hiểm SSR.
3. Trước chu kỳ, chọn một SSR mong muốn. Khi rơi SSR, mục tiêu chiếm 50% và phần còn lại chia đều giữa các SSR khác. Nếu trượt, SSR tiếp theo là món đã chọn. Giữ mục tiêu đến khi nhận đúng. Danh mục phải có ít nhất hai SSR để áp dụng chia 50:50.
4. Vũ khí trùng đổi 1/4/12 mảnh lò rèn theo R/SR/SSR. Mảnh lò rèn dùng đổi nguyên liệu và có sổ riêng với mảnh vùng. Nội tại trang bị kích hoạt tối đa một lần mỗi lượt. Dùng chênh lệch thời gian hạ boss dưới 8% giữa bộ chế tác và SSR cùng cấp làm ngưỡng thử nghiệm ở kèo trung tính.

### Danh mục thử cân bằng ban đầu

Mỗi bậc có bốn vũ khí, một cho mỗi vai trò. Chia đều trong bậc trước bảo hiểm mục tiêu. Xem bảng như bốn dòng thử nghiệm để chọn chỉ số khi dựng prototype.

| Vai trò | R | SR dùng theo điều kiện | SSR dùng theo điều kiện |
|---|---|---|---|
| Vanguard | `iron-roundshield` · khiên nhập môn | `frost-ward` · +8% hiệu lực khiên sau khi Đỡ Phản Đòn | `winter-oath` · nhận khiên bằng 4% HP tối đa sau khi Đỡ Phản Đòn hai nhịp trong cùng chuỗi |
| Striker | `trail-rapier` · kiếm mảnh nhập môn | `dune-edge` · +6% sát thương lên địch đang Phá Thế | `ember-rapier` · +8% sát thương đòn công kích đầu tiên vào địch Phá Thế |
| Breaker | `stone-maul` · chùy nhập môn | `basalt-hammer` · +10% điểm Phá Thế lên mục tiêu còn khiên | `rift-splitter` · +12% điểm Phá Thế ở đòn đúng nhịp đầu tiên lên mục tiêu còn khiên |
| Luminary | `reed-focus` · pháp khí nhập môn | `tide-lantern` · +8% hiệu lực hồi phục đồng đội dưới 35% HP | `aurora-lantern` · khi cứu đồng đội dưới 25% HP, nhận khiên bằng 4% HP tối đa của đồng đội đó |

Ở lượt cơ bản, mỗi món R có 4,5% và mỗi món SR có 2,5%. Với bốn món SSR và mục tiêu đã đặt, món đã chọn có 1% và mỗi món còn lại có khoảng 0,3333%. Tỷ lệ theo món luôn lấy từ xác suất bậc ở lượt thực tế. Với SSR kế được bảo hiểm mục tiêu, toàn bộ xác suất SSR của lượt thuộc món đang khóa. Trong lượt săn, sau khi ra bậc vũ khí, chia đều bốn vũ khí cùng bậc. Rèn bằng mảnh cho phép chọn món. Đo các nội tại trên cùng bộ chỉ số trước khi điều chỉnh từng giá trị.

## Số liệu và nghiệm thu

Đã chạy **200.000 chu kỳ tới SSR đầu tiên** bằng Python PRNG seed 6032026. Trung bình **31,724 lượt**, trung vị **35**, P90 **51**, P95 **53**, P99 **56**. Có **107 chu kỳ** tới lượt 60. Tỷ trọng trên tổng lượt mô phỏng là **40,584% nguyên liệu, 22,536% hỗ trợ, 21,671% R, 12,057% SR và 3,152% SSR**. Với 4 vé/tuần, giá trị trung bình là khoảng 8 tuần nếu chỉ tính vé lặp. Tỷ lệ quái mạnh có bảo hiểm lấy nghịch đảo kỳ vọng chu kỳ, tổng từ i=0 đến 5 của (1-p)^i với p là xác suất Elite hoặc Champion cơ bản.

- **Tiled** — Điểm săn là vùng tương tác có thể tiếp cận sau khi mở chốt, dùng biểu tượng trực quan theo bậc. Chạm mốc không tự bắt đầu trận. Hạ boss và hồi sinh vẫn dùng cờ hiện tại.
- **Battle** — Lưu huntId, mapId, siteId, đội hình, bậc và phiên bản tỷ lệ trước khi mở trận. Dùng huntId làm khóa cấp thưởng một lần. Bảng thưởng phải đọc lại được sau mất kết nối và retry.
- **Trang bị** — Lưu itemDefinitionId, nguồn nhận, tier, điều kiện tương thích vai trò và lịch sử mở khóa. Đảm bảo đội hình dùng được vũ khí chế tác trước khi cân bằng độ khó theo nội tại.
- **Gacha** — UI công khai pool theo món, tỷ lệ lượt kế, cả hai bộ đếm và lịch sử. Server khóa theo tài khoản và ghi trừ vé, quay, trao vật phẩm, cập nhật pity trong một giao dịch. operationId định danh retry và trả lại giao dịch cũ.
- **Playtest** — Ghi tỷ lệ thắng theo bậc, thời gian trận, tỷ lệ bỏ săn, lượt tới SSR, tổng mảnh và thời gian có vũ khí đầu. Ngưỡng cảnh báo đề xuất là quái thường dưới 85% thắng, Elite dưới 70% hoặc Champion dưới 55% trong nhóm đã hạ boss vùng. Phân tích riêng lượt được bảo hiểm và lượt cơ bản. Nhịp kiếm vé, sức mạnh vũ khí và thời lượng trận cần đo khi có prototype.
