import { useState } from 'react';
import Landing from './Hero';

export default function Login({ initialName, onSubmit }: { initialName: string; onSubmit: (name: string) => void }) {
  const [name, setName] = useState(initialName);
  return (
    <Landing>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name);
        }}
      >
        <h2>Bạn tên gì?</h2>
        <p className="muted">Tên được lưu trên trình duyệt này, lần sau vào thẳng luôn.</p>
        <input autoFocus maxLength={20} placeholder="Nhập tên của bạn" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary big" disabled={!name.trim()}>
          Vào chơi
        </button>
      </form>
    </Landing>
  );
}
