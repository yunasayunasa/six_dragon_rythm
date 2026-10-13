/**
 * 総合 PV・各話の更新予告のためのモーショングラフィックスの部品（2026-10-07）。
 * 参考にした表現（skillry.dev の Opus 5.5 動画事例から）:
 *   ・数字が立体で回転して現れる（spinNumeral）
 *   ・キネティック・タイポグラフィ＝文字が1字ずつ動いて意味を作る（ktext）
 *   ・マーカーで描くような手描きの線（marker）
 *   ・曲の波形を数値で解析して、拍に場面を合わせる（films/*.ts の grid。拍は tools で解析した値）
 * どれも PV の時刻から位置・透明度を計算する（コマ送りの撮影でずれない）。
 */
import { add, addFx, clock, div, ease, flash, H, inkSplat, inkWipe, rng, root, span, speedLines, W } from './timeline';
import type { CardPose } from './mg';

const px = (n: number) => `${n.toFixed(1)}px`;
type Font = 'brush' | 'mincho' | 'maru';
const FONT: Record<Font, string> = {
  brush: "'Yuji Syuku', serif",
  mincho: "'Shippori Mincho B1', serif",
  maru: "'Zen Maru Gothic', sans-serif",
};

// ---------------------------------------------------------------- 立体の数字
/**
 * 金の立体文字が回転しながら飛び込む（厚みは文字を奥へ重ねて作る）。
 * x,y は中心。sub は下に添える小さな文字。
 */
export function spinNumeral(text: string, start: number, dur: number, o: { x?: number; y?: number; size?: number; font?: Font; turns?: number; depth?: number; sub?: string; tilt?: number } = {}): void {
  const size = o.size ?? 420;
  const depth = o.depth ?? 18;
  const wrap = div('kit-spin');
  const body = div('body', '', wrap);
  body.style.fontFamily = FONT[o.font ?? 'mincho'];
  body.style.fontSize = px(size);
  const step = size / 150;
  for (let i = depth; i >= 1; i--) {
    const l = div('layer side', text, body);
    // 奥ほど暗い金
    const k = i / depth;
    l.style.color = `rgb(${Math.round(150 - 90 * k)},${Math.round(84 - 56 * k)},${Math.round(20 - 12 * k)})`;
    l.style.transform = `translateZ(${px(-i * step)})`;
  }
  div('layer glow', text, body);
  const front = div('layer front', text, body);
  const sub = o.sub ? div('kit-spin-sub', o.sub) : null;
  const x = o.x ?? W / 2;
  const y = o.y ?? H / 2;
  const turns = o.turns ?? 1.25;
  let hit = false;
  add({
    start,
    end: start + dur,
    el: wrap,
    update(t) {
      if (!hit && t >= 0.55) {
        hit = true;
        flash(0.3, '255,236,190', 0.55);
        speedLines(x, y, 0.5, { color: 'rgba(255,224,150,0.8)', inner: size * 0.55 });
      }
      const kIn = ease.outQuint(span(t, 0, 0.8));
      const out = ease.inCubic(span(t, dur - 0.35, dur));
      const rotY = (1 - kIn) * 360 * turns + Math.sin(t * 1.1) * 14 * kIn + out * 100;
      const rotX = (1 - kIn) * -30 + Math.sin(t * 0.8 + 1) * 5 + (o.tilt ?? 0);
      const s = (0.35 + 0.65 * ease.outBack(span(t, 0, 0.7))) * (1 + 0.04 * t);
      wrap.style.left = px(x - wrap.offsetWidth / 2);
      wrap.style.top = px(y - wrap.offsetHeight / 2);
      wrap.style.opacity = String(Math.min(1, t / 0.08) * (1 - out));
      body.style.transform = `rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) scale(${s.toFixed(3)})`;
      // 金の照り返しが流れる
      front.style.backgroundPosition = `${(-60 + ((t * 70) % 260)).toFixed(1)}% 0`;
      if (sub) {
        const sk = ease.outCubic(span(t, 0.5, 0.9));
        sub.style.left = px(x - sub.offsetWidth / 2);
        sub.style.top = px(y + size * 0.52 + (1 - sk) * 30);
        sub.style.opacity = String(sk * (1 - out));
        sub.style.letterSpacing = `${(0.6 - 0.25 * sk).toFixed(2)}em`;
      }
    },
    remove: () => sub?.remove(),
  });
}

