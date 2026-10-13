/** PV のモーショングラフィックスの部品（どれも PV の時刻から位置・透明度を計算する） */
import * as THREE from 'three';
import { add, clock, div, ease, embers, flash, H, inkSplat, rng, span, speedLines, W } from './timeline';

const px = (n: number) => `${n.toFixed(1)}px`;

/** 映画のような上下の黒帯 */
export function letterbox(start: number, end: number, h = 92): void {
  for (const side of ['top', 'bottom']) {
    const el = div(`pv-box ${side}`);
    add({
      start,
      end: end + 0.6,
      el,
      update(t) {
        const k = ease.outCubic(t / 0.7) * (1 - ease.inOut(span(t, end - start, end - start + 0.6)));
        el.style.height = px(h * k);
      },
    });
  }
}

/** ナレーションの字幕（1文字ずつ浮かび上がる） */
let currentSub: { cut(at: number): void } | null = null;
export function subtitle(text: string, start: number, dur: number): void {
  currentSub?.cut(start);
  const el = div('pv-sub', [...text].map((c) => `<span>${c === ' ' ? '&nbsp;' : c}</span>`).join(''));
  const spans = [...el.querySelectorAll('span')] as HTMLElement[];
  const it = add({
    start,
    end: start + dur,
    el,
    update(t) {
      const out = 1 - span(t, dur - 0.35, dur);
      spans.forEach((s, i) => {
        const k = ease.outCubic(span(t, i * 0.035, i * 0.035 + 0.4));
        s.style.opacity = String(k * out);
        s.style.transform = `translateY(${px((1 - k) * 18)})`;
        s.style.filter = `blur(${px((1 - k) * 6)})`;
      });
    },
  });
  const me = { cut: (at: number) => (it.end = Math.min(it.end ?? at, at)) };
  currentSub = me;
}

/** 大きな筆文字を叩きつける。x,y は文字の中心 */
export function slam(text: string, start: number, dur: number, o: { x?: number; y?: number; size?: number; rot?: number; color?: string; shadow?: string; splat?: boolean } = {}): void {
  const el = div('pv-slam', text);
  el.style.fontSize = px(o.size ?? 230);
  if (o.color) el.style.color = o.color;
  if (o.shadow) el.style.textShadow = `10px 10px 0 ${o.shadow}`;
  const x = o.x ?? W / 2;
  const y = o.y ?? H / 2;
  let splatted = false;
  add({
    start,
    end: start + dur,
    el,
    update(t) {
      if (!splatted) {
        splatted = true;
        if (o.splat !== false) inkSplat(x, y, (o.size ?? 230) * 0.85, { seed: Math.round(start * 100), color: 'rgba(184,50,42,0.72)', life: dur + 0.2, drops: 12 });
      }
      const k = ease.outQuint(t / 0.16);
      const out = span(t, dur - 0.22, dur);
      const shake = t < 0.3 ? Math.sin(t * 90) * 10 * (1 - t / 0.3) : 0;
      const s = (1 + 1.6 * (1 - k)) * (1 + out * 0.08) * (1 + 0.03 * Math.sin(t * 2));
      el.style.opacity = String(Math.min(1, t / 0.05) * (1 - out));
      el.style.filter = `blur(${px((1 - k) * 12)})`;
      el.style.left = px(x - el.offsetWidth / 2 + shake);
      el.style.top = px(y - el.offsetHeight / 2);
      el.style.transform = `rotate(${o.rot ?? -4}deg) scale(${s})`;
    },
  });
}

/** 地名の縦書き */
export function placeCard(name: string, sub: string, start: number, dur: number): void {
  const el = div('pv-place', `<span class="n">${[...name].map((c) => `<span>${c}</span>`).join('')}</span>`);
  const chars = [...el.querySelectorAll('.n span')] as HTMLElement[];
  add({
    start,
    end: start + dur,
    el,
    update(t) {
      const out = 1 - span(t, dur - 0.5, dur);
      chars.forEach((c, i) => {
        const k = ease.outCubic(span(t, 0.1 + i * 0.12, 0.6 + i * 0.12));
        c.style.display = 'inline-block';
        c.style.opacity = String(k * out);
        c.style.transform = `translateY(${px((1 - k) * -40)})`;
        c.style.filter = `blur(${px((1 - k) * 8)})`;
      });
    },
  });
  const seal = div('pv-seal', sub);
  add({
    start: start + 0.7,
    end: start + dur,
    el: seal,
    update(t) {
      const k = ease.outBack(t / 0.25);
      seal.style.left = px(W - 300);
      seal.style.top = px(820);
      seal.style.opacity = String(Math.min(1, t / 0.08) * (1 - span(t, dur - 1.2, dur - 0.7)));
      seal.style.transform = `rotate(-8deg) scale(${2.2 - 1.2 * k})`;
    },
  });
}

