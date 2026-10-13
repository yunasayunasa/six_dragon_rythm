/**
 * 総合 PV（約32秒）「5ヶ月連続更新企画」。曲はファンファーレの終盤 157.8秒〜最後（つなぎ目なし。Gemini の聴き比べで一番）。
 * 拍は曲の解析から 143.35BPM・区間の頭から 0.25 秒（1小節 = 1.674 秒）。場面の切り替えは小節の頭に合わせる。
 *
 * 流れ: 5ヶ月連続更新企画！（立体の5が回る）→ 全5話の扉絵を1小節ずつ → 5枚の札が裏返る（毎月1話ずつ）
 *       → 五竜 → 調べろ・まとめろ・問いただせ → 刮目せよ！ → タイトル → 締め（5ヶ月連続更新企画・第一話公開中）
 */
import { CASE01 } from '../../game/case01/case';
import { EPISODES } from '../../game/episodes';
import { lengthOf, narrate } from '../audio';
import { grid, helpers, type Film, type FilmContext } from '../film';
import { clueCollide, evidenceCard, keyVisualLogo, slam, titleLogo } from '../mg';
import { castRush, epPanel, ktext, lineup, marker, markText, shade, spinNumeral, wipe } from '../kit';
import { clock, embers, flash, until } from '../timeline';

const G = grid(0.41856, 0.25);
const bar = G.bar;
const DURATION = 31.8;

const DRAGONS = [
  { id: 'wilnas', pose: 'wilnas_05_hand_on_hip_laugh', role: '熱き捜査官' },
  { id: 'luwoh', pose: 'luwoh_04_pointing_explaining', role: '堅物の灯台番' },
  { id: 'fediel', pose: 'fediel_03_taunting', role: '甘味を愛する貴婦人' },
  { id: 'galleon', pose: 'galleon_04_blow_kiss', role: '祝福を贈る竜' },
  { id: 'wamdus', pose: 'wamdus_04_proud', role: 'マイペースな釣り好き' },
];
const CHIPS = ['公開中', '第2弾', '第3弾', '第4弾', '最終弾'];
const BANDS = ['#b8322a', '#2f6f7a', '#4a4f6a', '#2a3a5a', '#8a5a1a'];

export const overall: Film = {
  id: 'overall',
  out: 'PV_逆転六竜_総合PV',
  load: async () => CASE01,
  duration: DURATION,
  music: { file: 'fanfare.mp3', segs: [[157.8, 189.6]], fadeOutAt: DURATION - 0.7, fadeOut: 0.6 },
  voices: (ctx) => [ctx.lineUrl('o_kikaku'), ctx.lineUrl('o_monthly'), ctx.narrUrl('n5'), ctx.narrUrl('n8'), ctx.voiceUrl('ウィルナス', '刮目せよ！')],
  images: () => [...EPISODES.map((e) => e.cover!), 'ui/title_logo.webp', 'props/evidence_honey_puddle.webp'],
  run,
};

