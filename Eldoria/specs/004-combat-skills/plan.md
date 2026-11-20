# Implementation Plan: Real-Time Action Combat & 60-Skill Data-Driven Engine

**Branch**: `004-combat-skills` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-combat-skills/spec.md`

## Summary

Xây dựng hệ thống chiến đấu Action RPG thời gian thực server-authoritative `20 Hz` (`CombatModule`, `SkillModule`) và lớp trình diễn game-feel `60 FPS` (`CombatVfxSystem`, `AnimationController`), bao gồm: (1) kiểm tra hình học 6 dạng hitbox (`ARC`, `CIRCLE`, `LINE`, `RECT`, `PROJECTILE` swept collision, `SELF`) dùng chung toán học trong `packages/shared`; (2) chuỗi đánh thường 3/4 đòn, Dodge `300 ms` i-frame (`20` Sta, `1,200 ms` CD), Block `60%` & Perfect Parry `200 ms` (`+25%` Poise); (3) công thức sát thương 5 bước kèm toàn bộ trần cứng (`CritRate <= 75%`, `CritDamage <= 250%`, `CDR <= 40%`, `AttackSpeedMult <= 1.60x`), ma trận 9 nguyên tố & phản ứng (ICD `2,000 ms`) và CC Diminishing Returns (`20s`); (4) động cơ 60 kỹ năng (15 MVP) đọc trực tiếp từ `game-data/skills.json` chạy theo `castTimeMs → startupMs → activeMs → recoveryMs`; và (5) quy tắc bảo toàn tầm nhìn Boss Telegraph (`Depth 150–199` trên VFX mặt đất `Depth 100–149`, `alpha <= 0.45`).

## Technical Context

**Language/Version**: TypeScript 5.x trên Node.js 22 LTS

**Primary Dependencies**: NestJS (`CombatModule`, `SkillModule`, WebSocket `/game` Gateway), Zod strict DTO validation, `GameCatalogLoader` (`game-data/skills.json`, `game-data/characters.json`), `SpatialHashGrid` (`003-world-movement`), Phaser 3 (`CombatVfxSystem`, `AnimationController`, Object Pooling), Zustand (`useHudStore`)

**Storage**: Ephemeral In-Process RAM cho trạng thái combat `20 Hz` (`CombatActorRuntime`, `SkillRuntimeExecution`, `ActiveStatusEffect`, `CcDiminishingTracker`, ZERO per-tick disk I/O) + Local JSON persistence trong `data/db/characters/<characterId>.json` (`Character.skills[]`, `stats.currentHp/Mp/Stamina` qua `StaggeredDirtyFlusher` `30s`) via `JsonDatabaseEngine` — ZERO PostgreSQL/Redis/S3/Third-Party Services

**Testing**: Jest unit & WebSocket combat e2e tests (`TS-CMB-001..004`, `SEC-010`, `SEC-013`), Vitest shared formula & hitbox math tests, Playwright visual layer-order verification

**Target Platform**: Desktop Web Browser + Self-Hosted NestJS Single-Node Server

**Project Type**: Monorepo Realtime Action RPG Feature (`apps/game-server`, `apps/client`, `packages/shared`)

**Performance Goals**: Combat tick simulation `20 Hz` (`p99 < 25 ms`), Client VFX & floating text `60 FPS` với 4 Ultimate đồng thời (`proposed / unverified`)

**Constraints**: Zero client combat trust; zero disk I/O inside `20 Hz` simulation ticks; Boss telegraphs strictly above player ground VFX (`alpha <= 0.45`); fullscreen flash `<= 3 Hz`; client-only hit-stop (`40–65 ms`) never pausing server tick

**Scale/Scope**: Full 60-skill data-driven interpreter supporting 15 MVP skills (`chr_kael_vanguard`, `chr_lyra_windrunner`, `chr_seraphina_dawn`) first, seamlessly extensible to all 12 heroes / 60 skills

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Nguyên tắc Hiến pháp | Pre-Design | Post-Design | Ghi chú |
| :--- | :---: | :---: | :--- |
| **I. JSON-Only Primary Database & Zero Third-Party Services** | PASS | PASS | Combat runtime 100% RAM; skill ranks & HP/MP checkpoints lưu `data/db/characters/*.json`; 0 Redis, 0 DB ngoài |
| **II. Server-Authoritative & Anti-Cheat** | PASS | PASS | 100% hitbox, damage, i-frame, parry, CD, LoS, seq anti-replay và `5s` combat grace chạy trên server |
| **III. Data-Driven Single Source of Truth** | PASS | PASS | Đọc trực tiếp `game-data/skills.json` (60 skills) và `combat-formulas.md`; không hardcode chỉ số |
| **IV. Modular Monolith & Decoupled Simulation** | PASS | PASS | Chạy trong `CombatModule`/`SkillModule` trên `SimulationLoop` 20 Hz; không ghi đĩa trong tick; HUD qua `GameUiBridge` |
| **V. Classic 16-Bit Pixel-Perfect Visual Cohesion** | PASS | PASS | Boss telegraph Depth `150–199` trên VFX mặt đất Depth `100–149` (`alpha <= 0.45`), flash `<= 3 Hz`, shake tắt được |
| **VI. Fair Progression & Meaningful Loops** | PASS | PASS | Trần chỉ số cứng & CC DR triệt tiêu power creep và perma-stun; tử trận không mất vĩnh viễn trang bị |
| **VII. Spec-Driven & Vertical-Slice MVP** | PASS | PASS | Ưu tiên kiểm chứng 15 kỹ năng MVP trên động cơ hỗ trợ đủ 60 kỹ năng |
| **VIII. Verifiable Quality Gates & Evidence Integrity** | PASS | PASS | Mọi chỉ số tick/FPS gắn nhãn `proposed / unverified`; công thức đã đối chiếu bảng chuẩn |

## Project Structure

### Documentation (this feature)

```text
specs/004-combat-skills/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── combat-skills-contract.md
├── checklists/
│   ├── requirements.md
│   └── combat-rules.md
├── tasks.md
└── analysis-report.md
```

### Source Code (repository root — Planned Layout for Implementation Phase)

```text
packages/shared/src/
├── combat/
│   ├── stat-calculator.ts          # DerivedCombatStats + Hard Caps
│   ├── damage-formula.ts           # 5-step Master Damage Formula + 9-Element Matrix
│   └── hitbox-geometry.ts          # ARC, CIRCLE, LINE, RECT, Swept PROJECTILE
└── contracts/
    └── combat-skills.dto.ts        # Strict Zod schemas cho WS & REST
apps/game-server/src/modules/
├── combat/
│   ├── combat.module.ts
│   ├── combat.service.ts           # 20Hz actor state machine, combo, dodge, block/parry, death/respawn
│   ├── elemental-reaction.service.ts # 9 reactions + 2000ms ICD tracker
│   ├── status-effect.service.ts    # Buff/Debuff/Shield FIFO/DoT/Zone + CC DR 20s
│   ├── combat.gateway.ts           # WS C2S handlers + rate limits + anti-cheat scoring
│   └── combat-grace.service.ts     # 5s Combat Logout Grace + dirty checkpoint hook
└── skill/
    ├── skill.module.ts
    ├── skill-execution.engine.ts   # cast->startup->active->recovery + 40% cancel + 150ms buffer
    ├── skill-effect.registry.ts    # Composable handlers cho 15 MVP + 45 roadmap skills
    ├── projectile-zone.manager.ts  # 20Hz swept projectiles & ground zones
    └── skill-progression.controller.ts # REST upgrade & hotbar persistence
apps/client/src/
├── game/systems/
│   ├── CombatVfxSystem.ts          # Depth 100-149 alpha<=0.45, Depth 150-199 telegraph, client hit-stop
│   ├── FloatingCombatTextPool.ts   # Object-pooled damage/reaction numbers
│   └── CombatInputController.ts    # Basic combo, skill targeting, dodge, block, settings toggle
└── stores/
    └── useHudStore.ts              # Cooldowns, status icons, Boss HP/Poise bar
```

**Structure Decision**: Giữ công thức thuần và hình học hitbox trong `packages/shared/src/combat/` để kiểm thử đơn vị độc lập và tái sử dụng cho tooltip/preview client; giữ toàn bộ thực thi quyết định trong `CombatModule` và `SkillModule` của `apps/game-server`.

## Complexity Tracking

*Không có vi phạm Hiến pháp nào cần giải trình ngoại lệ.*
