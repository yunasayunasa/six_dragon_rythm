/**
 * TechnoTrack — コードだけで鳴らすテクノBGM
 * 138 BPM / 32小節（約56秒）ループ / 外部ファイル不要
 *
 * 使い方（ESモジュール）:
 *   import { TechnoTrack } from './techno-track.js';
 *   const bgm = new TechnoTrack({ volume: 0.7 });
 *   button.onclick = () => bgm.start();   // ブラウザの制約で、最初の再生はタップ等の操作の中で呼ぶ
 *
 * 主なAPI:
 *   start({ from, fadeIn })      再生開始（from: セクションID か小節番号）
 *   stop({ fadeOut })            停止（Promiseを返す）
 *   jumpTo(target)               次の小節の頭で指定位置へ移動
 *   loopSection(id | null)       指定セクションだけを繰り返す（null で解除）
 *   setMuffled(on)               音をこもらせる（ポーズ画面など）
 *   setVolume(v, seconds)        音量 0〜1
 *   setTrackMuted(id, on)        楽器ごとのミュート
 *   getPosition()                現在位置（リズム同期用）
 *   on('beat'|'bar'|'section', cb)  イベント登録（解除関数を返す）
 *   dispose()                    後片付け
 *
 * セクションID: intro, build, mainA, break, drop, outro
 * 楽器ID:       kick, clap, hat, bass, acid, pad, fx
 */

const BPM = 138;
const STEPS = 16; // 1小節 = 16分音符 × 16

/* ================= 曲データ ================= */
const CHORDS = [
  { root: 110.00, pad: [220.00, 261.63, 329.63] }, // Am
  { root: 110.00, pad: [220.00, 261.63, 329.63] }, // Am
  { root: 87.31,  pad: [174.61, 220.00, 261.63] }, // F
  { root: 82.41,  pad: [164.81, 207.65, 246.94] }, // E
];
const NOTE = { '0': 0, '1': 12, '2': 3, '3': 7, '4': 10 };
const ACIDS = ['0.01.03.0.02.13.', '0.01.03.0.02.14.', '0.01.03.0.03.13.', '0.01.03.1.13.31.'];

const E = '................';
const K4 = 'x...x...x...x...';
const CLAP = '....x.......x...';
const CLAPFILL = '....x.......x.oo';
const HAT = 'x.O.x.O.x.O.x.O.';
const HAT_THIN = '..O...O...O...O.';
const HAT_SOFT = 'o.o.o.o.o.o.o.o.';
const BASS = '..0-..0-..0-..0-';
const BASS_ROLL = '..00..0-..00..0-';
const PAD = 'P---------------';

function mk(o) {
  return Object.assign({ kick: E, clap: E, hat: E, bass: E, acid: E, pad: E, fx: E,
    lp: [20000, 20000], hatFill: false, acidOpen: 1, acidOct: 1, padVol: 1 }, o);
}

const SECTIONS = [
  { id: 'intro', name: 'イントロ', len: 4 },
  { id: 'build', name: 'ビルド',   len: 4 },
  { id: 'mainA', name: 'メインA',  len: 8 },
  { id: 'break', name: 'ブレイク', len: 4 },
  { id: 'drop',  name: 'ドロップ', len: 8 },
  { id: 'outro', name: 'アウトロ', len: 4 },
];
{ let a = 0; SECTIONS.forEach(s => { s.start = a; a += s.len; }); }

const BARS = [];
[[350, 700], [700, 1500], [1500, 4000], [4000, 20000]].forEach((lp, i) =>
  BARS.push(mk({ kick: K4, hat: HAT_THIN, lp, clap: i === 3 ? '............x.oo' : E })));
for (let i = 0; i < 4; i++)
  BARS.push(mk({ kick: K4, clap: i === 3 ? CLAPFILL : CLAP, hat: HAT, hatFill: true, bass: BASS }));
for (let i = 0; i < 8; i++)
  BARS.push(mk({ kick: K4, clap: i === 7 ? CLAPFILL : CLAP, hat: HAT, hatFill: true,
    bass: i >= 6 ? BASS_ROLL : BASS, acid: ACIDS[i % 4], acidOpen: 0.5 + i * 0.12 }));
