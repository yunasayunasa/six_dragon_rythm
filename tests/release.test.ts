import { describe, expect, it } from 'vitest';
import { EPISODES, isReleased, releaseLabel, releaseTime, RELEASES } from '../src/game/episodes';

describe('月1回の更新（公開日）', () => {
  const ep2 = EPISODES.find((e) => e.id === 'case02')!;

  it('公開日の日本時間0時ちょうどから遊べる', () => {
    const t = releaseTime(ep2.release!);
    expect(isReleased(ep2, t - 1)).toBe(false);
    expect(isReleased(ep2, t)).toBe(true);
    // 日本時間0時＝前日の15時（UTC）
    expect(new Date(t).toISOString()).toBe('2026-11-30T15:00:00.000Z');
  });

  it('第一話は公開日が無く、いつでも遊べる', () => {
    expect(isReleased(EPISODES[0], 0)).toBe(true);
  });

  it('公開日は話の順に並んでいて、日付として読める', () => {
    const times = EPISODES.filter((e) => e.release).map((e) => releaseTime(e.release!));
    expect(times.every((t) => Number.isFinite(t))).toBe(true);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(Object.keys(RELEASES).length).toBe(times.length);
  });

  it('一覧の文は「12月1日 公開」の形', () => {
    expect(releaseLabel(ep2)).toBe('12月1日 公開');
  });
});
