# Tasks: Online Multiplayer Presence, Safe Chat, Friends, Co-op Party & Reconnect Recovery

**Input**: Design documents from `/specs/010-multiplayer-social/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/multiplayer-social-contract.md`, `quickstart.md`

**Tests**: Bao gồm kiểm thử đơn vị, tích hợp WebSocket/REST, cạnh tranh khóa (`3/4` Party race & kết bạn hai chiều), bảo mật XSS/anti-ninja-loot/anti-griefing và khôi phục ngắt kết nối `5s`/`120s`.

## Phase 1: Setup (Shared Contracts & Schemas)

**Purpose**: Định nghĩa hợp đồng giao thức dùng chung và lược đồ kiểm chứng Zod cho toàn bộ thực thể xã hội/tổ đội.

- [ ] T001 Define shared WebSocket & REST DTOs, error codes (`ERR_CHAT_RATE_LIMITED`, `ERR_PARTY_FULL`, `ERR_PARTY_BOSS_LOCKED`, `ERR_SESSION_REPLACED`, `ERR_RECONNECT_EXPIRED`) in `packages/shared/src/contracts/multiplayer-social-contracts.ts`
- [ ] T002 [P] Implement `PartyAggregate` Zod schema enforcing `PartyAggregate.partyId`, `PartyAggregate.leaderCharacterId`, `PartyAggregate.memberIds`, `PartyAggregate.lootRule`, `PartyAggregate.activeDungeonInstanceId`, and `PartyAggregate.createdAt` per `data-model.md` in `apps/game-server/src/modules/social/schemas/party-aggregate.schema.ts`
- [ ] T003 [P] Implement `CharacterSocialExtension` and `HomesteadAccessPolicy` Zod schemas enforcing `CharacterSocialExtension.partyId`, `CharacterSocialExtension.friendCharacterIds`, `CharacterSocialExtension.pendingFriendRequests`, `CharacterSocialExtension.blockedCharacterIds`, `HomesteadAccessPolicy.ownerCharacterId`, `HomesteadAccessPolicy.homesteadPermissionMode`, and `HomesteadAccessPolicy.allowedCoopActions` per `data-model.md` in `apps/game-server/src/modules/social/schemas/social-extension.schema.ts`
- [ ] T004 [P] Implement `SocialSecurityAuditEvent` schema and daily append-only audit writer (`data/db/audit/security-audit-YYYY-MM-DD.json`) enforcing `SocialSecurityAuditEvent.eventId`, `SocialSecurityAuditEvent.eventType`, `SocialSecurityAuditEvent.actorCharacterId`, `SocialSecurityAuditEvent.evidenceSnapshot`, and `SocialSecurityAuditEvent.createdAt` per `data-model.md` in `apps/game-server/src/modules/social/schemas/social-audit.schema.ts`

---

## Phase 2: Foundational (Core Social Module & Repository Plumbing)

**Purpose**: Khung module NestJS, lớp đọc/ghi `PartyRepository` trên `JsonDatabaseEngine` và vô hiệu hóa va chạm player-to-player (anti-body-blocking).

- [ ] T005 Implement `PartyRepository` persisting `PartyAggregate` snapshots to `data/db/parties/<partyId>.json` via `JsonDatabaseEngine` atomic writes & Multi-File WAL with sorted lock keys in `apps/game-server/src/modules/social/party/PartyRepository.ts`
- [ ] T006 [P] Configure player-to-player pass-through collision exclusion (no body-blocking at NPCs, portals, and dungeon entrances) in `apps/game-server/src/modules/world/CollisionRules.ts`
- [ ] T007 Register `SocialModule` wiring `PresenceRegistry`, `ChatService`, `FriendsService`, `PartyService`, `HomesteadAuthorizationGuard`, and `SessionReconnectCoordinator` in `apps/game-server/src/modules/social/social.module.ts`

**Checkpoint**: Shared contracts, JSON schemas, audit logging, and party persistence ready.

---

## Phase 3: User Story 1 - Gặp gỡ Trực tuyến, Hiện diện, Kết bạn & Trò chuyện An toàn (Priority: P1) 🎯 MVP