for (let i = 0; i < 4; i++)
  BARS.push(mk({ hat: HAT_SOFT, pad: PAD, acid: ACIDS[i % 4], acidOpen: 0.35 + i * 0.15,
    clap: i === 2 ? 'r.r.r.r.r.r.r.r.' : i === 3 ? 'rrrrrrrrrrrrrrrr' : E,
    fx: i === 2 ? 'R---------------' : i === 3 ? '----------------' : E }));
for (let i = 0; i < 8; i++)
  BARS.push(mk({ kick: K4, clap: i === 7 ? CLAPFILL : CLAP, hat: HAT, hatFill: true,
    bass: i % 4 >= 2 ? BASS_ROLL : BASS, acid: ACIDS[i % 4], acidOpen: 1.3 + i * 0.05,
    acidOct: i >= 4 ? 2 : 1, pad: PAD, padVol: 0.6, fx: i === 0 ? 'C...............' : E }));
[[20000, 8000], [8000, 3000], [3000, 1000], [1000, 350]].forEach((lp, i) =>
  BARS.push(mk({ kick: K4, hat: HAT, hatFill: true, bass: i < 2 ? BASS : E, clap: i < 2 ? CLAP : E, lp })));

const TOTAL_BARS = BARS.length;
const TOTAL_STEPS = TOTAL_BARS * STEPS;
const TRACK_IDS = ['kick', 'clap', 'hat', 'bass', 'acid', 'pad', 'fx'];

function sectionIndexOfBar(b) {
  return SECTIONS.findIndex(s => b >= s.start && b < s.start + s.len);
}

/* ================= 本体 ================= */
export class TechnoTrack {
  /**
   * @param {object} [opts]
   * @param {AudioContext} [opts.context]      ゲーム側のAudioContextを共有する場合に渡す
   * @param {AudioNode}    [opts.destination]  出力先（ゲームのBGM用Gainノードなど）
   * @param {number}       [opts.volume=0.8]
   * @param {number}       [opts.lookahead=0.2] 先読み秒数。ゲームが重くて音が途切れるなら増やす
   * @param {boolean}      [opts.pauseWhenHidden=true] タブが裏に回ったら一時停止（自前のContextの場合のみ）
   */
  constructor(opts = {}) {
    this.opts = { volume: 0.8, lookahead: 0.2, pauseWhenHidden: true, ...opts };
    this.ctx = opts.context || null;
    this._ownCtx = !opts.context;
    this.bpm = BPM;
    this.stepDuration = 60 / BPM / 4;
    this.beatDuration = 60 / BPM;
    this.barDuration = this.stepDuration * STEPS;
    this.playing = false;
    this._built = false;
    this._muted = new Set();
    this._listeners = { beat: [], bar: [], section: [] };
    this._history = [];
    this._current = null;
    this._pendingJump = null;
    this._loop = null;
    this._lastSection = -1;
    this._timer = null;
    this._stopTimer = null;
    this._onVisibility = this._onVisibility.bind(this);
  }

  static get SECTIONS() { return SECTIONS.map(({ id, name, start, len }) => ({ id, name, start, len })); }
  static get TRACKS() { return [...TRACK_IDS]; }
  static get TOTAL_BARS() { return TOTAL_BARS; }

  /* ---------- 公開API ---------- */

  async start({ from = 0, fadeIn = 0 } = {}) {
    this._build();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (this._stopTimer) { clearTimeout(this._stopTimer); this._stopTimer = null; this._halt(); }
    if (this.playing) return;

    const now = this.ctx.currentTime;
    const vol = this.opts.volume;
    this._out.gain.cancelScheduledValues(now);
    if (fadeIn > 0) {
      this._out.gain.setValueAtTime(0.0001, now);
      this._out.gain.linearRampToValueAtTime(vol, now + fadeIn);
    } else {
      this._out.gain.setValueAtTime(vol, now);
    }

    this._stepIndex = this._resolveBar(from) * STEPS;
    this._nextTime = now + 0.06;
    this._history = [];
    this._current = null;
    this._lastSection = -1;
    this._pendingJump = null;
    this.playing = true;
    this._tick();
    this._timer = setInterval(() => this._tick(), 25);
    if (this._ownCtx && this.opts.pauseWhenHidden && typeof document !== 'undefined')
      document.addEventListener('visibilitychange', this._onVisibility);
  }

