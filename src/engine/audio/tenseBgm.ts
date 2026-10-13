import type { BgmTrack } from './Sound';

/**
 * コードだけで鳴らす「追い詰める」曲（緊迫感のある短調・152BPM）。
 * 8小節で1周。前半は刻むベースと和音の打ち込み、後半は高い分散和音と秒針の音が加わり、最後の小節で上がっていく音が次の周回へつなぐ。
 * ゲームの AudioContext と BGM 用の音量ノードへ出すので、音量・消音・一時停止はゲーム側に従う。
 */
export function tenseBgm(volume = 0.55): BgmTrack {
  const BPM = 152;
  const STEP = 60 / BPM / 4; // 16分音符
  // Dm | B♭ | Gm | A（A は長和音にして、主音へ戻りたくなる緊張を作る）
  const CHORDS = [
    [50, 53, 57],
    [46, 50, 53],
    [43, 46, 50],
    [45, 49, 52],
  ];
  const ROOTS = [38, 34, 31, 33];
  const KICK = new Set([0, 3, 8, 11]);
  const STAB = new Set([0, 3, 6, 10]);
  const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

  let ctx: AudioContext | null = null;
  let bus: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let timer: number | null = null;
  let next = 0;
  let step = 0;

  const env = (g: GainNode, t: number, peak: number, dur: number, attack = 0.004) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  };
  const osc = (type: OscillatorType, f: number, t: number, dur: number, peak: number, dest: AudioNode, f1?: number, attack?: number) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, peak, dur, attack);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  const hiss = (t: number, dur: number, peak: number, type: BiquadFilterType, freq: number, q = 0.7, freq1?: number) => {
    const s = ctx!.createBufferSource();
    s.buffer = noise;
    const f = ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freq1) f.frequency.exponentialRampToValueAtTime(freq1, t + dur);
    f.Q.value = q;
    const g = ctx!.createGain();
    env(g, t, peak, dur, freq1 ? dur * 0.9 : 0.002);
    s.connect(f).connect(g).connect(bus!);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.02);
  };
  /** こもらせた音（ベース・和音） */
  const filtered = (cutoff: number, cutoff1: number, t: number, dur: number) => {
    const f = ctx!.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(cutoff1, t + dur);
    f.connect(bus!);
    return f;
  };

  const play = (s: number, t: number) => {
    const bar = Math.floor(s / 16) % 8;
    const i = s % 16;
    const chord = CHORDS[bar % 4];
    const root = ROOTS[bar % 4];
    const late = bar >= 4;
    // 太鼓のような低い一撃
    if (KICK.has(i)) {
      osc('sine', 140, t, 0.28, 0.9, bus!, 42);
      hiss(t, 0.03, 0.25, 'bandpass', 2500, 1);
    }
    // スネア（2拍目と4拍目）
    if (i === 4 || i === 12) {
      hiss(t, 0.16, 0.45, 'bandpass', 1900, 0.8);
      osc('triangle', 220, t, 0.08, 0.2, bus!, 160);
    }
    // ハイハット（裏拍を強く）
    hiss(t, 0.035, i % 4 === 2 ? 0.16 : 0.06, 'highpass', 8000, 0.7);
    // 刻むベース（16分。1拍ごとにオクターブ上へ跳ねる）
    const bn = root + (i % 4 === 2 ? 12 : 0);
    const bf = filtered(900, 160, t, STEP * 0.9);
    osc('sawtooth', hz(bn), t, STEP * 0.9, 0.32, bf);
    // 弦の打ち込み（食い気味のリズム）
    if (STAB.has(i)) {
      const sf = filtered(2600, 700, t, 0.16);
      for (const n of chord) {
        osc('sawtooth', hz(n + 12) * 0.997, t, 0.16, 0.07, sf);
        osc('sawtooth', hz(n + 12) * 1.003, t, 0.16, 0.07, sf);
      }
    }
    // 低い持続音（小節の頭）
    if (i === 0) {
      const pf = filtered(500, 300, t, STEP * 16);
      osc('sawtooth', hz(root + 12), t, STEP * 16, 0.08, pf, undefined, 0.3);
    }
    if (late) {
      // 後半：高い分散和音
      const arp = [chord[0], chord[1], chord[2], chord[1]];
      const af = filtered(3800, 1600, t, STEP * 0.8);
      osc('square', hz(arp[i % 4] + 24), t, STEP * 0.8, 0.045, af);
      // 秒針（4分ごと）
      if (i % 4 === 0) osc('sine', 2093, t, 0.03, 0.12, bus!);
    }
    // 最後の小節：上がっていく音で次の周回へ
    if (bar === 7 && i === 0) hiss(t, STEP * 16, 0.22, 'bandpass', 400, 2, 6000);
  };

  const tick = () => {
    if (!ctx) return;
    // 一時停止から戻ったとき、遅れた分をまとめて鳴らさない
    if (next < ctx.currentTime - 0.2) next = ctx.currentTime + 0.05;
    while (next < ctx.currentTime + 0.15) {
      play(step, next);
      next += STEP;
      step++;
    }
  };

  return {
    start(c, out) {
      ctx = c;
      if (!noise) {
        noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      bus = c.createGain();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      bus.gain.setValueAtTime(0.0001, c.currentTime);
      bus.gain.exponentialRampToValueAtTime(volume, c.currentTime + 0.6);
      bus.connect(comp).connect(out);
      step = 0;
      next = c.currentTime + 0.05;
      if (timer !== null) clearInterval(timer);
      timer = window.setInterval(tick, 25);
      tick();
    },
    stop() {
      const c = ctx;
      const b = bus;
      if (timer !== null) clearInterval(timer);
      timer = null;
      bus = null;
      if (!c || !b) return;
      b.gain.cancelScheduledValues(c.currentTime);
      b.gain.setValueAtTime(Math.max(0.0001, b.gain.value), c.currentTime);
      b.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.8);
      setTimeout(() => b.disconnect(), 1000);
    },
  };
}
