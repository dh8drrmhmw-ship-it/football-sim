/**
 * 校验码：把一串数字（比赛过程中所有人和球的坐标等）压成一个 16 位十六进制字符串。
 * 两台设备算出的校验码相同，就说明它们模拟出的比赛逐位相同（决策记录 D-006）。
 *
 * 做法：两条 MurmurHash3 风格的 32 位通道，合起来 64 位。浮点数按 IEEE 754 的二进制位喂进去，
 * NaN 统一成一个值、-0 统一成 0，避免引擎在这两处的合法差异造成误报。
 * 这不是加密用的哈希，只用来发现「算得不一样」。
 */
import { imul } from './math.ts';

const C1 = 0xcc9e2d51;
const C2 = 0x1b873593;

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

function mixLane(h: number, word: number): number {
  let k = imul(word, C1);
  k = rotl(k, 15);
  k = imul(k, C2);
  h ^= k;
  h = rotl(h, 13);
  return (imul(h, 5) + 0xe6546b64) | 0;
}

function fmix(h: number): number {
  h ^= h >>> 16;
  h = imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function hex8(x: number): string {
  return (x >>> 0).toString(16).padStart(8, '0');
}

export class Hasher {
  private h1: number;
  private h2: number;
  private count = 0;
  private readonly view = new DataView(new ArrayBuffer(8));

  constructor(seed = 0) {
    this.h1 = (seed ^ 0x3c6ef372) | 0;
    this.h2 = (seed ^ 0x6a09e667) | 0;
  }

  /** 喂一个 32 位整数。 */
  u32(x: number): this {
    this.h1 = mixLane(this.h1, x | 0);
    this.h2 = mixLane(this.h2, (x | 0) ^ 0x5bd1e995);
    this.count++;
    return this;
  }

  /** 喂一个双精度浮点数（按二进制位）。 */
  f64(x: number): this {
    if (x !== x) {
      return this.u32(0x7ff80000).u32(0);
    }
    if (x === 0) x = 0; // -0 → 0
    this.view.setFloat64(0, x, true);
    return this.u32(this.view.getUint32(0, true)).u32(this.view.getUint32(4, true));
  }

  /** 喂一个字符串（按 UTF-16 编码单元）。 */
  str(s: string): this {
    this.u32(s.length);
    for (let i = 0; i < s.length; i++) this.u32(s.charCodeAt(i));
    return this;
  }

  /** 当前的 64 位校验码，16 个十六进制字符。不影响继续喂数据。 */
  digest(): string {
    let a = this.h1 ^ this.count;
    let b = this.h2 ^ this.count;
    a = (a + b) | 0;
    b = (b + a) | 0;
    a = fmix(a);
    b = fmix(b);
    a = (a + b) | 0;
    b = (b + a) | 0;
    return hex8(a) + hex8(b);
  }
}

/** 校验码的短格式（给人看）：前 8 位，中间加横线，例如 1a2b-3c4d。 */
export function shortCode(digest: string): string {
  return `${digest.slice(0, 4)}-${digest.slice(4, 8)}`;
}
