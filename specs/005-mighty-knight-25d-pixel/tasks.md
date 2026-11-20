# Tasks: Mighty Knight 2.5D Pixel (10–15 Frames/Character & Multi-Skill Animation)

**Input**: `plan.md`, `research.md` (R1–R8), `data-model.md`, `contracts/asset-atlas.md`, `contracts/socket.md`, `quickstart.md` trong `specs/005-mighty-knight-25d-pixel/`.
**Chiến lược tích hợp**: Nâng cấp thay thế trực tiếp chế độ `gameMode: 'mighty_knight'` hiện chưa commit sang bản **2.5D Pixel Art** mới tại `/database-mighty-knight-pixel` (xem `research.md` R1).
**Tests**: Có — bao gồm đủ 4 bộ test tự động yêu cầu trong `quickstart.md` §3 (`mk-pixel-assets.test.cjs`, `mk-mechanics.test.cjs`, `mk-e2e-socket.test.cjs`, `mk-static-security.test.cjs`).
**Lệnh kiểm chứng**: `npm run build`, `cd server && npm test`, `cd client && npx tsc --noEmit`.

## Format: `- [ ] [TaskID] [P?] [Story?] Description with file path`

- **[P]**: Có thể chạy song song (khác file, không phụ thuộc task chưa hoàn thành).
- **User Stories**:
  - **[US1]** (P1): Pipeline 2.5D Pixel Art (cứng 10–15 ảnh/nhân vật) & Động cơ Biên đạo 60 FPS Zero-Blur
  - **[US2]** (P1): Chiến đấu chuyên sâu — Combo 3 nhịp, Perfect Parry, 30 Kỹ năng chủ động & Ultimate
  - **[US3]** (P2): 4 Quần xã Vô tận, 8 Quái, 4 Đại Boss 3 giai đoạn, Boss Rush & 12 Thánh Vật Relic
  - **[US4]** (P2): Co-op 1–6 người chơi, Đồng đội AI COM, Đổi tướng linh hoạt & Hồi sinh
  - **[US5]** (P3): Âm thanh 16-bit Chiptune/FM & Trải nghiệm Điều khiển Mobile Landscape

---

## Phase 1: Setup (Khởi tạo dự án & Hạ tầng đường dẫn tĩnh)

- [X] T001 Kiểm tra mốc build/test ban đầu bằng `cd server && npm test` và `cd client && npx tsc --noEmit`, ghi nhận trạng thái hiện tại trước khi tái cấu trúc `mighty_knight` trong `server/test/`
- [X] T002 [P] Khởi tạo cấu trúc thư mục `scripts/mightyknight-pixel/` và `database-mighty-knight-pixel/{sprites/heroes,sprites/enemies,sprites/bosses,portraits,vfx,terrains,ui,audio/bgm,audio/sfx}` cùng `database-mighty-knight-pixel/LICENSES.md` và `database-mighty-knight-pixel/SOURCES.md`
- [X] T003 [P] Cập nhật cấu hình phục vụ tài nguyên tĩnh `/database-mighty-knight-pixel` (thay `/database-mighty-knigt`, giữ fail-closed `Guard` chỉ cho phép `GET/HEAD`, chặn `..`/null-byte/symlink, whitelist `.png,.webp,.jpg,.jpeg,.ogg,.mp3,.wav,.json` và JSON chỉ gồm `manifest.json`) trong `server/src/app.module.ts` và `client/vite.config.ts`

---

## Phase 2: Foundational (Hợp đồng dùng chung & Bảo mật — Chặn mọi User Story)

**Mục tiêu**: Khóa toàn bộ hằng số 2.5D Pixel (`640×360` / `1280×360`), giới hạn cứng `10–15 ảnh/nhân vật`, 60+ `MkChoreoTimeline`, 6 Hero × 5 Active/Ult Skill, 12 Quái/Boss, 12 Relic và bộ kiểm định đầu vào server.

