---
name: expedition-battle-scene
description: >-
  Xây dựng Cảnh Chiến Đấu (BattleScene) 2D pixel phân lớp 16:9 wide (390x180 xuất x2 = 780x360) kèm dải môi trường động 8 frame cho cả 7 vùng bản đồ (Đồng Cỏ, Tuyết, Sa Mạc, Dưới Nước, Núi Lửa, Ban Đêm, Quang Phổ Mây Trời Ban Đêm) và 7 đấu trường Đại Trùm. Kích hoạt khi yêu cầu dựng nền trận đấu, cảnh đánh trùm hoặc hiệu ứng môi trường chiến trường.
---

# Expedition Living Battle Scenes (`390×180` Wide + `8-Frame` Ambient Layer)

Từ điển: [GLOSSARY.md](../../../GLOSSARY.md) (`BattleScene`, `RealmMap`, `Boss`). Kiến trúc gốc: [0001-gen3-battle-screen.md](../../../docs/adr/0001-gen3-battle-screen.md).

## Đầu Ra (`database-astral-expedition/battle-scenes/<scene_id>/`)

- `backdrop.png`, `ground.png`, `platforms.png`, `props.png`: Các lớp cảnh nền tách rời ở độ phân giải gốc `390×180` xuất `×2` (`780×360 px`), vùng trung tâm `320×180` an toàn cho PC.
- `ambient-anim.png` (**8 frame ngang**): Lớp chuyển động sống động theo từng vùng đất:
  1. `01-dawn-meadow`: Cỏ hoa lay gió, suối lấp lánh, cánh hoa bay.
  2. `02-everfrost-peaks`: Tuyết rơi chéo, tinh thể băng lóe sáng, sương lạnh.
  3. `03-sunken-dunes`: Hạt cát vàng lướt gió, sóng nhiệt ốc đảo.
  4. `04-abyssal-sanctum`: Luồng bong bóng nổi, tảo phát quang, vân sáng mặt nước.
  5. `05-cinder-caldera`: Dòng dung nham chảy rực, tàn lửa bay lên.
  6. `06-nocturne-veil`: Đom đóm tím lượn, sương đêm và hoa dạ quang.
  7. `07-aurora-zenith`: Biển mây sao đêm và **dải Cực Quang 7 màu uốn lượn liên tục** dưới chân Trùm Cuối.

## Quy Tắc Kiểm Chuẩn

- Hai bệ đứng đối kháng chéo: phe người chơi ở dưới-trái, phe Quái Gác Cổng / Trùm ở trên-phải; không đặt chi tiết chói mắt làm chìm `VerticalSkillMenu` hoặc tín hiệu báo đòn của Trùm.
- Mọi tệp PNG phải vượt qua `tools/gen3/check_gen3.py --grid 2`.

Bundle hiện tại đọc nền đã ghép ở `backdrop.png` và hoạt ảnh môi trường ở `ambient-anim.png`. Với atlas góc nhìn trên cao, dùng `tools/expedition/export_battle_scenes.py` để xuất lại hai lớp game đọc.

Camera 3D đọc `arena/ground.png` 256×256 px, `floor.png` 512×512 px, `panorama.png` 2048×512 px và `props.png` 1024×768 px. Dùng `tools/expedition/export_3d_arenas.py` để đồng bộ ảnh và khung cắt `props.json`.
