import type { Hud } from './Hud';
import { el, escapeHtml } from './dom';
import { TEXT_SPEED_LABELS } from '../core/Settings';
import { SaveSlots, type SaveEntry } from '../core/SaveSlots';
import { titleEmbers } from './TitleEmbers';

export interface MenuItem {
  label: string;
  note?: string;
  disabled?: boolean;
}

/** 設定画面の下に足すボタン（ゲーム固有のもの）。run が文字を返したら、ボタンをその文字にして押せなくする */
export interface PanelAction {
  label: string;
  run: () => string | void;
}

export interface HomeOptions {
  title: string;
  subtitle?: string;
  /** 作品名のロゴ画像（URL）。あれば作品名の文字の代わりに出す */
  logo?: string;
  /** タイトル背景の画像（URL）。指定しなければ和紙の色を使う */
  background?: string;
  items: Array<{ id: string; label: string; disabled?: boolean }>;
  footer?: string;
}

export interface EpisodeCard {
  id: string;
  /** 例: 第一話 */
  number: string;
  title: string;
  state: 'open' | 'cleared' | 'locked';
  /** 遊べないときの文（無ければ「準備中」。例: 11月1日 公開） */
  note?: string;
  /** 扉絵（URL） */
  cover?: string;
}

function formatDate(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 画面を覆うパネル：ログ・設定・メニュー・セーブ一覧・ホーム画面・話の一覧。
 * 中身（メニューの項目・セーブの中身・話の一覧）はゲームやジャンルが渡す。
 */
export class Panels {
  private homeEl: HTMLElement | null = null;
  private homeMenu: HTMLElement | null = null;
  private stopEmbers: (() => void) | null = null;

  constructor(private hud: Hud) {}

  /** パネルの枠。開いている間は会話などが進まない（Hud.modal） */
  private sheet(title: string, cls: string) {
    const hud = this.hud;
    const wrap = el('div', `sheet ${cls}`, hud.root);
    const panel = el('div', 'panel washi', wrap);
    el('h2', '', panel, escapeHtml(title));
    const body = el('div', 'body', panel);
    const row = el('div', 'row', panel);
    hud.modal++;
    hud.input.clearPressed();
    let resolve!: () => void;
    const closed = new Promise<void>((r) => (resolve = r));
    const close = () => {
      if (!wrap.isConnected) return;
      wrap.remove();
      hud.modal--;
      const i = hud.cancelStack.indexOf(close);
      if (i >= 0) hud.cancelStack.splice(i, 1);
      hud.input.clearPressed();
      resolve();
    };
    hud.cancelStack.push(close);
    const back = el('div', 'btn', row, '閉じる');
    back.addEventListener('click', () => {
      hud.sound.play('cancel');
      close();
    });
    return { body, row, closed, close };
  }

  /** 会話のログ（読み返し） */
  async log(): Promise<void> {
    const s = this.sheet('会話のログ', 'log');
    if (!this.hud.backlog.length) el('div', 'empty', s.body, 'まだ会話はありません。');
    for (const e of this.hud.backlog) {
      const item = el('div', 'entry', s.body);
      if (e.name) {
        const who = el('div', 'who', item, escapeHtml(e.name));
        if (e.color) who.style.color = e.color;
      }
      el('div', e.name ? 'say' : 'say narration', item, escapeHtml(e.text));
    }
    requestAnimationFrame(() => (s.body.scrollTop = s.body.scrollHeight));
    await s.closed;
  }

  /** 設定。extras はゲーム固有のボタン（説明をもう一度見る、など） */
  async settings(extras: PanelAction[] = []): Promise<void> {
    const { sound, settings: st } = this.hud;
    const s = this.sheet('設定', 'settings');
    const seg = (label: string, options: string[], get: () => number, set: (i: number) => void) => {
      const line = el('div', 'setting', s.body);
      el('div', 'label', line, escapeHtml(label));
      const g = el('div', 'seg', line);
      const cells = options.map((o, i) => {
        const c = el('div', 'cell', g, escapeHtml(o));
        c.addEventListener('click', () => {
          set(i);
          refresh();
          sound.play('select');
        });
        return c;
      });
      const refresh = () => cells.forEach((c, i) => c.classList.toggle('on', i === get()));
      refresh();
    };
    const volume = ['切', '1', '2', '3', '4', '5'];
    seg('音楽', volume, () => Math.round(st.values.bgm * 5), (i) => st.set('bgm', i / 5));
    seg('効果音', volume, () => Math.round(st.values.se * 5), (i) => st.set('se', i / 5));
    seg('声', volume, () => Math.round(st.values.voice * 5), (i) => st.set('voice', i / 5));
    seg('文字の速さ', TEXT_SPEED_LABELS.slice(1), () => st.values.textSpeed - 1, (i) => st.set('textSpeed', i + 1));
    seg('早送り', ['読んだ会話だけ', 'すべて'], () => (st.values.skipUnread ? 1 : 0), (i) => st.set('skipUnread', i === 1));
    if (extras.length) {
      const line = el('div', 'setting extras', s.body);
      for (const x of extras) {
        const b = el('div', 'btn', line, escapeHtml(x.label));
        b.addEventListener('click', () => {
          if (b.hasAttribute('disabled')) return;
          sound.play('confirm');
          const done = x.run();
          if (done) {
            b.textContent = done;
            b.setAttribute('disabled', '');
          }
        });
      }
    }
    await s.closed;
  }

  /** 項目を1つ選ばせる。閉じたら null */
  async menu(title: string, items: MenuItem[]): Promise<number | null> {
    const s = this.sheet(title, 'menu');
    let picked: number | null = null;
    items.forEach((it, i) => {
      const b = el('div', 'item', s.body);
      el('div', 'lbl', b, escapeHtml(it.label));
      if (it.note) el('div', 'note', b, escapeHtml(it.note));
      if (it.disabled) b.setAttribute('disabled', '');
      b.addEventListener('click', () => {
        if (it.disabled) return this.hud.sound.play('cancel');
        this.hud.sound.play('confirm');
        picked = i;
        s.close();
      });
    });
    await s.closed;
    return picked;
  }

  /** セーブ・ロードする場所を選ばせる（0番はオート。セーブでは選べない）。閉じたら null */
  async slots(mode: 'save' | 'load', entries: Array<SaveEntry | null>): Promise<number | null> {
    const s = this.sheet(mode === 'save' ? 'セーブ' : 'ロード', 'slots');
    if (mode === 'save') el('div', 'hint', s.body, 'オートには、捜査に戻るたびに自動で残ります。');
    let picked: number | null = null;
    entries.forEach((e, i) => {
      const disabled = mode === 'save' ? i === 0 : !e;
      const b = el('div', 'slot', s.body);
      el('div', 'no', b, SaveSlots.label(i));
      const info = el('div', 'info', b);
      if (e) {
        el('div', 'ttl', info, escapeHtml(e.title));
        if (e.detail) el('div', 'dt', info, escapeHtml(e.detail));
        el('div', 'when', b, formatDate(e.savedAt));
      } else el('div', 'ttl empty', info, '（空き）');
      if (disabled) b.setAttribute('disabled', '');
      b.addEventListener('click', () => {
        if (disabled) return this.hud.sound.play('cancel');
        this.hud.sound.play('confirm');
        picked = i;
        s.close();
      });
    });
    await s.closed;
    return picked;
  }

  /** ホーム画面。選ばれた項目の id を返す（画面は closeHome まで残る） */
  home(opts: HomeOptions): Promise<string> {
    const { hud } = this;
    if (!this.homeEl) {
      const h = (this.homeEl = el('div', 'home', hud.root));
      const sky = el('div', 'sky', h);
      sky.setAttribute('aria-hidden', 'true');
      if (opts.background) sky.style.backgroundImage = `url("${opts.background}")`;
      this.stopEmbers = titleEmbers(sky);
      const tb = el('div', 'title-block', h);
      if (opts.logo) {
        const img = el('img', 'logo', tb);
        img.src = opts.logo;
        img.alt = `${opts.subtitle ?? ''} ${opts.title}`.trim();
      } else {
        if (opts.subtitle) el('div', 'sub', tb, escapeHtml(opts.subtitle));
        el('div', 'title', tb, escapeHtml(opts.title));
      }
      this.homeMenu = el('div', 'menu', h);
      if (opts.footer) el('div', 'foot', h, escapeHtml(opts.footer));
    }
    const menu = this.homeMenu!;
    menu.innerHTML = '';
    return new Promise((resolve) => {
      for (const it of opts.items) {
        const b = el('div', 'btn', menu, escapeHtml(it.label));
        if (it.disabled) b.setAttribute('disabled', '');
        b.addEventListener('click', () => {
          hud.sound.unlock();
          if (it.disabled) return hud.sound.play('cancel');
          hud.sound.play('confirm');
          resolve(it.id);
        });
      }
    });
  }

  closeHome(): void {
    this.stopEmbers?.();
    this.stopEmbers = null;
    this.homeEl?.remove();
    this.homeEl = this.homeMenu = null;
  }

  /** 話の一覧。選ばれた話の id を返す。閉じたら null */
  async episodes(list: EpisodeCard[]): Promise<string | null> {
    const s = this.sheet('話を選ぶ', 'episodes');
    let picked: string | null = null;
    for (const ep of list) {
      const c = el('div', `ep ${ep.state}`, s.body);
      if (ep.cover && ep.state !== 'locked') el('div', 'cover', c).style.backgroundImage = `url("${ep.cover}")`;
      el('div', 'num', c, escapeHtml(ep.number));
      el('div', 'ttl', c, escapeHtml(ep.state === 'locked' ? (ep.note ?? '準備中') : ep.title));
      if (ep.state === 'cleared') el('div', 'stamp', c, '解決');
      c.addEventListener('click', () => {
        if (ep.state === 'locked') return this.hud.sound.play('cancel');
        this.hud.sound.play('confirm');
        picked = ep.id;
        s.close();
      });
    }
    await s.closed;
    return picked;
  }
}