// ---------------------------------------------------------------- キネティック文字
export interface KText {
  x?: number;
  y?: number;
  size?: number;
  font?: Font;
  color?: string;
  /** 縁取りの太さ（px）と色 */
  stroke?: number;
  strokeColor?: string;
  /** ずらした影の色（無ければ影なし） */
  shadow?: string;
  anim?: 'pop' | 'drop' | 'slide' | 'rise' | 'stamp' | 'zoom';
  /** 1字ずつの遅れ（秒） */
  stagger?: number;
  rot?: number;
  align?: 'center' | 'left' | 'right';
  /** 赤い札（白抜き文字）にする */
  boxed?: string;
  spacing?: number;
  z?: number;
  vertical?: boolean;
}
export function ktext(text: string, start: number, dur: number, o: KText = {}): HTMLElement {
  const el = div('kit-k');
  el.style.fontFamily = FONT[o.font ?? 'brush'];
  el.style.fontSize = px(o.size ?? 120);
  el.style.color = o.color ?? '#fffaf0';
  if (o.z) el.style.zIndex = String(o.z);
  if (o.vertical) el.style.writingMode = 'vertical-rl';
  if (o.spacing !== undefined) el.style.letterSpacing = `${o.spacing}em`;
  const st = o.stroke ?? (o.boxed ? 0 : 10);
  if (st) el.style.setProperty('-webkit-text-stroke', `${st}px ${o.strokeColor ?? '#120c10'}`);
  if (o.shadow) el.style.textShadow = `${px((o.size ?? 120) / 22)} ${px((o.size ?? 120) / 22)} 0 ${o.shadow}`;
  if (o.boxed) {
    el.classList.add('boxed');
    el.style.background = o.boxed;
  }
  el.innerHTML = [...text].map((c) => (c === '\n' ? '<br>' : `<span>${c === ' ' ? '&nbsp;' : c}</span>`)).join('');
  const chars = [...el.querySelectorAll('span')] as HTMLElement[];
  const r = rng(Math.round(start * 977) + text.length);
  const jit = chars.map(() => (r() - 0.5) * 2);
  const anim = o.anim ?? 'pop';
  const stagger = o.stagger ?? 0.045;
  const x = o.x ?? W / 2;
  const y = o.y ?? H / 2;
  let splat = false;
  add({
    start,
    end: start + dur,
    el,
    update(t) {
      const out = ease.inCubic(span(t, dur - 0.28, dur));
      if (anim === 'stamp' && !splat && t > 0.08) {
        splat = true;
        inkSplat(x, y, (o.size ?? 120) * 0.9, { color: 'rgba(184,50,42,0.55)', seed: Math.round(start * 50), life: dur, drops: 10 });
      }
      chars.forEach((c, i) => {
        const k = span(t, i * stagger, i * stagger + (anim === 'stamp' ? 0.18 : 0.38));
        let tr = '';
        let op = Math.min(1, k * 3);
        let blur = 0;
        if (anim === 'pop') {
          const b = ease.outBack(k);
          tr = `scale(${b.toFixed(3)}) rotate(${(jit[i] * 14 * (1 - k)).toFixed(1)}deg)`;
        } else if (anim === 'drop') {
          tr = `translateY(${px(-140 * (1 - ease.outBack(k)))}) rotate(${(jit[i] * 10 * (1 - k)).toFixed(1)}deg)`;
        } else if (anim === 'slide') {
          const e = ease.outQuint(k);
          tr = `translateX(${px(160 * (1 - e))}) skewX(${(-24 * (1 - e)).toFixed(1)}deg)`;
          blur = (1 - e) * 10;
        } else if (anim === 'rise') {
          const e = ease.outCubic(k);
          tr = `translateY(${px(46 * (1 - e))})`;
          blur = (1 - e) * 9;
          op = e;
        } else if (anim === 'zoom') {
          const e = ease.outQuint(k);
          tr = `scale(${(2.6 - 1.6 * e).toFixed(3)})`;
          blur = (1 - e) * 14;
          op = e;
        } else {
          const e = ease.outQuint(k);
          tr = `scale(${(2.2 - 1.2 * e).toFixed(3)})`;
          op = Math.min(1, k * 5);
        }
        // 出ていくときは上へ抜ける
        if (out > 0) tr += ` translateY(${px(-30 * out)})`;
        c.style.transform = tr;
        c.style.opacity = String(op * (1 - out));
        c.style.filter = blur > 0.2 ? `blur(${px(blur)})` : '';
      });
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const left = o.align === 'left' ? x : o.align === 'right' ? x - w : x - w / 2;
      const shake = anim === 'stamp' && t < 0.3 ? Math.sin(t * 90) * 8 * (1 - t / 0.3) : 0;
      el.style.left = px(left + shake);
      el.style.top = px(y - h / 2);
      el.style.transform = `rotate(${o.rot ?? 0}deg)`;
    },
  });
  return el;
}

