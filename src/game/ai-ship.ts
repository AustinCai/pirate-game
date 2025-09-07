import { Vec2 } from '../core/vector';
import { Projectile } from './projectile';
import { Ship, type ShipOptions } from './ship';

export interface AIOptions {
  preferredSide?: 'port' | 'starboard';
}

export class AIShip extends Ship {
  target: Ship;
  preferredSide: 'port' | 'starboard';
  fireRange = 520;
  desiredDistance = 320;

  constructor(target: Ship, opts: { ship?: ShipOptions; ai?: AIOptions; sprite?: HTMLImageElement } = {}) {
    super(opts.ship ?? {}, opts.sprite);
    this.target = target;
    this.preferredSide = opts.ai?.preferredSide ?? (Math.random() < 0.5 ? 'port' : 'starboard');
  }

  updateAI(dt: number, projectiles: Projectile[], neighbors: Ship[]) {
    // Simple helmsman: try to keep target at broadside on preferredSide and orbit at desiredDistance
    const toTarget = Vec2.sub(this.target.pos, this.pos);
    const dist = toTarget.len();
    const dirToTarget = Math.atan2(toTarget.y, toTarget.x);
    const rightAngle = this.angle + Math.PI / 2; // ship's right vector angle

    // We want the target to be to the right for starboard, or to the left for port
    // Compute angle difference between our right vector and the target bearing
    let diff = normalizeAngle(dirToTarget - rightAngle);
    if (this.preferredSide === 'port') diff = normalizeAngle(diff + Math.PI); // invert side preference

    // Separation: steer away from nearby ships to reduce clumping
    const desiredSep = Math.max(160, this.length * 1.6);
    const sep = new Vec2(0, 0);
    let minNeighbor = Infinity;
    for (const o of neighbors) {
      if (o === this) continue;
      const v = Vec2.sub(this.pos, o.pos);
      const d = v.len();
      if (d <= 1e-3) continue;
      minNeighbor = Math.min(minNeighbor, d);
      if (d < desiredSep) {
        const w = (desiredSep - d) / desiredSep; // 0..1
        sep.add(v.scale(1 / d).scale(w * w)); // direction away, stronger when closer
      }
    }
    if (sep.len() > 1e-3) {
      const rvx = Math.cos(rightAngle), rvy = Math.sin(rightAngle);
      const sepDotRight = sep.x * rvx + sep.y * rvy; // >0 means steer right to separate
      const avoidTerm = Math.max(-0.5, Math.min(0.5, sepDotRight * 0.8));
      diff = normalizeAngle(diff + avoidTerm);
    }

    // Steering: if diff > 0 turn right, else left
    const turnRight = diff > 0.1;
    const turnLeft = diff < -0.1;

    // Throttle: thrust if we're too far from desiredDistance or we need way to gain steerage
    const needSpeed = dist < this.desiredDistance * 0.8 ? -1 : (dist > this.desiredDistance * 1.2 ? 1 : 0);
    let up = needSpeed > 0 || this.vel.len() < this.maxSpeed * 0.35;
    let down = needSpeed < 0;
    if (minNeighbor < desiredSep * 0.6) { up = false; down = true; }

    // Fire when side alignment is good and within range
    const aligned = Math.abs(diff) < 0.2; // within ~11 degrees of broadside
    const fire = aligned && dist <= this.fireRange;

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
