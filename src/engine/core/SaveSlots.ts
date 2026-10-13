import type { Store } from './Store';

/** セーブ1つ分。中身（data）はジャンルが決める。エンジンは中身を知らない */
export interface SaveEntry<T = unknown> {
  /** どの話のセーブか（ゲームが決める識別子） */
  game: string;
  savedAt: number;
  /** 一覧に出す見出し（例: 第一話 夕凪の空港と消えた灯晶） */
  title: string;
  /** 一覧に出す補足（例: 今の目的） */
  detail: string;
  data: T;
}

/**
 * セーブの置き場所。0番はオートセーブ、1番から手動セーブ。
 * 端末に保存できない環境では、保存されないだけで動き続ける。
 */
export class SaveSlots {
  constructor(private store: Store, readonly manual = 3) {}

  get count(): number {
    return this.manual + 1;
  }

  read<T = unknown>(slot: number): SaveEntry<T> | null {
    return this.store.get<SaveEntry<T> | null>(`save:${slot}`, null);
  }

  write(slot: number, entry: SaveEntry): void {
    this.store.set(`save:${slot}`, entry);
  }

  list(): Array<SaveEntry | null> {
    return Array.from({ length: this.count }, (_, i) => this.read(i));
  }

  get any(): boolean {
    return this.list().some(Boolean);
  }

  static label(slot: number): string {
    return slot === 0 ? 'オート' : `${slot}`;
  }
}
