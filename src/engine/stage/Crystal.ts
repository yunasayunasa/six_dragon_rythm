import * as THREE from 'three';

/**
 * 立体の結晶（灯晶など）。紙の舞台の中にあえて「本物っぽい3D」を置き、2Dと3Dの共存を見せる。
 * 多面体の結晶の房＋虹色の反射＋内側の光＋まわりで瞬く星。
 * 反射用の環境マップ（envMap）は呼び出し側で1回だけ作って渡す。
 */
export interface CrystalOptions {
  height?: number;
  color?: string;
  glow?: string;
  envMap?: THREE.Texture | null;
  /** 瞬く星の数 */
  sparkles?: number;
}

let starTex: THREE.Texture | null = null;
/** 十字に光る星のテクスチャ */
function starTexture(): THREE.Texture {
  if (starTex) return starTex;
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.15, 'rgba(255,255,255,.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(255,255,255,.9)';
  g.beginPath();
  g.moveTo(s / 2, 0);
  g.quadraticCurveTo(s / 2, s / 2, s, s / 2);
  g.quadraticCurveTo(s / 2, s / 2, s / 2, s);
  g.quadraticCurveTo(s / 2, s / 2, 0, s / 2);
  g.quadraticCurveTo(s / 2, s / 2, s / 2, 0);
  g.fill();
  starTex = new THREE.CanvasTexture(c);
  starTex.colorSpace = THREE.SRGBColorSpace;
  return starTex;
}

/** 六角柱の両端をとがらせた結晶1本（高さ1、底が原点） */
function shardGeometry(radius: number): THREE.BufferGeometry {
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(radius, 0.14), new THREE.Vector2(radius, 0.74), new THREE.Vector2(0, 1)];
  const geo = new THREE.LatheGeometry(pts, 6);
  geo.computeVertexNormals();
  return geo;
}

export class Crystal extends THREE.Group {
  private cluster = new THREE.Group();
  private mat: THREE.MeshPhysicalMaterial;
  private core: THREE.Sprite;
  /** 点灯の瞬間に大きく広がる光の十字 */
  private flare: THREE.Sprite;
  private stars: { sprite: THREE.Sprite; phase: number; speed: number; size: number }[] = [];
  private time = Math.random() * 10;
  private h: number;
  /** 点灯の強い光（1 → 0 に減っていく） */
  private flash = 0;

  constructor(opts: CrystalOptions = {}) {
    super();
    const h = (this.h = opts.height ?? 0.6);
    const glow = new THREE.Color(opts.glow ?? '#ffb347');
    // 形がはっきり見えるように：不透明・地の色は濃いめ・自己発光は控えめ・反射を強めにして、面ごとの明暗を出す。
    // 不透明なので、まわりの光（加算のスプライト）は結晶の後ろに回り、結晶の上には重ならない
    this.mat = new THREE.MeshPhysicalMaterial({
      color: opts.color ?? '#b8661a',
      emissive: glow,
      emissiveIntensity: 0.12,
      roughness: 0.04,
      metalness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      iridescence: 1,
      iridescenceIOR: 1.4,
      iridescenceThicknessRange: [180, 620],
      envMap: opts.envMap ?? null,
      envMapIntensity: 2.4,
      flatShading: true,
      fog: false,
    });
    // 中央の大きな1本と、まわりに傾いた小さな結晶
    const shards: Array<[number, number, number, number, number]> = [
      // [太さ, 高さ, x, z, 傾き]
      [0.2, 1, 0, 0, 0],
      [0.13, 0.62, 0.12, 0.05, -0.45],
      [0.12, 0.55, -0.13, 0.04, 0.5],
      [0.1, 0.45, 0.02, -0.13, 0.4],
      [0.09, 0.38, -0.04, 0.14, -0.35],
    ];
    shards.forEach(([r, len, x, z, tilt], i) => {
      const m = new THREE.Mesh(shardGeometry(r), this.mat);
      m.scale.set(h, len * h, h);
      m.position.set(x * h, 0, z * h);
      m.rotation.set(i % 2 ? tilt * 0.4 : 0, i * 1.3, tilt);
      this.cluster.add(m);
    });
    this.add(this.cluster);

    const additive = (color: THREE.ColorRepresentation) =>
      new THREE.SpriteMaterial({ map: starTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    this.core = new THREE.Sprite(additive(glow));
    this.core.position.y = h * 0.45;
    this.core.scale.setScalar(h * 0.6);
    this.add(this.core);

    this.flare = new THREE.Sprite(additive('#fff4d6'));
    this.flare.position.y = h * 0.5;
    this.flare.material.opacity = 0;
    this.add(this.flare);

    const n = opts.sparkles ?? 16;
    for (let i = 0; i < n; i++) {
      const sp = new THREE.Sprite(additive('#fffbe8'));
      const a = Math.random() * Math.PI * 2;
      const rr = h * (0.25 + Math.random() * 0.55);
      sp.position.set(Math.cos(a) * rr, h * (0.1 + Math.random() * 0.95), Math.sin(a) * rr);
      this.add(sp);
      this.stars.push({ sprite: sp, phase: Math.random() * Math.PI * 2, speed: 1.5 + Math.random() * 2.5, size: h * (0.22 + Math.random() * 0.22) });
    }
  }

  /** 灯りがともる瞬間：強く光って、光の十字が広がり、結晶がぐっと大きくなってから落ち着く */
  ignite(): void {
    this.flash = 1;
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    this.flash = Math.max(0, this.flash - dt / 1.6);
    const f = this.flash;
    const pop = f > 0.85 ? (1 - f) / 0.15 : f; // 最初の一瞬で膨らみ、ゆっくり戻る
    this.cluster.scale.setScalar(1 + pop * 0.18);
    this.cluster.rotation.y += dt * (0.5 + f * 4);
    this.cluster.position.y = Math.sin(t * 1.6) * 0.03;
    // ふだんは控えめ、ときどき強く脈打つ（メリハリ）
    const beat = Math.pow(Math.max(0, Math.sin(t * 1.3)), 12);
    this.mat.emissiveIntensity = 0.1 + beat * 0.45 + f * 1.6;
    this.core.material.opacity = 0.18 + beat * 0.5 + f * 0.8;
    this.core.scale.setScalar(this.h * (0.55 + beat * 0.35 + f * 1.2));
    this.flare.material.opacity = Math.min(1, f * 1.4);
    this.flare.material.rotation = t * 0.6;
    this.flare.scale.setScalar(this.h * (1 + (1 - f) * 5) * (f > 0 ? 1 : 0.001));
    for (const s of this.stars) {
      // 鋭く光って消える瞬き。点灯の瞬間は全部いっせいに光る
      const k = Math.max(Math.pow(Math.max(0, Math.sin(t * s.speed + s.phase)), 10), f);
      s.sprite.scale.setScalar(s.size * (0.15 + k * 1.6));
      s.sprite.material.opacity = k;
      s.sprite.material.rotation = t * 0.8 + s.phase;
    }
  }
}
