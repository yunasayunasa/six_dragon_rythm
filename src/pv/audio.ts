/**
 * PV の音。撮影中はゲームの音を鳴らさず「いつ・何を鳴らしたか」だけ記録し、
 * 撮り終えてから OfflineAudioContext で曲・声・効果音をまとめて書き出す（コマ送りでも音がずれない）。
 */
import type { Engine } from '../engine';
import { Sound, type SE } from '../engine/audio/Sound';
import { clock } from './timeline';

type AudioEvent =
  | { t: number; kind: 'se'; se: SE }
  | { t: number; kind: 'voice'; url: string }
  | { t: number; kind: 'stop' }
  | { t: number; kind: 'narr'; url: string; gain: number };

export const events: AudioEvent[] = [];

/** ゲームの Sound の代わりに記録する */
export function recordSound(engine: Engine): void {
  const s = engine.sound as unknown as Record<string, unknown>;
  s.play = (se: SE) => events.push({ t: clock.t, kind: 'se', se });
  s.playVoice = (url: string) => events.push({ t: clock.t, kind: 'voice', url });
  s.stopVoice = () => events.push({ t: clock.t, kind: 'stop' });
  for (const k of ['setBgm', 'fadeBgm', 'preloadVoice', 'unlock', 'playBgm']) s[k] = () => {};
}

/** ナレーション（ゲームの声とは別に重ねる。止められない） */
export function narrate(url: string, gain = 1.1): void {
  events.push({ t: clock.t, kind: 'narr', url, gain });
}

/** 声・ナレーションの長さ（秒）を先に調べておく（場面の長さを決めるのに使う） */
const lengths = new Map<string, number>();
export async function measure(urls: string[]): Promise<void> {
  const ctx = new OfflineAudioContext(1, 1, 48000);
  await Promise.all(
    urls.map(async (u) => {
      const buf = await ctx.decodeAudioData(await (await fetch(u)).arrayBuffer());
      lengths.set(u, buf.duration);
    }),
  );
}
export const lengthOf = (url: string) => lengths.get(url) ?? 2;

export interface MusicPlan {
  url: string;
  /**
   * 曲のどこを使うか（曲の秒 [から, まで] の並び）。PV の0秒から順につなぎ、つなぎ目は短く重ねる。
   * 最後の区間の「まで」は曲の終わりより先でもよい（曲の終わりで止まる）
   */
  segs: [number, number][];
  /** 曲の終わりを PV の何秒で迎えるか（そこから fadeOut 秒で消す） */
  fadeOutAt: number;
  fadeOut: number;
  /** 曲の大きさ（既定 0.5）。声の間は DUCK まで下げる */
  base?: number;
}