// ---------------------------------------------------------------- マーカーの線
/**
 * 朱の筆で描くように、線が少しずつ伸びる。kind:
 *   circle … x,y を中心に w×h の楕円で囲む / underline … x から w の長さの下線 / strike … 取り消し線（斜め）/ check … レ点
 */
export function marker(kind: 'circle' | 'underline' | 'strike' | 'check', start: number, dur: number, o: { x: number; y: number; w: number; h?: number; color?: string; width?: number; draw?: number; seed?: number; front?: boolean }): void {
  const r = rng(o.seed ?? Math.round(o.x * 3 + o.y * 7));
  const pts: [number, number][] = [];
  const N = 90;
  const h = o.h ?? o.w * 0.4;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    if (kind === 'circle') {
      // 少し行き過ぎて重なる、手描きの楕円
      const a = -Math.PI * 0.62 + u * Math.PI * 2.18;
      const wob = 1 + 0.05 * Math.sin(u * 9 + r() * 0.2) + u * 0.07;
      pts.push([o.x + Math.cos(a) * (o.w / 2) * wob, o.y + Math.sin(a) * (h / 2) * wob]);
    } else if (kind === 'underline') {
      pts.push([o.x + u * o.w, o.y + Math.sin(u * 3.2) * 6 - u * 10]);
    } else if (kind === 'strike') {
      pts.push([o.x - o.w / 2 + u * o.w, o.y + h / 2 - u * h + Math.sin(u * 5) * 4]);
    } else {
      // レ点：短く下りて、長く跳ね上げる
      const p = u < 0.3 ? [o.x - o.w * 0.5 + (u / 0.3) * o.w * 0.25, o.y + (u / 0.3) * h * 0.5] : [o.x - o.w * 0.25 + ((u - 0.3) / 0.7) * o.w * 0.75, o.y + h * 0.5 - ((u - 0.3) / 0.7) * h * 1.3];
      pts.push(p as [number, number]);
    }
  }
  const bristles = Array.from({ length: 7 }, (_, j) => ({ off: (j - 3) / 3.5, a: 0.55 + r() * 0.4, w: 0.5 + r() * 0.7, jit: (r() - 0.5) * 2 }));
  const color = o.color ?? '200,40,32';
  const width = o.width ?? 16;
  const draw = o.draw ?? 0.32;
  addFx({
    start,
    life: dur,
    front: o.front ?? true,
    draw(ctx, t) {
      const k = ease.outCubic(span(t, 0, draw));
      const fade = 1 - span(t, dur - 0.3, dur);
      const n = Math.max(1, Math.floor(k * N));
      ctx.lineCap = 'round';
      for (const b of bristles) {
        ctx.strokeStyle = `rgba(${color},${(b.a * fade).toFixed(3)})`;
        for (let i = 1; i <= n; i++) {
          const [x0, y0] = pts[i - 1];
          const [x1, y1] = pts[i];
          const dx = x1 - x0;
          const dy = y1 - y0;
          const len = Math.hypot(dx, dy) || 1;
          // 進む向きに直角へずらして、筆の毛の束にする
          const nx = -dy / len;
          const ny = dx / len;
          const u = i / N;
          const taper = 0.35 + 0.65 * Math.sqrt(Math.sin(Math.PI * Math.min(1, u * 1.05)));
          const off = b.off * width * 0.5 * taper + b.jit;
          ctx.lineWidth = width * 0.32 * b.w * taper;
          ctx.beginPath();
          ctx.moveTo(x0 + nx * off, y0 + ny * off);
          ctx.lineTo(x1 + nx * off, y1 + ny * off);
          ctx.stroke();
        }
      }
    },
  });
}

