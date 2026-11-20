# Tasks: Self-Hosted Local Authentication & Character Management

**Input**: Design documents from `/specs/002-auth-character/`

**Prerequisites**: `001-foundation-game-engine`, `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/auth-character-contract.md`

## Phase 1: Setup & Shared Contracts

- [ ] T001 Define Zod DTOs and error codes for auth and character APIs in `packages/shared/src/contracts/auth-character.dto.ts`
- [ ] T002 [P] Implement pure `StatCalculator` (derived stats, hard caps `CritRate <= 75%`, `CDR <= 40%`, `CombatRating`) per `docs/balancing/combat-formulas.md` in `packages/shared/src/math/stat-calculator.ts`

## Phase 2: Foundational Security Primitives

- [ ] T003 Implement `PasswordService` (`crypto.scrypt` + `timingSafeEqual`) enforcing `Account.passwordHash` format per `data-model.md` in `apps/game-server/src/modules/identity/password.service.ts`
- [ ] T004 [P] Implement `JwtAuthGuard`, `OwnershipGuard`, and in-process IP rate limiter (`5 req/min`) in `apps/game-server/src/modules/identity/guards/jwt-auth.guard.ts` and `apps/game-server/src/modules/identity/guards/ownership.guard.ts`
- [ ] T005 [P] Implement `SecurityAuditLogger` writing append-only JSON entries to `data/db/audit/security-audit-YYYY-MM-DD.json` in `apps/game-server/src/core/security/security-audit.logger.ts`

## Phase 3: User Story 1 - Đăng ký, Đăng nhập & Duy trì Phiên Cục bộ An toàn (Priority: P1) 🎯 MVP

**Goal**: Xác thực cục bộ hoàn chỉnh lưu JSON với xoay vòng Refresh Token, phát hiện tái sử dụng phiên và khóa brute-force.

**Independent Test**: Pass `TS-AUTH-001`..`TS-AUTH-003`, `SEC-003`, `SEC-004` trên thư mục JSON test cục bộ.

- [ ] T006 [P] [US1] Implement `AccountRepository` enforcing `Account.accountId`, `Account.username`, `Account.email`, `Account.passwordHash`, `Account.role`, `Account.status`, `Account.failedLoginAttempts`, `Account.lockedUntil`, and `Account.characterIds` per `data-model.md` in `apps/game-server/src/modules/identity/account.repository.ts`
- [ ] T007 [P] [US1] Implement `SessionService` enforcing `Session.sessionId`, `Session.accountId`, `Session.refreshTokenHash`, `Session.revoked`, `Session.rotatedToSessionId`, and `Session.expiresAt` per `data-model.md` (with token-reuse full revocation) in `apps/game-server/src/modules/identity/session.service.ts`
- [ ] T008 [US1] Implement `AuthController` (`/register`, `/login`, `/refresh`, `/logout`, brute-force lockout 8 fails -> 15 min) in `apps/game-server/src/modules/identity/auth.controller.ts`
- [ ] T009 [P] [US1] Build `useAuthStore` and `LoginRegisterScreen` (with loading, validation error, lockout countdown states) in `apps/client/src/stores/useAuthStore.ts` and `apps/client/src/ui/screens/LoginRegisterScreen.tsx`
- [ ] T010 [US1] Add API and security tests (`TS-AUTH-001`..`003`, `SEC-003`, `SEC-004`) in `apps/game-server/tests/identity/auth.e2e-spec.ts`

## Phase 4: User Story 2 - Tạo Nhân vật Khởi đầu & Chọn Nhân vật (Priority: P1)

**Goal**: Cho phép tạo tối đa 4 nhân vật chọn từ 3 starter hero MVP bằng giao dịch WAL nguyên tử khởi tạo đồng thời Character + Inventory + Homestead + Indexes.

**Independent Test**: Tạo nhân vật mới kiểm tra đủ 3 tệp aggregate + index, thử tạo nhân vật thứ 5 bị chặn `409`.

- [ ] T011 [P] [US2] Implement `CharacterRepository` enforcing `Character.characterId`, `Character.accountId`, `Character.name`, `Character.activeHeroId`, `Character.unlockedHeroIds`, `Character.level`, `Character.exp`, `Character.attributePointsFree`, `Character.skillPointsFree`, `Character.stats`, and `Character.combatRating` per `data-model.md` in `apps/game-server/src/modules/character/character.repository.ts`
- [ ] T012 [US2] Implement `CharacterInitializerService` executing atomic WAL creation (Account update + Character + starter Inventory + starter Homestead + name/account JSON indexes) in `apps/game-server/src/modules/character/character-initializer.service.ts`
- [ ] T013 [US2] Implement character list/create/summary endpoints in `apps/game-server/src/modules/character/character.controller.ts`
- [ ] T014 [P] [US2] Build `CharacterSelectScreen` and `StarterCreateScreen` (3 MVP starters preview) in `apps/client/src/ui/screens/CharacterSelectScreen.tsx` and `apps/client/src/ui/screens/StarterCreateScreen.tsx`
- [ ] T015 [US2] Add atomic character creation and ownership rejection tests (`TS-AUTH-004`, `SEC-005`) in `apps/game-server/tests/character/character-creation.spec.ts`

## Phase 5: User Story 3 - Phân bổ Thuộc tính, Nâng cấp Kỹ năng & Đổi Hero (Priority: P2)

**Goal**: Cho phép phân bổ điểm thuộc tính, tẩy điểm có phí Gold, nâng bậc kỹ năng và đổi hero trong vùng an toàn.

**Independent Test**: Phân bổ điểm tính lại đúng `derivedSnapshot`/`combatRating`; đổi hero bị từ chối khi ngoài Safe Zone hoặc đang combat.

- [ ] T016 [US3] Implement stat allocation, Gold respec, skill rank upgrade, and safe-zone `switchHero` logic in `apps/game-server/src/modules/character/character.service.ts`
- [ ] T017 [US3] Expose `/allocate-stats`, `/skills/upgrade`, and `/switch-hero` endpoints with `OwnershipGuard` and `X-Idempotency-Key` in `apps/game-server/src/modules/character/character.controller.ts`
- [ ] T018 [US3] Add unit & integration tests for stat caps, negative allocation rejection, and combat hero-switch lock in `apps/game-server/tests/character/progression.spec.ts`

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T019 Enforce single-active-session replacement hook between `SessionService` and WebSocket `SessionRegistry` in `apps/game-server/src/modules/identity/session.service.ts`
- [ ] T020 Run `quickstart.md` validation checklist end-to-end

## Dependencies & Execution Order
- Depends on `001-foundation-game-engine`.
- Phase 1 → Phase 2 → US1 (`T006..T010`) → US2 (`T011..T015`) → US3 (`T016..T018`) → Polish.
