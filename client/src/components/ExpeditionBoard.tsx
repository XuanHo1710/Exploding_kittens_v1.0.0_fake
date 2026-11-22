/**
 * Astral Expedition Pixel — màn hình chơi chính (khám phá, trận đấu theo lượt, đội hình, túi đồ, triệu hồi, tỉ lệ).
 *
 * Trận đấu chạy engine dùng chung (`shared/src/expedition/battle-engine.ts`) ngay trên client với cùng seed,
 * ghi nhật ký từng lượt; khi kết thúc gửi nhật ký lên server để server phát lại và xác thực kết quả.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  EQUIP_SLOTS,
  EQUIP_SLOT_LABELS_VI,
  AFFINITY_LABELS_VI,
  BATTLE_SUPPLIES,
  ELEMENT_LABELS_VI,
  EXPEDITION_BOSSES_BY_ID,
  EXPEDITION_GATEKEEPERS_BY_ID,
  EXPEDITION_HEROES,
  EXPEDITION_HEROES_BY_ID,
  EXPEDITION_REALMS_BY_ID,
  EXPEDITION_SKILLS_BY_ID,
  EXP_BALANCE,
  ITEM_RARITIES,
  ITEM_RARITY_COLORS,
  ITEM_RARITY_LABELS_VI,
  SIGNATURE_WEAPONS,
  WEAPON_BANNER,
  itemStatValue,
  weaponRefineCost,
  enhanceCost,
  MATERIALS,
  type MaterialId,
  Mulberry32,
  ROLE_LABELS_VI,
  STAT_KEYS,
  STAT_LABELS_VI,
  computeHeroFinalStats,
  configuredSkillIds,
  createBattleVisualStateSafe,
  executeTurnAction,
  expToNextLevel,
  affinityOf,
  getEnemyIntentTargets,
  heroCombatSkillIds,
  formatStatValue,
  getActiveEnemyMove,
  skillLevelCap,
  skillUnlockLevel,
  selectablePartyActors,
  skillUpgradeCost,
  resolveSkillFor,
  storySceneFor,
  statPointsUnspent,
  unlockedSkillIds,
  SSS_PITY,
  type BattleSessionState,
  type BattleSupply,
  type CombatSkillDefinition,
  type CharmGain,
  type EncounterKind,
  type DefenseGrade,
  type ExpeditionProfile,
  type ItemInstance,
  type LevelUpReport,
  type RealmMapId,
  type StatKey,
  type StoryScene,
  type SummonResultItem,
  type TurnActionRecord,
  type TurnResolutionEvent,
} from '../expedition/shared';
import {
  BATTLE_CANVAS_H,
  BATTLE_CANVAS_W,
  enqueueEventsIntoVisuals,
  getCombatantScreenAnchor,
  renderBattleCanvas,
  type BattleVisualState,
} from '../expedition/battleRenderer';
import {
  OVERWORLD_VIEW_H,
  OVERWORLD_VIEW_W,
  renderOverworldFrame,
  mapCrossings,
  recoverOverworldPosition,
  startCrossing,
  stepOverworldPhysics,
  wildPacksOf,
  wildSheetOf,
  type OverworldRuntimeState,
} from '../expedition/overworldRenderer';
import { expeditionApi } from '../expedition/rpc';
import { CONTROL_LIST, controlCodes, keyLabel, loadBindings, saveBindings, setBinding, type ControlAction, type ControlBindings } from '../expedition/controls';
import { CharmsView } from '../expedition/progression-ui';
import { BattleHud, type SkillCutIn } from '../expedition/battle-hud';
import { BattleResultScreen, type HeroGain } from '../expedition/result-ui';
import { CampScreen, HeroScreen, Keys, PageShell, portraitUrl, type MenuRoute, type PageId } from '../expedition/menu-ui';
import { JournalView, SceneTransition, StoryPlayer } from '../expedition/story-ui';
import { playExpeditionSfx, setExpeditionBgm, setExpeditionMuted, stopExpeditionBgm } from '../expedition/sound';
import { expeditionAssetUrl, getCachedImage, loadHeroWardrobe, setOutfitPortraits, preloadBattleAssets, preloadOverworldAssets, type HeroOutfit, type TiledTmjMap } from '../expedition/store';
import { RestScreen, type RestInfo } from '../expedition/rest-screen';
import { SummonCinematic } from '../expedition/summon-cinematic';
import { ChapterTipModal } from '../expedition/chapter-tips';
import { OwnerTag } from '../expedition/owner-tag';
import { MaterialChip } from '../expedition/enhance-panel';
import { signatureArtUrl, WeaponIcon } from '../expedition/weapon-art';
import { HERO_CHOREO } from '../expedition/hero-choreo';
import '../expedition/expedition.css';
import '../expedition/ui.css';

const PAGE_TITLES: Record<PageId, string> = {
  bag: 'Túi đồ',
  summon: 'Triệu hồi',
  journal: 'Hành trình',
  charms: 'Bùa hộ mệnh',
  settings: 'Cài đặt',
};

/** Esc lùi đúng một tầng: màn con → hồ sơ nhân vật → trại → đóng menu. */
function backRoute(route: MenuRoute | null): MenuRoute | null {
  if (!route) return { screen: 'camp' };
  if (route.screen === 'hero' && route.sub !== 'overview') return { ...route, sub: 'overview' };
  if (route.screen === 'camp') return null;
  return { screen: 'camp' };
}

interface Props {
  socket: Socket | null;
  onLeave: () => void;
}

interface BattleRun {
  session: BattleSessionState;
  rng: Mulberry32;
  log: TurnActionRecord[];
  vis: BattleVisualState;
}

type DefenseWindow = {
  startMs: number; beats: readonly number[]; grades: DefenseGrade[]; targetUids: string[];
  /** nhịp Tuyệt Kỹ bắt đầu từ chỉ số này (chỉ phím W phản được) */
  specialFrom?: number;
  moveNameVi?: string;
};

interface BattleResult {
  outcome: 'victory' | 'defeat';
  firstClear: boolean;
  sealReward: number;
  expReward: number;
  unlockedMapId?: RealmMapId;
  drops: ItemInstance[];
  charms: CharmGain[];
  levelUps: LevelUpReport[];
  gains: HeroGain[];
  materials?: Record<string, number>;
}

/** Cửa sổ Đỡ (hẹp, thưởng lớn) / Né (rộng, an toàn) quanh mỗi nhịp đánh, tính bằng ms. */
const PARRY_MS = 130;
const DODGE_MS = 200;
/** Đỡ lệch nhịp ≤ ngưỡng này = "Đỡ hoàn hảo" (chỉ khác hiệu ứng, không đổi luật). */
const PERFECT_PARRY_MS = 55;
/** Bù trễ hiển thị + âm thanh của trình duyệt. */
const DEFENSE_LATENCY_MS = 16;
/** Bấm hụt (không trúng nhịp nào) khoá phòng thủ một lúc: bấm loạn tệ hơn canh nhịp. */
const WHIFF_LOCK_MS = 320;
/** Cửa sổ phím W phản Tuyệt Kỹ (rộng hơn Đỡ một chút vì đòn chậm và nặng). */
const COUNTER_MS = 170;


