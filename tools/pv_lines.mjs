/**
 * 総合PV・各話の更新予告で使う、新しいセリフ（ElevenLabs Eleven v4）。作った音声は pv/lines/<id>.mp3。
 * 予告の語りはウィルナス（アニメの次回予告のように主人公が読む）。声はゲームと同じ（tools/voices.json）。
 *
 *   node tools/pv_lines.mjs             作っていない・文章が変わった行だけ作る
 *   node tools/pv_lines.mjs --check     Gemini に書き起こさせて読み間違い・繰り返しを確かめ、問題の行は作り直す（3回まで）
 *   node tools/pv_lines.mjs --retake id …  指定した行を作り直す
 *
 * 準備: npm i --no-save ffmpeg-static（頭と終わりの無音を削る）
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'pv/lines');
const STATE = path.join(ROOT, 'tools/pv_lines.json');
const MODEL = 'eleven_v4';
/** ゲームのウィルナスの声の説明（tools/voices.mjs の CAST_VOICES.ウィルナス.style） */
const BASE_STYLE = 'confident, bold, heroic';

/** id → [声の主, 画面の字幕, 読ませる文（かなで読みを固定）, 話し方のタグ] */
export const LINES = {
  // 総合PV
  o_kikaku: ['ウィルナス', '5ヶ月連続更新企画、始動である！', 'ごかげつ、れんぞく、こうしんきかく！　始動である！', 'shouting, announcing proudly, full of energy'],
  o_monthly: ['ウィルナス', '全五話、毎月一話ずつ届けるのである！', 'ぜんごわ！　まいつき、いちわずつ、届けるのである！', 'excited, building energy'],
  // 第二話
  e2_place: ['ウィルナス', '次なる舞台は、雲の上の市場である！', 'つぎなる舞台は、くものうえの、いちばである！', 'excited, adventurous'],
  e2_title: ['ウィルナス', '第二話、雲市場と二つの灯晶！', 'だいにわ！　くもいちばと、ふたつの、とうしょう！', 'shouting, title call, triumphant'],
  // 第三話
  e3_place: ['ウィルナス', '霧に沈む職人の町で、老職人が死んだ。', 'きりに沈む、職人の町で……ろうしょくにんが、死んだ。', 'serious, low, ominous'],
  e3_title: ['ウィルナス', '第三話、霧の工房と鐘の鳴らない夜！', 'だいさんわ！　きりのこうぼうと、かねの鳴らない夜！', 'shouting, title call, determined'],
  // 第四話
  e4_place: ['ウィルナス', '嵐の監獄船で、囚人が殺された。', 'あらしの、かんごくせんで……しゅうじんが、ころされた。', 'serious, tense, low'],
  e4_who: ['ウィルナス', '最後の面会人は――ルオー。', 'さいごの、めんかいにんは……ルオー。', 'shocked, quiet'],
  e4_title: ['ウィルナス', '第四話、嵐の監獄船とルオーの罪！', 'だいよんわ！　あらしの、かんごくせんと、ルオーのつみ！', 'shouting, title call, fierce'],
  // 第五話（最終話）
  e5_place: ['ウィルナス', '星祭りの夜。空じゅうの灯りが、消えた。', 'ほしまつりの夜。そらじゅうの、あかりが……消えた。', 'grave, slow, dramatic'],
  e5_dawn: ['ウィルナス', '夜明けまでに、すべてを覆してみせる！', '夜明けまでに、すべてを、くつがえしてみせる！', 'determined, fierce, rising'],
  e5_title: ['ウィルナス', '最終話、暁の空に、六竜の逆転！', 'さいしゅうわ！　あかつきの空に、ろくりゅうの、ぎゃくてん！', 'shouting, epic title call, triumphant'],
};

