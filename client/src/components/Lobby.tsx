import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
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
  roomDeckSummary,
  THAP_BOT_LABEL,
  THAP_COLORS,
  THAP_MAX_PLAYERS,
  THAP_MINUTE_OPTIONS,
  THAP_MODE_LABEL,
  THAP_ROUND_S,
  THAP_START_GOLD,
  THAP_START_ROUND_INCOME,
  getBansungHero,
  linkBossMaxHp,
  lotoDefaultColors,
  normalizeBansungHero,
  resolveBansungGameMode,
  type ThapConfig,
  assignTwTeams,
  DEFAULT_TW_CONFIG,
  defaultTwLoadoutForFaction,
  findTwGuanxiBond,
  normalizeTwFaction,
  normalizeTwLoadout,
  normalizeTwTeam,
  twAllowedUnitsForGeneral,
  twLoadoutCost,
  TW_BATTLE_FUNDS,
  TW_BOT_NAMES,
  TW_CLASSES,
  TW_DURATION_OPTIONS,
  TW_FACTIONS,
  TW_FACTION_IDS,
  TW_FORMATION_IDS,
  TW_FORMATIONS,
  TW_GENERALS,
  TW_GENERAL_CLASSES,
  TW_GENERAL_IDS,
  TW_MAPS,
  TW_MAP_IDS,
  TW_MAX_PLAYERS,
  TW_MODE_LABEL,
  TW_TEAM_COLORS,
  TW_TEAM_NAMES,
  TW_UNITS,
  type TwArmyLoadout,
  type TwArmyScale,
  type TwBotDifficulty,
  type TwConfig,
  type TwFactionId,
  type TwGeneralClass,
  type TwGeneralId,
  type TwGuanxiBond,
  type TwMapId,
  type TwMode,
  type TwUnitCategory,
  type TwUnitKind,
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
import MiragineTitleScreen from './thap/MiragineTitleScreen';
import MiragineTutorialModal from './thap/MiragineTutorialModal';
import '../thap/thap.css';
import { startTwBgm, stopTwBgm } from '../tw/sound';
import '../tw/tw.css';

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

/** Khớp 100% thứ tự thế lực mặc định theo ghế ở server (`Game.DEFAULT_TW_SEAT_FACTIONS`) */
const TW_SEAT_FACTIONS: readonly TwFactionId[] = ['jin', 'yuan', 'wei', 'shu', 'wu', 'lubu'];

const TW_FACTION_BOT_NAME: Record<TwFactionId, string> = {
  wei: '🤖 Tào Mạnh Đức',
  shu: '🤖 Lưu Huyền Đức',
  wu: '🤖 Tôn Văn Đài',
  yuan: '🤖 Viên Bản Sơ',
  lubu: '🤖 Lữ Phụng Tiên',
  jin: '🤖 Tư Mã Tương An',
};

const TW_COALITION_LABELS: readonly [string, string] = [
  'Liên Minh Quan Đông',
  'Triều Đình / Bắc Phạt',
];

const TW_COALITION_SHORT: readonly [string, string] = [
  'Quan Đông',
  'Triều Đình',
];

const TW_BOT_DIFFICULTY_LABELS: Record<TwBotDifficulty, string> = {
  easy: 'Tân Thủ',
  normal: 'Chiến Tướng',
  hard: 'Thừa Tướng',
};

const TW_MAP_LOBBY_INFO: Record<TwMapId, { chipLabel: string; seasonLabel: string; terrainHighlights: string }> = {
  pingyuan: {
    chipLabel: '🌾 Trận Bình Nguyên · Thu 196',
    seasonLabel: 'Thu 196',
    terrainHighlights: 'Đồng bằng mùa thu rộng mở ở trung tâm, Rừng Thông Tây Bắc giấu phục binh & Đồi Cao Đông Bắc khống chế tầm pháo đá',
  },
  guandu: {
    chipLabel: '🏯 Chiến Dịch Quan Độ · Thu 200',
    seasonLabel: 'Thu 200',
    terrainHighlights: 'Bến cạn Hoàng Hà phía Bắc, Rừng kho lương Ô Sào, Lũy đất phòng ngự phía Tây & bãi bồi đầm lầy trung lộ',
  },
  changban: {
    chipLabel: '⛰️ Dốc Trường Bản · Hạ 208',
    seasonLabel: 'Hạ 208',
    terrainHighlights: 'Triền dốc Đương Dương hiểm trở, hai cánh Rừng Trúc phục kích sát sườn & dòng sông chặn ngang cầu rút quân',
  },
  chibi: {
    chipLabel: '🔥 Đại Chiến Xích Bích · Đông 208',
    seasonLabel: 'Đông 208',
    terrainHighlights: 'Bờ Trường Giang rực lửa mùa đông, Đài cầu gió Nam Bình Sơn, Rừng sâu & Đầm lầy Hoa Dung Đạo lầy lội',
  },
};

const TW_CLASS_ELEMENT_ICON: Record<TwGeneralClass, string> = {
  vanguard: '/database-total-war/ui/el_fire.png',
  champion: '/database-total-war/ui/el_wood.png',
  sentinel: '/database-total-war/ui/el_metal.png',
  commander: '/database-total-war/ui/el_earth.png',
  strategist: '/database-total-war/ui/el_water.png',
};

const TW_UNIT_CAT_META: Record<TwUnitCategory, { vn: string; glyph: string }> = {
  infantry_polearm: { vn: 'Trường Thương', glyph: '🔱' },
  infantry_sword: { vn: 'Đao Khiên', glyph: '🗡️' },
  ranged_bow: { vn: 'Cung Thủ', glyph: '🏹' },
  ranged_crossbow: { vn: 'Nỏ Binh', glyph: '🎯' },
  artillery: { vn: 'Pháo Đá', glyph: '☄️' },
  cavalry_shock: { vn: 'Xung Kỵ', glyph: '🐎' },
  cavalry_melee: { vn: 'Chiến Kỵ', glyph: '🛡️' },
};

function twBondGlyph(bond: TwGuanxiBond): string {
  if (bond.vnTitle.includes('Giang Đông') || bond.vnTitle.includes('Xích Bích')) return '🔥';
  if (bond.kind === 'rival') return '⚡';
  return '🤝';
}

function collectGuanxiSynergies(
  generals: readonly [TwGeneralId, TwGeneralId, TwGeneralId],
): Array<{ key: string; bond: TwGuanxiBond; pairLabel: string; glyph: string }> {
  const pairs: Array<[TwGeneralId, TwGeneralId]> = [
    [generals[0], generals[1]],
    [generals[0], generals[2]],
    [generals[1], generals[2]],
  ];
  const out: Array<{ key: string; bond: TwGuanxiBond; pairLabel: string; glyph: string }> = [];
  for (const [a, b] of pairs) {
    const bond = findTwGuanxiBond(a, b);
    if (!bond) continue;
    out.push({
      key: `${a}_${b}`,
      bond,
      pairLabel: `${TW_GENERALS[a].vnName} · ${TW_GENERALS[b].vnName}`,
      glyph: twBondGlyph(bond),
    });
  }
  return out;
}

