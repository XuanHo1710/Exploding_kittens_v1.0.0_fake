---
name: expedition-skill-review
description: >-
  Kiểm định tự động và trực quan hiệu ứng kỹ năng (Skill VFX) ở cả hai chiều chiến đấu (Anh Hùng góc dưới-trái đánh lên và Quái/Trùm góc trên-phải đánh xuống): đo tỷ lệ kích thước, vị trí điểm neo, không cắt mép khung và đảm bảo 0% che khuất tín hiệu báo đòn của Trùm. Kích hoạt sau khi tạo/chỉnh sửa VFX bằng expedition-skill-vfx.
---

# Expedition Skill VFX Two-Way QA & Telegraph Safety Review

Sử dụng chung bộ dựng cảnh của [expedition-skill-vfx](../expedition-skill-vfx/SKILL.md).

## Các Ngưỡng Kiểm Tra Tự Động

| Hạng Mục | Tiêu Chí Đạt (`PASS`) |
|----------|------------------------|
| **Không cắt mép ô (`Clip Check`)** | Mọi frame trong `cast` và `effect` cách mép ô tối thiểu `2 px` (trừ tia nối liền hoặc mưa rơi từ đỉnh màn hình). |
| **Tỷ lệ `CAST`** | Cao `0.8–2.0×` chiều cao nhân vật thi triển, tâm lệch không quá `0.35×`. |
| **Tỷ lệ `EFFECT` / Va chạm** | Rộng `0.6–2.4×` mục tiêu, hiển thị rõ cả trên Quái Gác Cổng (`192 px`) lẫn Đại Trùm (`256 px`). |
| **An toàn Báo Đòn Trùm** | Không lưu lại mảng đục che quá `15%` khung thân Trùm khi chuyển sang trạng thái báo đòn `Dodge` / `ParryCounter`. |