  stop({ fadeOut = 0 } = {}) {
    if (!this.playing || !this.ctx) return Promise.resolve();
    const now = this.ctx.currentTime;
    const dur = Math.max(0.03, fadeOut);
    this._out.gain.cancelScheduledValues(now);
    this._out.gain.setValueAtTime(this._out.gain.value, now);
    this._out.gain.linearRampToValueAtTime(0.0001, now + dur);
    return new Promise(resolve => {
      this._stopTimer = setTimeout(() => { this._stopTimer = null; this._halt(); resolve(); }, dur * 1000 + 30);
    });
  }

  /** 次の小節の頭で移動。target = セクションID か 小節番号(0始まり) */
  jumpTo(target) {
    const bar = this._resolveBar(target);
    if (this._loop && (bar < this._loop.start || bar >= this._loop.start + this._loop.len)) this._loop = null;
    this._pendingJump = bar;
  }

  /** 指定セクションだけを繰り返す。今その外にいる場合は次の小節で移動する。null で解除 */
  loopSection(id) {
    if (id === null || id === undefined) { this._loop = null; return; }
    const s = SECTIONS.find(x => x.id === id);
    if (!s) throw new Error(`Unknown section: ${id}`);
    this._loop = s;
    const cur = Math.floor((this._stepIndex || 0) / STEPS);
    if (this.playing && (cur < s.start || cur >= s.start + s.len)) this._pendingJump = s.start;
  }

  /** 音をこもらせる（ポーズ画面、会話シーンなど） */
  setMuffled(on, seconds = 0.4) {
    this._build();
    const now = this.ctx.currentTime;
    this._muffle.frequency.cancelScheduledValues(now);
    this._muffle.frequency.setTargetAtTime(on ? 450 : 20000, now, seconds / 3);
  }

  setVolume(v, seconds = 0) {
    this.opts.volume = Math.max(0, Math.min(1, v));
    if (!this._built || !this.playing) return;
    const now = this.ctx.currentTime;
    this._out.gain.cancelScheduledValues(now);
    this._out.gain.setValueAtTime(this._out.gain.value, now);
    if (seconds > 0) this._out.gain.linearRampToValueAtTime(this.opts.volume, now + seconds);
    else this._out.gain.setValueAtTime(this.opts.volume, now);
  }

  setTrackMuted(id, on) {
    if (!TRACK_IDS.includes(id)) throw new Error(`Unknown track: ${id}`);
    on ? this._muted.add(id) : this._muted.delete(id);
  }

  /**
   * 現在鳴っている位置。ゲームループから毎フレーム呼んでリズム同期に使える。
   * 音の出力遅延(outputLatency)は含まないので、厳密な判定が必要なら補正する。
   */
  getPosition() {
    if (!this.playing || !this.ctx) return { playing: false };
    const now = this.ctx.currentTime;
    // 先読み済みの中から「もう鳴った最新のステップ」を探す
    let cur = this._current;
    for (const h of this._history) { if (h.time <= now) cur = h; else break; }
    if (!cur) return { playing: true, bar: 0, step: 0, beat: 0, section: SECTIONS[0].id, stepProgress: 0 };
    const bar = Math.floor(cur.step / STEPS), step = cur.step % STEPS;
    const si = sectionIndexOfBar(bar);
    return {
      playing: true,
      bar, step,
      beat: Math.floor(step / 4),
      section: SECTIONS[si].id,
      sectionName: SECTIONS[si].name,
      barInSection: bar - SECTIONS[si].start,
      stepProgress: Math.min(1, (now - cur.time) / this.stepDuration),
    };
  }

  /** イベント登録: 'beat'（4分音符ごと）, 'bar'（小節ごと）, 'section'（セクションが変わったとき） */
  on(event, cb) {
    if (!this._listeners[event]) throw new Error(`Unknown event: ${event}`);
    this._listeners[event].push(cb);
    return () => { this._listeners[event] = this._listeners[event].filter(f => f !== cb); };
  }

  dispose() {
    this._halt();
    if (this._stopTimer) clearTimeout(this._stopTimer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._onVisibility);
    if (this._built) this._out.disconnect();
    if (this._ownCtx && this.ctx) this.ctx.close();
    this._listeners = { beat: [], bar: [], section: [] };
  }

  /* ---------- 内部処理 ---------- */

  _resolveBar(target) {
    if (typeof target === 'number') return ((Math.floor(target) % TOTAL_BARS) + TOTAL_BARS) % TOTAL_BARS;
    const s = SECTIONS.find(x => x.id === target);
    if (!s) throw new Error(`Unknown section: ${target}`);
    return s.start;
  }

