/**
 * Trùm Cuối – Cự Thần Thiên Hà (Boss 6): người khổng lồ vũ trụ to tràn khung (canvas 2D, thiết kế riêng của game).
 *  - thân và đầu là bầu trời sao, giáp vai viền vàng khắc ngữ phát sáng
 *  - sừng là 2 vầng trăng lưỡi liềm, vương miện có 3 hành tinh bay quanh
 *  - 2 mắt khổng lồ (bắn Song Nhãn Diệt Thế), lõi ngực là hố đen có đĩa bồi tụ
 *  - 2 cánh tay giáp nâng 2 hành tinh (giơ lên bắn Song Thủ Pháo), thiên hà xoắn ốc xoay sau lưng
 *  - đang ra chiêu thì diễn theo: giơ tay nạp pháo, mắt toé sét (Bão Sét), vương miện quay cuồng (Xoay Càn Khôn)
 */

type Phase = 1 | 2 | 3;

const TI_COLORS = [
  { body: '#1b1f4b', deep: '#070923', trim: '#ffd43b', eye: '#66d9e8', glow: '#4dabf7', nebula: ['#5f3dc4', '#1971c2'] },
  { body: '#2b1648', deep: '#0c0420', trim: '#ffa94d', eye: '#ffe066', glow: '#f783ac', nebula: ['#ae3ec9', '#e8590c'] },
  { body: '#3a0d1f', deep: '#0d0207', trim: '#fff3bf', eye: '#ff6b6b', glow: '#ff2d55', nebula: ['#c92a2a', '#7048e8'] },
] as const;

