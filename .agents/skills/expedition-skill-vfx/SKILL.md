---
name: expedition-skill-vfx
description: >-
  Tạo và chuẩn hóa hiệu ứng kỹ năng chiến đấu (Skill VFX) cho 60 kỹ năng Anh Hùng trên Menu Dọc và bộ chiêu thức của 7 Đại Trùm trong Astral Expedition Pixel: mỗi chiêu gồm 8 frame CAST (tụ lực khớp TimedHit) + 8 frame EFFECT (đường bay & va chạm) cùng hệ thống tia năng lượng code beams. Kích hoạt khi cần làm hiệu ứng đòn đánh, phép thuật, chiêu cuối hoặc hiệu ứng Phá Thế.
---

# Expedition Skill VFX Pipeline (`8-Frame CAST` + `8-Frame EFFECT` + Code Beams)

Mẫu câu lệnh sinh ảnh: [prompts/skills/README.md](../../../prompts/skills/README.md). Thuật ngữ: [GLOSSARY.md](../../../GLOSSARY.md) (`VerticalSkillMenu`, `TimedHit`, `BreakGauge`).

## Cấu Trúc Đầu Ra (`database-astral-expedition/vfx/skills/`)

1. `<skill_id>-cast.png` (**8 frame**): Tụ khí, vòng ấn nguyên tố quanh người thi triển trong lúc hiện vòng `TimedHit`.
2. `<skill_id>-effect.png` (**8 frame**): Frame `1–4` bay dọc quỹ đạo hướng sang mục tiêu, Frame `5–8` bùng nổ va chạm kèm rung chấn/chớp trắng.
3. `<skill_id>-vfx.json`: Hệ số co giãn theo chiều cao mục tiêu, điểm neo phát chiêu (`weapon`, `hand`, `body`, `ground`, `sky`) và cấu hình tia năng lượng liên tục (`beams.py`) nếu là chiêu dạng tia.

## Quy Tắc Bắt Buộc

- Tuyệt đối không cắt ngang tia lửa/kiếm khí ở rìa ô (`≥ 2 px` lề an toàn).
- **Không che báo đòn Trùm**: Hiệu ứng của người chơi tự kết thúc/hạ lớp hiển thị trước khi bước sang pha báo đòn (`ENEMY_TELEGRAPH`) của Quái Gác Cổng hoặc Đại Trùm.
- Kiểm tra hai chiều bằng [expedition-skill-review](../expedition-skill-review/SKILL.md).

Bundle hiện hành dùng các cặp theo nguyên tố và kiểu đòn với tám ô 96×96 px ngang. Giữ đường dẫn theo kiểu đòn đang dùng và kiểm tra lề khi xuất bằng `tools/expedition/export_visual_kit.py`.
