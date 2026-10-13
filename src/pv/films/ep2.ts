/**
 * 第二話「雲市場と二つの灯晶」の更新予告（約30秒）。曲は市場の曲（bgm_market）の 29.7秒〜最後（つなぎ目なし）。
 * 拍は解析から 135.05BPM・頭から 0.38 秒（1小節 = 1.777 秒）。最後の決めの音 ≈ 29.57 秒に「近日更新」の判。
 *
 * 流れ: 弐（第2弾）→ 雲市場（語り）→ 市場灯が消えた → 灯晶が二つ！？ → 雲市場の人々 → 好敵手サンダルフォン
 *       → 推理対決・待った！・刮目せよ！ → 題名（語り）・近日更新
 */
import { CASE02 } from '../../game/case02/case';
import { lengthOf } from '../audio';
import { grid, helpers, type Film, type FilmContext } from '../film';
import { charCard, evidenceCard, placeCard } from '../mg';
import { castRush, caption, ktext, markText, wipe } from '../kit';
import { clock, embers, flash, speedLines, until } from '../timeline';
import { finale, opening } from './common';

const G = grid(0.44428, 0.38);
const bar = G.bar;
const DURATION = 30.1;
const FINAL_HIT = 29.57;

const SIERO = 'た、大変ですよ〜！　市場灯が、台座から消えちゃいました〜！';
const SANDAL = '答えが出たら、聞かせてもらう。証拠と一緒にな';
const STATEMENT = CASE02.confrontations!.sandalphon_fake.statements[2].text;

export const ep2: Film = {
  id: 'ep2',
  out: 'PV_逆転六竜_第二話_更新予告',
  load: async () => CASE02,
  duration: DURATION,
  music: { file: 'bgm_market.mp3', segs: [[29.7, 59.8]], fadeOutAt: DURATION - 0.35, fadeOut: 0.3, base: 0.55 },
  voices: (ctx) => [
    ctx.lineUrl('e2_place'),
    ctx.lineUrl('e2_title'),
    ctx.voiceUrl('シェロカルテ', SIERO),
    ctx.voiceUrl('サンダルフォン', SANDAL),
    ctx.voiceUrl('サンダルフォン', STATEMENT),
    ctx.voiceUrl('ウィルナス', '待った！'),
    ctx.voiceUrl('ウィルナス', '刮目せよ！'),
  ],
  images: () => ['ui/cover_case02.webp', 'ui/title_logo.webp', 'props/evidence_box_crystal.webp', 'props/evidence_floor_crystal.webp'],
  run,
};

