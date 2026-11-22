/**
 * HUD trận đấu toàn màn hình: thứ tự lượt bên trái, thanh máu mục tiêu ở giữa trên, menu lệnh chéo cạnh
 * nhân vật đang hành động, thẻ nhân vật đang hành động ở góc dưới phải. Chỉ hiện thứ đang cần cho lượt hiện tại.
 *
 * Phím: 1 Tấn công · 2/K Kỹ năng · 3/L Vật phẩm · 1..9 chọn trong danh sách · ←/→ đổi mục tiêu · Esc quay lại.
 * Đánh thường nhanh, đổi người ra đòn, Đỡ / Né dùng phím người chơi tự gán (xử lý ở ExpeditionBoard).
 */

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  AFFINITY_LABELS_VI,
  BATTLE_SUPPLIES,
  ELEMENT_LABELS_VI,
  EXPEDITION_HEROES_BY_ID,
  EXPEDITION_SKILLS_BY_ID,
  affinityOf,
  heroCombatSkillIds,
  resolveSkillFor,
  selectablePartyActors,
  type BattleSessionState,
  type BattleSupply,
  type CombatSkillDefinition,
  type CombatantRuntime,
} from './shared';
import { BATTLE_CANVAS_H, BATTLE_CANVAS_W, getCombatantScreenAnchor, isBigEnemy, type BattleVisualState } from './battleRenderer';
import type { Battle3DStage } from './battle3d';
import { CharmIcon } from './progression-ui';
import { expeditionAssetUrl } from './store';
import { playExpeditionSfx } from './sound';
import { SkillGlyph, portraitUrl } from './menu-ui';
import { BattleStatusRow, battleStatusTitle } from './battle-status';

type Command = 'main' | 'skills' | 'items';

export interface SkillCutIn {
  id: number;
  heroId: string;
  nameVi: string;
  element: string;
  ult: boolean;
}

const ELEMENT_INK: Record<string, string> = {
  Verdant: '#8fe0a2', Frost: '#a9dcff', Solar: '#ffd77a', Tide: '#7fd6e6', Pyre: '#ff9b6a', Astral: '#d4a8ff',
};

/** Cut-in kiểu manga: hai dải đen khép lại chỉ chừa khung hẹp giữa màn, tia tốc độ, chân dung cắt mắt và tên chiêu. */
function MangaCutIn({ cut }: { cut: SkillCutIn }) {
  const ink = ELEMENT_INK[cut.element] ?? '#f2d896';
  return (
    <div className={`ui-manga ${cut.ult ? 'ult' : ''}`} key={cut.id} aria-hidden="true" style={{ ['--ink-c' as string]: ink }}>
      <div className="ui-manga-bar top">
        <span className="ui-manga-eyes" style={{ backgroundImage: `url("${portraitUrl(cut.heroId)}")` }} />
        <span className="ui-manga-dots" />
      </div>
      <div className="ui-manga-speed" />
      <div className="ui-manga-flash" />
      <div className="ui-manga-bar bottom">
        <span className="ui-manga-dots" />
        <strong data-text={cut.nameVi}>{cut.nameVi}</strong>
        {cut.ult && <em>Tuyệt kỹ</em>}
      </div>
    </div>
  );
}

