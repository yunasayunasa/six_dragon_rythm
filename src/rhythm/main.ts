import './rhythm.css';
import { Conductor } from '../engine/audio/Conductor';
import { secToBeat } from '../engine/audio/beatMath';
import { Sound } from '../engine/audio/Sound';
import { PointerTrail } from '../engine/core/PointerTrail';
import { Store } from '../engine/core/Store';
import { attachPointerTrail } from '../engine/core/attachPointerTrail';
import { preventZoom } from '../engine/core/screen';
import { BrushCanvas, type BrushPoint } from '../engine/render/BrushCanvas';
import type { Grade, Pt } from '../genres/rhythm/Judge';
import { accuracyOf, rankOf } from '../genres/rhythm/rank';
import { RhythmMode, type JudgeEvent, type RhythmPhase } from '../genres/rhythm/RhythmMode';
import { PenPlayer, planAutoplay, type PenEvent } from '../game/rhythm/autoplay';
import { RHYTHM_BEAT_CONFIG, barToSec, buildChart, shiftChart, shiftedBeatConfig } from '../game/rhythm/chart';
import { ExampleWriter } from '../game/rhythm/ExampleWriter';
import { InkSplash } from '../game/rhythm/InkSplash';
import {
  DEFAULT_RHYTHM_SETTINGS,
  RHYTHM_SETTINGS_KEY,
  applyLatency,
  beatShiftOf,
  clampSettings,
  judgeConfigOf,
  mergeSettings,
  resolveLatencyMs,
  tapOffsetMs,
  type RhythmSettings,
} from '../game/rhythm/rhythmSettings';
import { isRunning, nextScreen, type Screen, type ScreenEvent } from '../game/rhythm/screens';
import { getKanjiStrokes } from '../game/rhythm/strokes';
import { SumiStage } from '../game/rhythm/SumiStage';

/**
 * 漢字リズム。画面は タイトル → 遊び方 → プレイ（→ 大書きの終幕）→ リザルト。
 * 曲は ?song=URL か public/assets/audio/rhythm.mp3（Conductor が AudioBuffer を予約再生する）。
 * 曲が読めなかったときだけ、無音の時計＋拍のクリック音で動く（その場合は ?from=小節 から、既定は 16）。
 *   ?from=小節   途中から始める（曲があるときは曲のその位置から）
 *   ?autoplay=1  手本どおりの画を、本物の入力経路（canvas への PointerEvent）で自動で書く
 *   window.__rhythm = { screen, result }  自動テスト用に、いまの画面（title / howto / play / finale / result / settings）と結果を公開する
 * 設定（音ズレ補正・1拍ずらし・音量・形の許容）は Store の 'rhythmSettings' に残し、プレイを始めるたびに反映する。
 * ?autoplay=1 のときは保存された設定を読まず（音ズレ 0・ずらしなし・既定の許容）、タップテストも勝手には出さない。
 */
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const INK = '#16120e';
const PAPER = '#f4ecd8';
const CUE_WINDOW_SEC = 1.2;
/** 書いた画の太さ（盤面の一辺に対する割合）。手本の下書き（0.035）より太く濃くする */
const INKED_SIZE = 0.052;
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
const baseChart = buildChart((c) => strokePointsOf(c).length);

// ---- 設定 ----
const store = new Store('kanji-rhythm');
let settings: RhythmSettings = AUTOPLAY ? { ...DEFAULT_RHYTHM_SETTINGS, latencyMs: 0 } : mergeSettings(store.get<unknown>(RHYTHM_SETTINGS_KEY, {}));
/** プレイを始めるときに確定する値（プレイ中は変わらない） */
let chart = baseChart;
let beatCfg: Pick<typeof RHYTHM_BEAT_CONFIG, 'bpm' | 'offset' | 'beatsPerBar'> = RHYTHM_BEAT_CONFIG;
let playSettings: RhythmSettings = settings;
let latencyMs = 0;

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
    judge: judgeConfigOf(playSettings),
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
const splash = new InkSplash($<HTMLCanvasElement>('splash'));
let writer: ExampleWriter | null = null;
void ExampleWriter.create($('writerHost'), `${import.meta.env.BASE_URL}assets/`, WRITER_POSE)
  .then((w) => (writer = w))
  .catch(() => undefined);
preventZoom();

/** 盤面の解像度を表示の大きさに合わせる（scale で拡大中でも clientWidth は変わらない） */
function resizeBoard(): void {
  brush.resize(wrap.clientWidth, Math.min(window.devicePixelRatio || 1, 2));
}
new ResizeObserver(resizeBoard).observe(wrap);
resizeBoard();

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
  } else if (next === 'settings') {
    refreshSettingsUi();
  }
  if (next !== 'settings') cancelTapTest();
  if (next !== 'play' && next !== 'finale') $('waiting').hidden = true;
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

