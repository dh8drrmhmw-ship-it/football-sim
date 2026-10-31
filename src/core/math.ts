/**
 * 确定性数学（决策记录 D-006）。
 *
 * 比赛核心里唯一允许直接碰 Math 的文件。规则：
 * - 只转出「任何浏览器结果都一定相同」的函数：IEEE 754 要求精确舍入的 sqrt，
 *   以及取整、绝对值、最大最小、32 位整数乘法这类精确运算。
 * - 三角、反三角、指数、对数、乘方：浏览器自带的版本允许各家实现有细微差别，
 *   这里只用加减乘除和 sqrt 自己实现。加减乘除在所有 JavaScript 引擎里都按 IEEE 754
 *   双精度精确舍入，所以结果逐位相同。
 * - 精度：在游戏用到的范围内（角度绝对值 < 1e6，指数参数 < 700）误差在 1e-15 量级。
 *   精度不是第一目标，「每台设备逐位相同」才是。
 *
 * 改动本文件里任何一个算法都会改变比赛结果（旧回放就对不上了），
 * 所以 tests/math.test.ts 里有一个固定答案的校验码，改了必须有意识地更新它。
 */

// ---- 精确运算：直接转出 ----

export const sqrt = Math.sqrt;
export const abs = Math.abs;
export const floor = Math.floor;
export const ceil = Math.ceil;
export const round = Math.round;
export const trunc = Math.trunc;
export const min = Math.min;
export const max = Math.max;
export const sign = Math.sign;
export const imul = Math.imul;
export const clz32 = Math.clz32;
export const fround = Math.fround;

// ---- 常数（由高精度十进制推出，见 docs/决策记录.md D-012） ----

export const PI = 3.141592653589793;
export const HALF_PI = 1.5707963267948966;
export const TAU = 6.283185307179586;
export const LN2 = 0.6931471805599453;
export const SQRT2 = 1.4142135623730951;

const TWO_OVER_PI = 0.6366197723675814;
// π/2 拆成高低两段：高段只有 31 位有效数字，k*PIO2_HI 在 |k| < 2^22 时是精确的。
const PIO2_HI = 1.5707963267341256;
const PIO2_LO = 6.077100506506192e-11;
// ln2 同理拆成两段：k*LN2_HI 在 |k| < 2^21 时是精确的。
const LN2_HI = 0.6931471803691238;
const LN2_LO = 1.9082149292705877e-10;
const INV_LN2 = 1.4426950408889634;
const SQRT3 = 1.7320508075688772;
const PI_6 = 0.5235987755982989;
const TAN_PI_12 = 0.2679491924311228; // 2 - √3

// ---- 多项式系数（泰勒级数，|r| 足够小时误差低于双精度的最后一位） ----

// sin(r) = r + r^3 * (S1 + r^2 * (S2 + ...))，|r| ≤ π/4 时截断误差 < 5e-17
const S1 = -1 / 6;
const S2 = 1 / 120;
const S3 = -1 / 5040;
const S4 = 1 / 362880;
const S5 = -1 / 39916800;
const S6 = 1 / 6227020800;
const S7 = -1 / 1307674368000;

// cos(r) = 1 + r^2 * (C1 + r^2 * (C2 + ...))，|r| ≤ π/4 时截断误差 < 3e-18
const C1 = -1 / 2;
const C2 = 1 / 24;
const C3 = -1 / 720;
const C4 = 1 / 40320;
const C5 = -1 / 3628800;
const C6 = 1 / 479001600;
const C7 = -1 / 87178291200;
const C8 = 1 / 20922789888000;

function sinPoly(r: number): number {
  const z = r * r;
  return r + r * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * (S6 + z * S7))))));
}

function cosPoly(r: number): number {
  const z = r * r;
  return 1 + z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * (C6 + z * (C7 + z * C8)))))));
}

