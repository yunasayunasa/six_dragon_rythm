import { describe, expect, it } from 'vitest';
import { RHYTHM_BEAT_CONFIG, barToSec, buildChart, shiftChart, shiftedBeatConfig } from '../src/game/rhythm/chart';
import {
  DEFAULT_RHYTHM_SETTINGS,
  RHYTHM_LIMITS,
  applyLatency,
  beatShiftOf,
  clampSettings,
  defaultLatencyMs,
  judgeConfigOf,
  mergeSettings,
  resolveLatencyMs,
  tapOffsetMs,
} from '../src/game/rhythm/rhythmSettings';
import { getKanjiStrokes } from '../src/game/rhythm/strokes';
import { DEFAULT_JUDGE_CONFIG, type TimedPt } from '../src/genres/rhythm/Judge';
import { RhythmMode, type JudgeEvent } from '../src/genres/rhythm/RhythmMode';

const pointsOf = (char: string) => (getKanjiStrokes(char)?.strokes ?? []).map((s) => s.points.map(([x, y]) => ({ x, y })));
const chart = buildChart((c) => pointsOf(c).length);
const BEAT_SEC = 60 / RHYTHM_BEAT_CONFIG.bpm;

/** 手本どおりの形を、start から書き出した画 */
function draw(char: string, stroke: number, start: number): TimedPt[] {
  const pts = pointsOf(char)[stroke];
  return pts.map((p, i) => ({ ...p, t: start + (i / pts.length) * 0.3 }));
}

/** 「大」の書き返しの1画目を、judgedStart の時刻で書いたときの判定 */
function firstStrokeGrade(sections: typeof chart, judgedStart: number, judge = {}) {
  const events: JudgeEvent[] = [];
  const mode = new RhythmMode(sections, pointsOf, { judge, on: { onJudge: (e) => events.push(e) } });
  const w = sections.find((s) => s.char === '大' && s.phase === 'write')!;
  mode.update(w.startSec + 0.001);
  mode.submitStroke(draw('大', 0, judgedStart));
  return events[0].result;
}

