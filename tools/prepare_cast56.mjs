/**
 * 56キャラの立ち絵（総合アセット「56キャラ立ち絵・モーション」）をエンジン用に変換する開発用ツール。
 * 第二話以降の脇役に使う。
 *
 * 使い方:
 *   npm i --no-save sharp
 *   node tools/prepare_cast56.mjs <character_XX の入ったフォルダ> public/assets 47:siero 44:toma …
 *   自動で切り出した目・口の四角がずれるときは、元の絵の座標で指定できる: 41:cagliostro:eye=590,312,790,400:mouth=670,404,740,452
 *
 * 1キャラ＝フォルダ1つ（base.png と9差分。すべて同じ大きさ・同じ立ち位置の全身PNG）。
 * - base.png → `<名前>_01_normal`（目・口のパーツ付き）
 * - attack_01〜03・damage_01 → `<名前>_attack_01_windup` などの動きのコマ
 * 差分の絵は全体がわずかに描き直されているので、元の絵との差が濃く集まっている所（目・口）だけを四角く切り出してパーツにする。
 * 切り詰め・縮小・白フチは tools/prepare_poses.mjs と同じ。public/assets/cast/manifest.json に追記する（元ファイルは変更しない）。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EDGE_PX, bbox, paperEdge } from './paper_edge.mjs';
import sharp from 'sharp';

const [SRC, OUT, ...pairs] = process.argv.slice(2);
if (!SRC || !OUT || pairs.length === 0) {
  console.error('使い方: node tools/prepare_cast56.mjs <フォルダ> public/assets 番号:名前 …');
  process.exit(1);
}
const SCALE = 0.72;
const MARGIN = Math.floor(EDGE_PX / SCALE) + 6;
/** 差を数える升目の大きさ(px) */
const CELL = 24;
const MOTIONS = ['attack_01_windup', 'attack_02_hit', 'attack_03_follow_through', 'damage_01_hit'];

const raw = async (file) => sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

/**
 * 元の絵と差分の絵の差が濃く集まっている所の四角（元の絵の座標）。無ければ null。
 * 升目ごとに「はっきり色が変わった画素」を数え、いちばん多い升目からつながっている濃い升目をまとめる
 */
function changedBox(base, other, rx, ry, area = null, share = 0.3) {
  const { width: W, height: H } = base.info;
  const gw = Math.ceil(W / CELL);
  const gh = Math.ceil(H / CELL);
  const g = new Float64Array(gw * gh);
  const a = base.data;
  const b = other.data;
  for (let i = 0; i < W * H; i++) {
    const p = i * 4;
    if (Math.min(a[p + 3], b[p + 3]) < 200) continue;
    const d = Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]);
    if (d > 120) g[Math.floor(i / W / CELL) * gw + Math.floor((i % W) / CELL)]++;
  }
  // area（元の絵の座標の四角）があれば、その中でいちばん濃い所から探す
  const inArea = (k) => !area || ((k % gw) * CELL >= area[0] && (k % gw) * CELL < area[2] && Math.floor(k / gw) * CELL >= area[1] && Math.floor(k / gw) * CELL < area[3]);
  let best = -1;
  for (let k = 0; k < g.length; k++) if (inArea(k) && (best < 0 || g[k] > g[best])) best = k;
  if (best < 0) return null;
  // 升目の4割に満たない（ほぼ同じ絵）ならパーツにしない
  if (g[best] < CELL * CELL * 0.08) return null;
  const strong = g[best] * share;
  // いちばん濃い所の近く（目なら両目が入る横長の範囲、口なら口元）で、濃い升目をまとめる。
  // 両目の間は差が無いので、つながりは問わない。範囲を絞るのは、体の描き直しの差まで拾わないため
  const bx = best % gw;
  const by = Math.floor(best / gw);
  let [x0, y0, x1, y1] = [bx, by, bx, by];
  for (let ny = Math.max(0, by - ry); ny <= Math.min(gh - 1, by + ry); ny++)
    for (let nx = Math.max(0, bx - rx); nx <= Math.min(gw - 1, bx + rx); nx++) {
      if (g[ny * gw + nx] < strong) continue;
      x0 = Math.min(x0, nx);
      y0 = Math.min(y0, ny);
      x1 = Math.max(x1, nx);
      y1 = Math.max(y1, ny);
    }
  return [x0 * CELL, y0 * CELL, Math.min(W, (x1 + 1) * CELL), Math.min(H, (y1 + 1) * CELL)];
}

const union = (boxes) => {
  const list = boxes.filter(Boolean);
  if (!list.length) return null;
  return [Math.min(...list.map((b) => b[0])), Math.min(...list.map((b) => b[1])), Math.max(...list.map((b) => b[2])), Math.max(...list.map((b) => b[3]))];
};

