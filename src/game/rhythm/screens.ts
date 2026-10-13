import type { RhythmPhase } from '../../genres/rhythm/RhythmMode';

/**
 * 画面の遷移（純粋ロジック）。DOM も音も持たず、「いまの画面 + 出来事 → 次の画面」だけを決める。
 *   title → (tap) → howto → (tap) → play → (phase: finale) → finale → (sealDone) → result
 *   result → (again) → play / (title) → title
 *   title / result → (settings) → settings → (back) → 開いた元の画面（title か result）
 * 大書きを通らずに曲が終わった（途中から始めた）ときは play → result へ直接進む。
 */
export type Screen = 'title' | 'howto' | 'play' | 'finale' | 'result' | 'settings';

export type ScreenEvent =
  | { type: 'tap' }
  /** RhythmMode の段階が変わった */
  | { type: 'phase'; phase: RhythmPhase }
  /** 終幕（暗転・落款）が終わった */
  | { type: 'sealDone' }
  | { type: 'again' }
  | { type: 'title' }
  /** 設定を開く（title / result から） */
  | { type: 'settings' }
  /** 設定を閉じて、開いた元の画面へ戻る */
  | { type: 'back'; to: 'title' | 'result' };

export function nextScreen(screen: Screen, ev: ScreenEvent): Screen {
  switch (screen) {
    case 'title':
      if (ev.type === 'settings') return 'settings';
      return ev.type === 'tap' ? 'howto' : screen;
    case 'howto':
      return ev.type === 'tap' ? 'play' : screen;
    case 'play':
      if (ev.type === 'phase' && ev.phase === 'finale') return 'finale';
      // 大書きを経ずに終わった
      if (ev.type === 'phase' && ev.phase === 'done') return 'result';
      return screen;
    case 'finale':
      // 段階が done になっても、落款が押されるまでは終幕のまま
      return ev.type === 'sealDone' ? 'result' : screen;
    case 'result':
      if (ev.type === 'again') return 'play';
      if (ev.type === 'title') return 'title';
      if (ev.type === 'settings') return 'settings';
      return screen;
    case 'settings':
      return ev.type === 'back' ? ev.to : screen;
  }
}

/** 曲（時計）が動いている画面か */
export function isRunning(screen: Screen): boolean {
  return screen === 'play' || screen === 'finale';
}
