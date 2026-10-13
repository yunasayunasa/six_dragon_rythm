import { beatToSec, type BeatConfig } from '../../engine/audio/beatMath';
import type { ExpectedStroke, Pt } from '../../genres/rhythm/Judge';

/**
 * 譜面。98 BPM・4/4・1小節目が 0.20 秒（拍 0）。小節番号は 1 始まり。
 * 8字は「お手本2小節 → 書き返し2小節」を 18 小節目から2小節ずつ重ねて並べる。
 *   字k（k=0..7）: お手本 18+2k〜19+2k、書き返し 20+2k〜21+2k（最後の光は 48〜49）
 * 大書きの「天」は 67〜74 小節（お手本なし。プレイヤーがそのまま書く）。1画 = 2小節で、
 *   画 i（0〜3）は 67+2i 小節目の頭の拍から始まる。
 * 字の区間は 1画 = 1拍（書き返し小節の頭の拍から）。
 * 2小節（8拍）に画数が収まらない字は、次の拍へそのまま続ける（section.overflow が true になる。
 * 続きは次の区間にはみ出すので、字を足すときは区間の空きを確認すること）。
 */
export const RHYTHM_BEAT_CONFIG: Pick<BeatConfig, 'bpm' | 'offset' | 'beatsPerBar'> = { bpm: 98, offset: 0.2, beatsPerBar: 4 };

export const CHARS = ['大', '山', '刃', '火', '月', '王', '羽', '光'] as const;
export const FINALE_CHAR = '天';

export const FIRST_CHAR_BAR = 18;
export const BARS_PER_PHASE = 2;
export const FINALE_START_BAR = 67;
export const FINALE_BARS = 8;
/** 終幕は 1画 = 2小節 */
export const FINALE_STROKE_BARS = 2;

export type Phase = 'example' | 'write';

export interface ChartStroke {
  /** 何画目か（0 始まり） */
  index: number;
  beat: number;
  /** 曲の頭からの秒 */
  sec: number;
  /** この画に割り当てた長さ（秒）。お手本の筆の動きの長さ */
  durSec: number;
}

export interface ChartSection {
  char: string;
  phase: Phase;
  /** 区間の最初の小節（1 始まり） */
  startBar: number;
  /** 区間の最後の小節（含む） */
  endBar: number;
  strokes: ChartStroke[];
  /** 区間の頭の秒 */
  startSec: number;
  /** 区間の終わりの秒（次の小節の頭。含まない） */
  endSec: number;
  /** 大書きの終幕 */
  finale: boolean;
  /** 画が区間の拍数に収まらず、区間の外の拍にはみ出している */
  overflow: boolean;
}

/** 小節（1 始まり）の頭の拍 */
export function barToBeat(bar: number, cfg: Pick<BeatConfig, 'beatsPerBar'> = RHYTHM_BEAT_CONFIG): number {
  return (bar - 1) * cfg.beatsPerBar;
}

/** 小節（1 始まり）の頭の秒 */
export function barToSec(bar: number, cfg: Pick<BeatConfig, 'bpm' | 'offset' | 'beatsPerBar'> = RHYTHM_BEAT_CONFIG): number {
  return beatToSec(barToBeat(bar, cfg), cfg);
}

export interface SectionOptions {
  /** 画の間隔の拍数（既定 1）。1画に割り当てる長さもこれと同じ */
  strokeBeats?: number;
  finale?: boolean;
}

/** startBar から始まる区間で、strokeCount 画を並べる（既定は1画1拍） */
export function makeSection(
  char: string,
  phase: Phase,
  startBar: number,
  bars: number,
  strokeCount: number,
  cfg: Pick<BeatConfig, 'bpm' | 'offset' | 'beatsPerBar'> = RHYTHM_BEAT_CONFIG,
  opts: SectionOptions = {},
): ChartSection {
  const step = opts.strokeBeats ?? 1;
  const first = barToBeat(startBar, cfg);
  const strokes: ChartStroke[] = [];
  for (let i = 0; i < strokeCount; i++) {
    const beat = first + i * step;
    strokes.push({ index: i, beat, sec: beatToSec(beat, cfg), durSec: (step * 60) / cfg.bpm });
  }
  return {
    char,
    phase,
    startBar,
    endBar: startBar + bars - 1,
    strokes,
    startSec: barToSec(startBar, cfg),
    endSec: barToSec(startBar + bars, cfg),
    finale: opts.finale ?? false,
    overflow: strokeCount > 0 && (strokeCount - 1) * step >= bars * cfg.beatsPerBar,
  };
}

/**
 * 全区間を時刻順に作る。画数は呼び出し側が渡す（字のデータに依存しないため）。
 */
export function buildChart(
  strokeCountOf: (char: string) => number,
  cfg: Pick<BeatConfig, 'bpm' | 'offset' | 'beatsPerBar'> = RHYTHM_BEAT_CONFIG,
): ChartSection[] {
  const out: ChartSection[] = [];
  CHARS.forEach((ch, k) => {
    const exampleBar = FIRST_CHAR_BAR + BARS_PER_PHASE * 2 * k;
    const n = strokeCountOf(ch);
    out.push(makeSection(ch, 'example', exampleBar, BARS_PER_PHASE, n, cfg));
    out.push(makeSection(ch, 'write', exampleBar + BARS_PER_PHASE, BARS_PER_PHASE, n, cfg));
  });
  out.push(
    makeSection(FINALE_CHAR, 'write', FINALE_START_BAR, FINALE_BARS, strokeCountOf(FINALE_CHAR), cfg, {
      strokeBeats: FINALE_STROKE_BARS * cfg.beatsPerBar,
      finale: true,
    }),
  );
  return out;
}

/** 区間と字の画の点列から、判定に渡す「期待する画」を作る */
export function expectedStrokes(section: ChartSection, strokePoints: readonly (readonly Pt[])[]): ExpectedStroke[] {
  return section.strokes.map((s) => ({ points: strokePoints[s.index] ?? [], startTime: s.sec }));
}
