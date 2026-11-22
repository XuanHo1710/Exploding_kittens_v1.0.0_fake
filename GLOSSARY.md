# Astral Expedition Pixel — Domain Glossary

Từ điển thuật ngữ chính thức cho dự án **Astral Expedition Pixel** (Game 2D Pixel Turn-Based Gacha lấy cảm hứng từ *Clair Obscur: Expedition 33*). Mọi tài liệu thiết kế, `.agents/skills/expedition-*`, `prompts/`, `tools/` và mã nguồn (`shared/`, `server/`, `client/`) sử dụng thống nhất các định nghĩa dưới đây.

---

## 1. Thế Giới & Bản Đồ Khám Phá (World & Exploration)

**Landmark layer** — Lớp điểm trong tệp Tiled ghi vị trí xuất phát, rương, Cờ Trạm Nghỉ, Quái Gác Cổng, bệ Đại Trùm và cổng chuyển vùng.

**Landscape layer** — Lớp điểm Tiled gắn cảnh quan như cầu, bến, lau và phế tích với địa hình. Cỏ và vật thể cao dùng vị trí chân để quyết định được vẽ trước hay sau nhân vật.

**Arena atlas** — Ảnh nguồn 2 cột × 4 hàng chứa bảy nền đấu trường nhìn từ trên cao, theo thứ tự vùng 01 đến 07. Ô cuối để trống.

**3D Arena pack** — Bộ mặt đất lặp, sàn trung tâm, panorama 360° và atlas đạo cụ có vùng cắt cùng chiều cao thế giới. Camera 3D đọc bộ ảnh riêng cho từng vùng.

**Hunt site** — Điểm săn tùy chọn có tọa độ riêng trên bản đồ, dự kiến mở sau khi hạ Đại Trùm vùng. Lượt săn dùng bảng bậc Thường, Elite và Champion theo vùng.

**Traversal link** — Liên kết có điểm xuất phát, hướng và điểm đáp xác định cho động tác nhảy bám, leo hoặc lao qua chênh lệch địa hình.

**Portal strip** — Dải cổng gồm một ô đóng và ba ô mở, giữ cùng điểm tiếp đất và kích thước khung.

**Rest bonfire** — Trạm nghỉ có bếp lửa trung tâm và hai cột lửa. Trên minimap, trạm được đánh dấu màu cam.

**Overworld**:
Không gian thế giới 2D pixel góc nhìn từ trên xuống (top-down 3/4, lưới metatile `16×16` xuất `×2` = `32×32 px`) nơi người chơi điều khiển đội trưởng đi qua các vùng đất, mở rương, kích hoạt Cờ Trạm Nghỉ và chạm trán Quái Gác Cổng.

**RealmMap**:
Một trong **7 vùng bản đồ độc lập nối tiếp** của chiến dịch thám hiểm (`01-dawn-meadow` Đồng Cỏ → `02-everfrost-peaks` Tuyết → `03-sunken-dunes` Sa Mạc → `04-abyssal-sanctum` Dưới Nước → `05-cinder-caldera` Núi Lửa → `06-nocturne-veil` Vùng Ban Đêm → `07-aurora-zenith` Quang Phổ Mây Trời Ban Đêm). Mỗi `RealmMap` có bộ địa hình động `8 frame` và xuất thành tệp Tiled `.tmj` sạch lỗi nối mép.

**RestAnchor** (Cờ Trạm Nghỉ Thám Hiểm):
Điểm neo an toàn đặt trên mỗi `RealmMap` (cách vùng phát hiện của mọi Quái Gác Cổng tối thiểu `6 ô`), nơi đội hình hồi phục `100% HP`, lưu điểm hồi sinh và chỉnh sửa Đội Hình trước khi tiến sâu hơn.

**Gatekeeper** (Quái Gác Cổng):
Thực thể quái vật hiện diện trực tiếp trên `RealmMap` (tuần tra hoặc đứng canh `24 frame` ở cầu, hẻm núi, phế tích, cổng chuyển vùng). Khi người chơi bước vào `aggroRadius`, `Gatekeeper` chặn đường và kéo đội hình vào trận đấu theo lượt; khi bị hạ gục lần đầu, rào chắn `gateBarrierTiles` mở thông vĩnh viễn.

**Structure** & **Prop**:
`Structure` là công trình kiến trúc có Silhouette đặc trưng cho từng vùng (Đền Cổ, Kim Tự Tháp Cát, Lò Rèn Dung Nham, Cổng Quang Phổ) có va chạm chân tường và cổng động `4 frame`; `Prop` là vật thể môi trường đặt rời trên nền đất (cây, tinh thể băng, cột đèn đêm, rương báu) hỗ trợ vòng lặp động `8 frame`.

**Autotile**:
Bộ địa hình nối liền mạch `47 ô` (blob autotile) giúp đường mòn, vách đá, bờ nước, băng tuyết, dung nham và thảm mây sao tự khớp góc cạnh không lộ đường cắt.

---

## 2. Nhân Vật, Trùm & Chiến Đấu Dọc (Characters, Bosses & Active Turn-Based Combat)

**Charm icon** — Biểu tượng pixel của một Bùa Hộ Mệnh, lấy đúng ô qua `charmId` trong `ui/charm-icons.json`.

**Signature weapon** — Vũ khí Trấn gắn với một `heroId`. Bản triệu hồi trùng tạo mảnh tinh luyện cho đúng vũ khí.

