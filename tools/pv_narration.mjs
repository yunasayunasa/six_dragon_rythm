/**
 * PV のナレーションを作る（ElevenLabs Eleven v4）。作った音声は pv/narration/<id>.mp3。
 *
 *   node tools/pv_narration.mjs             作っていない・文章が変わった行だけ作る
 *   node tools/pv_narration.mjs --check     Gemini に書き起こさせて読み間違い・繰り返しを確かめ、問題の行は作り直す（3回まで）
 *
 * ナレーターの声は Voice Design で作り、ID は tools/pv_narration.json に残す。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'pv/narration');
const STATE = path.join(ROOT, 'tools/pv_narration.json');
const MODEL = 'eleven_v4';

/** id → [画面の字幕, 読ませる文（ひらがな等で読みを固定）, 話し方のタグ] */
export const NARRATION = {
  n1: ['雲海に浮かぶ、空の港――凪ノ桟橋。', 'うんかいに浮かぶ、そらの港。なぎのさんばし。', 'calm, cinematic narrator'],
  n2: ['最終便が帰る、その夕暮れ。', '最終便が帰る、その夕暮れ……', 'calm, cinematic narrator'],
  n3: ['港を照らす灯晶が――消えた。', '港を照らす灯晶が……消えた。', 'tense, dramatic'],
  n4: ['集うは、ひと癖ある竜たち。', 'つどうは、ひと癖ある竜たち。', 'intriguing, playful'],
  n5: ['調べろ。まとめろ。問いただせ。', 'しらべろ！　まとめろ！　問いただせ！', 'powerful, building intensity'],
  n6: ['嘘を見抜き、真実をつきつけろ！', '嘘を見抜き、真実をつきつけろ！', 'powerful, heroic, shouting'],
  n7: ['灯りは、帰ってくる人のために。', 'あかりは、帰ってくる人のために。', 'warm, gentle, emotional'],
  n8: ['〜活劇奇譚〜　逆転六竜', 'かつげききたん。ぎゃくてんろくりゅう！', 'epic, triumphant, title call'],
  n9: ['第一話、開幕。', '第一話、開幕！', 'confident, triumphant'],
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
    if (r.ok) return (r.headers.get('content-type') ?? '').includes('json') ? r.json() : Buffer.from(await r.arrayBuffer());
    if ((r.status === 429 || r.status >= 500) && i < 4) {
      await new Promise((ok) => setTimeout(ok, 2000 * 2 ** i));
      continue;
    }
    throw new Error(`${url} → ${r.status} ${(await r.text()).slice(0, 300)}`);
  }
}

const load = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { lines: {} });
const save = (s) => fs.writeFileSync(STATE, `${JSON.stringify(s, null, 2)}\n`);
const sig = (id) => JSON.stringify([MODEL, NARRATION[id][1], NARRATION[id][2]]);

async function make(state, id) {
  const [, text, tag] = NARRATION[id];
  const mp3 = await el(`/v1/text-to-speech/${state.voice}?output_format=mp3_44100_128`, { text: `[${tag}] ${text}`, model_id: MODEL });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${id}.mp3`), mp3);
  state.lines[id] = sig(id);
  save(state);
}

async function check(ids) {
  const parts = [
    {
      text:
        'PVのナレーション音声を順に渡します。それぞれ台本どおりに読めているか厳しく確かめてください。問題: 読み間違い、言葉の繰り返し、言いよどみ、抜け、余計な言葉（英語の指示を読み上げる等）。' +
        'アクセントや調子は問題にしない。JSON の配列だけを返す: [{"n":番号,"ok":true/false,"heard":"聞こえたとおりひらがなで","problem":""}]',
    },
  ];
  ids.forEach((id, k) => {
    parts.push({ text: `${k + 1}番 台本:「${NARRATION[id][0]}」（読み: ${NARRATION[id][1]}）` });
    parts.push({ inline_data: { mime_type: 'audio/mpeg', data: fs.readFileSync(path.join(OUT, `${id}.mp3`)).toString('base64') } });
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
    console.log(`× ${id}「${NARRATION[id][0]}」 聞こえた: ${x.heard} / ${x.problem}`);
  }
  return bad;
}

const state = load();
if (!state.voice) throw new Error('tools/pv_narration.json に voice（ナレーターの声のID）がありません');
const todo = Object.keys(NARRATION).filter((id) => state.lines[id] !== sig(id) || !fs.existsSync(path.join(OUT, `${id}.mp3`)));
console.log(`作る: ${todo.length} 行`);
for (const id of todo) await make(state, id);
if (process.argv.includes('--check')) {
  let ids = Object.keys(NARRATION);
  for (let round = 0; ; round++) {
    const bad = await check(ids);
    console.log(`問題あり: ${bad.length} / ${ids.length}`);
    if (!bad.length || round === 3) break;
    for (const id of bad) await make(state, id);
    ids = bad;
  }
}