- [X] T004 Định nghĩa lại hằng số & wire protocol 2.5D Pixel trong `shared/src/mk/types.ts`: `MK_STATIC_ROOT = '/database-mighty-knight-pixel'`, `MK_TICK_HZ = 30`, `MK_VIEW_W = 640`, `MK_VIEW_H = 360`, `MK_ARENA_W = 1280`, `MK_ARENA_H = 360`, `MK_LANE_TOP = 156`, `MK_LANE_BOTTOM = 326`, `MK_PLAYABLE_MIN_X = 32`, `MK_PLAYABLE_MAX_X = 1248`, `MK_MIN_CHAR_FRAMES = 10`, `MK_MAX_CHAR_FRAMES = 15`, `MK_HERO_CELL_PX = 48`, `MK_ENEMY_CELL_PX = 48`, `MK_BOSS_CELL_PX = 80`, `MK_FURY_MAX = 100`, `MK_PARRY_WINDOW_MS = 180`, `MK_GUARD_DURATION_MS = 450`, `MK_COMBO_RESET_MS = 900`, `MK_REVIVE_RADIUS_PX = 44`, `MK_REVIVE_DURATION_MS = 2500`, `MkConfig` (`playMode: 'endless' | 'boss_rush'`, `comBots: 0..3`, `difficulty`, `biome: 'auto' | 'grasslands' | 'jungle' | 'volcano' | 'citadel'`, `allowSwitchCom`), `MkCommand` (10 lệnh theo `contracts/socket.md`), `MkFighterView`, `MkEnemyView`, `MkZoneView`, `MkUltCutInEvent`, `MkFrame`
- [X] T005 [P] Tạo bảng định nghĩa 12 Thánh Vật Roguelite (`vampiric_fang`, `chrono_crystal`, `phantom_cloak`, `thunder_sigil`, `parry_emblem`, `fury_core`, `giant_slayer`, `frost_brand`, `midas_coin`, `phoenix_feather`, `aegis_rune`, `combo_master`) kèm hàm roll 3 lựa chọn không trùng trong `shared/src/mk/relics.ts`
- [X] T006 [P] Cập nhật đầy đủ 6 Anh Hùng (`knight`, `archer`, `rogue`, `barbarian`, `mage`, `lancer`) với chỉ số gốc theo hệ `640×360`, 3 đòn combo, 4 Active Skill (`s1` mở sẵn Lv1, `s2..s4` mở khóa bằng vàng Lv1–5 có tiến hóa VFX Lv3/Lv5), 1 Ultimate (`100 Fury`), 2 Nội tại và hàm tính giá nâng cấp trong `shared/src/mk/heroes.ts`
- [X] T007 [P] Cập nhật đầy đủ 8 Quái Vật (`skull_imp`, `goblin_raider`, `shield_orc`, `bone_brute`, `bomber_imp`, `nether_ghost` = **11 frames** `48×48`; `tribal_shaman`, `frost_archer` = **12 frames** `48×48`) và 4 Đại Boss 3 giai đoạn (`boss_elder_shaman`, `boss_war_chieftain`, `boss_lava_golem`, `boss_abyss_lord` = **15 frames** `80×80`) kèm kiểm định `MK_MIN_CHAR_FRAMES <= frameCount <= MK_MAX_CHAR_FRAMES` trong `shared/src/mk/enemies.ts`
- [X] T008 Tạo hệ thống biên đạo `MkPixelAtlasSpec`, `MkChoreoStep`, `MkChoreoTimeline` và toàn bộ 60+ kịch bản hoạt ảnh (`idle`, `walk`, `combo1..3`, `dash_atk`, `skill1..4`, `ultimate`, `dash`, `guard`, `parry_ok`, `hit`, `dead` cho 6 Hero; trạng thái cho 8 Quái & 4 Boss) chỉ tham chiếu chỉ số `0..14` kèm `dx`, `dz`, `flipX`, `afterimage`, `hitstopMs`, `hitboxTag`, `vfx` (có `minSkillLevel: 1 | 3 | 5`) và `sfx` trong `shared/src/mk/choreo.ts`
- [X] T009 Cập nhật barrel export `shared/src/mightyknight.ts` (export `types`, `heroes`, `enemies`, `relics`, `choreo`) và cập nhật mô tả chế độ `'mighty_knight'` trong `shared/src/protocol.ts`
- [X] T010 [P] Cập nhật bộ kiểm định đầu vào & rate-limiter (`<= 24 lệnh/s`, validate đủ 10 loại `MkCommand` gồm `skill.slot ∈ {1,2,3,4}`, `ultimate`, `guard`, `pick_relic`, chặn `NaN/Infinity` ở `mx/my`, validate `playMode` & 4 `biome` trong `normalizeMkConfig`) tại `server/src/game/mk/security.ts`
- [X] T011 [P] Cập nhật kiểm thử bảo mật đường dẫn tĩnh `/database-mighty-knight-pixel` (chặn `POST/PUT`, `..`, `%00`, `%2e%2e`, dotfile, symlink thoát gốc, file JSON ngoài `manifest.json`) trong `server/test/mk-static-security.test.cjs`

**Checkpoint**: `cd shared && npx tsc --noEmit` (hoặc build server) biên dịch sạch toàn bộ hợp đồng dùng chung và `mk-static-security.test.cjs` chạy qua.

---

## Phase 3: User Story 1 (P1) — Pipeline 2.5D Pixel Art (10–15 Ảnh/Nhân Vật) & Động Cơ 60 FPS Zero-Blur 🎯 MVP

**Goal**: Tạo trọn bộ tài nguyên 2.5D Pixel Art sắc cạnh đạt chuẩn cứng `10–15 ảnh/nhân vật` (18 Master Strip PNG + 18 Pixel VFX + 4 Quần xã × 5 lớp + Icon), khóa bằng test tự động, và dựng bộ render Canvas `640×360` zero-blur với `MkChoreoPlayer`, Y-sort, trục Z, 5 lớp parallax, dư ảnh pixel & hitstop.

**Independent Test**:
1. Chạy pipeline sinh tài nguyên và `node --test server/test/mk-pixel-assets.test.cjs`: 100% nhân vật thỏa `10 <= frames <= 15`, đúng kích thước `cellW * frames × cellH`, 100% alpha nhị phân `0/255`, 100% `step.frame` trong `choreo.ts` hợp lệ.
2. Client `MkRenderer` dựng chiến trường `640×360` (`imageSmoothingEnabled = false`) hiển thị nhân vật sắc nét, nhảy trục Z có bóng thu nhỏ, 5 lớp parallax và phát mượt các kịch bản kỹ năng có `flipX`, dư ảnh & VFX phân lớp `ground/behind/front`.

### Tests cho US1

- [X] T012 [P] [US1] Viết bộ kiểm thử tự động `server/test/mk-pixel-assets.test.cjs` giải mã trực tiếp header + pixel từng PNG trong `database-mighty-knight-pixel/`: kiểm định cứng `10 <= frames <= 15` cho đủ 6 Hero (15f, `720×48`), 6 Quái thường (11f, `528×48`), 2 Quái tinh anh (12f, `576×48`), 4 Đại Boss (15f, `1200×80`); kiểm tra alpha nhị phân `0/255` cho 100% sprite nhân vật; kiểm tra 18 VFX, 4 Biome × 5 lớp, chân dung `32×32`, và kiểm tra mọi `step.frame` trong `MK_CHOREO_TIMELINES` thỏa `0 <= frame < frameCount`

