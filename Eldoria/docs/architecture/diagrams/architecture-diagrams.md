# Architecture Diagrams Collection — Eldoria: Forgotten Wilds

**Trạng thái**: Design Baseline v1.0  
**Cập nhật lần cuối**: 2026-11-19  
**Bao gồm**: C4 Component Diagram, Sequence Diagrams (Combat, Gacha, Weapon Enhancement, Reconnect), State Machine Diagrams (Player, Monster AI, Boss Multi-Phase, Building/Crop), Deployment Diagram.

---

## 1. C4 Component Diagram — NestJS Modular Monolith & `JsonDatabaseEngine`

```mermaid
flowchart TB
    subgraph Entry["Tầng Giao tiếp (Entry Points)"]
        REST["REST Controllers<br/>Auth / Char / Gacha / Craft / Enhance"]
        WS["WebSocket Gateway<br/>Move / Combat / Party / Chat"]
        Guards["Security Layer<br/>JWT Auth + Ownership + RateLimit + Zod"]
        REST --> Guards
        WS --> Guards
    end

    subgraph Runtime["Tầng Mô phỏng Realtime (RAM 20 Hz)"]
        Loop["SimulationLoop (50ms)"]
        Zones["ZoneManager & DungeonManager"]
        Grid["SpatialHashGrid (256px cells)"]
        AI["MonsterAI & BossFSM"]
        Loop --> Zones
        Zones --> Grid
        Zones --> AI
    end

    subgraph Domains["21 Domain Services"]
        D_Core["Identity / Character / Economy / Inventory"]
        D_Play["Combat / Skill / Loot / Equipment"]
        D_Life["Crafting / Enhancement / Building / Farming / Animal"]
        D_Social["Gacha / Quest / Party / Chat"]
        Bus["InternalEventBus"]
    end

    subgraph Storage["Tầng Lưu trữ 100% JSON Primary DB + Local Docker Redis & MinIO"]
        Engine["JsonDatabaseEngine"]
        Lock["AsyncLockManager (Sorted Keys)"]
        WAL["WAL Manager (2PC Idempotent Recovery)"]
        Cache["InMemoryAggregateCache + DirtyFlusher (30s)"]
        Catalog["GameCatalogLoader (game-data/*.json)"]
        Disk[("data/db/**/*.json + data/backups/")]
        LocalRedis[("Local Docker Redis (Ephemeral)<br/>Session / Presence / RateLimit / PubSub")]
        LocalMinio[("Local Docker MinIO (S3 Local)<br/>eldoria-assets + eldoria-backups")]
        Engine --> Lock
        Engine --> WAL
        Engine --> Cache
        Engine <--> Disk
        Engine -.-> LocalMinio
    end

    Guards --> Runtime
    Guards --> Domains
    Guards <--> LocalRedis
    Runtime <--> D_Play
    Runtime <--> LocalRedis
    Domains <--> Bus
    Domains --> Engine
    Domains -.-> Catalog
```

---

## 2. Sequence Diagram — Cường hóa Vũ khí `+0 → +10` Nguyên tử trên JSON DB

```mermaid
sequenceDiagram
    actor Player
    participant UI as React Blacksmith UI
    participant API as EnhancementController
    participant Svc as EnhancementService
    participant DB as JsonDatabaseEngine (Lock + WAL)
    participant Disk as data/db/ JSON Files

    Player->>UI: Bấm "Cường hóa lên +6" (gắn idempotencyKey)
    UI->>API: POST /characters/:id/enhancement/upgrade { itemInstanceId }
    API->>Svc: upgradeWeapon(charId, itemInstanceId, idempKey)
    Svc->>DB: acquireLocks(["character:C", "house:C", "inventory:C", "ledger:C:2026-11"])
    Svc->>DB: Kiểm tra idempKey chưa dùng
    Svc->>Svc: Kiểm tra owner, enhancementLevel < 10, Blacksmith Lv >= 2, đủ Gold & Materials
    Svc->>DB: commitWalTransaction([charPayload, invPayload, upgradeHistPayload, ledgerPayload])
    DB->>Disk: Write data/db/wal/tx-xxx.json (PREPARED) + fsync
    DB->>Disk: Atomic tmp->fsync->rename 4 tệp JSON đích
    DB->>Disk: Mark COMMITTED & cleanup WAL
    DB-->>Svc: OK (newLevel: 6, newAtk, revisions)
    Svc->>DB: releaseLocks()
    API-->>UI: 200 OK { itemInstance, currencies, upgradeRecord }
    UI->>Player: Hiển thị hiệu ứng rèn thành công 100% + chỉ số mới
```

---

## 3. Sequence Diagram — Quay Gacha Công bằng (10x Pull + Pity + Duplicate Conversion)

```mermaid
sequenceDiagram
    actor Player
    participant UI as React Gacha Screen
    participant Svc as GachaService
    participant RNG as Node crypto.randomInt
    participant DB as JsonDatabaseEngine (WAL)

    Player->>UI: Chọn "Triệu hồi 10 lần" (1,600 Starlight Shards)
    UI->>Svc: POST /gacha/pull { bannerId, count: 10, X-Idempotency-Key }
    Svc->>DB: acquireLocks(["character:C", "inventory:C", "ledger:2026-11"])
    Svc->>Svc: Xác minh currencies.starlightShard >= 1600
    loop 10 lần quay tuần tự trong lock
        Svc->>RNG: Roll xác suất có Soft/Hard Pity (từ game-data/gacha-banners.json)
        Svc->>Svc: Cập nhật pityCounter & guaranteedFeatured
        alt Trùng nhân vật / vũ khí đã sở hữu
            Svc->>Svc: Quy đổi Constellation/Mastery + cộng STAR_ESSENCE
        else Mới
            Svc->>Svc: Thêm vào unlockedHeroIds hoặc tạo ItemInstance mới
        end
    end
    Svc->>DB: WAL Atomic Commit (character, inventory, gacha-history, currency-ledger)
    DB-->>Svc: Committed
    Svc-->>UI: 200 OK { results[10], pityAfter, currencies }
    UI->>Player: Phát hoạt ảnh mở rương pixel & bảng kết quả chi tiết
```

