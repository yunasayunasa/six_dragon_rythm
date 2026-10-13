import * as THREE from 'three';
import type { QualityProfile } from './quality';

/**
 * 紙の舞台らしい画作りのための後処理。
 * 1) シーンを深度付きで描く  2) 縮小バッファで2回ぼかす
 * 3) 深度から被写界深度を合成し、光のにじみ・光漏れ・色ずれ・色調・周辺減光・紙の粒子感をかける
 * 重いポスト処理（SSAO/SSR/ブルーム多段）は使わない。スマホでの負荷を抑える設計。
 */
export interface GradeParams {
  /** 焦点までのカメラ距離(m) */
  focusDistance: number;
  /** 焦点の前後でくっきり見える幅(m) */
  focusRange: number;
  /** 奥のぼけの強さ 0..1 */
  farBlur: number;
  /** 手前のぼけの強さ 0..1 */
  nearBlur: number;
  tint: THREE.Color;
  shadowTint: THREE.Color;
  saturation: number;
  contrast: number;
  exposure: number;
  vignette: number;
  vignetteColor: THREE.Color;
  /** 対決演出などで画面中央以外を暗く落とす量 */
  drama: number;
  grain: number;
  /** 明るい所から光がにじむ量（被写界深度のぼかしを流用するので追加の描画は無い） */
  bloom: number;
  bloomThreshold: number;
  /** 太陽側から差し込む光漏れ */
  leak: number;
  leakColor: THREE.Color;
  /** 画面端の色ずれ（レンズ感） */
  aberration: number;
}

export function defaultGrade(): GradeParams {
  return {
    focusDistance: 8,
    focusRange: 2.2,
    farBlur: 0.8,
    nearBlur: 0.6,
    tint: new THREE.Color(1, 1, 1),
    shadowTint: new THREE.Color(0, 0, 0),
    saturation: 1,
    contrast: 1,
    exposure: 1,
    vignette: 0.25,
    vignetteColor: new THREE.Color(0.1, 0.05, 0.08),
    drama: 0,
    grain: 0.035,
    bloom: 0.5,
    bloomThreshold: 0.68,
    leak: 0.3,
    leakColor: new THREE.Color(1, 0.8, 0.55),
    aberration: 1,
  };
}

const quadVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const blurFrag = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tInput, vUv) * 0.227027;
  c += texture2D(tInput, vUv + uDir * 1.3846153846) * 0.3162162162;
  c += texture2D(tInput, vUv - uDir * 1.3846153846) * 0.3162162162;
  c += texture2D(tInput, vUv + uDir * 3.2307692308) * 0.0702702703;
  c += texture2D(tInput, vUv - uDir * 3.2307692308) * 0.0702702703;
  gl_FragColor = c;
}
`;

const compositeFrag = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tBlur;
uniform sampler2D tDepth;
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uRange;
uniform float uFarBlur;
uniform float uNearBlur;
uniform float uDof;
uniform vec3 uTint;
uniform vec3 uShadowTint;
uniform float uSat;
uniform float uContrast;
uniform float uExposure;
uniform float uVignette;
uniform vec3 uVignetteColor;
uniform float uDrama;
uniform float uGrain;
uniform float uTime;
uniform vec2 uResolution;
uniform float uBloom;
uniform float uBloomThr;
uniform float uLeak;
uniform vec3 uLeakColor;
uniform vec2 uLeakPos;
uniform float uAberration;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec4 sharp = texture2D(tColor, vUv);
  vec3 col = sharp.rgb;
  // 画面端ほど赤と青をわずかにずらす（中央はそのまま）
  vec2 ca = (vUv - 0.5) * dot(vUv - 0.5, vUv - 0.5) * 0.012 * uAberration;
  col.r = texture2D(tColor, vUv - ca).r;
  col.b = texture2D(tColor, vUv + ca).b;
  if (uDof > 0.5) {
    float d = texture2D(tDepth, vUv).x;
    float viewZ = -perspectiveDepthToViewZ(d, uNear, uFar);
    float diff = viewZ - uFocus;
    float coc = diff > 0.0
      ? smoothstep(uRange, uRange * 3.2 + 4.0, diff) * uFarBlur
      : smoothstep(uRange * 0.6, uRange * 1.6 + 0.6, -diff) * uNearBlur;
    vec3 blurred = texture2D(tBlur, vUv).rgb;
    col = mix(col, blurred, clamp(coc, 0.0, 1.0));
    // 光のにじみ：ぼかした画像の明るい部分だけを足す
    vec3 glow = max(blurred - uBloomThr, 0.0);
    col += glow * glow * 2.5 * uBloom + glow * 0.6 * uBloom;
  }
  // 光漏れ：太陽のある側の上から、やわらかい光が差し込む
  vec2 lp = (vUv - uLeakPos) * vec2(uResolution.x / uResolution.y, 1.0);
  col += uLeakColor * uLeak * pow(max(0.0, 1.0 - length(lp) * 0.75), 2.2);
  col *= uExposure;
  // 色調: 明部に色味、暗部に別の色味を足す（夕景の暖色＋影の紫など）
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col += uShadowTint * (1.0 - smoothstep(0.0, 0.55, luma)) * 0.25;
  col *= uTint;
  col = mix(vec3(luma), col, uSat);
  col = (col - 0.5) * uContrast + 0.5;
  // 周辺減光と演出用の暗転
  vec2 p = vUv - 0.5;
  p.x *= uResolution.x / uResolution.y;
  float r = length(p);
  float v = smoothstep(0.35, 1.05, r) * uVignette;
  col = mix(col, uVignetteColor, v);
  float dr = smoothstep(0.18, 0.75, r) * uDrama;
  col = mix(col, col * vec3(0.18, 0.16, 0.26), dr);
  // 紙の粒子感
  float g = hash(vUv * uResolution + fract(uTime) * 91.7) - 0.5;
  col += g * uGrain;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class PostFX {
  readonly grade = defaultGrade();
  private sceneRT: THREE.WebGLRenderTarget;
  private blurA: THREE.WebGLRenderTarget;
  private blurB: THREE.WebGLRenderTarget;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private blurMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private size = new THREE.Vector2();
  private time = 0;

  constructor(private renderer: THREE.WebGLRenderer, private quality: QualityProfile) {
    const opts: THREE.RenderTargetOptions = { type: THREE.HalfFloatType, depthBuffer: true };
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, {
      ...opts,
      samples: quality.msaa,
      depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType),
    });
    this.blurA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.blurB = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tInput: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: quadVert,
      fragmentShader: blurFrag,
      depthTest: false,
      depthWrite: false,
    });
    const g = this.grade;
    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.sceneRT.texture },
        tBlur: { value: this.blurB.texture },
        tDepth: { value: this.sceneRT.depthTexture },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
        uFocus: { value: g.focusDistance },
        uRange: { value: g.focusRange },
        uFarBlur: { value: g.farBlur },
        uNearBlur: { value: g.nearBlur },
        uDof: { value: quality.dof ? 1 : 0 },
        uTint: { value: g.tint },
        uShadowTint: { value: g.shadowTint },
        uSat: { value: g.saturation },
        uContrast: { value: g.contrast },
        uExposure: { value: g.exposure },
        uVignette: { value: g.vignette },
        uVignetteColor: { value: g.vignetteColor },
        uDrama: { value: g.drama },
        uGrain: { value: g.grain },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uBloom: { value: g.bloom },
        uBloomThr: { value: g.bloomThreshold },
        uLeak: { value: g.leak },
        uLeakColor: { value: g.leakColor },
        uLeakPos: { value: new THREE.Vector2(0.05, 1.05) },
        uAberration: { value: g.aberration },
      },
      vertexShader: quadVert,
      fragmentShader: compositeFrag,
      depthTest: false,
      depthWrite: false,
      toneMapped: true,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  setSize(width: number, height: number, dpr: number): void {
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    this.size.set(w, h);
    this.sceneRT.setSize(w, h);
    const ds = this.quality.blurDownscale;
    this.blurA.setSize(Math.max(1, Math.round(w / ds)), Math.max(1, Math.round(h / ds)));
    this.blurB.setSize(Math.max(1, Math.round(w / ds)), Math.max(1, Math.round(h / ds)));
    (this.compMat.uniforms.uResolution.value as THREE.Vector2).set(w, h);
  }

  /** シェーダーの準備と、画像・形のGPUへの転送を先に済ませる（画面には出さない） */
  async prewarm(scene: THREE.Scene, camera: THREE.PerspectiveCamera): Promise<void> {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    try {
      await r.compileAsync(scene, camera);
      r.setRenderTarget(this.sceneRT); // 待っている間に変わっていても描き先を戻す
      r.render(scene, camera);
    } finally {
      r.setRenderTarget(null);
    }
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, dt: number): void {
    const r = this.renderer;
    this.time += dt;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);

    const u = this.compMat.uniforms;
    if (this.quality.dof) {
      const bw = this.blurA.width;
      const bh = this.blurA.height;
      // 2回ぼかし（2回目は間隔を広げて大きめのぼけにする）
      this.blurPass(this.sceneRT.texture, this.blurA, 1 / bw, 0);
      this.blurPass(this.blurA.texture, this.blurB, 0, 1 / bh);
      this.blurPass(this.blurB.texture, this.blurA, 2.2 / bw, 0);
      this.blurPass(this.blurA.texture, this.blurB, 0, 2.2 / bh);
    }
    const g = this.grade;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uFocus.value = g.focusDistance;
    u.uRange.value = g.focusRange;
    u.uFarBlur.value = g.farBlur;
    u.uNearBlur.value = g.nearBlur;
    u.uSat.value = g.saturation;
    u.uContrast.value = g.contrast;
    u.uExposure.value = g.exposure;
    u.uVignette.value = g.vignette;
    u.uDrama.value = g.drama;
    u.uGrain.value = g.grain;
    u.uBloom.value = g.bloom;
    u.uBloomThr.value = g.bloomThreshold;
    u.uLeak.value = g.leak;
    u.uAberration.value = g.aberration;
    u.uTime.value = this.time;
    this.quad.material = this.compMat;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }

  private blurPass(src: THREE.Texture, dst: THREE.WebGLRenderTarget, dx: number, dy: number): void {
    this.blurMat.uniforms.tInput.value = src;
    (this.blurMat.uniforms.uDir.value as THREE.Vector2).set(dx, dy);
    this.quad.material = this.blurMat;
    this.renderer.setRenderTarget(dst);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  dispose(): void {
    this.sceneRT.dispose();
    this.blurA.dispose();
    this.blurB.dispose();
    this.blurMat.dispose();
    this.compMat.dispose();
  }
}
