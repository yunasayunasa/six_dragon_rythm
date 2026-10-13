import { el } from './dom';

/** タイトル背景専用の火の粉。固定個数のCSSアニメーションで描画する。 */
export function titleEmbers(parent: HTMLElement): () => void {
  const layer = el('div', 'title-embers', parent);
  layer.setAttribute('aria-hidden', 'true');
  const between = (min: number, max: number) => min + Math.random() * (max - min);
  for (let i = 0; i < 24; i++) {
    const p = el('i', 'ember', layer);
    p.style.left = `${between(2, 98)}%`;
    p.style.setProperty('--drift', `${between(-65, 65)}px`);
    p.style.setProperty('--rise', `${between(120, 360)}px`);
    p.style.setProperty('--size', `${between(2, 4)}px`);
    p.style.animationDuration = `${between(3, 6)}s`;
    p.style.animationDelay = `${between(-6, 0)}s`;
  }
  // 4つの火花を同じ場所から短く弾く。束ごとに時刻をずらす。
  for (let i = 0; i < 6; i++) {
    const burst = el('div', 'ember-burst', layer);
    burst.style.left = `${between(3, 97)}%`;
    burst.style.bottom = `${between(3, 14)}%`;
    const duration = between(2.4, 4.8);
    const delay = between(-duration, 0);
    for (let j = 0; j < 4; j++) {
      const p = el('i', 'ember-pop', burst);
      p.style.setProperty('--x', `${between(-30, 30)}px`);
      p.style.setProperty('--y', `${between(-55, -12)}px`);
      p.style.animationDuration = `${duration}s`;
      p.style.animationDelay = `${delay}s`;
    }
  }
  const visibility = () => layer.classList.toggle('paused', document.hidden);
  document.addEventListener('visibilitychange', visibility);
  visibility();
  return () => {
    document.removeEventListener('visibilitychange', visibility);
    layer.remove();
  };
}
