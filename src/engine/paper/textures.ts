import * as THREE from 'three';

/** 実行時にCanvasで作る小さな共通テクスチャ（接地影・光の粒・調べるマーク）。 */
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

let blob: THREE.Texture | null = null;
export function blobShadowTexture(): THREE.Texture {
  if (blob) return blob;
  const [c, g] = canvas(128, 64);
  const grd = g.createRadialGradient(64, 32, 2, 64, 32, 62);
  grd.addColorStop(0, 'rgba(40,20,30,0.62)');
  grd.addColorStop(0.55, 'rgba(40,20,30,0.28)');
  grd.addColorStop(1, 'rgba(40,20,30,0)');
  g.fillStyle = grd;
  g.save();
  g.scale(1, 0.5);
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.restore();
  g.fillRect(0, 0, 128, 64);
  blob = new THREE.CanvasTexture(c);
  blob.colorSpace = THREE.SRGBColorSpace;
  return blob;
}

let glow: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glow) return glow;
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,240,210,0.75)');
  grd.addColorStop(1, 'rgba(255,220,160,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(c);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}

/** 和紙の札に朱色の「！」や「…」を描いたマーク */
export function tagTexture(symbol: string, ink = '#b8322a'): THREE.Texture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.arc(66, 68, 50, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fbf5e6';
  g.strokeStyle = '#fffdf6';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(64, 64, 48, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // 霧や白い壁の前でも見分けられるよう、外側に濃い縁
  g.strokeStyle = '#2b1d17';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(64, 64, 54, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = ink;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(64, 64, 40, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = ink;
  g.font = 'bold 60px "Yuji Syuku", "Hiragino Mincho ProN", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(symbol, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