/** 舞台の役者の頭の上に名札を出す */
export function nameTag(text: string, color: string, target: () => THREE.Vector3, camera: THREE.Camera, start: number, dur: number): void {
  const el = div('pv-tag', text);
  el.style.background = color;
  const v = new THREE.Vector3();
  add({
    start,
    end: start + dur,
    el,
    update(t) {
      v.copy(target()).project(camera);
      const k = ease.outBack(t / 0.3);
      el.style.left = px(((v.x + 1) / 2) * W);
      el.style.top = px(((1 - v.y) / 2) * H - 10);
      el.style.opacity = String(Math.min(1, t / 0.1) * (1 - span(t, dur - 0.3, dur)));
      el.style.transform = `translate(-50%, -100%) scale(${0.3 + 0.7 * k})`;
    },
  });
}

export interface CardPose {
  base: string;
  width: number;
  height: number;
  artFacing: 1 | -1;
  eyes?: { url: string; x: number; y: number; w: number; h: number };
  mouth: Partial<Record<'open' | 'half' | 'closed', { url: string; x: number; y: number; w: number; h: number }>>;
}

/** キャラ紹介のカード。voiceAt〜voiceAt+voiceLen の間は口が動く */
export function charCard(o: { name: string; role: string; color: string; color2: string; pose: CardPose; quote: string; start: number; dur: number; voiceAt: number; voiceLen: number; seed: number }): void {
  const root = div('pv-cc');
  root.style.setProperty('--c', o.color);
  root.style.setProperty('--c2', o.color2);
  const band = div('band', '', root);
  const edge = div('edge', '', root);
  const edge2 = div('edge2', '', root);
  const fig = div('fig', '', root);
  fig.style.aspectRatio = `${o.pose.width} / ${o.pose.height}`;
  // 左向きの絵にそろえる（カードの左側を向く）
  if (o.pose.artFacing === 1) fig.style.transform = 'scaleX(-1)';
  const img = (url: string, part?: { x: number; y: number; w: number; h: number }, cls = '') => {
    const i = document.createElement('img');
    i.src = url;
    i.className = cls;
    if (part) {
      i.style.left = `${(part.x / o.pose.width) * 100}%`;
      i.style.top = `${(part.y / o.pose.height) * 100}%`;
      i.style.width = `${(part.w / o.pose.width) * 100}%`;
      i.style.height = `${(part.h / o.pose.height) * 100}%`;
    }
    fig.appendChild(i);
    return i;
  };
  img(o.pose.base, undefined, 'base');
  if (o.pose.eyes) img(o.pose.eyes.url, o.pose.eyes);
  const mouths = (['closed', 'half', 'open'] as const).map((k) => (o.pose.mouth[k] ? img(o.pose.mouth[k]!.url, o.pose.mouth[k]) : null));
  const name = div('name', [...o.name].map((c) => `<span>${c}</span>`).join(''), root);
  name.style.fontSize = px(Math.min(170, 900 / o.name.length));
  const nameChars = [...name.querySelectorAll('span')] as HTMLElement[];
  const role = div('role', o.role, root);
  const quote = div('quote', `<b>${o.name}</b><span></span>`, root);
  const qText = quote.querySelector('span') as HTMLElement;
  const figW = 1040 * (o.pose.width / o.pose.height);
  let hit = false;
  add({
    start: o.start,
    end: o.start + o.dur,
    el: root,
    update(t) {
      if (!hit && t >= 0.18) {
        hit = true;
        speedLines(1480, 520, 0.45, { color: 'rgba(255,248,236,0.85)', inner: 420 });
      }
      const inK = ease.outQuint(t / 0.32);
      const outK = ease.inCubic(span(t, o.dur - 0.32, o.dur));
      const slide = (1 - inK) * 1100 - outK * 1500;
      band.style.transform = `translateX(${px(slide)})`;
      edge.style.transform = `translateX(${px(slide * 1.08)})`;
      edge2.style.transform = `translateX(${px(slide * 1.16)})`;
      // 立ち絵は少し遅れて入り、ゆっくり流れる（奥行き）
      const figIn = ease.outCubic(span(t, 0.05, 0.5));
      fig.style.left = px(1330 - figW / 2 + (1 - figIn) * 700 - t * 18 - outK * 1700);
      fig.style.opacity = String(Math.min(1, figIn * 1.5));
      nameChars.forEach((c, i) => {
        const k = ease.outBack(span(t, 0.22 + i * 0.07, 0.5 + i * 0.07));
        c.style.opacity = String(Math.min(1, k * 1.4) * (1 - outK));
        c.style.transform = `translateY(${px((1 - k) * -70)}) scale(${1 + (1 - Math.min(1, k)) * 0.6})`;
      });
      name.style.transform = `translateX(${px(-outK * 900)})`;
      const rk = ease.outCubic(span(t, 0.45, 0.8));
      role.style.opacity = String(rk * (1 - outK));
      role.style.transform = `translateY(${px((1 - rk) * 40)})`;
      // セリフの吹き出し：声に合わせて文字が出る
      const qk = ease.outBack(span(t, 0.35, 0.65));
      quote.style.opacity = String(Math.min(1, qk) * (1 - outK));
      quote.style.transform = `translateX(${px(-outK * 600)}) scale(${0.6 + 0.4 * qk})`;
      const vt = clock.t - o.voiceAt;
      const shown = Math.max(0, Math.min(o.quote.length, Math.ceil((vt / Math.max(0.5, o.voiceLen - 0.4)) * o.quote.length)));
      qText.textContent = o.quote.slice(0, shown);
      // 口パク
      const talking = vt > 0 && vt < o.voiceLen - 0.15;
      const r = rng(Math.floor(clock.t * 12) + o.seed)();
      const m = talking ? (r < 0.4 ? 2 : r < 0.75 ? 1 : 0) : 0;
      mouths.forEach((el, i) => el && (el.style.visibility = i === m ? 'visible' : 'hidden'));
    },
  });
}

