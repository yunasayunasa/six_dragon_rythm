import { describe, expect, it } from 'vitest';
import { PenPlayer, planAutoplay } from '../src/game/rhythm/autoplay';
import { buildChart } from '../src/game/rhythm/chart';
import { isRunning, nextScreen, type Screen, type ScreenEvent } from '../src/game/rhythm/screens';
import { getKanjiStrokes } from '../src/game/rhythm/strokes';
import { PointerTrail } from '../src/engine/core/PointerTrail';
import { RhythmMode, type RhythmSectionDef } from '../src/genres/rhythm/RhythmMode';
import { accuracyOf, rankOf, rankOfAccuracy } from '../src/genres/rhythm/rank';

describe('rank', () => {
  it('精度は Perfect 1.0・Good 0.6・Miss 0 の平均', () => {
    expect(accuracyOf({ perfect: 10, good: 0, miss: 0 })).toBe(1);
    expect(accuracyOf({ perfect: 0, good: 10, miss: 0 })).toBeCloseTo(0.6);
    expect(accuracyOf({ perfect: 5, good: 0, miss: 5 })).toBeCloseTo(0.5);
    expect(accuracyOf({ perfect: 0, good: 0, miss: 0 })).toBe(0);
  });
  it('境界ちょうどは上のランク', () => {
    expect(rankOfAccuracy(0.9)).toBe('S');
    expect(rankOfAccuracy(0.8999)).toBe('A');
    expect(rankOfAccuracy(0.75)).toBe('A');
    expect(rankOfAccuracy(0.5)).toBe('B');
    expect(rankOfAccuracy(0.4999)).toBe('C');
    expect(rankOfAccuracy(0)).toBe('C');
  });
  it('全 Perfect は S、全 Miss は C、何も無ければ C', () => {
    expect(rankOf({ perfect: 40, good: 0, miss: 0 })).toBe('S');
    expect(rankOf({ perfect: 0, good: 0, miss: 40 })).toBe('C');
    expect(rankOf({ perfect: 0, good: 0, miss: 0 })).toBe('C');
  });
  it('Good ばかりでも A（0.6 → B）になる境目を持つ', () => {
    expect(rankOf({ perfect: 0, good: 40, miss: 0 })).toBe('B');
    expect(rankOf({ perfect: 20, good: 20, miss: 0 })).toBe('A');
  });
});

describe('screens', () => {
  const run = (start: Screen, evs: ScreenEvent[]): Screen => evs.reduce(nextScreen, start);

  it('通常の流れ: title → howto → play → finale → result', () => {
    expect(
      run('title', [{ type: 'tap' }, { type: 'tap' }, { type: 'phase', phase: 'example' }, { type: 'phase', phase: 'finale' }, { type: 'phase', phase: 'done' }]),
    ).toBe('finale');
    expect(run('finale', [{ type: 'sealDone' }])).toBe('result');
  });
  it('終幕は done になっても落款が済むまで result にならない', () => {
    expect(nextScreen('finale', { type: 'phase', phase: 'done' })).toBe('finale');
    expect(nextScreen('finale', { type: 'tap' })).toBe('finale');
  });
  it('大書きを通らずに終わったら play から直接 result', () => {
    expect(nextScreen('play', { type: 'phase', phase: 'done' })).toBe('result');
  });
  it('プレイ中の段階の変化では画面は変わらない', () => {
    for (const phase of ['intro', 'example', 'write'] as const) expect(nextScreen('play', { type: 'phase', phase })).toBe('play');
  });
  it('result からもう一度 / タイトルへ', () => {
    expect(nextScreen('result', { type: 'again' })).toBe('play');
    expect(nextScreen('result', { type: 'title' })).toBe('title');
    expect(nextScreen('result', { type: 'tap' })).toBe('result');
  });
  it('関係のない出来事は無視する', () => {
    expect(nextScreen('title', { type: 'again' })).toBe('title');
    expect(nextScreen('howto', { type: 'sealDone' })).toBe('howto');
    expect(nextScreen('play', { type: 'tap' })).toBe('play');
  });
  it('title / result から設定を開き、閉じると開いた元の画面へ戻る', () => {
    expect(run('title', [{ type: 'settings' }])).toBe('settings');
    expect(run('title', [{ type: 'settings' }, { type: 'back', to: 'title' }])).toBe('title');
    expect(run('result', [{ type: 'settings' }, { type: 'back', to: 'result' }])).toBe('result');
  });
  it('設定中は他の出来事を無視し、プレイ中や遊び方からは設定を開けない', () => {
    expect(nextScreen('settings', { type: 'tap' })).toBe('settings');
    expect(nextScreen('settings', { type: 'again' })).toBe('settings');
    expect(nextScreen('settings', { type: 'phase', phase: 'done' })).toBe('settings');
    for (const s of ['howto', 'play', 'finale'] as const) expect(nextScreen(s, { type: 'settings' })).toBe(s);
  });
  it('曲が動いているのは play と finale だけ', () => {
    const all: Screen[] = ['title', 'howto', 'play', 'finale', 'result', 'settings'];
    expect(all.filter(isRunning)).toEqual(['play', 'finale']);
  });
});

