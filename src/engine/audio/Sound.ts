/**
 * 効果音と音楽。効果音は素材が無くても鳴るように WebAudio で合成する。
 * スマホでは最初のタップまで音が出せないため unlock() を入力時に呼ぶ。
 */
export type SE = 'blip' | 'select' | 'confirm' | 'cancel' | 'item' | 'shout' | 'wrong' | 'paper' | 'rise' | 'shine' | 'reveal' | 'step' | 'impact' | 'crack' | 'glass' | 'tear' | 'whoosh';

/** コードで鳴らす BGM（テクノなど）。ゲームの AudioContext の、BGM 用の音量ノードへ出す */
export interface BgmTrack {
  start(ctx: AudioContext, out: AudioNode): void;
  stop(): void;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmEl: HTMLAudioElement | null = null;
  /** 一度作った BGM の audio 要素（MediaElementSource は要素ごとに1回しか作れないので使い回す） */
  private bgmEls = new Map<string, HTMLAudioElement>();
  /** 名前で呼ぶ BGM（音声ファイルのURLか、コードで鳴らす曲） */
  private bgmDefs = new Map<string, string | BgmTrack>();
  /** 音声ファイルごとの音量（曲どうしの大きさをそろえる） */
  private bgmFileVolume = new Map<string, number>();
  private bgmName: string | null = null;
  private bgmTrack: BgmTrack | null = null;
  /** 素材ファイルで鳴らす効果音（無ければ合成音） */
  private files = new Map<SE, { data: Promise<ArrayBuffer>; buffer: AudioBuffer | null }>();
  /** 声（セリフの音声ファイル）。URLごとに解読済みの音を少しだけ覚えておく */
  private voices = new Map<string, Promise<AudioBuffer | null>>();
  private voiceSrc: AudioBufferSourceNode | null = null;
  /**
   * 声を鳴らす依頼の番号。読み込みが終わったとき、最後の依頼でなければ鳴らさない。
   * （URL で比べると、同じ声を読み込み中に2回頼んだとき両方鳴って冒頭が二重に聞こえた）
   */
  private voiceTicket = 0;
  muted = false;
  seVolume = 0.5;
  bgmVolume = 0.32;
  voiceVolume = 1;
  /** 作者が決めた基準の音量（設定の 100% に当たる） */
  private static readonly BASE = { se: 0.5, bgm: 0.32, voice: 1 };

