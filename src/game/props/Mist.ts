import * as THREE from 'three';
import { Motes } from '../../engine/stage/Particles';

/** ふちのやわらかい白い丸（霧のかたまり）。1回だけ作る */
let puffTex: THREE.Texture | null = null;
function puffTexture(): THREE.Texture {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  puffTex = new THREE.CanvasTexture(c);
  puffTex.colorSpace = THREE.SRGBColorSpace;
  return puffTex;
}

interface Puff {
  sprite: THREE.Sprite;
  speed: number;
  base: number;
}

/**
 * 霧の町の霧（第三話）。遠くの背景を白くかすませる幕と、舞台の上をゆっくり流れる霧のかたまり、舞う霜の粒。
 * 台本の `@演出 霧 晴れる [秒]` で薄れて消える（`戻す` で元どおり）。
 */
export class Mist extends THREE.Group {
  private veil: THREE.Mesh;
  private puffs: Puff[] = [];
  private frost: Motes;
  /** 0（晴れ）〜1（霧） */
  private amount = 1;
  private target = 1;
  private rate = 1;

  constructor(private half: number, quality = 1) {
    super();
    this.name = '霧';
    // 背景の前に立てる白い幕（背景の絵は霧に掛からないので、幕で遠くを白くする）
    this.veil = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2 + 60, 30),
      new THREE.MeshBasicMaterial({ color: '#e4e9ee', transparent: true, opacity: 0.55, depthWrite: false, fog: false }),
    );
    this.veil.position.set(0, 9, -18);
    this.add(this.veil);
    const n = Math.round(14 * quality);
    for (let i = 0; i < n; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color: '#f2f5f8', transparent: true, depthWrite: false, fog: false }));
      const s = 5 + Math.random() * 6;
      sprite.scale.set(s * 1.8, s, 1);
      sprite.position.set((Math.random() * 2 - 1) * (half + 6), 0.6 + Math.random() * 2.6, -3.5 - Math.random() * 7);
      const base = 0.16 + Math.random() * 0.16;
      sprite.material.opacity = base;
      this.add(sprite);
      this.puffs.push({ sprite, speed: 0.15 + Math.random() * 0.25, base });
    }
    // ゆっくり舞い落ちる霜の粒
    this.frost = new Motes(Math.round(70 * quality), new THREE.Box3(new THREE.Vector3(-half, 0.2, -3), new THREE.Vector3(half, 4.5, 3.5)), '#ffffff', 0.06);
    this.add(this.frost);
  }

  cue(signal: string, args: string[]): Promise<void> | void {
    const seconds = Math.max(0.1, Number(args[0] ?? 2.5));
    if (signal === '晴れる') this.target = 0;
    else if (signal === '戻す') this.target = 1;
    else return;
    this.rate = 1 / seconds;
    // 薄れ終わるまで待つ
    return new Promise((done) => setTimeout(done, seconds * 1000));
  }

  update(dt: number): void {
    const step = this.rate * dt;
    this.amount = this.amount < this.target ? Math.min(this.target, this.amount + step) : Math.max(this.target, this.amount - step);
    (this.veil.material as THREE.MeshBasicMaterial).opacity = 0.55 * this.amount;
    const span = this.half + 8;
    for (const p of this.puffs) {
      p.sprite.position.x += p.speed * dt;
      if (p.sprite.position.x > span) p.sprite.position.x = -span;
      p.sprite.material.opacity = p.base * this.amount;
    }
    this.frost.update(dt, 0.2);
    (this.frost.material as THREE.PointsMaterial).opacity = 0.75 * this.amount;
    this.visible = this.amount > 0.001;
  }
}
