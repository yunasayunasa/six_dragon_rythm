import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Director } from '../src/engine/script/Director';
import { parseScript } from '../src/engine/script/parser';
import { registerStageCommands } from '../src/engine/script/stageCommands';
import { INVESTIGATION_COMMANDS } from '../src/genres/investigation/InvestigationGame';
import { CaseState } from '../src/genres/investigation/CaseState';
import { CASE01 } from '../src/game/case01/case';
import { CASE02 } from '../src/game/case02/case';
import { CASE03 } from '../src/game/case03/case';
import { CASE04 } from '../src/game/case04/case';
import { CASE05 } from '../src/game/case05/case';
import type { Engine } from '../src/engine';
import type { CaseData } from '../src/genres/investigation/types';
import { LOOKS } from '../src/engine/stage/Look';

/** 事件データの書き間違い（知らない命令・いない役者・無い表情・無い証拠・無い場所）と、最後まで遊べるかを実行前に確かめる */
const manifest = JSON.parse(readFileSync('public/assets/cast/manifest.json', 'utf-8')) as Record<string, unknown>;

/** 舞台の名前付きの物（case.ts の舞台装置で st.named に登録しているもの） */
const NAMED: Record<string, string[]> = {
  case01: ['灯台柱', '空魚', '飛空艇', '飛空艇の着く所'],
  case02: ['台座', '水槽', '昇降籠'],
  case03: ['霧', '墨'],
  case04: ['雨'],
  case05: ['灯台柱', '空魚', '飛空艇', '飛空艇の着く所', '墨', '台座', '水槽'],
};

for (const data of [CASE01, CASE02, CASE03, CASE04, CASE05]) checkCase(data);

