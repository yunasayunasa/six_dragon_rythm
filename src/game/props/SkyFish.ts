import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 夕焼けの空魚の群れ。光と甘い匂いに寄ってくる、ひれの長い金魚のような魚。
 * 台本の `@演出 空魚 寄ってくる` で、雲の海の下から昇ってきて、center（灯晶）のまわりを渦を巻いて泳ぐ。
 * 体とひれは別々のインスタンス描画（体は不透明寄り、ひれは光を足す半透明）。泳ぎのくねりは頂点シェーダーで動かす。
 */

/** 魚1匹の体（長さ1、鼻先が +x、尾の付け根が原点） */
function bodyGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const k = i / n; // 0＝尾の付け根 → 1＝鼻先
    // 頭のほうがふっくら、尾に向かって細く
    const r = 0.17 * Math.pow(Math.sin(Math.PI * (0.08 + k * 0.92)), 0.75) * (0.55 + 0.45 * k) + 0.012;
    pts.push(new THREE.Vector2(r, k * 0.62));
  }
  const g = new THREE.LatheGeometry(pts, 14);
  g.rotateZ(-Math.PI / 2); // 回転軸（y）を前後（x）へ
  g.scale(1, 1.15, 0.72); // 金魚らしく縦に高く、横に薄く
  return g;
}

/** ひれ（xy 平面の薄い板）。uv.y はひれの付け根(0)→先(1) */
function finShape(points: Array<[number, number]>, root: [number, number]): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) s.lineTo(x, y);
  const g = new THREE.ShapeGeometry(s, 6);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  let max = 0;
  for (let i = 0; i < p.count; i++) max = Math.max(max, Math.hypot(p.getX(i) - root[0], p.getY(i) - root[1]));
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), Math.hypot(p.getX(i) - root[0], p.getY(i) - root[1]) / max);
  return g;
}

/** 尾びれ・背びれ・胸びれをまとめた1匹分のひれ */
function finsGeometry(): THREE.BufferGeometry {
  // 長くたなびく二股の尾（付け根は原点、後ろ＝ -x へ）
  const tail: Array<[number, number]> = [[0.02, 0.05]];
  for (let i = 0; i <= 12; i++) {
    const a = i / 12;
    const x = -0.1 - Math.sin(a * Math.PI) * 0.48;
    const y = 0.3 - a * 0.6 + Math.sin(a * Math.PI * 2) * 0.06;
    tail.push([x, y]);
    if (i === 6) tail.push([-0.3, 0]); // 二股の切れ込み
  }
  tail.push([0.02, -0.05]);
  const tailGeo = finShape(tail, [0, 0]);
  // 背びれ（体の上に立つ）
  const dorsal = finShape([[0.38, 0.17], [0.3, 0.36], [0.12, 0.3], [0.05, 0.13]], [0.25, 0.16]);
  // 胸びれ（左右。体から斜め下へ）
  const pec = (side: number) => {
    const g = finShape([[0, 0], [-0.08, -0.2], [-0.22, -0.24], [-0.1, -0.02]], [0, 0]);
    g.rotateX(side * 0.9);
    g.translate(0.42, -0.07, side * 0.09);
    return g;
  };
  const merged = mergeGeometries([tailGeo, dorsal, pec(1), pec(-1)])!;
  return merged;
}

const bodyVert = /* glsl */ `
attribute float aPhase;
attribute vec3 aTint;
uniform float uTime;
varying vec3 vN;
varying vec3 vView;
varying float vX;
varying vec3 vTint;
varying vec3 vLocal;
void main() {
  vec3 p = position;
  vLocal = position;
  // 尾に近いほど大きく、くねって泳ぐ
  float tail = 1.0 - clamp(p.x / 0.62, 0.0, 1.0);
  p.z += sin(uTime * 7.0 + aPhase - p.x * 5.0) * 0.07 * tail * tail;
  vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vView = normalize(cameraPosition - world.xyz);
  vX = p.x / 0.62;
  vTint = aTint;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const bodyFrag = /* glsl */ `
