/**
 * 最終話「暁の空に、六竜の逆転」の更新予告（約31秒）。曲は決戦の曲（bgm_final）の 88.5秒〜最後（つなぎ目なし。Gemini の聴き比べで満点）。
 * 拍は解析から 142.75BPM（1拍 0.4203 秒）・頭から 0.15 秒（1小節 = 1.681 秒）。11.92秒で曲が切り替わり、28.73秒から余韻。
 *
 * 流れ: 伍（最終弾）・空じゅうの灯りが消えていく（語り）→ 院長「困るどころではない」灯晶院に全権を
 *       → ウィルナス「待てい！」→ 雲上議会 → 五竜が持ち場へ（語り「夜明けまでに」）→ 最終尋問・刮目せよ！ → 題名・近日更新
 */
import * as THREE from 'three';
import { CASE05 } from '../../game/case05/case';
import { grid, helpers, type Film, type FilmContext } from '../film';
import { slam } from '../mg';
import { caption, castRush, ktext, lightsOut, wipe } from '../kit';
import { clock, flash, speedLines, until } from '../timeline';
import { finale, opening } from './common';
import type { PaperActor } from '../../engine/paper/PaperActor';

const G = grid(0.42033, 0.15);
const bar = G.bar;
const DURATION = 31.1;

const CHIEF = '――困るどころではない';
const WIL = '待てい！　その全権、渡してはならん！';
const STATEMENT = CASE05.confrontations!.chief_fake.statements[2].text;

export const ep5: Film = {
  id: 'ep5',
  out: 'PV_逆転六竜_最終話_更新予告',
  load: async () => CASE05,
  duration: DURATION,
  music: { file: 'bgm_final.mp3', segs: [[88.5, 119.6]], fadeOutAt: DURATION - 0.5, fadeOut: 0.45, base: 0.6 },
  voices: (ctx) => [
    ctx.lineUrl('e5_place'),
    ctx.lineUrl('e5_dawn'),
    ctx.lineUrl('e5_title'),
    ctx.voiceUrl('ベルゼバブ', CHIEF),
    ctx.voiceUrl('ウィルナス', WIL),
    ctx.voiceUrl('ベルゼバブ', STATEMENT),
    ctx.voiceUrl('ウィルナス', '刮目せよ！'),
  ],
  images: () => ['ui/cover_case05.webp', 'ui/title_logo.webp'],
  run,
};

