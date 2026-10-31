import { describe, expect, it } from 'vitest';
import { LANGS, pickLang, placeholders, table, translate } from '../src/i18n/index.ts';
import { zh } from '../src/i18n/zh.ts';

describe('中英翻译表', () => {
  it('两种语言的条目完全相同，并且都不是空的', () => {
    const keys = Object.keys(zh).sort();
    for (const lang of LANGS) {
      const t = table(lang);
      expect(Object.keys(t).sort()).toEqual(keys);
      for (const k of keys) expect((t as Record<string, string>)[k]!.trim().length).toBeGreaterThan(0);
    }
  });

  it('每一条的占位符中英一致', () => {
    const en = table('en') as Record<string, string>;
    for (const [k, v] of Object.entries(zh)) {
      expect(placeholders(en[k]!), k).toEqual(placeholders(v));
    }
  });

  it('填参数', () => {
    expect(translate('zh', 'lab.running', { done: 2, total: 7 })).toBe('正在测试…（2/7）');
    expect(translate('en', 'speed.first', { ms: 812 })).toBe('First run 812 ms');
    expect(translate('zh', 'lab.title')).toBe('足球模拟实验室');
  });

  it('选语言：网址参数 > 上次选择 > 浏览器语言 > 中文', () => {
    expect(pickLang('en', 'zh', ['zh-CN'])).toBe('en');
    expect(pickLang(null, 'en', ['zh-CN'])).toBe('en');
    expect(pickLang(null, null, ['zh-Hans-CN', 'en'])).toBe('zh');
    expect(pickLang(null, null, ['en-US'])).toBe('en');
    expect(pickLang('xx', 'yy', ['fr-FR'])).toBe('zh');
  });
});