### Asset Pipeline cho US1

- [X] T013 [P] [US1] Tạo bộ công cụ vẽ pixel 1:1 `scripts/mightyknight-pixel/palette.py` gồm bảng màu Dark-Fantasy 32 màu chuẩn hóa, hàm raster pixel nguyên (không anti-alias, không Lanczos), bộ lọc viền tự động 1px `#140c1c`, dithering Bayer 2×2 và hàm kiểm định alpha nhị phân `0/255`
- [X] T014 [US1] Viết script `scripts/mightyknight-pixel/build_pixel_sprites.py` sinh 18 Master Strip PNG đúng bản đồ khung `0..14` của `contracts/asset-atlas.md` (6 Hero × 15f `48×48`, 6 Quái × 11f `48×48`, 2 Tinh anh × 12f `48×48`, 4 Boss × 15f `80×80`, hướng nhìn mặc định PHẢI, chân neo `(24,44)`/`(40,74)`) và 6 chân dung pixel `32×32` vào `database-mighty-knight-pixel/sprites/` và `portraits/`
- [X] T015 [P] [US1] Viết script `scripts/mightyknight-pixel/build_pixel_vfx_ui.py` sinh 18 dải Pixel VFX (`slash_crescent`, `slash_cross_x`, `whirlwind_360`, `holy_pillar`, `ground_fissure`, `fire_meteor`, `lightning_bolt`, `frost_nova`, `gravity_vortex`, `dragon_spirit`, `phoenix_flame`, `magic_rune_25d`, `parry_ring`, `aura_fury`, `hit_spark`, `dust_puff`, `projectiles_sheet`, `pickups_sheet`), 4 Quần xã Pixel × 5 lớp parallax (`bg_sky`, `bg_far`, `bg_mid`, `ground_arena`, `fg_silhouette`), và bộ icon pixel cho 30 Skill, 12 Relic, 4 Stat, nút bấm UI vào `database-mighty-knight-pixel/`
- [X] T016 [US1] Viết script `scripts/mightyknight-pixel/build_manifest.mjs` quét toàn bộ PNG/WAV trên đĩa, từ chối build nếu bất kỳ nhân vật nào vi phạm `10 <= frames <= 15` hoặc sai kích thước `cellW * frames × cellH`, và xuất `database-mighty-knight-pixel/manifest.json` theo schema tại `contracts/asset-atlas.md` §6; chạy toàn bộ pipeline (T014–T016) và xác minh `mk-pixel-assets.test.cjs` PASS

### Client 2.5D Pixel Renderer & Choreography Engine cho US1

- [X] T017 [P] [US1] Viết lại bộ nạp tài nguyên pixel `client/src/mk/sprites.ts` đọc `/database-mighty-knight-pixel/manifest.json`, nạp 1 Master Strip/nhân vật, quản lý hàng đợi ưu tiên Tier 1/2 (tối đa 6 concurrent), LRU cache nhuộm bảng màu pixel (`imageSmoothingEnabled = false`, tối đa 96 slot) cho chớp trắng/vàng/nguyên tố & dư ảnh, cùng fallback hình khối pixel sắc cạnh khi ảnh đang tải
- [X] T018 [P] [US1] Tạo động cơ giải mã biên đạo 60 FPS `client/src/mk/choreoPlayer.ts` ánh xạ `(heroId/enemyId, actionId, actionTick)` sang `MkChoreoTimeline`: tính chính xác `frame ∈ [0..14]`, `flipX`, dịch chuyển nguyên pixel `(dx, dz)`, kích hoạt dư ảnh pixel (`afterimage`), chớp màu (`flashColor`), micro-hitstop cục bộ `35–85 ms` khi trúng đòn, và phát hiện đúng mốc kích hoạt `vfx` (lọc theo `minSkillLevel`) / `sfx`
- [X] T019 [P] [US1] Cập nhật hệ thống pool hiệu ứng `client/src/mk/vfx.ts` (pool 96 slot zero-GC, khử trùng lặp ID, phân 4 lớp `ground`/`behind`/`front`/`screen`, hỗ trợ 18 dải Pixel VFX nhuộm màu, tia sét pixel gấp khúc, vòng cảnh báo Boss 2.5D, đạn & vùng `MkZoneView`) và `client/src/mk/particles.ts` (pool 250 hạt pixel vuông `1×1..3×3` nguyên tọa độ + chữ sát thương pixel `normal/crit/skill/parry/evade/heal`)
- [X] T020 [US1] Viết lại `client/src/mk/render.ts` dựng Canvas 2.5D Pixel logic **`640×360`** (`imageSmoothingEnabled = false`, làm tròn tọa độ `Math.round()`), vẽ 5 lớp Parallax (`0.18x`, `0.42x`, `0.72x`, `1.00x`, `1.22x`) theo 4 Quần xã, Y-Sort chuẩn `footY` cho Pickup/Zone/Enemy/Boss/Hero, bóng elip pixel dính đất thu nhỏ rời rạc theo độ cao `z`, vệt dư ảnh tối đa 4 bóng/đơn vị, rung camera nguyên pixel (`1–3` virtual px) và thanh máu/khiên/Fury sắc cạnh

**Checkpoint US1**: Chạy `node --test server/test/mk-pixel-assets.test.cjs` PASS 100% và `cd client && npx tsc --noEmit` không lỗi ở lớp render pixel.

