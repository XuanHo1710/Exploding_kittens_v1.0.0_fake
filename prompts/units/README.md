# Prompt vẽ tay cho units · Astral Expedition Pixel

Chuẩn phong cách: ba bản vẽ ImageGen trong `database-astral-expedition/art-source/motion/` (Lâm Phong, Phong Lang, Seraphina). Mỗi unit có một file prompt riêng ghi ảnh cần đính kèm, prompt battle và movement, đường dẫn lưu bản vẽ trong `art-source/units/` và lệnh xuất 1-1. Thiết kế là nhân vật nguyên bản; prompt cấm sao chép nhân vật, trang phục hay logo của game có sẵn.

Sinh lại toàn bộ: `py tools/expedition/write_unit_prompts.py`.

| Unit | ID | Nhóm | Nguyên tố | Trạng thái |
|---|---|---|---|---|
| [Lâm Phong](heroes/gustave_blade.md) | `gustave_blade` | heroes | Verdant | vẽ tay (art-source/motion) |
| [Minh Châu](heroes/celine_prism.md) | `celine_prism` | heroes | Solar | chờ vẽ tay · đang dùng bản dựng rig |
| [Thạch Sơn](heroes/bastian_aegis.md) | `bastian_aegis` | heroes | Pyre | chờ vẽ tay · đang dùng bản dựng rig |
| [Băng Tâm](heroes/lyra_frostbow.md) | `lyra_frostbow` | heroes | Frost | chờ vẽ tay · đang dùng bản dựng rig |
| [Sa Vũ](heroes/kestrel_dune.md) | `kestrel_dune` | heroes | Solar | chờ vẽ tay · đang dùng bản dựng rig |
| [Hải Đăng](heroes/nereus_tide.md) | `nereus_tide` | heroes | Tide | chờ vẽ tay · đang dùng bản dựng rig |
| [Dạ Vũ](heroes/corvus_night.md) | `corvus_night` | heroes | Astral | chờ vẽ tay · đang dùng bản dựng rig |
| [Hồng Liên](heroes/ignis_valkyrie.md) | `ignis_valkyrie` | heroes | Pyre | chờ vẽ tay · đang dùng bản dựng rig |
| [Lam Ngọc](heroes/marina_abyss.md) | `marina_abyss` | heroes | Tide | chờ vẽ tay · đang dùng bản dựng rig |
| [Nhật Hạ](heroes/aurelia_eclipse.md) | `aurelia_eclipse` | heroes | Solar | chờ vẽ tay · đang dùng bản dựng rig |
| [Hàn Thiên](heroes/seraph_glacier.md) | `seraph_glacier` | heroes | Frost | chờ vẽ tay · đang dùng bản dựng rig |
| [Tinh Hà](heroes/lumina_chrono.md) | `lumina_chrono` | heroes | Astral | chờ vẽ tay · đang dùng bản dựng rig |
| [Lộc Giác Cổ Thụ](gatekeepers/meadow_stag.md) | `meadow_stag` | gatekeepers | Verdant | chờ vẽ tay · đang dùng bản dựng rig |
| [Hộ Binh Rêu Đá](gatekeepers/moss_sentinel.md) | `moss_sentinel` | gatekeepers | Verdant | chờ vẽ tay · đang dùng bản dựng rig |
| [Tinh Anh Phong Lang](gatekeepers/gale_wolf.md) | `gale_wolf` | gatekeepers | Verdant | vẽ tay (art-source/motion) |
| [Cự Nhân Băng Tinh](gatekeepers/frost_golem.md) | `frost_golem` | gatekeepers | Frost | chờ vẽ tay · đang dùng bản dựng rig |
| [Báo Tuyết Hàn Phong](gatekeepers/snow_prowler.md) | `snow_prowler` | gatekeepers | Frost | chờ vẽ tay · đang dùng bản dựng rig |
| [Giáo Sĩ Đền Băng](gatekeepers/glacier_lancer.md) | `glacier_lancer` | gatekeepers | Frost | chờ vẽ tay · đang dùng bản dựng rig |
| [Bọ Cạp Vàng Cổ Đại](gatekeepers/dune_scorpio.md) | `dune_scorpio` | gatekeepers | Solar | chờ vẽ tay · đang dùng bản dựng rig |
| [Tượng Thần Cát Nung](gatekeepers/sun_ushabti.md) | `sun_ushabti` | gatekeepers | Solar | chờ vẽ tay · đang dùng bản dựng rig |
| [Kỵ Binh Ảo Ảnh](gatekeepers/mirage_raider.md) | `mirage_raider` | gatekeepers | Solar | chờ vẽ tay · đang dùng bản dựng rig |
| [Hải Xà Lân Tinh](gatekeepers/abyss_serpent.md) | `abyss_serpent` | gatekeepers | Tide | chờ vẽ tay · đang dùng bản dựng rig |
| [Giáp Sĩ Vỏ Trai Cổ](gatekeepers/coral_warden.md) | `coral_warden` | gatekeepers | Tide | chờ vẽ tay · đang dùng bản dựng rig |
| [Thủy Quái Xoáy Ngầm](gatekeepers/kraken_spawn.md) | `kraken_spawn` | gatekeepers | Tide | chờ vẽ tay · đang dùng bản dựng rig |
| [Chiến Khôi Nham Thạch](gatekeepers/magma_automaton.md) | `magma_automaton` | gatekeepers | Pyre | chờ vẽ tay · đang dùng bản dựng rig |
| [Hỏa Long Cảnh Vệ](gatekeepers/cinder_drake.md) | `cinder_drake` | gatekeepers | Pyre | chờ vẽ tay · đang dùng bản dựng rig |
| [Đao Phủ Lò Rèn](gatekeepers/forge_executioner.md) | `forge_executioner` | gatekeepers | Pyre | chờ vẽ tay · đang dùng bản dựng rig |
| [Kỵ Sĩ Đêm Tím](gatekeepers/night_stalker.md) | `night_stalker` | gatekeepers | Astral | chờ vẽ tay · đang dùng bản dựng rig |
| [Hồ Ly Dạ Quang](gatekeepers/luna_kitsune.md) | `luna_kitsune` | gatekeepers | Astral | chờ vẽ tay · đang dùng bản dựng rig |
| [Phán Quan Bóng Nguyệt](gatekeepers/eclipse_judge.md) | `eclipse_judge` | gatekeepers | Astral | chờ vẽ tay · đang dùng bản dựng rig |
| [Thiên Sứ Tinh Vân Tả Vệ](gatekeepers/aurora_archon_left.md) | `aurora_archon_left` | gatekeepers | Astral | chờ vẽ tay · đang dùng bản dựng rig |
| [Thiên Sứ Quang Phổ Hữu Vệ](gatekeepers/aurora_archon_right.md) | `aurora_archon_right` | gatekeepers | Astral | chờ vẽ tay · đang dùng bản dựng rig |
| [Hộ Vệ Cổ Mộc Ngàn Năm](bosses/sylvan_warden.md) | `sylvan_warden` | bosses | Verdant | chờ vẽ tay · đang dùng bản dựng rig |
| [Kỵ Sĩ Băng Giá Vĩnh Cửu](bosses/boreal_chevalier.md) | `boreal_chevalier` | bosses | Frost | chờ vẽ tay · đang dùng bản dựng rig |
| [Pharaoh Đồng Hồ Cát Vàng](bosses/chronos_khepri.md) | `chronos_khepri` | bosses | Solar | chờ vẽ tay · đang dùng bản dựng rig |
| [Chúa Tể Thủy Cung Thẳm Sâu](bosses/leviathan_sovereign.md) | `leviathan_sovereign` | bosses | Tide | chờ vẽ tay · đang dùng bản dựng rig |
| [Đại Tướng Lò Rèn Dung Nham](bosses/vulcan_titan.md) | `vulcan_titan` | bosses | Pyre | chờ vẽ tay · đang dùng bản dựng rig |
| [Nữ Hoàng Nguyệt Ảnh Đêm Thâu](bosses/nocturne_weaver.md) | `nocturne_weaver` | bosses | Astral | chờ vẽ tay · đang dùng bản dựng rig |
| [TRÙM CUỐI — Vĩnh Dạ Quang Phổ Vương](bosses/astral_painter_seraphina.md) | `astral_painter_seraphina` | bosses | Astral | vẽ tay (art-source/motion) |
| [Chất Nhờn Mầm Xanh](monsters/verdant_slime.md) | `verdant_slime` | monsters | Verdant | chờ vẽ tay · đang dùng bản dựng rig |
| [Yêu Tinh Gai Bụi](monsters/briar_goblin.md) | `briar_goblin` | monsters | Verdant | chờ vẽ tay · đang dùng bản dựng rig |
| [Đạo Tặc Đường Rừng](monsters/highway_bandit.md) | `highway_bandit` | monsters | Verdant | chờ vẽ tay · đang dùng bản dựng rig |
| [Linh Hồn Sương Giá](monsters/frost_wisp.md) | `frost_wisp` | monsters | Frost | chờ vẽ tay · đang dùng bản dựng rig |
| [Người Tuyết Cuồng Nộ](monsters/yeti_brute.md) | `yeti_brute` | monsters | Frost | chờ vẽ tay · đang dùng bản dựng rig |
| [Sa Trùng Nuốt Cát](monsters/sand_wyrm.md) | `sand_wyrm` | monsters | Solar | chờ vẽ tay · đang dùng bản dựng rig |
| [Xác Ướp Lăng Mộ](monsters/tomb_mummy.md) | `tomb_mummy` | monsters | Solar | chờ vẽ tay · đang dùng bản dựng rig |
| [Hải Tặc Chết Đuối](monsters/drowned_corsair.md) | `drowned_corsair` | monsters | Tide | chờ vẽ tay · đang dùng bản dựng rig |
| [Sứa Đèn Lồng](monsters/lantern_jelly.md) | `lantern_jelly` | monsters | Tide | chờ vẽ tay · đang dùng bản dựng rig |
| [Tiểu Quỷ Than Hồng](monsters/ember_imp.md) | `ember_imp` | monsters | Pyre | chờ vẽ tay · đang dùng bản dựng rig |
| [Kỳ Nhông Dung Nham](monsters/lava_salamander.md) | `lava_salamander` | monsters | Pyre | chờ vẽ tay · đang dùng bản dựng rig |
| [Dơi Hoàng Hôn](monsters/dusk_bat.md) | `dusk_bat` | monsters | Astral | chờ vẽ tay · đang dùng bản dựng rig |
| [U Hồn Rỗng](monsters/hollow_wraith.md) | `hollow_wraith` | monsters | Astral | chờ vẽ tay · đang dùng bản dựng rig |
| [Tín Đồ Nguyệt Thực](monsters/cult_acolyte.md) | `cult_acolyte` | monsters | Astral | chờ vẽ tay · đang dùng bản dựng rig |
| [Nhện Độc Rừng Thẳm](monsters/venom_spider.md) | `venom_spider` | monsters | Astral | chờ vẽ tay · đang dùng bản dựng rig |
| [Bướm Lăng Kính](monsters/prism_moth.md) | `prism_moth` | monsters | Astral | chờ vẽ tay · đang dùng bản dựng rig |
| [Tinh Thạch Hộ Vệ](monsters/star_sentinel.md) | `star_sentinel` | monsters | Astral | chờ vẽ tay · đang dùng bản dựng rig |
| [Gà Đồng](animals/chicken.md) | `chicken` | animals | Verdant | chờ vẽ tay · đang dùng bản dựng rig |
| [Cừu Bông](animals/sheep.md) | `sheep` | animals | Verdant | chờ vẽ tay · đang dùng bản dựng rig |
| [Bò Sữa](animals/cow.md) | `cow` | animals | Verdant | chờ vẽ tay · đang dùng bản dựng rig |
| [Ngựa Thảo Nguyên](animals/horse.md) | `horse` | animals | Verdant | chờ vẽ tay · đang dùng bản dựng rig |
| [Thỏ Rừng](animals/rabbit.md) | `rabbit` | animals | Verdant | chờ vẽ tay · đang dùng bản dựng rig |
| [Cáo Đỏ](animals/red_fox.md) | `red_fox` | animals | Verdant | chờ vẽ tay · đang dùng bản dựng rig |
| [Heo Rừng](animals/wild_boar.md) | `wild_boar` | animals | Verdant | chờ vẽ tay · đang dùng bản dựng rig |
| [Dê Núi](animals/mountain_goat.md) | `mountain_goat` | animals | Frost | chờ vẽ tay · đang dùng bản dựng rig |
| [Lạc Đà Sa Mạc](animals/desert_camel.md) | `desert_camel` | animals | Solar | chờ vẽ tay · đang dùng bản dựng rig |
| [Cua Rạn San Hô](animals/reef_crab.md) | `reef_crab` | animals | Tide | chờ vẽ tay · đang dùng bản dựng rig |
| [Rùa Biển Cổ](animals/sea_turtle.md) | `sea_turtle` | animals | Tide | chờ vẽ tay · đang dùng bản dựng rig |
| [Cú Tuyết](animals/snow_owl.md) | `snow_owl` | animals | Frost | chờ vẽ tay · đang dùng bản dựng rig |
