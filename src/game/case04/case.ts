import type { Engine } from '../../engine';
import { technoBgm } from '../../engine/audio/technoBgm';
import { tenseBgm } from '../../engine/audio/tenseBgm';
import type { CaseData, SceneDef } from '../../genres/investigation/types';
import { CASE01 } from '../case01/case';
import { Rain } from '../props/Rain';
import * as S from './scripts';

/**
 * 第四話「嵐の監獄船とルオーの罪」。場所は4つ（甲板・通路・面会室・船倉）。移動はリストから選ぶ。
 * 舞台の絵は Codex の画像生成で作った専用素材（docs/ASSETS.md）。雨と稲妻はコードの演出（src/game/props/Rain.ts）。
 */

const RAIL_Z = -3.05;

/** 甲板の手すり（雲の海との境） */
function railing(engine: Engine, half: number): void {
  const st = engine.stage;
  for (let x = -half; x <= half + 0.01; x += 2.4) st.addBlock([0.18, 1.05, 0.18], [x, 0.52, RAIL_Z], '#3e2a1e');
  st.addBlock([half * 2 + 0.4, 0.1, 0.12], [0, 1.0, RAIL_Z], '#5a3a26', { cast: false });
  st.addBlock([half * 2 + 0.4, 0.07, 0.08], [0, 0.55, RAIL_Z], '#5a3a26', { cast: false });
  st.addBlock([half * 2 + 20, 0.5, 0.4], [0, -0.25, -4.55], '#3e2a1e', { cast: false });
}

/** 屋内の奥の壁の外側を、同じ色の板でふさぐ */
function backWall(engine: Engine, color: string): void {
  const st = engine.stage;
  st.addBlock([40, 7, 0.2], [0, 3.5, -3.1], color, { cast: false });
  st.addBlock([40, 0.22, 0.22], [0, 0.11, -2.8], '#2e2018', { cast: false });
}

/** 甲板：嵐。曲もここで登録する */
async function buildDeck(engine: Engine): Promise<void> {
  engine.sound.useFile('rise', engine.assets.url('audio/se_paper_rise.mp3'));
  // 探索の曲は第四話・第五話で共通の嵐の曲（ユーザー提供「Rain and Thunder」）
  engine.sound.defineBgm('探索', engine.assets.url('audio/bgm_storm.mp3'), 0.35);
  engine.sound.defineBgm('尋問', technoBgm(0.8));
  engine.sound.defineBgm('追及', tenseBgm());
  engine.sound.defineBgm('エンディング', engine.assets.url('audio/ending.mp3'), 0.37);
  railing(engine, 13);
  // 手すりから独房の外へ垂れる綱
  engine.stage.addCylinder(0.03, 1.4, [ROPE_X, 0.55, RAIL_Z - 0.08], '#b89a6a', false);
  const rain = new Rain(14);
  engine.stage.add(rain);
  engine.stage.named.set('雨', rain);
  engine.onFrame.add((dt) => rain.update(dt));
}

async function buildInside(engine: Engine): Promise<void> {
  backWall(engine, '#3a2a20');
}

/** ルオーを入れた独房の鉄格子（手前に立てて、中のルオーが格子越しに見えるようにする） */
const LUWOH_CELL_X = 0;
async function buildCorridor(engine: Engine): Promise<void> {
  await buildInside(engine);
  const st = engine.stage;
  const z = -1.3;
  for (let x = LUWOH_CELL_X - 0.9; x <= LUWOH_CELL_X + 0.91; x += 0.225) st.addCylinder(0.025, 2.1, [x, 0, z], '#2e2a28', false);
  st.addBlock([1.95, 0.08, 0.08], [LUWOH_CELL_X, 2.1, z], '#2e2a28', { cast: false });
  st.addBlock([1.95, 0.06, 0.06], [LUWOH_CELL_X, 1.05, z], '#2e2a28', { cast: false });
}

/** 綱が結ばれている手すりの位置 */
const ROPE_X = 6.0;

