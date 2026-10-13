import { describe, expect, it } from 'vitest';
import { beatToSec } from '../src/engine/audio/beatMath';
import { RHYTHM_BEAT_CONFIG, barToBeat, barToSec, buildChart, expectedStrokes, makeSection } from '../src/game/rhythm/chart';

const counts: Record<string, number> = { 大: 3, 山: 3, 刃: 3, 火: 4, 月: 4, 王: 4, 羽: 6, 光: 6, 天: 4 };
const chart = buildChart((c) => counts[c]);
const find = (char: string, phase: 'example' | 'write') => chart.find((s) => s.char === char && s.phase === phase)!;

describe('chart', () => {
  it('1小節目は 0.20 秒、98BPM の4拍で1小節', () => {
    expect(barToSec(1)).toBeCloseTo(0.2);
    expect(barToSec(2) - barToSec(1)).toBeCloseTo((4 * 60) / 98);
    expect(barToBeat(18)).toBe(68);
  });
  it('お手本と書き返しの小節番号', () => {
    expect([find('大', 'example').startBar, find('大', 'example').endBar]).toEqual([18, 19]);
    expect([find('大', 'write').startBar, find('大', 'write').endBar]).toEqual([20, 21]);
    expect([find('山', 'example').startBar, find('山', 'write').startBar]).toEqual([22, 24]);
    expect([find('光', 'write').startBar, find('光', 'write').endBar]).toEqual([48, 49]);
  });
  it('終幕の天は 67〜74 小節（お手本なし）で、1画 = 2小節', () => {
    const f = chart.filter((s) => s.char === '天');
    expect(f).toHaveLength(1);
    expect([f[0].phase, f[0].startBar, f[0].endBar, f[0].finale]).toEqual(['write', 67, 74, true]);
    expect(f[0].strokes.map((s) => s.beat)).toEqual([264, 272, 280, 288]);
    f[0].strokes.forEach((s, i) => expect(s.sec).toBeCloseTo(barToSec(67 + 2 * i)));
    expect(f[0].strokes[0].durSec).toBeCloseTo((8 * 60) / 98);
    expect(f[0].overflow).toBe(false);
    expect(chart.filter((s) => s.finale)).toHaveLength(1);
  });
  it('区間の秒は小節の頭から次の小節の頭まで', () => {
    const w = find('大', 'write');
    expect(w.startSec).toBeCloseTo(barToSec(20));
    expect(w.endSec).toBeCloseTo(barToSec(22));
  });
  it('1画 = 1拍で、区間の最初の拍から始まる', () => {
    const w = find('大', 'write');
    expect(w.strokes.map((s) => s.beat)).toEqual([76, 77, 78]);
    expect(w.strokes[0].sec).toBeCloseTo(beatToSec(76, RHYTHM_BEAT_CONFIG));
    expect(w.strokes[1].sec - w.strokes[0].sec).toBeCloseTo(60 / 98);
  });
  it('区間は時刻順で重ならない', () => {
    for (let i = 1; i < chart.length; i++) expect(chart[i].startBar).toBeGreaterThan(chart[i - 1].endBar);
  });
  it('8拍に収まらない画数は次の拍へ続け、overflow が立つ', () => {
    const s = makeSection('X', 'write', 20, 2, 10);
    expect(s.overflow).toBe(true);
    expect(s.strokes.map((x) => x.beat)).toEqual([76, 77, 78, 79, 80, 81, 82, 83, 84, 85]);
    expect(chart.some((c) => c.overflow)).toBe(false);
  });
  it('expectedStrokes は点列と時刻を組にする', () => {
    const w = find('大', 'write');
    const e = expectedStrokes(w, [[{ x: 0, y: 0 }], [{ x: 1, y: 1 }], [{ x: 2, y: 2 }]]);
    expect(e).toHaveLength(3);
    expect(e[1].points[0]).toEqual({ x: 1, y: 1 });
    expect(e[1].startTime).toBeCloseTo(w.strokes[1].sec);
  });
});
