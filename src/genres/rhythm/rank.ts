import type { ScoreSnapshot } from './Score';

/**
 * 結果のランク（純粋ロジック）。精度 = 判定の重み付き平均（Perfect 1.0・Good 0.6・Miss 0）。
 * 点数ではなく精度で決めるので、コンボボーナスの有無に左右されない。
 */
export type Rank = 'S' | 'A' | 'B' | 'C';

export interface RankConfig {
  goodWeight: number;
  /** この精度以上で S / A / B（それ未満は C） */
  thresholds: { S: number; A: number; B: number };
}

export const DEFAULT_RANK_CONFIG: Readonly<RankConfig> = {
  goodWeight: 0.6,
  thresholds: { S: 0.9, A: 0.75, B: 0.5 },
};

type Counts = Pick<ScoreSnapshot, 'perfect' | 'good' | 'miss'>;

/** 0..1。判定が1つも無ければ 0 */
export function accuracyOf(s: Counts, cfg: Readonly<RankConfig> = DEFAULT_RANK_CONFIG): number {
  const total = s.perfect + s.good + s.miss;
  if (total <= 0) return 0;
  return (s.perfect + s.good * cfg.goodWeight) / total;
}

export function rankOfAccuracy(accuracy: number, cfg: Readonly<RankConfig> = DEFAULT_RANK_CONFIG): Rank {
  // 浮動小数の誤差で境界ちょうどが落ちないよう、わずかに余裕を持たせる
  const a = accuracy + 1e-9;
  if (a >= cfg.thresholds.S) return 'S';
  if (a >= cfg.thresholds.A) return 'A';
  if (a >= cfg.thresholds.B) return 'B';
  return 'C';
}

export function rankOf(s: Counts, cfg: Readonly<RankConfig> = DEFAULT_RANK_CONFIG): Rank {
  return rankOfAccuracy(accuracyOf(s, cfg), cfg);
}
