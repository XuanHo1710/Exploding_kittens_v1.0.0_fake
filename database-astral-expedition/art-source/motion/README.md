# Nguồn hình chuyển động · Astral Expedition Pixel

Ảnh `*-source.png` là bản vẽ từ ImageGen tích hợp. Các PNG còn lại là atlas nền trong suốt đã chuẩn hóa. GIF giúp duyệt chuyển động từng nhân vật. [Mở trang duyệt](../../../specs/006-astral-expedition-pixel/design/motion-review.html)

| Nhân vật | Hướng dẫn vẽ | Bản game sử dụng |
|---|---|---|
| Lâm Phong | Người trưởng thành, áo du hành xanh, tay phải giữ kiếm. Idle và walk mỗi vòng sáu hình ở bốn hướng. Bản chiến đấu chéo lưng gồm sáu hàng, còn lỗi tay ở hàng dùng kỹ năng. | `units/heroes/gustave_blade-movement.png` |
| Phong Lang | Sói xám bốn chân, bờm xanh rêu, xoay chéo xuống trái. Bốn hàng gồm thở, vồ, loạng choạng và gục. Bản cú nhảy sáu hình dùng để soi điểm đặt chân. | `units/gatekeepers/gale_wolf-battle.png` |
| Seraphina | Boss người khổng lồ nhìn chéo xuống trái, giáp tím, cánh lăng kính, hai tay giữ một cán. Sáu hàng từ đứng thở đến gục. Bản kiếm kết tinh có sáu hình riêng để duyệt chuyển vai, hông và chân trụ. | `units/bosses/astral_painter_seraphina-battle.png` |

`tools/expedition/build_units.py` chép các atlas này vào `units/` theo trường `art` trong `tools/expedition/roster.py`: `gustave-battle.png` → `units/heroes/gustave_blade-battle.png`, `gustave-movement.png` → `units/heroes/gustave_blade-movement.png`, `gale-wolf-battle.png` → `units/gatekeepers/gale_wolf-battle.png`, `gale-wolf-leap.png` → `units/gatekeepers/gale_wolf-leap.png`, `seraphina-battle.png` → `units/bosses/astral_painter_seraphina-battle.png`, `seraphina-starblade.png` → `units/bosses/astral_painter_seraphina-starblade.png`. Các unit còn lại được dựng từ rig 3D. [Trang duyệt toàn bộ units](../../../specs/006-astral-expedition-pixel/design/units-review.html).
