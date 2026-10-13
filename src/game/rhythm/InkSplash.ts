/**
 * 墨しぶき（画面の最前面に重ねる 2D キャンバス）。
 * 書く盤面は不透明な紙なので、奥の 3D 舞台のしぶきは盤面の下に隠れる。判定の手応えは盤面の上に出す。
 * 座標は画面（clientX / clientY）。紙の明るい地に映えるよう、濃い墨と朱で描く。
 */
type Hit = 'perfect' | 'good';

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
  color: string;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  grow: number;
  life: number;
  max: number;
  width: number;
}

const GRAVITY = 1100;
const INK = '#0c0906';
const RED = '#c4301f';

export class InkSplash {
  private readonly ctx: CanvasRenderingContext2D;
  private drops: Drop[] = [];
  private rings: Ring[] = [];
  private dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(innerWidth * this.dpr));
    this.canvas.height = Math.max(1, Math.round(innerHeight * this.dpr));
  }

  get active(): boolean {
    return this.drops.length > 0 || this.rings.length > 0;
  }

  burst(x: number, y: number, hit: Hit): void {
    const k = Math.max(0.8, Math.min(innerWidth, innerHeight) / 390);
    const add = (n: number, color: string, speed: [number, number], radius: [number, number], life: [number, number]): void => {
      for (let i = 0; i < n; i++) {
        const th = Math.random() * Math.PI * 2;
        const sp = (speed[0] + Math.random() * (speed[1] - speed[0])) * k;
        const max = life[0] + Math.random() * (life[1] - life[0]);
        this.drops.push({
          x,
          y,
          vx: Math.cos(th) * sp,
          vy: Math.sin(th) * sp - 180 * k,
          r: (radius[0] + Math.random() * (radius[1] - radius[0])) * k,
          life: max,
          max,
          color,
        });
      }
    };
    if (hit === 'perfect') {
      add(44, INK, [140, 640], [3, 11], [0.8, 1.4]);
      add(16, RED, [120, 520], [2.5, 7], [0.7, 1.2]);
      add(5, INK, [20, 120], [14, 24], [0.9, 1.3]);
      this.rings.push({ x, y, r: 10 * k, grow: 260 * k, life: 0.45, max: 0.45, width: 5 * k });
    } else {
      add(12, INK, [80, 320], [2.5, 6], [0.5, 0.9]);
      add(2, INK, [10, 60], [8, 12], [0.6, 0.9]);
    }
  }

  update(dt: number): void {
    const { ctx, canvas, dpr } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.active) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const d of this.drops) {
      d.life -= dt;
      d.vy += GRAVITY * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
    this.drops = this.drops.filter((d) => d.life > 0);
    for (const d of this.drops) {
      const k = d.life / d.max;
      const speed = Math.hypot(d.vx, d.vy);
      ctx.globalAlpha = Math.min(1, k * 2.2);
      ctx.fillStyle = d.color;
      ctx.beginPath();
      // 飛んでいる向きに少し伸ばす
      ctx.ellipse(d.x, d.y, d.r * (0.6 + 0.4 * k) * (1 + Math.min(0.9, speed / 900)), d.r * (0.6 + 0.4 * k), Math.atan2(d.vy, d.vx), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const g of this.rings) {
      g.life -= dt;
      g.r += g.grow * dt;
    }
    this.rings = this.rings.filter((g) => g.life > 0);
    for (const g of this.rings) {
      const k = g.life / g.max;
      ctx.globalAlpha = k;
      ctx.strokeStyle = RED;
      ctx.lineWidth = g.width * k + 1;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
