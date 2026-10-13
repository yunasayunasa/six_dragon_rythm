import { describe, expect, it } from 'vitest';
import { barToSec, buildChart } from '../src/game/rhythm/chart';
import { getKanjiStrokes } from '../src/game/rhythm/strokes';
import { DEFAULT_SHAPE_OPTIONS, type TimedPt } from '../src/genres/rhythm/Judge';
import { RhythmMode, type JudgeEvent, type RhythmPhase } from '../src/genres/rhythm/RhythmMode';

const pointsOf = (char: string) => (getKanjiStrokes(char)?.strokes ?? []).map((s) => s.points.map(([x, y]) => ({ x, y })));
const chart = buildChart((c) => pointsOf(c).length);
const idx = (char: string, phase: 'example' | 'write') => chart.findIndex((s) => s.char === char && s.phase === phase);

/** 手本どおりの形を、書き出しが start から delta 秒ずれた時刻で書いた画 */
function draw(char: string, stroke: number, start: number, delta = 0): TimedPt[] {
  const pts = pointsOf(char)[stroke];
  return pts.map((p, i) => ({ ...p, t: start + delta + (i / pts.length) * 0.3 }));
}

function make(opts: ConstructorParameters<typeof RhythmMode>[2] = {}) {
  const events: JudgeEvent[] = [];
  const phases: RhythmPhase[] = [];
  const mode = new RhythmMode(chart, pointsOf, {
    ...opts,
    on: { onJudge: (e) => events.push(e), onPhase: (p) => phases.push(p) },
  });
  return { mode, events, phases };
}

describe('RhythmMode: 進行', () => {
  it('intro → example → write → intro(すきま) → … → finale → done の順に変わる', () => {
    const { mode, phases } = make();
    mode.update(0);
    expect(mode.phase).toBe('intro');
    expect(mode.section).toBeNull();
    mode.update(barToSec(18) + 0.01);
    expect(mode.phase).toBe('example');
    expect(mode.section?.char).toBe('大');
    mode.update(barToSec(20) + 0.01);
    expect(mode.phase).toBe('write');
    mode.update(barToSec(22) + 0.01);
    expect(mode.phase).toBe('example');
    expect(mode.section?.char).toBe('山');
    mode.update(barToSec(55));
    expect(mode.phase).toBe('intro');
    mode.update(barToSec(67) + 0.01);
    expect(mode.phase).toBe('finale');
    expect(mode.section?.char).toBe('天');
    mode.update(barToSec(75) + 0.01);
    expect(mode.phase).toBe('done');
    expect(mode.section).toBeNull();
    expect(phases.slice(0, 3)).toEqual(['example', 'write', 'example']);
    expect(phases.at(-2)).toBe('finale');
    expect(phases.at(-1)).toBe('done');
  });

  it('お手本区間では、いま動かす画と進みが分かる', () => {
    const { mode } = make();
    const s = chart[idx('大', 'example')];
    mode.update(s.startSec - 0.5);
    expect(mode.exampleStatus()).toBeNull();
    mode.update(s.strokes[0].sec + s.strokes[0].durSec / 2);
    expect(mode.exampleStatus()).toMatchObject({ active: 0, completed: 0 });
    expect(mode.exampleStatus()?.progress).toBeCloseTo(0.5);
    mode.update(s.strokes[1].sec + 0.001);
    expect(mode.exampleStatus()).toMatchObject({ active: 1, completed: 1 });
    mode.update(s.strokes[2].sec + s.strokes[2].durSec + 0.01);
    expect(mode.exampleStatus()).toMatchObject({ active: null, completed: 3 });
    mode.update(chart[idx('大', 'write')].startSec + 0.01);
    expect(mode.exampleStatus()).toBeNull();
  });

  it('お手本のあいだに書いた画は無視される', () => {
    const { mode, events } = make();
    const s = chart[idx('大', 'example')];
    mode.update(s.strokes[0].sec + 0.01);
    expect(mode.submitStroke(draw('大', 0, s.strokes[0].sec))).toBeNull();
    expect(events).toHaveLength(0);
    expect(mode.score.combo).toBe(0);
  });
});

