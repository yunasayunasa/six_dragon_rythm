/**
 * PV 1本ぶんの決まり（どの話の舞台で撮るか・長さ・曲・使う声・流れ）。
 * 撮影用ページ /pv/?film=<id> で選ぶ（tools/pv_record.mjs --film <id>）。
 */
import * as THREE from 'three';
import type { Engine } from '../engine';
import type { PaperActor } from '../engine/paper/PaperActor';
import type { CaseData } from '../genres/investigation/types';
import { lengthOf, narrate, type MusicPlan } from './audio';
import type { CardPose } from './mg';
import { subtitle } from './mg';
import { clock, until } from './timeline';

export interface PVContext {
  engine: Engine;
  game: unknown;
  director: { play(src: string): Promise<void> };
  /** 第一話 PV のナレーター（pv/narration/<id>.mp3） */
  narrUrl(id: string): string;
  /** この話のセリフの声 */
  voiceUrl(name: string, text: string): string;
  /** 立ち絵（cast/<poseId>） */
  pose(poseId: string): CardPose;
}

export interface FilmContext extends PVContext {
  data: CaseData;
  /** PV 用の新しいセリフ（pv/lines/<id>.mp3。tools/pv_lines.mjs） */
  lineUrl(id: string): string;
  /** 別の話のセリフの声（voice/<話>/） */
  voiceIn(ep: string, name: string, text: string): string;
  asset(path: string): string;
}

export interface Film {
  id: string;
  /** 書き出すファイル名（拡張子なし。コウセイ直下に置く） */
  out: string;
  load(): Promise<CaseData>;
  duration: number;
  /** 曲（public/assets/audio/ のファイル名と、使う区間） */
  music: Omit<MusicPlan, 'url'> & { file: string };
  /** 先に長さを調べる声（URL） */
  voices(ctx: FilmContext): string[];
  /** 先に読み込んでおく画像（public/assets からの相対） */
  images(ctx: FilmContext): string[];
  run(ctx: FilmContext): Promise<void>;
}

/** 拍の格子（曲の解析から）。bar(n) は n 小節目の頭、beat(n) は n 拍目 */
export function grid(beat: number, phase: number, perBar = 4) {
  return {
    beat: (n: number) => phase + n * beat,
    bar: (n: number) => phase + n * beat * perBar,
    len: beat,
  };
}

/** よく使う操作をまとめる（どの話の PV でも同じ） */
export function helpers(ctx: FilmContext) {
  const { engine } = ctx;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const actor = (id: string) => engine.stage.actor(id);
  const talk = (a: PaperActor, seconds: number) => {
    a.talking = true;
    void until(clock.t + seconds).then(() => (a.talking = false));
  };
  /** ゲームのセリフの声を鳴らして、口を動かす（声の長さを返す） */
  const voice = (name: string, text: string, who?: PaperActor | null) => {
    const url = ctx.voiceUrl(name, text);
    engine.sound.playVoice(url);
    const len = lengthOf(url);
    if (who) talk(who, len);
    return len;
  };
  /** PV 用のセリフ（ウィルナスの語り）。字幕つき */
  const line = (id: string, text: string, opts: { sub?: boolean; gain?: number } = {}) => {
    const url = ctx.lineUrl(id);
    narrate(url, opts.gain ?? 1.15);
    const len = lengthOf(url);
    if (opts.sub !== false) subtitle(text, clock.t, len + 0.3);
    return len;
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
  const game = ctx.game as {
    versus(w: PaperActor, title: string, label?: string, hint?: string): Promise<void>;
    throwEvidence(id: string, w: PaperActor, hit: boolean): Promise<void>;
    testimony: { show(title: string, text: string, i: number, n: number): void; hide(): void };
    showArea(id: string): void;
  };
  /** 見える場所をすぐ切り替える（役者・カメラは動かさない）。look で見た目も変える */
  const area = (id: string, look?: string, seconds = 0.01) => {
    game.showArea(id);
    if (look) void engine.stage.setLook(look, seconds);
  };
  return { V, actor, talk, voice, line, pressAt, game, area };
}
