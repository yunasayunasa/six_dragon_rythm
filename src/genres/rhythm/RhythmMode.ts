import {
  DEFAULT_JUDGE_CONFIG,
  StrokeJudge,
  type ExpectedStroke,
  type JudgeConfig,
  type Pt,
  type StrokeResult,
  type TimedPt,
} from './Judge';
import { Score } from './Score';

/**
 * なぞり書きの進行（純粋ロジック）。時刻は外から update(nowSec) で渡す（曲の頭からの秒）。
 * 区間（お手本 / 書き返し）の並びに沿って、いまの段階・お手本の筆の進み・期待する画を持ち、
 * プレイヤーの画を Judge で判定して、書かれなかった画は Miss にして先へ進める。
 * Miss しても進行は止まらない。字のデータにも譜面にも依存しない（区間は呼び出し側が渡す）。
 */
export type RhythmPhase = 'intro' | 'example' | 'write' | 'finale' | 'done';

export interface RhythmStrokeDef {
  index: number;
  /** 書き出す（お手本ならなぞり始める）時刻（秒） */
  sec: number;
  /** お手本の筆がこの画をなぞる長さ（秒） */
  durSec: number;
}

export interface RhythmSectionDef {
  char: string;
  phase: 'example' | 'write';
  startSec: number;
  /** 含まない */
  endSec: number;
  /** 大書きの終幕（write の区間にだけ付ける） */
  finale?: boolean;
  strokes: readonly RhythmStrokeDef[];
}

export interface JudgeEvent {
  sectionIndex: number;
  section: RhythmSectionDef;
  result: StrokeResult;
  /** 書かれた画。書かれずに Miss になったときは null */
  drawn: readonly TimedPt[] | null;
}

export interface RhythmHandlers {
  onJudge?: (e: JudgeEvent) => void;
  /** 区間が始まったとき */
  onSection?: (index: number, section: RhythmSectionDef) => void;
  /** 段階が変わったとき */
  onPhase?: (phase: RhythmPhase, prev: RhythmPhase) => void;
}

export interface RhythmModeOptions {
  /** 判定の設定（形の許容も含む）。省略した項目は DEFAULT_JUDGE_CONFIG */
  judge?: Partial<JudgeConfig>;
  score?: Score;
  on?: RhythmHandlers;
}

export interface ExampleStatus {
  /** いま筆が動いている画（動いていなければ null） */
  active: number | null;
  /** active の進み 0..1 */
  progress: number;
  /** なぞり終わった画の数 */
  completed: number;
}

export class RhythmMode {
  readonly score: Score;
  private cfg: JudgeConfig;
  private readonly handlers: RhythmHandlers;
  /** まだ終わっていない最初の区間 */
  private cursor = 0;
  private judge: StrokeJudge | null = null;
  private judgeSection = -1;
  private penAt: number | null = null;
  private now = Number.NEGATIVE_INFINITY;
  private _phase: RhythmPhase = 'intro';

  constructor(
    readonly sections: readonly RhythmSectionDef[],
    private readonly strokePointsOf: (char: string) => readonly (readonly Pt[])[],
    opts: RhythmModeOptions = {},
  ) {
    this.cfg = { ...DEFAULT_JUDGE_CONFIG, ...opts.judge };
    this.score = opts.score ?? new Score();
    this.handlers = opts.on ?? {};
  }

  get phase(): RhythmPhase {
    return this._phase;
  }

  get time(): number {
    return this.now;
  }

  /** いまの区間の番号（区間の外なら -1） */
  get sectionIndex(): number {
    const s = this.sections[this.cursor];
    return s && this.now >= s.startSec ? this.cursor : -1;
  }

  get section(): RhythmSectionDef | null {
    return this.sectionIndex < 0 ? null : this.sections[this.cursor];
  }

