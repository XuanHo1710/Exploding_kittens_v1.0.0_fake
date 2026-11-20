# Combat Formulas & Anti-Exploit Caps — Eldoria: Forgotten Wilds

**Trạng thái**: Design Baseline v1.0 (Canonical Formula Reference — khớp 100% `packages/shared` & `tools/design-validation/run-simulations.mjs`)  
**Cập nhật lần cuối**: 2026-11-19  
**Tham chiếu**: [`06-combat-system.md`](../game-design/06-combat-system.md), [`05-character-progression.md`](../game-design/05-character-progression.md)

---

## 1. Nguyên tắc Toán học của Hệ thống Chiến đấu

- **Tăng trưởng tuyến tính + đa thức kiểm soát (Non-Exponential Scaling)**: Tránh hoàn toàn tình trạng sát thương nhân lũy thừa khiến nhân vật Lv 50 đánh 1 triệu sát thương còn Lv 15 đánh 100.
- **Trần cứng (Hard Caps) ngăn build phá game**: Mọi chỉ số nhân hệ số (Crit Rate, Crit Damage, CDR, Attack Speed, Penetration, Elemental Resistance) đều có trần cứng được ép ở lớp `StatCalculator` trên server.
- **100% tính toán tại Server**: Mọi công thức dưới đây chạy trên `CombatService` của NestJS từ dữ liệu chuẩn `game-data/*.json`.

---

## 2. Công thức Tính Chỉ số Tổng hợp (Derived Stats)

Với nhân vật ở cấp độ $L \in [1, 100]$, bậc đột phá $A \in [0, 5]$, thuộc tính tổng $STR, AGI, INT, VIT, DEX, LUK$ (bằng Base + Growth × $(L - 1)$ + Allocated + Equipment + FoodBuff):

$$\text{MaxHP} = \text{BaseHP} + \text{HP\_Growth}\cdot(L-1) + 18\cdot\text{VIT} + 4\cdot\text{STR} + \text{EquipHP}$$
$$\text{MaxMP} = \text{BaseMP} + \text{MP\_Growth}\cdot(L-1) + 10\cdot\text{INT} + 2\cdot\text{VIT} + \text{EquipMP}$$
$$\text{MaxStamina} = 100 + 1.5\cdot\text{AGI} + 1.0\cdot\text{VIT} + \text{EquipStamina} \quad (\text{Cap: } 260)$$
$$\text{WeaponATK}(e) = \left\lfloor \text{WeaponBaseATK} \cdot \left(1 + \text{EnhPct}(e)\right) + \text{EnhFlat}(e) \right\rfloor, \quad e \in \{0..10\}$$
$$\text{TotalATK} = \left(\text{BaseATK} + \text{ATK\_Growth}\cdot(L-1) + 2.4\cdot\text{STR} + 1.4\cdot\text{DEX} + 2.2\cdot\text{INT}_{\text{magic}} + \text{WeaponATK}(e) + \text{EquipATK}\right) \cdot (1 + 0.06\cdot A + \text{FoodAtkPct})$$
$$\text{TotalDEF} = \text{BaseDEF} + \text{DEF\_Growth}\cdot(L-1) + 1.8\cdot\text{VIT} + 0.6\cdot\text{STR} + \text{EquipDEF}$$
$$\text{CritRate} = \min\left(0.75,\; \text{BaseCrit} + 0.0025\cdot\text{DEX} + 0.0035\cdot\text{LUK} + \text{EquipCrit} + \text{EnhMilestoneCrit}\right)$$
$$\text{CritDamage} = \min\left(2.50,\; 1.50 + 0.004\cdot\text{LUK} + \text{EquipCritDmg}\right)$$
$$\text{AttackSpeedMult} = \min\left(1.60,\; 1.00 + 0.003\cdot\text{AGI} + 0.002\cdot\text{DEX} + \text{EquipAtkSpd}\right)$$
$$\text{CDR} = \min\left(0.40,\; 0.0015\cdot\text{INT} + \text{EquipCDR}\right)$$
$$\text{MoveSpeed} = \min\left(\text{BaseMove}\cdot 1.45,\; \text{BaseMove}\cdot(1 + 0.0015\cdot\text{AGI} + \text{EquipMovePct})\right)$$
$$\text{ElementalRes}(el) = \text{clamp}\left(\text{BaseRes}(el) + \text{EquipRes}(el),\; -0.35,\; 0.70\right)$$

