# ADR-006: Phân vùng Thế giới In-Process (Zone Partitioning) & Spatial Grid Interest Management

- **Trạng thái**: Accepted
- **Ngày quyết định**: 2026-11-19
- **Liên kết**: [`docs/architecture/game-server-architecture.md`](../game-server-architecture.md), [`docs/game-design/03-world-building.md`](../../game-design/03-world-building.md)

---

## 1. Bối cảnh (Context)

Eldoria hướng tới thế giới mở 8 khu vực và nhiều hầm ngục phụ bản (Dungeon Instance) cùng lúc. Nếu phát toàn bộ trạng thái của mọi người chơi và mọi quái vật trên toàn máy chủ cho từng kết nối WebSocket (`O(N^2)`), băng thông mạng và CPU sẽ sụp đổ nhanh chóng ngay cả ở 50–100 người chơi đồng thời.

---

## 2. Quyết định (Decision)

1. **Phân tách World → Region → Zone / Instance**:
   - **Open-World Zones**: Mỗi Region (`reg_greenhaven_village`, `reg_whispering_forest`, ...) được chia thành các `ZoneInstance` độc lập (ví dụ `zon_greenhaven_square`, `zon_forest_west`, `zon_forest_deep`). Mỗi Zone có vòng lặp tick, danh sách thực thể và `SpatialHashGrid` riêng.
   - **Private Homestead Instance**: Khu đất nông trại/nhà cửa của mỗi người chơi (`homestead:<characterId>`) chỉ nạp vào RAM khi chủ sở hữu hoặc thành viên Party được cấp quyền bước vào; tự động flush JSON và giải phóng RAM sau 60 giây không còn ai bên trong.
   - **Dungeon Instance**: Khi Party (1–4 người) bước vào `dng_mossroot_hollow`, server cấp phát một `DungeonInstance` tách biệt (`dng:<instanceUuid>`), đảm bảo Boss không bị người ngoài phá rối hoặc tranh cướp loot.
2. **Spatial Hash Grid cho Interest Management**:
   - Kích thước mỗi ô lưới không gian: `256x256 px` (`8x8 tiles`).
   - Mỗi người chơi chỉ nhận cập nhật snapshot của các thực thể nằm trong cụm `5x5` ô lân cận (bán kính quan sát `~640 px`, rộng hơn viewport `640x360 px` có vùng đệm chống pop-in).
   - Giảm độ phức tạp broadcast từ `O(N^2)` xuống `O(N * k)` với `k` là mật độ người chơi cục bộ.
3. **Cổng chuyển vùng mượt mà (Seamless-Feeling Zone Portal)**:
   - Tại biên giới giữa `reg_greenhaven_village` và `reg_whispering_forest`, client tải trước (prefetch) tileset vùng kế tiếp khi vào vùng đệm `6 tiles` gần cổng; khi server xác nhận chuyển zone, client thực hiện hiệu ứng fade nhanh `< 250 ms` và nhận full snapshot vùng mới.

---

## 3. Các Phương án Bị từ chối (Rejected Alternatives)

- **Một bản đồ phẳng khổng lồ không phân vùng**: Tốn RAM lớn cho quái vật ở khu vực không có ai, không thể cách ly Dungeon Boss hoặc lãnh địa riêng của từng người chơi.
- **Dùng Redis Pub/Sub phân phối sự kiện giữa nhiều server ngay trong MVP**: Vi phạm Nguyên tắc I (không dùng Redis/dịch vụ ngoài) và vượt quá nhu cầu của MVP.

---

## 4. Hệ quả (Consequences)

- **Tích cực**: Cô lập tốt tải CPU/băng thông theo từng Zone và Dungeon; tiết kiệm RAM nhờ lazy-load/unload Homestead và Dungeon Instance; dễ mở rộng thành multi-process Shard theo Region trong tương lai nếu cần.
- **Đánh đổi**: Quái vật không thể đuổi người chơi xuyên qua cổng chuyển Zone (leash tự động trả quái về vị trí gốc tại ranh giới Zone).
