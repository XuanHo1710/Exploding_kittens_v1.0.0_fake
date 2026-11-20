# Backend Architecture — NestJS Modular Monolith (21 Domain Modules)

**Trạng thái**: Design Baseline v1.0  
**Cập nhật lần cuối**: 2026-11-19  
**Tham chiếu**: [ADR-001](./architecture-decisions/ADR-001-json-only-local-database.md), [ADR-002](./architecture-decisions/ADR-002-modular-monolith-and-20hz-loop.md)

---

## 1. Cấu trúc Modular Monolith (`apps/game-server`)

Toàn bộ backend chạy trong một tiến trình **NestJS** duy nhất, chia thành **Core Infrastructure Modules** và **21 Domain Modules** đúng theo danh mục yêu cầu của `GAME_DESIGN_BRIEF.md` (Mục 19):

```text
apps/game-server/src/
├── core/
│   ├── config/              # Env validation + GameCatalogModule (nạp game-data/*.json)
│   ├── json-db/             # JsonDatabaseModule (Engine, AsyncLockManager, WAL, Indexer, Backup, Recovery)
│   ├── events/              # InternalEventBus (typed domain events chống circular dependency)
│   ├── security/            # AuthGuard, OwnershipGuard, RateLimiter, AuditLogger
│   └── realtime/            # WebSocket Gateway, SessionRegistry, SimulationLoop (20 Hz)
└── modules/                 # 21 DOMAIN MODULES
    ├── identity/            # 01. Register, Login, scrypt, JWT/Refresh, Session JSON
    ├── character/           # 02. Character CRUD, Stats calc, Level/EXP, Ascension, Talent
    ├── world/               # 03. Regions, Zones, Portals, Weather, Day/Night, ResourceNodes
    ├── movement/            # 04. Input validation, Speed/Collision check, SpatialGrid update
    ├── combat/              # 05. Damage formula, Hitbox, Dodge i-frame, Block/Parry, Death/Respawn
    ├── skill/               # 06. 60-Skill runtime executor, Cooldown, MP/Stamina, Status Effects
    ├── inventory/           # 07. Bag, Storage, Stack/Split/Move, Ownership validation
    ├── loot/                # 08. LootTable RNG, GroundLoot lifecycle, Eligibility & Pickup
    ├── equipment/           # 09. Equip/Unequip 10 slots, Set Bonus, Durability, Repair, Socketing
    ├── crafting/            # 10. Smelting, Refining, Cooking, Alchemy, Crafting recipes
    ├── enhancement/         # 11. Deterministic +0..+10 weapon enhancement + UpgradeHistory
    ├── gacha/               # 12. Banners, CSPRNG pull, Pity, Duplicate conversion, GachaHistory
    ├── farming/             # 13. Soil, Seeds, Watering, Fertilizer, Server-Time Offline Growth
    ├── animal/              # 14. Husbandry, Happiness/Hunger/Health, Offline Production Cap
    ├── building/            # 15. Homestead Grid, Placement validation, Construction & Upgrades
    ├── quest/               # 16. Quest acceptance, Objective listener, Rewards claim
    ├── dungeon/             # 17. DungeonInstance lifecycle, Entry check, Party scaling
    ├── boss/                # 18. Multi-phase Boss AI, Telegraph, Poise/Stagger, Enrage, Anti-Exploit
    ├── party/               # 19. Party create/invite/kick/leave, Loot rules
    ├── chat/                # 20. Zone/Party/System chat, Profanity/XSS sanitize, Rate limit
    └── economy/             # 21. CurrencyLedger atomic API, Faucet/Sink tracking, NPC Shop
```

---

## 2. Bản đồ Quyền sở hữu Dữ liệu & Chiều Phụ thuộc (Ownership & Dependency Direction)

Quy tắc vàng: **Một collection JSON trong `data/db/` chỉ được ghi trực tiếp bởi đúng một Owning Module (Repository)**. Các module khác muốn thay đổi dữ liệu đó PHẢI gọi Service công khai hoặc tham gia cùng một `JsonDbTransactionContext`.

