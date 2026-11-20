import { describe, expect, it } from 'vitest';
import { InputFocusManager } from '../../src/bridge/InputFocusManager';

describe('InputFocusManager — 5-Layer Focus Stack & Vietnamese IME Guard', () => {
  it('blocks gameplay hotkeys and Escape during Vietnamese IME composition (Telex/VNI)', () => {
    const fm = new InputFocusManager();
    fm.setAuthActive(false);
    expect(fm.getActiveLayer()).toBe('GAMEPLAY');
    expect(fm.shouldForwardToPhaser({ key: 'w' })).toBe(true);

    // Focus chat & start Vietnamese composition ("a" + "a" -> "â")
    fm.setChatFocused(true);
    fm.setImeComposing(true);
    expect(fm.getActiveLayer()).toBe('CHAT');
    expect(fm.shouldForwardToPhaser({ key: 'w', isComposing: true })).toBe(false);
    expect(fm.shouldForwardToPhaser({ key: '1', keyCode: 229 })).toBe(false);
    expect(fm.handleEscapeKey({ key: 'Escape', isComposing: true }).action).toBe('IGNORED_IME');

    // Finish IME composition
    fm.setImeComposing(false);
    expect(fm.handleEscapeKey({ key: 'Escape' }).action).toBe('BLURRED_CHAT');
    expect(fm.getActiveLayer()).toBe('GAMEPLAY');
  });

  it('pops modals in strict LIFO order before opening Settings', () => {
    const fm = new InputFocusManager();
    fm.setAuthActive(false);
    fm.pushModal('INVENTORY');
    fm.pushModal('ENHANCEMENT');
    expect(fm.getActiveLayer()).toBe('MODAL');
    expect(fm.shouldForwardToPhaser({ key: 'w' })).toBe(false);

    const r1 = fm.handleEscapeKey({ key: 'Escape' });
    expect(r1).toEqual({ action: 'POPPED_MODAL', modalId: 'ENHANCEMENT' });
    const r2 = fm.handleEscapeKey({ key: 'Escape' });
    expect(r2).toEqual({ action: 'POPPED_MODAL', modalId: 'INVENTORY' });
    const r3 = fm.handleEscapeKey({ key: 'Escape' });
    expect(r3.action).toBe('OPEN_SETTINGS');
  });
});