// ---------------------------------------------------------------- 連続更新の札
const KANJI = ['', '一', '二', '三', '四', '五'];
/** 「5ヶ月連続更新企画 第N弾」の札（左上）。5つの丸で今どこかを見せる */
export function seriesBadge(n: number, start: number, dur: number, o: { x?: number; y?: number; scale?: number } = {}): void {
  const el = div('kit-badge', `<div class="t">5ヶ月連続更新企画</div><div class="n"><small>第</small>${KANJI[n]}<small>弾</small></div><div class="dots">${[1, 2, 3, 4, 5].map((i) => `<i class="${i < n ? 'past' : i === n ? 'now' : ''}"></i>`).join('')}</div>`);
  const x = o.x ?? 64;
  const y = o.y ?? 54;
  let hit = false;
  add({
    start,
    end: start + dur,
    el,
    update(t) {
      if (!hit && t > 0.1) {
        hit = true;
        inkSplat(x + 150, y + 90, 110, { color: 'rgba(184,50,42,0.5)', seed: 77 + n, life: 1.2, drops: 9 });
      }
      const k = ease.outQuint(span(t, 0, 0.22));
      const out = span(t, dur - 0.3, dur);
      el.style.left = px(x);
      el.style.top = px(y);
      el.style.opacity = String(Math.min(1, t / 0.06) * (1 - out));
      el.style.transform = `rotate(${(-3 - 6 * (1 - k)).toFixed(2)}deg) scale(${((o.scale ?? 1) * (1.9 - 0.9 * k)).toFixed(3)})`;
    },
  });
}

// ---------------------------------------------------------------- 全5話の札
export interface LineupCard {
  cover: string;
  label: string;
  /** 札の下の小さな札（公開中・第N弾 など） */
  chip: string;
  hot?: boolean;
}
/** 5枚の扉絵が並ぶ。flips[i] の時刻に裏返って絵が見える（無ければ最初から表） */
export function lineup(cards: LineupCard[], start: number, dur: number, o: { y?: number; flips?: number[]; current?: number; zoom?: boolean } = {}): void {
  const wrap = div('kit-lineup');
  const els = cards.map((c, i) => {
    const card = div(`card${c.hot ? ' hot' : ''}`, '', wrap);
    div('face back', `<b>第${KANJI[i + 1]}弾</b><small>COMING</small>`, card);
    div('face front', `<img src="${c.cover}"><span class="lb">${c.label}</span>`, card);
    const chip = div('chip', c.chip, card);
    return { card, chip, back: card.children[0] as HTMLElement, front: card.children[1] as HTMLElement };
  });
  const y = o.y ?? 470;
  add({
    start,
    end: start + dur,
    el: wrap,
    update(t) {
      const out = ease.inCubic(span(t, dur - 0.3, dur));
      wrap.style.top = px(y - 150);
      wrap.style.opacity = String(1 - out);
      wrap.style.transform = o.zoom ? `scale(${(1 + 0.05 * span(t, 0, dur)).toFixed(4)})` : '';
      els.forEach(({ card, chip, back, front }, i) => {
        const inK = ease.outBack(span(t, i * 0.07, i * 0.07 + 0.45));
        const flipAt = o.flips?.[i];
        const fk = flipAt === undefined ? 1 : ease.outBack(span(clock.t, flipAt, flipAt + 0.42));
        const cur = o.current === i + 1;
        const s = cur ? 1.12 : 1;
        card.style.left = px(75 + i * 360);
        card.style.transform = `translateY(${px((1 - inK) * 500 + out * -60)}) rotateY(${((1 - fk) * 180).toFixed(1)}deg) rotateZ(${((i - 2) * 1.2).toFixed(1)}deg) scale(${s})`;
        card.style.opacity = String(Math.min(1, inK * 2));
        card.style.filter = o.current && !cur ? 'brightness(0.55) saturate(0.7)' : '';
        chip.style.opacity = String(ease.outCubic(span(clock.t, (flipAt ?? start) + 0.25, (flipAt ?? start) + 0.5)));
        // 裏と表は角度で出し分ける（backface-visibility は親が平らに描かれると効かないため）
        const showFront = fk > 0.5;
        front.style.visibility = showFront ? 'visible' : 'hidden';
        back.style.visibility = showFront ? 'hidden' : 'visible';
      });
    },
  });
}

