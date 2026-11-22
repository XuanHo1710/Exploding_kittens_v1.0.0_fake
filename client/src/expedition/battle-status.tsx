import { STATUS_DEFS, STATUS_IDS, type CombatantRuntime, type StatusId } from './shared';
import { expeditionAssetUrl, getCachedImage, STATUS_ICON_ATLAS } from './store';

const COLUMNS = 5;
const FRAME = 48;
const ROWS = Math.ceil(STATUS_IDS.length / COLUMNS);
const position = new Map<string, number>(STATUS_IDS.map((id, i) => [id, i]));
const backgroundImage = `url("${expeditionAssetUrl(STATUS_ICON_ATLAS)}")`;

function visibleStatuses(unit: CombatantRuntime) {
  return (unit.statuses ?? []).filter((status) => position.has(status.id) && status.turns > 0 && status.stacks > 0);
}

function statusLabel(status: ReturnType<typeof visibleStatuses>[number]): string {
  const def = STATUS_DEFS[status.id as StatusId];
  return `${def.nameVi} · ${def.kind === 'buff' ? 'Có lợi' : 'Bất lợi'} · ${status.stacks} tầng · ${status.turns} lượt · ${def.descVi}`;
}

export function battleStatusTitle(unit: CombatantRuntime): string {
  return visibleStatuses(unit).map(statusLabel).join('\n');
}

export function BattleStatusRow({ unit }: { unit: CombatantRuntime }) {
  const statuses = visibleStatuses(unit);
  if (!statuses.length) return null;
  return <span className="ui-status-row" role="group" aria-label={`Hiệu ứng của ${unit.nameVi}`}>
    {statuses.map((status) => {
      const index = position.get(status.id)!;
      const def = STATUS_DEFS[status.id as StatusId];
      const label = statusLabel(status);
      return <span key={status.id} className={`ui-status-badge ${def.kind}`} role="img" aria-label={label} title={label} data-status={status.id}>
        <span className="ui-status-picture" aria-hidden="true" style={{ backgroundImage,
          backgroundSize: `${COLUMNS * 100}% ${ROWS * 100}%`,
          backgroundPosition: `${index % COLUMNS * 100 / (COLUMNS - 1)}% ${Math.floor(index / COLUMNS) * 100 / (ROWS - 1)}%`,
        }} />
        <span className="ui-status-count" aria-hidden="true">{status.stacks > 1 ? `×${status.stacks} · ` : ''}{status.turns}</span>
      </span>;
    })}
  </span>;
}

export function drawBattleStatusIcons(ctx: CanvasRenderingContext2D, unit: CombatantRuntime, x: number, y: number): void {
  const statuses = visibleStatuses(unit);
  if (!statuses.length) return;
  const atlas = getCachedImage(STATUS_ICON_ATLAS);
  const side = 21;
  const shown = statuses.slice(0, 5);
  const overflow = statuses.length - shown.length;
  let left = Math.round(x - ((shown.length + Number(overflow > 0)) * side) / 2);
  const top = Math.round(y);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.font = '700 9px sans-serif';
  ctx.textAlign = 'center';
  for (const status of shown) {
    const def = STATUS_DEFS[status.id as StatusId];
    const index = position.get(status.id)!;
    ctx.fillStyle = def.kind === 'buff' ? '#10241f' : '#2c141d';
    ctx.fillRect(left, top, side - 2, side);
    ctx.fillStyle = def.kind === 'buff' ? '#87cca9' : '#e89798';
    ctx.fillRect(left, def.kind === 'buff' ? top : top + side - 2, side - 2, 2);
    if (atlas) ctx.drawImage(atlas, index % COLUMNS * FRAME, Math.floor(index / COLUMNS) * FRAME,
      FRAME, FRAME, left + 1, top + 2, side - 4, side - 4);
    else ctx.fillText(def.icon, left + 9, top + 14);
    if (status.stacks > 1) {
      ctx.fillStyle = '#151118';
      ctx.fillRect(left + 11, top + 12, 8, 9);
      ctx.fillStyle = '#fff4da';
      ctx.fillText(String(status.stacks), left + 15, top + 20);
    }
    left += side;
  }
  if (overflow) {
    ctx.fillStyle = '#201825';
    ctx.fillRect(left, top, side - 2, side);
    ctx.fillStyle = '#fff4da';
    ctx.fillText(`+${overflow}`, left + 9, top + 14);
  }
  ctx.restore();
}
