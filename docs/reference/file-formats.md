# Định dạng file

Tra cứu ngắn cho các file nguồn và file sinh ra chính. Mỗi mục trỏ tới tài liệu đầy đủ (thường là `SKILL.md` hoặc `references/*.md` của skill); đừng chép lại chi tiết ở đây. Tọa độ map luôn tính bằng **ô** (metatile Gen 3 16 px, 32 px trong mọi file xuất), `x` sang phải, `y` xuống dưới.

## Map spec: `assets/maps/<slug>/<slug>.map.json` (nguồn, viết tay)

Một file JSON mỗi Map. `mapgen.py build` đọc nó, chạy `ops` theo thứ tự, lint theo luật Gen 3, rồi xuất ảnh và Tiled. Đầy đủ: [`references/spec.md`](../../.agents/skills/pokemon-map-generator/references/spec.md).

| Trường | Ý nghĩa |
|---|---|
| `slug` | tên file và thư mục, kebab-case |
| `kind` | `town`, `route` hoặc `city` (đổi luật lint) |
| `theme` | một khoá trong `tools/maps/themes.json`; role `@path`, `@tree`… được phân giải theo theme |
| `size` | `[W, H]` theo ô |
| `home` | tên lối ra phía thị trấn khởi đầu; đo khả năng tới được và chiều nhảy ledge từ đây |
| `seed` | seed rải prop; đổi để xáo lại |
| `ops` | các lệnh vẽ theo thứ tự: `frame`, `rect`, `path`, `exit`, `structure`, `prop`, `ledge`, `stream`, `pond`, `plateau`, `dress`… |
| `events` | dữ liệu gameplay không có hình: `signs`, `trainers`, `items`, `npcs` (mỗi cái có `at: [x, y]`) |

File sinh ra cạnh spec (`mapgen.py build`): `<slug>.png` (preview ×2), `<slug>.tmj` (Tiled map), `<slug>-objects.tsj`, `<slug>-collision.txt`; không vào git: `<slug>-report.md` (lint), `<slug>-debug.png` (`--debug`).

## World: `assets/maps/world.json` (nguồn, viết tay)

| Trường | Ý nghĩa |
|---|---|
| `name` | tên world (`"world"`); tên ảnh tổng `world.png` |
| `start` | map người chơi bắt đầu (`"start-town"`) |
| `overview_px` | số px mỗi ô trong ảnh tổng |
| `maps` | `slug → [x, y]` (góc trên-trái theo ô; map có spec viết tay) hoặc `slug → {"at", "size", "kind", "theme", "gym", "sea"}` (map được `tools/maps/scaffold.py` dựng khung) |

`mapgen.py world assets/maps/world.json` (`npm run maps`) build mọi map, kiểm tra từng ô ở mối nối, ghi `connections` Gen 3 vào từng `.tmj`, vẽ `world.png` và `world-report.md`. Xong khi 0 lỗi nối. Luật: [`gen3-world-connections.md`](../explanation/research/gen3-world-connections.md).

## Piece index: `assets/overworld/index.json` (sinh bởi `gen_overworld.py`)

`{"note": …, "pieces": [ … ]}`, mỗi piece:

| Trường | Ý nghĩa |
|---|---|
| `slug` | tên piece (`dirt-path`, `barrel`) |
| `owner` | `base` hoặc loại gym (`fire`, `grass`…) |
| `type` / `kind` | `terrain` (autotile 47 ô) / `prop` / `connector`… |
| `cells` | kích thước `[w, h]` theo ô |
| `frames` | số khung animation (`-anim`) |
| `dir` | thư mục trong `assets/overworld/` (`Base/Props/barrel`) |

Trong thư mục piece: terrain có `<slug>.png` (tileset), `<slug>.tsj` (Tiled tileset có Wang set), `tiles/`, đôi khi `-overlay.png`; prop có `<slug>.png` + `<slug>.json` (ô chiếm chỗ, cờ `walk`, `water`, `bank`…). Danh sách piece: [`references/catalog.md`](../../.agents/skills/pokemon-overworld-generator/references/catalog.md).

## Sprite sheet Pokémon: `assets/pokemon/<GenX-Region>/<NNN>-<Name>/`

