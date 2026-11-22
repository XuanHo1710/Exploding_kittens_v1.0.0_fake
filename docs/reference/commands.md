# Lệnh và biến môi trường

Tra cứu mọi lệnh chạy ở **gốc repo**. Cách dùng theo từng việc: [`../how-to/`](../how-to/). Danh sách từng script Python: [`tools/README.md`](../../tools/README.md) và `README.md` trong mỗi `tools/<miền>/`.

## Cài đặt

| Cần | Phiên bản | Ghi chú |
|---|---|---|
| Node | ≥ 22.12 | Vite 8 yêu cầu. `npm ci` **chỉ chạy ở gốc** (lockfile duy nhất là `package-lock.json` ở gốc; npm workspaces `["game"]`); cũng chạy `tools/data/showdown_dump.cjs`, `game/tools/check_capture.ts` (Node đọc thẳng `.ts`) |
| Python | ≥ 3.10 + Pillow | `sudo apt install python3-pil` hoặc `pip install pillow`. Đủ cho mọi script trừ phần 3D |
| numpy + OpenCV | tuỳ chọn | chỉ cho `tools/model3d/*`, `build_anchors.py`, `tools/demo/compare_2d_3d.py`, `tools/agy/ball_pack.py` |
| `gh` | bất kỳ | issue và PR |

Venv chung (tuỳ chọn; `pyproject.toml` chỉ khai báo dependency, không có gói Python):

```bash
python3 -m venv .venv && .venv/bin/pip install -e .[3d]   # Pillow + numpy + OpenCV; .venv/ bị gitignore
export MONS_PY3D=$PWD/.venv/bin/python                     # Python cho tools/model3d/*
```

## npm scripts (`package.json` ở gốc)

| Lệnh | Làm gì | Thời gian |
|---|---|---|
| `npm run assets` | `game/tools/build_assets.py` + `export_sounds.py`: xuất map, nhân vật, UI, cảnh chiến đấu, Poké Ball, hiệu ứng trận đấu, Pokémon, âm thanh vào `game/public/assets/` (sinh ra, không commit) | ~15 giây |
| `npm run dev` | Vite dev server, <http://localhost:5173> (điện thoại cùng wifi: `http://<ip-máy>:5173`) | |
| `npm run build` | typecheck + bản build production trong `game/dist/` | |
| `npm run typecheck` | `tsc --noEmit` của `game/` và `server/` | vài giây |
| `npm run server` | build client rồi chạy máy chủ online `server/main.ts` (HTTP + WebSocket `/ws`, cổng 8790); xem [run-server.md](../how-to/run-server.md) | ~10 giây build |
| `npm run server:only` | chỉ chạy máy chủ (client đã build; `MONS_DIST` để trỏ bản build khác) | |
| `npm run check:server` | `server/test/check_server.ts`: hai client giả lập (tài khoản, lưu / tải, thấy nhau, chat, đăng xuất, giới hạn) | vài giây |
| `npm run preview` | xem bản `dist/` | |
| `npm run maps` | `tools/maps/mapgen.py world assets/maps/world.json`: build lại mọi map trong `world.json`, kiểm tra mối nối, ghi `connections` vào từng `.tmj` | vài phút |
| `npm run lint` | `tools/lint_repo.py`: kiểm tra quy ước repo một cách máy móc ([conventions.md](conventions.md) §9) | vài giây |
| `npm run check` | `tools/check.sh`: `lint` + `check_gen3` trên `assets/{overworld,structures,characters,battle-scenes,ui}` và sheet Poké Ball trong `assets/items` + `mapgen.py world` + typecheck | vài phút |
| `npm run regen` | `tools/regen.sh`: chạy lại mọi generator trong repo theo thứ tự phụ thuộc; `git status` phải sạch sau đó | ~7 phút |
| `npm run hash -- [--pixels] [--compare A B]` | `tools/hash_outputs.py`: manifest sha256 các file trong git | |

`npm run <x>` ở gốc gọi cùng script của `game/` cho `assets / dev / build / typecheck / preview`; `cd game && npm run …` vẫn chạy được.

## CI

`.github/workflows/check.yml` chạy trên mọi PR và mỗi lần push lên `main`. Các bước: Node 22, Python 3.12 + Pillow 10.2.0 (cùng bản đã sinh PNG trong git), `npm ci`, `npm run lint`, `npm run typecheck`, `bash tools/check.sh`. Tổng cộng khoảng 8 phút. Trong CI (`CI` được đặt), `check.sh` còn kiểm tra rằng build world cho ra đúng các map đã commit: PNG chỉ khác byte được bỏ qua, mọi khác biệt khác làm CI đỏ. Ở máy, `SKIP_WORLD=1 npm run check` bỏ qua bước build world (~4 phút).

## Script dùng chung trong `tools/`