// ---------------------------------------------------------------- 各話の扉絵（総合 PV の連打）
/** 扉絵が斜めに切り込んで現れ、話数と題名が乗る。dir=1 で右から */
export function epPanel(o: { cover: string; num: string; title: string; chip: string; start: number; dur: number; dir?: 1 | -1; color?: string }): void {
  const p = div('kit-ep');
  const img = document.createElement('img');
  img.src = o.cover;
  p.appendChild(img);
  const sweep = div('sweep', '', p);
  const band = div('band', '', p);
  band.style.background = o.color ?? '#b8322a';
  const num = div('num', o.num, p);
  const title = div('title', [...o.title].map((c) => `<span>${c}</span>`).join(''), p);
  const chip = div('chip', o.chip, p);
  const chars = [...title.querySelectorAll('span')] as HTMLElement[];
  const dir = o.dir ?? 1;
  add({
    start: o.start,
    end: o.start + o.dur,
    el: p,
    update(t) {
      const k = ease.outQuint(span(t, 0, 0.32));
      // 斜めの切り口が横切って全面になる
      const edge = (1 - k) * 130;
      const a = dir > 0 ? `${(edge + 0).toFixed(1)}% 0, 100% 0, 100% 100%, ${(edge - 30).toFixed(1)}% 100%` : `0 0, ${(100 - edge + 30).toFixed(1)}% 0, ${(100 - edge).toFixed(1)}% 100%, 0 100%`;
      p.style.clipPath = `polygon(${a})`;
      img.style.transform = `scale(${(1.16 - 0.08 * span(t, 0, o.dur)).toFixed(4)}) translateX(${px(dir * -30 * span(t, 0, o.dur))})`;
      sweep.style.transform = `translateX(${px(-900 + span(t, 0.15, 0.9) * 3200)}) skewX(-20deg)`;
      const bk = ease.outQuint(span(t, 0.12, 0.4));
      band.style.transform = `scaleX(${bk.toFixed(3)})`;
      const nk = ease.outBack(span(t, 0.1, 0.42));
      num.style.transform = `translateX(${px((1 - nk) * -200)}) rotate(-4deg)`;
      num.style.opacity = String(Math.min(1, nk * 2));
      chars.forEach((c, i) => {
        const ck = ease.outCubic(span(t, 0.2 + i * 0.03, 0.45 + i * 0.03));
        c.style.opacity = String(ck);
        c.style.transform = `translateY(${px((1 - ck) * 36)})`;
        c.style.filter = ck < 0.95 ? `blur(${px((1 - ck) * 8)})` : '';
      });
      const chk = ease.outBack(span(t, 0.38, 0.6));
      chip.style.transform = `scale(${chk.toFixed(3)}) rotate(-6deg)`;
    },
  });
}

