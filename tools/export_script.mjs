/**
 * 台本を、口調の監修用に Excel（.xlsx）の一覧へ書き出す開発用ツール。
 *
 * 使い方:
 *   npm i --no-save exceljs
 *   node tools/export_script.mjs <出力先.xlsx>
 *
 * 事件データ（src/game/case01/case.ts）を Vite 経由で読み込み、
 * 導入 → 調べる／話す → まとめる → 尋問 → 結末 の順にセリフを1行ずつ並べる。
 * 「@」の演出命令は、証拠の入手・尋問の開始など流れが分かるものだけ（演出）行として残す。
 */
import { createServer } from 'vite';
import ExcelJS from 'exceljs';

const out = process.argv[2];
if (!out) {
  console.error('使い方: node tools/export_script.mjs <出力先.xlsx>');
  process.exit(1);
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { CASE01: data } = await server.ssrLoadModule('/src/game/case01/case.ts');
const { parseScript } = await server.ssrLoadModule('/src/engine/script/parser.ts');
await server.close();

const nameOf = (s) => data.cast.find((c) => c.name === s || c.id === s)?.name ?? s;
const colorOf = (name) => data.cast.find((c) => c.name === name)?.color;
const itemName = (id) => (data.evidence.find((e) => e.id === id) ?? data.clues.find((c) => c.id === id))?.name ?? id;
const FLAGS = {
  c1_done: '尋問①のあと',
  c2_done: '尋問②のあと',
  l1: 'まとめる①のあと',
  l2: 'まとめる②のあと',
  l3: 'まとめる③のあと',
  l4: 'まとめる④のあと',
  met_galleon: 'ガレヲンと話したあと',
  met_fediel: 'フェディエルと話したあと',
};
const when = (w) => {
  const parts = [...(w.flags ?? []).map((f) => FLAGS[f] ?? f), ...(w.evidence ?? []).map((e) => `「${itemName(e)}」を持っている`)];
  return parts.length ? parts.join('・') : 'いつでも';
};

/** @type {Array<{scene:string, cond:string, speaker:string, expr:string, text:string, kind:'say'|'narration'|'cmd'|'statement'}>} */
const rows = [];
function addScript(scene, cond, src) {
  for (const c of parseScript(src)) {
    if (c.op === 'say') {
      rows.push({ scene, cond, speaker: c.speaker ? nameOf(c.speaker) : '（地の文）', expr: c.expr ?? '', text: c.text, kind: c.speaker ? 'say' : 'narration' });
      continue;
    }
    const note =
      c.name === 'give' ? `（「${c.args.map(itemName).join('」「')}」を手に入れる）`
      : c.name === 'confront' ? `（尋問「${data.confrontations[c.args[0]].title}」が始まる）`
      : c.name === 'solve' ? '（事件解決 → 結末へ）'
      : c.name === 'shout' ? `（叫び「${c.args.join(' ')}」）`
      : null;
    if (note) rows.push({ scene, cond, speaker: '（演出）', expr: '', text: note, kind: 'cmd' });
  }
}

addScript('導入', 'ゲーム開始', data.intro);
for (const h of data.hotspots) {
  const scene = `${h.actor ? '話す' : '調べる'}：${h.label.replace(/に話しかける$/, '')}`;
  addScript(scene, '1回目', h.script);
  if (h.again) addScript(scene, '2回目から', h.again);
  // variants は上から順に判定されるので、表では条件がゆるい（後ろの）ものから並べる
  for (const v of [...(h.variants ?? [])].reverse()) {
    addScript(scene, when(v.when), v.script);
    if (v.again) addScript(scene, `${when(v.when)}（2回目から）`, v.again);
  }
}
data.logic.pairs.forEach((p, i) => addScript(`まとめる${'①②③④⑤'[i]}`, `「${itemName(p.a)}」＋「${itemName(p.b)}」`, p.script));
addScript('まとめる（失敗）', 'つながらない組み合わせ', data.logic.miss);
addScript('まとめる（済み）', 'もうまとめた組み合わせ', data.logic.done);
Object.values(data.confrontations).forEach((c, i) => {
  const scene = `尋問${'①②③④⑤⑥'[i]}「${c.title}」`;
  addScript(scene, '開始', c.intro);
  c.statements.forEach((s, n) => {
    const cond = s.hidden ? `証言${n + 1}（揺さぶると出てくる）` : `証言${n + 1}`;
    rows.push({ scene, cond, speaker: nameOf(c.witness), expr: '', text: s.text, kind: 'statement' });
    addScript(scene, `証言${n + 1}を揺さぶる`, s.press);
  });
  addScript(scene, '正しい証拠をつきつけた', c.success);
  addScript(scene, '間違えた', c.wrong);
  c.hints?.forEach((h, n) => addScript(scene, `間違えたあとのヒント（${n + 1}回目${n === c.hints.length - 1 ? '以降' : ''}）`, h));
  addScript(scene, '「信」が尽きた', c.fail);
});
addScript('結末', '事件解決', data.ending);

// ---------- Excel ----------
const FONT = 'Yu Gothic';
const wb = new ExcelJS.Workbook();
wb.creator = 'PaperStage';

const guide = wb.addWorksheet('使い方');
guide.columns = [{ width: 22 }, { width: 90 }];
const g = (a, b, opts = {}) => {
  const r = guide.addRow([a, b]);
  r.font = { name: FONT, size: 11, bold: !!opts.bold };
  r.alignment = { wrapText: true, vertical: 'top' };
  if (opts.fill) r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
  return r;
};
g(`${data.chapter}　台本一覧（口調の監修用）`, '', { bold: true });
g('', '');
g('記入する列', '「台本」シートの「監修メモ」列（黄色）だけに書いてください。ほかの列は台本から自動で作っています。', { bold: false });
g('記入例', '「〜ぞえ」が2回続くので、後ろを「〜かえ？」に', { fill: 'FFFFF2CC' });
g('（演出）の行', '証拠の入手や尋問の開始など、流れを分かりやすくするための行です。セリフではありません。');
g('（地の文）の行', 'ナレーション（話し手のいない文）です。');
g('「／」', '台本上の改行です。');
g('', '');
g('口調メモ（現在の設定）', '', { bold: true });
const VOICES = [
  ['全員', '口癖・語尾は使いすぎない（目安はそのキャラの台詞の3割前後）。普通の言い切りと混ぜ、見せ場や決め台詞に残す'],
  ['ウィルナス', '豪放磊落。一人称「鼎」。二字熟語を重ねる（喝采喝采！ 重畳重畳！）。「〜やがるであろう！」など少し妙な日本語'],
  ['ルオー', '落ち着いているが少し不遜。敬語は使わない。一人称「私」。「〜なのだよ」「〜したまえ」'],
  ['ガレヲン', '穏やかでたおやか。一人称「私」。「熟語（ていねいな言い足し）」という話し方。いつも目を閉じている（寝ているわけではない）'],
  ['ワムデュス', 'のんびりマイペースで子供っぽい。一人称「ワム」。ときどき「〜なので。」（毎回は付けない）。ときどき本質を突く'],
  ['フェディエル', '他人の恋バナに興味津々。一人称「此方」、二人称「其方」。「〜かえ？」「〜ぞえ」「〜ぞよ」などやや古風（「〜じゃ」は使わない）。興味のないことにはとことん無関心'],
];
for (const [n, v] of VOICES) g(n, v);

const ws = wb.addWorksheet('台本', { views: [{ state: 'frozen', ySplit: 1 }] });
ws.columns = [
  { header: 'No', key: 'no', width: 6 },
  { header: '場面', key: 'scene', width: 26 },
  { header: '条件（いつ流れるか）', key: 'cond', width: 30 },
  { header: '話者', key: 'speaker', width: 13 },
  { header: '表情', key: 'expr', width: 9 },
  { header: 'セリフ', key: 'text', width: 70 },
  { header: '監修メモ', key: 'memo', width: 40 },
];
const header = ws.getRow(1);
header.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } };
header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5A4336' } };
header.alignment = { vertical: 'middle' };
header.getCell('memo').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB8860B' } };

