/**
 * 第四話「嵐の監獄船とルオーの罪」の更新予告（約30秒）。曲は嵐の曲（bgm_storm）の 29.6秒〜最後（つなぎ目なし。Gemini の聴き比べで満点）。
 * 拍は解析から 88.2BPM（1拍 0.6803 秒）・頭から 0.03 秒。7.51秒に重い一撃、19.08秒から山、29.3秒に最後の一撃。
 *
 * 流れ: 肆（第4弾）・嵐の監獄船（語り）→【一撃】最後の面会人は、ルオー → 「私が殺したと書いておきたまえ」
 *       → 監獄船の人々 →【山】ウィルナス「終わらせぬ！」・尋問（私が殺した）に朱の取り消し線 → 題名・近日更新
 */
import { CASE04 } from '../../game/case04/case';
import { grid, helpers, type Film, type FilmContext } from '../film';
import { placeCard, slam } from '../mg';
import { caption, castRush, ktext, markText, wipe } from '../kit';
import { clock, flash, speedLines, until } from '../timeline';
import { finale, opening } from './common';

const G = grid(0.68027, 0.03);
const bar = G.bar;
const DURATION = 30.4;
const IMPACT = 7.51;
const CLIMAX = 19.08;
const LAST_HIT = 29.28;

const LUWOH = '私が殺したと書いておきたまえ。それで終わる話なのだよ';
const WIL = '終わらせぬ！　甘い推理で人を疑うなと言ったのは、お主であろう！';

export const ep4: Film = {
  id: 'ep4',
  out: 'PV_逆転六竜_第四話_更新予告',
  load: async () => CASE04,
  duration: DURATION,
  music: { file: 'bgm_storm.mp3', segs: [[29.6, 60.0]], fadeOutAt: DURATION - 0.4, fadeOut: 0.35, base: 0.6 },
  voices: (ctx) => [ctx.lineUrl('e4_place'), ctx.lineUrl('e4_who'), ctx.lineUrl('e4_title'), ctx.voiceUrl('ルオー', LUWOH), ctx.voiceUrl('ウィルナス', WIL)],
  images: () => ['ui/cover_case04.webp', 'ui/title_logo.webp'],
  run,
};

