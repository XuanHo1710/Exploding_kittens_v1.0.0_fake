# Cây thư mục

Một dòng cho mỗi thư mục: chứa gì, và ai viết (**tay** = viết tay, là nguồn; **sinh** = do lệnh tạo ra, không sửa tay). Lý do chọn cấu trúc này: [ADR 0002](../adr/0002-repository-layout.md) và [`explanation/repo-structure.md`](../explanation/repo-structure.md). Quy ước đặt tên: [conventions.md](conventions.md). `tools/lint_repo.py` kiểm tra rằng không có thư mục gốc nào ngoài danh sách này.

```text
mons/
├── README.md, CONTRIBUTING.md, AGENTS.md, GLOSSARY.md   lối vào: giới thiệu, quy trình đóng góp, router cho agent, thuật ngữ
├── THIRD_PARTY_NOTICES.md, LICENSES/   nơi DUY NHẤT ghi tên, nguồn, phiên bản và giấy phép của dự án bên thứ ba (tay); LICENSES/ = toàn văn giấy phép
├── package.json, package-lock.json   task runner chung (npm workspaces ["game", "server"]); lockfile duy nhất
├── pyproject.toml                    dependency Python (Pillow; extra [3d] = numpy + OpenCV); không có gói
├── .gitattributes, .gitignore        file sinh ra (linguist-generated), file không vào git
├── .github/                          CI (workflows/check.yml), PULL_REQUEST_TEMPLATE.md, CODEOWNERS
│
├── game/                             client Phaser 4 + Vite + TypeScript (tay); luật riêng: game/AGENTS.md
│   ├── src/                          code game: scenes/, screen.ts, data.ts, trainers.ts, encounter.ts, clock.ts, wander.ts, caps.ts, capture.ts, ballanim.ts, battlefx.ts, items.ts, learnset.ts, audio.ts, music.ts…; battle/ (bộ máy trận đấu thuần TS: rng, state, events, tables, damage, effects, turn, ai, exp, text, hooks); net/ (online: protocol.ts dùng chung với server/, client, save, presence, chat, login, online.css)
│   ├── tools/                        build_assets.py (+ battle_assets.py: Poké Ball, hiệu ứng trận đấu), export_sounds.py: gom asset repo → public/assets (npm run assets); check_capture.ts, check_battle.ts, check_learnsets.ts (+ battle_env.ts), check_encounters.py, check_stats.ts; world_assets.py (đồng hồ, thời tiết, bảng gặp theo buổi × thời tiết, vật phẩm)
│   ├── public/assets/                SINH bởi npm run assets, gitignore
│   └── dist/                         SINH bởi npm run build, gitignore
│
├── server/                           máy chủ online (tay; decisions.md §24): Node + ws + node:sqlite, chạy TS trực tiếp; main.ts (HTTP + /ws, lệnh quản trị), hub.ts (tài khoản, lưu, phòng theo map, chat), db.ts + migrations/NNN-*.sql, auth.ts, validate.ts, static.ts; test/ (check_server.ts, shots_online.ts); data/ = SQLite + config, gitignore
├── assets/                           mọi nội dung đã chốt, một thư mục mỗi miền (kebab-case)
│   ├── pokemon/                      sprite loài <GenX-Region>/<NNN>-<Name>/ (AI vẽ + normalize); Fall-back/ = model 3D tham chiếu (nguồn: THIRD_PARTY_NOTICES.md)
│   ├── overworld/                    tile, autotile, prop: Base/{Terrain,Props}/, Gyms/<type>/, index.json (SINH: gen_overworld.py)
│   ├── maps/                         <slug>/<slug>.map.json (TAY, nguồn) + .png/.tmj/.tsj/-collision.txt (SINH: mapgen.py); world.json (TAY)
│   ├── structures/                   công trình, nội thất, cửa: Civic/, Battle/ (SINH: draw_civic.py, draw_gym.py)
│   ├── characters/                   Player, NPC, Trainer, Gym Leader, League (SINH: draw_chars.py; Player vẽ tay: import_drawn.py)
│   ├── battle-scenes/                nền trận đấu theo District × địa hình (SINH: battle_scene.py)
│   ├── ui/                           font, khung chữ, HUD, icon (SINH: draw_ui.py); Items/ icon túi (+ import_item_icons.py), Battle/ hiệu ứng hệ thống trận đấu (agy: fx_pack.py), Screens/ nền loading + đăng nhập và Icons/app/ icon app (agy: ui_pack.py), Evolution/ hiệu ứng tiến hoá (evolution_fx.py)
│   ├── items/                        PokeBalls/<Name-Ball>/: sheet Poké Ball (agy vẽ + tools/items/normalize_ball.py)
│   ├── skills/                       hiệu ứng chiêu <GenX-Region>/<English Move Name>/ (AI vẽ + apply_official.py); Fallback/ = thư viện cục bộ (gitignore)
│   ├── audio/                        âm thanh CC0 (THIRD_PARTY_NOTICES.md §10): footsteps/ bước chân theo mặt đất, flight/ vỗ cánh, music/ nhạc nền mỗi ngữ cảnh (<slug>-music.ogg, mã hoá lại); bảng sự kiện: data/audio/game-sounds.json
│   └── third-party/reference-sounds/ âm thanh của dự án gốc (MPL-2.0, không sửa; tools/data/import_sounds.py)
│
├── data/                             JSON dữ liệu game (phần lớn SINH bởi tools/data/*.py; không sửa tay)
│   ├── audio/                        game-sounds.json: sự kiện → file âm thanh, nhạc nền theo ngữ cảnh (tay; game/tools/export_sounds.py)
│   ├── battle/                       moves.json, trainers.json, level-caps, tên chiêu tiếng Việt, nguồn hiệu ứng chiêu, move-effects, abilities-battle, held-items, weather, pokeball-animation, evolution-animation
│   ├── pokemon/                      locomotion, learnsets, notes, anchors, animations, base stats, sizes, evolutions, catch rates, capture rules
│   ├── stats/                        luật chỉ số Gen 3: natures, abilities, EV items, species
│   └── world/                        spawn và luật gặp Pokémon hoang dã
├── prompts/                          prompt sinh ảnh AI (tay): movement/, battle/, moves/, structure/, overworld/
│
├── tools/                            mọi pipeline Python, một thư mục mỗi assets/<miền> (tay); luật riêng: tools/AGENTS.md
│   ├── gen3/                         pass Gen 3 dùng chung (gen3.py) + bộ kiểm tra check_gen3.py
│   ├── pokemon/ overworld/ maps/ structures/ characters/ battle-scenes/ ui/ skills/ items/   một thư mục mỗi miền asset, mỗi cái có README.md
│   ├── data/                         script sinh data/*.json (từ PokéAPI, dữ liệu loài của dự án gốc, pret, bản Showdown ở $MONS_SHOWDOWN_SRC)
│   ├── world/                        code dùng chung cho bảng gặp Pokémon hoang dã của data/world/ (encounters.py: eligible + rarity_table: bậc hiếm, phương án B), game/tools/build_assets.py import
│   ├── agy/                          gói prompt và tiện ích cho agy (Antigravity CLI)
│   ├── model3d/                      render model 3D Fall-back → sheet tham chiếu chuyển động
│   ├── game/                         manifest cho demo Sodier War
│   ├── demo/                         video demo (WebP)
│   ├── cloudflare/                   vòng lặp sinh ảnh qua Cloudflare
│   └── check.sh, regen.sh, hash_outputs.py, lint_repo.py, check_names.py, mistakes.py   lệnh dùng chung toàn repo
├── sim/                              CHỈ Ở MÁY LOCAL (gitignore từ 2026-11-19): bộ mô phỏng BattleSim/, EncounterSim/, StatSim/, ShowdownSim/; logic đã vào game, các check so với chúng tự bỏ qua khi không có
│
├── .agents/skills/<skill>/           quy trình cho AI agent: chỉ SKILL.md + references/ (không có code)
├── docs/                             tài liệu (mục lục: docs/README.md)
│   ├── tutorials/                    học từng bước: chạy game lần đầu, sửa map đầu tiên
│   ├── how-to/                       công thức cho một việc cụ thể, trỏ tới SKILL.md
│   ├── reference/                    tra cứu: cây thư mục, quy ước, định dạng file, lệnh
│   ├── explanation/                  vì sao: research/ (nghiên cứu Gen 3 có nguồn), spec/ (thiết kế game), repo-structure.md
│   ├── adr/                          quyết định kiến trúc, mỗi quyết định một file NNNN-<tên>.md
│   └── agents/                       cấu hình cho agent: decisions.md (quyết định đã chốt), issue tracker, nhãn, domain
│
├── tmp/                              SINH: nháp, preview, review, báo cáo (gitignore)
├── pokemon3d                         symlink tới sheet 3D đã render ($MONS_3D_DIR, gitignore)
├── demos/                            jar model 3D và file bên thứ ba lớn (gitignore)
└── node_modules/, .venv/             cài đặt cục bộ (gitignore)
```