/** ユーザーのタップの中で呼ぶ。最初の1回だけ曲の準備をし、2回目以降は音の解除だけする */
function ensureAudio(): void {
  if (songReady) sound.unlock();
  else prepareAudio();
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
  // この回に使う設定を確定する（音ズレ補正・1拍ずらし・形の許容・音量）
  playSettings = settings;
  latencyMs = resolveLatencyMs(playSettings, ctx);
  const shift = beatShiftOf(playSettings);
  chart = shift ? shiftChart(baseChart, shift) : baseChart;
  beatCfg = shiftedBeatConfig(shift);
  const shiftSec = (shift * 60) / RHYTHM_BEAT_CONFIG.bpm;
  fromSec = FROM_BAR !== null ? barToSec(FROM_BAR) + shiftSec : 0;
  if (hasSong && conductor && ctx) {
    // 聞こえるのは出力遅延ぶん遅れる。曲の時刻から引いて、聞こえた拍に合わせて判定する
    conductor.config.calibrationMs = latencyMs;
    songGain?.gain.cancelScheduledValues(0);
    songGain?.gain.setValueAtTime(playSettings.volume, ctx.currentTime);
    await conductor.start(0.3, fromSec);
    clock = () => conductor!.songTime;
  } else {
    // 曲が無いときは無音（拍のクリックだけ）。既定は 16 小節目から
    const from = barToSec(FROM_BAR ?? 16) + shiftSec;
    fromSec = from;
    if (ctx) {
      const t0 = ctx.currentTime + 0.5;
      clock = () => applyLatency(ctx.currentTime - t0 + from, latencyMs);
      if (!visibilityHooked) {
        visibilityHooked = true;
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) void ctx.suspend();
          else void ctx.resume();
        });
      }
    } else {
      const t0 = performance.now() / 1000 + 0.5;
      clock = () => applyLatency(performance.now() / 1000 - t0 + from, latencyMs);
    }
  }
  trail.clear();
  run = newRun(fromSec);
}

/** クリック音。at は ctx.currentTime 基準の鳴らす時刻（省略で今）。鳴らした発振器を返す */
function click(accent: boolean, at?: number, level = 0.12): OscillatorNode | null {
  const ctx = sound.context;
  if (!ctx) return null;
  const t = at ?? ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = accent ? 1320 : 880;
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + 0.07);
  return o;
}

// ---- 画面のボタン ----
async function tapAdvance(): Promise<void> {
  if (busy) return;
  if (screen === 'title') {
    // タイトルへ戻って再度タップしたときは、作った曲の準備を使い回す
    ensureAudio();
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
// タイトルの設定ボタンやリンクのタップでは、始めない
$('title').addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('a, button')) return;
  void tapAdvance();
});
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

// ---- 設定 ----
let settingsReturn: 'title' | 'result' = 'title';
function openSettings(from: 'title' | 'result'): void {
  // 音ズレの初期値（outputLatency）を読むために、タップの中で AudioContext を用意する
  ensureAudio();
  settingsReturn = from;
  go({ type: 'settings' });
}
$('openSettings').addEventListener('click', () => openSettings('title'));
$('resultSettings').addEventListener('click', () => openSettings('result'));
$('closeSettings').addEventListener('click', () => go({ type: 'back', to: settingsReturn }));

function updateSettings(patch: Partial<RhythmSettings>): void {
  settings = clampSettings({ ...settings, ...patch });
  if (!AUTOPLAY) store.set(RHYTHM_SETTINGS_KEY, settings);
  refreshSettingsUi();
}

const ui = {
  lat: $('latVal'),
  shift: $<HTMLInputElement>('shiftBeat'),
  vol: $<HTMLInputElement>('volume'),
  volVal: $('volVal'),
  tol: $<HTMLInputElement>('endpointTol'),
  tolVal: $('tolVal'),
  ang: $<HTMLInputElement>('angleTol'),
  angVal: $('angVal'),
};

function refreshSettingsUi(): void {
  const lat = resolveLatencyMs(settings, sound.context);
  ui.lat.textContent = `${lat} ms${settings.latencyMs === null ? '（自動）' : ''}`;
  ui.shift.checked = settings.shiftBeat;
  ui.vol.value = String(Math.round(settings.volume * 100));
  ui.volVal.textContent = ui.vol.value;
  ui.tol.value = String(Math.round(settings.endpointTol * 100));
  ui.tolVal.textContent = settings.endpointTol.toFixed(2);
  ui.ang.value = String(settings.angleTolDeg);
  ui.angVal.textContent = `${settings.angleTolDeg}°`;
}

document.querySelectorAll<HTMLButtonElement>('#settings [data-lat]').forEach((b) =>
  b.addEventListener('click', () => updateSettings({ latencyMs: resolveLatencyMs(settings, sound.context) + Number(b.dataset.lat) })),
);
ui.shift.addEventListener('change', () => updateSettings({ shiftBeat: ui.shift.checked }));
ui.vol.addEventListener('input', () => updateSettings({ volume: Number(ui.vol.value) / 100 }));
ui.tol.addEventListener('input', () => updateSettings({ endpointTol: Number(ui.tol.value) / 100 }));
ui.ang.addEventListener('input', () => updateSettings({ angleTolDeg: Number(ui.ang.value) }));
$('resetSettings').addEventListener('click', () => updateSettings({ ...DEFAULT_RHYTHM_SETTINGS }));

