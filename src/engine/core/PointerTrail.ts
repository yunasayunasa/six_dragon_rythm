/** なぞった軌跡の記録（純粋ロジック）。時刻の基準は呼び出し側が決める（例: AudioContext.currentTime の秒）。 */
export interface TracePoint {
  x: number;
  y: number;
  /** 秒 */
  t: number;
}

export class PointerTrail {
  private current: TracePoint[] | null = null;
  private done: TracePoint[][] = [];

  /** なぞっている最中か */
  get active(): boolean {
    return this.current !== null;
  }

  /** 確定した画（end 済み）。読み取り専用 */
  get strokes(): readonly (readonly TracePoint[])[] {
    return this.done;
  }

  /** 記録中の点（なぞっていなければ空） */
  get points(): readonly TracePoint[] {
    return this.current ?? [];
  }

  /** 新しい画を始める。なぞっている途中なら、その画を先に確定する */
  begin(x: number, y: number, t: number): void {
    if (this.current) this.end();
    this.current = [{ x, y, t }];
  }

  /** 点を足す。なぞっていないときは無視。座標も時刻も直前と同じ点は足さない */
  add(x: number, y: number, t: number): void {
    if (!this.current) return;
    const last = this.current[this.current.length - 1];
    if (last.x === x && last.y === y && last.t === t) return;
    this.current.push({ x, y, t });
  }

  /** 画を確定して返す（なぞっていなければ null）。終点を渡すとそれも足す */
  end(x?: number, y?: number, t?: number): TracePoint[] | null {
    if (!this.current) return null;
    if (x !== undefined && y !== undefined && t !== undefined) this.add(x, y, t);
    const stroke = this.current;
    this.current = null;
    this.done.push(stroke);
    return stroke;
  }

  /** 記録を全部消す */
  clear(): void {
    this.current = null;
    this.done = [];
  }
}