uniform float uGlow;
varying vec3 vN;
varying vec3 vView;
varying float vX;
varying vec3 vTint;
varying vec3 vLocal;
void main() {
  vec3 n = normalize(vN);
  float fres = pow(max(0.0, 1.0 - abs(dot(n, vView))), 2.2);
  // 背は濃く、腹は明るい金色。頭のほうが明るい
  float belly = 1.0 - smoothstep(-0.6, 0.2, n.y);
  vec3 col = mix(vTint, vec3(1.0, 0.86, 0.55), belly * 0.7);
  col = mix(col * 0.75, col, smoothstep(0.0, 0.8, vX));
  // うろこのきらめき
  col += vec3(1.0, 0.9, 0.7) * pow(max(0.0, dot(reflect(-vView, n), normalize(vec3(-0.3, 0.8, 0.5)))), 24.0) * 0.6;
  // 縁が光る（夕焼けの光を透かしている）
  col += vec3(1.0, 0.75, 0.5) * fres * 0.9;
  // 更紗模様（白い斑）
  float spots = sin(vLocal.x * 23.0 + vTint.g * 9.0) * sin(vLocal.y * 19.0 + vLocal.z * 7.0 + vTint.b * 13.0);
  col = mix(col, vec3(1.0, 0.96, 0.9), smoothstep(0.5, 0.75, spots) * 0.6);
  col *= 0.75 + uGlow * 0.5;
  // 目（左右）：黒目に小さな光
  vec2 eye = vec2(0.5, 0.045);
  float de = length(vec2(vLocal.x, vLocal.y) - eye);
  float side = step(0.035, abs(vLocal.z));
  col = mix(col, vec3(0.08, 0.04, 0.06), (1.0 - smoothstep(0.026, 0.034, de)) * side);
  col = mix(col, vec3(1.0), (1.0 - smoothstep(0.006, 0.011, length(vec2(vLocal.x, vLocal.y) - eye - vec2(0.008, 0.01)))) * side);
  gl_FragColor = vec4(col, 0.96);
  #include <colorspace_fragment>
}`;

const finVert = /* glsl */ `
attribute float aPhase;
attribute vec3 aTint;
uniform float uTime;
varying vec2 vUv;
varying vec3 vTint;
void main() {
  vec3 p = position;
  float far = uv.y;
  // ひれは、付け根から先へ波が伝わるようにたなびく
  p.z += sin(uTime * 5.0 + aPhase - far * 4.0) * 0.12 * far * far;
  p.y += sin(uTime * 3.3 + aPhase * 1.7 - far * 3.0) * 0.04 * far;
  vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vUv = uv;
  vTint = aTint;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const finFrag = /* glsl */ `
uniform float uGlow;
varying vec2 vUv;
varying vec3 vTint;
void main() {
  // 付け根は色が濃く、先は透けて光る。すじ模様を入れる
  float far = vUv.y;
  float rib = 0.9 + 0.1 * sin(vUv.x * 70.0);
  vec3 col = mix(vTint * 1.25, vec3(1.0, 0.93, 0.8), smoothstep(0.1, 0.9, far)) * rib;
  // pow は負の数を入れると結果が決まらない（先端で 1.0 - far がわずかに負になり、NaN がぼかしで黒い四角に広がった）
  float a = pow(max(0.0, 1.0 - far), 1.3) * 0.85 * (0.6 + uGlow * 0.4);
  if (a < 0.04) discard;
  gl_FragColor = vec4(col * a, a);
  #include <colorspace_fragment>
}`;

/** 光の粒（魚のまわりの光と、尾を引くきらめき） */
const sparkVert = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale * (300.0 / -mv.z);
  vAlpha = aAlpha;
  gl_Position = projectionMatrix * mv;
}`;

const sparkFrag = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  // smoothstep は「下の端 < 上の端」でないと結果が決まらない（Windows の Edge/Chrome では黒い四角になった）
  float a = 1.0 - smoothstep(0.0, 0.5, r);
  a = a * a * vAlpha;
  gl_FragColor = vec4(uColor * a, a);
}`;

interface Fish {
  /** 回る半径・高さ・速さ・上下の揺れ */
  radius: number;
  height: number;
  speed: number;
  bob: number;
  angle: number;
  phase: number;
  /** 雲の下の出発点と、昇り始めるまでの待ち時間・昇る時間 */
  from: THREE.Vector3;
  delay: number;
  rise: number;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  scale: number;
}

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _target = new THREE.Vector3();

export class SkyFish extends THREE.Group {
  private fish: Fish[] = [];
  private bodies: THREE.InstancedMesh;
  private fins: THREE.InstancedMesh;
  private uniforms = { uTime: { value: 0 }, uGlow: { value: 1 } };
  private glows: THREE.Points;
  private trail: THREE.Points;
  private trailData: Array<{ life: number; vel: THREE.Vector3 }> = [];
  private trailClock = 0;
  private time = 0;
  /** 寄ってきてからの時間（負なら、まだ呼ばれていない） */
  private elapsed = -1;
  /** 群れの広がり（1＝ふつう。小さいほど中心に集まる） */
  spread = 1;
  /** 集まる先（gather で指定。毎フレーム少しずつ近づく） */
  private goal: { center: THREE.Vector3; spread: number } | null = null;

