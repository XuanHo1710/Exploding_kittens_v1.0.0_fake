# Quyết định thiết kế

| Quyết định | Lý do | Phương án đã cân nhắc |
| --- | --- | --- |
| Chiến dịch là một lựa chọn riêng của Mighty Knight Pixel | `shared/src/mk/types.ts` hiện chỉ định Endless và Boss Rush. `server/src/game/mk/waves.ts` trộn tổ hợp quái và chọn biome theo những chế độ này. Catalog tuyến tính giúp cân bằng và tránh đổi hành vi legacy. | Gắn tuyển tướng trực tiếp vào sau mỗi wave Endless. |
| Camera 640×360 cố định trên đảo đầu | Art và sơ đồ đồng quy một hệ trục. `client/src/mk/render.ts` và `client/src/mk/sprites.ts` đang xử lý sân 1280×360 cùng nền parallax cũ. | Cắt hoặc lặp nền mới theo renderer cũ, làm gãy bố cục ở rìa và lệch biên chân. |
| Mỗi chiến thắng cấp roster cố định, không dùng RNG | Mỗi tướng có lý do xuất hiện và bù vai trò vừa học. Solen là thưởng kết đảo dùng được ở replay. | Gacha hoặc chọn một trong nhiều tướng làm khó cân bằng năm wave cố định. |
| Tiến trình theo người chơi xác thực, Crest biệt lập | Gateway hiện nhận diện `playerId`. `DbService.transaction` hiện làm việc qua AccountStore. Thiết kế cần hợp đồng atomic và quyền sở hữu riêng trước khi chọn backend. Từ chối cược xu cho biến thể Chiến dịch. | Lưu bằng socket ID, lưu tại trình duyệt, hoặc tái sử dụng luồng cược của lobby. |
| Pixel cinematic cho cảnh và tướng, action thời gian thực | Âm sắc fantasy và ánh sáng hậu cảnh của Sandfall là nguồn tham chiếu về mỹ thuật. Nhịp đổi nhân vật, đánh theo đợt và nâng cấp là tham chiếu cơ chế game web theo đội. Bản đồ, silhouette, tên, kỹ năng và bố cục sân dùng thiết kế của Quần đảo Chuông Gió. | Chuyển sang đánh theo lượt, hoặc nhập asset và bố cục của trò chơi tham chiếu. |

Nguồn tham khảo [Sandfall Interactive](https://www.sandfall.co/) và [trang Mighty Knight 2 của Y8](https://www.y8.com/games/mighty_knight_2).
