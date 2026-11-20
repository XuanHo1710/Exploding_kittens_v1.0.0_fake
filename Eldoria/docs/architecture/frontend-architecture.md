# Frontend Architecture — React, Vite, Phaser 3, Zustand & Tailwind CSS

**Trạng thái**: Design Baseline v1.0  
**Cập nhật lần cuối**: 2026-11-19  
**Tham chiếu**: [ADR-004](./architecture-decisions/ADR-004-phaser-react-zustand-bridge.md), [Constitution Nguyên tắc IV & V](../../.specify/memory/constitution.md)

---

## 1. Kiến trúc Phân lớp Frontend (`apps/client`)

Frontend chia thành 4 lớp độc lập với ranh giới trách nhiệm nghiêm ngặt nhằm duy trì **mục tiêu 60 FPS (`proposed/unverified`)** cho pixel art 2.5D trong khi vẫn cung cấp 24 màn hình RPG phong phú:

```text
apps/client/src/
├── app/                     # App root, router (Login/Select/Game), ErrorBoundary
├── network/
│   ├── HttpClient.ts        # REST client (auth refresh, catalog, gacha, history)
│   └── SocketClient.ts      # WebSocket client, heartbeat, reconnect, packet queue
├── bridge/
│   ├── GameUiBridge.ts      # Typed Pub/Sub EventEmitter kết nối Phaser <-> React
│   └── InputFocusManager.ts # Khóa phím gameplay Phaser khi người chơi gõ Chat/mở Modal
├── game/                    # PHASER 3 WORLD (60 FPS — KHÔNG ĐƯỢC IMPORT REACT)
│   ├── PhaserGameFactory.ts # Cấu hình pixelArt: true, roundPixels: true, 640x360 logical
│   ├── scenes/
│   │   ├── BootScene.ts     # Tải atlas, font cục bộ, manifest
│   │   ├── WorldScene.ts    # Bản đồ Tiled, Y-sorting, player/mob/boss/farm/building
│   │   └── DungeonScene.ts  # Bản đồ phụ bản & Boss Arena (thừa kế BasePlayableScene)
│   ├── systems/
│   │   ├── PredictionSystem.ts      # Client-side movement prediction + reconciliation
│   │   ├── InterpolationSystem.ts   # Entity interpolation buffer 100 ms cho remote entities
│   │   ├── YSortDepthSystem.ts      # Sắp xếp depth = entity.footY + layerOffset
│   │   ├── AnimationController.ts   # 4-dir state machine (Idle..Ultimate..Farming)
│   │   ├── CombatVfxSystem.ts       # Telegraph dưới chân, hit flash, hit-stop, camera shake (tắt được)
│   │   └── BuildingGhostSystem.ts   # Ghost preview lưới 32x32, xanh hợp lệ / đỏ trùng collision
│   └── state/
│       └── WorldStateBuffer.ts      # Trạng thái 60 FPS thuần TS (Map<entityId, EntityRenderState>)
├── stores/                  # ZUSTAND STORES (Event-Driven UI — Throttled 10 Hz max)
│   ├── useAuthStore.ts      # Session, account, character selection
│   ├── useHudStore.ts       # HP/MP/Stamina/Hunger/EXP, hotbar cooldowns, boss HP/poise bar, minimap
│   ├── useInventoryStore.ts # Bag, Storage, Equipment, Currencies
│   ├── useProgressionStore.ts # Stats, Skill Tree, Quests, Collection
│   ├── useHomesteadStore.ts # Buildings, Crops, Animals state UI
│   ├── useSocialStore.ts    # Party, Chat buffer, Friends, Presence
│   └── useUiModalStore.ts   # Active modal stack, toast notifications, accessibility settings
└── ui/                      # REACT + TAILWIND PIXEL FANTASY COMPONENTS
    ├── hud/                 # MainGameHud, SkillHotbar, MinimapCanvas, BossBar, QuestTracker
    ├── modals/              # Inventory, Equipment, Blacksmith/Enhance, Crafting, Gacha, Building, Map
    ├── screens/             # Login/Register, CharacterSelect, StarterCreate, Loading, DeathRespawn
    └── primitives/          # PixelPanel, PixelButton, ItemSlot, StatBar, Tooltip
```

---

## 2. Cơ chế Render Pixel-Perfect 2.5D trong Phaser 3