**Goal**: Cung cấp Presence in-process, Chat `ZONE`/`PARTY`/`SYSTEM` an toàn chống XSS & rate limit `5 msg / 10s`, báo cáo `/report`, và Friends (max 50) + Block (max 100) nguyên tử qua WAL.

**Independent Test**: 2 client online nhận `PRESENCE_UPDATE` tức thì, kết bạn nguyên tử hai chiều, chặn ẩn tin nhắn/lời mời, lọc sạch `<img onerror=...>` thành plain-text, chặn tin thứ 6 trong 10s và mute `60s` sau 3 lần vi phạm.

### Implementation for User Story 1

- [ ] T008 [P] [US1] Implement in-process `PresenceRegistry` enforcing `PresenceRecord.characterId`, `PresenceRecord.socketId`, `PresenceRecord.status`, `PresenceRecord.zoneId`, and `PresenceRecord.lastInputAtMs` (`300000 ms` `AWAY` transition + friend/party broadcast) per `data-model.md` in `apps/game-server/src/modules/social/presence/PresenceRegistry.ts`
- [ ] T009 [P] [US1] Implement `ChatSanitizer` and `ChatRingBufferStore` (`50` messages/Zone & `50`/Party in RAM) enforcing `ChatMessageRecord.msgId`, `ChatMessageRecord.channel`, `ChatMessageRecord.senderCharacterId`, `ChatMessageRecord.senderName`, `ChatMessageRecord.text` (`1..250` UTF-8 plain-text XSS sanitize), and `ChatMessageRecord.serverTs` per `data-model.md` in `apps/game-server/src/modules/social/chat/ChatSanitizer.ts` and `apps/game-server/src/modules/social/chat/ChatRingBufferStore.ts`
- [ ] T010 [P] [US1] Implement `ChatRateLimiter` (`5 msg / 10s` token bucket, `60s` auto-mute on `3` violations in `1 min` + `CHAT_RATE_MUTE` audit) and `ChatService` (including `/report` capturing `10` ring-buffer lines to `SocialSecurityAuditEvent`) in `apps/game-server/src/modules/social/chat/ChatRateLimiter.ts` and `apps/game-server/src/modules/social/chat/ChatService.ts`
- [ ] T011 [US1] Implement `FriendsService` and `SocialRestController` (`/api/v1/social/friends/*`, `/block`, `/chat/report`) with sorted-key Multi-File WAL mutual friend updates (max `50` friends, max `20` pending requests with `7-day` TTL, max `100` blocked IDs) in `apps/game-server/src/modules/social/friends/FriendsService.ts` and `apps/game-server/src/modules/social/friends/SocialRestController.ts`
- [ ] T012 [P] [US1] Implement `useSocialStore` and plain-text `ChatBoxHud` + `FriendsBlockModal` (forbidding `dangerouslySetInnerHTML`) in `apps/client/src/stores/useSocialStore.ts`, `apps/client/src/ui/hud/ChatBoxHud.tsx`, and `apps/client/src/ui/modals/FriendsBlockModal.tsx`
- [ ] T013 [US1] Add unit & WS/REST integration tests for Presence, Chat XSS/rate-limit/mute/`/report`, and mutual Friends/Block WAL atomicity (`TS-MP-04`) in `apps/game-server/tests/social/chat-and-presence.spec.ts`

**Checkpoint**: Presence, safe plain-text chat, friends, and block list operate end-to-end with zero external broker.

---

## Phase 4: User Story 2 - Lập Tổ đội 1–4 Người, Quy tắc Chia Chiến lợi phẩm Công bằng & Khởi chạy Hầm ngục (Priority: P1) 🎯 MVP

**Goal**: Cung cấp vòng đời Party `1..4` người, bảo vệ chống race `3/4` và cấm `KICK` khi đấu Boss, Ready Check `30s`, thưởng EXP `<= 800 px`, và phân phối loot `PERSONAL_INSTANCED` vs `ROUND_ROBIN` với ngưỡng đóng góp `>= 5%`.

**Independent Test**: 4 client lập Party, bắn đồng thời 2 `ACCEPT` tại `3/4` (chỉ 1 vào), xác nhận cấm `KICK` giữa trận Boss, kiểm tra Healer/Tank đạt `>= 5%` đóng góp nhận loot riêng và chặn mọi `LOOT_PICKUP_REQ` của người khác.