async function run(ctx: FilmContext): Promise<void> {
  const { engine } = ctx;
  const { V, actor, line, pressAt, game } = helpers(ctx);
  const st = engine.stage;
  const rig = engine.rig;
  const hud = engine.hud;
  const wil = actor('wilnas');
  const wam = actor('wamdus');
  const def = (id: string) => CASE01.cast.find((c) => c.id === id)!;
  const narr = (id: string) => {
    narrate(ctx.narrUrl(id));
    return lengthOf(ctx.narrUrl(id));
  };

  // ======== 0. 5ヶ月連続更新企画！ ========
  void st.setLook('dusk', 0.01);
  rig.stiffness = 0.6;
  rig.cut(V(0, 1.6, -1.2), V(-1.5, 1.4, 13.5), 34);
  rig.shot(V(0, 1.7, -1.2), V(0.8, 1.2, 11.5), 33);
  void hud.fade(1, 0.01);
  shade(0, 5.5, { alpha: 0.66, fadeIn: 0.01, fadeOut: 0.4 });
  embers(6, { count: 90, seed: 3 });
  await until(0.05);
  void hud.fade(0, 0.5);
  spinNumeral('5', 0.18, bar(3) + 0.05, { x: 560, y: 500, size: 580, turns: 1.5 });
  engine.sound.play('whoosh');
  void until(0.7).then(() => line('o_kikaku', '', { sub: false }));
  void until(0.73).then(() => engine.sound.play('impact'));
  ktext('ヶ月', G.beat(2), bar(3) + 0.05 - G.beat(2), { x: 870, y: 330, size: 190, anim: 'slide', align: 'left', shadow: '#b8322a' });
  await until(bar(1));
  engine.sound.play('impact');
  rig.shake(0.18, 0.3);
  ktext('連続更新', bar(1), bar(3) + 0.05 - bar(1), { x: 860, y: 570, size: 220, anim: 'drop', align: 'left', shadow: '#b8322a', stagger: 0.07 });
  await until(bar(2));
  engine.sound.play('impact');
  flash(0.3, '255,240,220', 0.6);
  rig.shake(0.25, 0.4);
  ktext('企画！', bar(2), bar(3) + 0.05 - bar(2), { x: 1420, y: 820, size: 140, anim: 'stamp', boxed: '#b8322a', rot: -4 });
  marker('circle', bar(2) + 0.1, bar(3) + 0.05 - bar(2), { x: 560, y: 500, w: 560, h: 660, width: 22, draw: 0.35 });
  wipe(0.8, { at: bar(3) - 0.4, seed: 3 });

  // ======== 1. 全5話の扉絵（1小節ずつ） ========
  EPISODES.forEach((e, i) => {
    const t0 = bar(3 + i);
    epPanel({ cover: ctx.asset(e.cover!), num: e.number, title: e.title, chip: CHIPS[i], start: t0, dur: G.len * 4 + (i < 4 ? 0.4 : 0.05), dir: i % 2 ? -1 : 1, color: BANDS[i] });
    void until(t0).then(() => {
      engine.sound.play('whoosh');
      engine.sound.play(i === 4 ? 'impact' : 'paper');
    });
  });

  // ======== 2. 5枚の札が裏返る：毎月1話ずつ ========
  await until(bar(8) - 0.05);
  // 後ろは夕景の港をゆっくり回る
  rig.stiffness = 0.4;
  rig.cut(V(0, 2.2, -1.6), V(5.5, 1.2, 8.5), 34);
  rig.shot(V(0, 2.2, -1.6), V(-4.5, 1.6, 9.5), 34);
  shade(bar(8), bar(10) - bar(8), { alpha: 0.5, fadeIn: 0.05 });
  embers(bar(10) - bar(8), { count: 60, seed: 9 });
  lineup(
    EPISODES.map((e, i) => ({ cover: ctx.asset(e.cover!), label: e.number, chip: i === 0 ? '公開中' : `第${i + 1}弾`, hot: i === 0 })),
    bar(8),
    bar(10) - bar(8) + 0.1,
    { y: 420, flips: [0, 1, 2, 3, 4].map((i) => bar(8) + 0.35 + i * G.len), zoom: true },
  );
  [0, 1, 2, 3, 4].forEach((i) => void until(bar(8) + 0.35 + i * G.len).then(() => engine.sound.play('select')));
  void until(bar(8) + 0.1).then(() => line('o_monthly', '', { sub: false }));
  await until(bar(9));
  const monthly = ktext('毎月1話ずつ、全5話！', bar(9), bar(10) - bar(9), { y: 770, size: 110, anim: 'pop', shadow: '#b8322a', stagger: 0.04 });
  void until(bar(9) + 0.75).then(() => markText(monthly, 7, 10, 'circle', clock.t, bar(10) - clock.t, { width: 18 }));
  wipe(0.8, { at: bar(10) - 0.4, seed: 5, dir: -1 });

  // ======== 3. 五竜 ========
  await until(bar(10));
  castRush(
    DRAGONS.map((d) => ({ pose: ctx.pose(d.pose), name: def(d.id).name, color: def(d.id).color ?? '#333', role: d.role })),
    bar(10),
    bar(12) - bar(10),
    { per: 0.11, title: 'ひと癖ある竜たち' },
  );
  DRAGONS.forEach((_, i) => void until(bar(10) + i * 0.11).then(() => engine.sound.play('paper')));

  // ======== 4. 調べろ・まとめろ・問いただせ ========
  const T4 = bar(12);
  wipe(0.7, { at: T4 - 0.35, seed: 7 });
  await until(T4);
  narr('n5');
  void st.setLook('sunset', 0.01);
  wil.position.set(0.1, 0, -0.25);
  wil.faceInstant(1);
  wil.setExpression('驚き', true);
  rig.stiffness = 2.5;
  rig.cut(V(1.0, 0.6, -0.4), V(-1.6, 1.1, 4.2), 30);
  rig.shot(V(1.1, 0.55, -0.4), V(-1.2, 1.0, 3.6), 29);
  st.burst.fire(V(1.2, 0.3, -0.45));
  engine.sound.play('reveal');
  slam('調べろ', T4, 1.1, { x: 520, y: 330, size: 210, rot: -5 });
  void until(T4 + 0.25).then(() => evidenceCard(ctx.asset('props/evidence_honey_puddle.webp'), '甘い水たまり', clock.t, 0.85, 1330, 520));
  await until(T4 + 1.1);
  engine.sound.play('item');
  void st.setLook('confront', 0.3);
  rig.cut(V(-2, 1.2, -1), V(0, 1.8, 9), 36);
  slam('まとめろ', clock.t, 1.1, { x: 960, y: 190, size: 170, rot: 3, shadow: '#2f5c8a' });
  clueCollide('灯晶が消えた時刻', 'だんごが消えた時刻', '同じ時刻！', clock.t + 0.02, 1.1);
  void until(clock.t + 0.42).then(() => engine.sound.play('impact'));
  await until(T4 + 2.2);
  wam.position.set(9.3, 0, -1.7);
  wam.faceInstant(-1);
  wil.position.set(7.2, 0, -1.25);
  wil.faceInstant(1);
  wil.setExpression('通常', true);
  void game.versus(wam, '問いただせ！');
  void pressAt(T4 + 3.25);

  // ======== 5. 刮目せよ！ ========
  const T5 = T4 + 3.4;
  await until(T5);
  rig.stiffness = 3;
  rig.cut(wil.headPosition().add(V(0.4, -0.2, 0)), V(-1.4, 0.25, 3.0), 27, 0.06);
  wil.setExpression('指差し', true);
  rig.shake(0.4, 0.5);
  void hud.shout('刮目せよ！');
  await until(T5 + 1.05);
  rig.cut(V(8.25, 0.85, -1.45), V(0, 0.9, 5.2), 31);
  wam.setExpression('驚き', true);
  void game.throwEvidence('honey_puddle', wam, true).then(() => {
    void wam.damage(engine.tweens);
    st.spray.emit(wam.headPosition(), { count: 30, color: '#ffd27a', spread: 1.8, up: 1.6, gravity: 3, size: 0.07, life: 0.8, glow: true });
    rig.shake(0.3, 0.4);
  });

  // ======== 6. タイトル ========
  const T6 = bar(15);
  wipe(0.8, { at: T6 - 0.4, seed: 19 });
  await until(T6);
  wam.setExpression('通常', true);
  wil.setExpression('通常', true);
  void st.setLook('dusk', 0.01);
  rig.stiffness = 0.5;
  rig.cut(V(2.5, 2.2, -5), V(-2, 0.4, 15), 36);
  rig.shot(V(2.5, 2.4, -5), V(-1.2, 0.9, 13.5), 34);
  titleLogo(ctx.asset('ui/title_logo.webp'), T6, bar(16.5) - T6 + 0.2);
  engine.sound.play('impact');
  void until(T6 + 0.2).then(() => narr('n8'));

  // ======== 7. 締め：5ヶ月連続更新企画・第一話公開中 ========
  const T7 = bar(16.5);
  wipe(0.8, { at: T7 - 0.4, color: '#2a1408', seed: 23 });
  await until(T7);
  rig.cut(V(0, 2.2, -1.6), V(-5, 1.2, 9.5), 34);
  rig.shot(V(0, 2.2, -1.6), V(-3.6, 1.5, 10.5), 34);
  const rest = DURATION - T7 + 0.1;
  shade(T7, rest, { alpha: 0.6, fadeIn: 0.05, fadeOut: 0.6 });
  embers(rest, { count: 70, seed: 41 });
  keyVisualLogo(ctx.asset('ui/title_logo.webp'), T7, rest);
  ktext('5ヶ月連続更新企画！', T7 + 0.05, rest - 0.05, { y: 405, size: 116, anim: 'zoom', shadow: '#b8322a', stagger: 0.035 });
  lineup(
    EPISODES.map((e, i) => ({ cover: ctx.asset(e.cover!), label: e.number, chip: i === 0 ? '公開中' : `第${i + 1}弾`, hot: i === 0 })),
    T7 + 0.15,
    rest - 0.15,
    { y: 655, current: 1 },
  );
  ktext('毎月1話ずつ更新　スマホ・PCのブラウザで遊べる', T7 + 0.7, rest - 0.7, { y: 912, size: 40, font: 'maru', anim: 'rise', stroke: 0, stagger: 0.012 });
  ktext('yunasayunasa.github.io/Six_dragon_gyakuten', T7 + 0.9, rest - 0.9, { y: 990, size: 28, font: 'maru', anim: 'rise', stroke: 0, stagger: 0.006, color: '#f3e6cf' });
  await until(bar(17) + 0.05);
  engine.sound.play('shine');
  flash(0.3, '255,236,190', 0.45);
  await until(DURATION);
}
