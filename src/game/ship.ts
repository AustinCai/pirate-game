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
  static _nextId = 1;
  id: number;
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
    this.id = Ship._nextId++;
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
    // Handle sinking: ignore thrust/turn/fire inputs, but keep physics drag and momentum
    if (this.isSinking) {
      this.sinkTimer += dt;
      // override inputs while sinking
      input = { up: false, down: false, left: false, right: false, fire: false };
    }

    // Linear forces
    const healthFrac = Math.max(0, Math.min(1, this.health / Math.max(1, this.maxHealth)));
    const damageFactor = 0.5 + 0.5 * healthFrac; // 1.0 at full HP, 0.5 at 0 HP
    const fwd = this.forwardVec();
    if (input.up) {
      // Forward thrust
      this.vel.add(Vec2.scale(fwd, this.thrust * damageFactor * dt));
    }
    if (input.down) {
      // Reverse thrust
      this.vel.add(Vec2.scale(fwd, -this.reverseThrust * damageFactor * dt));
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
    this.angVel += this.rudder * (this.turnAccel * damageFactor) * speedFactor * dt;

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
    if (input.fire && !this.isSinking) {
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

    // Draw debug hitbox (polygon outline)
    this.drawDebugHitbox(ctx, camera, w, h);

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
    // Tick marks at every 100 HP (100, 200, 300, ...) within bar
    const ticks = Math.floor(this.maxHealth / 100);
    if (ticks >= 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= ticks; i++) {
        const hp = i * 100;
        if (hp >= this.maxHealth) break; // avoid drawing on the far edge
        const tx = cx - bw / 2 + (hp / this.maxHealth) * bw + 0.5; // pixel-align
        ctx.beginPath();
        ctx.moveTo(tx, y);
        ctx.lineTo(tx, y + bh);
        ctx.stroke();
      }
    }
    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - bw / 2, y, bw, bh);
    ctx.restore();
  }

  drawDebugHitbox(ctx: CanvasRenderingContext2D, camera: Vec2, w: number, h: number) {
    const hullPoints = this.getHullPolygon();

    if (hullPoints.length < 3) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)'; // Yellow outline for debug
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]); // Dashed line

    ctx.beginPath();
    const firstPoint = hullPoints[0];
    const startX = firstPoint.x - camera.x + w / 2;
    const startY = firstPoint.y - camera.y + h / 2;
    ctx.moveTo(startX, startY);

    for (let i = 1; i < hullPoints.length; i++) {
      const point = hullPoints[i];
      const x = point.x - camera.x + w / 2;
      const y = point.y - camera.y + h / 2;
      ctx.lineTo(x, y);
    }

    // Close the polygon
    ctx.closePath();
    ctx.stroke();

    // Draw vertex points for clarity
    ctx.fillStyle = 'rgba(255, 0, 0, 0.8)'; // Red dots at vertices
    ctx.setLineDash([]); // Solid dots
    for (const point of hullPoints) {
      const x = point.x - camera.x + w / 2;
      const y = point.y - camera.y + h / 2;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

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

  // Get the ship's hull polygon points in world space
  getHullPolygon(): Vec2[] {
    const points: Vec2[] = [];

    // Based on the drawing code, approximate the ship's shape with key points
    const L = this.length;
    const W = this.width;

    // Bow (front point)
    points.push(new Vec2(L / 2, 0));

    // Starboard side curve approximation
    points.push(new Vec2(L / 4, W / 2));
    points.push(new Vec2(-L / 4, W / 2));
    points.push(new Vec2(-L / 2, W / 3));

    // Stern (back)
    points.push(new Vec2(-L / 2, -W / 3));

    // Port side curve approximation
    points.push(new Vec2(-L / 4, -W / 2));
    points.push(new Vec2(L / 4, -W / 2));

    // Transform points to world space
    const worldPoints: Vec2[] = [];
    for (const point of points) {
      const worldPoint = this.localToWorld(point);
      worldPoints.push(worldPoint);
    }

    return worldPoints;
  }

  // Check if a point is inside the ship's hull polygon
  pointInHull(point: Vec2): boolean {
    const polygon = this.getHullPolygon();
    return this.pointInPolygon(point, polygon);
  }

  // Point in polygon algorithm using ray casting
  private pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
    let inside = false;
    const n = polygon.length;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;

      if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  }

  // Check circle collision against the ship's actual hull shape
  hitsCircle(center: Vec2, radius: number): boolean {
    // Check if circle center is inside hull
    if (this.pointInHull(center)) {
      return true;
    }

    // Check if any hull edge intersects with circle
    const hullPoints = this.getHullPolygon();
    const n = hullPoints.length;

    for (let i = 0; i < n; i++) {
      const p1 = hullPoints[i];
      const p2 = hullPoints[(i + 1) % n];

      if (this.lineIntersectsCircle(p1, p2, center, radius)) {
        return true;
      }
    }

    return false;
  }

  // Check if line segment intersects with circle
  private lineIntersectsCircle(p1: Vec2, p2: Vec2, center: Vec2, radius: number): boolean {
    const d = Vec2.sub(p2, p1);
    const f = Vec2.sub(p1, center);

    const a = d.dot(d);
    const b = 2 * f.dot(d);
    const c = f.dot(f) - radius * radius;

    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) {
      return false;
    }

    const discriminantSqrt = Math.sqrt(discriminant);
    const t1 = (-b - discriminantSqrt) / (2 * a);
    const t2 = (-b + discriminantSqrt) / (2 * a);

    // Check if intersection points are within the line segment
    return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
  }

  // Approximate radius and mass for simple physics interactions (collisions)
  getCollisionRadius(): number {
    return Math.max(this.length * 0.35, this.width * 0.6);
  }

  getMass(): number {
    return this.length * this.width; // proportional to area
  }

  // Add N new cannon pairs (one per side per pair)
  addCannons(pairs: number) {
    if (pairs <= 0) return;
    const margin = this.length * 0.18;
    const usableLen = this.length - margin * 2;
    for (let i = 0; i < pairs; i++) {
      const t = Math.random();
      const x = -this.length / 2 + margin + usableLen * t;
      const y = this.width / 2;
      const baseReload = 2.2 + Math.random() * 1.4;
      this.cannons.push({ offset: new Vec2(x, +y), side: 'starboard', reloadTime: baseReload, cooldown: 0 });
      this.starboardIndices.push(this.cannons.length - 1);
      this.cannons.push({ offset: new Vec2(x, -y), side: 'port', reloadTime: baseReload * (0.9 + Math.random() * 0.2), cooldown: 0 });
      this.portIndices.push(this.cannons.length - 1);
    }
  }
}