  _halt() {
    this.playing = false;
    clearInterval(this._timer); this._timer = null;
    this._history = [];
    if (this._built) {
      const now = this.ctx.currentTime;
      this._arrLP.frequency.cancelScheduledValues(now);
      this._padDuck.gain.cancelScheduledValues(now);
      this._padDuck.gain.setValueAtTime(1, now);
    }
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._onVisibility);
  }

  _onVisibility() {
    if (!this._ownCtx || !this.ctx) return;
    if (document.hidden) this.ctx.suspend();
    else if (this.playing) this.ctx.resume();
  }

  _emit(event, data) { for (const cb of this._listeners[event]) { try { cb(data); } catch (e) { console.error(e); } } }

  _build() {
    if (this._built) return;
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = this.ctx;

    this._out = ctx.createGain(); this._out.gain.value = 0.0001;
    this._out.connect(this.opts.destination || ctx.destination);

    this._muffle = ctx.createBiquadFilter(); this._muffle.type = 'lowpass';
    this._muffle.frequency.value = 20000; this._muffle.Q.value = 0.7;
    this._muffle.connect(this._out);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    comp.connect(this._muffle);

    this._arrLP = ctx.createBiquadFilter(); this._arrLP.type = 'lowpass';
    this._arrLP.Q.value = 0.9; this._arrLP.frequency.value = 20000;
    this._arrLP.connect(comp);
    this._bus = this._arrLP;

    this._fxIn = ctx.createGain();
    const delay = ctx.createDelay(1); delay.delayTime.value = this.stepDuration * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const wet = ctx.createGain(); wet.gain.value = 0.45;
    this._fxIn.connect(delay); delay.connect(fb).connect(delay); delay.connect(wet).connect(this._bus);

    this._padDuck = ctx.createGain();
    this._padDuck.connect(this._bus); this._padDuck.connect(this._fxIn);

    this._noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this._curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; this._curve[i] = Math.tanh(2.5 * x); }

    this._built = true;
  }

  _tick() {
    if (!this.playing) return;
    const ctx = this.ctx;
    while (this._nextTime < ctx.currentTime + this.opts.lookahead) {
      if (this._stepIndex % STEPS === 0 && this._pendingJump !== null) {
        this._stepIndex = this._pendingJump * STEPS;
        this._pendingJump = null;
      }
      this._scheduleStep(this._stepIndex, this._nextTime);
      this._history.push({ step: this._stepIndex, time: this._nextTime });
      this._nextTime += this.stepDuration;

      let next = (this._stepIndex + 1) % TOTAL_STEPS;
      if (this._loop) {
        const b = Math.floor(next / STEPS);
        if (b < this._loop.start || b >= this._loop.start + this._loop.len) next = this._loop.start * STEPS;
      }
      this._stepIndex = next;
    }

    // 鳴り終わったステップのイベントを通知（25ms程度の誤差あり。厳密な同期は getPosition を使う）
    const now = ctx.currentTime;
    while (this._history.length && this._history[0].time <= now) {
      const h = this._history.shift();
      this._current = h;
      const bar = Math.floor(h.step / STEPS), step = h.step % STEPS;
      if (step === 0) {
        const si = sectionIndexOfBar(bar);
        if (si !== this._lastSection) {
          this._lastSection = si;
          this._emit('section', { section: SECTIONS[si].id, name: SECTIONS[si].name, bar });
        }
        this._emit('bar', { bar, section: SECTIONS[si].id });
      }
      if (step % 4 === 0) this._emit('beat', { bar, beat: step / 4, time: h.time });
    }
  }

  _scheduleStep(i, t) {
    const b = Math.floor(i / STEPS), s = i % STEPS;
    const bar = BARS[b], ch = CHORDS[b % 4];
    const on = id => !this._muted.has(id);

    if (s === 0) {
      const f = this._arrLP.frequency;
      f.cancelScheduledValues(t);
      f.setValueAtTime(bar.lp[0], t);
      if (bar.lp[1] !== bar.lp[0]) f.exponentialRampToValueAtTime(bar.lp[1], t + this.barDuration);
    }
    if (on('kick') && bar.kick[s] === 'x') this._kick(t);
    if (on('clap')) {
      const c = bar.clap[s];
      if (c === 'x') this._clap(t, 1);
      else if (c === 'o') this._clap(t, 0.4);
      else if (c === 'r') this._roll(t, 0.25 + (b % 4 === 3 ? 0.35 : 0) + s / 15 * 0.4);
    }
    if (on('hat')) {
      const c = bar.hat[s];
      if (c !== '.') this._hat(t, c);
      else if (bar.hatFill) this._hat(t, 'o');
    }
    if (on('bass') && bar.bass[s] === '0') {
      const len = bar.bass[s + 1] === '-' ? 2 : 1;
      this._bass(t, ch.root, len * this.stepDuration * 0.95);
    }
    if (on('acid')) {
      const c = bar.acid[s];
      if (NOTE[c] !== undefined)
        this._acid(t, ch.root * 2 * bar.acidOct * Math.pow(2, NOTE[c] / 12),
          this.stepDuration * 0.9, s % 4 === 0, bar.acidOpen);
    }
    if (on('pad') && bar.pad[s] === 'P') this._pad(t, ch.pad, this.barDuration, bar.padVol);
    if (on('fx')) {
      if (bar.fx[s] === 'R') this._riser(t, this.barDuration * 2);
      if (bar.fx[s] === 'C') this._noise(t, 1.4, 5000, 'highpass', 0.3);
    }
  }

  /* ---------- 楽器 ---------- */

  _noise(t, dur, freq, type, vol, q = 0.7) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this._noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this._bus);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  _env(t, dur, peak, attack = 0.005) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + Math.max(attack, dur - 0.03));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  _osc(type, f, t, dur, dest, gain = 1) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const g = this.ctx.createGain(); g.gain.value = gain;
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  _kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.connect(g).connect(this._bus); o.start(t); o.stop(t + 0.5);
    this._noise(t, 0.01, 3000, 'highpass', 0.3);
    this._padDuck.gain.setValueAtTime(0.25, t);
    this._padDuck.gain.linearRampToValueAtTime(1, t + 0.22);
  }

  _clap(t, vel) {
    [0, 0.011, 0.022].forEach(d => this._noise(t + d, 0.012, 1400, 'bandpass', 0.6 * vel, 1.4));
    this._noise(t + 0.03, 0.16, 1400, 'bandpass', 0.45 * vel, 1.1);
  }

  _roll(t, vel) {
    const ctx = this.ctx;
    this._noise(t, 0.09, 1500, 'highpass', 0.55 * vel);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 200;
    g.gain.setValueAtTime(0.35 * vel, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g).connect(this._bus); o.start(t); o.stop(t + 0.09);
  }

  _hat(t, c) {
    if (c === 'O') this._noise(t, 0.16, 7500, 'highpass', 0.26);
    else this._noise(t, 0.035, 8000, 'highpass', c === 'o' ? 0.1 : 0.22);
  }

  _bass(t, f, dur) {
    const ctx = this.ctx;
    const out = this._env(t, dur, 0.4);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(700, t); lp.frequency.exponentialRampToValueAtTime(220, t + dur);
    this._osc('sawtooth', f, t, dur, lp, 0.5);
    this._osc('sine', f / 2, t, dur, out, 0.9);
    lp.connect(out); out.connect(this._bus);
  }

  _acid(t, f, dur, accent, open) {
    const ctx = this.ctx;
    const sh = ctx.createWaveShaper(); sh.curve = this._curve;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 14;
    lp.frequency.setValueAtTime(Math.max(300, (accent ? 3400 : 1900) * open), t);
    lp.frequency.exponentialRampToValueAtTime(240, t + 0.18);
    const out = this._env(t, dur, accent ? 0.2 : 0.14);
    this._osc('sawtooth', f, t, dur, lp, 0.6);
    lp.connect(sh).connect(out); out.connect(this._bus); out.connect(this._fxIn);
  }

  _pad(t, freqs, dur, vol) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
    const g = ctx.createGain(), peak = 0.045 * vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.5);
    g.gain.setValueAtTime(peak, t + dur - 0.25);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(g).connect(this._padDuck);
    freqs.forEach(f => {
      this._osc('triangle', f, t, dur, lp, 1);
      this._osc('sawtooth', f * 1.006, t, dur, lp, 0.35);
    });
  }

  _riser(t, dur) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this._noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(9000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.4, t + dur);
    g.gain.setValueAtTime(0.0001, t + dur + 0.01);
    s.connect(f).connect(g).connect(this._bus); s.start(t); s.stop(t + dur + 0.05);
  }
}

export default TechnoTrack;
