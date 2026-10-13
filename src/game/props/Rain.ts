import * as THREE from 'three';

/**
 * 嵐の雨（第四話の甲板）。斜めに降る細い雨の線と、ときどき光る稲妻。
 * 雨の線は奥行きを書く（書かないと被写界深度で背景と一緒にぼかされて消える）。
 * 台本の `@演出 雨 稲妻` で稲妻を1回光らせる。`やむ` で雨を止める。
 */
export class Rain extends THREE.LineSegments {
  private speed: Float32Array;
  private flash = 0;
  private nextFlash = 4;
  private on = 1;
  private light: THREE.HemisphereLight;

  constructor(private half: number, count = 700) {
    const pos = new Float32Array(count * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    super(geo, new THREE.LineBasicMaterial({ color: '#c8d6ea', transparent: true, opacity: 0.55, fog: false }));
    this.name = '雨';
    this.speed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.speed[i] = 9 + Math.random() * 5;
      this.reset(i, Math.random() * 7);
    }
    this.frustumCulled = false;
    // 稲妻の白い光（ふだんは消えている）
    this.light = new THREE.HemisphereLight('#e8f0ff', '#404860', 0);
    this.add(this.light);
  }

  /** i 本目の雨を、高さ y から降らせ直す */
  private reset(i: number, y: number): void {
    const a = (this.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const x = (Math.random() * 2 - 1) * this.half;
    const z = -6 + Math.random() * 10;
    const len = 0.35 + Math.random() * 0.25;
    a.set([x, y, z, x - len * 0.25, y - len, z], i * 6);
  }

  cue(signal: string): void {
    if (signal === '稲妻') this.flash = 1;
    if (signal === 'やむ') this.on = 0;
  }

  update(dt: number): void {
    const attr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = attr.array as Float32Array;
    for (let i = 0; i < this.speed.length; i++) {
      const dy = this.speed[i] * dt;
      a[i * 6 + 1] -= dy;
      a[i * 6 + 4] -= dy;
      a[i * 6] -= dy * 0.25;
      a[i * 6 + 3] -= dy * 0.25;
      if (a[i * 6 + 4] < 0) this.reset(i, 6 + Math.random() * 1.5);
    }
    attr.needsUpdate = true;
    (this.material as THREE.LineBasicMaterial).opacity = 0.55 * this.on;
    this.visible = this.on > 0;
    // ときどき稲妻
    this.nextFlash -= dt;
    if (this.on && this.nextFlash <= 0) {
      this.flash = 1;
      this.nextFlash = 5 + Math.random() * 7;
    }
    this.flash = Math.max(0, this.flash - dt * 3);
    this.light.intensity = this.flash > 0.5 || (this.flash > 0.15 && this.flash < 0.3) ? 2.4 * this.flash : 0;
  }
}
