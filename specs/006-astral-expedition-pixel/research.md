# Phase 0 Research: Astral Expedition Pixel (`006-astral-expedition-pixel`)

**Date**: 2026-11-21
**Feature Spec**: [spec.md](./spec.md)
**Constitution**: [constitution.md](../../.specify/memory/constitution.md) (`v1.0.0`)

---

## R1. Chiến lược Đổi tên & Biên tập Đồng bộ 11 Skills, `prompts/`, `tools/` và `GLOSSARY.md`

- **Decision**: Đổi tên đồng bộ toàn bộ 11 thư mục `.agents/skills/pokemon-*` & `pokeball-*` sang tiền tố **`expedition-*`**, cập nhật toàn bộ `prompts/`, `tools/` và `GLOSSARY.md` sang miền nghiệp vụ **Astral Expedition Pixel** (Anh Hùng Gacha, Quái Gác Cổng, Trùm Đa Giai Đoạn, 7 Vùng Đất Động, Menu Kỹ Năng Dọc, Cầu Triệu Hồi Tinh Tú), xóa bỏ 100% tên/thuật ngữ bắt thú cũ và cập nhật toàn bộ liên kết nội bộ.

| # | Skill cũ (từ `Mons`) | Skill mới (`.agents/skills/`) | Prompt & Tool tương ứng | Vai trò mới trong Astral Expedition Pixel |
|---|----------------------|-------------------------------|-------------------------|-------------------------------------------|
| 1 | `pokemon-sprite-generator` | `expedition-sprite-generator` | `prompts/movement/`, `tools/units/` (đổi từ `tools/pokemon/`) | Tạo sprite sheet chuyển động nhiều frame (`192×192`, `6 frame × 4 hướng = 24 frame/loop`, gồm `idle` + `walk` = **48 frame**) cho Anh Hùng, Quái Gác Cổng và thú cưỡi/tinh linh. |
| 2 | `pokemon-battle-poses` | `expedition-battle-poses` | `prompts/battle/`, `tools/agy/battle_pack.py` | Tạo sprite chiến đấu góc chéo 3/4 nhiều frame theo chuẩn `prompts/battle`: `BACK` cho 12 Anh Hùng (`192×192`, **6 cột × 6 hàng = 36 frame**) và `FRONT` cho Quái Gác Cổng (`192×192`, **6×4 = 24 frame**) & 7 Trùm (`256×256`, **6×6 = 36 frame**). |
| 3 | `pokemon-battle-scene` | `expedition-battle-scene` | `tools/battle-scenes/` | Dựng cảnh chiến đấu phân lớp `390×180` wide (`320×180` vùng an toàn PC) cho cả 7 vùng đất + 7 đấu trường Trùm, nâng cấp thêm **lớp nền động 8 frame** (cỏ lay, tuyết rơi, cát bay, bọt nước, dung nham chảy, đom đóm đêm, dải cực quang đêm). |
| 4 | `pokemon-character-generator` | `expedition-npc-generator` | `tools/characters/` | Tạo sprite overworld cho đội trưởng đại diện trên bản đồ, NPC trạm nghỉ, thương nhân di tích và lính canh (`4 hướng × 6 frame` mượt mà). |
| 5 | `pokemon-move-vfx` | `expedition-skill-vfx` | `prompts/skills/` (đổi từ `prompts/moves/`), `tools/skills/` | Tạo hiệu ứng cho 60 kỹ năng chiến đấu & chiêu thức Trùm: mỗi kỹ năng gồm **8 frame `CAST`** + **8 frame `EFFECT`** (`16 frame/kỹ năng`) + tia năng lượng vẽ bằng code (`beams.py`) kèm mốc thời gian vòng `Timed Hit`. |
| 6 | `pokemon-move-review` | `expedition-skill-review` | `tools/skills/review_skill.py` | Kiểm định tự động hai chiều (`BACK → FRONT` và `FRONT → BACK`), đo kích thước, kiểm tra không cắt mép ô và đảm bảo **0% che khuất tín hiệu báo đòn (telegraph) của Trùm**. |
| 7 | `pokemon-ui-generator` | `expedition-ui-generator` | `tools/ui/` | Sinh bộ giao diện Pixel tiếng Việt chuẩn *Expedition 33*: **Menu Chọn Kỹ Năng Dạng Dọc**, Thanh Thứ Tự Lượt (Turn Timeline), Ngọc AP, Vòng Bấm Nhịp (Timed Hit), Huy hiệu Né/Đỡ Phản Đòn, Thanh Phá Thế (Break) và Khung Triệu Hồi Gacha. |
| 8 | `pokemon-overworld-generator` | `expedition-overworld-generator` | `prompts/overworld/`, `tools/overworld/` | Sinh 47-tile blob autotile, vách đá, cầu cổ, thềm san hô, khe dung nham và **strip địa hình/prop động 8 frame** cho đủ 7 vùng bản đồ. |
| 9 | `pokemon-structure-generator` | `expedition-structure-generator` | `prompts/structure/`, `tools/structures/` | Sinh công trình Signature Silhouette cho 7 vùng (Cờ Trạm Nghỉ Thám Hiểm, Đền Băng, Kim Tự Tháp Cát, Cổng Thủy Cung, Lò Rèn Dung Nham, Tháp Đêm, Điện Quang Phổ) kèm cổng/cửa động 4–6 frame. |
| 10 | `pokemon-map-generator` | `expedition-map-generator` | `tools/maps/` | Lắp ghép 7 bản đồ khám phá từ `*.map.json` → Tiled `.tmj` + ảnh preview, tích hợp bộ giải đường đi kiểm tra chốt chặn Quái Gác Cổng, điểm hồi sinh an toàn và `0` lỗi hở mép nối. |
| 11 | `pokeball-generator` | `expedition-summon-orb-generator` | `tools/items/` | Tạo sprite sheet `8×6` (**26+ frame**) cho ** Tinh Cầu Triệu Hồi (Astral Orb)** trong Gacha: xoay bay vào, nứt sáng, rung 3 nhịp đổi màu theo độ hiếm (`R` Lam / `SR` Tím / `SSR` Vàng Cực Quang), bung tia sao mở khóa Anh Hùng. |

