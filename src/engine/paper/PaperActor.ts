import * as THREE from 'three';
import type { Assets } from '../core/Assets';
import { Ease, type Tweens } from '../core/tween';
import { blobShadowTexture } from './textures';
import { PAPER_SELF_LIGHT } from './PaperSprite';

/** tools/prepare_assets.py が出力する立ち絵マニフェスト */
export interface PosePart {
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PoseInfo {
  width: number;
  height: number;
  /** 元キャンバス中央のx(px)。ポーズ間で立ち位置を揃える基準 */
  cx: number;
  /** 足元のy(px) */
  foot: number;
  parts: Partial<Record<'eye_open' | 'eye_half' | 'eye_closed' | 'mouth_closed' | 'mouth_half' | 'mouth_open', PosePart>>;
}
export type CastManifest = Record<string, PoseInfo>;

export interface ActorDef {
  id: string;
  /** 台本で使う表示名 */
  name: string;
  /** 表情名 → ポーズフォルダ名 */
  expressions: Record<string, string>;
  defaultExpression: string;
  /** 立ったときの身長(m) */
  height: number;
  /** 名札の色 */
  color?: string;
  /** 元の絵が向いている方向（1=右 -1=左）。斜め向きの絵を正しく振り向かせるために使う。既定は 1 */
  artFacing?: 1 | -1;
  /** 会話の立ち絵の大きさ（1＝ふつう）。元の絵の頭身が大きく、ほかの人より大きく見える人を小さくする */
  portraitScale?: number;
  /** 動きのコマ（ポーズフォルダ名）。攻撃は溜め→ヒット→フォロースルーの3枚、被弾は1枚。どちらも右向きの絵 */
  motions?: { attack?: string[]; damage?: string };
}

interface LoadedPose {
  info: PoseInfo;
  base: THREE.Texture;
  parts: Map<string, THREE.Texture>;
}

const plane = new THREE.PlaneGeometry(1, 1);
const EYES = ['eye_open', 'eye_half', 'eye_closed', 'eye_half'] as const;

/**
 * 立ち絵1枚＋目・口パーツを重ねた「紙の役者」。
 * - まばたき・口パク（パーツの差し替えのみでテクスチャの再転送はしない）
 * - 紙の歩き（上下にはずむ・傾く）、振り向き（紙をくるっと裏返す）、ジャンプ、登場（床から起き上がる）
 */
export class PaperActor extends THREE.Group {
  readonly def: ActorDef;
  readonly body = new THREE.Group(); // 振り向き・ジャンプ
  readonly paper = new THREE.Group(); // 歩きの揺れ・起き上がり
  private baseMesh: THREE.Mesh;
  private eyeMesh: THREE.Mesh;
  private mouthMesh: THREE.Mesh;
  private blob: THREE.Mesh;
  private poses = new Map<string, LoadedPose>();
  private current!: LoadedPose;
  private currentId = '';
  /** ポーズの絵が変わったとき（会話の立ち絵を同期するため） */
  onPose: ((actor: PaperActor) => void) | null = null;
  private ppm = 400; // pixel per meter
  expression = '';
  facing: 1 | -1 = 1;
  talking = false;
  private blinkTimer = 2 + Math.random() * 3;
  private blinkStep = -1;
  private blinkClock = 0;
  private mouthClock = 0;
  private walkPhase = 0;
  private walkAmount = 0;
  private breathe = Math.random() * 10;

  private constructor(def: ActorDef) {
    super();
    this.def = def;
    this.name = def.id;
    this.add(this.body);
    this.body.add(this.paper);
    const mk = (alphaTest: number, transparent: boolean) =>
      new THREE.MeshLambertMaterial({ alphaTest, transparent, depthWrite: !transparent, side: THREE.DoubleSide, emissive: PAPER_SELF_LIGHT });
    this.baseMesh = new THREE.Mesh(plane, mk(0.5, false));
    this.baseMesh.castShadow = true;
    this.eyeMesh = new THREE.Mesh(plane, mk(0, true));
    this.mouthMesh = new THREE.Mesh(plane, mk(0, true));
    this.eyeMesh.renderOrder = this.mouthMesh.renderOrder = 2;
    // 目・口も奥行きを書き込む（書き込まないと、被写界深度の合成などで目の部分だけ奥の景色になることがある）
    (this.eyeMesh.material as THREE.Material).depthWrite = true;
    (this.mouthMesh.material as THREE.Material).depthWrite = true;
    this.paper.add(this.baseMesh, this.eyeMesh, this.mouthMesh);
    this.blob = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.016;
    this.blob.renderOrder = -1;
    this.add(this.blob);
  }