---

## Phase 4: User Story 2 (P1) — Chiến Đấu Chuyên Sâu: Combo 3 Nhịp, Perfect Parry, 30 Kỹ Năng & Ultimate 🎯 MVP

**Goal**: Toàn bộ lối chơi hành động chặt chém đa kỹ năng hoạt động chuẩn xác trên Server 30 Hz và Client 60 FPS: Combo 3 nhịp có Animation Cancel, Dash-Attack, Guard & Perfect Parry (`180 ms`), 4 Active Skill tiến hóa Lv3/Lv5 + 1 Awakening Ultimate (`100 Fury`) cho đủ 6 Anh Hùng (30 kỹ năng) kèm Banner Cut-In 0.45s.

**Independent Test**:
1. `server/test/mk-mechanics.test.cjs` chứng minh đủ 30 kỹ năng chủ động/Ultimate của 6 Hero, Combo 3 nhịp, Dash-Attack, Animation Cancel, Perfect Parry (`+20 Fury`, `-30% CD`, phản sát thương), và VFX Evolution Lv3/Lv5.
2. Trong trận trên trình duyệt, người chơi điều khiển bất kỳ Hero nào đánh combo 3 nhịp, đỡ Perfect Parry, bấm đủ 4 kỹ năng `K/L/I/O`, tụ 100 Fury tung Ultimate `R` thấy Banner Cut-In 0.45s và hoạt ảnh bùng nổ.

### Tests cho US2

- [X] T021 [US2] Cập nhật `server/test/mk-mechanics.test.cjs` bổ sung test kịch bản chiến đấu cốt lõi: nối chuỗi Combo `combo1 → combo2 → combo3` trong cửa sổ `900 ms` & reset khi quá hạn; Dash-Attack; Animation Cancel chỉ cho phép sau `cancelAfterMs`; Guard chặn giảm sát thương & Perfect Parry trong `180 ms` đầu chặn 100% sát thương + phản đòn + `+20 Fury` + giảm `30%` CD; gọi lần lượt toàn bộ **30 kỹ năng (6 Hero × `skill1..4` + `ultimate`)** xác minh sát thương, trạng thái (`stun`, `slow`, `burn`, `poison`, `pull`, `counter`, `shield`), kiểm tra khóa khi Lv0/CD>0/Fury<100 và kiểm tra sự kiện `fx` mang `skillLevel = 3 | 5`

### Server Combat & 30 Skills cho US2

- [X] T022 [US2] Nâng cấp `server/src/game/mk/combat.ts` triển khai hệ thống chiến đấu 2.5D mới trên trục `1280×360`: Combo 3 nhịp (`combo1 → combo2 → combo3`, cửa sổ `900 ms`) & Dash-Attack, Animation Cancel theo `cancelAfterMs` từ `choreo.ts`, Guard (`450 ms`) & Perfect Parry (`180 ms` đầu → `parry_ok`, phản sát thương + `+20 Fury` + giảm 30% CD mọi skill + phát VFX `parry_ring` & SFX), xử lý độ cao `z` (knock-up/rơi trọng lực), lớp giáp ảo `shieldHp`, trạng thái `poison/burn/slow/stun/armorBreak`, và nạp thanh `fury` (`+3` đánh trúng, `+6` hạ gục, `+8` trúng đòn, `+20` Perfect Parry)
- [X] T023 [US2] Viết lại `server/src/game/mk/skills.ts` thực thi quyết định toàn bộ **30 kỹ năng chủ động & Ultimate** của 6 Hero theo `data-model.md` §3 (Knight: Cuồng Phong Kiếm, Thánh Kiếm Trừng Phạt, Hộ Thuẫn Xung Kích, Kiếm Khí Xuyên Phá, Thánh Quang Phán Quyết; Archer: Mũi Tên Xuyên Thấu, Mưa Tên Băng Giá, Lốc Xoáy Lùi Bước, Bẫy Dây Leo Sét, Phượng Hoàng Tiễn; Rogue: Liên Hoàn Song Đoản, Bóng Ma Ám Sát, Phi Tiêu Độc Tốc, Ảnh Phân Thân, Dạ Ảnh Trảm Không; Barbarian: Ném Rìu Hủy Diệt, Địa Chấn Cuồng Nộ, Hú Chiến Cuồng Huyết, Xích Hỏa Kéo Địch, Nham Thần Hàng Thế; Mage: Thiên Thạch Rực Lửa, Bão Sét Hỗn Nguyên, Hố Đen Hút Quái, Thuấn Di Phản Nổ, Cửu Tinh Hủy Diệt; Lancer: Thương Long Xuyên Giáp, Tam Thương Bộc Phá, Long Hồn Liên Kích, Long Lân Phản Chấn, Thanh Long Xuất Hải), kèm mô phỏng `MkZoneSim` (Hố đen hút tụ, Mưa tên băng, Bẫy sét, Hồ dung nham, Phân thân khiêu khích), tiến hóa sát thương/VFX ở Lv3 & Lv5 và phát `ultCutIns`
- [X] T024 [US2] Nâng cấp `server/src/game/mk/world.ts` xử lý đủ các lệnh chiến đấu `attack`, `skill(1..4)`, `ultimate`, `dash`, `guard`, cập nhật `actionId`/`actionTick` đồng bộ `MkChoreoTimeline`, bước mô phỏng `zones` mỗi tick 30 Hz, và đóng gói tọa độ nguyên vào `mk:frame`

### Client Input, Store & Skill Combat UI cho US2