### Implementation for User Story 2

- [ ] T014 [US2] Implement `PartyService` handling `CREATE`, `INVITE` (`30s` TTL, `15s` post-`DECLINE` cooldown), `ACCEPT` (sorted lock `["character:<id>", "party:<partyId>"]` preventing `3/4` overflow), `DECLINE`, `LEAVE`, `KICK` (blocked during active Boss fight), `TRANSFER_LEADER` (manual & auto), `SET_LOOT_RULE` (out-of-combat only), and auto-disband deleting `parties/<partyId>.json` in `apps/game-server/src/modules/social/party/PartyService.ts`
- [ ] T015 [P] [US2] Implement `ReadyCheckCoordinator` (`30s` server countdown, dungeon level verification, instant cancellation on leader/member disconnect or decline) in `apps/game-server/src/modules/social/party/ReadyCheckCoordinator.ts`
- [ ] T016 [US2] Implement `PartyLootExpService` enforcing `PERSONAL_INSTANCED` default, `ROUND_ROBIN` common-only open-world rule (forcing `RARE`+/`BOSS_TOKEN`/Boss drops to `PERSONAL_INSTANCED`), `>= 5%` damage/healing/mitigation eligibility, atomic RAM-delete-before-WAL loot pickup (`<= 96 px`, `120s` TTL, `UNAUTHORIZED_LOOT_PICKUP` audit), and open-world EXP bonus (`+10%`/nearby member up to `+30%` within `<= 800 px`) in `apps/game-server/src/modules/social/party/PartyLootExpService.ts`
- [ ] T017 [P] [US2] Wire `CHAT_SEND`, `PARTY_ACTION`, `LOOT_PICKUP_REQ`, and `SNAPSHOT_RESYNC_REQ` (`1 / 2s` rate limit) in `apps/game-server/src/modules/social/gateway/SocialRealtimeGateway.ts`
- [ ] T018 [P] [US2] Implement `PartyMiniListHud` and `PartyModal` (displaying server-timed `30s` Ready Check, loot rule badge, and member reconnect countdown) in `apps/client/src/ui/hud/PartyMiniListHud.tsx` and `apps/client/src/ui/modals/PartyModal.tsx`
- [ ] T019 [US2] Add concurrency & anti-ninja-loot integration tests (`TS-MP-01`, `TS-MP-02`, `TS-MP-06`) in `apps/game-server/tests/social/friends-and-party.spec.ts`

**Checkpoint**: Full 1–4 player Party, Ready Check, fair loot, and anti-AFK EXP sharing operational independently.

---

## Phase 5: User Story 3 - Hợp tác Canh tác tại Lãnh địa Có Chống Phá hoại (Priority: P2)

**Goal**: Bảo vệ Lãnh địa bật `PARTY_ACCESS` bằng whitelist hành động hợp tác cứng và cơ chế đẩy khách an toàn khi thu hồi quyền.

**Independent Test**: Thành viên Party vào lãnh địa chủ nhà bật `PARTY_ACCESS` thực hiện được `WATER`/`FERTILIZE`/`FEED`/`PET`/`COOK`/`TRAIN`, nhưng bị từ chối `403 ERR_FORBIDDEN_OWNERSHIP` với `HARVEST`/`COLLECT`/`BUILD`/`DEMOLISH`/`STORAGE_ACCESS`/`ENHANCE`, và bị đưa về `zon_greenhaven_square` ngay khi chủ nhà tắt về `OWNER_ONLY`.

### Implementation for User Story 3

