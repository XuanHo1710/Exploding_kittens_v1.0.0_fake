# Implementation Plan: Astral Expedition Pixel — Game 2D Pixel Turn-Based Gacha Phong Cách Expedition 33

**Branch**: `006-astral-expedition-pixel` | **Date**: 2026-11-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-astral-expedition-pixel/spec.md` + yêu cầu bổ sung từ người dùng: *"c:\Users\Arisu\Downloads\Exploding_kittens_v1.0.0_fake\prompts\battle thiết kế nhân vật + bản động phải nhiều frame như này nhé thì mới tạo cảm giác chân thực"* và hỗ trợ dịch vụ phụ trợ miễn phí chạy cục bộ qua Docker (`redis:7-alpine`).

## Summary

Xây dựng **Astral Expedition Pixel** — trò chơi **2D Pixel Turn-Based Gacha RPG** lấy cảm hứng từ *Clair Obscur: Expedition 33* tích hợp trực tiếp vào sảnh chọn game của monorepo `meo-no`. Kế hoạch thực hiện đồng bộ 5 trụ cột kỹ thuật:
1. **Chuyển đổi & Đổi tên 100% Bộ Quy Trình Tài Nguyên**: Đổi tên toàn bộ 11 skills trong `.agents/skills/` sang tiền tố `expedition-*`, viết lại `prompts/`, `tools/` và `GLOSSARY.md` từ miền bắt thú cũ sang miền Thám Hiểm Theo Lượt & Triệu Hồi Anh Hùng (`0` liên kết gãy, `0` thuật ngữ cũ).
2. **Đồ họa Nhân Vật & Bản Đồ Động Nhiều Frame Chân Thực (High-Frame Gen 3 Pixel Pipeline)**: Áp dụng chuẩn góc chéo 3/4 của `prompts/battle/` với **36 frame chiến đấu/nhân vật** (`192×192`, `6 cột × 6 hàng` gồm cả `IDLE_BREATHE` thở liên tục + `ATTACK` + `SKILL_CAST` + `PARRY_COUNTER` + `DODGE` + `HURT_FAINT`), **48 frame di chuyển overworld** (`6 frame × 4 hướng × 2 loop`), **36 frame đại hình `256×256` cho 7 Đại Trùm**, **16 frame/kỹ năng VFX** (`8f CAST` + `8f EFFECT`) và **lớp môi trường động 8 frame** cho cả **7 bản đồ khám phá** lẫn **7 cảnh chiến đấu**.
3. **Chiến đấu Turn-Based Dọc + Chủ Động 2 Chiều**: Giao diện **Menu Chọn Kỹ Năng Dạng Dọc**, Thanh Thứ Tự Lượt (CTB), kinh tế AP (`0..9`), kết hợp vòng bấm nhịp **Timed Hit** khi tung chiêu và phản xạ **Né (Dodge) / Đỡ Phản Đòn (Parry → Riposte Counter)** + **Thanh Phá Thế (Break)** ở tốc độ `60 FPS` không trễ mạng, đối soát kết quả xác định trên Server.
4. **Hành trình 7 Bản Đồ Độc Lập, 20 Chốt Quái Gác Cổng & 7 Đại Trùm**: Nối tiếp từ **Đồng Cỏ → Tuyết → Sa Mạc → Dưới Nước → Núi Lửa → Vùng Ban Đêm → Quang Phổ Mây Trời Ban Đêm** (đấu trường Trùm Cuối 3 phase).
5. **Gacha 12 Anh Hùng (`R / SR / SSR`, Hard Pity 80) & Hạ Tầng Docker Redis Cục Bộ Miễn Phí**: Tích hợp `docker-compose.expedition.yml` (`redis:7-alpine` miễn phí cục bộ cho phiên trận đấu nóng, khóa chống nhân bản Gacha, cache hồ sơ; tự động fallback RAM khi tắt Docker) song hành cùng kho lưu trữ bền vững nguyên tử `server/data/expedition/<playerId>.json`.

## Technical Context

**Language/Version**: TypeScript `5.9` (`shared/`, `server/`, `client/`), Node.js `20+`, Python `3.10+` (`py` kèm `pillow`) cho pipeline tạo/chuẩn hóa tài nguyên pixel offline.

**Primary Dependencies**: React `19.1` + Vite `7.1` + `lucide-react` + `socket.io-client` (`4.8`) phía Client; NestJS `11.2` + `socket.io` (`4.8`) + `@nestjs/serve-static` phía Server; client giao thức Redis nhẹ qua TCP/RESP nội bộ hoặc gói client Redis mã nguồn mở cho kết nối `redis:7-alpine` cục bộ.

**Storage**: Lưu trữ bền vững chính bằng tệp JSON nguyên tử phân tách theo tài khoản tại `server/data/expedition/<playerId>.json` (`write temp → fsync → rename`, không ảnh hưởng `server/data/db.json` của các game cũ) + **Local Docker Redis (`redis:7-alpine` miễn phí qua `docker-compose.expedition.yml`)** cho trạng thái trận đấu đang diễn ra, khóa giao dịch Gacha lũy đẳng và cache hồ sơ (kèm cơ chế fallback bộ nhớ trong tự động).

**Testing**: `node:test` (`server/test/expedition-*.test.cjs` kiểm thử Gacha 10.000 lượt, công thức CTB/AP/Timed-Hit/Parry/Break, Gatekeeper progression, Static Guard và Socket E2E), `tsc --noEmit` trên cả `client` và `server`, cùng bộ kiểm định hình ảnh Python (`tools/gen3/check_gen3.py`, `tools/expedition/verify_skills_and_glossary.py`, `tools/expedition/verify_bundle.py`).

**Target Platform**: Trình duyệt Web trên Desktop (bàn phím + chuột) và Điện thoại xoay ngang (landscape touch controls), chạy hoàn toàn tự chủ trên máy cục bộ.

**Project Type**: Multi-mode Realtime Web Game Monorepo (`shared/` + `server/` + `client/`) kèm Offline Pixel-Art Generation & Validation Pipeline (`tools/` + `prompts/` + `.agents/skills/`).

**Performance Goals**: Render Canvas 2D mượt **60 FPS** ổn định với sprite `192×192`/`256×256` nhiều frame + nền động `8 frame` + hạt môi trường; phản hồi đầu vào `Timed Hit` / `Parry` cục bộ **`< 16 ms`** (1 frame); kiểm chứng kết quả trận đấu & quay Gacha trên Server **`< 25 ms/request`**.

**Constraints**: `100%` miễn phí chạy cục bộ (`0` dịch vụ đám mây trả phí); màu sắc pixel chuẩn `BGR555`, alpha nhị phân `0/255`, nearest-neighbor không làm mờ; không che khuất báo đòn của Trùm; không làm gãy bất kỳ chế độ chơi nào trong 10 game hiện có của `meo-no`.

**Scale/Scope**: **7 bản đồ khám phá động** + **7 cảnh chiến đấu động**, **12 Anh Hùng Gacha** (`R/SR/SSR`, 5 kỹ năng/nhân vật = **60 kỹ năng**), **20 chốt Quái Gác Cổng**, **6 Trùm Khu Vực + 1 Trùm Cuối 3 Phase**, **11 bộ quy trình `expedition-*` đã biên tập đồng bộ**.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Đối chiếu trực tiếp với 7 Nguyên tắc Cốt lõi trong [constitution.md](../../.specify/memory/constitution.md) (`v1.0.0`):

| Nguyên tắc Hiến pháp | Đánh giá Trước Phase 0 | Đánh giá Sau Phase 1 | Bằng chứng Thiết kế |
|----------------------|------------------------|----------------------|---------------------|
| **I. Gen 3 Pixel-Perfect Visual Cohesion & Hardware Discipline** | ✅ PASS | ✅ PASS | Metatile `16×16` ×2, chiến đấu góc chéo `192×192` (`36f`) & `256×256` (`36f`), `BGR555`, alpha `0/255`, tách sạch `#FF00FF`, cổng `check_gen3.py` ([asset-pipeline.md](./contracts/asset-pipeline.md)). |
| **II. Domain-Adapted Skill, Prompt & Tool Pipeline** | ✅ PASS | ✅ PASS | Bảng ánh xạ đổi tên toàn bộ 11 skills sang `expedition-*`, viết lại `prompts/`, `tools/`, `GLOSSARY.md` và script kiểm tra `0` thuật ngữ cũ / `0` link gãy ([research.md](./research.md) R1, [asset-pipeline.md](./contracts/asset-pipeline.md) §1). |
| **III. Expedition-Style Turn-Based Combat & Vertical Skill UX** | ✅ PASS | ✅ PASS | Menu Kỹ Năng Dọc thu gọn khi diễn hoạt, CTB Turn Timeline, AP `0..9`, Timed Hit + Dodge/Parry 2 chiều, quy tắc chống che báo đòn Trùm ([vertical-battle-ui.md](./contracts/vertical-battle-ui.md)). |
| **IV. Themed Realm Exploration, Gatekeepers & Multi-Phase Bosses** | ✅ PASS | ✅ PASS | Đủ 7 vùng độc lập nối tiếp từ Đồng Cỏ tới Quang Phổ Mây Trời Ban Đêm, 20 chốt Quái Gác Cổng, 6 Trùm Khu Vực + 1 Trùm Cuối 3 phase, nền động 8 frame ([data-model.md](./data-model.md) §5). |
| **V. Data-Driven Single Source of Truth & Fair Authoritative Gacha** | ✅ PASS | ✅ PASS | Dữ liệu chuẩn trong `data/expedition/*.json` & `shared/src/expedition/`, Gacha `R/SR/SSR` công khai tỷ lệ, Hard Pity `80`, khóa Redis + ghi JSON nguyên tử ([data-model.md](./data-model.md) §6, [socket-and-storage.md](./contracts/socket-and-storage.md)). |
| **VI. Workspace Coexistence & Vietnamese-First Player Experience** | ✅ PASS | ✅ PASS | Tích hợp cô lập qua mode `'astral_expedition'`, static guard `/database-astral-expedition`, lưu riêng `server/data/expedition/`, UI & kỹ năng tiếng Việt 100% ([research.md](./research.md) R6). |
| **VII. Spec-Driven Development & Verifiable Quality Gates** | ✅ PASS | ✅ PASS | Đầy đủ cổng kiểm định hình ảnh, kiểm định đa frame, mô phỏng 10.000 lượt Gacha, replay xác thực trận đấu và kiểm thử không hồi quy ([quickstart.md](./quickstart.md)). |