// 先把 x 化成 k·(π/2) + r（|r| ≤ π/4 左右），再按 k 除以 4 的余数决定象限。
export function sin(x: number): number {
  const k = round(x * TWO_OVER_PI);
  const r = x - k * PIO2_HI - k * PIO2_LO;
  switch (k & 3) {
    case 0:
      return sinPoly(r);
    case 1:
      return cosPoly(r);
    case 2:
      return -sinPoly(r);
    default:
      return -cosPoly(r);
  }
}

export function cos(x: number): number {
  const k = round(x * TWO_OVER_PI);
  const r = x - k * PIO2_HI - k * PIO2_LO;
  switch (k & 3) {
    case 0:
      return cosPoly(r);
    case 1:
      return -sinPoly(r);
    case 2:
      return -cosPoly(r);
    default:
      return sinPoly(r);
  }
}

export function tan(x: number): number {
  return sin(x) / cos(x);
}

// atan(t) = t + t^3 * (A1 + t^2 * (A2 + ...))，|t| ≤ tan(π/12) ≈ 0.268 时截断误差 < 2e-17
// （多项式都按霍纳法则展开写：运算顺序固定，结果逐位确定，也比循环快）
const A1 = -1 / 3;
const A2 = 1 / 5;
const A3 = -1 / 7;
const A4 = 1 / 9;
const A5 = -1 / 11;
const A6 = 1 / 13;
const A7 = -1 / 15;
const A8 = 1 / 17;
const A9 = -1 / 19;
const A10 = 1 / 21;
const A11 = -1 / 23;
const A12 = 1 / 25;
const A13 = -1 / 27;

function atanSmall(t: number): number {
  const z = t * t;
  const p =
    A1 + z * (A2 + z * (A3 + z * (A4 + z * (A5 + z * (A6 + z * (A7 + z * (A8 + z * (A9 + z * (A10 + z * (A11 + z * (A12 + z * A13)))))))))));
  return t + t * z * p;
}

/** 0 ≤ t ≤ 1 */
function atanUnit(t: number): number {
  if (t > TAN_PI_12) {
    // atan(t) = π/6 + atan((t·√3 − 1) / (t + √3))
    return PI_6 + atanSmall((t * SQRT3 - 1) / (t + SQRT3));
  }
  return atanSmall(t);
}

export function atan(x: number): number {
  if (x !== x) return x; // NaN
  const neg = x < 0;
  const a = neg ? -x : x;
  const r = a > 1 ? HALF_PI - atanUnit(1 / a) : atanUnit(a);
  return neg ? -r : r;
}

/** 点 (x, y) 的方向角，范围 (-π, π]。两个参数都是 0 时返回 0。 */
export function atan2(y: number, x: number): number {
  if (x !== x || y !== y) return NaN;
  const ax = abs(x);
  const ay = abs(y);
  if (ax === 0 && ay === 0) return 0;
  let r: number;
  if (ay <= ax) {
    r = atanUnit(ay / ax);
  } else {
    r = HALF_PI - atanUnit(ax / ay);
  }
  if (x < 0) r = PI - r;
  return y < 0 ? -r : r;
}

export function asin(x: number): number {
  return atan2(x, sqrt((1 - x) * (1 + x)));
}

export function acos(x: number): number {
  return atan2(sqrt((1 - x) * (1 + x)), x);
}

// ---- 指数和对数 ----

// 2^k 表，k = -1022..1023，全部由反复乘 2 或除以 2 得到，是精确值。
const POW2_MIN = -1022;
const POW2_MAX = 1023;
const POW2 = new Float64Array(POW2_MAX - POW2_MIN + 1);
{
  let p = 1;
  for (let k = 0; k <= POW2_MAX; k++) {
    POW2[k - POW2_MIN] = p;
    p *= 2;
  }
  p = 1;
  for (let k = 0; k >= POW2_MIN; k--) {
    POW2[k - POW2_MIN] = p;
    p *= 0.5;
  }
}

/** x · 2^k（k 为整数）。 */
export function ldexp(x: number, k: number): number {
  while (k > POW2_MAX) {
    x *= POW2[POW2_MAX - POW2_MIN]!;
    k -= POW2_MAX;
  }
  while (k < POW2_MIN) {
    x *= POW2[0]!;
    k -= POW2_MIN;
  }
  return x * POW2[k - POW2_MIN]!;
}

