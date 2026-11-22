# Cập nhật dữ liệu từ PokéAPI (và dự án gốc, pret, bản sao Showdown)

File `data/*.json` có script sinh thì **không sửa tay**: sửa script hoặc đầu vào rồi chạy lại. Bảng file → script: [file-formats.md](../reference/file-formats.md#dữ-liệu-data); lệnh đầy đủ: [`tools/README.md`](../../tools/README.md).

1. Tải CSV PokéAPI (không commit) từ <https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv>. Cần `pokemon_species`, `pokemon_species_names`, `pokemon_types`, `type_names`, `moves`, `move_names`, `pokemon`, và các bảng `pokemon_moves` cho learnset. Để chúng trong `tmp/pokeapi/`.
2. Chạy script tương ứng từ gốc repo:
   ```bash
   python3 tools/data/learnsets.py tmp/pokeapi          # data/pokemon/pokemon-learnsets.json
   python3 tools/data/species_notes.py tmp/pokeapi      # data/pokemon/pokemon-notes.json (giữ ghi chú viết tay)
   python3 tools/data/moves_readme.py tmp/pokeapi assets/skills   # danh sách chiêu theo thế hệ trong assets/skills/
   python3 tools/data/build_trainers.py                 # data/battle/trainers.json + level-caps.json (tải pret/pokefirered)
   python3 -I tools/data/locomotion.py demos/<jar model 3D>   # data/pokemon/pokemon-locomotion.json
   ```
3. Xem `git diff --stat data/`. Thay đổi phải đúng điều mình chờ đợi. Sau đó chạy `npm run lint` (JSON parse được), `npm run assets`, chơi thử cảnh liên quan.
4. Các script này không nằm trong `tools/regen.sh` vì cần tải dữ liệu về. Ghi nguồn và ngày tải trong mô tả PR.

Dữ liệu trận đấu, tiến hoá, bắt Pokémon, icon vật phẩm, hiệu ứng hệ thống trận đấu: [add-battle-data.md](add-battle-data.md). Các script đọc bản Showdown cần `MONS_SHOWDOWN_SRC` ([commands.md](../reference/commands.md#biến-môi-trường)); không có thì chúng bỏ qua và giữ nguyên dữ liệu đã commit.
