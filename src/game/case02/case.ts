import * as THREE from 'three';
import type { Engine } from '../../engine';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { glowTexture } from '../../engine/paper/textures';
import { Crystal } from '../../engine/stage/Crystal';
import { technoBgm } from '../../engine/audio/technoBgm';
import { tenseBgm } from '../../engine/audio/tenseBgm';
import type { CaseData, SceneDef } from '../../genres/investigation/types';
import { CASE01 } from '../case01/case';
import { FishTank } from '../props/FishTank';
import * as S from './scripts';

/**
 * 第二話「雲市場と二つの灯晶」。場所は3つ（広場・帳場・乗り場）を出入り口で行き来する。
 * 舞台の絵は Codex の画像生成で作った専用素材（docs/ASSETS.md）。水槽だけはコードの立体。
 */

const RAIL_Z = -3.05;

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

/** 奥の手すり（雲の海との境） */
function railing(engine: Engine, half: number): void {
  const st = engine.stage;
  for (let x = -half; x <= half + 0.01; x += 2.4) st.addBlock([0.18, 1.05, 0.18], [x, 0.52, RAIL_Z], '#5a3421');
  st.addBlock([half * 2 + 0.4, 0.1, 0.12], [0, 1.0, RAIL_Z], '#7a4b2e', { cast: false });
  st.addBlock([half * 2 + 0.4, 0.07, 0.08], [0, 0.55, RAIL_Z], '#7a4b2e', { cast: false });
  st.addBlock([half * 2 + 20, 0.5, 0.4], [0, -0.25, -4.55], '#5a3421', { cast: false });
}

/** 名前だけの目印（カメラで映す所） */
function mark(engine: Engine, name: string, x: number, y: number, z: number): void {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  engine.stage.add(o);
  engine.stage.named.set(name, o);
}

/** 広場：市場灯の台座・空魚の水槽・わたあめ屋台 */
async function buildPlaza(engine: Engine): Promise<void> {
  const st = engine.stage;
  railing(engine, 15);
  // 曲（この話で使うもの）と開幕の紙の音
  engine.sound.useFile('rise', engine.assets.url('audio/se_paper_rise.mp3'));
  // 探索の曲（ユーザー提供、2026-10-04）。カフェの曲より 0.5dB 大きいので少し下げてそろえた（350Hz 以下を除いた大きさで比べた）
  engine.sound.defineBgm('市場', engine.assets.url('audio/bgm_market.mp3'), 0.33);
  engine.sound.defineBgm('尋問', technoBgm(0.8));
  engine.sound.defineBgm('追及', tenseBgm());
  engine.sound.defineBgm('エンディング', engine.assets.url('audio/ending.mp3'), 0.37);
  // 市場灯（最初は消えている。結末で灯る）。台座の絵（props の market_pedestal）の、灯籠の箱の中に収まる高さ
  const lantern = new THREE.Group();
  lantern.position.set(0, PEDESTAL_LAMP_Y, -1.72);
  lantern.visible = false;
  const crystal = new Crystal({ height: 0.3, envMap: envMap(engine) });
  lantern.add(crystal);
  engine.onFrame.add((dt) => crystal.update(dt));
  const light = new THREE.PointLight('#ffd49a', 0, 10, 1.6);
  light.position.y = 0.7;
  light.userData.on = 10;
  lantern.add(light);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffdca8', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.name = 'glow';
  glow.position.y = 0.05;
  glow.material.opacity = 0.55;
  glow.userData.size = 1.0;
  glow.scale.setScalar(0.001);
  lantern.add(glow);
  st.add(lantern);
  st.named.set('台座', lantern);
  // 空魚の水槽
  const tank = new FishTank(envMap(engine));
  tank.position.set(-9.0, 0, -2.0);
  st.add(tank);
  st.named.set('水槽', tank);
  engine.onFrame.add((dt) => tank.update(dt));
  // 組み立て・場所の移動で、ほかの装置と一緒に床から伸びる
  st.addRaiser({ x: tank.position.x, set: (k) => (tank.scale.y = Math.max(0.001, k)) });
  tank.userData.camY = 1.0;
}

