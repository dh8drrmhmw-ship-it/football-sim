import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import { mathChecksum, rngChecksum } from './src/core/checks.ts';
import { zh } from './src/i18n/zh.ts';
import { runMatch } from './src/proto/sim.ts';

function gitVersion(): string {
  const sha = process.env['GITHUB_SHA'];
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

// 「云端答案」：构建时在 Node 里算一遍，写进页面；浏览器里再算一遍，两边比对。
const match = runMatch();
const expected = {
  math: mathChecksum(),
  rng: rngChecksum(),
  match: match.hash,
  seed: 20261031,
  score: match.score,
};
const build = { version: gitVersion(), date: new Date().toISOString().slice(0, 10) };

// 页面标题也从翻译表来（index.html 里只写占位符）。
const titleFromTable: Plugin = {
  name: 'title-from-i18n',
  transformIndexHtml: (html) => html.replace('%LAB_TITLE%', zh['lab.title']),
};

export default defineConfig({
  base: './',
  plugins: [titleFromTable],
  define: {
    __EXPECTED__: JSON.stringify(expected),
    __BUILD__: JSON.stringify(build),
  },
  build: {
    target: 'es2022',
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
    // 不压缩：测试页很小，保持可读方便排查问题
    minify: false,
  },
});
