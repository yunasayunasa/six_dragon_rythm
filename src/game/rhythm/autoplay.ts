import type { Pt } from '../../genres/rhythm/Judge';
import type { RhythmSectionDef } from '../../genres/rhythm/RhythmMode';

/**
 * デバッグ用の自動プレイの計画（純粋ロジック）。書き返しの各画について、
 * 手本どおりの点列を「ペンを下ろす → 動かす → 離す」の出来事にして、時刻つきで並べる。
 * 実際の入力経路に流す部分（PointerEvent の送出）は呼び出し側が担当する。
 */
export interface PenEvent {
  kind: 'down' | 'move' | 'up';
  /** 曲の頭からの秒 */
  at: number;
  /** 0..1 */
  x: number;
  y: number;
}

export interface AutoplayOptions {
  /** 1画を書く長さの上限（秒） */
  maxDrawSec?: number;
  /** 手本の画の長さに対する割合 */
  drawRatio?: number;
}

export function planAutoplay(
  sections: readonly RhythmSectionDef[],
  strokePointsOf: (char: string) => readonly (readonly Pt[])[],
  opts: AutoplayOptions = {},
): PenEvent[] {
  const maxDraw = opts.maxDrawSec ?? 0.6;
  const ratio = opts.drawRatio ?? 0.8;
  const out: PenEvent[] = [];
  for (const sec of sections) {
    if (sec.phase !== 'write') continue;
    const pts = strokePointsOf(sec.char);
    for (const st of sec.strokes) {
      const line = pts[st.index];
      if (!line || line.length === 0) continue;
      const dur = Math.min(maxDraw, st.durSec * ratio);
      const n = line.length;
      line.forEach((p, i) => {
        const at = st.sec + (n > 1 ? (i / (n - 1)) * dur : 0);
        out.push({ kind: i === 0 ? 'down' : i === n - 1 ? 'up' : 'move', at, x: p.x, y: p.y });
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** 計画を時刻順に取り出す */
export class PenPlayer {
  private i = 0;
  constructor(private readonly plan: readonly PenEvent[]) {}

  /** now（秒）までに来た出来事のうち、まだ渡していない分 */
  due(now: number): PenEvent[] {
    const out: PenEvent[] = [];
    while (this.i < this.plan.length && this.plan[this.i].at <= now) out.push(this.plan[this.i++]);
    return out;
  }

  get finished(): boolean {
    return this.i >= this.plan.length;
  }
}