// exp(r) 的泰勒系数 1/n!，n = 2..13；|r| ≤ ln2/2 时截断误差 < 5e-18
const E2 = 1 / 2;
const E3 = 1 / 6;
const E4 = 1 / 24;
const E5 = 1 / 120;
const E6 = 1 / 720;
const E7 = 1 / 5040;
const E8 = 1 / 40320;
const E9 = 1 / 362880;
const E10 = 1 / 3628800;
const E11 = 1 / 39916800;
const E12 = 1 / 479001600;
const E13 = 1 / 6227020800;

export function exp(x: number): number {
  if (x !== x) return x;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019412) return 0;
  const k = round(x * INV_LN2);
  const r = x - k * LN2_HI - k * LN2_LO;
  const p = E2 + r * (E3 + r * (E4 + r * (E5 + r * (E6 + r * (E7 + r * (E8 + r * (E9 + r * (E10 + r * (E11 + r * (E12 + r * E13))))))))));
  const er = 1 + r + r * r * p;
  return ldexp(er, k);
}

// 读写双精度数的二进制位：DataView 是 ECMAScript 标准，并且显式指定字节序，结果与设备无关。
const bitsView = new DataView(new ArrayBuffer(8));

// log(m) = 2·atanh(s)，s = (m−1)/(m+1)，|s| ≤ 0.1716；系数 1/(2n+1)
const L1 = 1 / 3;
const L2 = 1 / 5;
const L3 = 1 / 7;
const L4 = 1 / 9;
const L5 = 1 / 11;
const L6 = 1 / 13;
const L7 = 1 / 15;
const L8 = 1 / 17;
const L9 = 1 / 19;
const L10 = 1 / 21;

export function log(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let e = 0;
  if (x < 2.2250738585072014e-308) {
    // 次正规数：先放大 2^54
    x *= 18014398509481984;
    e = -54;
  }
  bitsView.setFloat64(0, x, true);
  const hi = bitsView.getUint32(4, true);
  e += ((hi >>> 20) & 0x7ff) - 1023;
  // 把指数位改成 0（即 2^0），得到 [1, 2) 之间的尾数 m
  bitsView.setUint32(4, (hi & 0x000fffff) | 0x3ff00000, true);
  let m = bitsView.getFloat64(0, true);
  if (m > SQRT2) {
    m *= 0.5;
    e += 1;
  }
  const s = (m - 1) / (m + 1);
  const z = s * s;
  const p = L1 + z * (L2 + z * (L3 + z * (L4 + z * (L5 + z * (L6 + z * (L7 + z * (L8 + z * (L9 + z * L10))))))));
  const logm = 2 * s + 2 * s * z * p;
  return e * LN2_HI + (logm + e * LN2_LO);
}

/** 整数次方：反复平方，只用乘法。 */
function powInt(x: number, n: number): number {
  const neg = n < 0;
  if (neg) n = -n;
  let result = 1;
  let base = x;
  while (n > 0) {
    if (n % 2 === 1) result *= base;
    base *= base;
    n = floor(n / 2);
  }
  return neg ? 1 / result : result;
}

export function pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (x !== x || y !== y) return NaN;
  if (y === trunc(y) && abs(y) <= 1048576) return powInt(x, y);
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) return NaN; // 负数的非整数次方没有实数结果
  return exp(y * log(x));
}

// ---- 常用小工具 ----

export function hypot(x: number, y: number): number {
  return sqrt(x * x + y * y);
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 逻辑函数 1 / (1 + e^-x)，常用来把评分变成概率。 */
export function sigmoid(x: number): number {
  return 1 / (1 + exp(-x));
}

/** 把角度规整到 (-π, π]。 */
export function wrapAngle(a: number): number {
  if (a > -PI && a <= PI) return a;
  a -= TAU * floor((a + PI) / TAU);
  return a <= -PI ? a + TAU : a;
}