---

## 4. Sequence Diagram — Chiến đấu Action Combat & Xác thực Hitbox trên Server

```mermaid
sequenceDiagram
    actor P as Player Client (60 FPS)
    participant Ph as Phaser Animation/VFX
    participant WS as NestJS WS Gateway
    participant Sim as 20 Hz SimulationLoop
    participant Boss as Thornback Elder AI

    P->>Ph: Bấm phím R (Crimson Crescent)
    P->>WS: SKILL_CAST_REQ { seq, skillId: "skl_kael_ult_crimson_crescent", aimAngle }
    WS->>Sim: Enqueue command
    Sim->>Sim: Validate MP, Cooldown, CC State -> Start Cast Timer (startupMs=250ms)
    Sim-->>WS: Broadcast Entity animState="ULTIMATE"
    WS-->>Ph: Phát hiệu ứng kiếm khí đỏ (không che telegraph Boss)
    Note over Sim: Sau 250ms -> Active Hit Frame trên Server
    Sim->>Boss: Tính giao cắt Arc Hitbox + Công thức sát thương nguyên tố FIRE vs EARTH (x1.25)
    Sim->>Boss: Trừ HP & Poise -> Poise chạm 0 -> State = STAGGERED (5s)
    Sim-->>WS: Broadcast COMBAT_DAMAGE_EVENT + BOSS_STATE_EVENT(STAGGERED)
    WS-->>Ph: Hit flash + Hit-stop 50ms + Số damage Crit + Boss quỵ gối
```

---

## 5. State Machine Diagrams

### 5.1 Monster AI State Machine (10 Trạng thái chuẩn Mục 15)
```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Patrol : patrolTimerExpired
    Patrol --> Idle : reachedWaypoint
    Idle --> Detect : playerInAggroRadius
    Patrol --> Detect : playerInAggroRadius
    Detect --> Chase : aggroConfirmed (300ms cue)
    Chase --> Attack : targetInAttackRange
    Attack --> Chase : attackRecoveryDone & targetOutOfRange
    Chase --> Return : distanceFromSpawn > leashDistance
    Attack --> Return : targetDiedOrLeftZone
    Return --> Idle : reachedSpawn (fullHPReset)
    Chase --> Flee : hpPercent <= fleeThreshold
    Attack --> Flee : hpPercent <= fleeThreshold
    Flee --> Return : safeDistanceReached
    Idle --> Stunned : ccApplied
    Chase --> Stunned : ccApplied
    Attack --> Stunned : ccApplied
    Stunned --> Chase : ccExpired
    Idle --> Death : hp <= 0
    Chase --> Death : hp <= 0
    Attack --> Death : hp <= 0
    Stunned --> Death : hp <= 0
    Flee --> Death : hp <= 0
    Death --> Respawn : deathAnimDone (spawnLoot)
    Respawn --> Idle : respawnTimerExpired
```

### 5.2 Boss Multi-Phase State Machine (`boss_thornback_elder` — Khớp `game-data/bosses.json`)
```mermaid
stateDiagram-v2
    [*] --> Phase1_RootAwakening : DungeonStart (100% - 65% HP)
    Phase1_RootAwakening --> Staggered : poise == 0 (6.0s, +40% dmg taken)
    Staggered --> Phase1_RootAwakening : staggerEnd & HP > 65%
    Phase1_RootAwakening --> Phase2_SporeTempest : HP <= 65% (Invuln 1.5s transition)
    Phase2_SporeTempest --> Staggered : poise == 0
    Staggered --> Phase2_SporeTempest : staggerEnd & 30% < HP <= 65%
    Phase2_SporeTempest --> Phase3_HeartwoodOvergrowth : HP <= 30% (Arena vines + Meteor spores)
    Phase3_HeartwoodOvergrowth --> Staggered : poise == 0
    Staggered --> Phase3_HeartwoodOvergrowth : staggerEnd & HP <= 30%
    Phase1_RootAwakening --> Enraged : timer >= 360s
    Phase2_SporeTempest --> Enraged : timer >= 360s
    Phase3_HeartwoodOvergrowth --> Enraged : timer >= 360s
    Phase3_HeartwoodOvergrowth --> Defeated : HP == 0
    Enraged --> Defeated : HP == 0
    Defeated --> [*] : GrantPartyLoot & UnlockNextMilestone
```

### 5.3 Crop & Offline Server-Time State Machine
```mermaid
stateDiagram-v2
    [*] --> Untilled
    Untilled --> Tilled : HoeAction
    Tilled --> Seeded_Stage1 : PlantSeed (check Season)
    Seeded_Stage1 --> Growing_Stage2 : serverElapsed >= 33% & watered
    Growing_Stage2 --> Growing_Stage3 : serverElapsed >= 66% & watered
    Growing_Stage3 --> Mature_Stage4 : serverElapsed >= 100%
    Mature_Stage4 --> Tilled : Harvest (single-harvest crop)
    Mature_Stage4 --> Growing_Stage3 : Harvest (regrowable crop)
    Seeded_Stage1 --> Paused_Dry : wateredUntilExpired (no rain/irrigation)
    Paused_Dry --> Seeded_Stage1 : WaterAction / RainWeather
```
