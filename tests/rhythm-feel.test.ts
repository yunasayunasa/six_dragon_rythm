import { describe, expect, it } from 'vitest';
import { beatState, beatToSec, ctxToSong, songTimeAt, songToCtx, type SongClock } from '../src/engine/audio/beatMath';
import { endDirection } from '../src/engine/render/BrushCanvas';
import {
  CHARS,
  FINALE_CHAR,
  GAME_START_BAR,
  PRACTICE_BARS,
  PRACTICE_CHARS,
  RHYTHM_BEAT_CONFIG,
  START_LEAD_SEC,
  barToBeat,
  barToSec,
  buildChart,
  buildPracticeChart,
  practiceHeadBar,
  shiftChart,
  shiftedBeatConfig,
} from '../src/game/rhythm/chart';
import { nextScreen } from '../src/game/rhythm/screens';
import { getKanjiStrokes } from '../src/game/rhythm/strokes';
import { APPROACH_STYLE_DEFAULT, approachRadius, approachStyle, approachView } from '../src/genres/rhythm/approach';
import type { TimedPt } from '../src/genres/rhythm/Judge';
import { RhythmMode } from '../src/genres/rhythm/RhythmMode';
import { SfxScheduler, countdownAt, planSfx, toEvents } from '../src/genres/rhythm/SfxScheduler';

const pointsOf = (char: string) => (getKanjiStrokes(char)?.strokes ?? []).map((s) => s.points.map(([x, y]) => ({ x, y })));
const strokeCount = (c: string) => pointsOf(c).length;
const baseChart = buildChart(strokeCount);
const BEAT = 60 / RHYTHM_BEAT_CONFIG.bpm;
const fullCfg = (shift: number) => ({ ...shiftedBeatConfig(shift), calibrationMs: 0, barShift: 0 });

/** 開始のタップの時刻 now から start(lead, fromSec) で鳴らし始めたときの、曲と ctx 時計の対応 */
function clockOf(now: number, lead: number, shift: number): SongClock {
  return { startCtx: now + lead, offsetSec: barToSec(GAME_START_BAR) + (shift * 60) / RHYTHM_BEAT_CONFIG.bpm };
}

describe('SongClock（開始位置つきの時刻変換）', () => {
  it('songTime = ctx - startCtx + offset で、往復しても戻る', () => {
    const clock = { startCtx: 5.5, offsetSec: 39.4 };
    expect(ctxToSong(5.5, clock)).toBeCloseTo(39.4);
    expect(ctxToSong(songToCtx(60, clock), clock)).toBeCloseTo(60);
  });
  it('Conductor の songTime（now - startAt - 補正）と同じ式になる（補正 0）', () => {
    const clock = { startCtx: 12.3, offsetSec: 41.2 };
    const startAt = clock.startCtx - clock.offsetSec;
    expect(songTimeAt(20, startAt, { calibrationMs: 0 })).toBeCloseTo(ctxToSong(20, clock));
  });
});