**Kết luận Cổng Hiến Pháp**: **PASS 7/7 (Không có vi phạm nào cần ngoại lệ)**.

## Project Structure

### Documentation (this feature)

```text
specs/006-astral-expedition-pixel/
├── spec.md                          # Đặc tả nghiệp vụ đã làm rõ 5/5 điểm chốt
├── plan.md                          # Kế hoạch triển khai tổng thể (file này)
├── research.md                      # Nghiên cứu & quyết định kiến trúc Phase 0 (R1–R6)
├── data-model.md                    # Thực thể, 12 Anh Hùng, 60 Kỹ năng, 7 Map, 7 Trùm, Gacha
├── quickstart.md                    # Hướng dẫn khởi chạy Docker Redis, pipeline & kiểm chứng E2E
├── checklists/
│   └── requirements.md              # Checklist chất lượng đặc tả (16/16 PASS)
└── contracts/
    ├── asset-pipeline.md            # Hợp đồng đổi tên 11 skills & chuẩn sprite/map nhiều frame
    ├── socket-and-storage.md        # Hợp đồng Socket.IO exp:*, Static Guard, Redis & JSON Store
    └── vertical-battle-ui.md        # Hợp đồng giao diện chọn kỹ năng dọc & điều khiển PC/Mobile
```

