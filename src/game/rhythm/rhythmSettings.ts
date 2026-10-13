import type { JudgeConfig } from '../../genres/rhythm/Judge';

/**
 * 漢字リズムの設定（純粋ロジック）。保存は Store（キーは RHYTHM_SETTINGS_KEY）が担当し、
 * ここは「既定値・範囲の丸め・保存データの読み込み・判定や譜面への反映」だけを持つ。
 */
export const RHYTHM_SETTINGS_KEY = 'rhythmSettings';

export interface RhythmSettings {
  /**
   * 音ズレ補正（ms）。端末の出力遅延ぶん、判定に使う曲の時刻を遅らせる。
   * null は「まだ決めていない」で、AudioContext の遅延から決めた値を使う（resolveLatencyMs）
   */
  latencyMs: number | null;
  /** 小節の頭を1拍ずらす（譜面を1拍あとへ） */
  shiftBeat: boolean;
  /** 音楽の音量 0..1 */
  volume: number;
  /** 始点・終点が手本からずれてよい距離（Judge の endpointTol） */
  endpointTol: number;
  /** 始点→終点の向きがずれてよい角度（度。Judge の angleTolDeg） */
  angleTolDeg: number;
}

export const DEFAULT_RHYTHM_SETTINGS: Readonly<RhythmSettings> = {
  latencyMs: null,
  shiftBeat: false,
  volume: 1,
  endpointTol: 0.25,
  angleTolDeg: 60,
};

export const RHYTHM_LIMITS = {
  latencyMs: { min: -200, max: 500 },
  volume: { min: 0, max: 1 },
  endpointTol: { min: 0.1, max: 0.5 },
  angleTolDeg: { min: 20, max: 90 },
} as const;

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

function num(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : fallback;
}

/** 範囲に丸める（整数にすべき項目は整数に） */
export function clampSettings(s: RhythmSettings): RhythmSettings {
  const L = RHYTHM_LIMITS;
  return {
    latencyMs: s.latencyMs === null ? null : Math.round(clamp(s.latencyMs, L.latencyMs.min, L.latencyMs.max)),
    shiftBeat: s.shiftBeat === true,
    volume: clamp(s.volume, L.volume.min, L.volume.max),
    endpointTol: clamp(s.endpointTol, L.endpointTol.min, L.endpointTol.max),
    angleTolDeg: Math.round(clamp(s.angleTolDeg, L.angleTolDeg.min, L.angleTolDeg.max)),
  };
}

/** 保存されていた値（壊れていても、足りなくてもよい）から設定を作る。読めない項目は既定値 */
export function mergeSettings(stored: unknown): RhythmSettings {
  const d = DEFAULT_RHYTHM_SETTINGS;
  const o = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<string, unknown>;
  const L = RHYTHM_LIMITS;
  return clampSettings({
    latencyMs: o.latencyMs === null || o.latencyMs === undefined ? d.latencyMs : num(o.latencyMs, 0, L.latencyMs.min, L.latencyMs.max),
    shiftBeat: typeof o.shiftBeat === 'boolean' ? o.shiftBeat : d.shiftBeat,
    volume: num(o.volume, d.volume, L.volume.min, L.volume.max),
    endpointTol: num(o.endpointTol, d.endpointTol, L.endpointTol.min, L.endpointTol.max),
    angleTolDeg: num(o.angleTolDeg, d.angleTolDeg, L.angleTolDeg.min, L.angleTolDeg.max),
  });
}

/** AudioContext のうち、遅延の初期値に使う部分 */
export interface LatencySource {
  outputLatency?: number;
  baseLatency?: number;
}

/** 初回の音ズレ補正。outputLatency（秒）→ だめなら baseLatency → どちらも無ければ 0 を、ms にして返す */
export function defaultLatencyMs(ctx: LatencySource | null | undefined): number {
  const ok = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const sec = ctx && ok(ctx.outputLatency) ? ctx.outputLatency : ctx && ok(ctx.baseLatency) ? ctx.baseLatency : 0;
  return Math.round(clamp(sec * 1000, 0, RHYTHM_LIMITS.latencyMs.max));
}

/** いま使う音ズレ補正（ms）。決めていなければ端末の遅延から */
export function resolveLatencyMs(s: Pick<RhythmSettings, 'latencyMs'>, ctx: LatencySource | null | undefined): number {
  return s.latencyMs ?? defaultLatencyMs(ctx);
}

/** 生の曲時刻（秒）から、判定に使う時刻へ。聞こえるのは出力遅延ぶん遅れるので、その分だけ引く */
export function applyLatency(rawSec: number, latencyMs: number): number {
  return rawSec - latencyMs / 1000;
}

/** 譜面を後ろへずらす拍数 */
export function beatShiftOf(s: Pick<RhythmSettings, 'shiftBeat'>): number {
  return s.shiftBeat ? 1 : 0;
}

/** RhythmMode に渡す、形の許容 */
export function judgeConfigOf(s: Pick<RhythmSettings, 'endpointTol' | 'angleTolDeg'>): Pick<JudgeConfig, 'endpointTol' | 'angleTolDeg'> {
  return { endpointTol: s.endpointTol, angleTolDeg: s.angleTolDeg };
}

export interface TapTestOptions {
  /** この番号より前のクリックは助走で、測りには使わない */
  countFrom?: number;
  /** 中央値からこれ以上離れたタップは外す（ms） */
  outlierMs?: number;
  /** 測りに使うタップの最低数 */
  minTaps?: number;
}

/**
 * タップテスト: クリック音の時刻と、タップの時刻（どちらも同じ時計の秒）から、平均のずれ（ms）を出す。
 * タップは「いちばん近いクリック」に対応づける。正なら遅れて叩いている＝音ズレ補正に足す値。
 * 使える数が足りなければ null。
 */
export function tapOffsetMs(clicks: readonly number[], taps: readonly number[], opts: TapTestOptions = {}): number | null {
  const countFrom = opts.countFrom ?? 0;
  const outlier = opts.outlierMs ?? 120;
  const minTaps = opts.minTaps ?? 3;
  const offsets: number[] = [];
  for (const t of taps) {
    let best = -1;
    for (let i = 0; i < clicks.length; i++) if (best < 0 || Math.abs(t - clicks[i]) < Math.abs(t - clicks[best])) best = i;
    if (best >= countFrom) offsets.push((t - clicks[best]) * 1000);
  }
  if (offsets.length < minTaps) return null;
  const sorted = [...offsets].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const kept = offsets.filter((o) => Math.abs(o - median) <= outlier);
  if (kept.length < minTaps) return null;
  const mean = kept.reduce((a, b) => a + b, 0) / kept.length;
  return Math.round(clamp(mean, RHYTHM_LIMITS.latencyMs.min, RHYTHM_LIMITS.latencyMs.max));
}
