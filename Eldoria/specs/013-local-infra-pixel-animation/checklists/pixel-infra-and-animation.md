# Implementation Readiness Checklist: Local Docker Infrastructure (Redis/MinIO) & Glitch-Free 2D Pixel Multi-Animation Pipeline

**Purpose**: Reviewer-owned quality checklist verifying that `specs/013-local-infra-pixel-animation` requirements, invariants, and cross-feature plans are unambiguous and complete prior to `IMPLEMENTATION MODE`.  
**Created**: 2026-11-19  
**Feature**: [spec.md](../spec.md) · [plan.md](../plan.md) · [tasks.md](../tasks.md)

## Storage & Local Docker Infrastructure Boundaries

- [ ] CHK001 Confirm that `data/db/**/*.json` (`JsonDatabaseEngine`) remains 100% the sole primary persistent database and that NO entity persistence moves exclusively to Redis or any SQL/NoSQL DBMS [Constitution Principle I, FR-001]
- [ ] CHK002 Confirm that `redis` and `minio` container configurations strictly bind to local/internal Docker interfaces with zero external cloud endpoints (no AWS S3 Cloud, no Redis Cloud, no third-party SaaS) [Constitution Principle I, FR-002]
- [ ] CHK003 Confirm that every Redis key pattern defines an explicit finite TTL or rebuildable rule AND specifies its in-memory degraded fallback behavior if Redis restarts [Data Model §1, FR-003, SC-005]
- [ ] CHK004 Confirm that MinIO bucket policies enforce public read-only (`download`) exclusively on `eldoria-assets` while keeping `eldoria-backups` strictly private to `eldoria-server` [Contracts §1, FR-004]
- [ ] CHK005 Confirm that rotating JSON backups uploaded to `eldoria-backups` include SHA-256 `backup-manifest.json` and preserve parallel local copies in `data/backups/` [Data Model §2.2, SC-006]

## Glitch-Free 2D Pixel Rendering & Multi-Animation Invariants

- [ ] CHK006 Confirm that `pixelArt: true`, `antialias: false`, `roundPixels: true`, `640x360` integer scaling, and `Math.round` camera snapping are enforced across all Phaser scenes [Contracts §3.1, FR-006, SC-004]
- [ ] CHK007 Confirm that 100% of tilesets enforce `extrude: 1px` and 100% of sprite atlases enforce `padding: 2px` with POT dimensions `<= 2048x2048` to eliminate seam/frame bleeding [Research §2, FR-007]
- [ ] CHK008 Confirm that Y-Sorting (`1000 + Math.round(footY)`), Canopy Occlusion (`Depth 101000`, `alpha 0.55`), and Boss Telegraph protection (`Depth 180-199` + `Telegraph Rim Echo 109500`) match `frontend-architecture.md` and `vfx-design.md` identically [Contracts §3.1, FR-007]
- [ ] CHK009 Confirm that all 25 humanoid animation states × 4 directions (plus MVP monsters, animals, crops, boss, and animated environment props) are mapped to validated `AnimationClipDefinition` entries with `watchdogMaxDurationMs` anti-stuck ceilings [Data Model §3, FR-008, FR-009, SC-003]
- [ ] CHK010 Confirm that missing-asset retry (max 3 attempts), `/assets` fallback, and `playSafe()` pixel placeholder fallback prevent runtime crashes without letting client visual frames authorize server combat damage [Contracts §3.2, FR-011, Constitution Principle II]
- [ ] CHK011 Confirm that the offline interactive showcase (`docs/ui-ux/mockups/pixel-animation-showcase.html`) and automated validator (`tools/design-validation/validate-animation-pipeline.mjs`) have been reviewed for visual crispness and 100% catalog alignment [FR-010, FR-012, SC-002]
