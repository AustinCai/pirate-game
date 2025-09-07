import { Vec2 } from "../core/vector";
import { Projectile } from "./projectile";

export type Side = 'port' | 'starboard';

export interface Cannon {
  offset: Vec2; // local ship coords (x forward, y right)
  side: Side;
  reloadTime: number; // seconds
  cooldown: number;   // seconds remaining
}

export interface ShipOptions {
  length?: number; // visual length
  width?: number;  // visual width
  cannonPairs?: number; // pairs per side
}

export class Ship {
  pos = new Vec2(0, 0);
  vel = new Vec2(0, 0);
  angle = -Math.PI / 2; // facing up initially
  angVel = 0;
  rudder = 0; // -1..+1
  maxHealth = 100;
  health = 100;
  isPlayer = false;

  // Sinking state
  isSinking = false;
  sinkTimer = 0;
  sinkDuration = 10; // seconds to fully sink

  // physical feel
  maxSpeed = 180; // px/s
  thrust = 50;   // forward accel
  reverseThrust = 20; // reverse accel (weaker)
  turnAccel = 1.0;    // base angular accel (rad/s^2)
  rudderRate = 1.5;   // how fast rudder moves per second
  linDrag = 0.4;      // water drag
  angDrag = 2;      // angular drag (lower -> more momentum)

  length: number;
  width: number;
  cannons: Cannon[] = [];
  sprite?: HTMLImageElement;
  // firing state
  private portIndices: number[] = [];
  private starboardIndices: number[] = [];
  private nextPort = 0;
  private nextStarboard = 0;
  private fireTimerPort = 0;
  private fireTimerStarboard = 0;
  interShotDelay = 0.08; // seconds between sequential shots per side

  constructor(opts: ShipOptions = {}, sprite?: HTMLImageElement) {
    this.length = opts.length ?? 120;
    this.width = opts.width ?? 44;
    const pairs = opts.cannonPairs ?? 6;
    this.sprite = sprite;
    this.setupCannons(pairs);
  }

  private setupCannons(pairs: number) {
    const margin = this.length * 0.18;
    const usableLen = this.length - margin * 2;
    for (let i = 0; i < pairs; i++) {
      const t = (i + 0.5) / pairs; // spread along the hull
      const x = -this.length / 2 + margin + usableLen * t; // local forward axis
      const y = this.width / 2; // starboard (right)
      const baseReload = 2.2 + Math.random() * 1.4;
      this.cannons.push({ offset: new Vec2(x, +y), side: 'starboard', reloadTime: baseReload, cooldown: 0 });
      this.starboardIndices.push(this.cannons.length - 1);
      this.cannons.push({ offset: new Vec2(x, -y), side: 'port', reloadTime: baseReload * (0.9 + Math.random() * 0.2), cooldown: 0 });
      this.portIndices.push(this.cannons.length - 1);
    }
  }

  forwardVec(): Vec2 { return new Vec2(Math.cos(this.angle), Math.sin(this.angle)); }
  rightVec(): Vec2 { return new Vec2(Math.cos(this.angle + Math.PI / 2), Math.sin(this.angle + Math.PI / 2)); }

  update(dt: number, input: { up: boolean; down: boolean; left: boolean; right: boolean; fire: boolean; }, projectiles: Projectile[]) {
    // Handle sinking animation
    if (this.isSinking) {
      this.sinkTimer += dt;
      // Stop all movement when sinking
      this.vel.set(0, 0);
      this.angVel = 0;
      this.rudder = 0;
      // Don't process normal input when sinking
      return;
    }

    // Linear forces
    const fwd = this.forwardVec();
    if (input.up) {
      // Forward thrust
      this.vel.add(Vec2.scale(fwd, this.thrust * dt));
    }
    if (input.down) {
      // Reverse thrust
      this.vel.add(Vec2.scale(fwd, -this.reverseThrust * dt));
    }

    // Cap speed
    let speed = this.vel.len();
    if (speed > this.maxSpeed) {
      this.vel.scale(this.maxSpeed / Math.max(1e-6, speed));
    }

    // Rudder-based turning with momentum
    const target = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const desired = Math.max(-1, Math.min(1, target));
    if (this.rudder < desired) this.rudder = Math.min(desired, this.rudder + this.rudderRate * dt);
    else if (this.rudder > desired) this.rudder = Math.max(desired, this.rudder - this.rudderRate * dt);

    // Turn accel grows with speed for a more authentic feel
    speed = this.vel.len();
    const speedFactor = 0.4 + 1.2 * Math.min(1, speed / this.maxSpeed);
    this.angVel += this.rudder * this.turnAccel * speedFactor * dt;

    // Drag
    const drag = 1 / (1 + this.linDrag * dt);
    this.vel.scale(drag);
    const aDrag = 1 / (1 + this.angDrag * dt);
    this.angVel *= aDrag;

    // Integrate
    this.pos.add(Vec2.scale(this.vel, dt));
    this.angle += this.angVel * dt;

    // Cannons
    for (const c of this.cannons) {
      c.cooldown = Math.max(0, c.cooldown - dt);
    }
    // per-side inter-shot timers and sequential firing while holding fire
    this.fireTimerPort = Math.max(0, this.fireTimerPort - dt);
    this.fireTimerStarboard = Math.max(0, this.fireTimerStarboard - dt);
    if (input.fire) {
      this.tryFireSide('port', projectiles);
      this.tryFireSide('starboard', projectiles);
    }
  }

