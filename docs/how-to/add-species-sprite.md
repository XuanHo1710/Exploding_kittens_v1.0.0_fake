# Thêm sprite cho một loài Pokémon

Mục tiêu: `assets/pokemon/<GenX-Region>/<NNN>-<Name>/<slug>-movement.png` cho một loài chưa có (hoặc vẽ lại). Quy trình chi tiết (prompt pack, thứ tự loop, kiểm tra chuyển động): [sprite SKILL.md](../../.agents/skills/pokemon-sprite-generator/SKILL.md). Cần một công cụ sinh ảnh AI (agy hoặc `image-generator`).

1. Tải artwork tham chiếu và xem thư mục đích:
   ```bash
   bash tools/pokemon/fetch_reference.sh "Charmander"      # in OUT_DIR, SLUG; lưu <slug>-reference.jpg
   ```
2. Tạo prompt pack (loài có model 3D, tức mọi loài có trong `assets/pokemon/Fall-back/`; `locomotion` lấy trong `data/pokemon/pokemon-locomotion.json`):
   ```bash
   python3 tools/agy/agy_pack.py --name Charmander --slug3d charmander --locomotion walk --species Gen1-Kanto/004-Charmander
   ```
   Mở `tmp/prompts/charmander-movement-v3-3d.md` và làm theo: mỗi loop sinh **một** ảnh. Vẽ `idle` trước. Các loop sau đính kèm `idle` đã chuẩn hoá làm ảnh thứ tư. Không vẽ song song.
3. Sau mỗi loop: chạy dòng `normalize_sheet.py` trong pack, rồi `python3 tools/pokemon/loop_check.py --loop <L> …`. Kết quả `REDO` thì vẽ lại loop đó.
4. Ghép loop bằng dòng `assemble_loops.py` trong pack, rồi chạy các bước kiểm tra:
   ```bash
   python3 tools/agy/compare_reference.py charmander     # tmp/compare/charmander.png: phải giống artwork
   python3 tools/skills/anchor_check.py charmander       # CHECK → sửa <slug>-anchors.json
   python3 tools/agy/clean_drafts.py charmander          # xoá nháp
   ```
5. Thư mục loài chỉ còn file chốt (luật D6 trong [conventions.md](../reference/conventions.md)). Chạy `npm run lint` và `npm run assets`.

Battle pose (tấn công, trúng đòn, né, gục) là một sheet khác: [battle-poses SKILL.md](../../.agents/skills/pokemon-battle-poses/SKILL.md), lệnh `python3 tools/agy/battle_pack.py --name <Name> --species <GenX-Region>/<NNN>-<Name>`.
