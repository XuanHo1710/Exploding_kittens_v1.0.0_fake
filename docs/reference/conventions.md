# Quy ước

Mọi người (dev và AI agent) theo cùng một mẫu. Mỗi luật có mã. Luật có cột **Kiểm tra** = `lint` thì `tools/lint_repo.py` (`npm run lint`, chạy trong CI) bắt lỗi; luật khác được kiểm tra bằng lệnh ghi bên cạnh hoặc lúc review (checklist trong [`CONTRIBUTING.md`](../../CONTRIBUTING.md)). Thuật ngữ: [`GLOSSARY.md`](../../GLOSSARY.md). Vị trí thư mục: [repo-tree.md](repo-tree.md).

## 1. Thư mục

| Mã | Luật | Kiểm tra |
|---|---|---|
| D1 | Chỉ các mục gốc trong [repo-tree.md](repo-tree.md) được có trong git. Không tạo thư mục gốc mới; asset mới vào `assets/<miền>/`, dữ liệu vào `data/<miền>/`, code vào `tools/<miền>/` | lint `top-level` |
| D2 | Thư mục gốc của mỗi miền viết **kebab-case chữ thường**: `assets/<miền>/`, `data/<miền>/`, `tools/<miền>/` (`battle-scenes`, `third-party`) | lint `kebab-roots` |
| D3 | Tên thư mục **bên trong** miền giữ nguyên có chủ đích: `<GenX-Region>/<NNN>-<Name>/`, `<English Move Name>/`, `Base/`, `Gyms/`, `Battle/`, `Civic/`, `MonIcons/`… Chúng là id mà dữ liệu, spec map và manifest dùng; đổi tên = gãy tham chiếu. Thư mục mới bên trong theo mẫu của thư mục anh em | review |
| D4 | Một thư mục script mỗi miền, cùng tên với `assets/<miền>/`: script ghi vào `assets/maps/` nằm ở `tools/maps/`. Code dùng chung giữa nhiều miền: `tools/gen3/`. Script sinh `data/*.json`: `tools/data/` | review |
| D5 | Skill (`.agents/skills/<skill>/`) chỉ chứa `SKILL.md` + `references/*.md`; không có `scripts/`, không có code. Lệnh trong skill trỏ vào `tools/<miền>/` | lint `skill-no-code` |
| D6 | Thư mục loài `assets/pokemon/<GenX-Region>/<NNN>-<Name>/` chỉ chứa file chốt: `<slug>-movement.png`, `<slug>-battle.png`, `<slug>-reference.jpg`, `<slug>-anchors.json` tuỳ chọn, `<slug>-posses.png` cũ (không tạo mới); bản shiny tô lại bằng `tools/pokemon/shiny_recolor.py`: `<slug>-movement-shiny.png`, `<slug>-battle-shiny.png`, `<slug>-shiny.json` (biến thể `-shiny` theo `<slug>-<kind>[-<variant>]`). Không `drafts/`, không ảnh thô | lint `species-files` |

## 2. Tên file

| Mã | Luật | Kiểm tra |
|---|---|---|
| N1 | Slug: kebab-case chữ thường ASCII (`start-town`, `route-9a`, `house-grass`, `bulbasaur`). Slug loài: tên viết thường, `♀`→`-f`, `♂`→`-m`, bỏ dấu nháy và dấu chấm, mọi chuỗi ký tự khác chữ-số → `-` (decisions.md §1) | lint `species-files` (thư mục loài), review |
| N2 | File asset: `<slug>-<loại>[-<biến thể>].<ext>`, ví dụ `bulbasaur-movement.png`, `absorb-cast.png`, `gym-fire-interior-1f.png`, `tree-wall-night.png`. Loại là danh từ cố định của miền (`movement`, `battle`, `structure`, `ground`, `door`, `interior`, `cast`, `effect`, `vfx`, `prompt`, `anchors`…) | review |
| N3 | File Map: `<slug>/<slug>.map.json` (nguồn) và cùng tên cho file sinh ra (`<slug>.png`, `<slug>.tmj`, `<slug>-objects.tsj`, `<slug>-collision.txt`) | review |
| N4 | Script Python: `snake_case.py`, động từ trước (`draw_civic.py`, `build_assets.py`, `check_gen3.py`). Shell: `kebab` hoặc `snake`, có `#!/usr/bin/env bash` + `set -euo pipefail` | review |
| N5 | ADR: `docs/adr/NNNN-<tên-kebab>.md`, số tăng dần, không dùng lại | review |

## 3. Nguồn, file sinh ra, file tạm

