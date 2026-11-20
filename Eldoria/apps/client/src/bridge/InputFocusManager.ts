export type FocusLayer = 'AUTH' | 'MODAL' | 'CHAT' | 'BUILD_PLACEMENT' | 'GAMEPLAY';

export interface KeyboardGateEvent {
  key: string;
  isComposing?: boolean;
  keyCode?: number;
  targetTagName?: string;
}

/**
 * 5-Layer InputFocusManager with Vietnamese IME Composition Guard (Telex/VNI)
 * Guarantees WASD / Skill hotkeys never misfire while typing chat/forms or composing diacritics.
 */
export class InputFocusManager {
  private modalStack: string[] = [];
  private chatFocused = false;
  private authActive = true;
  private buildMode = false;
  private imeComposing = false;
  private readonly subscribers = new Set<() => void>();

  public subscribe(fn: () => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  private notify(): void {
    for (const fn of this.subscribers) fn();
  }

  public setAuthActive(active: boolean): void {
    this.authActive = active;
    this.notify();
  }

  public setChatFocused(focused: boolean): void {
    this.chatFocused = focused;
    this.notify();
  }

  public setBuildMode(active: boolean): void {
    this.buildMode = active;
    this.notify();
  }

  public setImeComposing(composing: boolean): void {
    this.imeComposing = composing;
  }

  public isImeComposing(): boolean {
    return this.imeComposing;
  }

  public pushModal(modalId: string): void {
    this.modalStack = this.modalStack.filter((m) => m !== modalId);
    this.modalStack.push(modalId);
    this.notify();
  }

  public popModal(): string | null {
    const popped = this.modalStack.pop() || null;
    this.notify();
    return popped;
  }

  public closeModal(modalId: string): void {
    this.modalStack = this.modalStack.filter((m) => m !== modalId);
    this.notify();
  }

  public clearModals(): void {
    this.modalStack = [];
    this.notify();
  }

  public getModalStack(): string[] {
    return [...this.modalStack];
  }

  public getActiveLayer(): FocusLayer {
    if (this.authActive) return 'AUTH';
    if (this.modalStack.length > 0) return 'MODAL';
    if (this.chatFocused) return 'CHAT';
    if (this.buildMode) return 'BUILD_PLACEMENT';
    return 'GAMEPLAY';
  }

  public shouldForwardToPhaser(evt?: KeyboardGateEvent): boolean {
    if (this.imeComposing) return false;
    if (evt?.isComposing || evt?.keyCode === 229) return false;
    const tag = evt?.targetTagName?.toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
    const layer = this.getActiveLayer();
    return layer === 'GAMEPLAY' || layer === 'BUILD_PLACEMENT';
  }

  public handleEscapeKey(evt?: KeyboardGateEvent): { action: 'IGNORED_IME' | 'POPPED_MODAL' | 'BLURRED_CHAT' | 'EXITED_BUILD' | 'OPEN_SETTINGS'; modalId?: string } {
    if (this.imeComposing || evt?.isComposing || evt?.keyCode === 229) {
      return { action: 'IGNORED_IME' };
    }
    if (this.modalStack.length > 0) {
      const popped = this.popModal()!;
      return { action: 'POPPED_MODAL', modalId: popped };
    }
    if (this.chatFocused) {
      this.setChatFocused(false);
      return { action: 'BLURRED_CHAT' };
    }
    if (this.buildMode) {
      this.setBuildMode(false);
      return { action: 'EXITED_BUILD' };
    }
    return { action: 'OPEN_SETTINGS' };
  }
}

export const inputFocusManager = new InputFocusManager();
