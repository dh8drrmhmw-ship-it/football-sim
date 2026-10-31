/** English table. Must contain exactly the keys of zh.ts with the same {placeholders}. */
import type { MessageKey } from './zh.ts';

export const en: Record<MessageKey, string> = {
  'lang.zh': '中文',
  'lang.en': 'English',

  'lab.title': 'Football Sim Lab',
  'lab.subtitle': 'Phase 0 · Technical check',
  'lab.build': 'Build {version} · {date}',
  'lab.intro':
    'This page checks two things: whether this device simulates a match bit-for-bit like the cloud does, and how long a full 90-minute match takes to simulate.',
  'lab.howto':
    'Tap “Start test”, wait 10–20 seconds, then tap “Copy results” and send them to Claude. Stay on this page while it runs.',
  'lab.start': 'Start test',
  'lab.again': 'Test again',
  'lab.running': 'Testing… ({done}/{total})',
  'lab.done': 'Done',

  'check.title': 'Determinism check',
  'check.desc':
    'With the same seed, every device must produce exactly the same match. Each item below is compared with the code computed in the cloud.',
  'check.math': 'Math functions',
  'check.rng': 'Random numbers',
  'check.match': 'Full match',
  'check.pending': 'Waiting',
  'check.pass': 'Identical',
  'check.fail': 'Different',
  'check.runs': '{ok}/{total} runs identical',
  'check.cloud': 'Cloud {code}',
  'check.summaryPass': 'All identical',
  'check.summaryFail': 'Differences found',

  'speed.title': 'Speed',
  'speed.desc':
    'Time to simulate a full 90-minute match (22 players, 20 steps per second). The first run includes browser warm-up and is usually slower.',
  'speed.unit': 'ms',
  'speed.first': 'First run {ms} ms',
  'speed.factor': '{x}× real time',
  'speed.fast': 'Fast enough',
  'speed.ok': 'Acceptable',
  'speed.slow': 'Slow',
  'speed.target':
    'Target: under 1 second in the cloud (decision D-004). The phone and computer numbers tell us whether matches can be simulated on the device itself.',

  'copy.title': 'Results',
  'copy.device': 'This device: {device}',
  'copy.button': 'Copy results',
  'copy.copied': 'Copied — paste it into your message to Claude',
  'copy.manual': 'Text selected — use Copy or ⌘C',
  'copy.empty': 'Results appear here after the test.',

  'report.header': 'Football Sim Lab · determinism and speed',
  'report.version': 'Build: {version} ({date})',
  'report.device': 'Device: {device} ({cores} cores)',
  'report.check': 'Check: {status} (math {math}, random {rng}, full match {ok}/{total} runs identical)',
  'report.speed': 'Speed: full 90-minute match, first run {first} ms, median of the next {runs} runs {median} ms',
  'report.codes': 'Codes: {codes}',
  'report.ua': 'User agent: {ua}',

  'device.unknown': 'Unknown device',

  'viewer.title': 'Watch the prototype',
  'viewer.desc':
    'This is the same match the speed test simulates. It is a rough speed-test prototype, not the match engine: no fouls or offside calls and crude movement, so there is no need to judge how football-like it looks.',
  'viewer.play': 'Play',
  'viewer.pause': 'Pause',
  'viewer.restart': 'Restart',
  'viewer.speed': '{x}×',
  'viewer.home': 'Home',
  'viewer.away': 'Away',
  'viewer.paused': 'Paused while the test runs',
  'viewer.canvas': 'Top-down view of the prototype match: 11 players per side and the ball',

  'footer.note':
    'The match core uses only seeded random numbers and its own math functions, so a match is bit-for-bit identical on every device.',
};
