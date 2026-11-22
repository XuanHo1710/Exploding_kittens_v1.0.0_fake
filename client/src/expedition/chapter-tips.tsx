/**
 * Bảng "Chương mới — Kỹ năng mới": hiện ngay sau khi hạ Đại Trùm lần đầu (hoàn thành một chương),
 * giới thiệu cơ chế sẽ gặp ở vùng kế tiếp và cách xử lý. Bấm Enter / Space / chuột để đóng.
 */

import { useEffect } from 'react';
import { EXPEDITION_REALMS } from './shared';
import './reward-fx.css';

interface ChapterTip { title: string; lines: { icon: string; head: string; text: string }[] }

/** Theo thứ tự vùng sắp mở (2 = sau chương I …). */
export const CHAPTER_TIPS: Record<number, ChapterTip> = {
  2: {
    title: 'Quái biết đổi đòn',
    lines: [
      { icon: '⚔', head: 'Mỗi quái có 3 đòn', text: 'Đòn đặc trưng 50% · đòn thứ hai 30% · đòn hiểm 20%. Một đòn không ra quá 2 lượt liền.' },
      { icon: '👁', head: 'Đọc tên đòn', text: 'Bảng cảnh báo ghi tên đòn và gợi ý nhịp: liên kích dồn dập, nhảy bổ trễ nhịp, đòn nhử…' },
      { icon: '⛨', head: 'Đỡ hẹp – Né rộng', text: 'Đỡ ±130 ms (lệch ≤55 ms = Đỡ hoàn hảo), Né ±200 ms. Bấm hụt bị khoá 0,3 giây.' },
    ],
  },
  3: {
    title: 'TUYỆT KỸ & phím W',
    lines: [
      { icon: '☠', head: 'Quái có Tuyệt Kỹ', text: 'Từ vùng III, quái có thể tung Tuyệt Kỹ: màn hình chuyển xám đen, tên chiêu hiện đỏ.' },
      { icon: 'W', head: 'W để counter', text: 'Đỡ / Né vô dụng với nhịp Tuyệt Kỹ. Bấm W đúng lúc vòng sáng khép lại để PHẢN ĐÒN.' },
      { icon: '✦', head: 'Phản damage', text: 'Counter thành công: không mất máu, +2 AP và PHẢN DAMAGE — trả ngược sát thương của Tuyệt Kỹ lên chính con quái.' },
      { icon: '♛', head: 'Trùm đánh combo', text: 'Đại Trùm cứ mỗi đòn thứ hai đánh chuỗi thường rồi CHỐT bằng Tuyệt Kỹ — Đỡ/Né các nhịp đầu, W ở nhịp cuối.' },
    ],
  },
  4: {
    title: 'Phản damage',
    lines: [
      { icon: '☄', head: 'Tuyệt Kỹ đánh toàn đội', text: 'Quái có thể tung Tuyệt Kỹ diện rộng nện cả đội cùng lúc — màn hình tối lại, bảng ghi "ĐÁNH TOÀN ĐỘI".' },
      { icon: 'W', head: 'Cả đội phản damage', text: 'Counter đúng nhịp bằng W: mọi thành viên đều né trọn và CÙNG PHẢN DAMAGE lên con quái — cú đánh càng mạnh, phản càng đau.' },
      { icon: '♛', head: 'Trùm ưa đánh toàn đội', text: 'Đại Trùm chốt combo bằng Tuyệt Kỹ toàn đội thường xuyên hơn quái thường: luôn giữ tay trên W.' },
    ],
  },
  5: {
    title: 'Giữ nhịp trong hỗn chiến',
    lines: [
      { icon: '♪', head: 'Đòn nhịp lệch', text: 'Quái vùng sâu trộn nhịp nhanh – khựng – chậm. Nhìn tia lóe trên đầu quái thay vì đếm nhịp.' },
      { icon: '🔥', head: 'Nghỉ lửa trại', text: 'Nghỉ (E) hồi đủ vật phẩm trận nhưng hồi sinh mọi quái (trừ Trùm) — chọn chỗ nghỉ hợp lý.' },
    ],
  },
  6: {
    title: 'Màn Đêm khắc nghiệt',
    lines: [
      { icon: '☾', head: 'Tuyệt Kỹ dày hơn', text: 'Trùm vùng cuối xen Tuyệt Kỹ liên tục: luôn để tay trên W khi màn hình tối lại.' },
      { icon: '✚', head: 'Chuẩn bị đội hình', text: 'Mang theo người hồi máu và Bùa tăng phòng thủ trước khi vào Cực Quang.' },
    ],
  },
  7: {
    title: 'Trận chiến Cực Quang',
    lines: [
      { icon: '✧', head: 'Vùng cuối', text: 'Lãnh nguyên Bắc Cực rộng lớn: 3 trạm lửa trại, 7 bãi quái và ngai vàng Vĩnh Dạ ở cuối biển băng.' },
      { icon: 'W', head: 'Tất cả kỹ năng', text: 'Đỡ, Né, W counter phản damage — trận cuối đòi hỏi dùng đủ mọi thứ đã học.' },
    ],
  },
};

export function ChapterTipModal({ order, onClose }: { order: number; onClose: () => void }) {
  const tip = CHAPTER_TIPS[order];
  const realm = EXPEDITION_REALMS.find((r) => r.order === order);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  if (!tip) return null;
  return (
    <div className="ct-root" role="dialog" aria-modal="true" aria-label={tip.title} onClick={onClose}>
      <div className="ct-card" onClick={(e) => e.stopPropagation()}>
        <small className="ct-kicker">Chương {order - 1} hoàn thành · Mở khoá {realm?.nameVi ?? `Vùng ${order}`}</small>
        <h2>Kỹ năng mới: {tip.title}</h2>
        <ul>
          {tip.lines.map((l, i) => (
            <li key={l.head} style={{ animationDelay: `${200 + i * 160}ms` }}>
              <i aria-hidden="true">{l.icon}</i>
              <div><b>{l.head}</b><span>{l.text}</span></div>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onClose}>Đã hiểu <kbd>Enter</kbd></button>
      </div>
    </div>
  );
}
