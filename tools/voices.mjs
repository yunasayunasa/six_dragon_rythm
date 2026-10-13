/**
 * フルボイスの声を作る開発用ツール（Gemini TTS。CAST_VOICES で provider: 'elevenlabs' のキャラは ElevenLabs）。
 *
 * 準備:
 *   リポジトリ直下の .env に GEMINI_API_KEY=... と ELEVENLABS_API_KEY=... を書く（.env は Git に入らない）
 *   npm i --no-save @breezystack/lamejs   … MP3 に変換するため
 *
 * 使い方:
 *   node tools/voices.mjs list                  声を付けるセリフの数と、料金の目安
 *   node tools/voices.mjs design [名前...]      キャラの声を作る（作り直す）。試聴用の音声を voice-samples/ に書き出す
 *   node tools/voices.mjs design 名前 --pick N  ElevenLabs のキャラ：候補 N を保存してゲームで使う声にする
 *   node tools/voices.mjs generate [名前...]    セリフの声を作る。作っていない・文章や声が変わったセリフだけ作り直す
 *   node tools/voices.mjs generate --first      各キャラの最初のセリフだけ作る（声の確かめ用）
 *   node tools/voices.mjs check [名前...] [--fix]  書き起こしで読み間違いを探す（--fix で作り直す）
 *   node tools/voices.mjs release [名前...]     声を ElevenLabs から消して枠を空ける（名前を省くと KEEP_VOICES 以外ぜんぶ）
 *
 * ElevenLabs の契約（Starter）は声を10個までしか保存できない。全話に出る KEEP_VOICES だけ残し、ほかは話の声を作り終えたら release で消す
 * （ユーザー決定 2026-10-04）。2026-10-04 以降に作った声はシード値と試し文を記録しているので、消しても generate のときに同じ声を作り直す
 * （完全に同じではないが、ユーザーが聞いて「同じでよい」と判断）。それより前に作った声は作り直せない。
 *
 * 声のIDとセリフごとの印は tools/voices.json に残る（コミットする）。
 * 音声は public/assets/voice/<話のid>/<印>.mp3、どのセリフに声があるかは同じフォルダの index.json。
 * 印は既読と同じ ReadMarks.key(話し手の名前, 文章)。台本を直すと印が変わるので、generate で作り直される。
 */
import { createServer } from 'vite';
import fs from 'node:fs';
import { pitchShift } from './voice_audio.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = 'gemini-3.8-flash-tts';
const API = 'https://generativelanguage.googleapis.com/v1beta';
// ElevenLabs（CAST_VOICES の provider: 'elevenlabs' のキャラ）。.env に ELEVENLABS_API_KEY
const EL_API = 'https://api.elevenlabs.io';
const EL_MODEL = 'eleven_v4';
const EL_DESIGN_MODEL = 'eleven_ttv_v3';
const STATE_FILE = path.join(ROOT, 'tools/voices.json');
const SAMPLE_DIR = path.join(ROOT, 'voice-samples');

/**
 * キャラの声（変わらない特徴だけ。場面ごとの調子は STYLE で付ける）。ユーザーのイメージ（2026-10-02）から。
 * 2026-10-03 ユーザーの指示で全員 ElevenLabs に移した（説明文・話し方は英語のほうが効く）。
 * provider を外すと Gemini（gender・日本語の description/style、prebuilt、pitch＝後から上げる半音）に戻せる
 */