| Lệnh | Làm gì |
|---|---|
| `bash tools/check.sh` | như `npm run check`; dừng ở lỗi đầu tiên |
| `bash tools/regen.sh [bước…]` | bước mặc định `overworld structures chars scenes maps ui data`; thêm `icons`, `legacy-maps` khi cần; `--list` in danh sách. Cuối cùng checkout lại PNG chỉ khác byte (cùng pixel) |
| `python3 tools/hash_outputs.py --out tmp/hashes/x.json` | manifest sha256 (`--pixels`: PNG theo pixel; `--public`: thêm `game/public/assets`; `--compare A B`) |
| `python3 tools/lint_repo.py [--list]` | kiểm tra quy ước; `--list` in các luật |
| `python3 tools/check_names.py [--list] [path…]` | không có tên dự án / nền tảng bên thứ ba ngoài `THIRD_PARTY_NOTICES.md` (cũng là luật lint `names`) |
| `node game/tools/check_capture.ts` | `game/src/capture.ts` so với các ví dụ trong `docs/explanation/research/capture-reference.json` (Monte Carlo) |
| `node game/tools/check_fishing.ts` | `game/src/fishing.ts` thuần, máy trạng thái câu cá, tỉ lệ cắn câu / đặc tính dẫn đầu, toàn bộ bảng câu cá (35 map nước × 3 cần × 24 buổi/thời tiết), Lure Ball ×4 và PokéNav (sau `npm run assets`) |
| `node game/tools/check_battle.ts` | bộ máy trận đấu `game/src/battle/`: thuần (không Phaser / `Math.random`), phát lại đúng từ seed, đủ handler cho `move-effects.json`; so với bản Showdown (`MONS_SHOWDOWN_SRC`, mặc định `sim/ShowdownSim/dist/data`: hệ loài, dữ liệu chiêu, bảng hệ 18, sát thương, chí mạng, độ chính xác, hiệu ứng phụ) và AI so với `sim/BattleSim`; vài lượt kịch bản (phản đòn, nhiều đòn, 2 lượt, thời tiết, ability, vật phẩm, level cap). Phần sim tự bỏ qua (có thông báo) khi không có `sim/` (chỉ ở máy local từ 2026-11-19). Chạy sau `npm run assets` |
| `node game/tools/check_learnsets.ts [N]` | mọi đội Trainer, starter, danh sách chiêu theo cấp và N Pokémon hoang dã mỗi bảng gặp chỉ biết chiêu hợp lệ (`legal-moves.json`) |
| `node game/tools/check_stats.ts` | `game/src/data.ts` tạo Pokémon (PID, IV, tính cách, đặc tính, giới tính, shiny, thân thiết, vật phẩm hoang dã, EV, chỉ số) so với `sim/StatSim` cùng seed (sau `npm run assets`); không có `sim/StatSim` thì in `skipped` và thoát 0 |
| `python3 game/tools/check_encounters.py [-v]` | `encounters.json` (mọi buổi × thời tiết) và `src/encounter.ts` so với `sim/EncounterSim` cùng seed (sau `npm run assets`; bản build dùng `tools/world/encounters.py`); không có `sim/` thì in `skipped` và thoát 0 |
| `python3 tools/gen3/check_gen3.py --quiet <thư mục>` | luật phần cứng Gen 3 trên mọi PNG |
| `python3 tools/mistakes.py` | ghi `tmp/reports/mistakes.md` (thư mục loài thiếu / thừa file) |

Lệnh của từng miền (map, tile, công trình, nhân vật, UI, cảnh chiến đấu, chiêu, sprite): bảng trong [`tools/README.md`](../../tools/README.md) và [how-to](../how-to/).

## Biến môi trường

Docs và script không chứa đường dẫn máy riêng. Thứ nằm ngoài repo được chỉ bằng biến môi trường. Khi biến chưa đặt, script dùng đường dẫn cũ trên máy tác giả nếu nó tồn tại, nếu không thì dùng giá trị trong cột "Mặc định".

