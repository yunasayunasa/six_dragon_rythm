import * as THREE from 'three';
import { Assets } from './Assets';
import { Input } from './Input';
import { Tweens } from './tween';
import { gameSize, preventZoom, updateRotation } from './screen';
import { PostFX } from '../render/PostFX';
import { pickQuality, type QualityProfile } from '../render/quality';
import { CameraRig } from '../stage/CameraRig';
import { Stage } from '../stage/Stage';
import { Sound } from '../audio/Sound';
import { Hud } from '../ui/Hud';
import { Store } from './Store';
import { Settings, TEXT_SPEEDS } from './Settings';
import { ReadMarks } from './ReadMarks';
import { SaveSlots } from './SaveSlots';
import { Voices } from '../audio/Voices';

export interface EngineOptions {
  /** 端末に残す記録（設定・既読・セーブ）の名前空間。ゲームごとに変える */
  namespace?: string;
}

/** ジャンルごとの遊び方。Engine は常に1つのモードを動かす。 */
export interface Mode {
  enter(engine: Engine): void | Promise<void>;
  exit?(engine: Engine): void;
  update(dt: number, engine: Engine): void;
}

/**
 * エンジン本体。描画・時間・入力・音・UI・舞台をまとめ、現在のモードを毎フレーム動かす。
 * ゲーム固有の知識は持たない。
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly quality: QualityProfile;
  readonly post: PostFX;
  readonly rig: CameraRig;
  readonly stage: Stage;
  readonly tweens = new Tweens();
  readonly input = new Input();
  readonly sound = new Sound();
  readonly assets = new Assets();
  /** セリフの声（話ごとに load する） */
  readonly voices = new Voices();
  readonly hud: Hud;
  /** 端末に残す記録 */
  readonly store: Store;
  readonly settings: Settings;
  readonly saves: SaveSlots;
  private mode: Mode | null = null;
  private last = 0;
  private paused = false;
  private warming = false;
  private statsEl: HTMLElement | null = null;
  private fpsAcc = { t: 0, frames: 0, fps: 0 };
  /** 毎フレーム呼ばれる追加処理（デバッグ・演出用） */
  readonly onFrame = new Set<(dt: number) => void>();
  focusOverride: number | null = null;
  /** 手前の物を透かす基準になる主人公 */
  player: THREE.Object3D | null = null;

  constructor(container: HTMLElement, options: EngineOptions = {}) {
    this.store = new Store(options.namespace ?? 'paper-stage');
    this.settings = new Settings(this.store);
    this.saves = new SaveSlots(this.store);
    this.quality = pickQuality();
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);
    this.assets.maxAnisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    this.post = new PostFX(this.renderer, this.quality);
    this.rig = new CameraRig(16 / 9); // 実際の縦横比は resize() で決まる
    this.stage = new Stage(this.assets, this.tweens, this.post, this.quality);
    this.hud = new Hud(this.input, this.sound, this.settings, new ReadMarks(this.store), this.voices);
    const apply = () => {
      this.sound.setVolumeScale(this.settings.values.bgm, this.settings.values.se, this.settings.values.voice);
      this.hud.cps = TEXT_SPEEDS[this.settings.values.textSpeed] ?? TEXT_SPEEDS[3];
    };
    this.settings.onChange.add(apply);
    apply();
    if (new URLSearchParams(location.search).has('stats')) {
      this.statsEl = document.createElement('div');
      this.statsEl.className = 'stats';
      document.body.appendChild(this.statsEl);
    }
    preventZoom();
    addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', () => this.setPaused(document.hidden));
    addEventListener('pagehide', () => this.setPaused(true));
    addEventListener('pageshow', () => this.setPaused(false));
    this.resize();
  }

  private resize = () => {
    updateRotation();
    const { w, h } = gameSize();
    const dpr = Math.min(devicePixelRatio || 1, this.quality.dprCap);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, dpr);
    this.rig.setAspect(w / h);
  };

  setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    this.input.reset();
    if (p) this.sound.suspend();
    else {
      this.sound.resume();
      this.last = performance.now(); // 復帰直後に時間が飛ばないようにする
    }
  }

  async setMode(mode: Mode): Promise<void> {
    this.mode?.exit?.(this);
    this.mode = mode;
    await mode.enter(this);
  }

  /**
   * 舞台の物を、隠れている物（結末の飛空艇など）も含めて先に1回描いておく。
   * 初めて現れた瞬間のカクつき（シェーダーの準備・画像の転送）を読み込み中に済ませる。
   */
  async warmUp(): Promise<void> {
    const restore: (() => void)[] = [];
    this.warming = true;
    this.stage.scene.traverse((o) => {
      // 光は数が変わるとシェーダーが変わるので、今のままにする
      if (o instanceof THREE.Light) return;
      if (!o.visible) {
        o.visible = true;
        restore.push(() => (o.visible = false));
      }
      if (o.frustumCulled) {
        o.frustumCulled = false;
        restore.push(() => (o.frustumCulled = true));
      }
    });
    try {
      await this.post.prewarm(this.stage.scene, this.rig.camera);
    } finally {
      restore.forEach((f) => f());
      this.warming = false;
      this.last = performance.now();
    }
  }

  start(): void {
    this.last = performance.now();
    this.renderer.setAnimationLoop(this.frame);
  }

  /**
   * 今の画面を1枚の絵に写し取る（画面が割れる演出などに使う）。
   * 描いた直後の同じ処理の中で写すので、preserveDrawingBuffer は要らない。scale で縮めて軽くする
   */
  snapshot(scale = 0.5): HTMLCanvasElement {
    this.post.render(this.stage.scene, this.rig.camera, 0);
    const src = this.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(src.width * scale));
    c.height = Math.max(1, Math.round(src.height * scale));
    c.getContext('2d')?.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  private frame = (now: number) => {
    // warmUp 中は隠れた物を一時的に出しているので、動かしも描きもしない
    if (this.paused || this.warming) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.renderer.info.reset();
    this.input.poll();
    this.hud.update(dt);
    // 早送り中は演出の動き（Tween・カメラ）も速める
    const sdt = this.hud.skipping ? dt * 4 : dt;
    this.tweens.update(sdt);
    this.mode?.update(dt, this);
    this.onFrame.forEach((f) => f(dt));
    this.rig.update(sdt);
    this.stage.update(dt, this.rig.camera, this.player);
    this.post.grade.focusDistance = this.focusOverride ?? this.rig.focusDistance();
    this.post.render(this.stage.scene, this.rig.camera, dt);
    if (this.statsEl) this.updateStats(dt);
  };

  private updateStats(dt: number): void {
    const a = this.fpsAcc;
    a.t += dt;
    a.frames++;
    if (a.t >= 0.5) {
      a.fps = a.frames / a.t;
      a.t = 0;
      a.frames = 0;
      const info = this.renderer.info;
      this.statsEl!.textContent = `${a.fps.toFixed(0)} fps  q=${this.quality.name}  dpr=${this.renderer.getPixelRatio().toFixed(2)}\ncalls ${info.render.calls}  tris ${info.render.triangles}  tex ${info.memory.textures}`;
    }
  }
}