/** 証拠品を手に入れたカード（くるっと回って現れる） */
export function evidenceCard(image: string, name: string, start: number, dur: number, x = 1340, y = 520): void {
  const el = div('pv-card', `<div class="k">証拠品</div><img src="${image}"><div class="n">${name}</div>`);
  let lit = false;
  add({
    start,
    end: start + dur,
    el,
    update(t) {
      if (!lit && t > 0.05) {
        lit = true;
        speedLines(x, y, 0.6, { color: 'rgba(255,214,120,0.75)', inner: 300 });
        flash(0.25, '255,236,190', 0.5);
      }
      const k = ease.outBack(t / 0.45);
      const out = span(t, dur - 0.25, dur);
      el.style.left = px(x - 286);
      el.style.top = px(y - 260 + (1 - Math.min(1, k)) * 80);
      el.style.opacity = String(Math.min(1, t / 0.1) * (1 - out));
      el.style.transform = `perspective(1200px) rotateY(${(1 - Math.min(1, k)) * 540}deg) rotateZ(${-4 + Math.sin(t * 2) * 1.2}deg) scale(${(0.6 + 0.4 * k) * (1 - out * 0.2)})`;
    },
  });
}

/** 推理メモ2枚がぶつかって、答えの札が出る（まとめる） */
export function clueCollide(a: string, b: string, result: string, start: number, dur: number): void {
  const la = div('pv-slip', `<small>推理メモ</small>${a}`);
  const lb = div('pv-slip', `<small>推理メモ</small>${b}`);
  const res = div('pv-slip hit', result);
  let boom = false;
  const meet = 0.4;
  add({
    start,
    end: start + dur,
    update(t) {
      const k = ease.inCubic(span(t, 0, meet));
      const out = span(t, dur - 0.25, dur);
      la.style.left = px(-640 + k * (W / 2 - 600 + 640));
      lb.style.left = px(W + 40 - k * (W + 40 - W / 2 - 20));
      la.style.top = px(330);
      lb.style.top = px(430);
      la.style.transform = `rotate(${-6 + k * 3}deg)`;
      lb.style.transform = `rotate(${5 - k * 2}deg)`;
      const after = t - meet;
      if (after > 0 && !boom) {
        boom = true;
        flash(0.3, '255,255,255', 0.85);
        speedLines(W / 2, 470, 0.7, { color: 'rgba(255,250,240,0.95)', inner: 260 });
        inkSplat(W / 2, 470, 260, { color: 'rgba(184,50,42,0.9)', seed: 41, life: dur - meet });
      }
      const rk = ease.outBack(span(after, 0, 0.3));
      la.style.opacity = lb.style.opacity = String(after > 0 ? 1 - span(after, 0, 0.2) : 1);
      res.style.left = px(W / 2 - 300);
      res.style.top = px(380);
      res.style.opacity = String((after > 0 ? Math.min(1, rk) : 0) * (1 - out));
      res.style.transform = `rotate(-3deg) scale(${after > 0 ? 0.4 + 0.6 * rk : 0})`;
    },
    remove() {
      la.remove();
      lb.remove();
      res.remove();
    },
  });
}