---

## 3. Công thức Sát thương Chính thức (Master Damage Formula)

### Bước 1 — Sát thương Gốc Kỹ năng (`RawSkillDamage`)
Với kỹ năng cấp bậc $r \in [1, 10]$ có `baseDamage`, `scalingRatio`, bảng tăng tuyến tính theo cấp `upgradeScalingPerRank` (`baseDamageFlat`, `scalingRatioAdd`, `cooldownReductionMs` trong `game-data/skills.json`) và chỉ số nguồn $S \in \{\text{TotalATK}, \text{TotalINT}, \text{TotalDEF}, \text{MaxHP}\}$:

$$\text{EffectiveRatio}(r) = \left(\text{scalingRatio} + \text{scalingRatioAdd}\cdot (r - 1)\right) \cdot \left(1 + \text{Enh10SkillBonus}\right)$$
$$\text{RawDamage} = \left(\text{baseDamage} + \text{baseDamageFlat}\cdot(r-1)\right) + S \cdot \text{EffectiveRatio}(r)$$

*(Với `Enh10SkillBonus = 0.05` khi nhân vật cầm vũ khí cường hóa đạt mốc `+10`.)*

### Bước 2 — Giảm trừ Phòng thủ & Xuyên giáp (`DefenseMitigation`)
Sử dụng đường cong hyperbolic chống chia cho 0 và chống giáp 100% bất tử:

$$\text{EffectiveDEF} = \max\left(0,\; \text{TargetDEF} \cdot (1 - \min(0.50,\; \text{DefPenPct})) - \text{FlatDefPen}\right)$$
$$\text{DefMultiplier} = \frac{100 + 12\cdot L_{\text{attacker}}}{100 + 12\cdot L_{\text{attacker}} + \text{EffectiveDEF}}$$

*(Ví dụ: ở Lv 15, hằng số giáp là $280$. Nếu quái có `DEF = 70`, hệ số xuyên qua là $280 / 350 = 0.80$, tức giảm đúng 20% sát thương. Ngay cả khi Boss có `DEF = 280`, sát thương vẫn còn $50\%$, không bao giờ về 0.)*

### Bước 3 — Kháng Nguyên tố & Khắc hệ (`ElementalMultiplier`)
- **Khắc hệ chuẩn**:
  - `FIRE > FROST / EARTH`, `WATER > FIRE`, `EARTH > LIGHTNING`, `LIGHTNING > WATER`, `WIND > EARTH`, `FROST > WIND`, `LIGHT <-> SHADOW` (cả hai gây `+20%` lên nhau), `NEUTRAL` (luôn `1.00`, bỏ qua 30% kháng nguyên tố dương của mục tiêu).
  - Hệ số khắc hệ: `1.25` (mạnh hơn), `0.85` (bị khắc), `1.00` (trung tính).
- **Kháng nguyên tố**:
$$\text{ElemMultiplier} = \text{AffinityMult} \cdot \left(1 - \text{TargetElementalRes}(el)\right)$$

### Bước 4 — Chí mạng, Phản ứng Nguyên tố, Stagger & Biến thiên Nhỏ
$$\text{CritMultiplier} = \begin{cases} \text{CritDamage} & \text{nếu roll } U(0,1) < \text{CritRate} \\ 1.00 & \text{ngược lại} \end{cases}$$
$$\text{StaggerMultiplier} = \begin{cases} \text{Boss.staggerMechanic.damageTakenMultiplier} & \text{nếu Boss chính đang STAGGERED (} 1.40\text{–}1.50 \text{ theo } \texttt{bosses.json}\text{)} \\ 1.35 & \text{mặc định cho Elite/Mini-boss khi STAGGERED} \\ 1.00 & \text{ngược lại} \end{cases}$$
$$\text{ReactionMultiplier} = 1.00 + \text{ElementalReactionBonus} \quad (\text{tối đa } 1.35\text{ cho Melt / Overload / Eclipse Burst})$$
$$\text{Variance} \sim U(0.96,\; 1.04)$$

