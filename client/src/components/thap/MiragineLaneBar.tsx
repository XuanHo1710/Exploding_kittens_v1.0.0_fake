/**
 * Thanh bản đồ thu nhỏ chiến trường ngang 2040px của Miragine War (`.thap-lane-bar`):
 * - Vẽ địa hình, Cổng Triệu Hồi, Trụ Pha Lê, toàn bộ đơn vị lính sống và khung camera qua `renderLaneMinimap`
 *   đồng bộ theo `requestAnimationFrame`, thay đổi props, nạp tài nguyên và `ResizeObserver`.
 * - Hỗ trợ nhấn & kéo ngang trên canvas để trượt nhanh tọa độ `worldX ∈ [0 .. mapW]`.
 * - Cụm nút điều khiển camera gọn bên cạnh: `<`, `>`, `-`, `+`, `↺`.
 */
import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { THAP_ARENA_H, THAP_ARENA_W } from '../../../../shared/src';
import { renderLaneMinimap } from '../../thap/renderMinimap';
import { playThap } from '../../thap/sound';
import { onMiragineAssetLoad } from '../../thap/sprites';
import type { MiragineLaneBarProps } from './miragineTypes';

const LANE_BAR_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  height: 'auto',
  minHeight: 24,
  padding: '2px 4px',
  cursor: 'default',
};

const LANE_TRACK_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
  width: 'auto',
  height: 18,
  borderRadius: 999,
  overflow: 'hidden',
  cursor: 'pointer',
  touchAction: 'none',
};

const LANE_CONTROLS_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
  flex: 'none',
  padding: '1px 3px',
  borderRadius: 999,
  background: 'rgba(10, 14, 24, 0.78)',
  border: '1px solid rgba(255, 255, 255, 0.14)',
};

const CAM_BTN_STYLE: CSSProperties = {
  width: 22,
  height: 20,
  padding: 0,
  borderRadius: 999,
  border: '1px solid rgba(255, 255, 255, 0.16)',
  background: 'rgba(18, 25, 40, 0.92)',
  color: '#f4f1ea',
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1,
  display: 'grid',
  placeItems: 'center',
  flex: 'none',
  cursor: 'pointer',
};

function clientXToWorldX(canvas: HTMLCanvasElement, clientX: number, mapW: number): number {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0) return mapW * 0.5;
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return ratio * mapW;
}

/** Thanh cuộn chiến trường ngang 2040px kết hợp cụm nút pan/zoom/reset camera. */
export function MiragineLaneBar({
  mapW,
  mapH,
  cam,
  viewportSize,
  hudInsets,
  bases: _bases,
  myIdx,
  onFocusWorldX,
  onPanLeft,
  onPanRight,
  onZoomIn,
  onZoomOut,
  onResetView,
}: MiragineLaneBarProps) {
  const effectiveMapW = mapW && mapW > 0 ? mapW : THAP_ARENA_W;
  const effectiveMapH = mapH && mapH > 0 ? mapH : THAP_ARENA_H;

  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const dragPointerIdRef = useRef<number | null>(null);

  const renderStateRef = useRef({
    mapW: effectiveMapW,
    mapH: effectiveMapH,
    cam,
    viewportSize,
    hudInsets,
    myIdx,
  });
  renderStateRef.current = {
    mapW: effectiveMapW,
    mapH: effectiveMapH,
    cam,
    viewportSize,
    hudInsets,
    myIdx,
  };

  const drawMinimap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let { w, h } = sizeRef.current;
    if (w <= 0 || h <= 0) {
      const rect = canvas.getBoundingClientRect();
      w = Math.round(rect.width || canvas.clientWidth);
      h = Math.round(rect.height || canvas.clientHeight);
      if (w > 0 && h > 0) sizeRef.current = { w, h };
    }
    if (w <= 0 || h <= 0) return;

    const s = renderStateRef.current;
    renderLaneMinimap(canvas, w, h, {
      mapW: s.mapW,
      mapH: s.mapH,
      cam: s.cam,
      viewportW: s.viewportSize.width,
      viewportH: s.viewportSize.height,
      pad: s.hudInsets,
      myIdx: s.myIdx,
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const track = trackRef.current;
    if (!canvas) return;

    const measureAndDraw = () => {
      const rect = (track ?? canvas).getBoundingClientRect();
      const w = Math.round(rect.width || canvas.clientWidth);
      const h = Math.round(rect.height || canvas.clientHeight);
      if (w > 0 && h > 0) {
        sizeRef.current = { w, h };
      }
      drawMinimap();
    };

    measureAndDraw();

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const w = Math.round(entry.contentRect.width);
          const h = Math.round(entry.contentRect.height);
          if (w > 0 && h > 0) sizeRef.current = { w, h };
        }
        drawMinimap();
      });
      ro.observe(track ?? canvas);
    }

    const unsubAsset = onMiragineAssetLoad(drawMinimap);

    let rafId = 0;
    const loop = () => {
      drawMinimap();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      unsubAsset();
    };
  }, [drawMinimap]);

  useEffect(() => {
    drawMinimap();
  }, [
    drawMinimap,
    effectiveMapW,
    effectiveMapH,
    cam,
    cam.x,
    cam.y,
    cam.zoom,
    viewportSize.width,
    viewportSize.height,
    hudInsets.top,
    hudInsets.bottom,
    hudInsets.left,
    hudInsets.right,
    myIdx,
  ]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    dragPointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* Bỏ qua nếu môi trường không hỗ trợ pointer capture */
    }
    onFocusWorldX(clientXToWorldX(e.currentTarget, e.clientX, effectiveMapW));
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragPointerIdRef.current !== e.pointerId) return;
    onFocusWorldX(clientXToWorldX(e.currentTarget, e.clientX, effectiveMapW));
  };

  const endDrag = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragPointerIdRef.current === e.pointerId) {
      dragPointerIdRef.current = null;
    }
    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }
    } catch {
      /* ignore */
    }
  };

  const cameraControls = [
    { key: 'pan-left', label: '<', title: 'Kéo camera sang trái ([)', ariaLabel: 'Kéo camera sang trái', onClick: onPanLeft },
    { key: 'pan-right', label: '>', title: 'Kéo camera sang phải (])', ariaLabel: 'Kéo camera sang phải', onClick: onPanRight },
    { key: 'zoom-out', label: '-', title: 'Thu nhỏ (-)', ariaLabel: 'Thu nhỏ', onClick: onZoomOut },
    { key: 'zoom-in', label: '+', title: 'Phóng to (+)', ariaLabel: 'Phóng to', onClick: onZoomIn },
    { key: 'reset', label: '↺', title: 'Đặt lại toàn bộ góc nhìn', ariaLabel: 'Đặt lại góc nhìn', onClick: onResetView },
  ] as const;

  return (
    <div className="thap-lane-bar" style={LANE_BAR_STYLE}>
      <div ref={trackRef} className="thap-lane-track" style={LANE_TRACK_STYLE}>
        <canvas
          ref={canvasRef}
          aria-label="Bản đồ thu nhỏ chiến trường ngang"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>

      <div role="group" aria-label="Điều khiển camera" style={LANE_CONTROLS_STYLE}>
        {cameraControls.map((ctrl) => (
          <button
            key={ctrl.key}
            type="button"
            style={CAM_BTN_STYLE}
            disabled={!ctrl.onClick}
            title={ctrl.title}
            aria-label={ctrl.ariaLabel}
            onClick={() => {
              playThap('click');
              ctrl.onClick?.();
            }}
          >
            {ctrl.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default MiragineLaneBar;