| Biến | Là gì | Mặc định | Dùng bởi |
|---|---|---|---|
| `MONS_3D_DIR` | Thư mục sheet 3D Fall-back đã render (`<slug>.json` + `<slug>-<mode>.png`) | `<repo>/pokemon3d` (symlink, gitignore), rồi `$MONS_SODIER_WAR/client/assets/pokemon3d` | `pose_guide.py`, `assemble_loops.py`, `animate2d.py`, `tools/data/animations.py`, `tools/model3d/qc.py` |
| `MONS_SODIER_WAR` | Checkout của demo Sodier War (không phải git repo) | `/home/huy/Main/sodier-war-next` | `tools/game/compare_manifest.py`, `tools/data/animations.py`, fallback của `MONS_3D_DIR` |
| `MONS_PY3D` | Python có numpy (+ OpenCV) cho `tools/model3d/*`, `build_anchors.py`, `compare_2d_3d.py` | tự đặt, ví dụ `.venv/bin/python`; allow-list agy dùng `/home/huy/vya-ocr-staging/.venv/bin/python` khi chưa đặt | docs, allow-list của `tools/agy/agy_queue.py` |
| `MONS_AGY_PY` | Python đi kèm agy (Antigravity CLI) | `/snap/antigravity-cli/24/usr/bin/python3.14` nếu có, nếu không là `python3` đang chạy | `tools/agy/*`, `tools/cloudflare/cf_loop.py` |
| `MONS_AGY_PREFIX` | Thư mục cài agy (để `agy_queue.py` nhận ra tiến trình agy trong `/proc`) | `/snap/antigravity-cli/` | `tools/agy/agy_queue.py` |
| `MONS_PALETTE` | Nguồn ramp màu cho tile overworld | `gym` | `tools/overworld/*` |
| `MONS_EXTRA_MAPS` | Thư mục map thêm (tương đối với repo) mà `build_assets.py` xuất như hang, để thử cơ chế trong game | không đặt (không có map thêm); thử: `tmp/mech-maps` (do `tools/maps/test_mechanics.py` dựng) | `game/tools/build_assets.py`, `game/tools/mech_test.mjs` |
| `MONS_VFX_SOURCE` | Nguồn ảnh hiệu ứng chiêu khi so sánh: `default` / `fallback` / `code` | `default` | `tools/skills/vfx.py`, `review_move.py`, `battle_preview.py --source` |
| `MONS_SHINY_REFS` | Ảnh render thường + shiny của trang tham chiếu mà `tools/pokemon/shiny_recolor.py` tải về (chỉ đọc màu) | `/tmp/mons-refs/shiny` | `tools/pokemon/shiny_recolor.py` |
| `MONS_SPAWN_PACK` | Datapack của gói nội dung tham chiếu (thư mục hoặc zip có `data/<ns>/spawn_pool_world/`; tên: `THIRD_PARTY_NOTICES.md`) | không có: script in `skipped`, giữ nguyên file đã commit | `tools/data/import_spawns.py` |
| `MONS_REFERENCE_SRC` | Checkout mã nguồn của dự án gốc (gốc repo hoặc `common/src/main/resources`; tên và phiên bản: `THIRD_PARTY_NOTICES.md`) | không có: script dừng với thông báo rõ ràng (cũng nhận làm tham số CLI) | `tools/skills/fallback_vfx.py`, `evolution_fx.py`, `move_viewer.py` (âm thanh tiến hoá), `tools/data/{import_sounds,catch_rates,build_evolutions,build_species,import_spawns}.py`, `tools/ui/import_item_icons.py` |
| `MONS_REF_ASSETS` | Thư mục asset 3D tham chiếu cho Poké Ball (keyframe, texture) | không có: script dừng | `tools/agy/ball_pack.py`, `tools/items/ballkit.py`, `tools/data/pokeball_anim.py --src` |
| `MONS_SOURCE_PACK`, `MONS_SOURCE_PACK_DIRS`, `MONS_EXTRA_ARCHIVES` | Gói nội dung tham chiếu (thư mục hoặc zip), các thư mục con cần đọc, các archive bổ sung: chỉ để kiểm tra catch rate | không có (bỏ qua bước đó) | `tools/data/catch_rates.py` |
| `MONS_SHOWDOWN_SRC` | Thư mục `dist/data` của một bản Pokémon Showdown (MIT; nguồn: `THIRD_PARTY_NOTICES.md`) | `sim/ShowdownSim/dist/data` nếu có ở máy local; không có: script in `skipped: set MONS_SHOWDOWN_SRC …`, thoát 0 và **không** ghi đè `data/battle/*.json` đã commit | `tools/data/showdown_dump.cjs`, `tools/data/{build_type_chart,build_move_effects,build_battle_extras}.py` (qua `tools/data/showdown.py`), `game/tools/check_battle.ts` (oracle Showdown) |
| `MONS_PORT`, `MONS_HOST` | Cổng / địa chỉ của máy chủ online | `8790`, `127.0.0.1` | `server/main.ts` |
| `MONS_DATA_DIR` | Thư mục dữ liệu máy chủ (SQLite `mons.db`, `config.json`) | `server/data` (gitignore) | `server/main.ts` |
| `MONS_DIST` | Bản build client mà máy chủ phục vụ | `game/dist` | `server/main.ts`, `server/test/shots_online.ts` |
| `MONS_CHROME` | Trình duyệt headless cho `shots_online.ts` | headless shell mới nhất trong cache trình duyệt của người dùng | `server/test/shots_online.ts` |
| `MONS_FX_OUT` | Thư mục ra của `fx_pack.py normalize` (chỉ để test) | `assets/ui/Battle/` | `tools/agy/fx_pack.py` |
| `PY` | Python mà `tools/check.sh` dùng | `python3` | `tools/check.sh` |

Ví dụ: `export MONS_PY3D=$PWD/.venv/bin/python MONS_3D_DIR=~/sodier-war-next/client/assets/pokemon3d`.

Biến mới: thêm một dòng vào bảng này trong cùng PR, đặt tên `MONS_<VIỆC>`, và luôn có giá trị mặc định chạy được trong repo hoặc thông báo lỗi rõ ràng.