- [ ] T020 [US3] Implement `HomesteadAuthorizationGuard` enforcing `HomesteadAccessPolicy.ownerCharacterId`, `HomesteadAccessPolicy.homesteadPermissionMode`, and strict whitelist `HomesteadAccessPolicy.allowedCoopActions` (deducting `COOK` ingredients from visitor inventory, awarding `+5` farming assist EXP, auditing denied actions as `HOMESTEAD_GRIEF_ATTEMPT`) in `apps/game-server/src/modules/social/homestead/HomesteadAuthorizationGuard.ts`
- [ ] T021 [US3] Implement `PATCH /api/v1/characters/:charId/homestead/permissions` and immediate visitor ejection (`ZONE_TRANSITION` to `zon_greenhaven_square` on mode switch to `OWNER_ONLY` or party leave/kick) in `apps/game-server/src/modules/social/friends/SocialRestController.ts` and `apps/game-server/src/modules/social/homestead/HomesteadAuthorizationGuard.ts`
- [ ] T022 [US3] Add anti-griefing integration tests (`TS-MP-03`) verifying all allowed vs forbidden actions and instant ejection in `apps/game-server/tests/social/homestead-anti-grief.spec.ts`

**Checkpoint**: Co-op Homestead farming works safely with zero griefing surface.

---

## Phase 6: User Story 4 - Kiên cường Khi Ngắt kết nối & Khôi phục Phiên 120 Giây (Priority: P2)

**Goal**: Thực thi Single Active Session, `5s` Combat Logout Grace chống thoát nóng, flush JSON ngay khi ngắt, giữ suất Party/Dungeon `120s`, tự chuyển Leader quá hạn và `SESSION_RESUME`.

**Independent Test**: Ngắt mạng giữa trận (chịu đòn đủ `5s`), nối lại sau `30s` phục hồi đúng Party/Dungeon + `0` dupe; chờ quá `120s` tự nhả slot + chuyển Đội trưởng; mở tab thứ 2 đá socket cũ bằng `ERR_SESSION_REPLACED`.

### Implementation for User Story 4

- [ ] T023 [US4] Implement `SessionReconnectCoordinator` enforcing `SessionReconnectHold.characterId`, `SessionReconnectHold.inCombatAtDisconnect`, `SessionReconnectHold.combatGraceEndsAtMs` (`5000 ms`), `SessionReconnectHold.slotHoldExpiresAtMs` (`120000 ms`), `SessionReconnectHold.reservedPartyId`, `SessionReconnectHold.reservedDungeonInstanceId`, and `SessionReconnectHold.lastProcessedSeq` per `data-model.md`, including Single Active Session (`ERR_SESSION_REPLACED` + `SESSION_REPLACED` audit), immediate dirty JSON flush, auto leader transfer after `120s`, and `SESSION_RESUME` JWT/session validation in `apps/game-server/src/modules/social/reconnect/SessionReconnectCoordinator.ts`
- [ ] T024 [P] [US4] Implement client `ReconnectManager` (exponential backoff `1s -> 2s -> 4s -> 8s`, max 5 attempts, `SESSION_RESUME` handshake) and non-obtrusive `ReconnectBanner` (`120s` countdown) in `apps/client/src/network/ReconnectManager.ts` and `apps/client/src/ui/hud/ReconnectBanner.tsx`
- [ ] T025 [US4] Add disconnect/reconnect, combat-grace, single-session replacement, and network impairment integration tests (`TS-MP-05`, `TS-MP-07`) in `apps/game-server/tests/social/disconnect-reconnect.spec.ts`

**Checkpoint**: Disconnect resilience and anti-combat-logging verified independently.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T026 [P] Add WebSocket oversized frame (`> 16 KB`) & prototype-pollution key (`__proto__`, `constructor`, `prototype`) guard logging `WS_FLOOD_DISCONNECT` in `apps/game-server/src/modules/social/gateway/SocialRealtimeGateway.ts`
- [ ] T027 Run full `quickstart.md` validation checklist and verify zero Redis/external-DB/third-party chat dependencies across `apps/game-server/src/modules/social/` and `apps/client/src/stores/useSocialStore.ts`

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → blocks User Stories 1–4.
- **US1 (Presence/Chat/Friends)** and **US2 (Party/Loot/Ready Check)** are both `P1` MVP priorities and can advance in parallel after Phase 2 (US2 integrates `PresenceRegistry` from US1 for online invite checks).
- **US3 (Homestead `PARTY_ACCESS`)** depends on US2 (`PartyService` membership verification).
- **US4 (Disconnect/Reconnect `5s`/`120s`)** integrates with US1 (`PresenceRegistry`) and US2 (`PartyService` slot hold & leader failover).
