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
  edgeAvoidStrength = 1.0;
  private wanderTarget: Vec2 | null = null;
  private wanderTimer = 0;
  private lastDamageTime = 0; // Time when last damage was taken
  protected passiveTimeout = 10.0; // Seconds without damage before becoming passive

  // Travel mode properties
  private travelMode = false;
  private travelTarget: Vec2 | null = null;

  constructor(target: Ship, opts: { ship?: ShipOptions; ai?: AIOptions; sprite?: HTMLImageElement } = {}) {
    super(opts.ship ?? {}, opts.sprite);
    this.target = target;
    this.preferredSide = opts.ai?.preferredSide ?? (Math.random() < 0.5 ? 'port' : 'starboard');
  }

  takeDamage(dmg: number, attackerIsPlayer?: boolean) {
    // Call parent method first
    super.takeDamage(dmg, attackerIsPlayer);

    // Become aggressive when taking damage
    if (dmg > 0) {
      this.aggressive = true;
      this.lastDamageTime = Date.now() / 1000; // Current time in seconds
      // Exit travel mode when taking damage
      if (this.travelMode) {
        this.travelMode = false;
        this.travelTarget = null;
      }
    }
  }

  // Set up travel mode with a target destination
  setTravelTarget(target: Vec2) {
    this.travelMode = true;
    this.travelTarget = target.clone();
    this.aggressive = false; // Start non-aggressive in travel mode
  }

  // Check if ship has reached travel target
  private hasReachedTravelTarget(): boolean {
    if (!this.travelTarget || !this.travelMode) return false;
    const distance = Vec2.sub(this.travelTarget, this.pos).len();
    return distance < 100; // Within 100 units of target
  }

  // Exit travel mode if target reached
  private checkTravelMode() {
    if (this.travelMode && this.hasReachedTravelTarget()) {
      this.travelMode = false;
      this.travelTarget = null;
    }
  }

  private updateAggressionState() {
    if (!this.aggressive) return;
    if (this.passiveTimeout <= 0) return;
    if (this.lastDamageTime <= 0) return;
    const now = Date.now() / 1000;
    if (now - this.lastDamageTime >= this.passiveTimeout) {
      this.aggressive = false;
      this.lastDamageTime = 0;
      this.wanderTimer = 0;
      this.wanderTarget = null;
    }
  }

  /**
   * Calculates the optimal angle for presenting a broadside to the target ship.
   * Naval tactic: ships want to show their side (with more cannons) rather than bow/stern.
   * - Starboard preference: face 90° clockwise from target direction (starboard side toward target)
   * - Port preference: face 90° counterclockwise from target direction (port side toward target)
   */
  private getPreferredBroadsideAngle(targetAngle: number): number {
    const offset = this.preferredSide === 'starboard' ? -Math.PI / 2 : Math.PI / 2;
    return normalizeAngle(targetAngle + offset);
  }

  /**
   * Updates the wandering behavior for passive (non-aggressive) AI ships.
   * Creates random movement patterns to make ships more dynamic when not in combat.
   *
   * Target selection process:
   * - Chooses random coordinates within world bounds but with 2000px "safe padding" from edges
   * - Prefers central areas of the map (world bounds: -4000 to +4000 in both X and Y)
   * - Each target is active for 6-12 seconds before choosing a new one
   * - Ship moves toward target until within 150px reach radius
   *
   * @param dt Time delta in seconds
   * @param world World boundary constraints
   * @returns Angle to steer toward current wander target
   */
  private updateWanderTarget(dt: number, world: WorldBounds): number {
    this.wanderTimer -= dt;
    const safePad = Constants.AI_WANDER_SAFE_PAD_PX;
    const currentTarget = this.wanderTarget;
    const reachedTarget = currentTarget ? Vec2.sub(currentTarget, this.pos).len() < Constants.AI_WANDER_REACH_RADIUS_PX : false;
    const needNewTarget = !currentTarget || this.wanderTimer <= 0 || reachedTarget;

    if (needNewTarget) {
      const tx = randRange(world.minX + safePad, world.maxX - safePad);
      const ty = randRange(world.minY + safePad, world.maxY - safePad);
      this.wanderTarget = new Vec2(tx, ty);
      this.wanderTimer = Constants.AI_WANDER_TIME_MIN_S + Math.random() * (Constants.AI_WANDER_TIME_MAX_S - Constants.AI_WANDER_TIME_MIN_S);
    }

    const activeTarget = this.wanderTarget;
    if (!activeTarget) return this.angle;
    const toWander = Vec2.sub(activeTarget, this.pos);
    return Math.atan2(toWander.y, toWander.x);
  }

  private computeAvoidanceVector(neighbors: Ship[], world: WorldBounds): Vec2 {
    const result = new Vec2(0, 0);
    const desiredSeparation = Math.max(140, this.length * Constants.AI_DESIRED_SEPARATION_MULT);

    for (const other of neighbors) {
      if (other === this) continue;
      const offset = Vec2.sub(this.pos, other.pos);
      const distance = offset.len();
      if (distance <= 1e-3) continue;
      if (distance < desiredSeparation) {
        const weight = (desiredSeparation - distance) / desiredSeparation;
        const push = Vec2.scale(offset, weight / distance);
        result.add(push);
      }
    }

    const margin = Constants.AI_EDGE_AVOID_MARGIN_PX;
    const leftDist = this.pos.x - world.minX;
    const rightDist = world.maxX - this.pos.x;
    const topDist = this.pos.y - world.minY;
    const bottomDist = world.maxY - this.pos.y;

    if (leftDist < margin) {
      result.x += (1 - leftDist / margin) * this.edgeAvoidStrength;
    }
    if (rightDist < margin) {
      result.x -= (1 - rightDist / margin) * this.edgeAvoidStrength;
    }
    if (topDist < margin) {
      result.y += (1 - topDist / margin) * this.edgeAvoidStrength;
    }
    if (bottomDist < margin) {
      result.y -= (1 - bottomDist / margin) * this.edgeAvoidStrength;
    }

    return result;
  }

  /**
   * Main AI decision-making logic that controls ship behavior based on aggression state.
   *
   * AGGRESSIVE STATE BEHAVIOR (when this.aggressive = true):
   * - ACTIVATION: Triggered when ship takes damage (see takeDamage method)
   * - DEACTIVATION: Returns to passive after 10 seconds without taking damage
   * - TARGETING: Seeks and attacks the player ship (this.target)
   * - SIMPLE RANGE BEHAVIOR:
   *   * Outside 800 units: Move directly toward target at 80% speed to close distance
   *   * Within 800 units: Use broadside positioning at 55% speed for optimal firing
   * - BROADSIDE TACTIC: Uses getPreferredBroadsideAngle() to present ship's side to target
   * - FIRING: Can fire cannons when reasonably aligned (within ~45 degrees of broadside) and within range
   * - COLLISION AVOIDANCE: Reduced influence (0.35 blend factor) to prioritize combat
   *
   * PASSIVE STATE BEHAVIOR (when this.aggressive = false):
   * - WANDERING: Uses updateWanderTarget() for random movement patterns
   * - COLLISION AVOIDANCE: Stronger influence (0.6 blend factor) for safer navigation
   * - NO FIRING: Passive ships never attack
   */
  updateAI(dt: number, projectiles: Projectile[], neighbors: Ship[], world: WorldBounds) {
    this.updateAggressionState();
    this.checkTravelMode();

    // Always calculate target info for aggressive behavior
    const toTarget = Vec2.sub(this.target.pos, this.pos);
    const distToTarget = toTarget.len();
    const targetAngle = Math.atan2(toTarget.y, toTarget.x);
    const preferredBroadside = this.getPreferredBroadsideAngle(targetAngle);

    let desiredAngle = this.angle;

    if (this.travelMode && this.travelTarget) {
      // Travel mode: move straight towards travel target
      const toTravelTarget = Vec2.sub(this.travelTarget, this.pos);
      desiredAngle = Math.atan2(toTravelTarget.y, toTravelTarget.x);

      const avoidance = this.computeAvoidanceVector(neighbors, world);
      const avoidAngle = avoidance.len() > 1e-3 ? Math.atan2(avoidance.y, avoidance.x) : null;
      if (avoidAngle !== null) {
        desiredAngle = blendAngles(desiredAngle, avoidAngle, 0.6);
      }
    } else {
    // Normal AI behavior (aggressive or wander)
      const avoidance = this.computeAvoidanceVector(neighbors, world);
      const avoidAngle = avoidance.len() > 1e-3 ? Math.atan2(avoidance.y, avoidance.x) : null;

      if (this.aggressive) {
        const withinCombatRange = distToTarget <= 800;
        desiredAngle = withinCombatRange ? preferredBroadside : targetAngle;
        if (avoidAngle !== null) {
          desiredAngle = blendAngles(desiredAngle, avoidAngle, 0.35);
        }
      } else {
        desiredAngle = this.updateWanderTarget(dt, world);
        if (avoidAngle !== null) {
          desiredAngle = blendAngles(desiredAngle, avoidAngle, 0.6);
        }
      }
    }

    const headingError = normalizeAngle(desiredAngle - this.angle);
    const turnThreshold = 0.05;
    const turnRight = headingError > turnThreshold;
    const turnLeft = headingError < -turnThreshold;

    const forward = this.forwardVec();
    const forwardSpeed = this.vel.dot(forward);
    let desiredForwardSpeed = this.maxSpeed * 0.4;

    if (this.travelMode) {
      // Travel mode: consistent speed towards destination
      desiredForwardSpeed = this.maxSpeed * 0.7;
    } else if (this.aggressive) {
      const withinCombatRange = distToTarget <= 800;
      if (withinCombatRange) {
        desiredForwardSpeed = this.maxSpeed * 0.55; // Moderate speed for broadside maneuvering
      } else {
        desiredForwardSpeed = this.maxSpeed * 0.8; // High speed to close distance to player
      }
    }

    const edgeMargin = Constants.AI_EDGE_AVOID_MARGIN_PX;
    const leftDist = this.pos.x - world.minX;
    const rightDist = world.maxX - this.pos.x;
    const topDist = this.pos.y - world.minY;
    const bottomDist = world.maxY - this.pos.y;
    const minEdgeDist = Math.min(leftDist, rightDist, topDist, bottomDist);
    if (minEdgeDist < edgeMargin * 0.4) {
      desiredForwardSpeed = Math.min(desiredForwardSpeed, this.maxSpeed * 0.2);
    }

    const speedTolerance = 12;
    let up = false;
    let down = false;
    if (desiredForwardSpeed > forwardSpeed + speedTolerance) {
      up = true;
    } else if (desiredForwardSpeed < forwardSpeed - speedTolerance) {
      down = true;
    }

    let fire = false;
    if (this.aggressive && distToTarget <= this.fireRange) {
      const broadsideAngle = this.preferredSide === 'starboard' ? this.angle + Math.PI / 2 : this.angle - Math.PI / 2;
      const sideAlignment = Math.abs(normalizeAngle(targetAngle - broadsideAngle));
      const withinDistance = distToTarget > 80;

      // Allow firing when reasonably close to broadside angle (within ~45 degrees)
      // Ships fire more rapidly when better aligned, but can still shoot when not perfect
      const maxAlignmentAngle = Math.PI / 4; // 45 degrees in radians
      if (sideAlignment < maxAlignmentAngle && withinDistance) {
        fire = true;
      }
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

function blendAngles(a: number, b: number, t: number): number {
  return normalizeAngle(a + normalizeAngle(b - a) * Math.max(0, Math.min(1, t)));
}
