/** 撮れる PV の一覧（/pv/?film=<id>） */
import type { Film } from './film';
import { CASE01 } from '../game/case01/case';
import { DURATION, MUSIC, ROLL, runPV, voiceList } from './scenes';
import { overall } from './films/overall';
import { ep2 } from './films/ep2';
import { ep3 } from './films/ep3';
import { ep4 } from './films/ep4';
import { ep5 } from './films/ep5';

/** 第一話 PV（約94秒。2026-10-03 制作） */
const case01: Film = {
  id: 'case01',
  out: 'PV_逆転六竜_第一話',
  load: async () => CASE01,
  duration: DURATION,
  music: { ...MUSIC, file: 'fanfare.mp3' },
  voices: voiceList,
  images: () => ['ui/title_logo.webp', 'ui/cover_case01.webp', 'props/evidence_honey_puddle.webp', ...ROLL.map((r) => `cast/${r.pose}/base.webp`)],
  run: runPV,
};

export const FILMS: Record<string, Film> = { case01, overall, ep2, ep3, ep4, ep5 };
