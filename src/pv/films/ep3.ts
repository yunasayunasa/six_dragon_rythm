/**
 * 第三話「霧の工房と鐘の鳴らない夜」の更新予告（約30秒）。
 * 曲は港の曲（bgm_harbor）の頭 0〜7.258秒 ＋ 99.87秒〜（最大の山の頭）をつなぐ。つなぎ目は拍の頭どうし（Gemini の聴き比べで自然）。
 * 拍は解析から 137.95BPM（1拍 0.4349 秒）・頭から 0.30 秒。つなぎ目 7.258 秒＝16拍目で、ここで曲が一気に盛り上がる（ドロップ）。
 *
 * 流れ: 参（第3弾）→ 霧の町（語り）・鍵のかかった工房 → 夜警「あの方であります！」→【ドロップ】容疑者フェディエル！？
 *       → ウィルナス「待てい！」→ 霧の町の人々 → 鐘は鳴っていない → 尋問・刮目せよ！・霧が晴れる → 題名・近日更新
 */
import { CASE03 } from '../../game/case03/case';
import { grid, helpers, type Film, type FilmContext } from '../film';
import { placeCard } from '../mg';
import { caption, castRush, ktext, markText, wipe } from '../kit';
import { clock, flash, speedLines, until } from '../timeline';
import { finale, opening } from './common';

const G = grid(0.4349, 0.3);
const bar = G.bar;
const DURATION = 30.2;
const DROP = 7.258;

const WATCH = 'あの方であります！';
const FED = '此方は頼みに行っただけぞよ。……其方らまで疑うのかえ';
const WIL = '待てい！　鼎の仲間を、そう簡単に連れていかせはせん！';
const MAKIRA = '……鳴らせなかった。一度も';
const STATEMENT = CASE03.confrontations!.watchman.statements[1].text;

export const ep3: Film = {
  id: 'ep3',
  out: 'PV_逆転六竜_第三話_更新予告',
  load: async () => CASE03,
  duration: DURATION,
  music: { file: 'bgm_harbor.mp3', segs: [[0, DROP], [99.87, 123]], fadeOutAt: 27.9, fadeOut: 2.3, base: 0.6 },
  voices: (ctx) => [
    ctx.lineUrl('e3_place'),
    ctx.lineUrl('e3_title'),
    ...[
      ['夜警', WATCH],
      ['フェディエル', FED],
      ['ウィルナス', WIL],
      ['マキラ', MAKIRA],
      ['夜警', STATEMENT],
      ['ウィルナス', '待った！'],
      ['ウィルナス', '刮目せよ！'],
    ].map(([n, t]) => ctx.voiceUrl(n, t)),
  ],
  images: () => ['ui/cover_case03.webp', 'ui/title_logo.webp', 'props/evidence_night_log.webp'],
  run,
};

