/**
 * 实验室页面：确定性自检 + 测速 + 原型比赛画面。
 * 页面层可以用浏览器接口（计时、画布、剪贴板）；比赛核心本身不碰这些（决策记录 D-005）。
 */
import './style.css';
import { mathChecksum, rngChecksum } from '../core/checks.ts';
import { shortCode } from '../core/hash.ts';
import { isLang, pickLang, translate, type Lang, type MessageKey, type Params } from '../i18n/index.ts';
import { runMatch } from '../proto/sim.ts';
import { detectDevice } from './device.ts';
import { Viewer } from './viewer.ts';

const TIMED_RUNS = 5; // 首次之外再测几次
const TOTAL_STEPS = 2 + 1 + TIMED_RUNS; // 数学、随机数、首次、之后几次

const expected = __EXPECTED__;
const build = __BUILD__;

// ---- 语言 ----

function readStoredLang(): string | null {
  try {
    return localStorage.getItem('lab.lang');
  } catch {
    return null;
  }
}

function storeLang(lang: Lang): void {
  try {
    localStorage.setItem('lab.lang', lang);
  } catch {
    // 无痕模式等情况下存不了，忽略
  }
}

let lang: Lang = pickLang(new URLSearchParams(location.search).get('lang'), readStoredLang(), navigator.languages ?? []);

function t(key: MessageKey, params?: Params): string {
  return translate(lang, key, params);
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

// ---- 测试状态 ----

type CheckState = 'pending' | 'pass' | 'fail';

interface Results {
  math: { state: CheckState; code: string };
  rng: { state: CheckState; code: string };
  match: { ok: number; total: number; code: string };
  first: number | null;
  times: number[];
  finished: boolean;
}

function freshResults(): Results {
  return {
    math: { state: 'pending', code: '' },
    rng: { state: 'pending', code: '' },
    match: { ok: 0, total: 0, code: '' },
    first: null,
    times: [],
    finished: false,
  };
}

let results = freshResults();
let running = false;
let progress = 0;

const device = detectDevice(navigator.userAgent, navigator.hardwareConcurrency || 0, navigator.maxTouchPoints || 0);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function matchState(): CheckState {
  const m = results.match;
  if (m.total === 0) return 'pending';
  return m.ok === m.total ? 'pass' : 'fail';
}

function allPass(): boolean {
  return results.math.state === 'pass' && results.rng.state === 'pass' && matchState() === 'pass';
}

// ---- 渲染 ----

function setPill(el: HTMLElement, state: CheckState | 'fast' | 'ok' | 'slow' | 'none', text: string): void {
  el.dataset['state'] = state;
  el.textContent = text;
}

function checkLabel(state: CheckState): string {
  return t(state === 'pass' ? 'check.pass' : state === 'fail' ? 'check.fail' : 'check.pending');
}

function renderStatic(): void {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.title = t('lab.title');
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = t(el.dataset['i18n'] as MessageKey);
  }
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(el.dataset['i18nAria'] as MessageKey));
  }
  for (const el of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
    el.textContent = t('viewer.speed', { x: el.dataset['speed'] ?? '' });
  }
  for (const el of document.querySelectorAll<HTMLButtonElement>('[data-lang]')) {
    el.setAttribute('aria-pressed', String(el.dataset['lang'] === lang));
  }
  $('build').textContent = t('lab.build', { version: build.version, date: build.date });
  $('sb-home').textContent = t('viewer.home');
  $('sb-away').textContent = t('viewer.away');
  renderResults();
  renderViewerButton();
}

function renderResults(): void {
  const start = $('start') as HTMLButtonElement;
  start.disabled = running;
  start.textContent = t(results.finished ? 'lab.again' : 'lab.start');
  const bar = $('progress');
  bar.hidden = !running && !results.finished;
  ($('progress-bar') as HTMLElement).style.width = `${(100 * progress) / TOTAL_STEPS}%`;
  $('status').textContent = running
    ? t('lab.running', { done: progress, total: TOTAL_STEPS })
    : results.finished
      ? `${t('lab.done')} · ${t(allPass() ? 'check.summaryPass' : 'check.summaryFail')}`
      : '';

  const rows: [string, CheckState, string, string][] = [
    ['math', results.math.state, results.math.code, expected.math],
    ['rng', results.rng.state, results.rng.code, expected.rng],
    ['match', matchState(), results.match.code, expected.match],
  ];
  for (const [id, state, code, cloud] of rows) {
    let label = checkLabel(state);
    if (id === 'match' && results.match.total > 0) {
      label = `${label} · ${t('check.runs', { ok: results.match.ok, total: results.match.total })}`;
    }
    setPill($(`pill-${id}`), state, label);
    $(`code-${id}`).textContent = code ? shortCode(code) : '';
    $(`cloud-${id}`).textContent = t('check.cloud', { code: shortCode(cloud) });
  }

  const big = $('speed-median');
  const unit = $('speed-unit');
  if (results.times.length > 0) {
    const med = median(results.times);
    big.textContent = med.toFixed(0);
    unit.textContent = t('speed.unit');
    const verdict = med < 1000 ? 'fast' : med < 3000 ? 'ok' : 'slow';
    setPill($('speed-pill'), verdict, t(`speed.${verdict}`));
    $('speed-factor').textContent = t('speed.factor', { x: Math.round((90 * 60 * 1000) / med) });
  } else if (results.first !== null) {
    big.textContent = results.first.toFixed(0);
    unit.textContent = t('speed.unit');
  } else {
    big.textContent = '—';
    unit.textContent = '';
    setPill($('speed-pill'), 'none', '');
    $('speed-factor').textContent = '';
  }
  $('speed-first').textContent = results.first !== null ? t('speed.first', { ms: results.first.toFixed(0) }) : '';

  $('device').textContent = t('copy.device', { device: device.label ?? t('device.unknown') });
  const report = $('report') as HTMLTextAreaElement;
  report.value = results.finished ? reportText() : '';
  report.placeholder = t('copy.empty');
  ($('copy') as HTMLButtonElement).disabled = !results.finished;
}