- **Rationale**: Đáp ứng trực tiếp Nguyên tắc II của Hiến pháp và lựa chọn `Option A` của người dùng trong `/speckit-clarify`, giúp Antigravity tự kích hoạt đúng skill theo từ khóa tiếng Việt/tiếng Anh của game mới mà không bị nhiễu bởi quy tắc Pokémon cũ.
- **Alternatives considered**:
  - Giữ tên `pokemon-*` cũ và chỉ sửa nội dung: Bị loại vì tên skill gây nhầm lẫn khi điều phối agent và để sót đường dẫn `tools/pokemon/`.
  - Viết lại toàn bộ script từ con số 0: Bị loại vì bộ xử lý `BGR555`, `magenta.py`, `normalize_sheet.py`, `47-tile autotile` và `beams.py` hiện có đã đạt độ chín kỹ thuật rất cao, chỉ cần chuẩn hóa lại tham số miền và mở rộng số hàng frame.

---

## R2. Kiến trúc Hoạt Ảnh Nhiều Frame ("Nhân Vật + Bản Động Nhiều Frame Chân Thực")

- **Decision**: Áp dụng tiêu chuẩn **High-Frame Living Pixel Animation** xuyên suốt cả nhân vật, quái/trùm lẫn bản đồ/cảnh chiến đấu theo đúng tinh thần `prompts/battle/`:
  1. **Không đứng im như tượng trong lúc chờ chọn lệnh dọc**: Khác với game GBA truyền thống đứng tĩnh ở frame 1 khi mở menu, mọi Anh Hùng, Quái Gác Cổng và Trùm trên màn hình trận đấu đều chạy liên tục vòng lặp **`IDLE_BREATHE` 6 frame** (thở nhịp nhàng, áo choàng/tóc/vũ khí/hào quang lay động ở `8–10 fps`).
  2. **Chuẩn lưới Sprite Chiến Đấu Góc Chéo (`prompts/battle` mở rộng 6 hàng × 6 frame = 36 frame)**:
     - **12 Anh Hùng (`BACK` view — góc dưới-trái nhìn chéo lên phải, thấy lưng + sườn phải + góc nghiêng mặt như `orientation-back.png`)**: Ô `192×192 px` (safe box `160×160`), lưới `6 cột × 6 hàng` (`1152×1152 px` mỗi sheet):
       - Hàng 1 `IDLE_BREATHE` (6f): Thế thủ chiến đấu sống động liên tục.
       - Hàng 2 `ATTACK_STRIKE` (6f): Thế thủ → lấy đà → lao tới → đòn chém/đánh cực đại (khớp nhịp `Timed Hit`) → thu chiêu → về thế thủ.
       - Hàng 3 `SKILL_CAST` (6f): Tụ năng lượng vũ khí → bung ấn ký/phóng chiêu chủ động & Ultimate.
       - Hàng 4 `PARRY_COUNTER` (6f): Dựng vũ khí đỡ keng tia lửa → xoay người phản kích (Riposte) chuẩn chất *Expedition 33*.
       - Hàng 5 `DODGE` (6f): Khuỵu gối → lướt ngang né đòn rõ rệt 1/4 ô → tiếp đất về vị trí.
       - Hàng 6 `HURT_FAINT` (6f): Frame 1–3 giật lùi trúng đòn (`HURT`); Frame 4–6 khuỵu ngã nằm gục (`FAINT`).
     - **Quái Thường & Quái Gác Cổng (`FRONT` view — góc trên-phải nhìn chéo xuống trái như `orientation-front.png`)**: Ô `192×192 px`, lưới `6 cột × 4 hàng = 24 frame` (`IDLE_BREATHE / ATTACK_TELEGRAPH_STRIKE / HURT_STAGGER / FAINT`, hỗ trợ mở rộng `6×5 = 30 frame` cho Tinh Anh).
     - **6 Trùm Khu Vực & 1 Trùm Cuối (`FRONT` view khổng lồ)**: Ô `256×256 px` (safe box `216×216`), lưới `6 cột × 6 hàng = 36 frame` (`1536×1536 px`): `IDLE_BREATHE` (6f), `COMBO_ATTACK` (6f), `HEAVY_SWEEP` (6f), `PHASE_AWAKEN` (6f chuyển giai đoạn), `STAGGER_BREAK` (6f quỳ choáng khi vỡ giáp), `DEFEAT` (6f sụp đổ).
  3. **Chuẩn Bản Đồ Động & Cảnh Trận Đấu Động ("Bản Động" 8 Frame)**:
     - **Overworld 7 vùng**: Mỗi vùng có bộ tile địa hình động **8 frame** (`200 ms/frame` đồng bộ toàn map: suối/biển chảy, dung nham sôi, hoa/cỏ gió lùa, băng lấp lánh, cực quang trôi) + hạt môi trường (tuyết rơi, cát bay, bong bóng nước, tro lửa, đom đóm, bụi sao quang phổ) + Quái Gác Cổng bước đi tuần tra `6 frame × 4 hướng`.
     - **Battle Scene 7 vùng + Đấu trường Trùm**: Thay vì 1 tấm ảnh tĩnh duy nhất, mỗi cảnh chiến đấu xuất kèm lớp nền động **8 frame** + hiệu ứng thời tiết/quang phổ chuyển động mượt dưới chân hai phe ở `60 FPS`.
