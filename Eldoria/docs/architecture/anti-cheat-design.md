# Anti-Cheat Design & Threat Model — Eldoria: Forgotten Wilds

**Trạng thái**: Design Baseline v1.0  
**Cập nhật lần cuối**: 2026-11-19  
**Ràng buộc Hiến pháp**: Nguyên tắc I (JSON DB Locking & WAL), Nguyên tắc II (Server-Authoritative Simulation)

---

## 1. Nguyên tắc Cốt lõi

1. **Client luôn là môi trường không đáng tin cậy (Untrusted Client)**: Mọi dữ liệu JavaScript/Phaser trong trình duyệt đều có thể bị mở DevTools, sửa bộ nhớ hoặc giả lập WebSocket trực tiếp.
2. **Server xác thực hành vi, không xác thực kết quả**: Client gửi *"Tôi muốn đánh về hướng 45°"* hoặc *"Tôi muốn cường hóa vũ khí X"*, KHÔNG BAO GIỜ gửi *"Tôi vừa gây 9999 sát thương"* hay *"Vũ khí tôi vừa lên +10"*.
3. **Không khẳng định chống gian lận tuyệt đối**: Mục tiêu là chặn triệt để gian lận kinh tế/vật phẩm/chỉ số trực tiếp tại server và phát hiện sớm hành vi tự động hóa (bot) qua phân tích thống kê hành vi.

---

## 2. Ma trận Phân tích 14 Bề mặt Tấn công (Theo Yêu cầu Mục 21)

| STT | Nguy cơ Gian lận | Kịch bản Khai thác | Cơ chế Phòng thủ Tại Server & `JsonDatabaseEngine` | Mức độ Kiểm soát |
| :-: | :--- | :--- | :--- | :---: |
| **1** | **Item Duplication** (Nhân bản vật phẩm) | Gửi 2 lệnh cất/lấy kho, cường hóa, chế tạo hoặc ngắt kết nối đúng lúc chuyển đồ | Khóa `AsyncLockManager` trên `inventory:<charId>` + `character:<charId>` theo thứ tự chuẩn; giao dịch đa tệp qua JSON WAL + `revision` OCC + `idempotencyKey`; mọi `ItemInstance` có UUIDv7 duy nhất kiểm tra không trùng | Cao (Chặn cứng tại server) |
| **2** | **Speed Hacking** (Tăng tốc di chuyển) | Sửa đồng hồ client hoặc gửi chuỗi `MOVE_INPUT` mật độ cao để chạy vượt tốc độ cho phép | Server tự tính quãng đường tối đa theo `deltaTimeServer * moveSpeed * sprintMultiplier * 1.10` (đệm jitter nhỏ); bỏ qua `dt` do client khai báo; vượt ngưỡng tích lũy bị kéo lùi (rubber-band) và tăng điểm nghi vấn | Cao |
| **3** | **Teleport Cheating** (Dịch chuyển tức thời) | Gửi tọa độ `(x, y)` nhảy xuyên tường hoặc qua bản đồ | Giao thức **KHÔNG** nhận tọa độ đích từ client (chỉ nhận vector hướng `dx, dy` chuẩn hóa `length <= 1`); server tự bước mô phỏng từng tick 20 Hz qua lưới va chạm Tiled (`collisionGrid`) | Rất cao |
| **4** | **Fake Damage** (Giả mạo sát thương) | Sửa chỉ số ATK trên client hoặc gửi gói `DAMAGE_DEALT` giả | Không tồn tại gói tin `DAMAGE_DEALT` từ client; toàn bộ công thức sát thương, chỉ số nhân vật, vũ khí +1..+10, buff món ăn và trúng đích hitbox chạy 100% trong `CombatService` trên server | Rất cao |
| **5** | **Cooldown Bypass** (Bỏ qua hồi chiêu) | Gọi liên tục `SKILL_CAST_REQ` nhanh hơn `cooldownMs` | Server lưu `nextReadyAtTick` theo từng `skillId` trong RAM phiên nhân vật, tính kèm trần `CDR <= 40%`; yêu cầu đến sớm hơn bị từ chối với mã `ERR_SKILL_ON_COOLDOWN` | Rất cao |
| **6** | **Currency Manipulation** (Sửa tiền tệ) | Gửi yêu cầu mua với số lượng âm (`qty = -999`) hoặc sửa số dư Gold/Starlight Shard | Mọi `quantity` phải là số nguyên dương trong khoảng `[1..maxStack]`; số dư chỉ thay đổi qua `EconomyService.applyLedgerDelta()` kiểm tra `balanceBefore + delta >= 0` bên trong khóa aggregate và đối chiếu `CurrencyLedger` | Rất cao |
| **7** | **Replay Attack** (Gửi lại gói tin cũ) | Bắt gói tin WebSocket/HTTP hợp lệ (như nhận thưởng quest, quay gacha) và phát lại | Mọi hành động ghi kinh tế yêu cầu `idempotencyKey` duy nhất (lưu tối thiểu 24h trong `indexes/idempotency-keys.json`); WebSocket input kiểm tra `seq > lastProcessedSeq` đơn điệu tăng | Cao |
| **8** | **Bot Farming** (Tự động cày cuốc) | Script lặp vô hạn đánh quái, chặt cây, thu hoạch 24/7 | Theo dõi chỉ số bất thường nội bộ (không dùng CAPTCHA bên thứ ba): độ đều đặn bất thường của khoảng thời gian input (`stddev < 15ms` kéo dài), hoạt động liên tục > 12h không đổi mẫu di chuyển, tự động giới hạn giảm sản lượng tài nguyên cực đoan & đưa vào hàng đợi kiểm tra Moderator trong `security-audit` | Trung bình (Phát hiện hành vi; không tuyệt đối) |
| **9** | **Invalid Crafting** (Chế tạo lậu) | Gửi `recipeId` chưa mở khóa, đứng xa trạm chế tạo hoặc thiếu nguyên liệu | Server xác minh nhân vật đang ở trong tầm tương tác công trình/trạm hợp lệ (`<= 96 px`), cấp công trình đạt `stationLevelReq`, đủ nguyên liệu & Gold, trừ nguyên liệu và cấp thành phẩm trong cùng một giao dịch WAL | Rất cao |
| **10** | **Double Spending** (Chi tiêu hai lần) | Bấm đồng thời 2 tab trình duyệt để mua công trình và cường hóa bằng cùng một khoản Gold | Single active gameplay session + khóa độc quyền `character:<id>` + `inventory:<id>` trên `AsyncLockManager`; lệnh đến sau đọc số dư đã cập nhật và thất bại sạch sẽ với `ERR_INSUFFICIENT_FUNDS` | Rất cao |
| **11** | **Unauthorized Building Placement** (Đặt công trình trái phép) | Đặt nhà đè lên spawn point, đường đi bắt buộc, đất người khác hoặc ngoài ranh giới | Server kiểm tra vùng đất thuộc quyền sở hữu `homestead.ownerCharacterId`, footprint nằm gọn trong `buildableMask`, không trùng công trình khác, không chặn đường vào cổng (`pathfindingReachableCheck` tới điểm spawn) | Rất cao |
| **12** | **Unauthorized Loot Pickup** (Cướp/nhặt loot lậu) | Gửi gói `LOOT_PICKUP_REQ` cho vật phẩm rơi cách xa nửa bản đồ hoặc của người khác | Ground loot lưu trong RAM zone kèm `{ lootId, x, y, eligibleCharacterIds[], expiresAt }`; server xác minh người chơi nằm trong `eligibleCharacterIds`, khoảng cách Euclidean `<= 96 px` và xóa loot nguyên tử khỏi zone trước khi thêm vào JSON inventory | Rất cao |
| **13** | **Concurrent Gacha Requests** (Spam quay gacha đồng thời) | Gửi 20 request `POST /api/gacha/pull` cùng mili-giây để vượt giới hạn Starlight Shard hoặc bug pity | Khóa `AsyncLockManager` trên `character:<id>` + `inventory:<id>` + kiểm tra `idempotencyKey` + RNG mật mã `crypto.randomInt` chạy nối tiếp bên trong lock + WAL commit toàn phần (`currencies`, `gachaPity`, `unlockedHeroIds`/`inventory`, `gacha-history`, `currency-ledger`) | Rất cao |
| **14** | **Disconnect Exploit** (Lợi dụng ngắt kết nối) | Rút mạng ngay khi sắp chết trước Boss để tránh phạt hoặc hoàn tác tiêu hao | Mọi chi phí kỹ năng/vật phẩm/tiền tệ đã trừ ngay khi server xử lý lệnh; khi mất kết nối trong combat/boss, nhân vật giữ trạng thái **Combat Logout Grace (5 giây)** trên server (vẫn có thể nhận sát thương trong 5 giây trước khi thoát) để chống Alt+F4 né chết; trạng thái dirty được flush JSON đầy đủ khi nhân vật rời zone | Cao |