const CAST_VOICES = {
  ウィルナス: {
    provider: 'elevenlabs',
    // 雄々しく猛々しいが凛々しい。Gemini の1回目はかすれて怯えたように聞こえた（ユーザー所見）
    description:
      'A Japanese man in his thirties, native Japanese speaker. Bold, fierce and heroic yet dignified and noble voice. ' +
      'Deep, powerful and resonant with a strong core, full of confidence and command. A brave warrior who fears nothing. Clear, not raspy.',
    style: 'confident, bold, heroic',
  },
  // 子供の声は Google でも ElevenLabs でも安全ポリシーで作れない（2026-10-03 確認）。
  // ユーザーの了承のもと、アニメで子供役を演じる大人の声のように「幼く可愛い声の大人の女性」として作る（年齢を偽る言い換えはしない）
  ワムデュス: {
    provider: 'elevenlabs',
    description:
      'A Japanese woman in her early twenties, native Japanese speaker, with a very high-pitched, soft, sweet and cute youthful voice, ' +
      'in the style of an anime voice actress. Slightly lisping, clumsy pronunciation. Relaxed, sleepy, carefree, laid-back pace.',
    style: 'cute, sleepy, laid-back',
  },
  // 妖艶さと凛々しさのお姉さん。「からかうように」だと囁き声になった（ユーザー所見）ので、はっきりした声にする
  フェディエル: {
    provider: 'elevenlabs',
    description:
      'A Japanese woman in her late twenties, native Japanese speaker, a mature big-sister type. Calm, low, deep and mysterious voice ' +
      'with composure, elegance, dignity and strength. Speaks in an old-fashioned, slightly aristocratic manner. Clear and projected, not breathy or whispery.',
    style: 'dignified, confident, composed',
  },
  ガレヲン: {
    provider: 'elevenlabs',
    description:
      'A Japanese woman in her thirties, native Japanese speaker. Graceful, modest and calm, with a warm, soft, motherly voice that embraces everything. ' +
      'Speaks slowly, gently and politely.',
    style: 'gentle, calm, warm',
  },
  ルオー: {
    provider: 'elevenlabs',
    description:
      'A Japanese young man in his twenties, native Japanese speaker. Serious, stiff and rigid personality with a calm, clear and articulate voice. ' +
      'Intellectual, with a slightly arrogant, self-assured tone.',
    style: 'calm, firm, self-assured',
  },
  // ---------- 第二話から（2026-10-04） ----------
  シェロカルテ: {
    provider: 'elevenlabs',
    description:
      'A Japanese woman in her twenties, native Japanese speaker, a cheerful and friendly merchant. Light, airy, sweet voice. ' +
      'Speaks in a leisurely, drawn-out, relaxed way, stretching the ends of her sentences. Playful and good-natured.',
    style: 'cheerful, leisurely, drawn-out',
  },
  // 役名（立ち絵はモブおじ）。調子がよく口が達者な商会の手代
  トマ: {
    provider: 'elevenlabs',
    description:
      'A Japanese man in his forties, native Japanese speaker, a glib, fast-talking shop clerk. Slightly raspy, ingratiating, street-smart tone, ' +
      'a little shifty. Quick, chatty delivery.',
    style: 'glib, chatty, ingratiating',
  },
  // 絵描きの少年。子供の声は作れないので、ワムと同じく少年役を演じる大人の女性（アニメの少年声）として作る
  パレタ: {
    provider: 'elevenlabs',
    description:
      'A Japanese woman in her twenties, native Japanese speaker, who voices young boys in anime. Boyish, bright, earnest and innocent tone, ' +
      'slightly husky, sincere and gentle.',
    style: 'boyish, earnest, innocent',
  },
  サンチラ: {
    provider: 'elevenlabs',
    description:
      'A Japanese woman in her early twenties, native Japanese speaker. Earnest, polite and naive, with a bright, clear voice. ' +
      'Romantic and dreamy, gets excited easily. Speaks politely.',
    style: 'earnest, polite, excited',
  },
  ルリア: {
    provider: 'elevenlabs',
    description:
      'A Japanese woman in her early twenties, native Japanese speaker, with a soft, sweet, gentle and kind youthful voice. ' +
      'Bright and cheerful, speaks politely.',
    style: 'gentle, bright, polite',
  },
  // ライバル（雲上議会の天司長）
  サンダルフォン: {
    provider: 'elevenlabs',
    description:
      'A Japanese man in his twenties, native Japanese speaker. Serious, calm and reserved, a man of few words. ' +
      'Low, cool, steady voice with quiet intensity and dignity.',
    style: 'calm, serious, reserved',
  },
  // ---------- 第三話から（2026-10-05） ----------
  // 役名（立ち絵はハーゼリーラ）。表向きは丁寧、追いつめられると本性が出る灯晶院の検品官
  カガチ: {
    provider: 'elevenlabs',
    description:
      'A Japanese woman in her late twenties, native Japanese speaker, an elegant and refined official. Polite, graceful, ladylike voice ' +
      'with a cold, calculating edge underneath. Composed and haughty, turns sharp and shrill when cornered.',
    style: 'polite, elegant, cold',
  },
  // 夜警・院の番兵・院の見張りは同じ帝国兵の立ち絵なので、声も1つ（VOICE_ALIAS）。ユーザー決定 2026-10-05
  帝国兵: {
    provider: 'elevenlabs',
    description:
      'A Japanese man in his thirties, native Japanese speaker, a soldier in armor. Stiff, formal military way of speaking. ' +
      'Firm, gruff and slightly muffled voice, as if speaking from inside a helmet. Proud of following orders.',
    style: 'stiff, formal, gruff',
  },
  ニオ: {
    provider: 'elevenlabs',
    description:
      'A Japanese woman in her early twenties, native Japanese speaker, with a quiet, soft, calm and gentle voice. ' +
      'Speaks in short sentences, mysterious and serene, slightly melancholic.',
    style: 'quiet, calm, serene',
  },
  マキラ: {
    provider: 'elevenlabs',
    description:
      'A Japanese woman in her early twenties, native Japanese speaker, a shy craftswoman. Soft, timid, gentle voice. ' +
      'Speaks hesitantly with many pauses, not good at talking, but kind.',
    style: 'shy, hesitant, soft',
  },
  カリオストロ: {
    provider: 'elevenlabs',
    description:
      'A Japanese woman in her twenties, native Japanese speaker, a genius alchemist. Bright, cute, sugary and theatrical voice, ' +
      'playfully acting adorable, but with a knowing, confident and occasionally sharp undertone.',
    style: 'cute, playful, confident',
  },
  クラリス: {
    provider: 'elevenlabs',
    description:
      'A Japanese woman in her early twenties, native Japanese speaker. Cheerful, energetic and casual voice, ' +
      'bright and friendly, speaks in a laid-back, slangy way.',
    style: 'cheerful, energetic, casual',
  },
  // ---------- 第四話から（2026-10-05） ----------
  イルザ: {
    provider: 'elevenlabs',
    description:
      'A Japanese woman in her thirties, native Japanese speaker, a strict prison warden and drill instructor. ' +
      'Commanding, sharp, low and stern voice. Short, curt, authoritative sentences.',
    style: 'stern, commanding, curt',
  },
  ユーステス: {
    provider: 'elevenlabs',
    description:
      'A Japanese man in his twenties, native Japanese speaker, a taciturn guard. Low, quiet, cool and calm voice. Speaks very little, flat and terse.',
    style: 'quiet, terse, cool',
  },
  ゼタ: {
    provider: 'elevenlabs',
    description:
      'A Japanese woman in her late teens to early twenties, native Japanese speaker. Confident, spirited, slightly bossy and proud voice, bright and clear.',
    style: 'spirited, confident, bossy',
  },
  ベアトリクス: {
    provider: 'elevenlabs',
    description:
      'A Japanese woman in her early twenties, native Japanese speaker. Loud, rowdy, energetic tomboyish voice, excitable and boisterous.',
    style: 'loud, excitable, boisterous',
  },
  // 役名（立ち絵はクラーバラ）。カガチを慕う検品見習い
  ミオ: {
    provider: 'elevenlabs',
    description:
      'A Japanese woman in her early twenties, native Japanese speaker, a polite apprentice. Gentle, earnest, slightly nervous and fragile voice. Very polite.',
    style: 'polite, earnest, nervous',
  },
  ベリアル: {
    provider: 'elevenlabs',
    description:
      'A Japanese man in his twenties, native Japanese speaker. Smooth, slick, charming yet mocking voice. ' +
      'Playful, sly and teasing, never takes anything seriously, with a dangerous undertone.',
    style: 'sly, mocking, smooth',
  },
  // ---------- 第五話から（2026-10-05） ----------
  ベルゼバブ: {
    provider: 'elevenlabs',
    description:
      'A Japanese man in his forties, native Japanese speaker, the arrogant head of a powerful order. Deep, cold, imposing and haughty voice. ' +
      'Speaks with contempt and absolute authority; becomes raw and furious when cornered.',
    style: 'arrogant, cold, imposing',
  },
  バイシュラ: {
    provider: 'elevenlabs',
    description:
      'A Japanese woman in her thirties, native Japanese speaker, the chairwoman of a council. Gentle, leisurely, polite and easygoing voice, ' +
      'warm and a little playful, but with quiet authority.',
    style: 'gentle, leisurely, polite',
  },
  シエテ: {
    provider: 'elevenlabs',
    description:
      'A Japanese man in his thirties, native Japanese speaker. Relaxed, easygoing, cheerful and confident voice, always smiling, friendly and charismatic.',
    style: 'relaxed, cheerful, easygoing',
  },
};