| Mã | Luật | Kiểm tra |
|---|---|---|
| G1 | Sửa **nguồn** rồi chạy lại lệnh sinh; không sửa tay file sinh ra (lần build sau sẽ đè). Nguồn: spec map, `world.json`, `tools/**/*.py` (kể cả `pieces/`, `civic/`, `gyms/`, `chars/`), `prompts/`, ảnh AI đã chốt. Sinh ra: PNG/TMJ/TSJ của map, tile, công trình, nhân vật, UI, cảnh chiến đấu, phần lớn `data/*.json` | `npm run regen` rồi `git status` sạch |
| G2 | File chỉ để xem không vào git: `**/_preview/`, `assets/maps/**/*-debug.png`, `assets/maps/**/*-report.md` (trừ `world-report.md`), `mistakes.md`, `*.webp` của map. Mọi thứ trong `.gitignore` không được có trong git | lint `ignored-tracked` |
| G3 | Nháp, review, báo cáo, prompt pack: `tmp/` (gitignore) hoặc `/tmp/mons-refs/`. Không bao giờ để trong `assets/` | lint `species-files`, review |
| G4 | `data/*.json` sinh bởi `tools/data/*.py` (hoặc script ghi trong `tools/README.md`) được **sinh lại, không sửa tay**. JSON trong `data/` và mọi spec `*.map.json` phải parse được | lint `json` |
| G5 | `game/public/assets/` và `game/dist/` là sinh ra, gitignore; sau khi đổi asset game dùng thì chạy `npm run assets` | review |
| G6 | File > 50 MB không vào git (GitHub chặn 100 MiB); file bên thứ ba lớn để ở `demos/` (gitignore) | lint `big-files` |

## 4. Script

