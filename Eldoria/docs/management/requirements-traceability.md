# Requirements Traceability Matrix (RTM) — Eldoria: Forgotten Wilds

**Trạng thái**: Design Baseline v1.0  
**Cập nhật lần cuối**: 2026-11-19  
**Mục đích**: Truy vết hai chiều từ Hiến pháp & `GAME_DESIGN_BRIEF.md` (Mục 1–30) → Tài liệu Thiết kế (`docs/`) → Dữ liệu Chuẩn (`game-data/*.json`) → Đặc tả Spec Kit (`specs/001..012`) → Kịch bản Kiểm thử (`docs/testing/`).

---

## 1. Truy vết Nguyên tắc Hiến pháp (Constitution Principles I–VIII)

| Nguyên tắc | Yêu cầu Trọng tâm | Tài liệu Kiến trúc & Thiết kế | Spec Kit Features | Tiêu chí / Test Kiểm chứng |
| :--- | :--- | :--- | :--- | :--- |
| **Principle I (NON-NEGOTIABLE)** | 100% JSON-Only Local Primary DB (`data/db/**/*.json`), Zero PostgreSQL/TypeORM/Redis/S3/Third-Party Services | `ADR-001`, `database-design.md`, `data-dictionary.md`, `deployment-design.md`, `sources-and-licenses.md` | `001`..`012` (Toàn bộ 12 `plan.md` Constitution Check = PASS) | `AC-001`, `AC-002`, `TS-DB-001..005`, `SEC-001`, `SEC-015`, `audit-workspace.mjs` |
| **Principle II (NON-NEGOTIABLE)** | Server-Authoritative Simulation & Anti-Cheat Integrity | `ADR-003`, `security-design.md`, `anti-cheat-design.md`, `network-protocol.md` | `002`, `003`, `004`, `005`, `007`, `008`, `009`, `011` | `AC-003`, `SEC-001..015`, `TS-WLD-002`, `TS-CMB-003` |
| **Principle III** | Data-Driven Single Source of Truth (`game-data/*.json`) | `00-game-vision.md`, `game-data/*.json` (12 files) | `001`, `004`..`011` | `validate-catalog.mjs` (`0` errors, `0` warnings) |
| **Principle IV** | Modular Monolith & Decoupled 20Hz Sim / 60FPS Render / React UI | `ADR-002`, `ADR-004`, `system-architecture.md`, `frontend-architecture.md`, `backend-architecture.md`, `game-server-architecture.md` | `001`, `003`, `012` | `TS-DB-001`, `performance-test-plan.md` |
| **Principle V** | Classic 16-Bit Pixel-Perfect 2.5D & Combat Readability | `art-bible.md`, `character-design-standard.md`, `animation-standard.md`, `vfx-design.md`, `tileset-standard.md` | `001`, `003`, `004`, `011`, `012` | `AC-009`, `TS-CMB-004`, `QA-ART-01..05` |
| **Principle VI** | Fair Progression, Deterministic `+1..+10` MVP, Non-Predatory In-Game Gacha | `ADR-005`, `02-core-gameplay-loop.md`, `09-weapon-enhancement.md`, `10-gacha-system.md`, `19-game-economy.md` | `007`, `008`, `009` | `AC-005`, `AC-006`, `AC-007`, `TS-ENH-001..004`, `TS-GAC-001..004`, `run-simulations.mjs` |
| **Principle VII** | Spec-Driven Development (`001..012`) & Vertical-Slice MVP | `mvp-scope.md`, `feature-roadmap.md`, `specs/001..012` | `001`..`012` (10 artifacts/feature) | `specs/*/analysis-report.md` (`0` critical) |
| **Principle VIII** | 14 Quality Gates, Honest `proposed/unverified` Labels, Zero Fabricated Results | `assumptions-and-decisions.md`, `simulation-results.md`, `test-strategy.md`, `FINAL-DESIGN-REPORT.md` | `001`..`012` | `audit-workspace.mjs`, `run-simulations.mjs` |

---

## 2. Truy vết Toàn bộ Các Mục `GAME_DESIGN_BRIEF.md` (Mục 3–29)

