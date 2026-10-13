import { Sound } from './engine/audio/Sound';
import { Conductor } from './engine/audio/Conductor';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const sound = new Sound();
let conductor: Conductor | null = null;
let lastBeat = -Infinity;
let flashLevel = 0;

function readConfig() {
  const n = (id: string, d: number): number => {
    const v = Number($<HTMLInputElement>(id).value);
    return Number.isFinite(v) ? v : d;
  };
  return {
    bpm: Math.max(1, n('bpm', 98)),
    offset: n('offset', 0.2),
    calibrationMs: n('calib', 0),
    barShift: Math.trunc(n('shift', 0)),
    beatsPerBar: Math.max(1, Math.trunc(n('bpb', 4))),
  };
}

$<HTMLInputElement>('file').addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  sound.unlock();
  const ctx = sound.context;
  if (!ctx) {
    $('info').textContent = 'AudioContext を作れません';
    return;
  }
  conductor?.dispose();
  conductor = new Conductor(ctx);
  $('info').textContent = '読み込み中…';
  try {
    await conductor.load(await f.arrayBuffer());
  } catch {
    conductor = null;
    $('info').textContent = '読み込めませんでした';
    return;
  }
  $('info').textContent = `読み込み完了 ${conductor.duration.toFixed(1)}秒`;
  $<HTMLButtonElement>('play').disabled = false;
  $<HTMLButtonElement>('stop').disabled = false;
});

$('play').addEventListener('click', () => {
  sound.unlock();
  lastBeat = -Infinity;
  void conductor?.start();
});
$('stop').addEventListener('click', () => conductor?.stop());

const flash = $('flash');
function frame(): void {
  if (conductor) {
    conductor.config = readConfig();
    if (conductor.isPlaying) {
      const s = conductor.state;
      const whole = Math.floor(s.beat);
      if (s.beat >= 0 && whole !== lastBeat) {
        lastBeat = whole;
        flashLevel = s.beatInBar === 0 ? 0.9 : 0.45;
      }
      $('info').textContent = `小節 ${s.bar + 1}  拍 ${s.beatInBar + 1}  (beat ${s.beat.toFixed(2)}, ${s.songTime.toFixed(2)}秒)`;
    }
  }
  flashLevel = Math.max(0, flashLevel - 0.04);
  flash.style.opacity = String(flashLevel);
  requestAnimationFrame(frame);
}
frame();
