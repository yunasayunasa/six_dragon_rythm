import './engine/ui/ui.css';
import { Engine } from './engine';
import type { EpisodeCard, PanelAction } from './engine/ui/Panels';
import { InvestigationGame } from './genres/investigation/InvestigationGame';
import type { InvestigationSave } from './genres/investigation/types';
import { EPISODES, GAME_LOGO, GAME_SUBTITLE, GAME_TITLE, isReleased, releaseLabel, TITLE_BGM, TITLE_CALL } from './game/episodes';
import { TUTORIALS } from './game/tutorials';

/** 端末に残す記録の名前空間（設定・既読・セーブ・説明を見たか・解決した話） */
const NAMESPACE = 'six-dragon-gyakuten';
/** 「ロード」で読み込み直したあとに、どのセーブから始めるか */
const BOOT_KEY = `${NAMESPACE}:boot`;

const loading = document.getElementById('loading')!;
const bar = loading.querySelector('i')!;
let loadingToken = 0;
function showLoading(): void {
  loadingToken++;
  loading.style.display = '';
  loading.style.opacity = '1';
  bar.style.width = '30%';
}
function hideLoading(): void {
  const token = ++loadingToken;
  bar.style.width = '100%';
  loading.style.opacity = '0';
  setTimeout(() => token === loadingToken && (loading.style.display = 'none'), 600);
}

const debug = { engine: null as Engine | null, game: null as InvestigationGame | null };
// 自動テスト・実機確認用（本番の遊びには影響しない）
(window as unknown as { __paper: unknown }).__paper = debug;

const cleared = (engine: Engine, id: string) => engine.store.get(`clear:${id}`, false);
/** 作者の確認用：URL に ?preview があれば、公開日と解決の順番を無視して全話を遊べる */
const PREVIEW = new URLSearchParams(location.search).has('preview');

/** 話の一覧：公開日を過ぎていて、前の話を解決していれば遊べる */
function episodeCards(engine: Engine): EpisodeCard[] {
  return EPISODES.map((ep, i) => {
    const released = PREVIEW || isReleased(ep);
    const open = !!ep.load && released && (PREVIEW || i === 0 || cleared(engine, EPISODES[i - 1].id));
    return {
      id: ep.id,
      number: ep.number,
      title: ep.title,
      state: !open ? 'locked' : cleared(engine, ep.id) ? 'cleared' : 'open',
      note: released ? undefined : releaseLabel(ep),
      cover: ep.cover && engine.assets.url(ep.cover),
    };
  });
}

function settingsExtras(engine: Engine): PanelAction[] {
  return [{ label: '遊び方の説明をもう一度見る', run: () => (InvestigationGame.resetTutorials(engine.store, debug.game), '次の場面で説明を聞きます') }];
}

async function play(engine: Engine, episodeId: string, save?: InvestigationSave): Promise<void> {
  const ep = EPISODES.find((e) => e.id === episodeId);
  if (!ep?.load) throw new Error(`遊べない話です: ${episodeId}`);
  // 公開日前の話は、セーブから続けようとしても始めない（ホーム画面へ戻す）
  if (!PREVIEW && !isReleased(ep)) {
    alert(`${ep.number}は${releaseLabel(ep)}です。お楽しみに！`);
    return home(engine);
  }
  showLoading();
  const data = await ep.load();
  const game = new InvestigationGame(data, {
    tutorials: TUTORIALS,
    toTitle: () => location.reload(),
    load: (slot) => {
      sessionStorage.setItem(BOOT_KEY, JSON.stringify({ slot }));
      location.reload();
    },
    onSolved: () => engine.store.set(`clear:${data.id}`, true),
    settingsExtras: () => settingsExtras(engine),
  });
  debug.game = game;
  bar.style.width = '60%';
  await engine.setMode(game);
  // 結末の飛空艇などを読み込み中に準備しておく（出てきた瞬間に重くならないように）
  bar.style.width = '85%';
  await engine.warmUp();
  engine.hud.panels.closeHome();
  hideLoading();
  await game.start(save);
}

/** タイトルコールを1回だけ流す。音が出せるようになる前（スマホの最初のタップ前）なら、出せるようになった時に流す */
let titleCalled = false;
function titleCall(engine: Engine): void {
  const play = () => {
    if (titleCalled || !engine.sound.ready) return false;
    titleCalled = true;
    engine.sound.playVoice(engine.assets.url(TITLE_CALL));
    return true;
  };
  if (play()) return;
  const later = () => {
    // 音を有効にする処理（boot の unlock）のあとで鳴らす
    setTimeout(() => {
      if (!play()) return;
      removeEventListener('pointerdown', later);
      removeEventListener('keydown', later);
    }, 0);
  };
  addEventListener('pointerdown', later);
  addEventListener('keydown', later);
}

/** ホーム画面：つづきから・はじめから・話を選ぶ・設定 */
async function home(engine: Engine): Promise<void> {
  const panels = engine.hud.panels;
  // スマホでは最初のタップで音が出せるようになってから鳴る（Sound.unlock）
  engine.sound.defineBgm('タイトル', engine.assets.url(TITLE_BGM.url), TITLE_BGM.volume);
  engine.sound.setBgm('タイトル');
  titleCall(engine);
  for (;;) {
    const choice = await panels.home({
      title: GAME_TITLE,
      subtitle: GAME_SUBTITLE,
      logo: engine.assets.url(GAME_LOGO),
      background: engine.assets.url('ui/title_washi.png'),
      items: [
        { id: 'continue', label: 'つづきから', disabled: !engine.saves.any },
        { id: 'new', label: 'はじめから' },
        { id: 'episodes', label: '話を選ぶ' },
        { id: 'settings', label: '設定' },
      ],
      footer: `全${EPISODES.length}話`,
    });
    if (choice === 'continue') {
      const slot = await panels.slots('load', engine.saves.list());
      const entry = slot === null ? null : engine.saves.read<InvestigationSave>(slot);
      if (entry) return play(engine, entry.game, entry.data);
    } else if (choice === 'new') return play(engine, EPISODES[0].id);
    else if (choice === 'episodes') {
      const id = await panels.episodes(episodeCards(engine));
      if (id) return play(engine, id);
    } else if (choice === 'settings') await panels.settings(settingsExtras(engine));
  }
}

async function boot(): Promise<void> {
  bar.style.width = '15%';
  const engine = new Engine(document.getElementById('app')!, { namespace: NAMESPACE });
  debug.engine = engine;
  engine.start();
  await document.fonts?.ready;
  // 最初のタップで音を有効にする（スマホの制約）
  const unlock = () => {
    engine.sound.unlock();
    if (engine.sound.muted) {
      engine.sound.setMuted(false);
      engine.hud.syncSoundLabel();
    }
    removeEventListener('pointerdown', unlock);
    removeEventListener('keydown', unlock);
  };
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);
  // メニューの「ロード」から読み込み直したときは、ホーム画面を出さずにそのセーブから始める
  const request = sessionStorage.getItem(BOOT_KEY);
  sessionStorage.removeItem(BOOT_KEY);
  const slot = request ? (JSON.parse(request) as { slot: number }).slot : null;
  const entry = slot === null ? null : engine.saves.read<InvestigationSave>(slot);
  if (entry) return play(engine, entry.game, entry.data);
  hideLoading();
  await home(engine);
}

boot().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) {
    l.style.display = '';
    l.style.opacity = '1';
    l.innerHTML = `<div style="font-family:sans-serif;font-size:14px;padding:20px;max-width:90vw">読み込みに失敗しました<br><pre style="white-space:pre-wrap">${String(e?.stack ?? e)}</pre></div>`;
  }
});
