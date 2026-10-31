/**
 * 原型比赛的 2D 俯视画面：实时推进同一场比赛（同一个种子），画出 22 人和球。
 * 画面只读比赛状态，不改变比赛（决策记录 D-005）。
 */
import { GK, GOAL_HALF_WIDTH, HALF_L, HALF_W, Match } from '../proto/sim.ts';

const MARGIN = 3; // 场地外留白（米）
const GRASS_A = '#2f7d43';
const GRASS_B = '#2a7340';
const LINE = 'rgba(255,255,255,0.85)';
const TEAM_COLORS = ['#ffd23f', '#ee4266'];
const KEEPER_COLORS = ['#ff9f1c', '#9b5de5'];
const OUTLINE = 'rgba(10,20,14,0.75)';

export interface ViewerHud {
  onFrame(minute: number, score: [number, number]): void;
}

export class Viewer {
  private match: Match;
  private readonly ctx: CanvasRenderingContext2D;
  private playing = false;
  private speed = 4;
  private carry = 0; // 还没推进的模拟时间（秒）
  private lastTime = 0;
  private raf = 0;
  private scale = 1;
  private readonly hud: ViewerHud;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, hud: ViewerHud) {
    this.canvas = canvas;
    this.hud = hud;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unavailable');
    this.ctx = ctx;
    this.match = new Match();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  setSpeed(x: number): void {
    this.speed = x;
  }

  play(): void {
    if (this.playing) return;
    if (this.match.finished) this.restart();
    this.playing = true;
    this.lastTime = 0;
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  pause(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }

  restart(): void {
    this.match = new Match();
    this.carry = 0;
    this.draw(1);
  }

  resize(): void {
    const cssWidth = this.canvas.clientWidth || 600;
    const worldW = HALF_L * 2 + MARGIN * 2;
    const worldH = HALF_W * 2 + MARGIN * 2;
    const cssHeight = (cssWidth * worldH) / worldW;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.style.height = `${cssHeight}px`;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    this.scale = (cssWidth * dpr) / worldW;
    this.draw(1);
  }

  private frame(time: number): void {
    if (!this.playing) return;
    const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.1) : 0;
    this.lastTime = time;
    const step = this.match.dt;
    this.carry += dt * this.speed;
    while (this.carry >= step && !this.match.finished) {
      this.match.step();
      this.carry -= step;
    }
    this.draw(Math.min(this.carry / step, 1));
    if (this.match.finished) {
      this.playing = false;
      this.hud.onFrame(this.match.minute, this.match.score);
      return;
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  /** alpha：上一步到这一步之间的插值比例，让画面在两步之间也平滑。 */
  private draw(alpha: number): void {
    const ctx = this.ctx;
    const s = this.scale;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const X = (x: number) => (x + HALF_L + MARGIN) * s;
    const Y = (y: number) => (HALF_W + MARGIN - y) * s;

    // 草皮：竖条纹
    ctx.fillStyle = GRASS_A;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = GRASS_B;
    const stripes = 14;
    const sw = (HALF_L * 2) / stripes;
    for (let i = 0; i < stripes; i += 2) ctx.fillRect(X(-HALF_L + i * sw), 0, sw * s, h);

    // 线
    ctx.strokeStyle = LINE;
    ctx.lineWidth = Math.max(1, 0.12 * s);
    ctx.strokeRect(X(-HALF_L), Y(HALF_W), HALF_L * 2 * s, HALF_W * 2 * s);
    ctx.beginPath();
    ctx.moveTo(X(0), Y(HALF_W));
    ctx.lineTo(X(0), Y(-HALF_W));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X(0), Y(0), 9.15 * s, 0, Math.PI * 2);
    ctx.stroke();
    for (const side of [-1, 1]) {
      const gx = side * HALF_L;
      // 禁区 16.5 × 40.32，小禁区 5.5 × 18.32
      ctx.strokeRect(side > 0 ? X(gx - 16.5) : X(gx), Y(20.16), 16.5 * s, 40.32 * s);
      ctx.strokeRect(side > 0 ? X(gx - 5.5) : X(gx), Y(9.16), 5.5 * s, 18.32 * s);
      ctx.fillStyle = LINE;
      ctx.beginPath();
      ctx.arc(X(gx - side * 11), Y(0), 0.25 * s, 0, Math.PI * 2);
      ctx.fill();
      // 球门
      ctx.strokeRect(side > 0 ? X(gx) : X(gx - 1.5), Y(GOAL_HALF_WIDTH), 1.5 * s, GOAL_HALF_WIDTH * 2 * s);
    }

    // 球员
    const m = this.match;
    const r = 0.95 * s;
    for (const p of m.players) {
      const x = X(p.px + (p.x - p.px) * alpha);
      const y = Y(p.py + (p.y - p.py) * alpha);
      ctx.fillStyle = p.role === GK ? KEEPER_COLORS[p.team]! : TEAM_COLORS[p.team]!;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = Math.max(1, 0.18 * s);
      ctx.stroke();
      // 朝向
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(p.heading) * r * 1.5, y - Math.sin(p.heading) * r * 1.5);
      ctx.stroke();
    }

    // 球：影子 + 球（越高影子离得越远）
    const b = m.ball;
    const bx = b.px + (b.x - b.px) * alpha;
    const by = b.py + (b.y - b.py) * alpha;
    const bz = b.pz + (b.z - b.pz) * alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(X(bx + bz * 0.35), Y(by - bz * 0.35), 0.45 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(X(bx), Y(by), (0.5 + bz * 0.06) * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = Math.max(1, 0.1 * s);
    ctx.stroke();

    this.hud.onFrame(m.minute, m.score);
  }
}