/** すべての音をまとめて、16bit ステレオ WAV（base64）で返す */
export async function mixdown(duration: number, music: MusicPlan, riseUrl: string): Promise<string> {
  const sr = 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sr), sr);
  const decode = async (u: string) => ctx.decodeAudioData(await (await fetch(u)).arrayBuffer());

  // 最後に軽く音圧をそろえる（大きな音が割れないように）
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 6;
  comp.ratio.value = 6;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  comp.connect(ctx.destination);
  const master = ctx.createGain();
  master.connect(comp);

  // ---- 曲：区間を順にクロスフェードでつなぐ。声の間は少し下げる（ダッキング）
  const song = await decode(music.url);
  const bus = ctx.createGain();
  bus.connect(master);
  const XF = 0.06;
  let pos = 0;
  music.segs.forEach(([from, to], i) => {
    const last = i === music.segs.length - 1;
    const len = Math.min(to, song.duration) - from;
    const src = ctx.createBufferSource();
    src.buffer = song;
    const g = ctx.createGain();
    src.connect(g).connect(bus);
    // 前の区間の終わりに XF 秒だけ重ねて入る
    const t0 = i ? pos - XF : pos;
    g.gain.setValueAtTime(i ? 0 : 1, 0);
    if (i) {
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(1, pos);
    }
    if (!last) {
      g.gain.setValueAtTime(1, pos + len - XF);
      g.gain.linearRampToValueAtTime(0, pos + len);
    }
    src.start(t0, i ? from - XF : from);
    if (!last) src.stop(pos + len + 0.01);
    pos += len;
  });

  const BASE = music.base ?? 0.5;
  const DUCK = 0.3;
  const speech: [number, number][] = [];

  // ---- 声（ゲームの声は1本ずつ。次の声か stop で止まる）
  const urls = [...new Set(events.flatMap((e) => (e.kind === 'voice' || e.kind === 'narr' ? [e.url] : [])))];
  const bufs = new Map(await Promise.all(urls.map(async (u) => [u, await decode(u)] as const)));
  let cur: { src: AudioBufferSourceNode; t: number; end: number } | null = null;
  const stopCur = (t: number) => {
    if (!cur) return;
    if (t < cur.end) {
      cur.src.stop(t);
      speech[speech.length - 1][1] = t;
    }
    cur = null;
  };
  const sorted = [...events].sort((p, q) => p.t - q.t);
  for (const e of sorted) {
    if (e.kind === 'voice') {
      stopCur(e.t);
      const src = ctx.createBufferSource();
      src.buffer = bufs.get(e.url)!;
      src.connect(master);
      src.start(e.t);
      cur = { src, t: e.t, end: e.t + src.buffer.duration };
      speech.push([e.t, cur.end]);
    } else if (e.kind === 'stop') stopCur(e.t);
    else if (e.kind === 'narr') {
      const src = ctx.createBufferSource();
      src.buffer = bufs.get(e.url)!;
      const g = ctx.createGain();
      g.gain.value = e.gain;
      src.connect(g).connect(master);
      src.start(e.t);
      speech.push([e.t, e.t + src.buffer.duration]);
    }
  }

  // ダッキング：声が出ている間は曲を下げる（重なった区間はまとめる）
  speech.sort((p, q) => p[0] - q[0]);
  const merged: [number, number][] = [];
  for (const s of speech) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1] + 0.25) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  bus.gain.setValueAtTime(BASE, 0);
  for (const [s, e] of merged) {
    bus.gain.setValueAtTime(BASE, Math.max(0, s - 0.08));
    bus.gain.linearRampToValueAtTime(DUCK, s);
    bus.gain.setValueAtTime(DUCK, e);
    bus.gain.linearRampToValueAtTime(BASE, e + 0.35);
  }
  // 終わりはゆっくり消す
  bus.gain.setValueAtTime(BASE, music.fadeOutAt);
  bus.gain.linearRampToValueAtTime(0.0001, music.fadeOutAt + music.fadeOut);

  // ---- 効果音：ゲームの合成音をそのまま使う。currentTime だけ鳴らしたい時刻に見せかける
  const sound = new Sound();
  // 割れる音などの高い音が耳に刺さらないよう、少しだけ丸める
  const seTone = ctx.createBiquadFilter();
  seTone.type = 'highshelf';
  seTone.frequency.value = 4500;
  seTone.gain.value = -3.5;
  seTone.connect(master);
  const seOut = ctx.createGain();
  seOut.gain.value = 1.15;
  seOut.connect(seTone);
  let fakeNow = 0;
  const proxy = new Proxy(ctx, {
    get(target, prop) {
      if (prop === 'currentTime') return fakeNow;
      const v = Reflect.get(target, prop, target);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  const sp = sound as unknown as { ctx: unknown; master: unknown };
  sp.ctx = proxy;
  sp.master = seOut;
  sound.setVolumeScale(1, 1, 1);
  const rise = await decode(riseUrl);
  for (const e of sorted) {
    if (e.kind !== 'se') continue;
    if (e.se === 'rise') {
      const src = ctx.createBufferSource();
      src.buffer = rise;
      const g = ctx.createGain();
      g.gain.value = 1.4;
      src.connect(g).connect(seOut);
      src.start(e.t);
      continue;
    }
    fakeNow = e.t;
    sound.play(e.se);
  }

  const out = await ctx.startRendering();
  return toWavBase64(out);
}

function toWavBase64(buf: AudioBuffer): string {
  const ch = [buf.getChannelData(0), buf.getChannelData(1)];
  const n = buf.length;
  const bytes = new Uint8Array(44 + n * 4);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 4, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 2; c++) {
      const x = Math.max(-1, Math.min(1, ch[c][i]));
      v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      o += 2;
    }
  }
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