| Mã | Luật | Kiểm tra |
|---|---|---|
| S1 | Mỗi file `.py` trong `tools/`, `game/tools/` mở đầu bằng **docstring module** nói nó làm gì, kèm **một ví dụ lệnh** chạy từ gốc repo | lint `docstring` (có docstring); ví dụ: review |
| S2 | Script mới có CLI dùng `argparse` (nên `--help` chạy được). Script cũ chưa có argparse nằm trong danh sách đóng băng `LEGACY_NO_ARGPARSE` của `lint_repo.py`: danh sách chỉ được bớt, không được thêm | lint `argparse` |
| S3 | Chỉ đường dẫn **tương đối với repo**: `REPO = 2 cấp trên script` rồi `os.path.join(REPO, "assets", …)`. Không đường dẫn máy riêng (`/home/…`, `/snap/…`) trong file trong git. Thứ nằm ngoài repo đi qua biến môi trường `MONS_*` ([commands.md](commands.md#biến-môi-trường)); dòng là giá trị mặc định của một biến `MONS_*` thì được phép | lint `machine-paths` |
| S4 | Chạy mọi lệnh từ gốc repo. Import: script tự thêm thư mục của nó vào `sys.path`; code dùng chung `os.path.join(HERE, "..", "gen3")`; miền khác `os.path.join(REPO, "tools", "<miền>")`. Không tạo gói pip (decisions.md §22) | review |
| S5 | Output tất định: cùng đầu vào → cùng pixel (seed cố định). Sửa code sinh asset thì chứng minh bằng [kiểm tra hồi quy](../how-to/regression-check.md) | `npm run regen` |
| S6 | Python: Pillow là dependency duy nhất bắt buộc; thêm dependency thì ghi vào `pyproject.toml`. Dòng ≤ 120 ký tự (`[tool.ruff]`) | review |
| S7 | Lệnh mới dùng toàn repo: thêm vào `package.json` và [commands.md](commands.md) | review |

## 5. Hình ảnh (Gen 3)

| Mã | Luật | Kiểm tra |
|---|---|---|
| I1 | Luật phần cứng Gen 3: màu BGR555, alpha chỉ 0 hoặc 255, ≤ 15 màu mỗi ô 8×8, ≤ 6 palette mỗi ngoại thất (≤ 13 mỗi nội thất), lưới metatile 16 px phóng ×2. Nguồn: [`gen3-visual-style.md`](../explanation/research/gen3-visual-style.md) | `check_gen3.py --quiet <thư mục>` (trong `npm run check`) |
| I2 | Pixel art phóng nguyên lần bằng NEAREST, không làm mịn, không thu nhỏ ảnh đã xong. Map 16 px/ô; game hiển thị 40 × 22.5 ô (decisions.md §10) | review |
| I3 | Pokémon giữ đúng giải phẫu và tỉ lệ của artwork chính thức, không chibi; đếm chi, không thêm chân / tay / cánh | `compare_reference.py`, review |
| I4 | Chỉ thiết kế gốc lấy cảm hứng từ thế giới Pokémon: không copy tile, logo hay chữ của game thật | review |
| I5 | Nền magenta `#FF00FF` cho sprite sheet trước khi game key; ô 192×192, vùng an toàn 160 px | `normalize_sheet.py` |

## 6. Ngôn ngữ

| Mã | Luật | Kiểm tra |
|---|---|---|
| L1 | Chữ trong game (thoại, menu, tên địa điểm): **tiếng Việt** | review |
| L2 | Code, tên định danh, tên file, commit, nhánh, comment code: **tiếng Anh** | review |
| L3 | Docs: tiếng Việt hoặc tiếng Anh; ghi ngôn ngữ trong [`docs/README.md`](../README.md). Giữ thuật ngữ GLOSSARY bằng tiếng Anh (Map, Route, Connection, Warp, Prop, Autotile, District…), dùng đúng nghĩa trong GLOSSARY | review |

## 7. Quyết định và tài liệu

| Mã | Luật | Kiểm tra |
|---|---|---|
| K1 | Quyết định kiến trúc lớn, khó đảo ngược (cấu trúc repo, stack, pipeline chính): ADR mới trong `docs/adr/` (Status / Context / Decision / Consequences) | review |
| K2 | Quyết định về định dạng, pipeline, tích hợp game do người dùng chốt: thêm hoặc sửa mục trong [`docs/agents/decisions.md`](../agents/decisions.md), ghi ngày | review |
| K3 | Khi quy trình đổi, sửa `SKILL.md` tương ứng (và `README.md` của `tools/<miền>/`, [how-to](../how-to/)) **trong cùng PR** | review (checklist PR) |
| K4 | Tài liệu mới vào đúng loại Diátaxis (`tutorials/ how-to/ reference/ explanation/`) và có một dòng trong [`docs/README.md`](../README.md) | review |
| K5 | Link tương đối trong mọi file `.md` phải trỏ tới file có thật | lint `md-links` |
| K6 | Không viết tên dự án / gói nội dung / nền tảng bên thứ ba mà `tools/check_names.py` cấm (trong code, dữ liệu, docs, comment, tên trường, tên file, tên thư mục). Dùng cách gọi trung lập ("the upstream project", "the reference implementation", "the 3D model source", "Fall-back"); tên, URL, phiên bản, giấy phép chỉ có trong `THIRD_PARTY_NOTICES.md` (+ `LICENSES/`). Bản sao nguyên byte được liệt kê ở đó thì miễn (decisions.md §20) | lint `names` |

## 8. Git

| Mã | Luật | Kiểm tra |
|---|---|---|
| V1 | Nhánh từ `main`: `feat/<việc>`, `fix/<việc>`, `chore/<việc>`, `docs/<việc>`; không commit thẳng lên `main` | review |
| V2 | Commit nhỏ, mỗi commit một ý, tiêu đề tiếng Anh thì hiện tại ("Redesign route-1 at double size") | review |
| V3 | PR theo mẫu `.github/PULL_REQUEST_TEMPLATE.md` (Summary / Evidence / Merge Danger + Definition of Done); CI `check` xanh | CI |

## 9. Luật máy kiểm tra (`tools/lint_repo.py`)

`python3 tools/lint_repo.py --list` in danh sách này; `python3 tools/lint_repo.py` chạy tất cả (exit ≠ 0 khi có lỗi).

| Luật lint | Mã | Bắt gì |
|---|---|---|
| `top-level` | D1 | file hoặc thư mục gốc trong git ngoài danh sách cho phép |
| `kebab-roots` | D2 | thư mục con trực tiếp của `assets/`, `data/`, `tools/` không phải kebab-case |
| `skill-no-code` | D5 | thư mục `scripts/` hoặc file code (`.py .sh .js .ts`) trong `.agents/skills/` |
| `species-files` | D6, N1, G3 | file trong thư mục loài không thuộc loại cho phép |
| `ignored-tracked` | G2 | file trong git mà `.gitignore` bảo là sinh ra / tạm (`git ls-files -ci --exclude-standard`) |
| `json` | G4 | JSON không parse được trong `data/`, `assets/maps/world.json` và `assets/maps/**/*.map.json` |
| `big-files` | G6 | file trong git > 50 MB |
| `docstring` | S1 | file `.py` trong `tools/`, `game/tools/` không có docstring module |
| `argparse` | S2 | script trong `tools/` hoặc `game/tools/` có `__main__` mà không dùng `argparse`, ngoài danh sách đóng băng; script trong danh sách đã có argparse thì phải bỏ khỏi danh sách |
| `machine-paths` | S3 | `/home/…` hoặc `/snap/…` trong file văn bản trong git, trừ dòng định nghĩa mặc định của biến `MONS_*` và file trong danh sách cho phép (có lý do) |
| `md-links` | K5 | link tương đối trong `.md` trỏ tới file không có |
| `names` | K6 | tên bên thứ ba bị cấm trong nội dung hoặc đường dẫn file (logic của `tools/check_names.py`) |

Muốn ngoại lệ: thêm vào danh sách cho phép trong `lint_repo.py` **kèm lý do** trong cùng dòng, và nói trong PR.
