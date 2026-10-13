import './rhythm.css';
import { Conductor } from '../engine/audio/Conductor';
import { secToBeat } from '../engine/audio/beatMath';
import { Sound } from '../engine/audio/Sound';
import { PointerTrail } from '../engine/core/PointerTrail';
import { attachPointerTrail } from '../engine/core/attachPointerTrail';
import { preventZoom } from '../engine/core/screen';
import { BrushCanvas, type BrushPoint } from '../engine/render/BrushCanvas';
import type { Grade, Pt } from '../genres/rhythm/Judge';
import { accuracyOf, rankOf } from '../genres/rhythm/rank';
import { RhythmMode, type JudgeEvent, type RhythmPhase } from '../genres/rhythm/RhythmMode';
import { PenPlayer, planAutoplay, type PenEvent } from '../game/rhythm/autoplay';
import { RHYTHM_BEAT_CONFIG, barToSec, buildChart } from '../game/rhythm/chart';
import { ExampleWriter } from '../game/rhythm/ExampleWriter';
import { isRunning, nextScreen, type Screen, type ScreenEvent } from '../game/rhythm/screens';
import { getKanjiStrokes } from '../game/rhythm/strokes';
import { SumiStage } from '../game/rhythm/SumiStage';

/**
 * 漢字リズム。画面は タイトル → 遊び方 → プレイ（→ 大書きの終幕）→ リザルト。
 * 曲は ?song=URL か public/assets/audio/rhythm.mp3（Conductor が AudioBuffer を予約再生する）。
 * 曲が読めなかったときだけ、無音の時計＋拍のクリック音で動く（その場合は ?from=小節 から、既定は 16）。
 *   ?from=小節   途中から始める（曲があるときは曲のその位置から）
 *   ?autoplay=1  手本どおりの画を、本物の入力経路（canvas への PointerEvent）で自動で書く
 *   window.__rhythm = { screen, result }  自動テスト用に、いまの画面と結果を公開する
 */
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const INK = '#16120e';
const PAPER = '#f4ecd8';
const CUE_WINDOW_SEC = 1.2;
const WRITER_POSE = 'fediel_01_normal';
/** 終幕: 最後の画の判定から暗転まで / 暗転から落款まで / 落款から結果まで（ミリ秒） */
const END_DELAY_MS = 600;
const STAMP_AT_MS = 1000;
const RESULT_AT_MS = 3000;
const PHASE_LABEL: Record<RhythmPhase, string> = {
  intro: 'まもなく',
  example: 'お手本',
  write: 'あなたの番',
  finale: '大書き',
  done: '終了',
};
const GRADE_LABEL: Record<Grade, string> = { perfect: 'PERFECT', good: 'GOOD', miss: 'MISS' };

const params = new URLSearchParams(location.search);
const AUTOPLAY = params.get('autoplay') === '1';
const FROM_BAR = params.has('from') && Number(params.get('from')) >= 1 ? Number(params.get('from')) : null;

// ---- データ ----
const strokeCache = new Map<string, BrushPoint[][]>();
function strokePointsOf(char: string): BrushPoint[][] {
  let v = strokeCache.get(char);
  if (!v) {
    v = (getKanjiStrokes(char)?.strokes ?? []).map((s) => s.points.map(([x, y]) => ({ x, y })));
    strokeCache.set(char, v);
  }
  return v;
}
const chart = buildChart((c) => strokePointsOf(c).length);

// ---- 1回のプレイの状態 ----
interface Inked {
  index: number;
  pts: BrushPoint[];
  grade: Grade;
}
/** リザルトのサムネイル用に残す、書き返した字 */
interface WrittenChar {
  char: string;
  strokes: Inked[];
  /** 何も書かれずに Miss になった画 */
  missed: number[];
}
interface Run {
  mode: RhythmMode;
  inked: Inked[];
  written: Map<number, WrittenChar>;
  lastJudge: { grade: Grade; text: string; at: number } | null;
  ending: boolean;
  pen: PenPlayer | null;
  lastBeat: number;
}

