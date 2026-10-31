/**
 * 固定种子随机数（决策记录 D-006）。
 *
 * 算法：xoshiro128**（Blackman 和 Vigna，2018，作者放入公有领域），用 splitmix32 把种子展开成内部状态。
 * 全部是 32 位整数运算，任何设备上逐位相同。同一个种子永远产生同一串数。
 *
 * 比赛核心里所有「随机」都必须来自这里，并且调用顺序本身也是比赛结果的一部分：
 * 多抽或少抽一次，后面的比赛就不一样了。
 */
import { imul, log, sqrt, trunc } from './math.ts';

const TWO_POW_32 = 4294967296;

/** 内部状态：4 个 32 位无符号整数。存档、回放、AI 推演时用它复制随机数的进度。 */
export type RngState = readonly [number, number, number, number];

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/** splitmix32：把一个 32 位种子展开成一串互不相关的 32 位数。 */
function splitmix32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x9e3779b9) | 0;
    let z = s;
    z = imul(z ^ (z >>> 16), 0x85ebca6b);
    z = imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  /** seed：任意整数（取低 32 位）。 */
  constructor(seed: number) {
    const next = splitmix32(seed);
    this.a = next() | 0;
    this.b = next() | 0;
    this.c = next() | 0;
    this.d = next() | 0;
    if ((this.a | this.b | this.c | this.d) === 0) this.d = 1; // 全 0 状态会卡死，概率几乎为 0，仍然防一手
  }

  static fromState(state: RngState): Rng {
    const r = new Rng(0);
    r.a = state[0] | 0;
    r.b = state[1] | 0;
    r.c = state[2] | 0;
    r.d = state[3] | 0;
    return r;
  }

  state(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }

  clone(): Rng {
    return Rng.fromState(this.state());
  }

  /** 32 位无符号整数，0 ≤ x < 2^32。 */
  nextU32(): number {
    const result = imul(rotl(imul(this.b, 5), 7), 9) >>> 0;
    const t = this.b << 9;
    this.c ^= this.a;
    this.d ^= this.b;
    this.b ^= this.c;
    this.a ^= this.d;
    this.c ^= t;
    this.d = rotl(this.d, 11);
    return result;
  }

  /** 0 ≤ x < 1 的小数（2^-32 的整数倍，精确可表示）。 */
  float(): number {
    return this.nextU32() / TWO_POW_32;
  }

  /** lo ≤ x < hi 的小数。 */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.float();
  }

  /** 0 ≤ k < n 的整数，n 为 1 到 2^32 之间的整数。没有偏差（拒绝采样）。 */
  int(n: number): number {
    if (!(n >= 1 && n <= TWO_POW_32) || n !== trunc(n)) {
      throw new RangeError(`Rng.int: n 必须是 1 到 2^32 之间的整数，收到 ${n}`);
    }
    const limit = TWO_POW_32 - (TWO_POW_32 % n);
    let x = this.nextU32();
    while (x >= limit) x = this.nextU32();
    return x % n;
  }

  /** 以概率 p 返回 true。 */
  chance(p: number): boolean {
    return this.float() < p;
  }

  /** 正态分布（Marsaglia 极坐标法，用确定性的 log 和 sqrt）。 */
  normal(mean = 0, sd = 1): number {
    let u: number;
    let v: number;
    let s: number;
    do {
      u = this.float() * 2 - 1;
      v = this.float() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    return mean + sd * u * sqrt((-2 * log(s)) / s);
  }

  /** 从数组里等概率挑一个。 */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Rng.pick: 数组是空的');
    return items[this.int(items.length)]!;
  }

  /** 原地洗牌（Fisher–Yates）。 */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }
    return items;
  }

  /** 分出一个独立的随机数流（例如给每个子系统一条），本流前进 2 步。 */
  fork(): Rng {
    const seed = this.nextU32() ^ imul(this.nextU32(), 0x27d4eb2d);
    return new Rng(seed);
  }
}
