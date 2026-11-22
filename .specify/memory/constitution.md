<!--
Sync Impact Report
==================
- Version change: template (unratified) → 1.0.0 (Initial ratification of project constitution)
- Modified principles (initial definitions):
  - I. Gen 3 Pixel-Perfect Visual Cohesion & Hardware Discipline (NON-NEGOTIABLE)
  - II. Domain-Adapted Skill, Prompt & Tool Pipeline (NON-NEGOTIABLE)
  - III. Expedition-Style Turn-Based Combat & Vertical Skill UX
  - IV. Themed Realm Exploration, Gatekeepers & Iconic Multi-Phase Bosses
  - V. Data-Driven Single Source of Truth & Fair Authoritative Gacha
  - VI. Workspace Coexistence & Vietnamese-First Player Experience
  - VII. Spec-Driven Development & Verifiable Quality Gates
- Added sections:
  - Technical Stack & Asset Pipeline Constraints
  - Development Workflow & Quality Gates
  - Governance
- Removed sections: None
- Follow-up TODOs: None (all template placeholders resolved; game feature design and skill/prompt/tool refactoring are deferred to /speckit-specify and /speckit-plan)
-->

# Astral Expedition Pixel — Turn-Based Gacha RPG Constitution

## Core Principles

### I. Gen 3 Pixel-Perfect Visual Cohesion & Hardware Discipline (NON-NEGOTIABLE)
Mọi tài nguyên đồ họa 2D của game MUST tuân thủ chuẩn Pixel Art Gen 3 sắc nét kế thừa từ bộ pipeline `tools/gen3/`:
- **Lưới & Tỷ lệ**: Overworld, công trình và bản đồ dựng trên metatile gốc `16×16 px` xuất `×2` (`32×32 px`); sprite nhân vật overworld chuẩn `16×32 px` hoặc `32×32 px` (`4×4` walk/run); sprite chiến đấu chi tiết của nhân vật/quái chuẩn ô vuông `192×192 px` (vùng an toàn `160×160 px`) và mở rộng theo tỷ lệ cho trùm khổng lồ (`192×192` đến `256×256 px`).
- **Màu sắc & Pixel Craft**: Màu sắc MUST khóa về không gian `BGR555` (32 mức/kênh), kênh alpha nhị phân tuyệt đối `0` hoặc `255` (trừ lớp bóng/ánh sáng tùy chọn được quy định rõ), viền ngoại hình `#1b1726` sắc nét `1 px`, ánh sáng thống nhất từ trên-trái, render `nearest-neighbor` theo tỷ lệ nguyên (integer scaling) trên khung hình 16:9 wide (`320×180` PC / `390×180` điện thoại xoay ngang hoặc tỷ lệ nguyên tương đương).
- **Cấm tuyệt đối**: CẤM anti-aliasing, blur, soft glow trong sprite, mixel (pixel không đồng nhất kích thước), tỷ lệ chibi sai lệch thiết kế gốc, hiệu ứng nhấp nháy `> 3 Hz`, hoặc sao chép trực tiếp sprite/logo/tài sản trí tuệ từ game thương mại bên thứ ba.
- **Tách nền AI Draft**: Mọi bản vẽ sinh bằng AI MUST dùng nền đơn sắc `#FF00FF` (hoặc `#00FF00` cho chủ thể tím/hồng) và MUST đi qua bước chuẩn hóa tách viền (`magenta.py` / normalizer) không để sót viền hồng.

*Rationale*: Duy trì chất lượng mỹ thuật 2D pixel nhất quán như một tựa game thương mại hoàn chỉnh, bảo đảm độ sắc nét trên mọi độ phân giải và an toàn bản quyền 100%.

