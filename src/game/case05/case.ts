import * as THREE from 'three';
import type { Engine } from '../../engine';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { glowTexture } from '../../engine/paper/textures';
import { Crystal } from '../../engine/stage/Crystal';
import { technoBgm } from '../../engine/audio/technoBgm';
import { tenseBgm } from '../../engine/audio/tenseBgm';
import type { CaseData, SceneDef } from '../../genres/investigation/types';
import { CASE01 } from '../case01/case';
import { CASE02 } from '../case02/case';
import { CASE03 } from '../case03/case';
import { Airship } from '../props/Airship';
import { SkyFish } from '../props/SkyFish';
import * as S from './scripts';

/**
 * 第五話（最終話）「暁の空に、六竜の逆転」。場所は4つ（議場・雲市場・霧の工房・凪ノ桟橋）。移動はリストから選ぶ。
 * 持ち場ごとに操作する竜が替わる（AreaDef.player）。雲市場と霧の工房は第二話・第三話の舞台を、夜の見た目で使い回す。
 * 凪ノ桟橋は第一話の舞台と同じ部品（灯台柱の灯晶・空魚・飛空艇）を、この場所の中だけに組み直す。
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

/** 議場：曲もここで登録する。奥の壁の外側は同じ色の板でふさぐ */
async function buildCouncil(engine: Engine): Promise<void> {
  const st = engine.stage;
  engine.sound.useFile('rise', engine.assets.url('audio/se_paper_rise.mp3'));
  // 探索の曲は第四話と同じ嵐の曲。院長との総決算はラスボスの曲（どちらもユーザー提供「Rain and Thunder」「The Final Stand」）
  engine.sound.defineBgm('探索', engine.assets.url('audio/bgm_storm.mp3'), 0.35);
  engine.sound.defineBgm('ラスボス', engine.assets.url('audio/bgm_final.mp3'), 0.42);
  engine.sound.defineBgm('尋問', technoBgm(0.8));
  engine.sound.defineBgm('追及', tenseBgm());
  engine.sound.defineBgm('エンディング', engine.assets.url('audio/ending.mp3'), 0.37);
  st.addBlock([40, 7, 0.2], [0, 3.5, -3.1], '#2a2438', { cast: false });
  st.addBlock([40, 0.22, 0.22], [0, 0.11, -2.8], '#1e1a28', { cast: false });
}

/**
 * 凪ノ桟橋（第一話の舞台）。灯台柱の灯晶は、はじめから灯っている（院より古い、すり替えられていない灯り）。
 * 灯晶・空魚・飛空艇はこの場所の中に置く（第一話は場所が1つなので舞台全体に置いていた）
 */
async function buildPier(engine: Engine): Promise<void> {
  const st = engine.stage;
  const wood = '#7a4b2e';
  const woodDark = '#5a3421';
  for (let x = -12; x <= 12.01; x += 2.4) st.addBlock([0.18, 1.05, 0.18], [x, 0.52, RAIL_Z], woodDark);
  st.addBlock([24.4, 0.1, 0.12], [0, 1.0, RAIL_Z], wood, { cast: false });
  st.addBlock([24.4, 0.07, 0.08], [0, 0.55, RAIL_Z], wood, { cast: false });
  st.addBlock([44, 0.5, 0.4], [0, -0.25, -4.55], woodDark, { cast: false });
  st.addCylinder(0.15, 0.85, [6.2, 0, -2.35], woodDark);
  const lantern = new THREE.Group();
  lantern.name = '灯台柱';
  lantern.position.set(0, 2.16, -1.6);
  const crystal = new Crystal({ height: 0.85, envMap: envMap(engine) });
  lantern.add(crystal);
  engine.onFrame.add((dt) => crystal.update(dt));
  const light = new THREE.PointLight('#ffd49a', 12, 12, 1.6);
  light.position.y = 1.9;
  light.userData.on = 12;
  lantern.add(light);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffdca8', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.name = 'glow';
  glow.position.y = 0.4;
  glow.material.opacity = 0.55;
  glow.userData.size = 1.2;
  glow.scale.setScalar(1.2);
  lantern.add(glow);
  st.add(lantern);
  st.named.set('灯台柱', lantern);
  const fish = new SkyFish(new THREE.Vector3(0, 2.6, -1.6));
  st.add(fish);
  st.named.set('空魚', fish);
  const ship = new Airship(engine.tweens, { envMap: envMap(engine) });
  ship.dock.set(6.2, 0.2, -10.2);
  const trail = new THREE.Group();
  st.add(trail);
  ship.attachTrail(trail);
  st.add(ship);
  st.named.set('飛空艇', ship);
  const dock = new THREE.Object3D();
  dock.position.set(5.6, 2.6, -10.2);
  st.add(dock);
  st.named.set('飛空艇の着く所', dock);
  engine.onFrame.add((dt) => {
    fish.update(dt);
    ship.update(dt);
  });
}