describe('お手本の効果音スケジューラ', () => {
  const totalExampleStrokes = CHARS.reduce((n, c) => n + strokeCount(c), 0);

  for (const shift of [0, 1]) {
    for (const latencyMs of [0, 140]) {
      it(`全字のお手本の各画が、拍の頭の ctx 時刻に予約される（1拍ずらし ${shift}・音ズレ ${latencyMs}ms・開始位置 ${GAME_START_BAR} 小節）`, () => {
        const chart = shift ? shiftChart(baseChart, shift) : baseChart;
        const clock = clockOf(12.345, START_LEAD_SEC, shift);
        const sched = new SfxScheduler(planSfx(chart, BEAT), clock, 1e9);
        const strokes = sched.due(clock.startCtx).filter((e) => e.kind === 'stroke');
        expect(strokes).toHaveLength(totalExampleStrokes);
        const cfg = shiftedBeatConfig(shift);
        let n = 0;
        CHARS.forEach((c, k) => {
          const head = barToBeat(18 + 4 * k); // その字のお手本の最初の拍
          for (let i = 0; i < strokeCount(c); i++) {
            const expected = clock.startCtx + beatToSec(head + i, cfg) - clock.offsetSec;
            expect(Math.abs(strokes[n].when - expected)).toBeLessThan(0.02);
            // 聞こえた瞬間（出力遅延ぶん後）に、画面の曲時刻がその拍の頭に来る = 表示と音がそろう
            const startAt = clock.startCtx - clock.offsetSec;
            const shown = songTimeAt(strokes[n].when + latencyMs / 1000, startAt, { calibrationMs: latencyMs });
            expect(Math.abs(shown - beatToSec(head + i, cfg))).toBeLessThan(0.02);
            expect(strokes[n].value).toBe(i);
            n++;
          }
        });
      });
    }
  }

  it('1拍に1画: 画の間隔はちょうど 1 拍', () => {
    const clock = clockOf(0, START_LEAD_SEC, 0);
    const strokes = new SfxScheduler(planSfx(baseChart, BEAT), clock, 1e9).due(0).filter((e) => e.kind === 'stroke');
    const first = strokes.slice(0, strokeCount(CHARS[0]));
    for (let i = 1; i < first.length; i++) expect(first[i].when - first[i - 1].when).toBeCloseTo(BEAT, 6);
  });

  it('先読みは lookahead の範囲だけで、同じ予定を二度返さない', () => {
    const clock = { startCtx: 10, offsetSec: 0 };
    const plan = [
      { sec: 1, kind: 'stroke' as const, value: 0 },
      { sec: 1.5, kind: 'stroke' as const, value: 1 },
      { sec: 2, kind: 'stroke' as const, value: 2 },
    ];
    const s = new SfxScheduler(plan, clock, 0.2);
    expect(s.due(10.7)).toEqual([]); // 11.0 は 10.9 の先
    expect(s.due(10.85).map((e) => e.value)).toEqual([0]);
    expect(s.due(10.85)).toEqual([]); // 二重に予約しない
    expect(s.due(11.4).map((e) => e.value)).toEqual([1]);
    expect(s.due(11.4)).toEqual([]);
    expect(s.due(11.9).map((e) => e.value)).toEqual([2]);
  });

  it('止まっていて遅れすぎた予定と、再生位置より前の予定は鳴らさない', () => {
    const plan = [
      { sec: 1, kind: 'stroke' as const, value: 0 },
      { sec: 3, kind: 'stroke' as const, value: 1 },
    ];
    const late = new SfxScheduler(plan, { startCtx: 10, offsetSec: 0 }, 0.2, 0.1);
    expect(late.due(12.9).map((e) => e.value)).toEqual([1]); // 11.0 は 1.9 秒遅れ → 捨てる
    const mid = new SfxScheduler(plan, { startCtx: 10, offsetSec: 2 }, 0.2);
    expect(mid.due(0).map((e) => e.value)).toEqual([]); // 曲の 1 秒は 2 秒の位置から始めた曲に無い
    expect(mid.due(10.9).map((e) => e.value)).toEqual([1]);
  });
});