  static async load(def: ActorDef, manifest: CastManifest, assets: Assets): Promise<PaperActor> {
    const actor = new PaperActor(def);
    const m = def.motions;
    const poseIds = [...new Set([...Object.values(def.expressions), ...(m?.attack ?? []), ...(m?.damage ? [m.damage] : [])])];
    await Promise.all(
      poseIds.map(async (pid) => {
        const info = manifest[pid];
        if (!info) throw new Error(`立ち絵がありません: ${pid}`);
        const base = await assets.texture(`cast/${pid}/base.webp`);
        const parts = new Map<string, THREE.Texture>();
        await Promise.all(
          Object.entries(info.parts).map(async ([k, p]) => parts.set(k, await assets.texture(`cast/${pid}/${p!.file}`))),
        );
        actor.poses.set(pid, { info, base, parts });
      }),
    );
    const normal = actor.poses.get(def.expressions[def.defaultExpression])!;
    actor.ppm = normal.info.foot / def.height;
    actor.setExpression(def.defaultExpression, true);
    return actor;
  }

  /** 今表示しているポーズ（フォルダ名・画像情報・元絵の向き）。会話の立ち絵に使う */
  get pose(): { id: string; info: PoseInfo; artFacing: 1 | -1 } {
    return { id: this.currentId, info: this.current.info, artFacing: this.poseFacing(this.currentId) };
  }

  get expressions(): string[] {
    return Object.keys(this.def.expressions);
  }

  /** ポーズの元絵の向き。攻撃・被弾の絵はすべて右向きで描かれている */
  private poseFacing(pid: string): 1 | -1 {
    const m = this.def.motions;
    if (m?.attack?.includes(pid) || m?.damage === pid) return 1;
    return this.def.artFacing ?? 1;
  }

  /** 表情（ポーズ）を切り替える。紙がぺこっとたわむ小さな演出つき。 */
  setExpression(expr: string, instant = false, tweens?: Tweens): void {
    const pid = this.def.expressions[expr] ?? this.def.expressions[this.def.defaultExpression];
    this.expression = this.def.expressions[expr] ? expr : this.def.defaultExpression;
    if (this.showPose(pid) && !instant && tweens) {
      tweens.run(0.22, (k) => (this.paper.scale.y = 0.93 + 0.07 * k), Ease.outBack, this.paper.scale);
    }
  }

  /** 攻撃（強く出る）：溜め→ヒット→フォロースルーの3コマのあと、元の表情に戻る */
  async attack(tweens: Tweens): Promise<void> {
    const frames = this.def.motions?.attack;
    if (!frames?.length) return;
    const times = [0.18, 0.1, 0.2];
    for (let i = 0; i < frames.length; i++) {
      this.showPose(frames[i]);
      if (i === 1) void tweens.run(0.16, (k) => (this.body.position.x = Math.sin(k * Math.PI) * 0.12 * this.facing), Ease.linear, this.body.position);
      await tweens.wait(times[i] ?? 0.15);
    }
    this.showPose(this.def.expressions[this.expression]);
  }

  /** 被弾（論破された）：のけぞって、少し後ろへ押し戻される。hold なら、やられの絵のまま戻さない（tear などで戻す） */
  async damage(tweens: Tweens, hold = false): Promise<void> {
    const pid = this.def.motions?.damage;
    if (!pid) return;
    this.showPose(pid);
    await tweens.run(0.4, (k) => (this.body.position.x = -Math.sin(k * Math.PI) * 0.16 * this.facing), Ease.outCubic, this.body.position);
    if (!hold) this.showPose(this.def.expressions[this.expression]);
  }

  /** 今の絵をギザギザに縦に裂いて、左右2枚の紙にする（足元を軸に倒せるよう軸の箱に入れる）。元の絵は隠す */
  private splitPaper(): readonly [THREE.Group, THREE.Group] {
    const base = this.baseMesh;
    // 裂け目：上から下へ、少し斜めにギザギザ
    const n = 10;
    const slant = (Math.random() - 0.5) * 0.12;
    const line = Array.from({ length: n + 1 }, (_, k) => new THREE.Vector2(slant * (k / n - 0.5) + (k === 0 || k === n ? 0 : (Math.random() - 0.5) * 0.14), 0.5 - k / n));
    const half = (side: -1 | 1) => {
      const shape = new THREE.Shape();
      shape.moveTo(0.5 * side, 0.5);
      line.forEach((p) => shape.lineTo(p.x, p.y));
      shape.lineTo(0.5 * side, -0.5);
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      const pos = geo.attributes.position;
      const uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        uv[i * 2] = pos.getX(i) + 0.5;
        uv[i * 2 + 1] = pos.getY(i) + 0.5;
      }
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const mesh = new THREE.Mesh(geo, (base.material as THREE.Material).clone());
      mesh.castShadow = true;
      mesh.scale.copy(base.scale);
      // 足元を軸に倒れるよう、軸の箱に入れる
      const pivot = new THREE.Group();
      pivot.position.set(base.position.x + side * base.scale.x * 0.25, base.position.y - base.scale.y / 2, 0);
      mesh.position.set(-side * base.scale.x * 0.25, base.scale.y / 2, 0);
      pivot.add(mesh);
      this.paper.add(pivot);
      return pivot;
    };
    const halves = [half(-1), half(1)] as const;
    base.visible = this.eyeMesh.visible = this.mouthMesh.visible = false;
    return halves;
  }

