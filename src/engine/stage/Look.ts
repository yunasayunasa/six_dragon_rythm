import * as THREE from 'three';

/**
 * 「見た目プリセット」。空・光・霧・色調を1セットにしたもの。
 * 同じ舞台でも Look を切り替えるだけで、夕景・対決・夜などの雰囲気に変えられる。
 * 新しいジャンル（墨絵など）はここに Look を足していく。
 */
export interface Look {
  skyTop: string;
  skyHorizon: string;
  /** 背景画像に掛ける色 */
  backdropTint: string;
  sunGlow: string;
  sunColor: string;
  sunIntensity: number;
  /** 太陽の方向（光が来る向き） */
  sunDir: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  tint: string;
  shadowTint: string;
  saturation: number;
  contrast: number;
  exposure: number;
  vignette: number;
  drama: number;
  farBlur: number;
  nearBlur: number;
  /** 光のにじみ 0..1 */
  bloom: number;
  /** 太陽側からの光漏れ 0..1（色は sunGlow） */
  leak: number;
}

export const LOOKS: Record<string, Look> = {
  /** 夕暮れの空港。暖色の光と紫の影 */
  sunset: {
    skyTop: '#4b4f8f',
    skyHorizon: '#ffb27a',
    backdropTint: '#ffd9bd',
    sunGlow: '#ffc27a',
    sunColor: '#ffe3c6',
    sunIntensity: 2.6,
    sunDir: [-0.55, 0.62, 0.56],
    hemiSky: '#c9c0ff',
    hemiGround: '#7a5a48',
    hemiIntensity: 1.25,
    fogColor: '#f0b99e',
    fogNear: 22,
    fogFar: 95,
    tint: '#fff7ef',
    shadowTint: '#5b3b8c',
    saturation: 1.05,
    contrast: 1.04,
    exposure: 1.04,
    vignette: 0.3,
    drama: 0,
    farBlur: 0.6,
    nearBlur: 0.75,
    bloom: 0.55,
    leak: 0.32,
  },
  /** 対決。周りが暗く落ち、証人にスポットが当たる */
  confront: {
    skyTop: '#16163a',
    skyHorizon: '#5a3a7e',
    backdropTint: '#8f86c4',
    sunGlow: '#c0708c',
    sunColor: '#ffd8c4',
    sunIntensity: 1.9,
    sunDir: [0.3, 0.7, 0.6],
    hemiSky: '#7d78c8',
    hemiGround: '#3a2a3a',
    hemiIntensity: 0.9,
    fogColor: '#3c2f5c',
    fogNear: 12,
    fogFar: 55,
    tint: '#f1ecff',
    shadowTint: '#2b1d63',
    saturation: 1.02,
    contrast: 1.1,
    exposure: 1.0,
    vignette: 0.45,
    drama: 0.55,
    farBlur: 1,
    nearBlur: 0.8,
    bloom: 0.35,
    leak: 0.08,
  },
  /** 昼の市場（第二話）。青空と白い光 */
  day: {
    skyTop: '#4f8fd8',
    skyHorizon: '#d4ebff',
    backdropTint: '#ffffff',
    sunGlow: '#fff2c8',
    sunColor: '#fff6e6',
    sunIntensity: 2.7,
    sunDir: [-0.4, 0.8, 0.45],
    hemiSky: '#d8ecff',
    hemiGround: '#8a7458',
    hemiIntensity: 1.3,
    fogColor: '#d2e4f2',
    fogNear: 24,
    fogFar: 100,
    tint: '#ffffff',
    shadowTint: '#4a5a8c',
    saturation: 1.05,
    contrast: 1.03,
    exposure: 1.04,
    vignette: 0.22,
    drama: 0,
    farBlur: 0.35,
    nearBlur: 0.7,
    bloom: 0.4,
    leak: 0.08,
  },
  /** 静かな朝（悲しい場面）。白っぽく、色を抑える */
  morning: {
    skyTop: '#7d93b8',
    skyHorizon: '#e6dccb',
    backdropTint: '#e4e2de',
    sunGlow: '#f4e2c0',
    sunColor: '#f2ead8',
    sunIntensity: 1.7,
    sunDir: [0.5, 0.45, 0.6],
    hemiSky: '#c6d0e4',
    hemiGround: '#5a5048',
    hemiIntensity: 1.05,
    fogColor: '#c9ccd2',
    fogNear: 14,
    fogFar: 70,
    tint: '#f4f6fa',
    shadowTint: '#3a4060',
    saturation: 0.8,
    contrast: 1.02,
    exposure: 1.0,
    vignette: 0.4,
    drama: 0,
    farBlur: 0.8,
    nearBlur: 0.7,
    bloom: 0.35,
    leak: 0.1,
  },
  /** 霧の朝（第三話）。白くかすみ、色を少し抑える。遠くほど霧に溶ける */
  fog: {
    skyTop: '#9aa9ba',
    skyHorizon: '#e9edf0',
    backdropTint: '#d6dde5',
    sunGlow: '#f1e9d8',
    sunColor: '#eef1f4',
    sunIntensity: 1.55,
    sunDir: [0.3, 0.72, 0.55],
    hemiSky: '#e1e8ef',
    hemiGround: '#5c5852',
    hemiIntensity: 1.3,
    fogColor: '#dfe4e9',
    fogNear: 9,
    fogFar: 46,
    tint: '#f5f8fb',
    shadowTint: '#4a5468',
    saturation: 0.84,
    contrast: 1.0,
    exposure: 1.04,
    vignette: 0.3,
    drama: 0,
    farBlur: 0.9,
    nearBlur: 0.7,
    bloom: 0.45,
    leak: 0.05,
  },
  /** 嵐の夜明け前（第四話の甲板）。青黒い空、冷たい光、雨 */
  storm: {
    skyTop: '#1c2433',
    skyHorizon: '#56657a',
    backdropTint: '#7f8ea3',
    sunGlow: '#9fb4d0',
    sunColor: '#c8d4e6',
    sunIntensity: 1.35,
    sunDir: [0.4, 0.75, 0.5],
    hemiSky: '#8a9ab8',
    hemiGround: '#2c2a30',
    hemiIntensity: 1.05,
    fogColor: '#4a5668',
    fogNear: 10,
    fogFar: 50,
    tint: '#e6edf6',
    shadowTint: '#1e2846',
    saturation: 0.8,
    contrast: 1.08,
    exposure: 1.0,
    vignette: 0.45,
    drama: 0.2,
    farBlur: 0.9,
    nearBlur: 0.7,
    bloom: 0.4,
    leak: 0.04,
  },
  /** 船の中や夜の屋内。ランプの暖かい光と暗い影 */
  lantern: {
    skyTop: '#1e1a24',
    skyHorizon: '#4a3a34',
    backdropTint: '#9a8270',
    sunGlow: '#ffb46a',
    sunColor: '#ffd8a8',
    sunIntensity: 1.7,
    sunDir: [-0.4, 0.7, 0.55],
    hemiSky: '#b89a86',
    hemiGround: '#2e2220',
    hemiIntensity: 1.0,
    fogColor: '#3a2e2a',
    fogNear: 12,
    fogFar: 55,
    tint: '#fff2e2',
    shadowTint: '#2a1c30',
    saturation: 0.95,
    contrast: 1.06,
    exposure: 1.02,
    vignette: 0.42,
    drama: 0.1,
    farBlur: 0.85,
    nearBlur: 0.7,
    bloom: 0.6,
    leak: 0.12,
  },
  /** 灯りの消えた星祭りの夜（第五話）。青い闇、星明かり */
  night: {
    skyTop: '#0b1026',
    skyHorizon: '#2a3460',
    backdropTint: '#5a6a9a',
    sunGlow: '#8aa0e0',
    sunColor: '#b8c6f0',
    sunIntensity: 1.25,
    sunDir: [0.3, 0.8, 0.5],
    hemiSky: '#7080c0',
    hemiGround: '#1a1824',
    hemiIntensity: 0.95,
    fogColor: '#1c2240',
    fogNear: 14,
    fogFar: 60,
    tint: '#e4e8ff',
    shadowTint: '#141a48',
    saturation: 0.85,
    contrast: 1.06,
    exposure: 1.0,
    vignette: 0.45,
    drama: 0.1,
    farBlur: 0.85,
    nearBlur: 0.7,
    bloom: 0.75,
    leak: 0.06,
  },
  /** 夜明け（第五話の結末）。紫から金へ移る空 */
  dawn: {
    skyTop: '#3a4a8a',
    skyHorizon: '#ffc48a',
    backdropTint: '#ffd8c0',
    sunGlow: '#ffd08a',
    sunColor: '#ffe6c8',
    sunIntensity: 2.3,
    sunDir: [0.6, 0.35, 0.6],
    hemiSky: '#c8c0ff',
    hemiGround: '#6a5048',
    hemiIntensity: 1.2,
    fogColor: '#e8b8a8',
    fogNear: 20,
    fogFar: 90,
    tint: '#fff6ee',
    shadowTint: '#4a3a8c',
    saturation: 1.05,
    contrast: 1.04,
    exposure: 1.05,
    vignette: 0.3,
    drama: 0,
    farBlur: 0.6,
    nearBlur: 0.75,
    bloom: 0.65,
    leak: 0.3,
  },
  /** 解決後。灯りがともった宵の口 */
  dusk: {
    skyTop: '#2b3470',
    skyHorizon: '#f08f7a',
    backdropTint: '#d9a8b8',
    sunGlow: '#ffc38a',
    sunColor: '#ffc9a5',
    sunIntensity: 1.6,
    sunDir: [-0.5, 0.55, 0.62],
    hemiSky: '#8c86ff',
    hemiGround: '#4a2c32',
    hemiIntensity: 0.95,
    fogColor: '#a8779a',
    fogNear: 16,
    fogFar: 70,
    tint: '#fff0ea',
    shadowTint: '#3e3294',
    saturation: 1.1,
    contrast: 1.05,
    exposure: 1.02,
    vignette: 0.35,
    drama: 0,
    farBlur: 0.85,
    nearBlur: 0.7,
    bloom: 0.75,
    leak: 0.2,
  },
};

