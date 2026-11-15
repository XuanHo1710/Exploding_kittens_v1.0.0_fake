import { useEffect, useState, type ReactNode } from 'react';
import { BookOpen, Check, Coins, Copy, Crown, Gamepad2, Link2, LogOut, Play, Settings2, Trophy, UserPlus, UserX, Users } from 'lucide-react';
import {
  ANTS_MAX_EMPIRES,
  ANTS_MINUTE_OPTIONS,
  ANTS_START_GOLD,
  antsIncome,
  BANSUNG_BIOMES,
  BANSUNG_BOT_LEVELS,
  BANSUNG_DIFFICULTIES,
  BANSUNG_GAME_MODES,
  BANSUNG_HERO_IDS,
  BANSUNG_HERO_STAT_SCALE,
  BANSUNG_MAX_BOTS,
  BANSUNG_MAX_PLAYERS,
  BANSUNG_REVIVE_MODES,
  BANSUNG_STATIC_ROOT,
  BET_OPTIONS,
  DEFAULT_ANTS_CONFIG,
  DEFAULT_BANSUNG_CONFIG,
  DEFAULT_LINK_CONFIG,
  DEFAULT_THAP_CONFIG,
  GAME_MODES,
  LINK_BOSSES,
  LINK_BOSS_SKILL_NAME,
  LINK_BOT_LABEL,
  LINK_COOP_RAID_S,
  LINK_FINAL_RAID_S,
  LINK_FOG_MS,
  LINK_KO_BONUS,
  LINK_MAX_PLAYERS,
  LINK_RAID_S,
  LINK_SHUFFLE_CD_S,
  LINK_STAGE1_S,
  LINK_TITAN_RAID_S,
  LOTO_CALL_MS,
  LOTO_COLORS,
  LOTO_COLOR_ORDER,
  LOTO_SHEET_PRICE,
  MIN_PLAYERS,
  THAP_BASE,
  THAP_BOT_LABEL,
  THAP_FIRST_ROUND_S,
  THAP_MAX_PLAYERS,
  THAP_MAX_POP,
  THAP_MINUTE_OPTIONS,
  THAP_MODE_LABEL,
  THAP_ROUND_S,
  THAP_START_GOLD,
  THAP_START_ROUND_INCOME,
  THAP_TEAM_COLORS,
  THAP_TEAM_NAMES,
  assignThapTeams,
  getBansungHero,
  linkBossMaxHp,
  lotoDefaultColors,
  normalizeBansungHero,
  normalizeThapTeam,
  resolveBansungGameMode,
  roomDeckSummary,
  type AccountInfo,
  type BansungBiome,
  type BansungBotLevel,
  type BansungDifficulty,
  type BansungGameMode,
  type BansungHeroId,
  type BansungReviveMode,
  type GameMode,
  type RoomRules,
  type RoomView,
  type ThapMode,
} from '../../../shared/src';
import { copyTextSafe, fmtCoins } from './Dock';
import PlayerAvatar from '../art/PlayerAvatar';
import ChatPanel, { useChatState, type RoomChat } from './ChatPanel';
import Modal from './Modal';
import RoomSettings, { RoomRuleSummary } from './RoomSettings';
import { LobbySpectators, isSpectating, roomPeople } from './Spectators';
import { roomInviteUrl } from '../roomLink';
import { initBansungAudio, setBansungBgm, stopBansungBgm, syncBansungMute } from '../bansung/sound';
import { startMiragineBgm, stopMiragineBgm } from '../thap/sound';
import '../thap/thap.css';

interface Props {
  view: RoomView;
  meId: string;
  emit: (event: string, payload?: unknown) => void;
  chat?: RoomChat;
  account?: AccountInfo | null;
  onSaveRules?: (rules: RoomRules) => void | Promise<void>;
}

const NO_CHAT: RoomChat = { messages: [], typing: {}, send: () => {}, onTyping: () => {} };