describe('書き返しの前の 3・2・1', () => {
  const writes = baseChart.filter((s) => s.phase === 'write');

  it('書き返しは 8 字 + 終幕の天で 9 つ', () => {
    expect(writes).toHaveLength(9);
    expect(writes.at(-1)?.char).toBe(FINALE_CHAR);
  });

  it('直前の小節の 2・3・4 拍目に 3, 2, 1（書き返しの頭の小節は含まない）', () => {
    const cfg = fullCfg(0);
    const events = planSfx(baseChart, BEAT).filter((e) => e.kind === 'count');
    expect(events).toHaveLength(writes.length * 3);
    for (const w of writes) {
      const mine = events.filter((e) => e.sec >= w.startSec - 4 * BEAT - 1e-6 && e.sec < w.startSec);
      expect(mine.map((e) => e.value)).toEqual([3, 2, 1]);
      const prevBar0 = w.startBar - 2; // beatState の小節は 0 始まり
      mine.forEach((e, i) => {
        const b = beatState(e.sec + 1e-6, cfg);
        expect(b.bar).toBe(prevBar0);
        expect(b.beatInBar).toBe(i + 1); // 2 拍目, 3 拍目, 4 拍目（0 始まりで 1, 2, 3）
        expect(e.sec).toBeCloseTo(beatToSec(barToBeat(w.startBar - 1) + i + 1, RHYTHM_BEAT_CONFIG), 6);
      });
    }
  });

  it('お手本の最後の小節の中にある（字のお手本の 2 小節目）', () => {
    for (const w of writes.filter((s) => !s.finale)) {
      const ex = baseChart.find((s) => s.char === w.char && s.phase === 'example')!;
      const counts = planSfx([w], BEAT).filter((e) => e.kind === 'count');
      for (const c of counts) {
        expect(c.sec).toBeGreaterThanOrEqual(barToSec(ex.endBar) - 1e-6);
        expect(c.sec).toBeLessThan(ex.endSec);
      }
    }
  });

  it('終幕の天の前にも数える', () => {
    const f = baseChart.find((s) => s.finale)!;
    const counts = planSfx([f], BEAT);
    expect(counts.map((e) => e.value)).toEqual([3, 2, 1]);
    expect(counts[0].sec).toBeCloseTo(f.startSec - 3 * BEAT, 6);
  });

  it('カウントも ctx 時計に予約される（1拍ずらし・開始位置あり）', () => {
    const chart = shiftChart(baseChart, 1);
    const clock = clockOf(3, START_LEAD_SEC, 1);
    const evs = toEvents(planSfx(chart, BEAT), clock).filter((e) => e.kind === 'count');
    const cfg = shiftedBeatConfig(1);
    const w0 = chart.find((s) => s.phase === 'write')!;
    const first = evs[0];
    expect(first.when).toBeCloseTo(clock.startCtx + beatToSec(barToBeat(w0.startBar - 1) + 1, cfg) - clock.offsetSec, 2);
  });

  it('countdownAt: 画面の数字は 3→2→1 で、書き返しの頭では消える', () => {
    const w = writes[0];
    const at = (t: number) => countdownAt(t, baseChart, BEAT);
    expect(at(w.startSec - 4 * BEAT + 0.01)).toBeNull(); // 1 拍目
    expect(at(w.startSec - 3 * BEAT + 0.01)?.value).toBe(3);
    expect(at(w.startSec - 2 * BEAT + 0.01)?.value).toBe(2);
    expect(at(w.startSec - 1 * BEAT + 0.01)?.value).toBe(1);
    expect(at(w.startSec - 1 * BEAT + 0.01)?.frac).toBeCloseTo(0.01 / BEAT, 3);
    expect(at(w.startSec + 0.01)).toBeNull();
    expect(at(0)).toBeNull();
  });

  it('お手本の画が 3・2・1 の拍に重なる字（6 画）でも、カウントの予定は残る', () => {
    const ex = baseChart.find((s) => s.char === '羽' && s.phase === 'example')!;
    const w = baseChart.find((s) => s.char === '羽' && s.phase === 'write')!;
    const overlapping = ex.strokes.filter((st) => st.sec >= w.startSec - 3 * BEAT - 1e-6);
    expect(overlapping.length).toBeGreaterThan(0);
    const plan = planSfx([ex, w], BEAT);
    expect(plan.filter((e) => e.kind === 'count')).toHaveLength(3);
    expect(plan.filter((e) => e.kind === 'stroke')).toHaveLength(ex.strokes.length);
  });
});

