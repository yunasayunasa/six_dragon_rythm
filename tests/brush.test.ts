import { describe, expect, it } from 'vitest';
import { partialPolyline } from '../src/engine/render/BrushCanvas';

const line = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0 },
  { x: 0.5, y: 0.5 },
];

describe('partialPolyline', () => {
  it('0 なら始点だけ、1 なら全部', () => {
    expect(partialPolyline(line, 0)).toEqual([{ x: 0, y: 0 }]);
    expect(partialPolyline(line, 1)).toEqual(line);
  });
  it('長さの割合で途中を補間する', () => {
    expect(partialPolyline(line, 0.25)).toEqual([
      { x: 0, y: 0 },
      { x: 0.25, y: 0 },
    ]);
    const p = partialPolyline(line, 0.75);
    expect(p).toHaveLength(3);
    expect(p[2].x).toBeCloseTo(0.5);
    expect(p[2].y).toBeCloseTo(0.25);
  });
  it('範囲外の値や空の入力でも壊れない', () => {
    expect(partialPolyline([], 0.5)).toEqual([]);
    expect(partialPolyline(line, 5)).toEqual(line);
    expect(partialPolyline([{ x: 1, y: 1 }], 0.5)).toEqual([{ x: 1, y: 1 }]);
  });
});