### Source Code (repository root)

```text
docker-compose.expedition.yml        # Dịch vụ Redis 7 Alpine miễn phí chạy cục bộ (127.0.0.1:6379)
GLOSSARY.md                          # Từ điển thuật ngữ chuẩn hóa sang miền Astral Expedition Pixel

.agents/skills/                      # 11 bộ quy trình đã đổi tên & biên tập sang miền mới
├── expedition-sprite-generator/
├── expedition-battle-poses/
├── expedition-battle-scene/
├── expedition-npc-generator/
├── expedition-skill-vfx/
├── expedition-skill-review/
├── expedition-ui-generator/
├── expedition-overworld-generator/
├── expedition-structure-generator/
├── expedition-map-generator/
└── expedition-summon-orb-generator/

prompts/                             # Mẫu câu lệnh sinh ảnh góc chéo nhiều frame & 7 vùng đất
├── battle/
├── movement/
├── skills/
├── overworld/
└── structure/

tools/                               # Pipeline Python + Pillow chuẩn hóa pixel Gen 3 & đóng gói
├── gen3/
├── units/
├── battle-scenes/
├── characters/
├── skills/
├── ui/
├── overworld/
├── structures/
├── maps/
├── items/
└── expedition/                      # build_bundle.py, verify_bundle.py, verify_skills_and_glossary.py

data/expedition/                     # Nguồn dữ liệu JSON chuẩn (heroes, skills, realms, bosses, gacha)
database-astral-expedition/          # Gói tài nguyên xuất bản phục vụ tĩnh qua Static Guard

shared/src/
├── index.ts                         # Đăng ký GameMode 'astral_expedition' & hằng số tĩnh
└── expedition/
    ├── types.ts                     # Kiểu dữ liệu dùng chung (Profile, Hero, Skill, Map, Battle, Gacha)
    ├── catalog.ts                   # 12 Anh Hùng, 60 Kỹ năng, 7 Bản đồ, 20 Quái Gác Cổng, 7 Trùm
    ├── battle-engine.ts             # Máy trạng thái CTB, AP, Timed Hit, Dodge/Parry, Break & Replay
    └── gacha-rules.ts               # Tỷ lệ R/SR/SSR, bảo hiểm 10 lượt SR+ & Hard Pity 80

server/
├── src/
│   ├── app.module.ts                # Đăng ký AstralExpeditionStaticGuard (/database-astral-expedition)
│   └── game/
│       ├── game.gateway.ts          # Định tuyến các sự kiện Socket.IO exp:*
│       └── expedition/
│           ├── expedition.service.ts        # Điều phối hồ sơ, mở bản đồ, xác thực trận đấu & Gacha
│           ├── expedition-redis.service.ts  # Kết nối Docker Redis cục bộ + InMemoryFallback tự động
│           └── expedition-store.ts          # Lưu trữ nguyên tử server/data/expedition/<playerId>.json
└── test/
    ├── expedition-assets.test.cjs           # Kiểm định gói tài nguyên đa frame & Static Guard
    ├── expedition-battle-and-gacha.test.cjs # Kiểm thử CTB/AP/Parry/Break & 10.000 lượt Gacha Pity 80
    └── expedition-e2e-socket.test.cjs       # Kiểm thử luồng vào game, hạ Quái Gác Cổng, qua 7 vùng & Redis

client/src/
├── components/
│   ├── Home.tsx                     # Thêm thẻ chọn chế độ Astral Expedition Pixel
│   └── ExpeditionBoard.tsx          # Khung chính chuyển đổi giữa Overworld, Battle, Gacha & Đội Hình
└── expedition/
    ├── store.ts                     # Quản lý trạng thái phiên khám phá, trận đấu & bộ sưu tập
    ├── assetLoader.ts               # Tải & cắt frame sprite 36f/48f, map .tmj, lớp nền động 8f
    ├── overworldRenderer.ts         # Render Canvas 2D 7 vùng đất động, Cờ Trạm Nghỉ & Quái Gác Cổng
    ├── battleRenderer.ts            # Render trận đấu góc chéo 60 FPS, IDLE_BREATHE 6f, VFX & Telegraph
    ├── VerticalSkillMenu.tsx        # Giao diện chọn kỹ năng xếp dọc chuẩn Expedition 33
    ├── TimingOverlay.tsx            # Vòng bấm nhịp Timed Hit & Huy hiệu phản xạ Né / Đỡ Phản Đòn
    ├── GachaModal.tsx               # Giao diện Triệu Hồi Tinh Cầu 26+ frame, bảng tỷ lệ & bộ đếm Pity 80
    ├── PartyModal.tsx               # Giao diện sắp xếp 3 Anh Hùng ra trận & nâng cấp kỹ năng
    ├── sound.ts                     # Âm thanh chiptune/orchestral pixel cho nhịp báo đòn, Parry & Gacha
    └── expedition.css               # Kiểu dáng cửa sổ vát góc 45° Pixel Fantasy tiếng Việt
```

