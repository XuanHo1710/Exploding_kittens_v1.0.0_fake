# Thêm hoặc vẽ lại một Poké Ball

Mỗi Poké Ball là một sheet chiến đấu (ném, mở, lắc, bắt được, thoát, icon) do agy vẽ **một lần** rồi chuẩn hoá bằng code. Kết quả: `assets/items/PokeBalls/<Name-Ball>/<id>-ball.png` + `<id>-ball.json` + `<id>-reference.png`. Quy trình đầy đủ và luật (bóng tròn 24 px, ô không cắt hình, nền xanh cho bóng tím / hồng): [pokeball SKILL.md](../../.agents/skills/pokeball-generator/SKILL.md), [decisions.md §18](../agents/decisions.md).

1. Tạo gói prompt (cần numpy và thư mục asset 3D tham chiếu):
   ```bash
   MONS_REF_ASSETS=<thư mục asset 3D> $MONS_PY3D tools/agy/ball_pack.py master      # hoặc all
   python3 tools/agy/agy_queue.py add ball-master @tmp/agy-requests/ball-master.txt
   ```
2. Sau khi agy vẽ xong (`tmp/mons-refs/master-ball-raw.png`), chuẩn hoá và kiểm tra:
   ```bash
   python3 tools/items/normalize_ball.py --ball master --input tmp/mons-refs/master-ball-raw.png
   python3 tools/items/ball_reference.py master          # artwork chính thức → <id>-reference.png
   python3 tools/items/check_ball.py master              # PASS / WARN / FAIL + tmp/report/pokeballs/master.png
   ```
   Chỉ vẽ lại **một lần** khi sheet vẫn FAIL lúc hiển thị (còn magenta, bị cắt, thiếu hàng, thiếu bóng).
3. Xem chuỗi bắt Pokémon: `python3 tools/items/catch_anim.py --ball master --target pidgey --success`, hoặc trang `/catch` của move viewer (`tools/skills/move_viewer.py`).
4. Chạy `npm run lint`. Thư mục bóng chỉ giữ 3 file trên; nháp ở `tmp/`.
