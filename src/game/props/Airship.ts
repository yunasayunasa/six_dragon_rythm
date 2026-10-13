import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Ease, type Tweens } from '../../engine';

/**
 * 竜の飛空艇。青いガラス質の船体に青銅と金の骨組み、金の竜頭の舳先、膜の翼、とげの尾翼、キルトのドームとマスト、
 * その下に吊った木造の帆船。紙の舞台の中に置く「本物の立体」。
 * 前が +x、上が +y。台本の `@演出 飛空艇 到着` で、雲の下から昇ってきて桟橋に横付けする。
 * 動かない部品は材質ごとに1つにまとめて描画回数を減らし、翼・尾翼・旗など動く部品だけ別にする。
 */

// ---------- 絵（テクスチャ） ----------

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** 青いガラス質の船体：上は明るく下は深い青、継ぎ目の線と光の筋。u は胴のまわり（0.75 が真上）、v は長さ */
function envelopeTexture(): THREE.CanvasTexture {
  return canvasTexture(1024, 512, (g) => {
    const grd = g.createLinearGradient(0, 0, 1024, 0);
    // u: 0 横 → 0.25 真下 → 0.5 横 → 0.75 真上 → 1 横
    grd.addColorStop(0, '#2a86cc');
    grd.addColorStop(0.25, '#0b3a78');
    grd.addColorStop(0.5, '#2a86cc');
    grd.addColorStop(0.75, '#8fd6ff');
    grd.addColorStop(1, '#2a86cc');
    g.fillStyle = grd;
    g.fillRect(0, 0, 1024, 512);
    // 縦の継ぎ目（胴のまわりに並ぶ板ガラスの縁）
    for (let i = 0; i < 24; i++) {
      const x = (i / 24) * 1024;
      g.fillStyle = 'rgba(8,40,80,.45)';
      g.fillRect(x, 0, 3, 512);
      g.fillStyle = 'rgba(255,255,255,.25)';
      g.fillRect(x + 3, 0, 2, 512);
    }
    // 横の継ぎ目
    for (let j = 1; j < 10; j++) {
      g.fillStyle = 'rgba(8,40,80,.3)';
      g.fillRect(0, (j / 10) * 512, 1024, 2);
    }
    // 中の光（ガラス越しに見える温かい明かり）
    for (let k = 0; k < 40; k++) {
      const x = Math.random() * 1024;
      const y = 60 + Math.random() * 400;
      const r = 10 + Math.random() * 30;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(255,240,200,.35)');
      rg.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}

/** 鎧の絵：青銅の板に竜の鱗を彫り、鱗の縁が光る */
function armorTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#8a5e3a');
    grd.addColorStop(1, '#5a3822');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    const w = 32;
    const h = 22;
    for (let j = -1; j < 256 / h + 1; j++) {
      for (let i = -1; i < 256 / w + 1; i++) {
        const cx = i * w + (j % 2 ? w / 2 : 0);
        const cy = j * h;
        const rg = g.createRadialGradient(cx, cy + 4, 2, cx, cy + 8, w * 0.7);
        rg.addColorStop(0, 'rgba(255,220,170,.22)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg;
        g.beginPath();
        g.arc(cx, cy, w / 2, 0, Math.PI);
        g.fill();
        g.strokeStyle = 'rgba(30,16,8,.7)';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(cx, cy, w / 2, 0.05, Math.PI - 0.05);
        g.stroke();
        g.strokeStyle = 'rgba(232,190,100,.55)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(cx, cy - 2, w / 2 - 2, 0.25, Math.PI - 0.25);
        g.stroke();
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(7, 3);
  return t;
}

/** キルトの屋根：生成りの布を菱形に縫い、縫い目に金糸 */
function quiltTexture(): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#efe4cc';
    g.fillRect(0, 0, 256, 256);
    const n = 4;
    const s = 256 / n;
    for (let i = -1; i <= n; i++) {
      for (let j = -1; j <= n; j++) {
        // ふくらみ（中心が明るく、縁が影）
        const cx = i * s + s / 2;
        const cy = j * s + s / 2;
        const rg = g.createRadialGradient(cx - 6, cy - 8, 2, cx, cy, s * 0.62);
        rg.addColorStop(0, 'rgba(255,255,250,.9)');
        rg.addColorStop(0.7, 'rgba(225,210,180,.2)');
        rg.addColorStop(1, 'rgba(150,120,80,.55)');
        g.save();
        g.translate(cx, cy);
        g.rotate(Math.PI / 4);
        g.fillStyle = rg;
        g.fillRect(-s * 0.36, -s * 0.36, s * 0.72, s * 0.72);
        g.restore();
      }
    }
    g.strokeStyle = '#b8892e';
    g.lineWidth = 3;
    for (let k = -n; k <= n * 2; k++) {
      g.beginPath();
      g.moveTo(k * s, 0);
      g.lineTo(k * s + 256, 256);
      g.moveTo(k * s, 256);
      g.lineTo(k * s + 256, 0);
      g.stroke();
    }
    // 縫い目の交点の鋲
    g.fillStyle = '#d6a640';
    for (let i = 0; i <= n * 2; i++) for (let j = 0; j <= n * 2; j++) if ((i + j) % 2 === 0) g.fillRect(i * (s / 2) - 3, j * (s / 2) - 3, 6, 6);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 2);
  return t;
}

/** 板張り（継ぎ目と木目） */
function plankTexture(base: string, rows: number): THREE.CanvasTexture {
  const t = canvasTexture(256, 256, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    const rh = 256 / rows;
    for (let r = 0; r < rows; r++) {
      g.fillStyle = `rgba(${r % 2 ? '255,230,200' : '40,20,8'},${0.05 + ((r * 37) % 7) * 0.012})`;
      g.fillRect(0, r * rh, 256, rh);
      g.fillStyle = 'rgba(30,14,6,.6)';
      g.fillRect(0, r * rh, 256, 2);
      const off = ((r * 97) % 5) * 51;
      for (let x = off; x < 256 + 128; x += 128) g.fillRect(x % 256, r * rh, 2, rh);
      g.strokeStyle = 'rgba(30,14,6,.14)';
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        const y = r * rh + (k + 1) * (rh / 4);
        g.moveTo(0, y);
        for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x * 0.05 + r + k) * 1.5);
        g.stroke();
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 船尾楼の窓（明かりの灯った格子窓が並ぶ。窓だけ光るよう、光らせる絵も返す） */
function galleryTextures(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const draw = (lit: boolean) => (g: CanvasRenderingContext2D) => {
    g.fillStyle = lit ? '#000' : '#4a2a18';
    g.fillRect(0, 0, 256, 128);
    if (!lit) {
      g.fillStyle = '#d6a640';
      g.fillRect(0, 8, 256, 6);
      g.fillRect(0, 114, 256, 6);
    }
    for (let i = 0; i < 4; i++) {
      const x = 16 + i * 60;
      g.fillStyle = lit ? '#ffc66a' : '#ffd98a';
      g.beginPath();
      g.moveTo(x, 100);
      g.lineTo(x, 46);
      g.arc(x + 20, 46, 20, Math.PI, 0);
      g.lineTo(x + 40, 100);
      g.fill();
      if (!lit) {
        g.strokeStyle = '#2b1d17';
        g.lineWidth = 3;
        g.stroke();
        g.beginPath();
        g.moveTo(x + 20, 26);
        g.lineTo(x + 20, 100);
        g.moveTo(x, 66);
        g.lineTo(x + 40, 66);
        g.stroke();
      }
    }
  };
  return { map: canvasTexture(256, 128, draw(false)), glow: canvasTexture(256, 128, draw(true)) };
}

/** 膜（翼・尾びれ）：根元から先へ走る筋と、縁に向かって明るくなる半透明の膜 */
function membraneTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#3fb0ec');
    grd.addColorStop(1, '#c8f0ff');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(214,166,64,.55)';
    g.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.moveTo(i * 40 + 10, 0);
      g.bezierCurveTo(i * 40 + 30, 90, i * 40 - 10, 170, i * 40 + 20, 256);
      g.stroke();
    }
  });
}

function glowTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  });
}

function puffTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 64, (g) => {
    for (let i = 0; i < 6; i++) {
      const x = 20 + Math.random() * 24;
      const y = 20 + Math.random() * 24;
      const grd = g.createRadialGradient(x, y, 0, x, y, 18);
      grd.addColorStop(0, 'rgba(255,255,255,.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    }
  });
}

// ---------- 形（ジオメトリ） ----------

/** 先細りの管（角・とげ・翼の骨）。points を通る曲線に沿って、太さ r0 → r1 */
function taper(points: THREE.Vector3[], r0: number, r1: number, radial = 6, segs = 12): THREE.BufferGeometry {
  const path = new THREE.CatmullRomCurve3(points);
  const frames = path.computeFrenetFrames(segs, false);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = path.getPointAt(t);
    const r = r0 + (r1 - r0) * t;
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(p.x + r * (c * N.x + s * B.x), p.y + r * (c * N.y + s * B.y), p.z + r * (c * N.z + s * B.z));
      uv.push(j / radial, t);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 長さ方向（x）に回した回転体。prof(t) は t（0＝後ろ 1＝前）の半径 */
function latheX(len: number, prof: (t: number) => number, n = 40, radial = 32): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector2(Math.max(0.0005, prof(t)), (t - 0.5) * len));
  }
  const g = new THREE.LatheGeometry(pts, radial);
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** 二つの骨の間に張る膜。縁は根元側へえぐれる（コウモリの翼のように） */
function membraneBetween(a: THREE.CatmullRomCurve3, b: THREE.CatmullRomCurve3, scallop = 0.22, us = 8, vs = 10): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  for (let i = 0; i <= us; i++) {
    const s = i / us;
    const k = 1 - scallop * Math.sin(Math.PI * s);
    for (let j = 0; j <= vs; j++) {
      const t = (j / vs) * k;
      a.getPointAt(t, pa);
      b.getPointAt(t, pb);
      pa.lerp(pb, s);
      pos.push(pa.x, pa.y, pa.z);
      uv.push(s, j / vs);
    }
  }
  for (let i = 0; i < us; i++) {
    for (let j = 0; j < vs; j++) {
      const p = i * (vs + 1) + j;
      const q = p + vs + 1;
      idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 船体（舳先は鋭く艫は丸い）。上の縁（甲板の高さ）は y = 舷弧 */
function hullShape(L: number, W: number, D: number) {
  const width = (t: number) => (t > 0 ? Math.pow(Math.max(0, 1 - t * t), 0.5) * (1 - 0.2 * t) : 0.14 + 0.86 * Math.pow(Math.max(0, 1 - Math.pow(-t, 3)), 0.5));
  const depth = (t: number) => (t > 0 ? 0.15 + 0.85 * Math.pow(Math.max(0, 1 - t * t), 0.35) : 0.35 + 0.65 * Math.pow(Math.max(0, 1 - Math.pow(-t, 4)), 0.4));
  const sheer = (t: number) => 0.2 * D * t * t + 0.1 * D * Math.max(0, t);
  return { width: (t: number) => (W / 2) * width(t), depth: (t: number) => D * depth(t), sheer, x: (t: number) => (t * L) / 2 };
}

function hullGeometry(L: number, W: number, D: number, segL = 32, segC = 16): THREE.BufferGeometry {
  const s = hullShape(L, W, D);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segL; i++) {
    const t = (i / segL) * 2 - 1;
    const w = s.width(t);
    const d = s.depth(t);
    const top = s.sheer(t);
    for (let j = 0; j <= segC; j++) {
      const th = (j / segC) * Math.PI;
      const sn = Math.sin(th);
      pos.push(s.x(t), top - d * Math.pow(sn, 0.75), w * Math.cos(th) * (1 - 0.1 * sn));
      uv.push((i / segL) * 3, j / segC);
    }
  }
  for (let i = 0; i < segL; i++) {
    for (let j = 0; j < segC; j++) {
      const a = i * (segC + 1) + j;
      const b = a + segC + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 甲板（船体の上の縁に合わせた板） */
function deckGeometry(L: number, W: number, D: number, segL = 32): THREE.BufferGeometry {
  const s = hullShape(L, W, D);
  const p: number[] = [];
  const u: number[] = [];
  const ix: number[] = [];
  for (let i = 0; i <= segL; i++) {
    const t = (i / segL) * 2 - 1;
    const w = s.width(t) * 0.97;
    p.push(s.x(t), s.sheer(t), w, s.x(t), s.sheer(t), -w);
    u.push((i / segL) * 4, 0, (i / segL) * 4, 1);
    if (i < segL) ix.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
  g.setIndex(ix);
  g.computeVertexNormals();
  return g;
}

/** 輪郭の白フチ（紙の切り抜きと同じ縁取り）：法線方向に少し膨らませた裏面 */
function outlineOf(geo: THREE.BufferGeometry, thickness: number): THREE.Mesh {
  const g = geo.clone();
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * thickness, p.getY(i) + n.getY(i) * thickness, p.getZ(i) + n.getZ(i) * thickness);
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#fff4e2', side: THREE.BackSide }));
}

/** 動かない部品を材質ごとに集めて、最後に1つずつにまとめる */
class Batch {
  private groups = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(geo: THREE.BufferGeometry, mat: THREE.Material, m?: THREE.Matrix4): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    if (m) g.applyMatrix4(m);
    let list = this.groups.get(mat);
    if (!list) this.groups.set(mat, (list = []));
    list.push(g);
  }

  build(parent: THREE.Object3D, castShadow = true): void {
    for (const [mat, list] of this.groups) {
      const mesh = new THREE.Mesh(mergeGeometries(list)!, mat);
      mesh.castShadow = castShadow;
      parent.add(mesh);
    }
    this.groups.clear();
  }
}

const M = (p: [number, number, number], r: [number, number, number] = [0, 0, 0], s: [number, number, number] = [1, 1, 1]) =>
  new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface AirshipOptions {
  /** 金属やガラスの照り返し用の環境マップ */
  envMap?: THREE.Texture | null;
}

export class Airship extends THREE.Group {
  /** 揺れ・傾きをつける本体（Airship 自体は位置と向き） */
  private body = new THREE.Group();
  private wings: Array<{ obj: THREE.Object3D; side: 1 | -1; phase: number; amp: number }> = [];
  private rotor = new THREE.Group();
  private jaw = new THREE.Group();
  private flags: Array<{ mesh: THREE.Mesh; base: Float32Array; phase: number }> = [];
  private blinkers: Array<{ sprite: THREE.Sprite; phase: number }> = [];
  private eyes: THREE.Sprite[] = [];
  private envMat: THREE.MeshPhysicalMaterial;
  private puffs: Array<{ sprite: THREE.Sprite; life: number; vel: THREE.Vector3 }> = [];
  private puffClock = 0;
  private time = 0;
  /** 翼のはばたきと尾翼の回転の強さ（1＝全速） */
  private throttle = 0.4;
  private bank = 0;
  private lastYaw = 0;
  /** 横付けする場所（舞台の座標）。船の甲板がここの高さに来る */
  dock = new THREE.Vector3(6, 0.15, -9.5);

  constructor(
    private tweens: Tweens,
    opts: AirshipOptions = {},
  ) {
    super();
    this.name = '飛空艇';
    this.add(this.body);
    const env = opts.envMap ?? null;

    // ---- 材質 ----
    const envTex = envelopeTexture();
    this.envMat = new THREE.MeshPhysicalMaterial({
      map: envTex,
      emissiveMap: envTex,
      emissive: '#3a8ad0',
      emissiveIntensity: 0.25,
      roughness: 0.16,
      metalness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMap: env,
      envMapIntensity: 0.7,
    });
    // ガラスの縁が光る（見る角度が浅いほど明るい水色）
    this.envMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <opaque_fragment>',
        'outgoingLight += vec3(0.55, 0.88, 1.0) * pow(max(0.0, 1.0 - abs(dot(normal, normalize(vViewPosition)))), 3.0) * 0.75;\n#include <opaque_fragment>',
      );
    };
    const gold = new THREE.MeshStandardMaterial({ color: '#d9a944', metalness: 0.9, roughness: 0.28, envMap: env, envMapIntensity: 1.4, side: THREE.DoubleSide });
    const bronze = new THREE.MeshStandardMaterial({ color: '#6e4a30', metalness: 0.65, roughness: 0.42, envMap: env, envMapIntensity: 1, side: THREE.DoubleSide });
    const armor = new THREE.MeshStandardMaterial({ map: armorTexture(), metalness: 0.6, roughness: 0.42, envMap: env, envMapIntensity: 1, side: THREE.DoubleSide });
    const ivory = new THREE.MeshStandardMaterial({ color: '#fff6e4', emissive: '#6a5a44', emissiveIntensity: 0.6, roughness: 0.4, side: THREE.DoubleSide });
    const quilt = new THREE.MeshStandardMaterial({ map: quiltTexture(), roughness: 0.85, side: THREE.DoubleSide });
    const hullTex = plankTexture('#6a3e24', 9);
    const hullMat = new THREE.MeshStandardMaterial({ map: hullTex, roughness: 0.75, side: THREE.DoubleSide });
    const deckTex = plankTexture('#b07c4c', 7);
    const deckMat = new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.85 });
    const gal = galleryTextures();
    const galleryMat = new THREE.MeshStandardMaterial({ map: gal.map, emissiveMap: gal.glow, emissive: '#ffae4a', emissiveIntensity: 1.1, roughness: 0.7 });
    const membraneMat = new THREE.MeshStandardMaterial({
      map: membraneTexture(),
      emissive: '#3aa8e6',
      emissiveIntensity: 0.35,
      roughness: 0.5,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
      // 奥行きを書かないと、被写界深度で背景と一緒にぼかされてしまう
      depthWrite: true,
    });

    const batch = new Batch();

    // ---- 船体（青いガラス質の胴）：前が太く、後ろへ長く細くなる ----
    const L = 7.6;
    const R = 1.45;
    const cy = 3.5; // 胴の中心の高さ（吊った帆船の甲板が 0）
    const prof = (t: number) => R * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, 1.35))), 0.78) + 0.02;
    const xAt = (t: number) => (t - 0.5) * L;
    const envGeo = latheX(L, prof, 48, 40);
    envGeo.scale(1, 1, 0.92);
    const envelope = new THREE.Mesh(envGeo, this.envMat);
    envelope.position.y = cy;
    envelope.castShadow = true;
    this.body.add(envelope);
    const envOutline = outlineOf(envGeo, 0.035);
    envOutline.position.y = cy;
    this.body.add(envOutline);

    // 青銅の鎧（胴を包む殻）：前の兜・中ほどの鞍・後ろの鎧。真上を中心に覆い、縁は金。すき間から青いガラスがのぞく
    const shell = (t0: number, t1: number, span: number, grow: number) => {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 16; i++) {
        const t = t0 + ((t1 - t0) * i) / 16;
        pts.push(new THREE.Vector2(prof(t) * grow, (t - 0.5) * L));
      }
      const p0 = Math.PI * 1.5 - span / 2;
      const g = new THREE.LatheGeometry(pts, 28, p0, span);
      g.rotateZ(-Math.PI / 2);
      g.scale(1, 1, 0.92);
      batch.add(g, armor, M([0, cy, 0]));
      const at = (t: number, phi: number) => V(xAt(t), cy - prof(t) * grow * 1.01 * Math.sin(phi), prof(t) * grow * 1.01 * Math.cos(phi) * 0.92);
      const edge = (f: (k: number) => THREE.Vector3, segs: number) => batch.add(taper(Array.from({ length: segs + 1 }, (_, k) => f(k / segs)), 0.045, 0.045, 5, segs * 2), gold);
      edge((k) => at(t0, p0 + span * k), 18);
      edge((k) => at(t1, p0 + span * k), 18);
      for (const phi of [p0, p0 + span]) edge((k) => at(t0 + (t1 - t0) * k, phi), 10);
      // 鎧の上の鋲
      for (let i = 1; i < 6; i++) {
        for (const s of [0.25, 0.5, 0.75]) {
          const p = at(t0 + ((t1 - t0) * i) / 6, p0 + span * s);
          batch.add(new THREE.SphereGeometry(0.045, 6, 4), gold, M([p.x, p.y, p.z]));
        }
      }
    };
    shell(0.62, 0.95, Math.PI * 1.3, 1.05);
    shell(0.38, 0.57, Math.PI * 0.85, 1.04);
    shell(0.13, 0.3, Math.PI * 0.7, 1.03);
    // ガラスの上を走る細い骨（後ろ半分）
    for (const off of [0.6, 1.15, 1.7, 2.3, 2.9]) {
      for (const sgn of [1, -1]) {
        const phi = Math.PI * 1.5 + sgn * off;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 14; i++) {
          const t = 0.08 + (i / 14) * 0.56;
          pts.push(V(xAt(t), cy - prof(t) * 1.008 * Math.sin(phi), prof(t) * 1.008 * Math.cos(phi) * 0.92));
        }
        batch.add(taper(pts, 0.028, 0.028, 4, 28), bronze);
      }
    }
    // 背骨と、そこに並ぶとげ（鎧の上）
    const spine: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = 0.12 + (i / 12) * 0.8;
      spine.push(V(xAt(t), cy + prof(t) * 1.06, 0));
    }
    batch.add(taper(spine, 0.09, 0.09, 6, 30), bronze);
    for (let i = 1; i < 12; i++) {
      const t = 0.15 + (i / 12) * 0.72;
      const h = 0.3 + Math.sin((i / 12) * Math.PI) * 0.45;
      const base = V(xAt(t), cy + prof(t) * 1.06, 0);
      batch.add(taper([base, base.clone().add(V(-h * 0.35, h * 0.7, 0)), base.clone().add(V(-h * 1.0, h * 1.05, 0))], 0.1, 0.006, 6, 8), gold);
    }
    // 腹の竜骨
    const keel: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = 0.2 + (i / 10) * 0.6;
      keel.push(V(xAt(t), cy - prof(t) * 0.99, 0));
    }
    batch.add(taper(keel, 0.07, 0.07, 6, 24), bronze);

    // ---- 金の竜頭（舳先） ----
    const hx = xAt(1) - 0.2; // 頭の付け根
    const head = new THREE.Group();
    head.position.set(hx, cy + 0.1, 0);
    head.rotation.z = -0.05;
    head.scale.setScalar(1.3);
    this.body.add(head);
    const hb = new Batch();
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#fff0c0', emissive: '#ffa030', emissiveIntensity: 3 });
    const mouthMat = new THREE.MeshStandardMaterial({ color: '#5a1418', roughness: 0.8, side: THREE.DoubleSide });
    // 口の中（上あごの裏）
    hb.add(new THREE.BoxGeometry(1.2, 0.05, 0.34), mouthMat, M([1.05, -0.16, 0], [0, 0, -0.04]));
    // 首（青銅）と、とげの付いた金の襟
    hb.add(latheX(0.8, (t) => 0.52 - t * 0.1, 4, 24), bronze, M([-0.25, 0, 0]));
    const collar = new THREE.TorusGeometry(0.52, 0.08, 8, 32);
    collar.rotateY(Math.PI / 2);
    hb.add(collar, gold, M([0.12, 0, 0]));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const d = V(0, Math.cos(a), Math.sin(a));
      const p = d.clone().multiplyScalar(0.55).add(V(0.1, 0, 0));
      hb.add(taper([p, p.clone().add(d.clone().multiplyScalar(0.18)).add(V(-0.2, 0, 0)), p.clone().add(d.clone().multiplyScalar(0.3)).add(V(-0.45, 0, 0))], 0.05, 0.004, 5, 6), gold);
    }
    // 頭骨（前へ細く、額が盛り上がる）
    const skull = latheX(1.9, (t) => 0.44 * Math.pow(1 - t, 0.42) + 0.08, 24, 28);
    {
      // 後ろ（頬）ほど横に広く、上は平らに、あごの線はまっすぐに
      const p = skull.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) / 1.9 + 0.5; // 0＝後ろ 1＝鼻先
        const y = p.getY(i);
        p.setZ(i, p.getZ(i) * (1 + 0.5 * Math.pow(1 - u, 2)));
        p.setY(i, (y > 0 ? y * (1.05 - 0.5 * u) : y * 0.55) - 0.1 * Math.pow(u, 3));
      }
      skull.computeVertexNormals();
    }
    hb.add(skull, gold, M([0.95, 0.04, 0]));
    for (const side of [1, -1]) {
      // 頬骨
      hb.add(new THREE.SphereGeometry(1, 14, 10), gold, M([0.3, -0.02, side * 0.42], [0, side * 0.3, 0], [0.42, 0.2, 0.17]));
      // 眉（目の上に張り出す）
      hb.add(taper([V(0.45, 0.3, side * 0.36), V(0.85, 0.3, side * 0.3), V(1.2, 0.2, side * 0.2)], 0.1, 0.03, 6, 10), gold);
      // 鼻孔
      hb.add(new THREE.SphereGeometry(0.06, 8, 6), gold, M([1.72, 0.06, side * 0.09], [0, 0, 0], [1.3, 0.8, 1]));
    }
    for (const side of [1, -1]) {
      // 口の線
      hb.add(taper([V(0.45, -0.1, side * 0.3), V(1.2, -0.14, side * 0.2), V(1.85, -0.07, side * 0.06)], 0.05, 0.02, 5, 10), bronze);
      // 眉から後ろへ伸びる大きな角
      hb.add(taper([V(1.05, 0.3, side * 0.2), V(0.5, 0.46, side * 0.3), V(-0.2, 0.78, side * 0.42), V(-0.9, 1.18, side * 0.5), V(-1.45, 1.28, side * 0.46)], 0.15, 0.01, 7, 18), gold);
      // 頬の角（後ろ外へ）
      hb.add(taper([V(0.45, -0.05, side * 0.36), V(-0.15, 0.0, side * 0.64), V(-0.75, 0.16, side * 0.82)], 0.1, 0.008, 6, 10), gold);
      // たてがみ：短く太いとげ
      for (let k = 0; k < 2; k++) {
        hb.add(taper([V(0.2, 0.12 + k * 0.12, side * 0.3), V(-0.3, 0.32 + k * 0.16, side * (0.55 + k * 0.06)), V(-0.7, 0.52 + k * 0.2, side * (0.62 + k * 0.08))], 0.07, 0.006, 5, 8), gold);
      }
      // 光る目
      hb.add(new THREE.SphereGeometry(0.075, 12, 8), eyeMat, M([0.92, 0.2, side * 0.36], [0, side * 0.35, 0], [1.7, 0.75, 1.1]));
      // 上の牙
      for (let k = 0; k < 6; k++) hb.add(new THREE.ConeGeometry(0.045, 0.2 - k * 0.015, 5), ivory, M([0.75 + k * 0.17, -0.2 - k * 0.012, side * (0.25 - k * 0.03)], [Math.PI, 0, 0]));
    }
    // 頭頂のとさか
    for (let k = 0; k < 4; k++) {
      const base = V(0.85 - k * 0.24, 0.34, 0);
      hb.add(taper([base, base.clone().add(V(-0.15, 0.28 - k * 0.03, 0)), base.clone().add(V(-0.42, 0.42 - k * 0.05, 0))], 0.07, 0.005, 5, 8), gold);
    }
    // 鼻先の角と、鼻すじのとげ
    hb.add(taper([V(1.6, 0.2, 0), V(1.8, 0.42, 0), V(1.86, 0.68, 0)], 0.07, 0.005, 5, 6), gold);
    for (let k = 0; k < 3; k++) {
      const b = V(1.15 + k * 0.15, 0.27 - k * 0.03, 0);
      hb.add(taper([b, b.clone().add(V(-0.05, 0.12, 0)), b.clone().add(V(-0.14, 0.18, 0))], 0.035, 0.003, 4, 4), gold);
    }
    hb.build(head);
    // 下あご（少し開け閉めする）
    this.jaw.position.set(0.3, -0.2, 0);
    head.add(this.jaw);
    const jb = new Batch();
    const jawGeo = latheX(1.35, (t) => 0.3 * Math.pow(1 - t, 0.6) + 0.05, 16, 16);
    {
      const p = jawGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) / 1.35 + 0.5;
        const y = p.getY(i);
        p.setY(i, (y > 0 ? y * 0.35 : y * (0.75 - 0.35 * u)) - 0.04 * u);
        p.setZ(i, p.getZ(i) * (0.85 + 0.3 * (1 - u)));
      }
      jawGeo.computeVertexNormals();
    }
    jb.add(jawGeo, gold, M([0.65, -0.03, 0]));
    // 口の中（暗い赤）
    jb.add(new THREE.BoxGeometry(0.75, 0.05, 0.26), mouthMat, M([0.45, 0.05, 0]));
    for (const side of [1, -1]) {
      for (let k = 0; k < 5; k++) jb.add(new THREE.ConeGeometry(0.04, 0.16 - k * 0.015, 5), ivory, M([0.35 + k * 0.17, 0.08 - k * 0.012, side * (0.2 - k * 0.03)]));
      jb.add(taper([V(0.3, -0.12, side * 0.14), V(-0.1, -0.38, side * 0.26), V(-0.5, -0.52, side * 0.32)], 0.06, 0.004, 5, 6), gold);
    }
    jb.build(this.jaw);
    this.jaw.rotation.z = -0.26;
    // 目の光
    const glow = glowTexture();
    const sprite = (color: string, size: number, pos: THREE.Vector3, parent: THREE.Object3D = this.body) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.position.copy(pos);
      s.scale.setScalar(size);
      parent.add(s);
      return s;
    };
    for (const side of [1, -1]) this.eyes.push(sprite('#ffb347', 0.55, V(0.98, 0.2, side * 0.44), head));

    // ---- キルトのドーム屋根と、旗の付いたマスト ----
    const domeGeo = new THREE.SphereGeometry(1.0, 36, 14, 0, Math.PI * 2, 0, Math.PI * 0.5);
    batch.add(domeGeo, quilt, M([xAt(0.5), cy + prof(0.5) * 0.72, 0], [0, 0, 0], [1.9, 0.95, 1.05]));
    const rim = new THREE.TorusGeometry(1.0, 0.05, 6, 48);
    rim.rotateX(Math.PI / 2);
    batch.add(rim, gold, M([xAt(0.5), cy + prof(0.5) * 0.72, 0], [0, 0, 0], [1.9, 1, 1.05]));
    const flagGeo = () => {
      const g = new THREE.PlaneGeometry(0.75, 0.32, 12, 2);
      g.translate(-0.375, 0, 0);
      // 三角の吹き流し（先がとがる）
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * (1 + p.getX(i) / 0.75));
      return g;
    };
    const flagMat = new THREE.MeshStandardMaterial({
      map: canvasTexture(128, 32, (g) => {
        g.fillStyle = '#fbf6ec';
        g.fillRect(0, 0, 128, 32);
        g.fillStyle = '#d6a640';
        g.fillRect(0, 0, 128, 4);
        g.fillRect(0, 28, 128, 4);
        g.fillStyle = '#3a7bd5';
        g.fillRect(0, 12, 128, 8);
      }),
      side: THREE.DoubleSide,
      roughness: 0.9,
    });
    [[-0.85, 1.4], [0.1, 1.85], [0.95, 1.3]].forEach(([dx, h], i) => {
      const x = xAt(0.5) + dx;
      const y0 = cy + prof(0.5) * 0.72 + 0.5;
      batch.add(new THREE.CylinderGeometry(0.035, 0.05, h, 8), bronze, M([x, y0 + h / 2, 0]));
      batch.add(new THREE.SphereGeometry(0.08, 10, 8), gold, M([x, y0 + h + 0.05, 0]));
      batch.add(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), bronze, M([x, y0 + h * 0.7, 0], [Math.PI / 2, 0, 0]));
      const f = new THREE.Mesh(flagGeo(), flagMat);
      f.position.set(x, y0 + h - 0.15, 0);
      this.body.add(f);
      this.flags.push({ mesh: f, base: Float32Array.from(f.geometry.getAttribute('position').array as ArrayLike<number>), phase: i * 1.7 });
    });

    // ---- 吊った木造の帆船 ----
    const HL = 5.8;
    const HW = 1.8;
    const HD = 1.0;
    const hs = hullShape(HL, HW, HD);
    const hullGeo = hullGeometry(HL, HW, HD);
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.castShadow = true;
    this.body.add(hull, outlineOf(hullGeo, 0.035));
    batch.add(deckGeometry(HL, HW, HD), deckMat);
    // 金の帯（舷側の上縁）と、青銅の喫水の帯
    for (const side of [1, -1]) {
      const top: THREE.Vector3[] = [];
      const mid: THREE.Vector3[] = [];
      for (let i = 0; i <= 20; i++) {
        const t = (i / 20) * 1.9 - 0.95;
        top.push(V(hs.x(t), hs.sheer(t) + 0.02, hs.width(t) * side));
        mid.push(V(hs.x(t), hs.sheer(t) - hs.depth(t) * 0.38, hs.width(t) * side * 0.98));
      }
      batch.add(taper(top, 0.045, 0.045, 5, 40), gold);
      batch.add(taper(mid, 0.03, 0.03, 5, 40), gold);
      // 手すり
      const rail = top.map((p) => p.clone().add(V(0, 0.28, -side * 0.02)));
      batch.add(taper(rail, 0.025, 0.025, 4, 40), bronze);
      for (let i = 1; i < 20; i += 2) batch.add(new THREE.CylinderGeometry(0.018, 0.018, 0.28, 5), bronze, M([top[i].x, top[i].y + 0.14, top[i].z * 0.98]));
    }
    // 船尾楼（窓が光る）と船首楼
    const sternX = hs.x(-0.72);
    const sternY = hs.sheer(-0.72);
    const stern = new THREE.BoxGeometry(1.5, 0.85, 1.55);
    // 箱の6面のうち、横と後ろに窓の絵を貼る（上下は板の色だけ）
    batch.add(stern, galleryMat, M([sternX, sternY + 0.42, 0]));
    batch.add(new THREE.BoxGeometry(1.62, 0.08, 1.68), gold, M([sternX, sternY + 0.88, 0]));
    batch.add(new THREE.BoxGeometry(1.4, 0.4, 1.4), bronze, M([sternX - 0.05, sternY + 1.12, 0], [0, 0, 0], [1, 0.6, 1]));
    batch.add(new THREE.BoxGeometry(0.9, 0.45, 1.1), hullMat, M([hs.x(0.7), hs.sheer(0.7) + 0.2, 0]));
    // 船首の突き出し棒と、その先の金の飾り
    const bowTip = V(hs.x(1) + 0.1, hs.sheer(1) + 0.15, 0);
    batch.add(taper([bowTip, bowTip.clone().add(V(0.9, 0.35, 0)), bowTip.clone().add(V(1.7, 0.75, 0))], 0.07, 0.025, 6, 8), bronze);
    batch.add(taper([bowTip.clone().add(V(-0.1, -0.3, 0)), bowTip.clone().add(V(0.35, -0.1, 0)), bowTip.clone().add(V(0.6, 0.25, 0))], 0.09, 0.01, 6, 8), gold);
    // 胴と帆船をつなぐ柱（青銅）
    for (const [t, lean] of [[-0.55, 0.15], [0.05, 0], [0.55, -0.15]] as const) {
      for (const side of [1, -1]) {
        const x = hs.x(t);
        const top = V(x + lean, cy - R * 0.85, side * 0.45);
        const bottom = V(x, hs.sheer(t) + 0.05, side * hs.width(t) * 0.8);
        batch.add(taper([bottom, bottom.clone().lerp(top, 0.5).add(V(0, 0, side * 0.05)), top], 0.07, 0.06, 6, 6), bronze);
      }
    }
    // 船尾の提灯と航海灯
    sprite('#ffcf80', 1.0, V(sternX - 0.8, sternY + 0.6, 0.8));
    sprite('#ffcf80', 1.0, V(sternX - 0.8, sternY + 0.6, -0.8));
    sprite('#ffb060', 1.2, bowTip.clone().add(V(1.7, 0.75, 0)));

    // ---- 翼（大きな翼と、前の下の小さな翼。左右） ----
    const makeWing = (scale: number, root: THREE.Vector3, side: 1 | -1, phase: number, amp: number) => {
      const w = new THREE.Group();
      w.position.copy(root);
      w.scale.set(scale, scale, scale * side);
      // 骨：根元から後ろ下へ流れる5本
      const bones = [
        [V(0, 0, 0), V(0.5, 0.2, 0.9), V(0.2, -0.9, 2.0), V(-0.6, -2.6, 2.5)],
        [V(0, 0, 0), V(0.1, -0.2, 0.9), V(-0.7, -1.4, 1.8), V(-1.8, -3.0, 2.1)],
        [V(0, 0, 0), V(-0.3, -0.3, 0.85), V(-1.5, -1.5, 1.5), V(-2.9, -2.8, 1.7)],
        [V(0, 0, 0), V(-0.6, -0.25, 0.75), V(-2.2, -1.2, 1.2), V(-3.8, -2.0, 1.3)],
        [V(0, 0, 0), V(-0.8, -0.1, 0.6), V(-2.6, -0.6, 0.9), V(-4.3, -0.9, 0.95)],
      ];
      const curves = bones.map((b) => new THREE.CatmullRomCurve3(b));
      const wb = new Batch();
      bones.forEach((b, i) => {
        wb.add(taper(b, i === 0 ? 0.11 : 0.07, 0.012, 6, 16), gold);
        // 骨の先の爪
        const tip = b[3];
        const dir = tip.clone().sub(b[2]).normalize();
        wb.add(taper([tip, tip.clone().addScaledVector(dir, 0.35).add(V(0, -0.05, 0)), tip.clone().addScaledVector(dir, 0.6).add(V(0.1, -0.2, 0))], 0.035, 0.002, 5, 5), gold);
      });
      // 根元の関節
      wb.add(new THREE.SphereGeometry(0.2, 12, 10), bronze);
      wb.build(w);
      for (let i = 0; i < curves.length - 1; i++) {
        const m = new THREE.Mesh(membraneBetween(curves[i], curves[i + 1], 0.24), membraneMat);
        w.add(m);
      }
      this.body.add(w);
      this.wings.push({ obj: w, side, phase, amp });
      return w;
    };
    for (const side of [1, -1] as const) {
      makeWing(1, V(xAt(0.6), cy - 0.25, side * prof(0.6) * 0.8), side, 0, 1);
      makeWing(0.55, V(xAt(0.78), cy - 0.75, side * prof(0.78) * 0.7), side, 0.8, 0.7);
      // 航海灯（翼の付け根。左舷が赤、右舷が緑）
      this.blinkers.push({ sprite: sprite(side > 0 ? '#ff4a3a' : '#5aff9a', 0.6, V(xAt(0.6) + 0.2, cy - 0.2, side * (prof(0.6) * 0.8 + 0.25))), phase: side > 0 ? 0 : Math.PI });
    }

    // ---- 尾：とげの付いた回る尾翼と、扇の尾びれ ----
    const tailX = xAt(0) - 0.05;
    this.rotor.position.set(tailX, cy, 0);
    this.body.add(this.rotor);
    const rb = new Batch();
    rb.add(new THREE.ConeGeometry(0.22, 0.6, 12), bronze, M([-0.2, 0, 0], [0, 0, Math.PI / 2]));
    const ring = new THREE.TorusGeometry(0.75, 0.04, 6, 40);
    ring.rotateY(Math.PI / 2);
    rb.add(ring, gold, M([-0.15, 0, 0]));
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const dir = V(0, Math.cos(a), Math.sin(a));
      rb.add(taper([dir.clone().multiplyScalar(0.15), dir.clone().multiplyScalar(0.75).add(V(-0.25, 0, 0)), dir.clone().multiplyScalar(1.3).add(V(-0.6, 0, 0))], 0.05, 0.004, 5, 6), gold);
    }
    rb.build(this.rotor);
    // 羽根（半透明の膜）
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.32), membraneMat);
      blade.position.set(-0.25, Math.cos(a) * 0.45, Math.sin(a) * 0.45);
      blade.rotation.set(a, 0.6, 0);
      this.rotor.add(blade);
    }
    // 尾びれ（上と左右）
    const tailFin = (rot: THREE.Euler) => {
      const g = new THREE.Group();
      g.position.set(xAt(0.1), cy, 0);
      g.rotation.copy(rot);
      const ribs = [0, 1, 2, 3, 4].map((k) => {
        const a = 0.15 + k * 0.32;
        return new THREE.CatmullRomCurve3([V(0, 0.15, 0), V(-Math.sin(a) * 0.9, Math.cos(a) * 0.9 + 0.15, 0), V(-Math.sin(a) * 1.7, Math.cos(a) * 1.6 + 0.15, 0)]);
      });
      const fb = new Batch();
      ribs.forEach((c) => fb.add(taper(c.points, 0.04, 0.004, 5, 8), gold));
      fb.build(g);
      for (let i = 0; i < ribs.length - 1; i++) g.add(new THREE.Mesh(membraneBetween(ribs[i], ribs[i + 1], 0.18, 5, 6), membraneMat));
      this.body.add(g);
    };
    tailFin(new THREE.Euler(0, 0, 0));
    tailFin(new THREE.Euler(Math.PI / 2 + 0.3, 0, 0));
    tailFin(new THREE.Euler(-Math.PI / 2 - 0.3, 0, 0));

    batch.build(this.body);

    // ---- 雲の尾（尾翼の後ろ。船の外＝舞台に置く） ----
    const puffMat = new THREE.SpriteMaterial({ map: puffTexture(), color: '#ffe9dc', transparent: true, depthWrite: false, opacity: 0 });
    for (let i = 0; i < 20; i++) {
      const s = new THREE.Sprite(puffMat.clone());
      s.visible = false;
      this.puffs.push({ sprite: s, life: 0, vel: new THREE.Vector3() });
    }
    this.visible = false;
  }

  /** 雲の尾を舞台に置く（船と一緒に動かないように、船の外に出す） */
  attachTrail(parent: THREE.Object3D): void {
    for (const p of this.puffs) parent.add(p.sprite);
  }

  /** 台本の `@演出 飛空艇 <合図>`。到着：雲の下から昇ってきて、dock の位置に横付けする */
  cue(signal: string): Promise<void> | void {
    if (signal === '到着' || signal === 'arrive') return this.arrive();
  }

  private arrive(): Promise<void> {
    const d = this.dock;
    // 雲の海の下・左奥から現れ、大きく弧を描いて、桟橋と平行（舳先が +x）に止まる
    const path = new THREE.CatmullRomCurve3([
      V(-34, -14, -44),
      V(-20, -5, -37),
      V(-8, 1.5, -28),
      V(-1, 2.5, -18),
      V(d.x - 5, d.y + 1.2, d.z - 2),
      V(d.x - 1.3, d.y + 0.25, d.z - 0.2),
      d.clone(),
    ]);
    this.visible = true;
    const p = new THREE.Vector3();
    const tan = new THREE.Vector3();
    const place = (u: number) => {
      path.getPointAt(u, p);
      path.getTangentAt(Math.min(u, 0.999), tan);
      this.position.copy(p);
      const yaw = Math.atan2(-tan.z, tan.x) * (1 - Ease.inOutSine(Math.max(0, (u - 0.85) / 0.15)));
      this.rotation.y = yaw;
      // 曲がるときは内側へ傾く
      this.bank += (THREE.MathUtils.clamp((yaw - this.lastYaw) * 60, -0.35, 0.35) - this.bank) * 0.08;
      this.lastYaw = yaw;
    };
    place(0);
    return this.tweens.run(
      11,
      (k) => {
        place(k);
        // 着く間際は、はばたきと尾翼をゆるめる
        this.throttle = 1 - 0.75 * Ease.inOutSine(Math.max(0, (k - 0.7) / 0.3));
      },
      (k) => 1 - Math.pow(1 - k, 2.2),
      this,
    );
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.time += dt;
    const t = this.time;
    // ふわふわ浮く・ゆっくり揺れる
    this.body.position.y = Math.sin(t * 0.8) * 0.09;
    this.body.rotation.x = Math.sin(t * 0.6) * 0.025 + this.bank;
    this.body.rotation.z = Math.sin(t * 0.5 + 1) * 0.02;
    this.bank *= 0.98;
    // はばたき：打ち下ろしは速く、戻しはゆっくり
    for (const w of this.wings) {
      const s = Math.sin(t * (1.1 + this.throttle * 0.8) + w.phase);
      const beat = (s > 0 ? s : s * 0.6) * (0.08 + this.throttle * 0.14) * w.amp;
      w.obj.rotation.x = w.side * beat;
      w.obj.rotation.y = Math.sin(t * 0.7 + w.phase) * 0.04;
    }
    this.rotor.rotation.x += dt * (1.5 + this.throttle * 7);
    // あごを少し開け閉めし、目が脈打つ
    this.jaw.rotation.z = -0.24 - Math.max(0, Math.sin(t * 0.9)) * 0.12;
    const eye = 0.38 + Math.pow(Math.max(0, Math.sin(t * 1.7)), 6) * 0.25;
    for (const e of this.eyes) e.scale.setScalar(eye);
    for (const b of this.blinkers) b.sprite.material.opacity = 0.3 + 0.7 * Math.pow(Math.max(0, Math.sin(t * 2.4 + b.phase)), 6);
    this.envMat.emissiveIntensity = 0.25 + Math.sin(t * 1.3) * 0.04;
    // 旗：根元は動かず、先へいくほど波打つ
    for (const f of this.flags) {
      const pos = f.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const bx = f.base[i * 3];
        const k = -bx / 0.75;
        pos.setZ(i, Math.sin(t * 6 + bx * 6 + f.phase) * 0.1 * k);
      }
      pos.needsUpdate = true;
    }
    this.updatePuffs(dt);
  }

  private updatePuffs(dt: number): void {
    this.puffClock -= dt;
    if (this.puffClock <= 0 && this.throttle > 0.35) {
      this.puffClock = 0.14;
      const p = this.puffs.find((x) => x.life <= 0);
      if (p) {
        const local = new THREE.Vector3(-4.6 - Math.random() * 0.4, 3.5 + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2);
        p.sprite.position.copy(this.body.localToWorld(local));
        p.sprite.parent?.worldToLocal(p.sprite.position);
        p.vel.set(-0.7, 0.12, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation.y);
        p.life = 1;
        p.sprite.visible = true;
      }
    }
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt / 2.4;
      p.sprite.position.addScaledVector(p.vel, dt);
      const age = 1 - p.life;
      p.sprite.scale.setScalar(0.6 + age * 2.2);
      p.sprite.material.opacity = Math.min(1, age * 6) * Math.max(0, p.life) * 0.7;
      if (p.life <= 0) p.sprite.visible = false;
    }
  }
}