**Structure Decision**: Giữ nguyên kiến trúc Monorepo đa chế độ đã vận hành ổn định của dự án (`shared/` + `server/` + `client/`), bổ sung phân hệ cô lập `expedition` cùng kho tài nguyên tĩnh bảo mật `database-astral-expedition/` và tệp `docker-compose.expedition.yml` cho dịch vụ `redis:7-alpine` cục bộ, đồng thời chuẩn hóa trực tiếp bộ công cụ offline tại `.agents/skills/`, `prompts/` và `tools/`.

## Implementation Phases Overview (Chuẩn bị cho `/speckit-tasks`)

1. **Giai đoạn 1 — Chuẩn hóa Bộ Quy Trình Kỹ Năng & Hạ tầng Docker Cục Bộ**:
   - Đổi tên & biên tập toàn bộ 11 `.agents/skills/expedition-*`, `prompts/`, `tools/`, `GLOSSARY.md` và viết `verify_skills_and_glossary.py`.
   - Thiết lập `docker-compose.expedition.yml` (`redis:7-alpine`) + `ExpeditionRedisService` (có fallback RAM) + `expedition-store.ts` ghi JSON nguyên tử.
2. **Giai đoạn 2 — Dữ liệu Gốc & Động Cơ Chiến Đấu Theo Lượt Dọc (`shared/src/expedition/`)**:
   - Định nghĩa đầy đủ 12 Anh Hùng, 60 Kỹ năng, 7 vùng bản đồ, 20 chốt Quái Gác Cổng, 7 Đại Trùm đa phase và bộ máy `ExpeditionBattleEngine` (CTB, AP `0..9`, Timed Hit, Dodge/Parry Counter, Break) + `gacha-rules.ts` (Hard Pity `80`).
