/**
 * Cây kỹ năng dạng sơ đồ: kỹ năng (đòn thường, chủ động, tuyệt kỹ, nội tại, kỹ năng phụ) và các nút cường hóa
 * nối với nhau bằng đường thẳng. Gốc là đòn thường; ba làn A / B / C chạy qua 6 tầng; kỹ năng treo phía trên làn,
 * nối vào tầng cường hóa của chính nó; kỹ năng phụ xếp thành chuỗi phía dưới theo cấp mở khóa.
 */

import { useMemo, useState } from 'react';
import type { Socket } from 'socket.io-client';
import {
  ELEMENT_LABELS_VI,
  EXPEDITION_HEROES_BY_ID,
  EXPEDITION_SKILLS_BY_ID,
  EXPEDITION_SKILL_TREES,
  EXP_BALANCE,
  canUnlockTreeNode,
  configuredSkillIds,
  heroCombatSkillIds,
  skillLevelCap,
  skillUnlockLevel,
  skillUpgradeCost,
  treeNodeCost,
  treeNodeReqLevel,
  treePointsUnspent,
  unlockedSkillIds,
  type ExpeditionProfile,
} from './shared';
import { expeditionApi } from './rpc';
import { SkillGlyph } from './menu-ui';

type RunFn = <T>(fn: () => Promise<T>, onOk?: (r: T) => void) => Promise<void>;

const GX = 150; // khoảng cách cột (đơn vị sơ đồ; 10 đơn vị = 1cqh)
const GY = 106;
const PAD = 60;
const LANE_ROW = { A: 2, C: 3, B: 4, R: 3 } as const;

interface GNode {
  key: string;
  kind: 'skill' | 'mod';
  id: string;
  x: number;
  y: number;
  state: 'owned' | 'ready' | 'locked';
  badge?: string;
  size: 'root' | 'skill' | 'mod';
}

const pos = (col: number, row: number) => ({ x: PAD + col * GX, y: PAD + row * GY });