export function BattleHud(props: {
  session: BattleSessionState;
  vis: BattleVisualState;
  /** camera điện ảnh 3D khi ra đòn (tắt được trong Cài đặt) */
  cinematic: boolean;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  menuOpen: boolean;
  defending: boolean;
  attackerUid: string;
  setAttackerUid: (uid: string) => void;
  parryKey: string;
  dodgeKey: string;
  basicKey: string;
  switchKey: string;
  targetUid?: string;
  setTargetUid: (u: string) => void;
  onSkill: (s: CombatSkillDefinition) => void;
  onDefense: (a: 'parry' | 'dodge' | 'counter', at?: number) => void;
  counterKey: string;
  /** Tuyệt Kỹ của quái: nền xám đen + nhắc bấm W đúng lúc */
  special: { beatAt: number; nameVi: string; done: boolean; aoe?: boolean } | null;
  onItem: (item: BattleSupply, targetUid: string) => void;
  onRetreat: () => void;
  cutIn: SkillCutIn | null;
}) {
  const { session: s, canvasRef, menuOpen, defending, attackerUid, setAttackerUid, targetUid, setTargetUid, onSkill, onDefense, onItem } = props;
  const ready = menuOpen ? selectablePartyActors(s) : [];
  const actor = ready.find((u) => u.unitUid === attackerUid) ?? ready[0] ?? s.combatants.find((c) => c.unitUid === s.activeActorUid);
  const party = s.combatants.filter((c) => c.side === 'party');
  const enemies = s.combatants.filter((c) => c.side === 'enemy');
  const alive = enemies.filter((e) => e.alive);
  const bigs = alive.filter((e) => isBigEnemy(s, e));
  const focus = alive.find((e) => e.unitUid === targetUid) ?? alive[0];
  const def = actor?.side === 'party' ? EXPEDITION_HEROES_BY_ID[actor.templateId] : undefined;
  const basic = def ? EXPEDITION_SKILLS_BY_ID[def.skillIds[0]] : undefined;
  const skills = def && actor
    ? heroCombatSkillIds(def)
      .filter((id) => actor.unlockedSkillIds?.includes(id) && (!actor.equippedSkillIds || actor.equippedSkillIds.includes(id)))
      .map((id) => EXPEDITION_SKILLS_BY_ID[id])
    : [];
  const [command, setCommand] = useState<Command>('main');
  const [hover, setHover] = useState(0);
  const [allyId, setAllyId] = useState('');
  const [confirmRetreat, setConfirmRetreat] = useState(false);
  const [aim, setAim] = useState<string>();
  // màn xám đen + nhắc W chỉ bật ~0,95 s trước nhát Tuyệt Kỹ (đòn chốt của Trùm không báo trước)
  const [specialOn, setSpecialOn] = useState(false);
  const specialBeat = props.special?.beatAt;
  useEffect(() => {
    setSpecialOn(false);
    if (specialBeat === undefined) return;
    const t = window.setTimeout(() => { setSpecialOn(true); playExpeditionSfx('boss_phase'); }, Math.max(0, specialBeat - 950 - performance.now()));
    return () => window.clearTimeout(t);
  }, [specialBeat]);

  // sân khấu 3D three.js: renderBattleCanvas gọi stage.frame() mỗi khung rồi vẽ lớp phủ lên canvas 2D trong suốt
  const glRef = useRef<HTMLCanvasElement | null>(null);
  const [is3d, setIs3d] = useState(false);
  useEffect(() => {
    const gl = glRef.current;
    if (!props.cinematic || !gl) return;
    const vis = props.vis;
    let stage: Battle3DStage | undefined;
    let cancelled = false;
    void import('./battle3d').then(({ Battle3DStage: Stage }) => {
      if (cancelled) return;
      stage = new Stage(gl);
      vis.view3d = stage;
      setIs3d(true);
    }).catch(() => {
      // Nếu WebGL hoặc module 3D không khởi tạo được, canvas 2D tiếp tục hiển thị trận đấu.
    });
    return () => {
      cancelled = true;
      if (stage && vis.view3d === stage) delete vis.view3d;
      setIs3d(false);
      stage?.dispose();
    };
  }, [props.cinematic, props.vis]);
  useEffect(() => { setCommand('main'); setHover(0); setAllyId(''); }, [s.round, s.activeActorUid, attackerUid]);

  const playerTurn = Boolean(menuOpen && actor?.side === 'party');
  // Camera chỉ theo mục tiêu ĐÃ CHỌN (bấm / phím), không theo chuột đang rê: rê chuột làm camera xoay
  // → quái dưới con trỏ dịch đi → mất "ngắm" → camera quay lại … thành vòng lặp giật hình.
  props.vis.cameraFocus = {
    actorUid: actor?.side === 'party' ? actor.unitUid : undefined,
    targetUid: focus?.unitUid,
    menu: playerTurn,
    mode: command === 'skills' ? 'skills' : command === 'items' ? 'items' : 'command',
  };
  const supplies = (Object.keys(BATTLE_SUPPLIES) as BattleSupply[]).map((id) => {
    const stock = s.supplies?.[id] ?? 0;
    const eligible = party.filter((h) => (id === 'revive' ? !h.alive : h.alive));
    const target = eligible.find((h) => h.unitUid === allyId) ?? (id === 'tonic'
      ? [...eligible].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
      : eligible.find((h) => h.unitUid === actor?.unitUid) ?? eligible[0]);
    return { id, stock, target };
  });

  const cycleTarget = (dir: number) => {
    if (!alive.length) return;
    const i = Math.max(0, alive.findIndex((e) => e.unitUid === focus?.unitUid));
    setTargetUid(alive[(i + dir + alive.length) % alive.length].unitUid);
  };

  // bàn phím cho menu lệnh (chỉ khi tới lượt người chơi)
  const live = useRef({ command, skills, supplies, basic, playerTurn, cycleTarget });
  live.current = { command, skills, supplies, basic, playerTurn, cycleTarget };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const st = live.current;
      if (!st.playerTurn || e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'arrowright') {
        e.preventDefault();
        st.cycleTarget(k === 'arrowright' ? 1 : -1);
        return;
      }
      if (st.command === 'main') {
        if (k === '1' && st.basic) onSkill(st.basic);
        else if ((k === '2' || k === 'k') && st.skills.length) { setCommand('skills'); setHover(0); }
        else if (k === '3' || k === 'l') { setCommand('items'); setHover(0); }
        else return;
        e.preventDefault();
        return;
      }
      if (k === 'escape' || k === 'backspace') {
        e.preventDefault();
        setCommand('main');
        return;
      }
      if (/^[1-9]$/.test(k)) {
        const i = Number(k) - 1;
        if (st.command === 'skills' && st.skills[i]) onSkill(st.skills[i]);
        const sup = st.supplies[i];
        if (st.command === 'items' && sup?.stock && sup.target) onItem(sup.id, sup.target.unitUid);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSkill, onItem]);

  const hovered = command === 'skills' ? skills[hover] : undefined;

  /** Đổi tọa độ chuột sang tọa độ canvas (canvas phủ kín sân khấu kiểu object-fit: cover) rồi tìm quái gần nhất. */
  const enemyAt = (clientX: number, clientY: number, keep?: string) => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    const k = Math.max(r.width / BATTLE_CANVAS_W, r.height / BATTLE_CANVAS_H);
    const x = (clientX - r.left - (r.width - BATTLE_CANVAS_W * k) / 2) / k;
    const y = (clientY - r.top - (r.height - BATTLE_CANVAS_H * k) / 2) / k;
    let best: CombatantRuntime | undefined;
    let bestD = s.encounterKind === 'boss' ? 130 : 72;
    for (const e of alive) {
      const p3 = props.vis.view3d?.project(e.unitUid);
      const a = p3 ? { x: p3.x, y: p3.y - 44 * (p3.s - 1) } : getCombatantScreenAnchor(s, e);
      // quái đang được ngắm có vùng bám rộng hơn (trễ) để không nhảy qua lại ở mép
      const d = Math.hypot(a.x - x, a.y - 44 - y) * (e.unitUid === keep ? 0.7 : 1);
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  };

  return (
    <div className={`ui-battle ${props.special && specialOn && !props.special.done ? 'special-on' : ''}`}>
      {props.special && specialOn && <SpecialPrompt key={props.special.beatAt} special={props.special} counterKey={props.counterKey} />}
      <canvas ref={glRef} className={`ui-gl3d ${is3d ? 'on' : ''}`} aria-hidden="true" />
      <canvas ref={canvasRef} width={BATTLE_CANVAS_W} height={BATTLE_CANVAS_H} className={`ui-canvas ${aim ? 'aiming' : ''} ${is3d ? 'overlay' : ''}`}
        aria-label="Chiến trường. Bấm vào quái hoặc dùng mũi tên trái phải để chọn mục tiêu."
        onPointerMove={(e) => { const next = enemyAt(e.clientX, e.clientY, aim)?.unitUid; if (next !== aim) setAim(next); }}
        onPointerLeave={() => setAim(undefined)}
        onClick={(e) => { const hit = enemyAt(e.clientX, e.clientY); if (hit) setTargetUid(hit.unitUid); }} />
      <div className="ui-battle-vignette" aria-hidden="true" />
      {props.cutIn && <MangaCutIn cut={props.cutIn} />}

      {/* thứ tự lượt */}
      <ol className="ui-turns" aria-label="Thứ tự lượt">
        {s.turnOrderPreview.slice(0, 7).map((uid, i) => {
          const c = s.combatants.find((x) => x.unitUid === uid);
          if (!c) return null;
          return (
            <li key={uid + i} className={`${c.side} ${i === 0 ? 'now' : ''}`} title={c.nameVi}>
              {c.side === 'party'
                ? <img src={portraitUrl(c.templateId)} alt={c.nameVi} />
                : c.spriteRef
                  ? <span className="ui-turn-face" role="img" aria-label={c.nameVi}
                      style={{ backgroundImage: `url("${expeditionAssetUrl(c.spriteRef)}")`, backgroundSize: `600% ${(s.encounterKind === 'boss' ? 6 : 4) * 100}%` }} />
                  : <span>{c.nameVi.slice(0, 1)}</span>}
            </li>
          );
        })}
      </ol>

      {/* thanh máu quái to: giữa phía trên, mỗi con một thanh (quái thường có thanh trên đầu trong canvas) */}
      {bigs.length > 0 && (
        <div className={`ui-bosses n${Math.min(bigs.length, 3)}`} aria-live="polite">
          {bigs.map((e) => (
            <button key={e.unitUid} type="button" className={`ui-boss boss-bar ${s.encounterKind === 'boss' ? 'is-boss' : 'is-gate'} ${e.unitUid === focus?.unitUid ? 'on' : ''} ${aim === e.unitUid ? 'aim' : ''}`}
              onClick={() => setTargetUid(e.unitUid)} aria-label={`${e.nameVi} · ${e.hp}/${e.maxHp}`}>
              <em className="boss-title">
                {s.encounterKind === 'boss' ? `Đại Trùm · Giai đoạn ${e.phaseIndex}` : 'Quái Gác Cổng'}
                {s.encounterKind === 'boss' && (
                  <span className="boss-phases" aria-hidden="true">{[1, 2, 3].map((p) => <b key={p} className={p <= e.phaseIndex ? 'lit' : ''} />)}</span>
                )}
              </em>
              <h2>{e.nameVi}</h2>
              <span className="ui-target-hp boss-hp">
                <i className="trail" style={{ width: `${(e.hp / e.maxHp) * 100}%` }} />
                <i className="fill" style={{ width: `${(e.hp / e.maxHp) * 100}%` }} />
                <small className="boss-hp-num">{Math.max(0, Math.round(e.hp)).toLocaleString('vi-VN')} / {e.maxHp.toLocaleString('vi-VN')}</small>
              </span>
              <span className="ui-target-break" title="Thanh phá thế"><i style={{ width: `${(e.breakGauge / Math.max(1, e.maxBreak)) * 100}%` }} /></span>
              <small>{e.weakness ? `Yếu ${ELEMENT_LABELS_VI[e.weakness]}` : ''}{e.staggerTurns > 0 ? ' · Choáng' : ''}</small>
              <BattleStatusRow unit={e} />
            </button>
          ))}
        </div>
      )}
      {focus && !isBigEnemy(s, focus) && focus.statuses?.length ? (
        <div className={`ui-focus-effects ${bigs.length ? 'beneath-boss' : ''}`} aria-label={`Trạng thái của ${focus.nameVi}`}>
          <BattleStatusRow unit={focus} />
        </div>
      ) : null}

      {/* menu lệnh */}
      {playerTurn && actor && (
        <div className={`ui-commands ${command}`} key={`${actor.unitUid}-${s.round}-${command}`}>
          {command === 'main' ? (
            <>
              <button type="button" className="ui-cmd" onClick={() => { setCommand('items'); setHover(0); }}><kbd>3</kbd><span>Vật phẩm</span></button>
              <button type="button" className="ui-cmd" disabled={!skills.length} onClick={() => { setCommand('skills'); setHover(0); }}><kbd>2</kbd><span>Kỹ năng</span></button>
              <button type="button" className="ui-cmd" disabled={!basic} onClick={() => basic && onSkill(basic)}><kbd>1</kbd><span>Tấn công</span><small>{props.basicKey} · +{basic?.apGain ?? 1} AP</small></button>
            </>
          ) : (
            <>
              <button type="button" className="ui-cmd back" onClick={() => setCommand('main')}><kbd>Esc</kbd><span>Quay lại</span></button>
              {command === 'skills' && skills.map((sk, i) => {
                const r = resolveSkillFor(actor, sk);
                const offensive = sk.targetScope === 'single_enemy' || sk.targetScope === 'all_enemies';
                const aff = focus && offensive ? affinityOf(r.element, focus) : null;
                return (
                  <button key={sk.skillId} type="button" className={`ui-cmd skill ${hover === i ? 'hot' : ''}`} disabled={actor.ap < r.apCost}
                    onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => onSkill(sk)}>
                    <kbd>{i + 1}</kbd>
                    <SkillGlyph skill={sk} />
                    <span>{sk.nameVi}</span>
                    {aff === 'weak' && <em title={AFFINITY_LABELS_VI.weak}>▲</em>}
                    <b className="ui-cost">{r.apCost > 0 ? r.apCost : `+${sk.apGain}`}</b>
                  </button>
                );
              })}
              {command === 'items' && supplies.map((it, i) => (
                <button key={it.id} type="button" className="ui-cmd" disabled={!it.stock || !it.target} title={BATTLE_SUPPLIES[it.id].descriptionVi}
                  onClick={() => it.target && onItem(it.id, it.target.unitUid)}>
                  <kbd>{i + 1}</kbd>
                  <CharmIcon id={it.id} />
                  <span>{BATTLE_SUPPLIES[it.id].nameVi}</span>
                  <b className="ui-cost">×{it.stock}</b>
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {hovered && actor && (
        <aside className="ui-skill-card" key={hovered.skillId}>
          <small>{ELEMENT_LABELS_VI[hovered.element]} · {resolveSkillFor(actor, hovered).apCost} AP</small>
          <b>{hovered.nameVi}</b>
          <p>{hovered.summaryVi}</p>
        </aside>
      )}

      {playerTurn && !confirmRetreat && (
        <button type="button" className="ui-retreat" onClick={() => setConfirmRetreat(true)}><span>Rút lui</span></button>
      )}
      {confirmRetreat && (
        <div className="ui-confirm" role="dialog" aria-label="Rút lui">
          <div>
            <b>Rút lui khỏi trận?</b>
            <p>Đội sẽ quay lại bản đồ. Trận này không được tính thưởng.</p>
            <div>
              <button type="button" className="ui-plate" onClick={() => { setConfirmRetreat(false); props.onRetreat(); }}><span>Rút lui</span></button>
              <button type="button" className="ui-plate dim" onClick={() => setConfirmRetreat(false)}><span>Ở lại chiến đấu</span></button>
            </div>
          </div>
        </div>
      )}

      {defending && (
        <div className="ui-defense" aria-label="Phản ứng">
          <button type="button" onPointerDown={(e) => onDefense('parry', e.timeStamp)}><kbd>{props.parryKey}</kbd><span>Đỡ đòn</span></button>
          <button type="button" onPointerDown={(e) => onDefense('dodge', e.timeStamp)}><kbd>{props.dodgeKey}</kbd><span>Né</span></button>
          {props.special && specialOn && <button type="button" className="counter" onPointerDown={(e) => onDefense('counter', e.timeStamp)}><kbd>{props.counterKey}</kbd><span>Phản Tuyệt Kỹ</span></button>}
          <small className="ui-defense-help">Canh nhịp chém sau tia lóe</small>
        </div>
      )}

      {/* đồng đội */}
      <div className="ui-allies" aria-label="Đồng đội">
        {playerTurn && ready.length > 1 && command !== 'items' && <span className="ui-allies-hint"><kbd>{props.switchKey}</kbd> Đổi người ra đòn</span>}
        {party.filter((h) => h.unitUid !== (actor?.side === 'party' ? actor.unitUid : '')).map((h) => {
          const pickable = playerTurn && (command === 'items' || ready.some((u) => u.unitUid === h.unitUid));
          return (
            <button key={h.unitUid} type="button" disabled={!pickable} title={[`${h.nameVi} · ${h.hp}/${h.maxHp}`, battleStatusTitle(h)].filter(Boolean).join('\n')}
              className={`ui-ally ${h.alive ? '' : 'dead'} ${pickable ? 'pickable' : ''} ${command === 'items' && allyId === h.unitUid ? 'on' : ''}`}
              onClick={() => (command === 'items' ? setAllyId(h.unitUid) : setAttackerUid(h.unitUid))}>
              <img src={portraitUrl(h.templateId)} alt="" />
              <span className="ui-mini-hp"><i style={{ width: `${(h.hp / h.maxHp) * 100}%` }} /></span>
              <small>{h.ap}</small>
              {h.shieldHp > 0 && <em className="ui-shield-chip" title={`Khiên ${h.shieldHp}`}>{h.shieldHp}</em>}
            </button>
          );
        })}
      </div>

      {actor?.side === 'party' && <ActiveCard unit={actor} />}
    </div>
  );
}

function ActiveCard({ unit }: { unit: CombatantRuntime }) {
  return (
    <div className="ui-active" key={unit.unitUid}>
      <img src={portraitUrl(unit.templateId)} alt="" />
      <div>
        <b>{unit.nameVi}</b>
        <span className="ui-active-hp"><i style={{ width: `${(unit.hp / unit.maxHp) * 100}%` }} /></span>
        <small>{unit.shieldHp > 0 && <em className="ui-shield-chip inline">{unit.shieldHp}</em>}{unit.hp} / {unit.maxHp}</small>
        <span className="ui-ap" aria-label={`${unit.ap} AP`}>
          {Array.from({ length: 9 }, (_, i) => <i key={i} className={i < unit.ap ? 'on' : ''} />)}
          <em>{unit.ap}</em>
        </span>
        {unit.chargeMax ? <small className="ui-charge">Cộng hưởng {unit.charge ?? 0}/{unit.chargeMax}</small> : null}
        <BattleStatusRow unit={unit} />
      </div>
    </div>
  );
}


/** Lời nhắc Tuyệt Kỹ: tên chiêu, phím W khổng lồ, vòng co dần chạm đúng nhịp phản đòn. */
function SpecialPrompt({ special, counterKey }: { special: { beatAt: number; nameVi: string; done: boolean; aoe?: boolean }; counterKey: string }) {
  const [lead] = useState(() => Math.max(240, special.beatAt - performance.now()));
  return (
    <div className={`ui-special ${special.done ? 'done' : ''}`} aria-live="assertive">
      <div className={`ui-special-banner ${special.aoe ? 'aoe' : ''}`}>
        <small>{special.aoe ? 'TUYỆT KỸ · ĐÁNH TOÀN ĐỘI' : 'TUYỆT KỸ'}</small><b>{special.nameVi}</b>
      </div>
      <div className="ui-special-key" style={{ ['--lead' as string]: `${lead}ms` }}>
        <i className="ring" aria-hidden="true" />
        <kbd>{counterKey}</kbd>
        <span>{special.done ? (special.aoe ? 'CẢ ĐỘI PHẢN DAMAGE!' : 'PHẢN DAMAGE!') : special.aoe ? 'W để counter — cả đội phản damage' : 'W để counter — bấm khi vòng sáng khép lại'}</span>
      </div>
    </div>
  );
}
