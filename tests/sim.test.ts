import { describe, expect, it } from 'vitest';
import { HALF_L, HALF_W, Match, runMatch } from '../src/proto/sim.ts';

// 技术验证原型的固定答案：默认种子跑完整场的校验码。
// 本地（Intel Xeon）和 GitHub Actions（通常是 AMD）各跑一遍，对上了说明不同机器逐位一致。
// 原型的规则改了就会变，届时用 npm run bench 看新值并更新这里。
const EXPECTED_DEFAULT_MATCH = '2df1c2a4ee699950';

describe('技术验证原型：可重现', () => {
  it('默认种子的整场结果和固定答案一致', () => {
    expect(runMatch().hash).toBe(EXPECTED_DEFAULT_MATCH);
  });

  it('同一个种子跑两遍，逐位相同；一步一步跑和一口气跑也相同', () => {
    const a = runMatch({ seed: 7, halfMinutes: 10 });
    const b = runMatch({ seed: 7, halfMinutes: 10 });
    expect(b).toEqual(a);
    const m = new Match({ seed: 7, halfMinutes: 10 });
    while (!m.finished) m.step();
    expect(m.result()).toEqual(a);
    expect(m.result()).toEqual(a); // 反复取结果不影响校验码
  });

  it('不同种子，不同比赛', () => {
    const hashes = new Set([1, 2, 3, 4, 5].map((seed) => runMatch({ seed, halfMinutes: 5 }).hash));
    expect(hashes.size).toBe(5);
  });
});

describe('技术验证原型：没有离谱的数值', () => {
  it('整场踢完：没有 NaN，人和球都在场地附近，统计在宽松的范围内', () => {
    for (const seed of [11, 12, 13]) {
      const m = new Match({ seed });
      let minPlayersInPitch = 22;
      while (!m.finished) {
        m.step();
        if (m.tick % 200 === 0) {
          let inside = 0;
          for (const p of m.players) {
            expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.heading)).toBe(true);
            if (Math.abs(p.x) <= HALF_L + 1 && Math.abs(p.y) <= HALF_W + 1) inside++;
          }
          minPlayersInPitch = Math.min(minPlayersInPitch, inside);
          const b = m.ball;
          expect(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z)).toBe(true);
          expect(Math.abs(b.x) <= HALF_L + 3 && Math.abs(b.y) <= HALF_W + 3).toBe(true);
        }
      }
      expect(minPlayersInPitch).toBe(22);
      const r = m.result();
      expect(r.ticks).toBe(90 * 60 * 20);
      for (const s of r.stats) {
        expect(s.goals).toBeLessThan(15);
        expect(s.shots).toBeGreaterThan(3);
        expect(s.passes).toBeGreaterThan(200);
        const completion = s.passesCompleted / s.passes;
        expect(completion).toBeGreaterThan(0.4);
        expect(completion).toBeLessThan(0.99);
      }
      const poss = r.stats[0].possessionTicks / (r.stats[0].possessionTicks + r.stats[1].possessionTicks);
      expect(poss).toBeGreaterThan(0.2);
      expect(poss).toBeLessThan(0.8);
    }
  });
});
