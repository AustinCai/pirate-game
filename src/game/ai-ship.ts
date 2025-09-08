import * as Constants from '../core/constants';
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
export const AI_DEFAULT_FIRE_RANGE = Constants.AI_DEFAULT_FIRE_RANGE;
export const AI_DEFAULT_DESIRED_DISTANCE = Constants.AI_DEFAULT_DESIRED_DISTANCE;
export const AI_COLLISION_LOOKAHEAD_S = Constants.AI_COLLISION_LOOKAHEAD_S;
export const AI_DESIRED_SEPARATION_MULT = Constants.AI_DESIRED_SEPARATION_MULT;
export const AI_EDGE_AVOID_MARGIN_PX = Constants.AI_EDGE_AVOID_MARGIN_PX;
export const AI_WANDER_SAFE_PAD_PX = Constants.AI_WANDER_SAFE_PAD_PX;
export const AI_WANDER_REACH_RADIUS_PX = Constants.AI_WANDER_REACH_RADIUS_PX;
export const AI_WANDER_TIME_MIN_S = Constants.AI_WANDER_TIME_MIN_S;
export const AI_WANDER_TIME_MAX_S = Constants.AI_WANDER_TIME_MAX_S;

export class AIShip extends Ship {
  target: Ship;
  preferredSide: 'port' | 'starboard';
  fireRange = Constants.AI_DEFAULT_FIRE_RANGE;
  desiredDistance = Constants.AI_DEFAULT_DESIRED_DISTANCE;
  aggressive = false;
  edgeAvoidStrength = 1.0; // Multiplier for edge avoidance strength
  combatAggressiveness = 1.0; // Multiplier for combat behavior intensity
  pursuitPersistence = 1.0; // Multiplier for how persistent in pursuit
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

    // Improved aggressive behavior with better player prediction
    const diffNose = normalizeAngle(dirToTarget - this.angle);

    // More sophisticated blending based on distance and speed
    let closeBlend = 0;
    if (this.aggressive) {
      // Base close blend on distance
      const baseBlend = Math.max(0, Math.min(1, (280 - dist) / 280));

      // Increase blend when player is moving fast (they're trying to escape)
      const playerSpeed = this.target.vel.len();
      const speedFactor = Math.min(1, playerSpeed / 100); // Max effect at 100+ speed
      closeBlend = baseBlend * (0.6 + speedFactor * 0.4); // 0.6 to 1.0 multiplier

      // Extra aggression when very close (for ramming)
      if (dist < 150) {
        closeBlend = Math.min(1, closeBlend + 0.3);
      }
    }

    let diff = normalizeAngle(diffBroad * (1 - closeBlend) + diffNose * closeBlend);

    // Add player movement prediction for better pursuit
    if (this.aggressive && dist > 50) {
      const playerVel = this.target.vel;
      const predictionTime = Math.min(2.0, dist / 200); // Predict 0.5-2 seconds ahead
      const predictedPos = Vec2.add(this.target.pos, Vec2.scale(playerVel, predictionTime));
      const toPredicted = Vec2.sub(predictedPos, this.pos);
      const predictedAngle = Math.atan2(toPredicted.y, toPredicted.x);
      const predictedDiff = normalizeAngle(predictedAngle - this.angle);

      // Blend current and predicted target (favor prediction when player is moving)
      const predictionWeight = Math.min(0.4, playerVel.len() / 150);
      diff = normalizeAngle(diff * (1 - predictionWeight) + predictedDiff * predictionWeight);
    }

    // Separation and predictive collision avoidance
    const desiredSep = Math.max(160, this.length * Constants.AI_DESIRED_SEPARATION_MULT);
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
        const horizon = Constants.AI_COLLISION_LOOKAHEAD_S; // lookahead seconds
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
    // Edge avoidance: repulse from world edges within a margin (always active)
    const edgeMargin = Constants.AI_EDGE_AVOID_MARGIN_PX;
    const addAvoid = (vx: number, vy: number, w: number) => { avoid.x += vx * w; avoid.y += vy * w; };
    const leftDist = this.pos.x - world.minX;
    const rightDist = world.maxX - this.pos.x;
    const topDist = this.pos.y - world.minY;
    const bottomDist = world.maxY - this.pos.y;

    // Calculate edge avoidance strength (stronger when closer to edge)
    let maxEdgeAvoidStrength = 0;
    if (leftDist < edgeMargin) {
      const strength = Math.pow(1 - leftDist / edgeMargin, 2) * this.edgeAvoidStrength;
      addAvoid(1, 0, strength * 2.0); // Push right
      maxEdgeAvoidStrength = Math.max(maxEdgeAvoidStrength, strength);
    }
    if (rightDist < edgeMargin) {
      const strength = Math.pow(1 - rightDist / edgeMargin, 2) * this.edgeAvoidStrength;
      addAvoid(-1, 0, strength * 2.0); // Push left
      maxEdgeAvoidStrength = Math.max(maxEdgeAvoidStrength, strength);
    }
    if (topDist < edgeMargin) {
      const strength = Math.pow(1 - topDist / edgeMargin, 2) * this.edgeAvoidStrength;
      addAvoid(0, 1, strength * 2.0); // Push down
      maxEdgeAvoidStrength = Math.max(maxEdgeAvoidStrength, strength);
    }
    if (bottomDist < edgeMargin) {
      const strength = Math.pow(1 - bottomDist / edgeMargin, 2) * this.edgeAvoidStrength;
      addAvoid(0, -1, strength * 2.0); // Push up
      maxEdgeAvoidStrength = Math.max(maxEdgeAvoidStrength, strength);
    }

