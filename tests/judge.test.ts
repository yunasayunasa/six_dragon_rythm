import { describe, expect, it } from 'vitest';
import { StrokeJudge, judgeStroke, shapeMatches, timingGrade, type ExpectedStroke, type TimedPt } from '../src/genres/rhythm/Judge';

/** 左から右への横線 */
const horizontal: ExpectedStroke = {
  points: [
    { x: 0.2, y: 0.5 },
    { x: 0.5, y: 0.5 },
    { x: 0.8, y: 0.5 },
  ],
  startTime: 10,
};
const drawLine = (x0: number, y0: number, x1: number, y1: number, t0: number): TimedPt[] => [
  { x: x0, y: y0, t: t0 },
  { x: (x0 + x1) / 2, y: (y0 + y1) / 2, t: t0 + 0.2 },
  { x: x1, y: y1, t: t0 + 0.4 },
];

describe('timingGrade', () => {
  it('±60ms は Perfect、±120ms は Good、それ以外は Miss（境界を含む）', () => {
    expect(timingGrade(0)).toBe('perfect');
    expect(timingGrade(0.06)).toBe('perfect');
    expect(timingGrade(-0.06)).toBe('perfect');
    expect(timingGrade(0.061)).toBe('good');
    expect(timingGrade(-0.12)).toBe('good');
    expect(timingGrade(0.121)).toBe('miss');
  });
});

describe('shapeMatches', () => {
  it('始点・終点・向きが合っていれば合格', () => {
    expect(shapeMatches(horizontal.points, drawLine(0.25, 0.52, 0.75, 0.48, 0))).toBe(true);
  });
  it('逆向きは不合格', () => {
    expect(shapeMatches(horizontal.points, drawLine(0.8, 0.5, 0.2, 0.5, 0))).toBe(false);
  });
  it('始点が遠いと不合格', () => {
    expect(shapeMatches(horizontal.points, drawLine(0.2, 0.9, 0.8, 0.5, 0))).toBe(false);
  });
  it('終点が遠いと不合格', () => {
    expect(shapeMatches(horizontal.points, drawLine(0.2, 0.5, 0.5, 0.5, 0))).toBe(false);
  });
  it('許容は設定で変えられる', () => {
    const slightlyOff = drawLine(0.2, 0.5, 0.8, 0.75, 0); // 終点が 0.25 ずれ、角度 約22度
    expect(shapeMatches(horizontal.points, slightlyOff, { ...cfg(), endpointTol: 0.1 })).toBe(false);
    expect(shapeMatches(horizontal.points, slightlyOff, { ...cfg(), endpointTol: 0.3 })).toBe(true);
  });
  it('短い画（点）は向きを見ない', () => {
    const dot = [
      { x: 0.5, y: 0.5 },
      { x: 0.51, y: 0.5 },
    ];
    expect(shapeMatches(dot, [{ x: 0.5, y: 0.52 }, { x: 0.5, y: 0.5 }])).toBe(true);
  });
  it('空の入力は不合格', () => {
    expect(shapeMatches(horizontal.points, [])).toBe(false);
  });
});

function cfg() {
  return { perfectSec: 0.06, goodSec: 0.12, endpointTol: 0.25, angleTolDeg: 60, minDirLength: 0.06 };
}

describe('judgeStroke', () => {
  it('形が合い時刻が近ければ Perfect', () => {
    const r = judgeStroke(0, horizontal, drawLine(0.2, 0.5, 0.8, 0.5, 10.03));
    expect(r.grade).toBe('perfect');
    expect(r.startDelta).toBeCloseTo(0.03);
  });
  it('時刻が遅ければ Good / Miss', () => {
    expect(judgeStroke(0, horizontal, drawLine(0.2, 0.5, 0.8, 0.5, 10.1)).grade).toBe('good');
    const late = judgeStroke(0, horizontal, drawLine(0.2, 0.5, 0.8, 0.5, 10.2));
    expect(late.grade).toBe('miss');
    expect(late.shapeOk).toBe(true);
  });
  it('形が不合格なら時刻が完璧でも Miss', () => {
    const r = judgeStroke(0, horizontal, drawLine(0.8, 0.5, 0.2, 0.5, 10));
    expect(r.timingGrade).toBe('perfect');
    expect(r.shapeOk).toBe(false);
    expect(r.grade).toBe('miss');
  });
  it('何も書かれていなければ Miss', () => {
    expect(judgeStroke(2, horizontal, []).startDelta).toBeNull();
  });
});

describe('StrokeJudge（書き順）', () => {
  const vertical: ExpectedStroke = {
    points: [
      { x: 0.5, y: 0.1 },
      { x: 0.5, y: 0.9 },
    ],
    startTime: 11,
  };
  it('書き順どおりに順に判定する', () => {
    const j = new StrokeJudge([horizontal, vertical]);
    expect(j.submit(drawLine(0.2, 0.5, 0.8, 0.5, 10))?.grade).toBe('perfect');
    expect(j.index).toBe(1);
    expect(j.submit(drawLine(0.5, 0.1, 0.5, 0.9, 11.05))?.grade).toBe('perfect');
    expect(j.finished).toBe(true);
    expect(j.submit(drawLine(0, 0, 1, 1, 12))).toBeNull();
  });
  it('書き順が違うと期待する画と比べて Miss になる（縦を先に書いた）', () => {
    const j = new StrokeJudge([horizontal, vertical]);
    expect(j.submit(drawLine(0.5, 0.1, 0.5, 0.9, 10))?.grade).toBe('miss');
    expect(j.index).toBe(1);
  });
  it('時間切れの画は expire で Miss になって進む', () => {
    const j = new StrokeJudge([horizontal, vertical]);
    expect(j.expire(10.1)).toHaveLength(0);
    const out = j.expire(10.13);
    expect(out).toHaveLength(1);
    expect(out[0].startDelta).toBeNull();
    expect(j.index).toBe(1);
    expect(j.expire(100)).toHaveLength(1);
    expect(j.finished).toBe(true);
    expect(j.results.map((r) => r.grade)).toEqual(['miss', 'miss']);
  });
});
