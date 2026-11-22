# Contract 1: Multi-Frame Pixel Asset Pipeline & Skill Refactoring (`contracts/asset-pipeline.md`)

**Feature**: `006-astral-expedition-pixel` · **Date**: 2026-11-21

---

## 1. Hợp đồng Đổi tên & Biên tập `.agents/skills/`, `prompts/`, `tools/`, `GLOSSARY.md` (`FR-019`, `SC-006`)

Toàn bộ 11 thư mục skill cũ phải được đổi tên sạch sang tiền tố `expedition-*` (xóa hẳn thư mục `pokemon-*` / `pokeball-*` cũ) và cập nhật `name` + `description` trong YAML frontmatter cũng như mọi liên kết nội bộ:

```text
.agents/skills/
├── expedition-sprite-generator/SKILL.md          (từ pokemon-sprite-generator)
├── expedition-battle-poses/SKILL.md              (từ pokemon-battle-poses)
├── expedition-battle-scene/SKILL.md              (từ pokemon-battle-scene)
├── expedition-npc-generator/SKILL.md             (từ pokemon-character-generator)
├── expedition-skill-vfx/SKILL.md                 (từ pokemon-move-vfx)
├── expedition-skill-review/SKILL.md              (từ pokemon-move-review)
├── expedition-ui-generator/SKILL.md              (từ pokemon-ui-generator)
├── expedition-overworld-generator/               (từ pokemon-overworld-generator + references/)
├── expedition-structure-generator/               (từ pokemon-structure-generator + references/)
├── expedition-map-generator/                     (từ pokemon-map-generator + references/)
└── expedition-summon-orb-generator/SKILL.md      (từ pokeball-generator)

prompts/
├── battle/README.md + orientation-front.png + orientation-back.png   (chuẩn góc chéo 3/4, lưới 6×6 & 6×4 nhiều frame)
├── movement/README.md                                                (chuẩn 6 frame × 4 hướng / loop cho Hero & Quái Gác Cổng)
├── skills/README.md + signatures/*.json                              (đổi từ prompts/moves/ — 60 kỹ năng Anh Hùng + chiêu Trùm)
├── overworld/README.md                                               (7 quần xã + strip địa hình động 8 frame)
└── structure/README.md + door.md + interior.md                       (Cờ Trạm Nghỉ, Đền Cổ, Cổng Trùm 7 vùng)
```

**Điều kiện Kiểm định Tự động (`SC-006`)**:
- `0` thư mục trong `.agents/skills/` bắt đầu bằng `pokemon-` hoặc `pokeball-`.
- `0` liên kết Markdown tương đối bị gãy trong toàn bộ `.agents/skills/expedition-*/**/*.md`.
- `GLOSSARY.md` định nghĩa đầy đủ: `Overworld`, `RealmMap`, `RestAnchor`, `Gatekeeper`, `Hero`, `Boss`, `BattleScene`, `VerticalSkillMenu`, `ActionPoints`, `TimedHit`, `Dodge`, `ParryCounter`, `BreakGauge`, `SummonOrb`, `PityLedger`.

---

## 2. Hợp đồng Kích thước & Số Frame Đa Chuyển Động ("Nhân Vật + Bản Động Nhiều Frame")

Mọi tài nguyên xuất bản vào `database-astral-expedition/` (qua `tools/expedition/build_bundle.py`) PHẢI thỏa mãn bảng chuẩn cứng sau:

