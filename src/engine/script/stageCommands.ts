import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import { Ease } from '../core/tween';
import type { PaperActor } from '../paper/PaperActor';
import { CameraRig } from '../stage/CameraRig';
import type { SE } from '../audio/Sound';
import type { Director } from './Director';

/** 効果音の日本語名 */
const SE_NAMES: Record<string, SE> = {
  決定: 'confirm',
  選択: 'select',
  取消: 'cancel',
  入手: 'item',
  叫び: 'shout',
  失敗: 'wrong',
  紙: 'paper',
  紙起こし: 'rise',
  きらり: 'shine',
  発見: 'reveal',
  足音: 'step',
  ダン: 'impact',
  ひび: 'crack',
  割れる: 'glass',
  破れる: 'tear',
};

export interface StageCommandContext {
  engine: Engine;
  /** 台本に書かれた名前（表示名またはID）から役者を探す */
  actor(name: string): PaperActor | null;
  /** 探索中に戻すカメラ */
  resetCamera(): void;
  /** 話者へ自動でカメラを寄せるか */
  setAutoCamera?(on: boolean): void;
}

/** 役者を画面に収める構図 */
/** 下に会話ウィンドウが出るので、人物は画面のやや上寄りに収める */
export function actorShot(rig: CameraRig, a: PaperActor, zoom = 1): void {
  const look = a.position.clone().add(new THREE.Vector3(0, a.def.height * 0.36, 0));
  rig.shot(look, new THREE.Vector3(0.35 * a.facing, 0.75, 5.0 / zoom), 30);
}

/** 2人を同時に収める構図 */
export function twoShot(rig: CameraRig, a: PaperActor, b: PaperActor): void {
  const look = a.position.clone().lerp(b.position, 0.5).add(new THREE.Vector3(0, 0.45, 0));
  const dist = Math.max(5.6, a.position.distanceTo(b.position) * 1.35 + 3.4);
  rig.shot(look, new THREE.Vector3(0, 1.0, dist), 30);
}

/**
 * どのジャンルでも使える演出命令を登録する。
 * カメラ・表情・跳ねる・攻撃/被弾・向き・移動・登場/退場・効果音・揺れ・叫び・待つ・見た目・きらめき・暗転・字幕・たたむ/組み立て
 */