/** 同じ声を使う役（話し手の名前 → CAST_VOICES の名前） */
const VOICE_ALIAS = { 夜警: '帝国兵', 院の番兵: '帝国兵', 院の見張り: '帝国兵' };

/** 消さずに残す声（全話に出る六竜とライバル）。ほかの声は話の声を作り終えたら release で消す */
const KEEP_VOICES = new Set(['ウィルナス', 'ワムデュス', 'フェディエル', 'ガレヲン', 'ルオー', 'サンダルフォン']);

/** 表情 → その行の話し方 */
const STYLE = {
  驚き: '驚いて、勢いよく声を張って',
  説明: '落ち着いて、分かりやすく説明するように',
  考え: '考え込みながら、ゆっくりと',
  得意: '得意げに',
  よそ見: '目をそらして、少しとぼけた調子で',
  困惑: '困って、戸惑いながら',
  挑発: '挑発するように、余裕たっぷりに',
  構え: '身構えて、鋭く',
  笑い: '楽しそうに笑いながら',
  指差し: '相手を指差して、力強く言い切るように',
  怒り: '怒って、語気を強めて',
  笑み: '微笑みながら、柔らかく',
  微笑み: '微笑みながら、柔らかく',
  投げキッス: '甘い調子で、茶目っ気たっぷりに',
};
const STATEMENT_STYLE = '証言するように、はっきりと';
const SHOUT_STYLE = '腹の底から、力強く叫ぶ';

/** ElevenLabs 用：話し方の指示 → 文頭に付ける音声タグ（英語のほうが効く） */
const STYLE_TAG = {
  [STYLE.驚き]: 'surprised',
  [STYLE.説明]: 'explaining calmly',
  [STYLE.考え]: 'thoughtful, slowly',
  [STYLE.得意]: 'proud, smug',
  [STYLE.よそ見]: 'evasive, playing dumb',
  [STYLE.困惑]: 'confused, hesitant',
  [STYLE.挑発]: 'teasing',
  [STYLE.構え]: 'tense, sharp',
  [STYLE.笑い]: 'laughing',
  [STYLE.指差し]: 'firm, assertive',
  [STYLE.怒り]: 'annoyed, pouting',
  [STYLE.笑み]: 'smiling, gentle',
  [STYLE.投げキッス]: 'sweet, playful',
  [STATEMENT_STYLE]: 'testifying clearly',
  [SHOUT_STYLE]: 'shouting',
};

/** 読み間違えやすい言葉（声のための読みだけ。画面の文字は変わらない）。要確認のものもある */
const READINGS = [
  ['凪ノ桟橋', 'なぎのさんばし'],
  ['灯台柱', 'とうだいばしら'],
  ['雲蜜', 'くもみつ'],
  ['灯晶', 'とうしょう'],
  ['空魚', 'そらうお'],
  ['此方', 'こなた'],
  ['其方', 'そなた'],
  ['鼎', 'かなえ'],
  // 正しくは頭高。「ヲ」のままだと中高に聞こえた（2026-10-03 ユーザーが6案を聞いて「ガレオン」表記を選んだ）
  ['ガレヲン', 'ガレオン'],
  // 漢字のままだと「かかむくせよ」に聞こえた（2026-10-03 ユーザー所見・書き起こしでも確認）
  ['刮目', 'かつもく'],
  // 第一話の書き起こしで読み間違いが見つかったもの（2026-10-03）
  ['係留', 'けいりゅう'],
  ['外し方', 'はずしかた'],
  ['最終便', 'さいしゅうびん'],
  ['鐘の音', 'かねのおと'],
  // 何度作り直しても冒頭を2回読んだ行（読点・短い熟語のあとで繰り返しやすい）
  ['光と、甘いもの……か。', 'ひかりと、あまいもの……か。'],
  ['否定。いいえ', '否定……いいえ'],
  // 第二話（2026-10-04）
  ['昇降籠', 'しょうこうかご'],
  ['雲市場', 'くもいちば'],
  ['雲上議会', 'うんじょうぎかい'],
  ['天司長', 'てんしちょう'],
  ['手代', 'てだい'],
  ['符丁', 'ふちょう'],
  ['封蝋', 'ふうろう'],
  ['帳場', 'ちょうば'],
  ['露台', 'ろだい'],
  ['真贋', 'しんがん'],
  ['画材箱', 'がざいばこ'],
  ['鍵掛け', 'かぎかけ'],
  ['詰め所', 'つめしょ'],
  ['前掛け', 'まえかけ'],
  ['逢い引き', 'あいびき'],
  ['上の段', 'うえのだん'],
  ['下の段', 'したのだん'],
  // 第二話の書き起こしで、何度作っても繰り返し・読み間違いがあった行（2026-10-04）
  ['苦い花の香り……か。ふむ', 'にがい、はなのかおり……か。ふむ'],
  ['……いや、この2つは', 'いや……このふたつは'],
  ['語るに落ちて', 'かたるにおちて'],
  ['市場灯', 'いちばとう'],
  // 第三話から（2026-10-05 ユーザー所見: 候補の試聴で読み・アクセントが変だった）
  ['ゲン爺', 'げんじい'],
  ['蝶番', 'ちょうつがい'],
  ['白燈', 'はくとう'],
  // 第三〜五話で読み間違えやすい言葉（演技指導を書かせたときに Gemini が挙げた中から、本当に紛らわしいものだけ選んだ）
  ['堅物', 'かたぶつ'],
  ['甲板', 'かんぱん'],
  ['一艘', 'いっそう'],
  ['撚った', 'よった'],
  ['縄目', 'なわめ'],
  ['殺め', 'あやめ'],
  ['灯って', 'ともって'],
  ['何刻', 'なんどき'],
  ['十歩先', 'じっぽさき'],
  ['霧氷', 'むひょう'],
  ['打ち子', 'うちこ'],
  ['御用達', 'ごようたし'],
  ['手ずから', 'てずから'],
  ['後生大事', 'ごしょうだいじ'],
  ['亡骸', 'なきがら'],
  ['淹れ', 'いれ'],
  ['鐘楼', 'しょうろう'],
  ['試し鐘', 'ためしがね'],
  ['大鐘', 'おおがね'],
  ['守り灯', 'まもりび'],
  ['宵', 'よい'],
  ['最期', 'さいご'],
  ['待てい', 'まてい'],
  ['全空一', 'ぜんくういち'],
  ['五竜', 'ごりゅう'],
  ['六竜', 'ろくりゅう'],
  ['一隻', 'いっせき'],
  ['二隻', 'にせき'],
  ['騙', 'かた'],
  ['合い鍵', 'あいかぎ'],
  ['悪しざま', 'あしざま'],
  ['院の命', 'いんのめい'],
  // 第三〜五話の書き起こしで、何度作っても冒頭を繰り返した行（上の読みを当てたあとの文章で書く）
  ['師匠、げんじい', 'ししょう……げんじい'],
  ['水時計で計った刻', 'みずどけいではかった、とき'],
  // 冒頭の『さあ』『ふん』は何度作っても2回読むので、声では言わない（画面の文字は変えない）
  ['さあ。かねのおと', 'かねのおと'],
  ['でしたら、別の誰かが', 'でしたら……べつのだれかが'],
  ['ええ。珍しくも', 'えぇ、めずらしくも'],
  ['ええ。院では', 'えぇ、いんでは'],
  ['ふん。何度聞いても', 'なんどきいても'],
  ['なっ……院より', 'な……いんより'],
  ['聞いた。……でも、変だった', 'うん、きいた。でも、へんだった'],
  ['……ゆうべ、よいの鐘', 'ゆうべ……よいの鐘'],
  ['ああ。嵐の音', 'あらしのおと'],
  ['はい。わたしが降りた便', 'わたしが降りた便'],
  ['空の船', 'そらのふね'],
  ['帰す', 'かえす'],
  ['帰し', 'かえし'],
  ['ふん。夜明けまでに', '夜明けまでに'],
  ['……そもそも、だ', 'そもそも……だ'],
  ['私は、その場に駆けつけた', 'わたしは、そのばに、かけつけた'],
  ['霧深し', 'きりふかし'],
  ['星祭り', 'ほしまつり'],
  ['積荷', 'つみに'],
  ['議会の命', 'ぎかいのめい'],
  ['今の鼎', 'いまの、かなえ'],
  ['ぬはは、それは何よりである', 'それは何よりである'],
  ['うむ……。（流れるような', '（流れるような'],
  ['夜の鐘の刻', 'よるのかねのこく'],
  ['……私にとって、だ', 'わたしにとってだ。'],
];