### II. Domain-Adapted Skill, Prompt & Tool Pipeline (NON-NEGOTIABLE)
Toàn bộ 11 skill trong `.agents/skills/`, các mẫu prompt trong `prompts/`, các pipeline Python trong `tools/` và từ điển `GLOSSARY.md` được kế thừa từ nguồn tham chiếu `Mons` MUST được chỉnh sửa, chuẩn hóa lại mô tả, cấu trúc thư mục đầu ra và quy ước nghiệp vụ để phục vụ đúng bài toán **Game 2D Pixel Turn-Based Gacha phong cách Expedition 33** trước hoặc song song với quá trình sản xuất tài nguyên chính thức:
- Thay thế toàn bộ khái niệm đặc thù Pokémon (`Pokémon`, `Pokédex`, `Poké Ball`, `Gym`, `Trainer`, `PokéAPI`) bằng thực thể nghiệp vụ của game mới (Hero/Expeditioner, Gacha Banner & Summon Orb, Realm/Biome, Gatekeeper Monster, Multi-Phase Boss, Vertical Skill Command Menu, Active Dodge/Parry Battle Poses, Skill VFX).
- Mỗi thư mục skill trong `.agents/skills/<skill-name>/` MUST chỉ chứa `SKILL.md` và `references/`; toàn bộ mã thực thi chuẩn hóa/sinh ảnh MUST đặt tại `tools/<domain>/` và mẫu prompt tại `prompts/<domain>/`.
- Mọi thay đổi ở script `tools/` hoặc format đầu ra MUST cập nhật đồng bộ `SKILL.md`, `prompts/` và `GLOSSARY.md` trong cùng một đợt thay đổi.

*Rationale*: Ngăn chặn xung đột ngữ cảnh giữa tên miền Pokémon cũ và nghiệp vụ game Turn-Based Gacha mới, giúp agent và công cụ tạo ảnh sinh đúng phong cách, bố cục và thuật ngữ ngay từ lần chạy đầu.

### III. Expedition-Style Turn-Based Combat & Vertical Skill UX
Hệ thống chiến đấu MUST mang bản sắc Turn-Based chiến thuật kịch tính lấy cảm hứng từ *Clair Obscur: Expedition 33* được chuyển thể trọn vẹn sang 2D Pixel Art:
- **Màn hình trận đấu tách biệt**: Sử dụng Battle Scene phân lớp (`backdrop`, `ground`, `platform-player`, `platform-enemy`, `props`) theo từng quần xã/đấu trường trùm; đội hình người chơi góc dưới-trái (`BACK` view nhìn chéo lên phải) đối đầu kẻ địch/trùm góc trên-phải (`FRONT` view nhìn chéo xuống trái).
- **Giao diện chọn kỹ năng dạng dọc (Vertical Skill Stack)**: Bảng lệnh và danh sách kỹ năng trong lượt MUST bố trí **xếp dọc** rõ ràng, có điểm tài nguyên lượt (AP/Năng lượng), biểu tượng nguyên tố/loại kỹ năng, độ ưu tiên lượt (Turn Order Timeline) và mô tả ngắn tiếng Việt dễ đọc ngay trong trận mà không che khuất diễn biến chiến trường.
- **Nhịp chiến đấu chủ động & Hoạt ảnh rõ ràng**: Hỗ trợ đầy đủ các trạng thái hoạt ảnh chiến đấu (`STANCE/ATTACK`, `HURT`, `DODGE/PARRY`, `FAINT`) kết hợp cơ chế phản xạ theo nhịp lượt (Né / Đỡ phản đòn / Tích Break / Stagger Boss) và hiệu ứng chiêu thức 2 lớp (`CAST` trên người thi triển + `EFFECT` di chuyển/va chạm + beam bằng code).
- **Khả năng đọc chiến trường**: VFX kỹ năng và chiêu cuối MUST giữ nguyên khung an toàn (không cắt mép ô) và TUYỆT ĐỐI KHÔNG che khuất tín hiệu báo đòn (telegraph) của quái hoặc trùm.

*Rationale*: Tạo ra dấu ấn gameplay khác biệt của thể loại Turn-Based hiện đại trên nền đồ họa 2D Pixel cổ điển, giữ sự mượt mà, trực quan và kịch tính trong từng lượt đánh.