    // Combine avoidance influences into heading bias
    const rvx = Math.cos(rightAngle), rvy = Math.sin(rightAngle);
    const avoidVec = new Vec2(sep.x + avoid.x, sep.y + avoid.y);
    if (avoidVec.len() > 1e-3) {
      const avoidDotRight = avoidVec.x * rvx + avoidVec.y * rvy; // >0 means steer right
      const avoidScale = this.aggressive ? 0.5 : 1.0;
      const avoidTerm = Math.max(-0.8, Math.min(0.8, avoidDotRight)) * avoidScale;
      diff = normalizeAngle(diff + avoidTerm);
    }

    // Always apply some edge avoidance even without collision avoidance
    const minEdgeDist = Math.min(leftDist, rightDist, topDist, bottomDist);
    if (minEdgeDist < edgeMargin * 0.8) { // Start avoiding when within 80% of edge margin
      // Calculate direction away from nearest edge
      let edgeAvoidX = 0, edgeAvoidY = 0;
      if (leftDist <= minEdgeDist + 10) edgeAvoidX = 1; // Push right
      if (rightDist <= minEdgeDist + 10) edgeAvoidX = -1; // Push left
      if (topDist <= minEdgeDist + 10) edgeAvoidY = 1; // Push down
      if (bottomDist <= minEdgeDist + 10) edgeAvoidY = -1; // Push up

      if (edgeAvoidX !== 0 || edgeAvoidY !== 0) {
        const edgeAvoidAngle = Math.atan2(edgeAvoidY, edgeAvoidX);
        const edgeAvoidTerm = normalizeAngle(edgeAvoidAngle - this.angle);
        diff = normalizeAngle(diff + edgeAvoidTerm * 0.3 * this.edgeAvoidStrength); // Moderate edge avoidance with strength multiplier
      }
    }

    let fire = false;
    let turnRight = false, turnLeft = false, up = false, down = false;
    if (this.aggressive) {
      // Aggressive: engage player with improved tracking and combat effectiveness
      // Adaptive turning sensitivity based on combat aggressiveness
      const turnThreshold = 0.06 / this.combatAggressiveness; // More aggressive ships turn more sharply
      turnRight = diff > turnThreshold;
      turnLeft = diff < -turnThreshold;

      // Improved distance management with combat aggressiveness multiplier
      const desiredDist = Math.max(100, this.desiredDistance * (0.4 / this.combatAggressiveness)); // Closer engagement based on aggressiveness
      const closeRange = desiredDist * (0.5 / this.combatAggressiveness); // More aggressive ships get closer
      const farRange = desiredDist * (1.2 * this.combatAggressiveness);   // Less aggressive ships keep more distance

      let needSpeed = 0;
      if (dist < closeRange) {
        // Too close - back away slightly for better positioning
        needSpeed = -0.6 * this.combatAggressiveness;
      } else if (dist > farRange) {
        // Too far - close in aggressively
        needSpeed = 1.4 * this.combatAggressiveness;
      } else if (dist > desiredDist) {
        // Slightly far - moderate approach
        needSpeed = 0.7 * this.combatAggressiveness;
      } else {
        // Good range - maintain speed or slight adjustment
        needSpeed = this.vel.len() < this.maxSpeed * 0.35 ? 0.4 * this.combatAggressiveness : 0;
      }

      up = needSpeed > 0 || this.vel.len() < this.maxSpeed * 0.25;
      down = needSpeed < 0;

      // Collision and edge avoidance (less restrictive for aggressive ships)
      if (minNeighbor < desiredSep * 0.4) { up = false; down = true; } // More restrictive collision avoidance
      if (onCollisionCourse && dist > 100) { up = false; down = true; } // Only avoid if not very close to player

      // Less restrictive edge avoidance for aggressive ships (they prioritize combat)
      const edgeNearAggressive = minEdgeDist < edgeMargin * 0.3; // Reduced from 0.5
      if (edgeNearAggressive && dist > 200) { up = false; down = true; } // Only if far from player

      // Enhanced firing logic with combat aggressiveness
      const range = this.fireRange * (1.1 + this.combatAggressiveness * 0.3); // Extended range for aggressive ships
      const alignmentThreshold = 0.18 / this.combatAggressiveness; // More aggressive ships are more accurate
      const aligned = Math.abs(diff) < alignmentThreshold;

      // More aggressive firing conditions
      const minRange = Math.max(60, 100 / this.combatAggressiveness); // Aggressive ships fire closer
      const goodRange = dist <= range && dist >= minRange;
      const speedAdvantage = this.vel.len() > this.target.vel.len() * 0.8; // Fire when we have speed advantage

      fire = aligned && goodRange && (speedAdvantage || dist < 200); // Always fire when close
    } else {
      // Roaming: wander to random targets inside safe bounds, avoid edges
      this.wanderTimer -= dt;
      const safePad = Constants.AI_WANDER_SAFE_PAD_PX;
      const needNew = !this.wanderTarget || this.wanderTimer <= 0 || Vec2.sub(this.wanderTarget, this.pos).len() < Constants.AI_WANDER_REACH_RADIUS_PX;
      if (needNew) {
        const tx = randRange(world.minX + safePad, world.maxX - safePad);
        const ty = randRange(world.minY + safePad, world.maxY - safePad);
        this.wanderTarget = new Vec2(tx, ty);
        this.wanderTimer = Constants.AI_WANDER_TIME_MIN_S + Math.random() * (Constants.AI_WANDER_TIME_MAX_S - Constants.AI_WANDER_TIME_MIN_S);
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
      // Slow down when too close to edge (for roaming ships)
      const edgeNearRoaming = minEdgeDist < edgeMargin * 0.6; // 60% of edge margin
      if (edgeNearRoaming || onCollisionCourse || minNeighbor < desiredSep * 0.6) { up = false; down = true; }
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