- **Rationale**: Đáp ứng trực tiếp yêu cầu của người dùng trong `/speckit-plan` (*"thiết kế nhân vật + bản động phải nhiều frame như này nhé thì mới tạo cảm giác chân thực"*), tận dụng tối đa góc nhìn 3/4 sống động của `prompts/battle/` đồng thời giữ dung lượng PNG rất nhẹ nhờ bảng màu nén chuẩn `BGR555` (`≤ 15–31` màu/sheet, mỗi sheet `1152×1152` indexed/quantized PNG chỉ khoảng `45–110 KB`).
- **Alternatives considered**:
  - Giữ giới hạn 10–15 frame nhỏ như *Mighty Knight*: Bị loại vì không đạt độ mượt chuyển động 6-frame/động tác và góc chéo chi tiết `192×192` / `256×256` mà người dùng yêu cầu.
  - Render mô hình 3D thời gian thực bằng Three.js: Bị loại vì vi phạm định hướng **2D Pixel Art chuẩn Gen 3** trong Hiến pháp.

---

## R3. Cơ chế Chiến Đấu Turn-Based Dọc + Chủ Động 2 Chiều Kiểu Expedition 33

- **Decision**: Thiết kế bộ máy chiến đấu **Active Turn-Based Engine (`ExpeditionBattleEngine`)** dùng chung logic xác định trong `shared/src/expedition/`, kết hợp hiển thị `60 FPS` trên Client và xác thực kết quả nguyên tử trên Server:
  1. **Thứ tự lượt (Action Value — CTB)**: Mỗi đơn vị có `actionGauge` giảm theo `10000 / effectiveSpeed`; thanh **Turn Order Timeline** dọc phía trên-trái hiển thị trước 6–8 lượt tiếp theo (cập nhật tức thì khi có tăng tốc hoặc làm choáng Phá Thế).
  2. **Menu Chọn Kỹ Năng Dạng Dọc (Vertical Skill Stack)**:
     - Neo gọn bên cạnh nhân vật đang tới lượt (cột dọc nghiêng nhẹ vát góc 45° phong cách *Expedition 33* bản pixel), điều khiển nhanh bằng `W/S`, `↑/↓`, phím tắt `1–4 / E / Q` hoặc chạm trực tiếp trên mobile.
     - Mỗi dòng dọc hiển thị: `[Phím] Biểu tượng Nguyên tố · Tên Kỹ Năng · Chi phí AP (0..9)`. Khung mô tả ngắn 2 dòng tiếng Việt + điểm Phá Thế nằm gọn ngay dưới danh sách dọc.
  3. **Kinh tế Điểm Hành Động (`AP: 0..9`)**:
     - Khởi đầu trận: `3 AP`.
     - **Đánh Thường (`0 AP`)**: Luôn khả dụng, hồi `+2 AP` (hoặc `+3 AP` nếu bấm chuẩn `Timed Hit`).
     - **Kỹ năng Chủ Động (`2–5 AP`)** & **Chiêu Cuối (`6–8 AP` hoặc đầy thanh Tinh Hoa)**.
  4. **Bấm Nhịp 2 Chiều (2-Way Real-Time Timing)**:
     - **Khi Tấn Công (`Offensive Timed Hit`)**: Trong pha lấy đà của kỹ năng (frame 2–3 của hàng `ATTACK_STRIKE` / `SKILL_CAST`), vòng sáng thu hẹp về tâm nút `Space / J / Nút Chạm`:
       - `PERFECT` (`±55 ms`): `1.25×` sát thương + `1.30×` điểm Phá Thế + hiệu ứng tia sáng vàng.
       - `GOOD` (`±120 ms`): `1.12×` sát thương + `1.10×` điểm Phá Thế.
       - `MISS`: `1.00×` sát thương cơ bản (không bao giờ mất lượt hay hủy chiêu).
     - **Khi Phòng Thủ (`Dodge` vs `Parry/Counter`)**: Mỗi đòn đánh của Quái/Trùm có chuỗi nhịp va chạm (`hitBeats[]`) kèm tín hiệu báo đòn rõ ràng (chớp viền vũ khí + âm báo trước va chạm `350–500 ms`):
       - **Né (`Dodge` — phím `Shift / K` — cửa sổ `±110 ms`)**: Chạy hàng `DODGE` 6 frame, tránh `100%` sát thương của nhịp đó.
       - **Đỡ Phản Đòn (`Parry` — phím `E / Space` — cửa sổ hẹp `±60 ms`)**: Chạy hàng `PARRY_COUNTER`, triệt tiêu `100%` sát thương, hồi ngay **`+1 AP`**; nếu đỡ chuẩn **toàn bộ các nhịp** trong chuỗi đòn của địch, Anh Hùng lập tức tung đòn **Phản Kích (Expedition Counter)** gây sát thương lớn và cộng mạnh vào **Thanh Phá Thế (Break Gauge)**!
  5. **Mô hình Đồng bộ & Chống Gian Lận không trễ nhịp (Zero-Latency Parry)**:
     - Vì cửa sổ Parry `±60 ms` không thể chịu độ trễ mạng vòng khứ hồi mỗi khung hình, Client chạy diễn hoạt khung hình ở `60 FPS` theo hạt giống ngẫu nhiên do Server cấp khi bắt đầu trận (`battleSeed`), gửi gói lệnh từng lượt (`exp:turn_action` gồm lựa chọn kỹ năng + dấu thời gian các nhịp bấm `Timed Hit` / `Dodge` / `Parry`) lên Server để `ExpeditionBattleEngine` trên Server tái kiểm chứng tính hợp lệ (giới hạn ngưỡng AP, thứ tự lượt, biên thời gian khả thi và chống replay) trước khi cấp phần thưởng/mở cổng.
