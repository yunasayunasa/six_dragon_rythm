/**
 * 書き出しの合図の輪（osu! の approach circle）。純粋ロジック。
 * 書き出しの時刻の 1 拍前に最大の大きさで現れ、時刻ちょうどに小さな点の大きさになる。
 */
export interface ApproachStyle {
  /** 現れる大きさ（盤面の一辺に対する割合の半径） */
  maxRadius: number;
  /** 書き出しの瞬間の大きさ */
  minRadius: number;
  /** 書き出しの何秒前から見せるか（= 1 拍） */
  leadSec: number;
  /** 書き出しを過ぎてから消えるまでの秒 */
  lingerSec: number;
}

export const APPROACH_STYLE_DEFAULT = { maxRadius: 0.16, minRadius: 0.03, lingerSec: 0.15 } as const;

export function approachStyle(beatSec: number): ApproachStyle {
  return { ...APPROACH_STYLE_DEFAULT, leadSec: beatSec };
}

/** 書き出しまで untilStart 秒のときの半径（lead 以上で最大、0 以下で最小、間は直線） */
export function approachRadius(untilStart: number, style: Pick<ApproachStyle, 'maxRadius' | 'minRadius' | 'leadSec'>): number {
  const k = Math.max(0, Math.min(1, untilStart / style.leadSec));
  return style.minRadius + (style.maxRadius - style.minRadius) * k;
}

export interface ApproachView {
  radius: number;
  /** 輪の濃さ 0..1（近づくほど濃く、書き出しのあとは消える） */
  alpha: number;
}

/** 見せる時間の外なら null */
export function approachView(untilStart: number, style: ApproachStyle): ApproachView | null {
  if (untilStart > style.leadSec || untilStart < -style.lingerSec) return null;
  const radius = approachRadius(untilStart, style);
  if (untilStart >= 0) return { radius, alpha: 0.35 + 0.65 * (1 - untilStart / style.leadSec) };
  return { radius, alpha: 1 - -untilStart / style.lingerSec };
}
