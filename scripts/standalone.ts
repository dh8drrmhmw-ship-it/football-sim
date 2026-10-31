/**
 * 构建后处理：把 dist/index.html 引用的 JS 和 CSS 直接嵌进页面，生成两个单文件版本。
 * - dist/standalone.html：完整网页，一个文件就能打开（不依赖其他文件）。
 * - dist/artifact.html：发布成 claude.ai 测试链接用的版本（不带 html/head/body 外壳，由发布方包上）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');

const scriptRe = /<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/;
const styleRe = /<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/;

const scriptMatch = html.match(scriptRe);
const styleMatch = html.match(styleRe);
if (!scriptMatch || !styleMatch) {
  throw new Error('standalone: 在 dist/index.html 里找不到脚本或样式的引用，构建输出格式可能变了');
}

const js = readFileSync(join(dist, scriptMatch[1]!), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(dist, styleMatch[1]!), 'utf8');
const inlineScript = `<script type="module">\n${js}\n</script>`;
const inlineStyle = `<style>\n${css}\n</style>`;

// 1. 完整的单文件网页
const standalone = html
  .replace(scriptMatch[0], () => '')
  .replace(styleMatch[0], () => inlineStyle)
  .replace('</body>', () => `${inlineScript}\n</body>`);
writeFileSync(join(dist, 'standalone.html'), standalone);

// 2. 给 claude.ai 发布用：只要 title、meta、样式、正文和脚本
const title = html.match(/<title>[^<]*<\/title>/)?.[0] ?? '';
const body = html.match(/<body>([\s\S]*)<\/body>/)?.[1];
if (!body) throw new Error('standalone: 找不到 <body>');
const artifact = [
  title,
  '<meta name="claude:viewport-fit-sides" content="cover">',
  inlineStyle,
  body.trim(),
  inlineScript,
  '',
].join('\n');
writeFileSync(join(dist, 'artifact.html'), artifact);

console.log(`standalone: dist/standalone.html ${(standalone.length / 1024).toFixed(0)} KB, dist/artifact.html ${(artifact.length / 1024).toFixed(0)} KB`);
