/**
 * なぞり書きの判定（純粋ロジック・字のデータには依存しない）。
 * 画は書き順どおりに1つずつ判定する。書き出しの時刻で Perfect / Good、形が外れたら Miss。
 * 座標は 0..1 に正規化したもの、時刻は秒。
 */
export interface Pt {
  x: number;
  y: number;
}
export interface TimedPt extends Pt {
  t: number;
}
export interface ExpectedStroke {
  points: readonly Pt[];
  /** この画を書き出すべき時刻（秒） */
  startTime: number;
}
export type Grade = 'perfect' | 'good' | 'miss';

export interface JudgeConfig {
  /** Perfect の許容（秒） */
  perfectSec: number;
  /** Good の許容（秒） */
  goodSec: number;
  /** 始点・終点が手本からずれてよい距離 */
  endpointTol: number;
  /** 始点→終点の向きがずれてよい角度（度） */
  angleTolDeg: number;
  /** 手本の始点→終点がこれより短い画（点など）は向きを見ない */
  minDirLength: number;
}

export const DEFAULT_JUDGE_CONFIG: JudgeConfig = {
  perfectSec: 0.06,
  goodSec: 0.12,
  endpointTol: 0.25,
  angleTolDeg: 60,
  minDirLength: 0.06,
};

export interface StrokeResult {
  /** 何画目か（0 始まり） */
  index: number;
  /** 最終の判定。形が不合格なら miss */
  grade: Grade;
  /** 時刻だけで見た判定 */
  timingGrade: Grade;
  shapeOk: boolean;
  /** 書き出し - 手本の時刻（秒）。正なら遅い。何も書かれなかった画は null */
  startDelta: number | null;
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

export function timingGrade(deltaSec: number, cfg: JudgeConfig = DEFAULT_JUDGE_CONFIG): Grade {
  const d = Math.abs(deltaSec);
  // 浮動小数の誤差で境界ちょうどが外れないよう、わずかに余裕を持たせる
  if (d <= cfg.perfectSec + 1e-9) return 'perfect';
  if (d <= cfg.goodSec + 1e-9) return 'good';
  return 'miss';
}

/** 始点・終点・おおまかな向きが手本に合っているか */
export function shapeMatches(expected: readonly Pt[], drawn: readonly Pt[], cfg: JudgeConfig = DEFAULT_JUDGE_CONFIG): boolean {
  if (expected.length === 0 || drawn.length === 0) return false;
  const e0 = expected[0];
  const e1 = expected[expected.length - 1];
  const d0 = drawn[0];
  const d1 = drawn[drawn.length - 1];
  if (dist(e0, d0) > cfg.endpointTol || dist(e1, d1) > cfg.endpointTol) return false;
  const ev = { x: e1.x - e0.x, y: e1.y - e0.y };
  const elen = Math.hypot(ev.x, ev.y);
  if (elen < cfg.minDirLength) return true;
  const dv = { x: d1.x - d0.x, y: d1.y - d0.y };
  const dlen = Math.hypot(dv.x, dv.y);
  if (dlen === 0) return false;
  const cos = (ev.x * dv.x + ev.y * dv.y) / (elen * dlen);
  const angle = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  return angle <= cfg.angleTolDeg;
}

/** 1画ぶんの判定（書き順は見ない） */
export function judgeStroke(
  index: number,
  expected: ExpectedStroke,
  drawn: readonly TimedPt[],
  cfg: JudgeConfig = DEFAULT_JUDGE_CONFIG,
): StrokeResult {
  if (drawn.length === 0) return { index, grade: 'miss', timingGrade: 'miss', shapeOk: false, startDelta: null };
  const startDelta = drawn[0].t - expected.startTime;
  const tg = timingGrade(startDelta, cfg);
  const shapeOk = shapeMatches(expected.points, drawn, cfg);
  return { index, grade: shapeOk ? tg : 'miss', timingGrade: tg, shapeOk, startDelta };
}

/**
 * 1字ぶんの順次判定。書いた画は「いま期待している画」と比べ、合否にかかわらず次へ進む。
 * 手本の時刻から Good の許容を過ぎても書かれなかった画は expire() で Miss にして進める。
 */
export class StrokeJudge {
  private next = 0;
  readonly results: StrokeResult[] = [];

  constructor(
    private readonly expected: readonly ExpectedStroke[],
    private readonly cfg: JudgeConfig = DEFAULT_JUDGE_CONFIG,
  ) {}

  /** 次に期待している画の番号（全部終わったら expected.length） */
  get index(): number {
    return this.next;
  }

  get finished(): boolean {
    return this.next >= this.expected.length;
  }

  /** 書き終えた1画を判定する。もう期待する画が無ければ null */
  submit(drawn: readonly TimedPt[]): StrokeResult | null {
    if (this.finished) return null;
    const r = judgeStroke(this.next, this.expected[this.next], drawn, this.cfg);
    this.results.push(r);
    this.next++;
    return r;
  }

  /** now（秒）の時点で、許容を過ぎても書き出されなかった画を Miss にして進める。新しい結果を返す */
  expire(now: number): StrokeResult[] {
    const out: StrokeResult[] = [];
    while (!this.finished && now > this.expected[this.next].startTime + this.cfg.goodSec) {
      const r = judgeStroke(this.next, this.expected[this.next], [], this.cfg);
      this.results.push(r);
      out.push(r);
      this.next++;
    }
    return out;
  }
}
