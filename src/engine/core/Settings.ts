import type { Store } from './Store';

/** 遊ぶ人が変えられる設定（どのジャンルでも共通のもの） */
export interface SettingValues {
  /** 音楽の音量（0〜1。1 が作者の決めた大きさ） */
  bgm: number;
  /** 効果音の音量（0〜1） */
  se: number;
  /** 声の音量（0〜1） */
  voice: number;
  /** 文字の速さ（1〜5） */
  textSpeed: number;
  /** 早送りで、まだ読んでいない会話も飛ばすか */
  skipUnread: boolean;
}

export const DEFAULT_SETTINGS: SettingValues = { bgm: 1, se: 1, voice: 1, textSpeed: 3, skipUnread: false };

/** 文字の速さ（1〜5）→ 1秒あたりの文字数 */
export const TEXT_SPEEDS = [0, 18, 28, 42, 64, 400];
export const TEXT_SPEED_LABELS = ['', 'とても遅い', '遅い', '普通', '速い', '一瞬'];

/** 設定を端末に残し、変わったら知らせる */
export class Settings {
  readonly values: SettingValues;
  readonly onChange = new Set<(v: SettingValues) => void>();

  constructor(private store: Store) {
    this.values = { ...DEFAULT_SETTINGS, ...store.get<Partial<SettingValues>>('settings', {}) };
  }

  set<K extends keyof SettingValues>(key: K, value: SettingValues[K]): void {
    this.values[key] = value;
    this.store.set('settings', this.values);
    this.onChange.forEach((f) => f(this.values));
  }
}
