# Astral Expedition Pixel — Asset & Verification Tools (`tools/`)

Toàn bộ công cụ Python (`Pillow`) phục vụ tạo, chuẩn hóa và kiểm định gói tài nguyên **2D Pixel Đa Frame** cho dự án **Astral Expedition Pixel**. Mọi quy trình điều phối tương ứng nằm tại `.agents/skills/expedition-*/SKILL.md`.

## Bảng Ánh Xạ Thư Mục Công Cụ → Kỹ Năng (`expedition-*`)

| Thư mục `tools/` | Đầu ra chính | Kỹ năng tương ứng (`.agents/skills/`) |
|------------------|--------------|---------------------------------------|
| `gen3/` | Thư viện & CLI kiểm chuẩn phần cứng `BGR555`, alpha `0/255` (`check_gen3.py`) | Dùng chung toàn dự án |
| `units/` | Chuẩn hóa sprite `36f` chiến đấu & `48f` di chuyển, tách nền `#FF00FF` | `expedition-sprite-generator`, `expedition-battle-poses` |
| `battle-scenes/` | Dựng cảnh nền trận đấu `390×180` ×2 kèm lớp động `8 frame` | `expedition-battle-scene` |
| `characters/` | Dựng NPC trạm nghỉ & nhân vật phụ trên bản đồ | `expedition-npc-generator` |
| `skills/` | Chuẩn hóa hiệu ứng chiêu thức `8f CAST` + `8f EFFECT` & tia `beams.py` | `expedition-skill-vfx`, `expedition-skill-review` |
| `ui/` | Dựng bộ giao diện `VerticalSkillMenu`, font tiếng Việt, thanh AP & Break | `expedition-ui-generator` |
| `overworld/` | Sinh 47-tile blob autotiles & dải địa hình/prop động `8 frame` cho 7 vùng | `expedition-overworld-generator` |
| `structures/` | Sinh Cờ Trạm Nghỉ, Cổng Vùng Đất & Đại Điện Trùm kèm cổng động `4 frame` | `expedition-structure-generator` |
| `maps/` | Ghép 7 bản đồ `.tmj` & giải đường đi kiểm tra 20 chốt Quái Gác Cổng | `expedition-map-generator` |
| `items/` | Chuẩn hóa Tinh Cầu Triệu Hồi Gacha `8×6` (`26+ frame`) | `expedition-summon-orb-generator` |
| `expedition/` | `verify_skills_and_glossary.py`, `build_bundle.py`, `verify_bundle.py` | Đóng gói & cổng kiểm định toàn bộ gói tài nguyên |

`build_bundle.py` dựng mọi sheet trong `units/` qua `build_units.py`. Manifest ghi mã băm của ảnh game đọc trong `units/`.

### Units (`expedition/build_units.py`)

`py tools/expedition/build_units.py [--only id1,id2] [--jobs 8] [--preview tmp/units-review]` dựng lại toàn bộ `database-astral-expedition/units/` (12 anh hùng, 20 quái gác cổng, 7 trùm, 17 quái và người địch, 12 động vật), ghi `data/expedition/units.json`, cập nhật mục `units/` trong `manifest.json` và trang duyệt `specs/006-astral-expedition-pixel/design/units-review.html`.

`py tools/expedition/agy_units.py run --jobs 3` gọi ba phiên Antigravity theo prompt trong `prompts/units/`. Ảnh thô có tên riêng theo lượt và lưu tại `database-astral-expedition/art-source/agy-units/`. Bước xuất vào game chạy tuần tự để cập nhật manifest. Khi hết hạn mức, đợt kế tiếp có thể tiếp tục từ trạng thái đã lưu.

`py tools/expedition/import_unit_art.py <id> <battle|movement> <raw.png> --metadata` giữ nguyên đường dẫn game khi nhập hình vẽ lại. Giữ cả ảnh thô và ảnh chuẩn hóa trong `art-source/motion/redraw/`. Trình dựng unit ưu tiên ảnh chuẩn hóa ở thư mục đó.

Với Anh Hùng, importer hỗ trợ `portrait` 128×128 px và `--variant <kebab-case>` để ghi ảnh trang phục vào `units/heroes/variants/`. Dùng `--cast-source <3x2.png>` để thay riêng sáu frame ở hàng thi triển.

| File | Vai trò |
|---|---|
| `roster.py` | Thiết kế chuẩn của từng unit: rig, tỷ lệ, bảng màu, vũ khí, trường `art` trỏ về sheet vẽ tay |
| `pixel_rig.py` | Camera 3D chiếu trực giao, raster z-buffer, đổ bóng 4 tông theo nguồn sáng trên-trái, viền `#1b1726`, gom bảng màu 15 màu BGR555 |
| `rig_humanoid.py` | Rig người khoảng 8 đầu (male, female, lean, heavy, giant, golem), tóc, mũ, trang phục, áo choàng, cánh, 20 loại vũ khí, hiệu ứng |
| `rig_beasts.py` | Thú bốn chân, rồng, slime, rắn cuộn, bọ cạp/cua/nhện, chim/dơi/bướm, u linh/sứa/bạch tuộc |
| `anims.py` | Bảng khung 6 frame cho mọi hàng: Hero 6 hàng BACK, quái 4 hàng FRONT, Trùm 6 hàng FRONT, idle và walk 4 hướng |

