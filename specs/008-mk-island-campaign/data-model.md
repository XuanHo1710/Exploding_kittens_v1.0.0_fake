# Mô hình dữ liệu

[campaign.json](../../database-mighty-knight-pixel/campaign/campaign.json) là nguồn thiết kế chuẩn. Tọa độ tính theo logical pixel, góc trên trái là gốc.

| Thực thể | Trường và ràng buộc |
| --- | --- |
| IslandMap | `id` unique, `state` là chapter hoặc map-preview. `lane` hình chữ nhật chứa `party`, `entries` và `boss`. |
| Wave | `number` 1–5 liên tục, `crest` số nguyên dương, `recruit` duy nhất, `maxAlive`, danh sách `groups` có thứ tự. |
| SpawnGroup | Gate open, alive threshold hoặc HP trùm. Tính duy nhất theo (attemptId, wave, groupIndex). Kẻ địch luôn tham chiếu catalog. |
| Actor | `id` unique, logical HP, tốc độ px/s, mẫu pixel, skill hoặc đòn địch. Tỷ lệ damage thuộc cast. |
| BossPhase | Mốc HP % giảm dần, bảng đòn, telegraph, cách đáp trả. Latch từng mốc một lần. |
| CampaignProgress | `Account.mkCampaign` theo playerId và version, revision, highestCleared 0–5, crest ≥0, heroes và lastAttempt. |
| HeroProgress | level 1–99, xp, statPoints, skillPoints, stats, skills 0–5, branches 0–3. |
| CampaignAttempt | Khóa theo playerId trong RAM, attemptId, socketId, snapshot revision và roster 1–3 tướng unique. controlled phải thuộc roster. |
| Kết quả | Tiến trình ghi nguyên tử sau thắng. highestCleared chống cấp lại Crest. lastAttempt nhận biết cùng attempt. Revision ngăn hai lệnh nâng cùng phiên bản. |

Luồng bắt đầu ở trại, kích hoạt wave với snapshot chỉ số từ roster. Enemy instance, HP từng tướng trong trận, nhịp hit và cooldown là trạng thái attempt. Thua hoặc đứt phiên giữa trận quay về trại từ checkpoint đã xác nhận. Khi thắng, transaction kiểm tra revision rồi ghi XP, Crest, tướng mới và mốc wave. Trả trạng thái sau commit.