describe('曲の頭出し（前奏を飛ばす）', () => {
  for (const shift of [0, 1]) {
    it(`17 小節目から鳴らし、最初のお手本の最初の画は開始のタップから 3 秒以内（1拍ずらし ${shift}）`, () => {
      const chart = shift ? shiftChart(baseChart, shift) : baseChart;
      const now = 100;
      const clock = clockOf(now, START_LEAD_SEC, shift);
      const evs = toEvents(planSfx(chart, BEAT), clock);
      const first = evs.find((e) => e.kind === 'stroke')!;
      expect(first.when - now).toBeLessThanOrEqual(3);
      expect(first.when - now).toBeGreaterThan(START_LEAD_SEC); // 頭出しの 1 小節ぶんは待つ
      // 頭出しから最初の画までは 1 小節（約 2.45 秒）
      expect(first.when - clock.startCtx).toBeCloseTo(4 * BEAT, 6);
      expect(GAME_START_BAR).toBe(17);
    });
  }
  it('前奏（約 41 秒）は飛ばす', () => {
    expect(barToSec(GAME_START_BAR)).toBeGreaterThan(38);
  });
});

describe('練習の譜面', () => {
  it('9 字ぶんの頭の小節: 8 字は 18 から 4 小節ごと、天は 67', () => {
    expect(PRACTICE_CHARS).toHaveLength(9);
    expect(practiceHeadBar('大')).toBe(18);
    expect(practiceHeadBar('山')).toBe(22);
    expect(practiceHeadBar('光')).toBe(46);
    expect(practiceHeadBar(FINALE_CHAR)).toBe(67);
    expect(practiceHeadBar('猫')).toBeNull();
    expect(buildPracticeChart('猫', 3, 2)).toEqual([]);
  });

  for (const c of PRACTICE_CHARS) {
    it(`${c}: お手本 2 小節 → 書き返し 2 小節を繰り返す`, () => {
      const n = strokeCount(c);
      const chart = buildPracticeChart(c, n, 3);
      expect(chart).toHaveLength(6);
      const head = practiceHeadBar(c)!;
      chart.forEach((s, i) => {
        expect(s.char).toBe(c);
        expect(s.phase).toBe(i % 2 === 0 ? 'example' : 'write');
        expect(s.finale).toBe(false);
        expect(s.endBar - s.startBar + 1).toBe(2);
        expect(s.strokes).toHaveLength(n);
        // 1 画 = 1 拍で、区間の最初の拍から
        s.strokes.forEach((st, k) => expect(st.sec).toBeCloseTo(s.startSec + k * BEAT, 6));
      });
      expect(chart[0].startBar).toBe(head);
      expect(chart[1].startBar).toBe(head + 2);
      expect(chart[2].startBar).toBe(head + PRACTICE_BARS);
      // 周期は 4 小節ちょうど（曲の繰り返しと合う）
      const period = (PRACTICE_BARS * 4 * 60) / RHYTHM_BEAT_CONFIG.bpm;
      expect(chart[2].startSec - chart[0].startSec).toBeCloseTo(period, 6);
      expect(chart[5].startSec - chart[1].startSec).toBeCloseTo(2 * period, 6);
      // 区間は重ならず隙間もない
      for (let i = 1; i < chart.length; i++) expect(chart[i].startSec).toBeCloseTo(chart[i - 1].endSec, 6);
    });
  }

  it('練習の譜面でも 3・2・1 は書き返しの前の小節（= お手本の最後の小節）に入る', () => {
    const chart = buildPracticeChart('大', 3, 2);
    const counts = planSfx(chart, BEAT).filter((e) => e.kind === 'count');
    expect(counts).toHaveLength(2 * 3);
    for (let loop = 0; loop < 2; loop++) {
      const w = chart[loop * 2 + 1];
      expect(counts[loop * 3 + 0].sec).toBeCloseTo(w.startSec - 3 * BEAT, 6);
      expect(counts[loop * 3 + 2].sec).toBeCloseTo(w.startSec - 1 * BEAT, 6);
    }
  });

  it('RhythmMode で周回しても同じ字のお手本と書き返しが続く', () => {
    const chart = buildPracticeChart('山', 3, 3);
    const mode = new RhythmMode(chart, pointsOf);
    mode.update(chart[0].startSec + 0.01);
    expect([mode.phase, mode.section?.char]).toEqual(['example', '山']);
    mode.update(chart[1].startSec + 0.01);
    expect(mode.phase).toBe('write');
    mode.update(chart[2].startSec + 0.01);
    expect(mode.phase).toBe('example');
    mode.update(chart[5].endSec + 0.01);
    expect(mode.phase).toBe('done');
  });
});

