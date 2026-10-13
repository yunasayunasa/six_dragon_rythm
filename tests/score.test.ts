import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORE_CONFIG, GAUGE_MAX, Score } from '../src/genres/rhythm/Score';

describe('Score', () => {
  it('初期値: 点 0・コンボ 0・ゲージは半分', () => {
    expect(new Score().snapshot()).toEqual({ score: 0, combo: 0, maxCombo: 0, gauge: 50, perfect: 0, good: 0, miss: 0 });
  });

  it('Perfect は Good より高く、どちらもコンボが増える', () => {
    const a = new Score();
    const b = new Score();
    a.apply('perfect');
    b.apply('good');
    expect(a.score).toBeGreaterThan(b.score);
    expect(b.score).toBeGreaterThan(0);
    expect([a.combo, b.combo]).toEqual([1, 1]);
  });

  it('1回目の点は 基本点 + コンボボーナス', () => {
    const s = new Score();
    s.apply('perfect');
    expect(s.score).toBe(DEFAULT_SCORE_CONFIG.perfectPoints + DEFAULT_SCORE_CONFIG.comboBonus);
  });

  it('コンボが続くほど1回あたりの点が増え、上限で頭打ちになる', () => {
    const s = new Score();
    const gains: number[] = [];
    for (let i = 0; i < 30; i++) {
      const before = s.score;
      s.apply('perfect');
      gains.push(s.score - before);
    }
    expect(gains[1]).toBeGreaterThan(gains[0]);
    expect(gains[29]).toBe(gains[25]);
    expect(gains[29]).toBe(DEFAULT_SCORE_CONFIG.perfectPoints + DEFAULT_SCORE_CONFIG.comboBonusCap * DEFAULT_SCORE_CONFIG.comboBonus);
  });

  it('Miss でコンボは 0 に戻り、最大コンボと点は残る。Miss は点を増やさない', () => {
    const s = new Score();
    s.apply('perfect');
    s.apply('good');
    s.apply('perfect');
    const before = s.score;
    s.apply('miss');
    expect(s.combo).toBe(0);
    expect(s.maxCombo).toBe(3);
    expect(s.score).toBe(before);
    s.apply('good');
    expect(s.combo).toBe(1);
    expect(s.maxCombo).toBe(3);
    expect(s.miss).toBe(1);
  });

  it('ゲージはヒットで上がり Miss で下がり、0〜100 に収まる', () => {
    const s = new Score();
    s.apply('perfect');
    expect(s.gauge).toBe(50 + DEFAULT_SCORE_CONFIG.gaugePerfect);
    s.apply('miss');
    expect(s.gauge).toBe(50 + DEFAULT_SCORE_CONFIG.gaugePerfect - DEFAULT_SCORE_CONFIG.gaugeMiss);
    for (let i = 0; i < 100; i++) s.apply('perfect');
    expect(s.gauge).toBe(GAUGE_MAX);
    for (let i = 0; i < 100; i++) s.apply('miss');
    expect(s.gauge).toBe(0);
    // 0 でも続けられる（終わらない）
    s.apply('perfect');
    expect(s.gauge).toBeGreaterThan(0);
    expect(s.combo).toBe(1);
  });

  it('設定を差し替えられる', () => {
    const s = new Score({ ...DEFAULT_SCORE_CONFIG, comboBonus: 0, gaugeStart: 120, perfectPoints: 7 });
    expect(s.gauge).toBe(100);
    s.apply('perfect');
    s.apply('perfect');
    expect(s.score).toBe(14);
  });

  it('reset で最初に戻る', () => {
    const s = new Score();
    s.apply('perfect');
    s.apply('miss');
    s.reset();
    expect(s.snapshot()).toEqual(new Score().snapshot());
  });
});
