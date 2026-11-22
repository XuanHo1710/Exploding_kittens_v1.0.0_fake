# Chứng minh output không đổi (kiểm tra hồi quy)

Dùng khi sửa code sinh asset, dời file, hay đổi đường dẫn: mọi PNG/JSON trong git phải giống từng pixel, trừ thay đổi có chủ đích.

```bash
python3 tools/hash_outputs.py --out tmp/hashes/before.json   # sha256 mọi file trong git (--pixels: PNG theo pixel; --public: thêm game/public/assets)
npm run regen                  # tools/regen.sh: chạy lại mọi generator không cần tải về / jar / AI, theo thứ tự phụ thuộc (~7 phút)
git status                     # phải sạch, trừ thay đổi có chủ đích
python3 tools/hash_outputs.py --out tmp/hashes/after.json
python3 tools/hash_outputs.py --compare tmp/hashes/before.json tmp/hashes/after.json   # changed / removed / added / moved
```

- `tools/regen.sh [bước…]`: mặc định `overworld structures chars scenes maps ui data`; thêm `icons` và `legacy-maps` khi cần; `--list` in danh sách. Cuối script, PNG chỉ khác byte (cùng pixel, do Pillow/zlib khác máy) được checkout lại (`hash_outputs.py --git-pixels --restore`), nên `git status` chỉ còn thay đổi thật.
- Lần kiểm tra 2026-11-19 trên `c6c530d2`: mọi bước mặc định cho đúng từng pixel như commit. Ngoại lệ là file trong git cũ hơn code (không phải do ngẫu nhiên): `assets/ui/MonIcons` (5 icon + `icons.json`, thiếu 3 loài) và 8 map không có trong `assets/maps/world.json` (`cinder-town`, `dune-town`, `ember-route`, `fen-town`, `flint-town`, `maple-town`, `tide-town`, `volt-town`). Muốn cập nhật thì chạy `tools/regen.sh icons legacy-maps` rồi commit có chủ đích.
- Không có trong harness: `tools/data/{locomotion,gen_lists,learnsets,species_notes,moves_readme,import_sounds,build_trainers,animations}.py` và `build_anchors.py` (vì cần CSV PokéAPI, jar model 3D, tải pret, sheet 3D hoặc numpy), cùng mọi bước vẽ bằng AI.
