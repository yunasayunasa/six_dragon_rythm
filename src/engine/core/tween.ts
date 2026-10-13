/** Promise で待てる軽量Tween。演出台本から `await` で順番に流すために使う。 */
export type EaseFn = (t: number) => number;

export const Ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
} satisfies Record<string, EaseFn>;

interface Job {
  elapsed: number;
  duration: number;
  step: (k: number) => void;
  ease: EaseFn;
  resolve: () => void;
  owner?: object;
}

export class Tweens {
  private jobs: Job[] = [];

  /** duration秒かけて step(0..1) を呼ぶ。owner を渡すと同じ owner の古いTweenは止まる。 */
  run(duration: number, step: (k: number) => void, ease: EaseFn = Ease.inOutSine, owner?: object): Promise<void> {
    if (owner) this.kill(owner);
    return new Promise((resolve) => {
      if (duration <= 0) {
        step(1);
        resolve();
        return;
      }
      this.jobs.push({ elapsed: 0, duration, step, ease, resolve, owner });
    });
  }

  /** 数値プロパティを補間する。 */
  to<T extends object>(target: T, props: Partial<Record<keyof T, number>>, duration: number, ease: EaseFn = Ease.inOutSine, owner: object = target): Promise<void> {
    const rec = target as Record<string, number>;
    const from: Record<string, number> = {};
    for (const k of Object.keys(props)) from[k] = rec[k];
    return this.run(
      duration,
      (e) => {
        for (const [k, v] of Object.entries(props)) rec[k] = from[k] + ((v as number) - from[k]) * e;
      },
      ease,
      owner,
    );
  }

  wait(seconds: number): Promise<void> {
    return this.run(seconds, () => {}, Ease.linear);
  }

  kill(owner: object): void {
    this.jobs = this.jobs.filter((j) => {
      if (j.owner !== owner) return true;
      j.resolve();
      return false;
    });
  }

  update(dt: number): void {
    if (this.jobs.length === 0) return;
    const done: Job[] = [];
    for (const j of this.jobs) {
      j.elapsed += dt;
      const k = Math.min(1, j.elapsed / j.duration);
      j.step(j.ease(k));
      if (k >= 1) done.push(j);
    }
    if (done.length) {
      this.jobs = this.jobs.filter((j) => !done.includes(j));
      done.forEach((j) => j.resolve());
    }
  }

  get active(): number {
    return this.jobs.length;
  }
}
