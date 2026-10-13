import * as THREE from 'three';
import type { Assets } from '../core/Assets';
import { Ease, type Tweens } from '../core/tween';
import type { PostFX } from '../render/PostFX';
import type { QualityProfile } from '../render/quality';
import { PaperActor } from '../paper/PaperActor';
import { PaperSprite, type PaperOptions } from '../paper/PaperSprite';
import { cloneState, lerpLook, lookState, LOOKS, type LookState } from './Look';
import { Burst, Confetti, Motes, Spray } from './Particles';

const backdropVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const backdropFrag = /* glsl */ `
uniform sampler2D tMap;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uTint;
uniform vec3 uGlow;
uniform vec2 uSun;
uniform float uScroll;
uniform float uHasMap;
uniform float uRaw;
varying vec2 vUv;
void main() {
  vec3 sky = mix(uHorizon, uTop, smoothstep(0.25, 1.0, vUv.y));
  vec3 col = sky;
  if (uHasMap > 0.5 && uRaw > 0.5) {
    // 町並みなどの絵は、色を空へ寄せず・流さずにそのまま見せる（色合いだけ Look に合わせる）
    col = texture2D(tMap, vUv).rgb * uTint;
  } else if (uHasMap > 0.5) {
    vec2 uv = vec2(fract(vUv.x * 1.0 + uScroll), clamp((vUv.y - 0.04) * 1.12, 0.0, 1.0));
    vec3 tex = texture2D(tMap, uv).rgb;
    // 絵の青空部分を夕焼けの空色へ寄せ、雲は色付きの光を受ける
    float cloud = smoothstep(0.55, 0.9, dot(tex, vec3(0.3, 0.4, 0.3)) + tex.r * 0.35 - tex.b * 0.2);
    vec3 lit = tex * uTint;
    col = mix(sky * (0.75 + tex * 0.35), lit, cloud);
  }
  float d = distance(vUv * vec2(2.4, 1.0), uSun * vec2(2.4, 1.0));
  col += uGlow * (exp(-d * 5.5) * 0.9 + exp(-d * 1.6) * 0.25);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export interface Raiser {
  x: number;
  set: (k: number) => void;
}

export interface PropDef extends PaperOptions {
  image: string;
  x: number;
  z: number;
  y?: number;
  rotY?: number;
  /** 主人公が重なったら半透明にする前景物 */
  occluder?: boolean;
  id?: string;
}

/**
 * 舞台（シーン）本体。光・空・霧・床・紙の小物・役者・粒子をまとめて持つ。
 * ジャンルに依存しない。どのジャンルのモードもこの Stage の上で動く。
 */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sprites: PaperSprite[] = [];
  readonly actors = new Map<string, PaperActor>();
  readonly occluders: PaperSprite[] = [];
  readonly named = new Map<string, THREE.Object3D>();
  private backdrops: THREE.Mesh[] = [];
  private backdropMat: THREE.ShaderMaterial;
  /** 場所ごとの舞台（複数の場所を行き来する話では、場所ごとに組み立てて、見える場所だけ出す） */
  private areas = new Map<string, THREE.Group>();
  /** いま組み立てている所（add 系はここへ足す）。場所を使わない話では scene そのもの */
  private root: THREE.Object3D = this.scene;
  /** いま見えている場所（場所を使わない話では null） */
  activeArea: string | null = null;
  private motes: Motes[] = [];
  readonly burst: Burst;
  /** 飛び散る粒（土ぼこり・水しぶき・墨・火花） */
  readonly spray: Spray;
  /** 紙吹雪 */
  readonly confetti: Confetti;
  private look: LookState;
  wind = 0.3;
  private time = 0;
  /** 開幕に床から起き上がる物（k: 0=倒れている 1=立っている）。置いた所（場所 or scene）ごと。役者は今いる所で数える */
  private raisers = new Map<THREE.Object3D, Raiser[]>();

  constructor(
    private assets: Assets,
    private tweens: Tweens,
    private post: PostFX,
    private quality: QualityProfile,
  ) {
    this.look = lookState(LOOKS.sunset);
    this.scene.fog = new THREE.Fog(0xffffff, 10, 60);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = quality.shadows;
    this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    const sc = this.sun.shadow.camera;
    sc.left = -14;
    sc.right = 14;
    sc.top = 10;
    sc.bottom = -8;
    sc.near = 1;
    sc.far = 60;
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.backdropMat = new THREE.ShaderMaterial({
      uniforms: {
        tMap: { value: null },
        uHasMap: { value: 0 },
        uRaw: { value: 0 },
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uTint: { value: new THREE.Color() },
        uGlow: { value: new THREE.Color() },
        uSun: { value: new THREE.Vector2(0.3, 0.45) },
        uScroll: { value: 0 },
      },
      vertexShader: backdropVert,
      fragmentShader: backdropFrag,
      depthWrite: true,
      fog: false,
    });
    this.burst = new Burst(Math.max(24, quality.particles), '#fff0bf', 0.14);
    this.scene.add(this.burst);
    this.spray = new Spray(Math.max(80, quality.particles * 3));
    this.confetti = new Confetti(Math.max(60, quality.particles * 2));
    this.scene.add(this.spray, this.confetti);
    this.applyLook();
  }

  // ---------- 場所 ----------
  /** 場所の入れ物（無ければ作る）。場所ごとに別の舞台を組み、見える場所だけ出す */
  area(id: string): THREE.Group {
    let g = this.areas.get(id);
    if (!g) {
      g = new THREE.Group();
      g.name = `area:${id}`;
      g.visible = false;
      this.areas.set(id, g);
      this.scene.add(g);
    }
    return g;
  }

  /** この場所を組み立てる（以降の add 系はこの場所に足す）。null で scene へ戻す */
  buildArea(id: string | null): void {
    this.root = id === null ? this.scene : this.area(id);
  }

  /** 見える場所を切り替える（すぐに。たたむ・組み立ての演出は呼ぶ側で） */
  showArea(id: string): void {
    this.activeArea = id;
    for (const [k, g] of this.areas) g.visible = k === id;
    this.root = this.area(id);
  }

  /** その物（役者など）が今いる場所の id。場所を使わない話では null */
  areaOf(obj: THREE.Object3D): string | null {
    for (const [k, g] of this.areas) if (obj.parent === g) return k;
    return null;
  }

  /** 物（役者など）を別の場所へ移す */
  moveToArea(obj: THREE.Object3D, id: string): void {
    this.area(id).add(obj);
  }

  /** いま見えている所に置かれているか（場所を使わない話では常に true） */
  isHere(obj: THREE.Object3D): boolean {
    return this.activeArea === null || obj.parent === this.areas.get(this.activeArea);
  }

  /** 開幕の組み立て・場所を移るときに、床から起き上がる物を足す（いま組み立てている所に）。k: 0=倒れている 1=立っている */
  addRaiser(r: Raiser): void {
    let list = this.raisers.get(this.root);
    if (!list) this.raisers.set(this.root, (list = []));
    list.push(r);
  }

  /** いま見えている所の起き上がる物（置いた物＋そこにいる役者） */
  private currentRaisers(): Raiser[] {
    const here = this.activeArea === null ? this.scene : this.area(this.activeArea);
    const list = [...(this.raisers.get(here) ?? [])];
    for (const a of this.actors.values()) {
      if (a.parent === here) list.push({ x: a.position.x, set: (k) => (a.paper.rotation.x = (-Math.PI / 2) * (1 - k)) });
    }
    return list;
  }

  /** いま組み立てている所（場所 or scene）へ物を足す。舞台装置を自作するときに使う */
  add(...objs: THREE.Object3D[]): void {
    this.root.add(...objs);
  }

  /** 遠景の一枚絵（空）を張る。場所ごとに別の絵を張れる（色合いは共通の Look に従う） */
  async setBackdrop(image: string | null, opts: { width: number; height: number; z: number; y: number; raw?: boolean }): Promise<void> {
    const geo = new THREE.PlaneGeometry(opts.width, opts.height);
    // 空の色などは全員で共有し、絵だけ場所ごとに持つ
    const mat = this.backdrops.length === 0 ? this.backdropMat : this.backdropMat.clone();
    if (mat !== this.backdropMat) {
      mat.uniforms = { ...this.backdropMat.uniforms, tMap: { value: null }, uHasMap: { value: 0 }, uRaw: { value: 0 } };
    }
    mat.uniforms.uRaw.value = opts.raw ? 1 : 0;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, opts.y, opts.z);
    mesh.renderOrder = -10;
    if (image) {
      const t = await this.assets.texture(image);
      t.wrapS = THREE.RepeatWrapping;
      t.needsUpdate = true;
      mat.uniforms.tMap.value = t;
      mat.uniforms.uHasMap.value = 1;
    }
    this.backdrops.push(mesh);
    this.root.add(mesh);
  }

  /** 繰り返しテクスチャの床 */
  async addFloor(image: string, opts: { width: number; depth: number; z: number; repeat: [number, number]; color?: string }): Promise<THREE.Mesh> {
    const t = await this.assets.texture(image, { repeat: true });
    const tex = t.clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...opts.repeat);
    tex.needsUpdate = true;
    const mat = new THREE.MeshLambertMaterial({ map: tex, color: opts.color ?? '#ffffff' });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(opts.width, opts.depth), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0, opts.z);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  /** 単色の立体（板・柱・台座など舞台装置） */
  addBlock(size: [number, number, number], pos: [number, number, number], color: string, opts: { cast?: boolean; name?: string } = {}): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(...pos);
    mesh.castShadow = opts.cast ?? true;
    mesh.receiveShadow = true;
    if (opts.name) this.named.set(opts.name, mesh);
    this.root.add(mesh);
    this.addGrower(mesh, pos[0], pos[1] - size[1] / 2, size[1]);
    return mesh;
  }

  addCylinder(radius: number, height: number, pos: [number, number, number], color: string, cast = true): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.05, height, 10), new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(pos[0], pos[1] + height / 2, pos[2]);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.addGrower(mesh, pos[0], pos[1], height);
    return mesh;
  }

  /** 立体は床から伸びるように起き上がる */
  private addGrower(mesh: THREE.Mesh, x: number, bottom: number, height: number): void {
    this.addRaiser({
      x,
      set: (k) => {
        const s = Math.max(0.001, k);
        mesh.scale.y = s;
        mesh.position.y = bottom + (height / 2) * s;
      },
    });
  }

  async addProp(def: PropDef): Promise<PaperSprite> {
    const tex = await this.assets.texture(`props/${def.image}.webp`);
    const s = new PaperSprite(tex, def);
    s.position.set(def.x, def.y ?? 0, def.z);
    if (def.rotY) s.rotation.y = def.rotY;
    this.root.add(s);
    this.sprites.push(s);
    if (def.occluder) this.occluders.push(s);
    if (def.id) this.named.set(def.id, s);
    if (!def.flat) this.addRaiser({ x: def.x, set: (k) => (s.body.rotation.x = (-Math.PI / 2) * (1 - k)) });
    // 影は主要な物だけ受ける（床・台座）。紙同士は受けない＝軽い
    return s;
  }

  addActor(actor: PaperActor, x: number, z: number, facing: 1 | -1 = 1): PaperActor {
    actor.position.set(x, 0, z);
    actor.faceInstant(facing);
    this.root.add(actor);
    this.actors.set(actor.def.id, actor);
    return actor;
  }

  actor(id: string): PaperActor {
    const a = this.actors.get(id);
    if (!a) throw new Error(`役者がいません: ${id}`);
    return a;
  }

  /** 舞台の紙・装置をすべて床に倒す（開幕の組み立て演出の準備） */
  flattenAll(): void {
    for (const r of this.currentRaisers()) r.set(0);
  }

  /** 倒した物を左から順にパタパタと起こす（ペーパークラフトの舞台が組み上がる演出） */
  async assemble(onRaise?: (index: number) => void): Promise<void> {
    const list = this.currentRaisers().sort((a, b) => a.x - b.x);
    await Promise.all(
      list.map(async (r, i) => {
        await this.tweens.wait(i * 0.035);
        onRaise?.(i);
        await this.tweens.run(0.5, (k) => r.set(k), Ease.outBack, r);
      }),
    );
  }

  /** 組み立ての逆：見えている所の紙・装置を右から順にパタパタと床へ倒す（場所を移るときの幕） */
  async fold(): Promise<void> {
    const list = this.currentRaisers().sort((a, b) => b.x - a.x);
    await Promise.all(
      list.map(async (r, i) => {
        await this.tweens.wait(i * 0.02);
        await this.tweens.run(0.3, (k) => r.set(1 - k), Ease.inQuad, r);
      }),
    );
  }

  addMotes(box: THREE.Box3, color?: string): void {
    const m = new Motes(this.quality.particles, box, color);
    this.motes.push(m);
    this.root.add(m);
  }

  /** Lookを切り替える（seconds秒かけて補間） */
  setLook(name: string, seconds = 1.2): Promise<void> {
    const target = LOOKS[name];
    if (!target) throw new Error(`Lookがありません: ${name}`);
    const from = cloneState(this.look);
    const to = lookState(target);
    return this.tweens.run(
      seconds,
      (k) => {
        lerpLook(this.look, from, to, k);
        this.applyLook();
      },
      Ease.inOutSine,
      this.look,
    );
  }

  private applyLook(): void {
    const { colors: c, nums: n, sunDir } = this.look;
    this.hemi.color.copy(c.hemiSky);
    this.hemi.groundColor.copy(c.hemiGround);
    this.hemi.intensity = n.hemiIntensity;
    this.sun.color.copy(c.sunColor);
    this.sun.intensity = n.sunIntensity;
    this.sun.position.copy(this.sun.target.position).addScaledVector(sunDir, 30);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(c.fogColor);
    fog.near = n.fogNear;
    fog.far = n.fogFar;
    const u = this.backdropMat.uniforms;
    (u.uTop.value as THREE.Color).copy(c.skyTop);
    (u.uHorizon.value as THREE.Color).copy(c.skyHorizon);
    (u.uTint.value as THREE.Color).copy(c.backdropTint);
    (u.uGlow.value as THREE.Color).copy(c.sunGlow);
    this.scene.background = c.skyHorizon;
    const g = this.post.grade;
    g.tint.copy(c.tint);
    g.shadowTint.copy(c.shadowTint);
    g.saturation = n.saturation;
    g.contrast = n.contrast;
    g.exposure = n.exposure;
    g.vignette = n.vignette;
    g.drama = n.drama;
    g.farBlur = n.farBlur;
    g.nearBlur = n.nearBlur;
    g.bloom = n.bloom;
    g.leak = n.leak;
    g.leakColor.copy(c.sunGlow);
  }

  /** 影を落とす範囲をカメラ付近に合わせる */
  centerShadow(x: number): void {
    this.sun.target.position.set(x, 0, 0);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.look.sunDir, 30);
  }

  update(dt: number, camera: THREE.Camera, player: THREE.Object3D | null): void {
    this.time += dt;
    this.backdropMat.uniforms.uScroll.value = this.time * 0.0015;
    for (const s of this.sprites) s.update(dt, camera, this.wind);
    for (const a of this.actors.values()) a.update(dt);
    for (const m of this.motes) m.update(dt, this.wind);
    this.burst.update(dt);
    this.spray.update(dt);
    this.confetti.update(dt);
    if (player) this.updateOcclusion(camera, player);
    for (const b of this.backdrops) b.position.x = camera.position.x * 0.85; // 遠景はほぼ動かない＝奥行き感
  }

  /** 主人公の手前にある前景物を透かす */
  private updateOcclusion(camera: THREE.Camera, player: THREE.Object3D): void {
    const p = player.position;
    for (const s of this.occluders) {
      const inFront = s.position.z > p.z + 0.3 && s.position.z < camera.position.z;
      const near = Math.abs(s.position.x - p.x) < s.width * 0.55 + 0.3;
      s.setOpacity(inFront && near ? 0.35 : 1);
    }
  }
}
