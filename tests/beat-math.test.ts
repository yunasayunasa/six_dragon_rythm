import { describe, expect, it } from 'vitest';
import { DEFAULT_BEAT_CONFIG, beatState, beatToSec, secToBeat, songTimeAt } from '../src/engine/audio/beatMath';

const cfg = DEFAULT_BEAT_CONFIG; // 98BPM, offset 0.2

describe('beatMath', () => {
  it('beatToSec と secToBeat は往復で一致する', () => {
    for (const b of [-2, 0, 1.5, 17]) expect(secToBeat(beatToSec(b, cfg), cfg)).toBeCloseTo(b, 9);
  });
  it('offset の位置が 0 拍目、1拍は 60/bpm 秒', () => {
    expect(beatToSec(0, cfg)).toBeCloseTo(0.2);
    expect(beatToSec(1, cfg) - beatToSec(0, cfg)).toBeCloseTo(60 / 98);
  });
  it('songTime は開始時刻と補正から決まる', () => {
    expect(songTimeAt(5.1, 5, { calibrationMs: 0 })).toBeCloseTo(0.1);
    expect(songTimeAt(5.1, 5, { calibrationMs: 50 })).toBeCloseTo(0.05);
    expect(songTimeAt(5.1, 5, { calibrationMs: -50 })).toBeCloseTo(0.15);
  });
  it('小節と小節内の拍', () => {
    const s = beatState(beatToSec(5.5, cfg), cfg);
    expect(s.beat).toBeCloseTo(5.5);
    expect(s.bar).toBe(1);
    expect(s.beatInBar).toBe(1);
  });
  it('小節頭ずらし', () => {
    const s = beatState(beatToSec(0, cfg), { ...cfg, barShift: 1 });
    expect(s.bar).toBe(0);
    expect(s.beatInBar).toBe(1);
    expect(beatState(beatToSec(3, cfg), { ...cfg, barShift: 1 }).bar).toBe(1);
  });
  it('曲頭より前は負の拍・前の小節で、拍番号は範囲内', () => {
    const s = beatState(0, cfg);
    expect(s.beat).toBeLessThan(0);
    expect(s.bar).toBe(-1);
    expect(s.beatInBar).toBe(3);
  });
  it('3拍子', () => {
    const c = { ...cfg, beatsPerBar: 3 };
    const s = beatState(beatToSec(7, c), c);
    expect(s.bar).toBe(2);
    expect(s.beatInBar).toBe(1);
  });
});