/** 全身PNGを切り詰め・縮小・白フチ付けして保存し、manifest の1項目を返す。parts は元の絵の座標の四角とファイル */
async function convert(pngPath, poseId, parts = {}) {
  const img = await raw(pngPath);
  const { width: W, height: H } = img.info;
  const [bl, bt, br, bb] = bbox(img.data, W, H);
  const l = Math.max(0, bl - MARGIN);
  const t = Math.max(0, bt - MARGIN);
  const r = Math.min(W, br + MARGIN);
  const b = Math.min(H, bb + MARGIN);
  const w = Math.round((r - l) * SCALE);
  const h = Math.round((b - t) * SCALE);
  const small = await sharp(pngPath).ensureAlpha().extract({ left: l, top: t, width: r - l, height: b - t }).resize(w, h, { kernel: 'lanczos3' }).raw().toBuffer();
  const framed = await paperEdge(small, w, h);
  const dir = join(OUT, 'cast', poseId);
  mkdirSync(dir, { recursive: true });
  await sharp(framed, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 88, effort: 6 }).toFile(join(dir, 'base.webp'));
  const out = {};
  for (const [key, { file, box }] of Object.entries(parts)) {
    const [px0, py0, px1, py1] = box;
    const pw = Math.max(1, Math.round((px1 - px0) * SCALE));
    const ph = Math.max(1, Math.round((py1 - py0) * SCALE));
    await sharp(file).ensureAlpha().extract({ left: px0, top: py0, width: px1 - px0, height: py1 - py0 }).resize(pw, ph, { kernel: 'lanczos3' }).webp({ quality: 92, effort: 6 }).toFile(join(dir, `${key}.webp`));
    out[key] = { file: `${key}.webp`, x: Math.round((px0 - l) * SCALE), y: Math.round((py0 - t) * SCALE), w: pw, h: ph };
  }
  return { width: w, height: h, cx: Math.round((W / 2 - l) * SCALE), foot: Math.round((bb - t) * SCALE), parts: out };
}

const manifestPath = join(OUT, 'cast', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
for (const pair of pairs) {
  const [num, name, ...opts] = pair.split(':');
  /** 手で指定した目・口の四角（元の絵の座標） */
  const fixed = Object.fromEntries(opts.map((o) => o.split('=')).map(([k, v]) => [k, v.split(',').map(Number)]));
  const dir = join(SRC, `character_${num.padStart(2, '0')}`);
  if (!existsSync(join(dir, 'base.png'))) throw new Error(`見つかりません: ${dir}`);
  const file = (v) => join(dir, `${v}.png`);
  const base = await raw(file('base'));
  const box = async (v, rx, ry, area, share) => changedBox(base, await raw(file(v)), rx, ry, area, share);
  const pad = (bx, p) => bx && [Math.max(0, bx[0] - p), Math.max(0, bx[1] - p), Math.min(base.info.width, bx[2] + p), Math.min(base.info.height, bx[3] + p)];
  // 目は両目が入るよう横に広く・薄い差まで拾う
  const eye = fixed.eye ?? pad(union([await box('blink_half', 8, 2, null, 0.2), await box('blink_closed', 8, 2, null, 0.2)]), 8);
  // 口は目の少し下から探す
  const below = eye && [eye[0] - 48, eye[3] - CELL, eye[2] + 72, eye[3] + 120];
  let mouth = fixed.mouth ?? pad(union([await box('mouth_half', 2, 1, below), await box('mouth_open', 2, 1, below), await box('mouth_closed', 2, 1, below)]), 8);
  // 口の四角が目に重なると、まばたきが口のパーツに隠れるので、目の下から始める
  // 目の四角の下を口の上端までにし、それでも重なる分は口を下げる
  if (eye && mouth && mouth[1] < eye[3]) {
    eye[3] = Math.max(eye[1] + CELL * 2, mouth[1]);
    if (mouth[1] < eye[3]) mouth = mouth[3] - eye[3] > CELL ? [mouth[0], eye[3], mouth[2], mouth[3]] : null;
  }
  const parts = {};
  if (eye) {
    parts.eye_open = { file: file('base'), box: eye };
    parts.eye_half = { file: file('blink_half'), box: eye };
    parts.eye_closed = { file: file('blink_closed'), box: eye };
  }
  if (mouth) {
    parts.mouth_closed = { file: file('mouth_closed'), box: mouth };
    parts.mouth_half = { file: file('mouth_half'), box: mouth };
    parts.mouth_open = { file: file('mouth_open'), box: mouth };
  }
  manifest[`${name}_01_normal`] = await convert(file('base'), `${name}_01_normal`, parts);
  console.log(name, '目', eye?.join(',') ?? 'なし', '口', mouth?.join(',') ?? 'なし');
  for (const m of MOTIONS) manifest[`${name}_${m}`] = await convert(file(m), `${name}_${m}`);
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1), 'utf-8');
console.log('done', pairs.length);