const NIGHT_SKY = { image: 'stage/night_sky.webp', width: 120, height: 48, z: -42, y: 6, raw: true };

const COUNCIL: SceneDef = {
  floor: { image: 'stage/council_floor.webp', width: 30, depth: 8, z: 0.3, repeat: [3.5, 1], color: '#8f8aa0' },
  backdrop: NIGHT_SKY,
  walk: { minX: -6.8, maxX: 6.8, minZ: -2.0, maxZ: 2.2 },
  cameraBounds: { minX: -3.6, maxX: 3.6 },
  obstacles: [
    { x: 0.6, z: -2.6, r: 1.0 },
    { x: -4.6, z: -2.6, r: 0.8 },
    { x: 5.4, z: -2.6, r: 0.8 },
  ],
  set: buildCouncil,
  props: [
    ...[-12.6, 0, 12.6].map((x) => ({ image: 'council_wall', x, z: -2.95, height: 4.4, blob: false as const })),
    { image: 'council_podium', x: 0.6, z: -2.6, height: 1.9, castShadow: true },
    { image: 'council_bench', x: -4.6, z: -2.6, height: 1.1, castShadow: true },
    { image: 'council_bench', x: 5.4, z: -2.6, height: 1.1, castShadow: true },
  ],
};

/** 凪ノ桟橋（第一話の舞台から、第一話の事件の手がかりの小物を除いたもの） */
const PIER: SceneDef = {
  floor: { image: 'stage/pier_planks.webp', width: 44, depth: 10, z: 0.45, repeat: [11, 2.5], color: '#e6d6c8' },
  backdrop: { image: 'stage/cloudsea_sunset.webp', width: 150, height: 62, z: -46, y: 2 },
  walk: { minX: -10.4, maxX: 10.4, minZ: -2.25, maxZ: 2.5 },
  cameraBounds: { minX: -7.5, maxX: 7.5 },
  obstacles: [
    { x: 0, z: -1.6, r: 0.5 },
    { x: -7.9, z: -2.2, r: 0.55 },
    { x: 10.2, z: -2.3, r: 0.4 },
  ],
  set: buildPier,
  props: [
    { image: 'tree_medium_A', x: -10.9, z: -2.5, height: 3.4, cross: true, castShadow: true, sway: 0.015 },
    { image: 'bush_large_A', x: -9.5, z: -2.7, height: 1.2, sway: 0.02 },
    { image: 'small_box_goods', x: -8.0, z: -2.35, height: 0.75, castShadow: true },
    { image: 'sack_small', x: -7.35, z: -2.55, height: 0.6, castShadow: true },
    { image: 'banner_small_red', x: -5.4, z: -2.9, height: 1.35, sway: 0.02 },
    { image: 'banner_small_blue', x: 2.2, z: -2.9, height: 1.35, sway: 0.02 },
    { image: 'lamp_small', x: -4.8, z: RAIL_Z + 0.05, y: 1.05, height: 0.5, blob: false },
    { image: 'lamp_small', x: 4.8, z: RAIL_Z + 0.05, y: 1.05, height: 0.5, blob: false },
    { image: 'lighthouse_pillar', x: 0, z: -1.6, height: 2.3, billboard: 'y', castShadow: true },
    { image: 'fishing_gear', x: 10.3, z: -2.4, height: 0.95, castShadow: true },
    { image: 'grass_tall_A', x: -6.2, z: 3.5, height: 1.1, sway: 0.05, occluder: true, blob: false },
    { image: 'flower_patch_small', x: 8.2, z: 3.35, height: 0.55, sway: 0.04, occluder: true, blob: false },
  ],
};

