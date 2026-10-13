/**
 * 台本（シナリオ）テキストの読み取り。コードを書かずに会話と演出を並べられる形式。
 *
 *   # から始まる行はメモ（無視）
 *   名前（表情）「セリフ」     … 話す。表情は省略可。セリフ内の ／ は改行
 *   名前「セリフ」
 *   地の文                     … 「」が無い行はナレーション
 *   @命令 引数 引数            … 演出。例: @カメラ ワムデュス / @効果音 決定 / @待つ 0.5
 *
 * 命令名は日本語・英語どちらでも書ける（別名表 COMMAND_ALIASES）。
 */
export type ScriptCommand =
  | { op: 'say'; speaker: string | null; expr: string | null; text: string; line: number }
  | { op: 'cmd'; name: string; args: string[]; line: number };

export const COMMAND_ALIASES: Record<string, string> = {
  カメラ: 'cam',
  表情: 'face',
  跳ねる: 'hop',
  向き: 'turn',
  移動: 'move',
  登場: 'pop',
  退場: 'hide',
  効果音: 'se',
  音楽: 'bgm',
  揺れ: 'shake',
  叫び: 'shout',
  待つ: 'wait',
  見た目: 'look',
  証拠: 'give',
  記録: 'flag',
  きらめき: 'sparkle',
  暗転: 'fade',
  字幕: 'card',
  灯り: 'light',
  対決: 'confront',
  攻撃: 'attack',
  被弾: 'damage',
  事件解決: 'solve',
  会話を閉じる: 'hidetext',
  たたむ: 'flatten',
  組み立て: 'assemble',
  演出: 'cue',
  紙吹雪: 'confetti',
  ブレイク: 'break',
  遺体: 'corpse',
  配置: 'place',
  場所: 'area',
  つきつけ: 'challenge',
};

const SAY = /^([^「」（）()@#]+?)?\s*(?:[（(]([^）)]+)[）)])?\s*「([\s\S]*)」\s*$/;

export function parseScript(source: string): ScriptCommand[] {
  const out: ScriptCommand[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((raw, i) => {
    const line = raw.trim();
    const n = i + 1;
    if (!line || line.startsWith('#') || line.startsWith('＃')) return;
    if (line.startsWith('@') || line.startsWith('＠')) {
      const parts = line.slice(1).trim().split(/[\s　]+/).filter(Boolean);
      if (parts.length === 0) throw new Error(`${n}行目: 命令名がありません`);
      const [head, ...args] = parts;
      out.push({ op: 'cmd', name: COMMAND_ALIASES[head] ?? head, args, line: n });
      return;
    }
    const m = SAY.exec(line);
    if (m) {
      out.push({ op: 'say', speaker: m[1]?.trim() || null, expr: m[2]?.trim() || null, text: m[3].replace(/／/g, '\n'), line: n });
      return;
    }
    out.push({ op: 'say', speaker: null, expr: null, text: line.replace(/／/g, '\n'), line: n });
  });
  return out;
}