- [X] T025 [P] [US2] Cập nhật `client/src/mk/store.ts` nội suy 60 FPS trạng thái mới (`actionId`, `actionTick`, `fury`, `shieldHp`, `cds.s1..s4`, `zones`, `ultCutIns`, `relics`, `pendingRelicChoices`) và phát tín hiệu hitstop/cut-in cho UI
- [X] T026 [P] [US2] Cập nhật `client/src/mk/input.ts` hỗ trợ hàng đợi đệm phím Combo (`J`/`Z`), 4 nút kỹ năng (`K`/`L`/`I`/`O` và `1–4`), Ultimate (`R`), Dash (`Space`/`Shift`), Guard/Parry (`E`), Đổi tướng COM (`Q`/`Tab`) và mở Nâng cấp (`U`)
- [X] T027 [P] [US2] Tạo component `client/src/components/mk/MkUltCutIn.tsx` hiển thị Banner Chân Dung Pixel Cut-In gọn góc trên-trái trong `450 ms` (không chặn thao tác đồng đội Co-op) khi nhận sự kiện `ultCutIns`
- [X] T028 [US2] Cập nhật `client/src/components/mk/MkControls.tsx` và `client/src/components/MkBoard.tsx` gắn cụm điều khiển **Đánh Combo + 4 nút Skill (hiển thị icon pixel, khóa ổ khóa khi Lv0, vòng cooldown, huy hiệu Lv1–5) + nút Ultimate rực lửa khi 100% Fury + nút Dash + nút Guard/Parry** cùng `<MkUltCutIn />`

**Checkpoint US2**: Toàn bộ test chiến đấu & 30 kỹ năng trong `mk-mechanics.test.cjs` PASS; chơi thử thực chiến đánh Combo 3 nhịp, Parry, 4 Skill và Ultimate mượt mà.

---

## Phase 5: User Story 3 (P2) — 4 Quần Xã Vô Tận, 8 Quái, 4 Đại Boss 3 Giai Đoạn, Boss Rush & 12 Thánh Vật Relic

**Goal**: Hoàn thiện chiều sâu vòng lặp PvE: Endless Challenge qua 4 Quần xã Pixel, chế độ Boss Rush vào thẳng 4 Đại Boss cường hóa, 8 loại quái chiến thuật (Orc Khiên Sắt, Quỷ Ôm Bom, Pháp Sư, Cung Băng, Hồn Ma Kho Báu), 4 Đại Boss chuyển pha 66%/33% HP có cảnh báo Telegraph, bảng Nâng cấp 4 Skill hiển thị tiến hóa Lv3/Lv5 và bảng chọn 1/3 Thánh Vật Relic sau mỗi Boss.

**Independent Test**:
1. `mk-mechanics.test.cjs` chứng minh: Orc Khiên giảm 40% sát thương mặt trước; Boss đổi Phase 2/3 ở 66%/33% HP kèm `ENRAGE_ROAR` và Telegraph; hạ Boss chuyển sang `phase = 'relic_draft'` (`12s`), chọn 1/3 Relic hợp lệ cộng dồn chỉ số/hiệu ứng (từ chối `relicId` giả mạo); chế độ Boss Rush khởi đầu Lv5 + 450 Vàng + mở sẵn 4 Skill và kết thúc `victory = true` sau Boss 4.
2. Trên giao diện, bảng Nâng cấp hiển thị rõ mốc tiến hóa Lv3/Lv5 của 4 Skill và Modal chọn 1/3 Relic tự hiện sau khi hạ Boss.

### Tests cho US3

- [X] T029 [US3] Mở rộng `server/test/mk-mechanics.test.cjs` thêm kiểm thử vòng lặp PvE & Roguelite: hành vi `shield_orc` (-40% dmg mặt trước) & `bomber_imp` (nổ phản được bằng Parry), xoay vòng 4 Quần xã mỗi 5 wave, Boss đổi Phase 2/3 ở 66%/33% HP + vòng Telegraph, chuyển pha `relic_draft` (chọn hợp lệ & từ chối Relic ngoài danh sách + auto-pick khi hết 12s), áp dụng hiệu ứng 12 Relic (vd `phoenix_feather` tự hồi sinh 1 lần 60% HP, `phantom_cloak` đánh trễ dư ảnh, `chrono_crystal` giảm 14% CD), và luồng chiến thắng chế độ `boss_rush`

### Server Waves, 4 Bosses & Relics cho US3

- [X] T030 [US3] Cập nhật `server/src/game/mk/upgrades.ts` quản lý nâng cấp `atk/hp/def/spd` (Lv1→15), `s1..s4` (Lv0→5), `p1/p2` (Lv0→5), tính toán tác động của đủ **12 Thánh Vật Relic** (`vampiric_fang`..`combo_master`) bao gồm tự hồi sinh `phoenix_feather` và giáp đầu wave `aegis_rune`, và khởi tạo nhanh Lv5 + 450 Vàng + mở sẵn `s1..s4 = 1` cho `playMode === 'boss_rush'`
- [X] T031 [US3] Nâng cấp `server/src/game/mk/waves.ts` triển khai 8 loại quái với hành vi riêng (`shield_orc` đỡ mặt trước, `bomber_imp` đếm ngược phát nổ, `tribal_shaman` hồi máu đồng minh, `frost_archer` giữ cự ly bắn chậm, `nether_ghost` chạy trốn rớt kho báu), xoay vòng 4 Quần xã (`grasslands → jungle → volcano → citadel`) mỗi 5 wave, Mini-Boss mỗi wave 3/8/13…, và **4 Đại Boss 3 Giai Đoạn** (ngưỡng 66%/33% HP phát `ENRAGE_ROAR`, vòng Telegraph mặt đất 2.5D và đòn đặc biệt theo Phase)
- [X] T032 [US3] Tích hợp máy trạng thái đầy đủ `wave_intro (1.8s) → combat → wave_clear (1.5s, hồi 15% HP) / relic_draft (12s, chọn 1/3 Relic, auto-pick khi hết giờ) → ended` và chế độ `boss_rush` (liên hoàn 4 Đại Boss) vào `server/src/game/mk/world.ts`

