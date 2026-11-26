# Hợp đồng runtime Chiến dịch

| Lệnh hoặc thông báo | Trường | Điều kiện |
| --- | --- | --- |
| `mk:campaign` với `t: load` | Trả `progress`, có `frame` nếu đang đánh | Đọc theo danh tính server đã xác thực, mặc định seed Arden. |
| `mk:campaign` với `t: deploy` | `revision`, `wave`, `roster`, `controlled` | Wave phải trong 1…min(highestCleared + 1, 5) và 1–3 tướng khác nhau đã sở hữu. |
| `mk:campaign` với `t: upgrade` | `revision`, `hero`, `kind`, `key` | Chỉ trong trại. Kiểm tra cấp, rank, điểm và quyền sở hữu. Hai lệnh cùng revision chỉ áp dụng một lần. |
| `mk:campaign` với `t: abandon` | `attemptId` | Về trại, giữ checkpoint đã xác nhận. |
| `mk:campaign:input` | `attemptId`, `seq`, `x`, `y`, `buttons` | Input di chuyển và thao tác. Đổi tướng theo vòng trong đội còn sống, giữ riêng HP và cooldown. |
| `mk:campaign:frame` | `CampaignFrame` | Snapshot 15 Hz. `phase` thuộc intro, combat hoặc settling. |
| `mk:campaign:result` | `CampaignResult` | Kết quả và tiến trình sau commit. Lấy checkpoint mới nhất bằng `load` khi reconnect. |

Server quyết định clear từ trạng thái wave. Client gửi input người chơi. Mỗi nhịp đánh áp dụng một lần. Song lao của Solen dùng chung danh sách mục tiêu đã trúng. Nếu một tick có cả đội gục và trùm chết, xử lý thua trước khi xét thưởng. Khi trùm chết, hủy các nhóm chưa sinh và yêu cầu dọn quân đã ra sân.

Tài nguyên Chiến dịch dùng nền 16:9 và sprite sheet PNG trong `campaign/`. Client và server cùng biên dịch catalog JSON từ workspace. Frame là chỉ số bắt đầu từ 0. Điểm chân `24,44` cho ô 48 và `40,74` cho ô 80. Hướng trái lật quanh điểm neo. Canvas vẽ nền, bóng, actor Y-sort, VFX, rồi telegraph. Hit do simulation 30 Hz quyết định.
