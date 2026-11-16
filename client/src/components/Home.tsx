import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { ArrowRight, Eye, Plus, Sliders, Sparkles, Users } from 'lucide-react';
import { BANSUNG_STATIC_ROOT, GAME_MODES, TW_MAX_PLAYERS, type GameMode, type RoomRules } from '../../../shared/src';
import Backdrop3D from './Backdrop3D';
import CardView from './CardView';
import RoomSettings, { getSavedRoomRules } from './RoomSettings';
import { readRoomParam } from '../roomLink';

interface GameMeta {
  title: string;
  tag: string;
  blurb: string;
  accent: string;
  art: () => ReactNode;
}

const HUB_GAME_ORDER: readonly GameMode[] = [
  'bansung',
  'thap_hung',
  'total_war',
  'exploding_kittens',
  'tien_len',
  'blackjack_21',
  'ant_empire',
  'link_duel',
  'loto',
];

const HUB_META: Record<GameMode, GameMeta> = {
  bansung: {
    title: 'Bắn Súng Co-op',
    tag: 'Sinh tồn 2.5D',
    blurb: 'Lên cấp Gacha, tiến hóa súng & diệt Boss',
    accent: '#22c55e',
    art: () => (
      <div className="gcard-art-bansung">
        <span
          className="hero-sprite-icon lg left"
          style={{ backgroundImage: `url("${BANSUNG_STATIC_ROOT}/normalized/heroes/hero_knight_idle.png")` }}
          aria-hidden="true"
        />
        <span
          className="hero-sprite-icon lg right"
          style={{ backgroundImage: `url("${BANSUNG_STATIC_ROOT}/normalized/heroes/hero_ranger_idle.png")` }}
          aria-hidden="true"
        />
        <span className="gcard-core-badge">🔫</span>
      </div>
    ),
  },
  thap_hung: {
    title: 'Miragine War',
    tag: 'Chiến thuật',
    blurb: '16 binh chủng, đợt 30s, phá Pha Lê',
    accent: '#a855f7',
    art: () => (
      <div className="gcard-art-photo">
        <img src="/database-miraginewar/ui/title_bg.jpg" alt="" />
        <span className="gcard-photo-badge">⚔️ 16 Lính</span>
      </div>
    ),
  },
  total_war: {
    title: 'Tam Quốc Toàn Chiến',
    tag: 'Chiến thuật',
    blurb: 'Điều binh thời gian thực, 1–8 Chư Hầu',
    accent: '#dc2626',
    art: () => (
      <div className="gcard-art-emblem">
        <span className="gcard-big-emoji">🐉</span>
        <span className="gcard-sub-pill">Tam Quốc</span>
      </div>
    ),
  },
  exploding_kittens: {
    title: 'Mèo Nổ',
    tag: 'Thẻ bài',
    blurb: 'Rút bài né bom, Gỡ Bom & Nope bạn bè',
    accent: '#f97316',
    art: () => (
      <div className="gcard-art-kittens">
        <CardView type="defuse" size="xs" className="gcard-mini left" preview={false} />
        <CardView type="exploding" size="xs" className="gcard-mini right" preview={false} />
      </div>
    ),
  },
  tien_len: {
    title: 'Tiến Lên',
    tag: 'Bài Tây',
    blurb: '13 lá chuẩn Việt, Tứ Quý chặt Heo',
    accent: '#ef4444',
    art: () => (
      <div className="gcard-art-playing">
        <span className="gcard-suit black">A♠</span>
        <span className="gcard-suit red">2♥</span>
      </div>
    ),
  },
  blackjack_21: {
    title: 'Xì Dách 21',
    tag: 'So điểm',
    blurb: 'Rút sát 21 điểm, Xì Bàng ×3, Ngũ Linh ×2',
    accent: '#eab308',
    art: () => (
      <div className="gcard-art-playing">
        <span className="gcard-suit black">A♠</span>
        <span className="gcard-suit gold">21</span>
      </div>
    ),
  },
  ant_empire: {
    title: 'Đế Chế Kiến',
    tag: 'Công trụ',
    blurb: '10 loài kiến tự xuất quân, phá 3 trụ địch',
    accent: '#f59e0b',
    art: () => (
      <div className="gcard-art-emblem">
        <span className="gcard-big-emoji">🐜</span>
        <span className="gcard-sub-pill">10 Chủng</span>
      </div>
    ),
  },
  link_duel: {
    title: 'Nối Thú Đại Chiến',
    tag: 'Đua nối + Boss',
    blurb: 'Nối bàn 16×9 & hợp lực hạ 6 Boss',
    accent: '#06b6d4',
    art: () => (
      <div className="gcard-art-emblem">
        <span className="gcard-big-emoji">⚡</span>
        <span className="gcard-sub-pill">6 Boss</span>
      </div>
    ),
  },
  loto: {
    title: 'Lô Tô Cân Đồ',
    tag: 'Gọi số',
    blurb: '1–2 tờ 90 số, KINH 5 số hàng ngang',
    accent: '#ec4899',
    art: () => (
      <div className="gcard-art-loto">
        <span className="gcard-ball b1">18</span>
        <span className="gcard-ball b2">45</span>
        <span className="gcard-ball b3">88</span>
      </div>
    ),
  },
};

