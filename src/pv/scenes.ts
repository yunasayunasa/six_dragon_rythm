/**
 * PV の流れ（約94秒）。曲はユーザー提供のファンファーレを「0:00〜0:38」＋「2:14〜最後」でつないで使う
 * （つなぎ目は Gemini に4案を聞かせて一番自然だった所。audio.ts の MusicPlan）。
 * 時刻はすべて PV の秒。曲の強い音（立ち上がり）に場面の切り替えを合わせている。
 */
import * as THREE from 'three';
import type { Engine } from '../engine';
import type { PaperActor } from '../engine/paper/PaperActor';
import { CASE01 } from '../game/case01/case';
import { lengthOf, narrate } from './audio';
import { charCard, clueCollide, endCard, evidenceCard, keyVisualLogo, letterbox, nameTag, placeCard, slam, subtitle, titleLogo, type CardPose } from './mg';
import { clock, embers, flash, inkWipe, speedLines, until } from './timeline';
import type { MusicPlan } from './audio';

/** 曲：前半 0〜38.35 秒、後半は 134.13 秒から（PV の 38.35 秒でつなぐ）。曲の終わり 189.6 秒＝PV の約93.8秒 */
export const JOIN = 38.35;
export const MUSIC: MusicPlan = { url: '', segs: [[0, JOIN], [134.13, 999]], fadeOutAt: 93.2, fadeOut: 0.6 };
export const DURATION = 93.8;
/** 曲の後半の時刻 → PV の時刻 */
const fromB = (orig: number) => JOIN + (orig - 134.13);

export const NARRATION: Record<string, string> = {
  n1: '雲海に浮かぶ、空の港――凪ノ桟橋。',
  n2: '最終便が帰る、その夕暮れ。',
  n3: '港を照らす灯晶が――消えた。',
  n4: '集うは、ひと癖ある竜たち。',
  n5: '調べろ。まとめろ。問いただせ。',
  n6: '嘘を見抜き、真実をつきつけろ！',
  n7: '灯りは、帰ってくる人のために。',
  n8: '〜活劇奇譚〜　逆転六竜',
  n9: '第一話、開幕。',
};

export interface PVContext {
  engine: Engine;
  game: unknown;
  director: { play(src: string): Promise<void> };
  narrUrl(id: string): string;
  voiceUrl(name: string, text: string): string;
  pose(poseId: string): CardPose;
}

/** キャラ紹介（並び順・肩書き・セリフ・決めの絵） */
export const ROLL = [
  { id: 'wilnas', role: '熱き捜査官', pose: 'wilnas_05_hand_on_hip_laugh', expr: '笑い', line: 'なんの！　当然である！', c2: '#5a1210' },
  { id: 'luwoh', role: '堅物の灯台番', pose: 'luwoh_04_pointing_explaining', expr: '説明', line: '急ぎたまえ。空の色が、もう変わり始めている', c2: '#4a3608' },
  { id: 'fediel', role: '甘味を愛する貴婦人', pose: 'fediel_03_taunting', expr: '挑発', line: 'だんごはまだかえ？　此方はお腹がすいておるぞよ', c2: '#0f3a37' },
  { id: 'galleon', role: '祝福を贈る竜', pose: 'galleon_04_blow_kiss', expr: '投げキッス', line: '祝福（皆さまに、たくさんの祝福を）', c2: '#3a2412' },
  { id: 'wamdus', role: 'マイペースな釣り好き', pose: 'wamdus_04_proud', expr: '得意', line: 'ほら。ワムは悪くないので', c2: '#161f4a' },
];

/** PV で鳴らす声（先に長さを調べる） */
export function voiceList(ctx: PVContext): string[] {
  const name = (id: string) => CASE01.cast.find((c) => c.id === id)!.name;
  return [
    ...Object.keys(NARRATION).map((id) => ctx.narrUrl(id)),
    ...ROLL.map((r) => ctx.voiceUrl(name(r.id), r.line)),
    ctx.voiceUrl('ワムデュス', 'そう。ワムがやった証拠なんて、ない'),
    ctx.voiceUrl('ワムデュス', 'う……うわああん。ごめんなさい……！'),
    ctx.voiceUrl('ガレヲン', '感嘆（光の中を泳いでいます。なんて綺麗なのでしょう）'),
    ctx.voiceUrl('ウィルナス', '一件落着、いや二件落着！　重畳重畳である！'),
  ];
}

