import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  TW_BATTLE_SPEEDS,
  type TwBattleSpeed,
  type TwCaptureState,
  type TwFrame,
  type TwMapSpec,
  type TwSideSummary,
} from '../../../../shared/src/tw';
import { TW_ISO_TILT, zoomTwCameraAt, type TwCamera } from '../camera';

export type { TwCamera };

export interface TwMinimapProps {
  mapSpec: TwMapSpec;
  frame: TwFrame | null;
  myTeam?: number;
  cam: TwCamera;
  battleSpeed?: TwBattleSpeed;
  canControlSpeed?: boolean;
  onSetSpeed?: (speed: TwBattleSpeed) => void;
  windAngle?: number;
  windStrength?: number;
  onJumpTo: (wx: number, wy: number) => void;
  onResetHome: () => void;
}

const LOGICAL_W = 216;
const LOGICAL_H = 156;

const WIND_COMPASS_8 = [
  'Đông',
  'Đông Nam',
  'Nam',
  'Tây Nam',
  'Tây',
  'Tây Bắc',
  'Bắc',
  'Đông Bắc',
] as const;

function windCompassLabel(angleRad: number): string {
  const norm = ((angleRad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const idx = Math.round(norm / (Math.PI / 4)) % 8;
  return WIND_COMPASS_8[idx] ?? 'Đông Nam';
}

function speedButtonText(spd: TwBattleSpeed): string {
  if (spd === 0) return '⏸';
  if (spd === 0.5) return '½×';
  return `${spd}×`;
}

function pseudoHash(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function formatBattleClock(sec: number): string {
  const clamped = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const mm = Math.floor(clamped / 60);
  const ss = clamped % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * Dựng lớp nền giấy tuyên & địa hình đẳng cao (rừng thông, đồi cao, sông cạn, đầm lầy)
 * vào offscreen canvas để tái sử dụng mượt 60 FPS không tốn CPU.
 */
function buildTopographicBase(mapSpec: TwMapSpec, w: number, h: number, dpr: number): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.round(w * dpr));
  off.height = Math.max(1, Math.round(h * dpr));
  const ctx = off.getContext('2d');
  if (!ctx) return off;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 1. Nền giấy tuyên cổ (aged rice-paper parchment)
  const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.48, w * 0.08, w * 0.5, h * 0.5, w * 0.78);
  bgGrad.addColorStop(0, '#ece3cd');
  bgGrad.addColorStop(0.7, '#dfd3b7');
  bgGrad.addColorStop(1, '#cbbba0');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Lưới tọa độ quân sự mảnh kiểu bản đồ cổ
  ctx.strokeStyle = 'rgba(92, 74, 46, 0.10)';
  ctx.lineWidth = 0.75;
  for (let gx = 1; gx < 6; gx++) {
    const x = (w / 6) * gx;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let gy = 1; gy < 4; gy++) {
    const y = (h / 4) * gy;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const sx = w / Math.max(1, mapSpec.width);
  const sy = h / Math.max(1, mapSpec.height);

  // 2. Vẽ các vùng địa hình theo thứ tự: river -> mud -> ridge -> forest
  const orderedZones = [...mapSpec.terrainZones].sort((a, b) => {
    const rank = { river: 0, mud: 1, ridge: 2, forest: 3 };
    return rank[a.kind] - rank[b.kind];
  });

  for (let zi = 0; zi < orderedZones.length; zi++) {
    const z = orderedZones[zi];
    const cx = z.x * sx;
    const cy = z.y * sy;
    const rx = Math.max(3, z.rx * sx);
    const ry = Math.max(3, z.ry * sy);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(z.rot);

    if (z.kind === 'river') {
      ctx.fillStyle = 'rgba(186, 168, 128, 0.65)';
      ctx.beginPath();
      ctx.ellipse(0, 0, rx + 2.5, ry + 2.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(72, 134, 172, 0.76)';
      ctx.strokeStyle = 'rgba(44, 94, 128, 0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Gợn nước mảnh
      ctx.strokeStyle = 'rgba(225, 244, 255, 0.42)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 0.68, ry * 0.48, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (z.kind === 'mud') {
      ctx.fillStyle = 'rgba(128, 104, 72, 0.36)';
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.setLineDash([2.5, 2.5]);
      ctx.strokeStyle = 'rgba(92, 72, 46, 0.52)';
      ctx.lineWidth = 0.85;
      ctx.stroke();
      ctx.restore();
    } else if (z.kind === 'ridge') {
      // Đường đồng mức đồi cao (topographic contours)
      const rings = [1.0, 0.72, 0.44];
      for (let ri = 0; ri < rings.length; ri++) {
        const k = rings[ri];
        ctx.fillStyle =
          ri === 0
            ? 'rgba(166, 134, 86, 0.24)'
            : ri === 1
              ? 'rgba(154, 118, 68, 0.24)'
              : 'rgba(142, 104, 54, 0.28)';
        ctx.strokeStyle = `rgba(104, 74, 38, ${0.42 + ri * 0.16})`;
        ctx.lineWidth = ri === 0 ? 1 : 0.85;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx * k, ry * k, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (z.kind === 'forest') {
      ctx.fillStyle = 'rgba(54, 108, 52, 0.46)';
      ctx.strokeStyle = 'rgba(34, 76, 34, 0.62)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Chấm tán tùng thủy mặc
      const count = Math.min(28, Math.max(8, Math.round((rx * ry) / 18)));
      ctx.fillStyle = 'rgba(34, 78, 34, 0.55)';
      for (let ti = 0; ti < count; ti++) {
        const a = pseudoHash(zi * 41 + ti * 7.3) * Math.PI * 2;
        const dist = Math.sqrt(pseudoHash(zi * 19 + ti * 13.7)) * 0.82;
        const tx = Math.cos(a) * rx * dist;
        const ty = Math.sin(a) * ry * dist;
        const tr = 1.3 + pseudoHash(zi * 11 + ti * 3.1) * 1.4;
        ctx.beginPath();
        ctx.arc(tx, ty, tr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // Viền khung mực tàu bên trong
  ctx.strokeStyle = 'rgba(56, 44, 26, 0.55)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.75, 0.75, w - 1.5, h - 1.5);

  return off;
}

export function TwMinimap({
  mapSpec,
  frame,
  myTeam,
  cam,
  battleSpeed,
  canControlSpeed = false,
  onSetSpeed,
  windAngle,
  windStrength,
  onJumpTo,
  onResetHome,
}: TwMinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingRef = useRef(false);
  const topoCacheRef = useRef<{
    key: string;
    canvas: HTMLCanvasElement;
  } | null>(null);

  const liveRef = useRef({ mapSpec, frame, myTeam, cam });
  liveRef.current = { mapSpec, frame, myTeam, cam };

  const effectiveTeam = myTeam ?? 0;
  const effectiveSpeed: TwBattleSpeed = battleSpeed ?? frame?.battleSpeed ?? 1;
  const effectiveWindAngle =
    windAngle !== undefined && Number.isFinite(windAngle)
      ? windAngle
      : frame?.windAngle !== undefined && Number.isFinite(frame.windAngle)
        ? frame.windAngle
        : Math.PI * 0.25;
  const effectiveWindStrength =
    windStrength !== undefined && Number.isFinite(windStrength)
      ? windStrength
      : frame?.windStrength !== undefined && Number.isFinite(frame.windStrength)
        ? frame.windStrength
        : 1;
  const windDirName = windCompassLabel(effectiveWindAngle);
  const windDeg = Math.round((effectiveWindAngle * 180) / Math.PI);

  // Tính toán Thanh Cân Bằng Lực Lượng (Balance of Power: Quân Ta % vs Địch %)
  const allyPct = useMemo(() => {
    if (!frame) return 50;
    const bop = frame.balanceOfPower;
    if (Array.isArray(bop) && bop.length >= 2) {
      const total = bop.reduce((acc, v) => acc + Math.max(0, Number(v) || 0), 0);
      if (total > 0) {
        const mine = Math.max(0, Number(bop[effectiveTeam] ?? bop[0]) || 0);
        const rawPct = Math.round((mine / total) * 100);
        if (mine <= 0) return 0;
        if (mine >= total) return 100;
        return Math.max(4, Math.min(96, rawPct));
      }
    }

    let allyPower = 0;
    let enemyPower = 0;
    for (const s of frame.sides) {
      if (s.team === effectiveTeam) allyPower += Math.max(0, s.totalMen);
      else enemyPower += Math.max(0, s.totalMen);
    }
    const sum = allyPower + enemyPower;
    if (sum <= 0) return 50;
    const pct = Math.round((allyPower / sum) * 100);
    if (allyPower <= 0) return 0;
    if (enemyPower <= 0) return 100;
    return Math.max(4, Math.min(96, pct));
  }, [frame, effectiveTeam]);

  const timeRemainingSec = frame?.timeRemainingSec ?? 900;
  const clockWarn = frame !== null && timeRemainingSec <= 120;

  // Vòng lặp vẽ radar chiến thuật 60 FPS (cập nhật mượt khung nhìn camera + hiệu ứng đấu tướng)
  useEffect(() => {
    let rafId = 0;

    const renderTick = () => {
      rafId = window.requestAnimationFrame(renderTick);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { mapSpec: ms, frame: fr, myTeam: mt, cam: cm } = liveRef.current;
      const refTeam = mt ?? 0;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = canvas.clientWidth || LOGICAL_W;
      const cssH = canvas.clientHeight || LOGICAL_H;
      const targetW = Math.max(1, Math.round(cssW * dpr));
      const targetH = Math.max(1, Math.round(cssH * dpr));

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const cacheKey = `${ms.id}:${cssW}x${cssH}@${dpr}`;
      if (!topoCacheRef.current || topoCacheRef.current.key !== cacheKey) {
        topoCacheRef.current = {
          key: cacheKey,
          canvas: buildTopographicBase(ms, cssW, cssH, dpr),
        };
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(topoCacheRef.current.canvas, 0, 0, cssW, cssH);

      const sx = cssW / Math.max(1, ms.width);
      const sy = cssH / Math.max(1, ms.height);
      const now = performance.now();

      const sideMap = new Map<number, TwSideSummary>();
      const capMap = new Map<number, TwCaptureState>();
      if (fr) {
        for (const s of fr.sides) sideMap.set(s.idx, s);
        for (const c of fr.captures) capMap.set(c.id, c);
      }

      // 1. Cờ ĐàiChiếm Đóng (Capture Point Flags)
      for (const cp of ms.capturePoints) {
        const cx = cp.x * sx;
        const cy = cp.y * sy;
        const cr = Math.max(4.5, cp.radius * ((sx + sy) * 0.5));
        const st = capMap.get(cp.id);
        const ownerTeam = st ? st.ownerTeam : -1;
        const isAllyCap = ownerTeam !== -1 && ownerTeam === refTeam;
        const isEnemyCap = ownerTeam !== -1 && ownerTeam !== refTeam;

        const flagFill = isAllyCap ? '#2f9e44' : isEnemyCap ? '#e03131' : '#ebe4d4';

        ctx.save();
        ctx.strokeStyle = isAllyCap
          ? 'rgba(47, 158, 68, 0.72)'
          : isEnemyCap
            ? 'rgba(224, 49, 49, 0.72)'
            : 'rgba(90, 74, 46, 0.55)';
        ctx.fillStyle = isAllyCap
          ? 'rgba(47, 158, 68, 0.16)'
          : isEnemyCap
            ? 'rgba(224, 49, 49, 0.16)'
            : 'rgba(235, 228, 212, 0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Cột cờ + lá cờ tam giác
        ctx.strokeStyle = '#181410';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(cx - 1.5, cy + 3.5);
        ctx.lineTo(cx - 1.5, cy - 4.5);
        ctx.stroke();

        ctx.fillStyle = flagFill;
        ctx.beginPath();
        ctx.moveTo(cx - 1.5, cy - 4.5);
        ctx.lineTo(cx + 4.8, cy - 2.3);
        ctx.lineTo(cx - 1.5, cy - 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(18, 16, 14, 0.8)';
        ctx.lineWidth = 0.7;
        ctx.stroke();
        ctx.restore();
      }

      // 1b. Biển Lửa Hỏa Công (Active Wildfires) & Đạo Cụ Bẫy Chiến Trường (Deployables)
      if (fr) {
        if (fr.fires && fr.fires.length > 0) {
          for (const fire of fr.fires) {
            if (fire.leftSec <= 0 || fire.intensity <= 0) continue;
            const fx = fire.x * sx;
            const fy = fire.y * sy;
            const baseR = Math.max(2.6, Math.min(9.5, fire.radius * ((sx + sy) * 0.5)));
            const flick = 0.78 + 0.22 * Math.sin(now / 95 + fire.id * 2.1);
            const alpha = Math.max(0.28, Math.min(0.95, fire.intensity));

            ctx.save();
            ctx.fillStyle = `rgba(255, 72, 24, ${(0.34 * alpha).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(fx, fy, baseR * 1.32 * flick, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = `rgba(255, 96, 32, ${(0.9 * alpha).toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(fx, fy, Math.max(2.1, baseR * 0.65 * flick), 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffd43b';
            ctx.beginPath();
            ctx.arc(fx, fy, Math.max(1.1, baseR * 0.3 * flick), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        if (fr.deployables && fr.deployables.length > 0) {
          for (const dep of fr.deployables) {
            if (dep.hp <= 0) continue;
            const depSide = sideMap.get(dep.ownerIdx);
            const depTeam = Number.isFinite(dep.team)
              ? dep.team
              : depSide
                ? depSide.team
                : dep.ownerIdx;
            const isAllyDep = depTeam === refTeam;
            if (!isAllyDep && dep.hidden) continue;

            const dx = dep.x * sx;
            const dy = dep.y * sy;
            const dr = 2.6;

            ctx.save();
            ctx.fillStyle = isAllyDep ? '#fcc419' : '#ff922b';
            ctx.strokeStyle = 'rgba(20, 16, 10, 0.86)';
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.moveTo(dx, dy - dr);
            ctx.lineTo(dx + dr, dy);
            ctx.lineTo(dx, dy + dr);
            ctx.lineTo(dx - dr, dy);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // 2. Khối Đội Hình Trung Đoàn Xoay Góc (Angled Regiment Blocks)
      if (fr) {
        const blinkOn = Math.floor(now / 220) % 2 === 0;
        for (const reg of fr.regiments) {
          if (reg.men <= 0 || reg.hp <= 0 || reg.anim === 'dead' || reg.moraleState === 'shattered') {
            continue;
          }
          const side = sideMap.get(reg.ownerIdx);
          const regTeam = side ? side.team : reg.ownerIdx;
          const isAlly = regTeam === refTeam;

          // Sương mù phục kích: không hiện quân địch đang ẩn nấp trong rừng
          if (!isAlly && reg.hidden) continue;

          const rx = reg.x * sx;
          const ry = reg.y * sy;
          const routing = reg.moraleState === 'routing' || reg.anim === 'rout';

          const blockW = Math.max(4.5, Math.min(14, reg.width * sx * 1.15));
          const blockD = Math.max(2.4, Math.min(6, reg.depth * sy * 1.25));

          ctx.save();
          ctx.translate(rx, ry);
          ctx.rotate(reg.facing);
          if (isAlly && reg.hidden) ctx.globalAlpha = 0.72;

          const fillMain = routing && blinkOn
            ? '#ffffff'
            : isAlly
              ? '#2f9e44'
              : '#e03131';
          const frontEdge = isAlly ? '#8ce99a' : '#ffc9c9';

          if (reg.isGeneral) {
            // Tướng lĩnh: huy hiệu thoi viền vàng kim nổi bật
            ctx.fillStyle = fillMain;
            ctx.strokeStyle = '#ffd43b';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(4.2, 0);
            ctx.lineTo(0, 3.6);
            ctx.lineTo(-4.2, 0);
            ctx.lineTo(0, -3.6);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.fillStyle = fillMain;
            ctx.strokeStyle = 'rgba(12, 14, 16, 0.78)';
            ctx.lineWidth = 0.75;
            ctx.fillRect(-blockD * 0.5, -blockW * 0.5, blockD, blockW);
            ctx.strokeRect(-blockD * 0.5, -blockW * 0.5, blockD, blockW);

            // Viền sáng mặt trước đội hình để đọc hướng quay mặt
            ctx.strokeStyle = frontEdge;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(blockD * 0.5, -blockW * 0.5);
            ctx.lineTo(blockD * 0.5, blockW * 0.5);
            ctx.stroke();
          }

          ctx.restore();
        }

        // 3. Hiệu Ứng Song Kiếm Đấu Tướng Nhấp Nháy (Duel Crossed-Swords Flash)
        for (const duel of fr.duels) {
          const dx = duel.x * sx;
          const dy = duel.y * sy;
          const pulse = 0.5 + 0.5 * Math.sin(now / 150);
          const ringR = 6 + pulse * 4.5;

          ctx.save();
          ctx.strokeStyle = `rgba(224, 49, 49, ${0.85 - pulse * 0.35})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(dx, dy, ringR, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = 'rgba(20, 14, 10, 0.88)';
          ctx.strokeStyle = '#ffd43b';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(dx, dy, 5.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Vẽ song kiếm chéo
          ctx.strokeStyle = pulse > 0.5 ? '#fff3bf' : '#ffd43b';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(dx - 2.8, dy + 2.8);
          ctx.lineTo(dx + 2.8, dy - 2.8);
          ctx.moveTo(dx - 2.8, dy - 2.8);
          ctx.lineTo(dx + 2.8, dy + 2.8);
          ctx.stroke();
          ctx.restore();
        }
      }

      // 4. Khung Trắng Hình Thang Tầm Nhìn Camera 2.5D (White Camera Frustum Trapezoid)
      const zoom = Math.max(0.2, cm.zoom || 0.68);
      const vw = cm.viewW > 0 ? cm.viewW : window.innerWidth || 1280;
      const vh = cm.viewH > 0 ? cm.viewH : window.innerHeight || 720;
      const worldVisW = vw / zoom;
      const worldVisH = vh / (zoom * TW_ISO_TILT);

      const rectW = Math.min(cssW - 2, Math.max(12, worldVisW * sx));
      const rectH = Math.min(cssH - 2, Math.max(9, worldVisH * sy));
      const cx = Math.max(rectW * 0.42 + 1, Math.min(cssW - rectW * 0.42 - 1, cm.x * sx));
      const cy = Math.max(rectH * 0.5 + 1, Math.min(cssH - rectH * 0.5 - 1, cm.y * sy));

      // Đáy trên (xa camera — chân trời Bắc) loe rộng hơn đáy dưới (gần camera) chuẩn phối cảnh Total War
      const topHalfW = Math.min(cssW * 0.49, rectW * 0.58);
      const botHalfW = rectW * 0.42;
      const topY = Math.max(0.8, cy - rectH * 0.5);
      const botY = Math.min(cssH - 0.8, cy + rectH * 0.5);

      const drawFrustumPath = () => {
        ctx.beginPath();
        ctx.moveTo(Math.max(0.8, cx - topHalfW), topY);
        ctx.lineTo(Math.min(cssW - 0.8, cx + topHalfW), topY);
        ctx.lineTo(Math.min(cssW - 0.8, cx + botHalfW), botY);
        ctx.lineTo(Math.max(0.8, cx - botHalfW), botY);
        ctx.closePath();
      };

      ctx.save();
      drawFrustumPath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fill();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(10, 12, 14, 0.78)';
      ctx.lineWidth = 2.6;
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.45;
      ctx.stroke();
      ctx.restore();
    };

    rafId = window.requestAnimationFrame(renderTick);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  const jumpFromPointer = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onJumpTo(Math.round(nx * mapSpec.width), Math.round(ny * mapSpec.height));
  };

  const handleZoomStep = (factor: number) => {
    const vw = cam.viewW > 0 ? cam.viewW : window.innerWidth || 1280;
    const vh = cam.viewH > 0 ? cam.viewH : window.innerHeight || 720;
    zoomTwCameraAt(
      cam,
      cam.zoom * factor,
      vw * 0.5,
      vh * 0.5,
      mapSpec.width,
      mapSpec.height,
    );
  };

  return (
    <div className="tw-minimap-dock">
      {/* 1. Top Circular Battle Timer Pill + Home Camera + Zoom +/- */}
      <div className="tw-minimap-top">
        <div
          className={`tw-battle-clock${clockWarn ? ' warn' : ''}`}
          title="Thời gian chiến trận còn lại · Battle Timer"
        >
          <span aria-hidden="true">⏱</span>
          <span>{formatBattleClock(timeRemainingSec)}</span>
        </div>

        <button
          type="button"
          className="tw-mini-btn"
          onClick={onResetHome}
          title="Về Trung Quân Đại Doanh · Home Camera (Space)"
        >
          ⌂
        </button>

        <button
          type="button"
          className="tw-mini-btn"
          onClick={() => handleZoomStep(1.22)}
          title="Phóng To Chiến Trường · Zoom In (+)"
        >
          +
        </button>

        <button
          type="button"
          className="tw-mini-btn"
          onClick={() => handleZoomStep(1 / 1.22)}
          title="Thu Nhỏ Chiến Trường · Zoom Out (-)"
        >
          −
        </button>
      </div>

      {/* 1b. TW3K Top-of-Minimap Speed Control Arc & Wind Compass Vane */}
      <div className="tw-minimap-controls">
        <div
          className="tw-minimap-speed-bar"
          role="group"
          aria-label="Điều chỉnh tốc độ chiến trận"
        >
          {TW_BATTLE_SPEEDS.map((spd) => {
            const isAct = effectiveSpeed === spd;
            const label = spd === 0 && isAct ? '⏸ TẠM DỪNG' : speedButtonText(spd);
            const tip =
              spd === 0
                ? 'Tạm dừng chiến thuật để ra lệnh điều quân (Phím P)'
                : spd === 0.5
                  ? 'Quay chậm chiến thuật ½× (Slow Motion)'
                  : `Tốc độ chiến trận ${spd}×`;
            return (
              <button
                key={spd}
                type="button"
                className={`tw-speed-btn${isAct ? ' on' : ''}${spd === 0 && isAct ? ' paused-pill' : ''}`}
                disabled={!canControlSpeed}
                onClick={() => onSetSpeed?.(spd)}
                title={
                  canControlSpeed
                    ? tip
                    : `${tip} (Chỉ Chủ phòng điều chỉnh tốc độ trong trận nhiều người)`
                }
              >
                {label}
              </button>
            );
          })}
        </div>

        <div
          className="tw-wind-vane"
          title="🌬️ Hướng Gió: Thuận chiều tăng +8% tầm tên & lan Hỏa Công"
        >
          <span
            className="tw-wind-arrow"
            style={{
              transform: `rotate(${windDeg}deg)`,
              opacity: effectiveWindStrength > 0.2 ? 1 : 0.55,
            }}
            aria-hidden="true"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M1.5 6H9.8M9.8 6L6.6 2.8M9.8 6L6.6 9.2"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="tw-wind-label">Hướng Gió {windDirName}</span>
        </div>
      </div>

      {/* 2. Parchment / Topographic 216x156 Tactical Radar Canvas */}
      <div className="tw-minimap-frame">
        <canvas
          ref={canvasRef}
          className="tw-minimap-canvas"
          width={LOGICAL_W}
          height={LOGICAL_H}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            e.currentTarget.setPointerCapture(e.pointerId);
            draggingRef.current = true;
            jumpFromPointer(e);
          }}
          onPointerMove={(e) => {
            if (!draggingRef.current) return;
            jumpFromPointer(e);
          }}
          onPointerUp={(e) => {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onPointerCancel={(e) => {
            draggingRef.current = false;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
        />
      </div>

      {/* 3. Balance of Power Bar (Green Allied Strength % vs Crimson Enemy Strength %) */}
      <div
        className="tw-bop-bar"
        title={`Cân Bằng Lực Lượng (Balance of Power): Quân Ta ${allyPct}% — Địch Quân ${
          100 - allyPct
        }%`}
      >
        <i className="tw-bop-ally" style={{ width: `${allyPct}%` }} />
        <span className="tw-bop-enemy" />
      </div>
      <div className="tw-bop-labels">
        <span className="good-text">Quân Ta {allyPct}%</span>
        <span className="bad-text">Địch {100 - allyPct}%</span>
      </div>
    </div>
  );
}

export default TwMinimap;
