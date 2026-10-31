import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng.ts';

// 已知答案：由 xoshiro128** 官方 C 参考实现（加上同样的 splitmix32 展开）算出。
const VECTORS: { seed: number; state: number[]; out: number[] }[] = [
  {
    seed: 0,
    state: [2462723854, 1020716019, 454327756, 1275600319],
    out: [3809008728, 1133695204, 53579671, 2891528803, 139681546, 2203266335],
  },
  {
    seed: 1,
    state: [2527132011, 314344336, 2535364964, 2041432039],
    out: [2442144158, 3238099751, 3819917871, 2104621829, 2021136066, 4223536128],
  },
  {
    seed: 20261031,
    state: [1514926900, 1050644553, 4229107909, 4257207543],
    out: [103705468, 2276175973, 2985928686, 1591438694, 1103243589, 1079131514],
  },
  {
    seed: 0xdeadbeef,
    state: [3553530007, 1645313261, 4073195585, 2760393073],
    out: [2306529437, 2576298207, 1250671110, 2699168992, 2319502352, 3183738783],
  },
];

describe('Rng（xoshiro128**）', () => {
  it('和 C 参考实现逐个相同', () => {
    for (const v of VECTORS) {
      const rng = new Rng(v.seed);
      expect(rng.state()).toEqual(v.state);
      expect(Array.from({ length: v.out.length }, () => rng.nextU32())).toEqual(v.out);
    }
  });

  it('状态 1,2,3,4 的公开测试向量', () => {
    const rng = Rng.fromState([1, 2, 3, 4]);
    expect(Array.from({ length: 6 }, () => rng.nextU32())).toEqual([
      11520, 0, 5927040, 70819200, 2031721883, 1637235492,
    ]);
  });

  it('同一个种子，同一串数；clone 和 fromState 接着往下抽也一样', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
    const c = a.clone();
    const d = Rng.fromState(a.state());
    for (let i = 0; i < 1000; i++) {
      const x = a.float();
      expect(c.float()).toBe(x);
      expect(d.float()).toBe(x);
    }
  });

  it('float 在 [0, 1)，平均值接近 0.5', () => {
    const rng = new Rng(7);
    let sum = 0;
    const n = 200_000;
    for (let i = 0; i < n; i++) {
      const x = rng.float();
      expect(x >= 0 && x < 1).toBe(true);
      sum += x;
    }
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.005);
  });

  it('int(n) 不越界，并且大致均匀', () => {
    const rng = new Rng(8);
    const counts = new Array(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) counts[rng.int(10)]++;
    for (const c of counts) expect(Math.abs(c / n - 0.1)).toBeLessThan(0.01);
    expect(() => rng.int(0)).toThrow();
    expect(() => rng.int(2.5)).toThrow();
    expect(rng.int(1)).toBe(0);
  });

  it('normal 的平均值约 0、标准差约 1', () => {
    const rng = new Rng(9);
    const n = 100_000;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < n; i++) {
      const x = rng.normal();
      sum += x;
      sq += x * x;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sq / n - mean * mean);
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.abs(sd - 1)).toBeLessThan(0.02);
  });

  it('shuffle 是一个排列；fork 出的流和原来的不同', () => {
    const rng = new Rng(10);
    const arr = Array.from({ length: 50 }, (_, i) => i);
    rng.shuffle(arr);
    expect([...arr].sort((x, y) => x - y)).toEqual(Array.from({ length: 50 }, (_, i) => i));
    const f = rng.fork();
    expect(f.nextU32()).not.toBe(rng.nextU32());
  });
});