export async function runPV(ctx: PVContext): Promise<void> {
  const { engine, director } = ctx;
  const st = engine.stage;
  const rig = engine.rig;
  const hud = engine.hud;
  const game = ctx.game as {
    versus(w: PaperActor, title: string): Promise<void>;
    throwEvidence(id: string, w: PaperActor, hit: boolean): Promise<void>;
    testimony: { show(title: string, text: string, i: number, n: number): void; hide(): void };
  };
  const actor = (id: string) => st.actor(id);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const wil = actor('wilnas');
  const wam = actor('wamdus');
  const lantern = st.named.get('灯台柱')!;
  const light = lantern.getObjectByProperty('isPointLight', true) as THREE.PointLight;
  const glow = lantern.getObjectByName('glow')!;

  const say = (id: string, at: number, sub = true) => {
    narrate(ctx.narrUrl(id));
    if (sub) subtitle(NARRATION[id], at, lengthOf(ctx.narrUrl(id)) + 0.25);
  };
  /** 決めた時刻から、タップしたことにして次へ進める（会話・カットインはタップ待ちなので） */
  const pressAt = async (at: number, until2 = at + 0.4) => {
    await until(at);
    const f = () => {
      if (clock.t > until2) return engine.onFrame.delete(f);
      engine.input.press('confirm');
    };
    engine.onFrame.add(f);
  };
  const talk = (a: PaperActor, seconds: number) => {
    a.talking = true;
    void until(clock.t + seconds).then(() => (a.talking = false));
  };
  const voice = (name: string, text: string) => {
    const url = ctx.voiceUrl(name, text);
    engine.sound.playVoice(url);
    return lengthOf(url);
  };

  // ======== 0. 開幕：紙の舞台が組み上がる ========
  st.flattenAll();
  rig.stiffness = 0.55;
  rig.cut(V(0, 0.6, 0), V(0, 7.5, 19), 30);
  void hud.fade(1, 0.01);
  await until(0.17);
  flash(0.45, '255,244,226', 0.7);
  void hud.fade(0, 1.1);
  letterbox(0.17, 13.4);
  rig.shot(V(0, 1.15, 0), V(0, 2.4, 12.8), 33);
  engine.sound.play('rise');
  void st.assemble();
  await until(1.0);
  say('n1', 1.0);
  await until(1.6);
  placeCard('凪ノ桟橋', '空の<br>港', 1.6, 4.8);

  // ======== 1. 灯晶が灯る港 → 消える ========
  await until(6.4);
  inkWipe(0.6, { at: 6.1, seed: 11 });
  rig.stiffness = 1.2;
  lantern.visible = true;
  light.intensity = 12;
  glow.scale.setScalar(1.2);
  rig.cut(V(0, 2.25, -1.6), V(2.6, 0.2, 4.4), 30);
  rig.shot(V(0, 2.3, -1.6), V(-1.2, 0.5, 3.7), 28);
  embers(5.2, { count: 60, seed: 21 });
  await until(6.7);
  say('n2', 6.7);
  await until(10.15);
  say('n3', 10.15);
  await until(12.35);
  // 消える瞬間：光が弾けて、結晶が消える
  engine.sound.play('crack');
  const at = lantern.getWorldPosition(new THREE.Vector3()).add(V(0, 0.4, 0));
  st.spray.emit(at, { count: 60, color: '#ffd27a', spread: 2.2, up: 1.4, gravity: 3, size: 0.08, life: 1.2, glow: true });
  st.spray.emit(at, { count: 30, color: '#1e1418', spread: 1.6, up: 0.8, gravity: 4, size: 0.1, life: 1.0 });
  flash(0.4, '255,236,200', 0.8);
  rig.shake(0.25, 0.4);
  lantern.visible = false;
  light.intensity = 0;
  void st.setLook('confront', 1.4);
  rig.shot(V(0, 2.1, -1.6), V(0.3, 0.1, 5.4), 30);

  // ======== 2. 竜たちが集う（舞台を引きで見せて名札） ========
  await until(13.4);
  inkWipe(0.6, { at: 13.1, seed: 12 });
  void st.setLook('sunset', 0.3);
  rig.stiffness = 1.0;
  rig.cut(V(1.2, 1.0, -0.6), V(0, 3.2, 15.5), 34);
  rig.shot(V(1.6, 1.0, -0.6), V(0, 2.8, 14.2), 34);
  say('n4', 13.4);
  for (const [i, r] of ROLL.entries()) {
    const a = actor(r.id);
    const def = CASE01.cast.find((c) => c.id === r.id)!;
    nameTag(def.name, def.color ?? '#333', () => a.headPosition().add(V(0, 0.42, 0)), rig.camera, 13.8 + i * 0.28, 2.75 - i * 0.28);
    void until(13.8 + i * 0.28).then(() => {
      engine.sound.play('select');
      void a.hop(engine.tweens);
    });
  }

  // ======== 3. キャラ紹介（1人 約4.4秒） ========
  const CARD = (JOIN - 16.6) / ROLL.length;
  for (const [i, r] of ROLL.entries()) {
    const t0 = 16.6 + i * CARD;
    await until(t0);
    const a = actor(r.id);
    const def = CASE01.cast.find((c) => c.id === r.id)!;
    engine.sound.play('paper');
    // 後ろの舞台はその竜に寄る（カードの左側に映る）
    const head = a.headPosition();
    rig.stiffness = 2.2;
    rig.cut(head.clone().add(V(0.55, -0.25, 0)), V(-0.9 * (a.facing || 1), 0.15, 3.4), 30, 0.06 * (i % 2 ? 1 : -1));
    rig.shot(head.clone().add(V(0.75, -0.2, 0)), V(-0.6 * (a.facing || 1), 0.2, 3.0), 29, 0.03 * (i % 2 ? 1 : -1));
    a.setExpression(r.expr, true);
    const len = lengthOf(ctx.voiceUrl(def.name, r.line));
    charCard({ name: def.name, role: r.role, color: def.color ?? '#333', color2: r.c2, pose: ctx.pose(r.pose), quote: r.line, start: t0, dur: CARD + 0.02, voiceAt: t0 + 0.35, voiceLen: len, seed: i * 31 });
    void until(t0 + 0.35).then(() => {
      voice(def.name, r.line);
      talk(a, len);
    });
  }
  await until(JOIN - 0.4);
  inkWipe(0.8, { seed: 13 });
  ROLL.forEach((r) => actor(r.id).setExpression(CASE01.cast.find((c) => c.id === r.id)!.defaultExpression, true));

  // ======== 4. 調べろ・まとめろ・問いただせ（曲の山へ） ========
  await until(JOIN);
  say('n5', JOIN + 0.05);
  // 調べろ：灯台柱の根元の水たまり
  wil.position.set(0.1, 0, -0.25);
  wil.faceInstant(1);
  wil.setExpression('驚き', true);
  rig.stiffness = 2.5;
  rig.cut(V(1.0, 0.6, -0.4), V(-1.6, 1.1, 4.2), 30);
  rig.shot(V(1.1, 0.55, -0.4), V(-1.2, 1.0, 3.6), 29);
  st.burst.fire(V(1.2, 0.3, -0.45));
  engine.sound.play('reveal');
  slam('調べろ', JOIN + 0.05, 1.15, { x: 520, y: 330, size: 210, rot: -5 });
  void until(JOIN + 0.3).then(() => evidenceCard(engine.assets.url('props/evidence_honey_puddle.webp'), '甘い水たまり', clock.t, 0.95, 1330, 520));
  // まとめろ
  await until(JOIN + 1.2);
  engine.sound.play('item');
  void st.setLook('confront', 0.3);
  rig.cut(V(-2, 1.2, -1), V(0, 1.8, 9), 36);
  slam('まとめろ', clock.t, 1.15, { x: 960, y: 190, size: 170, rot: 3, shadow: '#2f5c8a' });
  clueCollide('灯晶が消えた時刻', 'だんごが消えた時刻', '同じ時刻！', clock.t + 0.05, 1.15);
  void until(clock.t + 0.45).then(() => engine.sound.play('impact'));
  // 問いただせ：尋問の対峙カット（ゲームの画面そのもの）
  await until(JOIN + 2.35);
  wam.position.set(9.3, 0, -1.7);
  wam.faceInstant(-1);
  wil.position.set(7.2, 0, -1.25);
  wil.faceInstant(1);
  wil.setExpression('通常', true);
  void game.versus(wam, 'だんごは知らない');
  void pressAt(JOIN + 4.15);

  // ======== 5. 尋問：証言 → 待った！ → 刮目せよ！ ========
  await until(JOIN + 4.55);
  rig.stiffness = 3;
  rig.cut(wam.position.clone().add(V(0, 0.55, 0)), V(0.4 * wam.facing, 0.9, 4.8), 30);
  rig.shot(wam.position.clone().add(V(0, 0.6, 0)), V(0.3 * wam.facing, 0.85, 4.2), 29);
  wam.setExpression('得意', true);
  game.testimony.show('ワムデュスの証言', 'そう。ワムがやった証拠なんて、ない', 2, 4);
  talk(wam, voice('ワムデュス', 'そう。ワムがやった証拠なんて、ない'));
  await until(JOIN + 8.15);
  game.testimony.hide();
  rig.cut(wil.headPosition().add(V(0.3, -0.2, 0)), V(-1.2, 0.2, 3.2), 28, -0.05);
  wil.setExpression('指差し', true);
  rig.shake(0.35, 0.5);
  void hud.shout('待った！');
  await until(JOIN + 9.3);
  // 嘘を見抜き、真実をつきつけろ！
  say('n6', JOIN + 9.3);
  rig.cut(V(8.25, 0.9, -1.45), V(0, 1.1, 6.4), 32);
  rig.shot(V(8.25, 0.85, -1.45), V(0, 1.0, 5.6), 31);
  wam.setExpression('驚き', true);
  speedLines(960, 470, 2.8, { color: 'rgba(255,250,240,0.55)', inner: 380, count: 70 });
  void until(JOIN + 9.9).then(() => evidenceCard(engine.assets.url('props/evidence_honey_puddle.webp'), '甘い水たまり', clock.t, 2.2, 960, 400));
  await until(JOIN + 12.45);
  rig.cut(wil.headPosition().add(V(0.4, -0.2, 0)), V(-1.4, 0.25, 3.0), 27, 0.06);
  rig.shake(0.4, 0.5);
  void hud.shout('刮目せよ！');
  await until(JOIN + 13.6);
  rig.cut(V(8.25, 0.85, -1.45), V(0, 0.9, 5.2), 31);
  await game.throwEvidence('honey_puddle', wam, true);
  void wam.damage(engine.tweens);
  st.spray.emit(wam.headPosition(), { count: 40, color: '#1e1418', spread: 1.8, up: 1.3, gravity: 5, size: 0.1, life: 0.7 });
  st.spray.emit(wam.headPosition(), { count: 30, color: '#ffd27a', spread: 1.8, up: 1.6, gravity: 3, size: 0.07, life: 0.8, glow: true });
  rig.shake(0.3, 0.4);

  // ======== 6. ブレイク ========
  await until(JOIN + 16.0);
  await director.play('@ブレイク ワムデュス');
  wam.setExpression('驚き', true);
  rig.stiffness = 2;
  rig.shot(wam.position.clone().add(V(0, 0.55, 0)), V(0.4 * wam.facing, 0.7, 3.9), 29);
  const cry = voice('ワムデュス', 'う……うわああん。ごめんなさい……！');
  talk(wam, cry);
  const cryEnd = clock.t + cry;
  // 最終便は画面の外で先に出発させておく（着くまで11秒かかる）
  void until(cryEnd - 2.8).then(() => director.play('@演出 飛空艇 到着'));

  // ======== 7. 結末：灯晶が灯り、空魚と最終便 ========
  const climax = Math.max(60.0, cryEnd + 0.2);
  await until(climax - 0.4);
  inkWipe(0.8, { color: '#2a1408', seed: 17 });
  await until(climax);
  wam.setExpression('通常', true);
  wil.position.set(-1.5, 0, 0.3);
  wil.faceInstant(1);
  wam.position.set(1.7, 0, -0.5);
  wam.faceInstant(-1);
  void st.setLook('dusk', 1.5);
  rig.stiffness = 2.5;
  rig.cut(V(0, 2.2, -1.6), V(1.6, 0.0, 4.6), 30);
  engine.sound.play('shine');
  void director.play('@灯り 灯台柱 つける');
  void rig.orbit(V(0, 2.4, -1.6), 4.2, 0.6, 3.4);
  say('n7', climax + 0.5);
  embers(9, { count: 80, seed: 31 });
  await until(climax + 1.4);
  void director.play('@演出 空魚 寄ってくる');
  await until(climax + 3.3);
  rig.stiffness = 1.4;
  rig.shot(V(0, 2.4, -1.6), V(0, 0.4, 9), 38);
  const gal = actor('galleon');
  talk(gal, voice('ガレヲン', '感嘆（光の中を泳いでいます。なんて綺麗なのでしょう）'));
  await until(climax + 6.0);
  rig.stiffness = 1.1;
  const dock = st.named.get('飛空艇の着く所')!.getWorldPosition(new THREE.Vector3());
  rig.cut(dock.clone().add(V(-4, 0, 0)), V(-5, 2.2, 21), 34);
  rig.shot(dock, V(-5, 2.2, 21), 34);

  // 一件落着！
  const done = Math.max(fromB(171.03) - 3.6, climax + 8.9);
  await until(done);
  rig.stiffness = 2.5;
  rig.cut(V(0.2, 1.1, -0.6), V(0, 1.8, 9.5), 34);
  st.confetti.fire(wil.headPosition().add(V(0, 0.4, 0)), 110, 2.4);
  st.confetti.fire(wam.headPosition().add(V(0, 0.4, 0)), 80, 2.0);
  engine.sound.play('item');
  wil.setExpression('笑い', true);
  void wil.hop(engine.tweens);
  void wam.hop(engine.tweens);
  slam('一件落着！', done + 0.1, 3.0, { x: 960, y: 300, size: 200, rot: -3 });

  // ======== 8. タイトル（曲の一番大きな山に合わせる） ========
  const T = fromB(172.07);
  await until(T - 0.5);
  inkWipe(0.9, { seed: 19 });
  await until(T);
  rig.stiffness = 0.5;
  rig.cut(V(2.5, 2.2, -5), V(-2, 0.4, 15), 36);
  rig.shot(V(2.5, 2.4, -5), V(-1.2, 0.9, 13.5), 34);
  titleLogo(engine.assets.url('ui/title_logo.webp'), T, 4.1);
  engine.sound.play('impact');
  say('n8', T + 0.25, false);

  // ======== 9. 5人がそろう一枚（ウィルナスの締めのひと言） ========
  const K = T + 4.1;
  await until(K - 0.45);
  inkWipe(0.9, { color: '#2a1408', seed: 23 });
  await until(K);
  const line: [string, number, number, 1 | -1][] = [
    ['galleon', -2.7, 0.35, 1],
    ['luwoh', -1.35, 0.75, 1],
    ['wilnas', 0.05, 1.1, 1],
    ['fediel', 1.5, 0.75, -1],
    ['wamdus', 2.85, 0.35, -1],
  ];
  for (const [id, x, z, f] of line) {
    const a = actor(id);
    a.position.set(x, 0, z);
    a.faceInstant(f);
    a.setExpression(ROLL.find((r) => r.id === id)!.expr, true);
  }
  void st.setLook('dusk', 0.1);
  rig.stiffness = 0.45;
  rig.cut(V(0.1, 0.95, 0.5), V(0, 0.75, 7.0), 32);
  rig.shot(V(0.1, 1.0, 0.5), V(0, 0.65, 6.1), 31);
  keyVisualLogo(engine.assets.url('ui/title_logo.webp'), K, 7.0);
  embers(7, { count: 70, seed: 41 });
  void until(K + 0.3).then(() => {
    talk(wil, voice('ウィルナス', '一件落着、いや二件落着！　重畳重畳である！'));
    void wil.hop(engine.tweens);
    st.confetti.fire(wil.headPosition().add(V(0, 0.6, 0)), 110, 2.6);
    engine.sound.play('item');
  });
  void until(K + 3.4).then(() => {
    line.forEach(([id], i) => void until(K + 3.4 + i * 0.12).then(() => actor(id).hop(engine.tweens)));
    st.confetti.fire(V(0.1, 2.6, 0.4), 120, 3.2);
  });

  // ======== 10. 終わりの一枚 ========
  const E = K + 7.0;
  await until(E - 0.45);
  inkWipe(0.9, { seed: 29 });
  await until(E);
  endCard(engine.assets.url('ui/cover_case01.webp'), engine.assets.url('ui/title_logo.webp'), E, DURATION - E + 0.2);
  say('n9', E + 0.7, false);
  await until(DURATION);
}
