# Quickstart Validation Guide: Online Multiplayer Presence, Safe Chat, Friends, Co-op Party & Reconnect Recovery

**Feature**: `010-multiplayer-social`  
**Mode Note**: Hướng dẫn kiểm chứng dành cho giai đoạn triển khai (`IMPLEMENTATION MODE`), không chạy trên mã nguồn production chưa tồn tại.

---

## 1. Prerequisites
- Đã hoàn tất các feature nền tảng `001-foundation-game-engine`, `002-auth-character`, `003-world-movement`, `004-combat-skills`, `005-inventory-loot`, `008-housing-farming`.
- Môi trường Node.js 22 LTS cục bộ với `data/db/` trên ổ đĩa SSD; **KHÔNG** cần Redis, PostgreSQL hay dịch vụ chat ngoài.

---

## 2. End-to-End Validation Scenarios (Khi đã Triển khai)

1. **Presence, Friends & Safe Chat (XSS + Rate Limit)**:
   - Kết nối 2 client WebSocket (A và B) vào `zon_greenhaven_square`.
   - Gửi yêu cầu kết bạn A → B và chấp nhận; kiểm tra cả `characters/<A>.json` và `characters/<B>.json` cập nhật đồng bộ qua WAL và sự kiện `PRESENCE_UPDATE` phát khi B chuyển sang `IN_HOMESTEAD`.
   - Gửi `<img src=x onerror=alert(1)>` vào `ZONE` → xác nhận văn bản thuần an toàn không thực thi mã.
   - Gửi `8` tin nhắn trong `2 giây` → xác nhận `5` tin đầu qua, từ tin thứ `6` trả `ERR_CHAT_RATE_LIMITED`; lặp lại 3 chu kỳ trong 1 phút → tự mute `60s` và ghi `SocialSecurityAuditEvent`.
2. **Party `1..4`, Race Condition `3/4` & Boss Kick Lock**:
   - Lập Party `3/4`, mời đồng thời D và E; bắn đồng thời 2 gói `PARTY_ACTION: ACCEPT` trong `< 10 ms`.
   - Kỳ vọng: Chỉ đúng 1 người vào (`4/4`), người còn lại nhận `ERR_PARTY_FULL`, tệp `data/db/parties/<partyId>.json` hợp lệ checksum.
   - Vào trận Boss và thử `KICK` đồng đội → server chặn cứng `ERR_PARTY_BOSS_LOCKED`.
3. **Fair Loot Ownership & Anti-Ninja-Loot**:
   - Tổ đội 3 người (Kael DPS, Lyra Ranged, Seraphina chỉ hồi máu `>= 5%` đóng góp) hạ Boss/Elite; kiểm tra cả 3 đều có `GroundLootEntity` `PERSONAL_INSTANCED` riêng.
   - Client B cố gửi `LOOT_PICKUP_REQ` bằng `lootId` của Client A → từ chối `ERR_FORBIDDEN_OWNERSHIP` và ghi `security-audit`.
4. **Co-op Homestead `PARTY_ACCESS` Anti-Griefing**:
   - Chủ nhà A bật `PARTY_ACCESS`; thành viên Party B vào lãnh địa A → `WATER`, `PET`, `COOK` thành công (trừ nguyên liệu từ túi B); `HARVEST`, `DEMOLISH`, mở `bld_storage` đều trả `403 ERR_FORBIDDEN_OWNERSHIP`.
   - Chủ nhà A đổi về `OWNER_ONLY` → B lập tức nhận `ZONE_TRANSITION` về `zon_greenhaven_square`.
5. **Disconnect `5s` Combat Grace & `120s` Reconnect Recovery**:
   - Ngắt socket Client A khi đang bị quái đánh (HP 20%) → xác nhận A vẫn đứng chịu sát thương trong `5s` Combat Logout Grace; sau đó flush dirty JSON và giữ slot Party/Dungeon `120s`.
   - Kết nối lại ở giây thứ `30` bằng `SESSION_RESUME` → phục hồi đúng Party/instance (hoặc Safe Zone nếu chết trong 5s), `0` item dupe, `100%` toàn vẹn JSON.

---

## 3. Tham chiếu
- Thiết kế Multiplayer & Social: [`docs/game-design/20-multiplayer-design.md`](../../docs/game-design/20-multiplayer-design.md)
- Hợp đồng WebSocket: [`docs/architecture/websocket-contracts.md`](../../docs/architecture/websocket-contracts.md)
- Lược đồ dữ liệu & hợp đồng feature: [`data-model.md`](./data-model.md), [`contracts/multiplayer-social-contract.md`](./contracts/multiplayer-social-contract.md)
