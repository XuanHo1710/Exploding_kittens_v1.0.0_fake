# Tasks: Fair In-Game Gacha, Pity & Hero/Weapon Collection System

**Input**: Design documents from `/specs/009-gacha-collection/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/gacha-collection-contract.md`, `quickstart.md`

**Tests**: Bao gồm các kiểm thử tự động trọng yếu (CSPRNG 100k distribution, Hard/Soft Pity 80/70, 10-pull EPIC+, Limited 50/50 guarantee, duplicate C0..C6 & overflow, monthly Star Essence cap, 20-concurrent pull race & WAL crash recovery).

## Phase 1: Setup (Shared Contracts & Fail-Fast Banner Catalog Schema)

**Purpose**: Định nghĩa hợp đồng API dùng chung và lược đồ kiểm chứng fail-fast cho `game-data/gacha-banners.json` (tổng xác suất `=== 1.000000`, `realMoneyPurchaseEnabledInMvp === false`).

- [ ] T001 Define shared REST DTOs, banner disclosure shapes, codex responses, and canonical gacha error codes in `packages/shared/src/contracts/gacha-collection-contracts.ts`
- [ ] T002 [P] Implement Zod fail-fast banner catalog validator enforcing `GachaBannerConfig.id`, `GachaBannerConfig.bannerType`, `GachaBannerConfig.rewardCategory`, `GachaBannerConfig.sharedPityGroup`, `GachaBannerConfig.active`, `GachaBannerConfig.schedule`, `GachaBannerConfig.cost`, `GachaBannerConfig.pity`, `GachaBannerConfig.baseRates`, `GachaBannerConfig.featured`, and `GachaBannerConfig.pool` per `data-model.md` (plus `sum(baseRates) === 1.000000`, `realMoneyPurchaseEnabledInMvp === false`, `cashOutAllowed === false`) in `packages/game-config/src/schemas/gacha-banner-catalog.schema.ts`

---

## Phase 2: Foundational (Persistent JSON Schemas, History Repository & CSPRNG Probability Engine)

**Purpose**: Lược đồ lưu trữ JSON cục bộ cho trạng thái Pity, Lịch sử quay, Tiến độ sưu tập, Giao dịch đổi `STAR_ESSENCE` và động cơ CSPRNG lõi bắt buộc trước mọi User Story.

- [ ] T003 [P] Implement persistent JSON schemas enforcing `GachaPityState.sharedPityGroup`, `GachaPityState.totalPulls`, `GachaPityState.pityCounter`, `GachaPityState.epicPityCounter`, `GachaPityState.guaranteedFeatured`, `GachaPityState.lastPullAt`, `GachaHistoryRecord.pullTxId`, `GachaHistoryRecord.idempotencyKey`, `GachaHistoryRecord.characterId`, `GachaHistoryRecord.bannerId`, `GachaHistoryRecord.sharedPityGroup`, `GachaHistoryRecord.pullCount`, `GachaHistoryRecord.currencySpent`, `GachaHistoryRecord.pityBefore`, `GachaHistoryRecord.pityAfter`, `GachaHistoryRecord.results`, `GachaHistoryRecord.rngAuditSeedHash`, `GachaHistoryRecord.createdAt`, `GachaPullItemResult.pullIndex`, `GachaPullItemResult.rewardType`, `GachaPullItemResult.rewardId`, `GachaPullItemResult.rarity`, `GachaPullItemResult.isFeatured`, `GachaPullItemResult.isDuplicate`, `GachaPullItemResult.conversionReward`, `CollectionProgress.unlockedHeroIds`, `CollectionProgress.heroConstellations`, `CollectionProgress.unlockedWeaponIds`, `CollectionProgress.starEssenceMonthlyPurchases`, `StarEssenceExchangeTx.exchangeTxId`, `StarEssenceExchangeTx.idempotencyKey`, `StarEssenceExchangeTx.offerId`, `StarEssenceExchangeTx.monthKey`, `StarEssenceExchangeTx.costStarEssence`, and `StarEssenceExchangeTx.purchasedCountInMonth` per `data-model.md` in `apps/game-server/src/modules/gacha/schemas/gacha-state.schema.ts`
- [ ] T004 [P] Implement `GachaHistoryRepository` managing `data/db/history/gacha-history-<characterId>.json` (paginated reverse-order queries filtered by `bannerId`, optional 1,000-record local archive rotation) via `JsonDatabaseEngine` in `apps/game-server/src/modules/gacha/GachaHistoryRepository.ts`
- [ ] T005 Implement `GachaProbabilityEngine` using Node.js `crypto.randomInt(0, 1_000_000)` (zero `Math.random`), exact integer cumulative thresholds, linear Soft Pity (`65→80` Hero / `55→70` Weapon), `25%/75%` `MYTHIC/LEGENDARY` conditional split, `epicPity = 10` guarantee, `50/50` Limited Banner Featured guarantee, and SHA-256 `rngAuditSeedHash` generation in `apps/game-server/src/modules/gacha/GachaProbabilityEngine.ts`

