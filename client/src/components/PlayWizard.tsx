/**
 * Hộp thoại đánh bài cần chọn thêm:
 * - Xin Bài / Đôi mèo / Bộ ba: chọn người
 * - Bộ ba: gọi tên lá muốn đòi
 * - 5 lá khác loại: chọn lá trong chồng bài bỏ
 */
import { useState } from 'react';
import { CARD_INFO, DECK_COUNTS, type ActionKind, type Card, type CardType, type PublicPlayer } from '../../../shared/src';
import PlayerAvatar from '../art/PlayerAvatar';
import CardView from './CardView';
import Modal from './Modal';

export interface WizardResult {
  targetId?: string;
  namedType?: CardType;
  discardType?: CardType;
}

interface Props {
  kind: ActionKind;
  cards: Card[];
  targets: PublicPlayer[];
  discardTypes: CardType[];
  initialTarget?: string;
  /** Có ≥3 lá mèo giống nhau: cho đổi qua lại giữa đôi và bộ ba */
  comboSwitch?: (to: 'pair' | 'triple') => void;
  onCancel: () => void;
  onConfirm: (r: WizardResult) => void;
}

const TITLE: Partial<Record<ActionKind, string>> = {
  favor: '🙏 Xin Bài',
  pair: '🐱🐱 Đôi mèo',
  triple: '🐱🐱🐱 Bộ ba mèo',
  five: '🃏 5 lá khác loại',
};
const TARGET_HINT: Partial<Record<ActionKind, string>> = {
  favor: 'Người bạn chọn sẽ phải tự chọn 1 lá trên tay đưa cho bạn.',
  pair: 'Bạn sẽ rút ngẫu nhiên 1 lá trên tay người này.',
  triple: 'Chọn người, rồi gọi tên lá bạn muốn. Họ có lá đó thì phải đưa.',
};
const NAMEABLE = (Object.keys(CARD_INFO) as CardType[]).filter(
  (t) => t !== 'exploding' && (DECK_COUNTS[t as keyof typeof DECK_COUNTS] ?? 0) > 0,
);

export default function PlayWizard({ kind, cards, targets, discardTypes, initialTarget, comboSwitch, onCancel, onConfirm }: Props) {
  const needsTarget = kind === 'favor' || kind === 'pair' || kind === 'triple';
  const [targetId, setTargetId] = useState<string | undefined>(targets.some((t) => t.id === initialTarget) ? initialTarget : undefined);
  const [namedType, setNamedType] = useState<CardType | undefined>();
  const [discardType, setDiscardType] = useState<CardType | undefined>();

  const ready = (!needsTarget || !!targetId) && (kind !== 'triple' || !!namedType) && (kind !== 'five' || !!discardType);
  const target = targets.find((t) => t.id === targetId);

  let summary = '';
  if (kind === 'favor') summary = target ? `${target.name} sẽ chọn 1 lá đưa cho bạn` : 'Chọn người để xin bài';
  else if (kind === 'pair') summary = target ? `Rút ngẫu nhiên 1 lá của ${target.name}` : 'Chọn người để rút bài';
  else if (kind === 'triple')
    summary = !target ? 'Chọn người để đòi bài' : !namedType ? `Đòi ${target.name} lá gì?` : `Đòi ${target.name} đưa ${CARD_INFO[namedType].name}`;
  else if (kind === 'five') summary = discardType ? `Lấy ${CARD_INFO[discardType].name} từ chồng bài bỏ` : 'Chọn lá muốn lấy từ chồng bài bỏ';

  return (
    <Modal title={TITLE[kind] ?? 'Đánh bài'} width={kind === 'five' || kind === 'triple' ? 720 : 560}>
      <div className="wiz-cards">
        <span className="muted small">Bạn đánh:</span>
        {cards.map((c) => (
          <CardView key={c.id} type={c.type} seed={c.id} size="xs" />
        ))}
      </div>

      {comboSwitch && (
        <div className="seg">
          <button className={kind === 'pair' ? 'on' : ''} onClick={() => comboSwitch('pair')}>
            🐱🐱 Đôi: cướp ngẫu nhiên
          </button>
          <button className={kind === 'triple' ? 'on' : ''} onClick={() => comboSwitch('triple')}>
            🐱🐱🐱 Bộ ba: đòi đúng lá
          </button>
        </div>
      )}

      {needsTarget && (
        <section className="wiz-step">
          <h3>
            <span className="step-no">1</span> Chọn người
          </h3>
          <p className="muted small">{TARGET_HINT[kind]}</p>
          {targets.length ? (
            <div className="wiz-targets">
              {targets.map((t) => (
                <button key={t.id} className={`wiz-target${t.id === targetId ? ' on' : ''}`} onClick={() => setTargetId(t.id)}>
                  <PlayerAvatar id={t.id} avatar={t.avatar} size={56} />
                  <span className="wiz-name">{t.name}</span>
                  <span className="muted small">{t.handCount} lá</span>
                  {t.id === targetId && <span className="wiz-check">✓</span>}
                </button>
              ))}
            </div>
          ) : (
            <p className="bad-text">Không còn ai có bài để chọn.</p>
          )}
        </section>
      )}

      {kind === 'triple' && (
        <section className={`wiz-step${targetId ? '' : ' dim'}`}>
          <h3>
            <span className="step-no">2</span> Gọi tên lá muốn đòi
          </h3>
          <div className="wiz-grid">
            {NAMEABLE.map((t) => (
              <button key={t} className={`wiz-card${t === namedType ? ' on' : ''}`} onClick={() => setNamedType(t)} disabled={!targetId}>
                <CardView type={t} size="sm" preview={false} />
                <span>{CARD_INFO[t].name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {kind === 'five' && (
        <section className="wiz-step">
          <h3>
            <span className="step-no">1</span> Chọn lá trong chồng bài bỏ
          </h3>
          {discardTypes.length ? (
            <div className="wiz-grid">
              {discardTypes.map((t) => (
                <button key={t} className={`wiz-card${t === discardType ? ' on' : ''}`} onClick={() => setDiscardType(t)}>
                  <CardView type={t} size="sm" preview={false} />
                  <span>{CARD_INFO[t].name}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="bad-text">Chồng bài bỏ chưa có lá nào lấy được.</p>
          )}
        </section>
      )}

      <div className="wiz-summary">{summary}</div>
      <p className="muted small">Sau khi đánh, mọi người có 4 giây để Nope.</p>
      <div className="modal-actions">
        <button className="ghost" onClick={onCancel}>
          Huỷ
        </button>
        <button className="primary big" disabled={!ready} onClick={() => onConfirm({ targetId, namedType, discardType })}>
          Đánh ra
        </button>
      </div>
    </Modal>
  );
}
