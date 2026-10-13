import type { Grade } from './Judge';

/**
 * 得点・コンボ・ゲージ（純粋ロジック）。Miss してもゲームは終わらない。
 * コンボは Miss で 0 に戻る。ゲージは 0..100 に収める（0 になっても何も起きない）。
 */
export interface ScoreConfig {
  perfectPoints: number;
  goodPoints: number;
  /** ヒットごとに（コンボ数 × この値）を足す。0 で無効 */
  comboBonus: number;
  /** コンボボーナスに使うコンボ数の上限 */
  comboBonusCap: number;
  gaugeStart: number;
  gaugePerfect: number;
  gaugeGood: number;
  /** Miss で減る量（正の数で書く） */
  gaugeMiss: number;
}

export const DEFAULT_SCORE_CONFIG: Readonly<ScoreConfig> = {
  perfectPoints: 1000,
  goodPoints: 600,
  comboBonus: 10,
  comboBonusCap: 20,
  gaugeStart: 50,
  gaugePerfect: 4,
  gaugeGood: 2,
  gaugeMiss: 6,
};

export const GAUGE_MAX = 100;

export interface ScoreSnapshot {
  score: number;
  combo: number;
  maxCombo: number;
  gauge: number;
  perfect: number;
  good: number;
  miss: number;
}

export class Score {
  score = 0;
  combo = 0;
  maxCombo = 0;
  gauge: number;
  perfect = 0;
  good = 0;
  miss = 0;

  constructor(private readonly cfg: Readonly<ScoreConfig> = DEFAULT_SCORE_CONFIG) {
    this.gauge = clampGauge(cfg.gaugeStart);
  }

  /** 判定を1つ記録する */
  apply(grade: Grade): void {
    const c = this.cfg;
    if (grade === 'miss') {
      this.miss++;
      this.combo = 0;
      this.gauge = clampGauge(this.gauge - c.gaugeMiss);
      return;
    }
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const base = grade === 'perfect' ? c.perfectPoints : c.goodPoints;
    this.score += base + Math.min(this.combo, c.comboBonusCap) * c.comboBonus;
    if (grade === 'perfect') this.perfect++;
    else this.good++;
    this.gauge = clampGauge(this.gauge + (grade === 'perfect' ? c.gaugePerfect : c.gaugeGood));
  }

  snapshot(): ScoreSnapshot {
    const { score, combo, maxCombo, gauge, perfect, good, miss } = this;
    return { score, combo, maxCombo, gauge, perfect, good, miss };
  }

  reset(): void {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.gauge = clampGauge(this.cfg.gaugeStart);
    this.perfect = this.good = this.miss = 0;
  }
}

function clampGauge(v: number): number {
  return Math.max(0, Math.min(GAUGE_MAX, v));
}
