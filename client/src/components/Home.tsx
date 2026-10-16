import { useState } from 'react';
import Landing from './Hero';

export default function Home({ onCreate, onJoin }: { onCreate: () => void; onJoin: (code: string) => void }) {
  const [code, setCode] = useState('');
  const ready = code.trim().length === 4;
  return (
    <Landing>
      <div className="panel">
        <div className="panel-block">
          <h2>Tạo phòng mới</h2>
          <p className="muted">Bạn làm chủ phòng, gửi mã cho 1–9 người nữa.</p>
          <button className="primary big" onClick={onCreate}>
            ＋ Tạo phòng
          </button>
        </div>
        <div className="divider">
          <span>hoặc</span>
        </div>
        <form
          className="panel-block"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) onJoin(code);
          }}
        >
          <h2>Vào phòng có sẵn</h2>
          <p className="muted">Nhập mã 4 chữ chủ phòng gửi cho bạn.</p>
          <div className="join-row">
            <input
              className="code-input"
              maxLength={4}
              placeholder="VD: ABCD"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            />
            <button className={ready ? 'primary big' : 'secondary big'} disabled={!ready}>
              Vào →
            </button>
          </div>
        </form>
      </div>
    </Landing>
  );
}