export function SkillTreeGraph({ profile, heroId, socket, run, setProfile, busy }: {
  profile: ExpeditionProfile;
  heroId: string;
  socket: Socket | null;
  run: RunFn;
  setProfile: (p: ExpeditionProfile) => void;
  busy: boolean;
}) {
  const def = EXPEDITION_HEROES_BY_ID[heroId];
  const inst = profile.heroes[heroId];
  const tree = EXPEDITION_SKILL_TREES[heroId] ?? [];
  const learned = unlockedSkillIds(def, inst.level);
  const combat = heroCombatSkillIds(def);
  const equipped = configuredSkillIds(def, inst, learned);
  const owned = new Set(inst.treeNodes ?? []);
  const sp = treePointsUnspent(inst);

  const { nodes, edges, width, height } = useMemo(() => {
    const out: GNode[] = [];
    const at: Record<string, { x: number; y: number }> = {};
    const skillNode = (sid: string, col: number, row: number, size: GNode['size'] = 'skill') => {
      const p = pos(col, row);
      const ok = learned.includes(sid);
      out.push({ key: `s:${sid}`, kind: 'skill', id: sid, ...p, size, state: ok ? 'owned' : 'locked', badge: ok ? undefined : `${skillUnlockLevel(def, sid)}` });
      at[`s:${sid}`] = p;
    };
    const [basic, a1, a2, ult, passive] = def.skillIds;
    skillNode(basic, 0, 3, 'root');
    skillNode(a1, 2, 0.55);
    skillNode(a2, 3, 0.55);
    skillNode(ult, 5, 0.55);
    skillNode(passive, 6.2, 0.55);
    const extras = combat.slice(3).sort((x, y) => skillUnlockLevel(def, x) - skillUnlockLevel(def, y));
    extras.forEach((sid, i) => skillNode(sid, 1.2 + i * 1.35, 5.6));
    for (const n of tree) {
      const col = n.tier === 1 ? 1 : n.tier;
      const p = pos(col, LANE_ROW[n.branch]);
      const mine = owned.has(n.nodeId);
      const ready = !mine && canUnlockTreeNode(inst, n.nodeId).ok;
      out.push({
        key: `m:${n.nodeId}`, kind: 'mod', id: n.nodeId, ...p, size: 'mod',
        state: mine ? 'owned' : ready ? 'ready' : 'locked',
        badge: mine ? undefined : ready ? `${treeNodeCost(inst, n)}` : `${treeNodeReqLevel(inst, n)}`,
      });
      at[`m:${n.nodeId}`] = p;
    }
    const lit = (k: string) => out.find((n) => n.key === k)?.state === 'owned';
    const e: { a: string; b: string; dashed?: boolean }[] = [];
    const link = (a: string, b: string, dashed = false) => { if (at[a] && at[b]) e.push({ a, b, dashed }); };
    const m = (t: number, br: string) => `m:${heroId}:t${t}${br}`;
    link(`s:${basic}`, m(1, 'R'));
    for (const br of ['A', 'B', 'C']) {
      link(m(1, 'R'), m(2, br));
      for (let t = 2; t < 6; t++) link(m(t, br), m(t + 1, br));
    }
    link(`s:${a1}`, m(2, 'A'), true);
    link(`s:${a2}`, m(3, 'A'), true);
    link(`s:${ult}`, m(5, 'A'), true);
    link(`s:${passive}`, m(6, 'A'), true);
    link(`s:${a1}`, `s:${a2}`, true);
    let prev = `s:${basic}`;
    for (const sid of extras) { link(prev, `s:${sid}`); prev = `s:${sid}`; }
    const edgesOut = e.map((ed) => ({ ...ed, ...{ x1: at[ed.a].x, y1: at[ed.a].y, x2: at[ed.b].x, y2: at[ed.b].y }, on: lit(ed.a) && lit(ed.b) }));
    const maxX = Math.max(...out.map((n) => n.x)) + PAD;
    const maxY = Math.max(...out.map((n) => n.y)) + PAD;
    return { nodes: out, edges: edgesOut, width: maxX, height: maxY };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroId, inst.level, inst.treeNodes, tree]);

  const [sel, setSel] = useState<string>(`m:${heroId}:t1R`);
  const selected = nodes.find((n) => n.key === sel) ?? nodes[0];

  return (
    <div className="ui-tg-wrap">
      <header className="ui-tg-head">
        <h2>Cây kỹ năng</h2>
        <span className="ui-tg-sp"><b>{sp}</b> điểm kỹ năng</span>
      </header>
      <div className="ui-tg" style={{ width: `${width / 10}cqh`, height: `${height / 10}cqh` }}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
          {edges.map((ed) => (
            <line key={`${ed.a}-${ed.b}`} x1={ed.x1} y1={ed.y1} x2={ed.x2} y2={ed.y2}
              className={`${ed.on ? 'on' : ''} ${ed.dashed ? 'dash' : ''}`} />
          ))}
        </svg>
        {nodes.map((n, i) => {
          const skill = n.kind === 'skill' ? EXPEDITION_SKILLS_BY_ID[n.id] : undefined;
          const mod = n.kind === 'mod' ? tree.find((t) => t.nodeId === n.id) : undefined;
          return (
            <button key={n.key} type="button" aria-pressed={sel === n.key}
              className={`ui-tg-node ${n.size} ${n.state} ${sel === n.key ? 'sel' : ''}`}
              style={{ left: `${n.x / 10}cqh`, top: `${n.y / 10}cqh`, animationDelay: `${i * 18}ms` }}
              title={skill?.nameVi ?? mod?.nameVi}
              onClick={() => setSel(n.key)}>
              <span className="face">{skill ? <SkillGlyph skill={skill} /> : <i>{mod?.icon}</i>}</span>
              {n.badge && <em>{n.state === 'locked' && n.kind === 'skill' ? `Cấp ${n.badge}` : n.badge}</em>}
            </button>
          );
        })}
      </div>
      {selected && <Detail key={selected.key} node={selected} heroId={heroId} profile={profile} socket={socket} run={run} setProfile={setProfile}
        busy={busy} equipped={equipped} combat={combat} />}
    </div>
  );
}