function SelectField({
  label,
  hint,
  value,
  disabled,
  onChange,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  value: string | number;
  disabled?: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className={`cfg-field${disabled ? ' is-disabled' : ''}`}>
      <span className="cfg-label">
        <span>{label}</span>
        {hint && <span className="cfg-hint">{hint}</span>}
      </span>
      <select className="ui-select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}

export default function Lobby({ view, meId, emit, chat = NO_CHAT, account, onSaveRules }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [miragineGuideOpen, setMiragineGuideOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const { typingNames, unread } = useChatState(chat, roomPeople(view), meId, true);
  const isHost = view.hostId === meId;
  const gameMode: GameMode = view.gameMode ?? 'exploding_kittens';

  useEffect(() => {
    if (gameMode === 'thap_hung') {
      stopBansungBgm();
      startMiragineBgm('menu');
      return () => stopMiragineBgm();
    }
    if (gameMode === 'bansung') {
      stopMiragineBgm();
      void initBansungAudio().catch(() => {});
      syncBansungMute();
      setBansungBgm('menu');
      return () => stopBansungBgm();
    }
    stopMiragineBgm();
    stopBansungBgm();
    return undefined;
  }, [gameMode]);

  const modeInfo = GAME_MODES[gameMode];
  const online = view.players.filter((p) => p.connected).length;
  const bet = view.bet;
  const isLoto = gameMode === 'loto';
  const picks = view.loto?.picks ?? {};
  const myColors = view.loto?.colors?.[meId] ?? lotoDefaultColors(Math.max(0, view.players.findIndex((p) => p.id === meId)));
  const setSheetColor = (k: number, c: string) => emit('loto:pick', { colors: myColors.map((x, i) => (i === k ? c : x)) });
  const stakeOf = (id: string) => (isLoto ? LOTO_SHEET_PRICE * (picks[id] ?? 1) : bet);
  const poor = view.players.filter((p) => p.connected && stakeOf(p.id) > 0 && (p.coins ?? 0) < stakeOf(p.id));
  const lotoPot = view.players.filter((p) => p.connected).reduce((s, p) => s + stakeOf(p.id), 0);

  const maxPlayers = gameMode === 'exploding_kittens' ? Math.min(view.rules.maxPlayers, modeInfo.maxPlayers) : modeInfo.maxPlayers;
  const empty = Math.max(0, maxPlayers - view.players.length);
  const me = view.players.find((player) => player.id === meId);
  const spectating = isSpectating(view, meId);
  const awaitingReady = view.players.filter((player) => player.connected && player.id !== view.hostId && !player.ready);
  const deck = roomDeckSummary(view.rules, online);

  const antsCfg = view.ants?.config ?? DEFAULT_ANTS_CONFIG;
  const linkCfg = view.link?.config ?? DEFAULT_LINK_CONFIG;
  const linkBots = Math.max(0, Math.min(LINK_MAX_PLAYERS - online, linkCfg.bots ?? 0));

  const isThap = gameMode === 'thap_hung';
  const thapCfg = view.thap?.config ?? DEFAULT_THAP_CONFIG;
  const thapBots = Math.max(0, Math.min(THAP_MAX_PLAYERS - online, thapCfg.bots));
  const thapTeamOf = (id: string) => normalizeThapTeam(view.thap?.teams?.[id] ?? Math.max(0, view.players.findIndex((p) => p.id === id)) % 2);
  const thapHumans = view.players.filter((p) => p.connected);
  const thapAssign = assignThapTeams(thapHumans.map((p) => thapTeamOf(p.id)), thapBots, thapCfg.mode);
  const thapBotTeams = thapAssign.slice(thapHumans.length);
  const thapTotal = online + thapBots;
  const thapProblem =
    thapTotal < 2 ? 'Cần ≥ 2 phe (thêm máy)'
      : thapTotal > THAP_MAX_PLAYERS ? `Tối đa ${THAP_MAX_PLAYERS} phe`
      : thapCfg.mode === 'coop' && thapBots < 1 ? 'Co-op cần ≥ 1 máy'
      : thapCfg.mode === 'teams' && new Set(thapAssign).size < 2 ? 'Cần ≥ 2 đội khác nhau'
      : '';
  const setThap = (patch: Partial<typeof thapCfg>) => emit('thap:config', { config: { ...thapCfg, ...patch } });

  const isBansung = gameMode === 'bansung';
  const bansungCfg = view.bansung?.config ?? DEFAULT_BANSUNG_CONFIG;
  const bansungMode = resolveBansungGameMode(bansungCfg);
  const bansungMaxBots = Math.min(BANSUNG_MAX_BOTS, Math.max(0, BANSUNG_MAX_PLAYERS - online));
  const bansungBots = Math.max(0, Math.min(bansungMaxBots, bansungCfg.bots));
  const bansungTotal = online + bansungBots;
  const bansungProblem =
    online > modeInfo.maxPlayers
      ? `Tối đa ${modeInfo.maxPlayers} người`
      : bansungTotal < 1
        ? 'Cần ≥ 1 chiến binh'
        : '';
  const setBansung = (patch: Partial<typeof bansungCfg>) => emit('bansung:config', { config: { ...bansungCfg, ...patch } });
  const bansungHeroOf = (id: string): BansungHeroId => {
    const saved = view.bansung?.heroes?.[id];
    if (saved) return normalizeBansungHero(saved);
    const idx = Math.max(0, view.players.findIndex((p) => p.id === id));
    return BANSUNG_HERO_IDS[idx % BANSUNG_HERO_IDS.length] ?? 'mascot';
  };
  const myBansungHero = bansungHeroOf(meId);
  const pickBansungHero = (hero: BansungHeroId) => emit('bansung:hero', { hero });

  const deckOk =
    gameMode === 'exploding_kittens' ? deck.canStart
      : isThap ? !thapProblem
      : isBansung ? !bansungProblem
      : gameMode === 'ant_empire' ? online + antsCfg.bots >= 2 && online + antsCfg.bots <= ANTS_MAX_EMPIRES
      : gameMode === 'link_duel' ? online + linkBots >= 1 && online + linkBots <= LINK_MAX_PLAYERS
        : online <= modeInfo.maxPlayers;
  const canStart = online >= modeInfo.minPlayers && awaitingReady.length === 0 && deckOk && poor.length === 0;
  const setAnts = (patch: Partial<typeof antsCfg>) => emit('ants:config', { config: { ...antsCfg, ...patch } });

  const copyRoomCode = () => {
    void copyTextSafe(view.code).then((ok) => setCopied(ok));
    window.setTimeout(() => setCopied(false), 1500);
  };

  const shareInvite = async () => {
    const url = roomInviteUrl(view.code);
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    if (touch && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `Vào phòng ${view.code}`, text: `Chơi ${modeInfo.shortName} chung nè! Phòng ${view.code}:`, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    const ok = await copyTextSafe(url);
    setLinkCopied(ok);
    window.setTimeout(() => setLinkCopied(false), 1800);
  };

  const potTotal = isLoto ? lotoPot : bet * online;

  return (
    <div className="center-screen">
      <div className="lobby-wrap">
        <div className="panel lobby">
          {/* Header gọn: mã phòng + link mời + sĩ số */}
          <div className="lobby-head">
            <div className="lobby-code-group">
              <button type="button" className="room-code-btn" onClick={copyRoomCode} title="Bấm để sao chép mã phòng">
                <span className="room-code-label">PHÒNG</span>
                <span className="room-code">{view.code}</span>
                <span className="room-code-copy">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </span>
              </button>
              <button type="button" className="secondary small invite-link-btn" onClick={() => void shareInvite()} title={roomInviteUrl(view.code)}>
                {linkCopied ? <Check size={14} /> : <Link2 size={14} />} {linkCopied ? 'Đã chép link' : 'Gửi link mời'}
              </button>
            </div>
            <div className="lobby-count-pill">
              <Users size={15} />
              <strong>{view.players.length}/{maxPlayers}</strong>
              <span className="muted">{modeInfo.shortName}</span>
            </div>
          </div>

          {/* Bộ chọn trò chơi + Cược xu dạng select option nhẹ nhàng */}
          <div className="lobby-pickers">
            <SelectField
              label={<span className="icon-label"><Gamepad2 size={14} /> Trò chơi</span>}
              hint={isHost ? undefined : 'Chủ phòng chọn'}
              value={gameMode}
              disabled={!isHost}
              onChange={(val) => emit('room:mode', { gameMode: val as GameMode })}
            >
              {(Object.keys(GAME_MODES) as GameMode[]).map((m) => (
                <option key={m} value={m}>
                  {GAME_MODES[m].emoji} {GAME_MODES[m].shortName} ({GAME_MODES[m].minPlayers}–{GAME_MODES[m].maxPlayers}p)
                </option>
              ))}
            </SelectField>

            {isLoto ? (
              <SelectField
                label={<span className="icon-label">🎫 Số tờ Lô Tô</span>}
                hint={<span className="pot-inline"><Trophy size={12} /> Hũ {fmtCoins(lotoPot)}</span>}
                value={picks[meId] ?? 1}
                disabled={!me || spectating}
                onChange={(val) => emit('loto:pick', { sheets: Number(val) })}
              >
                <option value={1}>1 tờ · {fmtCoins(LOTO_SHEET_PRICE)} xu</option>
                <option value={2}>2 tờ · {fmtCoins(2 * LOTO_SHEET_PRICE)} xu (đủ 90 số)</option>
              </SelectField>
            ) : (
              <SelectField
                label={<span className="icon-label"><Coins size={14} /> Cược mỗi người</span>}
                hint={
                  potTotal > 0 ? (
                    <span className="pot-inline"><Trophy size={12} /> Hũ {fmtCoins(potTotal)} xu</span>
                  ) : (
                    'Chơi vui'
                  )
                }
                value={bet}
                disabled={!isHost}
                onChange={(val) => emit('room:bet', { amount: Number(val) })}
              >
                {BET_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {b === 0 ? 'Miễn phí (0 xu)' : `${fmtCoins(b)} xu / người`}
                  </option>
                ))}
              </SelectField>
            )}
          </div>

          {isLoto && me && !spectating && (
            <div className="loto-color-pick compact">
              {Array.from({ length: picks[meId] ?? 1 }, (_, k) => (
                <div key={k} className="loto-color-row">
                  <span className="muted small">Màu tờ {k + 1}</span>
                  <div className="loto-swatches">
                    {LOTO_COLOR_ORDER.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`loto-swatch${myColors[k] === c ? ' on' : ''}`}
                        style={{ background: LOTO_COLORS[c].main }}
                        title={LOTO_COLORS[c].name}
                        aria-label={`Tờ ${k + 1} màu ${LOTO_COLORS[c].name}`}
                        aria-pressed={myColors[k] === c}
                        onClick={() => setSheetColor(k, c)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(poor.length > 0 || (potTotal > 0 && account && account.coins < stakeOf(meId))) && (
            <div className="lobby-warn small">
              {poor.length > 0 && <span>Không đủ xu: <b>{poor.map((p) => p.name).join(', ')}</b>. </span>}
              {account && account.coins < stakeOf(meId) && <span>Mở Hồ sơ để nhận 500 xu hằng ngày nhé.</span>}
            </div>
          )}

          {/* Danh sách ghế người chơi gọn */}
          <div className="lobby-seats">
            {view.players.map((p) => (
              <div key={p.id} className={`lobby-seat${p.connected ? '' : ' offline'}${p.id === meId ? ' me' : ''}`}>
                {isHost && p.id !== meId && (
                  <button
                    type="button"
                    className="seat-kick-btn"
                    onClick={() => emit('room:kick', { targetId: p.id })}
                    title={`Kích ${p.name}`}
                    aria-label={`Kích ${p.name}`}
                  >
                    <UserX size={12} />
                  </button>
                )}
                <PlayerAvatar id={p.id} avatar={p.avatar} size={46} />
                <div className="lobby-seat-info">
                  <span className="lobby-name">
                    {p.id === view.hostId && <Crown size={13} className="inline-icon host-crown" />}
                    {p.name}
                    {p.id === meId && <em className="me-tag">bạn</em>}
                  </span>
                  <span className={`small seat-readiness${p.connected && (p.id === view.hostId || p.ready) ? ' ready' : ''}`}>
                    {!p.connected
                      ? 'Mất kết nối'
                      : p.id === view.hostId
                        ? 'Chủ phòng'
                        : p.ready
                          ? 'Sẵn sàng'
                          : 'Chờ xác nhận'}
                    {p.coins !== undefined && (
                      <span className={`seat-coins${stakeOf(p.id) > 0 && p.coins < stakeOf(p.id) ? ' low' : ''}`}>
                        · {fmtCoins(p.coins)}
                      </span>
                    )}
                  </span>
                  {isThap && thapCfg.mode === 'teams' && (
                    <span className="thap-seat-team" style={{ borderColor: THAP_TEAM_COLORS[thapTeamOf(p.id)] }}>
                      <i style={{ background: THAP_TEAM_COLORS[thapTeamOf(p.id)] }} /> {THAP_TEAM_NAMES[thapTeamOf(p.id)]}
                    </span>
                  )}
                  {isBansung && (() => {
                    const heroId = bansungHeroOf(p.id);
                    const hero = getBansungHero(heroId);
                    return (
                      <span className="thap-seat-team" style={{ borderColor: hero.accentHex }}>
                        <span
                          className="hero-sprite-icon xs"
                          style={{ backgroundImage: `url("${BANSUNG_STATIC_ROOT}/normalized/heroes/hero_${heroId}_idle.png")` }}
                          aria-hidden="true"
                        />
                        {hero.name}
                      </span>
                    );
                  })()}
                  {isLoto && (
                    <span className="seat-loto">
                      🎫 {picks[p.id] ?? 1} tờ
                      {(view.loto?.colors?.[p.id] ?? []).slice(0, picks[p.id] ?? 1).map((c, k) => (
                        <i key={k} className="loto-dot" style={{ background: LOTO_COLORS[c]?.main }} title={LOTO_COLORS[c]?.name} />
                      ))}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {empty > 0 && (
              <div className="lobby-seat empty-summary">
                <UserPlus size={14} />
                <span className="muted small">Còn <b>{empty}</b> chỗ trống</span>
              </div>
            )}
          </div>

          <LobbySpectators view={view} meId={meId} emit={emit} />

          {/* Thiết lập chi tiết từng game: tất cả choice dùng select option + tóm tắt gọn */}
          <div className="lobby-rules">
            <div className="lobby-rules-head">
              <div className="lobby-rules-title">
                <h3>Thiết lập · {modeInfo.shortName}</h3>
                <span className="cfg-ver">v{view.rulesVersion}</span>
              </div>
              {isHost && gameMode === 'exploding_kittens' && (
                <button type="button" className="secondary small" onClick={() => setSettingsOpen(true)}>
                  <Settings2 size={14} /> Sửa luật
                </button>
              )}
              {isThap && (
                <button type="button" className="secondary small" onClick={() => setMiragineGuideOpen(true)}>
                  <BookOpen size={14} /> Bảng 16 Lính
                </button>
              )}
            </div>

            {gameMode === 'exploding_kittens' ? (
              <RoomRuleSummary rules={view.rules} playerCount={online} />
            ) : gameMode === 'ant_empire' ? (
              <>
                <div className="cfg-select-grid">
                  <SelectField
                    label="Đế chế máy (🤖)"
                    hint={`Tổng ${online + antsCfg.bots}/${ANTS_MAX_EMPIRES}`}
                    value={antsCfg.bots}
                    disabled={!isHost}
                    onChange={(v) => setAnts({ bots: Number(v) })}
                  >
                    {Array.from({ length: Math.max(0, ANTS_MAX_EMPIRES - view.players.length) + 1 }, (_, n) => (
                      <option key={n} value={n}>{n === 0 ? 'Không máy' : `${n} máy`}</option>
                    ))}
                  </SelectField>
                  <SelectField
                    label="Độ khó máy"
                    value={antsCfg.botLevel}
                    disabled={!isHost || antsCfg.bots === 0}
                    onChange={(v) => setAnts({ botLevel: v as 'easy' | 'normal' | 'hard' })}
                  >
                    <option value="easy">Dễ</option>
                    <option value="normal">Thường</option>
                    <option value="hard">Khó</option>
                  </SelectField>
                  <SelectField
                    label="Thời gian trận"
                    value={antsCfg.minutes}
                    disabled={!isHost}
                    onChange={(v) => setAnts({ minutes: Number(v) })}
                  >
                    {ANTS_MINUTE_OPTIONS.map((m) => (
                      <option key={m} value={m}>{m ? `${m} phút` : 'Không giới hạn'}</option>
                    ))}
                  </SelectField>
                </div>
                <div className="cfg-tags">
                  <span>Khởi đầu {ANTS_START_GOLD} vàng</span>
                  <span>10 loài kiến tự xuất quân</span>
                  <span>Phá Trụ Chính địch</span>
                </div>
                <details className="cfg-details">
                  <summary>Xem luật &amp; thu nhập mỗi phút</summary>
                  <ul className="rule-summary-list">
                    <li>Nhận vàng mỗi phút tăng dần ({antsIncome(1)}, {antsIncome(2)}, {antsIncome(3)}…).</li>
                    <li>Mỗi đế chế có 2 Trụ Phụ + 1 Trụ Chính tự bắn kiến địch mỗi 5 giây.</li>
                  </ul>
                </details>
              </>
            ) : isThap ? (
              <>
                <div className="cfg-select-grid">
                  <SelectField
                    label="Kiểu trận"
                    value={thapCfg.mode}
                    disabled={!isHost}
                    onChange={(v) => setThap({ mode: v as ThapMode })}
                  >
                    <option value="ffa">Hỗn chiến (FFA)</option>
                    <option value="teams">Lập đội (Đồng minh)</option>
                    <option value="coop">Co-op (Đánh máy)</option>
                  </SelectField>
                  <SelectField
                    label="Thành máy"
                    hint={`${thapTotal}/${THAP_MAX_PLAYERS}`}
                    value={thapBots}
                    disabled={!isHost}
                    onChange={(v) => setThap({ bots: Number(v) })}
                  >
                    {Array.from({ length: Math.max(0, THAP_MAX_PLAYERS - view.players.length) + 1 }, (_, n) => (
                      <option key={n} value={n}>{n === 0 ? 'Không máy' : `+${n} máy`}</option>
                    ))}
                  </SelectField>
                  <SelectField
                    label="Độ khó máy"
                    value={thapCfg.botLevel}
                    disabled={!isHost || thapBots === 0}
                    onChange={(v) => setThap({ botLevel: v as 'easy' | 'normal' | 'hard' })}
                  >
                    {(['easy', 'normal', 'hard'] as const).map((lv) => (
                      <option key={lv} value={lv}>{THAP_BOT_LABEL[lv]}</option>
                    ))}
                  </SelectField>
                  <SelectField
                    label="Thời gian"
                    value={thapCfg.minutes}
                    disabled={!isHost}
                    onChange={(v) => setThap({ minutes: Number(v) })}
                  >
                    {THAP_MINUTE_OPTIONS.map((m) => (
                      <option key={m} value={m}>{m ? `${m} phút` : 'Không giới hạn'}</option>
                    ))}
                  </SelectField>
                  {thapCfg.mode === 'teams' && (
                    <SelectField
                      label="Đội của bạn"
                      hint={
                        <span className="thap-seat-team" style={{ borderColor: THAP_TEAM_COLORS[thapTeamOf(meId)] }}>
                          <i style={{ background: THAP_TEAM_COLORS[thapTeamOf(meId)] }} />
                        </span>
                      }
                      value={thapTeamOf(meId)}
                      disabled={!me || spectating}
                      onChange={(v) => emit('thap:team', { team: Number(v) })}
                    >
                      {THAP_TEAM_NAMES.map((name, t) => (
                        <option key={t} value={t}>{name}</option>
                      ))}
                    </SelectField>
                  )}
                </div>

                {thapCfg.mode === 'teams' && thapBots > 0 && (
                  <div className="cfg-bot-teams small muted">
                    Máy vào:{' '}
                    {thapBotTeams.map((t, i) => (
                      <span key={i} className="thap-seat-team" style={{ borderColor: THAP_TEAM_COLORS[t] }}>
                        <i style={{ background: THAP_TEAM_COLORS[t] }} /> {THAP_TEAM_NAMES[t]}
                      </span>
                    ))}
                  </div>
                )}

                <div className="cfg-tags">
                  <span>16 binh chủng gốc</span>
                  <span>Lương hiệp mỗi {THAP_ROUND_S}s</span>
                  <span>Pha Lê {THAP_BASE.hp} HP · max {THAP_MAX_POP} quân</span>
                </div>

                <details className="cfg-details">
                  <summary>Xem cơ chế triệu hồi &amp; điều binh</summary>
                  <ul className="rule-summary-list">
                    <li>Khởi đầu {THAP_START_GOLD} vàng, lương hiệp {THAP_START_ROUND_INCOME} vàng (đợt đầu sau {THAP_FIRST_ROUND_S}s).</li>
                    <li>Chọn lính để Cổng tự xuất và cộng thêm Lương Hiệp; 3 lệnh: Tấn Công · Phòng Thủ · Tập Kết.</li>
                  </ul>
                </details>
              </>
            ) : gameMode === 'link_duel' ? (
              <>
                <div className="cfg-select-grid">
                  <SelectField
                    label="Thêm máy (🤖)"
                    hint={`Tổng ${online + linkBots}/${LINK_MAX_PLAYERS}`}
                    value={linkBots}
                    disabled={!isHost}
                    onChange={(v) => emit('link:config', { config: { ...linkCfg, bots: Number(v) } })}
                  >
                    {Array.from({ length: Math.max(0, LINK_MAX_PLAYERS - view.players.length) + 1 }, (_, n) => (
                      <option key={n} value={n}>{n === 0 ? 'Không máy' : `+${n} máy`}</option>
                    ))}
                  </SelectField>
                  <SelectField
                    label="Độ khó máy"
                    value={linkCfg.botLevel}
                    disabled={!isHost || linkBots === 0}
                    onChange={(v) => emit('link:config', { config: { ...linkCfg, botLevel: v as 'easy' | 'normal' | 'hard' } })}
                  >
                    {(['easy', 'normal', 'hard'] as const).map((lv) => (
                      <option key={lv} value={lv}>{LINK_BOT_LABEL[lv]}</option>
                    ))}
                  </SelectField>
                </div>
                <div className="cfg-tags">
                  <span>Màn 1 Đua nối ({LINK_STAGE1_S}s)</span>
                  <span>Liên hoàn {LINK_BOSSES.length} Boss</span>
                  <span>Phím R: Đảo bàn ({LINK_SHUFFLE_CD_S}s)</span>
                </div>
                <details className="cfg-details">
                  <summary>Xem danh sách {LINK_BOSSES.length} Boss &amp; chiêu thức</summary>
                  <ul className="rule-summary-list">
                    <li>Đầy Sấm ở Màn 1 tung Đóng Băng / Mây Mù ({LINK_FOG_MS / 1000}s); qua Boss tung ⚡ Siêu Đấm (+{LINK_KO_BONUS} khi kết liễu).</li>
                    <li>3 Boss đầu dùng chung {LINK_RAID_S / 60}p · Boss 4 Co-op ({LINK_COOP_RAID_S / 60}p) · Ma Vương ({LINK_FINAL_RAID_S / 60}p) · Cự Thần ({LINK_TITAN_RAID_S / 60}p, 2 bàn).</li>
                    {LINK_BOSSES.map((b, i) => (
                      <li key={b.id}>
                        {b.emoji} <b>{b.name}</b> ({linkBossMaxHp(i, online + linkBots)} HP): {[...new Set(b.skills)].map((k) => LINK_BOSS_SKILL_NAME[k]).join(' · ')}
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            ) : isLoto ? (
              <div className="cfg-tags">
                <span>Bảng 9×9 · 5 số/hàng</span>
                <span>Gọi số mỗi {LOTO_CALL_MS / 1000}s</span>
                <span>Đủ 5 số 1 hàng → KINH ăn hũ</span>
              </div>
            ) : isBansung ? (
              <>
                <div className="cfg-select-grid">
                  <SelectField
                    label="Chế độ"
                    value={bansungMode}
                    disabled={!isHost}
                    onChange={(v) => setBansung({ gameMode: v as BansungGameMode })}
                  >
                    {BANSUNG_GAME_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m === 'survival' ? 'Sinh Tồn' : '10 Đợt Cổ Điển'}
                      </option>
                    ))}
                  </SelectField>

                  <SelectField
                    label="Bản đồ"
                    value={bansungCfg.biome}
                    disabled={!isHost}
                    onChange={(v) => setBansung({ biome: v as BansungBiome })}
                  >
                    {BANSUNG_BIOMES.map((b) => (
                      <option key={b} value={b}>
                        {b === 'desert' ? '🏜️ Sa Mạc Cổ' : b === 'crypt' ? '🩸 Hầm Mộ Đỏ' : '🤖 Đấu Trường Cyber'}
                      </option>
                    ))}
                  </SelectField>

                  <SelectField
                    label="Độ khó"
                    value={bansungCfg.difficulty}
                    disabled={!isHost}
                    onChange={(v) => setBansung({ difficulty: v as BansungDifficulty })}
                  >
                    {BANSUNG_DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>
                        {d === 'normal' ? 'Thường' : d === 'hard' ? 'Khó' : 'Địa Ngục'}
                      </option>
                    ))}
                  </SelectField>

                  <SelectField
                    label="Bot AI"
                    hint={`${bansungTotal} người+bot`}
                    value={bansungBots}
                    disabled={!isHost}
                    onChange={(v) => setBansung({ bots: Number(v) })}
                  >
                    {Array.from({ length: bansungMaxBots + 1 }, (_, bots) => (
                      <option key={bots} value={bots}>
                        {bots === 0 ? 'Không bot' : `+${bots} Bot AI`}
                      </option>
                    ))}
                  </SelectField>

                  <SelectField
                    label="Trình độ Bot"
                    value={bansungCfg.botLevel}
                    disabled={!isHost || bansungBots === 0}
                    onChange={(v) => setBansung({ botLevel: v as BansungBotLevel })}
                  >
                    {BANSUNG_BOT_LEVELS.map((lv) => (
                      <option key={lv} value={lv}>
                        {lv === 'easy' ? 'Dễ' : lv === 'normal' ? 'Vừa' : 'Khó'}
                      </option>
                    ))}
                  </SelectField>

                  <SelectField
                    label="Hồi sinh"
                    value={bansungCfg.reviveMode}
                    disabled={!isHost}
                    onChange={(v) => setBansung({ reviveMode: v as BansungReviveMode })}
                  >
                    {BANSUNG_REVIVE_MODES.map((rv) => (
                      <option key={rv} value={rv}>
                        {rv === 'coop' ? 'Cứu Co-op' : rv === 'circle' ? 'Vòng Cứu' : rv === 'wave_only' ? 'Cuối Đợt' : 'Hardcore'}
                      </option>
                    ))}
                  </SelectField>

                  {bansungMode === 'waves' && (
                    <SelectField
                      label="Sau Đợt 10"
                      value={bansungCfg.endless ? '1' : '0'}
                      disabled={!isHost}
                      onChange={(v) => setBansung({ endless: v === '1' })}
                    >
                      <option value="0">Kết thúc thắng</option>
                      <option value="1">♾️ Vô Tận</option>
                    </SelectField>
                  )}
                </div>

                {/* Bộ chọn nhân vật Bắn Súng nhỏ gọn */}
                <div className="bansung-hero-pick">
                  <div className="cfg-label">
                    <span>Nhân vật của bạn</span>
                    <span className="cfg-hint">{!me || spectating ? 'Đang xem' : getBansungHero(myBansungHero).name}</span>
                  </div>
                  <div className="bansung-hero-grid">
                    {BANSUNG_HERO_IDS.map((heroId) => {
                      const hero = getBansungHero(heroId);
                      const active = myBansungHero === heroId;
                      return (
                        <button
                          key={heroId}
                          type="button"
                          className={`hero-pick-btn${active ? ' on' : ''}`}
                          disabled={!me || spectating}
                          onClick={() => pickBansungHero(heroId)}
                          style={{ borderColor: active ? hero.accentHex : undefined }}
                        >
                          <span
                            className="hero-sprite-icon sm"
                            style={{ backgroundImage: `url("${BANSUNG_STATIC_ROOT}/normalized/heroes/hero_${heroId}_idle.png")` }}
                            aria-hidden="true"
                          />
                          <span>
                            <strong>{hero.name}</strong>
                            <small>HP {hero.hp * BANSUNG_HERO_STAT_SCALE} · SH {hero.shield * BANSUNG_HERO_STAT_SCALE} · NL {hero.energy}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="cfg-tags">
                  <span>WASD di chuyển</span>
                  <span>Chuột ngắm bắn · R nạp</span>
                  <span>Space lướt · Q chiêu</span>
                  <span>Gacha 3 thẻ khi lên cấp</span>
                </div>

                <details className="cfg-details">
                  <summary>Chi tiết chế độ &amp; phím tắt</summary>
                  <ul className="rule-summary-list">
                    {bansungMode === 'survival' ? (
                      <li>Sinh Tồn bản đồ rộng 132×84: farm XP rớt từ quái, mở Gacha nâng cấp &amp; tiến hóa vũ khí (Mk.I → Mk.IV).</li>
                    ) : (
                      <li>10 đợt &amp; Boss (Mini-Boss Đợt 4, nhiệm vụ Đợt 5–7, Boss Đợt 10); chọn Perk sau đợt 2, 4, 6, 8.</li>
                    )}
                    <li>Phím 1–5 đổi súng · E nhặt đồ · đứng vào vòng sáng để cứu đồng đội ngã gục.</li>
                  </ul>
                </details>
              </>
            ) : gameMode === 'blackjack_21' ? (
              <div className="cfg-tags">
                <span>Chủ phòng làm Nhà Cái</span>
                <span>Nhà con ≥ 16đ · Cái ≥ 15đ</span>
                <span>Xì Bàng ×3 · Xì Dách / Ngũ Linh ×2</span>
              </div>
            ) : (
              <div className="cfg-tags">
                <span>2–4 người · 13 lá/người</span>
                <span>3♠ đi trước ván đầu</span>
                <span>Tứ Quý &amp; Đôi Thông chặt Heo</span>
              </div>
            )}

            {awaitingReady.length > 0 && (
              <p className="muted small" role="status">
                Chờ xác nhận: <b>{awaitingReady.map((player) => player.name).join(', ')}</b>
              </p>
            )}
          </div>

          <div className="lobby-actions">
            <button className="ghost" onClick={() => emit('room:leave')}>
              <LogOut size={16} /> Rời phòng
            </button>
            {isHost ? (
              <button className="primary big" disabled={!canStart} onClick={() => emit('game:start')}>
                {online < modeInfo.minPlayers ? (
                  `Cần ít nhất ${modeInfo.minPlayers} người`
                ) : !deckOk ? (
                  isThap ? thapProblem : isBansung ? bansungProblem : gameMode === 'ant_empire' ? 'Cần ≥ 2 đế chế' : gameMode === 'link_duel' ? `Cần 1–${LINK_MAX_PLAYERS} người` : 'Luật chưa hợp lệ'
                ) : poor.length > 0 ? (
                  'Có người thiếu xu'
                ) : awaitingReady.length > 0 ? (
                  'Chờ mọi người sẵn sàng'
                ) : (
                  <>
                    <Play size={18} /> Bắt đầu {modeInfo.shortName}
                  </>
                )}
              </button>
            ) : spectating ? (
              <span className="muted small">Đang xem · bấm “Vào bàn chơi” ở trên nếu còn ghế.</span>
            ) : (
              <button className={me?.ready ? 'secondary big' : 'primary big'} onClick={() => emit('room:ready', { ready: !me?.ready, rulesVersion: view.rulesVersion })}>
                {me?.ready ? (
                  <>
                    <Check size={16} /> Đã sẵn sàng · Hủy
                  </>
                ) : (
                  'Đồng ý luật & Sẵn sàng'
                )}
              </button>
            )}
          </div>
        </div>

        <div className="lobby-chat">
          <ChatPanel
            messages={chat.messages}
            meId={meId}
            typingNames={typingNames}
            onSend={chat.send}
            onTyping={chat.onTyping}
            tab="chat"
            onTab={() => {}}
            unread={unread}
          />
        </div>
      </div>

      {settingsOpen && isHost && gameMode === 'exploding_kittens' && (
        <RoomSettings
          initialRules={view.rules}
          title="Chỉnh luật của phòng"
          confirmLabel="Lưu luật & yêu cầu xác nhận lại"
          minPlayers={Math.max(MIN_PLAYERS, view.players.length)}
          onClose={() => setSettingsOpen(false)}
          onConfirm={async (rules) => {
            if (onSaveRules) await onSaveRules(rules);
            else emit('room:rules', { rules });
            setSettingsOpen(false);
          }}
        />
      )}

      {miragineGuideOpen && (
        <Modal title="Miragine War – Bảng 16 Binh Chủng Nguyên Bản" onClose={() => setMiragineGuideOpen(false)} width={760}>
          <div className="miragine-menu-modal">
            <div className="miragine-menu-hero">
              <img src="/database-miraginewar/ui/title_bg.jpg" alt="Miragine War" className="miragine-title-img" />
            </div>
            <img src="/database-miraginewar/ui/tutorial_bg.jpg" alt="Miragine War Unit Guide" className="miragine-tutorial-img" />
          </div>
        </Modal>
      )}
    </div>
  );
}
