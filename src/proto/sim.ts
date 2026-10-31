/**
 * 技术验证原型（用完就扔：阶段 1 写正式比赛引擎时删除整个 src/proto 目录）。
 *
 * 目的（路线图阶段 0、决策记录 D-004）：
 * 1. 估算「22 人按阵型跑动、传球，跑满 90 分钟」在 JavaScript 里要算多久；
 * 2. 作为确定性自检的整场比赛样本：同一个种子，任何设备上算出的校验码必须相同。
 *
 * 思考量按「正式引擎第一版大概会有的量」估计：每秒 20 步；无球球员每 0.25 秒想一次跑位，
 * 每次比较 9 个候选点和全部 21 名其他球员的距离；持球人每 0.1 秒想一次，
 * 评估传给每个队友（每条传球线路 6 个检查点 × 11 名对手）、8 个带球方向和射门。
 *
 * 这不是比赛引擎：没有犯规、越位判罚、换人、战术，规则很粗糙，不用评价像不像足球。
 */
import { Hasher } from '../core/hash.ts';
import { abs, atan2, clamp, cos, exp, max, min, PI, sigmoid, sin, sqrt, wrapAngle } from '../core/math.ts';
import { Rng } from '../core/rng.ts';

// ---- 场地（米），原点在中圈，x 沿球场长边，y 沿宽边 ----

export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;
export const HALF_L = PITCH_LENGTH / 2;
export const HALF_W = PITCH_WIDTH / 2;
export const GOAL_HALF_WIDTH = 3.66;
const GOAL_HEIGHT = 2.44;
const BOX_DEPTH = 16.5;
const BOX_HALF_WIDTH = 20.16;

export interface SimConfig {
  seed: number;
  /** 每秒步数（固定步长）。 */
  hz: number;
  /** 半场分钟数。 */
  halfMinutes: number;
  /** 无球球员每隔几步想一次跑位。 */
  offBallThinkTicks: number;
  /** 持球人每隔几步想一次怎么处理球。 */
  carrierThinkTicks: number;
  /** 每隔几步把场上状态喂进校验码（0 表示不喂）。 */
  hashEveryTicks: number;
}

export const DEFAULT_CONFIG: Readonly<SimConfig> = {
  seed: 20261031,
  hz: 20,
  halfMinutes: 45,
  offBallThinkTicks: 5,
  carrierThinkTicks: 2,
  hashEveryTicks: 20,
};

// ---- 球员 ----

export const GK = 0;
export const DEF = 1;
export const MID = 2;
export const FWD = 3;

/** 阵型：[纵向, 横向, 位置]，纵向 -1 = 本方球门线，+1 = 对方球门线；横向 -1..1。 */
type Formation = readonly (readonly [number, number, number])[];

const F442: Formation = [
  [-0.96, 0, GK],
  [-0.6, -0.7, DEF], [-0.68, -0.24, DEF], [-0.68, 0.24, DEF], [-0.6, 0.7, DEF],
  [-0.22, -0.72, MID], [-0.3, -0.22, MID], [-0.3, 0.22, MID], [-0.22, 0.72, MID],
  [0.08, -0.22, FWD], [0.08, 0.22, FWD],
];

const F433: Formation = [
  [-0.96, 0, GK],
  [-0.6, -0.7, DEF], [-0.68, -0.24, DEF], [-0.68, 0.24, DEF], [-0.6, 0.7, DEF],
  [-0.4, 0, MID], [-0.22, -0.36, MID], [-0.22, 0.36, MID],
  [0.05, -0.68, FWD], [0.12, 0, FWD], [0.05, 0.68, FWD],
];

export class Player {
  readonly id: number;
  readonly team: number;
  readonly role: number;
  readonly baseX: number;
  readonly baseY: number;
  readonly maxSpeed: number;
  readonly accel: number;
  readonly passing: number;
  readonly tackling: number;
  readonly shooting: number;
  readonly control: number;

  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  heading = 0;
  stamina = 1;
  /** 上一步的位置（画面插值用）。 */
  px = 0;
  py = 0;
  tx = 0;
  ty = 0;
  urgency = 0.5;
  thinkTimer = 0;
  /** 刚碰过球或刚铲断失败，几步之内不能再碰球。 */
  cooldown = 0;

  constructor(id: number, team: number, slot: readonly [number, number, number], rng: Rng) {
    this.id = id;
    this.team = team;
    this.baseX = slot[0];
    this.baseY = slot[1];
    this.role = slot[2];
    const gk = this.role === GK;
    this.maxSpeed = gk ? rng.range(6.0, 6.8) : rng.range(6.8, 8.6);
    this.accel = rng.range(3.2, 4.4);
    this.passing = rng.range(0.35, 0.9);
    this.tackling = rng.range(0.3, 0.85);
    this.shooting = this.role === FWD ? rng.range(0.5, 0.9) : rng.range(0.2, 0.7);
    this.control = rng.range(0.4, 0.9);
  }
}

export class Ball {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  px = 0;
  py = 0;
  pz = 0;
  /** 持球人编号，-1 表示球不在任何人脚下。 */
  owner = -1;
  lastTeam = 0;
}