function newRun(fromSec: number): Run {
  const run: Run = { mode: null as unknown as RhythmMode, inked: [], written: new Map(), lastJudge: null, ending: false, pen: null, lastBeat: -1 };
  // 途中から始めるときは、すでに終わっている区間を捨てる（Miss として数えない）
  const sections = fromSec > 0 ? chart.filter((s) => s.endSec > fromSec - 0.5) : chart;
  run.mode = new RhythmMode(sections, strokePointsOf, {
    on: {
      onSection: (i, s) => {
        run.inked = [];
        if (s.phase === 'write') run.written.set(i, { char: s.char, strokes: run.inked, missed: [] });
      },
      onJudge: (e) => onJudge(run, e),
      onPhase: (phase) => {
        go({ type: 'phase', phase });
        if (phase === 'done' && screen === 'finale') startEnding(run);
      },
    },
  });
  if (AUTOPLAY) run.pen = new PenPlayer(planAutoplay(sections, strokePointsOf));
  return run;
}

// ---- 全体の状態 ----
let screen: Screen = 'title';
let run: Run = newRun(0);
let clock: () => number = () => 0;
let silent = false;
let busy = false;
let conductor: Conductor | null = null;
let songGain: GainNode | null = null;
let songReady: Promise<boolean> | null = null;
let fromSec = 0;
let visibilityHooked = false;
let endTimers: number[] = [];

const sound = new Sound();
const trail = new PointerTrail();
const board = $<HTMLCanvasElement>('board');
const wrap = $('wrap');
const brush = new BrushCanvas(board);
const fx = new SumiStage($('stage3d'), $('ui'));
let writer: ExampleWriter | null = null;
void ExampleWriter.create($('writerHost'), `${import.meta.env.BASE_URL}assets/`, WRITER_POSE)
  .then((w) => (writer = w))
  .catch(() => undefined);
preventZoom();

const exposed = { screen: screen as string, result: null as null | { score: number; perfect: number; good: number; miss: number; maxCombo: number; rank: string } };
(window as unknown as { __rhythm: typeof exposed }).__rhythm = exposed;

// ---- 画面遷移 ----
function go(ev: ScreenEvent): void {
  const prev = screen;
  screen = nextScreen(prev, ev);
  if (screen === prev) return;
  exposed.screen = screen;
  document.body.dataset.screen = screen;
  onEnter(screen);
}

function onEnter(next: Screen): void {
  if (next === 'play') {
    clearEnding();
    fx.resetCamera();
    wrap.style.transform = '';
  } else if (next === 'result') {
    conductor?.stop();
    clearEnding();
    wrap.style.transform = '';
    fx.resetCamera();
    showResult();
  }
}

// ---- 入力 ----
attachPointerTrail(board, trail, {
  now: () => clock(),
  onStroke: (s) => {
    if (s && isRunning(screen)) run.mode.submitStroke(s);
    trail.clear();
  },
});

// ---- 曲 ----
async function loadSong(c: Conductor): Promise<boolean> {
  try {
    const url = params.get('song') ?? `${import.meta.env.BASE_URL}assets/audio/rhythm.mp3`;
    const res = await fetch(url);
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('audio')) return false;
    await c.load(await res.arrayBuffer());
    return true;
  } catch {
    return false;
  }
}

/** タイトルのタップの中で呼ぶ（スマホは最初のタップの中でしか音を出せるようにならない） */
function prepareAudio(): void {
  sound.unlock();
  const ctx = sound.context;
  if (!ctx) {
    songReady = Promise.resolve(false);
    return;
  }
  songGain = ctx.createGain();
  songGain.connect(ctx.destination);
  conductor = new Conductor(ctx, songGain, RHYTHM_BEAT_CONFIG);
  songReady = loadSong(conductor);
}

