/**
 * 時刻を指定して鳴らす合成効果音（素材ファイル不要）。when は AudioContext.currentTime 基準の秒で、
 * 各ノードの start(when) に渡すので、曲と同じ時計の上に正確に置ける。ジャンルには依存しない。
 */
export type SynthKind = 'thump' | 'tick' | 'perfect' | 'good' | 'miss';

export interface SynthOptions {
  /** 音量の倍率（既定 1） */
  level?: number;
  /** tick の高さ（Hz）。カウントの 3・2・1 で上げていく */
  freq?: number;
}

function noiseBuffer(ctx: BaseAudioContext, dur: number): AudioBuffer {
  const len = Math.max(1, Math.ceil(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  return buf;
}

export function playSynth(ctx: BaseAudioContext, out: AudioNode, kind: SynthKind, when: number, opts: SynthOptions = {}): void {
  const level = opts.level ?? 1;
  const tone = (type: OscillatorType, f0: number, f1: number, at: number, dur: number, vol: number): void => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * level), at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + dur + 0.02);
  };
  const noise = (at: number, dur: number, vol: number, freq: number, q: number): void => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = vol * level;
    src.connect(f).connect(g).connect(out);
    src.start(at);
  };
  switch (kind) {
    case 'thump':
      // トン: 筆が紙に当たる短い息（ノイズ）と、すぐ落ちる低い胴鳴り
      noise(when, 0.05, 0.9, 1700, 0.9);
      tone('sine', 190, 62, when, 0.16, 0.85);
      tone('triangle', 380, 120, when, 0.05, 0.25);
      break;
    case 'tick':
      tone('sine', opts.freq ?? 880, opts.freq ?? 880, when, 0.12, 0.45);
      tone('triangle', (opts.freq ?? 880) * 2, (opts.freq ?? 880) * 2, when, 0.05, 0.12);
      break;
    case 'perfect':
      // 明るい2音の鈴
      tone('triangle', 1318, 1318, when, 0.16, 0.5);
      tone('sine', 1976, 1976, when + 0.035, 0.22, 0.4);
      noise(when, 0.04, 0.25, 6500, 0.8);
      break;
    case 'good':
      tone('sine', 988, 1046, when, 0.14, 0.45);
      break;
    case 'miss':
      // 鈍い低音（遠くで鳴る外れ音）
      tone('square', 170, 95, when, 0.16, 0.2);
      noise(when, 0.07, 0.3, 420, 0.7);
      break;
  }
}
