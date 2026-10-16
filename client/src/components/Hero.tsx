import type { ReactNode } from 'react';
import CardView from './CardView';

/** Bố cục màn chào: bên trái quạt bài + tên game, bên phải là khung thao tác */
export default function Landing({ children }: { children: ReactNode }) {
  return (
    <div className="landing">
      <div className="landing-hero">
        <div className="hero" aria-hidden="true">
          <CardView type="defuse" size="xl" className="hero-card left" preview={false} />
          <CardView type="nope" size="xl" className="hero-card right" preview={false} />
          <CardView type="exploding" size="xl" className="hero-card mid" preview={false} />
        </div>
        <h1 className="landing-title">
          Mèo <span>Nổ</span>
        </h1>
        <p className="landing-sub">Rút bài, né bom, Nope bạn bè. Chơi ngay trên trình duyệt.</p>
        <div className="landing-chips">
          <span>👥 2–10 người</span>
          <span>⚡ Không cần đăng ký</span>
          <span>📱 Chơi được trên điện thoại</span>
        </div>
      </div>
      <div className="landing-panel">{children}</div>
    </div>
  );
}