/** 曲（または無音の時計）を頭から動かし、新しいプレイを用意する */
async function beginRun(): Promise<void> {
  const ctx = sound.context;
  const hasSong = (await songReady) === true && conductor !== null;
  silent = !hasSong;
  fromSec = FROM_BAR !== null ? barToSec(FROM_BAR) : 0;
  if (hasSong && conductor && ctx) {
    songGain?.gain.cancelScheduledValues(0);
    songGain?.gain.setValueAtTime(1, ctx.currentTime);
    await conductor.start(0.3, fromSec);
    clock = () => conductor!.songTime;
  } else {
    // 曲が無いときは無音（拍のクリックだけ）。既定は 16 小節目から
    const from = barToSec(FROM_BAR ?? 16);
    fromSec = from;
    if (ctx) {
      const t0 = ctx.currentTime + 0.5;
      clock = () => ctx.currentTime - t0 + from;
      if (!visibilityHooked) {
        visibilityHooked = true;
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) void ctx.suspend();
          else void ctx.resume();
        });
      }
    } else {
      const t0 = performance.now() / 1000 + 0.5;
      clock = () => performance.now() / 1000 - t0 + from;
    }
  }
  trail.clear();
  run = newRun(fromSec);
}

function click(accent: boolean): void {
  const ctx = sound.context;
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = accent ? 1320 : 880;
  g.gain.setValueAtTime(0.12, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + 0.07);
}

// ---- 画面のボタン ----
async function tapAdvance(): Promise<void> {
  if (busy) return;
  if (screen === 'title') {
    // タイトルへ戻って再度タップしたときは、作った曲の準備を使い回す
    if (songReady) sound.unlock();
    else prepareAudio();
    go({ type: 'tap' });
  } else if (screen === 'howto') {
    busy = true;
    try {
      await beginRun();
      go({ type: 'tap' });
    } finally {
      busy = false;
    }
  }
}
$('title').addEventListener('click', () => void tapAdvance());
$('howto').addEventListener('click', () => void tapAdvance());
$('again').addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  try {
    await beginRun();
    go({ type: 'again' });
  } finally {
    busy = false;
  }
});
$('toTitle').addEventListener('click', () => go({ type: 'title' }));

// ---- 判定の見た目 ----
const el = {
  char: $('char'),
  phase: $('phase'),
  judge: $('judge'),
  combo: $('combo'),
  score: $('score'),
  fill: $('gaugeFill'),
};

function onJudge(r: Run, e: JudgeEvent): void {
  const res = e.result;
  let text = GRADE_LABEL[res.grade];
  if (res.grade !== 'perfect' && res.startDelta !== null && res.timingGrade !== 'perfect') text += res.startDelta < 0 ? '（早い）' : '（遅い）';
  r.lastJudge = { grade: res.grade, text, at: performance.now() };
  el.judge.classList.remove('pop');
  void el.judge.offsetWidth;
  el.judge.classList.add('pop');
  const wc = r.written.get(e.sectionIndex);
  if (e.drawn) {
    const pts = e.drawn.map((p) => ({ x: p.x, y: p.y }));
    r.inked.push({ index: res.index, pts, grade: res.grade });
    if (res.grade !== 'miss') {
      // 筆を離した所に墨しぶき（Perfect は大きく・画面も揺れる）
      const end = pts[pts.length - 1];
      const rect = board.getBoundingClientRect();
      fx.ink(rect.left + end.x * rect.width, rect.top + end.y * rect.height, res.grade);
    }
  } else {
    wc?.missed.push(res.index);
  }
  // 大書きの最後の画が判定されたら、少し置いて終幕へ
  if (e.section.finale && res.index === e.section.strokes.length - 1) endTimers.push(window.setTimeout(() => startEnding(r), END_DELAY_MS));
}

