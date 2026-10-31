import { describe, expect, it } from 'vitest';
import { defineFormat, FormatError, unwrap, wrap } from '../src/data/versioned.ts';

// 一个假想的存档格式，演示三个版本的升级链：
// v1 { name }  →  v2 { name, money }  →  v3 { manager: { name }, money }
interface SaveV3 {
  manager: { name: string };
  money: number;
}

const save = defineFormat<SaveV3>({
  format: 'demo-save',
  version: 3,
  upgrades: {
    1: (old) => ({ ...(old as { name: string }), money: 0 }),
    2: (old) => {
      const o = old as { name: string; money: number };
      return { manager: { name: o.name }, money: o.money };
    },
  },
  validate: (data) => {
    const d = data as SaveV3;
    if (typeof d?.manager?.name !== 'string' || typeof d.money !== 'number') throw new FormatError('存档不完整');
    return d;
  },
});

describe('带版本号的数据格式', () => {
  it('当前版本：包上再拆开，内容不变', () => {
    const data = { manager: { name: '张三' }, money: 100 };
    const env = wrap(save, data);
    expect(env).toEqual({ format: 'demo-save', version: 3, data });
    expect(unwrap(save, JSON.parse(JSON.stringify(env)))).toEqual(data);
  });

  it('旧版本自动一级一级升级到最新', () => {
    expect(unwrap(save, { format: 'demo-save', version: 1, data: { name: '李四' } })).toEqual({
      manager: { name: '李四' },
      money: 0,
    });
    expect(unwrap(save, { format: 'demo-save', version: 2, data: { name: '王五', money: 7 } })).toEqual({
      manager: { name: '王五' },
      money: 7,
    });
  });

  it('拒绝：格式不对、版本比游戏新、版本号无效、内容不完整', () => {
    expect(() => unwrap(save, { format: 'world', version: 1, data: {} })).toThrow(FormatError);
    expect(() => unwrap(save, { format: 'demo-save', version: 4, data: {} })).toThrow(/请更新游戏/);
    expect(() => unwrap(save, { format: 'demo-save', version: 0, data: {} })).toThrow(FormatError);
    expect(() => unwrap(save, { format: 'demo-save', version: 3, data: { money: 1 } })).toThrow(/不完整/);
    expect(() => unwrap(save, null)).toThrow(FormatError);
  });

  it('定义格式时就检查升级链是否完整', () => {
    expect(() =>
      defineFormat({ format: 'broken', version: 3, upgrades: { 1: (x) => x }, validate: (x) => x }),
    ).toThrow(/第 2 版/);
  });
});
