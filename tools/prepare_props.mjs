/**
 * 小物・証拠品・背景などの1枚絵をエンジン用に変換する開発用ツール。
 *
 * 使い方:
 *   npm i --no-save sharp
 *   node tools/prepare_props.mjs <元PNG> <出力.webp|.png> [--max 768] [--plain] [--despeckle] [--no-edge] [--saturation 1] [--brightness 1]
 *
 * - 既定（小物）: 背景がマゼンタ #FF00FF の絵は透明に抜く → 透明余白の切り詰め → 長辺 --max へ縮小 → 紙の白フチ焼き込み
 * - --despeckle: 本体から離れた小さなゴミ点（いちばん大きな塊の1%未満）を消す
 * - --no-edge: 白フチを付けない（床に寝かせる足跡など）
 * - --plain（背景・床・アイコンなど）: 長辺 --max へ縮小するだけ。--saturation / --brightness で彩度・明るさを変えられる
 * 元ファイルは変更しない。
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import sharp from 'sharp';
import { EDGE_PX, bbox, paperEdge } from './paper_edge.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : def);
const [SRC, OUT] = args.filter((a, i) => !a.startsWith('--') && !/^--(max|saturation|brightness)$/.test(args[i - 1] ?? ''));
if (!SRC || !OUT) {
  console.error('使い方: node tools/prepare_props.mjs <元PNG> <出力.webp|.png> [--max 768] [--plain]');
  process.exit(1);
}
const MAX = opt('--max', 768);

function encode(img) {
  return OUT.endsWith('.png') ? img.png({ compressionLevel: 9 }) : img.webp({ quality: 88, effort: 6 });
}

/** 背景がマゼンタなら透明に抜く（縁の混ざった色からもマゼンタを取り除く） */
function keyMagenta(rgba, w, h) {
  let opaque = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 250) opaque++;
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, (h * w - 1) * 4];
  const isMagenta = (i) => rgba[i] > 200 && rgba[i + 1] < 70 && rgba[i + 2] > 200;
  if (opaque < w * h * 0.99 || !corners.every(isMagenta)) return; // 透明の絵はそのまま
  for (let i = 0; i < rgba.length; i += 4) {
    const [r, g, b] = [rgba[i], rgba[i + 1], rgba[i + 2]];
    const spill = Math.min(r, b) - g; // マゼンタらしさ
    if (spill <= 40) continue;
    const a = Math.max(0, Math.min(1, (200 - spill) / 120));
    rgba[i + 3] = Math.round(a * 255);
    rgba[i] = Math.min(r, g + 40);
    rgba[i + 2] = Math.min(b, g + 40);
  }
}

/** 不透明な塊のうち、いちばん大きな塊の1%未満のものを透明にする */
function despeckle(rgba, w, h) {
  const seen = new Uint8Array(w * h);
  const blobs = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || rgba[s * 4 + 3] <= 8) continue;
    const blob = [s];
    seen[s] = 1;
    for (let k = 0; k < blob.length; k++) {
      const p = blob[k];
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h || seen[q] || rgba[q * 4 + 3] <= 8) continue;
        seen[q] = 1;
        blob.push(q);
      }
    }
    blobs.push(blob);
  }
  const min = Math.max(...blobs.map((b) => b.length)) * 0.01;
  for (const blob of blobs) if (blob.length < min) for (const p of blob) rgba[p * 4 + 3] = 0;
}

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
mkdirSync(dirname(OUT), { recursive: true });
if (flag('--plain')) {
  const img = sharp(SRC).resize(MAX, MAX, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' });
  await encode(img.modulate({ saturation: opt('--saturation', 1), brightness: opt('--brightness', 1) })).toFile(OUT);
} else {
  keyMagenta(data, info.width, info.height);
  if (flag('--despeckle')) despeckle(data, info.width, info.height);
  const [l, t, r, b] = bbox(data, info.width, info.height);
  const raw = { raw: { width: info.width, height: info.height, channels: 4 } };
  const scale = Math.min(1, (MAX - EDGE_PX * 2 - 8) / Math.max(r - l, b - t));
  const m = Math.ceil((EDGE_PX + 4) / scale);
  const box = { left: Math.max(0, l - m), top: Math.max(0, t - m) };
  box.width = Math.min(info.width, r + m) - box.left;
  box.height = Math.min(info.height, b + m) - box.top;
  const w = Math.round(box.width * scale);
  const h = Math.round(box.height * scale);
  const small = await sharp(data, raw).extract(box).resize(w, h, { kernel: 'lanczos3' }).raw().toBuffer();
  const framed = flag('--no-edge') ? small : await paperEdge(small, w, h);
  await encode(sharp(framed, { raw: { width: w, height: h, channels: 4 } })).toFile(OUT);
}
console.log('prop', OUT);