| Module | Owning JSON Files (`data/db/`) | Phụ thuộc trực tiếp (Allowed Imports) | Sự kiện phát ra (`InternalEventBus`) |
| :--- | :--- | :--- | :--- |
| `identity` | `accounts/*.json`, `sessions/*.json`, `indexes/accounts-*.json`, `indexes/sessions-*.json` | `json-db`, `security` | `AccountRegistered`, `SessionRevoked` |
| `character` | `characters/*.json`, `indexes/characters-*.json` | `identity`, `game-config`, `json-db` | `CharacterCreated`, `CharacterLeveledUp` |
| `economy` | `ledgers/currency-ledger-*.json` (+ cập nhật `Character.currencies` qua tx) | `character`, `json-db` | `CurrencyChanged` |
| `inventory` | `inventories/*.json` | `character`, `game-config`, `json-db` | `InventoryUpdated`, `ItemAcquired` |
| `world` | `world/*.json` | `game-config`, `json-db` | `ZoneWeatherChanged`, `ResourceNodeRespawned` |
| `movement` | *(RAM only + dirty flag `Character.position`)* | `world`, `character` | `PlayerChangedZone` |
| `skill` | *(RAM timers + đọc `Character.skills`)* | `character`, `game-config` | `SkillCastStarted`, `StatusEffectApplied` |
| `combat` | *(RAM combat state)* | `character`, `skill`, `equipment`, `movement` | `EntityDamaged`, `MonsterKilled`, `PlayerDied` |
| `loot` | *(RAM ground loot + ghi `inventory` & `economy`)* | `inventory`, `economy`, `game-config` | `LootDropped`, `LootPickedUp` |
| `equipment` | *(Cập nhật `Character.equipment` & `inventories`)* | `character`, `inventory`, `economy` | `EquipmentChanged` |
| `crafting` | *(Tx đọc/ghi `inventory`, `economy`, `building`)* | `inventory`, `economy`, `building`, `game-config` | `ItemCrafted` |
| `enhancement` | `history/upgrade-history-*.json` (+ tx `inventory`, `economy`) | `inventory`, `economy`, `building`, `character` | `WeaponEnhanced` |
| `gacha` | `history/gacha-history-*.json` (+ tx `character`, `inventory`, `economy`) | `character`, `inventory`, `economy`, `game-config` | `GachaPulled` |
| `building` | `houses/*.json` (phần `buildings[]`) | `character`, `inventory`, `economy`, `game-config` | `BuildingCompleted`, `BuildingUpgraded` |
| `farming` | `houses/*.json` (phần `crops[]`) | `building`, `inventory`, `world` | `CropHarvested` |
| `animal` | `houses/*.json` (phần `animals[]`) | `building`, `inventory`, `economy` | `AnimalProductCollected` |
| `party` | `parties/*.json` | `character` | `PartyUpdated`, `PartyDisbanded` |
| `dungeon` | *(RAM `DungeonInstance`)* | `world`, `party`, `character`, `boss` | `DungeonStarted`, `DungeonCleared` |
| `boss` | *(RAM Boss AI + cập nhật `world` respawn)* | `combat`, `loot`, `economy`, `game-config` | `BossPhaseChanged`, `BossDefeated` |
| `quest` | *(Cập nhật `Character.quests`)* | `character`, `inventory`, `economy` (lắng nghe Events) | `QuestCompleted` |
| `chat` | *(RAM ring buffer + `audit` nếu vi phạm)* | `party`, `world`, `security` | `ChatBroadcasted` |

---

## 3. Ranh giới Giao dịch (Transaction Boundaries trên JSON WAL)

Mọi nghiệp vụ thay đổi nhiều hơn 1 aggregate JSON PHẢI mở `JsonDbTransaction` duy nhất với khóa sắp xếp theo thứ tự từ điển:

| Nghiệp vụ | Danh sách Khóa Aggregate (Sorted) | Tệp JSON Ghi Trong 1 WAL Commit |
| :--- | :--- | :--- |
| **Cường hóa Vũ khí (`+N → +N+1`)** | `character:<id>`, `house:<id>` (read), `inventory:<id>`, `ledger:<id>:<YYYY-MM>` | `characters/<id>.json`, `inventories/<id>.json`, `history/upgrade-history-<id>.json`, `ledgers/currency-ledger-<id>-<YYYY-MM>.json` |
| **Quay Gacha (1x hoặc 10x)** | `character:<id>`, `inventory:<id>`, `ledger:<id>:<YYYY-MM>` | `characters/<id>.json` (`currencies`, `gachaPity`, `unlockedHeroIds`), `inventories/<id>.json`, `history/gacha-history-<id>.json`, `ledgers/currency-ledger-<id>-<YYYY-MM>.json` |
| **Chế tạo / Luyện kim** | `character:<id>`, `inventory:<id>`, `ledger:<id>:<YYYY-MM>` | `characters/<id>.json`, `inventories/<id>.json`, `ledgers/currency-ledger-<id>-<YYYY-MM>.json` |
| **Xây / Nâng cấp Công trình** | `character:<id>`, `house:<id>`, `inventory:<id>`, `ledger:<id>:<YYYY-MM>` | `characters/<id>.json`, `houses/<id>.json`, `inventories/<id>.json`, `ledgers/currency-ledger-<id>-<YYYY-MM>.json` |
| **Tạo Nhân vật mới** | `account:<accId>`, `index:characters-by-account`, `index:characters-by-name` | `accounts/<accId>.json`, `characters/<charId>.json`, `inventories/<charId>.json`, `houses/<charId>.json`, `indexes/*.json` |

---

## 4. Khởi động & Tắt An toàn (Lifecycle Hooks)

- **Boot Sequence (`onModuleInit`)**:
  1. Nạp & kiểm chứng toàn bộ 12 tệp `game-data/*.json` (fail-fast nếu lỗi schema hoặc đứt gãy ID).
  2. Chạy `JsonDatabaseEngine.recoverFromWal()` và kiểm tra tính nhất quán `indexes/*.json`.
  3. Chạy `JsonSeeder` nếu `data/db/` chưa khởi tạo.
  4. Khởi tạo `ZoneInstance` cho các khu vực MVP (`reg_greenhaven_village`, `reg_whispering_forest`) và bắt đầu vòng lặp `SimulationLoop` 20 Hz + `LocalBackupService`.
- **Graceful Shutdown (`onApplicationShutdown` — `SIGINT`/`SIGTERM`)**:
  1. Ngừng nhận kết nối mới; phát thông báo `SERVER_SHUTDOWN_SOON` tới mọi client.
  2. Dừng `SimulationLoop` sau khi kết thúc tick hiện tại.
  3. Flush toàn bộ trạng thái dirty trong RAM (`characters`, `houses`, `world`) qua `JsonDatabaseEngine` và đợi toàn bộ hàng đợi khóa hoàn tất (`drainLocks()`).
  4. Đóng cổng HTTP/WebSocket sạch sẽ.