**Checkpoint**: Fail-fast banner catalog validation, JSON persistence schemas, history store, and CSPRNG probability engine ready.

---

## Phase 3: User Story 1 - Quay Banner Nhân vật & Vũ khí Thường trực Công bằng 100% Nội tệ (Priority: P1) 🎯 MVP

**Goal**: Cho phép công khai toàn bộ bảng xác suất & trạng thái Pity của `bnr_perm_heroes` và `bnr_perm_arsenal`, thực hiện quay `1x` (`160`) / `10x` (`1,600`) bằng `STARLIGHT_SHARD` qua giao dịch WAL 4 tệp nguyên tử chống gửi đồng thời.

**Independent Test**: Kiểm thử `GET /gacha/banners` (công khai đầy đủ xác suất `sum = 1.0`), `POST /gacha/pull` (`1x` & `10x` bảo đảm `EPIC+`), Hard Pity `80`/`70`, và 100k-pull Monte Carlo hội tụ trong `<= 0.25%`.

### Implementation for User Story 1

- [ ] T006 [US1] Implement `GachaService` (`listBannersWithDisclosure`, `executePull`) enforcing `count ∈ {1, 10}`, active/schedule validation, `STARLIGHT_SHARD` balance check (`160`/`1600`), inventory capacity pre-check, sorted `AsyncLockManager` locks (`character`, `inventory`, `ledger`), 4-file atomic WAL commit (`characters`, `inventories`, `history`, `currency-ledger`), and `idempotencyKey` replay in `apps/game-server/src/modules/gacha/GachaService.ts`
- [ ] T007 [US1] Implement `GachaController` (`GET /api/v1/gacha/banners`, `POST /api/v1/characters/:charId/gacha/pull`) with JWT ownership guard and mandatory `X-Idempotency-Key` header enforcement in `apps/game-server/src/modules/gacha/GachaController.ts`
- [ ] T008 [P] [US1] Implement `useGachaStore` Zustand store and `GachaModal` + `GachaRateDisclosureModal` React components (displaying full 6-tier rates summing to `100.00%`, `pityCounter / hardPity`, 1x/10x pull controls, skippable non-flashing reveal animation, zero dark patterns) in `apps/client/src/stores/useGachaStore.ts`, `apps/client/src/ui/modals/GachaModal.tsx`, and `apps/client/src/ui/modals/GachaRateDisclosureModal.tsx`
- [ ] T009 [US1] Add CSPRNG unit & 100,000-pull statistical convergence tests covering Soft/Hard Pity (`65/80` & `55/70`), `10-pull EPIC+`, `25%/75%` split, and Limited `50/50` guarantee (`TS-GAC-001`, `TS-GAC-002`) in `apps/game-server/tests/gacha/gacha-probability.spec.ts`

**Checkpoint**: Fair in-game permanent character & weapon gacha MVP operational with full rate disclosure and atomic WAL commits.

---

## Phase 4: User Story 2 - Chuyển đổi Trùng lặp Minh bạch, Cửa hàng `STAR_ESSENCE` & Sổ tay Bộ sưu tập (Priority: P1) 🎯 MVP

**Goal**: Tự động chuyển đổi nhân vật/vũ khí trùng lặp theo bảng `duplicateConversion`, vận hành Cửa hàng `STAR_ESSENCE` (16 ưu đãi có giới hạn tháng UTC) và cung cấp Sổ tay Bộ sưu tập (12 Hero & 40 Weapon Codex).

**Independent Test**: Kiểm thử trùng nhân vật `C0..C6` và tràn `C6` (`+mat_starlight_dust`), trùng vũ khí (giữ bản thể + `STAR_ESSENCE` + `CRAFTING_TOKEN`), đổi ưu đãi Cửa hàng `STAR_ESSENCE` tôn trọng `limitPerMonth`, và cập nhật Codex chính xác.

### Implementation for User Story 2