const STORM = { image: 'stage/storm_sky.webp', width: 120, height: 48, z: -42, y: 6, raw: true };

/** 屋内の奥の壁（同じ絵を3枚並べて端まで覆う） */
const wall = (image: string) => [-12.6, 0, 12.6].map((x) => ({ image, x, z: -2.95, height: 4.2, blob: false as const }));

const DECK: SceneDef = {
  floor: { image: 'stage/deck_planks.webp', width: 36, depth: 10, z: 0.45, repeat: [4.5, 1.25], color: '#dfe3ea' },
  backdrop: STORM,
  walk: { minX: -11.2, maxX: 11.2, minZ: -2.2, maxZ: 2.5 },
  cameraBounds: { minX: -7.8, maxX: 7.8 },
  obstacles: [
    { x: 0, z: -2.5, r: 0.6 },
    { x: -6.4, z: -2.4, r: 0.8 },
    { x: 10.0, z: -2.5, r: 0.6 },
  ],
  set: buildDeck,
  props: [
    { image: 'ship_mast', x: 0, z: -2.6, height: 5.6, castShadow: true },
    { image: 'deck_crates', x: -6.4, z: -2.5, height: 1.3, castShadow: true },
    { image: 'barrels', x: 10.0, z: -2.5, height: 1.1, castShadow: true },
    { image: 'hanging_lantern', x: -2.6, z: -2.9, y: 1.6, height: 0.7, blob: false, sway: 0.04 },
    { image: 'hanging_lantern', x: 4.0, z: -2.9, y: 1.6, height: 0.7, blob: false, sway: 0.04 },
    { image: 'barrels', x: -9.6, z: 3.4, height: 1.0, occluder: true, blob: false },
  ],
};

const CORRIDOR: SceneDef = {
  floor: { image: 'stage/ship_floor.webp', width: 30, depth: 8, z: 0.3, repeat: [3.5, 1], color: '#e6dcd2' },
  backdrop: STORM,
  walk: { minX: -6.8, maxX: 6.8, minZ: -2.0, maxZ: 2.2 },
  cameraBounds: { minX: -3.6, maxX: 3.6 },
  obstacles: [
    { x: 2.0, z: -2.3, r: 0.7 },
    { x: 4.4, z: -2.6, r: 0.4 },
    // ルオーの独房の鉄格子
    { x: LUWOH_CELL_X - 0.6, z: -1.5, r: 0.45 },
    { x: LUWOH_CELL_X + 0.6, z: -1.5, r: 0.45 },
  ],
  set: buildCorridor,
  props: [
    ...wall('corridor_wall'),
    { image: 'cell_bars', x: -2.8, z: -2.75, height: 2.6, blob: false },
    { image: 'cell_bars', x: LUWOH_CELL_X, z: -2.75, height: 2.6, blob: false },
    { image: 'guard_desk', x: 2.0, z: -2.3, height: 1.1, castShadow: true },
    { image: 'key_cabinet', x: 4.4, z: -2.8, y: 0.9, height: 1.1, blob: false },
    { image: 'hanging_lantern', x: 1.2, z: -2.8, y: 2.0, height: 0.6, blob: false, sway: 0.03 },
  ],
};

const VISIT: SceneDef = {
  floor: { image: 'stage/ship_floor.webp', width: 30, depth: 8, z: 0.3, repeat: [3.5, 1], color: '#e6dcd2' },
  backdrop: STORM,
  walk: { minX: -6.8, maxX: 6.8, minZ: -2.0, maxZ: 2.2 },
  cameraBounds: { minX: -3.6, maxX: 3.6 },
  obstacles: [{ x: 0.2, z: -2.3, r: 0.9 }],
  set: buildInside,
  props: [
    ...wall('visit_wall'),
    { image: 'visit_table', x: 0.2, z: -2.3, height: 1.4, castShadow: true },
    { image: 'hanging_lantern', x: -2.4, z: -2.8, y: 2.0, height: 0.6, blob: false, sway: 0.03 },
  ],
};