function env(name) {
  const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const v = t.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, 'm'))?.[1];
  if (!v) throw new Error(`.env に ${name} がありません`);
  return v.replace(/^["']|["']$/g, '');
}

async function el(url, body) {
  for (let i = 0; ; i++) {
    const r = await fetch(`https://api.elevenlabs.io${url}`, { method: 'POST', headers: { 'xi-api-key': env('ELEVENLABS_API_KEY'), 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if ((r.status === 429 || r.status >= 500) && i < 4) {
      await new Promise((ok) => setTimeout(ok, 2000 * 2 ** i));
      continue;
    }
    throw new Error(`${url} → ${r.status} ${(await r.text()).slice(0, 300)}`);
  }
}

const voices = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/voices.json'), 'utf8')).voices;
const load = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { lines: {} });
const save = (s) => fs.writeFileSync(STATE, `${JSON.stringify(s, null, 2)}\n`);
const sig = (id) => JSON.stringify([MODEL, ...LINES[id]]);
const file = (id) => path.join(OUT, `${id}.mp3`);

/** 頭と終わりの無音を削る（字幕・映像と声の頭をそろえるため） */
async function trim(mp3) {
  const ffmpeg = (await import('ffmpeg-static')).default;
  const tmp = path.join(OUT, '_tmp.mp3');
  fs.writeFileSync(tmp, mp3);
  const filter = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse';
  const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-i', tmp, '-af', filter, '-b:a', '160k', '-f', 'mp3', '-'], { maxBuffer: 1 << 28 });
  fs.rmSync(tmp);
  if (r.status) throw new Error(r.stderr.toString());
  return r.stdout;
}

async function make(state, id) {
  const [who, , text, tag] = LINES[id];
  const v = voices[who];
  if (!v?.id || v.released) throw new Error(`${who} の声がありません（tools/voices.json）`);
  const mp3 = await el(`/v1/text-to-speech/${v.id}?output_format=mp3_44100_128`, { text: `[${BASE_STYLE}, ${tag}] ${text}`, model_id: MODEL });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(file(id), await trim(mp3));
  state.lines[id] = sig(id);
  save(state);
  console.log(`作った: ${id}「${LINES[id][1]}」`);
}

async function check(ids) {
  const parts = [
    {
      text:
        'ゲームPVのセリフ音声を順に渡します。それぞれ台本どおりに読めているか厳しく確かめてください。問題: 読み間違い、言葉の繰り返し、言いよどみ、抜け、余計な言葉（英語の指示を読み上げる等）、途中で途切れる。' +
        'アクセントや調子は問題にしない。JSON の配列だけを返す: [{"n":番号,"ok":true/false,"heard":"聞こえたとおりひらがなで","problem":""}]',
    },
  ];
  ids.forEach((id, k) => {
    parts.push({ text: `${k + 1}番 台本:「${LINES[id][1]}」（読み: ${LINES[id][2]}）` });
    parts.push({ inline_data: { mime_type: 'audio/mpeg', data: fs.readFileSync(file(id)).toString('base64') } });
  });
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent', {
    method: 'POST',
    headers: { 'x-goog-api-key': env('GEMINI_API_KEY'), 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }),
  });
  const j = await r.json();
  const out = JSON.parse(j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') || '[]');
  const bad = [];
  for (const x of out) {
    const id = ids[x.n - 1];
    if (!id || x.ok) continue;
    bad.push(id);
    console.log(`× ${id}「${LINES[id][1]}」 聞こえた: ${x.heard} / ${x.problem}`);
  }
  return bad;
}

const state = load();
const args = process.argv.slice(2);
const retake = args.includes('--retake') ? args.filter((a) => LINES[a]) : [];
const todo = Object.keys(LINES).filter((id) => retake.includes(id) || state.lines[id] !== sig(id) || !fs.existsSync(file(id)));
console.log(`作る: ${todo.length} 行`);
for (const id of todo) await make(state, id);
if (args.includes('--check')) {
  let ids = Object.keys(LINES);
  for (let round = 0; ; round++) {
    const bad = await check(ids);
    console.log(`問題あり: ${bad.length} / ${ids.length}`);
    if (!bad.length || round === 3) break;
    for (const id of bad) await make(state, id);
    ids = bad;
  }
}