function Detail({ node, heroId, profile, socket, run, setProfile, busy, equipped, combat }: {
  node: GNode;
  heroId: string;
  profile: ExpeditionProfile;
  socket: Socket | null;
  run: RunFn;
  setProfile: (p: ExpeditionProfile) => void;
  busy: boolean;
  equipped: string[];
  combat: string[];
}) {
  const def = EXPEDITION_HEROES_BY_ID[heroId];
  const inst = profile.heroes[heroId];
  if (node.kind === 'mod') {
    const n = EXPEDITION_SKILL_TREES[heroId].find((t) => t.nodeId === node.id)!;
    const mine = node.state === 'owned';
    const access = canUnlockTreeNode(inst, n.nodeId);
    return (
      <aside className="ui-tg-detail ui-in-right">
        <small className="kind">Cường hóa · Tầng {n.tier}{n.branch !== 'R' ? ` · Nhánh ${n.branch}` : ''}</small>
        <h2>{n.nameVi}</h2>
        <p>{n.descVi}</p>
        <div className="ui-sk-meta three">
          <span><small>Điểm</small><b>{treeNodeCost(inst, n, mine)}</b></span>
          <span><small>Cần cấp</small><b>{treeNodeReqLevel(inst, n)}</b></span>
          <span><small>Trạng thái</small><b>{mine ? 'Đã mở' : access.ok ? 'Có thể mở' : 'Đang khóa'}</b></span>
        </div>
        {!mine && !access.ok && <small className="ui-note">{access.reason}</small>}
        {!mine && (
          <button type="button" className="ui-plate" disabled={busy || !access.ok}
            onClick={() => void run(() => expeditionApi.unlockTreeNode(socket, heroId, n.nodeId), setProfile)}>
            <span>Mở nút · {treeNodeCost(inst, n)} điểm</span>
          </button>
        )}
        {!!inst.treeNodes?.length && (
          <button type="button" className="ui-plate small dim" disabled={busy}
            onClick={() => void run(() => expeditionApi.resetTree(socket, heroId), setProfile)}>
            <span>Tẩy cây · {EXP_BALANCE.skillTree.resetCostSeal} ◈</span>
          </button>
        )}
      </aside>
    );
  }
  const s = EXPEDITION_SKILLS_BY_ID[node.id];
  const lv = inst.skillLevels[node.id] ?? 1;
  const cost = skillUpgradeCost(lv);
  const capped = lv >= skillLevelCap(inst.level) || lv >= EXP_BALANCE.skills.maxLevel;
  const ok = node.state === 'owned';
  const kind = s.slotKind === 'basic' ? 'Đòn thường' : s.slotKind === 'ultimate' ? 'Tuyệt kỹ' : s.slotKind === 'passive' ? 'Nội tại' : 'Kỹ năng';
  const toggle = () => {
    const next = equipped.includes(node.id) ? equipped.filter((v) => v !== node.id) : [...equipped, node.id];
    if (next.length <= 6) void run(() => expeditionApi.upgradeHero(socket, { heroId, kind: 'loadout', skillIds: next }), setProfile);
  };
  return (
    <aside className="ui-tg-detail ui-in-right">
      <small className="kind">{kind} · {ELEMENT_LABELS_VI[s.element]}</small>
      <h2>{s.nameVi}</h2>
      <p>{s.summaryVi}</p>
      <div className="ui-sk-meta three">
        <span><small>AP</small><b>{s.apCost > 0 ? s.apCost : `+${s.apGain}`}</b></span>
        <span><small>Số đòn</small><b>{s.hits.length}</b></span>
        <span><small>Cấp</small><b>{ok ? `${lv}/${EXP_BALANCE.skills.maxLevel}` : '—'}</b></span>
      </div>
      {!ok && <small className="ui-note">Lĩnh hội khi {def.nameVi} đạt cấp {skillUnlockLevel(def, node.id)}.</small>}
      {ok && combat.includes(node.id) && (
        <button type="button" className="ui-plate" disabled={busy || (!equipped.includes(node.id) && equipped.length >= 6)} onClick={toggle}>
          <span>{equipped.includes(node.id) ? 'Tháo khỏi bộ kỹ năng' : 'Gắn vào bộ kỹ năng'}</span>
        </button>
      )}
      {ok && (cost && !capped ? (
        <button type="button" className="ui-plate" disabled={busy}
          onClick={() => void run(() => expeditionApi.upgradeHero(socket, { heroId, kind: 'skill', skillId: node.id }), setProfile)}>
          <span>Nâng cấp · {cost.expCrystal}⬢{cost.starlight ? ` ${cost.starlight}✦` : ''}{cost.seal ? ` ${cost.seal}◈` : ''}</span>
        </button>
      ) : (
        <small className="ui-note">{lv >= EXP_BALANCE.skills.maxLevel ? 'Đã đạt cấp tối đa.' : `Cần nhân vật cấp ${lv * EXP_BALANCE.skills.levelPerSkillRank} để nâng tiếp.`}</small>
      ))}
    </aside>
  );
}