---

## 3. Hệ thống Chấm điểm Nghi vấn & Phản ứng Leo thang (Violation Scoring)

Thay vì khóa nhầm người chơi do lag mạng, server duy trì `suspicionScore` theo cửa sổ trượt 10 phút trong RAM phiên:

| Mức độ vi phạm | Ví dụ | Điểm cộng | Hành động tự động |
| :--- | :--- | :---: | :--- |
| **Nhẹ (Lag/Desync)** | Sai lệch vị trí 6–48 px, gửi packet trùng `seq` | `+1` | Chỉ reconcile/bỏ qua, không phạt |
| **Trung bình** | Sai lệch tốc độ lặp lại > 5 lần/phút, gửi cast khi đang stun/cooldown liên tục | `+10` | Ghi vào `security-audit-YYYY-MM-DD.json`, phát cảnh báo nội bộ |
| **Nghiêm trọng** | Gửi packet sai schema/payload âm, cố nhặt loot cách > 300 px, cố sửa tài khoản khác | `+35` | Từ chối lệnh + ghi audit mức `HIGH` |
| **Ngưỡng ngắt kết nối** | `suspicionScore >= 100` trong 10 phút | — | Ngắt socket tạm thời (`ERR_PROTOCOL_VIOLATION`), gắn cờ xem xét Moderator (không auto-ban vĩnh viễn không qua rà soát trừ lỗi nghiêm trọng) |

---

## 4. Đồng hồ Server cho Tiến trình Offline (Anti-Clock-Tampering)

- Mọi thời điểm trồng cây (`wateredUntil`, `lastSimulatedAt`), nuôi thú (`nextProduceAt`), xây nhà (`completesAt`), hồi tài nguyên (`respawnAt`) và làm mới thưởng Boss tuần đều lấy **100% từ `Date.now()` của máy chủ**.
- Client chỉ nhận thời lượng còn lại (`remainingSeconds`) để vẽ thanh tiến trình đếm ngược. Chỉnh đồng hồ Windows/trình duyệt của người chơi hoàn toàn vô tác dụng.