| File | Định dạng |
|---|---|
| `<slug>-movement.png` | **v3** (hiện tại): các loop `idle`, `walk`, `fly` (`run` khi được yêu cầu) đặt cạnh nhau; mỗi loop = 4 hàng hướng (xuống, trái, phải, lên) × 6 khung; ô 192×192, vùng an toàn 160 px, nền `#FF00FF`. Chunk PNG tEXt `mons-loops` = `[{mode, frames, cycle, keys}]`. **v2**: 4 hướng × loop 4 khung, 768×768 (`walk`, `fly`) hoặc 1536×768 (`walk_fly`). **Cũ 8×6**: 1536×1152. Game nhận dạng theo kích thước / chunk |
| `<slug>-battle.png` | battle pose: mặt trước + mặt sau, 6 khung × 4 hàng mỗi mặt (đánh, trúng đòn, né, gục) |
| `<slug>-reference.jpg` | artwork chính thức dùng để vẽ (giữ lại, decisions.md §1) |
| `<slug>-anchors.json` | tuỳ chọn: điểm miệng / đầu / tay / đuôi cho hiệu ứng chiêu (định dạng ở đầu `tools/skills/anchor_check.py`) |
| `<slug>-posses.png` | cũ (8×5), không tạo mới |

`locomotion` của loài (`walk` / `walk_fly` / `fly`, `aquatic`) nằm trong `data/pokemon/pokemon-locomotion.json`. Chi tiết: [decisions.md §2–§3](../agents/decisions.md), [sprite SKILL.md](../../.agents/skills/pokemon-sprite-generator/SKILL.md), [`prompts/movement/README.md`](../../prompts/movement/README.md).

## Công trình: `assets/structures/<Category>/<slug>/`

`<slug>-structure.png` (canvas vuông nguyên metatile: S 6×6, M 8×8, L 10×10, XL 12×12), `<slug>-ground.png` (đường tiếp đất 1 px), `<slug>-door.png` + `<slug>-door.json` (dải cửa 4 khung kiểu pret), `<slug>-interior*.png` + `.json` (phòng lưới 16 px; gym một file mỗi tầng). Chi tiết: [structure SKILL.md](../../.agents/skills/pokemon-structure-generator/SKILL.md).

## Hiệu ứng chiêu: `assets/skills/<GenX-Region>/<English Move Name>/`

`<id>-cast.png` (trên Pokémon dùng chiêu), `<id>-effect.png` (chiêu), `<id>-vfx.json` (kích thước, vị trí, thời gian), `<id>-prompt.md` (prompt pack), tuỳ chọn `<id>-code.json` (beam bằng code). Chi tiết: [move-vfx SKILL.md](../../.agents/skills/pokemon-move-vfx/SKILL.md).

## Poké Ball: `assets/items/PokeBalls/<Name-Ball>/`

`<id>-ball.png` (8 cột × 6 hàng ô vuông, ô ≥ 64 px gốc, xuất ×2, ≤ 15 màu: ném, mở, lắc, bắt được, thoát, icon), `<id>-ball.json` (hợp đồng bố cục mà `catch_anim.py` và game đọc: `cell`, `scale`, `cols`, `ball_px`, `baseline_y`, `rows`, `reference`), `<id>-reference.png` (artwork chính thức đã dùng để vẽ). Chi tiết: [pokeball SKILL.md](../../.agents/skills/pokeball-generator/SKILL.md).

## UI thêm: `assets/ui/Items/`, `Battle/`, `Evolution/`

`Items/<id>.png` (icon túi 24×24) + `items.json` (`source`: `drawn` hoặc `reference`; `LICENSE.md` liệt kê icon `reference`), `Battle/<effect>.png` + `battle-fx.json` (hiệu ứng hệ thống trận đấu do agy vẽ: thời tiết, trạng thái, mũi tên chỉ số, vật phẩm…), `Evolution/evo-*.png` + `evolution.json` (dải hạt tiến hoá; `LICENSE.md`).

## Dữ liệu: `data/`

**Không sửa tay** file có cột "Sinh bởi": sửa script hoặc đầu vào rồi chạy lại. Lệnh đầy đủ: [`tools/README.md`](../../tools/README.md).

