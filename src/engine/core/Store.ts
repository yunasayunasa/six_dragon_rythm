/**
 * 端末に残す小さな記録（localStorage）。チュートリアルを見たか・設定・セーブなどに使う。
 * 名前空間でゲームごとに分ける。保存できない環境（プライベートブラウズなど）では、記録しないだけで動き続ける。
 */
export class Store {
  constructor(readonly namespace: string) {}

  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`${this.namespace}:${key}`);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }

  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(`${this.namespace}:${key}`, JSON.stringify(value));
    } catch {
      // 保存できない環境では記録しない
    }
  }
}
