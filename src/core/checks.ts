/**
 * 确定性自检用的固定计算：在一大批固定输入上跑数学函数和随机数，算出校验码。
 * 云端（Node）和每个浏览器各算一遍，校验码相同 = 这台设备和云端逐位一致。
 */
import { Hasher } from './hash.ts';
import * as M from './math.ts';
import { Rng } from './rng.ts';

/** 数学函数自检：每个函数各算几千个点，全部结果的二进制位喂进校验码。 */
export function mathChecksum(samples = 4000): string {
  const rng = new Rng(0x5eed0001);
  const h = new Hasher(1);
  for (let i = 0; i < samples; i++) {
    // 输入覆盖：小角度、大角度、负数、接近 0、整数等
    const u = rng.float();
    const angle = (u * 2 - 1) * 50; // ±50 弧度
    const small = (rng.float() * 2 - 1) * 1e-3;
    const pos = rng.float() * 100 + 1e-9;
    const wide = (rng.float() * 2 - 1) * 700;
    const y = (rng.float() * 2 - 1) * 60;
    const x = (rng.float() * 2 - 1) * 60;
    h.f64(M.sin(angle)).f64(M.cos(angle)).f64(M.tan(angle * 0.01));
    h.f64(M.sin(small)).f64(M.cos(small));
    h.f64(M.atan2(y, x)).f64(M.atan(y / 7)).f64(M.asin(u * 2 - 1)).f64(M.acos(u * 2 - 1));
    h.f64(M.exp(wide)).f64(M.exp(small)).f64(M.log(pos)).f64(M.log(pos * 1e-300));
    h.f64(M.pow(pos, u * 3 - 1.5)).f64(M.pow(x, 3)).f64(M.sqrt(pos)).f64(M.hypot(x, y));
    h.f64(M.sigmoid(y / 10)).f64(M.wrapAngle(wide));
  }
  return h.digest();
}

/** 随机数自检：各种抽取方式抽一大串。 */
export function rngChecksum(samples = 20000): string {
  const rng = new Rng(20261031);
  const h = new Hasher(2);
  for (let i = 0; i < samples; i++) {
    h.u32(rng.nextU32());
    h.f64(rng.float());
    h.u32(rng.int(1 + (i % 97)));
    h.f64(rng.normal());
  }
  const forked = rng.fork();
  for (let i = 0; i < 1000; i++) h.u32(forked.nextU32());
  return h.digest();
}