// ---- タップテスト: クリック音に合わせて8回叩き、平均のずれを音ズレ補正にする ----
const TAP_LEAD_IN = 4;
const TAP_COUNT = 8;
const TAP_INTERVAL = 0.6;
const tapTest: { clicks: number[]; taps: number[]; osc: OscillatorNode[]; timer: number } = { clicks: [], taps: [], osc: [], timer: 0 };
let tapRunning = false;

function cancelTapTest(): void {
  tapRunning = false;
  clearTimeout(tapTest.timer);
  for (const o of tapTest.osc) {
    try {
      o.stop();
    } catch {
      /* 鳴り終わっている */
    }
  }
  tapTest.osc = [];
  $('tapBox').hidden = true;
  $('tapTest').hidden = false;
}

$('tapTest').addEventListener('click', () => {
  ensureAudio();
  const ctx = sound.context;
  if (!ctx) {
    $('tapStatus').textContent = '音が使えないため測れません。';
    $('tapBox').hidden = false;
    return;
  }
  cancelTapTest();
  tapRunning = true;
  $('tapTest').hidden = true;
  $('tapBox').hidden = false;
  $('tapStatus').textContent = `準備… クリック音に合わせて、あとの ${TAP_COUNT} 回をタップ`;
  const first = ctx.currentTime + 0.8;
  tapTest.clicks = [];
  tapTest.taps = [];
  for (let i = 0; i < TAP_LEAD_IN + TAP_COUNT; i++) {
    const at = first + i * TAP_INTERVAL;
    tapTest.clicks.push(at);
    const o = click(i % 4 === 0, at, 0.25);
    if (o) tapTest.osc.push(o);
  }
  const endAt = tapTest.clicks[tapTest.clicks.length - 1] + 0.6;
  tapTest.timer = window.setTimeout(() => finishTapTest(), (endAt - ctx.currentTime) * 1000);
});

$('tapPad').addEventListener('pointerdown', (e) => {
  const ctx = sound.context;
  if (!tapRunning || !ctx) return;
  e.preventDefault();
  const at = ctx.currentTime;
  tapTest.taps.push(at);
  $('tapStatus').textContent = `タップ ${tapTest.taps.length} 回（助走の ${TAP_LEAD_IN} 回のあと、${TAP_COUNT} 回ぶんを測ります）`;
});

function finishTapTest(): void {
  const ms = tapOffsetMs(tapTest.clicks, tapTest.taps, { countFrom: TAP_LEAD_IN });
  cancelTapTest();
  if (ms === null) {
    $('tapBox').hidden = false;
    $('tapStatus').textContent = 'うまく測れませんでした。もう一度「タップで測る」を押してください。';
    return;
  }
  updateSettings({ latencyMs: ms });
  $('tapBox').hidden = false;
  $('tapStatus').textContent = `測定結果: ${ms} ms を設定しました。`;
}

// ---- 判定の見た目 ----
const el = {
  char: $('char'),
  phase: $('phase'),
  judge: $('judge'),
  combo: $('combo'),
  score: $('score'),
  fill: $('gaugeFill'),
  waitSec: $('waitSec'),
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
      const cx = rect.left + end.x * rect.width;
      const cy = rect.top + end.y * rect.height;
      fx.ink(cx, cy, res.grade);
      // 盤面は不透明なので、手応えのしぶきは盤面より手前の 2D で出す
      splash.burst(cx, cy, res.grade);
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
    // 書いた画は区間の間ずっと残す。太く濃い墨（Miss だけ薄く細く）
    for (const k of run.inked) {
      if (k.grade === 'miss') brush.drawStroke(k.pts, { alpha: 0.35, size: 0.034 });
      else brush.drawStroke(k.pts, { color: INK, alpha: 1, size: INKED_SIZE });
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
  if (trail.active) brush.drawStroke(trail.points.map(toPt), { color: INK, size: INKED_SIZE }, false);
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
  // 最初の小節に入るまでの待ち（曲の頭のイントロ）。残りを秒で数える
  const first = mode.sections[0];
  const waiting = !!first && mode.sectionIndex < 0 && t < first.startSec;
  const waitBox = $('waiting');
  if (waitBox.hidden === waiting) waitBox.hidden = !waiting;
  if (waiting) {
    const secs = String(Math.max(1, Math.ceil(first.startSec - t)));
    if (el.waitSec.textContent !== secs) el.waitSec.textContent = secs;
  }
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
      // クリックは実際に鳴らす時刻（補正前）で数える。補正ぶん遅れて聞こえて、判定の時刻とそろう
      const beat = Math.floor(secToBeat(t + latencyMs / 1000, beatCfg));
      if (beat > run.lastBeat) {
        if (run.lastBeat >= 0 || beat === 0) click(beat % beatCfg.beatsPerBar === 0, undefined, 0.12 * playSettings.volume);
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
  splash.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
