/**
 * Hộp thoại đánh bài cần chọn thêm:
 * - Xin Bài / Đôi mèo / Bộ ba: chọn người
 * - Bộ ba: gọi tên lá muốn đòi
 * - 5 lá khác loại: chọn lá trong chồng bài bỏ
 */
import { useState, type ReactNode } from 'react';
import { Cat, Check, Crosshair, HandHeart, Layers, Skull, Target } from 'lucide-react';
import { CARD_INFO, type ActionKind, type Card, type CardType, type DeckCardType, type PublicPlayer, type RoomRules } from '../../../shared/src';
import { useRoomRules } from '../roomRulesContext';
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
  rules?: RoomRules;
  /** Có ≥3 lá mèo giống nhau: cho đổi qua lại giữa đôi và bộ ba */
  comboSwitch?: (to: 'pair' | 'triple') => void;
  onCancel: () => void;
  onConfirm: (r: WizardResult) => void;
}

const TARGET_HINT: Partial<Record<ActionKind, string>> = {
  favor: 'Người bạn chọn sẽ phải tự chọn 1 lá trên tay đưa cho bạn.',
  targeted_attack: 'Người bạn chọn sẽ lập tức phải chơi 2 lượt (hoặc cộng dồn lượt bạn đang nợ).',
  mark: 'Bạn sẽ đánh dấu và bí mật soi 1 lá ngẫu nhiên trên tay người này.',
  pair: 'Bạn sẽ rút ngẫu nhiên 1 lá trên tay người này.',
  triple: 'Chọn người, rồi gọi tên lá bạn muốn. Họ có lá đó thì phải đưa.',
};

export default function PlayWizard({ kind, cards, targets, discardTypes, initialTarget, rules: suppliedRules, comboSwitch, onCancel, onConfirm }: Props) {
  const contextRules = useRoomRules();
  const rules = suppliedRules ?? contextRules;
  const nameable = (Object.keys(CARD_INFO) as CardType[]).filter((type) =>
    type !== 'exploding' && (type === 'defuse' ? rules.defusesPerPlayer + rules.extraDefuses > 0 : rules.cardCounts[type as DeckCardType] > 0),
  );
  let title: ReactNode = 'Đánh bài';
  if (kind === 'favor') title = <span className="modal-title-icon"><HandHeart size={19} /> Xin Bài</span>;
  else if (kind === 'targeted_attack') title = <span className="modal-title-icon"><Crosshair size={19} /> Tấn Công Chỉ Định</span>;
  else if (kind === 'mark') title = <span className="modal-title-icon"><Target size={19} /> Đánh Dấu</span>;
  else if (kind === 'grave_robber') title = <span className="modal-title-icon"><Skull size={19} /> Trộm Mộ</span>;
  else if (kind === 'pair') title = <span className="modal-title-icon"><Cat size={19} /> Đôi{rules.comboScope === 'cats' ? ' mèo' : ''}</span>;
  else if (kind === 'triple') title = <span className="modal-title-icon"><Cat size={19} /> Bộ ba{rules.comboScope === 'cats' ? ' mèo' : ''}</span>;
  else if (kind === 'five') title = <span className="modal-title-icon"><Layers size={19} /> 5 lá khác loại</span>;

  const needsTarget = kind === 'favor' || kind === 'targeted_attack' || kind === 'mark' || kind === 'pair' || kind === 'triple';
  const needsDiscard = kind === 'five' || kind === 'grave_robber';
  const [targetId, setTargetId] = useState<string | undefined>(targets.some((t) => t.id === initialTarget) ? initialTarget : undefined);
  const [namedType, setNamedType] = useState<CardType | undefined>();
  const [discardType, setDiscardType] = useState<CardType | undefined>();

  const ready = (!needsTarget || !!targetId) && (kind !== 'triple' || !!namedType) && (!needsDiscard || !!discardType);
  const target = targets.find((t) => t.id === targetId);

  let summary = '';
  if (kind === 'favor') summary = target ? `${target.name} sẽ chọn 1 lá đưa cho bạn` : 'Chọn người để xin bài';
  else if (kind === 'targeted_attack') summary = target ? `Chỉ định ${target.name} phải chơi lượt kế tiếp` : 'Chọn người để tấn công chỉ định';
  else if (kind === 'mark') summary = target ? `Soi 1 lá ngẫu nhiên trên tay ${target.name}` : 'Chọn người để đánh dấu';
  else if (kind === 'pair') summary = target ? `Rút ngẫu nhiên 1 lá của ${target.name}` : 'Chọn người để rút bài';
  else if (kind === 'triple')
    summary = !target ? 'Chọn người để đòi bài' : !namedType ? `Đòi ${target.name} lá gì?` : `Đòi ${target.name} đưa ${CARD_INFO[namedType].name}`;
  else if (needsDiscard) summary = discardType ? `Lấy ${CARD_INFO[discardType].name} từ chồng bài bỏ` : 'Chọn lá muốn lấy từ chồng bài bỏ';

  return (
    <Modal title={title} width={needsDiscard || kind === 'triple' ? 720 : 560}>
      <div className="wiz-cards">
        <span className="muted small">Bạn đánh:</span>
        {cards.map((c) => (
          <CardView key={c.id} type={c.type} seed={c.id} size="xs" />
        ))}
      </div>

      {comboSwitch && (
        <div className="seg">
          <button className={kind === 'pair' ? 'on' : ''} disabled={!rules.allowPair} onClick={() => comboSwitch('pair')}>
            <Cat size={15} /> Đôi: cướp ngẫu nhiên
          </button>
          <button className={kind === 'triple' ? 'on' : ''} disabled={!rules.allowTriple} onClick={() => comboSwitch('triple')}>
            <Cat size={15} /> Bộ ba: đòi đúng lá
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
                  {t.id === targetId && (
                    <span className="wiz-check">
                      <Check size={14} strokeWidth={2.5} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="bad-text">Không còn ai phù hợp để chọn.</p>
          )}
        </section>
      )}

      {kind === 'triple' && (
        <section className={`wiz-step${targetId ? '' : ' dim'}`}>
          <h3>
            <span className="step-no">2</span> Gọi tên lá muốn đòi
          </h3>
          <div className="wiz-grid">
            {nameable.map((t) => (
              <button key={t} className={`wiz-card${t === namedType ? ' on' : ''}`} onClick={() => setNamedType(t)} disabled={!targetId}>
                <CardView type={t} size="sm" preview={false} />
                <span>{CARD_INFO[t].name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {needsDiscard && (
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
      <p className="muted small">Sau khi đánh, mọi người có {rules.nopeSeconds} giây để Nope. {rules.nopeChain ? 'Có thể Nope lại một lá Nope.' : 'Mỗi hành động chỉ được Nope một lần.'}</p>
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
