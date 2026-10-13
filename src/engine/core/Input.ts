/**
 * キーボードとタッチを「行動」にまとめる入力層。
 * 移動は -1..1 のベクトル、決定/キャンセル等はその瞬間だけ true になる「押した」判定。
 */
export type Action = 'confirm' | 'cancel' | 'menu' | 'logic' | 'travel' | 'left' | 'right';

export class Input {
  readonly move = { x: 0, y: 0 };
  private keys = new Set<string>();
  private pressed = new Set<Action>();
  private stick = { x: 0, y: 0 };
  enabled = true;

  constructor(target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.reset);
    document.addEventListener('visibilitychange', this.reset);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    if (!e.repeat) {
      const a = Input.keyAction(e.code);
      if (a) this.pressed.add(a);
    }
    this.keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  static keyAction(code: string): Action | null {
    switch (code) {
      case 'Enter':
      case 'Space':
      case 'KeyZ':
      case 'KeyE':
        return 'confirm';
      case 'Escape':
      case 'KeyX':
      case 'Backspace':
        return 'cancel';
      case 'Tab':
      case 'KeyC':
        return 'menu';
      case 'KeyQ':
      case 'KeyL':
        return 'logic';
      case 'KeyT':
        return 'travel';
      case 'ArrowLeft':
      case 'KeyA':
        return 'left';
      case 'ArrowRight':
      case 'KeyD':
        return 'right';
      default:
        return null;
    }
  }

  /** タッチUIからの行動入力 */
  press(a: Action): void {
    if (this.enabled) this.pressed.add(a);
  }

  /** 仮想スティック（-1..1） */
  setStick(x: number, y: number): void {
    this.stick.x = x;
    this.stick.y = y;
  }

  reset = () => {
    this.keys.clear();
    this.pressed.clear();
    this.stick.x = this.stick.y = 0;
  };

  /** フレームの最初に呼ぶ。 */
  poll(): void {
    const k = this.keys;
    let x = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    let y = (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0) - (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0);
    if (x === 0 && y === 0) {
      x = this.stick.x;
      y = this.stick.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.move.x = this.enabled ? x : 0;
    this.move.y = this.enabled ? y : 0;
  }

  /** そのフレームで押されたか（読むと消える） */
  consume(a: Action): boolean {
    if (!this.enabled) return false;
    const had = this.pressed.has(a);
    this.pressed.delete(a);
    return had;
  }

  clearPressed(): void {
    this.pressed.clear();
  }
}