/** 声を作り終えた話（読み方の決まりを後から変えても作り直さない。トークン節約のためユーザー指示 2026-10-03） */
// 第二話は、声を消したシェロカルテ・サンチラを第五話のために作り直す（2026-10-05 ユーザー決定）ので、第二話の声が変わらないよう凍結する
const FROZEN_EPISODES = new Set(['case01', 'case02']);

/** 第一話の声を写して使うセリフ（作り直さない・確かめない）。「刮目せよ！」はアクセントが変なので第一話の声を流用（2026-10-06 ユーザー指示） */
const BORROWED_FROM_CASE01 = new Set(['刮目せよ！']);

/** 画面の文章 → 読み上げる文章。l はセリフ（episode・speaker・text） */
let directionCache;
const directionOf = (l) => (directionCache ??= loadDirection())[l.key];

function ttsText(l) {
  let t = l.text.replace(/\n/g, '');
  if (l.episode === 'case01') {
    // 第一話：ガレヲンの「熟語（言い足し）」は、熟語のあとに一拍おいて続ける
    t = t.replace(/([^\s（「」]+)（([^）]+)）/g, '$1。$2');
  } else if (l.speaker === 'ガレヲン') {
    // 第二話から：ガレヲンの熟語は読まず、（ ）の中の言い足しだけ読む（ユーザー指示 2026-10-03）
    t = t.replace(/([^\s（「」]+)（([^）]+)）/g, '$2');
  }
  for (const [w, r] of READINGS) t = t.split(w).join(r);
  return t;
}

// ---------- 共通 ----------
function apiKey(name = 'GEMINI_API_KEY') {
  const env = fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '';
  const key = process.env[name] ?? env.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, 'm'))?.[1];
  if (!key) throw new Error(`.env に ${name} がありません`);
  return key.replace(/^["']|["']$/g, '');
}

/** ElevenLabs の API。音声（バイナリ）が返るときは Buffer を返す */
async function elApi(method, url, body) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${EL_API}${url}`, {
      method,
      headers: { 'xi-api-key': apiKey('ELEVENLABS_API_KEY'), 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.ok) return (r.headers.get('content-type') ?? '').includes('json') ? r.json() : Buffer.from(await r.arrayBuffer());
    const err = await r.json().catch(() => ({}));
    if ((r.status === 429 || r.status >= 500) && attempt < 5) {
      await new Promise((ok) => setTimeout(ok, 2000 * 2 ** attempt));
      continue;
    }
    throw new Error(`${method} ${url} → ${r.status} ${JSON.stringify(err.detail ?? err).slice(0, 300)}`);
  }
}

async function api(method, url, body) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${API}${url}`, {
      method,
      headers: { 'x-goog-api-key': apiKey(), 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.ok) return r.status === 204 ? {} : r.json();
    const err = await r.json().catch(() => ({}));
    // 1日の回数の上限（Tier 1 は1日100回）は、待っても翌日まで戻らないので止める
    if (r.status === 429 && /per day/i.test(err.error?.message ?? '')) {
      throw Object.assign(new Error(`1日の回数の上限に達しました（${err.error.message}）`), { daily: true });
    }
    // 混雑・短い時間の回数制限は待ってやり直す
    if ((r.status === 429 || r.status >= 500) && attempt < 5) {
      await new Promise((ok) => setTimeout(ok, 2000 * 2 ** attempt));
      continue;
    }
    throw new Error(`${method} ${url} → ${r.status} ${err.error?.message ?? ''}`);
  }
}

