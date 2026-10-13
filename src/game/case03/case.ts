import * as THREE from 'three';
import type { Engine } from '../../engine';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { technoBgm } from '../../engine/audio/technoBgm';
import { tenseBgm } from '../../engine/audio/tenseBgm';
import type { CaseData, SceneDef } from '../../genres/investigation/types';
import { CASE01 } from '../case01/case';
import { Mist } from '../props/Mist';
import { InkWall } from '../props/InkWall';
import * as S from './scripts';

/**
 * 第三話「霧の工房と鐘の鳴らない夜」。場所は4つ（工房 ― 通り ― 鐘楼 ― 検品所）を出入り口で行き来する。
 * 舞台の絵は Codex の画像生成で作った専用素材（docs/ASSETS.md）。霧と墨の伝言はコードの演出（src/game/props）。
 */

/** 反射用の環境マップ（灯晶の結晶用。1回だけ作る） */
let env: THREE.Texture | null = null;
function envMap(engine: Engine): THREE.Texture {
  if (!env) {
    const pmrem = new THREE.PMREMGenerator(engine.renderer);
    env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  return env;
}

/** 霧（場所ごとに1つ。結末で晴れる通りの霧だけ名前を付けて台本から呼べるようにする） */
function addMist(engine: Engine, half: number, named: boolean): void {
  const mist = new Mist(half);
  engine.stage.add(mist);
  if (named) engine.stage.named.set('霧', mist);
  engine.onFrame.add((dt) => mist.update(dt));
}

/** 屋内の奥の壁の外側を、同じ色の板でふさぐ */
function backWall(engine: Engine, color: string): void {
  const st = engine.stage;
  st.addBlock([40, 7, 0.2], [0, 3.5, -3.1], color, { cast: false });
  st.addBlock([40, 0.22, 0.22], [0, 0.11, -2.8], '#3e2a1c', { cast: false });
}

/** 通り：霧の町の坂道。曲もここで登録する */
async function buildStreet(engine: Engine): Promise<void> {
  engine.sound.useFile('rise', engine.assets.url('audio/se_paper_rise.mp3'));
  // 探索の曲は第二話と同じ（ユーザー指定 2026-10-04）
  engine.sound.defineBgm('霧の町', engine.assets.url('audio/bgm_market.mp3'), 0.33);
  engine.sound.defineBgm('尋問', technoBgm(0.8));
  engine.sound.defineBgm('追及', tenseBgm());
  engine.sound.defineBgm('エンディング', engine.assets.url('audio/ending.mp3'), 0.37);
  addMist(engine, 13, true);
}

/** 工房：奥は煤けた板壁。壁に光で読む墨の伝言（台本の @演出 墨 浮かぶ） */
async function buildWorkshop(engine: Engine): Promise<void> {
  backWall(engine, '#4a3628');
  const ink = new InkWall(envMap(engine));
  ink.position.set(INK_X, 0, -2.86);
  engine.stage.add(ink);
  engine.stage.named.set('墨', ink);
  engine.onFrame.add((dt) => ink.update(dt));
  addMist(engine, 8, false);
}

async function buildTower(engine: Engine): Promise<void> {
  addMist(engine, 8, false);
}

async function buildInspect(engine: Engine): Promise<void> {
  backWall(engine, '#e8e2d6');
}

/** 墨の伝言のある壁の位置 */
const INK_X = 2.0;

/** 背景の町並み（霧の幕を重ねる。色を空へ寄せずにそのまま見せる） */
const TOWN = { image: 'stage/fog_town.webp', width: 105, height: 42, z: -42, y: 8, raw: true };
const TOWER_VIEW = { image: 'stage/tower_view.webp', width: 120, height: 48, z: -42, y: 5, raw: true };

const STREET: SceneDef = {
  floor: { image: 'stage/fog_cobble.webp', width: 36, depth: 10, z: 0.45, repeat: [4.5, 1.25], color: '#eef0f2' },
  backdrop: TOWN,
  walk: { minX: -11.2, maxX: 11.2, minZ: -2.2, maxZ: 2.5 },
  cameraBounds: { minX: -7.8, maxX: 7.8 },
  obstacles: [
    { x: 3.4, z: -2.3, r: 0.8 },
    { x: -4.6, z: -2.6, r: 0.25 },
    { x: 7.8, z: -2.6, r: 0.25 },
  ],
  set: buildStreet,
  props: [
    // 奥に並ぶ家（霧の中）
    { image: 'fog_house', x: -9.6, z: -3.4, height: 4.0, blob: false },
    { image: 'fog_house', x: -1.6, z: -3.5, height: 4.4, blob: false },
    { image: 'fog_house', x: 6.0, z: -3.4, height: 4.1, blob: false },
    { image: 'fog_house', x: 11.6, z: -3.5, height: 4.3, blob: false },
    // 夜警の詰め所と街灯
    { image: 'watch_post', x: 3.4, z: -2.4, height: 2.2, castShadow: true },
    { image: 'street_lamp', x: -4.6, z: -2.6, height: 3.0, castShadow: true },
    { image: 'street_lamp', x: 7.8, z: -2.6, height: 3.0, castShadow: true },
    { image: 'crates_workshop', x: -7.6, z: -2.5, height: 0.9, castShadow: true },
    // 手前の前景
    { image: 'grass_tall_A', x: -6.0, z: 3.5, height: 1.0, sway: 0.04, occluder: true, blob: false },
    { image: 'sack_small', x: 5.4, z: 3.8, height: 0.75, occluder: true, blob: false },
  ],
};

const WORKSHOP: SceneDef = {
  floor: { image: 'stage/workshop_floor.webp', width: 30, depth: 8, z: 0.3, repeat: [3.5, 1], color: '#eae4dc' },
  backdrop: TOWN,
  walk: { minX: -6.8, maxX: 6.8, minZ: -2.0, maxZ: 2.2 },
  cameraBounds: { minX: -3.6, maxX: 3.6 },
  obstacles: [
    { x: -2.8, z: -2.2, r: 0.9 },
    { x: 0.0, z: -2.3, r: 0.7 },
    { x: -5.8, z: -2.5, r: 0.5 },
  ],
  set: buildWorkshop,
  props: [
    // 奥の壁（棚と窓の絵）。中央の板壁に墨の伝言が浮かぶ
    { image: 'workshop_wall', x: 0, z: -2.95, height: 4.2, blob: false },
    { image: 'workshop_wall', x: -12.6, z: -2.95, height: 4.2, blob: false },
    { image: 'workshop_wall', x: 12.6, z: -2.95, height: 4.2, blob: false },
    { image: 'workshop_shelf', x: -5.8, z: -2.6, height: 2.2, castShadow: true },
    { image: 'test_bell', x: -4.4, z: -2.5, height: 1.5, blob: false },
    { image: 'workbench', x: -2.8, z: -2.2, height: 1.15, castShadow: true },
    { image: 'office_desk', x: 0.0, z: -2.3, height: 1.0, castShadow: true },
    { image: 'workshop_door', x: 5.3, z: -2.55, height: 2.4, castShadow: true },
    { image: 'crates_workshop', x: -6.4, z: 3.3, height: 0.9, occluder: true, blob: false },
  ],
};

const TOWER: SceneDef = {
  floor: { image: 'stage/fog_cobble.webp', width: 30, depth: 10, z: 0.45, repeat: [4, 1.25], color: '#eceef0' },
  backdrop: TOWER_VIEW,
  walk: { minX: -6.8, maxX: 6.8, minZ: -2.2, maxZ: 2.5 },
  cameraBounds: { minX: -3.6, maxX: 3.6 },
  obstacles: [{ x: 0.8, z: -2.4, r: 1.0 }],
  set: buildTower,
  props: [
    { image: 'bell_tower', x: 0.8, z: -2.4, height: 4.6, castShadow: true },
    { image: 'street_lamp', x: -4.8, z: -2.6, height: 3.0, castShadow: true },
    { image: 'crates_workshop', x: 4.8, z: -2.5, height: 0.9, castShadow: true },
    { image: 'grass_tall_A', x: 4.6, z: 3.5, height: 1.0, sway: 0.05, occluder: true, blob: false },
  ],
};

const INSPECT: SceneDef = {
  floor: { image: 'stage/inspect_floor.webp', width: 30, depth: 8, z: 0.3, repeat: [7, 2], color: '#f4f2ee' },
  backdrop: TOWN,
  walk: { minX: -6.8, maxX: 6.8, minZ: -2.0, maxZ: 2.2 },
  cameraBounds: { minX: -3.6, maxX: 3.6 },
  obstacles: [
    { x: 0.6, z: -2.2, r: 0.9 },
    { x: 3.9, z: -2.5, r: 0.7 },
  ],
  set: buildInspect,
  props: [
    { image: 'inspect_wall', x: 0, z: -2.95, height: 4.2, blob: false },
    { image: 'inspect_wall', x: -12.6, z: -2.95, height: 4.2, blob: false },
    { image: 'inspect_wall', x: 12.6, z: -2.95, height: 4.2, blob: false },
    { image: 'emblem_banner', x: -2.4, z: -2.85, y: 0.9, height: 1.8, blob: false, sway: 0.01 },
    { image: 'inspect_desk', x: 0.6, z: -2.2, height: 1.15, castShadow: true },
    { image: 'crystal_cabinet', x: 3.9, z: -2.5, height: 2.4, castShadow: true },
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

export const CASE03: CaseData = {
  id: 'case03',
  chapter: '第三話　霧の工房と鐘の鳴らない夜',
  title: '霧の工房と鐘の鳴らない夜',
  player: 'wilnas',
  cast: [
    ...CASE01.cast,
    cast56('sandalphon', 'サンダルフォン', '#6a4a2a', 1.45),
    // カガチ・ゲン爺・夜警は役名（死ぬ役・名もない役は本名を使わない）。立ち絵はハーゼリーラ・ウーノ・帝国兵
    // 元の絵の頭身が大きいので、舞台でも会話の立ち絵でも少し小さくする
    { ...cast56('kagachi', 'カガチ', '#5a3a6a', 1.15), portraitScale: 0.86 },
    cast56('gen', 'ゲン爺', '#6a5a3a', 1.0),
    cast56('watchman', '夜警', '#3a4a5a', 1.55),
    cast56('nio', 'ニオ', '#5a7aa0', 1.25),
    cast56('makira', 'マキラ', '#8a5a2a', 1.2),
    cast56('cagliostro', 'カリオストロ', '#c05a7a', 1.15),
    cast56('clarice', 'クラリス', '#d07a3a', 1.3),
  ],
  placement: [
    // 導入では皆が通りにいる。ルオーとガレヲンは導入の途中で工房へ移る
    { id: 'wilnas', x: -2.4, z: 0.8, facing: 1, area: '通り' },
    { id: 'luwoh', x: -4.0, z: -1.9, facing: 1, area: '通り' },
    { id: 'galleon', x: -5.6, z: -1.6, facing: 1, area: '通り' },
    { id: 'wamdus', x: -7.4, z: -1.2, facing: 1, area: '通り' },
    { id: 'watchman', x: 1.2, z: -0.6, facing: -1, area: '通り' },
    { id: 'sandalphon', x: -0.6, z: -1.2, facing: -1, area: '通り', hidden: true },
    { id: 'fediel', x: 4.6, z: -1.0, facing: -1, area: '通り', hidden: true },
    { id: 'nio', x: 8.8, z: -1.4, facing: -1, area: '通り' },
    // ゲン爺ははじめから遺体の姿で工房に（作業台の前）
    { id: 'gen', x: -2.8, z: -1.1, facing: 1, area: '工房', corpse: true },
    { id: 'makira', x: -2.6, z: -1.2, facing: 1, area: '鐘楼' },
    { id: 'kagachi', x: 1.8, z: -1.2, facing: -1, area: '検品所' },
    { id: 'cagliostro', x: -4.0, z: -1.4, facing: 1, area: '検品所' },
    { id: 'clarice', x: -2.9, z: -1.7, facing: 1, area: '検品所' },
  ],
  // 証拠品＝尋問・つきつけで使う物。推理メモ（clues）＝まとめるで使う物。どれも必ずどこかで使う（tests/case-data.test.ts で確認）
  evidence: [
    { id: 'lock', name: '工房の錠', desc: '灯晶院の錠。外から鍵で掛ける作りで、内からは開け閉めできない。\nゲン爺の鍵は、帯に紐で固く結ばれたままだった。', image: 'props/evidence_lock.webp' },
    { id: 'night_log', name: '夜警の日誌', desc: '夜警が夜回りでつける日誌。夜の鐘の欄に本人の字で\n「霧深し。十歩先も見えず。工房より物音、戸の音」。', image: 'props/evidence_night_log.webp' },
    { id: 'order_slip', name: 'ゲン爺の注文控え', desc: '工房の机にあった控え。\n「恋の守り灯　一つ　フェディエル殿　宵の鐘のあと　渡し済み」。', image: 'props/evidence_order_slip.webp' },
    { id: 'charm', name: '恋の守り灯', desc: 'ゲン爺がフェディエルに渡した小さな守り灯。中の灯晶はゲン爺の手作りの本物。\n札に「良き恋を」と添え書き。', image: 'props/evidence_charm.webp' },
    { id: 'report', name: 'マキラの届け出の控え', desc: '「宵　鐘楼の綱が霧氷で固まり、今夜の鐘は鳴らせません」。\n受け取りの欄に、検品所の印と流れるような署名。', image: 'props/evidence_report.webp' },
    { id: 'perfume', name: 'カガチの香水', desc: 'カガチが差し出した香水の小瓶。「院の御用達の品」（カガチ談）。甘くない、苦い花の香り。\nガレヲンによれば、工房の戸口と試し鐘の紐に残っていた香りと同じ。', image: 'props/evidence_perfume.webp' },
    { id: 'ink_message', name: '墨の伝言', desc: '工房の壁に、本物の灯晶の光でだけ浮かぶ墨で書かれていた。\n「カガチ　偽の灯晶を求む　星祭り」。続きは古い墨で読めない。', image: 'props/evidence_ink_message.webp' },
  ],
  clues: [
    { id: 'frozen', name: '凍った鐘楼', desc: '鐘楼の綱と打ち子は、宵のうちに霧氷で固まっていた。\nゆうべ、鐘楼の鐘は一度も鳴っていない。' },
    { id: 'nio_sound', name: 'ニオの聞いた鐘', desc: 'ゆうべの「夜の鐘」は、いつもより高くて小さく、\n少し早かった。' },
    { id: 'test_bell', name: '工房の試し鐘', desc: '一面に霜が降りた工房で、試し鐘だけ霜が落ちていた。\nゆうべ、霜が降りたあとに鳴らされた跡。' },
    { id: 'scents', name: '二つの香り', desc: '工房には、古くかすかな甘い香り（フェディエル）と、\n戸口と試し鐘の紐に新しい苦い花の香り（トマの手紙と同じ）。' },
    { id: 'fediel_time', name: 'フェディエルが帰った刻', desc: 'フェディエルは宵の鐘のあと守り灯を受け取り、すぐ宿へ帰った。\nニオも、夜の鐘よりずっと前に通るのを聞いている。' },
    { id: 'not_tower', name: '鐘楼の鐘ではない', desc: '町が聞いた「夜の鐘」は、鐘楼の鐘ではなかった。' },
    { id: 'rung_inside', name: '鐘は工房で鳴らされた', desc: '町が聞いた鐘は工房の試し鐘。\n中にいた者が鳴らして、夜の鐘が鳴ったと思わせた。' },
    { id: 'not_fediel', name: '鐘のあとの女は別人', desc: '鐘のあと工房を出たのはフェディエルではない。\n苦い花の香りの主。' },
  ],
  areas: [
    { id: '通り', name: '霧の町の通り', scene: STREET, look: 'fog', entry: { x: -2.4, z: 0.8, facing: 1 }, exits: [{ to: '工房', x: -10.8, z: -0.2, radius: 0.9 }, { to: '鐘楼', x: 10.8, z: -0.2, radius: 0.9 }] },
    { id: '工房', name: 'ゲン爺の工房', scene: WORKSHOP, look: 'fog', entry: { x: 5.0, z: 0.4, facing: -1 }, exits: [{ to: '通り', x: 6.4, z: -0.2, radius: 0.9 }] },
    { id: '鐘楼', name: '鐘楼', scene: TOWER, look: 'fog', entry: { x: -5.0, z: 0.4, facing: 1 }, exits: [{ to: '通り', x: -6.4, z: -0.2, radius: 0.9 }, { to: '検品所', x: 6.4, z: -0.2, radius: 0.9 }] },
    { id: '検品所', name: '灯晶院の検品所', scene: INSPECT, look: 'fog', entry: { x: -5.0, z: 0.4, facing: 1 }, exits: [{ to: '鐘楼', x: -6.4, z: -0.2, radius: 0.9 }] },
  ],
  intro: S.INTRO,
  hotspots: [
    // 工房
    { id: 'gen', label: 'ゲン爺', x: -2.8, z: -0.6, radius: 0.8, script: S.GEN, again: S.GEN_AGAIN, markHeight: 1.0, area: '工房' },
    { id: 'lock', label: '戸の錠', x: 5.1, z: -1.9, radius: 0.7, script: S.LOCK, again: S.LOCK_AGAIN, markHeight: 2.6, area: '工房' },
    { id: 'bell', label: '試し鐘', x: -4.4, z: -1.8, radius: 0.7, script: S.BELL, again: S.BELL_AGAIN, markHeight: 1.8, area: '工房' },
    { id: 'desk', label: '机', x: 0.0, z: -1.5, radius: 0.75, script: S.DESK, again: S.DESK_AGAIN, markHeight: 1.3, area: '工房' },
    { id: 'ledger', label: '古い帳面', x: -5.8, z: -1.8, radius: 0.7, script: S.LEDGER, again: S.LEDGER_AGAIN, markHeight: 2.5, area: '工房' },
    {
      id: 'wall',
      label: '煤けた板壁',
      x: INK_X,
      z: -2.0,
      radius: 0.75,
      script: S.WALL,
      markHeight: 2.6,
      area: '工房',
      // カリオストロとクラリスに墨のことを聞いたら、守り灯で照らす
      variants: [{ when: { flags: ['ink_hint'], evidence: ['charm'] }, script: S.WALL_INK, again: S.WALL_INK_AGAIN }],
    },
    { ...talk('galleon', 'ガレヲンに話しかける', 3.6, -1.6, '工房'), script: S.GALLEON, again: S.GALLEON_AGAIN },
    { ...talk('luwoh', 'ルオーに話しかける', 1.0, -1.0, '工房'), script: S.LUWOH },
    // 通り
    { id: 'watchpost', label: '夜警の詰め所', x: 3.4, z: -1.6, radius: 0.85, script: S.WATCHPOST, again: S.WATCHPOST_AGAIN, markHeight: 2.4, area: '通り' },
    { id: 'lamp', label: '霧の街灯', x: -4.6, z: -1.9, radius: 0.7, script: S.LAMP, again: S.LAMP_AGAIN, markHeight: 3.2, area: '通り' },
    {
      ...talk('watchman', '夜警に話しかける', 1.2, -0.6, '通り'),
      script: S.WATCHMAN,
      // 尋問①は、答えの証拠品（夜警の日誌）を持つまで始めない
      variants: [
        { when: { flags: ['c1_done'] }, script: S.WATCHMAN_DONE },
        { when: { evidence: ['night_log'] }, script: S.WATCHMAN_CONFRONT },
      ],
    },
    {
      ...talk('nio', 'ニオに話しかける', 8.8, -1.4, '通り'),
      script: S.NIO,
      again: S.NIO_AGAIN,
      variants: [{ when: { flags: ['c2_done'], evidence: ['nio_sound'] }, script: S.NIO_AFTER }],
    },
    {
      ...talk('sandalphon', 'サンダルフォンに話しかける', -0.6, -1.2, '通り'),
      script: S.SANDALPHON,
      variants: [{ when: { flags: ['c3_done'] }, script: S.SANDALPHON_AFTER }],
    },
    {
      ...talk('fediel', 'フェディエルに話しかける', 4.6, -1.0, '通り'),
      script: S.FEDIEL,
      // 尋問②は、夜警の話を崩して、答えの証拠品（注文控え）を持つまで始めない
      variants: [
        { when: { flags: ['c2_done'] }, script: S.FEDIEL_AFTER },
        { when: { flags: ['c1_done'], evidence: ['order_slip'] }, script: S.FEDIEL_CONFRONT },
        { when: { flags: ['c1_done'] }, script: S.FEDIEL_NOT_READY },
      ],
    },
    {
      ...talk('wamdus', 'ワムデュスに話しかける', -7.4, -1.2, '通り'),
      script: S.WAMDUS,
      again: S.WAMDUS_AGAIN,
      variants: [{ when: { flags: ['c3_done'] }, script: S.WAMDUS_AFTER }],
    },
    // 鐘楼
    { id: 'rope', label: '鐘楼の綱', x: 0.2, z: -1.6, radius: 0.65, script: S.ROPE, again: S.ROPE_AGAIN, markHeight: 1.8, area: '鐘楼' },
    { id: 'bigbell', label: '鐘', x: 1.6, z: -1.6, radius: 0.65, script: S.BIG_BELL, again: S.BIG_BELL_AGAIN, markHeight: 2.9, area: '鐘楼' },
    { ...talk('makira', 'マキラに話しかける', -2.6, -1.2, '鐘楼'), script: S.MAKIRA, again: S.MAKIRA_AGAIN },
    // 検品所
    { id: 'cabinet', label: '灯晶の棚', x: 3.9, z: -1.7, radius: 0.8, script: S.CABINET, again: S.CABINET_AGAIN, markHeight: 2.7, area: '検品所' },
    { id: 'emblem', label: '灯晶院の紋', x: -2.4, z: -2.0, radius: 0.7, script: S.EMBLEM, again: S.EMBLEM_AGAIN, markHeight: 2.9, area: '検品所' },
    {
      ...talk('kagachi', 'カガチに話しかける', 1.8, -1.2, '検品所'),
      script: S.KAGACHI,
      again: S.KAGACHI_AGAIN,
      // 尋問③は届け出の控えを、つきつけは墨の伝言を持つまで始めない
      variants: [
        { when: { flags: ['c4_done'], evidence: ['ink_message'] }, script: S.KAGACHI_CHALLENGE },
        { when: { flags: ['c4_done'] }, script: S.KAGACHI_NO_PROOF },
        { when: { flags: ['c3_done'], evidence: ['report'] }, script: S.KAGACHI_CONFRONT },
        { when: { flags: ['c3_done'] }, script: S.KAGACHI_NOT_READY },
      ],
    },
    {
      ...talk('cagliostro', 'カリオストロとクラリスに話しかける', -4.0, -1.4, '検品所'),
      script: S.ALCHEMISTS,
      again: S.ALCHEMISTS_AGAIN,
      variants: [{ when: { flags: ['c4_done'] }, script: S.ALCHEMISTS_HINT, again: S.ALCHEMISTS_HINT_AGAIN }],
    },
  ],
  goals: [
    { when: { flags: ['solved'] }, text: '' },
    { when: { flags: ['c4_done'], evidence: ['ink_message'] }, text: '検品所のカガチに、墨の伝言をつきつける' },
    { when: { flags: ['ink_hint'] }, text: '工房の壁を、恋の守り灯で照らす' },
    { when: { flags: ['c4_done'] }, text: 'ゲン爺をよく知る者に、書き残しの心当たりを聞く' },
    { when: { flags: ['c3_done'], evidence: ['report'] }, text: '検品所のカガチを問いただす' },
    { when: { flags: ['c3_done'] }, text: 'カガチは鐘が鳴らぬと知っていたか、鐘楼で確かめる' },
    { when: { evidence: ['rung_inside', 'not_fediel'] }, text: '「まとめる」で、犯人の姿を突き止める' },
    { when: { evidence: ['fediel_time', 'scents'], notFlags: ['l3'] }, text: '「まとめる」で、鐘のあとの女を考える' },
    { when: { evidence: ['not_tower', 'test_bell'], notFlags: ['l2'] }, text: '「まとめる」で、鐘がどこで鳴ったか考える' },
    { when: { evidence: ['frozen', 'nio_sound'], notFlags: ['l1'] }, text: '「まとめる」で、ゆうべの鐘を考える' },
    { when: { flags: ['c1_done'], evidence: ['order_slip'], notFlags: ['c2_done'] }, text: '通りのフェディエルに、ゆうべのことを聞く' },
    { when: { flags: ['c1_done'], notFlags: ['c2_done'] }, text: 'ゲン爺の工房を調べ、フェディエルの隠し事を探る' },
    { when: { evidence: ['night_log'], notFlags: ['c1_done'] }, text: '夜警に、見たことを問いただす' },
    { when: {}, text: '霧の町を調べて、皆の話を聞く' },
  ],
  bgm: { field: '霧の町', confront: '尋問' },
  // 第三話からは、行き先をリストから選んで移る（ユーザー希望 2026-10-04）
  travel: 'list',
  talismans: 5,
  shouts: { present: '刮目せよ！' },
  logic: {
    title: 'まとめる',
    hint: '関係のありそうな推理メモを2つ選んで、つなげよう。',
    pairs: [
      { a: 'frozen', b: 'nio_sound', script: S.LOGIC_1, flag: 'l1' },
      { a: 'not_tower', b: 'test_bell', script: S.LOGIC_2, flag: 'l2' },
      { a: 'fediel_time', b: 'scents', script: S.LOGIC_3, flag: 'l3' },
      { a: 'rung_inside', b: 'not_fediel', script: S.LOGIC_4, flag: 'l4' },
    ],
    miss: S.LOGIC_MISS,
    done: S.LOGIC_DONE,
  },
  confrontations: {
    watchman: {
      witness: 'watchman',
      title: '鐘のあと出てきたのはフェディエル',
      intro: S.C1_INTRO,
      statements: [
        { text: '夜の鐘が鳴って、すぐ\n工房で物音がしたであります。', press: S.C1_PRESS_1 },
        { text: '戸が開いて、あの方が出てきました。\n顔も、この目ではっきり見たであります。', press: S.C1_PRESS_2, contradiction: ['night_log'] },
        { text: '宵に工房を訪ねた女も、\nあの方ひとりであります。', press: S.C1_PRESS_3 },
      ],
      success: S.C1_SUCCESS,
      wrong: S.C1_WRONG,
      fail: S.C1_FAIL,
      hints: [S.C1_HINT_1, S.C1_HINT_2],
    },
    fediel: {
      witness: 'fediel',
      title: '頼みに行っただけ',
      intro: S.C2_INTRO,
      statements: [
        { text: '此方は宵の鐘のあと、\nゲン爺の工房を訪ねた。', press: S.C2_PRESS_1 },
        { text: 'サンチラのために、\n恋の守り灯を頼みに行ったのよ。', press: S.C2_PRESS_2, reveals: 3 },
        { text: '頼み事をして、すぐ宿へ戻った。\nそれだけぞえ。', press: S.C2_PRESS_3 },
        { text: '……ゲン爺からは、何も\n受け取ってはおらぬ。', press: S.C2_PRESS_4, contradiction: ['order_slip'], hidden: true },
      ],
      success: S.C2_SUCCESS,
      wrong: S.C2_WRONG,
      fail: S.C2_FAIL,
      hints: [S.C2_HINT_1, S.C2_HINT_2],
    },
    sandalphon_fight: {
      witness: 'sandalphon',
      title: '言い争いの末に',
      label: '推理対決',
      intro: S.C3_INTRO,
      statements: [
        { text: 'フェディエルは宵の鐘のあと、\n工房で職人と会っていた。', press: S.C3_PRESS_1 },
        { text: '守り灯をめぐって二人は言い争い、\n職人は突き飛ばされたんだ。', press: S.C3_PRESS_2, contradiction: ['charm'] },
        { text: '傷を負った職人は、夜に自分で\n試し鐘を鳴らし、力尽きた。', press: S.C3_PRESS_3 },
      ],
      success: S.C3_SUCCESS,
      wrong: S.C3_WRONG,
      fail: S.C3_FAIL,
      hints: [S.C3_HINT_1, S.C3_HINT_2],
    },
    kagachi_alibi: {
      witness: 'kagachi',
      title: '夜の鐘のころは検品所にいた',
      intro: S.C4_INTRO,
      statements: [
        { text: '夜の鐘のころ、わたくしは\nこの検品所で検品をしておりました。', press: S.C4_PRESS_1 },
        { text: '町で鳴った鐘は、ここまで\nかすかに届きましたわ。', press: S.C4_PRESS_2 },
        { text: '鐘楼の鐘が凍っていたなど、\n今朝はじめて伺いましたの。', press: S.C4_PRESS_3, contradiction: ['report'] },
      ],
      success: S.C4_SUCCESS,
      wrong: S.C4_WRONG,
      fail: S.C4_FAIL,
      hints: [S.C4_HINT_1, S.C4_HINT_2],
    },
    kagachi_fake: {
      witness: 'kagachi',
      title: 'でっち上げ',
      bgm: '追及',
      intro: S.C5_INTRO,
      statements: [
        { text: 'その墨の文字、あなた方が\n今朝こしらえたのでしょう。', press: S.C5_PRESS_1 },
        { text: '光で読む墨など、職人の作り話。\nわたくしは信じませんわ。', press: S.C5_PRESS_2 },
        { text: '仮に本物でも、わたくしの名を\n騙った誰かの仕業ですわ。', press: S.C5_PRESS_3 },
        { text: '本物の灯晶は、すべてこの棚の中。\n鍵はわたくしが預かっております。', press: S.C5_PRESS_4, reveals: 4 },
        { text: '棚の外の灯りで浮かぶ文字など、\nこの町のどこにもございませんわ。', press: S.C5_PRESS_5, contradiction: ['charm'], hidden: true },
      ],
      success: S.C5_SUCCESS,
      wrong: S.C5_WRONG,
      fail: S.C5_FAIL,
      hints: [S.C5_HINT_1, S.C5_HINT_2],
    },
    kagachi_bell: {
      witness: 'kagachi',
      title: '工房には近づいていない',
      bgm: '追及',
      intro: S.C6_INTRO,
      statements: [
        { text: '断られたあとは、二度と\n工房を訪ねておりません。', press: S.C6_PRESS_1 },
        { text: 'ゆうべは宵から、ずっと\n検品所で書き物をしておりました。', press: S.C6_PRESS_2 },
        { text: '戸口に残る香りなど、\n風が運んだものでしょう。', press: S.C6_PRESS_3, reveals: 3 },
        { text: 'あの香りは、この町の女なら\n誰でもまとう香水ですわ。', press: S.C6_PRESS_4, contradiction: ['perfume'], hidden: true },
      ],
      success: S.C6_SUCCESS,
      wrong: S.C5_WRONG,
      fail: S.C5_FAIL,
      hints: [S.C6_HINT_1, S.C6_HINT_2],
    },
    kagachi_lock: {
      witness: 'kagachi',
      title: '錠を掛けたのは別の者',
      bgm: '追及',
      intro: S.C7_INTRO,
      statements: [
        { text: '工房の錠など、鍵を持つ誰かが\n昼のうちに掛けたのでしょう。', press: S.C7_PRESS_1 },
        { text: '院の錠の鍵なら、職人は\nみな持っておりますもの。', press: S.C7_PRESS_2, contradiction: ['lock'] },
        { text: '錠を掛けた者を探すなら、\n職人を当たるのが筋ですわ。', press: S.C7_PRESS_3 },
      ],
      success: S.C7_SUCCESS,
      wrong: S.C5_WRONG,
      fail: S.C5_FAIL,
      hints: [S.C7_HINT_1, S.C7_HINT_2],
    },
  },
  challenges: {
    sandalphon_lock: {
      witness: 'sandalphon',
      title: '鐘のあと、別の者がいた証拠',
      question: '鐘のあと、工房に別の者がいた証拠を出せ',
      answer: ['lock'],
      success: S.K1_SUCCESS,
      wrong: S.K1_WRONG,
      fail: S.C3_FAIL,
      hints: [S.K1_HINT_1, S.K1_HINT_2],
    },
    kagachi_met: {
      witness: 'kagachi',
      title: '職人と会っていた証拠',
      question: 'それで？　わたくしがあの職人と会っていた証拠は、見つかりまして？',
      answer: ['ink_message'],
      success: S.K2_SUCCESS,
      wrong: S.K2_WRONG,
      fail: S.K2_FAIL,
      hints: [S.K2_HINT_1, S.K2_HINT_2],
    },
  },
  ending: S.ENDING,
};
