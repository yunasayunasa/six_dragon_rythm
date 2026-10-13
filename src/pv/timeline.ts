/**
 * PV の時間と、ゲーム画面に重ねるモーショングラフィックス。
 *
 * 撮影は1コマずつ（tools/pv_record.mjs が時計を進めて写す）なので、動きはすべて「PV の時刻 T」から計算する。
 * CSS のアニメーションは使わない（使うのはゲームの HUD が出すものだけ。それは syncAnimations で時刻に合わせる）。
 */

export const W = 1920;
export const H = 1080;

// ---------- 時間 ----------
export const clock = { t: 0 };

type Waiter = { at: number; done: () => void };
const waiters: Waiter[] = [];

/** PV の時刻 at 秒まで待つ */
export function until(at: number): Promise<void> {
  if (clock.t >= at - 1e-6) return Promise.resolve();
  return new Promise((done) => waiters.push({ at, done }));
}

/** 毎コマ、時刻を進めたあとに呼ぶ */
export function tick(dt: number): void {
  clock.t += dt;
  for (let i = waiters.length - 1; i >= 0; i--) {
    if (clock.t >= waiters[i].at - 1e-6) {
      waiters[i].done();
      waiters.splice(i, 1);
    }
  }
  for (const it of [...items]) {
    const local = clock.t - it.start;
    if (local < 0) continue;
    if (it.end !== undefined && clock.t >= it.end) {
      it.remove?.();
      it.el?.remove();
      items.splice(items.indexOf(it), 1);
      continue;
    }
    it.update(local);
  }
  drawFx();
}

/**
 * ゲームの HUD が使う CSS / Web アニメーションを、PV の時刻に合わせて止めた状態で進める。
 * 終わりまで来たら finish() で終わらせる（finished を待つ処理があるため）
 */
const animStart = new WeakMap<Animation, number>();
export function syncAnimations(): void {
  for (const a of document.getAnimations()) {
    if (!animStart.has(a)) {
      animStart.set(a, clock.t);
      a.pause();
    }
    const ms = (clock.t - animStart.get(a)!) * 1000;
    const end = Number(a.effect?.getComputedTiming().endTime ?? 0);
    if (Number.isFinite(end) && ms >= end) a.finish();
    else a.currentTime = ms;
  }
}

// ---------- イージング・乱数 ----------
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const ease = {
  outCubic: (k: number) => 1 - Math.pow(1 - clamp01(k), 3),
  outQuint: (k: number) => 1 - Math.pow(1 - clamp01(k), 5),
  inCubic: (k: number) => Math.pow(clamp01(k), 3),
  inOut: (k: number) => {
    const x = clamp01(k);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  },
  outBack: (k: number) => {
    const x = clamp01(k);
    const c = 1.9;
    return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
  },
};
/** a 秒から b 秒にかけて 0→1 */
export const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
/** 決まった並びの乱数（撮り直しても同じ絵になるように） */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ---------- 重ねる部品 ----------
export interface Item {
  start: number;
  end?: number;
  el?: HTMLElement;
  update(local: number): void;
  remove?(): void;
}
const items: Item[] = [];
export let root: HTMLElement;

export function initOverlay(container: HTMLElement): void {
  root = container;
  fxCanvas = document.createElement('canvas');
  fxCanvas.width = W;
  fxCanvas.height = H;
  fxCanvas.className = 'pv-fx';
  root.appendChild(fxCanvas);
  fx = fxCanvas.getContext('2d')!;
  frontCanvas = document.createElement('canvas');
  frontCanvas.width = W;
  frontCanvas.height = H;
  frontCanvas.className = 'pv-front';
  root.appendChild(frontCanvas);
  front = frontCanvas.getContext('2d')!;
}

export function add(it: Item): Item {
  items.push(it);
  if (it.el && !it.el.isConnected) root.appendChild(it.el);
  it.update(Math.max(0, clock.t - it.start));
  return it;
}

export function div(cls: string, html = '', parent?: HTMLElement): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  if (html) d.innerHTML = html;
  (parent ?? root).appendChild(d);
  return d;
}

// ---------- 墨・光（2D キャンバス） ----------
let fxCanvas: HTMLCanvasElement;
let fx: CanvasRenderingContext2D;
/** 文字などより手前に描く（場面転換の墨の帯） */
let frontCanvas: HTMLCanvasElement;
let front: CanvasRenderingContext2D;
export type Fx = { start: number; life: number; draw(ctx: CanvasRenderingContext2D, local: number): void; front?: boolean; top?: boolean };
const fxs: Fx[] = [];
/** 2D キャンバスに描く効果を足す（front で文字より手前） */
export function addFx(f: Fx): void {
  fxs.push(f);
}