/** 帳場：商会の中。奥は壁（壁の絵の外側は同じ色の板でふさぐ） */
async function buildOffice(engine: Engine): Promise<void> {
  const st = engine.stage;
  st.addBlock([40, 7, 0.2], [0, 3.5, -3.1], '#6e4a2c', { cast: false });
  st.addBlock([40, 0.22, 0.22], [0, 0.11, -2.8], '#4a2e1a', { cast: false });
}

/** 乗り場：昇降籠の綱は絵の上端より上も、雲の上まで伸ばす */
async function buildLift(engine: Engine): Promise<void> {
  const st = engine.stage;
  railing(engine, 8);
  st.addCylinder(0.035, 10, [3.0, 2.95, -2.05], '#a8875a', false);
  mark(engine, '昇降籠', 3.0, 1.0, -1.4);
}

/** 台座の絵の高さと、灯籠の箱の中心の高さ（絵の上から約2割の所） */
const PEDESTAL_H = 2.5;
const PEDESTAL_LAMP_Y = PEDESTAL_H * 0.8;

/** 背景の町並み・空（色を空へ寄せず、そのまま見せる） */
const MARKET_SKY = { image: 'stage/market_town.webp', width: 105, height: 42, z: -42, y: 9, raw: true };
const LIFT_SKY = { image: 'stage/lift_sky.webp', width: 130, height: 52, z: -42, y: 6, raw: true };

const PLAZA: SceneDef = {
  floor: { image: 'stage/market_stone.webp', width: 44, depth: 10, z: 0.45, repeat: [11, 2.5], color: '#f2ece4' },
  backdrop: MARKET_SKY,
  walk: { minX: -13.8, maxX: 13.8, minZ: -2.2, maxZ: 2.5 },
  cameraBounds: { minX: -10.5, maxX: 10.5 },
  obstacles: [
    { x: 0, z: -1.8, r: 0.5 },
    { x: -9.0, z: -2.0, r: 0.85 },
    { x: 7.8, z: -2.3, r: 0.6 },
    { x: 9.0, z: -2.3, r: 0.6 },
    { x: 1.4, z: -1.7, r: 0.3 },
    { x: 12.6, z: -2.5, r: 0.8 },
    { x: -12.4, z: -2.5, r: 0.7 },
  ],
  set: buildPlaza,
  props: [
    // 市場灯の台座（灯籠の箱は空。結末で中に灯晶が灯る）
    { image: 'market_pedestal', x: 0, z: -1.8, height: PEDESTAL_H, castShadow: true },
    // 屋台と商会の看板（帳場は西＝左の端）
    { image: 'stall_cotton', x: 8.4, z: -2.3, height: 2.2, castShadow: true },
    { image: 'stall_fruit', x: 12.6, z: -2.5, height: 1.6, castShadow: true },
    { image: 'shop_sign', x: -12.9, z: -1.4, height: 1.4, sway: 0.02, blob: false, y: 1.2 },
    { image: 'crates_market', x: -12.0, z: -2.5, height: 1.1, castShadow: true },
    // 旗飾り（手すりの上）
    { image: 'bunting', x: -8.0, z: -3.0, y: 2.2, height: 0.45, blob: false, sway: 0.02 },
    { image: 'bunting', x: -2.6, z: -3.0, y: 2.3, height: 0.45, blob: false, sway: 0.02 },
    { image: 'bunting', x: 3.0, z: -3.0, y: 2.2, height: 0.45, blob: false, sway: 0.02 },
    { image: 'bunting', x: 10.2, z: -3.0, y: 2.6, height: 0.45, blob: false, sway: 0.02 },
    // 左の木立と旗・灯り
    { image: 'tree_medium_A', x: -14.8, z: -2.6, height: 3.4, cross: true, castShadow: true, sway: 0.015 },
    { image: 'banner_small_red', x: -4.8, z: -2.9, height: 1.35, sway: 0.02 },
    { image: 'banner_small_blue', x: 4.6, z: -2.9, height: 1.35, sway: 0.02 },
    { image: 'lamp_small', x: -9.6, z: RAIL_Z + 0.05, y: 1.05, height: 0.5, blob: false },
    { image: 'lamp_small', x: 6.4, z: RAIL_Z + 0.05, y: 1.05, height: 0.5, blob: false },
    // パレタの画材箱（台座のすぐ脇）
    { image: 'paintbox', x: 1.4, z: -1.7, height: 0.55, castShadow: true, id: 'paintbox' },
    // 手前の前景
    { image: 'grass_tall_A', x: -8.4, z: 3.5, height: 1.1, sway: 0.05, occluder: true, blob: false },
    { image: 'sack_small', x: 2.6, z: 3.8, height: 0.75, occluder: true, blob: false },
    { image: 'flower_patch_small', x: 10.4, z: 3.35, height: 0.55, sway: 0.04, occluder: true, blob: false },
  ],
};