**Raw unit sheet** — Ảnh sprite do công cụ vẽ xuất ở độ phân giải gốc, được giữ lại trước khi tách nền và đóng vào lưới ảnh game.

**Unit art override** — Sheet đã chuẩn hóa có cùng ID, kích thước lưới và đường dẫn game với sheet được dựng từ rig.

**Hero costume** — Bộ ảnh chiến đấu và di chuyển có trang phục riêng, tham chiếu cùng ID Anh Hùng, vũ khí và bộ kỹ năng.

**Hero** (Anh Hùng Thám Hiểm):
Nhân vật thuộc dàn **12 Anh Hùng sưu tầm** (`R / SR / SSR`) phân theo 4 vai trò (`Vanguard`, `Striker`, `Breaker`, `Luminary`) và 6 hệ nguyên tố (`Verdant`, `Frost`, `Solar`, `Tide`, `Pyre`, `Astral`). Đội hình ra trận gồm tối đa `3` `Hero`. Mỗi `Hero` có `48 frame` di chuyển overworld và `36 frame` chiến đấu góc `BACK` (`192×192 px`, `6 cột × 6 hàng`).

**Boss** (Trùm Khu Vực & Trùm Cuối):
Kẻ địch đỉnh cao canh giữ cuối mỗi vùng đất (`6` Trùm Khu Vực + `1` Trùm Cuối **Astral Painter Seraphina** tại *Quang Phổ Mây Trời Ban Đêm*). Mỗi `Boss` sử dụng khung đại hình `256×256 px` (`6 cột × 6 hàng = 36 frame`), có `2–3` giai đoạn biến đổi chiêu thức và tín hiệu báo đòn rõ ràng không bao giờ bị hiệu ứng chiêu thức che khuất.

**BattleScene**:
Màn hình trận đấu 2D pixel tách biệt (`390×180` wide × tỉ lệ nguyên, vùng trung tâm `320×180` an toàn cho PC) gồm các lớp `backdrop`, `ground`, `platforms`, `props` và **dải môi trường động `8 frame`** khớp đúng vùng đất hoặc đấu trường Trùm nơi cuộc chạm trán bắt đầu.

**VerticalSkillMenu** (Menu Chọn Kỹ Năng Dạng Dọc):
Bảng lệnh xếp theo **cột dọc** phong cách *Expedition 33* hiển thị bên cạnh `Hero` đang tới lượt: liệt kê Đánh Thường (`0 AP`), các Kỹ Năng Chủ Động, Chiêu Cuối và nút Vật Phẩm/Đổi vị trí kèm chi phí AP, biểu tượng nguyên tố và tóm tắt tiếng Việt `≤ 2 dòng`; tự thu gọn ngay khi nhân vật bắt đầu ra đòn.

**ActionPoints** (`AP`):
Nguồn năng lượng chiến thuật trong trận (`0..9 AP`, khởi đầu `3 AP`). Đánh Thường tốn `0 AP` và hồi `+2 AP` (`+3 AP` khi bấm chuẩn nhịp), Đỡ Phản Đòn hồi `+1 AP`, dùng để kích hoạt các Kỹ Năng Chủ Động và Chiêu Cuối.

**TimedHit** (Bấm Nhịp Tấn Công):
Vòng nhịp thời gian thực xuất hiện trong lúc `Hero` tung chiêu từ `VerticalSkillMenu`; bấm đúng tâm (`PERFECT` / `GOOD`) giúp cường hóa sát thương và điểm Phá Thế (bấm trượt vẫn gây sát thương cơ bản, không mất lượt).

**Dodge** & **ParryCounter** (Né & Đỡ Phản Đòn):
Hai thao tác phòng thủ thời gian thực trong lượt kẻ địch/Trùm tấn công: `Dodge` có cửa sổ rộng hơn giúp lướt né `100%` sát thương; `ParryCounter` có cửa sổ chuẩn xác hẹp hơn giúp hóa giải đòn đánh, hồi `+1 AP`, và khi đỡ trọn chuỗi nhịp sẽ tung đòn phản kích (Riposte) gây lượng lớn điểm Phá Thế.

**BreakGauge** (Thanh Phá Thế):
Thanh sức bền thế thủ của `Gatekeeper` và `Boss`; khi tích đầy và bị kích nổ bởi kỹ năng có cờ Phá Thế hoặc đòn `ParryCounter`, mục tiêu rơi vào trạng thái Choáng (`Staggered`), mất lượt kế tiếp và nhận sát thương khuếch đại.

---

## 3. Triệu Hồi & Tiến Trình (Gacha & Progression)

**SummonOrb** (Tinh Cầu Triệu Hồi):
Vật thể tinh cầu ma đạo `8×6` (`26+ frame`) trình diễn hoạt ảnh Triệu Hồi Anh Hùng: bay xoay, nứt sáng, rung 3 nhịp đổi sắc theo bậc độ hiếm (`R` Lam · `SR` Tím · `SSR` Vàng Cực Quang) rồi bung hào quang mở khóa nhân vật.

**PityLedger** (Sổ Bảo Hiểm Triệu Hồi):
Bộ đếm xác thực nguyên tử trên máy chủ cho từng tài khoản: đảm bảo tối thiểu 1 nhân vật `SR+` trong mỗi cụm 10 lượt, tăng xác suất mềm từ lượt `65` và chắc chắn `100%` nhận `SSR` tại mốc **Hard Pity `80` lượt**; bản sao trùng lặp nâng bậc Thức Tỉnh (`A1..A6`) hoặc đổi sang Tinh Huy Quang Phổ (`starlightToken`).