describe('autoplay', () => {
  const pointsOf = (c: string) => (getKanjiStrokes(c)?.strokes ?? []).map((s) => s.points.map(([x, y]) => ({ x, y })));
  const chart = buildChart((c) => pointsOf(c).length);
  const sections: RhythmSectionDef[] = chart.map((s) => ({
    char: s.char,
    phase: s.phase,
    startSec: s.startSec,
    endSec: s.endSec,
    finale: s.finale,
    strokes: s.strokes.map((st) => ({ index: st.index, sec: st.sec, durSec: st.durSec })),
  }));

  it('書き返しの画ごとに down → move… → up が並び、時刻順', () => {
    const plan = planAutoplay(sections, pointsOf);
    const writes = sections.filter((s) => s.phase === 'write').reduce((n, s) => n + s.strokes.length, 0);
    expect(plan.filter((e) => e.kind === 'down')).toHaveLength(writes);
    expect(plan.filter((e) => e.kind === 'up')).toHaveLength(writes);
    for (let i = 1; i < plan.length; i++) expect(plan[i].at).toBeGreaterThanOrEqual(plan[i - 1].at);
  });
  it('お手本の区間には出来事を作らない', () => {
    const plan = planAutoplay(sections.filter((s) => s.phase === 'example'), pointsOf);
    expect(plan).toHaveLength(0);
  });
  it('PenPlayer は時刻までの分を一度だけ返す', () => {
    const p = new PenPlayer([
      { kind: 'down', at: 1, x: 0, y: 0 },
      { kind: 'up', at: 2, x: 1, y: 1 },
    ]);
    expect(p.due(0.5)).toHaveLength(0);
    expect(p.due(1)).toHaveLength(1);
    expect(p.due(1.5)).toHaveLength(0);
    expect(p.due(9)).toHaveLength(1);
    expect(p.finished).toBe(true);
  });
  it('実際の入力経路（PointerTrail → RhythmMode）に流すと、フレーム刻みの遅れがあっても全部 Perfect で通る', () => {
    const plan = planAutoplay(sections, pointsOf);
    const mode = new RhythmMode(sections, pointsOf);
    const trail = new PointerTrail();
    const player = new PenPlayer(plan);
    // 30fps 相当で時計を進める。出来事は届いた時点の時刻（フレームの頭）で記録される
    const end = sections[sections.length - 1].endSec + 1;
    for (let t = 0; t <= end; t += 1 / 30) {
      mode.setPen(trail.active ? trail.points[0].t : null);
      mode.update(t);
      for (const e of player.due(t)) {
        if (e.kind === 'down') trail.begin(e.x, e.y, t);
        else if (e.kind === 'move') trail.add(e.x, e.y, t);
        else {
          const s = trail.end(e.x, e.y, t);
          if (s) mode.submitStroke(s);
          trail.clear();
        }
      }
    }
    expect(mode.phase).toBe('done');
    const sc = mode.score;
    expect(sc.miss).toBe(0);
    expect(sc.good).toBe(0);
    expect(sc.perfect).toBeGreaterThan(30);
    expect(rankOf(sc)).toBe('S');
  });
});
