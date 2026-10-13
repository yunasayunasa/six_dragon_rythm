/** techno-track.js（ユーザー提供のコードだけで鳴らすテクノBGM）の型 */
export interface TechnoTrackOptions {
  context?: AudioContext;
  destination?: AudioNode;
  volume?: number;
  lookahead?: number;
  pauseWhenHidden?: boolean;
}

export class TechnoTrack {
  constructor(opts?: TechnoTrackOptions);
  playing: boolean;
  start(opts?: { from?: string | number; fadeIn?: number }): Promise<void>;
  stop(opts?: { fadeOut?: number }): Promise<void>;
  setVolume(v: number, seconds?: number): void;
  setMuffled(on: boolean, seconds?: number): void;
  dispose(): void;
}

export default TechnoTrack;
