/**
 * 带版本号的数据格式（路线图阶段 0「数据格式带版本号」）。
 *
 * 世界数据、存档、回放、反馈码等所有会被保存或传出去的数据，外面都包一层：
 *   { format: '格式名', version: 版本号, data: 内容 }
 * 格式改变时：版本号加 1，并写一个「从旧版本升到新版本」的升级函数。
 * 读入时自动按顺序升级到最新版本，所以旧存档永远能打开（CLAUDE.md「数据和文字」）。
 */

export interface Versioned<T = unknown> {
  format: string;
  version: number;
  data: T;
}

export interface FormatSpec<T> {
  /** 格式名，例如 'save'、'world'、'replay'、'feedback'。 */
  format: string;
  /** 当前版本，从 1 开始。 */
  version: number;
  /** upgrades[n]：把第 n 版的内容升级成第 n+1 版。必须覆盖 1..version-1。 */
  upgrades: Readonly<Record<number, (old: unknown) => unknown>>;
  /** 检查最新版本的内容是否完整，不完整就抛错。 */
  validate: (data: unknown) => T;
}

export class FormatError extends Error {
  override name = 'FormatError';
}

export function defineFormat<T>(spec: FormatSpec<T>): FormatSpec<T> {
  if (!Number.isInteger(spec.version) || spec.version < 1) {
    throw new FormatError(`${spec.format}：版本号必须是正整数`);
  }
  for (let v = 1; v < spec.version; v++) {
    if (typeof spec.upgrades[v] !== 'function') {
      throw new FormatError(`${spec.format}：缺少从第 ${v} 版升级到第 ${v + 1} 版的函数`);
    }
  }
  return spec;
}

/** 包上格式名和当前版本号。 */
export function wrap<T>(spec: FormatSpec<T>, data: T): Versioned<T> {
  return { format: spec.format, version: spec.version, data };
}

/** 读入任意版本的数据，升级到最新版本并检查。 */
export function unwrap<T>(spec: FormatSpec<T>, input: unknown): T {
  if (typeof input !== 'object' || input === null) {
    throw new FormatError(`${spec.format}：不是有效的数据`);
  }
  const { format, version, data } = input as Partial<Versioned>;
  if (format !== spec.format) {
    throw new FormatError(`需要 ${spec.format} 格式，收到的是 ${String(format)}`);
  }
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new FormatError(`${spec.format}：版本号无效`);
  }
  if (version > spec.version) {
    throw new FormatError(`${spec.format}：数据是第 ${version} 版，比游戏支持的第 ${spec.version} 版新，请更新游戏`);
  }
  let current: unknown = data;
  for (let v = version; v < spec.version; v++) {
    current = spec.upgrades[v]!(current);
  }
  return spec.validate(current);
}
