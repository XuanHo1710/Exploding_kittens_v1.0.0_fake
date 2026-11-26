import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Socket } from 'socket.io-client';
import {
  CAMPAIGN, CAMPAIGN_ACTION, CAMPAIGN_BRANCHES, CAMPAIGN_EVT, CAMPAIGN_FRAME_EVT, CAMPAIGN_INPUT_EVT,
  CAMPAIGN_LEVEL_CAP, CAMPAIGN_RANK_CAP, CAMPAIGN_RESULT_EVT, CAMPAIGN_SKILLS, CAMPAIGN_STATS,
  campaignRankLevel, campaignStats, campaignXpRequired,
  type CampaignCommand, type CampaignFrame, type CampaignProgress, type CampaignResult,
  type CampaignState, type CampaignUpgrade,
} from '../../../shared/src/mk/campaign';
import { CAMPAIGN_ART, drawCampaign, preloadCampaign, type SceneFrames } from '../mk/campaign-render';
import { initMkAudio, playMkSfx, setMkBgm, stopMkBgm, syncMkMute } from '../mk/sound';
import { isMuted } from '../sfx';
import './mk-campaign.css';

const heroName = (id: string) => CAMPAIGN.heroes.find((h) => h.id === id)?.name ?? id;
const nextWave = (p: CampaignProgress) => Math.min(CAMPAIGN.waves.length, p.highestCleared + 1);
const statLabels = { vitality: 'Sinh lực +8 HP', force: 'Sức đánh +2 ATK', defense: 'Phòng thủ +2 DEF' };
const keyActions: Readonly<Record<string, number>> = {
  KeyJ: CAMPAIGN_ACTION.attack, KeyK: CAMPAIGN_ACTION.active, KeyR: CAMPAIGN_ACTION.ultimate,
  KeyL: CAMPAIGN_ACTION.guard, ShiftLeft: CAMPAIGN_ACTION.dodge, ShiftRight: CAMPAIGN_ACTION.dodge,
  Space: CAMPAIGN_ACTION.switch,
};
const movements = new Set(['KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

interface Props { socket: Socket | null; onLeave: () => void }

export default function MkCampaignBoard({ socket, onLeave }: Props) {
  const [progress, setProgress] = useState<CampaignProgress>();
  const [frame, setFrame] = useState<CampaignFrame>();
  const [result, setResult] = useState<CampaignResult>();
  const [wave, setWave] = useState(1);
  const [heroId, setHeroId] = useState(CAMPAIGN.progression.starter);
  const [roster, setRoster] = useState<string[]>([CAMPAIGN.progression.starter]);
  const [leader, setLeader] = useState(CAMPAIGN.progression.starter);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(isMuted);
  const [mapIndex, setMapIndex] = useState(0);
  const scene = useRef<SceneFrames>({ received: 0 });
  const active = useRef<string | undefined>(undefined);
  const lastFx = useRef(0);
  const seq = useRef(0);
  const pressed = useRef(new Set<string>());
  const canvas = useRef<HTMLCanvasElement>(null);
  const commandBusy = useRef(false);
  const cancelFrame = () => {
    active.current = undefined;
    scene.current = { received: 0 };
    pressed.current.clear();
    setFrame(undefined);
  };

  const updateFrame = (next: CampaignFrame) => {
    if (active.current !== next.attemptId || (scene.current.current?.time ?? -1) > next.time) return;
    const before = scene.current.current;
    scene.current = { previous: before, current: next, received: performance.now() };
    if (before && next.bossPhase > before.bossPhase) playMkSfx('boss_roar');
    for (const fx of next.effects) {
      if (fx.id <= lastFx.current) continue;
      lastFx.current = fx.id;
      playMkSfx(fx.asset === 'parry' ? 'parry_clang' : fx.asset === 'impact' ? 'hero_hit' : 'mage_cast');
    }
    setFrame(next);
  };

  const request = async (command: CampaignCommand): Promise<CampaignState> => {
    if (!socket?.connected) throw Error('Chưa kết nối máy chủ.');
    const ack: { ok: boolean; result?: CampaignState; error?: string } =
      await socket.timeout(12_000).emitWithAck(CAMPAIGN_EVT, command);
    if (!ack?.ok || !ack.result) throw Error(ack?.error ?? 'Máy chủ chưa phản hồi.');
    return ack.result;
  };

  const attach = (next?: CampaignFrame) => {
    if (!next) { cancelFrame(); return; }
    if (next.attemptId !== active.current) {
      active.current = next.attemptId;
      scene.current = { received: 0 };
      lastFx.current = 0;
      pressed.current.clear();
    }
    updateFrame(next);
  };

  const loadState = async () => {
    try {
      const state = await request({ t: 'load' });
      setProgress(state.progress);
      setWave(nextWave(state.progress));
      attach(state.frame);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không mở được Chiến dịch.');
    }
  };

  useEffect(() => {
    preloadCampaign();
    if (!socket) { setError('Đang chờ kết nối máy chủ…'); return; }
    const onConnect = () => { void loadState(); };
    const onDisconnect = () => {
      cancelFrame();
      setError('Mất kết nối. Khi kết nối lại, Chiến dịch tải checkpoint trên server.');
    };
    const onResult = (received: CampaignResult) => {
      if (active.current !== received.attemptId) return;
      cancelFrame();
      setResult(received);
      if (received.progress) {
        setProgress(received.progress);
        setWave(nextWave(received.progress));
        const recruit = received.reward?.recruit;
        if (recruit) setRoster((team) => team.length < CAMPAIGN.progression.partyCap ? [...team, recruit] : team);
        playMkSfx(received.reward?.levels.length ? 'level_up' : 'wave_clear');
      }
      if (received.outcome === 'error') void loadState();
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(CAMPAIGN_FRAME_EVT, updateFrame);
    socket.on(CAMPAIGN_RESULT_EVT, onResult);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(CAMPAIGN_FRAME_EVT, updateFrame);
      socket.off(CAMPAIGN_RESULT_EVT, onResult);
      if (active.current && socket.connected) socket.emit(CAMPAIGN_EVT, { t: 'abandon', attemptId: active.current });
      active.current = undefined;
    };
  }, [socket]);

  const sendInput = (extra = 0) => {
    if (!active.current || !socket?.connected) return;
    const keys = pressed.current;
    const down = (...choices: string[]) => choices.some((key) => keys.has(key)) ? 1 : 0;
    const x = down('KeyD', 'ArrowRight') - down('KeyA', 'ArrowLeft');
    const y = down('KeyS', 'ArrowDown') - down('KeyW', 'ArrowUp');
    const input = { attemptId: active.current, seq: ++seq.current, x, y, buttons: extra | (keys.has('KeyJ') ? CAMPAIGN_ACTION.attack : 0) };
    if (extra) socket.emit(CAMPAIGN_INPUT_EVT, input);
    else socket.volatile.emit(CAMPAIGN_INPUT_EVT, input);
  };

  const attemptId = frame?.attemptId;
  useEffect(() => {
    if (!attemptId || !canvas.current) return;
    const context = canvas.current.getContext('2d');
    if (!context) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let paint = 0;
    const render = (time: number) => {
      drawCampaign(context, scene.current, time, reduce.matches);
      paint = requestAnimationFrame(render);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const action = keyActions[event.code];
      if (!movements.has(event.code) && !action) return;
      if (event.code === 'Space' && event.target instanceof HTMLButtonElement) event.target.blur();
      event.preventDefault();
      pressed.current.add(event.code);
      if (!event.repeat) sendInput(action ?? 0);
    };
    const onKeyUp = (event: KeyboardEvent) => { pressed.current.delete(event.code); };
    const onBlur = () => { pressed.current.clear(); sendInput(); };
    const interval = window.setInterval(() => sendInput(), 50);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    paint = requestAnimationFrame(render);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      clearInterval(interval);
      cancelAnimationFrame(paint);
      pressed.current.clear();
    };
  }, [attemptId, socket]);

  useEffect(() => {
    syncMkMute(muted);
    if (attemptId) setMkBgm(frame?.wave === CAMPAIGN.waves.length ? 'boss_theme' : 'battle_grass');
    return stopMkBgm;
  }, [attemptId, muted]);

  async function run(command: CampaignCommand) {
    if (commandBusy.current) return;
    commandBusy.current = true;
    setBusy(true);
    setError('');
    try {
      const state = await request(command);
      setProgress(state.progress);
      if (command.t === 'deploy') {
        setResult(undefined);
        attach(state.frame);
      }
      if (command.t === 'abandon') cancelFrame();
      if (command.t === 'upgrade') playMkSfx('upgrade_ok');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Thao tác chưa được xác nhận.');
    } finally {
      setBusy(false);
      commandBusy.current = false;
    }
  }

  const upgrade = (change: CampaignUpgrade) => {
    if (progress) void run({ t: 'upgrade', revision: progress.revision, hero: heroId, ...change });
  };
  const deploy = () => {
    if (!progress || !socket?.connected) return;
    void initMkAudio();
    void run({ t: 'deploy', revision: progress.revision, wave, roster, controlled: leader });
  };
  const leave = () => {
    if (active.current) return;
    onLeave();
  };
  const toggleRoster = (id: string) => {
    if (roster.includes(id) && roster.length > 1) {
      const next = roster.filter((member) => member !== id);
      setRoster(next);
      if (leader === id) setLeader(next[0]);
    } else if (!roster.includes(id) && roster.length < CAMPAIGN.progression.partyCap) setRoster([...roster, id]);
  };
  const touch = (event: PointerEvent<HTMLButtonElement>, key: string, down: boolean) => {
    if (down) {
      event.currentTarget.setPointerCapture(event.pointerId);
      pressed.current.add(key);
    } else pressed.current.delete(key);
    sendInput();
  };
  const selected = progress?.heroes[heroId];
  const hero = CAMPAIGN.heroes.find((h) => h.id === heroId)!;
  const actor = frame?.actors.find((a) => a.id === frame.controlled);
  const inBattle = Boolean(frame);
  const focusedHero = actor ? progress?.heroes[actor.asset] : undefined;
  const boss = frame?.actors.find((a) => a.boss && a.hp > 0);
  const stats = selected && campaignStats(hero, selected);

  return (
    <main className="mk-campaign">
      <header className="mkc-header">
        <div><p>Mighty Knight Pixel</p><h1>Quần đảo Chuông Gió</h1></div>
        <div className="mkc-actions">
          <button type="button" onClick={() => setMuted(!muted)} aria-pressed={muted}>{muted ? 'Bật âm thanh' : 'Tắt âm thanh'}</button>
          {frame ? <button type="button" disabled={busy || frame.phase === 'settling'} onClick={() => void run({ t: 'abandon', attemptId: frame.attemptId })}>Về trại</button> :
            <button type="button" onClick={leave}>Thoát Chiến dịch</button>}
        </div>
      </header>

      {error && <p className="mkc-alert" role="alert">{error} {!inBattle && <button type="button" onClick={() => void loadState()}>Tải lại trại</button>}</p>}
      {!progress && !error && <p role="status">Đang tải hồ sơ Chiến dịch…</p>}

      {frame && (
        <section className="mkc-battle" aria-label="Đấu trường Đồng cỏ">
          <div className="mkc-strip">
            <strong>Wave {frame.wave} / {CAMPAIGN.waves.length} · {CAMPAIGN.waves[frame.wave - 1].name}</strong>
            <span>Nhóm {frame.groups}/{frame.totalGroups} · {frame.remaining} quái</span>
          </div>
          <div className="mkc-scene">
            <canvas ref={canvas} width={CAMPAIGN.viewport[0]} height={CAMPAIGN.viewport[1]} aria-label="Sân chiến đấu pixel" />
            {frame.phase !== 'combat' && <strong className="mkc-stamp">{frame.phase === 'intro' ? `Wave ${frame.wave}` : 'Đang ghi kết quả…'}</strong>}
            {boss && <div className="mkc-boss">
              <strong>{CAMPAIGN.boss.name} · {CAMPAIGN.boss.phases[frame.bossPhase].name}</strong>
              <progress value={boss.hp} max={boss.maxHp} aria-label="HP trùm" />
              <span>{frame.bossStaggerUntil > frame.time ? 'Đã phá thế' : `Break ${Math.floor(frame.bossBreak)}/${CAMPAIGN.boss.breakMax}`}</span>
            </div>}
          </div>
          <div className="mkc-allies">
            {frame.actors.filter((a) => a.side === 'hero').map((ally) => (
              <div key={ally.id} className={ally.id === frame.controlled ? 'selected' : ''}>
                <strong>{heroName(ally.asset)} · Lv {progress?.heroes[ally.asset]?.level}</strong>
                <progress max={ally.maxHp} value={ally.hp} aria-label={`HP ${heroName(ally.asset)}`} />
                <small>{ally.hp}/{ally.maxHp} HP</small>
              </div>
            ))}
          </div>
          <div className="mkc-battle-controls">
            <div className="mkc-touch" aria-label="Di chuyển">
              {(['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'] as const).map((key, i) => (
                <button key={key} type="button" aria-label={['Trái','Lên','Xuống','Phải'][i]}
                  onPointerDown={(event) => touch(event, key, true)} onPointerUp={(event) => touch(event, key, false)}
                  onPointerCancel={(event) => touch(event, key, false)}>{['←','↑','↓','→'][i]}</button>
              ))}
            </div>
            <button type="button" onClick={() => sendInput(CAMPAIGN_ACTION.attack)}>J · Đánh</button>
            <button type="button" disabled={!focusedHero?.skills.active || (actor?.activeUntil ?? 0) > frame.time}
              onClick={() => sendInput(CAMPAIGN_ACTION.active)}>
              K · {focusedHero?.skills.active ? (actor?.activeUntil ?? 0) > frame.time ? `${(((actor?.activeUntil ?? 0) - frame.time) / 1000).toFixed(1)} giây` : 'Kỹ năng' : 'Khóa Lv 2'}
            </button>
            <button type="button" disabled={!focusedHero?.skills.ultimate || (actor?.fury ?? 0) < 100}
              onClick={() => sendInput(CAMPAIGN_ACTION.ultimate)}>
              R · {focusedHero?.skills.ultimate ? `Tuyệt kỹ ${actor?.fury ?? 0}/100` : 'Khóa Lv 4'}
            </button>
            <button type="button" onClick={() => sendInput(CAMPAIGN_ACTION.guard)}>L · Đỡ</button>
            <button type="button" onClick={() => sendInput(CAMPAIGN_ACTION.dodge)}>Shift · Né</button>
            <button type="button" disabled={frame.actors.filter((a) => a.side === 'hero' && a.hp > 0).length < 2}
              onClick={() => sendInput(CAMPAIGN_ACTION.switch)}>Space · Đổi tướng</button>
          </div>
          <p className="mkc-help">WASD hoặc phím mũi tên để đổi làn. Giữ J để nối đòn. L khi đòn sắp chạm để đỡ phản.</p>
        </section>
      )}

      {progress && !inBattle && (
        <>
          {result && <section className="mkc-result" aria-live="polite">
            <h2>{result.outcome === 'win' ? progress.highestCleared === 5 && result.wave === 5 ? 'Hoàn thành đảo Đồng cỏ' : `Thắng wave ${result.wave}`
              : result.outcome === 'loss' ? 'Đội đã gục · Có thể thử lại' : 'Chưa xác nhận được phần thưởng'}</h2>
            {result.reward && <p>+{result.reward.xp} XP mỗi tướng ra trận · +{result.reward.crest} Crest
              {result.reward.recruit ? ` · ${heroName(result.reward.recruit)} gia nhập` : ''}</p>}
            {result.reward?.levels.map((level) => (
              <p key={level.id}>{heroName(level.id)} lên cấp {level.from} → {level.to}{level.unlocked.map((skill) =>
                ` · Mở ${CAMPAIGN.heroes.find((entry) => entry.id === level.id)?.[skill].name}`).join('')}</p>
            ))}
          </section>}
          <section className="mkc-map" aria-label="Các đảo">
            <img src={`${CAMPAIGN_ART}/${CAMPAIGN.maps[mapIndex].art}`} alt={CAMPAIGN.maps[mapIndex].landmark} />
            <div><h2>{CAMPAIGN.maps[mapIndex].name}</h2>
              <p>{mapIndex === 0 ? 'Chọn một wave và chuẩn bị đội ra trận.' : mapIndex === 1 && progress.highestCleared === 5 ?
                'Đã mở tuyến Sa mạc. Có thể xem bản đồ của chương kế tiếp.' : CAMPAIGN.maps[mapIndex].mechanic}</p>
              <nav aria-label="Xem bản đồ">
                {CAMPAIGN.maps.map((map, index) => <button key={map.id} type="button" aria-pressed={mapIndex === index}
                  onClick={() => setMapIndex(index)}>{map.name.split(' · ')[0]}</button>)}
              </nav>
            </div>
          </section>
          <div className="mkc-camp">
            <section className="mkc-panel" aria-label="Màn chơi và đội">
              <div className="mkc-strip"><h2>Trại tuyển quân</h2><strong>{progress.crest} Crest</strong></div>
              <nav className="mkc-actions" aria-label="Chọn wave">
                {CAMPAIGN.waves.map((item) => <button key={item.number} type="button" aria-pressed={item.number === wave}
                  disabled={item.number > progress.highestCleared + 1} onClick={() => { setWave(item.number); setMapIndex(0); }}>
                  Wave {item.number}{item.number <= progress.highestCleared ? ' ✓' : ''}
                </button>)}
              </nav>
              <p>{CAMPAIGN.waves[wave - 1].lesson}</p>
              <h3>Tướng ra trận · {roster.length}/{CAMPAIGN.progression.partyCap}</h3>
              <div className="mkc-roster">
                {CAMPAIGN.heroes.map((item) => {
                  const saved = progress.heroes[item.id];
                  const inTeam = roster.includes(item.id);
                  return <div key={item.id}>
                    <button type="button" disabled={!saved} aria-pressed={heroId === item.id}
                      onClick={() => setHeroId(item.id)}>
                      <i aria-hidden="true" style={{ backgroundImage: `url(${CAMPAIGN_ART}/art/${item.id}.png)` }} />
                      <span>{item.name}<small>{saved ? `Lv ${saved.level} · ${item.role}` : `Sau wave ${CAMPAIGN.waves.find((w) => w.recruit === item.id)?.number}`}</small></span>
                    </button>
                    {saved && <label><input type="checkbox" aria-label={`Đưa ${item.name} ra trận`} checked={inTeam}
                      disabled={inTeam ? roster.length === 1 : roster.length >= CAMPAIGN.progression.partyCap}
                      onChange={() => toggleRoster(item.id)} /> Ra trận</label>}
                  </div>;
                })}
              </div>
              <label className="mkc-leader">Điều khiển <select value={leader} onChange={(event) => setLeader(event.target.value)}>
                {roster.map((id) => <option key={id} value={id}>{heroName(id)}</option>)}
              </select></label>
              <button type="button" className="mkc-main" disabled={busy || !socket?.connected} onClick={deploy}>
                {wave <= progress.highestCleared ? 'Chơi lại' : 'Bắt đầu'} wave {wave}
              </button>
            </section>
            {selected && stats && <section className="mkc-panel" aria-label="Nâng cấp tướng">
              <div className="mkc-strip"><h2>{hero.name}</h2><strong>Cấp {selected.level}/{CAMPAIGN_LEVEL_CAP}</strong></div>
              {selected.level < CAMPAIGN_LEVEL_CAP ? <div className="mkc-xp">
                <progress value={selected.xp} max={campaignXpRequired(selected.level)} aria-label="Kinh nghiệm" />
                <small>{selected.xp}/{campaignXpRequired(selected.level)} XP</small></div> : <p>Đã đạt cấp tối đa</p>}
              <p>{stats.hp} HP · {stats.atk} ATK · {stats.defense} DEF</p>
              <h3>Chỉ số · {selected.statPoints} điểm</h3>
              <div className="mkc-actions">
                {CAMPAIGN_STATS.map((key) => <button key={key} type="button" disabled={busy || !selected.statPoints}
                  onClick={() => upgrade({ kind: 'stat', key })}>{statLabels[key]} ({selected.stats[key]})</button>)}
              </div>
              <h3>Kỹ năng · {selected.skillPoints} điểm</h3>
              {CAMPAIGN_SKILLS.map((skill) => {
                const rank = selected.skills[skill];
                const minLevel = campaignRankLevel(skill, rank + 1);
                return <div className="mkc-skill" key={skill}>
                  <div><strong>{hero[skill].name}</strong><small>{hero[skill].effect}</small></div>
                  <button type="button" disabled={busy || !rank || rank >= CAMPAIGN_RANK_CAP || minLevel > selected.level || !selected.skillPoints}
                    onClick={() => upgrade({ kind: 'skill', key: skill })}>
                    {!rank ? `Mở ở Lv ${minLevel}` : rank === CAMPAIGN_RANK_CAP ? 'Hạng 5 · Tối đa' :
                      minLevel > selected.level ? `Hạng ${rank} · Lv ${minLevel} để nâng` : `Hạng ${rank} → ${rank + 1} · 1 điểm`}
                  </button>
                </div>;
              })}
              <h3>Nâng cấp bằng Crest</h3>
              <div className="mkc-actions">
                {CAMPAIGN_BRANCHES.map((key) => {
                  const tier = CAMPAIGN.progression.upgradeTiers[selected.branches[key]];
                  return <button key={key} type="button" disabled={busy || !tier || progress.crest < tier.cost}
                    onClick={() => upgrade({ kind: 'crest', key })}>
                    {CAMPAIGN.progression.branches[key].name} · {tier ? `${selected.branches[key]} → ${tier.bonus} · ${tier.cost} Crest` : 'Tối đa'}
                  </button>;
                })}
              </div>
            </section>}
          </div>
        </>
      )}
    </main>
  );
}