### Client Progression & Boss HUD cho US3

- [X] T033 [P] [US3] Tạo bảng chọn 1/3 Thánh Vật `client/src/components/mk/MkRelicModal.tsx` hiển thị 3 thẻ Relic kèm icon pixel, mô tả hiệu ứng, số stack hiện tại, đồng hồ đếm ngược 12 giây và gửi `{ t: 'pick_relic', relicId }`
- [X] T034 [P] [US3] Cập nhật bảng nâng cấp `client/src/components/mk/MkUpgradeModal.tsx` hỗ trợ đủ 4 chỉ số, **4 Kỹ năng chủ động (hiển thị nổi bật mốc Tiến hóa VFX ở Lv3 và Lv5)**, 2 Nội tại và danh sách Thánh Vật đang sở hữu
- [X] T035 [US3] Cập nhật `client/src/components/mk/MkHudTop.tsx` hiển thị tên Quần xã Pixel, bộ đếm Wave/Boss Rush, thanh máu Đại Boss có vạch chia rõ 3 giai đoạn (66% / 33%), chuỗi Combo, Vàng và tích hợp `<MkRelicModal />` vào `client/src/components/MkBoard.tsx`

**Checkpoint US3**: Chạy `cd server && npm test` với toàn bộ test Endless, Boss 3 Phase, Boss Rush và 12 Relic đều PASS.

---

## Phase 6: User Story 4 (P2) — Co-op 1–6 Người Chơi, Đồng Đội AI COM, Đổi Tướng & Hồi Sinh

**Goal**: Hoàn chỉnh trải nghiệm tổ đội Co-op 1–6 người + 0–3 AI COM thông minh: đổi tướng COM mượt ngay trong trận (`Q`/`Tab`), hồi sinh đồng đội 2.5 giây (frame `14` `DOWN_DEAD`), sảnh chờ chọn Hero Pixel & chế độ chơi, và kết nối trọn vẹn với `Game`, `RoomsService`, `GameGateway` (kèm cược xu & reconnect).

**Independent Test**:
1. `server/test/mk-e2e-socket.test.cjs` chứng minh phòng 2 người chơi + 1 COM qua Socket.IO thật: chọn Hero & cấu hình Endless/Boss Rush, nhận `mk:frame` 30 Hz, dùng `switch_com`, hồi sinh đồng đội sau 2.5s, chặn khán giả gửi lệnh, rate-limit chặn spam >24 lệnh/s, reconnect đồng bộ lại đầy đủ và trả thưởng khi kết thúc.
2. Trên trình duyệt, vào sảnh tạo phòng chọn Hero pixel (xem trước 4 Skill + Ultimate), đổi tướng COM bằng `Q` hoặc chạm thẻ `MkPartyBar`, và xem bảng tổng kết MVP/Parry/Relic cuối trận.

### Tests cho US4

- [X] T036 [US4] Nâng cấp bộ kiểm thử Socket.IO thật `server/test/mk-e2e-socket.test.cjs`: kiểm tra `mk:config` (`endless`/`boss_rush`, 4 `biome`, `comBots`), `mk:hero`, chạy trận 2 người + 1 COM nhận `mk:frame` 30 Hz, gửi `switch_com` đổi quyền điều khiển, kiểm tra Co-op Revive 2.5s, kiểm tra khán giả bị từ chối `'Bạn đang xem trận đấu.'`, rate-limit 24 lệnh/s, F5/reconnect giữ nguyên trạng thái & Relic, và trả kết quả tổng kết cuối trận

### Server AI COM & Room Integration cho US4

- [X] T037 [US4] Nâng cấp AI đồng đội `server/src/game/mk/bot.ts` cho phép COM đánh Combo 3 nhịp, sử dụng cả 4 Active Skill theo tình huống (ưu tiên gom quái/khống chế/hỗ trợ), tung Ultimate khi đầy `100 Fury`, tự Dash né khỏi vòng cảnh báo Telegraph của Boss, và tự chạy tới hồi sinh đồng đội gục ngã gần nhất
- [X] T038 [US4] Kiểm tra và đồng bộ hóa kết nối `MkWorld` với `server/src/game/game.ts`, `server/src/game/rooms.service.ts`, `server/src/game/game.gateway.ts` (đảm bảo `mk:config`, `mk:hero`, `mk:cmd` truyền đủ payload mới, `RoomView.mk` đồng bộ `playMode`/4 `biome`, và `onEnd` gọi đúng cơ chế payout/hoàn cược)

### Client Lobby, Party & Result UI cho US4

