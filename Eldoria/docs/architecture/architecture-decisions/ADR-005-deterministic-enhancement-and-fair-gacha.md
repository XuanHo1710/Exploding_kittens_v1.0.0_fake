# ADR-005: Cường hóa Vũ khí Chắc chắn (+1..+10) & Gacha Nội tệ Minh bạch

- **Trạng thái**: Accepted (Mandated by Constitution Principle VI)
- **Ngày quyết định**: 2026-11-19
- **Liên kết**: [`docs/game-design/09-weapon-enhancement.md`](../../game-design/09-weapon-enhancement.md), [`docs/game-design/10-gacha-system.md`](../../game-design/10-gacha-system.md), [`docs/balancing/simulation-results.md`](../../balancing/simulation-results.md)

---

## 1. Bối cảnh (Context)

Hai hệ thống dễ gây phẫn nộ hoặc phá hủy cân bằng nhất trong game online RPG là cường hóa vũ khí (vỡ đồ/tụt cấp gây mất trắng nhiều tuần chơi) và Gacha (ép nạp tiền thật, xác suất ẩn, nhân vật hiếm đè bẹp hoàn toàn nhân vật thường). `GAME_DESIGN_BRIEF.md` (Mục 10 & 11) và Nguyên tắc VI của Hiến pháp quy định rõ hướng đi công bằng, không dark pattern.

---

## 2. Quyết định (Decision)

1. **Cường hóa Vũ khí (`+0` → `+10`)**:
   - Trần nâng cấp mặc định là **`+10`** (kiểm tra cứng tại server và JSON schema: `0 <= enhancementLevel <= 10`).
   - MVP sử dụng **tỷ lệ thành công 100% (deterministic)** khi người chơi gom đủ Gold và nguyên liệu; **TUYỆT ĐỐI KHÔNG** có cơ chế vỡ vũ khí hay tụt cấp.
   - Độ hiếm và cảm giác thành tựu của mốc `+10` đến từ chuỗi nguyên liệu phân tầng (quặng thường → quặng tinh luyện + drop quái → nguyên liệu Elite & Boss + cấp `bld_blacksmith` Lv 1..4) thay vì xổ số phá đồ.
   - Cột mốc `+5` và `+10` mở hiệu ứng thị giác pixel phát sáng nhẹ trên vũ khí và cộng thêm dòng chỉ số mốc (Milestone Bonus).
2. **Gacha Sưu tầm 100% Tiền tệ Trong game (MVP)**:
   - Chỉ sử dụng `STARLIGHT_SHARD` (160/lượt, 1.600/10 lượt) kiếm từ nhiệm vụ, khám phá, thành tựu, hạ boss lần đầu/hàng tuần và sự kiện gameplay. **Không tích hợp cổng thanh toán tiền thật trong MVP.**
   - Công khai toàn bộ bảng xác suất ngay trong giao diện banner; có bộ đếm Pity minh bạch hiển thị chính xác `currentPity / hardPity` (80 cho Character, 70 cho Weapon) lưu bền vững trong JSON nhân vật.
   - Vật phẩm/nhân vật trùng lặp tự động chuyển đổi thành **Constellation/Mastery Shard** (tối đa 6 bậc tăng tiện ích nhẹ không phá cân bằng) và tiền tệ **`STAR_ESSENCE`** để đổi trực tiếp nhân vật/vũ khí mong muốn trong cửa hàng cố định.
   - Cân bằng sức mạnh: Nhân vật `COMMON`/`UNCOMMON`/`RARE` hoàn thành được 100% nội dung cốt lõi (kể cả Boss Raid) và có cơ chế chiến thuật riêng mà `MYTHIC` không thay thế hoàn toàn.

---

## 3. Các Phương án Bị từ chối (Rejected Alternatives)

- **Cường hóa xác suất giảm dần kèm vỡ đồ từ +7 trở lên**: Tạo tâm lý bỏ game ở người chơi casual và regular, đi ngược trụ cột "không biến game thành grind vô nghĩa".
- **Gacha ẩn pity / không công khai xác suất / bán vé quay tiền thật ở MVP**: Vi phạm trực tiếp Nguyên tắc VI và rủi ro pháp lý/tuân thủ.

---

## 4. Hệ quả (Consequences)

- **Tích cực**: Người chơi dự đoán được lộ trình nâng cấp của mình, tạo động lực farm rõ ràng cả ở nông trại, khai khoáng, xây lò rèn lẫn săn boss.
- **Đánh đổi**: Đòi hỏi thiết kế nền kinh tế sink Gold và nguyên liệu chặt chẽ (đã kiểm chứng bằng mô phỏng kinh tế 30 ngày trong `docs/balancing/simulation-results.md`) để không lạm phát khi không có sink vỡ đồ.
