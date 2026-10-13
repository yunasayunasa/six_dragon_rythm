/** 画質プロファイル。URLの ?q=low|medium|high で上書きできる。 */
export interface QualityProfile {
  name: 'low' | 'medium' | 'high';
  dprCap: number;
  msaa: number;
  shadows: boolean;
  shadowMapSize: number;
  dof: boolean;
  /** 被写界深度ぼかしのバッファ縮小率（大きいほど軽い） */
  blurDownscale: number;
  particles: number;
}

export const QUALITY: Record<QualityProfile['name'], QualityProfile> = {
  low: { name: 'low', dprCap: 1, msaa: 0, shadows: false, shadowMapSize: 512, dof: true, blurDownscale: 3, particles: 24 },
  medium: { name: 'medium', dprCap: 1.5, msaa: 0, shadows: true, shadowMapSize: 1024, dof: true, blurDownscale: 2, particles: 48 },
  high: { name: 'high', dprCap: 2, msaa: 4, shadows: true, shadowMapSize: 2048, dof: true, blurDownscale: 2, particles: 80 },
};

export function isMobile(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
}

export function pickQuality(search = location.search): QualityProfile {
  const q = new URLSearchParams(search).get('q');
  if (q === 'low' || q === 'medium' || q === 'high') return QUALITY[q];
  return isMobile() ? QUALITY.medium : QUALITY.high;
}
