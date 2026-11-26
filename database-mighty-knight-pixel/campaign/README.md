# Quần đảo Chuông Gió

[Mở trang duyệt ngoại tuyến](index.html) · [Catalog](campaign.json) · [Mỹ thuật](art-direction.md) · [Đặc tả](../../specs/008-mk-island-campaign/spec.md)

Đảo Đồng cỏ gồm năm wave liên tiếp tại Bến Gió Đầu Mùa. Đánh tại chỗ theo chiều ngang và chiều sâu, đổi tướng giữa trận và ghé trại giữa các wave. Chương đầu theo chân Arden đi đánh thức các chuông gió bị Hươu Chuông Đá khóa lại. Sau chương mở đường sang Sa mạc.

| Đảo | Bản đồ | Địa hình |
| --- | --- | --- |
| Đồng cỏ | [Bến Gió Đầu Mùa](maps/01-grasslands.png) | Sân đá ven biển giữa cổ thụ và cổng chuông |
| Sa mạc | [Đồng Hồ Cát](maps/02-desert.png) | Bậc đá, đồng hồ nước, gió cát đổi làn |
| Ban đêm | [Đài Vọng Trăng](maps/03-night.png) | Lối đá phiến dưới đài thiên văn, đèn báo cửa |
| Dưới nước | [Thềm Ngọc Triều](maps/04-underwater.png) | Đài kinh tuyến chìm, sân đá vôi, dòng chảy theo nhịp |
| Núi lửa | [Lò Rèn Tro](maps/05-volcano.png) | Sàn bazan, lò cổ và khe nhiệt có báo đòn |

## Vòng chơi đảo đầu

`Chọn đội → Giới thiệu wave → Dọn các nhóm quái → Thắng → Tuyển tướng → Nâng cấp → Wave kế`

Nếu cả đội gục, quay lại trại và thử lại đúng wave. Các lần đầu thắng luôn mở thêm một tướng. Replay giúp thử đội hình đã nâng và nhận bảng kết quả, thưởng một lần được giữ ở checkpoint cũ. Sau wave 5, người chơi xem kết đảo, chiêu mộ Solen và mở tuyến đường đến Sa mạc. Bốn đảo sau đang ở pha bản vẽ.

| Wave | Quái mới | Dạy người chơi | Tuyển tướng |
| --- | --- | --- | --- |
| 1 · Sân Gió Mở | Mầm Lau | Đi hai trục, đổi làn tránh đòn lao, đánh thường ba nhịp | Linnet |
| 2 · Gai Trên Bờ | Chuồn Gai | Nhìn cánh khép, né sau khóa làn, thử tướng tầm xa | Vesper |
| 3 · Lá Chắn Mùn | Khiên Vỏ | Đánh vào sườn, phá thế và đổi đồng đội | Brann |
| 4 · Chuông Trong Cỏ | Bện Chuông, Lưng Rêu | Xử lý quái tụ lực và húc nhanh cùng trận | Maëlle |
| 5 · Hươu Chuông Đá | Hươu Chuông Đá | Vượt ba pha, duy trì làn thoát và dùng Break đúng lúc | Solen |

### Nhịp trận

