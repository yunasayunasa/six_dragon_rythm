import { getStroke } from 'perfect-freehand';

/**
 * 筆の線を 2D キャンバスに描く（perfect-freehand で入りと抜きのある輪郭にして塗る）。
 * 点は 0..1 に正規化した座標（キャンバスの辺に対する割合）。毎フレーム clear() から描き直す使い方。
 * ジャンルや字のデータには依存しない。
 */
export interface BrushPoint {
  x: number;
  y: number;
}

export interface BrushStyle {
  /** 塗りの色 */
  color?: string;
  /** 0..1 */
  alpha?: number;
  /** 線の太さ（キャンバスの辺に対する割合） */
  size?: number;
  /** 入り・抜きの長さ（太さに対する倍率）。0 で無し */
  taper?: number;
}

const DEFAULT_STYLE: Required<BrushStyle> = { color: '#16120e', alpha: 1, size: 0.045, taper: 2.5 };

/** 点列の先頭から、長さの progress（0..1）の割合までを切り出す（途中の点は補間する） */
export function partialPolyline(points: readonly BrushPoint[], progress: number): BrushPoint[] {
  if (points.length === 0) return [];
  const p = Math.max(0, Math.min(1, progress));
  if (p >= 1) return points.map((q) => ({ x: q.x, y: q.y }));
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  const out: BrushPoint[] = [{ x: points[0].x, y: points[0].y }];
  if (total === 0 || p === 0) return out;
  const target = total * p;
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (acc + seg >= target) {
      const f = seg === 0 ? 0 : (target - acc) / seg;
      out.push({
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * f,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * f,
      });
      return out;
    }
    acc += seg;
    out.push({ x: points[i].x, y: points[i].y });
  }
  return out;
}

export class BrushCanvas {
  private readonly ctx: CanvasRenderingContext2D;
  /** キャンバスの一辺（デバイスピクセル） */
  private side = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
  }

  /** 正方形に合わせる。cssSize は CSS ピクセル */
  resize(cssSize: number, dpr: number): void {
    this.side = Math.max(1, Math.round(cssSize * dpr));
    if (this.canvas.width !== this.side) this.canvas.width = this.side;
    if (this.canvas.height !== this.side) this.canvas.height = this.side;
  }

  /** 全面を塗りつぶす。背景色を省略すると透明に戻す */
  clear(background?: string): void {
    const { ctx, side } = this;
    ctx.clearRect(0, 0, side, side);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, side, side);
    }
  }

  /**
   * 1本の線を描く。complete が false なら「まだ書いている途中」として抜きを付けない
   * （なぞっている最中の線、お手本の筆が動いている最中の線）。
   */
  drawStroke(points: readonly BrushPoint[], style: BrushStyle = {}, complete = true): void {
    if (points.length === 0) return;
    const st = { ...DEFAULT_STYLE, ...style };
    const side = this.side;
    const size = st.size * side;
    const outline = getStroke(
      points.map((p) => [p.x * side, p.y * side]),
      {
        size,
        thinning: 0.5,
        smoothing: 0.6,
        streamline: 0.4,
        simulatePressure: true,
        start: { taper: st.taper * size },
        end: { taper: complete ? st.taper * size : 0 },
        last: complete,
      },
    );
    if (outline.length < 3) return;
    const path = new Path2D();
    for (let i = 0; i < outline.length; i++) {
      const [x0, y0] = outline[i];
      const [x1, y1] = outline[(i + 1) % outline.length];
      if (i === 0) path.moveTo(x0, y0);
      path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
    }
    path.closePath();
    const { ctx } = this;
    ctx.globalAlpha = st.alpha;
    ctx.fillStyle = st.color;
    ctx.fill(path);
    ctx.globalAlpha = 1;
  }

  /** お手本の筆の動き: 点列を progress（0..1）まで描く。1 になったら通常の線（抜きあり） */
  drawAnimated(points: readonly BrushPoint[], progress: number, style: BrushStyle = {}): void {
    this.drawStroke(partialPolyline(points, progress), style, progress >= 1);
  }

  /** 輪を描く（拍の合図など）。座標・半径は 0..1 */
  drawRing(x: number, y: number, radius: number, color: string, width = 0.006, alpha = 1): void {
    const { ctx, side } = this;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, width * side);
    ctx.beginPath();
    ctx.arc(x * side, y * side, Math.max(0, radius * side), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** 田の字の補助線 */
  drawGrid(color: string, alpha = 0.18): void {
    const { ctx, side } = this;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, side * 0.003);
    ctx.setLineDash([side * 0.02, side * 0.02]);
    ctx.beginPath();
    ctx.moveTo(side / 2, 0);
    ctx.lineTo(side / 2, side);
    ctx.moveTo(0, side / 2);
    ctx.lineTo(side, side / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}
