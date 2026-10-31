/**
 * 中文翻译表（主表）。所有界面文字都从这里或 en.ts 取，代码里不写死文字。
 * 占位符写成 {名字}，中英两边的占位符必须一致（tests/i18n.test.ts 会检查）。
 */
export const zh = {
  'lang.zh': '中文',
  'lang.en': 'English',

  'lab.title': '足球模拟实验室',
  'lab.subtitle': '阶段 0 · 技术验证',
  'lab.build': '版本 {version} · {date}',
  'lab.intro': '这一页检查两件事：这台设备模拟出的比赛是否和云端逐位相同；模拟一整场 90 分钟比赛要多久。',
  'lab.howto': '点「开始测试」，等十几秒，测完点「复制结果」发给 Claude。测试时请停留在这个页面。',
  'lab.start': '开始测试',
  'lab.again': '再测一次',
  'lab.running': '正在测试…（{done}/{total}）',
  'lab.done': '测试完成',

  'check.title': '确定性自检',
  'check.desc': '同样的种子，任何设备都必须算出完全相同的比赛。下面每一项都和云端算的校验码比对。',
  'check.math': '数学函数',
  'check.rng': '随机数',
  'check.match': '整场比赛',
  'check.pending': '等待',
  'check.pass': '一致',
  'check.fail': '不一致',
  'check.runs': '{ok}/{total} 次一致',
  'check.cloud': '云端 {code}',
  'check.summaryPass': '全部一致',
  'check.summaryFail': '有不一致',

  'speed.title': '测速',
  'speed.desc': '模拟一整场 90 分钟比赛（22 名球员，每秒 20 步）用了多久。第一次包含浏览器预热，通常更慢。',
  'speed.unit': '毫秒',
  'speed.first': '首次 {ms} 毫秒',
  'speed.factor': '相当于 {x} 倍速',
  'speed.fast': '够快',
  'speed.ok': '可以接受',
  'speed.slow': '偏慢',
  'speed.target': '标准：云端 1 秒以内（决策记录 D-004）。手机和电脑的数字用来判断以后能不能在设备上直接算比赛。',

  'copy.title': '测试结果',
  'copy.device': '这台设备：{device}',
  'copy.button': '复制结果',
  'copy.copied': '已复制，可以粘贴发给 Claude 了',
  'copy.manual': '已选中文字，请用「拷贝」或 ⌘C 复制',
  'copy.empty': '测完以后这里会出现结果。',

  'report.header': '足球模拟实验室 · 自检和测速',
  'report.version': '版本：{version}（{date}）',
  'report.device': '设备：{device}（{cores} 核）',
  'report.check': '自检：{status}（数学函数 {math}，随机数 {rng}，整场比赛 {ok}/{total} 次一致）',
  'report.speed': '测速：一场 90 分钟比赛首次 {first} 毫秒，之后 {runs} 次的中位数 {median} 毫秒',
  'report.codes': '校验码：{codes}',
  'report.ua': '浏览器信息：{ua}',

  'device.unknown': '未知设备',

  'viewer.title': '看一眼原型比赛',
  'viewer.desc':
    '和上面测速的是同一场比赛。这只是测速用的粗糙原型，不是比赛引擎：没有犯规和越位判罚，跑位也很粗糙，不用评价像不像足球。',
  'viewer.play': '播放',
  'viewer.pause': '暂停',
  'viewer.restart': '从头开始',
  'viewer.speed': '{x} 倍速',
  'viewer.home': '主队',
  'viewer.away': '客队',
  'viewer.paused': '测试进行中，播放已暂停',
  'viewer.canvas': '原型比赛的俯视图：两队各 11 人和球的位置',

  'footer.note': '比赛核心只用固定种子的随机数和自己实现的数学函数，所以同一场比赛在任何设备上都逐位相同。',
} as const;

export type MessageKey = keyof typeof zh;