  /** 設定の音量（0〜1）を反映する */
  setVolumeScale(bgm: number, se: number, voice = 1): void {
    this.bgmVolume = Sound.BASE.bgm * bgm;
    this.seVolume = Sound.BASE.se * se;
    this.voiceVolume = Sound.BASE.voice * voice;
    if (this.bgmGain && this.ctx) this.bgmGain.gain.setTargetAtTime(this.bgmVolume, this.ctx.currentTime, 0.05);
    else if (this.bgmEl) this.bgmEl.volume = this.bgmVolume * (this.bgmFileVolume.get(this.bgmEl.src) ?? 1);
  }

  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = this.bgmVolume;
      this.bgmGain.connect(this.master);
      // 音が出せるようになる前に指定されていた BGM をここで鳴らす
      const wanted = this.bgmName;
      this.bgmName = null;
      if (wanted) this.setBgm(wanted);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.bgmEl && this.bgmEl.paused && !this.muted) void this.bgmEl.play().catch(() => {});
  }

  /** BGM に名前を付けて登録する（音声ファイルのURL、またはコードで鳴らす曲） */
  defineBgm(name: string, source: string | BgmTrack, volume = 1): void {
    this.bgmDefs.set(name, source);
    if (typeof source === 'string') this.bgmFileVolume.set(source, volume);
  }

  /** 名前で BGM を切り替える。null で止める。音が出せるようになる前なら、出せるようになった時に鳴らす */
  setBgm(name: string | null): void {
    if (name === this.bgmName) return;
    this.bgmName = name;
    if (!this.ctx || !this.bgmGain) return;
    this.bgmEl?.pause();
    this.bgmEl = null;
    this.bgmTrack?.stop();
    this.bgmTrack = null;
    if (!name) return;
    const def = this.bgmDefs.get(name) ?? name;
    if (typeof def === 'string') return this.playBgm(def);
    this.bgmTrack = def;
    def.start(this.ctx, this.bgmGain);
  }

  suspend(): void {
    void this.ctx?.suspend();
    this.bgmEl?.pause();
  }

  resume(): void {
    if (this.muted) return;
    void this.ctx?.resume();
    if (this.bgmEl) void this.bgmEl.play().catch(() => {});
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
    if (this.bgmEl) {
      if (m) this.bgmEl.pause();
      else void this.bgmEl.play().catch(() => {});
    }
  }

  /** 音声ファイルの BGM を最初から鳴らす（名前で切り替えるときは setBgm を使う） */
  playBgm(url: string): void {
    this.bgmEl?.pause();
    let el = this.bgmEls.get(url);
    if (!el) {
      el = new Audio(url);
      el.loop = true;
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      const vol = this.bgmFileVolume.get(url) ?? 1;
      if (this.ctx && this.bgmGain) {
        const g = this.ctx.createGain();
        g.gain.value = vol;
        this.ctx.createMediaElementSource(el).connect(g).connect(this.bgmGain);
      } else el.volume = this.bgmVolume * vol;
      this.bgmEls.set(url, el);
    }
    el.currentTime = 0;
    this.bgmEl = el;
    if (!this.muted) void el.play().catch(() => {});
  }

  fadeBgm(to: number, seconds = 1): void {
    if (this.bgmGain && this.ctx) this.bgmGain.gain.setTargetAtTime(to * this.bgmVolume, this.ctx.currentTime, seconds / 3);
  }

  /** 効果音を素材ファイルに差し替える（先に読み込んでおき、鳴らす時に解読する） */
  useFile(se: SE, url: string): void {
    const data = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`効果音を読めません: ${url}`);
      return r.arrayBuffer();
    });
    data.catch(() => this.files.delete(se)); // 読めなければ合成音のまま
    this.files.set(se, { data, buffer: null });
  }

  private playFile(ctx: AudioContext, entry: { data: Promise<ArrayBuffer>; buffer: AudioBuffer | null }): void {
    const start = (buf: AudioBuffer) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = this.seVolume * 1.6;
      src.connect(g).connect(this.master!);
      src.start();
    };
    if (entry.buffer) return start(entry.buffer);
    // decodeAudioData は元のデータを使い切るので、複製して渡す
    void entry.data
      .then((d) => ctx.decodeAudioData(d.slice(0)))
      .then((buf) => {
        entry.buffer = buf;
        start(buf);
      })
      .catch(() => {});
  }

  /** 声を先に読み込んでおく（次のセリフの分など）。音が出せるようになる前は何もしない */
  preloadVoice(url: string): void {
    const ctx = this.ctx;
    if (!ctx || this.voices.has(url)) return;
    const p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((d) => ctx.decodeAudioData(d))
      .catch(() => null); // 読めなければ声なしで進める
    this.voices.set(url, p);
    // 覚えておくのは最近の分だけ
    if (this.voices.size > 24) this.voices.delete(this.voices.keys().next().value!);
  }

  /** 音が出せるようになったか（スマホでは最初のタップのあと） */
  get ready(): boolean {
    return !!this.ctx;
  }

  /** 声を鳴らす（前の声は止める） */
  playVoice(url: string): void {
    this.stopVoice();
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || this.voiceVolume <= 0) return;
    this.preloadVoice(url);
    const ticket = this.voiceTicket;
    void this.voices.get(url)?.then((buf) => {
      if (!buf || this.voiceTicket !== ticket) return;
      this.voiceTicket++; // この依頼で鳴らすのは1回だけ
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = this.voiceVolume;
      src.connect(g).connect(this.master!);
      src.start();
      this.voiceSrc = src;
    });
  }

  stopVoice(): void {
    this.voiceTicket++;
    try {
      this.voiceSrc?.stop();
    } catch {
      // すでに止まっている
    }
    this.voiceSrc = null;
  }

  play(se: SE): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const file = this.files.get(se);
    if (file) return this.playFile(ctx, file);
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = this.seVolume;
    out.connect(this.master);
    const tone = (type: OscillatorType, f0: number, f1: number, start: number, dur: number, vol: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + start);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + start + dur);
      g.gain.setValueAtTime(0.0001, t + start);
      g.gain.exponentialRampToValueAtTime(vol, t + start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      o.connect(g).connect(out);
      o.start(t + start);
      o.stop(t + start + dur + 0.02);
    };
    const noise = (start: number, dur: number, vol: number, freq: number, q = 0.8) => {
      const len = Math.ceil(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(out);
      src.start(t + start);
    };
    switch (se) {
      case 'blip':
        tone('triangle', 740 + Math.random() * 60, 700, 0, 0.045, 0.12);
        break;
      case 'step':
        noise(0, 0.05, 0.25, 900, 1.2);
        break;
      case 'select':
        tone('sine', 880, 1180, 0, 0.07, 0.25);
        break;
      case 'confirm':
        tone('sine', 660, 990, 0, 0.09, 0.3);
        tone('sine', 990, 1320, 0.07, 0.12, 0.22);
        break;
      case 'cancel':
        tone('sine', 520, 330, 0, 0.12, 0.25);
        break;
      case 'paper':
        noise(0, 0.22, 0.5, 2400, 0.6);
        noise(0.05, 0.15, 0.3, 5200, 0.7);
        break;
      case 'rise':
        // 紙が次々に立ち上がる音（素材ファイルが無いときの代わり）
        for (let i = 0; i < 6; i++) noise(i * 0.2, 0.18, 0.4, 2200 + i * 300, 0.6);
        break;
      case 'shine': {
        // キラキラキラキラ……（高い音が駆け上がる）
        const steps = [1568, 1760, 2093, 2349, 2637, 3136, 3520, 4186, 4699, 5274, 6272, 7040];
        steps.forEach((f, i) => {
          const at = i * 0.055;
          tone('triangle', f * (1 + (Math.random() - 0.5) * 0.01), f, at, 0.22, 0.1);
          tone('sine', f * 2, f * 2, at + 0.02, 0.12, 0.03);
        });
        noise(0, 0.75, 0.12, 9000, 0.5);
        // ……ジャキーン！（金属的な一撃と、長く響く和音）
        const hit = 0.72;
        noise(hit, 0.35, 1.0, 3200, 0.4);
        noise(hit, 0.08, 0.9, 900, 0.7);
        tone('sine', 150, 50, hit, 0.35, 0.45);
        for (const f of [880, 1318.5, 1760, 2637]) {
          tone('sawtooth', f, f, hit, 1.3, 0.07);
          tone('square', f * 1.006, f * 1.006, hit, 0.9, 0.035);
        }
        break;
      }
      case 'item':
        [0, 0.09, 0.18, 0.3].forEach((s, i) => tone('triangle', [784, 988, 1175, 1568][i], [784, 988, 1175, 1568][i], s, 0.28, 0.25));
        break;
      case 'shout':
        noise(0, 0.35, 0.9, 700, 0.5);
        tone('sawtooth', 160, 60, 0, 0.45, 0.35);
        tone('square', 320, 120, 0, 0.25, 0.12);
        break;
      case 'impact':
        // ダン！（低い一撃と、締まった打撃音）
        tone('sine', 120, 38, 0, 0.42, 0.9);
        tone('triangle', 240, 70, 0, 0.18, 0.4);
        noise(0, 0.16, 1.0, 1400, 0.6);
        noise(0, 0.05, 0.8, 4200, 0.8);
        break;
      case 'crack':
        // ピキッ（ガラスにひびが入る）
        noise(0, 0.05, 0.9, 5200, 2.5);
        noise(0.04, 0.04, 0.6, 7600, 3);
        tone('square', 3100, 2400, 0, 0.05, 0.08);
        break;
      case 'glass': {
        // パリーン（割れる一撃と、こまかい破片がきらきら散る音）
        noise(0, 0.5, 1.0, 3800, 0.5);
        noise(0, 0.12, 0.9, 1100, 0.7);
        tone('sine', 140, 45, 0, 0.4, 0.6);
        for (let i = 0; i < 16; i++) {
          const f = 2600 + Math.random() * 5200;
          const at = 0.03 + Math.random() * 0.7;
          tone('triangle', f, f * 0.97, at, 0.16 + Math.random() * 0.2, 0.06 + Math.random() * 0.05);
        }
        noise(0.1, 0.9, 0.25, 8500, 0.6);
        break;
      }
      case 'tear':
        // ビリビリッ（紙が裂ける：細かいざらつきが続けて走る）
        for (let i = 0; i < 9; i++) noise(i * 0.035, 0.05, 0.5 + Math.random() * 0.3, 1800 + Math.random() * 2600, 1.4);
        noise(0, 0.36, 0.35, 3200, 0.5);
        break;
      case 'wrong':
        tone('square', 300, 220, 0, 0.16, 0.18);
        tone('square', 220, 150, 0.15, 0.3, 0.18);
        break;
      case 'reveal':
        tone('sine', 392, 392, 0, 0.5, 0.2);
        tone('sine', 587, 587, 0.08, 0.6, 0.18);
        tone('sine', 784, 784, 0.16, 0.9, 0.16);
        noise(0, 0.6, 0.15, 6000, 0.4);
        break;
    }
  }
}
