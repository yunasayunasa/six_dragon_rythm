// KanjiVG の SVG から画ごとの点列を作り、src/game/rhythm/strokes.ts を書き出す。
//
// 使い方（依存なし。リポジトリのルートで）:
//   node tools/gen_strokes.mjs [SVGのフォルダ=.work/kanjivg] [出力=src/game/rhythm/strokes.ts]
//
// 入力: <16進コードポイント5桁>.svg（例: 05927.svg = 大）。字の一覧は下の CHARS。
// 各 <path d="..."> を書き順（id の -sN の N）に並べ、M/L/H/V/C/S/Q/T/Z（大文字・小文字）を
// 曲線に沿って等間隔の POINTS_PER_STROKE 点にサンプリングし、viewBox 109 で 0..1 に正規化する。
// 円弧 A は KanjiVG の字には出ない想定なので、出てきたら止まる。
//
// KanjiVG: Copyright (C) 2009-2011 Ulrich Apel, CC BY-SA 3.0 (http://kanjivg.tagaini.net)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CHARS = ['大', '山', '刃', '火', '月', '王', '羽', '光', '天'];
const POINTS_PER_STROKE = 16;
const VIEWBOX = 109;
const CURVE_STEPS = 32; // 曲線1本を折れ線にするときの分割数（等間隔に取り直す前の下書き）

const inDir = process.argv[2] ?? '.work/kanjivg';
const outFile = process.argv[3] ?? 'src/game/rhythm/strokes.ts';

function tokenize(d) {
  const tokens = [];
  const re = /([a-zA-Z])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/g;
  let m;
  while ((m = re.exec(d))) tokens.push(m[1] ?? parseFloat(m[2]));
  return tokens;
}

const ARGC = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, Z: 0, A: 7 };

/** パスを折れ線（[x,y][]）にする */
function flatten(d) {
  const tokens = tokenize(d);
  const pts = [];
  let i = 0;
  let cmd = '';
  let x = 0, y = 0, sx = 0, sy = 0;
  let lastCtrl = null; // 直前の C/S の第2制御点、Q/T の制御点
  let lastType = '';
  const bez = (p0, p1, p2, p3) => {
    for (let s = 1; s <= CURVE_STEPS; s++) {
      const t = s / CURVE_STEPS, u = 1 - t;
      pts.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  };
  const quad = (p0, p1, p2) => {
    for (let s = 1; s <= CURVE_STEPS; s++) {
      const t = s / CURVE_STEPS, u = 1 - t;
      pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
    }
  };
  while (i < tokens.length) {
    if (typeof tokens[i] === 'string') cmd = tokens[i++];
    else if (cmd === 'M') cmd = 'L'; // M の後ろに座標が続いたら暗黙の L
    else if (cmd === 'm') cmd = 'l';
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    if (!(up in ARGC)) throw new Error(`未対応のコマンド: ${cmd}`);
    if (up === 'A') throw new Error('円弧(A)は未対応');
    const a = [];
    for (let k = 0; k < ARGC[up]; k++) {
      if (typeof tokens[i] !== 'number') throw new Error(`引数が足りない: ${cmd} in ${d}`);
      a.push(tokens[i++]);
    }
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (up) {
      case 'M':
        x = ox + a[0]; y = oy + a[1]; sx = x; sy = y;
        pts.push([x, y]);
        lastCtrl = null;
        break;
      case 'L':
        x = ox + a[0]; y = oy + a[1];
        pts.push([x, y]);
        lastCtrl = null;
        break;
      case 'H':
        x = ox + a[0];
        pts.push([x, y]);
        lastCtrl = null;
        break;
      case 'V':
        y = oy + a[0];
        pts.push([x, y]);
        lastCtrl = null;
        break;
      case 'C': {
        const p1 = [ox + a[0], oy + a[1]], p2 = [ox + a[2], oy + a[3]], p3 = [ox + a[4], oy + a[5]];
        bez([x, y], p1, p2, p3);
        lastCtrl = p2; x = p3[0]; y = p3[1];
        break;
      }
      case 'S': {
        const p1 = lastType === 'C' || lastType === 'S' ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
        const p2 = [ox + a[0], oy + a[1]], p3 = [ox + a[2], oy + a[3]];
        bez([x, y], p1, p2, p3);
        lastCtrl = p2; x = p3[0]; y = p3[1];
        break;
      }
      case 'Q': {
        const p1 = [ox + a[0], oy + a[1]], p2 = [ox + a[2], oy + a[3]];
        quad([x, y], p1, p2);
        lastCtrl = p1; x = p2[0]; y = p2[1];
        break;
      }
      case 'T': {
        const p1 = lastType === 'Q' || lastType === 'T' ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
        const p2 = [ox + a[0], oy + a[1]];
        quad([x, y], p1, p2);
        lastCtrl = p1; x = p2[0]; y = p2[1];
        break;
      }
      case 'Z':
        x = sx; y = sy;
        pts.push([x, y]);
        lastCtrl = null;
        break;
    }
    lastType = up;
  }
  return pts;
}

/** 折れ線を弧長で等間隔に n 点へ取り直す（始点・終点は必ず含む） */
function resample(poly, n) {
  const cum = [0];
  for (let k = 1; k < poly.length; k++) cum.push(cum[k - 1] + Math.hypot(poly[k][0] - poly[k - 1][0], poly[k][1] - poly[k - 1][1]));
  const total = cum[cum.length - 1];
  const out = [];
  let seg = 1;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (seg < poly.length - 1 && cum[seg] < target) seg++;
    const len = cum[seg] - cum[seg - 1];
    const f = len === 0 ? 0 : (target - cum[seg - 1]) / len;
    out.push([poly[seg - 1][0] + (poly[seg][0] - poly[seg - 1][0]) * f, poly[seg - 1][1] + (poly[seg][1] - poly[seg - 1][1]) * f]);
  }
  return out;
}

