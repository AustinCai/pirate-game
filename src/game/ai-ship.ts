import { Vec2 } from '../core/vector';
import { Projectile } from './projectile';
import { Ship, type ShipOptions } from './ship';

export interface AIOptions {
  preferredSide?: 'port' | 'starboard';
}

export interface WorldBounds { minX: number; maxX: number; minY: number; maxY: number; }

// =========================
// AI Behavior Constants
// =========================
export const AI_DEFAULT_FIRE_RANGE = 520;
export const AI_DEFAULT_DESIRED_DISTANCE = 320;
export const AI_COLLISION_LOOKAHEAD_S = 2.5;
export const AI_DESIRED_SEPARATION_MULT = 1.6; // separation ~ 1.6x ship length
export const AI_EDGE_AVOID_MARGIN_PX = 800;
export const AI_WANDER_SAFE_PAD_PX = 600;
export const AI_WANDER_REACH_RADIUS_PX = 150;
export const AI_WANDER_TIME_MIN_S = 6;
export const AI_WANDER_TIME_MAX_S = 12;

export class AIShip extends Ship {
  target: Ship;
  preferredSide: 'port' | 'starboard';
  fireRange = AI_DEFAULT_FIRE_RANGE;
  desiredDistance = AI_DEFAULT_DESIRED_DISTANCE;
  aggressive = false;
  private wanderTarget: Vec2 | null = null;
  private wanderTimer = 0;

  constructor(target: Ship, opts: { ship?: ShipOptions; ai?: AIOptions; sprite?: HTMLImageElement } = {}) {
    super(opts.ship ?? {}, opts.sprite);
    this.target = target;
    this.preferredSide = opts.ai?.preferredSide ?? (Math.random() < 0.5 ? 'port' : 'starboard');
  }