// ---- 終幕（暗転 → 落款 → 結果） ----
function startEnding(r: Run): void {
  if (r.ending || r !== run) return;
  r.ending = true;
  $('fade').classList.add('on');
  const ctx = sound.context;
  if (ctx && songGain) {
    songGain.gain.cancelScheduledValues(ctx.currentTime);
    songGain.gain.setValueAtTime(songGain.gain.value, ctx.currentTime);
    songGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.9);
  }
  endTimers.push(
    window.setTimeout(() => {
      $('seal').classList.add('on');
      sound.play('impact');
    }, STAMP_AT_MS),
    window.setTimeout(() => go({ type: 'sealDone' }), RESULT_AT_MS),
  );
}

function clearEnding(): void {
  endTimers.forEach((t) => clearTimeout(t));
  endTimers = [];
  $('fade').classList.remove('on');
  $('seal').classList.remove('on');
}

// ---- 描画 ----
const toPt = (p: Pt): BrushPoint => ({ x: p.x, y: p.y });

function draw(t: number): void {
  brush.clear(PAPER);
  brush.drawGrid(INK);
  const mode = run.mode;
  const sec = mode.section;
  if (!sec) return;
  const pts = strokePointsOf(sec.char);

  if (sec.phase === 'example') {
    const ex = mode.exampleStatus();
    if (ex) {
      for (let i = 0; i < ex.completed; i++) brush.drawStroke(pts[i]);
      if (ex.active !== null) brush.drawAnimated(pts[ex.active], ex.progress);
    }
  } else {
    // 手本の薄い下書き（これから書く画だけ少し濃く）と、書いた画
    const next = mode.nextStroke;
    pts.forEach((p, i) => brush.drawStroke(p, { color: INK, alpha: i === next ? 0.28 : 0.09, size: 0.035 }));
    const written = new Set(run.inked.map((k) => k.index));
    for (const k of run.inked) {
      if (k.grade === 'miss') brush.drawStroke(k.pts, { alpha: 0.3, size: 0.03 });
      else brush.drawStroke(k.pts, { alpha: k.grade === 'good' ? 0.85 : 1 });
    }
    // 書かれずに Miss になった画は、かすれた跡だけ残す
    sec.strokes.forEach((_st, i) => {
      if (!written.has(i) && i < (next < 0 ? sec.strokes.length : next)) brush.drawStroke(pts[i] ?? [], { color: '#a33a2a', alpha: 0.22, size: 0.025 });
    });
    // 次の画の始まりの合図（輪が縮んで、書き出す瞬間に小さくなる）
    if (next >= 0 && pts[next]) {
      const dt = sec.strokes[next].sec - t;
      if (dt < CUE_WINDOW_SEC && dt > -0.2) {
        const k = Math.max(0, Math.min(1, dt / CUE_WINDOW_SEC));
        const s = pts[next][0];
        brush.drawRing(s.x, s.y, 0.035 + 0.1 * k, '#c4452f', 0.008, 1 - 0.6 * k);
      }
    }
  }
  if (trail.active) brush.drawStroke(trail.points.map(toPt), { size: 0.04 }, false);
}

function updateHud(t: number): void {
  const mode = run.mode;
  const sec = mode.section;
  const nextSec = mode.sections.find((s) => s.startSec > t);
  el.char.textContent = (sec ?? nextSec)?.char ?? '　';
  el.phase.textContent = PHASE_LABEL[mode.phase] + (sec?.phase === 'example' ? '（見ててね）' : '');
  const s = mode.score;
  el.combo.textContent = `COMBO ${s.combo}`;
  el.score.textContent = String(s.score);
  el.fill.style.width = `${s.gauge}%`;
  const j = run.lastJudge;
  if (j) {
    const age = performance.now() - j.at;
    el.judge.textContent = j.text;
    el.judge.classList.remove('perfect', 'good', 'miss');
    el.judge.classList.add(j.grade);
    el.judge.style.opacity = String(age < 700 ? 1 : Math.max(0, 1 - (age - 700) / 400));
  } else {
    el.judge.textContent = '';
  }
}