const HOLD: SceneDef = {
  floor: { image: 'stage/ship_floor.webp', width: 30, depth: 8, z: 0.3, repeat: [3.5, 1], color: '#e2d6ca' },
  backdrop: STORM,
  walk: { minX: -6.8, maxX: 6.8, minZ: -2.0, maxZ: 2.2 },
  cameraBounds: { minX: -3.6, maxX: 3.6 },
  obstacles: [
    { x: 2.4, z: -2.4, r: 0.7 },
    { x: -1.0, z: -2.3, r: 0.6 },
    { x: -3.6, z: -2.5, r: 0.6 },
  ],
  set: buildInside,
  props: [
    ...wall('hold_wall'),
    { image: 'hold_furnace', x: 2.4, z: -2.4, height: 1.3, castShadow: true },
    { image: 'inst_crate', x: -1.0, z: -2.3, height: 0.9, castShadow: true },
    { image: 'barrels', x: -3.6, z: -2.5, height: 1.1, castShadow: true },
    { image: 'deck_crates', x: 5.6, z: -2.5, height: 1.1, castShadow: true },
  ],
};

/** 56キャラの立ち絵（tools/prepare_cast56.mjs で変換）。表情は1枚、攻撃3コマ・被弾1枚 */
const cast56 = (id: string, name: string, color: string, height: number) => ({
  id,
  name,
  color,
  height,
  defaultExpression: '通常',
  expressions: { 通常: `${id}_01_normal` },
  motions: {
    attack: [`${id}_attack_01_windup`, `${id}_attack_02_hit`, `${id}_attack_03_follow_through`],
    damage: `${id}_damage_01_hit`,
  },
});

/** 話しかける相手の調べる所（相手の少し手前） */
const talk = (id: string, label: string, x: number, z: number, area: string) => ({ id, label, actor: id, x, z: z + 0.55, radius: 1.0, area });

