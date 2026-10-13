/**
 * 拍の計算（純粋関数）。時刻は AudioContext.currentTime 基準の秒。
 * songTime = now - startAt - calibration（音ズレ補正 ms を秒にして引く）。拍 0 は songTime = offset の位置。
 */
export interface BeatConfig {
  bpm: number;
  /** 曲の頭から最初の拍までの秒 */
  offset: number;
  beatsPerBar: number;
  /** 音ズレ補正（ms）。正の値で曲時間が遅れる（出力遅延ぶん、拍の表示を後ろへずらす） */
  calibrationMs: number;
  /** 小節頭をずらす拍数（曲の1拍目が小節の2拍目から始まるときなど） */
  barShift: number;
}

export interface BeatState {
  songTime: number;
  /** 小数の拍（0 が最初の拍。曲頭前は負） */
  beat: number;
  /** 0 始まりの小節番号 */
  bar: number;
  /** 小節内の拍（0〜beatsPerBar-1） */
  beatInBar: number;
}

export const DEFAULT_BEAT_CONFIG: BeatConfig = { bpm: 98, offset: 0.2, beatsPerBar: 4, calibrationMs: 0, barShift: 0 };

export function beatToSec(beat: number, cfg: Pick<BeatConfig, 'bpm' | 'offset'>): number {
  return cfg.offset + (beat * 60) / cfg.bpm;
}

export function secToBeat(sec: number, cfg: Pick<BeatConfig, 'bpm' | 'offset'>): number {
  return ((sec - cfg.offset) * cfg.bpm) / 60;
}

export function songTimeAt(now: number, startAt: number, cfg: Pick<BeatConfig, 'calibrationMs'>): number {
  return now - startAt - cfg.calibrationMs / 1000;
}

/**
 * 曲の再生と AudioContext の時計の対応。曲を offsetSec の位置から startCtx（ctx 時刻）に鳴らし始めた、という意味。
 *   songTime = ctx - startCtx + offsetSec   /   ctx = startCtx + songTime - offsetSec
 * 音ズレ補正（calibrationMs）は入れない。補正は「聞こえた拍に表示・判定を合わせる」ための表示側の遅れで、
 * 曲も効果音も同じ出力経路を通るので、予約の時刻（when）は補正なしの時刻でそろう。
 */
export interface SongClock {
  startCtx: number;
  offsetSec: number;
}

export function songToCtx(songSec: number, clock: SongClock): number {
  return clock.startCtx + songSec - clock.offsetSec;
}

export function ctxToSong(ctxSec: number, clock: SongClock): number {
  return ctxSec - clock.startCtx + clock.offsetSec;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

export function beatState(songTime: number, cfg: BeatConfig): BeatState {
  const beat = secToBeat(songTime, cfg);
  const shifted = beat + cfg.barShift;
  return {
    songTime,
    beat,
    bar: Math.floor(shifted / cfg.beatsPerBar),
    beatInBar: mod(Math.floor(shifted), cfg.beatsPerBar),
  };
}