## Bên trong một thư mục miền

| Thư mục | Bên trong | Ví dụ |
|---|---|---|
| `assets/pokemon/` | `<GenX-Region>/<NNN>-<Name>/<slug>-{movement,battle,posses}.png`, `<slug>-reference.jpg`, `<slug>-anchors.json`; `<GenX-Region>/<genx-region>.md` (danh sách loài) | `Gen1-Kanto/006-Charizard/charizard-movement.png` |
| `assets/overworld/` | `Base/Terrain/<slug>/` (`<slug>.png`, `.tsj`, `tiles/`, `-overlay.png`), `Base/Props/<slug>/` (`<slug>.png`, `.json`), `Gyms/<type>/…`; `_preview/` gitignore | `Base/Terrain/dirt-path/dirt-path.tsj` |
| `assets/maps/` | `<slug>/<slug>.map.json`, `.png`, `.tmj`, `-objects.tsj`, `-collision.txt`; `world.json`, `world.png`, `world-report.md`; `-report.md`, `-debug.png` gitignore | `route-1/route-1.tmj` |
| `assets/structures/` | `<Category>/<slug>/<slug>-{structure,ground,door}.png`, `-door.json`, `-interior*.png/.json`; `*-overview.png` | `Battle/gym-fire/` |
| `assets/items/` | `PokeBalls/<Name-Ball>/<id>-ball.png` + `<id>-ball.json` (bố cục sheet) + `<id>-reference.png` (artwork chính thức đã dùng) | `PokeBalls/Master-Ball/master-ball.png` |
| `assets/ui/` | `Font/`, `Windows/<theme>/`, `HUD/`, `Icons/`, `Types/`, `Badges/`, `MonIcons/`; `Items/<id>.png` + `items.json` (+ `LICENSE.md`); `Battle/<effect>.png` + `battle-fx.json`; `Evolution/evo-*.png` + `evolution.json` (+ `LICENSE.md`) | `Items/rare-candy.png` |
| `assets/skills/` | `<GenX-Region>/<English Move Name>/<id>-{cast,effect}.png`, `-vfx.json`, `-prompt.md` | `Gen1-Kanto/Absorb/absorb-cast.png` |
