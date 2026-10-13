import { describe, expect, it } from 'vitest';
import { PointerTrail } from '../src/engine/core/PointerTrail';

describe('PointerTrail', () => {
  it('begin → add → end で時刻つきの点列が残る', () => {
    const tr = new PointerTrail();
    tr.begin(0.1, 0.2, 1);
    tr.add(0.2, 0.3, 1.1);
    const s = tr.end(0.3, 0.4, 1.2);
    expect(s).toEqual([
      { x: 0.1, y: 0.2, t: 1 },
      { x: 0.2, y: 0.3, t: 1.1 },
      { x: 0.3, y: 0.4, t: 1.2 },
    ]);
    expect(tr.strokes).toHaveLength(1);
    expect(tr.active).toBe(false);
  });
  it('なぞっていないときの add / end は無視される', () => {
    const tr = new PointerTrail();
    tr.add(0, 0, 0);
    expect(tr.end()).toBeNull();
    expect(tr.strokes).toHaveLength(0);
  });
  it('同じ点は重ねない', () => {
    const tr = new PointerTrail();
    tr.begin(0, 0, 0);
    tr.add(0, 0, 0);
    expect(tr.points).toHaveLength(1);
  });
  it('途中でもう一度 begin すると前の画が確定する', () => {
    const tr = new PointerTrail();
    tr.begin(0, 0, 0);
    tr.add(1, 1, 0.1);
    tr.begin(0.5, 0.5, 0.2);
    expect(tr.strokes).toHaveLength(1);
    expect(tr.points).toHaveLength(1);
    expect(tr.active).toBe(true);
  });
  it('clear で全部消える', () => {
    const tr = new PointerTrail();
    tr.begin(0, 0, 0);
    tr.end();
    tr.begin(0, 0, 1);
    tr.clear();
    expect(tr.strokes).toHaveLength(0);
    expect(tr.active).toBe(false);
  });
});
