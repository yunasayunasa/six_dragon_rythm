import type { CaseData } from '../genres/investigation/types';

/** 作品名 */
export const GAME_TITLE = '逆転六竜';
export const GAME_SUBTITLE = '〜活劇奇譚〜';
/** 作品名のロゴ（public/assets からの相対） */
export const GAME_LOGO = 'ui/title_logo.webp';
/** ホーム画面の曲（ユーザー提供のファンファーレ。音量はエンディング曲と聞こえる大きさをそろえた） */
export const TITLE_BGM = { url: 'audio/fanfare.mp3', volume: 0.37 };
/** ホーム画面のタイトルコール（PV のナレーター「活劇奇譚、逆転六竜！」。ユーザー希望 2026-10-04） */
export const TITLE_CALL = 'audio/title_call.mp3';

export interface Episode {
  id: string;
  /** 例: 第一話 */
  number: string;
  title: string;
  /** 扉絵（public/assets からの相対） */
  cover?: string;
  /** 事件データの読み込み（無ければ準備中） */
  load?: () => Promise<CaseData>;
  /** 公開日（日本時間のその日の0時から遊べる。例 '2026-11-01'）。無ければいつでも遊べる */
  release?: string;
}

/**
 * 月1回の更新（5ヶ月連続更新企画）。公開日を過ぎた話だけ遊べる。日付を変えるときはここだけ直す。
 * 確認用に、URL の後ろに ?preview を付けると公開日の前でも全話を遊べる（仲間には教えない）。
 */
export const RELEASES: Record<string, string> = {
  case02: '2026-12-01',
  case03: '2027-01-01',
  case04: '2027-02-01',
  case05: '2027-03-01',
};

/** 公開日の0時（日本時間）。'2026-11-01' → その時刻のミリ秒 */
export const releaseTime = (date: string) => Date.parse(`${date}T00:00:00+09:00`);

/** その話が now の時点で公開されているか */
export function isReleased(ep: Episode, now = Date.now()): boolean {
  return !ep.release || now >= releaseTime(ep.release);
}

/** 公開前の話の一覧に出す文（例: 12月1日 公開） */
export function releaseLabel(ep: Episode): string {
  const d = new Date(releaseTime(ep.release!) + 9 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 公開`;
}

/** 全5話。前の話を解決すると次の話が遊べる（第一話は最初から） */
export const EPISODES: Episode[] = [
  { id: 'case01', number: '第一話', title: '夕凪の空港と消えた灯晶', cover: 'ui/cover_case01.webp', load: () => import('./case01/case').then((m) => m.CASE01) },
  { id: 'case02', number: '第二話', title: '雲市場と二つの灯晶', cover: 'ui/cover_case02.webp', load: () => import('./case02/case').then((m) => m.CASE02), release: RELEASES.case02 },
  { id: 'case03', number: '第三話', title: '霧の工房と鐘の鳴らない夜', cover: 'ui/cover_case03.webp', load: () => import('./case03/case').then((m) => m.CASE03), release: RELEASES.case03 },
  { id: 'case04', number: '第四話', title: '嵐の監獄船とルオーの罪', cover: 'ui/cover_case04.webp', load: () => import('./case04/case').then((m) => m.CASE04), release: RELEASES.case04 },
  { id: 'case05', number: '第五話', title: '暁の空に、六竜の逆転', cover: 'ui/cover_case05.webp', load: () => import('./case05/case').then((m) => m.CASE05), release: RELEASES.case05 },
];
