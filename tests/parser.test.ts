import { describe, expect, it } from 'vitest';
import { parseScript } from '../src/engine/script/parser';

describe('台本の読み取り', () => {
  it('名前・表情・セリフを読み取る', () => {
    const [c] = parseScript('ウィルナス（驚き）「なんだって！？」');
    expect(c).toEqual({ op: 'say', speaker: 'ウィルナス', expr: '驚き', text: 'なんだって！？', line: 1 });
  });
  it('表情なし・半角かっこも読める', () => {
    expect(parseScript('ルオー「はい」')[0]).toMatchObject({ speaker: 'ルオー', expr: null, text: 'はい' });
    expect(parseScript('ルオー(考え)「ふむ」')[0]).toMatchObject({ speaker: 'ルオー', expr: '考え' });
  });
  it('地の文はナレーション、／は改行', () => {
    expect(parseScript('空の港。／夕暮れ。')[0]).toMatchObject({ op: 'say', speaker: null, text: '空の港。\n夕暮れ。' });
  });
  it('命令は日本語名を英語名へそろえる', () => {
    expect(parseScript('@カメラ ワムデュス')[0]).toMatchObject({ op: 'cmd', name: 'cam', args: ['ワムデュス'] });
    expect(parseScript('＠待つ　0.5')[0]).toMatchObject({ op: 'cmd', name: 'wait', args: ['0.5'] });
    expect(parseScript('@対決')[0]).toMatchObject({ name: 'confront', args: [] });
  });
  it('空行・メモは無視し、行番号を保つ', () => {
    const cmds = parseScript('\n# メモ\n\n@揺れ 0.4\n');
    expect(cmds).toHaveLength(1);
    expect(cmds[0].line).toBe(4);
  });
});