### IV. Themed Realm Exploration, Gatekeepers & Iconic Multi-Phase Bosses
Thế giới khám phá Overworld MUST được tổ chức thành hành trình chinh phục các quần xã pixel có bản sắc thị giác, âm hưởng và thử thách riêng biệt:
- **Hành trình các bản đồ chủ đề**: Bao gồm các quần xã cốt lõi — **Đồng cỏ (Meadow)**, **Tuyết (Frost/Snow)**, **Sa mạc (Desert)**, **Dưới nước (Underwater/Abyss)**, **Núi lửa (Volcano)**, **Vùng Ban đêm (Nocturne)** và đấu trường kết thúc **Quang phổ mây trời ban đêm (Aurora Night-Sky Spectrum)** dành cho trận chiến Trùm cuối.
- **Quái gác cổng trên mỗi bản đồ (Gatekeeper Monsters)**: Mỗi bản đồ khám phá MUST bố trí các quái gác cổng hiển thị trực tiếp trên overworld tại các nút cổ chai, lối chuyển vùng hoặc điểm canh gác; khi người chơi di chuyển tới gần hoặc chạm vùng kiểm soát, quái sẽ chặn đường và kích hoạt trận chiến theo lượt tương ứng bối cảnh địa hình đó.
- **Trùm khu vực & Trùm cuối ấn tượng**: Thiết kế trùm MUST có silhouette đồ sộ, dễ nhận diện ngay lập tức, sở hữu đấu trường Battle Scene riêng, ít nhất 2–3 phase biến đổi hành vi/telegraph có ý nghĩa chiến thuật và cơ chế Break/Counter thay vì chỉ nâng chỉ số HP đơn thuần.
- **Chuẩn dựng bản đồ**: Mọi bản đồ dựng từ JSON Map Spec (`*.map.json`) kết hợp 47-tile blob autotile, công trình Signature Silhouette và xuất sang Tiled `.tmj`; MUST đạt `0` lỗi nối mép (seam errors) và `0` điểm kẹt đường.

*Rationale*: Gắn kết chặt chẽ trải nghiệm khám phá thế giới pixel với nhịp chiến đấu turn-based và cao trào đánh trùm, bảo đảm mỗi vùng đất đều mang lại cảm giác tiến trình rõ rệt.

### V. Data-Driven Single Source of Truth & Fair Authoritative Gacha
Toàn bộ thông số gameplay và kinh tế Gacha MUST được điều khiển bằng dữ liệu chuẩn hóa và xác thực minh bạch:
- **Single Source of Truth**: Danh mục nhân vật, kỹ năng, quái gác cổng, trùm, bảng chỉ số, công thức sát thương, bản đồ, phần thưởng và banner Gacha MUST lưu trong các file JSON có schema kiểm chứng tự động (`data/**/*.json`); CẤM sao chép hoặc hardcode bảng cân bằng rải rác trong mã giao diện.
- **Gacha công bằng & minh bạch**: Hệ thống Gacha MUST công khai đầy đủ tỷ lệ rơi theo từng độ hiếm, áp dụng bộ đếm bảo hiểm (Pity & Guaranteed) xác định rõ ràng, quy đổi bản sao trùng lặp minh bạch, và mặc định vận hành bằng tiền tệ kiếm qua gameplay (không pay-to-win, không dark pattern, không khóa nội dung cốt truyện sau tường trả phí).
- **Tính toàn vẹn trạng thái**: Mọi thao tác quay Gacha, nhận thưởng hạ gục quái gác cổng/trùm, mở khóa bản đồ và lưu tiến trình đội hình MUST được xử lý nguyên tử (atomic) và xác thực tại tầng logic/server có thẩm quyền (authoritative state), không tin cậy trực tiếp dữ liệu chỉnh sửa từ client.

*Rationale*: Bảo đảm tính cân bằng lâu dài, ngăn ngừa sai lệch dữ liệu giữa tài liệu thiết kế với runtime và tạo niềm tin cho người chơi ở hệ thống Gacha.

