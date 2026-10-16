import { useEffect, useState, type ReactNode } from 'react';
import { sfx } from '../sfx';
import { hidePreview } from './CardPreview';

interface Props {
  title: ReactNode;
  children: ReactNode;
  /** Có thì hiện nút ✕ ở góc. Bấm ra ngoài KHÔNG đóng, chỉ rung nhẹ để nhắc bấm nút. */
  onClose?: () => void;
  width?: number;
}

export default function Modal({ title, children, onClose, width = 440 }: Props) {
  const [nudge, setNudge] = useState(false);

  useEffect(() => {
    hidePreview();
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, []);

  return (
    <div
      className="modal"
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        sfx('deny');
        setNudge(true);
        window.setTimeout(() => setNudge(false), 420);
      }}
    >
      <div className={`panel modal-panel${nudge ? ' nudge' : ''}`} style={{ width }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && (
            <button className="icon-btn close-x" onClick={onClose} aria-label="Đóng">
              ✕
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
