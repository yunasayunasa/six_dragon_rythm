/**
 * 紙の切り抜きの白フチ（tools/prepare_assets.py の paper_edge と同じ考え方）。
 * prepare_poses.mjs（立ち絵）と prepare_props.mjs（小物）で共有する。
 */
import sharp from 'sharp';

/** 白フチの太さ(px) */
export const EDGE_PX = 7;

/** 正方形の最大値フィルタ（PIL の MaxFilter(r*2+1) 相当） */
function maxFilter(src, w, h, r) {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.max(m, src[y * w + k]);
      tmp[y * w + x] = m;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, tmp[k * w + x]);
      out[y * w + x] = m;
    }
  return out;
}

async function blur(ch, w, h, sigma) {
  // 1チャンネルで入れても sharp は3チャンネルで返すので、1チャンネルに戻す
  const { data } = await sharp(Buffer.from(ch), { raw: { width: w, height: h, channels: 1 } }).blur(sigma).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  return new Uint8Array(data);
}

/** 白フチ＋ごく薄い影色の外周を付ける（prepare_assets.py の paper_edge と同じ考え方） */
export async function paperEdge(rgba, w, h) {
  const a = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = rgba[i * 4 + 3] > 24 ? 255 : 0;
  const grown = await blur(maxFilter(a, w, h, EDGE_PX), w, h, 0.8);
  const rim = await blur(maxFilter(grown, w, h, 1), w, h, 1.2);
  const out = Buffer.alloc(w * h * 4);
  const over = (i, r, g, b, al) => {
    const da = out[i + 3] / 255;
    const oa = al + da * (1 - al);
    if (oa <= 0) return;
    out[i] = Math.round((r * al + out[i] * da * (1 - al)) / oa);
    out[i + 1] = Math.round((g * al + out[i + 1] * da * (1 - al)) / oa);
    out[i + 2] = Math.round((b * al + out[i + 2] * da * (1 - al)) / oa);
    out[i + 3] = Math.round(oa * 255);
  };
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    over(i, 120, 104, 88, (rim[p] * 0.55) / 255);
    over(i, 255, 253, 246, grown[p] / 255);
    over(i, rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3] / 255);
  }
  return out;
}

export function bbox(rgba, w, h) {
  let l = w, t = h, r = -1, b = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (rgba[(y * w + x) * 4 + 3] > 8) {
        if (x < l) l = x;
        if (x > r) r = x;
        if (y < t) t = y;
        if (y > b) b = y;
      }
  return [l, t, r + 1, b + 1];
}