export const CASE04: CaseData = {
  id: 'case04',
  chapter: '第四話　嵐の監獄船とルオーの罪',
  title: '嵐の監獄船とルオーの罪',
  player: 'wilnas',
  cast: [
    ...CASE01.cast,
    cast56('sandalphon', 'サンダルフォン', '#6a4a2a', 1.45),
    { ...cast56('kagachi', 'カガチ', '#5a3a6a', 1.15), portraitScale: 0.86 },
    cast56('ilsa', 'イルザ', '#3a3a4a', 1.4),
    cast56('eustace', 'ユーステス', '#4a5058', 1.45),
    cast56('zeta', 'ゼタ', '#b04a3a', 1.3),
    cast56('beatrix', 'ベアトリクス', '#3a5a9a', 1.3),
    // ミオは役名。立ち絵はクラーバラ
    cast56('mio', 'ミオ', '#6a8a5a', 1.05),
    cast56('belial', 'ベリアル', '#5a3a6a', 1.5),
  ],
  placement: [
    { id: 'wilnas', x: -2.2, z: 0.8, facing: 1, area: '甲板' },
    { id: 'wamdus', x: -7.0, z: -1.0, facing: 1, area: '甲板' },
    { id: 'fediel', x: -4.2, z: -1.8, facing: 1, area: '甲板' },
    { id: 'galleon', x: -5.0, z: -1.6, facing: 1, area: '船倉' },
    { id: 'eustace', x: 3.4, z: -1.4, facing: -1, area: '甲板' },
    { id: 'zeta', x: 8.4, z: -1.2, facing: -1, area: '甲板' },
    { id: 'beatrix', x: 9.6, z: -1.7, facing: -1, area: '甲板' },
    { id: 'ilsa', x: 0.8, z: -0.6, facing: -1, area: '甲板', hidden: true },
    { id: 'luwoh', x: 2.0, z: -1.0, facing: -1, area: '甲板', hidden: true },
    { id: 'sandalphon', x: -0.6, z: -1.4, facing: 1, area: '甲板', hidden: true },
    // カガチははじめから遺体の姿で独房の前に
    { id: 'kagachi', x: -2.8, z: -2.0, facing: 1, area: '通路', corpse: true },
    { id: 'mio', x: -4.2, z: -1.4, facing: 1, area: '面会室' },
    { id: 'belial', x: 4.6, z: -1.2, facing: -1, area: '船倉' },
  ],
  evidence: [
    { id: 'patrol_log', name: '見回りの記録', desc: '看守の夜の見回りの記録。\n「夜の鐘のあと　独房のカガチ、歌を口ずさむ　ゼタ」。', image: 'props/evidence_patrol_log.webp' },
    { id: 'key_record', name: '独房の鍵の記録', desc: '独房の鍵の貸し出し記録。「面会のあと、鍵の持ち出しなし」。\n鍵は看守長の目の前でしか持ち出せない。', image: 'props/evidence_key_record.webp' },
    { id: 'rope', name: '換気窓の綱', desc: '甲板の手すりに結ばれ、船べりを越えて独房の換気窓の外まで\n垂れていた綱。太い綱の撚り目が、ねじれて残っている。', image: 'props/evidence_rope.webp' },
    { id: 'fur', name: '紫の毛', desc: '甲板の綱のささくれに絡んでいた、ふわふわとした紫の毛皮の毛。', image: 'props/evidence_fur.webp' },
    { id: 'cargo_ledger', name: '積荷の帳面', desc: '監獄船の積荷の帳面。最終便で「降りる者　ミオ」、\n「積む荷　灯晶院の荷　一箱」「乗る者　院の使い　一名」。', image: 'props/evidence_cargo_ledger.webp' },
    { id: 'visit_record', name: '面会の記録', desc: 'ゆうべの面会の記録。面会したのはルオーとミオ。\nルオーの欄の外に、ルオーの字で「子どもに試させた」。', image: 'props/evidence_visit_record.webp' },
    { id: 'old_knot', name: '古い結び目', desc: '綱の結び目。今どき誰も知らない、古い釣りの結び。\n旅の人がワムデュスに教えたものと同じ。', image: 'props/evidence_old_knot.webp' },
    { id: 'float', name: 'ワムの浮き', desc: '凪ノ桟橋で、旅の人がワムデュスにくれた釣りの浮き。\n糸は、旅の人が自分の首の紫の毛皮をほどいて撚ったもの。', image: 'props/evidence_float.webp' },
  ],
  clues: [
    { id: 'storm', name: '嵐の夜', desc: '最終便のあとすぐ嵐になり、朝まで船に近づけた者も、\n降りられた者もいない。' },
    { id: 'window', name: '換気窓', desc: '独房の換気窓。格子に、濡れた綱でこすれた新しい跡。\n窓の真下に寝台が寄せられていた。窓の外は甲板の真下。' },
    { id: 'last_boat', name: '最終便', desc: '最終便でミオが降り、院の荷と院の使いが乗ってきた。\n院の使いは嵐で帰れず、ひと晩船にいた。' },
    { id: 'envoy_look', name: '院の使いの身なり', desc: '院の使いは、紫のふわふわの毛皮の襟をした男。' },
    { id: 'wam_memory', name: '旅の人の思い出', desc: 'ワムデュスに灯晶の外し方と古い釣りの結びを教えた旅の人は、\n首に紫のふわふわをつけていた。' },
    { id: 'kagachi_words', name: '「子どもに試させた」', desc: 'ルオーが面会でカガチから聞き、記録の欄外に書き残した言葉。\nルオーはそのことを話そうとしない。' },
    { id: 'inside_rope', name: '窓の外から絞めた', desc: '犯人はゆうべ船の中にいた者。甲板から綱を下ろし、\n窓に寄ってきたカガチを、格子越しに綱の輪で絞めた。' },
    { id: 'envoy', name: '犯人は院の使い', desc: '綱を下ろしたのは、最終便で乗り、\n嵐で帰れなくなった院の使い。' },
    { id: 'traveler', name: '院の使い＝旅の人', desc: '院の使いは、凪ノ桟橋でワムデュスに\n灯晶の外し方を教えた旅の人。' },
  ],
  areas: [
    { id: '甲板', name: '嵐の甲板', scene: DECK, look: 'storm', entry: { x: -2.2, z: 0.8, facing: 1 }, exits: [{ to: '通路', x: -10.8, z: -0.2, radius: 0.9 }] },
    { id: '通路', name: '独房の通路', scene: CORRIDOR, look: 'lantern', entry: { x: 5.0, z: 0.4, facing: -1 }, exits: [{ to: '甲板', x: 6.4, z: -0.2, radius: 0.9 }] },
    { id: '面会室', name: '面会室', scene: VISIT, look: 'lantern', entry: { x: 5.0, z: 0.4, facing: -1 }, exits: [{ to: '甲板', x: 6.4, z: -0.2, radius: 0.9 }] },
    { id: '船倉', name: '船倉', scene: HOLD, look: 'lantern', entry: { x: -5.0, z: 0.4, facing: 1 }, exits: [{ to: '甲板', x: -6.4, z: -0.2, radius: 0.9 }] },
  ],
  travel: 'list',
  intro: S.INTRO,
  hotspots: [
    // 甲板
    {
      id: 'rope',
      label: '手すりの綱',
      x: ROPE_X,
      z: -2.2,
      radius: 0.75,
      script: S.ROPE,
      again: S.ROPE_AGAIN,
      markHeight: 1.6,
      area: '甲板',
      // ルオーの話を聞いたあと、ワムデュスが結び目に気づく
      variants: [{ when: { flags: ['l4'], evidence: ['rope'] }, script: S.ROPE_KNOT, again: S.ROPE_KNOT_AGAIN }],
    },
    { ...talk('eustace', 'ユーステスに話しかける', 3.4, -1.4, '甲板'), script: S.EUSTACE, again: S.EUSTACE_AGAIN },
    { ...talk('zeta', 'ゼタとベアトリクスに話しかける', 8.4, -1.2, '甲板'), script: S.GUARDS, again: S.GUARDS_AGAIN },
    {
      ...talk('wamdus', 'ワムデュスに話しかける', -7.0, -1.0, '甲板'),
      script: S.WAMDUS,
      again: S.WAMDUS_AGAIN,
      variants: [{ when: { flags: ['l4'] }, script: S.WAMDUS_FLOAT, again: S.WAMDUS_FLOAT_AGAIN }],
    },
    { ...talk('fediel', 'フェディエルに話しかける', -4.2, -1.8, '甲板'), script: S.FEDIEL },
    // 通路
    { id: 'cell', label: '独房', x: -2.8, z: -1.4, radius: 0.8, script: S.CELL, again: S.CELL_AGAIN, markHeight: 1.0, area: '通路' },
    { id: 'window', label: '換気窓', x: -4.6, z: -2.0, radius: 0.7, script: S.WINDOW, again: S.WINDOW_AGAIN, markHeight: 2.6, area: '通路' },
    { id: 'guard_desk', label: '看守の机', x: 2.0, z: -1.5, radius: 0.75, script: S.GUARD_DESK, again: S.GUARD_DESK_AGAIN, markHeight: 1.4, area: '通路' },
    { id: 'keys', label: '看守室の鍵掛け', x: 4.4, z: -2.0, radius: 0.7, script: S.KEYS, again: S.KEYS_AGAIN, markHeight: 2.3, area: '通路' },
    {
      ...talk('ilsa', 'イルザに話しかける', 2.8, -0.9, '通路'),
      script: S.ILSA,
      // 尋問①は、答えの証拠品（見回りの記録）を持つまで始めない
      variants: [
        { when: { flags: ['c1_done'] }, script: S.ILSA_DONE },
        { when: { evidence: ['patrol_log'] }, script: S.ILSA_CONFRONT },
      ],
    },
    // 面会室
    { id: 'visit_desk', label: '面会の記録', x: 0.2, z: -1.5, radius: 0.8, script: S.VISIT_DESK, again: S.VISIT_DESK_AGAIN, markHeight: 1.7, area: '面会室' },
    {
      ...talk('luwoh', '独房のルオーに話しかける', LUWOH_CELL_X, -0.9, '通路'),
      script: S.LUWOH,
      // 尋問③は、イルザの話を崩して、答えの証拠品（面会の記録）を持つまで始めない
      variants: [
        { when: { flags: ['c4_done'] }, script: S.LUWOH_DONE },
        { when: { flags: ['c1_done'], evidence: ['visit_record'] }, script: S.LUWOH_CONFRONT },
      ],
    },
    {
      ...talk('mio', 'ミオに話しかける', -4.2, -1.4, '面会室'),
      script: S.MIO,
      again: S.MIO_AGAIN,
      variants: [
        { when: { flags: ['c2_done'] }, script: S.MIO_DONE },
        { when: { evidence: ['cargo_ledger'] }, script: S.MIO_CONFRONT },
      ],
    },
    {
      ...talk('sandalphon', 'サンダルフォンに話しかける', 2.6, -0.8, '面会室'),
      script: S.SANDALPHON,
      // 推理対決は、尋問①のあと、答えの証拠品（鍵の記録・綱）を持つまで始めない
      variants: [
        { when: { flags: ['c3_done'] }, script: S.SANDALPHON_AFTER },
        { when: { flags: ['c1_done'], evidence: ['key_record', 'rope'] }, script: S.SANDALPHON_CONFRONT },
      ],
    },
    // 船倉
    { id: 'ledger', label: '積荷の帳面', x: -3.6, z: -1.8, radius: 0.75, script: S.LEDGER, again: S.LEDGER_AGAIN, markHeight: 1.6, area: '船倉' },
    { id: 'furnace', label: '炉', x: 2.4, z: -1.7, radius: 0.75, script: S.FURNACE, again: S.FURNACE_AGAIN, markHeight: 1.7, area: '船倉' },
    { id: 'crate', label: '院の荷', x: -1.0, z: -1.6, radius: 0.7, script: S.CRATE, again: S.CRATE_AGAIN, markHeight: 1.3, area: '船倉' },
    { ...talk('galleon', 'ガレヲンに話しかける', -5.0, -1.6, '船倉'), script: S.GALLEON },
    {
      ...talk('belial', 'ベリアルに話しかける', 4.6, -1.2, '船倉'),
      script: S.BELIAL,
      again: S.BELIAL_AGAIN,
      // 最後の尋問（④→つきつけ→⑤→つきつけ）は、答えの証拠品（紫の毛・積荷の帳面・古い結び目・ワムの浮き）を持つまで始めない
      variants: [
        { when: { flags: ['l4', 'l5'], evidence: ['fur', 'cargo_ledger', 'old_knot', 'float'] }, script: S.BELIAL_CONFRONT },
        { when: { flags: ['l4'] }, script: S.BELIAL_NOT_READY },
      ],
    },
  ],
  goals: [
    { when: { flags: ['solved'] }, text: '' },
    { when: { flags: ['l4', 'l5'], evidence: ['fur', 'old_knot', 'float'] }, text: '船倉のベリアルを問いただす' },
    { when: { flags: ['l4'], evidence: ['fur', 'old_knot', 'float'] }, text: '「まとめる」で、カガチの口を封じた者を突き止める' },
    { when: { flags: ['l4'], evidence: ['old_knot'] }, text: 'ワムデュスに、旅の人のことをもう一度聞く' },
    { when: { flags: ['l4'] }, text: '甲板の綱を、ワムデュスと見直す' },
    { when: { evidence: ['traveler', 'kagachi_words'] }, text: '「まとめる」で、ルオーが黙る理由を考える' },
    { when: { evidence: ['wam_memory', 'envoy_look'], notFlags: ['l3'] }, text: '「まとめる」で、院の使いの正体を考える' },
    { when: { evidence: ['inside_rope', 'last_boat'], notFlags: ['l2'] }, text: '「まとめる」で、綱を下ろした者を考える' },
    { when: { evidence: ['storm', 'window'], notFlags: ['l1'] }, text: '「まとめる」で、犯人の手口を考える' },
    { when: { flags: ['c1_done'], evidence: ['key_record', 'rope'], notFlags: ['c3_done'] }, text: '面会室のサンダルフォンと、推理を戦わせる' },
    { when: { evidence: ['patrol_log'], notFlags: ['c1_done'] }, text: '独房の通路のイルザを問いただす' },
    { when: {}, text: '監獄船を調べて、皆の話を聞く' },
  ],
  bgm: { field: '探索', confront: '尋問' },
  talismans: 5,
  shouts: { present: '刮目せよ！' },
  logic: {
    title: 'まとめる',
    hint: '関係のありそうな推理メモを2つ選んで、つなげよう。',
    pairs: [
      { a: 'storm', b: 'window', script: S.LOGIC_1, flag: 'l1' },
      { a: 'inside_rope', b: 'last_boat', script: S.LOGIC_2, flag: 'l2' },
      { a: 'wam_memory', b: 'envoy_look', script: S.LOGIC_3, flag: 'l3' },
      { a: 'traveler', b: 'kagachi_words', script: S.LOGIC_4, flag: 'l4' },
      { a: 'envoy', b: 'traveler', script: S.LOGIC_5, flag: 'l5' },
    ],
    miss: S.LOGIC_MISS,
    done: S.LOGIC_DONE,
  },
  confrontations: {
    ilsa: {
      witness: 'ilsa',
      title: '面会のときに殺された',
      intro: S.C1_INTRO,
      statements: [
        { text: '堅物は夕方、鉄格子越しに\nカガチと面会した。', press: S.C1_PRESS_1 },
        { text: '面会が終わったとき、カガチは\nもう息をしていなかった。', press: S.C1_PRESS_2, contradiction: ['patrol_log'] },
        { text: 'それから朝まで、独房に\n近づいた者はいない。', press: S.C1_PRESS_3 },
      ],
      success: S.C1_SUCCESS,
      wrong: S.C1_WRONG,
      fail: S.C1_FAIL,
      hints: [S.C1_HINT_1, S.C1_HINT_2],
    },
    sandalphon_return: {
      witness: 'sandalphon',
      title: 'ルオーは夜更けに戻った',
      label: '推理対決',
      intro: S.C3_INTRO,
      statements: [
        { text: '面会のあとも、カガチが\n生きていたのは認めよう。', press: S.C3_PRESS_1 },
        { text: 'だがルオーは夜更けに、\n看守室の鍵で独房へ戻ったんだ。', press: S.C3_PRESS_2, contradiction: ['key_record'] },
        { text: '船の中で動機があるのは、\nルオーだけだ。', press: S.C3_PRESS_3 },
      ],
      success: S.C3_SUCCESS,
      wrong: S.C3_WRONG,
      fail: S.C3_FAIL,
      hints: [S.C3_HINT_1, S.C3_HINT_2],
    },
    mio: {
      witness: 'mio',
      title: '最終便のあと、乗った人はいない',
      intro: S.C2_INTRO,
      statements: [
        { text: 'カガチ様は、面会のときも\nいつもどおり凛としていました。', press: S.C2_PRESS_1 },
        { text: 'わたしは面会のあと、\n最終便で船を降りました。', press: S.C2_PRESS_2 },
        { text: '最終便のあと、この船に\n乗った人はいないはずです。', press: S.C2_PRESS_3, contradiction: ['cargo_ledger'] },
      ],
      success: S.C2_SUCCESS,
      wrong: S.C2_WRONG,
      fail: S.C2_FAIL,
      hints: [S.C2_HINT_1, S.C2_HINT_2],
    },
    luwoh: {
      witness: 'luwoh',
      title: '私が殺した',
      intro: S.C4_INTRO,
      statements: [
        { text: '面会で、カガチと\n灯晶院のことを少し話した。', press: S.C4_PRESS_1 },
        { text: '夜更けに、私がカガチを\n殺したのだよ。', press: S.C4_PRESS_2 },
        { text: '私が殺したと書いておきたまえ。\nそれで終わる話なのだよ。', press: S.C4_PRESS_3, reveals: 3 },
        { text: '面会では、たいした話は\nしていない。', press: S.C4_PRESS_4, contradiction: ['visit_record'], hidden: true },
      ],
      success: S.C4_SUCCESS,
      wrong: S.C4_WRONG,
      fail: S.C4_FAIL,
      hints: [S.C4_HINT_1, S.C4_HINT_2],
    },
    belial_deck: {
      witness: 'belial',
      title: '甲板には出ていない',
      intro: S.C5_INTRO,
      statements: [
        { text: '俺は院の書類を届けに来た、\nただの使いさ。', press: S.C5_PRESS_1 },
        { text: 'ゆうべは嵐が去るまで、\n船倉で荷の番をしていた。', press: S.C5_PRESS_2 },
        { text: 'あんな嵐の甲板になんか、\n一歩も出ていないよ。', press: S.C5_PRESS_3, contradiction: ['fur'] },
      ],
      success: S.C5_SUCCESS,
      wrong: S.C5_WRONG,
      fail: S.C5_FAIL,
      hints: [S.C5_HINT_1, S.C5_HINT_2],
    },
    belial_knot: {
      witness: 'belial',
      title: '結びなど誰でもできる',
      bgm: '追及',
      intro: S.C6_INTRO,
      statements: [
        { text: 'あの綱を結んだのは、\n船乗りの誰かだろう。', press: S.C6_PRESS_1 },
        { text: '船乗りなら、どんな結びでも\nお手のものさ。', press: S.C6_PRESS_2, reveals: 4 },
        { text: '俺は書類を運ぶだけの、\nしがない使いだよ。', press: S.C6_PRESS_3 },
        { text: 'だいいち、同じ院のカガチを\n俺が殺す理由がないだろう？', press: S.C6_PRESS_5 },
        { text: 'あの結びだって、船乗りの\nよく使うありふれた結びさ。', press: S.C6_PRESS_4, contradiction: ['old_knot'], hidden: true },
      ],
      success: S.C6_SUCCESS,
      wrong: S.C6_WRONG,
      fail: S.C6_FAIL,
      hints: [S.C6_HINT_1, S.C6_HINT_2],
    },
  },
  challenges: {
    sandalphon_rope: {
      witness: 'sandalphon',
      title: '鍵を使わずに届いた道',
      question: '違うと言うなら……独房に入らずに、カガチに手が届いた道があるという証拠を出せ',
      answer: ['rope'],
      success: S.K1_SUCCESS,
      wrong: S.K1_WRONG,
      fail: S.C3_FAIL,
      hints: [S.K1_HINT_1, S.K1_HINT_2],
    },
    belial_ledger: {
      witness: 'belial',
      title: 'その毛が俺のだという証拠',
      question: '紫の毛皮の襟は、院の使いの決まりの身なりさ。その毛が俺のだって、どうして言い切れる？',
      answer: ['cargo_ledger'],
      success: S.K3_SUCCESS,
      wrong: S.K3_WRONG,
      fail: S.C5_FAIL,
      hints: [S.K3_HINT_1, S.K3_HINT_2],
    },
    belial_float: {
      witness: 'belial',
      title: '旅の人が私だという証拠',
      question: 'で？　その旅の人とやらが、この俺だっていう証拠でもあるのかい？',
      answer: ['float'],
      success: S.K2_SUCCESS,
      wrong: S.K2_WRONG,
      fail: S.K2_FAIL,
      hints: [S.K2_HINT_1, S.K2_HINT_2],
    },
  },
  ending: S.ENDING,
};