- **Rationale**: Mang lại cảm giác bấm phím nhạy tức thì `0 ms` độ trễ cho người chơi đúng chất *Expedition 33*, đồng thời giữ vững tính toàn vẹn dữ liệu trên Server trước việc giả mạo sát thương hay nhận thưởng khống.
- **Alternatives considered**:
  - Gửi từng cú bấm Parry qua mạng chờ Server phản hồi mới vẽ hoạt ảnh: Bị loại vì chỉ cần ping `40–80 ms` sẽ làm hỏng hoàn toàn cảm giác căn nhịp Parry.
  - Tính toán hoàn toàn dưới trình duyệt không kiểm chứng trên Server: Bị loại vì vi phạm Nguyên tắc V của Hiến pháp (bảo vệ tiến trình & tiền tệ Gacha).

---

## R4. Hạ Tầng Phụ Trợ Cục Bộ Miễn Phí Bằng Docker (`Redis 7`) + Lưu Trữ JSON Nguyên Tử

- **Decision**: Cung cấp tệp `docker-compose.expedition.yml` tại gốc repo sử dụng image mã nguồn mở miễn phí 100% **`redis:7-alpine`** chạy cục bộ, kết hợp kho lưu trữ bền vững nguyên tử theo từng tài khoản `server/data/expedition/<playerId>.json`:
  1. **Vai trò của Local Docker Redis (`redis:7-alpine`, cổng cục bộ `6379`)**:
     - Lưu phiên trận đấu đang diễn ra (`exp:battle:<playerId>`, TTL `2 giờ`) để khôi phục mượt mà nếu người chơi nhấn F5 giữa trận đấu Trùm.
     - Khóa chống gửi đúp lượt quay Gacha & nhận thưởng hạ Trùm (`SET exp:lock:<playerId>:<idempotencyKey> 1 NX PX 10000`).
     - Bộ nhớ đệm đọc nhanh hồ sơ `ExpeditionProfile` (`exp:profile:<playerId>`) và giới hạn tốc độ gói tin (rate-limit).
  2. **Cơ chế Tự thích ứng không điểm chết (`Graceful Fallback`)**:
     - Lớp `ExpeditionRedisService` tự kiểm tra kết nối `REDIS_URL` (mặc định `redis://127.0.0.1:6379`); nếu Docker chưa bật trong lúc chạy unit test nhanh, hệ thống tự động chuyển về bộ nhớ đệm tiến trình nội bộ có cùng giao diện mà **không làm sập server**.
  3. **Kho lưu trữ bền vững nguyên tử (`Atomic JSON Store`)**:
     - Mọi thay đổi bền vững (mở khóa bản đồ, hạ Quái Gác Cổng/Trùm, quay Gacha, cập nhật Pity 80 lượt, nâng cấp Anh Hùng) đều ghi xuống `server/data/expedition/<playerId>.json` theo quy trình `write temp → fsync → rename` kèm sổ cái `summonHistory`, hoàn toàn tách biệt không đụng chạm tới `server/data/db.json` của các game cũ (chỉ dùng chung xác thực tài khoản đăng nhập sảnh `AccountsService`).
