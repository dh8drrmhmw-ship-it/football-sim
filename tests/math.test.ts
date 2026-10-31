import { describe, expect, it } from 'vitest';
import { mathChecksum, rngChecksum } from '../src/core/checks.ts';
import * as M from '../src/core/math.ts';
import { Rng } from '../src/core/rng.ts';

// 测试里可以用浏览器自带的 Math 做参照（测试不是比赛核心）。
function relErr(a: number, b: number): number {
  if (a === b) return 0;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-300);
  return Math.abs(a - b) / scale;
}

function sample(n: number, lo: number, hi: number, seed: number): number[] {
  const rng = new Rng(seed);
  return Array.from({ length: n }, () => rng.range(lo, hi));
}

describe('确定性数学：和 Math 的精度对比', () => {
  it('sin / cos：游戏常用范围内误差极小', () => {
    for (const x of sample(20000, -100, 100, 1)) {
      expect(Math.abs(M.sin(x) - Math.sin(x))).toBeLessThan(2e-15);
      expect(Math.abs(M.cos(x) - Math.cos(x))).toBeLessThan(2e-15);
    }
    for (const x of sample(5000, -1e5, 1e5, 2)) {
      expect(Math.abs(M.sin(x) - Math.sin(x))).toBeLessThan(1e-11);
    }
  });

  it('特殊值', () => {
    expect(M.sin(0)).toBe(0);
    expect(M.cos(0)).toBe(1);
    expect(M.exp(0)).toBe(1);
    expect(M.log(1)).toBe(0);
    expect(M.atan2(0, -1)).toBe(M.PI);
    expect(M.atan2(1, 0)).toBe(M.HALF_PI);
    expect(M.atan2(0, 0)).toBe(0);
    expect(Number.isNaN(M.sin(Infinity))).toBe(true);
    expect(Number.isNaN(M.log(-1))).toBe(true);
    expect(M.log(0)).toBe(-Infinity);
    expect(M.exp(1000)).toBe(Infinity);
    expect(M.exp(-1000)).toBe(0);
    expect(M.pow(2, 10)).toBe(1024);
    expect(M.pow(-2, 3)).toBe(-8);
    expect(M.pow(0, -1)).toBe(Infinity);
    expect(M.pow(5, 0)).toBe(1);
  });

  it('atan2 / atan / asin / acos', () => {
    const ys = sample(20000, -50, 50, 3);
    const xs = sample(20000, -50, 50, 4);
    for (let i = 0; i < ys.length; i++) {
      expect(Math.abs(M.atan2(ys[i]!, xs[i]!) - Math.atan2(ys[i]!, xs[i]!))).toBeLessThan(2e-15);
    }
    for (const x of sample(5000, -1e4, 1e4, 5)) {
      expect(Math.abs(M.atan(x) - Math.atan(x))).toBeLessThan(2e-15);
    }
    for (const x of sample(5000, -1, 1, 6)) {
      expect(Math.abs(M.asin(x) - Math.asin(x))).toBeLessThan(5e-15);
      expect(Math.abs(M.acos(x) - Math.acos(x))).toBeLessThan(5e-15);
    }
  });

  it('exp / log / pow', () => {
    for (const x of sample(20000, -700, 700, 7)) {
      expect(relErr(M.exp(x), Math.exp(x))).toBeLessThan(5e-15);
    }
    for (const x of sample(20000, 1e-12, 1e6, 8)) {
      expect(Math.abs(M.log(x) - Math.log(x))).toBeLessThan(5e-15 * Math.max(1, Math.abs(Math.log(x))));
    }
    expect(relErr(M.log(5e-324), Math.log(5e-324))).toBeLessThan(1e-14); // 次正规数
    const bases = sample(5000, 0.01, 100, 9);
    const exps = sample(5000, -3, 3, 10);
    for (let i = 0; i < bases.length; i++) {
      expect(relErr(M.pow(bases[i]!, exps[i]!), Math.pow(bases[i]!, exps[i]!))).toBeLessThan(5e-14);
    }
  });

  it('wrapAngle 落在 (-π, π]', () => {
    for (const a of sample(10000, -1000, 1000, 11)) {
      const w = M.wrapAngle(a);
      expect(w > -M.PI && w <= M.PI).toBe(true);
      expect(Math.abs(Math.sin(w) - Math.sin(a))).toBeLessThan(1e-12);
    }
  });
});

describe('固定答案（改了算法这里会失败，说明旧回放会对不上）', () => {
  // 这两个值是「这一版数学函数和随机数」的身份证。
  // 只有在有意修改算法时才更新，并且要在决策记录里写明「旧回放失效」。
  it('数学函数校验码', () => {
    expect(mathChecksum()).toBe(EXPECTED_MATH);
  });
  it('随机数校验码', () => {
    expect(rngChecksum()).toBe(EXPECTED_RNG);
  });
  it('同一进程里算两遍结果相同（没有隐藏的全局状态）', () => {
    expect(mathChecksum(500)).toBe(mathChecksum(500));
    expect(rngChecksum(500)).toBe(rngChecksum(500));
  });
});

const EXPECTED_MATH = '823c1ba22fd8ccd5';
const EXPECTED_RNG = '1f5493f3ba236a68';
