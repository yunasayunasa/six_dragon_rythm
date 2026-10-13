import * as THREE from 'three';
import type { Engine } from '../../engine';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { glowTexture } from '../../engine/paper/textures';
import { Crystal } from '../../engine/stage/Crystal';
import { technoBgm } from '../../engine/audio/technoBgm';
import { tenseBgm } from '../../engine/audio/tenseBgm';
import type { CaseData } from '../../genres/investigation/types';
import * as S from './scripts';
import { Airship } from '../props/Airship';
import { SkyFish } from '../props/SkyFish';

const RAIL_Z = -3.05;

/** 桟橋の手すり・灯台柱・係留柱など、画像以外の舞台装置 */
async function buildSet(engine: Engine): Promise<void> {
  const st = engine.stage;
  const wood = '#7a4b2e';
  const woodDark = '#5a3421';
  // 奥の手すり（柱＋横木）
  for (let x = -12; x <= 12.01; x += 2.4) st.addBlock([0.18, 1.05, 0.18], [x, 0.52, RAIL_Z], woodDark);
  st.addBlock([24.4, 0.1, 0.12], [0, 1.0, RAIL_Z], wood, { cast: false });
  st.addBlock([24.4, 0.07, 0.08], [0, 0.55, RAIL_Z], wood, { cast: false });
  // 桟橋の縁（床の厚み）
  st.addBlock([44, 0.5, 0.4], [0, -0.25, -4.55], woodDark, { cast: false });
  // 係留柱
  st.addCylinder(0.15, 0.85, [6.2, 0, -2.35], woodDark);
  // 灯晶（最初は消えている。灯台柱の絵の台座の上に載る）
  const lantern = new THREE.Group();
  lantern.name = '灯台柱';
  lantern.position.set(0, 2.16, -1.6);
  lantern.visible = false;
  // 灯晶は紙ではなく立体の結晶（紙の舞台の中の「本物」）。反射用の環境マップはこれ専用に1回だけ作る
  const pmrem = new THREE.PMREMGenerator(engine.renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const crystal = new Crystal({ height: 0.85, envMap });
  lantern.add(crystal);
  engine.onFrame.add((dt) => crystal.update(dt));
  // 開幕に紙が立ち上がる音（ユーザー提供の素材）
  engine.sound.useFile('rise', engine.assets.url('audio/se_paper_rise.mp3'));
  // 音声ファイルの曲は尋問のテクノより大きく聞こえるので、音量を下げてそろえる（スマホのスピーカーは低音が出ないので、低音を除いた大きさで合わせた）
  engine.sound.defineBgm('カフェ', engine.assets.url('audio/cafe.mp3'), 0.35);
  engine.sound.defineBgm('尋問', technoBgm(0.8));
  // 犯人を追い詰める最後の尋問の曲（コードで鳴らす緊迫した曲）
  engine.sound.defineBgm('追及', tenseBgm());
  engine.sound.defineBgm('エンディング', engine.assets.url('audio/ending.mp3'), 0.37);
  const light = new THREE.PointLight('#ffd49a', 0, 12, 1.6);
  light.position.y = 1.9; // 結晶の近くに置くと結晶そのものが白く飛ぶので、結晶の上から離して照らす
  light.userData.on = 12;
  lantern.add(light);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffdca8', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.name = 'glow';
  glow.position.y = 0.4;
  glow.material.opacity = 0.55;
  glow.userData.size = 1.2; // 大きすぎると結晶がぼやけて見える
  glow.scale.setScalar(0.001);
  lantern.add(glow);
  st.scene.add(lantern);
  st.named.set('灯台柱', lantern);

  // 結末：灯晶の光に誘われる空魚の群れと、光を目印に帰ってくる最終便の飛空艇（どちらも呼ばれるまで隠れている）
  const fish = new SkyFish(new THREE.Vector3(0, 2.6, -1.6));
  st.scene.add(fish);
  st.named.set('空魚', fish);
  const ship = new Airship(engine.tweens, { envMap });
  ship.dock.set(6.2, 0.2, -10.2);
  ship.attachTrail(st.scene);
  st.scene.add(ship);
  st.named.set('飛空艇', ship);
  // 飛空艇が着く所（カメラで眺める目印）
  const dock = new THREE.Object3D();
  dock.position.set(5.6, 2.6, -10.2);
  st.scene.add(dock);
  st.named.set('飛空艇の着く所', dock);
  engine.onFrame.add((dt) => {
    fish.update(dt);
    ship.update(dt);
  });
}

/** 攻撃3コマ・被弾1枚（tools/prepare_poses.mjs で変換した追加素材） */
const motions = (id: string) => ({
  attack: [`${id}_attack_01_windup`, `${id}_attack_02_hit`, `${id}_attack_03_follow_through`],
  damage: `${id}_damage_01_hit`,
});

export const CASE01: CaseData = {
  id: 'case01',
  chapter: '第一話　夕凪の空港と消えた灯晶',
  title: '夕凪の空港と消えた灯晶',
  player: 'wilnas',
  cast: [
    {
      id: 'wilnas',
      name: 'ウィルナス',
      color: '#b8322a',
      height: 1.36,
      defaultExpression: '通常',
      expressions: { 通常: 'wilnas_01_normal', 驚き: 'wilnas_02_surprised', 指差し: 'wilnas_03_pointing_left', 困惑: 'wilnas_04_confused', 笑い: 'wilnas_05_hand_on_hip_laugh' },
      motions: motions('wilnas'),
    },
    {
      id: 'wamdus',
      name: 'ワムデュス',
      color: '#3b4fa0',
      height: 1.3,
      defaultExpression: '通常',
      expressions: { 通常: 'wamdus_01_normal', 驚き: 'wamdus_02_surprised', 怒り: 'wamdus_03_pouting_angry', 得意: 'wamdus_04_proud' },
      motions: motions('wamdus'),
    },
    {
      id: 'galleon',
      name: 'ガレヲン',
      color: '#7a5230',
      height: 1.42,
      defaultExpression: '通常',
      expressions: {
        通常: 'galleon_01_normal',
        よそ見: 'galleon_03_looking_away',
        微笑み: 'galleon_07_hand_on_cheek_smile',
        投げキッス: 'galleon_04_blow_kiss',
        キッス: 'galleon_05_kiss_hand_to_mouth',
        キッス投げ: 'galleon_06_kiss_mid_throw',
      },
      motions: motions('galleon'),
    },
    {
      id: 'fediel',
      name: 'フェディエル',
      color: '#2f7f7a',
      height: 1.4,
      defaultExpression: '通常',
      expressions: { 通常: 'fediel_01_normal', 笑み: 'fediel_02_cover_mouth_smile', 挑発: 'fediel_03_taunting', 驚き: 'fediel_04_surprised' },
      motions: motions('fediel'),
    },
    {
      id: 'luwoh',
      name: 'ルオー',
      color: '#a07a18',
      height: 1.42,
      artFacing: -1,
      defaultExpression: '通常',
      expressions: { 通常: 'luwoh_01_normal', 構え: 'luwoh_02_light_guard_pose', 驚き: 'luwoh_03_surprised', 説明: 'luwoh_04_pointing_explaining', 考え: 'luwoh_05_thinking' },
      motions: motions('luwoh'),
    },
  ],
  placement: [
    { id: 'wilnas', x: -4.6, z: 0.6, facing: 1 },
    { id: 'galleon', x: -6.7, z: -1.65, facing: 1 },
    { id: 'luwoh', x: -1.7, z: -1.3, facing: -1 },
    { id: 'fediel', x: 3.7, z: -1.9, facing: -1 },
    { id: 'wamdus', x: 9.3, z: -1.7, facing: -1 },
  ],
  // 証拠品＝尋問でつきつける物。推理メモ（clues）＝まとめるで使う物。どれも必ずどこかで使う（tests/case-data.test.ts で確認）
  evidence: [
    { id: 'map', name: '桟橋の見取り図', desc: '掲示板に貼られた凪ノ桟橋の見取り図。\n桟橋のはしから見ると、灯台柱の前はフェディエルの物干しの陰になる。', image: 'props/evidence_map.webp' },
    { id: 'wrapper', name: '包み紙の切れ端', desc: 'ガレヲンの積荷のそばに落ちていた、だんごの包み紙の切れ端。\nべたべたした蜜が付いている。', image: 'props/evidence_wrapper.webp' },
    { id: 'footprints', name: '濡れた足跡', desc: '灯台柱の根元の水たまりから、桟橋の先へ点々と続く小さな足跡。\nまだ乾いていない。', image: 'props/evidence_footprints.webp' },
    { id: 'ribbon', name: '青いリボンの切れ端', desc: '係留ロープのささくれに引っかかっていた、青い布の切れ端。\n白い縁取りがある。', image: 'props/evidence_ribbon.webp' },
    { id: 'honey_puddle', name: '甘い水たまり', desc: '灯台柱の根元の水たまり。ほんのり甘い匂いがして、触るとべたつく。\n蜜が溶けている。', image: 'props/evidence_honey_puddle.webp' },
  ],
  clues: [
    { id: 'no_crumbs', name: '食べこぼしの無い皿', desc: 'フェディエルの台の皿には、蜜の跡だけが残っていた。\nだんごのかけらも、食べこぼしも無い。' },
    { id: 'wrapper_spot', name: '包み紙が落ちていた場所', desc: 'だんごの包み紙の切れ端は、フェディエルの台から遠く離れた\nガレヲンの積荷のそばに落ちていた。' },
    { id: 'bell', name: '灯晶が消えた時刻', desc: '灯晶が消えたのは、夕方の鐘が鳴ってすぐ。ルオーは鐘楼にいた。' },
    { id: 'snack_time', name: 'だんごが消えた時刻', desc: 'フェディエルが目を離したのは、鐘が鳴ったころ。\nだんごが消えたのは、そのとき。' },
    { id: 'carried', name: '持ち去られただんご', desc: 'だんごはその場で食べられたのではない。\n包みごと持ち去られ、途中で包みが破れた。' },
    { id: 'honey_note', name: '水たまりの蜜', desc: '灯台柱の根元の水たまりには、蜜が溶けていた。\nほんのり甘い匂いがする。' },
    { id: 'same_culprit', name: '同じ犯人', desc: '灯台柱の水たまりに、だんごの蜜が溶けていた。\n灯晶を持ち去った者は、だんごも持っていた。' },
    { id: 'skyfish', name: '空魚の言い伝え', desc: '夕焼けの空魚は、光と甘い匂いに寄ってくる。\n昔の釣り人は、灯りと蜜で誘ったという（ルオー談）。' },
  ],
  scene: {
    floor: { image: 'stage/pier_planks.webp', width: 44, depth: 10, z: 0.45, repeat: [11, 2.5], color: '#e6d6c8' },
    backdrop: { image: 'stage/cloudsea_sunset.webp', width: 150, height: 62, z: -46, y: 2 },
    walk: { minX: -10.4, maxX: 10.4, minZ: -2.25, maxZ: 2.5 },
    cameraBounds: { minX: -7.5, maxX: 7.5 },
    // 灯台柱の根元の水たまり（歩くと水しぶき）
    wet: [{ x: 1.2, z: -0.45, r: 0.55 }],
    obstacles: [
      { x: 0, z: -1.6, r: 0.5 },
      { x: -3.6, z: -2.45, r: 0.2 },
      { x: -7.9, z: -2.2, r: 0.55 },
      { x: 6.6, z: -2.2, r: 0.55 },
      { x: 10.2, z: -2.3, r: 0.4 },
      { x: 5.5, z: -2.35, r: 0.35 },
    ],
    set: buildSet,
    props: [
      // 左端の木立（島のはし）
      { image: 'tree_medium_A', x: -10.9, z: -2.5, height: 3.4, cross: true, castShadow: true, sway: 0.015 },
      { image: 'bush_large_A', x: -9.5, z: -2.7, height: 1.2, sway: 0.02 },
      { image: 'grass_tall_A', x: -9.1, z: -0.9, height: 0.7, sway: 0.05, blob: 0.5 },
      { image: 'flower_bush_A', x: -10.3, z: 1.4, height: 0.6, sway: 0.03 },
      { image: 'small_rock_group', x: -8.7, z: 2.3, height: 0.35 },
      // ガレヲンの積荷
      { image: 'small_box_goods', x: -8.0, z: -2.35, height: 0.75, castShadow: true },
      { image: 'sack_small', x: -7.35, z: -2.55, height: 0.6, castShadow: true },
      { image: 'shop_goods_bundle_A', x: -8.35, z: -1.55, height: 0.6, castShadow: true },
      // 旗と灯り
      { image: 'banner_small_red', x: -5.4, z: -2.9, height: 1.35, sway: 0.02 },
      { image: 'banner_small_blue', x: 2.2, z: -2.9, height: 1.35, sway: 0.02 },
      { image: 'lamp_small', x: -4.8, z: RAIL_Z + 0.05, y: 1.05, height: 0.5, blob: false },
      { image: 'lamp_small', x: 4.8, z: RAIL_Z + 0.05, y: 1.05, height: 0.5, blob: false },
      // 掲示板（無地の板に見取り図を貼る）
      { image: 'notice_board', x: -3.6, z: -2.4, height: 1.3, castShadow: true, id: 'board' },
      { image: 'evidence_map', x: -3.6, z: -2.36, y: 0.6, height: 0.5, blob: false },
      // 灯台柱（カメラが周りを回っても正面を向く。台座の上面が灯晶の高さ 2.16 に来る大きさ）
      { image: 'lighthouse_pillar', x: 0, z: -1.6, height: 2.3, billboard: 'y', castShadow: true },
      // 灯台柱の水たまり・汚れ
      { image: 'puddle', x: 1.2, z: -0.45, height: 1.0, flat: true },
      // 水たまりから桟橋の先（釣り場）へ続く濡れた足跡
      { image: 'footprints_trail', x: 3.35, z: -0.75, height: 0.4, flat: true, rotY: 0.09 },
      { image: 'footprints_trail', x: 7.0, z: -1.2, height: 0.4, flat: true, rotY: 0.09 },
      { image: 'dirt_stain', x: -6.3, z: -0.3, height: 1.3, flat: true },
      // フェディエルの物干し
      { image: 'laundry_line_small', x: 4.7, z: -2.85, height: 1.25, sway: 0.03 },
      // フェディエルの台（だんごの皿が載っていた）
      { image: 'fediel_table', x: 5.5, z: -2.35, height: 0.75, castShadow: true },
      // 係留ロープ
      { image: 'rope_ribbon', x: 6.85, z: -2.15, height: 0.62, castShadow: true },
      // 桟橋の先（釣り道具）
      { image: 'fishing_gear', x: 10.3, z: -2.4, height: 0.95, castShadow: true },
      { image: 'grass_small', x: 11.2, z: -1.2, height: 0.5, sway: 0.05 },
      // 手前の前景（ぼけて奥行きを出す）
      { image: 'grass_tall_A', x: -6.2, z: 3.5, height: 1.1, sway: 0.05, occluder: true, blob: false },
      { image: 'small_box_goods', x: 2.8, z: 3.7, height: 0.95, occluder: true, blob: false },
      { image: 'flower_patch_small', x: 8.2, z: 3.35, height: 0.55, sway: 0.04, occluder: true, blob: false },
      { image: 'sack_small', x: -1.8, z: 3.9, height: 0.75, occluder: true, blob: false },
    ],
  },
  intro: S.INTRO,
  hotspots: [
    { id: 'pillar', label: '灯台柱', x: -0.35, z: -1.0, radius: 0.9, script: S.PILLAR, again: S.PILLAR_AGAIN, markHeight: 2.55 },
    {
      id: 'puddle',
      label: '水たまり',
      x: 1.25,
      z: -0.4,
      radius: 0.95,
      script: S.PUDDLE,
      again: S.PUDDLE_AGAIN,
      markHeight: 0.8,
      // まとめる②（同じ時刻）のあと、調べ直すと甘い匂いに気づく
      variants: [{ when: { flags: ['l2'] }, script: S.PUDDLE_HONEY, again: S.PUDDLE_HONEY_AGAIN }],
    },
    { id: 'board', label: '掲示板', x: -3.6, z: -1.75, radius: 0.95, script: S.BOARD, again: S.BOARD_AGAIN, markHeight: 1.55 },
    { id: 'rope', label: '係留ロープ', x: 6.85, z: -1.45, radius: 1.0, script: S.ROPE, again: S.ROPE_AGAIN, markHeight: 1.1 },
    { id: 'table', label: 'フェディエルの台', x: 5.5, z: -1.75, radius: 0.85, script: S.TABLE, again: S.TABLE_AGAIN, markHeight: 1.2 },
    { id: 'cargo', label: 'ガレヲンの積荷', x: -8.2, z: -1.3, radius: 0.8, script: S.CARGO, again: S.CARGO_AGAIN, markHeight: 1.2 },
    {
      id: 'galleon',
      label: 'ガレヲンに話しかける',
      actor: 'galleon',
      x: -6.7,
      z: -1.1,
      radius: 1.05,
      script: S.GALLEON,
      again: S.GALLEON_AGAIN,
      variants: [{ when: { flags: ['c1_done'] }, script: S.GALLEON_2, again: S.GALLEON_2_AGAIN }],
    },
    {
      id: 'luwoh',
      label: 'ルオーに話しかける',
      actor: 'luwoh',
      x: -1.7,
      z: -0.8,
      radius: 0.95,
      script: S.LUWOH,
      again: S.LUWOH_AGAIN,
      variants: [{ when: { flags: ['l3'] }, script: S.LUWOH_2, again: S.LUWOH_2_AGAIN }],
    },
    {
      id: 'fediel',
      label: 'フェディエルに話しかける',
      actor: 'fediel',
      x: 3.7,
      z: -1.35,
      radius: 1.05,
      script: S.FEDIEL,
      again: S.FEDIEL_AGAIN,
      variants: [
        { when: { flags: ['c2_done'] }, script: S.FEDIEL_2_AGAIN },
        { when: { flags: ['l1', 'met_fediel'] }, script: S.FEDIEL_CONFRONT },
      ],
    },
    {
      id: 'wamdus',
      label: 'ワムデュスに話しかける',
      actor: 'wamdus',
      x: 9.3,
      z: -1.15,
      radius: 1.1,
      script: S.WAMDUS,
      variants: [
        // 最後の尋問（③→③の続き→④）は、答えの証拠品（リボン）を持つまで始めない（持たずに始めると勝てずに詰む）
        { when: { flags: ['l4'], evidence: ['ribbon'] }, script: S.WAMDUS_CONFRONT },
        { when: { flags: ['l4'] }, script: S.WAMDUS_NOT_READY },
        { when: { flags: ['c1_done'] }, script: S.WAMDUS_AGAIN },
        { when: { evidence: ['map'], flags: ['met_galleon'] }, script: S.WAMDUS_GALLEON },
      ],
    },
  ],
  goals: [
    { when: { flags: ['solved'] }, text: '' },
    { when: { flags: ['l4'], evidence: ['ribbon'] }, text: '桟橋の先のワムデュスを問いただす' },
    { when: { flags: ['l4'] }, text: '問いただす前に、桟橋の調べ残しを探す' },
    { when: { evidence: ['skyfish'] }, text: '「まとめる」で犯人の狙いを考える' },
    { when: { flags: ['l3'] }, text: 'ルオーに話を聞く' },
    { when: { evidence: ['honey_note'] }, text: '「まとめる」で2つの事件をつなげる' },
    { when: { flags: ['l2'] }, text: '灯台柱の水たまりを調べ直す' },
    { when: { evidence: ['snack_time'] }, text: '「まとめる」で2つの時刻を比べる' },
    { when: { flags: ['l1', 'met_fediel'] }, text: 'フェディエルを問いただす' },
    { when: { flags: ['l1'] }, text: 'フェディエルに話を聞く' },
    { when: { flags: ['c1_done'], evidence: ['no_crumbs', 'wrapper_spot'] }, text: '「まとめる」でだんごの行方を考える' },
    { when: { flags: ['c1_done'] }, text: 'だんごの手がかりを探す（フェディエルの台・ガレヲンの積荷）' },
    { when: { evidence: ['map'], flags: ['met_galleon'] }, text: 'ワムデュスにガレヲンのことを聞き直す' },
    { when: {}, text: '桟橋を調べて、皆の話を聞く' },
  ],
  bgm: { field: 'カフェ', confront: '尋問' },
  talismans: 5,
  shouts: { present: '刮目せよ！' },
  logic: {
    title: 'まとめる',
    hint: '関係のありそうな推理メモを2つ選んで、つなげよう。',
    pairs: [
      { a: 'no_crumbs', b: 'wrapper_spot', script: S.LOGIC_1, flag: 'l1' },
      { a: 'bell', b: 'snack_time', script: S.LOGIC_2, flag: 'l2' },
      { a: 'honey_note', b: 'carried', script: S.LOGIC_3, flag: 'l3' },
      { a: 'same_culprit', b: 'skyfish', script: S.LOGIC_4, flag: 'l4' },
    ],
    miss: S.LOGIC_MISS,
    done: S.LOGIC_DONE,
  },
  confrontations: {
    wamdus_galleon: {
      witness: 'wamdus',
      title: 'ガレヲンを見た',
      intro: S.C1_INTRO,
      statements: [
        { text: '灯りが消えたとき、ワムは\n桟橋のはしっこで釣りをしてた。', press: S.C1_PRESS_1 },
        { text: 'そこから、ガレヲンが\n灯台の前で寝てるのが見えたので。', press: S.C1_PRESS_2, contradiction: ['map'] },
        { text: '寝てる人のそばで灯りが消えたら、\nその人があやしい。', press: S.C1_PRESS_3 },
      ],
      success: S.C1_SUCCESS,
      wrong: S.C1_WRONG,
      fail: S.C1_FAIL,
      hints: [S.C1_HINT_1, S.C1_HINT_2],
    },
    fediel: {
      witness: 'fediel',
      title: 'だんごの見張り',
      intro: S.C2_INTRO,
      statements: [
        { text: '雲蜜だんごは、\nこの台の上の皿に置いておいたぞえ。', press: S.C2_PRESS_1 },
        { text: '此方は片時も、\nだんごから目を離しはせなんだ。', press: S.C2_PRESS_2, contradiction: ['wrapper'] },
        { text: 'なのに気づけば皿は空。\nこれは妖術に違いないわいな。', press: S.C2_PRESS_3 },
      ],
      success: S.C2_SUCCESS,
      wrong: S.C2_WRONG,
      fail: S.C2_FAIL,
      hints: [S.C2_HINT_1, S.C2_HINT_2],
    },
    wamdus_crystal: {
      witness: 'wamdus',
      title: 'あのとき見たこと',
      intro: S.C3_INTRO,
      statements: [
        { text: 'ワムは夕方からずーっと、\n桟橋のはしっこで釣りをしてた。', press: S.C3_PRESS_1 },
        { text: '灯りが消えて暗くなったから、\nワムは桟橋の先でじっとしてたので。', press: S.C3_PRESS_2 },
        { text: 'それにワムは、灯台柱には\n一歩も近づいてないので。', press: S.C3_PRESS_3, contradiction: ['footprints'] },
      ],
      success: S.C3_SUCCESS,
      wrong: S.C3_WRONG,
      fail: S.C3_FAIL,
      hints: [S.C3_HINT_1, S.C3_HINT_2],
    },
    wamdus_ribbon: {
      witness: 'wamdus',
      title: 'あの足跡は',
      intro: S.C3B_INTRO,
      statements: [
        { text: 'あの足跡がワムのだなんて、\nだれにもわからない。', press: S.C3B_PRESS_1 },
        { text: 'ワムは釣り場から、\nずっと動いてないので。', press: S.C3B_PRESS_2 },
        { text: 'ワムの物なんて、\n桟橋のどこにも落ちてないよ。', press: S.C3B_PRESS_3, contradiction: ['ribbon'] },
      ],
      success: S.C3B_SUCCESS,
      wrong: S.C3_WRONG,
      fail: S.C3_FAIL,
      hints: [S.C3B_HINT_1, S.C3B_HINT_2],
    },
    wamdus_snack: {
      witness: 'wamdus',
      title: 'だんごは知らない',
      bgm: '追及',
      intro: S.C4_INTRO,
      statements: [
        { text: 'ワム、甘いものは\nそんなに好きじゃない。', press: S.C4_PRESS_1, reveals: 3 },
        { text: 'フェディエルのだんごなんて、\n見たこともないので。', press: S.C4_PRESS_2 },
        { text: '空魚は光だけで寄ってくる。\n餌なんていらないので。', press: S.C4_PRESS_3, contradiction: ['honey_puddle'] },
        { text: 'だから、ワムから甘い匂いなんて、\nするわけないので。', press: S.C4_PRESS_4, contradiction: ['honey_puddle'], hidden: true },
      ],
      success: S.C4_SUCCESS,
      wrong: S.C4_WRONG,
      fail: S.C4_FAIL,
      hints: [S.C4_HINT_1, S.C4_HINT_2],
    },
  },
  ending: S.ENDING,
};
