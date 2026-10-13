/**
 * PV の撮影用ページ（開発サーバーの /pv/ でだけ開く。公開するゲームには入らない）。
 * tools/pv_record.mjs が時計を止めた状態で開き、step() で1コマずつ進めて写す。
 * どの PV を撮るかは ?film=<id>（films.ts の FILMS。省略時は第一話 PV）。
 */
import '../engine/ui/ui.css';
import './pv.css';
import './kit.css';
import { Engine } from '../engine';
import { Voices } from '../engine/audio/Voices';
import { InvestigationGame } from '../genres/investigation/InvestigationGame';
import type { CastManifest } from '../engine/paper/PaperActor';
import { measure, mixdown, recordSound } from './audio';
import { clock, filmLayer, initOverlay, syncAnimations, tick } from './timeline';
import type { CardPose } from './mg';
import type { FilmContext } from './film';
import { FILMS } from './films';

async function boot() {
  const id = new URLSearchParams(location.search).get('film') ?? 'case01';
  const film = FILMS[id];
  if (!film) throw new Error(`PV がありません: ${id}（${Object.keys(FILMS).join(' / ')}）`);
  const engine = new Engine(document.getElementById('app')!, { namespace: 'pv' });
  recordSound(engine);
  await document.fonts.load('100px "Yuji Syuku"');
  await document.fonts.load('800 50px "Shippori Mincho B1"');
  await document.fonts.load('700 40px "Zen Maru Gothic"');
  await document.fonts.ready;
  const data = await film.load();
  const game = new InvestigationGame(data, {});
  await engine.setMode(game);
  await engine.warmUp();
  initOverlay(document.getElementById('pv')!);
  filmLayer();
  engine.onFrame.add((dt) => tick(dt));

  // ほかの話の声（総合 PV で使う）
  const others = new Map<string, Voices>();
  await Promise.all(
    ['case01', 'case02', 'case03', 'case04', 'case05'].map(async (ep) => {
      const v = new Voices();
      await v.load(engine.assets.url(`voice/${ep}/`));
      others.set(ep, v);
    }),
  );
  const manifest = await engine.assets.getJSON<CastManifest>('cast/manifest.json');
  // 立ち絵の元の向き：その絵の持ち主（id が絵の名前の頭に付く役者）の artFacing
  const facing = (poseId: string) =>
    data.cast
      .filter((c) => poseId.startsWith(`${c.id}_`))
      .sort((a, b) => b.id.length - a.id.length)[0]?.artFacing ?? 1;
  const ctx: FilmContext = {
    engine,
    game,
    data,
    director: (game as unknown as { director: FilmContext['director'] }).director,
    narrUrl: (n) => `/pv/narration/${n}.mp3`,
    lineUrl: (n) => `/pv/lines/${n}.mp3`,
    voiceUrl: (name, text) => {
      const u = engine.voices.url(name, text);
      if (!u) throw new Error(`声がありません: ${name}「${text}」`);
      return u;
    },
    voiceIn: (ep, name, text) => {
      const u = others.get(ep)?.url(name, text);
      if (!u) throw new Error(`声がありません: ${ep} ${name}「${text}」`);
      return u;
    },
    asset: (p) => engine.assets.url(p),
    pose: (poseId): CardPose => {
      const info = manifest[poseId];
      if (!info) throw new Error(`立ち絵がありません: ${poseId}`);
      const url = (f: string) => engine.assets.url(`cast/${poseId}/${f}`);
      const part = (k: keyof typeof info.parts) => (info.parts[k] ? { ...info.parts[k]!, url: url(info.parts[k]!.file) } : undefined);
      return {
        base: url('base.webp'),
        width: info.width,
        height: info.height,
        artFacing: facing(poseId),
        eyes: part('eye_open'),
        mouth: { open: part('mouth_open'), half: part('mouth_half'), closed: part('mouth_closed') },
      };
    },
  };
  const music = { ...film.music, url: engine.assets.url(`audio/${film.music.file}`) };
  await measure(film.voices(ctx));
  // 画像を先に読み込んでおく（出た瞬間に白く抜けないように）
  await Promise.all(
    [...film.images(ctx), ...Object.keys(manifest).map((p) => `cast/${p}/base.webp`)].map(
      (p) =>
        new Promise<void>((ok) => {
          const i = new Image();
          i.onload = i.onerror = () => ok();
          i.src = engine.assets.url(p);
        }),
    ),
  );

  const eng = engine as unknown as { frame(now: number): void; last: number };
  const state = { ready: true, done: false, error: '' };
  (window as unknown as { __pv: unknown }).__pv = {
    state,
    engine,
    game,
    duration: film.duration,
    out: film.out,
    get t() {
      return clock.t;
    },
    start() {
      eng.last = performance.now();
      film
        .run(ctx)
        .then(() => (state.done = true))
        .catch((e) => {
          console.error(e);
          state.error = String(e?.stack ?? e);
        });
    },
    /** 1コマ進める（時計はこの前に呼び出し側が進めておく） */
    step() {
      eng.frame(performance.now());
      syncAnimations();
      return clock.t;
    },
    mixdown: () => mixdown(film.duration, music, engine.assets.url('audio/se_paper_rise.mp3')),
  };
}
boot().catch((e) => {
  console.error(e);
  (window as unknown as { __pv: unknown }).__pv = { state: { ready: false, error: String(e?.stack ?? e) } };
});