function drawFx(): void {
  fx.clearRect(0, 0, W, H);
  front.clearRect(0, 0, W, H);
  for (let i = fxs.length - 1; i >= 0; i--) {
    const f = fxs[i];
    const local = clock.t - f.start;
    if (local < 0) continue;
    if (local > f.life) {
      fxs.splice(i, 1);
      continue;
    }
  }
  // 転換の墨（top）は、ほかの効果より後に描いて必ず覆う
  for (const f of [...fxs.filter((x) => !x.top), ...fxs.filter((x) => x.top)]) {
    const local = clock.t - f.start;
    if (local >= 0) {
      const ctx = f.front ? front : fx;
      ctx.save();
      f.draw(ctx, local);
      ctx.restore();
    }
  }
}

/** 墨の飛び散り。x,y は画面の px。size は半径 */
export function inkSplat(x: number, y: number, size: number, opts: { color?: string; seed?: number; life?: number; drops?: number; at?: number } = {}): void {
  const r = rng(opts.seed ?? Math.round(x * 7 + y * 13 + size));
  // 大小の丸を重ねた墨だまり＋細く伸びる飛沫＋しずく
  const blobs = Array.from({ length: 11 }, (_, i) => ({ a: r() * Math.PI * 2, d: i === 0 ? 0 : 0.2 + r() * 0.45, s: i === 0 ? 0.62 : 0.22 + r() * 0.3 }));
  const spikes = Array.from({ length: 7 }, () => ({ a: r() * Math.PI * 2, len: 0.95 + r() * 0.8, w: 0.035 + r() * 0.04 }));
  const drops = Array.from({ length: opts.drops ?? 18 }, () => ({ a: r() * Math.PI * 2, d: 1.1 + r() * 1.6, s: 0.03 + r() * 0.09 }));
  const color = opts.color ?? '#120c10';
  const life = opts.life ?? 1.6;
  fxs.push({
    start: opts.at ?? clock.t,
    life,
    draw(ctx, t) {
      const g = ease.outQuint(t / 0.16);
      const fade = 1 - span(t, life - 0.45, life);
      ctx.globalAlpha = fade;
      ctx.fillStyle = color;
      for (const b of blobs) {
        ctx.beginPath();
        ctx.arc(x + Math.cos(b.a) * size * b.d * g, y + Math.sin(b.a) * size * b.d * g, size * b.s * g, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const s of spikes) {
        const L = size * s.len * g;
        ctx.beginPath();
        const w = size * s.w;
        ctx.moveTo(x + Math.cos(s.a + 0.12) * size * 0.5 * g, y + Math.sin(s.a + 0.12) * size * 0.5 * g);
        ctx.quadraticCurveTo(x + Math.cos(s.a) * (L * 0.7) + Math.cos(s.a + 1.57) * w, y + Math.sin(s.a) * (L * 0.7) + Math.sin(s.a + 1.57) * w, x + Math.cos(s.a) * L, y + Math.sin(s.a) * L);
        ctx.quadraticCurveTo(x + Math.cos(s.a) * (L * 0.7) - Math.cos(s.a + 1.57) * w, y + Math.sin(s.a) * (L * 0.7) - Math.sin(s.a + 1.57) * w, x + Math.cos(s.a - 0.12) * size * 0.5 * g, y + Math.sin(s.a - 0.12) * size * 0.5 * g);
        ctx.fill();
      }
      const dg = ease.outCubic(t / 0.35);
      for (const d of drops) {
        ctx.beginPath();
        ctx.arc(x + Math.cos(d.a) * size * d.d * dg, y + Math.sin(d.a) * size * d.d * dg + t * t * 60, size * d.s, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  });
}

/** 集中線。中心 cx,cy、色、続く秒数 */
export function speedLines(cx: number, cy: number, seconds: number, opts: { color?: string; inner?: number; count?: number; at?: number } = {}): void {
  const color = opts.color ?? 'rgba(255,250,240,0.9)';
  fxs.push({
    start: opts.at ?? clock.t,
    life: seconds,
    draw(ctx, t) {
      const frame = Math.floor(t * 30);
      const r = rng(frame * 977 + 3);
      const fade = Math.min(span(t, 0, 0.08), 1 - span(t, seconds - 0.2, seconds));
      ctx.globalAlpha = fade;
      ctx.fillStyle = color;
      const inner = opts.inner ?? 330;
      for (let i = 0; i < (opts.count ?? 90); i++) {
        const a = r() * Math.PI * 2;
        const w = 0.004 + r() * 0.012;
        const r0 = inner + r() * 160;
        const r1 = 1500;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a - w) * r1, cy + Math.sin(a - w) * r1);
        ctx.lineTo(cx + Math.cos(a + w) * r1, cy + Math.sin(a + w) * r1);
        ctx.fill();
      }
    },
  });
}

/** 画面全体の光（白・金など） */
export function flash(seconds = 0.35, color = '255,255,255', strength = 0.9, at?: number): void {
  fxs.push({
    start: at ?? clock.t,
    life: seconds,
    draw(ctx, t) {
      ctx.fillStyle = `rgba(${color},${strength * (1 - ease.outCubic(t / seconds))})`;
      ctx.fillRect(0, 0, W, H);
    },
  });
}

/** 金の火の粉（ゆっくり昇る光の粒） */
export function embers(seconds: number, opts: { count?: number; color?: string; at?: number; seed?: number } = {}): void {
  const r = rng(opts.seed ?? 99);
  const ps = Array.from({ length: opts.count ?? 70 }, () => ({ x: r() * W, y: H * (0.3 + r() * 0.8), v: 40 + r() * 90, s: 1.5 + r() * 3.5, ph: r() * 6.28, sway: 10 + r() * 30 }));
  const color = opts.color ?? '255,214,140';
  fxs.push({
    start: opts.at ?? clock.t,
    life: seconds,
    draw(ctx, t) {
      const fade = Math.min(span(t, 0, 0.6), 1 - span(t, seconds - 0.8, seconds));
      ctx.globalCompositeOperation = 'lighter';
      for (const p of ps) {
        const y = p.y - p.v * t;
        const x = p.x + Math.sin(t * 1.3 + p.ph) * p.sway;
        const tw = 0.55 + 0.45 * Math.sin(t * 5 + p.ph * 3);
        const g = ctx.createRadialGradient(x, y, 0, x, y, p.s * 4);
        g.addColorStop(0, `rgba(${color},${0.9 * tw * fade})`);
        g.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, p.s * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  });
}

/**
 * 筆で払うような墨の帯が画面を横切る転換（wipe）。dir=1 で左→右。
 * 帯が画面を覆い切った瞬間（at + seconds/2）に場面を切り替えると、つなぎ目が見えない
 */
export function inkWipe(seconds = 0.7, opts: { color?: string; dir?: 1 | -1; at?: number; seed?: number; rows?: number; lag?: number } = {}): void {
  const r = rng(opts.seed ?? 7);
  const color = opts.color ?? '#120c10';
  const dir = opts.dir ?? 1;
  const n = opts.rows ?? 9;
  const rows = Array.from({ length: n }, (_, i) => ({ y: (i / (n - 1)) * H, lag: r() * (opts.lag ?? 0.18), w: (150 + r() * 120) * (opts.rows ? (9 / n) * 1.3 : 1) }));
  fxs.push({
    start: opts.at ?? clock.t,
    life: seconds,
    front: true,
    top: true,
    draw(ctx, t) {
      ctx.fillStyle = color;
      const k = t / seconds;
      for (const row of rows) {
        // 前半で覆い、後半で抜ける
        const a = ease.inOut(span(k, row.lag * 0.5, 0.5 + row.lag * 0.4));
        const b = ease.inOut(span(k, 0.5 + row.lag * 0.4, 1));
        let x0 = -300 + b * (W + 600);
        let x1 = -300 + a * (W + 600);
        if (dir < 0) [x0, x1] = [W - x1, W - x0];
        ctx.beginPath();
        ctx.moveTo(x0, row.y - row.w);
        ctx.lineTo(x1 + 120 * dir, row.y - row.w * 0.6);
        ctx.quadraticCurveTo(x1 + 220 * dir, row.y, x1 + 100 * dir, row.y + row.w * 0.7);
        ctx.lineTo(x0, row.y + row.w);
        ctx.closePath();
        ctx.fill();
      }
    },
  });
}

/** 画面の端を暗くする（いつも出す） */
export function filmLayer(): void {
  fxs.push({
    start: 0,
    life: 1e9,
    draw(ctx, t) {
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(10,4,12,0.42)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      void t; // 粒子感は入れない（毎コマ変わる点は動画の圧縮が効かず、ファイルがとても大きくなった）
    },
  });
}
