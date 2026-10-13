/**
 * 声の加工と測定（tools/voices.mjs から使う。外部ライブラリなし）。
 * 音は 16bit モノラルの Int16Array。
 */

/**
 * 速さを変えずに音の高さだけを変える（semitones 半音。+12 で1オクターブ上）。
 * WSOLA で長さを伸ばしてから、早回しで元の長さに戻す。声の響き（フォルマント）も一緒に上がるので、幼く聞こえる。
 */
export function pitchShift(pcm, rate, semitones) {
  if (!semitones) return pcm;
  const p = 2 ** (semitones / 12);
  return resample(stretch(pcm, rate, p), p);
}

/** WSOLA：音の高さを変えずに長さを factor 倍にする */
function stretch(pcm, rate, factor) {
  const N = Math.round(rate * 0.04) & ~1; // 40ms の窓
  const Hs = N / 2;
  const Ha = Hs / factor;
  const tol = Math.round(rate * 0.012);
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const x = Float32Array.from(pcm);
  const frames = Math.max(1, Math.floor((x.length - N - tol) / Ha));
  const out = new Float32Array(frames * Hs + N);
  const norm = new Float32Array(out.length);
  let prev = 0;
  for (let k = 0; k < frames; k++) {
    const nominal = Math.round(k * Ha);
    let best = nominal;
    if (k > 0) {
      // 前の窓の自然な続き（prev + Hs）と一番よく似た位置を、nominal のまわりから探す
      const ref = prev + Hs;
      let bestScore = -Infinity;
      for (let d = -tol; d <= tol; d += 2) {
        const pos = nominal + d;
        if (pos < 0 || pos + N > x.length || ref + N > x.length) continue;
        let s = 0;
        for (let i = 0; i < N; i += 4) s += x[ref + i] * x[pos + i];
        if (s > bestScore) {
          bestScore = s;
          best = pos;
        }
      }
    }
    for (let i = 0; i < N && best + i < x.length; i++) {
      out[k * Hs + i] += x[best + i] * win[i];
      norm[k * Hs + i] += win[i];
    }
    prev = best;
  }
  for (let i = 0; i < out.length; i++) if (norm[i] > 1e-3) out[i] /= norm[i];
  return out;
}

/** 早回し（step 倍の速さで読み、長さは 1/step になる） */
function resample(x, step) {
  const n = Math.floor((x.length - 1) / step);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i * step;
    const j = Math.floor(t);
    const v = x[j] + (x[j + 1] - x[j]) * (t - j);
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v)));
  }
  return out;
}

/**
 * 声の高さ（基本周波数 Hz）の中央値と、声のはっきり度（0〜1。低いほど息っぽい・囁き）を測る。
 * 40ms ごとの自己相関で、声が出ている区間だけを使う。
 */
export function measure(pcm, rate) {
  const N = Math.round(rate * 0.04);
  const minLag = Math.floor(rate / 700);
  const maxLag = Math.ceil(rate / 70);
  const f0s = [];
  const clar = [];
  for (let s = 0; s + N + maxLag < pcm.length; s += N / 2) {
    let e = 0;
    for (let i = 0; i < N; i++) e += pcm[s + i] * pcm[s + i];
    if (e / N < 500 * 500) continue; // 小さすぎる音（無音）は飛ばす
    let best = 0;
    let bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let c = 0;
      let e2 = 0;
      for (let i = 0; i < N; i++) {
        c += pcm[s + i] * pcm[s + i + lag];
        e2 += pcm[s + i + lag] * pcm[s + i + lag];
      }
      const r = c / Math.sqrt(e * e2 + 1);
      if (r > best) {
        best = r;
        bestLag = lag;
      }
    }
    clar.push(best);
    if (best > 0.6) f0s.push(rate / bestLag);
  }
  const med = (a) => (a.length ? [...a].sort((p, q) => p - q)[a.length >> 1] : 0);
  return { f0: Math.round(med(f0s)), clarity: Number(med(clar).toFixed(2)) };
}