describe('RhythmMode: 書き返しの判定', () => {
  it('拍どおり正しく書くと Perfect でコンボが続く', () => {
    const { mode, events } = make();
    const w = chart[idx('大', 'write')];
    w.strokes.forEach((st, i) => {
      mode.update(st.sec + 0.02);
      expect(mode.nextStroke).toBe(i);
      mode.submitStroke(draw('大', i, st.sec));
    });
    expect(events.map((e) => e.result.grade)).toEqual(['perfect', 'perfect', 'perfect']);
    expect(events.every((e) => e.drawn !== null && e.sectionIndex === idx('大', 'write'))).toBe(true);
    expect(mode.score.combo).toBe(3);
    expect(mode.score.perfect).toBe(3);
    expect(mode.nextStroke).toBe(-1);
  });

  it('少しずれると Good、大きくずれる・向きが逆だと Miss', () => {
    const { mode, events } = make();
    const w = chart[idx('山', 'write')];
    mode.update(w.startSec);
    events.length = 0; // 手前の区間を飛ばした分の Miss は数えない
    mode.update(w.strokes[0].sec);
    mode.submitStroke(draw('山', 0, w.strokes[0].sec, 0.09));
    mode.update(w.strokes[1].sec);
    mode.submitStroke(draw('山', 1, w.strokes[1].sec, 0.3));
    mode.update(w.strokes[2].sec);
    mode.submitStroke(draw('山', 2, w.strokes[2].sec).reverse());
    expect(events.map((e) => e.result.grade)).toEqual(['good', 'miss', 'miss']);
    expect(mode.score.combo).toBe(0);
    expect(mode.score.maxCombo).toBe(1);
  });

  it('書かれなかった画は許容を過ぎると Miss になり、曲（進行）は止まらない', () => {
    const { mode, events } = make();
    const w = chart[idx('大', 'write')];
    mode.update(w.strokes[0].sec + 0.1);
    expect(events).toHaveLength(0);
    mode.update(w.strokes[0].sec + 0.13);
    expect(events.map((e) => [e.result.index, e.result.grade, e.drawn])).toEqual([[0, 'miss', null]]);
    mode.update(w.strokes[1].sec + 0.2);
    expect(events).toHaveLength(2);
    // 区間が終わると残りもまとめて Miss
    mode.update(w.endSec + 0.01);
    expect(events).toHaveLength(3);
    expect(mode.score.miss).toBe(3);
    expect(mode.phase).toBe('example');
    expect(mode.section?.char).toBe('山');
  });

  it('Miss のあとに書いた画は次の画として判定される', () => {
    const { mode, events } = make();
    const w = chart[idx('大', 'write')];
    mode.update(w.strokes[1].sec - 0.05); // 画0 は Miss 済み
    expect(events).toHaveLength(1);
    mode.submitStroke(draw('大', 1, w.strokes[1].sec));
    expect(events[1].result).toMatchObject({ index: 1, grade: 'perfect' });
  });

  it('ペンを下ろしている間は、その画を Miss にしない', () => {
    const { mode, events } = make();
    const w = chart[idx('大', 'write')];
    const t0 = w.strokes[0].sec + 0.02;
    mode.setPen(t0);
    mode.update(w.strokes[0].sec + 0.5);
    expect(events).toHaveLength(0);
    mode.submitStroke(draw('大', 0, w.strokes[0].sec, 0.02));
    expect(events).toHaveLength(1);
    expect(events[0].result.grade).toBe('perfect');
    // 離したあとは通常どおり、次の画の期限で Miss
    mode.update(w.strokes[1].sec + 0.2);
    expect(events.map((e) => e.result.grade)).toEqual(['perfect', 'miss']);
  });

  it('遅れて始めたペンは、先に期限が来た画を待たせない', () => {
    const { mode, events } = make();
    const w = chart[idx('大', 'write')];
    mode.setPen(w.strokes[1].sec); // 画0 の期限はとうに過ぎている
    mode.update(w.strokes[1].sec + 0.5);
    expect(events.map((e) => [e.result.index, e.result.grade])).toEqual([[0, 'miss']]);
  });

  it('時刻が大きく飛んでも、全部の画が Miss として数えられて最後まで進む', () => {
    const { mode, events } = make();
    mode.update(barToSec(100));
    expect(mode.phase).toBe('done');
    const writeStrokes = chart.filter((s) => s.phase === 'write').reduce((n, s) => n + s.strokes.length, 0);
    expect(events).toHaveLength(writeStrokes);
    expect(events.every((e) => e.result.grade === 'miss')).toBe(true);
    expect(mode.score.miss).toBe(writeStrokes);
    expect(mode.score.gauge).toBe(0);
  });
});