async function run(ctx: FilmContext): Promise<void> {
  const { engine } = ctx;
  const { V, actor, line, voice, pressAt, game, area } = helpers(ctx);
  const st = engine.stage;
  const rig = engine.rig;
  const hud = engine.hud;
  const def = (id: string) => CASE04.cast.find((c) => c.id === id)!;
  const wil = actor('wilnas');
  const luwoh = actor('luwoh');
  const rain = st.named.get('雨') as unknown as { cue(s: string): void };
  /** 稲妻：雨の光と画面の白い光と揺れ */
  const thunder = (strength = 0.7) => {
    rain.cue('稲妻');
    flash(0.35, '225,235,255', strength);
    rig.shake(0.15 + strength * 0.2, 0.35);
    engine.sound.play('crack');
  };

  // ======== 0. 肆（第4弾）・嵐の監獄船 ========
  area('甲板', 'storm');
  rig.stiffness = 0.4;
  rig.cut(V(0, 2.4, -1.8), V(-3, 2.6, 15), 38);
  rig.shot(V(0, 2.2, -1.8), V(2, 1.8, 12.5), 36);
  void hud.fade(1, 0.01);
  await until(0.03);
  void hud.fade(0, 0.9);
  opening(ctx, 4, { at: bar(0) + 0.02, until: bar(1) + 0.6, badgeUntil: bar(9), dark: 0.5 });
  void until(1.4).then(() => thunder(0.5));
  await until(bar(1) + 0.15);
  line('e4_place', '嵐の監獄船で、囚人が殺された。');
  placeCard('監獄船', '嵐の<br>夜', bar(1) + 0.75, IMPACT - bar(1) - 0.9);
  rig.stiffness = 0.35;
  rig.cut(V(-2, 2.6, -2), V(-4, 0.6, 9.5), 34);
  rig.shot(V(2, 2.6, -2), V(1, 0.8, 9.5), 34);
  void until(5.2).then(() => thunder(0.4));

  // ======== 1.【一撃】最後の面会人は、ルオー ========
  await until(IMPACT);
  thunder(1);
  speedLines(960, 470, 0.7, { color: 'rgba(230,240,255,0.75)', inner: 360 });
  luwoh.visible = true;
  luwoh.position.set(1.2, 0, -0.6);
  luwoh.faceInstant(-1);
  luwoh.setExpression('構え', true);
  rig.stiffness = 1.0;
  rig.cut(luwoh.headPosition().add(V(-0.35, -0.25, 0)), V(1.1, -0.1, 3.0), 28, 0.07);
  rig.shot(luwoh.headPosition().add(V(-0.35, -0.2, 0)), V(0.8, -0.05, 2.5), 27, 0.04);
  line('e4_who', '最後の面会人は――ルオー。');
  ktext('最後の面会人', IMPACT + 0.3, bar(4) - IMPACT - 0.35, { x: 520, y: 330, size: 80, anim: 'rise', font: 'mincho', stroke: 0, color: '#eef2ff', stagger: 0.07 });
  ktext('ルオー', IMPACT + 1.7, bar(4) - IMPACT - 1.75, { x: 520, y: 480, size: 170, anim: 'zoom', shadow: def('luwoh').color ?? '#8a6a20' });

  // ======== 2.「私が殺したと書いておきたまえ」 ========
  await until(bar(4));
  rig.stiffness = 0.6;
  rig.cut(luwoh.headPosition().add(V(0.3, -0.4, 0)), V(-1.6, 0.3, 4.2), 30, -0.04);
  rig.shot(luwoh.headPosition().add(V(0.3, -0.35, 0)), V(-1.1, 0.2, 3.4), 29, -0.02);
  const ll = voice('ルオー', LUWOH, luwoh);
  caption('ルオー', LUWOH, def('luwoh').color ?? '#8a6a20', bar(4) + 0.02, ll, { hold: 0.1 });
  void until(bar(4) + 2.4).then(() => thunder(0.45));

  // ======== 3. 監獄船の人々（盛り上がりへ） ========
  wipe(0.7, { at: bar(5) + 1.75, seed: 41, color: '#0c0e16' });
  await until(bar(5) + 2.1);
  castRush(
    [
      { id: 'ilsa', pose: 'ilsa_01_normal', role: '看守長' },
      { id: 'eustace', pose: 'eustace_01_normal', role: '甲板の見張り' },
      { id: 'zeta', pose: 'zeta_01_normal', role: '看守' },
      { id: 'beatrix', pose: 'beatrix_01_normal', role: '看守' },
      { id: 'mio', pose: 'mio_01_normal', role: '検品見習い' },
      { id: 'belial', pose: 'belial_01_normal', role: '院の使い' },
    ].map((c) => ({ pose: ctx.pose(c.pose), name: def(c.id).name, color: def(c.id).color!, role: c.role })),
    clock.t,
    CLIMAX - 0.05 - clock.t,
    { per: 0.15, title: '監獄船の人々' },
  );
  [0, 1, 2, 3, 4, 5].forEach((i) => void until(clock.t + i * 0.15).then(() => engine.sound.play('paper')));

  // ======== 4.【山】終わらせぬ！ ========
  await until(CLIMAX);
  thunder(0.9);
  wil.position.set(-1.6, 0, 0.4);
  wil.faceInstant(1);
  wil.setExpression('指差し', true);
  luwoh.position.set(1.0, 0, -0.4);
  luwoh.faceInstant(-1);
  rig.stiffness = 3;
  rig.cut(wil.headPosition().add(V(0.5, -0.25, 0)), V(-1.4, 0.2, 2.9), 27, 0.08);
  slam('終わらせぬ！', CLIMAX, 1.35, { x: 1250, y: 300, size: 200, rot: -5 });
  const wl = voice('ウィルナス', WIL, wil);
  caption('ウィルナス', WIL, def('wilnas').color ?? '#b8322a', CLIMAX + 0.02, wl, { hold: 0.2 });
  await until(CLIMAX + 1.4);
  void st.setLook('confront', 0.01);
  rig.cut(V(-0.3, 1.0, 0), V(0, 1.2, 7), 32);
  void game.versus(luwoh, '私が殺した');
  void pressAt(bar(8) - 0.1);
  await until(bar(8));
  luwoh.setExpression('驚き', true);
  rig.stiffness = 1.5;
  rig.cut(luwoh.headPosition().add(V(0, -0.3, 0)), V(0.6, 0.1, 3.6), 29);
  rig.shot(luwoh.headPosition().add(V(0, -0.3, 0)), V(0.4, 0.1, 3.0), 28);
  const lie = ktext('私が殺した', bar(8) + 0.05, bar(9) - bar(8) - 0.05, { y: 400, size: 150, font: 'mincho', anim: 'rise', stroke: 0, color: '#f4f0ff', stagger: 0.06 });
  lie.style.textShadow = '0 0 26px rgba(10,10,30,.95), 0 4px 6px #000';
  // ウィルナスの「お主であろう！」に合わせて朱の取り消し線
  void until(CLIMAX + wl - 1.3).then(() => {
    markText(lie, 0, 5, 'strike', clock.t, bar(9) - clock.t, { width: 26, pad: 30 });
    engine.sound.play('impact');
    thunder(0.6);
  });

  // ======== 5. 題名・近日更新 ========
  wipe(0.8, { at: bar(9) - 0.4, seed: 42, color: '#0c0e16' });
  await until(bar(9));
  void st.setLook('storm', 0.01);
  finale(ctx, 4, { at: bar(9), dur: DURATION - bar(9) + 0.05, stampAt: LAST_HIT, line: 'e4_title', lineAt: bar(9) + 0.2 });
  await until(DURATION);
}