export default function ExpeditionBoard({ socket, onLeave }: Props) {
  const [profile, setProfile] = useState<ExpeditionProfile | null>(null);
  const [route, setRoute] = useState<MenuRoute | null>(null);
  const [summonTab, setSummonTab] = useState<'banners' | 'rates'>('banners');
  const [cinematic, setCinematic] = useState(() => {
    try { return localStorage.getItem('astral-expedition.cinematic') !== 'off'; } catch { return true; }
  });
  const paused = route !== null;
  const [bindings, setBindings] = useState<ControlBindings>(loadBindings);
  const [quiet, setQuiet] = useState(false);
  const [toast, setToast] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [inBattle, setInBattle] = useState(false);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [summonResult, setSummonResultRaw] = useState<{ heroes?: SummonResultItem[]; items?: ItemInstance[] } | null>(null);
  const [summonCine, setSummonCine] = useState(false);
  const setSummonResult = useCallback((r: { heroes?: SummonResultItem[]; items?: ItemInstance[] } | null) => {
    setSummonResultRaw(r);
    setSummonCine(Boolean(r));
  }, []);
  const [selectedHeroId, setSelectedHeroId] = useState<string>('');
  const [wardrobe, setWardrobe] = useState<HeroOutfit[]>([]);
  // trang phục đã chọn nhớ theo trình duyệt
  const [selectedOutfits, setSelectedOutfits] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('astral-expedition.outfits') ?? '{}') as Record<string, string>; } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem('astral-expedition.outfits', JSON.stringify(selectedOutfits)); } catch { /* không lưu được */ }
  }, [selectedOutfits]);
  const selectedLooks = wardrobe.filter((entry) => selectedOutfits[entry.heroId] === entry.variantId);
  setOutfitPortraits(selectedLooks); // chân dung đổi theo trang phục ở mọi màn hình
  const looksRef = useRef<HeroOutfit[]>([]);
  looksRef.current = selectedLooks;
  const [story, setStory] = useState<{ scene: StoryScene; after?: () => void } | null>(null);
  const [rest, setRest] = useState<RestInfo | null>(null);
  /** chương vừa hoàn thành → giới thiệu kỹ năng mới của vùng kế (thứ tự vùng) */
  const [chapterTip, setChapterTip] = useState<number | null>(null);
  const restRef = useRef(false);
  restRef.current = Boolean(rest);
  const [transition, setTransition] = useState<{ kind: 'battle' | 'warp' | 'boss'; label: string } | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const shownScenes = useRef(new Set<string>());
  const startingBattle = useRef(false);
  const committing = useRef(false);
  const transitionTimer = useRef<number | undefined>(undefined);
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => (t + 1) % 1_000_000), []);

  const profileRef = useRef<ExpeditionProfile | null>(null);
  profileRef.current = profile;

  useEffect(() => {
    let alive = true;
    void loadHeroWardrobe().then((outfits) => { if (alive) setWardrobe(outfits); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? '' : t)), 3200);
  }, []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, onOk?: (r: T) => void) => {
      if (busy) return;
      setBusy(true);
      try {
        const r = await fn();
        onOk?.(r);
      } catch (e) {
        flash((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [busy, flash],
  );

  // ---------------------------------------------------------------- battle
  const battleRef = useRef<BattleRun | null>(null);
  const [defense, setDefense] = useState<DefenseWindow | null>(null);
  const defenseRef = useRef<DefenseWindow | null>(null);
  const updateDefense = useCallback((next: DefenseWindow | null) => {
    defenseRef.current = next;
    setDefense(next);
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cutIn, setCutIn] = useState<SkillCutIn | null>(null);
  const cutInTimer = useRef<number | undefined>(undefined);
  const [attackerUid, setAttackerUid] = useState('');
  const [targetUid, setTargetUid] = useState<string | undefined>(undefined);
  const lockUntilRef = useRef(0);

  const finishBattle = useCallback(async () => {
    const b = battleRef.current;
    if (!b || committing.current || result) return;
    committing.current = true;
    setCommitError(null);
    setMenuOpen(false);
    const won = b.session.state === 'VICTORY';
    playExpeditionSfx(won ? 'victory' : 'defeat');
    try {
      const before = profileRef.current;
      const r = await expeditionApi.commitBattle(socket, b.session.battleId, b.log);
      const partyIds = [...new Set(b.session.combatants.filter((c) => c.side === 'party').map((c) => c.templateId))];
      const gains: HeroGain[] = partyIds.flatMap((heroId) => {
        const was = before?.heroes[heroId];
        const now = r.profile.heroes[heroId];
        return was && now ? [{ heroId, fromLevel: was.level, fromExp: was.exp, toLevel: now.level, toExp: now.exp }] : [];
      });
      setProfile(r.profile);
      setResult({
        gains,
        outcome: r.outcome,
        firstClear: r.firstClear,
        sealReward: r.sealReward,
        expReward: r.expReward,
        unlockedMapId: r.unlockedMapId,
        drops: r.drops ?? [],
        charms: r.charms ?? [],
        levelUps: r.levelUps ?? [],
        materials: r.materials ?? {},
      });
    } catch (e) {
      setCommitError((e as Error).message);
    } finally {
      committing.current = false;
    }
  }, [socket, result]);

  const applyAction = useCallback(
    (rec: Omit<TurnActionRecord, 'stepIndex'>, meta?: { skill?: CombatSkillDefinition }) => {
      const b = battleRef.current;
      if (!b) return;
      const full: TurnActionRecord = { ...rec, stepIndex: b.log.length };
      const caster = b.session.combatants.find((unit) => unit.unitUid === rec.actorUid);
      const resolvedSkill = caster && meta?.skill ? resolveSkillFor(caster, meta.skill) : null;
      const enemyMove = caster?.side === 'enemy' && rec.kind === 'enemy_turn' && !caster.staggerTurns ? getActiveEnemyMove(b.session) : null;
      const vfxKey = resolvedSkill
        ? `${resolvedSkill.element.toLowerCase()}_${resolvedSkill.skill.vfxSpec.beamStyle ?? 'slash'}`
        : enemyMove && caster ? `${caster.element.toLowerCase()}_${enemyMove.beamStyle}` : undefined;
      let events: TurnResolutionEvent[] = [];
      try {
        events = executeTurnAction(b.session, full, b.rng);
      } catch (e) {
        flash((e as Error).message);
        if (caster?.side === 'party') setMenuOpen(true);
        return;
      }
      b.log.push(full);
      b.vis.castSkillId = rec.kind === 'player_skill' ? rec.skillId : undefined;
      const now = performance.now();
      const dur = enqueueEventsIntoVisuals({
        vis: b.vis,
        session: b.session,
        events,
        actorUid: rec.actorUid,
        kind: rec.kind,
        skillSlotKind: meta?.skill?.slotKind,
        vfxKey,
        nowMs: now,
      });
      if (events.some((e) => e.kind === 'break_stagger')) playExpeditionSfx('break_shatter');
      else if (events.some((e) => e.kind === 'parry_counter')) playExpeditionSfx('parry_riposte');
      else if (events.some((e) => e.kind === 'hit')) playExpeditionSfx('hit_impact');
      if (events.some((e) => e.kind === 'boss_phase_shift')) playExpeditionSfx('boss_phase');
      lockUntilRef.current = now + dur;
      rerender();
      window.setTimeout(() => proceedRef.current(), dur + 120);
    },
    [flash, rerender],
  );

  const proceedRef = useRef<() => void>(() => {});
  proceedRef.current = () => {
    const b = battleRef.current;
    if (!b) return;
    const s = b.session;
    if (s.state === 'VICTORY' || s.state === 'DEFEAT') {
      void finishBattle();
      return;
    }
    const actor = s.combatants.find((c) => c.unitUid === s.activeActorUid);
    if (!actor) return;
    if (actor.side === 'party') {
      setAttackerUid(actor.unitUid);
      setTargetUid((t) => (s.combatants.some((c) => c.unitUid === t && c.alive && c.side === 'enemy') ? t : s.combatants.find((c) => c.side === 'enemy' && c.alive)?.unitUid));
      setMenuOpen(true);
      rerender();
      return;
    }
    setMenuOpen(false);
    if (actor.staggerTurns > 0) {
      applyAction({ actorUid: actor.unitUid, kind: 'enemy_turn', defenseGrades: {} });
      return;
    }
    const move = getActiveEnemyMove(s);
    const canDefend = move.hitBeatsMs.length > 0;
    if (!canDefend) {
      b.vis.telegraphBanner = { moveNameVi: move.nameVi, detailVi: '' };
      const delay = 740;
      lockUntilRef.current = performance.now() + delay;
      window.setTimeout(() => {
        if (battleRef.current !== b) return;
        b.vis.telegraphBanner = null;
        applyAction({ actorUid: actor.unitUid, kind: 'enemy_turn' });
      }, delay);
      return;
    }
    const startMs = performance.now() + 380;
    const targetUids = getEnemyIntentTargets(s);
    const closeIn = move.anim ? ['lunge', 'combo', 'leap', 'feint', 'dash'].includes(move.anim) : move.beamStyle === 'slash';
    b.vis.motion = { actorUid: actor.unitUid, targetUids, startMs, beats: move.hitBeatsMs, melee: closeIn, anim: move.anim };
    b.vis.telegraphBanner = { moveNameVi: move.nameVi, detailVi: move.telegraphVi };
    updateDefense({ startMs, beats: move.hitBeatsMs, grades: [], targetUids, specialFrom: move.specialFrom, moveNameVi: move.nameVi });
  };

  const resolveDefend = useCallback(
    (q: DefenseWindow) => {
      const b = battleRef.current;
      if (!b) return;
      b.vis.telegraphBanner = null;
      const grades: DefenseGrade[] = q.beats.map((_, i) => q.grades[i] ?? 'hit');
      const defenseGrades: Record<string, DefenseGrade[]> = {};
      for (const uid of q.targetUids) defenseGrades[uid] = grades;
      updateDefense(null);
      applyAction({ actorUid: b.session.activeActorUid, kind: 'enemy_turn', defenseGrades });
    },
    [applyAction, updateDefense],
  );

  useEffect(() => {
    if (!defense) return;
    const end = defense.startMs + defense.beats[defense.beats.length - 1] + DODGE_MS;
    const timer = window.setTimeout(() => {
      if (defenseRef.current === defense) resolveDefend(defense);
    }, Math.max(0, end - performance.now()));
    return () => window.clearTimeout(timer);
  }, [defense, resolveDefend]);

  const whiffUntilRef = useRef(0);
  const pressDefense = useCallback((action: 'parry' | 'dodge' | 'counter', pressedAt?: number) => {
    const q = defenseRef.current;
    const b = battleRef.current;
    if (!q || !b) return;
    // dùng mốc thời gian của sự kiện phím (cùng đồng hồ với performance.now) thay vì lúc xử lý
    const now = Math.min(performance.now(), pressedAt && pressedAt > 0 ? pressedAt : performance.now());
    if (now < whiffUntilRef.current) return;
    if (b.vis.response && now - b.vis.response.at < 110) return;
    const t = now - DEFENSE_LATENCY_MS;
    const windowMs = action === 'parry' ? PARRY_MS : action === 'counter' ? COUNTER_MS : DODGE_MS;
    const isSpecial = (i: number) => q.specialFrom !== undefined && i >= q.specialFrom;
    // khớp nhịp GẦN NHẤT chưa chấm, đúng loại: W ↔ nhịp Tuyệt Kỹ, Đỡ / Né ↔ nhịp thường
    let idx = -1;
    let off = Infinity;
    let wrongKind = false;
    q.beats.forEach((beat, i) => {
      if (q.grades[i]) return;
      const d = Math.abs(q.startMs + beat - t);
      if (d > Math.max(windowMs, COUNTER_MS)) return;
      if ((action === 'counter') !== isSpecial(i)) { wrongKind = true; return; }
      if (d <= windowMs && d < off) { off = d; idx = i; }
    });
    b.vis.response = { targetUids: q.targetUids, row: action === 'dodge' ? 4 : 3, at: now, landed: idx >= 0 };
    const target = b.session.combatants.find((c) => c.unitUid === q.targetUids[0]);
    const pop = (text: string, color: string, big = false) => {
      if (!target) return;
      const a = getCombatantScreenAnchor(b.session, target);
      b.vis.popups.push({ id: b.vis.nextPopupId++, x: a.x, y: a.y - 92, text, color, bornMs: now, durationMs: 760, big });
    };
    if (idx < 0) {
      whiffUntilRef.current = now + WHIFF_LOCK_MS;
      pop(wrongKind ? (action === 'counter' ? 'W CHỈ DÙNG CHO TUYỆT KỸ' : 'W ĐỂ COUNTER!') : 'TRƯỢT', wrongKind ? '#ff8a7a' : '#9aa3ad');
      return;
    }
    const grades = [...q.grades];
    grades[idx] = action;
    if (action === 'counter') {
      pop(q.targetUids.length > 1 ? 'CẢ ĐỘI PHẢN DAMAGE!' : 'PHẢN DAMAGE!', '#ffd36a', true);
      b.vis.flashUntilMs = now + 140;
      b.vis.flashColor = 'rgba(255, 255, 255, 0.55)';
      playExpeditionSfx('parry_riposte');
    } else if (action === 'parry') {
      const perfect = off <= PERFECT_PARRY_MS;
      pop(perfect ? 'ĐỠ HOÀN HẢO!' : 'ĐỠ!', perfect ? '#ffe27a' : '#f2d896', perfect);
      b.vis.flashUntilMs = now + (perfect ? 90 : 50);
      b.vis.flashColor = 'rgba(255, 236, 170, 0.35)';
    } else {
      pop('NÉ!', '#8fe3ff');
    }
    if (action !== 'counter') playExpeditionSfx(action === 'parry' ? 'parry_clang' : 'dodge_whoosh');
    updateDefense({ ...q, grades });
  }, [updateDefense]);

  const chooseSkill = useCallback(
    (skill: CombatSkillDefinition) => {
      const b = battleRef.current;
      if (!b || !menuOpen || performance.now() < lockUntilRef.current) return;
      const ready = selectablePartyActors(b.session);
      const actor = ready.find((unit) => unit.unitUid === attackerUid) ?? ready[0];
      if (!actor || skill.slotKind === 'passive' || !actor.unlockedSkillIds?.includes(skill.skillId)) return;
      if (skill.slotKind !== 'basic' && actor.equippedSkillIds && !actor.equippedSkillIds.includes(skill.skillId)) return;
      const resolved = resolveSkillFor(actor, skill);
      if (actor.ap < resolved.apCost) return;
      playExpeditionSfx('confirm');
      setMenuOpen(false);
      const offensive = skill.targetScope === 'single_enemy' || skill.targetScope === 'all_enemies';
      const beats = offensive ? resolved.hits.filter((h) => h.powerMult > 0).map((h) => h.timedHitOffsetMs) : [];
      if ((skill.slotKind === 'active' || skill.slotKind === 'ultimate') && beats.length > 0) {
        // cut-in kiểu manga chỉ cho kỹ năng có đòn đánh (không dùng cho hồi máu, buff, đánh thường)
        const ult = skill.slotKind === 'ultimate';
        setCutIn({ id: performance.now(), heroId: actor.templateId, nameVi: skill.nameVi, element: resolved.element, ult });
        window.clearTimeout(cutInTimer.current);
        cutInTimer.current = window.setTimeout(() => setCutIn(null), ult ? 2100 : 1500);
      }
      if (!beats.length) {
        applyAction({ actorUid: actor.unitUid, kind: 'player_skill', skillId: skill.skillId, targetUid, timedHitGrades: [] }, { skill });
        return;
      }
      // kỹ năng có cut-in: đợi dải đen khép xong mới ra đòn
      const startMs = performance.now() + (skill.slotKind === 'ultimate' ? 820 : skill.slotKind === 'active' ? 520 : 240);
      const target = b.session.combatants.find((c) => c.side === 'enemy' && c.alive && c.unitUid === targetUid)
        ?? b.session.combatants.find((c) => c.side === 'enemy' && c.alive);
      const closeCombat = (skill.vfxSpec.beamStyle ?? 'slash') === 'slash'
        && !['lyra_frostbow', 'celine_prism', 'lumina_chrono', 'nereus_tide'].includes(actor.templateId);
      const close = HERO_CHOREO[skill.skillId]?.close ?? closeCombat;
      b.vis.motion = { actorUid: actor.unitUid, targetUids: target ? [target.unitUid] : [], startMs, beats, melee: close, cast: !close, skillId: skill.skillId };
      lockUntilRef.current = startMs + beats[beats.length - 1] + 90;
      window.setTimeout(() => {
        if (battleRef.current !== b) return;
        applyAction({ actorUid: actor.unitUid, kind: 'player_skill', skillId: skill.skillId, targetUid: target?.unitUid,
          timedHitGrades: resolved.hits.map(() => 'good') }, { skill });
      }, lockUntilRef.current - performance.now());
    },
    [menuOpen, attackerUid, targetUid, applyAction],
  );

  const showTransition = useCallback((kind: 'battle' | 'warp' | 'boss', label: string) => {
    setTransition({ kind, label });
    window.clearTimeout(transitionTimer.current);
    transitionTimer.current = window.setTimeout(() => setTransition(null), 460);
  }, []);

  const playStory = useCallback((scene: StoryScene | undefined, after?: () => void) => {
    if (!scene || shownScenes.current.has(scene.sceneId) || profileRef.current?.storySeen?.includes(scene.sceneId)) return false;
    setStory({ scene, after });
    return true;
  }, []);

  const finishStory = useCallback(() => {
    if (!story) return;
    const { scene, after } = story;
    shownScenes.current.add(scene.sceneId);
    setStory(null);
    if (!profileRef.current?.storySeen?.includes(scene.sceneId)) {
      void expeditionApi.markStorySeen(socket, scene.sceneId).then((updated) => {
        setProfile((current) => current ? { ...current, storySeen: [...new Set([...(current.storySeen ?? []), ...(updated.storySeen ?? [])])] } : updated);
      }).catch((e: Error) => flash(e.message));
    }
    after?.();
  }, [story, socket, flash]);

  const enterBattle = useCallback((session: BattleSessionState) => {
    const enemies = session.combatants.filter((c) => c.side === 'enemy');
    const renderedSession = structuredClone(session);
    for (const combatant of [...renderedSession.combatants, ...(renderedSession.reserves ?? [])]) {
      if (combatant.side !== 'party') continue;
      const look = looksRef.current.find((outfit) => outfit.heroId === combatant.templateId);
      if (look) combatant.spriteRef = look.battle;
    }
    battleRef.current = {
      session: renderedSession, rng: new Mulberry32(session.battleSeed), log: [], vis: createBattleVisualStateSafe(),
    };
    setInBattle(true);
    setTargetUid(undefined);
    updateDefense(null);
    lockUntilRef.current = 0;
    setExpeditionBgm(session.encounterKind === 'boss' ? (session.mapId === '07-aurora-zenith' ? 'aurora_final' : 'boss') : 'battle');
    showTransition(session.encounterKind === 'boss' ? 'boss' : 'battle', enemies[0]?.nameVi ?? 'Giao tranh');
    void preloadBattleAssets({
      mapId: session.mapId,
      heroIds: [...session.combatants.filter((c) => c.side === 'party'), ...(session.reserves ?? [])].map((c) => c.templateId),
      encounterKind: session.encounterKind,
      enemySpriteKeys: enemies.map((c) => c.templateId),
      spriteRefs: [...renderedSession.combatants, ...(renderedSession.reserves ?? [])].flatMap((c) => c.spriteRef ? [c.spriteRef] : []),
    }).catch((e: Error) => flash(e.message)).finally(() => {
      window.setTimeout(() => {
        if (battleRef.current?.session.battleId === session.battleId) proceedRef.current();
      }, 460);
    });
  }, [flash, showTransition, updateDefense]);

  const startBattle = useCallback(
    async (kind: EncounterKind, targetId: string, mapId: RealmMapId) => {
      if (battleRef.current || startingBattle.current) return;
      startingBattle.current = true;
      try {
        const s = await expeditionApi.startBattle(socket, kind, targetId, mapId);
        enterBattle(s);
      } catch (e) {
        flash((e as Error).message);
        owRef.current.immunityUntilMs = performance.now() + 1500;
      } finally {
        startingBattle.current = false;
      }
    },
    [socket, enterBattle, flash],
  );

  useEffect(() => {
    let alive = true;
    const load = () => expeditionApi.loadProfile(socket).then(({ profile: p, activeBattle }) => {
      if (!alive) return;
      setProfile(p);
      setSelectedHeroId((cur) => p.heroes[cur] ? cur : p.activeParty[0] || Object.keys(p.heroes)[0]);
      if (activeBattle && !battleRef.current && !startingBattle.current) enterBattle(activeBattle);
    }).catch((e: Error) => alive && flash(e.message));
    if (socket?.connected) void load();
    socket?.on('connect', load);
    return () => {
      alive = false;
      socket?.off('connect', load);
      stopExpeditionBgm();
    };
  }, [socket, enterBattle, flash]);

  useEffect(() => () => {
    battleRef.current = null;
    window.clearTimeout(transitionTimer.current);
  }, []);

  const closeResult = useCallback(() => {
    if (result?.outcome === 'victory' && result.unlockedMapId) setChapterTip(EXPEDITION_REALMS_BY_ID[result.unlockedMapId]?.order ?? null);
    setResult(null);
    battleRef.current = null;
    setInBattle(false);
    updateDefense(null);
    setExpeditionBgm('overworld');
    owRef.current.immunityUntilMs = performance.now() + 3000;
    owRef.current.promptHint = null;
    const p = profileRef.current;
    if (p && result?.outcome === 'defeat') {
      owRef.current.px = p.pos.x;
      owRef.current.py = p.pos.y;
    }
  }, [result, updateDefense]);

  /** Rút lui khỏi trận: server hủy phiên, quay lại bản đồ, không thưởng. Cũng là lối thoát khi không chốt được kết quả. */
  const retreatBattle = useCallback(async () => {
    const b = battleRef.current;
    if (!b || committing.current) return;
    try {
      const updated = await expeditionApi.retreatBattle(socket, b.session.battleId);
      setProfile(updated);
    } catch (e) {
      flash((e as Error).message);
      return;
    }
    battleRef.current = null;
    setInBattle(false);
    setMenuOpen(false);
    setCommitError(null);
    updateDefense(null);
    setExpeditionBgm('overworld');
    owRef.current.immunityUntilMs = performance.now() + 3500;
    owRef.current.promptHint = null;
    flash('Đã rút lui khỏi trận.');
  }, [socket, flash, updateDefense]);

  // ---------------------------------------------------------------- overworld
  const owCanvas = useRef<HTMLCanvasElement | null>(null);
  const miniCanvas = useRef<HTMLCanvasElement | null>(null);
  const btCanvas = useRef<HTMLCanvasElement | null>(null);
  const owRef = useRef<OverworldRuntimeState>({
    px: 4,
    py: 12,
    dir: 0,
    moving: false,
    immunityUntilMs: 0,
    promptHint: null,
  });
  const [tmj, setTmj] = useState<TiledTmjMap | null>(null);
  const keys = useRef<Set<string>>(new Set());
  const mapId = profile?.currentMapId;
  const realm = mapId ? EXPEDITION_REALMS_BY_ID[mapId] : undefined;
  const leaderId = profile?.activeParty[0] ?? 'gustave_blade';
  const leaderMovementPath = selectedLooks.find((outfit) => outfit.heroId === leaderId)?.movement;
  const loadedMapRef = useRef<RealmMapId | undefined>(undefined);
  const [hint, setHint] = useState<OverworldRuntimeState['promptHint']>(null);

  useEffect(() => {
    if (!profile || !realm || !tmj || inBattle || result || story || transition || startingBattle.current || paused) return;
    if (playStory(storySceneFor({ kind: 'start' }))) return;
    if (playStory(storySceneFor({ kind: 'enter', mapId: realm.mapId }))) return;
    if (profile.clearedBosses.includes(realm.bossAltar.bossId)) {
      playStory(storySceneFor({ kind: 'post_boss', bossId: realm.bossAltar.bossId }));
    }
  }, [profile, realm, tmj, inBattle, result, story, transition, paused, playStory]);

  useEffect(() => {
    if (story || transition || paused) {
      keys.current.clear();
    }
  }, [story, transition, paused]);

  useEffect(() => {
    if (!profile || !realm) return;
    let alive = true;
    setTmj(null);
    if (loadedMapRef.current !== realm.mapId) {
      owRef.current.px = profile.pos.x;
      owRef.current.py = profile.pos.y;
      owRef.current.travel = undefined;
      owRef.current.lift = 0;
      loadedMapRef.current = realm.mapId;
    }
    const archs = realm.gatekeeperIds.map((id) => EXPEDITION_GATEKEEPERS_BY_ID[id]?.archetype).filter(Boolean) as string[];
    const wildSheets = [...new Set(wildPacksOf(realm).flatMap((pack) => pack.monsterIds.map(wildSheetOf)))];
    preloadOverworldAssets({ mapId: realm.mapId, theme: realm.theme, leaderHeroId: leaderId, leaderMovementPath, gatekeeperArchetypes: archs, extraSheets: wildSheets })
      .then((t) => {
        if (!alive) return;
        const current = profileRef.current ?? profile;
        if (recoverOverworldPosition(owRef.current, t, realm, current, performance.now())) {
          flash('Đã trở về điểm nghỉ để tiếp tục di chuyển.');
        }
        setTmj(t);
      })
      .catch((e) => alive && flash((e as Error).message));
    if (!battleRef.current) setExpeditionBgm('overworld');
    return () => {
      alive = false;
    };
    // reload only when the map changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId, leaderId, leaderMovementPath]);

  const interact = useCallback(() => {
    const p = profileRef.current;
    const h = owRef.current.promptHint;
    if (!p || !h || !realm || busy || story || transition || startingBattle.current || owRef.current.travel) return;
    if (h.kind === 'ladder' || h.kind === 'rope') {
      if (tmj) startCrossing(owRef.current, tmj, realm, p, performance.now(), 'interact');
      return;
    }
    if (h.kind === 'anchor') {
      const defeated = [...(p.defeatedSinceRest ?? [])];
      void run(() => expeditionApi.reachAnchor(socket, realm.mapId, h.targetId), (np) => {
        setProfile(np);
        keys.current.clear();
        // quái đã hạ ẩn trong lúc màn nghỉ hiện, khi đóng màn thì hiện dần (pop-in)
        owRef.current.respawnFx = { startMs: Number.POSITIVE_INFINITY, ids: defeated };
        playExpeditionSfx('anchor_rest');
        setRest({
          anchorName: realm.restAnchors.find((a) => a.anchorId === h.targetId)?.nameVi ?? 'Trạm Nghỉ',
          respawned: np.lastRest?.respawned ?? defeated.length,
          supplies: np.supplies ?? {},
        });
      });
    } else if (h.kind === 'chest') {
      const chest = realm.chests.find((c) => c.chestId === h.targetId);
      // bật hiệu ứng ngay khi bấm (cảm giác nhanh); server từ chối thì huỷ hiệu ứng
      owRef.current.chestFx = { chestId: h.targetId, startMs: performance.now(), seal: chest?.astralSealReward ?? 0, crystal: chest?.expCrystalReward ?? 0 };
      playExpeditionSfx('chest_open');
      void run(() => expeditionApi.openChest(socket, realm.mapId, h.targetId).catch((e) => {
        owRef.current.chestFx = undefined;
        throw e;
      }), (np) => {
        setProfile(np);
        const opened = np.openedChests.filter((id) => realm.chests.some((c) => c.chestId === id)).length;
        flash(`Đã mở rương (${opened}/${realm.chests.length} rương vùng này)`);
      });
    } else if (h.kind === 'boss') {
      if (realm.gatekeeperIds.some((id) => !p.clearedGatekeepers.includes(id))) {
        flash('Cần hạ hết Quái Gác Cổng trước khi khiêu chiến Đại Trùm.');
        return;
      }
      const fight = () => void startBattle('boss', h.targetId, realm.mapId);
      if (!p.clearedBosses.includes(h.targetId) && playStory(storySceneFor({ kind: 'pre_boss', bossId: h.targetId }), fight)) return;
      fight();
    } else if (h.kind === 'exit_portal' || h.kind === 'back_portal') {
      void run(() => expeditionApi.warpRealm(socket, realm.mapId, h.targetId as RealmMapId), (np) => {
        setProfile(np);
        showTransition('warp', EXPEDITION_REALMS_BY_ID[np.currentMapId]?.nameVi ?? np.currentMapId);
        flash(`Đã tới ${EXPEDITION_REALMS_BY_ID[np.currentMapId]?.nameVi ?? np.currentMapId}`);
      });
    }
  }, [realm, tmj, busy, run, socket, flash, startBattle, story, transition, playStory, showTransition]);

  // keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.code;
      if (story || transition) return;
      if (k === 'Escape' && !battleRef.current && !e.repeat) {
        e.preventDefault();
        setRoute(backRoute);
        return;
      }
      if (paused) return;
      const bound = (action: ControlAction) => controlCodes(bindings, action).includes(k);
      if (defenseRef.current) {
        if (e.repeat) return;
        if (bound('counter')) {
          e.preventDefault();
          pressDefense('counter', e.timeStamp);
        } else if (bound('parry') || bound('dodge')) {
          e.preventDefault();
          pressDefense(bound('parry') ? 'parry' : 'dodge', e.timeStamp);
        }
        return;
      }
      const currentBattle = battleRef.current;
      if (currentBattle && menuOpen && !e.repeat && (bound('attacker') || bound('basic'))) {
        const ready = selectablePartyActors(currentBattle.session);
        if (!ready.length) return;
        e.preventDefault();
        const index = Math.max(0, ready.findIndex((unit) => unit.unitUid === attackerUid));
        if (bound('attacker')) {
          setAttackerUid(ready[(index + 1) % ready.length].unitUid);
          return;
        }
        const skillId = EXPEDITION_HEROES_BY_ID[ready[index].templateId]?.skillIds[0];
        const skill = skillId ? EXPEDITION_SKILLS_BY_ID[skillId] : undefined;
        if (skill) chooseSkill(skill);
        return;
      }
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      keys.current.add(k);
      if (bound('grip') && !e.repeat && !currentBattle && tmj && realm && profileRef.current) {
        e.preventDefault();
        startCrossing(owRef.current, tmj, realm, profileRef.current, performance.now(), 'grip');
      }
      if (bound('interact') && !e.repeat && !battleRef.current) {
        e.preventDefault();
        interact();
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const clearInput = () => {
      keys.current.clear();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clearInput);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clearInput);
    };
  }, [pressDefense, interact, paused, story, transition, chooseSkill, menuOpen, bindings, attackerUid, realm, tmj, setRoute]);

  // render loops
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let hintKey = '';
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const p = profileRef.current;
      const b = battleRef.current;
      if (b && btCanvas.current) {
        const ctx = btCanvas.current.getContext('2d');
        if (ctx) renderBattleCanvas({ ctx, nowMs: now, session: b.session, vis: b.vis, hoverTargetUid: targetUid });
      } else if (p && tmj && realm && owCanvas.current && !result) {
        const k = keys.current;
        const step = (action: ControlAction) => controlCodes(bindings, action).some((code) => k.has(code)) ? 1 : 0;
        const dx = step('right') - step('left');
        const dy = step('down') - step('up');
        if (!paused && !story && !transition && !startingBattle.current && !busy && !restRef.current) {
          const contact = stepOverworldPhysics({ rt: owRef.current, inputDx: dx, inputDy: dy, sprint: Boolean(step('sprint')), dtSec: dt, nowMs: now, tmj, realm, profile: p });
          if (contact) void startBattle(contact.kind, contact.targetId, realm.mapId);
        }
        const ctx = owCanvas.current.getContext('2d');
        if (ctx) renderOverworldFrame({ ctx, nowMs: now, tmj, realm, profile: p, rt: owRef.current, leaderMovementPath });
        const mini = miniCanvas.current?.getContext('2d');
        const miniature = getCachedImage(`maps/${realm.mapId}/terrain.png`);
        if (mini && miniature) {
          mini.imageSmoothingEnabled = false;
          mini.drawImage(miniature, 0, 0, 156, 84);
          mini.fillStyle = '#ffac58';
          for (const anchor of realm.restAnchors) mini.fillRect(Math.round(anchor.x / tmj.width * 156), Math.round(anchor.y / tmj.height * 84), 3, 3);
          mini.fillStyle = '#9bdecf';
          for (const link of mapCrossings(tmj)) mini.fillRect(Math.round(link.from.x / tmj.width * 156), Math.round(link.from.y / tmj.height * 84), 2, 2);
          mini.fillStyle = '#ffe295';
          mini.fillRect(Math.round((owRef.current.px+.5) / tmj.width * 156) - 2,
            Math.round((owRef.current.py+.5) / tmj.height * 84) - 2, 5, 5);
        }
        const hk = owRef.current.promptHint ? owRef.current.promptHint.kind + owRef.current.promptHint.targetId : '';
        if (hk !== hintKey) {
          hintKey = hk;
          setHint(owRef.current.promptHint ? { ...owRef.current.promptHint } : null);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tmj, realm, paused, bindings, result, startBattle, story, transition, busy, leaderMovementPath, targetUid]);


  // ---------------------------------------------------------------- render
  if (!profile) {
    return (
      <div className="exp-root exp-loading">
        <div className="exp-spinner" />
        <p>Đang mở hồ sơ thám hiểm…</p>
        {toast && <div className="exp-toast">{toast}</div>}
      </div>
    );
  }

  const b = battleRef.current;
  const looks: Record<string, string> = Object.fromEntries(selectedLooks.map((o) => [o.heroId, o.movement]));
  const keyOf = (action: ControlAction) => keyLabel(controlCodes(bindings, action)[0]);
  const gkDone = realm ? realm.gatekeeperIds.filter((id) => profile.clearedGatekeepers.includes(id)).length : 0;
  const shared = { profile, socket, run, setProfile, busy };
  const page = (id: PageId) => {
    if (id === 'bag') {
      return (
        <>
          <div className="exp-supply-list">{Object.entries(BATTLE_SUPPLIES).map(([sid, item]) => <span key={sid}>{item.nameVi} ×{profile.supplies?.[sid as BattleSupply] ?? 0}</span>)}</div>
          <BagView profile={profile} socket={socket} run={run} setProfile={setProfile} selectedHeroId={selectedHeroId} busy={busy} flash={flash} />
        </>
      );
    }
    if (id === 'charms') return <CharmsView profile={profile} />;
    if (id === 'journal') {
      return (
        <div className="ui-page-map">
          <div>
            <img src={expeditionAssetUrl(`maps/${profile.currentMapId}/terrain.png`)} alt={realm?.nameVi} />
            <RealmProgress profile={profile} />
          </div>
          <JournalView profile={profile} onReplay={(scene) => setStory({ scene })} />
        </div>
      );
    }
    if (id === 'summon') {
      return (
        <>
          <div className="ui-summon-tabs">
            <button type="button" className={summonTab === 'banners' ? 'on' : ''} onClick={() => setSummonTab('banners')}>Triệu hồi</button>
            <button type="button" className={summonTab === 'rates' ? 'on' : ''} onClick={() => setSummonTab('rates')}>Tỉ lệ công khai</button>
          </div>
          {summonTab === 'banners'
            ? <SummonView profile={profile} socket={socket} run={run} setProfile={setProfile} setSummonResult={setSummonResult} busy={busy} />
            : <RatesView />}
        </>
      );
    }
    return (
      <div className="exp-settings ui-settings">
        <ControlSettings bindings={bindings} onChange={(next) => {
          keys.current.clear(); setBindings(next); saveBindings(next);
        }} />
        <label>Camera điện ảnh khi ra đòn <input type="checkbox" checked={cinematic} onChange={(e) => {
          setCinematic(e.target.checked);
          try { localStorage.setItem('astral-expedition.cinematic', e.target.checked ? 'on' : 'off'); } catch { /* chế độ riêng tư */ }
        }} /></label>
        <label>Âm thanh <input type="checkbox" checked={!quiet} onChange={(e) => {
          setQuiet(!e.target.checked); setExpeditionMuted(!e.target.checked); if (e.target.checked) setExpeditionBgm('overworld');
        }} /></label>
        <label>Độ khó <select value={profile.difficulty ?? 'standard'} disabled={busy} onChange={(e) => {
          const difficulty = e.target.value;
          void run(() => expeditionApi.upgradeHero(socket, { heroId: leaderId, kind: 'difficulty', difficulty }), setProfile);
        }}><option value="story">Cốt truyện</option><option value="standard">Chuẩn</option><option value="hard">Khó</option></select></label>
        <button type="button" onClick={onLeave}>Thoát game</button>
      </div>
    );
  };
  return (
    <div className="exp-root exp-fullscreen">
      <div className="ui-stage">
      {inBattle && b ? (
        <BattleHud
          session={b.session}
          vis={b.vis}
          cinematic={cinematic}
          cutIn={cutIn}
          canvasRef={btCanvas}
          menuOpen={menuOpen}
          defending={Boolean(defense)}
          attackerUid={attackerUid}
          setAttackerUid={setAttackerUid}
          parryKey={keyOf('parry')}
          dodgeKey={keyOf('dodge')}
          counterKey={keyOf('counter')}
          special={defense?.specialFrom !== undefined
            ? { beatAt: defense.startMs + defense.beats[defense.specialFrom], nameVi: defense.moveNameVi ?? 'Tuyệt Kỹ', done: Boolean(defense.grades[defense.specialFrom]), aoe: defense.targetUids.length > 1 }
            : null}
          basicKey={keyOf('basic')}
          switchKey={keyOf('attacker')}
          targetUid={targetUid}
          setTargetUid={setTargetUid}
          onSkill={chooseSkill}
          onDefense={pressDefense}
          onRetreat={() => void retreatBattle()}
          onItem={(itemId, target) => {
            if (!menuOpen || !battleRef.current) return;
            const ready = selectablePartyActors(battleRef.current.session);
            const actor = ready.find((unit) => unit.unitUid === attackerUid) ?? ready[0];
            if (!actor) return;
            setMenuOpen(false);
            applyAction({ actorUid: actor.unitUid, kind: 'player_item', itemId, targetUid: target });
          }}
        />
      ) : (
        <div className="ui-field">
          <canvas ref={owCanvas} width={OVERWORLD_VIEW_W} height={OVERWORLD_VIEW_H} className="ui-canvas" />
          {!tmj && <div className="ui-field-loading">Đang tải bản đồ…</div>}
          {!paused && realm && (
            <>
              <div className="ui-field-realm">{realm.nameVi}<small>Gác cổng {gkDone}/{realm.gatekeeperIds.length}</small></div>
              <canvas className="ui-mini" ref={miniCanvas} width={156} height={84} aria-label="Bản đồ nhỏ" />
              <div className="ui-field-party">{profile.activeParty.map((id) => <img key={id} src={portraitUrl(id)} alt="" />)}</div>
              {hint ? (
                <div className={`ui-hint hint-${hint.kind}`} role="status">
                  <kbd>{keyLabel(controlCodes(bindings, hint.kind === 'grip' ? 'grip' : 'interact')[0])}</kbd> {hint.labelVi}
                </div>
              ) : (
                <div className="ui-field-keys"><Keys items={[[`${keyOf('up')}${keyOf('left')}${keyOf('down')}${keyOf('right')}`, 'Di chuyển'], [keyOf('sprint'), 'Chạy'], ['Esc', 'Menu']]} /></div>
              )}
            </>
          )}
        </div>
      )}
      {result && <BattleResultScreen result={result} onClose={closeResult} />}
      {route && !inBattle && (
        <div className="ui-menu">
          {route.screen === 'camp' && (
            <CampScreen {...shared} looks={looks} onClose={() => setRoute(null)} onLeave={onLeave}
              onHero={(heroId) => { setSelectedHeroId(heroId); setRoute({ screen: 'hero', heroId, sub: 'overview' }); }}
              onPage={(id) => setRoute({ screen: 'page', page: id })} />
          )}
          {route.screen === 'hero' && (
            <HeroScreen {...shared} heroId={route.heroId} sub={route.sub} looks={looks}
              go={(heroId, sub) => { setSelectedHeroId(heroId); setRoute({ screen: 'hero', heroId, sub }); }}
              outfits={wardrobe.filter((outfit) => outfit.heroId === route.heroId)} selectedOutfit={selectedOutfits[route.heroId] ?? ''}
              onOutfit={(id) => setSelectedOutfits((all) => ({ ...all, [route.heroId]: id }))} />
          )}
          {route.screen === 'page' && (
            <PageShell title={PAGE_TITLES[route.page]} resources={route.page === 'summon' ? profile : undefined} onBack={() => setRoute({ screen: 'camp' })}>{page(route.page)}</PageShell>
          )}
        </div>
      )}
      </div>

      {commitError && <div className="exp-modal"><div className="exp-modal-box">
        <h2>Chưa xác nhận được kết quả</h2>
        <p>{commitError}</p>
        <button onClick={() => void finishBattle()}>Gửi lại kết quả</button>
        <button onClick={() => void retreatBattle()}>Rút lui khỏi trận (không nhận thưởng)</button>
      </div></div>}
      {transition && <SceneTransition kind={transition.kind} label={transition.label} />}
      {story && <StoryPlayer key={story.scene.sceneId} scene={story.scene} onDone={finishStory} />}
      {summonResult && summonCine && <SummonCinematic res={summonResult} onDone={() => setSummonCine(false)} onClose={() => setSummonResult(null)} />}
      {summonResult && !summonCine && <SummonResultModal res={summonResult} onClose={() => setSummonResult(null)} />}
      {chapterTip !== null && <ChapterTipModal order={chapterTip} onClose={() => { setChapterTip(null); keys.current.clear(); }} />}
      {rest && (
        <RestScreen info={rest} onDone={() => {
          const now = performance.now();
          owRef.current.respawnFx = { startMs: now, ids: owRef.current.respawnFx?.ids ?? [] };
          owRef.current.immunityUntilMs = now + 1500;
          keys.current.clear();
          setRest(null);
        }} />
      )}
      {toast && <div className="exp-toast">{toast}</div>}
    </div>
  );
}

function ControlSettings({ bindings, onChange }: { bindings: ControlBindings; onChange: (bindings: ControlBindings) => void }) {
  const [capture, setCapture] = useState<ControlAction | null>(null);
  const [message, setMessage] = useState('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (!capture) return;
    const listen = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === 'Escape') { setCapture(null); setMessage(''); return; }
      const next = setBinding(bindings, capture, event.code);
      if (!next) { setMessage('Phím đã dùng hoặc không hỗ trợ.'); return; }
      onChangeRef.current(next);
      setCapture(null); setMessage('');
    };
    window.addEventListener('keydown',listen,true);
    return () => window.removeEventListener('keydown',listen,true);
  }, [bindings,capture]);
  return <section className="exp-control-settings">
    <h3>Phím điều khiển</h3>
    {(['field','battle'] as const).map((group) => <fieldset key={group}>
      <legend>{group === 'field' ? 'Khám phá' : 'Chiến đấu'}</legend>
      {CONTROL_LIST.filter((entry) => entry.group === group).map((entry) => <div className="exp-control-row" key={entry.id}>
        <span>{entry.label}</span>
        <button type="button" aria-label={`Đổi phím ${entry.label}`} className={capture === entry.id ? 'on' : ''}
          onClick={() => { setMessage(''); setCapture(capture === entry.id ? null : entry.id); }}>
          {capture === entry.id ? 'Bấm phím…' : controlCodes(bindings,entry.id).map(keyLabel).join(' / ')}
        </button>
      </div>)}
    </fieldset>)}
    {message && <small role="status">{message}</small>}
    <button type="button" onClick={() => { setCapture(null); setMessage(''); onChange({}); }}>Mặc định</button>
  </section>;
}