describe('書き出しの輪（approach ring）', () => {
  const style = approachStyle(BEAT);
  it('1 拍前に最大、書き出しの時刻にちょうど最小', () => {
    expect(approachRadius(BEAT, style)).toBeCloseTo(APPROACH_STYLE_DEFAULT.maxRadius);
    expect(approachRadius(0, style)).toBeCloseTo(APPROACH_STYLE_DEFAULT.minRadius);
    expect(APPROACH_STYLE_DEFAULT.minRadius).toBeLessThan(0.05); // 小さな点の大きさ
    expect(APPROACH_STYLE_DEFAULT.maxRadius).toBeGreaterThan(APPROACH_STYLE_DEFAULT.minRadius * 3);
  });
  it('間は直線的に縮み、範囲の外は丸める', () => {
    const mid = (APPROACH_STYLE_DEFAULT.maxRadius + APPROACH_STYLE_DEFAULT.minRadius) / 2;
    expect(approachRadius(BEAT / 2, style)).toBeCloseTo(mid);
    expect(approachRadius(BEAT * 3, style)).toBeCloseTo(APPROACH_STYLE_DEFAULT.maxRadius);
    expect(approachRadius(-1, style)).toBeCloseTo(APPROACH_STYLE_DEFAULT.minRadius);
    let prev = Infinity;
    for (let t = BEAT; t >= 0; t -= BEAT / 20) {
      const r = approachRadius(t, style);
      expect(r).toBeLessThanOrEqual(prev + 1e-12);
      prev = r;
    }
  });
  it('見せるのは 1 拍前から書き出しの少し後まで', () => {
    expect(approachView(BEAT + 0.01, style)).toBeNull();
    expect(approachView(BEAT, style)?.radius).toBeCloseTo(APPROACH_STYLE_DEFAULT.maxRadius);
    expect(approachView(0, style)?.alpha).toBeCloseTo(1);
    expect(approachView(-0.05, style)?.alpha).toBeLessThan(1);
    expect(approachView(-style.lingerSec - 0.01, style)).toBeNull();
  });
  it('矢じりの向き: 終点の手前の点から終点への向き', () => {
    const d = endDirection([
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.5, y: 0.6 },
    ]);
    expect(d).toMatchObject({ x: 0.5, y: 0.6 });
    expect(d!.dx).toBeCloseTo(0);
    expect(d!.dy).toBeCloseTo(1);
    expect(endDirection([{ x: 0, y: 0 }])).toBeNull();
    expect(endDirection([{ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }])).toBeNull();
  });
});

