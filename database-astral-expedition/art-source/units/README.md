# Nguồn hình units · Astral Expedition Pixel

Mỗi sheet trong `units/` có đúng một bản gốc `*-source.png` ở cùng đường dẫn tương đối, vẽ trên nền phẳng `#FF00FF`.
Bản gốc hiện tại được dựng bằng rig 3D (`tools/expedition/build_units.py`) theo phong cách của `art-source/motion/`: tỷ lệ người thật, ánh sáng trên-trái, viền `#1b1726`, bảng màu trầm ấm, vân lông / vải / đá / kim loại và dither ở ranh giới tông. Sheet của Lâm Phong, Phong Lang và Seraphina lấy nguyên từ bản vẽ ImageGen trong `art-source/motion/`.

Thay một unit bằng bản vẽ tay: vẽ theo `prompts/battle/README.md` hoặc `prompts/movement/README.md`, giữ đúng số cột × hàng, lưu đè lên file `-source.png` tương ứng, rồi chạy `py tools/expedition/art_source.py --domain units`.

| Bản gốc (`art-source/`) | Ảnh game | Kích thước | Mô tả |
|---|---|---|---|
| `units/heroes/gustave_blade-battle-source.png` | `units/heroes/gustave_blade-battle.png` | 1152×1152 | Miran · heroes · battle 6×6 @192 · view BACK |
| `units/heroes/gustave_blade-movement-source.png` | `units/heroes/gustave_blade-movement.png` | 384×512 | Miran · heroes · movement 6×8 @64 · DOWN/LEFT/RIGHT/UP |
| `units/heroes/gustave_blade-portrait-source.png` | `units/heroes/gustave_blade-portrait.png` | 128×128 | Miran · chân dung 128×128 |
| `units/heroes/celine_prism-battle-source.png` | `units/heroes/celine_prism-battle.png` | 1152×1152 | Karen · heroes · battle 6×6 @192 · view BACK |
| `units/heroes/celine_prism-movement-source.png` | `units/heroes/celine_prism-movement.png` | 384×512 | Karen · heroes · movement 6×8 @64 · DOWN/LEFT/RIGHT/UP |
| `units/heroes/celine_prism-portrait-source.png` | `units/heroes/celine_prism-portrait.png` | 128×128 | Karen · chân dung 128×128 |
| `units/heroes/bastian_aegis-battle-source.png` | `units/heroes/bastian_aegis-battle.png` | 1152×1152 | Park · heroes · battle 6×6 @192 · view BACK |
| `units/heroes/bastian_aegis-movement-source.png` | `units/heroes/bastian_aegis-movement.png` | 384×512 | Park · heroes · movement 6×8 @64 · DOWN/LEFT/RIGHT/UP |
| `units/heroes/bastian_aegis-portrait-source.png` | `units/heroes/bastian_aegis-portrait.png` | 128×128 | Park · chân dung 128×128 |
| `units/heroes/lyra_frostbow-battle-source.png` | `units/heroes/lyra_frostbow-battle.png` | 1152×1152 | Se Ok · heroes · battle 6×6 @192 · view BACK |
| `units/heroes/lyra_frostbow-movement-source.png` | `units/heroes/lyra_frostbow-movement.png` | 384×512 | Se Ok · heroes · movement 6×8 @64 · DOWN/LEFT/RIGHT/UP |
| `units/heroes/lyra_frostbow-portrait-source.png` | `units/heroes/lyra_frostbow-portrait.png` | 128×128 | Se Ok · chân dung 128×128 |
| `units/heroes/kestrel_dune-battle-source.png` | `units/heroes/kestrel_dune-battle.png` | 1152×1152 | Kai · heroes · battle 6×6 @192 · view BACK |
| `units/heroes/kestrel_dune-movement-source.png` | `units/heroes/kestrel_dune-movement.png` | 384×512 | Kai · heroes · movement 6×8 @64 · DOWN/LEFT/RIGHT/UP |
| `units/heroes/kestrel_dune-portrait-source.png` | `units/heroes/kestrel_dune-portrait.png` | 128×128 | Kai · chân dung 128×128 |
| `units/heroes/nereus_tide-battle-source.png` | `units/heroes/nereus_tide-battle.png` | 1152×1152 | Nerio · heroes · battle 6×6 @192 · view BACK |
| `units/heroes/nereus_tide-movement-source.png` | `units/heroes/nereus_tide-movement.png` | 384×512 | Nerio · heroes · movement 6×8 @64 · DOWN/LEFT/RIGHT/UP |
| `units/heroes/nereus_tide-portrait-source.png` | `units/heroes/nereus_tide-portrait.png` | 128×128 | Nerio · chân dung 128×128 |
| `units/heroes/corvus_night-battle-source.png` | `units/heroes/corvus_night-battle.png` | 1152×1152 | Corvin · heroes · battle 6×6 @192 · view BACK |
| `units/heroes/corvus_night-movement-source.png` | `units/heroes/corvus_night-movement.png` | 384×512 | Corvin · heroes · movement 6×8 @64 · DOWN/LEFT/RIGHT/UP |
| `units/heroes/corvus_night-portrait-source.png` | `units/heroes/corvus_night-portrait.png` | 128×128 | Corvin · chân dung 128×128 |
| `units/heroes/ignis_valkyrie-battle-source.png` | `units/heroes/ignis_valkyrie-battle.png` | 1152×1152 | Rhea · heroes · battle 6×6 @192 · view BACK |
| `units/heroes/ignis_valkyrie-movement-source.png` | `units/heroes/ignis_valkyrie-movement.png` | 384×512 | Rhea · heroes · movement 6×8 @64 · DOWN/LEFT/RIGHT/UP |
| `units/heroes/ignis_valkyrie-portrait-source.png` | `units/heroes/ignis_valkyrie-portrait.png` | 128×128 | Rhea · chân dung 128×128 |
| `units/heroes/marina_abyss-battle-source.png` | `units/heroes/marina_abyss-battle.png` | 1152×1152 | Mara · heroes · battle 6×6 @192 · view BACK |
| `units/heroes/marina_abyss-movement-source.png` | `units/heroes/marina_abyss-movement.png` | 384×512 | Mara · heroes · movement 6×8 @64 · DOWN/LEFT/RIGHT/UP |
| `units/heroes/marina_abyss-portrait-source.png` | `units/heroes/marina_abyss-portrait.png` | 128×128 | Mara · chân dung 128×128 |
| `units/heroes/aurelia_eclipse-battle-source.png` | `units/heroes/aurelia_eclipse-battle.png` | 1152×1152 | Aurelia · heroes · battle 6×6 @192 · view BACK |
| `units/heroes/aurelia_eclipse-movement-source.png` | `units/heroes/aurelia_eclipse-movement.png` | 384×512 | Aurelia · heroes · movement 6×8 @64 · DOWN/LEFT/RIGHT/UP |
| `units/heroes/aurelia_eclipse-portrait-source.png` | `units/heroes/aurelia_eclipse-portrait.png` | 128×128 | Aurelia · chân dung 128×128 |
| `units/heroes/seraph_glacier-battle-source.png` | `units/heroes/seraph_glacier-battle.png` | 1152×1152 | Soren · heroes · battle 6×6 @192 · view BACK |
| `units/heroes/seraph_glacier-movement-source.png` | `units/heroes/seraph_glacier-movement.png` | 384×512 | Soren · heroes · movement 6×8 @64 · DOWN/LEFT/RIGHT/UP |
| `units/heroes/seraph_glacier-portrait-source.png` | `units/heroes/seraph_glacier-portrait.png` | 128×128 | Soren · chân dung 128×128 |
| `units/heroes/lumina_chrono-battle-source.png` | `units/heroes/lumina_chrono-battle.png` | 1152×1152 | Luma · heroes · battle 6×6 @192 · view BACK |
| `units/heroes/lumina_chrono-movement-source.png` | `units/heroes/lumina_chrono-movement.png` | 384×512 | Luma · heroes · movement 6×8 @64 · DOWN/LEFT/RIGHT/UP |
| `units/heroes/lumina_chrono-portrait-source.png` | `units/heroes/lumina_chrono-portrait.png` | 128×128 | Luma · chân dung 128×128 |
| `units/heroes/jung_afterglow-battle-source.png` | `units/heroes/jung_afterglow-battle.png` | 1152×1152 | Jung · heroes · battle 6×6 @192 · view BACK |
| `units/heroes/jung_afterglow-movement-source.png` | `units/heroes/jung_afterglow-movement.png` | 384×512 | Jung · heroes · movement 6×8 @64 · DOWN/LEFT/RIGHT/UP |
| `units/heroes/jung_afterglow-portrait-source.png` | `units/heroes/jung_afterglow-portrait.png` | 128×128 | Jung · chân dung 128×128 |
| `units/gatekeepers/meadow_stag-battle-source.png` | `units/gatekeepers/meadow_stag-battle.png` | 1152×768 | Lộc Giác Cổ Thụ · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/meadow_stag-movement-source.png` | `units/gatekeepers/meadow_stag-movement.png` | 384×256 | Lộc Giác Cổ Thụ · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/moss_sentinel-battle-source.png` | `units/gatekeepers/moss_sentinel-battle.png` | 1152×768 | Hộ Binh Rêu Đá · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/moss_sentinel-movement-source.png` | `units/gatekeepers/moss_sentinel-movement.png` | 384×256 | Hộ Binh Rêu Đá · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/gale_wolf-battle-source.png` | `units/gatekeepers/gale_wolf-battle.png` | 1152×768 | Tinh Anh Phong Lang · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/gale_wolf-movement-source.png` | `units/gatekeepers/gale_wolf-movement.png` | 384×256 | Tinh Anh Phong Lang · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/gale_wolf-leap-source.png` | `units/gatekeepers/gale_wolf-leap.png` | 1152×192 | Tinh Anh Phong Lang · sheet phụ vẽ tay |
| `units/gatekeepers/frost_golem-battle-source.png` | `units/gatekeepers/frost_golem-battle.png` | 1152×768 | Cự Nhân Băng Tinh · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/frost_golem-movement-source.png` | `units/gatekeepers/frost_golem-movement.png` | 384×256 | Cự Nhân Băng Tinh · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/snow_prowler-battle-source.png` | `units/gatekeepers/snow_prowler-battle.png` | 1152×768 | Báo Tuyết Hàn Phong · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/snow_prowler-movement-source.png` | `units/gatekeepers/snow_prowler-movement.png` | 384×256 | Báo Tuyết Hàn Phong · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/glacier_lancer-battle-source.png` | `units/gatekeepers/glacier_lancer-battle.png` | 1152×768 | Giáo Sĩ Đền Băng · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/glacier_lancer-movement-source.png` | `units/gatekeepers/glacier_lancer-movement.png` | 384×256 | Giáo Sĩ Đền Băng · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/dune_scorpio-battle-source.png` | `units/gatekeepers/dune_scorpio-battle.png` | 1152×768 | Bọ Cạp Vàng Cổ Đại · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/dune_scorpio-movement-source.png` | `units/gatekeepers/dune_scorpio-movement.png` | 384×256 | Bọ Cạp Vàng Cổ Đại · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/sun_ushabti-battle-source.png` | `units/gatekeepers/sun_ushabti-battle.png` | 1152×768 | Tượng Thần Cát Nung · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/sun_ushabti-movement-source.png` | `units/gatekeepers/sun_ushabti-movement.png` | 384×256 | Tượng Thần Cát Nung · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/mirage_raider-battle-source.png` | `units/gatekeepers/mirage_raider-battle.png` | 1152×768 | Kỵ Binh Ảo Ảnh · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/mirage_raider-movement-source.png` | `units/gatekeepers/mirage_raider-movement.png` | 384×256 | Kỵ Binh Ảo Ảnh · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/abyss_serpent-battle-source.png` | `units/gatekeepers/abyss_serpent-battle.png` | 1152×768 | Hải Xà Lân Tinh · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/abyss_serpent-movement-source.png` | `units/gatekeepers/abyss_serpent-movement.png` | 384×256 | Hải Xà Lân Tinh · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/coral_warden-battle-source.png` | `units/gatekeepers/coral_warden-battle.png` | 1152×768 | Giáp Sĩ Vỏ Trai Cổ · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/coral_warden-movement-source.png` | `units/gatekeepers/coral_warden-movement.png` | 384×256 | Giáp Sĩ Vỏ Trai Cổ · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/kraken_spawn-battle-source.png` | `units/gatekeepers/kraken_spawn-battle.png` | 1152×768 | Thủy Quái Xoáy Ngầm · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/kraken_spawn-movement-source.png` | `units/gatekeepers/kraken_spawn-movement.png` | 384×256 | Thủy Quái Xoáy Ngầm · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/magma_automaton-battle-source.png` | `units/gatekeepers/magma_automaton-battle.png` | 1152×768 | Chiến Khôi Nham Thạch · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/magma_automaton-movement-source.png` | `units/gatekeepers/magma_automaton-movement.png` | 384×256 | Chiến Khôi Nham Thạch · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/cinder_drake-battle-source.png` | `units/gatekeepers/cinder_drake-battle.png` | 1152×768 | Hỏa Long Cảnh Vệ · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/cinder_drake-movement-source.png` | `units/gatekeepers/cinder_drake-movement.png` | 384×256 | Hỏa Long Cảnh Vệ · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/forge_executioner-battle-source.png` | `units/gatekeepers/forge_executioner-battle.png` | 1152×768 | Đao Phủ Lò Rèn · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/forge_executioner-movement-source.png` | `units/gatekeepers/forge_executioner-movement.png` | 384×256 | Đao Phủ Lò Rèn · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/night_stalker-battle-source.png` | `units/gatekeepers/night_stalker-battle.png` | 1152×768 | Kỵ Sĩ Đêm Tím · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/night_stalker-movement-source.png` | `units/gatekeepers/night_stalker-movement.png` | 384×256 | Kỵ Sĩ Đêm Tím · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/luna_kitsune-battle-source.png` | `units/gatekeepers/luna_kitsune-battle.png` | 1152×768 | Hồ Ly Dạ Quang · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/luna_kitsune-movement-source.png` | `units/gatekeepers/luna_kitsune-movement.png` | 384×256 | Hồ Ly Dạ Quang · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/eclipse_judge-battle-source.png` | `units/gatekeepers/eclipse_judge-battle.png` | 1152×768 | Phán Quan Bóng Nguyệt · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/eclipse_judge-movement-source.png` | `units/gatekeepers/eclipse_judge-movement.png` | 384×256 | Phán Quan Bóng Nguyệt · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/aurora_archon_left-battle-source.png` | `units/gatekeepers/aurora_archon_left-battle.png` | 1152×768 | Thiên Sứ Tinh Vân Tả Vệ · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/aurora_archon_left-movement-source.png` | `units/gatekeepers/aurora_archon_left-movement.png` | 384×256 | Thiên Sứ Tinh Vân Tả Vệ · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/gatekeepers/aurora_archon_right-battle-source.png` | `units/gatekeepers/aurora_archon_right-battle.png` | 1152×768 | Thiên Sứ Quang Phổ Hữu Vệ · gatekeepers · battle 6×4 @192 · view FRONT |
| `units/gatekeepers/aurora_archon_right-movement-source.png` | `units/gatekeepers/aurora_archon_right-movement.png` | 384×256 | Thiên Sứ Quang Phổ Hữu Vệ · gatekeepers · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/bosses/sylvan_warden-battle-source.png` | `units/bosses/sylvan_warden-battle.png` | 1536×1536 | Hộ Vệ Cổ Mộc Ngàn Năm · bosses · battle 6×6 @256 · view FRONT |
| `units/bosses/boreal_chevalier-battle-source.png` | `units/bosses/boreal_chevalier-battle.png` | 1536×1536 | Kỵ Sĩ Băng Giá Vĩnh Cửu · bosses · battle 6×6 @256 · view FRONT |
| `units/bosses/chronos_khepri-battle-source.png` | `units/bosses/chronos_khepri-battle.png` | 1536×1536 | Pharaoh Đồng Hồ Cát Vàng · bosses · battle 6×6 @256 · view FRONT |
| `units/bosses/leviathan_sovereign-battle-source.png` | `units/bosses/leviathan_sovereign-battle.png` | 1536×1536 | Chúa Tể Thủy Cung Thẳm Sâu · bosses · battle 6×6 @256 · view FRONT |
| `units/bosses/vulcan_titan-battle-source.png` | `units/bosses/vulcan_titan-battle.png` | 1536×1536 | Đại Tướng Lò Rèn Dung Nham · bosses · battle 6×6 @256 · view FRONT |
| `units/bosses/nocturne_weaver-battle-source.png` | `units/bosses/nocturne_weaver-battle.png` | 1536×1536 | Nữ Hoàng Nguyệt Ảnh Đêm Thâu · bosses · battle 6×6 @256 · view FRONT |
| `units/bosses/astral_painter_seraphina-battle-source.png` | `units/bosses/astral_painter_seraphina-battle.png` | 1536×1536 | TRÙM CUỐI — Vĩnh Dạ Quang Phổ Vương · bosses · battle 6×6 @256 · view FRONT |
| `units/bosses/astral_painter_seraphina-starblade-source.png` | `units/bosses/astral_painter_seraphina-starblade.png` | 1536×256 | TRÙM CUỐI — Vĩnh Dạ Quang Phổ Vương · sheet phụ vẽ tay |
| `units/monsters/verdant_slime-battle-source.png` | `units/monsters/verdant_slime-battle.png` | 1152×768 | Chất Nhờn Mầm Xanh · monsters · battle 6×4 @192 · view FRONT |
| `units/monsters/verdant_slime-movement-source.png` | `units/monsters/verdant_slime-movement.png` | 384×256 | Chất Nhờn Mầm Xanh · monsters · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/monsters/briar_goblin-battle-source.png` | `units/monsters/briar_goblin-battle.png` | 1152×768 | Yêu Tinh Gai Bụi · monsters · battle 6×4 @192 · view FRONT |
| `units/monsters/briar_goblin-movement-source.png` | `units/monsters/briar_goblin-movement.png` | 384×256 | Yêu Tinh Gai Bụi · monsters · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/monsters/highway_bandit-battle-source.png` | `units/monsters/highway_bandit-battle.png` | 1152×768 | Đạo Tặc Đường Rừng · monsters · battle 6×4 @192 · view FRONT |
| `units/monsters/highway_bandit-movement-source.png` | `units/monsters/highway_bandit-movement.png` | 384×256 | Đạo Tặc Đường Rừng · monsters · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/monsters/frost_wisp-battle-source.png` | `units/monsters/frost_wisp-battle.png` | 1152×768 | Linh Hồn Sương Giá · monsters · battle 6×4 @192 · view FRONT |
| `units/monsters/frost_wisp-movement-source.png` | `units/monsters/frost_wisp-movement.png` | 384×256 | Linh Hồn Sương Giá · monsters · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/monsters/yeti_brute-battle-source.png` | `units/monsters/yeti_brute-battle.png` | 1152×768 | Người Tuyết Cuồng Nộ · monsters · battle 6×4 @192 · view FRONT |
| `units/monsters/yeti_brute-movement-source.png` | `units/monsters/yeti_brute-movement.png` | 384×256 | Người Tuyết Cuồng Nộ · monsters · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/monsters/sand_wyrm-battle-source.png` | `units/monsters/sand_wyrm-battle.png` | 1152×768 | Sa Trùng Nuốt Cát · monsters · battle 6×4 @192 · view FRONT |
| `units/monsters/sand_wyrm-movement-source.png` | `units/monsters/sand_wyrm-movement.png` | 384×256 | Sa Trùng Nuốt Cát · monsters · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/monsters/tomb_mummy-battle-source.png` | `units/monsters/tomb_mummy-battle.png` | 1152×768 | Xác Ướp Lăng Mộ · monsters · battle 6×4 @192 · view FRONT |
| `units/monsters/tomb_mummy-movement-source.png` | `units/monsters/tomb_mummy-movement.png` | 384×256 | Xác Ướp Lăng Mộ · monsters · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/monsters/drowned_corsair-battle-source.png` | `units/monsters/drowned_corsair-battle.png` | 1152×768 | Hải Tặc Chết Đuối · monsters · battle 6×4 @192 · view FRONT |
| `units/monsters/drowned_corsair-movement-source.png` | `units/monsters/drowned_corsair-movement.png` | 384×256 | Hải Tặc Chết Đuối · monsters · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/monsters/lantern_jelly-battle-source.png` | `units/monsters/lantern_jelly-battle.png` | 1152×768 | Sứa Đèn Lồng · monsters · battle 6×4 @192 · view FRONT |
| `units/monsters/lantern_jelly-movement-source.png` | `units/monsters/lantern_jelly-movement.png` | 384×256 | Sứa Đèn Lồng · monsters · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/monsters/ember_imp-battle-source.png` | `units/monsters/ember_imp-battle.png` | 1152×768 | Tiểu Quỷ Than Hồng · monsters · battle 6×4 @192 · view FRONT |
| `units/monsters/ember_imp-movement-source.png` | `units/monsters/ember_imp-movement.png` | 384×256 | Tiểu Quỷ Than Hồng · monsters · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/monsters/lava_salamander-battle-source.png` | `units/monsters/lava_salamander-battle.png` | 1152×768 | Kỳ Nhông Dung Nham · monsters · battle 6×4 @192 · view FRONT |
| `units/monsters/lava_salamander-movement-source.png` | `units/monsters/lava_salamander-movement.png` | 384×256 | Kỳ Nhông Dung Nham · monsters · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/monsters/dusk_bat-battle-source.png` | `units/monsters/dusk_bat-battle.png` | 1152×768 | Dơi Hoàng Hôn · monsters · battle 6×4 @192 · view FRONT |
| `units/monsters/dusk_bat-movement-source.png` | `units/monsters/dusk_bat-movement.png` | 384×256 | Dơi Hoàng Hôn · monsters · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/monsters/hollow_wraith-battle-source.png` | `units/monsters/hollow_wraith-battle.png` | 1152×768 | U Hồn Rỗng · monsters · battle 6×4 @192 · view FRONT |
| `units/monsters/hollow_wraith-movement-source.png` | `units/monsters/hollow_wraith-movement.png` | 384×256 | U Hồn Rỗng · monsters · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/monsters/cult_acolyte-battle-source.png` | `units/monsters/cult_acolyte-battle.png` | 1152×768 | Tín Đồ Nguyệt Thực · monsters · battle 6×4 @192 · view FRONT |
| `units/monsters/cult_acolyte-movement-source.png` | `units/monsters/cult_acolyte-movement.png` | 384×256 | Tín Đồ Nguyệt Thực · monsters · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/monsters/venom_spider-battle-source.png` | `units/monsters/venom_spider-battle.png` | 1152×768 | Nhện Độc Rừng Thẳm · monsters · battle 6×4 @192 · view FRONT |
| `units/monsters/venom_spider-movement-source.png` | `units/monsters/venom_spider-movement.png` | 384×256 | Nhện Độc Rừng Thẳm · monsters · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/monsters/prism_moth-battle-source.png` | `units/monsters/prism_moth-battle.png` | 1152×768 | Bướm Lăng Kính · monsters · battle 6×4 @192 · view FRONT |
| `units/monsters/prism_moth-movement-source.png` | `units/monsters/prism_moth-movement.png` | 384×256 | Bướm Lăng Kính · monsters · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/monsters/star_sentinel-battle-source.png` | `units/monsters/star_sentinel-battle.png` | 1152×768 | Tinh Thạch Hộ Vệ · monsters · battle 6×4 @192 · view FRONT |
| `units/monsters/star_sentinel-movement-source.png` | `units/monsters/star_sentinel-movement.png` | 384×256 | Tinh Thạch Hộ Vệ · monsters · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/animals/chicken-battle-source.png` | `units/animals/chicken-battle.png` | 1152×768 | Gà Đồng · animals · battle 6×4 @192 · view FRONT |
| `units/animals/chicken-movement-source.png` | `units/animals/chicken-movement.png` | 384×256 | Gà Đồng · animals · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/animals/sheep-battle-source.png` | `units/animals/sheep-battle.png` | 1152×768 | Cừu Bông · animals · battle 6×4 @192 · view FRONT |
| `units/animals/sheep-movement-source.png` | `units/animals/sheep-movement.png` | 384×256 | Cừu Bông · animals · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/animals/cow-battle-source.png` | `units/animals/cow-battle.png` | 1152×768 | Bò Sữa · animals · battle 6×4 @192 · view FRONT |
| `units/animals/cow-movement-source.png` | `units/animals/cow-movement.png` | 384×256 | Bò Sữa · animals · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/animals/horse-battle-source.png` | `units/animals/horse-battle.png` | 1152×768 | Ngựa Thảo Nguyên · animals · battle 6×4 @192 · view FRONT |
| `units/animals/horse-movement-source.png` | `units/animals/horse-movement.png` | 384×256 | Ngựa Thảo Nguyên · animals · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/animals/rabbit-battle-source.png` | `units/animals/rabbit-battle.png` | 1152×768 | Thỏ Rừng · animals · battle 6×4 @192 · view FRONT |
| `units/animals/rabbit-movement-source.png` | `units/animals/rabbit-movement.png` | 384×256 | Thỏ Rừng · animals · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/animals/red_fox-battle-source.png` | `units/animals/red_fox-battle.png` | 1152×768 | Cáo Đỏ · animals · battle 6×4 @192 · view FRONT |
| `units/animals/red_fox-movement-source.png` | `units/animals/red_fox-movement.png` | 384×256 | Cáo Đỏ · animals · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/animals/wild_boar-battle-source.png` | `units/animals/wild_boar-battle.png` | 1152×768 | Heo Rừng · animals · battle 6×4 @192 · view FRONT |
| `units/animals/wild_boar-movement-source.png` | `units/animals/wild_boar-movement.png` | 384×256 | Heo Rừng · animals · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/animals/mountain_goat-battle-source.png` | `units/animals/mountain_goat-battle.png` | 1152×768 | Dê Núi · animals · battle 6×4 @192 · view FRONT |
| `units/animals/mountain_goat-movement-source.png` | `units/animals/mountain_goat-movement.png` | 384×256 | Dê Núi · animals · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/animals/desert_camel-battle-source.png` | `units/animals/desert_camel-battle.png` | 1152×768 | Lạc Đà Sa Mạc · animals · battle 6×4 @192 · view FRONT |
| `units/animals/desert_camel-movement-source.png` | `units/animals/desert_camel-movement.png` | 384×256 | Lạc Đà Sa Mạc · animals · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/animals/reef_crab-battle-source.png` | `units/animals/reef_crab-battle.png` | 1152×768 | Cua Rạn San Hô · animals · battle 6×4 @192 · view FRONT |
| `units/animals/reef_crab-movement-source.png` | `units/animals/reef_crab-movement.png` | 384×256 | Cua Rạn San Hô · animals · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/animals/sea_turtle-battle-source.png` | `units/animals/sea_turtle-battle.png` | 1152×768 | Rùa Biển Cổ · animals · battle 6×4 @192 · view FRONT |
| `units/animals/sea_turtle-movement-source.png` | `units/animals/sea_turtle-movement.png` | 384×256 | Rùa Biển Cổ · animals · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
| `units/animals/snow_owl-battle-source.png` | `units/animals/snow_owl-battle.png` | 1152×768 | Cú Tuyết · animals · battle 6×4 @192 · view FRONT |
| `units/animals/snow_owl-movement-source.png` | `units/animals/snow_owl-movement.png` | 384×256 | Cú Tuyết · animals · movement 6×4 @64 · DOWN/LEFT/RIGHT/UP |
