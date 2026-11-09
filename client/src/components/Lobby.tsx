import { useState } from 'react';
import { Check, Coins, Copy, Crown, Gamepad2, Link2, LogOut, Play, Settings2, Trophy, UserPlus, UserX } from 'lucide-react';
import {
  ANTS_MAX_EMPIRES,
  ANTS_MINUTE_OPTIONS,
  ANTS_START_GOLD,
  antsIncome,
  BET_OPTIONS,
  DEFAULT_ANTS_CONFIG,
  DEFAULT_LINK_CONFIG,
  LINK_BOSSES,
  LINK_BOSS_SKILL_NAME,
  LINK_BOT_LABEL,
  LINK_FOG_MS,
  LINK_KO_BONUS,
  LINK_MAX_PLAYERS,
  LINK_RAID_S,
  LINK_SHUFFLE_CD_S,
  linkBossMaxHp,
  LINK_STAGE1_S,
  GAME_MODES,
  LOTO_CALL_MS,
  LOTO_COLORS,
  LOTO_COLOR_ORDER,
  LOTO_SHEET_PRICE,
  lotoDefaultColors,
  MIN_PLAYERS,
  roomDeckSummary,
  type AccountInfo,
  type GameMode,
  type RoomRules,
  type RoomView,
} from '../../../shared/src';
import { copyTextSafe, fmtCoins } from './Dock';
import PlayerAvatar from '../art/PlayerAvatar';
import ChatPanel, { useChatState, type RoomChat } from './ChatPanel';
import RoomSettings, { RoomRuleSummary } from './RoomSettings';
import { LobbySpectators, isSpectating, roomPeople } from './Spectators';
import { roomInviteUrl } from '../roomLink';

interface Props {
  view: RoomView;
  meId: string;
  emit: (event: string, payload?: unknown) => void;
  chat?: RoomChat;
  account?: AccountInfo | null;
  onSaveRules?: (rules: RoomRules) => void | Promise<void>;
}

const NO_CHAT: RoomChat = { messages: [], typing: {}, send: () => {}, onTyping: () => {} };