/** タイトルロゴを叩きつける */
export function titleLogo(logo: string, start: number, dur: number): void {
  const shade = div('pv-shade');
  const el = document.createElement('img');
  el.src = logo;
  el.className = 'pv-logo';
  let boom = false;
  add({
    start,
    end: start + dur,
    el,
    update(t) {
      if (!boom) {
        boom = true;
        flash(0.6, '255,255,255', 1);
        inkSplat(W / 2 - 420, 500, 240, { color: 'rgba(184,50,42,0.7)', seed: 5, life: dur, drops: 14 });
        inkSplat(W / 2 + 460, 430, 200, { color: 'rgba(214,160,60,0.6)', seed: 9, life: dur, drops: 14 });
        speedLines(W / 2, 470, 0.9, { color: 'rgba(255,240,210,0.9)', inner: 520 });
        embers(dur, { count: 90, seed: 7 });
      }
      const k = ease.outQuint(t / 0.22);
      const out = span(t, dur - 0.4, dur);
      const s = (1 + 1.2 * (1 - k)) * (1 + 0.025 * t);
      const shake = t < 0.35 ? Math.sin(t * 80) * 14 * (1 - t / 0.35) : 0;
      el.style.left = px(W / 2 - 750 + shake);
      el.style.top = px(470 - el.offsetHeight / 2);
      el.style.opacity = String(Math.min(1, t / 0.04) * (1 - out));
      el.style.filter = `blur(${px((1 - k) * 10)}) drop-shadow(0 0 2px #fff) drop-shadow(0 10px 30px rgba(0,0,0,.55))`;
      el.style.transform = `scale(${s})`;
    },
  });
  add({
    start,
    end: start + dur,
    el: shade,
    update(t) {
      const k = ease.outCubic(t / 0.5) * (1 - span(t, dur - 0.4, dur));
      shade.style.background = `radial-gradient(ellipse at 50% 46%, rgba(255,246,228,${0.55 * k}) 0%, rgba(30,14,24,${0.35 * k}) 55%, rgba(8,4,10,${0.7 * k}) 100%)`;
    },
  });
}

/** 終わりの一枚：扉絵を背景に、話の名前と遊び方 */
export function endCard(cover: string, logo: string, start: number, dur: number): void {
  const bg = document.createElement('img');
  bg.src = cover;
  bg.className = 'pv-cover';
  const shade = div('pv-shade');
  const lg = document.createElement('img');
  lg.src = logo;
  lg.className = 'pv-logo';
  const ep = div('pv-end ep', '<small>第一話</small>夕凪の空港と消えた灯晶');
  const info = div('pv-end info', '<span class="pill">第一話 公開中</span><span class="pill">全五話</span><span class="pill">スマホ・PCのブラウザで遊べる</span>');
  const url = div('pv-end url', 'yunasayunasa.github.io/Six_dragon_gyakuten');
  const parts = [ep, info, url];
  add({
    start,
    end: start + dur,
    el: bg,
    update(t) {
      const fade = span(t, 0, 0.6) * (1 - span(t, dur - 1.2, dur));
      bg.style.opacity = String(fade);
      bg.style.transform = `scale(${1.12 - 0.08 * span(t, 0, dur)}) translateX(${px(-20 * span(t, 0, dur))})`;
      bg.style.filter = 'saturate(1.05) brightness(0.92)';
      shade.style.background = `linear-gradient(180deg, rgba(8,4,10,${0.25 * fade}) 0%, rgba(8,4,10,0) 30%, rgba(8,4,10,${0.55 * fade}) 62%, rgba(8,4,10,${0.85 * fade}) 100%)`;
      const lk = ease.outCubic(span(t, 0.2, 0.9));
      lg.style.width = '1050px';
      lg.style.left = px(W / 2 - 525);
      lg.style.top = px(60 + (1 - lk) * 30);
      lg.style.opacity = String(lk * (1 - span(t, dur - 1.2, dur)));
      parts.forEach((p, i) => {
        const k = ease.outCubic(span(t, 0.7 + i * 0.25, 1.3 + i * 0.25));
        p.style.opacity = String(k * (1 - span(t, dur - 1.2, dur)));
        p.style.transform = `translateY(${px((1 - k) * 30)})`;
      });
    },
    remove() {
      [shade, lg, ...parts].forEach((x) => x.remove());
    },
  });
  shade.style.zIndex = '14';
  lg.style.zIndex = '26';
  document.getElementById('pv')!.append(lg);
}

/** 5人がそろう場面の上に、ロゴを小さく浮かべる */
export function keyVisualLogo(logo: string, start: number, dur: number): void {
  const el = document.createElement('img');
  el.src = logo;
  el.className = 'pv-logo';
  add({
    start,
    end: start + dur,
    el,
    update(t) {
      const k = ease.outCubic(span(t, 0.2, 1.0));
      el.style.width = '880px';
      el.style.left = px(W / 2 - 440);
      el.style.top = px(36 + (1 - k) * -30);
      el.style.opacity = String(k * (1 - span(t, dur - 0.4, dur)));
      el.style.transform = `scale(${1 + 0.02 * Math.sin(t * 1.5)})`;
    },
  });
}
