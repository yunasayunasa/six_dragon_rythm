/** 各話の更新予告（第二話〜第五話）で共通の、始まりと締め */
import { EPISODES } from '../../game/episodes';
import type { FilmContext } from '../film';
import { seriesBadge, spinNumeral, titleCard, shade } from '../kit';
import { lengthOf, narrate } from '../audio';
import { until } from '../timeline';

const DAIJI = ['', '壱', '弐', '参', '肆', '伍'];

/** 始まり：話数（大字）が立体で回って現れ、左上に「5ヶ月連続更新企画 第N弾」の札（end まで出し続ける） */
export function opening(ctx: FilmContext, n: number, o: { at: number; until: number; badgeUntil: number; sub?: string; dark?: number }): void {
  shade(0, o.until + 0.1, { alpha: o.dark ?? 0.5, fadeIn: 0.01, fadeOut: 0.35 });
  spinNumeral(DAIJI[n], o.at, o.until - o.at, { x: 960, y: 470, size: 470, font: 'brush', sub: o.sub ?? `第${'一二三四五'[n - 1]}話　更新予告`, turns: 1.25 });
  seriesBadge(n, o.at + 0.15, o.badgeUntil - o.at - 0.15);
  void until(o.at).then(() => {
    ctx.engine.sound.play('whoosh');
    ctx.engine.sound.play('impact');
  });
}

/** 締め：扉絵・話数・題名（筆で書かれる）・朱の下線、決めの音で「近日更新」の判。題名はウィルナスが読む */
export function finale(ctx: FilmContext, n: number, o: { at: number; dur: number; stampAt: number; line: string; lineAt?: number; stamp?: string; num?: string }): void {
  const ep = EPISODES[n - 1];
  titleCard({
    cover: ctx.asset(ep.cover!),
    logo: ctx.asset('ui/title_logo.webp'),
    n,
    num: o.num ?? ep.number,
    title: ep.title,
    stamp: o.stamp ?? '近日<br>更新',
    start: o.at,
    dur: o.dur,
    stampAt: o.stampAt,
  });
  void until(o.lineAt ?? o.at + 0.2).then(() => narrate(ctx.lineUrl(o.line), 1.2));
  void until(o.stampAt).then(() => {
    ctx.engine.sound.play('impact');
    ctx.engine.sound.play('shine');
  });
}

export const lineLen = (ctx: FilmContext, id: string) => lengthOf(ctx.lineUrl(id));