/** Look同士を補間するための数値化 */
export interface LookState {
  colors: Record<string, THREE.Color>;
  nums: Record<string, number>;
  sunDir: THREE.Vector3;
}

const COLOR_KEYS = ['skyTop', 'skyHorizon', 'backdropTint', 'sunGlow', 'sunColor', 'hemiSky', 'hemiGround', 'fogColor', 'tint', 'shadowTint'] as const;
const NUM_KEYS = ['sunIntensity', 'hemiIntensity', 'fogNear', 'fogFar', 'saturation', 'contrast', 'exposure', 'vignette', 'drama', 'farBlur', 'nearBlur', 'bloom', 'leak'] as const;

export function lookState(look: Look): LookState {
  const colors: Record<string, THREE.Color> = {};
  for (const k of COLOR_KEYS) colors[k] = new THREE.Color(look[k]);
  const nums: Record<string, number> = {};
  for (const k of NUM_KEYS) nums[k] = look[k];
  return { colors, nums, sunDir: new THREE.Vector3(...look.sunDir).normalize() };
}

export function lerpLook(out: LookState, a: LookState, b: LookState, t: number): void {
  for (const k of COLOR_KEYS) out.colors[k].copy(a.colors[k]).lerp(b.colors[k], t);
  for (const k of NUM_KEYS) out.nums[k] = a.nums[k] + (b.nums[k] - a.nums[k]) * t;
  out.sunDir.copy(a.sunDir).lerp(b.sunDir, t).normalize();
}

export function cloneState(s: LookState): LookState {
  const colors: Record<string, THREE.Color> = {};
  for (const [k, v] of Object.entries(s.colors)) colors[k] = v.clone();
  return { colors, nums: { ...s.nums }, sunDir: s.sunDir.clone() };
}
