# Đặc tả Chiến dịch Quần đảo Chuông Gió

**Ngày** 2026-11-25 · **Trạng thái** Tích hợp chương đầu · **Feature** 008-mk-island-campaign

## Tình huống người dùng và nghiệm thu

### US1 · Duyệt năm đảo (P1)

Người duyệt mở hồ sơ mỹ thuật ngoại tuyến, chọn từng đảo để xem sân và bật sơ đồ đặt chân. Đảo Đồng cỏ có năm wave. Bốn đảo còn lại có sân và ý tưởng riêng.

1. Khi mở trang review từ đĩa, bản đồ đầu tiên là Đồng cỏ và bốn lựa chọn tiếp theo theo thứ tự Sa mạc, Ban đêm, Dưới nước, Núi lửa.
2. Khi bật sơ đồ, vùng di chuyển chính và mọi điểm xuất hiện trong vùng đều hiện đúng theo bản đồ đã chọn.
3. Khi chọn đảo ngoài Đồng cỏ, trang hiển thị mô tả địa hình tương ứng và đánh dấu phạm vi bản vẽ.

### US2 · Thắng wave, chiêu mộ và nâng tướng (P1)

Trong runtime dự kiến, người chơi dùng Arden, làm quen nhịp chiến đấu, rồi đổi đội khi tuyển được tướng. Trang review mô phỏng các màn kết quả và nâng cấp bằng thao tác thủ công.

1. Từ hồ sơ mới, wave 1 chỉ có Arden trong danh sách. Clear lần đầu nhận đúng Crest và Linnet, cho phép nâng cấp rồi đánh wave 2.
2. Mỗi wave từ 1 đến 5 cấp đúng một người mới khi clear lần đầu. Replay và thử lại kết quả cũ giữ số Crest và roster hiện tại.
3. Khi hết cả đội, game mở nút thử lại wave. Chi tiêu ở trại trước đó vẫn có hiệu lực. Wave thắng mới mở sau khi xử lý kết quả hợp lệ.
4. Khi đủ Crest và nhánh chưa đạt 3, chọn nâng cấp một tướng đang sở hữu cập nhật số Crest và cấp nhánh đồng thời.

### US3 · Nhận mặt quái và đọc ba pha trùm (P2)

Người duyệt xem từng pose và mẫu VFX trong trang review. Người chơi runtime dự kiến nhận diện quái mới khi chúng bước vào sân và phản ứng trước telegraph.

1. Mỗi wave có ít nhất một đối thủ mới. Pha và ngưỡng HP trùm khớp dữ liệu chuẩn.
2. Khi bật xem chuyển động, mỗi actor có clip xem thử và bảng frame. Chế độ giảm chuyển động ưu tiên xem từng pose tĩnh và cho phép bật phát thủ công.
3. Runtime tương lai phải cho thấy vùng báo đòn trước hit, cho phép thoát bằng đổi làn, đỡ hoặc Break tùy từng đòn.

## Trường hợp biên

- Nếu trùm chết trước khi đợt quân phụ đã đủ điều kiện ra sân, hủy các đợt phụ còn chờ và tiếp tục dọn quân còn sống. Trùm chết cùng lúc cả đội gục được xử lý là thất bại.
- Hai lệnh nâng cấp mang cùng revision chỉ áp dụng một lần. Phiên bản tiến trình cũ trả lỗi xung đột và cho phép tải lại trại.
- Khi hồi phục phiên giữa wave, trở về trại với checkpoint đầu wave. Sau khi commit kết quả, trại lấy tiến trình mới nhất dù thông báo thắng có bị mất.

## Yêu cầu

