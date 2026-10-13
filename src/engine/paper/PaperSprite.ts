import * as THREE from 'three';
import { blobShadowTexture } from './textures';

export type Billboard = 'none' | 'y';

export interface PaperOptions {
  /** 高さ(m)。幅は画像の縦横比から決まる */
  height: number;
  /** 画像上の基準点。x:0=左 1=右、y:0=下 1=上。既定は足元中央 */
  pivot?: [number, number];
  billboard?: Billboard;
  castShadow?: boolean;
  /** 接地影の大きさ（幅に対する比率）。false で無し */
  blob?: number | false;
  /** 風で揺れる量（ラジアン） */
  sway?: number;
  /** 床に寝かせて置く（水たまり等） */
  flat?: boolean;
  /** 2枚を十字に組む（木や茂み） */
  cross?: boolean;
  renderOrder?: number;
}

const sharedPlane = new THREE.PlaneGeometry(1, 1);

/** 紙の自己発光ぶん。影側でも紙の色が沈みすぎないようにする（ペーパー調の平たい見た目） */
export const PAPER_SELF_LIGHT = new THREE.Color(0.3, 0.27, 0.28);

export function paperMaterial(map: THREE.Texture, alphaTest = 0.5): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map, emissiveMap: map, emissive: PAPER_SELF_LIGHT, alphaTest, side: THREE.DoubleSide });
}

/**
 * 紙の切り抜き1枚。root(位置) → body(演出用の揺れ・回転) → mesh の3層構造。
 * 位置を動かすゲーム側と、紙らしい動きをつける演出側がぶつからないようにしている。
 */
export class PaperSprite extends THREE.Group {
  readonly body = new THREE.Group();
  readonly meshes: THREE.Mesh[] = [];
  readonly blobMesh: THREE.Mesh | null = null;
  width = 1;
  height = 1;
  billboard: Billboard;
  private swayAmp: number;
  private swayPhase = Math.random() * Math.PI * 2;
  private opacity = 1;

  constructor(texture: THREE.Texture, private opts: PaperOptions) {
    super();
    const img = texture.image as { width: number; height: number };
    this.height = opts.height;
    this.width = opts.height * (img.width / img.height);
    this.billboard = opts.billboard ?? 'none';
    this.swayAmp = opts.sway ?? 0;
    this.add(this.body);

    const [px, py] = opts.pivot ?? [0.5, 0];
    const mat = paperMaterial(texture, opts.flat ? 0.02 : 0.5);
    if (opts.flat) {
      mat.transparent = true;
      mat.depthWrite = false;
      mat.alphaTest = 0;
    }
    const count = opts.cross ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(sharedPlane, mat);
      m.scale.set(this.width, this.height, 1);
      m.position.set((0.5 - px) * this.width, (0.5 - py) * this.height, 0);
      if (opts.cross) m.rotation.y = i === 0 ? Math.PI / 4 : -Math.PI / 4;
      if (opts.flat) {
        m.rotation.x = -Math.PI / 2;
        m.position.set(0, 0.012, 0);
      }
      m.castShadow = !!opts.castShadow && !opts.flat;
      m.renderOrder = opts.renderOrder ?? 0;
      this.body.add(m);
      this.meshes.push(m);
    }

    const blobScale = opts.blob === undefined ? 0.8 : opts.blob;
    if (blobScale && !opts.flat) {
      const bm = new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false });
      const blobMesh = new THREE.Mesh(sharedPlane, bm);
      blobMesh.rotation.x = -Math.PI / 2;
      blobMesh.scale.set(this.width * blobScale, Math.min(this.width * blobScale, 1.2) * 0.5, 1);
      blobMesh.position.y = 0.015;
      blobMesh.renderOrder = -1;
      this.add(blobMesh);
      this.blobMesh = blobMesh;
    }
  }

  setOpacity(a: number): void {
    if (a === this.opacity) return;
    this.opacity = a;
    for (const m of this.meshes) {
      const mat = m.material as THREE.MeshLambertMaterial;
      mat.transparent = a < 0.999 || !!this.opts.flat;
      mat.opacity = a;
      mat.depthWrite = a >= 0.999 && !this.opts.flat;
    }
  }

  update(dt: number, camera: THREE.Camera, wind: number): void {
    if (this.billboard === 'y') {
      const dx = camera.position.x - this.position.x;
      const dz = camera.position.z - this.position.z;
      this.rotation.y = Math.atan2(dx, dz);
    }
    if (this.swayAmp) {
      this.swayPhase += dt * (1.2 + wind);
      this.body.rotation.z = Math.sin(this.swayPhase) * this.swayAmp * (0.5 + wind);
    }
  }
}