  updateAI(dt: number, projectiles: Projectile[], neighbors: Ship[], world: WorldBounds) {
    // Simple helmsman: try to keep target at broadside on preferredSide and orbit at desiredDistance
    const toTarget = Vec2.sub(this.target.pos, this.pos);
    const dist = toTarget.len();
    const dirToTarget = Math.atan2(toTarget.y, toTarget.x);
    const rightAngle = this.angle + Math.PI / 2; // ship's right vector angle

    // We want the target to be to the right for starboard, or to the left for port
    // Compute angle difference between our right vector and the target bearing
    // Base broadside goal (used when aggressive)
    let diffBroad = normalizeAngle(dirToTarget - rightAngle);
    if (this.preferredSide === 'port') diffBroad = normalizeAngle(diffBroad + Math.PI); // invert side preference

    // Aggressive nose-on blend to encourage ramming when close
    const diffNose = normalizeAngle(dirToTarget - this.angle);
    const closeBlend = this.aggressive ? Math.max(0, Math.min(1, (220 - dist) / 220)) * 0.85 : 0;
    let diff = normalizeAngle(diffBroad * (1 - closeBlend) + diffNose * closeBlend);

    // Separation and predictive collision avoidance
    const desiredSep = Math.max(160, this.length * AI_DESIRED_SEPARATION_MULT);
    const sep = new Vec2(0, 0);
    const avoid = new Vec2(0, 0);
    let minNeighbor = Infinity;
    let onCollisionCourse = false;
    for (const o of neighbors) {
      if (o === this) continue;
      const toO = Vec2.sub(o.pos, this.pos);
      const d = toO.len();
      if (d <= 1e-3) continue;
      minNeighbor = Math.min(minNeighbor, d);

      // Basic separation (positional)
      if (d < desiredSep) {
        const w = (desiredSep - d) / desiredSep; // 0..1
        const away = toO.scale(-1 / d); // normalized away from neighbor
        sep.add(away.scale(w * w)); // stronger when closer
      }

      // Predictive avoidance: time to closest approach
      const vRel = Vec2.sub(o.vel, this.vel); // other relative to us
      const vRel2 = vRel.dot(vRel);
      if (vRel2 > 1e-6) {
        const t = -toO.dot(vRel) / vRel2; // time of closest approach (seconds)
        const horizon = AI_COLLISION_LOOKAHEAD_S; // lookahead seconds
        if (t > 0 && t < horizon) {
          // position of other at closest approach relative to us
          const closest = Vec2.add(toO, Vec2.scale(vRel, t));
          const safety = (this.getCollisionRadius() + o.getCollisionRadius()) * 1.15;
          if (closest.len() < safety) {
            // steer away from predicted position
            const awayPred = closest.scale(-1 / Math.max(1e-6, closest.len()));
            const weight = (horizon - t) / horizon; // sooner -> stronger
            avoid.add(awayPred.scale(weight));
            onCollisionCourse = true;
          }
        }
      }
    }
    // Edge avoidance: repulse from world edges within a margin
    const edgeMargin = AI_EDGE_AVOID_MARGIN_PX;
    const addAvoid = (vx: number, vy: number, w: number) => { avoid.x += vx * w; avoid.y += vy * w; };
    const leftDist = this.pos.x - world.minX;
    const rightDist = world.maxX - this.pos.x;
    const topDist = this.pos.y - world.minY;
    const bottomDist = world.maxY - this.pos.y;
    if (leftDist < edgeMargin) addAvoid(1, 0, sqr(1 - leftDist / edgeMargin));
    if (rightDist < edgeMargin) addAvoid(-1, 0, sqr(1 - rightDist / edgeMargin));
    if (topDist < edgeMargin) addAvoid(0, 1, sqr(1 - topDist / edgeMargin));
    if (bottomDist < edgeMargin) addAvoid(0, -1, sqr(1 - bottomDist / edgeMargin));
    // Combine avoidance influences into heading bias
    const rvx = Math.cos(rightAngle), rvy = Math.sin(rightAngle);
    const avoidVec = new Vec2(sep.x + avoid.x, sep.y + avoid.y);
    if (avoidVec.len() > 1e-3) {
      const avoidDotRight = avoidVec.x * rvx + avoidVec.y * rvy; // >0 means steer right
      const avoidScale = this.aggressive ? 0.5 : 1.0;
      const avoidTerm = Math.max(-0.7, Math.min(0.7, avoidDotRight)) * avoidScale;
      diff = normalizeAngle(diff + avoidTerm);
    }

    let fire = false;
    let turnRight = false, turnLeft = false, up = false, down = false;
    if (this.aggressive) {
      // Aggressive: engage player with broadside/ramming blend
      turnRight = diff > 0.1;
      turnLeft = diff < -0.1;
      const desiredDist = Math.max(140, this.desiredDistance * 0.6);
      const needSpeed = dist < desiredDist * 0.8 ? -1 : (dist > desiredDist * 1.2 ? 1 : 0);
      up = needSpeed > 0 || this.vel.len() < this.maxSpeed * 0.35;
      down = needSpeed < 0;
      if (minNeighbor < desiredSep * 0.6) { up = false; down = true; }
      if (onCollisionCourse) { up = false; down = true; }
      const range = this.fireRange * 1.15;
      const aligned = Math.abs(diff) < 0.25;
      fire = aligned && dist <= range;
    } else {
      // Roaming: wander to random targets inside safe bounds, avoid edges
      this.wanderTimer -= dt;
      const safePad = AI_WANDER_SAFE_PAD_PX;
      const needNew = !this.wanderTarget || this.wanderTimer <= 0 || Vec2.sub(this.wanderTarget, this.pos).len() < AI_WANDER_REACH_RADIUS_PX;
      if (needNew) {
        const tx = randRange(world.minX + safePad, world.maxX - safePad);
        const ty = randRange(world.minY + safePad, world.maxY - safePad);
        this.wanderTarget = new Vec2(tx, ty);
        this.wanderTimer = AI_WANDER_TIME_MIN_S + Math.random() * (AI_WANDER_TIME_MAX_S - AI_WANDER_TIME_MIN_S);
      }
      const toWander = this.wanderTarget ? Vec2.sub(this.wanderTarget, this.pos) : new Vec2(0, 0);
      const dirWander = Math.atan2(toWander.y, toWander.x);
      let diffWander = normalizeAngle(dirWander - this.angle);
      // apply avoidance bias to turning
      if (avoidVec.len() > 1e-3) {
        const avoidAngle = Math.atan2(avoidVec.y, avoidVec.x);
        diffWander = normalizeAngle(diffWander + normalizeAngle(avoidAngle - (this.angle + Math.PI)) * 0.6);
      }
      turnRight = diffWander > 0.08;
      turnLeft = diffWander < -0.08;
      const targetSpeed = 0.5 * this.maxSpeed + 0.5 * this.maxSpeed * Math.random();
      up = this.vel.len() < targetSpeed;
      // slow down when too close to edge
      const edgeNear = Math.min(leftDist, rightDist, topDist, bottomDist) < 400;
      if (edgeNear || onCollisionCourse || minNeighbor < desiredSep * 0.6) { up = false; down = true; }
      fire = false; // roamers do not fire by default
    }

    super.update(dt, {
      up,
      down,
      left: turnLeft,
      right: turnRight,
      fire,
    }, projectiles);
  }
}

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function randRange(min: number, max: number): number { return min + Math.random() * (max - min); }
function sqr(x: number): number { return x * x; }
