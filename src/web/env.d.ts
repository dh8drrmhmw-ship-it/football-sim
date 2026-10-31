/** 构建时由 vite.config.ts 写进页面的常量。 */

/** 云端（构建时的 Node）算出的自检答案。 */
declare const __EXPECTED__: {
  math: string;
  rng: string;
  match: string;
  seed: number;
  score: [number, number];
};

declare const __BUILD__: {
  version: string;
  date: string;
};