| File | Nội dung | Sinh bởi |
|---|---|---|
| `battle/moves.json` | 919 chiêu + archetype hiệu ứng | `tools/skills/build_moves.py` |
| `battle/trainers.json` | Gym Trainer, Leader, rival, Elite Four, Champion (đội FRLG), luật League | `tools/data/build_trainers.py` |
| `battle/level-caps.json` | level cap theo từng chặng (ace của Trainer bắt buộc tiếp theo + 5; hết cap khi thành Nhà Vô Địch) | `tools/data/build_trainers.py` |
| `battle/move-names-vi.json` | tên chiêu tiếng Việt | viết tay |
| `battle/move-effects.json` | hiệu ứng trong trận của 354 chiêu Gen 3 (từ vựng hiệu ứng, cơ chế pokeemerald; hệ, loại, power / accuracy / PP theo gen mới nhất, giá trị Gen 3 giữ ở `gen3*`; khác biệt Gen 9 theo từng chiêu) | `tools/data/build_move_effects.py` |
| `battle/abilities-battle.json`, `held-items.json`, `weather.json` | 60 ability Gen 3 có hook trong trận, 70 vật phẩm cầm + vật phẩm hoang dã #001-151, thời tiết | `tools/data/build_battle_extras.py` |
| `battle/pokeball-animation.json` | chuỗi bắt Pokémon: keyframe 3D tham chiếu (tóm tắt) + chuỗi Gen 3 pokeemerald, từng loại bóng | `tools/data/pokeball_anim.py --src <asset 3D tham chiếu>` |
| `battle/evolution-animation.json` | chuỗi tiến hoá Gen 3 so với chuỗi 3D tham chiếu, hiệu ứng hạt `evo_*` | `tools/skills/evolution_fx.py facts` |
| `battle/move-vfx-official.json`, `move-vfx-sources.json` | ảnh hiệu ứng chiêu đã chọn và nguồn | `tools/skills/apply_official.py` / move viewer |
| `pokemon/pokemon-locomotion.json` | `walk` / `walk_fly` / `fly`, `aquatic` | `tools/data/locomotion.py` (jar model 3D, THIRD_PARTY_NOTICES.md) |
| `pokemon/pokemon-learnsets.json` | chiêu học được theo cấp / TM | `tools/data/learnsets.py` (CSV PokéAPI) |
| `pokemon/pokemon-notes.json` | ghi chú vẽ từng loài: `auto` (sinh) + `all` / `movement` / `battle` (viết tay, được giữ khi sinh lại) | `tools/data/species_notes.py` |
| `pokemon/pokemon-animations.json` | loài nào có loop 3D nào | `tools/data/animations.py` |
| `pokemon/pokemon-evolutions.json` | điều kiện tiến hoá của 1025 loài (từ vựng trung lập; `mons` = điều game chạy) | `tools/data/build_evolutions.py --reference-src <dir>` |
| `pokemon/pokemon-catch-rates.json`, `pokemon-capture-rules.json` | catch rate từng loài, luật bắt mà `game/src/capture.ts` đọc (decisions.md §17) | `tools/data/catch_rates.py` (cũng ghi `docs/explanation/research/capture-reference.json`) |
| `pokemon/pokemon-anchors.json` | điểm neo hiệu ứng mặc định | `tools/skills/build_anchors.py` |
| `pokemon/pokemon-stats-gen3.json`, `pokemon-base-stats.json`, `pokemon_sizes.json` | chỉ số Gen 3 + tên tiếng Việt, base stats 1025 loài, kích thước (hitbox của dữ liệu loài gốc) | nhập một lần, không có script trong repo: sửa có chủ đích, ghi trong PR |
| `stats/*.json` | natures, abilities, EV items, species, rules | `sim/StatSim/build_configs.py` (chỉ ở máy local từ 2026-11-19; file đã commit là nguồn cho game) |
| `world/pokemon-spawns.json`, `encounter-rules.json` | bảng spawn, luật gặp Pokémon hoang dã Gen 3 | dữ liệu thiết kế, sửa tay có chủ đích (decisions.md §15); các mục `"pool"` của `map_spawns` do `tools/data/build_spawn_pools.py` viết lại (pool Gen 1 §23 + loài mọi thế hệ và huyền thoại §29; mục có thể có `time_of_day` / `weather` riêng, `legendary`), mục không có `pool` là bảng gốc sửa tay; `encounter-rules.json` `monsRateMult` và `monsRarity` (phương án B, §15); game đọc qua `tools/world/encounters.py`; kiểm tra bằng `sim/EncounterSim` (local) |
| `world/reference-spawns.json` | sự kiện của spawn pool tham chiếu (gói nội dung trước, engine tham chiếu sau), id trung tính: `[dex, bucket, weight, minLv, maxLv, position, conditions]` | `tools/data/import_spawns.py`, không sửa tay |
| `pokemon/pokemon-species.json` | dữ liệu loài của game cho 1025 số Pokédex (Gen 3 cho #001-386, tham chiếu cho loài sau; hệ mới nhất, catch rate, nhãn, `abilityNames`) | `tools/data/build_species.py`, không sửa tay |
| `world/ground-items.json` | vật phẩm của từng Bóng vật phẩm trên map ngoài trời: `maps.<map>` = `level` (cấp khu vực), `tier`, `balls` `[{at: [x, y] ô game, item, source: map \| table}]`, `hidden` (vật phẩm ẩn, chưa làm Itemfinder); `tiers` (`max_level`, `items` id → trọng số), `found_only` (Đá Mặt Trăng / Mặt Trời: ít nhất một viên) | `tools/data/build_ground_items.py` (`--check`: còn khớp với map không) |

Tên chiêu, tên trong game và lời thoại là tiếng Việt; khoá JSON là tiếng Anh.

## Dữ liệu thế giới cho game: `game/public/assets/data/` (sinh bởi `game/tools/build_assets.py` + `world_assets.py`)

| File | Định dạng |
|---|---|
| `encounters.json` | `"<map>[:water\|:sand\|:cave\|:smash]" → {area, rate, rateMult, source, slots, percent, tiers, phases, by, variants}`: `rate` = encounterRate Gen 3, `rateMult` = hệ số Mons ×100 (`monsRateMult`); `slots` `[loài, cấp min, cấp max]` một hàng mỗi loài, `percent` = tỉ lệ của hàng đó (%, 2 chữ số thập phân, tổng 100; game tung `(Random() << 16 \| Random()) % 10000` với `percent × 100`), `tiers` = bậc hiếm từng hàng (`common` / `uncommon` / `rare` / `ultra`), cả ba là DAY / CLEAR; `by["<PHASE>/<WEATHER>"]` = chỉ số vào `variants` (mỗi phần tử `{slots, percent, tiers}` do `rarity_table` của `tools/world/encounters.py` dựng cho buổi × thời tiết đó; không bao giờ rỗng); `fallback_of["<PHASE>/<WEATHER>"]` = tổ hợp được chép khi EncounterSim không có Pokémon (cùng thời tiết buổi gần nhất → buổi đó CLEAR → DAY/CLEAR); `phases[PHASE]` = `{mult, slots, percent, tiers}` (CLEAR), `mult` = hệ số tỉ lệ gặp theo buổi ×100 |
| `world-time.json` | `time_phases` + `weather_transitions` (chép từ `data/world/pokemon-spawns.json`), `themes` (map → District theme), `period` (20–40 phút một lần đổi thời tiết) |
| `level-caps.json` | bản chép của `data/battle/level-caps.json` (giới hạn cấp, câu từ chối của Thủ lĩnh) |
| `ground-items.json` | bản chép của `data/world/ground-items.json` (`src/pickup.ts`); `npm run assets` cảnh báo khi map đã đổi mà file chưa sinh lại |
| `maps/<slug>/map.json` `wander` | route sinh tự động: `level`, `classes` `[sprite, tên lớp, tiền thưởng gốc]`, `pool` (loài của District), `district` — cho Trainer đi lang thang (`src/wander.ts`) |
| `ui/Items/items.json` | thêm mọi Bóng có `item` trong `pokemon-capture-rules.json` và Xịt Chống Mạnh / Tối Đa (`"source": "world"`) |

## Máy chủ online: `server/data/` (gitignore, decisions.md §24)

- `mons.db`: SQLite (WAL). Bảng `meta` (`schema_version`), `accounts` (tên, `name_key` chữ thường duy nhất, `salt` + `hash` scrypt), `sessions` (sha256 của token, hết hạn), `saves` (`payload` = JSON `GAME` của `game/src/state.ts`, `rev`, giờ chơi, cột tra cứu: tên trong game, sprite, tiền, huy hiệu, map, x, y, số Pokémon trong đội, Mondex; giữ 5 bản mới nhất mỗi tài khoản), `chat` (7 ngày), `audit`. Schema: `server/migrations/NNN-*.sql`, áp dụng khi khởi động.
- `config.json` (tuỳ chọn): `{ "port": 8790 }`.
- Giao thức WebSocket: kiểu `ClientMsg` / `ServerMsg` trong `game/src/net/protocol.ts` (JSON, trường `t`).
