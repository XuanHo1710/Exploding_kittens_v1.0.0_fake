/**
 * Trùm Cuối – Đại Ma Vương Hỗn Nguyên: 4 Boss trước hợp thể thành 1 (canvas 2D, thiết kế riêng của game).
 *  - cánh trái: cánh màng tím của Hắc Long Hư Không · cánh phải: cánh lửa của Phượng Hoàng Hỗn Mang
 *  - 8 chân đốt của Nữ Hoàng Nhện sau lưng · sừng tia chớp của Vua Sấm Sét · vương miện + giáp gai của Bạo Chúa
 *  - Ma Nhãn khổng lồ giữa trán (bắn laze) + 2 mắt phụ, lõi ngực 4 màu xoay (4 linh hồn Boss), lốc xoáy sau lưng
 */

type Phase = 1 | 2 | 3;

/** màu theo thanh máu: tím hắc ám → lửa cam → huyết nộ đỏ thẫm */
const OV_COLORS = [
  { armor: '#4c1d6e', armorDark: '#1a0826', rim: '#c084fc', glow: '#e64980', eye: '#ff2d55', vortex: ['#7950f2', '#e64980'] },
  { armor: '#7a1f2b', armorDark: '#2a0710', rim: '#ff922b', glow: '#ff6b2c', eye: '#ff3b1f', vortex: ['#e8590c', '#ffd43b'] },
  { armor: '#5c0a1e', armorDark: '#0a0005', rim: '#ffd8a8', glow: '#ff2d55', eye: '#fff3bf', vortex: ['#ff2d55', '#ffd43b'] },
] as const;

/** 4 linh hồn Boss trong lõi ngực: Sấm Sét, Nhện, Bạo Chúa, Song Sát */
const SOUL_COLORS = ['#ffd43b', '#da77f2', '#ff6b2c', '#74c0fc'];