async function run(ctx: FilmContext): Promise<void> {
  const { engine } = ctx;
  const { V, actor, line, voice, pressAt, game, area } = helpers(ctx);
  const st = engine.stage;
  const rig = engine.rig;
  const hud = engine.hud;
  const def = (id: string) => CASE03.cast.find((c) => c.id === id)!;
  const wil = actor('wilnas');
  const fed = actor('fediel');
  const watch = actor('watchman');
  const mist = st.named.get('霧') as unknown as { cue(s: string, a: string[]): Promise<void> };

  // ======== 0. 参（第3弾）・霧の町 ========
  area('通り', 'fog');
  rig.stiffness = 0.45;
  rig.cut(V(-3, 1.6, -1.5), V(-2, 1.8, 13), 36);
  rig.shot(V(1, 1.4, -1.5), V(0.5, 1.4, 10.5), 34);
  void hud.fade(1, 0.01);
  await until(0.03);
  void hud.fade(0, 0.8);
  opening(ctx, 3, { at: bar(0), until: bar(2) - 0.15, badgeUntil: bar(14), dark: 0.55 });
  void until(0.95).then(() => line('e3_place', '霧に沈む職人の町で、老職人が死んだ。'));

  // ======== 1. 鍵のかかった工房 ========
  wipe(0.75, { at: bar(2) - 0.4, color: '#1a1a22', seed: 31 });
  await until(bar(2));
  area('工房', 'lantern');
  rig.stiffness = 0.8;
  rig.cut(V(3.3, 1.3, -2.3), V(-1.0, 0.4, 4.4), 30);
  rig.shot(V(3.7, 1.3, -2.3), V(-0.5, 0.3, 3.6), 28);
  placeCard('霧の町', '職人<br>の町', bar(2) + 0.05, bar(3.5) - bar(2));
  ktext('鍵のかかった工房', bar(2) + 0.3, bar(3) + 0.1 - bar(2) - 0.3, { x: 640, y: 300, size: 96, anim: 'rise', font: 'mincho', stroke: 0, color: '#f3ecff', stagger: 0.06 });

  // ======== 2. 夜警「あの方であります！」→ 此方かえ？ ========
  await until(bar(3));
  area('通り', 'fog');
  fed.visible = true;
  fed.position.set(3.4, 0, -0.4);
  fed.faceInstant(-1);
  watch.position.set(0.6, 0, -0.2);
  watch.faceInstant(1);
  rig.stiffness = 2.2;
  rig.cut(watch.headPosition().add(V(0.3, -0.2, 0)), V(-1.4, 0.2, 3.4), 29, -0.04);
  void until(6.15).then(() => {
    void watch.hop(engine.tweens);
    voice('夜警', WATCH, watch);
  });
  ktext('あの方であります！', 6.15, DROP - 6.15, { x: 1300, y: 300, size: 96, anim: 'pop', shadow: '#3a4a5a', rot: 3 });
  fed.setExpression('驚き', true);

  // ======== 3.【ドロップ】容疑者フェディエル！？ ========
  await until(DROP);
  flash(0.4, '255,255,255', 0.85);
  rig.shake(0.35, 0.5);
  engine.sound.play('impact');
  speedLines(1150, 470, 1.6, { color: 'rgba(240,244,255,0.7)', inner: 360 });
  rig.cut(fed.headPosition().add(V(0.25, -0.3, 0)), V(-0.6, 0.3, 3.5), 30, -0.08);
  rig.shot(fed.headPosition().add(V(0.25, -0.25, 0)), V(-0.4, 0.25, 3.0), 29, -0.05);
  ktext('容疑者', DROP + 0.02, bar(6) - DROP, { x: 470, y: 330, size: 100, anim: 'stamp', boxed: '#b8322a', rot: -6 });
  ktext('フェディエル！？', DROP + 0.25, bar(6) - DROP - 0.25, { x: 120, y: 520, size: 150, anim: 'slide', align: 'left', shadow: '#5a3a8a', stagger: 0.05 });
  void until(DROP + 0.45).then(() => {
    fed.setExpression('通常', true);
    const l = voice('フェディエル', FED, fed);
    caption('フェディエル', FED, def('fediel').color ?? '#2a6a66', clock.t, l, { hold: 0.15 });
  });

  // ======== 4. ウィルナス「待てい！」 ========
  await until(bar(6) + 0.4);
  wil.position.set(-1.8, 0, 0.5);
  wil.faceInstant(1);
  wil.setExpression('通常', true);
  rig.stiffness = 1.2;
  rig.cut(V(0.8, 0.9, -0.2), V(0.2, 1.1, 8.5), 32);
  rig.shot(V(0.8, 0.9, -0.2), V(-0.4, 1.0, 7.6), 31);
  await until(bar(7));
  wil.setExpression('指差し', true);
  rig.stiffness = 2.5;
  rig.cut(wil.headPosition().add(V(0.5, -0.25, 0)), V(-1.3, 0.15, 3.0), 28, 0.06);
  rig.shake(0.25, 0.35);
  const wl = voice('ウィルナス', WIL, wil);
  caption('ウィルナス', WIL, def('wilnas').color ?? '#b8322a', bar(7), wl, { hold: 0.1, until: bar(8) - 0.3 });

  // ======== 5. 霧の町の人々 ========
  wipe(0.7, { at: bar(8) - 0.35, seed: 32, color: '#1a1a22' });
  await until(bar(8));
  castRush(
    [
      { id: 'nio', pose: 'nio_01_normal', role: '心の音を聞く娘' },
      { id: 'makira', pose: 'makira_01_normal', role: '鐘楼の鐘つき' },
      { id: 'cagliostro', pose: 'cagliostro_01_normal', role: '錬金術師' },
      { id: 'clarice', pose: 'clarice_01_normal', role: 'その弟子' },
      { id: 'kagachi', pose: 'kagachi_01_normal', role: '灯晶院の検品官' },
    ].map((c) => ({ pose: ctx.pose(c.pose), name: def(c.id).name, color: def(c.id).color!, role: c.role })),
    bar(8),
    bar(10) - bar(8) + 0.05,
    { per: 0.12, title: '霧の町の人々' },
  );
  [0, 1, 2, 3, 4].forEach((i) => void until(bar(8) + i * 0.12).then(() => engine.sound.play('paper')));

  // ======== 6. 鐘は、鳴っていない ========
  await until(bar(10));
  area('鐘楼', 'fog');
  const makira = actor('makira');
  makira.position.set(-0.7, 0, 0.3);
  makira.faceInstant(1);
  rig.stiffness = 0.8;
  rig.cut(V(0.8, 2.6, -2.4), V(-1.0, -0.6, 7.5), 32);
  rig.shot(V(0.8, 2.3, -2.4), V(-0.3, -0.4, 6.6), 30);
  const ml = voice('マキラ', MAKIRA, makira);
  caption('マキラ', MAKIRA, def('makira').color!, bar(10) + 0.02, ml, { hold: 0.1 });
  const bell = ktext('鐘は、鳴っていない', bar(10) + 0.3, bar(12) - bar(10) - 0.3, { x: 1380, y: 300, size: 100, anim: 'rise', font: 'mincho', stroke: 0, color: '#f6f2ff', stagger: 0.07, rot: 0 });
  bell.style.textShadow = '0 0 22px rgba(20,20,40,.9), 0 3px 4px #000';
  void until(bar(11) + 0.1).then(() => markText(bell, 3, 9, 'underline', clock.t, bar(12) - clock.t, { width: 16 }));

  // ======== 7. 尋問 → 刮目せよ！ → 霧が晴れる ========
  wipe(0.7, { at: bar(12) - 0.35, seed: 33, dir: -1 });
  await until(bar(12));
  area('通り', 'confront');
  fed.visible = false;
  watch.position.set(1.4, 0, -0.4);
  watch.faceInstant(-1);
  wil.position.set(-1.0, 0, 0.3);
  wil.faceInstant(1);
  wil.setExpression('通常', true);
  rig.cut(V(0.2, 1.0, -0.1), V(0, 1.2, 7), 32);
  void game.versus(watch, '鐘のあと出てきたのはフェディエル');
  void pressAt(bar(12) + 1.25);
  await until(bar(12) + 1.4);
  rig.stiffness = 3;
  rig.cut(watch.position.clone().add(V(0, 0.8, 0)), V(0.4 * watch.facing, 0.8, 4.6), 30);
  game.testimony.show('夜警の証言', STATEMENT, 1, 3);
  voice('夜警', STATEMENT, watch);
  await until(bar(13) + 0.35);
  game.testimony.hide();
  rig.cut(wil.headPosition().add(V(0.4, -0.2, 0)), V(-1.4, 0.25, 3.0), 27, 0.06);
  wil.setExpression('指差し', true);
  rig.shake(0.4, 0.5);
  void hud.shout('刮目せよ！');
  await until(bar(13) + 1.4);
  rig.cut(V(0.2, 0.9, -0.1), V(0, 0.9, 5.6), 31);
  void st.setLook('fog', 0.8);
  void mist.cue('晴れる', ['1.6']);
  void game.throwEvidence('night_log', watch, true).then(() => {
    void watch.damage(engine.tweens);
    st.spray.emit(watch.headPosition(), { count: 30, color: '#ffd27a', spread: 1.8, up: 1.6, gravity: 3, size: 0.07, life: 0.8, glow: true });
    rig.shake(0.3, 0.4);
  });

  // ======== 8. 題名・近日更新 ========
  wipe(0.8, { at: bar(14) - 0.4, seed: 34 });
  await until(bar(14));
  finale(ctx, 3, { at: bar(14), dur: DURATION - bar(14) + 0.05, stampAt: 29.05, line: 'e3_title', lineAt: bar(14) + 0.3 });
  await until(DURATION);
}
