import type { Store } from './Store';

/**
 * 読んだ会話の印（既読）。早送りで「読んだ会話だけ飛ばす」ために使う。
 * 話し手と文章から短い印を作って端末に残す（どの話・どのセーブでも共通）。
 */
export class ReadMarks {
  private marks: Set<string>;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private store: Store) {
    this.marks = new Set(store.get<string[]>('read', []));
  }

  /** 話し手と文章から印を作る（FNV-1a） */
  static key(speaker: string | null, text: string): string {
    let h = 0x811c9dc5;
    const s = `${speaker ?? ''}\u0000${text}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  has(key: string): boolean {
    return this.marks.has(key);
  }

  add(key: string): void {
    if (this.marks.has(key)) return;
    this.marks.add(key);
    // 1行ごとに書き込むと重いので、まとめて残す
    this.timer ??= setTimeout(() => {
      this.timer = null;
      this.store.set('read', [...this.marks]);
    }, 1000);
  }
}