// ---------------------------------------------------------------- 新しい顔ぶれ
export interface CastEntry {
  pose: CardPose;
  name: string;
  color: string;
  role?: string;
}
/** 縦長の札が下から順に差し込まれ、新しい人物が並ぶ。per 秒ごとに1人 */
export function castRush(list: CastEntry[], start: number, dur: number, o: { per?: number; title?: string } = {}): void {
  const per = o.per ?? 0.16;
  const n = list.length;
  const wPanel = W / n;
  const wrap = div('kit-rush');
  const panels = list.map((c, i) => {
    const p = div('p', '', wrap);
    p.style.setProperty('--c', c.color);
    p.style.left = px(i * wPanel - 40);
    p.style.width = px(wPanel + 80);
    const fig = div('fig', '', p);
    fig.style.aspectRatio = `${c.pose.width} / ${c.pose.height}`;
    if (c.pose.artFacing === (i < n / 2 ? -1 : 1)) fig.style.transform = 'scaleX(-1)';
    const img = (url: string, part?: { x: number; y: number; w: number; h: number }) => {
      const im = document.createElement('img');
      im.src = url;
      if (part) {
        im.style.left = `${(part.x / c.pose.width) * 100}%`;
        im.style.top = `${(part.y / c.pose.height) * 100}%`;
        im.style.width = `${(part.w / c.pose.width) * 100}%`;
        im.style.height = `${(part.h / c.pose.height) * 100}%`;
      } else im.className = 'base';
      fig.appendChild(im);
    };
    img(c.pose.base);
    if (c.pose.eyes) img(c.pose.eyes.url, c.pose.eyes);
    if (c.pose.mouth.closed) img(c.pose.mouth.closed.url, c.pose.mouth.closed);
    const nm = div('nm', c.name, p);
    nm.style.fontSize = px(Math.min(96, 640 / c.name.length));
    if (c.role) div('role', c.role, p);
    return p;
  });
  const title = o.title ? div('kit-rush-title', o.title) : null;
  add({
    start,
    end: start + dur,
    el: wrap,
    update(t) {
      panels.forEach((p, i) => {
        const k = ease.outQuint(span(t, i * per, i * per + 0.4));
        const out = ease.inCubic(span(t, dur - 0.4 + i * 0.03, dur - 0.1 + i * 0.03));
        p.style.transform = `translateY(${px((1 - k) * (i % 2 ? -1150 : 1150) + out * (i % 2 ? 1150 : -1150))})`;
        const fig = p.querySelector('.fig') as HTMLElement;
        fig.style.translate = `calc(-50% + ${px(Math.sin(t * 0.7 + i) * 6 - t * 10)}) 0`;
      });
      if (title) {
        const k = ease.outBack(span(t, 0.2, 0.5));
        const out = span(t, dur - 0.35, dur - 0.1);
        title.style.left = px(W / 2 - title.offsetWidth / 2);
        title.style.top = px(70);
        title.style.opacity = String(Math.min(1, k) * (1 - out));
        title.style.transform = `rotate(-3deg) scale(${(0.5 + 0.5 * k).toFixed(3)})`;
      }
    },
    remove: () => title?.remove(),
  });
}

// ---------------------------------------------------------------- セリフの字幕
/** 話し手の名札つきのセリフ（声に合わせて文字が出る）。下側の帯 */
export function caption(name: string, text: string, color: string, start: number, voiceLen: number, o: { y?: number; hold?: number; until?: number } = {}): void {
  const el = div('kit-cap', `<b>${name}</b><span></span>`);
  el.style.setProperty('--c', color);
  const span1 = el.querySelector('span') as HTMLElement;
  const dur = Math.min(voiceLen + (o.hold ?? 0.45), (o.until ?? Infinity) - start);
  add({
    start,
    end: start + dur,
    el,
    update(t) {
      const k = ease.outBack(span(t, 0, 0.3));
      const out = span(t, dur - 0.25, dur);
      el.style.left = px(W / 2 - el.offsetWidth / 2);
      el.style.top = px((o.y ?? 870) + (1 - Math.min(1, k)) * 40);
      el.style.opacity = String(Math.min(1, k * 2) * (1 - out));
      const shown = Math.ceil(Math.min(1, t / Math.max(0.4, voiceLen - 0.3)) * text.length);
      span1.textContent = text.slice(0, shown);
    },
  });
}

// ---------------------------------------------------------------- 締めの一枚（各話）
/**
 * 更新予告の終わり：扉絵を背景に、話数が回って現れ、題名が筆で書かれ、朱の下線。stampAt で「近日更新」の判が押される。
 */
