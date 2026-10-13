import * as THREE from 'three';
import { Crystal } from '../../engine/stage/Crystal';
import { SkyFish } from './SkyFish';

/** 水槽の大きさ（m） */
const W = 1.6;
const H = 0.95;
const D = 0.7;
const STAND = 0.55;
/** 中の群れを縮める倍率（奥行きは水槽が薄いので少し強めに縮める） */
const FISH_SCALE = new THREE.Vector3(0.24, 0.24, 0.16);
/** ふだんの群れの広がり（魚を大きく見せる分、輪を小さくして水槽に収める） */
const HOME_SPREAD = 0.6;

/**
 * 雲市場の空魚の水槽（第二話）。ガラスの箱の中を、第一話の空魚を小さくした群れが泳ぐ。
 * 台本の `@演出 水槽 <合図>`:
 * - 近づける … 灯晶（まだ光らない）をガラスの前に差し出す
 * - 寄ってくる … 差し出した灯晶が光り、空魚がその前へ集まる（本物の光にだけ寄る）
 * - 光の方へ … 灯晶は出さず、水槽の右側（市場灯の方）へ集まる
 * - 戻す … 灯晶を下げ、群れを元に戻す
 */
export class FishTank extends THREE.Group {
  private fish: SkyFish;
  private crystal: Crystal;
  private light: THREE.PointLight;
  private home = new THREE.Vector3();

  constructor(envMap: THREE.Texture | null) {
    super();
    this.name = '水槽';
    const wood = new THREE.MeshLambertMaterial({ color: '#6b4027' });
    const frame = new THREE.MeshLambertMaterial({ color: '#3f2a1c' });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, cast = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = cast;
      m.receiveShadow = true;
      this.add(m);
      return m;
    };
    // 台
    add(new THREE.BoxGeometry(W + 0.1, STAND, D + 0.1), wood, 0, STAND / 2, 0);
    // 水（ほんのり青い）とガラス。透ける物も奥行きを書かないと被写界深度で消えるので、水だけ書き込む
    const water = add(
      new THREE.BoxGeometry(W - 0.04, H * 0.86, D - 0.04),
      new THREE.MeshLambertMaterial({ color: '#5fb6d8', transparent: true, opacity: 0.1, depthWrite: false }),
      0,
      STAND + (H * 0.86) / 2,
      0,
      false,
    );
    water.renderOrder = 4;
    const glass = add(
      new THREE.BoxGeometry(W, H, D),
      new THREE.MeshLambertMaterial({ color: '#dff4ff', emissive: '#203040', transparent: true, opacity: 0.07, depthWrite: false }),
      0,
      STAND + H / 2,
      0,
      false,
    );
    glass.renderOrder = 5;
    // ガラスの枠（四隅の柱と上下の縁）
    const post = new THREE.BoxGeometry(0.05, H, 0.05);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(post, frame, (sx * W) / 2, STAND + H / 2, (sz * D) / 2);
    const rimX = new THREE.BoxGeometry(W + 0.05, 0.05, 0.05);
    const rimZ = new THREE.BoxGeometry(0.05, 0.05, D + 0.05);
    for (const y of [STAND, STAND + H]) {
      for (const sz of [-1, 1]) add(rimX, frame, 0, y, (sz * D) / 2, false);
      for (const sx of [-1, 1]) add(rimZ, frame, (sx * W) / 2, y, 0, false);
    }
    // 中の空魚（はじめから泳いでいる）
    const school = new THREE.Group();
    school.position.set(0, STAND + H * 0.45, 0);
    school.scale.copy(FISH_SCALE);
    this.fish = new SkyFish(new THREE.Vector3(), 14, FISH_SCALE.x);
    this.fish.swimNow();
    this.fish.spread = HOME_SPREAD;
    school.add(this.fish);
    this.add(school);
    // ガラスの前に差し出す灯晶（合図まで隠す）
    this.crystal = new Crystal({ height: 0.24, envMap, sparkles: 6 });
    this.crystal.position.set(0, STAND + H * 0.42, D / 2 + 0.22);
    this.crystal.visible = false;
    this.add(this.crystal);
    this.light = new THREE.PointLight('#ffd49a', 0, 3, 1.6);
    this.light.position.set(0, STAND + H * 0.6, D / 2 + 0.4);
    this.add(this.light);
  }

  /** 群れの座標（縮めた入れ物の中）での、水槽の位置 */
  private toSchool(x: number, y: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(x / FISH_SCALE.x, (y - H * 0.45) / FISH_SCALE.y, z / FISH_SCALE.z);
  }

  cue(signal: string): void {
    if (signal === '近づける') {
      this.crystal.visible = true;
      this.light.intensity = 0;
    } else if (signal === '寄ってくる') {
      this.crystal.visible = true;
      this.crystal.ignite();
      this.light.intensity = 3;
      // ガラスの前寄り・灯晶の高さへ、ぎゅっと集まる
      this.fish.gather(this.toSchool(0, H * 0.42, D / 2 - 0.12), 0.25);
    } else if (signal === '光の方へ') {
      this.fish.gather(this.toSchool(W / 2 - 0.35, H * 0.5, 0), 0.3);
    } else if (signal === '戻す') {
      this.crystal.visible = false;
      this.light.intensity = 0;
      this.fish.gather(this.home, HOME_SPREAD);
    }
  }

  update(dt: number): void {
    this.fish.update(dt);
    if (this.crystal.visible) this.crystal.update(dt);
  }
}
