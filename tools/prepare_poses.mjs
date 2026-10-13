/**
 * 追加の立ち絵（攻撃・被弾・ガレヲンの追加ポーズなど）をエンジン用に変換する開発用ツール。
 * tools/prepare_assets.py の立ち絵処理と同じ結果になるようにしている（Python が無い環境向け）。
 *
 * 使い方:
 *   npm i --no-save sharp
 *   node tools/prepare_poses.mjs <展開済み追加素材フォルダ> public/assets
 *
 * - 1200×1200 の全身PNGを、透明余白の切り詰め → 72%縮小 → 紙の白フチ焼き込み → webp
 * - 口パーツ（layout.json がある場合）も同じ倍率で縮小して位置を記録
 * - public/assets/cast/manifest.json に追記（既存のポーズはそのまま）
 * 元ファイルは変更しない。
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { EDGE_PX, bbox, paperEdge } from './paper_edge.mjs';
import sharp from 'sharp';

const [SRC, OUT] = process.argv.slice(2);
if (!SRC || !OUT) {
  console.error('使い方: node tools/prepare_poses.mjs <追加素材フォルダ> public/assets');
  process.exit(1);
}
const SCALE = 0.72;
const MARGIN = Math.floor(EDGE_PX / SCALE) + 6;

/** 1ポーズ分を変換して manifest の1項目を返す */
async function convert(pngPath, poseId, layout, groundY) {
  const img = sharp(pngPath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const [bl, bt, br, bb] = bbox(data, info.width, info.height);
  const footSrc = groundY ?? bb;
  const l = Math.max(0, bl - MARGIN);
  const t = Math.max(0, bt - MARGIN);
  const r = Math.min(info.width, br + MARGIN);
  const b = Math.min(info.height, bb + MARGIN);
  const w = Math.round((r - l) * SCALE);
  const h = Math.round((b - t) * SCALE);
  const small = await sharp(pngPath).ensureAlpha().extract({ left: l, top: t, width: r - l, height: b - t }).resize(w, h, { kernel: 'lanczos3' }).raw().toBuffer();
  const framed = await paperEdge(small, w, h);
  const dir = join(OUT, 'cast', poseId);
  mkdirSync(dir, { recursive: true });
  await sharp(framed, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 88, effort: 6 }).toFile(join(dir, 'base.webp'));
  const parts = {};
  for (const [key, part] of Object.entries(layout?.parts ?? {})) {
    const src = join(dirname(pngPath), part.file);
    const meta = await sharp(src).metadata();
    const pw = Math.max(1, Math.round(meta.width * SCALE));
    const ph = Math.max(1, Math.round(meta.height * SCALE));
    await sharp(src).ensureAlpha().resize(pw, ph, { kernel: 'lanczos3' }).webp({ quality: 92, effort: 6 }).toFile(join(dir, `${key}.webp`));
    parts[key] = { file: `${key}.webp`, x: Math.round((part.x - l) * SCALE), y: Math.round((part.y - t) * SCALE), w: pw, h: ph };
  }
  return { width: w, height: h, cx: Math.round((info.width / 2 - l) * SCALE), foot: Math.round((footSrc - t) * SCALE), parts };
}

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const manifestPath = join(OUT, 'cast', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
const motion = existsSync(join(SRC, 'motion_layout.json')) ? JSON.parse(readFileSync(join(SRC, 'motion_layout.json'), 'utf-8')).frames : {};
let count = 0;
for (const file of walk(SRC).filter((f) => f.endsWith('.png'))) {
  const dir = dirname(file);
  const name = basename(file, '.png');
  // 確認用の画像は変換しない
  if (/preview|comparison/.test(name)) continue;
  if (/^mouth_|^eye_/.test(name)) continue;
  let poseId = name;
  let layout = null;
  if (name === 'base' && existsSync(join(dir, 'layout.json'))) {
    poseId = basename(dir);
    layout = JSON.parse(readFileSync(join(dir, 'layout.json'), 'utf-8'));
  }
  manifest[poseId] = await convert(file, poseId, layout, motion[poseId]?.ground_y);
  console.log('pose', poseId);
  count++;
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1), 'utf-8');
console.log('poses', count);