- [X] T039 [P] [US4] Cập nhật `client/src/components/Lobby.tsx` và `client/src/components/Home.tsx` cho chế độ **Mighty Knight 2.5D Pixel**: thêm tùy chọn **Endless Challenge / Boss Rush**, 4 Quần xã Pixel, bảng chọn 6 Hero hiển thị **chân dung pixel `32×32` (`image-rendering: pixelated`)** và tóm tắt **4 Kỹ năng + Ultimate**
- [X] T040 [P] [US4] Cập nhật `client/src/components/mk/MkPartyBar.tsx` hiển thị chân dung pixel `32×32`, thanh HP + Giáp ảo `shieldHp` + thanh `Fury`, trạng thái gục ngã cần hồi sinh và nút đổi tướng sang COM nhanh (phím `Q`/`Tab` hoặc chạm trực tiếp)
- [X] T041 [P] [US4] Cập nhật `client/src/components/mk/MkResultModal.tsx` hiển thị kết quả Chiến Thắng (Boss Rush) / Wave đạt được (Endless), vinh danh MVP, sát thương, số lần hạ gục, số lần **Perfect Parry** và bộ Thánh Vật Relic mỗi thành viên đã thu thập

**Checkpoint US4**: `mk-e2e-socket.test.cjs` PASS 100% và luồng Sảnh chờ → Trận đấu Co-op → Đổi COM → Hồi sinh → Tổng kết chạy thông suốt.

---

## Phase 7: User Story 5 (P3) — Âm Thanh 16-Bit Chiptune/FM & Điều Khiển Mobile Landscape

**Goal**: Tạo trọn bộ âm thanh 16-bit Retro Chiptune/FM (4 BGM + 42 SFX) không phụ thuộc mạng, đồng bộ WebAudio thông minh phía client, và tối ưu giao diện HUD pixel sắc nét + cụm điều khiển cảm ứng điện thoại ngang `844×390` không chồng chéo.

**Independent Test**:
1. Chạy `node scripts/mightyknight-pixel/build_audio.mjs` và `mk-pixel-assets.test.cjs`: đủ 4 file BGM + 42 file SFX định dạng 44.1 kHz 16-bit PCM WAV hợp lệ trong `database-mighty-knight-pixel/audio/`.
2. Chơi thử trên màn hình `1280×720` và điện thoại ngang `844×390`: âm thanh chuyển mượt giữa Sảnh / Chiến đấu / Boss, tiếng *CLANG!* của Perfect Parry và tiếng còi Ultimate vang rõ không vỡ tiếng, nút bấm cảm ứng gọn gàng không che nhân vật trung tâm.

### Audio Pipeline & Client Sound Engine cho US5

- [X] T042 [P] [US5] Viết script tổng hợp âm thanh thuần Node.js `scripts/mightyknight-pixel/build_audio.mjs` sinh 4 bản nhạc nền lặp liền mạch phong cách 16-bit Chiptune/FM (`lobby_theme.wav`, `battle_grass.wav`, `battle_volcano.wav`, `boss_theme.wav`) và 42 hiệu ứng SFX (combo 1–3 theo từng loại vũ khí, 6 hệ kỹ năng, *CLANG!* Perfect Parry, Ultimate fanfare, Boss roar, thu xu, chọn Relic, hồi sinh) ở chuẩn 44.1 kHz 16-bit WAV chuẩn hóa `-1.0 dBFS` vào `database-mighty-knight-pixel/audio/`; chạy lại `build_manifest.mjs` để cập nhật mục `audio` trong `manifest.json`
- [X] T043 [US5] Cập nhật `client/src/mk/sound.ts` phát 4 BGM chuyển theo trạng thái/Quần xã/Boss (`lobby_theme` / `battle_grass` / `battle_volcano` / `boss_theme`), quản lý pool cho 42 SFX với chống dội tiếng cùng loại (`throttle 45 ms`), ưu tiên SFX `parry`/`ultimate`/`level_up`, dự phòng WebAudio synth khi chưa tải kịp và đồng bộ nút tắt tiếng chung (`syncMkMute` / `stopMkBgm` trong `client/src/App.tsx`)

### Pixel Theme & Mobile Landscape UX cho US5

- [X] T044 [P] [US5] Viết lại bảng kiểu `client/src/mk/mk.css` theo phong cách **Pixel RPG sắc cạnh** (`image-rendering: pixelated`, viền khung pixel 2px gọn gàng, tối ưu responsive cho Desktop `1280×720`/`1920×1080` và Mobile Landscape `844×390` với safe-area insets)
- [X] T045 [US5] Tinh chỉnh bố cục cảm ứng vòng cung trên `client/src/components/mk/MkControls.tsx` và hướng dẫn phím tắt trong `client/src/components/MkBoard.tsx` để Joystick trái và cụm **Combo + 4 Skill + Ultimate + Dash + Guard/Parry** bên phải bấm chính xác bằng hai ngón cái, không chồng lấn HUD trên màn `844×390`

**Checkpoint US5**: Toàn bộ 4 BGM & 42 SFX hoạt động sạch không rò rỉ WebAudio; giao diện PC & Mobile sắc nét không cuộn ngang hay đè nút.

---

## Phase 8: Polish & Cross-Cutting Verification (Hoàn thiện, Dọn dẹp & Nghiệm thu E2E)