async function run(ctx: FilmContext): Promise<void> {
  const { engine } = ctx;
  const { V, actor, line, voice, pressAt, game, area } = helpers(ctx);
  const st = engine.stage;
  const rig = engine.rig;
  const hud = engine.hud;
  const def = (id: string) => CASE05.cast.find((c) => c.id === id)!;
  const stage = st as unknown as { moveToArea(a: PaperActor, area: string): void };
  const wil = actor('wilnas');
  const chief = actor('beelzebub');
  const lantern = st.named.get('灯台柱')!;

  // ======== 0. 伍（最終弾）・空じゅうの灯りが消えていく ========
  area('桟橋', 'night');
  actor('guard_p').visible = false;
  rig.stiffness = 0.35;
  // 灯台柱（ただ一つ灯り続ける灯り）は、まだ映さない
  rig.cut(V(-9, 4.2, -6), V(-3, -2.2, 12), 40);
  rig.shot(V(-7.5, 4.0, -6), V(-1, -2.4, 11), 40);
  void hud.fade(1, 0.01);
  await until(0.03);
  void hud.fade(0, 0.6);
  lightsOut(0, bar(3) + 0.1, { count: 54, first: 1.6, last: bar(3) - 0.45, seed: 7 });
  opening(ctx, 5, { at: bar(0), until: bar(1) + 1.2, badgeUntil: bar(14.5), dark: 0.35, sub: '最終話　更新予告' });
  void until(0.55).then(() => line('e5_place', '星祭りの夜。空じゅうの灯りが、消えた。'));

  // ======== 1. 院長「困るどころではない」灯晶院に全権を ========
  wipe(0.7, { at: bar(3) - 0.35, seed: 51, color: '#0a0812' });
  await until(bar(3));
  area('議場', 'night');
  rig.stiffness = 1.2;
  rig.cut(chief.headPosition().add(V(-0.3, -0.35, 0)), V(1.3, -0.2, 3.4), 29, 0.06);
  rig.shot(chief.headPosition().add(V(-0.3, -0.3, 0)), V(0.9, -0.1, 2.8), 28, 0.03);
  await until(5.95);
  const cl = voice('ベルゼバブ', CHIEF, chief);
  caption('ベルゼバブ', CHIEF, def('beelzebub').color ?? '#3a2a4a', clock.t, cl, { until: bar(5) - 0.05 });
  await until(bar(4));
  flash(0.3, '200,160,255', 0.45);
  engine.sound.play('impact');
  const power = ktext('灯晶院に、全権を', bar(4), bar(5) - bar(4) + 0.05, { x: 640, y: 420, size: 120, font: 'mincho', anim: 'zoom', stroke: 0, color: '#efe4ff', stagger: 0.05 });
  power.style.textShadow = '0 0 30px rgba(120,60,200,.9), 0 4px 6px #000';

  // ======== 2. ウィルナス「待てい！」 ========
  await until(bar(5));
  wil.visible = true;
  wil.position.set(-2.6, 0, 0.5);
  wil.faceInstant(1);
  wil.setExpression('指差し', true);
  rig.stiffness = 3;
  rig.cut(wil.headPosition().add(V(0.5, -0.25, 0)), V(-1.4, 0.2, 2.9), 27, -0.07);
  rig.shake(0.3, 0.4);
  slam('待てい！', bar(5), 1.3, { x: 1250, y: 300, size: 210, rot: -4 });
  const wl = voice('ウィルナス', WIL, wil);
  caption('ウィルナス', WIL, def('wilnas').color ?? '#b8322a', bar(5) + 0.02, wl, { until: bar(7) + 0.25 });
  await until(bar(6));
  rig.stiffness = 1.0;
  rig.cut(V(0.2, 1.0, -0.6), V(-0.6, 1.3, 8.5), 32);
  rig.shot(V(0.2, 1.0, -0.6), V(0.3, 1.2, 7.6), 31);

  // ======== 3. 雲上議会（曲が切り替わる） ========
  await until(bar(7));
  castRush(
    [
      { id: 'beelzebub', pose: 'beelzebub_01_normal', role: '灯晶院の院長' },
      { id: 'baishura', pose: 'baishura_01_normal', role: '雲上議会の議長' },
      { id: 'siete', pose: 'siete_01_normal', role: '剣の名手' },
      { id: 'sandalphon', pose: 'sandalphon_01_normal', role: '天司長' },
    ].map((c) => ({ pose: ctx.pose(c.pose), name: def(c.id).name, color: def(c.id).color!, role: c.role })),
    bar(7),
    bar(8) - bar(7) + 0.05,
    { per: 0.09, title: '雲上議会' },
  );
  [0, 1, 2, 3].forEach((i) => void until(bar(7) + i * 0.09).then(() => engine.sound.play('paper')));

  // ======== 4. 五竜が持ち場へ（夜明けまでに） ========
  await until(bar(8));
  line('e5_dawn', '夜明けまでに、すべてを覆してみせる！');
  const post = (t: number, place: string, ids: string[], look: [number, number, number], off: [number, number, number], color: string, label: string) =>
    void until(t).then(() => {
      area(place, 'night');
      ids.forEach((id, i) => {
        const a = actor(id);
        stage.moveToArea(a, place);
        a.visible = true;
        a.position.set(look[0] - 0.6 + i * 1.3, 0, look[2] + 0.6);
        a.faceInstant(i ? -1 : 1);
      });
      rig.stiffness = 2;
      rig.cut(V(...look), V(...off), 30, 0.05);
      rig.shot(V(look[0] + 0.3, look[1], look[2]), V(off[0] - 0.4, off[1], off[2] - 0.4), 29, 0.02);
      engine.sound.play('whoosh');
      speedLines(960, 540, 0.35, { color: 'rgba(255,240,210,0.55)', inner: 420 });
      ktext(label, clock.t + 0.02, G.len * 2 - 0.05, { x: 1820, y: 860, size: 64, font: 'mincho', anim: 'slide', align: 'right', stroke: 0, boxed: color, stagger: 0.02 });
    });
  post(bar(8), '市場', ['fediel'], [-1.6, 0.9, 0.0], [-0.6, 0.6, 4.2], def('fediel').color ?? '#2a6a66', '雲市場　フェディエル');
  post(bar(8) + G.len * 2, '工房', ['galleon'], [-1.0, 0.9, 0.0], [0.8, 0.5, 4.2], def('galleon').color ?? '#7a5a3a', '霧の工房　ガレヲン');
  post(bar(8) + G.len * 4, '桟橋', ['wamdus', 'luwoh'], [-1.2, 1.1, -0.6], [-0.4, 0.9, 6.2], def('luwoh').color ?? '#8a6a20', '凪ノ桟橋　ワムデュスとルオー');
  void until(bar(8) + G.len * 4.2).then(() => {
    // 空じゅうの灯りが消えても、凪ノ桟橋の灯台だけは灯っている
    const at = lantern.getWorldPosition(new THREE.Vector3()).add(V(0, 0.4, 0));
    st.spray.emit(at, { count: 40, color: '#ffd27a', spread: 1.6, up: 2.0, gravity: 2.2, size: 0.09, life: 1.4, glow: true });
    engine.sound.play('shine');
  });

  // ======== 5. 最終尋問 → 刮目せよ！ ========
  await until(bar(9.5));
  area('議場', 'confront');
  ['fediel', 'galleon', 'wamdus', 'luwoh'].forEach((id) => (actor(id).visible = false));
  wil.position.set(-2.2, 0, 0.4);
  wil.faceInstant(1);
  wil.setExpression('通常', true);
  chief.position.set(1.6, 0, -0.4);
  chief.faceInstant(-1);
  rig.cut(V(-0.3, 1.0, 0), V(0, 1.2, 7.2), 32);
  void game.versus(chief, '偽灯晶など知らぬ', '最終尋問');
  void pressAt(bar(9.5) + 1.25);
  await until(bar(9.5) + 1.35);
  rig.stiffness = 0.9;
  rig.cut(chief.position.clone().add(V(0, 0.9, 0)), V(0.5 * chief.facing, 0.8, 4.8), 30);
  rig.shot(chief.position.clone().add(V(0, 0.95, 0)), V(0.3 * chief.facing, 0.8, 3.9), 28);
  game.testimony.show('ベルゼバブの証言', STATEMENT, 2, 4);
  voice('ベルゼバブ', STATEMENT, chief);
  await until(bar(13) - 0.05);
  game.testimony.hide();
  rig.stiffness = 3;
  rig.cut(wil.headPosition().add(V(0.4, -0.2, 0)), V(-1.4, 0.25, 3.0), 27, 0.06);
  wil.setExpression('指差し', true);
  rig.shake(0.4, 0.5);
  speedLines(760, 470, 1.1, { color: 'rgba(255,250,240,0.6)', inner: 380 });
  void hud.shout('刮目せよ！');
  await until(bar(13) + 1.05);
  rig.cut(V(-0.3, 0.85, -0.1), V(0, 0.9, 5.6), 31);
  void game.throwEvidence('seal', chief, true).then(() => {
    void chief.damage(engine.tweens);
    st.spray.emit(chief.headPosition(), { count: 40, color: '#1e1418', spread: 1.8, up: 1.3, gravity: 5, size: 0.1, life: 0.7 });
    st.spray.emit(chief.headPosition(), { count: 30, color: '#ffd27a', spread: 1.8, up: 1.6, gravity: 3, size: 0.07, life: 0.8, glow: true });
    rig.shake(0.35, 0.45);
    flash(0.3, '255,236,190', 0.6);
  });

  // ======== 6. 題名・近日更新 ========
  wipe(0.8, { at: bar(14.5) - 0.4, seed: 52, color: '#2a1408' });
  await until(bar(14.5));
  void st.setLook('dawn', 0.01);
  finale(ctx, 5, { at: bar(14.5), dur: DURATION - bar(14.5) + 0.05, stampAt: G.beat(70), line: 'e5_title', lineAt: bar(14.5) + 0.12, num: '最終話' });
  await until(DURATION);
}
