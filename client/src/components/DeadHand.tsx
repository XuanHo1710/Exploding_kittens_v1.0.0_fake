import { useState, type CSSProperties } from 'react';
import { Eye, Skull } from 'lucide-react';
import { CARD_INFO, type Card, type PublicPlayer } from '../../../shared/src';
import { cardImage } from '../cardImages';
import CardView from './CardView';
import Modal from './Modal';

const MAX_THUMBS = 5;

function Thumb({ card, k }: { card: Card; k: number }) {
  const [err, setErr] = useState(false);
  const info = CARD_INFO[card.type];
  return (
    <span className="dead-thumb" style={{ ['--k' as string]: k, ['--c' as string]: info.color } as CSSProperties}>
      {err ? <span className="dead-thumb-emoji">{info.emoji}</span> : <img src={cardImage(card.type, card.id)} alt={info.name} draggable={false} onError={() => setErr(true)} />}
    </span>
  );
}

/** Dưới ghế người đã nổ: xấp bài lật ngửa, bấm để xem to */
export function DeadHandFan({ player, onOpen }: { player: PublicPlayer; onOpen: () => void }) {
  const cards = player.revealed ?? [];
  if (!cards.length) return null;
  const shown = cards.slice(0, MAX_THUMBS);
  return (
    <button
      type="button"
      className="dead-hand"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={`Xem bài của ${player.name}: ${cards.map((c) => CARD_INFO[c.type].name).join(', ')}`}
      aria-label={`Xem ${cards.length} lá bài của ${player.name}`}
    >
      <span className="dead-thumbs">
        {shown.map((c, k) => <Thumb key={c.id} card={c} k={k} />)}
      </span>
      {cards.length > MAX_THUMBS && <span className="dead-more">+{cards.length - MAX_THUMBS}</span>}
    </button>
  );
}

/** Hộp xem đủ bài của người đã nổ */
export function DeadHandModal({ player, onClose }: { player: PublicPlayer; onClose: () => void }) {
  const cards = player.revealed ?? [];
  return (
    <Modal
      title={<span className="modal-title-icon"><Skull size={19} /> Bài của {player.name} ({player.left ? 'đã rời' : 'đã nổ'})</span>}
      width={760}
      onClose={onClose}
    >
      <p className="muted">
        <Eye size={14} className="inline-icon" /> Người đã nổ phải lật ngửa bài cho cả bàn xem. {cards.length ? `${cards.length} lá:` : 'Không còn lá nào.'}
      </p>
      <div className="give-grid dead-grid">
        {cards.map((c) => (
          <div key={c.id} className="wiz-card">
            <CardView type={c.type} seed={c.id} size="md" />
            <span>{CARD_INFO[c.type].name}</span>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="primary" onClick={onClose}>Đóng</button>
      </div>
    </Modal>
  );
}