export default function Lobby({ view, meId, emit, chat = NO_CHAT, account, onSaveRules }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const { typingNames, unread } = useChatState(chat, roomPeople(view), meId, true);
  const isHost = view.hostId === meId;
  const gameMode: GameMode = view.gameMode ?? 'exploding_kittens';
  const modeInfo = GAME_MODES[gameMode];
  const online = view.players.filter((p) => p.connected).length;
  const bet = view.bet;
  /** Lô Tô: mỗi người cược theo số tờ tự mua (50 xu/tờ); chế độ khác cùng mức của phòng */
  const isLoto = gameMode === 'loto';
  const picks = view.loto?.picks ?? {};
  const myColors = view.loto?.colors?.[meId] ?? lotoDefaultColors(Math.max(0, view.players.findIndex((p) => p.id === meId)));
  const setSheetColor = (k: number, c: string) => emit('loto:pick', { colors: myColors.map((x, i) => (i === k ? c : x)) });
  const stakeOf = (id: string) => (isLoto ? LOTO_SHEET_PRICE * (picks[id] ?? 1) : bet);
  const poor = view.players.filter((p) => p.connected && stakeOf(p.id) > 0 && (p.coins ?? 0) < stakeOf(p.id));
  const lotoPot = view.players.filter((p) => p.connected).reduce((s, p) => s + stakeOf(p.id), 0);
  // chỉ Mèo Nổ có chỉnh số chỗ trong luật phòng; chế độ khác luôn đủ chỗ tối đa (khớp Game.seatLimit ở server)
  const maxPlayers = gameMode === 'exploding_kittens' ? Math.min(view.rules.maxPlayers, modeInfo.maxPlayers) : modeInfo.maxPlayers;
  const empty = Math.max(0, maxPlayers - view.players.length);
  const me = view.players.find((player) => player.id === meId);
  const spectating = isSpectating(view, meId);
  const awaitingReady = view.players.filter((player) => player.connected && player.id !== view.hostId && !player.ready);
  const deck = roomDeckSummary(view.rules, online);
  const antsCfg = view.ants?.config ?? DEFAULT_ANTS_CONFIG;
  const linkCfgRaw = view.link?.config;
  /** 1 người, 0 máy = chơi một mình */
  const linkBots = Math.max(0, Math.min(LINK_MAX_PLAYERS - online, linkCfgRaw?.bots ?? 0));
  const deckOk =
    gameMode === 'exploding_kittens' ? deck.canStart
      : gameMode === 'ant_empire' ? online + antsCfg.bots >= 2 && online + antsCfg.bots <= ANTS_MAX_EMPIRES
      : gameMode === 'link_duel' ? online + linkBots >= 1 && online + linkBots <= LINK_MAX_PLAYERS
        : online <= modeInfo.maxPlayers;
  const canStart = online >= modeInfo.minPlayers && awaitingReady.length === 0 && deckOk && poor.length === 0;
  const setAnts = (patch: Partial<typeof antsCfg>) => emit('ants:config', { config: { ...antsCfg, ...patch } });
  const linkCfg = view.link?.config ?? DEFAULT_LINK_CONFIG;

  const copyRoomCode = () => {
    void copyTextSafe(view.code).then((ok) => setCopied(ok));
    window.setTimeout(() => setCopied(false), 1500);
  };
  /** Link mời: điện thoại mở bảng chia sẻ (Zalo, Messenger…), máy tính sao chép link */
  const shareInvite = async () => {
    const url = roomInviteUrl(view.code);
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    if (touch && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `Vào phòng ${view.code}`, text: `Vào chơi ${modeInfo.shortName} với mình nè! Phòng ${view.code}:`, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    const ok = await copyTextSafe(url);
    setLinkCopied(ok);
    window.setTimeout(() => setLinkCopied(false), 1800);
  };

  return (
    <div className="center-screen">
      <div className="lobby-wrap">
        <div className="panel lobby">
          <div className="lobby-head">
            <div>
              <p className="muted">Mã phòng. Gửi link mời để bạn bè bấm là vào thẳng phòng</p>
              <button type="button" className="room-code-btn" onClick={copyRoomCode} title="Sao chép mã phòng">
                <span className="room-code">{view.code}</span>
                <span className="room-code-copy">
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  <small>{copied ? 'Đã chép' : 'Sao chép'}</small>
                </span>
              </button>
              <button type="button" className="secondary invite-link-btn" onClick={() => void shareInvite()} title={roomInviteUrl(view.code)}>
                {linkCopied ? <Check size={15} /> : <Link2 size={15} />} {linkCopied ? 'Đã chép link mời' : 'Gửi link mời'}
              </button>
            </div>
            <div className="lobby-count">
              {view.players.length}/{maxPlayers}
              <span className="muted">người ({modeInfo.shortName})</span>
            </div>
          </div>

          {/* Chọn chế độ chơi trong phòng chờ */}
          <div className="bet-box mode-box">
            <div className="bet-head">
              <b>
                <Gamepad2 size={15} className="inline-icon" /> Trò chơi trong phòng
              </b>
              <span className="muted small">{isHost ? 'Chủ phòng chọn trò chơi' : 'Chủ phòng đang chọn'}</span>
            </div>
            <div className="bet-chips mode-chips">
              {(Object.keys(GAME_MODES) as GameMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`bet-chip${m === gameMode ? ' on' : ''}`}
                  disabled={!isHost}
                  onClick={() => emit('room:mode', { gameMode: m })}
                >
                  {GAME_MODES[m].emoji} {GAME_MODES[m].name}
                </button>
              ))}
            </div>
            <p className="bet-note">{modeInfo.desc}</p>
          </div>

          <div className="lobby-seats">
            {view.players.map((p) => (
              <div key={p.id} className={`lobby-seat${p.connected ? '' : ' offline'}${p.id === meId ? ' me' : ''}`}>
                {isHost && p.id !== meId && (
                  <button
                    type="button"
                    className="seat-kick-btn"
                    onClick={() => emit('room:kick', { targetId: p.id })}
                    title={`Kích ${p.name} khỏi phòng`}
                    aria-label={`Kích ${p.name} khỏi phòng`}
                  >
                    <UserX size={13} />
                  </button>
                )}
                <PlayerAvatar id={p.id} avatar={p.avatar} size={64} />
                <span className="lobby-name">
                  {p.id === view.hostId && <Crown size={14} className="inline-icon host-crown" />}
                  {p.name}
                </span>
                <span className={`small seat-readiness${p.connected && (p.id === view.hostId || p.ready) ? ' ready' : ''}`}>
                  {!p.connected ? (
                    'Mất kết nối'
                  ) : p.id === view.hostId ? (
                    'Chủ phòng · đã chốt luật'
                  ) : p.ready ? (
                    <>
                      <Check size={12} className="inline-icon" /> Đã đồng ý luật
                    </>
                  ) : (
                    'Chờ đồng ý luật'
                  )}
                  {p.id === meId && ' · bạn'}
                </span>
                {p.coins !== undefined && (
                  <span className={`seat-coins${stakeOf(p.id) > 0 && p.coins < stakeOf(p.id) ? ' low' : ''}`}>
                    <Coins size={12} className="inline-icon" /> {fmtCoins(p.coins)}
                  </span>
                )}
                {isLoto && (
                  <span className="seat-loto">
                    🎫 {picks[p.id] ?? 1} tờ
                    {(view.loto?.colors?.[p.id] ?? []).slice(0, picks[p.id] ?? 1).map((c, k) => (
                      <i key={k} className="loto-dot" style={{ background: LOTO_COLORS[c]?.main }} title={LOTO_COLORS[c]?.name} />
                    ))}
                  </span>
                )}
              </div>
            ))}
            {Array.from({ length: empty }, (_, i) => (
              <div key={`e${i}`} className="lobby-seat empty">
                <span className="empty-avatar">
                  <UserPlus size={22} />
                </span>
                <span className="muted small">trống</span>
              </div>
            ))}
          </div>

          <LobbySpectators view={view} meId={meId} emit={emit} />

          {isLoto ? (
            <div className="bet-box">
              <div className="bet-head">
                <b>🎫 Mua tờ lô tô</b>
                <span className="muted small">{fmtCoins(LOTO_SHEET_PRICE)} xu/tờ · mỗi người tự chọn</span>
              </div>
              <div className="bet-chips">
                {[1, 2].map((n) => (
                  <button
                    key={n}
                    className={`bet-chip${(picks[meId] ?? 1) === n ? ' on' : ''}`}
                    disabled={!me || spectating}
                    onClick={() => emit('loto:pick', { sheets: n })}
                  >
                    {n} tờ · {fmtCoins(n * LOTO_SHEET_PRICE)} xu{n === 2 ? ' (đủ 90 số)' : ''}
                  </button>
                ))}
              </div>
              {me && !spectating && (
                <div className="loto-color-pick">
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
                      <span className="small">{LOTO_COLORS[myColors[k]]?.name}</span>
                    </div>
                  ))}
                  {(picks[meId] ?? 1) === 2 && <p className="muted small">2 tờ chọn trùng màu hay khác màu đều được.</p>}
                </div>
              )}
              <p className="bet-note">
                Hũ {fmtCoins(lotoPot)} xu – ai KINH trước (đủ 5 số một hàng ngang) ăn cả hũ <Trophy size={14} className="inline-icon" />
                {me && account && account.coins < stakeOf(meId) && <span className="bad-text"> · Bạn thiếu xu, vào Hồ sơ nhận 500 xu/ngày nhé.</span>}
              </p>
              {poor.length > 0 && <p className="bad-text small">Không đủ xu: {poor.map((p) => p.name).join(', ')}</p>}
            </div>
          ) : (
          <div className="bet-box">
            <div className="bet-head">
              <b>
                <Coins size={15} className="inline-icon" /> Cược mỗi người
              </b>
              <span className="muted small">{isHost ? 'Chủ phòng chọn' : 'Chủ phòng đang chọn'}</span>
            </div>
            <div className="bet-chips">
              {BET_OPTIONS.map((b) => (
                <button key={b} className={`bet-chip${b === bet ? ' on' : ''}`} disabled={!isHost} onClick={() => emit('room:bet', { amount: b })}>
                  {b === 0 ? 'Miễn phí' : `${fmtCoins(b)} xu`}
                </button>
              ))}
            </div>
            <p className="bet-note">
              {bet === 0 ? (
                'Chơi vui, không mất xu.'
              ) : gameMode === 'blackjack_21' ? (
                <>
                  Tổng hũ cược {fmtCoins(bet * online)} xu – So điểm với Nhà Cái (Xì Bàng ×3, Xì Dách / Ngũ Linh ×2){' '}
                  <Trophy size={14} className="inline-icon" />
                </>
              ) : (
                <>
                  Hũ {fmtCoins(bet * online)} xu – người thắng ván ăn trọn hũ <Trophy size={14} className="inline-icon" />
                </>
              )}
              {bet > 0 && account && account.coins < bet && <span className="bad-text"> · Bạn thiếu xu, vào Hồ sơ nhận 500 xu/ngày nhé.</span>}
            </p>
            {poor.length > 0 && <p className="bad-text small">Không đủ xu: {poor.map((p) => p.name).join(', ')}</p>}
          </div>
          )}

          <div className="lobby-rules">
            <div className="lobby-rules-head">
              <div>
                <h3>Luật đã chốt của phòng ({modeInfo.name})</h3>
                <p className="muted small">Phiên bản {view.rulesVersion} · đổi luật hoặc đổi game sẽ yêu cầu mọi người xác nhận lại.</p>
              </div>
              {isHost && gameMode === 'exploding_kittens' && (
                <button className="secondary" onClick={() => setSettingsOpen(true)}>
                  <Settings2 size={15} /> Sửa luật
                </button>
              )}
            </div>
            {gameMode === 'exploding_kittens' ? (
              <>
                <RoomRuleSummary rules={view.rules} playerCount={online} />
                <p className="muted small">Nếu chữ trên ảnh lá bài khác luật ở đây, áp dụng luật phòng đã chốt.</p>
              </>
            ) : gameMode === 'ant_empire' ? (
              <>
                <div className="ants-lobby-cfg">
                  <div>
                    <span className="muted small">Đế chế máy (🤖)</span>
                    <div className="bet-chips">
                      {Array.from({ length: Math.max(0, ANTS_MAX_EMPIRES - view.players.length) + 1 }, (_, n) => n).map((n) => (
                        <button key={n} type="button" className={`bet-chip${n === antsCfg.bots ? ' on' : ''}`} disabled={!isHost} onClick={() => setAnts({ bots: n })}>{n}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="muted small">Độ khó của máy</span>
                    <div className="bet-chips">
                      {(['easy', 'normal', 'hard'] as const).map((lv) => (
                        <button key={lv} type="button" className={`bet-chip${lv === antsCfg.botLevel ? ' on' : ''}`} disabled={!isHost} onClick={() => setAnts({ botLevel: lv })}>
                          {{ easy: 'Dễ', normal: 'Thường', hard: 'Khó' }[lv]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="muted small">Thời gian trận</span>
                    <div className="bet-chips">
                      {ANTS_MINUTE_OPTIONS.map((m) => (
                        <button key={m} type="button" className={`bet-chip${m === antsCfg.minutes ? ' on' : ''}`} disabled={!isHost} onClick={() => setAnts({ minutes: m })}>
                          {m ? `${m} phút` : 'Không giới hạn'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <ul className="rule-summary-list">
                  <li>Tổng <b>{online + antsCfg.bots}</b> đế chế (tối đa {ANTS_MAX_EMPIRES}) trên bản đồ 2D rộng theo số người, <b>sáng toàn bộ</b> – thấy hết căn cứ địch.</li>
                  <li>Khởi đầu {ANTS_START_GOLD} vàng; <b>mỗi 1 phút được cấp thêm vàng</b>, lần sau nhiều hơn lần trước ({antsIncome(1)}, {antsIncome(2)}, {antsIncome(3)}…).</li>
                  <li>Bấm 1 ô trong danh sách <b>10 loại kiến</b> là trại <b>tự ra quân liên tục</b> – từng con một, mỗi con trừ vàng lúc bắt đầu nở; hết vàng thì chờ vàng rồi tự ra tiếp.</li>
                  <li>Mỗi đế chế có <b>3 trụ</b>: 2 Trụ Phụ + 1 Trụ Chính. Trụ tự bắn kiến địch tới gần, mỗi phát hạ gọn 1 con, nạp đạn 5 giây (Trụ Chính đạn to, bắn xa hơn).</li>
                  <li><b>Phá Trụ Chính</b> của mọi đế chế khác để thắng.{antsCfg.minutes ? ` Hết ${antsCfg.minutes} phút: điểm sức mạnh cao nhất thắng.` : ''} Máy thắng thì hoàn cược.</li>
                </ul>
              </>
            ) : gameMode === 'link_duel' ? (
              <>
                <div className="ants-lobby-cfg">
                  <div>
                    <span className="muted small">Thêm máy (🤖) · tổng {online + linkBots}/{LINK_MAX_PLAYERS} người</span>
                    <div className="bet-chips">
                      {Array.from({ length: Math.max(0, LINK_MAX_PLAYERS - view.players.length) + 1 }, (_, n) => n).map((n) => (
                        <button key={n} type="button" className={`bet-chip${n === linkBots ? ' on' : ''}`} disabled={!isHost} onClick={() => emit('link:config', { config: { ...linkCfg, bots: n } })}>{n}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="muted small">Độ khó của máy</span>
                    <div className="bet-chips">
                      {(['easy', 'normal', 'hard'] as const).map((lv) => (
                        <button key={lv} type="button" className={`bet-chip${lv === linkCfg.botLevel ? ' on' : ''}`} disabled={!isHost || linkBots === 0} onClick={() => emit('link:config', { config: { ...linkCfg, botLevel: lv } })}>
                          {LINK_BOT_LABEL[lv]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <ul className="rule-summary-list">
                  <li>1–{LINK_MAX_PLAYERS} người (1 người không thêm máy là chơi một mình, 2 người là solo 1v1). Nối 2 ô <b>cùng con thú</b> bằng đường gấp khúc <b>tối đa 2 lần</b> (được vòng ra ngoài mép bàn). Bàn 16×9, mọi người cùng một đề.</li>
                  <li><b>Màn 1 – Đua Nối ({LINK_STAGE1_S} giây):</b> nối liên tiếp được combo, nạp ⚡ Sấm. Đầy Sấm tung <b>❄️ Đóng Băng</b> hoặc <b>🌫️ Mây Mù</b> (che bàn {LINK_FOG_MS / 1000} giây) – mặc định vào <b>người dẫn đầu</b>, bấm vào bàn nhỏ của ai thì nhắm người đó. Dọn sạch bàn trước được thưởng lớn.</li>
                  <li>
                    <b>Liên hoàn {LINK_BOSSES.length} Màn Boss (Màn 1 → 2 → 3 → Màn 4 Co-op 2 Boss → 👑 Đại Ma Vương → 🌌 Trùm Cuối Cự Thần):</b> cả phòng cùng đánh, mỗi cặp là một cú đấm, Sấm đầy tung <b>⚡ Siêu Đấm</b>. 3 Boss đầu dùng chung <b>{LINK_RAID_S / 60} phút</b> (hạ nhanh thì dư giờ cho Boss sau); riêng <b>Màn Boss 4 (Co-op 2 Boss)</b> được cấp mới <b>6 phút</b>, <b>👑 Đại Ma Vương</b> (3 thanh máu) <b>7 phút</b>, <b>🌌 Cự Thần Thiên Hà</b> (10 thanh máu, mỗi người <b>2 bàn</b>, sát thương x2) <b>10 phút</b>!
                    <ul>
                      {LINK_BOSSES.map((b, i) => (
                        <li key={b.id}>
                          {b.emoji} <b>{b.name}</b>{b.coop && b.partners ? <> (<b>Co-op 2 Boss · 6 phút riêng:</b> {b.partners[0].emoji} {b.partners[0].name} × {b.partners[1].emoji} {b.partners[1].name})</> : null}{(b.bars ?? 1) > 1 ? <> (<b>{b.final ? 'TRÙM CUỐI' : 'HỢP THỂ'} · {b.bars} thanh máu{b.dual ? ` · 2 bàn · sát thương x${b.dmgMul ?? 1}` : ''} · {(b.raidS ?? 0) / 60} phút riêng</b>)</> : null} – {linkBossMaxHp(i, online + linkBots)} máu – {new Set(b.skills).size} chiêu: {[...new Set(b.skills)].map((k) => LINK_BOSS_SKILL_NAME[k]).join(' · ')}
                        </li>
                      ))}
                    </ul>
                  </li>
                  <li><b>🔀 Đảo Bàn:</b> chiêu tự đảo bàn mình cho dễ nối, miễn phí, hồi chiêu {LINK_SHUFFLE_CD_S} giây (phím R).</li>
                  <li><b>Tổng điểm</b> = điểm Màn 1 + sát thương lên Boss + <b>+{LINK_KO_BONUS}</b> cho mỗi Boss mình kết liễu. Cao hơn thì thắng cả hũ.</li>
                </ul>
              </>
            ) : isLoto ? (
              <ul className="rule-summary-list">
                <li>Mỗi tờ <b>9 hàng × 9 cột</b> (3 khối), mỗi hàng <b>5 số</b>; cột theo chục: 1–9, 10–19 … 80–90. Mua <b>2 tờ</b> thì 2 tờ ghép lại có đủ <b>90 số</b>, mỗi số đúng 1 lần.</li>
                <li>Máy gọi ngẫu nhiên 1 số mỗi <b>{LOTO_CALL_MS / 1000} giây</b> (có đọc số), số trúng tự đóng dấu trên tờ của bạn. Hàng còn thiếu 1 số là <b>CHỜ</b>.</li>
                <li>Ai đủ <b>5 số trên một hàng ngang</b> trước là <b>KINH</b> – ăn cả hũ. Nhiều người KINH cùng một số thì chia đều.</li>
              </ul>
            ) : gameMode === 'blackjack_21' ? (
              <ul className="rule-summary-list">
                <li>Bộ bài Tây 52 lá chuẩn (lưu trong <code>database/playing-cards/</code>). Chủ phòng làm <b>Nhà Cái</b>.</li>
                <li>Chia mỗi người 2 lá. <b>Xì Bàng</b> (2 lá Át), <b>Xì Dách</b> (Át + 10/J/Q/K), <b>Ngũ Linh</b> (5 lá ≤ 21 điểm).</li>
                <li>Nhà con cần đủ tuổi <b>≥ 16 điểm</b> mới được dừng; Nhà Cái cần <b>≥ 15 điểm</b> và có quyền xét bài từng người.</li>
              </ul>
            ) : (
              <ul className="rule-summary-list">
                <li>Bộ bài Tây 52 lá chuẩn (2–4 người, chuẩn 4 người mỗi người <b>13 lá</b>). Thứ tự: <b>3 &lt; 4 &lt; … &lt; A &lt; 2 (Heo)</b>; chất <b>♠ &lt; ♣ &lt; ♦ &lt; ♥</b>.</li>
                <li>Ván đầu tiên: người có lá nhỏ nhất (<b>3♠</b> khi đủ 4 người) đi trước; các ván sau người thắng đi trước.</li>
                <li>Hỗ trợ đầy đủ: <b>Rác, Đôi, Sám cô, Sảnh, Tứ Quý, 3 Đôi Thông, 4 Đôi Thông</b> chặt Heo / Đôi Heo và <b>Tới Trắng</b>!</li>
              </ul>
            )}
            {awaitingReady.length > 0 && (
              <p className="muted small" role="status">
                Chờ xác nhận: {awaitingReady.map((player) => player.name).join(', ')}.
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
                  gameMode === 'ant_empire' ? 'Cần ít nhất 2 đế chế – thêm máy nhé' : gameMode === 'link_duel' ? `Cần 2–${LINK_MAX_PLAYERS} người – thêm máy nhé` : 'Số người hoặc bộ bài chưa hợp lệ'
                ) : poor.length > 0 ? (
                  'Có người chưa đủ xu'
                ) : awaitingReady.length > 0 ? (
                  'Chờ mọi người đồng ý luật'
                ) : (
                  <>
                    <Play size={18} /> Bắt đầu {modeInfo.shortName}
                  </>
                )}
              </button>
            ) : spectating ? (
              <span className="muted small">Bạn đang xem. Bấm “Vào bàn chơi” ở mục Khán giả nếu còn ghế trống.</span>
            ) : (
              <button className={me?.ready ? 'secondary big' : 'primary big'} onClick={() => emit('room:ready', { ready: !me?.ready, rulesVersion: view.rulesVersion })}>
                {me?.ready ? (
                  <>
                    <Check size={16} /> Đã sẵn sàng · hủy
                  </>
                ) : (
                  'Đồng ý luật & sẵn sàng'
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
    </div>
  );
}