function RealmProgress({ profile }: { profile: ExpeditionProfile }) {
  const realm = EXPEDITION_REALMS_BY_ID[profile.currentMapId];
  const gkDone = realm.gatekeeperIds.filter((id) => profile.clearedGatekeepers.includes(id)).length;
  return (
    <div className="exp-progress">
      Quái gác cổng: {gkDone}/{realm.gatekeeperIds.length} · Trùm: {profile.clearedBosses.includes(realm.bossAltar.bossId) ? 'Đã hạ' : 'Chưa hạ'} · Vùng đã mở: {profile.unlockedMaps.length}/7
    </div>
  );
}

type RunFn = <T>(fn: () => Promise<T>, onOk?: (r: T) => void) => Promise<void>;

function ItemCard({ item, level = 1 }: { item: ItemInstance; level?: number }) {
  return (
    <div className="exp-item" style={{ borderColor: ITEM_RARITY_COLORS[item.rarity] }}>
      <b style={{ color: ITEM_RARITY_COLORS[item.rarity] }}><WeaponIcon item={item} />{item.nameVi}{item.enhance ? <span className="enh-lv"> +{item.enhance}</span> : null}</b>
      <small>
        {ITEM_RARITY_LABELS_VI[item.rarity]} · {item.signatureId ? `${EXPEDITION_HEROES_BY_ID[item.signatureId]?.nameVi} · T${item.refineRank ?? 1}/5` : item.kind === 'elixir' ? 'Thuốc chỉ số' : `${EQUIP_SLOT_LABELS_VI[item.slot!]} · i${item.ilvl}`}
      </small>
      {item.duplicateYield ? <em>{item.duplicateYield.shards ? `Trùng · +${item.duplicateYield.shards} mảnh` : `Trùng · +${item.duplicateYield.starlight} Tinh Huy`}</em>
        : item.signatureId && <em>{item.weaponShards ?? 0} mảnh tinh luyện</em>}
      {item.main && (
        <span className="main">
          {STAT_LABELS_VI[item.main.stat]} +{formatStatValue(item.main.stat, itemStatValue(item, item.main, level))}
        </span>
      )}
      {item.subs.map((s, i) => (
        <span key={i}>
          {STAT_LABELS_VI[s.stat]} +{formatStatValue(s.stat, itemStatValue(item, s, level))}
        </span>
      ))}
      {item.elixir && (
        <span className="main">
          Vĩnh viễn {STAT_LABELS_VI[item.elixir.stat]} +{formatStatValue(item.elixir.stat, item.elixir.value)}
        </span>
      )}
    </div>
  );
}