/** 手本役: お手本の間は筆を運び、書き返しの間は暗く沈み、大書きでは消える */
function updateWriter(nowSec: number): void {
  if (!writer) return;
  const mode = run.mode;
  const sec = mode.section;
  let mood: 'watch' | 'dim' | 'hidden' = 'watch';
  let brushState: { points: readonly BrushPoint[]; progress: number } | null = null;
  if (isRunning(screen)) {
    if (sec?.finale) mood = 'hidden';
    else if (sec?.phase === 'write') mood = 'dim';
    const ex = mode.exampleStatus();
    if (ex && ex.active !== null && sec) brushState = { points: strokePointsOf(sec.char)[ex.active] ?? [], progress: ex.progress };
  }
  writer.update(nowSec, { mood, brush: brushState });
}

// ---- 自動プレイ: 本物の入力経路（canvas への PointerEvent）に流す ----
function dispatchPen(ev: PenEvent): void {
  const r = board.getBoundingClientRect();
  const type = ev.kind === 'down' ? 'pointerdown' : ev.kind === 'move' ? 'pointermove' : 'pointerup';
  board.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: ev.kind === 'up' ? 0 : 1,
      clientX: r.left + ev.x * r.width,
      clientY: r.top + ev.y * r.height,
    }),
  );
}

// ---- リザルト ----
const THUMB_PX = 120;

function showResult(): void {
  const s = run.mode.score;
  const rank = rankOf(s);
  const acc = accuracyOf(s);
  $('rank').textContent = rank;
  $('rank').dataset.rank = rank;
  $('resScore').textContent = String(s.score);
  $('resAcc').textContent = `精度 ${Math.round(acc * 100)}%`;
  $('resPerfect').textContent = String(s.perfect);
  $('resGood').textContent = String(s.good);
  $('resMiss').textContent = String(s.miss);
  $('resCombo').textContent = String(s.maxCombo);
  exposed.result = { score: s.score, perfect: s.perfect, good: s.good, miss: s.miss, maxCombo: s.maxCombo, rank };

  const box = $('thumbs');
  box.replaceChildren();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const wc of [...run.written.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v)) {
    const c = document.createElement('canvas');
    c.title = wc.char;
    const b = new BrushCanvas(c);
    b.resize(THUMB_PX, dpr);
    b.clear(PAPER);
    b.drawGrid(INK, 0.12);
    const ref = strokePointsOf(wc.char);
    // 書かれなかった画は、お手本の位置にかすれた朱で示す
    for (const i of wc.missed) b.drawStroke(ref[i] ?? [], { color: '#a33a2a', alpha: 0.25, size: 0.05 });
    for (const k of wc.strokes) b.drawStroke(k.pts, { size: 0.06, alpha: k.grade === 'miss' ? 0.3 : k.grade === 'good' ? 0.85 : 1 });
    box.appendChild(c);
  }
}

// ---- 毎フレーム ----
let lastFrame = performance.now();

function frame(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (isRunning(screen)) {
    const t = clock();
    const mode = run.mode;
    mode.setPen(trail.active ? trail.points[0].t : null);
    mode.update(t);
    if (run.pen) for (const ev of run.pen.due(t)) dispatchPen(ev);
    if (silent && t >= 0) {
      const beat = Math.floor(secToBeat(t, RHYTHM_BEAT_CONFIG));
      if (beat > run.lastBeat) {
        if (run.lastBeat >= 0 || beat === 0) click(beat % RHYTHM_BEAT_CONFIG.beatsPerBar === 0);
        run.lastBeat = beat;
      }
    }
    if (screen === 'finale') {
      // 大書きの間、ゆっくり寄っていく（背景のカメラと盤面）
      const f = mode.sections.find((s) => s.finale);
      const k = f ? Math.max(0, Math.min(1, (t - f.startSec) / (f.endSec - f.startSec))) : 1;
      fx.zoom(k);
      wrap.style.transform = `scale(${(1 + 0.04 * k).toFixed(4)})`;
    }
    draw(t);
    updateHud(t);
  } else if (screen !== 'result') {
    brush.clear(PAPER);
    brush.drawGrid(INK);
  }
  updateWriter(now / 1000);
  fx.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
