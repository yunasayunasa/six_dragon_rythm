import { DEFAULT_BEAT_CONFIG, beatState, beatToSec, secToBeat, songTimeAt, type BeatConfig, type BeatState } from './beatMath';

/**
 * 曲の予約再生と拍の時計。ジャンルには依存しない。
 * 既存 BGM（HTMLAudioElement）とは別に、AudioBuffer を AudioContext の時計に合わせて鳴らす。
 * 時刻はすべて ctx.currentTime 基準（サスペンド中は時計も止まるので、復帰しても曲とずれない）。
 */
export class Conductor {
  config: BeatConfig;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private startAt = 0;
  private playing = false;
  private suspendedByHide = false;
  private readonly onVisibility = (): void => {
    if (document.hidden) {
      if (this.playing && this.ctx.state === 'running') {
        this.suspendedByHide = true;
        void this.ctx.suspend();
      }
    } else if (this.suspendedByHide) {
      this.suspendedByHide = false;
      void this.ctx.resume();
    }
  };

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode = ctx.destination,
    config: Partial<BeatConfig> = {},
  ) {
    this.config = { ...DEFAULT_BEAT_CONFIG, ...config };
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  async load(data: ArrayBuffer): Promise<void> {
    this.buffer = await this.ctx.decodeAudioData(data.slice(0));
  }

  /** 少し先（lead 秒後）に頭から予約再生する */
  async start(lead = 0.1): Promise<void> {
    if (!this.buffer) return;
    this.stop();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.out);
    this.startAt = this.ctx.currentTime + lead;
    src.start(this.startAt);
    src.onended = () => {
      if (this.source === src) this.playing = false;
    };
    this.source = src;
    this.playing = true;
  }

  stop(): void {
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        /* 未開始・停止済み */
      }
      this.source.disconnect();
    }
    this.source = null;
    this.playing = false;
  }

  dispose(): void {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  get songTime(): number {
    return songTimeAt(this.ctx.currentTime, this.startAt, this.config);
  }

  get state(): BeatState {
    return beatState(this.songTime, this.config);
  }

  beatToSec(beat: number): number {
    return beatToSec(beat, this.config);
  }

  secToBeat(sec: number): number {
    return secToBeat(sec, this.config);
  }
}