| Loại Tài Nguyên | Đường dẫn Xuất bản (`database-astral-expedition/`) | Kích thước Ô | Bố cục Lưới & Số Frame | Quy chuẩn Kỹ thuật |
|-----------------|----------------------------------------------------|--------------|------------------------|--------------------|
| **Anh Hùng — Chiến Đấu (`BACK`)** | `units/heroes/<heroId>-battle.png` + `.json` | `192×192 px` (safe `160×160`) | **`6 cột × 6 hàng = 36 frame`** (`1152×1152 px`): `0:idle_breathe`, `1:attack`, `2:skill_cast`, `3:parry_counter`, `4:dodge`, `5:hurt_faint` | Góc nhìn `BACK` chéo 3/4 hướng lên phải như `orientation-back.png`; `BGR555`, alpha `0/255`, viền `#1b1726`. |
| **Anh Hùng — Khám Phá Overworld** | `units/heroes/<heroId>-movement.png` + `.json` | `64×64` hoặc `192×192 px` | **`6 cột × 4 hướng × 2 loop (`idle`, `walk`) = 48 frame`** | 4 hàng cố định: `down`, `left`, `right`, `up`; bước chân mượt 6 nhịp. |
| **Quái Gác Cổng — Overworld & Battle** | `units/gatekeepers/<gkId>-movement.png` & `-battle.png` | `192×192 px` | Overworld: `6×4 = 24 frame` tuần tra · Battle `FRONT`: **`6 cột × 4 hàng = 24 frame`** (`idle_breathe`, `attack`, `hurt_stagger`, `faint`) | Góc chiến đấu `FRONT` chéo 3/4 nhìn xuống trái như `orientation-front.png`. |
| **7 Đại Trùm — Chiến Đấu (`FRONT`)** | `units/bosses/<bossId>-battle.png` + `.json` | **`256×256 px`** (safe `216×216`) | **`6 cột × 6 hàng = 36 frame`** (`1536×1536 px`): `0:idle_breathe`, `1:combo_a`, `2:heavy_sweep_b`, `3:phase_awaken`, `4:stagger_break`, `5:defeat` | Silhouette khổng lồ, hào quang sống động liên tục ở hàng `0`. |
| **Hiệu ứng Kỹ năng (60+ Skill VFX)** | `vfx/skills/<skillId>-cast.png` & `-effect.png` + `.json` | `96×96` – `192×192 px` | **`8 frame CAST` + `8 frame EFFECT` (`16 frame/chiêu`)** + cấu hình tia `beams` | Không cắt mép ô (`≥ 2 px` lề trống), không che báo đòn Trùm. |
| **Cảnh Trận Đấu Động (7 Vùng + Boss)** | `battle-scenes/<sceneId>/{backdrop,ground,platforms,ambient-anim}.png` | Khung gốc `390×180 px` (xuất `×2` = `780×360`) | Lớp nền phân tách + **dải chuyển động môi trường `8 frame`** (`ambient-anim.png`) | Giữa màn hình `320×180` an toàn cho PC, toàn khung `390×180` cho Mobile xoay ngang. |
| **Bản Đồ Khám Phá Động (7 Vùng)** | `maps/<mapId>/<mapId>.tmj` + tilesets `*-anim.png` | Metatile `16×16` xuất `×2` (`32×32 px`) | 47-tile blob autotile + **dải địa hình/prop động `8 frame`** (`200 ms/frame`) | `0` seam errors, `0` ô kẹt đường khi kiểm chứng bằng `mapgen.py`. |
| **Tinh Cầu Triệu Hồi Gacha** | `ui/gacha/astral-orb.png` + `.json` | `64×64` xuất `×2` (`128×128 px`) | **`8 cột × 6 hàng` (`26+ frame` hữu dụng)**: bay xoay, mở sáng, rung 3 nhịp đổi màu `R/SR/SSR`, bung sao | Sạch hoàn toàn nền `#FF00FF`/`#00FF00`. |

---

## 3. Cổng Kiểm Tra Chất Lượng Hình Ảnh Tự Động (`Asset Quality Gates`)

1. `tools/gen3/check_gen3.py`: Kiểm tra `BGR555`, alpha nhị phân `0/255`, không lem bán trong suốt ngoài lớp ánh sáng cho phép.
2. `tools/units/check_magenta.py`: Đảm bảo `0` pixel rìa hồng `#FF00FF` còn sót trên mọi sprite nhân vật, quái, trùm và cầu triệu hồi.
3. `tools/expedition/verify_bundle.py`: Kiểm tra đủ `12` Anh Hùng (`36f` battle + `48f` movement), đủ `7` Đại Trùm (`36f` battle `256×256`), đủ `7` bản đồ `.tmj` + `7` cảnh chiến đấu có lớp động `8 frame` và xuất `database-astral-expedition/manifest.json` kèm mã băm SHA-256.
