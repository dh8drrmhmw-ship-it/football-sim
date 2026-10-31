/**
 * 云端测速：用 Node 跑技术验证原型的整场比赛，报告一场要多久（决策记录 D-004）。
 *
 * 用法：npm run bench -- [--runs 5] [--seed 20261031] [--variants]
 *   --variants  另外跑几个「去掉某部分思考」的版本，估算各部分各占多少时间
 * 在 GitHub Actions 里运行时，结果会写进这次运行的摘要页。
 */
import { appendFileSync } from 'node:fs';
import { arch, cpus, platform } from 'node:os';
import { performance } from 'node:perf_hooks';
import { DEFAULT_CONFIG, runMatch, type SimConfig } from '../src/proto/sim.ts';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const runs = arg('runs', 5);
const seed = arg('seed', DEFAULT_CONFIG.seed);
const variants = process.argv.includes('--variants');

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

interface Timing {
  label: string;
  first: number;
  median: number;
  hash: string;
  consistent: boolean;
}

function time(label: string, config: Partial<SimConfig>, n: number): Timing {
  const times: number[] = [];
  const hashes = new Set<string>();
  let first = 0;
  for (let i = 0; i <= n; i++) {
    const t0 = performance.now();
    const r = runMatch({ seed, ...config });
    const ms = performance.now() - t0;
    hashes.add(r.hash);
    if (i === 0) first = ms;
    else times.push(ms);
  }
  const [hash] = hashes;
  return { label, first, median: median(times), hash: hash!, consistent: hashes.size === 1 };
}

const sample = runMatch({ seed });
const [h, a] = sample.stats;
const cpu = cpus()[0]?.model ?? 'unknown';
console.log(`环境：Node ${process.version} · ${platform()} ${arch()} · ${cpu}`);
console.log(`种子 ${seed}：比分 ${sample.score[0]}:${sample.score[1]}，校验码 ${sample.hash}`);
for (const [name, s] of [['主队', h!], ['客队', a!]] as const) {
  const pct = s.passes ? ((100 * s.passesCompleted) / s.passes).toFixed(0) : '-';
  const poss = ((100 * s.possessionTicks) / (h!.possessionTicks + a!.possessionTicks)).toFixed(0);
  console.log(
    `  ${name}：射门 ${s.shots}（射正 ${s.shotsOnTarget}），传球 ${s.passes}（成功 ${pct}%），` +
      `抢断 ${s.tackles}，拦截 ${s.interceptions}，控球 ${poss}%`,
  );
}

const results: Timing[] = [time('标准', {}, runs)];
if (variants) {
  results.push(time('无球球员不思考', { offBallThinkTicks: 1_000_000 }, runs));
  results.push(time('持球人每 0.5 秒才想一次', { carrierThinkTicks: 10 }, runs));
  results.push(time('不算校验码', { hashEveryTicks: 0 }, runs));
  results.push(time('每秒 10 步', { hz: 10, offBallThinkTicks: 3, carrierThinkTicks: 1 }, runs));
  results.push(time('思考频率加倍', { offBallThinkTicks: 2, carrierThinkTicks: 1 }, runs));
}

console.log(`\n一场完整比赛（90 分钟）的模拟用时，首次 + 之后 ${runs} 次的中位数：`);
for (const r of results) {
  console.log(
    `  ${r.label.padEnd(16)} 首次 ${r.first.toFixed(0).padStart(5)} 毫秒   中位数 ${r.median.toFixed(0).padStart(5)} 毫秒` +
      `   ${r.consistent ? '每次结果相同' : '！！结果不一致'}`,
  );
}

const summary = process.env['GITHUB_STEP_SUMMARY'];
if (summary) {
  const lines = [
    '### 云端测速（技术验证原型）',
    '',
    `Node ${process.version} · ${cpu}`,
    '',
    '| 版本 | 首次（毫秒） | 中位数（毫秒） | 结果一致 |',
    '|---|---|---|---|',
    ...results.map((r) => `| ${r.label} | ${r.first.toFixed(0)} | ${r.median.toFixed(0)} | ${r.consistent ? '是' : '否'} |`),
    '',
    `校验码 \`${sample.hash}\`，比分 ${sample.score[0]}:${sample.score[1]}`,
    '',
  ];
  appendFileSync(summary, lines.join('\n'));
}

if (results.some((r) => !r.consistent)) process.exit(1);