- [ ] T010 [P] [US2] Implement `DuplicateConversionService` reading `game-data/gacha-banners.json#duplicateConversion` to apply character Constellation (`0..6`), `C6` overflow double `STAR_ESSENCE` + `mat_starlight_dust`, and weapon instance retention + `STAR_ESSENCE`/`CRAFTING_TOKEN` inside `GachaService` transactions in `apps/game-server/src/modules/gacha/DuplicateConversionService.ts`
- [ ] T011 [P] [US2] Implement `StarEssenceShopService` enforcing server UTC `monthKey`, `offer.limitPerMonth`, inventory capacity pre-check, sorted WAL commit (`STAR_ESSENCE_EXCHANGE` ledger entry), and duplicate conversion if redeeming an owned hero in `apps/game-server/src/modules/gacha/StarEssenceShopService.ts`
- [ ] T012 [P] [US2] Implement `CollectionCodexService` assembling Hero (`12`) and Weapon (`40`) collection completion percentages, Constellation levels, lore, and non-gacha acquisition sources from `game-data/characters.json` & `items.json` in `apps/game-server/src/modules/gacha/CollectionCodexService.ts`
- [ ] T013 [US2] Extend `GachaController` with `POST /api/v1/characters/:charId/gacha/exchange` and `GET /api/v1/characters/:charId/collection` in `apps/game-server/src/modules/gacha/GachaController.ts`
- [ ] T014 [P] [US2] Implement `StarEssenceShopModal` (showing monthly remaining limits, UTC reset timer, target hero/weapon redemption) and `CollectionCodexModal` (class/element/rarity/weaponType filters, Constellation display, non-gacha sources) in `apps/client/src/ui/modals/StarEssenceShopModal.tsx` and `apps/client/src/ui/modals/CollectionCodexModal.tsx`

**Checkpoint**: Duplicate conversion, Star Essence pity-safety shop, and Hero/Weapon Codex complete.

---

## Phase 5: User Story 3 - Banner Giới hạn, Lịch sử Quay Minh bạch & Chống Gian lận Đồng thời (Priority: P2)

**Goal**: Hoàn thiện API phân trang lịch sử quay, xác thực vòng đời Banner Giới hạn (`sharedPityGroup` + `50/50`), đấu nối `GachaModule` và chứng minh khả năng chịu 20 request đồng thời + crash recovery WAL.

**Independent Test**: Chạy bài test bắn 20 POST 10-pull đồng thời khi chỉ có `1,600 STARLIGHT_SHARD` (`TS-GAC-004`), kiểm chứng phân trang lịch sử quay, bảo lưu pity giữa 2 banner thuộc `LIMITED_CHARACTER`, và phục hồi sạch sau giả lập crash WAL `PREPARED`.

### Implementation for User Story 3

- [ ] T015 [US3] Extend `GachaController` with `GET /api/v1/characters/:charId/gacha/history` (`bannerId`, `page`, `limit <= 50`) and wire `GachaModule` registering all gacha/codex/shop services in `apps/game-server/src/modules/gacha/GachaController.ts` and `apps/game-server/src/modules/gacha/gacha.module.ts`
- [ ] T016 [P] [US3] Implement `GachaHistoryModal` displaying paginated pull history, `pityBefore → pityAfter`, duplicate conversion badges, and server UTC timestamps in `apps/client/src/ui/modals/GachaHistoryModal.tsx`
- [ ] T017 [US3] Add integration, duplicate-conversion (`TS-GAC-003`), monthly shop cap, Limited Banner `sharedPityGroup` carry-over, 20-concurrent-pull race (`TS-GAC-004`), idempotency replay, and 4-file WAL crash recovery tests in `apps/game-server/tests/gacha/gacha-atomic-concurrency.spec.ts`
- [ ] T018 [P] [US3] Add Vitest UI tests verifying public rate sum `100.00%`, pity counter rendering, skip-animation toggle, and monthly shop limit disabled states in `apps/client/tests/gacha-ui.spec.ts`

**Checkpoint**: Full fair gacha, limited banner architecture, transparent history, and concurrency protection complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T019 Emit `GachaPulled` and `HeroUnlocked` events on `InternalEventBus` (for collection achievements & hero-switch eligibility in `002-auth-character`) in `apps/game-server/src/modules/gacha/GachaService.ts`
- [ ] T020 Run `quickstart.md` validation suite confirming `0` real-money payment paths, `sum(baseRates) === 1.000000`, `0` external DB/third-party calls, and 100% alignment with `game-data/gacha-banners.json`

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → blocks User Stories 1, 2, 3.
- **US1 (Permanent Banners & Atomic Pull)** and **US2 (`DuplicateConversionService`, `StarEssenceShopService`, `CollectionCodexService`)** can be developed largely in parallel after Phase 2, with `DuplicateConversionService` plugged directly into `GachaService.executePull`.
- **US3 (History UI, Limited Banner Tests & Concurrency Suite)** finalizes module wiring and full anti-cheat verification.
- **MVP First**: Complete Phases 1–4 (`US1` + `US2`) to launch `bnr_perm_heroes`, `bnr_perm_arsenal`, duplicate conversion, `STAR_ESSENCE` shop, and Codex using 100% in-game `STARLIGHT_SHARD`, then finalize Phase 5 (`US3`) audit & concurrency tests.