- [X] T046 Gỡ bỏ thư mục tài nguyên & script bản thử nghiệm cartoon cũ (`database-mighty-knigt/` và `scripts/mightyknight/`) và rà soát toàn bộ repo không còn tham chiếu chuỗi `database-mighty-knigt` (trừ ghi chú lịch sử trong `specs/` nếu có)
- [X] T047 [P] Cập nhật mục **Mighty Knight 2.5D Pixel** trong `README.md` (mô tả cơ chế 10–15 ảnh/nhân vật, 6 Anh Hùng × 5 Kỹ năng/Ultimate, Perfect Parry, 4 Quần xã, 4 Đại Boss, Boss Rush, 12 Relic, phím tắt và bản đồ file nguồn)
- [X] T048 Chạy kiểm định toàn hệ thống: `npm run build`, `cd server && npm test` (xác nhận 100% qua gồm `mk-pixel-assets.test.cjs`, `mk-mechanics.test.cjs`, `mk-e2e-socket.test.cjs`, `mk-static-security.test.cjs`) và `cd client && npx tsc --noEmit`
- [X] T049 Thực hiện chơi thử E2E trên trình duyệt với server test cô lập (`ACCOUNT_STORAGE=local`, không đụng `server/data/db.json`) theo đúng kịch bản `specs/005-mighty-knight-25d-pixel/quickstart.md` §4 ở cả khung `1280×720` và `844×390`: kiểm chứng pixel sắc cạnh không nhòe, Y-sort + bóng trục Z, Combo 3 nhịp + 4 Skill + Perfect Parry + Ultimate Cut-In + đổi tướng COM + Relic Draft, 0 lỗi Console và 0 lỗi 404; dọn sạch tiến trình test bằng `ps` + `kill <pid>`

---

## Dependencies & Execution Order

### Đồ thị Phụ thuộc Giữa Các Pha

```text
Phase 1: Setup (T001–T003)
    │
    ▼
Phase 2: Foundational — Shared Contracts & Security (T004–T011)
    │
    ├───────────────────────────────┐
    ▼                               ▼
Phase 3: US1 (P1)               Phase 4: US2 (P1)
2.5D Pixel 10-15f & Renderer    Combo, Parry, 30 Skills & Ult
(T012–T020)                     (T021–T028)
    │                               │
    └──────────────┬────────────────┘
                   ▼
        ┌──────────┴──────────┐
        ▼                     ▼
Phase 5: US3 (P2)         Phase 6: US4 (P2)
4 Biomes, Bosses,         Co-op 1-6P, AI COM,
Boss Rush & Relics        Switch & Revive
(T029–T035)               (T036–T041)
        │                     │
        └──────────┬──────────┘
                   ▼
          Phase 7: US5 (P3)
          16-Bit Audio & Mobile UX
          (T042–T045)
                   │
                   ▼
          Phase 8: Polish & E2E
          (T046–T049)
```

- **Phase 1 & 2** phải hoàn tất trước khi triển khai các User Story.
- **US1 (Visual & 10–15f Gate)** và **US2 (Server 30 Skills & Parry)** có thể chạy gần như song song ngay sau Phase 2 (chỉ ghép nối tại `MkBoard.tsx` và `render.ts`).
- **US3 (Bosses/Relics/Boss Rush)** và **US4 (Co-op/COM/Lobby)** có thể làm song song sau khi xong lõi chiến đấu US2.
- **US5 (Audio 16-bit & Mobile Polish)** hoàn thiện trải nghiệm nghe-nhìn trước khi sang **Phase 8 (Polish & E2E)**.

---

## Parallel Execution Examples (Ví dụ Chạy Song Song)

### Trong Phase 2 (Foundational)
- Song song sau khi có `T004`: `T005` (`relics.ts`), `T006` (`heroes.ts`), `T007` (`enemies.ts`), `T010` (`security.ts`), `T011` (`mk-static-security.test.cjs`).

### Trong Phase 3 (US1 — 2.5D Pixel Art & Renderer)
- Nhánh Asset: `T012` (`mk-pixel-assets.test.cjs`), `T013` (`palette.py`) và `T015` (`build_pixel_vfx_ui.py`) song song → nối sang `T014` (`build_pixel_sprites.py`) → `T016` (`build_manifest.mjs`).
- Nhánh Client Renderer: `T017` (`sprites.ts`), `T018` (`choreoPlayer.ts`), `T019` (`vfx.ts` + `particles.ts`) chạy song song → ghép vào `T020` (`render.ts`).

### Trong Phase 4 (US2 — 30 Kỹ Năng & Parry)
- Nhánh Client sau khi chốt `shared/`: `T025` (`store.ts`), `T026` (`input.ts`), `T027` (`MkUltCutIn.tsx`) chạy song song trong lúc server triển khai `T022` (`combat.ts`) & `T023` (`skills.ts`).

---

## Implementation Strategy (MVP First → Incremental Delivery)

1. **MVP Đạt Chuẩn Cốt Lõi (Phase 1 + Phase 2 + US1 + US2 = T001–T028)**:
   - Giao ngay trò chơi **Mighty Knight 2.5D Pixel** chơi được thực tế với đủ 6 Hero (**đúng 15 ảnh/Hero**), 3-hit Combo, Perfect Parry, **30 kỹ năng chủ động & Ultimate**, đồ họa 2.5D pixel sắc cạnh 60 FPS không nhòe và bộ kiểm định cứng `10–15 ảnh/nhân vật`.
2. **Mở rộng Chiều sâu PvE & Tổ đội (US3 + US4 = T029–T041)**:
   - Hoàn thiện 4 Quần xã, 8 Quái, 4 Đại Boss 3 giai đoạn, Boss Rush, 12 Thánh Vật Relic, AI COM thông minh, đổi tướng `Q`, hồi sinh Co-op và sảnh chờ pixel.
3. **Đánh bóng Nghe-Nhìn & Nghiệm thu (US5 + Phase 8 = T042–T049)**:
   - Hoàn thiện nhạc & SFX 16-bit Chiptune/FM, tối ưu Mobile `844×390`, dọn bản cartoon cũ, kiểm thử toàn bộ `node:test` và nghiệm thu trực quan trên trình duyệt.