  /**
   * 紙が破れる（論破の決め）：今の絵（やられの絵など）がギザギザに縦に裂け、左右へ倒れて床に落ちる。
   * そのあと元の表情の絵で、床からパタンと起き上がる（台本の続きで、この役者がまた話せるように）。onRise は起き上がる瞬間に呼ぶ
   */
  async tear(tweens: Tweens, onRise?: () => void): Promise<void> {
    const base = this.baseMesh;
    const halves = this.splitPaper();
    const x0 = halves.map((h) => h.position.x);
    // ビリッ：左右へ裂けて倒れる
    await tweens.run(
      0.55,
      (k) => {
        halves.forEach((h, i) => {
          const s = i === 0 ? -1 : 1;
          h.rotation.z = -s * 0.75 * k;
          h.rotation.y = s * 0.35 * k;
          h.position.x = x0[i] + s * 0.12 * k;
        });
      },
      Ease.outCubic,
      halves[0],
    );
    await tweens.wait(0.25);
    // 床へぱたりと落ちる
    await tweens.run(0.3, (k) => halves.forEach((h) => (h.rotation.x = (-Math.PI / 2) * k)), Ease.inQuad, halves[1]);
    halves.forEach((h) => {
      this.paper.remove(h);
      const m = h.children[0] as THREE.Mesh;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    // 元の絵に戻し、床に寝かせた状態から、パタンと起き上がる（立った姿を一瞬も見せない）
    this.paper.rotation.x = -Math.PI / 2;
    base.visible = true;
    this.showPose(this.def.expressions[this.expression]);
    this.eyeMesh.visible = !!this.current.info.parts.eye_open;
    this.mouthMesh.visible = !!this.current.info.parts.mouth_closed;
    await tweens.wait(0.3);
    onRise?.();
    await this.popIn(tweens);
  }

  /**
   * 遺体の代わり（死体の絵は用意しない方針）：やられの絵を墨で黒く染め、縦に裂けた紙として床に倒れたまま置く。
   * 動きは無く、すぐにこの姿になる（その場で死んだように見せないため、暗転中などに置く）。
   * 寝かせきると見えないので、カメラから見やすいよう少し起こした角度にする
   */
  corpse(): void {
    const pid = this.def.motions?.damage;
    if (pid) this.showPose(pid);
    this.visible = true;
    this.paper.rotation.x = 0;
    const mat = this.baseMesh.material as THREE.MeshLambertMaterial;
    mat.color.set('#1c1517');
    mat.emissive.set(0, 0, 0);
    const halves = this.splitPaper();
    halves.forEach((h, i) => {
      const s = i === 0 ? -1 : 1;
      h.rotation.set(-0.8, s * 0.3, -s * 0.55);
      h.position.x += s * 0.14;
    });
  }

  /** ポーズの絵を差し替える。変わったら true */
  private showPose(pid: string): boolean {
    const pose = this.poses.get(pid);
    if (!pose || this.current === pose) return false;
    this.current = pose;
    this.currentId = pid;
    this.body.scale.x = this.facing * this.poseFacing(pid);
    const { info } = pose;
    const s = 1 / this.ppm;
    const place = (m: THREE.Mesh, w: number, h: number, x: number, y: number, z: number) => {
      m.scale.set(w * s, h * s, 1);
      // 画像座標(左上原点)→足元中央原点のローカル座標
      m.position.set((x + w / 2 - info.cx) * s, (info.foot - (y + h / 2)) * s, z);
    };
    place(this.baseMesh, info.width, info.height, 0, 0, 0);
    const bm = this.baseMesh.material as THREE.MeshLambertMaterial;
    bm.map = bm.emissiveMap = pose.base;
    bm.needsUpdate = true;
    const eye = info.parts.eye_open;
    this.eyeMesh.visible = !!eye;
    if (eye) {
      place(this.eyeMesh, eye.w, eye.h, eye.x, eye.y, 0.004);
      this.setPart(this.eyeMesh, 'eye_open');
    }
    const mouth = info.parts.mouth_closed;
    this.mouthMesh.visible = !!mouth;
    if (mouth) {
      place(this.mouthMesh, mouth.w, mouth.h, mouth.x, mouth.y, 0.005);
      this.setPart(this.mouthMesh, 'mouth_closed');
    }
    const w = info.width * s;
    this.blob.scale.set(Math.min(w * 0.75, 1.1), 0.34, 1);
    this.onPose?.(this);
    return true;
  }

  private setPart(mesh: THREE.Mesh, key: string): void {
    const tex = this.current.parts.get(key);
    if (!tex) return;
    const mat = mesh.material as THREE.MeshLambertMaterial;
    if (mat.map !== tex) {
      // 同じ種類のテクスチャ差し替えなのでシェーダーの再構築は不要
      const first = !mat.map;
      mat.map = mat.emissiveMap = tex;
      if (first) mat.needsUpdate = true;
    }
  }

  /** 向きを変える。紙を裏返すようにくるっと回る。 */
  async face(dir: 1 | -1, tweens: Tweens): Promise<void> {
    if (dir === this.facing) return;
    this.facing = dir;
    const from = this.body.scale.x;
    const to = dir * this.poseFacing(this.currentId);
    await tweens.run(0.2, (k) => (this.body.scale.x = from + (to - from) * k), Ease.inOutSine, this.body.scale);
  }

  faceInstant(dir: 1 | -1): void {
    this.facing = dir;
    this.body.scale.x = dir * this.poseFacing(this.currentId);
  }

  hop(tweens: Tweens, height = 0.22): Promise<void> {
    return tweens.run(0.34, (k) => (this.body.position.y = Math.sin(k * Math.PI) * height), Ease.linear, this.body.position);
  }

  /** 床に寝ていた紙が起き上がって登場する */
  async popIn(tweens: Tweens): Promise<void> {
    this.visible = true;
    this.paper.rotation.x = -Math.PI / 2;
    await tweens.run(0.45, (k) => (this.paper.rotation.x = -Math.PI / 2 * (1 - k)), Ease.outBack, this.paper.rotation);
  }

  async popOut(tweens: Tweens): Promise<void> {
    await tweens.run(0.3, (k) => (this.paper.rotation.x = -Math.PI / 2 * k), Ease.inQuad, this.paper.rotation);
    this.visible = false;
    this.paper.rotation.x = 0;
  }

  /** 移動中の量(0..1)。紙の歩き揺れに使う */
  setWalking(amount: number): void {
    this.walkAmount = amount;
    // 歩くときは基本の絵に戻す（指差し・驚きなどの絵のまま歩かせない）
    if (amount > 0 && this.expression !== this.def.defaultExpression) this.setExpression(this.def.defaultExpression, true);
  }

  /** 頭のあたりのワールド座標（カメラの寄り・吹き出し用） */
  headPosition(out = new THREE.Vector3()): THREE.Vector3 {
    return this.getWorldPosition(out).add(new THREE.Vector3(0, this.def.height * 0.78, 0));
  }

  update(dt: number): void {
    // まばたき
    if (this.eyeMesh.visible) {
      if (this.blinkStep < 0) {
        this.blinkTimer -= dt;
        if (this.blinkTimer <= 0) {
          this.blinkStep = 0;
          this.blinkClock = 0;
        }
      } else {
        this.blinkClock += dt;
        if (this.blinkClock > 0.055) {
          this.blinkClock = 0;
          this.blinkStep++;
          if (this.blinkStep >= EYES.length) {
            this.blinkStep = -1;
            this.blinkTimer = 1.8 + Math.random() * 3.5;
            this.setPart(this.eyeMesh, 'eye_open');
          } else this.setPart(this.eyeMesh, EYES[this.blinkStep]);
        }
      }
    }
    // 口パク
    if (this.mouthMesh.visible) {
      if (this.talking) {
        this.mouthClock -= dt;
        if (this.mouthClock <= 0) {
          this.mouthClock = 0.07 + Math.random() * 0.06;
          const r = Math.random();
          this.setPart(this.mouthMesh, r < 0.4 ? 'mouth_open' : r < 0.75 ? 'mouth_half' : 'mouth_closed');
        }
      } else this.setPart(this.mouthMesh, 'mouth_closed');
    }
    // 紙の歩き：はずむ・傾く。止まっているときはゆっくり呼吸
    this.breathe += dt;
    if (this.walkAmount > 0.01) {
      this.walkPhase += dt * 11;
      const a = this.walkAmount;
      this.paper.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.07 * a;
      this.paper.rotation.z = Math.sin(this.walkPhase) * 0.07 * a;
    } else {
      this.paper.position.y *= 0.8;
      this.paper.rotation.z *= 0.8;
      this.paper.scale.x = 1 + Math.sin(this.breathe * 2.2) * 0.006;
    }
  }
}
