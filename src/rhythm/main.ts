import { Conductor } from '../engine/audio/Conductor';
import { secToBeat } from '../engine/audio/beatMath';
import { Sound } from '../engine/audio/Sound';
import { PointerTrail } from '../engine/core/PointerTrail';
import { attachPointerTrail } from '../engine/core/attachPointerTrail';
import { BrushCanvas, type BrushPoint } from '../engine/render/BrushCanvas';
import type { Grade, Pt } from '../genres/rhythm/Judge';
import { RhythmMode, type JudgeEvent, type RhythmPhase } from '../genres/rhythm/RhythmMode';
import { RHYTHM_BEAT_CONFIG, barToSec, buildChart } from '../game/rhythm/chart';
import { getKanjiStrokes } from '../game/rhythm/strokes';

/**
 * M3 の最小プレイページ。曲ファイルがあれば Conductor（AudioBuffer を予約再生）の時計で、
 * 無ければ AudioContext の時間だけで進む無音の時計＋拍のクリック音で動かす。
 * 曲は ?song=URL か、開始画面のファイル選択、public/assets/audio/rhythm.mp3 の順に探す。
 * 無音のときは ?from=小節番号 から始められる（既定は 16。曲があるときは 1 小節目から）。
 */
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const INK = '#16120e';
const PAPER = '#f4ecd8';
const CUE_WINDOW_SEC = 1.2;
const PHASE_LABEL: Record<RhythmPhase, string> = {
  intro: 'まもなく',
  example: 'お手本',
  write: 'あなたの番',
  finale: '大書き',
  done: '終了',
};
const GRADE_LABEL: Record<Grade, string> = { perfect: 'PERFECT', good: 'GOOD', miss: 'MISS' };

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

// ---- 状態 ----
interface Inked {
  index: number;
  pts: BrushPoint[];
  grade: Grade;
}
let inked: Inked[] = [];
let inkedChar = '';
let lastJudge: { grade: Grade; text: string; at: number } | null = null;
let clock: () => number = () => 0;
let started = false;
let finished = false;
let silent = false;
let lastBeat = -1;

const sound = new Sound();
const trail = new PointerTrail();
const brush = new BrushCanvas($<HTMLCanvasElement>('board'));
const mode = new RhythmMode(chart, strokePointsOf, {
  on: {
    onSection: (_i, s) => {
      if (s.phase === 'example' || s.char !== inkedChar) {
        inked = [];
        inkedChar = s.char;
      }
    },
    onJudge: (e: JudgeEvent) => {
      const r = e.result;
      let text = GRADE_LABEL[r.grade];
      if (r.grade !== 'perfect' && r.startDelta !== null && r.timingGrade !== 'perfect') text += r.startDelta < 0 ? '（早い）' : '（遅い）';
      lastJudge = { grade: r.grade, text, at: performance.now() };
      if (e.drawn) inked.push({ index: r.index, pts: e.drawn.map((p) => ({ x: p.x, y: p.y })), grade: r.grade });
    },
  },
});

// ---- 画面サイズ ----
const wrap = $('wrap');
function resize(): void {
  brush.resize(wrap.clientWidth, Math.min(window.devicePixelRatio || 1, 2));
}
new ResizeObserver(resize).observe(wrap);
resize();

// ---- 入力 ----
attachPointerTrail($('board'), trail, {
  now: () => clock(),
  onStroke: (s) => {
    if (s && started) mode.submitStroke(s);
    trail.clear();
  },
});

// ---- 開始 ----
async function loadSong(conductor: Conductor): Promise<boolean> {
  const file = $<HTMLInputElement>('song').files?.[0];
  try {
    if (file) {
      await conductor.load(await file.arrayBuffer());
      return true;
    }
    const url = new URLSearchParams(location.search).get('song') ?? `${import.meta.env.BASE_URL}assets/audio/rhythm.mp3`;
    const res = await fetch(url);
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('audio')) return false;
    await conductor.load(await res.arrayBuffer());
    return true;
  } catch {
    return false;
  }
}