Sheet vẽ tay trong `art-source/motion/` (Lâm Phong battle và movement, Phong Lang battle và leap, Seraphina battle và starblade) được chép nguyên vào `units/`, thay cho bản dựng từ rig.

`pixel_worlds.py` dựng địa hình, xuất lớp điểm mốc và kiểm tra các chốt trên bảy bản đồ trong lần đóng gói. Tọa độ gốc lấy từ `REALMS_LAYOUT`.

`py tools/expedition/export_battle_scenes.py` xuất riêng bảy đấu trường và cập nhật mã băm của chúng trong manifest từ atlas lưu ở `database-astral-expedition/art-source/battle-scenes/`.

`py tools/expedition/export_3d_arenas.py` chuẩn hóa lớp 3D của bảy vùng trong thư mục `arena/`. Ảnh nền đất, sàn, panorama và atlas đạo cụ lần lượt là 256×256, 512×512, 2048×512 và 1024×768 px. Atlas có JSON vùng cắt và chiều cao thế giới của từng đạo cụ.

Thêm `--only 01-dawn-meadow` để xuất riêng sân Đồng Cỏ từ bản panorama mới ở `art-source/battle-scenes/arena-meadow/panorama-redraw-source.png`.

`py tools/expedition/export_gatekeeper_redraws.py --jobs 4` tách các bản gốc 6×8 trong `art-source/motion/gatekeeper-redraw/` thành hai sheet 6×4, kiểm tra đủ frame và cập nhật manifest. Dùng `--only <id>` để xuất lại một Quái Gác Cổng sau khi sửa ảnh nguồn.

`py tools/expedition/export_traversal_tiles.py` xuất 7 atlas địa hình vượt bậc, 7 TSJ, 7 sân thử TMJ và dữ liệu dùng chung cho bản thử điều khiển.

Các lối vượt địa hình đang dùng của Chapter 1 nằm trong lớp đối tượng `traversal` của Tiled. Sau khi đổi bố cục, xuất lại địa hình bằng `py tools/expedition/export_overworld_terrain.py --only 01-dawn-meadow`. `py tools/expedition/export_bonfire.py` xuất dải trạm lửa tám frame.

`py tools/expedition/export_meadow_landscape.py` xuất atlas `structures/meadow/waterworks.png` và lớp `landscape` của Đồng Cỏ. Bộ đặt cảnh quan chọn ô phù hợp với nước, bờ, cỏ hoặc vách đá của TMJ hiện tại rồi giữ lại lưới va chạm gốc.

`py tools/expedition/export_visual_kit.py` xuất riêng các công trình, atlas UI và 30 cặp VFX. Lệnh nhận `--preview` để tạo ảnh duyệt.

`py tools/expedition/export_charm_icons.py` đóng bảy panel icon bùa thành atlas 8×8, ghi tọa độ theo ID và kiểm tra đủ bùa lẫn vật phẩm chiến đấu trong danh mục. `py tools/expedition/export_weapon_icons.py` xuất từng ảnh vũ khí theo ID chủ nhân hoặc mã mẫu của vũ khí thường.

`py tools/expedition/export_status_icons.py` vẽ và xuất glyph hiệu ứng trận đấu theo thứ tự `STATUS_IDS`. Các badge hỗ trợ đọc số tầng và số lượt trực tiếp từ trạng thái chiến đấu.

### Nguồn hình 1-1 (`expedition/art_source.py`)

Mỗi ảnh game trong `units/`, `ui/`, `vfx/skills/` có đúng một bản gốc `art-source/<cùng đường dẫn>-source.png` trên nền `#FF00FF`, theo đúng quy ước của `art-source/motion`, `battle-scenes` và `structures`. `py tools/expedition/art_source.py [--domain units|ui|vfx]` tách nền, đưa về BGR555 và alpha 0/255, khớp kích thước lưới, rồi cập nhật manifest. Bảng ánh xạ nằm trong `art-source/units/README.md`, `art-source/ui/README.md` và `art-source/vfx/README.md`. Vẽ hoặc thả bản ImageGen đè lên file `-source.png` là bản đó được dùng.

| Script | Vẽ bản gốc cho |
|---|---|
| `build_units.py` | `art-source/units/**` (rig 3D, vân lông / vải / đá / kim loại, dither, viền sáng trên-trái) |
| `pixel_vfx.py` | `art-source/vfx/skills/**` (60 dải, lõi sáng 5 tông, hạt theo nguyên tố) |
| `pixel_ui.py` | `art-source/ui/**` (khung đá viền đồng, đá quý, thanh chỉ số, Tinh Cầu Triệu Hồi) |
| `write_unit_prompts.py` | `prompts/units/**` (prompt vẽ tay cho từng unit theo chuẩn `art-source/motion`: ảnh đính kèm, prompt battle + movement, đường dẫn lưu và lệnh xuất) |
