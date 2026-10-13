import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TUTORIALS } from '../src/game/tutorials';

/** 説明が照らす部品の名前に書き間違いが無いか（登録されている名前は、ソースの defineTarget と登録表から読む） */
describe('遊び方の説明', () => {
  const src = ['src/engine/ui/Hud.ts', 'src/genres/investigation/InvestigationGame.ts'].map((f) => readFileSync(f, 'utf-8')).join('\n');
  const names = new Set([...src.matchAll(/defineTarget\('([^']+)'/g), ...src.matchAll(/\['([^']+)', '[^']+'\]/g)].map((m) => m[1]));

  it('捜査・尋問・まとめるの3つがそろっている', () => {
    expect(Object.keys(TUTORIALS).sort()).toEqual(['confront', 'explore', 'logic']);
  });
  it('照らす部品はどれも登録されている', () => {
    for (const t of Object.values(TUTORIALS)) {
      for (const s of t.steps) if (s.target) expect(names, s.target).toContain(s.target);
    }
  });
});
