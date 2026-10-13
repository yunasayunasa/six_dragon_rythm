import type { PointerTrail, TracePoint } from './PointerTrail';

export interface AttachOptions {
  /** 現在時刻（秒）。音と合わせたいときは AudioContext.currentTime を返す */
  now: () => number;
  /** 一画が終わったとき */
  onStroke?: (stroke: TracePoint[] | null) => void;
}

/**
 * 要素のポインター入力を PointerTrail に流し込む（座標は要素内の 0..1 に正規化）。
 * 戻り値を呼ぶと取り外す。
 */
export function attachPointerTrail(el: HTMLElement, trail: PointerTrail, opts: AttachOptions): () => void {
  const norm = (e: PointerEvent): [number, number] => {
    const r = el.getBoundingClientRect();
    return [(e.clientX - r.left) / (r.width || 1), (e.clientY - r.top) / (r.height || 1)];
  };
  const down = (e: PointerEvent): void => {
    el.setPointerCapture?.(e.pointerId);
    const [x, y] = norm(e);
    trail.begin(x, y, opts.now());
  };
  const move = (e: PointerEvent): void => {
    if (!trail.active) return;
    // 取りこぼしを減らすため、まとめて届いた中間点も使う
    const events = e.getCoalescedEvents?.() ?? [];
    for (const c of events.length ? events : [e]) {
      const [x, y] = norm(c);
      trail.add(x, y, opts.now());
    }
  };
  const up = (e: PointerEvent): void => {
    if (!trail.active) return;
    const [x, y] = norm(e);
    opts.onStroke?.(trail.end(x, y, opts.now()));
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
  };
}