  private localToWorld(local: Vec2): Vec2 {
    const rotated = local.rotated(this.angle);
    return Vec2.add(this.pos, rotated);
  }

  private tryFireSide(side: Side, projectiles: Projectile[]) {
    const indices = side === 'port' ? this.portIndices : this.starboardIndices;
    if (!indices.length) return;
    const timer = side === 'port' ? this.fireTimerPort : this.fireTimerStarboard;
    if (timer > 0) return;
    let next = side === 'port' ? this.nextPort : this.nextStarboard;
    const count = indices.length;
    for (let i = 0; i < count; i++) {
      const idx = indices[(next + i) % count];
      const c = this.cannons[idx];
      if (c.cooldown <= 0) {
        const right = this.rightVec();
        const outward = (side === 'starboard') ? right.clone() : right.clone().scale(-1);
        const muzzleSpeed = 380;
        const spread = 0.04;
        const pos = this.localToWorld(c.offset);
        const dir = outward.rotated((Math.random() - 0.5) * spread);
        const vel = Vec2.add(this.vel, Vec2.scale(dir, muzzleSpeed));
        projectiles.push(new Projectile(pos, vel, this));
        c.cooldown = c.reloadTime;
        next = (next + i + 1) % count;
        if (side === 'port') { this.nextPort = next; this.fireTimerPort = this.interShotDelay; }
        else { this.nextStarboard = next; this.fireTimerStarboard = this.interShotDelay; }
        return;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, camera: Vec2, w: number, h: number) {
    const cx = this.pos.x - camera.x + w / 2;
    const cy = this.pos.y - camera.y + h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.angle);

    // Calculate fade for sinking animation
    let alpha = 1.0;
    if (this.isSinking) {
      alpha = Math.max(0, 1 - (this.sinkTimer / this.sinkDuration));
      ctx.globalAlpha = alpha;
    }

    if (this.sprite) {
      const scale = this.length / this.sprite.width;
      const drawW = this.sprite.width * scale;
      const drawH = this.sprite.height * scale;
      ctx.drawImage(this.sprite, -drawW / 2, -drawH / 2, drawW, drawH);
    } else {
      // Fallback hull if no sprite available yet
      // Turn grey when sinking
      const baseColor = this.isSinking ? '#666666' : '#5b3b1a';
      const strokeColor = this.isSinking ? '#333333' : '#2c1b0b';

      ctx.fillStyle = baseColor;
      ctx.strokeStyle = strokeColor;
      const L = this.length, W = this.width;
      ctx.beginPath();
      ctx.moveTo(+L / 2, 0);
      ctx.bezierCurveTo(+L / 4, +W / 2, -L / 4, +W / 2, -L / 2, +W / 3);
      ctx.lineTo(-L / 2, -W / 3);
      ctx.bezierCurveTo(-L / 4, -W / 2, +L / 4, -W / 2, +L / 2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();

    // Reset global alpha
    ctx.globalAlpha = 1.0;

    // health bar (don't show when sinking)
    if (!this.isSinking) {
      this.drawHealthBar(ctx, camera, w, h);
    }
  }

  drawHealthBar(ctx: CanvasRenderingContext2D, camera: Vec2, w: number, h: number) {
    const frac = Math.max(0, Math.min(1, this.health / this.maxHealth));
    const cx = this.pos.x - camera.x + w / 2;
    const cy = this.pos.y - camera.y + h / 2;
    const bw = Math.max(30, this.length * 0.5);
    const bh = 6;
    const y = cy - this.width - 18;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(cx - bw / 2, y, bw, bh);
    ctx.fillStyle = frac > 0.5 ? '#34d399' : (frac > 0.25 ? '#f59e0b' : '#ef4444');
    ctx.fillRect(cx - bw / 2, y, bw * frac, bh);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - bw / 2, y, bw, bh);
    ctx.restore();
  }

  takeDamage(dmg: number) {
    this.health = Math.max(0, this.health - dmg);
  }

  startSinking() {
    if (!this.isSinking) {
      this.isSinking = true;
      this.sinkTimer = 0;
    }
  }

  isFullySunk(): boolean {
    return this.isSinking && this.sinkTimer >= this.sinkDuration;
  }

  // Check circle collision against rotated-rect hull
  hitsCircle(center: Vec2, radius: number): boolean {
    // transform to local space
    const rel = Vec2.sub(center, this.pos).rotated(-this.angle);
    const hx = this.length / 2;
    const hy = this.width / 2;
    const cx = Math.max(-hx, Math.min(hx, rel.x));
    const cy = Math.max(-hy, Math.min(hy, rel.y));
    const dx = rel.x - cx;
    const dy = rel.y - cy;
    return (dx * dx + dy * dy) <= radius * radius;
  }
}