async function run(ctx: FilmContext): Promise<void> {
  const { engine } = ctx;
  const { V, actor, line, voice, pressAt, game } = helpers(ctx);
  const st = engine.stage;
  const rig = engine.rig;
  const hud = engine.hud;
  const def = (id: string) => CASE02.cast.find((c) => c.id === id)!;
  const wil = actor('wilnas');
  const siero = actor('siero');
  const sandal = actor('sandalphon');

  // ======== 0. 弐（第2弾） ========
  void st.setLook('day', 0.01);
  rig.stiffness = 0.7;
  rig.cut(V(0, 2.4, -1.5), V(0, 5.5, 18), 38);
  rig.shot(V(0, 1.6, -1.5), V(0, 3.2, 15), 36);
  void hud.fade(1, 0.01);
  await until(0.03);
  void hud.fade(0, 0.35);
  opening(ctx, 2, { at: bar(0), until: bar(2) - 0.1, badgeUntil: bar(14) });
  embers(bar(2), { count: 50, seed: 2, color: '255,236,190' });
  wipe(0.75, { at: bar(2) - 0.38, seed: 21 });

  // ======== 1. 次なる舞台は、雲の上の市場 ========
  await until(bar(2));
  rig.stiffness = 0.55;
  rig.cut(V(-6, 1.2, -1), V(-3, 2.6, 11), 34);
  rig.shot(V(4, 1.2, -1), V(1, 2.2, 10.5), 34);
  line('e2_place', '次なる舞台は、雲の上の市場である！');
  placeCard('雲市場', '雲の<br>上', bar(2) + 0.05, bar(4) - bar(2) - 0.1);
  // 市場の皆が拍に合わせて跳ねる
  ['wamdus', 'galleon', 'luwoh', 'toma', 'paleta', 'fediel', 'lyria', 'santhira'].forEach((id, i) => void until(bar(2) + 0.4 + i * G.len).then(() => actor(id).hop(engine.tweens)));

  // ======== 2. 市場灯が消えた ========
  wipe(0.7, { at: bar(4) - 0.35, seed: 22, dir: -1 });
  await until(bar(4));
  rig.stiffness = 1.6;
  const lamp = st.named.get('台座')!.getWorldPosition(V(0, 0, 0));
  rig.cut(lamp.clone().add(V(0, -0.2, 0)), V(0.4, -0.6, 4.2), 30, -0.05);
  rig.shot(lamp.clone().add(V(0, -0.3, 0)), V(-0.2, -0.4, 3.3), 28, 0.03);
  rig.shake(0.25, 0.4);
  engine.sound.play('impact');
  siero.position.set(1.6, 0, -0.9);
  siero.faceInstant(-1);
  const sl = voice('シェロカルテ', SIERO, siero);
  caption('シェロカルテ', SIERO, def('siero').color!, bar(4) + 0.02, sl, { hold: 0.2 });
  void until(bar(4) + 0.3).then(() => siero.hop(engine.tweens));
  ktext('市場灯が消えた！', bar(4) + 0.25, bar(5) + 0.6 - bar(4) - 0.25, { x: 1350, y: 300, size: 120, anim: 'stamp', shadow: '#b8322a', rot: -4 });
  await until(bar(5) + 0.1);
  rig.stiffness = 1.2;
  rig.cut(V(0.8, 0.9, -0.6), V(-1.2, 1.3, 6.5), 32);
  rig.shot(V(1.4, 0.9, -0.6), V(-0.6, 1.2, 5.6), 31);

  // ======== 3. 灯晶が、二つ！？ ========
  await until(bar(6));
  engine.sound.play('reveal');
  flash(0.3, '255,240,210', 0.6);
  rig.shake(0.2, 0.3);
  evidenceCard(ctx.asset('props/evidence_box_crystal.webp'), '画材箱の灯晶', bar(6), bar(7) + 0.5 - bar(6), 560, 520);
  void until(bar(6) + G.len).then(() => {
    engine.sound.play('reveal');
    evidenceCard(ctx.asset('props/evidence_floor_crystal.webp'), '台の下の灯晶', clock.t, bar(7) + 0.5 - clock.t, 1360, 520);
  });
  const two = ktext('灯晶が、二つ！？', bar(6) + G.len * 2, bar(7) + 0.5 - bar(6) - G.len * 2, { y: 150, size: 130, anim: 'pop', shadow: '#b8322a' });
  void until(bar(6) + G.len * 2 + 0.45).then(() => markText(two, 4, 5, 'circle', clock.t, bar(7) + 0.5 - clock.t, { width: 18, pad: 22 }));

  // ======== 4. 雲市場の人々 ========
  wipe(0.7, { at: bar(7) + 0.2, seed: 23 });
  await until(bar(7) + 0.55);
  const rushEnd = bar(9) + 0.2;
  castRush(
    [
      { id: 'siero', pose: 'siero_01_normal', role: '市場の元締め' },
      { id: 'paleta', pose: 'paleta_01_normal', role: '絵描きの少年' },
      { id: 'santhira', pose: 'santhira_01_normal', role: '恋に恋する娘' },
      { id: 'lyria', pose: 'lyria_01_normal', role: 'わたあめ好き' },
      { id: 'toma', pose: 'toma_01_normal', role: '商会の手代' },
    ].map((c) => ({ pose: ctx.pose(c.pose), name: def(c.id).name, color: def(c.id).color!, role: c.role })),
    clock.t,
    rushEnd - clock.t,
    { per: 0.12, title: '雲市場の人々' },
  );
  [0, 1, 2, 3, 4].forEach((i) => void until(clock.t + i * 0.12).then(() => engine.sound.play('paper')));

  // ======== 5. 好敵手サンダルフォン ========
  await until(rushEnd - 0.05);
  sandal.visible = true;
  sandal.position.set(-1.0, 0, -0.6);
  sandal.faceInstant(1);
  rig.stiffness = 1.5;
  rig.cut(sandal.headPosition().add(V(0.7, -0.3, 0)), V(-1.0, 0.1, 3.6), 30, 0.05);
  rig.shot(sandal.headPosition().add(V(0.9, -0.25, 0)), V(-0.7, 0.2, 3.1), 29, 0.03);
  const sv = lengthOf(ctx.voiceUrl('サンダルフォン', SANDAL));
  charCard({
    name: 'サンダルフォン',
    role: '好敵手・天司長',
    color: def('sandalphon').color!,
    color2: '#1e1408',
    pose: ctx.pose('sandalphon_01_normal'),
    quote: SANDAL,
    start: rushEnd,
    dur: bar(11) - rushEnd + 0.15,
    voiceAt: rushEnd + 0.15,
    voiceLen: sv,
    seed: 5,
  });
  void until(rushEnd + 0.15).then(() => voice('サンダルフォン', SANDAL, sandal));
  void until(rushEnd).then(() => engine.sound.play('paper'));

  // ======== 6. 推理対決 → 待った！ → 刮目せよ！ ========
  wipe(0.7, { at: bar(11) - 0.35, seed: 24, dir: -1 });
  await until(bar(11));
  void st.setLook('confront', 0.01);
  // 対決の構図に入らないよう、ほかの人は下げる
  ['toma', 'luwoh', 'paleta', 'siero', 'galleon'].forEach((id) => (actor(id).visible = false));
  wil.position.set(-3.2, 0, 0.4);
  wil.faceInstant(1);
  sandal.position.set(-0.8, 0, -0.2);
  sandal.faceInstant(-1);
  rig.cut(V(-2.0, 1.0, 0.1), V(0, 1.2, 7), 32);
  void game.versus(sandal, 'パレタが偽物を作った', '推理対決');
  void pressAt(bar(11) + 1.5);
  await until(bar(12) - 0.05);
  rig.stiffness = 3;
  rig.cut(sandal.position.clone().add(V(0, 0.75, 0)), V(0.4 * sandal.facing, 0.8, 4.6), 30);
  rig.shot(sandal.position.clone().add(V(0, 0.8, 0)), V(0.3 * sandal.facing, 0.8, 4.0), 29);
  game.testimony.show('サンダルフォンの推理', STATEMENT, 2, 3);
  const stl = voice('サンダルフォン', STATEMENT, sandal);
  const wait = Math.min(stl + 0.1, bar(13) - bar(12) - 0.2);
  await until(bar(12) + wait);
  game.testimony.hide();
  rig.cut(wil.headPosition().add(V(0.3, -0.2, 0)), V(-1.2, 0.2, 3.2), 28, -0.05);
  wil.setExpression('指差し', true);
  rig.shake(0.35, 0.5);
  void hud.shout('待った！');
  await until(bar(13) + 0.35);
  rig.cut(wil.headPosition().add(V(0.4, -0.2, 0)), V(-1.4, 0.25, 3.0), 27, 0.06);
  rig.shake(0.4, 0.5);
  speedLines(760, 470, 1.1, { color: 'rgba(255,250,240,0.6)', inner: 380 });
  void hud.shout('刮目せよ！');
  await until(bar(13) + 1.45);
  rig.cut(V(-1.6, 0.85, 0.1), V(0, 0.9, 5.4), 31);
  void game.throwEvidence('floor_crystal', sandal, true).then(() => {
    void sandal.damage(engine.tweens);
    st.spray.emit(sandal.headPosition(), { count: 40, color: '#1e1418', spread: 1.8, up: 1.3, gravity: 5, size: 0.1, life: 0.7 });
    st.spray.emit(sandal.headPosition(), { count: 30, color: '#ffd27a', spread: 1.8, up: 1.6, gravity: 3, size: 0.07, life: 0.8, glow: true });
    rig.shake(0.3, 0.4);
  });

  // ======== 7. 題名・近日更新 ========
  wipe(0.8, { at: bar(14) - 0.4, seed: 25 });
  await until(bar(14));
  ['toma', 'luwoh', 'paleta', 'siero', 'galleon'].forEach((id) => (actor(id).visible = true));
  void st.setLook('day', 0.01);
  finale(ctx, 2, { at: bar(14), dur: DURATION - bar(14) + 0.05, stampAt: FINAL_HIT, line: 'e2_title', lineAt: bar(14) + 0.35 });
  await until(DURATION);
}
