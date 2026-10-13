import { describe, expect, it } from 'vitest';
import { CaseState, Confrontation, evaluateLogic } from '../src/genres/investigation/CaseState';
import { CASE01 } from '../src/game/case01/case';

describe('事件の進行状態', () => {
  it('証拠と手がかりを区別して受け取り、二重には増えない', () => {
    const s = new CaseState(CASE01);
    expect(s.give('footprints')).toBe(true);
    expect(s.give('footprints')).toBe(false);
    expect(s.give('no_crumbs')).toBe(true);
    expect(s.evidence).toEqual(['footprints']);
    expect(s.clues).toEqual(['no_crumbs']);
    expect(() => s.give('unknown')).toThrow();
  });
  it('目的表示が進行に合わせて変わる', () => {
    const s = new CaseState(CASE01);
    expect(s.goal()).toBe('桟橋を調べて、皆の話を聞く');
    s.give('map');
    s.flags.add('met_galleon');
    expect(s.goal()).toContain('ワムデュス');
    s.flags.add('c1_done');
    s.give('no_crumbs');
    s.give('wrapper_spot');
    expect(s.goal()).toContain('まとめる');
  });
  it('調べる場所は、今の段階で見ていない内容があるときだけ「新しい」になる', () => {
    const s = new CaseState(CASE01);
    const puddle = CASE01.hotspots.find((h) => h.id === 'puddle')!;
    let r = s.resolveHotspot(puddle);
    expect(r.fresh).toBe(true);
    s.markPlayed(r.key);
    r = s.resolveHotspot(puddle);
    expect(r.fresh).toBe(false);
    expect(r.script).toBe(puddle.again);
    // 話が進むと、同じ場所に新しい内容が出てくる
    s.flags.add('l2');
    r = s.resolveHotspot(puddle);
    expect(r.fresh).toBe(true);
    expect(r.script).toBe(puddle.variants![0].script);
    s.markPlayed(r.key);
    expect(s.resolveHotspot(puddle).fresh).toBe(false);
    expect(s.resolveHotspot(puddle).script).toBe(puddle.variants![0].again);
  });
  it('まとめるは順番に関係なく正解の組を判定する', () => {
    expect(evaluateLogic(CASE01, 'wrapper_spot', 'no_crumbs')?.flag).toBe('l1');
    expect(evaluateLogic(CASE01, 'skyfish', 'same_culprit')?.flag).toBe('l4');
    expect(evaluateLogic(CASE01, 'no_crumbs', 'bell')).toBeNull();
  });
});

describe('尋問', () => {
  const def = CASE01.confrontations.wamdus_crystal;
  it('矛盾する証言に正しい証拠なら正解、違えば信頼が減る', () => {
    const c = new Confrontation(def, 5, 5);
    expect(c.present('footprints')).toBe('wrong');
    expect(c.talismans).toBe(4);
    c.next();
    c.next();
    expect(c.present('footprints')).toBe('correct');
    expect(c.talismans).toBe(4);
  });
  it('信頼は前の尋問の残りから始まり、尽きたらこの尋問を始めたときの残りに戻して最初から', () => {
    const c = new Confrontation(def, 2, 5);
    c.prev();
    expect(c.index).toBe(2);
    c.index = 0;
    c.present('footprints');
    c.present('footprints');
    expect(c.lost).toBe(true);
    c.reset();
    expect(c.talismans).toBe(2);
    expect(c.index).toBe(0);
  });
  it('揺さぶると隠れた証言が出てくる', () => {
    const c = new Confrontation(CASE01.confrontations.wamdus_snack, 5, 5);
    expect(c.visible).toEqual([0, 1, 2]);
    c.index = 1;
    expect(c.press()).toBeNull();
    c.index = 0;
    expect(c.press()).toBe(3);
    expect(c.visible).toEqual([0, 1, 2, 3]);
    expect(c.press()).toBeNull();
    c.index = c.visible.indexOf(3);
    expect(c.present('honey_puddle')).toBe('correct');
    c.reset();
    expect(c.visible).toEqual([0, 1, 2]);
  });
});
