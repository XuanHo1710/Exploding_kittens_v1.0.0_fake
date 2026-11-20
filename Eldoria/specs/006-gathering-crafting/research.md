# Phase 0 Research: Resource Gathering & Multi-Station Crafting System

**Feature**: `006-gathering-crafting`  
**Date**: 2026-11-19

---

## 1. Quản lý Trạng thái `ResourceNodeState` Giữa RAM Zone và JSON `world/<regionId>.json`

- **Decision**: Nạp toàn bộ `ResourceNodeState[]` của khu vực từ `data/db/world/<regionId>.json` vào `ZoneInstance` trong RAM khi khởi động zone. Mọi lượt khai thác và bộ đếm `respawnAt` xử lý tức thì trong RAM với khóa đồng bộ theo `nodeId` (không có thao tác `fsync` đĩa trong tick 20 Hz); khi node đổi trạng thái (`remainingCharges` giảm hoặc `respawnAt` kích hoạt), đánh dấu dirty cho `world/<regionId>.json` để `StaggeredDirtyFlusher` ghi định kỳ mỗi 30 giây và flush đầy đủ khi tắt máy chủ. Riêng vật phẩm khai thác được cộng vào `inventories/<charId>.json` thông qua khóa `inventory:<charId>` nguyên tử.
- **Rationale**: Tuân thủ tuyệt đối Nguyên tắc I (JSON-only) và Nguyên tắc IV (cấm ghi đĩa theo từng server tick 20 Hz), đồng thời ngăn chặn race condition ở lượt chặt/đào cuối cùng giữa nhiều người chơi cùng đứng cạnh một mỏ quặng.
- **Alternatives considered**: Ghi trực tiếp `world/<regionId>.json` mỗi nhát chặt cây (bị từ chối vì tạo nghẽn I/O `fsync` trên tệp dùng chung của cả khu vực khi 50 người cùng khai thác); dùng Redis để lưu trạng thái node (bị cấm tuyệt đối theo Hiến pháp Nguyên tắc I).

## 2. Giao dịch Đa Tệp Nguyên tử cho Chế tạo (`CraftingJob`) & Tự động Rút Kho (`autoCraftPull`)

- **Decision**: Mọi lệnh chế tạo (`POST /api/v1/characters/:charId/crafting/execute`) và nhận thành phẩm (`POST /api/v1/characters/:charId/crafting/jobs/:jobId/claim`) chạy trong `JsonDatabaseEngine.runTransaction` với tập khóa đã sắp xếp theo thứ tự từ điển: `["character:<id>", "house:<id>", "inventory:<id>", "ledger:<YYYY-MM>"]` (bỏ qua `house:<id>` nếu chế tạo tại trạm NPC công cộng). Bước `execute` khấu trừ đồng thời nguyên liệu (ưu tiên `bagItems`, thiếu mới rút từ `storageItems` nếu `bld_storage.level >= 2`) + `goldCost`, ghi bút toán `CRAFT_FEE` vào `CurrencyLedger` và thêm bản ghi `CraftingJob` (`status: "IN_PROGRESS"` hoặc `"READY_TO_CLAIM"` nếu `effectiveCraftSeconds === 0`) trong cùng 1 WAL commit. Bước `claim` kiểm tra `Date.now() >= completesAt`, kiểm tra sức chứa `bagItems`, áp dụng thưởng sản lượng (nếu có) bằng `crypto.randomInt`, cộng thành phẩm + `expReward` + `craftingTokenReward` (`CRAFT_TOKEN_REWARD`) và đổi `status` thành `"CLAIMED"` trong 1 WAL commit.
- **Rationale**: Tách pha khấu trừ (`execute`) và nhận đồ (`claim`) bằng trạng thái bền vững `CraftingJob` loại bỏ hoàn toàn nguy cơ mất nguyên liệu nếu server crash giữa lúc người chơi chờ 12–60 giây nung luyện, đồng thời giữ đúng `craftTimeSeconds` trong `game-data/recipes.json` và giới hạn hàng đợi công trình (`forgeQueueSlots`, `cookQueueSlots`, `parallelSmeltSlots`, `brewQueueSlots`, `craftQueueSlots`) trong `game-data/buildings.json`.
- **Alternatives considered**: Đợi `setTimeout` trong RAM rồi mới trừ nguyên liệu và cộng thành phẩm (bị từ chối vì người chơi có thể tiêu nguyên liệu vào việc khác trong lúc chờ hoặc mất lệnh khi server restart); dùng hàng đợi job bên ngoài như BullMQ/Redis (bị cấm tuyệt đối theo Hiến pháp Nguyên tắc I).

