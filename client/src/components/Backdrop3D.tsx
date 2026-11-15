import { useEffect, useRef } from 'react';

interface StarNode {
  x: number;
  y: number;
  z: number;
  r: number;
  tint: string;
}

interface PolyMesh {
  cx: number;
  cy: number;
  cz: number;
  size: number;
  rx: number;
  ry: number;
  vrx: number;
  vry: number;
  tint: string;
}

const OCTA_VERTS: readonly [number, number, number][] = [
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, 1],
  [-1, 0, 0],
  [0, 0, -1],
  [0, -1, 0],
];

const OCTA_EDGES: readonly [number, number][] = [
  [0, 1], [0, 2], [0, 3], [0, 4],
  [5, 1], [5, 2], [5, 3], [5, 4],
  [1, 2], [2, 3], [3, 4], [4, 1],
];

/**
 * Pure-JS 3D perspective canvas backdrop: rotating wireframe polyhedra,
 * depth starfield, and responsive pointer parallax without external 3D bundle cost.
 */
export default function Backdrop3D({ accentColor = '#f97316' }: { accentColor?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const accentRef = useRef(accentColor);
  accentRef.current = accentColor;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let mx = 0;
    let my = 0;
    let smx = 0;
    let smy = 0;

    const stars: StarNode[] = Array.from({ length: 58 }, (_, i) => ({
      x: ((i * 73) % 200 - 100) * 11,
      y: ((i * 41) % 200 - 100) * 7,
      z: 180 + ((i * 97) % 820),
      r: 1.1 + (i % 3) * 0.65,
      tint: i % 4 === 0 ? 'accent' : i % 3 === 0 ? 'cool' : 'base',
    }));

    const meshes: PolyMesh[] = [
      { cx: -380, cy: -150, cz: 520, size: 78, rx: 0.4, ry: 0.2, vrx: 0.0045, vry: 0.007, tint: 'accent' },
      { cx: 410, cy: -120, cz: 560, size: 92, rx: 1.1, ry: 0.6, vrx: -0.0038, vry: 0.006, tint: 'cool' },
      { cx: -290, cy: 210, cz: 640, size: 68, rx: 0.8, ry: 1.4, vrx: 0.005, vry: -0.005, tint: 'cool' },
      { cx: 340, cy: 220, cz: 590, size: 74, rx: 0.2, ry: 0.9, vrx: -0.0042, vry: 0.0058, tint: 'accent' },
    ];

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();

    const onPointerMove = (e: PointerEvent) => {
      if (w <= 0 || h <= 0) return;
      mx = (e.clientX / w - 0.5) * 2;
      my = (e.clientY / h - 0.5) * 2;
    };

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const project = (x: number, y: number, z: number, fov = 560) => {
      const denom = Math.max(60, fov + z);
      const s = fov / denom;
      return {
        sx: w * 0.5 + x * s,
        sy: h * 0.48 + y * s,
        s,
      };
    };

    const drawFrame = (animate: boolean) => {
      const dark = document.documentElement.dataset.theme === 'dark';
      const accent = accentRef.current || '#f97316';
      const coolColor = dark ? 'rgba(56, 189, 248, 0.34)' : 'rgba(14, 116, 144, 0.22)';
      const baseStar = dark ? 'rgba(226, 232, 240, 0.34)' : 'rgba(15, 23, 42, 0.16)';
      const gridStroke = dark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(15, 23, 42, 0.055)';

      smx += (mx - smx) * 0.06;
      smy += (my - smy) * 0.06;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Subtle 3D perspective floor grid
      ctx.save();
      ctx.strokeStyle = gridStroke;
      ctx.lineWidth = 1;
      const horizonY = h * 0.72 + smy * 14;
      const gridCols = 14;
      for (let i = -gridCols; i <= gridCols; i++) {
        const bx = w * 0.5 + i * (w / 10) + smx * 46;
        const tx = w * 0.5 + i * 28 + smx * 16;
        ctx.beginPath();
        ctx.moveTo(tx, horizonY);
        ctx.lineTo(bx, h + 20);
        ctx.stroke();
      }
      for (let row = 1; row <= 7; row++) {
        const t = Math.pow(row / 7, 1.8);
        const y = horizonY + t * (h + 16 - horizonY);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.restore();

      // Depth starfield
      for (let i = 0; i < stars.length; i++) {
        const st = stars[i];
        if (animate) {
          st.z -= 0.75;
          if (st.z < 80) st.z = 980;
        }
        const px = st.x - smx * 70;
        const py = st.y - smy * 50;
        const p = project(px, py, st.z);
        if (p.sx < -20 || p.sx > w + 20 || p.sy < -20 || p.sy > h + 20) continue;
        const alpha = Math.max(0.08, Math.min(0.85, (1 - st.z / 1000) * 0.9));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = st.tint === 'accent' ? accent : st.tint === 'cool' ? coolColor : baseStar;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, Math.max(0.8, st.r * p.s * 1.45), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Floating 3D rotating octahedra
      for (let m = 0; m < meshes.length; m++) {
        const mesh = meshes[m];
        if (animate) {
          mesh.rx += mesh.vrx;
          mesh.ry += mesh.vry;
        }
        const cx = mesh.cx - smx * 55;
        const cy = mesh.cy - smy * 40;
        const cosX = Math.cos(mesh.rx);
        const sinX = Math.sin(mesh.rx);
        const cosY = Math.cos(mesh.ry);
        const sinY = Math.sin(mesh.ry);

        const pts = OCTA_VERTS.map(([vx, vy, vz]) => {
          const x1 = vx * cosY - vz * sinY;
          const z1 = vx * sinY + vz * cosY;
          const y2 = vy * cosX - z1 * sinX;
          const z2 = vy * sinX + z1 * cosX;
          return project(cx + x1 * mesh.size, cy + y2 * mesh.size, mesh.cz + z2 * mesh.size);
        });

        ctx.save();
        ctx.strokeStyle = mesh.tint === 'accent' ? accent : coolColor;
        ctx.globalAlpha = dark ? 0.24 : 0.14;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (const [a, b] of OCTA_EDGES) {
          ctx.moveTo(pts[a].sx, pts[a].sy);
          ctx.lineTo(pts[b].sx, pts[b].sy);
        }
        ctx.stroke();
        ctx.restore();
      }
    };

    if (reducedMotion) {
      drawFrame(false);
    } else {
      const loop = () => {
        drawFrame(true);
        raf = window.requestAnimationFrame(loop);
      };
      raf = window.requestAnimationFrame(loop);
    }

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="backdrop-3d-canvas" aria-hidden="true" />;
}