// ======================================================================== bag

function BagView(props: {
  profile: ExpeditionProfile;
  socket: Socket | null;
  run: RunFn;
  setProfile: (p: ExpeditionProfile) => void;
  selectedHeroId: string;
  busy: boolean;
  flash: (m: string) => void;
}) {
  const { profile, socket, run, setProfile, selectedHeroId, busy, flash } = props;
  const [filter, setFilter] = useState<'all' | 'equipment' | 'elixir'>('all');
  const [heroId, setHeroId] = useState(selectedHeroId || profile.activeParty[0]);
  const items = (profile.inventory ?? [])
    .filter((i) => filter === 'all' || i.kind === filter)
    .sort((a, b) => ITEM_RARITIES.indexOf(b.rarity) - ITEM_RARITIES.indexOf(a.rarity) || b.ilvl - a.ilvl);
  const salvageCommons = () => {
    const uids = (profile.inventory ?? []).filter((i) => i.rarity === 'common' && !i.equippedBy && i.kind === 'equipment').map((i) => i.uid);
    if (!uids.length) return flash('Không có trang bị Thường nào để phân rã.');
    void run(() => expeditionApi.salvageItems(socket, uids), (r) => {
      setProfile(r.profile);
      flash(`Phân rã nhận ${r.gained} Tinh Thể EXP.`);
    });
  };
  return (
    <div className="exp-bag">
      <div className="exp-row">
        {(['all', 'equipment', 'elixir'] as const).map((f) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Tất cả' : f === 'equipment' ? 'Trang bị' : 'Thuốc'}
          </button>
        ))}
        <label>
          Dùng cho:
          <select value={heroId} onChange={(e) => setHeroId(e.target.value)}>
            {Object.keys(profile.heroes).map((id) => (
              <option key={id} value={id}>
                {EXPEDITION_HEROES_BY_ID[id]?.nameVi}
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy} onClick={salvageCommons}>Phân rã toàn bộ đồ Thường</button>
      </div>
      {!items.length && <p className="exp-empty">Túi trống. Đánh quái, mở rương hoặc mở Rương Thiên Văn ở tab Triệu Hồi để nhận đồ.</p>}
      <div className="exp-item-grid">
        {items.map((it) => {
          const cost = weaponRefineCost(it);
          const eligible = !it.signatureId || it.signatureId === heroId;
          return (
          <div key={it.uid} className="exp-item-cell">
            <ItemCard item={it} level={profile.heroes[it.signatureId ?? heroId]?.level} />
            {it.equippedBy && <small className="eq"><OwnerTag heroId={it.equippedBy} /></small>}
            <div className="exp-row">
              {it.kind === 'equipment' ? (
                <button disabled={busy || !eligible} onClick={() => void run(() => expeditionApi.equipItem(socket, heroId, it.slot!, it.uid), setProfile)}>{eligible ? 'Trang bị' : 'Dành cho ' + EXPEDITION_HEROES_BY_ID[it.signatureId!]?.nameVi}</button>
              ) : (
                <button disabled={busy} onClick={() => void run(() => expeditionApi.useElixir(socket, heroId, it.uid), setProfile)}>Dùng</button>
              )}
              {(() => {
                const ec = enhanceCost(it);
                if (!ec) return null;
                return (
                  <button className="exp-enhance" disabled={busy || profile.astralSeal < ec.seal || profile.expCrystal < ec.crystal
                    || Object.entries(ec.mats).some(([id, n]) => (profile.materials?.[id] ?? 0) < (n ?? 0))}
                    title={`${ec.seal} Ấn Tinh Tú · ${ec.crystal} Tinh Thể EXP · ${Object.entries(ec.mats).map(([id, n]) => `${n} ${MATERIALS[id as MaterialId].nameVi}`).join(' · ')}`}
                    onClick={() => void run(() => expeditionApi.enhanceItem(socket, it.uid, it.enhance ?? 0), setProfile)}>
                    Cường hoá +{(it.enhance ?? 0) + 1}
                  </button>
                );
              })()}
              {cost !== undefined && (
                <button className="exp-refine-weapon" disabled={busy || (it.weaponShards ?? 0) < cost}
                  onClick={() => void run(() => expeditionApi.refineWeapon(socket, it.uid, it.refineRank ?? 1), setProfile)}>Tinh luyện · {cost} mảnh</button>
              )}
              {!it.equippedBy && !it.locked && !it.signatureId && (
                <button disabled={busy} onClick={() => void run(() => expeditionApi.salvageItems(socket, [it.uid]), (r) => setProfile(r.profile))}>
                  Phân rã (+{EXP_BALANCE.equipment.salvageExpCrystal[it.rarity]}⬢)
                </button>
              )}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

// ======================================================================== summon

function SummonView(props: {
  profile: ExpeditionProfile;
  socket: Socket | null;
  run: RunFn;
  setProfile: (p: ExpeditionProfile) => void;
  setSummonResult: (r: { heroes?: SummonResultItem[]; items?: ItemInstance[] }) => void;
  busy: boolean;
}) {
  const { profile, socket, run, setProfile, setSummonResult, busy } = props;
  const hg = EXP_BALANCE.heroGacha;
  const ig = EXP_BALANCE.itemGacha;
  const [banner, setBanner] = useState<'hero' | 'weapon' | 'item'>('hero');
  const bannerChoices = [['hero', 'Anh hùng'], ['weapon', 'Vũ khí trấn'], ['item', 'Rương Thiên Văn']] as const;
  return (
    <div className="exp-summon">
      <div className="exp-banner-choices" role="group" aria-label="Chọn banner">
        {bannerChoices.map(([id, label]) => <button type="button" key={id} className={banner === id ? 'on' : ''}
          aria-pressed={banner === id} onClick={() => setBanner(id)}>{label}</button>)}
      </div>
      {banner === 'hero' && <section className="exp-card banner b-hero">
        <div className="exp-banner-intro">
          <h2>Khế Ước Quang Phổ Tinh Hà</h2>
          <div className="exp-banner-pity"><span className="pity-sss" title={`Bảo hiểm Jung (SSS): mỗi ${SSS_PITY.every} lượt chạm mốc. Nấc 1: 1/3 · nấc 2: 1/2 · nấc 3: chắc chắn. Tỉ lệ gốc mỗi lượt ${pct(SSS_PITY.baseRate)}.`}>SSS <b>{profile.pity.sssPityCount ?? 0}/{SSS_PITY.every}</b> <small>mốc {['1/3', '1/2', '100%'][Math.min(2, profile.pity.sssStage ?? 0)]}</small></span><span title="Bảo hiểm SSR">SSR <b>{profile.pity.ssrPityCount}/{hg.hardPitySsr}</b></span><span title="Bảo hiểm SR trở lên">SR+ <b>{profile.pity.srPityCount}/{hg.guaranteedSrEvery}</b></span></div>
        </div>
        <div className="exp-banner-portraits">
          {EXPEDITION_HEROES.filter((hero) => hero.rarity === 'SSS' || hero.rarity === 'SSR').map((hero) => <figure key={hero.heroId} className={`r-${hero.rarity}`}>
            <img src={portraitUrl(hero.heroId)} alt="" />
            <figcaption>{hero.nameVi}</figcaption>
          </figure>)}
        </div>
        <div className="exp-row">
          <button disabled={busy || profile.astralSeal < hg.singleCostSeal} onClick={() => void run(() => expeditionApi.summon(socket, 1), (r) => { setProfile(r.profile); setSummonResult({ heroes: r.pulls }); playExpeditionSfx('orb_spin'); })}>
            Triệu hồi x1 ({hg.singleCostSeal} ◈)
          </button>
          <button disabled={busy || profile.astralSeal < hg.tenCostSeal} onClick={() => void run(() => expeditionApi.summon(socket, 10), (r) => { setProfile(r.profile); setSummonResult({ heroes: r.pulls }); playExpeditionSfx('orb_spin'); })}>
            Triệu hồi x10 ({hg.tenCostSeal} ◈)
          </button>
          <button disabled={busy || profile.starlightToken < EXP_BALANCE.economy.exchangeStarlight} onClick={() => void run(() => expeditionApi.upgradeHero(socket, { heroId: profile.activeParty[0], kind: 'exchange_seal' }), setProfile)}>
            Đổi {EXP_BALANCE.economy.exchangeStarlight}✦ → {EXP_BALANCE.economy.exchangeSealGain}◈
          </button>
        </div>
      </section>}
      {banner === 'weapon' && <section className="exp-card banner b-weapon" aria-label="Triệu hồi vũ khí trấn">
        <div className="exp-banner-intro">
          <h2>Vũ khí trấn</h2>
          <div className="exp-banner-pity"><span title="Bảo hiểm Huyền Thoại">Huyền Thoại <b>{profile.weaponPity?.legendary ?? 0}/{WEAPON_BANNER.legendaryPity}</b></span><span title="Bảo hiểm Sử Thi trở lên">Sử Thi+ <b>{profile.weaponPity?.epic ?? 0}/{WEAPON_BANNER.epicPity}</b></span><span className="pity-mythic" title={`Bảo hiểm Thần Thoại: lượt thứ ${WEAPON_BANNER.mythicPity} chắc chắn ra Thần Thoại`}>Thần Thoại <b>{profile.weaponPity?.mythic ?? (profile.weaponPity?.pulls ?? 0) % WEAPON_BANNER.mythicPity}/{WEAPON_BANNER.mythicPity}</b> <small>· còn {WEAPON_BANNER.mythicPity - (profile.weaponPity?.mythic ?? (profile.weaponPity?.pulls ?? 0) % WEAPON_BANNER.mythicPity)} lượt</small></span></div>
        </div>
        {(['mythic', 'legendary', 'epic'] as const).map((tier) => (
          <div key={tier} className={`exp-weapon-tier t-${tier}`}>
            <h4 style={{ color: ITEM_RARITY_COLORS[tier] }}>
              {ITEM_RARITY_LABELS_VI[tier]} <small>{pct(WEAPON_BANNER.rates[tier])}</small>
            </h4>
            <div className="exp-weapon-pool">
              {SIGNATURE_WEAPONS.filter((w) => w.rarity === tier).map((w) => (
                <article key={w.heroId} className={`exp-weapon-entry r-${w.rarity}`} style={{ borderColor: ITEM_RARITY_COLORS[w.rarity] }} title={`${w.nameVi} · ${ITEM_RARITY_LABELS_VI[w.rarity]}`}>
                  <img src={signatureArtUrl(w.heroId)} alt={w.nameVi} loading="lazy" />
                  <b style={{ color: ITEM_RARITY_COLORS[w.rarity] }}>{w.nameVi}</b>
                  <small>{EXPEDITION_HEROES_BY_ID[w.heroId]?.nameVi}</small>
                </article>
              ))}
            </div>
          </div>
        ))}
        <p className="exp-dim">Bậc Hiếm ({pct(WEAPON_BANNER.rates.rare)}): vũ khí biến thể thường, không phải vũ khí trấn.</p>
        <div className="exp-row">
          {([1, 10] as const).map((count) => {
            const cost = count === 10 ? WEAPON_BANNER.tenCost : WEAPON_BANNER.singleCost;
            return <button key={count} disabled={busy || profile.astralSeal < cost}
              onClick={() => void run(() => expeditionApi.weaponSummon(socket, count), (r) => { setProfile(r.profile); setSummonResult({ items: r.items }); playExpeditionSfx('orb_spin'); })}>
              Quay vũ khí x{count} ({cost} ◈)
            </button>;
          })}
        </div>
      </section>}
      {banner === 'item' && <section className="exp-card banner b-item">
        <div className="exp-banner-intro">
          <h2>{ig.nameVi}</h2>
          <div className="exp-banner-pity"><span title="Bảo hiểm Huyền Thoại">Huyền Thoại <b>{profile.itemPity ?? 0}/{ig.hardPityLegendary}</b></span></div>
        </div>
        <div className="exp-banner-portraits exp-banner-gear">
          {['field-3', 'field-axe', 'field-scythe'].map((id) => <figure key={id}><img src={signatureArtUrl(id)} alt="" /></figure>)}
        </div>
        <div className="exp-row">
          <button disabled={busy || profile.astralSeal < ig.singleCostSeal} onClick={() => void run(() => expeditionApi.itemSummon(socket, 1), (r) => { setProfile(r.profile); setSummonResult({ items: r.items }); playExpeditionSfx('chest_open'); })}>
            Mở x1 ({ig.singleCostSeal} ◈)
          </button>
          <button disabled={busy || profile.astralSeal < ig.tenCostSeal} onClick={() => void run(() => expeditionApi.itemSummon(socket, 10), (r) => { setProfile(r.profile); setSummonResult({ items: r.items }); playExpeditionSfx('chest_open'); })}>
            Mở x10 ({ig.tenCostSeal} ◈)
          </button>
        </div>
      </section>}
      {profile.summonHistory.length > 0 && <SummonHistory history={profile.summonHistory} />}
    </div>
  );
}

function pct(v: number) {
  return `${(v * 100).toFixed(v < 0.01 ? 1 : 0)}%`;
}

function RatesView() {
  const B = EXP_BALANCE;
  return (
    <div className="exp-rates">
      <section className="exp-card">
        <h3>Gacha anh hùng</h3>
        <p>
          SSR {pct(B.heroGacha.rates.SSR)} · SR {pct(B.heroGacha.rates.SR)} · R {pct(B.heroGacha.rates.R)}. Từ lượt {B.heroGacha.softPityStart} mỗi lượt +{pct(B.heroGacha.softPityStepBonus)} SSR,
          lượt {B.heroGacha.hardPitySsr} chắc chắn SSR. SSS (Jung): tỉ lệ gốc {pct(SSS_PITY.baseRate)} mỗi lượt; mỗi {SSS_PITY.every} lượt chạm mốc bảo hiểm riêng: lần 1 tỉ lệ 1/3, trượt thì 100 lượt sau 1/2, trượt nữa thì 100 lượt sau chắc chắn ra Jung. Bản trùng thành 1 mảnh của nhân vật đó. Dùng trong hồ sơ để thức tỉnh tối đa A6. Mỗi bậc tăng {pct(B.awakeningPerRank)} HP/ATK/DEF. Mảnh dư đổi Tinh Huy.
        </p>
      </section>
      <section className="exp-card">
        <h3>Vũ khí trấn</h3>
        <p>Hiếm {pct(WEAPON_BANNER.rates.rare)} · Sử Thi {pct(WEAPON_BANNER.rates.epic)} · Huyền Thoại {pct(WEAPON_BANNER.rates.legendary)} · Thần Thoại {pct(WEAPON_BANNER.rates.mythic)}. Bảo hiểm Sử Thi+ lượt {WEAPON_BANNER.epicPity}, Huyền Thoại lượt {WEAPON_BANNER.legendaryPity}, Thần Thoại lượt {WEAPON_BANNER.mythicPity}. Bản trùng cho mảnh dùng để tinh luyện chính vũ khí đó.</p>
      </section>
      <section className="exp-card">
        <h3>Rương Thiên Văn (trang bị)</h3>
        <RateTable rates={B.itemGacha.rates} />
        <p>
          {pct(B.itemGacha.elixirChance)} ra thuốc chỉ số. Bảo hiểm Huyền Thoại+ ở lượt {B.itemGacha.hardPityLegendary}. Gói x10 có ít nhất một món {ITEM_RARITY_LABELS_VI[B.itemGacha.tenPullGuarantee]} trở lên.
        </p>
      </section>
      <section className="exp-card">
        <h3>Rớt đồ sau trận</h3>
        <p>
          Sau trận rớt vũ khí / giáp biến thể: quái thường và Gác Cổng vũ khí {pct(B.drops.weaponChance.gatekeeper)}, giáp {pct(B.drops.armorChance.gatekeeper)}. Trùm chắc chắn 1 vũ khí + 1 giáp, mỗi món {pct(B.drops.bossWeaponRarity.epic + B.drops.bossWeaponRarity.legendary + B.drops.bossWeaponRarity.mythic)} là hàng hiếm (Sử Thi trở lên).
        </p>
        <div className="exp-row">
          <div>
            <b>Quái gác cổng</b>
            <RateTable rates={B.drops.gatekeeper.rarity} />
          </div>
          <div>
            <b>Đại Trùm</b>
            <RateTable rates={B.drops.boss.rarity} />
          </div>
        </div>
      </section>
      <section className="exp-card">
        <h3>Lên cấp & điểm chỉ số</h3>
        <p>
          Cấp tối đa {B.level.max}. EXP lên cấp = {B.level.expBase} × cấp^{B.level.expExponent}. Mỗi cấp +{B.statPoints.perLevel} điểm, thưởng mốc:{' '}
          {Object.entries(B.statPoints.milestoneBonus).map(([lv, n]) => `Lv.${lv} +${n}`).join(', ')}.
        </p>
        <table className="exp-stats">
          <tbody>
            {STAT_KEYS.map((k) => (
              <tr key={k}>
                <td>{STAT_LABELS_VI[k]}</td>
                <td>+{formatStatValue(k, B.statPoints.valuePerPoint[k])} / điểm</td>
                <td>{B.statCaps[k] !== undefined ? `Trần ${formatStatValue(k, B.statCaps[k]!)}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="exp-card">
        <h3>Kỹ năng</h3>
        <p>
          Mở khóa theo cấp: Đòn thường Lv.{B.skills.unlockLevelBySlot[0]}, Kỹ năng 1 Lv.{B.skills.unlockLevelBySlot[1]}, Kỹ năng 2 Lv.{B.skills.unlockLevelBySlot[2]}, Tuyệt kỹ Lv.
          {B.skills.unlockLevelBySlot[3]}, Nội tại Lv.{B.skills.unlockLevelBySlot[4]}. Mỗi cấp kỹ năng +{pct(B.skills.powerPerLevel)} sức mạnh, tối đa Lv.{B.skills.maxLevel} (mỗi{' '}
          {B.skills.levelPerSkillRank} cấp anh hùng mở thêm 1 cấp kỹ năng).
        </p>
      </section>
      <p className="exp-empty">Mọi con số ở trang này đọc trực tiếp từ <code>shared/src/expedition/balance.ts</code>. Đổi file đó là đổi cả game.</p>
    </div>
  );
}

function RateTable({ rates }: { rates: Record<string, number> }) {
  const total = Object.values(rates).reduce((a, b) => a + b, 0) || 1;
  return (
    <table className="exp-rate-table">
      <tbody>
        {ITEM_RARITIES.slice()
          .reverse()
          .map((r) => (
            <tr key={r}>
              <td style={{ color: ITEM_RARITY_COLORS[r] }}>{ITEM_RARITY_LABELS_VI[r]}</td>
              <td>{pct((rates[r] ?? 0) / total)}</td>
            </tr>
          ))}
      </tbody>
    </table>
  );
}

// ======================================================================== modals

function ResultModal({ result, onClose }: { result: BattleResult; onClose: () => void }) {
  return (
    <div className="exp-modal" onClick={onClose}>
      <div className="exp-modal-box" onClick={(e) => e.stopPropagation()}>
        <h2 className={result.outcome}>{result.outcome === 'victory' ? 'CHIẾN THẮNG' : 'THẤT BẠI'}</h2>
        {result.outcome === 'victory' ? (
          <>
            <p>
              +{result.sealReward} ◈ Ấn Tinh Tú · +{result.expReward} EXP {result.firstClear ? '· Lần đầu hạ gục!' : ''}
            </p>
            {result.unlockedMapId && <p className="hl">Mở khóa vùng mới: {EXPEDITION_REALMS_BY_ID[result.unlockedMapId]?.nameVi}</p>}
            {result.charms.map((charm, i) => (
              <p key={`${charm.charmId}-${i}`} className="hl">
                Bùa Hộ Mệnh · {charm.nameVi} {charm.convertedCrystal ? `→ +${charm.convertedCrystal} ⬢` : `· Bậc ${charm.rankAfter}`}
              </p>
            ))}
            {result.levelUps.map((l) => (
              <p key={l.heroId} className="hl">
                {EXPEDITION_HEROES_BY_ID[l.heroId]?.nameVi} lên Lv.{l.toLevel} (+{l.pointsGained} điểm chỉ số)
                {l.unlockedSkillIds.length ? ` · Mở khóa: ${l.unlockedSkillIds.map((s) => EXPEDITION_SKILLS_BY_ID[s]?.nameVi).join(', ')}` : ''}
              </p>
            ))}
            {result.drops.length > 0 && (
              <div className="exp-item-grid small">
                {result.drops.map((d) => (
                  <ItemCard key={d.uid} item={d} />
                ))}
              </div>
            )}
          </>
        ) : (
          <p>Đội hình đã gục ngã. Quay về trạm nghỉ gần nhất. Hãy cộng điểm, nâng kỹ năng hoặc thay trang bị rồi thử lại.</p>
        )}
        <button onClick={onClose}>Tiếp tục</button>
      </div>
    </div>
  );
}

function SummonResultModal({ res, onClose }: { res: { heroes?: SummonResultItem[]; items?: ItemInstance[] }; onClose: () => void }) {
  return (
    <div className="exp-modal" onClick={onClose}>
      <div className="exp-modal-box wide" onClick={(e) => e.stopPropagation()}>
        <h2>Kết quả</h2>
        {res.heroes && (
          <div className="exp-summon-grid">
            {res.heroes.map((h, i) => (
              <div key={i} className={`exp-summon-card r-${h.rarity}`}>
                <img src={portraitUrl(h.heroId)} alt="" />
                <b>{h.nameVi}</b>
                <small>
                  {h.rarity} · {h.isNew ? 'MỚI!' : h.expGained ? `Mảnh dư → +${h.expGained} EXP` : `+${h.shardGained} mảnh · +${h.starlightGained}✦`}
                </small>
              </div>
            ))}
          </div>
        )}
        {res.items && (
          <div className="exp-item-grid small">
            {res.items.map((it, index) => (
              <ItemCard key={`${it.uid}:${index}`} item={it} />
            ))}
          </div>
        )}
        <button onClick={onClose}>Đóng</button>
      </div>
    </div>
  );
}


/** Lịch sử triệu hồi chia theo nhánh: Anh hùng · Vũ khí trấn · Rương Thiên Văn. */
function SummonHistory({ history }: { history: ExpeditionProfile['summonHistory'] }) {
  const [tab, setTab] = useState<'hero' | 'weapon' | 'item'>('hero');
  const rows = history.filter((h) => (h.banner ?? 'hero') === tab).slice(0, 30);
  const counts = { hero: 0, weapon: 0, item: 0 };
  for (const h of history) counts[h.banner ?? 'hero'] += 1;
  return (
    <details className="exp-summon-history" open>
      <summary>Lịch sử triệu hồi</summary>
      <div className="ui-summon-tabs" role="tablist">
        {([['hero', 'Anh hùng'], ['weapon', 'Vũ khí trấn'], ['item', 'Rương Thiên Văn']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label} <small>({counts[id]})</small>
          </button>
        ))}
      </div>
      {rows.length === 0 ? <p className="exp-dim">Chưa có lượt nào ở nhánh này.</p> : (
        <ul className="exp-history">
          {rows.map((h, i) => tab === 'hero' ? (
            <li key={i} className={`r-${h.rarity}`}>
              #{h.pullIndex} [{h.rarity}] {EXPEDITION_HEROES_BY_ID[h.heroId]?.nameVi}{' '}
              {h.isNew ? '· MỚI' : h.expConverted ? `· mảnh dư → +${h.expConverted} EXP` : `· +${h.shardConverted} mảnh · +${h.starlightConverted}✦`}
            </li>
          ) : (
            <li key={i} style={{ color: ITEM_RARITY_COLORS[h.itemRarity as keyof typeof ITEM_RARITY_COLORS] }}>
              [{ITEM_RARITY_LABELS_VI[h.itemRarity as keyof typeof ITEM_RARITY_LABELS_VI] ?? h.itemRarity}] {h.itemName}
              {h.heroId ? ` · ${EXPEDITION_HEROES_BY_ID[h.heroId]?.nameVi ?? ''}` : ''}{h.shardConverted ? ` · trùng +${h.shardConverted} mảnh` : ''}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