function reportText(): string {
  const r = results;
  const lines = [
    t('report.header'),
    t('report.version', { version: build.version, date: build.date }),
    t('report.device', { device: device.label ?? t('device.unknown'), cores: device.cores || '?' }),
    t('report.check', {
      status: t(allPass() ? 'check.summaryPass' : 'check.summaryFail'),
      math: checkLabel(r.math.state),
      rng: checkLabel(r.rng.state),
      ok: r.match.ok,
      total: r.match.total,
    }),
    t('report.speed', {
      first: (r.first ?? 0).toFixed(0),
      runs: r.times.length,
      median: median(r.times).toFixed(0),
    }),
    t('report.codes', {
      codes: [r.math.code, r.rng.code, r.match.code].map((c) => shortCode(c)).join(' '),
    }),
    t('report.ua', { ua: device.ua }),
  ];
  return lines.join('\n');
}

// ---- 测试流程 ----

function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 40));
}

async function runTests(): Promise<void> {
  if (running) return;
  viewer?.pause();
  renderViewerButton();
  $('viewer-note').textContent = t('viewer.paused');
  running = true;
  progress = 0;
  results = freshResults();
  renderResults();
  await nextFrame();

  const math = mathChecksum();
  results.math = { state: math === expected.math ? 'pass' : 'fail', code: math };
  progress++;
  renderResults();
  await nextFrame();

  const rng = rngChecksum();
  results.rng = { state: rng === expected.rng ? 'pass' : 'fail', code: rng };
  progress++;
  renderResults();
  await nextFrame();

  for (let i = 0; i <= TIMED_RUNS; i++) {
    const t0 = performance.now();
    const r = runMatch();
    const ms = performance.now() - t0;
    results.match.total++;
    if (r.hash === expected.match) results.match.ok++;
    if (!results.match.code || r.hash !== expected.match) results.match.code = r.hash;
    if (i === 0) results.first = ms;
    else results.times.push(ms);
    progress++;
    renderResults();
    await nextFrame();
  }

  running = false;
  results.finished = true;
  $('viewer-note').textContent = '';
  renderResults();
}

// ---- 复制结果 ----

async function copyReport(): Promise<void> {
  const text = reportText();
  const status = $('copy-status');
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = t('copy.copied');
  } catch {
    const area = $('report') as HTMLTextAreaElement;
    area.focus();
    area.select();
    status.textContent = t('copy.manual');
  }
}

// ---- 比赛画面 ----

let viewer: Viewer | null = null;

function renderViewerButton(): void {
  const btn = $('play');
  btn.textContent = t(viewer?.isPlaying ? 'viewer.pause' : 'viewer.play');
}

function formatClock(minute: number): string {
  const total = Math.floor(minute * 60);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function setupViewer(): void {
  const canvas = $('pitch') as HTMLCanvasElement;
  viewer = new Viewer(canvas, {
    onFrame(minute, score) {
      $('sb-clock').textContent = formatClock(minute);
      $('sb-score').textContent = `${score[0]} : ${score[1]}`;
    },
  });
  $('play').addEventListener('click', () => {
    if (!viewer || running) return;
    if (viewer.isPlaying) viewer.pause();
    else viewer.play();
    renderViewerButton();
  });
  $('restart').addEventListener('click', () => {
    viewer?.restart();
  });
  for (const el of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
    el.addEventListener('click', () => {
      viewer?.setSpeed(Number(el.dataset['speed']));
      for (const other of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
        other.setAttribute('aria-pressed', String(other === el));
      }
    });
  }
}

// ---- 启动 ----

function main(): void {
  for (const el of document.querySelectorAll<HTMLButtonElement>('[data-lang]')) {
    el.addEventListener('click', () => {
      const next = el.dataset['lang'];
      if (isLang(next) && next !== lang) {
        lang = next;
        storeLang(lang);
        renderStatic();
      }
    });
  }
  $('start').addEventListener('click', () => void runTests());
  $('copy').addEventListener('click', () => void copyReport());
  setupViewer();
  renderStatic();
}

main();
