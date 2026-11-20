# Implementation Plan: Foundation, JSON-Only Database Engine & Game Loop Shell

**Branch**: `001-foundation-game-engine` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-foundation-game-engine/spec.md`

## Summary

Thiết lập bộ khung monorepo cho **Eldoria: Forgotten Wilds** gồm: (1) động cơ lưu trữ bền vững **100% tệp JSON cục bộ (`JsonDatabaseEngine`)** với phân mảnh aggregate, khóa bất đồng bộ sắp xếp thứ tự, ghi nguyên tử `tmp → fsync → rename`, JSON WAL 2 pha kèm phục hồi sự cố khi khởi động, chỉ mục JSON và sao lưu cục bộ xoay vòng; (2) bộ nạp & kiểm chứng chéo 12 tệp danh mục `game-data/*.json`; (3) vòng lặp mô phỏng NestJS 20 Hz tách biệt hoàn toàn I/O đĩa; và (4) khung client React + Vite + Phaser 3 pixel-perfect `640x360` kết nối Zustand qua `GameUiBridge`.

## Technical Context

**Language/Version**: TypeScript 5.x trên Node.js 22 LTS (ESM/CommonJS thống nhất trong monorepo)

**Primary Dependencies**: NestJS 11, Socket.IO / `ws`, Zod (JSON Schema & DTO validation), React 19, Vite 6, Phaser 3, Zustand, Tailwind CSS

**Storage**: 100% Local JSON Primary Persistent Database (`data/db/**/*.json`) quản lý bởi `JsonDatabaseEngine` nội bộ + Read-Only Static Catalog (`game-data/*.json`) + Local Rotating Snapshots (`data/backups/`, đồng bộ gương sang Local Docker MinIO bucket `eldoria-backups` qua `013`) + Ephemeral Cache/Health integration với Local Docker Redis (`redis:7-alpine`, fallback RAM) — ZERO PostgreSQL/TypeORM/SQLite/MongoDB/External Cloud Services

**Testing**: Vitest (client & shared), Jest + Supertest (server & JsonDatabaseEngine crash/concurrency tests), Playwright (pixel rendering verification)

**Target Platform**: Desktop Web Browser (Chrome/Edge/Firefox mới nhất) + Self-Hosted Local Docker Compose Stack (`eldoria-server`, `redis`, `minio`, `minio-init`) hoặc Node.js 22 LTS cục bộ

**Project Type**: Monorepo Web Game (Frontend SPA + Phaser Canvas + NestJS Modular Monolith Realtime Game Server + Shared Packages)

**Performance Goals**: Server simulation tick `20 Hz` (`p99 < 25 ms`), JSON WAL atomic commit `p95 < 15 ms` ở 50 CCU, Client rendering `60 FPS` (`proposed / unverified`)

**Constraints**: Zero external cloud/third-party services; cấm ghi đĩa theo từng tick 20 Hz; cấm cập nhật toàn bộ world state qua React state mỗi frame; bảo vệ path traversal và checksum SHA-256 trên mọi tệp JSON; mọi dữ liệu bền vững vẫn 100% tại `data/db/**/*.json`

**Scale/Scope**: Nền tảng cho toàn bộ 12+ feature tiếp theo (`002..013`); MVP vertical slice mục tiêu đo kiểm 20–50 CCU đơn nút và stress test tới 100–500 CCU

## Constitution Check (Constitution v2.0.0)

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design & v2.0.0 cross-check.*

| Nguyên tắc Hiến pháp | Kiểm tra Trước Thiết kế | Kiểm tra Sau Thiết kế (v2.0.0) | Ghi chú |
| :--- | :---: | :---: | :--- |
| **I. JSON-Only Primary Persistent DB + Local Docker Redis & MinIO** | PASS | PASS | Primary DB 100% `data/db/**/*.json` + WAL JSON + backup cục bộ; tích hợp mở rộng sang Local Docker Redis (ephemeral) & Local Docker MinIO (`eldoria-assets` / `eldoria-backups`) theo `013` / `ADR-007`; 0 SQL/NoSQL ngoài, 0 Cloud SaaS |
| **II. Server-Authoritative & Anti-Cheat** | PASS | PASS | Path traversal guard, checksum SHA-256, `idempotencyKey`, khóa aggregate sắp xếp chống race |
| **III. Data-Driven Single Source of Truth** | PASS | PASS | `GameCatalogLoader` nạp và kiểm tra chéo toàn bộ 12 tệp `game-data/*.json` (fail-fast) |
| **IV. Modular Monolith & Decoupled Simulation** | PASS | PASS | Monorepo rõ ràng; `SimulationLoop` 20 Hz không ghi đĩa trong tick; `WorldStateBuffer` Phaser tách khỏi Zustand |
| **V. Classic 16-Bit Pixel-Perfect Visual Cohesion** | PASS | PASS | Logical viewport `640x360`, `pixelArt: true`, `roundPixels: true`, nearest-neighbor |
| **VI. Fair Progression & Meaningful Loops** | PASS (N/A trực tiếp) | PASS | Cung cấp hạ tầng WAL & catalog chuẩn cho các feature kinh tế sau |
| **VII. Spec-Driven & Vertical-Slice MVP** | PASS | PASS | Tách feature `001` độc lập; giữ chế độ `DESIGN_AND_PLANNING_ONLY` |
| **VIII. Verifiable Quality Gates & Evidence Integrity** | PASS | PASS | Toàn bộ mục tiêu hiệu năng gắn nhãn `proposed / unverified` |

## Project Structure

### Documentation (this feature)

```text
specs/001-foundation-game-engine/
├── spec.md              # Feature specification + Clarifications
├── plan.md              # This file
├── research.md          # Phase 0 research decisions
├── data-model.md        # Canonical JSON entities & constrained fields
├── quickstart.md        # End-to-end validation guide
├── contracts/
│   └── json-db-and-health-contract.md
├── checklists/
│   ├── requirements.md
│   └── storage-and-engine.md
├── tasks.md             # Dependency-ordered implementation tasks
└── analysis-report.md   # Cross-artifact consistency report
```

### Source Code (repository root — Planned Layout for Implementation Phase)

```text
apps/
├── client/
│   ├── src/
│   │   ├── app/
│   │   ├── bridge/
│   │   │   ├── GameUiBridge.ts
│   │   │   └── InputFocusManager.ts
│   │   ├── game/
│   │   │   ├── PhaserGameFactory.ts
│   │   │   ├── scenes/BootScene.ts
│   │   │   └── state/WorldStateBuffer.ts
│   │   ├── network/HttpClient.ts
│   │   └── stores/useSystemStore.ts
│   └── tests/
└── game-server/
    ├── src/
    │   ├── core/
    │   │   ├── config/GameCatalogLoader.ts
    │   │   ├── json-db/
    │   │   │   ├── AsyncLockManager.ts
    │   │   │   ├── PathSecurityGuard.ts
    │   │   │   ├── ChecksumUtil.ts
    │   │   │   ├── AtomicFileWriter.ts
    │   │   │   ├── WalManager.ts
    │   │   │   ├── CrashRecoveryService.ts
    │   │   │   ├── IndexManager.ts
    │   │   │   ├── StaggeredDirtyFlusher.ts
    │   │   │   ├── LocalBackupService.ts
    │   │   │   └── JsonDatabaseEngine.ts
    │   │   ├── realtime/SimulationLoop.ts
    │   │   └── health/HealthController.ts
    │   └── main.ts
    └── tests/
packages/
├── shared/
│   └── src/
│       ├── enums/
│       ├── contracts/
│       └── math/
└── game-config/
    └── src/
        ├── schemas/
        └── cross-ref-validator.ts
```

**Structure Decision**: Sử dụng kiến trúc Monorepo gồm 2 ứng dụng (`apps/client`, `apps/game-server`) và 2 thư viện chia sẻ nội bộ (`packages/shared`, `packages/game-config`), đọc trực tiếp `game-data/` và ghi dữ liệu runtime vào `data/db/` + `data/backups/`.

## Complexity Tracking

*Không có vi phạm Hiến pháp nào cần giải trình ngoại lệ.*
