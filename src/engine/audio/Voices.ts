import { ReadMarks } from '../core/ReadMarks';

/**
 * セリフの声（フルボイス）の置き場所。
 * 声は話し手と文章から作った印（既読と同じ ReadMarks.key）を名前にした音声ファイル。
 * どのセリフに声があるかは、フォルダの index.json（tools/voices.mjs が書き出す）で分かる。
 */
export class Voices {
  private base = '';
  private keys = new Set<string>();

  /** 声のフォルダを読み込む（無ければ声なしで遊べる） */
  async load(folderUrl: string): Promise<void> {
    this.base = folderUrl.endsWith('/') ? folderUrl : `${folderUrl}/`;
    this.keys.clear();
    try {
      const r = await fetch(`${this.base}index.json`);
      if (!r.ok) return;
      const data = (await r.json()) as { keys?: string[] };
      for (const k of data.keys ?? []) this.keys.add(k);
    } catch {
      // 声が無い話
    }
  }

  /** このセリフの声のURL。声が無ければ null */
  url(speaker: string | null, text: string): string | null {
    if (!speaker) return null;
    const key = ReadMarks.key(speaker, text);
    return this.keys.has(key) ? `${this.base}${key}.mp3` : null;
  }
}