- **Rationale**: Tận dụng đúng thế mạnh tốc độ và khóa nguyên tử của Docker Redis miễn phí như người dùng đề xuất trong `/speckit-specify`, đảm bảo `SC-008` (`0` chi phí đám mây) và bảo toàn `100%` dữ liệu bền vững ngay cả khi xóa/khởi động lại container Redis.
- **Alternatives considered**:
  - Thêm cụm PostgreSQL + ORM nặng cho riêng 1 mode game: Không cần thiết vì toàn bộ monorepo `meo-no` đang vận hành nhẹ nhàng không phụ thuộc DBMS nặng; JSON theo từng tài khoản + Local Redis vừa cực nhanh vừa dễ sao lưu/kiểm chứng.
  - Dịch vụ Redis đám mây (Upstash/Redis Cloud): Bị loại vì vi phạm điều kiện miễn phí chạy cục bộ bằng Docker.

---

## R5. Thiết Kế 7 Bản Đồ Khám Phá, Quái Gác Cổng & Đấu Trường Quang Phổ Mây Trời Ban Đêm

- **Decision**:
  1. **Chuỗi 7 bản đồ độc lập nối tiếp (`tools/maps/mapgen.py` mở rộng 7 Theme mới)**:
     - Map 1 `01-dawn-meadow` (**Đồng Cỏ Khởi Nguyên**): Thảo nguyên xanh gió lùa, suối đá lấp lánh, cổng cổ rêu phong.
     - Map 2 `02-everfrost-peaks` (**Đỉnh Tuyết Vĩnh Cửu**): Hẻm núi băng tuyết rơi, cầu băng phản chiếu, đền tinh thể lạnh.
     - Map 3 `03-sunken-dunes` (**Sa Mạc Lãng Quên**): Cồn cát vàng gió cuốn, ốc đảo ngọc lục bảo, phế tích đồng hồ cát.
     - Map 4 `04-abyssal-sanctum` (**Thủy Cung Thẳm Sâu**): Thềm đại dương cổ đại đi dưới vòm bong bóng ánh sáng & rãnh san hô phát quang, bong bóng nước bay lên 8 frame (nhân vật di chuyển mượt kèm hiệu ứng gợn nước mà không làm gãy quy tắc điều khiển).
     - Map 5 `05-cinder-caldera` (**Miệng Núi Lửa Rực Cháy**): Sông dung nham sôi 8 frame, cầu đá bazan đen, lò rèn titan rực lửa.
     - Map 6 `06-nocturne-veil` (**Vùng Ban Đêm Huyền Ảo**): Rừng đại ngàn đêm tím thẫm, hoa dạ quang, đom đóm lượn và bậc thang tinh tú dẫn lên bầu trời.
     - Map 7 `07-aurora-zenith` (**Quang Phổ Mây Trời Ban Đêm**): Biển mây đêm ngàn sao với dải quang phổ cực quang 7 sắc uốn lượn liên tục 8–12 frame, hành lang pha lê dẫn thẳng tới ngai vàng của **Trùm Cuối**.
  2. **Cơ chế Quái Gác Cổng (`Gatekeeper Monsters`) không gây kẹt lặp**:
     - Trên mỗi bản đồ `1..6` đặt **3 Quái Gác Cổng** (2 chốt dọc tuyến đường chính/rương phụ + 1 Tinh Anh Gác Cổng ngay trước đấu trường Trùm Khu Vực) và bản đồ `7` đặt **2 Hộ Pháp Tinh Tú** trước thềm Trùm Cuối.
     - Mỗi Quái Gác Cổng có sprite tuần tra nhiều frame và vùng phát hiện hình nón/bán kính chặn ngang hẻm đường; khi người chơi bước vào vùng chặn → hiện dấu chấm than `!` pixel + hiệu ứng cắt cảnh chớp chéo → vào trận.
     - Nếu người chơi thua và hồi sinh tại **Cờ Trạm Nghỉ (Expedition Flag)**, vị trí trạm nghỉ luôn nằm ngoài bán kính phát hiện tối thiểu `6 ô` và cấp `2 giây` miễn kích hoạt sau khi chuyển cảnh để tuyệt đối không bao giờ bị kéo lặp vô hạn.