async function start(): Promise<void> {
  if (started) return;
  $<HTMLButtonElement>('start').disabled = true;
  sound.unlock();
  const ctx = sound.context;
  const fromBar = Number(new URLSearchParams(location.search).get('from'));
  if (ctx) {
    const conductor = new Conductor(ctx, ctx.destination, RHYTHM_BEAT_CONFIG);
    if (await loadSong(conductor)) {
      await conductor.start(0.3);
      clock = () => conductor.songTime;
    } else {
      silent = true;
      conductor.dispose();
    }
  } else {
    silent = true;
  }
  if (silent) {
    const from = barToSec(Number.isFinite(fromBar) && fromBar >= 1 ? fromBar : 16);
    if (ctx) {
      const t0 = ctx.currentTime + 0.5;
      clock = () => ctx.currentTime - t0 + from;
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) void ctx.suspend();
        else void ctx.resume();
      });
    } else {
      const t0 = performance.now() / 1000 + 0.5;
      clock = () => performance.now() / 1000 - t0 + from;
    }
  }
  started = true;
  $('overlay').hidden = true;
}
$('start').addEventListener('click', () => void start());

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

// ---- 描画 ----
const toPt = (p: Pt): BrushPoint => ({ x: p.x, y: p.y });

function draw(t: number): void {
  brush.clear(PAPER);
  brush.drawGrid(INK);
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
    const written = new Set(inked.map((k) => k.index));
    for (const k of inked) {
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

// ---- HUD ----
const el = {
  char: $('char'),
  phase: $('phase'),
  judge: $('judge'),
  combo: $('combo'),
  score: $('score'),
  fill: $('gaugeFill'),
};

function updateHud(t: number): void {
  const sec = mode.section;
  const nextSec = mode.sections.find((s) => s.startSec > t);
  el.char.textContent = (sec ?? nextSec)?.char ?? '　';
  el.phase.textContent = PHASE_LABEL[mode.phase] + (sec?.phase === 'example' ? '（見ててね）' : '');
  const s = mode.score;
  el.combo.textContent = `COMBO ${s.combo}（最大 ${s.maxCombo}）`;
  el.score.textContent = String(s.score);
  el.fill.style.width = `${s.gauge}%`;
  if (lastJudge) {
    const age = performance.now() - lastJudge.at;
    el.judge.textContent = lastJudge.text;
    el.judge.className = lastJudge.grade;
    el.judge.style.opacity = String(age < 700 ? 1 : Math.max(0, 1 - (age - 700) / 400));
  }
}

function showResult(): void {
  const s = mode.score;
  const overlay = $('overlay');
  overlay.hidden = false;
  overlay.innerHTML = '';
  const h = document.createElement('h1');
  h.textContent = '終了';
  const p = document.createElement('p');
  p.textContent = `スコア ${s.score} / PERFECT ${s.perfect}・GOOD ${s.good}・MISS ${s.miss} / 最大コンボ ${s.maxCombo}`;
  const b = document.createElement('button');
  b.textContent = 'もう一度';
  b.addEventListener('click', () => location.reload());
  overlay.append(h, p, b);
}

function frame(): void {
  if (started) {
    const t = clock();
    mode.setPen(trail.active ? trail.points[0].t : null);
    mode.update(t);
    if (silent && t >= 0) {
      const beat = Math.floor(secToBeat(t, RHYTHM_BEAT_CONFIG));
      if (beat > lastBeat) {
        if (lastBeat >= 0 || beat === 0) click(beat % RHYTHM_BEAT_CONFIG.beatsPerBar === 0);
        lastBeat = beat;
      }
    }
    draw(t);
    updateHud(t);
    if (mode.phase === 'done' && !finished) {
      finished = true;
      showResult();
    }
  } else {
    brush.clear(PAPER);
    brush.drawGrid(INK);
  }
  requestAnimationFrame(frame);
}
$('status').textContent = '曲ファイルが無いときは、無音＋クリック音で進みます（16 小節目から）。';
frame();
