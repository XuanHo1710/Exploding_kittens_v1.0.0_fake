import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bomb, CheckCircle2, Clock, Layers, RotateCcw, ShieldCheck, Sliders, Users } from 'lucide-react';
import {
  CARD_INFO, DEFAULT_ROOM_RULES, RULE_PRESETS, RULE_LIMITS, normalizeRoomRules, roomDeckSummary, ruleSummary,
  type DeckCardType, type RoomRules,
} from '../../../shared/src';
import { CardIcon } from './icons';
import Modal from './Modal';

const SAVED_RULES_KEY = 'meono.room-rules.v1';

export function getSavedRoomRules(): RoomRules {
  try {
    const saved = localStorage.getItem(SAVED_RULES_KEY);
    return saved ? normalizeRoomRules(JSON.parse(saved)) : normalizeRoomRules(DEFAULT_ROOM_RULES);
  } catch {
    return normalizeRoomRules(DEFAULT_ROOM_RULES);
  }
}

function sameRules(a: RoomRules, b: RoomRules) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function NumberSetting({ label, value, min, max, onChange, hint }: {
  label: ReactNode; value: number; min: number; max: number; onChange: (value: number) => void; hint?: string;
}) {
  const id = useId();
  return (
    <label className="rule-field" htmlFor={id}>
      <span className="rule-field-label">{label}</span>
      <input id={id} type="number" inputMode="numeric" min={min} max={max} step={1} value={value}
        onChange={(event) => onChange(Number(event.target.value))} />
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

function RuleToggle({ label, checked, onChange, hint }: {
  label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: string;
}) {
  return (
    <label className="rule-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span><strong>{label}</strong>{hint && <small className="muted">{hint}</small>}</span>
    </label>
  );
}

export function RoomRuleSummary({ rules, playerCount }: { rules: RoomRules; playerCount: number }) {
  const summary = roomDeckSummary(rules, Math.max(2, playerCount));
  return (
    <div className="room-rule-summary">
      <div className="rule-facts">
        <span><Users size={14} className="inline-icon" /> Tối đa <strong>{rules.maxPlayers}</strong> người</span>
        <span><Layers size={14} className="inline-icon" /> <strong>{rules.handSize + rules.defusesPerPlayer}</strong> lá/người lúc đầu</span>
        <span><Clock size={14} className="inline-icon" /> <strong>{rules.turnSeconds}</strong> giây/lượt</span>
      </div>
      <ul className="rule-summary-list">{ruleSummary(rules).map((line, index) => <li key={index}>{line}</li>)}</ul>
      <details className="rule-section rule-deck-list">
        <summary>Thành phần bộ bài · {summary.totalCards} lá với {Math.max(2, playerCount)} người</summary>
        <div className="rule-card-counts">
          <span><span className="icon-label"><Bomb size={13} /> Mèo Nổ</span> <strong>{summary.bombs}</strong></span>
          <span><span className="icon-label"><ShieldCheck size={13} /> Gỡ Bom</span> <strong>{summary.defuses}</strong></span>
          {(Object.entries(rules.cardCounts) as [DeckCardType, number][]).map(([type, count]) => (
            <span key={type}><span className="icon-label"><CardIcon type={type} size={13} /> {CARD_INFO[type].name}</span> <strong>{count}</strong></span>
          ))}
        </div>
      </details>
      {!summary.canStart && <div className="rule-warning" role="status">{summary.errors.map((error) => <p key={error}>{error}</p>)}</div>}
    </div>
  );
}

interface Props {
  initialRules?: RoomRules;
  title?: string;
  confirmLabel?: string;
  minPlayers?: number;
  onConfirm: (rules: RoomRules) => void | Promise<void>;
  onClose: () => void;
}

export default function RoomSettings({ initialRules, title = 'Luật & bộ bài của phòng', confirmLabel = 'Tạo phòng với luật này', minPlayers = 2, onConfirm, onClose }: Props) {
  const [draft, setDraft] = useState<RoomRules>(() => normalizeRoomRules(initialRules ?? getSavedRoomRules()));
  const [previewPlayers, setPreviewPlayers] = useState(Math.max(2, minPlayers));
  const [remember, setRemember] = useState(true);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const savingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fieldPrefix = useId();
  const validated = useMemo(() => {
    try { return { rules: normalizeRoomRules(draft), error: '' }; }
    catch (error) { return { rules: null, error: error instanceof Error ? error.message : 'Luật chưa hợp lệ.' }; }
  }, [draft]);
  const preview = validated.rules ? roomDeckSummary(validated.rules, previewPlayers) : null;
  const occupancyError = draft.maxPlayers < minPlayers ? `Phòng đã có ${minPlayers} người; số chỗ tối đa không thể thấp hơn.` : '';
  const canConfirm = !!validated.rules && !!preview?.canStart && !occupancyError;
  const selectedPreset = RULE_PRESETS.find((preset) => sameRules(draft, preset.rules));

  useEffect(() => {
    formRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);

  useEffect(() => {
    if (draft.maxPlayers >= 2) setPreviewPlayers((current) => Math.max(2, minPlayers, Math.min(current, draft.maxPlayers)));
  }, [draft.maxPlayers, minPlayers]);

  function change<K extends keyof RoomRules>(key: K, value: RoomRules[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSubmitError('');
  }

  async function submit() {
    if (savingRef.current || !canConfirm || !validated.rules) return;
    savingRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      await onConfirm(validated.rules);
      if (remember) {
        try { localStorage.setItem(SAVED_RULES_KEY, JSON.stringify(validated.rules)); }
        catch { /* Chế độ riêng tư vẫn có thể tạo phòng. */ }
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Chưa thể lưu luật. Vui lòng thử lại.');
    } finally {
      savingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Modal title={<span className="modal-title-icon"><Sliders size={18} /> {title}</span>} onClose={submitting ? undefined : onClose} width={760}>
      <form ref={formRef} className="room-settings" aria-busy={submitting} onSubmit={(event) => { event.preventDefault(); void submit(); }}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); if (!submitting) onClose(); } }}>
        <fieldset className="rule-editor-fields" disabled={submitting}>
        <p className="muted">Chốt luật ngay từ đầu. Mọi người xem cùng một bộ luật và xác nhận trước khi bắt đầu.</p>
        <div className="rule-presets" role="group" aria-label="Chọn bộ luật mẫu">
          {RULE_PRESETS.map((preset) => (
            <button type="button" key={preset.id} className={`rule-preset${selectedPreset?.id === preset.id ? ' selected' : ''}`}
              aria-pressed={selectedPreset?.id === preset.id} onClick={() => { setDraft(normalizeRoomRules(preset.rules)); setSubmitError(''); }}>
              <strong>{preset.name}</strong><small>{preset.description}</small>
            </button>
          ))}
        </div>
        <div className="rule-custom-label">
          <Sliders size={14} className="inline-icon" /> {selectedPreset ? `Đang dùng: ${selectedPreset.name}` : 'Luật tùy chỉnh của bạn'}
        </div>

        <details className="rule-section" open>
          <summary>Người chơi & chia bài</summary>
          <div className="rule-fields">
            <NumberSetting label="Số người tối đa" value={draft.maxPlayers} min={Math.max(RULE_LIMITS.maxPlayers[0], minPlayers)} max={RULE_LIMITS.maxPlayers[1]} onChange={(value) => change('maxPlayers', value)} />
            <NumberSetting label="Bài thường mỗi người" value={draft.handSize} min={RULE_LIMITS.handSize[0]} max={RULE_LIMITS.handSize[1]} onChange={(value) => change('handSize', value)} hint="Chưa tính Gỡ Bom được phát riêng." />
            <NumberSetting label="Gỡ Bom mỗi người" value={draft.defusesPerPlayer} min={RULE_LIMITS.defusesPerPlayer[0]} max={RULE_LIMITS.defusesPerPlayer[1]} onChange={(value) => change('defusesPerPlayer', value)} />
            <NumberSetting label="Gỡ Bom thêm vào chồng rút" value={draft.extraDefuses} min={RULE_LIMITS.extraDefuses[0]} max={RULE_LIMITS.extraDefuses[1]} onChange={(value) => change('extraDefuses', value)} />
            <label className="rule-field" htmlFor={`${fieldPrefix}-bombs`}><span>Số Mèo Nổ</span>
              <select id={`${fieldPrefix}-bombs`} value={draft.bombMode} onChange={(event) => change('bombMode', event.target.value as RoomRules['bombMode'])}>
                <option value="players_minus_one">Số người − 1</option><option value="players">Bằng số người</option><option value="fixed">Số lượng cố định</option>
              </select>
            </label>
            {draft.bombMode === 'fixed' && <NumberSetting label="Mèo Nổ cố định" value={draft.fixedBombs} min={RULE_LIMITS.fixedBombs[0]} max={RULE_LIMITS.fixedBombs[1]} onChange={(value) => change('fixedBombs', value)} />}
            <label className="rule-field" htmlFor={`${fieldPrefix}-first`}><span>Người đi đầu</span>
              <select id={`${fieldPrefix}-first`} value={draft.firstPlayer} onChange={(event) => change('firstPlayer', event.target.value as RoomRules['firstPlayer'])}>
                <option value="random">Chọn ngẫu nhiên</option><option value="host">Chủ phòng</option>
              </select>
            </label>
          </div>
          <p className="muted small rule-help">Mèo Nổ được thêm sau khi chia bài, nên không ai nhận bom ngay từ tay bài đầu.</p>
        </details>

        <details className="rule-section">
          <summary>Tùy chỉnh số lượng từng loại bài</summary>
          <p className="muted small rule-help">Đặt 0 để tắt một loại bài. Đây là tổng số lá trước khi chia cho người chơi.</p>
          <div className="rule-card-inputs">
            {(Object.entries(draft.cardCounts) as [DeckCardType, number][]).map(([type, count]) => (
              <NumberSetting
                key={type}
                label={<span className="icon-label"><CardIcon type={type} size={14} /> {CARD_INFO[type].name}</span>}
                value={count}
                min={RULE_LIMITS.cardCount[0]}
                max={RULE_LIMITS.cardCount[1]}
                onChange={(value) => change('cardCounts', { ...draft.cardCounts, [type]: value })}
              />
            ))}
          </div>
          <button type="button" className="ghost rule-reset" onClick={() => change('cardCounts', { ...DEFAULT_ROOM_RULES.cardCounts })}>
            <RotateCcw size={13} className="inline-icon" /> Khôi phục số lượng bài mặc định
          </button>
        </details>

        <details className="rule-section">
          <summary>Combo & hiệu ứng bài</summary>
          <div className="rule-toggles">
            <RuleToggle label="Combo 2 lá cùng loại" checked={draft.allowPair} onChange={(value) => change('allowPair', value)} hint="Cướp ngẫu nhiên 1 lá của người được chọn." />
            <RuleToggle label="Combo 3 lá cùng loại" checked={draft.allowTriple} onChange={(value) => change('allowTriple', value)} hint="Gọi tên loại bài muốn lấy; không có thì mất combo." />
            <RuleToggle label="Combo 5 lá khác loại" checked={draft.allowFive} onChange={(value) => change('allowFive', value)} hint="Lấy 1 lá tự chọn từ chồng bài bỏ trước combo." />
            <RuleToggle label="Cho phép Nope chặn Nope" checked={draft.nopeChain} onChange={(value) => change('nopeChain', value)} hint="Tắt để mỗi hành động chỉ nhận tối đa 1 Nope." />
          </div>
          <div className="rule-fields">
            <label className="rule-field" htmlFor={`${fieldPrefix}-combo`}><span>Loại bài dùng cho combo 2 / 3</span>
              <select id={`${fieldPrefix}-combo`} value={draft.comboScope} onChange={(event) => change('comboScope', event.target.value as RoomRules['comboScope'])}>
                <option value="cats">Chỉ các lá mèo thường</option><option value="any">Mọi loại bài cùng tên</option>
              </select>
            </label>
            <label className="rule-field" htmlFor={`${fieldPrefix}-attack`}><span>Tấn Công liên tiếp</span>
              <select id={`${fieldPrefix}-attack`} value={draft.attackMode} onChange={(event) => change('attackMode', event.target.value as RoomRules['attackMode'])}>
                <option value="stack">Cộng dồn lượt đang nợ + 2</option><option value="replace">Thay bằng 2 lượt</option>
              </select>
            </label>
            <NumberSetting label="Số lá khi dùng Xem Trước" value={draft.futureCount} min={RULE_LIMITS.futureCount[0]} max={RULE_LIMITS.futureCount[1]} onChange={(value) => change('futureCount', value)} />
            <label className="rule-field" htmlFor={`${fieldPrefix}-place`}><span>Đặt lại Mèo Nổ sau khi gỡ</span>
              <select id={`${fieldPrefix}-place`} value={draft.bombPlacement} onChange={(event) => change('bombPlacement', event.target.value as RoomRules['bombPlacement'])}>
                <option value="choose">Người gỡ tự chọn vị trí</option><option value="random">Server đặt ngẫu nhiên</option>
              </select>
            </label>
          </div>
        </details>

        <details className="rule-section">
          <summary>Thời gian mỗi hành động</summary>
          <div className="rule-fields">
            <NumberSetting label="Một lượt chơi (giây)" value={draft.turnSeconds} min={RULE_LIMITS.turnSeconds[0]} max={RULE_LIMITS.turnSeconds[1]} onChange={(value) => change('turnSeconds', value)} />
            <NumberSetting label="Cửa sổ đánh Nope (giây)" value={draft.nopeSeconds} min={RULE_LIMITS.nopeSeconds[0]} max={RULE_LIMITS.nopeSeconds[1]} onChange={(value) => change('nopeSeconds', value)} />
            <NumberSetting label="Đưa bài / đặt bom (giây)" value={draft.promptSeconds} min={RULE_LIMITS.promptSeconds[0]} max={RULE_LIMITS.promptSeconds[1]} onChange={(value) => change('promptSeconds', value)} />
          </div>
        </details>

        <div className="rule-preview" aria-live="polite">
          <div className="rule-preview-head"><strong>Kiểm tra bộ bài</strong>
            <label htmlFor={`${fieldPrefix}-players`}>Với <select id={`${fieldPrefix}-players`} value={previewPlayers} onChange={(event) => setPreviewPlayers(Number(event.target.value))}>
              {Array.from({ length: Math.max(1, Math.min(10, draft.maxPlayers) - Math.max(2, minPlayers) + 1) }, (_, index) => Math.max(2, minPlayers) + index).map((count) => <option key={count} value={count}>{count} người</option>)}
            </select></label>
          </div>
          {preview && <div className="rule-preview-stats"><span><strong>{preview.totalCards}</strong> tổng lá</span><span><strong>{preview.dealtCards}</strong> lá đã chia</span><span><strong>{preview.drawPileCards}</strong> lá trong chồng rút</span><span><Bomb size={13} className="inline-icon" /> <strong>{preview.bombs}</strong> Mèo Nổ</span></div>}
          {validated.error && <p className="bad-text">{validated.error}</p>}
          {occupancyError && <p className="bad-text">{occupancyError}</p>}
          {preview && !preview.canStart && <div className="rule-warning">{preview.errors.map((error) => <p key={error}>{error}</p>)}</div>}
          {preview?.canStart && !occupancyError && <p className="rule-valid"><CheckCircle2 size={14} className="inline-icon" /> Đủ bài để bắt đầu với {previewPlayers} người.</p>}
        </div>
        <RuleToggle label="Nhớ luật này cho lần tạo phòng tiếp theo" checked={remember} onChange={setRemember} />
        {submitError && <p className="bad-text" role="alert">{submitError}</p>}
        <div className="modal-actions rule-editor-actions"><button type="button" className="ghost" onClick={onClose}>Hủy</button><button type="submit" className="primary" disabled={!canConfirm || submitting}>{submitting ? 'Đang lưu…' : confirmLabel}</button></div>
        </fieldset>
      </form>
    </Modal>
  );
}
