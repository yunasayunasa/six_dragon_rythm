/**
 * 会話画面の立ち絵（DOM）。舞台の役者とは別に、会話枠の後ろから大きく上半身を出す。
 * 立ち絵1枚＋目・口パーツを重ね、まばたきと口パクをする。
 */
export type PortraitSide = 'left' | 'right';

export interface PortraitPart {
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PortraitData {
  /** 同じ絵なら作り直さないための識別子 */
  key: string;
  width: number;
  height: number;
  base: string;
  /** 元の絵が向いている方向（1=右 -1=左）。画面の内側を向くように左右反転する */
  artFacing: 1 | -1;
  eyes: Partial<Record<'open' | 'half' | 'closed', PortraitPart>>;
  mouth: Partial<Record<'open' | 'half' | 'closed', PortraitPart>>;
  /** 大きさ（1＝ふつう） */
  scale?: number;
}

const BLINK = ['half', 'closed', 'half', 'open'] as const;

export class PortraitSlot {
  readonly root: HTMLElement;
  private fig: HTMLElement | null = null;
  private key = '';
  private eyes = new Map<string, HTMLImageElement>();
  private mouth = new Map<string, HTMLImageElement>();
  talking = false;
  private blinkTimer = 2;
  private blinkStep = -1;
  private blinkClock = 0;
  private mouthClock = 0;

  constructor(parent: HTMLElement, before: HTMLElement, private side: PortraitSide) {
    this.root = document.createElement('div');
    this.root.className = `portrait ${side} hidden`;
    parent.insertBefore(this.root, before);
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  /** animate=false は同じ人物のポーズ差し替え（攻撃・被弾のコマ送りなど）。滑り込みをしない */
  show(data: PortraitData, animate = true): void {
    this.root.classList.remove('hidden');
    if (data.key === this.key) return;
    this.key = data.key;
    const fig = document.createElement('div');
    fig.className = 'fig';
    fig.style.aspectRatio = `${data.width} / ${data.height}`;
    // 小さくしても頭の高さはふつうの人とそろえる（下げると会話枠に顔がかぶる）
    if (data.scale && data.scale !== 1) {
      fig.style.height = `${96 * data.scale}%`;
      fig.style.bottom = `${74 - 96 * data.scale}%`;
    }
    // 左の枠は右向き、右の枠は左向きにそろえる
    if (data.artFacing !== (this.side === 'left' ? 1 : -1)) fig.style.transform = 'scaleX(-1)';
    const img = (url: string, p?: PortraitPart) => {
      const i = document.createElement('img');
      i.src = url;
      i.alt = '';
      i.draggable = false;
      if (p) {
        i.style.left = `${(p.x / data.width) * 100}%`;
        i.style.top = `${(p.y / data.height) * 100}%`;
        i.style.width = `${(p.w / data.width) * 100}%`;
        i.style.height = `${(p.h / data.height) * 100}%`;
      }
      fig.appendChild(i);
      return i;
    };
    img(data.base).className = 'base';
    this.eyes.clear();
    this.mouth.clear();
    for (const [k, p] of Object.entries(data.eyes)) this.eyes.set(k, img(p!.url, p));
    for (const [k, p] of Object.entries(data.mouth)) this.mouth.set(k, img(p!.url, p));
    this.setPart(this.eyes, 'open');
    this.setPart(this.mouth, 'closed');
    this.fig?.remove();
    this.fig = fig;
    this.root.appendChild(fig);
    this.root.classList.remove('enter');
    if (!animate) return;
    void this.root.offsetWidth; // アニメーションをやり直す
    this.root.classList.add('enter');
  }

  setActive(on: boolean): void {
    this.root.classList.toggle('dim', !on);
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.fig?.remove();
    this.fig = null;
    this.key = '';
    this.talking = false;
  }

  private setPart(set: Map<string, HTMLImageElement>, key: string): void {
    if (!set.has(key)) return;
    for (const [k, el] of set) el.style.visibility = k === key ? 'visible' : 'hidden';
  }

  update(dt: number): void {
    if (!this.fig) return;
    if (this.blinkStep < 0) {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkStep = 0;
        this.blinkClock = 0;
        this.setPart(this.eyes, BLINK[0]);
      }
    } else {
      this.blinkClock += dt;
      if (this.blinkClock > 0.055) {
        this.blinkClock = 0;
        this.blinkStep++;
        if (this.blinkStep >= BLINK.length) {
          this.blinkStep = -1;
          this.blinkTimer = 1.8 + Math.random() * 3.5;
        } else this.setPart(this.eyes, BLINK[this.blinkStep]);
      }
    }
    if (this.talking) {
      this.mouthClock -= dt;
      if (this.mouthClock <= 0) {
        this.mouthClock = 0.07 + Math.random() * 0.06;
        const r = Math.random();
        this.setPart(this.mouth, r < 0.4 ? 'open' : r < 0.75 ? 'half' : 'closed');
      }
    } else this.setPart(this.mouth, 'closed');
  }
}
