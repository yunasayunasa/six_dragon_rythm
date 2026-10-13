import type { CaseData, Condition, ConfrontationDef, HotspotDef } from './types';

/** 事件の進み具合（持っている証拠・記録・手がかり）。表示や演出は持たない。 */
export class CaseState {
  readonly evidence: string[] = [];
  readonly clues: string[] = [];
  readonly flags = new Set<string>();
  /** 見た台本（調べる場所の id、または id#変化の番号） */
  readonly seen = new Set<string>();
  /** 尋問で間違えられる残り回数（事件全体で共通） */
  talismans: number;

  constructor(readonly data: CaseData) {
    this.talismans = data.talismans;
  }

  give(id: string): boolean {
    if (this.data.evidence.some((e) => e.id === id)) {
      if (this.evidence.includes(id)) return false;
      this.evidence.push(id);
      return true;
    }
    if (this.data.clues.some((c) => c.id === id)) {
      if (this.clues.includes(id)) return false;
      this.clues.push(id);
      return true;
    }
    throw new Error(`証拠・手がかりがありません: ${id}`);
  }

  check(c: Condition): boolean {
    return (
      (c.evidence ?? []).every((e) => this.evidence.includes(e) || this.clues.includes(e)) &&
      (c.flags ?? []).every((f) => this.flags.has(f)) &&
      (c.notFlags ?? []).every((f) => !this.flags.has(f))
    );
  }

  goal(): string | null {
    return this.data.goals.find((g) => this.check(g.when))?.text ?? null;
  }

  /**
   * 調べる場所で今流れる台本。fresh は「今の段階でまだ見ていない内容がある」か（印の表示に使う）。
   * 見終わったら markPlayed(key) を呼ぶ。
   */
  resolveHotspot(h: HotspotDef): { script: string; key: string; fresh: boolean } {
    const i = h.variants?.findIndex((v) => this.check(v.when)) ?? -1;
    if (i >= 0) {
      const v = h.variants![i];
      const key = `${h.id}#${i}`;
      const fresh = !this.seen.has(key);
      return { script: !fresh && v.again ? v.again : v.script, key, fresh };
    }
    const fresh = !this.seen.has(h.id);
    return { script: !fresh && h.again ? h.again : h.script, key: h.id, fresh };
  }

  markPlayed(key: string): void {
    this.seen.add(key);
  }
}

/** まとめる：2つの手がかりを選んだ結果（順番は問わない）。つながらなければ null */
export function evaluateLogic(data: CaseData, a: string, b: string) {
  return data.logic.pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a)) ?? null;
}

export type PresentResult = 'correct' | 'wrong';

/**
 * 尋問の状態。証言の切り替え・揺さぶりで増える証言・証拠をぶつけた結果・信頼（ライフ）を管理する。
 * 信頼は事件全体で共通なので、開始時の残りと最大値を受け取る。
 */
export class Confrontation {
  index = 0;
  talismans: number;
  /** 見えている証言（statements の番号） */
  visible: number[] = [];
  readonly pressed = new Set<number>();

  constructor(
    readonly def: ConfrontationDef,
    /** この尋問を始めたときの残り（尽きたらここからやり直す） */
    readonly start: number,
    readonly max: number,
  ) {
    this.talismans = start;
    this.resetStatements();
  }

  private resetStatements(): void {
    this.visible = this.def.statements.map((s, i) => (s.hidden ? -1 : i)).filter((i) => i >= 0);
    this.index = 0;
    this.pressed.clear();
  }

  /** 今の証言の statements 上の番号 */
  get number(): number {
    return this.visible[this.index];
  }

  get statement() {
    return this.def.statements[this.number];
  }

  next(): void {
    this.index = (this.index + 1) % this.visible.length;
  }

  prev(): void {
    this.index = (this.index - 1 + this.visible.length) % this.visible.length;
  }

  /** 揺さぶる。隠れた証言が出てきたらその番号を返す */
  press(): number | null {
    this.pressed.add(this.number);
    const r = this.statement.reveals;
    if (r === undefined || this.visible.includes(r)) return null;
    this.visible = [...this.visible, r].sort((x, y) => x - y);
    return r;
  }

  present(id: string): PresentResult {
    if (this.statement.contradiction?.includes(id)) return 'correct';
    this.talismans = Math.max(0, this.talismans - 1);
    return 'wrong';
  }

  get lost(): boolean {
    return this.talismans <= 0;
  }

  /** 信頼が尽きたら、この尋問を始めたときの残りに戻して証言を最初から（満タンには戻らない） */
  reset(): void {
    this.talismans = this.start;
    this.resetStatements();
  }
}