## 3. Ánh xạ Thống nhất 36 Công thức (`game-data/recipes.json`) với Trạm Công trình & NPC Công cộng

- **Decision**: `StationResolverService` đọc trực tiếp `stationBuildingId`, `stationLevelReq`, `altStationBuildingIds` và `publicStationNpcId` từ `GameCatalogLoader` (chỉ đọc từ `game-data/recipes.json`). Thứ tự xác thực trạm: (1) Nếu người chơi đang ở trong `zon_player_homestead`, tìm công trình thuộc sở hữu có `buildingId` khớp `stationBuildingId` hoặc thuộc `altStationBuildingIds`, có `status === "ACTIVE"`, `level >= stationLevelReq`, và khoảng cách từ nhân vật đến bất kỳ `interactionPoints` nào của công trình `<= 96 px`; (2) Nếu đang ở `reg_greenhaven_village` và công thức có `publicStationNpcId != null`, xác thực khoảng cách đến NPC tương ứng `<= 96 px` và áp dụng `publicStationFeeMultiplier = 1.0` (không cho phép `autoCraftPull` và không cộng thưởng tốc độ/sản lượng lãnh địa).
- **Rationale**: Đảm bảo 100% nguồn chân lý duy nhất (Nguyên tắc III), cho phép người chơi mới chế tạo cơ bản tại `npc_smith_garrik`, `npc_village_herbalist`, `npc_village_tailor` trước khi hoàn thiện đủ lãnh địa, đồng thời tạo giá trị rõ ràng khi nâng cấp `bld_blacksmith`, `bld_kitchen`, `bld_furnace`, `bld_workshop`, `bld_alchemy_lab`.
- **Alternatives considered**: Hardcode bảng ánh xạ công thức ↔ trạm trong từng service riêng lẻ (bị từ chối vì vi phạm Nguyên tắc III và dễ lệch khi thêm công thức hậu MVP).

## 4. Chống Gian lận Khai thác & Phát hiện Bot Không Dùng Dịch vụ Thứ ba

- **Decision**: Theo dõi hành vi khai thác bằng cửa sổ trượt 20 mẫu gần nhất trong RAM phiên (`GatheringTelemetryWindow`) ghi nhận khoảng cách thời gian giữa các lệnh (`interArrivalMs`) và tọa độ. Nếu độ lệch chuẩn `stddev(interArrivalMs) < 15 ms` liên tục trên `>= 20` lượt hoặc liên tục khai thác vượt ngưỡng hành vi bất thường, hệ thống không auto-ban nhầm mà ghi bản ghi `BOT_SUSPICION_GATHERING` vào `data/db/audit/security-audit-<YYYY-MM-DD>.json` để Moderator xem xét.
- **Rationale**: Tuân thủ tuyệt đối Nguyên tắc I & II (không dùng CAPTCHA hay dịch vụ chống bot bên thứ ba, phân tích trung thực khả năng phòng vệ hành vi).
- **Alternatives considered**: Tích hợp dịch vụ CAPTCHA bên thứ ba (bị cấm theo Nguyên tắc I và hướng dẫn an toàn dự án).
