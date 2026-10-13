import * as THREE from 'three';
import { Assets } from '../../engine/core/Assets';
import { Ease, Tweens } from '../../engine/core/tween';
import { PostFX } from '../../engine/render/PostFX';
import { QUALITY, pickQuality, type QualityProfile } from '../../engine/render/quality';
import { CameraRig } from '../../engine/stage/CameraRig';
import { Stage } from '../../engine/stage/Stage';

/**
 * 漢字リズムの背景（墨絵の舞台）。画面いっぱいに three.js の舞台を敷き、その上に DOM の UI と
 * 書く盤面を重ねる。Engine（Hud・画面の回転など会話ゲーム向けの部品を含む）は使わず、
 * 舞台・後処理・カメラだけを組んで軽くしている（ぼかしの後処理も使わない）。
 * 墨しぶき・揺れ・終幕のズームもここ。ジャンル（RhythmMode）には依存しない。
 */
const LOOK_AT = new THREE.Vector3(0, 3.2, 0);
const DISTANCE = 10;
const ZOOM_DISTANCE = 4.6;

type Hit = 'perfect' | 'good';

export class SumiStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly quality: QualityProfile;
  readonly stage: Stage;
  readonly rig: CameraRig;
  private readonly post: PostFX;
  private readonly tweens = new Tweens();
  private readonly landscape: THREE.Mesh;
  private time = 0;
  private shakeLeft = 0;
  private shakeTotal = 0;
  private shakePx = 0;

  /** shakeTarget: 画面の揺れを DOM にも伝える要素（UI 全体） */
  constructor(
    container: HTMLElement,
    private readonly shakeTarget: HTMLElement | null = null,
  ) {
    // 背景なので軽くする。?q= で指定したときだけ既定のプロファイルを使う（ぼかし無し＝縮小バッファのぼかしを描かない）
    this.quality = new URLSearchParams(location.search).has('q') ? pickQuality() : { ...QUALITY.low, dof: false };
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);
    const assets = new Assets();
    this.post = new PostFX(this.renderer, this.quality);
    this.rig = new CameraRig(innerWidth / Math.max(1, innerHeight));
    this.stage = new Stage(assets, this.tweens, this.post, this.quality);
    void this.stage.setLook('sumi', 0);
    // 画面の端は紙が古びたように灰色へ落とす。色ずれ（レンズ感）は墨絵に要らない
    this.post.grade.vignetteColor.set('#6d675c');
    this.post.grade.aberration = 0;
    void this.stage.setBackdrop(null, { width: 160, height: 80, z: -40, y: 3 });
    this.landscape = new THREE.Mesh(
      new THREE.PlaneGeometry(64, 32),
      new THREE.MeshBasicMaterial({ map: inkLandscape(), transparent: true, fog: false }),
    );
    this.landscape.position.set(0, 4.2, -20);
    this.stage.add(this.landscape);
    this.resetCamera();
    addEventListener('resize', this.resize);
    this.resize();
  }

  private readonly resize = (): void => {
    const dpr = Math.min(devicePixelRatio || 1, this.quality.dprCap);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.post.setSize(innerWidth, innerHeight, dpr);
    this.rig.setAspect(innerWidth / Math.max(1, innerHeight));
  };

  /** カメラを基本の構図に一瞬で戻す */
  resetCamera(): void {
    this.rig.cut(LOOK_AT, new THREE.Vector3(0, 0, DISTANCE), 32);
  }

  /** 終幕のズーム。k: 0=基本の構図 1=いちばん寄った構図（毎フレーム呼ぶと滑らかに寄っていく） */
  zoom(k: number): void {
    const e = Ease.inOutSine(Math.max(0, Math.min(1, k)));
    this.rig.shot(LOOK_AT, new THREE.Vector3(0, -0.2 * e, DISTANCE + (ZOOM_DISTANCE - DISTANCE) * e), 32);
  }

  /** 画面の座標（clientX/Y）に当たる、舞台の奥行き 0 の面の上の点 */
  private worldAt(clientX: number, clientY: number): THREE.Vector3 {
    const cam = this.rig.camera;
    cam.updateMatrixWorld();
    const v = new THREE.Vector3((clientX / innerWidth) * 2 - 1, -((clientY / innerHeight) * 2 - 1), 0.5).unproject(cam);
    const dir = v.sub(cam.position).normalize();
    return cam.position.clone().addScaledVector(dir, -cam.position.z / dir.z);
  }

  /** 墨しぶき。Perfect は大きく散って画面が揺れ、Good は小さな点がにじむだけ */
  ink(clientX: number, clientY: number, hit: Hit): void {
    const at = this.worldAt(clientX, clientY);
    const spray = this.stage.spray;
    if (hit === 'perfect') {
      spray.emit(at, { count: 26, color: '#14100c', spread: 1.7, up: 2.4, gravity: 3.5, size: 0.55, life: 0.9 });
      spray.emit(at, { count: 8, color: '#4b453b', spread: 0.9, up: 1.2, gravity: 1.5, size: 1.0, life: 0.7 });
      this.shake(6, 0.2);
    } else {
      spray.emit(at, { count: 6, color: '#4d473d', spread: 0.7, up: 1.0, gravity: 3, size: 0.32, life: 0.5 });
    }
  }

  /** 画面の揺れ。3D の背景（カメラ）と、UI（shakeTarget）の両方を揺らす */
  shake(px: number, seconds: number): void {
    this.rig.shake(px * 0.02, seconds);
    this.shakePx = px;
    this.shakeLeft = this.shakeTotal = seconds;
  }

  update(dt: number): void {
    this.time += dt;
    this.tweens.update(dt);
    // 山は風に流されるようにごくゆっくり揺れる
    this.landscape.position.x = Math.sin(this.time * 0.05) * 1.2;
    this.rig.update(dt);
    this.stage.update(dt, this.rig.camera, null);
    this.post.render(this.stage.scene, this.rig.camera, dt);
    if (this.shakeTarget) {
      if (this.shakeLeft > 0) {
        this.shakeLeft -= dt;
        const a = this.shakePx * Math.max(0, this.shakeLeft / this.shakeTotal);
        this.shakeTarget.style.transform = `translate(${((Math.random() - 0.5) * 2 * a).toFixed(1)}px, ${((Math.random() - 0.5) * 2 * a).toFixed(1)}px)`;
      } else if (this.shakeTarget.style.transform) {
        this.shakeTarget.style.transform = '';
      }
    }
  }
}

