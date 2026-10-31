/**
 * 中英双语：t(key, 参数) 取当前语言的文字。
 * 语言选择顺序：网址里的 ?lang=zh|en → 上次的选择 → 浏览器语言（中文开头用中文，否则英文）。
 */
import { en } from './en.ts';
import { zh, type MessageKey } from './zh.ts';

export type Lang = 'zh' | 'en';
export type { MessageKey };

export const LANGS: readonly Lang[] = ['zh', 'en'];

const TABLES: Record<Lang, Record<MessageKey, string>> = { zh, en };

export type Params = Record<string, string | number>;

export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  const text = TABLES[lang][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole,
  );
}

export function isLang(x: unknown): x is Lang {
  return x === 'zh' || x === 'en';
}

export function pickLang(urlLang: string | null, stored: string | null, browserLangs: readonly string[]): Lang {
  if (isLang(urlLang)) return urlLang;
  if (isLang(stored)) return stored;
  for (const l of browserLangs) {
    const lower = l.toLowerCase();
    if (lower.startsWith('zh')) return 'zh';
    if (lower.startsWith('en')) return 'en';
  }
  return 'zh';
}

/** 文字里的 {占位符} 名字（测试用）。 */
export function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function table(lang: Lang): Readonly<Record<MessageKey, string>> {
  return TABLES[lang];
}
