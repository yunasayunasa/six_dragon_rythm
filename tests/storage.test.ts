import { beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../src/engine/core/Store';
import { SaveSlots } from '../src/engine/core/SaveSlots';
import { ReadMarks } from '../src/engine/core/ReadMarks';
import { Settings, DEFAULT_SETTINGS } from '../src/engine/core/Settings';

/** テスト用の localStorage（Node には無いので用意する） */
beforeEach(() => {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
});

describe('端末に残す記録', () => {
  it('名前空間ごとに分かれる', () => {
    new Store('a').set('x', 1);
    expect(new Store('a').get('x', 0)).toBe(1);
    expect(new Store('b').get('x', 0)).toBe(0);
  });
  it('保存できない環境でも止まらない', () => {
    (globalThis as { localStorage?: unknown }).localStorage = undefined;
    const s = new Store('a');
    expect(() => s.set('x', 1)).not.toThrow();
    expect(s.get('x', 5)).toBe(5);
  });
  it('セーブは0番がオート、1番から手動。空きは null', () => {
    const saves = new SaveSlots(new Store('g'), 3);
    expect(saves.count).toBe(4);
    expect(saves.any).toBe(false);
    saves.write(2, { game: 'case01', savedAt: 1, title: 't', detail: 'd', data: { v: 1 } });
    expect(saves.list().map(Boolean)).toEqual([false, false, true, false]);
    expect(saves.read(2)?.data).toEqual({ v: 1 });
    expect(SaveSlots.label(0)).toBe('オート');
  });
  it('既読の印は話し手と文章で決まる', () => {
    expect(ReadMarks.key('ルオー', 'こんにちは')).toBe(ReadMarks.key('ルオー', 'こんにちは'));
    expect(ReadMarks.key('ルオー', 'こんにちは')).not.toBe(ReadMarks.key('ガレヲン', 'こんにちは'));
    expect(ReadMarks.key(null, 'こんにちは')).not.toBe(ReadMarks.key('', 'こんにちは。'));
  });
  it('設定は既定値に、残した値を重ねる', () => {
    const store = new Store('g');
    store.set('settings', { bgm: 0.4 });
    const s = new Settings(store);
    expect(s.values).toEqual({ ...DEFAULT_SETTINGS, bgm: 0.4 });
    s.set('textSpeed', 5);
    expect(new Settings(store).values.textSpeed).toBe(5);
  });
});
