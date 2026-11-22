export const CONTROL_LIST = [
  { id: 'up', label: 'Đi lên', key: 'KeyW', alt: 'ArrowUp', group: 'field' },
  { id: 'left', label: 'Sang trái', key: 'KeyA', alt: 'ArrowLeft', group: 'field' },
  { id: 'down', label: 'Đi xuống', key: 'KeyS', alt: 'ArrowDown', group: 'field' },
  { id: 'right', label: 'Sang phải', key: 'KeyD', alt: 'ArrowRight', group: 'field' },
  { id: 'sprint', label: 'Chạy', key: 'ShiftLeft', alt: 'ShiftRight', group: 'field' },
  { id: 'interact', label: 'Tương tác / đu dây / leo thang', key: 'KeyE', group: 'field' },
  { id: 'grip', label: 'Nhảy bám', key: 'Space', group: 'field' },
  { id: 'parry', label: 'Đỡ', key: 'KeyE', group: 'battle' },
  { id: 'dodge', label: 'Né', key: 'Space', group: 'battle' },
  { id: 'counter', label: 'Phản Tuyệt Kỹ (từ vùng III)', key: 'KeyW', group: 'battle' },
  { id: 'basic', label: 'Đánh thường', key: 'KeyJ', group: 'battle' },
  { id: 'attacker', label: 'Chọn đồng đội tiếp theo', key: 'Tab', group: 'battle' },
] as const;

export type ControlAction = typeof CONTROL_LIST[number]['id'];
export type ControlBindings = Partial<Record<ControlAction, string>>;
const STORAGE_KEY = 'astral-expedition.controls.v1';
const VALID_CODE = /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Space|Tab|Enter|Backspace|Bracket(Left|Right)|Semicolon|Comma|Period|Slash)$/;

export function controlCodes(bindings: ControlBindings, action: ControlAction): string[] {
  const entry = CONTROL_LIST.find((candidate) => candidate.id === action)!;
  return bindings[action] ? [bindings[action]] : 'alt' in entry ? [entry.key, entry.alt] : [entry.key];
}

export function keyLabel(code: string): string {
  const arrows: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  return arrows[code] ?? code.replace(/^(Key|Digit)/, '').replace(/(Left|Right)$/, '');
}

export function setBinding(current: ControlBindings, action: ControlAction, code: string): ControlBindings | null {
  if (!VALID_CODE.test(code)) return null;
  const group = CONTROL_LIST.find((entry) => entry.id === action)?.group;
  if (CONTROL_LIST.some((entry) => entry.id !== action && entry.group === group && controlCodes(current, entry.id).includes(code))) return null;
  return { ...current, [action]: code };
}

export function loadBindings(): ControlBindings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    const result: ControlBindings = {};
    for (const entry of CONTROL_LIST) {
      const key = saved?.[entry.id];
      if (typeof key === 'string' && VALID_CODE.test(key)) result[entry.id] = key;
    }
    return CONTROL_LIST.every((entry) => {
      const code = result[entry.id];
      return !code || setBinding(result, entry.id, code) !== null;
    }) ? result : {};
  } catch {
    return {};
  }
}

export function saveBindings(bindings: ControlBindings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings)); } catch { /* storage unavailable */ }
}
