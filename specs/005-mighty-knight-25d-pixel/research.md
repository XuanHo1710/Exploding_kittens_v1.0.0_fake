# Phase 0 Research: Mighty Knight 2.5D Pixel (10–15 Frames/Character & Multi-Skill Animation)

Tài liệu này chốt toàn bộ các quyết định kỹ thuật, mỹ thuật pixel 2.5D, kiến trúc tối ưu **10–15 frame/nhân vật**, hệ thống **nhiều skill animation**, và phương án tích hợp vào monorepo `meo-no` trước khi thiết kế Data Model & Contracts.

---

## R1. Quan hệ với bản `mighty_knight` đang chưa commit trong repo

Hiện tại trong working tree (`git status`) đã có sẵn một bản thử nghiệm `mighty_knight` (chưa commit) dùng:
- Đồ họa **cartoon-chibi vector 3x-supersampled Lanczos** tại thư mục `database-mighty-knigt/` (bị sai chính tả `knigt`).
- **37 frame / anh hùng** tách thành 8 file PNG (`idle:4, walk:6, attack:5, skill1:6, skill2:6, dash:4, hit:2, dead:4`), **21 frame / quái thường**, **29 frame / Boss**.
- Chỉ có **2 kỹ năng chủ động** (`skill1`, `skill2`) và 1 đòn đánh thường đơn điệu.

- **Decision**: **Nâng cấp / tái cấu trúc trực tiếp (in-place refactor)** chế độ `gameMode: 'mighty_knight'` sang chuẩn **2.5D Pixel Art** mới thay vì nhân bản thêm chế độ Mighty Knight thứ hai trên sảnh chờ. Chuẩn hóa thư mục tài nguyên mới sang `database-mighty-knight-pixel/` (và dọn hoặc thay thế `database-mighty-knigt/` ở pha triển khai sau khi người dùng xác nhận).
- **Rationale**:
  - Giữ gọn danh sách `GAME_MODES` trong `shared/src/protocol.ts`, tái sử dụng toàn bộ hạ tầng phòng chơi, sảnh chờ, cược xu, chat, khán giả, và cơ chế kết nối lại socket của `meo-no`.
  - Tái sử dụng bộ khung test (`server/test/mk-*.test.cjs`) và nâng cấp kiểm định thêm cổng bắt buộc **10–15 frame/nhân vật** và **pixel crispness**.
- **Alternatives considered**:
  - Tạo chế độ thứ 2 (`mighty_knight_pixel`) chạy song song với bản cartoon: gây trùng lặp chế độ trên trang chủ và tăng gấp đôi dung lượng tài nguyên lẫn mã bảo trì. Nếu người dùng muốn giữ lại bản cartoon làm bản so sánh, chỉ cần giữ một nhánh git dự phòng trước khi ghi đè.

---

## R2. Bài toán cốt lõi: Làm sao có "nhiều skill animation" khi mỗi nhân vật tối đa 10–15 ảnh (frame)?

Đây là bài toán thiết kế quan trọng nhất của dự án. Nếu vẽ riêng từng dải ảnh cho 3 đòn combo + 4 kỹ năng chủ động + 1 Ultimate + Dash + Guard + Idle + Walk + Hit + Dead, mỗi nhân vật sẽ tốn **60–90 frame**, phá vỡ hoàn toàn giới hạn **10–15 ảnh/nhân vật** và cực khó đồng bộ chất lượng pixel art.

