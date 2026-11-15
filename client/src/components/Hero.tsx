import { useRef, type PointerEvent, type ReactNode } from 'react';
import { Gamepad2, KeyRound, Smartphone, Users } from 'lucide-react';
import Backdrop3D from './Backdrop3D';
import CardView from './CardView';

/** Bố cục màn đăng nhập: bên trái trình diễn 3D + tên Arena Hub, bên phải là form */
export default function Landing({ children }: { children: ReactNode }) {
  const heroRef = useRef<HTMLDivElement>(null);

  const onHeroMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = heroRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
    const ny = (e.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
    el.style.setProperty('--hx', `${(-ny * 14).toFixed(2)}deg`);
    el.style.setProperty('--hy', `${(nx * 18).toFixed(2)}deg`);
  };

  const onHeroLeave = () => {
    const el = heroRef.current;
    if (!el) return;
    el.style.setProperty('--hx', '0deg');
    el.style.setProperty('--hy', '0deg');
  };

  return (
    <div className="landing-wrap">
      <Backdrop3D />
      <div className="landing">
        <div className="landing-hero">
          <div
            ref={heroRef}
            className="hero hero-3d"
            aria-hidden="true"
            onPointerMove={onHeroMove}
            onPointerLeave={onHeroLeave}
          >
            <CardView type="defuse" size="xl" className="hero-card left" preview={false} />
            <CardView type="nope" size="xl" className="hero-card right" preview={false} />
            <CardView type="exploding" size="xl" className="hero-card mid" preview={false} />
          </div>
          <span className="hub-eyebrow">
            <Gamepad2 size={14} /> 8 Trò Chơi Co-op &amp; Đối Kháng
          </span>
          <h1 className="landing-title">
            Arena <span>Hub</span>
          </h1>
          <p className="landing-sub">Bắn súng Co-op, chiến thuật 10 người &amp; game bài trực tuyến trên trình duyệt.</p>
          <div className="landing-chips">
            <span>
              <Users size={15} /> 1–10 người
            </span>
            <span>
              <KeyRound size={15} /> Tên + PIN gọn nhẹ
            </span>
            <span>
              <Smartphone size={15} /> PC &amp; Điện thoại
            </span>
          </div>
        </div>
        <div className="landing-panel">{children}</div>
      </div>
    </div>
  );
}
