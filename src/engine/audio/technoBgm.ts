import type { BgmTrack } from './Sound';
import { TechnoTrack } from './techno-track.js';

/**
 * techno-track.js（コードだけで鳴らすテクノ）を、Sound の名前付き BGM として使えるようにする。
 * ゲームの AudioContext と BGM 用の音量ノードを共有するので、音量・消音・一時停止はゲーム側に従う。
 */
export function technoBgm(volume = 0.8): BgmTrack {
  let track: TechnoTrack | null = null;
  return {
    start(ctx, out) {
      track ??= new TechnoTrack({ context: ctx, destination: out, volume });
      void track.start({ fadeIn: 0.8 });
    },
    stop() {
      void track?.stop({ fadeOut: 0.8 });
    },
  };
}