let prevScene = '';
rows.forEach((r, i) => {
  const row = ws.addRow({ no: i + 1, scene: r.scene, cond: r.cond, speaker: r.speaker, expr: r.expr, text: r.text.replace(/\n/g, '／'), memo: '' });
  row.font = { name: FONT, size: 10.5 };
  row.alignment = { wrapText: true, vertical: 'top' };
  // 場面の切れ目に線を引く
  if (r.scene !== prevScene && i > 0) row.eachCell({ includeEmpty: true }, (c) => (c.border = { top: { style: 'thin', color: { argb: 'FF8A7A6A' } } }));
  prevScene = r.scene;
  const color = colorOf(r.speaker);
  if (color) row.getCell('speaker').font = { name: FONT, size: 10.5, bold: true, color: { argb: `FF${color.slice(1).toUpperCase()}` } };
  if (r.kind === 'cmd' || r.kind === 'narration') row.getCell('text').font = { name: FONT, size: 10.5, italic: r.kind === 'cmd', color: { argb: 'FF7A6A5A' } };
  if (r.kind === 'statement') row.getCell('text').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFE7FA' } };
  row.getCell('memo').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9E0' } };
});
ws.autoFilter = { from: 'A1', to: 'G1' };

await wb.xlsx.writeFile(out);
console.log('rows', rows.length, '→', out);