function makeTwUnitFallbackSvg(glyph: string): string {
  const safe = encodeURIComponent(glyph);
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="88" viewBox="0 0 64 88"><rect width="64" height="88" fill="%23dfd3b7"/><text x="32" y="50" text-anchor="middle" font-size="24">${safe}</text></svg>`;
}

export default function Lobby({ view, meId, emit, chat = NO_CHAT, account, onSaveRules }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [miragineGuideOpen, setMiragineGuideOpen] = useState(false);
  const [twGuideOpen, setTwGuideOpen] = useState(false);
  const [twBuilderOpen, setTwBuilderOpen] = useState(true);
  const [twOpenGenSlot, setTwOpenGenSlot] = useState<0 | 1 | 2 | null>(null);
  const [twPickingUnit, setTwPickingUnit] = useState<{ genSlot: 0 | 1 | 2; unitIdx: 0 | 1 | 2 | 3 } | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const { typingNames, unread } = useChatState(chat, roomPeople(view), meId, true);
  const isHost = view.hostId === meId;
  const gameMode: GameMode = view.gameMode ?? 'exploding_kittens';
  const autoTwDeployDoneRef = useRef(false);
  useEffect(() => {
    if (gameMode !== 'total_war') {
      autoTwDeployDoneRef.current = false;
      return;
    }
    if (
      !autoTwDeployDoneRef.current &&
      isHost &&
      view.players.length === 1 &&
      view.tw?.config.deploymentPhase === undefined
    ) {
      autoTwDeployDoneRef.current = true;
      emit('tw:config', {
        config: { ...(view.tw?.config ?? DEFAULT_TW_CONFIG), deploymentPhase: true },
      });
    }
  }, [isHost, gameMode, view.players.length, view.tw?.config, emit]);
  useEffect(() => {
    if (gameMode === 'thap_hung') {
      stopBansungBgm();
      stopTwBgm();
      startMiragineBgm('menu');
      return () => stopMiragineBgm();
    }
    if (gameMode === 'bansung') {
      stopMiragineBgm();
      stopTwBgm();
      void initBansungAudio().catch(() => {});
      syncBansungMute();
      setBansungBgm('menu');
      return () => stopBansungBgm();
    }
    if (gameMode === 'total_war') {
      stopMiragineBgm();
      stopBansungBgm();
      startTwBgm('menu');
      return () => stopTwBgm();
    }
    stopMiragineBgm();
    stopBansungBgm();
    stopTwBgm();
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

  // Miragine War cổ điển: 1 người -> 1P vs AI, 2 người -> 1v1 PvP
  const isThap = gameMode === 'thap_hung';
  const thapBots = view.players.length >= 2 ? 0 : 1;
  const thapRawCfg = view.thap?.config ?? DEFAULT_THAP_CONFIG;
  const thapMinutes = (THAP_MINUTE_OPTIONS as readonly number[]).includes(thapRawCfg.minutes)
    ? thapRawCfg.minutes
    : DEFAULT_THAP_CONFIG.minutes;
  const thapCfg: ThapConfig = {
    ...thapRawCfg,
    bots: thapBots,
    mode: thapBots === 0 ? 'pvp' : 'solo',
    minutes: thapMinutes,
  };
  const thapProblem = online > THAP_MAX_PLAYERS ? `Tối đa ${THAP_MAX_PLAYERS} người chơi` : '';
  const setThap = (patch: Partial<ThapConfig>) => emit('thap:config', { config: { ...thapCfg, ...patch } });

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

  // Tam Quốc Toàn Chiến: khớp 100% thế lực, liên minh và phân bổ máy AI như server (`Game.twView` / `Game.startTw`)
  const isTw = gameMode === 'total_war';
  const twCfg = view.tw?.config ?? DEFAULT_TW_CONFIG;
  const twBotDiff: TwBotDifficulty = twCfg.botDifficulty ?? 'normal';
  const twBots = Math.max(0, Math.min(TW_MAX_PLAYERS - online, twCfg.bots));
  const twFactionOf = (id: string, seatIdx = 0): TwFactionId => {
    const picked = view.tw?.factions?.[id];
    if (picked && (TW_FACTION_IDS as readonly string[]).includes(picked)) return normalizeTwFaction(picked, seatIdx);
    const resolvedIdx = seatIdx >= 0 ? seatIdx : Math.max(0, view.players.findIndex((p) => p.id === id));
    return TW_SEAT_FACTIONS[resolvedIdx % TW_SEAT_FACTIONS.length];
  };
  const twTeamOf = (id: string) =>
    normalizeTwTeam(view.tw?.teams?.[id] ?? Math.max(0, view.players.findIndex((p) => p.id === id)) % 2) % 2;
  const twHumans = view.players.filter((p) => p.connected);
  const twHumanTeams = twHumans.map((p) => twTeamOf(p.id));
  const twAssign = assignTwTeams(twHumanTeams, twBots, twCfg.mode);
  const twBotTeams = twAssign.slice(twHumans.length);
  const twTotal = online + twBots;
  const twProblem =
    twTotal < 2 ? 'Cần ít nhất 2 Chư Hầu – thêm Máy AI nhé'
      : twTotal > TW_MAX_PLAYERS ? 'Tối đa 8 Chư Hầu'
      : (twCfg.mode === 'historical_2teams' && twBots === 0 && new Set(twHumanTeams).size < 2) ||
        new Set(twAssign).size < 2
        ? 'Cần ít nhất 2 Liên Minh đối địch – đổi Liên Minh hoặc thêm Máy AI'
      : '';
  const setTw = (patch: Partial<TwConfig>) =>
    emit('tw:config', { config: { ...twCfg, ...patch } });
  const twBotPreviews = (() => {
    if (!isTw || twBots <= 0) return [];
    const usedFactions = new Set<TwFactionId>(
      view.players.slice(0, TW_MAX_PLAYERS).map((p, idx) => twFactionOf(p.id, idx)),
    );
    const usedBotNames = new Set<string>();
    const botRotation: TwFactionId[] = ['yuan', ...TW_FACTION_IDS.filter((f) => f !== 'yuan')];
    return Array.from({ length: twBots }, (_, b) => {
      const seatIdx = view.players.length + b;
      const faction = botRotation.find((f) => !usedFactions.has(f)) ?? TW_FACTION_IDS[seatIdx % TW_FACTION_IDS.length];
      usedFactions.add(faction);
      const preferredName = TW_FACTION_BOT_NAME[faction];
      const botName = !usedBotNames.has(preferredName)
        ? preferredName
        : TW_BOT_NAMES.find((n) => !usedBotNames.has(n)) ?? TW_BOT_NAMES[b % TW_BOT_NAMES.length];
      usedBotNames.add(botName);
      const team = twBotTeams[b] ?? (seatIdx % 2);
      return { faction, botName, team };
    });
  })();
  const deckOk =
    gameMode === 'exploding_kittens' ? deck.canStart
      : isThap ? !thapProblem
      : isBansung ? !bansungProblem
      : isTw ? !twProblem
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
            {view.players.map((p, seatIdx) => (
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
                  {isThap && (
                    <span
                      className="thap-seat-team"
                      style={{ borderColor: THAP_COLORS[seatIdx === 0 ? 0 : 1] }}
                    >
                      <i style={{ background: THAP_COLORS[seatIdx === 0 ? 0 : 1] }} />{' '}
                      {seatIdx === 0 ? 'Phe Đỏ (Trái)' : 'Phe Xanh (Phải)'}
                    </span>
                  )}
                  {isTw && (() => {
                    const fSpec = TW_FACTIONS[twFactionOf(p.id, seatIdx)];
                    const tIdx = twTeamOf(p.id);
                    return (
                      <>
                        <span
                          className="thap-seat-team"
                          style={{ borderColor: fSpec.color }}
                          title={`Thế lực 【${fSpec.emblemText}】 ${fSpec.vnName} · Chủ tướng ${fSpec.leaderName}`}
                        >
                          <i style={{ background: fSpec.color }} /> {fSpec.emblemText} {fSpec.vnName}
                        </span>
                        {twCfg.mode === 'historical_2teams' && (
                          <span
                            className="thap-seat-team"
                            style={{ borderColor: TW_TEAM_COLORS[tIdx] }}
                            title={`${TW_COALITION_LABELS[tIdx]} (${TW_TEAM_NAMES[tIdx]})`}
                          >
                            <i style={{ background: TW_TEAM_COLORS[tIdx] }} /> {TW_COALITION_SHORT[tIdx]}
                          </span>
                        )}
                      </>
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
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '4 / 3',
                    minHeight: 430,
                    borderRadius: 14,
                    overflow: 'hidden',
                  }}
                >
                  <MiragineTitleScreen
                    config={thapCfg}
                    isHost={isHost}
                    players={view.players}
                    canStart={canStart}
                    onChangeConfig={(patch) => setThap(patch)}
                    onStart={() => emit('game:start')}
                    onOpenTutorial={() => setMiragineGuideOpen(true)}
                    onLeave={() => emit('room:leave')}
                  />
                </div>
                <p className="muted small" style={{ margin: 0 }}>
                  {view.players.length >= 2 ? (
                    <>
                      ⚔️ <b>{THAP_MODE_LABEL.pvp}:</b> Ghế 1 (<b>Phe Đỏ</b>, trái) vs Ghế 2 (<b>Phe Xanh</b>, phải) ·{' '}
                      {thapCfg.minutes > 0 ? `${thapCfg.minutes} phút` : 'Đánh tới khi vỡ Pha Lê Chính'}.
                    </>
                  ) : (
                    <>
                      🤖 <b>{THAP_MODE_LABEL.solo}:</b> Bạn (<b>Phe Đỏ</b>, trái) vs{' '}
                      <b>AI ({THAP_BOT_LABEL[thapCfg.botLevel]})</b> (<b>Phe Xanh</b>, phải) · có thể bấm Bắt đầu ngay hoặc mời thêm 1 bạn để đấu 1v1 PvP.
                    </>
                  )}
                </p>
              </>
            ) : isTw ? (
              <>
                <div className="tw-lobby-hero" style={{ borderColor: 'rgba(212, 175, 55, 0.55)' }}>
                  <img
                    src="/database-total-war/ui/title_bg.jpg"
                    alt="Tam Quốc Toàn Chiến – Total War: Three Kingdoms"
                    className="miragine-lobby-banner"
                  />
                  <div className="tw-lobby-overlay">
                    <div>
                      <b>🐉 Tam Quốc Toàn Chiến – Total War: Three Kingdoms (1–8 Chư Hầu)</b>
                      <p className="small" style={{ color: '#d6cbb5', marginTop: 2 }}>
                        Chiến trường Thủy Mặc 2.5D · Phục kích Rừng Thông · Quỹ đạo Mưa Tên Đỏ cong vút · Thương Lâm phản xung kích Kỵ Binh &amp; Đơn Đấu Võ Tướng 1v1
                      </p>
                    </div>
                    <button type="button" className="secondary small" onClick={() => setTwGuideOpen(true)}>
                      📜 Cẩm Nang 6 Thế Lực &amp; Ngũ Hành
                    </button>
                  </div>
                </div>
                <div className="ants-lobby-cfg">
                  <div>
                    <span className="muted small">Chiến trường lịch sử (3200 × 2200)</span>
                    <div className="bet-chips">
                      {TW_MAP_IDS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          className={`bet-chip${m === twCfg.mapId ? ' on' : ''}`}
                          disabled={!isHost}
                          onClick={() => setTw({ mapId: m })}
                        >
                          {TW_MAP_LOBBY_INFO[m].chipLabel}
                        </button>
                      ))}
                    </div>
                    <p className="muted small">
                      <b>{TW_MAPS[twCfg.mapId].vnName}</b> ({TW_MAP_LOBBY_INFO[twCfg.mapId].seasonLabel} · {TW_MAPS[twCfg.mapId].enName}): {TW_MAP_LOBBY_INFO[twCfg.mapId].terrainHighlights} · Đài Hiệu Lệnh: <b>{TW_MAPS[twCfg.mapId].capturePoints.map((c) => c.name).join(' · ')}</b>.
                    </p>
                  </div>
                  <div>
                    <span className="muted small">Thế cục chiến trường</span>
                    <div className="bet-chips">
                      {([
                        ['historical_2teams', '⚔️ Lịch Sử 2 Liên Minh'],
                        ['ffa', '🔥 Quần Hùng Hỗn Chiến'],
                      ] as [TwMode, string][]).map(([m, label]) => (
                        <button
                          key={m}
                          type="button"
                          className={`bet-chip${m === twCfg.mode ? ' on' : ''}`}
                          disabled={!isHost}
                          title={TW_MODE_LABEL[m]}
                          onClick={() => setTw({ mode: m })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="muted small">Quy mô đại quân</span>
                    <div className="bet-chips">
                      {([
                        ['normal', 'Chuẩn (Normal)'],
                        ['grand', 'Đại Quân (Grand · ~1.500 quân/phe)'],
                      ] as [TwArmyScale, string][]).map(([sc, label]) => (
                        <button
                          key={sc}
                          type="button"
                          className={`bet-chip${sc === twCfg.armyScale ? ' on' : ''}`}
                          disabled={!isHost}
                          onClick={() => setTw({ armyScale: sc })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="muted small">Chế độ Diễn Nghĩa</span>
                    <div className="bet-chips">
                      {([
                        [true, '⚡ Diễn Nghĩa (Đơn Đấu Võ Tướng 1v1 & Tuyệt Kỹ Ngũ Hành)'],
                        [false, '📜 Chính Sử (Cân Bằng Thực Chiến)'],
                      ] as [boolean, string][]).map(([rm, label]) => (
                        <button
                          key={String(rm)}
                          type="button"
                          className={`bet-chip${rm === twCfg.romanceMode ? ' on' : ''}`}
                          disabled={!isHost}
                          onClick={() => setTw({ romanceMode: rm })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="muted small">Chư hầu Máy AI (🤖) · tổng {twTotal}/{TW_MAX_PLAYERS} Chư Hầu</span>
                    <div className="bet-chips">
                      {Array.from({ length: Math.max(0, TW_MAX_PLAYERS - view.players.length) + 1 }, (_, n) => n).map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`bet-chip${n === twBots ? ' on' : ''}`}
                          disabled={!isHost}
                          onClick={() => setTw({ bots: n })}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="muted small">Độ khó AI</span>
                    <div className="bet-chips">
                      {(['easy', 'normal', 'hard'] as const).map((lv) => (
                        <button
                          key={lv}
                          type="button"
                          className={`bet-chip${lv === twBotDiff ? ' on' : ''}`}
                          disabled={!isHost || twBots === 0}
                          onClick={() => setTw({ botDifficulty: lv })}
                        >
                          {TW_BOT_DIFFICULTY_LABELS[lv]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="muted small">Thời lượng trận</span>
                    <div className="bet-chips">
                      {TW_DURATION_OPTIONS.map((d) => (
                        <button
                          key={d}
                          type="button"
                          className={`bet-chip${d === twCfg.durationMin ? ' on' : ''}`}
                          disabled={!isHost}
                          onClick={() => setTw({ durationMin: d })}
                        >
                          {d} phút
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="muted small">Pha Bố Trận Khai Chiến</span>
                    <div className="bet-chips">
                      {([
                        [true, '🛡️ Bố Trận & Đặt Bẫy 25s'],
                        [false, '⚡ Khai Chiến Ngay'],
                      ] as [boolean, string][]).map(([dp, label]) => (
                        <button
                          key={String(dp)}
                          type="button"
                          className={`bet-chip${Boolean(twCfg.deploymentPhase) === dp ? ' on' : ''}`}
                          disabled={!isHost}
                          onClick={() => setTw({ deploymentPhase: dp })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {!spectating && me && (() => {
                    const mySeatIdx = Math.max(0, view.players.findIndex((p) => p.id === meId));
                    const myFaction = twFactionOf(meId, mySeatIdx);
                    const histDefaultLoadout = defaultTwLoadoutForFaction(myFaction);
                    const rawLoadout = view.tw?.loadouts?.[meId];
                    const myLoadout: TwArmyLoadout = rawLoadout
                      ? normalizeTwLoadout(rawLoadout, myFaction)
                      : histDefaultLoadout;
                    const totalCost = twLoadoutCost(myLoadout);
                    const budgetPct = Math.min(100, Math.round((totalCost / TW_BATTLE_FUNDS) * 100));
                    const isHistDefault =
                      JSON.stringify(myLoadout) === JSON.stringify(histDefaultLoadout);
                    const synergies = collectGuanxiSynergies(myLoadout.generals);

                    const handleResetHistoricalLoadout = () => {
                      setTwOpenGenSlot(null);
                      setTwPickingUnit(null);
                      emit('tw:loadout', { loadout: histDefaultLoadout });
                    };

                    const handleSwapGeneral = (genSlot: 0 | 1 | 2, nextGenId: TwGeneralId) => {
                      if (myLoadout.generals[genSlot] === nextGenId) {
                        setTwOpenGenSlot(null);
                        return;
                      }
                      const prevGenId = myLoadout.generals[genSlot];
                      const nextGenerals = [...myLoadout.generals] as [
                        TwGeneralId,
                        TwGeneralId,
                        TwGeneralId,
                      ];
                      nextGenerals[genSlot] = nextGenId;

                      const nextRetinues = myLoadout.retinues.map((r) => [
                        ...r,
                      ]) as TwArmyLoadout['retinues'];
                      const prevDef = TW_GENERALS[prevGenId].defaultRetinue;
                      const curRet = myLoadout.retinues[genSlot];
                      if (curRet.every((u, idx) => u === prevDef[idx])) {
                        nextRetinues[genSlot] = [...TW_GENERALS[nextGenId].defaultRetinue];
                      }

                      const normalized = normalizeTwLoadout(
                        { generals: nextGenerals, retinues: nextRetinues },
                        myFaction,
                      );
                      setTwOpenGenSlot(null);
                      if (twPickingUnit?.genSlot === genSlot) {
                        setTwPickingUnit(null);
                      }
                      emit('tw:loadout', { loadout: normalized });
                    };

                    const handlePickRetinueUnit = (
                      genSlot: 0 | 1 | 2,
                      unitIdx: 0 | 1 | 2 | 3,
                      nextKind: TwUnitKind,
                    ) => {
                      const curKind = myLoadout.retinues[genSlot][unitIdx];
                      const projected =
                        totalCost - TW_UNITS[curKind].cost + TW_UNITS[nextKind].cost;
                      if (projected > TW_BATTLE_FUNDS) return;
                      const nextRetinues = myLoadout.retinues.map((r) => [
                        ...r,
                      ]) as TwArmyLoadout['retinues'];
                      nextRetinues[genSlot][unitIdx] = nextKind;
                      const normalized = normalizeTwLoadout(
                        {
                          generals: [...myLoadout.generals] as [
                            TwGeneralId,
                            TwGeneralId,
                            TwGeneralId,
                          ],
                          retinues: nextRetinues,
                        },
                        myFaction,
                      );
                      setTwPickingUnit(null);
                      emit('tw:loadout', { loadout: normalized });
                    };

                    return (
                      <>
                        <div>
                          <span className="muted small">Chọn Thế Lực Chư Hầu của bạn · 3 Danh Tướng &amp; 12 trung đoàn bộ tùy</span>
                          <div className="tw-guide-grid">
                            {TW_SEAT_FACTIONS.map((fid) => {
                              const f = TW_FACTIONS[fid];
                              const leadGen = TW_GENERALS[f.defaultGenerals[0]];
                              const active = myFaction === fid;
                              return (
                                <button
                                  key={fid}
                                  type="button"
                                  className={`mode-card${active ? ' on' : ''}`}
                                  style={active ? { borderColor: f.color } : undefined}
                                  onClick={() => {
                                    setTwOpenGenSlot(null);
                                    setTwPickingUnit(null);
                                    emit('tw:faction', { faction: fid });
                                  }}
                                >
                                  <div className="mode-card-head">
                                    <img
                                      src={leadGen.tokenPortrait}
                                      alt={leadGen.vnName}
                                      width={38}
                                      height={38}
                                      style={{
                                        width: 38,
                                        height: 38,
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                        border: `2px solid ${f.color}`,
                                        flexShrink: 0,
                                      }}
                                    />
                                    <span
                                      style={{
                                        display: 'inline-grid',
                                        placeItems: 'center',
                                        width: 24,
                                        height: 24,
                                        borderRadius: 5,
                                        background: f.color,
                                        color: fid === 'yuan' ? '#181a20' : '#ffffff',
                                        fontWeight: 800,
                                        fontSize: 13,
                                        flexShrink: 0,
                                      }}
                                    >
                                      {f.emblemText}
                                    </span>
                                    <div style={{ minWidth: 0 }}>
                                      <b>{f.vnName}</b>
                                      <div className="muted small">{f.leaderName}</div>
                                    </div>
                                  </div>
                                  <div className="small">
                                    <b>Danh tướng:</b>{' '}
                                    {f.defaultGenerals
                                      .map((g) => `${TW_GENERALS[g].vnName} (${TW_CLASSES[TW_GENERALS[g].class].element})`)
                                      .join(' · ')}
                                  </div>
                                  <small className="muted">{f.bonusDesc}</small>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Bảng Chiêu Mộ Danh Tướng & Bộ Tùy (Custom Army Builder TW3K) */}
                        <div className="tw-army-builder">
                          <div className="tw-ab-head">
                            <div className="tw-ab-title-wrap">
                              <b>⚔️ Chiêu Mộ Danh Tướng &amp; Bộ Tùy</b>
                              <span className={`tw-ab-funds${budgetPct >= 95 ? ' tight' : ''}`}>
                                Ngân Quỹ Chiến Trận: <b>{totalCost.toLocaleString('vi-VN')}</b> /{' '}
                                {TW_BATTLE_FUNDS.toLocaleString('vi-VN')} Lượng
                              </span>
                            </div>
                            <div className="tw-ab-actions">
                              <button
                                type="button"
                                className={`bet-chip${isHistDefault ? ' on' : ''}`}
                                onClick={handleResetHistoricalLoadout}
                                title="Đặt lại 3 Danh Tướng & 12 trung đoàn lịch sử mặc định của Thế lực"
                              >
                                📜 Đội Hình Lịch Sử
                              </button>
                              <button
                                type="button"
                                className={`bet-chip${twBuilderOpen ? ' on' : ''}`}
                                onClick={() => setTwBuilderOpen((v) => !v)}
                                aria-expanded={twBuilderOpen}
                              >
                                🛠️ Tự Chọn Tướng &amp; Quân {twBuilderOpen ? '▴' : '▾'}
                              </button>
                            </div>
                          </div>

                          <div
                            className="tw-ab-budget-bar"
                            title={`Ngân quỹ đã chi: ${totalCost.toLocaleString('vi-VN')} / ${TW_BATTLE_FUNDS.toLocaleString('vi-VN')} Lượng (còn dư ${(TW_BATTLE_FUNDS - totalCost).toLocaleString('vi-VN')} Lượng)`}
                          >
                            <i
                              style={{ width: `${budgetPct}%` }}
                              className={budgetPct >= 95 ? 'tight' : undefined}
                            />
                          </div>

                          <div className="tw-ab-synergies">
                            <span className="muted small">Quan hệ Ngũ Hành (Guanxi):</span>
                            {synergies.length > 0 ? (
                              synergies.map((syn) => (
                                <span
                                  key={syn.key}
                                  className={`tw-guanxi-badge ${syn.bond.kind}`}
                                  title={
                                    syn.bond.kind === 'rival'
                                      ? `${syn.bond.vnTitle} (${syn.pairLabel}) — Kình địch tranh công: tăng uy lực tấn công cạnh tranh trên chiến trường!`
                                      : `${syn.bond.vnTitle} (${syn.pairLabel}) — Đồng tâm hiệp lực (+Sĩ khí) & bộc phát Cuồng Nộ Báo Thù nếu nghĩa đệ ngã xuống!`
                                  }
                                >
                                  {syn.glyph} {syn.bond.vnTitle} <small>({syn.pairLabel})</small>
                                </span>
                              ))
                            ) : (
                              <span className="muted small">
                                Tự do phối tướng · ghép Lưu–Quan–Trương, Tôn Kiên–Chu Du hoặc Tào Tháo–Hạ Hầu Đôn để kích hoạt duyên phận!
                              </span>
                            )}
                          </div>

                          {!twBuilderOpen ? (
                            <div className="tw-ab-collapsed">
                              {([0, 1, 2] as const).map((slot) => {
                                const gid = myLoadout.generals[slot];
                                const gSpec = TW_GENERALS[gid];
                                const cls = TW_CLASSES[gSpec.class];
                                return (
                                  <button
                                    key={slot}
                                    type="button"
                                    className="tw-ab-mini-gen"
                                    onClick={() => setTwBuilderOpen(true)}
                                    title={`Nhấp mở bảng tùy chỉnh bộ tùy của ${gSpec.vnName}`}
                                  >
                                    <img
                                      src={gSpec.tokenPortrait}
                                      alt={gSpec.vnName}
                                      width={28}
                                      height={28}
                                      style={{ borderColor: cls.color }}
                                    />
                                    <span>
                                      <b>{gSpec.vnName}</b>{' '}
                                      <small className="muted">({cls.element})</small>
                                    </span>
                                    <span className="tw-ab-mini-units">
                                      {myLoadout.retinues[slot]
                                        .map((uk) => TW_UNIT_CAT_META[TW_UNITS[uk].category].glyph)
                                        .join(' ')}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <>
                              <div className="tw-ab-columns">
                                {([0, 1, 2] as const).map((slot) => {
                                  const gid = myLoadout.generals[slot];
                                  const gSpec = TW_GENERALS[gid];
                                  const cls = TW_CLASSES[gSpec.class];
                                  const swapOpen = twOpenGenSlot === slot;
                                  const otherSlots = ([0, 1, 2] as const).filter((s) => s !== slot);

                                  return (
                                    <div
                                      key={slot}
                                      className="tw-ab-col"
                                      style={{ borderTopColor: cls.color }}
                                    >
                                      <button
                                        type="button"
                                        className={`tw-ab-gen-btn${swapOpen ? ' on' : ''}`}
                                        onClick={() => {
                                          setTwPickingUnit(null);
                                          setTwOpenGenSlot((prev) => (prev === slot ? null : slot));
                                        }}
                                        title={`${gSpec.vnName} (${gSpec.enName}) · Hệ ${cls.element} (${cls.vnName})\nTuyệt kỹ: ${gSpec.skill.vnName} — ${gSpec.skill.desc}\nNhấp để đổi Danh Tướng Đạo #${slot + 1}`}
                                      >
                                        <img
                                          src={gSpec.tokenPortrait}
                                          alt={gSpec.vnName}
                                          width={38}
                                          height={38}
                                          className="tw-ab-gen-token"
                                          style={{ borderColor: cls.color }}
                                        />
                                        <div className="tw-ab-gen-meta">
                                          <div className="tw-ab-gen-name-row">
                                            <span
                                              className="tw-ab-el-dot"
                                              style={{ background: cls.color }}
                                            />
                                            <b>{gSpec.vnName}</b>
                                          </div>
                                          <span className="muted small">
                                            Hệ {cls.element} · {cls.vnName} · ✨ {gSpec.skill.vnName}
                                          </span>
                                        </div>
                                        <span className="tw-ab-swap-lbl">
                                          Đổi {swapOpen ? '▴' : '▾'}
                                        </span>
                                      </button>

                                      {swapOpen && (
                                        <div className="tw-ab-gen-picker">
                                          {TW_GENERAL_IDS.map((candId) => {
                                            const cand = TW_GENERALS[candId];
                                            const candCls = TW_CLASSES[cand.class];
                                            const isCurrent = candId === gid;
                                            const takenOtherSlot = otherSlots.find(
                                              (os) => myLoadout.generals[os] === candId,
                                            );
                                            const bondsWithOthers = otherSlots
                                              .map((os) =>
                                                findTwGuanxiBond(candId, myLoadout.generals[os]),
                                              )
                                              .filter((b): b is TwGuanxiBond => Boolean(b));

                                            return (
                                              <button
                                                key={candId}
                                                type="button"
                                                className={`tw-ab-gen-opt${isCurrent ? ' on' : ''}`}
                                                disabled={takenOtherSlot !== undefined}
                                                style={
                                                  isCurrent
                                                    ? { borderColor: candCls.color }
                                                    : undefined
                                                }
                                                onClick={() => handleSwapGeneral(slot, candId)}
                                                title={`${cand.vnName} (${cand.enName}) · Hệ ${candCls.element} (${candCls.vnName})\nTuyệt kỹ: ${cand.skill.vnName} — ${cand.skill.desc}`}
                                              >
                                                <img
                                                  src={cand.tokenPortrait}
                                                  alt={cand.vnName}
                                                  width={28}
                                                  height={28}
                                                  style={{ borderColor: candCls.color }}
                                                />
                                                <div className="tw-ab-gen-opt-info">
                                                  <div>
                                                    <i
                                                      className="tw-ab-el-dot"
                                                      style={{ background: candCls.color }}
                                                    />{' '}
                                                    <b>{cand.vnName}</b>
                                                  </div>
                                                  <small className="muted">
                                                    {candCls.element} · {candCls.vnName}
                                                    {takenOtherSlot !== undefined
                                                      ? ` (Đạo ${takenOtherSlot + 1})`
                                                      : ''}
                                                  </small>
                                                  {bondsWithOthers.map((b, bi) => (
                                                    <span
                                                      key={bi}
                                                      className={`tw-ab-mini-bond ${b.kind}`}
                                                    >
                                                      {twBondGlyph(b)} {b.vnTitle}
                                                    </span>
                                                  ))}
                                                </div>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}

                                      <div className="tw-ab-retinue-grid">
                                        {([0, 1, 2, 3] as const).map((uIdx) => {
                                          const uKind = myLoadout.retinues[slot][uIdx];
                                          const uSpec = TW_UNITS[uKind];
                                          const catMeta = TW_UNIT_CAT_META[uSpec.category];
                                          const pickingThis =
                                            twPickingUnit?.genSlot === slot &&
                                            twPickingUnit?.unitIdx === uIdx;

                                          return (
                                            <button
                                              key={uIdx}
                                              type="button"
                                              className={`tw-ab-unit-slot${pickingThis ? ' on' : ''}`}
                                              onClick={() => {
                                                setTwOpenGenSlot(null);
                                                setTwPickingUnit((prev) =>
                                                  prev &&
                                                  prev.genSlot === slot &&
                                                  prev.unitIdx === uIdx
                                                    ? null
                                                    : { genSlot: slot, unitIdx: uIdx },
                                                );
                                              }}
                                              title={`${uSpec.vnName} (${uSpec.enName}) · ${catMeta.vn}\nChi phí: ${uSpec.cost} Lượng${uSpec.vanguardDeploy ? ' · 🌲 Tiên Phong (bố trận sát tiền tuyến)' : ''}\n${uSpec.desc}\nNhấp để đổi binh chủng ô #${uIdx + 1}`}
                                            >
                                              <div className="tw-ab-unit-thumb-wrap">
                                                <img
                                                  src={uSpec.unitCard}
                                                  alt={uSpec.vnName}
                                                  className="tw-ab-unit-thumb"
                                                  onError={(e: SyntheticEvent<HTMLImageElement>) => {
                                                    const img = e.currentTarget;
                                                    if (img.dataset.fb === '1') return;
                                                    img.dataset.fb = '1';
                                                    img.src = makeTwUnitFallbackSvg(catMeta.glyph);
                                                  }}
                                                />
                                                {uSpec.vanguardDeploy && (
                                                  <span
                                                    className="tw-ab-vanguard-tag"
                                                    title="Quân Tiên Phong: Có thể bố trận phục kích trong Rừng Thông tiền tuyến!"
                                                  >
                                                    🌲 Tiên Phong
                                                  </span>
                                                )}
                                              </div>
                                              <div className="tw-ab-unit-body">
                                                <span className="tw-ab-unit-name">
                                                  {catMeta.glyph} {uSpec.vnName}
                                                </span>
                                                <span className="tw-ab-unit-cost">
                                                  💰 {uSpec.cost} Lượng
                                                </span>
                                              </div>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {twPickingUnit !== null && (() => {
                                const { genSlot, unitIdx } = twPickingUnit;
                                const curGenId = myLoadout.generals[genSlot];
                                const curGen = TW_GENERALS[curGenId];
                                const curKind = myLoadout.retinues[genSlot][unitIdx];
                                const curSpec = TW_UNITS[curKind];
                                const allowedKinds = twAllowedUnitsForGeneral(myFaction, curGenId);
                                const availForSlot = TW_BATTLE_FUNDS - totalCost + curSpec.cost;

                                return (
                                  <div className="tw-ab-unit-drawer">
                                    <div className="tw-ab-drawer-head">
                                      <span>
                                        Chiêu mộ Ô #{unitIdx + 1} dưới trướng{' '}
                                        <b>{curGen.vnName}</b> · Ngân quỹ khả dụng cho ô này:{' '}
                                        <b>{availForSlot.toLocaleString('vi-VN')} Lượng</b>
                                      </span>
                                      <button
                                        type="button"
                                        className="ghost small"
                                        onClick={() => setTwPickingUnit(null)}
                                      >
                                        Đóng ✕
                                      </button>
                                    </div>
                                    <div className="tw-ab-drawer-grid">
                                      {allowedKinds.map((candKind) => {
                                        const candSpec = TW_UNITS[candKind];
                                        const catMeta = TW_UNIT_CAT_META[candSpec.category];
                                        const isPicked = candKind === curKind;
                                        const exceedsBudget = candSpec.cost > availForSlot;

                                        return (
                                          <button
                                            key={candKind}
                                            type="button"
                                            className={`tw-ab-unit-choice${isPicked ? ' on' : ''}`}
                                            disabled={exceedsBudget}
                                            onClick={() =>
                                              handlePickRetinueUnit(genSlot, unitIdx, candKind)
                                            }
                                            title={`${candSpec.vnName} (${candSpec.enName}) — ${candSpec.cost} Lượng\n${candSpec.desc}${exceedsBudget ? '\n⚠️ Vượt quá Ngân quỹ Chiến trận 12.500 Lượng!' : ''}`}
                                          >
                                            <img
                                              src={candSpec.unitCard}
                                              alt={candSpec.vnName}
                                              className="tw-ab-choice-img"
                                              onError={(e: SyntheticEvent<HTMLImageElement>) => {
                                                const img = e.currentTarget;
                                                if (img.dataset.fb === '1') return;
                                                img.dataset.fb = '1';
                                                img.src = makeTwUnitFallbackSvg(catMeta.glyph);
                                              }}
                                            />
                                            <div className="tw-ab-choice-meta">
                                              <div className="tw-ab-choice-top">
                                                <img
                                                  src={`/database-total-war/ui/cls_${candSpec.category}.png`}
                                                  alt={catMeta.vn}
                                                  width={14}
                                                  height={14}
                                                  onError={(e: SyntheticEvent<HTMLImageElement>) => {
                                                    e.currentTarget.style.display = 'none';
                                                  }}
                                                />
                                                <span>{catMeta.glyph}</span>
                                                <b>{candSpec.vnName}</b>
                                              </div>
                                              <div className="tw-ab-choice-sub">
                                                <span
                                                  className={`tw-ab-choice-cost${
                                                    exceedsBudget ? ' over' : ''
                                                  }`}
                                                >
                                                  {candSpec.cost} Lượng
                                                </span>
                                                {candSpec.vanguardDeploy && (
                                                  <span className="tw-ab-vanguard-inline">
                                                    🌲 Tiên Phong
                                                  </span>
                                                )}
                                              </div>
                                              <small className="muted">
                                                Công {candSpec.meleeAtk} · Thủ {candSpec.meleeDef}
                                                {candSpec.range > 0
                                                  ? ` · Tầm ${candSpec.range}`
                                                  : ` · Xung ${candSpec.chargeBonus}`}
                                              </small>
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}
                            </>
                          )}
                        </div>
                      </>
                    );
                  })()}

                  {twCfg.mode === 'historical_2teams' && (
                    <div>
                      <span className="muted small">
                        Chọn Liên Minh {!spectating && me ? '· cùng Liên Minh hợp lực công địch, chia đều hũ chiến thắng' : '(vào bàn chơi để chọn Liên Minh)'}
                      </span>
                      {!spectating && me && (
                        <div className="bet-chips thap-team-chips">
                          {TW_COALITION_LABELS.map((label, t) => (
                            <button
                              key={t}
                              type="button"
                              className={`bet-chip thap-team-pick${twTeamOf(meId) === t ? ' on' : ''}`}
                              style={{ borderColor: TW_TEAM_COLORS[t] }}
                              onClick={() => emit('tw:team', { team: t })}
                            >
                              <i style={{ background: TW_TEAM_COLORS[t] }} /> {label}
                            </button>
                          ))}
                        </div>
                      )}
                      {twBots > 0 && (
                        <p className="muted small">
                          Chư hầu Máy AI dự kiến gia nhập:{' '}
                          {twBotPreviews.map((bot, i) => (
                            <span key={i} className="thap-seat-team" style={{ borderColor: TW_TEAM_COLORS[bot.team] }}>
                              <i style={{ background: TW_TEAM_COLORS[bot.team] }} /> {TW_FACTIONS[bot.faction].emblemText} {bot.botName} → {TW_COALITION_LABELS[bot.team]}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <ul className="rule-summary-list">
                  <li>
                    <b>Dàn trận RTS chuẩn Total War (Giữ &amp; Kéo Chuột Phải):</b> Mỗi Chư Hầu chỉ huy <b>3 Danh Tướng + 12 trung đoàn bộ tùy</b>; giữ &amp; kéo chuột phải trên mặt đất để tùy biến bề ngang hàng quân và góc xoay mặt từng binh sĩ, hoặc nhấp chuột phải vào địch để xung phong công kích.
                  </li>
                  <li>
                    <b>Phục kích Rừng Thông &amp; Địa hình Thủy Mặc:</b> Ẩn quân trong <b>Rừng Thông / Rừng Trúc</b> để tàng hình phục kích và được tán rừng <b>chắn 45% sát thương tên đạn</b>; chiếm <b>Đồi Cao</b> gia tăng tầm bắn cung pháo và uy lực xung kích đổ dốc.
                  </li>
                  <li>
                    <b>Thương Lâm Phản Xung Kích &amp; Tương Khắc Binh Chủng:</b> Bộ binh trường thương dựng <b>Thương Lâm (Spearwall)</b> đứng trụ sẽ <b>phản ngược sát thương xung kích (Charge Reflect)</b> bẻ gãy Thiết Kỵ; <b>Thuẫn Tường</b> chắn mưa tên trực diện, còn <b>Phong Thỉ Chùy</b> giúp kỵ binh xuyên phá sườn và hậu tuyến.
                  </li>
                  <li>
                    <b>Đơn Đấu Võ Tướng 1v1 &amp; Tuyệt Kỹ Ngũ Hành:</b>{' '}
                    {twCfg.romanceMode ? (
                      <>Chế độ <b>⚡ Diễn Nghĩa</b> cho phép Danh Tướng <b>Thách Đấu 1v1 (phím V)</b> mở võ đài sinh tử giữa vạn quân (trảm tướng địch gây sụp đổ sĩ khí diện rộng) và thi triển <b>Tuyệt Kỹ Ngũ Hành (phím Q)</b>.</>
                    ) : (
                      <>Chế độ <b>📜 Chính Sử</b> đặt Danh Tướng trong đội hình Cấm Vệ thực chiến, thắng bại quyết định bởi kỷ luật trận pháp, bọc sườn và giữ vững sĩ khí đại quân.</>
                    )}
                  </li>
                  <li>
                    <b>Đài Hiệu Lệnh, Sĩ Khí Tan Vỡ &amp; Hũ Xu Chiến Thắng:</b> Đánh tan tác làm toàn quân địch <b>vỡ trận tháo chạy (Rout/Shattered)</b> hoặc kiểm soát các <b>Đài Hiệu Lệnh</b> đến hết <b>{twCfg.durationMin} phút</b> để thắng trận. Người / Liên Minh thắng chia đều hũ xu (nếu Máy AI thắng thì hoàn tiền cược).
                  </li>
                </ul>
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
                          title={`${hero.activeSkill.vnName}: ${hero.activeSkill.desc}`}
                          style={{ borderColor: active ? hero.accentHex : undefined }}
                        >
                          <span
                            className="hero-sprite-icon sm"
                            style={{ backgroundImage: `url("${BANSUNG_STATIC_ROOT}/normalized/heroes/hero_${heroId}_idle.png")` }}
                            aria-hidden="true"
                          />
                          <span>
                            <strong>{hero.name}</strong>
                            <small>
                              HP {hero.hp * BANSUNG_HERO_STAT_SCALE} · SH {hero.shield * BANSUNG_HERO_STAT_SCALE} · NL {hero.energy}
                              {heroId === 'laser' ? ' · DMG+ / Chậm' : ''}
                            </small>
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
                  isThap ? thapProblem : isBansung ? bansungProblem : isTw ? twProblem : gameMode === 'ant_empire' ? 'Cần ≥ 2 đế chế' : gameMode === 'link_duel' ? `Cần 1–${LINK_MAX_PLAYERS} người` : 'Luật chưa hợp lệ'
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
      <MiragineTutorialModal open={miragineGuideOpen} onClose={() => setMiragineGuideOpen(false)} />
      {twGuideOpen && (
        <Modal
          title={
            <span className="modal-title-icon">
              <BookOpen size={19} /> Cẩm Nang Tam Quốc Toàn Chiến – 6 Thế Lực &amp; Ngũ Hành
            </span>
          }
          onClose={() => setTwGuideOpen(false)}
          width={860}
        >
          <div className="tw-guide-modal">
            <div>
              <h3>1. Sáu Thế Lực Chư Hầu &amp; Bộ Tùy Danh Tướng</h3>
              <p className="muted small" style={{ marginBottom: 8 }}>
                Mỗi Chư Hầu xuất trận cùng 3 Danh Tướng Huyền Thoại và 12 trung đoàn tinh binh (4 trung đoàn bộ tùy / tướng).
              </p>
              <div className="tw-guide-grid">
                {TW_SEAT_FACTIONS.map((fid) => {
                  const f = TW_FACTIONS[fid];
                  const lead = TW_GENERALS[f.defaultGenerals[0]];
                  return (
                    <div key={fid} className="tw-guide-card" style={{ borderLeft: `4px solid ${f.color}` }}>
                      <div className="mode-card-head" style={{ marginBottom: 6 }}>
                        <img
                          src={lead.tokenPortrait}
                          alt={lead.vnName}
                          width={36}
                          height={36}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: `2px solid ${f.color}`,
                            flexShrink: 0,
                          }}
                        />
                        <div>
                          <b>【{f.emblemText}】 {f.vnName} ({f.name})</b>
                          <div className="muted small">Chủ công: {f.leaderName}</div>
                        </div>
                      </div>
                      <p className="small" style={{ marginBottom: 4 }}>{f.desc}</p>
                      <p className="small" style={{ marginBottom: 4 }}>
                        <b>3 Tướng xuất trận:</b>{' '}
                        {f.defaultGenerals
                          .map((gid) => `${TW_GENERALS[gid].vnName} (${TW_GENERALS[gid].skill.vnName})`)
                          .join(' · ')}
                      </p>
                      <p className="muted small"><b>Đặc trưng thế lực:</b> {f.bonusDesc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h3>2. Hệ Ngũ Hành Tướng Lĩnh (Wu Xing – 5 Hệ Tướng)</h3>
              <div className="tw-guide-grid">
                {TW_GENERAL_CLASSES.map((cid) => {
                  const c = TW_CLASSES[cid];
                  return (
                    <div key={cid} className="tw-guide-card" style={{ borderLeft: `4px solid ${c.color}` }}>
                      <div className="mode-card-head" style={{ marginBottom: 4 }}>
                        <img
                          src={TW_CLASS_ELEMENT_ICON[cid]}
                          alt={c.element}
                          width={26}
                          height={26}
                          style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0 }}
                        />
                        <div>
                          <b>Hệ {c.element} · {c.vnName}</b>
                          <div className="muted small">{c.enName} · Hào quang {c.auraRadius}</div>
                        </div>
                      </div>
                      <p className="small">{c.auraDesc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h3>3. Sáu Trận Hình Chiến Thuật (Tactical Formations)</h3>
              <div className="tw-guide-grid">
                {TW_FORMATION_IDS.map((fmtId) => {
                  const fmt = TW_FORMATIONS[fmtId];
                  return (
                    <div key={fmtId} className="tw-guide-card">
                      <div className="mode-card-head" style={{ marginBottom: 4 }}>
                        <img
                          src={`/database-total-war/ui/fmt_${fmtId}.png`}
                          alt={fmt.vnName}
                          width={26}
                          height={26}
                          style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0 }}
                        />
                        <div>
                          <b>{fmt.vnName}</b>
                          <div className="muted small">{fmt.enName}</div>
                        </div>
                      </div>
                      <p className="small">{fmt.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="tw-guide-card">
              <h3>4. Thao Tác Điều Binh Tốc Chiến</h3>
              <ul className="rule-summary-list">
                <li><b>Chuột trái / Kéo khung:</b> Chọn trung đoàn (nhấp đúp chọn toàn bộ binh chủng cùng loại; giữ Shift chọn gộp; <b>Ctrl+1..9</b> lưu đạo quân).</li>
                <li><b>Giữ &amp; Kéo Chuột Phải:</b> Kéo vạch dàn quân trực quan trên mặt đất để định chiều rộng chiến tuyến và hướng mặt đội hình.</li>
                <li><b>Phím tắt chiến thuật:</b> <b>Space</b> (xem tầm bắn &amp; hướng hành quân / nhấp đúp về Chủ Tướng) · <b>Q</b> (Tuyệt kỹ Danh Tướng) · <b>V</b> (Thách Đấu 1v1) · <b>G</b> (Giữ vị trí) · <b>F</b> (Tự bắn) · <b>K</b> (Du kích) · <b>H</b> (Dừng quân).</li>
              </ul>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="primary big" onClick={() => setTwGuideOpen(false)}>
              Đã rõ binh pháp
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
