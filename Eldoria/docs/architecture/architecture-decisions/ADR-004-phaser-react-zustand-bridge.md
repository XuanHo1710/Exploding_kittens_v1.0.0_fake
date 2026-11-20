# ADR-004: Cầu nối Kiến trúc Phaser 3 (60 FPS) & React/Zustand UI

- **Trạng thái**: Accepted (Mandated by Constitution Principle IV)
- **Ngày quyết định**: 2026-11-19
- **Liên kết**: [`docs/architecture/frontend-architecture.md`](../frontend-architecture.md), [`docs/ui-ux/design-system.md`](../../ui-ux/design-system.md)

---

## 1. Bối cảnh (Context)

Frontend kết hợp **Phaser 3** (render thế giới pixel 2.5D, sprite, animation, tilemap, VFX, camera) và **React + Tailwind CSS** (HUD, Inventory, Blacksmith, Gacha, Quest Journal, Chat, Settings). Lỗi kiến trúc phổ biến nhất là đẩy toàn bộ danh sách thực thể, tọa độ và trạng thái frame 60 Hz vào React state, khiến React re-render liên tục làm tụt FPS và giật hình.

---

## 2. Quyết định (Decision)

1. **Phân tách Trạng thái Hai Tầng**:
   - **High-Frequency World State (60 FPS — Phaser-Only)**: Tọa độ thực thể, nội suy vị trí, hoạt ảnh sprite, Y-sorting depth, particle VFX, projectile, damage floating numbers và camera shake sống **hoàn toàn trong Phaser Scene / `WorldStateBuffer` thuần TypeScript**, KHÔNG đi qua React.
   - **Low-Frequency UI State (Event-Driven — Zustand Stores)**: HP/MP/Stamina/EXP (throttle cập nhật UI tối đa 10–15 Hz hoặc khi thay đổi giá trị), Hotbar Cooldowns, Inventory, Equipment, Active Quests, Party, Chat, Minimap player dot (5 Hz) và trạng thái Modal mở/đóng được lưu trong các Zustand store tách biệt (`useHudStore`, `useInventoryStore`, `useSocialStore`, `useUiModalStore`).
2. **Typed Event Bridge (`GameUiBridge`)**:
   - Giao tiếp hai chiều giữa Phaser và React diễn ra thông qua một Event Emitter có kiểu chặt (`packages/shared` + `apps/client/src/bridge/GameUiBridge.ts`), giúp ngắt liên kết trực tiếp giữa component React và scene Phaser.
3. **Quản lý Input Tập trung (`InputFocusManager`)**:
   - Khi một modal React đang mở (Chat input, Blacksmith, Gacha, Settings), `InputFocusManager` tự động khóa phím di chuyển/tấn công của Phaser (trừ phím đóng `ESC`) để tránh nhân vật vừa gõ chat vừa tung kỹ năng.
4. **Pixel-Perfect Canvas Scaling**:
   - Canvas Phaser chạy logical resolution `640x360` với `pixelArt: true`, `roundPixels: true`, `antialias: false` và CSS `image-rendering: pixelated`; lớp React HUD overlay nằm phía trên bằng CSS container đồng bộ tỉ lệ.

---

## 3. Các Phương án Bị từ chối (Rejected Alternatives)

- **Vẽ toàn bộ UI (Inventory, Gacha, Chat, Quest Journal) bằng Phaser Canvas**: Tốn gấp 3–4 lần thời gian phát triển, khó hỗ trợ responsive, accessibility (keyboard focus, ARIA), nhập tiếng Việt có dấu (IME) và cuộn văn bản dài.
- **Lưu toàn bộ entity world trong Redux/Zustand mỗi frame**: Gây rác bộ nhớ GC và sụt khung hình nghiêm trọng.

---

## 4. Hệ quả (Consequences)

- **Tích cực**: Giữ mượt 60 FPS mục tiêu trên canvas pixel art trong khi vẫn có hệ thống giao diện RPG phong phú, hỗ trợ gõ tiếng Việt IME tự nhiên và dễ viết test Playwright.
- **Đánh đổi**: Phải kiểm soát nghiêm ngặt việc đăng ký/hủy sự kiện trên `GameUiBridge` khi chuyển scene để không rò rỉ bộ nhớ.