export interface TeamStats {
  goals: number;
  shots: number;
  shotsOnTarget: number;
  passes: number;
  passesCompleted: number;
  tackles: number;
  interceptions: number;
  possessionTicks: number;
}

export interface GoalEvent {
  team: number;
  minute: number;
  scorer: number;
}

export interface MatchResult {
  hash: string;
  ticks: number;
  score: [number, number];
  stats: [TeamStats, TeamStats];
  goals: GoalEvent[];
}

function newStats(): TeamStats {
  return {
    goals: 0, shots: 0, shotsOnTarget: 0, passes: 0, passesCompleted: 0, tackles: 0, interceptions: 0,
    possessionTicks: 0,
  };
}

// 持球人的选项
const OPT_PASS = 0;
const OPT_DRIBBLE = 1;
const OPT_SHOOT = 2;
const OPT_HOLD = 3;
const MAX_OPTIONS = 32;
const SOFTMAX_TEMPERATURE = 0.35;
const PASS_SAMPLES = 6;

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const sx = bx - ax;
  const sy = by - ay;
  const len2 = sx * sx + sy * sy;
  let t = len2 > 0 ? ((px - ax) * sx + (py - ay) * sy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + sx * t - px;
  const dy = ay + sy * t - py;
  return sqrt(dx * dx + dy * dy);
}

export class Match {
  readonly config: SimConfig;
  readonly players: Player[] = [];
  readonly ball = new Ball();
  readonly stats: [TeamStats, TeamStats] = [newStats(), newStats()];
  readonly goals: GoalEvent[] = [];
  readonly dt: number;
  readonly halfTicks: number;
  readonly totalTicks: number;
  tick = 0;

  private readonly rng: Rng;
  private readonly hasher = new Hasher(3);
  /** 每队进攻方向：+1 朝 x 正方向，-1 朝负方向。下半场互换。 */
  private readonly dirs = [1, -1];
  private readonly inPossession = [false, false];
  private readonly offsideXf = [0, 0];
  private readonly chaser1 = [-1, -1];
  private readonly chaser2 = [-1, -1];
  private lookX = 0;
  private lookY = 0;
  private passFrom = -1;
  private passTo = -1;
  private shotBy = -1;
  // 计算阵型锚点时的临时结果（避免每次新建对象）
  private ax = 0;
  private ay = 0;
  // 持球人选项表（预先分配）
  private readonly optType = new Int32Array(MAX_OPTIONS);
  private readonly optTarget = new Int32Array(MAX_OPTIONS);
  private readonly optX = new Float64Array(MAX_OPTIONS);
  private readonly optY = new Float64Array(MAX_OPTIONS);
  private readonly optSpeed = new Float64Array(MAX_OPTIONS);
  private readonly optScore = new Float64Array(MAX_OPTIONS);

  constructor(config: Partial<SimConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dt = 1 / this.config.hz;
    this.halfTicks = this.config.halfMinutes * 60 * this.config.hz;
    this.totalTicks = this.halfTicks * 2;
    this.rng = new Rng(this.config.seed);
    const formations = [F442, F433];
    for (let team = 0; team < 2; team++) {
      for (const slot of formations[team]!) {
        this.players.push(new Player(this.players.length, team, slot, this.rng));
      }
    }
    this.kickoff(0);
  }

  get finished(): boolean {
    return this.tick >= this.totalTicks;
  }

  get score(): [number, number] {
    return [this.stats[0].goals, this.stats[1].goals];
  }

  /** 比赛进行到第几分钟（小数）。 */
  get minute(): number {
    return this.tick / this.config.hz / 60;
  }

  /** 当前校验码。 */
  hash(): string {
    return this.hasher.digest();
  }

  /** 往前推进一步（1/hz 秒）。 */
  step(): void {
    if (this.tick >= this.totalTicks) return;
    if (this.tick === this.halfTicks) {
      this.dirs[0] = -1;
      this.dirs[1] = 1;
      this.kickoff(1);
    }
    const players = this.players;
    for (let i = 0; i < players.length; i++) {
      const p = players[i]!;
      p.px = p.x;
      p.py = p.y;
    }
    const b = this.ball;
    b.px = b.x;
    b.py = b.y;
    b.pz = b.z;

    this.updateTeamContext();
    this.think();
    this.move();
    this.updateBall();

    this.tick++;
    const every = this.config.hashEveryTicks;
    if (every > 0 && this.tick % every === 0) this.hashState();
  }

  run(): MatchResult {
    while (this.tick < this.totalTicks) this.step();
    return this.result();
  }

  /** 当前结果。校验码 = 比赛过程的校验码 + 统计 + 随机数进度；可以反复调用，不影响比赛。 */
  result(): MatchResult {
    const h = new Hasher(4).str(this.hasher.digest());
    for (const s of this.stats) {
      h.u32(s.goals).u32(s.shots).u32(s.shotsOnTarget).u32(s.passes).u32(s.passesCompleted);
      h.u32(s.tackles).u32(s.interceptions).u32(s.possessionTicks);
    }
    for (const x of this.rng.state()) h.u32(x);
    return {
      hash: h.digest(),
      ticks: this.tick,
      score: this.score,
      stats: [{ ...this.stats[0] }, { ...this.stats[1] }],
      goals: this.goals.slice(),
    };
  }