export function registerStageCommands(d: Director, ctx: StageCommandContext): void {
  const { engine } = ctx;
  const need = (name: string): PaperActor => {
    const a = ctx.actor(name);
    if (!a) throw new Error(`役者が見つかりません: ${name}`);
    return a;
  };

  d.register('cam', (args) => {
    const [target, second] = args;
    if (!target || target === '戻す' || target === 'reset') {
      ctx.setAutoCamera?.(true);
      return ctx.resetCamera();
    }
    if (target === '固定' || target === 'lock') return ctx.setAutoCamera?.(false);
    if (target === '自動' || target === 'auto') return ctx.setAutoCamera?.(true);
    // @カメラ 周回 灯台柱 6 … 対象を中心に6秒かけて1周する
    if (target === '周回' || target === 'orbit') {
      const a = ctx.actor(second);
      const obj = a ?? engine.stage.named.get(second);
      if (!obj) throw new Error(`カメラの対象が見つかりません: ${second}`);
      const p = a ? a.headPosition() : obj.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0));
      return engine.rig.orbit(p, 3.6, 0.55, Number(args[2] ?? 6));
    }
    // @カメラ 眺め 飛空艇の着く所 16 2 -4 … 舞台の名前付きの物を、距離・高さ・横のずれを決めて遠くから眺める
    if (target === '眺め' || target === 'view') {
      const obj = engine.stage.named.get(second);
      if (!obj) throw new Error(`カメラの対象が見つかりません: ${second}`);
      const [dist = 12, height = 1.5, side = 0, fov = 34] = args.slice(2).map(Number);
      ctx.setAutoCamera?.(false);
      engine.rig.shot(obj.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(side, height, dist), fov);
      return;
    }
    if (target === '引き' || target === 'wide') {
      const x = engine.rig.look.x;
      engine.rig.shot(new THREE.Vector3(x, 1.3, 0), new THREE.Vector3(0, 2.8, 12), 32);
      return;
    }
    const a = ctx.actor(target);
    if (!a) {
      // 役者でなければ舞台の名前付きの物を映す
      const obj = engine.stage.named.get(target);
      if (!obj) throw new Error(`カメラの対象が見つかりません: ${target}`);
      // 足元に原点がある物（水槽など）は userData.camY の高さを映す
      const p = obj.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, Number(obj.userData.camY ?? 0), 0));
      engine.rig.shot(p, new THREE.Vector3(0, 0.6, 6), 30);
      return;
    }
    if (second) twoShot(engine.rig, a, need(second));
    else actorShot(engine.rig, a);
  });
  d.register('face', (args) => {
    const a = need(args[0]);
    a.setExpression(args[1] ?? a.def.defaultExpression, false, engine.tweens);
  });
  d.register('hop', (args) => need(args[0]).hop(engine.tweens));
  // 強く出る（攻撃3コマ）／論破される（被弾）
  d.register('attack', (args) => need(args[0]).attack(engine.tweens));
  d.register('damage', (args) => {
    engine.rig.shake(0.3, 0.35);
    return need(args[0]).damage(engine.tweens);
  });
  d.register('turn', async (args) => {
    const a = need(args[0]);
    const dir = args[1];
    if (dir === '右' || dir === 'right') return a.face(1, engine.tweens);
    if (dir === '左' || dir === 'left') return a.face(-1, engine.tweens);
    const b = ctx.actor(dir);
    if (b) return a.face(b.position.x >= a.position.x ? 1 : -1, engine.tweens);
  });
  d.register('move', async (args) => {
    const a = need(args[0]);
    const x = Number(args[1]);
    const z = args[2] !== undefined ? Number(args[2]) : a.position.z;
    const from = a.position.clone();
    const to = new THREE.Vector3(x, 0, z);
    const dist = from.distanceTo(to);
    if (dist < 0.01) return;
    void a.face(to.x >= from.x ? 1 : -1, engine.tweens);
    a.setWalking(1);
    await engine.tweens.run(dist / 2.6, (k) => a.position.lerpVectors(from, to, k), Ease.linear, a.position);
    a.setWalking(0);
  });
  d.register('pop', async (args) => {
    const a = need(args[0]);
    // 場所を行き来する話では、今見えている場所に出てくる
    if (engine.stage.activeArea) engine.stage.moveToArea(a, engine.stage.activeArea);
    engine.sound.play('paper');
    await a.popIn(engine.tweens);
  });
  // @配置 トマ 3 -1 左 乗り場 … 役者をその位置へすぐに置く（向き・場所は省略可。場所を省くと今見えている場所）
  d.register('place', (args) => {
    const a = need(args[0]);
    const [, x, z, dir, area] = args;
    const where = area ?? engine.stage.activeArea;
    if (where) engine.stage.moveToArea(a, where);
    a.position.set(Number(x), 0, Number(z ?? a.position.z));
    if (dir === '右' || dir === 'right') a.faceInstant(1);
    if (dir === '左' || dir === 'left') a.faceInstant(-1);
    a.visible = true;
    // 見えている場所へ置くときは起こしておく（ほかの場所にいた人は、その場所をたたんだときに床へ倒れたままになっている）
    if (!where || where === engine.stage.activeArea) a.paper.rotation.x = 0;
  });
  // @遺体 トマ … 死体の絵の代わりに、黒く染めて裂けた紙を床に倒して置く（すぐにその姿になる。暗転中に置く）
  d.register('corpse', (args) => need(args[0]).corpse());
  d.register('hide', async (args) => {
    engine.sound.play('paper');
    await need(args[0]).popOut(engine.tweens);
  });
  d.register('se', (args) => engine.sound.play(SE_NAMES[args[0]] ?? (args[0] as SE)));
  d.register('shake', (args) => engine.rig.shake(Number(args[0] ?? 0.25), Number(args[1] ?? 0.4)));
  d.register('shout', async (args) => {
    engine.hud.hideDialogue();
    engine.rig.shake(0.35, 0.5);
    await engine.hud.shout(args.join(' '));
  });
  d.register('wait', (args) => engine.tweens.wait(Number(args[0] ?? 0.5)));
  d.register('look', (args) => engine.stage.setLook(args[0], Number(args[1] ?? 1.2)));
  // @紙吹雪 ウィルナス … その役者の頭の上で紙吹雪（役者を書かなければ画面の中心）
  d.register('confetti', (args) => {
    const a = args[0] ? ctx.actor(args[0]) : null;
    const at = a ? a.headPosition().add(new THREE.Vector3(0, 0.3, 0)) : engine.rig.look.clone();
    engine.stage.confetti.fire(at, 70);
    engine.sound.play('item');
  });
  d.register('sparkle', (args) => {
    const a = args[0] ? ctx.actor(args[0]) : null;
    const at = a ? a.headPosition() : engine.rig.look.clone();
    engine.stage.burst.fire(at);
    engine.sound.play('reveal');
  });
  d.register('fade', (args) => engine.hud.fade(args[0] === '明け' || args[0] === 'in' ? 0 : 1, Number(args[1] ?? 0.5)));
  // 区切りは ｜ （例: @字幕 第一話｜題名｜ひとこと）
  d.register('card', (args) => {
    const [title = '', sub = '', hint = ''] = args.join(' ').split(/[|｜]/);
    return engine.hud.card(title, sub, hint);
  });
  // @音楽 名前（Sound.defineBgm で登録した名前）／ @音楽 止める
  d.register('bgm', (args) => engine.sound.setBgm(!args[0] || args[0] === '止める' || args[0] === 'stop' ? null : args[0]));
  // @演出 名前 合図 … 舞台の名前付きの物に合図を送る（その物が cue(合図) を持っていれば呼び、終わるまで待つ）
  d.register('cue', async (args) => {
    const obj = engine.stage.named.get(args[0]) as (THREE.Object3D & { cue?: (signal: string, args: string[]) => unknown }) | undefined;
    if (!obj?.cue) throw new Error(`合図を受け取れる物がありません: ${args[0]}`);
    await obj.cue(args[1] ?? '', args.slice(2));
  });
  // @ブレイク ワムデュス … 論破の決め：斜めのカメラで3回「ダン！」と寄り、画面が割れて飛び散る。割れた向こうで役者の紙が破れる
  d.register('break', async (args) => {
    const a = need(args[0]);
    engine.hud.hideDialogue();
    ctx.setAutoCamera?.(false);
    const side = a.facing || 1;
    const head = a.headPosition();
    // 寄るたびに近く・反対向きに傾く
    const cuts = [
      { x: 1.5, y: 0.25, z: 3.8, lookY: -0.35, fov: 30, roll: 0.22 },
      { x: -1.1, y: -0.3, z: 2.7, lookY: -0.15, fov: 27, roll: -0.3 },
      { x: 0.5, y: 0.12, z: 1.7, lookY: 0, fov: 24, roll: 0.4 },
    ];
    for (let i = 0; i < cuts.length; i++) {
      const c = cuts[i];
      engine.rig.cut(head.clone().add(new THREE.Vector3(0, c.lookY, 0)), new THREE.Vector3(c.x * side, c.y, c.z), c.fov, c.roll);
      engine.sound.play('impact');
      engine.hud.flash(0.45 + i * 0.1, 0.15);
      engine.rig.shake(0.12 + i * 0.08, 0.25);
      engine.stage.spray.emit(head, { count: 10 + i * 6, color: '#1e1418', spread: 1.6, up: 1.2, gravity: 5, size: 0.1, life: 0.6 });
      // 3回目でやられの絵になり、破れて起き上がるまでそのまま
      if (i === cuts.length - 1) void a.damage(engine.tweens, true);
      await engine.tweens.wait(i < cuts.length - 1 ? 0.42 : 0.6);
    }
    // 割れた画面の向こうには、落ち着いた構図の舞台を見せる
    const image = engine.snapshot();
    actorShot(engine.rig, a);
    engine.rig.snap();
    const tear = async () => {
      // ひびが入ってから割れるまで待ち、破片の向こうで紙が裂ける
      await engine.tweens.wait(0.5);
      engine.sound.play('tear');
      await a.tear(engine.tweens, () => engine.sound.play('paper'));
    };
    await Promise.all([engine.hud.shatter(image), tear()]);
    ctx.setAutoCamera?.(true);
  });
  // 会話枠と立ち絵をいったん下げる（演出を見せたいとき）
  d.register('hidetext', () => engine.hud.hideDialogue());
  // 開幕の組み立て演出（@たたむ で倒し、@組み立て で左から順に起こす）
  d.register('flatten', () => engine.stage.flattenAll());
  d.register('assemble', () => {
    engine.sound.play('rise');
    return engine.stage.assemble();
  });
}
