# Kế hoạch tích hợp Quần đảo Chuông Gió

**Feature** 008-mk-island-campaign · **Ngày** 2026-11-25 · [Đặc tả](spec.md)

## Tóm tắt

Bàn giao năm nền và sơ đồ cùng một chương chơi được gồm năm wave. Luồng Chiến dịch chơi đơn đi từ thẻ game hoặc lobby qua Canvas, dùng nhịp chiến đấu trên server và lưu nguyên tử tiến trình vào tài khoản.

## Bối cảnh kỹ thuật

| Phần | Định hướng |
| --- | --- |
| Bản duyệt | HTML/CSS/JavaScript ngoại tuyến. Pillow xuất sprite và dữ liệu preview từ catalog. |
| Runtime dự kiến | TypeScript, React/Canvas 2D, NestJS/Socket.IO của mode hiện tại. |
| Lưu | `Account.mkCampaign` theo `playerId` và phiên bản catalog. Ghi bằng `DbService.transaction` qua AccountStore đang cấu hình trên server. |
| Kiểm thử | Kiểm định dữ liệu và asset ở pha thiết kế. Unit, tích hợp Socket.IO và playtest combat khi có runtime. |
| Mục tiêu | Giữ server 30 Hz theo baseline, trình duyệt nhắm đến 60 FPS khi kiểm thử. Mốc dự kiến 8–12 phút cho đảo đầu. |
| Giới hạn | Năm nền 16:9, một chương, ba thành viên ra trận, 10–15 frame trên mỗi actor. |

## Constitution Check

Cổng trước và sau thiết kế đối chiếu mục VI/VII của constitution Astral và AGENTS.md. Phần áp dụng xuyên workspace gồm cô lập mode, tiếng Việt, nguồn dữ liệu duy nhất, asset nguyên bản và kiểm chứng truy vết. Các cơ chế turn-based, quần xã và gacha của Astral thuộc mode Astral. Pha hiện tại tạo hồ sơ thiết kế và mô phỏng trình duyệt độc lập. Ghi nhận việc duyệt engine, lưu bền vững và cảm giác chiến đấu là cổng của pha tích hợp.

## Cấu trúc và trình tự

1. **Pha 0 – Nghiên cứu** đọc engine và xác định ranh giới tích hợp trong [research.md](research.md).
2. **Pha 1 – Thiết kế** bàn giao catalog ở `database-mighty-knight-pixel/campaign/`, [mô hình](data-model.md), [hợp đồng](contracts/campaign.md) và [quickstart](quickstart.md).
3. **Pha 2 – Backlog** xếp công việc qua [tasks.md](tasks.md) và kiểm tra truy vết với đặc tả.
4. **Pha tích hợp** dùng hợp đồng ở `shared/src/mk/campaign.ts`, tick/tiến trình ở `server/src/game/mk/`, giao diện trại ở `client/src/components/MkCampaignBoard.tsx` và Canvas ở `client/src/mk/campaign-render.ts`. Nút trong lobby rời phòng rồi mở phiên Chiến dịch cá nhân. Endless và Boss Rush tiếp tục qua luồng phòng.
