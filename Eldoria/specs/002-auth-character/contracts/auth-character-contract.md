# Interface Contracts: Self-Hosted Local Authentication & Character Management

**Feature**: `002-auth-character`  
**Base Reference**: [`docs/architecture/api-contracts.md`](../../../docs/architecture/api-contracts.md)

---

## 1. REST Endpoints (`apps/game-server/src/modules/identity` & `character`)

| Method | Path | Auth / Headers | Request DTO | Response / Error Codes |
| :---: | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public (RateLimit 5/m/IP) | `{ username, email, password }` | `201 { accountId, username, accessToken }` + HttpOnly cookie; `409 ERR_USERNAME_EXISTS \| ERR_EMAIL_EXISTS`, `400 ERR_WEAK_PASSWORD` |
| `POST` | `/api/v1/auth/login` | Public (RateLimit 5/m/IP) | `{ identifier, password }` | `200 { account, accessToken }` + HttpOnly cookie; `401 ERR_INVALID_CREDENTIALS`, `423 ERR_ACCOUNT_LOCKED`, `403 ERR_ACCOUNT_BANNED` |
| `POST` | `/api/v1/auth/refresh` | Refresh Cookie | *(empty)* | `200 { accessToken }` + rotated cookie; `401 ERR_TOKEN_REUSED` (revokes all sessions) |
| `POST` | `/api/v1/auth/logout` | Bearer JWT | `{}` | `200 { revoked: true }` |
| `GET` | `/api/v1/characters` | Bearer JWT | — | `200 { characters: CharacterSummary[] }` (max 4) |
| `POST` | `/api/v1/characters` | Bearer JWT + `X-Idempotency-Key` | `{ name, starterHeroId }` | `201 { character }` (atomic WAL creates char + inv + house); `409 ERR_CHAR_NAME_EXISTS \| ERR_MAX_CHARACTERS_REACHED` |
| `GET` | `/api/v1/characters/:charId/summary` | Bearer JWT + Ownership | — | `200 { character, derivedStats, combatRating }`; `403 ERR_FORBIDDEN_OWNERSHIP` |
| `POST` | `/api/v1/characters/:charId/allocate-stats` | Bearer JWT + Ownership + `X-Idempotency-Key` | `{ str, agi, int, vit, dex, luk }` | `200 { stats, attributePointsFree, combatRating }`; `400 ERR_INVALID_ALLOCATION` |
| `POST` | `/api/v1/characters/:charId/skills/upgrade` | Bearer JWT + Ownership + `X-Idempotency-Key` | `{ skillId }` | `200 { skills, skillPointsFree }` |
| `POST` | `/api/v1/characters/:charId/switch-hero` | Bearer JWT + Ownership | `{ heroId }` | `200 { activeHeroId, derivedStats, skills }`; `409 ERR_NOT_IN_SAFE_ZONE \| ERR_IN_COMBAT` |

## 2. Internal Domain Events
- `AccountRegisteredEvent { accountId, username, createdAt }`
- `SessionRevokedEvent { accountId, reason: 'LOGOUT' | 'TOKEN_REUSE' | 'ADMIN_BAN' }`
- `CharacterCreatedEvent { accountId, characterId, starterHeroId }`
- `CharacterStatsRecalculatedEvent { characterId, derivedSnapshot, combatRating }`
