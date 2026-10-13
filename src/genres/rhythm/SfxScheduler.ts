import { songToCtx, type SongClock } from '../../engine/audio/beatMath';
import type { RhythmSectionDef } from './RhythmMode';

/**
 * 効果音の予約（純粋ロジック）。譜面（区間）から「曲の何秒に何を鳴らすか」を出し、
 * 曲と ctx 時計の対応（SongClock）で AudioContext の時刻に直して、少し先の分だけ渡す。
 * 音を鳴らす側は、渡された when を source.start(when) に使う（フレーム数や setTimeout に頼らない）。
 *   stroke … お手本の各画の書き出し（拍の頭）に「トン」
 *   count  … 書き返しの直前の小節の 2・3・4 拍目に「3・2・1」
 */
export type SfxKind = 'stroke' | 'count';

export interface PlannedSfx {
  /** 曲の頭からの秒 */
  sec: number;
  kind: SfxKind;
  /** stroke: 何画目か / count: 表示する数（3, 2, 1） */
  value: number;
}

export interface SfxEvent extends PlannedSfx {
  /** AudioContext の時刻 */
  when: number;
}

/** 書き返しの前に数える拍の数（直前の小節の 2・3・4 拍目 = 3 拍） */
export const COUNT_IN_BEATS = 3;

/** 区間の並びから、鳴らす予定を時刻順に作る。beatSec は 1 拍の秒 */
export function planSfx(sections: readonly RhythmSectionDef[], beatSec: number): PlannedSfx[] {
  const out: PlannedSfx[] = [];
  for (const s of sections) {
    if (s.phase === 'example') {
      for (const st of s.strokes) out.push({ sec: st.sec, kind: 'stroke', value: st.index });
    } else {
      for (let n = COUNT_IN_BEATS; n >= 1; n--) out.push({ sec: s.startSec - n * beatSec, kind: 'count', value: n });
    }
  }
  return out.sort((a, b) => a.sec - b.sec);
}

/** 予定を ctx 時刻に直す（範囲の絞り込みなし） */
export function toEvents(plan: readonly PlannedSfx[], clock: SongClock): SfxEvent[] {
  return plan.map((p) => ({ ...p, when: songToCtx(p.sec, clock) }));
}

export class SfxScheduler {
  private readonly plan: readonly PlannedSfx[];
  private next = 0;

  /**
   * lookahead: 何秒先まで予約するか / lateTolerance: これ以上遅れた予定は鳴らさず捨てる（止まっていた間の分など）
   */
  constructor(
    plan: readonly PlannedSfx[],
    private readonly clock: SongClock,
    private readonly lookahead = 0.2,
    private readonly lateTolerance = 0.1,
  ) {
    this.plan = [...plan].sort((a, b) => a.sec - b.sec);
  }

  /** ctxNow から lookahead 先までに鳴らす時刻が来る予定のうち、まだ渡していない分。同じ予定は二度と返さない */
  due(ctxNow: number): SfxEvent[] {
    const out: SfxEvent[] = [];
    const horizon = ctxNow + this.lookahead;
    while (this.next < this.plan.length) {
      const p = this.plan[this.next];
      const when = songToCtx(p.sec, this.clock);
      if (when > horizon) break;
      this.next++;
      // 曲の再生位置より前の予定（途中から始めたとき）や、遅れすぎた予定は鳴らさない
      if (p.sec < this.clock.offsetSec - 1e-6 || when < ctxNow - this.lateTolerance) continue;
      out.push({ ...p, when });
    }
    return out;
  }
}

export interface CountdownView {
  /** 表示する数（3, 2, 1） */
  value: number;
  /** その拍の中での進み 0..1 */
  frac: number;
}

/**
 * 曲の時刻 t に表示するカウント。書き返し区間の直前の 3 拍（前の小節の 2・3・4 拍目）に 3→2→1。
 * 書き返しが始まる拍（次の小節の頭）では null。
 */
export function countdownAt(t: number, sections: readonly RhythmSectionDef[], beatSec: number): CountdownView | null {
  for (const s of sections) {
    if (s.phase !== 'write') continue;
    const from = s.startSec - COUNT_IN_BEATS * beatSec;
    if (t < from) return null; // 区間は時刻順なので、これ以降の区間も対象外
    if (t < s.startSec) {
      const k = (t - from) / beatSec;
      const i = Math.min(COUNT_IN_BEATS - 1, Math.floor(k));
      return { value: COUNT_IN_BEATS - i, frac: k - i };
    }
  }
  return null;
}