function rnd(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** sao lấp lánh trong vùng đang clip */
function stars(ctx: CanvasRenderingContext2D, s: number, now: number, n: number, seed: number) {
  const r = rnd(seed);
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * s * 2.4;
    const y = (r() - 0.5) * s * 1.6;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(now / (300 + r() * 700) + i));
    const rad = s * (0.004 + r() * 0.008);
    ctx.globalAlpha = tw;
    ctx.fillStyle = i % 7 === 0 ? '#ffe066' : i % 5 === 0 ? '#a5d8ff' : '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** tia sét lởm chởm từ (x0, y0) tới (x1, y1) */
function crackle(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, seed: number, w: number, color: string) {
  const r = rnd(seed);
  const n = 6;
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = w * 6;
  for (const [lw, col] of [[w * 2.4, color], [w * 0.9, '#ffffff']] as const) {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const off = (r() - 0.5) * len * 0.45 * Math.sin(Math.PI * t);
      ctx.lineTo(x0 + dx * t + nx * off, y0 + dy * t + ny * off);
    }
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.restore();
}

/** thiên hà xoắn ốc sau lưng */
function galaxy(ctx: CanvasRenderingContext2D, s: number, now: number, c: (typeof TI_COLORS)[number]) {
  ctx.save();
  ctx.rotate(now / 4000);
  for (const [i, col] of c.nebula.entries()) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.1);
    g.addColorStop(0, `${col}88`);
    g.addColorStop(1, `${col}00`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(i ? s * 0.2 : -s * 0.2, 0, s * 1.2, s * 0.55, i ? 0.4 : -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const r = rnd(42);
  for (let arm = 0; arm < 3; arm++) {
    for (let k = 0; k < 60; k++) {
      const t = k / 60;
      const a = t * Math.PI * 3 + (arm / 3) * Math.PI * 2;
      const d = s * (0.15 + t * 1.0);
      const jitter = (r() - 0.5) * s * 0.08;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.fillStyle = k % 4 ? '#e7f5ff' : c.nebula[arm % 2];
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d + jitter, Math.sin(a) * d * 0.5 + jitter * 0.5, s * (0.006 + (1 - t) * 0.01), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** sừng trăng lưỡi liềm (phình ra ngoài, 2 mũi chĩa lên) */
function moonHorn(ctx: CanvasRenderingContext2D, s: number, side: number, c: (typeof TI_COLORS)[number], now: number) {
  const R = s * 0.2;
  ctx.save();
  ctx.translate(side * s * 0.25, -s * 0.6);
  ctx.scale(-side, 1);
  ctx.rotate(-0.25 + Math.sin(now / 1500) * 0.03);
  ctx.shadowColor = c.trim;
  ctx.shadowBlur = s * 0.08;
  const g = ctx.createLinearGradient(-R, 0, R * 0.4, 0);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.45, c.trim);
  g.addColorStop(1, '#e67700');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R, Math.PI * 0.5, Math.PI * 1.5, false);
  ctx.arc(R * 0.42, 0, R * 0.82, Math.PI * 1.5, Math.PI * 0.5, true);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** hành tinh nhỏ có vành */
function planet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, ring: boolean) {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(-r * 0.4, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, col);
  g.addColorStop(1, '#0b0b1e');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  if (ring) {
    ctx.strokeStyle = 'rgba(255,236,153,0.85)';
    ctx.lineWidth = r * 0.22;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.7, r * 0.45, -0.35, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawTitan(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  now: number,
  phase: Phase,
  hitAge: number,
  dead: boolean,
  shielded: boolean,
  cast?: { kind: string; age: number },
) {
  const c = TI_COLORS[phase - 1];
  const s = size;
  /** mức "diễn" chiêu 0..1: lên nhanh, giữ, rồi hạ dần */
  const act = (kind: string, hold = 1300) => {
    if (dead || !cast || cast.kind !== kind) return 0;
    const a = cast.age;
    return a < 300 ? Math.sin((a / 300) * (Math.PI / 2)) : a < hold ? 1 : Math.max(0, 1 - (a - hold) / 300);
  };
  const raise = act('arm_cannon');
  const storm = act('eye_storm', 1200);
  const spinning = act('board_spin', 1000);
  const lasering = Math.max(act('twin_laser', 900), storm);
  const breathe = Math.sin(now / 900) * s * 0.012;
  const recoil = hitAge < 180 ? (1 - hitAge / 180) * s * 0.035 : 0;
  ctx.save();
  ctx.translate(cx + (phase === 3 && !dead ? Math.sin(now / 41) * s * 0.004 : 0), cy + breathe - recoil);
  if (dead) {
    ctx.globalAlpha = 0.25;
    ctx.rotate(0.15);
  }

  if (!dead) galaxy(ctx, s, now, c);

  // ---- vai + thân (to tràn khung) ----
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-s * 1.3, s * 0.95);
  ctx.quadraticCurveTo(-s * 1.15, s * 0.15, -s * 0.62, s * 0.08);
  ctx.quadraticCurveTo(-s * 0.3, -s * 0.02, -s * 0.18, s * 0.05);
  ctx.lineTo(s * 0.18, s * 0.05);
  ctx.quadraticCurveTo(s * 0.3, -s * 0.02, s * 0.62, s * 0.08);
  ctx.quadraticCurveTo(s * 1.15, s * 0.15, s * 1.3, s * 0.95);
  ctx.closePath();
  const bodyG = ctx.createLinearGradient(0, -s * 0.1, 0, s);
  bodyG.addColorStop(0, c.body);
  bodyG.addColorStop(1, c.deep);
  ctx.fillStyle = bodyG;
  ctx.fill();
  ctx.save();
  ctx.clip();
  stars(ctx, s, now, 70, 7);
  ctx.restore();
  ctx.strokeStyle = c.trim;
  ctx.lineWidth = s * 0.014;
  ctx.shadowColor = c.trim;
  ctx.shadowBlur = s * 0.04;
  ctx.stroke();
  ctx.restore();

  // 2 cánh tay giáp: từ vai vòng ra ngoài rồi lên tới cổ tay (giơ cao khi bắn Song Thủ Pháo)
  for (const side of [-1, 1]) {
    const hx = side * s * (0.98 - 0.08 * raise);
    const hy = s * 0.05 + Math.sin(now / 700 + side) * s * 0.03 * (1 - raise) - raise * s * 0.3;
    const sx = side * s * 0.66, sy = s * 0.22;
    const ex = side * s * (1.08 - 0.05 * raise), ey = s * (0.42 - 0.12 * raise);
    const wx = hx, wy = hy + s * 0.12;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = c.trim;
    ctx.shadowBlur = s * 0.03;
    ctx.strokeStyle = c.trim;
    ctx.lineWidth = s * 0.135;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(ex, ey, wx, wy);
    ctx.stroke();
    ctx.shadowBlur = 0;
    const ag = ctx.createLinearGradient(sx, sy, wx, wy);
    ag.addColorStop(0, c.deep);
    ag.addColorStop(1, c.body);
    ctx.strokeStyle = ag;
    ctx.lineWidth = s * 0.11;
    ctx.stroke();
    // vòng ngữ phát sáng trên bắp tay + cẳng tay
    for (const t of [0.35, 0.72]) {
      const bx = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * ex + t * t * wx;
      const by = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * ey + t * t * wy;
      ctx.fillStyle = c.glow;
      ctx.shadowColor = c.glow;
      ctx.shadowBlur = s * (0.04 + raise * 0.06);
      ctx.globalAlpha = 0.6 + Math.sin(now / 200 + t * 9) * 0.3 + raise * 0.3;
      ctx.beginPath();
      ctx.arc(bx, by, s * 0.022, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // giáp vai khắc ngữ
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * s * 0.62, s * 0.18);
    ctx.rotate(side * -0.25);
    ctx.fillStyle = c.deep;
    ctx.strokeStyle = c.trim;
    ctx.lineWidth = s * 0.012;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.3, s * 0.16, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(k * s * 0.1 - s * 0.03, -s * 0.13 + Math.abs(k) * s * 0.03);
      ctx.lineTo(k * s * 0.1, -s * 0.26 + Math.abs(k) * s * 0.05);
      ctx.lineTo(k * s * 0.1 + s * 0.03, -s * 0.13 + Math.abs(k) * s * 0.03);
      ctx.closePath();
      ctx.fillStyle = c.trim;
      ctx.fill();
    }
    ctx.fillStyle = c.glow;
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = s * 0.04;
    ctx.font = `${Math.round(s * 0.07)}px serif`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.6 + Math.sin(now / 300 + side) * 0.4;
    ctx.fillText('✦ ☾ ✧', 0, -s * 0.04);
    ctx.restore();
  }

  // 2 bàn tay nâng hành tinh
  for (const side of [-1, 1]) {
    const hx = side * s * (0.98 - 0.08 * raise);
    const hy = s * 0.05 + Math.sin(now / 700 + side) * s * 0.03 * (1 - raise) - raise * s * 0.3;
    ctx.save();
    ctx.fillStyle = c.body;
    ctx.strokeStyle = c.trim;
    ctx.lineWidth = s * 0.01;
    ctx.beginPath();
    ctx.ellipse(hx, hy + s * 0.1, s * 0.11, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // ngón tay ôm hành tinh
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.ellipse(hx + k * s * 0.04, hy + s * 0.04, s * 0.018, s * 0.05, k * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const glowR = s * (0.2 + raise * 0.22 * (0.85 + Math.sin(now / 60) * 0.15));
    const pg = ctx.createRadialGradient(hx, hy - s * 0.06, 0, hx, hy - s * 0.06, glowR);
    pg.addColorStop(0, raise > 0.5 ? '#ffffffee' : `${c.glow}aa`);
    pg.addColorStop(0.35, `${c.glow}aa`);
    pg.addColorStop(1, `${c.glow}00`);
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(hx, hy - s * 0.06, glowR, 0, Math.PI * 2);
    ctx.fill();
    if (raise > 0.3) {
      // năng lượng hút vào hành tinh trước khi bắn
      const r = rnd(Math.floor(now / 70) + side * 99);
      for (let k = 0; k < 4; k++) {
        const a = r() * Math.PI * 2;
        crackle(ctx, hx + Math.cos(a) * s * 0.28, hy - s * 0.06 + Math.sin(a) * s * 0.2, hx, hy - s * 0.06, Math.floor(now / 70) * 7 + k + side * 13, s * 0.006, c.glow);
      }
    }
    planet(ctx, hx, hy - s * 0.06, s * 0.075, side < 0 ? '#4dabf7' : '#ff922b', side > 0);
    ctx.restore();
  }

  // ---- đầu ----
  moonHorn(ctx, s, -1, c, now);
  moonHorn(ctx, s, 1, c, now);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.62);
  ctx.bezierCurveTo(s * 0.26, -s * 0.6, s * 0.3, -s * 0.25, s * 0.2, -s * 0.02);
  ctx.quadraticCurveTo(s * 0.1, s * 0.12, 0, s * 0.14);
  ctx.quadraticCurveTo(-s * 0.1, s * 0.12, -s * 0.2, -s * 0.02);
  ctx.bezierCurveTo(-s * 0.3, -s * 0.25, -s * 0.26, -s * 0.6, 0, -s * 0.62);
  ctx.closePath();
  const headG = ctx.createRadialGradient(0, -s * 0.3, s * 0.02, 0, -s * 0.25, s * 0.4);
  headG.addColorStop(0, c.body);
  headG.addColorStop(1, c.deep);
  ctx.fillStyle = headG;
  ctx.fill();
  ctx.save();
  ctx.clip();
  stars(ctx, s * 0.5, now, 30, 99);
  ctx.restore();
  ctx.strokeStyle = c.trim;
  ctx.lineWidth = s * 0.012;
  ctx.stroke();
  ctx.restore();

  // vương miện: vành sáng + 3 hành tinh bay quanh đầu
  ctx.save();
  ctx.translate(0, -s * 0.58);
  ctx.strokeStyle = c.trim;
  ctx.shadowColor = c.trim;
  ctx.shadowBlur = s * 0.05;
  ctx.lineWidth = s * 0.012;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.32, s * 0.07, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  const orbit = [
    ['#69db7c', false],
    ['#da77f2', true],
    ['#ff8787', false],
  ] as const;
  orbit.forEach(([col, ring], i) => {
    const a = now / (1200 - spinning * 1050) + (i / 3) * Math.PI * 2;
    const behind = Math.sin(a) < 0;
    ctx.globalAlpha = behind ? 0.5 : 1;
    planet(ctx, Math.cos(a) * s * 0.32, Math.sin(a) * s * 0.07, s * (behind ? 0.025 : 0.035), col, ring);
  });
  ctx.globalAlpha = 1;
  ctx.restore();

  // 2 mắt khổng lồ
  const charge = Math.max(0.6 + Math.sin(now / (200 - phase * 40)) * 0.4, lasering);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * s * 0.1, -s * 0.28);
    ctx.rotate(side * 0.18);
    const haloR = s * (0.12 + lasering * 0.1);
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, haloR);
    halo.addColorStop(0, storm > 0 ? '#ffffff' : `${c.eye}`);
    halo.addColorStop(1, `${c.eye}00`);
    ctx.globalAlpha = charge;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, haloR, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowColor = c.eye;
    ctx.shadowBlur = s * 0.06;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-s * 0.07, s * 0.005);
    ctx.quadraticCurveTo(0, -s * 0.05, s * 0.07, -s * 0.005);
    ctx.quadraticCurveTo(0, s * 0.035, -s * 0.07, s * 0.005);
    ctx.fill();
    ctx.fillStyle = c.eye;
    ctx.beginPath();
    ctx.arc(side * s * 0.008, -s * 0.004, s * 0.02, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Bão Sét Thiên Nhãn: sét toé ra từ 2 mắt, nối lên 2 sừng trăng
  if (storm > 0.05) {
    const tick = Math.floor(now / 60);
    const r = rnd(tick);
    for (const side of [-1, 1]) {
      const ex = side * s * 0.1, ey = -s * 0.28;
      for (let k = 0; k < 4; k++) {
        const a = r() * Math.PI * 2;
        const d = s * (0.18 + r() * 0.3) * storm;
        crackle(ctx, ex, ey, ex + Math.cos(a) * d, ey + Math.sin(a) * d * 0.8, tick * 13 + k + side * 7, s * 0.007, '#ffe066');
      }
      crackle(ctx, ex, ey, side * s * 0.33, -s * 0.72, tick * 17 + side, s * 0.008, '#a5d8ff');
    }
  }
  // mày giận dữ
  ctx.save();
  ctx.strokeStyle = c.trim;
  ctx.lineWidth = s * 0.016;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * s * 0.03, -s * 0.33);
    ctx.lineTo(side * s * 0.19, -s * 0.38);
    ctx.stroke();
  }
  ctx.restore();
  // ngọc sao giữa trán (con mắt thứ 3)
  ctx.save();
  ctx.translate(0, -s * 0.43);
  ctx.rotate(now / 800);
  ctx.fillStyle = '#fff';
  ctx.shadowColor = c.eye;
  ctx.shadowBlur = s * 0.06;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 ? s * 0.012 : s * 0.04;
    if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // vạch ngữ phát sáng dưới mắt
  ctx.save();
  ctx.strokeStyle = c.glow;
  ctx.shadowColor = c.glow;
  ctx.shadowBlur = s * 0.03;
  ctx.lineWidth = s * 0.008;
  ctx.globalAlpha = 0.6 + Math.sin(now / 250) * 0.3;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * s * 0.1, -s * 0.24);
    ctx.lineTo(side * s * 0.13, -s * 0.16);
    ctx.lineTo(side * s * 0.1, -s * 0.1);
    ctx.stroke();
  }
  ctx.restore();
  // miệng: hàm răng lưới ánh sáng, há rộng khi nổi giận
  ctx.save();
  const open = phase === 3 ? 0.6 + Math.abs(Math.sin(now / 160)) * 0.4 : phase === 2 ? 0.45 : 0.3;
  const mh = s * 0.05 * open;
  ctx.fillStyle = '#05010c';
  ctx.beginPath();
  ctx.moveTo(-s * 0.09, -s * 0.1);
  ctx.lineTo(s * 0.09, -s * 0.1);
  ctx.lineTo(s * 0.05, -s * 0.1 + mh);
  ctx.lineTo(-s * 0.05, -s * 0.1 + mh);
  ctx.closePath();
  ctx.fill();
  const mg = ctx.createLinearGradient(0, -s * 0.1, 0, -s * 0.1 + mh);
  mg.addColorStop(0, `${c.glow}00`);
  mg.addColorStop(1, c.glow);
  ctx.fillStyle = mg;
  ctx.fill();
  ctx.fillStyle = '#fff9f0';
  for (let k = -3; k <= 3; k++) {
    const x = k * s * 0.022;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.008, -s * 0.1);
    ctx.lineTo(x, -s * 0.1 + s * 0.022);
    ctx.lineTo(x + s * 0.008, -s * 0.1);
    ctx.fill();
  }
  ctx.restore();

  // lõi ngực: hố đen + đĩa bồi tụ
  ctx.save();
  ctx.translate(0, s * 0.38);
  ctx.rotate(now / 700);
  const disk = ctx.createRadialGradient(0, 0, s * 0.03, 0, 0, s * 0.16);
  disk.addColorStop(0, '#000000');
  disk.addColorStop(0.35, '#000000');
  disk.addColorStop(0.45, '#fff3bf');
  disk.addColorStop(0.65, c.glow);
  disk.addColorStop(1, `${c.glow}00`);
  ctx.fillStyle = disk;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.16, s * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // giai đoạn 3: thân nứt ra ánh sáng
  if (phase === 3 && !dead) {
    ctx.save();
    ctx.strokeStyle = `rgba(255, 243, 191, ${0.5 + Math.sin(now / 90) * 0.4})`;
    ctx.shadowColor = c.glow;
    ctx.shadowBlur = s * 0.05;
    ctx.lineWidth = s * 0.008;
    const r = rnd(5);
    for (let k = 0; k < 6; k++) {
      let x = (r() - 0.5) * s * 1.6, y = s * (0.25 + r() * 0.5);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += (r() - 0.5) * s * 0.15;
        y -= s * (0.03 + r() * 0.05);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  if (shielded && !dead) {
    // Khiên Tinh Tú: vòng chòm sao xoay
    ctx.save();
    ctx.rotate(now / 3000);
    ctx.strokeStyle = 'rgba(165, 216, 255, 0.85)';
    ctx.shadowColor = '#74c0fc';
    ctx.shadowBlur = s * 0.05;
    ctx.lineWidth = s * 0.01;
    const pts: [number, number][] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pts.push([Math.cos(a) * s * 0.75, Math.sin(a) * s * 0.55]);
    }
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#e7f5ff';
    for (const [x, y] of pts) {
      ctx.beginPath();
      ctx.arc(x, y, s * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (hitAge < 110 && !dead) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(255,255,255,${0.6 * (1 - hitAge / 110)})`;
    ctx.fillRect(-s * 1.5, -s, s * 3, s * 2);
  }
  ctx.restore();
}

/** Toạ độ 2 hành tinh trên tay lúc giơ cao bắn Song Thủ Pháo (tương đối tâm vẽ, theo size) */
export const TITAN_HANDS_FIRE = [
  [-0.9, -0.31],
  [0.9, -0.31],
] as const;

/** Toạ độ 2 mắt (tương đối tâm vẽ, theo size) để laze bắn ra đúng chỗ */
export const TITAN_EYES = [
  [-0.1, -0.28],
  [0.1, -0.28],
] as const;