### VI. Workspace Coexistence & Vietnamese-First Player Experience
Dự án game mới MUST chung sống an toàn trong monorepo đa trò chơi `Exploding_kittens_v1.0.0_fake` đồng thời nhất quán chuẩn ngôn ngữ:
- **Không phá vỡ mode hiện có**: Mọi tích hợp mới vào `client/`, `server/`, `shared/`, `assets/`, `data/`, `tools/` và `specs/` MUST cô lập namespace/route/module rõ ràng; các chế độ game hiện hữu (`meo-no`, `ants`, `miragine`, `pikachu`, `ban-sung`, `total-war`, `mighty-knight-pixel`) MUST tiếp tục build và chạy kiểm thử xanh 100%.
- **Ngôn ngữ**: Toàn bộ giao diện, font pixel Việt hóa, tên vùng đất, lời thoại, bảng kỹ năng dọc, mô tả hiệu ứng và tài liệu giải thích thiết kế MUST dùng **tiếng Việt** tự nhiên, sắc nét; toàn bộ tên file, thư mục, ID, enum, API, field JSON và mã nguồn MUST dùng **tiếng Anh** (`kebab-case` cho file/asset, `camelCase`/`PascalCase` theo chuẩn TypeScript/Python).

*Rationale*: Bảo vệ độ ổn định của toàn bộ workspace hiện có trong khi đem lại trải nghiệm tiếng Việt bản địa chuẩn chỉ cho người chơi.

### VII. Spec-Driven Development & Verifiable Quality Gates
Mọi tính năng và tài nguyên game MUST đi qua chu trình Spec Kit chính thức (`constitution → specify → clarify → plan → tasks → implement`) với tiêu chuẩn kiểm chứng đo lường được:
- **Kiểm chứng tài nguyên tự động**: Trước khi đưa vào game, mọi PNG pixel art MUST pass `tools/gen3/check_gen3.py` (đúng chuẩn BGR555, alpha, palette), mọi sprite AI MUST pass kiểm tra sạch nền magenta và khung biên, mọi battle pose MUST pass kiểm tra hướng/chuyển động, mọi skill VFX MUST pass review hai chiều và mọi bản đồ MUST pass lint layout/seam.
- **Kiểm chứng mã nguồn & cân bằng**: Công thức sát thương, thứ tự lượt, cơ chế né/parry, tỷ lệ Gacha + Pity và va chạm quái gác cổng MUST có unit/integration test tự động; TypeScript client/server MUST pass `tsc --noEmit` và `npm run build` sạch lỗi.
- **Trung thực bằng chứng**: TUYỆT ĐỐI KHÔNG giả mạo kết quả test, ảnh chụp kiểm thử, số liệu mô phỏng Gacha hay trạng thái hoàn thành khi chưa chạy kiểm chứng thực tế.

*Rationale*: Loại bỏ lỗi đồ họa, lỗi gãy nhịp chiến đấu và lỗi hồi quy tích hợp ngay từ khâu thiết kế và xây dựng từng vertical slice.

## Technical Stack & Asset Pipeline Constraints

- **Client Runtime**: React 19 + Vite + TypeScript (lớp vỏ ứng dụng, menu/HUD tích hợp hoặc canvas 2D pixel nearest-neighbor) trong `client/`, hỗ trợ điều khiển bàn phím + chuột trên PC và chạm ngang (landscape touch) trên thiết bị di động.
- **Server & Shared Contracts**: NestJS 11 + Socket.IO + TypeScript trong `server/` và kiểu dữ liệu dùng chung tại `shared/` (phục vụ lưu tiến trình, xác thực Gacha, đồng bộ trạng thái hoặc mở rộng co-op/multiplayer về sau).
- **Asset & Content Pipeline**: Python 3 + Pillow (`PIL`) trong `tools/` (`gen3`, `overworld`, `structures`, `maps`, `battle-scenes`, `characters`, `ui`, `skills`, `items`, `agy`), kết hợp sinh ảnh AI single-shot qua `prompts/` và chuẩn hóa tự động; Tiled `.tmj`/`.tsj` cho bản đồ và tileset.
- **Asset Output & Data Layout**: Tài nguyên đã chuẩn hóa lưu tại `assets/<domain>/`, dữ liệu cân bằng/game lưu tại `data/<domain>/`, file nháp/preview tạm chỉ nằm trong `tmp/` (git-ignored, không commit bản nháp vào `assets/`).
- **Môi trường Python**: Cần cài đặt `pillow` cho Python cục bộ (`py` / `python3`) trước khi chạy các script tạo/kiểm chuẩn ảnh trong `tools/`; mọi đường dẫn trong script MUST dùng đường dẫn tương đối theo gốc repo, không hardcode đường dẫn riêng của một máy.