- WASD hoặc phím mũi tên đi hai trục, J đánh thường, K dùng kỹ năng, L đỡ, Shift né, Space đổi tướng đang sống, R dùng tuyệt kỹ. Gợi ý từng phím xuất hiện khi tính năng có ý nghĩa. Với một người, các tướng còn lại đi theo AI bảo vệ, đánh cơ bản và ưu tiên thoát vùng báo đòn. Chỉ tướng do người chơi điều khiển dùng tuyệt kỹ.
- Đánh thường ba nhịp theo action timeline. Nhập đệm tối đa một đòn trong 120 ms cuối recovery. Dash sử dụng 100 ms miễn đòn trong đoạn giữa, cooldown 900 ms. Đỡ giảm 55% sát thương đỡ được, đỡ đúng 150 ms đầu gây 16 Break. Va chạm mỗi tick dùng hình dáng và active window phía server. Một đòn chỉ hit một lần trừ khi catalog định rõ nhiều nhịp.
- Nhịp sát thương gợi ý `max(1, round(ATK × ratio × guardMultiplier))`; `guardMultiplier` là 0.45 khi hero đỡ thường, 0.40 cho Khiên Vỏ bị đánh chính diện khi giơ khiên, 1 trong trường hợp còn lại. Đỡ hoàn hảo triệt hit đỡ được. Break đạt 100 khiến trùm khựng 2.2 giây, reset Break rồi khóa nhận Break mới đến hết trạng thái khựng.
- Tuyệt kỹ tốn 100 Fury. Đòn thường trúng cho +8 Fury, kỹ năng trúng +12 mỗi cast, đỡ đúng +15. Fury tách theo tướng, làm mới ở đầu wave. Kỹ năng chủ động tính cooldown từ lúc thực thi, hợp đồng thời gian và tầm nằm trong catalog.
- Wave phát nhóm theo gate có thứ tự và hai phía cửa. Trong wave 1–4, gate chờ điều kiện của nhóm liền trước và room tối đa trước khi spawn. Vòng báo cửa xuất hiện trước 550 ms, quái đặt chân trong làn và chỉ gây sát thương sau windup đầu tiên. Pha boss latch qua mốc giảm HP, dọn hết quân đã ra và trùm mới tính thắng.
- Khi vào wave, cả đội mới đầy HP và nhận snapshot nâng cấp từ trại. Khi tướng điều khiển gục, chuyển sang đồng đội còn sống. Khi mất kết nối, phục hồi trại từ checkpoint của người chơi.

### Nâng cấp và lựa chọn đội

Wave 1 cấp 25 Crest, đủ mở một nhánh cấp 1 ngay sau khi tuyển Linnet. Tổng ngân sách đảo là 235 Crest. Ba nấc có giá 20/35/55 Crest mỗi nhánh, tương ứng +15/+30/+45 HP tối đa, +3/+6/+9 ATK, hoặc −300/−600/−900 ms hồi kỹ năng. Các mức là tổng bonus của riêng nhánh. Tối đa ba tướng đi cùng, đổi tướng điều khiển ở trại hoặc trong trận.

Mỗi tướng ra trận nhận XP khi thắng. Đánh lại cấp 35% XP của lần thắng đầu, làm tròn lên. Mỗi cấp mới cộng sẵn 3 HP và 1 ATK, kèm hai điểm chỉ số và một điểm kỹ năng. Dùng điểm chỉ số ở trại để thêm 8 HP, 2 ATK hoặc 2 DEF mỗi điểm. Cấp tối đa 99. Kỹ năng đầu mở ở cấp 2 và tuyệt kỹ ở cấp 4, mỗi kỹ năng khởi đầu hạng 1. Mỗi hạng sau cần thêm ba cấp tướng và một điểm kỹ năng, tối đa hạng 5. Hạng nâng cộng 20% hệ số sát thương mỗi bậc so với hạng 1.

### Trùm Hươu Chuông Đá

Ở 100% HP, pha Vành Ngà dạy đi ra hông khi gạc quét. Tại 65%, Nứt Đá khóa hai dải liên tiếp và gọi hai Mầm Lau ở cửa đông. Tại 30%, Chuông Cuối để khe thoát trên vòng và gọi hai Chuồn Gai ở cửa tây. Đổi pha có hồi tối thiểu 400 ms, kết thúc cast cũ trước khi sang hành vi mới và không chồng hai telegraph trùm. Đòn đã khóa dùng điểm ngắm đã chốt, bán kính và cửa thoát được ghi trước hit. Chi tiết ba timing và hệ số ở catalog.

## Tình trạng bàn giao

Trang duyệt vẽ sân, sơ đồ, tư thế và VFX mẫu. Bản chiến đấu thời gian thực mở tại Arena Hub hoặc lobby Mighty Knight. Tiến trình của năm wave lưu theo tài khoản qua server. Xem [cách chơi và kiểm thử](../../specs/008-mk-island-campaign/quickstart.md).