function checkCase(data: CaseData): void {

const allScripts = (): Array<[string, string]> => {
  const list: Array<[string, string]> = [
    ['intro', data.intro],
    ['logic.miss', data.logic.miss],
    ['logic.done', data.logic.done],
    ['ending', data.ending],
  ];
  data.logic.pairs.forEach((p, i) => list.push([`logic.${i}`, p.script]));
  for (const [id, c] of Object.entries(data.confrontations)) {
    list.push([`${id}.intro`, c.intro], [`${id}.success`, c.success], [`${id}.wrong`, c.wrong], [`${id}.fail`, c.fail]);
    c.statements.forEach((s, i) => list.push([`${id}.press.${i}`, s.press]));
    c.hints?.forEach((h, i) => list.push([`${id}.hint.${i}`, h]));
  }
  for (const [id, c] of Object.entries(data.challenges ?? {})) {
    list.push([`${id}.success`, c.success], [`${id}.wrong`, c.wrong], [`${id}.fail`, c.fail]);
    c.hints?.forEach((h, i) => list.push([`${id}.hint.${i}`, h]));
  }
  for (const h of data.hotspots) {
    list.push([`hs.${h.id}`, h.script]);
    if (h.again) list.push([`hs.${h.id}.again`, h.again]);
    h.variants?.forEach((v, i) => {
      list.push([`hs.${h.id}.v${i}`, v.script]);
      if (v.again) list.push([`hs.${h.id}.v${i}.again`, v.again]);
    });
  }
  return list;
};

const names = new Map(data.cast.map((c) => [c.name, c]));
const ids = new Map(data.cast.map((c) => [c.id, c]));
const actorOf = (n: string) => names.get(n) ?? ids.get(n);
const namedObjects = NAMED[data.id];
const areaIds = new Set((data.areas ?? []).flatMap((a) => [a.id, a.name]));
const itemIds = new Set([...data.evidence.map((e) => e.id), ...data.clues.map((c) => c.id)]);

describe(`${data.chapter.split('　')[0]}のデータ検査`, () => {
  const d = new Director({ say: async () => {} });
  registerStageCommands(d, { engine: {} as Engine, actor: () => null, resetCamera: () => {} });
  INVESTIGATION_COMMANDS.forEach((c) => d.register(c, () => {}));

  it('すべての立ち絵・動きのコマがマニフェストにある', () => {
    for (const c of data.cast) {
      const poses = [...Object.values(c.expressions), ...(c.motions?.attack ?? []), ...(c.motions?.damage ? [c.motions.damage] : [])];
      for (const pose of poses) expect(manifest[pose], pose).toBeTruthy();
    }
  });

  for (const [key, src] of allScripts()) {
    it(`台本「${key}」の命令・役者・表情・証拠が正しい`, () => {
      expect(d.unknownCommands(src)).toEqual([]);
      for (const c of parseScript(src)) {
        if (c.op === 'say') {
          if (c.speaker) {
            const a = actorOf(c.speaker);
            expect(a, `${key} ${c.line}行目 話者 ${c.speaker}`).toBeTruthy();
            if (c.expr) expect(Object.keys(a!.expressions), `${key} ${c.line}行目 表情 ${c.expr}`).toContain(c.expr);
          }
          continue;
        }
        if (['face', 'hop', 'pop', 'hide', 'move', 'attack', 'damage', 'place', 'corpse', 'break'].includes(c.name)) {
          const a = actorOf(c.args[0]);
          expect(a, `${key} ${c.line}行目 役者 ${c.args[0]}`).toBeTruthy();
          if (c.name === 'face' && c.args[1]) expect(Object.keys(a!.expressions)).toContain(c.args[1]);
        }
        if (c.name === 'cam' && c.args[0] && !['戻す', '引き', '固定', '自動'].includes(c.args[0])) {
          // @カメラ 周回 対象 秒 ／ @カメラ 眺め 対象 距離… は2番目が対象
          const target = ['周回', '眺め'].includes(c.args[0]) ? c.args[1] : c.args[0];
          expect(actorOf(target) || namedObjects.includes(target), `${key} カメラ対象 ${target}`).toBeTruthy();
        }
        if (c.name === 'cue') expect(namedObjects, `${key} 演出の対象 ${c.args[0]}`).toContain(c.args[0]);
        if (c.name === 'give') c.args.forEach((id) => expect(itemIds.has(id), `${key} 証拠 ${id}`).toBe(true));
        if (c.name === 'confront') expect(data.confrontations[c.args[0]], `${key} 尋問 ${c.args[0]}`).toBeTruthy();
        if (c.name === 'challenge') expect(data.challenges?.[c.args[0]], `${key} つきつけ ${c.args[0]}`).toBeTruthy();
        if (c.name === 'look') expect(Object.keys(LOOKS)).toContain(c.args[0]);
        if (c.name === 'area') expect(areaIds.has(c.args[0]), `${key} 場所 ${c.args[0]}`).toBe(true);
        if (c.name === 'place' && c.args[4]) expect(areaIds.has(c.args[4]), `${key} 場所 ${c.args[4]}`).toBe(true);
      }
    });
  }

  it('調べる場所の相手・尋問の証人・矛盾の証拠・揺さぶりの行き先が存在する', () => {
    for (const h of data.hotspots) if (h.actor) expect(ids.has(h.actor)).toBe(true);
    // 場所を使う話では、調べる所・出入り口・最初の立ち位置の場所が存在する
    if (data.areas) {
      for (const h of data.hotspots) expect(h.area && areaIds.has(h.area), `調べる所 ${h.id} の場所`).toBe(true);
      for (const a of data.areas) for (const e of a.exits) expect(areaIds.has(e.to), `${a.id} の出入り口 ${e.to}`).toBe(true);
      for (const p of data.placement) if (p.area) expect(areaIds.has(p.area), `${p.id} の場所`).toBe(true);
    }
    for (const [id, c] of Object.entries(data.confrontations)) {
      expect(ids.has(c.witness), id).toBe(true);
      const contradictions = c.statements.flatMap((s) => s.contradiction ?? []);
      expect(contradictions.length, id).toBeGreaterThan(0);
      contradictions.forEach((e) => expect(itemIds.has(e), `${id} 矛盾 ${e}`).toBe(true));
      c.statements.forEach((s, i) => {
        if (s.reveals !== undefined) expect(c.statements[s.reveals]?.hidden, `${id} 揺さぶり ${i}`).toBe(true);
        // 隠れた証言は、どこかを揺さぶれば出てくること
        if (s.hidden) expect(c.statements.some((o) => o.reveals === i), `${id} 隠れた証言 ${i}`).toBe(true);
      });
    }
    for (const [id, c] of Object.entries(data.challenges ?? {})) {
      expect(ids.has(c.witness), id).toBe(true);
      expect(c.answer.length, id).toBeGreaterThan(0);
      c.answer.forEach((e) => expect(itemIds.has(e), `${id} 答え ${e}`).toBe(true));
    }
    for (const p of data.logic.pairs) expect(itemIds.has(p.a) && itemIds.has(p.b), `${p.a}+${p.b}`).toBe(true);
  });

  it('出てくる物はどれも必ず使う（証拠品は尋問かつきつけで、推理メモはまとめるで）', () => {
    const evidenceIds = data.evidence.map((e) => e.id);
    const clueIds = data.clues.map((c) => c.id);
    const answers = [
      ...Object.values(data.confrontations).flatMap((c) => c.statements.flatMap((x) => x.contradiction ?? [])),
      ...Object.values(data.challenges ?? {}).flatMap((c) => c.answer),
    ];
    const logicIds = data.logic.pairs.flatMap((p) => [p.a, p.b]);
    for (const id of evidenceIds) expect(answers, `証拠品 ${id} を使う尋問が無い`).toContain(id);
    for (const id of clueIds) expect(logicIds, `推理メモ ${id} を使うまとめるが無い`).toContain(id);
    // 尋問でつきつけられるのは証拠品だけ、まとめるで選べるのは推理メモだけ
    for (const id of answers) expect(evidenceIds, `尋問の答え ${id} が証拠品ではない`).toContain(id);
    for (const id of logicIds) expect(clueIds, `まとめるの ${id} が推理メモではない`).toContain(id);
    // どれも、どこかの台本で手に入る
    const given = new Set(allScripts().flatMap(([, src]) => parseScript(src).flatMap((c) => (c.op === 'cmd' && c.name === 'give' ? c.args : []))));
    for (const id of itemIds) expect(given.has(id), `${id} が手に入らない`).toBe(true);
  });

  /**
   * 通しで遊ぶ。avoid の場所は「ほかに何もできなくなるまで」調べない（調べ忘れた人の遊び方）。
   * どの場所を後回しにしても、答えの証拠品を持たずに尋問が始まらず、最後まで届くこと。
   */
  function play(avoid: string | null) {
    const s = new CaseState(data);
    let solved = false;
    const done = new Set<string>();
    const unready: string[] = [];
    /** 台本の効果（証拠・記録・尋問・解決）だけを実行する */
    const run = (src: string): void => {
      for (const c of parseScript(src)) {
        if (c.op !== 'cmd') continue;
        if (c.name === 'give') c.args.forEach((id) => s.give(id));
        if (c.name === 'flag') c.args.forEach((f) => s.flags.add(f));
        if (c.name === 'confront') {
          const def = data.confrontations[c.args[0]];
          // 尋問を始める時点で、答えになる証拠品を持っていること（持っていないと勝てずに詰む）
          const answers = def.statements.flatMap((x) => x.contradiction ?? []);
          if (!answers.some((a) => s.evidence.includes(a))) unready.push(def.title);
          run(def.success);
        }
        if (c.name === 'challenge') {
          const def = data.challenges![c.args[0]];
          if (!def.answer.some((a) => s.evidence.includes(a))) unready.push(def.title);
          run(def.success);
        }
        if (c.name === 'solve') solved = true;
      }
    };
    const state = () => `${s.evidence.length}/${s.clues.length}/${s.flags.size}/${solved}`;
    const visit = (h: (typeof data.hotspots)[number]) => {
      const b = state();
      const r = s.resolveHotspot(h);
      run(r.script);
      s.markPlayed(r.key);
      return state() !== b;
    };
    run(data.intro);
    for (let step = 0; step < 200 && !solved; step++) {
      let progressed = false;
      for (const p of data.logic.pairs) {
        if (done.has(p.flag) || !s.clues.includes(p.a) || !s.clues.includes(p.b)) continue;
        done.add(p.flag);
        s.flags.add(p.flag);
        run(p.script);
        progressed = true;
      }
      // 場所は出入り口でいつでも行き来できるので、場所は問わない。条件付きの所は条件を満たすときだけ
      for (const h of data.hotspots) if (h.id !== avoid && (!h.when || s.check(h.when)) && visit(h)) progressed = true;
      // ほかに何もできないときだけ、後回しにした場所を調べる
      const later = data.hotspots.find((h) => h.id === avoid);
      if (!progressed && later && (!later.when || s.check(later.when))) progressed = visit(later);
      if (!progressed) break;
    }
    return { solved, unready, s };
  }

  it('最初から最後まで遊べる（調べる・話す・まとめる・尋問をくり返して事件解決まで届く）', () => {
    const { solved, unready, s } = play(null);
    expect(solved, `進めなくなった：持ち物 ${[...s.evidence, ...s.clues].join(',')} 記録 ${[...s.flags].join(',')}`).toBe(true);
    expect(unready, '答えの証拠品を持たずに始まる尋問').toEqual([]);
  });

  for (const h of data.hotspots) {
    it(`「${h.label}」を後回しにしても、証拠品が無いまま尋問が始まらず最後まで遊べる`, () => {
      const { solved, unready } = play(h.id);
      expect(unready, '答えの証拠品を持たずに始まる尋問').toEqual([]);
      expect(solved).toBe(true);
    });
  }
});
}