const OFFICE: SceneDef = {
  floor: { image: 'stage/office_floor.webp', width: 30, depth: 8, z: 0.3, repeat: [7, 2], color: '#f0e6dc' },
  backdrop: LIFT_SKY,
  walk: { minX: -6.6, maxX: 6.6, minZ: -2.0, maxZ: 2.2 },
  cameraBounds: { minX: -3.5, maxX: 3.5 },
  obstacles: [{ x: 1.4, z: -2.1, r: 0.9 }],
  set: buildOffice,
  props: [
    // 奥の壁（棚と窓の絵）を2枚並べる
    { image: 'office_wall', x: -6.3, z: -2.95, height: 4.2, blob: false },
    { image: 'office_wall', x: 6.3, z: -2.95, height: 4.2, blob: false },
    // 帳場の机と鍵掛け
    { image: 'office_desk', x: 1.4, z: -2.1, height: 1.15, castShadow: true },
    { image: 'key_rack', x: -2.2, z: -2.85, y: 1.25, height: 0.36, blob: false },
    { image: 'crates_market', x: 5.4, z: -2.4, height: 0.9, castShadow: true },
    { image: 'sack_small', x: -5.6, z: 3.4, height: 0.8, occluder: true, blob: false },
  ],
};

const LIFT: SceneDef = {
  floor: { image: 'stage/pier_planks.webp', width: 30, depth: 10, z: 0.45, repeat: [8, 2.5], color: '#e8dcd0' },
  backdrop: LIFT_SKY,
  walk: { minX: -6.6, maxX: 6.6, minZ: -2.2, maxZ: 2.5 },
  cameraBounds: { minX: -3.5, maxX: 3.5 },
  obstacles: [
    { x: 3.0, z: -2.0, r: 0.75 },
    { x: -2.0, z: -2.0, r: 0.75 },
  ],
  set: buildLift,
  props: [
    // 昇降籠と、トマの荷車（荷台に空の木箱）
    { image: 'lift_cage', x: 3.0, z: -2.05, height: 3.0, castShadow: true },
    { image: 'handcart', x: -2.0, z: -2.0, height: 1.1, castShadow: true },
    { image: 'rope_bundle_large', x: 5.4, z: -2.5, height: 0.7, castShadow: true },
    { image: 'sack_small', x: -4.6, z: -2.5, height: 0.6, castShadow: true },
    { image: 'grass_small', x: -6.4, z: -1.2, height: 0.5, sway: 0.05 },
    { image: 'grass_tall_A', x: 4.6, z: 3.5, height: 1.0, sway: 0.05, occluder: true, blob: false },
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

export const CASE02: CaseData = {
  id: 'case02',
  chapter: '第二話　雲市場と二つの灯晶',
  title: '雲市場と二つの灯晶',
  player: 'wilnas',
  cast: [
    ...CASE01.cast,
    cast56('siero', 'シェロカルテ', '#4f7f3a', 1.05),
    // トマは役名（死ぬ役は本名を使わない）。立ち絵はモブおじ
    cast56('toma', 'トマ', '#7a5a3a', 1.5),
    cast56('paleta', 'パレタ', '#2f6f7a', 1.15),
    cast56('santhira', 'サンチラ', '#c0405a', 1.3),
    cast56('lyria', 'ルリア', '#3a7ab8', 1.2),
    cast56('sandalphon', 'サンダルフォン', '#6a4a2a', 1.45),
  ],
  placement: [
    // 導入では皆が広場にいる。ルオーとシェロカルテは導入の終わりに帳場へ移る
    { id: 'wilnas', x: -4.4, z: 0.8, facing: 1, area: '広場' },
    { id: 'wamdus', x: -10.6, z: -1.0, facing: 1, area: '広場' },
    { id: 'galleon', x: -6.2, z: -1.9, facing: 1, area: '広場' },
    { id: 'luwoh', x: -2.8, z: -2.0, facing: 1, area: '広場' },
    { id: 'sandalphon', x: -3.4, z: -1.0, facing: 1, area: '広場', hidden: true },
    { id: 'toma', x: -1.2, z: -0.4, facing: 1, area: '広場' },
    { id: 'siero', x: 2.4, z: 0.2, facing: -1, area: '広場' },
    { id: 'paleta', x: 3.2, z: -0.8, facing: -1, area: '広場' },
    { id: 'fediel', x: 6.0, z: -1.7, facing: -1, area: '広場' },
    { id: 'lyria', x: 10.2, z: -1.0, facing: -1, area: '広場' },
    { id: 'santhira', x: 11.8, z: -1.6, facing: -1, area: '広場' },
  ],
  // 証拠品＝尋問でつきつける物。推理メモ（clues）＝まとめるで使う物。どれも必ずどこかで使う（tests/case-data.test.ts で確認）
  evidence: [
    { id: 'box_crystal', name: '画材箱の灯晶', desc: 'パレタの画材箱から出てきた灯晶。\n商会の前掛けに包まれていた。', image: 'props/evidence_box_crystal.webp' },
    { id: 'floor_crystal', name: '台の下の灯晶', desc: 'トマが「台の下で拾った」と持ってきた灯晶。\nガラスの中に光を宿す芯がある。芯は灯晶院の職人の型でしか作れない（ルオー談）。', image: 'props/evidence_floor_crystal.webp' },
    { id: 'painting', name: 'パレタの絵', desc: '鐘ひとつの雲市場を、帳場の露台から描いた絵。\n鐘楼が鳴り、市場灯はまだ灯っている。', image: 'props/evidence_painting.webp' },
    { id: 'letter', name: '恋文', desc: 'フェディエルとサンチラが拾った、差出人の無い手紙。\n『次の荷は鐘ふたつ　昇降籠の下にて』。苦い花の香りがする。', image: 'props/evidence_letter.webp' },
    { id: 'cart_ledger', name: '荷車の貸し出し帳', desc: '商会の荷車の貸し出し帳。\nトマが「鐘ふたつ」に一台借りている。', image: 'props/evidence_cart_ledger.webp' },
    { id: 'seal', name: '封蝋のかけら', desc: '恋文の封に使われていた封蝋。紋は灯晶院のもの。\n紋の端が少し欠けている。', image: 'props/evidence_seal.webp' },
  ],
  clues: [
    { id: 'two_crystals', name: '二つの灯晶', desc: '消えた市場灯は一つ。なのに、灯晶が二つ出てきた。' },
    { id: 'tank', name: '水槽の空魚', desc: '二つの灯晶を水槽に近づけると、\n空魚は画材箱の灯晶にだけ寄ってきた。' },
    { id: 'pedestal_key', name: '台座の鍵', desc: '市場灯の台座は鍵で開ける作り。こじ開けた跡は無い。\n鍵を持つのはシェロカルテとトマだけ。' },
    { id: 'cart_booking', name: '鐘ふたつの荷車', desc: 'トマは、鐘ふたつに商会の荷車を借りている。\n行き先は昇降籠の乗り場。' },
    { id: 'fake_floor', name: 'トマの灯晶は偽物', desc: 'トマが拾った灯晶は偽物。本物は画材箱の方。' },
    { id: 'code', name: '恋文は符丁', desc: '恋文は、荷の受け渡しを決めた取引の符丁だった。' },
    { id: 'key_holder', name: 'すり替えたのは鍵を持つ者', desc: '台座を開けて市場灯をすり替えられたのは、\n鍵を持つ者だけ。' },
    { id: 'to_toma', name: '手紙はトマ宛て', desc: '符丁の手紙は、鐘ふたつに荷車を借りた\nトマ宛ての取引。' },
  ],
  areas: [
    { id: '広場', name: '市場の広場', scene: PLAZA, look: 'day', entry: { x: -4.4, z: 0.8, facing: 1 }, exits: [{ to: '帳場', x: -13.4, z: -0.2, radius: 0.9 }, { to: '乗り場', x: 13.4, z: -0.2, radius: 0.9 }] },
    { id: '帳場', name: '商会の帳場', scene: OFFICE, look: 'day', entry: { x: 5.0, z: 0.4, facing: -1 }, exits: [{ to: '広場', x: 6.2, z: -0.2, radius: 0.9 }] },
    { id: '乗り場', name: '昇降籠の乗り場', scene: LIFT, look: 'day', entry: { x: -5.0, z: 0.4, facing: 1 }, exits: [{ to: '広場', x: -6.2, z: -0.2, radius: 0.9 }] },
  ],
  intro: S.INTRO,
  hotspots: [
    // 広場
    { id: 'pedestal', label: '市場灯の台座', x: 0, z: -1.1, radius: 0.85, script: S.PEDESTAL, again: S.PEDESTAL_AGAIN, markHeight: 2.85, area: '広場' },
    {
      id: 'tank',
      label: '空魚の水槽',
      x: -9.0,
      z: -1.2,
      radius: 1.0,
      script: S.TANK,
      again: S.TANK_AGAIN,
      markHeight: 1.9,
      area: '広場',
      // 尋問①のあと、二つの灯晶を近づけてみる
      variants: [{ when: { flags: ['c1_done'] }, script: S.TANK_TEST, again: S.TANK_TEST_AGAIN }],
    },
    { id: 'cotton', label: 'わたあめ屋台', x: 8.4, z: -1.6, radius: 0.85, script: S.COTTON, again: S.COTTON_AGAIN, markHeight: 2.35, area: '広場' },
    { id: 'paintbox', label: 'パレタの画材箱', x: 1.4, z: -1.15, radius: 0.6, script: S.PAINTBOX, again: S.PAINTBOX_AGAIN, markHeight: 0.95, area: '広場' },
    { ...talk('paleta', 'パレタに話しかける', 3.2, -0.8, '広場'), script: S.PALETA, again: S.PALETA_AGAIN },
    { ...talk('lyria', 'ルリアに話しかける', 10.2, -1.0, '広場'), script: S.LYRIA, again: S.LYRIA_AGAIN },
    { ...talk('fediel', 'フェディエルに話しかける', 6.0, -1.7, '広場'), script: S.FEDIEL, again: S.FEDIEL_AGAIN },
    {
      ...talk('sandalphon', 'サンダルフォンに話しかける', -3.4, -1.0, '広場'),
      script: S.SANDALPHON,
      again: S.SANDALPHON_AGAIN,
      variants: [{ when: { flags: ['c3_done'] }, script: S.SANDALPHON_AFTER, again: S.SANDALPHON_AFTER_AGAIN }],
    },
    {
      ...talk('santhira', 'サンチラに話しかける', 11.8, -1.6, '広場'),
      script: S.SANTHIRA,
      again: S.SANTHIRA_AGAIN,
      // 尋問②は、答えの証拠品（荷車の貸し出し帳）を持つまで始めない
      variants: [
        { when: { flags: ['c2_done'] }, script: S.SANTHIRA_DONE },
        { when: { evidence: ['cart_ledger'] }, script: S.SANTHIRA_CONFRONT },
      ],
    },
    { ...talk('wamdus', 'ワムデュスに話しかける', -10.6, -1.0, '広場'), script: S.WAMDUS },
    { ...talk('galleon', 'ガレヲンに話しかける', -6.2, -1.9, '広場'), script: S.GALLEON, again: S.GALLEON_AGAIN },
    {
      ...talk('toma', 'トマに話しかける', -1.2, -0.4, '広場'),
      id: 'toma_plaza',
      script: S.TOMA_PLAZA,
      // 尋問①のあと、トマは乗り場へ移る
      when: { notFlags: ['c1_done'] },
      variants: [{ when: { evidence: ['painting'] }, script: S.TOMA_CONFRONT_1 }],
    },
    // 帳場
    { ...talk('siero', 'シェロカルテに話しかける', 3.6, -1.2, '帳場'), script: S.SIERO, again: S.SIERO_AGAIN },
    { id: 'keyrack', label: '鍵掛け', x: -2.2, z: -2.0, radius: 0.85, script: S.KEYRACK, again: S.KEYRACK_AGAIN, markHeight: 1.8, area: '帳場' },
    { id: 'desk', label: '帳場の机', x: 1.4, z: -1.3, radius: 0.9, script: S.DESK, again: S.DESK_AGAIN, markHeight: 1.3, area: '帳場' },
    {
      ...talk('luwoh', 'ルオーに話しかける', -0.6, -1.4, '帳場'),
      script: S.LUWOH,
      variants: [{ when: { flags: ['c2_done'] }, script: S.LUWOH_SEAL, again: S.LUWOH_SEAL_AGAIN }],
    },
    // 乗り場
    { id: 'lift', label: '昇降籠', x: 3.0, z: -1.3, radius: 0.95, script: S.LIFT, again: S.LIFT_AGAIN, markHeight: 3.3, area: '乗り場' },
    { id: 'cart', label: 'トマの荷車', x: -2.0, z: -1.3, radius: 0.9, script: S.CART, again: S.CART_AGAIN, markHeight: 1.3, area: '乗り場' },
    {
      ...talk('toma', 'トマに話しかける', 0.4, -1.4, '乗り場'),
      id: 'toma_lift',
      script: S.TOMA_LIFT,
      when: { flags: ['c1_done'] },
      variants: [
        // 最後の尋問（④→④の続き）は、答えの証拠品（恋文・封蝋のかけら）を持つまで始めない
        { when: { flags: ['l4'], evidence: ['letter', 'seal'] }, script: S.TOMA_CONFRONT_4 },
        { when: { flags: ['l4'] }, script: S.TOMA_NOT_READY },
      ],
    },
  ],
  goals: [
    { when: { flags: ['solved'] }, text: '' },
    { when: { flags: ['l4'], evidence: ['letter', 'seal'] }, text: '昇降籠の乗り場のトマを問いただす' },
    { when: { flags: ['l4'] }, text: '問いただす前に、恋文の謎を解く' },
    { when: { evidence: ['key_holder', 'to_toma'] }, text: '「まとめる」で、すり替えた者を突き止める' },
    { when: { evidence: ['code', 'cart_booking'], notFlags: ['l3'] }, text: '「まとめる」で、符丁の手紙の宛先を考える' },
    { when: { evidence: ['fake_floor', 'pedestal_key'], notFlags: ['l2'] }, text: '「まとめる」で、すり替えられた者を考える' },
    { when: { flags: ['c3_done'], evidence: ['cart_ledger'], notFlags: ['c2_done'] }, text: '広場のサンチラに、恋文の推理を聞く' },
    { when: { flags: ['c3_done'] }, text: '商会の帳場を調べる' },
    { when: { evidence: ['tank'] }, text: '「まとめる」で、本物の灯晶を見分ける' },
    { when: { flags: ['c1_done'] }, text: '空魚の水槽で、二つの灯晶を試す' },
    { when: { evidence: ['painting'] }, text: 'トマに、見たことを問いただす' },
    { when: {}, text: '市場を調べて、皆の話を聞く' },
  ],
  bgm: { field: '市場', confront: '尋問' },
  talismans: 5,
  shouts: { present: '刮目せよ！' },
  logic: {
    title: 'まとめる',
    hint: '関係のありそうな推理メモを2つ選んで、つなげよう。',
    pairs: [
      { a: 'two_crystals', b: 'tank', script: S.LOGIC_1, flag: 'l1' },
      { a: 'fake_floor', b: 'pedestal_key', script: S.LOGIC_2, flag: 'l2' },
      { a: 'code', b: 'cart_booking', script: S.LOGIC_3, flag: 'l3' },
      { a: 'key_holder', b: 'to_toma', script: S.LOGIC_4, flag: 'l4' },
    ],
    miss: S.LOGIC_MISS,
    done: S.LOGIC_DONE,
  },
  confrontations: {
    toma_saw: {
      witness: 'toma',
      title: 'パレタが盗むのを見た',
      intro: S.C1_INTRO,
      statements: [
        { text: '鐘ひとつが鳴ったとき、\nあっしは帳場の前にいやした。', press: S.C1_PRESS_1 },
        { text: 'そのとき小僧が台座に近づいて、\n灯晶を箱に入れたんでさあ。', press: S.C1_PRESS_2, contradiction: ['painting'] },
        { text: '台の下に転がってたのが、\n小僧が置き損ねた偽物ってわけで。', press: S.C1_PRESS_3 },
      ],
      success: S.C1_SUCCESS,
      wrong: S.C1_WRONG,
      fail: S.C1_FAIL,
      hints: [S.C1_HINT_1, S.C1_HINT_2],
    },
    sandalphon_fake: {
      witness: 'sandalphon',
      title: 'パレタが偽物を作った',
      label: '推理対決',
      intro: S.C3_INTRO,
      statements: [
        { text: '偽物の灯晶は、ガラスに色を塗れば\nそれらしく見せられる。', press: S.C3_PRESS_1, contradiction: ['floor_crystal'] },
        { text: '絵描きなら、色を合わせるのは\nお手のものだろう。', press: S.C3_PRESS_2 },
        { text: '少年は偽物を作り、本物と\nすり替えようとしたんだ。', press: S.C3_PRESS_3 },
      ],
      success: S.C3_SUCCESS,
      wrong: S.C3_WRONG,
      fail: S.C3_FAIL,
      hints: [S.C3_HINT_1, S.C3_HINT_2],
    },
    sandalphon_hide: {
      witness: 'sandalphon',
      title: '本物はパレタが隠した',
      label: '推理対決',
      intro: S.C3B_INTRO,
      statements: [
        { text: '画材箱は、台座のすぐ脇に\n置いてあった。', press: S.C3B_PRESS_1 },
        { text: '少年は本物を、自分の持ち物で\n包んで箱に隠したんだ。', press: S.C3B_PRESS_2, contradiction: ['box_crystal'] },
        { text: '自分の箱に隠すのが、\nいちばん怪しまれないからな。', press: S.C3B_PRESS_3 },
      ],
      success: S.C3B_SUCCESS,
      wrong: S.C3_WRONG,
      fail: S.C3_FAIL,
      hints: [S.C3B_HINT_1, S.C3B_HINT_2],
    },
    santhira: {
      witness: 'santhira',
      title: '恋文は逢い引きの約束',
      intro: S.C2_INTRO,
      statements: [
        { text: 'この恋文は、きれいな封蝋で\n閉じてありました。', press: S.C2_PRESS_1 },
        { text: '『次の荷は鐘ふたつ』は、\nふたりきりで会う時刻のことです！', press: S.C2_PRESS_2, contradiction: ['cart_ledger'] },
        { text: '昇降籠の下で、商会のお二人が\nこっそり会うんです！', press: S.C2_PRESS_3 },
      ],
      success: S.C2_SUCCESS,
      wrong: S.C2_WRONG,
      fail: S.C2_FAIL,
      hints: [S.C2_HINT_1, S.C2_HINT_2],
    },
    toma_deal: {
      witness: 'toma',
      title: '取引なんて知らない',
      bgm: '追及',
      intro: S.C4_INTRO,
      statements: [
        { text: '荷車は、帳場の用事で\n借りただけでさあ。', press: S.C4_PRESS_1 },
        { text: '鐘ふたつに昇降籠の下へ行く用なんざ、\nあっしには無えんで。', press: S.C4_PRESS_2, contradiction: ['letter'] },
        { text: '灯晶を売るなんて大それたこと、\nあっしにできるわけがねえ。', press: S.C4_PRESS_3 },
      ],
      success: S.C4_SUCCESS,
      wrong: S.C4_WRONG,
      fail: S.C4_FAIL,
      hints: [S.C4_HINT_1, S.C4_HINT_2],
    },
    toma_buyer: {
      witness: 'toma',
      title: '買い手など知らない',
      bgm: '追及',
      intro: S.C4B_INTRO,
      statements: [
        { text: '手紙は、帳場の戸の下に\n差し込まれてたんでさあ。', press: S.C4B_PRESS_1 },
        { text: 'どこの誰が書いたのか、\nあっしにはさっぱり分からねえ。', press: S.C4B_PRESS_2 },
        { text: '偉い人の後ろ盾なんて、\nあっしみてえな手代にあるわけがねえ。', press: S.C4B_PRESS_3, contradiction: ['seal'] },
      ],
      success: S.C4B_SUCCESS,
      wrong: S.C4_WRONG,
      fail: S.C4_FAIL,
      hints: [S.C4B_HINT_1, S.C4B_HINT_2],
    },
  },
  ending: S.ENDING,
};
