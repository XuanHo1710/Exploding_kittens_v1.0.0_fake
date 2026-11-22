# tools/skills

Move (kỹ năng) effects: data, prompts, normalizing, previews, review → `assets/skills/<GenX-Region>/<Move>/` and `data/battle/moves.json`. Skills: `.agents/skills/expedition-skill-vfx/SKILL.md` and `.agents/skills/expedition-skill-review/SKILL.md`.

| File | Does |
|---|---|
| `start_move.py` | Step 1: `python3 tools/skills/start_move.py "<Move>"` finds / creates the move folder and its prompt. |
| `move_prompt.py`, `normalize_move.py`, `normalize_particles.py` | Prompt files; turn agy drafts into `-cast` / `-effect` strips and particle strips. |
| `vfx.py`, `beams.py`, `fallback_vfx.py` | Renderers: battle screen + effects, code-drawn beams, the upstream particle effects (Fallback library, `MONS_REFERENCE_SRC`; THIRD_PARTY_NOTICES.md). |
| `evolution_fx.py`, `evolution_viewer.html` | Evolution sequence (Gen 3) + the `evo_*` particle strips → `assets/ui/Evolution/`; page `/evolution` of the move viewer. |
| `catch_viewer.html`, `clip_check.py` | Page `/catch` of the move viewer (capture sequence from `tools/items/catch_anim.py`); never-cut check of move strips. |
| `battle_preview.py`, `battle_demo.py`, `move_viewer.py` (+ `move_viewer.html`) | Previews: one move, a short battle, a local web viewer. |
| `apply_official.py` | Writes the official images of every game move: the upstream effect (Fallback) wherever it has a usable image (beats agy and procedural; code beams stay code), else agy's old drawing, else procedural; damaging moves with no upstream effect of their own get the upstream generic type impact (`fallback_vfx.py --generic`, "fallback-generic"); empty travel frames of a Fallback effect are filled from agy's old drawing or procedurally (decisions.md §12, 2026-11-20). |
| `review_move.py`, `clip_check.py` | Review a move on both sides (`tmp/moves/review/`), clipping check. |
| `build_moves.py` | Rebuilds `data/battle/moves.json` from PokéAPI CSVs. |
| `build_anchors.py`, `anchor_check.py` | Body anchors from the 3D model (`$MONS_PY3D`, imports `tools/model3d/`) and their check. |