3. **Giai đoạn 3 — Sản xuất Gói Tài Nguyên Pixel Đa Frame (`database-astral-expedition/`)**:
   - Chạy pipeline sinh & chuẩn hóa: 12 Anh Hùng (`36f` chiến đấu `BACK` + `48f` di chuyển), Quái Gác Cổng (`24f` tuần tra + `24f` chiến đấu `FRONT`), 7 Đại Trùm (`256×256` × `36f`), 60 bộ VFX (`8f CAST` + `8f EFFECT`), Tinh Cầu Gacha `26+ frame`, bộ UI dọc và **7 bản đồ `.tmj` + 7 cảnh chiến đấu có lớp động `8 frame`** (đặc biệt là đấu trường *Quang Phổ Mây Trời Ban Đêm*).
4. **Giai đoạn 4 — Tích hợp Server Authoritative & Static Guard (`server/`)**:
   - Đăng ký `AstralExpeditionStaticGuard`, xây dựng `ExpeditionService` xử lý toàn bộ sự kiện `exp:*` với kiểm chứng replay trận đấu và khóa nguyên tử Gacha.
5. **Giai đoạn 5 — Giao diện Khám Phá 7 Vùng, Trận Đấu Menu Dọc & Gacha (`client/`)**:
   - Xây dựng `ExpeditionBoard.tsx`, `overworldRenderer.ts`, `battleRenderer.ts`, `VerticalSkillMenu.tsx`, `TimingOverlay.tsx`, `GachaModal.tsx`, `PartyModal.tsx`, hỗ trợ cả PC và Mobile xoay ngang.
6. **Giai đoạn 6 — Kiểm định Cổng Chất Lượng Toàn Diện**:
   - Chạy kiểm định hình ảnh `check_gen3.py` + `verify_bundle.py`, chạy đủ bộ unit/integration/E2E test (`10.000` lượt Gacha, kiểm thử mất kết nối Redis, kiểm thử 3 phase Trùm Cuối) và kiểm tra không hồi quy `npm run build`.

## Complexity Tracking

> Không phát sinh vi phạm Hiến pháp (`0` violations). Mọi thành phần đều tuân thủ đầy đủ 7 nguyên tắc của `constitution.md` `v1.0.0`.
