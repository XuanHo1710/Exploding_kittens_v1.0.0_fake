# Implementation Plan & Tasks: Quests, Onboarding (`OB-1..OB-8`) & NPC Dialogue (`014`)

**Reference**: `specs/014-quests-onboarding/spec.md`, `game-data/quests.json`, `apps/game-server/src/modules/gameplay/quest-social.service.ts`, `apps/client/src/ui/SocialQuestAndSystemModals.tsx`

## Architecture Summary
- **Persistence**: Lưu mảng `CharacterEntity.quests[]` trong `data/db/characters/<characterId>.json`; phần thưởng `GOLD` và `STARLIGHT_SHARD` ghi đồng thời vào `data/db/ledgers/currency-ledger-<characterId>-<YYYY-MM>.json` trong cùng giao dịch WAL 2PC.
- **Hook Integration**: `EconomyInventoryService.incrementQuestProgress()` được gọi trực tiếp từ Farming, Gathering, Crafting, Enhancement, Combat Mob Kill và Boss Defeat.
- **Client UI**: `SCR-19` Quest Journal + HUD Active Quest Tracker (`SCR-05`) + `SCR-20` NPC Dialogue.

## Tasks
- [X] T001 Load all 30 canonical quests (12 MVP) in `packages/game-config/src/catalog-loader.ts` and seed MVP quests on starter character creation in `apps/game-server/src/modules/character/character.service.ts`
- [X] T002 Implement server-authoritative quest objective tracking hook (`GATHER_ITEM`, `HARVEST_CROP`, `PLANT_CROP`, `CRAFT_ITEM`, `ENHANCE_WEAPON`, `KILL_MONSTER`, `DEFEAT_BOSS`, `BUILD_STRUCTURE`) in `apps/game-server/src/modules/gameplay/economy-inventory.service.ts`
- [X] T003 Implement `acceptQuest`, WAL-atomic `claimQuest` (with duplicate-claim rejection, `CurrencyLedger`, and prerequisite auto-unlock), and 4-NPC Vietnamese dialogue endpoints in `apps/game-server/src/modules/gameplay/quest-social.service.ts` and `gameplay.controller.ts`
- [X] T004 Implement `SCR-19` Quest Journal, `SCR-20` NPC Dialogue, and HUD Active Quest Tracker in `apps/client/src/ui/SocialQuestAndSystemModals.tsx` and `GameHudOverlay.tsx`
