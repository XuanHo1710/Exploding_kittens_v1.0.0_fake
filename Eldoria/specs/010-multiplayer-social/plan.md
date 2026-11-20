# Implementation Plan: Online Multiplayer Presence, Safe Chat, Friends, Co-op Party & Reconnect Recovery

**Branch**: `010-multiplayer-social` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-multiplayer-social/spec.md`

## Summary

Triển khai trọn bộ hạ tầng tương tác nhiều người chơi PvE/Co-op tự chủ trong Modular Monolith NestJS + client React/Phaser: (1) `PresenceRegistry` in-process và `ChatService` an toàn chống XSS (`1..250` ký tự, token bucket `5 msg / 10s`, tự mute `60s`, RAM ring-buffer `50` tin/kênh, audit `/report`); (2) `FriendsService` & `BlockService` (trần `50` bạn / `20` lời mời / `100` chặn) cập nhật hai chiều qua Multi-File JSON WAL; (3) `PartyService` (`1..4` thành viên, ảnh chụp `data/db/parties/<partyId>.json`, Ready Check `30s`, cấm `KICK` khi đấu Boss, `PERSONAL_INSTANCED` vs `ROUND_ROBIN`, thưởng chia EXP `<= 800 px`); (4) `HomesteadAuthorizationGuard` bảo vệ `PARTY_ACCESS` theo whitelist chống phá hoại; và (5) `SessionReconnectCoordinator` thực thi Single Active Session, `5s` Combat Logout Grace và `120s` Party/Dungeon slot reservation kèm `SESSION_RESUME`.

## Technical Context

**Language/Version**: TypeScript 5.x trên Node.js 22 LTS

**Primary Dependencies**: NestJS 11, Socket.IO / `ws` (`/game` namespace), Zod, `JsonDatabaseEngine` (từ `001`), React 19, Zustand (`useSocialStore`), Phaser 3 (`WorldScene` remote entity sync)

**Storage**: 100% Local JSON Primary Persistent DB (`data/db/parties/<partyId>.json`, `data/db/characters/<characterId>.json`, `data/db/houses/<characterId>.json`, `data/db/audit/security-audit-YYYY-MM-DD.json`) + **Local Docker Redis (`redis:7-alpine`)** cho Ephemeral Presence (`eldoria:presence:*`), Party Invites TTL `60s` (`eldoria:party:invite:*`), Chat Rate-Limit & Zone Pub/Sub (`eldoria:pubsub:zone:*`) kèm degraded RAM fallback — ZERO External DB / ZERO Third-Party Chat/Presence SaaS

**Testing**: Jest + Supertest (REST Friends/Block/Homestead guards, concurrency `3/4` Party race & mutual friend WAL tests), Socket.IO/`ws` Integration Test Client (Chat XSS/rate-limit, `5s`/`120s` disconnect/reconnect, Redis restart resilience, anti-ninja-loot), Vitest (client `useSocialStore` & plain-text chat renderer)

**Target Platform**: Desktop Web Browser (Chrome/Edge/Firefox mới nhất) + Self-Hosted Local Docker Compose Stack (`eldoria-server` + `redis` + `minio`)

**Project Type**: Monorepo Web Game (`apps/game-server`, `apps/client`, `packages/shared`)

**Performance Goals**: Chat delivery latency `< 200 ms` trên mạng nội bộ, 10 Hz Delta Snapshot interest management qua `SpatialHashGrid`, mục tiêu `50 CCU` ổn định cho MVP (`proposed / unverified`)

**Constraints**: Cấm tuyệt đối DBMS ngoài/dịch vụ chat đám mây bên thứ ba; Local Redis chỉ lưu trạng thái tạm có TTL và fallback RAM an toàn; cấm `dangerouslySetInnerHTML`; cấm ghi đĩa theo từng tin nhắn chat hay từng tick presence; mọi giao dịch đa thực thể dùng sorted lock keys trong `AsyncLockManager`

**Scale/Scope**: Phạm vi MVP PvE/Co-op (`ZONE`, `PARTY`, `SYSTEM` chat; Friends max 50; Block max 100; Party 1..4; Homestead `PARTY_ACCESS`); hậu MVP (M2–M4) mở rộng `WHISPER`, `GUILD`, 2-step WAL `Trade` và Opt-in PvP

## Constitution Check (Constitution v2.0.0)

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design & v2.0.0 cross-check.*

| Nguyên tắc Hiến pháp | Kiểm tra Trước Thiết kế | Kiểm tra Sau Thiết kế (v2.0.0) | Ghi chú |
| :--- | :---: | :---: | :--- |
| **I. JSON-Only Primary Persistent DB + Local Docker Redis & MinIO** | PASS | PASS | Persistent Friends/Party/Audit 100% tại `data/db/**/*.json`; Local Docker Redis chỉ tăng tốc Presence/Invites TTL/RateLimit/PubSub kèm RAM fallback theo `013` / `ADR-007`; 0 dịch vụ đám mây ngoài |
| **II. Server-Authoritative & Anti-Cheat** | PASS | PASS | Server kiểm tra XSS/rate-limit chat, sở hữu loot `<= 96 px`, whitelist Homestead, cấm kick khi đấu Boss, `5s` Combat Grace |
| **III. Data-Driven Single Source of Truth** | PASS | PASS | Đọc quyền công trình từ `game-data/buildings.json` và bảng loot từ `game-data/loot-tables.json` |
| **IV. Modular Monolith & Decoupled Simulation** | PASS | PASS | Module `social`, `party`, `presence`, `chat`, `reconnect` tách sạch; chat/presence không gây disk I/O trong tick 20 Hz |
| **V. Classic 16-Bit Pixel-Perfect Visual Cohesion** | PASS | PASS | Đồng bộ `animState`/`facing` gọn nhẹ; Party HUD & Chat tôn trọng Safe-Area Combat Box |
| **VI. Fair Progression & Meaningful Loops** | PASS | PASS | `PERSONAL_INSTANCED` triệt tiêu ninja-loot; tính đóng góp hồi máu/chặn đòn `>= 5%` bảo vệ Healer & Tank |
| **VII. Spec-Driven & Vertical-Slice MVP** | PASS | PASS | Giới hạn rõ phạm vi MVP PvE/Co-op; giữ chế độ `DESIGN_AND_PLANNING_ONLY` |
| **VIII. Verifiable Quality Gates & Evidence Integrity** | PASS | PASS | Gắn nhãn `proposed / unverified` cho mọi mục tiêu CCU và latency; không tuyên bố MMO-scale |

## Project Structure

### Documentation (this feature)

```text
specs/010-multiplayer-social/
├── spec.md                              # Feature specification + Clarifications
├── plan.md                              # This file
├── research.md                          # Phase 0 research decisions
├── data-model.md                        # Canonical JSON & RAM entities + 36 constrained fields
├── quickstart.md                        # End-to-end validation guide
├── contracts/
│   └── multiplayer-social-contract.md   # WS & REST social/party/reconnect contracts
├── checklists/
│   ├── requirements.md                  # 16-item spec quality checklist (validated)
│   └── social-safety.md                 # 12-item domain safety review checklist
├── tasks.md                             # Dependency-ordered implementation tasks
└── analysis-report.md                   # Cross-artifact /speckit-analyze audit
```

### Source Code (repository root — Planned Layout for Implementation Phase)

```text
packages/shared/src/
└── contracts/
    └── multiplayer-social-contracts.ts  # Zod schemas cho WS/REST social, party, chat, reconnect