describe('rhythmSettings: 既定値・丸め・読み込み', () => {
  it('何も保存されていなければ既定値（音ズレ補正は未決定 null）', () => {
    expect(mergeSettings({})).toEqual(DEFAULT_RHYTHM_SETTINGS);
    expect(mergeSettings(undefined)).toEqual(DEFAULT_RHYTHM_SETTINGS);
    expect(DEFAULT_RHYTHM_SETTINGS.latencyMs).toBeNull();
  });
  it('範囲を超えた値は範囲の端に丸める', () => {
    const s = mergeSettings({ latencyMs: 9999, volume: 3, endpointTol: 0, angleTolDeg: 500 });
    expect(s.latencyMs).toBe(RHYTHM_LIMITS.latencyMs.max);
    expect(s.volume).toBe(1);
    expect(s.endpointTol).toBe(RHYTHM_LIMITS.endpointTol.min);
    expect(s.angleTolDeg).toBe(RHYTHM_LIMITS.angleTolDeg.max);
    expect(clampSettings({ ...DEFAULT_RHYTHM_SETTINGS, latencyMs: -999 }).latencyMs).toBe(RHYTHM_LIMITS.latencyMs.min);
  });
  it('壊れた保存データ（型違い・NaN・null）は項目ごとに既定値へ戻す', () => {
    const s = mergeSettings({ latencyMs: 'x', shiftBeat: 1, volume: Number.NaN, endpointTol: null, angleTolDeg: {} });
    expect(s).toEqual({ ...DEFAULT_RHYTHM_SETTINGS, latencyMs: 0 });
    expect(mergeSettings('garbage')).toEqual(DEFAULT_RHYTHM_SETTINGS);
    expect(mergeSettings(null)).toEqual(DEFAULT_RHYTHM_SETTINGS);
  });
  it('保存された値はそのまま読める（保存 → 読み込みで変わらない）', () => {
    const saved = { latencyMs: 85, shiftBeat: true, volume: 0.4, endpointTol: 0.3, angleTolDeg: 45 };
    expect(mergeSettings(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });
  it('一部だけ保存されていても、残りは既定値で埋める', () => {
    expect(mergeSettings({ volume: 0.5 })).toEqual({ ...DEFAULT_RHYTHM_SETTINGS, volume: 0.5 });
  });
});

describe('rhythmSettings: 音ズレ補正の初期値', () => {
  it('outputLatency（秒）を ms にして使う', () => {
    expect(defaultLatencyMs({ outputLatency: 0.123, baseLatency: 0.01 })).toBe(123);
  });
  it('outputLatency が無い・0 のときは baseLatency に切り替える', () => {
    expect(defaultLatencyMs({ baseLatency: 0.0213 })).toBe(21);
    expect(defaultLatencyMs({ outputLatency: 0, baseLatency: 0.02 })).toBe(20);
  });
  it('どちらも無い・不正なら 0。大きすぎる値は上限へ', () => {
    expect(defaultLatencyMs(null)).toBe(0);
    expect(defaultLatencyMs({})).toBe(0);
    expect(defaultLatencyMs({ outputLatency: Number.NaN })).toBe(0);
    expect(defaultLatencyMs({ outputLatency: 5 })).toBe(RHYTHM_LIMITS.latencyMs.max);
  });
  it('保存済みの値があればそれを使い、未決定のときだけ端末の値を使う', () => {
    expect(resolveLatencyMs({ latencyMs: 40 }, { outputLatency: 0.2 })).toBe(40);
    expect(resolveLatencyMs({ latencyMs: 0 }, { outputLatency: 0.2 })).toBe(0);
    expect(resolveLatencyMs({ latencyMs: null }, { outputLatency: 0.2 })).toBe(200);
  });
});

describe('rhythmSettings: タップテスト', () => {
  const clicks = Array.from({ length: 12 }, (_, i) => 1 + i * 0.6);
  it('一定のずれで叩けば、そのずれ（ms）が出る', () => {
    const taps = clicks.map((c) => c + 0.09);
    expect(tapOffsetMs(clicks, taps)).toBe(90);
  });
  it('助走（countFrom より前のクリック）に叩いたぶんは測りに入れない', () => {
    const taps = clicks.map((c, i) => c + (i < 4 ? 0.2 : 0.05));
    expect(tapOffsetMs(clicks, taps, { countFrom: 4 })).toBe(50);
  });
  it('外れ値のタップは除いて平均する', () => {
    const taps = clicks.slice(4).map((c, i) => c + (i === 3 ? 0.25 : 0.06));
    expect(tapOffsetMs(clicks, taps, { countFrom: 4 })).toBe(60);
  });
  it('早く叩けば負の値。タップが足りなければ null', () => {
    expect(tapOffsetMs(clicks, clicks.slice(4).map((c) => c - 0.03), { countFrom: 4 })).toBe(-30);
    expect(tapOffsetMs(clicks, [clicks[5], clicks[6]], { countFrom: 4 })).toBeNull();
    expect(tapOffsetMs(clicks, [])).toBeNull();
  });
});

describe('音ズレ補正を判定の時刻に反映する', () => {
  it('applyLatency は遅れて聞こえる分だけ時刻を戻す', () => {
    expect(applyLatency(10, 120)).toBeCloseTo(9.88);
    expect(applyLatency(10, 0)).toBe(10);
    expect(applyLatency(10, -50)).toBeCloseTo(10.05);
  });
  it('出力遅延 80ms で聞こえた拍に叩くと、補正なしでは Good、補正ありなら Perfect', () => {
    const w = chart.find((s) => s.char === '大' && s.phase === 'write')!;
    const raw = w.strokes[0].sec + 0.08; // 聞こえてから叩いた時刻（曲の生の時刻）
    expect(firstStrokeGrade(chart, applyLatency(raw, 0)).grade).toBe('good');
    expect(firstStrokeGrade(chart, applyLatency(raw, 80)).grade).toBe('perfect');
  });
});

describe('小節の頭を1拍ずらす', () => {
  it('beatShiftOf は ON で1拍、OFF で 0', () => {
    expect(beatShiftOf({ shiftBeat: true })).toBe(1);
    expect(beatShiftOf({ shiftBeat: false })).toBe(0);
  });
  it('区間も各画も 1拍（60/BPM 秒）あとへ。小節番号・画の並びは変えず、元の譜面は変えない', () => {
    const before = chart[1].startSec;
    const shifted = shiftChart(chart, 1);
    expect(shifted).toHaveLength(chart.length);
    shifted.forEach((s, i) => {
      expect(s.startSec - chart[i].startSec).toBeCloseTo(BEAT_SEC);
      expect(s.endSec - chart[i].endSec).toBeCloseTo(BEAT_SEC);
      expect(s.startBar).toBe(chart[i].startBar);
      expect(s.strokes).toHaveLength(chart[i].strokes.length);
      s.strokes.forEach((st, k) => {
        expect(st.sec - chart[i].strokes[k].sec).toBeCloseTo(BEAT_SEC);
        expect(st.beat - chart[i].strokes[k].beat).toBe(1);
        expect(st.durSec).toBe(chart[i].strokes[k].durSec);
      });
    });
    expect(chart[1].startSec).toBe(before);
    expect(shiftChart(chart, 0)[1].startSec).toBe(chart[1].startSec);
  });
  it('ずらした譜面では、ずらした時刻に書いて Perfect。ずらす前の時刻では 1拍早すぎて Miss', () => {
    const shifted = shiftChart(chart, 1);
    const w = shifted.find((s) => s.char === '大' && s.phase === 'write')!;
    const orig = chart.find((s) => s.char === '大' && s.phase === 'write')!;
    expect(firstStrokeGrade(shifted, w.strokes[0].sec).grade).toBe('perfect');
    expect(firstStrokeGrade(shifted, orig.strokes[0].sec).grade).toBe('miss');
  });
  it('拍の設定も 1拍ぶん後ろへ。最初の小節の頭は barToSec + 1拍と一致', () => {
    const cfg = shiftedBeatConfig(1);
    expect(cfg.offset - RHYTHM_BEAT_CONFIG.offset).toBeCloseTo(BEAT_SEC);
    expect(barToSec(18, cfg)).toBeCloseTo(shiftChart(chart, 1)[0].startSec);
    expect(shiftedBeatConfig(0)).toEqual(RHYTHM_BEAT_CONFIG);
  });
});

describe('形の許容を判定に反映する', () => {
  it('judgeConfigOf は設定の値をそのまま Judge の項目名で渡す', () => {
    const s = clampSettings({ ...DEFAULT_RHYTHM_SETTINGS, endpointTol: 0.4, angleTolDeg: 80 });
    expect(judgeConfigOf(s)).toEqual({ endpointTol: 0.4, angleTolDeg: 80 });
    expect(judgeConfigOf(DEFAULT_RHYTHM_SETTINGS)).toEqual({ endpointTol: DEFAULT_JUDGE_CONFIG.endpointTol, angleTolDeg: DEFAULT_JUDGE_CONFIG.angleTolDeg });
  });
  it('許容を狭めると、少しずれた画が Miss になり、広げると通る', () => {
    const w = chart.find((s) => s.char === '大' && s.phase === 'write')!;
    // 手本の始点を 0.2 ずらして書く
    const shiftedStroke = (): TimedPt[] => draw('大', 0, w.strokes[0].sec).map((p) => ({ ...p, x: p.x + 0.2 }));
    const run = (judge: Partial<typeof DEFAULT_JUDGE_CONFIG>) => {
      const events: JudgeEvent[] = [];
      const mode = new RhythmMode(chart, pointsOf, { judge, on: { onJudge: (e) => events.push(e) } });
      mode.update(w.startSec + 0.001);
      mode.submitStroke(shiftedStroke());
      return events[0].result;
    };
    expect(run(judgeConfigOf({ endpointTol: 0.25, angleTolDeg: 60 })).grade).toBe('perfect');
    expect(run(judgeConfigOf({ endpointTol: 0.1, angleTolDeg: 60 })).grade).toBe('miss');
  });
});
