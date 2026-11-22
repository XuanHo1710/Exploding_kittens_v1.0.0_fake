# Dữ liệu trận đấu, vật phẩm, tiến hoá và bắt Pokémon

Các file `data/` dưới đây được **sinh ra**, không sửa tay (luật G4). `build_type_chart.py`, `build_move_effects.py`, `build_battle_extras.py` cần một bản Pokémon Showdown: đặt `MONS_SHOWDOWN_SRC` = thư mục `dist/data` của nó (mặc định `sim/ShowdownSim/dist/data` nếu có ở máy). Không có thì script in `skipped` và thoát 0, giữ nguyên `data/battle/*.json` đã commit, nên build game không cần Showdown. Thiết kế: [spec 11](../explanation/spec/11-battle-and-save-systems.md); quyết định: [decisions.md](../agents/decisions.md) §12b, §17, §18, §21. Đường dẫn ngoài repo đi qua biến `MONS_*` ([commands.md](../reference/commands.md#biến-môi-trường)); tên và giấy phép nguồn chỉ ở [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

| Muốn đổi | Lệnh (từ gốc repo) | Ra |
|---|---|---|
| đội Trainer, luật League, level cap | `python3 -I tools/data/build_trainers.py [--pokefirered tmp/pokefirered]`, rồi chạy lại `build_move_effects.py` (cờ `trainer` đọc `trainers.json`) | `data/battle/{trainers,level-caps}.json` |
| hiệu ứng chiêu trong trận (cơ chế Gen 3; hệ, loại, power / accuracy / PP gen mới nhất) | `python3 -I tools/data/build_move_effects.py [--pokeemerald tmp/pokeemerald]` | `data/battle/move-effects.json` |
| ability, vật phẩm cầm, thời tiết | `python3 -I tools/data/build_battle_extras.py [--pokeemerald tmp/pokeemerald]` | `data/battle/{abilities-battle,held-items,weather}.json` |
| điều kiện tiến hoá | `python3 -I tools/data/build_evolutions.py --reference-src <dir>` (hoặc `MONS_REFERENCE_SRC`) | `data/pokemon/pokemon-evolutions.json` |
| catch rate, luật bắt | `python3 -I tools/data/catch_rates.py --reference-src <dir>` | `data/pokemon/pokemon-{catch-rates,capture-rules}.json`, `docs/explanation/research/capture-reference.json` |
| chuỗi ném / lắc bóng | `python3 -I tools/data/pokeball_anim.py --src <asset 3D>` | `data/battle/pokeball-animation.json` |
| chuỗi tiến hoá, dải hạt `evo_*` | `python3 tools/skills/evolution_fx.py facts` / `strips` | `data/battle/evolution-animation.json`, `assets/ui/Evolution/` |
| icon túi từ texture tham chiếu | `python3 -I tools/ui/import_item_icons.py [<dir>]` | `assets/ui/Items/` (+ `items.json`, `LICENSE.md`) |
| bảng hệ 18 (gen mới nhất) | `python3 -I tools/data/build_type_chart.py` (đọc bản Showdown ở `MONS_SHOWDOWN_SRC` qua `tools/data/showdown_dump.cjs typechart`) | `data/battle/type-chart.json` |
| chiêu hợp lệ của từng loài (danh sách chiêu của engine tham chiếu, mọi nhóm, cả tiền tiến hoá) | `python3 -I tools/data/build_move_legality.py --reference-src <dir>` (hoặc `MONS_REFERENCE_SRC`) | `data/pokemon/pokemon-move-legality.json` |
| tên chiêu tiếng Việt | sửa tay `data/battle/move-names-vi.json` (tên riêng của Mons; mọi chiêu game xuất ra phải có tên) | — |
| chiêu bộ máy trận đấu chưa chạy | sửa `game/src/battle/implemented.json` `unsupported` | chiêu đó không được xuất |
| hiệu ứng hệ thống trận đấu (agy) | `python3 tools/agy/fx_pack.py prompt all` → agy → `fx_pack.py normalize <key> --input <raw>` → `fx_pack.py check <key>` | `assets/ui/Battle/<effect>.png` + `battle-fx.json` |

Sau đó: `git diff --stat data/ assets/ui/` chỉ có thay đổi mong muốn, `node game/tools/check_capture.ts` (khi đổi luật bắt), `npm run lint`, `npm run assets`, `npm run typecheck`, `node game/tools/check_battle.ts` (bộ máy trận đấu so với bản Showdown và AI so với `sim/BattleSim`; bỏ qua phần sim khi không có `sim/`), `node game/tools/check_learnsets.ts` (mọi đội Trainer, starter, Pokémon hoang dã chỉ biết chiêu hợp lệ), rồi chơi thử cảnh liên quan.

`npm run assets` (`game/tools/build_assets.py battle_data`) chép vào `game/public/assets/data/`: `type-chart.json`, `abilities.json`, `held-items.json`, `weather.json`, `level-caps.json`, `battle-rules.json` (khối `rules` của `move-effects.json`), `legal-moves.json` (chiêu hợp lệ của từng loài trong game), và `moves.json` mang `category / target / flags / damage / fx` của `move-effects.json`. `Boot.ts` nạp chúng vào `game/src/battle/tables.ts`. Bộ máy trận đấu tham chiếu (Showdown, MIT, không sửa): `sim/ShowdownSim/README.md`, chỉ ở máy local (`sim/` rời GitHub ngày 2026-11-19).