/** 遠山と朱の日輪を、キャンバスで描いた透過の絵にする（素材ファイル不要）。下へ向かって霧に溶ける */
function inkLandscape(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  let seed = 11;
  const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = 'rgba(196, 69, 47, 0.5)';
  g.beginPath();
  g.arc(720, 150, 62, 0, Math.PI * 2);
  g.fill();
  const layers = [
    { base: 300, amp: 70, a: 0.14 },
    { base: 360, amp: 90, a: 0.24 },
    { base: 430, amp: 110, a: 0.42 },
  ];
  for (const l of layers) {
    const p1 = rnd() * 6;
    const p2 = rnd() * 6;
    const p3 = rnd() * 6;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const n = Math.abs(Math.sin(x * 0.006 + p1)) * 0.55 + Math.abs(Math.sin(x * 0.015 + p2)) * 0.3 + Math.abs(Math.sin(x * 0.04 + p3)) * 0.15;
      g.lineTo(x, l.base - l.amp * n);
    }
    g.lineTo(w, h);
    g.closePath();
    const grad = g.createLinearGradient(0, l.base - l.amp, 0, h);
    grad.addColorStop(0, `rgba(48, 45, 40, ${l.a})`);
    grad.addColorStop(1, 'rgba(48, 45, 40, 0)');
    g.fillStyle = grad;
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
