# Implementation Plan: Self-Hosted Local Authentication & Character Management

**Branch**: `002-auth-character` | **Date**: 2026-11-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-auth-character/spec.md`

## Summary

Triển khai toàn bộ lớp định danh tự chủ (`IdentityModule`: đăng ký, băm `crypto.scrypt`, JWT `HS256` 15 phút, xoay vòng Refresh Token lưu hash trong `data/db/sessions/`, chống brute-force và token reuse) và quản lý nhân vật (`CharacterModule`: tối đa 4 nhân vật/tài khoản, tạo nguyên tử qua WAL cùng kho đồ & nhà khởi đầu, tính lại chỉ số + `CombatRating` 100% tại server, phân bổ thuộc tính, nâng bậc kỹ năng và đổi hero tại vùng an toàn).

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 22 LTS)

**Primary Dependencies**: NestJS (`IdentityModule`, `CharacterModule`), Node built-in `crypto` (`scrypt`, `timingSafeEqual`, `randomBytes`), `jsonwebtoken`/HMAC helper, Zod, `JsonDatabaseEngine` (từ `001`), React + Zustand (`useAuthStore`)

**Storage**: 100% Local JSON Primary DB (`data/db/accounts/*.json`, `sessions/*.json`, `characters/*.json`, `indexes/*.json`, `audit/*.json`) qua `JsonDatabaseEngine` WAL + Optional Hot Read-Through Session Cache & Brute-Force Lockout trên **Local Docker Redis** (`eldoria:sess:*`, `eldoria:auth:lockout:*`, tự fallback RAM theo `specs/013`) — ZERO external DBMS / ZERO third-party Auth SaaS

**Testing**: Jest + Supertest (`SEC-003`, `SEC-004`, `SEC-005`, `TS-AUTH-001..004`), Vitest (`StatCalculator` unit tests)

**Target Platform**: Desktop Web Browser + Self-Hosted NestJS Server

**Project Type**: Monorepo Game Feature (`apps/game-server/src/modules/identity`, `character`, `packages/shared/src/math`, `apps/client/src/ui/screens`)

**Performance Goals**: Login/Register `scrypt` hoàn tất `< 150 ms` trên worker pool; tính lại chỉ số nhân vật `< 2 ms` (`proposed / unverified`)

**Constraints**: Zero third-party auth/SMTP; mọi thao tác nhân vật phải qua `OwnershipGuard`; single active gameplay session/character

**Scale/Scope**: Hỗ trợ toàn bộ 12 nhân vật catalog (`3` MVP starter khi tạo mới, `9` hero mở thêm qua gameplay/gacha)

## Constitution Check

| Nguyên tắc | Pre-Design | Post-Design | Ghi chú |
| :--- | :---: | :---: | :--- |
| **I. JSON-Only Primary DB + Local Docker Redis & MinIO (v2.0.0)** | PASS | PASS | `crypto.scrypt` + JWT tự ký + JSON `accounts/`, `sessions/`, `characters/`, `indexes/`; Local Docker Redis chỉ cache phiên nóng có TTL & lockout (mất Redis đọc lại từ `sessions/*.json`) |
| **II. Server-Authoritative & Anti-Cheat** | PASS | PASS | OwnershipGuard, token reuse detection, server-only `StatCalculator` & hard caps |
| **III. Data-Driven Single Source of Truth** | PASS | PASS | Đọc base stats, stat growth và starter hero trực tiếp từ `game-data/characters.json` |
| **IV. Modular Monolith** | PASS | PASS | Ranh giới module `identity` và `character` tách biệt, dùng `InternalEventBus` |
| **V–VIII. Art / Fair / Spec / Quality** | PASS | PASS | Starter 3 hero miễn phí; kiểm thử đầy đủ 6 nhóm test |

## Project Structure

### Documentation (this feature)
```text
specs/002-auth-character/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/auth-character-contract.md
├── checklists/{requirements.md,security-auth.md}
├── tasks.md
└── analysis-report.md
```

### Source Code (repository root)
```text
packages/shared/src/
├── contracts/auth-character.dto.ts
└── math/stat-calculator.ts
apps/game-server/src/modules/
├── identity/
│   ├── identity.module.ts
│   ├── password.service.ts
│   ├── session.service.ts
│   ├── auth.controller.ts
│   └── guards/{jwt-auth.guard.ts,ownership.guard.ts}
└── character/
    ├── character.module.ts
    ├── character.service.ts
    ├── character.controller.ts
    └── character-initializer.service.ts
apps/client/src/
├── stores/useAuthStore.ts
└── ui/screens/{LoginRegisterScreen.tsx,CharacterSelectScreen.tsx,StarterCreateScreen.tsx}
```

**Structure Decision**: Bổ sung đúng hai NestJS module `identity` và `character` theo `docs/architecture/backend-architecture.md`, đặt `StatCalculator` thuần túy tại `packages/shared` để dùng chung khi xem trước chỉ số nhưng luôn xác thực lại tại server.

## Complexity Tracking

*Không có vi phạm Hiến pháp.*