const round = (v) => Math.round((v / VIEWBOX) * 10000) / 10000;

function parseSvg(file) {
  const svg = readFileSync(file, 'utf8');
  const found = [];
  for (const m of svg.matchAll(/<path\b[^>]*>/g)) {
    const tag = m[0];
    const id = /\bid="[^"]*-s(\d+)"/.exec(tag);
    const d = /\bd="([^"]+)"/.exec(tag);
    if (id && d) found.push({ n: Number(id[1]), d: d[1] });
  }
  if (found.length === 0) throw new Error(`画が見つからない: ${file}`);
  found.sort((p, q) => p.n - q.n);
  return found.map((p) => ({ points: resample(flatten(p.d), POINTS_PER_STROKE).map(([px, py]) => [round(px), round(py)]) }));
}

const entries = CHARS.map((char) => {
  const cp = char.codePointAt(0);
  const hex = cp.toString(16).padStart(5, '0');
  const strokes = parseSvg(join(inDir, `${hex}.svg`));
  return { char, codepoint: cp, strokes };
});

const body = entries
  .map(
    (e) =>
      `  {\n    char: '${e.char}',\n    codepoint: 0x${e.codepoint.toString(16)},\n    strokes: [\n` +
      e.strokes.map((s) => `      { points: ${JSON.stringify(s.points)} },\n`).join('') +
      `    ],\n  },\n`,
  )
  .join('');

const header = `// このファイルは tools/gen_strokes.mjs が自動生成します。手で編集しないでください。
//   再生成: node tools/gen_strokes.mjs
//
// 画のデータの出典: KanjiVG (http://kanjivg.tagaini.net)
// Copyright (C) 2009-2011 Ulrich Apel.
// Creative Commons Attribution-Share Alike 3.0 (CC BY-SA 3.0)
//   https://creativecommons.org/licenses/by-sa/3.0/
// 元の SVG の画の線を ${POINTS_PER_STROKE} 点に等間隔で取り直し、viewBox ${VIEWBOX} を 0..1 に正規化したもの（改変あり）。
// このデータを含む成果物は同じ CC BY-SA 3.0 の条件で配布し、KanjiVG の表記を残すこと。

`;

const types = `/** 0..1 に正規化した座標 [x, y]（y は下向き） */
export type StrokePoint = readonly [number, number];

export interface KanjiStroke {
  points: readonly StrokePoint[];
}

export interface KanjiStrokes {
  char: string;
  codepoint: number;
  /** 書き順 */
  strokes: readonly KanjiStroke[];
}

export const KANJI_STROKES: readonly KanjiStrokes[] = [
`;

const footer = `];

export function getKanjiStrokes(char: string): KanjiStrokes | undefined {
  return KANJI_STROKES.find((k) => k.char === char);
}
`;

writeFileSync(outFile, header + types + body + footer);
console.log(`${entries.length} 字を ${outFile} に書き出しました（画数: ${entries.map((e) => `${e.char}${e.strokes.length}`).join(' ')}）`);