describe('ペンを下ろした瞬間の判定（touchDown）', () => {
  const write = baseChart.find((s) => s.char === '大' && s.phase === 'write')!;
  const draw = (stroke: number, start: number): TimedPt[] => pointsOf('大')[stroke].map((p, i, a) => ({ ...p, t: start + (i / a.length) * 0.3 }));
  const fresh = () => new RhythmMode(baseChart, pointsOf);

  it('下ろした時刻だけで Perfect / Good / Miss が分かり、離したときの判定と同じ時刻判定になる', () => {
    const cases: [number, string][] = [
      [0.0, 'perfect'],
      [-0.05, 'perfect'],
      [0.09, 'good'],
      [-0.1, 'good'],
    ];
    for (const [delta, grade] of cases) {
      const mode = fresh();
      mode.update(write.startSec - 0.3);
      const at = write.strokes[0].sec + delta;
      const sj = mode.touchDown(at);
      expect(sj?.timing).toBe(grade);
      expect(sj?.index).toBe(0);
      expect(sj?.delta).toBeCloseTo(delta);
      // 点数は離したときに 1 回だけ数える
      expect(mode.score.perfect + mode.score.good + mode.score.miss).toBe(0);
      const ev = mode.submitStroke(draw(0, at));
      expect(ev?.result.timingGrade).toBe(grade);
      expect(mode.score.perfect + mode.score.good + mode.score.miss).toBe(1);
    }
  });

  it('区間の頭の許容内で早く下ろしても、最初の画として判定できる', () => {
    const mode = fresh();
    mode.update(write.startSec - 0.5);
    const at = write.startSec - 0.05; // まだ区間の前
    expect(mode.touchDown(at)?.timing).toBe('perfect');
    expect(mode.phase).toBe('write');
    expect(mode.submitStroke(draw(0, at))?.result.grade).toBe('perfect');
  });

  it('許容より早すぎる・お手本の最中・全部書き終えたあとは null', () => {
    const mode = fresh();
    mode.update(write.startSec - 1);
    expect(mode.touchDown(write.startSec - 0.5)).toBeNull();
    const ex = baseChart.find((s) => s.char === '大' && s.phase === 'example')!;
    const m2 = fresh();
    m2.update(ex.startSec + 0.2);
    expect(m2.touchDown(ex.startSec + 0.3)).toBeNull();
    const m3 = fresh();
    m3.update(write.startSec);
    for (let i = 0; i < write.strokes.length; i++) {
      const at = write.strokes[i].sec;
      m3.update(at);
      m3.touchDown(at);
      m3.submitStroke(draw(i, at));
    }
    expect(m3.touchDown(write.endSec - 0.01)).toBeNull();
  });

  it('遅れすぎた画は先に Miss として進み、下ろした瞬間は次の画に対する判定になる', () => {
    const mode = fresh();
    mode.update(write.startSec);
    const sj = mode.touchDown(write.strokes[0].sec + 0.3);
    expect(mode.score.miss).toBe(1); // 画 0 は書かれずに Miss
    expect(sj?.index).toBe(1);
    expect(sj?.timing).toBe('miss'); // 画 1 の 0.31 秒前
  });

  it('形が外れても、時刻のよさは覚えていて、最終の判定だけ Miss に落ちる', () => {
    const mode = fresh();
    mode.update(write.startSec - 0.1);
    const at = write.strokes[0].sec;
    expect(mode.touchDown(at)?.timing).toBe('perfect');
    const wrong = pointsOf('大')[0].map((p, i) => ({ x: 1 - p.x, y: 1 - p.y, t: at + i * 0.01 }));
    const ev = mode.submitStroke(wrong);
    expect(ev?.result.timingGrade).toBe('perfect');
    expect(ev?.result.shapeOk).toBe(false);
    expect(ev?.result.grade).toBe('miss');
    expect(mode.score.miss).toBe(1);
    expect(mode.score.perfect).toBe(0);
  });
});

describe('画面遷移（練習）', () => {
  it('title → practice → play、play / finale → quit → title', () => {
    expect(nextScreen('title', { type: 'practice' })).toBe('play');
    expect(nextScreen('play', { type: 'quit' })).toBe('title');
    expect(nextScreen('finale', { type: 'quit' })).toBe('title');
    expect(nextScreen('result', { type: 'quit' })).toBe('result');
    expect(nextScreen('howto', { type: 'practice' })).toBe('howto');
  });
});