### Bước 5 — Sát thương Cuối cùng (`FinalDamage`)
$$\text{FinalDamage} = \max\left(1,\; \left\lfloor \text{RawDamage} \cdot \text{DefMultiplier} \cdot \text{ElemMultiplier} \cdot \text{CritMultiplier} \cdot \text{StaggerMultiplier} \cdot \text{ReactionMultiplier} \cdot \text{ModeMod} \cdot \text{Variance} \right\rfloor\right)$$

Trong đó `ModeMod` là `pveModifier` (mặc định `1.0`) hoặc `pvpModifier` (`0.45–0.70` cho PvP Arena M4+).

---

## 4. Công thức Phòng thủ Chủ động: Block, Perfect Parry, Dodge & Poise Break

- **Dodge**: Tiêu `20 Stamina`, `1200 ms` cooldown, cấp `300 ms` bất tử (`i-frame` giảm 100% damage và trạng thái CC thường; không né được đòn Enrage wipe).
- **Block thường**: Giảm `60%` sát thương vật lý/nguyên tố, tiêu `12 Stamina` mỗi đòn đỡ; nếu `Stamina` tụt về `0` sẽ bị `Guard Break` (choáng `1.0s`).
- **Perfect Parry**: Nếu đỡ trong cửa sổ **`200 ms`** đầu tiên khi đòn đánh chạm hitbox: giảm `100%` sát thương, không mất Stamina, hồi `15 Stamina` và phản lại **`25%` Poise Damage** lên quái/Boss!
- **Boss Poise / Stagger**:
  $$\text{PoiseDamageDealt} = \text{SkillPoiseDamage} \cdot (1 + \text{HeroPoiseBonus} + \text{Enh10PoiseBonus}) \cdot \text{WeaknessPoiseMult}$$
  Khi `Boss.currentPoise <= 0`: Boss rơi vào `STAGGERED` trong `5.0 giây` / `x1.35` sát thương (mặc định cho Elite) hoặc theo thông số riêng từng Boss chính trong `game-data/bosses.json` (`boss_thornback_elder`: `6.0s / x1.40`; `Ignis` & `Prism`: `6.5s / x1.45`; `Boreas` & `Malakor`: `7.0s / x1.50`), ngắt chiêu hiện tại, sau đó hồi `100% MaxPoise` (kháng CC cứng tăng thêm 20% mỗi chu kỳ, tối đa 3 lần phá giáp mỗi phase).

---

## 5. Công thức Hiệu năng Hồi chiêu & Bảng Trần Cân bằng

$$\text{EffectiveCooldownMs} = \max\left(400,\; \left\lfloor \text{BaseCooldownMs} \cdot (1 - \text{CDR}) \right\rfloor\right)$$
$$\text{EffectiveAttackIntervalMs} = \max\left(280,\; \left\lfloor \frac{\text{BaseAttackIntervalMs}}{\text{AttackSpeedMult}} \right\rfloor\right)$$

| Thông số | Trần cứng (Hard Cap) | Rủi ro bị triệt tiêu |
| :--- | :---: | :--- |
| `CritRate` | `75%` | Ngăn build 100% crit luôn kích hoạt proc vô hạn |
| `CritDamage` | `250%` | Ngăn one-shot Boss bỏ qua cơ chế phase |
| `CDR` | `40%` | Ngăn spam kỹ năng bất tử / perma-CC |
| `AttackSpeedMult` | `1.60x` (`+60%`) | Ngăn phá vỡ cửa sổ animation server 20 Hz |
| `DefPenPct` | `50%` | Giữ nguyên giá trị của chỉ số phòng thủ & vai trò Tank |
| `ElementalRes` | `70%` | Ngăn miễn nhiễm tuyệt đối nguyên tố Boss |
| `WeaponEnhancement` | `+10` | Giữ tuổi thọ nền kinh tế & không vượt thiết kế mặc định |
| `CC Diminishing Returns` | Lần 1: 100%, Lần 2: 50%, Lần 3: 25%, Lần 4 (trong 20s): Miễn nhiễm | Chặn tuyệt đối perma-stun quái Elite và PvP |