- **Logical Viewport**: `640 × 360 px` (tỉ lệ 16:9). Trên màn hình `1280×720` scale chính xác `2x`; trên `1920×1080` scale `3x`; trên `2560×1440` scale `4x`. Hỗ trợ chế độ `INTEGER_FIT` (mặc định, viền tối sạch) hoặc `FILL_PIXELATED` trong Settings.
- **Nearest-Neighbor Filtering**: Bật `pixelArt: true`, `antialias: false`, `roundPixels: true` trong Phaser config; CSS `image-rendering: pixelated; image-rendering: crisp-edges;`.
- **Thứ tự Layering & Y-Sorting (Chiều sâu 2.5D — Khớp `art-bible.md` & `vfx-design.md`)**:
  1. `Depth 0–99`: Ground Tile Layers (đất, cỏ, nước có animation 4 frame, đường đá, ruộng đã cuốc).
  2. `Depth 100–199`: Ground Decals & Telegraphs phân tầng rõ (`100–119`: Ally Ground Decals; `120–139`: Building Placement Grid; `140–179`: Environmental Hazards; **`180–199`: Boss/Enemy Telegraphs** — không chịu làm tối bởi Day/Night LUT, luôn nổi rõ dưới chân nhân vật).
  3. `Depth 200–299`: Ground Shadows (bóng elip bán trong suốt màu tím đậm `#1a1628` alpha `0.38` nghiêng nhẹ phía đông-nam).
  4. `Depth 1000..99999`: **Y-Sorted World Entities** (`depth = 1000 + Math.round(sprite.footY)` — ánh xạ tương đương dải logic `200–699` trong sơ đồ khái niệm `tileset-standard.md`): Nhân vật, Quái vật, Boss, Động vật, Cây trồng, Thân cây, Công trình nhà cửa — làm mờ nhẹ mái nhà (`alpha = 0.55`) khi người chơi đi phía sau.
  5. `Depth 100000–109999`: Overhead Canopy, Projectiles bay cao, Combat VFX hạt ánh sáng (kẹp alpha đồng đội `<= 0.45`–`0.65`) và **`Depth 109500` (`Telegraph Rim Echo`)** vẽ lại viền cảnh báo Boss để tuyệt đối không bao giờ bị Ultimate che khuất.
  6. `Depth 110000–119999`: Floating Damage Numbers, Status Icons, Nameplates, Day/Night Color Grading Overlay (`Multiply` nhẹ cho hoàng hôn/ban đêm + đốm sáng đèn lồng cục bộ).

---

## 3. Luồng Dữ liệu Không Làm Tắc React (`Phaser ↔ Zustand`)

| Sự kiện | Chiều đi | Cách xử lý |
| :--- | :---: | :--- |
| `WORLD_SNAPSHOT` (10 Hz) | `SocketClient → WorldStateBuffer (Phaser)` | Cập nhật thẳng Map trong RAM Phaser; **KHÔNG gọi `setState` React**. Chỉ trích xuất HP/MP/Stamina/Minimap của riêng local player đẩy vào `useHudStore` nếu giá trị thực sự thay đổi. |
| `MOVE_INPUT` (20 Hz) | `Phaser Input → PredictionSystem → SocketClient` | Chạy thuần trong Phaser, không chạm React. |
| `HOTBAR_SKILL_CLICK` / Phím `1..4`, `R` | `React / Phaser → GameUiBridge → SocketClient` | Gửi `SKILL_CAST_REQ` lên server; phản hồi `SKILL_CAST_ACK` cập nhật cooldown trong `useHudStore` và phát animation trong Phaser. |
| `INVENTORY_SYNC` / `ENHANCE_RESULT` / `GACHA_RESULT` | `SocketClient / HttpClient → Zustand Store` | Cập nhật tức thì modal React; phát `GameUiBridge.emit('vfx:enhance_success')` nếu cần hiệu ứng trên canvas. |
| `BUILDING_PLACE_START` | `React Building Modal → GameUiBridge → Phaser BuildingGhostSystem` | Đóng modal tạm, bật ghost preview theo con trỏ chuột; khi click xác nhận gửi `BUILDING_PLACE_REQ` kèm `idempotencyKey` lên server. |

---

## 4. Chiến lược Tải Tài nguyên & Hiệu năng Client

- **Texture Atlas Packing**: Gom sprite theo nhóm logic (`atlas_heroes_mvp`, `atlas_mobs_forest`, `atlas_boss_thornback`, `atlas_tiles_greenhaven`, `atlas_ui_icons`) để giảm WebGL draw calls và chuyển đổi texture.
- **Lazy Loading theo Region**: `BootScene` chỉ tải UI icons + `reg_greenhaven_village` + starter heroes. Khi người chơi tiến gần cổng sang `reg_whispering_forest` hoặc vào `dng_mossroot_hollow`, `AssetPrefetcher` tải ngầm atlas khu vực tiếp theo.
- **Object Pooling**: Dùng pool tái sử dụng cho Floating Damage Numbers, Projectile Sprites, Particle Emitters và Ground Loot Icons nhằm tránh GC pause gây giật khung hình trong Boss Raid 4 người.
- **Xử lý Ngắt kết nối (Reconnect UX)**: Khi mất kết nối WebSocket, `SocketClient` bật banner trạng thái `Reconnecting...` trên HUD (không văng ngay ra màn hình login), tự thử lại theo exponential backoff (`1s → 2s → 4s → 8s`, tối đa 5 lần), sau đó gửi `SESSION_RESUME` nhận lại full snapshot từ server.