describe('RhythmMode: 終幕', () => {
  it('天は 1画 = 2小節で、お手本なしにそのまま書ける', () => {
    const { mode, events } = make();
    const f = chart[idx('天', 'write')];
    expect(f.finale).toBe(true);
    expect(chart.some((s) => s.char === '天' && s.phase === 'example')).toBe(false);
    mode.update(f.startSec);
    events.length = 0;
    f.strokes.forEach((st, i) => {
      mode.update(st.sec + 0.01);
      expect(mode.phase).toBe('finale');
      expect(mode.nextStroke).toBe(i);
      mode.submitStroke(draw('天', i, st.sec));
    });
    expect(events.map((e) => e.result.grade)).toEqual(['perfect', 'perfect', 'perfect', 'perfect']);
    mode.update(f.endSec + 0.01);
    expect(mode.phase).toBe('done');
  });

  it('終幕で画を書かなければ、2小節ごとに1画ずつ Miss になる', () => {
    const { mode, events } = make();
    const f = chart[idx('天', 'write')];
    mode.update(f.startSec);
    events.length = 0;
    mode.update(f.strokes[1].sec - 1);
    expect(events).toHaveLength(1);
    mode.update(f.strokes[2].sec - 1);
    expect(events).toHaveLength(2);
  });
});

describe('RhythmMode: 設定', () => {
  const lenientDraw = (char: string, stroke: number, start: number): TimedPt[] =>
    draw(char, stroke, start).map((p) => ({ ...p, x: p.x + 0.15 }));

  it('既定の許容はこれまでと同じ値', () => {
    const { mode } = make();
    expect(mode.judgeConfig).toMatchObject(DEFAULT_SHAPE_OPTIONS);
    expect(mode.judgeConfig.perfectSec).toBe(0.06);
    expect(mode.judgeConfig.goodSec).toBe(0.12);
  });

  it('形の許容を狭めると、ずれた画が Miss になる（生成時のオプション）', () => {
    const w = chart[idx('大', 'write')];
    const loose = make();
    loose.mode.update(w.strokes[0].sec);
    loose.mode.submitStroke(lenientDraw('大', 0, w.strokes[0].sec));
    expect(loose.events[0].result.grade).toBe('perfect');

    const strict = make({ judge: { endpointTol: 0.05 } });
    strict.mode.update(w.strokes[0].sec);
    strict.mode.submitStroke(lenientDraw('大', 0, w.strokes[0].sec));
    expect(strict.events[0].result).toMatchObject({ grade: 'miss', shapeOk: false });
  });

  it('setJudgeConfig は次の区間から効く', () => {
    const { mode, events } = make();
    const w1 = chart[idx('大', 'write')];
    mode.update(w1.strokes[0].sec);
    mode.setJudgeConfig({ endpointTol: 0.05 });
    mode.submitStroke(lenientDraw('大', 0, w1.strokes[0].sec));
    expect(events[0].result.grade).toBe('perfect'); // この区間は始まっているので旧設定
    const w2 = chart[idx('山', 'write')];
    mode.update(w2.strokes[0].sec);
    mode.submitStroke(lenientDraw('山', 0, w2.strokes[0].sec));
    expect(events.at(-1)?.result.grade).toBe('miss');
  });
});