- **Rationale**: Giải quyết trọn vẹn bài toán thiết kế thế giới 7 vùng giàu chuyển động, dẫn dắt nhịp độ leo thang tự nhiên tới cao trào *Quang Phổ Mây Trời Ban Đêm*.
- **Alternatives considered**:
  - Chạm quái ngẫu nhiên trong bụi cỏ (Random Encounter): Bị loại vì người dùng yêu cầu rõ *"Thả mấy quái gác cổng trên mỗi map khi người dùng đi qua"* — nhìn thấy rõ quái canh cổng trên bản đồ mới đúng chất *Expedition 33*.

---

## R6. Tích Hợp Cô Lập Vào Monorepo `meo-no`

- **Decision**:
  - Thêm `'astral_expedition'` vào `GAME_MODES` trong `shared/src/` và đặt thẻ chọn game nổi bật trên `Home.tsx`.
  - Tạo kho tài nguyên xuất bản tại `database-astral-expedition/` (được sinh tự động từ `assets/` + `data/` qua script đóng gói `tools/expedition/build_bundle.py`), phục vụ tĩnh qua `/database-astral-expedition` với middleware bảo mật `AstralExpeditionStaticGuard` tái sử dụng hàm `guardSafeStaticRequest` sẵn có trong `server/src/app.module.ts`.
  - Cô lập toàn bộ mã client tại `client/src/expedition/` + `client/src/components/ExpeditionBoard.tsx`, mã server tại `server/src/game/expedition/`, và hợp đồng chung tại `shared/src/expedition/`.
- **Rationale**: Kế thừa chính xác kiến trúc đã kiểm chứng thành công của `bansung` và `mighty_knight`, đảm bảo `0` xung đột với 10 chế độ chơi hiện có.
- **Alternatives considered**:
  - Tách thành một dự án Vite + NestJS chạy cổng riêng: Bị loại vì trái với lựa chọn `Option A` của người dùng trong câu hỏi làm rõ số 5 (`FR-020`).