export function titleCard(o: { cover: string; logo: string; n: number; num: string; title: string; stamp: string; start: number; dur: number; stampAt: number; url?: string }): void {
  const bg = document.createElement('img');
  bg.src = o.cover;
  bg.className = 'kit-tc-bg';
  root.appendChild(bg);
  const shade = div('kit-tc-shade');
  const logo = document.createElement('img');
  logo.src = o.logo;
  logo.className = 'kit-tc-logo';
  root.appendChild(logo);
  const num = div('kit-tc-num', o.num);
  const title = div('kit-tc-title', [...o.title].map((c) => (c === '、' || c === '，' ? `<span class="p">${c}</span>` : `<span>${c}</span>`)).join(''));
  title.style.fontSize = px(Math.min(130, 1500 / o.title.length));
  const chars = [...title.querySelectorAll('span')] as HTMLElement[];
  const stamp = div('kit-tc-stamp', o.stamp);
  const url = div('kit-tc-url', o.url ?? 'yunasayunasa.github.io/Six_dragon_gyakuten');
  let underlined = false;
  let stamped = false;
  const parts = [shade, logo, num, title, stamp, url];
  add({
    start: o.start,
    end: o.start + o.dur,
    el: bg,
    update(t) {
      // 終わりは消さずに、この絵のまま動画を終える
      const fade = span(t, 0, 0.35);
      bg.style.opacity = String(fade);
      bg.style.transform = `scale(${(1.14 - 0.1 * span(t, 0, o.dur)).toFixed(4)})`;
      shade.style.opacity = String(fade);
      const lk = ease.outCubic(span(t, 0.1, 0.6));
      logo.style.opacity = String(lk * fade);
      logo.style.transform = `translateY(${px((1 - lk) * -20)})`;
      const nk = ease.outBack(span(t, 0.15, 0.5));
      num.style.opacity = String(Math.min(1, nk * 2) * fade);
      num.style.transform = `translateX(-50%) scale(${(0.6 + 0.4 * nk).toFixed(3)})`;
      chars.forEach((c, i) => {
        const ck = ease.outQuint(span(t, 0.35 + i * 0.055, 0.6 + i * 0.055));
        c.style.opacity = String(Math.min(1, ck * 1.5) * fade);
        c.style.transform = `scale(${(1.8 - 0.8 * ck).toFixed(3)})`;
        c.style.filter = ck < 0.95 ? `blur(${px((1 - ck) * 10)})` : '';
      });
      const tEnd = 0.6 + chars.length * 0.055;
      if (!underlined && t > tEnd) {
        underlined = true;
        const r = title.getBoundingClientRect();
        marker('underline', clock.t, o.dur - t + 0.5, { x: r.left + 10, y: r.bottom + 6, w: r.width - 20, width: 18, draw: 0.4 });
      }
      title.style.left = px(W / 2 - title.offsetWidth / 2);
      if (!stamped && clock.t >= o.stampAt) {
        stamped = true;
        flash(0.35, '255,240,220', 0.7);
        inkSplat(W - 330, 820, 170, { color: 'rgba(184,50,42,0.8)', seed: 11 + o.n, life: o.dur, drops: 16 });
        speedLines(W - 330, 820, 0.5, { color: 'rgba(255,250,240,0.85)', inner: 200 });
      }
      const sk = ease.outQuint(span(clock.t, o.stampAt, o.stampAt + 0.16));
      stamp.style.opacity = String(clock.t >= o.stampAt ? fade : 0);
      stamp.style.transform = `rotate(-12deg) scale(${(2.4 - 1.4 * sk).toFixed(3)})`;
      url.style.opacity = String(ease.outCubic(span(t, 1.2, 1.8)) * fade);
    },
    remove: () => parts.forEach((x) => x.remove()),
  });
}

