import type { BrushPoint } from '../../engine/render/BrushCanvas';

/**
 * お手本役のキャラ（six_dragon の立ち絵を流用）。DOM の画像を重ねるだけの軽い作り。
 * お手本の区間では筆を運ぶように揺れ、書き返しの区間では暗く沈んで見守る。
 * 目・口のパーツは manifest の座標（立ち絵の画素）を割合にして重ねる。まばたきと、筆を下ろした瞬間の口の開閉だけ動かす。
 */
interface PosePart {
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface PoseInfo {
  width: number;
  height: number;
  parts: Record<string, PosePart | undefined>;
}

export type WriterMood = 'watch' | 'dim' | 'hidden';

export interface WriterState {
  mood: WriterMood;
  /** お手本の筆が動いている画の点列と進み（動いていなければ null） */
  brush: { points: readonly BrushPoint[]; progress: number } | null;
}

export class ExampleWriter {
  private readonly layers = new Map<string, HTMLImageElement>();
  private blinkAt = 0;
  private blinkUntil = 0;
  private mouthUntil = 0;
  private lastActive: readonly BrushPoint[] | null = null;

  private constructor(
    readonly el: HTMLElement,
    private readonly inner: HTMLElement,
  ) {}

  /** poseId 例: fediel_01_normal。assetsBase は `.../assets/` */
  static async create(host: HTMLElement, assetsBase: string, poseId: string): Promise<ExampleWriter> {
    const manifest = (await (await fetch(`${assetsBase}cast/manifest.json`)).json()) as Record<string, PoseInfo>;
    const info = manifest[poseId];
    const el = document.createElement('div');
    el.className = 'writer';
    const inner = document.createElement('div');
    inner.className = 'writer-inner';
    el.appendChild(inner);
    host.appendChild(el);
    const w = new ExampleWriter(el, inner);
    if (!info) return w;
    inner.style.aspectRatio = `${info.width} / ${info.height}`;
    const add = (name: string, file: string, box?: PosePart): HTMLImageElement => {
      const img = document.createElement('img');
      img.src = `${assetsBase}cast/${poseId}/${file}`;
      img.alt = '';
      img.draggable = false;
      img.className = box ? 'writer-part' : 'writer-base';
      if (box) {
        img.style.left = `${(box.x / info.width) * 100}%`;
        img.style.top = `${(box.y / info.height) * 100}%`;
        img.style.width = `${(box.w / info.width) * 100}%`;
        img.style.height = `${(box.h / info.height) * 100}%`;
      }
      inner.appendChild(img);
      w.layers.set(name, img);
      return img;
    };
    add('base', 'base.webp');
    for (const [name, p] of Object.entries(info.parts)) if (p) add(name, p.file, p);
    w.setPart('eye', 'eye_open');
    w.setPart('mouth', 'mouth_closed');
    return w;
  }

  /** 同じ種類（eye / mouth）の層のうち、name だけ見せる */
  private setPart(kind: 'eye' | 'mouth', name: string): void {
    for (const [k, img] of this.layers) if (k.startsWith(`${kind}_`)) img.style.visibility = k === name ? 'visible' : 'hidden';
  }

  /** 毎フレーム。nowSec は壁時計の秒（曲の時計ではなく、ただの動きの時間） */
  update(nowSec: number, s: WriterState): void {
    this.el.dataset.mood = s.mood;
    // まばたき（3〜5秒おき）
    if (nowSec >= this.blinkAt) {
      this.blinkUntil = nowSec + 0.14;
      this.blinkAt = nowSec + 3 + Math.random() * 2;
    }
    this.setPart('eye', nowSec < this.blinkUntil ? 'eye_closed' : 'eye_open');
    // 筆を下ろした（新しい画が始まった）瞬間に口を少し開ける
    if (s.brush && s.brush.points !== this.lastActive) this.mouthUntil = nowSec + 0.25;
    this.lastActive = s.brush?.points ?? null;
    this.setPart('mouth', nowSec < this.mouthUntil ? 'mouth_open' : 'mouth_closed');

    // ゆっくり上下に揺れ、お手本の筆が動いている間は、筆の進む向きへ体を傾けて運ぶ
    let x = 0;
    let rot = 0;
    const bob = Math.sin(nowSec * 2.2) * 3;
    if (s.mood === 'watch' && s.brush && s.brush.points.length > 1) {
      const pts = s.brush.points;
      const a = pts[0];
      const b = pts[pts.length - 1];
      const dx = b.x - a.x;
      const sway = Math.sin(Math.min(1, s.brush.progress) * Math.PI);
      x = Math.max(-1, Math.min(1, dx * 3)) * 8 * sway;
      rot = Math.max(-1, Math.min(1, dx * 3)) * 3 * sway;
    }
    this.inner.style.transform = `translate(${x.toFixed(1)}px, ${bob.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
  }
}