const MARKET = CASE02.areas!.find((a) => a.id === '広場')!.scene;
const WORKSHOP = CASE03.areas!.find((a) => a.id === '工房')!.scene;

/** 56キャラの立ち絵（tools/prepare_cast56.mjs で変換）。sprite は立ち絵の名前（同じ絵を別の役に使うときに id と分ける） */
const cast56 = (id: string, name: string, color: string, height: number, sprite = id) => ({
  id,
  name,
  color,
  height,
  defaultExpression: '通常',
  expressions: { 通常: `${sprite}_01_normal` },
  motions: {
    attack: [`${sprite}_attack_01_windup`, `${sprite}_attack_02_hit`, `${sprite}_attack_03_follow_through`],
    damage: `${sprite}_damage_01_hit`,
  },
});

/** 話しかける相手の調べる所（相手の少し手前） */
const talk = (id: string, label: string, x: number, z: number, area: string) => ({ id, label, actor: id, x, z: z + 0.55, radius: 1.0, area });

export const CASE05: CaseData = {
  id: 'case05',
  chapter: '第五話　暁の空に、六竜の逆転',
  title: '暁の空に、六竜の逆転',
  player: 'wilnas',
  cast: [
    ...CASE01.cast,
    cast56('sandalphon', 'サンダルフォン', '#6a4a2a', 1.45),
    cast56('beelzebub', 'ベルゼバブ', '#3a2a4a', 1.55),
    cast56('baishura', 'バイシュラ', '#a07a3a', 1.35),
    cast56('siete', 'シエテ', '#7a5a2a', 1.45),
    cast56('siero', 'シェロカルテ', '#4f7f3a', 1.05),
    cast56('santhira', 'サンチラ', '#c0405a', 1.3),
    cast56('cagliostro', 'カリオストロ', '#c05a7a', 1.15),
    cast56('clarice', 'クラリス', '#d07a3a', 1.3),
    // 院の番兵・院の見張りは役名。立ち絵は帝国兵（夜警と同じ絵）
    cast56('guard_m', '院の番兵', '#3a4a5a', 1.55, 'watchman'),
    cast56('guard_p', '院の見張り', '#3a4a5a', 1.55, 'watchman'),
  ],
  placement: [
    // 導入では皆が議場にいる。五竜は導入の終わりに持ち場へ散る
    { id: 'wilnas', x: -3.4, z: 0.6, facing: 1, area: '議場', hidden: true },
    { id: 'fediel', x: -5.0, z: -0.6, facing: 1, area: '議場', hidden: true },
    { id: 'galleon', x: -6.0, z: -1.5, facing: 1, area: '議場', hidden: true },
    { id: 'wamdus', x: -4.2, z: -1.6, facing: 1, area: '議場', hidden: true },
    { id: 'luwoh', x: -2.4, z: -1.8, facing: 1, area: '議場', hidden: true },
    { id: 'baishura', x: 0.6, z: -1.7, facing: 1, area: '議場' },
    { id: 'beelzebub', x: 3.4, z: -1.0, facing: -1, area: '議場' },
    { id: 'siete', x: -5.6, z: -1.9, facing: 1, area: '議場' },
    { id: 'sandalphon', x: -1.0, z: -0.4, facing: 1, area: '議場' },
    { id: 'siero', x: 2.4, z: -0.4, facing: -1, area: '市場' },
    { id: 'santhira', x: 8.0, z: -1.2, facing: -1, area: '市場' },
    { id: 'guard_m', x: -1.6, z: -0.6, facing: 1, area: '市場' },
    { id: 'cagliostro', x: 0.4, z: -0.6, facing: 1, area: '工房' },
    { id: 'clarice', x: -0.6, z: -0.4, facing: 1, area: '工房' },
    { id: 'guard_p', x: 2.4, z: -0.6, facing: -1, area: '桟橋' },
  ],
  evidence: [
    { id: 'seal', name: '封蝋のかけら', desc: '雲市場で、トマに偽物の取引を持ちかけた手紙の封蝋。\n灯晶院の紋。円の右下が欠けている。', image: 'props/evidence_seal.webp' },
    { id: 'burnt_order', name: '燃え残りの命令書', desc: '監獄船の炉の灰から出てきた紙。「……の口を封じよ。星祭りまでに」。\n端に残る印の跡は、円の右下が欠けている。', image: 'props/evidence_burnt_order.webp' },
    { id: 'delivery_note', name: '納品書の控え', desc: 'シェロカルテが残していた、市場灯の納品書の控え。\n大きな灯晶の納品書には、院長が自ら印を押す決まり。', image: 'props/evidence_delivery_note.webp' },
    { id: 'pier_log', name: '灯台日誌', desc: 'ルオーの灯台日誌。「この灯晶は、灯晶院ができるより前から、\nこの桟橋を照らしてきた。院の灯晶ではない」（先代の字）。', image: 'props/evidence_pier_log.webp' },
    { id: 'seal_match', name: '封蝋と院長の印', desc: '封蝋のかけらと、納品書の控えに押された院長の印。\nどちらも円の右下が同じ形に欠けている。', image: 'props/evidence_seal_match.webp' },
    { id: 'first_crystal', name: '最初の灯晶', desc: '凪ノ桟橋の灯台柱の台座の下に、ゲン爺が隠していた古い灯晶。\n中に細かな字が刻まれている。本物の古い灯りに透かすと読める。', image: 'props/evidence_first_crystal.webp' },
    { id: 'pier_light', name: '凪ノ桟橋の灯り', desc: 'すり替えられていない、院より古い灯晶の灯り。\n今夜、空じゅうでここだけが灯っている。', image: 'props/evidence_pier_light.webp' },
  ],
  clues: [
    { id: 'seal_chip', name: '封蝋の欠け', desc: '雲市場の符丁の手紙の封蝋は、紋の右下が欠けていた。' },
    { id: 'order_seal', name: '命令書の印', desc: '燃え残りの命令書の印の跡も、円の右下が欠けている。' },
    { id: 'all_out', name: '消えた灯晶', desc: '今夜消えた灯晶は、どれも灯晶院が配った物（シエテ談）。' },
    { id: 'pier_lit', name: '凪ノ桟橋の灯台', desc: '空じゅうの灯りが消えた今夜も、凪ノ桟橋の灯台だけは灯っている。' },
    { id: 'pier_old_light', name: '院より古い灯晶', desc: '凪ノ桟橋の灯晶は、灯晶院ができるより前から灯っている（灯台日誌）。' },
    { id: 'ink_rest', name: '伝言の続き', desc: 'ゲン爺の墨の伝言の、読めなかった続き。\n「最初の灯りは、古き灯りの下に眠る」。' },
    { id: 'seal_mark', name: '院長の印影', desc: '納品書の控えに押された院長の印。円の右下が小さく欠けている。' },
    { id: 'only_real', name: '消えたのは偽物', desc: '院が配った灯晶は偽物にすり替えられていたから、今夜いっせいに消えた。\n災厄ではない。' },
    { id: 'chief_seal', name: '欠けた印は院長の印', desc: '符丁の手紙の封蝋を押したのは、院長の印。' },
    { id: 'chief_order', name: '口封じは院長の命令', desc: '「口を封じよ」の命令書に印を押したのは、院長。' },
  ],
  areas: [
    { id: '議場', name: '雲上議会の議場', scene: COUNCIL, look: 'night', player: 'wilnas', entry: { x: -3.4, z: 0.6, facing: 1 }, exits: [{ to: '市場', x: -6.4, z: -0.2, radius: 0.9 }] },
    { id: '市場', name: '夜の雲市場（フェディエル）', scene: MARKET, look: 'night', player: 'fediel', entry: { x: -4.4, z: 0.8, facing: 1 }, exits: [{ to: '議場', x: -13.4, z: -0.2, radius: 0.9 }] },
    { id: '工房', name: '夜の霧の工房（ガレヲン）', scene: WORKSHOP, look: 'night', player: 'galleon', entry: { x: 5.0, z: 0.4, facing: -1 }, exits: [{ to: '議場', x: 6.4, z: -0.2, radius: 0.9 }] },
    { id: '桟橋', name: '夜の凪ノ桟橋（ワムデュス）', scene: PIER, look: 'night', player: 'wamdus', entry: { x: -2.0, z: 0.8, facing: 1 }, exits: [{ to: '議場', x: -10.0, z: -0.2, radius: 0.9 }] },
  ],
  travel: 'list',
  intro: S.INTRO,
  hotspots: [
    // 議場
    { ...talk('siete', 'シエテに話しかける', -5.6, -1.9, '議場'), script: S.SIETE, again: S.SIETE_AGAIN },
    { ...talk('sandalphon', 'サンダルフォンに話しかける', -1.6, -1.2, '議場'), script: S.SANDALPHON },
    { ...talk('beelzebub', 'ベルゼバブに話しかける', 3.4, -1.0, '議場'), script: S.BEELZEBUB },
    {
      ...talk('baishura', 'バイシュラに申し出る', 0.6, -1.7, '議場'),
      script: S.BAISHURA,
      // 総決算は、推理をまとめ切り、答えの証拠品をすべて持つまで始めない
      variants: [{ when: { flags: ['l5'], evidence: ['seal', 'seal_match', 'burnt_order', 'first_crystal', 'pier_light'] }, script: S.BAISHURA_FINAL }],
    },
    // 雲市場（フェディエル）
    { ...talk('siero', 'シェロカルテに話しかける', 2.4, -0.4, '市場'), script: S.SIERO, again: S.SIERO_AGAIN },
    { ...talk('santhira', 'サンチラに話しかける', 8.0, -1.2, '市場'), script: S.SANTHIRA, again: S.SANTHIRA_AGAIN },
    { id: 'market_lamp', label: '市場灯の台座', x: 0, z: -1.1, radius: 0.85, script: S.MARKET_LAMP, again: S.MARKET_LAMP_AGAIN, markHeight: 2.85, area: '市場' },
    {
      ...talk('guard_m', '院の番兵に話しかける', -1.6, -0.6, '市場'),
      script: S.GUARD_M,
      when: { notFlags: ['m_done'] },
      variants: [{ when: { evidence: ['delivery_note'] }, script: S.GUARD_M_CONFRONT }],
    },
    // 霧の工房（ガレヲン）
    { id: 'ink_wall', label: '煤けた板壁', x: 2.0, z: -2.0, radius: 0.75, script: S.WALL, again: S.WALL_AGAIN, markHeight: 2.6, area: '工房' },
    { id: 'bench', label: 'ゲン爺の作業台', x: -2.8, z: -1.4, radius: 0.8, script: S.BENCH, markHeight: 1.4, area: '工房' },
    { ...talk('cagliostro', 'カリオストロとクラリスに話しかける', 0.4, -0.6, '工房'), script: S.ALCHEMISTS },
    // 凪ノ桟橋（ワムデュス）
    { ...talk('luwoh', 'ルオーに話しかける', -4.4, -1.2, '桟橋'), script: S.LUWOH, again: S.LUWOH_AGAIN },
    {
      id: 'pillar',
      label: '灯台柱',
      x: -0.35,
      z: -1.0,
      radius: 0.9,
      script: S.PILLAR,
      again: S.PILLAR_AGAIN,
      markHeight: 2.55,
      area: '桟橋',
      // 見張りを帰したら灯りを確かめ、伝言の続きを読み解いたら台座の下を掘る
      variants: [
        { when: { flags: ['l2', 'p_done'] }, script: S.PILLAR_DIG, again: S.PILLAR_DIG_AGAIN },
        { when: { flags: ['p_done'] }, script: S.PILLAR_SAFE, again: S.PILLAR_SAFE_AGAIN },
      ],
    },
    {
      ...talk('guard_p', '院の見張りに話しかける', 2.4, -0.6, '桟橋'),
      script: S.GUARD_P,
      when: { notFlags: ['p_done'] },
      variants: [{ when: { evidence: ['pier_log'] }, script: S.GUARD_P_CONFRONT }],
    },
  ],
  goals: [
    { when: { flags: ['solved'] }, text: '' },
    { when: { flags: ['l5'], evidence: ['seal', 'seal_match', 'burnt_order', 'first_crystal', 'pier_light'] }, text: '議場のバイシュラに申し出て、院長と決着をつける' },
    { when: { flags: ['l2', 'p_done'], notFlags: ['dug'] }, text: '凪ノ桟橋の灯台柱の下を掘る（ワムデュス）' },
    { when: { flags: ['l2'], notFlags: ['p_done'] }, text: '凪ノ桟橋の院の見張りを帰らせる（ワムデュス）' },
    { when: { flags: ['l4'] }, text: '「まとめる」で、すべてを仕組んだ者を突き止める' },
    { when: {}, text: '持ち場を回って証拠を集め直し、「まとめる」で院長の嘘を崩す' },
  ],
  bgm: { field: '探索', confront: '尋問' },
  talismans: 5,
  shouts: { present: '刮目せよ！' },
  logic: {
    title: 'まとめる',
    hint: '関係のありそうな推理メモを2つ選んで、つなげよう。',
    pairs: [
      { a: 'all_out', b: 'pier_lit', script: S.LOGIC_1, flag: 'l1' },
      { a: 'ink_rest', b: 'pier_old_light', script: S.LOGIC_2, flag: 'l2' },
      { a: 'seal_chip', b: 'seal_mark', script: S.LOGIC_3, flag: 'l3' },
      { a: 'chief_seal', b: 'order_seal', script: S.LOGIC_4, flag: 'l4' },
      { a: 'only_real', b: 'chief_order', script: S.LOGIC_5, flag: 'l5' },
    ],
    miss: S.LOGIC_MISS,
    done: S.LOGIC_DONE,
  },
  confrontations: {
    guard_market: {
      witness: 'guard_m',
      title: '書き付けはすべて回収した',
      intro: S.M_INTRO,
      statements: [
        { text: '院の命で、院長様の印のある\n書き付けを回収しに来た。', press: S.M_PRESS_1 },
        { text: 'この市場に、院長様の印の書き付けは\nもう一枚も残っておらん。', press: S.M_PRESS_2, contradiction: ['delivery_note'] },
        { text: '印を見られて困ることなど、\n院には何もない。', press: S.M_PRESS_3 },
      ],
      success: S.M_SUCCESS,
      wrong: S.M_WRONG,
      fail: S.M_FAIL,
      hints: [S.M_HINT_1, S.M_HINT_2],
    },
    guard_pier: {
      witness: 'guard_p',
      title: 'この灯晶も院の物',
      intro: S.P_INTRO,
      statements: [
        { text: '院の命令で、星祭りの灯りを\n消して回っている。', press: S.P_PRESS_1 },
        { text: 'この灯台の灯晶も、\n灯晶院が配った物だ。', press: S.P_PRESS_2, contradiction: ['pier_log'] },
        { text: '院の物を院が消して、\n何が悪い。', press: S.P_PRESS_3 },
      ],
      success: S.P_SUCCESS,
      wrong: S.P_WRONG,
      fail: S.P_FAIL,
      hints: [S.P_HINT_1, S.P_HINT_2],
    },
    chief_fake: {
      witness: 'beelzebub',
      title: '偽灯晶など知らぬ',
      bgm: 'ラスボス',
      intro: S.F1_INTRO,
      statements: [
        { text: '院は二十年このかた、\n本物の灯晶だけを配ってきた。', press: S.F1_PRESS_1 },
        { text: '雲市場の手代の件も、\n院とは何の関わりもない。', press: S.F1_PRESS_2 },
        { text: '偽の取引の手紙に、\n院の印など押されておらぬ。', press: S.F1_PRESS_3, contradiction: ['seal'] },
        { text: '院の名を騙る者が、\nいるのであろう。', press: S.F1_PRESS_4 },
      ],
      success: S.F1_SUCCESS,
      wrong: S.F_WRONG,
      fail: S.F_FAIL,
      hints: [S.F1_HINT_1, S.F1_HINT_2],
    },
    chief_order: {
      witness: 'beelzebub',
      title: '職人殺しは部下の独断',
      bgm: 'ラスボス',
      intro: S.F2_INTRO,
      statements: [
        { text: 'カガチもベリアルも、\n私の知らぬところで勝手に動いた。', press: S.F2_PRESS_1 },
        { text: '院長たる私が、口封じなど\n命じるはずがなかろう。', press: S.F2_PRESS_2, reveals: 2 },
        { text: '私の印の押された命令書など、\nこの世に一枚もない。', press: S.F2_PRESS_3, contradiction: ['burnt_order'], hidden: true },
        { text: '部下の罪は、院として償おう。\nそれで十分であろう。', press: S.F2_PRESS_4 },
      ],
      success: S.F2_SUCCESS,
      wrong: S.F_WRONG,
      fail: S.F_FAIL,
      hints: [S.F2_HINT_1, S.F2_HINT_2],
    },
    chief_past: {
      witness: 'beelzebub',
      title: '二十年前の罪はオロロジャイア',
      bgm: 'ラスボス',
      intro: S.F3_INTRO,
      statements: [
        { text: '二十年前、オロロジャイアは師を殺め、\n灯晶の作り方を盗まんとした。', press: S.F3_PRESS_1, reveals: 3 },
        { text: '記録にもそう残っている。\n院の記録に誤りはない。', press: S.F3_PRESS_2 },
        { text: '今夜の災厄も、あの者が遺した\n呪いのようなものだ。', press: S.F3_PRESS_3 },
        { text: 'あの夜、工房にいたのは\nオロロジャイアただひとりだ。', press: S.F3_PRESS_4, contradiction: ['first_crystal'], hidden: true },
      ],
      success: S.F3_SUCCESS,
      wrong: S.F_WRONG,
      fail: S.F_FAIL,
      hints: [S.F3_HINT_1, S.F3_HINT_2],
    },
    chief_dark: {
      witness: 'beelzebub',
      title: '灯りという灯りが消えた',
      bgm: 'ラスボス',
      intro: S.F4_INTRO,
      statements: [
        { text: '空じゅうの灯りが消えたのは、\n二十年前と同じ災厄だ。', press: S.F4_PRESS_1 },
        { text: '院の灯晶でなくとも、灯りという\n灯りが消えたのだ。', press: S.F4_PRESS_2, contradiction: ['pier_light'] },
        { text: 'だからこそ、灯晶院に\n全権を預けよ。', press: S.F4_PRESS_3 },
      ],
      success: S.F4_SUCCESS,
      wrong: S.F_WRONG,
      fail: S.F_FAIL,
      hints: [S.F4_HINT_1, S.F4_HINT_2],
    },
  },
  challenges: {
    chief_seal_k: {
      witness: 'beelzebub',
      title: 'それが私の印だという証拠',
      question: '下っ端の誰かが、勝手に押したのであろう。……それが私の印だという証拠でもあるのか',
      answer: ['seal_match'],
      success: S.K1_SUCCESS,
      wrong: S.K1_WRONG,
      fail: S.F_FAIL,
      hints: [S.K1_HINT_1, S.K1_HINT_2],
    },
  },
  ending: S.ENDING,
};