apps/game-server/src/
└── modules/
    └── social/
        ├── social.module.ts
        ├── schemas/
        │   ├── party-aggregate.schema.ts
        │   ├── social-extension.schema.ts
        │   └── social-audit.schema.ts
        ├── presence/
        │   └── PresenceRegistry.ts
        ├── chat/
        │   ├── ChatSanitizer.ts
        │   ├── ChatRingBufferStore.ts
        │   ├── ChatRateLimiter.ts
        │   └── ChatService.ts
        ├── friends/
        │   ├── FriendsService.ts
        │   └── SocialRestController.ts
        ├── party/
        │   ├── PartyRepository.ts
        │   ├── PartyService.ts
        │   ├── ReadyCheckCoordinator.ts
        │   └── PartyLootExpService.ts
        ├── homestead/
        │   └── HomesteadAuthorizationGuard.ts
        ├── reconnect/
        │   └── SessionReconnectCoordinator.ts
        └── gateway/
            └── SocialRealtimeGateway.ts
apps/game-server/tests/social/
├── chat-and-presence.spec.ts
├── friends-and-party.spec.ts
├── homestead-anti-grief.spec.ts
└── disconnect-reconnect.spec.ts

apps/client/src/
├── network/
│   └── ReconnectManager.ts
├── stores/
│   └── useSocialStore.ts
└── ui/
    ├── hud/
    │   ├── ChatBoxHud.tsx
    │   ├── PartyMiniListHud.tsx
    │   └── ReconnectBanner.tsx
    └── modals/
        ├── PartyModal.tsx
        └── FriendsBlockModal.tsx
```

**Structure Decision**: Tích hợp module `social` trực tiếp trong Modular Monolith `apps/game-server/src/modules/social/` dùng chung `JsonDatabaseEngine`, `AsyncLockManager`, `ZoneManager` và `GameGateway`, đồng bộ với `useSocialStore` bên `apps/client` qua hợp đồng chặt ở `packages/shared`.

## Complexity Tracking

*Không có vi phạm Hiến pháp nào cần giải trình ngoại lệ.*
