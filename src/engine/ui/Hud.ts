import type { Input } from '../core/Input';
import type { Sound } from '../audio/Sound';
import { toGame } from '../core/screen';
import { PortraitSlot, type PortraitData, type PortraitSide } from './Portrait';
import { el, escapeHtml } from './dom';
import { Panels } from './Panels';
import { ReadMarks } from '../core/ReadMarks';
import type { Settings } from '../core/Settings';
import type { Voices } from '../audio/Voices';

export { escapeHtml };

export interface CardItem {
  id: string;
  name: string;
  desc: string;
  image: string;
  /** 一覧で見出しを付けて分けるときの分類名 */
  group?: string;
}

export interface ClueItem {
  id: string;
  name: string;
  desc: string;
}

/** 遊び方の説明の1ページ */
export interface GuideStep {
  text: string;
  /** 指し示す画面の部品（defineTarget で登録した名前）。無ければ画面全体を暗くするだけ */
  target?: string;
}

/** 要素の位置をゲーム画面の座標で返す（画面を回しているときも正しく）。見えていなければ null */
function gameRect(e: Element): { x: number; y: number; w: number; h: number } | null {
  const r = e.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  const a = toGame(r.left, r.top);
  const b = toGame(r.right, r.bottom);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/**
 * 画面上のUI一式（DOM）。ゲームの状態は持たず、表示と入力待ちだけを担当する。
 * どのジャンルでも使う部品：会話、叫び、字幕、選択肢、アイテム一覧、入手演出、暗転、タッチ操作。
 */
export class Hud {
  readonly root: HTMLElement;
  private dlg: HTMLElement;
  private dlgName: HTMLElement;
  private dlgText: HTMLElement;
  private fader: HTMLElement;
  private promptEl: HTMLElement;
  readonly topbar: HTMLElement;
  private goalEl: HTMLElement;
  private talismanEl: HTMLElement;
  private touch: HTMLElement;
  private confirmWaiters: Array<() => void> = [];
  private typing: { full: string; shown: number; acc: number; done: () => void } | null = null;
  /** 文字送りの速さ（文字/秒） */
  cps = 42;
  onSpeakTick: (() => void) | null = null;
  bookButton: HTMLElement;
  /** 場所をリストから選んで移る話だけ出す「移動」ボタン（捜査中の右下） */
  travelButton!: HTMLElement;
  /** メニュー（セーブ・ロード・設定など。中身はジャンルが決める） */
  menuButton: HTMLElement;
  soundButton: HTMLElement;
  private portraits: Record<PortraitSide, PortraitSlot>;
  private speaking: PortraitSide | null = null;
  /** 説明で指し示せる画面の部品（名前 → 要素） */
  private targets = new Map<string, () => Element | null>();
  /** 会話の記録（ログで読み返す） */
  readonly backlog: Array<{ name: string | null; color?: string; text: string }> = [];
  private skipButton: HTMLElement;
  private skip = false;
  /** 開いているパネルの数。開いている間は会話を進めない */
  modal = 0;
  /** パネルを閉じる処理（キーボードの取消で一番上のパネルを閉じる） */
  readonly cancelStack: Array<() => void> = [];
  /** ログ・設定・メニュー・セーブ一覧・ホーム画面 */
  readonly panels: Panels;
  /** 叫び（待った！など）の声を出す人の名前。null なら叫びに声は付けない */
  shoutSpeaker: string | null = null;

  constructor(readonly input: Input, readonly sound: Sound, readonly settings: Settings, private readMarks: ReadMarks, readonly voices: Voices) {
    this.root = document.getElementById('hud')!;
    this.panels = new Panels(this);
    this.topbar = el('div', 'topbar', this.root);
    this.talismanEl = el('div', 'talismans hidden', this.topbar);
    this.goalEl = el('div', 'chip goal washi hidden', this.topbar);
    el('div', 'spacer', this.topbar);
    this.bookButton = el('div', 'chip washi hidden', this.topbar, '証拠品');
    this.menuButton = el('div', 'chip washi hidden', this.topbar, 'メニュー');
    this.soundButton = el('div', 'chip washi', this.topbar, '音：切');
    this.soundButton.addEventListener('click', () => {
      sound.unlock();
      sound.setMuted(!sound.muted);
      this.soundButton.textContent = sound.muted ? '音：切' : '音：入';
    });
    sound.muted = true;

    this.touch = el('div', 'touch hidden', this.root);
    this.buildTouch();

    this.promptEl = el('div', 'prompt washi hidden', this.root);
    this.promptEl.addEventListener('click', () => input.press('confirm'));

    this.dlg = el('div', 'dlg washi hidden', this.root);
    this.dlgName = el('div', 'name', this.dlg);
    this.dlgText = el('div', 'text', this.dlg);
    el('div', 'next', this.dlg);
    // 会話枠の右上：ログと早送り（押しても会話は進めない）
    const tools = el('div', 'tools', this.dlg);
    const logButton = el('div', 'tool', tools, 'ログ');
    this.skipButton = el('div', 'tool', tools, '早送り');
    for (const b of [logButton, this.skipButton]) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    logButton.addEventListener('click', () => void this.panels.log());
    this.skipButton.addEventListener('click', () => {
      this.sound.play('select');
      this.skipping = !this.skip;
    });
    // 立ち絵は会話枠の後ろに置く
    this.portraits = { left: new PortraitSlot(this.root, this.dlg, 'left'), right: new PortraitSlot(this.root, this.dlg, 'right') };
    this.dlg.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.sound.unlock();
      this.input.press('confirm');
    });
    // 会話中は舞台（会話枠の外）をタップしても送れるようにする
    document.getElementById('app')?.addEventListener('pointerdown', () => {
      if (this.dlg.classList.contains('hidden')) return;
      this.sound.unlock();
      this.input.press('confirm');
    });
    this.fader = el('div', 'fader', this.root);

    this.defineTarget('目的', () => this.goalEl);
    this.defineTarget('信', () => this.talismanEl);
    this.defineTarget('証拠品', () => this.bookButton);
    this.defineTarget('音', () => this.soundButton);
    this.defineTarget('メモの一覧', () => this.root.querySelector('.logic .clues'));
    this.defineTarget('つなげる', () => this.root.querySelector('.logic .row .btn.shu'));
    this.defineTarget('あとで', () => this.root.querySelector('.logic .row .btn:not(.shu)'));
  }

  /** 早送り中か。読んでいない会話に来たら（設定で許していなければ）自動で止まる */
  get skipping(): boolean {
    return this.skip;
  }

  set skipping(on: boolean) {
    this.skip = on;
    this.skipButton.classList.toggle('on', on);
  }

  /**
   * 決定を待つ。早送り中なら ms 待って自動で進む（待っている間に早送りを入れても進む）。
   * パネルを開いている間は進まない。
   */
  private waitConfirmOrSkip(ms: number): Promise<void> {
    return new Promise((resolve) => {
      let waited = 0;
      const timer = setInterval(() => {
        waited = this.skip && this.modal === 0 ? waited + 30 : 0;
        if (waited >= ms) done();
      }, 30);
      const done = () => {
        clearInterval(timer);
        this.confirmWaiters = this.confirmWaiters.filter((w) => w !== done);
        resolve();
      };
      this.confirmWaiters.push(done);
    });
  }

  /** 説明（guide）で指し示せる部品を登録する。ジャンル固有の部品もここに足す */
  defineTarget(name: string, get: () => Element | null): void {
    this.targets.set(name, get);
  }

  private buildTouch(): void {
    const zone = el('div', 'stick-zone', this.touch);
    const base = el('div', 'stick-base hidden', zone);
    const knob = el('div', 'stick-knob', base);
    let id: number | null = null;
    let ox = 0;
    let oy = 0;
    const R = () => base.offsetWidth / 2;
    zone.addEventListener('pointerdown', (e) => {
      this.sound.unlock();
      id = e.pointerId;
      zone.setPointerCapture(id);
      // 画面を回しているときもあるので、ゲーム画面の座標で扱う
      const p = toGame(e.clientX, e.clientY);
      ox = p.x;
      oy = p.y;
      base.style.left = `${p.x - zone.offsetLeft}px`;
      base.style.top = `${p.y - zone.offsetTop}px`;
      base.classList.remove('hidden');
    });
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const rad = R();
      const p = toGame(e.clientX, e.clientY);
      let dx = p.x - ox;
      let dy = p.y - oy;
      const len = Math.hypot(dx, dy);
      if (len > rad) {
        dx = (dx / len) * rad;
        dy = (dy / len) * rad;
      }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const dead = 0.18;
      const nx = dx / rad;
      const ny = dy / rad;
      const m = Math.hypot(nx, ny);
      this.input.setStick(m < dead ? 0 : nx, m < dead ? 0 : ny);
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      knob.style.transform = 'translate(-50%, -50%)';
      base.classList.add('hidden');
      this.input.setStick(0, 0);
    };
    zone.addEventListener('pointermove', move);
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
    zone.addEventListener('contextmenu', (e) => e.preventDefault());

    const btns = el('div', 'btns', this.touch);
    // 証拠品一覧は上の「証拠品」から開けるので、こちらは「まとめる」
    this.travelButton = el('div', 'btn-round small hidden', btns, '移動');
    this.travelButton.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.input.press('travel');
    });
    const logic = el('div', 'btn-round small', btns, 'まとめる');
    logic.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.input.press('logic');
    });
    const act = el('div', 'btn-round shu', btns, '調べる');
    act.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.sound.unlock();
      this.input.press('confirm');
    });
    this.defineTarget('移動', () => zone);
    this.defineTarget('まとめる', () => logic);
    this.defineTarget('調べる', () => act);
  }

  syncSoundLabel(): void {
    this.soundButton.textContent = this.sound.muted ? '音：切' : '音：入';
  }

  showTouch(on: boolean): void {
    this.touch.classList.toggle('hidden', !on);
    if (!on) this.input.setStick(0, 0);
  }

  setGoal(text: string | null): void {
    this.goalEl.classList.toggle('hidden', !text);
    if (text) this.goalEl.textContent = `目的：${text}`;
  }

  setTalismans(total: number, left: number): void {
    this.talismanEl.classList.toggle('hidden', total <= 0);
    this.talismanEl.innerHTML = '';
    for (let i = 0; i < total; i++) el('div', `talisman${i >= left ? ' lost' : ''}`, this.talismanEl, '信');
  }

  /** 近くで決定するとできることの案内。badge は頭の一文字（調べる＝調、別の場所へ移る＝移） */
  setPrompt(text: string | null, badge = '調'): void {
    this.promptEl.classList.toggle('hidden', !text);
    if (text) this.promptEl.innerHTML = `<b>${escapeHtml(badge)}</b>${escapeHtml(text)}`;
  }

  /** 決定入力を待つ（画面タップ・キー） */
  waitConfirm(): Promise<void> {
    return new Promise((r) => this.confirmWaiters.push(r));
  }

  /** 会話を1つ表示し、読み終えて決定されるまで待つ */
  async say(name: string | null, color: string | undefined, text: string, onTalk?: (talking: boolean) => void): Promise<void> {
    const key = ReadMarks.key(name, text);
    // 早送りは、読んでいない会話に来たら止まる（設定で「すべて」にしていなければ）
    if (this.skip && !this.readMarks.has(key) && !this.settings.values.skipUnread) this.skipping = false;
    this.backlog.push({ name, color, text });
    if (this.backlog.length > 300) this.backlog.shift();
    this.dlg.classList.remove('hidden', 'done');
    this.dlg.classList.toggle('narration', !name);
    this.dlgName.textContent = name ?? '';
    this.dlgName.style.background = color ?? '';
    this.dlgText.textContent = '';
    this.input.clearPressed();
    // 声（あれば）。早送り中は鳴らさない
    const voice = this.voices.url(name, text);
    if (voice && !this.skip) this.sound.playVoice(voice);
    const slot = this.speaking ? this.portraits[this.speaking] : null;
    onTalk?.(true);
    if (slot) slot.talking = true;
    await new Promise<void>((done) => {
      this.typing = { full: text, shown: 0, acc: 0, done };
    });
    onTalk?.(false);
    if (slot) slot.talking = false;
    this.readMarks.add(key);
    this.dlg.classList.add('done');
    await this.waitConfirmOrSkip(90);
    // 次へ進んだら声は止める
    if (voice) this.sound.stopVoice();
    if (!this.skip) this.sound.play('select');
  }

  /** 次に出るセリフの声を先に読み込んでおく */
  preloadVoice(name: string | null, text: string): void {
    const voice = this.voices.url(name, text);
    if (voice) this.sound.preloadVoice(voice);
  }

  hideDialogue(): void {
    this.dlg.classList.add('hidden');
    this.portraits.left.hide();
    this.portraits.right.hide();
    this.speaking = null;
  }

  /**
   * 次のセリフの話し手の立ち絵を出す。話し手は明るく、聞き手は暗くする。
   * data が null（ナレーション）のときは、出ている立ち絵を両方とも暗くする。
   */
  /** 出ている立ち絵の絵だけを差し替える（話し手は変えない） */
  refreshPortrait(side: PortraitSide, data: PortraitData): void {
    if (this.portraits[side].visible) this.portraits[side].show(data, false);
  }

  setSpeaker(side: PortraitSide | null, data: PortraitData | null): void {
    if (side && data) this.portraits[side].show(data);
    this.speaking = side && data ? side : null;
    for (const s of ['left', 'right'] as const) this.portraits[s].setActive(s === this.speaking);
  }

  async shout(word: string, color?: string): Promise<void> {
    const s = el('div', 'shout', this.root);
    el('div', 'flash', s);
    el('div', 'lines', s);
    const sp = el('div', 'splash', s);
    // 墨の飛び散り（毎回ちがう位置に）
    for (let i = 0; i < 7; i++) {
      const d = el('i', 'ink', s);
      const a = Math.random() * Math.PI * 2;
      const r = 26 + Math.random() * 18;
      d.style.left = `${50 + Math.cos(a) * r}%`;
      d.style.top = `${50 + Math.sin(a) * r * 0.9}%`;
      d.style.setProperty('--s', `${0.5 + Math.random()}`);
      d.style.animationDelay = `${0.05 + Math.random() * 0.12}s`;
    }
    if (color) sp.style.background = color;
    el('div', 'word', s, escapeHtml(word));
    this.sound.play('shout');
    const voice = this.voices.url(this.shoutSpeaker, word);
    if (voice && !this.skip) this.sound.playVoice(voice);
    await new Promise((r) => setTimeout(r, this.skip ? 450 : 1100));
    s.remove();
  }

  /** 画面全体が一瞬白く光る（待たない） */
  flash(strength = 0.8, seconds = 0.25): void {
    const f = el('div', 'flashfx', this.root);
    f.animate([{ opacity: strength }, { opacity: 0 }], { duration: seconds * 1000, easing: 'ease-out' }).onfinish = () => f.remove();
  }

  /**
   * 画面が割れる演出。写し取った画面の絵(image)にひびを入れ、破片にして飛び散らせる。
   * 破片の向こうには、いま動いている舞台がそのまま見える。(cx, cy) はひびの中心（画面の%）
   */
  async shatter(image: HTMLCanvasElement, cx = 50, cy = 45): Promise<void> {
    const fast = this.skip ? 0.4 : 1;
    const url = image.toDataURL('image/jpeg', 0.85);
    const box = el('div', 'shatter', this.root);
    const rect = box.getBoundingClientRect();
    const aspect = rect.width / Math.max(1, rect.height);
    // ひびの線：中心から放射状の線と、それを結ぶ2つの輪
    const rays = 13;
    const angles = Array.from({ length: rays }, (_, i) => ((i + 0.15 + Math.random() * 0.7) / rays) * Math.PI * 2);
    // 輪の半径は線ごとに大きくばらつかせ、蜘蛛の巣のように整って見えないようにする
    const rings = [5, 17, 140];
    const spread = [0.5, 0.75, 0];
    const pt = (a: number, r: number): [number, number] => [cx + Math.cos(a) * r, cy + Math.sin(a) * r * aspect];
    const pts = rings.map((r, ri) =>
      angles.map((a) => pt(a + (ri ? (Math.random() - 0.5) * 0.18 : 0), r * (1 + (Math.random() - 0.3) * spread[ri]))),
    );
    const shards: { poly: [number, number][]; ring: number }[] = [];
    for (let i = 0; i < rays; i++) {
      const j = (i + 1) % rays;
      shards.push({ poly: [[cx, cy], pts[0][i], pts[0][j]], ring: 0 });
      for (let r = 1; r < rings.length; r++) shards.push({ poly: [pts[r - 1][i], pts[r][i], pts[r][j], pts[r - 1][j]], ring: r });
    }
    // ひび：中心から外へ走る線と、輪の線（ところどころ途切れさせる）。同じ線を二重に描かない
    const seg = (a: [number, number], b: [number, number]) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;
    let lines = '';
    for (let i = 0; i < rays; i++) {
      const j = (i + 1) % rays;
      lines += seg([cx, cy], pts[0][i]) + seg(pts[0][i], pts[1][i]) + seg(pts[1][i], pts[2][i]);
      if (Math.random() < 0.6) lines += seg(pts[0][i], pts[0][j]);
      if (Math.random() < 0.4) lines += seg(pts[1][i], pts[1][j]);
    }
    const pieces = shards.map((s) => {
      const d = el('div', 'shard', box);
      d.style.backgroundImage = `url(${url})`;
      d.style.clipPath = `polygon(${s.poly.map(([x, y]) => `${x}% ${y}%`).join(',')})`;
      const gx = s.poly.reduce((a, p) => a + p[0], 0) / s.poly.length;
      const gy = s.poly.reduce((a, p) => a + p[1], 0) / s.poly.length;
      d.style.transformOrigin = `${gx}% ${gy}%`;
      return { d, gx, gy, ring: s.ring };
    });
    const cracks = el('div', 'cracks', box, `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>`);
    cracks.style.setProperty('--cx', `${cx}%`);
    cracks.style.setProperty('--cy', `${cy}%`);
    // ピキッ：ひびが入って、破片がわずかにずれる
    this.sound.play('crack');
    this.flash(0.6, 0.18);
    for (const p of pieces) {
      const len = Math.hypot(p.gx - cx, p.gy - cy) || 1;
      const k = 0.15 + p.ring * 0.12;
      p.d.style.transform = `translate(${((p.gx - cx) / len) * k}%, ${((p.gy - cy) / len) * k}%) rotate(${(Math.random() - 0.5) * 0.5}deg)`;
    }
    await new Promise((r) => setTimeout(r, 480 * fast));
    // パリーン：破片が手前へ飛び散って落ちる
    this.sound.play('glass');
    this.flash(0.9, 0.35);
    box.classList.add('broken');
    const anims = pieces.map((p) => {
      const len = Math.hypot(p.gx - cx, p.gy - cy) || 1;
      const ux = (p.gx - cx) / len;
      const uy = (p.gy - cy) / len;
      const power = (3 - p.ring) * 14 + Math.random() * 18;
      const from = p.d.style.transform;
      const rx = (Math.random() - 0.5) * 220;
      const ry = (Math.random() - 0.5) * 220;
      const rz = (Math.random() - 0.5) * 120;
      return p.d.animate(
        [
          { transform: from, opacity: 1 },
          {
            transform: `translate3d(${ux * power}%, ${uy * power + 40 + Math.random() * 30}%, ${(3 - p.ring) * 120 + 80}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`,
            opacity: 0,
          },
        ],
        { duration: (900 + Math.random() * 500) * fast, delay: p.ring * 40 * fast, easing: 'cubic-bezier(.2,.6,.5,1)', fill: 'forwards' },
      ).finished;
    });
    await Promise.all(anims);
    box.remove();
  }

  /** 画面上に短い知らせを出す（待たない） */
  toast(text: string): void {
    const t = el('div', 'toast washi', this.root, escapeHtml(text));
    setTimeout(() => t.remove(), 1800);
  }

  async card(title: string, sub = '', hint = ''): Promise<void> {
    const c = el('div', 'card', this.root);
    const inner = el('div', 'inner washi', c);
    if (sub) el('div', 'sub', inner, escapeHtml(sub));
    el('div', 'title', inner, escapeHtml(title));
    if (hint) el('div', 'hint', inner, escapeHtml(hint));
    c.addEventListener('pointerdown', () => {
      this.sound.unlock();
      this.input.press('confirm');
    });
    this.input.clearPressed();
    await this.waitConfirmOrSkip(350);
    this.sound.play('confirm');
    c.remove();
  }

  /**
   * 対峙のカットイン：画面を斜めに割り、左に主人公・右に相手の立ち絵を大きく出して、題名を叩きつける。タップで閉じる。
   * 尋問の始まりなどに使う
   */
  async versus(
    left: { portrait: PortraitData; color?: string },
    right: { portrait: PortraitData; color?: string },
    title: string,
    sub = '',
    hint = '',
  ): Promise<void> {
    const v = el('div', 'versus', this.root);
    const side = (s: PortraitSide, d: { portrait: PortraitData; color?: string }) => {
      const p = el('div', `vs-side ${s}`, v);
      if (d.color) p.style.setProperty('--c', d.color);
      const data = d.portrait;
      const fig = el('div', 'fig', p);
      fig.style.aspectRatio = `${data.width} / ${data.height}`;
      // 大きさは主人公とそろえる（portraitScale だけ効かせる）。横に広い絵は縮めずに画面の外側へずらし、
      // 頭が斜めの割れ目で切れないようにする（はみ出したマントなどは画面の端で切れてよい）
      const size = data.scale ?? 1;
      if (size !== 1) fig.style.height = `${158 * size}%`;
      const over = (v.clientHeight * 1.58 * size * (data.width / data.height)) / v.clientWidth - 0.46;
      if (over > 0) fig.style.setProperty(s, `calc(${4 - over * 100}% + var(--safe-${s === 'left' ? 'l' : 'r'}))`);
      // 左は右向き、右は左向きにそろえて、向かい合わせる
      if (data.artFacing !== (s === 'left' ? 1 : -1)) fig.style.transform = 'scaleX(-1)';
      const img = (url: string, part?: { x: number; y: number; w: number; h: number }) => {
        const i = el('img', '', fig);
        i.src = url;
        i.alt = '';
        i.draggable = false;
        if (!part) return;
        i.style.left = `${(part.x / data.width) * 100}%`;
        i.style.top = `${(part.y / data.height) * 100}%`;
        i.style.width = `${(part.w / data.width) * 100}%`;
        i.style.height = `${(part.h / data.height) * 100}%`;
      };
      img(data.base);
      if (data.eyes.open) img(data.eyes.open.url, data.eyes.open);
      if (data.mouth.closed) img(data.mouth.closed.url, data.mouth.closed);
    };
    side('left', left);
    side('right', right);
    el('div', 'vs-seam', v);
    const t = el('div', 'vs-title', v);
    if (sub) el('div', 'sub', t, escapeHtml(sub));
    const tt = el('div', 'title', t, escapeHtml(title));
    // 長い題は、画面の幅に収まるまで文字を小さくする（左右の見切れを防ぐ）
    for (let size = parseFloat(getComputedStyle(tt).fontSize), n = 0; tt.offsetWidth > v.clientWidth * 0.7 && n < 20; n++) {
      size *= 0.92;
      tt.style.fontSize = `${size}px`;
    }
    if (hint) el('div', 'hint', v, escapeHtml(hint));
    v.addEventListener('pointerdown', () => {
      this.sound.unlock();
      this.input.press('confirm');
    });
    this.sound.play('paper');
    // 左右がぶつかる瞬間に、ダン！
    setTimeout(() => {
      if (!v.isConnected) return;
      this.sound.play('impact');
      this.flash(0.55, 0.2);
      v.classList.add('hit');
    }, this.skip ? 120 : 300);
    // ぶつかる演出の途中でタップしても閉じないよう、少し待ってから受け付ける
    await new Promise((r) => setTimeout(r, this.skip ? 150 : 550));
    this.input.clearPressed();
    await this.waitConfirmOrSkip(350);
    this.sound.play('confirm');
    v.classList.add('leave');
    await new Promise((r) => setTimeout(r, 220));
    v.remove();
  }

  fade(to: 0 | 1, seconds = 0.5): Promise<void> {
    this.fader.style.transition = `opacity ${seconds}s`;
    this.fader.style.opacity = String(to);
    return new Promise((r) => setTimeout(r, seconds * 1000));
  }

  /** 選択肢を出す。question があれば、画面を暗くして問いかけと一緒に出す（後ろは触れない） */
  async choose(options: string[], question?: string): Promise<number> {
    // 選ぶ場面では早送りを止める
    this.skipping = false;
    const layer = question ? el('div', 'ask', this.root) : null;
    const box = el('div', 'choices', layer ?? this.root);
    if (question) el('div', 'question washi', box, escapeHtml(question));
    return new Promise((resolve) => {
      options.forEach((o, i) => {
        const b = el('div', 'btn', box, escapeHtml(o));
        b.addEventListener('click', () => {
          this.sound.play('confirm');
          (layer ?? box).remove();
          resolve(i);
        });
      });
    });
  }

  /** 遊び方の説明。画面の部品を照らしながら1ページずつ見せ、タップで進める */
  async guide(steps: GuideStep[]): Promise<void> {
    const g = el('div', 'guide', this.root);
    const spot = el('div', 'spot', g);
    const box = el('div', 'box washi', g);
    el('div', 'name', box, '遊び方');
    const text = el('div', 'text', box);
    const count = el('div', 'count', box);
    el('div', 'next', box);
    g.addEventListener('pointerdown', () => {
      this.sound.unlock();
      this.input.press('confirm');
    });
    for (const [i, step] of steps.entries()) {
      const target = step.target ? this.targets.get(step.target)?.() : null;
      const r = target ? gameRect(target) : null;
      const pad = 8;
      // 指す物が無いときは、光の穴を画面の真ん中で閉じて全体を暗くする
      const s = r ? { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 } : { x: this.root.clientWidth / 2, y: this.root.clientHeight / 2, w: 0, h: 0 };
      Object.assign(spot.style, { left: `${s.x}px`, top: `${s.y}px`, width: `${s.w}px`, height: `${s.h}px` });
      spot.classList.toggle('none', !r);
      text.textContent = step.text;
      count.textContent = `${i + 1} / ${steps.length}`;
      box.classList.toggle('mid', !r);
      box.style.top = '';
      if (r) {
        // 説明の枠は、指す物の上か下の広く空いている側に、なるべく重ならないように置く（上には見出しの札の分をあける）
        const H = this.root.clientHeight;
        const bh = box.offsetHeight;
        const gap = 10;
        const tag = 30;
        const top = s.y >= H - (s.y + s.h) ? Math.max(tag, s.y - gap - bh) : Math.min(H - bh - gap, s.y + s.h + gap + tag);
        box.style.top = `${top}px`;
      }
      this.input.clearPressed();
      await this.waitConfirm();
      this.sound.play('select');
    }
    g.remove();
  }

  async itemGet(item: CardItem, label = '証拠品を手に入れた'): Promise<void> {
    const w = el('div', 'itemget', this.root);
    const p = el('div', 'panel washi', w);
    const img = el('img', '', p);
    img.src = item.image;
    img.alt = '';
    const t = el('div', '', p);
    el('div', 'label', t, escapeHtml(label));
    el('div', 'nm', t, escapeHtml(item.name));
    el('div', 'ds', t, escapeHtml(item.desc));
    this.sound.play('item');
    w.addEventListener('pointerdown', () => this.input.press('confirm'));
    this.input.clearPressed();
    await this.waitConfirmOrSkip(400);
    this.sound.play('select');
    w.remove();
  }

  /**
   * アイテム一覧を開く。mode='present' なら選んだIDを返す（やめたら null）。
   */
  openBook(items: CardItem[], mode: 'view' | 'present', title = '証拠品ファイル', note = ''): Promise<string | null> {
    const wrap = el('div', 'book', this.root);
    const panel = el('div', 'panel washi', wrap);
    const h = el('h2', '', panel, `${escapeHtml(title)}<small>${mode === 'present' && !note ? '示す証拠を選んでください' : escapeHtml(note)}</small>`);
    void h;
    const grid = el('div', 'grid', panel);
    const desc = el('div', 'desc', panel);
    const row = el('div', 'row', panel);
    const close = el('div', 'btn', row, mode === 'present' ? 'やめる' : '閉じる');
    const ok = mode === 'present' ? el('div', 'btn shu', row, 'これを示す') : null;
    let sel = 0;
    const cards: HTMLElement[] = [];
    const select = (i: number) => {
      if (!items.length) return;
      sel = (i + items.length) % items.length;
      cards.forEach((c, j) => c.classList.toggle('sel', j === sel));
      desc.textContent = items[sel].desc;
      cards[sel].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    items.forEach((it, i) => {
      if (it.group && it.group !== items[i - 1]?.group) el('div', 'group', grid, escapeHtml(it.group));
      const c = el('div', 'ev', grid);
      const img = el('img', '', c);
      img.src = it.image;
      img.alt = '';
      el('div', 'nm', c, escapeHtml(it.name));
      c.addEventListener('click', () => {
        if (sel === i && ok) ok.click();
        select(i);
        this.sound.play('select');
      });
      cards.push(c);
    });
    if (!items.length) desc.textContent = 'まだ何も持っていない。';
    select(0);
    this.input.clearPressed();
    return new Promise((resolve) => {
      const finish = (v: string | null) => {
        this.bookKeys = null;
        wrap.remove();
        resolve(v);
      };
      close.addEventListener('click', () => {
        this.sound.play('cancel');
        finish(null);
      });
      ok?.addEventListener('click', () => {
        if (!items.length) return;
        this.sound.play('confirm');
        finish(items[sel].id);
      });
      this.bookKeys = (a) => {
        if (a === 'left') select(sel - 1);
        if (a === 'right') select(sel + 1);
        if (a === 'cancel' || a === 'menu') close.click();
        if (a === 'confirm') (ok ?? close).click();
      };
    });
  }
  private bookKeys: ((a: 'left' | 'right' | 'cancel' | 'menu' | 'confirm') => void) | null = null;

  /** 手がかりを2つ選ばせる。やめたら null */
  logic(clues: ClueItem[], title: string, hint: string): Promise<[string, string] | null> {
    const wrap = el('div', 'logic', this.root);
    const panel = el('div', 'panel washi', wrap);
    el('h2', '', panel, escapeHtml(title));
    el('div', 'hint', panel, escapeHtml(hint));
    const list = el('div', 'clues', panel);
    const row = el('div', 'row', panel);
    row.style.cssText = 'display:flex;gap:calc(var(--vw) * 2);justify-content:flex-end';
    const cancel = el('div', 'btn', row, 'あとで');
    const ok = el('div', 'btn shu', row, 'つなげる');
    ok.setAttribute('disabled', '');
    const chosen: string[] = [];
    const nodes = new Map<string, HTMLElement>();
    clues.forEach((c) => {
      const n = el('div', 'clue', list, `<b>${escapeHtml(c.name)}</b>${escapeHtml(c.desc)}`);
      n.addEventListener('click', () => {
        const i = chosen.indexOf(c.id);
        if (i >= 0) chosen.splice(i, 1);
        else {
          chosen.push(c.id);
          if (chosen.length > 2) chosen.shift();
        }
        nodes.forEach((node, id) => node.classList.toggle('sel', chosen.includes(id)));
        ok.toggleAttribute('disabled', chosen.length !== 2);
        this.sound.play('select');
        this.sound.play('paper');
      });
      nodes.set(c.id, n);
    });
    this.sound.play('reveal');
    return new Promise((resolve) => {
      cancel.addEventListener('click', () => {
        this.sound.play('cancel');
        wrap.remove();
        resolve(null);
      });
      ok.addEventListener('click', () => {
        if (chosen.length !== 2) return;
        this.sound.play('confirm');
        wrap.remove();
        resolve([chosen[0], chosen[1]]);
      });
    });
  }

  /**
   * まとめるで2つの手がかりをつなぐ演出。左右から2枚のメモが飛んできてぶつかり、
   * つながれば光って「閃いた！」、つながらなければ弾かれる
   */
  async logicLink(a: string, b: string, ok: boolean): Promise<void> {
    const w = el('div', `link ${ok ? 'ok' : 'ng'}`, this.root);
    el('div', 'memo l washi', w, escapeHtml(a));
    el('div', 'memo r washi', w, escapeHtml(b));
    const wait = (ms: number) => new Promise((r) => setTimeout(r, this.skip ? ms * 0.4 : ms));
    this.sound.play('whoosh');
    await wait(420);
    this.sound.play('impact');
    if (ok) {
      el('div', 'flash', w);
      el('div', 'rays', w);
      // 火花（毎回ちがう向きに）
      for (let i = 0; i < 18; i++) {
        const p = el('i', 'spark', w);
        const ang = Math.random() * Math.PI * 2;
        const dist = 18 + Math.random() * 26;
        p.style.setProperty('--x', `${Math.cos(ang) * dist}vw`);
        p.style.setProperty('--y', `${Math.sin(ang) * dist * 0.8}vh`);
        p.style.animationDelay = `${Math.random() * 0.12}s`;
      }
      el('div', 'word', w, '閃いた！');
      this.sound.play('shine');
      await wait(1500);
    } else {
      el('div', 'word', w, '……つながらない');
      this.sound.play('wrong');
      await wait(900);
    }
    w.remove();
  }

  /** 毎フレーム呼ぶ。文字送りと決定入力を処理する。 */
  update(dt: number): void {
    this.portraits.left.update(dt);
    this.portraits.right.update(dt);
    // パネルを開いている間は会話を進めない（取消キーで一番上のパネルを閉じる）
    if (this.modal > 0) {
      if (this.input.consume('cancel')) this.cancelStack.at(-1)?.();
      return;
    }
    if (this.bookKeys) {
      for (const a of ['left', 'right', 'cancel', 'menu', 'confirm'] as const) if (this.input.consume(a)) this.bookKeys?.(a);
      return;
    }
    if (this.typing) {
      const t = this.typing;
      if (this.skip || this.input.consume('confirm')) t.shown = t.full.length;
      else {
        t.acc += dt * this.cps;
        const add = Math.floor(t.acc);
        if (add > 0) {
          t.acc -= add;
          const before = t.shown;
          t.shown = Math.min(t.full.length, t.shown + add);
          if (Math.floor(before / 2) !== Math.floor(t.shown / 2)) this.sound.play('blip');
        }
      }
      this.dlgText.textContent = t.full.slice(0, t.shown);
      if (t.shown >= t.full.length) {
        this.typing = null;
        t.done();
      }
      return;
    }
    if (this.confirmWaiters.length && this.input.consume('confirm')) {
      const ws = this.confirmWaiters;
      this.confirmWaiters = [];
      ws.forEach((w) => w());
    }
  }
}