| Mục Brief | Chủ đề Yêu cầu | Tài liệu Thiết kế (`docs/`) | Dữ liệu Chuẩn (`game-data/`) | Spec Kit Feature(s) | Kiểm chứng & Mô phỏng |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **Mục 3** | Game Vision & 7 Pillars | `00-game-vision.md`, `01-game-design-document.md` | Toàn bộ 12 files | `001`..`012` | `FINAL-DESIGN-REPORT.md` |
| **Mục 4** | Core Gameplay Loop & Onboarding (5m–1mo) | `02-core-gameplay-loop.md`, `user-flows.md` | `quests.json` (`qst_001..012`) | `002`, `006`, `008`, `012` | `AC-004`, `economy-analysis.md` |
| **Mục 5** | Art Direction & Pixel Art Bible | `art-bible.md`, `tileset-standard.md`, `environment-design.md`, `vfx-design.md`, `audio-design.md`, `asset-manifest.md`, `asset-production-backlog.md`, `concepts/*.jpg` | `items.json`, `buildings.json`, `crops.json` | `001`, `003`, `012` | `AC-009`, `QA-ART-01..05` |
| **Mục 6** | Character Design System (12 Heroes, 8 Classes, 9 Elements) | `04-character-design.md`, `character-design-standard.md` | `characters.json` (12) | `002`, `004`, `009` | `run-simulations.mjs` (Rarity Parity) |
| **Mục 7** | Animation System (25 States, 4-dir MVP / 8-dir Ext) | `animation-standard.md`, `animation-state-machine.md`, `sprite-sheet-standard.md` | `skills.json`, `monsters.json`, `bosses.json` | `003`, `004`, `011` | `websocket-contracts.md §4` |
| **Mục 8** | Combat & 60 Iconic Skills | `06-combat-system.md`, `07-skill-system.md`, `combat-formulas.md` | `skills.json` (60; 15 MVP) | `004-combat-skills` | `TS-CMB-001..004`, `run-simulations.mjs` |
| **Mục 9** | Character Progression (17 Stats, Lv 1–100) | `05-character-progression.md`, `progression-model.md` | `characters.json` | `002`, `004` | `TS-AUTH-004`, `run-simulations.mjs` |
| **Mục 10** | Weapons, Equipment & `+1..+10` Enhancement | `08-equipment-system.md`, `09-weapon-enhancement.md`, `11-crafting-system.md`, `weapon-upgrade-costs.csv` | `items.json` (40 Wpn, 40 Eqp, 50 Mat), `recipes.json` (36) | `005`, `006`, `007` | `AC-005`, `TS-ENH-001..004`, `SEC-006`, `run-simulations.mjs` |
| **Mục 11** | Fair In-Game Gacha & Collection | `10-gacha-system.md`, `gacha-probabilities.csv` | `gacha-banners.json` (4; 2 MVP) | `009-gacha-collection` | `AC-006`, `TS-GAC-001..004`, `SEC-007`, 100k Monte Carlo |
| **Mục 12** | Survival, Farming & Animal Husbandry (24h Server-Time) | `12-farming-system.md`, `13-animal-husbandry.md` | `crops.json` (15), `animals.json` (6) | `008-housing-farming` | `AC-007`, `TS-FRM-001..003`, `SEC-012` |
| **Mục 13** | Building & Housing Placement System (13 Buildings) | `14-building-system.md` | `buildings.json` (13; 6 MVP) | `008-housing-farming` | `TS-FRM-004`, `SEC-011` |
| **Mục 14** | Open World & Level Design (8 Regions, Tiled) | `03-world-building.md`, `17-dungeon-design.md`, `environment-design.md` | `quests.json`, `loot-tables.json` | `003-world-movement`, `011-dungeon-boss` | `TS-WLD-001..004` |
| **Mục 15** | Monster AI (10 States) & Multi-Phase Bosses (30+8+5) | `15-monster-ai.md`, `16-boss-design.md`, `17-dungeon-design.md` | `monsters.json` (38), `bosses.json` (5) | `011-dungeon-boss` | `AC-008`, `TS-BOS-001..003`, `run-simulations.mjs` |
| **Mục 16** | Game Economy & Content Catalog Balancing | `19-game-economy.md`, `economy-analysis.md`, `simulation-results.md` | Toàn bộ 12 `game-data/*.json` | `005`, `006`, `007`, `009` | `validate-catalog.mjs`, 30-day Economy Sim |
| **Mục 17** | Online Multiplayer & Social System | `20-multiplayer-design.md` | `bosses.json`, `buildings.json` | `010-multiplayer-social` | `AC-010`, `TS-BOS-003`, `SEC-013`, `SEC-014` |
| **Mục 18** | UI/UX Design (24 Screens + Interactive Mockups) | `design-system.md`, `screen-inventory.md`, `user-flows.md`, `interaction-design.md`, `responsive-design.md`, `accessibility.md`, `ui-testing-strategy.md`, `mockups/*.html` (7 files) | `characters.json`, `items.json`, `gacha-banners.json` | `012-game-ui-qa` | `AC-011`, Playwright Matrix |
| **Mục 19–20** | Technical & Realtime 20Hz Game Server Architecture | `system-architecture.md`, `frontend-architecture.md`, `backend-architecture.md`, `game-server-architecture.md`, `network-protocol.md`, `api-contracts.md`, `websocket-contracts.md`, `deployment-design.md`, `ADR-001..006`, `diagrams/` | `game-data/*.json` | `001`, `003`, `004`, `010` | `performance-test-plan.md` (20–500 CCU) |
| **Mục 21** | JSON Database (26 Entities) & Security (14 Threats) | `database-design.md`, `data-dictionary.md`, `security-design.md`, `anti-cheat-design.md` | `game-data/*.json` | `001`, `002`, `005`, `007`, `009` | `TS-DB-001..005`, `SEC-001..015` |
| **Mục 22** | QA & Test Design (13 Test Layers + UI Audit) | `test-strategy.md`, `test-scenarios.md`, `acceptance-criteria.md`, `performance-test-plan.md`, `security-test-plan.md`, `ui-testing-strategy.md` | — | `012-game-ui-qa` | `audit-workspace.mjs` |
| **Mục 23–29** | Spec Kit Workflow, Progress, MVP Scope & Final Review | `mvp-scope.md`, `feature-roadmap.md`, `technical-backlog.md`, `risk-register.md`, `requirements-traceability.md`, `assumptions-and-decisions.md`, `sources-and-licenses.md`, `PROGRESS.md`, `HANDOFF.md`, `FINAL-DESIGN-REPORT.md`, `docs/README.md` | — | `specs/001..012` | `audit-workspace.mjs` |