- **FR-001** Có năm hình nền và năm sơ đồ sân theo đúng thứ tự US1, tọa độ chuẩn theo khung 640×360.
- **FR-002** Đảo Đồng cỏ có năm wave, với danh sách quái, điểm vào, điều kiện sinh, giới hạn đồng thời, mục tiêu và thưởng được xác định trước.
- **FR-003** Arden là tướng đầu. Mỗi lần thắng đầu của wave 1–5 mở một tướng khác nhau. Tối đa ba tướng ra trận. Người chơi điều khiển một tướng và có thể đổi sang thành viên còn sống.
- **FR-004** Tại trại, tướng đã tuyển có ba nhánh nâng cấp, mỗi nhánh ba cấp. Thưởng tích lũy qua wave, giá nâng và hiệu lực đọc được trước khi chấp nhận.
- **FR-005** Một bộ sprite gốc 10–15 frame cho từng tướng, quái và trùm. Sprite đi cùng bảng pose, timing và VFX tách riêng. Tín hiệu báo đòn của địch đứng ở lớp đọc rõ.
- **FR-006** Server xác thực kết quả, lệnh nâng, ownership và checkpoint. Ràng buộc duy nhất theo wave ngăn lấy lại thưởng lần đầu. Mất kết nối phục hồi trại và kết quả đã commit.
- **FR-007** Giữ hợp đồng của Endless và Boss Rush khi tích hợp, dành quyền chọn mode Chiến dịch cho cấu hình mới.
- **FR-008** Bản bàn giao thiết kế bao gồm trang review bản đồ, storyboard wave và bảng tướng tương tác cục bộ.
- **FR-009** Luồng tích hợp cho phép mở Chiến dịch chơi đơn từ thẻ hoặc lobby Mighty Knight, chọn tối đa ba tướng, đánh thật năm wave và trở về trại sau mỗi trận.
- **FR-010** Mỗi tướng có XP, cấp và điểm nâng riêng. Cấp tối đa là 99. Mỗi cấp mới cấp hai điểm chỉ số và một điểm kỹ năng. Khi đạt cấp 2 hoặc cấp 4, tướng lần lượt mở kỹ năng chủ động và tuyệt kỹ ở hạng 1.
- **FR-011** Người chơi phân điểm vào sinh lực, sức đánh hoặc phòng thủ và nâng từng kỹ năng tới hạng 5 tại trại. Server xác thực tướng, cấp yêu cầu, số điểm và revision trước khi ghi thay đổi vào tài khoản.
- **FR-012** Đội có mặt khi thắng nhận XP, kể cả khi chơi lại. Crest và tuyển tướng chỉ cấp ở lần thắng đầu. Sau khi tải lại, roster, XP, cấp, điểm, hạng kỹ năng và mốc wave được phục hồi.

## Thực thể chính

IslandMap, Wave, SpawnGroup, Hero, Enemy, BossPhase, UpgradeBranch, CampaignProgress, WaveClearReceipt.

## Chỉ số nghiệm thu

- **SC-001** 5/5 nền và sơ đồ mở ngoại tuyến, mỗi vùng chân hợp lệ và mỗi điểm spawn nằm trong vùng.
- **SC-002** Roster tăng từ 1 đến 6 qua 5 lần clear đầu, tổng Crest 235 trước nâng cấp. Thắng lại hoặc thất bại tăng 0.
- **SC-003** 12 sprite strip đủ số frame và alpha nhị phân. Mỗi VFX trong sáu dải có 8 frame. Toàn bộ frame nằm trong biên an toàn.
- **SC-004** Boss có ba pha tại 100/65/30% HP và có cửa phản ứng hoặc cách ngắt đòn ghi rõ cho từng pha. Nghiệm thu runtime tương lai kiểm tra đủ 3 chuyển trạng thái và cùng một đòn không trúng lặp ngoài quy tắc của đòn.

## Giả định thiết kế và làm rõ

- Đảo đầu gồm năm wave trong cùng sân Đồng cỏ. Bốn bản đồ tiếp theo là bốn đảo dành cho những chương sau. Cách hiểu này thực hiện cả yêu cầu vẽ đủ năm bản đồ và giới hạn thử gameplay ở một đảo.
- Chơi một người điều khiển, đồng đội AI, tối đa ba tướng. Solen tuyển ở màn kết đảo, có thể chơi khi quay lại wave đã mở.
- Thưởng lần đầu theo tài khoản và phiên bản chương, đánh lại để thử đội hình. Chính sách lưu tiến trình là thiết kế đề xuất, cần có kho lưu bền vững trước khi phát hành.
- Khung hình review đứng yên theo thiết kế sân nhỏ. Chiến dịch sau này chọn arena config riêng và dùng chung bộ kết xuất pixel 2.5D.
- Các lựa chọn trên là giả định có thể điều chỉnh của thiết kế.