  // ---- 每步：全队形势 ----

  private updateTeamContext(): void {
    const b = this.ball;
    const players = this.players;
    if (b.owner >= 0) {
      this.lookX = b.x;
      this.lookY = b.y;
    } else {
      this.lookX = clamp(b.x + b.vx * 0.5, -HALF_L, HALF_L);
      this.lookY = clamp(b.y + b.vy * 0.5, -HALF_W, HALF_W);
    }
    for (let team = 0; team < 2; team++) {
      const dir = this.dirs[team]!;
      this.inPossession[team] = b.owner >= 0 ? players[b.owner]!.team === team : b.lastTeam === team;
      // 越位线：对方倒数第二名球员（通常门将是最后一名）
      let first = -2;
      let second = -2;
      const oStart = team === 0 ? 11 : 0;
      for (let i = oStart; i < oStart + 11; i++) {
        const xf = (dir * players[i]!.x) / HALF_L;
        if (xf > first) {
          second = first;
          first = xf;
        } else if (xf > second) {
          second = xf;
        }
      }
      this.offsideXf[team] = max(second, (dir * b.x) / HALF_L, 0);
      // 离球最近（按跑到的时间算）的两个人
      let best1 = -1;
      let best2 = -1;
      let t1 = Infinity;
      let t2 = Infinity;
      const tStart = team * 11;
      for (let i = tStart; i < tStart + 11; i++) {
        const p = players[i]!;
        if (p.role === GK) continue;
        const dx = this.lookX - p.x;
        const dy = this.lookY - p.y;
        const t = sqrt(dx * dx + dy * dy) / p.maxSpeed;
        if (t < t1) {
          t2 = t1;
          best2 = best1;
          t1 = t;
          best1 = i;
        } else if (t < t2) {
          t2 = t;
          best2 = i;
        }
      }
      this.chaser1[team] = best1;
      this.chaser2[team] = best2;
    }
  }

  // ---- 每步：谁该动脑子 ----

  private think(): void {
    const players = this.players;
    const b = this.ball;
    const every = this.config.offBallThinkTicks;
    for (let i = 0; i < players.length; i++) {
      const p = players[i]!;
      if (p.cooldown > 0) p.cooldown--;
      if (b.owner === i) {
        p.thinkTimer--;
        if (p.thinkTimer <= 0) {
          this.carrierDecide(p);
          p.thinkTimer = this.config.carrierThinkTicks;
        }
        continue;
      }
      // 追球的人每步都更新目标（球跑得快）
      if (b.owner < 0 && (this.passTo === i || this.chaser1[p.team] === i)) {
        this.chaseBall(p);
        continue;
      }
      if ((this.tick + i) % every === 0) this.offBallDecide(p);
    }
  }

  private chaseBall(p: Player): void {
    const b = this.ball;
    if (this.passTo === p.id) {
      // 接球人：跑到球路上离自己最近的点
      const sx = b.vx;
      const sy = b.vy;
      const len2 = sx * sx + sy * sy;
      let t = len2 > 0 ? ((p.x - b.x) * sx + (p.y - b.y) * sy) / len2 : 0;
      t = clamp(t, 0, 2);
      p.tx = b.x + sx * t;
      p.ty = b.y + sy * t;
    } else {
      p.tx = this.lookX;
      p.ty = this.lookY;
    }
    p.urgency = 1;
  }

  /** 阵型锚点：阵型位置随球整体平移、收缩，结果写进 this.ax / this.ay（场地坐标）。 */
  private anchor(p: Player): void {
    const team = p.team;
    const dir = this.dirs[team]!;
    const b = this.ball;
    const bxf = (dir * b.x) / HALF_L;
    const byf = (dir * b.y) / HALF_W;
    let xf: number;
    let yf: number;
    if (this.inPossession[team]) {
      const shift = clamp(bxf * 0.55 + 0.18, -0.45, 0.62);
      xf = p.baseX * 0.62 + shift;
      yf = p.baseY * 0.95 + byf * 0.25;
      if (p.role !== DEF && xf > this.offsideXf[team]!) xf = this.offsideXf[team]!;
    } else {
      const shift = clamp(bxf * 0.5 - 0.05, -0.55, 0.45);
      xf = p.baseX * 0.48 + shift;
      yf = p.baseY * 0.72 + byf * 0.35;
    }
    xf = clamp(xf, -0.97, 0.95);
    yf = clamp(yf, -0.95, 0.95);
    this.ax = dir * xf * HALF_L;
    this.ay = dir * yf * HALF_W;
  }

  private offBallDecide(p: Player): void {
    if (p.role === GK) {
      this.goalkeeperDecide(p);
    } else if (this.inPossession[p.team]) {
      this.supportDecide(p);
    } else {
      this.defendDecide(p);
    }
  }