// ---------------------------------------------------------------- 灯りが消えていく（第五話）
/** 夜空の灯りが、ひとつ、またひとつ消える。offs[i] で i 番目が消える（PV の秒） */
export function lightsOut(start: number, dur: number, o: { count?: number; first?: number; last?: number; seed?: number } = {}): void {
  const r = rng(o.seed ?? 5);
  const n = o.count ?? 46;
  const first = o.first ?? start + 0.6;
  const last = o.last ?? start + dur - 0.8;
  const lights = Array.from({ length: n }, () => ({ x: 60 + r() * (W - 120), y: 60 + Math.pow(r(), 1.6) * 560, s: 3 + r() * 7, ph: r() * 6.28, off: 0 }));
  // 右から左へ、ばらつきをつけて消える
  const order = lights.map((l, i) => [l.x + r() * 500, i] as const).sort((a, b) => b[0] - a[0]);
  order.forEach(([, i], k) => (lights[i].off = first + (k / (n - 1)) * (last - first)));
  addFx({
    start,
    life: dur,
    draw(ctx, t) {
      const fade = Math.min(span(t, 0, 0.5), 1 - span(t, dur - 0.4, dur));
      ctx.globalCompositeOperation = 'lighter';
      for (const l of lights) {
        const since = clock.t - l.off;
        // 消える直前に一度強く瞬き、すっと消える
        const k = since < 0 ? 1 : since < 0.12 ? 1.6 : Math.max(0, 1 - (since - 0.12) / 0.35);
        if (k <= 0) continue;
        const tw = 0.75 + 0.25 * Math.sin(t * 4 + l.ph);
        const rad = l.s * 5 * (since > 0 && since < 0.12 ? 1.5 : 1);
        const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, rad);
        g.addColorStop(0, `rgba(255,226,160,${(0.95 * k * tw * fade).toFixed(3)})`);
        g.addColorStop(0.25, `rgba(255,180,90,${(0.45 * k * tw * fade).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,160,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(l.x, l.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      // 消えたあとの細い煙
      ctx.globalCompositeOperation = 'source-over';
      for (const l of lights) {
        const since = clock.t - l.off;
        if (since < 0.1 || since > 1.6) continue;
        const a = (1 - since / 1.6) * 0.35 * fade;
        ctx.strokeStyle = `rgba(200,200,220,${a.toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.quadraticCurveTo(l.x + Math.sin(since * 3 + l.ph) * 8, l.y - since * 30, l.x + Math.sin(since * 2 + l.ph) * 14, l.y - since * 60);
        ctx.stroke();
      }
    },
  });
}

// ---------------------------------------------------------------- 画面を暗くする
export function shade(start: number, dur: number, o: { alpha?: number; color?: string; fadeIn?: number; fadeOut?: number } = {}): void {
  const el = div('kit-shade');
  add({
    start,
    end: start + dur,
    el,
    update(t) {
      const k = span(t, 0, o.fadeIn ?? 0.3) * (1 - span(t, dur - (o.fadeOut ?? 0.3), dur));
      el.style.background = o.color ?? '#07040a';
      el.style.opacity = String((o.alpha ?? 0.6) * k);
    },
  });
}

/** ktext で出した文字の from〜to 字目（0始まり、to は含まない）に、マーカーの線を引く。字が落ち着いてから呼ぶ */
export function markText(el: HTMLElement, from: number, to: number, kind: 'circle' | 'underline' | 'strike', start: number, dur: number, o: { color?: string; width?: number; pad?: number } = {}): void {
  const spans = [...el.querySelectorAll('span')].slice(from, to);
  const rs = spans.map((s) => s.getBoundingClientRect());
  const l = Math.min(...rs.map((r) => r.left));
  const r = Math.max(...rs.map((x) => x.right));
  const t = Math.min(...rs.map((x) => x.top));
  const b = Math.max(...rs.map((x) => x.bottom));
  const pad = o.pad ?? 18;
  if (kind === 'circle') marker('circle', start, dur, { x: (l + r) / 2, y: (t + b) / 2, w: r - l + pad * 3, h: b - t + pad * 2, color: o.color, width: o.width });
  else if (kind === 'underline') marker('underline', start, dur, { x: l - pad / 2, y: b + 4, w: r - l + pad, color: o.color, width: o.width });
  else marker('strike', start, dur, { x: (l + r) / 2, y: (t + b) / 2, w: r - l + pad, h: (b - t) * 0.5, color: o.color, width: o.width });
}

/** 場面転換の墨の帯（段の数を増やし、遅れのばらつきを小さくして、階段のように見えないようにしたもの） */
export function wipe(seconds = 0.7, opts: Parameters<typeof inkWipe>[1] = {}): void {
  // 真っ黒な時間が長く見えないよう 0.5 秒に縮める（覆い切る時刻＝at + seconds/2 は変えない）
  const cover = (opts.at ?? clock.t) + seconds / 2;
  inkWipe(0.5, { rows: 18, lag: 0.05, ...opts, at: cover - 0.25 });
}
