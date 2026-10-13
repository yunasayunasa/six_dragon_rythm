import * as THREE from 'three';
import { glowTexture } from '../paper/textures';

/** 空中に漂う光の粒（夕日の埃・灯りの粒）。CPUで少数だけ動かす軽量版。 */
export class Motes extends THREE.Points {
  private vel: Float32Array;
  private phase: Float32Array;

  constructor(count: number, private box: THREE.Box3, color = '#ffe2b0', size = 0.09) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const size3 = box.getSize(new THREE.Vector3());
    for (let i = 0; i < count; i++) {
      pos[i * 3] = box.min.x + Math.random() * size3.x;
      pos[i * 3 + 1] = box.min.y + Math.random() * size3.y;
      pos[i * 3 + 2] = box.min.z + Math.random() * size3.z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    super(
      geo,
      new THREE.PointsMaterial({
        map: glowTexture(),
        color,
        size,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    this.vel = new Float32Array(count);
    this.phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.vel[i] = 0.05 + Math.random() * 0.12;
      this.phase[i] = Math.random() * 10;
    }
    this.frustumCulled = false;
  }

  update(dt: number, wind: number): void {
    const p = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = p.array as Float32Array;
    const b = this.box;
    for (let i = 0; i < this.vel.length; i++) {
      this.phase[i] += dt;
      a[i * 3] += (0.08 + wind * 0.25) * dt + Math.sin(this.phase[i] * 0.7) * 0.004;
      a[i * 3 + 1] += this.vel[i] * dt * 0.4 + Math.cos(this.phase[i]) * 0.003;
      if (a[i * 3] > b.max.x) a[i * 3] = b.min.x;
      if (a[i * 3 + 1] > b.max.y) a[i * 3 + 1] = b.min.y;
    }
    p.needsUpdate = true;
  }
}

/** 一瞬だけ弾ける紙吹雪・きらめき */
export class Burst extends THREE.Points {
  private v: Float32Array;
  private life = 0;
  private duration = 1.4;

  constructor(count = 60, color = '#fff3c4', size = 0.12) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    super(
      geo,
      new THREE.PointsMaterial({ map: glowTexture(), color, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.v = new Float32Array(count * 3);
    this.visible = false;
    this.frustumCulled = false;
  }

  fire(at: THREE.Vector3, spread = 1.6): void {
    const p = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = p.array as Float32Array;
    for (let i = 0; i < this.v.length / 3; i++) {
      a[i * 3] = at.x;
      a[i * 3 + 1] = at.y;
      a[i * 3 + 2] = at.z;
      const th = Math.random() * Math.PI * 2;
      const up = 0.6 + Math.random() * 1.6;
      const r = Math.random() * spread;
      this.v[i * 3] = Math.cos(th) * r;
      this.v[i * 3 + 1] = up;
      this.v[i * 3 + 2] = Math.sin(th) * r * 0.5;
    }
    p.needsUpdate = true;
    this.life = 0;
    this.visible = true;
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.life += dt;
    const p = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = p.array as Float32Array;
    for (let i = 0; i < this.v.length / 3; i++) {
      this.v[i * 3 + 1] -= 1.6 * dt;
      a[i * 3] += this.v[i * 3] * dt;
      a[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      a[i * 3 + 2] += this.v[i * 3 + 2] * dt;
    }
    p.needsUpdate = true;
    (this.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - this.life / this.duration);
    if (this.life > this.duration) this.visible = false;
  }
}

export interface SprayOptions {
  count?: number;
  color?: THREE.ColorRepresentation;
  /** 横への広がり（速さ） */
  spread?: number;
  /** 上向きの初速 */
  up?: number;
  gravity?: number;
  size?: number;
  /** 寿命（秒） */
  life?: number;
  /** 加算で光らせる（火花など）。false なら普通に重ねる（土ぼこり・墨） */
  glow?: boolean;
}

const sprayVert = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / -mv.z);
  vAlpha = aAlpha;
  vColor = aColor;
  gl_Position = projectionMatrix * mv;
}`;

const sprayFrag = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.15, 0.5, r)) * vAlpha;
  if (a < 0.08) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}`;

/**
 * しぶき：土ぼこり・水しぶき・墨しぶき・火花など、飛び散って落ちる粒。
 * 決まった数の粒を使い回す（光るもの用と、普通に重ねるもの用の2組）。
 */
export class Spray extends THREE.Group {
  private sets: Array<{ points: THREE.Points; vel: Float32Array; life: Float32Array; max: Float32Array; size0: Float32Array; gravity: Float32Array; next: number }>;

  constructor(count = 160) {
    super();
    this.sets = [false, true].map((glow) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(count), 1));
      g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(count), 1));
      g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      const points = new THREE.Points(
        g,
        new THREE.ShaderMaterial({
          vertexShader: sprayVert,
          fragmentShader: sprayFrag,
          transparent: true,
          // 奥行きを書かないと、被写界深度で背景と一緒にぼかされてしまう（薄い所は捨てるので四角くは残らない）
          depthWrite: true,
          blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
        }),
      );
      points.frustumCulled = false;
      this.add(points);
      return { points, vel: new Float32Array(count * 3), life: new Float32Array(count), max: new Float32Array(count), size0: new Float32Array(count), gravity: new Float32Array(count), next: 0 };
    });
  }

  emit(at: THREE.Vector3, o: SprayOptions = {}): void {
    const s = this.sets[o.glow ? 1 : 0];
    const g = s.points.geometry;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const col = g.getAttribute('aColor') as THREE.BufferAttribute;
    const c = new THREE.Color(o.color ?? '#ffffff');
    const n = s.life.length;
    for (let k = 0; k < (o.count ?? 12); k++) {
      const i = s.next;
      s.next = (s.next + 1) % n;
      const th = Math.random() * Math.PI * 2;
      const r = (o.spread ?? 0.8) * (0.3 + Math.random() * 0.7);
      pos.setXYZ(i, at.x, at.y, at.z);
      s.vel[i * 3] = Math.cos(th) * r;
      s.vel[i * 3 + 1] = (o.up ?? 1.2) * (0.5 + Math.random() * 0.7);
      s.vel[i * 3 + 2] = Math.sin(th) * r * 0.6;
      s.max[i] = s.life[i] = (o.life ?? 0.6) * (0.7 + Math.random() * 0.6);
      s.size0[i] = (o.size ?? 0.08) * (0.6 + Math.random() * 0.8);
      s.gravity[i] = o.gravity ?? 4;
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  update(dt: number): void {
    for (const s of this.sets) {
      const g = s.points.geometry;
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      const size = g.getAttribute('aSize') as THREE.BufferAttribute;
      const alpha = g.getAttribute('aAlpha') as THREE.BufferAttribute;
      let any = false;
      for (let i = 0; i < s.life.length; i++) {
        if (s.life[i] <= 0) {
          if (alpha.getX(i) !== 0) alpha.setX(i, 0);
          continue;
        }
        any = true;
        s.life[i] -= dt;
        s.vel[i * 3 + 1] -= s.gravity[i] * dt;
        pos.setXYZ(i, pos.getX(i) + s.vel[i * 3] * dt, Math.max(0.01, pos.getY(i) + s.vel[i * 3 + 1] * dt), pos.getZ(i) + s.vel[i * 3 + 2] * dt);
        const k = Math.max(0, s.life[i] / s.max[i]);
        size.setX(i, s.size0[i] * (0.5 + 0.5 * k));
        alpha.setX(i, Math.min(1, k * 2.5));
      }
      pos.needsUpdate = size.needsUpdate = alpha.needsUpdate = true;
      s.points.visible = any;
    }
  }
}

/** 紙吹雪：和紙の色の小さな紙片が、ひらひら回りながら舞い落ちる */
export class Confetti extends THREE.InstancedMesh {
  private parts: Array<{ pos: THREE.Vector3; vel: THREE.Vector3; spin: THREE.Vector3; rot: THREE.Euler; phase: number; life: number }> = [];
  private next = 0;
  private static readonly COLORS = ['#b8322a', '#c89b3c', '#3b4fa0', '#f7efdc', '#2f7f7a', '#e88a6a'];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();

  constructor(count = 120) {
    super(new THREE.PlaneGeometry(0.07, 0.1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: true }), count);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.setColorAt(i, c.set(Confetti.COLORS[i % Confetti.COLORS.length]));
      this.parts.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Vector3(), rot: new THREE.Euler(), phase: 0, life: 0 });
      this.setMatrixAt(i, this.m.makeScale(0, 0, 0));
    }
    this.frustumCulled = false;
    this.visible = false;
  }

  /** at の上で弾けて、ひらひら落ちる */
  fire(at: THREE.Vector3, count = 60, spread = 1.4): void {
    for (let k = 0; k < count; k++) {
      const p = this.parts[this.next];
      this.next = (this.next + 1) % this.parts.length;
      const th = Math.random() * Math.PI * 2;
      p.pos.copy(at);
      p.vel.set(Math.cos(th) * spread * Math.random(), 2.2 + Math.random() * 1.8, Math.sin(th) * spread * 0.6 * Math.random());
      p.spin.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4);
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.phase = Math.random() * 6;
      p.life = 3.2 + Math.random() * 1.2;
    }
    this.visible = true;
  }

  update(dt: number): void {
    if (!this.visible) return;
    let any = false;
    this.parts.forEach((p, i) => {
      if (p.life <= 0) return;
      any = true;
      p.life -= dt;
      p.phase += dt;
      // はじめは勢いよく、そのあと空気に止められて、左右に揺れながらゆっくり落ちる
      p.vel.y = Math.max(-0.55, p.vel.y - 5 * dt);
      p.vel.x *= 1 - 1.6 * dt;
      p.vel.z *= 1 - 1.6 * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.pos.x += Math.sin(p.phase * 3) * 0.25 * dt;
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
      const fade = Math.min(1, p.life / 0.6);
      this.q.setFromEuler(p.rot);
      this.m.compose(p.pos, this.q, this.s.setScalar(p.pos.y > 0.02 ? fade : 0));
      this.setMatrixAt(i, this.m);
    });
    this.instanceMatrix.needsUpdate = true;
    this.visible = any;
  }
}
