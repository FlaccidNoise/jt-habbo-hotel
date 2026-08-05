/** Named seeded PRNG for the recipe-to-sprite path — integer arithmetic only (PIPELINES §2). */
export interface Prng {
  /** Next integer in [0, n). */
  int(n: number): number;
}

/** mulberry32. Same seed → same sequence, forever — sprite identity depends on it. */
export function mulberry32(seed: number): Prng {
  let s = seed >>> 0;
  return {
    int(n: number): number {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      t = (t ^ (t >>> 14)) >>> 0;
      return t % n;
    },
  };
}