function rnd(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function zap(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, seed: number, w: number, color: string) {
  const r = rnd(seed);
  const n = 7;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = w * 5;
  for (const [lw, c] of [[w * 2.2, color], [w * 0.8, '#fff']] as const) {
    ctx.strokeStyle = c;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const off = (r() - 0.5) * len * 0.35 * Math.sin(Math.PI * t);
      ctx.lineTo(ax + dx * t + nx * off, ay + dy * t + ny * off);
    }
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.restore();
}

/** Lốc xoáy hỗn nguyên sau lưng: các nhánh xoắn ốc 2 màu xoay quanh tâm */
function drawVortex(ctx: CanvasRenderingContext2D, s: number, now: number, phase: Phase) {
  const c = OV_COLORS[phase - 1];
  ctx.save();
  ctx.rotate(now / (900 - phase * 150));
  const arms = 5;
  for (let k = 0; k < arms; k++) {
    ctx.save();
    ctx.rotate((k / arms) * Math.PI * 2);
    ctx.strokeStyle = k % 2 ? c.vortex[0] : c.vortex[1];
    ctx.globalAlpha = 0.32;
    ctx.lineWidth = s * 0.022;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      const a = t * Math.PI * 1.6;
      const r = s * (0.12 + t * 0.62);
      if (i) ctx.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 0.75);
      else ctx.moveTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 0.75);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  // mảnh vụn bị hút xoáy
  const r = rnd(7);
  ctx.save();
  for (let i = 0; i < 18; i++) {
    const base = r() * Math.PI * 2;
    const speed = 0.6 + r() * 0.8;
    const a = base + now / (700 / speed);
    const d = s * (0.35 + ((now / 2600 + r()) % 1) * 0.45);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = SOUL_COLORS[i % 4];
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d * 1.3, Math.sin(a) * d * 0.7, s * (0.008 + r() * 0.012), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Cánh trái: cánh màng Hắc Long (xương ngón + màng tím trong suốt) */
function drawDragonWing(ctx: CanvasRenderingContext2D, s: number, now: number, phase: Phase) {
  const flap = Math.sin(now / 260) * 0.12;
  ctx.save();
  ctx.translate(-s * 0.2, -s * 0.1);
  ctx.rotate(-0.15 + flap);
  const tips = [
    [-0.78, -0.42],
    [-0.86, -0.12],
    [-0.78, 0.16],
    [-0.56, 0.34],
  ];
  // màng
  const g = ctx.createLinearGradient(0, 0, -s * 0.85, 0);
  g.addColorStop(0, 'rgba(76, 29, 149, 0.95)');
  g.addColorStop(1, phase === 3 ? 'rgba(116, 192, 252, 0.55)' : 'rgba(151, 117, 250, 0.45)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-s * 0.3, -s * 0.48);
  for (let i = 0; i < tips.length; i++) {
    const [x, y] = tips[i];
    const [nx, ny] = tips[i + 1] ?? [-0.1, 0.22];
    ctx.lineTo(x * s, y * s);
    // mép màng cong vào giữa 2 ngón
    ctx.quadraticCurveTo(((x + nx) / 2 + 0.08) * s, ((y + ny) / 2) * s, nx * s, ny * s);
  }
  ctx.closePath();
  ctx.fill();
  // xương ngón
  ctx.strokeStyle = '#1a0826';
  ctx.lineWidth = s * 0.022;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-s * 0.3, -s * 0.48);
  for (const [x, y] of tips) {
    ctx.moveTo(-s * 0.3, -s * 0.48);
    ctx.lineTo(x * s, y * s);
  }
  ctx.stroke();
  // móng vuốt đầu cánh
  ctx.fillStyle = '#e599f7';
  ctx.beginPath();
  ctx.moveTo(-s * 0.3, -s * 0.48);
  ctx.lineTo(-s * 0.36, -s * 0.6);
  ctx.lineTo(-s * 0.25, -s * 0.5);
  ctx.fill();
  ctx.restore();
}

/** Cánh phải: cánh lửa Phượng Hoàng (các lông vũ lửa chập chờn) */
function drawPhoenixWing(ctx: CanvasRenderingContext2D, s: number, now: number, phase: Phase) {
  const flap = Math.sin(now / 260 + 0.6) * 0.12;
  ctx.save();
  ctx.translate(s * 0.2, -s * 0.1);
  ctx.rotate(0.15 - flap);
  const feathers = 7;
  for (let i = 0; i < feathers; i++) {
    const t = i / (feathers - 1);
    const a = -0.95 + t * 1.25;
    const len = s * (0.82 - Math.abs(t - 0.35) * 0.35) * (1 + Math.sin(now / 90 + i) * 0.04);
    ctx.save();
    ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, phase === 3 ? '#fff3bf' : '#ffd43b');
    g.addColorStop(0.45, '#ff922b');
    g.addColorStop(1, 'rgba(224, 49, 49, 0.1)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.03);
    ctx.quadraticCurveTo(len * 0.6, -s * 0.09, len, 0);
    ctx.quadraticCurveTo(len * 0.6, s * 0.07, 0, s * 0.03);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // tàn lửa bay
  const r = rnd(Math.floor(now / 120));
  for (let i = 0; i < 6; i++) {
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = i % 2 ? '#ffe066' : '#ff6b6b';
    ctx.beginPath();
    ctx.arc(s * (0.3 + r() * 0.5), -s * (0.5 + r() * 0.3) + r() * s * 0.6, s * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 8 chân đốt kiểu Nữ Hoàng Nhện sau lưng, cử động lần lượt */
function drawLegs(ctx: CanvasRenderingContext2D, s: number, now: number, c: (typeof OV_COLORS)[number]) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const wave = Math.sin(now / 180 + k * 1.3 + (side > 0 ? 1 : 0)) * 0.08;
      const baseY = s * (-0.02 + k * 0.08);
      const kneeX = side * s * (0.42 + k * 0.03);
      const kneeY = baseY - s * (0.2 - k * 0.02) + wave * s;
      const footX = side * s * (0.6 + k * 0.05);
      const footY = baseY + s * (0.22 + k * 0.03) + wave * s * 0.5;
      ctx.strokeStyle = c.armorDark;
      ctx.lineWidth = s * 0.04;
      ctx.beginPath();
      ctx.moveTo(side * s * 0.16, baseY);
      ctx.lineTo(kneeX, kneeY);
      ctx.lineTo(footX, footY);
      ctx.stroke();
      ctx.strokeStyle = c.rim;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = s * 0.01;
      ctx.stroke();
      ctx.globalAlpha = 1;
      // khớp gối phát sáng
      ctx.fillStyle = c.glow;
      ctx.beginPath();
      ctx.arc(kneeX, kneeY, s * 0.014, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Sừng tia chớp của Vua Sấm Sét */
function drawHorns(ctx: CanvasRenderingContext2D, s: number, now: number, phase: Phase) {
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.shadowColor = '#ffd43b';
    ctx.shadowBlur = s * (0.05 + (phase - 1) * 0.03);
    ctx.fillStyle = phase === 3 ? '#ffffff' : '#ffe066';
    ctx.strokeStyle = '#1a0826';
    ctx.lineWidth = s * 0.016;
    ctx.beginPath();
    ctx.moveTo(sx * s * 0.14, -s * 0.3);
    ctx.lineTo(sx * s * 0.3, -s * 0.5);
    ctx.lineTo(sx * s * 0.25, -s * 0.47);
    ctx.lineTo(sx * s * 0.42, -s * 0.68);
    ctx.lineTo(sx * s * 0.32, -s * 0.44);
    ctx.lineTo(sx * s * 0.37, -s * 0.46);
    ctx.lineTo(sx * s * 0.22, -s * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  // sét nhảy giữa 2 sừng
  if (phase >= 2 || Math.floor(now / 400) % 3 === 0) {
    const tick = Math.floor(now / 90);
    zap(ctx, -s * 0.42, -s * 0.68, s * 0.42, -s * 0.68, tick * 31, Math.max(1, s * 0.008), '#ffe066');
  }
}

/** Vương miện Bạo Chúa với 3 ngọc */
function drawCrown(ctx: CanvasRenderingContext2D, s: number, now: number) {
  ctx.save();
  ctx.translate(0, -s * 0.33);
  const g = ctx.createLinearGradient(0, -s * 0.16, 0, s * 0.02);
  g.addColorStop(0, '#fff3bf');
  g.addColorStop(0.5, '#fcc419');
  g.addColorStop(1, '#e67700');
  ctx.fillStyle = g;
  ctx.strokeStyle = '#1a0826';
  ctx.lineWidth = s * 0.014;
  ctx.beginPath();
  ctx.moveTo(-s * 0.15, 0);
  ctx.lineTo(-s * 0.17, -s * 0.1);
  ctx.lineTo(-s * 0.09, -s * 0.05);
  ctx.lineTo(0, -s * 0.16);
  ctx.lineTo(s * 0.09, -s * 0.05);
  ctx.lineTo(s * 0.17, -s * 0.1);
  ctx.lineTo(s * 0.15, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const gems: [number, number, string][] = [[-s * 0.1, -s * 0.03, '#e64980'], [0, -s * 0.06, '#74c0fc'], [s * 0.1, -s * 0.03, '#69db7c']];
  for (const [x, y, col] of gems) {
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = s * 0.03 * (1 + Math.sin(now / 200 + x) * 0.5);
    ctx.beginPath();
    ctx.arc(x, y, s * 0.018, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Ma Nhãn: mắt khổng lồ giữa trán, đồng tử dọc liếc theo thời gian, nạp năng lượng phát sáng */
function drawGreatEye(ctx: CanvasRenderingContext2D, s: number, now: number, phase: Phase, c: (typeof OV_COLORS)[number]) {
  const blink = (now % 4200) < 140 ? 1 - Math.abs(((now % 4200) - 70) / 70) : 0;
  const open = 1 - blink * 0.9;
  const charge = 0.6 + Math.sin(now / (160 - phase * 30)) * 0.4;
  ctx.save();
  ctx.translate(0, -s * 0.12);
  // hào quang nạp laze
  const halo = ctx.createRadialGradient(0, 0, s * 0.02, 0, 0, s * 0.2);
  halo.addColorStop(0, `${c.eye}cc`);
  halo.addColorStop(1, `${c.eye}00`);
  ctx.globalAlpha = charge;
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // tròng mắt
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.12, s * 0.075 * open, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fff5f5';
  ctx.fill();
  ctx.lineWidth = s * 0.018;
  ctx.strokeStyle = '#1a0826';
  ctx.stroke();
  ctx.save();
  ctx.clip();
  const look = Math.sin(now / 900) * s * 0.035;
  const iris = ctx.createRadialGradient(look, 0, s * 0.005, look, 0, s * 0.065);
  iris.addColorStop(0, '#fff');
  iris.addColorStop(0.3, c.eye);
  iris.addColorStop(1, '#5c0011');
  ctx.fillStyle = iris;
  ctx.beginPath();
  ctx.arc(look, 0, s * 0.065, 0, Math.PI * 2);
  ctx.fill();
  // đồng tử dọc như rồng
  ctx.fillStyle = '#05020f';
  ctx.beginPath();
  ctx.ellipse(look, 0, s * 0.012, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // mí mắt gai phía trên
  ctx.fillStyle = c.armorDark;
  ctx.beginPath();
  ctx.moveTo(-s * 0.15, -s * 0.02);
  ctx.quadraticCurveTo(0, -s * 0.13, s * 0.15, -s * 0.02);
  ctx.lineTo(s * 0.11, -s * 0.06);
  ctx.quadraticCurveTo(0, -s * 0.1 * open - s * 0.02, -s * 0.11, -s * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // gờ mày chữ V hằn học đè lên Ma Nhãn
  ctx.save();
  ctx.translate(0, -s * 0.12);
  ctx.fillStyle = c.armorDark;
  ctx.strokeStyle = c.rim;
  ctx.lineWidth = s * 0.008;
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, -s * 0.11);
  ctx.lineTo(0, -s * 0.045);
  ctx.lineTo(s * 0.2, -s * 0.11);
  ctx.lineTo(s * 0.16, -s * 0.065);
  ctx.lineTo(0, -s * 0.015);
  ctx.lineTo(-s * 0.16, -s * 0.065);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // 2 mắt phụ: khe sắc xếch ngược lên, phát sáng
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.translate(sx * s * 0.14, s * 0.03);
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = s * 0.07;
    ctx.fillStyle = c.eye;
    ctx.beginPath();
    ctx.moveTo(-sx * s * 0.045, s * 0.012 * open);
    ctx.lineTo(sx * s * 0.055, -s * 0.03 * open);
    ctx.lineTo(sx * s * 0.03, s * 0.016 * open);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** Hàm răng nanh */
function drawJaw(ctx: CanvasRenderingContext2D, s: number, now: number, phase: Phase, c: (typeof OV_COLORS)[number]) {
  const roar = phase === 3 ? 0.5 + Math.sin(now / 120) * 0.5 : Math.max(0, Math.sin(now / 700)) * 0.4;
  ctx.save();
  ctx.translate(0, s * 0.13);
  ctx.fillStyle = '#1a0008';
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.12, s * (0.03 + roar * 0.035), 0, 0, Math.PI * 2);
  ctx.fill();
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.1);
  glow.addColorStop(0, `${c.glow}aa`);
  glow.addColorStop(1, `${c.glow}00`);
  ctx.fillStyle = glow;
  ctx.fill();
  ctx.fillStyle = '#fff9f0';
  for (let i = -3; i <= 3; i++) {
    const x = i * s * 0.032;
    const h = s * (i === -2 || i === 2 ? 0.05 : 0.03);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.012, -s * 0.03 - roar * s * 0.02);
    ctx.lineTo(x, -s * 0.03 + h - roar * s * 0.02);
    ctx.lineTo(x + s * 0.012, -s * 0.03 - roar * s * 0.02);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.01, s * 0.03 + roar * s * 0.02);
    ctx.lineTo(x, s * 0.03 - h * 0.7 + roar * s * 0.02);
    ctx.lineTo(x + s * 0.01, s * 0.03 + roar * s * 0.02);
    ctx.fill();
  }
  ctx.restore();
}

/** Lõi ngực: 4 linh hồn Boss xoay quanh viên ngọc hỗn nguyên */
function drawCore(ctx: CanvasRenderingContext2D, s: number, now: number) {
  ctx.save();
  ctx.translate(0, s * 0.27);
  const pulse = 1 + Math.sin(now / 150) * 0.08;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.07 * pulse);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, '#f783ac');
  g.addColorStop(1, 'rgba(121, 80, 242, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.07 * pulse, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    const a = now / 400 + (i / 4) * Math.PI * 2;
    ctx.fillStyle = SOUL_COLORS[i];
    ctx.shadowColor = SOUL_COLORS[i];
    ctx.shadowBlur = s * 0.04;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * s * 0.075, Math.sin(a) * s * 0.035, s * 0.018, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Thân giáp gai (Bạo Chúa) */
function drawBody(ctx: CanvasRenderingContext2D, s: number, c: (typeof OV_COLORS)[number]) {
  const g = ctx.createRadialGradient(-s * 0.08, -s * 0.12, s * 0.03, 0, 0, s * 0.42);
  g.addColorStop(0, c.rim);
  g.addColorStop(0.25, c.armor);
  g.addColorStop(1, c.armorDark);
  ctx.fillStyle = g;
  ctx.strokeStyle = '#05020f';
  ctx.lineWidth = s * 0.018;
  ctx.beginPath();
  const spikes = 26;
  for (let i = 0; i <= spikes; i++) {
    const a = (i / spikes) * Math.PI * 2 - Math.PI / 2;
    const top = Math.sin(a) < -0.3;
    const r = s * (i % 2 ? 0.3 : top ? 0.36 : 0.33);
    ctx.lineTo(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.08 + s * 0.02);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // vân giáp
  ctx.strokeStyle = c.rim;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = s * 0.01;
  for (const k of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(k * s * 0.24, -s * 0.15);
    ctx.quadraticCurveTo(k * s * 0.3, s * 0.08, k * s * 0.12, s * 0.3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * Vẽ Trùm Cuối tại (cx, cy), cao khoảng size.
 * hitAge: ms từ cú đấm gần nhất. dead: đã gục. shielded: đang có Giáp Hỗn Nguyên.
 */
export function drawOverlord(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  now: number,
  phase: Phase,
  hitAge: number,
  dead: boolean,
  shielded: boolean,
) {
  const c = OV_COLORS[phase - 1];
  const s = size;
  const bob = Math.sin(now / 520) * s * 0.025;
  const recoil = hitAge < 160 ? (1 - hitAge / 160) * s * 0.05 : 0;
  const tremble = phase === 3 && !dead ? Math.sin(now / 37) * s * 0.006 : 0;
  ctx.save();
  ctx.translate(cx + tremble, cy + bob - recoil);
  if (dead) {
    ctx.globalAlpha = 0.25;
    ctx.rotate(0.25);
  }

  // hào quang lớn + lốc xoáy sau lưng
  const aura = ctx.createRadialGradient(0, 0, s * 0.15, 0, 0, s * 0.85);
  aura.addColorStop(0, `${c.glow}55`);
  aura.addColorStop(1, `${c.glow}00`);
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2);
  ctx.fill();
  if (!dead) drawVortex(ctx, s, now, phase);

  drawDragonWing(ctx, s, now, phase);
  drawPhoenixWing(ctx, s, now, phase);
  drawLegs(ctx, s, now, c);
  drawBody(ctx, s, c);
  drawHorns(ctx, s, now, phase);
  drawCrown(ctx, s, now);
  drawGreatEye(ctx, s, now, phase, c);
  drawJaw(ctx, s, now, phase, c);
  drawCore(ctx, s, now);

  // giai đoạn 3: sét 4 màu bao quanh thân
  if (phase === 3 && !dead) {
    const tick = Math.floor(now / 100);
    const r = rnd(tick);
    for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI * 2;
      zap(ctx, Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3, Math.cos(a + 0.5) * s * 0.62, Math.sin(a + 0.5) * s * 0.45, tick * 11 + i, Math.max(1, s * 0.008), SOUL_COLORS[i % 4]);
    }
  }

  if (shielded && !dead) {
    // Giáp Hỗn Nguyên: 2 vòng lục giác cầu vồng xoay ngược chiều
    for (const [rot, scale] of [[now / 2000, 1], [-now / 1400, 0.88]] as const) {
      ctx.save();
      ctx.rotate(rot);
      const g = ctx.createLinearGradient(-s * 0.5, 0, s * 0.5, 0);
      SOUL_COLORS.forEach((col, i) => g.addColorStop(i / 3, col));
      ctx.strokeStyle = g;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.shadowColor = '#f783ac';
      ctx.shadowBlur = s * 0.06;
      ctx.lineWidth = s * 0.018;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * s * 0.56 * scale, Math.sin(a) * s * 0.46 * scale);
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  if (hitAge < 110 && !dead) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - hitAge / 110)})`;
    ctx.fillRect(-s, -s, s * 2, s * 2);
  }
  ctx.restore();
}

/** Vị trí Ma Nhãn (tương đối tâm vẽ, theo size) – để hiệu ứng laze bắn ra đúng chỗ */
export const OVERLORD_EYE_Y = -0.12;