  /** 进攻时的无球跑位：在锚点周围 9 个候选点里挑最好的。 */
  private supportDecide(p: Player): void {
    this.anchor(p);
    const ax = this.ax;
    const ay = this.ay;
    const team = p.team;
    const dir = this.dirs[team]!;
    const players = this.players;
    const b = this.ball;
    const carrier = b.owner >= 0 ? players[b.owner]! : null;
    const offside = this.offsideXf[team]!;
    const oStart = team === 0 ? 11 : 0;
    const tStart = team * 11;
    let bestScore = -Infinity;
    let bestX = ax;
    let bestY = ay;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const cx = clamp(ax + i * 5 * dir, -HALF_L + 1, HALF_L - 1);
        const cy = clamp(ay + j * 5, -HALF_W + 1, HALF_W - 1);
        let open = 12;
        let lane = 8;
        for (let k = oStart; k < oStart + 11; k++) {
          const q = players[k]!;
          const dx = q.x - cx;
          const dy = q.y - cy;
          const d = sqrt(dx * dx + dy * dy);
          if (d < open) open = d;
          if (carrier !== null) {
            const ld = distToSegment(q.x, q.y, carrier.x, carrier.y, cx, cy);
            if (ld < lane) lane = ld;
          }
        }
        let crowd = 0;
        for (let k = tStart; k < tStart + 11; k++) {
          const m = players[k]!;
          if (m === p) continue;
          const dx = m.x - cx;
          const dy = m.y - cy;
          const d = sqrt(dx * dx + dy * dy);
          if (d < 7) crowd += 7 - d;
        }
        const xf = (dir * cx) / HALF_L;
        let score = open * 0.35 + lane * 0.5 + xf * 2 - (abs(cx - ax) + abs(cy - ay)) * 0.12 - crowd * 0.25;
        if (xf > offside + 0.01) score -= 6;
        if (score > bestScore) {
          bestScore = score;
          bestX = cx;
          bestY = cy;
        }
      }
    }
    p.tx = bestX;
    p.ty = bestY;
    p.urgency = 0.75;
  }

  /** 防守时：第二近的人补位，其他人回到阵型位置并盯住附近的对手。 */
  private defendDecide(p: Player): void {
    const team = p.team;
    const dir = this.dirs[team]!;
    const players = this.players;
    const b = this.ball;
    const goalX = -dir * HALF_L;
    if (this.chaser1[team] === p.id) {
      p.tx = this.lookX;
      p.ty = this.lookY;
      p.urgency = 1;
      return;
    }
    if (this.chaser2[team] === p.id) {
      const dx = goalX - b.x;
      const dy = -b.y;
      const d = sqrt(dx * dx + dy * dy) || 1;
      p.tx = b.x + (dx / d) * 7;
      p.ty = b.y + (dy / d) * 7;
      p.urgency = 0.9;
      return;
    }
    this.anchor(p);
    const ax = this.ax;
    const ay = this.ay;
    const oStart = team === 0 ? 11 : 0;
    let mark = -1;
    let markD = 16;
    for (let k = oStart; k < oStart + 11; k++) {
      const q = players[k]!;
      if (q.role === GK) continue;
      const dx = q.x - ax;
      const dy = q.y - ay;
      const d = sqrt(dx * dx + dy * dy);
      if (d < markD) {
        markD = d;
        mark = k;
      }
    }
    if (mark >= 0) {
      const q = players[mark]!;
      const dx = goalX - q.x;
      const dy = -q.y;
      const d = sqrt(dx * dx + dy * dy) || 1;
      const mx = q.x + (dx / d) * 2;
      const my = q.y + (dy / d) * 2;
      p.tx = ax * 0.45 + mx * 0.55;
      p.ty = ay * 0.45 + my * 0.55;
    } else {
      p.tx = ax;
      p.ty = ay;
    }
    p.urgency = 0.8;
  }

  private goalkeeperDecide(p: Player): void {
    const dir = this.dirs[p.team]!;
    const b = this.ball;
    const goalX = -dir * HALF_L;
    const dx = b.x - goalX;
    const dy = b.y;
    const d = sqrt(dx * dx + dy * dy) || 1;
    if (b.owner < 0 && d < 18 && this.inOwnBox(p.team, b.x, b.y)) {
      p.tx = this.lookX;
      p.ty = this.lookY;
      p.urgency = 1;
      return;
    }
    const out = min(5, d * 0.2);
    p.tx = goalX + (dx / d) * out;
    p.ty = clamp((dy / d) * out, -GOAL_HALF_WIDTH - 0.5, GOAL_HALF_WIDTH + 0.5);
    p.urgency = 0.8;
  }

  private inOwnBox(team: number, x: number, y: number): boolean {
    const xf = this.dirs[team]! * x;
    return xf < -HALF_L + BOX_DEPTH && abs(y) < BOX_HALF_WIDTH;
  }

  /** 离对方球门越近越危险，0..1。 */
  private threat(team: number, x: number, y: number): number {
    const gx = this.dirs[team]! * HALF_L;
    const dx = gx - x;
    const dy = y;
    return exp(-sqrt(dx * dx + dy * dy) / 16);
  }

  // ---- 持球人：传、带、射、拿住 ----

  private carrierDecide(p: Player): void {
    const team = p.team;
    const dir = this.dirs[team]!;
    const players = this.players;
    const oStart = team === 0 ? 11 : 0;
    const tStart = team * 11;
    const goalX = dir * HALF_L;
    const xfFrom = (dir * p.x) / HALF_L;
    let pressure = 99;
    for (let k = oStart; k < oStart + 11; k++) {
      const q = players[k]!;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const d = sqrt(dx * dx + dy * dy);
      if (d < pressure) pressure = d;
    }
    let n = 0;

    // 传球：给每个队友
    for (let m = tStart; m < tStart + 11; m++) {
      const mate = players[m]!;
      if (mate === p) continue;
      const dx0 = mate.x - p.x;
      const dy0 = mate.y - p.y;
      const d0 = sqrt(dx0 * dx0 + dy0 * dy0);
      if (d0 < 4 || d0 > 50) continue;
      const speed = clamp(7 + d0 * 0.85, 10, 25);
      const flight = d0 / (speed * 0.8);
      const tx = clamp(mate.x + mate.vx * flight * 0.7, -HALF_L + 0.5, HALF_L - 0.5);
      const ty = clamp(mate.y + mate.vy * flight * 0.7, -HALF_W + 0.5, HALF_W - 0.5);
      const dx = tx - p.x;
      const dy = ty - p.y;
      const d = sqrt(dx * dx + dy * dy);
      let margin = 9;
      for (let s = 1; s <= PASS_SAMPLES; s++) {
        const f = s / PASS_SAMPLES;
        const sx = p.x + dx * f;
        const sy = p.y + dy * f;
        const tb = (d * f) / (speed * 0.8);
        for (let k = oStart; k < oStart + 11; k++) {
          const q = players[k]!;
          const qx = q.x - sx;
          const qy = q.y - sy;
          const tq = max(0, sqrt(qx * qx + qy * qy) - 1) / q.maxSpeed + 0.25;
          if (tq - tb < margin) margin = tq - tb;
        }
      }
      const xfTo = (dir * tx) / HALF_L;
      let score = (xfTo - xfFrom) * 2.2 + this.threat(team, tx, ty) * 1.6 + clamp(margin, -1.5, 1) * 2;
      if (mate.role === GK) score -= 1.2;
      if (d > 32) score -= (d - 32) * 0.04;
      this.optType[n] = OPT_PASS;
      this.optTarget[n] = m;
      this.optX[n] = tx;
      this.optY[n] = ty;
      this.optSpeed[n] = speed;
      this.optScore[n] = score;
      n++;
    }

    // 带球：8 个方向
    const base = dir > 0 ? 0 : PI;
    for (let k = 0; k < 8; k++) {
      const a = base + (k * PI) / 4;
      const tx = p.x + cos(a) * 6;
      const ty = p.y + sin(a) * 6;
      if (abs(tx) > HALF_L - 0.5 || abs(ty) > HALF_W - 0.5) continue;
      let space = 10;
      for (let q = oStart; q < oStart + 11; q++) {
        const o = players[q]!;
        const dx = o.x - tx;
        const dy = o.y - ty;
        const d = sqrt(dx * dx + dy * dy);
        if (d < space) space = d;
      }
      const progress = (dir * (tx - p.x)) / HALF_L;
      this.optType[n] = OPT_DRIBBLE;
      this.optTarget[n] = -1;
      this.optX[n] = tx;
      this.optY[n] = ty;
      this.optSpeed[n] = 0;
      this.optScore[n] = progress * 2.2 + this.threat(team, tx, ty) * 1.6 + (min(space, 8) - 3.5) * 0.35 - 0.2;
      n++;
    }

    // 射门
    const gdx = goalX - p.x;
    const gdy = -p.y;
    const dg = sqrt(gdx * gdx + gdy * gdy);
    if (dg < 32) {
      const a1 = atan2(-GOAL_HALF_WIDTH - p.y, gdx);
      const a2 = atan2(GOAL_HALF_WIDTH - p.y, gdx);
      const angle = abs(wrapAngle(a2 - a1));
      let xg = sigmoid(-3.2 + angle * 5.5 - dg * 0.05);
      for (let k = oStart; k < oStart + 11; k++) {
        const q = players[k]!;
        if (distToSegment(q.x, q.y, p.x, p.y, goalX, 0) < 1.2) xg *= 0.65;
      }
      this.optType[n] = OPT_SHOOT;
      this.optTarget[n] = -1;
      this.optX[n] = goalX;
      this.optY[n] = 0;
      this.optSpeed[n] = 0;
      this.optScore[n] = xg * 9 - 0.3;
      n++;
    }

    // 拿住球
    this.optType[n] = OPT_HOLD;
    this.optTarget[n] = -1;
    this.optX[n] = p.x - dir;
    this.optY[n] = p.y;
    this.optSpeed[n] = 0;
    this.optScore[n] = -0.4 - (pressure < 2 ? 1 : 0);
    n++;

    // 按评分做「有点随机」的选择：分越高越可能选
    let best = -Infinity;
    for (let i = 0; i < n; i++) if (this.optScore[i]! > best) best = this.optScore[i]!;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const w = exp((this.optScore[i]! - best) / SOFTMAX_TEMPERATURE);
      this.optScore[i] = w;
      sum += w;
    }
    let r = this.rng.float() * sum;
    let pick = n - 1;
    for (let i = 0; i < n; i++) {
      r -= this.optScore[i]!;
      if (r < 0) {
        pick = i;
        break;
      }
    }

    switch (this.optType[pick]) {
      case OPT_PASS:
        this.pass(p, this.optTarget[pick]!, this.optX[pick]!, this.optY[pick]!, this.optSpeed[pick]!, pressure);
        break;
      case OPT_DRIBBLE:
        p.tx = this.optX[pick]!;
        p.ty = this.optY[pick]!;
        p.urgency = 0.85;
        break;
      case OPT_SHOOT:
        this.shoot(p);
        break;
      default:
        p.tx = this.optX[pick]!;
        p.ty = this.optY[pick]!;
        p.urgency = 0.3;
    }
  }

  private pass(p: Player, to: number, tx: number, ty: number, speed: number, pressure: number): void {
    const b = this.ball;
    const rng = this.rng;
    let dx = tx - p.x;
    let dy = ty - p.y;
    const d = sqrt(dx * dx + dy * dy) || 1;
    dx /= d;
    dy /= d;
    const err = rng.normal(0, 0.025 + (1 - p.passing) * 0.06 + (pressure < 2 ? 0.03 : 0));
    const c = cos(err);
    const s = sin(err);
    const lofted = d > 30;
    const v = speed * (1 + rng.normal(0, 0.05)) * (lofted ? 0.75 : 1);
    b.owner = -1;
    b.vx = (dx * c - dy * s) * v;
    b.vy = (dx * s + dy * c) * v;
    b.vz = lofted ? 6.5 : 0;
    b.lastTeam = p.team;
    p.cooldown = 6;
    this.passFrom = p.id;
    this.passTo = to;
    this.shotBy = -1;
    this.stats[p.team]!.passes++;
  }

  private shoot(p: Player): void {
    const b = this.ball;
    const rng = this.rng;
    const goalX = this.dirs[p.team]! * HALF_L;
    const aimY = clamp(rng.normal(0, 1.8), -GOAL_HALF_WIDTH + 0.3, GOAL_HALF_WIDTH - 0.3);
    let dx = goalX - p.x;
    let dy = aimY - p.y;
    const d = sqrt(dx * dx + dy * dy) || 1;
    dx /= d;
    dy /= d;
    const err = rng.normal(0, 0.03 + (1 - p.shooting) * 0.06);
    const c = cos(err);
    const s = sin(err);
    const ux = dx * c - dy * s;
    const uy = dx * s + dy * c;
    const v = 22 + p.shooting * 8;
    b.owner = -1;
    b.vx = ux * v;
    b.vy = uy * v;
    b.vz = rng.range(0.5, 3.5);
    b.lastTeam = p.team;
    p.cooldown = 8;
    this.passFrom = -1;
    this.passTo = -1;
    this.shotBy = p.id;
    const st = this.stats[p.team]!;
    st.shots++;
    // 不考虑扑救和摩擦，球会不会进门框范围
    if (abs(ux) > 1e-9) {
      const yAtGoal = p.y + (uy / ux) * (goalX - p.x);
      if (abs(yAtGoal) < GOAL_HALF_WIDTH) st.shotsOnTarget++;
    }
  }

  // ---- 每步：所有人移动 ----

  private move(): void {
    const dt = this.dt;
    const players = this.players;
    const owner = this.ball.owner;
    for (let i = 0; i < players.length; i++) {
      const p = players[i]!;
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = sqrt(dx * dx + dy * dy);
      let top = p.maxSpeed * p.urgency * (0.7 + 0.3 * p.stamina);
      if (i === owner) top *= 0.88;
      const want = min(top, d * 1.8);
      let wvx = 0;
      let wvy = 0;
      if (d > 0.05) {
        wvx = (dx / d) * want;
        wvy = (dy / d) * want;
      }
      let ddx = wvx - p.vx;
      let ddy = wvy - p.vy;
      const dd = sqrt(ddx * ddx + ddy * ddy);
      const limit = p.accel * dt;
      if (dd > limit) {
        ddx *= limit / dd;
        ddy *= limit / dd;
      }
      p.vx += ddx;
      p.vy += ddy;
      p.x = clamp(p.x + p.vx * dt, -HALF_L - 1, HALF_L + 1);
      p.y = clamp(p.y + p.vy * dt, -HALF_W - 1, HALF_W + 1);
      const v2 = p.vx * p.vx + p.vy * p.vy;
      if (v2 > 0.09) p.heading = atan2(p.vy, p.vx);
      // 体能：跑得越快掉得越多，慢走时恢复
      p.stamina = clamp(p.stamina - (v2 * 0.0000009 - 0.000012) * dt * 20, 0, 1);
    }
  }

  // ---- 每步：球 ----

  private updateBall(): void {
    const b = this.ball;
    const dt = this.dt;
    if (b.owner >= 0) {
      const p = this.players[b.owner]!;
      b.x = p.x + cos(p.heading) * 0.6;
      b.y = p.y + sin(p.heading) * 0.6;
      b.z = 0;
      b.vx = p.vx;
      b.vy = p.vy;
      b.vz = 0;
      this.stats[p.team]!.possessionTicks++;
      if (this.checkOut()) return;
      this.checkTackles(p);
      return;
    }
    this.stats[b.lastTeam]!.possessionTicks++;
    const x0 = b.x;
    const y0 = b.y;
    if (b.z > 0 || b.vz > 0) {
      b.vz -= 9.81 * dt;
      b.z += b.vz * dt;
      b.vx *= 0.999;
      b.vy *= 0.999;
      if (b.z <= 0) {
        b.z = 0;
        if (b.vz < -2) {
          b.vz = -b.vz * 0.45;
          b.vx *= 0.75;
          b.vy *= 0.75;
        } else {
          b.vz = 0;
        }
      }
    } else {
      const f = 1 - 0.5 * dt;
      b.vx *= f;
      b.vy *= f;
      if (b.vx * b.vx + b.vy * b.vy < 0.04) {
        b.vx = 0;
        b.vy = 0;
      }
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (this.checkOut()) return;
    this.checkControl(x0, y0);
  }

  /** 球出界或进球，返回 true。 */
  private checkOut(): boolean {
    const b = this.ball;
    if (abs(b.x) > HALF_L) {
      const side = b.x > 0 ? 1 : -1;
      // 这个球门是哪队在进攻
      const attacking = this.dirs[0] === side ? 0 : 1;
      if (abs(b.y) < GOAL_HALF_WIDTH && b.z < GOAL_HEIGHT) {
        const st = this.stats[attacking]!;
        st.goals++;
        const scorer = this.shotBy >= 0 ? this.shotBy : b.owner;
        this.goals.push({ team: attacking, minute: this.minute, scorer });
        this.kickoff(1 - attacking);
        return true;
      }
      const defending = 1 - attacking;
      if (b.lastTeam === attacking) {
        // 球门球
        const gk = this.players[defending * 11]!;
        this.restart(gk, side * (HALF_L - 5.5), 0, 30);
      } else {
        // 角球
        const cx = side * (HALF_L - 0.5);
        const cy = b.y > 0 ? HALF_W - 0.5 : -HALF_W + 0.5;
        this.restart(this.nearest(attacking, cx, cy), cx, cy, 30);
      }
      return true;
    }
    if (abs(b.y) > HALF_W) {
      const team = 1 - b.lastTeam;
      const x = clamp(b.x, -HALF_L + 1, HALF_L - 1);
      const y = b.y > 0 ? HALF_W - 0.3 : -HALF_W + 0.3;
      this.restart(this.nearest(team, x, y), x, y, 16);
      return true;
    }
    return false;
  }

  private nearest(team: number, x: number, y: number): Player {
    let best = this.players[team * 11 + 1]!;
    let bestD = Infinity;
    for (let i = team * 11 + 1; i < team * 11 + 11; i++) {
      const p = this.players[i]!;
      const dx = p.x - x;
      const dy = p.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** 定位球：把罚球的人放到球的位置，对手退到 5 米外。 */
  private restart(p: Player, x: number, y: number, delayTicks: number): void {
    const b = this.ball;
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.tx = x;
    p.ty = y;
    p.heading = atan2(-y, -x);
    b.owner = p.id;
    b.lastTeam = p.team;
    b.x = x;
    b.y = y;
    b.z = 0;
    b.vx = 0;
    b.vy = 0;
    b.vz = 0;
    p.thinkTimer = delayTicks;
    this.passFrom = -1;
    this.passTo = -1;
    this.shotBy = -1;
    const oStart = p.team === 0 ? 11 : 0;
    for (let k = oStart; k < oStart + 11; k++) {
      const q = this.players[k]!;
      const dx = q.x - x;
      const dy = q.y - y;
      const d = sqrt(dx * dx + dy * dy);
      if (d < 5) {
        const push = d > 0.01 ? (5 - d) / d : 0;
        q.x = clamp(q.x + dx * push, -HALF_L, HALF_L);
        q.y = clamp(q.y + dy * push, -HALF_W, HALF_W);
      }
    }
  }

  /** 开球：所有人回到本方半场的阵型位置。 */
  private kickoff(team: number): void {
    for (const p of this.players) {
      const dir = this.dirs[p.team]!;
      const xf = min(p.baseX * 0.5 - 0.05, -0.03);
      p.x = dir * xf * HALF_L;
      p.y = dir * p.baseY * 0.8 * HALF_W;
      p.vx = 0;
      p.vy = 0;
      p.tx = p.x;
      p.ty = p.y;
      p.px = p.x;
      p.py = p.y;
      p.heading = dir > 0 ? 0 : PI;
      p.cooldown = 0;
      p.thinkTimer = 0;
    }
    // 开球的人：本队最靠前的前锋
    let kicker = this.players[team * 11 + 10]!;
    for (let i = team * 11; i < team * 11 + 11; i++) {
      const p = this.players[i]!;
      if (p.role === FWD && p.baseY === 0) kicker = p;
    }
    const b = this.ball;
    this.restart(kicker, 0, 0, 20);
    kicker.heading = this.dirs[team]! > 0 ? 0 : PI;
    b.px = b.x;
    b.py = b.y;
    b.pz = 0;
  }

  // ---- 抢断和停球 ----

  private checkTackles(carrier: Player): void {
    const players = this.players;
    const rng = this.rng;
    const oStart = carrier.team === 0 ? 11 : 0;
    for (let k = oStart; k < oStart + 11; k++) {
      const q = players[k]!;
      if (q.cooldown > 0) continue;
      const dx = q.x - carrier.x;
      const dy = q.y - carrier.y;
      if (dx * dx + dy * dy > 2.56) continue;
      if (!rng.chance(0.12)) continue;
      const success = clamp(0.4 + (q.tackling - carrier.control) * 0.5, 0.12, 0.75);
      if (rng.chance(success)) {
        const b = this.ball;
        const a = rng.range(-PI, PI);
        const v = rng.range(2, 6);
        b.owner = -1;
        b.vx = cos(a) * v;
        b.vy = sin(a) * v;
        b.lastTeam = q.team;
        carrier.cooldown = 14;
        q.cooldown = 3;
        this.passFrom = -1;
        this.passTo = -1;
        this.shotBy = -1;
        this.stats[q.team]!.tackles++;
        return;
      }
      q.cooldown = 10;
    }
  }

  /** 球在这一步里经过谁的脚下（取最先碰到的人），按难度决定停住还是碰飞。 */
  private checkControl(x0: number, y0: number): void {
    const b = this.ball;
    const players = this.players;
    const sx = b.x - x0;
    const sy = b.y - y0;
    const len2 = sx * sx + sy * sy;
    let bestT = 2;
    let best = -1;
    for (let i = 0; i < players.length; i++) {
      const p = players[i]!;
      if (p.cooldown > 0) continue;
      const keeper = p.role === GK && this.inOwnBox(p.team, p.x, p.y);
      if (b.z > (keeper ? 2.6 : 1.9)) continue;
      const reach = keeper ? 1.9 : 1.0;
      let t = len2 > 0 ? ((p.x - x0) * sx + (p.y - y0) * sy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = x0 + sx * t - p.x;
      const cy = y0 + sy * t - p.y;
      if (cx * cx + cy * cy <= reach * reach && t < bestT) {
        bestT = t;
        best = i;
      }
    }
    if (best < 0) return;
    const p = players[best]!;
    const speed = sqrt(b.vx * b.vx + b.vy * b.vy);
    let chance: number;
    if (p.team === b.lastTeam) {
      chance = clamp(0.98 - speed * 0.01 + (p.control - 0.5) * 0.1, 0.7, 0.995);
    } else if (p.role === GK) {
      chance = clamp(0.95 - speed * 0.014, 0.4, 0.9);
    } else {
      chance = clamp(0.9 - speed * 0.025 + (p.control - 0.5) * 0.1, 0.25, 0.9);
    }
    const rng = this.rng;
    if (rng.chance(chance)) {
      if (this.passFrom >= 0) {
        if (this.players[this.passFrom]!.team === p.team) this.stats[p.team]!.passesCompleted++;
        else this.stats[p.team]!.interceptions++;
      }
      b.owner = p.id;
      b.lastTeam = p.team;
      b.vx = 0;
      b.vy = 0;
      b.vz = 0;
      b.z = 0;
      p.thinkTimer = 4;
      this.passFrom = -1;
      this.passTo = -1;
      this.shotBy = -1;
    } else {
      const a = rng.range(-1, 1);
      const c = cos(a) * 0.45;
      const s = sin(a) * 0.45;
      const vx = b.vx;
      b.vx = vx * c - b.vy * s;
      b.vy = vx * s + b.vy * c;
      b.lastTeam = p.team;
      p.cooldown = 6;
      this.passTo = -1;
    }
  }

  private hashState(): void {
    const h = this.hasher;
    const b = this.ball;
    h.u32(this.tick).f64(b.x).f64(b.y).f64(b.z).f64(b.vx).f64(b.vy).f64(b.vz).u32(b.owner);
    const players = this.players;
    for (let i = 0; i < players.length; i++) {
      const p = players[i]!;
      h.f64(p.x).f64(p.y).f64(p.vx).f64(p.vy).f64(p.stamina).f64(p.heading);
    }
    h.u32(this.stats[0].goals).u32(this.stats[1].goals);
  }
}

/** 跑完一整场。 */
export function runMatch(config: Partial<SimConfig> = {}): MatchResult {
  return new Match(config).run();
}
