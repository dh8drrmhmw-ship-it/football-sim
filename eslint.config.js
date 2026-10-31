// 代码检查规则。最重要的是下面「比赛核心」一段：把决策记录 D-005、D-006 写成机器能检查的规则。
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// 比赛核心和技术验证原型：结果必须在任何设备上完全一样。
const CORE_FILES = ['src/core/**/*.ts', 'src/proto/**/*.ts'];
// 唯一允许直接使用 Math 的文件（只转出各浏览器结果一定相同的函数）。
const DET_MATH_FILE = 'src/core/math.ts';

const coreGlobalBans = [
  { name: 'Date', message: '比赛核心不能读系统时间（D-006）。' },
  { name: 'Intl', message: 'Intl 的结果随系统语言变化，比赛核心不能用。' },
  { name: 'performance', message: '计时放在核心外面（测速脚本或页面）。' },
  ...[
    'setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask', 'requestAnimationFrame',
    'window', 'self', 'globalThis', 'global', 'document', 'navigator', 'location',
    'process', 'require', 'module', 'Buffer', 'console',
    'crypto', 'fetch', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage', 'indexedDB',
    'eval', 'Function', 'WeakRef', 'FinalizationRegistry', 'SharedArrayBuffer', 'Atomics',
  ].map((name) => ({ name, message: `比赛核心不依赖运行环境，不能用 ${name}（D-005）。` })),
];

const mathGlobalBan = {
  name: 'Math',
  message: '比赛核心请用 src/core/math.ts 的确定性数学函数（D-006）。',
};

// 这些 Math 函数在不同浏览器里结果可能差最后几位，连 math.ts 也不许用。
const NONDETERMINISTIC_MATH = [
  'random', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow', 'cbrt', 'hypot',
];

const localeBans = [
  'localeCompare', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString',
  'toLocaleUpperCase', 'toLocaleLowerCase',
].map((property) => ({ property, message: '结果随系统语言变化，比赛核心不能用。' }));

const coreSyntaxBans = [
  {
    selector: "BinaryExpression[operator='**']",
    message: '乘方运算符的结果可能因浏览器而异：整数次方直接相乘，其他用 math.ts 的 pow。',
  },
  {
    selector: "AssignmentExpression[operator='**=']",
    message: '乘方运算符的结果可能因浏览器而异：整数次方直接相乘，其他用 math.ts 的 pow。',
  },
  {
    selector: ':function[async=true]',
    message: '比赛核心必须是同步的，按固定步长一步一步推进。',
  },
  {
    selector: "CallExpression[callee.property.name='sort'][arguments.length=0]",
    message: 'sort 必须写比较函数，并且比较结果要稳定（相等时按编号排）。',
  },
];

const coreImportBans = {
  patterns: [
    { regex: '^(?!\\.{1,2}/)', message: '比赛核心不引用任何外部包或 Node 模块。' },
    { regex: '(^|/)(web|i18n|data|scripts|tests)(/|$)', message: '比赛核心不能引用页面、翻译、存档等外层代码。' },
  ],
};

export default defineConfig([
  globalIgnores(['dist/', 'node_modules/', 'coverage/']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    files: CORE_FILES,
    rules: {
      'no-restricted-globals': ['error', mathGlobalBan, ...coreGlobalBans],
      'no-restricted-properties': ['error', ...localeBans],
      'no-restricted-syntax': ['error', ...coreSyntaxBans],
      'no-restricted-imports': ['error', coreImportBans],
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...coreImportBans.patterns,
            { regex: '(^|/)proto(/|$)', message: '比赛核心不能依赖技术验证原型（原型用完要删）。' },
          ],
        },
      ],
    },
  },
  {
    files: [DET_MATH_FILE],
    rules: {
      'no-restricted-globals': ['error', ...coreGlobalBans],
      'no-restricted-properties': [
        'error',
        ...localeBans,
        ...NONDETERMINISTIC_MATH.map((property) => ({
          object: 'Math',
          property,
          message: `Math.${property} 的结果可能因浏览器而异，请在 math.ts 里用加减乘除自己实现。`,
        })),
      ],
    },
  },
]);
