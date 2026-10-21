import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { sfx } from '../sfx';
import { hidePreview } from './cardPreviewStore';

interface Props {
  title: ReactNode;
  children: ReactNode;
  /** Có thì hiện nút đóng ở góc. Bấm ra ngoài KHÔNG đóng, chỉ rung nhẹ để nhắc bấm nút. */
  onClose?: () => void;
  width?: number;
}

export default function Modal({ title, children, onClose, width = 440 }: Props) {
  const [nudge, setNudge] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hidePreview();
    document.body.classList.add('no-scroll');
    return () => {
      if (document.querySelectorAll('.modal').length <= 1) {
        document.body.classList.remove('no-scroll');
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const modals = document.querySelectorAll('.modal');
      if (modals.length > 0 && modals[modals.length - 1] !== modalRef.current) return;
      e.stopPropagation();
      if (onClose) {
        onClose();
      } else {
        sfx('deny');
        setNudge(true);
        window.setTimeout(() => setNudge(false), 420);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      ref={modalRef}
      className="modal"
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        sfx('deny');
        setNudge(true);
        window.setTimeout(() => setNudge(false), 420);
      }}
    >
      <div className={`panel modal-panel${nudge ? ' nudge' : ''}`} style={{ width: `min(${width}px, 100%)` }} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && (
            <button className="icon-btn close-x" onClick={onClose} aria-label="Đóng">
              <X size={18} />
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