  /** 書き返しで次に期待している画の番号（書き返し中でない、または全部終わったら -1） */
  get nextStroke(): number {
    return this.judge && !this.judge.finished ? this.judge.index : -1;
  }

  /** 判定の設定を変える。すでに始まった区間には効かず、次の区間から使う */
  setJudgeConfig(patch: Partial<JudgeConfig>): void {
    this.cfg = { ...this.cfg, ...patch };
  }

  get judgeConfig(): Readonly<JudgeConfig> {
    return this.cfg;
  }

  /** お手本の筆の進み。お手本の区間でなければ null */
  exampleStatus(): ExampleStatus | null {
    const s = this.section;
    if (!s || s.phase !== 'example') return null;
    let completed = 0;
    let active: number | null = null;
    let progress = 0;
    for (const st of s.strokes) {
      if (this.now >= st.sec + st.durSec) completed++;
      else if (this.now >= st.sec && active === null) {
        active = st.index;
        progress = st.durSec > 0 ? (this.now - st.sec) / st.durSec : 1;
      }
    }
    return { active, progress, completed };
  }

  /**
   * ペンが下りている間は、その画のぶんの Miss 判定を待つ（書き出しは許容内でも、書き終わるのは遅れるため）。
   * なぞり始めの時刻を渡す。離したら null（submitStroke でも離したことになる）。
   */
  setPen(downAt: number | null): void {
    this.penAt = downAt;
  }

  update(nowSec: number): void {
    this.now = nowSec;
    const n = this.sections.length;
    while (this.cursor < n && nowSec >= this.sections[this.cursor].endSec) {
      this.finish(this.cursor);
      this.cursor++;
    }
    if (this.cursor < n && nowSec >= this.sections[this.cursor].startSec) {
      this.enter(this.cursor);
      if (this.judge) {
        const limit = this.penAt === null ? nowSec : Math.min(nowSec, this.penAt);
        for (const r of this.judge.expire(limit)) this.emit(this.cursor, r, null);
      }
    }
    this.setPhase(this.computePhase());
  }

  /** 書き終えた1画を判定する。書き返し中でなければ null（無視する） */
  submitStroke(points: readonly TimedPt[]): JudgeEvent | null {
    this.penAt = null;
    if (!this.judge || this.judgeSection !== this.cursor) return null;
    const r = this.judge.submit(points);
    return r ? this.emit(this.cursor, r, points) : null;
  }

  private computePhase(): RhythmPhase {
    if (this.cursor >= this.sections.length) return 'done';
    const s = this.section;
    if (!s) return 'intro';
    return s.finale ? 'finale' : s.phase;
  }

  private setPhase(next: RhythmPhase): void {
    if (next === this._phase) return;
    const prev = this._phase;
    this._phase = next;
    this.handlers.onPhase?.(next, prev);
  }

  private enter(index: number): void {
    if (this.judgeSection === index) return;
    this.judgeSection = index;
    const s = this.sections[index];
    this.judge = s.phase === 'write' ? new StrokeJudge(this.expectedOf(s), this.cfg) : null;
    this.handlers.onSection?.(index, s);
  }

  /** 区間を閉じる。書かれなかった画は Miss にする */
  private finish(index: number): void {
    this.enter(index);
    if (this.judge) for (const r of this.judge.expire(Number.POSITIVE_INFINITY)) this.emit(index, r, null);
    this.judge = null;
  }

  private expectedOf(s: RhythmSectionDef): ExpectedStroke[] {
    const pts = this.strokePointsOf(s.char);
    return s.strokes.map((st) => ({ points: pts[st.index] ?? [], startTime: st.sec }));
  }

  private emit(sectionIndex: number, result: StrokeResult, drawn: readonly TimedPt[] | null): JudgeEvent {
    const ev: JudgeEvent = { sectionIndex, section: this.sections[sectionIndex], result, drawn };
    this.score.apply(result.grade);
    this.handlers.onJudge?.(ev);
    return ev;
  }
}