function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function loadState() {
  return fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : { model: MODEL, voices: {}, lines: {} };
}
function saveState(s) {
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(s, null, 2)}\n`);
}

/** WAV（RIFF）から 16bit の音の並びを取り出す */
function readWav(buf) {
  let p = 12;
  let rate = 24000;
  while (p + 8 <= buf.length) {
    const id = buf.toString('latin1', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === 'fmt ') rate = buf.readUInt32LE(p + 12);
    if (id === 'data') {
      const end = Math.min(buf.length, p + 8 + size);
      const data = buf.subarray(p + 8, end);
      return { rate, pcm: new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + (data.length & ~1))) };
    }
    p += 8 + size + (size & 1);
  }
  throw new Error('WAV の data が見つかりません');
}

/** 前後の無音を詰める（タップしてすぐ声が出るように）。少しだけ余白を残す */
function trimSilence(pcm, rate) {
  const th = 400;
  let a = 0;
  let b = pcm.length - 1;
  while (a < b && Math.abs(pcm[a]) < th) a++;
  while (b > a && Math.abs(pcm[b]) < th) b--;
  const pad = Math.round(rate * 0.05);
  return pcm.subarray(Math.max(0, a - pad), Math.min(pcm.length, b + pad));
}

async function toMp3(pcm, rate) {
  let lame;
  try {
    lame = await import('@breezystack/lamejs');
  } catch {
    throw new Error('MP3 変換に @breezystack/lamejs が要ります: npm i --no-save @breezystack/lamejs');
  }
  const enc = new lame.Mp3Encoder(1, rate, 56);
  const out = [];
  for (let i = 0; i < pcm.length; i += 1152) out.push(enc.encodeBuffer(pcm.subarray(i, i + 1152)));
  out.push(enc.flush());
  return Buffer.concat(out.map((b) => Buffer.from(b.buffer, b.byteOffset, b.length)));
}

// ---------- セリフを集める ----------
async function collect() {
  const server = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  const { EPISODES } = await server.ssrLoadModule('/src/game/episodes.ts');
  const { parseScript } = await server.ssrLoadModule('/src/engine/script/parser.ts');
  const { ReadMarks } = await server.ssrLoadModule('/src/engine/core/ReadMarks.ts');
  const episodes = [];
  for (const ep of EPISODES) if (ep.load) episodes.push(await ep.load());
  await server.close();

  const out = [];
  for (const d of episodes) {
    const nameOf = (s) => d.cast.find((c) => c.name === s || c.id === s)?.name ?? s;
    const player = nameOf(d.player);
    const lines = new Map();
    const add = (speaker, text, style) => {
      const voice = VOICE_ALIAS[speaker] ?? speaker;
      if (!speaker || !CAST_VOICES[voice]) return;
      const key = ReadMarks.key(speaker, text);
      if (!lines.has(key)) lines.set(key, { episode: d.id, key, speaker, voice, text, style });
    };
    const addScript = (src) => {
      if (!src) return;
      for (const c of parseScript(src)) {
        if (c.op === 'say' && c.speaker) add(nameOf(c.speaker), c.text, STYLE[c.expr] ?? null);
        if (c.op === 'cmd' && c.name === 'shout') add(player, c.args.join(' '), SHOUT_STYLE);
      }
    };
    addScript(d.intro);
    for (const h of d.hotspots) {
      addScript(h.script);
      addScript(h.again);
      for (const v of h.variants ?? []) {
        addScript(v.script);
        addScript(v.again);
      }
    }
    d.logic.pairs.forEach((p) => addScript(p.script));
    addScript(d.logic.miss);
    addScript(d.logic.done);
    for (const c of Object.values(d.confrontations)) {
      addScript(c.intro);
      for (const s of c.statements) {
        add(nameOf(c.witness), s.text, STATEMENT_STYLE);
        addScript(s.press);
      }
      addScript(c.success);
      addScript(c.wrong);
      c.hints?.forEach(addScript);
      addScript(c.fail);
    }
    addScript(d.ending);
    // 尋問の叫び（InvestigationGame と同じ既定値）
    add(player, d.shouts?.press ?? '待った！', SHOUT_STYLE);
    add(player, d.shouts?.present ?? 'これを見ろ！', SHOUT_STYLE);
    out.push(...lines.values());
  }
  return out;
}

// ---------- 命令 ----------
async function list() {
  const lines = await collect();
  const by = {};
  let chars = 0;
  for (const l of lines) {
    by[l.speaker] = (by[l.speaker] ?? 0) + 1;
    chars += ttsText(l).length;
  }
  // 日本語はおよそ1秒7文字、音声は1秒25トークン、1Mトークン9ドル（2026年末まで）
  const sec = chars / 7;
  console.log(`セリフ ${lines.length} 行（${chars} 文字、音声およそ ${(sec / 60).toFixed(0)} 分）`, by);
  console.log(`料金の目安: 約 ${((sec * 25 * 9) / 1e6).toFixed(2)} ドル（全部作り直した場合）`);
}

/**
 * ElevenLabs の声作り。説明文から候補を3つ作り voice-samples/<名前>_候補N.mp3 に書き出す（試聴文はそのキャラのセリフ）。
 * 聞いて選んだら design <名前> --pick N で保存し、ゲームで使う声にする
 */
async function designEleven(name, v, state, pick) {
  if (pick) {
    const generated = state.candidates?.[name]?.[pick - 1];
    if (!generated) throw new Error(`${name} の候補${pick}がありません（先に design ${name}）`);
    const old = state.voices[name]?.provider === 'elevenlabs' ? state.voices[name].id : null;
    const res = await elApi('POST', '/v1/text-to-voice', { voice_name: `six-dragon ${name}`, voice_description: v.description, generated_voice_id: generated });
    const recipe = state.candidateSeeds?.[name];
    state.voices[name] = { provider: 'elevenlabs', id: res.voice_id, description: v.description, ...(recipe ? { seed: recipe.seed, text: recipe.text, pick } : {}) };
    delete state.candidates[name];
    if (state.candidateSeeds) delete state.candidateSeeds[name];
    saveState(state);
    if (old && old !== res.voice_id) await elApi('DELETE', `/v1/voices/${old}`).catch((e) => console.warn(`古い声を消せませんでした（${e.message}）`));
    console.log(`${name}: 候補${pick}を保存 → ${res.voice_id}`);
    return;
  }
  // 試聴文は 100〜1000 文字。そのキャラのセリフをつなぐ
  let text = '';
  for (const l of (await collect()).filter((l) => l.voice === name)) {
    if (text.length >= 150) break;
    text += ttsText(l);
  }
  // 台詞の少ない役は、100文字に届くまで繰り返す（試聴文は100文字以上が要る）
  for (const once = text; text && text.length < 100; ) text += once;
  // シード値を残しておくと、同じ説明・同じ試し文で同じ声を作り直せる（声を消して枠を空けるため）
  const seed = Math.floor(Math.random() * 2147483647);
  const res = await elApi('POST', '/v1/text-to-voice/design?output_format=mp3_44100_128', { voice_description: v.description, model_id: EL_DESIGN_MODEL, text, seed });
  state.candidates = { ...state.candidates, [name]: res.previews.map((p) => p.generated_voice_id) };
  state.candidateSeeds = { ...state.candidateSeeds, [name]: { seed, text } };
  saveState(state);
  res.previews.forEach((p, i) => fs.writeFileSync(path.join(SAMPLE_DIR, `${name}_候補${i + 1}.mp3`), Buffer.from(p.audio_base_64, 'base64')));
  console.log(`${name}: 候補 ${res.previews.length} つ（試聴: voice-samples/${name}_候補N.mp3、決めたら design ${name} --pick N）`);
}

/** 消した声（released）を、記録したシード値で作り直して保存する。作り直せない声はエラー */
async function ensureVoice(name, state) {
  const v = state.voices[name];
  if (!v?.released) return;
  if (v.seed === undefined) throw new Error(`${name} の声は消してあり、シード値の記録が無いので作り直せません（design ${name} からやり直す）`);
  const res = await elApi('POST', '/v1/text-to-voice/design?output_format=mp3_44100_128', { voice_description: v.description, model_id: EL_DESIGN_MODEL, text: v.text, seed: v.seed });
  const generated = res.previews[(v.pick ?? 1) - 1]?.generated_voice_id;
  const saved = await elApi('POST', '/v1/text-to-voice', { voice_name: `six-dragon ${name}`, voice_description: v.description, generated_voice_id: generated });
  state.voices[name] = { ...v, id: saved.voice_id, released: false };
  saveState(state);
  console.log(`${name}: 消してあった声をシード値から作り直した → ${saved.voice_id}`);
}

/** 声を ElevenLabs から消して枠を空ける（記録は残す）。名前を省くと KEEP_VOICES 以外ぜんぶ */
async function release(args) {
  const state = loadState();
  const names = args.length ? args : Object.keys(state.voices).filter((n) => !KEEP_VOICES.has(n));
  for (const name of names) {
    const v = state.voices[name];
    if (!v || v.released || v.provider !== 'elevenlabs') continue;
    if (KEEP_VOICES.has(name) && !args.length) continue;
    // すでに消えている声（前の実行の途中で止まったなど）も、消したことにする
    await elApi('DELETE', `/v1/voices/${v.id}`).catch((e) => {
      if (!/voice_not_found|voice_does_not_exist/.test(e.message)) throw e;
    });
    state.voices[name] = { ...v, released: true };
    saveState(state);
    console.log(`${name}: 消した${v.seed === undefined ? '（シード値の記録が無いので、もう作り直せない）' : '（シード値から作り直せる）'}`);
  }
}

async function design(args) {
  const state = loadState();
  fs.mkdirSync(SAMPLE_DIR, { recursive: true });
  const pickAt = args.indexOf('--pick');
  const pick = pickAt >= 0 ? Number(args[pickAt + 1]) : 0;
  const names = pickAt >= 0 ? args.filter((a, i) => i !== pickAt && i !== pickAt + 1) : args;
  for (const name of names.length ? names : Object.keys(CAST_VOICES)) {
    const v = CAST_VOICES[name];
    if (!v) throw new Error(`知らない名前: ${name}`);
    if (v.provider === 'elevenlabs') {
      await designEleven(name, v, state, pick);
      continue;
    }
    if (v.prebuilt) {
      state.voices[name] = { id: v.prebuilt, prebuilt: true };
      saveState(state);
      console.log(`${name}: 用意された声 ${v.prebuilt} を使う`);
      continue;
    }
    const old = state.voices[name]?.id;
    const res = await api('POST', '/voices', {
      store: true,
      voice: { model: MODEL, type: 'prompted', display_name: `six-dragon ${name}`, gender: v.gender, language_code: 'ja-JP', prompted: { input: v.description } },
    });
    state.voices[name] = { id: res.id, description: v.description, gender: v.gender };
    saveState(state);
    if (res.sample_audio?.data) fs.writeFileSync(path.join(SAMPLE_DIR, `${name}.wav`), Buffer.from(res.sample_audio.data, 'base64'));
    if (old && old !== res.id) await api('DELETE', `/voices/${old}`).catch((e) => console.warn(`古い声を消せませんでした（${e.message}）`));
    console.log(`${name}: ${res.id}（試聴: voice-samples/${name}.wav）`);
  }
}

/** retake … 印（key）の集まり。台本が変わっていなくても作り直す（check --fix から使う） */
async function generate(names, retake = null) {
  const state = loadState();
  // --first … 各キャラの最初のセリフ（遊ぶ順で最初に出る1行）だけ作る。声の確かめ用
  const first = names.includes('--first');
  names = names.filter((n) => n !== '--first');
  const all = await collect();
  let lines = all.filter((l) => !names.length || names.includes(l.voice) || names.includes(l.speaker));
  if (retake) lines = lines.filter((l) => retake.has(l.key));
  if (first) {
    lines = lines.filter((l, i) => lines.findIndex((x) => x.voice === l.voice) === i);
    for (const l of lines) console.log(`  ${l.speaker}（${l.key}）「${l.text.replace(/\n/g, '')}」`);
  }
  const providerOf = (n) => CAST_VOICES[n].provider ?? 'gemini';
  const missing = [...new Set(lines.map((l) => l.voice))].filter((n) => !state.voices[n] || (state.voices[n].provider ?? 'gemini') !== providerOf(n));
  if (missing.length) throw new Error(`声がまだありません: ${missing.join('、')}（先に design）`);

  const sigOf = (l) => {
    const v = CAST_VOICES[l.voice];
    const model = providerOf(l.voice) === 'elevenlabs' ? EL_MODEL : MODEL;
    const sv = state.voices[l.voice];
    const voiceKey = sv.seed !== undefined ? `seed:${sv.seed}:${sv.pick ?? 1}` : sv.id;
    return fnv([model, voiceKey, v.style, v.pitch ?? 0, l.style ?? '', directionOf(l)?.dir ?? '', ttsText(l)].join('|'));
  };
  const fileOf = (l) => path.join(ROOT, 'public/assets/voice', l.episode, `${l.key}.mp3`);
  // 消してあって作り直せない声（シード値の記録が無い）のセリフは、音声があれば読み方の辞書などが変わっても作り直さない
  const lost = (l) => state.voices[l.voice]?.released && state.voices[l.voice].seed === undefined && fs.existsSync(fileOf(l));
  // 声を作り終えた話（FROZEN_EPISODES）は、音声があれば作り直さない（同じ文のセリフが別の話にあって作り直すときも）
  const frozen = (l) => (FROZEN_EPISODES.has(l.episode) || BORROWED_FROM_CASE01.has(l.text)) && fs.existsSync(fileOf(l));
  const todo = lines.filter((l) => !lost(l) && !frozen(l) && (retake || state.lines[l.key] !== sigOf(l) || !fs.existsSync(fileOf(l))));
  console.log(`作る: ${todo.length} 行 / ${lines.length} 行`);
  // 消してあった声が要るなら、作り直してから
  for (const n of new Set(todo.map((l) => l.voice))) if (providerOf(n) === 'elevenlabs') await ensureVoice(n, state);

  let done = 0;
  let failed = 0;
  // ElevenLabs：話し方は文頭の音声タグで付ける。16bit・24kHz の生の音で受け取る
  const speakEleven = async (l) => {
    const tags = [CAST_VOICES[l.voice].style, directionOf(l)?.dir ?? STYLE_TAG[l.style]].filter(Boolean).join(', ');
    const buf = await elApi('POST', `/v1/text-to-speech/${state.voices[l.voice].id}?output_format=pcm_24000`, {
      text: `[${tags}] ${ttsText(l)}`,
      model_id: EL_MODEL,
    });
    return { rate: 24000, pcm: new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + (buf.length & ~1))) };
  };
  const speakGemini = async (l) => {
    const style = [CAST_VOICES[l.voice].style, l.style].filter(Boolean).join('。');
    const res = await api('POST', '/interactions', {
      model: MODEL,
      store: false,
      input: [{ type: 'user_input', content: [{ type: 'text', text: ttsText(l), annotations: [{ type: 'speech_metadata', style }] }] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: state.voices[l.voice].id }] },
    });
    const audio = res.steps?.flatMap((s) => s.content ?? []).find((c) => c.type === 'audio' && c.data);
    if (!audio) throw new Error('音声が返ってきませんでした');
    return readWav(Buffer.from(audio.data, 'base64'));
  };
  const work = async (l) => {
    const { rate, pcm } = await (providerOf(l.voice) === 'elevenlabs' ? speakEleven(l) : speakGemini(l));
    const mp3 = await toMp3(pitchShift(trimSilence(pcm, rate), rate, CAST_VOICES[l.voice].pitch ?? 0), rate);
    fs.mkdirSync(path.dirname(fileOf(l)), { recursive: true });
    fs.writeFileSync(fileOf(l), mp3);
    state.lines[l.key] = sigOf(l);
  };
  // 3本ずつ並べて作る
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let l; (l = queue.shift()); ) {
        try {
          await work(l);
          done++;
          if (done % 10 === 0) {
            saveState(state);
            console.log(`  ${done} / ${todo.length}`);
          }
        } catch (e) {
          failed++;
          console.error(`失敗: ${l.speaker}「${l.text.slice(0, 20)}」 ${e.message}`);
          // 1日の上限なら残りも作れないので、ここまでで終える（作れた分は残る）
          if (e.daily) {
            failed += queue.length;
            queue.length = 0;
          }
        }
      }
    }),
  );

  // 台本から消えたセリフの声を片付け、どのセリフに声があるかを書き出す
  const live = new Set(all.map((l) => l.key));
  for (const k of Object.keys(state.lines)) if (!live.has(k)) delete state.lines[k];
  saveState(state);
  for (const ep of new Set(all.map((l) => l.episode))) {
    const dir = path.join(ROOT, 'public/assets/voice', ep);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.mp3') && !live.has(f.slice(0, -4))) fs.rmSync(path.join(dir, f));
    const keys = all.filter((l) => l.episode === ep && fs.existsSync(fileOf(l))).map((l) => l.key).sort();
    fs.writeFileSync(path.join(dir, 'index.json'), `${JSON.stringify({ keys })}\n`);
  }
  console.log(`できた: ${done} 行${failed ? `、失敗: ${failed} 行（もう一度 generate すると失敗分だけ作り直す）` : ''}`);
  if (failed) process.exitCode = 1;
}

/**
 * 作った声を Gemini に聞かせて、台本どおりに読めているかを確かめる（読み間違い・冒頭の繰り返し・言いよどみ）。
 * check [名前...] [--text 文字列] [--fix]  … --text はその文字列を含むセリフだけ。--fix は問題の行を作り直す
 */
async function check(args) {
  const fix = args.includes('--fix');
  args = args.filter((a) => a !== '--fix');
  const textAt = args.indexOf('--text');
  const only = textAt >= 0 ? args[textAt + 1] : null;
  const names = textAt >= 0 ? args.filter((a, i) => i !== textAt && i !== textAt + 1) : args;
  const fileOf = (l) => path.join(ROOT, 'public/assets/voice', l.episode, `${l.key}.mp3`);
  // 声を作り終えた話（FROZEN_EPISODES）は確かめない（作り直さないため）
  let lines = (await collect()).filter((l) => !FROZEN_EPISODES.has(l.episode) && !BORROWED_FROM_CASE01.has(l.text) && (!names.length || names.includes(l.voice) || names.includes(l.speaker)) && (!only || l.text.includes(only)) && fs.existsSync(fileOf(l)));
  // --fix … 問題のあった行を作り直して確かめ直す（3回まで。声の作り直しは毎回少し違う読み方になる）
  for (let round = 0; ; round++) {
    console.log(`確かめる: ${lines.length} 行`);
    const bad = await checkLines(lines, fileOf);
    console.log(`問題あり: ${bad.length} 行 / ${lines.length} 行（機械の判定なので、最後は耳で確かめる）`);
    if (!fix || !bad.length || round === 3) return;
    console.log(`--- 作り直し ${round + 1} 回目 ---`);
    await generate([], new Set(bad.map((l) => l.key)));
    lines = bad;
  }
}

async function checkLines(lines, fileOf) {
  const bad = [];
  for (let i = 0; i < lines.length; i += 8) {
    const batch = lines.slice(i, i + 8);
    const parts = [
      {
        text:
          '日本語のセリフの音声を順に渡します。それぞれ、台本の文章どおりに読めているかを厳しく確かめてください。' +
          '問題とするもの: 読み間違い（別の読み方・別の言葉に聞こえる）、言葉の繰り返し（冒頭が2回など）、言いよどみ・どもり、抜け、余計な言葉（英語の指示を読み上げる等）。' +
          'アクセントの違いや、話し方の調子は問題にしない。（ ）の中の言い足しは読まれていてよい。' +
          'JSON の配列だけを返す: [{"n":番号,"ok":true/false,"heard":"聞こえたとおりにひらがなで","problem":"問題（無ければ空）"}]',
      },
    ];
    batch.forEach((l, k) => {
      parts.push({ text: `${k + 1}番 台本:「${l.text.replace(/\n/g, '')}」` });
      parts.push({ inline_data: { mime_type: 'audio/mpeg', data: fs.readFileSync(fileOf(l)).toString('base64') } });
    });
    const res = await api('POST', '/models/gemini-3.8-flash:generateContent', {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
    const out = JSON.parse(res.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') || '[]');
    for (const r of out) {
      const l = batch[r.n - 1];
      if (!l || r.ok) continue;
      bad.push(l);
      console.log(`× ${l.speaker}（${l.key}）「${l.text.replace(/\n/g, '')}」\n    聞こえた: ${r.heard}\n    問題: ${r.problem}`);
    }
  }
  return bad;
}

/**
 * 演技指導（2026-10-05 ユーザー指示「素人っぽい演技が多い。演技指導をきちんと出して」）。
 * 表情が「通常」しかない脇役などは行ごとの話し方が付かず平板になっていたので、台本の流れを Gemini に読ませて、
 * 1行ずつ ElevenLabs v4 の音声タグ（英語の演技の指示）と、読み間違えやすい言葉の読みを書かせ、tools/voice_direction.json に残す。
 * direct [話のid...] [--redo] … 書いていない行だけ書く（--redo は書き直す）。声を作り終えた話（FROZEN_EPISODES）は除く
 */
const DIRECTION_FILE = path.join(ROOT, 'tools/voice_direction.json');
function loadDirection() {
  return fs.existsSync(DIRECTION_FILE) ? JSON.parse(fs.readFileSync(DIRECTION_FILE, 'utf8')) : {};
}
async function direct(args) {
  const redo = args.includes('--redo');
  const eps = args.filter((a) => a !== '--redo');
  const dir = loadDirection();
  const all = (await collect()).filter((l) => !FROZEN_EPISODES.has(l.episode) && (!eps.length || eps.includes(l.episode)));
  for (const ep of new Set(all.map((l) => l.episode))) {
    const lines = all.filter((l) => l.episode === ep);
    for (let i = 0; i < lines.length; i += 40) {
      const batch = lines.slice(i, i + 40);
      if (!redo && batch.every((l) => dir[l.key])) continue;
      const before = lines.slice(Math.max(0, i - 8), i);
      const cast = [...new Set(batch.map((l) => l.voice))].map((n) => `- ${n}: ${CAST_VOICES[n].description}`).join('\n');
      const prompt =
        'あなたはアニメ・ゲームの音響監督です。逆転裁判風の推理劇の台本（日本語）を渡すので、声優への演技指導を1行ずつ付けてください。\n' +
        '演技指導は ElevenLabs v4 の音声タグとして、英語の短い指示（2〜6語）にする。例: "furious, shouting" "trembling, on the verge of tears" ' +
        '"smug, mocking laugh" "whispering to himself" "cold, contemptuous" "desperate, pleading" "relieved sigh, warm"。\n' +
        '場面の流れ・相手との関係・その行の感情の山を読み、プロの声優が演じるように、行ごとに抑揚と感情を変える。同じ指示の連続は避ける。' +
        '（ ）で囲まれた行は心の声なので、つぶやくように。証言（style が testimony）は証言台で話す調子で、その人物の思惑をにじませる。' +
        `登場人物の声:\n${cast}\n\n` +
        (before.length ? `直前の流れ（指導は不要）:\n${before.map((l) => `${l.speaker}「${l.text.replace(/\n/g, '')}」`).join('\n')}\n\n` : '') +
        `指導する行:\n${batch.map((l, k) => `${k + 1}. ${l.speaker}${l.style === STATEMENT_STYLE ? '（style: testimony）' : ''}「${l.text.replace(/\n/g, '')}」`).join('\n')}\n\n` +
        'JSON の配列だけを返す: [{"n":番号,"dir":"英語の演技指導"}]';
      // 返ってきた JSON が壊れていることがあるので、3回まで頼み直す
      let out;
      for (let tries = 0; !out; tries++) {
        const res = await api('POST', '/models/gemini-3.8-flash:generateContent', {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
        });
        try {
          out = JSON.parse(res.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') || '[]');
        } catch (e) {
          if (tries >= 2) throw e;
        }
      }
      for (const r of out) {
        const l = batch[r.n - 1];
        if (!l || !r.dir) continue;
        dir[l.key] = { speaker: l.speaker, text: l.text.replace(/\n/g, ''), dir: String(r.dir).replace(/[[\]]/g, '') };
      }
      fs.writeFileSync(DIRECTION_FILE, `${JSON.stringify(dir, null, 1)}\n`);
      console.log(`${ep}: ${Math.min(i + 40, lines.length)} / ${lines.length}`);
    }
  }
}

const [cmd, ...args] = process.argv.slice(2);
const run = { list, design, generate, check, release, direct }[cmd];
if (!run) {
  console.log('使い方: node tools/voices.mjs list | design [名前...] | generate [名前...] | check [名前...] [--text 文字列] [--fix] | release [名前...]');
  process.exit(1);
}
await run(args);