- **Decision**: Áp dụng kiến trúc **3 tầng Pixel Choreography** (kỹ thuật chuẩn của game đối kháng / beat-'em-up 16-bit & indie hiện đại như *River City Girls*, *Dead Cells*, *Dungeon Fighter*):
  1. **Tầng 1 — Character Master Key-Pose Atlas (CỨNG 10–15 frame/nhân vật, gộp thành đúng 1 file PNG ngang)**:
     - **Anh hùng (6 Hero)**: đúng **15 frame** (`0..14`, lưới `48×48` px gốc, toàn bộ nhân vật chỉ là **1 tấm ảnh `720×48` px**).
     - **Quái thường (6 loại)**: đúng **11 frame** (`0..10`, lưới `48×48` px gốc, ảnh `528×48` px).
     - **Quái tinh anh / Pháp sư (2 loại)**: đúng **12 frame** (`0..11`, lưới `48×48` px gốc).
     - **Boss (4 Boss)**: đúng **15 frame** (`0..14`, lưới `80×80` px gốc, ảnh `1200×80` px).
     - **Bất biến cứng (Hard Gate)**: `10 <= totalFrames <= 15` cho **100% nhân vật** (Hero, Enemy, Boss) — kiểm tra tự động trong build manifest và `node:test`.
  2. **Tầng 2 — Data-Driven Skill Choreography Timeline (`MkChoreoStep[]`)**:
     - Mỗi đòn combo (3 hit) và mỗi kỹ năng (4 Active + 1 Ultimate) là một **kịch bản biên đạo theo mốc thời gian** lắp ghép từ 15 tư thế khóa (key-pose) của nhân vật kết hợp:
       - **Frame hold bất đối xứng** (Anticipation giữ ngắn → Active Strike snap tức thì → Hitstop đóng băng 35–85 ms → Follow-through).
       - **Chuyển động gốc lượng tử pixel (`offsetX`, `offsetY`, `offsetZ`)**: lao tới, nhảy bật trên trục Z, bổ xuống mặt đất.
       - **Lật ngang `flipX` theo nhịp**: ghép `STRIKE_1 → STRIKE_2(flip)` hoặc `AIR_SPIN → AIR_SPIN(flip)` tạo chiêu xoay kiếm 360° hoặc liên hoàn 6 nhát mượt mà chỉ từ 2–3 frame gốc.
       - **Dư ảnh pixel (Pixel Afterimage Ghosts)**: lưu tối đa 4 bóng mờ đơn sắc đổi bảng màu (xanh lam, vàng thánh, tím bóng đêm, đỏ nham thạch) bám theo bước lướt/skill.
       - **Đổi bảng màu nhất thời (Palette Flash / Rim Glow)**: chớp trắng khi trúng đòn, viền vàng khi Super Armor / Perfect Parry, ánh tím khi tụ Ultimate.
  3. **Tầng 3 — Thư viện Pixel VFX Tách Rời (Modular Pixel VFX Library)**:
     - Hiệu ứng kỹ năng (vệt chém lưỡi liềm, lốc xoáy 360°, cột ánh sáng thánh, mưa tên băng, thiên thạch, tia sét chuỗi, vòng tròn ma pháp 2.5D dưới chân, vết nứt địa chấn, thanh long cuộn sóng, vết chém đan chéo toàn màn) nằm ở lớp **VFX pixel dùng chung có thể nhuộm bảng màu theo hệ nguyên tố**, vẽ đan xen lớp `behind` (dưới chân/sau lưng) và `front` (trước nhân vật).
     - Nhờ tách nhân vật khỏi VFX, **6 Hero × (3 đòn Combo + 4 Active Skill + 1 Ultimate + Dash + Guard/Parry) = 60 hoạt ảnh chiến đấu hoàn toàn khác biệt** nhưng vẫn giữ nguyên **15 ảnh gốc/nhân vật**.
- **Rationale**:
  - Giảm 60–75% dung lượng sprite & RAM GPU so với cách tách strip rời (chỉ 1 texture atlas / nhân vật, 1 draw call / entity).
  - Rất dễ cho họa sĩ pixel (Aseprite/Piskel) thay thế bất kỳ nhân vật nào: chỉ cần vẽ đúng **15 ô `48×48`** theo bảng chỉ số `0..14` trong `contracts/asset-atlas.md` là toàn bộ 5 skill + 3 combo + Ultimate chạy ngay lập tức.
  - Không bao giờ xoay góc tùy ý sprite pixel (nguyên nhân gây vỡ răng cưa xấu) — tư thế ngã (`DOWN_DEAD`) có riêng frame `14`.
- **Alternatives considered**:
  - Mỗi skill vẽ strip 6–8 frame riêng: 5 skill × 6 frame + di chuyển/đánh thường = ~65 frame/nhân vật → **vi phạm trực tiếp yêu cầu 10–15 ảnh**.
  - Dùng xương 2D (Spine / skeletal pixel): làm vỡ lưới pixel (mixels / sub-pixel rotation), mất chất pixel 2.5D cổ điển.

---

## R3. Chuẩn đồ họa 2.5D Pixel Art & Tỷ lệ hiển thị sắc nét (Zero-Blur Rendering)

- **Decision**:
  - **Độ phân giải logic pixel (Virtual Pixel Viewport)**: **`640 × 360`** (tỷ lệ 16:9 chuẩn của *Celeste*, *Katana ZERO*, *Hyper Light Drifter*), kéo dãn sạch lên màn hình desktop (`1280×720 = 2x`, `1920×1080 = 3x`) và mobile landscape với:
    - `ctx.imageSmoothingEnabled = false` trên mọi Canvas 2D context.
    - CSS `image-rendering: pixelated; image-rendering: crisp-edges;`.
    - Mọi tọa độ vẽ sprite, VFX, bóng đổ, hạt bụi đều làm tròn về **số nguyên virtual pixel** (`Math.round(x)`, `Math.round(y - z)`).
  - **Kích thước chiến trường 2.5D Belt-Scroller**: **`1280 × 360`** virtual pixel (gấp 2 lần bề rộng camera để có chiều sâu cuộn ngang kiểu arcade beat-'em-up), trong đó:
    - Vùng đường chạy 2.5D (Belt Lane): `y ∈ [156, 326]` (170 virtual px chiều sâu).
    - **Y-Sorting chuẩn 2.5D**: toàn bộ Hero, Enemy, Boss, Pickup, Ground Trap sắp xếp vẽ theo `footY` (tọa độ chân chạm đất `y`), còn độ cao nhảy/hất tung `z` nâng hình nhân vật lên `drawY = footY - z` trong khi **bóng elip pixel** luôn dính tại `(x, footY)` và thu nhỏ theo bậc pixel rời rạc khi `z` tăng.
    - **Parallax 5 lớp pixel**: `bg_sky (0.18x)` → `bg_far (0.42x)` → `bg_mid (0.72x)` → `ground_arena (1.0x)` → `fg_silhouette (1.22x)`.
  - **Bảng màu & Pipeline vẽ pixel thật**:
    - Dùng bảng màu Dark-Fantasy 32 màu thống nhất (kiểu *Endesga-32*), viền pixel 1px màu tím than `#140c1c`, đổ bóng 3 bậc (highlight / base / shadow) có dithering nhẹ ở mặt đất/nền, **tuyệt đối không dùng Lanczos downsample hay anti-aliasing**.
    - Script sinh pixel art `scripts/mightyknight-pixel/build_pixel_sprites.py` vẽ trực tiếp ở tỷ lệ **1:1 native pixel** (`48×48` / `80×80`), áp bộ lọc viền 1px pixel-perfect tự động, kiểm tra không có pixel bán trong suốt (alpha chỉ `0` hoặc `255` cho sprite nhân vật; VFX cho phép bậc alpha pixel rời rạc).
- **Rationale**: Giữ đúng hồn **2.5D Pixel Art sắc cạnh**, tải cực nhanh (toàn bộ 16 nhân vật chỉ ~150–250 KB PNG tổng cộng!), và hiển thị đẹp đồng nhất trên màn Full HD, 4K lẫn điện thoại.
- **Alternatives considered**:
  - Giữ canvas `1920×680` và scale pixel lên `96×96` bằng Lanczos: làm mờ cạnh pixel (mixels), mất cảm giác game pixel.
  - WebGL / Three.js 2.5D (HD-2D kiểu Octopath): quá nặng, đòi hỏi thêm thư viện ngoài (trái quy ước "không thêm dependency nặng không cần thiết" của repo `meo-no`).

---

## R4. Thiết kế hệ thống kỹ năng sâu ("Nhiều Skill Animation") & Nhịp chiến đấu

- **Decision**: Mỗi anh hùng sở hữu bộ kỹ năng hoàn chỉnh gồm **10 hành động chiến đấu phân biệt rõ rệt**:
  1. **Combo đánh thường 3 nhịp (`J`/`Z`)**: Hit 1 nhanh → Hit 2 nối chuỗi → Hit 3 kết liễu (đẩy lùi/xuyên giáp/nổ lan), kèm **Đòn lướt chém (Dash Attack)** nếu bấm đánh trong lúc đang Dash.
  2. **Lướt né (`Space`/`Shift`)**: Invulnerability 280 ms + 3 bóng dư ảnh màu hệ.
  3. **Đỡ đòn / Phản công hoàn hảo (`E` / nút Khiên)**: Bật tư thế `GUARD_PARRY` (`12`) trong 450 ms; nếu đỡ đúng cửa sổ **180 ms đầu** sẽ kích hoạt **PERFECT PARRY** (hitstop 70 ms, sóng vàng phản sát thương, hồi 30% cooldown kỹ năng & +20 Fury!).
  4. **4 Kỹ năng chủ động (`K`, `L`, `I`, `O` hoặc `1–4`)**:
     - `Skill 1`: Kỹ năng cốt lõi (mở sẵn Lv1 từ đầu trận, hồi 4.5–5.5s).
     - `Skill 2`: Kỹ năng khống chế / AoE (mở khóa bằng Vàng hoặc lên cấp 2, hồi 7–8.5s).
     - `Skill 3`: Kỹ năng cơ động / tiện ích / tụ quái / buff đội hình (mở khóa bằng Vàng hoặc cấp 3, hồi 8–10s).
     - `Skill 4`: Kỹ năng sát thương tầm lớn / phản đòn đặc trưng (mở khóa bằng Vàng hoặc cấp 5, hồi 10–12s).
     - **Tiến hóa hoạt ảnh kỹ năng (Skill VFX Evolution)**: Nâng kỹ năng lên **Lv3** và **Lv5** mở rộng thêm tầng VFX (vd: 1 kiếm khí → 3 kiếm khí; 3 thiên thạch → 5 thiên thạch + hồ dung nham; lốc kiếm mở rộng thêm tia sét).
  5. **1 Tuyệt kỹ Thức Tỉnh — Ultimate (`R` khi thanh Fury đạt 100%)**:
     - Nạp Fury qua đánh trúng combo (+3), hạ quái (+6), Perfect Parry (+20), nhận sát thương (+8).
     - Khi tung Ultimate: hiện **Banner Chân Dung Pixel Cut-In** gọn góc trên-trái 0.45s (không làm đứng màn hình đồng đội co-op), siêu giáp 1.0s, hiệu ứng toàn chiến trường cực hoành tráng.
  6. **2 Nội tại (Passives)** + **Kho Thánh Vật (Relic Draft)** mỗi khi hạ Boss (Wave 5, 10, 15…) chọn 1 trong 3 thẻ nâng cấp kiểu roguelite.
- **Rationale**: Tạo cảm giác bấm chiêu đã tay, nhiều biến hóa phối chiêu (combo → hủy động tác sang Skill → Perfect Parry → Ultimate), tổng cộng **6 Hero × 5 Active/Ult = 30 kỹ năng chủ động + 18 đòn combo + 6 phản đòn** đầy màu sắc.
- **Alternatives considered**:
  - Giữ chỉ 2 skill như bản cũ: quá ít, không đáp ứng yêu cầu "nhiều skill animation".
  - Cho 8–10 nút skill chủ động cùng lúc: quá chật cho giao diện mobile cảm ứng và khó nhớ phím tắt. 4 Active + 1 Ultimate + 3-Hit Combo + Dash + Parry là điểm ngọt tối ưu cho cả PC lẫn Mobile.

---

## R5. Kiến trúc mô phỏng Server-Authoritative 30 Hz & Nội suy 60 FPS

- **Decision**:
  - Server NestJS chạy `MkWorld` quyết định duy nhất ở **30 Hz** (`33.33 ms/tick`).
  - Client chỉ gửi **ý định điều khiển** (`move`, `attack`, `skill(1..4)`, `ultimate`, `dash`, `guard`, `switch_com`, `upgrade`, `pick_relic`).
  - Server thực thi toàn bộ: kiểm tra cooldown/Fury/vàng, giải quyết cửa sổ hitbox theo **mốc tick của Skill Choreography**, tính sát thương/chí mạng/Parry/EVADE/trạng thái (`slow`, `burn`, `bleed`, `stun`, `pull`, `knockup`), điều khiển AI đồng đội COM và AI quái/Boss.
  - Gói `mk:frame` truyền theo cơ chế **Compact Snapshot**: mang `actionId` + `actionTick` cho từng thực thể để client chạy khớp 100% kịch bản `MkChoreoTimeline` ở 60 FPS mượt mà mà không phải gửi tọa độ từng frame animation qua mạng.
  - Sự kiện tức thời (`fx`, `damages`, `sfx`, `ultCutIn`) có ID tăng dần để client khử trùng lặp và kích hoạt VFX/Hitstop cục bộ.
- **Rationale**:
  - Chống gian lận hoàn toàn (không hack cooldown, không hack sát thương, không hack vàng).
  - Băng thông nhẹ (< 40 KB/s mỗi client ngay cả khi 6 người + 35 quái + nhiều skill nổ cùng lúc).
  - Đồng bộ hoàn hảo với kiến trúc các mode thời gian thực đã kiểm chứng trong `meo-no` (`ants`, `tw`, `bansung`).
- **Alternatives considered**:
  - Để client tính va chạm kỹ năng: dễ gian lận và gây lệch trạng thái giữa 6 người chơi co-op.

---

## R6. Chế độ chơi, 4 Quần xã Pixel (Biomes) & Tiến trình Vô Tận / Boss Rush

- **Decision**:
  - Hỗ trợ **1–6 người chơi** + **0–3 đồng đội AI COM** (mặc định khi chơi 1 người là `P1 + 2 COM` đúng chất squad 3 anh hùng của Mighty Knight, bấm `Q`/`Tab` đổi tướng điều khiển ngay trong trận!).
  - **2 Chế độ trận đấu** chọn tại Phòng Chờ (`MkConfig.playMode`):
    1. **Endless Challenge (`endless`)**: Wave 1 → ∞, xoay vòng **4 Quần xã Pixel** mỗi 5 wave (**Đồng Cỏ Ngọc Bích → Rừng Cổ Mộ → Núi Lửa Nham Thạch → Thành Cổ Tinh Tú**). Wave 3, 8, 13… xuất hiện **Mini-Boss Tinh Anh**; Wave 5, 10, 15… xuất hiện **Đại Boss 3 Giai Đoạn** kèm rớt rương **Relic Draft (chọn 1/3 Thánh Vật)**. Xen kẽ sự kiện săn **Hồn Ma Kho Báu (Netherghost)**.
    2. **Boss Rush (`boss_rush`)**: Bắt đầu ở Lv5 với 450 Vàng để mở sẵn đủ 4 kỹ năng, đấu liên hoàn 4 Đại Boss cường hóa (có 10 giây nghỉ & chọn Relic giữa mỗi Boss).
  - **Hồi sinh Co-op**: Khi anh hùng cạn HP, chuyển sang tư thế `DOWN_DEAD` (frame `14`), đồng đội đứng trong vòng sáng 2.5 giây để hồi sinh với 50% HP. Thua chỉ khi cả đội gục ngã.
- **Rationale**: Người chơi vừa trải nghiệm trọn vẹn hành trình mở khóa kỹ năng & cày wave vô tận, vừa có chế độ Boss Rush thử ngay toàn bộ combo 5 skill & Ultimate của 6 anh hùng trong 3–5 phút.

---

## R7. Âm thanh 16-Bit Retro Pixel & Giao diện PC / Mobile

- **Decision**:
  - **Âm thanh**: Bộ tổng hợp Node.js thuần `scripts/mightyknight-pixel/build_audio.mjs` sinh WAV 44.1 kHz 16-bit phong cách **16-bit Retro Chiptune/FM** (không phụ thuộc mạng, chuẩn hóa `-1.0 dBFS` peak):
    - 4 bản nhạc nền lặp liền mạch (`lobby_theme`, `battle_grass`, `battle_volcano`, `boss_theme`).
    - 42 hiệu ứng SFX phân biệt theo chất liệu vũ khí, nguyên tố kỹ năng, tiếng *CLANG!* của Perfect Parry, tiếng còi Ultimate, tiếng rơi xu pixel.
  - **HUD Pixel-Clean**:
    - Thanh trên cùng: Thẻ đội hình (chân dung pixel `32×32`, HP, Fury, nút đổi tướng COM nhanh), bộ đếm Wave/Biome, thanh máu Boss 3 phân đoạn (đánh dấu ngưỡng Phase 2 ở 66% và Phase 3 ở 33%), đồng hồ Combo & Vàng.
    - Cụm điều khiển dưới-phải (PC hiển thị hotkey nhỏ, Mobile phóng lớn dễ bấm ngón cái): Nút đánh Combo trung tâm + vòng cung **4 nút Skill (hiển thị icon pixel, vòng cooldown, huy hiệu cấp Lv1–5)** + nút **Ultimate (rực lửa khi 100% Fury)** + nút **Dash** + nút **Guard/Parry**.
    - Thanh Upgrade nhanh & Relic Draft modal đóng/mở bằng `U` hoặc chạm biểu tượng (tự động đóng an toàn khi nhận sát thương nặng nếu bật tùy chọn).
- **Rationale**: Trực quan trên cả desktop lẫn màn hình điện thoại ngang, không che khuất chiến trường 2.5D pixel ở trung tâm.

---

## R8. Quy trình Kiểm chứng & Bảo mật Tài nguyên

- **Decision**:
  - Bổ sung 4 nhóm test tự động trong `server/test/` chạy bằng `node:test`:
    1. `mk-pixel-assets.test.cjs`: giải mã trực tiếp header + pixel từng file PNG trong `database-mighty-knight-pixel/`, **khẳng định cứng**:
       - Mọi Hero, Enemy, Boss có đúng `10 <= frames <= 15`.
       - Kích thước ảnh khớp đúng `cellW * frames × cellH`.
       - Không có pixel mờ anti-alias (alpha của nhân vật chỉ là `0` hoặc `255`).
       - Mọi `frameIdx` trong toàn bộ 60+ kịch bản `MkChoreoTimeline` đều nằm trong `0 .. frames - 1`.
    2. `mk-mechanics.test.cjs`: kiểm tra 3-hit combo, toàn bộ **30 kỹ năng chủ động + Ultimate** của 6 Hero, Perfect Parry, tiến hóa skill Lv3/Lv5, Relic Draft, Boss 3 giai đoạn, hồi sinh Co-op, đổi tướng COM.
    3. `mk-e2e-socket.test.cjs`: mô phỏng phòng chơi WebSocket nhiều người chơi thật, kiểm tra rate-limit, chống spam lệnh, reconnect, payout cược.
    4. `mk-static-security.test.cjs`: kiểm tra đường dẫn tĩnh `/database-mighty-knight-pixel` chặn path traversal (`..`, null byte, symlink thoát gốc, đuôi file lạ).
- **Rationale**: Đảm bảo 100% lời hứa thiết kế (2.5D pixel sắc nét, tối đa 10–15 ảnh/nhân vật, nhiều skill hoạt ảnh) được bảo vệ bằng kiểm thử tự động chứ không chỉ trên giấy.