  constructor(
    /** 群れが回る中心（灯晶の位置） */
    readonly center: THREE.Vector3,
    count = 18,
    /** 光の粒の大きさの倍率（小さく縮めた群れ＝水槽の中などで使う） */
    private pointScale = 1,
  ) {
    super();
    this.name = '空魚';
    const palette = ['#ff6a3d', '#ff8a4a', '#f4a63a', '#ff5a6a', '#ffd06a', '#e8584a'].map((c) => new THREE.Color(c));
    const phase = new Float32Array(count);
    const tint = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      phase[i] = Math.random() * Math.PI * 2;
      palette[i % palette.length].toArray(tint, i * 3);
      const ring = i % 3;
      this.fish.push({
        radius: 1.5 + ring * 0.75 + Math.random() * 0.4,
        height: 0.0 + (Math.random() - 0.35) * 2.0,
        speed: (0.55 - ring * 0.1 + Math.random() * 0.12) * (i % 7 === 3 ? -1 : 1),
        bob: 0.15 + Math.random() * 0.25,
        angle: (i / count) * Math.PI * 2 * 3,
        phase: phase[i],
        from: new THREE.Vector3(center.x + (Math.random() - 0.5) * 16, -7 - Math.random() * 4, center.z - 8 - Math.random() * 6),
        delay: Math.random() * 2.6,
        rise: 3 + Math.random() * 1.6,
        pos: new THREE.Vector3(),
        prev: new THREE.Vector3(),
        scale: 0.55 + Math.random() * 0.35,
      });
    }
    const addInstanced = (g: THREE.BufferGeometry) => {
      g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
      g.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
      return g;
    };
    this.bodies = new THREE.InstancedMesh(
      addInstanced(bodyGeometry()),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: bodyVert, fragmentShader: bodyFrag, transparent: true }),
      count,
    );
    this.fins = new THREE.InstancedMesh(
      addInstanced(finsGeometry()),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: finVert,
        fragmentShader: finFrag,
        transparent: true,
        // 奥行きを書かないと、被写界深度で背景と同じくらいぼかされて消えてしまう
        depthWrite: true,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
      count,
    );
    // 群れは広く動くので、画面外判定で消えないようにする
    this.bodies.frustumCulled = this.fins.frustumCulled = false;
    this.add(this.bodies, this.fins);

    const points = (n: number, color: string) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
      g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1));
      const p = new THREE.Points(
        g,
        new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(color) }, uScale: { value: this.pointScale } },
          vertexShader: sparkVert,
          fragmentShader: sparkFrag,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      p.frustumCulled = false;
      this.add(p);
      return p;
    };
    this.glows = points(count, '#ffb070');
    this.trail = points(140, '#fff0c8');
    for (let i = 0; i < 140; i++) this.trailData.push({ life: 0, vel: new THREE.Vector3() });
    this.visible = false;
  }

  /** 台本の `@演出 空魚 <合図>`。寄ってくる：雲の下から昇ってきて、灯晶のまわりを泳ぐ */
  cue(signal: string): void {
    if (signal === '寄ってくる' || signal === 'gather') {
      this.visible = true;
      this.elapsed = 0;
    }
  }

  /** 昇ってくる途中を飛ばして、はじめから回る輪の上で泳がせる（水槽の中の群れなど） */
  swimNow(): void {
    this.visible = true;
    this.elapsed = 100;
  }

  /** 群れの中心を to へ移し、広がりを spread にする（毎フレーム少しずつ近づく） */
  gather(to: THREE.Vector3, spread: number): void {
    this.goal = { center: to.clone(), spread };
  }

  /** 灯晶のまわりを回る位置（t 秒の時点） */
  private orbitAt(f: Fish, t: number, out: THREE.Vector3): THREE.Vector3 {
    const a = f.angle + t * f.speed;
    const r = f.radius * (1 + 0.12 * Math.sin(t * 0.7 + f.phase)) * this.spread;
    const y = (f.height + Math.sin(t * 1.3 + f.phase) * f.bob) * this.spread;
    return out.set(this.center.x + Math.cos(a) * r, this.center.y + y, this.center.z + Math.sin(a) * r * 0.8);
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.time += dt;
    this.elapsed += dt;
    this.uniforms.uTime.value = this.time;
    if (this.goal) {
      const k = 1 - Math.exp(-dt * 1.6);
      this.center.lerp(this.goal.center, k);
      this.spread += (this.goal.spread - this.spread) * k;
    }
    const glowPos = this.glows.geometry.getAttribute('position') as THREE.BufferAttribute;
    const glowSize = this.glows.geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const glowAlpha = this.glows.geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
    this.fish.forEach((f, i) => {
      f.prev.copy(f.pos);
      const t = this.elapsed;
      this.orbitAt(f, t, _target);
      // 昇ってくる途中：雲の下から、ゆるい弧を描いて回る輪へ合流する
      const k = THREE.MathUtils.clamp((t - f.delay) / f.rise, 0, 1);
      if (k < 1) {
        const e = 1 - Math.pow(1 - k, 2);
        // 桟橋の床をくぐらないよう、桟橋の外（奥）で昇りきってから手すりを越えてくる
        const mid = _z.set((f.from.x + _target.x) / 2, _target.y - 1.2, (f.from.z + _target.z) / 2 - 1.5);
        // 2次ベジェ曲線
        f.pos.set(0, 0, 0).addScaledVector(f.from, (1 - e) * (1 - e)).addScaledVector(mid, 2 * e * (1 - e)).addScaledVector(_target, e * e);
      } else f.pos.copy(_target);
      if (f.prev.lengthSq() === 0) f.prev.copy(f.pos).x -= 0.01;
      // 進む向きを前（+x）に。上はおおむね空の上
      _x.subVectors(f.pos, f.prev);
      if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
      _x.normalize();
      _y.copy(_up).addScaledVector(_x, -_x.dot(_up)).normalize();
      _z.crossVectors(_x, _y);
      _m.makeBasis(_x, _y, _z);
      _q.setFromRotationMatrix(_m);
      // 出てくるときは小さく、だんだん大きく
      const grow = THREE.MathUtils.clamp((t - f.delay) / 0.6, 0, 1) * f.scale;
      _s.setScalar(Math.max(0.0001, grow));
      _m.compose(f.pos, _q, _s);
      this.bodies.setMatrixAt(i, _m);
      this.fins.setMatrixAt(i, _m);
      glowPos.setXYZ(i, f.pos.x + _x.x * 0.3 * grow, f.pos.y + _x.y * 0.3 * grow, f.pos.z + _x.z * 0.3 * grow);
      glowSize.setX(i, 1.4 * grow);
      glowAlpha.setX(i, (0.35 + 0.15 * Math.sin(this.time * 3 + f.phase)) * Math.min(1, grow * 2));
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.fins.instanceMatrix.needsUpdate = true;
    glowPos.needsUpdate = glowSize.needsUpdate = glowAlpha.needsUpdate = true;
    this.updateTrail(dt);
  }

  /** 泳いだ跡に残る光の粒 */
  private updateTrail(dt: number): void {
    const pos = this.trail.geometry.getAttribute('position') as THREE.BufferAttribute;
    const size = this.trail.geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const alpha = this.trail.geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
    this.trailClock -= dt;
    while (this.trailClock <= 0) {
      this.trailClock += 0.025;
      const f = this.fish[Math.floor(Math.random() * this.fish.length)];
      if (this.elapsed < f.delay) continue;
      const i = this.trailData.findIndex((d) => d.life <= 0);
      if (i < 0) break;
      const d = this.trailData[i];
      d.life = 1;
      d.vel.set((Math.random() - 0.5) * 0.2, -0.15 - Math.random() * 0.2, (Math.random() - 0.5) * 0.2);
      // 尾のあたりから
      _x.subVectors(f.prev, f.pos).normalize();
      pos.setXYZ(i, f.pos.x + _x.x * 0.45 * f.scale, f.pos.y + _x.y * 0.45 * f.scale, f.pos.z + _x.z * 0.45 * f.scale);
    }
    this.trailData.forEach((d, i) => {
      if (d.life <= 0) {
        alpha.setX(i, 0);
        return;
      }
      d.life -= dt / 1.4;
      pos.setXYZ(i, pos.getX(i) + d.vel.x * dt, pos.getY(i) + d.vel.y * dt, pos.getZ(i) + d.vel.z * dt);
      size.setX(i, 0.18 + 0.2 * d.life);
      alpha.setX(i, Math.max(0, d.life) * (0.6 + 0.4 * Math.sin(d.life * 40)));
    });
    pos.needsUpdate = size.needsUpdate = alpha.needsUpdate = true;
  }
}