## Development Workflow & Quality Gates

1. **Pha 0 — Chuẩn hóa Pipeline**: Cập nhật/refactor `.agents/skills/`, `prompts/`, `tools/` và `GLOSSARY.md` từ miền Pokémon sang miền **Astral Expedition Pixel** (nhân vật Gacha, quái gác cổng, trùm đa phase, 6–7 quần xã, UI skill dọc kiểu Expedition 33).
2. **Pha 1 — Đặc tả & Làm rõ (Spec Kit)**: Viết `spec.md` (`/speckit-specify`), chốt các quyết định còn mở bằng `/speckit-clarify` (ví dụ: chốt số map 6 hay 7, kích thước đội hình ra trận, cơ chế AP & Dodge/Parry, bảng rarity & pity Gacha, tích hợp mode trong repo hay standalone).
3. **Pha 2 — Kiến trúc & Kế hoạch**: Lập `plan.md`, `data-model.md`, `contracts/` (`/speckit-plan`) và chia nhỏ danh sách tác vụ kiểm chứng được (`/speckit-tasks`).
4. **Pha 3 — Triển khai theo Vertical Slice**: Ưu tiên dựng hoàn chỉnh 1 vòng chơi mẫu (1 map Đồng cỏ + 1 quái gác cổng + 1 đội hình 3 nhân vật + Battle Screen menu dọc + 1 mini-boss) vượt qua toàn bộ Quality Gate trước khi nhân rộng sang Tuyết, Sa mạc, Dưới nước, Núi lửa, Ban đêm và Đỉnh Quang phổ mây trời ban đêm.
5. **Cổng chất lượng bắt buộc (Release Gates)**:
   - Asset Gate: `check_gen3.py` = `0 failed`, không sót `#FF00FF`, không cắt mép sprite/VFX, `0` lỗi seam bản đồ.
   - Logic & Math Gate: Unit test đạt 100% cho Turn Order, Damage/Break, Dodge/Parry, Gacha Pity và Gatekeeper Trigger.
   - Build Gate: `npm run build` (`client` + `server`) và `npm test --prefix server` sạch lỗi, không hồi quy các mode game cũ.

## Governance

- Hiến pháp này có hiệu lực cao nhất đối với mọi đặc tả (`spec.md`), kế hoạch (`plan.md`), danh sách công việc (`tasks.md`), skill, prompt và mã nguồn của dự án game 2D Pixel Turn-Based Gacha trong repository này.
- **Quy trình sửa đổi**: Mọi đề xuất thay đổi nguyên tắc MUST nêu rõ lý do, phạm vi ảnh hưởng tới `.agents/skills/`, `prompts/`, `tools/`, `specs/` và cập nhật lại `constitution.md` kèm Sync Impact Report thông qua `/speckit-constitution`.
- **Quy tắc đánh phiên bản (Semantic Versioning)**:
  - `MAJOR`: Xóa bỏ, thay thế hoặc định nghĩa lại nguyên tắc không tương thích ngược.
  - `MINOR`: Bổ sung nguyên tắc/mục mới hoặc mở rộng đáng kể phạm vi quản trị.
  - `PATCH`: Làm rõ câu chữ, sửa lỗi diễn đạt, tinh chỉnh nhỏ không đổi bản chất quy định.
- **Kiểm tra tuân thủ**: Mọi bước `/speckit-plan` và `/speckit-analyze` MUST có mục Constitution Check đối chiếu trực tiếp với 7 nguyên tắc trên; mọi ngoại lệ bắt buộc phải được ghi rõ lý do và kế hoạch khắc phục.

**Version**: 1.0.0 | **Ratified**: 2026-11-21 | **Last Amended**: 2026-11-21