function GameCard3D({
  mode,
  active,
  onSelect,
  onLaunch,
}: {
  mode: GameMode;
  active: boolean;
  onSelect: () => void;
  onLaunch: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const info = GAME_MODES[mode];
  const meta = HUB_META[mode];

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / Math.max(1, rect.width);
    const py = (e.clientY - rect.top) / Math.max(1, rect.height);
    const rx = (0.5 - py) * 18;
    const ry = (px - 0.5) * 20;
    el.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
    el.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
    el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
    el.dataset.hover = '1';
  };

  const handlePointerLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--gx', '50%');
    el.style.setProperty('--gy', '25%');
    delete el.dataset.hover;
  };

  return (
    <div className={`gcard-stage${active ? ' is-active' : ''}`} style={{ '--card-accent': meta.accent } as CSSProperties}>
      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        aria-pressed={active}
        className={`gcard-3d${active ? ' is-active' : ''}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onClick={() => {
          if (active) onLaunch();
          else onSelect();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (active) onLaunch();
            else onSelect();
          }
        }}
      >
        <div className="gcard-glare" aria-hidden="true" />
        <div className="gcard-top-row">
          <span className="gcard-tag">{meta.tag}</span>
          <span className="gcard-cap">
            <Users size={11} /> {info.minPlayers}–{info.maxPlayers}
          </span>
        </div>

        <div className="gcard-visual">{meta.art()}</div>

        <div className="gcard-body">
          <strong className="gcard-title">{meta.title}</strong>
          <span className="gcard-blurb">{meta.blurb}</span>
        </div>

        <div className="gcard-foot">
          <button
            type="button"
            className={active ? 'gcard-play primary' : 'gcard-play secondary'}
            onClick={(e) => {
              e.stopPropagation();
              onLaunch();
            }}
          >
            {active ? (
              <>
                Tạo phòng <ArrowRight size={14} />
              </>
            ) : (
              <>
                <Plus size={14} /> Chơi ngay
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home({
  onCreate,
  onJoin,
  onWatch,
}: {
  onCreate: (rules: RoomRules, gameMode: GameMode) => void | Promise<void>;
  onJoin: (code: string) => void;
  onWatch: (code: string) => void;
}) {
  const [code, setCode] = useState(readRoomParam);
  const [gameMode, setGameMode] = useState<GameMode>('bansung');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ready = code.trim().length === 4;
  const activeMeta = HUB_META[gameMode];
  const activeInfo = GAME_MODES[gameMode];

  const handleQuickCreate = async (mode: GameMode, openRulesModal = false) => {
    setGameMode(mode);
    if (mode === 'exploding_kittens' && openRulesModal) {
      setSettingsOpen(true);
      return;
    }
    const base = getSavedRoomRules();
    await onCreate(
      {
        ...base,
        maxPlayers:
          mode === 'tien_len'
            ? 4
            : mode === 'total_war'
              ? TW_MAX_PLAYERS
              : mode === 'bansung'
              ? Math.max(4, Math.min(10, GAME_MODES.bansung.maxPlayers))
              : mode === 'blackjack_21' || mode === 'ant_empire' || mode === 'thap_hung' || mode === 'exploding_kittens' || mode === 'link_duel' || mode === 'loto'
                ? GAME_MODES[mode].maxPlayers
                : 6,
      },
      mode,
    );
  };

  return (
    <div className="hub-screen">
      <Backdrop3D accentColor={activeMeta.accent} />

      <div className="hub-shell">
        <header className="hub-header">
          <div className="hub-brand-block">
            <span className="hub-eyebrow">
              <Sparkles size={13} /> 9 Trò Chơi Online · Chơi Chung Mọi Thiết Bị
            </span>
            <h1 className="hub-title">
              Arena <span>Hub</span>
            </h1>
          </div>

          <form
            className="hub-join-bar"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) onJoin(code);
            }}
          >
            <input
              className="hub-code-input"
              maxLength={4}
              placeholder="Mã phòng (ABCD)"
              aria-label="Mã phòng 4 chữ"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            />
            <button className={ready ? 'primary' : 'secondary'} disabled={!ready}>
              Vào <ArrowRight size={15} />
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!ready}
              onClick={() => onWatch(code)}
              title="Vào làm khán giả"
            >
              <Eye size={15} /> Xem
            </button>
          </form>
        </header>

        <section className="hub-cards-grid" aria-label="Danh sách trò chơi">
          {HUB_GAME_ORDER.map((m) => (
            <GameCard3D
              key={m}
              mode={m}
              active={gameMode === m}
              onSelect={() => setGameMode(m)}
              onLaunch={() => void handleQuickCreate(m)}
            />
          ))}
        </section>

        <footer className="hub-launch-bar" style={{ '--bar-accent': activeMeta.accent } as CSSProperties}>
          <div className="hub-launch-info">
            <span className="hub-launch-dot" />
            <div>
              <strong>{activeMeta.title}</strong>
              <span className="muted small">
                {activeMeta.tag} · {activeInfo.minPlayers}–{activeInfo.maxPlayers} người · {activeMeta.blurb}
              </span>
            </div>
          </div>

          <div className="hub-launch-actions">
            {gameMode === 'exploding_kittens' && (
              <button type="button" className="secondary" onClick={() => setSettingsOpen(true)}>
                <Sliders size={15} /> Chỉnh luật
              </button>
            )}
            <button type="button" className="primary big" onClick={() => void handleQuickCreate(gameMode)}>
              <Plus size={18} /> Tạo phòng {activeMeta.title}
            </button>
          </div>
        </footer>
      </div>

      {settingsOpen && (
        <RoomSettings
          initialRules={getSavedRoomRules()}
          onClose={() => setSettingsOpen(false)}
          onConfirm={async (rules) => {
            await onCreate(rules, 'exploding_kittens');
            setSettingsOpen(false);
          }}
        />
      )}
    </div>
  );
}
